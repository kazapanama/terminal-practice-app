// UI/DOM manipulation functions

import {
    state, LEVELS, resetTask, currentChallenge, markChallengeCompleted, challengeStatus,
    getLevelProgress, getFirstUncompletedIndex, findUncompletedIndex, recordPracticeResult, saveProgress
} from './state.js';
import { executePipeline } from './commands.js';
import { commandDefs, generateProblem } from './problemGenerators.js';

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
        showAnswerBtn: document.getElementById('show-answer-btn'),
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
    elements.showAnswerBtn.classList.add('hidden');
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
    elements.showAnswerBtn.classList.remove('hidden');
    elements.challengeModeTitle.textContent = 'Practice';
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
        if (!btn.dataset.bound) {
            btn.dataset.bound = '1';
            btn.addEventListener('click', () => {
                state.practiceDifficulty = btn.dataset.pd;
                saveProgress();
                document.querySelectorAll('.practice-difficulty-btn').forEach(b =>
                    b.classList.toggle('active', b === btn));
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
        const box = document.createElement('div');
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
    elements.outputStats.textContent = '';
    elements.errorMessage.style.display = 'none';
}

export function loadChallenge() {
    const levelChallenges = state.challenges[state.currentLevel];
    if (!levelChallenges || levelChallenges.length === 0) return;

    cancelAdvance();
    resetTask();
    const challenge = currentChallenge();

    state.currentText = challenge.text;
    displayText(state.currentText, elements.inputText);
    updateStats(state.currentText);

    elements.challengeDesc.textContent = challenge.description;

    const completedMark = challengeStatus(state.currentLevel, state.currentChallengeIndex) ? ' ✓' : '';
    elements.challengeNum.textContent = (state.currentChallengeIndex + 1) + completedMark;
    elements.totalChallenges.textContent = levelChallenges.length;

    elements.expectedOutput.textContent = challenge.expected === null
        ? '(Sandbox mode - no expected output)'
        : challenge.expected;

    clearOutput();
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

export function showError(msg) {
    elements.errorMessage.textContent = msg;
    elements.errorMessage.style.display = 'block';
}

export function runCommand() {
    const cmdLine = elements.commandInput.value.trim();
    if (!cmdLine) return;

    elements.errorMessage.style.display = 'none';
    state.task.tried = true;

    let result;
    try {
        result = executePipeline(state.currentText, cmdLine);
    } catch (e) {
        showError(e.message);
        return;
    }

    elements.outputText.textContent = result;
    const lines = result === '' ? 0 : result.split('\n').length;
    elements.outputStats.textContent = `${lines} line(s)`;

    // Once solved, running again just shows output: no double counting
    if (state.task.resolved) return;

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
            recordPracticeResult(counted);
            updatePracticeStats();
            showSuccess(counted
                ? `Correct! Streak: ${state.practiceStats.streak}`
                : 'Correct — but the answer was shown, so it does not count');
            scheduleAdvance(generatePracticeProblem, 2000);
        }
    }
}

// Reveal the solution of the current task. Solving afterwards is "assisted".
export function revealSolution() {
    state.task.revealed = true;
    if (state.currentMode === 'challenges') {
        const challenge = currentChallenge();
        return challenge.solution || challenge.hint;
    }
    return state.currentPracticeChallenge?.solution ?? '';
}

// Skip counts as a finished, unsolved problem (streak resets)
export function skipPracticeProblem() {
    if (state.currentPracticeChallenge && !state.task.resolved) {
        recordPracticeResult(false);
        updatePracticeStats();
    }
    generatePracticeProblem();
}

// New problem because settings changed: only counts if the user tried it
export function newPracticeProblem() {
    if (state.currentPracticeChallenge && !state.task.resolved && state.task.tried) {
        recordPracticeResult(false);
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
}

export function generatePracticeProblem() {
    if (state.selectedCommands.size === 0) {
        showError('Please select at least one command to practice');
        return;
    }

    cancelAdvance();
    resetTask();

    const problem = generateProblem(state.selectedCommands, state.practiceDifficulty);

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
