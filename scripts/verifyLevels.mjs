// Verifies challenge data files: extracts the solution command from each
// challenge hint (when possible) and checks it reproduces `expected`.
// Run: node scripts/verifyLevels.mjs [--fix]

import { readFileSync, writeFileSync } from 'fs';
import { executePipeline, commands } from '../js/commands.js';

const fix = process.argv.includes('--fix');
const levels = ['beginner', 'intermediate', 'advanced', 'expert', 'master', 'realworld'];
const known = new Set(Object.keys(commands));

function extractSolution(hint) {
    if (!hint) return null;
    let h = hint.trim();
    for (const prefix of ['Chain: ', 'Use: ', 'Try: ', 'Use ', 'Try ']) {
        if (h.startsWith(prefix)) { h = h.slice(prefix.length); break; }
    }
    const firstWord = h.split(/[\s|]/)[0];
    if (!known.has(firstWord)) return null;
    // Reject hints that are prose, e.g. "sort the lines then ..."
    if (/\b(then|the|each|with|flag|flags|to get)\b/.test(h) && !h.includes('|')) return null;
    return h
        .replace(/\s+\(.*\)$/, '')   // strip trailing "(explanations)"
        .replace(/\s+- .*$/, '');    // strip trailing "- explanations"
}

let total = 0, checked = 0, ok = 0, bad = 0, fixed = 0;

for (const level of levels) {
    let data;
    try {
        data = JSON.parse(readFileSync(`data/${level}.json`, 'utf8'));
    } catch {
        continue;
    }
    let changed = false;
    data.forEach((ch, i) => {
        total++;
        if (ch.expected === null) return; // sandbox
        const sol = extractSolution(ch.hint);
        if (!sol) return;
        checked++;
        let result;
        try {
            result = executePipeline(ch.text, sol);
        } catch (e) {
            bad++;
            console.log(`[${level} #${i + 1}] ERROR running "${sol}": ${e.message}`);
            return;
        }
        if (result.trim() === ch.expected.trim()) {
            ok++;
        } else {
            bad++;
            console.log(`[${level} #${i + 1}] MISMATCH`);
            console.log(`  desc:     ${ch.description}`);
            console.log(`  solution: ${sol}`);
            console.log(`  expected: ${JSON.stringify(ch.expected)}`);
            console.log(`  actual:   ${JSON.stringify(result)}`);
            if (fix) {
                ch.expected = result;
                changed = true;
                fixed++;
            }
        }
    });
    if (changed) {
        writeFileSync(`data/${level}.json`, JSON.stringify(data, null, 4) + '\n');
        console.log(`-> rewrote data/${level}.json`);
    }
}

console.log(`\nTotal: ${total}, with extractable solutions: ${checked}, ok: ${ok}, mismatched: ${bad}${fix ? `, fixed: ${fixed}` : ''}`);
