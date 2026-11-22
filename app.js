import { CONFIG } from './config.js';
import { pressKey, tidy, toH, fmt, show, outlet, handles, cornice, emWidth, isStoredValue } from './core.js';

const LIMITS = { maxInt: CONFIG.maxInt, maxDec: CONFIG.maxDec };
const XMAX_H = toH(CONFIG.xMax);
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const lri = (s) => '⁦' + s + '⁩'; // keep numbers left-to-right inside Hebrew plain text

// ---------- Screens and fields ----------
const SCREENS = {
  single: { kind: 'outlet', title: 'שקע בודד', short: 'בודד', icon: 'i-out1' },
  double: { kind: 'outlet', title: 'שקע כפול', short: 'כפול', icon: 'i-out2' },
  triple: { kind: 'outlet', title: 'שקע משולש', short: 'משולש', icon: 'i-out3' },
  handles: { kind: 'handles', title: 'ידיות', short: 'ידיות', icon: 'i-handle' },
  cornice: { kind: 'cornice', title: 'קרניז <bdi dir="ltr">K11/K10</bdi>', short: 'קרניז <small class="num">K11/K10</small>', icon: 'i-cornice', label: 'קרניז K11/K10' },
};
const isScreen = (name) => Object.prototype.hasOwnProperty.call(SCREENS, name);
const PAGES = ['settings', 'install', 'share', 'accessibility', 'privacy', 'terms'];
const LINKABLE = ['accessibility', 'privacy', 'terms']; // pages that may be opened straight from a link
const APP_NAME = 'מחשבון מטבח';
const FIELD_NAME = { h: 'גובה', w: 'רוחב', handle: 'מידת הידית', front: 'מידת החזית', len: 'אורך הארון' };
const X_NAME = { xh: 'X לגובה', xw: 'X לרוחב', x: 'X לקרניז' };
const TAB_NAME = { one: 'בולט צד אחד', two: 'בולט שני צדדים' };
const SHARE_TEXT = 'מחשבון מידות למתקיני מטבחים – שקעים, ידיות וקרניז. עובד גם בלי קליטה. פתחו את הקישור ב-Safari או ב-Chrome והוסיפו למסך הבית:';

// ---------- Saved data ----------
const STORE_KEY = 'kitchenCalc:' + new URL('./', location.href).pathname + ':v1';
let storeReadOnly = false;

function freshState() {
  return {
    v: 1,
    x: {},
    inputs: {
      single: { h: '', w: '' }, double: { h: '', w: '' }, triple: { h: '', w: '' },
      handles: { handle: '', front: '' }, cornice: { len: '' },
    },
    corniceTab: 'one',
    installCardHidden: false,
    keepAwake: true,
    theme: 'auto',       // auto | mint | night
    resOrder: 'plus',    // plus | minus  (which result is on top)
    dimOrder: 'hw',      // hw | wh       (height or width first)
    textSize: 'n',       // n | l | xl    (accessibility menu)
    contrast: false,     // high contrast (accessibility menu)
  };
}

