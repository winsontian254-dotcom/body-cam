/* LIVE FIRE — weapon state machine: draw, idle, fire modes (auto / semi / burst, exact RPM at 64 Hz with a fractional
   cooldown accumulator), reloads (magazine with insert point and cancel rules, shell-by-shell interruptible), ADS timing,
   switching, inspect, fire-mode switch, knife (slash, heavy stab, backstab), grenade slot hand-off, world drops and pickups.
   Spread per docs §5 (data.js spreadAt: moving / air / crouch / ADS + bloom) and the recoil spray (data.js recoilStep).
   PURE JS (no BABYLON). Uses only documented js/weapons/data.js + attachments.js APIs.
   Exports:
     RECOIL_VIEW            share of the aim offset the camera follows (bullets follow all of it): the rest is what you pull down
     INSPECT_TIME, PICKUP_R, DROP_LIFE
     makeWeapon(gunId, { mods, skin, mag, reserve }) -> weapon instance { uid, gunId, mag, reserve, mods, skin, fireMode, melee }
     statsOf(w | gunId) -> effective stats (attachments applied, cached per gun + mods)
     newWeaponState() -> ws  (PlayerState.ws; plain data)
     currentWeapon(p) -> weapon instance | null       (p.cur slot; 'nade' / 'bomb' -> null)
     hasSlot(p, slot) -> bool,  slotItem(p, slot)
     selectSlot(game, p, slot) -> bool    'primary'|'secondary'|'melee'|'nade'|'bomb'|'next'|'prev'|'last' (draw timing)
     weaponTick(game, p, cmd, dt)         the per-tick state machine (fires through combat.js)
     moveSpeed(p) -> m/s                  carried speed (weapon weight, ADS slow-down)
     currentCone(p) -> rad                spread cone right now (HUD dynamic crosshair, bots)
     adsZoom(p) -> magnification of the current sight (zoom level), adsProgress(p) -> 0..1
     scopedView(p, minAds = .82) -> bool   a sniper-class scope is up (full-screen overlay, no viewmodel)
     dropWeapon(game, p, slot, opts?) -> drop | null      throws the weapon into the world (game.drops)
     tryPickup(game, p, use) -> bool      auto pickup into an empty slot, USE swaps with the current slot
     nearestDrop(game, p) -> drop | null  the drop USE would take (HUD prompt)
     dropsTick(game, dt)                  falling / resting drops, expiry
     reloadProgress(p) -> 0..1 | -1
   ws = { state 'idle'|'draw'|'reload'|'inspect'|'melee', t, dur, cool, btn (previous buttons), burst, ads, shots (spray index,
     float), ax / ay (aim offset, DEGREES right / up), bloom (rad), since (s since last shot), cyc (manual action left), rl (reload),
     ml (melee swing), seq (shots fired), zoomIdx, nadeT, kick (shot counter for the camera), dry }
   Reload rules (mag): the new magazine counts at 70% (tactical) / 62% (empty) of the reload; switching before that point
   cancels it with nothing lost, after it keeps the ammo; a tactical reload may be cut short by firing once the magazine is in,
   an empty reload must finish (bolt release). Shell reloads load one shell at a time; fire / switch stop after the current shell.
   Events: 'shot' { p, gun, origin, dir, traces: [{ end, hit }], tracer, suppressed, pellets, seq, kick, ads }
     'reload' { p, gun, stage: 'start'|'magout'|'magin'|'shell'|'chamber'|'end'|'cancel' }  'switch' { p, slot, from }
     'dry' { p, gun }  'melee' { p, kind, gun, side }  'firemode' { p, mode }  'inspect' { p }  'drop' { p, drop }  'pickup' { p, drop } */
import { getGun, spreadAt, recoilStep, fireInterval } from '../weapons/data.js';
import { effectiveStats } from '../weapons/attachments.js';
import { BTN as MB, eyePos } from '../phys/move.js';
import { fireShot, meleeAttack } from './combat.js';

