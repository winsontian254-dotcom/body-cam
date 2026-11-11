/* LIVE FIRE — procedural gun modelling kit. PURE JS geometry (no BABYLON, no DOM): js/weapons/models.js turns the result into
   Babylon meshes; Node tests can run it directly. Contract and spec format: docs/ARCHITECTURE.md §5 ("gun kit").
   Exports:
     Kit                      geometry collector: new Kit({ lod, wear, seed }) -> parts (nodes) x material roles -> buffers
       .part(name, { pivot, parent, hide }) / .use(name)   choose the node geometry goes into (moving parts = separate nodes)
       .mat(role)                                           choose the material role (see ROLES)
       .at({ p, r, s }, fn)                                 nested transform (p = [x,y,z] m, r = [rx,ry,rz] rad, Babylon order)
       .node(name, p, r, { part, meta })                    named locator (sockets, muzzle, eject, hands ...)
       primitives (all take o = { p, r, s, mat, ao, wear } + their own options):
         extrude(profile, depth, o)    2D profile with fillets, holes, cap recesses, rounded / chamfered bevel on the caps
         lathe(profile, o)             surface of revolution [[r, z, wear?]...] (+ rmod(theta, z) for flutes / fins)
         sweep(path, o)                tube along a 3D polyline (wire stocks, levers, springs, belts)
         box(w, h, d, o)  cyl(r, len, o)  tube(ro, ri, len, o)  disc(r, t, o)  sphere(r, o)
         rail(len, o)                  Picatinny rail with real teeth + cross slots (+Z long, sits on y = 0, faces +Y)
         screw(o)  pin(o)  rivet(o)  spring(o)
       .seg(n) / .arcN / .lod / .detail(level)              LOD helpers (segments per 90 degrees, detail gates)
       .stats() -> { tris, verts, parts, roles }            .build() -> { parts: [{ name, pivot, parent, roles: { role: Buf } }], nodes }
     shape(points, n)          2D outline from [u, v, r?] points: r > 0 = fillet radius, r < 0 = chamfer size (metres)
     rr(w, h, r, cx, cy, n)    rounded rectangle;  circle(r, n, cx, cy);  arc(cx, cy, r, a0, a1, n);  mm(v) = v / 1000
     mirrorU(points)           mirror an outline about u = 0 (symmetric front views)
     slots(...)                M-LOK / vent / serration hole helpers: mlokSlots, rowSlots
     earcut(flat, holes)       polygon triangulation with holes (own implementation; Babylon's PolygonMeshBuilder needs a global)
     ROLES                     material roles a model may use (models.js maps them to scene materials per gun palette and skin)
   Buffers: { p: Float32Array xyz, n: normals, uv: metres (1 unit = 1 m), c: RGBA (rgb = baked cavity AO), w: edge-wear 0..1,
              i: Uint32Array }.  Triangles are front-facing for Babylon (left-handed, clockwise) — auto-oriented from normals.
   Conventions (docs §5): gun-local +Z = muzzle, +Y up, +X right, origin at the trigger, metres, real sizes.
*/

export const ROLES = ['rcv', 'frame', 'slide', 'furn', 'grip', 'metal', 'barrel', 'dark', 'bright', 'bore', 'wood', 'wood2', 'rubber',
  'brass', 'copper', 'spring', 'alu', 'alu2', 'fibre_r', 'fibre_g', 'trit', 'white', 'trans', 'glass', 'fabric', 'mag', 'stamp'];

export const mm = v => v / 1000;
const TAU = Math.PI * 2, HALF = Math.PI / 2;

// ------------------------------------------------------------------------------------------------------------------
// small math (row-major 3x4 affine: [m00 m01 m02 tx | m10 m11 m12 ty | m20 m21 m22 tz])
const I34 = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];
function trs(p, r, s) {
  const [x, y, z] = p || [0, 0, 0], [rx, ry, rz] = r || [0, 0, 0];
  const S = typeof s === 'number' ? [s, s, s] : (s || [1, 1, 1]);
  const cx = Math.cos(rx), sx = Math.sin(rx), cy = Math.cos(ry), sy = Math.sin(ry), cz = Math.cos(rz), sz = Math.sin(rz);
  // R = Ry * Rx * Rz (Babylon: roll Z first, then pitch X, then yaw Y)
  const m00 = cy * cz + sy * sx * sz, m01 = -cy * sz + sy * sx * cz, m02 = sy * cx;
  const m10 = cx * sz, m11 = cx * cz, m12 = -sx;
  const m20 = -sy * cz + cy * sx * sz, m21 = sy * sz + cy * sx * cz, m22 = cy * cx;
  return [m00 * S[0], m01 * S[1], m02 * S[2], x, m10 * S[0], m11 * S[1], m12 * S[2], y, m20 * S[0], m21 * S[1], m22 * S[2], z];
}
function mul(A, B) {
  const o = new Array(12);
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) o[r * 4 + c] = A[r * 4] * B[c] + A[r * 4 + 1] * B[4 + c] + A[r * 4 + 2] * B[8 + c];
    o[r * 4 + 3] = A[r * 4] * B[3] + A[r * 4 + 1] * B[7] + A[r * 4 + 2] * B[11] + A[r * 4 + 3];
  }
  return o;
}
// normal matrix (cofactor of the 3x3) + determinant sign
function nmat(M) {
  const a = M[0], b = M[1], c = M[2], d = M[4], e = M[5], f = M[6], g = M[8], h = M[9], i = M[10];
  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  return { N: [e * i - f * h, -(d * i - f * g), d * h - e * g, -(b * i - c * h), a * i - c * g, -(a * h - b * g), b * f - c * e, -(a * f - c * d), a * e - b * d], det };
}
const v3 = {
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sc: (a, s) => [a[0] * s, a[1] * s, a[2] * s], dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cr: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  len: a => Math.hypot(a[0], a[1], a[2]), nrm: a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
};

// ------------------------------------------------------------------------------------------------------------------
// 2D outline helpers
export function arc(cx, cy, r, a0, a1, n = 8) {
  const out = []; for (let k = 0; k <= n; k++) { const a = a0 + (a1 - a0) * k / n; out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } return out;
}
export function circle(r, n = 24, cx = 0, cy = 0) { const out = []; for (let k = 0; k < n; k++) { const a = TAU * k / n; out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } return out; }
export function ellipse(rx, ry, n = 24, cx = 0, cy = 0) { const out = []; for (let k = 0; k < n; k++) { const a = TAU * k / n; out.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]); } return out; }
export function rr(w, h, r, cx = 0, cy = 0, n = 4) {
  const x0 = cx - w / 2, x1 = cx + w / 2, y0 = cy - h / 2, y1 = cy + h / 2; r = Math.min(r, w / 2 - 1e-6, h / 2 - 1e-6);
  if (r <= 1e-6) return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  return shape([[x0, y0, r], [x1, y0, r], [x1, y1, r], [x0, y1, r]], n);
}
export function mirrorU(pts) { const back = pts.slice().reverse().map(p => [-p[0], p[1], p[2]]); return pts.concat(back.filter(p => Math.abs(p[0]) > 1e-9 || true)); }
/** shape([[u, v, r?, w?], ...], n, fall): closed outline; r > 0 rounds that corner with an arc of radius r (n segments per
    90 deg), r < 0 cuts a chamfer of size |r|. Returns [[u, v, w], ...]: w = edge wear (1 on fillets / chamfers, or the point's
    own w); fall > 0 inserts a wear-free point that far along the neighbouring edges so the wear stays on the edge. */
export function shape(pts, n = 4, fall = 0) {
  const out = [], L = pts.length;
  const push = (x, y, w) => out.push([x, y, w]);
  for (let i = 0; i < L; i++) {
    const p = pts[i], r = p[2] || 0, wv = p[3] ?? (r ? Math.min(1, Math.pow(.0022 / Math.abs(r), 1.5)) : 0);
    if (!r) { push(p[0], p[1], wv); continue; }
    const a = pts[(i - 1 + L) % L], b = pts[(i + 1) % L];
    let d1x = a[0] - p[0], d1y = a[1] - p[1], d2x = b[0] - p[0], d2y = b[1] - p[1];
    const l1 = Math.hypot(d1x, d1y), l2 = Math.hypot(d2x, d2y); if (l1 < 1e-9 || l2 < 1e-9) { push(p[0], p[1], wv); continue; }
    d1x /= l1; d1y /= l1; d2x /= l2; d2y /= l2;
    const cosT = Math.max(-1, Math.min(1, d1x * d2x + d1y * d2y)), th = Math.acos(cosT);
    if (th > Math.PI - 1e-4 || th < 1e-4) { push(p[0], p[1], wv); continue; }
    let t = r < 0 ? Math.min(-r, l1 * .5, l2 * .5) : r / Math.tan(th / 2); const tmax = Math.min(l1, l2) * .5; let rad = r; if (r > 0 && t > tmax) { t = tmax; rad = t * Math.tan(th / 2); }
    const f1 = fall > 0 && l1 * .5 - t > fall * 1.2 ? fall : 0, f2 = fall > 0 && l2 * .5 - t > fall * 1.2 ? fall : 0;
    if (f1) push(p[0] + d1x * (t + f1), p[1] + d1y * (t + f1), 0);
    if (r < 0) { push(p[0] + d1x * t, p[1] + d1y * t, wv); push(p[0] + d2x * t, p[1] + d2y * t, wv); }
    else {
      const bx = d1x + d2x, by = d1y + d2y, bl = Math.hypot(bx, by) || 1, dist = rad / Math.sin(th / 2);
      const cx = p[0] + bx / bl * dist, cy = p[1] + by / bl * dist;
      const sx = p[0] + d1x * t, sy = p[1] + d1y * t, ex = p[0] + d2x * t, ey = p[1] + d2y * t;
      let a0 = Math.atan2(sy - cy, sx - cx), a1 = Math.atan2(ey - cy, ex - cx);
      let da = a1 - a0; while (da > Math.PI) da -= TAU; while (da < -Math.PI) da += TAU;
      const k = Math.max(1, Math.ceil(Math.abs(da) / HALF * n));
      for (let j = 0; j <= k; j++) { const aa = a0 + da * j / k; push(cx + Math.cos(aa) * rad, cy + Math.sin(aa) * rad, wv); }
    }
    if (f2) push(p[0] + d2x * (t + f2), p[1] + d2y * (t + f2), 0);
  }
  return out;
}
/** M-LOK style slot outlines (rounded rectangles) along u from u0 to u1 at height v (for panels drawn in u/v). */
export function mlokSlots(u0, u1, v, { len = mm(32), w = mm(7), pitch = mm(40), n = 3 } = {}) {
  const out = [], count = Math.max(0, Math.floor((u1 - u0 - len) / pitch) + 1), start = u0 + ((u1 - u0) - (len + (count - 1) * pitch)) / 2;
  for (let k = 0; k < count; k++) out.push(rr(len, w, w / 2 - 1e-5, start + len / 2 + k * pitch, v, n));
  return out;
}
/** a row of identical slot outlines centred on (u, v) points. */
export function rowSlots(centres, len, w, r, n = 2, angle = 0) {
  return centres.map(([cu, cv]) => rr(len, w, r, 0, 0, n).map(([x, y]) => [cu + x * Math.cos(angle) - y * Math.sin(angle), cv + x * Math.sin(angle) + y * Math.cos(angle)]));
}
function area(pts) { let a = 0; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += (pts[j][0] - pts[i][0]) * (pts[j][1] + pts[i][1]); return a / 2; } // >0 = CCW
function clean(pts) {
  const out = [];
  for (const p of pts) { const q = out[out.length - 1]; if (!q || Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-7) out.push([p[0], p[1]]); }
  while (out.length > 2 && Math.hypot(out[0][0] - out[out.length - 1][0], out[0][1] - out[out.length - 1][1]) < 1e-7) out.pop();
  return out;
}
const orient = (pts, ccw) => { const c = clean(pts); return (area(c) > 0) === ccw ? c : c.reverse(); };

