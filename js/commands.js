// Linux command implementations

import { expandCharSet, parseRangeSpec, parseCommand, splitPipeline } from './utils.js';

// ---------------------------------------------------------------------------
// awk (simplified subset)
// Supports: -F'sep', patterns (/regex/, comparisons, NR/NF/$n expressions),
// BEGIN/END blocks, print with expressions ($1, $NF, NR, NF, arithmetic,
// string concatenation, "literals"), variable assignment (sum += $3, count++).
// ---------------------------------------------------------------------------

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
                if (src[i] === '\\') { s += src[i + 1]; i += 2; }
                else s += src[i++];
            }
            i++;
            toks.push({ t: 'str', v: s });
        } else if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(src[i + 1] || ''))) {
            let s = '';
            while (i < src.length && /[0-9.]/.test(src[i])) s += src[i++];
            toks.push({ t: 'num', v: parseFloat(s) });
        } else if (/[A-Za-z_]/.test(ch)) {
            let s = '';
            while (i < src.length && /[A-Za-z0-9_]/.test(src[i])) s += src[i++];
            toks.push({ t: 'id', v: s });
        } else if (ch === '$') {
            toks.push({ t: '$' }); i++;
        } else if (ch === '/' && prevAllowsRegex()) {
            let s = ''; i++;
            while (i < src.length && src[i] !== '/') {
                if (src[i] === '\\') { s += src[i] + (src[i + 1] || ''); i += 2; }
                else s += src[i++];
            }
            i++;
            toks.push({ t: 're', v: s });
        } else {
            const two = src.slice(i, i + 2);
            if (['==', '!=', '>=', '<=', '&&', '||', '!~'].includes(two)) {
                toks.push({ t: 'op', v: two }); i += 2;
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

function awkFmt(v) {
    if (typeof v === 'number') {
        if (Number.isInteger(v)) return String(v);
        return String(parseFloat(v.toPrecision(6)));
    }
    return String(v);
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
        if (!p) throw new Error('awk: unexpected end of expression');
        if (p.t === 'num') return { k: 'num', v: p.v };
        if (p.t === 'str') return { k: 'str', v: p.v };
        if (p.t === 'id') return { k: 'id', v: p.v };
        if (p.t === 're') return { k: 'regex', v: p.v };
        if (p.t === 'op' && p.v === '(') {
            const e = parseOr();
            if (!isOp(')')) throw new Error('awk: missing )');
            pos++;
            return e;
        }
        throw new Error(`awk: unexpected token "${p.v ?? p.t}"`);
    }

    const expr = parseOr();
    if (pos < toks.length) throw new Error('awk: could not parse expression');
    return expr;
}

function awkEval(node, ctx) {
    switch (node.k) {
        case 'num': return node.v;
        case 'str': return node.v;
        case 'regex': return new RegExp(node.v).test(ctx.line) ? 1 : 0;
        case 'id': {
            if (node.v === 'NR') return ctx.NR;
            if (node.v === 'NF') return ctx.NF;
            const v = ctx.vars[node.v];
            return v === undefined ? '' : v;
        }
        case 'field': {
            const n = Math.trunc(awkToNum(awkEval(node.e, ctx)));
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
                case '/': return b === 0 ? 0 : a / b;
                case '%': return b === 0 ? 0 : a % b;
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
                const x = String(a), y = String(b);
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
            const v = String(awkEval(node.l, ctx));
            const m = new RegExp(node.re).test(v);
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
        if (close === -1) throw new Error('awk: missing }');
        const action = program.slice(open + 1, close).trim();
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
    const reM = pattern.match(/^\/((?:\\.|[^/])*)\/$/);
    if (reM) return new RegExp(reM[1]).test(ctx.line);
    return awkTruthy(awkEvalSrc(pattern, ctx));
}

function awkExecAction(action, ctx, out) {
    for (let st of awkSplitTop(action, ';')) {
        st = st.trim();
        if (!st) continue;
        if (st === 'print') { out.push(ctx.line); continue; }
        if (/^print[\s(]/.test(st)) {
            const argsSrc = st.slice(5).trim();
            const vals = awkSplitTop(argsSrc, ',').map(e => awkFmt(awkEvalSrc(e.trim(), ctx)));
            out.push(vals.join(' '));
            continue;
        }
        let m = st.match(/^([A-Za-z_]\w*)\s*(\+\+|--)$/);
        if (m) {
            ctx.vars[m[1]] = awkToNum(ctx.vars[m[1]]) + (m[2] === '++' ? 1 : -1);
            continue;
        }
        m = st.match(/^([A-Za-z_]\w*)\s*(\+=|-=|\*=|\/=|=)\s*(.+)$/);
        if (m) {
            const val = awkEvalSrc(m[3], ctx);
            const cur = awkToNum(ctx.vars[m[1]]);
            switch (m[2]) {
                case '=': ctx.vars[m[1]] = val; break;
                case '+=': ctx.vars[m[1]] = cur + awkToNum(val); break;
                case '-=': ctx.vars[m[1]] = cur - awkToNum(val); break;
                case '*=': ctx.vars[m[1]] = cur * awkToNum(val); break;
                case '/=': ctx.vars[m[1]] = cur / awkToNum(val); break;
            }
            continue;
        }
        throw new Error(`awk: unsupported statement: ${st}`);
    }
}

// ---------------------------------------------------------------------------
// sed helpers
// ---------------------------------------------------------------------------

function sedSubstitute(script, lines) {
    const d = script[1];
    const parts = [];
    let cur = '', esc = false;
    for (let i = 2; i < script.length; i++) {
        const ch = script[i];
        if (esc) { cur += '\\' + ch; esc = false; }
        else if (ch === '\\') esc = true;
        else if (ch === d) { parts.push(cur); cur = ''; }
        else cur += ch;
    }
    parts.push(cur);
    if (parts.length < 2) throw new Error('sed: bad substitution syntax');

    const search = parts[0];
    const replace = parts[1];
    const flagsStr = parts[2] || '';
    const reFlags = (flagsStr.includes('g') ? 'g' : '') + (flagsStr.includes('i') ? 'i' : '');

    let regex;
    try {
        regex = new RegExp(search, reFlags);
    } catch (e) {
        throw new Error(`sed: invalid pattern: ${search}`);
    }

    // Convert sed replacement syntax to JS: \1 -> $1, & -> $&, \& -> literal &
    const jsRepl = replace
        .replace(/\$/g, '$$$$')
        .replace(/\\&/g, ' ')
        .replace(/\\(\d)/g, '$$$1')
        .replace(/&/g, '$$&')
        .replace(/ /g, '&');

    return lines.map(l => l.replace(regex, jsRepl)).join('\n');
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

export const commands = {
    cat: (input, args) => {
        if (args.includes('-n')) {
            return input.split('\n').map((line, i) => `${String(i + 1).padStart(6)}\t${line}`).join('\n');
        }
        return input;
    },

    nl: (input, args) => {
        let counter = 1;
        return input.split('\n').map(line => {
            if (line.trim() === '') return line;
            return `${String(counter++).padStart(6)}\t${line}`;
        }).join('\n');
    },

    grep: (input, args) => {
        let pattern = null;
        const flags = { i: false, v: false, c: false, n: false, o: false, w: false, E: false };

        for (const arg of args) {
            if (arg.startsWith('-') && arg.length > 1 && isNaN(arg.slice(1))) {
                for (const ch of arg.slice(1)) {
                    if (ch in flags) flags[ch] = true;
                }
            } else if (pattern === null) {
                pattern = arg;
            }
        }

        if (pattern === null || pattern === '') return input;

        let source = pattern;
        if (flags.w) source = `\\b(?:${source})\\b`;

        let regex;
        try {
            regex = new RegExp(source, flags.i ? 'gi' : 'g');
        } catch (e) {
            throw new Error(`grep: invalid pattern: ${pattern}`);
        }

        const lines = input.split('\n');
        const results = [];
        let matchedLines = 0;

        lines.forEach((line, index) => {
            regex.lastIndex = 0;
            const matches = line.match(regex);
            const hasMatch = matches !== null;

            if (flags.v ? !hasMatch : hasMatch) {
                matchedLines++;
                if (flags.o && matches) {
                    results.push(...matches);
                } else if (flags.n) {
                    results.push(`${index + 1}:${line}`);
                } else {
                    results.push(line);
                }
            }
        });

        if (flags.c) return String(matchedLines);

        return results.join('\n');
    },

    head: (input, args) => {
        let n = 10;
        let chars = null;
        for (let i = 0; i < args.length; i++) {
            const arg = args[i];
            if (arg === '-n') n = parseInt(args[++i]);
            else if (arg.startsWith('-n')) n = parseInt(arg.slice(2));
            else if (arg === '-c') chars = parseInt(args[++i]);
            else if (arg.startsWith('-c')) chars = parseInt(arg.slice(2));
            else if (/^-\d+$/.test(arg)) n = parseInt(arg.slice(1));
        }
        if (chars !== null && !isNaN(chars)) return input.slice(0, chars);
        if (isNaN(n)) n = 10;
        return input.split('\n').slice(0, n).join('\n');
    },

    tail: (input, args) => {
        let n = 10;
        let fromStart = false;
        for (let i = 0; i < args.length; i++) {
            const arg = args[i];
            let val = null;
            if (arg === '-n') val = args[++i];
            else if (arg.startsWith('-n')) val = arg.slice(2);
            else if (/^-\d+$/.test(arg)) val = arg.slice(1);
            else if (/^\+\d+$/.test(arg)) val = arg;

            if (val !== null && val !== undefined && val !== '') {
                if (String(val).startsWith('+')) {
                    fromStart = true;
                    n = parseInt(String(val).slice(1));
                } else {
                    fromStart = false;
                    n = parseInt(val);
                }
            }
        }
        if (isNaN(n)) n = 10;
        const lines = input.split('\n');
        return fromStart ? lines.slice(Math.max(0, n - 1)).join('\n') : lines.slice(-n).join('\n');
    },

    wc: (input, args) => {
        const lines = input.split('\n');
        const lineNum = lines.length;
        const words = input.trim() ? input.trim().split(/\s+/).length : 0;
        const chars = input.length;

        const fl = new Set();
        for (const a of args) {
            if (a.startsWith('-')) for (const c of a.slice(1)) fl.add(c);
        }

        const parts = [];
        if (fl.has('l')) parts.push(lineNum);
        if (fl.has('w')) parts.push(words);
        if (fl.has('c') || fl.has('m')) parts.push(chars);

        if (parts.length === 0) return `${lineNum} ${words} ${chars}`;
        return parts.join(' ');
    },

    sort: (input, args) => {
        let numeric = false, reverse = false, unique = false, ignoreCase = false;
        let delimiter = null;
        let keyField = null;

        for (let i = 0; i < args.length; i++) {
            const arg = args[i];
            if (!arg.startsWith('-') || arg.length === 1) continue;
            let rest = arg.slice(1);
            while (rest.length) {
                const c = rest[0];
                if (c === 't') {
                    delimiter = rest.length > 1 ? rest.slice(1) : args[++i];
                    rest = '';
                } else if (c === 'k') {
                    const v = rest.length > 1 ? rest.slice(1) : (args[++i] || '');
                    keyField = parseInt(v) - 1;
                    if (/n/.test(v)) numeric = true;
                    if (/r/.test(v)) reverse = true;
                    rest = '';
                } else {
                    if (c === 'n') numeric = true;
                    else if (c === 'r') reverse = true;
                    else if (c === 'u') unique = true;
                    else if (c === 'f') ignoreCase = true;
                    rest = rest.slice(1);
                }
            }
        }

        let lines = input.split('\n');

        const keyOf = (line) => {
            if (delimiter !== null && keyField !== null && keyField >= 0) {
                return line.split(delimiter)[keyField] ?? '';
            }
            if (keyField !== null && keyField >= 0) {
                const parts = line.trim().split(/\s+/);
                return parts[keyField] ?? '';
            }
            return line;
        };

        const cmp = (a, b) => {
            const ka = keyOf(a), kb = keyOf(b);
            let r;
            if (numeric) {
                const na = parseFloat(ka) || 0;
                const nb = parseFloat(kb) || 0;
                r = na < nb ? -1 : na > nb ? 1 : 0;
            } else if (ignoreCase) {
                r = ka.toLowerCase().localeCompare(kb.toLowerCase());
            } else {
                r = ka.localeCompare(kb);
            }
            // last-resort comparison on the whole line (GNU sort behaviour)
            if (r === 0 && ka !== a) r = a.localeCompare(b);
            return reverse ? -r : r;
        };

        lines.sort(cmp);

        if (unique) lines = [...new Set(lines)];

        return lines.join('\n');
    },

    uniq: (input, args) => {
        const fl = new Set();
        for (const a of args) {
            if (a.startsWith('-')) for (const c of a.slice(1)) fl.add(c);
        }
        const countMode = fl.has('c');
        const duplicatesOnly = fl.has('d');
        const uniqueOnly = fl.has('u');
        const ignoreCase = fl.has('i');

        const lines = input.split('\n');
        const counts = [];
        let prev = null;
        let count = 0;

        const same = (a, b) => ignoreCase ? a.toLowerCase() === b.toLowerCase() : a === b;

        for (const line of lines) {
            if (prev !== null && same(line, prev)) {
                count++;
            } else {
                if (prev !== null) counts.push({ line: prev, count });
                prev = line;
                count = 1;
            }
        }
        if (prev !== null) counts.push({ line: prev, count });

        const result = [];
        for (const item of counts) {
            if (duplicatesOnly && item.count < 2) continue;
            if (uniqueOnly && item.count > 1) continue;

            if (countMode) {
                result.push(`${String(item.count).padStart(7)} ${item.line}`);
            } else {
                result.push(item.line);
            }
        }

        return result.join('\n');
    },

    cut: (input, args) => {
        let delimiter = '\t';
        let fields = null;
        let chars = null;

        for (let i = 0; i < args.length; i++) {
            const arg = args[i];
            if (arg === '-d' && args[i + 1] !== undefined) {
                delimiter = args[++i];
            } else if (arg.startsWith('-d')) {
                delimiter = arg.slice(2);
            } else if (arg === '-f' && args[i + 1] !== undefined) {
                fields = args[++i];
            } else if (arg.startsWith('-f')) {
                fields = arg.slice(2);
            } else if (arg === '-c' && args[i + 1] !== undefined) {
                chars = args[++i];
            } else if (arg.startsWith('-c')) {
                chars = arg.slice(2);
            }
        }

        return input.split('\n').map(line => {
            if (chars) {
                return parseRangeSpec(chars, line.length).map(i => line[i - 1] || '').join('');
            }
            if (fields) {
                // Real cut prints lines without the delimiter untouched
                if (!line.includes(delimiter)) return line;
                const parts = line.split(delimiter);
                return parseRangeSpec(fields, parts.length)
                    .filter(i => i <= parts.length)
                    .map(i => parts[i - 1] ?? '')
                    .join(delimiter);
            }
            return line;
        }).join('\n');
    },

    tr: (input, args) => {
        const deleteMode = args.includes('-d');
        const squeezeMode = args.includes('-s');

        const nonFlagArgs = args.filter(a => !a.startsWith('-') || a.length === 1);

        const squeeze = (text, set) => {
            let result = '';
            let prevCh = '';
            for (const c of text) {
                if (set.includes(c) && c === prevCh) continue;
                result += c;
                prevCh = c;
            }
            return result;
        };

        if (deleteMode && nonFlagArgs.length >= 1) {
            const set1 = expandCharSet(nonFlagArgs[0]);
            return input.split('').filter(c => !set1.includes(c)).join('');
        }

        if (nonFlagArgs.length >= 2) {
            const set1 = expandCharSet(nonFlagArgs[0]);
            const set2 = expandCharSet(nonFlagArgs[1]);

            let result = input.split('').map(c => {
                const idx = set1.indexOf(c);
                if (idx !== -1 && idx < set2.length) return set2[idx];
                if (idx !== -1) return set2[set2.length - 1];
                return c;
            }).join('');

            if (squeezeMode) result = squeeze(result, set2);
            return result;
        }

        if (squeezeMode && nonFlagArgs.length >= 1) {
            return squeeze(input, expandCharSet(nonFlagArgs[0]));
        }

        return input;
    },

    rev: (input) => {
        return input.split('\n').map(line => line.split('').reverse().join('')).join('\n');
    },

    tac: (input) => {
        return input.split('\n').reverse().join('\n');
    },

    paste: (input, args) => {
        let serial = false;
        let delim = '\t';
        for (let i = 0; i < args.length; i++) {
            const a = args[i];
            if (!a.startsWith('-')) continue;
            let rest = a.slice(1);
            while (rest.length) {
                const c = rest[0];
                if (c === 's') { serial = true; rest = rest.slice(1); }
                else if (c === 'd') {
                    if (rest.length > 1) { delim = rest.slice(1); rest = ''; }
                    else { delim = args[++i] ?? '\t'; rest = ''; }
                } else rest = rest.slice(1);
            }
        }
        delim = delim.replace(/\\n/g, '\n').replace(/\\t/g, '\t');
        if (serial) return input.split('\n').join(delim);
        return input;
    },

    sed: (input, args) => {
        let suppress = false;
        const rest = [];
        for (const a of args) {
            if (a === '-n') suppress = true;
            else if (a === '-e' || a === '-E' || a === '-r') continue;
            else rest.push(a);
        }
        const script = rest.join(' ').trim();
        const lines = input.split('\n');
        const total = lines.length;

        if (/^s./.test(script)) {
            return sedSubstitute(script, lines);
        }

        // Address commands: /re/d, Nd, N,Md, $d, and p variants
        const m = script.match(/^(?:\/((?:\\.|[^/])*)\/|(\d+|\$))(?:,(\d+|\$))?([pd])$/);
        if (m) {
            const [, re1, n1, n2, cmd] = m;
            let sel;
            if (re1 !== undefined) {
                let re;
                try { re = new RegExp(re1); } catch (e) { throw new Error(`sed: invalid pattern: ${re1}`); }
                sel = (line) => re.test(line);
            } else {
                const start = n1 === '$' ? total : parseInt(n1);
                const end = n2 === undefined ? start : (n2 === '$' ? total : parseInt(n2));
                sel = (line, i) => (i + 1) >= start && (i + 1) <= end;
            }
            if (cmd === 'd') {
                return lines.filter((l, i) => !sel(l, i)).join('\n');
            }
            // p
            if (suppress) {
                return lines.filter((l, i) => sel(l, i)).join('\n');
            }
            return lines.flatMap((l, i) => sel(l, i) ? [l, l] : [l]).join('\n');
        }

        throw new Error(`sed: unsupported script: ${script}`);
    },

    awk: (input, args) => {
        let fsStr = null;
        const progParts = [];
        for (let i = 0; i < args.length; i++) {
            const a = args[i];
            if (a === '-F') fsStr = args[++i];
            else if (a.startsWith('-F') && a.length > 2) fsStr = a.slice(2);
            else progParts.push(a);
        }
        const program = progParts.join(' ').trim();
        if (!program) return input;

        const rules = awkSplitRules(program);
        const vars = Object.create(null);
        const out = [];
        const lines = input.split('\n');

        const mkCtx = (line, nr) => {
            let fields;
            if (fsStr !== null && fsStr !== undefined) {
                fields = line.split(fsStr);
            } else {
                fields = line.trim() === '' ? [] : line.trim().split(/\s+/);
            }
            return { line, fields, NR: nr, NF: fields.length, vars };
        };

        for (const r of rules) {
            if (r.when === 'BEGIN') awkExecAction(r.action, mkCtx('', 0), out);
        }

        lines.forEach((line, idx) => {
            const ctx = mkCtx(line, idx + 1);
            for (const r of rules) {
                if (r.when !== 'main') continue;
                if (awkMatchPattern(r.pattern, ctx)) awkExecAction(r.action, ctx, out);
            }
        });

        const endCtx = mkCtx('', lines.length);
        for (const r of rules) {
            if (r.when === 'END') awkExecAction(r.action, endCtx, out);
        }

        return out.join('\n');
    }
};

export function executePipeline(input, pipeline) {
    if (typeof pipeline === 'string') {
        pipeline = splitPipeline(pipeline);
    }
    let result = input;

    for (const cmdStr of pipeline) {
        const { cmd, args } = parseCommand(cmdStr.trim());

        if (!commands[cmd]) {
            throw new Error(`Unknown command: ${cmd}`);
        }

        result = commands[cmd](result, args);
    }

    return result;
}
