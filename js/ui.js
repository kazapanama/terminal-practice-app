// UI/DOM manipulation functions

import { state, markChallengeCompleted, isChallengeCompleted, getLevelProgress, saveProgress } from './state.js';
import { executePipeline } from './commands.js';
import { commandDefs, problemGenerators } from './problemGenerators.js';
import { randInt } from './utils.js';

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

export function showLandingPage() {
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
    updateDifficultyButtons();
    renderChallengeGrid();
    loadChallenge();
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
    updatePracticeStats();
    generatePracticeProblem();
}

// Update difficulty buttons to show progress
export function updateDifficultyButtons() {
    document.querySelectorAll('.difficulty-btn').forEach(btn => {
        const level = btn.dataset.level;
        const progress = getLevelProgress(level);

        // Update active state
        btn.classList.toggle('active', level === state.currentLevel);

        // Add or update progress indicator
        let progressSpan = btn.querySelector('.progress-indicator');
        if (!progressSpan) {
            progressSpan = document.createElement('span');
            progressSpan.className = 'progress-indicator';
            btn.appendChild(progressSpan);
        }

        if (progress.total > 0 && level !== 'sandbox') {
            progressSpan.textContent = ` (${progress.completed}/${progress.total})`;
            if (progress.completed === progress.total) {
                btn.classList.add('completed');
            } else {
                btn.classList.remove('completed');
            }
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

        // Check if solved
        if (isChallengeCompleted(state.currentLevel, index)) {
            box.classList.add('solved');
        } else {
            box.textContent = index + 1;
        }

        // Mark active
        if (index === state.currentChallengeIndex) {
            box.classList.add('active');
        }

        // Click handler
        box.addEventListener('click', () => {
            state.currentChallengeIndex = index;
            loadChallenge();
        });

        grid.appendChild(box);
    });
}

// Update single box in grid (for performance)
export function updateChallengeGridBox(index) {
    const grid = document.getElementById('challenge-grid');
    if (!grid) return;

    const boxes = grid.querySelectorAll('.challenge-box');
    boxes.forEach((box, i) => {
        box.classList.toggle('active', i === state.currentChallengeIndex);
        if (isChallengeCompleted(state.currentLevel, i)) {
            box.classList.add('solved');
            box.textContent = '';
        }
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

export function loadChallenge() {
    const levelChallenges = state.challenges[state.currentLevel];
    if (!levelChallenges || levelChallenges.length === 0) return;

    const challenge = levelChallenges[state.currentChallengeIndex];

    state.currentText = challenge.text;
    displayText(state.currentText, elements.inputText);
    updateStats(state.currentText);

    elements.challengeDesc.textContent = challenge.description;

    // Show completion status in challenge counter
    const isCompleted = isChallengeCompleted(state.currentLevel, state.currentChallengeIndex);
    const completedMark = isCompleted ? ' \u2713' : '';
    elements.challengeNum.textContent = (state.currentChallengeIndex + 1) + completedMark;
    elements.totalChallenges.textContent = levelChallenges.length;

    if (challenge.expected === null) {
        elements.expectedOutput.textContent = '(Sandbox mode - no expected output)';
    } else {
        elements.expectedOutput.textContent = challenge.expected;
    }

    elements.outputText.textContent = '';
    elements.outputStats.textContent = '';
    elements.errorMessage.style.display = 'none';
    elements.commandInput.value = '';

    // Update difficulty buttons to reflect current progress
    updateDifficultyButtons();

    // Update challenge grid
    updateChallengeGridBox();
}

export function showSuccess(message = 'Correct! Great job!') {
    elements.successMessage.textContent = message;
    elements.successMessage.style.display = 'block';
    setTimeout(() => {
        elements.successMessage.style.display = 'none';
        if (state.currentMode === 'challenges') {
            // Find next uncompleted challenge or just go to next
            const levelChallenges = state.challenges[state.currentLevel];
            let nextIndex = state.currentChallengeIndex + 1;

            // Try to find next uncompleted challenge
            while (nextIndex < levelChallenges.length && isChallengeCompleted(state.currentLevel, nextIndex)) {
                nextIndex++;
            }

            // If all remaining are completed, just go to next if available
            if (nextIndex >= levelChallenges.length) {
                nextIndex = state.currentChallengeIndex + 1;
            }

            if (nextIndex < levelChallenges.length) {
                state.currentChallengeIndex = nextIndex;
                loadChallenge();
            } else {
                // Level complete!
                updateDifficultyButtons();
            }
        }
    }, 1500);
}

export function showError(msg) {
    elements.errorMessage.textContent = msg;
    elements.errorMessage.style.display = 'block';
}

export function runCommand() {
    const cmdLine = elements.commandInput.value.trim();
    if (!cmdLine) return;

    elements.errorMessage.style.display = 'none';

    try {
        const pipeline = cmdLine.split('|');
        const result = executePipeline(state.currentText, pipeline);

        elements.outputText.textContent = result;

        const lines = result.split('\n').filter(l => l !== '');
        elements.outputStats.textContent = `${lines.length} line(s)`;

        if (state.currentMode === 'challenges') {
            const challenge = state.challenges[state.currentLevel][state.currentChallengeIndex];
            if (challenge.expected !== null) {
                const normalizedResult = result.trim();
                const normalizedExpected = challenge.expected.trim();

                if (normalizedResult === normalizedExpected) {
                    // Mark challenge as completed and save
                    markChallengeCompleted(state.currentLevel, state.currentChallengeIndex);
                    showSuccess();
                }
            }
        } else if (state.currentMode === 'practice' && state.currentPracticeChallenge) {
            const expectedResult = executePipeline(state.currentText, state.currentPracticeChallenge.solution.split('|'));
            if (result.trim() === expectedResult.trim()) {
                state.practiceStats.solved++;
                state.practiceStats.streak++;
                if (state.practiceStats.streak > state.practiceStats.bestStreak) {
                    state.practiceStats.bestStreak = state.practiceStats.streak;
                }
                saveProgress();
                updatePracticeStats();
                showSuccess(`Correct! Streak: ${state.practiceStats.streak}`);
                setTimeout(() => generatePracticeProblem(), 2000);
            }
        }
    } catch (e) {
        showError(e.message);
        if (state.currentMode === 'practice') {
            state.practiceStats.streak = 0;
            updatePracticeStats();
        }
    }
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

    state.practiceStats.attempted++;
    saveProgress();
    updatePracticeStats();

    const commandList = Array.from(state.selectedCommands);
    const selectedCmd = commandList[randInt(0, commandList.length - 1)];

    let problem;
    if (state.selectedCommands.size >= 2 && Math.random() < 0.3) {
        const pipeProblems = [
            'pipe_sort_uniq',
            'pipe_sort_head',
            'pipe_grep_wc',
            'pipe_sort_uniq_sort',
            'pipe_cut_sort'
        ];
        const pipeProblem = pipeProblems[randInt(0, pipeProblems.length - 1)];
        problem = problemGenerators[pipeProblem]();
    } else if (problemGenerators[selectedCmd]) {
        problem = problemGenerators[selectedCmd]();
    } else {
        problem = problemGenerators.grep();
    }

    state.currentPracticeChallenge = problem;
    state.currentText = problem.text;

    displayText(state.currentText, elements.inputText);
    updateStats(state.currentText);

    elements.challengeDesc.textContent = problem.description;

    const expectedResult = executePipeline(state.currentText, problem.solution.split('|'));
    elements.expectedOutput.textContent = expectedResult;

    if (problem.isPipe) {
        elements.targetCommand.textContent = 'Pipes';
    } else {
        elements.targetCommand.textContent = selectedCmd;
    }

    elements.outputText.textContent = '';
    elements.outputStats.textContent = '';
    elements.errorMessage.style.display = 'none';
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
