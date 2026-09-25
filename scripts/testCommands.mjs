// Smoke tests for command implementations.
// Run: node scripts/testCommands.mjs

import { executePipeline, runPipeline } from '../js/commands.js';

let pass = 0, fail = 0;

// `expected` is the exact output, or a RegExp the error message must match
function t(name, input, cmdLine, expected) {
    let actual;
    try {
        actual = executePipeline(input, cmdLine);
    } catch (e) {
        actual = `<ERROR: ${e.message}>`;
    }
    const ok = expected instanceof RegExp
        ? actual.startsWith('<ERROR: ') && expected.test(actual)
        : actual === expected;
    if (ok) {
        pass++;
    } else {
        fail++;
        console.log(`FAIL: ${name}`);
        console.log(`  cmd:      ${cmdLine}`);
        console.log(`  expected: ${JSON.stringify(expected)}`);
        console.log(`  actual:   ${JSON.stringify(actual)}`);
    }
}

// Asserts that a warning (shell expansion, stray backslash...) is reported
function w(name, input, cmdLine, pattern) {
    let warnings;
    try {
        warnings = runPipeline(input, cmdLine).warnings;
    } catch (e) {
        warnings = [`<ERROR: ${e.message}>`];
    }
    if (warnings.some(x => pattern.test(x))) {
        pass++;
    } else {
        fail++;
        console.log(`FAIL: ${name}`);
        console.log(`  cmd:      ${cmdLine}`);
        console.log(`  warnings: ${JSON.stringify(warnings)}`);
    }
}

const csv = 'alice,eng,100\nbob,sales,80\ncarol,eng,120';
const logs = 'INFO start\nERROR disk full\nWARN retry\nERROR timeout';
const nums = '5\n12\n3\n40\n7';

// grep
t('grep basic', logs, 'grep ERROR', 'ERROR disk full\nERROR timeout');
t('grep -c', logs, 'grep -c ERROR', '2');
t('grep -v', logs, 'grep -v ERROR', 'INFO start\nWARN retry');
t('grep -n', logs, 'grep -n ERROR', '2:ERROR disk full\n4:ERROR timeout');
t('grep -i', 'Apple\nbanana', 'grep -i APPLE', 'Apple');
t('grep -w match', 'cat\ncatalog\nthe cat', 'grep -w cat', 'cat\nthe cat');
t('grep -E alternation', logs, "grep -E 'ERROR|WARN'", 'ERROR disk full\nWARN retry\nERROR timeout');
t('grep anchors', 'foo\nbarfoo', "grep '^foo'", 'foo');

// head / tail
t('head -2', nums, 'head -2', '5\n12');
t('head -n 2', nums, 'head -n 2', '5\n12');
t('head -c', 'abcdef', 'head -c 3', 'abc');
t('tail -2', nums, 'tail -2', '40\n7');
t('tail -n +2', nums, 'tail -n +2', '12\n3\n40\n7');

// wc
t('wc -l', nums, 'wc -l', '5');
t('wc -w', 'a b c\nd e', 'wc -w', '5');

// sort
t('sort alpha', 'b\na\nc', 'sort', 'a\nb\nc');
t('sort -n', nums, 'sort -n', '3\n5\n7\n12\n40');
t('sort -rn combined', nums, 'sort -rn', '40\n12\n7\n5\n3');
t('sort -nr combined', nums, 'sort -nr', '40\n12\n7\n5\n3');
t('sort -u', 'b\na\nb', 'sort -u', 'a\nb');
t('sort -t -k numeric', csv, "sort -t',' -k3 -n", 'bob,sales,80\nalice,eng,100\ncarol,eng,120');
t('sort -t -k reverse numeric', csv, "sort -t',' -k3 -rn", 'carol,eng,120\nalice,eng,100\nbob,sales,80');

// uniq
t('uniq', 'a\na\nb\nb\nb\nc', 'uniq', 'a\nb\nc');
t('uniq -c', 'a\na\nb', 'uniq -c', '      2 a\n      1 b');
t('uniq -d', 'a\na\nb\nc\nc', 'uniq -d', 'a\nc');
t('uniq -u', 'a\na\nb\nc\nc', 'uniq -u', 'b');
t('uniq -i', 'A\na\nb', 'uniq -i', 'A\nb');

// cut
t('cut -f1', csv, "cut -d',' -f1", 'alice\nbob\ncarol');
t('cut -f1,3', csv, "cut -d',' -f1,3", 'alice,100\nbob,80\ncarol,120');
t('cut -f2-', csv, "cut -d',' -f2-", 'eng,100\nsales,80\neng,120');
t('cut -c1-3', 'abcdef\nghijkl', 'cut -c1-3', 'abc\nghi');
t('cut passwd', 'root:x:0:0:root:/root:/bin/bash', "cut -d':' -f1,7", 'root:/bin/bash');

