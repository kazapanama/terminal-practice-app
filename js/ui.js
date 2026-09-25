// UI/DOM manipulation functions

import {
    state, LEVELS, resetTask, currentChallenge, markChallengeCompleted, challengeStatus,
    getLevelProgress, getFirstUncompletedIndex, findUncompletedIndex, recordPracticeResult,
    commandWeight, saveProgress
} from './state.js';
import { runPipeline } from './commands.js';
import { splitPipeline } from './utils.js';
import { commandDefs, generateProblem } from './problemGenerators.js';
import { analyzeMismatch, diffLines } from './feedback.js';
import { hintSteps } from './hints.js';

// DOM Elements
let elements = {};

export function initElements() {
    elements = {
        // Landing page
        landingPage: document.getElementById('landing-page'),
        appPage: document.getElementById('app-page'),
        challengesBtn: document.getElementById('start-challenges-btn'),
        practiceBtn: document.getElementById('start-practice-btn'),
        backBtn: document.getElementById('back-btn'),

        // Main app
        inputText: document.getElementById('input-text'),
        outputText: document.getElementById('output-text'),
        commandInput: document.getElementById('command-input'),
        runBtn: document.getElementById('run-btn'),
        errorMessage: document.getElementById('error-message'),
        successMessage: document.getElementById('success-message'),
        challengeDesc: document.getElementById('challenge-desc'),
        expectedOutput: document.getElementById('expected-output'),
        challengeNum: document.getElementById('challenge-num'),
        totalChallenges: document.getElementById('total-challenges'),
        lineCount: document.getElementById('line-count'),
        wordCount: document.getElementById('word-count'),
        charCount: document.getElementById('char-count'),
        outputStats: document.getElementById('output-stats'),

        // Mode specific
        challengesMode: document.getElementById('challenges-mode'),
        practiceMode: document.getElementById('practice-mode'),
        challengeCounter: document.getElementById('challenge-counter'),
        targetCommand: document.getElementById('target-command'),
        prevBtn: document.getElementById('prev-btn'),
        nextBtn: document.getElementById('next-btn'),
        hintBtn: document.getElementById('hint-btn'),
        skipBtn: document.getElementById('skip-btn'),
        hintPanel: document.getElementById('hint-panel'),
        pipelineSteps: document.getElementById('pipeline-steps'),
        warningMessage: document.getElementById('warning-message'),
        feedback: document.getElementById('feedback'),
        terminalHelp: document.getElementById('terminal-help'),
        sandboxActions: document.getElementById('sandbox-actions'),
        editInputBtn: document.getElementById('edit-input-btn'),
        restoreInputBtn: document.getElementById('restore-input-btn'),
        inputEditor: document.getElementById('input-editor'),
        challengeModeTitle: document.getElementById('challenge-mode-title'),
        commandCheckboxes: document.getElementById('command-checkboxes'),
        generateBtn: document.getElementById('generate-btn'),
        selectAllBtn: document.getElementById('select-all-btn'),
        deselectAllBtn: document.getElementById('deselect-all-btn'),
        solvedCount: document.getElementById('solved-count'),
        attemptedCount: document.getElementById('attempted-count'),
        streakCount: document.getElementById('streak-count'),
        bestStreakCount: document.getElementById('best-streak-count')
    };
    return elements;
}

export function getElements() {
    return elements;
}

// Pending "go to the next task" timer after a correct answer. Anything that
// changes the task on screen cancels it, so it can never fire twice or late.
let advanceTimer = null;
let successTimer = null;

function cancelAdvance() {
    clearTimeout(advanceTimer);
    advanceTimer = null;
}

function scheduleAdvance(fn, delay) {
    cancelAdvance();
    advanceTimer = setTimeout(() => {
        advanceTimer = null;
        fn();
    }, delay);
}

export function showLandingPage() {
    cancelAdvance();
    elements.landingPage.classList.remove('hidden');
    elements.appPage.classList.add('hidden');
    state.currentMode = null;
}

export function showAppPage(mode) {
    elements.landingPage.classList.add('hidden');
    elements.appPage.classList.remove('hidden');
    state.currentMode = mode;

    if (mode === 'challenges') {
        setupChallengesMode();
    } else {
        setupPracticeMode();
    }
}

