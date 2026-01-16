// Linux command implementations

import { expandCharSet, parseRange, parseCommand } from './utils.js';

export const commands = {
    cat: (input, args) => {
        if (args.includes('-n')) {
            return input.split('\n').map((line, i) => `     ${i + 1}\t${line}`).join('\n');
        }
        return input;
    },

    grep: (input, args) => {
        let pattern = '';
        let flags = { i: false, v: false, c: false, n: false, o: false };

        for (let i = 0; i < args.length; i++) {
            const arg = args[i];
            if (arg.startsWith('-')) {
                for (const char of arg.slice(1)) {
                    if (flags.hasOwnProperty(char)) flags[char] = true;
                }
            } else {
                pattern = arg.replace(/^["']|["']$/g, '');
            }
        }

        if (!pattern) return input;

        const regex = new RegExp(pattern, flags.i ? 'gi' : 'g');
        const lines = input.split('\n');
        let results = [];

        lines.forEach((line, index) => {
            const matches = line.match(regex);
            const hasMatch = matches !== null;

            if (flags.v ? !hasMatch : hasMatch) {
                if (flags.o && matches) {
                    results.push(...matches);
                } else if (flags.n) {
                    results.push(`${index + 1}:${line}`);
                } else {
                    results.push(line);
                }
            }
        });

        if (flags.c) {
            return String(results.length);
        }

        return results.join('\n');
    },

    head: (input, args) => {
        let n = 10;
        for (const arg of args) {
            if (arg.startsWith('-n')) {
                n = parseInt(arg.slice(2)) || parseInt(args[args.indexOf(arg) + 1]) || 10;
            } else if (arg.startsWith('-') && !isNaN(arg.slice(1))) {
                n = parseInt(arg.slice(1));
            }
        }
        return input.split('\n').slice(0, n).join('\n');
    },

    tail: (input, args) => {
        let n = 10;
        for (const arg of args) {
            if (arg.startsWith('-n')) {
                n = parseInt(arg.slice(2)) || parseInt(args[args.indexOf(arg) + 1]) || 10;
            } else if (arg.startsWith('-') && !isNaN(arg.slice(1))) {
                n = parseInt(arg.slice(1));
            }
        }
        const lines = input.split('\n');
        return lines.slice(-n).join('\n');
    },

    wc: (input, args) => {
        const lines = input.split('\n');
        const lineNum = lines.length;
        const words = input.trim() ? input.trim().split(/\s+/).length : 0;
        const chars = input.length;

        if (args.includes('-l')) return String(lineNum);
        if (args.includes('-w')) return String(words);
        if (args.includes('-c') || args.includes('-m')) return String(chars);

        return `${lineNum} ${words} ${chars}`;
    },

    sort: (input, args) => {
        let lines = input.split('\n');
        let numeric = args.includes('-n');
        let reverse = args.includes('-r');
        let unique = args.includes('-u');

        let delimiter = null;
        let keyField = null;

        for (let i = 0; i < args.length; i++) {
            if (args[i] === '-t' && args[i + 1]) {
                delimiter = args[i + 1].replace(/^["']|["']$/g, '');
            } else if (args[i].startsWith('-t')) {
                delimiter = args[i].slice(2).replace(/^["']|["']$/g, '');
            }
            if (args[i] === '-k' && args[i + 1]) {
                keyField = parseInt(args[i + 1]) - 1;
            } else if (args[i].startsWith('-k')) {
                keyField = parseInt(args[i].slice(2)) - 1;
            }
        }

        lines.sort((a, b) => {
            let valA = a, valB = b;

            if (delimiter && keyField !== null) {
                valA = a.split(delimiter)[keyField] || '';
                valB = b.split(delimiter)[keyField] || '';
            }

            if (numeric) {
                const numA = parseFloat(valA) || 0;
                const numB = parseFloat(valB) || 0;
                return numA - numB;
            }
            return valA.localeCompare(valB);
        });

        if (reverse) lines.reverse();
        if (unique) lines = [...new Set(lines)];

        return lines.join('\n');
    },

    uniq: (input, args) => {
        const lines = input.split('\n');
        let countMode = args.includes('-c');
        let duplicatesOnly = args.includes('-d');
        let uniqueOnly = args.includes('-u');

        let result = [];
        let counts = [];
        let prev = null;
        let count = 0;

        for (const line of lines) {
            if (line === prev) {
                count++;
            } else {
                if (prev !== null) {
                    counts.push({ line: prev, count });
                }
                prev = line;
                count = 1;
            }
        }
        if (prev !== null) {
            counts.push({ line: prev, count });
        }

        for (const item of counts) {
            if (duplicatesOnly && item.count < 2) continue;
            if (uniqueOnly && item.count > 1) continue;

            if (countMode) {
                result.push(`      ${item.count} ${item.line}`);
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
            if (arg === '-d' && args[i + 1]) {
                delimiter = args[i + 1].replace(/^["']|["']$/g, '');
                i++;
            } else if (arg.startsWith('-d')) {
                delimiter = arg.slice(2).replace(/^["']|["']$/g, '');
            } else if (arg === '-f' && args[i + 1]) {
                fields = args[i + 1];
                i++;
            } else if (arg.startsWith('-f')) {
                fields = arg.slice(2);
            } else if (arg === '-c' && args[i + 1]) {
                chars = args[i + 1];
                i++;
            } else if (arg.startsWith('-c')) {
                chars = arg.slice(2);
            }
        }

        return input.split('\n').map(line => {
            if (chars) {
                return parseRange(chars).map(i => line[i - 1] || '').join('');
            }
            if (fields) {
                const parts = line.split(delimiter);
                return parseRange(fields).map(i => parts[i - 1] || '').join(delimiter);
            }
            return line;
        }).join('\n');
    },

    tr: (input, args) => {
        let deleteMode = args.includes('-d');
        let squeezeMode = args.includes('-s');

        const nonFlagArgs = args.filter(a => !a.startsWith('-'));

        if (deleteMode && nonFlagArgs.length >= 1) {
            const set1 = expandCharSet(nonFlagArgs[0].replace(/^["']|["']$/g, ''));
            return input.split('').filter(c => !set1.includes(c)).join('');
        }

        if (squeezeMode && nonFlagArgs.length >= 1) {
            const set1 = expandCharSet(nonFlagArgs[0].replace(/^["']|["']$/g, ''));
            let result = '';
            let prev = '';
            for (const c of input) {
                if (set1.includes(c) && c === prev) continue;
                result += c;
                prev = c;
            }
            return result;
        }

        if (nonFlagArgs.length >= 2) {
            const set1 = expandCharSet(nonFlagArgs[0].replace(/^["']|["']$/g, ''));
            const set2 = expandCharSet(nonFlagArgs[1].replace(/^["']|["']$/g, ''));

            return input.split('').map(c => {
                const idx = set1.indexOf(c);
                if (idx !== -1 && idx < set2.length) {
                    return set2[idx];
                } else if (idx !== -1) {
                    return set2[set2.length - 1];
                }
                return c;
            }).join('');
        }

        return input;
    },

    rev: (input, args) => {
        return input.split('\n').map(line => line.split('').reverse().join('')).join('\n');
    },

    tac: (input, args) => {
        return input.split('\n').reverse().join('\n');
    },

    sed: (input, args) => {
        const pattern = args.join(' ').replace(/^["']|["']$/g, '');
        const match = pattern.match(/^s\/(.+?)\/(.*)\/([gimsu]*)$/);

        if (match) {
            const [, search, replace, flags] = match;
            const regex = new RegExp(search, flags.includes('g') ? 'g' : '');

            return input.split('\n').map(line => line.replace(regex, replace)).join('\n');
        }

        return input;
    }
};

export function executePipeline(input, pipeline) {
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
