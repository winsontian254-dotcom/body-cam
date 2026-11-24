/* LIVE FIRE — human-like bot aim. PURE JS (no BABYLON).
   The bot's view is a damped spring with a turn-rate limit (flicks overshoot a little and settle), driven toward a target angle
   that carries the bot's error: a first-sight offset that decays while it tracks, a slow wandering noise (hand tremor), a
   perceived target velocity that lags the real one (tracking moving targets is harder than holding still), and an imperfect,
   late recoil compensation. Difficulty is a continuous skill 0..1 interpolated between four profiles.
   Exports:
     DIFFICULTY   { easy, normal, hard, expert } profiles (numbers documented below)
     SKILL_OF     { easy: .2, normal: .45, hard: .7, expert: .92 } (the skill each profile sits at)
     profileFor(skill) -> profile (interpolated, cached per 0.01 of skill)
     difficultyName(skill) -> 'easy'|'normal'|'hard'|'expert'
     class Aim(rng, profile)
       yaw, pitch, vy, vp            the bot's current view and angular velocity (rad, rad/s; pitch POSITIVE = DOWN)
       reset(yaw, pitch)             spawn / teleport
       acquire(dist, flick)          a NEW target: draws the first-sight error (bigger for big flicks, low and to the side)
       lose()                        target gone: the error is redrawn on the next acquire
       track(dt, ty, tp, o)          aim at world angles (ty, tp) for one tick; o = { combat, recoilX, recoilY (ws.ax / ws.ay, deg),
                                     dist, tvx, tvz (target velocity), lead } -> this (yaw / pitch updated)
       look(dt, ty, tp, speed?)      relaxed head turn (walking, checking angles): slower, no overshoot
       error(ty, tp, ws) -> rad      angle between where the BULLET would go (view + recoil offset) and (ty, tp)
   Profile fields: react [mean, sd] s (first sight -> first aim correction), turn (max rad/s while fighting), freq (spring
   angular frequency, 1/s), zeta (damping: < 1 overshoots), err (first-sight error, rad at 10 m), errFlick (share of the flick
   angle added to it), settle (s, error decay), noise (rad, tremor), lag (s, perceived-velocity lag), lead (share of the lead
   used), comp (recoil compensation share), compLag (s), head (chance to go for the head), trigger (fire when the error is under
   trigger x the target's angular half-size), stop (chance to stop moving before a shot at range), burst (shots per burst at
   mid range), spray (max spray length up close), patience (s between taps at long range), strafe (strafe between bursts),
   crouch (chance to crouch-spray), prefire (s before the bot shoots at a known angle it is pre-aiming), sight (m, vision range
   in good light), fov (rad, half-angle of the vision cone), hear (hearing range factor). */

export const SKILL_OF = { easy: 0.2, normal: 0.45, hard: 0.7, expert: 0.92 };
const ORDER = ['easy', 'normal', 'hard', 'expert'];

export const DIFFICULTY = {
  easy:   { react: [0.62, 0.14], turn: 5.0,  freq: 9,  zeta: 0.62, err: 0.055, errFlick: 0.16, settle: 0.55, noise: 0.012, lag: 0.38, lead: 0.2,
            comp: 0.22, compLag: 0.22, head: 0.04, trigger: 2.6, stop: 0.15, burst: 6, spray: 14, patience: 0.55, strafe: 0.2, crouch: 0.05,
            prefire: 0.5, sight: 55, fov: 0.95, hear: 0.75 },
  normal: { react: [0.42, 0.09], turn: 8.0,  freq: 13, zeta: 0.66, err: 0.032, errFlick: 0.11, settle: 0.36, noise: 0.007, lag: 0.24, lead: 0.5,
            comp: 0.5,  compLag: 0.15, head: 0.2,  trigger: 1.9, stop: 0.55, burst: 5, spray: 12, patience: 0.4, strafe: 0.5, crouch: 0.15,
            prefire: 0.35, sight: 75, fov: 1.05, hear: 0.9 },
  hard:   { react: [0.29, 0.06], turn: 12.0, freq: 18, zeta: 0.72, err: 0.019, errFlick: 0.075, settle: 0.24, noise: 0.004, lag: 0.15, lead: 0.75,
            comp: 0.72, compLag: 0.1,  head: 0.5,  trigger: 1.45, stop: 0.82, burst: 4, spray: 10, patience: 0.3, strafe: 0.75, crouch: 0.25,
            prefire: 0.22, sight: 95, fov: 1.12, hear: 1.0 },
  expert: { react: [0.2, 0.04],  turn: 17.0, freq: 24, zeta: 0.78, err: 0.011, errFlick: 0.05, settle: 0.16, noise: 0.0025, lag: 0.09, lead: 0.92,
            comp: 0.88, compLag: 0.07, head: 0.78, trigger: 1.15, stop: 0.95, burst: 3, spray: 8, patience: 0.22, strafe: 0.9, crouch: 0.3,
            prefire: 0.12, sight: 110, fov: 1.18, hear: 1.1 },
};

const cache = new Map();
export function profileFor(skill) {
  const s = Math.max(0, Math.min(1, +skill || 0)), key = Math.round(s * 100);
  let p = cache.get(key); if (p) return p;
  const xs = ORDER.map(k => SKILL_OF[k]);
  let i = 0; while (i < xs.length - 2 && s > xs[i + 1]) i++;
  const a = DIFFICULTY[ORDER[i]], b = DIFFICULTY[ORDER[i + 1]], t = Math.max(0, Math.min(1, (s - xs[i]) / (xs[i + 1] - xs[i])));
  p = {};
  for (const k in a) p[k] = Array.isArray(a[k]) ? a[k].map((v, j) => v + (b[k][j] - v) * t) : a[k] + (b[k] - a[k]) * t;
  p.skill = s;
  cache.set(key, p);
  return p;
}
export function difficultyName(skill) {
  let best = 'normal', bd = Infinity;
  for (const k of ORDER) { const d = Math.abs(SKILL_OF[k] - skill); if (d < bd) { bd = d; best = k; } }
  return best;
}

