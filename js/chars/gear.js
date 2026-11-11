/* LIVE FIRE — tactical gear made in code, fitted to the Neon Veins human kit (torso / pelvis / head / limb profiles are sampled
   from the kit's own vertices), plus the head variants (balaclava, neck gaiter) and the hands. PURE JS (no BABYLON).
   Everything is plain geometry { p, n, c (RGBA: AO, or the albedo for the FIXED role), i, roles } in BONE space (anim.js frames:
   x right, y up / up the limb, z forward, metres), drawn by human.js as thin instances of the shared character material.
   Exports:
     KIT_PARTS, HEAD_ANCHOR       how the kit parts sit on the anim.js bones (anchor = kit-local point on the bone origin, scale)
     buildGearSet(KD) -> { geos: { key: geo }, listFor(variant, helmetOn) -> [item] }
        item = { geo, bone, anchor?, s?, near? (near LOD only), far? (far LOD only), hand?: 'R'|'L', handKind?: 'grip'|'hold'|'hang' }
     GB                           the geometry builder (rbox, cyl, sphere, surf, strap, build)
     profile(geo, ...)            radial profile sampler (tests) */
import { ROLE } from './kit.js';

// ------------------------------------------------------------------------------------------------ how the kit sits on the bones
export const KIT_PARTS = [
  { key: 'torso', hi: 'torso', lo: 'torso_lo', bone: 'chest', anchor: [0, 0.205, 0.0], s: [0.86, 0.97, 0.93], role: ROLE.TOP },
  { key: 'pelvis', hi: 'pelvis', lo: 'pelvis_lo', bone: 'pelvis', anchor: [0, -0.025, 0.0], s: [0.93, 0.98, 0.95], role: ROLE.BOTTOM },
  { key: 'thighR', hi: 'leg_u', lo: 'leg_u_lo', bone: 'thighR', anchor: [0, 0.22, 0], len: 0.45, s: [0.97, 1, 0.97], role: ROLE.BOTTOM },
  { key: 'thighL', hi: 'leg_u', lo: 'leg_u_lo', bone: 'thighL', anchor: [0, 0.22, 0], len: 0.45, s: [0.97, 1, 0.97], role: ROLE.BOTTOM },
  { key: 'shinR', hi: 'leg_l', lo: 'leg_l_lo', bone: 'shinR', anchor: [0, 0.22, 0], len: 0.41, s: [1, 1, 1], role: ROLE.BOTTOM },
  { key: 'shinL', hi: 'leg_l', lo: 'leg_l_lo', bone: 'shinL', anchor: [0, 0.22, 0], len: 0.41, s: [1, 1, 1], role: ROLE.BOTTOM },
  { key: 'footR', hi: 'foot', lo: 'foot_lo', bone: 'footR', anchor: [0, 0.038, -0.055], s: [1, 1, 1], role: ROLE.BOOT },
  { key: 'footL', hi: 'foot_L', lo: 'foot_L_lo', bone: 'footL', anchor: [0, 0.038, -0.055], s: [1, 1, 1], role: ROLE.BOOT },
  { key: 'uarmR', hi: 'arm_u', lo: 'arm_u_lo', bone: 'uarmR', anchor: [0, 0.16, 0], len: 0.33, s: [0.95, 1, 0.95], role: ROLE.TOP },
  { key: 'uarmL', hi: 'arm_u_L', lo: 'arm_u_L_lo', bone: 'uarmL', anchor: [0, 0.16, 0], len: 0.33, s: [0.95, 1, 0.95], role: ROLE.TOP },
  { key: 'farmR', hi: 'arm_l', lo: 'arm_l_lo', bone: 'farmR', anchor: [0, 0.16, 0], len: 0.34, s: [0.95, 1, 0.95], role: ROLE.TOP },
  { key: 'farmL', hi: 'arm_l_L', lo: 'arm_l_L_lo', bone: 'farmL', anchor: [0, 0.16, 0], len: 0.34, s: [0.95, 1, 0.95], role: ROLE.TOP },
];
export const HEAD_ANCHOR = [0, 0.03, -0.012];      // the kit head's skull centre sits on the head frame origin (hitbox head centre)
export const EYE_Y = 0.012;                        // eye line in head-bone space (y up from the skull centre)

