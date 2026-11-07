/* LIVE FIRE — interior props (catalogue for js/maps/props.js): offices, homes, kitchens, bars, washrooms, lockers, hospital,
   server rooms, control rooms, light fixtures, doors, windows, curtains, rugs, posters, clocks, fire extinguishers.
   Exports: default [prop definitions]. Local space: origin = floor centre, front (seat fronts, screens, doors) = +z;
   wall-mounted props (posters, clocks, extinguishers, wall cabinets) have their back at z = 0 and stick out to +z. */
import { leg4, cushion, handle, bolts, louvres, panelLines, wheel, grid, stackBoxes } from './parts.js';

const PI = Math.PI;
const FAB = { grey: 'p_fab_grey', blue: 'p_fab_blue', red: 'p_fab_red', green: 'p_fab_green', beige: 'p_fab_beige', brown: 'p_fab_brown', charcoal: 'p_fab_charcoal', mustard: 'p_fab_mustard', teal: 'p_fab_teal', leather: 'p_leather_black', tan: 'p_leather_brown' };

// ------------------------------------------------------------------------------------------------ office
function desk(K, o, v, rnd) {
  const exec = v === 'exec', metal = v === 'metal', W = o.w || (exec ? 1.9 : 1.6), D = exec ? .9 : .8, H = .75;
  const top = exec ? 'p_wood_walnut' : metal ? 'p_paint_grey' : 'p_wood_light', frame = exec ? 'p_wood_walnut' : metal ? 'p_paint_grey' : 'p_paint_darkgrey';
  K.box(top, 0, H - .03, 0, W, .03, D, { bev: .006 });
  if (exec || metal) {
    for (const s of [-1, 1]) {
      K.box(frame, s * (W / 2 - .22), 0, 0, .42, H - .03, D - .04, { bev: .006 });
      for (let i = 0; i < 3; i++) { K.box(frame, s * (W / 2 - .22), .05 + i * .23, D / 2 - .02, .38, .2, .015, { bev: .004 }); handle(K, 'p_chrome', s * (W / 2 - .22), .17 + i * .23, D / 2 - .01, .12, { off: .02, r: .006 }); }
    }
    K.box(frame, 0, .25, -D / 2 + .03, W - .9, .45, .02);
  } else {
    for (const s of [-1, 1]) { K.box(frame, s * (W / 2 - .04), 0, 0, .05, H - .03, D - .1); K.box(frame, s * (W / 2 - .04), 0, 0, .07, .03, D - .05); }
    K.box(frame, 0, .3, -D / 2 + .06, W - .1, .4, .015);
    K.box('p_paint_grey', W / 2 - .3, 0, 0, .42, .62, .55, { bev: .006 });      // drawer pedestal
    for (let i = 0; i < 3; i++) { K.box('p_paint_grey', W / 2 - .3, .04 + i * .2, .28, .4, .18, .01); K.box('p_chrome', W / 2 - .3, .16 + i * .2, .29, .12, .015, .015); }
  }
  if (o.items !== false) {      // papers, a phone, a mug
    K.box('paint_white', -W * .2, H, -.05, .3, .01, .22, { ry: .2 }); K.box('paint_white', -W * .2 + .02, H + .01, -.06, .3, .005, .22, { ry: .1 });
    K.box('p_plastic_dark', W * .3, H, -.15, .2, .05, .18, { bev: .01, ry: -.3 });
    K.cyl('paint_white', -W * .35, H, .15, .04, .1, { seg: 10 });
  }
  K.col(0, 0, 0, W, H, D, { surf: 'wood' });
}
function officeChair(K, o, v, rnd) {
  const fab = FAB[v] || 'p_fab_charcoal';
  for (let i = 0; i < 5; i++) { const a = i * PI * 2 / 5; K.push(0, .06, 0, a); K.box('p_plastic_dark', 0, 0, .17, .05, .04, .34, { bev: .01 }); K.pop(); K.blob('p_plastic_dark', Math.sin(a) * .32, .03, Math.cos(a) * .32, .03, .03, .03, { seg: 6 }); }
  K.cyl('p_chrome', 0, .08, 0, .025, .32, { seg: 8 }); K.cyl('p_plastic_dark', 0, .08, 0, .035, .15, { seg: 8 });
  K.box('p_plastic_dark', 0, .4, 0, .3, .04, .3);
  cushion(K, fab, 0, .44, .02, .5, .08, .48);
  K.box('p_plastic_dark', 0, .44, -.24, .06, .3, .04);
  K.push(0, .7, -.27, 0, -.12, 0); cushion(K, fab, 0, 0, 0, .46, .55, .07); K.pop();
  for (const s of [-1, 1]) { K.box('p_plastic_dark', s * .27, .44, -.02, .03, .2, .04); K.box('p_plastic_dark', s * .27, .64, .02, .06, .03, .25, { bev: .01 }); }
  K.col(0, 0, 0, .55, .5, .55, { surf: 'fabric' });
}
function monitor(K, o, v, rnd) {
  const on = o.on !== false, W = .56, H = .34;
  K.box('p_plastic_dark', 0, 0, 0, .22, .015, .18, { bev: .005 });
  K.box('p_plastic_dark', 0, .015, -.03, .05, .2, .025);
  K.box('p_plastic_dark', 0, .12, -.01, W, H, .03, { bev: .005 });
  K.decal(on ? ['scr_desktop', 'scr_code', 'scr_graph', 'scr_map'][Math.floor(rnd() * 4)] : 'keyboard', 0, .12 + H / 2, .006, W - .03, H - .03, { glow: on });
  if (!on) K.box('p_screen', 0, .135, .006, W - .03, H - .03, .002);
  if (o.keyboard !== false) {
    K.box('p_plastic_dark', 0, 0, .25, .44, .02, .14, { bev: .004, rx: -.05 }); K.decal('keyboard', 0, .022, .25, .42, .13, { face: 'u' });
    K.box('p_plastic_dark', .32, 0, .26, .06, .025, .1, { bev: .01 });
  }
}
function workstation(K, o, v, rnd) {
  K.push(0, 0, 0); desk(K, { w: 1.6, items: true }, 'office', rnd); K.pop();
  K.push(-.15, .75, -.18); monitor(K, { on: o.on, keyboard: true }, null, rnd); K.pop();
  if (v === 'dual') { K.push(.42, .75, -.2, -.35); monitor(K, { on: o.on, keyboard: false }, null, rnd); K.pop(); }
  K.push(-.1, 0, .75, PI + (rnd() - .5) * .6); officeChair(K, {}, 'charcoal', rnd); K.pop();
  K.col(-.1, 0, .75, .55, .5, .55, { surf: 'fabric' });
}
function cubicle(K, o, v, rnd) {
  const W = o.w || 1.8, D = o.d || 1.8, H = 1.5, t = .06, fab = FAB[v] || 'p_fab_grey';
  const panel = (x, z, L, ry) => {
    K.push(x, 0, z, ry);
    K.box(fab, 0, .1, 0, L - .04, H - .12, t - .01);
    K.box('p_alu', 0, H - .03, 0, L, .03, t + .01); K.box('p_alu', -L / 2 + .015, 0, 0, .03, H, t + .01); K.box('p_alu', L / 2 - .015, 0, 0, .03, H, t + .01);
    K.box('p_paint_darkgrey', 0, 0, 0, L - .04, .1, t - .02);
    K.pop();
  };
  panel(0, -D / 2 + t / 2, W, 0); panel(-W / 2 + t / 2, 0, D, PI / 2); panel(W / 2 - t / 2, -D * .2, D * .6, PI / 2);
  // L-shaped work surface along the back and left panels, monitor, chair, pinned papers
  K.box('p_wood_light', 0, .72, -D / 2 + .38, W - .14, .03, .62); K.box('p_wood_light', -W / 2 + .38, .72, .1, .62, .03, D - .9);
  K.box('p_paint_darkgrey', W / 2 - .35, 0, -D / 2 + .38, .4, .7, .55);
  K.push(-.05, .75, -D / 2 + .3); monitor(K, { on: o.on }, null, rnd); K.pop();
  K.push(0, 0, .15, PI + (rnd() - .5) * .8); officeChair(K, {}, 'charcoal', rnd); K.pop();
  K.decal('flyer_' + Math.floor(rnd() * 2), .3, 1.15, -D / 2 + t + .002, .16, .22); K.decal('poster_' + Math.floor(rnd() * 6), -.4, 1.1, -D / 2 + t + .002, .2, .3);
  K.col(0, 0, -D / 2 + t / 2, W, H, t, { surf: 'fabric' }); K.col(-W / 2 + t / 2, 0, 0, t, H, D, { surf: 'fabric' }); K.col(W / 2 - t / 2, 0, -D * .2, t, H, D * .6, { surf: 'fabric' });
  K.col(0, 0, -D / 2 + .38, W - .14, .75, .62, { surf: 'wood' }); K.col(-W / 2 + .38, 0, .1, .62, .75, D - .9, { surf: 'wood' });
  K.hide(.2, 0, -.2, 'dark', .5);
}
function filingCabinet(K, o, v, rnd) {
  const n = v === '2' ? 2 : 4, H = n === 2 ? .72 : 1.32, mat = o.color === 'beige' ? 'p_paint_beige' : o.color === 'black' ? 'paint_black' : 'p_paint_grey';
  K.box(mat, 0, 0, 0, .47, H, .62, { bev: .008 });
  for (let i = 0; i < n; i++) {
    const y = .04 + i * (H - .06) / n, h = (H - .06) / n - .02;
    K.box(mat, 0, y, .31, .44, h, .012, { bev: .003 });
    handle(K, 'p_chrome', 0, y + h * .62, .322, .14, { off: .025, r: .007 }); K.box('p_chrome', 0, y + h * .8, .322, .08, .03, .004);
    if (o.open === i) { K.box(mat, 0, y, .31 + .2, .42, h - .02, .4, { skip: 't' }); K.box('paint_white', 0, y + .05, .5, .38, h - .1, .3); }
  }
  K.col(0, 0, 0, .47, H, .62, { surf: 'metal' });
}
function bookshelf(K, o, v, rnd) {
  const W = o.w || .9, H = 2.0, D = .32, metal = v === 'metal', mat = metal ? 'p_paint_grey' : v === 'white' ? 'p_wood_white' : 'p_wood_walnut', n = 5;
  for (const s of [-1, 1]) K.box(mat, s * (W / 2 - .01), 0, 0, .02, H, D);
  K.box(mat, 0, 0, -D / 2 + .005, W, H, .01); K.box(mat, 0, H - .02, 0, W, .02, D); K.box(mat, 0, 0, 0, W, .06, D);
  for (let i = 1; i < n; i++) K.box(mat, 0, i * H / n - .01, 0, W - .04, .02, D - .01);
  if (o.empty) { K.col(0, 0, 0, W, H, D, { surf: 'wood' }); return; }
  for (let i = 0; i < n; i++) {
    const y0 = i === 0 ? .06 : i * H / n + .01, hh = H / n - .06;
    let x = -W / 2 + .03;
    while (x < W / 2 - .1) {
      const w = .18 + rnd() * .35; if (x + w > W / 2 - .03) break;
      if (rnd() < .18) { x += .08; continue; }
      const bh = hh * (.75 + rnd() * .2);
      K.box('cardboard', x + w / 2, y0, -.02, w, bh, D - .1, { col: [.4 + rnd() * .3, .3 + rnd() * .25, .25 + rnd() * .2] });
      K.decal('books_' + Math.floor(rnd() * 4), x + w / 2, y0 + bh / 2, D / 2 - .07 + .002, w, bh);
      x += w + .01;
    }
    if (rnd() < .4) K.box('p_plastic_dark', W / 2 - .12, y0, 0, .12, .18, .15, { bev: .01 });
  }
  K.col(0, 0, 0, W, H, D, { surf: 'wood' });
}

