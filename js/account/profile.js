/* LIVE FIRE — progression: XP and levels (1-100), credits, owned guns / attachments / skins / grenades, level unlocks, per-gun
   mastery, 5 loadouts, lifetime + per-mode stats, match recording, and the cloud sync of all of it (docs/ARCHITECTURE.md §11).
   Exports:
     Profile = {
       init()                         load + cloud sync on sign-in, flush on page hide (idempotent; main.js calls it)
       load(), get() -> profile (live object: read it, change it only through the API), save(why?), onChange(fn(p, why)) -> off
       level(), levelInfo(xp?) -> { level, xp, into, need, frac, max }, xpToNext(), xpForLevel(L) (total XP to reach L)
       addXP(n, why) -> gain { xp, from, to, levelUps, unlocks, credits, crates }, addCredits(n, why), credits(), spend(n) -> bool
       owns(kind, id) -> bool         can the player use it now ('gun' (incl. melee) | 'att' | 'skin' | 'nade'): level >= unlockLevel or owned
       isOwned(kind, id), unlock(kind, id) -> bool (grant, e.g. crates), lockInfo(kind, id) -> null | { level, price }
       price(kind, id) -> credits to buy now (0 = nothing to buy), buy(kind, id) -> { ok, reason, price }
       unlocksAt(level) -> [{ kind, id, name, level }], nextUnlocks(n) -> the next n level unlocks
       loadouts() -> [5 sanitized loadouts], loadout(i = selected) -> game loadout { name, primary, secondary, melee, nades, mods, skins }
       setLoadout(i, lo) -> sanitized loadout, select(i), selected() -> index, sanitizeLoadout(lo)
       gunStats(id) -> { xp, kills, hs, shots, hits, dmg, matches, level, into, need, frac }, gunLevel(id)
       stats() -> lifetime stats + derived { kd, accuracy, hsRate, winRate, hours }, modeStats(mode)
       recordMatch(summary) -> result { xp, credits, mult, boost, firstWin, breakdown, levelUps, unlocks, crates, gunLevels, level, ... }
       summarize(game, endEvent, tracker?) -> summary,  track(game) -> off (auto-records at 'match:end'),  autoTrack(LF) (polls LF.game)
       lastMatch                      { summary, result } of the last recorded match (results screens read it)
       sync() -> Promise (pull, merge, push), flush(keepalive?) -> Promise, syncState() -> { state, at, error }, callsign()
       merge(a, b), sanitize(p), fresh(), reset()       (tests / dev)
     }
     LEVEL_MAX, GUN_LEVEL_MAX, LOADOUT_COUNT, NADE_SLOTS, XP, FIRST_WIN, dayKey(ms?), dayNum(key), monthKey(ms?), boardScore(summary)
   Storage: localStorage lf_profile_v1 (+ lf_profile_v1_u<userId> stashes when another account signs in on this device) and the cloud
   save slot 'livefire' (js/account/api.js). Cloud merge: the newest profile is the base (loadouts, names, selection), counters take the
   larger value (XP, stats, per-gun numbers, reward streaks), owned items are united, and credits are kept as two monotonic counters
   (earned, spent) so a purchase on one device and earnings on another both survive. appBus 'profile' { why } on every change,
   'profile:match' { summary, result } after a match. Pure JS apart from localStorage / document (guarded): runs in Node tests. */
import { appBus } from '../core/events.js';
import { hash } from '../core/util.js';
import { GUNS, MELEE, getGun } from '../weapons/data.js';
import { ATTACHMENTS, SLOTS, getAttachment, fits } from '../weapons/attachments.js';
import { GRENADES, getNade, canCarry } from '../grenades/data.js';
import { SKINS } from '../weapons/models.js';
import { Account } from './api.js';

const KEY = 'lf_profile_v1';
export const LEVEL_MAX = 100, GUN_LEVEL_MAX = 20, LOADOUT_COUNT = 5, NADE_SLOTS = 3;
const START_CREDITS = 500;
/** match XP table (before the mode multiplier and boosts) */
export const XP = { kill: 100, headshot: 25, assist: 40, objective: 150, mvp: 100, win: 700, draw: 400, loss: 250, minute: 40, maxMinutes: 25, cap: 30000 };
export const FIRST_WIN = { xp: 1500, credits: 250 };
const SKIN_BY = new Map(SKINS.map(s => [s.id, s]));

// ------------------------------------------------------------------------------------------------ dates (local day, UTC month)
const pad = n => (n < 10 ? '0' : '') + n;
export const dayKey = (ms = Date.now()) => { const d = new Date(ms); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
export const dayNum = key => { const m = /^(\d{4})-(\d\d)-(\d\d)$/.exec(key || ''); return m ? Math.round(Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000) : null; };
export const monthKey = (ms = Date.now()) => { const d = new Date(ms); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1); };