function load() {
  const s = freshState();
  let d = null;
  try { d = JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch { d = null; }
  if (!d || typeof d !== 'object') return s;
  if (typeof d.v === 'number' && d.v > 1) storeReadOnly = true; // saved by a newer version: never overwrite it
  if (d.x && typeof d.x === 'object') {
    for (const k of Object.keys(CONFIG.xDefaults)) {
      const v = d.x[k];
      if (typeof v === 'string' && v !== '' && isStoredValue(v, LIMITS) && toH(v) <= XMAX_H) {
        const t = tidy(v);
        if (t !== (CONFIG.xDefaults[k] || '')) s.x[k] = t;
      }
    }
  }
  if (d.inputs && typeof d.inputs === 'object') {
    for (const scr of Object.keys(s.inputs)) {
      const src = d.inputs[scr];
      if (!src || typeof src !== 'object') continue;
      for (const f of Object.keys(s.inputs[scr])) if (isStoredValue(src[f], LIMITS)) s.inputs[scr][f] = src[f];
    }
  }
  if (d.corniceTab === 'one' || d.corniceTab === 'two') s.corniceTab = d.corniceTab;
  if (typeof d.installCardHidden === 'boolean') s.installCardHidden = d.installCardHidden;
  if (typeof d.keepAwake === 'boolean') s.keepAwake = d.keepAwake;
  if (['auto', 'mint', 'night'].includes(d.theme)) s.theme = d.theme;
  if (['plus', 'minus'].includes(d.resOrder)) s.resOrder = d.resOrder;
  if (['hw', 'wh'].includes(d.dimOrder)) s.dimOrder = d.dimOrder;
  if (['n', 'l', 'xl'].includes(d.textSize)) s.textSize = d.textSize;
  if (typeof d.contrast === 'boolean') s.contrast = d.contrast;
  return s;
}

function save() {
  if (storeReadOnly) return;
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch { /* private mode or full: keep working in memory */ }
}

let state = load();

// ---------- UI state (memory only) ----------
const ui = {
  route: '', active: null, fresh: false, before: '', keypad: false,
  sheet: false, xActive: null, xFresh: false, xDraft: {}, xOrigin: {},
  inAppNav: false, shieldUntil: 0, msgTimer: 0,
  forward: false, focusBack: {}, booted: false,
};
const els = {};
const kind = () => (isScreen(ui.route) ? SCREENS[ui.route].kind : null);
const inputs = () => state.inputs[ui.route];
const xKeyOf = (f) => (ui.route === 'cornice' ? 'cornice' : ui.route + '.' + (f === 'xh' ? 'h' : 'w'));
const xDefault = (key) => CONFIG.xDefaults[key] || '';
const xStored = (key) => (key in state.x ? state.x[key] : xDefault(key));
const xCurrent = (f) => (ui.sheet && f in ui.xDraft ? ui.xDraft[f] : xStored(xKeyOf(f)));
const plain = (html) => html.replace(/<[^>]+>/g, '');
const shield = () => { ui.shieldUntil = performance.now() + 400; };
const shielded = () => performance.now() < ui.shieldUntil;

function order() {
  const k = kind();
  if (k === 'outlet') return state.dimOrder === 'wh' ? ['w', 'h'] : ['h', 'w'];
  if (k === 'handles') return ['handle', 'front'];
  return ['len'];
}
function xFields() {
  const k = kind();
  if (k === 'outlet') return state.dimOrder === 'wh' ? ['xw', 'xh'] : ['xh', 'xw'];
  if (k === 'cornice') return ['x'];
  return [];
}

// ---------- Platform ----------
const ua = navigator.userAgent;
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const iOS = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const iOSOther = iOS && /CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
const inApp = /FBAN|FBAV|FB_IAB|Instagram|WhatsApp|Line\/|GSA\/|LinkedInApp|Snapchat|Twitter/.test(ua);
const samsung = /SamsungBrowser/.test(ua);
const android = /Android/.test(ua);
const safariMajor = (() => { const m = ua.match(/Version\/(\d+)/); return m ? parseInt(m[1], 10) : 0; })();
let deferredPrompt = null;

// ---------- Theme ----------
const darkMQ = matchMedia('(prefers-color-scheme: dark)');
function applyTheme() {
  const t = state.theme === 'mint' || state.theme === 'night' ? state.theme : (darkMQ.matches ? 'night' : 'mint');
  document.documentElement.setAttribute('data-theme', t);
  $('#themeColor').setAttribute('content', t === 'night' ? '#0D0F12' : '#F6F7F9');
}
// Accessibility menu: text size and high contrast (both can be switched back at any time)
function applyA11y() {
  const r = document.documentElement;
  if (state.textSize === 'l' || state.textSize === 'xl') r.setAttribute('data-fs', state.textSize); else r.removeAttribute('data-fs');
  if (state.contrast) r.setAttribute('data-contrast', 'high'); else r.removeAttribute('data-contrast');
}

// ---------- Calculator markup (built once per visit, then updated in place) ----------
const inpHTML = (f) => `<button type="button" class="inp" data-f="${f}"><span class="num"><span class="val"></span><span class="caret"></span></span><span class="ph">הקלידו</span></button>`;
const fitHTML = '<span class="fit"><span class="big num"></span></span>';

function outletHTML() {
  const block = (d) => {
    const word = d === 'h' ? 'גובה' : 'רוחב';
    return `<section class="block" data-d="${d}">
      <div class="blk-top"><span class="lbl">${word}</span>${inpHTML(d)}</div>
      <div class="results">
        <div class="res" data-r="${d}Plus"><span class="sg p" aria-hidden="true">+</span><span class="sr">${word} ועוד X:</span>${fitHTML}</div>
        <div class="res" data-r="${d}Minus"><span class="sg m" aria-hidden="true">−</span><span class="sr">${word} פחות X:</span>${fitHTML}</div>
      </div>
      <p class="blk-note" data-note="${d}" hidden></p>
    </section>`;
  };
  return `<div class="calc-body outlet">${block('h')}${block('w')}</div>`;
}
function handlesHTML() {
  return `<div class="calc-body handles"><section class="block">
    <div class="blk-top two"><span class="lbl">ידית</span>${inpHTML('handle')}<span class="lbl">חזית</span>${inpHTML('front')}</div>
    <div class="res one" data-r="margin"><span class="cap">מרווח מכל צד</span>${fitHTML}</div>
    <p class="blk-note err" data-note="margin" hidden><svg aria-hidden="true"><use href="#i-warn"/></svg><span>הידית ארוכה מהחזית – בדקו את המידות</span></p>
  </section></div>`;
}
function corniceHTML() {
  return `<div class="calc-body cornice">
    <p class="note-pill"><svg aria-hidden="true"><use href="#i-warn"/></svg><span>יש לחשב כולל חזית</span></p>
    <div class="seg" role="tablist" aria-label="סוג קרניז"><button type="button" role="tab" data-tab="one">${TAB_NAME.one}</button><button type="button" role="tab" data-tab="two">${TAB_NAME.two}</button></div>
    <section class="block">
      <div class="blk-top"><span class="lbl">אורך הארון</span>${inpHTML('len')}</div>
      <div class="res one" data-r="cornice"><span class="cap">מידת קרניז</span>${fitHTML}</div>
      <p class="blk-note" data-note="x" hidden></p>
    </section>
  </div>`;
}

function padHTML(actLabel, actIcon) {
  const d = (k) => `<button type="button" class="k" data-k="${k}" tabindex="-1">${k}</button>`;
  return [7, 8, 9].map(d).join('')
    + '<button type="button" class="k" data-k="del" tabindex="-1" aria-label="מחיקה"><svg aria-hidden="true"><use href="#i-del"/></svg></button>'
    + [4, 5, 6].map(d).join('')
    + '<button type="button" class="k clr" data-k="clear" tabindex="-1" aria-label="ניקוי">C</button>'
    + [1, 2, 3].map(d).join('')
    + `<button type="button" class="k act" data-k="act" tabindex="-1"><svg aria-hidden="true"><use class="act-i" href="#${actIcon}"/></svg><span class="act-l">${actLabel}</span></button>`
    + d(0)
    + '<button type="button" class="k" data-k="." tabindex="-1" aria-label="נקודה עשרונית">.</button>';
}

// ---------- Rendering ----------
function setRes(key, h, longest) {
  const el = $(`[data-r="${key}"]`, els.body);
  const text = fmt(h);
  $('.big', el).textContent = text;
  el.classList.toggle('is-neg', h !== null && h < 0);
  el.classList.toggle('is-empty', h === null);
  longest.push(text);
}
function note(name, html, cls) {
  const el = $(`[data-note="${name}"]`, els.body);
  if (!el) return;
  el.hidden = !html;
  if (html) { el.innerHTML = html; el.classList.toggle('err', cls === 'err'); }
}
const NOTE_MISSING_X = '<svg aria-hidden="true"><use href="#i-warn"/></svg><span>חסר X · לחצו על ✎ למעלה</span>';
const NOTE_NEGATIVE = '<svg aria-hidden="true"><use href="#i-warn"/></svg><span>המידה קטנה מ-X – בדקו אותה</span>';

function needsX() { return xFields().some((f) => xCurrent(f) === ''); }

function update() {
  if (!kind() || !els.body) return;
  const k = kind();
  els.body.classList.toggle('wh', state.dimOrder === 'wh');
  els.body.classList.toggle('minus-first', state.resOrder === 'minus');
  for (const btn of $$('.inp', els.body)) {
    const f = btn.dataset.f;
    const v = inputs()[f];
    const active = ui.active === f;
    $('.val', btn).textContent = v;
    btn.classList.toggle('is-active', active);
    btn.classList.toggle('is-fresh', active && ui.fresh && v !== '');
    btn.classList.toggle('is-empty', v === '');
    btn.setAttribute('aria-label', `${FIELD_NAME[f]}: ${v || 'ריק'}`);
  }
  const inp = inputs();
  const longest = [];
  if (k === 'outlet') {
    const xh = xCurrent('xh'), xw = xCurrent('xw');
    const r = outlet(inp.h, inp.w, xh, xw);
    setRes('hPlus', r.hPlus, longest); setRes('hMinus', r.hMinus, longest);
    setRes('wPlus', r.wPlus, longest); setRes('wMinus', r.wMinus, longest);
    note('h', xh === '' ? NOTE_MISSING_X : (r.hMinus !== null && r.hMinus < 0 ? NOTE_NEGATIVE : ''), xh === '' ? '' : 'err');
    note('w', xw === '' ? NOTE_MISSING_X : (r.wMinus !== null && r.wMinus < 0 ? NOTE_NEGATIVE : ''), xw === '' ? '' : 'err');
  } else if (k === 'handles') {
    const r = handles(inp.handle, inp.front);
    setRes('margin', r.margin, longest);
    $('[data-note="margin"]', els.body).hidden = r.error !== 'handleLonger';
  } else if (k === 'cornice') {
    const X = xCurrent('x');
    setRes('cornice', cornice(inp.len, X, state.corniceTab), longest);
    for (const t of $$('[data-tab]', els.body)) t.setAttribute('aria-selected', String(t.dataset.tab === state.corniceTab));
    note('x', X === '' ? NOTE_MISSING_X : '');
  }
  els.body.style.setProperty('--w', Math.max(...longest.map(emWidth)).toFixed(2));
  const missing = needsX();
  $('.edot', els.calc).hidden = !missing;
  $('#editXBtn').setAttribute('aria-label', missing ? 'עריכת ערכי X – חסר ערך' : 'עריכת ערכי X');
  // action key: "הבא" while another field follows, otherwise it hides the keypad
  const o = order();
  const i = o.indexOf(ui.active);
  const next = i >= 0 && i < o.length - 1;
  $('.act-l', els.mainPad).textContent = next ? 'הבא' : 'סגירה';
  $('.act-i', els.mainPad).setAttribute('href', next ? '#i-next' : '#i-hide');
}

// ---------- Screen reader: read the results shortly after typing ----------
let liveTimer = 0;
function say(text) {
  clearTimeout(liveTimer);
  const el = $('#live');
  el.textContent = '';
  if (text) liveTimer = setTimeout(() => { el.textContent = text; }, 60);
}
function announceSoon() {
  clearTimeout(liveTimer);
  liveTimer = setTimeout(() => say(resultText()), 900);
}
function resultText() {
  if (!kind() || !els.body) return '';
  let scope = els.body;
  if (kind() === 'outlet') scope = $(`.block[data-d="${ui.active === 'w' ? 'w' : 'h'}"]`, els.body);
  let list = $$('.res', scope);
  if (kind() === 'outlet' && state.resOrder === 'minus') list = list.reverse();
  const parts = list.filter((r) => !r.classList.contains('is-empty'))
    .map((r) => `${($('.sr', r) || $('.cap', r)).textContent.replace(/:$/, '')} ${$('.big', r).textContent}`);
  const notes = $$('.blk-note', scope).filter((n) => !n.hidden).map((n) => n.textContent.trim());
  return parts.concat(notes).join('. ');
}

// ---------- Field logic (the overwrite rule) ----------
function activate(f) {
  if (ui.active && ui.active !== f) commit(ui.active);
  ui.before = inputs()[f]; // Esc goes back to the value at the moment of selection
  ui.active = f;
  ui.fresh = true;         // selected: nothing changes until a key is typed
  update();
  // keyboard and screen reader users: focus follows the field being typed
  const cur = document.activeElement;
  if (cur && cur.classList.contains('inp') && cur.dataset.f !== f) {
    const nb = $(`.inp[data-f="${f}"]`, els.body);
    if (nb) nb.focus({ preventScroll: true });
  }
}

function commit(f) {
  const inp = inputs();
  const t = tidy(inp[f]);
  if (t !== inp[f]) { inp[f] = t; save(); }
}

function openField(f) {
  activate(f);
  if (!ui.keypad) openKeypad();
}

function openKeypad() {
  ui.keypad = true;
  els.calc.classList.add('kp-open');
  hideToast(); // a toast must never cover the keypad
  if (!(history.state && history.state.kp)) history.pushState({ kp: true }, '');
  armIdle();
  update();
}

function closeKeypad({ fromPop = false } = {}) {
  if (!ui.keypad) return;
  if (ui.active) commit(ui.active);
  ui.active = null;
  ui.fresh = false;
  ui.keypad = false;
  els.calc.classList.remove('kp-open');
  showKpMsg('');
  if (!fromPop && history.state && history.state.kp) history.back();
  armIdle();
  update();
}

function showKpMsg(msg) {
  const el = els.kpMsg;
  clearTimeout(ui.msgTimer);
  el.textContent = msg;
  el.hidden = !msg;
  if (msg) { say(msg); ui.msgTimer = setTimeout(() => { el.hidden = true; }, 2000); }
}

function shake(el) {
  if (!el) return;
  el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake');
}

function rejectText(reason) {
  if (reason === 'int') return `אפשר עד ${CONFIG.maxInt} ספרות לפני הנקודה`;
  if (reason === 'dec') return CONFIG.maxDec === 1 ? 'אפשר ספרה אחת אחרי הנקודה' : `אפשר עד ${CONFIG.maxDec} ספרות אחרי הנקודה`;
  return '';
}

function press(k) {
  if (!kind()) return;
  if (ui.sheet) { xPress(k); return; }
  if (!ui.keypad || !ui.active) {
    if (!/^[0-9.]$/.test(k)) return;
    openField(order()[0]);
  }
  if (k === 'act') { action(); return; }
  const f = ui.active;
  if (k === 'clear') { inputs()[f] = ''; save(); ui.fresh = false; update(); announceSoon(); return; }
  const r = pressKey(inputs()[f], ui.fresh, k, LIMITS);
  if (r.reject) {
    if (r.reject !== 'dot') { shake($(`.inp[data-f="${f}"]`, els.body)); showKpMsg(rejectText(r.reject)); }
    return;
  }
  inputs()[f] = r.value;
  save();
  ui.fresh = r.fresh;
  update();
  announceSoon();
}

function action() {
  const o = order();
  const i = o.indexOf(ui.active);
  if (i >= 0 && i < o.length - 1) { activate(o[i + 1]); return; }
  closeKeypad();
}

function cycle(dir) {
  const o = order();
  const i = Math.max(0, o.indexOf(ui.active));
  activate(o[(i + dir + o.length) % o.length]);
}

function escape() {
  if (ui.active) { inputs()[ui.active] = ui.before; save(); }
  closeKeypad();
}

function switchTab(t) {
  if (state.corniceTab === t) return;
  state.corniceTab = t;
  save();
  update();
  flashResult();
  announceSoon();
}

function flashResult() {
  const el = $('.res.one', els.body);
  if (!el) return;
  el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
}

// ---------- X editor (hidden behind ✎) ----------
function setX(key, v) {
  if (v === xDefault(key)) delete state.x[key]; else state.x[key] = v;
  save();
}

function openXSheet() {
  const fs = xFields();
  if (!fs.length || shielded()) return;
  if (ui.keypad) {
    if (ui.active) commit(ui.active);
    ui.active = null; ui.keypad = false;
    els.calc.classList.remove('kp-open');
  }
  ui.sheet = true;
  ui.xDraft = {}; ui.xOrigin = {};
  for (const f of fs) { const v = xStored(xKeyOf(f)); ui.xDraft[f] = v; ui.xOrigin[f] = v; }
  ui.xActive = fs[0];
  ui.xFresh = true;
  if (history.state && history.state.kp) history.replaceState({ sheet: 'x' }, '');
  else history.pushState({ sheet: 'x' }, '');
  hideToast();
  $('#xTitle').textContent = 'ערכי X · ' + plain(SCREENS[ui.route].title);
  $('#xRows').innerHTML = fs.map((f) => `<button type="button" class="xrow" data-x="${f}"><span class="t">${X_NAME[f]}</span><span class="num"><span class="val"></span><span class="caret"></span></span><span class="ph">הקלידו</span></button>`).join('');
  $('#xOverlay').hidden = false;
  $('#app').inert = true; // a real dialog: the screen behind cannot be reached
  renderXSheet();
  update();
  const row = $('#xRows .xrow.is-active');
  if (row) row.focus({ preventScroll: true });
  shield(); // a double tap on ✎ must not land on the dim layer
}

function renderXSheet() {
  for (const row of $$('#xRows .xrow')) {
    const f = row.dataset.x;
    const v = ui.xDraft[f];
    const active = ui.xActive === f;
    const changed = v !== xDefault(xKeyOf(f));
    row.classList.toggle('is-active', active);
    row.classList.toggle('is-fresh', active && ui.xFresh && v !== '');
    row.classList.toggle('is-empty', v === '');
    row.classList.toggle('is-changed', changed);
    $('.val', row).textContent = v;
    row.setAttribute('aria-label', `${X_NAME[f]}: ${v || 'ריק'}${changed ? ' (שונה מהמקור)' : ''}`);
    if (active) row.setAttribute('aria-current', 'true'); else row.removeAttribute('aria-current');
  }
  const resettable = xFields().some((f) => xDefault(xKeyOf(f)) !== '' && tidy(ui.xDraft[f]) !== xDefault(xKeyOf(f)));
  $('#xReset').hidden = !resettable;
}

function xHint(msg) {
  const h = $('#xHint');
  clearTimeout(ui.msgTimer);
  h.classList.toggle('err', !!msg);
  h.textContent = msg || 'נשמר בטלפון עד שמשנים שוב';
  if (msg) { say(msg); ui.msgTimer = setTimeout(() => xHint(''), 2000); }
}

function xPress(k) {
  if (k === 'act') { saveXSheet(); return; }
  const f = ui.xActive;
  if (!f) return;
  if (k === 'clear') { ui.xDraft[f] = ''; ui.xFresh = false; renderXSheet(); update(); return; }
  const r = pressKey(ui.xDraft[f], ui.xFresh, k, LIMITS);
  if (r.reject) {
    if (r.reject !== 'dot') { shake($(`.xrow[data-x="${f}"]`)); xHint(rejectText(r.reject)); }
    return;
  }
  if (r.value !== '' && toH(r.value) > XMAX_H) { shake($(`.xrow[data-x="${f}"]`)); xHint('X גדול מדי – אולי התכוונתם להקליד מידה?'); return; }
  ui.xDraft[f] = r.value;
  ui.xFresh = r.fresh;
  renderXSheet();
  update(); // results behind the sheet follow the draft
}

function selectX(f, focus) {
  ui.xActive = f; ui.xFresh = true; renderXSheet();
  if (focus) { const r = $(`#xRows .xrow[data-x="${f}"]`); if (r) r.focus({ preventScroll: true }); }
}

function resetXDrafts() {
  const hadFocus = document.activeElement === $('#xReset');
  for (const f of xFields()) { const d = xDefault(xKeyOf(f)); if (d !== '') ui.xDraft[f] = d; }
  ui.xFresh = true;
  renderXSheet();
  update();
  if (hadFocus) { const r = $('#xRows .xrow.is-active'); if (r) r.focus({ preventScroll: true }); } // the reset link hides itself
}

// Tab stays inside the X window: cancel, the X rows, reset
function trapTab(e) {
  const items = $$('#xSheet button').filter((b) => !b.closest('#xPad') && !b.hidden);
  if (!items.length) return;
  const i = items.indexOf(document.activeElement);
  const n = e.shiftKey ? (i <= 0 ? items.length - 1 : i - 1) : (i < 0 || i === items.length - 1 ? 0 : i + 1);
  items[n].focus({ preventScroll: true });
}

function saveXSheet() {
  const changes = [];
  for (const f of Object.keys(ui.xDraft)) {
    const key = xKeyOf(f), def = xDefault(key);
    let v = tidy(ui.xDraft[f]);
    if (v === '' && def !== '') v = ui.xOrigin[f] || def; // an X with a default can never be blank
    if (v !== ui.xOrigin[f]) changes.push({ f, key, old: ui.xOrigin[f], v });
  }
  for (const c of changes) setX(c.key, c.v);
  closeXSheet();
  update();
  if (changes.length) {
    const msg = changes.length === 1
      ? `${X_NAME[changes[0].f]} שונה מ-${lri(changes[0].old || '—')} ל-${lri(changes[0].v || '—')}`
      : 'ערכי X עודכנו';
    toast(msg, () => { for (const c of changes) setX(c.key, c.old); update(); flashResult(); }, 6000);
  }
}

function closeXSheet({ fromPop = false } = {}) {
  if (!ui.sheet) return;
  ui.sheet = false;
  ui.xDraft = {}; ui.xOrigin = {}; ui.xActive = null;
  $('#xOverlay').hidden = true;
  $('#app').inert = false;
  xHint('');
  if (!fromPop && history.state && history.state.sheet) history.back();
  const edit = $('#editXBtn');
  if (!els.calc.hidden && !edit.hidden) edit.focus({ preventScroll: true }); // focus goes back to ✎
  shield(); // a double tap on "שמירה" must not land on the screen behind
}

function cancelXSheet() { closeXSheet(); update(); }

// ---------- Navigation ----------
function enterCalc(name) {
  const scr = SCREENS[name];
  els.calcTitle.innerHTML = scr.title;
  els.content.innerHTML = scr.kind === 'outlet' ? outletHTML() : scr.kind === 'handles' ? handlesHTML() : corniceHTML();
  els.body = $('.calc-body', els.content);
  $('#editXBtn').hidden = scr.kind === 'handles';
  ui.active = null; ui.fresh = false; ui.keypad = false;
  els.calc.classList.remove('kp-open');
  hideToast();
  update();
  wake.want = true;
  lockOn();
  armIdle();
}

function leaveCalc() {
  if (ui.sheet) closeXSheet({ fromPop: true });
  if (ui.active) commit(ui.active);
  ui.active = null; ui.keypad = false;
  els.calc.classList.remove('kp-open');
  wake.want = false;
  lockOff();
  clearTimeout(wake.idle);
}

function showScreen(name) {
  $('#home').hidden = name !== 'home';
  els.calc.hidden = !isScreen(name);
  for (const p of PAGES) $('#' + p).hidden = name !== p;
}

function route() {
  const name = location.hash.replace(/^#\/?/, '') || 'home';
  const target = isScreen(name) || PAGES.includes(name) ? name : 'home';
  const st = history.state || {};
  const prev = ui.route;
  if (target === prev) {
    if (isScreen(target)) {
      if (ui.sheet && st.sheet !== 'x') { closeXSheet({ fromPop: true }); update(); }
      if (ui.keypad && !st.kp) closeKeypad({ fromPop: true });
    }
    return;
  }
  if (isScreen(prev)) leaveCalc();
  ui.route = target;
  showScreen(target);
  shield();
  if (isScreen(target)) enterCalc(target);
  else if (target === 'home') { renderHome(); reloadIfIdle(); }
  else if (target === 'settings') renderSettings();
  else if (target === 'install') renderInstall();
  else if (target === 'share') renderShare();
  document.title = target === 'home' ? APP_NAME : `${screenName(target)} · ${APP_NAME}`;
  const forward = ui.forward;
  ui.forward = false;
  const c = $(`#${target} .content`);
  if (c && (forward || !ui.booted)) c.scrollTop = 0;
  if (ui.booted) focusScreen(target, prev);
}

function screenName(name) {
  if (isScreen(name)) return plain(SCREENS[name].title);
  const t = $(`#${name} .title`);
  return t ? t.textContent : '';
}

// After a screen change, focus goes to where the user came from, or to the new screen's title
function focusScreen(target, prev) {
  let el = ui.focusBack[target];
  ui.focusBack[target] = null;
  if (!el || el === document.body || !el.isConnected || el.closest('[hidden]')) {
    el = (target === 'home' && ($(`#home .tile[data-go="${prev}"]`) || (prev === 'settings' && $('#settingsBtn'))))
      || (target === 'settings' && $(`#settings [data-nav="${prev}"]`))
      || $(`#${isScreen(target) ? 'calc' : target} h1`);
  }
  if (el) el.focus();
}

function nav(name) {
  ui.focusBack[ui.route] = document.activeElement;
  ui.forward = true;
  ui.inAppNav = true;
  shield();
  location.hash = '#/' + name;
}

function goHome() {
  shield();
  if (ui.inAppNav) {
    const st = history.state || {};
    if (isScreen(ui.route) && (st.kp || st.sheet)) history.go(-2);
    else history.back();
  } else {
    history.replaceState(null, '', location.pathname + location.search);
    route();
  }
}

function closePage() {
  shield();
  if (ui.inAppNav) history.back();
  else { history.replaceState(null, '', location.pathname + location.search); route(); }
}

// ---------- Home, settings, install, share ----------
function renderTiles() {
  const tile = (id) => `<button type="button" class="tile" data-go="${id}" aria-label="${SCREENS[id].label || plain(SCREENS[id].title)}"><svg class="tile-ico" aria-hidden="true"><use href="#${SCREENS[id].icon}"/></svg><span class="tile-nm">${SCREENS[id].short}</span></button>`;
  const ids = CONFIG.homeOrder.filter(isScreen);
  $('#tilesOutlets').innerHTML = ids.filter((id) => SCREENS[id].kind === 'outlet').map(tile).join('');
  $('#tilesCabinets').innerHTML = ids.filter((id) => SCREENS[id].kind !== 'outlet').map(tile).join('');
}

function renderHome() {
  $('#installCard').hidden = isStandalone() || state.installCardHidden;
  renderStatus();
}

const sw = { reg: null, ok: false, version: '', updateReady: false, firstClaim: true, lastCheck: 0, timedOut: false, tries: 0 };

function renderStatus() {
  const el = $('#status'), txt = $('#statusText');
  if (!('serviceWorker' in navigator)) { el.hidden = true; return; }
  el.hidden = false;
  el.className = 'status';
  if (iOS && !isStandalone()) {
    el.classList.add('is-warn');
    txt.textContent = 'כדי שיעבוד בלי קליטה: הוסיפו למסך הבית ופתחו משם פעם אחת כשיש קליטה.';
    return;
  }
  if (sw.ok) { txt.textContent = 'עובד גם בלי קליטה'; return; }
  el.classList.add('is-wait');
  txt.textContent = sw.timedOut ? 'צריך קליטה לרגע כדי להכין עבודה בלי קליטה' : 'מכין עבודה בלי קליטה…';
}

function setSeg(id, value) {
  for (const b of $$(`#${id} button`)) b.setAttribute('aria-checked', String(b.dataset.v === value));
}

function renderSettings() {
  setSeg('segTheme', state.theme);
  setSeg('segRes', state.resOrder);
  setSeg('segDim', state.dimOrder);
  setSeg('segText', state.textSize);
  $('#contrastSwitch').setAttribute('aria-checked', String(state.contrast));
  const standalone = isStandalone();
  $('#setInstalled').hidden = !standalone;
  $('#setInstallBtn').hidden = standalone;
  const s = $('#awakeSwitch');
  const supported = 'wakeLock' in navigator;
  s.disabled = !supported;
  s.setAttribute('aria-checked', String(supported && state.keepAwake));
  $('#awakeNote').hidden = supported;
  $('#versionLine').textContent = 'גרסה ' + (sw.version || '—') + (sw.ok ? ' · עובד גם בלי קליטה' : '');
}

function steps(list) {
  return `<ol class="steps">${list.map((s, i) => `<li class="step"><span class="step-n">${i + 1}</span><span class="step-t">${s[1]}${s[2] ? `<small class="step-sub">${s[2]}</small>` : ''}</span>${s[0] ? `<svg class="step-p" aria-hidden="true"><use href="#${s[0]}"/></svg>` : ''}</li>`).join('')}</ol>`;
}
const INSTALL = {
  iosSafari: () => steps([
    ['p-share', 'לחצו על כפתור השיתוף.', safariMajor >= 26
      ? 'לא רואים אותו? לחצו על ••• ליד שורת הכתובת (או לחיצה ארוכה עליה) ובחרו "שיתוף".'
      : 'ריבוע עם חץ למעלה, בתחתית המסך.'],
    ['p-addhome', 'בחרו "הוספה למסך הבית".', 'לא מופיע? גללו למטה ברשימה.'],
    ['i-check', 'לחצו "הוסף" למעלה.', 'השאירו את "פתיחה כאפליקציה" דלוק.'],
    ['i-phone', 'פתחו מהסמל החדש, פעם אחת כשיש קליטה.', 'מאותו רגע הוא עובד גם בלי קליטה.'],
  ]) + `<p class="tip">באייפון לסמל במסך הבית יש זיכרון נפרד מהדפדפן, ולכן את ערכי ה-X קובעים מתוך הסמל.</p>
       <p class="tip">אין "הוספה למסך הבית"? בתחתית הרשימה לחצו "עריכת פעולות" והוסיפו אותה. אם גם זה לא עוזר, כנראה הקישור נפתח בתוך אפליקציה (וואטסאפ, ג׳ימייל): פתחו אותו ב-Safari ונסו שוב.</p>`,
  iosOther: () => steps([
    ['p-share', 'לחצו על כפתור השיתוף בשורת הכתובת.'],
    ['p-addhome', 'בחרו "הוספה למסך הבית" ואשרו.'],
    ['i-phone', 'פתחו מהסמל החדש, פעם אחת כשיש קליטה.'],
  ]) + '<p class="tip">לא מוצאים? פתחו את הקישור ב-Safari ונסו שוב.</p>',
  android: () => steps([
    ['p-kebab', 'לחצו על ⋮ (שלוש נקודות) למעלה.'],
    ['p-install', 'בחרו "התקנת אפליקציה".', 'בטלפונים אחרים: "התקנה ויצירת קיצור דרך" או "הוספה למסך הבית".'],
    ['i-check', 'אשרו "התקנה".'],
  ]) + '<p class="tip">הקישור נפתח בתוך וואטסאפ? לחצו ⋮ ובחרו "פתיחה ב-Chrome", ונסו שוב.</p>',
  samsung: () => steps([
    ['p-burger', 'לחצו על ☰ (שלושה קווים) בתחתית.'],
    ['p-addhome', 'בחרו "הוספת דף אל" ואז "מסך הבית".'],
    ['i-check', 'אשרו "הוספה".'],
  ]),
  desktop: () => `<p>ב-Chrome: לחצו על סמל ההתקנה בצד שורת הכתובת, או ⋮ ← "שמירה ושיתוף" ← "התקנת הדף כאפליקציה".</p>
    <p>ב-Edge: ⋯ ← "אפליקציות" ← "התקנת האתר כאפליקציה".</p>
    <p>ב-Safari במק: "קובץ" ← "הוספה ל-Dock".</p>`,
  inApp: () => `<p class="tip">הקישור נפתח בתוך אפליקציה (וואטסאפ, פייסבוק, אינסטגרם או ג׳ימייל), ומשם אי אפשר להוסיף למסך הבית.</p>
    <p>לחצו על ⋯ או ⋮ ובחרו "פתיחה בדפדפן" (באייפון: "פתיחה ב-Safari"), ואז חזרו להוראות האלה.</p>`,
};

function renderInstall() {
  const c = $('#installContent');
  if (isStandalone()) { c.innerHTML = '<p class="installed-line">המחשבון כבר במסך הבית ✓</p>'; return; }
  let main;
  if (inApp) main = 'inApp';
  else if (iOS) main = iOSOther ? 'iosOther' : 'iosSafari';
  else if (samsung) main = 'samsung';
  else if (android) main = 'android';
  else main = 'desktop';
  const others = [['iosSafari', 'אייפון (Safari)'], ['android', 'אנדרואיד (Chrome)'], ['samsung', 'סמסונג (הדפדפן של סמסונג)'], ['desktop', 'מחשב'], ['inApp', 'נפתח בתוך וואטסאפ או אפליקציה אחרת']]
    .filter(([k]) => k !== main);
  c.innerHTML = `<p class="lead">אחרי ההוספה יופיע סמל במסך הבית, והמחשבון ייפתח ממנו גם בלי קליטה.</p>
    ${deferredPrompt ? '<button type="button" class="btn btn-pri" id="promptBtn">התקנה</button>' : ''}
    ${INSTALL[main]()}
    <details class="more"><summary>הוראות לטלפון אחר</summary>${others.map(([k, t]) => `<h3>${t}</h3>${INSTALL[k]()}`).join('')}</details>`;
  const p = $('#promptBtn');
  if (p) p.onclick = () => doInstall();
}

function doInstall() {
  if (deferredPrompt) {
    const p = deferredPrompt;
    deferredPrompt = null;
    p.prompt();
    if (p.userChoice) p.userChoice.finally(() => { renderHome(); if (ui.route === 'install') renderInstall(); });
    return;
  }
  if (ui.route !== 'install') nav('install');
}

const appLink = () => new URL('./', location.href).href;

let sharing = false;
function shareApp() {
  const url = appLink();
  if (navigator.share) {
    if (sharing) return; // the share sheet is already opening
    sharing = true;
    navigator.share({ title: 'מחשבון מטבח', text: SHARE_TEXT, url })
      .catch((e) => { if (!e || (e.name !== 'AbortError' && e.name !== 'InvalidStateError')) nav('share'); })
      .finally(() => { sharing = false; });
    return;
  }
  nav('share');
}

function renderShare() {
  const url = appLink();
  $('#waLink').href = 'https://wa.me/?text=' + encodeURIComponent(SHARE_TEXT + '\n' + url);
  $('#shareUrl').textContent = url;
}

function copyLink() {
  const url = appLink();
  const fail = () => {
    const r = document.createRange();
    r.selectNodeContents($('#shareUrl'));
    const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    toast('לחצו לחיצה ארוכה על הקישור ובחרו "העתקה"');
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(() => toast('הקישור הועתק – אפשר להדביק בוואטסאפ'), fail);
  } else fail();
}

// ---------- Toast ----------
let toastTimer = 0;
function toast(text, undoFn, ms) {
  const t = $('#toast'), b = $('#toastBtn');
  $('#toastText').textContent = text;
  b.hidden = !undoFn;
  b.onclick = undoFn ? () => { t.hidden = true; undoFn(); } : null;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, ms || (undoFn ? 8000 : 4000));
}
function hideToast() { $('#toast').hidden = true; clearTimeout(toastTimer); }
function refreshScreen() {
  applyTheme();
  applyA11y();
  if (kind()) update();
  else if (ui.route === 'home') renderHome();
  else if (ui.route === 'settings') renderSettings();
}

// ---------- Reset all ----------
function doReset() {
  const snap = JSON.stringify(state);
  state = freshState();
  save();
  refreshScreen();
  toast('הכול אופס להתחלה', () => { state = JSON.parse(snap); save(); refreshScreen(); }, 8000);
}

// ---------- Keep the screen on ----------
const wake = { lock: null, pending: null, want: false, idle: 0 };
function lockOn() {
  if (!wake.want || !state.keepAwake || wake.lock || wake.pending || !('wakeLock' in navigator) || document.hidden) return;
  wake.pending = navigator.wakeLock.request('screen').then((s) => {
    wake.pending = null;
    if (!wake.want || !state.keepAwake) { s.release().catch(() => {}); return; }
    wake.lock = s;
    s.addEventListener('release', () => { if (wake.lock === s) wake.lock = null; });
  }).catch(() => { wake.pending = null; });
}
function lockOff() {
  if (wake.lock) { wake.lock.release().catch(() => {}); wake.lock = null; }
}
function armIdle() {
  clearTimeout(wake.idle);
  if (!wake.want) return;
  wake.idle = setTimeout(lockOff, (ui.keypad ? 10 : 30) * 60 * 1000);
}

// ---------- Offline + updates ----------
function askStatus() {
  if (!('serviceWorker' in navigator)) return;
  const target = navigator.serviceWorker.controller || (sw.reg && sw.reg.active);
  if (!target) return;
  const ch = new MessageChannel();
  ch.port1.onmessage = (e) => {
    sw.ok = !!(e.data && e.data.ok);
    sw.version = (e.data && e.data.version) || sw.version;
    renderStatus();
    if (ui.route === 'settings') renderSettings();
    if (!sw.ok && sw.tries++ < 10) setTimeout(askStatus, 2000);
  };
  target.postMessage({ type: 'status' }, [ch.port2]);
}

function reloadIfIdle() {
  if (sw.updateReady && ui.route === 'home' && !$('#resetDlg').open) location.reload();
}

function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  sw.firstClaim = !navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (sw.firstClaim) { sw.firstClaim = false; askStatus(); return; }
    sw.updateReady = true;
    reloadIfIdle();
  });
  const reg = () => navigator.serviceWorker.register('./sw.js').then((r) => { sw.reg = r; sw.lastCheck = Date.now(); askStatus(); }).catch(() => {});
  if (document.readyState === 'complete') reg(); else addEventListener('load', reg);
  navigator.serviceWorker.ready.then(askStatus);
  setTimeout(() => { if (!sw.ok) { sw.timedOut = true; renderStatus(); } }, 20000);
  addEventListener('online', () => { if (!sw.ok) { sw.tries = 0; reg(); } });
  if (isStandalone() && navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
}

