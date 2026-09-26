// awk interpreter: POSIX awk plus the common gawk conveniences.
//
// Supports patterns and ranges, BEGIN/END, all statements (if/else, while,
// do, for, for-in, break, continue, next, exit, delete, return), arrays
// (including multi-dimensional keys), user-defined functions, printf and
// sprintf, the string/math built-ins, -F, -v and var=value operands,
// FS/OFS/ORS/RS/NR/NF/FNR/FILENAME/SUBSEP/RSTART/RLENGTH, field assignment,
// output redirection to files and `print | "command"`.
// getline and system() are reported as not supported.

import { posixRegExp } from './regex.js';
import { sprintf, formatG } from './printf.js';

const unsupported = (what) => new Error(`awk: ${what} is not supported in this trainer`);
const syntaxError = (msg) => new Error(`awk: syntax error: ${msg}`);

// ---------------------------------------------------------------------------
// Values: JS number, JS string, StrNum (input data that may look numeric) or
// UNINIT (an unset variable: both "" and 0)
// ---------------------------------------------------------------------------

const NUMERIC_RE = /^[ \t\n]*[-+]?(?:\d+\.?\d*(?:[eE][-+]?\d+)?|\.\d+(?:[eE][-+]?\d+)?)[ \t\n]*$/;
const PREFIX_RE = /^[ \t\n]*([-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)/;

class StrNum {
    constructor(s) {
        this.s = s;
        this.n = NUMERIC_RE.test(s) ? parseFloat(s) : null;
    }
}
const UNINIT = Object.freeze({ uninit: true });

// An unset variable passed to a function: becomes an array in the caller too
// if the function uses it as one
class LazyArray {
    constructor(scope, name) {
        this.scope = scope;
        this.name = name;
    }
}

function atof(s) {
    const m = s.match(PREFIX_RE);
    return m ? parseFloat(m[1]) : 0;
}

function toNum(v) {
    if (typeof v === 'number') return v;
    if (v === UNINIT || v === undefined) return 0;
    if (v instanceof StrNum) return v.n !== null ? v.n : atof(v.s);
    if (v instanceof Map) throw new Error('awk: fatal: attempt to use array in a scalar context');
    return atof(v);
}

function numToStr(n, fmt) {
    if (Number.isInteger(n)) return Math.abs(n) < 1e16 ? String(n) : BigInt(n).toString();
    if (!isFinite(n)) return Number.isNaN(n) ? 'nan' : n > 0 ? 'inf' : '-inf';
    if (fmt === '%.6g') return formatG(n, 6);
    return sprintf(fmt, [n]);
}

function toStr(v, fmt = '%.6g') {
    if (typeof v === 'string') return v;
    if (typeof v === 'number') return numToStr(v, fmt);
    if (v === UNINIT || v === undefined) return '';
    if (v instanceof StrNum) return v.s;
    if (v instanceof Map) throw new Error('awk: fatal: attempt to use array in a scalar context');
    return String(v);
}

function isNumeric(v) {
    return typeof v === 'number' || v === UNINIT || (v instanceof StrNum && v.n !== null);
}

function truthy(v) {
    if (typeof v === 'number') return v !== 0;
    if (v === UNINIT) return false;
    if (v instanceof StrNum) return v.n !== null ? v.n !== 0 : v.s !== '';
    return v !== '';
}

function compare(a, b, fmt) {
    if (isNumeric(a) && isNumeric(b)) {
        const x = toNum(a), y = toNum(b);
        return x < y ? -1 : x > y ? 1 : 0;
    }
    const x = toStr(a, fmt), y = toStr(b, fmt);
    return x < y ? -1 : x > y ? 1 : 0;
}

// ---------------------------------------------------------------------------
// Lexer
// ---------------------------------------------------------------------------

const KEYWORDS = new Set(['BEGIN', 'END', 'function', 'func', 'if', 'else', 'while', 'for', 'do', 'break',
    'continue', 'next', 'nextfile', 'exit', 'return', 'delete', 'in', 'getline', 'print', 'printf']);
const BUILTINS = new Set(['length', 'substr', 'index', 'split', 'sub', 'gsub', 'match', 'sprintf', 'sin',
    'cos', 'atan2', 'exp', 'log', 'sqrt', 'int', 'rand', 'srand', 'tolower', 'toupper', 'system', 'close', 'fflush']);
const OPERATORS = ['+=', '-=', '*=', '/=', '%=', '^=', '**=', '**', '==', '<=', '>=', '!=', '++', '--',
    '&&', '||', '>>', '!~', '!', '>', '<', '|', '?', ':', '~', '$', '(', ')', '[', ']', '{', '}', ',', ';',
    '+', '-', '*', '/', '%', '^', '='];
const STRING_ESCAPES = { n: '\n', t: '\t', r: '\r', '\\': '\\', '"': '"', '/': '/', a: '\x07', b: '\b', f: '\f', v: '\v' };

function lex(src) {
    const toks = [];
    let i = 0;
    // A "/" starts a regex unless it follows something that ends an operand
    const regexAllowed = () => {
        const p = toks[toks.length - 1];
        if (!p) return true;
        if (p.t === 'num' || p.t === 'str' || p.t === 'ere' || p.t === 'name' || p.t === 'builtin') return false;
        if (p.t === 'op' && [')', ']', '$', '++', '--'].includes(p.v)) return false;
        return true;
    };
    while (i < src.length) {
        const ch = src[i];
        if (ch === ' ' || ch === '\t' || ch === '\r') { i++; continue; }
        if (ch === '\\' && src[i + 1] === '\n') { i += 2; continue; }
        if (ch === '#') { while (i < src.length && src[i] !== '\n') i++; continue; }
        if (ch === '\n') { toks.push({ t: 'nl' }); i++; continue; }
        if (ch === '"') {
            let s = '';
            i++;
            while (i < src.length && src[i] !== '"') {
                if (src[i] === '\\' && i + 1 < src.length) {
                    const n = src[i + 1];
                    const oct = src.slice(i + 1).match(/^[0-7]{1,3}/);
                    if (oct) { s += String.fromCharCode(parseInt(oct[0], 8)); i += 1 + oct[0].length; continue; }
                    if (n === '\n') { i += 2; continue; }
                    s += STRING_ESCAPES[n] ?? n;
                    i += 2;
                } else if (src[i] === '\n') {
                    throw syntaxError('unterminated string');
                } else {
                    s += src[i++];
                }
            }
            if (i >= src.length) throw syntaxError('unterminated string');
            i++;
            toks.push({ t: 'str', v: s });
            continue;
        }
        if (ch === '/' && regexAllowed()) {
            let s = '';
            let inBracket = false;
            i++;
            while (i < src.length && (src[i] !== '/' || inBracket)) {
                const c = src[i];
                if (c === '\n') throw syntaxError('unterminated regexp');
                if (c === '\\' && i + 1 < src.length) {
                    s += src[i + 1] === '/' ? '/' : c + src[i + 1];
                    i += 2;
                    continue;
                }
                if (c === '[' && !inBracket) {
                    inBracket = true;
                    s += c;
                    i++;
                    if (src[i] === '^') { s += src[i++]; }
                    if (src[i] === ']') { s += src[i++]; }
                    continue;
                }
                if (c === '[' && src[i + 1] === ':') {
                    const close = src.indexOf(':]', i + 2);
                    if (close !== -1) { s += src.slice(i, close + 2); i = close + 2; continue; }
                }
                if (c === ']' && inBracket) inBracket = false;
                s += c;
                i++;
            }
            if (i >= src.length) throw syntaxError('unterminated regexp');
            i++;
            toks.push({ t: 'ere', v: s });
            continue;
        }
        if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(src[i + 1] || ''))) {
            const m = src.slice(i).match(/^(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/);
            toks.push({ t: 'num', v: parseFloat(m[0]) });
            i += m[0].length;
            continue;
        }
        if (/[A-Za-z_]/.test(ch)) {
            const m = src.slice(i).match(/^[A-Za-z_]\w*/);
            const word = m[0];
            i += word.length;
            if (KEYWORDS.has(word)) toks.push({ t: 'kw', v: word === 'func' ? 'function' : word });
            else if (BUILTINS.has(word)) toks.push({ t: 'builtin', v: word });
            else if (src[i] === '(') toks.push({ t: 'funcname', v: word });
            else toks.push({ t: 'name', v: word });
            continue;
        }
        const op = OPERATORS.find(o => src.startsWith(o, i));
        if (!op) throw syntaxError(`unexpected character '${ch}'`);
        toks.push({ t: 'op', v: op === '**' ? '^' : op === '**=' ? '^=' : op });
        i += op.length;
    }
    toks.push({ t: 'eof' });
    return toks;
}

