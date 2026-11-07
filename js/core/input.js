/* LIVE FIRE — keyboard / mouse / pointer lock / gamepad with rebindable actions and raw look deltas.
   Exports:
     ACTIONS            [{ id, label, group, def: [codes] }] in display order (docs §2 action ids)
     DEFAULT_BINDS      { action: [codes] }
     Input = {
       attach(canvas), detach(),
       lock() -> Promise<bool>   pointer lock (unadjustedMovement when the browser supports it and settings.rawInput)
       unlock(), locked          (losing the lock without unlock(), e.g. Esc, latches pressed('menu'))
       down(action)              held now, or tapped since the last tick (a sub-tick tap still counts for one tick)
       pressed(action)           edge: pressed since the previous tick (snapshot taken at the start of each tick)
       released(action)          edge: released since the previous tick
       consume(action) -> bool   take a latched press immediately (menus / frame code outside the tick)
       look() -> { dx, dy }      radians accumulated since the last call (REUSED object): mouse counts * sens * 0.022 deg
                                 * sensMul, plus gamepad look; dx > 0 = turn right (yaw +), dy > 0 = look down (pitch +)
       move() -> { mx, mz }      -1..1 strafe / forward from keys and the left stick (REUSED object)
       setSensMul(k)             ADS / scope sensitivity factor (e.g. adsSens * zoom ratio)
       bind(action, code, slot = 0), unbind(action, slot), binds() -> { action: [codes] }, resetBinds(),
       codeName(code) -> 'W' | 'MOUSE 1' | 'WHEEL UP' ..., keyLabel(action) -> display label of its first binding,
       capture() -> Promise<code|null>   next key / button / wheel (Esc cancels) for the rebinding UI
       onText(bool), typing      text-entry mode: game keys are ignored (chat boxes); focus in <input>/<textarea> does it too
       setGameActive(bool)       in a match: prevent browser defaults of bound keys and guard against Ctrl+W (beforeunload)
       fullscreen()              fullscreen + keyboard lock (Ctrl+W, Tab... reach the game), best effort
       on(fn) -> off             fn(type 'down'|'up', action) for UI that reacts immediately (scoreboard hold, menus)
       beginTick(), frame(dt)    called by loop.js
       inject(action, down), injectLook(dxRad, dyRad), injectMove(mx, mz)   tests / bots driving the local player
       pad -> { connected, id }  basic gamepad (standard mapping, fixed layout) }
   Codes: KeyboardEvent.code ('KeyW', 'Space', 'ControlLeft'), 'Mouse1'..'Mouse5' (1 = left, 2 = right, 3 = middle),
   'WheelUp' / 'WheelDown', gamepad 'Pad0'..'Pad15' (not rebindable). Mouse buttons and the wheel only count while the
   pointer is locked (Input.mouseUnlocked = true lifts that for tests and menus that want it). */
import { Settings } from './settings.js';
import { appBus } from './events.js';

const DEG = Math.PI / 180;

