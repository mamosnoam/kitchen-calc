import { CONFIG } from './config.js';
import { pressKey, tidy, toH, fmt, show, outlet, handles, cornice, emWidth, isStoredValue, MINUS } from './core.js';

const LIMITS = { maxInt: CONFIG.maxInt, maxDec: CONFIG.maxDec };
const XMAX_H = toH(CONFIG.xMax);
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const lri = (s) => '⁦' + s + '⁩'; // keep numbers left-to-right inside Hebrew plain text

// ---------- Screens and fields ----------
const SCREENS = {
  single: { kind: 'outlet', title: 'שקע בודד', icon: 'i-out1' },
  double: { kind: 'outlet', title: 'שקע כפול', icon: 'i-out2' },
  triple: { kind: 'outlet', title: 'שקע משולש', icon: 'i-out3' },
  handles: { kind: 'handles', title: 'ידיות', icon: 'i-handle' },
  cornice: { kind: 'cornice', title: 'קרניז <bdi dir="ltr">K11/K10</bdi>', icon: 'i-cornice' },
};
const SHEETS = ['help', 'install', 'share'];
const KINDS = {
  outlet: { order: ['h', 'w'], main: 'h', xOf: { xh: 'h', xw: 'w' } },
  handles: { order: ['handle', 'front'], main: 'front', xOf: {} },
  cornice: { order: ['len'], main: 'len', xOf: { x: 'len' } },
};
const FIELD_NAME = { h: 'גובה', w: 'רוחב', handle: 'מידת הידית', front: 'מידת החזית', len: 'אורך הארון' };
const X_NAME = { xh: 'X לגובה', xw: 'X לרוחב', x: 'X של הקרניז' };
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
  return s;
}

function save() {
  if (storeReadOnly) return;
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch { /* private mode or full: keep working in memory */ }
}

let state = load();

// ---------- UI state (memory only) ----------
const ui = {
  route: '', mode: 'type', active: null, fresh: false,
  before: '',        // value when the field was selected (Esc restores it)
  draft: null,       // X value while an X is being edited
  origin: null,      // X value when its editing started
  undo: null,        // { text, fn } shown in the strip until replaced
  err: null, errTimer: 0,
  pendingField: null, pendingKey: null,
  inAppNav: false, shieldUntil: 0,
};
const els = {};
const kind = () => (SCREENS[ui.route] ? SCREENS[ui.route].kind : null);
const isX = (f) => f === 'xh' || f === 'xw' || f === 'x';
const inputs = () => state.inputs[ui.route];
const xKeyOf = (f) => (ui.route === 'cornice' ? 'cornice' : ui.route + '.' + KINDS.outlet.xOf[f]);
const xDefault = (key) => CONFIG.xDefaults[key] || '';
const xStored = (key) => (key in state.x ? state.x[key] : xDefault(key));
const xCurrent = (f) => (ui.active === f && ui.draft !== null ? ui.draft : xStored(xKeyOf(f)));
const valueOf = (f) => (isX(f) ? xCurrent(f) : inputs()[f]);
const shield = () => { ui.shieldUntil = performance.now() + 400; };
const shielded = () => performance.now() < ui.shieldUntil;
const desktop = matchMedia('(hover: hover) and (pointer: fine)').matches;

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