// ------------------------------------------------------------------------------------------------ geometry builder
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export class GB {
  constructor(lod = 0) { this.lod = lod; this.p = []; this.n = []; this.c = []; this.r = []; this.i = []; }
  get nv() { return this.p.length / 3; }
  v(x, y, z, nx, ny, nz, col, role) {
    const ao = 0.8 + 0.2 * (0.5 + 0.5 * ny);           // a little sky occlusion: undersides darker
    this.p.push(x, y, z); this.n.push(nx, ny, nz); this.c.push(col[0] * ao, col[1] * ao, col[2] * ao, 1); this.r.push(role);
    return this.nv - 1;
  }
  t(a, b, c) { this.i.push(a, b, c); }
  /** rounded box centred at (cx, cy, cz), size (w, h, d), edge radius r; o: { role, col, seg, rot: [rx, ry, rz], deform(p) -> p } */
  rbox(cx, cy, cz, w, h, d, r, o = {}) {
    const seg = o.seg != null ? o.seg : this.lod ? 1 : 3;
    const role = o.role ?? ROLE.GEAR, col = o.col || GREY;
    r = Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4); if (r < 0) r = 0;
    const hx = w / 2 - r, hy = h / 2 - r, hz = d / 2 - r;
    // each cube face: an (n+1)^2 grid on the unit cube, mapped to the rounded box; face-local grid with a flat middle
    const n = seg <= 1 ? 1 : seg + 2;
    const rot = o.rot ? rotM(o.rot) : null;
    const faces = [[0, 1, 2, 1], [0, 1, 2, -1], [1, 2, 0, 1], [1, 2, 0, -1], [2, 0, 1, 1], [2, 0, 1, -1]];
    for (const [ax, au, av, sg] of faces) {
      const base = this.nv;
      for (let j = 0; j <= n; j++) for (let k = 0; k <= n; k++) {
        // u, v in [-1, 1], with the edge rows packed toward the border so the flat part stays flat
        const u = gridT(k, n), vv = gridT(j, n);
        const q = [0, 0, 0]; q[ax] = sg; q[au] = sg > 0 ? u : -u; q[av] = vv;
        // point on the inner box + rounding direction
        const ix = clamp(q[0], -1, 1) * hx, iy = clamp(q[1], -1, 1) * hy, iz = clamp(q[2], -1, 1) * hz;
        let dx = q[0] * (hx + r) - ix, dy = q[1] * (hy + r) - iy, dz = q[2] * (hz + r) - iz;
        let dl = Math.hypot(dx, dy, dz);
        let nx, ny, nz;
        if (dl < 1e-7) { nx = ax === 0 ? sg : 0; ny = ax === 1 ? sg : 0; nz = ax === 2 ? sg : 0; dl = 1; dx = nx; dy = ny; dz = nz; }
        nx = dx / dl; ny = dy / dl; nz = dz / dl;
        // for a cube point on a face, the rounding direction comes from how far it is into the edge band
        const ex = Math.abs(q[0]) > 1 - 1e-6 ? q[0] : 0, ey = Math.abs(q[1]) > 1 - 1e-6 ? q[1] : 0, ez = Math.abs(q[2]) > 1 - 1e-6 ? q[2] : 0;
        void ex; void ey; void ez;
        let px = ix + nx * r, py = iy + ny * r, pz = iz + nz * r;
        let P = [px, py, pz], N = [nx, ny, nz];
        if (o.deform) { const res = deformPN(o.deform, P, N); P = res[0]; N = res[1]; }
        if (rot) { P = mulM(rot, P); N = mulM(rot, N); }
        this.v(P[0] + cx, P[1] + cy, P[2] + cz, N[0], N[1], N[2], col, role);
      }
      for (let j = 0; j < n; j++) for (let k = 0; k < n; k++) {
        const a = base + j * (n + 1) + k, b = a + 1, c = a + n + 1, dd = c + 1;
        this.t(a, c, b); this.t(b, c, dd);
      }
    }
    return this;
  }
  /** cylinder (or cone) from point a to point b, radii ra, rb; o: { seg, caps, role, col } */
  cyl(a, b, ra, rb = ra, o = {}) {
    const seg = o.seg || (this.lod ? 6 : 12), role = o.role ?? ROLE.GEAR, col = o.col || GREY;
    let ax = b[0] - a[0], ay = b[1] - a[1], az = b[2] - a[2]; const L = Math.hypot(ax, ay, az) || 1e-6; ax /= L; ay /= L; az /= L;
    let ux = -az, uy = 0, uz = ax; let ul = Math.hypot(ux, uy, uz); if (ul < 1e-4) { ux = 1; uy = 0; uz = 0; ul = 1; } ux /= ul; uy /= ul; uz /= ul;
    const vx = ay * uz - az * uy, vy = az * ux - ax * uz, vz = ax * uy - ay * ux;
    const base = this.nv, slope = (ra - rb) / L;
    for (let s = 0; s <= 1; s++) for (let k = 0; k <= seg; k++) {
      const t = k / seg * Math.PI * 2, c = Math.cos(t), sn = Math.sin(t), r = s ? rb : ra, P = s ? b : a;
      const nx = ux * c + vx * sn, ny = uy * c + vy * sn, nz = uz * c + vz * sn;
      const nl = Math.hypot(nx + ax * slope, ny + ay * slope, nz + az * slope) || 1;
      this.v(P[0] + nx * r, P[1] + ny * r, P[2] + nz * r, (nx + ax * slope) / nl, (ny + ay * slope) / nl, (nz + az * slope) / nl, col, role);
    }
    for (let k = 0; k < seg; k++) { const p0 = base + k, p1 = p0 + 1, q0 = p0 + seg + 1, q1 = q0 + 1; this.t(p0, q0, p1); this.t(p1, q0, q1); }
    if (o.caps !== false) for (const [P, r, sg] of [[a, ra, -1], [b, rb, 1]]) {
      const c0 = this.v(P[0], P[1], P[2], ax * sg, ay * sg, az * sg, col, role), st = this.nv;
      for (let k = 0; k <= seg; k++) { const t = k / seg * Math.PI * 2, c = Math.cos(t), sn = Math.sin(t); this.v(P[0] + (ux * c + vx * sn) * r, P[1] + (uy * c + vy * sn) * r, P[2] + (uz * c + vz * sn) * r, ax * sg, ay * sg, az * sg, col, role); }
      for (let k = 0; k < seg; k++) { if (sg > 0) this.t(c0, st + k + 1, st + k); else this.t(c0, st + k, st + k + 1); }
    }
    return this;
  }
  sphere(c, r, o = {}) {
    const seg = o.seg || (this.lod ? 6 : 10), role = o.role ?? ROLE.GEAR, col = o.col || GREY, sc = o.s || [1, 1, 1];
    return this.surf((u, v) => { const th = u * Math.PI * 2, ph = v * Math.PI; return [c[0] + Math.sin(ph) * Math.sin(th) * r * sc[0], c[1] + Math.cos(ph) * r * sc[1], c[2] + Math.sin(ph) * Math.cos(th) * r * sc[2]]; }, seg * 2, seg, { role, col, out: c });
  }
  /** parametric surface f(u, v) -> [x, y, z], u, v in [0, 1]; normals by finite differences (flip so they point away from o.out if given) */
  surf(f, nu, nv, o = {}) {
    const role = o.role ?? ROLE.GEAR, col = o.col || GREY, base = this.nv, e = 1e-3;
    for (let j = 0; j <= nv; j++) for (let k = 0; k <= nu; k++) {
      const u = k / nu, v = j / nv, P = f(u, v);
      const pu = f(Math.min(1, u + e), v), mu = f(Math.max(0, u - e), v), pv = f(u, Math.min(1, v + e)), mv = f(u, Math.max(0, v - e));
      const du = [pu[0] - mu[0], pu[1] - mu[1], pu[2] - mu[2]], dv = [pv[0] - mv[0], pv[1] - mv[1], pv[2] - mv[2]];
      let n = [du[1] * dv[2] - du[2] * dv[1], du[2] * dv[0] - du[0] * dv[2], du[0] * dv[1] - du[1] * dv[0]];
      let l = Math.hypot(n[0], n[1], n[2]);
      if (l < 1e-12) n = o.out ? [P[0] - o.out[0], P[1] - o.out[1], P[2] - o.out[2]] : [0, 1, 0], l = Math.hypot(n[0], n[1], n[2]) || 1;
      n = [n[0] / l, n[1] / l, n[2] / l];
      if (o.out) { const d = (P[0] - o.out[0]) * n[0] + (P[1] - o.out[1]) * n[1] + (P[2] - o.out[2]) * n[2]; if (d < 0) n = [-n[0], -n[1], -n[2]]; }
      if (o.flip) n = [-n[0], -n[1], -n[2]];
      this.v(P[0], P[1], P[2], n[0], n[1], n[2], o.colAt ? o.colAt(u, v) : col, o.roleAt ? o.roleAt(u, v) : role);
    }
    // winding: make the triangle normal agree with the vertex normals
    const w = nu + 1;
    for (let j = 0; j < nv; j++) for (let k = 0; k < nu; k++) {
      const a = base + j * w + k, b = a + 1, c = a + w, d = c + 1;
      this.quad(a, b, d, c);
    }
    return this;
  }
  /** add the quad a b c d (any winding): oriented so its face normal agrees with the vertex normals */
  quad(a, b, c, d) {
    const P = this.p, N = this.n;
    const e1 = [P[b * 3] - P[a * 3], P[b * 3 + 1] - P[a * 3 + 1], P[b * 3 + 2] - P[a * 3 + 2]], e2 = [P[d * 3] - P[a * 3], P[d * 3 + 1] - P[a * 3 + 1], P[d * 3 + 2] - P[a * 3 + 2]];
    const fn = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const vn = [N[a * 3] + N[c * 3], N[a * 3 + 1] + N[c * 3 + 1], N[a * 3 + 2] + N[c * 3 + 2]];
    // Babylon (left-handed, clockwise front faces): flip relative to the right-handed cross product
    if (fn[0] * vn[0] + fn[1] * vn[1] + fn[2] * vn[2] > 0) { this.t(a, d, c); this.t(a, c, b); } else { this.t(a, b, c); this.t(a, c, d); }
  }
  /** a flat strap (width w, thickness th) along a polyline; up = the strap's face normal hint (or a fn(i) -> vector) */
  strap(pts, w, th, o = {}) {
    const role = o.role ?? ROLE.WEB, col = o.col || GREY, n = pts.length;
    const rows = [];
    for (let k = 0; k < n; k++) {
      const a = pts[Math.max(0, k - 1)], b = pts[Math.min(n - 1, k + 1)];
      let tx = b[0] - a[0], ty = b[1] - a[1], tz = b[2] - a[2]; const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
      let up = typeof o.up === 'function' ? o.up(k, pts[k]) : (o.up || [0, 0, 1]);
      // side = t x up (in the strap plane), normal = side x t
      let sx = ty * up[2] - tz * up[1], sy = tz * up[0] - tx * up[2], sz = tx * up[1] - ty * up[0]; const sl = Math.hypot(sx, sy, sz) || 1; sx /= sl; sy /= sl; sz /= sl;
      const nx = sy * tz - sz * ty, ny = sz * tx - sx * tz, nz = sx * ty - sy * tx;
      rows.push({ P: pts[k], s: [sx, sy, sz], nn: [nx, ny, nz] });
    }
    // four long faces (top, bottom, two sides) as separate rows for crisp normals
    const faces = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (const [fa, fb] of faces) {
      const base = this.nv;
      for (const R of rows) for (const e of [-1, 1]) {
        const off = fa ? [R.nn[0] * th / 2 * fa + R.s[0] * w / 2 * e, R.nn[1] * th / 2 * fa + R.s[1] * w / 2 * e, R.nn[2] * th / 2 * fa + R.s[2] * w / 2 * e]
          : [R.s[0] * w / 2 * fb + R.nn[0] * th / 2 * e, R.s[1] * w / 2 * fb + R.nn[1] * th / 2 * e, R.s[2] * w / 2 * fb + R.nn[2] * th / 2 * e];
        const N = fa ? [R.nn[0] * fa, R.nn[1] * fa, R.nn[2] * fa] : [R.s[0] * fb, R.s[1] * fb, R.s[2] * fb];
        this.v(R.P[0] + off[0], R.P[1] + off[1], R.P[2] + off[2], N[0], N[1], N[2], col, role);
      }
      for (let k = 0; k < n - 1; k++) { const a = base + k * 2, b = a + 1, c = a + 3, d = a + 2; this.quad(a, b, c, d); }
    }
    return this;
  }
  /** append another geo (with roles), optionally transformed by f(p) / its normals */
  add(g, o = {}) {
    const base = this.nv, cnt = g.p.length / 3, role = o.role;
    for (let k = 0; k < cnt; k++) {
      let P = [g.p[k * 3], g.p[k * 3 + 1], g.p[k * 3 + 2]], N = [g.n[k * 3], g.n[k * 3 + 1], g.n[k * 3 + 2]];
      if (o.map) { P = o.map(P); }
      this.p.push(P[0], P[1], P[2]); this.n.push(N[0], N[1], N[2]);
      const c = g.c ? [g.c[k * 4], g.c[k * 4 + 1], g.c[k * 4 + 2], 1] : [1, 1, 1, 1];
      this.c.push(c[0], c[1], c[2], 1);
      this.r.push(o.roleAt ? o.roleAt(P, k) : role != null ? role : (g.roles ? g.roles[k] : 0));
    }
    for (let k = 0; k < g.i.length; k++) this.i.push(g.i[k] + base);
    return this;
  }
  /** winding convention of everything here: the right-handed cross product (b - a) x (c - a) points INTO the surface;
      human.js runs kit.orient() on every geo so it matches Babylon's front faces whatever that convention is */
  build() { return { p: Float32Array.from(this.p), n: Float32Array.from(this.n), c: Float32Array.from(this.c), i: Uint32Array.from(this.i), roles: Float32Array.from(this.r) }; }
}
const GREY = [1, 1, 1];
const gridT = (k, n) => { if (n <= 1) return k ? 1 : -1; if (k === 0) return -1; if (k === n) return 1; if (k === 1) return -1 + 1e-6; if (k === n - 1) return 1 - 1e-6; return -1 + 2 * (k - 1) / (n - 2); };
function rotM(r) {
  const [x, y, z] = r, cx = Math.cos(x), sx = Math.sin(x), cy = Math.cos(y), sy = Math.sin(y), cz = Math.cos(z), sz = Math.sin(z);
  // R = Ry * Rx * Rz (Babylon's yaw-pitch-roll order), applied to column vectors
  return [
    [cy * cz + sy * sx * sz, -cy * sz + sy * sx * cz, sy * cx],
    [cx * sz, cx * cz, -sx],
    [-sy * cz + cy * sx * sz, sy * sz + cy * sx * cz, cy * cx],
  ];
}
const mulM = (M, v) => [M[0][0] * v[0] + M[0][1] * v[1] + M[0][2] * v[2], M[1][0] * v[0] + M[1][1] * v[1] + M[1][2] * v[2], M[2][0] * v[0] + M[2][1] * v[1] + M[2][2] * v[2]];
function deformPN(f, P, N) {
  const e = 1e-4, p0 = f(P);
  const fx = f([P[0] + e, P[1], P[2]]), fy = f([P[0], P[1] + e, P[2]]), fz = f([P[0], P[1], P[2] + e]);
  const J = [[(fx[0] - p0[0]) / e, (fy[0] - p0[0]) / e, (fz[0] - p0[0]) / e], [(fx[1] - p0[1]) / e, (fy[1] - p0[1]) / e, (fz[1] - p0[1]) / e], [(fx[2] - p0[2]) / e, (fy[2] - p0[2]) / e, (fz[2] - p0[2]) / e]];
  // normal transform: cofactor matrix (= det * J^-T)
  const C = [
    [J[1][1] * J[2][2] - J[1][2] * J[2][1], J[1][2] * J[2][0] - J[1][0] * J[2][2], J[1][0] * J[2][1] - J[1][1] * J[2][0]],
    [J[0][2] * J[2][1] - J[0][1] * J[2][2], J[0][0] * J[2][2] - J[0][2] * J[2][0], J[0][1] * J[2][0] - J[0][0] * J[2][1]],
    [J[0][1] * J[1][2] - J[0][2] * J[1][1], J[0][2] * J[1][0] - J[0][0] * J[1][2], J[0][0] * J[1][1] - J[0][1] * J[1][0]],
  ];
  let n = [C[0][0] * N[0] + C[0][1] * N[1] + C[0][2] * N[2], C[1][0] * N[0] + C[1][1] * N[1] + C[1][2] * N[2], C[2][0] * N[0] + C[2][1] * N[1] + C[2][2] * N[2]];
  const l = Math.hypot(n[0], n[1], n[2]) || 1; n = [n[0] / l, n[1] / l, n[2] / l];
  return [p0, n];
}

