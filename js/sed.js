// sed (subset): addresses (N, $, /re/, ranges, !) with the commands
// s///, d, p, q and =, several commands separated by ; or given with -e.
// Regexes are BRE by default and ERE with -E / -r, exactly like GNU sed.

import { posixRegExp } from './regex.js';
import { getopt, toLines, fromLines } from './utils.js';

const SUPPORTED = 's, d, p, q, =';

// Characters that change meaning when escaped (BRE) / are special (ERE);
// an escaped delimiter must stay escaped for these to remain literal.
function unescapeDelimiter(src, delim, ere) {
    if (delim === '/') return src.replace(/\\\//g, '/');
    const keepEscaped = ere ? '.*[]^$\\|+?(){}' : '.*[]^$\\';
    if (keepEscaped.includes(delim)) return src;
    return src.split('\\' + delim).join(delim);
}

class SedParser {
    constructor(script, ere) {
        this.s = script;
        this.i = 0;
        this.ere = ere;
    }

    error(msg) {
        return new Error(`sed: -e expression #1, char ${this.i}: ${msg}`);
    }

    peek() { return this.s[this.i]; }

    skipSpaces() {
        while (this.i < this.s.length && /[ \t]/.test(this.s[this.i])) this.i++;
    }

    // Reads up to an unescaped delimiter (a [...] bracket may contain it).
    readDelimited(delim) {
        let out = '';
        while (this.i < this.s.length) {
            const ch = this.s[this.i];
            if (ch === '\\') {
                out += ch + (this.s[this.i + 1] ?? '');
                this.i += 2;
                continue;
            }
            if (ch === delim) {
                this.i++;
                return out;
            }
            if (ch === '\n') break;
            out += ch;
            this.i++;
        }
        return null;
    }

    parseAddress() {
        const ch = this.peek();
        if (/[0-9]/.test(ch)) {
            let n = '';
            while (/[0-9]/.test(this.peek() ?? '')) n += this.s[this.i++];
            if (Number(n) === 0) throw this.error('invalid usage of line address 0');
            return { type: 'line', n: Number(n) };
        }
        if (ch === '$') {
            this.i++;
            return { type: 'last' };
        }
        if (ch === '/' || ch === '\\') {
            let delim = '/';
            if (ch === '\\') { delim = this.s[this.i + 1]; this.i++; }
            this.i++;
            const src = this.readDelimited(delim);
            if (src === null) throw this.error('unterminated address regex');
            let flags = '';
            if (this.peek() === 'I') { flags = 'i'; this.i++; }
            return { type: 're', src: unescapeDelimiter(src, delim, this.ere), flags };
        }
        return null;
    }

    parseSubstitute() {
        const delim = this.s[this.i++];
        if (!delim || delim === '\n' || delim === '\\') throw this.error("unterminated `s' command");
        const pattern = this.readDelimited(delim);
        if (pattern === null) throw this.error("unterminated `s' command");
        const replacement = this.readDelimited(delim);
        if (replacement === null) throw this.error("unterminated `s' command");

        const cmd = { cmd: 's', src: unescapeDelimiter(pattern, delim, this.ere), replacement, delim, global: false, nth: 1, print: false, icase: false };
        while (this.i < this.s.length && !/[;\n}\s]/.test(this.peek())) {
            const f = this.s[this.i];
            if (f === 'g') { cmd.global = true; this.i++; }
            else if (f === 'p') { cmd.print = true; this.i++; }
            else if (f === 'i' || f === 'I') { cmd.icase = true; this.i++; }
            else if (/[0-9]/.test(f)) {
                let n = '';
                while (/[0-9]/.test(this.peek() ?? '')) n += this.s[this.i++];
                if (Number(n) === 0) throw this.error("number option to `s' command may not be zero");
                cmd.nth = Number(n);
            } else if (f === 'w' || f === 'e' || f === 'm' || f === 'M') {
                throw new Error(`sed: the s///${f} flag is not supported in this trainer`);
            } else {
                throw this.error("unknown option to `s'");
            }
        }
        return cmd;
    }

    parse() {
        const cmds = [];
        while (this.i < this.s.length) {
            while (this.i < this.s.length && /[\s;]/.test(this.peek())) this.i++;
            if (this.i >= this.s.length) break;

            const a1 = this.parseAddress();
            let a2 = null;
            if (a1 && this.peek() === ',') {
                this.i++;
                a2 = this.parseAddress();
                if (!a2) throw this.error('unexpected `,\'');
            }
            this.skipSpaces();
            let neg = false;
            while (this.peek() === '!') { neg = true; this.i++; this.skipSpaces(); }

            const c = this.s[this.i++];
            let cmd;
            if (c === undefined) throw this.error('missing command');
            if (c === 's') cmd = this.parseSubstitute();
            else if (c === 'd' || c === 'p' || c === 'q' || c === '=') cmd = { cmd: c };
            else if (c === '{' || c === '}') throw new Error('sed: { } command blocks are not supported in this trainer');
            else if ('aicyhHgGxnNDPbtTrwlz'.includes(c)) {
                throw new Error(`sed: the '${c}' command is not supported in this trainer (supported: ${SUPPORTED})`);
            } else throw this.error(`unknown command: \`${c}'`);

            if (cmd.cmd === 'q' && a2) throw this.error('command only uses one address');

            this.skipSpaces();
            const next = this.peek();
            if (next !== undefined && next !== ';' && next !== '\n' && next !== '}') {
                throw this.error('extra characters after command');
            }
            cmds.push({ ...cmd, a1, a2, neg, active: false });
        }
        return cmds;
    }
}