// ---------- Calculator markup (built once per visit, then updated in place) ----------
function fieldHTML(f, label, ph, icon) {
  return `<button type="button" class="field" data-f="${f}">
    <span class="flabel">${icon ? `<svg class="ico" aria-hidden="true"><use href="#${icon}"/></svg>` : ''}${label} <small>(ס״מ)</small></span>
    <span class="fval"><span class="num" dir="ltr"><span class="val"></span><span class="caret"></span></span><span class="ph">${ph}</span></span>
  </button>`;
}
function xchipHTML(f, sign) {
  return `<button type="button" class="field xchip" data-f="${f}">
    <span class="xlabel">X <svg class="ico" aria-hidden="true"><use href="#i-pencil"/></svg></span>
    <span class="fval"><span class="num" dir="ltr"><span class="pm">${sign}</span><span class="val"></span><span class="caret"></span></span><span class="ph">הזינו X</span></span>
    <i class="dot" aria-hidden="true"></i>
  </button>`;
}
function resHTML(d, plus, word) {
  return `<div class="res ${plus ? 'plus' : 'minus'}" data-r="${d}${plus ? 'Plus' : 'Minus'}">
    <svg class="badge" aria-hidden="true"><use href="#b-${plus ? 'plus' : 'minus'}"/></svg>
    <span class="rlabel">${word} <span class="num" dir="ltr">${plus ? '+' : MINUS}<span data-o="${d}x"></span></span></span>
    <span class="neg-note">⚠ המידה קטנה מ-X<span class="neg-more"> – בדקו אותה</span></span>
    <span class="fit"><span class="big num" dir="ltr"></span></span>
  </div>`;
}
function outletHTML() {
  const band = (d) => {
    const word = d === 'h' ? 'גובה' : 'רוחב';
    return `<section class="band band-${d}">
      <button type="button" class="rhead" data-go="${d}">
        <span class="rhead-word">${word}</span>
        <span class="rhead-sum"><span class="num" dir="ltr" data-o="${d}v"></span> · <span class="num" dir="ltr" data-o="${d}xs"></span></span>
        <svg class="ico" aria-hidden="true"><use href="#i-pencil"/></svg>
      </button>
      <div class="frow">${fieldHTML(d, word + ' מרכז השקע', 'הקלידו ' + word, 'i-' + d)}${xchipHTML('x' + d, '±')}</div>
      <div class="results">${resHTML(d, true, word)}${resHTML(d, false, word)}</div>
    </section>`;
  };
  return `<div class="calc-body outlet">${band('h')}${band('w')}</div>`;
}
function handlesHTML() {
  return `<div class="calc-body handles"><section class="band">
    <button type="button" class="rhead" data-go="front">
      <span class="rhead-sum">ידית <span class="num" dir="ltr" data-o="hd"></span> · חזית <span class="num" dir="ltr" data-o="fr"></span></span>
      <svg class="ico" aria-hidden="true"><use href="#i-pencil"/></svg>
    </button>
    <div class="frow two">${fieldHTML('handle', 'מידת הידית', 'הקלידו ידית')}${fieldHTML('front', 'מידת החזית', 'דלת או מגירה')}</div>
    <div class="res res-one" data-r="margin">
      <span class="rlabel">מרווח מכל צד</span>
      <span class="fit"><span class="big num" dir="ltr"></span></span>
      <p class="formula"><span class="num" dir="ltr" data-o="formula"></span></p>
      <p class="err-msg">הידית ארוכה מהחזית – בדקו את המידות</p>
    </div>
  </section></div>`;
}
function corniceHTML() {
  const tab = (t) => `<button type="button" class="tab" role="tab" data-tab="${t}"><svg aria-hidden="true"><use href="#t-${t}"/></svg><span class="tab-label"><svg class="ico" aria-hidden="true"><use href="#i-check"/></svg>${TAB_NAME[t]}</span></button>`;
  return `<div class="calc-body cornice">
    <p class="banner"><svg class="ico" aria-hidden="true"><use href="#i-warn"/></svg><span>יש לחשב כולל חזית</span></p>
    <div class="tabs" role="tablist">${tab('one')}${tab('two')}</div>
    <p class="tabfixed"><svg aria-hidden="true"><use data-o="tabicon" href="#t-one"/></svg><span data-o="tabname"></span></p>
    <section class="band">
      <button type="button" class="rhead" data-go="len">
        <span class="rhead-sum">אורך <span class="num" dir="ltr" data-o="lv"></span> · <span class="num" dir="ltr" data-o="lxs"></span></span>
        <svg class="ico" aria-hidden="true"><use href="#i-pencil"/></svg>
      </button>
      <div class="frow">${fieldHTML('len', 'אורך הארון כולל חזית', 'הקלידו אורך')}${xchipHTML('x', '+')}</div>
      <div class="res res-one" data-r="cornice">
        <span class="rlabel" data-o="resLabel"></span>
        <span class="fit"><span class="big num" dir="ltr"></span></span>
        <p class="formula"><span class="num" dir="ltr" data-o="formula"></span></p>
      </div>
    </section>
  </div>`;
}

