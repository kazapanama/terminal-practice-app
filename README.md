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
| `grep` | Search for patterns | `grep -i`, `-v`, `-c`, `-n`, `-w` (whole word), `-o`, `-E "a\|b"`, `^anchor$` |
| `head` | First N lines/chars | `head -5`, `head -n 10`, `head -c 20` |
| `tail` | Last N lines / from line N | `tail -3`, `tail -n 5`, `tail -n +2` (skip header) |
| `sort` | Sort lines | `sort -n`, `-r`, `-rn`, `-u`, `-f`, `sort -t',' -k3 -rn`, `sort -k2 -n` |
| `uniq` | Filter adjacent duplicates | `uniq -c`, `-d`, `-u`, `-i` (ignore case) |
| `wc` | Count lines/words/chars | `wc -l`, `wc -w`, `wc -c` |
| `cut` | Extract fields/chars | `cut -d',' -f1,3`, `cut -d':' -f2-` (open range), `cut -c1-5` |
| `tr` | Translate characters | `tr 'a-z' 'A-Z'`, `tr '[:lower:]' '[:upper:]'`, `tr -d '0-9'`, `tr -s ' '` |
| `sed` | Stream editor | `s/old/new/g`, `s\|/a\|/b\|`, `s/x/[&]/`, `s/(a) (b)/\2 \1/`, `/pat/d`, `2,4d`, `-n '2,4p'` |
| `awk` | Field processing | `'{print $1}'`, `-F','`, `$NF`, `NR`, `NF`, `'$3 > 100'`, `'{s+=$1} END {print s}'` |
| `nl` | Number lines | `nl` |
| `paste` | Merge/join lines | `paste -sd','` |
| `rev` | Reverse each line | `rev` |
| `tac` | Reverse line order | `tac` |
| `cat` | Pass through / number lines | `cat`, `cat -n` |

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
│   ├── commands.js     # Command implementations (incl. mini-awk & sed engine)
│   ├── utils.js        # Utility functions
│   ├── dataGenerators.js    # Randomized practice datasets
│   └── problemGenerators.js # Templates + pipeline recipe composer
├── scripts/
│   ├── testCommands.mjs     # Unit tests for command implementations
│   ├── testGenerators.mjs   # Stress tests for problem generators
│   ├── generateLevels.mjs   # Builds master/realworld levels (expected outputs computed by the engine)
│   └── verifyLevels.mjs     # Verifies challenge data against the engine
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
npm test                  # run command implementation tests
node scripts/testGenerators.mjs   # stress-test practice generators
npm run verify-levels     # check challenge data against the engine
npm run generate-levels   # regenerate master/realworld data
```

## Progress

Your progress is automatically saved including:
- Completed challenges per level
- Practice mode statistics and best streak
- Selected command and difficulty preferences

Click "Reset Progress" on the landing page to start fresh.