// ---------------------------------------------------------------------------
// Parser -> AST
// ---------------------------------------------------------------------------

const ASSIGN_OPS = new Set(['=', '+=', '-=', '*=', '/=', '%=', '^=']);

class Parser {
    constructor(toks) {
        this.toks = toks;
        this.pos = 0;
        this.functions = new Map();
    }

    peek(o = 0) { return this.toks[this.pos + o]; }
    next() { return this.toks[this.pos++]; }
    isOp(v, o = 0) { const t = this.peek(o); return t.t === 'op' && t.v === v; }
    isKw(v) { const t = this.peek(); return t.t === 'kw' && t.v === v; }
    expectOp(v) {
        if (!this.isOp(v)) throw syntaxError(`expected "${v}" near ${this.describe()}`);
        this.pos++;
    }
    describe() {
        const t = this.peek();
        return t.t === 'eof' ? 'end of program' : t.t === 'nl' ? 'newline' : `"${t.v}"`;
    }
    skipNl() { while (this.peek().t === 'nl') this.pos++; }
    skipTerminators() { while (this.peek().t === 'nl' || this.isOp(';')) this.pos++; }

    program() {
        const items = [];
        this.skipTerminators();
        while (this.peek().t !== 'eof') {
            items.push(this.item());
            this.skipTerminators();
        }
        return { items, functions: this.functions };
    }

    item() {
        if (this.isKw('function')) {
            this.pos++;
            const nameTok = this.next();
            if (nameTok.t !== 'name' && nameTok.t !== 'funcname') throw syntaxError('function name expected');
            this.expectOp('(');
            const params = [];
            while (!this.isOp(')')) {
                const p = this.next();
                if (p.t !== 'name') throw syntaxError('parameter name expected');
                params.push(p.v);
                if (this.isOp(',')) { this.pos++; this.skipNl(); }
            }
            this.pos++;
            this.skipNl();
            this.functions.set(nameTok.v, { params, body: this.block() });
            return { kind: 'function' };
        }
        if (this.isKw('BEGIN')) { this.pos++; this.skipNl(); return { kind: 'BEGIN', body: this.block() }; }
        if (this.isKw('END')) { this.pos++; this.skipNl(); return { kind: 'END', body: this.block() }; }
        let pattern = null, pattern2 = null;
        if (!this.isOp('{')) {
            pattern = this.expr();
            if (this.isOp(',')) {
                this.pos++;
                this.skipNl();
                pattern2 = this.expr();
            }
        }
        const body = this.isOp('{') ? this.block() : null;
        return { kind: 'main', pattern, pattern2, body, inRange: false };
    }

    block() {
        this.expectOp('{');
        const stmts = [];
        this.skipTerminators();
        while (!this.isOp('}')) {
            if (this.peek().t === 'eof') throw syntaxError('missing }');
            stmts.push(this.statement());
            this.skipTerminators();
        }
        this.pos++;
        return { k: 'block', stmts };
    }

    endSimple() {
        const t = this.peek();
        if (t.t === 'nl' || t.t === 'eof' || this.isOp(';') || this.isOp('}')) {
            if (this.isOp(';') || t.t === 'nl') this.pos++;
            return;
        }
        throw syntaxError(`unexpected ${this.describe()}`);
    }

    // Statement used as the body of if/while/for
    body() {
        this.skipNl();
        if (this.isOp(';')) { this.pos++; return { k: 'block', stmts: [] }; }
        return this.statement();
    }