// ------------------------------------------------------------------------------------------------ level curve
/** XP from level L to L + 1: fast early (one match for level 2), slower later (~700 average matches to 100) */
const NEED = [0];
for (let L = 1; L < LEVEL_MAX; L++) NEED[L] = Math.round((1000 + 200 * (L - 1) + 1.5 * Math.pow(L - 1, 2.05)) / 50) * 50;
const CUM = [0, 0];
for (let L = 2; L <= LEVEL_MAX; L++) CUM[L] = CUM[L - 1] + NEED[L - 1];
const xpForLevel = L => CUM[Math.max(1, Math.min(LEVEL_MAX, L | 0))];
function levelOf(xp) { let lo = 1, hi = LEVEL_MAX; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (CUM[m] <= xp) lo = m; else hi = m - 1; } return lo; }
function levelInfo(xp) {
  xp = Math.max(0, Math.floor(xp || 0));
  const level = levelOf(xp), max = level >= LEVEL_MAX;
  const need = max ? 0 : NEED[level], into = xp - CUM[level];
  return { level, xp, into: max ? 0 : into, need, frac: max ? 1 : into / need, max };
}
const GNEED = l => 1000 + 250 * (l - 1);
function gunLevelOf(xp) {
  let l = 1, left = Math.max(0, xp || 0);
  while (l < GUN_LEVEL_MAX && left >= GNEED(l)) { left -= GNEED(l); l++; }
  return { level: l, into: l >= GUN_LEVEL_MAX ? 0 : left, need: l >= GUN_LEVEL_MAX ? 0 : GNEED(l), frac: l >= GUN_LEVEL_MAX ? 1 : left / GNEED(l) };
}
const levelCredits = L => 100 + 10 * L;
/** crates paid on level-ups: every 5th level an attachment crate, every 10th a finish crate, every 25th an evidence locker */
const levelCrate = L => (L % 25 === 0 ? 'elite' : L % 10 === 0 ? 'skin' : L % 5 === 0 ? 'attachment' : null);

// ------------------------------------------------------------------------------------------------ items
const ITEM = { gun: getGun, att: getAttachment, skin: id => SKIN_BY.get(id) || null, nade: getNade };
const KINDS = Object.keys(ITEM);
const item = (kind, id) => (ITEM[kind] ? ITEM[kind](id) : null);
const itemName = (kind, it) => (it && (it.name || it.id)) || '';
function unlocksAt(level) {
  const out = [];
  for (const g of GUNS) if ((g.unlockLevel || 1) === level && level > 1) out.push({ kind: 'gun', id: g.id, name: g.name, level, cat: g.cat });
  for (const g of MELEE) if ((g.unlockLevel || 1) === level && level > 1) out.push({ kind: 'gun', id: g.id, name: g.name, level, cat: 'melee' });
  for (const a of ATTACHMENTS) if ((a.unlockLevel || 1) === level && level > 1) out.push({ kind: 'att', id: a.id, name: a.name, level, cat: a.slot });
  for (const n of GRENADES) if ((n.unlockLevel || 1) === level && level > 1) out.push({ kind: 'nade', id: n.id, name: n.name, level, cat: 'grenade' });
  return out;
}

// ------------------------------------------------------------------------------------------------ fresh profile + default loadouts
const DEFAULT_SETS = [
  { name: 'ASSAULT', primary: 'warden', secondary: 'vogt9', nades: ['frag', 'flash', 'smoke'], mods: { warden: { optic: 'o_reflex', side: 's_light' } } },
  { name: 'CLOSE QUARTERS', primary: 'avispa', secondary: 'vogt9', nades: ['flash', 'flash', 'molotov'], mods: { avispa: { side: 's_light' } } },
  { name: 'RIFLEMAN', primary: 'purga', secondary: 'vogt9', nades: ['frag', 'smoke'], mods: { purga: { optic: 'o_reflex' } } },
  { name: 'BREACHER', primary: 'cacciatore', secondary: 'vogt9', nades: ['flash', 'molotov', 'frag'], mods: {} },
  { name: 'LONG RANGE', primary: 'rook', secondary: 'vogt9', nades: ['smoke', 'flash'], mods: {} },
];
const randSeed = () => (Math.random() * 0x7fffffff) | 0;
function fresh() {
  const now = Date.now();
  return {
    v: 1, seed: randSeed(), owner: null, name: 'Operator', created: now, updated: now,
    xp: 0, cr: { earned: START_CREDITS, spent: 0 },
    owned: { gun: {}, att: {}, skin: { factory: 1 }, nade: {} },
    guns: {}, loadouts: DEFAULT_SETS.map(s => ({ ...s, melee: 'knife', skins: {} })), sel: 0,
    stats: { kills: 0, deaths: 0, assists: 0, headshots: 0, damage: 0, shots: 0, hits: 0, wins: 0, losses: 0, draws: 0, matches: 0, quits: 0,
      playtime: 0, mvps: 0, objectives: 0, bestKills: 0, bestStreak: 0, bestScore: 0, modes: {} },
    rewards: { last: '', lastAt: 0, streak: 0, best: 0, claims: 0, firstWin: '', firstWins: 0 },
    boost: { mult: 1, matches: 0 }, crates: [], opened: [], mxp: {}, seen: { level: 1 },
  };
}