// ---------- Rendering ----------
function out(name, text) { for (const el of $$(`[data-o="${name}"]`, els.body)) el.textContent = text; }
function outHTML(name, html) { for (const el of $$(`[data-o="${name}"]`, els.body)) el.innerHTML = html; }
const tok = (s) => `<span class="tok">${s}</span>`;
const word = (s) => `<bdi>${s}</bdi>`;

function setRes(key, h, longest) {
  const el = $(`[data-r="${key}"]`, els.body);
  const text = fmt(h);
  $('.big', el).textContent = text;
  el.classList.toggle('is-neg', h !== null && h < 0);
  el.classList.toggle('is-empty', h === null);
  longest.push(text);
}

function update() {
  if (!kind() || !els.body) return;
  const k = kind();
  for (const btn of $$('.field', els.body)) {
    const f = btn.dataset.f;
    const v = valueOf(f);
    const active = ui.active === f;
    $('.val', btn).textContent = v;
    btn.classList.toggle('is-active', active);
    btn.classList.toggle('is-fresh', active && ui.fresh && v !== '');
    btn.classList.toggle('is-empty', v === '');
    if (isX(f)) {
      btn.classList.toggle('is-changed', xKeyOf(f) in state.x);
      btn.setAttribute('aria-label', `${X_NAME[f]}: ${v || 'ריק'}. לחצו כדי לשנות`);
    } else {
      btn.setAttribute('aria-label', `${FIELD_NAME[f]} בסנטימטרים: ${v || 'ריק'}${active && ui.fresh && v ? '. נבחר – מספר חדש יחליף את הקיים' : ''}`);
    }
  }
  const inp = inputs();
  const longest = [];
  if (k === 'outlet') {
    const xh = xCurrent('xh'), xw = xCurrent('xw');
    const r = outlet(inp.h, inp.w, xh, xw);
    setRes('hPlus', r.hPlus, longest); setRes('hMinus', r.hMinus, longest);
    setRes('wPlus', r.wPlus, longest); setRes('wMinus', r.wMinus, longest);
    out('hx', show(xh) || 'X'); out('wx', show(xw) || 'X');
    out('hv', show(inp.h) || '—'); out('wv', show(inp.w) || '—');
    out('hxs', 'X ±' + (show(xh) || '?')); out('wxs', 'X ±' + (show(xw) || '?'));
  } else if (k === 'handles') {
    const r = handles(inp.handle, inp.front);
    const el = $('[data-r="margin"]', els.body);
    el.classList.toggle('is-err', r.error === 'handleLonger');
    setRes('margin', r.margin, longest);
    const H = show(inp.handle), F = show(inp.front);
    outHTML('formula', H && F ? `${tok('(' + F)} ${tok(MINUS + ' ' + H + ')')} ${tok('÷ 2')}` : `(${word('חזית')} ${MINUS} ${word('ידית')}) ÷ 2`);
    out('hd', H || '—'); out('fr', F || '—');
  } else if (k === 'cornice') {
    const tab = state.corniceTab;
    const X = xCurrent('x'), L = show(inp.len), XS = show(X);
    setRes('cornice', cornice(inp.len, X, tab), longest);
    const xs = XS || 'X';
    outHTML('formula', L && XS
      ? (tab === 'two' ? `${tok(L)} ${tok('+ ' + XS)} ${tok('+ ' + XS)}` : `${tok(L)} ${tok('+ ' + XS)}`)
      : `${word('אורך')} + ${xs}${tab === 'two' ? ' + ' + xs : ''}`);
    out('resLabel', 'מידת קרניז – ' + TAB_NAME[tab]);
    out('tabname', TAB_NAME[tab]);
    for (const el of $$('[data-o="tabicon"]', els.body)) el.setAttribute('href', '#t-' + tab);
    for (const t of $$('.tab', els.body)) t.setAttribute('aria-selected', String(t.dataset.tab === tab));
    out('lv', L || '—'); out('lxs', 'X +' + (XS || '?'));
  }
  els.body.style.setProperty('--w', Math.max(...longest.map(emWidth)).toFixed(2));
  updateStrip();
  updateActionKey();
}

