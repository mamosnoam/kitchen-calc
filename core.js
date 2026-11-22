// Pure functions only (no DOM) so they can be unit-tested with Node.
// Values are kept as the exact strings typed ('112.5', '12.', '') and
// converted to integer hundredths for maths, so there is no float noise.

export const MINUS = '−';

// One key press on a field. Returns the new value, whether the field is still
// "fresh" (selected, next digit replaces), and a reject reason if the key was refused.
export function pressKey(value, fresh, key, limits) {
  const v = fresh ? '' : value;
  if (key === 'del') {
    return { value: fresh ? '' : v.slice(0, -1), fresh: false, reject: null };
  }
  if (key === '.') {
    if (!limits.maxDec) return { value, fresh, reject: 'dot' };
    if (v === '') return { value: '0.', fresh: false, reject: null };
    if (v.includes('.')) return { value, fresh, reject: 'dot' };
    return { value: v + '.', fresh: false, reject: null };
  }
  if (/^[0-9]$/.test(key)) {
    const next = v === '0' ? key : v + key;
    const [int, dec] = next.split('.');
    if (int.length > limits.maxInt) return { value, fresh, reject: 'int' };
    if (dec !== undefined && dec.length > limits.maxDec) return { value, fresh, reject: 'dec' };
    return { value: next, fresh: false, reject: null };
  }
  return { value, fresh, reject: null };
}

// '12.' -> '12', '0.' -> '0', '' stays ''
export function tidy(value) {
  if (!value) return '';
  return value.endsWith('.') ? value.slice(0, -1) : value;
}

// String -> integer hundredths, or null when empty. Parses digits, never multiplies floats.
export function toH(s) {
  if (s === null || s === undefined) return null;
  s = String(s).trim();
  if (s === '' || s === '.' || !/^\d*(\.\d*)?$/.test(s)) return null;
  const [int = '', dec = ''] = s.split('.');
  return (int === '' ? 0 : parseInt(int, 10)) * 100 + parseInt((dec + '00').slice(0, 2), 10);
}

// Integer hundredths -> display string: 11650 -> '116.5', -350 -> '−3.5', null -> '—'
export function fmt(h) {
  if (h === null || h === undefined || Number.isNaN(h)) return '—';
  if (h === 0) return '0';
  const a = Math.abs(h);
  let s = String(Math.floor(a / 100));
  const d = a % 100;
  if (d) s += '.' + String(d).padStart(2, '0').replace(/0$/, '');
  return (h < 0 ? MINUS : '') + s;
}

// A typed value shown in formulas/summaries: tidy and drop a lone trailing zero decimal.
export function show(value) {
  const h = toH(tidy(value));
  return h === null ? '' : fmt(h);
}

export function outlet(H, W, Xh, Xw) {
  const h = toH(H), w = toH(W), xh = toH(Xh), xw = toH(Xw);
  const ok = (a, b) => a !== null && b !== null;
  return {
    hPlus: ok(h, xh) ? h + xh : null,
    hMinus: ok(h, xh) ? h - xh : null,
    wPlus: ok(w, xw) ? w + xw : null,
    wMinus: ok(w, xw) ? w - xw : null,
  };
}

// (front - handle) / 2, exact in hundredths (half-up only if inputs had 2 decimals)
export function handles(handle, front) {
  const hd = toH(handle), f = toH(front);
  if (hd === null || f === null) return { margin: null, error: null };
  const d = f - hd;
  if (d < 0) return { margin: null, error: 'handleLonger' };
  return { margin: Math.round(d / 2), error: null };
}

// one side: L + X ; both sides: L + X + X
export function cornice(len, x, tab) {
  const L = toH(len), X = toH(x);
  if (L === null || X === null) return null;
  return tab === 'two' ? L + 2 * X : L + X;
}

// Approximate width in em of a number string (for auto-fitting font size)
export function emWidth(text) {
  let w = 0;
  for (const ch of String(text)) {
    if (ch >= '0' && ch <= '9') w += 0.62;
    else if (ch === '.') w += 0.32;
    else if (ch === '—') w += 1.0;
    else if (ch === ' ') w += 0.3;
    else w += 0.62;
  }
  return Math.max(w, 1.24);
}

// A value allowed in storage: '' or digits with an optional single decimal part within limits
export function isStoredValue(s, limits) {
  if (typeof s !== 'string') return false;
  if (s === '') return true;
  const re = new RegExp('^\\d{1,' + limits.maxInt + '}(\\.\\d{0,' + limits.maxDec + '})?$');
  return re.test(s);
}
