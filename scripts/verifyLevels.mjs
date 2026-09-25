// Verifies challenge data files: every challenge needs a unique stable `id`
// and a `solution` that reproduces `expected` exactly.
// Run: node scripts/verifyLevels.mjs [--fix]   (--fix rewrites `expected`)

import { readFileSync, writeFileSync } from 'fs';
import { executePipeline } from '../js/commands.js';

const fix = process.argv.includes('--fix');
const levels = ['beginner', 'intermediate', 'advanced', 'expert', 'master', 'realworld', 'sandbox'];

let total = 0, ok = 0, bad = 0, fixed = 0;
const ids = new Set();

function problem(msg) {
    bad++;
    console.log(msg);
}

for (const level of levels) {
    const data = JSON.parse(readFileSync(`data/${level}.json`, 'utf8'));
    let changed = false;
    data.forEach((ch, i) => {
        total++;
        const where = `[${level} #${i + 1}]`;
        if (!ch.id) return problem(`${where} missing id`);
        if (ids.has(ch.id)) return problem(`${where} duplicate id ${ch.id}`);
        ids.add(ch.id);
        if (ch.expected === null) { ok++; return; } // sandbox
        if (!ch.solution) return problem(`${where} ${ch.id}: missing solution`);

        let result;
        try {
            result = executePipeline(ch.text, ch.solution);
        } catch (e) {
            return problem(`${where} ${ch.id}: ERROR running "${ch.solution}": ${e.message}`);
        }
        if (result === ch.expected) {
            ok++;
            return;
        }
        problem(`${where} ${ch.id}: MISMATCH\n  solution: ${ch.solution}\n  expected: ${JSON.stringify(ch.expected)}\n  actual:   ${JSON.stringify(result)}`);
        if (fix) {
            ch.expected = result;
            changed = true;
            fixed++;
        }
    });
    if (changed) {
        writeFileSync(`data/${level}.json`, JSON.stringify(data, null, 4) + '\n');
        console.log(`-> rewrote data/${level}.json`);
    }
}

console.log(`\nTotal: ${total}, ok: ${ok}, problems: ${bad}${fix ? `, fixed: ${fixed}` : ''}`);
process.exit(bad && !fix ? 1 : 0);