// ------------------------------------------------------------------------------------------------------------------
// earcut: triangulation of a polygon with holes (algorithm after Mapbox earcut; own compact implementation)
export function earcut(data, holeIndices) {
  const hasHoles = holeIndices && holeIndices.length, outerLen = hasHoles ? holeIndices[0] * 2 : data.length;
  let outer = linked(data, 0, outerLen, true); const tris = [];
  if (!outer || outer.next === outer.prev) return tris;
  if (hasHoles) outer = elimHoles(data, holeIndices, outer);
  cutLinked(outer, tris, 0);
  return tris;
}
function linked(data, start, end, clockwise) {
  let last = null;
  if (clockwise === (signedArea(data, start, end) > 0)) for (let i = start; i < end; i += 2) last = insNode(i / 2, data[i], data[i + 1], last);
  else for (let i = end - 2; i >= start; i -= 2) last = insNode(i / 2, data[i], data[i + 1], last);
  if (last && eq(last, last.next)) { rmNode(last); last = last.next; }
  return last;
}
function filterPts(start, end) {
  if (!start) return start; if (!end) end = start;
  let p = start, again;
  do {
    again = false;
    if (!p.steiner && (eq(p, p.next) || triA(p.prev, p, p.next) === 0)) { rmNode(p); p = end = p.prev; if (p === p.next) break; again = true; }
    else p = p.next;
  } while (again || p !== end);
  return end;
}
function cutLinked(ear, tris, pass) {
  if (!ear) return;
  let stop = ear, prev, next, guard = 0;
  while (ear.prev !== ear.next) {
    if (++guard > 100000) return;
    prev = ear.prev; next = ear.next;
    if (isEar(ear)) { tris.push(prev.i, ear.i, next.i); rmNode(ear); ear = next.next; stop = next.next; continue; }
    ear = next;
    if (ear === stop) {
      if (!pass) cutLinked(filterPts(ear), tris, 1);
      else if (pass === 1) { ear = cureLocal(filterPts(ear), tris); cutLinked(ear, tris, 2); }
      else if (pass === 2) splitCut(ear, tris);
      break;
    }
  }
}
function isEar(ear) {
  const a = ear.prev, b = ear, c = ear.next;
  if (triA(a, b, c) >= 0) return false;
  let p = ear.next.next;
  while (p !== ear.prev) {
    if (inTri(a.x, a.y, b.x, b.y, c.x, c.y, p.x, p.y) && triA(p.prev, p, p.next) >= 0) return false;
    p = p.next;
  }
  return true;
}
function cureLocal(start, tris) {
  let p = start;
  do {
    const a = p.prev, b = p.next.next;
    if (!eq(a, b) && intersects(a, p, p.next, b) && locInside(a, b) && locInside(b, a)) { tris.push(a.i, p.i, b.i); rmNode(p); rmNode(p.next); p = start = b; }
    p = p.next;
  } while (p !== start);
  return filterPts(p);
}
function splitCut(start, tris) {
  let a = start;
  do {
    let b = a.next.next;
    while (b !== a.prev) {
      if (a.i !== b.i && validDiag(a, b)) {
        let c = splitPoly(a, b); a = filterPts(a, a.next); c = filterPts(c, c.next);
        cutLinked(a, tris, 0); cutLinked(c, tris, 0); return;
      }
      b = b.next;
    }
    a = a.next;
  } while (a !== start);
}
function elimHoles(data, holeIndices, outer) {
  const queue = [];
  for (let i = 0; i < holeIndices.length; i++) {
    const start = holeIndices[i] * 2, end = i < holeIndices.length - 1 ? holeIndices[i + 1] * 2 : data.length;
    const list = linked(data, start, end, false); if (!list) continue;
    if (list === list.next) list.steiner = true;
    queue.push(leftmost(list));
  }
  queue.sort((a, b) => a.x - b.x);
  for (const h of queue) outer = elimHole(h, outer);
  return outer;
}
function elimHole(hole, outer) {
  const bridge = findBridge(hole, outer); if (!bridge) return outer;
  const b2 = splitPoly(bridge, hole);
  filterPts(b2, b2.next);
  return filterPts(bridge, bridge.next);
}
function findBridge(hole, outer) {
  let p = outer, hx = hole.x, hy = hole.y, qx = -Infinity, m = null;
  do {
    if (hy <= p.y && hy >= p.next.y && p.next.y !== p.y) {
      const x = p.x + (hy - p.y) * (p.next.x - p.x) / (p.next.y - p.y);
      if (x <= hx && x > qx) { qx = x; m = p.x < p.next.x ? p : p.next; if (x === hx) return m; }
    }
    p = p.next;
  } while (p !== outer);
  if (!m) return null;
  const stop = m, mx = m.x, my = m.y; let tanMin = Infinity; p = m;
  do {
    if (hx >= p.x && p.x >= mx && hx !== p.x && inTri(hy < my ? hx : qx, hy, mx, my, hy < my ? qx : hx, hy, p.x, p.y)) {
      const tan = Math.abs(hy - p.y) / (hx - p.x);
      if (locInside(p, hole) && (tan < tanMin || (tan === tanMin && (p.x > m.x || (p.x === m.x && sectorIn(m, p)))))) { m = p; tanMin = tan; }
    }
    p = p.next;
  } while (p !== stop);
  return m;
}
const sectorIn = (m, p) => triA(m.prev, m, p.prev) < 0 && triA(p.next, m, m.next) < 0;
function leftmost(start) { let p = start, l = start; do { if (p.x < l.x || (p.x === l.x && p.y < l.y)) l = p; p = p.next; } while (p !== start); return l; }
function inTri(ax, ay, bx, by, cx, cy, px, py) {
  return (cx - px) * (ay - py) >= (ax - px) * (cy - py) && (ax - px) * (by - py) >= (bx - px) * (ay - py) && (bx - px) * (cy - py) >= (cx - px) * (by - py);
}
function validDiag(a, b) {
  return a.next.i !== b.i && a.prev.i !== b.i && !intersectsPoly(a, b) && (locInside(a, b) && locInside(b, a) && midInside(a, b) &&
    (triA(a.prev, a, b.prev) || triA(a, b.prev, b)) || eq(a, b) && triA(a.prev, a, a.next) > 0 && triA(b.prev, b, b.next) > 0);
}
const triA = (p, q, r) => (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y);
const eq = (a, b) => a.x === b.x && a.y === b.y;
function intersects(p1, q1, p2, q2) {
  const o1 = sgn(triA(p1, q1, p2)), o2 = sgn(triA(p1, q1, q2)), o3 = sgn(triA(p2, q2, p1)), o4 = sgn(triA(p2, q2, q1));
  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && onSeg(p1, p2, q1)) return true; if (o2 === 0 && onSeg(p1, q2, q1)) return true;
  if (o3 === 0 && onSeg(p2, p1, q2)) return true; if (o4 === 0 && onSeg(p2, q1, q2)) return true;
  return false;
}
const onSeg = (p, q, r) => q.x <= Math.max(p.x, r.x) && q.x >= Math.min(p.x, r.x) && q.y <= Math.max(p.y, r.y) && q.y >= Math.min(p.y, r.y);
const sgn = n => (n > 0 ? 1 : n < 0 ? -1 : 0);
function intersectsPoly(a, b) {
  let p = a;
  do { if (p.i !== a.i && p.next.i !== a.i && p.i !== b.i && p.next.i !== b.i && intersects(p, p.next, a, b)) return true; p = p.next; } while (p !== a);
  return false;
}
const locInside = (a, b) => (triA(a.prev, a, a.next) < 0 ? triA(a, b, a.next) >= 0 && triA(a, a.prev, b) >= 0 : triA(a, b, a.prev) < 0 || triA(a, a.next, b) < 0);
function midInside(a, b) {
  let p = a, inside = false; const px = (a.x + b.x) / 2, py = (a.y + b.y) / 2;
  do { if (((p.y > py) !== (p.next.y > py)) && p.next.y !== p.y && (px < (p.next.x - p.x) * (py - p.y) / (p.next.y - p.y) + p.x)) inside = !inside; p = p.next; } while (p !== a);
  return inside;
}
function splitPoly(a, b) {
  const a2 = mkNode(a.i, a.x, a.y), b2 = mkNode(b.i, b.x, b.y), an = a.next, bp = b.prev;
  a.next = b; b.prev = a; a2.next = an; an.prev = a2; b2.next = a2; a2.prev = b2; bp.next = b2; b2.prev = bp;
  return b2;
}
function insNode(i, x, y, last) {
  const p = mkNode(i, x, y);
  if (!last) { p.prev = p; p.next = p; } else { p.next = last.next; p.prev = last; last.next.prev = p; last.next = p; }
  return p;
}
function rmNode(p) { p.next.prev = p.prev; p.prev.next = p.next; }
const mkNode = (i, x, y) => ({ i, x, y, prev: null, next: null, steiner: false });
function signedArea(data, start, end) { let s = 0; for (let i = start, j = end - 2; i < end; i += 2) { s += (data[j] - data[i]) * (data[i + 1] + data[j + 1]); j = i; } return s; }

/** triangulate an outer outline (any orientation) with holes; returns { pts: [[u,v]...], tris: [i...] } */
function triangulate(outer, holes = []) {
  const pts = [], flat = [], hi = [];
  for (const p of outer) { pts.push(p); flat.push(p[0], p[1]); }
  for (const h of holes) { hi.push(pts.length); for (const p of h) { pts.push(p); flat.push(p[0], p[1]); } }
  return { pts, tris: earcut(flat, hi) };
}