async function checkUpdates() {
  if (!('serviceWorker' in navigator)) { toast('הדפדפן הזה לא תומך בעדכונים'); return; }
  const r = sw.reg || await navigator.serviceWorker.getRegistration();
  if (!r) { toast('אין עדיין גרסה שמורה – נסו שוב בעוד רגע'); return; }
  try { await r.update(); sw.lastCheck = Date.now(); } catch { toast('אין קליטה – נסו שוב כשיש קליטה'); return; }
  if (r.installing || r.waiting || sw.updateReady) toast('נמצאה גרסה חדשה – היא תיטען כשתחזרו למסך הראשי');
  else toast('יש לך את הגרסה העדכנית ✓');
}

// ---------- Events ----------
function bindKeypad(pad, onKey) {
  const downs = new Map();
  const SLOP = 16; // a key counts if the finger lifts within 16 px of the key it touched
  let lastPtrPress = 0;
  pad.addEventListener('pointerdown', (e) => {
    const key = e.target.closest('.k');
    if (!key || shielded()) return;
    try { key.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    downs.set(e.pointerId, key);
    key.classList.add('down');
  });
  pad.addEventListener('pointerup', (e) => {
    const key = downs.get(e.pointerId);
    if (!key) return;
    downs.delete(e.pointerId);
    key.classList.remove('down');
    const r = key.getBoundingClientRect();
    if (e.clientX >= r.left - SLOP && e.clientX <= r.right + SLOP && e.clientY >= r.top - SLOP && e.clientY <= r.bottom + SLOP) {
      lastPtrPress = performance.now();
      onKey(key.dataset.k);
    }
  });
  pad.addEventListener('pointercancel', (e) => {
    const key = downs.get(e.pointerId);
    if (key) { key.classList.remove('down'); downs.delete(e.pointerId); }
  });
  pad.addEventListener('click', (e) => {
    const key = e.target.closest('.k');
    // keyboard / assistive technology activation (but not the extra click some screen readers send after a touch)
    if (key && e.detail === 0 && performance.now() - lastPtrPress > 600) onKey(key.dataset.k);
  });
  pad.addEventListener('contextmenu', (e) => e.preventDefault());
}

function bind() {
  els.calc = $('#calc');
  els.content = $('#calcContent');
  els.calcTitle = $('#calcTitle');
  els.mainPad = $('#mainPad');
  els.mainPad.innerHTML = padHTML('הבא', 'i-next');
  els.kpMsg = document.createElement('p');
  els.kpMsg.className = 'kp-msg';
  els.kpMsg.hidden = true;
  $('#kpSheet').prepend(els.kpMsg);
  $('#xPad').innerHTML = padHTML('שמירה', 'i-check');
  for (const h of $$('#app h1')) h.tabIndex = -1; // focus target after a screen change

  addEventListener('popstate', route);
  addEventListener('hashchange', route);

  // Double-tap guard: for 0.4 s after a screen change, taps on the new screen are ignored
  document.addEventListener('click', (e) => {
    if (e.detail > 0 && shielded()) { e.stopImmediatePropagation(); e.preventDefault(); }
  }, true);

  $('#home').addEventListener('click', (e) => {
    const t = e.target.closest('.tile');
    if (!t || shielded()) return;
    wake.want = true;
    lockOn();
    nav(t.dataset.go);
  });

  // Tap a measurement to type; tap anywhere else in the display to close the keypad
  els.content.addEventListener('click', (e) => {
    if (shielded()) return;
    const inp = e.target.closest('.inp');
    if (inp) { openField(inp.dataset.f); return; }
    const tab = e.target.closest('[data-tab]');
    if (tab) { switchTab(tab.dataset.tab); return; }
    if (ui.keypad) closeKeypad();
  });

  $('#backBtn').addEventListener('click', goHome);
  $('#editXBtn').addEventListener('click', openXSheet);
  bindKeypad(els.mainPad, press);
  bindKeypad($('#xPad'), xPress);
  $('#xRows').addEventListener('click', (e) => { const r = e.target.closest('.xrow'); if (r) selectX(r.dataset.x); });
  $('#xRows').addEventListener('focusin', (e) => { const r = e.target.closest('.xrow'); if (r && r.dataset.x !== ui.xActive) selectX(r.dataset.x); });
  $('#xDim').addEventListener('click', cancelXSheet);
  $('#xCancel').addEventListener('click', cancelXSheet);
  $('#xReset').addEventListener('click', resetXDrafts);

  // Physical keyboard
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && PAGES.includes(ui.route) && !$('#resetDlg').open) { e.preventDefault(); closePage(); return; }
    if (!kind() || $('#resetDlg').open || e.ctrlKey || e.metaKey || e.altKey) return;
    const c = e.code || '';
    let k = null;
    const m = c.match(/^(?:Digit|Numpad)([0-9])$/);
    if (/^[0-9]$/.test(e.key)) k = e.key;
    else if (m) k = m[1];
    else if (e.key === '.' || e.key === ',' || c === 'Period' || c === 'Comma' || c === 'NumpadDecimal') k = '.';
    else if (e.key === 'Backspace') k = 'del';
    else if (e.key === 'Delete') k = 'clear';
    else if (e.key === 'Enter' || c === 'NumpadEnter') k = 'act';
    else if (e.key === 'Escape') k = 'esc';
    else if (e.key === 'Tab') k = e.shiftKey ? 'prev' : 'next';
    else if (e.key === 'ArrowDown') k = 'next';
    else if (e.key === 'ArrowUp') k = 'prev';
    if (!k) return;
    if (ui.sheet) {
      if (k === 'act' && e.target.closest && e.target.closest('#xCancel, #xReset')) return; // Enter on those buttons does what they say
      e.preventDefault();
      if (k === 'esc') cancelXSheet();
      else if (e.key === 'Tab') trapTab(e);
      else if (k === 'next' || k === 'prev') {
        const fs = xFields(); const i = Math.max(0, fs.indexOf(ui.xActive));
        selectX(fs[(i + (k === 'next' ? 1 : -1) + fs.length) % fs.length], true);
      } else xPress(k);
      return;
    }
    if (!ui.keypad && !/^[0-9.]$/.test(k)) return;
    e.preventDefault();
    if (k === 'esc') escape();
    else if (k === 'next') cycle(1);
    else if (k === 'prev') cycle(-1);
    else press(k);
  }, true);

  // Buttons with data-act anywhere
  document.addEventListener('click', (e) => {
    const n = e.target.closest('[data-nav]');
    if (n) { nav(n.dataset.nav); return; }
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const a = b.dataset.act;
    if (a === 'install') doInstall();
    else if (a === 'share') shareApp();
    else if (a === 'close') closePage();
  });
  // Any tap in a calculator keeps the screen awake (taps count as user gestures on iPhone)
  const keepAlive = () => { if (kind()) { armIdle(); lockOn(); } };
  document.addEventListener('pointerup', keepAlive, true);
  document.addEventListener('click', keepAlive, true);

  $('#settingsBtn').addEventListener('click', () => nav('settings'));
  $('#laterBtn').addEventListener('click', () => { state.installCardHidden = true; save(); renderHome(); });
  $('#copyBtn').addEventListener('click', copyLink);
  $('#updateBtn').addEventListener('click', checkUpdates);
  const seg = (id, key, after) => $('#' + id).addEventListener('click', (e) => {
    const b = e.target.closest('button[data-v]');
    if (!b) return;
    state[key] = b.dataset.v;
    save();
    if (after) after();
    renderSettings();
  });
  seg('segTheme', 'theme', applyTheme);
  seg('segRes', 'resOrder');
  seg('segDim', 'dimOrder');
  seg('segText', 'textSize', applyA11y);
  $('#contrastSwitch').addEventListener('click', () => {
    state.contrast = !state.contrast;
    save();
    applyA11y();
    renderSettings();
  });
  $('#awakeSwitch').addEventListener('click', () => {
    state.keepAwake = !state.keepAwake;
    save();
    if (!state.keepAwake) lockOff();
    renderSettings();
  });
  const dlg = $('#resetDlg');
  $('#resetBtn').addEventListener('click', () => dlg.showModal());
  dlg.addEventListener('close', () => { if (dlg.returnValue === 'yes') doReset(); dlg.returnValue = ''; });

  if (darkMQ.addEventListener) darkMQ.addEventListener('change', () => { if (state.theme === 'auto') applyTheme(); });
  addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; if (ui.route === 'install') renderInstall(); });
  addEventListener('appinstalled', () => { deferredPrompt = null; toast('המחשבון נוסף למסך הבית ✓'); renderHome(); });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    if (kind()) lockOn();
    if (sw.reg && Date.now() - sw.lastCheck > 5 * 60 * 1000) { sw.lastCheck = Date.now(); sw.reg.update().catch(() => {}); }
    askStatus();
    reloadIfIdle();
  });

  addEventListener('storage', (e) => {
    if (e.key !== STORE_KEY) return;
    state = load();
    refreshScreen();
  });
}

// ---------- Start ----------
{
  const h = location.hash.replace(/^#\/?/, '');
  if (LINKABLE.includes(h)) history.replaceState(null, '', location.pathname + location.search + '#/' + h); // a direct link to a legal page
  else if (location.hash || history.state) history.replaceState(null, '', location.pathname + location.search); // otherwise always open on Home
}
applyTheme();
applyA11y();
bind();
renderTiles();
route();
ui.booted = true;
registerSW();
