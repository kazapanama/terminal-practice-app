// awk (simplified subset)
// Supports: -F'sep', patterns (/regex/, comparisons, NR/NF/$n expressions),
// BEGIN/END blocks, print with expressions ($1, $NF, NR, NF, arithmetic,
// string concatenation, "literals"), variable assignment (sum += $3, count++).
// Anything outside the subset is reported as "not supported" instead of
// silently producing a different result than real awk.

import { posixRegExp } from './regex.js';
import { toLines, fromLines } from './utils.js';

const BUILTIN_FUNCTIONS = new Set([
    'length', 'substr', 'index', 'split', 'sub', 'gsub', 'match', 'sprintf',
    'toupper', 'tolower', 'int', 'sqrt', 'exp', 'log', 'sin', 'cos', 'atan2',
    'rand', 'srand', 'system', 'close', 'getline', 'fflush'
]);
const KEYWORDS = new Set(['if', 'else', 'for', 'while', 'do', 'next', 'exit', 'delete', 'in', 'function', 'return']);

function unsupported(what) {
    return new Error(`awk: ${what} is not supported in this trainer`);
}

const regexCache = new Map();
function awkRegex(src) {
    if (!regexCache.has(src)) {
        regexCache.set(src, posixRegExp(src, { mode: 'extended', tool: 'awk' }));
    }
    return regexCache.get(src);
}