// inset outline (miter offsets) and validity test for bevelled caps
function insetC(C, ins) {
  const L = C.length, en = [];
  for (let i = 0; i < L; i++) { const a = C[i], c = C[(i + 1) % L]; const dx = c[0] - a[0], dy = c[1] - a[1], l = Math.hypot(dx, dy) || 1; en.push([dy / l, -dx / l]); }
  return C.map((p, i) => { const n1 = en[(i - 1 + L) % L], n2 = en[i], d = n1[0] * n2[0] + n1[1] * n2[1], den = Math.max(1 + d, .18); return [p[0] - (n1[0] + n2[0]) / den * ins, p[1] - (n1[1] + n2[1]) / den * ins]; });
}
function segX(a, b, c, d) {
  const d1 = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]), d2 = (b[0] - a[0]) * (d[1] - a[1]) - (b[1] - a[1]) * (d[0] - a[0]);
  const d3 = (d[0] - c[0]) * (a[1] - c[1]) - (d[1] - c[1]) * (a[0] - c[0]), d4 = (d[0] - c[0]) * (b[1] - c[1]) - (d[1] - c[1]) * (b[0] - c[0]);
  return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0)) && Math.abs(d1) > 1e-14 && Math.abs(d2) > 1e-14 && Math.abs(d3) > 1e-14 && Math.abs(d4) > 1e-14;
}
function insetValid(outer, holes, ins) {
  const o = insetC(outer, ins); if (area(o) <= 0) return false;
  const loops = [o, ...holes.map(h => { const q = insetC(h, ins); return area(q) < 0 ? q : null; })];
  if (loops.some(l => !l)) return false;
  const segs = []; loops.forEach((l, li) => { for (let i = 0; i < l.length; i++) segs.push([l[i], l[(i + 1) % l.length], li, i, l.length]); });
  if (segs.length > 900) return true;   // very dense outlines: trust the author
  for (let a = 0; a < segs.length; a++) for (let b = a + 1; b < segs.length; b++) {
    const A = segs[a], Bq = segs[b];
    if (A[2] === Bq[2] && (Math.abs(A[3] - Bq[3]) <= 1 || Math.abs(A[3] - Bq[3]) === A[4] - 1)) continue;
    if (segX(A[0], A[1], Bq[0], Bq[1])) return false;
  }
  return true;
}
// ------------------------------------------------------------------------------------------------------------------
// mesh-data accumulator (local space of one primitive)
class MD {
  constructor() { this.P = []; this.N = []; this.U = []; this.A = []; this.W = []; this.I = []; this.n = 0; }
  v(p, n, u, v, ao = 1, w = 0) { this.P.push(p[0], p[1], p[2]); this.N.push(n[0], n[1], n[2]); this.U.push(u, v); this.A.push(ao); this.W.push(w); return this.n++; }
  /** triangle, auto-oriented so its front matches the vertex normals (Babylon: clockwise front faces) */
  t(a, b, c) {
    const P = this.P, N = this.N;
    const ux = P[b * 3] - P[a * 3], uy = P[b * 3 + 1] - P[a * 3 + 1], uz = P[b * 3 + 2] - P[a * 3 + 2];
    const wx = P[c * 3] - P[a * 3], wy = P[c * 3 + 1] - P[a * 3 + 1], wz = P[c * 3 + 2] - P[a * 3 + 2];
    const cx = uy * wz - uz * wy, cy = uz * wx - ux * wz, cz = ux * wy - uy * wx;
    if (cx * cx + cy * cy + cz * cz < 1e-22) return;   // degenerate
    const nx = N[a * 3] + N[b * 3] + N[c * 3], ny = N[a * 3 + 1] + N[b * 3 + 1] + N[c * 3 + 1], nz = N[a * 3 + 2] + N[b * 3 + 2] + N[c * 3 + 2];
    if (cx * nx + cy * ny + cz * nz > 0) this.I.push(a, c, b); else this.I.push(a, b, c);
  }
  q(a, b, c, d) { this.t(a, b, c); this.t(a, c, d); }
}

// growable output buffer for one (part, role)
class Buf {
  constructor() { this.p = []; this.n = []; this.uv = []; this.c = []; this.w = []; this.i = []; this.nv = 0; }
  get tris() { return this.i.length / 3; }
}

// ------------------------------------------------------------------------------------------------------------------
// Kit
export class Kit {
  constructor({ lod = 0, wear = 1, seed = 1 } = {}) {
    this.lod = lod; this.wearK = wear; this.seed = seed >>> 0 || 1;
    this.parts = new Map(); this.nodes = {}; this.stack = [I34()];
    this.role = 'rcv'; this.cur = null; this.meta = {};
    this.boxes = null;    // set to [] to record a bounding box per emitted primitive (part-local): clipping tests
    this.warps = [];      // z-stretch warps applied at build(): barrel variants of builders without their own barrel lengths
    this.part('body');
    // segments per 90 degrees for fillets / arcs by LOD, and round-solid segment counts
    this.arcN = [4, 2, 1][lod] || 1;
    this.cull1 = .008; this.cull2 = .03;   // parts smaller than this (m) are dropped at LOD 1 / LOD 2
  }
  /** segment count for a full circle (n at LOD 0) */
  seg(n) { return this.lod === 0 ? n : this.lod === 1 ? Math.max(6, Math.round(n * .36)) : Math.max(4, Math.round(n * .2)); }
  /** detail gate: true when the current LOD shows features of that level (0 = only first person, 1 = LOD 0-1) */
  detail(level = 0) { return this.lod <= level; }
  /** bevel size and segments by LOD */
  bev(b, bs = 2) { return this.lod === 0 ? [b, bs] : this.lod === 1 ? (b >= .0018 ? [b, 1] : [0, 0]) : [0, 0]; }
  sh(pts, fall = mm(1.4)) {
    if (this.lod === 2) pts = pts.map(p => (p[2] && Math.abs(p[2]) < .004 ? [p[0], p[1], 0, p[3]] : p));
    return shape(pts, this.arcN, this.lod === 0 ? fall : 0);
  }
  rnd() { let t = (this.seed = (this.seed + 0x6d2b79f5) | 0); t = Math.imul(t ^ (t >>> 15), 1 | t); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }

  part(name, { pivot, parent, hide, meta } = {}) {
    let P = this.parts.get(name);
    if (!P) {
      const T = this.stack[this.stack.length - 1];
      const pw = pivot ? [T[0] * pivot[0] + T[1] * pivot[1] + T[2] * pivot[2] + T[3], T[4] * pivot[0] + T[5] * pivot[1] + T[6] * pivot[2] + T[7], T[8] * pivot[0] + T[9] * pivot[1] + T[10] * pivot[2] + T[11]] : [0, 0, 0];
      P = { name, pivot: pw, parent: parent || (name === 'body' ? null : 'body'), roles: new Map(), hide: !!hide, meta: meta || null };
      this.parts.set(name, P);
    }
    this.cur = P; return this;
  }
  use(name) { const P = this.parts.get(name); if (!P) throw new Error('gunkit: no part ' + name); this.cur = P; return this; }
  mat(role) { this.role = role; return this; }
  at(o, fn) {
    const T = this.stack[this.stack.length - 1]; this.stack.push(mul(T, trs(o.p, o.r, o.s)));
    try { fn(this); } finally { this.stack.pop(); }
    return this;
  }
  /** named locator: world (gun-local) position + rotation; part = the node it follows (default: current part) */
  node(name, p, r, { part, meta } = {}) {
    const T = mul(this.stack[this.stack.length - 1], trs(p, r));
    this.nodes[name] = { p: [T[3], T[7], T[11]], r: matToEuler(T), part: part || this.cur.name, meta: meta || null };
    return this.nodes[name];
  }
  /** transform a local point by the current stack (for metadata) */
  pt(p) { const T = this.stack[this.stack.length - 1]; return [T[0] * p[0] + T[1] * p[1] + T[2] * p[2] + T[3], T[4] * p[0] + T[5] * p[1] + T[6] * p[2] + T[7], T[8] * p[0] + T[9] * p[1] + T[10] * p[2] + T[11]]; }

  _emit(md, o) {
    if (!md.I.length) return this;
    // distance LODs drop small parts automatically (pins, screws, sight blades, rivets, cartridges...)
    if (this.lod > 0 && !o.keep) {
      let mnx = Infinity, mny = Infinity, mnz = Infinity, mxx = -Infinity, mxy = -Infinity, mxz = -Infinity; const P = md.P;
      for (let k = 0; k < P.length; k += 3) { const x = P[k], y = P[k + 1], z = P[k + 2]; if (x < mnx) mnx = x; if (x > mxx) mxx = x; if (y < mny) mny = y; if (y > mxy) mxy = y; if (z < mnz) mnz = z; if (z > mxz) mxz = z; }
      const T0 = this.stack[this.stack.length - 1], sc = Math.cbrt(Math.abs(nmat(T0).det)) || 1;
      const size = Math.max(mxx - mnx, mxy - mny, mxz - mnz) * sc * (o.s ? (typeof o.s === 'number' ? o.s : Math.max(...o.s)) : 1);
      if (size < (this.lod === 1 ? this.cull1 : this.cull2)) return this;
    }
    const role = o.mat || this.role, P = this.cur;
    let B = P.roles.get(role); if (!B) { B = new Buf(); P.roles.set(role, B); }
    const T = (o.p || o.r || o.s) ? mul(this.stack[this.stack.length - 1], trs(o.p, o.r, o.s)) : this.stack[this.stack.length - 1];
    const { N, det } = nmat(T), flip = det < 0, piv = P.pivot;
    const base = B.nv, ao = o.ao ?? 1, wk = (o.wear ?? 1) * this.wearK;
    for (let k = 0; k < md.n; k++) {
      const x = md.P[k * 3], y = md.P[k * 3 + 1], z = md.P[k * 3 + 2];
      B.p.push(T[0] * x + T[1] * y + T[2] * z + T[3] - piv[0], T[4] * x + T[5] * y + T[6] * z + T[7] - piv[1], T[8] * x + T[9] * y + T[10] * z + T[11] - piv[2]);
      const a = md.N[k * 3], b = md.N[k * 3 + 1], c = md.N[k * 3 + 2];
      let nx = N[0] * a + N[1] * b + N[2] * c, ny = N[3] * a + N[4] * b + N[5] * c, nz = N[6] * a + N[7] * b + N[8] * c;
      if (det < 0) { nx = -nx; ny = -ny; nz = -nz; }
      const l = Math.hypot(nx, ny, nz) || 1; B.n.push(nx / l, ny / l, nz / l);
      B.uv.push(md.U[k * 2], md.U[k * 2 + 1]);
      const g = md.A[k] * ao; B.c.push(g, g, g, 1); B.w.push(Math.min(1, md.W[k] * wk));
    }
    for (let t = 0; t < md.I.length; t += 3) {
      if (flip) B.i.push(base + md.I[t], base + md.I[t + 2], base + md.I[t + 1]);
      else B.i.push(base + md.I[t], base + md.I[t + 1], base + md.I[t + 2]);
    }
    B.nv += md.n;
    if (this.boxes) {
      const ranges = md.bands && md.bands.length ? md.bands : [[0, md.n]];
      for (const [r0, r1] of ranges) {
        let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
        for (let k = (base + r0) * 3; k < (base + r1) * 3; k += 3) { const x = B.p[k], y = B.p[k + 1], z = B.p[k + 2]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; if (z < z0) z0 = z; if (z > z1) z1 = z; }
        if (x0 <= x1) this.boxes.push({ part: P.name, role, min: [x0, y0, z0], max: [x1, y1, z1] });
      }
    }
    return this;
  }
  /** stretch the gun along z after building: z in (z0, z1) scales so z1 moves by ext, z >= z1 shifts by ext. Parts in o.skip and
      vertices below o.yMin (gun space) stay put (magazines, grips). Applies to geometry, part pivots, nodes and meta.sight. */
  warpZ(o) { if (o && o.ext) this.warps.push({ z0: o.z0, z1: o.z1, ext: o.ext, yMin: o.yMin ?? -Infinity, skip: o.skip || [] }); return this; }

