/* LIVE FIRE — bot perception. PURE JS (no BABYLON).
   Vision: a view cone (profile fov, wider up close), range by light (a bot sees a figure in a dark room later and closer than one
   in daylight), line of sight from the bot's eye to the target's head / chest / pelvis through navgrid.losClear (walls, smoke
   blockers registered by the grenade system, foliage; glass is see-through), a "noticing" time that builds up faster for a
   moving, close, central and lit target, and nothing at all while flashed (p.flash) or blindfolded (p.blind).
   Hearing: footsteps, gunfire, reloads, landings and grenades within their ranges, quieter through walls (no line of sight =
   x .55 range); a heard sound is a position with an error, not a target.
   Memory: per enemy { x, y, z, t, seen (bool: saw it), src: 'see'|'hear'|'team'|'hit', conf 0..1 } kept ~25 s.
   Exports:
     LIGHT                         light model numbers
     lightAt(game, x, y, z) -> 0..1   ambient by map time (day / dusk / night / indoor) + roof shade + the map's lights
     HEAR                          hearing ranges (m) per sound kind
     class Memory { see(q, pos, t), hear(id|null, pos, t, err, rng), team(id, pos, t), forget(id), best(now, maxAge) -> entry,
                    get(id), entries(now, maxAge) -> [entries], clear() }
     visibleScore(bot, q, eye, tmp) -> { vis: bool, part, dist, ang, light } (one sight test)                         */
import { aimPoint } from '../game/hitbox.js';

export const LIGHT = { day: 1, overcast: 0.85, dusk: 0.6, night: 0.22, indoor: 0.55, roof: 0.62, cell: 2 };
export const HEAR = { step: 22, stepCrouch: 0, shot: 62, shotSup: 14, reload: 9, land: 14, jump: 10, nade: 18, boom: 90, hurt: 12 };

/** Ambient light at a point, cached on a 2 m grid per game. */
export function lightAt(game, x, y, z) {
  let L = game._botLight;
  if (!L) L = game._botLight = initLight(game);
  const k = Math.floor(x / LIGHT.cell) + ',' + Math.floor(y / 1.5) + ',' + Math.floor(z / LIGHT.cell);
  let v = L.cache.get(k);
  if (v != null) return v;
  const cx = (Math.floor(x / LIGHT.cell) + 0.5) * LIGHT.cell, cz = (Math.floor(z / LIGHT.cell) + 0.5) * LIGHT.cell;
  let base = L.base;
  const w = game.world;
  // under a roof the sky does not reach: outdoor day maps are darker inside buildings
  if (L.outdoor && w && w.ceilingAt) { const c = w.ceilingAt(cx, cz, y + 1.0, 0.1); if (c < y + 12) base *= LIGHT.roof; }
  let add = 0;
  for (const s of L.lights) {
    const dx = s.x - cx, dy = s.y - (y + 1.0), dz = s.z - cz, d2 = dx * dx + dy * dy + dz * dz, R = s.range;
    if (d2 > R * R) continue;
    const f = 1 - Math.sqrt(d2) / R;
    add += f * f * s.k;
  }
  v = Math.max(0.08, Math.min(1, base + add));
  if (L.cache.size > 40000) L.cache.clear();
  L.cache.set(k, v);
  return v;
}
function initLight(game) {
  const env = (game.def && game.def.env) || {}, time = env.time || 'day';
  const sky = env.sky || '';
  let base = LIGHT[time] != null ? LIGHT[time] : 0.8;
  if (time === 'day' && (sky === 'overcast' || env.weather === 'rain' || env.weather === 'fog')) base = LIGHT.overcast;
  const lights = [];
  const list = (game.map && game.map.lights) || [];
  for (const l of list) {
    const s = l && (l.spec || l);
    if (!s || s.x == null) continue;
    lights.push({ x: s.x, y: s.y, z: s.z, range: Math.max(3, Math.min(25, s.range || 8)), k: Math.min(0.9, 0.35 + (s.intensity || 1) * 0.05) });
  }
  return { base, outdoor: time !== 'indoor', lights, cache: new Map() };
}

export class Memory {
  constructor() { this.m = new Map(); }
  clear() { this.m.clear(); }
  _e(id) { let e = this.m.get(id); if (!e) { e = { id, x: 0, y: 0, z: 0, t: -99, seenT: -99, src: 'none', conf: 0, vx: 0, vz: 0 }; this.m.set(id, e); } return e; }
  see(q, t) {
    const e = this._e(q.id);
    e.x = q.pos.x; e.y = q.pos.y; e.z = q.pos.z; e.vx = q.vel.x; e.vz = q.vel.z; e.t = t; e.seenT = t; e.src = 'see'; e.conf = 1;
    return e;
  }
  hear(id, pos, t, err, rng) {
    const key = id || ('n' + Math.round(pos.x / 6) + ',' + Math.round(pos.z / 6));
    const e = this._e(key);
    if (e.src === 'see' && t - e.t < 1.5) return e;             // a fresh sighting beats a sound
    const a = rng() * Math.PI * 2, r = err * Math.sqrt(rng());
    e.x = pos.x + Math.cos(a) * r; e.y = pos.y; e.z = pos.z + Math.sin(a) * r; e.vx = e.vz = 0;
    e.t = t; e.src = 'hear'; e.conf = Math.max(0.25, 1 - err / 12);
    return e;
  }
  team(id, pos, t, age = 0) {
    const e = this._e(id);
    if (e.t >= t - age) return e;                                 // we know better already
    e.x = pos.x; e.y = pos.y; e.z = pos.z; e.vx = e.vz = 0; e.t = t - age; e.src = 'team'; e.conf = 0.6;
    return e;
  }
  hit(id, pos, t) { const e = this._e(id); e.x = pos.x; e.y = pos.y; e.z = pos.z; e.t = t; e.src = 'hit'; e.conf = 0.8; return e; }
  forget(id) { this.m.delete(id); }
  get(id) { return this.m.get(id) || null; }
  entries(now, maxAge = 20) { const out = []; for (const e of this.m.values()) if (now - e.t <= maxAge) out.push(e); return out; }
  /** The most relevant recent memory: fresher and more certain first, nearer breaks ties. */
  best(now, maxAge = 12, from = null) {
    let best = null, bs = -Infinity;
    for (const e of this.m.values()) {
      const age = now - e.t; if (age > maxAge) continue;
      let s = e.conf * 10 - age;
      if (from) s -= Math.hypot(e.x - from.x, e.z - from.z) * 0.05;
      if (s > bs) { bs = s; best = e; }
    }
    return best;
  }
  prune(now, alive) {
    for (const [k, e] of this.m) if (now - e.t > 25 || (alive && k[0] !== 'n' && !alive(k))) this.m.delete(k);
  }
}

const PARTS = ['head', 'chest', 'pelvis'];
const TP = { x: 0, y: 0, z: 0 };
/** One sight test of q from eye. Returns the first visible part (head, chest, pelvis) or null. */
export function sightLine(game, eye, q, out = TP) {
  const nav = game.map && game.map.nav;
  for (const part of PARTS) {
    aimPoint(q, part, out, game.tick);
    if (!nav || nav.losClear(eye, out)) return part;
  }
  return null;
}
