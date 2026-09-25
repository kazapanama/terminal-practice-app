// Tests for hints (solution skeletons) and mismatch feedback.
// Run: node scripts/testLearning.mjs

import { readFileSync } from 'fs';
import { solutionSkeleton, hintSteps } from '../js/hints.js';
import { analyzeMismatch, diffLines } from '../js/feedback.js';

let pass = 0, fail = 0;
function eq(name, actual, expected) {
    const a = JSON.stringify(actual), e = JSON.stringify(expected);
    if (a === e) pass++;
    else { fail++; console.log(`FAIL: ${name}\n  expected: ${e}\n  actual:   ${a}`); }
}

eq('skeleton keeps flags, hides values', solutionSkeleton("grep -w active | cut -d',' -f1,4 | sort -rn"), 'grep -w … | cut -d… -f… | sort -rn');
eq('skeleton: option values', solutionSkeleton('head -n 3'), 'head -n …');
eq('skeleton: awk structure', solutionSkeleton("awk -F',' '$2 > 60 {print $1}'"), "awk -F… '$… > … {print $…}'");
eq('skeleton: sed script', solutionSkeleton("sed -n '2,4p'"), "sed -n '…,…p'");
eq('skeleton: sed s///', solutionSkeleton("sed 's|/home|/users|g'"), "sed 's|…|…|g'");

const steps = hintSteps({ solution: "awk '{print $NF}'", hint: "Use: awk '{print $NF}' - NF is the number of fields" });
eq('hint steps', steps.map(s => s.title), ['Commands', 'Shape', 'Solution']);
eq('hint explanation', steps[2].text, 'NF is the number of fields');
eq('prose hint used as shape text', hintSteps({ solution: 'head -3', hint: 'Use the head command' })[1].text, 'Use the head command');
eq('sandbox hint', hintSteps({ hint: 'Try grep' }).length, 1);

eq('diff', diffLines('a\nx\nc', 'a\nb\nc').map(d => d.type), ['same', 'extra', 'missing', 'same']);
eq('order tip', analyzeMismatch('b\na', 'a\nb', 'z').tips[0].startsWith('All the right lines'), true);
eq('empty tip', analyzeMismatch('', 'a', 'z').tips[0].startsWith('Your command printed nothing'), true);
eq('unchanged tip', analyzeMismatch('q\nw', 'a', 'q\nw').tips[0].startsWith('The output is identical'), true);
eq('extra tip', analyzeMismatch('a\nb\nc', 'a\nb', 'z').tips[0].startsWith('All expected lines are there'), true);
eq('missing tip', analyzeMismatch('a', 'a\nb', 'z').tips[0].startsWith('Every line you printed'), true);

// Every challenge solution must produce a skeleton and a full set of hints
for (const level of ['beginner', 'intermediate', 'advanced', 'expert', 'master', 'realworld']) {
    for (const ch of JSON.parse(readFileSync(`data/${level}.json`, 'utf8'))) {
        const h = hintSteps(ch);
        if (h.length === 3 && h[2].code === ch.solution && h[1].code) pass++;
        else { fail++; console.log(`FAIL: hints for ${ch.id}`); }
    }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
