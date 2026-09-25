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
    deselectAllCommands
} from './ui.js';

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

// Initialize event listeners
function initEventListeners() {
    const el = getElements();

    // Landing page buttons
    el.challengesBtn.addEventListener('click', () => showAppPage('challenges'));
    el.practiceBtn.addEventListener('click', () => showAppPage('practice'));
    el.backBtn.addEventListener('click', showLandingPage);

    // Command input
    el.runBtn.addEventListener('click', runCommand);
    el.commandInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') runCommand();
    });

    // Difficulty buttons
    document.querySelectorAll('.difficulty-btn').forEach(btn => {
        btn.addEventListener('click', () => selectLevel(btn.dataset.level));
    });

    // Navigation buttons
    el.prevBtn.addEventListener('click', () => goToChallenge(state.currentChallengeIndex - 1));
    el.nextBtn.addEventListener('click', () => goToChallenge(state.currentChallengeIndex + 1));

    el.hintBtn.addEventListener('click', showNextHint);

    // Practice mode buttons
    el.skipBtn.addEventListener('click', skipPracticeProblem);

    el.generateBtn.addEventListener('click', newPracticeProblem);
    el.selectAllBtn.addEventListener('click', selectAllCommands);
    el.deselectAllBtn.addEventListener('click', deselectAllCommands);

    const resetBtn = document.getElementById('reset-progress-btn');
    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            if (confirm('Are you sure you want to reset all progress? This cannot be undone.')) {
                resetProgress();
                location.reload();
            }
        });
    }
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
