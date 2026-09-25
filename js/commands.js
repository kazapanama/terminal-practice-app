// Linux command implementations.
//
// Every command receives the input stream (text in which each line ends with
// "\n", like a real pipe), its argv and an `io` object ({ warn }), and returns
// the output stream. Options are parsed getopt-style; options the trainer does
// not implement raise an error instead of being silently ignored, so a result
// is either what GNU coreutils would print or a clear message.

import {
    expandCharSet, parseRangeSpec, parsePipeline, getopt,
    toLines, fromLines, textToStream, streamToText, escapeRegex
} from './utils.js';
import { translateRegex } from './regex.js';
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
            P: 'Perl regex (\\d, \\w, lookarounds)', e: 'PATTERN: add a pattern', m: 'NUM: stop after NUM matches'
        }
    },
    head: { summary: 'first lines', options: { n: 'NUM: lines (negative = all but last NUM)', c: 'NUM: bytes' }, numeric: true },
    tail: { summary: 'last lines', options: { n: 'NUM: lines (+NUM = starting at line NUM)', c: 'NUM: bytes' }, numeric: true },
    wc: { summary: 'count lines, words, bytes', options: { l: 'lines', w: 'words', c: 'bytes', m: 'characters' } },
    sort: {
        summary: 'sort lines (byte order, like LC_ALL=C)',
        options: {
            n: 'numeric', r: 'reverse', u: 'unique', f: 'ignore case', b: 'ignore leading blanks',
            s: 'stable (no last-resort comparison)', t: 'SEP: field separator', k: 'KEY: sort key, e.g. 2 or 2,2 or 3n'
        }
    },
    uniq: { summary: 'collapse adjacent duplicates', options: { c: 'prefix counts', d: 'only duplicated lines', u: 'only unique lines', i: 'ignore case' } },
    cut: {
        summary: 'cut out fields or characters',
        options: { d: 'DELIM: field delimiter (default TAB)', f: 'LIST: fields', c: 'LIST: characters', b: 'LIST: bytes', s: 'skip lines without the delimiter' }
    },
    tr: { summary: 'translate or delete characters', options: { d: 'delete SET1', s: 'squeeze repeats', c: 'complement SET1' } },
    sed: { summary: 'stream editor', options: { n: 'no automatic printing', E: 'extended regex', r: 'extended regex', e: 'SCRIPT: add a script' } },
    awk: { summary: 'pattern scanning and field processing', options: { F: 'FS: field separator' } },
    nl: { summary: 'number lines', options: { b: 'STYLE: a = all lines, t = non-empty (default), n = none', w: 'NUM: number width', s: 'STR: separator' } },
    paste: { summary: 'merge lines', options: { s: 'serial: join all lines into one', d: 'LIST: delimiters' } },
    rev: { summary: 'reverse characters of each line', options: {} },
    tac: { summary: 'reverse line order', options: {} },
    cat: { summary: 'print input', options: { n: 'number all lines', b: 'number non-empty lines', s: 'squeeze blank lines', E: 'show $ at line ends' } }
};

function optSpec(cmd) {
    const { options, numeric } = commandSpecs[cmd];
    let flags = '', args = '';
    for (const [k, desc] of Object.entries(options)) {
        if (/^[A-Z]+:/.test(desc)) args += k;
        else flags += k;
    }
    return { flags, args, numeric };
}

function parseArgs(cmd, argv) {
    return getopt(cmd, argv, optSpec(cmd));
}

function noFiles(cmd, operands) {
    for (const f of operands) {
        if (f !== '-') {
            throw new Error(`${cmd}: ${f}: No such file or directory (there are no files here — commands read the Input panel)`);
        }
    }
}

function last(values) {
    return values[values.length - 1];
}

function parseCount(cmd, value, what, allowSign = '') {
    const re = allowSign ? new RegExp(`^[${allowSign}]?\\d+$`) : /^\d+$/;
    if (!re.test(value)) throw new Error(`${cmd}: invalid number of ${what}: '${value}'`);
    return value;
}

