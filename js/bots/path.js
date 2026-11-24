/* LIVE FIRE — bot navigation: a path service that runs navgrid searches time-sliced over ticks (a per-tick budget of node
   expansions and milliseconds, one search at a time, a small cache), and a path follower that turns a path into movement
   (look-ahead steering, crouch / drop / mantle links, separation from team-mates, stuck detection with jump / side-step /
   repath escalation). PURE JS (no BABYLON).
   Exports:
     PATH = { budget, msBudget, weight, cacheTTL, ... }
     class PathService(game)    request(owner, from, to, cb, { prio, key }) (one pending request per owner; cb(path|null) later),
                                cancel(owner), tick() (runs the budget), stats { queued, done, failed, expanded, msMax, msTick }
     class Follower             set(path), clear(), active, done, steer(p, dt, out) -> out { yaw, move, crouch, jump, walk, stuck, dist }
*/
export const PATH = { budget: 5000, msBudget: 1.1, weight: 1.35, cacheTTL: 6, cacheR: 3.0, maxExpand: 90000, wallCost: 0.6, wide: 0.3 };
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export class PathService {
  constructor(game) {
    this.g = game; this.q = []; this.cur = null; this.cache = new Map();
    this.stats = { queued: 0, done: 0, failed: 0, cached: 0, expanded: 0, msMax: 0, msTick: 0, waitMax: 0 };
  }
  get nav() { return this.g.map && this.g.map.nav; }
  request(owner, from, to, cb, o = {}) {
    this.cancel(owner);
    const nav = this.nav; if (!nav) { cb(null); return; }
    const gn = nav.nearest(to.x, (to.y || 0) + 0.3, to.z, 4);
    if (gn < 0) { cb(null); return; }
    // cache: same goal node, start within cacheR of a cached start, fresh enough
    const key = (o.smooth === false ? 'r' : '') + gn + ':' + Math.round(from.x / PATH.cacheR) + ',' + Math.round(from.y) + ',' + Math.round(from.z / PATH.cacheR);
    const c = o.cost ? null : this.cache.get(key);
    if (c && this.g.time - c.t < PATH.cacheTTL && c.gates === this.gateKey() && c.path.length > 1 && nav._wideLine({ x: from.x, y: c.path[0].y, z: from.z }, c.path[1], PATH.wide)) {
      this.stats.cached++;
      const path = c.path.map(q => ({ ...q })); path[0].x = from.x; path[0].z = from.z;
      cb(path); return;
    }
    const r = { owner, from: { x: from.x, y: from.y, z: from.z }, to: { x: to.x, y: to.y || 0, z: to.z }, gn, cb, key, prio: o.prio || 0, t: this.g.time, cost: o.cost || null, gatesOpen: o.gatesOpen, smooth: o.smooth };
    this.stats.queued++;
    // priority: higher first, then FIFO
    let i = this.q.length; while (i > 0 && this.q[i - 1].prio < r.prio) i--;
    this.q.splice(i, 0, r);
  }
  cancel(owner) {
    for (let i = this.q.length - 1; i >= 0; i--) if (this.q[i].owner === owner) this.q.splice(i, 1);
    if (this.cur && this.cur.r.owner === owner) { this.cur.dead = true; this.cur.r._dead = true; }
  }
  pending(owner) { return (this.cur && this.cur.r.owner === owner && !this.cur.dead) || this.q.some(r => r.owner === owner); }
  gateKey() { const m = this.g.map; return m && m.gateList ? m.gateList.map(g => (g.open ? 1 : 0)).join('') : ''; }
  tick() {
    const nav = this.nav; if (!nav || !nav.pathTask) return;
    const t0 = now(); let left = PATH.budget;
    while (left > 0) {
      if (!this.cur) {
        const r = this.q.shift(); if (!r) break;
        const task = nav.pathTask(r.from, r.gn, { weight: PATH.weight, maxExpand: PATH.maxExpand, cost: r.cost || undefined, gatesOpen: r.gatesOpen, smooth: r.smooth, wallCost: PATH.wallCost, wide: PATH.wide });
        this.cur = { r, task, dead: false };
        this.stats.waitMax = Math.max(this.stats.waitMax, this.g.time - r.t);
      }
      const { r, task } = this.cur;
      const before = task.expanded || 0;
      const done = task.step(Math.min(left, 2500));
      const used = Math.max(1, (task.expanded || 0) - before);
      left -= used; this.stats.expanded += used;
      if (done) {
        const path = task.path;
        if (path && path.length) {
          const l = path[path.length - 1];
          if (Math.hypot(l.x - r.to.x, l.z - r.to.z) < 1.2) { l.x = r.to.x; l.z = r.to.z; }
          if (!r.cost) this.cache.set(r.key, { path: path.map(q => ({ ...q })), t: this.g.time, gates: this.gateKey() });
          if (this.cache.size > 64) this.cache.delete(this.cache.keys().next().value);
          this.stats.done++;
        } else this.stats.failed++;
        this.cur = null;
        if (!this.curDead(r)) { try { r.cb(path && path.length ? path : null); } catch (e) { console.error('[bots] path callback', e); } }
      }
      if (now() - t0 > PATH.msBudget) break;
    }
    const ms = now() - t0;
    this.stats.msTick = ms; if (ms > this.stats.msMax) this.stats.msMax = ms;
  }
  curDead(r) { return r._dead; }
  clear() { this.q.length = 0; this.cur = null; this.cache.clear(); }
}

