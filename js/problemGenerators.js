// Problem generators for practice mode.
//
// Two layers:
//   1. Single-command templates - many parameterized variants per command.
//   2. Pipeline recipes - parameterized multi-command tasks assembled from
//      random datasets, giving a practically endless task pool.

import { randInt, pick, shuffle } from './utils.js';
import { dataGenerators, datasetInfo } from './dataGenerators.js';
import { executePipeline } from './commands.js';

export const commandDefs = {
    grep: { name: 'grep', desc: 'Search patterns' },
    head: { name: 'head', desc: 'First N lines' },
    tail: { name: 'tail', desc: 'Last N lines' },
    wc: { name: 'wc', desc: 'Count lines/words' },
    sort: { name: 'sort', desc: 'Sort lines' },
    uniq: { name: 'uniq', desc: 'Remove duplicates' },
    cut: { name: 'cut', desc: 'Extract fields' },
    tr: { name: 'tr', desc: 'Translate chars' },
    sed: { name: 'sed', desc: 'Edit streams' },
    awk: { name: 'awk', desc: 'Field processing' },
    nl: { name: 'nl', desc: 'Number lines' },
    paste: { name: 'paste', desc: 'Join lines' },
    rev: { name: 'rev', desc: 'Reverse lines' },
    tac: { name: 'tac', desc: 'Reverse order' },
    cat: { name: 'cat', desc: 'Pass through' }
};

const LOG_LEVEL = () => pick(['ERROR', 'WARNING', 'INFO', 'DEBUG']);

// Logs guaranteed to contain at least one line with the chosen level and at
// least one line without it (so grep / grep -v are never empty).
function logsWithLevel() {
    const data = dataGenerators.logs();
    const present = [...new Set(data.map(l => l.split(':')[0]))];
    if (present.length < 2) {
        const other = pick(['ERROR', 'WARNING', 'INFO', 'DEBUG'].filter(l => l !== present[0]));
        data[0] = `${other}: ${data[0].split(': ')[1]}`;
        present.push(other);
    }
    return { data, level: pick(present) };
}

// Access log guaranteed to contain at least one line with the given method
// (or status code as the 3rd field).
function accessLogWith(value, field) {
    const data = dataGenerators.accessLog();
    const has = field === 'status'
        ? (l) => l.split(' ')[2] === String(value)
        : (l) => l.startsWith(value + ' ');
    if (!data.some(has)) {
        const parts = data[0].split(' ');
        if (field === 'status') parts[2] = String(value);
        else parts[0] = value;
        data[0] = parts.join(' ');
    }
    return data;
}

function serverStatusData() {
    return Array.from({ length: randInt(5, 8) }, (_, i) =>
        `server${i + 1},${pick(['active', 'inactive', 'active'])},${randInt(0, 100)}`
    );
}

function caseDupsData() {
    const base = shuffle(['apple', 'banana', 'cherry', 'mango']).slice(0, 3);
    const out = [];
    base.forEach(w => {
        out.push(w[0].toUpperCase() + w.slice(1));
        if (Math.random() < 0.8) out.push(w);
        if (Math.random() < 0.4) out.push(w.toUpperCase());
    });
    return out;
}

function spacedData() {
    return dataGenerators.words().map(w =>
        `${w}${' '.repeat(randInt(2, 5))}${pick(['one', 'two', 'three'])}`
    );
}

// ---------------------------------------------------------------------------
// Single-command templates
// ---------------------------------------------------------------------------