function needsX() {
  if (kind() === 'outlet') return xCurrent('xh') === '' || xCurrent('xw') === '';
  if (kind() === 'cornice') return xCurrent('x') === '';
  return false;
}

function updateStrip() {
  const strip = els.strip, text = els.stripText, btn = els.stripBtn;
  strip.className = 'strip';
  btn.hidden = true;
  btn.onclick = null;
  const f = ui.active;
  if (ui.err) { strip.classList.add('mode-err'); text.textContent = ui.err; return; }
  if (f && isX(f)) {
    strip.classList.add('mode-x');
    text.textContent = `משנים עכשיו את ${X_NAME[f]} – לא את המידה`;
    const def = xDefault(xKeyOf(f));
    if (def !== '' && tidy(ui.draft || '') !== def) {
      btn.hidden = false;
      btn.textContent = '↺ חזרה ל-' + lri(def);
      btn.onclick = () => resetX(f);
    }
    return;
  }
  if (ui.undo) {
    strip.classList.add('mode-msg');
    text.textContent = ui.undo.text;
    btn.hidden = false;
    btn.textContent = 'ביטול';
    btn.onclick = runUndo;
    return;
  }
  if (needsX()) { strip.classList.add('mode-need'); text.textContent = 'חסר X – לחצו על X והקלידו'; return; }
  if (!f) { text.textContent = ''; return; }
  const v = valueOf(f);
  const name = FIELD_NAME[f];
  if (v === '') text.textContent = `${name} · הקלידו מספר`;
  else if (ui.fresh) text.textContent = `${name} · מספר חדש יחליף את הקיים` + (desktop ? ' · אפשר להקליד מהמקלדת' : '');
  else text.textContent = name;
}

function updateActionKey() {
  const f = ui.active;
  let label = 'סיום', icon = '#i-check', xMode = false;
  if (f && isX(f)) { label = 'שמירת X'; xMode = true; }
  else if (f) {
    const order = KINDS[kind()].order;
    const i = order.indexOf(f);
    if (i >= 0 && i < order.length - 1) { label = 'הבא'; icon = '#i-next'; }
  }
  els.actLabel.textContent = label;
  els.actIcon.setAttribute('href', icon);
  els.actKey.classList.toggle('is-x', xMode);
}

// ---------- Field logic (the overwrite rule) ----------
function entryField() {
  const k = kind();
  if (k === 'handles') return inputs().handle === '' ? 'handle' : 'front';
  return KINDS[k].main;
}

function activate(f) {
  if (ui.active && ui.active !== f) commit(ui.active);
  if (isX(f)) {
    // a re-tap keeps the original X, so "save" on an emptied X can fall back to it
    if (ui.active !== f) { ui.origin = xStored(xKeyOf(f)); ui.draft = ui.origin; }
  } else {
    ui.draft = null;
    ui.before = valueOf(f); // Esc goes back to the value at the moment of selection
  }
  ui.active = f;
  ui.fresh = true; // selected: nothing changes until a key is typed
  ui.err = null;
  update();
  const btn = $(`.field[data-f="${f}"]`, els.body);
  if (btn) btn.scrollIntoView({ block: 'nearest' });
}

function setX(key, v) {
  if (v === xDefault(key)) delete state.x[key]; else state.x[key] = v;
  save();
}

function commit(f) {
  if (isX(f)) {
    const key = xKeyOf(f);
    let v = tidy(ui.draft || '');
    if (v === '' && xDefault(key) !== '') v = ui.origin; // an X with a default can never be blank
    const old = ui.origin;
    setX(key, v);
    ui.draft = null;
    if (v !== old) setUndo(`${X_NAME[f]} שונה מ-${lri(old || '—')} ל-${lri(v || '—')}`, () => setX(key, old));
  } else {
    const inp = inputs();
    const t = tidy(inp[f]);
    if (t !== inp[f]) { inp[f] = t; save(); }
  }
}