// ------------------------------------------------------------------------------------------------ sanitize (storage, cloud)
const num = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const nn = v => Math.max(0, num(v));
const obj = v => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const str = (v, d = '', n = 40) => (typeof v === 'string' ? v.slice(0, n) : d);
function numTree(src, def) {   // numbers >= 0 only, shaped by def where given
  const out = {};
  for (const k of Object.keys(def || {})) out[k] = typeof def[k] === 'number' ? nn(obj(src)[k]) : def[k];
  for (const [k, v] of Object.entries(obj(src))) {
    if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
    if (typeof v === 'number') out[k] = nn(v); else if (v && typeof v === 'object' && !Array.isArray(v)) out[k] = numTree(v, out[k] && typeof out[k] === 'object' ? out[k] : null);
  }
  return out;
}
function sanitize(p) {
  const f = fresh(); p = obj(p);
  const out = f;
  out.seed = Number.isInteger(p.seed) ? p.seed : f.seed;
  out.owner = p.owner == null ? null : p.owner;
  out.name = str(p.name, 'Operator', 20) || 'Operator';
  out.created = nn(p.created) || f.created; out.updated = nn(p.updated);
  out.xp = Math.floor(nn(p.xp));
  out.cr = { earned: Math.floor(num(obj(p.cr).earned, START_CREDITS)), spent: Math.floor(nn(obj(p.cr).spent)) };
  if (out.cr.earned < 0) out.cr.earned = 0;
  if (out.cr.spent > out.cr.earned) out.cr.spent = out.cr.earned;
  for (const k of KINDS) {
    const o = {};
    for (const id of Object.keys(obj(obj(p.owned)[k]))) if (item(k, id)) o[item(k, id).id] = 1;
    out.owned[k] = o;
  }
  out.owned.skin.factory = 1;
  out.guns = {};
  for (const [id, g] of Object.entries(obj(p.guns))) if (getGun(id)) out.guns[getGun(id).id] = numTree(g, { xp: 0, kills: 0, hs: 0, shots: 0, hits: 0, dmg: 0, matches: 0 });
  out.stats = numTree(p.stats, f.stats);
  out.stats.modes = numTree(obj(p.stats).modes, {});
  const r = obj(p.rewards);
  out.rewards = { last: dayNum(r.last) != null ? r.last : '', lastAt: nn(r.lastAt), streak: Math.floor(nn(r.streak)), best: Math.floor(nn(r.best)),
    claims: Math.floor(nn(r.claims)), firstWin: dayNum(r.firstWin) != null ? r.firstWin : '', firstWins: Math.floor(nn(r.firstWins)) };
  const b = obj(p.boost);
  out.boost = { mult: Math.min(3, Math.max(1, num(b.mult, 1))), matches: Math.min(20, Math.floor(nn(b.matches))) };
  if (!out.boost.matches) out.boost.mult = 1;
  out.crates = (Array.isArray(p.crates) ? p.crates : []).filter(c => c && typeof c.id === 'string' && ['attachment', 'skin', 'elite'].includes(c.kind))
    .slice(0, 50).map(c => ({ id: c.id.slice(0, 40), kind: c.kind, from: str(c.from, '', 40), t: nn(c.t) }));
  out.opened = (Array.isArray(p.opened) ? p.opened : []).filter(x => typeof x === 'string').slice(-80);
  out.mxp = {};
  for (const [m, v] of Object.entries(obj(p.mxp))) if (/^\d{4}-\d\d$/.test(m)) out.mxp[m] = Math.floor(nn(v));
  out.seen = { level: Math.max(1, Math.floor(num(obj(p.seen).level, 1))) };
  out.sel = Math.min(LOADOUT_COUNT - 1, Math.max(0, Math.floor(num(p.sel, 0))));
  const los = Array.isArray(p.loadouts) ? p.loadouts : [];
  out.loadouts = [];      // ownership (level, owned items) of `out` is final above: loadouts are checked against it
  for (let i = 0; i < LOADOUT_COUNT; i++) out.loadouts.push(sanitizeLoadout(los[i] || f.loadouts[i], i, out));
  return out;
}

// ------------------------------------------------------------------------------------------------ state + persistence
let P = null;
const subs = new Set();
const readLS = k => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };
const writeLS = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };
const stashKey = id => KEY + '_u' + String(id).replace(/[^\w-]/g, '');
function emit(why) {
  for (const f of subs) { try { f(P, why); } catch (e) { console.error('[profile] listener failed', e); } }
  appBus.emit('profile', { why });
}
function persist() { writeLS(KEY, P); }
function load() {
  const saved = readLS(KEY);
  const prev = P;
  P = sanitize(saved || fresh());
  if (!saved) { P.updated = Date.now(); persist(); }
  if (prev !== P) emit('load');
  return P;
}
const get = () => P || load();
function save(why = 'save') { const p = get(); p.updated = Math.max(Date.now(), (p.updated || 0) + 1); persist(); emit(why); scheduleUpload(); return p; }

// ------------------------------------------------------------------------------------------------ ownership + economy
const lvl = (p = get()) => levelOf(p.xp);
function owns(kind, id, p = get()) {
  const it = item(kind, id); if (!it) return false;
  if (kind === 'skin') return it.id === 'factory' || !!p.owned.skin[it.id];
  return lvl(p) >= (it.unlockLevel || 1) || !!p.owned[kind][it.id];
}
const isOwned = (kind, id) => { const it = item(kind, id); return !!(it && get().owned[kind] && get().owned[kind][it.id]); };
function unlock(kind, id) {
  const it = item(kind, id); if (!it || !get().owned[kind]) return false;
  if (get().owned[kind][it.id]) return false;
  get().owned[kind][it.id] = 1; save('unlock'); return true;
}
function price(kind, id) {
  const it = item(kind, id); if (!it || owns(kind, id)) return 0;
  if (kind === 'skin') return Math.max(100, it.price || 500);
  const gap = Math.max(1, (it.unlockLevel || 1) - lvl());
  const base = kind === 'gun' ? (it.price || 1000) * 1.2 + 90 * gap : kind === 'att' ? (it.price || 300) * 1.5 + 60 * gap : (it.price || 300) * 2 + 50 * gap;
  return Math.round(base / 50) * 50;
}
function lockInfo(kind, id) {
  const it = item(kind, id); if (!it || owns(kind, id)) return null;
  return { level: kind === 'skin' ? null : it.unlockLevel || 1, price: price(kind, id) };
}
const credits = () => Math.max(0, get().cr.earned - get().cr.spent);
function addCredits(n, why = 'credits') { n = Math.floor(num(n)); if (n <= 0) return credits(); get().cr.earned += n; save(why); return credits(); }
function spend(n, why = 'spend') { n = Math.floor(num(n)); if (n < 0 || credits() < n) return false; get().cr.spent += n; save(why); return true; }
function buy(kind, id) {
  const it = item(kind, id);
  if (!it) return { ok: false, reason: 'Unknown item.' };
  if (owns(kind, id)) return { ok: false, reason: 'Already unlocked.', price: 0 };
  const cost = price(kind, id);
  if (credits() < cost) return { ok: false, reason: 'Not enough credits.', price: cost };
  get().cr.spent += cost; get().owned[kind][it.id] = 1; save('buy');
  return { ok: true, price: cost, item: { kind, id: it.id, name: itemName(kind, it) } };
}