export const ACTIONS = [
  { id: 'forward', label: 'Move forward', group: 'Movement', def: ['KeyW'] },
  { id: 'back', label: 'Move back', group: 'Movement', def: ['KeyS'] },
  { id: 'left', label: 'Strafe left', group: 'Movement', def: ['KeyA'] },
  { id: 'right', label: 'Strafe right', group: 'Movement', def: ['KeyD'] },
  { id: 'jump', label: 'Jump / mantle', group: 'Movement', def: ['Space'] },
  { id: 'crouch', label: 'Crouch', group: 'Movement', def: ['ControlLeft'] },
  { id: 'walk', label: 'Walk (quiet)', group: 'Movement', def: ['ShiftLeft'] },
  { id: 'leanL', label: 'Lean left', group: 'Movement', def: ['KeyQ'] },
  { id: 'leanR', label: 'Lean right', group: 'Movement', def: ['KeyE'] },
  { id: 'fire', label: 'Fire', group: 'Combat', def: ['Mouse1'] },
  { id: 'ads', label: 'Aim down sights', group: 'Combat', def: ['Mouse2'] },
  { id: 'reload', label: 'Reload', group: 'Combat', def: ['KeyR'] },
  { id: 'firemode', label: 'Fire mode', group: 'Combat', def: ['KeyX'] },
  { id: 'alt', label: 'Laser / light', group: 'Combat', def: ['Mouse3'] },
  { id: 'inspect', label: 'Inspect weapon', group: 'Combat', def: ['KeyV'] },
  { id: 'use', label: 'Use / interact', group: 'Combat', def: ['KeyF'] },
  { id: 'drop', label: 'Drop weapon', group: 'Combat', def: ['KeyG'] },
  { id: 'slot1', label: 'Primary weapon', group: 'Weapons', def: ['Digit1'] },
  { id: 'slot2', label: 'Sidearm', group: 'Weapons', def: ['Digit2'] },
  { id: 'slot3', label: 'Knife', group: 'Weapons', def: ['Digit3'] },
  { id: 'slot4', label: 'Grenades', group: 'Weapons', def: ['Digit4'] },
  { id: 'slot5', label: 'Objective item', group: 'Weapons', def: ['Digit5'] },
  { id: 'cycleGrenade', label: 'Next grenade', group: 'Weapons', def: ['Digit4'] },
  { id: 'grenade', label: 'Quick grenade', group: 'Weapons', def: ['KeyC'] },
  { id: 'next', label: 'Next weapon', group: 'Weapons', def: ['WheelDown'] },
  { id: 'prev', label: 'Previous weapon', group: 'Weapons', def: ['WheelUp'] },
  { id: 'buy', label: 'Buy menu', group: 'Interface', def: ['KeyB'] },
  { id: 'scoreboard', label: 'Scoreboard (hold)', group: 'Interface', def: ['Tab'] },
  { id: 'chat', label: 'Chat (all)', group: 'Communication', def: ['KeyY'] },
  { id: 'teamchat', label: 'Chat (team)', group: 'Communication', def: ['KeyU'] },
  { id: 'voice', label: 'Push to talk', group: 'Communication', def: ['KeyT'] },
  { id: 'menu', label: 'Menu', group: 'Interface', def: ['Escape'] },
];
export const DEFAULT_BINDS = Object.fromEntries(ACTIONS.map(a => [a.id, a.def.slice()]));
const IDS = new Set(ACTIONS.map(a => a.id));
// codes the same default may share (one key, two actions on purpose)
const SHARED = new Set(['Digit4']);
const RESERVED = new Set(['F5', 'F11', 'F12', 'MetaLeft', 'MetaRight', 'ContextMenu']);

// gamepad, standard mapping (fixed layout): button index -> action
const PAD = { 0: 'jump', 1: 'crouch', 2: 'reload', 3: 'next', 4: 'grenade', 5: 'use', 6: 'ads', 7: 'fire', 8: 'scoreboard', 9: 'menu',
  10: 'walk', 11: 'slot3', 12: 'slot1', 13: 'slot4', 14: 'leanL', 15: 'leanR' };

let canvas = null, attached = false;
let codeMap = new Map();                 // code -> [actions]
let effBinds = {};
const codesDown = new Set();
const actDown = Object.create(null), latch = Object.create(null), tapped = Object.create(null), rel = Object.create(null);
const pNow = Object.create(null), tNow = Object.create(null), rNow = Object.create(null);
let mdx = 0, mdy = 0, padLX = 0, padLY = 0;
let sensMul = 1, textMode = false, gameActive = false, wantUnlock = false, lockAt = 0, escAt = -1e9;
let captureResolve = null;
const listeners = new Set();
const LOOK = { dx: 0, dy: 0 }, MV = { mx: 0, mz: 0 };
const injMove = { on: false, mx: 0, mz: 0 };
const pad = { connected: false, id: '', index: -1, prev: [], mx: 0, mz: 0 };
let layoutMap = null;