const TAU = Math.PI * 2;
const wrap = a => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };

export class Follower {
  constructor(rng = Math.random) { this.rng = rng; this.path = null; this.i = 0; this.stuckT = 0; this.bestD = Infinity; this.progT = 0; this.esc = 0; this.side = 1; this.sideT = 0; this.jumpT = 0; this.total = 0; }
  set(path) {
    this.path = path && path.length ? path : null; this.i = this.path && this.path.length > 1 ? 1 : 0;
    this.stuckT = 0; this.bestD = Infinity; this.progT = 0; this.esc = 0; this.sideT = 0; this.jumpT = 0;
  }
  clear() { this.path = null; }
  get active() { return !!this.path; }
  get goal() { return this.path ? this.path[this.path.length - 1] : null; }
  remaining(p) {
    if (!this.path) return 0;
    let d = 0, a = p.pos;
    for (let k = this.i; k < this.path.length; k++) { const b = this.path[k]; d += Math.hypot(b.x - a.x, b.z - a.z); a = b; }
    return d;
  }
  /** Point `ahead` metres along the path from the current waypoint (looking where you go). */
  lookPoint(p, ahead = 5, out = { x: 0, y: 0, z: 0 }) {
    if (!this.path) return null;
    let a = p.pos, left = ahead;
    for (let k = this.i; k < this.path.length; k++) {
      const b = this.path[k], L = Math.hypot(b.x - a.x, b.z - a.z);
      if (L >= left) { const t = left / Math.max(1e-6, L); out.x = a.x + (b.x - a.x) * t; out.y = a.y + (b.y - a.y) * t; out.z = a.z + (b.z - a.z) * t; return out; }
      left -= L; a = b;
    }
    out.x = a.x; out.y = a.y; out.z = a.z; return out;
  }
  /** Is the waypoint after the current one a turn of more than `ang` (a corner to check)? -> the corner point */
  nextCorner(p, maxD = 7, ang = 0.6) {
    const P = this.path; if (!P) return null;
    let a = p.pos, d = 0;
    for (let k = this.i; k < P.length - 1; k++) {
      const b = P[k], c = P[k + 1];
      d += Math.hypot(b.x - a.x, b.z - a.z); if (d > maxD) return null;
      const t1 = Math.atan2(b.x - a.x, b.z - a.z), t2 = Math.atan2(c.x - b.x, c.z - b.z);
      if (Math.abs(wrap(t2 - t1)) > ang) return { x: b.x, y: b.y, z: b.z, yaw: t2, d };
      a = b;
    }
    return null;
  }
  steer(p, dt, out, mates) {
    out.move = false; out.crouch = false; out.jump = false; out.stuck = 0; out.arrived = false;
    const P = this.path; if (!P) { out.arrived = true; return out; }
    const sameFloor = w => Math.abs(w.y - p.pos.y) < 1.1;
    let w = P[this.i];
    // advance: close enough (same floor), or past the waypoint along the segment
    for (let guard = 0; guard < 4 && w; guard++) {
      const dx = w.x - p.pos.x, dz = w.z - p.pos.z, d = Math.hypot(dx, dz);
      const last = this.i >= P.length - 1;
      const r = last ? 0.45 : w.link === 'drop' ? 0.5 : 0.62;
      let pass = d < r && (sameFloor(w) || (w.link === 'drop' && p.onGround && p.pos.y < w.y + 0.6));
      if (!pass && !last && sameFloor(w) && this.i > 0) {
        const a = P[this.i - 1], sx = w.x - a.x, sz = w.z - a.z, L2 = sx * sx + sz * sz;
        if (L2 > 0.01 && ((p.pos.x - a.x) * sx + (p.pos.z - a.z) * sz) / L2 > 1.0 && d < 1.6 && P[this.i + 1].link === 'walk') pass = true;
      }
      // only move on when the next leg is clear for a body from here (door frames: the waypoint can be passed off-centre)
      if (pass && !last && this.nav && !this.nav._wideLine(p.pos, P[this.i + 1], 0.22) && d > 0.18) pass = false;
      if (!pass) break;
      if (last) { this.path = null; out.arrived = true; return out; }
      this.i++; w = P[this.i]; this.bestD = Infinity; this.progT = 0;
    }
    if (!w) { this.path = null; out.arrived = true; return out; }
    const dx = w.x - p.pos.x, dz = w.z - p.pos.z, d = Math.hypot(dx, dz);
    let yaw = Math.atan2(dx, dz);
    // corner smoothing: when close to a walk waypoint, blend toward the next one
    const nx = P[this.i + 1];
    if (nx && d < 1.1 && w.link === 'walk' && nx.link === 'walk' && sameFloor(nx) && (!this.nav || this.nav._wideLine(p.pos, nx, 0.22))) {
      const y2 = Math.atan2(nx.x - p.pos.x, nx.z - p.pos.z);
      yaw = yaw + wrap(y2 - yaw) * (1 - d / 1.1) * 0.5;
    }
    // separation from team-mates (do not walk inside each other)
    if (mates) {
      let sx = 0, sz = 0;
      for (const q of mates) {
        const ex = p.pos.x - q.pos.x, ez = p.pos.z - q.pos.z, e2 = ex * ex + ez * ez;
        if (e2 < 1.4 * 1.4 && e2 > 1e-4 && Math.abs(q.pos.y - p.pos.y) < 1.2) { const e = Math.sqrt(e2), k = (1.4 - e) / 1.4; sx += ex / e * k; sz += ez / e * k; }
      }
      if (sx || sz) { const fx = Math.sin(yaw) + sx * 0.8, fz = Math.cos(yaw) + sz * 0.8; yaw = Math.atan2(fx, fz); }
    }
    out.yaw = yaw; out.move = true; out.dist = d;
    out.crouch = !!(w.crouch || (this.i > 0 && P[this.i - 1].crouch && d > 0.3));
    if (w.link === 'mantle' && d < 1.5) out.jump = true;
    // stuck detection: no progress toward the waypoint while trying to move
    if (d < this.bestD - 0.15) { this.bestD = d; this.progT = 0; this.esc = Math.max(0, this.esc - 1); }
    else this.progT += dt;
    if (p.mantle || !p.onGround) this.progT = Math.max(0, this.progT - dt);
    out.stuck = this.progT;
    if (this.progT > 0.8 && this.esc === 0) { this.esc = 1; this.jumpT = 0.15; }
    if (this.progT > 1.4 && this.esc === 1) { this.esc = 2; this.side = this.rng() < 0.5 ? -1 : 1; this.sideT = 0.55; }
    if (this.jumpT > 0) { this.jumpT -= dt; out.jump = true; }
    if (this.sideT > 0) { this.sideT -= dt; out.yaw = yaw + this.side * 1.25; }
    return out;
  }
}