export const problemGenerators = {
    grep: () => pick([
        () => {
            const { data, level } = logsWithLevel();
            return {
                text: data.join('\n'),
                description: `Find all lines containing "${level}".`,
                solution: `grep ${level}`
            };
        },
        () => {
            const data = dataGenerators.fruits();
            const candidates = 'aeiou'.split('').filter(l => data.some(f => f.includes(l)));
            const letter = pick(candidates.length ? candidates : ['a']);
            return {
                text: data.join('\n'),
                description: `Find all lines containing the letter "${letter}".`,
                solution: `grep ${letter}`
            };
        },
        () => {
            const { data, level } = logsWithLevel();
            return {
                text: data.join('\n'),
                description: `Count how many lines contain "${level}" (single grep, no pipes needed).`,
                solution: `grep -c ${level}`
            };
        },
        () => {
            const { data, level } = logsWithLevel();
            return {
                text: data.join('\n'),
                description: `Show all lines that do NOT contain "${level}".`,
                solution: `grep -v ${level}`
            };
        },
        () => {
            const data = dataGenerators.fruits();
            const pattern = pick(data).substring(0, 2);
            return {
                text: data.join('\n'),
                description: `Find lines starting with "${pattern}" (case-insensitive).`,
                solution: `grep -i "^${pattern}"`
            };
        },
        () => {
            const { data, level } = logsWithLevel();
            return {
                text: data.join('\n'),
                description: `Show lines containing "${level}" with their line numbers (format N:line).`,
                solution: `grep -n ${level}`
            };
        },
        () => {
            const data = serverStatusData();
            return {
                text: data.join('\n'),
                description: `Find lines containing the whole word "active" (must not match "inactive").`,
                solution: `grep -w active`
            };
        },
        () => {
            const data = dataGenerators.logs();
            if (!data.some(l => /ERROR|WARNING/.test(l))) {
                data[0] = `ERROR: ${data[0].split(': ')[1]}`;
            }
            return {
                text: data.join('\n'),
                description: `Find lines containing either "ERROR" or "WARNING" with a single grep.`,
                solution: `grep -E 'ERROR|WARNING'`
            };
        },
        () => {
            const data = accessLogWith('GET');
            return {
                text: data.join('\n'),
                description: `Find all GET requests (lines starting with "GET").`,
                solution: `grep '^GET'`
            };
        }
    ])(),

    head: () => pick([
        () => {
            const data = dataGenerators.fruits();
            const n = randInt(2, Math.min(5, data.length - 1));
            return {
                text: data.join('\n'),
                description: `Display only the first ${n} lines.`,
                solution: `head -${n}`
            };
        },
        () => {
            const data = dataGenerators.numbers();
            const n = randInt(3, Math.min(6, data.length - 1));
            return {
                text: data.join('\n'),
                description: `Show the first ${n} numbers from this list.`,
                solution: `head -${n}`
            };
        },
        () => {
            const data = dataGenerators.accessLog();
            const n = randInt(2, 4);
            return {
                text: data.join('\n'),
                description: `Show the ${n} earliest requests in the log (first ${n} lines).`,
                solution: `head -n ${n}`
            };
        }
    ])(),

    tail: () => pick([
        () => {
            const data = dataGenerators.fruits();
            const n = randInt(2, Math.min(5, data.length - 1));
            return {
                text: data.join('\n'),
                description: `Display only the last ${n} lines.`,
                solution: `tail -${n}`
            };
        },
        () => {
            const data = dataGenerators.logs();
            const n = randInt(2, 4);
            return {
                text: data.join('\n'),
                description: `Show the last ${n} log entries.`,
                solution: `tail -${n}`
            };
        },
        () => {
            const data = dataGenerators.csvWithHeader();
            return {
                text: data.join('\n'),
                description: `Skip the header line and show everything from line 2 onwards.`,
                solution: `tail -n +2`,
                hint: `tail -n +2 starts output AT line 2 instead of counting from the end`
            };
        },
        () => {
            const data = dataGenerators.numbers();
            const k = randInt(3, 4);
            return {
                text: data.join('\n'),
                description: `Show everything starting from line ${k}.`,
                solution: `tail -n +${k}`,
                hint: `tail -n +${k} starts output AT line ${k}`
            };
        }
    ])(),

    wc: () => pick([
        () => {
            const data = dataGenerators.sentences();
            return {
                text: data.join('\n'),
                description: `Count the total number of lines.`,
                solution: `wc -l`
            };
        },
        () => {
            const data = dataGenerators.sentences();
            return {
                text: data.join('\n'),
                description: `Count the total number of words.`,
                solution: `wc -w`
            };
        },
        () => {
            const data = dataGenerators.fruits();
            return {
                text: data.join('\n'),
                description: `Count the number of characters in the text.`,
                solution: `wc -c`
            };
        }
    ])(),

    sort: () => pick([
        () => {
            const data = dataGenerators.fruits();
            return {
                text: data.join('\n'),
                description: `Sort these items alphabetically.`,
                solution: `sort`
            };
        },
        () => {
            const data = dataGenerators.numbers();
            return {
                text: data.join('\n'),
                description: `Sort these numbers in ascending numeric order.`,
                solution: `sort -n`
            };
        },
        () => {
            const data = dataGenerators.bigNumbers();
            return {
                text: data.join('\n'),
                description: `Sort these numbers in descending (reverse) numeric order.`,
                solution: `sort -rn`
            };
        },
        () => {
            const data = dataGenerators.fruits();
            return {
                text: data.join('\n'),
                description: `Sort alphabetically in reverse order.`,
                solution: `sort -r`
            };
        },
        () => {
            const data = dataGenerators.duplicates();
            return {
                text: data.join('\n'),
                description: `Sort the list and keep each value only once (single sort command).`,
                solution: `sort -u`
            };
        },
        () => {
            const data = dataGenerators.csv();
            return {
                text: data.join('\n'),
                description: `Sort employees by salary (3rd CSV field) in ascending numeric order.`,
                solution: `sort -t',' -k3 -n`,
                hint: `sort -t',' picks the delimiter, -k3 the field, -n numeric`
            };
        },
        () => {
            const data = dataGenerators.inventory();
            return {
                text: data.join('\n'),
                description: `Sort products by price (3rd CSV field) from most to least expensive.`,
                solution: `sort -t',' -k3 -rn`
            };
        },
        () => {
            const data = dataGenerators.scores();
            return {
                text: data.join('\n'),
                description: `Sort by score (2nd column, space-separated) from highest to lowest.`,
                solution: `sort -k2 -rn`
            };
        }
    ])(),

    uniq: () => pick([
        () => {
            const data = dataGenerators.duplicates();
            data.sort();
            return {
                text: data.join('\n'),
                description: `Remove duplicate adjacent lines.`,
                solution: `uniq`
            };
        },
        () => {
            const data = dataGenerators.duplicates();
            data.sort();
            return {
                text: data.join('\n'),
                description: `Count occurrences of each unique line.`,
                solution: `uniq -c`
            };
        },
        () => {
            const data = dataGenerators.duplicates();
            data.push(data[0]); // guarantee at least one duplicate
            data.sort();
            return {
                text: data.join('\n'),
                description: `Show only the lines that appear more than once.`,
                solution: `uniq -d`
            };
        },
        () => {
            const data = dataGenerators.duplicates();
            data.push('zucchini'); // guarantee at least one singleton
            data.sort();
            return {
                text: data.join('\n'),
                description: `Show only the lines that appear exactly once.`,
                solution: `uniq -u`
            };
        },
        () => {
            const data = caseDupsData();
            return {
                text: data.join('\n'),
                description: `Remove adjacent duplicates ignoring letter case ("Apple" and "apple" count as the same).`,
                solution: `uniq -i`,
                hint: `uniq -i compares lines case-insensitively`
            };
        }
    ])(),

    cut: () => pick([
        () => {
            const data = dataGenerators.csv();
            return {
                text: data.join('\n'),
                description: `Extract only the first field (name) from this comma-separated data.`,
                solution: `cut -d',' -f1`
            };
        },
        () => {
            const data = dataGenerators.csv();
            return {
                text: data.join('\n'),
                description: `Extract the name and salary (fields 1 and 3) from this CSV.`,
                solution: `cut -d',' -f1,3`
            };
        },
        () => {
            const data = dataGenerators.words();
            return {
                text: data.join('\n'),
                description: `Extract only the first 3 characters of each line.`,
                solution: `cut -c1-3`
            };
        },
        () => {
            const data = dataGenerators.inventory();
            return {
                text: data.join('\n'),
                description: `Drop the first CSV field and keep everything from field 2 onwards.`,
                solution: `cut -d',' -f2-`,
                hint: `An open-ended range: cut -d',' -f2-`
            };
        },
        () => {
            const data = dataGenerators.passwd();
            return {
                text: data.join('\n'),
                description: `From this /etc/passwd-style data, extract only the usernames (1st field, ":"-separated).`,
                solution: `cut -d':' -f1`
            };
        },
        () => {
            const data = dataGenerators.passwd();
            return {
                text: data.join('\n'),
                description: `Extract username and shell (fields 1 and 7) from this passwd data.`,
                solution: `cut -d':' -f1,7`
            };
        },
        () => {
            const data = dataGenerators.accessLog();
            return {
                text: data.join('\n'),
                description: `Extract only the endpoint (2nd space-separated field) from each request.`,
                solution: `cut -d' ' -f2`
            };
        }
    ])(),

    tr: () => pick([
        () => {
            const data = dataGenerators.words();
            return {
                text: data.join('\n'),
                description: `Convert all text to UPPERCASE.`,
                solution: `tr 'a-z' 'A-Z'`
            };
        },
        () => {
            const data = dataGenerators.mixed();
            return {
                text: data.join('\n'),
                description: `Convert all text to lowercase.`,
                solution: `tr 'A-Z' 'a-z'`
            };
        },
        () => {
            const data = dataGenerators.words().map(w => `${w} ${randInt(100, 999)}`);
            return {
                text: data.join('\n'),
                description: `Delete all digits from the text.`,
                solution: `tr -d '0-9'`
            };
        },
        () => {
            const data = spacedData();
            return {
                text: data.join('\n'),
                description: `Squeeze repeated spaces into a single space.`,
                solution: `tr -s ' '`
            };
        },
        () => {
            const data = dataGenerators.csv();
            return {
                text: data.join('\n'),
                description: `Replace every comma with a space.`,
                solution: `tr ',' ' '`
            };
        },
        () => {
            const data = dataGenerators.fruits();
            return {
                text: data.join('\n'),
                description: `Delete all vowels (a, e, i, o, u) from the text.`,
                solution: `tr -d 'aeiou'`
            };
        }
    ])(),

    sed: () => pick([
        () => {
            const data = dataGenerators.fruits();
            const fruit = pick(data);
            return {
                text: data.join('\n'),
                description: `Replace "${fruit}" with "FRUIT" in each line.`,
                solution: `sed 's/${fruit}/FRUIT/g'`
            };
        },
        () => {
            const data = ['hello world', 'hello there', 'hello friend', 'goodbye world'];
            return {
                text: data.join('\n'),
                description: `Replace "hello" with "hi" in each line.`,
                solution: `sed 's/hello/hi/g'`
            };
        },
        () => {
            const { data, level } = logsWithLevel();
            return {
                text: data.join('\n'),
                description: `Delete all lines containing "${level}" using sed.`,
                solution: `sed '/${level}/d'`,
                hint: `sed '/pattern/d' deletes matching lines`
            };
        },
        () => {
            const data = dataGenerators.fruits();
            const from = randInt(2, 3);
            const to = from + randInt(1, 2);
            return {
                text: data.join('\n'),
                description: `Print only lines ${from} to ${to} using sed.`,
                solution: `sed -n '${from},${to}p'`,
                hint: `sed -n '${from},${to}p' prints only that line range`
            };
        },
        () => {
            const data = dataGenerators.words();
            return {
                text: data.join('\n'),
                description: `Add the prefix "- " to the beginning of every line.`,
                solution: `sed 's/^/- /'`,
                hint: `^ matches the start of each line`
            };
        },
        () => {
            const data = dataGenerators.paths();
            return {
                text: data.join('\n'),
                description: `Delete line 1 using sed.`,
                solution: `sed '1d'`
            };
        }
    ])(),

    awk: () => pick([
        () => {
            const data = dataGenerators.csv();
            return {
                text: data.join('\n'),
                description: `Using awk, print only the department (2nd comma-separated field).`,
                solution: `awk -F',' '{print $2}'`,
                hint: `awk -F',' sets the field separator; $2 is the 2nd field`
            };
        },
        () => {
            const data = dataGenerators.processes();
            return {
                text: data.join('\n'),
                description: `Using awk, print the LAST field of each line.`,
                solution: `awk '{print $NF}'`,
                hint: `$NF refers to the last field`
            };
        },
        () => {
            const data = dataGenerators.scores();
            return {
                text: data.join('\n'),
                description: `Using awk, swap the two columns (print score first, then name).`,
                solution: `awk '{print $2, $1}'`
            };
        },
        () => {
            const data = dataGenerators.csv();
            const salaries = data.map(l => parseInt(l.split(',')[2]));
            // threshold below the max so the result is never empty
            const threshold = Math.floor((Math.max(...salaries) - 1) / 10000) * 10000;
            return {
                text: data.join('\n'),
                description: `Using awk, print names of employees with salary (3rd field) greater than ${threshold}.`,
                solution: `awk -F',' '$3 > ${threshold} {print $1}'`,
                hint: `A condition before {action} filters lines: $3 > ${threshold}`
            };
        },
        () => {
            const data = dataGenerators.inventory();
            return {
                text: data.join('\n'),
                description: `Using awk, compute the total quantity (sum of the 4th field).`,
                solution: `awk -F',' '{sum += $4} END {print sum}'`,
                hint: `Accumulate with sum += $4, then print in an END block`
            };
        },
        () => {
            const data = dataGenerators.scores();
            return {
                text: data.join('\n'),
                description: `Using awk, print each line prefixed with its line number and ": " (e.g. "1: ...").`,
                solution: `awk '{print NR": "$0}'`,
                hint: `NR is the current line number, $0 the whole line`
            };
        },
        () => {
            const data = dataGenerators.passwd();
            return {
                text: data.join('\n'),
                description: `Using awk with ":" as separator, print username and home directory separated by a space.`,
                solution: `awk -F':' '{print $1, $6}'`
            };
        },
        () => {
            const data = dataGenerators.scores();
            if (!data.some(l => parseInt(l.split(' ')[1]) >= 70)) {
                data[0] = `${data[0].split(' ')[0]} ${randInt(70, 100)}`;
            }
            return {
                text: data.join('\n'),
                description: `Using awk, print names of people whose score (2nd column) is at least 70.`,
                solution: `awk '$2 >= 70 {print $1}'`
            };
        }
    ])(),

    nl: () => pick([
        () => {
            const data = dataGenerators.sentences();
            return {
                text: data.join('\n'),
                description: `Number every line (right-aligned number, then a tab).`,
                solution: `nl`
            };
        },
        () => {
            const data = dataGenerators.fruits();
            return {
                text: data.join('\n'),
                description: `Add line numbers to this list.`,
                solution: `nl`
            };
        }
    ])(),

    paste: () => pick([
        () => {
            const data = dataGenerators.fruits().slice(0, randInt(4, 6));
            return {
                text: data.join('\n'),
                description: `Join all lines into a single line separated by commas.`,
                solution: `paste -sd','`,
                hint: `paste -s serializes lines; -d sets the delimiter`
            };
        },
        () => {
            const data = dataGenerators.numbers().slice(0, 5);
            return {
                text: data.join('\n'),
                description: `Join all lines into one line separated by "+".`,
                solution: `paste -sd'+'`
            };
        }
    ])(),

    rev: () => {
        const data = dataGenerators.words();
        return {
            text: data.join('\n'),
            description: `Reverse each line (characters in reverse order).`,
            solution: `rev`
        };
    },

    tac: () => {
        const data = dataGenerators.fruits().slice(0, 5);
        return {
            text: data.join('\n'),
            description: `Reverse the order of lines (last line first).`,
            solution: `tac`
        };
    },

    cat: () => {
        const data = dataGenerators.sentences();
        return {
            text: data.join('\n'),
            description: `Number all lines using cat.`,
            solution: `cat -n`
        };
    }
};

