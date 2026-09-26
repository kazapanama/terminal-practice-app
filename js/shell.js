// A small bash: parses a command line into lists of pipelines and runs them
// against the command implementations and a virtual file system.
//
// Supported: quoting ('...', "...", \, $'...'), $? and $VAR (unset variables
// expand to nothing, with a warning), globs (* ? [...]) over the virtual
// files, pipes, ; && ||, and redirections < > >> 2> 2>> 2>&1 &> >&2.
// Not supported: subshells, command substitution, background jobs,
// heredocs, variable assignment.

const ANSI_C_ESCAPES = { n: '\n', t: '\t', r: '\r', '\\': '\\', "'": "'", '"': '"', a: '\x07', b: '\b', e: '\x1b', f: '\f', v: '\v' };

const UNSUPPORTED = {
    '(': 'subshells "( ... )"',
    ')': 'subshells "( ... )"',
    '`': 'command substitution',
    '&': 'background jobs "&"',
};

function unsupported(what) {
    return new Error(`bash: ${what} is not supported in this trainer`);
}

// ---------------------------------------------------------------------------
// Parsing
// A word is a list of parts: { t: 'lit', s, quoted } or { t: 'var', name }.
// ---------------------------------------------------------------------------

export function parseScript(line) {
    const lists = [];          // [{ op, pipeline }]
    let op = null;             // operator before the current pipeline
    let stages = [];
    let stage = null;
    let parts = [];
    let inWord = false;
    let pendingRedirect = null; // { fd, op } waiting for its target word
    let stageStart = 0;
    let pipelineStart = 0;

    const newStage = () => ({ words: [], redirects: [], source: '' });
    stage = newStage();

    const addLit = (s, quoted) => {
        const last = parts[parts.length - 1];
        if (last && last.t === 'lit' && last.quoted === quoted) last.s += s;
        else parts.push({ t: 'lit', s, quoted });
        inWord = true;
    };
    const endWord = () => {
        if (!inWord) return;
        const word = parts;
        parts = [];
        inWord = false;
        if (pendingRedirect) {
            stage.redirects.push({ ...pendingRedirect, target: word });
            pendingRedirect = null;
        } else {
            stage.words.push(word);
        }
    };
    const syntax = (token) => new Error(`bash: syntax error near unexpected token \`${token}'`);
    const endStage = (i, token) => {
        endWord();
        if (pendingRedirect) throw syntax(token);
        stage.source = line.slice(stageStart, i).trim();
        if (stage.words.length === 0 && stage.redirects.length === 0) throw syntax(token);
        stages.push(stage);
        stage = newStage();
        stageStart = i + token.length;
    };
    const endPipeline = (i, token) => {
        endStage(i, token);
        lists.push({ op, pipeline: { stages, source: line.slice(pipelineStart, i).trim() } });
        stages = [];
        pipelineStart = i + token.length;
    };
    const readVar = (i) => {
        // line[i] === '$'; returns [part, next index] or null for a literal $
        const rest = line.slice(i + 1);
        const m = rest.match(/^(\{[^}]*\}|[A-Za-z_]\w*|[0-9]|[?#@*$!-])/);
        if (!m) return null;
        const name = m[1].startsWith('{') ? m[1].slice(1, -1) : m[1];
        return [{ t: 'var', name }, i + 1 + m[1].length];
    };

    let i = 0;
    while (i < line.length) {
        const ch = line[i];

        if (ch === "'") {
            const close = line.indexOf("'", i + 1);
            if (close === -1) throw new Error(`bash: unexpected EOF while looking for matching \`''`);
            addLit(line.slice(i + 1, close), true);
            i = close + 1;
            continue;
        }

        if (ch === '"') {
            let j = i + 1;
            let closed = false;
            addLit('', true); // "" is an (empty) argument of its own
            while (j < line.length) {
                const c = line[j];
                if (c === '"') { closed = true; break; }
                if (c === '\\' && j + 1 < line.length && '$`"\\\n'.includes(line[j + 1])) {
                    if (line[j + 1] !== '\n') addLit(line[j + 1], true);
                    j += 2;
                    continue;
                }
                if (c === '$') {
                    if (line[j + 1] === '(') throw unsupported('command substitution "$(...)"');
                    const v = readVar(j);
                    if (v) { parts.push({ ...v[0], quoted: true }); j = v[1]; continue; }
                }
                if (c === '`') throw unsupported('command substitution');
                addLit(c, true);
                j++;
            }
            if (!closed) throw new Error('bash: unexpected EOF while looking for matching `"\'');
            i = j + 1;
            continue;
        }

        if (ch === '\\') {
            if (i + 1 < line.length && line[i + 1] !== '\n') addLit(line[i + 1], true);
            i += 2;
            continue;
        }

        if (ch === '$') {
            if (line[i + 1] === "'") {
                let j = i + 2;
                let s = '';
                let closed = false;
                while (j < line.length) {
                    if (line[j] === "'") { closed = true; break; }
                    if (line[j] === '\\' && j + 1 < line.length) {
                        s += ANSI_C_ESCAPES[line[j + 1]] ?? '\\' + line[j + 1];
                        j += 2;
                        continue;
                    }
                    s += line[j++];
                }
                if (!closed) throw new Error(`bash: unexpected EOF while looking for matching \`''`);
                addLit(s, true);
                i = j + 1;
                continue;
            }
            if (line[i + 1] === '(') throw unsupported('command substitution "$(...)"');
            const v = readVar(i);
            if (v) {
                parts.push({ ...v[0], quoted: false });
                inWord = true;
                i = v[1];
                continue;
            }
            addLit('$', false);
            i++;
            continue;
        }

        if (ch === ' ' || ch === '\t') { endWord(); i++; continue; }
        if (ch === '#' && !inWord) break;

        if (ch === '\n' || ch === ';') {
            if (line[i + 1] === ';') throw syntax(';;');
            endWord();
            if (stage.words.length === 0 && stage.redirects.length === 0 && stages.length === 0 && !pendingRedirect) {
                // "; ls" is an error, an empty line is not
                if (ch === ';') throw syntax(';');
                i++;
                pipelineStart = stageStart = i;
                continue;
            }
            endPipeline(i, ch);
            op = ';';
            i++;
            continue;
        }

        if (ch === '|' || ch === '&') {
            const two = line.slice(i, i + 2);
            if (two === '||' || two === '&&') {
                endPipeline(i, two);
                op = two;
                i += 2;
                continue;
            }
            if (two === '|&') throw unsupported('"|&"');
            if (ch === '|') {
                endStage(i, '|');
                i++;
                continue;
            }
            if (two === '&>') {
                endWord();
                const append = line[i + 2] === '>';
                pendingRedirect = { fd: '&', op: append ? '>>' : '>' };
                i += append ? 3 : 2;
                continue;
            }
            throw unsupported(UNSUPPORTED['&']);
        }

        if (ch === '>' || ch === '<') {
            // A word made only of digits right before > is a file descriptor
            let fd = ch === '>' ? 1 : 0;
            if (inWord && parts.length === 1 && parts[0].t === 'lit' && !parts[0].quoted && /^\d$/.test(parts[0].s)) {
                fd = Number(parts[0].s);
                parts = [];
                inWord = false;
            } else {
                endWord();
            }
            if (pendingRedirect) throw syntax(ch);
            if (ch === '<') {
                if (line[i + 1] === '<') throw unsupported('here-documents and here-strings (<<, <<<)');
                if (line[i + 1] === '(') throw unsupported('process substitution "<(...)"');
                pendingRedirect = { fd, op: '<' };
                i++;
                continue;
            }
            if (line[i + 1] === '>') { pendingRedirect = { fd, op: '>>' }; i += 2; continue; }
            if (line[i + 1] === '&') {
                const m = line.slice(i + 2).match(/^\d/);
                if (!m) throw syntax('>&');
                stage.redirects.push({ fd, op: '>&', target: Number(m[0]) });
                i += 3;
                continue;
            }
            if (line[i + 1] === '(') throw unsupported('process substitution ">(...)"');
            pendingRedirect = { fd, op: '>' };
            i++;
            continue;
        }

        if (ch in UNSUPPORTED) throw unsupported(UNSUPPORTED[ch]);

        addLit(ch, false);
        i++;
    }

    endWord();
    if (pendingRedirect) throw syntax('newline');
    if (stage.words.length || stage.redirects.length) {
        stage.source = line.slice(stageStart).trim();
        stages.push(stage);
    } else if (stages.length || (op && op !== ';')) {
        throw syntax(stages.length ? '|' : op);
    }
    if (stages.length) lists.push({ op, pipeline: { stages, source: line.slice(pipelineStart).trim() } });
    return lists;
}

// Plain-text view of the words of each pipeline stage (no expansion);
// used for hints and to know which commands a solution uses.
export function stagesOf(line) {
    return parseScript(line).flatMap(({ pipeline }) => pipeline.stages.map(s => ({
        source: s.source,
        words: s.words.map(w => w.map(p => (p.t === 'lit' ? p.s : '')).join(''))
    })));
}

// ---------------------------------------------------------------------------
// Expansion
// ---------------------------------------------------------------------------

function globToRegex(parts) {
    let re = '';
    let hasGlob = false;
    for (const p of parts) {
        if (p.t !== 'lit') continue;
        const s = p.s;
        for (let i = 0; i < s.length; i++) {
            const c = s[i];
            if (p.quoted) { re += c.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&'); continue; }
            if (c === '*') { re += '[^/]*'; hasGlob = true; continue; }
            if (c === '?') { re += '[^/]'; hasGlob = true; continue; }
            if (c === '[') {
                const close = s.indexOf(']', i + 2);
                if (close !== -1) {
                    let body = s.slice(i + 1, close);
                    if (body.startsWith('!')) body = '^' + body.slice(1);
                    re += '[' + body.replace(/\\/g, '\\\\') + ']';
                    hasGlob = true;
                    i = close;
                    continue;
                }
            }
            re += c.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
        }
    }
    return hasGlob ? new RegExp('^' + re + '$') : null;
}

function expandWord(parts, ctx) {
    let text = '';
    let onlyUnquotedEmptyVars = true;
    const expanded = [];
    for (const p of parts) {
        if (p.t === 'lit') {
            text += p.s;
            onlyUnquotedEmptyVars = false;
            expanded.push(p);
            continue;
        }
        let value;
        if (p.name === '?') value = String(ctx.status);
        else if (p.name === '#') value = '0';
        else {
            value = '';
            ctx.warn(`bash: $${p.name} is not set, so the shell replaced it with nothing` +
                (p.quoted ? ' — inside double quotes the shell still expands $. Use single quotes, e.g. awk \'{print $1}\'' : ''));
        }
        text += value;
        if (value !== '' || p.quoted) onlyUnquotedEmptyVars = false;
        expanded.push({ t: 'lit', s: value, quoted: true });
    }
    if (onlyUnquotedEmptyVars) return [];

    const glob = globToRegex(expanded);
    if (glob) {
        const matches = ctx.fs.allPaths().filter(path => glob.test(path) && !/(^|\/)\./.test(path));
        if (matches.length) return matches;
        ctx.warnGlob(text);
    }
    return [text];
}

// ---------------------------------------------------------------------------
// Execution
// ---------------------------------------------------------------------------

// Runs a command line. `commands` maps names to (args, io) => stdout.
// Returns { stdout, stderr: [lines], status, steps, warnings }.
export function runScript(line, { commands, fs, stdin = '', status: initialStatus = 0 }) {
    const warnings = [];
    const warn = (msg) => { if (!warnings.includes(msg)) warnings.push(msg); };
    const lists = parseScript(line);

    const stdinState = { text: stdin, used: false };
    const ctx = {
        fs,
        status: initialStatus,
        warn,
        warnGlob: () => {}
    };
    let warnedGlob = false;
    ctx.warnGlob = (word) => {
        if (warnedGlob) return;
        warnedGlob = true;
        warn(`bash: note: "${word}" contains a wildcard (* ? [ ]) but matched no file, so it was passed on unchanged. Quote patterns: '...'`);
    };

    let stdout = '';
    const stderr = [];
    const steps = [];

    const runStage = (stageNode, input) => {
        const words = stageNode.words.flatMap(w => expandWord(w, ctx));
        const errLines = [];
        const errPos = [];   // stdout offset at which each error was written
        const pushErr = (msg, pos = 0) => { errLines.push(msg); errPos.push(pos); };
        let status = 0;
        let out = '';
        let stdinText = input;

        // Redirections (processed left to right before the command runs)
        const outTargets = [];   // { fd, path, append }
        let errToOut = false;
        let outToErr = false;
        for (const r of stageNode.redirects) {
            if (r.op === '>&') {
                if (r.fd === 2 && r.target === 1) errToOut = true;
                else if (r.fd === 1 && r.target === 2) outToErr = true;
                else throw unsupported(`the redirection ${r.fd}>&${r.target}`);
                continue;
            }
            const targets = expandWord(r.target, ctx);
            if (targets.length !== 1) {
                return { out: '', errLines: [`bash: ${r.target.map(p => p.s ?? '').join('')}: ambiguous redirect`], status: 1 };
            }
            const path = targets[0];
            if (r.op === '<') {
                try {
                    stdinText = fs.read(path);
                } catch (e) {
                    return { out: '', errLines: [`bash: ${path}: ${e.code === 'EISDIR' ? 'Is a directory' : 'No such file or directory'}`], status: 1 };
                }
                continue;
            }
            // > truncates the file before the command even starts
            try {
                if (r.op === '>') fs.write(path, '');
                else fs.write(path, '', true);
            } catch (e) {
                return { out: '', errLines: [`bash: ${path}: ${e.code === 'EISDIR' ? 'Is a directory' : 'No such file or directory'}`], status: 1 };
            }
            if (r.fd === '&') {
                outTargets.push({ fd: 1, path, append: true });
                outTargets.push({ fd: 2, path, append: true });
            } else {
                outTargets.push({ fd: r.fd, path, append: true });
            }
        }

        if (words.length) {
            const [cmd, ...args] = words;
            let stdinUsed = false;
            const io = {
                stdin: () => {
                    if (stdinUsed) return '';
                    stdinUsed = true;
                    if (stdinText !== null) return stdinText;
                    if (stdinState.used) return '';
                    stdinState.used = true;
                    return stdinState.text;
                },
                readFile: (path) => fs.read(path),
                writeFile: (path, text, append) => fs.write(path, text, append),
                isDir: (path) => fs.isDir(path),
                exists: (path) => fs.exists(path),
                list: (path) => fs.list(path),
                walk: (path) => fs.walk(path),
                noFiles: fs.files.size === 0,
                warn,
                error: (msg, pos) => pushErr(msg, pos),
                setStatus: (n) => { status = n; },
                exec: (cmdLine, input) => {
                    const r = runScript(cmdLine, { commands, fs, stdin: input });
                    r.stderr.forEach(l => pushErr(l));
                    return r.stdout;
                }
            };
            if (!Object.prototype.hasOwnProperty.call(commands, cmd)) {
                pushErr(`bash: ${cmd}: command not found (this trainer knows: ${Object.keys(commands).join(', ')})`);
                status = 127;
            } else {
                try {
                    out = commands[cmd](args, io);
                } catch (e) {
                    pushErr(e.message);
                    status = e.status ?? (status || 1);
                    out = '';
                }
            }
        }

        // Route stdout / stderr
        let routedOut = out;
        let routedErr = errLines.map(l => l + '\n').join('');
        if (errToOut) {
            // Buffered commands (most) show errors before their output; commands
            // that write as they go (cat) pass the output offset of each error
            let merged = '';
            let at = 0;
            errLines.forEach((line, k) => {
                const pos = Math.min(errPos[k], out.length);
                merged += out.slice(at, Math.max(at, pos)) + line + '\n';
                at = Math.max(at, pos);
            });
            routedOut = merged + out.slice(at);
            routedErr = '';
        }
        if (outToErr) { routedErr += routedOut; routedOut = ''; }
        const outFile = [...outTargets].reverse().find(t => t.fd === 1);
        const errFile = [...outTargets].reverse().find(t => t.fd === 2);
        if (outFile) { fs.write(outFile.path, routedOut, true); routedOut = ''; }
        if (errFile) { fs.write(errFile.path, routedErr, true); routedErr = ''; }
        return {
            out: routedOut,
            errLines: routedErr === '' ? [] : routedErr.replace(/\n$/, '').split('\n'),
            status,
            redirectedTo: outFile ? outFile.path : null
        };
    };

    for (const { op, pipeline } of lists) {
        if (op === '&&' && ctx.status !== 0) continue;
        if (op === '||' && ctx.status === 0) continue;
        let input = null;   // null = the shared stdin
        let result;
        pipeline.stages.forEach((st, k) => {
            result = runStage(st, input);
            stderr.push(...result.errLines);
            steps.push({
                command: st.source,
                output: result.out.endsWith('\n') ? result.out.slice(0, -1) : result.out,
                redirectedTo: result.redirectedTo,
                failed: result.errLines.length > 0 && result.status !== 0,
                last: k === pipeline.stages.length - 1
            });
            input = result.out;
        });
        stdout += result.out;
        ctx.status = result.status;
    }

    return { stdout, stderr, status: ctx.status, steps, warnings };
}