    statement() {
        const t = this.peek();
        if (this.isOp('{')) return this.block();
        if (this.isOp(';')) { this.pos++; return { k: 'block', stmts: [] }; }
        if (t.t === 'kw') {
            switch (t.v) {
                case 'if': {
                    this.pos++;
                    this.expectOp('(');
                    const cond = this.expr();
                    this.expectOp(')');
                    const then = this.body();
                    const save = this.pos;
                    this.skipTerminators();
                    if (this.isKw('else')) {
                        this.pos++;
                        return { k: 'if', cond, then, else: this.body() };
                    }
                    this.pos = save;
                    return { k: 'if', cond, then, else: null };
                }
                case 'while': {
                    this.pos++;
                    this.expectOp('(');
                    const cond = this.expr();
                    this.expectOp(')');
                    if (this.isOp(';')) { this.pos++; return { k: 'while', cond, body: { k: 'block', stmts: [] } }; }
                    return { k: 'while', cond, body: this.body() };
                }
                case 'do': {
                    this.pos++;
                    const body = this.body();
                    this.skipTerminators();
                    if (!this.isKw('while')) throw syntaxError('"while" expected after do');
                    this.pos++;
                    this.expectOp('(');
                    const cond = this.expr();
                    this.expectOp(')');
                    this.endSimple();
                    return { k: 'do', body, cond };
                }
                case 'for': {
                    this.pos++;
                    this.expectOp('(');
                    if (this.peek().t === 'name' && this.peek(1).t === 'kw' && this.peek(1).v === 'in' &&
                        this.peek(2).t === 'name' && this.isOp(')', 3)) {
                        const v = this.next().v;
                        this.pos++;
                        const arr = this.next().v;
                        this.pos++;
                        return { k: 'forin', v, arr, body: this.body() };
                    }
                    const init = this.isOp(';') ? null : this.simpleStatement();
                    this.expectOp(';');
                    this.skipNl();
                    const cond = this.isOp(';') ? null : this.expr();
                    this.expectOp(';');
                    this.skipNl();
                    const step = this.isOp(')') ? null : this.simpleStatement();
                    this.expectOp(')');
                    if (this.isOp(';')) { this.pos++; return { k: 'for', init, cond, step, body: { k: 'block', stmts: [] } }; }
                    return { k: 'for', init, cond, step, body: this.body() };
                }
                case 'break': this.pos++; this.endSimple(); return { k: 'break' };
                case 'continue': this.pos++; this.endSimple(); return { k: 'continue' };
                case 'next': this.pos++; this.endSimple(); return { k: 'next' };
                case 'nextfile': this.pos++; this.endSimple(); return { k: 'nextfile' };
                case 'exit': {
                    this.pos++;
                    const e = this.atEnd() ? null : this.expr();
                    this.endSimple();
                    return { k: 'exit', e };
                }
                case 'return': {
                    this.pos++;
                    const e = this.atEnd() ? null : this.expr();
                    this.endSimple();
                    return { k: 'return', e };
                }
                default:
                    break;
            }
        }
        const s = this.simpleStatement();
        this.endSimple();
        return s;
    }

    atEnd() {
        const t = this.peek();
        return t.t === 'nl' || t.t === 'eof' || this.isOp(';') || this.isOp('}');
    }

    simpleStatement() {
        const t = this.peek();
        if (t.t === 'kw' && (t.v === 'print' || t.v === 'printf')) return this.print();
        if (t.t === 'kw' && t.v === 'delete') {
            this.pos++;
            const name = this.next();
            if (name.t !== 'name') throw syntaxError('array name expected after delete');
            if (this.isOp('[')) {
                this.pos++;
                const subs = this.exprList(']');
                this.expectOp(']');
                return { k: 'delete', name: name.v, subs };
            }
            return { k: 'delete', name: name.v, subs: null };
        }
        if (t.t === 'kw' && t.v === 'getline') throw unsupported('getline');
        return { k: 'expr', e: this.expr() };
    }

    print() {
        const kind = this.next().v;
        let args = [];
        if (!this.atEnd() && !this.isOp('>') && !this.isOp('>>') && !this.isOp('|')) {
            // print (a, b) > "file": a parenthesized list
            if (this.isOp('(')) {
                const save = this.pos;
                this.pos++;
                const list = this.exprList(')', true);
                if (this.isOp(')')) {
                    this.pos++;
                    if (this.atEnd() || this.isOp('>') || this.isOp('>>') || this.isOp('|')) args = list;
                    else this.pos = save;
                } else {
                    this.pos = save;
                }
            }
            if (!args.length) args = this.exprList(null, false, true);
        }
        let redirect = null;
        if (this.isOp('>') || this.isOp('>>') || this.isOp('|')) {
            const mode = this.next().v;
            redirect = { mode, target: this.concat(true) };
        }
        if (kind === 'printf' && !args.length) throw syntaxError('printf: no format');
        return { k: kind, args, redirect };
    }

    exprList(closer, allowNl = false, noGt = false) {
        const list = [];
        if (closer && this.isOp(closer)) return list;
        list.push(this.expr(noGt));
        while (this.isOp(',')) {
            this.pos++;
            this.skipNl();
            list.push(this.expr(noGt));
        }
        return list;
    }

    expr(noGt = false) {
        const left = this.ternary(noGt);
        const t = this.peek();
        if (t.t === 'op' && ASSIGN_OPS.has(t.v) && isLvalue(left)) {
            this.pos++;
            this.skipNl();
            return { k: 'assign', op: t.v, target: left, e: this.expr(noGt) };
        }
        return left;
    }

    ternary(noGt) {
        const cond = this.or(noGt);
        if (this.isOp('?')) {
            this.pos++;
            this.skipNl();
            const a = this.expr(noGt);
            this.skipNl();
            this.expectOp(':');
            this.skipNl();
            const b = this.expr(noGt);
            return { k: 'cond', cond, a, b };
        }
        return cond;
    }

    or(noGt) {
        let l = this.and(noGt);
        while (this.isOp('||')) { this.pos++; this.skipNl(); l = { k: 'or', l, r: this.and(noGt) }; }
        return l;
    }

    and(noGt) {
        let l = this.inExpr(noGt);
        while (this.isOp('&&')) { this.pos++; this.skipNl(); l = { k: 'and', l, r: this.inExpr(noGt) }; }
        return l;
    }

    inExpr(noGt) {
        let l = this.match(noGt);
        while (this.isKw('in')) {
            this.pos++;
            const arr = this.next();
            if (arr.t !== 'name') throw syntaxError('array name expected after "in"');
            l = { k: 'in', subs: l.k === 'group' ? l.list : [l], arr: arr.v };
        }
        return l;
    }

    match(noGt) {
        let l = this.relational(noGt);
        while (this.isOp('~') || this.isOp('!~')) {
            const neg = this.next().v === '!~';
            l = { k: 'match', neg, l, re: this.relational(noGt) };
        }
        return l;
    }

    relational(noGt) {
        const l = this.concat(noGt);
        const t = this.peek();
        if (t.t === 'op' && ['<', '<=', '!=', '==', '>=', '>'].includes(t.v) && !(noGt && t.v === '>')) {
            this.pos++;
            return { k: 'cmp', op: t.v, l, r: this.concat(noGt) };
        }
        return l;
    }

