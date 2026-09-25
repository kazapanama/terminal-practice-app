# Linux Command Practice

**Live Demo: [terminal-practice.netlify.app](https://terminal-practice.netlify.app/)**

An interactive web app to learn and practice Linux text processing commands like `grep`, `sed`, `awk`, `sort`, `cut`, and more.

## Features

- **Challenge Mode** - 136 progressive challenges across 6 difficulty levels (Beginner, Intermediate, Advanced, Expert, Master, Real World)
- **Practice Mode** - Randomly generated problems with selectable commands and task difficulty (single command / short pipes / long pipes / mixed)
- **Pipeline Recipe Generator** - Practice problems are composed from randomized datasets (logs, CSV, access logs, /etc/passwd, emails, IPs...) so tasks never repeat
- **Visual Progress Tracking** - Grid showing completed/remaining challenges
- **Pipe Support** - Chain commands together like `sort | uniq -c | sort -rn` (quotes-aware: `grep -E 'a|b'` works)
- **Progress Saved** - All progress stored in localStorage
- **Mismatch Feedback** - A wrong answer shows a line diff against the expected output plus a tip ("right lines, wrong order", "too strict"...)
- **Pipeline Inspector** - Click any stage of a pipeline to see its intermediate output
- **Progressive Hints** - Which commands → the command shape with values hidden → the full solution. Solving after seeing the solution is marked as assisted
- **Weak-spot Practice** - Per-command success is tracked; commands you often miss come up more often

## How to Run

Double-click `start.bat` or:

```bash
# Using Python
python -m http.server 8080

# Using Node.js
npx serve
```

Then open `http://localhost:8080` in your browser.

## Supported Commands

| Command | Description | Examples |
|---------|-------------|----------|
| `grep` | Search for patterns | `grep -i`, `-v`, `-c`, `-n`, `-w`, `-x`, `-o`, `-F`, `-m N`, `-e P`, `-E "a\|b"`, `-P '\d'`, `[[:digit:]]` |
| `head` | First N lines/chars | `head -5`, `head -n 10`, `head -c 20` |
| `tail` | Last N lines / from line N | `tail -3`, `tail -n 5`, `tail -n +2` (skip header) |
| `sort` | Sort lines (byte order, as with `LC_ALL=C`) | `sort -n`, `-r`, `-u`, `-f`, `-b`, `-s`, `sort -t',' -k3 -rn`, `sort -k2,2 -k1`, `sort -k3n` |
| `uniq` | Filter adjacent duplicates | `uniq -c`, `-d`, `-u`, `-i` (ignore case) |
| `wc` | Count lines/words/chars | `wc -l`, `wc -w`, `wc -c` |
| `cut` | Extract fields/chars | `cut -d',' -f1,3`, `cut -d':' -f2-` (open range), `cut -c1-5` |
| `tr` | Translate characters | `tr 'a-z' 'A-Z'`, `tr '[:lower:]' '[:upper:]'`, `tr -d '0-9'`, `tr -s ' '` |
| `sed` | Stream editor | `s/old/new/g`, `s/a/b/2`, `s\|/a\|/b\|`, `s/x/[&]/`, `-E 's/(a) (b)/\2 \1/'`, `/pat/d`, `2,4s/a/b/`, `-n '1p;$p'`, `/a/,/b/d`, `3q`, `=` |
| `awk` | Field processing | `'{print $1}'`, `-F','`, `$NF`, `NR`, `NF`, `'$3 > 100'`, `'{s+=$1} END {print s}'` |
| `nl` | Number lines | `nl` |
| `paste` | Merge/join lines | `paste -sd','` |
| `rev` | Reverse each line | `rev` |
| `tac` | Reverse line order | `tac` |
| `cat` | Pass through / number lines | `cat`, `cat -n`, `cat -b`, `cat -s` |

## How close is this to a real terminal?

The engine is checked against real bash + GNU grep/sed/gawk/coreutils (`npm run test:diff`, also run in CI):
every challenge solution, hundreds of generated practice problems and ~130 edge cases must produce
byte-identical output. In particular:

- **Regex dialects are real**: `grep`/`sed` use basic regex (BRE) unless `-E` is given, so
  `grep 'a|b'` matches a literal `a|b` and `sed 's/(x)/\1/'` fails exactly like in Linux.
  POSIX classes (`[[:digit:]]`) work; Perl syntax (`\d`) only with `grep -P`.
- **Streams end with a newline** like a real pipe: `grep nothing | wc -l` prints `0`,
  `tr '\n' ','` leaves a trailing comma, `wc -c` counts newlines.
- **Shell quoting**: single/double quotes, `\` escapes, `$'\t'`; `$1` inside double quotes is
  expanded by the shell to nothing (with a warning), just like in bash.
- **Unsupported options fail loudly** (`grep: invalid option -- 'A' (not supported in this trainer)`)
  instead of being silently ignored. Commands have no files — they read the Input panel.
- `sort` uses byte order (`LC_ALL=C`): uppercase sorts before lowercase. A desktop
  with `en_US.UTF-8` would interleave cases; use `sort -f` to ignore case.

## Pipes

Chain commands with `|` (quotes are respected):

```bash
sort | uniq -c | sort -rn          # Count occurrences, sort by frequency
grep -E 'ERROR|WARN' | wc -l       # Count error/warn lines
cut -d',' -f2 | sort -u            # Extract field 2, unique values
awk -F',' '$3 > 100 {print $1}'    # Filter rows by numeric field
```

## Project Structure

```
term-app/
├── index.html          # Main HTML
├── styles.css          # Styles
├── start.bat           # Quick start script
├── js/
│   ├── app.js          # Main initialization
│   ├── state.js        # State management & localStorage
│   ├── ui.js           # UI functions
│   ├── commands.js     # Command implementations + pipeline runner
│   ├── awk.js          # awk subset
│   ├── sed.js          # sed subset (addresses, s/d/p/q/=)
│   ├── regex.js        # POSIX BRE/ERE -> JavaScript RegExp
│   ├── utils.js        # Shell parsing, getopt, streams, helpers
│   ├── hints.js        # Progressive hints derived from solutions
│   ├── feedback.js     # Output vs expected: line diff + tips
│   ├── dataGenerators.js    # Randomized practice datasets
│   └── problemGenerators.js # Templates + pipeline recipe composer
├── scripts/
│   ├── testCommands.mjs     # Unit tests for command implementations
│   ├── testLearning.mjs     # Hints and mismatch feedback
│   ├── testGenerators.mjs   # Stress tests for problem generators
│   ├── generateLevels.mjs   # Builds master/realworld levels (expected outputs computed by the engine)
│   ├── verifyLevels.mjs     # Every challenge: unique id + solution reproduces expected
│   ├── diffTest.mjs         # Engine vs real bash/GNU tools
│   └── diffCases.mjs        # Edge cases for the differential test
└── data/
    ├── beginner.json
    ├── intermediate.json
    ├── advanced.json
    ├── expert.json
    ├── master.json        # awk, advanced sed, nl, paste, power flags
    ├── realworld.json     # realistic log/CSV/passwd scenarios
    └── sandbox.json       # Free practice
```

## Difficulty Levels

- **Beginner** - Basic commands: `grep`, `head`, `tail`, `sort`, `wc`
- **Intermediate** - Flags and options: `grep -i`, `uniq -c`, `cut -d`, `sort -n`
- **Advanced** - Pipes and transformations: `tr`, `sed`, `rev`, `tac`
- **Expert** - Complex multi-command pipelines
- **Master** - `awk`, advanced `sed` (line addressing, capture groups, `&`), `nl`, `paste`, `tail -n +N`, `grep -w/-E`
- **Real World** - Realistic scenarios: web access logs, SSH auth logs, `/etc/passwd`, sales CSV, git history

## Development

```bash
npm test                  # command tests + generator stress test + challenge data check
npm run test:diff         # compare the engine with real bash (needs bash; Git Bash works on Windows)
npm run verify-levels     # check challenge data against the engine
npm run generate-levels   # regenerate master/realworld data
```

## Progress

Your progress is automatically saved including:
- Completed challenges per level
- Practice mode statistics and best streak
- Selected command and difficulty preferences

Click "Reset Progress" on the landing page to start fresh.