// ---------------------------------------------------------------------------
// Pipeline recipes
// ---------------------------------------------------------------------------

// Datasets usable for "filter by a category value" tasks:
// returns { name, lines, info, value, valueDesc }
function pickCategoryDataset() {
    const choices = [
        () => {
            const { data, level } = logsWithLevel();
            return { lines: data, value: level, valueDesc: `"${level}"`, info: null };
        },
        () => {
            const lines = dataGenerators.accessLog();
            const candidates = ['GET', 'POST', '200', '404', '500'].filter(v =>
                lines.some(l => l.includes(v)) && !lines.every(l => l.includes(v))
            );
            const value = pick(candidates.length ? candidates : ['GET']);
            return { lines, value, valueDesc: `"${value}"`, info: datasetInfo.accessLog };
        },
        () => {
            const lines = dataGenerators.csv();
            const value = pick(lines.map(l => l.split(',')[1]));
            return { lines, value, valueDesc: `"${value}"`, info: datasetInfo.csv };
        },
        () => {
            const lines = dataGenerators.inventory();
            const value = pick(lines.map(l => l.split(',')[1]));
            return { lines, value, valueDesc: `"${value}"`, info: datasetInfo.inventory };
        }
    ];
    return pick(choices)();
}

// Datasets with a delimiter + named fields, for cut/awk based recipes
function pickFieldDataset() {
    const names = ['csv', 'inventory', 'passwd', 'accessLog', 'temperatures', 'sales'];
    const name = pick(names);
    return { name, lines: dataGenerators[name](), info: datasetInfo[name] };
}