// ------------------------------------------------------------------------------------------------ fitting: profiles of the kit
/** radial profile of a geo (in the given space mapping) around a vertical axis through (cx, cz): r[yi][ti] = max radius in the
    height band and angle sector (theta 0 = +z forward, increasing toward +x) */
export function profile(geo, map, y0, y1, ny, nt, cx = 0, cz = 0) {
  const r = Array.from({ length: ny }, () => new Float32Array(nt));
  const p = geo.p;
  for (let k = 0; k < p.length; k += 3) {
    const q = map([p[k], p[k + 1], p[k + 2]]);
    const yi = Math.floor((q[1] - y0) / (y1 - y0) * ny); if (yi < 0 || yi >= ny) continue;
    const dx = q[0] - cx, dz = q[2] - cz, th = Math.atan2(dx, dz), ti = ((Math.round(th / (Math.PI * 2) * nt) % nt) + nt) % nt;
    const rr = Math.hypot(dx, dz); if (rr > r[yi][ti]) r[yi][ti] = rr;
  }
  // fill empty sectors from neighbours, then smooth
  for (const row of r) {
    for (let pass = 0; pass < nt; pass++) { let any = false; for (let t = 0; t < nt; t++) if (!row[t]) { const a = row[(t + nt - 1) % nt], b = row[(t + 1) % nt]; if (a || b) { row[t] = Math.max(a, b); any = true; } } if (!any) break; }
    const c = Float32Array.from(row); for (let t = 0; t < nt; t++) row[t] = (c[(t + nt - 1) % nt] + 2 * c[t] + c[(t + 1) % nt]) / 4;
  }
  const f = (y, th) => {
    const fy = clamp((y - y0) / (y1 - y0) * ny - 0.5, 0, ny - 1.001), yi = Math.floor(fy), ty = fy - yi;
    let ft = (th / (Math.PI * 2)) * nt; ft = ((ft % nt) + nt) % nt; const ti = Math.floor(ft), tt = ft - ti, t1 = (ti + 1) % nt;
    const a = r[yi][ti] + (r[yi][t1] - r[yi][ti]) * tt, b = r[Math.min(ny - 1, yi + 1)][ti] + (r[Math.min(ny - 1, yi + 1)][t1] - r[Math.min(ny - 1, yi + 1)][ti]) * tt;
    return a + (b - a) * ty;
  };
  return f;
}
const partMap = P => q => [(q[0] - P.anchor[0]) * P.s[0], (q[1] - P.anchor[1]) * P.s[1], (q[2] - P.anchor[2]) * P.s[2]];