function rebuild() {
  const custom = Settings.get('binds') || {};
  effBinds = {};
  for (const a of ACTIONS) effBinds[a.id] = Array.isArray(custom[a.id]) ? custom[a.id].slice(0, 2) : a.def.slice();
  codeMap = new Map();
  for (const id in effBinds) for (const c of effBinds[id]) { if (!c) continue; if (!codeMap.has(c)) codeMap.set(c, []); codeMap.get(c).push(id); }
}

function emit(type, a) { for (const fn of listeners) { try { fn(type, a); } catch (e) { console.error('[input] listener failed', e); } } }

function pressCode(code) {
  if (codesDown.has(code)) return;
  codesDown.add(code);
  const acts = code.startsWith('Pad') ? (PAD[+code.slice(3)] ? [PAD[+code.slice(3)]] : null) : codeMap.get(code);
  if (!acts) return;
  for (const a of acts) {
    if (actDown[a]) continue;
    actDown[a] = true; latch[a] = true; tapped[a] = true;
    emit('down', a);
  }
}
function stillHeld(a, except) {
  for (const c of effBinds[a] || []) if (c !== except && codesDown.has(c)) return true;
  for (const k in PAD) if (PAD[k] === a && codesDown.has('Pad' + k) && 'Pad' + k !== except) return true;
  return false;
}
function releaseCode(code) {
  if (!codesDown.delete(code)) return;
  const acts = code.startsWith('Pad') ? (PAD[+code.slice(3)] ? [PAD[+code.slice(3)]] : null) : codeMap.get(code);
  if (!acts) return;
  for (const a of acts) if (actDown[a] && !stillHeld(a, code)) { actDown[a] = false; rel[a] = true; emit('up', a); }
}
function releaseAll() {
  for (const c of Array.from(codesDown)) if (!c.startsWith('Pad')) releaseCode(c);
}

const isTypingTarget = t => !!(t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable));
const MOUSE_CODE = ['Mouse1', 'Mouse3', 'Mouse2', 'Mouse4', 'Mouse5'];

function onKeyDown(e) {
  if (captureResolve) {
    e.preventDefault(); e.stopPropagation();
    const r = captureResolve; captureResolve = null;
    r(e.code === 'Escape' || RESERVED.has(e.code) ? null : e.code); return;
  }
  if (e.code === 'Escape') escAt = performance.now();
  if (textMode || isTypingTarget(e.target)) return;
  const bound = codeMap.has(e.code);
  if (bound && (gameActive || document.pointerLockElement === canvas) && e.code !== 'Escape' && !RESERVED.has(e.code)) e.preventDefault();
  if (e.repeat) return;
  pressCode(e.code);
}
function onKeyUp(e) { releaseCode(e.code); }
function mouseOk() { return document.pointerLockElement === canvas || Input.mouseUnlocked; }
function onMouseDown(e) {
  const code = MOUSE_CODE[e.button] || ('Mouse' + (e.button + 1));
  if (captureResolve) { e.preventDefault(); const r = captureResolve; captureResolve = null; r(code); return; }
  if (!mouseOk() || textMode) return;
  if (e.target === canvas || document.pointerLockElement === canvas) e.preventDefault();
  pressCode(code);
}
function onMouseUp(e) { releaseCode(MOUSE_CODE[e.button] || ('Mouse' + (e.button + 1))); }
function onMouseMove(e) {
  if (document.pointerLockElement !== canvas) return;
  let x = e.movementX || 0, y = e.movementY || 0;
  // some platforms report one huge bogus delta right after the lock engages
  if (performance.now() - lockAt < 120 && (Math.abs(x) > 400 || Math.abs(y) > 400)) return;
  mdx += x; mdy += y;
}
function onWheel(e) {
  if (captureResolve) { e.preventDefault(); const r = captureResolve; captureResolve = null; r(e.deltaY < 0 ? 'WheelUp' : 'WheelDown'); return; }
  if (!mouseOk() || textMode || !e.deltaY) return;
  e.preventDefault();
  const code = e.deltaY < 0 ? 'WheelUp' : 'WheelDown';
  pressCode(code); releaseCode(code);
}
function onLockChange() {
  const locked = document.pointerLockElement === canvas;
  if (locked) lockAt = performance.now();
  else {
    releaseAll(); mdx = 0; mdy = 0;
    // Esc while locked: the browser exits the lock and usually eats the key; when it also delivered the keydown, do not
    // fire 'menu' twice (open + close)
    if (!wantUnlock && performance.now() - escAt > 400) { latch.menu = true; emit('down', 'menu'); emit('up', 'menu'); }
  }
  wantUnlock = false;
  appBus.emit('input:lock', { locked });
}
function onBlur() { releaseAll(); }
function onContext(e) { if (e.target === canvas || document.pointerLockElement === canvas) e.preventDefault(); }
function onBeforeUnload(e) { if (gameActive) { e.preventDefault(); e.returnValue = ''; return ''; } }

