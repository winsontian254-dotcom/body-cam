/* LIVE FIRE — street furniture, barriers and fences (catalogue for js/maps/props.js).
   Exports: default [prop definitions]. Local space: origin = base centre, front = +z; wall-like props run along x. */
import { lampHead, bolts, handle, louvres, grid, cushion, leg4 } from './parts.js';

const PI = Math.PI;

// ------------------------------------------------------------------------------------------------ barriers
function jersey(K, o, v, rnd) {
  const L = o.len || 3.0;
  if (v === 'plastic') {   // water-filled plastic barrier, alternating colours
    const L2 = o.len || 2.0, col = o.color === 'white' ? 'p_plastic_milky' : rnd() < .5 || o.color === 'red' ? 'p_plastic_red' : 'p_plastic_milky';
    K.extX(col, [[-.25, 0], [.25, 0], [.25, .1], [.12, .25], [.1, .78], [.04, .82], [-.04, .82], [-.1, .78], [-.12, .25], [-.25, .1]], -L2 / 2, L2 / 2, { smooth: 35 });
    for (const x of [-L2 / 2 + .25, L2 / 2 - .25]) K.cyl('p_plastic_dark', x, .82, 0, .07, .03, { seg: 10 });
    for (let x = -L2 / 2 + .5; x < L2 / 2 - .3; x += .5) K.box(col, x, .3, 0, .06, .4, .3);
    K.col(0, 0, 0, L2, .82, .5, { surf: 'rubber' });
    return;
  }
  // concrete F-shape profile, chamfered ends, lifting slots, scuffs
  const prof = [[-.305, 0], [.305, 0], [.305, .075], [.23, .33], [.08, .81], [-.08, .81], [-.23, .33], [-.305, .075]];
  K.extX('p_concrete_precast', prof, -L / 2, L / 2);
  for (const x of [-L / 2 + .45, L / 2 - .45]) K.box('p_plastic_dark', x, 0, 0, .2, .07, .62);
  if (rnd() < .5) K.decal('graffiti_2', 0, .45, .27, 1.4, .5, { rx: .3 });
  K.col(0, 0, 0, L, .81, .5, { surf: 'concrete' });
}
function sandbagBag(K, x, y, z, ry, rnd, i) {
  // a filled bag: flattened, slightly pillowed, tied end tucked under
  K.blob('p_sandbag', x, y + .06, z, .29, .066, .17, { seg: 10, noise: .1, freq: 3.2, seed: i * 7 + 3, ry, flat: -.8, top: .75 });
}
function sandbags(K, o, v, rnd) {
  const L = o.len || 2.4, courses = Math.max(1, Math.min(12, o.h ? Math.round(o.h / .12) : 7)), rows = o.thick || 2, R = o.curve || 0, pitch = .6;
  const n = Math.max(1, Math.round(L / pitch)), L2 = n * pitch;
  let i = 0;
  for (let c = 0; c < courses; c++) {
    const y = c * .118, odd = c % 2;
    for (let r = 0; r < rows; r++) {
      const zr = (r - (rows - 1) / 2) * .34 * (1 - c * .015);
      const cnt = odd ? n - 1 : n;
      for (let k = 0; k < cnt; k++) {
        const x = -L2 / 2 + pitch / 2 + k * pitch + (odd ? pitch / 2 : 0);
        let px = x + (rnd() - .5) * .025, pz = zr + (rnd() - .5) * .02, ry = (rnd() - .5) * .08;
        if (R) { const a = x / R; px = Math.sin(a) * (R + zr); pz = R - Math.cos(a) * (R + zr); ry += a; }
        sandbagBag(K, px, y, pz, ry, rnd, i++);
      }
    }
  }
  const H = courses * .118 + .02;
  if (R) { const m = Math.max(1, Math.ceil(L2 / 1.2)); for (let k = 0; k < m; k++) { const a = (-L2 / 2 + (k + .5) * L2 / m) / R; K.col(Math.sin(a) * R, 0, R - Math.cos(a) * R, L2 / m + .1, H, rows * .34 + .1, { ry: a, surf: 'sand' }); } }
  else K.col(0, 0, 0, L2, H, rows * .34 + .1, { surf: 'sand' });
}
function hesco(K, o, v, rnd) {
  const n = Math.max(1, Math.min(12, o.n || 3)), h2 = o.rows === 2 ? 2 : 1, c = 1.06, L = n * c, H = c * h2, fill = v === 'dirt' ? 'p_soil' : 'sand';
  for (let r = 0; r < h2; r++) for (let i = 0; i < n; i++) {
    const x = -L / 2 + (i + .5) * c, y = r * c;
    K.box('p_geotex', x, y, 0, c - .03, c - .02, c - .03, { bev: .03 });
    K.box(fill, x, y + c - .06, 0, c - .1, .04, c - .1);
    for (const s of [-1, 1]) { K.push(x, y, s * (c / 2 - .005)); grid(K, 'p_galv', 0, 0, 0, c - .01, c - .01, 7, 7, .0045); K.pop(); }
    for (const s of [-1, 1]) if (i === 0 && s < 0 || i === n - 1 && s > 0) { K.push(x + s * (c / 2 - .005), y, 0, PI / 2); grid(K, 'p_galv', 0, 0, 0, c - .01, c - .01, 7, 7, .0045); K.pop(); }
    for (const s of [-1, 1]) for (const zs of [-1, 1]) K.cyl('p_galv', x + s * (c / 2 - .01), y, zs * (c / 2 - .01), .012, c - .01, { seg: 5 });
  }
  K.col(0, 0, 0, L, H, c, { surf: 'sand' });
}

