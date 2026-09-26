// C-style printf formatting (used by awk printf/sprintf and the shell's
// printf-like needs). Floating point conversions use the exact decimal value
// of the double and round half to even, exactly like glibc.

// Exact decimal expansion of a finite, non-negative double:
// returns { digits: BigInt, scale } with value = digits / 10^scale.
function exactDecimal(x) {
    const view = new DataView(new ArrayBuffer(8));
    view.setFloat64(0, x);
    const hi = view.getUint32(0), lo = view.getUint32(4);
    const exp = (hi >>> 20) & 0x7ff;
    let mant = (BigInt(hi & 0xfffff) << 32n) | BigInt(lo);
    let e;
    if (exp === 0) {
        e = -1074;
    } else {
        mant |= 1n << 52n;
        e = exp - 1075;
    }
    if (e >= 0) return { digits: mant << BigInt(e), scale: 0 };
    return { digits: mant * 5n ** BigInt(-e), scale: -e };
}

// n / 10^k rounded half to even (n >= 0, k >= 0)
function divRoundEven(n, k) {
    if (k <= 0) return n * 10n ** BigInt(-k);
    const d = 10n ** BigInt(k);
    const q = n / d, r = n % d;
    const twice = r * 2n;
    if (twice > d || (twice === d && q % 2n === 1n)) return q + 1n;
    return q;
}

// %.{prec}f of |x|
export function fixedDigits(x, prec) {
    const { digits, scale } = exactDecimal(Math.abs(x));
    const r = divRoundEven(digits, scale - prec).toString().padStart(prec + 1, '0');
    return prec === 0 ? r : r.slice(0, -prec) + '.' + r.slice(-prec);
}

// Mantissa digits and exponent for %.{prec}e of |x|
function expParts(x, prec) {
    if (x === 0) return { mant: '0'.repeat(prec + 1), exp: 0 };
    const { digits, scale } = exactDecimal(Math.abs(x));
    const s = digits.toString();
    let exp = s.length - 1 - scale;
    let r = divRoundEven(digits, s.length - (prec + 1)).toString();
    if (r.length > prec + 1) { r = r.slice(0, prec + 1); exp++; }
    return { mant: r, exp };
}

function expString(x, prec, upper, alt) {
    const { mant, exp } = expParts(x, prec);
    let m = mant[0];
    if (prec > 0 || alt) m += '.' + mant.slice(1);
    const e = (exp < 0 ? '-' : '+') + String(Math.abs(exp)).padStart(2, '0');
    return m + (upper ? 'E' : 'e') + e;
}

function gString(x, prec, upper, alt) {
    const p = prec === 0 ? 1 : prec;
    const exp = x === 0 ? 0 : expParts(x, p - 1).exp;
    let s;
    if (p > exp && exp >= -4) s = fixedDigits(x, p - 1 - exp);
    else s = expString(x, p - 1, upper, alt);
    if (!alt) {
        s = s.replace(/(\.\d*?)0+(?=$|[eE])/, '$1').replace(/\.(?=$|[eE])/, '');
    }
    return s;
}

function nonFinite(x, upper) {
    const s = Number.isNaN(x) ? 'nan' : 'inf';
    return upper ? s.toUpperCase() : s;
}

function pad(body, sign, flags, width, numeric) {
    const len = sign.length + body.length;
    if (width <= len) return sign + body;
    if (flags.includes('-')) return sign + body + ' '.repeat(width - len);
    if (numeric && flags.includes('0')) return sign + '0'.repeat(width - len) + body;
    return ' '.repeat(width - len) + sign + body;
}

// %g of a number with the given precision (awk's OFMT/CONVFMT default %.6g)
export function formatG(x, prec = 6) {
    if (!isFinite(x)) return (x < 0 ? '-' : '') + nonFinite(x, false);
    return (x < 0 || Object.is(x, -0) ? '-' : '') + gString(Math.abs(x), prec, false, false);
}

