/* LIVE FIRE — industrial / warehouse / port props (catalogue for js/maps/props.js).
   Exports: default [prop definitions]  ({ type, cat, size, desc, variants, opts, keys, vary, sizeOf, build(K, o, v, rnd) })
   Local space: origin = base centre, +y up, front = +z, metres. */
import { corrugated, bolts, handle, louvres, wheel, railing, ladder, stackBoxes, grid } from './parts.js';

const PI = Math.PI;
const CMAT = { green: 'container', red: 'container_red', blue: 'container_blue', orange: 'container_orange', grey: 'container_grey', white: 'p_cont_white', rust: 'p_cont_rust' };

// ------------------------------------------------------------------------------------------------ shipping container
function containerDoor(K, mat, hingeX, side, z, w, h, ang, code) {
  // side = +1 right leaf (hinge at +x, leaf extends to -x), -1 left leaf
  K.push(hingeX, .2, z, side > 0 ? ang : -ang);
  const cx = -side * w / 2;
  K.box(mat, cx, 0, .02, w - .01, h, .05, { bev: .01 });
  for (let i = 0; i < 5; i++) K.box(mat, cx, .25 + i * (h - .45) / 4, .05, w - .14, .06, .02, { bev: .008 });
  for (const f of [.28, .72]) {                              // locking bars with cam keepers and handles
    const bx = cx + side * (f - .5) * w * .9;
    K.cyl('steel_dark', bx, -.1, .085, .019, h + .2, { seg: 8 });
    K.box('steel_dark', bx, -.12, .07, .09, .07, .06, { bev: .01 }); K.box('steel_dark', bx, h + .03, .07, .09, .07, .06, { bev: .01 });
    K.box('steel_dark', bx + side * .05, 1.0, .1, .14, .04, .04, { bev: .008 });
    K.box('steel_dark', bx + side * .1, .98, .085, .03, .08, .03);
  }
  for (const yy of [.15, h * .35, h * .65, h - .2]) K.box('steel_dark', -side * .02, yy, .045, .1, .12, .05, { bev: .01 });
  if (code) K.decal('cont_code_' + code[0], cx, h - .35, .062, .95, .21);
  if (code && side < 0) K.decal('cont_plate', cx + .25, 1.45, .062, .2, .15);
  K.pop();
}
function container(K, o, v, rnd) {
  const L = +o.len === 40 ? 12.192 : 6.058, W = 2.438, H = o.hc ? 2.896 : 2.591, hw = W / 2, hl = L / 2, mat = CMAT[v] || 'container';
  const code = String(Math.floor(rnd() * 4)), logo = Math.floor(rnd() * 4);
  // frame: bottom side rails, front sill, door sill, top rails, headers, corner posts, castings
  for (const s of [-1, 1]) {
    K.box(mat, s * (hw - .08), 0, 0, .16, .17, L - .3, { bev: .01 });
    K.box(mat, s * (hw - .055), H - .13, 0, .11, .11, L - .3, { bev: .01 });
  }
  K.box(mat, 0, 0, -hl + .09, W - .3, .17, .18, { bev: .01 });
  K.box(mat, 0, 0, hl - .11, W - .3, .2, .2, { bev: .01 });
  K.box(mat, 0, H - .13, -hl + .07, W - .3, .11, .14, { bev: .01 });
  K.box(mat, 0, H - .24, hl - .11, W - .3, .24, .2, { bev: .01 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    K.box(mat, sx * (hw - .075), .118, sz * (hl - .08), .15, H - .236, .16, { bev: .012 });
    for (const yy of [0, H - .118]) K.box('steel_dark', sx * (hw - .089), yy, sz * (hl - .081), .178, .118, .162, { bev: .01 });
  }
  // corrugated side walls and front end wall (both faces: open containers show the inside)
  for (const s of [-1, 1]) { K.push(s * (hw - .05), 0, 0, s * PI / 2); corrugated(K, mat, -hl + .16, hl - .16, .17, H - .13, 0, { caps: false }); K.pop(); }
  K.push(0, 0, -hl + .05, PI); corrugated(K, mat, -hw + .15, hw - .15, .17, H - .13, 0, { caps: false, pitch: .3 }); K.pop();
  // roof with stamped cross dents, plywood floor
  K.box(mat, 0, H - .06, 0, W - .16, .03, L - .2);
  for (let z = -hl + .5; z < hl - .3; z += .55) K.box(mat, 0, H - .035, z, W - .4, .012, .2, { bev: .005 });
  K.box('plywood', 0, .12, 0, W - .14, .04, L - .3);
  // doors
  const dw = hw - .026, dh = H - .46, doors = o.doors || 'closed';   // the two leaves meet in the middle (1.2 cm seam)
  if (doors !== 'none') {
    const aR = doors === 'open' ? 1.5 * PI - .05 : doors === 'ajar' ? 1.75 : 0, aL = doors === 'open' ? 1.5 * PI - .05 : 0;
    containerDoor(K, mat, hw - .02, 1, hl - .02, dw, dh, aR, code);
    containerDoor(K, mat, -hw + .02, -1, hl - .02, dw, dh, aL, null);
    for (const s of [-1, 1]) for (const yy of [.3, H * .35, H * .65, H - .45]) K.box('steel_dark', s * (hw - .01), yy, hl - .03, .05, .1, .05);
  }
  // markings: logo + code on both sides, a hazard label on some
  for (const s of [-1, 1]) {
    const f = s > 0 ? 'e' : 'w', x = s * (hw - .01);
    K.decal('cont_logo_' + logo, x, H * .55, 0, Math.min(3.2, L * .5), 1.2, { face: f });
    K.decal('cont_code_' + code, x, H - .45, s * (L / 2 - 1.0), 1.0, .22, { face: f });
    if (rnd() < .25) K.decal(rnd() < .5 ? 'haz_flame' : 'un_plate', x, 1.2, -s * (L / 2 - .7), .25, .25 * (rnd() < .5 ? 1 : .7), { face: f });
  }
  // colliders
  if (doors === 'closed') K.col(0, 0, 0, W, H, L, { surf: 'sheetmetal' });
  else {
    K.col(0, 0, 0, W, .16, L, { surf: 'sheetmetal' });
    for (const s of [-1, 1]) K.col(s * (hw - .04), .16, 0, .08, H - .16, L, { surf: 'sheetmetal' });
    K.col(0, .16, -hl + .05, W, H - .16, .1, { surf: 'sheetmetal' });
    K.col(0, H - .1, 0, W, .1, L, { surf: 'sheetmetal' });
    if (doors === 'open') for (const s of [-1, 1]) K.col(s * (hw + .1), .2, hl - dw / 2, .1, dh, dw, { surf: 'sheetmetal' });
    if (doors === 'ajar') { const a = 1.75; K.col(hw - .02 - Math.cos(a) * dw / 2, .2, hl + Math.sin(a) * dw / 2, dw, dh, .08, { ry: a, surf: 'sheetmetal' }); K.col(-hw / 2, .2, hl - .03, dw, dh, .08, { surf: 'sheetmetal' }); }
    K.hide(0, .16, -hl + 1.3, 'dark', .9);
  }
}

// ------------------------------------------------------------------------------------------------ crates
const CRATE = { small: [.6, .6, .6], medium: [1.0, .8, .8], large: [1.2, 1.2, 1.2], long: [2.0, .7, .8], mil: [1.1, .55, .6], ply: [1.2, 1.0, 1.0] };
function crate(K, o, v, rnd) {
  const [w, h, d] = CRATE[v] || CRATE.medium, mil = v === 'mil', ply = v === 'ply';
  const body = mil ? 'p_wood_mil' : ply ? 'plywood' : 'p_wood_crate', bat = mil ? 'p_wood_mil' : 'p_wood_pallet', t = .022, bw = Math.min(.09, w * .12);
  K.box(body, 0, 0, 0, w, h, d, { bev: .006 });
  if (!ply) {   // plank seams
    const n = Math.max(2, Math.round(h / .14));
    for (let i = 1; i < n; i++) for (const s of [-1, 1]) { K.box('p_plastic_dark', 0, i * h / n - .003, s * (d / 2 + .0005), w - .02, .006, .002); K.box('p_plastic_dark', s * (w / 2 + .0005), i * h / n - .003, 0, .002, .006, d - .02); }
  }
  // edge battens on the four sides + cross battens on top
  for (const s of [-1, 1]) {
    const zz = s * (d / 2 + t / 2), xx = s * (w / 2 + t / 2);
    K.box(bat, 0, 0, zz, w, bw, t, { bev: .004 }); K.box(bat, 0, h - bw, zz, w, bw, t, { bev: .004 });
    K.box(bat, -w / 2 + bw / 2, bw, zz, bw, h - 2 * bw, t, { bev: .004 }); K.box(bat, w / 2 - bw / 2, bw, zz, bw, h - 2 * bw, t, { bev: .004 });
    K.box(bat, xx, 0, 0, t, bw, d, { bev: .004 }); K.box(bat, xx, h - bw, 0, t, bw, d, { bev: .004 });
    K.box(bat, xx, bw, -d / 2 + bw / 2, t, h - 2 * bw, bw, { bev: .004 }); K.box(bat, xx, bw, d / 2 - bw / 2, t, h - 2 * bw, bw, { bev: .004 });
    if (w > .9 && !mil) {   // diagonal brace on the long faces
      const L = Math.hypot(w - 2 * bw, h - 2 * bw), a = Math.atan2(h - 2 * bw, w - 2 * bw);
      K.push(0, h / 2, zz, 0, 0, s > 0 ? a : -a); K.box(bat, 0, -bw / 2, 0, L, bw, t * .9); K.pop();
    }
  }
  for (const f of [-.3, .3]) K.box(bat, f * w, h, 0, bw, t, d, { bev: .004 });
  if (mil) {
    for (const s of [-1, 1]) {
      K.tube('p_fab_tan', [[s * (w / 2 + .03), h * .62, -.12], [s * (w / 2 + .06), h * .5, -.1], [s * (w / 2 + .06), h * .5, .1], [s * (w / 2 + .03), h * .62, .12]], .012, { seg: 5 });
      for (const sz of [-1, 1]) K.box('steel_dark', s * (w / 2 - .02), h - .05, sz * (d / 2 - .02), .07, .07, .07);
    }
    K.decal('stencil_mil', 0, h * .5, d / 2 + t + .002, w * .55, w * .22);
    K.decal('stencil_ammo', 0, h + t + .002, 0, w * .6, w * .21, { face: 'u' });
  } else {
    const r = rnd();
    if (r < .45) K.decal('stencil_fragile', 0, h * .55, d / 2 + t + .002, Math.min(.6, w * .6), Math.min(.21, w * .21));
    else if (r < .75) K.decal('stencil_up', w * .2, h * .5, d / 2 + t + .002, .22, .22);
    if (rnd() < .5) K.decal('label_ship', -w * .22, h * .45, d / 2 + t + .002, .2, .13);
  }
  K.col(0, 0, 0, w + .04, h + .02, d + .04, { surf: 'wood' });
}
function crateStack(K, o, v, rnd) {
  // a seeded heap of mixed crates (a bit of everything: natural port / warehouse clutter)
  const kinds = ['medium', 'small', 'large', 'medium', 'small'];
  const spots = [[0, 0, 0, 'large'], [1.25, 0, .1, 'medium'], [1.25, .8, .05, 'small'], [-.05, 1.2, 0, 'medium'], [-1.0, 0, -.05, 'small'], [-1.0, .6, 0, 'small']];
  const n = Math.min(spots.length, o.n || 4 + Math.floor(rnd() * 3));
  for (let i = 0; i < n; i++) {
    const [x, y, z, kd] = spots[i], kind = i < 1 ? 'large' : kd || kinds[i];
    const [w, h, d] = CRATE[kind];
    K.push(x, y, z, (rnd() - .5) * .3); crate(K, {}, kind, rnd); K.pop();
    void w; void h; void d;
  }
  K.hide(.2, 0, -1.25, 'crates', .6);   // behind the heap (-z)
}

function plasticCrate(K, o, v, rnd) {
  const n = Math.max(1, Math.min(8, o.n || 1)), mat = { blue: 'p_plastic_blue', red: 'p_plastic_red', green: 'p_plastic_green', grey: 'p_plastic_grey', yellow: 'p_plastic_yellow', black: 'p_plastic_dark' }[v] || 'p_plastic_blue';
  const w = .6, d = .4, h = .31;
  for (let i = 0; i < n; i++) {
    const y = i * (h - .02), j = (rnd() - .5) * .02;
    K.push(j, y, -j, (rnd() - .5) * .05);
    K.box(mat, 0, .02, 0, w - .03, .02, d - .03);                       // floor
    for (const s of [-1, 1]) {
      K.box(mat, 0, 0, s * (d / 2 - .012), w, h, .024, { bev: .006 }); K.box(mat, s * (w / 2 - .012), 0, 0, .024, h, d - .04, { bev: .006 });
      K.box('p_plastic_dark', 0, h - .1, s * (d / 2 + .0005), .16, .045, .002);          // hand holds
      for (let r = 0; r < 6; r++) K.box(mat, -w / 2 + .07 + r * .093, .03, s * (d / 2 + .006), .018, h - .09, .01);
      for (let r = 0; r < 3; r++) K.box(mat, s * (w / 2 + .006), .03, -d / 2 + .08 + r * .12, .01, h - .09, .018);
    }
    K.box(mat, 0, h - .025, 0, w + .01, .025, d + .01, { skip: 'tb' });
    K.pop();
  }
  const top = n * (h - .02) + .02;
  if (o.load !== false && n < 3 && rnd() < .5) stackBoxes(K, 'cardboard', w - .1, d - .1, .2, rnd, { bx: .25, bd: .15, bh: .1 });
  K.col(0, 0, 0, w, top, d, { surf: 'rubber' });
}

function ammoCan(K, o, v, rnd) {
  const n = Math.max(1, Math.min(6, o.n || 1));
  const pos = [[0, 0, 0], [.32, 0, .02], [.16, .19, .01], [-.31, 0, -.03], [-.15, .19, 0], [.0, .38, 0]];
  for (let i = 0; i < n; i++) {
    const [x, y, z] = pos[i]; K.push(x, y, z, (rnd() - .5) * .2);
    K.box('p_paint_olive', 0, 0, 0, .28, .17, .15, { bev: .008 });
    K.box('p_paint_olive', 0, .17, 0, .29, .018, .155, { bev: .004 });
    K.box('steel_dark', .12, .17, 0, .03, .02, .16);
    K.tube('steel_dark', [[-.06, .19, 0], [-.06, .215, 0], [.06, .215, 0], [.06, .19, 0]], .006, { seg: 4 });
    K.decal('stencil_mil', 0, .09, .077, .2, .08);
    K.pop();
  }
}

// ------------------------------------------------------------------------------------------------ pallets
function palletOne(K, y, rnd, mat = 'p_wood_pallet') {
  const tint = () => { const c = .85 + rnd() * .25; return [c, c * (.95 + rnd() * .05), c * (.88 + rnd() * .1)]; };
  for (const z of [-.33, 0, .33]) K.box(mat, 0, y, z, 1.2, .022, z ? .1 : .145, { col: tint() });
  for (const x of [-.525, 0, .525]) for (const z of [-.33, 0, .33]) K.box(mat, x, y + .022, z, x ? .145 : .145, .078, .1, { col: tint() });
  for (const x of [-.525, 0, .525]) K.box(mat, x, y + .1, 0, .145, .022, .8, { col: tint() });
  const tops = [[-.3275, .145], [-.17, .1], [0, .145], [.17, .1], [.3275, .145]];
  for (const [z, w] of tops) K.box(mat, 0, y + .122, z, 1.2, .022, w, { col: tint() });
}
function pallet(K, o, v, rnd) {
  const n = Math.max(1, Math.min(14, o.stack || 1));
  for (let i = 0; i < n; i++) { K.push((rnd() - .5) * .03, 0, (rnd() - .5) * .03, (rnd() - .5) * .03); palletOne(K, i * .144, rnd); K.pop(); }
  let top = n * .144;
  const load = o.load || v || 'none', y0 = top;
  if (load === 'boxes' || load === 'wrap') {
    K.push(0, y0, 0); const h = stackBoxes(K, 'cardboard', 1.18, .78, o.h || 1.1, rnd, { bx: .4, bd: .39, bh: .275, gap: load === 'wrap' ? 0 : .1 }); K.pop();
    if (load === 'wrap') { K.box('glass_frosted', 0, y0, 0, 1.21, h + .01, .81, { skip: 'b' }); K.noCast('glass_frosted'); }
    top += h;
  } else if (load === 'sacks') {
    for (let j = 0; j < 5; j++) for (let i = 0; i < 4; i++) {
      const rot = j % 2, x = rot ? (i < 2 ? -.3 : .3) : 0, z = rot ? (i % 2 ? .19 : -.19) : -.29 + i * .195;
      K.blob('p_plastic_beige', x + (rnd() - .5) * .02, y0 + .07 + j * .14, z, rot ? .29 : .58, .075, rot ? .19 : .095, { seg: 8, noise: .06, seed: i + j * 7, ry: rot ? 0 : 0, flat: -.7, top: .7 });
    }
    top += .72;
  } else if (load === 'drums') {
    for (const [x, z] of [[-.3, -.2], [.3, -.2], [-.3, .2], [.3, .2]]) { K.push(x * 1.0, y0, z * 1.0); drumBody(K, 'paint_blue', .29, .88); K.pop(); }
    top += .88;
  } else if (load === 'bricks') {
    for (let j = 0; j < 4; j++) K.box('brick_red', 0, y0 + j * .2, 0, 1.15, .195, .76, { bev: .004 });
    for (const x of [-.4, .4]) K.box('p_plastic_dark', x, y0, 0, .02, .81, .79, { skip: 'b' });
    top += .8;
  } else if (load === 'cylinders') {
    for (let i = 0; i < 6; i++) { K.push(-.4 + (i % 3) * .4, y0, i < 3 ? -.17 : .17); gasBody(K, 'p_paint_darkgrey', 'paint_white', .115, 1.45); K.pop(); }
    top += 1.6;
  } else if (load === 'pipes') {
    for (let j = 0; j < 3; j++) for (let i = 0; i < 5 - j; i++) K.cylX('p_galv', -.6, .6, y0 + .07 + j * .12, -.24 + (i + j * .5) * .12, .06, { seg: 10 });
    top += .36;
  }
  K.col(0, 0, 0, 1.2, top, .8, { surf: load === 'none' ? 'wood' : 'wood', walk: true });
}

// ------------------------------------------------------------------------------------------------ drums, gas cylinders, IBC
const DRUMCOL = { blue: 'paint_blue', red: 'paint_red', black: 'paint_black', green: 'paint_green', yellow: 'paint_yellow', white: 'paint_white', grey: 'p_paint_grey', rust: 'metal_rust', orange: 'p_paint_orange' };
function drumBody(K, mat, r, h) {
  const c = .012;
  K.lathe(mat, [[r - .02, 0], [r, .01], [r + c, .025], [r, .04], [r, h * .33 - .015], [r + .012, h * .33], [r, h * .33 + .015], [r, h * .66 - .015], [r + .012, h * .66], [r, h * .66 + .015], [r, h - .04], [r + c, h - .025], [r, h - .01], [r - .02, h - .005], [r - .025, h - .02], [0, h - .02]], { seg: 20, sharp: 40 });
  K.cyl('steel_dark', r * .55, h - .02, r * .2, .03, .012, { seg: 8 });
  K.cyl('steel_dark', -r * .62, h - .02, -r * .15, .022, .012, { seg: 8 });
}
function drum(K, o, v, rnd) {
  const mat = DRUMCOL[v] || 'paint_blue', r = .2925, h = .88, n = Math.max(1, Math.min(4, o.n || 1));
  const pos = [[0, 0], [.6, .05], [.3, .55], [-.35, .5]];
  for (let i = 0; i < n; i++) {
    const [x, z] = pos[i];
    if (o.fallen && i === 0) {
      K.push(x, r, z, rnd() * .5, 0, PI / 2); K.push(0, -h / 2, 0); drumBody(K, mat, r, h); K.pop(); K.pop();
      K.col(x, 0, z, h, r * 2, r * 2, { ry: rnd() * .5, surf: 'metal' });
    } else {
      K.push(x, 0, z, rnd() * 6); drumBody(K, mat, r, h);
      if ((v === 'red' || v === 'black' || v === 'yellow') && rnd() < .7) K.decal('haz_flame', 0, h * .5, r + .004, .2, .2);
      K.pop();
      K.ccyl(x, 0, z, r, h, { surf: 'metal' });
    }
  }
}
function gasBody(K, body, shoulder, r, h) {
  K.lathe(body, [[r * .85, 0], [r, .02], [r, h * .78]], { seg: 14, capT: false, sharp: 40 });
  K.lathe(shoulder, [[r, h * .78], [r, h * .82], [r * .9, h * .9], [r * .55, h * .96], [r * .25, h * .985], [0, h * .99]], { seg: 14, capB: false, sharp: 50 });
  K.cyl('p_chrome', 0, h * .985, 0, .022, .07, { seg: 8 });
  K.cylX('p_chrome', -.04, .04, h * 1.03, 0, .012, { seg: 6 });
  K.ring('steel_dark', 0, h + .08, 0, .05, .008, { seg: 10 });
}
const GAS = { oxygen: ['p_paint_darkgrey', 'paint_white'], acetylene: ['p_paint_maroon', 'p_paint_maroon'], nitrogen: ['p_paint_grey', 'paint_black'], co2: ['p_paint_grey', 'p_paint_grey'], argon: ['p_paint_grey', 'p_paint_teal'] };
function gasCylinder(K, o, v, rnd) {
  if (v === 'propane') {
    const r = .16, h = .58;
    K.cyl('p_paint_grey', 0, 0, 0, r * .9, .06, { seg: 14 });
    K.lathe('paint_white', [[r, .06], [r, h - .1], [r * .8, h - .03], [0, h]], { seg: 16, sharp: 50 });
    K.ring('paint_red', 0, h + .02, 0, .1, .015, { seg: 12 });
    K.cyl('p_chrome', 0, h - .01, 0, .02, .06, { seg: 8 });
    K.decal('gas_label', 0, h * .5, r + .004, .16, .065);
    K.ccyl(0, 0, 0, r, h + .05, { surf: 'metal' });
    return;
  }
  const [body, sh] = GAS[v] || GAS.oxygen, r = .115, h = 1.45;
  if (o.rack) {
    const w = 1.0, d = .55, hh = 1.6;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) K.box('paint_yellow', sx * w / 2, 0, sz * d / 2, .05, hh, .05, { bev: .005 });
    for (const yy of [.05, .9, 1.55]) { K.box('paint_yellow', 0, yy, -d / 2, w, .04, .04); K.box('paint_yellow', 0, yy, d / 2, w, .04, .04); for (const s of [-1, 1]) K.box('paint_yellow', s * w / 2, yy, 0, .04, .04, d); }
    K.box('grate', 0, .05, 0, w, .03, d);
    for (let i = 0; i < 6; i++) { K.push(-.32 + (i % 3) * .32, .08, i < 3 ? -.13 : .13, rnd() * 6); gasBody(K, body, sh, r, h); K.pop(); }
    for (const yy of [.9, 1.3]) K.tube('steel_dark', [[-w / 2, yy, d / 2 + .03], [-w / 4, yy - .05, d / 2 + .04], [w / 4, yy - .05, d / 2 + .04], [w / 2, yy, d / 2 + .03]], .008, { seg: 4 });
    K.col(0, 0, 0, w + .05, hh, d + .05, { surf: 'metal' });
    return;
  }
  const n = Math.max(1, Math.min(5, o.n || 1));
  for (let i = 0; i < n; i++) {
    const x = (i - (n - 1) / 2) * .25;
    K.push(x, 0, (rnd() - .5) * .03, rnd() * 6, (rnd() - .5) * .03); gasBody(K, body, sh, r, h);
    K.decal('gas_label', 0, 1.0, r + .004, .14, .056); K.pop();
  }
  if (n > 1) K.tube('steel_dark', [[-(n - 1) * .125 - .1, 1.1, -.12], [-(n - 1) * .125, 1.1, .13], [(n - 1) * .125, 1.1, .13], [(n - 1) * .125 + .1, 1.1, -.12]], .006, { seg: 4 });
  K.col(0, 0, 0, n * .25, h + .1, .25, { surf: 'metal' });
}
function ibc(K, o, v, rnd) {
  const L = 1.2, W = 1.0, H = 1.16, base = .15;
  // steel pallet base + skids
  K.box('p_galv', 0, 0, 0, L, .03, W, { bev: .005 }); K.box('p_galv', 0, base - .03, 0, L, .03, W);
  for (const x of [-.5, 0, .5]) K.box('p_galv', x, .03, 0, .1, base - .06, W);
  // plastic bottle (milky) with fill level shading via a darker inner box
  const bottle = v === 'blue' ? 'p_plastic_blue' : 'p_plastic_milky';    // blue = opaque UV-blocking bottle
  K.box(bottle, 0, base, 0, L - .06, H - base - .06, W - .06, { bev: .05 });
  K.cyl(bottle, 0, H - .06, 0, .16, .05, { seg: 14 });
  K.cyl('p_plastic_dark', 0, H - .02, 0, .18, .05, { seg: 14 });
  // cage: tubular grid on the four sides + top
  const cage = 'p_galv', r = .011;
  for (const s of [-1, 1]) { grid(K, cage, 0, base, s * W / 2, L, H - base, 7, 4, r); K.push(s * L / 2, 0, 0, PI / 2); grid(K, cage, 0, base, 0, W, H - base, 6, 4, r); K.pop(); }
  for (let i = 0; i <= 4; i++) K.cylX(cage, -L / 2, L / 2, H, -W / 2 + i * W / 4, r, { seg: 5 });
  K.cylZ(cage, -W / 2, W / 2, -L / 4, H, r, { seg: 5 }); K.cylZ(cage, -W / 2, W / 2, L / 4, H, r, { seg: 5 });
  // outlet valve
  K.cylZ('p_plastic_dark', W / 2 - .05, W / 2 + .08, 0, base + .1, .06, { seg: 12 });
  K.box('p_plastic_dark', 0, base + .02, W / 2 + .08, .2, .14, .05, { bev: .01 });
  if (rnd() < .5) K.decal('haz_corrosive', .3, .6, W / 2 + .015, .2, .2);
  K.col(0, 0, 0, L, H + .03, W, { surf: 'rubber' });
}