// ------------------------------------------------------------------------------------------------ fences and gates
function fenceChain(K, o, v, rnd) {
  const L = o.len || 3, H = o.h || 2.1, span = 3, n = Math.max(1, Math.round(L / span)), barb = o.barb !== false && v === 'barbed';
  for (let i = 0; i <= n; i++) { const x = -L / 2 + i * L / n; K.cyl('p_galv', x, 0, 0, .03, H + .05, { seg: 8 }); K.cyl('p_galv', x, H + .05, 0, .036, .03, { seg: 8 }); }
  K.cylX('p_galv', -L / 2, L / 2, H - .02, 0, .02, { seg: 6 });
  K.cylX('p_galv', -L / 2, L / 2, .1, 0, .006, { seg: 4 });
  K.quad('p_chainlink', [-L / 2, .05, 0], [L / 2, .05, 0], [L / 2, H - .02, 0], [-L / 2, H - .02, 0], { n: [0, 0, 1], two: true });
  if (barb) for (let i = 0; i <= n; i++) {
    const x = -L / 2 + i * L / n; K.push(x, H, 0, 0, -.6, 0); K.box('p_galv', 0, 0, .0, .03, .45, .03); K.pop();
    for (let k = 1; k <= 3; k++) if (i < n) K.cylX('steel_dark', x, x + L / n, H + k * .12, -k * .085, .004, { seg: 3 });
  }
  K.noCast('p_chainlink');
  K.col(0, 0, 0, L, H, .08, { surf: 'metal', ray: false });
}
function fenceWood(K, o, v, rnd) {
  const L = o.len || 2.4, picket = v === 'picket', H = o.h || (picket ? 1.0 : 1.8), mat = picket ? 'p_wood_white' : 'p_wood_fence', span = 2.4, n = Math.max(1, Math.round(L / span));
  for (let i = 0; i <= n; i++) K.box(mat, -L / 2 + i * L / n, 0, -.05, .09, H + .05, .09, { bev: .006 });
  for (const y of picket ? [.2, H - .25] : [.25, H / 2, H - .25]) K.box(mat, 0, y, -.06, L, .09, .04);
  const bw = picket ? .08 : .14, gap = picket ? .055 : .006;
  for (let x = -L / 2 + bw / 2; x <= L / 2 - bw / 2 + 1e-6; x += bw + gap) {
    const c = .88 + rnd() * .2, hh = H - (picket ? 0 : rnd() * .02);
    if (picket) { K.box(mat, x, .05, 0, bw, hh - .1, .02, { col: [c, c, c] }); K.push(x, .05 + hh - .1, 0, 0, 0, PI / 4); K.box(mat, 0, -.028, 0, bw * .7, bw * .7, .02, { col: [c, c, c] }); K.pop(); }
    else K.box(mat, x, .04, .0, bw, hh, .018, { col: [c, c * .97, c * .93] });
  }
  K.col(0, 0, 0, L, H, .14, { surf: 'wood' });
}
function gate(K, o, v, rnd) {
  const open = o.open || 0;
  if (v === 'barrier') {   // boom barrier: housing + striped arm
    const L = o.len || 4;
    K.box('paint_yellow', 0, 0, 0, .35, 1.05, .35, { bev: .02 }); K.box('p_paint_darkgrey', 0, 1.05, 0, .38, .06, .38);
    K.push(.18, .95, 0, 0, 0, open ? 1.45 : 0);
    for (let i = 0; i < Math.ceil(L / .5); i++) K.box(i % 2 ? 'paint_red' : 'paint_white', .25 + i * .5, -.04, 0, .5, .08, .08);
    K.pop();
    K.box('p_paint_darkgrey', L + .1, 0, 0, .1, .9, .1);
    K.col(0, 0, 0, .4, 1.1, .4, { surf: 'metal' });
    if (!open) K.col(L / 2 + .3, .85, 0, L, .12, .1, { surf: 'metal' });
    return;
  }
  if (v === 'farm') {     // 5-bar tube gate 3.6 m, hinged at -x
    const L = o.len || 3.6, a = open * PI / 180;
    K.cyl('p_wood_sleeper', -L / 2 - .1, 0, 0, .1, 1.4, { seg: 8 }); K.cyl('p_wood_sleeper', L / 2 + .1, 0, 0, .1, 1.4, { seg: 8 });
    K.push(-L / 2, 0, 0, -a);
    for (const y of [.25, .45, .65, .85, 1.1]) K.cylX('p_galv', 0, L, y, 0, .02, { seg: 6 });
    K.cyl('p_galv', 0, .2, 0, .025, .95, { seg: 6 }); K.cyl('p_galv', L, .2, 0, .025, .95, { seg: 6 });
    K.push(0, .25, 0, 0, 0, Math.atan2(.85, L)); K.cylX('p_galv', 0, Math.hypot(L, .85), 0, 0, .018, { seg: 6 }); K.pop();
    K.pop();
    K.col(-L / 2 + Math.cos(a) * L / 2, 0, Math.sin(a) * L / 2, L, 1.15, .1, { ry: a, surf: 'metal' });
    return;
  }
  // chain-link double gate in a frame (each leaf L / 2), hinged at the outer posts
  const L = o.len || 4, H = o.h || 2.1, a = open * PI / 180, lw = L / 2;
  for (const s of [-1, 1]) { K.cyl('p_galv', s * (L / 2 + .06), 0, 0, .045, H + .1, { seg: 10 }); K.cyl('p_galv', s * (L / 2 + .06), H + .1, 0, .05, .03, { seg: 10 }); }
  for (const s of [-1, 1]) {
    K.push(s * L / 2, 0, 0, s > 0 ? a : -a);
    const xs = -s * lw;
    K.tube('p_galv', [[0, .08, 0], [0, H, 0], [xs, H, 0], [xs, .08, 0], [0, .08, 0]], .022, { seg: 6 });
    K.cylX('p_galv', Math.min(0, xs), Math.max(0, xs), H / 2, 0, .016, { seg: 6 });
    K.quad('p_chainlink', [Math.min(0, xs), .1, 0], [Math.max(0, xs), .1, 0], [Math.max(0, xs), H - .02, 0], [Math.min(0, xs), H - .02, 0], { n: [0, 0, 1], two: true });
    if (s > 0) K.cyl('p_galv', xs + .03, .05, 0, .012, .5, { seg: 5 });
    K.pop();
    const c = Math.cos(a), sn = Math.sin(a);
    K.col(s * L / 2 - s * c * lw / 2, 0, sn * lw / 2, lw, H, .06, { ry: s > 0 ? a : -a, surf: 'metal', ray: false });
  }
  K.noCast('p_chainlink');
}
function bollard(K, o, v, rnd) {
  if (v === 'concrete') { K.lathe('p_concrete_precast', [[.22, 0], [.22, .55], [.2, .65], [.12, .73], [0, .76]], { seg: 16 }); K.ccyl(0, 0, 0, .22, .76, { surf: 'concrete' }); return; }
  if (v === 'post') {   // flexible road delineator post
    K.cyl('p_plastic_dark', 0, 0, 0, .12, .04, { seg: 12 });
    K.cyl('p_plastic_milky', 0, .04, 0, .045, 1.0, { seg: 10, r2: .04 });
    for (const y of [.75, .88]) K.cyl('p_em_dim', 0, y, 0, .047, .05, { seg: 10 });
    K.noCast('p_em_dim');
    return;
  }
  const yellow = v === 'yellow';
  K.lathe(yellow ? 'paint_yellow' : 'steel_dark', [[.085, 0], [.085, .95], [.07, 1.0], [0, 1.02]], { seg: 14 });
  if (yellow) for (const y of [.65, .8]) K.lathe('paint_black', [[.087, y], [.087, y + .07]], { seg: 14, caps: false });
  else K.lathe('p_em_dim', [[.087, .82], [.087, .86]], { seg: 14, caps: false });
  K.ccyl(0, 0, 0, .09, 1.0, { surf: 'metal' });
}
function cone(K, o, v, rnd) {
  if (v === 'drum') {      // channelizer drum
    K.cyl('p_plastic_dark', 0, 0, 0, .3, .08, { seg: 14 });
    K.lathe('p_plastic_orange', [[.26, .08], [.24, .95], [.2, 1.0], [0, 1.02]], { seg: 16 });
    for (const y of [.3, .6]) K.lathe('p_plastic_milky', [[.257, y], [.248, y + .12]], { seg: 16, caps: false });
    K.ccyl(0, 0, 0, .27, 1.0, { surf: 'rubber' });
    return;
  }
  if (v === 'sawhorse') {
    for (const s of [-1, 1]) { K.push(s * .55, 0, 0); for (const a of [-1, 1]) { K.push(0, 0, 0, 0, a * .25); K.box('p_galv', 0, 0, 0, .04, 1.0, .04); K.pop(); } K.pop(); }
    for (let i = 0; i < 6; i++) K.box(i % 2 ? 'paint_white' : 'paint_red', -.6 + .1 + i * .2, .78, .03, .2, .2, .02);
    K.box('p_lens_amber', .55, 1.0, 0, .12, .1, .05);
    K.col(0, 0, 0, 1.25, 1.0, .5, { surf: 'metal' });
    return;
  }
  const h = v === 'small' ? .45 : .72, r = h * .2;
  K.box('p_plastic_dark', 0, 0, 0, h * .55, .03, h * .55, { bev: .01 });
  K.lathe('p_plastic_orange', [[r, .03], [r * .12, h], [0, h]], { seg: 16 });
  for (const f of [.45, .7]) K.lathe('p_plastic_milky', [[r * (1 - f * .88) + .002, .03 + (h - .03) * f], [r * (1 - (f + .1) * .88) + .002, .03 + (h - .03) * (f + .1)]], { seg: 16, caps: false });
}

