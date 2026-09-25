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

export function textToStream(text) {
    if (text === '') return '';
    return text.endsWith('\n') ? text : text + '\n';
}

// What a terminal shows for a stream: the final newline is not a visible line.
export function streamToText(stream) {
    return stream.endsWith('\n') ? stream.slice(0, -1) : stream;
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

// ---------------------------------------------------------------------------
// Shell parsing
// Implements the parts of bash that matter for one-line pipelines: quoting,
// backslash escapes, $'...' strings and $VAR expansion (to the empty string,
// just like an unset variable — a classic pitfall with awk in double quotes).
// ---------------------------------------------------------------------------

const UNSUPPORTED_OPERATORS = {
    ';': '";" (running several commands)',
    '&': '"&" / "&&"',
    '>': 'output redirection (">")',
    '<': 'input redirection ("<")',
    '(': 'subshells ("(...)")',
    ')': 'subshells ("(...)")',
    '`': 'command substitution',
};

const ANSI_C_ESCAPES = { n: '\n', t: '\t', r: '\r', '\\': '\\', "'": "'", '"': '"', a: '\x07', b: '\b', e: '\x1b', f: '\f', v: '\v' };

// Splits a command line into pipeline stages.
// Returns [{ source, words }], where source is the raw text of the stage.
export function parsePipeline(line, warn = () => {}) {
    const stages = [];
    let words = [];
    let word = '';
    let inWord = false;     // true once the current word has any content or quotes
    let stageStart = 0;
    let warnedExpansion = false;
    let warnedGlob = false;

    const endWord = () => {
        if (inWord) words.push(word);
        word = '';
        inWord = false;
    };
    const endStage = (i) => {
        endWord();
        const source = line.slice(stageStart, i).trim();
        if (words.length === 0) {
            throw new Error(`bash: syntax error near unexpected token \`|'`);
        }
        stages.push({ source, words });
        words = [];
        stageStart = i + 1;
    };
    const expandVar = (i, quoted) => {
        // line[i] === '$'. Returns [text, nextIndex] or null for a literal $
        const rest = line.slice(i + 1);
        const m = rest.match(/^(\{[^}]*\}|[A-Za-z_]\w*|[0-9]|[?#@*$!-])/);
        if (!m) return null;
        if (!warnedExpansion) {
            warnedExpansion = true;
            warn(`bash: $${m[1]} was expanded by the shell to ${m[1] === '?' || m[1] === '#' ? '"0"' : 'an empty string'}` +
                (quoted ? ' — inside double quotes the shell still expands $. Use single quotes, e.g. awk \'{print $1}\'' : ''));
        }
        const value = m[1] === '?' || m[1] === '#' ? '0' : '';
        return [value, i + 1 + m[1].length];
    };

    let i = 0;
    while (i < line.length) {
        const ch = line[i];

        if (ch === "'") {
            const close = line.indexOf("'", i + 1);
            if (close === -1) throw new Error(`bash: unexpected EOF while looking for matching \`''`);
            word += line.slice(i + 1, close);
            inWord = true;
            i = close + 1;
            continue;
        }

        if (ch === '"') {
            let j = i + 1;
            let closed = false;
            while (j < line.length) {
                const c = line[j];
                if (c === '"') { closed = true; break; }
                if (c === '\\' && j + 1 < line.length && '$`"\\'.includes(line[j + 1])) {
                    word += line[j + 1];
                    j += 2;
                    continue;
                }
                if (c === '$') {
                    if (line[j + 1] === '(') throw new Error('bash: command substitution "$(...)" is not supported in this trainer');
                    const exp = expandVar(j, true);
                    if (exp) { word += exp[0]; j = exp[1]; continue; }
                }
                if (c === '`') throw new Error('bash: command substitution is not supported in this trainer');
                word += c;
                j++;
            }
            if (!closed) throw new Error('bash: unexpected EOF while looking for matching `"\'');
            inWord = true;
            i = j + 1;
            continue;
        }

        if (ch === '\\') {
            if (i + 1 < line.length) word += line[i + 1];
            inWord = true;
            i += 2;
            continue;
        }

        if (ch === '$') {
            if (line[i + 1] === "'") {
                // ANSI-C quoting: $'\t'
                let j = i + 2;
                let closed = false;
                while (j < line.length) {
                    if (line[j] === "'") { closed = true; break; }
                    if (line[j] === '\\' && j + 1 < line.length) {
                        word += ANSI_C_ESCAPES[line[j + 1]] ?? '\\' + line[j + 1];
                        j += 2;
                        continue;
                    }
                    word += line[j++];
                }
                if (!closed) throw new Error(`bash: unexpected EOF while looking for matching \`''`);
                inWord = true;
                i = j + 1;
                continue;
            }
            if (line[i + 1] === '(') throw new Error('bash: command substitution "$(...)" is not supported in this trainer');
            const exp = expandVar(i, false);
            if (exp) {
                word += exp[0];
                // an unquoted expansion to nothing does not create a word
                if (exp[0] !== '') inWord = true;
                i = exp[1];
                continue;
            }
            word += '$';
            inWord = true;
            i++;
            continue;
        }

        if (ch === ' ' || ch === '\t') {
            endWord();
            i++;
            continue;
        }

        if (ch === '#' && !inWord) break; // comment

        if (ch === '|') {
            if (line[i + 1] === '|') {
                throw new Error('bash: "||" is not supported in this trainer — use a single | to pipe');
            }
            endStage(i);
            i++;
            continue;
        }

        if (ch in UNSUPPORTED_OPERATORS) {
            throw new Error(`bash: ${UNSUPPORTED_OPERATORS[ch]} is not supported in this trainer — only pipes (|) are`);
        }

        if ((ch === '*' || ch === '?' || ch === '[') && !warnedGlob) {
            warnedGlob = true;
            warn(`bash: note: unquoted "${ch}" is a wildcard — a real shell may replace it with matching file names. Quote patterns: '...'`);
        }

        word += ch;
        inWord = true;
        i++;
    }

    endWord();
    const source = line.slice(stageStart).trim();
    if (words.length === 0) {
        if (stages.length > 0) throw new Error(`bash: syntax error near unexpected token \`|'`);
        return [];
    }
    stages.push({ source, words });
    return stages;
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

export function parseCommand(cmdString) {
    const [stage] = parsePipeline(cmdString);
    if (!stage) return { cmd: undefined, args: [] };
    return { cmd: stage.words[0], args: stage.words.slice(1) };
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
