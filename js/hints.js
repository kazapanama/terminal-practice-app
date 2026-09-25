// Progressive hints derived from a task's solution:
//   1. which commands to use, 2. the shape of the command line with the
//   values hidden, 3. the full solution with its explanation.

import { parsePipeline } from './utils.js';
import { commandSpecs } from './commands.js';

const HIDDEN = '…';

function takesValue(cmd, letter) {
    const desc = commandSpecs[cmd]?.options[letter];
    return !!desc && /^[A-Z]+:/.test(desc);
}

function maskWord(word) {
    if (/^-[A-Za-z]+$/.test(word)) return word;          // -rn, -i
    const opt = word.match(/^(-[A-Za-z])./);              // -d,  -f2  -k3
    if (opt) return opt[1] + HIDDEN;
    if (/^[-+]\d+$/.test(word)) return word[0] + HIDDEN;   // -5, +2
    return HIDDEN;
}

// awk programs keep their structure; literals, numbers and regexes are hidden
function maskAwk(program) {
    let masked = program
        .replace(/"(\\.|[^"\\])*"/g, `"${HIDDEN}"`)
        .replace(/\/(\\.|[^/\\])+\//g, `/${HIDDEN}/`)
        .replace(/\b\d+(\.\d+)?\b/g, HIDDEN);
    if (masked === program) masked = program.replace(/\{[^}]*\}/g, `{${HIDDEN}}`);
    return `'${masked === program ? HIDDEN : masked}'`;
}

// sed scripts keep commands and flags: s/…/…/g, /…/d, …,…p
function maskSed(script) {
    return `'${script
        .replace(/s(.)((?:\\.|(?!\1).)*)\1((?:\\.|(?!\1).)*)\1/g, `s$1${HIDDEN}$1${HIDDEN}$1`)
        .replace(/\/(\\.|[^/\\])+\//g, `/${HIDDEN}/`)
        .replace(/\d+/g, HIDDEN)}'`;
}

export function solutionSkeleton(solution) {
    return parsePipeline(solution)
        .map(({ words }) => {
            const [cmd, ...args] = words;
            const masked = args.map((w, i) => {
                const prev = args[i - 1];
                const isOptionValue = prev && /^-[A-Za-z]$/.test(prev) && takesValue(cmd, prev[1]);
                const isOperand = !w.startsWith('-') && !isOptionValue;
                if (cmd === 'awk' && isOperand) return maskAwk(w);
                if (cmd === 'sed' && isOperand) return maskSed(w);
                return maskWord(w);
            });
            return [cmd, ...masked].join(' ');
        })
        .join(' | ');
}

export function solutionCommands(solution) {
    return parsePipeline(solution).map(s => s.words[0]);
}

// Text after the solution in hints like "Use: <solution> - explanation"
function explanation(hint, solution) {
    if (!hint || !hint.includes(solution)) return '';
    const rest = hint.slice(hint.indexOf(solution) + solution.length).trim();
    return rest.replace(/^[-–(]\s*/, '').replace(/\)$/, '').trim();
}

// Returns the list of hint steps for a task: [{ title, text, code? }]
export function hintSteps({ solution, hint }) {
    if (!solution) {
        return hint ? [{ title: 'Idea', text: hint }] : [];
    }
    const cmds = solutionCommands(solution);
    const prose = hint && !hint.includes(solution) ? hint : '';
    return [
        {
            title: 'Commands',
            text: cmds.length > 1
                ? `Build a pipeline: ${cmds.join(' → ')}`
                : `One command is enough: ${cmds[0]}`
        },
        {
            title: 'Shape',
            text: prose || 'Values are hidden — fill in the patterns, fields and numbers:',
            code: solutionSkeleton(solution)
        },
        {
            title: 'Solution',
            text: explanation(hint, solution),
            code: solution
        }
    ];
}
