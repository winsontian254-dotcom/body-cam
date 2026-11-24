/* LIVE FIRE — bot tactics helpers: places (callout names), cover, hold-angle spots, routes and staging points, angle checks,
   grenade throws. PURE JS (no BABYLON). Everything reads the navgrid (game.map.nav) and the collision world (game.world).
   Exports:
     areaName(game, x, y, z, team?) -> 'B site' | 'mid' | 'their spawn' | 'north side' ...   (callouts)
     findCover(game, from, threat, o?) -> { x, y, z, node, crouch } | null      a nearby spot out of the threat's sight
     holdSpots(game, centre, entries, o?) -> [{ x, y, z, node, look: {x,y,z}, crouch, score }]   angles to hold around a point
     routeInfo(path, centre) -> { entry, staging }            where a route enters a site and a point to gather before it
     openAngle(game, eye, baseYaw, spread, rays?) -> { yaw, dist } the longest open sightline in a fan (angle checks)
     wallAhead(game, eye, yaw, pitch, d) -> bool              the view hits a wall within d (do not stare at walls)
     solveThrow(from, to, speed, g?) -> { pitch, t, high } | null   ballistic pitch (POSITIVE = DOWN) to land at `to`
     throwClear(game, from, yaw, pitch, speed, t) -> bool      the arc is free of walls until t seconds (low precision)
     nadeAim(game, p, gid, to) -> { yaw, pitch, under } | null  the full throw solution (uses nades.predict when the grenade system has one)
     dist2D(a, b) */
import { segmentClear, raycast } from '../phys/ray.js';
import { getNade } from '../grenades/data.js';
import { eyePos } from '../phys/move.js';

export const dist2D = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const SOLID = { solid: true };