function setupChallengesMode() {
    elements.challengesMode.classList.remove('hidden');
    elements.practiceMode.classList.add('hidden');
    elements.challengeCounter.classList.remove('hidden');
    elements.targetCommand.classList.add('hidden');
    elements.prevBtn.classList.remove('hidden');
    elements.nextBtn.classList.remove('hidden');
    elements.skipBtn.classList.add('hidden');
    elements.challengeModeTitle.textContent = 'Challenge';
    selectLevel(state.currentLevel);
}

function setupPracticeMode() {
    elements.challengesMode.classList.add('hidden');
    elements.practiceMode.classList.remove('hidden');
    elements.challengeCounter.classList.add('hidden');
    elements.targetCommand.classList.remove('hidden');
    elements.prevBtn.classList.add('hidden');
    elements.nextBtn.classList.add('hidden');
    elements.skipBtn.classList.remove('hidden');
    elements.challengeModeTitle.textContent = 'Practice';
    closeInputEditor(false);
    elements.sandboxActions.classList.add('hidden');
    initCommandCheckboxes();
    initPracticeDifficulty();
    updatePracticeStats();
    generatePracticeProblem();
}

// Switch to a level and resume at its first uncompleted challenge
export function selectLevel(level) {
    state.currentLevel = level;
    state.currentChallengeIndex = getFirstUncompletedIndex(level);
    saveProgress();
    renderChallengeGrid();
    loadChallenge();
}

export function goToChallenge(index) {
    const total = state.challenges[state.currentLevel]?.length || 0;
    if (index < 0 || index >= total) return;
    state.currentChallengeIndex = index;
    loadChallenge();
}

// Practice difficulty selector (single command / short pipes / long pipes / mixed)
export function initPracticeDifficulty() {
    document.querySelectorAll('.practice-difficulty-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.pd === state.practiceDifficulty);
        btn.setAttribute('aria-pressed', String(btn.dataset.pd === state.practiceDifficulty));
        if (!btn.dataset.bound) {
            btn.dataset.bound = '1';
            btn.addEventListener('click', () => {
                state.practiceDifficulty = btn.dataset.pd;
                saveProgress();
                document.querySelectorAll('.practice-difficulty-btn').forEach(b => {
                    b.classList.toggle('active', b === btn);
                    b.setAttribute('aria-pressed', String(b === btn));
                });
                newPracticeProblem();
            });
        }
    });
}

// Update difficulty buttons to show progress
export function updateDifficultyButtons() {
    document.querySelectorAll('.difficulty-btn').forEach(btn => {
        const level = btn.dataset.level;
        const progress = getLevelProgress(level);

        btn.classList.toggle('active', level === state.currentLevel);
        btn.setAttribute('aria-pressed', String(level === state.currentLevel));

        let progressSpan = btn.querySelector('.progress-indicator');
        if (!progressSpan) {
            progressSpan = document.createElement('span');
            progressSpan.className = 'progress-indicator';
            btn.appendChild(progressSpan);
        }

        if (progress.total > 0 && level !== 'sandbox') {
            progressSpan.textContent = ` (${progress.completed}/${progress.total})`;
            btn.classList.toggle('completed', progress.completed === progress.total);
        } else {
            progressSpan.textContent = '';
        }
    });
}

// Render the challenge grid
export function renderChallengeGrid() {
    const grid = document.getElementById('challenge-grid');
    if (!grid) return;

    const levelChallenges = state.challenges[state.currentLevel];
    if (!levelChallenges) return;

    grid.innerHTML = '';

    levelChallenges.forEach((_, index) => {
        const box = document.createElement('button');
        box.type = 'button';
        box.className = 'challenge-box';
        box.dataset.index = index;
        box.addEventListener('click', () => goToChallenge(index));
        grid.appendChild(box);
    });
    updateChallengeGrid();
}

// Refresh solved/active state of the grid boxes
export function updateChallengeGrid() {
    const grid = document.getElementById('challenge-grid');
    if (!grid) return;

    grid.querySelectorAll('.challenge-box').forEach((box, i) => {
        const status = challengeStatus(state.currentLevel, i);
        box.classList.toggle('active', i === state.currentChallengeIndex);
        box.classList.toggle('solved', status !== null);
        box.classList.toggle('assisted', status === 'assisted');
        box.textContent = status ? '' : String(i + 1);
        const label = `Challenge ${i + 1}` +
            (status === 'solved' ? ', solved' : status === 'assisted' ? ', solved with the solution shown' : '');
        box.setAttribute('aria-label', label);
        box.title = label;
        if (i === state.currentChallengeIndex) box.setAttribute('aria-current', 'step');
        else box.removeAttribute('aria-current');
    });
}

