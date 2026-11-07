/* LIVE FIRE — shared prop parts (wheels, bolts, louvres, railings, ladders, handles, corrugated sheet, lamps).
   Exports: wheel, bolts, louvres, railing, ladder, handle, corrugated, grid, lampHead, chairLegs, stackBoxes, PAINTS, pickPaint,
            leg4, cushion, panelLines
   All functions write into a Kit (prop-local space, metres, front = +z). */

/** A road wheel along the local x axis centred at (x, y, z): tyre (rounded profile), rim with spokes, hub, lug nuts.
 *  o: { w = tyre width, rim = rim radius fraction, spokes = 5, rimMat = 'p_alu', tyreMat = 'rubber', side = 1 (+x outward) | -1,
 *       flat = 0..1 (flat tyre squash), none = true (rim only, burnt) } */
export function wheel(K, x, y, z, r, o = {}) {
  const w = o.w || r * .62, side = o.side || 1, rr = r * (o.rim || .62), rimMat = o.rimMat || 'p_alu', tyre = o.tyreMat || 'rubber';
  K.push(x, y, z, 0, 0, -Math.PI / 2 * side);        // lathe axis (local y) -> outward x
  if (!o.none) {
    const sh = w * .18, fl = o.flat || 0, R = r * (1 - fl * .12);
    K.lathe(tyre, [[rr * .98, -w / 2], [R - sh, -w / 2], [R, -w / 2 + sh], [R, w / 2 - sh], [R - sh, w / 2], [rr * .98, w / 2]], { seg: 18, caps: false, sharp: 50 });
    K.lathe(tyre, [[rr * .98, w / 2], [rr * .96, w / 2 - .01]], { seg: 18, caps: false });
  }
  // rim face (dished), barrel, hub
  K.lathe(rimMat, [[rr, w * .42], [rr * .92, w * .38], [rr * .35, w * .3], [rr * .3, w * .4], [0, w * .42]], { seg: 16, caps: false, sharp: 30 });
  K.cyl(o.barrelMat || 'steel_dark', 0, -w * .45, 0, rr * .97, w * .85, { seg: 16, caps: false });
  const n = o.spokes == null ? 5 : o.spokes;
  for (let i = 0; i < n; i++) {
    const a = i * Math.PI * 2 / n;
    K.push(0, w * .36, 0, a, 0, 0);
    K.box(rimMat, 0, -.012, rr * .58, rr * .16, .03, rr * .78, { bev: .006 });
    K.pop();
  }
  for (let i = 0; i < 5; i++) { const a = i * Math.PI * 2 / 5 + .3; K.cyl('p_chrome', Math.cos(a) * rr * .2, w * .42, Math.sin(a) * rr * .2, rr * .035, .018, { seg: 6 }); }
  K.cyl('steel_dark', 0, w * .42, 0, rr * .12, .03, { seg: 10 });
  K.pop();
  return K;
}

/** hex bolt heads on a face: pts = [[x, y, z]], face normal axis 'x'|'y'|'z' (+) */
export function bolts(K, mat, pts, r = .012, axis = 'z', len = .008) {
  for (const p of pts) {
    if (axis === 'y') K.cyl(mat, p[0], p[1], p[2], r, len, { seg: 6 });
    else if (axis === 'z') K.cylZ(mat, p[2], p[2] + len, p[0], p[1], r, { seg: 6 });
    else if (axis === '-z') K.cylZ(mat, p[2] - len, p[2], p[0], p[1], r, { seg: 6 });
    else if (axis === 'x') K.cylX(mat, p[0], p[0] + len, p[1], p[2], r, { seg: 6 });
    else K.cylX(mat, p[0] - len, p[0], p[1], p[2], r, { seg: 6 });
  }
  return K;
}

/** horizontal louvre slats on a vertical face (facing +z by default) centred at (x, y, z), w x h, n slats */
export function louvres(K, mat, x, y, z, w, h, n, o = {}) {
  const ry = o.ry || 0, t = o.t || .004, depth = o.depth || .03;
  K.push(x, y, z, ry);
  K.box(o.back || 'p_plastic_dark', 0, 0, -depth, w, h, .004);
  for (let i = 0; i < n; i++) {
    const yy = (i + .5) * h / n;
    K.push(0, yy, -depth / 2, 0, -.6, 0); K.box(mat, 0, -h / n * .45, 0, w - .004, h / n * .9, t); K.pop();
  }
  K.box(mat, 0, -.005, -.005, w + .02, .012, .02); K.box(mat, 0, h - .007, -.005, w + .02, .012, .02);
  K.box(mat, -w / 2 - .006, 0, -.005, .012, h, .02); K.box(mat, w / 2 + .006, 0, -.005, .012, h, .02);
  K.pop();
  return K;
}

