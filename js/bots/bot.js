/* LIVE FIRE — placeholder bot brain (a bots worker replaces it with the full brain + js/bots/aim.js). PURE JS (no BABYLON).
   It produces the same Command as a human (docs §4), so movement, weapons and hit detection are shared.
   Exports:
     SKILLS = { easy: .2, normal: .45, hard: .7, expert: .92 }
     createBot(game, p, opts?) -> Bot        Bot.think(dt, cmd) fills cmd (call once per tick for a live bot); Bot.reset()
     BotManager                              class: new BotManager(game) (a game system 'bots': tick budget for A* paths, hearing)
   Behaviour: perception every ~0.2 s (field of view 150 degrees, line of sight through navgrid.losClear (glass and smoke aware),
   hearing of shots within 30 m and of hits), a reaction delay and an aim error that shrink with skill, limited turn rate, recoil
   compensation, bursts by distance, strafing and crouch-peeking in fights; otherwise it walks navgrid paths to the last seen
   enemy, an enemy's area or a random map point, jumps for mantle links, unsticks itself, reloads when safe. */
import { aimPoint } from '../game/hitbox.js';
import { eyePos } from '../phys/move.js';
import { currentWeapon, statsOf, currentCone } from '../game/weapon.js';
import { isEnemy } from '../game/player.js';

export const SKILLS = { easy: 0.2, normal: 0.45, hard: 0.7, expert: 0.92 };
const BTN = { FIRE: 1, ADS: 2, JUMP: 4, CROUCH: 8, WALK: 16, RELOAD: 32, USE: 64 };
const DEG = Math.PI / 180;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const wrap = a => { a = (a + Math.PI) % (2 * Math.PI); if (a < 0) a += 2 * Math.PI; return a - Math.PI; };
const EYE = { x: 0, y: 0, z: 0 }, TP = { x: 0, y: 0, z: 0 };

export class Bot {
  constructor(game, p, opts = {}) {
    this.g = game; this.p = p; this.skill = clamp(opts.skill ?? p.skill ?? 0.5, 0, 1);
    this.rng = game.rng; this.id = p.id;
    this.reset();
    this.senseT = this.rng() * 0.2;
  }
  reset() {
    this.target = null; this.seenT = -99; this.lastSeen = null; this.acqT = 0; this.react = 0; this.errY = 0; this.errP = 0;
    this.path = null; this.pi = 0; this.goal = null; this.repathT = 0; this.stuckT = 0; this.lastPos = null; this.progT = 0;
    this.strafe = this.rng() < 0.5 ? -1 : 1; this.strafeT = 0; this.burst = 0; this.pauseT = 0; this.crouchT = 0; this.jumpT = 0;
    this.yaw = this.p.yaw; this.pitch = 0; this.noise = null; this.unstickT = 0; this.wantPath = false; this.headAim = this.rng() < this.skill * 0.6;
    this.trigger = false; this.wantYaw = this.p.yaw; this.wantPitch = 0; this.crouching = false;
  }
  hear(pos, t, strong) { if (!this.target || strong) this.noise = { x: pos.x, y: pos.y, z: pos.z, t }; }

  sense() {
    const g = this.g, p = this.p; eyePos(p, EYE);
    let best = null, bd = Infinity;
    for (const q of g.players.values()) {
      if (!q.alive || !isEnemy(p, q)) continue;
      const dx = q.pos.x - p.pos.x, dz = q.pos.z - p.pos.z, d = Math.hypot(dx, dz);
      if (d > 140) continue;
      const ang = Math.abs(wrap(Math.atan2(dx, dz) - this.yaw));
      const attacked = p.lastAttacker === q.id && g.time - p.lastHurtT < 2.5;
      if (ang > 75 * DEG && d > 4 && !attacked && q !== this.target) continue;
      aimPoint(q, 'chest', TP, g.tick);
      let vis = this.los(EYE, TP);
      if (!vis) { aimPoint(q, 'head', TP, g.tick); vis = this.los(EYE, TP); }
      if (!vis) continue;
      const score = d * (q === this.target ? 0.7 : 1) * (attacked ? 0.5 : 1);
      if (score < bd) { bd = score; best = q; }
    }
    if (best) {
      if (best !== this.target) {
        this.target = best; this.acqT = g.time;
        this.react = (0.62 - 0.46 * this.skill) * (0.8 + this.rng() * 0.5);
        // first aim lands off the target and settles: wider sideways, and usually LOW (people track the torso, not the head)
        const e = (1 - this.skill) * 0.12 + 0.012;
        this.errY = (this.rng() * 2 - 1) * e * 1.4; this.errP = (0.25 + this.rng() * 0.75) * e * (this.rng() < 0.8 ? 1 : -0.6);
        this.headAim = this.rng() < this.skill * this.skill * 0.6;
        this.burst = 0;
      }
      this.seenT = g.time; this.lastSeen = { x: best.pos.x, y: best.pos.y, z: best.pos.z };
      this.path = null;
    } else if (this.target && (g.time - this.seenT > 1.2 || !this.target.alive)) this.target = null;
  }
  los(a, b) {
    const nav = this.g.map && this.g.map.nav;
    if (nav && nav.losClear) return nav.losClear(a, b);
    return true;
  }

