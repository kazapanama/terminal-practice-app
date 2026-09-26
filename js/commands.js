// Linux command implementations.
//
// A command is (args, io) => stdout. `io.stdin()` returns the standard input
// (and consumes it), `io.readFile/writeFile` access the task's virtual files,
// `io.error(msg)` writes to stderr without stopping and `io.setStatus(n)`
// sets the exit status. Throwing an Error is a fatal error (message goes to
// stderr, status 1 unless the error carries `.status`).
//
// Options are parsed getopt-style; options the trainer does not implement
// raise an error instead of being silently ignored, so a result is either
// what GNU coreutils would print or a clear message.

import {
    expandCharSet, parseRangeSpec, getopt, toLines, fromLines, escapeRegex
} from './utils.js';
import { translateRegex } from './regex.js';
import { runScript } from './shell.js';
import { VirtualFS, normalizePath } from './vfs.js';
import { sprintf } from './printf.js';
import { awk } from './awk.js';
import { sed } from './sed.js';

// Option reference used for validation and for the terminal's Tab help.
// Options whose description starts with an UPPERCASE placeholder take a value.
export const commandSpecs = {
    grep: {
        summary: 'print lines that match a pattern',
        options: {
            i: 'ignore case', v: 'invert: lines that do NOT match', c: 'count matching lines',
            n: 'prefix line numbers', o: 'print only the matched parts', w: 'match whole words',
            x: 'match whole lines', E: 'extended regex (| + ? () {})', F: 'fixed string, no regex',
            P: 'Perl regex (\\d, \\w, lookarounds)', e: 'PATTERN: add a pattern', m: 'NUM: stop after NUM matches',
            A: 'NUM: also print NUM lines after each match', B: 'NUM: also print NUM lines before each match',
            C: 'NUM: NUM lines of context around each match', l: 'print only names of files with a match',
            L: 'print only names of files without a match', h: 'never print file names', H: 'always print file names',
            r: 'search directories recursively', R: 'search directories recursively', q: 'quiet: only the exit status',
            s: 'suppress messages about missing files'
        }
    },
    head: { summary: 'first lines', options: { n: 'NUM: lines (negative = all but last NUM)', c: 'NUM: bytes', q: 'never print file headers', v: 'always print file headers' }, numeric: true },
    tail: { summary: 'last lines', options: { n: 'NUM: lines (+NUM = starting at line NUM)', c: 'NUM: bytes', q: 'never print file headers', v: 'always print file headers' }, numeric: true },
    wc: { summary: 'count lines, words, bytes', options: { l: 'lines', w: 'words', c: 'bytes', m: 'characters', L: 'length of the longest line' } },
    sort: {
        summary: 'sort lines (byte order, like LC_ALL=C)',
        options: {
            n: 'numeric', h: 'human numeric (2K, 1G)', V: 'version order (file2 < file10)', r: 'reverse',
            u: 'unique', f: 'ignore case', b: 'ignore leading blanks', s: 'stable (no last-resort comparison)',
            c: 'check whether input is sorted', t: 'SEP: field separator', k: 'KEY: sort key, e.g. 2 or 2,2 or 3n',
            o: 'FILE: write the result to FILE'
        }
    },
    uniq: { summary: 'collapse adjacent duplicates', options: { c: 'prefix counts', d: 'only duplicated lines', u: 'only unique lines', i: 'ignore case' } },
    cut: {
        summary: 'cut out fields or characters',
        options: { d: 'DELIM: field delimiter (default TAB)', f: 'LIST: fields', c: 'LIST: characters', b: 'LIST: bytes', s: 'skip lines without the delimiter' }
    },
    tr: { summary: 'translate or delete characters', options: { d: 'delete SET1', s: 'squeeze repeats', c: 'complement SET1' } },
    sed: {
        summary: 'stream editor',
        options: { n: 'no automatic printing', E: 'extended regex', r: 'extended regex', e: 'SCRIPT: add a script', i: 'edit files in place', s: 'treat files separately' }
    },
    awk: { summary: 'pattern scanning and processing language', options: { F: 'FS: field separator', v: 'VAR=VALUE: set a variable' } },
    nl: { summary: 'number lines', options: { b: 'STYLE: a = all lines, t = non-empty (default), n = none', w: 'NUM: number width', s: 'STR: separator' } },
    paste: { summary: 'merge lines of files side by side', options: { s: 'serial: one file per line', d: 'LIST: delimiters' } },
    rev: { summary: 'reverse characters of each line', options: {} },
    tac: { summary: 'reverse line order', options: {} },
    cat: { summary: 'print files', options: { n: 'number all lines', b: 'number non-empty lines', s: 'squeeze blank lines', E: 'show $ at line ends', A: 'show tabs (^I) and line ends ($)', T: 'show tabs as ^I' } },
    echo: { summary: 'print arguments', options: { n: 'no trailing newline', e: 'interpret \\n, \\t ...', E: 'do not interpret escapes' } },
    printf: { summary: 'formatted output: printf FORMAT [ARG]...', options: {} },
    seq: { summary: 'print a sequence of numbers', options: { s: 'SEP: separator', w: 'pad with zeros to equal width', f: 'FORMAT: printf format, e.g. %03g' } },
    tee: { summary: 'copy input to files and to the output', options: { a: 'append instead of overwrite' } },
    ls: { summary: 'list files', options: { 1: 'one name per line', F: 'mark directories with /', p: 'mark directories with /', a: 'include . and ..', A: 'almost all (no hidden files here)' } },
    fold: { summary: 'wrap lines to a width', options: { w: 'NUM: width (default 80)', s: 'break at spaces', b: 'count bytes' } },
    column: { summary: 'format input as a table', options: { t: 'table mode (required)', s: 'SEPS: input separators', o: 'SEP: output separator (default two spaces)' } },
    comm: { summary: 'compare two sorted files line by line', options: { 1: 'hide lines only in file 1', 2: 'hide lines only in file 2', 3: 'hide lines in both' } },
    join: {
        summary: 'join lines of two sorted files on a common field',
        options: {
            t: 'CHAR: field separator', 1: 'FIELD: join field of file 1', 2: 'FIELD: join field of file 2',
            j: 'FIELD: join field of both files', a: 'FILENUM: also print unpairable lines of that file',
            v: 'FILENUM: only unpairable lines of that file', i: 'ignore case', o: 'FORMAT: output fields, e.g. 1.1,2.2',
            e: 'EMPTY: text for missing fields'
        }
    }
};

function optSpec(cmd) {
    const { options, numeric } = commandSpecs[cmd];
    let flags = '', args = '';
    for (const [k, desc] of Object.entries(options)) {
        if (/^[A-Z][A-Z=]*:/.test(desc)) args += k;
        else flags += k;
    }
    return { flags, args, numeric };
}