// ------------------------------------------------------------------------------------------------ places
function anchors(game) {
  if (game._botPlaces) return game._botPlaces;
  const m = game.map || {}, A = [], O = game.objectives, has = k => !!(O && O.has && O.has(k));
  if (m.sites && (has('bomb') || !O)) for (const k in m.sites) { const s = m.sites[k]; if (s) A.push({ name: k + ' site', x: s.x, y: s.y || 0, z: s.z, r: Math.max(6, ((s.x1 - s.x0) + (s.z1 - s.z0)) / 4 + 5) }); }
  const L = m.lobbies || {};
  for (const t of [1, 2]) if (L[t]) A.push({ name: 'spawn' + t, team: t, x: L[t].x, y: L[t].y || 0, z: L[t].z, r: Math.max(8, Math.hypot(L[t].x1 - L[t].x0, L[t].z1 - L[t].z0) / 2 + 6) });
  const P = m.points || {}, zoneN = { dom1: 'A', dom2: 'B', dom3: 'C' };
  for (const k in P) {
    const q = P[k];
    let name = null;
    if (zoneN[k] && has('zones')) name = 'zone ' + zoneN[k];
    else if (k === 'hill' && has('zones')) name = 'the hill';
    else if (/^extract/.test(k) && has('vip')) name = 'extraction';
    if (name) A.push({ name, x: q.x, y: q.y || 0, z: q.z, r: Math.max(6, (q.r || 3) + 5) });
  }
  if (m.hostages && m.hostages.length && has('hostage')) { const h = m.hostages[0]; A.push({ name: 'the hostages', x: h.x, y: h.y || 0, z: h.z, r: 9 }); }
  const b = m.bounds || (game.def && game.def.bounds) || { minX: -50, maxX: 50, minZ: -50, maxZ: 50 };
  const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2, size = Math.max(b.maxX - b.minX, b.maxZ - b.minZ);
  return (game._botPlaces = { A, cx, cz, size });
}
export function areaName(game, x, y, z, team = 0) {
  const P = anchors(game);
  let best = null, bd = Infinity;
  for (const a of P.A) { const d = Math.hypot(a.x - x, a.z - z); if (d < a.r && d < bd && Math.abs((a.y || 0) - y) < 8) { bd = d; best = a; } }
  if (best) {
    if (best.team) return best.team === team ? 'our spawn' : team ? 'their spawn' : (best.team === 1 ? 'Vanguard spawn' : 'Sentinel spawn');
    return best.name;
  }
  const dx = x - P.cx, dz = z - P.cz;
  if (Math.hypot(dx, dz) < P.size * 0.16) return 'mid';
  const a = Math.atan2(dx, dz);   // 0 = +z = north
  const dirs = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
  return dirs[((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8] + ' side';
}

// ------------------------------------------------------------------------------------------------ cover
const NODES = [], TMP = { x: 0, y: 0, z: 0 }, TMP2 = { x: 0, y: 0, z: 0 };
/** A spot near `from` that the threat (an eye position) cannot see: standing cover first, crouch cover as a fallback.
    o = { minR = 1.5, maxR = 9, rng, away = true (not closer to the threat), samples = 48 } */
export function findCover(game, from, threat, o = {}) {
  const nav = game.map && game.map.nav; if (!nav) return null;
  const minR = o.minR ?? 1.5, maxR = o.maxR ?? 9, rng = o.rng || Math.random, n0 = nav.nearest(from.x, from.y + 0.3, from.z, 2);
  if (n0 < 0) return null;
  const comp = nav.component(n0);
  nav.nodesNear(from.x, from.y, from.z, maxR, NODES, { stride: 2, dy: 1.2 });
  const dThreat = dist2D(from, threat);
  let best = null, bs = -Infinity;
  const tries = Math.min(NODES.length, o.samples || 48);
  for (let k = 0; k < tries; k++) {
    const n = NODES[Math.floor(rng() * NODES.length)];
    if (nav.component(n) !== comp || nav.isGate(n)) continue;
    const x = nav.nX[n], y = nav.nY[n], z = nav.nZ[n];
    const d = Math.hypot(x - from.x, z - from.z); if (d < minR) continue;
    const dt = Math.hypot(x - threat.x, z - threat.z);
    if (o.away !== false && dt < dThreat - 1.0) continue;
    TMP.x = x; TMP.y = y + 1.55; TMP.z = z;
    let crouch = false;
    if (nav.losClear(threat, TMP)) {
      TMP.y = y + 1.05;
      if (nav.losClear(threat, TMP)) continue;
      crouch = true;
    }
    const s = -d * 0.6 + Math.min(dt, 30) * 0.15 - (crouch ? 2 : 0) + (8 - nav.openness(n)) * 0.3 + rng() * 0.5;
    if (s > bs) { bs = s; best = { x, y, z, node: n, crouch }; }
  }
  return best;
}

// ------------------------------------------------------------------------------------------------ hold-angle spots
/** Spots to hold around `centre` (a site / bomb / zone) that watch the entries (points enemies come through): line of sight to an
    entry from standing (or crouched behind low cover), some distance from it, near walls, not open to every direction.
    o = { minR = 3, maxR = 16, samples = 140, rng, top = 8, team } -> sorted best first. */
export function holdSpots(game, centre, entries, o = {}) {
  const nav = game.map && game.map.nav; if (!nav) return [];
  const rng = o.rng || Math.random, minR = o.minR ?? 3, maxR = o.maxR ?? 16;
  nav.nodesNear(centre.x, centre.y || 0, centre.z, maxR, NODES, { stride: 2, dy: 2.2 });
  const c0 = nav.nearest(centre.x, (centre.y || 0) + 0.3, centre.z, 4), comp = c0 >= 0 ? nav.component(c0) : -1;
  const ents = entries && entries.length ? entries : [centre];
  const out = [];
  const tries = Math.min(NODES.length, o.samples || 140);
  for (let k = 0; k < tries; k++) {
    const n = NODES[Math.floor(rng() * NODES.length)];
    if (comp >= 0 && nav.component(n) !== comp) continue;
    if (nav.isGate(n) || nav.isCrouchOnly(n)) continue;
    const x = nav.nX[n], y = nav.nY[n], z = nav.nZ[n];
    const dc = Math.hypot(x - centre.x, z - centre.z); if (dc < minR) continue;
    let s = 0, look = null, lookD = 0, crouch = false;
    for (const e of ents) {
      const de = Math.hypot(x - e.x, z - e.z);
      TMP.x = x; TMP.y = y + 1.6; TMP.z = z; TMP2.x = e.x; TMP2.y = (e.y || 0) + 1.3; TMP2.z = e.z;
      if (!nav.losClear(TMP, TMP2)) continue;
      // crouch-peek spot: hidden crouched, sees standing
      TMP.y = y + 1.1; const low = !nav.losClear(TMP, TMP2);
      let v = 10 - Math.abs(de - 14) * 0.35;
      if (de < 6) v -= 8;
      if (low) v += 3;
      if (v > s) { s = v; look = e; lookD = de; crouch = low; }
    }
    if (!look) continue;
    s += (8 - nav.openness(n)) * 0.6;                   // against a wall / in a corner
    s -= Math.abs(dc - (o.prefer ?? 7)) * 0.25;           // near the objective, not on top of it
    s += rng() * 1.5;
    out.push({ x, y, z, node: n, look: { x: look.x, y: look.y || 0, z: look.z }, crouch, score: s, lookD });
  }
  out.sort((a, b) => b.score - a.score);
  // spread: drop spots within 2.5 m of a better one
  const res = [];
  for (const q of out) { if (res.some(r => Math.hypot(r.x - q.x, r.z - q.z) < 2.5)) continue; res.push(q); if (res.length >= (o.top || 8)) break; }
  return res;
}

/** Where a path (raw, unsmoothed) enters a site (first point within `r` of the centre) and a staging point `back` metres of path
    before it, but never in the first 40% of the route (small maps: the spawn is close to the site). */
export function routeInfo(path, centre, r = 15, back = 16) {
  if (!path || path.length < 2) return null;
  const cum = [0];
  for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + Math.hypot(path[i].x - path[i - 1].x, path[i].z - path[i - 1].z));
  let ei = -1;
  for (let i = 0; i < path.length; i++) if (Math.hypot(path[i].x - centre.x, path[i].z - centre.z) < r && Math.abs(path[i].y - (centre.y || 0)) < 3) { ei = i; break; }
  if (ei < 0) ei = path.length - 1;
  const want = Math.max(cum[ei] - back, Math.min(cum[ei] * 0.4, cum[ei] - 4), 0);
  let si = 0; while (si < ei && cum[si + 1] <= want) si++;
  const a = path[si], b = path[Math.min(ei, si + 1)], L = Math.max(1e-6, cum[Math.min(ei, si + 1)] - cum[si]), t = Math.min(1, (want - cum[si]) / L);
  const entry = path[ei];
  return { entry: { x: entry.x, y: entry.y, z: entry.z }, staging: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t }, ei, si, len: cum[cum.length - 1] };
}