/** a guard railing from (x0, z0) to (x1, z1) at base height y: posts, top rail, knee rail, optional toe board */
export function railing(K, mat, x0, z0, x1, z1, y, o = {}) {
  const h = o.h || 1.1, r = o.r || .022, L = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.ceil(L / (o.span || 1.8)));
  for (let i = 0; i <= n; i++) { const f = i / n; K.cyl(mat, x0 + (x1 - x0) * f, y, z0 + (z1 - z0) * f, r, h, { seg: 8 }); }
  K.tube(mat, [[x0, y + h, z0], [x1, y + h, z1]], r, { seg: 8 });
  K.tube(mat, [[x0, y + h * .5, z0], [x1, y + h * .5, z1]], r * .8, { seg: 6 });
  if (o.toe !== false) {
    const ang = Math.atan2(x1 - x0, z1 - z0);
    K.box(o.toeMat || mat, (x0 + x1) / 2, y, (z0 + z1) / 2, .012, .1, L, { ry: ang });
  }
  return K;
}

/** a fixed ladder: rails at x = +-w/2, rungs every .3 m, from y0 to y0 + h, standing off a wall at z (faces +z) */
export function ladder(K, mat, x, y0, z, h, o = {}) {
  const w = o.w || .45, r = .022;
  K.box(mat, x - w / 2, y0, z, .06, h, .016, { bev: .004 });
  K.box(mat, x + w / 2, y0, z, .06, h, .016, { bev: .004 });
  for (let yy = .3; yy < h - .05; yy += .3) K.cylX(mat, x - w / 2, x + w / 2, y0 + yy, z, r, { seg: 6 });
  if (o.cage && h > 2.6) {
    for (let yy = 2.2; yy < h; yy += .9) K.tube(mat, Array.from({ length: 9 }, (_, i) => { const a = Math.PI * i / 8; return [x + Math.cos(a) * .36, y0 + yy, z + Math.sin(a) * .36 + .02]; }), .012, { seg: 5 });
    for (const a of [.4, 1.57, 2.74]) K.box(mat, x + Math.cos(a) * .36, y0 + 2.2, z + Math.sin(a) * .36 + .02, .03, h - 2.2, .01);
  }
  if (o.standoff) for (let yy = .5; yy < h; yy += 2) for (const s of [-1, 1]) K.box(mat, x + s * w / 2, y0 + yy, z - .08, .04, .04, .16);
  return K;
}

/** a bar handle on a face facing +z at (x, y, z): length L (vertical when o.vert) */
export function handle(K, mat, x, y, z, L, o = {}) {
  const off = o.off || .035, r = o.r || .009;
  if (o.vert) K.tube(mat, [[x, y - L / 2, z], [x, y - L / 2, z + off], [x, y + L / 2, z + off], [x, y + L / 2, z]], r, { seg: 6 });
  else K.tube(mat, [[x - L / 2, y, z], [x - L / 2, y, z + off], [x + L / 2, y, z + off], [x + L / 2, y, z]], r, { seg: 6 });
  return K;
}

/** trapezoid corrugated sheet in the local XY plane... laid out along x from x0 to x1 at depth z (ribs bulge to +z by depth),
 *  vertical extent y0..y1. Built as a thin extrusion (both faces). pitch = rib spacing. o.face = -1 bulges to -z. */
export function corrugated(K, mat, x0, x1, y0, y1, z, o = {}) {
  const pitch = o.pitch || .278, dp = (o.depth || .036) * (o.face || 1), t = o.t || .004;
  const n = Math.max(1, Math.round((x1 - x0) / pitch)), p = (x1 - x0) / n, top = p * .24, side = p * .1;
  const outer = [], inner = [];
  for (let i = 0; i < n; i++) {
    const a = x0 + i * p;
    outer.push([a, 0], [a + side, dp], [a + side + top, dp], [a + 2 * side + top, 0]);
  }
  outer.push([x1, 0]);
  for (let i = outer.length - 1; i >= 0; i--) inner.push([outer[i][0], outer[i][1] - t * (o.face || 1)]);
  const poly = outer.concat(inner).map(q => [q[0], q[1]]);
  // extrude the (x, depth) polygon along y: build in a frame where local y of the polygon = z offset
  K.push(0, y0, z, 0, -Math.PI / 2, 0);   // pitch -90: local +z -> up (+y), local +y -> -z ... (see below)
  // after rx = -90deg: (x, y, z) -> (x, z', ...) : y' = y c - z s = z, z' = y s + z c = -y. So polygon y -> -z: flip the bulge sign
  K.ext(mat, poly.map(q => [q[0], -q[1]]), 0, y1 - y0, { caps: o.caps !== false, smooth: 0 });
  K.pop();
  return K;
}