    startsConcatOperand() {
        const t = this.peek();
        if (['num', 'str', 'ere', 'name', 'funcname', 'builtin'].includes(t.t)) return true;
        if (t.t === 'op' && ['$', '(', '!', '-', '+', '++', '--'].includes(t.v)) {
            // "a - b" is subtraction and "a !~ b" a match, not concatenation
            return t.v === '$' || t.v === '(' || t.v === '++' || t.v === '--';
        }
        return false;
    }

    concat(noGt) {
        let l = this.additive();
        while (this.startsConcatOperand() && !this.isKw('in')) {
            l = { k: 'concat', l, r: this.additive() };
        }
        return l;
    }

    additive() {
        let l = this.multiplicative();
        while (this.isOp('+') || this.isOp('-')) {
            const op = this.next().v;
            l = { k: 'bin', op, l, r: this.multiplicative() };
        }
        return l;
    }

    multiplicative() {
        let l = this.unary();
        while (this.isOp('*') || this.isOp('/') || this.isOp('%')) {
            const op = this.next().v;
            l = { k: 'bin', op, l, r: this.unary() };
        }
        return l;
    }

    unary() {
        if (this.isOp('!')) { this.pos++; return { k: 'not', e: this.unary() }; }
        if (this.isOp('-')) { this.pos++; return { k: 'neg', e: this.unary() }; }
        if (this.isOp('+')) { this.pos++; return { k: 'plus', e: this.unary() }; }
        return this.power();
    }

    power() {
        const base = this.postfix();
        if (this.isOp('^')) {
            this.pos++;
            // right associative, and the exponent may carry a sign: 2^-1
            const exp = this.isOp('-') ? (this.pos++, { k: 'neg', e: this.powerOperand() })
                : this.isOp('+') ? (this.pos++, this.powerOperand()) : this.powerOperand();
            return { k: 'bin', op: '^', l: base, r: exp };
        }
        return base;
    }

    powerOperand() {
        return this.power();
    }

    postfix() {
        const e = this.primary();
        if (isLvalue(e) && (this.isOp('++') || this.isOp('--'))) {
            return { k: 'postinc', target: e, delta: this.next().v === '++' ? 1 : -1 };
        }
        return e;
    }

    primary() {
        const t = this.next();
        switch (t.t) {
            case 'num': return { k: 'num', v: t.v };
            case 'str': return { k: 'str', v: t.v };
            case 'ere': return { k: 'ere', v: t.v };
            case 'funcname': {
                this.expectOp('(');
                const args = this.exprList(')');
                this.expectOp(')');
                return { k: 'call', name: t.v, args };
            }
            case 'builtin': {
                if (t.v === 'system') throw unsupported('system()');
                if (this.isOp('(')) {
                    this.pos++;
                    const args = this.exprList(')');
                    this.expectOp(')');
                    return { k: 'builtin', name: t.v, args };
                }
                if (t.v === 'length') return { k: 'builtin', name: 'length', args: [] };
                throw syntaxError(`${t.v} needs parentheses`);
            }
            case 'name': {
                if (this.isOp('[')) {
                    this.pos++;
                    const subs = this.exprList(']');
                    this.expectOp(']');
                    return { k: 'elem', name: t.v, subs };
                }
                return { k: 'var', name: t.v };
            }
            case 'kw':
                if (t.v === 'getline') throw unsupported('getline');
                throw syntaxError(`unexpected "${t.v}"`);
            case 'op': {
                if (t.v === '$') {
                    let e;
                    if (this.isOp('++') || this.isOp('--')) {
                        const delta = this.next().v === '++' ? 1 : -1;
                        e = { k: 'preinc', target: this.primary(), delta };
                    } else if (this.isOp('-')) {
                        this.pos++;
                        e = { k: 'neg', e: this.primary() };
                    } else {
                        e = this.primary();
                    }
                    return { k: 'field', e };
                }
                if (t.v === '++' || t.v === '--') {
                    const target = this.postfixTarget();
                    return { k: 'preinc', target, delta: t.v === '++' ? 1 : -1 };
                }
                if (t.v === '(') {
                    this.skipNl();
                    const list = this.exprList(')');
                    this.skipNl();
                    this.expectOp(')');
                    if (list.length === 1) return { k: 'group', e: list[0], list };
                    if (!this.isKw('in')) throw syntaxError('a list in parentheses must be followed by "in"');
                    return { k: 'group', e: list[list.length - 1], list };
                }
                if (t.v === '-') return { k: 'neg', e: this.unary() };
                if (t.v === '!') return { k: 'not', e: this.unary() };
                if (t.v === '+') return { k: 'plus', e: this.unary() };
                break;
            }
            default:
                break;
        }
        this.pos--;
        throw syntaxError(`unexpected ${this.describe()}`);
    }

    postfixTarget() {
        const e = this.primary();
        if (!isLvalue(e)) throw syntaxError('++ or -- needs a variable');
        return e;
    }
}

function isLvalue(e) {
    return e.k === 'var' || e.k === 'elem' || e.k === 'field';
}

// ---------------------------------------------------------------------------
// Interpreter
// ---------------------------------------------------------------------------

class Next { }
class NextFile { }
class Exit { constructor(code) { this.code = code; } }
class Break { }
class Continue { }
class Return { constructor(value) { this.value = value; } }

const SPECIALS = new Set(['NF', 'NR', 'FNR', 'FS', 'OFS', 'ORS', 'RS', 'SUBSEP', 'RSTART', 'RLENGTH',
    'CONVFMT', 'OFMT', 'FILENAME', 'ENVIRON', 'ARGC', 'ARGV']);

// awk's escape processing for -v assignments and var=value operands
function processEscapes(s) {
    return s.replace(/\\([0-7]{1,3}|.)/g, (m, c) => (/^[0-7]/.test(c) ? String.fromCharCode(parseInt(c, 8)) : STRING_ESCAPES[c] ?? c));
}

class Interpreter {
    constructor(program, io) {
        this.program = program;
        this.io = io;
        this.globals = new Map([
            ['FS', ' '], ['OFS', ' '], ['ORS', '\n'], ['RS', '\n'], ['SUBSEP', '\x1c'],
            ['NR', 0], ['FNR', 0], ['RSTART', 0], ['RLENGTH', -1], ['CONVFMT', '%.6g'], ['OFMT', '%.6g'],
            ['FILENAME', ''], ['ENVIRON', new Map()], ['ARGC', 1], ['ARGV', new Map([['0', 'awk']])]
        ]);
        this.frames = [];
        this.record = '';
        this.fields = null;       // lazily split
        this.recordFs = ' ';
        this.out = [];
        this.files = new Map();   // redirect target -> { mode, chunks }
        this.pipes = new Map();   // command -> input chunks
        this.piped = [];          // output of closed pipes
        this.regexCache = new Map();
        this.seed = 0;
        this.randState = 0;
    }