// ------------------------------------------------------------------------------------------------ street lighting and signals
function streetLight(K, o, v, rnd) {
  const on = o.on !== false;
  if (v === 'park') {
    K.lathe('paint_black', [[.12, 0], [.12, .3], [.07, .4], [.05, 3.2], [.07, 3.3]], { seg: 12 });
    K.lathe('paint_black', [[.12, 3.3], [.18, 3.45], [.06, 3.95], [.0, 4.0]], { seg: 6, sharp: 20 });
    K.cyl(on ? 'emissive_warm' : 'p_lens_clear', 0, 3.4, 0, .13, .45, { seg: 6 }); K.noCast('emissive_warm');
    K.ccyl(0, 0, 0, .12, 3.3, { surf: 'metal' });
    if (o.light) K.light({ x: 0, y: 3.35, z: 0, type: 'point', fixture: false, intensity: o.intensity || 14, color: [1, .82, .6] });
    return;
  }
  const H = o.h || 8, arms = v === 'double' ? [-1, 1] : [1], arm = 1.6;
  K.cyl('p_concrete_precast', 0, 0, 0, .25, .3, { seg: 12 });
  K.lathe('p_galv', [[.13, .3], [.13, .6], [.11, .7], [.075, H]], { seg: 12 });
  K.box('p_galv', 0, .9, .1, .08, .25, .03); bolts(K, 'steel_dark', [[0, 1.0, .118]], .01, 'z');
  for (const s of arms) {
    K.tube('p_galv', [[0, H - .4, 0], [0, H - .1, s * .25], [0, H + .1, s * .7], [0, H + .15, s * arm]], .045, { seg: 8 });
    lampHead(K, 0, H + .12, s * (arm + .25), { ry: s > 0 ? 0 : PI, on, warm: o.warm !== false });
    if (o.light) K.light({ type: 'spot', x: 0, y: H + .05, z: s * (arm + .25), dir: [0, -1, s * .15], angle: 1.9, intensity: o.intensity || 60, color: o.warm === false ? [.92, .95, 1] : [1, .78, .52], fixture: false, range: H * 3.2 });
  }
  K.ccyl(0, 0, 0, .14, H, { surf: 'metal' });
}
function signalHead(K, x, y, z, state, ry = 0) {
  K.push(x, y, z, ry);
  K.box('paint_black', 0, 0, 0, .32, .95, .25, { bev: .02 });
  K.box('paint_black', 0, -.05, -.13, .48, 1.05, .02);
  const st = { red: 0, amber: 1, green: 2 }[state];
  [['emissive_red', 'p_lens_red'], ['p_em_amber', 'p_lens_amber'], ['emissive_green', 'p_screen']].forEach(([lit, off], i) => {
    const y2 = .78 - i * .3;
    K.cylZ(st === i ? lit : off, .12, .135, 0, y2, .1, { seg: 14 });
    K.lathe('paint_black', [[.12, -.0], [.12, .16]], { rx: PI / 2, y: y2, z: .13, a0: PI * .1, a1: PI * .9, seg: 8 });
  });
  K.pop();
}
function trafficLight(K, o, v, rnd) {
  const state = o.state || 'red';
  K.noCast('emissive_red'); K.noCast('emissive_green'); K.noCast('p_em_amber');
  if (v === 'mast') {
    const H = 6.2, L = o.len || 6;
    K.cyl('p_concrete_precast', 0, 0, 0, .3, .3, { seg: 12 });
    K.lathe('p_galv', [[.16, .3], [.13, H]], { seg: 12 });
    K.tube('p_galv', [[0, H - .2, 0], [L * .3, H - .05, 0], [L, H, 0]], .08, { seg: 8 });
    K.tube('p_galv', [[0, H - 1.2, 0], [L * .25, H - .25, 0]], .04, { seg: 6 });
    for (const f of [.55, .95]) signalHead(K, L * f, H - 1.1, .02, state);
    K.box('p_paint_darkgrey', L * .75, H + .05, 0, .9, .25, .04); K.decal('sign_street_' + Math.floor(rnd() * 6), L * .75, H + .17, .025, .88, .17);
    K.ccyl(0, 0, 0, .16, H, { surf: 'metal' });
    return;
  }
  K.lathe('p_galv', [[.07, 0], [.07, 3.5]], { seg: 10 });
  signalHead(K, 0, 2.4, .14, state);
  K.box('paint_black', .19, 1.1, .05, .24, .42, .22, { bev: .02 });
  K.cylZ(state === 'red' ? 'emissive_red' : 'p_lens_red', .16, .17, .19, 1.4, .06, { seg: 10 });
  K.cylZ(state === 'green' ? 'emissive_white' : 'p_screen', .16, .17, .19, 1.2, .06, { seg: 10 });
  K.box('paint_yellow', 0, 1.0, -.1, .14, .2, .08, { bev: .02 });
  K.ccyl(0, 0, 0, .08, 3.5, { surf: 'metal' });
}
const SIGNS = { stop: ['oct', 'sign_stop', .75], yield: ['tri', 'sign_yield', .9], noentry: ['circle', 'sign_noentry', .75], speed30: ['circle', 'sign_speed30', .75], speed50: ['circle', 'sign_speed50', .75],
  parking: ['rect', 'sign_parking', .6], warn: ['tri', 'sign_warn', .9], ped: ['rect', 'sign_ped', .6], oneway: ['wide', 'sign_oneway', 1.0], street: ['street', null, .9] };