// ------------------------------------------------------------------------------------------------ dumpster, bins, bags, boxes
const DUMPCOL = { green: 'paint_green', blue: 'paint_blue', grey: 'p_paint_grey', maroon: 'p_paint_maroon', orange: 'p_paint_orange' };
function dumpster(K, o, v, rnd) {
  const mat = DUMPCOL[v] || 'paint_green', W = 1.8, D = 1.1, open = o.lid === 'open';
  const prof = [[-.55, .12], [.48, .12], [.55, .2], [.55, .72], [.42, 1.18], [-.55, 1.22]];
  K.extX(mat, prof, -W / 2, W / 2);
  // lip around the opening, fork pockets, corner stiffeners, casters
  K.box(mat, 0, 1.18, -.55, W + .04, .06, .06, { bev: .01 });
  for (const s of [-1, 1]) {
    K.box(mat, s * (W / 2 + .03), .55, .05, .06, .14, .9, { bev: .01 });
    K.box('p_plastic_dark', s * (W / 2 + .061), .57, .05, .002, .1, .82);
    K.box(mat, s * (W / 2 + .015), .12, -.55, .05, 1.08, .08, { bev: .008 });
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    K.box('steel_dark', sx * (W / 2 - .15), .09, sz * .4, .08, .03, .08);
    K.cyl('steel_dark', sx * (W / 2 - .15), .05, sz * .4, .012, .04, { seg: 6 });
    K.push(sx * (W / 2 - .15), .05, sz * .4); wheel(K, 0, 0, 0, .05, { w: .04, spokes: 0, rimMat: 'steel_dark' }); K.pop();
  }
  // two plastic lids hinged at the back
  for (const s of [-1, 1]) {
    K.push(s * W / 4, 1.22, -.55, 0, open ? -2.0 : -Math.atan2(.04, 1.1), 0);
    K.box('p_plastic_dark', 0, 0, .56, W / 2 - .03, .04, 1.12, { bev: .012 });
    K.box('p_plastic_dark', 0, .04, .4, W / 2 - .2, .02, .5, { bev: .008 });
    K.pop();
    K.cylX('steel_dark', s * W / 4 - .3, s * W / 4 + .3, 1.23, -.57, .02, { seg: 8 });
  }
  K.decal(rnd() < .5 ? 'graffiti_2' : 'label_ship', .2, .5, .556, .7, .35, { rx: -.15 });
  K.col(0, 0, 0, W + .1, 1.26, D + .02, { surf: 'sheetmetal' });
  K.hide(0, 0, -D / 2 - .6, 'crates', .7);
}
const BINCOL = { green: 'p_plastic_green', blue: 'p_plastic_blue', black: 'p_plastic_dark', grey: 'p_plastic_grey', brown: 'p_plastic_brown' };
function wheelieBin(K, o, v, rnd) {
  const mat = BINCOL[v] || 'p_plastic_green', lid = o.lid ? BINCOL[o.lid] : mat;
  const sec = (w, d, r) => { const p = []; for (const [cx, cz, a0] of [[w / 2 - r, d / 2 - r, 0], [-w / 2 + r, d / 2 - r, PI / 2], [-w / 2 + r, -d / 2 + r, PI], [w / 2 - r, -d / 2 + r, 1.5 * PI]]) for (let k = 0; k <= 3; k++) { const a = a0 + k * PI / 6; p.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]); } return p; };
  K.push(0, 0, .02, 0, -PI / 2, 0);   // loft along local z = world +y
  const s0 = sec(.48, .6, .05), s1 = sec(.56, .7, .06), s2 = sec(.58, .72, .06);
  K.loft(mat, [{ z: .05, pts: s0.map(p => [p[0], -p[1]]) }, { z: .95, pts: s1.map(p => [p[0], -p[1]]) }, { z: 1.0, pts: s2.map(p => [p[0], -p[1]]) }], { caps: true });
  K.pop();
  // lid (hinged at the back), handle, axle + wheels, front grip
  K.push(0, 1.02, -.36, 0, o.open ? -1.9 : 0, 0);
  K.box(lid, 0, 0, .37, .6, .04, .76, { bev: .015 }); K.box(lid, 0, -.04, .74, .5, .05, .03, { bev: .008 });
  K.pop();
  K.cylX('p_plastic_dark', -.24, .24, .98, -.39, .02, { seg: 8 });
  K.cylX('steel_dark', -.3, .3, .1, -.3, .012, { seg: 6 });
  for (const s of [-1, 1]) { wheel(K, s * .28, .1, -.3, .1, { w: .05, side: s, spokes: 0, rimMat: 'p_plastic_dark', barrelMat: 'p_plastic_dark' }); }
  K.box(mat, 0, .05, -.38, .44, .1, .06);
  K.col(0, 0, 0, .6, 1.07, .76, { surf: 'rubber' });
}
function trashBags(K, o, v, rnd) {
  const n = Math.max(1, Math.min(10, o.n || 1)), mat = v === 'green' ? 'p_bag_green' : v === 'blue' ? 'p_bag_blue' : 'p_bag_black';
  const pts = [[0, 0], [.48, .08], [-.42, .15], [.1, .45], [-.3, -.42], [.42, -.38], [.62, .5], [-.68, -.05], [0, -.62], [.15, .2]];
  let maxR = 0;
  for (let i = 0; i < n; i++) {
    const [x, z] = pts[i], up = i === 9 ? .38 : 0, sx = .24 + rnd() * .06, sy = .26 + rnd() * .08;
    K.blob(mat, x, sy * .8 + up, z, sx, sy, .22 + rnd() * .05, { seg: 10, noise: .2, freq: 2.6, seed: i * 13 + 5, flat: -.8, ry: rnd() * 6, rx: (rnd() - .5) * .3 });
    K.blob(mat, x + .02, sy * 1.75 + up, z, .06, .07, .05, { seg: 6, noise: .2, seed: i });
    K.blob(mat, x + .07, sy * 1.92 + up, z, .05, .025, .03, { seg: 5 }); K.blob(mat, x - .04, sy * 1.92 + up, z + .02, .045, .02, .03, { seg: 5 });
    maxR = Math.max(maxR, Math.hypot(x, z) + .3);
  }
  if (n >= 3) K.col(0, 0, 0, maxR * 1.5, .55, maxR * 1.5, { surf: 'fabric' });
}
const BOX = { small: [.4, .3, .3], medium: [.6, .45, .4], large: [.8, .6, .6], flat: [.9, .15, .6] };
function cardboardOne(K, x, y, z, w, h, d, ry, rnd, label) {
  K.push(x, y, z, ry);
  const c = .9 + rnd() * .2;
  K.box('cardboard', 0, 0, 0, w, h, d, { bev: .004, col: [c, c * .97, c * .93] });
  K.box('p_tape', 0, h - .001, 0, .05, .003, d + .004); K.box('p_tape', 0, h - .06, d / 2 - .001, .05, .062, .004); K.box('p_tape', 0, h - .06, -d / 2 - .002, .05, .062, .004);
  K.box('p_plastic_dark', 0, h - .002, 0, w - .02, .002, .003);
  if (label) K.decal(rnd() < .6 ? 'label_ship' : 'stencil_up', w * .2, h * .5, d / 2 + .003, Math.min(.16, w * .35), Math.min(.11, h * .35));
  K.pop();
}
function cardboardBox(K, o, v, rnd) {
  if (v === 'pile') {
    const spots = [[0, 0, 0, 'large'], [.72, 0, .05, 'medium'], [.7, .45, .02, 'small'], [-.05, .6, 0, 'medium'], [-.62, 0, .1, 'small'], [-.6, .3, .05, 'small'], [.05, 1.05, .02, 'small']];
    const n = Math.min(spots.length, o.n || 5 + Math.floor(rnd() * 3));
    let top = 0;
    for (let i = 0; i < n; i++) { const [x, y, z, k] = spots[i], [w, h, d] = BOX[k]; cardboardOne(K, x, y, z, w, h, d, (rnd() - .5) * .4, rnd, rnd() < .5); top = Math.max(top, y + h); }
    K.col(0, 0, 0, 1.6, Math.min(top, 1.0), .8, { surf: 'wood' });
    return;
  }
  const [w, h, d] = BOX[v] || BOX.medium, n = Math.max(1, Math.min(6, o.stack || 1));
  for (let i = 0; i < n; i++) cardboardOne(K, (rnd() - .5) * .04, i * h, (rnd() - .5) * .04, w, h, d, (rnd() - .5) * .12, rnd, i === 0 || rnd() < .4);
  K.col(0, 0, 0, w, h * n, d, { surf: 'wood' });
}