    // --- variables ---------------------------------------------------------

    lookup(name) {
        const frame = this.frames[this.frames.length - 1];
        if (frame && frame.has(name)) return frame;
        return this.globals;
    }

    getVar(name) {
        if (name === 'NF') { this.split(); return this.fields.length; }
        const scope = this.lookup(name);
        const v = scope.has(name) ? scope.get(name) : UNINIT;
        return v instanceof LazyArray ? UNINIT : v;
    }

    setVar(name, value) {
        if (value instanceof Map) throw new Error(`awk: fatal: attempt to use array \`${name}' in a scalar context`);
        if (name === 'NF') { this.setNF(Math.trunc(toNum(value))); return; }
        const scope = this.lookup(name);
        const current = scope.get(name);
        if (current instanceof Map) throw new Error(`awk: fatal: attempt to use array \`${name}' in a scalar context`);
        scope.set(name, value);
    }

    getArray(name) {
        const scope = this.lookup(name);
        let v = scope.get(name);
        if (v instanceof LazyArray) {
            const m = new Map();
            const outer = v.scope.get(v.name);
            if (outer === undefined || outer === UNINIT) v.scope.set(v.name, m);
            else if (outer instanceof LazyArray) this.resolveLazy(outer, m);
            scope.set(name, m);
            return m;
        }
        if (v === undefined || v === UNINIT) {
            v = new Map();
            scope.set(name, v);
        }
        if (!(v instanceof Map)) throw new Error(`awk: fatal: attempt to use scalar \`${name}' as an array`);
        return v;
    }

    resolveLazy(ref, map) {
        const outer = ref.scope.get(ref.name);
        if (outer instanceof LazyArray) this.resolveLazy(outer, map);
        else if (outer === undefined || outer === UNINIT) ref.scope.set(ref.name, map);
    }

    subscript(subs) {
        const conv = toStr(this.getVar('CONVFMT'));
        const sep = toStr(this.getVar('SUBSEP'));
        return subs.map(e => {
            const v = this.eval(e);
            return typeof v === 'number' && Number.isInteger(v) ? String(v) : toStr(v, conv);
        }).join(sep);
    }

    // --- records and fields ------------------------------------------------

    setRecord(text, fs) {
        this.record = text;
        this.fields = null;
        this.recordFs = fs ?? toStr(this.getVar('FS'));
    }

    splitWith(text, fs) {
        if (text === '') return [];
        if (fs === ' ') return text.replace(/^[ \t\n]+|[ \t\n]+$/g, '').split(/[ \t\n]+/).filter((x, i, a) => a.length > 1 || x !== '');
        if (fs.length === 1 && fs !== '\\') {
            if (toStr(this.getVar('RS')) === '' ) return text.split(new RegExp(`[${fs.replace(/[\]\\^-]/g, '\\$&')}\\n]`));
            return text.split(fs);
        }
        if (fs === '') return [...text];
        return text.split(new RegExp(this.regex(fs).source, 'g'));
    }

    split() {
        if (this.fields === null) this.fields = this.splitWith(this.record, this.recordFs);
    }

    getField(i) {
        if (i < 0) throw new Error(`awk: fatal: attempt to access field ${i}`);
        if (i === 0) return new StrNum(this.record);
        this.split();
        return i <= this.fields.length ? new StrNum(this.fields[i - 1]) : UNINIT;
    }

    setField(i, value) {
        if (i < 0) throw new Error(`awk: fatal: attempt to access field ${i}`);
        const s = toStr(value, toStr(this.getVar('CONVFMT')));
        if (i === 0) { this.setRecord(s, toStr(this.getVar('FS'))); return; }
        this.split();
        while (this.fields.length < i) this.fields.push('');
        this.fields[i - 1] = s;
        this.record = this.fields.join(toStr(this.getVar('OFS')));
    }

    setNF(n) {
        this.split();
        if (n < 0) throw new Error('awk: fatal: NF set to negative value');
        while (this.fields.length < n) this.fields.push('');
        this.fields.length = n;
        this.record = this.fields.join(toStr(this.getVar('OFS')));
    }

    regex(src) {
        if (!this.regexCache.has(src)) {
            this.regexCache.set(src, posixRegExp(src, { mode: 'extended', tool: 'awk', warn: this.io.warn }));
        }
        return this.regexCache.get(src);
    }

    // A regex operand: /re/ literal or any expression used as a dynamic regex
    regexOf(node) {
        if (node.k === 'ere') return this.regex(node.v);
        return this.regex(toStr(this.eval(node)));
    }

    // --- lvalues ---------------------------------------------------------------

    getL(t) {
        if (t.k === 'var') return this.getVar(t.name);
        if (t.k === 'field') return this.getField(Math.trunc(toNum(this.eval(t.e))));
        const arr = this.getArray(t.name);
        const key = this.subscript(t.subs);
        if (!arr.has(key)) arr.set(key, UNINIT);
        return arr.get(key);
    }

    setL(t, value) {
        if (t.k === 'var') this.setVar(t.name, value);
        else if (t.k === 'field') this.setField(Math.trunc(toNum(this.eval(t.e))), value);
        else this.getArray(t.name).set(this.subscript(t.subs), value);
        return value;
    }

    // Resolve a field/element target once, so `$i++` evaluates `i` only once
    resolve(t) {
        if (t.k === 'field') return { k: 'field', e: { k: 'num', v: Math.trunc(toNum(this.eval(t.e))) } };
        if (t.k === 'elem') return { k: 'elem', name: t.name, subs: [{ k: 'str', v: this.subscript(t.subs) }] };
        return t;
    }

    // --- expressions -------------------------------------------------------