// colours for FIXED-role parts (albedo, sRGB-ish linear-ish 0..1)
const BLACK = [0.05, 0.05, 0.055], DARKG = [0.09, 0.095, 0.1], OLIVE_D = [0.13, 0.14, 0.11];

// ------------------------------------------------------------------------------------------------ the set
export function buildGearSet(KD) {
  const geos = {};
  const PT = Object.fromEntries(KIT_PARTS.map(P => [P.key, P]));
  // torso profile in chest-bone space (origin at the shoulder line)
  const torsoP = profile(KD.torso, partMap(PT.torso), -0.48, 0.2, 34, 48, 0, 0.005);
  const pelvP = profile(KD.pelvis, partMap(PT.pelvis), -0.13, 0.13, 13, 40, 0, 0);
  const headMap = q => [q[0] - HEAD_ANCHOR[0], q[1] - HEAD_ANCHOR[1], q[2] - HEAD_ANCHOR[2]];
  const headP = profile(KD.head_lo, headMap, -0.17, 0.11, 28, 48, 0, -0.012);
  const thighP = profile(KD.leg_u, partMap(PT.thighR), -0.42, 0.02, 22, 24, 0, 0);
  const shinP = profile(KD.leg_l, partMap(PT.shinR), -0.42, 0.06, 24, 24, 0, 0);
  const armP = profile(KD.arm_u, partMap(PT.uarmR), -0.3, 0.05, 14, 24, 0, 0);
  const surfAt = (f, y, th, off = 0) => { const r = f(y, th) + off; return [Math.sin(th) * r, y, Math.cos(th) * r]; };
  const torsoAt = (y, th, off = 0) => { const q = surfAt(torsoP, y, th, off); q[2] += 0.005; return q; };

  for (const lod of [0, 1]) {
    const L = lod ? '_lo' : '';
    // ---------------------------------------------------------------- heads (balaclava / gaiter), roles painted by position
    const headSrc = lod ? KD.head_lo2 : KD.head_lo;
    if (headSrc) for (const face of ['bala', 'gaiter']) {
      const g = new GB(lod);
      g.add(headSrc, {
        map: q => headMap(q),
        roleAt: (P) => {
          const [x, y, z] = P;
          const front = z > 0.035, eye = y > EYE_Y - 0.026 && y < EYE_Y + 0.024 && Math.abs(x) < 0.078 && z > 0.02;
          if (face === 'bala') return eye && front ? ROLE.SKIN : ROLE.MASK;
          // gaiter: mask over the nose, mouth and neck; skin around the eyes and forehead; a buzz cut on the skull
          if (y < EYE_Y - 0.03) return ROLE.MASK;
          if (y > EYE_Y + 0.045 || (z < 0.02 && y > EYE_Y - 0.035)) return z > 0.055 && y < EYE_Y + 0.07 ? ROLE.SKIN : ROLE.HAIR;
          return ROLE.SKIN;
        },
      });
      geos['head_' + face + L] = g.build();
    }
    // ---------------------------------------------------------------- hands: gloves round the weapon (near), fists (far), hanging hands
    if (!lod) {
      geos.glove_grip = KD.glove_grip; geos.glove_grip_L = withRoles(KD.glove_grip_L, KD.glove_grip.roles);
      geos.glove_hold_L = withRoles(KD.glove_hold_L, KD.glove_hold.roles);
      geos.hand_hang = withRole(KD.hand, ROLE.GLOVE); geos.hand_hang_L = withRole(KD.hand_L, ROLE.GLOVE);
    } else {
      const f = new GB(1); f.rbox(0.012, -0.005, 0.0, 0.05, 0.1, 0.085, 0.022, { role: ROLE.GLOVE, seg: 2 }); geos.fist = f.build();
      const f2 = new GB(1); f2.rbox(-0.03, 0.0, 0.0, 0.085, 0.05, 0.1, 0.022, { role: ROLE.GLOVE, seg: 2 }); geos.fist_hold = f2.build();
      geos.hand_hang_lo = withRole(KD.hand_lo, ROLE.GLOVE); geos.hand_hang_L_lo = withRole(KD.hand_L_lo, ROLE.GLOVE);
    }
    // ---------------------------------------------------------------- helmets (head bone)
    for (const kind of ['highcut', 'cover']) {
      const g = new GB(lod);
      helmet(g, headP, kind, lod);
      geos['helm_' + kind + L] = g.build();
    }
    { const g = new GB(lod); cap(g, headP, lod); geos['cap' + L] = g.build(); }
    { const g = new GB(lod); nvg(g, lod); geos['nvg' + L] = g.build(); }
    { const g = new GB(lod); headset(g, headP, lod, false); geos['headset' + L] = g.build(); }
    { const g = new GB(lod); headset(g, headP, lod, true); geos['headset_band' + L] = g.build(); }
    // eyewear
    { const g = new GB(lod); goggles(g, headP, lod); geos['goggles' + L] = g.build(); }
    { const g = new GB(lod); glasses(g, headP, lod); geos['glasses' + L] = g.build(); }
    // ---------------------------------------------------------------- vests (chest bone)
    for (const kind of ['plate', 'rig', 'light']) { const g = new GB(lod); vest(g, torsoAt, torsoP, kind, lod); geos['vest_' + kind + L] = g.build(); }
    for (const kind of ['assault', 'radio', 'hydro']) { const g = new GB(lod); pack(g, torsoAt, kind, lod); geos['pack_' + kind + L] = g.build(); }
    // ---------------------------------------------------------------- belt, holster, knee pads, patches
    { const g = new GB(lod); belt(g, pelvP, lod, 'leg'); geos['belt_leg' + L] = g.build(); }
    { const g = new GB(lod); belt(g, pelvP, lod, 'belt'); geos['belt_hip' + L] = g.build(); }
    { const g = new GB(lod); legHolster(g, thighP, lod); geos['holster_leg' + L] = g.build(); }
    { const g = new GB(lod); kneePad(g, shinP, lod); geos['knee' + L] = g.build(); }
    { const g = new GB(lod); patch(g, armP, lod, 1); geos['patch_R' + L] = g.build(); }
    { const g = new GB(lod); patch(g, armP, lod, -1); geos['patch_L' + L] = g.build(); }
  }

  const cache = new Map();
  function listFor(v, helmetOn) {
    const key = v.id + (helmetOn ? '+' : '-');
    if (cache.has(key)) return cache.get(key);
    const out = [];
    const both = (geo, bone, extra = {}) => { out.push({ geo, bone, near: true, ...extra }); out.push({ geo: geo + '_lo', bone, far: true, ...extra }); };
    both('head_' + v.face, 'head');
    // head gear: helmet (or a cap when the player has no helmet), headset, eyewear, night vision
    const hk = helmetOn ? (v.helmet === 'cap' ? 'cap' : v.helmet) : 'cap';
    if (hk === 'cap') { both('cap', 'head'); both('headset_band', 'head'); }
    else { both('helm_' + hk, 'head'); both('headset', 'head'); if (v.nvg) both('nvg', 'head'); }
    if (v.eyes === 'goggles') both('goggles', 'head'); else if (v.eyes === 'glasses') both('glasses', 'head');
    both('vest_' + v.vest, 'chest');
    if (v.pack) both('pack_' + v.pack, 'chest');
    both(v.holster === 'leg' ? 'belt_leg' : 'belt_hip', 'pelvis');
    if (v.holster === 'leg') both('holster_leg', 'thighR');
    if (v.knee) { both('knee', 'shinR'); both('knee', 'shinL', { s: [-1, 1, 1] }); }
    both('patch_R', 'uarmR'); both('patch_L', 'uarmL');
    // hands
    out.push({ geo: 'glove_grip', bone: 'handR', near: true, hand: 'R', handKind: 'grip' });
    out.push({ geo: 'fist', bone: 'handR', far: true, hand: 'R', handKind: 'grip' });
    out.push({ geo: 'glove_hold_L', bone: 'handL', near: true, hand: 'L', handKind: 'hold' });
    out.push({ geo: 'fist_hold', bone: 'handL', far: true, hand: 'L', handKind: 'hold', s: [-1, 1, 1] });
    out.push({ geo: 'glove_grip_L', bone: 'handL', near: true, hand: 'L', handKind: 'grip' });
    out.push({ geo: 'fist', bone: 'handL', far: true, hand: 'L', handKind: 'grip', s: [-1, 1, 1] });
    out.push({ geo: 'hand_hang', bone: 'handR', near: true, hand: 'R', handKind: 'hang' });
    out.push({ geo: 'hand_hang_lo', bone: 'handR', far: true, hand: 'R', handKind: 'hang' });
    out.push({ geo: 'hand_hang_L', bone: 'handL', near: true, hand: 'L', handKind: 'hang' });
    out.push({ geo: 'hand_hang_L_lo', bone: 'handL', far: true, hand: 'L', handKind: 'hang' });
    cache.set(key, out);
    return out;
  }
  return { geos, listFor, profiles: { torsoP, pelvP, headP, thighP, shinP } };
}
function withRole(g, role) { if (!g) return null; return { ...g, roles: new Float32Array(g.p.length / 3).fill(role) }; }
function withRoles(g, roles) { if (!g) return null; return { ...g, roles: roles || new Float32Array(g.p.length / 3).fill(ROLE.GLOVE) }; }