const B_MODE = 4096;
const DEG = Math.PI / 180, TAU = Math.PI * 2;
export const RECOIL_VIEW = 0.5;
export const INSPECT_TIME = 3.4;
export const PICKUP_R = 1.15;
export const DROP_LIFE = 90;
const SEMI_BUFFER = 0.07;     // a semi-auto press up to this early still fires when the cooldown ends
const ADS_OUT = 0.7;          // leaving ADS takes this share of adsTime
const SLOTS = ['primary', 'secondary', 'melee', 'nade', 'bomb'];

let uidN = 0;
const STATS = new Map();
const modsKey = m => (m ? Object.keys(m).sort().map(k => k + '=' + (m[k] || '')).join(',') : '');
export function statsOf(w) {
  if (!w) return null;
  const id = typeof w === 'string' ? w : w.gunId, mods = typeof w === 'string' ? null : w.mods;
  const key = id + '|' + modsKey(mods);
  let s = STATS.get(key);
  if (!s) {
    const g = getGun(id); if (!g) return null;
    s = effectiveStats(g, mods || {}) || g;
    STATS.set(key, s);
  }
  return s;
}

export function makeWeapon(gunId, o = {}) {
  const g = getGun(gunId); if (!g) return null;
  const w = { uid: 'w' + (++uidN), gunId: g.id, mag: 0, reserve: 0, mods: { ...(o.mods || {}) }, skin: o.skin || 'factory',
    fireMode: g.modes && g.modes[0] || null, melee: g.cat === 'melee' };
  const st = statsOf(w);
  w.mag = o.mag != null ? o.mag : (st.mag || 0);
  w.reserve = o.reserve != null ? o.reserve : (st.reserve || 0);
  return w;
}

export function newWeaponState() {
  return { state: 'idle', t: 0, dur: 0, cool: 0, btn: 0, burst: 0, ads: 0, shots: 0, ax: 0, ay: 0, bloom: 0, since: 9, cyc: 0,
    rl: null, ml: null, seq: 0, zoomIdx: 0, nadeT: -1, kick: 0, dry: 0, semiBuf: 0, mlSide: 0 };
}

export function slotItem(p, slot) {
  if (slot === 'nade') return p.inv.nades && p.inv.nades.some(n => n.n > 0) ? 'nade' : null;
  if (slot === 'bomb') return p.inv.bomb ? 'bomb' : null;
  return p.inv[slot] || null;
}
export const hasSlot = (p, slot) => !!slotItem(p, slot);
export function currentWeapon(p) { const s = p.cur; return s === 'nade' || s === 'bomb' ? null : p.inv[s] || null; }

function drawTime(p) {
  const w = currentWeapon(p);
  if (!w) return p.cur === 'nade' ? 0.35 : 0.5;
  const st = statsOf(w); return st ? (st.draw || 0.6) : 0.6;
}

export function selectSlot(game, p, slot) {
  const ws = p.ws;
  if (slot === 'next' || slot === 'prev') {
    const dir = slot === 'next' ? 1 : -1;
    let i = SLOTS.indexOf(p.cur);
    for (let k = 0; k < SLOTS.length; k++) { i = (i + dir + SLOTS.length) % SLOTS.length; if (hasSlot(p, SLOTS[i])) { slot = SLOTS[i]; break; } }
    if (slot === 'next' || slot === 'prev') return false;
  } else if (slot === 'last') slot = hasSlot(p, p.lastSlot) ? p.lastSlot : null;
  if (!slot || !hasSlot(p, slot)) return false;
  if (slot === 'nade') {
    const list = p.inv.nades.filter(n => n.n > 0);
    if (p.cur === 'nade' && list.length > 1) {        // pressing the grenade key again cycles the grenade type
      const i = list.findIndex(n => n.gid === p.curNade); p.curNade = list[(i + 1) % list.length].gid;
      ws.state = 'draw'; ws.t = 0; ws.dur = 0.3; return true;
    }
    if (!list.some(n => n.gid === p.curNade)) p.curNade = list[0].gid;
  }
  if (slot === p.cur) return false;
  if (ws.rl) { if (game && game.bus) game.bus.emit('reload', { p, gun: currentWeapon(p), stage: 'cancel' }); ws.rl = null; }
  const from = p.cur;
  if (from !== slot) p.lastSlot = from;
  p.cur = slot;
  ws.state = 'draw'; ws.t = 0; ws.dur = drawTime(p); ws.ml = null; ws.burst = 0; ws.ads = 0; ws.cyc = 0; ws.nadeT = -1; ws.zoomIdx = 0;
  ws.cool = Math.max(ws.cool, 0);
  if (game && game.bus) game.bus.emit('switch', { p, slot, from });
  return true;
}

