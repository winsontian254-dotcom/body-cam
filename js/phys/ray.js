/* LIVE FIRE — ray casts against the collision World. PURE JS (no BABYLON).
   Exports:
     raycast(world, origin, dir, maxDist, opts?) -> { hit, dist, point, normal, surf, id }
         dir must be normalised. A ray that starts inside a collider hits it at dist 0 (normal = -dir).
         opts: { ignore: id | (id) => bool, skipGlass: bool (sight lines), tag: only this tag, skipTag: ignore this tag,
                 out: result object to reuse (no allocation: point/normal objects inside it are reused too) }
         id is the collider id, or -1 - fieldIndex for a heightfield; on a miss: { hit: false, dist: maxDist, ... }.
     raycastAll(world, origin, dir, maxDist, opts?) -> [{ dist, point, normal, surf, id, exitDist }] sorted by dist
         every collider crossed (for penetration: thickness = exitDist - dist; heightfields: exitDist = Infinity).
     segmentClear(world, ax, ay, az, bx, by, bz, opts?) -> bool    no ray-blocking collider between the two points
   Boxes use a slab test in their local (Y-rotated) space, ramps a convex half-space clip, cylinders the analytic
   quadratic, heightfields a march (half a cell) refined by bisection. */

import { fieldH } from './world.js';

const BOX = 0, RAMP = 1, CYL = 2;
const INF = Infinity;
const H = { t0: 0, t1: 0, nx: 0, ny: 0, nz: 0 };   // scratch hit of one shape

/** Ray vs one collider. Returns true and fills H (entry t0, exit t1, entry normal) when the ray crosses it within [0, tmax]. */
function hitShape(c, ox, oy, oz, dx, dy, dz, tmax) {
  if (c.k === CYL) return hitCyl(c, ox, oy, oz, dx, dy, dz, tmax);
  // to local space
  const rx = ox - c.cx, rz = oz - c.cz;
  const lox = rx * c.c - rz * c.s, loz = rx * c.s + rz * c.c;
  const ldx = dx * c.c - dz * c.s, ldz = dx * c.s + dz * c.c;
  if (c.k === BOX) {
    const loy = oy - c.cy;
    let t0 = -INF, t1 = INF, ax = -1, sg = 0;
    // x slab
    if (Math.abs(ldx) < 1e-12) { if (lox < -c.hx || lox > c.hx) return false; }
    else {
      const inv = 1 / ldx; let a = (-c.hx - lox) * inv, b = (c.hx - lox) * inv, s = -1;
      if (a > b) { const t = a; a = b; b = t; s = 1; }
      if (a > t0) { t0 = a; ax = 0; sg = s; } if (b < t1) t1 = b;
    }
    if (Math.abs(dy) < 1e-12) { if (loy < -c.hy || loy > c.hy) return false; }
    else {
      const inv = 1 / dy; let a = (-c.hy - loy) * inv, b = (c.hy - loy) * inv, s = -1;
      if (a > b) { const t = a; a = b; b = t; s = 1; }
      if (a > t0) { t0 = a; ax = 1; sg = s; } if (b < t1) t1 = b;
    }
    if (Math.abs(ldz) < 1e-12) { if (loz < -c.hz || loz > c.hz) return false; }
    else {
      const inv = 1 / ldz; let a = (-c.hz - loz) * inv, b = (c.hz - loz) * inv, s = -1;
      if (a > b) { const t = a; a = b; b = t; s = 1; }
      if (a > t0) { t0 = a; ax = 2; sg = s; } if (b < t1) t1 = b;
    }
    if (t0 > t1 || t1 < 0 || t0 > tmax) return false;
    H.t0 = t0; H.t1 = t1;
    if (t0 < 0 || ax < 0) { H.t0 = 0; H.nx = -dx; H.ny = -dy; H.nz = -dz; return true; }
    // sg: -1 when entering through the -axis face (ray direction positive): normal points to -axis
    let nlx = 0, nly = 0, nlz = 0;
    if (ax === 0) nlx = sg; else if (ax === 1) nly = sg; else nlz = sg;
    H.nx = nlx * c.c + nlz * c.s; H.ny = nly; H.nz = -nlx * c.s + nlz * c.c;
    return true;
  }
  // RAMP: half-spaces n . p <= d in local space (p relative to (cx, *, cz))
  let t0 = -INF, t1 = INF, bnx = 0, bny = 0, bnz = 0;
  const k = c.slope, hx = c.hx, hz = c.hz;
  // planes: +x, -x, +z, -z, bottom (-y), slope
  for (let p = 0; p < 6; p++) {
    let nx = 0, ny = 0, nz = 0, d = 0;
    switch (p) {
      case 0: nx = 1; d = hx; break;
      case 1: nx = -1; d = hx; break;
      case 2: nz = 1; d = hz; break;
      case 3: nz = -1; d = hz; break;
      case 4: ny = -1; d = -c.base; break;
      default:
        if (c.ax === 0) { nx = -k; ny = 1; d = c.y0 + k * hx; } else { nz = -k; ny = 1; d = c.y0 + k * hz; }
    }
    const den = nx * ldx + ny * dy + nz * ldz, dist = d - (nx * lox + ny * oy + nz * loz);
    if (Math.abs(den) < 1e-12) { if (dist < 0) return false; continue; }
    const t = dist / den;
    if (den < 0) { if (t > t0) { t0 = t; bnx = nx; bny = ny; bnz = nz; } }
    else if (t < t1) t1 = t;
    if (t0 > t1) return false;
  }
  if (t1 < 0 || t0 > tmax) return false;
  H.t0 = t0; H.t1 = t1;
  if (t0 < 0) { H.t0 = 0; H.nx = -dx; H.ny = -dy; H.nz = -dz; return true; }
  const inv = 1 / Math.hypot(bnx, bny, bnz);
  H.nx = (bnx * c.c + bnz * c.s) * inv; H.ny = bny * inv; H.nz = (-bnx * c.s + bnz * c.c) * inv;
  return true;
}