function parseArgs(cmd, argv) {
    return getopt(cmd, argv, optSpec(cmd));
}

function last(values) {
    return values[values.length - 1];
}

function parseCount(cmd, value, what, allowSign = '') {
    const re = allowSign ? new RegExp(`^[${allowSign}]?\\d+$`) : /^\d+$/;
    if (!re.test(value)) throw new Error(`${cmd}: invalid number of ${what}: '${value}'`);
    return value;
}

function fail(message, status = 1) {
    const e = new Error(message);
    e.status = status;
    return e;
}

// ---------------------------------------------------------------------------
// Reading inputs: file operands, "-" or standard input
// ---------------------------------------------------------------------------

const MISSING = {
    head: (n) => `head: cannot open '${n}' for reading: No such file or directory`,
    tail: (n) => `tail: cannot open '${n}' for reading: No such file or directory`,
    tac: (n) => `tac: failed to open '${n}' for reading: No such file or directory`,
    sort: (n) => `sort: cannot read: ${n}: No such file or directory`,
};

function missingMessage(cmd, name, io) {
    const msg = MISSING[cmd] ? MISSING[cmd](name) : `${cmd}: ${name}: No such file or directory`;
    return io.noFiles ? `${msg} (this task has no files — commands read the Input panel)` : msg;
}

// Returns [{ name, text }] for the operands (stdin when there are none).
// Missing files are reported on stderr and set the status to 1. With
// `streaming`, errors are placed after the output of the preceding files
// (for commands like cat that write as they read).
function readInputs(cmd, operands, io, { streaming = false } = {}) {
    if (!operands.length) return [{ name: '-', text: io.stdin() }];
    const inputs = [];
    let offset = 0;
    for (const op of operands) {
        if (op === '-') {
            inputs.push({ name: '-', text: io.stdin() });
            continue;
        }
        try {
            inputs.push({ name: op, text: io.readFile(op) });
        } catch (e) {
            io.error(e.code === 'EISDIR' ? `${cmd}: ${op}: Is a directory` : missingMessage(cmd, op, io), streaming ? offset : 0);
            io.setStatus(1);
        }
        if (inputs.length) offset = inputs.reduce((n, inp) => n + inp.text.length, 0);
    }
    return inputs;
}

function readLines(cmd, operands, io) {
    return readInputs(cmd, operands, io).flatMap(inp => toLines(inp.text));
}

function readOne(cmd, name, io) {
    if (name === '-') return io.stdin();
    try {
        return io.readFile(name);
    } catch (e) {
        throw fail(e.code === 'EISDIR' ? `${cmd}: ${name}: Is a directory` : missingMessage(cmd, name, io));
    }
}

// ---------------------------------------------------------------------------
// sort helpers
// ---------------------------------------------------------------------------

const isBlank = (c) => c === ' ' || c === '\t';

function parseKeyDef(spec) {
    const m = spec.match(/^(\d+)(?:\.(\d+))?([bfnrhV]*)(?:,(\d+)(?:\.(\d+))?([bfnrhV]*))?$/);
    if (!m) throw new Error(`sort: invalid key '${spec}' (supported: F[.C][bfhnrV][,F[.C][bfhnrV]])`);
    const sf = Number(m[1]);
    if (sf === 0) throw new Error(`sort: field number is zero: invalid field specification '${spec}'`);
    if (m[4] !== undefined && Number(m[4]) === 0) throw new Error(`sort: field number is zero: invalid field specification '${spec}'`);
    const letters = (m[3] || '') + (m[6] || '');
    return {
        sf,
        sc: m[2] ? Number(m[2]) : 1,
        ef: m[4] !== undefined ? Number(m[4]) : null,
        ec: m[5] ? Number(m[5]) : 0,
        bStart: (m[3] || '').includes('b'),
        bEnd: (m[6] || '').includes('b'),
        hasOpts: letters !== '',
        opts: { n: letters.includes('n'), r: letters.includes('r'), f: letters.includes('f'), h: letters.includes('h'), V: letters.includes('V') }
    };
}

// Without -t a field is a run of non-blanks together with the blanks before it.
function fieldBounds(line, tab) {
    const bounds = [];
    if (tab !== null) {
        let start = 0;
        for (let i = 0; i <= line.length; i++) {
            if (i === line.length || line[i] === tab) {
                bounds.push([start, i]);
                start = i + 1;
            }
        }
        return bounds;
    }
    let i = 0;
    while (i < line.length) {
        const start = i;
        while (i < line.length && isBlank(line[i])) i++;
        while (i < line.length && !isBlank(line[i])) i++;
        bounds.push([start, i]);
    }
    return bounds;
}

function extractKey(line, key, tab, globalB) {
    const b = fieldBounds(line, tab);
    const skip = (pos, limit) => {
        while (pos < limit && isBlank(line[pos])) pos++;
        return pos;
    };
    let begin;
    if (key.sf > b.length) {
        begin = line.length;
    } else {
        const [fs, fe] = b[key.sf - 1];
        begin = (key.bStart || (!key.hasOpts && globalB)) ? skip(fs, fe) : fs;
        begin = Math.min(begin + key.sc - 1, fe);
    }
    let end;
    if (key.ef === null || key.ef > b.length) {
        end = line.length;
    } else {
        const [fs, fe] = b[key.ef - 1];
        if (key.ec === 0) end = fe;
        else {
            const start = (key.bEnd || (!key.hasOpts && globalB)) ? skip(fs, fe) : fs;
            end = Math.min(start + key.ec, fe);
        }
    }
    return end > begin ? line.slice(begin, end) : '';
}

function parseSortNumber(s) {
    const m = s.match(/^[ \t]*(-?(?:\d+\.?\d*|\.\d+))/);
    return m ? parseFloat(m[1]) : 0;
}

const SI_SUFFIXES = 'KMGTPEZYRQ';
// sort -h: compare by the size suffix first, then by the number
function humanKey(s) {
    const m = s.match(/^[ \t]*(-?)(\d+\.?\d*|\.\d+)?([kKMGTPEZYRQ]?)/);
    if (!m || m[2] === undefined) return { sign: 0, mag: -1, num: 0 };
    const num = parseFloat(m[2]);
    const sign = m[1] ? -1 : num === 0 ? 0 : 1;
    const mag = m[3] ? SI_SUFFIXES.indexOf(m[3].toUpperCase()) + 1 : 0;
    return { sign, mag, num };
}