// ------------------------------------------------------------------------------------------------ angles
const DIR = { x: 0, y: 0, z: 0 }, RR = { hit: false, dist: 0, point: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 0, z: 0 }, surf: null, id: -1 };
/** The most open direction in a fan around baseYaw (rays at eye height). */
export function openAngle(game, eye, baseYaw, spread = 1.6, rays = 7, maxD = 45) {
  let best = baseYaw, bd = -1;
  for (let i = 0; i < rays; i++) {
    const a = baseYaw + (rays === 1 ? 0 : (i / (rays - 1) - 0.5) * 2 * spread);
    DIR.x = Math.sin(a); DIR.y = 0; DIR.z = Math.cos(a);
    const r = raycast(game.world, eye, DIR, maxD, { skipGlass: true, out: RR });
    const d = r && r.hit ? r.dist : maxD;
    const w = d * (1 - 0.25 * Math.abs(a - baseYaw) / Math.max(0.01, spread));
    if (w > bd) { bd = w; best = a; }
  }
  return { yaw: best, dist: bd };
}
export function wallAhead(game, eye, yaw, pitch, d = 1.6) {
  const cp = Math.cos(pitch); DIR.x = Math.sin(yaw) * cp; DIR.y = -Math.sin(pitch); DIR.z = Math.cos(yaw) * cp;
  const r = raycast(game.world, eye, DIR, d, { skipGlass: true, out: RR });
  return !!(r && r.hit);
}

