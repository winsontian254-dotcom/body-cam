/* LIVE FIRE — objectives: the charge (bomb), hostages, flags, capture zones, dog tags, VIP + extraction, juggernaut suit, gun
   ladders, sharpshooter rotation, hide & seek head start, interaction locks and the standard objective markers / bot goals.
   PURE JS (no BABYLON, no DOM). ALL state is plain data in `objectives.s` (snapshot() / apply() for the net layer).
   Exports:
     BOMB, HOSTAGE, FLAG, ZONE, TAG, VIP_RULES, JUGG     default numbers per component
     GG_LADDER, RUSH_LADDER, SHARP_POOL                  gun progression lists (ids from js/weapons/data.js; last = melee)
     giveOnly(game, p, gunId, { keepKnife, ammo })       replace p's weapons with exactly one gun (+ knife), select it
     class Objectives  (game.objectives; created by Match; the mode turns components on in setup())
       s                 plain state: { bomb, hostages, rescued, hostGoal, flags, zones, tags, vip, extracts, jugg, ladder, sharp,
                         hold, team: { 1: {}, 2: {} }, info: {} }
       has(kind) -> bool                'bomb' | 'hostage' | 'flags' | 'zones' | 'tags' | 'vip' | 'jugg' | 'ladder' | 'sharp' | 'hide'
       useBomb(cfg), useHostages(cfg), useFlags(cfg), useZones(defs, rules), useTags(cfg), useVip(cfg), useJugg(cfg),
       useLadder(list), useSharp(cfg), useHide(cfg)        (mode.setup calls them)
       roundStart()  tick(dt)  onKill(ev)  onSpawn(p)  filter(p, cmd)  (match.js / game.js call them)
       siteAt(p) -> site rect | null,  bombHolder() -> PlayerState | null,  zone(id), activeZones()
       markers(viewer) -> [{ x, y, z, label, color, icon, edge, dist, pulse, kind }]   standard objective markers for that viewer
       progress(viewer) -> null | { label, k (0..1), color }                           the viewer's plant / defuse / pickup bar
       prompt(viewer) -> '' | html                                                       contextual hint ("HOLD F TO DEFUSE")
       botGoal(bot) -> goal | null       generic objective goal (modes call it from their botGoal; docs §8)
       snapshot() -> plain copy,  apply(snap)
   Interaction (players AND bots use the same buttons, read from p.ibtn = this tick's command buttons before filtering;
   game.js sets it through the command filter, the net layer sets it for remote players on the host):
     plant   carrier inside a site: hold USE, or hold FIRE with the charge selected (slot 5)    BOMB.plant s, locked in place
     defuse  defender within 1.4 m of the planted charge: hold USE                            BOMB.defuse s (BOMB.kit with a kit)
     drop    DROP (G) with the charge selected tosses it; DROP while carrying a hostage puts the hostage down
     hostage rescuer within 1.5 m: hold USE HOSTAGE.pick s -> carried (one at a time, slower); walk into a rescue zone
     flags / tags   touch (walk over)          zones   stand inside         VIP extraction   stand in an extract zone
   Per-player plain fields written here: ibtn, busy ('plant'|'defuse'|'pickup'|null), carry (hostage id), flag (team of the carried
   flag), vip, jugg, hold (no movement / fire), blind (s), hidden, speedMul, noPickup, maxHp, ms { plants, defuses, rescues, caps,
   returns, confirms, denies, hkills, ... }.
   Events (game.bus 'objective' { kind, action, p? (counts as an objective for XP), actor (any player), team, ... }):
     bomb: given picked dropped plant_start plant_abort planted defuse_start defuse_abort defused exploded
     hostage: pick_start picked dropped rescued hurt killed     flag: taken dropped returned captured
     zone: captured neutralized contested moved destroyed       tag: confirmed denied     vip: chosen extracting escaped killed
     jugg: new  ladder: level  sharp: rotate                    'bomb:explode' { x, y, z, planter } (visual / audio)  */
import { BTN, isEnemy } from './player.js';
import { getGun } from '../weapons/data.js';
import { getNade, blastDamage } from '../grenades/data.js';
import { makeWeapon, selectSlot, newWeaponState, statsOf } from './weapon.js';
import { hash } from '../core/util.js';

export const BOMB = { plant: 3.2, fuse: 40, defuse: 10, kit: 5, dmg: 500, sigma: 9.5, defuseR: 1.4, pickR: 1.0, attackers: 1 };
export const HOSTAGE = { pick: 1.6, pickR: 1.5, goal: 2, speed: 0.82, hp: 100, rescuers: 1 };
export const FLAG = { touch: 1.25, capR: 1.8, returnT: 30 };
export const ZONE = { capTime: 8, neutral: 0.5, decay: 0.2, height: 2.6 };
export const TAG = { touch: 1.1, life: 60 };
export const VIP_RULES = { team: 1, extractT: 2.5, gun: 'sovereign', speed: 0.94 };
export const JUGG = { hp: 400, gun: 'kuznets', speed: 0.86, delay: 6 };

/** Gun Game ladder: rifles -> battle rifle -> carbines -> SMGs -> shotguns -> marksman -> sniper -> pistols -> knife. */
export const GG_LADDER = ['warden', 'purga', 'lodjur', 'eisenhut', 'switchback', 'varg', 'spatz', 'torsion', 'nightjar', 'raskat', 'cacciatore',
  'weitblick', 'rook', 'kroha', 'sovereign', 'lawman', 'vogt9', 'knife'];
export const RUSH_LADDER = ['purga', 'warden', 'kroha', 'spatz', 'roughneck', 'tempesta', 'weitblick', 'rook', 'monolith', 'vogt9', 'knife'];
export const SHARP_POOL = ['warden', 'purga', 'taiga', 'habicht', 'lodjur', 'kogarashi', 'halberd', 'switchback', 'morker', 'kroha', 'eisenhut', 'longhorn',
  'jarv', 'spatz', 'hachi', 'roughneck', 'torsion', 'nightjar', 'raskat', 'tempesta', 'breachpoint', 'weitblick', 'krechet', 'rook', 'arbiter', 'varg', 'mula',
  'monolith', 'sovereign', 'lawman'];

const COL = { 0: '#d8d4c8', 1: '#e0a33a', 2: '#4fa3e0', enemy: '#ff5a4f', obj: '#ffd166', ok: '#7be08a', white: '#ffffff' };
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const ms = p => p.ms || (p.ms = {});
const inc = (p, k, n = 1) => { const m = ms(p); m[k] = (m[k] || 0) + n; };
const inRect = (r, x, z, pad = 0) => !!r && x >= r.x0 - pad && x <= r.x1 + pad && z >= r.z0 - pad && z <= r.z1 + pad;
const d2 = (a, x, z) => (a.x - x) * (a.x - x) + (a.z - z) * (a.z - z);

/** Replace p's guns with exactly one weapon (+ the knife unless it IS the melee weapon) and select it. */
export function giveOnly(game, p, gunId, o = {}) {
  const g = getGun(gunId); if (!g) return null;
  p.inv.primary = null; p.inv.secondary = null; p.inv.nades = o.nades || []; p.curNade = p.inv.nades.length ? p.inv.nades[0].gid : null;
  let w;
  if (g.cat === 'melee') { w = p.inv.melee = makeWeapon(gunId); p.cur = 'melee'; }
  else {
    w = makeWeapon(gunId, { mods: o.mods || (p.loadout && p.loadout.mods && p.loadout.mods[gunId]) || undefined });
    if (o.mag != null) w.mag = o.mag; if (o.reserve != null) w.reserve = o.reserve;
    p.inv[g.slot] = w; p.inv.melee = makeWeapon(o.melee || 'knife'); p.cur = g.slot;
  }
  p.ws = newWeaponState(); p.ws.state = 'draw'; p.ws.dur = 0.35;
  if (game && game.bus) game.bus.emit('switch', { p, slot: p.cur, from: null });
  return w;
}