// tr
t('tr upper', 'abc', "tr 'a-z' 'A-Z'", 'ABC');
t('tr classes', 'abc', "tr '[:lower:]' '[:upper:]'", 'ABC');
t('tr -d digits', 'a1b2c3', "tr -d '0-9'", 'abc');
t('tr -s spaces', 'a  b   c', "tr -s ' '", 'a b c');
t('tr comma to space', 'a,b,c', "tr ',' ' '", 'a b c');

// rev / tac / cat / nl / paste
t('rev', 'abc\ndef', 'rev', 'cba\nfed');
t('tac', 'a\nb\nc', 'tac', 'c\nb\na');
t('cat -n', 'a\nb', 'cat -n', '     1\ta\n     2\tb');
t('nl', 'a\nb', 'nl', '     1\ta\n     2\tb');
t('paste -sd,', 'a\nb\nc', "paste -sd','", 'a,b,c');
t('paste -s -d', 'a\nb\nc', "paste -s -d'+'", 'a+b+c');

// sed
t('sed substitute', 'hello world\nhello there', "sed 's/hello/hi/g'", 'hi world\nhi there');
t('sed first only', 'aa aa', "sed 's/aa/X/'", 'X aa');
t('sed alt delimiter', '/home/user', "sed 's|/home|/users|'", '/users/user');
t('sed delete pattern', logs, "sed '/ERROR/d'", 'INFO start\nWARN retry');
t('sed delete line', 'a\nb\nc', "sed '2d'", 'a\nc');
t('sed delete range', 'a\nb\nc\nd', "sed '2,3d'", 'a\nd');
t('sed -n print line', 'a\nb\nc', "sed -n '2p'", 'b');
t('sed -n print range', 'a\nb\nc\nd', "sed -n '2,3p'", 'b\nc');
t('sed -n print last', 'a\nb\nc', "sed -n '$p'", 'c');
t('sed -n print match', logs, "sed -n '/ERROR/p'", 'ERROR disk full\nERROR timeout');
t('sed ampersand', 'cat', "sed 's/cat/[&]/'", '[cat]');
t('sed -E backreference', 'john smith', "sed -E 's/(\\w+) (\\w+)/\\2 \\1/'", 'smith john');
t('sed BRE groups', 'john smith', "sed 's/\\(\\w*\\) \\(\\w*\\)/\\2 \\1/'", 'smith john');
t('sed BRE: \\2 without groups', 'john smith', "sed 's/(\\w+) (\\w+)/\\2 \\1/'", /invalid reference \\2/);
t('sed address + s', 'a\na\na', "sed '2s/a/B/'", 'a\nB\na');
t('sed several commands', 'a\nb\nc', "sed -n '1p;3p'", 'a\nc');
t('sed -e twice', 'a b\nc d', "sed -e 's/ /_/' -e '1d'", 'c_d');
t('sed negated address', 'a\nb\nc', "sed '2!d'", 'b');
t('sed regex range', 'x\nstart\ny\nend\nz', "sed '/start/,/end/d'", 'x\nz');
t('sed nth occurrence', 'a a a', "sed 's/a/X/2'", 'a X a');
t('sed unsupported command', 'a', "sed 'y/a/b/'", /not supported/);
t('sed prefix', 'a\nb', "sed 's/^/- /'", '- a\n- b');

// awk
t('awk print field', csv, "awk -F',' '{print $1}'", 'alice\nbob\ncarol');
t('awk print NF', 'a b c\nd e', "awk '{print NF}'", '3\n2');
t('awk print $NF', 'a b c\nd e', "awk '{print $NF}'", 'c\ne');
t('awk whitespace fields', 'one two\nthree four', "awk '{print $2}'", 'two\nfour');
t('awk condition filter', csv, "awk -F',' '$3 > 90'", 'alice,eng,100\ncarol,eng,120');
t('awk condition print', csv, "awk -F',' '$3 > 90 {print $1}'", 'alice\ncarol');
t('awk string equality', csv, "awk -F',' '$2 == \"eng\" {print $1}'", 'alice\ncarol');
t('awk regex pattern', logs, "awk '/ERROR/ {print $2}'", 'disk\ntimeout');
t('awk sum END', csv, "awk -F',' '{sum += $3} END {print sum}'", '300');
t('awk count END', logs, "awk '/ERROR/ {n++} END {print n}'", '2');
t('awk NR prefix', 'a\nb', "awk '{print NR\": \"$0}'", '1: a\n2: b');
t('awk reorder fields', 'one two\nthree four', "awk '{print $2, $1}'", 'two one\nfour three');
t('awk concat', csv, "awk -F',' '{print $1\"=\"$3}'", 'alice=100\nbob=80\ncarol=120');
t('awk arithmetic', '2 3\n4 5', "awk '{print $1 * $2}'", '6\n20');
t('awk NR condition', 'a\nb\nc\nd', "awk 'NR > 2'", 'c\nd');
t('awk field match', csv, "awk -F',' '$1 ~ /^a/ {print $1}'", 'alice');
t('awk average', '10\n20\n30', "awk '{s += $1} END {print s/NR}'", '20');