    eval(e) {
        switch (e.k) {
            case 'num': return e.v;
            case 'str': return e.v;
            case 'ere': return this.regex(e.v).test(this.record) ? 1 : 0;
            case 'group': return this.eval(e.e);
            case 'var': {
                const v = this.getVar(e.name);
                if (v instanceof Map) throw new Error(`awk: fatal: attempt to use array \`${e.name}' in a scalar context`);
                return v;
            }
            case 'elem': case 'field': return this.getL(e);
            case 'assign': {
                const target = this.resolve(e.target);
                if (e.op === '=') {
                    return this.setL(target, this.eval(e.e));
                }
                const r = toNum(this.eval(e.e));
                const l = toNum(this.getL(target));
                let v;
                switch (e.op) {
                    case '+=': v = l + r; break;
                    case '-=': v = l - r; break;
                    case '*=': v = l * r; break;
                    case '/=':
                        if (r === 0) throw new Error('awk: fatal: division by zero attempted in `/=\'');
                        v = l / r; break;
                    case '%=':
                        if (r === 0) throw new Error('awk: fatal: division by zero attempted in `%=\'');
                        v = l % r; break;
                    case '^=': v = Math.pow(l, r); break;
                }
                return this.setL(target, v);
            }
            case 'cond': return truthy(this.eval(e.cond)) ? this.eval(e.a) : this.eval(e.b);
            case 'or': return truthy(this.eval(e.l)) || truthy(this.eval(e.r)) ? 1 : 0;
            case 'and': return truthy(this.eval(e.l)) && truthy(this.eval(e.r)) ? 1 : 0;
            case 'in': {
                const arr = this.getArray(e.arr);
                return arr.has(this.subscript(e.subs)) ? 1 : 0;
            }
            case 'match': {
                const s = toStr(this.eval(e.l), toStr(this.getVar('CONVFMT')));
                const m = this.regexOf(e.re).test(s);
                return (e.neg ? !m : m) ? 1 : 0;
            }
            case 'cmp': {
                const r = compare(this.eval(e.l), this.eval(e.r), toStr(this.getVar('CONVFMT')));
                switch (e.op) {
                    case '<': return r < 0 ? 1 : 0;
                    case '<=': return r <= 0 ? 1 : 0;
                    case '>': return r > 0 ? 1 : 0;
                    case '>=': return r >= 0 ? 1 : 0;
                    case '==': return r === 0 ? 1 : 0;
                    case '!=': return r !== 0 ? 1 : 0;
                }
                return 0;
            }
            case 'concat': {
                const conv = toStr(this.getVar('CONVFMT'));
                return toStr(this.eval(e.l), conv) + toStr(this.eval(e.r), conv);
            }
            case 'bin': {
                const a = toNum(this.eval(e.l));
                const b = toNum(this.eval(e.r));
                switch (e.op) {
                    case '+': return a + b;
                    case '-': return a - b;
                    case '*': return a * b;
                    case '/':
                        if (b === 0) throw new Error('awk: fatal: division by zero attempted');
                        return a / b;
                    case '%':
                        if (b === 0) throw new Error('awk: fatal: division by zero attempted in `%\'');
                        return a % b;
                    case '^': return Math.pow(a, b);
                }
                return 0;
            }
            case 'not': return truthy(this.eval(e.e)) ? 0 : 1;
            case 'neg': return -toNum(this.eval(e.e));
            case 'plus': return toNum(this.eval(e.e));
            case 'preinc': {
                const t = this.resolve(e.target);
                return this.setL(t, toNum(this.getL(t)) + e.delta);
            }
            case 'postinc': {
                const t = this.resolve(e.target);
                const old = toNum(this.getL(t));
                this.setL(t, old + e.delta);
                return old;
            }
            case 'call': return this.callUser(e);
            case 'builtin': return this.callBuiltin(e);
        }
        throw new Error(`awk: internal error: unknown node ${e.k}`);
    }

    callUser(e) {
        const fn = this.program.functions.get(e.name);
        if (!fn) throw new Error(`awk: fatal: function \`${e.name}' not defined`);
        if (e.args.length > fn.params.length) throw new Error(`awk: fatal: function \`${e.name}' called with more arguments than declared`);
        const frame = new Map();
        fn.params.forEach((p, i) => {
            const arg = e.args[i];
            if (!arg) { frame.set(p, UNINIT); return; }
            // arrays are passed by reference
            if (arg.k === 'var' && arg.name !== 'NF') {
                const scope = this.lookup(arg.name);
                const v = scope.has(arg.name) ? scope.get(arg.name) : UNINIT;
                if (v instanceof Map || v instanceof LazyArray) frame.set(p, v);
                else if (v === UNINIT) frame.set(p, new LazyArray(scope, arg.name));
                else frame.set(p, v);
                return;
            }
            frame.set(p, this.eval(arg));
        });
        if (this.frames.length > 500) throw new Error('awk: fatal: function call nesting too deep');
        this.frames.push(frame);
        try {
            this.exec(fn.body);
            return UNINIT;
        } catch (sig) {
            if (sig instanceof Return) return sig.value;
            throw sig;
        } finally {
            this.frames.pop();
        }
    }