// ------------------------------------------------------------------------------------------------ pieces
/** helmet shell over the head profile: high-cut (ears free), with rails, shroud, velcro and an ID patch; 'cover' = fabric cover */
function helmet(g, headP, kind, lod) {
  const nu = lod ? 14 : 30, nv = lod ? 5 : 10;
  const cover = kind === 'cover';
  const thick = 0.026;
  // lower edge (polar angle from the top) by azimuth: brow at the front, ear cut-outs at the sides, nape at the back
  const edge = th => { const c = Math.cos(th), s = Math.abs(Math.sin(th)); return 1.18 + 0.12 * (1 - c) * 0.5 - 0.2 * Math.pow(s, 3) * (c > -0.3 ? 1 : 0.4) + 0.32 * Math.max(0, -c) * Math.max(0, -c); };
  const R = (th, ph) => {
    // radius from the head profile at the matching height (plus padding), a bit fuller at the crown
    const y = Math.cos(ph) * 0.11; const base = headP(Math.max(-0.05, y), th);
    return Math.max(0.07, base) + thick + 0.006 * Math.sin(ph);
  };
  const pt = (u, v, rk = 0) => {
    const th = u * Math.PI * 2, ph = v * edge(th);
    const r = R(th, ph) + rk;
    const y = Math.cos(ph) * (r * 1.02) + 0.012;
    return [Math.sin(th) * Math.sin(ph) * r, y, Math.cos(th) * Math.sin(ph) * r - 0.006];
  };
  const shellRole = cover ? ROLE.GEARCAMO : ROLE.SHELL;
  g.surf((u, v) => pt(u, v), nu, nv, { role: shellRole, out: [0, 0, 0] });
  // the rim: a short band turned inward, dark (padding / edge trim)
  g.surf((u, v) => { const a = pt(u, 1), b = pt(u, 1, -0.022); return [a[0] + (b[0] - a[0]) * v, a[1] + (b[1] - a[1]) * v - 0.004 * v, a[2] + (b[2] - a[2]) * v]; }, nu, 1, { role: ROLE.RUBBER, out: [0, 0.3, 0], flip: false });
  if (!lod) g.surf((u, v) => pt(u, 0.25 + v * 0.75, -0.02), nu, 6, { role: ROLE.RUBBER, out: [0, 0, 0], flip: true });
  // side rails (along the lower edge, both sides)
  for (const sd of [-1, 1]) {
    const pts = [];
    for (let k = 0; k <= (lod ? 3 : 7); k++) { const u = (sd > 0 ? 0.17 : 0.83) + (k / (lod ? 3 : 7) - 0.5) * 0.17 * sd; const q = pt(u, 0.83, 0.006); pts.push(q); }
    g.strap(pts, 0.022, 0.009, { role: ROLE.METAL, up: (k, q) => [q[0], 0.2, q[2]] });
  }
  // front shroud (night-vision mount)
  { const q = pt(0, 0.66, 0.004); g.rbox(q[0], q[1] + 0.006, q[2] + 0.006, 0.052, 0.035, 0.016, 0.006, { role: ROLE.METAL, rot: [-0.55, 0, 0] }); }
  // velcro on top and the back + the team ID patch on the back, a counterweight pouch for the night vision
  if (!lod || true) {
    const top = pt(0.5, 0.18, 0.003); g.rbox(top[0], top[1], top[2], 0.07, 0.006, 0.045, 0.003, { role: ROLE.WEB, rot: [0.3, 0, 0] });
    const bk = pt(0.5, 0.6, 0.003); g.rbox(bk[0], bk[1], bk[2], 0.06, 0.04, 0.006, 0.003, { role: ROLE.ACCENT, rot: [-0.7, 0, 0] });
    if (!lod) { const cw = pt(0.5, 0.9, 0.012); g.rbox(cw[0], cw[1], cw[2] - 0.004, 0.075, 0.045, 0.024, 0.008, { role: cover ? ROLE.GEAR : ROLE.GEAR, rot: [-1.05, 0, 0] }); }
  }
  // strobe / light on the left rail
  if (!lod) { const s = pt(0.79, 0.62, 0.012); g.rbox(s[0], s[1], s[2], 0.02, 0.02, 0.03, 0.004, { role: ROLE.PLASTIC }); }
}
/** a peaked cap (no helmet) */
function cap(g, headP, lod) {
  const nu = lod ? 12 : 26, nv = lod ? 4 : 8;
  const pt = (u, v) => { const th = u * Math.PI * 2, ph = v * 1.32; const y = Math.cos(ph) * 0.11; const r = Math.max(0.07, headP(Math.max(-0.04, y), th)) + 0.008; return [Math.sin(th) * Math.sin(ph) * r, Math.cos(ph) * r * 1.0 + 0.004, Math.cos(th) * Math.sin(ph) * r - 0.008]; };
  g.surf(pt, nu, nv, { role: ROLE.GEAR, out: [0, 0, 0] });
  // peak (a curved flat brim at the front)
  g.surf((u, v) => { const th = (u - 0.5) * 1.5; const r = 0.09 + v * 0.07; return [Math.sin(th) * r, 0.034 - v * 0.012 - Math.abs(Math.sin(th)) * 0.006, Math.cos(th) * r - 0.0]; }, lod ? 4 : 10, 1, { role: ROLE.GEAR, out: [0, 1, 0.06] });
  g.surf((u, v) => { const th = (u - 0.5) * 1.5; const r = 0.09 + v * 0.07; return [Math.sin(th) * r, 0.030 - v * 0.012 - Math.abs(Math.sin(th)) * 0.006, Math.cos(th) * r - 0.0]; }, lod ? 4 : 10, 1, { role: ROLE.GEAR, out: [0, -1, 0.06] });
  // ID patch on the front panel
  { const q = pt(0, 0.62); g.rbox(q[0], q[1], q[2] + 0.002, 0.045, 0.03, 0.004, 0.002, { role: ROLE.ACCENT, rot: [-0.8, 0, 0] }); }
}
/** night-vision binocular, flipped up on the shroud */
function nvg(g, lod) {
  const seg = lod ? 6 : 12;
  g.rbox(0, 0.105, 0.085, 0.03, 0.03, 0.03, 0.006, { role: ROLE.METAL, rot: [-0.9, 0, 0] });
  for (const sd of [-1, 1]) {
    const a = [sd * 0.032, 0.12, 0.096], b = [sd * 0.032, 0.17, 0.12];
    g.cyl(a, b, 0.018, 0.02, { seg, role: ROLE.PLASTIC });
    if (!lod) g.cyl(b, [b[0], b[1] + 0.004, b[2] + 0.002], 0.016, 0.016, { seg, role: ROLE.GLASS });
  }
  g.rbox(0, 0.135, 0.105, 0.05, 0.022, 0.03, 0.006, { role: ROLE.PLASTIC, rot: [-1.1, 0, 0] });
}
/** comms headset: ear cups (+ a headband when worn without a helmet), a boom mic on the left */
function headset(g, headP, lod, band) {
  const seg = lod ? 8 : 16;
  for (const sd of [-1, 1]) {
    const th = sd * Math.PI / 2, r = headP(-0.01, th) + 0.008;
    const c = [Math.sin(th) * r, -0.012, -0.012];
    g.cyl(c, [c[0] + sd * 0.032, c[1], c[2]], 0.042, 0.038, { seg, role: ROLE.PLASTIC });
    if (!lod) g.cyl([c[0] + sd * 0.032, c[1], c[2]], [c[0] + sd * 0.036, c[1], c[2]], 0.028, 0.024, { seg, role: ROLE.RUBBER });
    if (sd < 0 && !lod) {
      // boom mic toward the mouth
      const m0 = [c[0] - 0.012, c[1] - 0.02, c[2] + 0.02], m1 = [-0.065, -0.06, 0.07], m2 = [-0.03, -0.072, 0.098];
      g.strap([m0, m1, m2], 0.006, 0.006, { role: ROLE.PLASTIC, up: [1, 0, 0] });
      g.sphere(m2, 0.01, { role: ROLE.RUBBER, seg: 6 });
    }
  }
  if (band) {
    const pts = []; const n = lod ? 5 : 10;
    for (let k = 0; k <= n; k++) { const a = -Math.PI / 2 + Math.PI * k / n; const r = headP(0.06, a) * 0.0 + 0.1; pts.push([Math.sin(a) * r * 1.0, Math.cos(a - Math.PI / 2) * 0 + 0.02 + Math.cos(a) * 0.1, -0.015]); }
    g.strap(pts, 0.018, 0.006, { role: ROLE.PLASTIC, up: (k, q) => [q[0], q[1], 0] });
  }
}
/** goggles: a curved frame round the eyes with a smoked lens and a strap round the head */
function goggles(g, headP, lod) {
  const nu = lod ? 6 : 16, y0 = EYE_Y - 0.026, y1 = EYE_Y + 0.026;
  const at = (u, y, off) => { const th = (u - 0.5) * 2.3; const r = headP(y, th) + off; return [Math.sin(th) * r, y, Math.cos(th) * r - 0.012]; };
  g.surf((u, v) => at(u, y0 + (y1 - y0) * v, 0.022), nu, 1, { role: ROLE.GLASS, out: [0, 0, -0.05] });
  // frame top / bottom (rubber)
  for (const [ya, yb] of [[y1, y1 + 0.009], [y0 - 0.009, y0]]) g.surf((u, v) => at(u, ya + (yb - ya) * v, 0.019), nu, 1, { role: ROLE.RUBBER, out: [0, 0, -0.05] });
  // sides
  for (const u of [0, 1]) { const a = at(u, y0 - 0.009, 0.004), b = at(u, y1 + 0.009, 0.026); g.rbox((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, 0.012, 0.06, 0.03, 0.004, { role: ROLE.RUBBER, rot: [0, (u - 0.5) * 2.3, 0] }); }
  // strap round the back of the head
  const pts = []; const n = lod ? 6 : 14;
  for (let k = 0; k <= n; k++) { const th = 1.15 + (Math.PI * 2 - 2.3) * k / n; const r = headP(EYE_Y + 0.01, th) + 0.012; pts.push([Math.sin(th) * r, EYE_Y + 0.01, Math.cos(th) * r - 0.012]); }
  g.strap(pts, 0.022, 0.004, { role: ROLE.WEB, up: (k, q) => [q[0], 0, q[2] + 0.012] });
}
/** ballistic glasses: one wrap-around smoked lens and thin arms */
function glasses(g, headP, lod) {
  const nu = lod ? 5 : 14, y0 = EYE_Y - 0.02, y1 = EYE_Y + 0.016;
  const at = (u, y, off) => { const th = (u - 0.5) * 2.1; const r = headP(y, th) + off + 0.006 * Math.cos((u - 0.5) * 3); return [Math.sin(th) * r, y + 0.004 * Math.cos((u - 0.5) * 6.28) * 0, Math.cos(th) * r - 0.012]; };
  g.surf((u, v) => at(u, y0 + (y1 - y0) * v, 0.014), nu, 2, { role: ROLE.GLASS, out: [0, 0, -0.05] });
  g.surf((u, v) => at(u, y1 + 0.004 * v, 0.014), nu, 1, { role: ROLE.PLASTIC, out: [0, 0, -0.05] });
  for (const sd of [-1, 1]) {
    const pts = []; for (let k = 0; k <= 4; k++) { const th = sd * (1.05 + 0.5 * k / 4); const r = headP(y1 - 0.004, th) + 0.008; pts.push([Math.sin(th) * r, y1 - 0.004 - k * 0.002, Math.cos(th) * r - 0.012]); }
    g.strap(pts, 0.006, 0.003, { role: ROLE.PLASTIC, up: (k, q) => [q[0], 0, q[2]] });
  }
}
/** plate carrier ('plate'), chest rig over a slick carrier ('rig') or a low-profile carrier ('light') */
function vest(g, torsoAt, torsoP, kind, lod) {
  const seg = lod ? 1 : 2;
  const light = kind === 'light';
  const pT = light ? 0.02 : 0.034;                        // plate bag thickness
  // plate bags: front and back, conforming to the torso (bent round x), shooter's cut at the top corners
  const plate = (front) => {
    const th0 = front ? 0 : Math.PI, yc = -0.215, h = 0.31, w = 0.25;
    const rFront = torsoP(yc, th0);
    const bend = q => {
      // q: plate-local (x across, y up, z outward): wrap round the torso at the plate's height
      const y = yc + q[1], th = th0 + (front ? 1 : -1) * q[0] / Math.max(0.12, rFront);
      const r = Math.max(torsoP(clamp(y, -0.46, 0.17), th), rFront * 0.9) + 0.004 + q[2] + pT / 2;
      // shooter's cut: narrower at the top corners
      return [Math.sin(th) * r, y, Math.cos(th) * r + 0.005];
    };
    const cut = q => { const top = clamp((q[1] - 0.06) / 0.1, 0, 1); return [q[0] * (1 - 0.32 * top * top), q[1], q[2]]; };
    g.rbox(0, 0, 0, w, h, pT, 0.012, { role: ROLE.GEAR, seg, deform: q => bend(cut(q)) });
    return bend;
  };
  const F = plate(true), Bk = plate(false);
  // shoulder straps over the shoulders (front plate top to back plate top)
  for (const sd of [-1, 1]) {
    const pts = [];
    const n = lod ? 4 : 9;
    for (let k = 0; k <= n; k++) {
      const a = k / n, th = sd * 0.42 + (a < 0.5 ? 0 : 0), z0 = Math.cos(Math.PI * a);
      // arc over the shoulder: from the front plate top (y -.07) up to y +.03 at the shoulder and down to the back
      const y = -0.07 + 0.105 * Math.sin(Math.PI * a);
      const thA = a < 0.5 ? sd * 0.38 : Math.PI - sd * 0.38;
      const r = torsoP(clamp(y, -0.46, 0.17), thA) + 0.01 + pT * 0.5;
      const front = [Math.sin(sd * 0.38) * r, y, Math.cos(sd * 0.38) * r];
      const back = [Math.sin(Math.PI - sd * 0.38) * r, y, Math.cos(Math.PI - sd * 0.38) * r];
      const zz = front[2] * (0.5 + 0.5 * z0) + back[2] * (0.5 - 0.5 * z0);
      pts.push([sd * (0.105 + 0.01 * Math.sin(Math.PI * a)), y, zz + 0.006]);
    }
    g.strap(pts, light ? 0.05 : 0.065, 0.012, { role: ROLE.GEAR, up: (k, q) => [q[0] * 0.3, 1, 0] });
  }
  // cummerbund: a band round the sides between the plates
  {
    const y0 = -0.28, n = lod ? 5 : 12;
    for (const sd of [-1, 1]) {
      const pts = [];
      for (let k = 0; k <= n; k++) { const th = sd * (0.55 + (Math.PI - 1.1) * k / n); pts.push(torsoAt(y0, th, 0.012)); }
      g.strap(pts, light ? 0.1 : 0.13, 0.014, { role: ROLE.GEAR, up: (k, q) => [q[0], 0, q[2]] });
      if (!lod && !light) { // side pouch (radio side: left)
        const q = torsoAt(-0.27, sd * 1.5, 0.03);
        g.rbox(q[0], q[1], q[2], 0.04, 0.12, 0.07, 0.01, { role: ROLE.GEAR, rot: [0, sd * 1.5, 0] });
        if (sd < 0) { g.rbox(q[0] - 0.022, q[1] + 0.07, q[2], 0.03, 0.04, 0.05, 0.006, { role: ROLE.PLASTIC }); g.cyl([q[0] - 0.02, q[1] + 0.08, q[2] - 0.012], [q[0] - 0.04, q[1] + 0.34, q[2] - 0.07], 0.004, 0.003, { seg: 5, role: ROLE.PLASTIC }); }
      }
    }
  }
  // front: magazine pouches (rifle mags in a row), admin pouch, ID patch; MOLLE webbing rows
  const fz = (x, y, out = 0) => { const q = F([x, y, out]); return q; };
  if (kind === 'rig') {
    // chest rig: a placard across the front plate with four open mag pouches and an H-harness
    const p0 = fz(0, -0.06, 0.03); g.rbox(p0[0], p0[1], p0[2], 0.3, 0.14, 0.05, 0.012, { role: ROLE.GEAR, seg, deform: q => [q[0], q[1], q[2] - 1.2 * q[0] * q[0]] });
    for (let k = 0; k < 4; k++) {
      const x = -0.105 + k * 0.07, q = fz(x, -0.0, 0.06 - 2.2 * x * x);
      g.rbox(q[0], q[1] + 0.02, q[2], 0.028, 0.05, 0.022, 0.004, { role: ROLE.PLASTIC });
    }
    for (const sd of [-1, 1]) { const a = fz(sd * 0.12, -0.0, 0.05), b = fz(sd * 0.1, 0.13, 0.0); g.strap([a, [b[0], b[1] + 0.02, b[2] - 0.01]], 0.03, 0.006, { role: ROLE.WEB, up: [0, 0, 1] }); }
  } else {
    const n = light ? 2 : 3;
    for (let k = 0; k < n; k++) {
      const x = (k - (n - 1) / 2) * 0.072, q = fz(x, -0.09, 0.024);
      g.rbox(q[0], q[1], q[2], 0.064, 0.11, 0.036, 0.008, { role: ROLE.GEAR, seg });
      // magazine tops + bungee
      if (!lod) { g.rbox(q[0], q[1] + 0.065, q[2] - 0.002, 0.026, 0.03, 0.02, 0.004, { role: ROLE.PLASTIC }); g.rbox(q[0], q[1] + 0.045, q[2] + 0.019, 0.05, 0.008, 0.004, 0.002, { role: ROLE.WEB }); }
    }
    // admin pouch above, with the ID patch
    const a = fz(0, 0.035, 0.012); g.rbox(a[0], a[1], a[2], 0.16, 0.07, 0.024, 0.008, { role: ROLE.GEAR, seg });
    const id = fz(0.04, 0.04, 0.026); g.rbox(id[0], id[1], id[2], 0.06, 0.035, 0.004, 0.002, { role: ROLE.ACCENT });
    if (!lod) { const nm = fz(-0.04, 0.04, 0.026); g.rbox(nm[0], nm[1], nm[2], 0.06, 0.02, 0.003, 0.002, { role: ROLE.WEB }); }
  }
  // MOLLE rows on the back plate, a drag handle, the back ID patch
  if (!lod) for (let r = 0; r < 4; r++) { const y = -0.32 + r * 0.06; const pts = []; for (let k = 0; k <= 6; k++) pts.push(Bk([-0.1 + k * 0.2 / 6, y + 0.16 + 0.0, 0.0015])); g.strap(pts, 0.022, 0.003, { role: ROLE.WEB, up: (k, q) => [q[0], 0, q[2]] }); }
  { const h = Bk([0, 0.17, 0.01]); g.strap([[h[0] - 0.04, h[1] - 0.02, h[2] - 0.004], [h[0] - 0.03, h[1] + 0.012, h[2] - 0.012], [h[0] + 0.03, h[1] + 0.012, h[2] - 0.012], [h[0] + 0.04, h[1] - 0.02, h[2] - 0.004]], 0.025, 0.008, { role: ROLE.WEB, up: [0, 0, -1] }); }
  { const id = Bk([0, 0.07, 0.003]); g.rbox(id[0], id[1], id[2], 0.08, 0.05, 0.004, 0.002, { role: ROLE.ACCENT }); }
}
function pack(g, torsoAt, kind, lod) {
  const seg = lod ? 1 : 2;
  const back = torsoAt(-0.2, Math.PI, 0.05);
  if (kind === 'assault') {
    g.rbox(back[0], back[1] - 0.02, back[2] - 0.075, 0.27, 0.38, 0.13, 0.04, { role: ROLE.GEARCAMO, seg });
    if (!lod) { g.rbox(back[0], back[1] - 0.12, back[2] - 0.15, 0.2, 0.14, 0.04, 0.015, { role: ROLE.GEAR }); for (const sd of [-1, 1]) g.rbox(back[0] + sd * 0.14, back[1], back[2] - 0.07, 0.025, 0.3, 0.08, 0.01, { role: ROLE.WEB }); g.rbox(back[0], back[1] + 0.17, back[2] - 0.08, 0.2, 0.03, 0.1, 0.012, { role: ROLE.WEB }); }
  } else if (kind === 'radio') {
    g.rbox(back[0], back[1] + 0.02, back[2] - 0.05, 0.2, 0.26, 0.09, 0.025, { role: ROLE.GEAR, seg });
    g.rbox(back[0] - 0.05, back[1] + 0.16, back[2] - 0.05, 0.06, 0.04, 0.05, 0.008, { role: ROLE.PLASTIC });
    g.cyl([back[0] - 0.06, back[1] + 0.18, back[2] - 0.05], [back[0] - 0.14, back[1] + 0.85, back[2] - 0.17], 0.005, 0.003, { seg: 5, role: ROLE.PLASTIC });
  } else {
    g.rbox(back[0], back[1] + 0.0, back[2] - 0.035, 0.2, 0.32, 0.05, 0.022, { role: ROLE.GEAR, seg });
    if (!lod) g.cyl([back[0] + 0.07, back[1] + 0.16, back[2] - 0.04], [back[0] + 0.16, back[1] + 0.2, back[2] + 0.12], 0.006, 0.006, { seg: 6, role: ROLE.RUBBER });
  }
}
function belt(g, pelvP, lod, holster) {
  const y = 0.065, n = lod ? 10 : 24, pts = [];
  for (let k = 0; k <= n; k++) { const th = k / n * Math.PI * 2; const r = pelvP(y, th) + 0.012; pts.push([Math.sin(th) * r, y, Math.cos(th) * r]); }
  g.strap(pts, 0.048, 0.012, { role: ROLE.WEB, up: (k, q) => [q[0], 0, q[2]] });
  // buckle
  { const r = pelvP(y, 0) + 0.02; g.rbox(0, y, r, 0.05, 0.04, 0.012, 0.004, { role: ROLE.METAL }); }
  // pouches: a magazine pouch at the left front, a dump pouch at the back left, a small utility pouch at the back right
  const at = (th, off) => { const r = pelvP(y, th) + off; return [Math.sin(th) * r, y, Math.cos(th) * r]; };
  { const q = at(-0.85, 0.03); g.rbox(q[0], q[1] - 0.02, q[2], 0.045, 0.1, 0.035, 0.008, { role: ROLE.GEAR, rot: [0, -0.85, 0] }); }
  { const q = at(-2.3, 0.035); g.rbox(q[0], q[1] - 0.05, q[2], 0.13, 0.13, 0.05, 0.02, { role: ROLE.GEAR, rot: [0, -2.3, 0] }); }
  if (!lod) { const q = at(2.5, 0.03); g.rbox(q[0], q[1] - 0.02, q[2], 0.08, 0.08, 0.035, 0.01, { role: ROLE.GEAR, rot: [0, 2.5, 0] }); }
  if (holster === 'belt') {
    // hip holster on the right side (the pistol model sits in it)
    const q = at(1.35, 0.03);
    g.rbox(q[0] + 0.01, q[1] - 0.06, q[2] - 0.005, 0.04, 0.17, 0.06, 0.012, { role: ROLE.PLASTIC, rot: [0.1, 1.35, 0] });
  }
}
function legHolster(g, thighP, lod) {
  // drop-leg platform on the outside of the right thigh + two leg straps
  const at = (y, th, off) => { const r = thighP(y, th) + off; return [Math.sin(th) * r, y, Math.cos(th) * r]; };
  const q = at(-0.15, 1.45, 0.022);
  g.rbox(q[0], q[1], q[2], 0.03, 0.18, 0.08, 0.012, { role: ROLE.PLASTIC, rot: [0, 1.45, 0] });
  for (const y of [-0.08, -0.21]) { const pts = []; const n = lod ? 8 : 16; for (let k = 0; k <= n; k++) { const th = k / n * Math.PI * 2; pts.push(at(y, th, 0.006)); } g.strap(pts, 0.025, 0.005, { role: ROLE.WEB, up: (k, p) => [p[0], 0, p[2]] }); }
  // hanger to the belt
  { const a = at(0.0, 1.45, 0.02), b = at(-0.07, 1.45, 0.022); g.strap([[a[0], 0.04, a[2]], b], 0.03, 0.006, { role: ROLE.WEB, up: [1, 0, 0] }); }
}
function kneePad(g, shinP, lod) {
  // the knee is at the top of the shin bone (y = 0); a hard cap over a foam pad, a strap behind
  const at = (y, th, off) => { const r = shinP(y, th) + off; return [Math.sin(th) * r, y, Math.cos(th) * r]; };
  const nu = lod ? 5 : 12, nv = lod ? 3 : 6;
  g.surf((u, v) => { const th = (u - 0.5) * 2.1, y = 0.05 - v * 0.15; return at(y, th, 0.022 + 0.012 * Math.sin(Math.PI * u) * Math.sin(Math.PI * v)); }, nu, nv, { role: ROLE.RUBBER, out: [0, -0.03, -0.05] });
  g.surf((u, v) => { const th = (u - 0.5) * 2.4, y = 0.06 - v * 0.17; return at(y, th, 0.01); }, nu, nv, { role: ROLE.GEAR, out: [0, -0.03, -0.05] });
  for (const y of [0.035, -0.08]) { const pts = []; const n = lod ? 6 : 12; for (let k = 0; k <= n; k++) { const th = 1.2 + (Math.PI * 2 - 2.4) * k / n; pts.push(at(y, th, 0.005)); } g.strap(pts, 0.02, 0.004, { role: ROLE.WEB, up: (k, p) => [p[0], 0, p[2]] }); }
}
function patch(g, armP, lod, sd) {
  // the team ID patch on the outside of the upper arm (a curved flat panel), under a velcro field
  const th0 = sd * Math.PI / 2, nu = lod ? 2 : 5;
  const at = (y, th, off) => { const r = armP(y, th) + off; return [Math.sin(th) * r, y, Math.cos(th) * r]; };
  g.surf((u, v) => at(-0.06 - v * 0.065, th0 + (u - 0.5) * 0.9 * sd, 0.004), nu, 1, { role: ROLE.WEB, out: [0, -0.1, 0] });
  g.surf((u, v) => at(-0.07 - v * 0.045, th0 + (u - 0.5) * 0.72 * sd, 0.0065), nu, 1, { role: ROLE.ACCENT, out: [0, -0.1, 0] });
}
