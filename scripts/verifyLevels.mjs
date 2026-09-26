// Verifies challenge data files: every challenge needs a unique stable `id`
// and a `solution` that runs without errors, reproduces `expected` exactly
// and leaves `expectedFiles` (if any) with the expected content.
// Run: node scripts/verifyLevels.mjs [--fix]   (--fix rewrites `expected`)

import { readFileSync, writeFileSync } from 'fs';
import { runPipeline } from '../js/commands.js';
import { VirtualFS } from '../js/vfs.js';
import { ALL_LEVELS } from '../js/state.js';

const fix = process.argv.includes('--fix');

let total = 0, ok = 0, bad = 0, fixed = 0;
const ids = new Set();

function problem(msg) {
    bad++;
    console.log(msg);
}

for (const level of ALL_LEVELS) {
    const data = JSON.parse(readFileSync(`data/${level}.json`, 'utf8'));
    let changed = false;
    data.forEach((ch, i) => {
        total++;
        const where = `[${level} #${i + 1}]`;
        if (!ch.id) return problem(`${where} missing id`);
        if (ids.has(ch.id)) return problem(`${where} duplicate id ${ch.id}`);
        ids.add(ch.id);
        if (ch.expected === null && !ch.expectedFiles) { ok++; return; } // sandbox
        if (!ch.solution) return problem(`${where} ${ch.id}: missing solution`);

        const fs = new VirtualFS(ch.files || {});
        const r = runPipeline(ch.text, ch.solution, { fs });
        if (r.stderr.length) {
            return problem(`${where} ${ch.id}: ERROR running "${ch.solution}": ${r.stderr.join(' / ')}`);
        }
        for (const [name, content] of Object.entries(ch.expectedFiles || {})) {
            if (!fs.isFile(name) || fs.read(name) !== content) {
                return problem(`${where} ${ch.id}: file ${name} differs\n  expected: ${JSON.stringify(content)}\n  actual:   ${JSON.stringify(fs.isFile(name) ? fs.read(name) : null)}`);
            }
        }
        if (ch.expected === null || r.output === ch.expected) {
            ok++;
            return;
        }
        problem(`${where} ${ch.id}: MISMATCH\n  solution: ${ch.solution}\n  expected: ${JSON.stringify(ch.expected)}\n  actual:   ${JSON.stringify(r.output)}`);
        if (fix) {
            ch.expected = r.output;
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