/** Closest approach of the segment a->b to the vertical capsule (x, y0..y1, z, r): returns the distance along the segment or -1. */
function segHitsCapsule(ax, ay, az, bx, by, bz, cx, cy0, cy1, cz, r) {
  const dx = bx - ax, dy = by - ay, dz = bz - az, L = Math.hypot(dx, dy, dz);
  if (L < 1e-6) return -1;
  const ux = dx / L, uy = dy / L, uz = dz / L;
  // closest point in the horizontal plane to the capsule axis
  const hx = cx - ax, hz = cz - az, hh = ux * ux + uz * uz;
  let t = hh > 1e-8 ? (hx * ux + hz * uz) / hh : 0;
  t = clamp(t, 0, L);
  for (let k = 0; k < 2; k++) {
    const px = ax + ux * t, py = ay + uy * t, pz = az + uz * t;
    const qy = clamp(py, cy0, cy1);
    const ex = px - cx, ey = py - qy, ez = pz - cz;
    if (ex * ex + ey * ey + ez * ez <= r * r) return t;
    if (Math.abs(uy) < 1e-4) break;
    t = clamp(t + (qy - py) / uy * 0.5, 0, L);       // nudge toward the capsule's height band once
  }
  return -1;
}

export class Objectives {
  constructor(game, mode, match) {
    this.g = game; this.mode = mode; this.match = match;
    this.cfg = {};
    this.s = { v: 1, bomb: null, hostages: null, rescued: 0, hostGoal: 0, flags: null, zones: null, tags: null, vip: null, extracts: null, jugg: null,
      ladder: null, sharp: null, hold: null, team: { 1: {}, 2: {} }, info: {} };
    this.tagN = 0;
    this.offs = [];
    const bus = game && game.bus;
    if (bus) this.offs.push(bus.on('shot', e => this.onShot(e)), bus.on('grenade:boom', e => this.onBlast(e)));
  }
  dispose() { for (const f of this.offs) f(); this.offs.length = 0; }
  has(k) {
    const s = this.s;
    switch (k) {
      case 'bomb': return !!s.bomb; case 'hostage': return !!s.hostages; case 'flags': return !!s.flags; case 'zones': return !!s.zones;
      case 'tags': return !!s.tags; case 'vip': return !!this.cfg.vip; case 'jugg': return !!this.cfg.jugg; case 'ladder': return !!s.ladder;
      case 'sharp': return !!s.sharp; case 'hide': return !!this.cfg.hide; default: return false;
    }
  }
  emit(action, kind, o = {}) { if (this.g.bus) this.g.bus.emit('objective', { kind, action, ...o }); }
  get map() { return this.g.map || {}; }
  alive() { const out = []; for (const p of this.g.players.values()) if (p.alive && p.connected !== false) out.push(p); return out; }
  live() { return this.match && this.match.phase === 'live'; }
  ground(x, y, z) {
    const w = this.g.world; if (!w || !w.groundAt) return y;
    const gr = w.groundAt(x, z, y + 1.0, 0.12); return gr ? gr.y : y;
  }
  rng() { return this.g.rng ? this.g.rng() : Math.random(); }

  // ================================================================================================= setup (mode.setup)
  useBomb(cfg = {}) {
    const sites = Object.keys(this.map.sites || {});
    this.cfg.bomb = { ...BOMB, sites: cfg.sites || (sites.length ? sites : ['A', 'B']), ...cfg };
    this.s.bomb = { state: 'none', carrier: null, x: 0, y: 0, z: 0, site: null, plantT: 0, planter: null, fuse: 0, fuseMax: this.cfg.bomb.fuse,
      defuseT: 0, defuser: null, kit: false, t: 0, target: null };
  }
  useHostages(cfg = {}) { this.cfg.hostage = { ...HOSTAGE, ...cfg }; this.s.hostages = []; this.s.rescued = 0; }
  useFlags(cfg = {}) {
    this.cfg.flags = { ...FLAG, ...cfg };
    const P = this.map.points || {}, L = this.map.lobbies || {};
    const home = t => { const p = P['flag' + t] || (L[t] ? { x: L[t].x, y: L[t].y, z: L[t].z } : { x: t === 1 ? -20 : 20, y: 0, z: 0 }); return { x: p.x, y: p.y || 0, z: p.z }; };
    this.s.flags = {};
    for (const t of [1, 2]) { const h = home(t); this.s.flags[t] = { team: t, state: 'home', carrier: null, x: h.x, y: h.y, z: h.z, hx: h.x, hy: h.y, hz: h.z, t: 0 }; }
  }
  /** defs: [{ id, label, point (map.points key) | x,y,z,r, active }] */
  useZones(defs, rules = {}) {
    this.cfg.zones = { ...ZONE, ...rules };
    const P = this.map.points || {};
    this.s.zones = [];
    for (const d of defs) {
      const p = d.point ? P[d.point] : d;
      if (!p) continue;
      this.s.zones.push({ id: d.id, label: d.label || d.id, point: d.point || null, x: p.x, y: p.y || 0, z: p.z, r: d.r || p.r || 3.5, owner: 0, c: 0, contested: false,
        n1: 0, n2: 0, active: d.active !== false, t: 0 });
    }
  }
  useTags(cfg = {}) { this.cfg.tags = { ...TAG, ...cfg }; this.s.tags = []; }
  useVip(cfg = {}) {
    this.cfg.vip = { ...VIP_RULES, ...cfg };
    const P = this.map.points || {};
    this.s.extracts = Object.keys(P).filter(k => /^extract\d+$/.test(k)).sort().map(k => ({ id: k, x: P[k].x, y: P[k].y || 0, z: P[k].z, r: Math.max(2.5, P[k].r || 3) }));
    if (!this.s.extracts.length && this.map.rescue) { const r = this.map.rescue; this.s.extracts.push({ id: 'extract1', x: r.x, y: r.y || 0, z: r.z, r: 3 }); }
    this.s.vip = null;
  }
  useJugg(cfg = {}) { this.cfg.jugg = { ...JUGG, ...cfg }; this.s.jugg = null; this.s.info.juggT = this.cfg.jugg.delay; }
  useLadder(list) { this.s.ladder = list.filter(id => getGun(id)); }
  useSharp(cfg = {}) {
    const pool = (cfg.pool || SHARP_POOL).filter(id => getGun(id));
    // deterministic rotation from the game seed (every peer computes the same order)
    let h = (this.g.seed >>> 0) || 1; const order = pool.slice();
    for (let i = order.length - 1; i > 0; i--) { h = (Math.imul(h ^ (h >>> 15), 2246822507) + 0x9e3779b9) >>> 0; const j = h % (i + 1); [order[i], order[j]] = [order[j], order[i]]; }
    this.cfg.sharp = { every: cfg.every || 45 };
    this.s.sharp = { order, i: 0, gun: order[0], t: this.cfg.sharp.every };
  }
  useHide(cfg = {}) { this.cfg.hide = { head: 30, seekers: 1, blind: true, hidden: true, ...cfg }; this.s.hold = { t: 0, on: false }; }

  // ================================================================================================= round start
  roundStart() {
    const s = this.s, g = this.g;
    for (const p of g.players.values()) { p.busy = null; p.carry = null; p.flag = null; if (p.inv) p.inv.bomb = false; p.hold = false; p.blind = 0; p.hidden = false; }
    if (s.bomb) this.bombReset();
    if (s.hostages) this.hostageReset();
    if (s.tags) s.tags.length = 0;
    if (s.flags && this.match.rounds) for (const t of [1, 2]) this.flagHome(s.flags[t]);
    if (s.zones && this.match.rounds) for (const z of s.zones) { z.owner = 0; z.c = 0; z.contested = false; }
    if (this.cfg.vip) this.vipPick();
  }