const TAU = Math.PI * 2, DEG = Math.PI / 180;
const wrap = a => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };
const gauss = r => { let u = 0; for (let i = 0; i < 4; i++) u += r(); return (u - 2) * 1.732; };   // ~N(0, 1)

export class Aim {
  constructor(rng, prof) {
    this.rng = rng; this.prof = prof;
    this.reset(0, 0);
  }
  reset(yaw, pitch) {
    this.yaw = yaw || 0; this.pitch = pitch || 0; this.vy = 0; this.vp = 0;
    this.ey = 0; this.ep = 0; this.ny = 0; this.np = 0; this.nvy = 0; this.nvp = 0;
    this.pvx = 0; this.pvz = 0; this.rx = 0; this.ry = 0; this.age = 0; this.has = false;
  }
  acquire(dist, flick) {
    const P = this.prof, r = this.rng, d = Math.max(2, dist || 10);
    // angular first-sight error: a fixed linear miss (m at 10 m) plus a share of the flick, biased low (people aim at the torso
    // line and come up) and wider sideways than vertically
    const lin = P.err * 10 / d * (0.6 + 0.8 * r()), fl = Math.abs(flick || 0) * P.errFlick * (0.5 + r());
    const m = Math.min(0.35, lin + fl), a = r() * TAU;
    this.ey = Math.cos(a) * m * 1.3; this.ep = Math.abs(Math.sin(a)) * m * (r() < 0.78 ? 1 : -0.6);
    this.age = 0; this.has = true; this.pvx = 0; this.pvz = 0;
  }
  lose() { this.has = false; }
  /** Fighting aim toward world angles (ty, tp). */
  track(dt, ty, tp, o = {}) {
    const P = this.prof, r = this.rng;
    this.age += dt;
    // decaying first-sight error + tremor (Ornstein-Uhlenbeck)
    const dec = Math.exp(-dt / Math.max(0.03, P.settle));
    this.ey *= dec; this.ep *= dec;
    const th = 4;
    this.ny += (-th * this.ny) * dt + P.noise * Math.sqrt(2 * th * dt) * gauss(r);
    this.np += (-th * this.np) * dt + P.noise * Math.sqrt(2 * th * dt) * gauss(r) * 0.7;
    // perceived target velocity (lags) -> lead on the target angle
    const lk = 1 - Math.exp(-dt / Math.max(0.02, P.lag));
    this.pvx += ((o.tvx || 0) - this.pvx) * lk; this.pvz += ((o.tvz || 0) - this.pvz) * lk;
    let gy = ty, gp = tp;
    if (o.dist > 0.5) {
      // the target's own angular motion, as perceived (feed-forward keeps a good bot on a strafing target)
      const c = Math.cos(ty), s = Math.sin(ty), lat = this.pvx * c - this.pvz * s;      // velocity across the line of sight
      const w = lat / o.dist;                                                        // rad/s
      gy += w * (o.lead != null ? o.lead : 0.06) * P.lead;
      this.ffw = w * P.lead;
    } else this.ffw = 0;
    // recoil: bullets go to view + offset; a bot pulls against it, late and only partly
    const ck = 1 - Math.exp(-dt / Math.max(0.02, P.compLag));
    this.rx += ((o.recoilX || 0) - this.rx) * ck; this.ry += ((o.recoilY || 0) - this.ry) * ck;
    gy += this.ey + this.ny - this.rx * DEG * P.comp;
    gp += this.ep + this.np + this.ry * DEG * P.comp;
    this._spring(dt, gy, gp, P.freq, P.zeta, P.turn, this.ffw);
    return this;
  }
  /** Relaxed look (no fight): slower, critically damped. */
  look(dt, ty, tp, speed = 1) {
    const P = this.prof;
    this._spring(dt, ty, tp, 5.5 + 2.5 * P.skill, 1.05, (2.6 + 2.2 * P.skill) * speed, 0);
    return this;
  }
  _spring(dt, gy, gp, w, z, maxV, ff) {
    const dy = wrap(gy - this.yaw), dp = gp - this.pitch;
    this.vy += (w * w * dy - 2 * z * w * (this.vy - ff)) * dt;
    this.vp += (w * w * dp - 2 * z * w * this.vp) * dt;
    const v = Math.hypot(this.vy, this.vp);
    if (v > maxV) { this.vy *= maxV / v; this.vp *= maxV / v; }
    this.yaw = wrap(this.yaw + this.vy * dt);
    this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch + this.vp * dt));
  }
  /** Angle between the bullet line (view + recoil offset) and (ty, tp). */
  error(ty, tp, ws) {
    const by = this.yaw + (ws ? ws.ax : 0) * DEG, bp = this.pitch - (ws ? ws.ay : 0) * DEG;
    return Math.hypot(wrap(ty - by) * Math.cos(tp), tp - bp);
  }
  /** A reaction time for a new sighting (s): the profile's, slower in the dark / at the edge of view / far away. */
  reaction(k = 1) {
    const P = this.prof, r = this.rng;
    return Math.max(0.09, (P.react[0] + gauss(r) * P.react[1]) * k);
  }
}