export function displayText(text, container) {
    container.innerHTML = '';
    const lines = text.split('\n');

    lines.forEach((line) => {
        const lineEl = document.createElement('div');
        lineEl.className = 'line';
        lineEl.textContent = line;
        container.appendChild(lineEl);
    });
}

export function updateStats(text) {
    const lines = text.split('\n');
    elements.lineCount.textContent = lines.length;
    elements.wordCount.textContent = text.trim() ? text.trim().split(/\s+/).length : 0;
    elements.charCount.textContent = text.length;
}

function clearOutput() {
    elements.outputText.textContent = '';
    elements.outputText.classList.remove('empty-result');
    elements.outputStats.textContent = '';
    elements.errorMessage.style.display = 'none';
    elements.warningMessage.textContent = '';
    elements.feedback.classList.add('hidden');
    renderSteps([]);
}

// Shows a command's output; an empty result is labelled so it is not
// mistaken for 'nothing happened'
function showOutput(text) {
    elements.outputText.textContent = text;
    elements.outputText.classList.toggle('empty-result', text === '');
}

function lineCount(text) {
    return text === '' ? 0 : text.split('\n').length;
}

// ---------------------------------------------------------------------------
// Pipeline inspector: one chip per stage; clicking shows that stage's output
// ---------------------------------------------------------------------------

let currentSteps = [];

function renderSteps(steps, failedCommand = null) {
    const bar = elements.pipelineSteps;
    currentSteps = steps;
    bar.innerHTML = '';
    if (steps.length + (failedCommand ? 1 : 0) < 2) {
        bar.classList.add('hidden');
        return;
    }
    bar.classList.remove('hidden');
    steps.forEach((step, i) => {
        const n = lineCount(step.output);
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'step-chip';
        chip.textContent = `${step.command} → ${n}`;
        chip.title = `Show the output after stage ${i + 1} (${n} line${n === 1 ? '' : 's'})`;
        chip.addEventListener('click', () => selectStep(i));
        bar.appendChild(chip);
    });
    if (failedCommand) {
        const chip = document.createElement('span');
        chip.className = 'step-chip failed';
        chip.textContent = `${failedCommand} ✗`;
        chip.title = 'This stage failed — see the error below';
        bar.appendChild(chip);
    }
    if (steps.length) selectStep(steps.length - 1);
}

function selectStep(index) {
    const step = currentSteps[index];
    if (!step) return;
    showOutput(step.output);
    const n = lineCount(step.output);
    const isLast = index === currentSteps.length - 1;
    elements.outputStats.textContent = isLast ? `${n} line(s)` : `${n} line(s) after stage ${index + 1}`;
    elements.pipelineSteps.querySelectorAll('button.step-chip').forEach((chip, i) => {
        chip.classList.toggle('active', i === index);
        chip.setAttribute('aria-pressed', String(i === index));
    });
}

// ---------------------------------------------------------------------------
// Mismatch feedback: what differs between the output and the expected one
// ---------------------------------------------------------------------------

function renderFeedback(actual, expected) {
    const { summary, tips } = analyzeMismatch(actual, expected, state.currentText);
    const box = elements.feedback;
    box.innerHTML = '';

    const title = document.createElement('div');
    title.className = 'feedback-title';
    title.textContent = 'Not quite yet. ' + summary;
    box.appendChild(title);

    for (const tip of tips) {
        const p = document.createElement('div');
        p.className = 'feedback-tip';
        p.textContent = tip;
        box.appendChild(p);
    }

    const diff = diffLines(actual.replace(/\n+$/, ''), expected.replace(/\n+$/, ''));
    if (diff.length && diff.length <= 80) {
        const pre = document.createElement('div');
        pre.className = 'diff';
        for (const d of diff) {
            const line = document.createElement('div');
            line.className = `diff-line diff-${d.type}`;
            line.textContent = (d.type === 'extra' ? '- ' : d.type === 'missing' ? '+ ' : '  ') + d.text;
            pre.appendChild(line);
        }
        box.appendChild(pre);
        const legend = document.createElement('div');
        legend.className = 'diff-legend';
        legend.innerHTML = '<span class="diff-extra">- only in your output</span><span class="diff-missing">+ expected, but missing</span>';
        box.appendChild(legend);
    }
    box.classList.remove('hidden');
}