function discardDraft() { ui.draft = null; ui.origin = null; }

function resetX(f) {
  if (shielded()) return;
  const key = xKeyOf(f), def = xDefault(key), old = ui.origin;
  setX(key, def);
  discardDraft();
  ui.active = null;
  if (def !== old) setUndo(`${X_NAME[f]} חזר ל-${lri(def)}`, () => setX(key, old));
  activate(KINDS[kind()].xOf[f]);
}

function setUndo(text, fn) { ui.undo = { text, fn }; }
function runUndo() {
  if (!ui.undo) return;
  const { fn } = ui.undo;
  ui.undo = null;
  fn();
  update();
  flashResult();
}

function reject(msg) {
  const btn = ui.active && $(`.field[data-f="${ui.active}"]`, els.body);
  if (btn) { btn.classList.remove('shake'); void btn.offsetWidth; btn.classList.add('shake'); }
  ui.err = msg;
  clearTimeout(ui.errTimer);
  ui.errTimer = setTimeout(() => { ui.err = null; updateStrip(); }, 2000);
  updateStrip();
}

function press(k) {
  if (!kind()) return;
  if (ui.mode === 'read') { if (/^[0-9.]$/.test(k)) goType(KINDS[kind()].main, k); return; }
  if (!ui.active) activate(entryField());
  if (k === 'act') { action(); return; }
  const f = ui.active;
  const r = pressKey(valueOf(f), ui.fresh, k, LIMITS);
  if (r.reject) {
    if (r.reject === 'int') reject(`אפשר עד ${CONFIG.maxInt} ספרות לפני הנקודה`);
    else if (r.reject === 'dec') reject(CONFIG.maxDec === 1 ? 'אפשר ספרה אחת אחרי הנקודה' : `אפשר עד ${CONFIG.maxDec} ספרות אחרי הנקודה`);
    return;
  }
  if (isX(f) && r.value !== '' && toH(r.value) > XMAX_H) { reject('X גדול מדי – אולי התכוונתם להקליד מידה?'); return; }
  if (isX(f)) ui.draft = r.value; else { inputs()[f] = r.value; save(); }
  ui.fresh = r.fresh;
  ui.err = null;
  update();
}

function action() {
  const f = ui.active;
  if (!f) return;
  if (isX(f)) { commit(f); ui.active = null; activate(KINDS[kind()].xOf[f]); return; }
  const order = KINDS[kind()].order;
  const i = order.indexOf(f);
  if (i < order.length - 1) { activate(order[i + 1]); return; }
  commit(f);
  ui.active = null;
  history.pushState({ read: true }, '');
  setMode('read');
}

function cycle(dir) {
  if (ui.active && isX(ui.active)) { action(); return; }
  const order = KINDS[kind()].order;
  const i = Math.max(0, order.indexOf(ui.active));
  activate(order[(i + dir + order.length) % order.length]);
}

function escape() {
  const f = ui.active;
  if (!f) return;
  if (isX(f)) { discardDraft(); ui.active = null; activate(KINDS[kind()].xOf[f]); return; }
  inputs()[f] = ui.before;
  save();
  ui.fresh = true;
  update();
}

function switchTab(t) {
  if (state.corniceTab === t) return;
  const old = state.corniceTab;
  state.corniceTab = t;
  save();
  setUndo('החישוב עכשיו: ' + TAB_NAME[t], () => { state.corniceTab = old; save(); });
  update();
  flashResult();
}

function flashResult() {
  const el = $('.res-one', els.body);
  if (!el) return;
  el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
}

// ---------- Modes and navigation ----------
function setMode(m) {
  ui.mode = m;
  els.calc.classList.toggle('mode-read', m === 'read');
  els.calc.classList.toggle('mode-type', m === 'type');
  shield();
  armIdle();
  if (m === 'read') {
    ui.active = null;
    ui.fresh = false;
    update();
    els.content.scrollTop = 0;
    els.content.focus({ preventScroll: true });
  }
}