export function moveSpeed(p) {
  const w = currentWeapon(p);
  let sp = 5.2;
  if (w) { const st = statsOf(w); sp = st.speed || 5.2; if (!w.melee) sp *= 1 - (1 - (st.adsMove ?? 0.6)) * p.ws.ads; }
  else if (p.cur === 'nade') sp = 5.6;
  else if (p.cur === 'bomb') sp = 5.4;
  return sp;
}

export function currentCone(p) {
  const w = currentWeapon(p); if (!w || w.melee) return 0;
  const st = statsOf(w), sf = Math.hypot(p.vel.x, p.vel.z) / Math.max(0.5, st.speed || 5);
  return spreadAt(st, { speedFrac: sf, air: !p.onGround, crouch: p.crouch || 0, ads: p.ws.ads, bloom: p.ws.bloom });
}
export function adsZoom(p) {
  const w = currentWeapon(p); if (!w || w.melee) return 1;
  const st = statsOf(w), lv = st.zoomLevels && st.zoomLevels.length ? st.zoomLevels : [st.zoom || st.adsFov || 1.1];
  return lv[Math.min(lv.length - 1, p.ws.zoomIdx | 0)] || 1.1;
}
/** True while a high-power scope (sniper class: its strongest magnification >= 5) is up: the full-screen scope overlay replaces
    the viewmodel at every zoom level of that scope (docs §5 scope.js); lower-power optics keep the gun on screen. */
export function scopedView(p, minAds = 0.82) {
  const w = currentWeapon(p); if (!w || w.melee || p.ws.ads < minAds) return false;
  const st = statsOf(w), lv = st.zoomLevels || [];
  let mx = 0; for (let i = 0; i < lv.length; i++) if (lv[i] > mx) mx = lv[i];
  return mx >= 5 || adsZoom(p) >= 5;
}
export const adsProgress = p => p.ws.ads;
export function reloadProgress(p) { const r = p.ws.rl; if (!r) return -1; return r.kind === 'shell' ? r.prog || 0 : Math.min(1, r.t / r.dur); }

// ------------------------------------------------------------------------------------------------ firing
const ORIGIN = { x: 0, y: 0, z: 0 }, DIR = { x: 0, y: 0, z: 0 };

