// Utility functions

export function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function pick(array) {
    return array[randInt(0, array.length - 1)];
}

// Picks an element with probability proportional to weight(element).
export function weightedPick(array, weight) {
    const weights = array.map(weight);
    const total = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (let i = 0; i < array.length; i++) {
        r -= weights[i];
        if (r < 0) return array[i];
    }
    return array[array.length - 1];
}

export function shuffle(array) {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

export function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ---------------------------------------------------------------------------
// Streams
// Data flows between commands the way it does through a real pipe: as text in
// which every line ends with "\n". The helpers convert to and from line arrays.
// ---------------------------------------------------------------------------

export function toLines(stream) {
    if (stream === '') return [];
    const body = stream.endsWith('\n') ? stream.slice(0, -1) : stream;
    return body.split('\n');
}

export function fromLines(lines) {
    return lines.map(l => l + '\n').join('');
}

// ---------------------------------------------------------------------------
// tr character sets
// ---------------------------------------------------------------------------

const CHAR_CLASSES = {
    upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    lower: 'abcdefghijklmnopqrstuvwxyz',
    digit: '0123456789',
    alpha: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
    alnum: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
    space: '\t\n\v\f\r ',
    blank: '\t ',
    punct: '!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~',
    xdigit: '0123456789ABCDEFabcdef'
};

const TR_ESCAPES = { n: '\n', t: '\t', r: '\r', f: '\f', v: '\v', a: '\x07', b: '\b', '\\': '\\' };

export function expandCharSet(set) {
    // Tokenize into single characters and [:class:] expansions
    const chars = [];
    for (let i = 0; i < set.length; i++) {
        const cls = set.slice(i).match(/^\[:(\w+):\]/);
        if (cls) {
            if (!(cls[1] in CHAR_CLASSES)) throw new Error(`tr: invalid character class '${cls[1]}'`);
            chars.push({ cls: CHAR_CLASSES[cls[1]] });
            i += cls[0].length - 1;
            continue;
        }
        if (set[i] === '\\' && i + 1 < set.length) {
            const oct = set.slice(i + 1).match(/^[0-7]{1,3}/);
            if (oct) {
                chars.push(String.fromCharCode(parseInt(oct[0], 8)));
                i += oct[0].length;
            } else {
                chars.push(TR_ESCAPES[set[i + 1]] ?? set[i + 1]);
                i++;
            }
            continue;
        }
        chars.push(set[i]);
    }

    let result = '';
    for (let i = 0; i < chars.length; i++) {
        const c = chars[i];
        if (typeof c === 'object') { result += c.cls; continue; }
        const end = chars[i + 2];
        if (chars[i + 1] === '-' && typeof end === 'string') {
            const a = c.charCodeAt(0), b = end.charCodeAt(0);
            if (b < a) throw new Error(`tr: range-endpoints of '${c}-${end}' are in reverse collating sequence order`);
            for (let code = a; code <= b; code++) result += String.fromCharCode(code);
            i += 2;
        } else {
            result += c;
        }
    }
    return result;
}

// ---------------------------------------------------------------------------
// cut-style lists: "1,3", "2-4", "2-", "-3"
// ---------------------------------------------------------------------------

export function parseRangeSpec(rangeStr, what = 'field', cmd = 'cut') {
    const ranges = [];
    for (const part of rangeStr.split(',')) {
        const m = part.match(/^(\d*)(-?)(\d*)$/);
        if (!m || part === '' || part === '-') {
            throw new Error(`${cmd}: invalid ${what} value '${part}'`);
        }
        const [, s, dash, e] = m;
        const start = s === '' ? 1 : Number(s);
        const end = dash ? (e === '' ? Infinity : Number(e)) : start;
        if (start === 0 || end === 0) {
            throw new Error(`${cmd}: ${what}s are numbered from 1`);
        }
        if (end < start) throw new Error(`${cmd}: invalid decreasing range`);
        ranges.push([start, end]);
    }
    return (n) => ranges.some(([a, b]) => n >= a && n <= b);
}

// Raw (still quoted) text of each pipeline stage; used for display.
export function splitPipeline(cmdLine) {
    const parts = [];
    let current = '';
    let inQuote = null;

    for (let i = 0; i < cmdLine.length; i++) {
        const char = cmdLine[i];
        if (inQuote) {
            current += char;
            if (char === inQuote) inQuote = null;
            else if (char === '\\' && inQuote === '"' && i + 1 < cmdLine.length) current += cmdLine[++i];
        } else if (char === '"' || char === "'") {
            current += char;
            inQuote = char;
        } else if (char === '\\' && i + 1 < cmdLine.length) {
            current += char + cmdLine[++i];
        } else if (char === '|') {
            parts.push(current);
            current = '';
        } else {
            current += char;
        }
    }
    parts.push(current);
    return parts;
}

// ---------------------------------------------------------------------------
// Option parsing (getopt-style)
//   spec.flags   - letters of boolean options, e.g. 'ivc'
//   spec.args    - letters of options that take a value, e.g. 'me'
//   spec.numeric - accept -NUM (head -5)
//   spec.permute - options may follow operands (GNU default); false for awk
// Returns { opts, operands }. Boolean options are true, value options are
// arrays of values (so repeated options like -e / -k are preserved).
// ---------------------------------------------------------------------------

export function getopt(cmd, argv, spec = {}) {
    const flags = spec.flags || '';
    const withArg = spec.args || '';
    const permute = spec.permute !== false;
    const opts = {};
    const operands = [];

    let i = 0;
    while (i < argv.length) {
        const a = argv[i++];
        if (a === '--') {
            operands.push(...argv.slice(i));
            break;
        }
        if (a.startsWith('--')) {
            throw new Error(`${cmd}: option '${a.split('=')[0]}' is not supported in this trainer`);
        }
        if (a.length > 1 && a[0] === '-') {
            if (spec.numeric && /^-\d+$/.test(a)) {
                opts.num = a.slice(1);
                continue;
            }
            for (let k = 1; k < a.length; k++) {
                const c = a[k];
                if (withArg.includes(c)) {
                    let value = a.slice(k + 1);
                    if (value === '') {
                        if (i >= argv.length) throw new Error(`${cmd}: option requires an argument -- '${c}'`);
                        value = argv[i++];
                    }
                    (opts[c] ||= []).push(value);
                    break;
                }
                if (flags.includes(c)) {
                    opts[c] = true;
                } else {
                    throw new Error(`${cmd}: invalid option -- '${c}' (not supported in this trainer)`);
                }
            }
            continue;
        }
        operands.push(a);
        if (!permute) {
            operands.push(...argv.slice(i));
            break;
        }
    }
    return { opts, operands };
}