// ---------------------------------------------------------------------------
// sort helpers
// ---------------------------------------------------------------------------

const isBlank = (c) => c === ' ' || c === '\t';

function parseKeyDef(spec) {
    const m = spec.match(/^(\d+)(?:\.(\d+))?([bfnr]*)(?:,(\d+)(?:\.(\d+))?([bfnr]*))?$/);
    if (!m) throw new Error(`sort: invalid key '${spec}' (supported: F[.C][bfnr][,F[.C][bfnr]])`);
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
        opts: { n: letters.includes('n'), r: letters.includes('r'), f: letters.includes('f') }
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

function compareBy(a, b, o) {
    if (o.n) {
        const x = parseSortNumber(a), y = parseSortNumber(b);
        return x < y ? -1 : x > y ? 1 : 0;
    }
    if (o.b) { a = a.replace(/^[ \t]+/, ''); b = b.replace(/^[ \t]+/, ''); }
    if (o.f) { a = a.toUpperCase(); b = b.toUpperCase(); }
    return a < b ? -1 : a > b ? 1 : 0;
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

export const commands = {
    cat: (input, args) => {
        const { opts, operands } = parseArgs('cat', args);
        noFiles('cat', operands);
        let lines = toLines(input);
        if (opts.s) lines = lines.filter((l, i) => !(l === '' && i > 0 && lines[i - 1] === ''));
        let n = 0;
        lines = lines.map(line => {
            let out = line;
            if (opts.b ? line !== '' : opts.n) out = `${String(++n).padStart(6)}\t${out}`;
            if (opts.E) out += '$';
            return out;
        });
        return fromLines(lines);
    },

    nl: (input, args) => {
        const { opts, operands } = parseArgs('nl', args);
        noFiles('nl', operands);
        const style = opts.b ? last(opts.b) : 't';
        if (!['a', 't', 'n'].includes(style)) throw new Error(`nl: invalid body numbering style: '${style}' (supported: a, t, n)`);
        const width = opts.w ? Number(parseCount('nl', last(opts.w), 'line number field width')) : 6;
        const sep = opts.s ? last(opts.s) : '\t';
        let counter = 1;
        return fromLines(toLines(input).map(line => {
            const numbered = style === 'a' || (style === 't' && line !== '');
            if (!numbered) return ' '.repeat(width + sep.length) + line;
            return `${String(counter++).padStart(width)}${sep}${line}`;
        }));
    },

    grep: (input, args, io) => {
        const { opts, operands } = parseArgs('grep', args);
        let patterns;
        if (opts.e) {
            patterns = opts.e;
        } else {
            if (!operands.length) throw new Error('Usage: grep [OPTION]... PATTERNS — the pattern is missing');
            patterns = [operands.shift()];
        }
        noFiles('grep', operands);
        patterns = patterns.flatMap(p => p.split('\n'));

        const mode = opts.P ? 'perl' : opts.E ? 'extended' : 'basic';
        const sources = patterns.map(p =>
            opts.F ? escapeRegex(p) : translateRegex(p, { mode, tool: 'grep', warn: io.warn }).source
        );
        let source = sources.length === 1 ? sources[0] : sources.map(s => `(?:${s})`).join('|');
        if (opts.x) source = `^(?:${source})$`;
        else if (opts.w) source = `(?<![A-Za-z0-9_])(?:${source})(?![A-Za-z0-9_])`;

        let regex;
        try {
            regex = new RegExp(source, opts.i ? 'gi' : 'g');
        } catch (e) {
            throw new Error(`grep: invalid regular expression: ${patterns.join(' ')}`);
        }
        const max = opts.m ? Number(parseCount('grep', last(opts.m), 'matches')) : Infinity;

        const results = [];
        let matched = 0;
        const lines = toLines(input);
        for (let index = 0; index < lines.length && matched < max; index++) {
            const line = lines[index];
            regex.lastIndex = 0;
            const hit = regex.test(line);
            if (hit === !!opts.v) continue;
            matched++;
            const prefix = opts.n ? `${index + 1}:` : '';
            if (opts.o) {
                if (opts.v) continue;
                regex.lastIndex = 0;
                for (const m of line.matchAll(regex)) {
                    if (m[0] !== '') results.push(prefix + m[0]);
                }
            } else {
                results.push(prefix + line);
            }
        }

        if (opts.c) return `${matched}\n`;
        return fromLines(results);
    },

    head: (input, args) => {
        const { opts, operands } = parseArgs('head', args);
        noFiles('head', operands);
        if (opts.c) {
            const n = Number(parseCount('head', last(opts.c), 'bytes', '-'));
            return n >= 0 ? input.slice(0, n) : input.slice(0, Math.max(0, input.length + n));
        }
        const value = opts.n ? last(opts.n) : (opts.num ?? '10');
        const n = Number(parseCount('head', value, 'lines', '-'));
        const lines = toLines(input);
        return fromLines(n >= 0 ? lines.slice(0, n) : lines.slice(0, Math.max(0, lines.length + n)));
    },

    tail: (input, args) => {
        // obsolete but still accepted form: tail +2
        const argv = args.length === 1 && /^\+\d+$/.test(args[0]) ? ['-n', args[0]] : args;
        const { opts, operands } = parseArgs('tail', argv);
        noFiles('tail', operands);
        if (opts.c) {
            const v = parseCount('tail', last(opts.c), 'bytes', '+-');
            const n = Math.abs(Number(v));
            if (v.startsWith('+')) return input.slice(Math.max(0, n - 1));
            return n === 0 ? '' : input.slice(-n);
        }
        const value = opts.n ? last(opts.n) : (opts.num ?? '10');
        const v = parseCount('tail', value, 'lines', '+-');
        const n = Math.abs(Number(v));
        const lines = toLines(input);
        if (v.startsWith('+')) return fromLines(lines.slice(Math.max(0, n - 1)));
        return fromLines(n === 0 ? [] : lines.slice(-n));
    },

    wc: (input, args) => {
        const { opts, operands } = parseArgs('wc', args);
        noFiles('wc', operands);
        const counts = {
            l: (input.match(/\n/g) || []).length,
            w: input.split(/\s+/).filter(Boolean).length,
            m: [...input].length,
            c: new TextEncoder().encode(input).length
        };
        const selected = ['l', 'w', 'm', 'c'].filter(k => opts[k]);
        const shown = selected.length ? selected : ['l', 'w', 'c'];
        if (shown.length === 1) return `${counts[shown[0]]}\n`;
        return shown.map(k => String(counts[k]).padStart(7)).join(' ') + '\n';
    },

    sort: (input, args) => {
        const { opts, operands } = parseArgs('sort', args);
        noFiles('sort', operands);
        let tab = null;
        if (opts.t) {
            tab = last(opts.t);
            if (tab === '\\t') tab = '\t';
            if (tab === '') throw new Error('sort: empty tab');
            if (tab.length !== 1) throw new Error(`sort: multi-character tab '${tab}'`);
        }
        const global = { n: !!opts.n, r: !!opts.r, f: !!opts.f, b: !!opts.b };
        const keys = (opts.k || []).map(parseKeyDef);

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

        let lines = toLines(input).sort(compare);
        if (opts.u) lines = lines.filter((l, i) => i === 0 || compareKeys(lines[i - 1], l) !== 0);
        return fromLines(lines);
    },

    uniq: (input, args) => {
        const { opts, operands } = parseArgs('uniq', args);
        noFiles('uniq', operands);
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
        return fromLines(result);
    },

    cut: (input, args) => {
        const { opts, operands } = parseArgs('cut', args);
        noFiles('cut', operands);
        const modes = ['f', 'c', 'b'].filter(m => opts[m]);
        if (modes.length === 0) throw new Error('cut: you must specify a list of bytes, characters, or fields');
        if (modes.length > 1) throw new Error('cut: only one type of list may be specified');
        if (opts.d && !opts.f) throw new Error('cut: an input delimiter may be specified only when operating on fields');
        if (opts.s && !opts.f) throw new Error('cut: suppressing non-delimited lines makes sense only when operating on fields');

        if (opts.f) {
            let delim = opts.d ? last(opts.d) : '\t';
            if (delim === '\\t') throw new Error("cut: the delimiter must be a single character (for TAB type -d$'\\t')");
            if (delim.length !== 1) throw new Error('cut: the delimiter must be a single character');
            const sel = parseRangeSpec(last(opts.f), 'field');
            const out = [];
            for (const line of toLines(input)) {
                if (!line.includes(delim)) {
                    if (!opts.s) out.push(line);
                    continue;
                }
                out.push(line.split(delim).filter((_, i) => sel(i + 1)).join(delim));
            }
            return fromLines(out);
        }
        const sel = parseRangeSpec(last(opts.c || opts.b), 'byte/character');
        return fromLines(toLines(input).map(line => [...line].filter((_, i) => sel(i + 1)).join('')));
    },

    tr: (input, args) => {
        const { opts, operands } = parseArgs('tr', args);
        if (operands.length === 0) throw new Error('tr: missing operand');
        if (operands.length > 2) throw new Error(`tr: extra operand '${operands[2]}'`);
        if (opts.d && !opts.s && operands.length === 2) {
            throw new Error(`tr: extra operand '${operands[1]}' (only one set may be given when deleting)`);
        }
        if (!opts.d && !opts.s && operands.length < 2) {
            throw new Error(`tr: missing operand after '${operands[0]}'`);
        }

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

    rev: (input, args) => {
        const { operands } = parseArgs('rev', args);
        noFiles('rev', operands);
        return fromLines(toLines(input).map(line => [...line].reverse().join('')));
    },

    tac: (input, args) => {
        const { operands } = parseArgs('tac', args);
        noFiles('tac', operands);
        return fromLines(toLines(input).reverse());
    },

    paste: (input, args) => {
        const { opts, operands } = parseArgs('paste', args);
        noFiles('paste', operands);
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

        const lines = toLines(input);
        if (opts.s) return join(lines) + '\n';
        // "paste - - -" reads several lines per output row
        const perRow = Math.max(1, operands.length);
        const rows = [];
        for (let i = 0; i < lines.length; i += perRow) {
            rows.push(join(Array.from({ length: perRow }, (_, k) => lines[i + k] ?? '')));
        }
        return fromLines(rows);
    },

    sed,
    awk
};

export const COMMAND_NAMES = Object.keys(commands);

// Runs a command line against text. Returns the final output, every
// intermediate stage (for the pipeline inspector) and shell/command warnings.
// On failure the thrown Error carries the stages that completed (`err.steps`).
export function runPipeline(text, cmdLine) {
    const warnings = [];
    const warn = (msg) => { if (!warnings.includes(msg)) warnings.push(msg); };
    const stages = parsePipeline(cmdLine, warn);
    const steps = [];
    let stream = textToStream(text);

    for (const { source, words } of stages) {
        const [cmd, ...args] = words;
        try {
            if (!Object.prototype.hasOwnProperty.call(commands, cmd)) {
                throw new Error(`bash: ${cmd}: command not found (this trainer knows: ${COMMAND_NAMES.join(', ')})`);
            }
            stream = commands[cmd](stream, args, { warn });
        } catch (e) {
            e.steps = steps;
            e.warnings = warnings;
            throw e;
        }
        steps.push({ command: source, output: streamToText(stream) });
    }

    return { output: streamToText(stream), steps, warnings };
}

export function executePipeline(text, cmdLine) {
    return runPipeline(text, cmdLine).output;
}