function shoot(game, p, w, st) {
  const ws = p.ws, rng = game.rng;
  if (!(game.options && game.options.infiniteMag)) w.mag--;
  ws.seq++; ws.kick++; ws.since = 0; p.spawnProtect = 0; p.stat.shots++;
  const yaw = p.yaw + ws.ax * DEG, pitch = p.pitch - ws.ay * DEG;
  const sf = Math.hypot(p.vel.x, p.vel.z) / Math.max(0.5, st.speed || 5);
  const cone = spreadAt(st, { speedFrac: sf, air: !p.onGround, crouch: p.crouch || 0, ads: ws.ads, bloom: ws.bloom });
  eyePos(p, ORIGIN);
  const sy = Math.sin(yaw), cy = Math.cos(yaw), sp = Math.sin(pitch), cp = Math.cos(pitch);
  const fx = sy * cp, fy = -sp, fz = cy * cp, rx = cy, rz = -sy, ux = sy * sp, uy = cp, uz = cy * sp;
  // the gun's cone moves the aim point (centre-weighted); shotguns spread their pellets around it
  const a0 = rng() * TAU, r0 = cone * rng();
  const ox = Math.tan(r0) * Math.cos(a0), oy = Math.tan(r0) * Math.sin(a0);
  const pellets = Math.max(1, st.pellets || 1), pel = st.spread && st.spread.pellet || 0;
  const zoom = adsZoom(p);
  const noscope = (st.cat === 'sniper' || zoom >= 3) && ws.ads < 0.5;
  const traces = [];
  for (let i = 0; i < pellets; i++) {
    let px = ox, py = oy;
    if (pellets > 1 && pel > 0) { const a = rng() * TAU, r = pel * Math.sqrt(rng()); px += Math.tan(r) * Math.cos(a); py += Math.tan(r) * Math.sin(a); }
    let dx = fx + rx * px + ux * py, dy = fy + uy * py, dz = fz + rz * px + uz * py;
    const l = Math.hypot(dx, dy, dz); DIR.x = dx / l; DIR.y = dy / l; DIR.z = dz / l;
    const r = fireShot(game, p, st, ORIGIN, DIR, { noscope, pellet: i });
    traces.push({ end: r.end, hit: r.hits.length > 0, dist: r.dist });
  }
  // recoil: the spray pattern moves the aim offset; the camera follows RECOIL_VIEW of it
  const step = recoilStep(st, Math.floor(ws.shots)), rnd = (st.recoil && st.recoil.random) || 0;
  const bip = p.crouch > 0.8 && st.bipod && st.bipod < 1 ? st.bipod : 1;
  ws.ax += (step[0] + (rng() * 2 - 1) * rnd) * bip;
  ws.ay += (step[1] + (rng() * 2 - 1) * rnd * 0.5) * bip;
  ws.shots += 1;
  ws.bloom = Math.min(ws.bloom + ((st.spread && st.spread.shot) || 0), (st.spread && st.spread.max) || 0.1);
  if (st.cycle) ws.cyc = fireInterval(st, w.fireMode) * 0.92;
  if (game.bus) game.bus.emit('shot', { p, gun: st, w, origin: { x: ORIGIN.x, y: ORIGIN.y, z: ORIGIN.z }, dir: { x: fx, y: fy, z: fz }, traces,
    tracer: st.tracer > 0 && ws.seq % st.tracer === 0, suppressed: !!st.suppressed, pellets, seq: ws.seq, kick: (st.recoil && st.recoil.kick) || 1, ads: ws.ads });
}