/** XP with level-ups, level credits, unlock list and level crates. Does not save (callers batch). */
function gainXP(n) {
  const p = get(); n = Math.max(0, Math.floor(num(n)));
  const from = levelOf(p.xp);
  p.xp += n;
  const mk = monthKey(); p.mxp[mk] = (p.mxp[mk] || 0) + n;
  const keys = Object.keys(p.mxp).sort(); while (keys.length > 4) delete p.mxp[keys.shift()];
  const to = levelOf(p.xp);
  const out = { xp: n, from, to, levelUps: [], unlocks: [], credits: 0, crates: [] };
  for (let L = from + 1; L <= to; L++) {
    out.levelUps.push(L); out.credits += levelCredits(L);
    out.unlocks.push(...unlocksAt(L));
    const c = levelCrate(L);
    if (c) { const cr = { id: 'lv' + L, kind: c, from: 'LEVEL ' + L, t: Date.now() }; if (!p.crates.some(x => x.id === cr.id) && !p.opened.includes(cr.id)) { p.crates.push(cr); out.crates.push(cr); } }
  }
  if (out.credits) p.cr.earned += out.credits;
  return out;
}
function addXP(n, why = 'xp') { const g = gainXP(n); save(why); if (g.levelUps.length) appBus.emit('profile:level', g); return g; }