// ------------------------------------------------------------------------------------------------ grenades
/** Elevation for a projectile at `speed` to land on `to` from `from` (no drag): low arc unless high. pitch POSITIVE = DOWN. */
export function solveThrow(from, to, speed, high = false, g = 9.81) {
  const dx = to.x - from.x, dz = to.z - from.z, d = Math.hypot(dx, dz), h = to.y - from.y, v2 = speed * speed;
  if (d < 0.5) return { pitch: 1.2, t: 0.4, high: false };
  const disc = v2 * v2 - g * (g * d * d + 2 * h * v2);
  if (disc < 0) return null;
  const sq = Math.sqrt(disc), th = Math.atan((v2 + (high ? sq : -sq)) / (g * d));
  const t = d / (speed * Math.cos(th));
  return { pitch: -th, t, high };
}
/** Sample the arc against the world (movement colliders). */
export function throwClear(game, from, yaw, pitch, speed, t, g = 9.81) {
  const th = -pitch, vx = Math.sin(yaw) * Math.cos(th) * speed, vz = Math.cos(yaw) * Math.cos(th) * speed, vy = Math.sin(th) * speed;
  const n = Math.max(4, Math.ceil(t / 0.08));
  let px = from.x, py = from.y, pz = from.z;
  for (let i = 1; i <= n; i++) {
    const s = (i / n) * t * 0.93;   // stop just short of the landing point
    const x = from.x + vx * s, y = from.y + vy * s - 0.5 * g * s * s, z = from.z + vz * s;
    if (!segmentClear(game.world, px, py, pz, x, y, z, SOLID)) return false;
    px = x; py = y; pz = z;
  }
  return true;
}
const EYE = { x: 0, y: 0, z: 0 };
/** Throw solution for p to land grenade gid at `to`: { yaw, pitch, under } (overhand unless only the lob reaches). */
export function nadeAim(game, p, gid, to) {
  const sys = game.getSystem && game.getSystem('nades');
  if (sys && sys.aimFor) { try { const r = sys.aimFor(p, gid, to); if (r) return r; } catch (e) { /* fall back */ } }
  const nd = getNade(gid); if (!nd) return null;
  eyePos(p, EYE);
  const yaw = Math.atan2(to.x - EYE.x, to.z - EYE.z);
  const tries = [[nd.throwSpeed || 15, false, false], [nd.throwSpeed || 15, true, false], [nd.lobSpeed || 7, false, true], [nd.lobSpeed || 7, true, true]];
  for (const [sp, high, under] of tries) {
    // the drag shortens the throw: aim ~6% long per second of flight (rough), at most two corrections
    let tgt = { x: to.x, y: to.y + 0.1, z: to.z }, sol = null;
    for (let k = 0; k < 2; k++) {
      sol = solveThrow(EYE, tgt, sp, high); if (!sol) break;
      const f = 1 + Math.min(0.35, (nd.drag || 0) * sol.t * 0.5);
      tgt = { x: EYE.x + (to.x - EYE.x) * f, y: to.y + 0.1, z: EYE.z + (to.z - EYE.z) * f };
    }
    if (!sol || sol.pitch < -1.35) continue;
    if (throwClear(game, EYE, yaw, sol.pitch, sp, sol.t)) return { yaw, pitch: sol.pitch, under, t: sol.t };
  }
  return null;
}