function startReload(game, p, w, st) {
  const ws = p.ws, inf = game.options && game.options.infiniteAmmo;
  if (w.mag >= st.mag || (!inf && w.reserve <= 0)) return false;
  if (st.shell && st.reloadKind === 'shell') ws.rl = { kind: 'shell', phase: 'start', t: 0, dur: st.shell.start, empty: w.mag === 0, stop: false, prog: 0, n: 0 };
  else ws.rl = { kind: 'mag', t: 0, dur: w.mag === 0 ? (st.reloadEmpty || st.reload) : st.reload, empty: w.mag === 0, out: false, inserted: false, chambered: false };
  ws.state = 'reload'; ws.t = 0; ws.dur = ws.rl.dur; ws.burst = 0; ws.ml = null;
  if (game.bus) game.bus.emit('reload', { p, gun: w, stage: 'start' });
  return true;
}
function transfer(game, w, n) {
  const inf = game.options && game.options.infiniteAmmo;
  const take = inf ? n : Math.min(n, w.reserve);
  w.mag += take; if (!inf) w.reserve -= take;
  return take;
}
function reloadTick(game, p, w, st, dt, pressed, held) {
  const ws = p.ws, rl = ws.rl, bus = game.bus;
  if (!rl) { ws.state = 'idle'; return; }
  rl.t += dt;
  if (rl.kind === 'mag') {
    const ins = rl.empty ? 0.62 : 0.7;
    if (!rl.out && rl.t >= rl.dur * 0.16) { rl.out = true; if (bus) bus.emit('reload', { p, gun: w, stage: 'magout' }); }
    if (!rl.inserted && rl.t >= rl.dur * ins) { rl.inserted = true; transfer(game, w, st.mag - w.mag); if (bus) bus.emit('reload', { p, gun: w, stage: 'magin' }); }
    if (rl.empty && !rl.chambered && rl.t >= rl.dur * 0.86) { rl.chambered = true; if (bus) bus.emit('reload', { p, gun: w, stage: 'chamber' }); }
    const cutShort = !rl.empty && rl.inserted && (pressed & MB.FIRE) && w.mag > 0;
    if (rl.t >= rl.dur || cutShort) { ws.rl = null; ws.state = 'idle'; ws.t = 0; if (bus) bus.emit('reload', { p, gun: w, stage: 'end' }); }
    return;
  }
  // shell by shell
  const sh = st.shell, inf = game.options && game.options.infiniteAmmo;
  if ((pressed & MB.FIRE) && w.mag > 0) rl.stop = true;
  rl.prog = Math.min(1, w.mag / Math.max(1, st.mag));
  if (rl.t < rl.dur) return;
  rl.t -= rl.dur;
  if (rl.phase === 'start') { rl.phase = 'load'; rl.dur = sh.per; return; }
  if (rl.phase === 'load') {
    transfer(game, w, 1); rl.n++;
    if (bus) bus.emit('reload', { p, gun: w, stage: 'shell' });
    if (w.mag >= st.mag || (!inf && w.reserve <= 0) || rl.stop) {
      rl.phase = 'end'; rl.dur = sh.end + (rl.empty ? Math.max(0, (st.reloadEmpty || 0) - (st.reload || 0)) : 0);
      if (rl.empty && bus) bus.emit('reload', { p, gun: w, stage: 'chamber' });
    } else rl.dur = sh.per;
    return;
  }
  ws.rl = null; ws.state = 'idle'; ws.t = 0; if (bus) bus.emit('reload', { p, gun: w, stage: 'end' });
}

function meleeTick(game, p, w, dt, b, pressed) {
  const ws = p.ws, spec = getGun(w.gunId);
  ws.ads = 0;
  if (ws.state === 'draw') { if (ws.t >= ws.dur) { ws.state = 'idle'; ws.t = 0; } else return; }
  if (ws.ml) {
    const m = ws.ml; m.t += dt;
    if (!m.hit && m.t >= m.hitAt) { m.hit = true; const r = meleeAttack(game, p, m.kind, spec, w.gunId); m.res = r ? (r.backstab ? 'back' : 'hit') : 'miss'; }
    if (m.t >= m.dur) { ws.ml = null; ws.state = 'idle'; ws.t = 0; }
    return;
  }
  if (ws.state === 'inspect') { if (ws.t >= ws.dur || (b & (MB.FIRE | MB.ADS))) { ws.state = 'idle'; ws.t = 0; } else return; }
  if (ws.cool > 0) return;
  let kind = null;
  if (b & MB.ADS) kind = 'stab'; else if (b & MB.FIRE) kind = 'slash';
  if (!kind) { if ((pressed & MB.INSPECT) && ws.state === 'idle') { ws.state = 'inspect'; ws.t = 0; ws.dur = INSPECT_TIME * 0.8; if (game.bus) game.bus.emit('inspect', { p }); } return; }
  const s = kind === 'stab' ? spec.stab : spec.slash;
  ws.mlSide = kind === 'slash' ? 1 - ws.mlSide : ws.mlSide;
  ws.ml = { kind, t: 0, hitAt: kind === 'stab' ? (s.windup || 0.25) : 0.11, dur: s.rate, hit: false, side: ws.mlSide, res: null };
  ws.state = 'melee'; ws.t = 0; ws.cool = s.rate; ws.seq++; p.spawnProtect = 0;
  if (game.bus) game.bus.emit('melee', { p, kind, gun: w.gunId, side: ws.mlSide });
}

