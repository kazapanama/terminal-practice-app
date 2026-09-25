// Terminal-like behaviour of the command line: history (Up/Down), Tab
// completion of command names, option help, Ctrl+L and Esc.

import { COMMAND_NAMES, commandSpecs } from './commands.js';
import { splitPipeline } from './utils.js';

const HISTORY_KEY = 'linuxCommandPractice.history';
const HISTORY_MAX = 100;
const DEFAULT_HELP = '↑/↓ history · Tab completes commands and lists options · Ctrl+L clears the output · Esc clears the line';

function loadHistory() {
    try {
        const saved = JSON.parse(localStorage.getItem(HISTORY_KEY));
        return Array.isArray(saved) ? saved.filter(x => typeof x === 'string') : [];
    } catch {
        return [];
    }
}

function saveHistory(history) {
    try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(-HISTORY_MAX)));
    } catch {
        // history is a convenience; ignore storage failures
    }
}

function commonPrefix(words) {
    return words.reduce((prefix, w) => {
        let i = 0;
        while (i < prefix.length && prefix[i] === w[i]) i++;
        return prefix.slice(0, i);
    });
}

function optionHelp(cmd) {
    const spec = commandSpecs[cmd];
    const opts = Object.entries(spec.options);
    if (!opts.length) return `${cmd}: ${spec.summary} (no options)`;
    return `${cmd} — ${spec.summary}: ` + opts
        .map(([k, desc]) => {
            const m = desc.match(/^([A-Z]+): (.*)$/);
            return m ? `-${k} ${m[1]} ${m[2]}` : `-${k} ${desc}`;
        })
        .join(' · ');
}

export function initTerminal({ input, help, onRun, onClear }) {
    const history = loadHistory();
    let pos = history.length;
    let draft = '';

    const setHelp = (text) => { help.textContent = text; };
    const moveCursorToEnd = () => {
        const end = input.value.length;
        input.setSelectionRange(end, end);
    };
    setHelp(DEFAULT_HELP);

    function complete() {
        const cursor = input.selectionStart ?? input.value.length;
        const before = input.value.slice(0, cursor);
        const after = input.value.slice(cursor);
        const stage = splitPipeline(before).pop();
        const words = stage.trimStart().split(/\s+/);
        const current = words[words.length - 1];

        if (words.length === 1) {
            const matches = COMMAND_NAMES.filter(c => c.startsWith(current));
            if (matches.length === 0) {
                setHelp(`No command starts with "${current}". Available: ${COMMAND_NAMES.join(' ')}`);
                return;
            }
            const completion = matches.length === 1 ? matches[0] + ' ' : commonPrefix(matches);
            const head = before.slice(0, before.length - current.length);
            input.value = head + completion + after;
            const at = head.length + completion.length;
            input.setSelectionRange(at, at);
            setHelp(matches.length === 1 ? optionHelp(matches[0]) : matches.join('   '));
            return;
        }

        const cmd = words[0];
        setHelp(commandSpecs[cmd] ? optionHelp(cmd) : `${cmd}: command not found. Available: ${COMMAND_NAMES.join(' ')}`);
    }

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const line = input.value.trim();
            if (line && history[history.length - 1] !== line) {
                history.push(line);
                if (history.length > HISTORY_MAX) history.shift();
                saveHistory(history);
            }
            pos = history.length;
            draft = '';
            onRun();
        } else if (e.key === 'ArrowUp') {
            if (pos > 0) {
                if (pos === history.length) draft = input.value;
                pos--;
                input.value = history[pos];
                e.preventDefault();
                moveCursorToEnd();
            }
        } else if (e.key === 'ArrowDown') {
            if (pos < history.length) {
                pos++;
                input.value = pos === history.length ? draft : history[pos];
                e.preventDefault();
                moveCursorToEnd();
            }
        } else if (e.key === 'Tab' && !e.shiftKey && !e.ctrlKey && !e.altKey && input.value.trim() !== '') {
            // With an empty line Tab keeps moving focus, so keyboard users can leave the field
            e.preventDefault();
            complete();
        } else if ((e.key === 'l' || e.key === 'L') && e.ctrlKey) {
            e.preventDefault();
            onClear();
        } else if (e.key === 'Escape') {
            input.value = '';
            pos = history.length;
            setHelp(DEFAULT_HELP);
        }
    });

    input.addEventListener('input', () => {
        pos = history.length;
        if (input.value.trim() === '') setHelp(DEFAULT_HELP);
    });
}
