/* LIVE FIRE — military / field props (catalogue for js/maps/props.js): tents, ammo crates, camouflage net, watchtower,
   field desk set. (Sandbags and HESCO walls are in street.js; ammo cans in industrial.js.)
   Exports: default [prop definitions]. */
import { leg4, ladder, railing, stackBoxes } from './parts.js';
import { decalUV } from './kit.js';

const PI = Math.PI;

function cot(K, x, z, ry, mat = 'p_fab_olive') {
  K.push(x, 0, z, ry);
  for (const s of [-1, 1]) K.cylZ('p_alu', -.95, .95, s * .32, .42, .015, { seg: 5 });
  for (const zz of [-.9, 0, .9]) for (const s of [-1, 1]) { K.push(s * .2, .21, zz, 0, 0, s * .6); K.box('p_alu', 0, -.22, 0, .02, .44, .02); K.pop(); }
  K.box(mat, 0, .41, 0, .62, .02, 1.9);
  K.blob('p_fab_olive', 0, .48, .3, .3, .05, .55, { seg: 8, noise: .1, seed: Math.round(x * 10) });
  K.pop();
  K.col(x, 0, z, .7, .45, 1.95, { ry, surf: 'fabric' });
}
function tent(K, o, v, rnd) {
  const big = v === 'command', W = big ? 6 : 4.8, L = big ? 10 : 6, Hr = big ? 3.3 : 2.8, Hw = big ? 1.7 : 1.5, mat = o.color === 'tan' ? 'p_fab_tan' : 'p_fab_olive', t = .03;
  const hl = L / 2, slope = Math.atan2(Hr - Hw, W / 2), pl = Math.hypot(W / 2, Hr - Hw);
  // side walls, sloped roof panels (thin boxes: canvas seen from both sides), end walls with a door at +z
  for (const s of [-1, 1]) {
    K.box(mat, s * (W / 2 - t / 2), 0, 0, t, Hw, L);
    K.push(s * W / 4, (Hw + Hr) / 2, 0, 0, 0, -s * slope); K.box(mat, 0, -t / 2, 0, pl + .25, t, L + .3); K.pop();
  }
  const gable = [[-W / 2, 0], [W / 2, 0], [W / 2, Hw], [0, Hr], [-W / 2, Hw]];
  K.ext(mat, gable, -hl, -hl + t);
  const dw = big ? 1.6 : 1.3, dh = Math.min(2.2, Hw + .6);
  K.ext(mat, [[-W / 2, 0], [-dw / 2, 0], [-dw / 2, dh], [0, dh + .1], [dw / 2, dh], [dw / 2, 0], [W / 2, 0], [W / 2, Hw], [0, Hr], [-W / 2, Hw]], hl - t, hl);
  if (o.open !== false) { K.push(-dw / 2, 0, hl + .02, 0, 0, 0); K.blob(mat, -.25, dh * .55, 0, .22, dh * .5, .1, { seg: 8, noise: .15 }); K.pop(); }
  // poles, ridge, guy ropes and pegs
  for (const z of [-hl + .05, 0, hl - .05]) K.cyl('p_wood_sleeper', 0, 0, z, .035, Hr, { seg: 6 });
  K.cylZ('p_wood_sleeper', -hl, hl, 0, Hr - .05, .03, { seg: 6 });
  for (const s of [-1, 1]) for (const z of [-hl + .3, -hl / 3, hl / 3, hl - .3]) {
    const px = s * (W / 2 + 1.2);
    K.tube('p_fab_tan', [[s * W / 2, Hw + .05, z], [px, 0, z]], .006, { seg: 3 });
    K.cyl('steel_dark', px, -.05, z, .015, .2, { seg: 4 });
  }
  K.box(mat, 0, .005, 0, W - .1, .01, L - .1);   // ground sheet
  // inside: cots and a field table
  const n = big ? 0 : 3;
  for (let i = 0; i < n; i++) cot(K, i === 2 ? W / 2 - .7 : -W / 2 + .7, -hl + 1.4 + (i === 1 ? 2.2 : 0), 0);
  if (big) {
    K.box('p_wood_light', 0, .75, -1, 2.4, .04, 1.2); K.push(0, 0, -1); leg4(K, 'p_alu', 2.4, 1.2, .75, .04); K.pop();
    K.decal('scr_map', 0, .791, -1, 1.6, 1.0, { face: 'u' });
    for (const x of [-.8, 0, .8]) { K.box('p_plastic_dark', x, .45, -.15, .42, .04, .42, { bev: .01 }); leg4(K, 'p_alu', .4, .4, .45, .02); }
    K.box('p_paint_olive', -W / 2 + .5, 0, hl - 1.5, .6, .8, .5, { bev: .01 }); K.box('p_plastic_dark', -W / 2 + .5, .8, hl - 1.5, .5, .25, .35, { bev: .02 });
    K.col(0, 0, -1, 2.4, .79, 1.2, { surf: 'wood' });
  }
  if (o.lightOn) K.light({ type: 'point', x: 0, y: Hr - .25, z: 0, intensity: 4, fixture: false, color: [1, .85, .65] });
  K.cyl(o.lightOn ? 'emissive_warm' : 'p_lens_clear', 0, Hr - .35, 0, .05, .12, { seg: 8 });
  // colliders: walls (fabric: bullets pass, sight is blocked), door gap at +z
  for (const s of [-1, 1]) K.col(s * (W / 2 - .03), 0, 0, .06, Math.max(Hw, 1.9), L, { surf: 'fabric' });
  K.col(0, 0, -hl + .03, W, 2.0, .06, { surf: 'fabric' });
  for (const s of [-1, 1]) K.col(s * (W / 2 + dw / 2) / 2, 0, hl - .03, W / 2 - dw / 2, 2.0, .06, { surf: 'fabric' });
  K.hide(-W / 2 + .7, 0, hl - 1.0, 'dark', .5);
}
function ammoCrates(K, o, v, rnd) {
  const n = Math.max(1, Math.min(8, o.n || 3));
  const spots = [[0, 0, 0], [.62, 0, .02], [.31, .38, .01], [-.62, 0, .03], [-.31, .38, -.01], [0, .76, 0], [1.24, 0, -.02], [.93, .38, 0]];
  for (let i = 0; i < n; i++) {
    const [x, y, z] = spots[i]; K.push(x, y, z, (rnd() - .5) * .1);
    const w = .58, h = .38, d = 1.0;
    K.box('p_wood_mil', 0, 0, 0, w, h, d, { bev: .01 });
    for (const s of [-1, 1]) { K.box('p_wood_mil', 0, 0, s * (d / 2 - .04), w + .02, h + .01, .06); K.tube('p_fab_tan', [[-.12, h * .7, s * (d / 2 + .01)], [-.1, h * .5, s * (d / 2 + .04)], [.1, h * .5, s * (d / 2 + .04)], [.12, h * .7, s * (d / 2 + .01)]], .01, { seg: 4 }); }
    for (const zz of [-.25, .25]) K.box('steel_dark', w / 2 + .005, h * .3, zz, .01, .1, .05);
    K.decal('stencil_ammo', 0, h + .001, 0, w * .9, w * .32, { face: 'u', ry: PI / 2 });
    K.decal(rnd() < .5 ? 'stencil_mil' : 'stencil_explo', w / 2 + .002, h * .5, 0, .5, .2, { face: 'e' });
    K.pop();
  }
  const top = Math.max(...spots.slice(0, n).map(s => s[1])) + .38;
  const xs = spots.slice(0, n).map(q => q[0]); K.col((Math.min(...xs) + Math.max(...xs)) / 2, 0, 0, Math.max(...xs) - Math.min(...xs) + .62, top, 1.04, { surf: 'wood' });
}
function camoNet(K, o, v, rnd) {
  // a garnished camouflage net (decal atlas 'camo_wood' / 'camo_desert': cord mesh + jagged cut-outs, alpha tested) laid cell by
  // cell over a sagging grid on five poles, a second loose layer for depth, ragged skirts hanging from the edges
  const W = o.w || 6, D = o.d || 6, H = o.h || 2.6, n = 8, slot = v === 'desert' ? 'camo_desert' : 'camo_wood';
  const uv = decalUV(slot), mat = 'p_decal';
  const pt = (i, j) => { const x = -W / 2 + W * i / n, z = -D / 2 + D * j / n, edge = Math.min(i, j, n - i, n - j) === 0; const sag = Math.sin(PI * i / n) * Math.sin(PI * j / n); return [x + (rnd() - .5) * .1, edge ? H - .4 - rnd() * .3 : H - .15 * sag + (rnd() - .5) * .12, z + (rnd() - .5) * .1]; };
  const grid = []; for (let i = 0; i <= n; i++) { grid.push([]); for (let j = 0; j <= n; j++) grid[i].push(pt(i, j)); }
  // the top of a pole lifts the net around it into a tent shape
  const poles = [[-W / 2 + .3, -D / 2 + .3], [W / 2 - .3, -D / 2 + .3], [-W / 2 + .3, D / 2 - .3], [W / 2 - .3, D / 2 - .3], [0, 0]];
  grid[n / 2][n / 2][1] = H;
  const up = [0, 1, 0];
  const quad = (p, k, sh, lift) => {   // p = 4 corners (counter-clockwise from above); k rotates the texture by k * 90 degrees
    const c = [(p[0][0] + p[2][0]) / 2, (p[0][1] + p[2][1]) / 2, (p[0][2] + p[2][2]) / 2], e = 1.14;   // overlap the neighbours
    const q = p.map(x => [c[0] + (x[0] - c[0]) * e, c[1] + (x[1] - c[1]) * e + lift, c[2] + (x[2] - c[2]) * e]);
    const r = [q[k % 4], q[(k + 1) % 4], q[(k + 2) % 4], q[(k + 3) % 4]];
    K.quad(mat, r[0], r[1], r[2], r[3], { uv, n: up, two: true, col: [sh, sh, sh] });
  };
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const p = [grid[i][j], grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1]];
    quad(p, Math.floor(rnd() * 4), .82 + rnd() * .3, 0);
    if (rnd() < .45) quad(p, Math.floor(rnd() * 4), .7 + rnd() * .3, -.06 - rnd() * .08);     // loose under-layer
  }
  for (let e = 0; e < n; e++) for (const [i0, j0, i1, j1] of [[e, 0, e + 1, 0], [e, n, e + 1, n], [0, e, 0, e + 1], [n, e, n, e + 1]]) {   // skirts
    const a = grid[i0][j0], b = grid[i1][j1], drop = .35 + rnd() * .45, out = [Math.sign(a[0] + b[0]) * (i0 === i1 ? 1 : 0), 0, Math.sign(a[2] + b[2]) * (j0 === j1 ? 1 : 0)];
    const f = .1;   // flare outward a little as it hangs
    K.quad(mat, [a[0], a[1], a[2]], [b[0], b[1], b[2]], [b[0] + out[0] * f, b[1] - drop, b[2] + out[2] * f], [a[0] + out[0] * f, a[1] - drop, a[2] + out[2] * f],
      { uv: [uv[0], uv[1], uv[2], uv[1] + (uv[3] - uv[1]) * .5], n: out, two: true, col: [.85, .85, .85] });
  }
  for (const [x, z] of poles) K.cyl('p_wood_sleeper', x, 0, z, .04, (x || z) ? H - .38 : H - .02, { seg: 6 });
  K.hide(0, 0, 0, 'dark', 1.0);
}
function watchtower(K, o, v, rnd) {
  const H = o.h || 3.2, W = 2.6, mat = 'p_wood_sleeper';
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { K.box(mat, sx * (W / 2 - .1), 0, sz * (W / 2 - .1), .2, H + 2.4, .2, { bev: .01 }); K.box('concrete', sx * (W / 2 - .1), 0, sz * (W / 2 - .1), .45, .2, .45); }
  for (const s of [-1, 1]) for (const yy of [H * .45]) { K.push(0, yy, s * (W / 2 - .1), 0, 0, Math.atan2(H * .8, W)); K.box(mat, 0, -.05, 0, Math.hypot(W, H * .8), .1, .08); K.pop(); }
  K.box('p_wood_pallet', 0, H - .12, 0, W + .2, .12, W + .2);
  // sandbag parapet (box with a burlap look) on three sides, rail on the stair side
  for (const [x, z, w, d] of [[0, W / 2 - .05, W + .2, .3], [0, -W / 2 + .05, W + .2, .3], [W / 2 - .05, 0, .3, W - .4]]) {
    K.box('p_sandbag', x, H, z, w, 1.0, d, { bev: .06 });
    for (let yy = .12; yy < 1; yy += .14) K.box('p_plastic_dark', x, H + yy, z + (d < .5 && Math.abs(z) > .1 ? Math.sign(z) * .151 : 0), w - .1, .006, d < .5 ? .002 : d - .1);
  }
  railing(K, 'p_wood_sleeper', -W / 2 - .05, -W / 2 + .3, -W / 2 - .05, W / 2 - .3, H, { h: 1.0, toe: false, r: .04 });
  K.box(mat, 0, H + 2.3, 0, W + .5, .12, W + .5);
  K.box('corrugated_rust', 0, H + 2.42, 0, W + .7, .03, W + .7);
  if (o.light !== false) K.box('p_paint_darkgrey', W / 2 - .2, H + 2.0, W / 2 - .2, .3, .25, .3, { bev: .02 });
  K.col(0, H - .12, 0, W + .2, .12, W + .2, { surf: 'wood', walk: true });
  for (const [x, z, w, d] of [[0, W / 2 - .05, W + .2, .3], [0, -W / 2 + .05, W + .2, .3], [W / 2 - .05, 0, .3, W - .4]]) K.col(x, H, z, w, 1.0, d, { surf: 'sand' });
  K.col(-W / 2 - .05, H, 0, .1, 1.0, W - .6, { surf: 'wood', ray: false });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) K.col(sx * (W / 2 - .1), 0, sz * (W / 2 - .1), .2, H, .2, { surf: 'wood' });
  K.col(0, H + 2.3, 0, W + .5, .2, W + .5, { surf: 'wood' });
  K.hide(.2, H, 0, 'roof', .6);
}
function fieldDesk(K, o, v, rnd) {
  K.box('p_wood_light', 0, .72, 0, 1.8, .04, .75); leg4(K, 'p_alu', 1.8, .75, .72, .04);
  K.push(-.4, .76, -.15); K.box('p_plastic_dark', 0, 0, 0, .38, .03, .26, { bev: .01 }); K.push(0, .03, -.12, 0, -1.2, 0); K.box('p_plastic_dark', 0, 0, 0, .38, .24, .015); K.decal('scr_map', 0, .12, .009, .34, .2, { glow: true }); K.pop(); K.pop();
  K.box('p_paint_olive', .45, .76, -.1, .4, .22, .3, { bev: .02 }); K.cyl('steel_dark', .6, .98, -.2, .006, .7, { seg: 4 });
  K.box('p_plastic_dark', .45, .98, -.1, .3, .02, .2);
  K.decal('scr_map', .05, .761, .15, .6, .4, { face: 'u' });
  K.push(0, 0, .6, PI); K.box('p_plastic_dark', 0, .45, 0, .42, .04, .42, { bev: .01 }); leg4(K, 'p_alu', .4, .4, .45, .02); K.box('p_plastic_dark', 0, .47, -.2, .42, .4, .03); K.pop();
  K.col(0, 0, 0, 1.8, .76, .75, { surf: 'wood' });
}

