// Practice templates for awk as a language, grep context, human/version
// sort, the extra sed commands, multi-file tasks and the newer commands
// (fold, column, seq, comm, join). Merged into problemGenerators.

import { randInt, pick, shuffle } from './utils.js';
import { dataGenerators } from './dataGenerators.js';

const NAMES = ['alice', 'bob', 'carol', 'dave', 'eve', 'frank', 'grace', 'henry', 'ivan', 'julia'];
const LEVELS = ['ERROR', 'WARNING', 'INFO', 'DEBUG'];
const LOG_FILES = ['app', 'web', 'db', 'auth', 'cron', 'mail'];

// 2-4 log files, each guaranteed to exist with some content
function logFiles() {
    const names = shuffle(LOG_FILES).slice(0, randInt(2, 4)).map(n => `${n}.log`);
    const files = {};
    for (const n of names) files[n] = dataGenerators.logs().slice(0, randInt(3, 6)).join('\n') + '\n';
    return files;
}

function presentLevel(text) {
    const present = LEVELS.filter(l => text.includes(l));
    return pick(present.length ? present : ['INFO']);
}

function sizes() {
    const units = ['', 'K', 'M', 'G'];
    const names = shuffle(['docs', 'photos', 'videos', 'music', 'backups', 'cache', 'src', 'logs']).slice(0, randInt(5, 7));
    return names.map(n => {
        const unit = pick(units);
        const value = unit === '' ? randInt(10, 999) : pick([randInt(1, 999), (randInt(10, 99) / 10).toFixed(1)]);
        return `${value}${unit} ${n}`;
    });
}

function versions() {
    const set = new Set();
    while (set.size < randInt(5, 7)) set.add(`v${randInt(0, 2)}.${randInt(0, 12)}.${randInt(0, 15)}`);
    return shuffle([...set]);
}

// Two sorted name lists with some names in common and some unique to each
function twoLists() {
    const names = shuffle(NAMES);
    const common = names.slice(0, randInt(1, 2));
    const only1 = names.slice(2, 2 + randInt(1, 3));
    const only2 = names.slice(5, 5 + randInt(1, 3));
    return [[...common, ...only1].sort(), [...common, ...only2].sort()];
}