    callBuiltin(e) {
        const a = e.args;
        const argc = (min, max = min) => {
            if (a.length < min || a.length > max) throw new Error(`awk: fatal: ${e.name}: called with ${a.length} arguments`);
        };
        const num = (i) => toNum(this.eval(a[i]));
        const str = (i) => toStr(this.eval(a[i]), toStr(this.getVar('CONVFMT')));
        switch (e.name) {
            case 'length': {
                argc(0, 1);
                if (!a.length) return [...this.record].length;
                if (a[0].k === 'var') {
                    const v = this.getVar(a[0].name);
                    if (v instanceof Map) return v.size;
                }
                return [...str(0)].length;
            }
            case 'substr': {
                argc(2, 3);
                const s = str(0);
                const chars = [...s];
                let start = Math.round(num(1));
                let len = a.length === 3 ? Math.round(num(2)) : Infinity;
                if (Number.isNaN(start)) start = 1;
                if (start < 1) { len += start - 1; start = 1; }
                if (!(len > 0)) return '';
                return chars.slice(start - 1, len === Infinity ? undefined : start - 1 + len).join('');
            }
            case 'index': {
                argc(2);
                const s = str(0), t = str(1);
                const i = s.indexOf(t);
                return i < 0 ? 0 : [...s.slice(0, i)].length + 1;
            }
            case 'split': {
                argc(2, 3);
                const s = str(0);
                if (a[1].k !== 'var') throw new Error('awk: fatal: split: second argument is not an array');
                const arr = this.getArray(a[1].name);
                arr.clear();
                let parts;
                if (a.length === 3 && a[2].k === 'ere') {
                    parts = s === '' ? [] : s.split(new RegExp(this.regex(a[2].v).source, 'g'));
                } else {
                    const fs = a.length === 3 ? str(2) : toStr(this.getVar('FS'));
                    parts = this.splitWith(s, fs);
                }
                parts.forEach((p, i) => arr.set(String(i + 1), new StrNum(p)));
                return parts.length;
            }
            case 'sub': case 'gsub': {
                argc(2, 3);
                const re = this.regexOf(a[0]);
                const repl = str(1);
                const target = a.length === 3 ? a[2] : { k: 'field', e: { k: 'num', v: 0 } };
                if (!isLvalue(target)) {
                    // gawk allows a non-lvalue, the result is just discarded
                    return 0;
                }
                const t = this.resolve(target);
                const s = toStr(this.getL(t), toStr(this.getVar('CONVFMT')));
                let count = 0;
                const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
                const result = s.replace(g, (match) => {
                    if (e.name === 'sub' && count > 0) return match;
                    count++;
                    let out = '';
                    for (let i = 0; i < repl.length; i++) {
                        if (repl[i] === '\\' && (repl[i + 1] === '&' || repl[i + 1] === '\\')) {
                            out += repl[i + 1];
                            i++;
                        } else if (repl[i] === '&') {
                            out += match;
                        } else {
                            out += repl[i];
                        }
                    }
                    return out;
                });
                if (count > 0) this.setL(t, result);
                return count;
            }
            case 'match': {
                argc(2);
                const s = str(0);
                const m = this.regexOf(a[1]).exec(s);
                const rstart = m ? [...s.slice(0, m.index)].length + 1 : 0;
                const rlength = m ? [...m[0]].length : -1;
                this.globals.set('RSTART', rstart);
                this.globals.set('RLENGTH', rlength);
                return rstart;
            }
            case 'sprintf': {
                if (!a.length) throw new Error('awk: fatal: sprintf: no arguments');
                return this.format(a.map(x => this.eval(x)));
            }
            case 'tolower': argc(1); return str(0).toLowerCase();
            case 'toupper': argc(1); return str(0).toUpperCase();
            case 'int': argc(1); return Math.trunc(num(0));
            case 'sqrt': argc(1); return Math.sqrt(num(0));
            case 'exp': argc(1); return Math.exp(num(0));
            case 'log': argc(1); return Math.log(num(0));
            case 'sin': argc(1); return Math.sin(num(0));
            case 'cos': argc(1); return Math.cos(num(0));
            case 'atan2': argc(2); return Math.atan2(num(0), num(1));
            case 'rand': {
                argc(0);
                // deterministic LCG; real awk's sequence differs
                this.randState = (this.randState * 1103515245 + 12345) % 2147483648;
                return this.randState / 2147483648;
            }
            case 'srand': {
                argc(0, 1);
                const prev = this.seed;
                this.seed = a.length ? num(0) : Math.floor(Date.now() / 1000);
                this.randState = Math.abs(Math.trunc(this.seed)) % 2147483648;
                return prev;
            }
            case 'close': {
                argc(1, 2);
                return this.close(str(0));
            }
            case 'fflush': return 0;
        }
        throw unsupported(`${e.name}()`);
    }

    format(values) {
        const [fmt, ...rest] = values;
        return sprintf(toStr(fmt), rest, {
            num: toNum,
            str: (v) => toStr(v, toStr(this.getVar('CONVFMT'))),
            isNum: (v) => typeof v === 'number' || (v instanceof StrNum && v.n !== null)
        });
    }

    // --- output --------------------------------------------------------------

    emit(text, redirect) {
        if (!redirect) { this.out.push(text); return; }
        const target = toStr(this.eval(redirect.target));
        if (redirect.mode === '|') {
            if (!this.io.exec) throw unsupported('print | "command"');
            if (!this.pipes.has(target)) this.pipes.set(target, []);
            this.pipes.get(target).push(text);
            return;
        }
        if (target === '/dev/stdout' || target === '-') { this.out.push(text); return; }
        if (target === '/dev/stderr') { this.io.error?.(text.replace(/\n$/, '')); return; }
        if (!this.io.writeFile) throw unsupported('print > file');
        let f = this.files.get(target);
        if (!f) {
            f = { append: redirect.mode === '>>', chunks: [] };
            this.files.set(target, f);
        }
        f.chunks.push(text);
    }

    close(name) {
        if (this.files.has(name)) {
            const f = this.files.get(name);
            this.io.writeFile(name, f.chunks.join(''), f.append);
            this.files.delete(name);
            return 0;
        }
        if (this.pipes.has(name)) {
            const input = this.pipes.get(name).join('');
            this.pipes.delete(name);
            this.piped.push(this.io.exec(name, input));
            return 0;
        }
        return -1;
    }

    closeAll() {
        for (const name of [...this.files.keys()]) this.close(name);
        for (const name of [...this.pipes.keys()]) this.close(name);
    }

    // --- statements ----------------------------------------------------------

    exec(s) {
        switch (s.k) {
            case 'block':
                for (const st of s.stmts) this.exec(st);
                return;
            case 'expr':
                this.eval(s.e);
                return;
            case 'print': {
                const ofmt = toStr(this.getVar('OFMT'));
                const text = s.args.length === 0
                    ? this.record
                    : s.args.map(x => {
                        const v = this.eval(x);
                        return typeof v === 'number' ? numToStr(v, ofmt) : toStr(v);
                    }).join(toStr(this.getVar('OFS')));
                this.emit(text + toStr(this.getVar('ORS')), s.redirect);
                return;
            }
            case 'printf':
                this.emit(this.format(s.args.map(x => this.eval(x))), s.redirect);
                return;
            case 'if':
                if (truthy(this.eval(s.cond))) this.exec(s.then);
                else if (s.else) this.exec(s.else);
                return;
            case 'while':
                while (truthy(this.eval(s.cond))) {
                    if (this.loop(s.body)) break;
                }
                return;
            case 'do':
                do {
                    if (this.loop(s.body)) break;
                } while (truthy(this.eval(s.cond)));
                return;
            case 'for':
                if (s.init) this.exec(s.init);
                while (!s.cond || truthy(this.eval(s.cond))) {
                    if (this.loop(s.body)) break;
                    if (s.step) this.exec(s.step);
                }
                return;
            case 'forin': {
                const arr = this.getArray(s.arr);
                for (const key of [...arr.keys()]) {
                    if (!arr.has(key)) continue;
                    this.setVar(s.v, key);
                    if (this.loop(s.body)) break;
                }
                return;
            }
            case 'break': throw new Break();
            case 'continue': throw new Continue();
            case 'next':
                if (this.phase !== 'main') throw new Error('awk: fatal: `next\' used in BEGIN or END action');
                throw new Next();
            case 'nextfile': throw new NextFile();
            case 'exit': throw new Exit(s.e ? Math.trunc(toNum(this.eval(s.e))) : null);
            case 'return': throw new Return(s.e ? this.eval(s.e) : UNINIT);
            case 'delete': {
                const arr = this.getArray(s.name);
                if (s.subs) arr.delete(this.subscript(s.subs));
                else arr.clear();
                return;
            }
        }
        throw new Error(`awk: internal error: unknown statement ${s.k}`);
    }

