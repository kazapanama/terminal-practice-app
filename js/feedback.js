// Explains why an output does not match the expected one: a line diff plus
// a few targeted observations ("right lines, wrong order", ...).

function splitLines(text) {
    return text === '' ? [] : text.split('\n');
}

// Longest-common-subsequence line diff.
// Returns [{ type: 'same' | 'extra' | 'missing', text }] in display order;
// 'extra' lines are only in the actual output, 'missing' only in the expected.
export function diffLines(actualText, expectedText) {
    const a = splitLines(actualText);
    const b = splitLines(expectedText);
    if (a.length * b.length > 250000) {
        return [
            ...a.map(text => ({ type: b.includes(text) ? 'same' : 'extra', text })),
            ...b.filter(text => !a.includes(text)).map(text => ({ type: 'missing', text }))
        ];
    }
    const n = a.length, m = b.length;
    const lcs = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
    for (let i = n - 1; i >= 0; i--) {
        for (let j = m - 1; j >= 0; j--) {
            lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
        }
    }
    const out = [];
    let i = 0, j = 0;
    while (i < n && j < m) {
        if (a[i] === b[j]) { out.push({ type: 'same', text: a[i] }); i++; j++; }
        else if (lcs[i + 1][j] >= lcs[i][j + 1]) out.push({ type: 'extra', text: a[i++] });
        else out.push({ type: 'missing', text: b[j++] });
    }
    while (i < n) out.push({ type: 'extra', text: a[i++] });
    while (j < m) out.push({ type: 'missing', text: b[j++] });
    return out;
}

const sortedKey = (lines) => [...lines].sort().join('\n');
const squash = (s) => s.replace(/[ \t]+/g, ' ').replace(/^ | $/gm, '');

// Returns { summary, tips[] } describing how actual differs from expected
export function analyzeMismatch(actual, expected, input) {
    const a = splitLines(actual.trim() === '' ? '' : actual.replace(/\n+$/, ''));
    const b = splitLines(expected.replace(/\n+$/, ''));
    const same = diffLines(a.join('\n'), b.join('\n')).filter(d => d.type === 'same').length;
    const summary = `Expected ${b.length} line${b.length === 1 ? '' : 's'}, got ${a.length}` +
        (a.length ? ` — ${same} of them match.` : '.');

    const tips = [];
    if (a.length === 0) {
        tips.push('Your command printed nothing — the filter may be too strict (check spelling and letter case).');
    } else if (actual.trim() === input.trim()) {
        tips.push('The output is identical to the input — the command did not change anything.');
    } else if (a.length === b.length && sortedKey(a) === sortedKey(b)) {
        tips.push('All the right lines, but in a different order. Does it need sort (maybe -n or -r)?');
    } else if (actual.trim().toLowerCase() === expected.trim().toLowerCase()) {
        tips.push('Only letter case differs.');
    } else if (squash(actual.trim()) === squash(expected.trim())) {
        tips.push('Only spacing differs (spaces or tabs).');
    } else {
        const setA = new Set(a), setB = new Set(b);
        const missing = b.filter(l => !setA.has(l)).length;
        const extra = a.filter(l => !setB.has(l)).length;
        if (extra === 0 && missing > 0) {
            tips.push(`Every line you printed is expected, but ${missing} line${missing === 1 ? ' is' : 's are'} missing — the filter is too strict.`);
        } else if (missing === 0 && extra > 0) {
            tips.push(`All expected lines are there plus ${extra} extra — filter a bit more.`);
        } else if (a.length === b.length) {
            tips.push('The number of lines is right, but their content differs — check fields, delimiters or the transformation.');
        }
        if (new Set(a).size < a.length && new Set(b).size === b.length) {
            tips.push('Your output has duplicate lines; the expected one does not.');
        }
    }
    return { summary, tips };
}