function roadSign(K, o, v, rnd) {
  const kind = SIGNS[v] ? v : 'stop', [shape, slot, sz] = SIGNS[kind];
  const H = o.h || 2.3;
  K.cyl('p_galv', 0, 0, 0, .03, H + (shape === 'street' ? .5 : sz / 2), { seg: 8 });
  if (shape === 'street') {
    for (const [ry, i] of [[0, 0], [PI / 2, 1]]) {
      K.push(0, H + .25 + i * .2, 0, ry);
      K.box('p_alu', 0, 0, 0, .92, .18, .015);
      const n = Math.floor(rnd() * 6);
      K.decal('sign_street_' + n, 0, .09, .009, .9, .17); K.decal('sign_street_' + n, 0, .09, -.009, .9, .17, { face: 's' });
      K.pop();
    }
    K.ccyl(0, 0, 0, .04, H, { surf: 'metal' });
    return;
  }
  const y = H, z = .045;
  K.push(0, y, z);
  if (shape === 'circle') K.lathe('p_alu', [[sz / 2, 0], [sz / 2, .012]], { rx: PI / 2, seg: 24 });
  else if (shape === 'oct') { const p = []; for (let i = 0; i < 8; i++) { const a = PI / 8 + i * PI / 4; p.push([Math.cos(a) * sz / 2, Math.sin(a) * sz / 2]); } K.ext('p_alu', p, -.006, .006); }
  else if (shape === 'tri') { const t = kind === 'yield' ? [[-sz / 2, sz * .38], [sz / 2, sz * .38], [0, -sz * .48]] : [[-sz / 2, -sz * .38], [sz / 2, -sz * .38], [0, sz * .48]]; K.ext('p_alu', t, -.006, .006); }
  else if (shape === 'wide') K.box('p_alu', 0, -sz * .13, 0, sz, sz * .26, .012);
  else K.box('p_alu', 0, -sz / 2, 0, sz, sz, .012, { bev: .004 });
  const dh = shape === 'wide' ? sz * .25 : sz;
  K.decal(slot, 0, 0, shape === 'circle' ? .0135 : .0075, sz, dh);
  K.box('p_galv', 0, -.06, -.03, .06, .12, .04); K.box('p_galv', 0, -sz * .35, -.03, .06, .08, .04);
  K.pop();
  K.ccyl(0, 0, 0, .04, H, { surf: 'metal' });
}