// ------------------------------------------------------------------------------------------------ warehouse racking, shelving
function rack(K, o, v, rnd) {
  const bays = Math.max(1, Math.min(8, o.bays || 2)), levels = Math.max(1, Math.min(5, o.levels || 3)), bw = 2.7, D = 1.1, lh = o.lh || 1.6;
  const H = levels * lh + .3, L = bays * bw + .1 * (bays + 1), up = 'paint_blue', bm = 'p_paint_orange', fill = o.load == null ? .75 : o.load;
  for (let b = 0; b <= bays; b++) {
    const x = -L / 2 + .05 + b * (bw + .1);
    for (const s of [-1, 1]) { K.box(up, x, 0, s * (D / 2 - .04), .09, H, .07, { bev: .006 }); K.box('steel_dark', x, 0, s * (D / 2 - .04), .16, .01, .14); }
    for (let yy = .3; yy < H - .3; yy += .6) {      // frame bracing (zig-zag)
      const L2 = Math.hypot(D - .12, .6), a = Math.atan2(.6, D - .12);
      K.push(x, yy + .3, 0, PI / 2, 0, ((yy / .6) | 0) % 2 ? a : -a); K.box(up, 0, -.015, 0, L2, .03, .025); K.pop();
    }
    K.cylZ(up, -D / 2 + .05, D / 2 - .05, x, .15, .015, { seg: 5 });
    K.col(x, 0, 0, .1, H, D, { surf: 'metal' });
  }
  for (let b = 0; b < bays; b++) {
    const xc = -L / 2 + .1 + b * (bw + .1) + bw / 2 + .0;
    for (let l = 1; l <= levels; l++) {
      const y = l * lh;
      for (const s of [-1, 1]) { K.box(bm, xc, y - .12, s * (D / 2 - .04), bw + .05, .12, .05, { bev: .006 }); K.box('steel_dark', xc, y - .13, s * (D / 2 - .04), bw - .2, .01, .052); }
      if (l < levels || o.topLoad) K.box('grate', xc, y - .01, 0, bw, .02, D - .1);
    }
    // pallets of goods: floor level + each beam level
    for (let l = 0; l <= levels; l++) {
      const y = l === 0 ? 0 : l * lh;
      if (l === levels && !o.topLoad) continue;
      for (const px of [-.88, .5]) {
        if (rnd() > fill) continue;
        const x = xc + px + (rnd() - .5) * .08, kind = rnd();
        K.push(x, y, 0, PI / 2 + (rnd() - .5) * .04); palletOne(K, 0, rnd);
        const hmax = Math.min(lh - .35, 1.3);
        if (kind < .6) { K.push(0, .144, 0); stackBoxes(K, 'cardboard', 1.18, .78, hmax * (.5 + rnd() * .5), rnd, { bx: .4, bd: .39, bh: .27, tint: true }); K.pop(); }
        else if (kind < .8) { const hh = hmax * (.6 + rnd() * .4); K.push(0, .144, 0); stackBoxes(K, 'cardboard', 1.18, .78, hh, rnd, { bx: .59, bd: .39, bh: .3, gap: 0 }); K.pop(); K.box('glass_frosted', 0, .144, 0, 1.21, Math.floor(hh / .3) * .3 + .01, .81, { skip: 'b' }); }
        else for (const [a, b2] of [[-.3, -.2], [.3, -.2], [-.3, .2], [.3, .2]]) { K.push(a, .144, b2); drumBody(K, rnd() < .5 ? 'paint_blue' : 'paint_black', .29, .88); K.pop(); }
        K.pop();
        if (l === 0) K.col(x, 0, 0, 1.2, Math.min(lh - .3, 1.4), .8, { surf: 'wood' });
        else K.col(x, y, 0, 1.2, Math.min(lh - .4, 1.3), .8, { surf: 'wood' });
      }
      if (l > 0) K.col(xc, y - .12, 0, bw, .12, D - .05, { surf: 'metal' });
    }
  }
  K.noCast('glass_frosted');
}
function shelfUnit(K, o, v, rnd) {
  const w = o.w || 1.2, d = .5, h = 2.0, n = 5, mat = v === 'grey' ? 'p_paint_grey' : v === 'green' ? 'p_paint_milgreen' : 'steel_dark';
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) K.box(mat, sx * (w / 2 - .02), 0, sz * (d / 2 - .02), .04, h, .04);
  for (let i = 0; i < n; i++) {
    const y = .1 + i * (h - .15) / (n - 1);
    K.box(o.boards === false ? mat : 'p_wood_light', 0, y, 0, w - .02, .02, d - .02);
    for (const s of [-1, 1]) K.box(mat, 0, y - .04, s * (d / 2 - .02), w, .04, .02);
    if (i < n - 1 && o.load !== false && rnd() < .85) {
      const kind = rnd();
      if (kind < .5) { K.push(0, y + .02, 0); stackBoxes(K, 'cardboard', w * (.4 + rnd() * .5), d - .1, .32, rnd, { bx: .3, bd: .35, bh: .16, tint: true }); K.pop(); }
      else if (kind < .75) for (let k = 0; k < 3; k++) K.box(['p_plastic_blue', 'p_plastic_red', 'p_plastic_grey'][k], -w / 2 + .2 + k * .35, y + .02, 0, .3, .18, d - .12, { bev: .01 });
      else for (let k = 0; k < 4; k++) K.cyl(['paint_white', 'p_plastic_red', 'p_plastic_yellow'][k % 3], -w / 2 + .15 + k * .2 + rnd() * .05, y + .02, (rnd() - .5) * .2, .06, .22, { seg: 10 });
    }
  }
  K.col(0, 0, 0, w, h, d, { surf: 'metal' });
}