function compareHuman(a, b) {
    const x = humanKey(a), y = humanKey(b);
    if (x.sign !== y.sign) return x.sign - y.sign;
    const dir = x.sign < 0 ? -1 : 1;
    if (x.mag !== y.mag) return (x.mag - y.mag) * dir;
    return x.num < y.num ? -dir : x.num > y.num ? dir : 0;
}

// sort -V (GNU filevercmp / dpkg verrevcmp)
function verOrder(c) {
    if (c === undefined) return 0;
    if (/[0-9]/.test(c)) return 0;
    if (/[A-Za-z]/.test(c)) return c.charCodeAt(0);
    if (c === '~') return -1;
    return c.charCodeAt(0) + 256;
}

function verrevcmp(a, b) {
    let i = 0, j = 0;
    while (i < a.length || j < b.length) {
        let firstDiff = 0;
        while ((i < a.length && !/[0-9]/.test(a[i])) || (j < b.length && !/[0-9]/.test(b[j]))) {
            const ac = i < a.length ? verOrder(a[i]) : 0;
            const bc = j < b.length ? verOrder(b[j]) : 0;
            if (ac !== bc) return ac - bc;
            i++; j++;
        }
        while (a[i] === '0') i++;
        while (b[j] === '0') j++;
        while (/[0-9]/.test(a[i] ?? '') && /[0-9]/.test(b[j] ?? '')) {
            if (!firstDiff) firstDiff = a.charCodeAt(i) - b.charCodeAt(j);
            i++; j++;
        }
        if (/[0-9]/.test(a[i] ?? '')) return 1;
        if (/[0-9]/.test(b[j] ?? '')) return -1;
        if (firstDiff) return firstDiff;
    }
    return 0;
}

function compareVersion(a, b) {
    if (a === b) return 0;
    if (a === '') return -1;
    if (b === '') return 1;
    if (a === '.') return -1;
    if (b === '.') return 1;
    if (a === '..') return -1;
    if (b === '..') return 1;
    if (a[0] === '.' && b[0] !== '.') return -1;
    if (a[0] !== '.' && b[0] === '.') return 1;
    if (a[0] === '.' && b[0] === '.') { a = a.slice(1); b = b.slice(1); }
    const suffix = /(\.[A-Za-z~][A-Za-z0-9~]*)*$/;
    const ap = a.slice(0, a.length - a.match(suffix)[0].length);
    const bp = b.slice(0, b.length - b.match(suffix)[0].length);
    const r = ap === bp ? verrevcmp(a, b) : verrevcmp(ap, bp);
    return r === 0 ? (a < b ? -1 : 1) : r;
}

function compareBy(a, b, o) {
    if (o.n) {
        const x = parseSortNumber(a), y = parseSortNumber(b);
        return x < y ? -1 : x > y ? 1 : 0;
    }
    if (o.h) return compareHuman(a, b);
    if (o.b) { a = a.replace(/^[ \t]+/, ''); b = b.replace(/^[ \t]+/, ''); }
    if (o.f) { a = a.toUpperCase(); b = b.toUpperCase(); }
    if (o.V) return compareVersion(a, b);
    return a < b ? -1 : a > b ? 1 : 0;
}

// ---------------------------------------------------------------------------
// Escapes for echo -e / printf
// ---------------------------------------------------------------------------

// Returns { text, stop } — stop is true after \c (produce no further output)
function backslashEscapes(s, { octalNeedsZero }) {
    let out = '';
    for (let i = 0; i < s.length; i++) {
        if (s[i] !== '\\' || i + 1 >= s.length) { out += s[i]; continue; }
        const c = s[++i];
        const simple = { a: '\x07', b: '\b', e: '\x1b', f: '\f', n: '\n', r: '\r', t: '\t', v: '\v', '\\': '\\' };
        if (c in simple) { out += simple[c]; continue; }
        if (c === 'c') return { text: out, stop: true };
        if (c === 'x') {
            const m = s.slice(i + 1).match(/^[0-9A-Fa-f]{1,2}/);
            if (m) { out += String.fromCharCode(parseInt(m[0], 16)); i += m[0].length; continue; }
            out += '\\x';
            continue;
        }
        if (octalNeedsZero ? c === '0' : /[0-7]/.test(c)) {
            const m = s.slice(octalNeedsZero ? i + 1 : i).match(/^[0-7]{0,3}/);
            out += String.fromCharCode(parseInt(m[0] || '0', 8) & 0xff);
            i += octalNeedsZero ? m[0].length : m[0].length - 1;
            continue;
        }
        if (!octalNeedsZero && c === '"') { out += '"'; continue; }
        out += '\\' + c;
    }
    return { text: out, stop: false };
}

// ---------------------------------------------------------------------------
// grep
// ---------------------------------------------------------------------------