// ------------------------------------------------------------------------------------------------ furniture of the street
function bench(K, o, v, rnd) {
  const L = o.len || 1.8;
  if (v === 'concrete') { K.box('p_concrete_precast', 0, 0, 0, L, .45, .5, { bev: .03 }); K.box('p_wood_light', 0, .45, 0, L - .1, .05, .44, { bev: .01 }); K.col(0, 0, 0, L, .5, .5, { surf: 'concrete' }); return; }
  const metal = v === 'metal', frame = metal ? 'p_paint_darkgrey' : 'paint_black';
  for (const x of [-L / 2 + .15, L / 2 - .15]) {
    K.tube(frame, [[x, 0, .25], [x, .43, .2], [x, .43, -.2], [x, 0, -.22]], .025, { seg: 6 });
    K.tube(frame, [[x, .43, -.2], [x, .85, -.32]], .022, { seg: 6 });
    K.tube(frame, [[x, .43, .18], [x, .62, .12], [x, .65, -.05]], .018, { seg: 5 });
  }
  if (metal) {
    K.push(0, .44, 0); K.box('grate', 0, 0, 0, L, .02, .42); K.pop();
    K.push(0, .64, -.27, 0, -.3, 0); K.box('grate', 0, -.18, 0, L, .4, .02); K.pop();
  } else {
    for (let i = 0; i < 4; i++) K.box('p_wood_walnut', 0, .43, -.15 + i * .105, L, .04, .085, { bev: .008 });
    for (let i = 0; i < 3; i++) { K.push(0, .55 + i * .11, -.26 - i * .03, 0, -.25, 0); K.box('p_wood_walnut', 0, 0, 0, L, .085, .035, { bev: .008 }); K.pop(); }
  }
  K.col(0, 0, 0, L, .47, .5, { surf: metal ? 'metal' : 'wood' });
  K.col(0, .47, -.27, L, .42, .1, { surf: metal ? 'metal' : 'wood' });
}
function busShelter(K, o, v, rnd) {
  const L = 3.6, D = 1.5, H = 2.4, fr = 'p_alu';
  for (const x of [-L / 2, L / 2]) for (const z of [-D / 2, D / 2 - .2]) K.box(fr, x, 0, z, .07, H, .07);
  K.box(fr, 0, H, -.05, L + .3, .08, D + .1, { bev: .02 }); K.box('p_glass_tint', 0, H + .08, -.05, L + .2, .02, D);
  K.box('glass', 0, .12, -D / 2, L - .06, H - .2, .02);
  K.box(fr, 0, .1, -D / 2, L, .05, .05); K.box(fr, 0, H - .1, -D / 2, L, .05, .05);
  K.box('glass', -L / 2, .12, -.1, .02, H - .2, D - .3);
  K.box(fr, L / 2, .1, -.15, .1, H - .1, 1.2);                 // advertising panel at the +x end
  K.decal('ad_panel', L / 2 + .052, 1.2, -.15, .9, 1.6, { face: 'e', glow: true }); K.decal('ad_panel', L / 2 - .052, 1.2, -.15, .9, 1.6, { face: 'w', glow: true });
  for (let i = 0; i < 2; i++) K.box('p_wood_walnut', -.4, .45, -D / 2 + .2 + i * .1, 2.0, .04, .08, { bev: .006 });
  for (const x of [-1.3, .5]) K.box(fr, x, 0, -D / 2 + .25, .05, .45, .05);
  K.box('p_paint_darkgrey', -L / 2 + .3, H + .1, D / 2 - .1, .45, .45, .03); K.decal('sign_street_1', -L / 2 + .3, H + .32, D / 2 - .08, .44, .1);
  K.noCast('glass'); K.noCast('p_glass_tint');
  K.col(0, 0, -D / 2, L, H, .06, { surf: 'glass' });
  K.col(-L / 2, 0, -.1, .06, H, D - .3, { surf: 'glass' });
  K.col(L / 2, 0, -.15, .12, H, 1.2, { surf: 'metal' });
  K.col(-.4, 0, -D / 2 + .25, 2.0, .48, .3, { surf: 'wood' });
  K.col(0, H, -.05, L + .3, .1, D + .1, { surf: 'metal' });
}
function utilityPole(K, o, v, rnd) {
  const H = o.h || 10, mat = v === 'concrete' ? 'p_concrete_precast' : 'p_wood_sleeper';
  K.lathe(mat, [[.15, 0], [.13, H * .5], [.11, H]], { seg: 10 });
  K.box(mat, 0, H - .7, .14, 2.2, .1, .1, { bev: .01 });
  K.tube('steel_dark', [[-.6, H - .65, .14], [0, H - 1.3, .12], [.6, H - .65, .14]], .012, { seg: 4 });
  for (const x of [-1.0, -.35, .35, 1.0]) { K.cyl('p_porcelain', x, H - .6, .14, .04, .1, { seg: 8 }); K.cyl('p_plastic_dark', x, H - .5, .14, .05, .03, { seg: 8 }); }
  if (o.transformer || v === 'transformer') {
    K.cyl('p_paint_grey', 0, H - 2.6, -.42, .3, .95, { seg: 14 }); K.cyl('p_paint_grey', 0, H - 1.65, -.42, .33, .05, { seg: 14 });
    K.box('steel_dark', 0, H - 2.3, -.15, .1, .5, .12);
    for (const x of [-.12, .12]) K.cyl('p_porcelain', x, H - 1.6, -.42, .03, .12, { seg: 8 });
  }
  for (let y = 2.4; y < H - 1.2; y += .45) K.cylX('steel_dark', -.16, .16, y, 0, .012, { seg: 4 });
  K.decal('flyer_' + Math.floor(rnd() * 2), 0, 1.6, .155, .2, .28);
  // wires to the next pole along +z (span) and back half a span: catenaries
  const span = o.span || 0;
  if (span) for (const x of [-1.0, -.35, .35, 1.0]) {
    const pts = []; for (let i = 0; i <= 12; i++) { const t = i / 12, z = t * span; pts.push([x, H - .5 - Math.sin(t * PI) * span * .025, .14 + z]); }
    K.tube('paint_black', pts, .009, { seg: 4 });
  }
  K.ccyl(0, 0, 0, .16, H, { surf: 'wood' });
}
function hydrant(K, o, v, rnd) {
  const mat = v === 'yellow' ? 'paint_yellow' : v === 'silver' ? 'p_alu' : 'paint_red';
  K.cyl('steel_dark', 0, 0, 0, .14, .06, { seg: 12 });
  K.lathe(mat, [[.13, .06], [.12, .1], [.1, .12], [.1, .55], [.12, .58], [.12, .62], [.09, .7], [.05, .78], [0, .8]], { seg: 16, sharp: 40 });
  K.cyl('steel_dark', 0, .78, 0, .022, .05, { seg: 5 });
  for (const [ry, r, l] of [[0, .06, .1], [PI / 2, .04, .08], [-PI / 2, .04, .08]]) { K.push(0, .42, 0, ry); K.cylZ(mat, .08, .08 + l, 0, 0, r, { seg: 10 }); K.cylZ('steel_dark', .08 + l, .1 + l, 0, 0, r * .9, { seg: 5 }); K.pop(); }
  K.ccyl(0, 0, 0, .14, .8, { surf: 'metal' });
}
function mailbox(K, o, v, rnd) {
  if (v === 'post') {   // residential mailbox on a wooden post
    K.box('p_wood_sleeper', 0, 0, 0, .09, 1.05, .09, { bev: .006 });
    K.box('p_wood_sleeper', 0, .98, 0, .2, .04, .45);
    K.push(0, 1.02, 0, PI / 2); K.ext('p_paint_grey', [[-.11, 0], [.11, 0], [.11, .14], [.08, .2], [0, .23], [-.08, .2], [-.11, .14]], -.24, .24); K.pop();
    K.box('paint_red', .12, 1.12, -.1, .02, .14, .04);
    return;
  }
  // street collection box (generic, no agency marks)
  const mat = v === 'red' ? 'paint_red' : 'p_car_blue';
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) K.box(mat, sx * .2, 0, sz * .18, .05, .3, .05);
  K.push(0, .28, 0, PI / 2);
  K.ext(mat, [[-.25, 0], [.25, 0], [.25, .78], [.18, .88], [0, .92], [-.18, .88], [-.25, .78]], -.27, .27, { smooth: 30 });
  K.pop();
  K.box(mat, 0, .9, .26, .36, .1, .06, { bev: .01, rx: -.3 }); K.box('p_plastic_dark', 0, .93, .29, .3, .025, .02, { rx: -.3 });
  K.decal('sign_keepout', 0, .55, .252, .2, .1);
  K.col(0, 0, 0, .56, 1.2, .52, { surf: 'metal' });
}
function vending(K, o, v, rnd) {
  const W = .95, H = 1.83, D = .85, mat = v === 'snacks' ? 'p_paint_darkgrey' : 'paint_red', on = o.on !== false;
  K.box(mat, 0, 0, 0, W, H, D, { bev: .02 });
  K.box('p_glass_tint', -.1, .55, D / 2 + .005, .62, 1.15, .02);
  K.decal(v === 'snacks' ? 'vend_snacks' : 'vend_drinks', -.1, 1.125, D / 2 - .005, .6, 1.13, { glow: on });
  K.box('p_plastic_dark', .32, .55, D / 2 + .01, .22, 1.15, .02);
  K.box('p_chrome', .32, 1.25, D / 2 + .02, .12, .2, .01); K.box('p_screen', .32, 1.5, D / 2 + .02, .12, .06, .01);
  for (let i = 0; i < 9; i++) K.box('p_plastic_grey', .28 + (i % 3) * .04, 1.05 - Math.floor(i / 3) * .05, D / 2 + .02, .03, .03, .01);
  K.box('p_plastic_dark', -.1, .1, D / 2 - .01, .6, .3, .04); K.box('p_glass_dark', -.1, .14, D / 2 + .02, .5, .2, .01);
  K.box('steel_dark', 0, 0, 0, W - .04, .06, D - .04);
  K.col(0, 0, 0, W, H, D, { surf: 'sheetmetal' });
}
function atm(K, o, v, rnd) {
  if (v === 'wall') {    // fascia for a wall opening: put it flush against a wall facing +z
    K.box('p_stainless', 0, .8, 0, .7, .9, .12, { bev: .01 });
    K.box('p_plastic_dark', 0, 1.3, .06, .4, .3, .03, { rx: -.2 }); K.decal('scr_atm', 0, 1.45, .078, .32, .24, { glow: true, rx: -.2 });
    for (let i = 0; i < 12; i++) K.box('p_chrome', -.06 + (i % 3) * .05, .95 + Math.floor(i / 3) * .045, .065, .04, .035, .02);
    K.box('p_plastic_dark', .2, 1.15, .065, .1, .015, .02); K.box('p_plastic_dark', 0, .86, .065, .3, .02, .02);
    K.decal('atm_panel', 0, 1.65, .062, .5, .19);
    return;
  }
  K.box('p_paint_darkgrey', 0, 0, 0, .7, 1.45, .75, { bev: .02 });
  K.box('p_stainless', 0, .82, .2, .66, .6, .3, { bev: .01 });
  K.push(0, 1.32, .25, 0, -.35, 0); K.box('p_plastic_dark', 0, 0, 0, .44, .32, .05); K.decal('scr_atm', 0, .16, .026, .36, .27, { glow: o.on !== false }); K.pop();
  for (let i = 0; i < 12; i++) K.box('p_chrome', -.06 + (i % 3) * .05, 1.0 + Math.floor(i / 3) * .045, .37, .04, .035, .02);
  K.box('p_plastic_dark', .22, 1.2, .37, .1, .015, .02); K.box('p_plastic_dark', 0, .9, .37, .3, .025, .02);
  K.box('p_paint_darkgrey', 0, 1.45, 0, .74, .32, .8, { bev: .02 }); K.decal('atm_panel', 0, 1.61, .405, .6, .22);
  K.box('p_paint_darkgrey', 0, 1.7, .25, .74, .04, .4);
  K.col(0, 0, 0, .74, 1.77, .8, { surf: 'metal' });
}
function newsBox(K, o, v, rnd) {
  const mat = { blue: 'p_car_blue', red: 'paint_red', yellow: 'paint_yellow', green: 'paint_green' }[v] || 'p_car_blue';
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) K.box('steel_dark', sx * .2, 0, sz * .16, .03, .38, .03);
  K.box(mat, 0, .36, 0, .5, .62, .44, { bev: .02 });
  K.box(mat, 0, .98, -.02, .52, .06, .48, { bev: .015 });
  K.box('glass', 0, .62, .222, .38, .3, .01); K.decal('news_box', 0, .77, .215, .36, .16);
  K.box('p_chrome', 0, .53, .225, .3, .03, .03); K.box('p_chrome', .17, .85, .222, .06, .08, .02);
  K.noCast('glass');
  K.col(0, 0, 0, .5, 1.04, .46, { surf: 'sheetmetal' });
}
function litterBin(K, o, v, rnd) {
  if (v === 'square') {
    K.box('p_paint_darkgrey', 0, 0, 0, .55, .9, .55, { bev: .015 });
    for (let i = 0; i < 4; i++) { K.push(0, 0, 0, i * PI / 2); for (let k = 0; k < 6; k++) K.box('steel_dark', -.2 + k * .08, .15, .276, .03, .6, .005); K.pop(); }
    K.box('p_paint_darkgrey', 0, .9, 0, .58, .08, .58, { bev: .02 }); K.box('p_plastic_dark', 0, .92, .2, .3, .05, .01);
    K.col(0, 0, 0, .58, .98, .58, { surf: 'metal' });
    return;
  }
  K.cyl('steel_dark', 0, 0, 0, .24, .05, { seg: 14 });
  for (let i = 0; i < 18; i++) { const a = i * PI * 2 / 18; K.box('paint_black', Math.cos(a) * .25, .05, Math.sin(a) * .25, .025, .8, .02, { ry: -a + PI / 2 }); }
  for (const y of [.08, .8]) K.ring('paint_black', 0, y, 0, .25, .015, { seg: 18 });
  K.lathe('p_galv', [[.23, .1], [.23, .82]], { seg: 14, caps: false });
  K.lathe('paint_black', [[.27, .85], [.26, .9], [.15, .95], [0, .97]], { seg: 16 });
  K.ccyl(0, 0, 0, .27, .95, { surf: 'metal' });
}
function planter(K, o, v, rnd) {
  const L = o.len || 1.4, W = .6;
  K.box('p_concrete_precast', 0, 0, 0, L, .55, W, { bev: .03 });
  K.box('p_soil', 0, .5, 0, L - .1, .04, W - .1);
  for (let i = 0; i < Math.round(L * 7); i++) {
    const x = (rnd() - .5) * (L - .2), z = (rnd() - .5) * (W - .2), h = .35 + rnd() * .3, a = rnd() * PI;
    K.card(x, .5, z, h * 1.1, h, rnd() < .5 ? 0 : 1, { ry: a, base: true, n: [Math.cos(a) * .3, 1, Math.sin(a) * .3] });
  }
  K.col(0, 0, 0, L, .55, W, { surf: 'concrete' });
}
function manhole(K, o, v, rnd) {
  K.cyl('steel_dark', 0, 0, 0, .34, .012, { seg: 20 });
  for (let i = 0; i < 5; i++) K.box('p_rail', 0, .012, -.24 + i * .12, .5 - Math.abs(i - 2) * .08, .004, .04);
}