// ------------------------------------------------------------------------------------------------ forklift, pallet jack
function forklift(K, o, v, rnd) {
  const body = v === 'red' ? 'paint_red' : v === 'orange' ? 'p_paint_orange' : 'paint_yellow', dk = 'steel_dark', cw = 'p_paint_darkgrey', fy = o.forks || .1;
  // chassis (front of the truck = +z: mast and forks)
  K.box(body, 0, .25, -.2, 1.08, .55, 1.6, { bev: .04 });
  K.box(cw, 0, .2, -1.05, 1.1, .85, .45, { bev: .08 });
  K.lathe(cw, [[.4, 0], [.4, .7]], { x: 0, y: .25, z: -1.05, a0: PI, a1: TAU0(), seg: 10 });
  K.box(body, 0, .8, -.6, 1.0, .12, .7, { bev: .03 });                  // engine hood
  K.box('p_plastic_dark', 0, .92, -.55, .48, .1, .42, { bev: .04 });     // seat base
  K.box('p_plastic_dark', 0, 1.02, -.6, .46, .1, .42, { bev: .04 }); K.box('p_plastic_dark', 0, 1.05, -.8, .46, .45, .1, { bev: .04, rx: -.15 });
  K.box(body, 0, .8, .25, .9, .3, .35, { bev: .03 });                    // dash / cowl
  K.push(0, 1.2, .2, 0, -.6, 0); K.cyl(dk, 0, -.2, 0, .02, .3, { seg: 6 }); K.ring('p_plastic_dark', 0, .1, 0, .16, .015, { seg: 14 }); K.pop();
  // overhead guard
  for (const sx of [-1, 1]) { K.box(dk, sx * .48, .85, .35, .06, 1.3, .06, { rx: .05 }); K.box(dk, sx * .48, .85, -.95, .06, 1.28, .06); }
  K.box(dk, 0, 2.12, -.3, 1.02, .05, 1.38);
  for (let i = 0; i < 5; i++) K.box(dk, 0, 2.08, -.85 + i * .27, .96, .04, .04);
  // mast, carriage, forks
  for (const sx of [-1, 1]) { K.box(dk, sx * .32, .2, .62, .1, 2.15, .12, { bev: .01 }); K.box(dk, sx * .22, .25, .7, .08, 2.05, .1); }
  K.box(dk, 0, 2.25, .62, .74, .08, .12); K.box(dk, 0, .3, .62, .74, .08, .12);
  K.cyl('p_chrome', 0, .3, .55, .04, 1.9, { seg: 8 });
  K.box(dk, 0, fy + .05, .8, .9, .45, .05);
  for (let i = 0; i < 6; i++) K.box(dk, -.4 + i * .16, fy + .45, .8, .03, .45, .03);
  for (const sx of [-1, 1]) { K.box(dk, sx * .25, fy, .82, .1, .5, .05); K.box(dk, sx * .25, fy, 1.32, .1, .045, 1.0, { bev: .006 }); }
  // wheels
  for (const s of [-1, 1]) { wheel(K, s * .48, .33, .35, .33, { w: .22, side: s, spokes: 0, rimMat: 'p_paint_grey' }); wheel(K, s * .45, .24, -.85, .24, { w: .17, side: s, spokes: 0, rimMat: 'p_paint_grey' }); }
  K.box(body, 0, .18, .35, 1.08, .1, .2);
  K.cyl('emissive_warm', .4, 2.05, .4, .05, .06, { seg: 8 }); K.cyl('emissive_warm', -.4, 2.05, .4, .05, .06, { seg: 8 }); K.noCast('emissive_warm');
  K.cyl('p_em_amber', 0, 2.17, -.9, .05, .08, { seg: 8 }); K.noCast('p_em_amber');
  K.col(0, 0, -.3, 1.15, 1.0, 1.8, { surf: 'metal' });
  K.col(0, 0, .65, .8, 2.3, .25, { surf: 'metal' });
  K.col(0, 1.0, -.3, 1.05, 1.2, .3, { surf: 'metal' });
}
function TAU0() { return 2 * PI; }
function palletJack(K, o, v, rnd) {
  const mat = v === 'yellow' ? 'paint_yellow' : v === 'blue' ? 'paint_blue' : 'paint_red', dk = 'steel_dark';
  for (const s of [-1, 1]) { K.box(dk, s * .2, .02, .4, .16, .06, 1.15, { bev: .006 }); K.cyl('p_plastic_grey', s * .2, .0, .9, .04, .02, { seg: 8 }); }
  K.box(mat, 0, .02, -.25, .55, .22, .25, { bev: .02 });
  K.cyl(mat, 0, .2, -.27, .06, .3, { seg: 10 }); K.cyl('p_chrome', 0, .45, -.27, .035, .12, { seg: 8 });
  for (const s of [-1, 1]) wheel(K, s * .09, .09, -.3, .09, { w: .05, side: s, spokes: 0, rimMat: dk });
  K.push(0, .55, -.27, 0, -.25, 0);
  K.tube(mat, [[-.03, 0, 0], [-.03, .7, 0], [-.15, .9, 0], [.15, .9, 0], [.03, .7, 0], [.03, 0, 0]], .016, { seg: 6 });
  K.box('p_plastic_dark', 0, .82, 0, .28, .05, .05, { bev: .01 });
  K.pop();
}