// ------------------------------------------------------------------------------------------------ loadouts
const PRIM = GUNS.filter(g => g.slot === 'primary'), SEC = GUNS.filter(g => g.slot === 'secondary');
function firstOwned(list, pref, p) { if (pref && owns('gun', pref, p)) return getGun(pref).id; const g = list.find(x => owns('gun', x.id, p)); return g ? g.id : list[0].id; }
function sanitizeMods(gunId, mods, p) {
  const g = getGun(gunId), out = {};
  if (!g) return out;
  for (const [slot, attId] of Object.entries(obj(mods))) {
    if (!SLOTS.includes(slot) || !attId) continue;
    const a = getAttachment(attId);
    if (a && a.slot === slot && fits(g, a) && owns('att', a.id, p)) out[slot] = a.id;
  }
  return out;
}
function sanitizeLoadout(lo, i = 0, p = get()) {
  lo = obj(lo);
  const def = DEFAULT_SETS[i % DEFAULT_SETS.length];
  const pg = getGun(lo.primary), sg = getGun(lo.secondary), mg = getGun(lo.melee);
  const primary = pg && pg.slot === 'primary' && owns('gun', pg.id, p) ? pg.id : firstOwned(PRIM, def.primary, p);
  const secondary = sg && sg.slot === 'secondary' && owns('gun', sg.id, p) ? sg.id : firstOwned(SEC, def.secondary, p);
  const melee = mg && mg.cat === 'melee' && owns('gun', mg.id, p) ? mg.id : 'knife';
  const nades = [], inv = [];
  for (const raw of Array.isArray(lo.nades) ? lo.nades : []) {
    if (nades.length >= NADE_SLOTS) break;
    const n = getNade(raw); if (!n || !owns('nade', n.id, p)) continue;
    if (!canCarry(inv, n.id).ok) continue;
    nades.push(n.id); const e = inv.find(x => x.gid === n.id); if (e) e.n++; else inv.push({ gid: n.id, n: 1 });
  }
  const mods = {};
  for (const [gid, m] of Object.entries(obj(lo.mods))) { const g = getGun(gid); if (g && g.cat !== 'melee') { const s = sanitizeMods(g.id, m, p); if (Object.keys(s).length) mods[g.id] = s; } }
  const skins = {};
  for (const [gid, sk] of Object.entries(obj(lo.skins))) { const g = getGun(gid); if (g && SKIN_BY.has(sk) && sk !== 'factory' && owns('skin', sk, p)) skins[g.id] = sk; }
  const name = (str(lo.name, '', 20).replace(/[\u0000-\u001f<>&"]/g, '').trim() || def.name).toUpperCase();
  return { name, primary, secondary, melee, nades, mods, skins };
}
function loadouts() { return get().loadouts.map((lo, i) => sanitizeLoadout(lo, i)); }
function loadout(i = get().sel) {
  const lo = sanitizeLoadout(get().loadouts[i] || {}, i);
  return { name: lo.name, primary: lo.primary, secondary: lo.secondary, melee: lo.melee, nades: lo.nades.slice(),
    mods: { [lo.primary]: lo.mods[lo.primary] || {}, [lo.secondary]: lo.mods[lo.secondary] || {} },
    skins: { [lo.primary]: lo.skins[lo.primary] || 'factory', [lo.secondary]: lo.skins[lo.secondary] || 'factory' }, all: lo };
}
function setLoadout(i, lo) {
  i = Math.min(LOADOUT_COUNT - 1, Math.max(0, i | 0));
  const cur = get().loadouts[i] || {};
  // keep the mods / skins of guns that are not in this edit (switching guns back and forth keeps their attachments)
  const merged = { ...cur, ...obj(lo), mods: { ...obj(cur.mods), ...obj(obj(lo).mods) }, skins: { ...obj(cur.skins), ...obj(obj(lo).skins) } };
  get().loadouts[i] = sanitizeLoadout(merged, i);
  save('loadout'); return get().loadouts[i];
}
function select(i) { get().sel = Math.min(LOADOUT_COUNT - 1, Math.max(0, i | 0)); save('select'); return get().sel; }

// ------------------------------------------------------------------------------------------------ stats
function gunStats(id) {
  const g = getGun(id); const s = (g && get().guns[g.id]) || { xp: 0, kills: 0, hs: 0, shots: 0, hits: 0, dmg: 0, matches: 0 };
  return { ...s, ...gunLevelOf(s.xp) };
}
function deriveStats(s) {
  return { ...s, kd: s.deaths ? s.kills / s.deaths : s.kills, accuracy: s.shots ? Math.min(1, s.hits / s.shots) : 0, hsRate: s.kills ? s.headshots / s.kills : 0,
    winRate: s.matches ? s.wins / s.matches : 0, hours: s.playtime / 3600 };
}
const stats = () => deriveStats(get().stats);
const modeStats = m => deriveStats({ kills: 0, deaths: 0, headshots: 0, shots: 0, hits: 0, wins: 0, matches: 0, playtime: 0, ...obj(get().stats.modes[m]) });

// ------------------------------------------------------------------------------------------------ matches
const MODE_NAMES = { practice: 'PRACTICE' };
/** leaderboard points of one match (lf:<mode>:<month> and lf:<mode>:all keep each player's best match) */
export function boardScore(s) {
  return Math.min(100000, Math.max(0, Math.round(nn(s.kills) * 100 + nn(s.assists) * 40 + nn(s.headshots) * 25 + nn(s.objectives) * 150 + nn(s.mvps) * 50
    + (s.result === 'win' ? 500 : s.result === 'draw' ? 200 : 0))));
}
function summarize(game, e, T) {
  const me = game && game.local; if (!me) return null;
  const ffa = game.mode && game.mode.teams === 0;
  let result = 'draw';
  const w = e && e.winner;
  if (e && w != null && w !== 0 && w !== '') result = (ffa ? w === me.id : w === me.team) ? 'win' : 'loss';
  const players = [...(game.players ? game.players.values() : [])];
  const place = ffa ? 1 + players.filter(p => p !== me && (p.kills > me.kills || (p.kills === me.kills && p.score > me.score))).length : 0;
  const t0 = T ? T.t0 : 0;
  return {
    mode: (game.mode && game.mode.id) || game.modeId || 'tdm', map: game.mapId || (game.def && game.def.id) || '', mapName: (game.def && game.def.name) || game.mapId || '',
    result, quit: !e, team: me.team, kills: me.kills | 0, deaths: me.deaths | 0, assists: me.assists | 0, headshots: me.headshots | 0,
    damage: Math.round(me.damageDone || 0), shots: (me.stat && me.stat.shots) | 0, hits: (me.stat && me.stat.hits) | 0, mvps: me.mvps | 0, score: me.score | 0,
    objectives: T ? T.objectives : 0, bestStreak: T ? T.best : 0, time: Math.max(0, (game.time || 0) - t0), guns: T ? T.guns : {},
    bots: players.filter(p => p.bot).length, players: players.length, place, authority: game.authority || 'local',
    botMode: (game.options && game.options.botMode) || 'normal', god: !!(game.options && game.options.god),
  };
}
function recordMatch(s) {
  s = obj(s);
  const p = get(), st = p.stats, now = Date.now(), today = dayKey(now);
  const k = Math.floor(nn(s.kills)), d = Math.floor(nn(s.deaths)), a = Math.floor(nn(s.assists)), hs = Math.min(k, Math.floor(nn(s.headshots)));
  const obj_ = Math.floor(nn(s.objectives)), mvps = Math.floor(nn(s.mvps)), time = Math.min(4 * 3600, nn(s.time));
  const shots = Math.floor(nn(s.shots)), hits = Math.min(shots, Math.floor(nn(s.hits)));
  const quit = !!s.quit, result = quit ? 'loss' : ['win', 'loss', 'draw'].includes(s.result) ? s.result : 'draw';
  const mode = str(s.mode, 'tdm', 16).replace(/[^a-z0-9_]/g, '') || 'tdm';
  let mult = 1;
  if (mode === 'practice') mult *= .5;
  if (s.botMode === 'static' || s.botMode === 'passive') mult *= .2;
  if (s.god) mult = 0;
  // ---- XP
  const lines = [];
  const line = (label, xp, cr = 0) => { if (xp || cr) lines.push({ label, xp: Math.round(xp), credits: Math.round(cr) }); };
  line('KILLS ×' + k, k * XP.kill); line('HEADSHOTS ×' + hs, hs * XP.headshot); line('ASSISTS ×' + a, a * XP.assist);
  line('OBJECTIVES ×' + obj_, obj_ * XP.objective); line('MVP ×' + mvps, mvps * XP.mvp);
  if (!quit) line(result === 'win' ? 'VICTORY' : result === 'draw' ? 'DRAW' : 'MATCH COMPLETED', XP[result]);
  line('TIME IN ACTION ' + Math.round(time / 60) + ' MIN', Math.min(XP.maxMinutes, time / 60) * XP.minute);
  let base = lines.reduce((n, l) => n + l.xp, 0);
  let xp = base * mult;
  const boosted = p.boost.matches > 0 && xp > 0 ? p.boost.mult : 1;
  if (boosted > 1) { lines.push({ label: 'XP BOOST ×' + boosted, xp: Math.round(xp * (boosted - 1)), credits: 0 }); xp *= boosted; p.boost.matches--; if (!p.boost.matches) p.boost.mult = 1; }
  if (mult !== 1) lines.push({ label: mult === 0 ? 'NO REWARDS (GOD MODE)' : (mode === 'practice' ? 'PRACTICE' : 'TARGET PRACTICE') + ' ×' + mult, xp: 0, credits: 0 });
  let cr = quit ? 0 : (100 + k * 10 + a * 4 + obj_ * 30 + (result === 'win' ? 200 : result === 'draw' ? 120 : 60)) * mult;
  if (quit) cr = (k * 10 + a * 4) * mult * .5;
  // first win of the day (not when the clock went back past the last one)
  let firstWin = false;
  const fwDay = dayNum(p.rewards.firstWin), tDay = dayNum(today);
  if (result === 'win' && mult >= .5 && (fwDay == null || tDay > fwDay)) {
    firstWin = true; p.rewards.firstWin = today; p.rewards.firstWins++;
    lines.push({ label: 'FIRST WIN OF THE DAY', xp: FIRST_WIN.xp, credits: FIRST_WIN.credits });
    xp += FIRST_WIN.xp; cr += FIRST_WIN.credits;
  }
  xp = Math.min(XP.cap, Math.round(xp)); cr = Math.round(cr / 5) * 5;
  const lvBefore = levelOf(p.xp);
  const gain = gainXP(xp);
  p.cr.earned += cr;
  // ---- stats
  st.matches++; st.kills += k; st.deaths += d; st.assists += a; st.headshots += hs; st.damage += Math.round(nn(s.damage));
  st.shots += shots; st.hits += hits; st.mvps += mvps; st.objectives += obj_; st.playtime += Math.round(time);
  if (quit) st.quits++; else if (result === 'win') st.wins++; else if (result === 'loss') st.losses++; else st.draws++;
  st.bestKills = Math.max(st.bestKills, k); st.bestStreak = Math.max(st.bestStreak, Math.floor(nn(s.bestStreak)));
  const score = boardScore({ ...s, kills: k, assists: a, headshots: hs, objectives: obj_, mvps, result });
  const ranked = !quit && mult >= 1;          // what may go on a leaderboard (no practice, target practice, god mode or early exits)
  if (ranked) st.bestScore = Math.max(st.bestScore, score);
  const ms = st.modes[mode] || (st.modes[mode] = {});
  for (const [key, v] of [['matches', 1], ['kills', k], ['deaths', d], ['assists', a], ['headshots', hs], ['shots', shots], ['hits', hits], ['playtime', Math.round(time)],
    ['wins', result === 'win' && !quit ? 1 : 0], ['objectives', obj_]]) ms[key] = (ms[key] || 0) + v;
  if (ranked && score > (ms.bestScore || 0)) { ms.bestScore = score; ms.bk = k; ms.bd = d; ms.ba = a; }
  ms.bestKills = Math.max(ms.bestKills || 0, k);
  // ---- per gun (mastery)
  const gunLevels = [];
  for (const [gid, g0] of Object.entries(obj(s.guns))) {
    const gg = getGun(gid); if (!gg) continue;
    const g = obj(g0), cur = p.guns[gg.id] || (p.guns[gg.id] = { xp: 0, kills: 0, hs: 0, shots: 0, hits: 0, dmg: 0, matches: 0 });
    const gk = Math.floor(nn(g.kills)), ghs = Math.min(gk, Math.floor(nn(g.hs))), gsh = Math.floor(nn(g.shots)), ghit = Math.min(gsh || Infinity, Math.floor(nn(g.hits)));
    const before = gunLevelOf(cur.xp).level;
    const gx = mult > 0 ? Math.min(20000, (gk * 100 + ghs * 30 + ghit * 2) * Math.max(mult, .25)) : 0;
    cur.xp += Math.round(gx); cur.kills += gk; cur.hs += ghs; cur.shots += gsh; cur.hits += ghit; cur.dmg += Math.round(nn(g.dmg)); cur.matches++;
    const after = gunLevelOf(cur.xp).level;
    if (after > before) { const bonus = (after - before) * 100; p.cr.earned += bonus; gunLevels.push({ id: gg.id, name: gg.name, from: before, to: after, credits: bonus }); }
  }
  save('match');
  const gunCredits = gunLevels.reduce((n, g) => n + g.credits, 0);
  const result_ = { xp, credits: cr + gain.credits + gunCredits, matchCredits: cr, levelCredits: gain.credits, masteryCredits: gunCredits, base: Math.round(base), mult, boost: boosted, firstWin, breakdown: lines,
    levelUps: gain.levelUps, unlocks: gain.unlocks, crates: gain.crates, gunLevels, level: levelOf(p.xp), prevLevel: lvBefore, score, info: levelInfo(p.xp) };
  if (gain.levelUps.length) appBus.emit('profile:level', gain);
  // leaderboards (fire and forget; an old server without LIVE FIRE boards answers 'not available' and is skipped for the session)
  if (ranked && Account.member() && score > 0) postScores(mode, score, { k, d, a, hs, map: str(s.map, '', 24), r: result[0] });
  return result_;
}
const POSTED = 'lf_posted_v1';
function postedFor(uid) { const o = readLS(POSTED); return o && o.uid === uid && o.b && typeof o.b === 'object' ? o : { uid, b: {} }; }
async function submitList(list, detail) {
  const p = get(), uid = Account.user() && Account.user().id; if (uid == null) return;
  for (const [board, sc] of list) {
    if (!(sc >= 1)) continue;
    const r = await Account.submitScore(board, sc, board.startsWith('lf:xp') ? { lv: levelOf(p.xp) } : detail(board));
    if (r && r.error) return false;
    const posted = postedFor(uid); posted.b[board] = Math.max(posted.b[board] || 0, sc); writeLS(POSTED, posted);
  }
  return true;
}
function postScores(mode, score, detail) {
  const m = monthKey(), p = get();
  return submitList([['lf:' + mode + ':' + m, score], ['lf:' + mode + ':all', score], ['lf:xp:' + m, p.mxp[m] || 0], ['lf:xp:all', p.xp]], () => detail);
}
/** once per session after a sync: post all-time bests and XP that the boards do not have yet (e.g. earned before the server had
    LIVE FIRE boards, or as a guest before signing in) */
let bestsPosted = false;
async function postBests() {
  if (bestsPosted || !Account.member() || Account.boardsAvailable() === false) return;
  bestsPosted = true;
  const p = get(), posted = postedFor(Account.user().id), m = monthKey(), list = [];
  const want = (board, sc) => { if (sc >= 1 && sc > (posted.b[board] || 0)) list.push([board, Math.floor(sc)]); };
  want('lf:xp:all', p.xp); want('lf:xp:' + m, p.mxp[m] || 0);
  for (const [mode, ms] of Object.entries(p.stats.modes)) if (mode !== 'practice' && /^[a-z0-9_]{2,16}$/.test(mode)) want('lf:' + mode + ':all', Math.min(100000, ms.bestScore || 0));
  if (list.length) await submitList(list, board => { const ms = p.stats.modes[board.split(':')[1]] || {}; return { k: ms.bk | 0, d: ms.bd | 0, a: ms.ba | 0 }; });
}

/** listen to a running Game and record the local player's match when it ends (or a partial one when quitting after a minute) */
const tracked = new WeakSet();
let lastMatch = null;
function track(game) {
  if (!game || !game.bus || tracked.has(game)) return () => {};
  tracked.add(game);
  const T = { guns: {}, streak: 0, best: 0, objectives: 0, t0: game.time || 0, done: false };
  const me = () => game.local;
  const G = id => { const g = getGun(id); if (!g) return null; return T.guns[g.id] || (T.guns[g.id] = { kills: 0, hs: 0, shots: 0, hits: 0, dmg: 0 }); };
  const finish = (e, quit) => {
    if (T.done) return; T.done = true;
    const s = summarize(game, quit ? null : e, T); if (!s) return;
    if (quit && (s.time < 60 || (s.kills === 0 && s.assists === 0))) return;      // left in warm-up: nothing to record
    try {
      const result = recordMatch(s);
      lastMatch = { summary: s, result, at: Date.now() };
      appBus.emit('profile:match', lastMatch);
    } catch (err) { console.error('[profile] could not record the match', err); }
  };
  const bus = game.bus;
  const offs = [
    bus.on('shot', e => { if (e && e.p === me() && e.w) { const g = G(e.w.gunId); if (g) g.shots++; } }),
    bus.on('hit', e => { if (e && e.attacker === me() && e.victim !== me() && !e.predicted) { const g = G(e.weapon); if (g) { g.hits++; g.dmg += e.dmg || 0; } } }),
    bus.on('kill', e => {
      if (!e) return;
      if (e.killer === me() && !e.suicide && e.victim !== me()) { T.streak++; T.best = Math.max(T.best, T.streak); const g = G(e.weapon); if (g) { g.kills++; if (e.headshot) g.hs++; } }
      if (e.victim === me()) T.streak = 0;
    }),
    bus.on('objective', e => { if (e && me() && (e.p === me() || e.player === me() || e.by === me() || e.pid === me().id)) T.objectives++; }),
    bus.on('match:end', e => finish(e, false)),
    bus.on('game:end', e => { if (!T.done && e && e.reason === 'quit') finish(null, true); }),
  ];
  return () => { for (const off of offs) off(); };
}
let autoT = null;
function autoTrack(LF) {
  if (autoT || !LF) return; let last = null;
  autoT = setInterval(() => { const g = LF.game; if (g && g !== last) { last = g; track(g); } else if (!g) last = null; }, 400);
}

// ------------------------------------------------------------------------------------------------ cloud sync
function deepMax(n, o) {
  const out = Array.isArray(n) ? n.slice() : { ...n };
  for (const [k, v] of Object.entries(obj(o))) {
    if (typeof v === 'number' && typeof out[k] === 'number') out[k] = Math.max(out[k], v);
    else if (typeof v === 'number' && out[k] == null) out[k] = v;
    else if (v && typeof v === 'object' && !Array.isArray(v)) out[k] = deepMax(obj(out[k]), v);
  }
  return out;
}
/** merge two profiles of the same player: newest = base, counters = max, owned = union, credits by earned / spent maxima */
function merge(a, b) {
  a = sanitize(a); b = sanitize(b);
  const [n, o] = (a.updated || 0) >= (b.updated || 0) ? [a, b] : [b, a];
  const m = JSON.parse(JSON.stringify(n));
  m.xp = Math.max(n.xp, o.xp);
  m.cr = { earned: Math.max(n.cr.earned, o.cr.earned), spent: Math.max(n.cr.spent, o.cr.spent) };
  for (const k of KINDS) m.owned[k] = { ...o.owned[k], ...n.owned[k] };
  m.guns = deepMax(n.guns, o.guns);
  m.stats = deepMax(n.stats, o.stats);
  m.mxp = deepMax(n.mxp, o.mxp);
  const rn = n.rewards, ro = o.rewards, dn = dayNum(rn.last), dO = dayNum(ro.last);
  const r = dO != null && (dn == null || dO > dn || (dO === dn && ro.streak > rn.streak)) ? { ...ro } : { ...rn };
  r.best = Math.max(rn.best, ro.best, r.streak); r.claims = Math.max(rn.claims, ro.claims); r.lastAt = Math.max(rn.lastAt, ro.lastAt);
  r.firstWin = (dayNum(ro.firstWin) || 0) > (dayNum(rn.firstWin) || 0) ? ro.firstWin : rn.firstWin; r.firstWins = Math.max(rn.firstWins, ro.firstWins);
  m.rewards = r;
  const opened = [...new Set([...n.opened, ...o.opened])].slice(-80);
  m.opened = opened;
  const crates = [];
  for (const c of [...n.crates, ...o.crates]) if (!opened.includes(c.id) && !crates.some(x => x.id === c.id)) crates.push(c);
  m.crates = crates;
  m.seen = { level: Math.max(n.seen.level, o.seen.level) };
  m.owner = n.owner != null ? n.owner : o.owner;
  m.seed = n.seed; m.created = Math.min(n.created || Infinity, o.created || Infinity) || n.created;
  m.updated = Math.max(n.updated, o.updated);
  return sanitize(m);
}
const fingerprint = p => { const c = { ...p }; delete c.updated; return hash(JSON.stringify(c)); };
const cloudSummary = () => { const s = get().stats; return 'LIVE FIRE · Level ' + levelOf(get().xp) + ' · ' + s.kills + ' kill' + (s.kills === 1 ? '' : 's'); };
let sync_ = { state: 'off', at: 0, error: '' }, upT = null, dirty = false, syncing = null, cloudPrint = 0, pulledFor = null;
function setSync(state, error = '') { sync_ = { state, at: state === 'ok' ? Date.now() : sync_.at, error }; appBus.emit('profile', { why: 'sync' }); for (const f of subs) { try { f(P, 'sync'); } catch (e) { /* ok */ } } }
function scheduleUpload(ms = 15000) {
  dirty = true;
  if (!Account.member()) return;
  clearTimeout(upT); upT = setTimeout(() => { flush(); }, ms);
}
async function upload(keepalive = false) {
  const p = get();
  await Account.saveCloud(p, { summary: cloudSummary(), keepalive });
  cloudPrint = fingerprint(p); dirty = false;
}
async function flush(keepalive = false) {
  clearTimeout(upT); upT = null;
  if (!Account.member() || !dirty) return false;
  const uid = Account.user() && Account.user().id;
  // never push before this session has pulled (and merged) that account's cloud copy: a fresh device would overwrite real progress
  if (pulledFor !== uid || get().owner !== uid) { if (keepalive) return false; const r = await sync(); return !!r.ok; }
  try { setSync('syncing'); await upload(keepalive); setSync('ok'); return true; }
  catch (e) { setSync('error', e.message); if (!keepalive && e.status !== 413 && e.status !== 400) { clearTimeout(upT); upT = setTimeout(() => flush(), 60000); } return false; }
}
/** a different account on this device: park this profile and bring back (or start) that account's own */
function adoptOwner(user) {
  if (!user) return;
  const p = get();
  if (p.owner == null) { p.owner = user.id; persist(); return; }
  if (p.owner === user.id) return;
  writeLS(stashKey(p.owner), p);
  const stash = readLS(stashKey(user.id));
  P = sanitize(stash || fresh());
  P.owner = user.id; persist(); emit('account');
}
async function sync() {
  if (!Account.member()) { setSync('off'); return { ok: false, reason: 'Signed out.' }; }
  if (syncing) return syncing;
  syncing = (async () => {
    setSync('syncing');
    try {
      const uid = Account.user().id;
      adoptOwner(Account.user());
      const cloud = await Account.loadCloud();
      if (!Account.member() || Account.user().id !== uid) throw new Error('The account changed while syncing.');
      if (cloud && cloud.profile) {
        const c = sanitize(cloud.profile);
        c.owner = get().owner;
        const merged = merge(get(), c);
        P = merged; persist(); emit('sync');
        cloudPrint = fingerprint(c);
      }
      pulledFor = uid;
      if (!cloud || !cloud.profile || fingerprint(get()) !== cloudPrint) { dirty = true; await upload(); }
      dirty = false; setSync('ok');
      postBests();
      return { ok: true };
    } catch (e) { setSync('error', e.message); return { ok: false, reason: e.message }; }
    finally { syncing = null; }
  })();
  return syncing;
}

// ------------------------------------------------------------------------------------------------ init
let inited = false;
function init() {
  if (inited) return Profile; inited = true;
  get();
  Account.on(e => {
    if (e.type === 'auth') {
      if (e.member) { if (e.why !== 'refresh') { bestsPosted = false; sync(); } } else { clearTimeout(upT); pulledFor = null; setSync('off'); }
    }
  });
  if (Account.member()) setTimeout(() => sync(), 600);
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => { if (document.hidden && dirty) flush(true); });
    window.addEventListener('pagehide', () => { if (dirty) flush(true); });
    window.addEventListener('storage', e => { if (e.key === KEY && e.newValue) { try { P = sanitize(JSON.parse(e.newValue)); emit('external'); } catch (err) { /* ignore */ } } });
  }
  return Profile;
}

export const Profile = {
  init, load, get, save, onChange(fn) { subs.add(fn); return () => subs.delete(fn); },
  level: () => lvl(), levelInfo: (xp) => levelInfo(xp == null ? get().xp : xp), xpToNext: () => { const i = levelInfo(get().xp); return i.max ? 0 : i.need - i.into; },
  xpForLevel, levelOf, levelCredits, levelCrate,
  addXP, addCredits, credits, spend, owns, isOwned, unlock, lockInfo, price, buy, unlocksAt,
  nextUnlocks(n = 3) { const out = []; for (let L = lvl() + 1; L <= LEVEL_MAX && out.length < n; L++) out.push(...unlocksAt(L)); return out.slice(0, n); },
  loadouts, loadout, setLoadout, select, selected: () => get().sel, sanitizeLoadout: lo => sanitizeLoadout(lo, 0),
  gunStats, gunLevel: id => gunStats(id).level, stats, modeStats,
  recordMatch, summarize, track, autoTrack, get lastMatch() { return lastMatch; },
  sync, flush, syncState: () => ({ ...sync_ }), callsign: () => (Account.member() && Account.user() ? Account.user().username : get().name),
  boost: () => ({ ...get().boost }),
  merge, sanitize, fresh,
  reset() { P = sanitize(fresh()); P.owner = Account.member() && Account.user() ? Account.user().id : null; save('reset'); return P; },
  markSeen(level) { const p = get(); if (level > p.seen.level) { p.seen.level = level; save('seen'); } },
  MODE_NAMES,
};
