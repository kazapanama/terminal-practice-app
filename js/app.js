// Main application initialization

import { state, ALL_LEVELS, loadProgress, resetProgress } from './state.js';
import {
    initElements,
    getElements,
    showLandingPage,
    showAppPage,
    selectLevel,
    goToChallenge,
    runCommand,
    showNextHint,
    skipPracticeProblem,
    newPracticeProblem,
    selectAllCommands,
    deselectAllCommands,
    clearOutputPanel,
    toggleInputEditor,
    restoreSandboxText,
    resetFiles
} from './ui.js';
import { initTerminal } from './terminal.js';

// Load challenge data from JSON files
async function loadChallengeData() {
    await Promise.all(ALL_LEVELS.map(async (level) => {
        try {
            const response = await fetch(`data/${level}.json`);
            state.challenges[level] = await response.json();
        } catch (error) {
            console.error(`Failed to load ${level} challenges:`, error);
            state.challenges[level] = [];
        }
    }));
}

// A destructive button that asks for a second click instead of confirm()
function initResetButton(btn) {
    const label = btn.textContent;
    let timer = null;
    const disarm = () => {
        clearTimeout(timer);
        btn.classList.remove('armed');
        btn.textContent = label;
    };
    btn.addEventListener('click', () => {
        if (!btn.classList.contains('armed')) {
            btn.classList.add('armed');
            btn.textContent = 'Click again to erase all progress';
            timer = setTimeout(disarm, 4000);
            return;
        }
        disarm();
        resetProgress();
        location.reload();
    });
    btn.addEventListener('blur', disarm);
}

// Initialize event listeners
function initEventListeners() {
    const el = getElements();

    // Landing page buttons
    el.challengesBtn.addEventListener('click', () => showAppPage('challenges'));
    el.practiceBtn.addEventListener('click', () => showAppPage('practice'));
    el.backBtn.addEventListener('click', showLandingPage);

    // Command line
    el.runBtn.addEventListener('click', runCommand);
    initTerminal({
        input: el.commandInput,
        help: el.terminalHelp,
        onRun: runCommand,
        onClear: clearOutputPanel,
        fs: () => state.vfs
    });

    // Difficulty buttons
    document.querySelectorAll('.difficulty-btn').forEach(btn => {
        btn.addEventListener('click', () => selectLevel(btn.dataset.level));
    });

    // Navigation buttons
    el.prevBtn.addEventListener('click', () => goToChallenge(state.currentChallengeIndex - 1));
    el.nextBtn.addEventListener('click', () => goToChallenge(state.currentChallengeIndex + 1));
    el.hintBtn.addEventListener('click', showNextHint);

    // Sandbox input editing
    el.editInputBtn.addEventListener('click', toggleInputEditor);
    el.restoreInputBtn.addEventListener('click', restoreSandboxText);
    el.resetFilesBtn.addEventListener('click', resetFiles);

    // Practice mode buttons
    el.skipBtn.addEventListener('click', skipPracticeProblem);
    el.generateBtn.addEventListener('click', newPracticeProblem);
    el.selectAllBtn.addEventListener('click', selectAllCommands);
    el.deselectAllBtn.addEventListener('click', deselectAllCommands);

    const resetBtn = document.getElementById('reset-progress-btn');
    if (resetBtn) initResetButton(resetBtn);
}

// Main initialization
async function init() {
    initElements();

    // Progress is keyed by challenge id, so the data must be loaded first
    await loadChallengeData();
    loadProgress();

    initEventListeners();
    showLandingPage();
}

// Start the app when DOM is ready
document.addEventListener('DOMContentLoaded', init);