function awkLex(src) {
    const toks = [];
    let i = 0;
    const prevAllowsRegex = () => {
        const p = toks[toks.length - 1];
        if (!p) return true;
        if (p.t === 'op' && p.v !== ')') return true;
        return false;
    };
    while (i < src.length) {
        const ch = src[i];
        if (ch === ' ' || ch === '\t') { i++; continue; }
        if (ch === '"') {
            let s = ''; i++;
            while (i < src.length && src[i] !== '"') {
                if (src[i] === '\\') {
                    const n = src[i + 1];
                    s += n === 'n' ? '\n' : n === 't' ? '\t' : n;
                    i += 2;
                } else s += src[i++];
            }
            if (i >= src.length) throw new Error('awk: unterminated string');
            i++;
            toks.push({ t: 'str', v: s });
        } else if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(src[i + 1] || ''))) {
            let s = '';
            while (i < src.length && /[0-9.]/.test(src[i])) s += src[i++];
            toks.push({ t: 'num', v: parseFloat(s) });
        } else if (/[A-Za-z_]/.test(ch)) {
            let s = '';
            while (i < src.length && /[A-Za-z0-9_]/.test(src[i])) s += src[i++];
            if (BUILTIN_FUNCTIONS.has(s)) throw unsupported(`the function ${s}()`);
            if (KEYWORDS.has(s)) throw unsupported(`"${s}"`);
            if (s === 'printf') throw unsupported('printf');
            toks.push({ t: 'id', v: s });
        } else if (ch === '$') {
            toks.push({ t: '$' }); i++;
        } else if (ch === '[') {
            throw unsupported('arrays (name[key])');
        } else if (ch === '/' && prevAllowsRegex()) {
            let s = ''; i++;
            while (i < src.length && src[i] !== '/') {
                if (src[i] === '\\') { s += src[i] + (src[i + 1] || ''); i += 2; }
                else s += src[i++];
            }
            if (i >= src.length) throw new Error('awk: unterminated regexp');
            i++;
            toks.push({ t: 're', v: s.replace(/\\\//g, '/') });
        } else {
            const two = src.slice(i, i + 2);
            if (['==', '!=', '>=', '<=', '&&', '||', '!~'].includes(two)) {
                toks.push({ t: 'op', v: two }); i += 2;
            } else if (two === '++' || two === '--' || two === '+=' || two === '-=') {
                throw new Error(`awk: syntax error: unexpected "${two}" in expression`);
            } else {
                toks.push({ t: 'op', v: ch }); i++;
            }
        }
    }
    return toks;
}

function awkIsNum(v) {
    if (typeof v === 'number') return true;
    return v !== '' && v !== null && v !== undefined && !isNaN(v);
}

function awkToNum(v) {
    if (typeof v === 'number') return v;
    const n = parseFloat(v);
    return isNaN(n) ? 0 : n;
}

// C's printf rounds exact ties to even (411522.5 -> 411522); JS rounds up.
function roundHalfEven(v, precision) {
    const exp = Number(v.toExponential(precision - 1).split('e')[1]);
    const shift = precision - 1 - exp;
    const scaled = shift >= 0 ? v * 10 ** shift : v / 10 ** -shift;
    if (Math.abs(scaled) < 2 ** 52 && Math.abs(scaled % 1) === 0.5) {
        const lower = Math.floor(scaled);
        const even = lower % 2 === 0 ? lower : lower + 1;
        return shift >= 0 ? even / 10 ** shift : even * 10 ** -shift;
    }
    return v;
}

// Number -> string the way awk prints it (OFMT "%.6g", integers as-is)
export function awkFmt(v) {
    if (typeof v !== 'number') return String(v);
    if (Number.isInteger(v) && Math.abs(v) < 1e16) return String(v);
    if (!isFinite(v)) return v > 0 ? 'inf' : v < 0 ? '-inf' : 'nan';
    v = roundHalfEven(v, 6);
    const [mant, expStr] = v.toExponential(5).split('e');
    const exp = Number(expStr);
    if (exp < -4 || exp >= 6) {
        const m = mant.includes('.') ? mant.replace(/\.?0+$/, '') : mant;
        return `${m}e${exp < 0 ? '-' : '+'}${String(Math.abs(exp)).padStart(2, '0')}`;
    }
    return String(parseFloat(v.toFixed(Math.max(0, 5 - exp))));
}

function awkParse(toks) {
    let pos = 0;
    const peek = () => toks[pos];
    const isOp = (v) => peek() && peek().t === 'op' && peek().v === v;

    function parseOr() {
        let l = parseAnd();
        while (isOp('||')) { pos++; const r = parseAnd(); l = { k: 'bin', op: '||', l, r }; }
        return l;
    }
    function parseAnd() {
        let l = parseCmp();
        while (isOp('&&')) { pos++; const r = parseCmp(); l = { k: 'bin', op: '&&', l, r }; }
        return l;
    }
    function parseCmp() {
        const l = parseConcat();
        const p = peek();
        if (p && p.t === 'op' && ['==', '!=', '<', '<=', '>', '>='].includes(p.v)) {
            pos++;
            const r = parseConcat();
            return { k: 'cmp', op: p.v, l, r };
        }
        if (p && p.t === 'op' && (p.v === '~' || p.v === '!~')) {
            pos++;
            const re = toks[pos++];
            if (!re || (re.t !== 're' && re.t !== 'str')) throw new Error('awk: expected /regex/ after ~');
            return { k: 'match', neg: p.v === '!~', l, re: re.v };
        }
        return l;
    }
    function startsOperand() {
        const p = peek();
        if (!p) return false;
        return p.t === 'num' || p.t === 'str' || p.t === 'id' || p.t === '$' ||
            (p.t === 'op' && p.v === '(');
    }
    function parseConcat() {
        const parts = [parseAdd()];
        while (startsOperand()) parts.push(parseAdd());
        return parts.length === 1 ? parts[0] : { k: 'concat', parts };
    }
    function parseAdd() {
        let l = parseMul();
        while (peek() && peek().t === 'op' && (peek().v === '+' || peek().v === '-')) {
            const op = toks[pos++].v;
            const r = parseMul();
            l = { k: 'arith', op, l, r };
        }
        return l;
    }
    function parseMul() {
        let l = parseUnary();
        while (peek() && peek().t === 'op' && ['*', '/', '%'].includes(peek().v)) {
            const op = toks[pos++].v;
            const r = parseUnary();
            l = { k: 'arith', op, l, r };
        }
        return l;
    }
    function parseUnary() {
        const p = peek();
        if (p && p.t === 'op' && p.v === '-') { pos++; return { k: 'neg', e: parseUnary() }; }
        if (p && p.t === 'op' && p.v === '!') { pos++; return { k: 'not', e: parseUnary() }; }
        if (p && p.t === '$') { pos++; return { k: 'field', e: parseUnary() }; }
        return parsePrimary();
    }
    function parsePrimary() {
        const p = toks[pos++];
        if (!p) throw new Error('awk: syntax error: unexpected end of expression');
        if (p.t === 'num') return { k: 'num', v: p.v };
        if (p.t === 'str') return { k: 'str', v: p.v };
        if (p.t === 'id') return { k: 'id', v: p.v };
        if (p.t === 're') return { k: 'regex', v: p.v };
        if (p.t === 'op' && p.v === '(') {
            const e = parseOr();
            if (!isOp(')')) throw new Error('awk: syntax error: missing )');
            pos++;
            return e;
        }
        throw new Error(`awk: syntax error at "${p.v ?? p.t}"`);
    }

    const expr = parseOr();
    if (pos < toks.length) throw new Error(`awk: syntax error at "${toks[pos].v ?? toks[pos].t}"`);
    return expr;
}

function awkEval(node, ctx) {
    switch (node.k) {
        case 'num': return node.v;
        case 'str': return node.v;
        case 'regex': return awkRegex(node.v).test(ctx.line) ? 1 : 0;
        case 'id': {
            if (node.v === 'NR') return ctx.NR;
            if (node.v === 'NF') return ctx.NF;
            const v = ctx.vars[node.v];
            return v === undefined ? '' : v;
        }
        case 'field': {
            const n = Math.trunc(awkToNum(awkEval(node.e, ctx)));
            if (n < 0) throw new Error(`awk: trying to access out of range field ${n}`);
            if (n === 0) return ctx.line;
            return ctx.fields[n - 1] ?? '';
        }
        case 'neg': return -awkToNum(awkEval(node.e, ctx));
        case 'not': return awkTruthy(awkEval(node.e, ctx)) ? 0 : 1;
        case 'arith': {
            const a = awkToNum(awkEval(node.l, ctx));
            const b = awkToNum(awkEval(node.r, ctx));
            switch (node.op) {
                case '+': return a + b;
                case '-': return a - b;
                case '*': return a * b;
                case '/':
                    if (b === 0) throw new Error('awk: fatal: division by zero attempted');
                    return a / b;
                case '%':
                    if (b === 0) throw new Error('awk: fatal: division by zero attempted in `%\'');
                    return a % b;
            }
            return 0;
        }
        case 'concat': return node.parts.map(p => awkFmt(awkEval(p, ctx))).join('');
        case 'cmp': {
            const a = awkEval(node.l, ctx);
            const b = awkEval(node.r, ctx);
            let r;
            if (awkIsNum(a) && awkIsNum(b)) {
                const x = awkToNum(a), y = awkToNum(b);
                r = x < y ? -1 : x > y ? 1 : 0;
            } else {
                const x = awkFmt(a), y = awkFmt(b);
                r = x < y ? -1 : x > y ? 1 : 0;
            }
            switch (node.op) {
                case '==': return r === 0 ? 1 : 0;
                case '!=': return r !== 0 ? 1 : 0;
                case '<': return r < 0 ? 1 : 0;
                case '<=': return r <= 0 ? 1 : 0;
                case '>': return r > 0 ? 1 : 0;
                case '>=': return r >= 0 ? 1 : 0;
            }
            return 0;
        }
        case 'match': {
            const v = awkFmt(awkEval(node.l, ctx));
            const m = awkRegex(node.re).test(v);
            return (node.neg ? !m : m) ? 1 : 0;
        }
        case 'bin': {
            const a = awkTruthy(awkEval(node.l, ctx));
            if (node.op === '&&') return a && awkTruthy(awkEval(node.r, ctx)) ? 1 : 0;
            return a || awkTruthy(awkEval(node.r, ctx)) ? 1 : 0;
        }
    }
    return '';
}

function awkTruthy(v) {
    return typeof v === 'number' ? v !== 0 : v !== '';
}

function awkEvalSrc(src, ctx) {
    return awkEval(awkParse(awkLex(src)), ctx);
}

// Split on a separator at top level (not inside "quotes" or parentheses)
function awkSplitTop(src, sep) {
    const parts = [];
    let cur = '', depth = 0, inStr = false;
    for (let i = 0; i < src.length; i++) {
        const ch = src[i];
        if (inStr) {
            cur += ch;
            if (ch === '\\') { cur += src[i + 1] || ''; i++; }
            else if (ch === '"') inStr = false;
        } else if (ch === '"') { inStr = true; cur += ch; }
        else if (ch === '(') { depth++; cur += ch; }
        else if (ch === ')') { depth--; cur += ch; }
        else if (ch === sep && depth === 0) { parts.push(cur); cur = ''; }
        else cur += ch;
    }
    parts.push(cur);
    return parts;
}

function awkSplitRules(program) {
    const rules = [];
    let i = 0;
    while (i < program.length) {
        const open = program.indexOf('{', i);
        if (open === -1) {
            const rest = program.slice(i).trim();
            if (rest) rules.push({ pattern: rest, action: 'print' });
            break;
        }
        const pattern = program.slice(i, open).trim();
        const close = program.indexOf('}', open);
        if (close === -1) throw new Error('awk: syntax error: missing }');
        const action = program.slice(open + 1, close).trim();
        if (action.includes('{')) throw unsupported('nested { } blocks');
        rules.push({ pattern, action });
        i = close + 1;
    }
    return rules.map(r => {
        if (r.pattern === 'BEGIN') return { when: 'BEGIN', pattern: '', action: r.action };
        if (r.pattern === 'END') return { when: 'END', pattern: '', action: r.action };
        return { when: 'main', pattern: r.pattern, action: r.action };
    });
}

function awkMatchPattern(pattern, ctx) {
    if (!pattern) return true;
    if (pattern.includes(',') && !pattern.includes('"')) throw unsupported('range patterns (pat1, pat2)');
    return awkTruthy(awkEvalSrc(pattern, ctx));
}

// In `print a > b` the > is a redirection, not a comparison (unless it is
// inside parentheses).
function hasTopLevelRedirect(src) {
    const s = src.replace(/"(\\.|[^"\\])*"/g, '""');
    let depth = 0;
    for (let i = 0; i < s.length; i++) {
        const ch = s[i];
        if (ch === '(') depth++;
        else if (ch === ')') depth--;
        else if (depth === 0 && ch === '|' && s[i + 1] !== '|' && s[i - 1] !== '|') return true;
        else if (depth === 0 && ch === '>' && s[i + 1] !== '=') return true;
    }
    return false;
}