  requestPath(goal) {
    const mgr = this.g.getSystem && this.g.getSystem('bots');
    if (mgr && !mgr.takeBudget()) { this.wantPath = true; return; }
    this.wantPath = false;
    const nav = this.g.map && this.g.map.nav; if (!nav) return;
    const p = this.p;
    const path = nav.findPath({ x: p.pos.x, y: p.pos.y, z: p.pos.z }, goal, { maxExpand: 25000 });
    this.path = path && path.length > 1 ? path : null; this.pi = 1; this.goal = goal; this.repathT = 4 + this.rng() * 2;
    if (!this.path) this.goal = null;
  }
  pickGoal() {
    const g = this.g, p = this.p, r = this.rng;
    if (this.lastSeen && g.time - this.seenT < 10) return this.lastSeen;
    if (this.noise && g.time - this.noise.t < 6) return this.noise;
    const roll = r();
    if (roll < 0.55) {
      const foes = [...g.players.values()].filter(q => q.alive && isEnemy(p, q));
      if (foes.length) { const q = foes[Math.floor(r() * foes.length)]; return { x: q.pos.x + (r() - 0.5) * 6, y: q.pos.y, z: q.pos.z + (r() - 0.5) * 6 }; }
    }
    const m = g.map, pts = [];
    if (m) {
      if (m.sites) for (const k in m.sites) if (m.sites[k]) pts.push(m.sites[k]);
      if (m.points) for (const k in m.points) pts.push(m.points[k]);
      if (m.hides) pts.push(...m.hides);
    }
    if (pts.length) { const q = pts[Math.floor(r() * pts.length)]; return { x: q.x, y: q.y, z: q.z }; }
    const nav = m && m.nav;
    if (nav) { const n = nav.randomNode(r); if (n >= 0) return nav.nodePos(n); }
    return null;
  }

  think(dt, cmd) {
    const g = this.g, p = this.p, ws = p.ws;
    cmd.mx = 0; cmd.mz = 0; cmd.buttons = 0; cmd.slot = null; cmd.nade = null;
    this.senseT -= dt;
    if (this.senseT <= 0) { this.senseT = 0.16 + this.rng() * 0.08; this.sense(); }
    const w = currentWeapon(p), st = w ? statsOf(w) : null;
    // weapon housekeeping
    if (p.cur === 'nade' || p.cur === 'bomb') cmd.slot = p.inv.primary ? 'primary' : 'secondary';
    else if (w && !w.melee && w.mag === 0 && w.reserve === 0 && !(g.options && g.options.infiniteAmmo)) cmd.slot = w === p.inv.primary && p.inv.secondary ? 'secondary' : 'melee';
    else if (w && w.melee && (p.inv.primary || p.inv.secondary)) {
      const alt = p.inv.primary && (p.inv.primary.mag + p.inv.primary.reserve > 0) ? 'primary' : p.inv.secondary && (p.inv.secondary.mag + p.inv.secondary.reserve > 0) ? 'secondary' : null;
      if (alt && (!this.target || Math.hypot(this.target.pos.x - p.pos.x, this.target.pos.z - p.pos.z) > 2.5)) cmd.slot = alt;
    }
    if (w && !w.melee && ws.state === 'idle' && st) {
      if (w.mag === 0 || (!this.target && g.time - this.seenT > 1.5 && w.mag < st.mag * 0.45)) cmd.buttons |= BTN.RELOAD;
    }
    const tgt = this.target && this.target.alive ? this.target : null;
    if (tgt) this.fight(dt, cmd, tgt, w, st);
    else this.roam(dt, cmd);
    // look: limited turn rate towards the wanted angles
    const maxTurn = (3.5 + 10 * this.skill) * dt;
    const dy = wrap(this.wantYaw - this.yaw), dp = this.wantPitch - this.pitch;
    const k = Math.min(1, dt * (8 + 10 * this.skill));
    this.yaw = wrap(this.yaw + clamp(dy * k * 1.6, -maxTurn, maxTurn));
    this.pitch = clamp(this.pitch + clamp(dp * k * 1.6, -maxTurn, maxTurn), -1.4, 1.4);
    cmd.yaw = this.yaw; cmd.pitch = this.pitch;
    if (this.trigger) cmd.buttons |= BTN.FIRE;
    this.trigger = false;
  }