function hitCyl(c, ox, oy, oz, dx, dy, dz, tmax) {
  const rx = ox - c.cx, rz = oz - c.cz;
  const a = dx * dx + dz * dz;
  let t0 = -INF, t1 = INF, side = false;
  if (a < 1e-12) { if (rx * rx + rz * rz > c.r * c.r) return false; }
  else {
    const b = rx * dx + rz * dz, cc = rx * rx + rz * rz - c.r * c.r;
    const disc = b * b - a * cc; if (disc < 0) return false;
    const sq = Math.sqrt(disc);
    t0 = (-b - sq) / a; t1 = (-b + sq) / a; side = true;
  }
  let capEntry = false;
  if (Math.abs(dy) < 1e-12) { if (oy < c.bot || oy > c.top) return false; }
  else {
    let a0 = (c.bot - oy) / dy, b0 = (c.top - oy) / dy;
    if (a0 > b0) { const t = a0; a0 = b0; b0 = t; }
    if (a0 > t0) { t0 = a0; capEntry = true; side = false; }
    if (b0 < t1) t1 = b0;
  }
  if (t0 > t1 || t1 < 0 || t0 > tmax) return false;
  H.t0 = t0; H.t1 = t1;
  if (t0 < 0) { H.t0 = 0; H.nx = -dx; H.ny = -dy; H.nz = -dz; return true; }
  if (capEntry) { H.nx = 0; H.ny = dy > 0 ? -1 : 1; H.nz = 0; }
  else if (side) { const px = rx + dx * t0, pz = rz + dz * t0, l = Math.hypot(px, pz) || 1; H.nx = px / l; H.ny = 0; H.nz = pz / l; }
  return true;
}

/** March a ray over a heightfield. Returns the entry t or -1. Fills H normal. */
function hitField(world, f, ox, oy, oz, dx, dy, dz, tmax) {
  // clip to the field's AABB (no closures: this runs for every bullet and sight line)
  let t0 = 0, t1 = tmax;
  if (Math.abs(dx) < 1e-12) { if (ox < f.minX || ox > f.maxX) return -1; }
  else { let a = (f.minX - ox) / dx, b = (f.maxX - ox) / dx; if (a > b) { const t = a; a = b; b = t; } if (a > t0) t0 = a; if (b < t1) t1 = b; }
  if (Math.abs(dz) < 1e-12) { if (oz < f.minZ || oz > f.maxZ) return -1; }
  else { let a = (f.minZ - oz) / dz, b = (f.maxZ - oz) / dz; if (a > b) { const t = a; a = b; b = t; } if (a > t0) t0 = a; if (b < t1) t1 = b; }
  if (dy > 1e-12) { const b = (f.hi + 1e-3 - oy) / dy; if (b < t1) t1 = b; }
  else if (dy < -1e-12) { const a = (f.hi + 1e-3 - oy) / dy; if (a > t0) t0 = a; }
  else if (oy > f.hi + 1e-3) return -1;
  if (t0 > t1) return -1;
  const step = f.res * 0.5;
  let tp = t0;
  const fp = oy + dy * tp - fieldH(f, ox + dx * tp, oz + dz * tp);
  if (fp <= 0) { if (tp === 0) { H.nx = -dx; H.ny = -dy; H.nz = -dz; return 0; } }
  else {
    let found = false;
    for (let t = t0 + step; ; t += step) {
      const tt = t > t1 ? t1 : t;
      const fv = oy + dy * tt - fieldH(f, ox + dx * tt, oz + dz * tt);
      if (fv <= 0) {
        let lo = tp, hi = tt;
        for (let i = 0; i < 12; i++) { const m = (lo + hi) * 0.5; if (oy + dy * m - fieldH(f, ox + dx * m, oz + dz * m) > 0) lo = m; else hi = m; }
        tp = hi; found = true; break;
      }
      tp = tt;
      if (tt >= t1) break;
    }
    if (!found) return -1;
  }
  world.fieldNormal(f, ox + dx * tp, oz + dz * tp, H);
  return tp;
}