const ST = { x: 0, y: 0 };
function stick(x, y, dz) {     // radial dead zone, rescaled to 0..1 (writes ST: no allocation per frame)
  const l = Math.hypot(x, y);
  if (l < dz || l === 0) { ST.x = 0; ST.y = 0; return; }
  const k = Math.min(1, (l - dz) / (1 - dz)) / l; ST.x = x * k; ST.y = y * k;
}
function pollPad(dt) {
  const list = navigator.getGamepads ? navigator.getGamepads() : null;
  let gp = null;
  if (list) for (const g of list) if (g && g.connected && g.mapping === 'standard') { gp = g; break; }
  if (!gp) { if (pad.connected) { pad.connected = false; for (let i = 0; i < 16; i++) releaseCode('Pad' + i); pad.mx = pad.mz = 0; } return; }
  pad.connected = true; pad.id = gp.id; pad.index = gp.index;
  for (let i = 0; i < 16; i++) {
    const b = gp.buttons[i]; if (!b) continue;
    const on = i === 6 || i === 7 ? b.value > 0.35 : b.pressed;
    if (on) pressCode('Pad' + i); else releaseCode('Pad' + i);
  }
  const dz = Settings.get('padDeadzone');
  stick(gp.axes[0] || 0, gp.axes[1] || 0, dz);
  pad.mx = ST.x; pad.mz = -ST.y;
  stick(gp.axes[2] || 0, gp.axes[3] || 0, dz);
  const rx = ST.x, ry = ST.y;
  const mag = Math.hypot(rx, ry);
  if (mag > 0) {
    const rate = 3.6 * Settings.get('padSens') * sensMul * (0.35 + 0.65 * mag * mag) / mag;   // rad/s, curved
    padLX += rx * rate * dt; padLY += ry * rate * dt * (Settings.get('padInvertY') ? -1 : 1);
  }
}