// Parses the RHS of s/// into literal text and group references.
function parseReplacement(src, groupCount) {
    const parts = [];
    let lit = '';
    const flush = () => { if (lit) { parts.push({ lit }); lit = ''; } };
    for (let i = 0; i < src.length; i++) {
        const ch = src[i];
        if (ch === '\\' && i + 1 < src.length) {
            const n = src[++i];
            if (/[0-9]/.test(n)) {
                if (Number(n) > groupCount) {
                    throw new Error(`sed: -e expression #1: invalid reference \\${n} on \`s' command's RHS` +
                        (groupCount === 0 ? ' (without -E, groups are written \\( \\) — or use sed -E)' : ''));
                }
                flush();
                parts.push({ group: Number(n) });
            } else if (n === 'n') lit += '\n';
            else if (n === 't') lit += '\t';
            else if ('LUluE'.includes(n)) throw new Error(`sed: case conversion (\\${n}) is not supported in this trainer`);
            else lit += n;
        } else if (ch === '&') {
            flush();
            parts.push({ group: 0 });
        } else {
            lit += ch;
        }
    }
    flush();
    return parts;
}

export function sed(input, args, io = {}) {
    const warn = io.warn || (() => {});
    const { opts, operands } = getopt('sed', args, { flags: 'nEr', args: 'e' });
    let script;
    if (opts.e) {
        script = opts.e.join('\n');
    } else {
        if (!operands.length) throw new Error('Usage: sed [OPTION]... {script-only-if-no-other-script}');
        script = operands.shift();
    }
    for (const f of operands) {
        if (f !== '-') throw new Error(`sed: can't read ${f}: No such file or directory`);
    }

    const ere = !!(opts.E || opts.r);
    const mode = ere ? 'extended' : 'basic';
    const cmds = new SedParser(script, ere).parse();

    let lastRegex = null;
    const compile = (src, flags) => {
        if (src === '') {
            if (!lastRegex) throw new Error('sed: no previous regular expression');
            return new RegExp(lastRegex.source, flags);
        }
        const re = posixRegExp(src, { mode, tool: 'sed', flags, warn });
        lastRegex = re;
        return re;
    };
    for (const c of cmds) {
        for (const a of [c.a1, c.a2]) {
            if (a && a.type === 're') a.re = compile(a.src, a.flags);
        }
        if (c.cmd === 's') {
            c.re = compile(c.src, 'g' + (c.icase ? 'i' : ''));
            c.repl = parseReplacement(c.replacement, lastRegex.groupCount ?? 0);
        }
    }

    const lines = toLines(input);
    const lastIdx = lines.length - 1;
    const out = [];

    const test = (a, idx, ps) => {
        if (a.type === 'line') return idx + 1 === a.n;
        if (a.type === 'last') return idx === lastIdx;
        a.re.lastIndex = 0;
        return a.re.test(ps);
    };
    const selected = (c, idx, ps) => {
        let r;
        if (!c.a1) r = true;
        else if (!c.a2) r = test(c.a1, idx, ps);
        else if (!c.active) {
            r = test(c.a1, idx, ps);
            if (r) {
                if (c.a2.type === 'line') c.active = c.a2.n > idx + 1;
                else if (c.a2.type === 'last') c.active = idx !== lastIdx;
                else c.active = true;
            }
        } else {
            r = true;
            if (c.a2.type === 'line') c.active = idx + 1 < c.a2.n;
            else if (c.a2.type === 'last') c.active = idx !== lastIdx;
            else if (test(c.a2, idx, ps)) c.active = false;
        }
        return c.neg ? !r : r;
    };

    for (let idx = 0; idx < lines.length; idx++) {
        let ps = lines[idx];
        let deleted = false;
        let quit = false;
        for (const c of cmds) {
            if (!selected(c, idx, ps)) continue;
            if (c.cmd === 'd') { deleted = true; break; }
            if (c.cmd === 'p') { out.push(ps); continue; }
            if (c.cmd === '=') { out.push(String(idx + 1)); continue; }
            if (c.cmd === 'q') { quit = true; break; }
            if (c.cmd === 's') {
                let count = 0;
                let replaced = false;
                c.re.lastIndex = 0;
                ps = ps.replace(c.re, (...m) => {
                    count++;
                    const hit = c.global ? count >= c.nth : count === c.nth;
                    if (!hit) return m[0];
                    replaced = true;
                    return c.repl.map(p => (p.lit !== undefined ? p.lit : (m[p.group] ?? ''))).join('');
                });
                if (replaced && c.print) out.push(ps);
            }
        }
        if (!deleted && !opts.n) out.push(ps);
        if (quit) break;
    }

    return fromLines(out);
}
