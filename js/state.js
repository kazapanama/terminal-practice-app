// Application state management

const STORAGE_KEY = 'linuxCommandPractice';

export const state = {
    currentMode: null, // 'challenges' or 'practice'
    currentLevel: 'beginner',
    currentChallengeIndex: 0,
    currentText: '',
    selectedCommands: new Set(['grep', 'head', 'tail', 'sort', 'wc']),
    practiceStats: { solved: 0, attempted: 0, streak: 0, bestStreak: 0 },
    currentPracticeChallenge: null,
    challenges: {},
    // Track completed challenges: { beginner: [0, 2, 5], intermediate: [1, 3], ... }
    completedChallenges: {
        beginner: [],
        intermediate: [],
        advanced: [],
        expert: [],
        sandbox: []
    }
};

export function setState(key, value) {
    state[key] = value;
}

export function getState(key) {
    return state[key];
}

// Mark a challenge as completed
export function markChallengeCompleted(level, index) {
    if (!state.completedChallenges[level].includes(index)) {
        state.completedChallenges[level].push(index);
        saveProgress();
    }
}

// Check if a challenge is completed
export function isChallengeCompleted(level, index) {
    return state.completedChallenges[level].includes(index);
}

// Get completion stats for a level
export function getLevelProgress(level) {
    const completed = state.completedChallenges[level].length;
    const total = state.challenges[level]?.length || 0;
    return { completed, total };
}

// Save progress to localStorage
export function saveProgress() {
    const data = {
        completedChallenges: state.completedChallenges,
        practiceStats: {
            solved: state.practiceStats.solved,
            attempted: state.practiceStats.attempted,
            bestStreak: state.practiceStats.bestStreak
        },
        selectedCommands: Array.from(state.selectedCommands),
        currentLevel: state.currentLevel
    };
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
        console.warn('Could not save progress:', e);
    }
}

// Load progress from localStorage
export function loadProgress() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            const data = JSON.parse(saved);

            if (data.completedChallenges) {
                state.completedChallenges = {
                    beginner: data.completedChallenges.beginner || [],
                    intermediate: data.completedChallenges.intermediate || [],
                    advanced: data.completedChallenges.advanced || [],
                    expert: data.completedChallenges.expert || [],
                    sandbox: data.completedChallenges.sandbox || []
                };
            }

            if (data.practiceStats) {
                state.practiceStats.solved = data.practiceStats.solved || 0;
                state.practiceStats.attempted = data.practiceStats.attempted || 0;
                state.practiceStats.bestStreak = data.practiceStats.bestStreak || 0;
            }

            if (data.selectedCommands) {
                state.selectedCommands = new Set(data.selectedCommands);
            }

            if (data.currentLevel) {
                state.currentLevel = data.currentLevel;
            }

            return true;
        }
    } catch (e) {
        console.warn('Could not load progress:', e);
    }
    return false;
}

// Reset all progress
export function resetProgress() {
    state.completedChallenges = {
        beginner: [],
        intermediate: [],
        advanced: [],
        expert: [],
        sandbox: []
    };
    state.practiceStats = { solved: 0, attempted: 0, streak: 0, bestStreak: 0 };
    saveProgress();
}