  fight(dt, cmd, q, w, st) {
    const g = this.g, p = this.p, ws = p.ws;
    eyePos(p, EYE);
    aimPoint(q, this.headAim ? 'head' : 'chest', TP, g.tick);
    const dx = TP.x - EYE.x, dy = TP.y - EYE.y, dz = TP.z - EYE.z, hd = Math.hypot(dx, dz), d = Math.hypot(hd, dy);
    // aim error decays while tracking; recoil compensation grows with skill
    const decay = Math.exp(-dt * (1.4 + 4.5 * this.skill));
    this.errY *= decay; this.errP *= decay;
    const comp = 0.3 + 0.62 * this.skill;
    const lead = 0.05 * (1 - this.skill);
    const vx = q.vel.x * lead, vz = q.vel.z * lead;
    this.wantYaw = Math.atan2(dx + vx, dz + vz) + this.errY - ws.ax * DEG * comp;
    this.wantPitch = -Math.atan2(dy, hd) + this.errP + ws.ay * DEG * comp;
    const visible = g.time - this.seenT < 0.3;
    const offY = Math.abs(wrap(this.yaw + ws.ax * DEG - Math.atan2(dx, dz))), offP = Math.abs((this.pitch - ws.ay * DEG) + Math.atan2(dy, hd));
    const tol = Math.atan2(this.headAim ? 0.13 : 0.24, Math.max(1, d)) + currentCone(p) * 0.6 + 0.004;
    const melee = w && w.melee;
    // movement: strafe, sometimes stand still to shoot accurately at range, crouch on long bursts
    this.strafeT -= dt;
    if (this.strafeT <= 0) { this.strafe = -this.strafe; this.strafeT = 0.3 + this.rng() * 0.7; if (this.rng() < 0.15) this.strafe = 0; }
    const ranged = d > 14 && this.skill > 0.35;
    if (melee) { cmd.mz = 1; cmd.mx = this.strafe * 0.4; this.wantPitch = -Math.atan2(dy - 0.3, hd); }
    else if (!(ranged && this.burst > 0)) cmd.mx = this.strafe;
    if (!melee && d < 6 && this.rng() < 0.02) cmd.mz = -1;
    this.crouchT -= dt;
    if (this.crouchT <= 0) { this.crouching = !melee && ranged && this.rng() < 0.35 * this.skill; this.crouchT = 0.8 + this.rng() * 1.5; }
    if (this.crouching) cmd.buttons |= BTN.CROUCH;
    if (!w || !st) return;
    if (!melee && ws.state !== 'idle') return;
    if (g.time - this.acqT < this.react || !visible) { this.burst = 0; return; }
    if (melee) { if (d < (st.range || 1.5) + 0.3 && offY < 0.5) this.trigger = true; return; }
    if (ws.ads === 0 && this.skill > 0.5 && d > 20 && st.adsTime < 0.35) cmd.buttons |= BTN.ADS;
    if (ws.ads > 0 && d > 14) cmd.buttons |= BTN.ADS;
    if (this.pauseT > 0) { this.pauseT -= dt; return; }
    if (offY > tol * 1.6 || offP > tol * 1.6) return;
    const mode = w.fireMode || (st.modes && st.modes[0]);
    if (mode === 'auto') {
      const maxB = d < 8 ? 14 : d < 18 ? 7 : d < 35 ? 4 : 2;
      this.trigger = true; this.burst++;
      if (this.burst > maxB * 6) { this.burst = 0; this.pauseT = 0.12 + this.rng() * (0.4 - 0.25 * this.skill); }
    } else {
      // semi / burst: click when the gun is ready (released every other tick so the trigger resets)
      if (ws.cool <= 0 && !(ws.btn & BTN.FIRE)) { this.trigger = true; this.burst++; }
    }
  }