// Datasets with a numeric field
function pickNumericDataset() {
    const names = ['csv', 'inventory', 'temperatures', 'sales', 'scores'];
    const name = pick(names);
    return { name, lines: dataGenerators[name](), info: datasetInfo[name] };
}

function delimArg(info) {
    return info.delim === ' ' ? `-d' '` : `-d'${info.delim}'`;
}

export const pipeRecipes = [
    {
        cmds: ['grep', 'wc'], len: 2,
        build: () => {
            const d = pickCategoryDataset();
            return {
                text: d.lines.join('\n'),
                description: `Count how many lines contain ${d.valueDesc} using a pipe.`,
                solution: `grep ${d.value} | wc -l`
            };
        }
    },
    {
        cmds: ['grep', 'wc'], len: 2,
        build: () => {
            const d = pickCategoryDataset();
            return {
                text: d.lines.join('\n'),
                description: `Count how many lines do NOT contain ${d.valueDesc}.`,
                solution: `grep -v ${d.value} | wc -l`
            };
        }
    },
    {
        cmds: ['sort', 'head'], len: 2,
        build: () => {
            const lines = dataGenerators.bigNumbers();
            const n = randInt(2, 4);
            return {
                text: lines.join('\n'),
                description: `Show the ${n} smallest numbers (sorted ascending).`,
                solution: `sort -n | head -${n}`
            };
        }
    },
    {
        cmds: ['sort', 'head'], len: 2,
        build: () => {
            const lines = dataGenerators.bigNumbers();
            const n = randInt(2, 4);
            return {
                text: lines.join('\n'),
                description: `Show the ${n} largest numbers, biggest first.`,
                solution: `sort -rn | head -${n}`
            };
        }
    },
    {
        cmds: ['cut', 'sort'], len: 2,
        build: () => {
            const d = pickFieldDataset();
            const f = d.info.categoryField || 1;
            return {
                text: d.lines.join('\n'),
                description: `Extract the ${d.info.fields[f - 1]} (field ${f}) and sort the values alphabetically.`,
                solution: `cut ${delimArg(d.info)} -f${f} | sort`
            };
        }
    },
    {
        cmds: ['cut', 'sort'], len: 2,
        build: () => {
            const d = pickFieldDataset();
            const f = d.info.categoryField || 1;
            return {
                text: d.lines.join('\n'),
                description: `List the unique values of the ${d.info.fields[f - 1]} (field ${f}), sorted.`,
                solution: `cut ${delimArg(d.info)} -f${f} | sort -u`
            };
        }
    },
    {
        cmds: ['grep', 'cut'], len: 2,
        build: () => {
            const lines = dataGenerators.csv();
            const dept = pick(lines.map(l => l.split(',')[1]));
            return {
                text: lines.join('\n'),
                description: `Show the names (field 1) of everyone in the "${dept}" department.`,
                solution: `grep ${dept} | cut -d',' -f1`
            };
        }
    },
    {
        cmds: ['sort', 'uniq'], len: 2,
        build: () => {
            const lines = shuffle(dataGenerators.duplicates());
            return {
                text: lines.join('\n'),
                description: `Sort the list and then remove duplicates.`,
                solution: `sort | uniq`
            };
        }
    },
    {
        cmds: ['tail', 'cut'], len: 2,
        build: () => {
            const lines = dataGenerators.csvWithHeader();
            const f = randInt(1, 3);
            const info = datasetInfo.csvWithHeader;
            return {
                text: lines.join('\n'),
                description: `Skip the header line, then extract the ${info.fields[f - 1]} column (field ${f}).`,
                solution: `tail -n +2 | cut -d',' -f${f}`,
                hint: `tail -n +2 skips the header, then cut extracts the field`
            };
        }
    },
    {
        cmds: ['grep', 'nl'], len: 2,
        build: () => {
            const { data: lines, level } = logsWithLevel();
            return {
                text: lines.join('\n'),
                description: `Find lines containing "${level}" and number the results with nl.`,
                solution: `grep ${level} | nl`
            };
        }
    },
    {
        cmds: ['cut', 'paste'], len: 2,
        build: () => {
            const lines = dataGenerators.csv();
            return {
                text: lines.join('\n'),
                description: `Extract the names (field 1) and join them into one comma-separated line.`,
                solution: `cut -d',' -f1 | paste -sd','`
            };
        }
    },
    {
        cmds: ['grep', 'tr'], len: 2,
        build: () => {
            const { data: lines, level } = logsWithLevel();
            return {
                text: lines.join('\n'),
                description: `Find lines containing "${level}" and convert them to UPPERCASE.`,
                solution: `grep ${level} | tr 'a-z' 'A-Z'`
            };
        }
    },
    {
        cmds: ['awk', 'sort'], len: 2,
        build: () => {
            const d = pickFieldDataset();
            const f = d.info.categoryField || 1;
            return {
                text: d.lines.join('\n'),
                description: `Using awk, print the ${d.info.fields[f - 1]} (field ${f}) of each line, then sort the result.`,
                solution: `awk -F'${d.info.delim}' '{print $${f}}' | sort`
            };
        }
    },
    {
        cmds: ['sed', 'wc'], len: 2,
        build: () => {
            const { data: lines, level } = logsWithLevel();
            return {
                text: lines.join('\n'),
                description: `Using sed, delete every line containing "${level}", then count the remaining lines.`,
                solution: `sed '/${level}/d' | wc -l`
            };
        }
    },
    {
        cmds: ['sort', 'uniq'], len: 3,
        build: () => {
            const lines = dataGenerators.ips();
            return {
                text: lines.join('\n'),
                description: `Count how many times each IP appears, most frequent first.`,
                solution: `sort | uniq -c | sort -rn`,
                hint: `The classic: sort | uniq -c | sort -rn`
            };
        }
    },
    {
        cmds: ['cut', 'sort', 'uniq'], len: 3,
        build: () => {
            const d = pickFieldDataset();
            const f = d.info.categoryField || 1;
            return {
                text: d.lines.join('\n'),
                description: `Count how many lines there are per ${d.info.fields[f - 1]} (field ${f}).`,
                solution: `cut ${delimArg(d.info)} -f${f} | sort | uniq -c`
            };
        }
    },
    {
        cmds: ['grep', 'cut', 'sort'], len: 3,
        build: () => {
            const method = pick(['GET', 'POST']);
            const lines = accessLogWith(method);
            return {
                text: lines.join('\n'),
                description: `Show the endpoints (field 2) of all ${method} requests, sorted and deduplicated.`,
                solution: `grep '^${method}' | cut -d' ' -f2 | sort -u`
            };
        }
    },
    {
        cmds: ['sort', 'head', 'cut'], len: 3,
        build: () => {
            const d = pickNumericDataset();
            const f = d.info.numericField;
            const da = d.info.delim === ' ' ? `-d' '` : `-d'${d.info.delim}'`;
            const tArg = d.info.delim === ' ' ? `-k${f}` : `-t'${d.info.delim}' -k${f}`;
            return {
                text: d.lines.join('\n'),
                description: `Find the line with the highest ${d.info.fields[f - 1]} (field ${f}) and print only its first field.`,
                solution: `sort ${tArg} -rn | head -1 | cut ${da} -f1`,
                hint: `Sort by the numeric field descending, take the first line, cut field 1`
            };
        }
    },
    {
        cmds: ['cut', 'sort', 'tail'], len: 3,
        build: () => {
            const d = pickNumericDataset();
            const f = d.info.numericField;
            return {
                text: d.lines.join('\n'),
                description: `Print only the single highest value of the ${d.info.fields[f - 1]} (field ${f}).`,
                solution: `cut ${delimArg(d.info)} -f${f} | sort -n | tail -1`
            };
        }
    },
    {
        cmds: ['tail', 'cut', 'sort'], len: 3,
        build: () => {
            const lines = dataGenerators.csvWithHeader();
            return {
                text: lines.join('\n'),
                description: `Skip the header, extract the salary (field 3) and sort the values numerically.`,
                solution: `tail -n +2 | cut -d',' -f3 | sort -n`
            };
        }
    },
    {
        cmds: ['grep', 'cut', 'paste'], len: 3,
        build: () => {
            const lines = dataGenerators.csv();
            const dept = pick(lines.map(l => l.split(',')[1]));
            return {
                text: lines.join('\n'),
                description: `Take everyone in "${dept}", extract their names and join them with commas into one line.`,
                solution: `grep ${dept} | cut -d',' -f1 | paste -sd','`
            };
        }
    },
    {
        cmds: ['awk', 'sort', 'head'], len: 3,
        build: () => {
            const lines = dataGenerators.scores();
            const n = randInt(2, 3);
            return {
                text: lines.join('\n'),
                description: `Using awk, print only the scores (2nd column), then show the top ${n} highest.`,
                solution: `awk '{print $2}' | sort -rn | head -${n}`
            };
        }
    },
    {
        cmds: ['sort', 'uniq', 'head'], len: 4,
        build: () => {
            const lines = dataGenerators.ips();
            return {
                text: lines.join('\n'),
                description: `Find the single most frequent line (output it with its count).`,
                solution: `sort | uniq -c | sort -rn | head -1`
            };
        }
    },
    {
        cmds: ['grep', 'cut', 'sort', 'uniq'], len: 4,
        build: () => {
            const method = pick(['GET', 'POST']);
            const lines = accessLogWith(method);
            return {
                text: lines.join('\n'),
                description: `Among ${method} requests, count how many times each endpoint (field 2) appears, most frequent first.`,
                solution: `grep '^${method}' | cut -d' ' -f2 | sort | uniq -c | sort -rn`
            };
        }
    },
    {
        cmds: ['cut', 'sort', 'uniq'], len: 4,
        build: () => {
            const d = pickFieldDataset();
            const f = d.info.categoryField || 1;
            return {
                text: d.lines.join('\n'),
                description: `Rank the values of the ${d.info.fields[f - 1]} (field ${f}) by how often they appear, most frequent first.`,
                solution: `cut ${delimArg(d.info)} -f${f} | sort | uniq -c | sort -rn`
            };
        }
    },
    {
        cmds: ['grep', 'awk'], len: 2,
        build: () => {
            const lines = accessLogWith(200, 'status');
            return {
                text: lines.join('\n'),
                description: `Find requests with status 200 and print only their endpoints (field 2) using awk.`,
                solution: `grep ' 200 ' | awk '{print $2}'`,
                hint: `Match " 200 " with spaces so you don't catch 200 inside other numbers`
            };
        }
    }
];

