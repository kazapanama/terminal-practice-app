# Linux Command Practice

**Live Demo: [terminal-practice.netlify.app](https://terminal-practice.netlify.app/)**

An interactive web app to learn and practice Linux text processing commands like `grep`, `sort`, `cut`, `sed`, and more.

## Features

- **Challenge Mode** - 200 progressive challenges across 4 difficulty levels (Beginner, Intermediate, Advanced, Expert)
- **Practice Mode** - Randomly generated problems for selected commands
- **Visual Progress Tracking** - Grid showing completed/remaining challenges
- **Pipe Support** - Chain commands together like `sort | uniq -c | sort -rn`
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
| `grep` | Search for patterns | `grep "error"`, `grep -i "test"`, `grep -v "debug"`, `grep -c "warn"` |
| `head` | Show first N lines | `head -5`, `head -n 10` |
| `tail` | Show last N lines | `tail -3`, `tail -n 5` |
| `sort` | Sort lines | `sort`, `sort -n`, `sort -r`, `sort -rn`, `sort -u` |
| `uniq` | Filter duplicates | `uniq`, `uniq -c`, `uniq -d` |
| `wc` | Count lines/words/chars | `wc -l`, `wc -w`, `wc -c` |
| `cut` | Extract fields | `cut -d',' -f1`, `cut -d':' -f1,3`, `cut -c1-5` |
| `tr` | Translate characters | `tr 'a-z' 'A-Z'`, `tr -d '0-9'` |
| `sed` | Find and replace | `sed 's/old/new/g'` |
| `rev` | Reverse each line | `rev` |
| `tac` | Reverse line order | `tac` |
| `cat` | Pass through / number lines | `cat`, `cat -n` |

## Pipes

Chain commands with `|`:

```bash
sort | uniq -c | sort -rn    # Count occurrences, sort by frequency
grep "error" | wc -l          # Count error lines
cut -d',' -f2 | sort -u       # Extract field 2, unique values
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
│   ├── commands.js     # Command implementations
│   ├── utils.js        # Utility functions
│   ├── dataGenerators.js    # Practice data generators
│   └── problemGenerators.js # Practice problem generators
└── data/
    ├── beginner.json      # 50 challenges
    ├── intermediate.json  # 50 challenges
    ├── advanced.json      # 50 challenges
    ├── expert.json        # 50 challenges
    └── sandbox.json       # Free practice
```

## Difficulty Levels

- **Beginner** - Basic commands: `grep`, `head`, `tail`, `sort`, `wc`
- **Intermediate** - Flags and options: `grep -i`, `uniq -c`, `cut -d`, `sort -n`
- **Advanced** - Pipes and transformations: `tr`, `sed`, `rev`, `tac`
- **Expert** - Complex multi-command pipelines

## Progress

Your progress is automatically saved including:
- Completed challenges per level
- Practice mode statistics
- Best streak
- Selected command preferences

Click "Reset Progress" on the landing page to start fresh.