  // ----------------------------------------------------------------------------------------------------------------
  /** Extrude a 2D outline. plane: 'zy' (default: side view u = z, v = y, extruded along x, centred), 'xy' (front view,
      extruded along z), 'xz' (top view, extruded along y). o.off = start of the extrusion (default -depth/2).
      o.b = bevel size, o.bs = bevel segments (1 chamfer, 2+ round; LOD reduces), o.bf / o.bb = front / back bevel override,
      o.holes = through holes (outlines), o.recess = [{ pts, d, side: 1 front | -1 back | 0 both, ao }] pockets in the caps,
      o.crease = smoothing angle (deg) along the outline, o.caps = false to leave the caps open, o.w = wear on the bevels,
      o.fall = false skips the two wear fall-off rings next to the bevels (cheaper panels with many holes). */
  extrude(prof, depth, o = {}) {
    const plane = o.plane || 'zy', off = o.off ?? -depth / 2, crease = Math.cos((o.crease ?? 32) * Math.PI / 180);
    let [b, bs] = o.b ? this.bev(o.b, o.bs ?? 2) : [0, 0];
    b = Math.min(b, depth * .45);
    let bF = o.bf !== undefined ? (this.lod > 1 ? 0 : Math.min(o.bf, depth * .45)) : b, bB = o.bb !== undefined ? (this.lod > 1 ? 0 : Math.min(o.bb, depth * .45)) : b;
    const outer = orient(prof, true); if (outer.length < 3) return this;
    const holes = (o.holes || []).map(h => orient(h, false)).filter(h => h.length >= 3);
    // a bevel wider than half a wall makes the inset caps overlap: shrink it until the inset outlines are valid
    const bmax = Math.max(bF, bB);
    if (bmax > 0) { let k = 1; for (let tries = 0; tries < 6 && !insetValid(outer, holes, bmax * k); tries++) k *= .7; if (k < 1) { bF *= k; bB *= k; b *= k; if (bmax * k < 2e-4) { bF = bB = b = 0; } } }
    const md = new MD(), pw = o.pw ?? 1, wEdge = (o.w ?? 1) * Math.min(1, Math.pow(.0012 / Math.max(1e-6, Math.max(bF, bB)), 1.5));
    // axis mapping
    const map = plane === 'zy' ? (u, v, e) => [e, v, u] : plane === 'xy' ? (u, v, e) => [u, v, e] : (u, v, e) => [u, e, v];
    const nmap = plane === 'zy' ? (u, v, e) => [e, v, u] : plane === 'xy' ? (u, v, e) => [u, v, e] : (u, v, e) => [u, e, v];
    const e0 = off, e1 = off + depth;
    // rings: { ins, e, phi, sideSign, w }
    const rings = [];
    const bevelRings = (bb, front) => {
      const out = [], segs = Math.max(1, bs);
      for (let k = 0; k <= segs; k++) {
        const ph = HALF * k / segs, ins = bb * (1 - Math.cos(ph)), e = front ? e1 - bb + bb * Math.sin(ph) : e0 + bb - bb * Math.sin(ph);
        out.push({ ins, e, ph, sgn: front ? 1 : -1, w: wEdge });
      }
      return out;
    };
    if (bB > 0) rings.push(...bevelRings(bB, false).reverse()); else rings.push({ ins: 0, e: e0, ph: 0, sgn: -1, w: 0 });
    const inner0 = e0 + bB, inner1 = e1 - bF, fall = Math.min(Math.max(bB, bF) * 1.6, (inner1 - inner0) / 3);
    if (this.lod === 0 && o.fall !== false && fall > 1e-5 && (bB > 0 || bF > 0)) { rings.push({ ins: 0, e: inner0 + fall, ph: 0, sgn: 0, w: 0 }); rings.push({ ins: 0, e: inner1 - fall, ph: 0, sgn: 0, w: 0 }); }
    if (bF > 0) rings.push(...bevelRings(bF, true)); else rings.push({ ins: 0, e: e1, ph: 0, sgn: 1, w: 0 });
    const round = bs >= 2;
    const contours = [outer, ...holes];
    const capFront = [], capBack = [];
    for (let ci = 0; ci < contours.length; ci++) {
      const C = contours[ci], L = C.length;
      // edge normals (outward of material; same formula for CCW outer and CW holes)
      const en = [];
      for (let i = 0; i < L; i++) { const a = C[i], c = C[(i + 1) % L]; const dx = c[0] - a[0], dy = c[1] - a[1], l = Math.hypot(dx, dy) || 1; en.push([dy / l, -dx / l]); }
      const vinfo = [];
      for (let i = 0; i < L; i++) {
        const n1 = en[(i - 1 + L) % L], n2 = en[i], d = n1[0] * n2[0] + n1[1] * n2[1];
        const den = Math.max(1 + d, .18), mx = (n1[0] + n2[0]) / den, my = (n1[1] + n2[1]) / den;
        const sharp = d < crease, avg = [n1[0] + n2[0], n1[1] + n2[1]], al = Math.hypot(avg[0], avg[1]) || 1;
        vinfo.push({ mx, my, sharp, nIn: sharp ? n1 : [avg[0] / al, avg[1] / al], nOut: sharp ? n2 : [avg[0] / al, avg[1] / al] });
      }
      // arc length for uv
      const sl = [0]; for (let i = 1; i <= L; i++) { const a = C[i - 1], c = C[i % L]; sl.push(sl[i - 1] + Math.hypot(c[0] - a[0], c[1] - a[1])); }
      const posAt = (i, ins) => [C[i][0] - vinfo[i].mx * ins, C[i][1] - vinfo[i].my * ins];
      // bands between consecutive rings
      for (let r = 0; r < rings.length - 1; r++) {
        const R0 = rings[r], R1 = rings[r + 1];
        const flat = !(round && (R0.ph > 0 || R1.ph > 0) && R0.sgn === R1.sgn && R0.sgn !== 0);
        const phMid = (R0.ph + R1.ph) / 2, sgMid = R0.sgn || R1.sgn;
        const nAt = (n2, R) => {
          const ph = flat ? phMid : R.ph, sg = flat ? sgMid : R.sgn, c = Math.cos(ph), s = Math.sin(ph) * (sg || 0);
          return v3.nrm(nmap(n2[0] * c, n2[1] * c, s));
        };
        for (let i = 0; i < L; i++) {
          const j = (i + 1) % L, vi = vinfo[i], vj = vinfo[j];
          const pi0 = posAt(i, R0.ins), pj0 = posAt(j, R0.ins), pi1 = posAt(i, R1.ins), pj1 = posAt(j, R1.ins);
          const ni = vi.nOut, nj = vj.nIn;
          const wi = (C[i][2] || 0) * pw, wj = (C[j][2] || 0) * pw;
          const a = md.v(map(pi0[0], pi0[1], R0.e), nAt(ni, R0), sl[i], R0.e, 1, Math.max(R0.w, wi));
          const bq = md.v(map(pj0[0], pj0[1], R0.e), nAt(nj, R0), sl[i + 1], R0.e, 1, Math.max(R0.w, wj));
          const c = md.v(map(pj1[0], pj1[1], R1.e), nAt(nj, R1), sl[i + 1], R1.e, 1, Math.max(R1.w, wj));
          const d = md.v(map(pi1[0], pi1[1], R1.e), nAt(ni, R1), sl[i], R1.e, 1, Math.max(R1.w, wi));
          md.q(a, bq, c, d);
        }
      }
      const Rb = rings[0], Rf = rings[rings.length - 1];
      capBack.push(C.map((_, i) => posAt(i, Rb.ins))); capFront.push(C.map((_, i) => posAt(i, Rf.ins)));
    }
    if (o.caps !== false) {
      const rec = o.recess || [];
      const doCap = (cont, e, sg) => {
        const myRec = rec.filter(rc => !rc.side || rc.side === sg).map(rc => ({ ...rc, pts: orient(rc.pts, false) }));
        const { pts, tris } = triangulate(cont[0], [...cont.slice(1), ...myRec.map(rc => rc.pts)]);
        const n = nmap(0, 0, sg), base = md.n;
        for (const p of pts) md.v(map(p[0], p[1], e), n, p[0], p[1], 1, o.capW ?? 0);
        for (let t = 0; t < tris.length; t += 3) md.t(base + tris[t], base + tris[t + 1], base + tris[t + 2]);
        for (const rc of myRec) {   // pocket walls + floor
          const C = rc.pts, L = C.length, de = rc.d * sg, aoW = rc.ao ?? .62, aoF = (rc.ao ?? .62) * .78;
          const sl = [0]; for (let i = 1; i <= L; i++) sl.push(sl[i - 1] + Math.hypot(C[i % L][0] - C[i - 1][0], C[i % L][1] - C[i - 1][1]));
          for (let i = 0; i < L; i++) {
            const j = (i + 1) % L, a2 = C[i], c2 = C[j], dx = c2[0] - a2[0], dy = c2[1] - a2[1], l = Math.hypot(dx, dy) || 1;
            const nw = nmap(dy / l, -dx / l, 0);
            const v0 = md.v(map(a2[0], a2[1], e), nw, sl[i], 0, 1, rc.w ?? .6), v1 = md.v(map(c2[0], c2[1], e), nw, sl[i + 1], 0, 1, rc.w ?? .6);
            const v2 = md.v(map(c2[0], c2[1], e - de), nw, sl[i + 1], rc.d, aoW, 0), v3_ = md.v(map(a2[0], a2[1], e - de), nw, sl[i], rc.d, aoW, 0);
            md.q(v0, v1, v2, v3_);
          }
          if (rc.floor !== false) {
            const f = triangulate(C.slice().reverse(), rc.holes || []), fb = md.n;
            for (const p of f.pts) md.v(map(p[0], p[1], e - de), n, p[0], p[1], aoF, 0);
            for (let t = 0; t < f.tris.length; t += 3) md.t(fb + f.tris[t], fb + f.tris[t + 1], fb + f.tris[t + 2]);
          }
        }
      };
      doCap(capFront, rings[rings.length - 1].e, 1);
      doCap(capBack, rings[0].e, -1);
    }
    return this._emit(md, o);
  }