// ------------------------------------------------------------------------------------------------ pipes, valves, tanks
const PIPECOL = { galv: 'p_galv', yellow: 'paint_yellow', grey: 'p_paint_grey', rust: 'metal_rust', red: 'paint_red', green: 'paint_green', white: 'paint_white', blue: 'paint_blue' };
function flange(K, mat, z, r, axis) {
  if (axis === 'y') { K.cyl(mat, 0, z - .015, 0, r * 1.6, .03, { seg: 16 }); for (let i = 0; i < 8; i++) { const a = i * PI / 4; K.cyl('steel_dark', Math.cos(a) * r * 1.35, z + .015, Math.sin(a) * r * 1.35, .014, .02, { seg: 6 }); } }
  else { K.cylZ(mat, z - .015, z + .015, 0, 0, r * 1.6, { seg: 16 }); for (let i = 0; i < 8; i++) { const a = i * PI / 4; K.cylZ('steel_dark', z + .015, z + .03, Math.cos(a) * r * 1.35, Math.sin(a) * r * 1.35, .014, { seg: 6 }); } }
}
function pipe(K, o, v, rnd) {
  const mat = PIPECOL[v] || 'p_galv', r = (o.d || .3) / 2, len = o.len || 4, y = o.h == null ? r + .25 : o.h + r;
  if (o.dir === 'y') {      // vertical riser
    K.cyl(mat, 0, 0, 0, r, len, { seg: 16 });
    if (o.flange !== false) for (const yy of [.02, len - .02]) { K.push(0, 0, 0); flange(K, mat, yy, r, 'y'); K.pop(); }
    K.ccyl(0, 0, 0, r * 1.2, len, { surf: 'metal' });
    return;
  }
  K.push(0, y, 0);
  K.cylZ(mat, -len / 2, len / 2, 0, 0, r, { seg: 16, caps: true });
  if (o.flange !== false) { flange(K, mat, -len / 2 + .02, r, 'z'); flange(K, mat, len / 2 - .02, r, 'z'); }
  K.pop();
  // supports: T-stands every 3 m
  if (o.h !== 0) for (let z = -len / 2 + .5; z <= len / 2 - .4; z += 3) {
    K.box('steel_dark', 0, 0, z, .12, y - r, .1); K.box('steel_dark', 0, y - r - .05, z, r * 2 + .2, .06, .14); K.box('steel_dark', 0, 0, z, .3, .02, .25);
    K.tube('p_galv', [[-r - .02, y - r - .02, z], [-r - .02, y, z], [0, y + r + .02, z], [r + .02, y, z], [r + .02, y - r - .02, z]], .008, { seg: 4 });
  }
  K.col(0, 0, 0, r * 2.2, y + r, len, { surf: 'metal' });
}
function pipeElbow(K, o, v, rnd) {
  const mat = PIPECOL[v] || 'p_galv', r = (o.d || .3) / 2, R = r * 2.5, y = o.h == null ? r + .25 : o.h + r;
  // a 90 degree bend from -z to +x, centre of the bend at (R, y, -R)... starts at (0, y, -R - .3) heading +z
  const path = []; for (let i = 0; i <= 10; i++) { const a = i / 10 * PI / 2; path.push([R - Math.cos(a) * R, y, -R + Math.sin(a) * R]); }
  K.tube(mat, [[0, y, -R - .4], ...path, [R + .4, y, 0]], r, { seg: 14 });
  K.push(0, y, 0); flange(K, mat, -R - .4, r, 'z'); K.pop();
  K.push(R + .4, y, 0, PI / 2); flange(K, mat, 0, r, 'z'); K.pop();
  K.box('steel_dark', 0, 0, -R - .2, .12, y - r, .1);
  K.col(0, 0, -R / 2 - .2, r * 2.2, y + r, R + .5, { surf: 'metal' });
  K.col(R / 2 + .2, 0, 0, R + .5, y + r, r * 2.2, { surf: 'metal' });
}
function valve(K, o, v, rnd) {
  const mat = PIPECOL[v] || 'p_paint_grey', r = (o.d || .2) / 2, y = o.h == null ? r + .3 : o.h + r;
  K.push(0, y, 0);
  K.cylZ(mat, -.5, .5, 0, 0, r, { seg: 14 });
  flange(K, mat, -.18, r, 'z'); flange(K, mat, .18, r, 'z');
  K.lathe(mat, [[r * 1.3, -.15], [r * 1.5, 0], [r * 1.3, .15]], { rx: PI / 2, seg: 14 });
  K.cyl(mat, 0, r, 0, r * .6, r * 2.2, { seg: 12 });
  K.cyl('p_chrome', 0, r * 3, 0, .015, .25, { seg: 6 });
  K.ring(v === 'red' ? 'paint_red' : 'paint_red', 0, r * 3 + .22, 0, .14, .014, { seg: 16 });
  for (let i = 0; i < 4; i++) { K.push(0, r * 3 + .22, 0, i * PI / 4); K.box('paint_red', 0, -.007, 0, .28, .014, .014); K.pop(); }
  K.pop();
  K.box('steel_dark', 0, 0, 0, .12, y - r, .1);
  K.col(0, 0, 0, r * 3.2, y + r * 3.2 + .3, 1.0, { surf: 'metal' });
}
function tank(K, o, v, rnd) {
  if (v === 'horizontal') {
    const r = 1.25, L = o.len || 8, y = r + .5, mat = o.mat || 'paint_white';
    K.push(0, y, 0); K.cylZ(mat, -L / 2 + r * .35, L / 2 - r * .35, 0, 0, r, { seg: 24, caps: false });
    for (const s of [-1, 1]) K.lathe(mat, [[r, 0], [r * .92, r * .18], [r * .6, r * .3], [0, r * .36]], { seg: 24, rx: s * PI / 2, z: s * (L / 2 - r * .35) });
    for (const zz of [-L / 3, 0, L / 3]) K.lathe(mat, [[r + .015, zz - .04], [r + .015, zz + .04]], { rx: PI / 2, seg: 24, caps: false });
    K.pop();
    for (const s of [-1, 1]) {   // saddles
      const z = s * L * .3;
      K.extX('concrete', [[z - .4, 0], [z + .4, 0], [z + .4, .35], [z + .25, .7], [z - .25, .7], [z - .4, .35]], -r * .9, r * .9);
    }
    K.cyl('p_galv', 0, y + r - .05, L * .2, .15, .25, { seg: 12 }); K.cyl('p_galv', 0, y + r + .2, L * .2, .2, .04, { seg: 12 });
    ladder(K, 'p_galv', r * .55, 0, -L * .1, y + r * .7, { w: .4 }); K.push(r * .3, y + r * .9, -L * .1); railing(K, 'paint_yellow', -.6, -.5, .6, -.5, 0, { h: 1.0, toe: false }); K.pop();
    K.decal('haz_flame', r + .006, y, .7, .3, .3, { face: 'e' }); K.decal('un_plate', r + .006, y, -1.2, .28, .2, { face: 'e' });   // clear of the hoops
    K.col(0, 0, 0, r * 2, y + r, L, { surf: 'metal' });
    return;
  }
  const S = { large: [10, 12], medium: [4, 8], small: [1.6, 4.5] }[v] || [4, 8], R = o.r || S[0], H = o.h || S[1], mat = o.mat || (v === 'small' ? 'p_paint_grey' : 'paint_white');
  K.cyl('concrete', 0, 0, 0, R + .4, .25, { seg: 32 });
  K.lathe(mat, [[R, .25], [R, H]], { seg: Math.max(20, Math.round(R * 5)), caps: false });
  for (let yy = 1.5; yy < H; yy += 2.4) K.lathe(mat, [[R + .03, yy - .05], [R + .06, yy], [R + .03, yy + .05]], { seg: Math.max(20, Math.round(R * 5)), caps: false });
  K.lathe(mat, [[R + .05, H], [R * .55, H + R * .12], [.6, H + R * .2], [0, H + R * .2]], { seg: Math.max(20, Math.round(R * 5)), sharp: 30 });
  K.cyl('p_galv', 0, H + R * .2, 0, .5, .4, { seg: 12 });
  // caged ladder up the side, top railing ring, nozzles
  K.push(0, 0, 0, .4); ladder(K, 'p_galv', 0, .25, R + .25, H - .25, { cage: true, standoff: true }); K.pop();
  const ring = []; for (let i = 0; i <= 24; i++) { const a = i * TAU0() / 24; ring.push([Math.cos(a) * (R - .2), H + R * .02 + 1.1, Math.sin(a) * (R - .2)]); }
  if (R > 2) { K.tube('paint_yellow', ring, .025, { seg: 6 }); for (let i = 0; i < 24; i += 2) K.cyl('paint_yellow', ring[i][0], H + .05, ring[i][2], .02, 1.1 + R * .02, { seg: 5 }); }
  for (const a of [1.2, 2.6]) K.push(Math.cos(a) * R, .9, Math.sin(a) * R, -a + PI / 2), K.cylZ('p_galv', 0, .5, 0, 0, .15, { seg: 12 }), flange(K, 'p_galv', .5, .15, 'z'), K.pop();
  K.decal('haz_flame', Math.cos(-.4) * (R + .02), H * .55, Math.sin(-.4) * (R + .02), Math.min(1.2, R * .3), Math.min(1.2, R * .3), { ry: PI / 2 + .4 });
  K.ccyl(0, 0, 0, R, H + R * .2, { surf: 'metal' });
}

// ------------------------------------------------------------------------------------------------ catwalk, ladder, scaffolding
function catwalk(K, o, v, rnd) {
  const L = o.len || 4, w = o.w || .9, h = Math.max(.15, o.h || 0), rails = o.rails || 'both', mat = v === 'yellow' ? 'paint_yellow' : v === 'grey' ? 'p_paint_grey' : 'p_galv';
  for (const s of [-1, 1]) K.box(mat, s * (w / 2 - .03), h - .12, 0, .06, .12, L, { bev: .006 });
  for (let z = -L / 2 + .02; z <= L / 2; z += Math.max(.5, L / Math.ceil(L / 1.2))) K.box(mat, 0, h - .1, z, w - .06, .05, .04);
  K.box('grate', 0, h - .03, 0, w - .06, .03, L); K.noCast('grate');
  if (h > .3) for (let z = -L / 2 + .15; z <= L / 2 - .1; z += Math.max(2, L / Math.ceil(L / 3))) for (const s of [-1, 1]) {
    K.box(mat, s * (w / 2 - .05), 0, z, .08, h - .12, .08, { bev: .006 }); K.box('steel_dark', s * (w / 2 - .05), 0, z, .2, .015, .2);
  }
  if (h > .3) for (let z = -L / 2 + .15; z < L / 2 - 2; z += Math.max(2, L / Math.ceil(L / 3))) { const a = Math.atan2(h * .6, w); K.push(0, h * .5, z, 0, 0, a); K.box(mat, 0, -.02, 0, Math.hypot(w, h * .6), .04, .04); K.pop(); }
  for (const s of [-1, 1]) {
    if (rails === 'none' || (rails === 'left' && s > 0) || (rails === 'right' && s < 0)) continue;
    railing(K, mat === 'p_galv' ? 'paint_yellow' : mat, s * (w / 2 - .03), -L / 2, s * (w / 2 - .03), L / 2, h, { h: 1.05 });
    K.col(s * (w / 2 - .02), h, 0, .05, 1.05, L, { surf: 'metal', ray: false });
  }
  K.col(0, h - .12, 0, w, .12, L, { surf: 'metal', walk: true });
}
function ladderProp(K, o, v, rnd) {
  const h = o.h || 3, mat = v === 'yellow' ? 'paint_yellow' : v === 'alu' ? 'p_alu' : 'p_galv';
  if (v === 'step') {   // A-frame step ladder
    const a = .22;
    for (const s of [-1, 1]) { K.push(0, 0, s * .0, 0, s * a, 0); for (const sx of [-1, 1]) K.box('p_alu', sx * .22, 0, s * -.0, .05, 1.8, .03); if (s > 0) for (let yy = .3; yy < 1.7; yy += .28) K.box('p_alu', 0, yy, 0, .44, .03, .09); K.pop(); }
    K.box('p_plastic_dark', 0, 1.74, 0, .5, .06, .25, { bev: .01 });
    return;
  }
  ladder(K, mat, 0, 0, 0, h, { cage: o.cage, standoff: true, w: .45 });
}
function scaffold(K, o, v, rnd) {
  const bays = Math.max(1, Math.min(8, o.bays || 2)), levels = Math.max(1, Math.min(6, o.levels || 2)), bl = 2.5, bd = 1.1, lh = 2.0;
  const L = bays * bl, mat = 'p_galv', r = .024;
  for (let b = 0; b <= bays; b++) for (const s of [-1, 1]) {
    const x = -L / 2 + b * bl, z = s * bd / 2;
    K.cyl(mat, x, .05, z, r, levels * lh + 1.0, { seg: 8 });
    K.box('steel_dark', x, 0, z, .15, .01, .15); K.cyl('steel_dark', x, .01, z, .02, .05, { seg: 6 });
    K.box('p_wood_sleeper', x, -.0, z, .25, .04, .25);
  }
  for (let l = 1; l <= levels; l++) {
    const y = l * lh;
    for (const s of [-1, 1]) K.cylX(mat, -L / 2, L / 2, y, s * bd / 2, r, { seg: 6 });
    for (let b = 0; b <= bays; b++) K.cylZ(mat, -bd / 2, bd / 2, -L / 2 + b * bl, y, r, { seg: 6 });
    // planks
    for (let b = 0; b < bays; b++) for (let p = 0; p < 4; p++) {
      const c = .85 + rnd() * .2;
      K.box('p_wood_pallet', -L / 2 + (b + .5) * bl, y + r, -bd / 2 + .14 + p * .27, bl - .04, .04, .24, { col: [c, c, c * .95] });
    }
    // guard rails on the outside (front, +z) and toe boards
    for (const yy of [.5, 1.0]) K.cylX(mat, -L / 2, L / 2, y + yy, bd / 2 + .04, r * .9, { seg: 6 });
    K.box('p_wood_pallet', 0, y + r, bd / 2 + .02, L, .15, .03);
    K.col(0, y - r, 0, L, .04 + 2 * r, bd, { surf: 'wood', walk: true });
    K.col(0, y, bd / 2 + .04, L, 1.05, .05, { surf: 'metal', ray: false });
  }
  // diagonal bracing on the back face
  for (let b = 0; b < bays; b++) for (let l = 0; l < levels; l++) {
    const x0 = -L / 2 + b * bl, a = Math.atan2(lh, bl), Ld = Math.hypot(bl, lh);
    K.push(x0 + bl / 2, l * lh + lh / 2 + .05, -bd / 2 - .04, 0, 0, (b + l) % 2 ? a : -a); K.cylX(mat, -Ld / 2, Ld / 2, 0, 0, r * .9, { seg: 6 }); K.pop();
  }
  for (let b = 0; b <= bays; b++) for (const s of [-1, 1]) K.col(-L / 2 + b * bl, 0, s * bd / 2, .08, levels * lh + 1, .08, { surf: 'metal', ray: false });
}
function rebar(K, o, v, rnd) {
  const L = o.len || 6, n = o.n || 36;
  for (const z of [-L / 2 + .8, L / 2 - .8, 0]) K.box('p_wood_sleeper', 0, 0, z, 1.0, .1, .12);
  for (let i = 0; i < n; i++) {
    const row = Math.floor(i / 9), col = i % 9;
    const x = -.32 + col * .08 + (row % 2) * .04, y = .12 + row * .065, zj = (rnd() - .5) * .3;
    K.cylZ('metal_rust', -L / 2 + zj, L / 2 + zj, x, y, .014, { seg: 5, caps: false });
  }
  const rows = Math.ceil(n / 9), top = .12 + (rows - 1) * .065 + .016;
  for (const z of [-L / 2 + 1.2, 0.3, L / 2 - 1.2]) {   // wire bands round the bundle
    const x0 = -.35, x1 = .39, y0 = .1, y1 = top, c = .02;
    K.tube('steel_dark', [[x0 + c, y0, z], [x1 - c, y0, z], [x1, y0 + c, z], [x1, y1 - c, z], [x1 - c, y1, z], [x0 + c, y1, z], [x0, y1 - c, z], [x0, y0 + c, z], [x0 + c, y0, z]], .004, { seg: 4 });
  }
  K.col(0, 0, 0, .9, .4, L, { surf: 'metal', walk: true });
}
function cementMixer(K, o, v, rnd) {
  // a portable site mixer (~140 l drum): tubular stand with two wheels at the back and legs at the front, pedestal + motor
  // cover, the drum on a yoke tilted ~35 degrees toward +z (mouth up and forward), ring gear, tilt handwheel, push handle
  const mat = v === 'yellow' ? 'paint_yellow' : 'p_paint_orange', fr = 'steel_dark', tr = .022;
  for (const s of [-1, 1]) {
    K.tube(fr, [[s * .28, .36, -.5], [s * .28, .36, .42]], tr, { seg: 6 });                            // frame rails
    K.tube(fr, [[s * .28, .36, .4], [s * .3, 0, .48]], tr, { seg: 6 });                                // front legs
    K.box(fr, s * .3, 0, .48, .08, .02, .08);
    wheel(K, s * .38, .19, -.48, .19, { w: .08, side: s, spokes: 0, rimMat: 'paint_black', rim: .5 });
    K.tube(fr, [[s * .28, .36, -.5], [s * .3, .52, -.75], [s * .3, .95, -.82]], tr, { seg: 6 });   // push handle
  }
  K.cylX(fr, -.4, .4, .19, -.48, .018, { seg: 8 });                                                     // axle
  K.tube(fr, [[-.3, .95, -.82], [.3, .95, -.82]], tr * 1.2, { seg: 6 });
  for (const z of [-.45, .38]) K.tube(fr, [[-.28, .36, z], [.28, .36, z]], tr, { seg: 6 });
  K.box(mat, 0, .38, -.18, .44, .3, .4, { bev: .04 });                                                    // motor cover
  for (const s of [-1, 1]) louvres(K, 'p_paint_darkgrey', s * .222, .44, -.18, .28, .16, 5, { ry: s * PI / 2 });
  K.box(fr, 0, .38, .1, .14, .52, .14, { bev: .01 });                                                     // pedestal
  for (const s of [-1, 1]) K.box(mat, s * .39, .82, .1, .05, .26, .1, { bev: .012 });                    // yoke uprights
  K.box(mat, 0, .82, .1, .83, .07, .12, { bev: .012 });
  // drum: closed rounded base, cylindrical waist with the ring gear, cone up to the mouth; inner skin so the mouth is not a hole
  const prof = [[0, -.4], [.14, -.39], [.3, -.26], [.35, -.08], [.35, .05], [.3, .14], [.18, .33], [.165, .37]];
  K.push(0, 1.08, .12, 0, .62, 0);
  K.lathe(mat, prof, { seg: 22, capT: false, sharp: 32 });
  K.lathe('steel_dark', prof.slice(1).reverse().map(([r, y]) => [Math.max(0, r - .012), y]), { seg: 22, caps: false, sharp: 32 });
  K.lathe(mat, [[.165, .37], [.152, .37]], { seg: 22, caps: false });                                    // lip
  K.ring('steel_dark', 0, -.02, 0, .365, .022, { seg: 22, tseg: 6 });                                   // ring gear
  for (let i = 0; i < 3; i++) { const a = i * 2.09; K.box('steel_dark', Math.cos(a) * .22, .1, Math.sin(a) * .22, .02, .22, .14, { ry: -a }); }  // blades
  K.pop();
  K.cylX(fr, -.42, .42, .99, .1, .03, { seg: 8 });                                                      // trunnion shaft
  K.ring('steel_dark', .5, .99, .1, .16, .013, { rz: PI / 2, seg: 16, tseg: 5 });                       // tilt handwheel
  for (let i = 0; i < 4; i++) { const a = i * PI / 2; K.tube('steel_dark', [[.5, .99, .1], [.5, .99 + Math.sin(a) * .16, .1 + Math.cos(a) * .16]], .008, { seg: 4 }); }
  K.col(0, 0, -.1, .9, 1.45, 1.25, { surf: 'metal' });
}

