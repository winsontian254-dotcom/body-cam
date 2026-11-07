/* LIVE FIRE — settings store (localStorage lf_settings_v1).
   Exports: DEFAULTS, SECTIONS, Settings = { get(key), set(key, value), all(), onChange(fn) -> off, reset(section?), load() }
   - Keys may be dotted paths into the object-valued keys: get('crosshair.color'), set('crosshair.gap', 2).
   - set('crosshair', {...}) merges over the defaults of that key; set('binds', {...}) replaces the custom binds.
   - Numbers are clamped to RANGE; unknown keys are ignored (with a warning) so a typo never corrupts the store.
   - Every change emits appBus 'settings' { key, value } (key is the top-level key) and calls onChange listeners.
   Mouse sensitivity is CS-style: degrees turned = mouse counts * sens * 0.022 (see input.js). */
import { appBus } from './events.js';

const KEY = 'lf_settings_v1';

export const DEFAULTS = {
  // controls
  sens: 1.25, adsSens: 1.0, invertY: false, rawInput: true, toggleCrouch: false, toggleADS: false, toggleWalk: false,
  padSens: 1.0, padDeadzone: 0.15, padInvertY: false, binds: {},
  // graphics
  fov: 90, quality: 'auto', renderScale: 1, dynRes: true, dynResTarget: 60, maxDpr: 2, lens: 'full', motionBlur: false,
  vsync: true, fpsCap: 0, showFps: false, viewBob: 1,
  // audio
  masterVol: 0.8, sfxVol: 1, musicVol: 0.5, uiVol: 0.7, voiceVol: 1,
  // crosshair
  crosshair: { style: 'cross', color: '#4cff6a', size: 5, gap: 3, thick: 1.5, dot: false, outline: true, alpha: 0.95, dynamic: true },
  // gameplay / interface
  hudScale: 1, colorblind: 'off', showDamage: true, bodycamHud: true,
};

export const SECTIONS = {
  controls: ['sens', 'adsSens', 'invertY', 'rawInput', 'toggleCrouch', 'toggleADS', 'toggleWalk', 'padSens', 'padDeadzone', 'padInvertY', 'binds'],
  graphics: ['fov', 'quality', 'renderScale', 'dynRes', 'dynResTarget', 'maxDpr', 'lens', 'motionBlur', 'vsync', 'fpsCap', 'showFps', 'viewBob'],
  audio: ['masterVol', 'sfxVol', 'musicVol', 'uiVol', 'voiceVol'],
  crosshair: ['crosshair'],
  gameplay: ['hudScale', 'colorblind', 'showDamage', 'bodycamHud'],
};

const RANGE = {
  sens: [0.01, 20], adsSens: [0.1, 3], padSens: [0.1, 5], padDeadzone: [0, 0.6], fov: [60, 110], renderScale: [0.5, 1],
  dynResTarget: [30, 240], maxDpr: [0.75, 3], fpsCap: [0, 500], viewBob: [0, 1], masterVol: [0, 1], sfxVol: [0, 1],
  musicVol: [0, 1], uiVol: [0, 1], voiceVol: [0, 1], hudScale: [0.6, 1.5],
  'crosshair.size': [0, 40], 'crosshair.gap': [-5, 30], 'crosshair.thick': [0.5, 10], 'crosshair.alpha': [0, 1],
};
const ENUM = {
  quality: ['auto', 'low', 'medium', 'high', 'ultra'], lens: ['full', 'subtle', 'off'],
  colorblind: ['off', 'protan', 'deutan', 'tritan'], 'crosshair.style': ['cross', 'dot', 'circle', 'tshape', 'cross-circle'],
};

const clone = v => (v && typeof v === 'object' ? JSON.parse(JSON.stringify(v)) : v);
let data = clone(DEFAULTS);
const listeners = new Set();

function sanitize(path, v, def) {
  if (typeof def === 'number') {
    v = +v; if (!Number.isFinite(v)) return def;
    const r = RANGE[path]; return r ? Math.min(r[1], Math.max(r[0], v)) : v;
  }
  if (typeof def === 'boolean') return !!v;
  if (typeof def === 'string') { v = String(v); const e = ENUM[path]; return e && !e.includes(v) ? def : v; }
  return v;
}
function mergeObj(path, def, v) {
  const out = clone(def);
  if (!v || typeof v !== 'object') return out;
  if (path === 'binds') {   // { action: [codes] } — kept as given (validated by input.js)
    const b = {}; for (const k in v) if (Array.isArray(v[k])) b[k] = v[k].filter(c => typeof c === 'string').slice(0, 2); return b;
  }
  for (const k in def) if (k in v) out[k] = sanitize(path + '.' + k, v[k], def[k]);
  return out;
}

function persist() { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* private mode / quota: settings stay in memory */ } }
function notify(key) {
  const value = clone(data[key]);
  for (const fn of listeners) { try { fn({ key, value }); } catch (e) { console.error('[settings] listener failed', e); } }
  appBus.emit('settings', { key, value });
}

export const Settings = {
  load() {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { saved = null; }
    data = clone(DEFAULTS);
    if (saved && typeof saved === 'object') {
      for (const k in DEFAULTS) {
        if (!(k in saved)) continue;
        const def = DEFAULTS[k];
        data[k] = def && typeof def === 'object' ? mergeObj(k, def, saved[k]) : sanitize(k, saved[k], def);
      }
    }
    return this.all();
  },
  get(key) {
    if (!key.includes('.')) return clone(data[key]);
    const [a, b] = key.split('.'); return data[a] && typeof data[a] === 'object' ? clone(data[a][b]) : undefined;
  },
  set(key, value) {
    if (key.includes('.')) {
      const [a, b] = key.split('.');
      const def = DEFAULTS[a];
      if (!def || typeof def !== 'object' || (a !== 'binds' && !(b in def))) { console.warn('[settings] unknown key', key); return; }
      if (a === 'binds') data.binds = mergeObj('binds', {}, Object.assign({}, data.binds, { [b]: value }));
      else data[a][b] = sanitize(key, value, def[b]);
      persist(); notify(a); return;
    }
    if (!(key in DEFAULTS)) { console.warn('[settings] unknown key', key); return; }
    const def = DEFAULTS[key];
    data[key] = def && typeof def === 'object' ? mergeObj(key, def, value) : sanitize(key, value, def);
    persist(); notify(key);
  },
  all() { return clone(data); },
  onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  reset(section) {
    const keys = section ? SECTIONS[section] || [] : Object.keys(DEFAULTS);
    for (const k of keys) data[k] = clone(DEFAULTS[k]);
    persist(); for (const k of keys) notify(k);
  },
};

Settings.load();
