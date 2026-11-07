/* LIVE FIRE — vegetation and terrain clutter (catalogue for js/maps/props.js): trees (broadleaf, birch, pine, spruce, dead),
   bushes and hedges, tall grass, corn, hay bales, rocks, logs. Foliage = alpha-cut cards from the CC0 foliage atlas
   (assets/models/tex/foliage.jpg: cells 0 broadleaf, 1 dense leaves, 2 grass tuft, 3 conifer branch) with bent normals.
   Bushes, hedges, tall grass and corn get a sight-blocking, non-solid collider tagged 'foliage'.
   Exports: default [prop definitions]. */

const PI = Math.PI, TAU = PI * 2;

function trunkPath(rnd, H, lean = .04) {
  const pts = []; let x = 0, z = 0;
  for (let i = 0; i <= 6; i++) { const t = i / 6; pts.push([x, t * H, z]); x += (rnd() - .5) * H * lean; z += (rnd() - .5) * H * lean; }
  return pts;
}
function radii(n, r0, r1, flare = 1.35) { const r = []; for (let i = 0; i <= n; i++) { const t = i / n; r.push((r0 + (r1 - r0) * t) * (i === 0 ? flare : 1)); } return r; }
/** a canopy of foliage cards in an ellipsoid (centre c, radii R), bent normals from the canopy centre */
function canopy(K, c, R, n, rnd, cells, size, tint, minY = -1e9) {
  for (let i = 0; i < n; i++) {
    // points on / inside the ellipsoid shell, denser near the surface
    const u = rnd() * 2 - 1, a = rnd() * TAU, s = Math.sqrt(1 - u * u), rr = .55 + .45 * Math.sqrt(rnd());
    const dx = Math.cos(a) * s * rr, dy = u * rr, dz = Math.sin(a) * s * rr;
    const x = c[0] + dx * R[0], y = c[1] + dy * R[1], z = c[2] + dz * R[2];
    const sz = size * (.75 + rnd() * .5), k = .8 + rnd() * .35;
    if (y < minY + sz * .42) continue;
    const col = [k * tint[0], k * tint[1], k * tint[2]];
    K.card(x, y, z, sz, sz, cells[Math.floor(rnd() * cells.length)], { ry: rnd() * TAU, rx: (rnd() - .5) * 1.4, rz: (rnd() - .5) * .8, n: [dx, dy * .7 + .45, dz], col });
  }
}
function branch(K, mat, from, dir, len, r0, rnd, segs = 4, droop = 0) {
  const pts = [from]; let p = from.slice(), d = dir.slice();
  for (let i = 1; i <= segs; i++) { d = [d[0] + (rnd() - .5) * .25, d[1] - droop * .15 + (rnd() - .5) * .15, d[2] + (rnd() - .5) * .25]; const l = Math.hypot(...d); d = d.map(v => v / l); p = [p[0] + d[0] * len / segs, p[1] + d[1] * len / segs, p[2] + d[2] * len / segs]; pts.push(p.slice()); }
  K.tube(mat, pts, radii(segs, r0, r0 * .25, 1), { seg: 5 });
  return p;
}
const TREE_H = { oak: 11, birch: 13, pine: 17, spruce: 12, dead: 9, poplar: 15 };
function tree(K, o, v, rnd) {
  const kind = TREE_H[v] ? v : 'oak', H = o.h || TREE_H[kind] * (.85 + rnd() * .3), bark = 'p_bark';
  const barkCol = kind === 'birch' ? [1.75, 1.72, 1.62] : kind === 'pine' ? [1.0, .78, .62] : kind === 'dead' ? [.8, .78, .75] : [1, 1, 1];
  if (kind === 'pine' || kind === 'spruce') {
    const r0 = kind === 'pine' ? H * .016 : H * .018, path = trunkPath(rnd, H, .01);
    K.tube(bark, path, radii(6, r0, r0 * .15), { seg: 8, col: barkCol });
    const y0 = kind === 'pine' ? H * .45 : 1.5, top = H * 1.0;
    for (let y = y0; y < top - .3; y += kind === 'pine' ? .5 : .36) {
      const t = (y - y0) / (top - y0), R = kind === 'pine' ? (1 - t) * 2.4 + .6 + (t < .2 ? -t * 2 : 0) : (1 - t) * H * .26 + .35, n = kind === 'pine' ? 6 : 8;
      const a0 = rnd() * TAU;
      for (let k = 0; k < n; k++) {
        const a = a0 + k * TAU / n + (rnd() - .5) * .4, len = R * (.75 + rnd() * .4);
        if (kind === 'pine' && rnd() < .15) continue;
        const droop = (kind === 'spruce' ? .35 : .2) + t * .15 + rnd() * .15;
        const cx = Math.sin(a) * len / 2, cz = Math.cos(a) * len / 2, cy = y - Math.sin(droop) * len / 2;
        const shade = (.62 + .38 * t + rnd() * .15) * 1.3, col = [shade * .92, shade, shade * .85];
        // two cards per branch: one lying almost flat (seen from above / below), one standing in the branch's vertical plane
        // (seen from the side), both drooping toward the tip: a full silhouette from every direction
        const cyc = Math.max(cy, Math.sin(droop) * len / 2 + len * .3 + .05);   // keep the lowest boughs off the ground
        K.card(cx, cyc, cz, len, len * .6, 3, { ry: a - PI / 2, rx: PI / 2 - .3 - rnd() * .2, rz: -droop, n: [Math.sin(a), .75, Math.cos(a)], col });
        K.card(cx, cyc, cz, len, len * .5, 3, { ry: a - PI / 2, rx: (rnd() - .5) * .5, rz: -droop, n: [Math.sin(a) * 1.2, .35, Math.cos(a) * 1.2], col });
        if (kind === 'pine') branch(K, bark, [0, y, 0], [Math.sin(a), .1, Math.cos(a)], len * .8, .035, rnd, 2, .5);
      }
    }
    for (let k = 0; k < 3; k++) K.card(0, top - .4, 0, .9, 1.4, 3, { ry: k * PI / 3, rz: PI / 2, n: [0, 1, 0], col: [.9, 1, .9] });
    K.ccyl(0, 0, 0, Math.max(.15, r0), Math.min(H * .6, 6), { surf: 'wood' });
    K.hide(0, 0, -1.2, 'bush', .7);
    return;
  }
  // broadleaf / birch / poplar / dead: trunk + scaffold branches + canopy clusters at the branch tips
  const r0 = kind === 'birch' ? H * .014 : kind === 'poplar' ? H * .018 : H * .028, Ht = kind === 'poplar' ? H * .2 : kind === 'birch' ? H * .35 : H * .38;
  const path = trunkPath(rnd, Ht + H * .15, .03);
  K.tube(bark, path, radii(6, r0, r0 * .6), { seg: 10, col: barkCol });
  const top = path[path.length - 1], tips = [];
  const nb = kind === 'dead' ? 7 : kind === 'poplar' ? 8 : 6;
  for (let i = 0; i < nb; i++) {
    const a = i * TAU / nb + rnd() * .5, up = kind === 'poplar' ? 2.8 : kind === 'birch' ? 1.6 : .9 + rnd() * .5;
    const y = Ht * (.75 + rnd() * .35);
    const from = [path[3][0] * (y / Ht), y, path[3][2] * (y / Ht)];
    const len = (kind === 'poplar' ? H * .35 : H * .38) * (.7 + rnd() * .4);
    const tip = branch(K, bark, from, [Math.sin(a), up, Math.cos(a)], len, r0 * .5, rnd, 4, kind === 'birch' ? .4 : 0);
    tips.push(tip);
    if (kind === 'dead' || rnd() < .6) for (let j = 0; j < 2; j++) { const b2 = branch(K, bark, tip, [Math.sin(a + (rnd() - .5) * 2), .6 + rnd(), Math.cos(a + (rnd() - .5) * 2)], len * .45, r0 * .2, rnd, 3); if (kind === 'dead') branch(K, bark, b2, [rnd() - .5, .8, rnd() - .5], len * .25, r0 * .08, rnd, 2); }
  }
  if (kind !== 'dead') {
    const tint = kind === 'birch' ? [.95, 1.05, .8] : [.95, 1, .92];
    const cRad = kind === 'poplar' ? [H * .14, H * .38, H * .14] : kind === 'birch' ? [H * .17, H * .3, H * .17] : [H * .3, H * .22, H * .3];
    const cy = kind === 'poplar' ? H * .55 : Ht + cRad[1] * .95;
    canopy(K, [top[0], cy, top[2]], cRad, kind === 'poplar' ? 90 : 120, rnd, kind === 'birch' ? [0] : [0, 0, 1], kind === 'birch' ? 1.4 : 1.9, tint);
    for (const t of tips) canopy(K, t, [1.2, .9, 1.2], 10, rnd, [0, 1], 1.4, tint);
  }
  K.ccyl(0, 0, 0, Math.max(.12, r0 * 1.1), Ht + 1, { surf: 'wood' });
  K.hide(0, 0, -1.0, 'bush', .7);
}
function bush(K, o, v, rnd) {
  if (v === 'hedge') {
    const L = o.len || 3, H = o.h || 1.8, D = o.d || .9;
    K.box('p_leaf_core', 0, .02, 0, L - .25, H - .2, D - .25);
    const step = .45;
    for (let x = -L / 2 + step / 2; x < L / 2; x += step) for (let y = .45; y < H; y += step) for (const s of [-1, 1]) {
      const k = .75 + rnd() * .3; K.card(x + (rnd() - .5) * .15, y + (rnd() - .5) * .1, s * (D / 2 - .05 + rnd() * .08), .75, .75, rnd() < .7 ? 1 : 0, { ry: (s > 0 ? 0 : PI) + (rnd() - .5) * .8, rx: (rnd() - .5) * .6, rz: rnd() * TAU, n: [0, .3, s], col: [k * .85, k, k * .85] });
    }
    for (let x = -L / 2 + step / 2; x < L / 2; x += step) for (let z = -D / 2 + .2; z < D / 2; z += .4) { const k = .9 + rnd() * .25; K.card(x, H - .05, z, .8, .8, 1, { rx: PI / 2 + (rnd() - .5) * .5, rz: rnd() * TAU, n: [0, 1, 0], col: [k * .85, k, k * .85] }); }
    for (const s of [-1, 1]) for (let y = .4; y < H; y += step) for (let z = -D / 2 + .2; z < D / 2; z += .4) K.card(s * (L / 2 - .05), y, z, .7, .7, 1, { ry: s * PI / 2 + (rnd() - .5) * .6, rz: rnd() * TAU, n: [s, .3, 0], col: [.8, .95, .8] });
    K.col(0, 0, 0, L - .2, H - .1, D - .2, { surf: 'grass', tag: 'foliage' });
    K.hide(0, 0, -D / 2 - .5, 'bush', .6);
    return;
  }
  const big = v === 'round' ? 1 : v === 'small' ? .55 : .8, R = .8 * big * (.9 + rnd() * .2), H = 1.5 * big * (.9 + rnd() * .2), cs = .62 * big + .2;
  K.blob('p_leaf_core', 0, H * .42, 0, R * .62, H * .4, R * .62, { seg: 8, noise: .2, seed: 3, flat: -.9 });
  canopy(K, [0, H * .52, 0], [R * .78, H * .5, R * .78], Math.round(46 * big + 14), rnd, v === 'flowering' ? [0] : [1, 1, 0], cs, [.9, 1, .88], 0);
  K.col(0, 0, 0, R * 1.5, H * .9, R * 1.5, { surf: 'fabric', solid: false, ray: true, tag: 'foliage' });
  K.hide(0, 0, 0, 'bush', Math.min(.8, R * .6));
}
function grassTall(K, o, v, rnd) {
  const W = o.w || 3, D = o.d || 3, Hm = o.h || (v === 'short' ? .5 : 1.0), dens = o.density || 4;
  const n = Math.round(W * D * dens);
  for (let i = 0; i < n; i++) {
    const x = (rnd() - .5) * W, z = (rnd() - .5) * D, h = Hm * (.7 + rnd() * .5), a = rnd() * PI, k = .75 + rnd() * .35;
    const col = v === 'dry' ? [k * 1.25, k * 1.05, k * .6] : [k, k, k * .9];
    for (let c = 0; c < 2; c++) K.card(x, 0, z, h * 1.1, h, 2, { ry: a + c * PI / 2, base: true, rx: (rnd() - .5) * .2, n: [0, 1, 0], col });
  }
  if (Hm >= .85) { K.col(0, 0, 0, W * .9, Hm * .85, D * .9, { surf: 'fabric', solid: false, ray: true, tag: 'foliage' }); K.hide(0, 0, 0, 'grass', Math.min(W, D) * .3); }
}
function cornPlant(K, x, z, rnd) {
  const H = 2.0 + rnd() * .5, lean = [(rnd() - .5) * .1, (rnd() - .5) * .1], k = .85 + rnd() * .25, col = [k, k, k * .9];
  const stalk = [[x, 0, z], [x + lean[0] * .5, H * .5, z + lean[1] * .5], [x + lean[0], H, z + lean[1]]];
  K.tube('p_stalk', stalk, [.018, .014, .006], { seg: 4, col });
  const nl = 7;
  for (let i = 0; i < nl; i++) {
    const t = .18 + i * .1, y = H * t, a = rnd() * TAU + i * 2.4, L = .55 + (1 - Math.abs(t - .5)) * .45, w = .07;
    const ca = Math.cos(a), sa = Math.sin(a);
    // leaf ribbon: rises then arches over and droops
    const pts = []; for (let s = 0; s <= 4; s++) { const f = s / 4; pts.push([x + sa * L * f, y + Math.sin(f * PI * .8) * L * .35 - f * f * L * .25, z + ca * L * f]); }
    for (let s = 0; s < 4; s++) {
      const wa = w * (1 - s / 5), wb = w * (1 - (s + 1) / 5), p = pts[s], q = pts[s + 1];
      const nx = ca * wa / 2, nz = -sa * wa / 2, mx = ca * wb / 2, mz = -sa * wb / 2;
      K.quad('p_leaf_corn', [p[0] - nx, p[1], p[2] - nz], [p[0] + nx, p[1], p[2] + nz], [q[0] + mx, q[1], q[2] + mz], [q[0] - mx, q[1], q[2] - mz], { two: true, n: [0, 1, 0], col });
    }
  }
  if (rnd() < .8) K.blob('p_leaf_corn', x + .04, H * .55, z, .035, .11, .035, { seg: 5, rz: .3, col: [1.2, 1.15, .8] });
  K.quad('p_hay', [x - .06, H, z], [x + .06, H, z], [x + .03, H + .25, z], [x - .03, H + .25, z], { two: true, n: [0, 0, 1] });
}
function corn(K, o, v, rnd) {
  const W = o.w || 6, D = o.d || 6, row = .76, gap = .28;
  for (let x = -W / 2 + row / 2; x < W / 2; x += row) for (let z = -D / 2 + gap / 2; z < D / 2; z += gap) {
    if (rnd() < .06) continue;
    cornPlant(K, x + (rnd() - .5) * .08, z + (rnd() - .5) * .08, rnd);
  }
  K.col(0, 0, 0, W, 2.0, D, { surf: 'fabric', solid: false, ray: true, tag: 'foliage' });
  K.hide(0, 0, 0, 'grass', Math.min(W, D) * .3);
}
function hayBale(K, o, v, rnd) {
  if (v === 'round') {
    const R = .75, W = 1.2;
    K.lathe('p_hay', [[.05, -W / 2], [R * .9, -W / 2], [R, -W / 2 + .1], [R * 1.01, 0], [R, W / 2 - .1], [R * .9, W / 2], [.05, W / 2]], { rz: PI / 2, y: R, seg: 20, caps: false, sharp: 50 });
    for (const s of [-1, 1]) K.lathe('p_hay', [[R * .9, 0], [.05, .02]], { rz: s * PI / 2, x: s * W / 2, y: R, seg: 20, caps: false });
    for (let i = 0; i < 6; i++) K.lathe('p_fab_white', [[R * 1.012, -W / 2 + .12 + i * .19], [R * 1.012, -W / 2 + .15 + i * .19]], { rz: PI / 2, y: R, seg: 20, caps: false });
    K.col(0, 0, 0, W, R * 2, R * 2, { surf: 'fabric' });
    return;
  }
  const bale = (x, y, z, ry) => {
    K.box('p_hay', x, y, z, .9, .36, .46, { ry, bev: .04 });
    for (const f of [-.22, .22]) { K.push(x, y, z, ry); K.box('p_fab_tan', f, -.002, 0, .015, .364, .464, { skip: 'b' }); K.pop(); }
  };
  if (v === 'stack') {
    for (let c = 0; c < 3; c++) for (let i = 0; i < 3 - c; i++) for (const zz of [-.24, .24]) bale(-.47 * (2 - c) + i * .94, c * .36, zz, (rnd() - .5) * .05);
    K.col(0, 0, 0, 2.8, .72, .95, { surf: 'fabric' }); K.col(0, .72, 0, .95, .36, .95, { surf: 'fabric' });
    return;
  }
  bale(0, 0, 0, 0);
  K.col(0, 0, 0, .9, .36, .46, { surf: 'fabric' });
}
const ROCK = { small: .6, medium: 1.4, large: 3.0 };
function rock(K, o, v, rnd) {
  const mat = o.red ? 'p_rock_red' : 'p_rock';
  const one = (x, z, S, seed) => {
    const sx = S * (.8 + rnd() * .4), sy = S * (.5 + rnd() * .25), sz = S * (.8 + rnd() * .4), ry = rnd() * TAU;
    K.blob(mat, x, sy * .35, z, sx / 2, sy / 2 + .02, sz / 2, { seg: S > 2 ? 16 : 12, noise: .22, freq: 1.6, seed, flat: -.65, ry });
    K.col(x, 0, z, sx * .8, sy * .78, sz * .8, { ry, surf: 'concrete' });
  };
  if (v === 'cluster') { one(0, 0, 1.6, 1); one(1.3, .5, .8, 2); one(-.9, .8, .6, 3); one(.4, -1.0, .5, 4); return; }
  one(0, 0, ROCK[v] || 1.4, Math.floor(rnd() * 100));
}
function log(K, o, v, rnd) {
  const lg = (x, y, z, r, L, ry) => {
    K.push(x, y, z, ry);
    K.cylZ('p_bark', -L / 2, L / 2, 0, 0, r, { seg: 10, caps: false });
    for (const s of [-1, 1]) K.lathe('p_wood_light', [[r, 0], [r * .55, .002], [0, .003]], { rx: s * PI / 2, z: s * L / 2, seg: 10 });
    K.pop();
  };
  if (v === 'stump') {
    const r = .3 + rnd() * .1;
    K.cyl('p_bark', 0, 0, 0, r, .45, { seg: 12, caps: false, r2: r * .95 });
    K.lathe('p_wood_light', [[r * .95, .45], [r * .5, .46], [0, .47]], { seg: 12 });
    for (let i = 0; i < 5; i++) { const a = i * TAU / 5 + rnd(); K.tube('p_bark', [[Math.sin(a) * r * .7, .2, Math.cos(a) * r * .7], [Math.sin(a) * r * 1.4, .03, Math.cos(a) * r * 1.4], [Math.sin(a) * r * 2, -.05, Math.cos(a) * r * 2]], [.09, .06, .03], { seg: 5 }); }
    K.ccyl(0, 0, 0, r, .47, { surf: 'wood' });
    return;
  }
  if (v === 'pile') {
    const L = 4, r = .19;
    for (let c = 0; c < 4; c++) for (let i = 0; i < 4 - c; i++) lg((-1.5 + c) * r + i * r * 2 + (rnd() - .5) * .04, r + c * r * 1.72, 0, r * (.9 + rnd() * .2), L + (rnd() - .5) * .4, (rnd() - .5) * .06);
    K.col(0, 0, 0, 1.6, 1.0, L, { surf: 'wood' });
    return;
  }
  const r = .2 + rnd() * .08, L = o.len || 4;
  lg(0, r, 0, r, L, 0);
  K.col(0, 0, 0, r * 2, r * 2, L, { surf: 'wood' });
}

