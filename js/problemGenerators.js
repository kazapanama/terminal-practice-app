// Problem generators for practice mode

import { randInt, shuffle } from './utils.js';
import { dataGenerators } from './dataGenerators.js';

export const commandDefs = {
    grep: { name: 'grep', desc: 'Search patterns' },
    head: { name: 'head', desc: 'First N lines' },
    tail: { name: 'tail', desc: 'Last N lines' },
    wc: { name: 'wc', desc: 'Count lines/words' },
    sort: { name: 'sort', desc: 'Sort lines' },
    uniq: { name: 'uniq', desc: 'Remove duplicates' },
    cut: { name: 'cut', desc: 'Extract fields' },
    tr: { name: 'tr', desc: 'Translate chars' },
    rev: { name: 'rev', desc: 'Reverse lines' },
    tac: { name: 'tac', desc: 'Reverse order' },
    sed: { name: 'sed', desc: 'Substitute text' }
};

export const problemGenerators = {
    grep: () => {
        const variants = [
            () => {
                const data = dataGenerators.logs();
                const level = ['ERROR', 'WARNING', 'INFO', 'DEBUG'][randInt(0, 3)];
                return {
                    text: data.join('\n'),
                    description: `Find all lines containing "${level}".`,
                    solution: `grep ${level}`,
                    hint: `Use grep with the pattern "${level}"`
                };
            },
            () => {
                const data = dataGenerators.fruits();
                const letter = 'aeiou'[randInt(0, 4)];
                return {
                    text: data.join('\n'),
                    description: `Find all lines containing the letter "${letter}".`,
                    solution: `grep ${letter}`,
                    hint: `Use grep with a single letter pattern`
                };
            },
            () => {
                const data = dataGenerators.logs();
                return {
                    text: data.join('\n'),
                    description: `Count how many lines contain "ERROR".`,
                    solution: `grep -c ERROR`,
                    hint: `Use grep with -c flag to count matches`
                };
            },
            () => {
                const data = dataGenerators.mixed();
                return {
                    text: data.join('\n'),
                    description: `Find all lines that do NOT contain lowercase letters (invert match for a-z).`,
                    solution: `grep -v "[a-z]"`,
                    hint: `Use grep -v to invert match`
                };
            },
            () => {
                const data = dataGenerators.fruits();
                const pattern = data[0].substring(0, 2);
                return {
                    text: data.join('\n'),
                    description: `Find lines starting with "${pattern}" (case-insensitive).`,
                    solution: `grep -i "^${pattern}"`,
                    hint: `Use grep -i for case-insensitive and ^ for start of line`
                };
            }
        ];
        return variants[randInt(0, variants.length - 1)]();
    },

    head: () => {
        const variants = [
            () => {
                const data = dataGenerators.fruits();
                const n = randInt(2, Math.min(5, data.length - 1));
                return {
                    text: data.join('\n'),
                    description: `Display only the first ${n} lines.`,
                    solution: `head -${n}`,
                    hint: `Use head -n or head -${n}`
                };
            },
            () => {
                const data = dataGenerators.numbers();
                const n = randInt(3, Math.min(6, data.length - 1));
                return {
                    text: data.join('\n'),
                    description: `Show the first ${n} numbers from this list.`,
                    solution: `head -${n}`,
                    hint: `Use head with -n flag`
                };
            }
        ];
        return variants[randInt(0, variants.length - 1)]();
    },

    tail: () => {
        const variants = [
            () => {
                const data = dataGenerators.fruits();
                const n = randInt(2, Math.min(5, data.length - 1));
                return {
                    text: data.join('\n'),
                    description: `Display only the last ${n} lines.`,
                    solution: `tail -${n}`,
                    hint: `Use tail -n or tail -${n}`
                };
            },
            () => {
                const data = dataGenerators.logs();
                const n = randInt(2, Math.min(4, data.length - 1));
                return {
                    text: data.join('\n'),
                    description: `Show the last ${n} log entries.`,
                    solution: `tail -${n}`,
                    hint: `Use tail with -n flag`
                };
            }
        ];
        return variants[randInt(0, variants.length - 1)]();
    },

    wc: () => {
        const variants = [
            () => {
                const data = dataGenerators.sentences();
                return {
                    text: data.join('\n'),
                    description: `Count the total number of lines.`,
                    solution: `wc -l`,
                    hint: `Use wc with -l flag for line count`
                };
            },
            () => {
                const data = dataGenerators.words();
                return {
                    text: data.join('\n'),
                    description: `Count the total number of words.`,
                    solution: `wc -w`,
                    hint: `Use wc with -w flag for word count`
                };
            },
            () => {
                const data = dataGenerators.fruits();
                return {
                    text: data.join('\n'),
                    description: `Count the number of characters in the text.`,
                    solution: `wc -c`,
                    hint: `Use wc with -c flag for character count`
                };
            }
        ];
        return variants[randInt(0, variants.length - 1)]();
    },

    sort: () => {
        const variants = [
            () => {
                const data = dataGenerators.fruits();
                return {
                    text: data.join('\n'),
                    description: `Sort these items alphabetically.`,
                    solution: `sort`,
                    hint: `Just use sort without any flags`
                };
            },
            () => {
                const data = dataGenerators.numbers();
                return {
                    text: data.join('\n'),
                    description: `Sort these numbers in ascending numeric order.`,
                    solution: `sort -n`,
                    hint: `Use sort -n for numeric sorting`
                };
            },
            () => {
                const data = dataGenerators.numbers();
                return {
                    text: data.join('\n'),
                    description: `Sort these numbers in descending (reverse) numeric order.`,
                    solution: `sort -rn`,
                    hint: `Use sort -rn for reverse numeric sorting`
                };
            },
            () => {
                const data = dataGenerators.fruits();
                return {
                    text: data.join('\n'),
                    description: `Sort alphabetically in reverse order.`,
                    solution: `sort -r`,
                    hint: `Use sort -r for reverse order`
                };
            }
        ];
        return variants[randInt(0, variants.length - 1)]();
    },

    uniq: () => {
        const variants = [
            () => {
                const data = dataGenerators.duplicates();
                data.sort();
                return {
                    text: data.join('\n'),
                    description: `Remove duplicate adjacent lines.`,
                    solution: `uniq`,
                    hint: `Use uniq to remove adjacent duplicates`
                };
            },
            () => {
                const data = dataGenerators.duplicates();
                data.sort();
                return {
                    text: data.join('\n'),
                    description: `Count occurrences of each unique line.`,
                    solution: `uniq -c`,
                    hint: `Use uniq -c to count occurrences`
                };
            },
            () => {
                const data = dataGenerators.duplicates();
                data.sort();
                return {
                    text: data.join('\n'),
                    description: `Show only the lines that appear more than once.`,
                    solution: `uniq -d`,
                    hint: `Use uniq -d to show only duplicates`
                };
            }
        ];
        return variants[randInt(0, variants.length - 1)]();
    },

    cut: () => {
        const variants = [
            () => {
                const data = dataGenerators.csv();
                return {
                    text: data.join('\n'),
                    description: `Extract only the first field (name) from this comma-separated data.`,
                    solution: `cut -d',' -f1`,
                    hint: `Use cut with -d',' for delimiter and -f1 for first field`
                };
            },
            () => {
                const data = dataGenerators.csv();
                return {
                    text: data.join('\n'),
                    description: `Extract the name and salary (fields 1 and 3) from this CSV.`,
                    solution: `cut -d',' -f1,3`,
                    hint: `Use cut -d',' -f1,3 for multiple fields`
                };
            },
            () => {
                const data = dataGenerators.words();
                return {
                    text: data.join('\n'),
                    description: `Extract only the first 3 characters of each line.`,
                    solution: `cut -c1-3`,
                    hint: `Use cut -c1-3 for character positions`
                };
            }
        ];
        return variants[randInt(0, variants.length - 1)]();
    },

    tr: () => {
        const variants = [
            () => {
                const data = dataGenerators.words();
                return {
                    text: data.join('\n'),
                    description: `Convert all text to UPPERCASE.`,
                    solution: `tr 'a-z' 'A-Z'`,
                    hint: `Use tr 'a-z' 'A-Z' for uppercase conversion`
                };
            },
            () => {
                const data = dataGenerators.mixed();
                return {
                    text: data.join('\n'),
                    description: `Convert all text to lowercase.`,
                    solution: `tr 'A-Z' 'a-z'`,
                    hint: `Use tr 'A-Z' 'a-z' for lowercase conversion`
                };
            },
            () => {
                const data = ['hello 123', 'world 456', 'test 789', 'data 000'];
                return {
                    text: data.join('\n'),
                    description: `Delete all digits from the text.`,
                    solution: `tr -d '0-9'`,
                    hint: `Use tr -d to delete characters`
                };
            }
        ];
        return variants[randInt(0, variants.length - 1)]();
    },

    rev: () => {
        const data = dataGenerators.words();
        return {
            text: data.join('\n'),
            description: `Reverse each line (characters in reverse order).`,
            solution: `rev`,
            hint: `Use rev to reverse characters in each line`
        };
    },

    tac: () => {
        const data = dataGenerators.fruits().slice(0, 5);
        return {
            text: data.join('\n'),
            description: `Reverse the order of lines (last line first).`,
            solution: `tac`,
            hint: `Use tac to reverse line order`
        };
    },

    sed: () => {
        const variants = [
            () => {
                const data = dataGenerators.fruits();
                const fruit = data[0];
                return {
                    text: data.join('\n'),
                    description: `Replace "${fruit}" with "FRUIT" in each line.`,
                    solution: `sed 's/${fruit}/FRUIT/g'`,
                    hint: `Use sed 's/old/new/g' for substitution`
                };
            },
            () => {
                const data = ['hello world', 'hello there', 'hello friend', 'goodbye world'];
                return {
                    text: data.join('\n'),
                    description: `Replace "hello" with "hi" in each line.`,
                    solution: `sed 's/hello/hi/g'`,
                    hint: `Use sed 's/hello/hi/g' for global substitution`
                };
            }
        ];
        return variants[randInt(0, variants.length - 1)]();
    },

    // Pipe combinations
    pipe_sort_uniq: () => {
        const data = dataGenerators.duplicates();
        shuffle(data);
        return {
            text: data.join('\n'),
            description: `Sort the list and then remove duplicates.`,
            solution: `sort | uniq`,
            hint: `Chain sort and uniq with a pipe`,
            isPipe: true
        };
    },

    pipe_sort_head: () => {
        const data = dataGenerators.numbers();
        const n = randInt(2, 4);
        return {
            text: data.join('\n'),
            description: `Sort numerically and show only the top ${n} smallest numbers.`,
            solution: `sort -n | head -${n}`,
            hint: `Chain sort -n and head`,
            isPipe: true
        };
    },

    pipe_grep_wc: () => {
        const data = dataGenerators.logs();
        const level = ['ERROR', 'WARNING'][randInt(0, 1)];
        return {
            text: data.join('\n'),
            description: `Count how many lines contain "${level}".`,
            solution: `grep ${level} | wc -l`,
            hint: `Chain grep and wc -l (or use grep -c)`,
            isPipe: true
        };
    },

    pipe_sort_uniq_sort: () => {
        const data = dataGenerators.duplicates();
        shuffle(data);
        return {
            text: data.join('\n'),
            description: `Sort the list, count occurrences of each item, and sort by count (descending).`,
            solution: `sort | uniq -c | sort -rn`,
            hint: `Chain: sort | uniq -c | sort -rn`,
            isPipe: true
        };
    },

    pipe_cut_sort: () => {
        const data = dataGenerators.csv();
        return {
            text: data.join('\n'),
            description: `Extract the department (field 2) and sort them alphabetically.`,
            solution: `cut -d',' -f2 | sort`,
            hint: `Chain cut and sort`,
            isPipe: true
        };
    }
};