export default [
  { type: 'tent', cat: 'military', size: [4.8, 2.8, 6], keys: ['color', 'open', 'lightOn'], desc: 'military ridge tent (walk-in: door at +z), poles, guy ropes, cots inside; command = 6 x 10 with a map table',
    variants: ['mil', 'command'], opts: { color: "'olive' | 'tan'", open: 'false = door flap closed', lightOn: 'lit lamp inside' }, sizeOf: (o, v) => v === 'command' ? [8.4, 3.3, 10] : [7.2, 2.8, 6], build: tent },
  { type: 'ammo_crate', cat: 'military', size: [.6, .38, 1.0], vary: true, keys: ['n'], desc: 'olive wooden ammunition crates with rope handles and stencils (stack of n <= 8)', opts: { n: 'crates' }, build: ammoCrates },
  { type: 'camo_net', cat: 'military', size: [6, 2.6, 6], vary: true, keys: ['w', 'd', 'h'], desc: "camouflage net on poles (no collider, shade: hide 'dark' under it)", variants: ['woodland', 'desert'], opts: { w: 'width', d: 'depth', h: 'height (2.6)' }, build: camoNet },
  { type: 'watchtower', alias: ['guard_tower'], cat: 'military', size: [3.1, 5.8, 3.1], keys: ['h', 'light'], desc: 'timber guard tower: walkable platform with a sandbag parapet, roof; open side (-x) has a rail: reach it with B.stairs',
    opts: { h: 'platform height (3.2)' }, sizeOf: o => [3.1, (o.h || 3.2) + 2.6, 3.1], build: watchtower },
  { type: 'field_desk', cat: 'military', size: [1.8, 1.0, 1.3], desc: 'folding table with a laptop, radio and map, plus a chair (seat at +z)', build: fieldDesk },
];