  /** Surface of revolution around the local Z axis (o.axis 'x' / 'y' rotate it). prof = [[r, z, wear?], ...] in order of
      increasing z for an outer surface (normal = (dz, -dr)). o.segs (default 24, LOD-scaled unless o.fixed), o.a0 / o.a1 partial
      sweep, o.crease (deg), o.rmod(theta, z) radial multiplier (flutes, fins), o.flat = faceted around, o.phase = start angle. */
  lathe(prof, o = {}) {
    const segs = o.fixed ? o.segs : this.seg(o.segs || 24), a0 = (o.a0 ?? 0) + (o.phase || 0), a1 = (o.a1 ?? TAU) + (o.phase || 0);
    const full = Math.abs(a1 - a0 - TAU) < 1e-6, crease = Math.cos((o.crease ?? 35) * Math.PI / 180), md = new MD();
    if (this.boxes) md.bands = [];   // one clipping box per profile band
    const P = prof.map(p => [Math.max(0, p[0]), p[1], p[2] || 0]), L = P.length; if (L < 2) return this;
    const rmax = Math.max(...P.map(p => p[0])) || .01;
    // profile segment normals in (r, z)
    const sn = []; for (let i = 0; i < L - 1; i++) { const dr = P[i + 1][0] - P[i][0], dz = P[i + 1][1] - P[i][1], l = Math.hypot(dr, dz) || 1; sn.push([dz / l, -dr / l]); }
    const sl = [0]; for (let i = 1; i < L; i++) sl.push(sl[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
    // runs of smooth segments
    const runs = []; let cur = [0];
    for (let i = 1; i < L - 1; i++) { const d = sn[i - 1][0] * sn[i][0] + sn[i - 1][1] * sn[i][1]; cur.push(i); if (d < crease) { runs.push(cur); cur = [i]; } }
    cur.push(L - 1); runs.push(cur);
    const ang = k => a0 + (a1 - a0) * k / segs;
    for (const run of runs) {
      const rows = [];
      for (let ri = 0; ri < run.length; ri++) {
        const i = run[ri];
        let nr, nz;
        if (ri === 0) [nr, nz] = sn[i]; else if (ri === run.length - 1) [nr, nz] = sn[i - 1];
        else { nr = sn[i - 1][0] + sn[i][0]; nz = sn[i - 1][1] + sn[i][1]; const l = Math.hypot(nr, nz) || 1; nr /= l; nz /= l; }
        if (o.flat2 && ri > 0 && ri < run.length - 1) [nr, nz] = sn[i];
        const row = [];
        for (let k = 0; k <= segs; k++) {
          const a = ang(full && k === segs ? 0 : k), ca = Math.cos(full && k === segs ? a0 : a), sa = Math.sin(full && k === segs ? a0 : a);
          const am = o.flat ? a0 + (a1 - a0) * (k - .5) / segs : 0;
          let r = P[i][0]; if (o.rmod) r *= o.rmod(ang(k), P[i][1]);
          const pos = [r * ca, r * sa, P[i][1]];
          const n = o.flat ? null : [nr * ca, nr * sa, nz];
          row.push({ pos, n, u: (ang(k) - a0) * rmax, v: sl[i], w: P[i][2] });
        }
        rows.push(row);
      }
      if (o.rmod) {   // numeric normals on the deformed grid
        for (let ri = 0; ri < rows.length; ri++) for (let k = 0; k <= segs; k++) {
          const kp = k === segs ? (full ? 1 : segs) : k + 1, km = k === 0 ? (full ? segs - 1 : 0) : k - 1;
          const ta = v3.sub(rows[ri][kp].pos, rows[ri][km].pos);
          const rp = rows[Math.min(rows.length - 1, ri + 1)][k].pos, rm = rows[Math.max(0, ri - 1)][k].pos;
          let tb = v3.sub(rp, rm);
          if (v3.len(tb) < 1e-9) tb = [0, 0, 1];
          const cr = v3.cr(ta, tb); let n = v3.nrm(cr);
          const ref = [sn[run[Math.min(ri, run.length - 2)]][0], sn[run[Math.min(ri, run.length - 2)]][1]];
          const a = ang(k), want = [ref[0] * Math.cos(a), ref[0] * Math.sin(a), ref[1]];
          if (v3.len(cr) < 1e-14) n = v3.nrm(want);          // on the axis (r = 0) the numeric normal degenerates
          else if (v3.dot(n, want) < 0) n = v3.sc(n, -1);
          rows[ri][k].n = n;
        }
      }
      for (let ri = 0; ri < rows.length - 1; ri++) {
        const bandStart = md.n;
        if (md.bands) md.bands.push([bandStart, -1]);
        for (let k = 0; k < segs; k++) {
          const q = [rows[ri][k], rows[ri][k + 1], rows[ri + 1][k + 1], rows[ri + 1][k]];
          if (o.flat) {
            const fa = a0 + (a1 - a0) * (k + .5) / segs, i0 = run[ri], i1 = run[ri + 1];
            const s0 = sn[i0] || sn[i0 - 1]; const fnr = o.flat2 ? sn[i0] : s0; const fn = [fnr[0] * Math.cos(fa) / Math.cos(Math.PI / segs), fnr[0] * Math.sin(fa) / Math.cos(Math.PI / segs), fnr[1]];
            const nn = v3.nrm(fn); const ids = q.map(c => md.v(c.pos, nn, c.u, c.v, 1, c.w)); md.q(ids[0], ids[1], ids[2], ids[3]); void i1;
          } else { const ids = q.map(c => md.v(c.pos, c.n, c.u, c.v, 1, c.w)); md.q(ids[0], ids[1], ids[2], ids[3]); }
        }
        if (md.bands) md.bands[md.bands.length - 1][1] = md.n;
      }
    }
    const ax = o.axis || 'z';
    const rr2 = ax === 'x' ? [0, HALF, 0] : ax === 'y' ? [-HALF, 0, 0] : null;
    if (this.boxes && !md.bands) md.bands = null;
    if (rr2) { return this.at({ p: o.p, r: o.r, s: o.s }, () => this.at({ r: rr2 }, () => this._emit(md, { mat: o.mat, ao: o.ao, wear: o.wear }))); }
    return this._emit(md, o);
  }

  /** tube along a 3D polyline: o.rad radius (or o.rads = [radius per point]), o.segs, o.closed, o.caps (default true), o.sx / o.sy
      elliptical section scale, o.up = initial frame normal hint. */
  sweep(path, o = {}) {
    const segs = this.seg(o.segs || 10), L = path.length, md = new MD(), closed = !!o.closed; if (L < 2) return this;
    const T = [];
    for (let i = 0; i < L; i++) {
      const a = path[closed ? (i - 1 + L) % L : Math.max(0, i - 1)], c = path[closed ? (i + 1) % L : Math.min(L - 1, i + 1)];
      T.push(v3.nrm(v3.sub(c, a)));
    }
    let up = o.up || (Math.abs(T[0][1]) < .9 ? [0, 1, 0] : [1, 0, 0]);
    let Nn = v3.nrm(v3.cr(v3.cr(T[0], up), T[0]));
    const frames = [];
    for (let i = 0; i < L; i++) {
      if (i > 0) { const bb = v3.cr(T[i - 1], T[i]), bl = v3.len(bb); if (bl > 1e-9) { const ax = v3.sc(bb, 1 / bl), an = Math.acos(Math.max(-1, Math.min(1, v3.dot(T[i - 1], T[i])))); Nn = rotAxis(Nn, ax, an); } }
      frames.push({ N: Nn, B: v3.cr(T[i], Nn) });
    }
    const sx = o.sx || 1, sy = o.sy || 1, sl = [0];
    for (let i = 1; i < L; i++) sl.push(sl[i - 1] + v3.len(v3.sub(path[i], path[i - 1])));
    const rows = [];
    for (let i = 0; i < L; i++) {
      const r = o.rads ? o.rads[i] : (o.rad || .002), F = frames[i], row = [];
      for (let k = 0; k <= segs; k++) {
        const a = TAU * k / segs, ca = Math.cos(a) * sx, sa = Math.sin(a) * sy;
        const n = v3.nrm(v3.add(v3.sc(F.N, Math.cos(a) * sy), v3.sc(F.B, Math.sin(a) * sx)));
        const pos = v3.add(path[i], v3.add(v3.sc(F.N, ca * r), v3.sc(F.B, sa * r)));
        row.push(md.v(pos, n, a * r, sl[i], 1, o.w || 0));
      }
      rows.push(row);
    }
    const nr = closed ? L : L - 1;
    for (let i = 0; i < nr; i++) { const A = rows[i], Bq = rows[(i + 1) % L]; for (let k = 0; k < segs; k++) md.q(A[k], A[k + 1], Bq[k + 1], Bq[k]); }
    if (!closed && o.caps !== false) {
      for (const [i, sg] of [[0, -1], [L - 1, 1]]) {
        const n = v3.sc(T[i], sg), c = md.v(path[i], n, 0, 0, 1, 0), ring = [];
        const r = o.rads ? o.rads[i] : (o.rad || .002), F = frames[i];
        for (let k = 0; k < segs; k++) { const a = TAU * k / segs; ring.push(md.v(v3.add(path[i], v3.add(v3.sc(F.N, Math.cos(a) * sx * r), v3.sc(F.B, Math.sin(a) * sy * r))), n, Math.cos(a) * r, Math.sin(a) * r, 1, o.w || 0)); }
        for (let k = 0; k < segs; k++) md.t(c, ring[k], ring[(k + 1) % segs]);
      }
    }
    return this._emit(md, o);
  }

  /** Loft through cross-sections along local +z: secs = [{ z, pts: [[x, y, w?]...], w?, sharp? }] (same point count, CCW seen
      from +z). Corners sharper than o.crease (deg) split normals; a section with sharp: true is a crease ring. o.capB / o.capF
      (default true) close the ends; o.cw = wear on the cap edges. o.axis 'x' | 'y' rotates like lathe. */
  loft(secs, o = {}) {
    const S = secs.length, N = secs[0].pts.length, md = new MD(), crease = Math.cos((o.crease ?? 32) * Math.PI / 180); if (S < 2 || N < 3) return this;
    const P = secs.map(sc => sc.pts.map(p => [p[0], p[1], sc.z]));
    const W = secs.map(sc => sc.pts.map(p => Math.max(p[2] || 0, sc.w || 0)));
    const sharpC = []; for (let i = 0; i < N; i++) { const a = P[0][(i - 1 + N) % N], b = P[0][i], c = P[0][(i + 1) % N]; const e1 = v3.nrm(v3.sub(b, a)), e2 = v3.nrm(v3.sub(c, b)); sharpC.push(v3.dot(e1, e2) < crease); }
    const sharpS = secs.map((sc, k) => k === 0 || k === S - 1 || !!sc.sharp);
    const cen = P.map(row => { let x = 0, y = 0; for (const p of row) { x += p[0]; y += p[1]; } return [x / N, y / N]; });
    const nrmAt = (s, i, side, band) => {   // side: 'out' (edge i->i+1) | 'in' (edge i-1->i); band: index of the band (s..s+1)
      const row = P[s]; let ta;
      if (sharpC[i]) ta = side === 'out' ? v3.sub(row[(i + 1) % N], row[i]) : v3.sub(row[i], row[(i - 1 + N) % N]);
      else ta = v3.sub(row[(i + 1) % N], row[(i - 1 + N) % N]);
      let tz;
      const lo = sharpS[s] ? (s === band ? s : s - 1) : s - 1, hi = sharpS[s] ? (s === band ? s + 1 : s) : s + 1;
      tz = v3.sub(P[Math.min(S - 1, Math.max(0, hi))][i], P[Math.min(S - 1, Math.max(0, lo))][i]);
      if (v3.len(tz) < 1e-12) tz = [0, 0, 1];
      let n = v3.nrm(v3.cr(ta, tz));
      const out = [row[i][0] - cen[s][0], row[i][1] - cen[s][1], 0];
      if (v3.dot(n, out) < 0 && v3.len(out) > 1e-9) n = v3.sc(n, -1);
      return n;
    };
    const sl = [0]; for (let i = 1; i <= N; i++) sl.push(sl[i - 1] + v3.len(v3.sub(P[0][i % N], P[0][i - 1])));
    for (let s = 0; s < S - 1; s++) {
      for (let i = 0; i < N; i++) {
        const j = (i + 1) % N;
        const a = md.v(P[s][i], nrmAt(s, i, 'out', s), sl[i], P[s][i][2], 1, W[s][i]);
        const b = md.v(P[s][j], nrmAt(s, j, 'in', s), sl[i + 1], P[s][j][2], 1, W[s][j]);
        const c = md.v(P[s + 1][j], nrmAt(s + 1, j, 'in', s), sl[i + 1], P[s + 1][j][2], 1, W[s + 1][j]);
        const d = md.v(P[s + 1][i], nrmAt(s + 1, i, 'out', s), sl[i], P[s + 1][i][2], 1, W[s + 1][i]);
        md.q(a, b, c, d);
      }
    }
    for (const [s, sg, on] of [[0, -1, o.capB !== false], [S - 1, 1, o.capF !== false]]) {
      if (!on) continue;
      const pts2 = P[s].map(p => [p[0], p[1]]), { tris } = triangulate(pts2), base = md.n, n = [0, 0, sg];
      for (const p of P[s]) md.v(p, n, p[0], p[1], 1, o.cw ?? 0);
      for (let t = 0; t < tris.length; t += 3) md.t(base + tris[t], base + tris[t + 1], base + tris[t + 2]);
    }
    const ax = o.axis || 'z', rr2 = ax === 'x' ? [0, HALF, 0] : ax === 'y' ? [-HALF, 0, 0] : null;
    if (rr2) return this.at({ p: o.p, r: o.r, s: o.s }, () => this.at({ r: rr2 }, () => this._emit(md, { mat: o.mat, ao: o.ao, wear: o.wear })));
    return this._emit(md, o);
  }

  /** Loft through arbitrary 3D sections: rows = [[[x, y, z, w?], ...], ...] (same count per row, rows in order). Like loft():
      corners sharper than o.crease split normals, rows flagged in o.sharpRows are creases, o.capA / o.capB close the first / last
      row (planar-ish caps, triangulated in their best-fit plane), o.holesA / o.holesB = [{ pts: [[x,y,z]...], d }] cut a hole of
      depth d into that cap (walls only), o.cw = wear on the cap edges, o.uvSwap = texture x along the rows (wood grain lengthwise). */
  loft3(rows, o = {}) {
    const S = rows.length, N = rows[0].length, md = new MD(), crease = Math.cos((o.crease ?? 32) * Math.PI / 180); if (S < 2 || N < 3) return this;
    const P = rows.map(r => r.map(p => [p[0], p[1], p[2]])), W = rows.map(r => r.map(p => p[3] || 0));
    const sharpS = rows.map((_, k) => k === 0 || k === S - 1 || (o.sharpRows || []).includes(k));
    const mid = Math.floor(S / 2), sharpC = [];
    for (let i = 0; i < N; i++) { const a = P[mid][(i - 1 + N) % N], b = P[mid][i], c = P[mid][(i + 1) % N]; sharpC.push(v3.dot(v3.nrm(v3.sub(b, a)), v3.nrm(v3.sub(c, b))) < crease); }
    const cen = P.map(r => { const c = [0, 0, 0]; for (const p of r) { c[0] += p[0]; c[1] += p[1]; c[2] += p[2]; } return v3.sc(c, 1 / N); });
    const nrmAt = (s, i, side, band) => {
      const row = P[s]; let ta;
      if (sharpC[i]) ta = side === 'out' ? v3.sub(row[(i + 1) % N], row[i]) : v3.sub(row[i], row[(i - 1 + N) % N]);
      else ta = v3.sub(row[(i + 1) % N], row[(i - 1 + N) % N]);
      const lo = sharpS[s] ? (s === band ? s : s - 1) : s - 1, hi = sharpS[s] ? (s === band ? s + 1 : s) : s + 1;
      let tz = v3.sub(P[Math.min(S - 1, Math.max(0, hi))][i], P[Math.min(S - 1, Math.max(0, lo))][i]);
      if (v3.len(tz) < 1e-12) tz = v3.sub(cen[Math.min(S - 1, s + 1)], cen[Math.max(0, s - 1)]);
      let n = v3.nrm(v3.cr(ta, tz));
      const out = v3.sub(row[i], cen[s]);
      if (v3.dot(n, out) < 0) n = v3.sc(n, -1);
      return n;
    };
    // texture u around each row from that row's own perimeter (rows of very different size, e.g. a stock's wrist and butt, would
    // otherwise stretch the texture across the big rows), v along the rows from the centroid path
    const slR = P.map(row => { const sl = [0]; for (let i = 1; i <= N; i++) sl.push(sl[i - 1] + v3.len(v3.sub(row[i % N], row[i - 1]))); return sl; });
    const vl = [0]; for (let s = 1; s < S; s++) vl.push(vl[s - 1] + v3.len(v3.sub(cen[s], cen[s - 1])));
    const sw = !!o.uvSwap, vx = (p, n, u, v, w) => (sw ? md.v(p, n, v, u, 1, w) : md.v(p, n, u, v, 1, w));   // uvSwap: texture x along the rows (wood grain lengthwise)
    for (let s = 0; s < S - 1; s++) for (let i = 0; i < N; i++) {
      const j = (i + 1) % N;
      const a = vx(P[s][i], nrmAt(s, i, 'out', s), slR[s][i], vl[s], W[s][i]);
      const b = vx(P[s][j], nrmAt(s, j, 'in', s), slR[s][i + 1], vl[s], W[s][j]);
      const c = vx(P[s + 1][j], nrmAt(s + 1, j, 'in', s), slR[s + 1][i + 1], vl[s + 1], W[s + 1][j]);
      const d = vx(P[s + 1][i], nrmAt(s + 1, i, 'out', s), slR[s + 1][i], vl[s + 1], W[s + 1][i]);
      md.q(a, b, c, d);
    }
    for (const [s, on, holes] of [[0, o.capA !== false, o.holesA], [S - 1, o.capB !== false, o.holesB]]) {
      if (!on) continue;
      const row = P[s];
      let nn = [0, 0, 0]; for (let i = 0; i < N; i++) { const a = row[i], b = row[(i + 1) % N]; nn[0] += (a[1] - b[1]) * (a[2] + b[2]); nn[1] += (a[2] - b[2]) * (a[0] + b[0]); nn[2] += (a[0] - b[0]) * (a[1] + b[1]); }
      nn = v3.nrm(nn); const inward = v3.sub(cen[s === 0 ? 1 : S - 2], cen[s]); if (v3.dot(nn, inward) > 0) nn = v3.sc(nn, -1);
      const ax = Math.abs(nn[0]) > Math.abs(nn[1]) ? (Math.abs(nn[0]) > Math.abs(nn[2]) ? 0 : 2) : (Math.abs(nn[1]) > Math.abs(nn[2]) ? 1 : 2);
      const pr = p => ax === 0 ? [p[1], p[2]] : ax === 1 ? [p[0], p[2]] : [p[0], p[1]];
      const hl = (holes || []).map(h => h.pts);
      const { tris } = triangulate(row.map(pr), hl.map(h => h.map(pr))), base = md.n;
      for (const p of row) md.v(p, nn, pr(p)[0], pr(p)[1], 1, o.cw ?? 0);
      for (const h of hl) for (const p of h) md.v(p, nn, pr(p)[0], pr(p)[1], 1, .5);
      for (let t = 0; t < tris.length; t += 3) md.t(base + tris[t], base + tris[t + 1], base + tris[t + 2]);
      for (const h of holes || []) {   // hole walls going into the solid
        const L = h.pts.length, d = v3.sc(nn, -(h.d || .005)), hc = v3.sc(h.pts.reduce((a, p) => v3.add(a, p), [0, 0, 0]), 1 / L);
        for (let i = 0; i < L; i++) {
          const a = h.pts[i], b = h.pts[(i + 1) % L], na = v3.nrm(v3.sub(hc, a)), nb = v3.nrm(v3.sub(hc, b));
          const v0 = md.v(a, na, i, 0, 1, .4), v1 = md.v(b, nb, i + 1, 0, 1, .4), v2 = md.v(v3.add(b, d), nb, i + 1, 1, h.ao ?? .45, 0), v3i = md.v(v3.add(a, d), na, i, 1, h.ao ?? .45, 0);
          md.q(v0, v1, v2, v3i);
        }
      }
    }
    return this._emit(md, o);
  }

  // ---- shorthands ----
  /** bevelled box centred at o.p (w along x, h along y, d along z) */
  box(w, h, d, o = {}) { return this.extrude(rr(d, h, o.rad || 0, 0, 0, this.arcN), w, { b: o.b ?? Math.min(w, h, d) * .12, bs: o.bs ?? 1, ...o, plane: 'zy' }); }
  /** cylinder along local z from z = 0 to len (o.c = true centres it), o.ch = edge chamfer */
  cyl(r, len, o = {}) {
    const z0 = o.c ? -len / 2 : 0, z1 = z0 + len, ch = Math.min(o.ch ?? r * .12, len * .3, r * .5);
    const prof = ch > 0 && this.lod < 2 ? [[0, z0], [r - ch, z0, 1], [r, z0 + ch, 1], [r, z1 - ch, 1], [r - ch, z1, 1], [0, z1]] : [[0, z0], [r, z0], [r, z1], [0, z1]];
    return this.lathe(prof, o);
  }
  /** tube (pipe) along z: outer ro, inner ri */
  tube(ro, ri, len, o = {}) {
    const z0 = o.c ? -len / 2 : 0, z1 = z0 + len, ch = Math.min(o.ch ?? (ro - ri) * .25, len * .3);
    const prof = this.lod < 2 && ch > 0
      ? [[ri + ch, z0, 1], [ro - ch, z0, 1], [ro, z0 + ch, 1], [ro, z1 - ch, 1], [ro - ch, z1, 1], [ri + ch, z1, 1], [ri, z1 - ch, 1], [ri, z0 + ch, 1], [ri + ch, z0, 1]]
      : [[ri, z0], [ro, z0], [ro, z1], [ri, z1], [ri, z0]];
    return this.lathe(prof, { crease: 30, ...o });
  }
  disc(r, t, o = {}) { return this.cyl(r, t, { c: true, ...o }); }
  sphere(r, o = {}) { const n = Math.max(3, Math.round(this.seg(o.segs || 16) / 2)), prof = []; for (let k = 0; k <= n; k++) { const a = -HALF + Math.PI * k / n; prof.push([Math.cos(a) * r, Math.sin(a) * r]); } return this.lathe(prof, o); }

  /** Picatinny rail along +z from 0 to len, base on y = 0, facing +Y (transform with o.p / o.r). Real 1913 cross-section,
      teeth 5.23 mm slots on a 10.01 mm pitch (o.pitch), chamfered ends. o.w = width scale (1). */
  rail(len, o = {}) {
    const W = mm(21.2) * (o.w || 1), Nk = mm(15.6) * (o.w || 1), Tp = mm(15.2) * (o.w || 1), y1 = mm(2.2), y2 = mm(4.8), y3 = mm(5.9), y4 = mm(9.0);
    const base = [[-Nk / 2, 0], [Nk / 2, 0], [Nk / 2, y1], [W / 2, y2], [W / 2, y3], [-W / 2, y3], [-W / 2, y2], [-Nk / 2, y1]];
    const top = [[-W / 2, y3], [W / 2, y3], [W / 2, y3 + mm(.5)], [Tp / 2, y4], [-Tp / 2, y4], [-W / 2, y3 + mm(.5)]];
    return this.at(o, () => {
      const m = o.mat;
      if (this.lod >= 2) { this.extrude([...base.slice(0, 5), [W / 2, y3 + mm(.5)], [Tp / 2, y4], [-Tp / 2, y4], [-W / 2, y3 + mm(.5)], ...base.slice(5)], len, { plane: 'xy', off: 0, mat: m }); return; }
      this.extrude(base, len, { plane: 'xy', off: 0, b: mm(.5), bs: 1, crease: 20, mat: m });
      const pitch = o.pitch || mm(10.01), tooth = pitch - mm(5.23), n = Math.max(1, Math.floor((len - mm(1)) / pitch));
      const start = (len - (n - 1) * pitch - tooth) / 2;
      if (this.lod === 1) { this.extrude(top, len, { plane: 'xy', off: 0, mat: m }); return; }
      for (let k = 0; k < n; k++) this.extrude(top, tooth, { plane: 'xy', off: start + k * pitch, b: mm(.45), bs: 1, crease: 20, mat: m });
      if (o.marks && this.lod === 0) for (let k = 0; k < n; k += 2) this.box(mm(1.2), mm(.25), mm(.4), { p: [W / 2 - mm(2.2), y3 - mm(.6), start + k * pitch + tooth / 2], b: 0, mat: 'white', ao: .8 });
    });
  }
  /** screw / bolt head facing +local Z (use o.r to orient; o.axis 'x' faces +X), o.d head dia, o.h, o.type 'hex'|'slot'|'torx'|'cross'|'dome' */
  screw(o = {}) {
    const d = o.d || mm(5), h = o.h || mm(1.4), ty = o.type || 'hex', rot = o.axis === 'x' ? [0, HALF, 0] : o.axis === '-x' ? [0, -HALF, 0] : o.axis === 'y' ? [-HALF, 0, 0] : o.axis === '-y' ? [HALF, 0, 0] : o.axis === '-z' ? [0, Math.PI, 0] : [0, 0, 0];
    return this.at({ p: o.p, r: o.r }, () => this.at({ r: rot }, () => {
      if (this.lod >= 2) return;
      const n = this.seg(o.segs || 16), c = circle(d / 2, n);
      if (this.lod === 1 || ty === 'dome') { this.lathe([[0, 0], [d / 2, 0, 1], [d / 2, h * .5, 1], [d * .3, h], [0, h]], { segs: o.segs || 14, mat: o.mat, ao: o.ao }); return; }
      let rec = null;
      if (ty === 'hex') rec = circle(d * .21, 6);
      else if (ty === 'slot') rec = rr(d * .86, d * .16, 0);
      else if (ty === 'torx') { rec = []; for (let k = 0; k < 12; k++) { const a = TAU * k / 12, r = k % 2 ? d * .14 : d * .24; rec.push([Math.cos(a) * r, Math.sin(a) * r]); } }
      else if (ty === 'cross') rec = this.sh([[-d * .3, -d * .07], [-d * .07, -d * .07], [-d * .07, -d * .3], [d * .07, -d * .3], [d * .07, -d * .07], [d * .3, -d * .07], [d * .3, d * .07], [d * .07, d * .07], [d * .07, d * .3], [-d * .07, d * .3], [-d * .07, d * .07], [-d * .3, d * .07]]);
      this.extrude(c, h, { plane: 'xy', off: 0, b: Math.min(h * .45, d * .12), bs: 2, crease: 50, recess: rec ? [{ pts: rec, d: h * .7, side: 1, ao: .5 }] : [], mat: o.mat, ao: o.ao, w: 1.2 });
    }));
  }
  /** cross pin flush with a surface (axis x by default), o.d diameter, o.len visible length (proud of the surface) */
  pin(o = {}) { const d = o.d || mm(3), l = o.len || mm(.6); return this.at({ p: o.p, r: o.r }, () => this.cyl(d / 2, l, { axis: o.axis || 'x', segs: o.segs || 12, ch: d * .18, mat: o.mat, ao: o.ao, c: true })); }
  rivet(o = {}) { return this.screw({ ...o, type: 'dome', h: o.h || (o.d || mm(3)) * .35 }); }
  /** helical spring along +z: o.coil coil radius, o.wire, o.len, o.turns (o.p / o.r place it) */
  spring(o = {}) {
    if (this.lod >= 2) return this;
    const r = o.coil || mm(4), wire = o.wire || mm(.8), len = o.len || mm(40), turns = o.turns || 12, per = this.lod ? 8 : 14, path = [];
    for (let k = 0; k <= turns * per; k++) { const a = TAU * k / per; path.push([Math.cos(a) * r, Math.sin(a) * r, len * k / (turns * per)]); }
    return this.at({ p: o.p, r: o.r }, () => this.sweep(path, { rad: wire / 2, segs: this.lod ? 5 : 7, mat: o.mat || 'spring', w: .3 }));
  }

  // ---- results ----
  stats() {
    let tris = 0, verts = 0; const roles = {};
    for (const P of this.parts.values()) for (const [role, B] of P.roles) { tris += B.tris; verts += B.nv; roles[role] = (roles[role] || 0) + B.tris; }
    return { tris, verts, parts: this.parts.size, roles };
  }
  build() {
    const parts = [];
    for (const W of this.warps) this._warp(W);
    for (const P of this.parts.values()) {
      const roles = {};
      for (const [role, B] of P.roles) {
        if (!B.i.length) continue;
        roles[role] = { p: new Float32Array(B.p), n: new Float32Array(B.n), uv: new Float32Array(B.uv), c: new Float32Array(B.c), w: new Float32Array(B.w), i: new Uint32Array(B.i), tris: B.tris };
      }
      parts.push({ name: P.name, pivot: P.pivot, parent: P.parent, hide: P.hide, meta: P.meta, roles });
    }
    // parent pivots are absolute: convert to positions relative to the parent node
    const byName = new Map(parts.map(p => [p.name, p]));
    for (const p of parts) { const par = p.parent && byName.get(p.parent); p.local = par ? [p.pivot[0] - par.pivot[0], p.pivot[1] - par.pivot[1], p.pivot[2] - par.pivot[2]] : p.pivot.slice(); }
    return { parts, nodes: this.nodes, meta: this.meta, stats: this.stats() };
  }
}
Kit.prototype._warp = function (W) {
  const { z0, z1, ext, yMin, skip } = W, k = (z1 - z0 + ext) / (z1 - z0);
  const fz = z => (z <= z0 ? z : z >= z1 ? z + ext : z0 + (z - z0) * k);
  for (const P of this.parts.values()) {
    if (skip.includes(P.name)) continue;
    const pv = P.pivot, pz = fz(pv[2]);
    for (const B of P.roles.values()) for (let i = 0; i < B.p.length; i += 3) {
      const y = B.p[i + 1] + pv[1]; if (y < yMin) { B.p[i + 2] += pv[2] - pz; continue; }
      const z = B.p[i + 2] + pv[2], z2 = fz(z);
      if (z > z0 && z < z1) { const ni = i; const nz = B.n[ni + 2] / k, l = Math.hypot(B.n[ni], B.n[ni + 1], nz) || 1; B.n[ni] /= l; B.n[ni + 1] /= l; B.n[ni + 2] = nz / l; }
      B.p[i + 2] = z2 - pz;
    }
    pv[2] = pz;
  }
  for (const N of Object.values(this.nodes)) { const P = this.parts.get(N.part); if (P && skip.includes(P.name)) continue; if (N.p[1] >= yMin) N.p[2] = fz(N.p[2]); }
  const sg = this.meta.sight; if (sg) for (const k2 of ['front', 'rear', 'eye']) if (sg[k2] && sg[k2][1] >= yMin) sg[k2] = [sg[k2][0], sg[k2][1], fz(sg[k2][2])];
};
function rotAxis(v, ax, an) {
  const c = Math.cos(an), s = Math.sin(an), d = v3.dot(ax, v), cr = v3.cr(ax, v);
  return v3.nrm([v[0] * c + cr[0] * s + ax[0] * d * (1 - c), v[1] * c + cr[1] * s + ax[1] * d * (1 - c), v[2] * c + cr[2] * s + ax[2] * d * (1 - c)]);
}
// Euler (Babylon YXZ order, matching trs) from the rotation part of a 3x4 (scale-free assumed)
function matToEuler(T) {
  const sx = Math.hypot(T[0], T[4], T[8]) || 1, sy = Math.hypot(T[1], T[5], T[9]) || 1, sz = Math.hypot(T[2], T[6], T[10]) || 1;
  const m12 = T[6] / sz, rx = Math.asin(Math.max(-1, Math.min(1, -m12)));
  let ry, rz;
  if (Math.abs(m12) < .9999) { ry = Math.atan2(T[2] / sz, T[10] / sz); rz = Math.atan2(T[4] / sx, T[5] / sy); }
  else { ry = Math.atan2(-T[8] / sx, T[0] / sx); rz = 0; }
  return [rx, ry, rz];
}
export const KIT_INTERNALS = { trs, mul, matToEuler, triangulate, orient, area };

// ------------------------------------------------------------------------------------------------------------------
// Procedural textures (pure JS pixels; models.js uploads them as RawTextures). All tile seamlessly. Pixels are cached per key.
//   TEX.normal(kind, size) -> { w, h, data: Uint8Array RGBA }   kinds: cast brush poly stipple knurl checker wood rubber fabric
//   TEX.rough(kind, size)  -> ARM-style map (R 1, G roughness multiplier .6-1.15, B 1)   kinds: smudge wood
//   TEX.albedo(kind, size, colors) -> sRGB colour map          kinds: walnut beech laminate + camo patterns (PATTERNS)
//   TEX.noise(size)        -> RGBA noise (wear chips, misc)
export const PATTERNS = ['woodland', 'arid', 'digital', 'tiger', 'splinter', 'arctic', 'carbon', 'urban', 'hex', 'blot'];
function rng32(seed) { let a = seed >>> 0 || 1; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
/** tileable fBm image S x S in [0,1]: P = lattice cells across the tile (x scaled by sx, y by sy; integers keep tiling) */
function fbmImg(S, P, oct, seed, sx = 1, sy = 1, gain = .5) {
  const out = new Float32Array(S * S); let norm = 0;
  for (let k = 0, a = 1; k < oct; k++, a *= gain) {
    norm += a; const px = (P * sx) << k, py = (P * sy) << k, r = rng32(seed + k * 7919), g = new Float32Array(px * py);
    for (let i = 0; i < g.length; i++) g[i] = r();
    const X0 = new Int32Array(S), X1 = new Int32Array(S), U = new Float32Array(S), Y0 = new Int32Array(S), Y1 = new Int32Array(S), W = new Float32Array(S);
    for (let x = 0; x < S; x++) { const f = x / S * px, i0 = Math.floor(f), t = f - i0; X0[x] = i0 % px; X1[x] = (i0 + 1) % px; U[x] = t * t * (3 - 2 * t); }
    for (let y = 0; y < S; y++) { const f = y / S * py, i0 = Math.floor(f), t = f - i0; Y0[y] = (i0 % py) * px; Y1[y] = ((i0 + 1) % py) * px; W[y] = t * t * (3 - 2 * t); }
    for (let y = 0; y < S; y++) {
      const r0 = Y0[y], r1 = Y1[y], v = W[y], o = y * S;
      for (let x = 0; x < S; x++) {
        const A = g[r0 + X0[x]], B = g[r0 + X1[x]], C = g[r1 + X0[x]], D = g[r1 + X1[x]], u = U[x];
        out[o + x] += a * ((A + (B - A) * u) * (1 - v) + (C + (D - C) * u) * v);
      }
    }
  }
  for (let i = 0; i < out.length; i++) out[i] /= norm;
  return out;
}
function heightToNormal(h, S, strength) {
  const out = new Uint8Array(S * S * 4);
  for (let y = 0; y < S; y++) {
    const ym = ((y - 1 + S) % S) * S, yp = ((y + 1) % S) * S, yo = y * S;
    for (let x = 0; x < S; x++) {
      const xm = (x - 1 + S) % S, xp = (x + 1) % S;
      const dx = (h[yo + xp] - h[yo + xm]) * strength, dy = (h[yp + x] - h[ym + x]) * strength;
      const l = Math.sqrt(dx * dx + dy * dy + 1), i = (yo + x) * 4;
      out[i] = (-dx / l * .5 + .5) * 255; out[i + 1] = (-dy / l * .5 + .5) * 255; out[i + 2] = (1 / l * .5 + .5) * 255; out[i + 3] = 255;
    }
  }
  return out;
}
const tri = t => { t -= Math.floor(t); return 1 - Math.abs(t * 2 - 1); };
const sstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export const hex2 = h => { const v = parseInt(String(h).replace('#', ''), 16); return [v >> 16 & 255, v >> 8 & 255, v & 255]; };
const TEXCACHE = new Map();
const cached = (key, fn) => { let v = TEXCACHE.get(key); if (!v) { v = fn(); TEXCACHE.set(key, v); } return v; };
export const TEX = {
  normal(kind, S = 256) { return cached('n:' + kind + S, () => texNormal(kind, S)); },
  rough(kind, S = 256) { return cached('r:' + kind + S, () => texRough(kind, S)); },
  noise(S = 256) { return cached('z' + S, () => { const d = new Uint8Array(S * S * 4), a = fbmImg(S, 16, 4, 81), b = fbmImg(S, 32, 3, 82), c = fbmImg(S, 8, 3, 83), e = fbmImg(S, 64, 2, 84); for (let i = 0; i < S * S; i++) { d[i * 4] = a[i] * 255; d[i * 4 + 1] = b[i] * 255; d[i * 4 + 2] = c[i] * 255; d[i * 4 + 3] = e[i] * 255; } return { w: S, h: S, data: d }; }); },
  albedo(kind, S = 512, colors) { return cached('a:' + kind + S + (colors || []).join(), () => texAlbedo(kind, S, colors)); },
};
function texNormal(kind, S) {
  const h = new Float32Array(S * S); let st = 2;
  if (kind === 'cast') { const f = fbmImg(S, 32, 3, 11), g = fbmImg(S, 128, 1, 12); for (let i = 0; i < S * S; i++) h[i] = f[i] * .6 + g[i] * .9; st = 3.2; }
  else if (kind === 'brush') {
    const f = fbmImg(S, 4, 3, 21), r = rng32(23), lines = new Float32Array(S); for (let y = 0; y < S; y++) lines[y] = r();
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) h[y * S + x] = lines[y] * .5 + lines[(y + 1) % S] * .25 + f[y * S + x] * .5;
    for (let k = 0; k < 40; k++) { const y0 = Math.floor(r() * S), x0 = Math.floor(r() * S), len = 20 + r() * 120, sl = (r() - .5) * .3; for (let t = 0; t < len; t++) { const x = (x0 + t) % S, y = (Math.floor(y0 + t * sl) % S + S) % S; h[y * S + x] -= .6; } }
    st = 2.2;
  }
  else if (kind === 'poly') { const f = fbmImg(S, 24, 3, 31); h.set(f); st = 2.5; }
  else if (kind === 'stipple' || kind === 'rubber') {
    const rub = kind === 'rubber', r = rng32(rub ? 41 : 43), n = Math.round(S * S / (rub ? 22 : 16)), f = fbmImg(S, 16, 2, 44);
    for (let i = 0; i < S * S; i++) h[i] = f[i] * .3;
    for (let k = 0; k < n; k++) {
      const cx = Math.floor(r() * S), cy = Math.floor(r() * S), rad = (rub ? 1.6 : 1.2) + r() * (rub ? 1.6 : 2.2), sg = rub ? 1 : (r() < .7 ? -1 : 1), R = Math.ceil(rad);
      for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) { const d = (dx * dx + dy * dy) / (rad * rad); if (d >= 1) continue; const x = (cx + dx + S) % S, y = (cy + dy + S) % S; h[y * S + x] += sg * (1 - d) * .9; }
    }
    st = rub ? 2.2 : 3.5;
  }
  else if (kind === 'knurl' || kind === 'checker') {
    const n = kind === 'knurl' ? 16 : 10;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const u = x / S * n, v = y / S * n; const m = Math.min(tri(u + v), tri(u - v)); h[y * S + x] = kind === 'checker' ? Math.min(m, .78) : m; }
    st = kind === 'knurl' ? 5 : 4;
  }
  else if (kind === 'wood') { const f = fbmImg(S, 4, 3, 51), g = fbmImg(S, 64, 2, 52, 1, 4); for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const i = y * S + x; h[i] = tri(y / S * 18 + f[i] * 3) * .4 + (g[i] > .64 ? -.8 : 0) + g[i] * .2; } st = 1.6; }
  else if (kind === 'fabric') {
    const n = 48; for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const u = x / S * n, v = y / S * n, cu = Math.floor(u), cv = Math.floor(v), over = (cu + cv) % 2; const a = Math.sin((u - cu) * Math.PI), b = Math.sin((v - cv) * Math.PI); h[y * S + x] = over ? a * .8 + b * .2 : b * .8 + a * .2; }
    st = 2.4;
  }
  else h.set(fbmImg(S, 16, 3, 61));
  return { w: S, h: S, data: heightToNormal(h, S, st * S / 256) };
}
function texRough(kind, S) {
  const d = new Uint8Array(S * S * 4), f = fbmImg(S, kind === 'wood' ? 6 : 5, 4, kind === 'wood' ? 71 : 73), g = fbmImg(S, 48, 2, 74);
  for (let i = 0; i < S * S; i++) {
    const r = kind === 'wood' ? .82 + f[i] * .3 : .72 + sstep(.35, .75, f[i]) * .38 + (g[i] - .5) * .1;
    d[i * 4] = 255; d[i * 4 + 1] = Math.max(0, Math.min(255, r * 220)); d[i * 4 + 2] = 255; d[i * 4 + 3] = 255;
  }
  return { w: S, h: S, data: d };
}
function texAlbedo(kind, S, colors) {
  const d = new Uint8Array(S * S * 4), put = (i, c, k = 1) => { d[i] = Math.min(255, c[0] * k); d[i + 1] = Math.min(255, c[1] * k); d[i + 2] = Math.min(255, c[2] * k); d[i + 3] = 255; };
  if (kind === 'walnut' || kind === 'beech' || kind === 'laminate') {
    const pal = kind === 'walnut' ? ['#1f120a', '#3f2614', '#5a3a22'] : kind === 'beech' ? ['#4c3826', '#6c5238', '#88694a'] : ['#2e1610', '#5c2e1a', '#7e4428'];
    const P = pal.map(hex2), f = fbmImg(S, 3, 4, kind.length * 13), g = fbmImg(S, 48, 2, 91, 1, 6), w = fbmImg(S, 8, 3, 92, 1, 2);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const j = y * S + x, v = y / S; let t;
      if (kind === 'laminate') { const layer = tri(v * 14 + f[j] * .7); t = layer > .5 ? .25 + layer * .2 : .75 + w[j] * .25; }
      else { const ring = tri(v * (kind === 'walnut' ? 9 : 14) + f[j] * 4 + w[j] * .8); t = .38 + ring * .34 + (w[j] - .5) * .36; }
      t = Math.max(0, Math.min(1, t));
      const pore = g[j] > .68 ? .6 : 1, c = t < .5 ? P[0].map((a, k) => a + (P[1][k] - a) * t * 2) : P[1].map((a, k) => a + (P[2][k] - a) * (t - .5) * 2);
      put(j * 4, c, pore * (.92 + (f[j] - .5) * .25));
    }
    return { w: S, h: S, data: d };
  }
  const C = (colors && colors.length ? colors : ['#555555', '#333333', '#777777', '#222222']).map(hex2);
  const f1 = fbmImg(S, 5, 4, 101), f2 = fbmImg(S, 6, 4, 102), f3 = fbmImg(S, 7, 4, 103), fine = fbmImg(S, 64, 1, 104);
  if (kind === 'splinter' || kind === 'urban') {   // Voronoi cells on a coarse grid (sheared for splinter = angular shards)
    const r = rng32(105), G = 8, pts = [];
    for (let gy = 0; gy < G; gy++) for (let gx = 0; gx < G; gx++) pts.push([(gx + r()) / G, (gy + r()) / G, Math.floor(r() * C.length)]);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      let u = x / S, v = y / S; if (kind === 'splinter') { u = (u + v * .375) % 1; }
      const cx = Math.floor(u * G), cy = Math.floor(v * G); let best = 9, bi = 0;
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
        const gx = (cx + ox + G) % G, gy = (cy + oy + G) % G, p = pts[gy * G + gx];
        const px = p[0] + (cx + ox - gx) / G, py = p[1] + (cy + oy - gy) / G;
        const dx = (u - px) * (kind === 'splinter' ? .55 : 1), dy = (v - py) * (kind === 'splinter' ? 1.9 : 1);
        const dd = kind === 'urban' ? Math.max(Math.abs(dx), Math.abs(dy)) : dx * dx + dy * dy;
        if (dd < best) { best = dd; bi = p[2]; }
      }
      let c = C[bi]; const j = y * S + x;
      if (kind === 'splinter' && tri(x / S * 40 + y / S * 15) > .94 && f1[j] > .52) c = C[Math.min(C.length - 1, 1)];
      put(j * 4, c, .97 + (fine[j] - .5) * .08);
    }
    return { w: S, h: S, data: d };
  }
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const j = y * S + x, u = x / S, v = y / S; let c = C[0], k = 1;
    if (kind === 'digital') {
      const q = Math.max(2, Math.round(S / 96)), qj = Math.floor(y / q) * q * S + Math.floor(x / q) * q;
      if (f1[qj] > .54) c = C[1]; if (f2[qj] > .58) c = C[2]; if (C[3] && f3[qj] > .64) c = C[3];
    } else if (kind === 'tiger') {
      const s1 = tri(v * 7 + f1[j] * 2.2 + u), s2 = tri(v * 11 + f2[j] * 3);
      if (s1 > .72) c = C[1]; if (s2 > .82) c = C[2]; if (C[3] && s1 > .9) c = C[3]; k = .96 + (fine[j] - .5) * .1;
    } else if (kind === 'carbon') {
      const n = 64, cu = Math.floor(u * n), cv = Math.floor(v * n), fu = u * n - cu, fv = v * n - cv, o = (cu + cv) % 2;
      c = o ? C[0] : C[1]; k = .55 + (o ? Math.sin(fu * Math.PI) : Math.sin(fv * Math.PI)) * .6;
    } else if (kind === 'hex') {
      const sc = 18, hy = v * sc / .866 * .866 * (1 / .866), row = Math.floor(v * sc), off = row % 2 ? .5 : 0, hx = u * sc + off, col = Math.floor(hx);
      c = C[((row * 31 + col * 17) % 7) % C.length]; const fx = hx - col, fy = v * sc - row; if (fx < .07 || fy < .08) c = C[C.length - 1]; void hy;
    } else {   // woodland arid arctic blot: layered blobs
      if (f1[j] > .55) c = C[1]; if (f2[j] > .6) c = C[2]; if (C[3] && f3[j] > .66) c = C[3]; k = .95 + (fine[j] - .5) * .12;
    }
    put(j * 4, c, k);
  }
  return { w: S, h: S, data: d };
}