export const extraTemplates = {
    awk: [
        () => {
            const data = dataGenerators.inventory();
            return {
                text: data.join('\n'),
                description: 'Print a table with printf: product (1st field) left-aligned in 10 characters, then the price (3rd field) right-aligned in 6 characters.',
                solution: `awk -F',' '{printf "%-10s%6d\\n", $1, $3}'`
            };
        },
        () => {
            const data = dataGenerators.scores();
            const limit = randInt(55, 75);
            return {
                text: data.join('\n'),
                description: `Print every name followed by "pass" if the score is ${limit} or more, otherwise "fail" (use if/else in awk).`,
                solution: `awk '{if ($2 >= ${limit}) print $1, "pass"; else print $1, "fail"}'`
            };
        },
        () => {
            const data = dataGenerators.ips();
            return {
                text: data.join('\n'),
                description: 'Remove repeated lines but keep the first occurrence of each in its original position (one awk).',
                solution: `awk '!seen[$0]++'`
            };
        },
        () => {
            const data = dataGenerators.scores();
            return {
                text: data.join('\n'),
                description: 'Print the name and score of the best student as "name score", using only awk.',
                solution: `awk 'NR == 1 || $2 > max {max = $2; name = $1} END {print name, max}'`
            };
        },
        () => {
            const data = dataGenerators.scores();
            return {
                text: data.join('\n'),
                description: 'Print the average score with exactly one decimal.',
                solution: `awk '{s += $2} END {printf "%.1f\\n", s / NR}'`
            };
        },
        () => {
            const data = dataGenerators.fruits();
            return {
                text: data.join('\n'),
                description: 'Print every word in UPPERCASE followed by its length.',
                solution: `awk '{print toupper($1), length($1)}'`
            };
        },
        () => {
            const data = dataGenerators.words();
            const n = randInt(2, 4);
            return {
                text: data.join('\n'),
                description: `Print the first ${n} characters of every word using awk's substr().`,
                solution: `awk '{print substr($1, 1, ${n})}'`
            };
        },
        () => {
            const data = dataGenerators.sales();
            return {
                text: data.join('\n'),
                description: 'Replace every "-" with "." in the lines using awk\'s gsub().',
                solution: `awk '{gsub(/-/, "."); print}'`
            };
        },
        () => {
            const data = dataGenerators.bigNumbers().map((n, i) => `item${i + 1} ${n}`);
            const limit = randInt(1000, 3000);
            return {
                text: data.join('\n'),
                description: `Pass ${limit} to awk as the variable "min" (awk -v) and print the lines whose 2nd field is at least min.`,
                solution: `awk -v min=${limit} '$2 >= min'`
            };
        },
        () => {
            const data = dataGenerators.scores();
            return {
                text: data.join('\n'),
                description: 'Turn the lines into CSV: same fields, separated by commas instead of spaces (awk with OFS).',
                solution: `awk -v OFS=',' '{$1 = $1; print}'`
            };
        }
    ],

    grep: [
        () => {
            const data = dataGenerators.timestampedLogs();
            const level = presentLevel(data.join('\n'));
            const [flag, what] = pick([['-A1', 'the line after'], ['-B1', 'the line before'], ['-C1', 'one line before and after']]);
            return {
                text: data.join('\n'),
                description: `Show every ${level} line together with ${what} it (grep context).`,
                solution: `grep ${flag} ${level}`
            };
        },
        () => {
            const files = logFiles();
            const level = presentLevel(Object.values(files).join(''));
            return {
                text: '',
                files,
                description: `Count the ${level} lines in each .log file (output "file:count").`,
                solution: `grep -c ${level} *.log`
            };
        },
        () => {
            const files = logFiles();
            const level = presentLevel(Object.values(files).join(''));
            return {
                text: '',
                files,
                description: `Print only the names of the .log files that contain ${level}.`,
                solution: `grep -l ${level} *.log`
            };
        }
    ],

    sort: [
        () => {
            const data = sizes();
            return {
                text: data.join('\n'),
                description: `These are disk sizes with K/M/G suffixes. Sort them from the biggest to the smallest.`,
                solution: `sort -hr`
            };
        },
        () => {
            const data = versions();
            return {
                text: data.join('\n'),
                description: 'Sort the versions in version order (v1.10.0 comes after v1.9.3).',
                solution: `sort -V`
            };
        }
    ],

    sed: [
        () => {
            const data = dataGenerators.csv();
            return {
                text: data.join('\n'),
                description: 'Insert the header line "name,department,salary" before the first line using sed.',
                solution: `sed '1i name,department,salary'`
            };
        },
        () => {
            const data = dataGenerators.fruits();
            return {
                text: data.join('\n'),
                description: 'Append a last line "--- end ---" after the final line using sed.',
                solution: `sed '$a --- end ---'`
            };
        },
        () => {
            const data = dataGenerators.csv();
            return {
                text: data.join('\n'),
                description: 'Translate the characters with sed y: every "," becomes ";" and every "a" becomes "A".',
                solution: `sed 'y/,a/;A/'`
            };
        },
        () => {
            const data = dataGenerators.logs();
            return {
                text: data.join('\n'),
                description: 'Replace the whole 2nd line with the text "[hidden]" using sed.',
                solution: `sed '2c [hidden]'`
            };
        }
    ],

    wc: [
        () => {
            const files = logFiles();
            return {
                text: '',
                files,
                description: 'Count the lines of every .log file (wc also prints a total line).',
                solution: 'wc -l *.log'
            };
        }
    ],

    fold: [
        () => {
            const data = dataGenerators.sentences();
            const w = randInt(12, 25);
            return {
                text: data.join('\n'),
                description: `Wrap the lines at ${w} characters (break anywhere).`,
                solution: `fold -w ${w}`
            };
        },
        () => {
            const data = dataGenerators.sentences();
            const w = randInt(15, 25);
            return {
                text: data.join('\n'),
                description: `Wrap the lines to at most ${w} characters, breaking only at spaces.`,
                solution: `fold -s -w ${w}`
            };
        }
    ],

    column: [
        () => {
            const rows = shuffle(NAMES).slice(0, randInt(3, 5)).map(n => `${n} ${randInt(18, 70)} ${pick(['kyiv', 'lviv', 'odesa', 'dnipro'])}`);
            return {
                text: ['name age city', ...rows].join('\n'),
                description: 'Align the columns into a table.',
                solution: 'column -t'
            };
        },
        () => {
            const data = dataGenerators.csv();
            return {
                text: data.join('\n'),
                description: 'Show the comma-separated data as an aligned table (fields separated by commas).',
                solution: `column -t -s','`
            };
        }
    ],

    seq: [
        () => {
            const a = randInt(1, 10), b = a + randInt(3, 8);
            return { text: '', description: `Print the numbers from ${a} to ${b}, one per line. (There is no input — generate them.)`, solution: `seq ${a} ${b}` };
        },
        () => {
            const step = randInt(2, 5), last = step * randInt(4, 8);
            return { text: '', description: `Print ${step}, ${step * 2}, ... up to ${last}, one per line.`, solution: `seq ${step} ${step} ${last}` };
        },
        () => {
            const n = randInt(5, 12);
            return { text: '', description: `Print 1 to ${n} on a single line separated by spaces.`, solution: `seq -s ' ' ${n}` };
        },
        () => {
            const n = randInt(8, 15);
            return { text: '', description: `Print 1 to ${n} with equal width (leading zeros), one per line.`, solution: `seq -w ${n}` };
        }
    ],

    comm: [
        () => {
            const [a, b] = twoLists();
            return {
                text: '',
                files: { 'team1.txt': a.join('\n') + '\n', 'team2.txt': b.join('\n') + '\n' },
                description: 'Both files are sorted. Print the names that are in BOTH team1.txt and team2.txt.',
                solution: 'comm -12 team1.txt team2.txt'
            };
        },
        () => {
            const [a, b] = twoLists();
            return {
                text: '',
                files: { 'team1.txt': a.join('\n') + '\n', 'team2.txt': b.join('\n') + '\n' },
                description: 'Both files are sorted. Print the names that are only in team1.txt.',
                solution: 'comm -23 team1.txt team2.txt'
            };
        }
    ],

    join: [
        () => {
            const ids = shuffle([1, 2, 3, 4, 5, 6]);
            const a = ids.slice(0, 4).sort().map(i => `${i} ${NAMES[i]}`);
            const b = ids.slice(2, 6).sort().map(i => `${i} ${pick(['eng', 'ops', 'sales', 'hr'])}`);
            return {
                text: '',
                files: { 'names.txt': a.join('\n') + '\n', 'teams.txt': b.join('\n') + '\n' },
                description: 'Both files are sorted by id (1st field). Join them: print "id name team" for ids present in both.',
                solution: 'join names.txt teams.txt'
            };
        }
    ],

    paste: [
        () => {
            const names = shuffle(NAMES).slice(0, randInt(3, 5));
            return {
                text: '',
                files: {
                    'names.txt': names.join('\n') + '\n',
                    'ages.txt': names.map(() => randInt(18, 70)).join('\n') + '\n'
                },
                description: 'Put names.txt and ages.txt side by side, separated by ":".',
                solution: `paste -d':' names.txt ages.txt`
            };
        }
    ]
};