function ignored(opts, c) {
  if (!opts) return false;
  if (opts.skipGlass && c.surf === 'glass') return true;
  if (opts.tag != null && c.tag !== opts.tag) return true;
  if (opts.skipTag != null && c.tag === opts.skipTag) return true;
  const ig = opts.ignore;
  if (ig == null) return false;
  if (typeof ig === 'function') return ig(c.id);
  if (typeof ig === 'number') return ig === c.id;
  return ig.has ? ig.has(c.id) : false;
}

const _stack = new Int32Array(256);

/** Visit every BVH leaf collider whose node the ray crosses within tmax(); visit(c) may lower the limit through limit.t. */
function traverse(world, ox, oy, oz, dx, dy, dz, limit, visit) {
  const cols = world.cols;
  if (world.built && world.nodeCount) {
    const ix = 1 / (dx || 1e-30), iy = 1 / (dy || 1e-30), iz = 1 / (dz || 1e-30);
    const mn = world.nMin, mx = world.nMax;
    let sp = 0; _stack[sp++] = 0;
    while (sp > 0) {
      const n = _stack[--sp], b = n * 3;
      let a0 = (mn[b] - ox) * ix, b0 = (mx[b] - ox) * ix; if (a0 > b0) { const t = a0; a0 = b0; b0 = t; }
      let a1 = (mn[b + 1] - oy) * iy, b1 = (mx[b + 1] - oy) * iy; if (a1 > b1) { const t = a1; a1 = b1; b1 = t; }
      let a2 = (mn[b + 2] - oz) * iz, b2 = (mx[b + 2] - oz) * iz; if (a2 > b2) { const t = a2; a2 = b2; b2 = t; }
      const tn = Math.max(a0, a1, a2, 0), tf = Math.min(b0, b1, b2);
      if (tn > tf || tn > limit.t) continue;
      const l = world.nLeft[n];
      if (l < 0) {
        const s0 = world.nStart[n], e0 = s0 + world.nCount[n];
        for (let k = s0; k < e0; k++) { const c = cols[world.items[k]]; if (c.alive && c.ray) visit(c); }
      } else { _stack[sp++] = world.nRight[n]; _stack[sp++] = l; }
    }
  }
  if (world.built) { for (let k = 0; k < world.extra.length; k++) { const c = cols[world.extra[k]]; if (c.alive && c.ray) visit(c); } }
  else for (let k = 0; k < cols.length; k++) { const c = cols[k]; if (c.alive && c.ray) visit(c); }
}

const LIM = { t: 0 };
let R = null;   // current raycast state for the visitor (no closures per call)
function visitFirst(c) {
  if (ignored(R.opts, c)) return;
  if (hitShape(c, R.ox, R.oy, R.oz, R.dx, R.dy, R.dz, LIM.t) && H.t0 < LIM.t) {
    LIM.t = H.t0; R.id = c.id; R.surf = c.surf; R.nx = H.nx; R.ny = H.ny; R.nz = H.nz;
  }
}
const RS = { opts: null, ox: 0, oy: 0, oz: 0, dx: 0, dy: 0, dz: 0, id: -1, surf: null, nx: 0, ny: 0, nz: 0 };

