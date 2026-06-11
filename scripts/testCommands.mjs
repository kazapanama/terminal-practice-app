// Smoke tests for command implementations.
// Run: node scripts/testCommands.mjs

import { executePipeline } from '../js/commands.js';

let pass = 0, fail = 0;

function t(name, input, cmdLine, expected) {
    let actual;
    try {
        actual = executePipeline(input, cmdLine);
    } catch (e) {
        actual = `<ERROR: ${e.message}>`;
    }
    if (actual === expected) {
        pass++;
    } else {
        fail++;
        console.log(`FAIL: ${name}`);
        console.log(`  cmd:      ${cmdLine}`);
        console.log(`  expected: ${JSON.stringify(expected)}`);
        console.log(`  actual:   ${JSON.stringify(actual)}`);
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
t('sed backreference', 'john smith', "sed 's/(\\w+) (\\w+)/\\2 \\1/'", 'smith john');
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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
