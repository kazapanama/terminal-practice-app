// Utility functions

export function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function pick(array) {
    return array[randInt(0, array.length - 1)];
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

const CHAR_CLASSES = {
    upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    lower: 'abcdefghijklmnopqrstuvwxyz',
    digit: '0123456789',
    alpha: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ',
    alnum: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
    space: ' \t\n',
    punct: '!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~'
};

export function expandCharSet(set) {
    // POSIX character classes: [:upper:], [[:upper:]], etc.
    set = set.replace(/\[?\[:(\w+):\]\]?/g, (m, name) => CHAR_CLASSES[name] || m);
    // Escape sequences
    set = set.replace(/\\n/g, '\n').replace(/\\t/g, '\t');

    let result = '';
    for (let i = 0; i < set.length; i++) {
        if (set[i + 1] === '-' && set[i + 2]) {
            const start = set.charCodeAt(i);
            const end = set.charCodeAt(i + 2);
            for (let c = start; c <= end; c++) {
                result += String.fromCharCode(c);
            }
            i += 2;
        } else {
            result += set[i];
        }
    }
    return result;
}

// Parse a cut-style list spec like "1,3", "2-4", "2-", "-3" into sorted indices.
// `max` bounds open-ended ranges.
export function parseRangeSpec(rangeStr, max) {
    const indices = new Set();
    for (const part of rangeStr.split(',')) {
        if (!part) continue;
        if (part.includes('-')) {
            const [s, e] = part.split('-');
            const start = s === '' ? 1 : parseInt(s);
            const end = e === '' ? max : Math.min(parseInt(e), max);
            if (isNaN(start) || isNaN(end)) continue;
            for (let i = start; i <= end; i++) indices.add(i);
        } else {
            const n = parseInt(part);
            if (!isNaN(n)) indices.add(n);
        }
    }
    return [...indices].sort((a, b) => a - b);
}

// Split a command line on | respecting quotes, so patterns like
// grep -E 'a|b' or sed 's|x|y|' survive intact.
export function splitPipeline(cmdLine) {
    const parts = [];
    let current = '';
    let inQuote = null;

    for (const char of cmdLine) {
        if (inQuote) {
            current += char;
            if (char === inQuote) inQuote = null;
        } else if (char === '"' || char === "'") {
            current += char;
            inQuote = char;
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
    const tokens = [];
    let current = '';
    let inQuote = null;

    for (let i = 0; i < cmdString.length; i++) {
        const char = cmdString[i];

        if (inQuote) {
            if (char === inQuote) {
                inQuote = null;
            } else {
                current += char;
            }
        } else if (char === '"' || char === "'") {
            inQuote = char;
        } else if (char === ' ') {
            if (current) {
                tokens.push(current);
                current = '';
            }
        } else {
            current += char;
        }
    }

    if (current) tokens.push(current);

    const cmd = tokens[0];
    const args = tokens.slice(1);

    return { cmd, args };
}