// ------------------------------------------------------------------------------------------------ living room / bedroom
function sofa(K, o, v, rnd) {
  const seats = o.seats || 3, W = .65 * seats + .3, D = .9, fab = FAB[v] || 'p_fab_grey';
  K.box(fab, 0, .12, -.05, W, .3, D - .1, { bev: .04 });
  for (const s of [-1, 1]) cushion(K, fab, s * (W / 2 - .1), .12, 0, .2, .52, D, { bev: .06 });
  cushion(K, fab, 0, .12, -D / 2 + .1, W - .02, .72, .2, { bev: .06 });
  for (let i = 0; i < seats; i++) {
    const x = -W / 2 + .15 + (i + .5) * (W - .3) / seats;
    cushion(K, fab, x, .42, .05, (W - .3) / seats - .01, .14, D - .3);
    K.push(x, .55, -D / 2 + .3, 0, -.18, 0); cushion(K, fab, 0, 0, 0, (W - .3) / seats - .02, .4, .16); K.pop();
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) K.cyl('p_wood_walnut', sx * (W / 2 - .08), 0, sz * (D / 2 - .1), .025, .12, { seg: 8, r2: .02 });
  K.col(0, 0, 0, W, .56, D, { surf: 'fabric' }); K.col(0, .56, -D / 2 + .1, W, .28, .2, { surf: 'fabric' });
}
function armchair(K, o, v, rnd) { sofa(K, Object.assign({}, o, { seats: 1 }), v, rnd); }
function coffeeTable(K, o, v, rnd) {
  const glass = v === 'glass', W = 1.2, D = .6, H = .45;
  K.box(glass ? 'p_glass_tint' : 'p_wood_walnut', 0, H - .03, 0, W, .03, D, { bev: .006 });
  if (glass) { K.noCast('p_glass_tint'); K.box('p_chrome', 0, .1, 0, W - .1, .02, D - .1); for (const sx of [-1, 1]) K.box('p_chrome', sx * (W / 2 - .05), 0, 0, .03, H - .03, D - .05); }
  else { leg4(K, 'p_wood_walnut', W, D, H - .03, .05, { inset: .03 }); K.box('p_wood_walnut', 0, .12, 0, W - .12, .02, D - .12); }
  if (rnd() < .7) { K.box('paint_white', -.2, H, .05, .25, .015, .32, { ry: .3 }); K.cyl('p_porcelain', .3, H, -.1, .045, .09, { seg: 10 }); }
  K.col(0, 0, 0, W, H, D, { surf: glass ? 'glass' : 'wood' });
}
function bed(K, o, v, rnd) {
  const dbl = v === 'double', bunk = v === 'bunk', W = dbl ? 1.6 : .9, L = 2.0, fab = FAB[o.color] || (dbl ? 'p_fab_blue' : 'p_fab_grey');
  const level = (y, frameMat, metal) => {
    if (metal) { for (const sx of [-1, 1]) K.box(frameMat, 0, y + .22, 0, W, .04, L, { skip: 'tb' }); K.box('grate', 0, y + .23, 0, W - .06, .01, L - .06); }
    else K.box(frameMat, 0, y + .12, 0, W + .06, .2, L + .04, { bev: .01 });
    K.box('p_mattress', 0, y + .27 + (metal ? -.02 : 0), 0, W - .04, .18, L - .06, { bev: .05 });
    K.push(0, y + .45, .15, 0, .02, 0); K.box(fab, 0, -.04, 0, W + .02, .06, L * .72, { bev: .025 }); K.box(fab, 0, -.24, 0, W + .04, .22, L * .72 - .02, { skip: 'tb' }); K.pop();
    for (let i = 0; i < (dbl ? 2 : 1); i++) K.blob('p_fab_white', (dbl ? (i - .5) * .7 : 0), y + .5, -L / 2 + .3, dbl ? .32 : .36, .07, .18, { seg: 8, noise: .05 });
  };
  if (bunk) {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) K.box('p_paint_grey', sx * (W / 2 + .02), 0, sz * (L / 2 + .02), .04, 1.75, .04);
    for (const yy of [0, 1.0]) for (const sz of [-1, 1]) K.box('p_paint_grey', 0, yy + .2, sz * (L / 2 + .02), W + .08, .04, .04);
    level(0, 'p_paint_grey', true); level(1.0, 'p_paint_grey', true);
    for (const sx of [-1, 1]) K.box('p_paint_grey', sx * (W / 2 + .02), 1.55, 0, .03, .03, L);
    K.col(0, 0, 0, W + .1, .55, L + .1, { surf: 'fabric' }); K.col(0, 1.0, 0, W + .1, .55, L + .1, { surf: 'fabric' });
    K.col(0, 0, -L / 2, W + .1, 1.75, .06, { surf: 'metal' }); K.col(0, 0, L / 2, W + .1, 1.75, .06, { surf: 'metal' });
    K.hide(0, 0, 0, 'under', .4);
    return;
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) K.box('p_wood_walnut', sx * (W / 2 - .02), 0, sz * (L / 2 - .02), .06, .14, .06);
  level(0, 'p_wood_walnut', false);
  K.box('p_wood_walnut', 0, 0, -L / 2 - .03, W + .1, 1.0, .06, { bev: .01 }); K.box('p_wood_walnut', 0, 0, L / 2 + .02, W + .1, .45, .04, { bev: .01 });
  K.col(0, 0, 0, W + .1, .5, L + .06, { surf: 'fabric' }); K.col(0, 0, -L / 2 - .03, W + .1, 1.0, .06, { surf: 'wood' });
}
function wardrobe(K, o, v, rnd) {
  const big = v === 'large', W = big ? 1.6 : 1.2, H = big ? 2.15 : 2.0, D = big ? .95 : .62, mat = o.mat || (big ? 'p_wood_walnut' : 'p_wood_light'), open = !!o.open || big;
  K.box(mat, 0, 0, -D / 2 + .01, W, H, .02);
  for (const s of [-1, 1]) K.box(mat, s * (W / 2 - .01), 0, 0, .02, H, D);
  K.box(mat, 0, H - .03, 0, W, .03, D, { bev: .006 }); K.box(mat, 0, 0, 0, W, .08, D);
  K.box(mat, 0, H - .06, D / 2 - .02, W + .02, .06, .04); K.box(mat, 0, 0, D / 2 - .02, W + .02, .08, .04);
  K.cylX('p_chrome', -W / 2 + .02, W / 2 - .02, H - .3, -.05, .012, { seg: 6 });
  for (let i = 0; i < (big ? 9 : 6); i++) {    // hanging clothes
    const x = -W / 2 + .15 + i * (W - .3) / (big ? 8 : 5) + (rnd() - .5) * .04, c = ['p_fab_navy', 'p_fab_grey', 'p_fab_beige', 'p_fab_red', 'p_fab_charcoal', 'p_fab_olive'][Math.floor(rnd() * 6)];
    K.box('p_plastic_dark', x, H - .38, -.05, .02, .06, .4, { rx: 0 });
    K.box(c, x, H - .4 - .7 - rnd() * .3, -.05, .05, .7 + rnd() * .3, .42, { bev: .02 });
  }
  const dw = W / 2 - .01;
  for (const s of [-1, 1]) {
    const a = open ? (big ? 1.9 : 1.6) : 0;
    K.push(s * (W / 2 - .01), .08, D / 2, s > 0 ? a : -a);   // the leaf extends toward the centre: positive yaw swings it out (+z)
    K.box(mat, -s * dw / 2, 0, .01, dw, H - .14, .02, { bev: .004 });
    K.box(mat, -s * dw / 2, .2, .025, dw - .12, H - .6, .01, { bev: .004 });
    handle(K, 'p_chrome', -s * (dw - .06), 1.0, .025, .2, { vert: true, off: .025, r: .007 });
    K.pop();
  }
  K.col(0, 0, -D / 2 + .01, W, H, .04, { surf: 'wood' });
  for (const s of [-1, 1]) K.col(s * (W / 2 - .01), 0, 0, .04, H, D, { surf: 'wood' });
  K.col(0, H - .06, 0, W, .06, D, { surf: 'wood' });
  if (!open) K.col(0, 0, D / 2 - .01, W, H, .04, { surf: 'wood' });
  else K.hide(0, .08, .02, 'closet', .45);
}