  roam(dt, cmd) {
    const g = this.g, p = this.p;
    this.burst = 0;
    this.repathT -= dt;
    if (!this.path || this.repathT <= 0 || this.wantPath) {
      const goal = this.pickGoal();
      if (goal) this.requestPath(goal);
    }
    this.wantPitch = 0;
    const path = this.path;
    if (!path) { this.wantYaw = this.yaw + 0.6 * dt; return; }
    let wp = path[this.pi];
    while (wp && Math.hypot(wp.x - p.pos.x, wp.z - p.pos.z) < 0.45 && this.pi < path.length - 1) { this.pi++; wp = path[this.pi]; }
    if (!wp || (this.pi >= path.length - 1 && Math.hypot(wp.x - p.pos.x, wp.z - p.pos.z) < 0.6)) { this.path = null; this.lastSeen = null; this.noise = null; return; }
    const dx = wp.x - p.pos.x, dz = wp.z - p.pos.z;
    const yawTo = Math.atan2(dx, dz);
    this.wantYaw = yawTo;
    // move relative to the current view (the view turns towards the waypoint)
    const rel = wrap(yawTo - p.yaw);
    cmd.mz = Math.cos(rel); cmd.mx = Math.sin(rel);
    if (wp.crouch) cmd.buttons |= BTN.CROUCH;
    if (wp.link === 'mantle' && Math.hypot(dx, dz) < 1.4) cmd.buttons |= BTN.JUMP;
    // stuck detection
    const sp = Math.hypot(p.vel.x, p.vel.z);
    if (sp < 0.6 && !p.mantle) this.stuckT += dt; else this.stuckT = Math.max(0, this.stuckT - dt * 2);
    if (this.stuckT > 0.7) {
      this.unstickT = 0.5; this.stuckT = 0; this.jumpT = 0.2; this.strafe = this.rng() < 0.5 ? -1 : 1;
      if (this.rng() < 0.4) { this.path = null; this.repathT = 0; }
    }
    if (this.unstickT > 0) { this.unstickT -= dt; cmd.mx = this.strafe; cmd.mz = 0.4; }
    if (this.jumpT > 0) { this.jumpT -= dt; cmd.buttons |= BTN.JUMP; }
  }
}

export function createBot(game, p, opts) { return new Bot(game, p, opts); }

/** Game system 'bots': brains per bot player, a path budget per tick, hearing (shots / hits). */
export class BotManager {
  constructor(game) {
    this.name = 'bots'; this.g = game; this.brains = new Map(); this.budget = 0;
    this.offs = [
      game.bus.on('shot', e => {
        const s = e.p; if (!s) return;
        for (const b of this.brains.values()) {
          if (!b.p.alive || !isEnemy(b.p, s)) continue;
          const d = Math.hypot(s.pos.x - b.p.pos.x, s.pos.z - b.p.pos.z);
          if (d < (e.suppressed ? 9 : 32)) b.hear(s.pos, game.time, false);
        }
      }),
      game.bus.on('hit', e => { if (e.victim && e.victim.bot && e.attacker) { const b = this.brains.get(e.victim.id); if (b) b.hear(e.attacker.pos, game.time, true); } }),
      game.bus.on('spawn', e => { const b = this.brains.get(e.p.id); if (b) { b.reset(); b.yaw = e.p.yaw; } }),
    ];
  }
  brain(p) { let b = this.brains.get(p.id); if (!b) { b = createBot(this.g, p, { skill: p.skill }); this.brains.set(p.id, b); } return b; }
  remove(id) { this.brains.delete(id); }
  takeBudget() { if (this.budget <= 0) return false; this.budget--; return true; }
  tick() { this.budget = 2; }
  dispose() { for (const f of this.offs) f(); this.brains.clear(); }
}