  // ================================================================================================= the command filter
  /** game.js: called for every simulated player right after its command was built (raw buttons -> p.ibtn), then locks
      movement / fire while planting, defusing, picking up a hostage or held (hide & seek seekers). */
  filter(p, cmd) {
    p.ibtn = cmd.buttons | 0;
    if (p.busy) {
      cmd.mx = 0; cmd.mz = 0; cmd.slot = null;
      cmd.buttons &= ~(BTN.JUMP | BTN.FIRE | BTN.ADS | BTN.RELOAD | BTN.LEANL | BTN.LEANR | BTN.DROP | BTN.WALK);
    }
    if (p.hold) { cmd.mx = 0; cmd.mz = 0; cmd.buttons &= ~(BTN.FIRE | BTN.ADS | BTN.JUMP | BTN.DROP); }
    if ((p.cur === 'bomb' && p.inv.bomb) || p.carry) cmd.buttons &= ~BTN.DROP;     // G drops the charge / the hostage, not a gun
    if (p.carry) cmd.buttons &= ~BTN.ADS;
  }

  // ================================================================================================= tick
  tick(dt) {
    const s = this.s, g = this.g;
    // button edges (this tick vs the previous tick) for every live player
    for (const p of g.players.values()) {
      const b = p.ibtn | 0; p._ibp = b & ~(p._ib | 0); p._ib = b;
      if (!p.alive) { p.busy = null; }
    }
    if (s.bomb) this.bombTick(dt);
    if (s.hostages) this.hostageTick(dt);
    if (!this.live()) return;
    if (s.flags) this.flagTick(dt);
    if (s.zones) this.zoneTick(dt);
    if (s.tags) this.tagTick(dt);
    if (this.cfg.vip) this.vipTick(dt);
    if (this.cfg.jugg) this.juggTick(dt);
    if (s.sharp) this.sharpTick(dt);
    if (this.cfg.hide) this.hideTick(dt);
  }

  onKill(ev) {
    const s = this.s, v = ev.victim;
    v.busy = null;
    if (s.bomb) {
      const b = s.bomb;
      if (b.state === 'carried' && b.carrier === v.id) this.bombDrop(v, false);
      if (b.state === 'planted' && b.defuser === v.id) { b.defuser = null; b.defuseT = 0; }
    }
    if (s.hostages && v.carry) this.hostageDrop(v);
    if (s.flags && v.flag) this.flagDrop(v);
    if (s.tags && ev.killer && !ev.suicide && isEnemy(ev.killer, v) && v.team > 0) {
      s.tags.push({ id: 't' + (++this.tagN), team: v.team, by: ev.killer.team, x: v.pos.x, y: v.pos.y, z: v.pos.z, t: 0, victim: v.id });
      if (s.tags.length > 40) s.tags.shift();
    }
    if (this.cfg.vip && s.vip && s.vip.id === v.id && s.vip.state === 'alive') {
      s.vip.state = 'dead'; v.vip = false;
      this.emit('killed', 'vip', { actor: ev.killer, team: v.team, vip: v.id });
      if (ev.killer) inc(ev.killer, 'vipkills');
      if (this.live()) this.match.endRound(3 - this.cfg.vip.team, 'vip_killed');
    }
    if (this.cfg.jugg && s.jugg === v.id) {
      v.jugg = false; s.jugg = null;
      if (ev.killer && !ev.suicide && ev.killer.alive) { inc(ev.killer, 'juggkills'); this.makeJugg(ev.killer); }
      else s.info.juggT = 3;
    }
  }
  onSpawn(p) {
    p.busy = null; p.carry = null; p.flag = null; p.hidden = false; p.vip = false; p.hold = false; p.blind = 0;
    if (!p.jugg) { p.maxHp = null; p.speedMul = 1; p.noPickup = !!this.mode.noPickup; }
  }