export default [
  { type: 'tree', cat: 'nature', size: [7, 11, 7], vary: true, keys: ['h'], desc: 'tree: bark trunk + scaffold branches + alpha-cut leaf cards (trunk collider only; hide behind it)',
    variants: Object.keys(TREE_H), opts: { h: 'height (oak 11, birch 13, pine 17, spruce 12, dead 9, poplar 15; seeded +-15%)' },
    sizeOf: (o, v) => { const H = o.h || TREE_H[v] || 11; return v === 'poplar' ? [H * .35, H, H * .35] : v === 'pine' ? [6, H, 6] : v === 'spruce' ? [H * .5, H, H * .5] : [H * .7, H, H * .7]; }, build: tree },
  { type: 'bush', cat: 'nature', size: [1.6, 1.5, 1.6], vary: true, keys: ['len', 'h', 'd'], desc: "leafy bush (walk-through, blocks sight: hide 'bush') or a dense box hedge (solid, along x)",
    variants: ['round', 'small', 'shrub', 'flowering', 'hedge'], opts: { len: 'hedge length (3)', h: 'hedge height (1.8)', d: 'hedge depth (.9)' },
    sizeOf: (o, v) => v === 'hedge' ? [o.len || 3, o.h || 1.8, o.d || .9] : v === 'small' ? [.9, .85, .9] : v === 'round' ? [1.6, 1.5, 1.6] : [1.3, 1.2, 1.3], build: bush },
  { type: 'grass_tall', alias: ['grass'], cat: 'nature', size: [3, 1, 3], vary: true, keys: ['w', 'd', 'h', 'density'], desc: "patch of tall grass cards (h >= .85: blocks sight, hide 'grass')",
    variants: ['green', 'dry', 'short'], opts: { w: 'width', d: 'depth', h: 'height (1.0)', density: 'tufts per m2 (4)' }, sizeOf: o => [o.w || 3, o.h || 1, o.d || 3], build: grassTall },
  { type: 'corn', alias: ['corn_rows'], cat: 'nature', size: [6, 2.5, 6], vary: true, keys: ['w', 'd'], desc: "corn field patch: rows (.76 m) along z of 2-2.5 m plants; walk-through, blocks sight, hide 'grass'",
    opts: { w: 'width (6)', d: 'depth (6)' }, sizeOf: o => [o.w || 6, 2.6, o.d || 6], build: corn },
  { type: 'hay_bale', cat: 'nature', size: [1.2, 1.5, 1.5], desc: 'round bale (lies along x), small square bale, or a stack of square bales', variants: ['round', 'square', 'stack'],
    sizeOf: (o, v) => v === 'square' ? [.9, .36, .46] : v === 'stack' ? [2.8, 1.08, .95] : [1.2, 1.5, 1.5], build: hayBale },
  { type: 'rock', cat: 'nature', size: [1.4, .8, 1.4], vary: true, keys: ['red'], desc: 'seeded boulder (small .6, medium 1.4, large 3 m) or a cluster', variants: ['medium', 'small', 'large', 'cluster'],
    opts: { red: 'reddish desert rock' }, sizeOf: (o, v) => v === 'cluster' ? [3, 1, 2.5] : (s => [s, s * .6, s])(ROCK[v] || 1.4), build: rock },
  { type: 'log', cat: 'nature', size: [.5, .5, 4], vary: true, keys: ['len'], desc: 'felled log (along z), log pile, or a stump with roots', variants: ['log', 'pile', 'stump'], opts: { len: 'log length' },
    sizeOf: (o, v) => v === 'pile' ? [1.6, 1.1, 4.2] : v === 'stump' ? [1.4, .5, 1.4] : [.55, .55, o.len || 4], build: log },
];