export function raycast(world, origin, dir, maxDist, opts) {
  const ox = origin.x, oy = origin.y, oz = origin.z, dx = dir.x, dy = dir.y, dz = dir.z;
  R = RS; R.opts = opts || null; R.ox = ox; R.oy = oy; R.oz = oz; R.dx = dx; R.dy = dy; R.dz = dz; R.id = -2; R.surf = null;
  LIM.t = maxDist;
  traverse(world, ox, oy, oz, dx, dy, dz, LIM, visitFirst);
  const fields = world.fields;
  for (let i = 0; i < fields.length; i++) {
    const f = fields[i]; if (!f.ray) continue;
    const t = hitField(world, f, ox, oy, oz, dx, dy, dz, LIM.t);
    if (t >= 0 && t < LIM.t) { LIM.t = t; R.id = -1 - i; R.surf = f.surf; R.nx = H.nx; R.ny = H.ny; R.nz = H.nz; }
  }
  const out = (opts && opts.out) || { hit: false, dist: 0, point: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 0, z: 0 }, surf: null, id: -1 };
  if (!out.point) out.point = { x: 0, y: 0, z: 0 };
  if (!out.normal) out.normal = { x: 0, y: 0, z: 0 };
  const hit = R.id !== -2, t = LIM.t;
  out.hit = hit; out.dist = t; out.id = hit ? R.id : -1; out.surf = hit ? R.surf : null;
  out.point.x = ox + dx * t; out.point.y = oy + dy * t; out.point.z = oz + dz * t;
  out.normal.x = hit ? R.nx : 0; out.normal.y = hit ? R.ny : 0; out.normal.z = hit ? R.nz : 0;
  R.opts = null;
  return out;
}

let ALL = null;
const AS = { opts: null, ox: 0, oy: 0, oz: 0, dx: 0, dy: 0, dz: 0, max: 0, list: null };
function visitAll(c) {
  if (ignored(ALL.opts, c)) return;
  if (hitShape(c, ALL.ox, ALL.oy, ALL.oz, ALL.dx, ALL.dy, ALL.dz, ALL.max) && H.t0 <= ALL.max) {
    const t = H.t0;
    ALL.list.push({ dist: t, point: { x: ALL.ox + ALL.dx * t, y: ALL.oy + ALL.dy * t, z: ALL.oz + ALL.dz * t },
      normal: { x: H.nx, y: H.ny, z: H.nz }, surf: c.surf, id: c.id, exitDist: H.t1 });
  }
}

export function raycastAll(world, origin, dir, maxDist, opts) {
  const ox = origin.x, oy = origin.y, oz = origin.z, dx = dir.x, dy = dir.y, dz = dir.z;
  const list = [];
  ALL = AS; Object.assign(AS, { opts: opts || null, ox, oy, oz, dx, dy, dz, max: maxDist, list });
  LIM.t = maxDist;
  traverse(world, ox, oy, oz, dx, dy, dz, LIM, visitAll);
  const fields = world.fields;
  for (let i = 0; i < fields.length; i++) {
    const f = fields[i]; if (!f.ray) continue;
    const t = hitField(world, f, ox, oy, oz, dx, dy, dz, maxDist);
    if (t >= 0) list.push({ dist: t, point: { x: ox + dx * t, y: oy + dy * t, z: oz + dz * t }, normal: { x: H.nx, y: H.ny, z: H.nz },
      surf: f.surf, id: -1 - i, exitDist: Infinity });
  }
  AS.list = null; AS.opts = null;
  list.sort((a, b) => a.dist - b.dist);
  return list;
}

const SEG_O = { x: 0, y: 0, z: 0 }, SEG_D = { x: 0, y: 0, z: 0 };
const SEG_OPTS = { out: { hit: false, dist: 0, point: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 0, z: 0 }, surf: null, id: -1 },
  ignore: null, skipGlass: false, tag: null, skipTag: null };
export function segmentClear(world, ax, ay, az, bx, by, bz, opts) {
  const dx = bx - ax, dy = by - ay, dz = bz - az, L = Math.hypot(dx, dy, dz);
  if (L < 1e-6) return true;
  SEG_O.x = ax; SEG_O.y = ay; SEG_O.z = az; SEG_D.x = dx / L; SEG_D.y = dy / L; SEG_D.z = dz / L;
  SEG_OPTS.ignore = opts && opts.ignore != null ? opts.ignore : null; SEG_OPTS.skipGlass = !!(opts && opts.skipGlass);
  SEG_OPTS.tag = opts && opts.tag != null ? opts.tag : null; SEG_OPTS.skipTag = opts && opts.skipTag != null ? opts.skipTag : null;
  return !raycast(world, SEG_O, SEG_D, L, SEG_OPTS).hit;
}