function nadeTick(game, p, dt, b, prevB) {
  const ws = p.ws;
  ws.ads = Math.max(0, ws.ads - dt * 4);
  if (ws.state === 'draw') { if (ws.t >= ws.dur) { ws.state = 'idle'; ws.t = 0; } else return; }
  if (!hasSlot(p, 'nade')) { selectSlot(game, p, 'last') || selectSlot(game, p, 'next'); return; }
  const want = b & (MB.FIRE | MB.ADS);
  if (want && ws.nadeT < 0) ws.nadeT = 0;            // pin pulled
  if (ws.nadeT >= 0) ws.nadeT += dt;
  const released = (prevB & (MB.FIRE | MB.ADS)) && !want;
  if (released && ws.nadeT >= 0) {
    const under = !!(prevB & MB.ADS) && !(prevB & MB.FIRE);
    const cook = ws.nadeT; ws.nadeT = -1;
    if (game.throwNade && game.throwNade(p, p.curNade, { under, cook })) {
      const e = p.inv.nades.find(n => n.gid === p.curNade); if (e) e.n--;
      p.inv.nades = p.inv.nades.filter(n => n.n > 0);
      ws.state = 'draw'; ws.t = 0; ws.dur = 0.55;
      if (!hasSlot(p, 'nade')) selectSlot(game, p, 'last') || selectSlot(game, p, 'next');
    }
  }
}