function grep(args, io) {
    const { opts, operands } = parseArgs('grep', args);
    let patterns;
    if (opts.e) {
        patterns = opts.e;
    } else {
        if (!operands.length) throw fail('Usage: grep [OPTION]... PATTERNS [FILE]... — the pattern is missing', 2);
        patterns = [operands.shift()];
    }
    patterns = patterns.flatMap(p => p.split('\n'));

    const mode = opts.P ? 'perl' : opts.E ? 'extended' : 'basic';
    let sources;
    try {
        sources = patterns.map(p => (opts.F ? escapeRegex(p) : translateRegex(p, { mode, tool: 'grep', warn: io.warn }).source));
    } catch (e) {
        throw fail(e.message, 2);
    }
    let source = sources.length === 1 ? sources[0] : sources.map(s => `(?:${s})`).join('|');
    if (opts.x) source = `^(?:${source})$`;
    else if (opts.w) source = `(?<![A-Za-z0-9_])(?:${source})(?![A-Za-z0-9_])`;
    let regex;
    try {
        regex = new RegExp(source, opts.i ? 'gi' : 'g');
    } catch (e) {
        throw fail(`grep: invalid regular expression: ${patterns.join(' ')}`, 2);
    }

    const num = (o, what) => (opts[o] ? Number(parseCount('grep', last(opts[o]), what)) : null);
    const max = num('m', 'matches') ?? Infinity;
    const ctx = num('C', 'context lines') ?? 0;
    const after = num('A', 'context lines') ?? ctx;
    const before = num('B', 'context lines') ?? ctx;
    const useContext = (after > 0 || before > 0) && !opts.o && !opts.c && !opts.l && !opts.L && !opts.q;

    // Collect inputs (with recursion into directories for -r)
    const recursive = opts.r || opts.R;
    const targets = operands.length ? operands : recursive ? [null] : [];
    const inputs = [];
    let hadError = false;
    let walkedDir = false;
    if (!targets.length) inputs.push({ name: '(standard input)', text: io.stdin() });
    for (const t of targets) {
        if (t === '-') { inputs.push({ name: '(standard input)', text: io.stdin() }); continue; }
        const path = t ?? '.';
        if (io.isDir(path)) {
            if (!recursive) {
                if (!opts.s) io.error(`grep: ${t}: Is a directory`);
                hadError = true;
                continue;
            }
            walkedDir = true;
            const base = normalizePath(path);
            for (const file of io.walk(path)) {
                const rel = base ? file.slice(base.length + 1) : file;
                const shown = t === null ? file : `${t.replace(/\/+$/, '')}/${rel}`;
                inputs.push({ name: shown, text: io.readFile(file) });
            }
            continue;
        }
        try {
            inputs.push({ name: t, text: io.readFile(t) });
        } catch (e) {
            if (!opts.s) io.error(missingMessage('grep', t, io));
            hadError = true;
        }
    }

    const showNames = opts.H ? true : opts.h ? false : operands.length > 1 || (recursive && walkedDir);
    const out = [];
    let anyMatch = false;
    let printedGroup = false;

    for (const { name, text } of inputs) {
        const lines = toLines(text);
        let count = 0;
        let lastPrinted = -1;
        let afterLeft = 0;
        const prefix = (idx, sep) => (showNames ? name + sep : '') + (opts.n ? `${idx + 1}${sep}` : '');
        const printLine = (idx, sep) => {
            if (useContext && lastPrinted !== -1 && idx > lastPrinted + 1) out.push('--');
            else if (useContext && lastPrinted === -1 && printedGroup) out.push('--');
            out.push(prefix(idx, sep) + lines[idx]);
            lastPrinted = idx;
            printedGroup = true;
        };

        for (let idx = 0; idx < lines.length; idx++) {
            if (count >= max) {
                if (useContext && afterLeft > 0) {
                    printLine(idx, '-');
                    afterLeft--;
                    continue;
                }
                break;
            }
            regex.lastIndex = 0;
            const selected = regex.test(lines[idx]) !== !!opts.v;
            if (!selected) {
                if (useContext && afterLeft > 0) {
                    printLine(idx, '-');
                    afterLeft--;
                }
                continue;
            }
            count++;
            anyMatch = true;
            if (opts.q || opts.l || opts.L || opts.c) continue;
            if (useContext) {
                for (let b = Math.max(lastPrinted + 1, idx - before); b < idx; b++) printLine(b, '-');
            }
            if (opts.o) {
                if (opts.v) continue;
                regex.lastIndex = 0;
                for (const m of lines[idx].matchAll(regex)) {
                    if (m[0] !== '') out.push(prefix(idx, ':') + m[0]);
                }
            } else {
                printLine(idx, ':');
            }
            afterLeft = after;
        }

        if (opts.c && !opts.q && !opts.l && !opts.L) out.push((showNames ? name + ':' : '') + count);
        if (opts.l && count > 0) out.push(name);
        if (opts.L && count === 0) out.push(name);
    }

    if (opts.q) {
        io.setStatus(anyMatch ? 0 : hadError ? 2 : 1);
        return '';
    }
    io.setStatus(hadError ? 2 : anyMatch ? 0 : 1);
    return fromLines(out);
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

function headOrTailWithHeaders(cmd, opts, operands, io, fn) {
    const inputs = readInputs(cmd, operands, io);
    const headers = opts.v || (!opts.q && operands.length > 1);
    return inputs.map((inp, i) => {
        const title = inp.name === '-' ? 'standard input' : inp.name;
        return (headers ? `${i ? '\n' : ''}==> ${title} <==\n` : '') + fn(inp.text);
    }).join('');
}

export const commands = {
    cat: (args, io) => {
        const { opts, operands } = parseArgs('cat', args);
        const raw = readInputs('cat', operands, io, { streaming: true }).map(inp => inp.text).join('');
        if (!opts.n && !opts.b && !opts.s && !opts.E && !opts.A && !opts.T) return raw;
        let lines = toLines(raw);
        if (opts.s) lines = lines.filter((l, i) => !(l === '' && i > 0 && lines[i - 1] === ''));
        let n = 0;
        lines = lines.map(line => {
            let out = line;
            if (opts.A || opts.T) out = out.replace(/\t/g, '^I');
            if (opts.b ? line !== '' : opts.n) out = `${String(++n).padStart(6)}\t${out}`;
            if (opts.E || opts.A) out += '$';
            return out;
        });
        return fromLines(lines);
    },

    nl: (args, io) => {
        const { opts, operands } = parseArgs('nl', args);
        const style = opts.b ? last(opts.b) : 't';
        if (!['a', 't', 'n'].includes(style)) throw new Error(`nl: invalid body numbering style: '${style}' (supported: a, t, n)`);
        const width = opts.w ? Number(parseCount('nl', last(opts.w), 'line number field width')) : 6;
        const sep = opts.s ? last(opts.s) : '\t';
        let counter = 1;
        return fromLines(readLines('nl', operands, io).map(line => {
            const numbered = style === 'a' || (style === 't' && line !== '');
            if (!numbered) return ' '.repeat(width + sep.length) + line;
            return `${String(counter++).padStart(width)}${sep}${line}`;
        }));
    },

    grep,

    head: (args, io) => {
        const { opts, operands } = parseArgs('head', args);
        let fn;
        if (opts.c) {
            const n = Number(parseCount('head', last(opts.c), 'bytes', '-'));
            fn = (text) => (n >= 0 ? text.slice(0, n) : text.slice(0, Math.max(0, text.length + n)));
        } else {
            const value = opts.n ? last(opts.n) : (opts.num ?? '10');
            const n = Number(parseCount('head', value, 'lines', '-'));
            fn = (text) => {
                const lines = toLines(text);
                return fromLines(n >= 0 ? lines.slice(0, n) : lines.slice(0, Math.max(0, lines.length + n)));
            };
        }
        return headOrTailWithHeaders('head', opts, operands, io, fn);
    },

    tail: (args, io) => {
        // obsolete but still accepted form: tail +2 [file]
        const argv = args.length && /^\+\d+$/.test(args[0]) ? ['-n', ...args] : args;
        const { opts, operands } = parseArgs('tail', argv);
        let fn;
        if (opts.c) {
            const v = parseCount('tail', last(opts.c), 'bytes', '+-');
            const n = Math.abs(Number(v));
            fn = (text) => (v.startsWith('+') ? text.slice(Math.max(0, n - 1)) : n === 0 ? '' : text.slice(-n));
        } else {
            const value = opts.n ? last(opts.n) : (opts.num ?? '10');
            const v = parseCount('tail', value, 'lines', '+-');
            const n = Math.abs(Number(v));
            fn = (text) => {
                const lines = toLines(text);
                if (v.startsWith('+')) return fromLines(lines.slice(Math.max(0, n - 1)));
                return fromLines(n === 0 ? [] : lines.slice(-n));
            };
        }
        return headOrTailWithHeaders('tail', opts, operands, io, fn);
    },

    wc: (args, io) => {
        const { opts, operands } = parseArgs('wc', args);
        const inputs = readInputs('wc', operands, io);
        const count = (text) => ({
            l: (text.match(/\n/g) || []).length,
            w: text.split(/\s+/).filter(Boolean).length,
            m: [...text].length,
            c: new TextEncoder().encode(text).length,
            L: Math.max(0, ...toLines(text).map(l => [...l.replace(/\t/g, '        ')].length))
        });
        const selected = ['l', 'w', 'm', 'c', 'L'].filter(k => opts[k]);
        const shown = selected.length ? selected : ['l', 'w', 'c'];
        const results = inputs.map(inp => ({ name: operands.length ? inp.name : null, counts: count(inp.text), stdin: inp.name === '-' }));
        const total = { l: 0, w: 0, m: 0, c: 0, L: 0 };
        for (const r of results) {
            for (const k of ['l', 'w', 'm', 'c']) total[k] += r.counts[k];
            total.L = Math.max(total.L, r.counts.L);
        }
        const nfiles = Math.max(1, operands.length);
        let width;
        if (shown.length === 1 && nfiles === 1) {
            width = 1;
        } else {
            const regular = results.filter(r => !r.stdin).reduce((s, r) => s + r.counts.c, 0);
            width = Math.max(String(regular).length, results.some(r => r.stdin) || !results.length ? 7 : 1);
        }
        const line = (counts, name) => shown.map(k => String(counts[k]).padStart(width)).join(' ') + (name !== null ? ` ${name}` : '');
        const out = results.map(r => line(r.counts, r.name));
        if (operands.length > 1) out.push(line(total, 'total'));
        return fromLines(out);
    },

    sort: (args, io) => {
        const { opts, operands } = parseArgs('sort', args);
        let tab = null;
        if (opts.t) {
            tab = last(opts.t);
            if (tab === '\\t') tab = '\t';
            if (tab === '') throw new Error('sort: empty tab');
            if (tab.length !== 1) throw new Error(`sort: multi-character tab '${tab}'`);
        }
        const kinds = ['n', 'h', 'V'].filter(k => opts[k]);
        if (kinds.length > 1) throw fail(`sort: options '-${kinds.join('')}' are incompatible`, 2);
        const global = { n: !!opts.n, h: !!opts.h, V: !!opts.V, r: !!opts.r, f: !!opts.f, b: !!opts.b };
        const keys = (opts.k || []).map(parseKeyDef);

        let lines = [];
        for (const op of operands.length ? operands : ['-']) {
            if (op === '-') { lines.push(...toLines(io.stdin())); continue; }
            try {
                lines.push(...toLines(io.readFile(op)));
            } catch (e) {
                throw fail(e.code === 'EISDIR' ? `sort: read failed: ${op}: Is a directory` : missingMessage('sort', op, io), 2);
            }
        }

        const compareKeys = (a, b) => {
            if (!keys.length) {
                const r = compareBy(a, b, global);
                return global.r ? -r : r;
            }
            for (const key of keys) {
                const o = key.hasOpts ? { ...key.opts, b: false } : { ...global, b: false };
                const r = compareBy(extractKey(a, key, tab, global.b), extractKey(b, key, tab, global.b), o);
                if (r) return o.r ? -r : r;
            }
            return 0;
        };
        const compare = (a, b) => {
            const r = compareKeys(a, b);
            if (r || opts.s || opts.u) return r;
            const lr = a < b ? -1 : a > b ? 1 : 0;
            return global.r ? -lr : lr;
        };

        if (opts.c) {
            for (let i = 1; i < lines.length; i++) {
                const r = compare(lines[i - 1], lines[i]);
                if (r > 0 || (opts.u && r === 0)) {
                    const name = operands[0] && operands[0] !== '-' ? operands[0] : '-';
                    throw fail(`sort: ${name}:${i + 1}: disorder: ${lines[i]}`, 1);
                }
            }
            return '';
        }

        lines.sort(compare);
        if (opts.u) lines = lines.filter((l, i) => i === 0 || compareKeys(lines[i - 1], l) !== 0);
        const result = fromLines(lines);
        if (opts.o) {
            io.writeFile(last(opts.o), result);
            return '';
        }
        return result;
    },

    uniq: (args, io) => {
        const { opts, operands } = parseArgs('uniq', args);
        if (operands.length > 2) throw new Error(`uniq: extra operand '${operands[2]}'`);
        const input = operands.length ? readOne('uniq', operands[0], io) : io.stdin();
        const same = (a, b) => (opts.i ? a.toLowerCase() === b.toLowerCase() : a === b);
        const groups = [];
        for (const line of toLines(input)) {
            const g = groups[groups.length - 1];
            if (g && same(g.line, line)) g.count++;
            else groups.push({ line, count: 1 });
        }
        const result = [];
        for (const g of groups) {
            if (opts.d && g.count < 2) continue;
            if (opts.u && g.count > 1) continue;
            result.push(opts.c ? `${String(g.count).padStart(7)} ${g.line}` : g.line);
        }
        if (operands[1] !== undefined && operands[1] !== '-') {
            io.writeFile(operands[1], fromLines(result));
            return '';
        }
        return fromLines(result);
    },

    cut: (args, io) => {
        const { opts, operands } = parseArgs('cut', args);
        const modes = ['f', 'c', 'b'].filter(m => opts[m]);
        if (modes.length === 0) throw new Error('cut: you must specify a list of bytes, characters, or fields');
        if (modes.length > 1) throw new Error('cut: only one type of list may be specified');
        if (opts.d && !opts.f) throw new Error('cut: an input delimiter may be specified only when operating on fields');
        if (opts.s && !opts.f) throw new Error('cut: suppressing non-delimited lines makes sense only when operating on fields');

        if (opts.f) {
            const delim = opts.d ? last(opts.d) : '\t';
            if (delim === '\\t') throw new Error("cut: the delimiter must be a single character (for TAB type -d$'\\t')");
            if (delim.length !== 1) throw new Error('cut: the delimiter must be a single character');
            const sel = parseRangeSpec(last(opts.f), 'field');
            const out = [];
            for (const line of readLines('cut', operands, io)) {
                if (!line.includes(delim)) {
                    if (!opts.s) out.push(line);
                    continue;
                }
                out.push(line.split(delim).filter((_, i) => sel(i + 1)).join(delim));
            }
            return fromLines(out);
        }
        const sel = parseRangeSpec(last(opts.c || opts.b), 'byte/character');
        return fromLines(readLines('cut', operands, io).map(line => [...line].filter((_, i) => sel(i + 1)).join('')));
    },

    tr: (args, io) => {
        const { opts, operands } = parseArgs('tr', args);
        if (operands.length === 0) throw new Error('tr: missing operand');
        if (operands.length > 2) throw new Error(`tr: extra operand '${operands[2]}' (tr reads only standard input — use tr ... < file)`);
        if (opts.d && !opts.s && operands.length === 2) {
            throw new Error(`tr: extra operand '${operands[1]}' (only one set may be given when deleting)`);
        }
        if (!opts.d && !opts.s && operands.length < 2) {
            throw new Error(`tr: missing operand after '${operands[0]}'`);
        }
        const input = io.stdin();
        const set1 = expandCharSet(operands[0]);
        const inSet1 = opts.c ? (c) => !set1.includes(c) : (c) => set1.includes(c);
        const squeeze = (text, inSet) => {
            let out = '';
            let prev = null;
            for (const c of text) {
                if (c === prev && inSet(c)) continue;
                out += c;
                prev = c;
            }
            return out;
        };

        if (opts.d) {
            let out = [...input].filter(c => !inSet1(c)).join('');
            if (opts.s) {
                const set2 = expandCharSet(operands[1]);
                out = squeeze(out, c => set2.includes(c));
            }
            return out;
        }
        if (operands.length === 2) {
            if (opts.c) throw new Error('tr: -c together with translation is not supported in this trainer');
            const set2 = expandCharSet(operands[1]);
            if (set2 === '') throw new Error('tr: when not truncating set1, string2 must be non-empty');
            const map = new Map();
            [...set1].forEach((c, i) => map.set(c, set2[Math.min(i, set2.length - 1)]));
            const out = [...input].map(c => (map.has(c) ? map.get(c) : c)).join('');
            return opts.s ? squeeze(out, c => set2.includes(c)) : out;
        }
        return squeeze(input, inSet1);
    },

    rev: (args, io) => {
        const { operands } = parseArgs('rev', args);
        return fromLines(readLines('rev', operands, io).map(line => [...line].reverse().join('')));
    },

    tac: (args, io) => {
        const { operands } = parseArgs('tac', args);
        return readInputs('tac', operands, io).map(inp => fromLines(toLines(inp.text).reverse())).join('');
    },

    paste: (args, io) => {
        const { opts, operands } = parseArgs('paste', args);
        const spec = opts.d ? last(opts.d) : '\t';
        const delims = [];
        for (let i = 0; i < spec.length; i++) {
            if (spec[i] === '\\' && i + 1 < spec.length) {
                const n = spec[++i];
                delims.push(n === 'n' ? '\n' : n === 't' ? '\t' : n === '0' ? '' : n);
            } else {
                delims.push(spec[i]);
            }
        }
        if (delims.length === 0) delims.push('');
        const join = (items) => items.reduce((acc, item, i) => (i === 0 ? item : acc + delims[(i - 1) % delims.length] + item), '');

        const names = operands.length ? operands : ['-'];
        // every "-" shares standard input, taking lines in turn
        const stdinLines = names.includes('-') ? toLines(io.stdin()) : [];
        const stdinCount = names.filter(n => n === '-').length;
        const columns = [];
        let dashIndex = 0;
        for (const name of names) {
            if (name === '-') {
                const k = dashIndex++;
                columns.push(opts.s && k === 0 ? stdinLines : stdinLines.filter((_, i) => i % stdinCount === k));
                continue;
            }
            columns.push(toLines(readOne('paste', name, io)));
        }
        if (opts.s) return columns.map(col => join(col) + '\n').join('');
        const rows = Math.max(0, ...columns.map(c => c.length));
        const out = [];
        for (let r = 0; r < rows; r++) out.push(join(columns.map(c => c[r] ?? '')));
        return fromLines(out);
    },

    echo: (args) => {
        let newline = true;
        let escapes = false;
        let i = 0;
        for (; i < args.length; i++) {
            if (!/^-[neE]+$/.test(args[i])) break;
            for (const c of args[i].slice(1)) {
                if (c === 'n') newline = false;
                else if (c === 'e') escapes = true;
                else escapes = false;
            }
        }
        let text = args.slice(i).join(' ');
        if (escapes) {
            const r = backslashEscapes(text, { octalNeedsZero: true });
            if (r.stop) return r.text;
            text = r.text;
        }
        return newline ? text + '\n' : text;
    },

    printf: (args, io) => {
        if (!args.length) throw fail('printf: usage: printf format [arguments]', 2);
        const [format, ...rest] = args;
        const fmt = backslashEscapes(format, { octalNeedsZero: false });
        const specRe = /%[-+ #0]*(\*|\d+)?(?:\.(\*|\d*))?([diouxXcseEfFgGb%])/g;
        const specs = [...fmt.text.matchAll(specRe)].filter(s => s[3] !== '%');
        // arguments consumed per pass over the format (a * width takes one too)
        const perPass = specs.reduce((n, s) => n + 1 + (s[1] === '*' ? 1 : 0) + (s[2] === '*' ? 1 : 0), 0);
        const f = fmt.text.replace(specRe, (m, w, p, conv) => (conv === 'b' ? m.slice(0, -1) + 's' : m));
        const num = (v) => {
            if (v === undefined || v === '') return 0;
            if (/^['"]/.test(v)) return v.length > 1 ? v.codePointAt(1) : 0;
            const t = v.trim();
            const n = /^[-+]?0[xX][0-9a-fA-F]+$/.test(t) ? parseInt(t, 16) : /^[-+]?0[0-7]+$/.test(t) ? parseInt(t, 8) : Number(t);
            if (Number.isNaN(n)) {
                io.error(`printf: '${v}': invalid number`);
                io.setStatus(1);
                return parseFloat(t) || 0;
            }
            return n;
        };
        // The format is reused until all arguments are consumed
        let out = '';
        let k = 0;
        do {
            const values = rest.slice(k, k + perPass);
            let pos = 0;
            for (const s of specs) {
                if (s[1] === '*') pos++;
                if (s[2] === '*') pos++;
                if (s[3] === 'b' && values[pos] !== undefined) {
                    values[pos] = backslashEscapes(values[pos], { octalNeedsZero: true }).text;
                }
                pos++;
            }
            out += sprintf(f, values, { num, str: (v) => (v === undefined ? '' : String(v)), isNum: () => false });
            k += perPass;
        } while (perPass > 0 && k < rest.length);
        return out;
    },

    seq: (args, io) => {
        // negative numbers are operands, not options
        const argv = args.map(a => (/^-\d/.test(a) || /^-\.\d/.test(a) ? `\u0000${a}` : a));
        const { opts, operands: raw } = parseArgs('seq', argv);
        const operands = raw.map(a => a.replace(/^\u0000/, ''));
        if (operands.length < 1) throw new Error('seq: missing operand');
        if (operands.length > 3) throw new Error(`seq: extra operand '${operands[3]}'`);
        for (const a of operands) {
            if (!/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(a)) throw new Error(`seq: invalid floating point argument: '${a}'`);
        }
        const [firstS, stepS, lastS] = operands.length === 1 ? ['1', '1', operands[0]]
            : operands.length === 2 ? [operands[0], '1', operands[1]] : operands;
        const decimals = (s) => (/[eE]/.test(s) ? 0 : (s.split('.')[1] || '').length);
        const prec = Math.max(decimals(firstS), decimals(stepS));
        const scale = 10 ** prec;
        const first = Math.round(parseFloat(firstS) * scale);
        const step = Math.round(parseFloat(stepS) * scale);
        const lastV = parseFloat(lastS) * scale;
        if (step === 0) throw new Error(`seq: invalid Zero increment value: '${stepS}'`);
        const values = [];
        for (let v = first; step > 0 ? v <= lastV + 1e-9 : v >= lastV - 1e-9; v += step) {
            values.push(v / scale);
            if (values.length > 100000) throw new Error('seq: too many numbers for this trainer');
        }
        let fmtNum;
        if (opts.f) {
            const f = last(opts.f);
            fmtNum = (v) => sprintf(f, [v]);
        } else {
            fmtNum = (v) => (prec ? v.toFixed(prec) : String(Math.round(v)));
        }
        let strs = values.map(fmtNum);
        if (opts.w) {
            const width = Math.max(fmtNum(first / scale).length, fmtNum(Math.trunc(lastV) / scale).length, ...strs.map(s => s.length));
            strs = strs.map(s => (s.startsWith('-') ? '-' + s.slice(1).padStart(width - 1, '0') : s.padStart(width, '0')));
        }
        if (!strs.length) return '';
        const sep = opts.s ? last(opts.s) : '\n';
        return strs.join(sep) + '\n';
    },

    tee: (args, io) => {
        const { opts, operands } = parseArgs('tee', args);
        const input = io.stdin();
        for (const f of operands) {
            try {
                io.writeFile(f, input, !!opts.a);
            } catch (e) {
                io.error(`tee: ${f}: ${e.code === 'EISDIR' ? 'Is a directory' : 'No such file or directory'}`);
                io.setStatus(1);
            }
        }
        return input;
    },

    ls: (args, io) => {
        const { opts, operands } = parseArgs('ls', args);
        const mark = (e) => e.name + ((opts.F || opts.p) && e.dir ? '/' : '');
        const dotEntries = opts.a ? ['.', '..'] : [];
        if (!operands.length) {
            return fromLines([...dotEntries, ...io.list('').map(mark)]);
        }
        const files = [];
        const dirs = [];
        for (const op of operands) {
            if (io.isDir(op)) dirs.push(op);
            else if (io.exists(op)) files.push(op);
            else {
                io.error(`ls: cannot access '${op}': No such file or directory`);
                io.setStatus(2);
            }
        }
        files.sort();
        dirs.sort();
        const sections = [];
        if (files.length) sections.push(files.join('\n') + '\n');
        const headers = operands.length > 1;
        for (const d of dirs) {
            const entries = [...dotEntries, ...io.list(d).map(mark)];
            sections.push((headers ? `${d}:\n` : '') + fromLines(entries));
        }
        return sections.join('\n');
    },

    fold: (args, io) => {
        const argv = args.map(a => (/^-\d+$/.test(a) ? `-w${a.slice(1)}` : a));
        const { opts, operands } = parseArgs('fold', argv);
        const width = opts.w ? Number(parseCount('fold', last(opts.w), 'columns')) : 80;
        if (width === 0) throw new Error("fold: invalid number of columns: '0'");
        const adjust = (column, c) => {
            if (opts.b) return column + 1;
            if (c === '\b') return column > 0 ? column - 1 : 0;
            if (c === '\r') return 0;
            if (c === '\t') return column + 8 - (column % 8);
            return column + 1;
        };
        let out = '';
        for (const { text } of readInputs('fold', operands, io)) {
            let line = [];
            let column = 0;
            for (const c of text) {
                if (c === '\n') {
                    out += line.join('') + '\n';
                    line = [];
                    column = 0;
                    continue;
                }
                for (;;) {
                    column = adjust(column, c);
                    if (column <= width) {
                        line.push(c);
                        break;
                    }
                    if (opts.s) {
                        let end = line.length;
                        while (end > 0 && !isBlank(line[end - 1])) end--;
                        if (end > 0) {
                            out += line.slice(0, end).join('') + '\n';
                            line = line.slice(end);
                            column = line.reduce(adjust, 0);
                            continue;
                        }
                    }
                    if (line.length === 0) {
                        line.push(c);
                        break;
                    }
                    out += line.join('') + '\n';
                    line = [];
                    column = 0;
                }
            }
            out += line.join('');
        }
        return out;
    },

    column: (args, io) => {
        const { opts, operands } = parseArgs('column', args);
        if (!opts.t) throw new Error('column: only table mode (column -t) is supported in this trainer');
        const seps = opts.s ? last(opts.s) : ' \t';
        const outSep = opts.o ? last(opts.o) : '  ';
        const splitRe = new RegExp(`[${seps.replace(/[\]\\^-]/g, '\\$&')}]+`);
        const rows = readLines('column', operands, io)
            .filter(l => l.trim() !== '')
            .map(l => l.replace(new RegExp(`^[${seps.replace(/[\]\\^-]/g, '\\$&')}]+`), '').split(splitRe).filter((c, i, a) => i < a.length - 1 || c !== ''));
        const widths = [];
        for (const row of rows) row.forEach((c, i) => { widths[i] = Math.max(widths[i] || 0, [...c].length); });
        return fromLines(rows.map(row => row.map((c, i) => (i === row.length - 1 ? c : c + ' '.repeat(widths[i] - [...c].length))).join(outSep)));
    },

    comm: (args, io) => {
        const { opts, operands } = parseArgs('comm', args);
        if (operands.length < 2) throw new Error(operands.length ? `comm: missing operand after '${operands[0]}'` : 'comm: missing operand');
        if (operands.length > 2) throw new Error(`comm: extra operand '${operands[2]}'`);
        const a = toLines(readOne('comm', operands[0], io));
        const b = toLines(readOne('comm', operands[1], io));
        const prefix2 = opts[1] ? '' : '\t';
        const prefix3 = (opts[1] ? '' : '\t') + (opts[2] ? '' : '\t');
        const out = [];
        const disorder = [false, false];
        const check = (lines, i, k) => {
            if (i > 0 && lines[i - 1] > lines[i] && !disorder[k]) {
                disorder[k] = true;
                io.error(`comm: file ${k + 1} is not in sorted order`);
                io.setStatus(1);
            }
        };
        let i = 0, j = 0;
        while (i < a.length || j < b.length) {
            if (j >= b.length || (i < a.length && a[i] < b[j])) {
                check(a, i, 0);
                if (!opts[1]) out.push(a[i]);
                i++;
            } else if (i >= a.length || b[j] < a[i]) {
                check(b, j, 1);
                if (!opts[2]) out.push(prefix2 + b[j]);
                j++;
            } else {
                check(a, i, 0);
                check(b, j, 1);
                if (!opts[3]) out.push(prefix3 + a[i]);
                i++; j++;
            }
        }
        if (disorder[0] || disorder[1]) io.error('comm: input is not in sorted order');
        return fromLines(out);
    },

    join: (args, io) => {
        const { opts, operands } = parseArgs('join', args);
        if (operands.length < 2) throw new Error(operands.length ? `join: missing operand after '${operands[0]}'` : 'join: missing operand');
        if (operands.length > 2) throw new Error(`join: extra operand '${operands[2]}'`);
        const tab = opts.t ? last(opts.t) : null;
        if (tab !== null && tab.length !== 1) throw new Error(`join: multi-character tab '${tab}'`);
        const fieldNum = (v, what) => {
            if (!/^\d+$/.test(v) || Number(v) === 0) throw new Error(`join: invalid field number: '${v}'`);
            return Number(v) - 1;
        };
        const f1 = opts[1] ? fieldNum(last(opts[1])) : opts.j ? fieldNum(last(opts.j)) : 0;
        const f2 = opts[2] ? fieldNum(last(opts[2])) : opts.j ? fieldNum(last(opts.j)) : 0;
        const unpaired = new Set([...(opts.a || []), ...(opts.v || [])]);
        for (const n of unpaired) if (n !== '1' && n !== '2') throw new Error(`join: invalid file number: '${n}'`);
        const onlyUnpaired = !!opts.v;
        const empty = opts.e ? last(opts.e) : '';
        const sep = tab ?? ' ';
        const split = (line) => (tab !== null ? line.split(tab) : line.trim() === '' ? [] : line.trim().split(/[ \t]+/));
        const keyOf = (fields, f) => {
            const k = fields[f] ?? '';
            return opts.i ? k.toLowerCase() : k;
        };
        const format = opts.o ? last(opts.o).split(/[, ]+/).map(spec => {
            if (spec === '0') return { file: 0 };
            const m = spec.match(/^([12])\.(\d+)$/);
            if (!m || Number(m[2]) === 0) throw new Error(`join: invalid field specifier: '${spec}'`);
            return { file: Number(m[1]), field: Number(m[2]) - 1 };
        }) : null;

        const read = (name) => toLines(readOne('join', name, io)).map(split);
        const A = read(operands[0]);
        const B = read(operands[1]);

        const line = (fa, fb) => {
            if (format) {
                return format.map(s => {
                    if (s.file === 0) return fa ? fa[f1] ?? empty : fb[f2] ?? empty;
                    const src = s.file === 1 ? fa : fb;
                    return src ? src[s.field] ?? empty : empty;
                }).join(sep);
            }
            const key = fa ? fa[f1] ?? '' : fb[f2] ?? '';
            const restA = fa ? fa.filter((_, i) => i !== f1) : [];
            const restB = fb ? fb.filter((_, i) => i !== f2) : [];
            return [key, ...restA, ...restB].join(sep);
        };

        const out = [];
        const warned = [false, false];
        const checkOrder = (rows, i, f, k) => {
            if (i > 0 && keyOf(rows[i - 1], f) > keyOf(rows[i], f) && !warned[k]) {
                warned[k] = true;
                io.error(`join: ${operands[k]}:${i + 1}: is not sorted: ${rows[i].join(sep)}`);
                io.setStatus(1);
            }
        };
        let i = 0, j = 0;
        while (i < A.length || j < B.length) {
            if (i < A.length) checkOrder(A, i, f1, 0);
            if (j < B.length) checkOrder(B, j, f2, 1);
            const ka = i < A.length ? keyOf(A[i], f1) : null;
            const kb = j < B.length ? keyOf(B[j], f2) : null;
            if (kb === null || (ka !== null && ka < kb)) {
                if (unpaired.has('1')) out.push(line(A[i], null));
                i++;
            } else if (ka === null || kb < ka) {
                if (unpaired.has('2')) out.push(line(null, B[j]));
                j++;
            } else {
                let i2 = i, j2 = j;
                while (i2 < A.length && keyOf(A[i2], f1) === ka) i2++;
                while (j2 < B.length && keyOf(B[j2], f2) === kb) j2++;
                if (!onlyUnpaired) {
                    for (let x = i; x < i2; x++) for (let y = j; y < j2; y++) out.push(line(A[x], B[y]));
                }
                i = i2;
                j = j2;
            }
        }
        if (warned[0] || warned[1]) io.error('join: input is not in sorted order');
        return fromLines(out);
    },

    sed,
    awk
};

export const COMMAND_NAMES = Object.keys(commands);

// Runs a command line against the input text and (optionally) a virtual file
// system. Returns the terminal output, stderr, the exit status, every stage
// (for the pipeline inspector) and shell/command warnings.
export function runPipeline(text, cmdLine, { fs = new VirtualFS(), status = 0 } = {}) {
    const stdin = text === '' ? '' : text.endsWith('\n') ? text : text + '\n';
    const r = runScript(cmdLine, { commands, fs, stdin, status });
    return {
        output: r.stdout.endsWith('\n') ? r.stdout.slice(0, -1) : r.stdout,
        stdout: r.stdout,
        stderr: r.stderr,
        status: r.status,
        steps: r.steps,
        warnings: r.warnings,
        fs
    };
}

// Output of a command line; throws if the command reported an error.
export function executePipeline(text, cmdLine, options) {
    const r = runPipeline(text, cmdLine, options);
    if (r.stderr.length) throw new Error(r.stderr.join('\n'));
    return r.output;
}