// ---------------------------------------------------------------------------
// Progressive hints
// ---------------------------------------------------------------------------

function hintTask() {
    return state.currentMode === 'challenges' ? currentChallenge() : state.currentPracticeChallenge;
}

function renderHints() {
    const task = hintTask();
    const steps = task ? hintSteps(task) : [];
    const panel = elements.hintPanel;
    panel.innerHTML = '';

    steps.slice(0, state.hintLevel).forEach(step => {
        const row = document.createElement('div');
        row.className = 'hint-step';
        const title = document.createElement('strong');
        title.textContent = step.title + ': ';
        row.appendChild(title);
        if (step.text) row.appendChild(document.createTextNode(step.text + ' '));
        if (step.code) {
            const code = document.createElement('code');
            code.textContent = step.code;
            row.appendChild(code);
        }
        if (step.code && step.code === task.solution) {
            const paste = document.createElement('button');
            paste.type = 'button';
            paste.className = 'hint-paste';
            paste.textContent = 'Put in terminal';
            paste.addEventListener('click', () => {
                elements.commandInput.value = task.solution;
                elements.commandInput.focus();
            });
            row.appendChild(paste);
        }
        panel.appendChild(row);
    });
    panel.classList.toggle('hidden', state.hintLevel === 0);

    const btn = elements.hintBtn;
    if (steps.length === 0 || state.hintLevel >= steps.length) {
        btn.disabled = true;
        btn.textContent = steps.length && task.solution ? 'Solution shown' : 'Hint';
    } else {
        btn.disabled = false;
        const next = state.hintLevel + 1;
        btn.textContent = task.solution && next === steps.length
            ? `Show solution (${next}/${steps.length})`
            : `Hint ${next}/${steps.length}`;
    }
}

// Reveals the next hint step. The last step is the solution: solving after
// that counts as assisted (challenges) or not at all (practice).
export function showNextHint() {
    const task = hintTask();
    const steps = task ? hintSteps(task) : [];
    if (state.hintLevel >= steps.length) return;
    state.hintLevel++;
    if (task.solution && state.hintLevel === steps.length) {
        state.task.revealed = true;
        if (state.currentMode === 'practice') {
            state.practiceStats.streak = 0;
            updatePracticeStats();
        }
    }
    renderHints();
}

export function loadChallenge() {
    const levelChallenges = state.challenges[state.currentLevel];
    if (!levelChallenges || levelChallenges.length === 0) return;

    cancelAdvance();
    resetTask();
    const challenge = currentChallenge();
    const isSandbox = challenge.expected === null;

    closeInputEditor(false);
    state.currentText = (isSandbox && state.sandboxTexts[challenge.id]) || challenge.text;
    displayText(state.currentText, elements.inputText);
    updateStats(state.currentText);
    elements.sandboxActions.classList.toggle('hidden', !isSandbox);
    elements.restoreInputBtn.classList.toggle('hidden', !(isSandbox && state.sandboxTexts[challenge.id]));

    elements.challengeDesc.textContent = challenge.description;

    const completedMark = challengeStatus(state.currentLevel, state.currentChallengeIndex) ? ' ✓' : '';
    elements.challengeNum.textContent = (state.currentChallengeIndex + 1) + completedMark;
    elements.totalChallenges.textContent = levelChallenges.length;

    elements.expectedOutput.textContent = challenge.expected === null
        ? '(Sandbox mode - no expected output)'
        : challenge.expected;

    clearOutput();
    renderHints();
    elements.commandInput.value = '';

    updateDifficultyButtons();
    updateChallengeGrid();
}

export function showSuccess(message = 'Correct! Great job!') {
    elements.successMessage.textContent = message;
    elements.successMessage.style.display = 'block';
    clearTimeout(successTimer);
    successTimer = setTimeout(() => {
        elements.successMessage.style.display = 'none';
    }, 1500);
}