/** The per-tick weapon state machine. cmd.buttons are HELD buttons; edges come from ws.btn. */
export function weaponTick(game, p, cmd, dt) {
  const ws = p.ws, b = cmd.buttons | 0, prevB = ws.btn, pressed = b & ~prevB;
  ws.btn = b;
  ws.t += dt; ws.since += dt; ws.cool -= dt; ws.dry = Math.max(0, ws.dry - dt);
  if (ws.cyc > 0) ws.cyc = Math.max(0, ws.cyc - dt);
  if (cmd.slot) selectSlot(game, p, cmd.slot);
  if (p.cur === 'nade') { nadeTick(game, p, dt, b, prevB); recover(ws, null, dt); return; }
  const w = currentWeapon(p);
  if (!w) { ws.ads = Math.max(0, ws.ads - dt * 4); if (ws.state === 'draw' && ws.t >= ws.dur) ws.state = 'idle'; return; }
  if (w.melee) { meleeTick(game, p, w, dt, b, pressed); return; }
  const st = statsOf(w);
  if (pressed & B_MODE && st.modes && st.modes.length > 1 && (ws.state === 'idle' || ws.state === 'inspect')) {
    const i = st.modes.indexOf(w.fireMode); w.fireMode = st.modes[(i + 1) % st.modes.length]; ws.burst = 0;
    if (game.bus) game.bus.emit('firemode', { p, mode: w.fireMode });
  }
  // state transitions
  if (ws.state === 'draw' && ws.t >= ws.dur) { ws.state = 'idle'; ws.t = 0; }
  if (ws.state === 'reload') reloadTick(game, p, w, st, dt, pressed, b);
  if (ws.state === 'inspect' && (ws.t >= ws.dur || (b & (MB.FIRE | MB.ADS | MB.RELOAD)))) { ws.state = 'idle'; ws.t = 0; }
  if (ws.state === 'idle') {
    if ((pressed & MB.RELOAD) && startReload(game, p, w, st)) { /* reloading */ }
    else if ((pressed & MB.INSPECT) && !(b & (MB.FIRE | MB.ADS))) { ws.state = 'inspect'; ws.t = 0; ws.dur = INSPECT_TIME; if (game.bus) game.bus.emit('inspect', { p }); }
  }
  // ADS (not while drawing / reloading / climbing; a bolt or pump cycle drops you out and back in)
  const scoped = st.zoomLevels && st.zoomLevels.length > 1;
  if ((pressed & MB.ALT) && scoped && ws.ads > 0.5) ws.zoomIdx = (ws.zoomIdx + 1) % st.zoomLevels.length;
  const canAds = (ws.state === 'idle' || ws.state === 'inspect') && !p.mantle && !(st.cycle === 'bolt' && ws.cyc > 0);
  const wantAds = !!(b & MB.ADS) && canAds;
  if (wantAds && ws.state === 'inspect') { ws.state = 'idle'; ws.t = 0; }
  const at = Math.max(0.05, st.adsTime || 0.25);
  ws.ads = wantAds ? Math.min(1, ws.ads + dt / at) : Math.max(0, ws.ads - dt / (at * ADS_OUT));
  if (!wantAds && ws.ads === 0) ws.zoomIdx = 0;
  // firing
  const trig = (b & MB.FIRE) !== 0;
  const ready = ws.state === 'idle' && ws.cyc <= 0;
  const mode = w.fireMode || (st.modes && st.modes[0]) || 'semi';
  if (ready) {
    if (trig && w.mag <= 0 && ws.burst === 0) {
      if (pressed & MB.FIRE) { ws.dry = 0.25; if (game.bus) game.bus.emit('dry', { p, gun: w }); }
      const inf = game.options && game.options.infiniteAmmo;
      if ((w.reserve > 0 || inf) && ws.cool <= 0) startReload(game, p, w, st);
    } else if (mode === 'auto') {
      let n = 0;
      while (trig && ws.cool <= 0 && w.mag > 0 && n < 4) { shoot(game, p, w, st); ws.cool += fireInterval(st, 'auto'); n++; }
    } else if (mode === 'burst' && st.burst > 1) {
      if ((pressed & MB.FIRE) && ws.burst === 0 && ws.cool <= 0) ws.burst = st.burst;
      const ib = fireInterval(st, 'burst');
      let n = 0;
      while (ws.burst > 0 && ws.cool <= 0 && w.mag > 0 && n < 4) {
        shoot(game, p, w, st); ws.cool += ib; ws.burst--; n++;
        if (ws.burst === 0) ws.cool += Math.max(st.burstDelay || 0, ib) - ib;
      }
      if (w.mag <= 0) ws.burst = 0;
    } else {
      if (pressed & MB.FIRE) ws.semiBuf = SEMI_BUFFER;
      if (ws.semiBuf > 0 && ws.cool <= 0 && w.mag > 0) { shoot(game, p, w, st); ws.cool += fireInterval(st, mode); ws.semiBuf = 0; }
    }
  }
  ws.semiBuf = Math.max(0, ws.semiBuf - dt);
  if (!trig && ws.burst === 0 && ws.cool < 0) ws.cool = 0;     // no banking of fire time while the trigger is up
  recover(ws, st, dt);
}

function recover(ws, st, dt) {
  const rec = st && st.recoil ? st.recoil.recover || 6 : 6;
  const iv = st ? fireInterval(st) : 0.1;
  ws.bloom *= Math.exp(-rec * dt);
  if (ws.since > iv + 0.02) {
    const k = Math.exp(-rec * dt);
    ws.ax *= k; ws.ay *= k; ws.shots *= k;
    if (ws.shots < 0.05) ws.shots = 0;
    if (Math.abs(ws.ax) < 1e-4) ws.ax = 0; if (Math.abs(ws.ay) < 1e-4) ws.ay = 0;
  }
}