// Two-command recipes with awk arrays (for-in order is not fixed, so sort)
export const extraRecipes = [
    {
        cmds: ['awk', 'sort'], len: 2,
        build: () => {
            const data = dataGenerators.accessLog();
            return {
                text: data.join('\n'),
                description: 'Count the requests per HTTP method (1st field) with an awk array and print "METHOD COUNT", sorted by method.',
                solution: `awk '{c[$1]++} END {for (m in c) print m, c[m]}' | sort`
            };
        }
    },
    {
        cmds: ['awk', 'sort'], len: 2,
        build: () => {
            const data = dataGenerators.csv();
            return {
                text: data.join('\n'),
                description: 'Sum the salaries (3rd field) per department (2nd field) and print "department total", sorted by department.',
                solution: `awk -F',' '{s[$2] += $3} END {for (d in s) print d, s[d]}' | sort`
            };
        }
    },
    {
        cmds: ['awk', 'sort', 'head'], len: 3,
        build: () => {
            const data = dataGenerators.accessLog();
            return {
                text: data.join('\n'),
                description: 'Sum the response times (4th field, like "120ms") per endpoint (2nd field) and show the slowest endpoint in total as "endpoint total".',
                solution: `awk '{t[$2] += $4} END {for (e in t) print e, t[e]}' | sort -k2 -rn | head -1`
            };
        }
    }
];