// After a solved challenge: next uncompleted challenge of this level (wrapping
// around to ones skipped earlier), then the next level with open challenges.
function advanceChallenge() {
    const next = findUncompletedIndex(state.currentLevel, state.currentChallengeIndex + 1);
    if (next !== -1) {
        goToChallenge(next);
        return;
    }
    const start = LEVELS.indexOf(state.currentLevel);
    for (let k = 1; k < LEVELS.length; k++) {
        const level = LEVELS[(start + k) % LEVELS.length];
        if (findUncompletedIndex(level) !== -1) {
            selectLevel(level);
            return;
        }
    }
    showSuccess('All challenges completed!');
}

function showWarnings(warnings) {
    elements.warningMessage.textContent = warnings.join('\n');
}

export function clearOutputPanel() {
    clearOutput();
}

// ---------------------------------------------------------------------------
// Sandbox: edit the input text
// ---------------------------------------------------------------------------

function isEditingInput() {
    return !elements.inputEditor.classList.contains('hidden');
}

function closeInputEditor(save) {
    if (!isEditingInput()) return;
    if (save) {
        const challenge = currentChallenge();
        const text = elements.inputEditor.value.replace(/\n+$/, '');
        state.currentText = text;
        if (text === challenge.text) delete state.sandboxTexts[challenge.id];
        else state.sandboxTexts[challenge.id] = text;
        saveProgress();
        elements.restoreInputBtn.classList.toggle('hidden', !state.sandboxTexts[challenge.id]);
        displayText(state.currentText, elements.inputText);
        updateStats(state.currentText);
        clearOutput();
    }
    elements.inputEditor.classList.add('hidden');
    elements.inputText.classList.remove('hidden');
    elements.editInputBtn.textContent = 'Edit text';
}

export function toggleInputEditor() {
    if (isEditingInput()) {
        closeInputEditor(true);
        elements.commandInput.focus();
        return;
    }
    elements.inputEditor.value = state.currentText;
    elements.inputText.classList.add('hidden');
    elements.inputEditor.classList.remove('hidden');
    elements.editInputBtn.textContent = 'Done';
    elements.inputEditor.focus();
}

export function restoreSandboxText() {
    const challenge = currentChallenge();
    delete state.sandboxTexts[challenge.id];
    saveProgress();
    closeInputEditor(false);
    loadChallenge();
}

export function showError(msg) {
    elements.errorMessage.textContent = msg;
    elements.errorMessage.style.display = 'block';
}

export function runCommand() {
    const cmdLine = elements.commandInput.value.trim();
    if (!cmdLine) return;

    // Unsaved sandbox edits apply to the run
    if (isEditingInput()) closeInputEditor(true);
    clearOutput();
    state.task.tried = true;
    let run;
    try {
        run = runPipeline(state.currentText, cmdLine);
    } catch (e) {
        showError(e.message);
        showWarnings(e.warnings || []);
        const done = e.steps || [];
        const stages = splitPipeline(cmdLine);
        renderSteps(done, done.length < stages.length ? stages[done.length].trim() : null);
        return;
    }

    const result = run.output;
    showWarnings(run.warnings);
    showOutput(result);
    elements.outputStats.textContent = `${lineCount(result)} line(s)`;
    renderSteps(run.steps);

    // Once solved, running again just shows output: no double counting
    if (state.task.resolved) return;

    const expected = state.currentMode === 'challenges'
        ? currentChallenge().expected
        : state.currentPracticeChallenge?.expected;
    if (expected !== null && expected !== undefined && result.trim() !== expected.trim()) {
        renderFeedback(result, expected);
    }

    if (state.currentMode === 'challenges') {
        const challenge = currentChallenge();
        if (challenge.expected !== null && result.trim() === challenge.expected.trim()) {
            state.task.resolved = true;
            markChallengeCompleted(challenge, state.task.revealed);
            updateDifficultyButtons();
            updateChallengeGrid();
            showSuccess(state.task.revealed ? 'Correct! (solved with the solution shown)' : 'Correct! Great job!');
            scheduleAdvance(advanceChallenge, 1500);
        }
    } else if (state.currentMode === 'practice' && state.currentPracticeChallenge) {
        if (result.trim() === state.currentPracticeChallenge.expected.trim()) {
            state.task.resolved = true;
            const counted = !state.task.revealed;
            recordPracticeResult(counted, state.currentPracticeChallenge.cmds);
            updatePracticeStats();
            showSuccess(counted
                ? `Correct! Streak: ${state.practiceStats.streak}`
                : 'Correct — but the answer was shown, so it does not count');
            scheduleAdvance(generatePracticeProblem, 2000);
        }
    }
}

