// Differential test: runs challenge solutions, generated practice problems and
// edge cases both through the trainer's engine and through real bash with GNU
// coreutils/grep/sed/gawk (LC_ALL=C), and reports every difference in
// stdout, success/failure and the files left behind.
//
// Run: node scripts/diffTest.mjs [--generated N] [--verbose]
// Needs bash on PATH (Linux/macOS/WSL) or Git for Windows. Set BASH=/path/to/bash
// to override.

import { spawnSync } from 'child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, mkdirSync, statSync } from 'fs';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import { runPipeline } from '../js/commands.js';
import { stagesOf } from '../js/shell.js';
import { VirtualFS } from '../js/vfs.js';
import { LEVELS } from '../js/state.js';
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
const root = mkdtempSync(join(tmpdir(), 'term-diff-'));
const env = { ...process.env, LC_ALL: 'C' };

function writeTree(dir, files) {
    for (const [path, text] of Object.entries(files || {})) {
        const full = join(dir, path);
        mkdirSync(dirname(full), { recursive: true });
        writeFileSync(full, text);
    }
}

function readTree(dir, prefix = '') {
    const out = {};
    for (const name of readdirSync(dir).sort()) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) Object.assign(out, readTree(full, prefix + name + '/'));
        else out[prefix + name] = readFileSync(full, 'utf8');
    }
    return out;
}

let caseNo = 0;
function runReal(text, cmd, files) {
    // A fresh, otherwise empty directory per case, so globs only see the task's files
    const cwd = join(root, String(++caseNo));
    mkdirSync(cwd);
    writeTree(cwd, files);
    const input = text === '' ? '' : text.endsWith('\n') ? text : text + '\n';
    const r = spawnSync(bash, ['-c', cmd], { input, encoding: 'utf8', cwd, env });
    if (r.error) throw r.error;
    return { stdout: r.stdout, stderr: r.stderr.trim(), status: r.status, files: readTree(cwd) };
}

const available = new Map();
function hasCommand(name) {
    if (!available.has(name)) {
        const r = spawnSync(bash, ['-c', `command -v ${name}`], { encoding: 'utf8', env });
        available.set(name, r.status === 0);
    }
    return available.get(name);
}

// Collect cases: { label, text, cmd, expected, files }
const cases = [];
for (const level of LEVELS) {
    const data = JSON.parse(readFileSync(new URL(`../data/${level}.json`, import.meta.url), 'utf8'));
    data.forEach((ch, i) => {
        if (ch.solution) cases.push({ label: `${level} #${i + 1}`, text: ch.text, cmd: ch.solution, expected: ch.expected, files: ch.files });
    });
}
const allCmds = new Set(Object.keys(commandDefs));
for (let i = 0; i < generatedCount; i++) {
    const p = generateProblem(allCmds, 'mixed');
    cases.push({ label: `generated: ${p.solution}`, text: p.text, cmd: p.solution, files: p.files });
}
diffCases.forEach(([text, cmd, files]) => cases.push({ label: `edge: ${cmd}`, text, cmd, files }));

let same = 0, differ = 0, bothFail = 0, unsupported = 0, skipped = 0, expectedWrong = 0;
const seen = new Set();
const show = (s) => JSON.stringify(s).slice(0, 300);
const sortedEntries = (obj) => JSON.stringify(Object.entries(obj).sort());

for (const { label, text, cmd, expected, files } of cases) {
    const key = text + '\u0000' + cmd + '\u0000' + JSON.stringify(files || {});
    if (seen.has(key)) continue;
    seen.add(key);

    let names;
    try {
        names = stagesOf(cmd).map(s => s.words[0]);
    } catch {
        names = [];
    }
    if (names.some(n => !hasCommand(n))) {
        skipped++;
        continue;
    }

    const fs = new VirtualFS(files || {});
    const app = runPipeline(text, cmd, { fs });
    const appFailed = app.status !== 0 && app.stderr.length > 0;
    const real = runReal(text, cmd, files);
    const realOut = real.stdout.endsWith('\n') ? real.stdout.slice(0, -1) : real.stdout;
    const realFailed = real.status !== 0 && real.stderr !== '';

    if (app.stderr.some(l => /not supported in this trainer/.test(l))) {
        unsupported++;
        if (verbose) console.log(`unsupported  ${label}: ${app.stderr.join(' / ')}`);
        continue;
    }

    const problems = [];
    if (app.output !== realOut) problems.push(`stdout\n   app : ${show(app.output)}\n   real: ${show(realOut)}`);
    if (appFailed !== realFailed) {
        problems.push(`failure\n   app : ${appFailed ? 'failed: ' + app.stderr.join(' / ') : 'ok'}\n   real: ${realFailed ? 'failed: ' + real.stderr : 'ok'}`);
    }
    if ((app.status === 0) !== (real.status === 0)) problems.push(`exit status\n   app : ${app.status}\n   real: ${real.status}`);
    if (sortedEntries(fs.toObject()) !== sortedEntries(real.files)) {
        problems.push(`files\n   app : ${sortedEntries(fs.toObject()).slice(0, 300)}\n   real: ${sortedEntries(real.files).slice(0, 300)}`);
    }

    if (problems.length) {
        differ++;
        console.log(`DIFF  ${label}\n   $ ${cmd}\n   ${problems.join('\n   ')}`);
        continue;
    }
    if (appFailed) {
        bothFail++;
        if (verbose) console.log(`both fail  ${label}\n   app : ${app.stderr.join(' / ')}\n   real: ${real.stderr}`);
        continue;
    }
    same++;
    if (expected !== undefined && expected !== null && expected !== realOut) {
        expectedWrong++;
        console.log(`EXPECTED != REAL  ${label}\n   $ ${cmd}\n   data: ${show(expected)}\n   real: ${show(realOut)}`);
    }
}

rmSync(root, { recursive: true, force: true });

console.log(`\n${same} identical, ${bothFail} fail in both, ${unsupported} unsupported by the trainer, ${skipped} skipped (command missing), ${differ} DIFFERENT, ${expectedWrong} challenge expected-outputs differ from real bash`);
process.exit(differ || expectedWrong ? 1 : 0);