// ------------------------------------------------------------------------------------------------ site cabin, generator, AC, vents, cranes
function siteCabin(K, o, v, rnd) {
  const L = 6.0, W = 2.44, H = 2.6, mat = v === 'blue' ? 'p_paint_lightblue' : v === 'grey' ? 'p_paint_grey' : 'p_paint_cream', fr = 'p_paint_darkgrey', open = !!o.interior;
  // skid frame
  for (const s of [-1, 1]) K.box(fr, 0, 0, s * (W / 2 - .08), L, .18, .16, { bev: .01 });
  // walls: ribbed steel panels (vertical ribs), front (+z) has the door and two windows
  const doorX = -1.6, win = [[.3, 1.2], [1.9, 1.2]];
  const wall = (z, front) => {
    const pts = front ? [[-L / 2, doorX - .5], [doorX + .5, win[0][0] - .65], [win[0][0] + .65, win[1][0] - .65], [win[1][0] + .65, L / 2]] : [[-L / 2, L / 2]];
    for (const [a, b] of pts) K.box(mat, (a + b) / 2, .18, z, b - a, H - .25, .06);
    if (front) {
      for (const [wx] of win) { K.box(mat, wx, .18, z, 1.3, .9, .06); K.box(mat, wx, 2.1, z, 1.3, H - 2.17, .06); }
      K.box(mat, doorX, 2.2, z, 1.0, H - 2.27, .06);
    }
    for (let x = -L / 2 + .3; x < L / 2; x += .6) if (!front || (Math.abs(x - doorX) > .55 && win.every(([wx]) => Math.abs(x - wx) > .7))) K.box(mat, x, .18, z + (z > 0 ? .04 : -.04), .05, H - .25, .02);
  };
  wall(W / 2 - .03, true); wall(-W / 2 + .03, false);
  for (const s of [-1, 1]) K.box(mat, s * (L / 2 - .03), .18, 0, .06, H - .25, W - .12);
  K.box(fr, 0, H - .1, 0, L + .08, .14, W + .08, { bev: .02 });
  K.box(mat, 0, H - .08, 0, L - .1, .03, W - .1);
  K.box('p_wood_light', 0, .18, 0, L - .12, .04, W - .12);
  // windows (glass + frames + bars), door (open when the cabin is walk-in)
  for (const [wx] of win) {
    K.box('glass', wx, 1.08, W / 2 - .03, 1.3, 1.02, .02); K.noCast('glass');
    K.box(fr, wx, 1.05, W / 2, 1.36, .05, .06); K.box(fr, wx, 2.07, W / 2, 1.36, .05, .06);
    for (let b = -2; b <= 2; b++) K.cyl('steel_dark', wx + b * .25, 1.1, W / 2 + .04, .01, .98, { seg: 4 });
  }
  K.push(doorX + .5, .22, W / 2 - .03, open ? 1.9 : 0); K.box(fr, -.5, 0, 0, .98, 1.98, .05, { bev: .01 }); handle(K, 'p_chrome', -.88, 1.0, .03, .12, { vert: true }); K.pop();
  // steps, AC box, light
  K.box('grate', doorX, 0, W / 2 + .4, 1.0, .18, .7); K.box(fr, doorX, 0, W / 2 + .4, 1.04, .02, .74);
  K.box('p_paint_cream', 2.4, 1.7, -W / 2 - .2, .7, .5, .35, { bev: .02 }); louvres(K, 'p_paint_grey', 2.4, 1.75, -W / 2 - .38, .55, .4, 6, { ry: PI });
  K.box('emissive_white', doorX, 2.3, W / 2 + .06, .25, .08, .08); K.noCast('emissive_white');
  if (open) {
    K.col(0, 0, 0, L, .22, W, { surf: 'sheetmetal', walk: true });
    K.col(0, .22, -W / 2 + .03, L, H - .22, .08, { surf: 'sheetmetal' });
    for (const s of [-1, 1]) K.col(s * (L / 2 - .03), .22, 0, .08, H - .22, W, { surf: 'sheetmetal' });
    K.col((doorX + .5 + L / 2) / 2, .22, W / 2 - .03, L / 2 - doorX - .5, H - .22, .08, { surf: 'sheetmetal' });
    K.col((-L / 2 + doorX - .5) / 2, .22, W / 2 - .03, doorX - .5 + L / 2, H - .22, .08, { surf: 'sheetmetal' });
    K.col(doorX, 2.2, W / 2 - .03, 1.0, H - 2.2, .08, { surf: 'sheetmetal' });
    K.col(0, H - .15, 0, L, .15, W, { surf: 'sheetmetal' });
    // a desk inside
    K.box('p_wood_light', 1.8, .95, -W / 2 + .45, 1.6, .04, .7); for (const sx of [1.1, 2.5]) K.box('steel_dark', sx, .22, -W / 2 + .45, .04, .73, .6);
    K.col(1.8, .22, -W / 2 + .45, 1.6, .77, .7, { surf: 'wood' });
    K.hide(-1.5, .22, -.3, 'dark', .8);
  } else K.col(0, 0, 0, L, H, W, { surf: 'sheetmetal' });
}
function generator(K, o, v, rnd) {
  const mat = { yellow: 'paint_yellow', olive: 'p_paint_olive', white: 'paint_white', green: 'paint_green' }[v] || 'paint_yellow';
  if (o.kind === 'portable' || v === 'portable') {
    for (const s of [-1, 1]) { K.tube('steel_dark', [[s * .32, 0, -.25], [s * .32, .55, -.25], [s * .32, .55, .25], [s * .32, 0, .25]], .016, { seg: 6 }); }
    K.box('paint_red', 0, .38, -.05, .45, .18, .3, { bev: .04 });
    K.box('p_paint_darkgrey', 0, .1, .02, .4, .28, .38, { bev: .03 });
    K.cyl('steel_dark', -.15, .2, .22, .06, .12, { seg: 10 });
    K.col(0, 0, 0, .7, .58, .55, { surf: 'metal' });
    return;
  }
  const L = 2.4, W = 1.1, H = 1.45, trailer = v === 'trailer' || o.trailer;
  const y0 = trailer ? .45 : .12;
  K.box('steel_dark', 0, y0 - .12, 0, L + .1, .12, W + .05);
  K.box(mat, 0, y0, 0, L, H, W, { bev: .03 });
  for (const s of [-1, 1]) {
    louvres(K, 'p_paint_darkgrey', -.65, y0 + .25, s * (W / 2 + .01), .9, .9, 9, { ry: s > 0 ? 0 : PI });
    K.box('p_plastic_dark', .55, y0 + .1, s * (W / 2 + .004), .006, 1.25, .004);
    handle(K, 'p_chrome', .9, y0 + .8, s * (W / 2 + .01), .12, { vert: true });
  }
  K.box('p_plastic_dark', L / 2 + .005, y0 + .7, .15, .01, .45, .4); K.decal('scr_graph', L / 2 + .012, y0 + .9, .15, .3, .18, { face: 'e', glow: true });
  K.cyl('steel_dark', -.8, y0 + H, -.25, .07, .45, { seg: 10 }); K.cyl('steel_dark', -.8, y0 + H + .4, -.25, .085, .06, { seg: 10 });
  for (const s of [-1, 1]) K.ring('steel_dark', s * (L / 2 - .2), y0 + H + .05, 0, .05, .012, { rz: PI / 2, seg: 8 });
  K.decal('sign_danger', 0, y0 + 1.1, W / 2 + .012, .38, .19);
  if (trailer) {
    for (const s of [-1, 1]) wheel(K, s * (W / 2 + .12), .35, 0, .35, { w: .2, side: s, spokes: 5, rimMat: 'p_paint_grey' });
    K.tube('steel_dark', [[-L / 2, .38, -.3], [-L / 2 - .9, .4, 0], [-L / 2, .38, .3]], .035, { seg: 6 });
    K.box('steel_dark', -L / 2 - .95, .1, 0, .05, .3, .05);
  }
  K.col(0, 0, 0, L + .1, y0 + H, W + .1, { surf: 'metal' });
}
function acUnit(K, o, v, rnd) {
  if (v === 'wall') {     // split-system outdoor unit: fan on the left of the front (+z), louvred right side, wall brackets
    const w = .85, h = .6, d = .32, fx = -.13, fy = .06 + h / 2;
    K.box('steel_dark', 0, 0, -d / 2 + .05, w * .95, .05, .12);
    K.box('p_plastic_beige', 0, .06, -.01, w, h, d - .02, { bev: .02 });
    K.push(fx, fy, d / 2 - .015, 0, PI / 2, 0);
    K.lathe('p_plastic_beige', [[.24, -.02], [.25, 0], [.25, .01], [.215, .015]], { seg: 24, caps: false });
    K.pop();
    K.cylZ('paint_black', d / 2 - .03, d / 2 - .02, fx, fy, .215, { seg: 24 });
    for (let i = 0; i < 3; i++) { K.push(fx, fy, d / 2 - .025, 0, 0, i * 2.094); K.box('p_plastic_grey', .1, -.045, 0, .19, .09, .008, { rx: .35 }); K.pop(); }
    K.cylZ('p_plastic_grey', d / 2 - .03, d / 2 - .005, fx, fy, .045, { seg: 10 });
    for (let i = 0; i < 9; i++) K.cylX('p_plastic_dark', fx - .22, fx + .22, fy - .2 + i * .05, d / 2 + .004, .0035, { seg: 4 });
    for (let i = 0; i < 9; i++) K.box('p_plastic_dark', fx - .2 + i * .05, fy - .21, d / 2 + .004, .004, .42, .004);
    louvres(K, 'p_plastic_beige', .28, .14, d / 2 - .005, .2, .42, 7);
    K.cylZ('p_chrome', -d / 2 - .1, -d / 2 + .02, .36, .2, .01, { seg: 6 }); K.cylZ('p_fab_charcoal', -d / 2 - .1, -d / 2 + .02, .36, .25, .018, { seg: 6 });
    K.col(0, 0, 0, w, h + .06, d, { surf: 'sheetmetal' });
    return;
  }
  if (v === 'hvac') {    // packaged rooftop unit
    const L = 3.0, W = 1.5, H = 1.3;
    K.box('steel_dark', 0, 0, 0, L + .1, .12, W + .1);
    K.box('p_paint_cream', 0, .12, 0, L, H, W, { bev: .02 });
    for (const s of [-1, 1]) louvres(K, 'p_paint_grey', .7, .3, s * (W / 2 + .005), 1.3, .9, 10, { ry: s > 0 ? 0 : PI });
    for (const x of [-.8, .4]) { K.cyl('steel_dark', x, H + .12, 0, .42, .06, { seg: 18 }); K.cyl('grate', x, H + .18, 0, .4, .01, { seg: 18 }); K.cyl('steel_dark', x, H + .1, 0, .06, .1, { seg: 8 }); }
    K.noCast('grate');
    for (const s of [-1, 1]) K.box('p_paint_grey', -1.25, .3, s * (W / 2 + .004), .3, .9, .004);
    K.col(0, 0, 0, L + .1, H + .2, W + .1, { surf: 'sheetmetal' });
    return;
  }
  const w = 1.0, d = 1.0, h = 1.05;   // condenser
  K.box('p_paint_grey', 0, 0, 0, w + .05, .08, d + .05);
  K.box('p_paint_cream', 0, .08, 0, w, .06, d); K.box('p_paint_cream', 0, h - .06, 0, w, .06, d, { bev: .01 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) K.box('p_paint_cream', sx * (w / 2 - .03), .08, sz * (d / 2 - .03), .06, h - .1, .06);
  for (let i = 0; i < 4; i++) { K.push(0, 0, 0, i * PI / 2); K.box('grate', 0, .14, d / 2 - .01, w - .1, h - .25, .01); K.pop(); }
  K.noCast('grate');
  K.box('steel_dark', 0, .2, 0, w - .2, h - .4, d - .2);
  K.cyl('grate', 0, h - .01, 0, .42, .015, { seg: 20 }); K.cyl('steel_dark', 0, h - .1, 0, .08, .08, { seg: 8 });
  for (let i = 0; i < 4; i++) { K.push(0, h - .05, 0, i * PI / 2); K.box('steel_dark', .18, 0, 0, .32, .01, .1, { rx: .25 }); K.pop(); }
  K.box('p_paint_cream', w / 2 - .12, .5, d / 2 + .005, .18, .25, .02);
  K.cylZ('p_chrome', -d / 2 - .25, -d / 2, .3, .2, .012, { seg: 6 }); K.cylZ('p_fab_charcoal', -d / 2 - .25, -d / 2, .3, .26, .02, { seg: 6 });
  K.col(0, 0, 0, w + .05, h, d + .05, { surf: 'sheetmetal' });
}
function vent(K, o, v, rnd) {
  if (v === 'duct') {    // crawl-through service duct: open both ends, inside 1.2 x 1.35 (crouch only)
    const L = o.len || 2.4, W = 1.3, H = 1.45, t = .05, mat = 'p_galv';
    K.box(mat, 0, 0, 0, W, t, L); K.box(mat, 0, H - t, 0, W, t, L);
    for (const s of [-1, 1]) K.box(mat, s * (W / 2 - t / 2), t, 0, t, H - 2 * t, L);
    for (let z = -L / 2; z <= L / 2 + 1e-6; z += L / Math.max(1, Math.round(L / 1.2))) {   // flanged seams
      K.box(mat, 0, -.02, z, W + .06, .04, .05); K.box(mat, 0, H - .02, z, W + .06, .04, .05);
      for (const s of [-1, 1]) K.box(mat, s * (W / 2 + .015), 0, z, .03, H, .05);
    }
    for (let z = -L / 2 + .6; z < L / 2; z += 1.2) K.box('steel_dark', 0, -.0, z, W + .2, .06, .08);
    K.col(0, 0, 0, W, t, L, { surf: 'sheetmetal', walk: true }); K.col(0, H - t, 0, W, t, L, { surf: 'sheetmetal' });
    for (const s of [-1, 1]) K.col(s * (W / 2 - t / 2), 0, 0, t, H, L, { surf: 'sheetmetal' });
    K.hide(0, t, 0, 'vent', .5);
    return;
  }
  if (v === 'box') {
    const w = .9, d = .9, h = .7;
    K.box('p_galv', 0, 0, 0, w + .1, .15, d + .1);
    K.box('p_galv', 0, .15, 0, w, h - .15, d);
    for (let i = 0; i < 4; i++) { K.push(0, 0, 0, i * PI / 2); louvres(K, 'p_galv', 0, .22, d / 2 + .005, w - .15, .38, 5); K.pop(); }
    K.lathe('p_galv', [[0, h + .15], [w * .75, h], [w * .75, h - .03]], { seg: 4, ry: PI / 4, sharp: 20 });
    K.col(0, 0, 0, w + .1, h + .1, d + .1, { surf: 'sheetmetal' });
    return;
  }
  // mushroom / gooseneck roof vent
  K.cyl('p_galv', 0, 0, 0, .25, .12, { seg: 16 });
  K.cyl('p_galv', 0, .12, 0, .15, .45, { seg: 14 });
  K.lathe('p_galv', [[.15, .55], [.32, .6], [.32, .68], [.28, .74], [.1, .8], [0, .82]], { seg: 16, sharp: 40 });
  K.lathe('grate', [[.155, .57], [.155, .66]], { seg: 16, caps: false });
  K.ccyl(0, 0, 0, .3, .8, { surf: 'sheetmetal' });
}
function cranePortal(K, o, v, rnd) {
  // ship-to-shore crane portal: two box-section legs per side on rail bogies + the cross beam (along x = gauge, legs along z)
  const H = o.h || 18, gauge = o.gauge || 16, span = o.span || 12, mat = v === 'blue' ? 'paint_blue' : v === 'red' ? 'paint_red' : 'paint_yellow';
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const x = sx * gauge / 2, z = sz * span / 2;
      K.box(mat, x, 1.4, z, 1.4, H - 1.4, 1.4, { bev: .05 });
      for (let yy = 3; yy < H - 1; yy += 3) K.box(mat, x, yy, z, 1.46, .05, 1.46);
      bolts(K, 'steel_dark', [[x - .5, 2, z + .71], [x + .5, 2, z + .71], [x - .5, 2.4, z + .71], [x + .5, 2.4, z + .71]], .02, 'z');
      // bogie: equaliser beam + 4 rail wheels
      K.box(mat, x, .45, z, 1.0, .95, 2.4, { bev: .04 });
      for (const wz of [-.8, -.27, .27, .8]) K.cylX('steel_dark', x - .3, x + .3, .42, z + wz, .4, { seg: 14 });
      K.box('paint_black', x, .95, z, 1.1, .2, 2.5); K.decal('sign_danger', x + .56, .5, z + .6, .4, .2, { face: 'e' });
    }
    // sill beam along z (bottom), portal tie along z at the top
    K.box(mat, sx * gauge / 2, 1.4, 0, 1.1, 1.2, span - 1.2, { bev: .04 });
    K.box(mat, sx * gauge / 2, H - 1.8, 0, 1.2, 1.4, span + 1.4, { bev: .04 });
    // diagonal stays
    const L = Math.hypot(span / 2, H * .45), a = Math.atan2(H * .45, span / 2);
    for (const sz of [-1, 1]) { K.push(sx * gauge / 2, H * .3, sz * span / 4, 0, sz * -a, 0); K.box(mat, 0, -.3, 0, .5, .6, L); K.pop(); }
  }
  // cross girders along x at the top
  for (const sz of [-1, 1]) K.box(mat, 0, H - 1.6, sz * span / 2, gauge + 1.4, 1.6, 1.3, { bev: .05 });
  K.box('steel_dark', 0, H, 0, gauge + 1.4, .1, span + 1.4);
  ladder(K, 'paint_yellow', -gauge / 2 + .4, 1.4, -span / 2 + .72, H - 3.2, { cage: true });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) K.col(sx * gauge / 2, 0, sz * span / 2, 1.4, H, 2.4, { surf: 'metal' });
  for (const sx of [-1, 1]) { K.col(sx * gauge / 2, 1.4, 0, 1.1, 1.2, span, { surf: 'metal' }); K.col(sx * gauge / 2, H - 1.8, 0, 1.2, 1.8, span + 1.4, { surf: 'metal' }); }
  for (const sz of [-1, 1]) K.col(0, H - 1.6, sz * span / 2, gauge + 1.4, 1.6, 1.3, { surf: 'metal' });
}
function towerCrane(K, o, v, rnd) {
  // tower crane: concrete footing + lattice mast sections up to h (no jib: map workers add one if they want)
  const H = o.h || 12, s = 1.8, mat = 'paint_yellow';
  K.box('concrete', 0, 0, 0, 5, .8, 5, { bev: .03 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { K.box('steel_dark', sx * s / 2, .8, sz * s / 2, .4, .12, .4); bolts(K, 'steel_dark', [[sx * s / 2 + .12, .92, sz * s / 2 + .12], [sx * s / 2 - .12, .92, sz * s / 2 - .12]], .03, 'y', .05); }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) K.box(mat, sx * s / 2, .8, sz * s / 2, .14, H - .8, .14);
  for (let y = .8; y < H - .5; y += 1.5) for (let f = 0; f < 4; f++) {
    K.push(0, 0, 0, f * PI / 2);
    K.box(mat, 0, y, s / 2, s, .08, .08);
    const L = Math.hypot(s, 1.5), a = Math.atan2(1.5, s);
    K.push(0, y + .75, s / 2, 0, 0, ((y - .8) / 1.5) % 2 ? a : -a); K.box(mat, 0, -.03, 0, L, .06, .06); K.pop();
    K.pop();
  }
  ladder(K, 'p_galv', 0, .8, -.2, H - .8, { w: .4 });
  K.col(0, 0, 0, 5, .8, 5, { surf: 'concrete', walk: true });
  K.col(0, .8, 0, s + .14, H - .8, s + .14, { surf: 'metal', ray: false });
}

export default [
  { type: 'container', alias: ['container_20', 'shipping_container'], cat: 'industrial', size: [2.44, 2.59, 6.06], keys: ['len', 'doors', 'hc'],
    desc: 'ISO shipping container: corrugated walls, corner castings, door gear, markings; doors closed / open / ajar / none (open = walk-in)',
    variants: ['red', 'blue', 'green', 'orange', 'grey', 'white', 'rust'], opts: { len: '20 | 40 (ft)', doors: "'closed' | 'open' | 'ajar' | 'none'", hc: 'true = 9 ft 6 high cube (2.9 m)' },
    sizeOf: o => [2.44, o.hc ? 2.9 : 2.59, +o.len === 40 ? 12.19 : 6.06], build: container },
  { type: 'container_40', cat: 'industrial', size: [2.44, 2.59, 12.19], keys: ['doors', 'hc'], desc: '40 ft container (same as container len 40)', variants: ['red', 'blue', 'green', 'orange', 'grey', 'white', 'rust'],
    opts: { doors: "'closed' | 'open' | 'ajar' | 'none'", hc: 'high cube' }, build: (K, o, v, r) => container(K, Object.assign({}, o, { len: 40 }), v, r) },
  { type: 'crate', alias: ['crate_wood'], cat: 'industrial', size: [1.0, .8, .8], vary: true, desc: 'wooden crate with battens, braces and stencils', variants: Object.keys(CRATE), dflt: 'medium',
    opts: { variant: 'small .6 | medium 1.0x.8x.8 | large 1.2 | long 2.0x.7x.8 | mil (olive, rope handles) | ply' }, sizeOf: (o, v) => CRATE[v] || CRATE.medium, build: crate },
  { type: 'crate_stack', cat: 'industrial', size: [2.4, 1.9, 1.3], vary: true, keys: ['n'], desc: 'seeded heap of 4-6 mixed wooden crates', opts: { n: 'crates (<= 6)' }, build: crateStack },
  { type: 'crate_plastic', cat: 'industrial', size: [.6, .31, .4], vary: true, keys: ['n', 'load'], desc: 'stackable ribbed plastic crate', variants: ['blue', 'red', 'green', 'grey', 'yellow', 'black'],
    opts: { n: 'stack height (1-8)', load: 'false = always empty' }, sizeOf: o => [.6, (o.n || 1) * .29 + .02, .4], build: plasticCrate },
  { type: 'ammo_can', cat: 'military', size: [.3, .19, .16], vary: true, keys: ['n'], desc: 'olive steel ammo cans (cluster of n <= 6)', opts: { n: 'count' }, build: ammoCan },
  { type: 'pallet', cat: 'industrial', size: [1.2, .144, .8], vary: true, keys: ['stack', 'load', 'h'], desc: 'EUR pallet (5 deck boards, 9 blocks); stack or load it',
    variants: ['none', 'boxes', 'wrap', 'sacks', 'drums', 'bricks', 'cylinders', 'pipes'], opts: { stack: 'pallets in the stack (1-14)', load: 'same as variant', h: 'box load height (boxes / wrap)' },
    sizeOf: o => [1.2, (o.stack || 1) * .144, .8], build: pallet },
  { type: 'drum', alias: ['oil_drum', 'barrel'], cat: 'industrial', size: [.6, .88, .6], vary: true, keys: ['n', 'fallen'], desc: '208 l steel drum with chimes and rolling hoops',
    variants: Object.keys(DRUMCOL), opts: { n: 'cluster of 1-4', fallen: 'true = the first drum lies on its side' }, build: drum },
  { type: 'gas_cylinder', cat: 'industrial', size: [.23, 1.55, .23], vary: true, keys: ['n', 'rack'], desc: 'compressed gas cylinders (colour-coded), LPG bottle, or a caged rack of six',
    variants: ['oxygen', 'acetylene', 'nitrogen', 'co2', 'argon', 'propane'], opts: { n: 'row of n (<= 5)', rack: 'true = steel cage with 6 cylinders (1.0 x 1.6 x .55)' }, build: gasCylinder },
  { type: 'ibc_tank', cat: 'industrial', size: [1.2, 1.19, 1.0], desc: 'IBC tote: milky (white) or opaque blue tank in a steel cage on a pallet base', variants: ['white', 'blue'], build: ibc },
  { type: 'dumpster', cat: 'industrial', size: [1.9, 1.26, 1.12], keys: ['lid'], desc: 'front-load dumpster, sloped front, plastic lids, fork pockets, casters (hide behind)',
    variants: Object.keys(DUMPCOL), opts: { lid: "'closed' | 'open'" }, build: dumpster },
  { type: 'wheelie_bin', cat: 'street', size: [.6, 1.07, .76], keys: ['open', 'lid'], desc: '240 l wheelie bin', variants: Object.keys(BINCOL), opts: { open: 'lid open', lid: 'lid colour (variant name)' }, build: wheelieBin },
  { type: 'trash_bag', cat: 'street', size: [.5, .55, .45], vary: true, keys: ['n'], desc: 'tied bin bags; n > 2 makes a pile with a collider', variants: ['black', 'green', 'blue'], opts: { n: 'bags (1-10)' }, build: trashBags },
  { type: 'cardboard_box', cat: 'industrial', size: [.6, .45, .4], vary: true, keys: ['stack', 'n'], desc: 'taped carton (labels), stack, or a mixed pile',
    variants: ['medium', 'small', 'large', 'flat', 'pile'], opts: { stack: 'stack n high', n: 'pile size' }, sizeOf: (o, v) => v === 'pile' ? [1.6, 1.2, .8] : BOX[v] || BOX.medium, build: cardboardBox },
  { type: 'rack', alias: ['pallet_rack', 'racking'], cat: 'industrial', size: [5.7, 5.1, 1.1], vary: true, keys: ['bays', 'levels', 'lh', 'load', 'topLoad'],
    desc: 'warehouse pallet racking (blue frames, orange beams) loaded with pallets of goods; runs along x',
    opts: { bays: '2.7 m bays (1-8)', levels: 'beam levels (1-5)', lh: 'level height (1.6)', load: 'fill ratio 0..1 (.75)', topLoad: 'goods on the top level' },
    sizeOf: o => { const b = o.bays || 2, l = o.levels || 3; return [b * 2.8 + .1, l * (o.lh || 1.6) + .3, 1.1]; }, build: rack },
  { type: 'shelf_unit', cat: 'industrial', size: [1.2, 2.0, .5], vary: true, keys: ['w', 'load', 'boards'], desc: 'boltless steel shelving with boxes, bins and bottles',
    variants: ['dark', 'grey', 'green'], opts: { w: 'width', load: 'false = empty', boards: 'false = steel shelves' }, build: shelfUnit },
  { type: 'forklift', cat: 'industrial', size: [1.15, 2.2, 3.4], keys: ['forks'], desc: 'counterbalance forklift with mast, overhead guard and forks (front = forks)',
    variants: ['yellow', 'orange', 'red'], opts: { forks: 'fork height (.1)' }, build: forklift },
  { type: 'pallet_jack', cat: 'industrial', size: [.55, 1.25, 1.6], desc: 'hand pallet truck (no collider)', variants: ['red', 'yellow', 'blue'], build: palletJack },
  { type: 'pipe', cat: 'industrial', size: [.3, .55, 4], keys: ['len', 'd', 'h', 'dir', 'flange'], desc: 'flanged pipe on T-stands (along z) or a vertical riser',
    variants: Object.keys(PIPECOL), opts: { len: 'length (4)', d: 'diameter (.3)', h: 'height of the pipe bottom (.25; 0 = on the ground, no stands)', dir: "'y' = vertical", flange: 'false = plain' },
    sizeOf: o => [(o.d || .3) * 1.6, (o.h == null ? .25 : o.h) + (o.d || .3), o.len || 4], build: pipe },
  { type: 'pipe_elbow', cat: 'industrial', size: [1.5, .55, 1.5], keys: ['d', 'h'], desc: '90 degree bend: comes in along +z (from -z), leaves along +x', variants: Object.keys(PIPECOL), opts: { d: 'diameter', h: 'height' }, build: pipeElbow },
  { type: 'valve', cat: 'industrial', size: [.6, 1.0, 1.0], keys: ['d', 'h'], desc: 'flanged gate valve with handwheel on a pipe stub (along z)', variants: Object.keys(PIPECOL), opts: { d: 'pipe diameter (.2)', h: 'height' }, build: valve },
  { type: 'tank', alias: ['storage_tank'], cat: 'industrial', size: [8, 8.8, 8], keys: ['r', 'h', 'len', 'mat'], desc: 'vertical storage tank (caged ladder, top rail, nozzles) or a horizontal fuel tank on saddles',
    variants: ['medium', 'large', 'small', 'horizontal'], opts: { r: 'radius', h: 'shell height', len: 'horizontal length', mat: 'material name' },
    sizeOf: (o, v) => v === 'horizontal' ? [2.5, 3, o.len || 8] : (() => { const S = { large: [10, 12], medium: [4, 8], small: [1.6, 4.5] }[v] || [4, 8]; const R = o.r || S[0]; return [R * 2, (o.h || S[1]) + R * .2, R * 2]; })(), build: tank },
  { type: 'catwalk', cat: 'industrial', size: [.9, 1.1, 4], keys: ['len', 'w', 'h', 'rails'], desc: 'grated walkway with railings (along z); deck top at y + h, legs when raised',
    variants: ['galv', 'yellow', 'grey'], opts: { len: 'length', w: 'width (.9)', h: 'deck height above y (0)', rails: "'both' | 'left' | 'right' | 'none'" },
    sizeOf: o => [o.w || .9, (o.h || 0) + 1.1, o.len || 4], build: catwalk },
  { type: 'ladder', cat: 'industrial', size: [.5, 3, .1], keys: ['h', 'cage'], desc: 'fixed steel ladder against a wall (visual, faces +z) or an A-frame step ladder', variants: ['galv', 'yellow', 'alu', 'step'],
    opts: { h: 'height', cage: 'safety cage (> 2.6 m)' }, build: ladderProp },
  { type: 'scaffolding', alias: ['scaffold'], cat: 'construction', size: [5, 5, 1.1], keys: ['bays', 'levels'], desc: 'tube scaffold: walkable plank decks every 2 m, guard rails on the +z side, bracing',
    opts: { bays: '2.5 m bays along x', levels: 'decks (2 m apart)' }, sizeOf: o => [(o.bays || 2) * 2.5, (o.levels || 2) * 2 + 1, 1.1], build: scaffold },
  { type: 'rebar_bundle', cat: 'construction', size: [.9, .4, 6], vary: true, keys: ['len', 'n'], desc: 'bundle of rebar on timber sleepers (along z)', opts: { len: 'length', n: 'bars' }, build: rebar },
  { type: 'cement_mixer', cat: 'construction', size: [1.0, 1.5, 1.4], desc: 'portable site mixer: tilted drum on a yoke, tilt handwheel, motor cover, two wheels + legs, push handle (back = -z)', variants: ['orange', 'yellow'], build: cementMixer },
  { type: 'site_cabin', cat: 'construction', size: [6.0, 2.6, 2.44], keys: ['interior'], desc: 'portable site office: ribbed walls, barred windows, door + steps on +z; interior = walk-in with a desk',
    variants: ['cream', 'blue', 'grey'], opts: { interior: 'true = hollow, door open' }, build: siteCabin },
  { type: 'generator', cat: 'industrial', size: [2.5, 1.6, 1.2], keys: ['trailer', 'kind'], desc: 'diesel generator set (louvres, panel, exhaust), trailer-mounted, or a small portable one',
    variants: ['yellow', 'olive', 'white', 'green', 'trailer', 'portable'], opts: { trailer: 'on a trailer' }, build: generator },
  { type: 'ac_unit', cat: 'industrial', size: [1.05, 1.05, 1.05], desc: 'rooftop condenser, wall split unit (.85 x .6 x .32) or a packaged HVAC unit (3 x 1.5 x 1.5)', variants: ['condenser', 'wall', 'hvac'], build: acUnit },
  { type: 'vent', cat: 'industrial', size: [.6, .82, .6], keys: ['len'], desc: "roof vents ('mushroom', 'box'), or a crawl-through service 'duct' (1.3 x 1.45, crouch inside; hide 'vent')",
    variants: ['mushroom', 'box', 'duct'], opts: { len: 'duct length (2.4)' }, sizeOf: (o, v) => v === 'duct' ? [1.3, 1.45, o.len || 2.4] : v === 'box' ? [1, .85, 1] : [.6, .82, .6], build: vent },
  { type: 'crane_portal', alias: ['gantry_legs'], cat: 'industrial', size: [17.4, 18, 14], keys: ['h', 'gauge', 'span'], desc: 'ship-to-shore crane portal: 4 box legs on rail bogies, sill beams, top girders (gauge along x)',
    variants: ['yellow', 'blue', 'red'], opts: { h: 'height (18)', gauge: 'rail gauge along x (16)', span: 'leg spacing along z (12)' }, build: cranePortal },
  { type: 'tower_crane_base', cat: 'construction', size: [5, 12, 5], keys: ['h'], desc: 'tower crane footing and lattice mast', opts: { h: 'mast height' }, build: towerCrane },
];
