// Application state management

const STORAGE_KEY = 'linuxCommandPractice';
const STORAGE_VERSION = 2;

// Challenge levels in the order they are played (sandbox has no goals)
export const LEVELS = ['beginner', 'intermediate', 'advanced', 'expert', 'master', 'realworld'];
export const ALL_LEVELS = [...LEVELS, 'sandbox'];

function freshTask() {
    // State of the challenge / practice problem currently on screen
    return { resolved: false, revealed: false, tried: false };
}

export const state = {
    currentMode: null, // 'challenges' or 'practice'
    currentLevel: 'beginner',
    currentChallengeIndex: 0,
    currentText: '',
    selectedCommands: new Set(['grep', 'head', 'tail', 'sort', 'wc']),
    practiceDifficulty: 'mixed', // 'single' | 'short' | 'long' | 'mixed'
    // attempted = problems finished (solved, skipped or answer shown)
    practiceStats: { solved: 0, attempted: 0, streak: 0, bestStreak: 0 },
    // Per-command practice results: { grep: { attempts: 5, solved: 4 } }
    commandStats: {},
    currentPracticeChallenge: null,
    challenges: {},
    // Completed challenges by stable id: { 'beginner-03': 'solved' | 'assisted' }
    // ('assisted' = solved after the solution was revealed)
    progress: {},
    task: freshTask(),
    // Revealed hint steps for the task on screen
    hintLevel: 0,
    // Sandbox input edited by the user: { 'sandbox-01': 'text' }
    sandboxTexts: {}
};

export function resetTask() {
    state.task = freshTask();
    state.hintLevel = 0;
}

export function currentChallenge() {
    return state.challenges[state.currentLevel]?.[state.currentChallengeIndex] ?? null;
}

// Mark a challenge as completed. A clean solve upgrades an earlier assisted one.
export function markChallengeCompleted(challenge, assisted) {
    const previous = state.progress[challenge.id];
    if (previous === 'solved') return;
    state.progress[challenge.id] = assisted ? 'assisted' : 'solved';
    saveProgress();
}

// 'solved' | 'assisted' | null
export function challengeStatus(level, index) {
    const ch = state.challenges[level]?.[index];
    return ch ? state.progress[ch.id] ?? null : null;
}

export function isChallengeCompleted(level, index) {
    return challengeStatus(level, index) !== null;
}

// First uncompleted challenge at or after `from`, wrapping around the level.
// Returns -1 when every challenge of the level is completed.
export function findUncompletedIndex(level, from = 0) {
    const total = state.challenges[level]?.length || 0;
    for (let k = 0; k < total; k++) {
        const i = (from + k) % total;
        if (!isChallengeCompleted(level, i)) return i;
    }
    return -1;
}

// Where to resume a level: first uncompleted challenge, or 0 if all are done
export function getFirstUncompletedIndex(level) {
    return Math.max(0, findUncompletedIndex(level, 0));
}

export function getLevelProgress(level) {
    const list = state.challenges[level] || [];
    const completed = list.filter(ch => state.progress[ch.id]).length;
    return { completed, total: list.length };
}

export function recordPracticeResult(solved, cmds = []) {
    for (const cmd of new Set(cmds)) {
        const c = state.commandStats[cmd] ||= { attempts: 0, solved: 0 };
        c.attempts++;
        if (solved) c.solved++;
    }
    const s = state.practiceStats;
    s.attempted++;
    if (solved) {
        s.solved++;
        s.streak++;
        s.bestStreak = Math.max(s.bestStreak, s.streak);
    } else {
        s.streak = 0;
    }
    saveProgress();
}

// How often a command should come up in practice: unseen = 1.5, mastered
// commands drop towards 0.5, ones that are often failed rise towards 2.5.
export function commandWeight(cmd) {
    const c = state.commandStats[cmd] || { attempts: 0, solved: 0 };
    const successRate = (c.solved + 1) / (c.attempts + 2);
    return 0.5 + 2 * (1 - successRate);
}

export function saveProgress() {
    const data = {
        version: STORAGE_VERSION,
        progress: state.progress,
        practiceStats: {
            solved: state.practiceStats.solved,
            attempted: state.practiceStats.attempted,
            bestStreak: state.practiceStats.bestStreak
        },
        commandStats: state.commandStats,
        sandboxTexts: state.sandboxTexts,
        selectedCommands: Array.from(state.selectedCommands),
        practiceDifficulty: state.practiceDifficulty,
        currentLevel: state.currentLevel
    };
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
        console.warn('Could not save progress:', e);
    }
}

// Must run after the challenge data is loaded: version 1 stored completed
// challenges by their position, which is mapped to stable ids here.
export function loadProgress() {
    let data;
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (!saved) return false;
        data = JSON.parse(saved);
    } catch (e) {
        console.warn('Could not load progress:', e);
        return false;
    }

    if (data.progress && typeof data.progress === 'object') {
        state.progress = data.progress;
    } else if (data.completedChallenges) {
        for (const [level, indices] of Object.entries(data.completedChallenges)) {
            for (const i of indices || []) {
                const ch = state.challenges[level]?.[i];
                if (ch) state.progress[ch.id] = 'solved';
            }
        }
    }

    if (data.practiceStats) {
        state.practiceStats.solved = data.practiceStats.solved || 0;
        state.practiceStats.attempted = data.practiceStats.attempted || 0;
        state.practiceStats.bestStreak = data.practiceStats.bestStreak || 0;
    }
    if (data.commandStats && typeof data.commandStats === 'object') {
        state.commandStats = data.commandStats;
    }
    if (data.sandboxTexts && typeof data.sandboxTexts === 'object') {
        state.sandboxTexts = data.sandboxTexts;
    }
    if (Array.isArray(data.selectedCommands)) {
        state.selectedCommands = new Set(data.selectedCommands);
    }
    if (data.practiceDifficulty) {
        state.practiceDifficulty = data.practiceDifficulty;
    }
    if (ALL_LEVELS.includes(data.currentLevel)) {
        state.currentLevel = data.currentLevel;
    }
    if (data.version !== STORAGE_VERSION) saveProgress();
    return true;
}

export function resetProgress() {
    state.progress = {};
    state.practiceStats = { solved: 0, attempted: 0, streak: 0, bestStreak: 0 };
    state.commandStats = {};
    saveProgress();
}
