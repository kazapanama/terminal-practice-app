# Linux Command Practice

**Live Demo: [terminal-practice.netlify.app](https://terminal-practice.netlify.app/)**

An interactive web app to learn and practice Linux text processing commands like `grep`, `sed`, `awk`, `sort`, `cut`, and more.

## Features

- **Challenge Mode** - 190 progressive challenges across 8 difficulty levels (Beginner, Intermediate, Advanced, Expert, Master, Power Tools, Files & Shell, Real World)
- **Files & a mini shell** - Tasks can come with files: file arguments, wildcards (`*.log`), redirections (`>` `>>` `<` `2>/dev/null` `2>&1`), `;` `&&` `||` and `$?`. The Input panel shows every file and marks the ones your commands created or changed
- **Practice Mode** - Randomly generated problems with selectable commands and task difficulty (single command / short pipes / long pipes / mixed)
- **Pipeline Recipe Generator** - Practice problems are composed from randomized datasets (logs, CSV, access logs, /etc/passwd, emails, IPs...) so tasks never repeat
- **Visual Progress Tracking** - Grid showing completed/remaining challenges
- **Pipe Support** - Chain commands together like `sort | uniq -c | sort -rn` (quotes-aware: `grep -E 'a|b'` works)
- **Progress Saved** - All progress stored in localStorage
- **Mismatch Feedback** - A wrong answer shows a line diff against the expected output plus a tip ("right lines, wrong order", "too strict"...)
- **Pipeline Inspector** - Click any stage of a pipeline to see its intermediate output
- **Progressive Hints** - Which commands → the command shape with values hidden → the full solution. Solving after seeing the solution is marked as assisted
- **Weak-spot Practice** - Per-command success is tracked; commands you often miss come up more often
- **Terminal Feel** - ↑/↓ command history (kept between visits), Tab completes command names and lists a command's options, Ctrl+L clears the output, Esc clears the line
- **Sandbox with your own text** - Edit the input of a sandbox task and experiment on your own data

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
| `grep` | Search for patterns | `grep -i`, `-v`, `-c`, `-n`, `-w`, `-x`, `-o`, `-F`, `-m N`, `-e P`, `-E "a\|b"`, `-P '\d'`, `[[:digit:]]`, `-A/-B/-C N`, `-l`, `-L`, `-r`, `-h/-H`, `-q`, `-s` |
| `head` | First N lines/chars | `head -5`, `head -n 10`, `head -c 20`, several files with `==> name <==` headers |
| `tail` | Last N lines / from line N | `tail -3`, `tail -n 5`, `tail -n +2` (skip header) |
| `sort` | Sort lines (byte order, as with `LC_ALL=C`) | `sort -n`, `-h` (2K < 1G), `-V` (versions), `-r`, `-u`, `-f`, `-b`, `-s`, `-c`, `-o FILE`, `sort -t',' -k3 -rn`, `sort -k2,2 -k1`, `sort -k3n` |
| `uniq` | Filter adjacent duplicates | `uniq -c`, `-d`, `-u`, `-i` (ignore case) |
| `wc` | Count lines/words/chars | `wc -l`, `wc -w`, `wc -c`, `wc -m`, `wc -L`, `wc -l *.log` (with total) |
| `cut` | Extract fields/chars | `cut -d',' -f1,3`, `cut -d':' -f2-` (open range), `cut -c1-5` |
| `tr` | Translate characters | `tr 'a-z' 'A-Z'`, `tr '[:lower:]' '[:upper:]'`, `tr -d '0-9'`, `tr -s ' '` |
| `sed` | Stream editor | `s/old/new/g`, `s/a/b/2`, `s\|/a\|/b\|`, `s/x/[&]/`, `-E 's/(a) (b)/\2 \1/'`, `/pat/d`, `2,4s/a/b/`, `-n '1p;$p'`, `/a/,/b/d`, `3q`, `=`, `y/ab/xy/`, `1i text`, `$a text`, `2,4c text`, `w file`, `-i[.bak]`, `-s` |
| `awk` | A full awk interpreter | `-F`, `-v`, patterns and ranges, `BEGIN/END`, arrays and `for (k in a)`, `if/while/for/do`, `next`, `exit`, functions, `printf`, `length substr index split sub gsub match sprintf toupper tolower int sqrt ...`, `$1 = $1` with `OFS`, `print > "file"`, `print \| "sort"` |
| `nl` | Number lines | `nl` |
| `paste` | Merge lines / files side by side | `paste -sd','`, `paste -d, a.txt b.txt`, `paste - -` |
| `rev` | Reverse each line | `rev` |
| `tac` | Reverse line order | `tac` |
| `cat` | Print / concatenate files | `cat a b`, `cat -n`, `cat -b`, `cat -s`, `cat -A` |
| `echo` / `printf` | Print text | `echo -n`, `echo -e 'a\tb'`, `printf '%s=%d\n' a 1 b 2` |
| `seq` | Number sequences | `seq 5`, `seq 2 2 10`, `seq -s, 5`, `seq -w 10`, `seq -f '%03g' 5` |
| `fold` | Wrap lines | `fold -w 20`, `fold -s -w 20` |
| `column` | Align a table | `column -t`, `column -t -s,` |
| `comm` | Compare two sorted files | `comm -12 a b`, `comm -23 a b` |
| `join` | Join files on a field | `join a b`, `join -t, -1 2 -2 1`, `-a1`, `-v2`, `-o 1.1,2.2` |
| `ls` / `tee` | Files and copies of output | `ls`, `ls logs`, `ls *.log`, `ls -F`; `sort f \| tee out.txt \| head` |

## How close is this to a real terminal?

The engine is checked against real bash + GNU grep/sed/gawk/coreutils (`npm run test:diff`, also run in CI):
every challenge solution, hundreds of generated practice problems and ~130 edge cases must produce
byte-identical output, the same success/failure and the same files afterwards. In particular:

- **Regex dialects are real**: `grep`/`sed` use basic regex (BRE) unless `-E` is given, so
  `grep 'a|b'` matches a literal `a|b` and `sed 's/(x)/\1/'` fails exactly like in Linux.
  POSIX classes (`[[:digit:]]`) work; Perl syntax (`\d`) only with `grep -P`.
- **Streams end with a newline** like a real pipe: `grep nothing | wc -l` prints `0`,
  `tr '\n' ','` leaves a trailing comma, `wc -c` counts newlines.
- **Shell quoting**: single/double quotes, `\` escapes, `$'\t'`; `$1` inside double quotes is
  expanded by the shell to nothing (with a warning), just like in bash.
- **Unsupported options fail loudly** (`grep: invalid option -- 'Z' (not supported in this trainer)`)
  instead of being silently ignored.
- **Errors behave like in a shell**: messages go to stderr (shown in red) while the rest of the command
  line keeps running; exit statuses drive `&&`, `||` and `$?`. `sort f > f` empties the file, as in bash.
- Not supported: subshells, `$(...)`, variables, here-documents, `getline` / `system()` in awk, sed hold space.
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
│   ├── shell.js        # Command line parsing and execution: pipes, ; && ||, redirections, globs
│   ├── vfs.js          # In-memory files of a task
│   ├── awk.js          # awk interpreter
│   ├── sed.js          # sed (addresses, s y d p q = a i c w, -i)
│   ├── printf.js       # C printf formatting (exact rounding like glibc)
│   ├── regex.js        # POSIX BRE/ERE -> JavaScript RegExp
│   ├── utils.js        # getopt, streams, helpers
│   ├── hints.js        # Progressive hints derived from solutions
│   ├── terminal.js     # History, Tab completion, keyboard shortcuts
│   ├── feedback.js     # Output vs expected: line diff + tips
│   ├── dataGenerators.js    # Randomized practice datasets
│   ├── problemGenerators.js # Templates + pipeline recipe composer
│   └── extraProblems.js     # Practice templates for awk, files and newer commands
├── scripts/
│   ├── testCommands.mjs     # Unit tests for command implementations
│   ├── testLearning.mjs     # Hints and mismatch feedback
│   ├── testGenerators.mjs   # Stress tests for problem generators
│   ├── generateLevels.mjs   # Builds master/power/files/realworld (expected output and files computed by the engine)
│   ├── levels/              # Task definitions of the Power Tools and Files & Shell levels
│   ├── verifyLevels.mjs     # Every challenge: unique id + solution reproduces expected
│   ├── diffTest.mjs         # Engine vs real bash/GNU tools
│   └── diffCases.mjs        # Edge cases for the differential test
└── data/
    ├── beginner.json
    ├── intermediate.json
    ├── advanced.json
    ├── expert.json
    ├── master.json        # awk, advanced sed, nl, paste, power flags
    ├── power.json         # awk as a language, grep context, sort -h/-V, column, fold, seq
    ├── files.json         # files, wildcards, redirections, comm/join/paste, sed -i, && ||
    ├── realworld.json     # realistic log/CSV/passwd scenarios
    └── sandbox.json       # Free practice
```

## Difficulty Levels

- **Beginner** - Basic commands: `grep`, `head`, `tail`, `sort`, `wc`
- **Intermediate** - Flags and options: `grep -i`, `uniq -c`, `cut -d`, `sort -n`
- **Advanced** - Pipes and transformations: `tr`, `sed`, `rev`, `tac`
- **Expert** - Complex multi-command pipelines
- **Master** - `awk`, advanced `sed` (line addressing, capture groups, `&`), `nl`, `paste`, `tail -n +N`, `grep -w/-E`
- **Power Tools** - awk arrays/printf/if/functions, `grep -A/-B/-C`, `sort -h/-V`, `column`, `fold`, `seq`, `sed y/i/c`
- **Files & Shell** - Files as arguments, `*.log`, `>` `>>` `<` `2>/dev/null`, `tee`, `comm`, `join`, `paste`, `grep -r/-l`, `sed -i`, `&&` `||`
- **Real World** - Realistic scenarios: web access logs, SSH auth logs, `/etc/passwd`, sales CSV, git history

## Development

```bash
npm test                  # command tests + generator stress test + challenge data check
npm run test:diff         # compare the engine with real bash (needs bash; Git Bash works on Windows)
npm run verify-levels     # check challenge data against the engine
npm run generate-levels   # regenerate master/power/files/realworld data
```

GitHub Actions runs `npm test` and the differential test on every push. `netlify.toml` makes
Netlify run `npm test` as the build step, so a commit that breaks the engine or the data is not deployed.

## Progress

Your progress is automatically saved including:
- Completed challenges (by stable id, so reordering challenges keeps progress), marked as assisted when solved after revealing the solution
- Command history and edited sandbox texts
- Practice mode statistics and best streak
- Selected command and difficulty preferences

Click "Reset Progress" on the landing page twice to start fresh.