// ------------------------------------------------------------------------------------------------ kitchen, dining, bar
function kitchen(K, o, v, rnd) {
  const L = o.len || 2.4, D = .62, H = .9, n = Math.max(1, Math.round(L / .6)), mod = L / n, door = v === 'white' ? 'p_wood_white' : v === 'grey' ? 'p_paint_grey' : 'p_wood_light';
  K.box('p_plastic_dark', 0, 0, .02, L, .1, D - .1);
  K.box(door, 0, .1, -.02, L, H - .14, D - .06);
  const sinkAt = o.sink == null ? Math.floor(n / 2) : o.sink, hobAt = o.hob == null ? (n > 2 ? n - 1 : -1) : o.hob;
  for (let i = 0; i < n; i++) {
    const x = -L / 2 + (i + .5) * mod;
    if (i % 2) { for (let k = 0; k < 3; k++) { K.box(door, x, .12 + k * .25, D / 2 - .04, mod - .006, .24, .02, { bev: .003 }); handle(K, 'p_chrome', x, .32 + k * .25, D / 2 - .02, .14, { off: .02, r: .006 }); } }
    else { K.box(door, x, .12, D / 2 - .04, mod - .006, H - .2, .02, { bev: .003 }); handle(K, 'p_chrome', x + mod * .35, .7, D / 2 - .02, .12, { vert: true, off: .02, r: .006 }); }
  }
  K.box(v === 'white' ? 'marble' : 'p_concrete_precast', 0, H - .04, .01, L + .02, .04, D + .02, { bev: .004 });
  if (sinkAt >= 0 && sinkAt < n) {
    const x = -L / 2 + (sinkAt + .5) * mod;
    K.box('p_stainless', x, H - .005, .02, .5, .006, .4); K.box('p_screen', x, H - .02, .02, .44, .02, .34);
    K.tube('p_chrome', [[x, H, -.2], [x, H + .32, -.2], [x, H + .36, -.1], [x, H + .3, -.02]], .012, { seg: 6 });
  }
  if (hobAt >= 0 && hobAt < n) {
    const x = -L / 2 + (hobAt + .5) * mod;
    K.box('paint_black', x, H, .02, .56, .01, .5, { bev: .003 });
    for (const [a, b] of [[-.13, -.12], [.13, -.12], [-.13, .12], [.13, .12]]) K.ring('steel_dark', x + a, H + .012, .02 + b, .07, .006, { seg: 12 });
  }
  if (o.upper !== false) {   // wall cabinets (back at z = -D/2)
    const z = -D / 2 + .18;
    K.box(door, 0, 1.45, z, L, .7, .35, { bev: .004 });
    for (let i = 0; i < n; i++) { const x = -L / 2 + (i + .5) * mod; K.box(door, x, 1.47, z + .18, mod - .006, .66, .015, { bev: .003 }); handle(K, 'p_chrome', x + mod * .35, 1.55, z + .19, .1, { vert: true, off: .02, r: .006 }); }
    K.box('tile_white', 0, H, -D / 2 + .005, L, .55, .01);
  }
  K.col(0, 0, 0, L, H, D, { surf: 'wood' });
}
function fridge(K, o, v, rnd) {
  const mat = v === 'white' ? 'paint_white' : v === 'black' ? 'paint_black' : 'p_stainless', W = .7, H = 1.85, D = .7;
  K.box(mat, 0, .03, 0, W, H - .03, D, { bev: .02 });
  K.box('p_plastic_dark', 0, 0, .05, W - .1, .06, D - .2);
  panelLines(K, [[-W / 2 + .02, 1.2, W / 2 - .02, 1.2]], D / 2 + .001, { t: .008 });
  for (const [y, l] of [[1.45, .4], [.75, .6]]) K.tube(v === 'steel' ? 'p_chrome' : 'p_plastic_grey', [[W / 2 - .07, y - l / 2, D / 2], [W / 2 - .07, y - l / 2, D / 2 + .04], [W / 2 - .07, y + l / 2, D / 2 + .04], [W / 2 - .07, y + l / 2, D / 2]], .012, { seg: 6 });
  if (rnd() < .6) K.decal('flyer_' + Math.floor(rnd() * 2), -.12, 1.5, D / 2 + .002, .12, .16);
  K.col(0, 0, 0, W, H, D, { surf: 'metal' });
}
function stove(K, o, v, rnd) {
  const mat = v === 'white' ? 'paint_white' : 'p_stainless', W = .6, H = .9, D = .62;
  K.box(mat, 0, .05, 0, W, H - .05, D, { bev: .01 }); K.box('p_plastic_dark', 0, 0, 0, W - .04, .06, D - .06);
  K.box('p_glass_dark', 0, .2, D / 2 + .005, .46, .36, .01); K.noCast('p_glass_dark');
  K.box('p_chrome', 0, .62, D / 2 + .03, .44, .02, .02); K.box('p_chrome', -.2, .6, D / 2 + .01, .02, .03, .03); K.box('p_chrome', .2, .6, D / 2 + .01, .02, .03, .03);
  for (let i = 0; i < 5; i++) K.cylZ('p_plastic_dark', D / 2, D / 2 + .03, -.2 + i * .1, .76, .018, { seg: 8 });
  K.box('paint_black', 0, H, 0, W - .02, .01, D - .04);
  for (const [a, b] of [[-.14, -.13], [.14, -.13], [-.14, .13], [.14, .13]]) { K.cyl('steel_dark', a, H + .01, b, .07, .01, { seg: 12 }); K.box('steel_dark', a, H + .02, b, .16, .012, .02); K.box('steel_dark', a, H + .02, b, .02, .012, .16); }
  K.box(mat, 0, H, -D / 2 + .03, W, .12, .05);
  if (o.hood) { K.box(mat, 0, 1.6, -D / 2 + .25, W + .1, .14, .5, { bev: .01 }); K.box(mat, 0, 1.74, -D / 2 + .12, .3, .8, .24); }
  K.col(0, 0, 0, W, H, D, { surf: 'metal' });
}
function diningChair(K, mat, x, z, ry) {
  K.push(x, 0, z, ry);
  leg4(K, mat, .44, .44, .45, .035);
  K.box(mat, 0, .45, 0, .46, .035, .46, { bev: .008 });
  for (const s of [-1, 1]) K.box(mat, s * .2, .48, -.21, .035, .45, .035);
  K.box(mat, 0, .78, -.21, .44, .12, .025, { bev: .006 }); K.box(mat, 0, .58, -.21, .44, .05, .02);
  K.pop();
}
function diningTable(K, o, v, rnd) {
  const W = o.w || 1.6, D = .9, H = .75, mat = v === 'white' ? 'p_wood_white' : v === 'dark' ? 'p_wood_walnut' : 'p_wood_light';
  K.box(mat, 0, H - .035, 0, W, .035, D, { bev: .008 });
  K.box(mat, 0, H - .12, 0, W - .16, .085, D - .16, { skip: 'tb' });
  leg4(K, mat, W, D, H - .035, .06, { inset: .04 });
  const chairs = o.chairs == null ? (v === 'set' || o.set ? 4 : 0) : o.chairs;
  const spots = [[-W / 4, D / 2 + .25, PI], [W / 4, D / 2 + .25, PI], [-W / 4, -D / 2 - .25, 0], [W / 4, -D / 2 - .25, 0], [W / 2 + .3, 0, -PI / 2], [-W / 2 - .3, 0, PI / 2]];
  for (let i = 0; i < Math.min(chairs, 6); i++) { const [x, z, ry] = spots[i]; diningChair(K, mat, x + (rnd() - .5) * .1, z + (rnd() - .5) * .12 * Math.sign(z || 1), ry + (rnd() - .5) * .25); }
  if (rnd() < .6) { K.cyl('p_porcelain', -.2, H, .1, .12, .015, { seg: 14 }); K.cyl('glass', .3, H, -.1, .035, .14, { seg: 10 }); K.noCast('glass'); }
  K.col(0, 0, 0, W, H, D, { surf: 'wood' });
}
function chair(K, o, v, rnd) {
  if (v === 'plastic') {
    K.box('p_plastic_milky', 0, .42, 0, .46, .04, .44, { bev: .015 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) K.box('p_plastic_milky', sx * .2, 0, sz * .19, .045, .43, .045, { rx: sz * .08, rz: sx * .08 });
    K.push(0, .46, -.22, 0, -.15, 0); K.box('p_plastic_milky', 0, 0, 0, .44, .4, .03, { bev: .01 }); K.pop();
    for (const s of [-1, 1]) K.box('p_plastic_milky', s * .24, .45, -.05, .04, .2, .32, { bev: .01 });
  } else diningChair(K, v === 'dark' ? 'p_wood_walnut' : 'p_wood_light', 0, 0, 0);
  K.col(0, 0, 0, .46, .46, .46, { surf: v === 'plastic' ? 'rubber' : 'wood' });
}
function barCounter(K, o, v, rnd) {
  const L = o.len || 4, H = 1.08, D = .65;
  K.box('p_wood_walnut', 0, 0, 0, L, H - .05, D - .1);
  for (let x = -L / 2 + .3; x < L / 2; x += .6) K.box('p_wood_walnut', x, .1, D / 2 - .04, .5, H - .25, .02, { bev: .006 });
  K.box('p_leather_brown', 0, H - .2, D / 2 - .02, L, .12, .06, { bev: .03 });
  K.box('p_wood_walnut', 0, H - .05, .05, L + .1, .05, D + .12, { bev: .012 });
  K.cylX('p_chrome', -L / 2, L / 2, .2, D / 2 + .15, .025, { seg: 10 });
  for (let x = -L / 2 + .4; x < L / 2; x += 1.2) K.tube('p_chrome', [[x, .2, D / 2 + .15], [x, .12, D / 2 + .04]], .015, { seg: 6 });
  // back side: under-counter shelf with glasses
  K.box('p_stainless', 0, .7, -D / 2 + .15, L - .1, .03, .3);
  for (let i = 0; i < Math.round(L * 4); i++) K.cyl('glass', -L / 2 + .15 + i * .25, .73, -D / 2 + .15, .035, .12, { seg: 8 });
  K.noCast('glass');
  K.col(0, 0, 0, L, H, D, { surf: 'wood' });
}
function backBar(K, o, v, rnd) {
  const L = o.len || 3, H = 2.2, D = .45;
  K.box('p_wood_walnut', 0, 0, 0, L, .9, D);
  K.box('p_wood_walnut', 0, .9, -D / 2 + .02, L, H - .9, .04);
  K.box('glass', 0, 1.2, -D / 2 + .045, L - .2, .9, .005); K.noCast('glass');
  for (const y of [1.15, 1.55, 1.95]) {
    K.box('glass', 0, y, -D / 2 + .15, L - .1, .015, .24);
    for (let x = -L / 2 + .12; x < L / 2 - .1; x += .11 + rnd() * .05) {
      const c = ['p_glass_dark', 'glass', 'p_lens_amber', 'p_glass_tint', 'p_lens_red'][Math.floor(rnd() * 5)], h = .22 + rnd() * .12;
      K.lathe(c, [[.035, 0], [.036, h * .65], [.012, h * .85], [.011, h], [0, h]], { x, y: y + .015, z: -D / 2 + .15, seg: 8, sharp: 50 });
    }
  }
  K.box('emissive_warm', 0, H - .05, -D / 2 + .2, L - .2, .02, .03); K.noCast('emissive_warm');
  K.col(0, 0, 0, L, H, D, { surf: 'wood' });
}
function barStool(K, o, v, rnd) {
  K.cyl('p_chrome', 0, 0, 0, .2, .02, { seg: 14 });
  K.cyl('p_chrome', 0, .02, 0, .025, .7, { seg: 8 });
  K.ring('p_chrome', 0, .3, 0, .17, .01, { seg: 14 });
  K.lathe(v === 'wood' ? 'p_wood_walnut' : 'p_leather_black', [[.18, .72], [.19, .76], [.17, .8], [0, .81]], { seg: 16 });
  K.ccyl(0, 0, 0, .2, .8, { surf: 'metal' });
}
function booth(K, o, v, rnd) {
  const L = o.len || 1.3, fab = FAB[v] || 'p_fab_red', single = !!o.single;
  const bench = (z, ry) => {
    K.push(0, 0, z, ry);
    K.box('p_wood_walnut', 0, 0, 0, L, .42, .55);
    cushion(K, fab, 0, .42, .03, L - .04, .1, .5);
    K.box('p_wood_walnut', 0, 0, -.32, L, 1.15, .1);
    K.push(0, .52, -.24, 0, -.1, 0); cushion(K, fab, 0, 0, 0, L - .06, .55, .1); K.pop();
    for (let i = 0; i < 3; i++) K.box('p_plastic_dark', -L / 2 + (i + .5) * L / 3, .62, -.18, .006, .4, .004);
    K.pop();
  };
  bench(-.65, 0);
  if (!single) bench(.65, PI);
  K.box('p_wood_walnut', 0, .72, 0, L - .1, .04, .7, { bev: .01 });
  K.cyl('p_chrome', 0, 0, 0, .04, .72, { seg: 8 }); K.cyl('p_chrome', 0, 0, 0, .25, .02, { seg: 12 });
  K.cyl('p_chrome', -.2, .76, 0, .03, .1, { seg: 8 }); K.decal('menu_board', .25, .761, .05, .2, .15, { face: 'u' });
  K.col(0, 0, -.65, L, .5, .55, { surf: 'fabric' }); K.col(0, 0, -.97, L, 1.15, .12, { surf: 'wood' });
  if (!single) { K.col(0, 0, .65, L, .5, .55, { surf: 'fabric' }); K.col(0, 0, .97, L, 1.15, .12, { surf: 'wood' }); }
  K.col(0, .5, 0, L - .1, .26, .7, { surf: 'wood' });
}

// ------------------------------------------------------------------------------------------------ washroom
function toilet(K, x, z, ry) {
  K.push(x, 0, z, ry);
  K.lathe('p_porcelain', [[.12, 0], [.13, .1], [.17, .3], [.19, .4], [0, .4]], { seg: 16, z: .05 });
  K.box('p_porcelain', 0, .4, .06, .38, .03, .46, { bev: .012 });
  K.box('p_porcelain', 0, .38, -.22, .4, .38, .17, { bev: .02 });
  K.box('p_porcelain', 0, .76, -.22, .42, .03, .19, { bev: .008 }); K.box('p_chrome', .15, .7, -.13, .04, .02, .03);
  K.pop();
}
function toiletStall(K, o, v, rnd) {
  const n = Math.max(1, Math.min(8, o.n || 1)), W = .9, D = 1.5, H = 1.9, y0 = .15, mat = v === 'blue' ? 'p_paint_lightblue' : v === 'beige' ? 'p_paint_beige' : 'p_paint_grey';
  for (let i = 0; i <= n; i++) { const x = -n * W / 2 + i * W; K.box(mat, x, y0, -.05, .025, H - y0, D - .1); K.box('p_chrome', x, 0, D / 2 - .15, .04, y0, .04); }
  K.box(mat, 0, H - .03, D / 2 - .1, n * W + .03, .04, .04);
  for (let i = 0; i < n; i++) {
    const x = -n * W / 2 + (i + .5) * W, open = o.open == null ? (rnd() < .5 ? 1.2 : 0) : (Array.isArray(o.open) ? (o.open.includes(i) ? 1.3 : 0) : o.open);
    K.box(mat, x - W / 2 + .06, y0, D / 2 - .1, .1, H - y0, .025); K.box(mat, x + W / 2 - .06, y0, D / 2 - .1, .1, H - y0, .025);
    K.push(x + W / 2 - .11, y0, D / 2 - .1, open); K.box(mat, -(W - .22) / 2, 0, 0, W - .23, H - y0 - .1, .025, { bev: .004 }); K.box('p_chrome', -(W - .3), .8, .02, .06, .03, .02); K.pop();
    toilet(K, x, -D / 2 + .3, 0);
    K.cyl('p_chrome', x + .3, .7, -D / 2 + .55, .055, .12, { seg: 8, rz: PI / 2 });
    K.col(x - W / 2 + .06, y0, D / 2 - .1, .1, H - y0, .04, { surf: 'metal' }); K.col(x + W / 2 - .06, y0, D / 2 - .1, .1, H - y0, .04, { surf: 'metal' });
    if (!open) K.col(x, y0, D / 2 - .1, W - .2, H - y0, .04, { surf: 'metal' });
    K.col(x, 0, -D / 2 + .3, .4, .4, .6, { surf: 'tile' });
    if (open) K.hide(x, 0, .05, 'closet', .3);
  }
  for (let i = 0; i <= n; i++) K.col(-n * W / 2 + i * W, y0, -.05, .04, H - y0, D - .1, { surf: 'metal' });
}
function sink(K, o, v, rnd) {
  const n = Math.max(1, Math.min(4, o.n || 1)), L = n * .7;
  K.box('marble', 0, .82, -.05, L, .05, .55, { bev: .005 });
  K.box(v === 'wood' ? 'p_wood_walnut' : 'p_paint_grey', 0, .2, -.1, L - .05, .62, .45);
  for (let i = 0; i < n; i++) {
    const x = -L / 2 + (i + .5) * .7;
    K.lathe('p_porcelain', [[.2, .87], [.18, .83], [.12, .78], [0, .77]], { x, z: .0, seg: 16, caps: false });
    K.tube('p_chrome', [[x, .87, -.22], [x, 1.08, -.22], [x, 1.1, -.12], [x, 1.04, -.06]], .012, { seg: 6 });
    K.box('p_chrome', x + .1, .87, -.22, .03, .05, .03);
  }
  K.box('glass', 0, 1.2, -.3, L - .05, .8, .01); K.box('p_chrome', 0, 1.2, -.305, L, .82, .005);
  K.col(0, 0, -.05, L, .87, .55, { surf: 'tile' });
}

// ------------------------------------------------------------------------------------------------ lockers, hospital, servers, control
function lockers(K, o, v, rnd) {
  const n = Math.max(1, Math.min(12, o.n || 4)), w = .3, H = 1.8, D = .45, mat = { grey: 'p_paint_grey', blue: 'p_paint_lightblue', green: 'p_paint_milgreen', beige: 'p_paint_beige', red: 'p_paint_maroon' }[v] || 'p_paint_grey';
  const L = n * w, open = new Set(Array.isArray(o.open) ? o.open : []);
  K.box(mat, 0, 0, -D / 2 + .01, L, H, .02); K.box(mat, 0, H - .02, 0, L, .02, D); K.box('p_plastic_dark', 0, 0, .02, L, .08, D - .06);
  for (let i = 0; i <= n; i++) K.box(mat, -L / 2 + i * w, .08, 0, .012, H - .08, D);
  for (let i = 0; i < n; i++) {
    const x = -L / 2 + (i + .5) * w, a = open.has(i) ? 1.9 : 0;
    K.push(x + w / 2 - .01, .1, D / 2, a);
    K.box(mat, -w / 2 + .01, 0, .006, w - .012, H - .14, .012, { bev: .003 });
    for (let k = 0; k < 5; k++) K.box('p_plastic_dark', -w / 2 + .01, H - .5 + k * .05, .0125, w * .55, .012, .002);
    for (let k = 0; k < 5; k++) K.box('p_plastic_dark', -w / 2 + .01, .15 + k * .05, .0125, w * .55, .012, .002);
    K.box('p_chrome', -w + .07, .9, .018, .03, .12, .015);
    K.decal('lnum_' + ((i % 12) + 1), -w / 2 + .01, H - .3, .014, .06, .04);
    K.pop();
    if (a) { K.box(mat, x, 1.4, 0, w - .03, .01, D - .06); K.box(['p_fab_navy', 'p_fab_grey', 'p_fab_olive'][i % 3], x, .7, -.05, .2, .6, .1, { bev: .03 }); }
  }
  if (o.bench) { K.box('p_wood_light', 0, .42, D / 2 + .45, L, .04, .3, { bev: .006 }); for (const x of [-L / 2 + .2, L / 2 - .2]) K.box('p_chrome', x, 0, D / 2 + .45, .04, .42, .04); K.col(0, 0, D / 2 + .45, L, .46, .3, { surf: 'wood' }); }
  K.col(0, 0, 0, L, H, D, { surf: 'metal' });
}
function hospitalBed(K, o, v, rnd) {
  const W = .95, L = 2.1;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { K.cyl('p_chrome', sx * (W / 2 - .06), .1, sz * (L / 2 - .1), .02, .35, { seg: 8 }); K.push(sx * (W / 2 - .06), .06, sz * (L / 2 - .1)); wheel(K, 0, 0, 0, .06, { w: .03, spokes: 0, rimMat: 'p_plastic_grey' }); K.pop(); }
  K.box('paint_white', 0, .42, 0, W, .1, L - .1, { bev: .02 });
  K.box('p_mattress', 0, .52, .25, W - .1, .14, L - .7, { bev: .05 });
  K.push(0, .55, -L / 2 + .55, 0, .5, 0); K.box('p_mattress', 0, 0, -.35, W - .1, .14, .7, { bev: .05 }); K.blob('p_fab_white', 0, .18, -.5, .3, .07, .16, { seg: 8 }); K.pop();
  K.box('p_fab_blue', 0, .64, .55, W - .06, .03, L * .5, { bev: .01 });
  for (const s of [-1, 1]) { K.box('p_plastic_grey', s * (W / 2 + .02), .6, .3, .03, .25, .9, { bev: .01 }); K.box('p_plastic_dark', s * (W / 2 + .035), .62, .3, .01, .12, .3); }
  K.box('p_plastic_grey', 0, .42, -L / 2 + .04, W, .6, .06, { bev: .02 }); K.box('p_plastic_grey', 0, .42, L / 2 - .04, W, .4, .06, { bev: .02 });
  // IV pole
  K.cyl('p_chrome', W / 2 + .2, 0, -L / 2 + .3, .015, 1.9, { seg: 6 }); K.cyl('p_plastic_grey', W / 2 + .2, 0, -L / 2 + .3, .22, .03, { seg: 5 });
  K.box('p_plastic_milky', W / 2 + .2, 1.62, -L / 2 + .3, .1, .2, .05, { bev: .02 }); K.tube('p_plastic_milky', [[W / 2 + .2, 1.62, -L / 2 + .3], [W / 2 + .1, 1.1, -L / 2 + .5], [W / 2 - .1, .7, -L / 2 + .7]], .004, { seg: 3 });
  if (o.monitor !== false) { K.cyl('p_chrome', -W / 2 - .25, 0, -L / 2 + .2, .02, 1.25, { seg: 6 }); K.box('p_plastic_grey', -W / 2 - .25, 1.25, -L / 2 + .2, .32, .26, .1, { bev: .015, ry: .5 }); K.decal('scr_hosp', -W / 2 - .25 + Math.sin(.5) * .052, 1.38, -L / 2 + .2 + Math.cos(.5) * .052, .26, .18, { glow: true, ry: .5 }); }
  K.col(0, 0, 0, W + .1, .68, L, { surf: 'metal' });
}
function gurney(K, o, v, rnd) {
  const W = .6, L = 1.95;
  K.box('p_alu', 0, .82, 0, W, .05, L, { bev: .01 });
  K.box('p_mattress', 0, .87, 0, W - .04, .07, L - .1, { bev: .03 });
  for (const sz of [-1, 1]) for (const a of [-1, 1]) { K.push(0, .44, sz * .55, 0, a * .55, 0); K.box('p_alu', -W / 2 + .03, -.42, 0, .03, .84, .03); K.box('p_alu', W / 2 - .03, -.42, 0, .03, .84, .03); K.pop(); }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { K.push(sx * (W / 2 - .05), .06, sz * (L / 2 - .25)); wheel(K, 0, 0, 0, .06, { w: .03, spokes: 0, rimMat: 'p_plastic_grey' }); K.pop(); }
  for (const s of [-1, 1]) K.cylZ('p_alu', -L / 2 + .2, L / 2 - .2, s * (W / 2 + .02), .98, .012, { seg: 6 });
  K.box('p_fab_white', .05, .94, .3, W - .08, .02, .9, { bev: .008 });
  K.col(0, 0, 0, W, .94, L, { surf: 'metal' });
}
function medCart(K, o, v, rnd) {
  const mat = v === 'blue' ? 'p_plastic_blue' : 'p_plastic_red', W = .75, D = .5, H = 1.0;
  K.box(mat, 0, .12, 0, W, H - .12, D, { bev: .02 });
  for (let i = 0; i < 5; i++) { K.box(mat, 0, .18 + i * .15, D / 2 + .005, W - .08, .13, .012, { bev: .004 }); K.box('p_plastic_grey', 0, .26 + i * .15, D / 2 + .016, .3, .02, .015); }
  K.box('p_plastic_grey', 0, H, 0, W + .06, .03, D + .06, { bev: .01 });
  K.tube('p_chrome', [[-W / 2 - .02, H - .1, -D / 2 + .1], [-W / 2 - .08, H - .1, -D / 2 + .1], [-W / 2 - .08, H - .1, D / 2 - .1], [-W / 2 - .02, H - .1, D / 2 - .1]], .012, { seg: 6 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { K.push(sx * (W / 2 - .07), .06, sz * (D / 2 - .07)); wheel(K, 0, 0, 0, .06, { w: .03, spokes: 0, rimMat: 'p_plastic_grey' }); K.pop(); }
  K.box('p_plastic_dark', .2, H + .03, 0, .25, .15, .2, { bev: .02 }); K.decal('sign_firstaid', -.25, H - .2, -D / 2 - .002, .12, .12, { face: 's' });
  K.col(0, 0, 0, W, H, D, { surf: 'rubber' });
}
function serverRack(K, o, v, rnd) {
  const n = Math.max(1, Math.min(10, o.n || 1)), W = .6, H = 2.0, D = 1.07, on = o.on !== false;
  for (let i = 0; i < n; i++) {
    const x = -n * W / 2 + (i + .5) * W;
    K.box('paint_black', x, 0, 0, W - .005, H, D, { bev: .006 });
    K.box('p_screen', x, .08, D / 2 - .03, W - .08, H - .2, .01);
    for (let y = .15; y < H - .2; y += .045 * (1 + Math.floor(rnd() * 3))) {
      if (rnd() < .15) continue;
      const u = .044 * (1 + Math.floor(rnd() * 2));
      K.box('p_paint_darkgrey', x, y, D / 2 - .06, W - .1, u - .004, .04);
      if (on) K.decal('server_leds', x - .1, y + u / 2, D / 2 - .038, .3, u * .7, { glow: true });
    }
    K.box('grate', x, .05, D / 2 + .005, W - .04, H - .1, .01);
    K.box('p_chrome', x + W / 2 - .06, .9, D / 2 + .02, .02, .3, .02);
    K.noCast('grate');
  }
  K.col(0, 0, 0, n * W, H, D, { surf: 'metal' });
}
function controlConsole(K, o, v, rnd) {
  const L = o.len || 2.4, n = Math.max(1, Math.round(L / .8)), on = o.on !== false;
  K.box('p_paint_grey', 0, 0, 0, L, .72, .8, { bev: .01 });
  K.box('p_plastic_dark', 0, .72, .1, L + .04, .04, .7, { bev: .008 });
  K.push(0, .76, -.18, 0, -.55, 0); K.box('p_paint_grey', 0, 0, 0, L, .45, .06, { bev: .01 }); K.decal('console_panel', 0, .22, .031, L - .1, .4, { glow: on }); K.pop();
  for (let i = 0; i < n; i++) {
    const x = -L / 2 + (i + .5) * L / n;
    K.push(x, 1.05, -.32, 0, -.1, 0); K.box('p_plastic_dark', 0, 0, 0, .62, .4, .05, { bev: .01 }); K.decal(['scr_cctv', 'scr_graph', 'scr_map', 'scr_code'][(i + Math.floor(rnd() * 4)) % 4], 0, .2, .026, .58, .36, { glow: on }); K.pop();
    K.box('p_plastic_dark', x, .76, .2, .45, .02, .15, { bev: .004 }); K.decal('keyboard', x, .781, .2, .43, .14, { face: 'u' });
  }
  K.col(0, 0, 0, L, .78, .8, { surf: 'metal' }); K.col(0, .78, -.3, L, .7, .25, { surf: 'metal' });
}

// ------------------------------------------------------------------------------------------------ fixtures and wall items
function lightFixture(K, o, v, rnd) {
  // y = the CEILING height (the fixture hangs below it), or the wall mount point for 'wall' / 'flood'
  const on = o.on !== false, warm = o.warm, lit = on ? (warm ? 'emissive_warm' : 'emissive_white') : 'p_lens_clear', col = o.color || (warm ? [1, .82, .6] : [.95, .97, 1]);
  K.noCast(lit);
  const L = (spec) => { if (o.light) K.light(Object.assign({ fixture: false, color: col, intensity: o.intensity || spec.intensity }, spec)); };
  if (v === 'troffer') { K.box('paint_white', 0, -.04, 0, .62, .04, .62); K.box(lit, 0, -.045, 0, .56, .01, .56); L({ type: 'spot', x: 0, y: -.06, z: 0, dir: [0, -1, 0], angle: 2.4, intensity: 10 }); return; }
  if (v === 'strip') { K.box('paint_white', 0, -.06, 0, 1.25, .05, .1, { bev: .01 }); K.box(lit, 0, -.075, 0, 1.18, .02, .07, { bev: .008 }); L({ type: 'spot', x: 0, y: -.09, z: 0, dir: [0, -1, 0], angle: 2.4, intensity: 9 }); return; }
  if (v === 'highbay') {
    const drop = o.drop || .5;
    K.cyl('steel_dark', 0, -drop, 0, .01, drop, { seg: 4 });
    K.lathe('steel_dark', [[.08, -drop], [.12, -drop - .08], [.22, -drop - .12]], { seg: 14, caps: false });
    K.lathe('p_alu', [[.22, -drop - .12], [.25, -drop - .3]], { seg: 14, caps: false }); K.cyl(lit, 0, -drop - .28, 0, .24, .01, { seg: 14 });
    L({ type: 'spot', x: 0, y: -drop - .3, z: 0, dir: [0, -1, 0], angle: 1.6, intensity: 40 });
    return;
  }
  if (v === 'pendant' || v === 'bulb') {
    const drop = o.drop || .8;
    K.cyl('paint_black', 0, -drop, 0, .005, drop, { seg: 4 }); K.cyl('paint_black', 0, -.03, 0, .04, .03, { seg: 8 });
    if (v === 'pendant') { K.lathe('paint_black', [[.02, -drop], [.06, -drop - .05], [.18, -drop - .2], [.2, -drop - .22]], { seg: 14, caps: false }); K.lathe('p_paint_cream', [[.195, -drop - .215], [.175, -drop - .195], [.06, -drop - .05]], { seg: 14, caps: false }); K.blob(lit, 0, -drop - .14, 0, .05, .06, .05, { seg: 8 }); }
    else { K.blob(lit, 0, -drop - .06, 0, .05, .07, .05, { seg: 8 }); for (let i = 0; i < 4; i++) { K.push(0, -drop, 0, i * PI / 4); K.tube('steel_dark', [[0, 0, 0], [.07, -.05, 0], [.07, -.12, 0], [0, -.15, 0]], .003, { seg: 3 }); K.pop(); } }
    L({ type: 'point', x: 0, y: -drop - .15, z: 0, intensity: 6 });
    return;
  }
  if (v === 'flood') {   // wall floodlight at y, facing +z and down
    K.box('steel_dark', 0, -.05, .02, .08, .1, .04);
    K.push(0, 0, .12, 0, .5, 0); K.box('p_paint_darkgrey', 0, -.12, 0, .3, .24, .1, { bev: .01 }); K.box(lit, 0, -.1, .052, .26, .2, .005); K.pop();
    L({ type: 'spot', x: 0, y: -.05, z: .2, dir: [0, -.55, 1], angle: 1.2, intensity: 50 });
    return;
  }
  // wall bulkhead
  K.box('p_paint_darkgrey', 0, -.1, .04, .26, .2, .08, { bev: .02 }); K.box(lit, 0, -.08, .08, .2, .14, .02, { bev: .01 });
  for (let i = 0; i < 3; i++) K.box('p_paint_darkgrey', 0, -.07 + i * .04, .095, .22, .01, .01);
  L({ type: 'point', x: 0, y: -.02, z: .2, intensity: 4 });
}
function door(K, o, v, rnd) {
  // origin = centre of the doorway at floor level, door plane at z = 0, hinge at -x, opens toward +z by `open` degrees
  const W = o.w || (v === 'double' ? 1.6 : .9), H = o.h || 2.1, a = (o.open || 0) * PI / 180, frame = o.frame !== false;
  const mat = { wood: 'p_wood_walnut', white: 'p_wood_white', metal: 'p_paint_grey', glass: 'p_alu', double: 'p_wood_walnut', steel: 'p_stainless' }[v] || 'p_wood_walnut';
  if (frame) { const fm = v === 'metal' || v === 'glass' || v === 'steel' ? 'p_paint_darkgrey' : 'p_wood_walnut'; for (const s of [-1, 1]) K.box(fm, s * (W / 2 + .03), 0, 0, .06, H + .03, .22); K.box(fm, 0, H, 0, W + .12, .06, .22); }
  const leaf = (hx, s, lw) => {
    K.push(hx, 0, 0, s > 0 ? -a : a);
    const x0 = s > 0 ? lw / 2 : -lw / 2;
    if (v === 'glass') { K.box('p_alu', x0, 0, 0, lw, .1, .045); K.box('p_alu', x0, H - .12, 0, lw, .1, .045); K.box('p_alu', x0 - lw / 2 + .04, 0, 0, .08, H - .02, .045); K.box('p_alu', x0 + lw / 2 - .04, 0, 0, .08, H - .02, .045); K.box('glass', x0, .1, 0, lw - .16, H - .22, .012); K.noCast('glass'); K.box('p_chrome', x0 + (s > 0 ? lw / 2 - .15 : -lw / 2 + .15), .9, .04, .03, .5, .03); }
    else {
      K.box(mat, x0, 0, 0, lw - .01, H - .01, .045, { bev: .004 });
      if (v === 'wood' || v === 'white' || v === 'double') { for (const [y, h] of [[.15, .85], [1.15, .8]]) K.box(mat, x0, y, .024, lw - .2, h, .006, { bev: .004 }); }
      else K.box('p_glass_tint', x0, 1.4, .02, lw * .35, .4, .01);
      const hx2 = x0 + (s > 0 ? lw / 2 - .08 : -lw / 2 + .08);
      K.box('p_chrome', hx2, .98, .03, .05, .14, .012); K.box('p_chrome', hx2 + (s > 0 ? -.05 : .05), 1.02, .06, .12, .02, .02);
      K.box('p_chrome', hx2, .98, -.03, .05, .14, .012);
    }
    K.pop();
    const c = Math.cos(a), sn = Math.sin(a), dir = s > 0 ? 1 : -1;
    K.col(hx + dir * c * lw / 2, 0, sn * lw / 2, lw, H, .06, { ry: s > 0 ? -a : a, surf: v === 'glass' ? 'glass' : v === 'metal' || v === 'steel' ? 'metal' : 'wood' });
  };
  if (v === 'double') { leaf(-W / 2, 1, W / 2); leaf(W / 2, -1, W / 2); }
  else leaf(-W / 2, 1, W);
}
function windowProp(K, o, v, rnd) {
  // fits a wall opening: origin = centre of the opening at the SILL (bottom), w x h, wall thickness t
  const W = o.w || 1.2, H = o.h || 1.2, t = o.t || .2, ind = v === 'industrial', fm = ind ? 'steel_dark' : v === 'wood' ? 'p_wood_white' : 'p_alu';
  K.box(fm, 0, 0, 0, W, .05, t); K.box(fm, 0, H - .05, 0, W, .05, t);
  K.box(fm, -W / 2 + .025, 0, 0, .05, H, t); K.box(fm, W / 2 - .025, 0, 0, .05, H, t);
  K.box('glass', 0, .05, 0, W - .1, H - .1, .01); K.noCast('glass');
  if (ind) { for (let i = 1; i < 4; i++) K.box(fm, -W / 2 + i * W / 4, .05, 0, .02, H - .1, .03); for (let j = 1; j < 4; j++) K.box(fm, 0, j * H / 4, 0, W - .1, .02, .03); }
  else { K.box(fm, 0, H / 2 - .02, 0, W - .1, .04, .05); if (v === 'wood') K.box(fm, 0, .05, 0, .04, H - .1, .05); }
  K.box(v === 'wood' ? 'p_wood_white' : 'marble', 0, -.03, t / 2 + .02, W + .1, .03, .12);
  K.col(0, 0, 0, W, H, .06, { surf: 'glass' });
}
function curtain(K, o, v, rnd) {
  const W = o.w || 1.6, H = o.h || 2.2, open = o.open == null ? .5 : o.open, fab = FAB[v] || 'p_fab_red';
  K.cylX('p_chrome', -W / 2 - .1, W / 2 + .1, H, .08, .012, { seg: 6 });
  for (const s of [-1, 1]) {
    const w = W / 2 * (1 - open * .75), x0 = s * W / 2, x1 = s * (W / 2 - w), n = Math.max(6, Math.round(w / .07));
    const pts = []; for (let i = 0; i <= n * 2; i++) { const f = i / (n * 2); pts.push([x0 + (x1 - x0) * f, .09 + Math.sin(f * n * PI) * .045 * (1 + open)]); }
    const poly = pts.concat(pts.slice().reverse().map(p => [p[0], p[1] - .012]));
    K.extY(fab, poly, .02, H - .02, { caps: true, smooth: 60 });
  }
}
function rug(K, o, v, rnd) {
  const W = o.w || 1.6, D = o.d || 2.4, i = { blue: 0, red: 1, green: 2 }[v] ?? 0;
  K.box('carpet', 0, 0, 0, W, .008, D);
  K.decal('rug_' + i, 0, .0085, 0, W - .01, D - .01, { face: 'u' });
}
function poster(K, o, v, rnd) {
  const i = o.i == null ? Math.floor(rnd() * 6) : o.i % 6, flyer = v === 'flyer';
  if (flyer) { K.decal('flyer_' + (i % 2), 0, .3, .002, .21, .29); return; }
  K.box('paint_white', 0, 0, .002, .62, .92, .002); K.decal('poster_' + i, 0, .46, .0045, .6, .9);
}
function wallClock(K, o, v, rnd) {
  K.push(0, 0, 0, 0, PI / 2, 0);
  K.lathe(v === 'chrome' ? 'p_chrome' : 'p_plastic_dark', [[0, 0], [.17, 0], [.17, .045], [.155, .05]], { seg: 24, caps: false });
  K.pop();
  K.decal('clock', 0, 0, .04, .31, .31);
  K.box('glass', 0, -.155, .046, .31, .31, .002); K.noCast('glass');
}
function extinguisher(K, o, v, rnd) {
  const wall = v !== 'floor';
  const y0 = wall ? .9 : 0, z = wall ? .1 : 0;
  if (wall) { K.box('steel_dark', 0, y0 + .2, .02, .08, .3, .04); K.decal('sign_fire', 0, y0 + .82, .002, .2, .2); }
  else { K.box('paint_red', 0, 0, 0, .3, .05, .3, { bev: .01 }); }
  K.lathe('paint_red', [[.075, 0], [.08, .02], [.08, .48], [.06, .54], [.025, .57], [0, .58]], { x: 0, y: y0 + (wall ? 0 : .05), z, seg: 14 });
  K.decal('gas_label', 0, y0 + .3 + (wall ? 0 : .05), z + .081, .1, .04);
  K.box('paint_black', 0, y0 + .58 + (wall ? 0 : .05), z, .06, .05, .04); K.box('paint_black', .02, y0 + .63 + (wall ? 0 : .05), z, .12, .015, .03);
  K.tube('paint_black', [[-.03, y0 + .58, z], [-.08, y0 + .5, z + .02], [-.09, y0 + .2, z + .03], [-.07, y0 + .1, z + .03]], .008, { seg: 4 });
}
function tv(K, o, v, rnd) {
  const W = v === 'big' ? 1.45 : 1.1, H = W * .57, on = !!o.on;
  if (o.wall) { K.box('p_plastic_dark', 0, 0, .02, W, H, .05, { bev: .005 }); K.decal(on ? 'scr_map' : 'keyboard', 0, H / 2, .046, W - .03, H - .03, { glow: on }); if (!on) K.box('p_screen', 0, .015, .046, W - .03, H - .03, .002); return; }
  K.box('p_wood_walnut', 0, 0, 0, W + .3, .5, .42, { bev: .01 });
  for (const s of [-1, 1]) K.box('p_wood_walnut', s * (W + .3) / 4, .05, .211, (W + .3) / 2 - .03, .4, .006);
  K.box('p_plastic_dark', 0, .5, -.05, .3, .015, .2); K.box('p_plastic_dark', 0, .515, -.06, .05, .12, .03);
  K.box('p_plastic_dark', 0, .6, -.05, W, H, .05, { bev: .005 });
  K.decal(on ? 'scr_map' : 'keyboard', 0, .6 + H / 2, -.024, W - .03, H - .03, { glow: on });
  if (!on) K.box('p_screen', 0, .615, -.024, W - .03, H - .03, .002);
  K.col(0, 0, 0, W + .3, .5, .42, { surf: 'wood' });
}
function whiteboard(K, o, v, rnd) {
  const W = o.w || 1.8;
  K.box('p_alu', 0, 0, .01, W, 1.2, .02, { bev: .006 }); K.box('paint_white', 0, .03, .021, W - .06, 1.14, .002);
  K.box('p_alu', 0, -.02, .05, W * .6, .02, .08);
  for (let i = 0; i < 6; i++) K.box(['p_car_blue', 'paint_black', 'paint_red'][i % 3], -W * .2 + rnd() * W * .4, .2 + rnd() * .8, .023, .1 + rnd() * .5, .008, .001, { rz: (rnd() - .5) * .3 });
  K.decal('scr_map', W * .25, .7, .023, .4, .25);
}

export default [
  { type: 'desk', cat: 'interior', size: [1.6, .75, .8], keys: ['w', 'items'], desc: 'office desk (steel frame + pedestal), executive walnut desk, or a grey steel desk (front = the user side, +z)',
    variants: ['office', 'exec', 'metal'], opts: { w: 'width', items: 'false = clear top' }, build: desk },
  { type: 'office_chair', cat: 'interior', size: [.6, 1.05, .6], desc: 'swivel office chair (faces +z)', variants: ['charcoal', 'blue', 'grey', 'red', 'leather'], build: officeChair },
  { type: 'monitor', cat: 'interior', size: [.56, .46, .35], vary: true, keys: ['on', 'keyboard'], desc: '24" monitor + keyboard + mouse (place on a desk top, y = .75)', opts: { on: 'false = screen off', keyboard: 'false = monitor only' }, build: monitor },
  { type: 'workstation', cat: 'interior', size: [1.6, 1.1, 1.5], vary: true, keys: ['on'], desc: 'desk + monitor(s) + keyboard + chair + clutter', variants: ['single', 'dual'], opts: { on: 'false = screens off' }, build: workstation },
  { type: 'cubicle', cat: 'interior', size: [1.8, 1.5, 1.8], vary: true, keys: ['w', 'd', 'on'], desc: 'office cubicle: fabric partitions (open toward +z), L-desk, monitor, chair', variants: ['grey', 'blue', 'beige'],
    opts: { w: 'width (1.8)', d: 'depth (1.8)' }, build: cubicle },
  { type: 'filing_cabinet', cat: 'interior', size: [.47, 1.32, .62], keys: ['color', 'open'], desc: '4- or 2-drawer filing cabinet', variants: ['4', '2'], opts: { color: "'grey' | 'beige' | 'black'", open: 'index of an open drawer' },
    sizeOf: (o, v) => [.47, v === '2' ? .72 : 1.32, .62], build: filingCabinet },
  { type: 'bookshelf', cat: 'interior', size: [.9, 2.0, .32], vary: true, keys: ['w', 'empty'], desc: 'bookshelf filled with books (printed spines)', variants: ['walnut', 'white', 'metal'], opts: { w: 'width (.9)', empty: 'no books' }, build: bookshelf },
  { type: 'sofa', cat: 'interior', size: [2.25, .85, .9], keys: ['seats'], desc: 'upholstered sofa (cushions, arms; faces +z)', variants: Object.keys(FAB), opts: { seats: '1-4 (3)' },
    sizeOf: o => [.65 * (o.seats || 3) + .3, .85, .9], build: sofa },
  { type: 'armchair', cat: 'interior', size: [.95, .85, .9], desc: 'upholstered armchair', variants: Object.keys(FAB), build: armchair },
  { type: 'coffee_table', cat: 'interior', size: [1.2, .45, .6], vary: true, desc: 'coffee table (wood with shelf, or glass + chrome)', variants: ['wood', 'glass'], build: coffeeTable },
  { type: 'bed', cat: 'interior', size: [.95, 1.0, 2.1], keys: ['color'], desc: 'single / double bed (headboard at -z) or metal bunk beds (hide under)', variants: ['single', 'double', 'bunk'], opts: { color: 'bedding colour (grey, blue, red...)' },
    sizeOf: (o, v) => [v === 'double' ? 1.7 : 1.0, v === 'bunk' ? 1.75 : 1.0, 2.1], build: bed },
  { type: 'wardrobe', alias: ['closet'], cat: 'interior', size: [1.2, 2.0, .62], vary: true, keys: ['open', 'mat'], desc: "wardrobe with clothes; 'large' = walk-in deep wardrobe, doors open (hide 'closet' inside)",
    variants: ['standard', 'large'], opts: { open: 'doors open', mat: 'material name' }, sizeOf: (o, v) => v === 'large' ? [1.6, 2.15, .95] : [1.2, 2.0, .62], build: wardrobe },
  { type: 'kitchen_counter', cat: 'interior', size: [2.4, 2.15, .62], keys: ['len', 'sink', 'hob', 'upper'], desc: 'kitchen run: base cabinets, worktop, sink + tap, hob, wall cabinets + tile splashback (back at -z)',
    variants: ['wood', 'white', 'grey'], opts: { len: 'length (2.4)', sink: 'module index (-1 none)', hob: 'module index (-1 none)', upper: 'false = no wall cabinets' }, sizeOf: o => [o.len || 2.4, o.upper === false ? .9 : 2.15, .62], build: kitchen },
  { type: 'fridge', cat: 'interior', size: [.7, 1.85, .7], vary: true, desc: 'two-door fridge', variants: ['steel', 'white', 'black'], build: fridge },
  { type: 'stove', cat: 'interior', size: [.6, .9, .62], keys: ['hood'], desc: 'range cooker with oven window and burners; hood = extractor above', variants: ['steel', 'white'], opts: { hood: 'extractor hood' }, build: stove },
  { type: 'dining_table', cat: 'interior', size: [1.6, .75, .9], vary: true, keys: ['w', 'chairs', 'set'], desc: 'dining table; chairs = 0-6 dining chairs pulled round it', variants: ['oak', 'dark', 'white', 'set'],
    opts: { w: 'length (1.6)', chairs: 'chair count' }, sizeOf: (o, v) => (o.chairs || v === 'set') ? [(o.w || 1.6) + .9, .9, 1.9] : [o.w || 1.6, .75, .9], build: diningTable },
  { type: 'chair', cat: 'interior', size: [.46, .9, .46], desc: 'dining chair or white plastic chair', variants: ['oak', 'dark', 'plastic'], build: chair },
  { type: 'bar_counter', cat: 'interior', size: [4, 1.1, .65], keys: ['len'], desc: 'bar counter with padded edge, brass foot rail and glasses on the back shelf (customers on +z)', opts: { len: 'length (4)' }, build: barCounter },
  { type: 'back_bar', cat: 'interior', size: [3, 2.2, .45], vary: true, keys: ['len'], desc: 'back bar: cabinets, mirror, glass shelves of bottles, LED strip', opts: { len: 'length (3)' }, build: backBar },
  { type: 'bar_stool', cat: 'interior', size: [.4, .81, .4], desc: 'chrome bar stool', variants: ['leather', 'wood'], build: barStool },
  { type: 'booth', cat: 'interior', size: [1.3, 1.15, 2.05], keys: ['len', 'single'], desc: 'diner booth: two padded benches facing a table (benches at -z and +z)', variants: Object.keys(FAB), opts: { len: 'width (1.3)', single: 'one bench (against a wall)' }, build: booth },
  { type: 'toilet_stall', cat: 'interior', size: [.9, 1.9, 1.5], vary: true, keys: ['n', 'open'], desc: 'row of n toilet stalls (doors on +z, open angle random or given), toilet + paper inside', variants: ['grey', 'blue', 'beige'],
    opts: { n: 'stalls (1-8)', open: 'radians for all, or an array of open stall indices' }, sizeOf: o => [(o.n || 1) * .9, 1.9, 1.5], build: toiletStall },
  { type: 'sink', cat: 'interior', size: [.7, 2.0, .6], keys: ['n'], desc: 'vanity with n basins, taps and a mirror (back at -z)', variants: ['grey', 'wood'], opts: { n: 'basins (1-4)' }, sizeOf: o => [(o.n || 1) * .7, 2.0, .6], build: sink },
  { type: 'lockers', cat: 'interior', size: [1.2, 1.8, .45], keys: ['n', 'open', 'bench'], desc: 'bank of steel lockers with vents and numbers (doors +z); open = indices ajar; bench = changing bench in front',
    variants: ['grey', 'blue', 'green', 'beige', 'red'], opts: { n: 'lockers (4)', open: 'array of open door indices', bench: 'add a bench' }, sizeOf: o => [(o.n || 4) * .3, 1.8, o.bench ? 1.3 : .45], build: lockers },
  { type: 'hospital_bed', cat: 'interior', size: [1.45, 1.9, 2.1], keys: ['monitor'], desc: 'hospital bed: raised back, side rails, castors, IV pole, patient monitor', opts: { monitor: 'false = no monitor' }, build: hospitalBed },
  { type: 'gurney', cat: 'interior', size: [.65, .95, 1.95], desc: 'ambulance stretcher on a folding frame', build: gurney },
  { type: 'medical_cart', cat: 'interior', size: [.85, 1.18, .55], desc: 'crash cart with drawers', variants: ['red', 'blue'], build: medCart },
  { type: 'server_rack', cat: 'interior', size: [.6, 2.0, 1.07], vary: true, keys: ['n', 'on'], desc: 'row of n 42U racks (mesh doors, blinking LEDs)', opts: { n: 'racks (1-10)', on: 'false = LEDs off' }, sizeOf: o => [(o.n || 1) * .6, 2.0, 1.07], build: serverRack },
  { type: 'control_console', cat: 'interior', size: [2.4, 1.5, .8], vary: true, keys: ['len', 'on'], desc: 'control desk with a sloped button panel and screens (operator on +z)', opts: { len: 'length (2.4)' }, build: controlConsole },
  { type: 'light_fixture', cat: 'interior', size: [.6, .1, .6], keys: ['on', 'warm', 'light', 'intensity', 'drop', 'color'], desc: "ceiling / wall light: y = CEILING height ('wall', 'flood': mount point); light = also a B.light",
    variants: ['troffer', 'strip', 'highbay', 'pendant', 'bulb', 'flood', 'wall'], opts: { on: 'false = off', warm: 'warm white', light: 'add a real light', intensity: 'override', drop: 'hang length (pendant / bulb / highbay)', color: '[r, g, b]' },
    sizeOf: (o, v) => v === 'strip' ? [1.25, .1, .1] : v === 'highbay' ? [.5, (o.drop || .5) + .3, .5] : v === 'pendant' || v === 'bulb' ? [.4, (o.drop || .8) + .25, .4] : [.6, .2, .3], build: lightFixture },
  { type: 'door', cat: 'interior', size: [1.02, 2.16, .22], keys: ['w', 'h', 'open', 'frame'], desc: 'door in a frame (put it in a wall opening built with frame: false); hinge at -x, opens toward +z',
    variants: ['wood', 'white', 'metal', 'steel', 'glass', 'double'], opts: { w: 'leaf width (.9; double 1.6)', h: 'height (2.1)', open: 'degrees (0 closed .. 110)', frame: 'false = leaf only' }, build: door },
  { type: 'window', cat: 'interior', size: [1.2, 1.2, .2], keys: ['w', 'h', 't'], desc: 'window for a wall opening: frame, glass (glass collider), mullions, sill; origin = centre of the opening at the sill',
    variants: ['modern', 'wood', 'industrial'], opts: { w: 'width', h: 'height', t: 'wall thickness (.2)' }, build: windowProp },
  { type: 'curtain', cat: 'interior', size: [1.6, 2.2, .15], keys: ['w', 'h', 'open'], desc: 'pleated curtains on a rod (hang in front of a window; back at z = 0)', variants: Object.keys(FAB), opts: { w: 'width', h: 'rod height', open: '0 closed .. 1 open' }, build: curtain },
  { type: 'rug', cat: 'interior', size: [1.6, .01, 2.4], keys: ['w', 'd'], desc: 'patterned rug (flat, no collider)', variants: ['blue', 'red', 'green'], opts: { w: 'width', d: 'length' }, build: rug },
  { type: 'poster', cat: 'interior', size: [.62, .92, .01], vary: true, keys: ['i'], desc: 'wall poster (6 original designs) or a small flyer; y = bottom edge, back at z = 0', variants: ['poster', 'flyer'], opts: { i: 'design index' }, build: poster },
  { type: 'wall_clock', alias: ['clock'], cat: 'interior', size: [.34, .34, .05], desc: 'wall clock (y = its centre, back at z = 0)', variants: ['black', 'chrome'], build: wallClock },
  { type: 'fire_extinguisher', cat: 'interior', size: [.2, 1.0, .2], desc: 'fire extinguisher on a wall bracket with a sign (y = floor), or standing on the floor', variants: ['wall', 'floor'], build: extinguisher },
  { type: 'tv', cat: 'interior', size: [1.4, 1.2, .42], keys: ['on', 'wall'], desc: 'flat TV on a media cabinet, or wall-mounted', variants: ['normal', 'big'], opts: { on: 'screen on', wall: 'wall-mounted (y = bottom of the screen)' }, build: tv },
  { type: 'whiteboard', cat: 'interior', size: [1.8, 1.2, .1], vary: true, keys: ['w'], desc: 'wall whiteboard with scribbles (y = bottom edge)', opts: { w: 'width' }, build: whiteboard },
];