// ------------------------------------------------------------------------------------------------ drops and pickups
let dropN = 0;
export function dropWeapon(game, p, slot = p.cur, o = {}) {
  if (slot !== 'primary' && slot !== 'secondary') return null;
  const w = p.inv[slot]; if (!w) return null;
  p.inv[slot] = null;
  const yaw = p.yaw, pitch = Math.min(0.3, p.pitch), cp = Math.cos(pitch);
  const sp = o.speed ?? (p.alive ? 4.2 : 1.2);
  eyePos(p, ORIGIN);
  const d = { id: 'd' + (++dropN), w, from: p.id, x: ORIGIN.x, y: ORIGIN.y - (p.alive ? 0.25 : 0.7), z: ORIGIN.z,
    vx: p.vel.x * 0.6 + Math.sin(yaw) * cp * sp, vy: 1.4 - Math.sin(pitch) * sp * 0.5, vz: p.vel.z * 0.6 + Math.cos(yaw) * cp * sp,
    yaw: yaw + 1.4, spin: (game.rng() - 0.5) * 6, t: 0, rest: false };
  game.drops.push(d);
  while (game.drops.length > 24) game.drops.shift();
  if (p.cur === slot && p.alive) selectSlot(game, p, 'next') || selectSlot(game, p, 'melee');
  if (game.bus) game.bus.emit('drop', { p, drop: d });
  return d;
}

export function dropsTick(game, dt) {
  const world = game.world;
  for (let i = game.drops.length - 1; i >= 0; i--) {
    const d = game.drops[i];
    d.t += dt;
    if (d.t > DROP_LIFE || d.y < -200) { game.drops.splice(i, 1); continue; }
    if (d.rest) continue;
    d.vy -= 15 * dt;
    const nx = d.x + d.vx * dt, nz = d.z + d.vz * dt, ny = d.y + d.vy * dt;
    if (world.blocked(nx, d.y - 0.05, nz, 0.1, 0.1)) { d.vx *= -0.3; d.vz *= -0.3; }
    else { d.x = nx; d.z = nz; }
    d.yaw += d.spin * dt;
    const g = world.groundAt(d.x, d.z, d.y + 0.25, 0.05);
    if (g && ny <= g.y + 0.03) {
      d.y = g.y + 0.03;
      if (Math.abs(d.vy) < 2) { d.rest = true; d.vx = d.vy = d.vz = 0; d.spin = 0; }
      else { d.vy *= -0.25; d.vx *= 0.5; d.vz *= 0.5; d.spin *= 0.5; }
    } else d.y = ny;
  }
}

function dropSlot(d) { const g = getGun(d.w.gunId); return g ? g.slot : 'primary'; }
export function nearestDrop(game, p) {
  let best = null, bd = PICKUP_R * PICKUP_R;
  for (const d of game.drops) {
    const dx = d.x - p.pos.x, dz = d.z - p.pos.z, dy = d.y - p.pos.y;
    if (dy < -0.6 || dy > 1.4) continue;
    const d2 = dx * dx + dz * dz; if (d2 < bd) { bd = d2; best = d; }
  }
  return best;
}
export function tryPickup(game, p, use) {
  if (!p.alive || !game.drops.length) return false;
  const d = nearestDrop(game, p); if (!d) return false;
  const slot = dropSlot(d);
  const own = d.from === p.id && d.t < 1.6;
  if (p.inv[slot] && !use) return false;
  if (!p.inv[slot] && own && !use) return false;
  if (p.inv[slot]) dropWeapon(game, p, slot, { speed: 1.5 });
  game.drops.splice(game.drops.indexOf(d), 1);
  p.inv[slot] = d.w;
  if (game.bus) game.bus.emit('pickup', { p, drop: d });
  if (use || p.cur === 'melee' || !currentWeapon(p)) selectSlot(game, p, slot);
  return true;
}