function awkExecAction(action, ctx, out) {
    for (let st of awkSplitTop(action.replace(/\n/g, ';'), ';')) {
        st = st.trim();
        if (!st) continue;
        if (st === 'print') { out.push(ctx.line); continue; }
        if (/^print[\s(]/.test(st)) {
            let argsSrc = st.slice(5).trim();
            if (/^\(.*\)$/.test(argsSrc) && awkSplitTop(argsSrc.slice(1, -1), ',').length > 1) {
                argsSrc = argsSrc.slice(1, -1);
            }
            if (hasTopLevelRedirect(argsSrc)) throw unsupported('output redirection in print (> file, | cmd)');
            const vals = awkSplitTop(argsSrc, ',').map(e => awkFmt(awkEvalSrc(e.trim(), ctx)));
            out.push(vals.join(' '));
            continue;
        }
        let m = st.match(/^([A-Za-z_]\w*)\s*(\+\+|--)$/) || st.match(/^(\+\+|--)\s*([A-Za-z_]\w*)$/);
        if (m) {
            const name = m[1].startsWith('+') || m[1].startsWith('-') ? m[2] : m[1];
            const op = m[1].startsWith('+') || m[1].startsWith('-') ? m[1] : m[2];
            ctx.vars[name] = awkToNum(ctx.vars[name]) + (op === '++' ? 1 : -1);
            continue;
        }
        m = st.match(/^([A-Za-z_]\w*)\s*(\+=|-=|\*=|\/=|%=|=)(?!=)\s*(.+)$/);
        if (m) {
            if (m[1] === 'NR' || m[1] === 'NF') throw unsupported(`assigning to ${m[1]}`);
            const val = awkEvalSrc(m[3], ctx);
            const cur = awkToNum(ctx.vars[m[1]]);
            switch (m[2]) {
                case '=': ctx.vars[m[1]] = val; break;
                case '+=': ctx.vars[m[1]] = cur + awkToNum(val); break;
                case '-=': ctx.vars[m[1]] = cur - awkToNum(val); break;
                case '*=': ctx.vars[m[1]] = cur * awkToNum(val); break;
                case '/=': ctx.vars[m[1]] = cur / awkToNum(val); break;
                case '%=': ctx.vars[m[1]] = cur % awkToNum(val); break;
            }
            continue;
        }
        if (/^\$/.test(st) && /[^=!<>]=[^=]/.test(st)) throw unsupported('assigning to fields ($n = ...)');
        // A bare expression is legal awk but has no visible effect; evaluate
        // it so syntax errors still surface.
        awkEvalSrc(st, ctx);
    }
}

// FS semantics: " " = runs of blanks (default), a single other character is
// literal, anything longer is an extended regex.
function makeSplitter(fs) {
    if (fs === null || fs === ' ') {
        return line => (line.trim() === '' ? [] : line.trim().split(/[ \t]+/));
    }
    const sep = fs === '\\t' || fs === 't' ? '\t' : fs;
    if (sep.length === 1 && sep !== '\\') {
        return line => (line === '' ? [] : line.split(sep));
    }
    const re = posixRegExp(sep, { mode: 'extended', tool: 'awk' });
    return line => (line === '' ? [] : line.split(new RegExp(re.source, 'g')));
}

export function awk(input, args) {
    let fs = null;
    let i = 0;
    for (; i < args.length; i++) {
        const a = args[i];
        if (a === '--') { i++; break; }
        if (a === '-F') {
            if (i + 1 >= args.length) throw new Error("awk: option requires an argument -- 'F'");
            fs = args[++i];
        } else if (a.startsWith('-F')) {
            fs = a.slice(2);
        } else if (a.startsWith('-v') || a.startsWith('-f')) {
            throw unsupported(`the option ${a.slice(0, 2)}`);
        } else if (a.startsWith('-') && a.length > 1) {
            throw new Error(`awk: invalid option -- '${a[1]}' (not supported in this trainer)`);
        } else {
            break;
        }
    }
    const program = args[i];
    const files = args.slice(i + 1);
    if (program === undefined) throw new Error("usage: awk [-F fs] 'program' — the program is missing");
    for (const f of files) {
        if (f !== '-') throw new Error(`awk: fatal: cannot open file \`${f}' for reading: No such file or directory`);
    }
    if (!program.trim()) return '';

    const rules = awkSplitRules(program.trim());
    const split = makeSplitter(fs);
    const vars = Object.create(null);
    const out = [];
    const lines = toLines(input);

    const mkCtx = (line, nr) => {
        const fields = split(line);
        return { line, fields, NR: nr, NF: fields.length, vars };
    };

    for (const r of rules) {
        if (r.when === 'BEGIN') awkExecAction(r.action, mkCtx('', 0), out);
    }

    const hasMain = rules.some(r => r.when !== 'BEGIN');
    if (hasMain) {
        lines.forEach((line, idx) => {
            const ctx = mkCtx(line, idx + 1);
            for (const r of rules) {
                if (r.when !== 'main') continue;
                if (awkMatchPattern(r.pattern, ctx)) awkExecAction(r.action, ctx, out);
            }
        });
    }

    const last = lines.length ? lines[lines.length - 1] : '';
    const endCtx = mkCtx(last, lines.length);
    for (const r of rules) {
        if (r.when === 'END') awkExecAction(r.action, endCtx, out);
    }

    return fromLines(out);
}