// Skip counts as a finished, unsolved problem (streak resets)
export function skipPracticeProblem() {
    if (state.currentPracticeChallenge && !state.task.resolved) {
        recordPracticeResult(false, state.currentPracticeChallenge.cmds);
        updatePracticeStats();
    }
    generatePracticeProblem();
}

// New problem because settings changed: only counts if the user tried it
export function newPracticeProblem() {
    if (state.currentPracticeChallenge && !state.task.resolved && state.task.tried) {
        recordPracticeResult(false, state.currentPracticeChallenge.cmds);
        updatePracticeStats();
    }
    generatePracticeProblem();
}

export function initCommandCheckboxes() {
    elements.commandCheckboxes.innerHTML = '';

    for (const [cmd, info] of Object.entries(commandDefs)) {
        const div = document.createElement('div');
        div.className = `command-checkbox ${state.selectedCommands.has(cmd) ? 'selected' : ''}`;
        div.innerHTML = `
            <input type="checkbox" id="cmd-${cmd}" ${state.selectedCommands.has(cmd) ? 'checked' : ''}>
            <label for="cmd-${cmd}">${info.name}</label>
            <span class="cmd-desc">${info.desc}</span>
            <span class="cmd-score" data-cmd="${cmd}"></span>
        `;

        const checkbox = div.querySelector('input');
        checkbox.addEventListener('change', () => {
            if (checkbox.checked) {
                state.selectedCommands.add(cmd);
                div.classList.add('selected');
            } else {
                state.selectedCommands.delete(cmd);
                div.classList.remove('selected');
            }
            saveProgress();
        });

        div.addEventListener('click', (e) => {
            if (e.target !== checkbox) {
                checkbox.checked = !checkbox.checked;
                checkbox.dispatchEvent(new Event('change'));
            }
        });

        elements.commandCheckboxes.appendChild(div);
    }
    updateCommandScores();
}

// "solved/attempts" badge per command; weak ones are highlighted
function updateCommandScores() {
    elements.commandCheckboxes.querySelectorAll('.cmd-score').forEach(badge => {
        const c = state.commandStats[badge.dataset.cmd];
        if (!c || !c.attempts) {
            badge.textContent = '';
            badge.removeAttribute('title');
            badge.classList.remove('weak');
            return;
        }
        badge.textContent = `${c.solved}/${c.attempts}`;
        badge.title = `Solved ${c.solved} of ${c.attempts} practice problems that use ${badge.dataset.cmd}`;
        badge.classList.toggle('weak', c.attempts >= 2 && c.solved / c.attempts < 0.5);
    });
}

export function generatePracticeProblem() {
    if (state.selectedCommands.size === 0) {
        showError('Please select at least one command to practice');
        return;
    }

    cancelAdvance();
    resetTask();

    const problem = generateProblem(state.selectedCommands, state.practiceDifficulty, commandWeight);

    state.currentPracticeChallenge = problem;
    state.currentText = problem.text;

    displayText(state.currentText, elements.inputText);
    updateStats(state.currentText);

    elements.challengeDesc.textContent = problem.description;
    elements.expectedOutput.textContent = problem.expected;

    elements.targetCommand.textContent = problem.isPipe
        ? problem.cmds.join(' | ')
        : problem.cmds[0];

    clearOutput();
    renderHints();
    elements.commandInput.value = '';
    elements.commandInput.focus();
}

export function updatePracticeStats() {
    elements.solvedCount.textContent = state.practiceStats.solved;
    elements.attemptedCount.textContent = state.practiceStats.attempted;
    elements.streakCount.textContent = state.practiceStats.streak;
    if (elements.bestStreakCount) {
        elements.bestStreakCount.textContent = state.practiceStats.bestStreak;
    }
    updateCommandScores();
}

export function selectAllCommands() {
    state.selectedCommands = new Set(Object.keys(commandDefs));
    saveProgress();
    initCommandCheckboxes();
}

export function deselectAllCommands() {
    state.selectedCommands = new Set();
    saveProgress();
    initCommandCheckboxes();
}