/** a rectangular grid of round bars (cages, guards): in the plane facing +z centred at (x, y, z) */
export function grid(K, mat, x, y, z, w, h, nx, ny, r = .008) {
  for (let i = 0; i <= nx; i++) { const xx = x - w / 2 + w * i / nx; K.cyl(mat, xx, y, z, r, h, { seg: 5, caps: false }); }
  for (let j = 0; j <= ny; j++) { const yy = y + h * j / ny; K.cylX(mat, x - w / 2, x + w / 2, yy, z, r, { seg: 5, caps: false }); }
  return K;
}

/** four straight legs under a top: footprint w x d, height h, leg size s */
export function leg4(K, mat, w, d, h, s = .04, o = {}) {
  const ix = w / 2 - s / 2 - (o.inset || 0), iz = d / 2 - s / 2 - (o.inset || 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    if (o.round) K.cyl(mat, sx * ix, 0, sz * iz, s / 2, h, { seg: 8, r2: o.taper ? s / 2 * o.taper : undefined });
    else K.box(mat, sx * ix, 0, sz * iz, s, h, s, { bev: Math.min(.006, s * .15) });
  }
  return K;
}

/** a soft cushion (bevelled box, slightly rounded) */
export function cushion(K, mat, x, y, z, w, h, d, o = {}) { return K.box(mat, x, y, z, w, h, d, Object.assign({ bev: Math.min(h * .4, .045) }, o)); }

/** thin dark seam lines on a face facing +z (door gaps, panel joints): list of [x0, y0, x1, y1] in the plane at depth z */
export function panelLines(K, lines, z, o = {}) {
  const mat = o.mat || 'p_plastic_dark', t = o.t || .006;
  for (const [x0, y0, x1, y1] of lines) {
    const L = Math.hypot(x1 - x0, y1 - y0); if (L < 1e-4) continue;
    K.push((x0 + x1) / 2, (y0 + y1) / 2, z, 0, 0, Math.atan2(y1 - y0, x1 - x0));
    K.box(mat, 0, -t / 2, 0, L, t, .004);
    K.pop();
  }
  return K;
}

/** an industrial / street lamp head: emissive lens facing down at local origin */
export function lampHead(K, x, y, z, o = {}) {
  const on = o.on !== false, lens = on ? (o.warm ? 'emissive_warm' : 'emissive_white') : 'p_lens_clear';
  K.push(x, y, z, o.ry || 0);
  K.loft(o.mat || 'p_galv', [
    { z: -.38, pts: [[-.1, 0], [.1, 0], [.12, .06], [-.12, .06]] },
    { z: -.2, pts: [[-.2, -.02], [.2, -.02], [.18, .12], [-.18, .12]] },
    { z: .25, pts: [[-.18, -.02], [.18, -.02], [.15, .1], [-.15, .1]] },
    { z: .35, pts: [[-.1, 0], [.1, 0], [.08, .06], [-.08, .06]] }]);
  K.box(lens, 0, -.035, -.02, .3, .02, .44, { bev: .008 }); K.noCast(lens);
  K.pop();
  return K;
}

/** a pile of boxes (crates / cartons) in a footprint, seeded: returns the pile height */
export function stackBoxes(K, mat, w, d, h, rnd, o = {}) {
  let top = 0;
  const bx = o.bx || .4, bd = o.bd || .3, bh = o.bh || .3, nx = Math.max(1, Math.floor(w / bx)), nz = Math.max(1, Math.floor(d / bd)), ny = Math.max(1, Math.floor(h / bh));
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) for (let k = 0; k < nz; k++) {
    if (j > 0 && rnd() < (o.gap || .12) * j) continue;
    const x = -w / 2 + (i + .5) * w / nx + (rnd() - .5) * .02, z = -d / 2 + (k + .5) * d / nz + (rnd() - .5) * .02;
    const c = .85 + rnd() * .3;
    K.box(mat, x, j * bh, z, w / nx - .012, bh - .004, d / nz - .012, { ry: (rnd() - .5) * .04, bev: .004, col: o.tint ? [c, c * .97, c * .92] : undefined });
    top = Math.max(top, (j + 1) * bh);
  }
  return top;
}

// realistic car paint distribution (white / grey / black / silver dominate)
export const PAINTS = ['white', 'white', 'white', 'silver', 'silver', 'grey', 'grey', 'black', 'black', 'blue', 'red', 'navy', 'green', 'beige', 'brown', 'orange'];
export function pickPaint(r) { return PAINTS[Math.floor(r() * PAINTS.length)]; }
