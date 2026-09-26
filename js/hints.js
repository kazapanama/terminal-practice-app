// Progressive hints derived from a task's solution:
//   1. which commands to use, 2. the shape of the command line with the
//   values hidden, 3. the full solution with its explanation.

import { parseScript, stagesOf } from './shell.js';
import { commandSpecs } from './commands.js';

const HIDDEN = '…';

function takesValue(cmd, letter) {
    const desc = commandSpecs[cmd]?.options[letter];
    return !!desc && /^[A-Z][A-Z=]*:/.test(desc);
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

// Splits a sed script into commands at ; and newlines, but not inside
// /regex/ addresses, s/// and y/// arguments or a/i/c text
function splitSedCommands(script) {
    const commands = [];
    let cur = '';
    let i = 0;
    const takeDelimited = (delim) => {
        while (i < script.length && script[i] !== delim) {
            if (script[i] === '\\') cur += script[i++];
            cur += script[i++] ?? '';
        }
        cur += script[i++] ?? '';
    };
    while (i < script.length) {
        const ch = script[i];
        if (ch === ';' || ch === '\n') {
            commands.push(cur);
            cur = '';
            i++;
            continue;
        }
        if (ch === '/') { cur += ch; i++; takeDelimited('/'); continue; }
        if ((ch === 's' || ch === 'y') && script[i + 1] && !/[\s;\w]/.test(script[i + 1])) {
            const delim = script[i + 1];
            cur += ch + delim;
            i += 2;
            takeDelimited(delim);
            takeDelimited(delim);
            continue;
        }
        if ('aic'.includes(ch) && /^[\s\\]/.test(script[i + 1] ?? '')) {
            while (i < script.length && script[i] !== '\n') cur += script[i++];
            continue;
        }
        cur += ch;
        i++;
    }
    commands.push(cur);
    return commands;
}

// sed scripts keep commands and flags: s/…/…/g, /…/d, …,…p, …i …
function maskSed(script) {
    const addr = String.raw`(?:\d+|\$|\/(?:\\.|[^/\\])*\/)`;
    const re = new RegExp(String.raw`^(\s*)(${addr}(?:,${addr})?)?(\s*!?\s*)([\s\S]*)$`);
    const maskAddr = (a) => (a || '').replace(/\/(\\.|[^/\\])*\//g, `/${HIDDEN}/`).replace(/\d+/g, HIDDEN);
    const commands = splitSedCommands(script).map(cmd => {
        const [, lead, address, bang, rest] = cmd.match(re);
        let body = rest;
        const sub = rest.match(/^([sy])(.)((?:\\.|(?!\2).)*)\2((?:\\.|(?!\2).)*)\2(.*)$/);
        if (sub) body = `${sub[1]}${sub[2]}${HIDDEN}${sub[2]}${HIDDEN}${sub[2]}${sub[5]}`;
        else if (/^[aic]\b|^[aic]\\/.test(rest)) body = `${rest[0]} ${HIDDEN}`;
        return lead + maskAddr(address) + bang + body;
    });
    return `'${commands.join(';')}'`;
}

const wordText = (parts) => parts.map(p => (p.t === 'lit' ? p.s : '$' + p.name)).join('');
// An unquoted wildcard like *.log is the point of the exercise: keep it
const isGlob = (parts) => parts.some(p => p.t === 'lit' && !p.quoted && /[*?]/.test(p.s));

function maskStage(stage) {
    const [cmd, ...args] = stage.words.map(wordText);
    let seenScript = false;
    const masked = args.map((w, i) => {
        if (isGlob(stage.words[i + 1])) return w;
        const prev = args[i - 1];
        const isOptionValue = prev && /^-[A-Za-z]$/.test(prev) && takesValue(cmd, prev[1]);
        const isOperand = !w.startsWith('-') && !isOptionValue;
        // the program / script keeps its structure; later operands are files
        if ((cmd === 'awk' || cmd === 'sed') && isOperand && !seenScript) {
            seenScript = true;
            return cmd === 'awk' ? maskAwk(w) : maskSed(w);
        }
        return maskWord(w);
    });
    const redirects = stage.redirects.map(r => {
        const fd = r.fd === 1 || r.fd === 0 ? '' : r.fd;
        const target = wordText(r.target ?? []);
        // /dev/null and wildcards are part of what the task teaches
        return r.op === '>&' ? `${fd}>&${r.target}` : `${fd}${r.op} ${isGlob(r.target) || target === '/dev/null' ? target : HIDDEN}`;
    });
    return [cmd, ...masked, ...redirects].join(' ');
}

// The command line with values hidden; pipes, ; && || and redirections stay
export function solutionSkeleton(solution) {
    return parseScript(solution)
        .map(({ op, pipeline }) => (op ? (op === ';' ? '; ' : ` ${op} `) : '') + pipeline.stages.map(maskStage).join(' | '))
        .join('');
}

export function solutionCommands(solution) {
    return stagesOf(solution).map(s => s.words[0]);
}

function isSinglePipeline(solution) {
    return parseScript(solution).length === 1;
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
            text: !isSinglePipeline(solution)
                ? `Several commands, in this order: ${cmds.join(', ')}`
                : cmds.length > 1
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