function goType(field, key) {
  if (ui.mode !== 'read') { activate(field); return; }
  ui.pendingField = field;
  ui.pendingKey = key || null;
  if (history.state && history.state.read) history.back();
  else { setMode('type'); afterType(); }
}

function afterType() {
  const f = ui.pendingField || entryField();
  const k = ui.pendingKey;
  ui.pendingField = ui.pendingKey = null;
  ui.active = null;
  activate(f);
  if (k) press(k);
}

function enterCalc(name) {
  const scr = SCREENS[name];
  els.calcTitle.innerHTML = scr.title;
  els.calcIcon.setAttribute('href', '#' + scr.icon);
  els.content.innerHTML = scr.kind === 'outlet' ? outletHTML() : scr.kind === 'handles' ? handlesHTML() : corniceHTML();
  els.body = $('.calc-body', els.content);
  els.content.scrollTop = 0;
  ui.active = null; ui.undo = null; ui.err = null; ui.draft = null; ui.fresh = false;
  wake.want = true;
  lockOn();
}

function leaveCalc() {
  if (ui.active) { if (isX(ui.active)) discardDraft(); else commit(ui.active); }
  ui.active = null; ui.undo = null; ui.err = null;
  wake.want = false;
  lockOff();
  clearTimeout(wake.idle);
}

function showScreen(name) {
  const calcOn = !!SCREENS[name];
  $('#home').hidden = name !== 'home';
  els.calc.hidden = !calcOn;
  for (const s of SHEETS) $('#' + s).hidden = name !== s;
}