// pipes
t('pipe freq', 'a\nb\na\na\nb', 'sort | uniq -c | sort -rn', '      3 a\n      2 b');
t('pipe top', nums, 'sort -n | head -2', '3\n5');
t('pipe grep wc', logs, 'grep ERROR | wc -l', '2');
t('pipe header skip', 'name,dept\nalice,eng\nbob,sales', "tail -n +2 | cut -d',' -f2", 'eng\nsales');

// regex dialects: BRE by default, ERE with -E
t('grep BRE: | is literal', 'a|b\na\nb', "grep 'a|b'", 'a|b');
t('grep BRE: \\| alternation', 'a\nb\nc', "grep 'a\\|b'", 'a\nb');
t('grep BRE: + is literal', 'a+\naa', "grep 'a+'", 'a+');
t('grep POSIX class', 'x1\ny', "grep '[[:digit:]]'", 'x1');
t('grep class outside brackets', 'x', "grep '[:digit:]'", /character class syntax/);
t('grep BRE interval', 'aa\na', "grep 'a\\{2\\}'", 'aa');
t('grep -x', 'apple\napple pie', 'grep -x apple', 'apple');
t('grep -F', 'a.c\nabc', "grep -F 'a.c'", 'a.c');
t('grep -o', 'a1b22', "grep -o '[0-9]*'", '1\n22');
t('grep -P digits', 'a1\nb', "grep -P '\\d'", 'a1');
t('grep -e twice', 'a\nb\nc', 'grep -e a -e c', 'a\nc');
t('grep \\d matches a literal d', 'd1\n2', "grep '\\d'", 'd1');
w('grep \\d warning', 'd1', "grep '\\d'", /stray \\ before d/);

// streams: empty input, trailing newlines
t('wc -l of nothing', 'abc', 'grep zzz | wc -l', '0');
t('wc -c counts the newline', 'abc', 'wc -c', '4');
t('wc default padding', 'a b\nc', 'wc', '      2       3       6');
t('uniq -c of nothing', 'abc', 'grep zzz | uniq -c', '');
t('awk END NR of nothing', 'abc', "grep zzz | awk 'END {print NR}'", '0');
t('tr newline to comma', 'a\nb', "tr '\\n' ','", 'a,b,');

// sort: byte order and GNU tie-breaking
t('sort C locale', 'b\nB\na', 'sort', 'B\na\nb');
t('sort -f', 'b\nB\na', 'sort -f', 'a\nB\nb');
t('sort -rn ties reversed', '1 b\n1 a\n2 c', 'sort -rn', '2 c\n1 b\n1 a');
t('sort -k2,2 -k1', 'b 1\na 1\nc 0', 'sort -k2,2 -k1', 'c 0\na 1\nb 1');
t('sort -u by key', 'a 1\nb 1\nc 2', 'sort -u -k2,2', 'a 1\nc 2');
t('sort multi-char tab', 'a', "sort -t'ab'", /multi-character tab/);

// unsupported options fail loudly instead of being ignored
t('grep -A unsupported', 'a', 'grep -A1 a', /invalid option -- 'A'/);
t('sort -h unsupported', 'a', 'sort -h', /invalid option -- 'h'/);
t('file operand', 'a', 'grep a file.txt', /No such file/);
t('awk function unsupported', 'a', "awk '{print toupper($1)}'", /toupper\(\) is not supported/);
t('awk arrays unsupported', 'a', "awk '{c[$1]++}'", /arrays/);
t('unknown command', 'a', 'ls', /command not found/);
t('redirect unsupported', 'a', 'sort > out.txt', /not supported/);
t('empty pipe stage', 'a', 'sort | | uniq', /syntax error/);

// shell behaviour
t('double-quoted $1 is expanded by the shell', 'a b', 'awk "{print $1}"', 'a b');
w('double-quoted $1 warning', 'a b', 'awk "{print $1}"', /expanded by the shell/);
t('backslash-escaped space', 'a b\nab', 'grep a\\ b', 'a b');
t("ANSI-C quoting $'\\t'", 'a\tb', "cut -d$'\\t' -f2", 'b');

// awk prints numbers with %.6g
t('awk %.6g rounds ties to even', '1234567.5', "awk '{print $1 / 3}'", '411522');
t('awk exponent', '1234567.5', "awk '{print $1 * 1}'", '1.23457e+06');

// pipeline inspector data
{
    const r = runPipeline('b\na\nb', 'sort | uniq -c');
    if (r.steps.length === 2 && r.steps[0].output === 'a\nb\nb' && r.steps[1].command === 'uniq -c') pass++;
    else { fail++; console.log('FAIL: runPipeline steps', JSON.stringify(r.steps)); }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