// ---------------------------------------------------------------------------
// Problem generation with difficulty control and output validation
// ---------------------------------------------------------------------------

function recipesFor(selected, lenFilter) {
    return pipeRecipes.filter(r =>
        lenFilter(r.len) && r.cmds.every(c => selected.includes(c))
    );
}

function buildSingle(selected) {
    const withTemplates = selected.filter(c => problemGenerators[c]);
    if (withTemplates.length === 0) return null;
    const cmd = pick(withTemplates);
    const problem = problemGenerators[cmd]();
    problem.cmds = [cmd];
    problem.isPipe = false;
    return problem;
}

function buildRecipe(recipes) {
    if (recipes.length === 0) return null;
    const recipe = pick(recipes);
    const problem = recipe.build();
    problem.cmds = recipe.cmds;
    problem.isPipe = true;
    return problem;
}

function tryGenerate(selected, difficulty) {
    if (difficulty === 'single') return buildSingle(selected);
    if (difficulty === 'short') {
        return buildRecipe(recipesFor(selected, l => l === 2)) || buildSingle(selected);
    }
    if (difficulty === 'long') {
        return buildRecipe(recipesFor(selected, l => l >= 3))
            || buildRecipe(recipesFor(selected, l => l === 2))
            || buildSingle(selected);
    }
    // mixed
    const roll = Math.random();
    if (roll < 0.45) return buildSingle(selected);
    if (roll < 0.75) return buildRecipe(recipesFor(selected, l => l === 2)) || buildSingle(selected);
    return buildRecipe(recipesFor(selected, l => l >= 3)) || buildSingle(selected);
}

// Generates a validated practice problem: the solution must run, produce
// non-empty output and actually transform the input.
export function generateProblem(selectedCommands, difficulty = 'mixed') {
    const selected = Array.from(selectedCommands);

    for (let attempt = 0; attempt < 25; attempt++) {
        const problem = tryGenerate(selected, difficulty);
        if (!problem) break;
        try {
            const expected = executePipeline(problem.text, problem.solution);
            if (!expected.trim()) continue;
            if (expected.trim() === problem.text.trim()) continue;
            if (!problem.hint) problem.hint = problem.solution;
            problem.expected = expected;
            return problem;
        } catch (e) {
            continue;
        }
    }

    // Safe fallback
    const data = dataGenerators.logs();
    if (!data.some(l => l.includes('ERROR'))) data[0] = 'ERROR: Connection failed';
    if (data.every(l => l.includes('ERROR'))) data[data.length - 1] = 'INFO: Process started';
    const fallback = {
        text: data.join('\n'),
        description: 'Find all lines containing "ERROR".',
        solution: 'grep ERROR',
        hint: 'grep ERROR',
        cmds: ['grep'],
        isPipe: false
    };
    fallback.expected = executePipeline(fallback.text, fallback.solution);
    return fallback;
}
