// Differential test: runs challenge solutions, generated practice problems and
// edge cases both through the trainer's engine and through real bash with GNU
// coreutils/grep/sed/gawk (LC_ALL=C), and reports every difference.
//
// Run: node scripts/diffTest.mjs [--generated N] [--verbose]
// Needs bash on PATH (Linux/macOS/WSL) or Git for Windows. Set BASH=/path/to/bash
// to override.

import { spawnSync } from 'child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { runPipeline } from '../js/commands.js';
import { parsePipeline } from '../js/utils.js';
import { generateProblem, commandDefs } from '../js/problemGenerators.js';
import { diffCases } from './diffCases.mjs';

const argv = process.argv.slice(2);
const verbose = argv.includes('--verbose');
const genIdx = argv.indexOf('--generated');
const generatedCount = genIdx >= 0 ? Number(argv[genIdx + 1]) : 300;

function findBash() {
    if (process.env.BASH && existsSync(process.env.BASH)) return process.env.BASH;
    for (const p of ['C:/Program Files/Git/bin/bash.exe', 'C:/Program Files/Git/usr/bin/bash.exe']) {
        if (existsSync(p)) return p;
    }
    return 'bash';
}

const bash = findBash();
// An empty working directory, so unquoted wildcards can't expand to files.
const cwd = mkdtempSync(join(tmpdir(), 'term-diff-'));
const env = { ...process.env, LC_ALL: 'C' };

function runReal(text, cmd) {
    const input = text === '' ? '' : text + '\n';
    const r = spawnSync(bash, ['-c', cmd], { input, encoding: 'utf8', cwd, env });
    if (r.error) throw r.error;
    return { stdout: r.stdout, stderr: r.stderr.trim(), status: r.status };
}

const available = new Map();
function hasCommand(name) {
    if (!available.has(name)) {
        const r = spawnSync(bash, ['-c', `command -v ${name}`], { encoding: 'utf8', env });
        available.set(name, r.status === 0);
    }
    return available.get(name);
}

// Collect cases: [label, text, cmd]
const cases = [];
const levels = ['beginner', 'intermediate', 'advanced', 'expert', 'master', 'realworld'];
for (const level of levels) {
    const data = JSON.parse(readFileSync(new URL(`../data/${level}.json`, import.meta.url), 'utf8'));
    data.forEach((ch, i) => {
        if (ch.solution) cases.push([`${level} #${i + 1}`, ch.text, ch.solution, ch.expected]);
    });
}
const allCmds = new Set(Object.keys(commandDefs));
for (let i = 0; i < generatedCount; i++) {
    const p = generateProblem(allCmds, 'mixed');
    cases.push([`generated: ${p.solution}`, p.text, p.solution]);
}
diffCases.forEach(([text, cmd]) => cases.push([`edge: ${cmd}`, text, cmd]));

let same = 0, differ = 0, bothFail = 0, unsupported = 0, skipped = 0, expectedWrong = 0;
const seen = new Set();

for (const [label, text, cmd, expected] of cases) {
    const key = text + '\u0000' + cmd;
    if (seen.has(key)) continue;
    seen.add(key);

    let names;
    try {
        names = parsePipeline(cmd).map(s => s.words[0]);
    } catch {
        names = [];
    }
    if (names.some(n => !hasCommand(n))) {
        skipped++;
        continue;
    }

    let app, appError = null;
    try {
        app = runPipeline(text, cmd).output;
    } catch (e) {
        appError = e.message;
    }
    const real = runReal(text, cmd);
    const realOut = real.stdout.endsWith('\n') ? real.stdout.slice(0, -1) : real.stdout;
    const realFailed = real.status !== 0 && real.stderr !== '';

    if (appError !== null) {
        if (realFailed) { bothFail++; if (verbose) console.log(`both fail  ${label}\n   app : ${appError}\n   real: ${real.stderr}`); continue; }
        if (/not supported in this trainer/.test(appError)) {
            unsupported++;
            if (verbose) console.log(`unsupported  ${label}: ${appError}`);
            continue;
        }
        differ++;
        console.log(`DIFF  ${label}\n   $ ${cmd}\n   app : ERROR ${appError}\n   real: ${JSON.stringify(realOut).slice(0, 300)}`);
        continue;
    }
    if (realFailed && realOut === '') {
        differ++;
        console.log(`DIFF  ${label}\n   $ ${cmd}\n   app : ${JSON.stringify(app).slice(0, 300)}\n   real: ERROR ${real.stderr}`);
        continue;
    }
    if (app === realOut) {
        same++;
        if (expected !== undefined && expected !== null && expected !== realOut) {
            expectedWrong++;
            console.log(`EXPECTED != REAL  ${label}\n   $ ${cmd}\n   data: ${JSON.stringify(expected).slice(0, 300)}\n   real: ${JSON.stringify(realOut).slice(0, 300)}`);
        }
    } else {
        differ++;
        console.log(`DIFF  ${label}\n   $ ${cmd}\n   text: ${JSON.stringify(text).slice(0, 200)}\n   app : ${JSON.stringify(app).slice(0, 300)}\n   real: ${JSON.stringify(realOut).slice(0, 300)}`);
    }
}

rmSync(cwd, { recursive: true, force: true });

console.log(`\n${same} identical, ${bothFail} fail in both, ${unsupported} unsupported by the trainer, ${skipped} skipped (command missing), ${differ} DIFFERENT, ${expectedWrong} challenge expected-outputs differ from real bash`);
process.exit(differ || expectedWrong ? 1 : 0);