export const Input = {
  ACTIONS, mouseUnlocked: false,
  get locked() { return !!canvas && document.pointerLockElement === canvas; },
  get typing() { return textMode; },
  get pad() { return { connected: pad.connected, id: pad.id }; },

  attach(cv) {
    if (attached) return;
    canvas = cv; attached = true; rebuild();
    window.addEventListener('keydown', onKeyDown, { capture: true });
    window.addEventListener('keyup', onKeyUp, { capture: true });
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('blur', onBlur);
    window.addEventListener('contextmenu', onContext);
    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('pointerlockchange', onLockChange);
    document.addEventListener('visibilitychange', () => { if (document.hidden) releaseAll(); });
    Settings.onChange(({ key }) => { if (key === 'binds') { releaseAll(); rebuild(); } });
    if (navigator.keyboard && navigator.keyboard.getLayoutMap) navigator.keyboard.getLayoutMap().then(m => { layoutMap = m; }).catch(() => {});
  },
  detach() {
    if (!attached) return; attached = false;
    window.removeEventListener('keydown', onKeyDown, { capture: true }); window.removeEventListener('keyup', onKeyUp, { capture: true });
    window.removeEventListener('mousedown', onMouseDown); window.removeEventListener('mouseup', onMouseUp);
    window.removeEventListener('mousemove', onMouseMove); window.removeEventListener('wheel', onWheel);
    window.removeEventListener('blur', onBlur); window.removeEventListener('contextmenu', onContext);
    window.removeEventListener('beforeunload', onBeforeUnload); document.removeEventListener('pointerlockchange', onLockChange);
  },

  async lock() {
    if (!canvas) return false;
    if (document.pointerLockElement === canvas) return true;
    const raw = Settings.get('rawInput');
    try {
      const p = raw ? canvas.requestPointerLock({ unadjustedMovement: true }) : canvas.requestPointerLock();
      if (p && typeof p.then === 'function') await p;
      return true;
    } catch (e) {
      if (raw && e && e.name === 'NotSupportedError') {
        try { const p2 = canvas.requestPointerLock(); if (p2 && p2.then) await p2; return true; } catch (e2) { /* fall through */ }
      }
      appBus.emit('input:lockfail', { error: (e && e.message) || String(e) });
      return false;
    }
  },
  unlock() { if (document.pointerLockElement) { wantUnlock = true; document.exitPointerLock(); } },

  down(a) { return !!(actDown[a] || tNow[a]); },
  pressed(a) { return !!pNow[a]; },
  released(a) { return !!rNow[a]; },
  consume(a) { const v = !!(latch[a] || pNow[a]); latch[a] = false; pNow[a] = false; return v; },
  held(a) { return !!actDown[a]; },

  look() {
    const k = Settings.get('sens') * 0.022 * DEG * sensMul;
    LOOK.dx = mdx * k + padLX;
    LOOK.dy = (mdy * k) * (Settings.get('invertY') ? -1 : 1) + padLY;
    mdx = 0; mdy = 0; padLX = 0; padLY = 0;
    return LOOK;
  },
  move() {
    if (injMove.on) { MV.mx = injMove.mx; MV.mz = injMove.mz; return MV; }
    let mx = (this.down('right') ? 1 : 0) - (this.down('left') ? 1 : 0);
    let mz = (this.down('forward') ? 1 : 0) - (this.down('back') ? 1 : 0);
    if (pad.connected && (pad.mx || pad.mz)) { mx = Math.max(-1, Math.min(1, mx + pad.mx)); mz = Math.max(-1, Math.min(1, mz + pad.mz)); }
    MV.mx = mx; MV.mz = mz; return MV;
  },
  setSensMul(k) { sensMul = Number.isFinite(+k) && +k > 0 ? +k : 1; },

  binds() { const o = {}; for (const k in effBinds) o[k] = effBinds[k].slice(); return o; },
  bind(action, code, slot = 0) {
    if (!IDS.has(action) || !code || RESERVED.has(code) || code.startsWith('Pad')) return false;
    const custom = Object.assign({}, Settings.get('binds') || {});
    // the key moves to this action: take it off every other action first
    for (const a of ACTIONS) {
      if (a.id === action) continue;
      const cur = custom[a.id] || effBinds[a.id] || [];
      if (cur.includes(code) && !(SHARED.has(code) && a.def.includes(code) && DEFAULT_BINDS[action].includes(code))) custom[a.id] = cur.filter(c => c !== code);
    }
    const mine = (custom[action] || effBinds[action] || []).slice(0, 2);
    while (mine.length < slot) mine.push('');
    mine[Math.min(slot, 1)] = code;
    custom[action] = mine.filter((c, i, arr) => c && arr.indexOf(c) === i);
    Settings.set('binds', custom);
    return true;
  },
  unbind(action, slot = 0) {
    if (!IDS.has(action)) return;
    const custom = Object.assign({}, Settings.get('binds') || {});
    const mine = (custom[action] || effBinds[action] || []).slice(0, 2); mine.splice(slot, 1);
    custom[action] = mine; Settings.set('binds', custom);
  },
  resetBinds() { Settings.set('binds', {}); },
  codeName(code) {
    if (!code) return '—';
    if (layoutMap && layoutMap.get(code)) { const v = layoutMap.get(code); if (v && v.trim()) return v.toUpperCase(); }
    const M = { Space: 'SPACE', ControlLeft: 'L-CTRL', ControlRight: 'R-CTRL', ShiftLeft: 'L-SHIFT', ShiftRight: 'R-SHIFT', AltLeft: 'L-ALT',
      AltRight: 'R-ALT', Tab: 'TAB', Escape: 'ESC', Enter: 'ENTER', Backspace: 'BKSP', CapsLock: 'CAPS', Backquote: '`', Minus: '-', Equal: '=',
      BracketLeft: '[', BracketRight: ']', Backslash: '\\', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/',
      ArrowUp: 'UP', ArrowDown: 'DOWN', ArrowLeft: 'LEFT', ArrowRight: 'RIGHT', WheelUp: 'WHEEL UP', WheelDown: 'WHEEL DOWN',
      Mouse1: 'MOUSE 1', Mouse2: 'MOUSE 2', Mouse3: 'MOUSE 3', Mouse4: 'MOUSE 4', Mouse5: 'MOUSE 5', Insert: 'INS', Delete: 'DEL',
      Home: 'HOME', End: 'END', PageUp: 'PGUP', PageDown: 'PGDN' };
    if (M[code]) return M[code];
    if (code.startsWith('Key')) return code.slice(3);
    if (code.startsWith('Digit')) return code.slice(5);
    if (code.startsWith('Numpad')) return 'NUM ' + code.slice(6).toUpperCase();
    return code.toUpperCase();
  },
  keyLabel(action) { const b = effBinds[action]; return b && b[0] ? this.codeName(b[0]) : 'UNBOUND'; },
  capture() {
    if (captureResolve) { const r = captureResolve; captureResolve = null; r(null); }
    releaseAll();
    return new Promise(res => { captureResolve = res; });
  },

  onText(on) { textMode = !!on; if (textMode) { releaseAll(); } },
  setGameActive(on) { gameActive = !!on; if (!on) releaseAll(); },
  async fullscreen() {
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
      if (navigator.keyboard && navigator.keyboard.lock) {
        const codes = Array.from(codeMap.keys()).filter(c => !c.startsWith('Mouse') && !c.startsWith('Wheel') && c !== 'Escape');
        await navigator.keyboard.lock(codes.concat(['KeyW', 'Tab']));
      }
      return true;
    } catch (e) { return false; }
  },
  on(fn) { listeners.add(fn); return () => listeners.delete(fn); },

  beginTick() {
    for (const k in pNow) pNow[k] = false;
    for (const k in tNow) tNow[k] = false;
    for (const k in rNow) rNow[k] = false;
    for (const k in latch) if (latch[k]) { pNow[k] = true; latch[k] = false; }
    for (const k in tapped) if (tapped[k]) { tNow[k] = true; tapped[k] = false; }
    for (const k in rel) if (rel[k]) { rNow[k] = true; rel[k] = false; }
  },
  frame(dt) { if (attached) pollPad(dt); },

  inject(a, down) { if (!IDS.has(a)) return; if (down) { if (!actDown[a]) { actDown[a] = true; latch[a] = true; tapped[a] = true; emit('down', a); } } else if (actDown[a]) { actDown[a] = false; rel[a] = true; emit('up', a); } },
  injectLook(dx, dy) { padLX += +dx || 0; padLY += +dy || 0; },
  injectMove(mx, mz) { if (mx == null) { injMove.on = false; return; } injMove.on = true; injMove.mx = +mx || 0; injMove.mz = +mz || 0; },
  clear() { releaseAll(); for (const k in actDown) actDown[k] = false; mdx = mdy = padLX = padLY = 0; },
};

rebuild();