export default [
  { type: 'jersey_barrier', alias: ['barrier'], cat: 'street', size: [3.0, .81, .61], vary: true, keys: ['len', 'color'], desc: 'precast concrete F-shape barrier (runs along x), or a water-filled plastic one (2 m)',
    variants: ['concrete', 'plastic'], opts: { len: 'length', color: "plastic: 'red' | 'white'" }, sizeOf: (o, v) => v === 'plastic' ? [o.len || 2, .82, .5] : [o.len || 3, .81, .61], build: jersey },
  { type: 'sandbags', cat: 'military', size: [2.4, .8, .78], vary: true, keys: ['len', 'h', 'thick', 'curve'], desc: 'sandbag wall (running bond) along x, straight or curved (bunker ring)',
    opts: { len: 'length (2.4; rounded to .6 m bags)', h: 'height (.85)', thick: 'bags deep (2)', curve: 'arc radius (0 = straight)' }, build: sandbags },
  { type: 'hesco', cat: 'military', size: [3.18, 1.06, 1.06], keys: ['n', 'rows'], desc: 'HESCO-style mesh gabion wall: n 1.06 m cells along x, 1 or 2 high, sand / dirt filled',
    variants: ['sand', 'dirt'], opts: { n: 'cells (3)', rows: '1 | 2' }, sizeOf: o => [(o.n || 3) * 1.06, (o.rows === 2 ? 2 : 1) * 1.06, 1.06], build: hesco },
  { type: 'fence_chainlink', alias: ['fence'], cat: 'street', size: [3, 2.1, .1], keys: ['len', 'h', 'barb'], desc: 'chain-link fence (posts every 3 m, top rail; see-through: rays pass), barbed = 3 strands on outriggers',
    variants: ['plain', 'barbed'], opts: { len: 'length (3)', h: 'height (2.1)' }, sizeOf: o => [o.len || 3, (o.h || 2.1) + .4, .3], build: fenceChain },
  { type: 'fence_wood', cat: 'street', size: [2.4, 1.8, .15], vary: true, keys: ['len', 'h'], desc: 'wooden privacy board fence (1.8 m) or white picket fence (1.0 m)', variants: ['privacy', 'picket'],
    opts: { len: 'length (2.4)', h: 'height' }, sizeOf: (o, v) => [o.len || 2.4, o.h || (v === 'picket' ? 1.0 : 1.8), .15], build: fenceWood },
  { type: 'gate', cat: 'street', size: [4, 2.2, .2], keys: ['len', 'h', 'open'], desc: "double chain-link gate in posts, 5-bar farm gate (hinge at -x), or a boom 'barrier'",
    variants: ['chainlink', 'farm', 'barrier'], opts: { open: 'degrees (0 = closed; barrier: truthy = raised)', len: 'opening width' }, build: gate },
  { type: 'bollard', cat: 'street', size: [.2, 1.0, .2], desc: 'steel / yellow-banded bollard, concrete dome bollard, or a flexible delineator post', variants: ['steel', 'yellow', 'concrete', 'post'], build: bollard },
  { type: 'cone', alias: ['traffic_cone'], cat: 'street', size: [.4, .72, .4], desc: 'traffic cone (no collider), channelizer drum, or striped sawhorse barricade', variants: ['cone', 'small', 'drum', 'sawhorse'],
    sizeOf: (o, v) => v === 'drum' ? [.6, 1.0, .6] : v === 'sawhorse' ? [1.25, 1.0, .5] : v === 'small' ? [.25, .45, .25] : [.4, .72, .4], build: cone },
  { type: 'street_light', cat: 'street', size: [.5, 8.3, 2.2], keys: ['h', 'on', 'light', 'intensity', 'warm'], desc: 'galvanised street light (single / double arm, lamp toward +z) or a park lamp; light = also a B.light',
    variants: ['single', 'double', 'park'], opts: { h: 'pole height (8)', on: 'false = lamp unlit', light: 'true = add a real spot light', intensity: 'light intensity (60)', warm: 'false = cold white' },
    sizeOf: (o, v) => v === 'park' ? [.4, 4, .4] : [.5, (o.h || 8) + .3, v === 'double' ? 4.4 : 2.2], build: streetLight },
  { type: 'traffic_light', cat: 'street', size: [.5, 3.5, .5], keys: ['state', 'len'], desc: 'signal on a pole (with a pedestrian head) or a mast arm over the road (+x) with two heads',
    variants: ['pole', 'mast'], opts: { state: "'red' | 'amber' | 'green' | 'off'", len: 'mast arm length (6)' }, sizeOf: (o, v) => v === 'mast' ? [(o.len || 6) + .5, 6.4, .5] : [.5, 3.5, .5], build: trafficLight },
  { type: 'road_sign', cat: 'street', size: [.75, 2.7, .1], vary: true, keys: ['h'], desc: 'sign on a galvanised post (generic designs, fictional street names)', variants: Object.keys(SIGNS), opts: { h: 'height of the sign centre (2.3)' }, build: roadSign },
  { type: 'bench', cat: 'street', size: [1.8, .9, .6], keys: ['len'], desc: 'park bench (slats on cast frames), perforated metal bench, or a concrete block bench', variants: ['park', 'metal', 'concrete'], opts: { len: 'length' }, build: bench },
  { type: 'bus_shelter', cat: 'street', size: [3.7, 2.5, 1.6], desc: 'glass bus shelter (open to +z) with a lit advertising panel and a bench', build: busShelter },
  { type: 'utility_pole', alias: ['power_pole'], cat: 'street', size: [2.2, 10, .5], vary: true, keys: ['h', 'span', 'transformer'], desc: 'wooden / concrete utility pole with a crossarm and insulators; span = wires to the next pole along +z',
    variants: ['wood', 'concrete', 'transformer'], opts: { h: 'height (10)', span: 'metres to the next pole (wires drawn)', transformer: 'pole-top transformer' }, sizeOf: o => [2.2, o.h || 10, (o.span || 0) + .5], build: utilityPole },
  { type: 'fire_hydrant', alias: ['hydrant'], cat: 'street', size: [.32, .8, .32], desc: 'fire hydrant', variants: ['red', 'yellow', 'silver'], build: hydrant },
  { type: 'mailbox', cat: 'street', size: [.56, 1.2, .55], desc: 'street collection box (generic) or a residential mailbox on a post', variants: ['blue', 'red', 'post'], build: mailbox },
  { type: 'vending_machine', cat: 'street', size: [.95, 1.83, .85], keys: ['on'], desc: 'drinks / snack vending machine with a lit front (fictional brands)', variants: ['drinks', 'snacks'], opts: { on: 'false = front unlit' }, build: vending },
  { type: 'atm', cat: 'street', size: [.74, 1.77, .8], desc: 'freestanding cash machine kiosk, or a wall fascia (put it against a wall)', variants: ['kiosk', 'wall'], build: atm },
  { type: 'newspaper_box', cat: 'street', size: [.52, 1.04, .48], desc: 'newspaper vending box on legs', variants: ['blue', 'red', 'yellow', 'green'], build: newsBox },
  { type: 'litter_bin', cat: 'street', size: [.55, .97, .55], desc: 'round slatted litter bin or a square steel one', variants: ['round', 'square'], build: litterBin },
  { type: 'planter', cat: 'street', size: [1.4, .9, .6], vary: true, keys: ['len'], desc: 'concrete planter with leafy shrubs', opts: { len: 'length' }, build: planter },
  { type: 'manhole', cat: 'street', size: [.7, .02, .7], desc: 'cast iron manhole cover (flat, no collider)', build: manhole },
];