function route() {
  const name = location.hash.replace(/^#\/?/, '') || 'home';
  const target = SCREENS[name] || SHEETS.includes(name) ? name : 'home';
  const mode = SCREENS[target] && history.state && history.state.read ? 'read' : 'type';
  const prev = ui.route;
  if (target === prev && (!SCREENS[target] || mode === ui.mode)) return;
  if (SCREENS[prev] && target !== prev) leaveCalc();
  ui.route = target;
  showScreen(target);
  if (SCREENS[target]) {
    if (target !== prev) { enterCalc(target); ui.mode = ''; }
    if (mode === 'read') setMode('read');
    else { setMode('type'); afterType(); }
  } else {
    shield();
    if (target === 'home') { renderHome(); reloadIfIdle(); }
    else if (target === 'help') renderHelp();
    else if (target === 'install') renderInstall();
    else if (target === 'share') renderShare();
    const c = $(`#${target} .content`);
    if (c) c.scrollTop = 0;
  }
}

function nav(name) { ui.inAppNav = true; location.hash = '#/' + name; }

function goHome() {
  if (ui.inAppNav) {
    if (SCREENS[ui.route] && ui.mode === 'read' && history.state && history.state.read) history.go(-2);
    else history.back();
  } else {
    history.replaceState(null, '', location.pathname + location.search);
    route();
  }
}

function closeSheet() {
  if (ui.inAppNav) history.back();
  else { history.replaceState(null, '', location.pathname + location.search); route(); }
}

// ---------- Home, help, install, share ----------
function renderTiles() {
  $('#tiles').innerHTML = CONFIG.homeOrder.filter((id) => SCREENS[id]).map((id) => {
    const label = id === 'cornice' ? 'קרניז <bdi dir="ltr">K11/K10</bdi>' : SCREENS[id].title;
    return `<button type="button" class="tile" data-go="${id}"><svg class="tile-ico" aria-hidden="true"><use href="#${SCREENS[id].icon}"/></svg><span class="tile-label">${label}</span><svg class="tile-chev" aria-hidden="true"><use href="#i-chev"/></svg></button>`;
  }).join('');
}

function renderHome() {
  const standalone = isStandalone();
  const card = standalone || state.installCardHidden;
  $('#installCard').hidden = card;
  $('#addHomeBtn').hidden = standalone || !card; // while the card shows, its own button is enough
  $('.home-foot').classList.toggle('single', $('#addHomeBtn').hidden);
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
  if (sw.ok) { txt.textContent = 'מוכן לעבודה גם בלי קליטה'; return; }
  el.classList.add('is-wait');
  txt.textContent = sw.timedOut
    ? 'צריך קליטה לרגע כדי להכין את המחשבון לעבודה בלי קליטה'
    : 'שומר את המחשבון בטלפון כדי שיעבוד גם בלי קליטה…';
}

function renderHelp() {
  const standalone = isStandalone();
  $('#helpInstalled').hidden = !standalone;
  $('#helpInstallBtn').hidden = standalone;
  const sw2 = $('#awakeSwitch');
  const supported = 'wakeLock' in navigator;
  sw2.disabled = !supported;
  sw2.setAttribute('aria-checked', String(supported && state.keepAwake));
  $('#awakeNote').hidden = supported;
  $('#versionLine').textContent = 'גרסה ' + (sw.version || '—') + (sw.ok ? ' · מוכן לעבודה גם בלי קליטה' : '');
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
    ['i-add', 'פתחו מהסמל החדש, פעם אחת כשיש קליטה.', 'מאותו רגע הוא עובד גם בלי קליטה.'],
  ]) + `<p class="tip">באייפון לסמל במסך הבית יש זיכרון נפרד מהדפדפן. את ערכי ה-X קובעים מתוך הסמל, אחרי ההוספה.</p>
       <p class="tip">אין "הוספה למסך הבית"? גללו לתחתית הרשימה, לחצו "עריכת פעולות" והוסיפו אותה. אם גם זה לא עוזר, כנראה הקישור נפתח בתוך אפליקציה (וואטסאפ, ג׳ימייל) – פתחו אותו ב-Safari ונסו שוב.</p>`,
  iosOther: () => steps([
    ['p-share', 'לחצו על כפתור השיתוף בשורת הכתובת.'],
    ['p-addhome', 'בחרו "הוספה למסך הבית" ואשרו.'],
    ['i-add', 'פתחו מהסמל החדש, פעם אחת כשיש קליטה.'],
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
  c.innerHTML = `<p class="lead">אחרי ההוספה יופיע סמל במסך הבית. לחיצה עליו פותחת את המחשבון – גם בלי קליטה.</p>
    ${deferredPrompt ? '<button type="button" class="btn btn-pri btn-wide" id="promptBtn"><svg class="ico"><use href="#i-add"/></svg><span>התקנה</span></button>' : ''}
    ${INSTALL[main]()}
    <details class="more"><summary>הוראות לטלפון אחר</summary>${others.map(([k, t]) => `<h3>${t}</h3>${INSTALL[k]()}`).join('')}</details>
    <button type="button" class="btn btn-pri btn-wide" data-act="close"><span>הבנתי</span></button>`;
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

function shareApp() {
  const url = appLink();
  if (navigator.share) {
    navigator.share({ title: 'מחשבון מטבח', text: SHARE_TEXT, url }).catch((e) => {
      if (!e || e.name !== 'AbortError') nav('share');
    });
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

// ---------- Toast (outside calculators) ----------
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

// ---------- Reset all ----------
function doReset() {
  const snap = JSON.stringify(state);
  state = freshState();
  save();
  renderHelp();
  toast('הכול אופס לערכים המקוריים', () => { state = JSON.parse(snap); save(); renderHelp(); }, 8000);
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
  wake.idle = setTimeout(lockOff, (ui.mode === 'read' ? 30 : 10) * 60 * 1000);
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
    if (ui.route === 'help') renderHelp();
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
function bind() {
  els.calc = $('#calc');
  els.content = $('#calcContent');
  els.calcTitle = $('#calcTitle');
  els.calcIcon = $('#calcIcon');
  els.strip = $('#strip');
  els.stripText = $('#stripText');
  els.stripBtn = $('#stripBtn');
  els.actKey = $('.key-act');
  els.actLabel = $('#actLabel');
  els.actIcon = $('#actIcon');

  addEventListener('popstate', route);
  addEventListener('hashchange', route);

  $('#tiles').addEventListener('click', (e) => {
    const t = e.target.closest('.tile');
    if (!t || shielded()) return;
    wake.want = true;
    lockOn();
    nav(t.dataset.go);
  });

  els.content.addEventListener('click', (e) => {
    if (shielded()) return;
    const field = e.target.closest('.field');
    if (field) { activate(field.dataset.f); return; }
    const head = e.target.closest('.rhead');
    if (head) { goType(head.dataset.go); return; }
    const tab = e.target.closest('.tab');
    if (tab && ui.mode === 'type') switchTab(tab.dataset.tab);
  });

  $('#backBtn').addEventListener('click', goHome);
  $('#editBtn').addEventListener('click', () => { if (!shielded()) goType(entryField()); });

  // Keypad: a key fires when the finger lifts inside the same key (sliding off cancels)
  const keypad = $('.keypad');
  const downs = new Map();
  keypad.addEventListener('pointerdown', (e) => {
    const key = e.target.closest('.key');
    if (!key || shielded()) return;
    try { key.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    downs.set(e.pointerId, key);
    key.classList.add('down');
  });
  keypad.addEventListener('pointerup', (e) => {
    const key = downs.get(e.pointerId);
    if (!key) return;
    downs.delete(e.pointerId);
    key.classList.remove('down');
    const r = key.getBoundingClientRect();
    if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) press(key.dataset.k);
  });
  keypad.addEventListener('pointercancel', (e) => {
    const key = downs.get(e.pointerId);
    if (key) { key.classList.remove('down'); downs.delete(e.pointerId); }
  });
  keypad.addEventListener('click', (e) => {
    const key = e.target.closest('.key');
    if (key && e.detail === 0) press(key.dataset.k); // keyboard / assistive technology activation
  });
  keypad.addEventListener('contextmenu', (e) => e.preventDefault());

  // Physical keyboard
  document.addEventListener('keydown', (e) => {
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
    if (ui.mode === 'read' && !/^[0-9.]$/.test(k)) return;
    e.preventDefault();
    if (k === 'clear') { if (ui.active) { if (isX(ui.active)) ui.draft = ''; else { inputs()[ui.active] = ''; save(); } ui.fresh = false; update(); } }
    else if (k === 'esc') escape();
    else if (k === 'next') cycle(1);
    else if (k === 'prev') cycle(-1);
    else press(k);
  }, true);

  // Buttons with data-act anywhere
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const a = b.dataset.act;
    if (a === 'install') doInstall();
    else if (a === 'share') shareApp();
    else if (a === 'close') closeSheet();
  });
  // Any tap in a calculator keeps the screen awake (taps count as user gestures on iPhone)
  const keepAlive = () => { if (kind()) { armIdle(); lockOn(); } };
  document.addEventListener('pointerup', keepAlive, true);
  document.addEventListener('click', keepAlive, true);

  $('#helpBtn').addEventListener('click', () => nav('help'));
  $('#laterBtn').addEventListener('click', () => { state.installCardHidden = true; save(); renderHome(); });
  $('#copyBtn').addEventListener('click', copyLink);
  $('#updateBtn').addEventListener('click', checkUpdates);
  $('#awakeSwitch').addEventListener('click', () => {
    state.keepAwake = !state.keepAwake;
    save();
    if (!state.keepAwake) lockOff();
    renderHelp();
  });
  const dlg = $('#resetDlg');
  $('#resetBtn').addEventListener('click', () => dlg.showModal());
  dlg.addEventListener('close', () => { if (dlg.returnValue === 'yes') doReset(); dlg.returnValue = ''; });

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
    if (kind()) update();
    else if (ui.route === 'help') renderHelp();
    else if (ui.route === 'home') renderHome();
  });
}

// ---------- Start ----------
if (location.hash) history.replaceState(null, '', location.pathname + location.search); // always open on Home
bind();
renderTiles();
route();
registerSW();
