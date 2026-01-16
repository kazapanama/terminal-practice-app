// Main application initialization

import { state, loadProgress, saveProgress, resetProgress } from './state.js';
import {
    initElements,
    getElements,
    showLandingPage,
    showAppPage,
    loadChallenge,
    runCommand,
    generatePracticeProblem,
    selectAllCommands,
    deselectAllCommands,
    updatePracticeStats,
    renderChallengeGrid
} from './ui.js';

// Load challenge data from JSON files
async function loadChallengeData() {
    const levels = ['beginner', 'intermediate', 'advanced', 'expert', 'sandbox'];

    for (const level of levels) {
        try {
            const response = await fetch(`data/${level}.json`);
            state.challenges[level] = await response.json();
        } catch (error) {
            console.error(`Failed to load ${level} challenges:`, error);
            state.challenges[level] = [];
        }
    }
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
        btn.addEventListener('click', () => {
            document.querySelectorAll('.difficulty-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.currentLevel = btn.dataset.level;
            state.currentChallengeIndex = 0;
            saveProgress();
            renderChallengeGrid();
            loadChallenge();
        });
    });

    // Navigation buttons
    el.prevBtn.addEventListener('click', () => {
        if (state.currentChallengeIndex > 0) {
            state.currentChallengeIndex--;
            loadChallenge();
        }
    });

    el.nextBtn.addEventListener('click', () => {
        if (state.currentChallengeIndex < state.challenges[state.currentLevel].length - 1) {
            state.currentChallengeIndex++;
            loadChallenge();
        }
    });

    el.hintBtn.addEventListener('click', () => {
        if (state.currentMode === 'challenges') {
            const challenge = state.challenges[state.currentLevel][state.currentChallengeIndex];
            alert('Hint: ' + challenge.hint);
        } else if (state.currentPracticeChallenge) {
            alert('Hint: ' + state.currentPracticeChallenge.hint);
        }
    });

    // Practice mode buttons
    el.skipBtn.addEventListener('click', () => {
        state.practiceStats.streak = 0;
        updatePracticeStats();
        generatePracticeProblem();
    });

    el.showAnswerBtn.addEventListener('click', () => {
        if (state.currentPracticeChallenge) {
            el.commandInput.value = state.currentPracticeChallenge.solution;
            state.practiceStats.streak = 0;
            updatePracticeStats();
        }
    });

    el.generateBtn.addEventListener('click', generatePracticeProblem);
    el.selectAllBtn.addEventListener('click', selectAllCommands);
    el.deselectAllBtn.addEventListener('click', deselectAllCommands);

    // Reset progress button (if exists)
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

    // Load saved progress from localStorage
    loadProgress();

    await loadChallengeData();
    initEventListeners();
    showLandingPage();
}

// Start the app when DOM is ready
document.addEventListener('DOMContentLoaded', init);
