// "Files & Shell" level: tasks with files. Commands take file names,
// wildcards expand to matching files, output can be redirected into files,
// and several commands can be chained with ; && ||.
// `checkFiles` lists files whose final content is part of the answer.

const APP_LOG = '10:00 INFO start\n10:01 ERROR db timeout\n10:02 INFO retry\n10:03 ERROR disk full\n10:04 INFO done\n';
const WEB_LOG = '10:00 GET / 200\n10:01 GET /api 500\n10:02 POST /login 200\n';
const DB_LOG = '10:00 INFO vacuum\n10:05 ERROR lock wait\n';

const LOGS = { 'app.log': APP_LOG, 'web.log': WEB_LOG, 'db.log': DB_LOG, 'notes.txt': 'rotate logs weekly\n' };

export const files = [
    {
        id: 'files-01',
        text: '',
        files: { 'notes.txt': 'buy milk\ncall bob\nfix the printer\n', 'todo.txt': 'deploy\n' },
        description: 'Show the contents of the file notes.txt. (Files of a task are listed in the Input panel; commands take file names as arguments.)',
        solution: 'cat notes.txt',
        hint: 'Use: cat notes.txt - give the file name as an argument'
    },
    {
        id: 'files-02',
        text: '',
        files: LOGS,
        description: 'List the files in the current directory.',
        solution: 'ls',
        hint: 'Use: ls - when the output is not a terminal, ls prints one name per line, sorted'
    },
    {
        id: 'files-03',
        text: '',
        files: LOGS,
        description: 'Count the lines of app.log. (With a file argument wc also prints the file name.)',
        solution: 'wc -l app.log',
        hint: 'Use: wc -l app.log - prints "5 app.log"; wc -l < app.log would print only the number'
    },
    {
        id: 'files-04',
        text: '',
        files: LOGS,
        description: 'Count the lines of app.log WITHOUT the file name in the output — feed the file to wc on standard input.',
        solution: 'wc -l < app.log',
        hint: 'Use: wc -l < app.log - "<" makes the file the standard input, so wc does not know its name'
    },
    {
        id: 'files-05',
        text: '',
        files: LOGS,
        description: 'Count the lines of every .log file at once (wc also prints a total).',
        solution: 'wc -l *.log',
        hint: 'Use: wc -l *.log - the shell expands *.log to all matching file names, in sorted order'
    },
    {
        id: 'files-06',
        text: '',
        files: LOGS,
        description: 'For every .log file, count its ERROR lines (output "file:count").',
        solution: 'grep -c ERROR *.log',
        hint: 'Use: grep -c ERROR *.log - with several files grep prefixes results with the file name'
    },
    {
        id: 'files-07',
        text: '',
        files: LOGS,
        description: 'Print only the names of the .log files that contain ERROR.',
        solution: 'grep -l ERROR *.log',
        hint: 'Use: grep -l ERROR *.log - -l lists matching files instead of lines'
    },
    {
        id: 'files-08',
        text: '',
        files: LOGS,
        description: 'Show all ERROR lines of all .log files, but without the file names in front.',
        solution: 'grep -h ERROR *.log',
        hint: 'Use: grep -h ERROR *.log - -h hides file names (-H forces them)'
    },
    {
        id: 'files-09',
        text: '',
        files: LOGS,
        description: 'Show the first line of app.log and of web.log (head prints a "==> name <==" header per file).',
        solution: 'head -n 1 app.log web.log',
        hint: 'Use: head -n 1 app.log web.log - several files get headers; -q would hide them'
    },
    {
        id: 'files-10',
        text: '',
        files: { 'part1.txt': 'Chapter 1\nIt was a dark night.\n', 'part2.txt': 'Chapter 2\nThe sun rose.\n' },
        checkFiles: ['book.txt'],
        description: 'Combine part1.txt and part2.txt (in this order) into a new file book.txt.',
        solution: 'cat part1.txt part2.txt > book.txt',
        hint: 'Use: cat part1.txt part2.txt > book.txt - cat concatenates, ">" writes the output into a file instead of the screen'
    },
    {
        id: 'files-11',
        text: '',
        files: { 'names.txt': 'mike\nalice\nzoe\nbob\n' },
        checkFiles: ['sorted.txt'],
        description: 'Save names.txt sorted alphabetically into sorted.txt.',
        solution: 'sort names.txt > sorted.txt',
        hint: 'Use: sort names.txt > sorted.txt - note: "sort names.txt > names.txt" would empty the file, because > truncates it before sort reads it'
    },
    {
        id: 'files-12',
        text: '',
        files: { 'app.log': APP_LOG, 'errors.txt': '09:58 ERROR old failure\n' },
        checkFiles: ['errors.txt'],
        description: 'Add (append) the ERROR lines of app.log to the end of errors.txt, keeping what is already there.',
        solution: 'grep ERROR app.log >> errors.txt',
        hint: 'Use: grep ERROR app.log >> errors.txt - ">>" appends, ">" would overwrite'
    },
    {
        id: 'files-13',
        text: '',
        files: { 'words.txt': 'hello\nworld\n' },
        description: 'tr cannot read files by name — make it uppercase the contents of words.txt anyway.',
        solution: "tr 'a-z' 'A-Z' < words.txt",
        hint: "Use: tr 'a-z' 'A-Z' < words.txt - tr only reads standard input, so redirect the file into it (cat words.txt | tr ... works too)"
    },
    {
        id: 'files-14',
        text: '',
        files: { 'monday.txt': 'alice\nbob\ncarol\ndave\n', 'tuesday.txt': 'bob\ndave\neve\n' },
        description: 'Both files are sorted lists of users who logged in that day. Print the users who logged in on BOTH days.',
        solution: 'comm -12 monday.txt tuesday.txt',
        hint: 'Use: comm -12 monday.txt tuesday.txt - comm prints 3 columns (only in 1, only in 2, in both); -12 hides the first two'
    },
    {
        id: 'files-15',
        text: '',
        files: { 'tasks.txt': 'backup\ndeploy\nreview\ntest\nupdate\n', 'done.txt': 'deploy\ntest\n' },
        description: 'Both files are sorted. Print the tasks from tasks.txt that are not in done.txt yet.',
        solution: 'comm -23 tasks.txt done.txt',
        hint: 'Use: comm -23 tasks.txt done.txt - keeps only column 1: lines that appear only in the first file'
    },
    {
        id: 'files-16',
        text: '',
        files: { 'users.txt': '1 alice\n2 bob\n3 carol\n', 'depts.txt': '1 engineering\n2 sales\n4 support\n' },
        description: 'Both files start with a user id and are sorted by it. Join them on the id: print "id name department" for ids present in both.',
        solution: 'join users.txt depts.txt',
        hint: 'Use: join users.txt depts.txt - join matches lines by their first field (like a database JOIN)'
    },
    {
        id: 'files-17',
        text: '',
        files: { 'names.txt': 'alice\nbob\ncarol\n', 'ages.txt': '30\n25\n41\n' },
        description: 'Put names.txt and ages.txt side by side, separated by a comma (e.g. "alice,30").',
        solution: "paste -d',' names.txt ages.txt",
        hint: "Use: paste -d',' names.txt ages.txt - paste joins the Nth lines of the files; -d sets the separator (default TAB)"
    },
    {
        id: 'files-18',
        text: '',
        files: {
            'src/main.py': 'import app\n# TODO: parse args\napp.run()\n',
            'src/util/io.py': 'def read():\n    pass  # TODO: handle errors\n',
            'src/util/math.py': 'def add(a, b):\n    return a + b\n',
            'README.md': 'TODO: write docs\n'
        },
        description: 'Find all TODO lines in every file under the src directory (recursively), as "file:line", sorted by file name.',
        solution: 'grep -r TODO src | sort',
        hint: 'Use: grep -r TODO src | sort - -r searches all files below a directory; the order grep visits them in is not fixed, so sort'
    },
    {
        id: 'files-19',
        text: '',
        files: { 'config.ini': '[db]\nhost=localhost\nport=5432\n[cache]\nhost=localhost\n' },
        checkFiles: ['config.ini'],
        description: 'Edit config.ini in place: replace every "localhost" with "db.internal".',
        solution: "sed -i 's/localhost/db.internal/' config.ini",
        hint: "Use: sed -i 's/localhost/db.internal/' config.ini - -i writes the result back into the file (-i.bak would keep a backup)"
    },
    {
        id: 'files-20',
        text: '',
        files: { 'app.log': APP_LOG },
        description: 'Print "problems found" if app.log contains ERROR, otherwise "all clear" — without printing the matching lines.',
        solution: 'grep -q ERROR app.log && echo "problems found" || echo "all clear"',
        hint: 'Use: grep -q ERROR app.log && echo "problems found" || echo "all clear" - -q only sets the exit status: 0 = found; && runs on success, || on failure'
    },
    {
        id: 'files-21',
        text: '',
        files: { 'app.log': APP_LOG },
        description: 'Search ERROR in app.log and old.log. old.log does not exist — hide the error message about it.',
        solution: 'grep ERROR app.log old.log 2>/dev/null',
        hint: 'Use: grep ERROR app.log old.log 2>/dev/null - "2>" redirects error messages (stderr); /dev/null throws them away'
    },
    {
        id: 'files-22',
        text: '',
        files: { 'visits.txt': 'kyiv\nlviv\nkyiv\nodesa\nkyiv\nlviv\n' },
        checkFiles: ['report.txt'],
        description: 'Save the visit counts per city, most visited first, into report.txt, AND show the top line on the screen — in one command line.',
        solution: 'sort visits.txt | uniq -c | sort -rn > report.txt; head -1 report.txt',
        hint: 'Use: sort visits.txt | uniq -c | sort -rn > report.txt; head -1 report.txt - ";" runs commands one after another'
    },
    {
        id: 'files-23',
        text: '',
        files: { 'names.txt': 'mike\nalice\nzoe\nbob\n' },
        checkFiles: ['sorted.txt'],
        description: 'Sort names.txt into sorted.txt and at the same time show the first 2 sorted names on the screen.',
        solution: 'sort names.txt | tee sorted.txt | head -2',
        hint: 'Use: sort names.txt | tee sorted.txt | head -2 - tee writes its input to a file AND passes it on'
    },
    {
        id: 'files-24',
        text: '',
        files: {
            'logs/2024-01.log': 'a\nb\n', 'logs/2024-02.log': 'c\n', 'logs/2024-03.log': 'd\ne\nf\n', 'logs/README': 'monthly logs\n'
        },
        description: 'How many .log files are in the logs directory?',
        solution: 'ls logs/*.log | wc -l',
        hint: 'Use: ls logs/*.log | wc -l - wildcards work in paths too'
    },
    {
        id: 'files-25',
        text: '',
        files: {
            'q1.csv': 'id,amount\n1,100\n2,250\n',
            'q2.csv': 'id,amount\n3,75\n4,300\n5,20\n'
        },
        description: 'Both CSV files have a header line. Sum the amounts (2nd column) of all data rows in all .csv files.',
        solution: "tail -q -n +2 *.csv | awk -F',' '{s += $2} END {print s}'",
        hint: "Use: tail -q -n +2 *.csv | awk -F',' '{s += $2} END {print s}' - tail -n +2 skips each header, -q hides the file headers"
    },
    {
        id: 'files-26',
        text: '',
        files: LOGS,
        description: 'Print how many ERROR lines there are in total across all .log files (one number).',
        solution: 'cat *.log | grep -c ERROR',
        hint: 'Use: cat *.log | grep -c ERROR - joining the files first gives one total (grep -c ERROR *.log counts per file)'
    }
];
