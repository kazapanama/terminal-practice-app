// Utility functions

export function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function shuffle(array) {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

export function expandCharSet(set) {
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

export function parseRange(rangeStr) {
    const indices = [];
    const parts = rangeStr.split(',');

    for (const part of parts) {
        if (part.includes('-')) {
            const [start, end] = part.split('-').map(n => parseInt(n));
            if (!isNaN(start) && !isNaN(end)) {
                for (let i = start; i <= end; i++) {
                    indices.push(i);
                }
            } else if (!isNaN(start)) {
                indices.push(start);
            }
        } else {
            indices.push(parseInt(part));
        }
    }

    return indices.filter(n => !isNaN(n));
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