// sprintf(fmt, args) — `num(v)` and `str(v)` convert argument values,
// `isNum(v)` tells whether %c should treat a value as a character code.
export function sprintf(fmt, args, { num = Number, str = String, isNum = (v) => typeof v === 'number' } = {}) {
    let out = '';
    let argi = 0;
    const next = () => args[argi++];
    for (let i = 0; i < fmt.length; i++) {
        const ch = fmt[i];
        if (ch !== '%') { out += ch; continue; }
        const m = fmt.slice(i).match(/^%([-+ #0]*)(\*|\d+)?(?:\.(\*|\d*))?([diouxXcseEfFgG%])/);
        if (!m) { out += ch; continue; }
        i += m[0].length - 1;
        let [, flags, width, precision, conv] = m;
        if (conv === '%') { out += '%'; continue; }
        width = width === '*' ? Math.trunc(num(next())) : width ? Number(width) : 0;
        if (width < 0) { flags += '-'; width = -width; }
        let prec = precision === undefined ? null : precision === '*' ? Math.trunc(num(next())) : Number(precision || 0);
        if (prec !== null && prec < 0) prec = null;
        const arg = next();

        if (conv === 's') {
            let s = arg === undefined ? '' : str(arg);
            if (prec !== null) s = s.slice(0, prec);
            out += pad(s, '', flags.replace('0', ''), width, false);
            continue;
        }
        if (conv === 'c') {
            let s;
            if (arg === undefined) s = '';
            else if (isNum(arg)) s = String.fromCodePoint(Math.trunc(num(arg)) & 0x1fffff);
            else s = str(arg).slice(0, 1);
            out += pad(s, '', flags.replace('0', ''), width, false);
            continue;
        }

        const x = arg === undefined ? 0 : num(arg);
        const neg = x < 0 || Object.is(x, -0);
        const sign = neg ? '-' : flags.includes('+') ? '+' : flags.includes(' ') ? ' ' : '';
        const upper = conv === conv.toUpperCase() && conv !== 'd' && conv !== 'i';

        if (!isFinite(x)) {
            out += pad(nonFinite(x, upper), Number.isNaN(x) ? (flags.includes('+') ? '+' : '') : sign, flags.replace('0', ''), width, false);
            continue;
        }

        let body;
        if (conv === 'd' || conv === 'i') {
            const t = Math.trunc(x);
            body = BigInt(Math.abs(t)).toString();
            if (prec !== null) body = prec === 0 && body === '0' ? '' : body.padStart(prec, '0');
            const intSign = t < 0 ? '-' : flags.includes('+') ? '+' : flags.includes(' ') ? ' ' : '';
            out += pad(body, intSign, prec !== null ? flags.replace('0', '') : flags, width, true);
            continue;
        }
        if ('ouxX'.includes(conv)) {
            const v = BigInt.asUintN(64, BigInt(Math.trunc(x)));
            body = conv === 'o' ? v.toString(8) : conv === 'u' ? v.toString() : v.toString(16);
            if (conv === 'X') body = body.toUpperCase();
            if (prec !== null) body = prec === 0 && v === 0n ? '' : body.padStart(prec, '0');
            if (flags.includes('#') && v !== 0n) {
                if (conv === 'o' && !body.startsWith('0')) body = '0' + body;
                if (conv === 'x') body = '0x' + body;
                if (conv === 'X') body = '0X' + body;
            }
            out += pad(body, '', prec !== null ? flags.replace('0', '') : flags, width, true);
            continue;
        }
        const p = prec === null ? 6 : prec;
        const ax = Math.abs(x);
        if (conv === 'f' || conv === 'F') {
            body = fixedDigits(ax, p);
            if (p === 0 && flags.includes('#')) body += '.';
        } else if (conv === 'e' || conv === 'E') {
            body = expString(ax, p, conv === 'E', flags.includes('#'));
        } else {
            body = gString(ax, p, conv === 'G', flags.includes('#'));
        }
        out += pad(body, sign, flags, width, true);
    }
    return out;
}