    // Runs a loop body; returns true on break
    loop(body) {
        try {
            this.exec(body);
        } catch (sig) {
            if (sig instanceof Break) return true;
            if (sig instanceof Continue) return false;
            throw sig;
        }
        return false;
    }

    // --- driver --------------------------------------------------------------

    records(text) {
        const rs = toStr(this.getVar('RS'));
        if (text === '') return [];
        if (rs === '\n') return (text.endsWith('\n') ? text.slice(0, -1) : text).split('\n');
        if (rs === '') {
            return text.replace(/^\n+/, '').replace(/\n+$/, '').split(/\n\n+/).filter(r => r !== '');
        }
        const parts = rs.length === 1 ? text.split(rs) : text.split(new RegExp(this.regex(rs).source, 'g'));
        if (parts.length && parts[parts.length - 1].replace(/\n$/, '') === '') parts.pop();
        return parts;
    }

    matchesPattern(item) {
        if (!item.pattern) return true;
        if (!item.pattern2) return truthy(this.eval(item.pattern));
        if (!item.inRange) {
            if (!truthy(this.eval(item.pattern))) return false;
            item.inRange = !truthy(this.eval(item.pattern2));
            return true;
        }
        if (truthy(this.eval(item.pattern2))) item.inRange = false;
        return true;
    }

    run(sources) {
        const items = this.program.items;
        const begin = items.filter(i => i.kind === 'BEGIN');
        const main = items.filter(i => i.kind === 'main');
        const end = items.filter(i => i.kind === 'END');
        let exitCode = 0;
        let exiting = false;

        try {
            this.phase = 'begin';
            for (const item of begin) this.exec(item.body);
        } catch (sig) {
            if (!(sig instanceof Exit)) throw sig;
            exiting = true;
            if (sig.code !== null) exitCode = sig.code;
        }

        if (!exiting && (main.length || end.length)) {
            this.phase = 'main';
            let nr = 0;
            try {
                for (const source of sources()) {
                    if (source.assign) {
                        this.setVar(source.assign[0], new StrNum(processEscapes(source.assign[1])));
                        continue;
                    }
                    this.globals.set('FILENAME', source.name);
                    let fnr = 0;
                    try {
                        for (const rec of this.records(source.text)) {
                            nr++; fnr++;
                            this.globals.set('NR', nr);
                            this.globals.set('FNR', fnr);
                            this.setRecord(rec);
                            try {
                                for (const item of main) {
                                    if (this.matchesPattern(item)) {
                                        if (item.body) this.exec(item.body);
                                        else this.out.push(this.record + toStr(this.getVar('ORS')));
                                    }
                                }
                            } catch (sig) {
                                if (!(sig instanceof Next)) throw sig;
                            }
                            nr = toNum(this.globals.get('NR'));
                        }
                    } catch (sig) {
                        if (!(sig instanceof NextFile)) throw sig;
                    }
                }
            } catch (sig) {
                if (!(sig instanceof Exit)) throw sig;
                if (sig.code !== null) exitCode = sig.code;
            }
        }

        try {
            this.phase = 'end';
            for (const item of end) this.exec(item.body);
        } catch (sig) {
            if (!(sig instanceof Exit)) throw sig;
            if (sig.code !== null) exitCode = sig.code;
        }

        // awk's own output is buffered until it exits, while commands fed by
        // print | "cmd" write as soon as their pipe is closed — so their output
        // comes first (as in a real shell when stdout is not a terminal)
        this.closeAll();
        const own = this.out.join('');
        return { stdout: this.piped.join('') + own, status: exitCode };
    }
}

export function parseAwk(src) {
    return new Parser(lex(src)).program();
}

// awk command: awk [-F fs] [-v var=value] 'program' [var=value | file ...]
export function awk(args, io) {
    const assigns = [];
    let fs = null;
    let i = 0;
    for (; i < args.length; i++) {
        const a = args[i];
        if (a === '--') { i++; break; }
        if (a === '-F' || a === '-v') {
            if (i + 1 >= args.length) throw new Error(`awk: option requires an argument -- '${a[1]}'`);
            if (a === '-F') fs = args[++i];
            else assigns.push(args[++i]);
        } else if (a.startsWith('-F')) {
            fs = a.slice(2);
        } else if (a.startsWith('-v')) {
            assigns.push(a.slice(2));
        } else if (a === '-f') {
            throw unsupported('the option -f (program files)');
        } else if (a.startsWith('-') && a.length > 1) {
            throw new Error(`awk: invalid option -- '${a[1]}' (not supported in this trainer)`);
        } else {
            break;
        }
    }
    const source = args[i];
    if (source === undefined) throw new Error("usage: awk [-F fs][-v var=value] 'prog' [file ...]");
    const operands = args.slice(i + 1);

    const program = parseAwk(source);
    const interp = new Interpreter(program, io);

    if (fs !== null) {
        interp.globals.set('FS', fs === 't' ? '\t' : processEscapes(fs));
    }
    for (const as of assigns) {
        const m = as.match(/^([A-Za-z_]\w*)=(.*)$/s);
        if (!m) throw new Error(`awk: fatal: \`${as}' is not a legal variable assignment`);
        interp.setVar(m[1], new StrNum(processEscapes(m[2])));
    }
    interp.globals.set('ARGC', operands.length + 1);
    operands.forEach((op, k) => interp.globals.get('ARGV').set(String(k + 1), new StrNum(op)));

    // Input sources: operands in order; var=value operands take effect between files
    const sources = function* () {
        const files = operands.filter(op => !/^[A-Za-z_]\w*=/.test(op));
        if (files.length === 0) {
            for (const op of operands) yield { assign: op.match(/^([A-Za-z_]\w*)=(.*)$/s).slice(1) };
            yield { name: '', text: io.stdin() };
            return;
        }
        for (const op of operands) {
            const m = op.match(/^([A-Za-z_]\w*)=(.*)$/s);
            if (m) { yield { assign: [m[1], m[2]] }; continue; }
            if (op === '-') { yield { name: '-', text: io.stdin() }; continue; }
            if (!io.readFile) throw new Error(`awk: fatal: cannot open file \`${op}' for reading: No such file or directory`);
            let text;
            try {
                text = io.readFile(op);
            } catch {
                throw new Error(`awk: fatal: cannot open file \`${op}' for reading: No such file or directory`);
            }
            yield { name: op, text };
        }
    };

    const { stdout, status } = interp.run(sources);
    if (io.setStatus) io.setStatus(status);
    return stdout;
}