  // ================================================================================================= the charge
  bombReset() {
    const b = this.s.bomb, cfg = this.cfg.bomb;
    Object.assign(b, { state: 'none', carrier: null, site: null, plantT: 0, planter: null, fuse: cfg.fuse, fuseMax: cfg.fuse, defuseT: 0, defuser: null, kit: false, t: 0 });
    const att = this.match.teamPlayers(cfg.attackers).filter(p => p.alive);
    b.target = (cfg.pickTarget && cfg.pickTarget()) || cfg.sites[Math.floor(this.rng() * cfg.sites.length)] || null;     // the attackers' plan this round (bots)
    if (cfg.preplant) {
      const site = this.map.sites && this.map.sites[b.target];
      if (site) {
        const planter = att[Math.floor(this.rng() * att.length)] || null;
        const x = site.x + (this.rng() - 0.5) * Math.min(4, (site.x1 - site.x0) * 0.4), z = site.z + (this.rng() - 0.5) * Math.min(4, (site.z1 - site.z0) * 0.4);
        Object.assign(b, { state: 'planted', site: b.target, x, z, y: this.ground(x, (site.y || 0) + 1.5, z), planter: planter ? planter.id : null, fuse: cfg.fuse });
        this.emit('planted', 'bomb', { actor: planter, site: b.target, team: cfg.attackers, pre: true });
        if (this.match) this.match.onPlant();
      }
      return;
    }
    if (!att.length) return;
    const humans = att.filter(p => !p.bot);
    const pool = cfg.giveHuman && humans.length ? humans : att;
    const c = pool[Math.floor(this.rng() * pool.length)];
    this.bombGive(c);
  }
  bombGive(p) {
    const b = this.s.bomb;
    b.state = 'carried'; b.carrier = p.id; b.t = 0; b.plantT = 0; p.inv.bomb = true;
    b.x = p.pos.x; b.y = p.pos.y; b.z = p.pos.z;
    this.emit('given', 'bomb', { actor: p, team: p.team });
  }
  bombHolder() { const b = this.s.bomb; return b && b.state === 'carried' ? this.g.players.get(b.carrier) || null : null; }
  siteAt(p) {
    const cfg = this.cfg.bomb, S = this.map.sites || {};
    if (!cfg) return null;
    for (const n of cfg.sites) {
      const r = S[n]; if (!r) continue;
      if (inRect(r, p.pos.x, p.pos.z) && (r.y == null || Math.abs(p.pos.y - r.y) < 2.5)) return r;
    }
    return null;
  }
  bombDrop(p, toss) {
    const b = this.s.bomb, w = this.g.world;
    p.inv.bomb = false; p.busy = null;
    if (p.cur === 'bomb' && p.alive) selectSlot(this.g, p, 'last') || selectSlot(this.g, p, 'next');
    let x = p.pos.x, z = p.pos.z, y = p.pos.y;
    if (toss) {
      const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw), tx = x + fx * 1.4, tz = z + fz * 1.4;
      if (!(w && w.blocked && w.blocked(tx, y + 0.3, tz, 0.15, 0.3))) { x = tx; z = tz; }
    }
    y = this.ground(x, y + 0.6, z);
    const minY = this.g.def && this.g.def.bounds && this.g.def.bounds.minY != null ? this.g.def.bounds.minY - 1 : -60;
    if (!(y > minY)) { x = p.pos.x; z = p.pos.z; y = p.pos.y; }
    Object.assign(b, { state: 'dropped', carrier: null, x, y, z, plantT: 0, t: 0, by: p.id });
    this.emit('dropped', 'bomb', { actor: p, team: p.team, x, y, z, toss: !!toss });
  }
  bombTick(dt) {
    const b = this.s.bomb, cfg = this.cfg.bomb, g = this.g, m = this.match;
    b.t += dt;
    if (b.state === 'carried') {
      const c = g.players.get(b.carrier);
      if (!c || !c.alive || c.connected === false || c.team !== cfg.attackers) { if (c) this.bombDrop(c, false); else b.state = 'none'; return; }
      b.x = c.pos.x; b.y = c.pos.y; b.z = c.pos.z;
      const btn = c.ibtn | 0;
      if ((c._ibp & BTN.DROP) && c.cur === 'bomb') { this.bombDrop(c, true); return; }
      const want = (btn & BTN.USE) || (c.cur === 'bomb' && (btn & BTN.FIRE));
      const site = m.phase === 'live' ? this.siteAt(c) : null;
      if (want && site && (c.onGround || b.plantT > 0) && !c.mantle) {
        if (b.plantT === 0) { b.site = site.name; this.emit('plant_start', 'bomb', { actor: c, site: site.name, team: c.team }); }
        b.plantT += dt; c.busy = 'plant';
        if (b.plantT >= cfg.plant) this.bombPlant(c, site);
      } else if (b.plantT > 0) { b.plantT = 0; c.busy = null; this.emit('plant_abort', 'bomb', { actor: c, team: c.team }); }
      return;
    }
    if (b.state === 'dropped') {
      if (m.phase !== 'live' && m.phase !== 'freeze') return;
      for (const q of g.players.values()) {
        if (!q.alive || q.team !== cfg.attackers || q.connected === false) continue;
        if (d2(q.pos, b.x, b.z) < cfg.pickR * cfg.pickR && Math.abs(q.pos.y - b.y) < 1.6) { this.bombGive(q); this.emit('picked', 'bomb', { actor: q, team: q.team }); return; }
      }
      const minY = g.def && g.def.bounds && g.def.bounds.minY != null ? g.def.bounds.minY - 2 : -60;
      if (b.y < minY) { const a = m.teamPlayers(cfg.attackers).find(p => p.alive); if (a) this.bombGive(a); }
      return;
    }
    if (b.state === 'planted') {
      b.fuse = Math.max(0, b.fuse - dt);
      // defuse: one defender at a time, holding USE next to the charge, not moving (locked by the filter)
      const need = q => (q.inv.kit ? cfg.kit : cfg.defuse);
      let d = b.defuser ? g.players.get(b.defuser) : null;
      const near = q => q.alive && q.team === 3 - cfg.attackers && Math.hypot(q.pos.x - b.x, q.pos.z - b.z) < cfg.defuseR && Math.abs(q.pos.y - b.y) < 1.6;
      if (d && !(near(d) && (d.ibtn & BTN.USE))) { d.busy = null; b.defuser = null; b.defuseT = 0; this.emit('defuse_abort', 'bomb', { actor: d, team: d.team }); d = null; }
      if (!d && (m.phase === 'live')) {
        for (const q of g.players.values()) if (near(q) && (q.ibtn & BTN.USE) && !q.busy) { d = q; break; }
        if (d) { b.defuser = d.id; b.defuseT = 0; b.kit = !!d.inv.kit; d.busy = 'defuse'; this.emit('defuse_start', 'bomb', { actor: d, team: d.team, kit: b.kit }); }
      }
      if (d) {
        b.defuseT += dt; d.busy = 'defuse';
        if (b.defuseT >= need(d) && b.fuse > 0) { this.bombDefused(d); return; }
      }
      if (b.fuse <= 0) this.bombExplode();
    }
  }
  bombPlant(c, site) {
    const b = this.s.bomb, g = this.g;
    c.inv.bomb = false; c.busy = null;
    if (c.cur === 'bomb') selectSlot(g, c, 'last') || selectSlot(g, c, 'next');
    Object.assign(b, { state: 'planted', carrier: null, x: c.pos.x, y: c.pos.y, z: c.pos.z, site: site.name, planter: c.id, fuse: this.cfg.bomb.fuse, fuseMax: this.cfg.bomb.fuse,
      plantT: 0, defuseT: 0, defuser: null, t: 0 });
    inc(c, 'plants'); c.score += 3;
    if (g.economy) g.economy.give(c, 300, 'PLANTED THE CHARGE');
    this.emit('planted', 'bomb', { p: c, actor: c, site: site.name, team: c.team });
    this.match.onPlant();
  }
  bombDefused(d) {
    const b = this.s.bomb, g = this.g;
    b.state = 'defused'; b.defuser = d.id; d.busy = null;
    inc(d, 'defuses'); d.score += 3;
    if (g.economy) g.economy.give(d, 300, 'DEFUSED THE CHARGE');
    this.emit('defused', 'bomb', { p: d, actor: d, site: b.site, team: d.team, fuse: b.fuse });
    if (this.match.phase === 'live') this.match.endRound(3 - this.cfg.bomb.attackers, 'defuse');
  }
  bombExplode() {
    const b = this.s.bomb, g = this.g, cfg = this.cfg.bomb;
    b.state = 'exploded'; b.defuser = null;
    let att = b.planter && g.players.get(b.planter);
    if (!att) att = this.match.teamPlayers(cfg.attackers)[0] || null;
    if (g.bus) g.bus.emit('bomb:explode', { x: b.x, y: b.y, z: b.z, planter: b.planter });
    this.emit('exploded', 'bomb', { actor: att, site: b.site, team: cfg.attackers });
    for (const q of this.alive()) {
      const dx = q.pos.x - b.x, dy = q.pos.y + 1 - b.y, dz = q.pos.z - b.z, d = Math.hypot(dx, dy, dz);
      const dmg = cfg.dmg * Math.exp(-(d * d) / (2 * cfg.sigma * cfg.sigma));
      if (dmg < 1) continue;
      const l = d || 1;
      g.damage(q, { attacker: att ? att.id : null, dmg, kind: 'blast', group: 'chest', weapon: 'charge', armorPen: 0.6,
        point: { x: q.pos.x, y: q.pos.y + 1, z: q.pos.z }, dir: { x: dx / l, y: dy / l, z: dz / l }, dist: d });
    }
    if (this.match.phase === 'live') this.match.endRound(cfg.attackers, 'bomb');
  }

  // ================================================================================================= hostages
  hostageReset() {
    const list = (this.map.hostages || []).slice(0, 8), s = this.s, cfg = this.cfg.hostage;
    s.hostages = list.map((h, i) => ({ id: 'h' + i, x: h.x, y: h.y == null ? 0 : h.y, z: h.z, yaw: (hash(this.g.seed + ':h' + i) % 628) / 100, state: 'idle', by: null,
      hp: cfg.hp, pick: 0, pickBy: null }));
    s.rescued = 0; s.hostGoal = Math.min(cfg.goal, s.hostages.length || 1);
  }
  hostageDrop(p) {
    const h = this.s.hostages.find(x => x.id === p.carry);
    p.carry = null; p.speedMul = 1;
    if (!h || h.state !== 'carried') return;
    h.state = 'idle'; h.by = null; h.x = p.pos.x - Math.sin(p.yaw) * 0.5; h.z = p.pos.z - Math.cos(p.yaw) * 0.5; h.y = this.ground(h.x, p.pos.y + 0.5, h.z); h.yaw = p.yaw;
    this.emit('dropped', 'hostage', { actor: p, team: p.team, hostage: h.id });
  }
  hostageTick(dt) {
    const s = this.s, cfg = this.cfg.hostage, g = this.g, m = this.match;
    if (m.phase !== 'live') { for (const h of s.hostages) { h.pick = 0; h.pickBy = null; } return; }
    const rescuers = cfg.rescuers;
    for (const h of s.hostages) {
      if (h.state === 'idle') {
        let q = h.pickBy ? g.players.get(h.pickBy) : null;
        const ok = r => r && r.alive && r.team === rescuers && !r.carry && (r.ibtn & BTN.USE) && Math.hypot(r.pos.x - h.x, r.pos.z - h.z) < cfg.pickR && Math.abs(r.pos.y - h.y) < 1.7;
        if (q && !ok(q)) { q.busy = null; h.pickBy = null; h.pick = 0; q = null; }
        if (!q) for (const r of g.players.values()) if (ok(r) && !r.busy) { q = r; h.pickBy = r.id; h.pick = 0; this.emit('pick_start', 'hostage', { actor: r, team: r.team, hostage: h.id }); break; }
        if (q) {
          q.busy = 'pickup'; h.pick += dt;
          if (h.pick >= cfg.pick) {
            h.state = 'carried'; h.by = q.id; h.pick = 0; h.pickBy = null; q.busy = null; q.carry = h.id; q.speedMul = cfg.speed;
            if (q.cur === 'primary' && q.ws) q.ws.ads = 0;
            this.emit('picked', 'hostage', { actor: q, team: q.team, hostage: h.id });
          }
        }
      } else if (h.state === 'carried') {
        const c = g.players.get(h.by);
        if (!c || !c.alive) { if (c) this.hostageDrop(c); else { h.state = 'idle'; h.by = null; } continue; }
        h.x = c.pos.x; h.y = c.pos.y; h.z = c.pos.z; h.yaw = c.yaw;
        if (c._ibp & BTN.DROP) { this.hostageDrop(c); continue; }
        const zones = this.map.rescues && this.map.rescues.length ? this.map.rescues : this.map.rescue ? [this.map.rescue] : [];
        if (zones.some(r => inRect(r, c.pos.x, c.pos.z) && (r.y == null || Math.abs(c.pos.y - r.y) < 3))) {
          h.state = 'rescued'; h.by = c.id; c.carry = null; c.speedMul = 1; s.rescued++;
          inc(c, 'rescues'); c.score += 4;
          if (g.economy) {
            g.economy.give(c, 1000, 'RESCUED A HOSTAGE');
            for (const q of m.teamPlayers(c.team)) if (q !== c) g.economy.give(q, 300, 'HOSTAGE RESCUED');
          }
          this.emit('rescued', 'hostage', { p: c, actor: c, team: c.team, hostage: h.id, count: s.rescued });
        }
      }
    }
    if (m.phase === 'live') {
      if (s.rescued >= s.hostGoal) m.endRound(rescuers, 'hostage');
      else {
        const left = s.hostages.filter(h => h.state === 'idle' || h.state === 'carried').length;
        if (s.hostages.length && s.rescued + left < s.hostGoal) m.endRound(3 - rescuers, 'hostages_lost');
      }
    }
  }
  hurtHostage(h, dmg, by, kind) {
    if (h.state !== 'idle' || !(dmg > 0)) return;
    const g = this.g, cfg = this.cfg.hostage;
    const dealt = Math.min(h.hp, Math.round(dmg));
    h.hp -= dealt;
    const att = by ? (typeof by === 'object' ? by : g.players.get(by)) : null;
    if (att && g.economy) g.economy.give(att, -dealt * 10, 'HOSTAGE INJURED');
    this.emit('hurt', 'hostage', { actor: att, hostage: h.id, dmg: dealt, kind });
    if (h.hp <= 0) {
      h.state = 'dead';
      if (att) { inc(att, 'hkills'); att.score -= 3; if (g.economy) g.economy.give(att, -1000, 'HOSTAGE KILLED'); }
      this.emit('killed', 'hostage', { actor: att, hostage: h.id });
    }
  }
  onShot(e) {
    const s = this.s; if (!s.hostages || !s.hostages.length || !e || !e.traces || !e.origin) return;
    const o = e.origin, st = e.gun || {};
    for (const tr of e.traces) {
      const end = tr.end; if (!end) continue;
      for (const h of s.hostages) {
        if (h.state !== 'idle') continue;
        const t = segHitsCapsule(o.x, o.y, o.z, end.x, end.y, end.z, h.x, h.y + 0.15, h.y + 1.0, h.z, 0.3);
        if (t < 0) continue;
        const dmg = (st.dmg || 30) * Math.pow(st.falloff || 0.9, t / 10);
        this.hurtHostage(h, dmg, e.p, 'bullet');
      }
    }
  }
  onBlast(e) {
    const s = this.s; if (!s.hostages || !e || !e.pos) return;
    const n = e.nade || {}, gid = n.gid || n.kind || n.id, nd = gid ? getNade(gid) : null;
    if (!nd || !(nd.dmg > 0)) return;
    for (const h of s.hostages) {
      if (h.state !== 'idle') continue;
      const d = Math.hypot(h.x - e.pos.x, h.y + 0.6 - e.pos.y, h.z - e.pos.z);
      let dmg = 0; try { dmg = blastDamage(nd, d); } catch (er) { dmg = 0; }
      if (dmg > 0) this.hurtHostage(h, dmg, n.owner || n.by || n.p || e.p || null, 'blast');
    }
  }

  // ================================================================================================= flags
  flagHome(f) { f.state = 'home'; f.carrier = null; f.x = f.hx; f.y = f.hy; f.z = f.hz; f.t = 0; }
  flagDrop(p) {
    const f = this.s.flags[p.flag]; p.flag = null;
    if (!f || f.state !== 'carried') return;
    f.state = 'dropped'; f.carrier = null; f.t = 0; f.x = p.pos.x; f.z = p.pos.z; f.y = this.ground(f.x, p.pos.y + 0.5, f.z);
    this.emit('dropped', 'flag', { actor: p, team: f.team });
  }
  flagTick(dt) {
    const cfg = this.cfg.flags, g = this.g, F = this.s.flags;
    for (const t of [1, 2]) {
      const f = F[t];
      if (f.state === 'carried') {
        const c = g.players.get(f.carrier);
        if (!c || !c.alive) { if (c) this.flagDrop(c); else this.flagHome(f); continue; }
        f.x = c.pos.x; f.y = c.pos.y; f.z = c.pos.z;
        const own = F[c.team];
        if (own && own.state === 'home' && Math.hypot(c.pos.x - own.hx, c.pos.z - own.hz) < cfg.capR && Math.abs(c.pos.y - own.hy) < 2.5) {
          this.flagHome(f); c.flag = null; inc(c, 'caps'); c.score += 10;
          this.emit('captured', 'flag', { p: c, actor: c, team: c.team, flag: t });
          this.match.addScore(c.team, 1);
        }
        continue;
      }
      if (f.state === 'dropped') { f.t += dt; if (f.t >= cfg.returnT) { this.flagHome(f); this.emit('returned', 'flag', { team: t, auto: true }); continue; } }
      for (const q of g.players.values()) {
        if (!q.alive || q.connected === false || q.team <= 0) continue;
        if (Math.hypot(q.pos.x - f.x, q.pos.z - f.z) > cfg.touch || Math.abs(q.pos.y - f.y) > 1.8) continue;
        if (q.team !== t && !q.flag) {
          const from = f.state;
          f.state = 'carried'; f.carrier = q.id; q.flag = t; f.t = 0;
          this.emit('taken', 'flag', { actor: q, team: t, from });
          break;
        }
        if (q.team === t && f.state === 'dropped') {
          this.flagHome(f); inc(q, 'returns'); q.score += 3;
          this.emit('returned', 'flag', { actor: q, team: t });
          break;
        }
      }
    }
  }

  // ================================================================================================= zones
  zone(id) { return this.s.zones ? this.s.zones.find(z => z.id === id) || null : null; }
  activeZones() { return this.s.zones ? this.s.zones.filter(z => z.active) : []; }
  inZone(z, p) { return Math.hypot(p.pos.x - z.x, p.pos.z - z.z) <= z.r && Math.abs(p.pos.y - z.y) <= this.cfg.zones.height; }
  zoneTick(dt) {
    const R = this.cfg.zones, g = this.g;
    for (const z of this.s.zones) {
      if (!z.active) { z.n1 = z.n2 = 0; z.contested = false; continue; }
      let n1 = 0, n2 = 0;
      for (const p of g.players.values()) {
        if (!p.alive || p.connected === false) continue;
        if (this.inZone(z, p)) { if (p.team === 1) n1++; else if (p.team === 2) n2++; }
      }
      z.n1 = n1; z.n2 = n2;
      const was = z.contested; z.contested = n1 > 0 && n2 > 0;
      if (z.contested && !was) this.emit('contested', 'zone', { zone: z.id, team: z.owner });
      const only = n1 > 0 && n2 === 0 ? 1 : n2 > 0 && n1 === 0 ? 2 : 0;
      if (R.instant) {
        const prev = z.owner;
        if (only) z.owner = only; else if (!z.contested) z.owner = 0;
        z.c = z.owner === 1 ? 1 : z.owner === 2 ? -1 : 0;
        if (z.owner && z.owner !== prev) this.emit('captured', 'zone', { zone: z.id, team: z.owner, quiet: true });
        continue;
      }
      if (only) {
        const sign = only === 1 ? 1 : -1, n = only === 1 ? n1 : n2;
        let rate = (1 + 0.5 * Math.min(2, n - 1)) / R.capTime;
        if (z.c * sign < 0) rate /= R.neutral;
        const before = z.c;
        z.c = clamp(z.c + sign * rate * dt, -1, 1);
        if (z.owner && z.owner !== only && (before * z.c <= 0)) {
          const lost = z.owner; z.owner = 0;
          this.emit('neutralized', 'zone', { zone: z.id, team: only, lost });
          if (R.onNeutral) R.onNeutral(z, lost, only);
        }
        if (Math.abs(z.c) >= 1 && z.owner !== only) {
          z.owner = only; z.t = 0;
          const who = [...g.players.values()].filter(p => p.alive && p.team === only && this.inZone(z, p));
          for (const p of who) { inc(p, 'caps'); p.score += 5; }
          this.emit('captured', 'zone', { zone: z.id, team: only, p: who[0] || null, actor: who[0] || null, by: who.map(p => p.id) });
          if (R.onCapture) R.onCapture(z, only);
        }
      } else if (!z.contested) {
        const target = z.owner === 1 ? 1 : z.owner === 2 ? -1 : 0;
        z.c += clamp(target - z.c, -R.decay * dt, R.decay * dt);
      }
      z.t += dt;
    }
  }

  // ================================================================================================= dog tags
  tagTick(dt) {
    const cfg = this.cfg.tags, g = this.g, tags = this.s.tags;
    for (let i = tags.length - 1; i >= 0; i--) {
      const t = tags[i]; t.t += dt;
      if (t.t > cfg.life) { tags.splice(i, 1); continue; }
      for (const q of g.players.values()) {
        if (!q.alive || q.team <= 0) continue;
        if (Math.hypot(q.pos.x - t.x, q.pos.z - t.z) > cfg.touch || Math.abs(q.pos.y - t.y) > 1.8) continue;
        tags.splice(i, 1);
        if (q.team === t.by) { inc(q, 'confirms'); q.score += 5; this.emit('confirmed', 'tag', { p: q, actor: q, team: q.team, victim: t.victim }); this.match.addScore(q.team, 1); }
        else { inc(q, 'denies'); q.score += 3; this.emit('denied', 'tag', { actor: q, team: q.team, victim: t.victim }); }
        break;
      }
    }
  }

  // ================================================================================================= VIP
  vipPick() {
    const cfg = this.cfg.vip, list = this.match.teamPlayers(cfg.team).filter(p => p.alive).sort((a, b) => (a.id < b.id ? -1 : 1));
    for (const p of this.g.players.values()) p.vip = false;
    if (!list.length) { this.s.vip = null; return; }
    const p = list[(Math.max(1, this.match.round) - 1) % list.length];
    this.s.vip = { id: p.id, state: 'alive', exT: 0, ex: null };
    p.vip = true;
    giveOnly(this.g, p, cfg.gun);
    p.armor = 100; p.helmet = true; p.speedMul = cfg.speed; p.noPickup = true; p.inv.nades = []; p.curNade = null;
    this.emit('chosen', 'vip', { actor: p, team: p.team });
  }
  vipTick(dt) {
    const v = this.s.vip; if (!v || v.state !== 'alive') return;
    const p = this.g.players.get(v.id);
    if (!p || !p.alive) return;
    const ex = (this.s.extracts || []).find(e => Math.hypot(p.pos.x - e.x, p.pos.z - e.z) <= e.r && Math.abs(p.pos.y - e.y) < 3);
    if (ex) {
      if (v.exT === 0) this.emit('extracting', 'vip', { actor: p, team: p.team, ex: ex.id });
      v.exT += dt; v.ex = ex.id;
      if (v.exT >= this.cfg.vip.extractT) {
        v.state = 'escaped'; inc(p, 'extracts'); p.score += 10;
        this.emit('escaped', 'vip', { p, actor: p, team: p.team, ex: ex.id });
        this.match.endRound(this.cfg.vip.team, 'vip_escaped');
      }
    } else { v.exT = 0; v.ex = null; }
  }

  // ================================================================================================= juggernaut
  makeJugg(p) {
    const cfg = this.cfg.jugg, s = this.s;
    for (const q of this.g.players.values()) if (q !== p && q.jugg) { q.jugg = false; q.maxHp = null; q.speedMul = 1; q.noPickup = false; }
    s.jugg = p.id; p.jugg = true;
    const keep = p.inv.secondary;
    giveOnly(this.g, p, cfg.gun);
    p.inv.secondary = keep;
    p.hp = p.maxHp = cfg.hp; p.armor = 100; p.helmet = true; p.speedMul = cfg.speed; p.noPickup = true;
    this.emit('new', 'jugg', { actor: p, p: null });
  }
  juggTick(dt) {
    const s = this.s;
    if (s.jugg) { const j = this.g.players.get(s.jugg); if (!j || !j.alive) { if (j) j.jugg = false; s.jugg = null; s.info.juggT = 3; } return; }
    s.info.juggT -= dt;
    if (s.info.juggT <= 0) {
      const a = this.alive(); if (!a.length) return;
      this.makeJugg(a[Math.floor(this.rng() * a.length)]);
    }
  }

  // ================================================================================================= sharpshooter
  sharpTick(dt) {
    const sh = this.s.sharp;
    sh.t -= dt;
    if (sh.t > 0) return;
    sh.i = (sh.i + 1) % sh.order.length; sh.gun = sh.order[sh.i]; sh.t = this.cfg.sharp.every;
    for (const p of this.alive()) giveOnly(this.g, p, sh.gun);
    this.emit('rotate', 'sharp', { gun: sh.gun });
  }

  // ================================================================================================= hide & seek
  hideTick(dt) {
    const h = this.s.hold, cfg = this.cfg.hide, g = this.g, seek = cfg.seekers;
    if (h.on) {
      h.t = Math.max(0, h.t - dt);
      if (h.t <= 0) {
        h.on = false;
        for (const p of g.players.values()) if (p.team === seek) { p.hold = false; p.blind = 0; }
        if (g.map && g.map.openGates) g.map.openGates(seek);
        this.emit('released', 'hide', { team: seek });
      } else for (const p of g.players.values()) if (p.team === seek && p.alive) { p.hold = true; p.blind = cfg.blind ? h.t : 0; }
    }
    if (!cfg.hidden) return;
    // a hider crouched and still inside a hide spot is hidden (bots read p.hidden)
    const hides = (this.map.hides || []);
    for (const p of g.players.values()) {
      if (p.team !== 3 - seek || !p.alive) { p.hidden = false; continue; }
      const still = Math.hypot(p.vel.x, p.vel.z) < 0.6 && p.crouch > 0.6;
      p.hidden = still && hides.some(s => Math.hypot(p.pos.x - s.x, p.pos.z - s.z) < (s.r || 0.8) + 0.7 && (s.y == null || Math.abs(p.pos.y - s.y) < 1.5));
    }
  }
  /** match.js goLive for hide & seek: the hiders' gates open now, the seekers' after the head start. */
  hideStart() {
    const h = this.s.hold, cfg = this.cfg.hide, g = this.g;
    h.on = true; h.t = cfg.head;
    if (g.map && g.map.openGates) g.map.openGates(3 - cfg.seekers);
    for (const p of g.players.values()) if (p.team === cfg.seekers) { p.hold = true; p.blind = cfg.blind ? cfg.head : 0; }
    this.emit('head_start', 'hide', { team: 3 - cfg.seekers, secs: cfg.head });
  }

  // ================================================================================================= HUD helpers
  markers(viewer) {
    const out = [], s = this.s, g = this.g, me = viewer, team = me ? me.team : 0;
    const add = (x, y, z, label, color, icon, o = {}) => out.push({ x, y, z, label, color, icon, edge: !!o.edge, dist: o.dist !== false, pulse: !!o.pulse, kind: o.kind || icon, r: o.r || 0, max: o.max || 0 });
    if (s.bomb) {
      const b = s.bomb, cfg = this.cfg.bomb, att = team === cfg.attackers, S = this.map.sites || {};
      for (const n of cfg.sites) {
        const r = S[n]; if (!r) continue;
        const hot = b.state === 'planted' && b.site === n;
        add(r.x, (r.y || 0) + 2.2, r.z, n, hot ? COL.enemy : 'rgba(236,235,230,.8)', 'site', { edge: hot, pulse: hot, kind: 'site' });
      }
      if (b.state === 'dropped' && (att || !me)) add(b.x, b.y + 0.4, b.z, 'CHARGE', COL.obj, 'bomb', { edge: true, pulse: true });
      if (b.state === 'planted') add(b.x, b.y + 0.4, b.z, b.defuser ? 'DEFUSING' : 'CHARGE', COL.enemy, 'bomb', { edge: !att, pulse: true });
      if (b.state === 'carried' && att && me && b.carrier !== me.id) { const c = g.players.get(b.carrier); if (c) add(c.pos.x, c.pos.y + 2.5, c.pos.z, '', COL.obj, 'carrier', { dist: false }); }
    }
    if (s.hostages) {
      const cfg = this.cfg.hostage, resc = team === cfg.rescuers;
      for (const h of s.hostages) if (h.state === 'idle') add(h.x, h.y + 1.35, h.z, 'HOSTAGE', resc ? COL.obj : COL.white, 'hostage', { edge: resc && !(me && me.carry), max: resc ? 0 : 40 });
      if (resc && me && me.carry) for (const r of (this.map.rescues && this.map.rescues.length ? this.map.rescues : this.map.rescue ? [this.map.rescue] : [])) add(r.x, (r.y || 0) + 1.5, r.z, 'RESCUE', COL.ok, 'extract', { edge: true, pulse: true });
    }
    if (s.flags) for (const t of [1, 2]) {
      const f = s.flags[t]; if (f.state === 'carried' && me && f.carrier === me.id) continue;
      const mine = t === team;
      const label = f.state === 'home' ? (mine ? 'DEFEND' : 'TAKE') : f.state === 'dropped' ? (mine ? 'RETURN' : 'TAKE') : (mine ? 'KILL CARRIER' : 'ESCORT');
      add(f.x, f.y + (f.state === 'carried' ? 2.3 : 2.4), f.z, label, t === 1 ? COL[1] : COL[2], 'flag', { edge: true, pulse: f.state !== 'home' });
      if (mine && me && me.flag && f.state === 'home') add(f.hx, f.hy + 1.2, f.hz, 'CAPTURE', COL.ok, 'extract', { edge: true, pulse: true });
    }
    if (s.zones) for (const z of s.zones) {
      if (!z.active) continue;
      const col = z.contested ? COL.white : z.owner ? (z.owner === 1 ? COL[1] : COL[2]) : 'rgba(236,235,230,.85)';
      add(z.x, z.y + 2.4, z.z, z.label, col, 'zone', { edge: true, pulse: z.contested, kind: 'zone', r: z.c });
    }
    if (s.tags && me) for (const t of s.tags) {
      if (Math.hypot(t.x - me.pos.x, t.z - me.pos.z) > 32) continue;
      add(t.x, t.y + 0.6, t.z, t.by === team ? 'CONFIRM' : 'DENY', t.by === team ? COL.obj : (team === 1 ? COL[1] : COL[2]), 'tag', { dist: false });
    }
    if (this.cfg.vip && s.vip) {
      const v = g.players.get(s.vip.id), vt = this.cfg.vip.team;
      if (v && v.alive && team === vt && v !== me) add(v.pos.x, v.pos.y + 2.2, v.pos.z, 'VIP', COL.obj, 'vip', { edge: true });
      for (const e of s.extracts || []) add(e.x, e.y + 1.6, e.z, 'EXTRACT', team === vt ? COL.ok : COL.enemy, 'extract', { edge: team === vt && me && me.vip, pulse: !!(me && me.vip) });
    }
    if (this.cfg.jugg && s.jugg) { const j = g.players.get(s.jugg); if (j && j.alive && j !== me) add(j.pos.x, j.pos.y + 2.3, j.pos.z, 'JUGGERNAUT', COL.enemy, 'jugg', { edge: true, pulse: true }); }
    if (this.cfg.hide && this.cfg.hide.hidden && s.hold && s.hold.on && me && me.team === 3 - this.cfg.hide.seekers) {
      for (const h of this.map.hides || []) if (Math.hypot(h.x - me.pos.x, h.z - me.pos.z) < 30) add(h.x, (h.y == null ? me.pos.y : h.y) + 0.7, h.z, 'HIDE', COL.ok, 'hide', { dist: true });
    }
    return out;
  }

  progress(p) {
    if (!p || !p.alive) return null;
    const s = this.s;
    if (s.bomb) {
      const b = s.bomb, cfg = this.cfg.bomb;
      if (b.state === 'carried' && b.carrier === p.id && b.plantT > 0) return { label: 'PLANTING THE CHARGE', k: b.plantT / cfg.plant, color: COL.obj };
      if (b.state === 'planted' && b.defuser === p.id) { const need = p.inv.kit ? cfg.kit : cfg.defuse; return { label: p.inv.kit ? 'DEFUSING · KIT' : 'DEFUSING', k: b.defuseT / need, color: COL[2], warn: b.fuse < need - b.defuseT }; }
    }
    if (s.hostages) { const h = s.hostages.find(x => x.pickBy === p.id); if (h) return { label: 'SECURING HOSTAGE', k: h.pick / this.cfg.hostage.pick, color: COL.obj }; }
    if (s.zones) for (const z of s.zones) {
      if (!z.active || !this.inZone(z, p) || this.cfg.zones.instant) continue;
      const k = p.team === 1 ? (z.c + 1) / 2 : (1 - z.c) / 2;
      if (z.contested) return { label: 'CONTESTED · ' + z.label, k, color: COL.white };
      if (z.owner !== p.team) return { label: (z.owner ? 'NEUTRALISING ' : 'CAPTURING ') + z.label, k: z.owner ? 1 - Math.abs(z.c) : Math.max(0, p.team === 1 ? z.c : -z.c), color: p.team === 1 ? COL[1] : COL[2] };
    }
    if (this.cfg.vip && s.vip && s.vip.id === p.id && s.vip.exT > 0) return { label: 'EXTRACTING', k: s.vip.exT / this.cfg.vip.extractT, color: COL.ok };
    return null;
  }

  prompt(p, key = k => k) {
    if (!p || !p.alive) return '';
    const s = this.s, use = '<kbd>' + key('use') + '</kbd>';
    if (s.bomb) {
      const b = s.bomb, cfg = this.cfg.bomb;
      if (b.state === 'carried' && b.carrier === p.id && !b.plantT) return this.siteAt(p) ? 'HOLD ' + use + ' TO PLANT THE CHARGE' : 'YOU CARRY THE CHARGE · <kbd>' + key('slot5') + '</kbd> SELECT · <kbd>' + key('drop') + '</kbd> DROP';
      if (b.state === 'planted' && p.team === 3 - cfg.attackers && !b.defuser && Math.hypot(p.pos.x - b.x, p.pos.z - b.z) < cfg.defuseR + 0.4) return 'HOLD ' + use + ' TO DEFUSE' + (p.inv.kit ? ' · KIT' : ' · NO KIT');
    }
    if (s.hostages && p.team === this.cfg.hostage.rescuers) {
      if (p.carry) return 'CARRYING A HOSTAGE · REACH THE RESCUE ZONE · <kbd>' + key('drop') + '</kbd> PUT DOWN';
      const h = s.hostages.find(x => x.state === 'idle' && Math.hypot(p.pos.x - x.x, p.pos.z - x.z) < this.cfg.hostage.pickR + 0.4 && Math.abs(p.pos.y - x.y) < 1.7);
      if (h && !h.pickBy) return 'HOLD ' + use + ' TO PICK UP THE HOSTAGE';
    }
    if (s.flags && p.flag) return 'YOU HAVE THE ENEMY FLAG · BRING IT TO YOUR BASE';
    if (this.cfg.vip && s.vip && s.vip.id === p.id) return 'YOU ARE THE VIP · REACH AN EXTRACTION POINT';
    return '';
  }

  // ================================================================================================= bot goals (docs §8)
  botGoal(bot) {
    const s = this.s, g = this.g, p = bot, team = p.team, h = hash(p.id + ':' + (this.match.round | 0));
    const P = o => ({ x: o.x, y: o.y || 0, z: o.z });
    if (s.bomb) {
      const b = s.bomb, cfg = this.cfg.bomb, S = this.map.sites || {}, att = team === cfg.attackers;
      const tgt = S[b.target] || S[cfg.sites[0]];
      if (att) {
        if (b.state === 'carried' && b.carrier === p.id) { const site = this.siteAt(p); return site ? { kind: 'plant', pos: P(p.pos), site: site.name, use: true, urgency: 1, radius: 0.5 } : { kind: 'plant', pos: P(tgt), site: b.target, use: true, urgency: 0.8, radius: 2 }; }
        if (b.state === 'dropped') return { kind: 'attack', pos: P(b), target: 'charge', urgency: 0.85, radius: 0.6 };
        if (b.state === 'planted') return { kind: 'defend', pos: P(b), site: b.site, urgency: 0.7, radius: 7 };
        const c = this.bombHolder();
        return { kind: 'escort', pos: tgt ? P(tgt) : P(p.pos), target: c ? c.id : null, site: b.target, urgency: 0.5, radius: 6 };
      }
      if (b.state === 'planted') return { kind: 'defuse', pos: P(b), site: b.site, use: true, urgency: clamp(1 - b.fuse / cfg.fuse + 0.5, 0.5, 1), radius: 1.0 };
      const site = S[cfg.sites[h % cfg.sites.length]] || tgt;
      return site ? { kind: 'defend', pos: P(site), site: site.name, urgency: 0.45, radius: Math.max(3, Math.min(8, (site.x1 - site.x0) / 2)) } : null;
    }
    if (s.hostages) {
      const cfg = this.cfg.hostage, resc = team === cfg.rescuers;
      const zones = this.map.rescues && this.map.rescues.length ? this.map.rescues : this.map.rescue ? [this.map.rescue] : [];
      const idle = s.hostages.filter(x => x.state === 'idle');
      const nearest = (list, o) => list.reduce((a, b) => (!a || d2(o, b.x, b.z) < d2(o, a.x, a.z) ? b : a), null);
      if (resc) {
        if (p.carry) { const z = nearest(zones, p.pos); return z ? { kind: 'rescue', pos: P(z), urgency: 1, radius: 1.5 } : null; }
        const hh = nearest(idle, p.pos); return hh ? { kind: 'rescue', pos: P(hh), target: hh.id, use: true, urgency: 0.7, radius: 1.0 } : null;
      }
      const carrier = [...g.players.values()].find(q => q.alive && q.carry);
      if (carrier) return { kind: 'hunt', pos: P(carrier.pos), target: carrier.id, urgency: 0.9 };
      const hh = idle[h % Math.max(1, idle.length)]; return hh ? { kind: 'defend', pos: P(hh), urgency: 0.45, radius: 6 } : null;
    }
    if (s.flags) {
      const F = s.flags, mine = F[team], theirs = F[3 - team];
      if (!mine || !theirs) return null;
      if (p.flag) return { kind: 'flag', pos: { x: mine.hx, y: mine.hy, z: mine.hz }, urgency: 1, radius: 1.2 };
      if (mine.state === 'carried') { const c = g.players.get(mine.carrier); if (c) return { kind: 'hunt', pos: P(c.pos), target: c.id, urgency: 0.95 }; }
      if (mine.state === 'dropped') return { kind: 'return', pos: P(mine), urgency: 0.9, radius: 0.8 };
      if (h % 3 === 0) return { kind: 'defend', pos: { x: mine.hx, y: mine.hy, z: mine.hz }, urgency: 0.4, radius: 6 };
      if (theirs.state === 'carried') { const c = g.players.get(theirs.carrier); if (c) return { kind: 'escort', pos: P(c.pos), target: c.id, urgency: 0.6, radius: 5 }; }
      return { kind: 'flag', pos: P(theirs), urgency: 0.7, radius: 0.8 };
    }
    if (s.zones) {
      const act = this.activeZones(); if (!act.length) return null;
      let best = null, bs = -Infinity;
      for (const z of act) {
        const own = z.owner === team, d = Math.hypot(z.x - p.pos.x, z.z - p.pos.z);
        const sc = (own ? (z.contested ? 30 : -20) : 25) - d * 0.5 + ((hash(p.id + z.id) % 11) - 5);
        if (sc > bs) { bs = sc; best = z; }
      }
      const own = best.owner === team && !best.contested;
      return { kind: own ? 'hold' : 'capture', pos: P(best), zone: best.id, urgency: own ? 0.5 : 0.8, radius: best.r * 0.7 };
    }
    if (s.tags && s.tags.length) {
      let best = null, bd = 25 * 25;
      for (const t of s.tags) { const dd = d2(p.pos, t.x, t.z); if (dd < bd) { bd = dd; best = t; } }
      if (best) return { kind: 'attack', pos: P(best), target: best.id, urgency: best.by === team ? 0.75 : 0.6, radius: 0.6 };
    }
    if (this.cfg.vip && s.vip && s.vip.state === 'alive') {
      const v = g.players.get(s.vip.id), vt = this.cfg.vip.team, ex = s.extracts || [];
      const e = ex[(h >>> 3) % Math.max(1, ex.length)] || null;
      if (p.vip) { const near = ex.reduce((a, b) => (!a || d2(p.pos, b.x, b.z) < d2(p.pos, a.x, a.z) ? b : a), null); return near ? { kind: 'escort', pos: P(near), target: p.id, self: true, urgency: 1, radius: 1.5 } : null; }
      if (team === vt && v) return { kind: 'escort', pos: P(v.pos), target: v.id, urgency: 0.7, radius: 4 };
      if (e) return { kind: 'defend', pos: P(e), urgency: 0.6, radius: 8 };
    }
    if (this.cfg.jugg && s.jugg && s.jugg !== p.id) { const j = g.players.get(s.jugg); if (j) return { kind: 'hunt', pos: P(j.pos), target: j.id, urgency: 0.7 }; }
    if (this.cfg.hide && this.cfg.hide.hidden) {
      const seek = this.cfg.hide.seekers, hides = this.map.hides || [];
      if (!hides.length) return null;
      if (team === seek) { const sp = hides[(h + Math.floor((g.time || 0) / 20)) % hides.length]; return { kind: 'seek', pos: P({ x: sp.x, y: sp.y == null ? p.pos.y : sp.y, z: sp.z }), urgency: 0.6, radius: 1.5 }; }
      const hiders = [...g.players.values()].filter(q => q.team === p.team).sort((a, b) => (a.id < b.id ? -1 : 1)), i = Math.max(0, hiders.indexOf(p));
      const sp = hides[(i * 7 + (hash(String(g.seed)) % hides.length)) % hides.length];
      return { kind: 'hide', pos: P({ x: sp.x, y: sp.y == null ? p.pos.y : sp.y, z: sp.z }), urgency: s.hold && s.hold.on ? 1 : 0.4, radius: Math.max(0.5, (sp.r || 0.8) * 0.8), crouch: true };
    }
    return null;
  }

  // ================================================================================================= net
  snapshot() { return JSON.parse(JSON.stringify(this.s)); }
  apply(snap) { if (!snap) return; this.s = snap; }
}

export { statsOf };
