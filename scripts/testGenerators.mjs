// Stress-test the practice problem generators.
// Run: node scripts/testGenerators.mjs

import { generateProblem, problemGenerators, pipeRecipes, commandDefs } from '../js/problemGenerators.js';
import { executePipeline } from '../js/commands.js';

let fail = 0;

function check(label, problem) {
    try {
        const out = executePipeline(problem.text, problem.solution);
        if (!out.trim()) {
            console.log(`EMPTY OUTPUT [${label}]: ${problem.solution}`);
            console.log(`  text: ${JSON.stringify(problem.text)}`);
            fail++;
        }
    } catch (e) {
        console.log(`ERROR [${label}]: ${problem.solution} -> ${e.message}`);
        console.log(`  text: ${JSON.stringify(problem.text)}`);
        fail++;
    }
}

// 1. Every single-command template, many times
for (const cmd of Object.keys(problemGenerators)) {
    for (let i = 0; i < 300; i++) {
        check(`template:${cmd}`, problemGenerators[cmd]());
    }
}

// 2. Every recipe, many times
pipeRecipes.forEach((r, idx) => {
    for (let i = 0; i < 300; i++) {
        check(`recipe#${idx} (${r.cmds.join('+')})`, r.build());
    }
});

// 3. generateProblem across difficulties and command subsets
const allCmds = Object.keys(commandDefs);
const subsets = [
    allCmds,
    ['grep', 'head', 'tail', 'sort', 'wc'],
    ['awk'],
    ['sed', 'grep'],
    ['nl', 'paste'],
    ['cut', 'sort', 'uniq'],
    ['rev', 'tac', 'cat']
];
for (const difficulty of ['single', 'short', 'long', 'mixed']) {
    for (const subset of subsets) {
        for (let i = 0; i < 100; i++) {
            const p = generateProblem(new Set(subset), difficulty);
            if (!p || !p.expected || !p.expected.trim()) {
                console.log(`BAD generateProblem(${subset.join(',')}, ${difficulty})`, p && p.solution);
                fail++;
            }
            if (p && !p.hint) {
                console.log(`MISSING HINT: ${p.solution}`);
                fail++;
            }
        }
    }
}

// 4. Variety check: how many distinct solutions does mixed mode produce?
const seen = new Set();
for (let i = 0; i < 2000; i++) {
    const p = generateProblem(new Set(allCmds), 'mixed');
    seen.add(p.solution);
}
console.log(`Distinct solutions over 2000 mixed generations: ${seen.size}`);

console.log(fail ? `\n${fail} failures` : '\nAll generator tests passed');
process.exit(fail ? 1 : 0);
