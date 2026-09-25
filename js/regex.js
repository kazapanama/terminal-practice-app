// POSIX regular expressions -> JavaScript RegExp.
//
// grep and sed use Basic regular expressions (BRE) unless -E is given, awk and
// grep -E / sed -E use Extended ones (ERE). Translating them (instead of
// handing the pattern straight to RegExp) keeps the trainer honest: syntax
// that fails in a real terminal fails here too.

const CLASSES = {
    alpha: 'A-Za-z',
    digit: '0-9',
    alnum: '0-9A-Za-z',
    upper: 'A-Z',
    lower: 'a-z',
    space: ' \\t\\n\\r\\f\\v',
    blank: ' \\t',
    punct: '!-\\/:-@\\[-`{-~',
    xdigit: '0-9A-Fa-f',
    cntrl: '\\x00-\\x1f\\x7f',
    print: ' -~',
    graph: '!-~'
};

const JS_SPECIAL = new Set('\\^$.|?*+()[]{}/');

function escapeJs(ch) {
    return JS_SPECIAL.has(ch) ? '\\' + ch : ch;
}

// Parses a bracket expression starting at src[i] === '['.
// Returns { out, end } where end is the index of the closing ']'.
function parseBracket(src, i, tool) {
    let j = i + 1;
    let out = '[';
    if (src[j] === '^') { out += '^'; j++; }
    let first = true;
    while (j < src.length) {
        const ch = src[j];
        if (ch === ']' && !first) {
            const body = src.slice(i + 1, j);
            if (tool === 'grep' && /^:[a-z]+:$/.test(body)) {
                throw new Error(`grep: character class syntax is [[:space:]], not [:space:]`);
            }
            return { out: out + ']', end: j };
        }
        if (ch === '[' && (src[j + 1] === ':' || src[j + 1] === '=' || src[j + 1] === '.')) {
            const kind = src[j + 1];
            const close = src.indexOf(kind + ']', j + 2);
            if (close === -1) break;
            const name = src.slice(j + 2, close);
            if (kind === ':') {
                if (!(name in CLASSES)) throw new Error(`${tool}: invalid character class`);
                out += CLASSES[name];
            } else {
                out += escapeJs(name);
            }
            j = close + 2;
        } else if (ch === '\\') {
            // Inside brackets a backslash is literal in POSIX (grep, sed);
            // awk treats it as an escape.
            if (tool === 'awk' && j + 1 < src.length) {
                const next = src[j + 1];
                out += next === 't' ? '\\t' : next === 'n' ? '\\n' : '\\' + next;
                j += 2;
            } else {
                out += '\\\\';
                j++;
            }
        } else if (ch === ']' || ch === '[') {
            out += '\\' + ch;
            j++;
        } else {
            out += ch;
            j++;
        }
        first = false;
    }
    throw new Error(`${tool}: Unmatched [, [^, [:, [., or [=`);
}

// Translates a POSIX regex into JavaScript RegExp source.
//   mode: 'basic' | 'extended' | 'perl'
//   tool: command name used in error messages ('grep', 'sed', 'awk')
//   warn: optional callback for non-fatal diagnostics
// Returns { source, groups } where groups is the number of capture groups.
export function translateRegex(src, { mode = 'basic', tool = 'grep', warn = () => {} } = {}) {
    if (mode === 'perl') {
        let groups;
        try {
            groups = new RegExp(src + '|').exec('').length - 1;
        } catch (e) {
            throw new Error(`${tool}: invalid regular expression: ${src}`);
        }
        return { source: src, groups };
    }

    const ere = mode === 'extended';
    let out = '';
    let groups = 0;
    let closedGroups = 0;
    // "at start" = position where ^ is an anchor and * is literal in BRE
    let atStart = true;

    for (let i = 0; i < src.length; i++) {
        const ch = src[i];
        const wasAtStart = atStart;
        atStart = false;

        if (ch === '\\') {
            const next = src[i + 1];
            if (next === undefined) throw new Error(`${tool}: trailing backslash (\\)`);
            i++;
            if (!ere && next === '(') { out += '('; groups++; atStart = true; continue; }
            if (!ere && next === ')') { out += ')'; closedGroups++; continue; }
            if (!ere && next === '|') { out += '|'; atStart = true; continue; }
            if (!ere && (next === '+' || next === '?')) { out += next; continue; }
            if (!ere && next === '{') {
                const close = src.indexOf('\\}', i + 1);
                if (close === -1) throw new Error(`${tool}: Unmatched \\{`);
                const body = src.slice(i + 1, close);
                if (!/^\d*(,\d*)?$/.test(body)) throw new Error(`${tool}: Invalid content of \\{\\}`);
                out += '{' + body + '}';
                i = close + 1;
                continue;
            }
            if (/[1-9]/.test(next)) {
                if (Number(next) > closedGroups) throw new Error(`${tool}: Invalid back reference`);
                out += '\\' + next;
                continue;
            }
            if ('wWsSbB'.includes(next)) { out += '\\' + next; continue; }
            if (next === '<') { out += '\\b(?=\\w)'; continue; }
            if (next === '>') { out += '\\b(?<=\\w)'; continue; }
            if (next === 'n' && tool !== 'grep') { out += '\\n'; continue; }
            if (next === 't' && tool !== 'grep') { out += '\\t'; continue; }
            if (/[A-Za-z0-9]/.test(next)) {
                const tip = next === 'd'
                    ? ' (\\d is Perl syntax: use [0-9] or [[:digit:]]' + (tool === 'grep' ? ', or grep -P' : '') + ')'
                    : '';
                warn(`${tool}: warning: stray \\ before ${next}${tip}`);
            }
            out += escapeJs(next);
            continue;
        }

        if (ch === '[') {
            const { out: cls, end } = parseBracket(src, i, tool);
            out += cls;
            i = end;
            continue;
        }

        if (ch === '^') {
            if (ere || wasAtStart) { out += '^'; atStart = true; } else out += '\\^';
            continue;
        }

        if (ch === '$') {
            const rest = src.slice(i + 1);
            const isEnd = ere || rest === '' || rest.startsWith('\\)') || rest.startsWith('\\|');
            out += isEnd ? '$' : '\\$';
            continue;
        }

        if (ch === '*') {
            out += wasAtStart ? '\\*' : '*';
            continue;
        }

        if (ere) {
            if (ch === '(') { out += '('; groups++; atStart = true; continue; }
            if (ch === ')') { out += ')'; closedGroups++; continue; }
            if (ch === '|') { out += '|'; atStart = true; continue; }
            if (ch === '+' || ch === '?') {
                out += wasAtStart ? '\\' + ch : ch;
                continue;
            }
            if (ch === '{') {
                const m = src.slice(i).match(/^\{(\d+(,\d*)?|,\d+)\}/);
                if (m && !wasAtStart) { out += m[0]; i += m[0].length - 1; }
                else out += '\\{';
                continue;
            }
        }

        out += ch === '.' ? '.' : escapeJs(ch);
    }

    return { source: out, groups };
}

// Convenience: build a RegExp, turning JS syntax errors into tool errors.
export function posixRegExp(src, { mode = 'basic', tool = 'grep', flags = '', warn } = {}) {
    const { source, groups } = translateRegex(src, { mode, tool, warn });
    try {
        const re = new RegExp(source, flags);
        re.groupCount = groups;
        return re;
    } catch (e) {
        throw new Error(`${tool}: invalid regular expression: ${src}`);
    }
}
