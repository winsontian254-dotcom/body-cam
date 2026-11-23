/* LIVE FIRE — Starlite Motel (motel): a two-storey 1960s roadside motel on a desert highway at night. Original location.
   Plan (x east, z north, metres; lot y 0, building floors y .15, upper floor y 3.1, roofs 6.2):
     T1 lobby  = Greyline coach stop waiting room across the highway (x 22..46, z -88..-76), bus bay in front.
     Highway   = z -64..-50, closed to the west (ROAD CLOSED barricade) and east (jackknifed semi).
     SITE A    = the Starlite Diner (x -60..-36, z -22..0): booths, counter, kitchen; gas canopy in front of it.
     MID       = the drained pool in its fenced courtyard (deck x -24..8, z -16..8; basin x -18..2, z -8..0, deep end west).
     North wing (x -26..30, z 22..32; breezeway x -6..-2) and east wing (x 32..42, z -26..14): rooms off an exterior walkway
                 under the upper balcony; stairs at the west gable, in front of the north wing (mid stair), at the east wing's
                 south gable and from the alley to the corner balcony (x 30..32).
     SITE B    = upstairs in the office block (x 32..46, z 14..34): room 225 + the manager's flat; reached from the corner
                 balcony doors and the office's interior stair.
     T2 lobby  = the motel laundry (x -12..4, z 44..54) on the service alley (z 32..44) behind the north wing.
     West yard = x -62..-28, z 0..44: the diner's delivery truck, junk pickup, dry grass.
   Out of bounds: the desert, mesas, the highway running on, a far town, power lines, a billboard.
   Prefabs and painters: js/maps/kit_motel.js. Design notes: tools/test/out/notes-map-motel.md (git-ignored). */
import { mo, decal, paint, rail, wallLamp, finish, rng } from '../kit_motel.js';

const PI = Math.PI, H = PI / 2;
const Y1 = 3.1;                     // upper floor (walkway balcony and rooms)
const GF = .15;                     // ground floor slab top in buildings
const WHT = [.92, .92, .86], YEL = [.95, .72, .12];

// ------------------------------------------------------------------------------------------------ ground
/** ground of non-overlapping slabs (top y 0) on a 1 m grid: regions [[x0, z0, x1, z1, mat]] (first match wins, 'none' = hole) */
function pave(B, regions, R, deflt) {
  const nx = R.x1 - R.x0, nz = R.z1 - R.z0, grid = new Array(nx * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const x = R.x0 + i + .5, z = R.z0 + j + .5;
    let m = deflt;
    for (const r of regions) if (x > r[0] && x < r[2] && z > r[1] && z < r[3]) { m = r[4]; break; }
    grid[j * nx + i] = m;
  }
  // row runs, then merge identical runs of consecutive rows into rectangles
  let open = new Map();
  const out = [];
  for (let j = 0; j <= nz; j++) {
    const runs = new Map();
    if (j < nz) for (let i = 0; i < nx;) { const m = grid[j * nx + i]; let k = i; while (k < nx && grid[j * nx + k] === m) k++; runs.set(i + ':' + k + ':' + m, { i0: i, i1: k, m }); i = k; }
    const next = new Map();
    for (const [key, r] of runs) { const o = open.get(key); if (o) { o.j1 = j + 1; next.set(key, o); open.delete(key); } else next.set(key, { ...r, j0: j, j1: j + 1 }); }
    for (const o of open.values()) out.push(o);
    open = next;
  }
  for (const o of out) if (o.m !== 'none') B.floor(R.x0 + o.i0, R.z0 + o.j0, R.x0 + o.i1, R.z0 + o.j1, 0, { mat: o.m, t: .3 });
}

// ------------------------------------------------------------------------------------------------ doors and windows
/** a door leaf in a frame, in the current frame: opening centre (x, z) in a wall along local x at depth z, sill y.
 *  open = degrees (into +z when the wall faces -z), mat = leaf paint. Leaf collider only when closed or ajar. */
function door(B, x, y, z, o = {}) {
  const w = o.w || .92, h = o.h || 2.1, ang = (o.open || 0) * PI / 180, s = o.side || 1;   // side 1: opens toward +z
  B.push(x, y, z, 0);
  const fm = o.frame || 'mo_trim';
  B.box(-w / 2 - .04, 0, 0, .07, h + .04, .3, { mat: fm, collide: false, cast: false });
  B.box(w / 2 + .04, 0, 0, .07, h + .04, .3, { mat: fm, collide: false, cast: false });
  B.box(0, h, 0, w + .15, .07, .3, { mat: fm, collide: false, cast: false });
  // the leaf hinges at -x
  B.push(-w / 2, 0, s * .09, -s * ang);
  B.box(w / 2, 0, 0, w, h - .01, .045, { mat: o.mat || 'mo_teal', collide: !o.nocollide, surf: 'wood' });
  B.box(w - .1, .98, s * .045, .03, .03, .06, { mat: 'p_chrome', collide: false, cast: false });       // knob
  B.box(w - .1, .98, -s * .045, .03, .03, .06, { mat: 'p_chrome', collide: false, cast: false });
  B.pop(); B.pop();
}
/** a wall window: frame + sill + glass (collider), in the current frame; wall along local x, centred at depth z, t wall thickness */
function win(B, x, y, z, w, h, o = {}) {
  const t = o.t || .25, fm = o.frame || 'mo_trim';
  B.push(x, y, z, 0);
  B.box(0, -.04, -t / 2 - .04, w + .14, .05, .1, { mat: o.sill || 'concrete', collide: false, cast: false });     // outside sill (-z)
  B.box(-w / 2 + .03, 0, 0, .06, h, t + .02, { mat: fm, collide: false, cast: false });
  B.box(w / 2 - .03, 0, 0, .06, h, t + .02, { mat: fm, collide: false, cast: false });
  B.box(0, h - .05, 0, w, .05, t + .02, { mat: fm, collide: false, cast: false });
  B.box(0, 0, 0, w, .05, t + .02, { mat: fm, collide: false, cast: false });
  if (o.mull) B.box(0, 0, 0, .05, h, .08, { mat: fm, collide: false, cast: false });
  B.box(0, .05, 0, w - .1, h - .1, .02, { mat: o.glass || 'glass', surf: 'glass', cast: false });
  B.pop();
}

/** a two-storey wall: openings (absolute y) go to the storey they sit in; B.wall cannot stack openings at the same x */
function swall(B, x0, z0, x1, z1, o) {
  const cut = o.cut || Y1, lo = [], hi = [];
  for (const q of o.openings || []) ((q.y || 0) < cut ? lo : hi).push((q.y || 0) < cut ? q : Object.assign({}, q, { y: q.y - cut }));
  B.wall(x0, z0, x1, z1, Object.assign({}, o, { y: 0, h: cut, openings: lo }));
  B.wall(x0, z0, x1, z1, Object.assign({}, o, { y: cut, h: o.h - cut, openings: hi }));
}

// ------------------------------------------------------------------------------------------------ a motel wing
/** rooms in a row along local +x (4 m modules), front facade at local z 0 facing -z, depth 10, walkway z -2.5..0 under the
 *  upper balcony. o = { n, num: [first ground, first upper], breeze (module index of a through passage), open: { g: [i], u: [i] },
 *  rear: [ground i with a rear door], gable0, gable1, gaps: [[x0, x1]] in the balcony rail, lit (module, floor) -> 0|1|2|3,
 *  stucco, stucco2, posts0: false (no post at x 0) } */
function wing(B, o) {
  const n = o.n, L = n * 4, D = 10, T = .25, R = rng(o.seed || 3);
  const st = o.stucco || 'mo_stucco', back = o.stucco2 || 'mo_stucco_sand';
  const open = { g: new Set(o.open && o.open.g || []), u: new Set(o.open && o.open.u || []) }, rear = new Set(o.rear || []);
  B.castOn = true;
  // walkway apron (+ kerb nose) and the slabs
  B.box(L / 2, 0, -1.25, L, GF, 2.5, { mat: 'concrete_floor', mats: { s: 'concrete' } });
  B.box(L / 2, 0, -2.52, L, GF + .01, .1, { mat: 'concrete', collide: false });
  B.floor(.05, -2.5, L - .05, D - .1, Y1, { mat: 'concrete_floor', t: .25, mats: { b: 'plaster_white' } });
  B.floor(.05, -2.75, L - .05, D - .25, 6.2, { mat: 'mo_roof', t: .25, mats: { b: 'plaster_white' } });
  B.box(L / 2, 2.8, -2.53, L, .32, .1, { mat: 'mo_trim', collide: false });                              // balcony slab edge band
  B.box(L / 2, 5.8, -2.83, L + .3, .75, .16, { mat: 'mo_teal', mats: { t: 'mo_trim', b: 'mo_trim' }, collide: false });   // fascia
  B.box(L / 2, 6.55, -2.83, L + .3, .06, .2, { mat: 'mo_trim', collide: false });
  // facades: one wall each side from 0 to 6.5 (low parapet), all openings in it
  const fo = [], bo = [];
  for (let i = 0; i < n; i++) {
    const x0 = i * 4;
    if (i === o.breeze) fo.push({ at: x0 + 2, w: 3.7, h: 2.85 });
    else { fo.push({ at: x0 + 1, w: 1.06, h: 2.2, y: GF }); fo.push({ at: x0 + 2.75, w: 1.5, h: 1.15, y: 1.05 }); }
    fo.push({ at: x0 + 1, w: 1.06, h: 2.2, y: Y1 }); fo.push({ at: x0 + 2.75, w: 1.5, h: 1.15, y: 4.0 });
    if (i === o.breeze) bo.push({ at: x0 + 2, w: 3.7, h: 2.85 });
    else if (rear.has(i)) bo.push({ at: x0 + 3.1, w: 1.0, h: 2.15, y: GF });
    else bo.push({ at: x0 + 3.1, w: .62, h: .5, y: 1.75 });
    bo.push({ at: x0 + 3.1, w: .62, h: .5, y: 4.7 });
  }
  swall(B, 0, T / 2, L, T / 2, { h: 6.5, t: T, mat: 'mo_wall', mat2: st, matEnd: st, openings: fo });
  swall(B, 0, D - T / 2, L, D - T / 2, { h: 6.5, t: T, mat: back, mat2: 'mo_wall', matEnd: back, openings: bo });
  if (o.gable0 !== false) B.wall(T / 2, T, T / 2, D - T, { h: 6.5, t: T, mat: st, mat2: 'mo_wall', matEnd: st });
  if (o.gable1 !== false) B.wall(L - T / 2, T, L - T / 2, D - T, { h: 6.5, t: T, mat: 'mo_wall', mat2: st, matEnd: st });
  B.castOn = false;
  // base band and a stucco control joint at the floor line (proud of the facade)
  B.box(L / 2, 0, -.02, L, .45, .05, { mat: 'concrete', collide: false, cast: false });
  B.box(L / 2, 0, D + .02, L, .45, .05, { mat: 'concrete', collide: false, cast: false });
  // posts, rails, downpipes
  for (let k = 0; k <= n; k++) {
    if (k === 0 && o.posts0 === false) continue;
    const x = Math.min(L - .08, Math.max(.08, k * 4));
    B.box(x, GF, -2.35, .12, 2.7, .12, { mat: 'mo_trim', surf: 'metal' });
    B.box(x, Y1, -2.35, .1, 2.85, .1, { mat: 'mo_trim', surf: 'metal' });
  }
  let rx = 0;
  const gaps = (o.gaps || []).slice().sort((a, b) => a[0] - b[0]);
  for (const g of gaps) { if (g[0] > rx + .2) rail(B, rx, -2.42, g[0], -2.42, Y1, { bars: true }); rx = g[1]; }
  if (L > rx + .2) rail(B, rx, -2.42, L, -2.42, Y1, { bars: true });
  for (const x of [.25, L - .25]) { B.cyl(x, 0, -2.66, .05, 6.1, { mat: 'p_galv', sides: 8, collide: false, cast: false }); B.box(x, 6.05, -2.75, .1, .12, .3, { mat: 'p_galv', collide: false, cast: false }); }
  B.box(L / 2, 6.1, -2.98, L, .12, .12, { mat: 'p_galv', collide: false, cast: false });                  // gutter
  // per module: doors, windows, curtains, numbers, AC sleeves, lamps; closed rooms are filled with a collider
  const fill = [[], []];
  for (let i = 0; i < n; i++) {
    const x0 = i * 4;
    for (const f of [0, 1]) {
      const y = f ? Y1 : GF, isBreeze = !f && i === o.breeze, isOpen = (f ? open.u : open.g).has(i);
      if (isBreeze) continue;
      const num = (f ? o.num[1] : o.num[0]) + (f || o.breeze == null || i < o.breeze ? i : i - 1);
      door(B, x0 + 1, y, .125, { open: isOpen ? 100 : (R() < .1 ? 12 : 0), mat: o.doorMat || 'mo_teal', w: .92, side: 1, nocollide: isOpen });
      win(B, x0 + 2.75, f ? 4.0 : 1.05, .125, 1.5, 1.15, { mull: true });
      decal(B, 'sign', 'r' + num, x0 + 1.78, y + 1.62, -.012, .34, .1, { face: 's' });
      B.box(x0 + 2.75, y + .3, -.07, .95, .42, .14, { mat: 'mo_trim', collide: false });               // through-wall AC sleeve
      B.box(x0 + 2.75, y + .34, -.145, .85, .32, .01, { mat: 'p_coat_slate', collide: false, cast: false });
      if (i % 2 === 0) wallLamp(B, x0 + .2, y + 2.1, 0, PI);
      if (!isOpen) {
        const lit = o.lit ? o.lit(i, f) : 0;
        if (lit) decal(B, 'glowdim', ['curtain', 'curtain2', 'blind'][lit - 1], x0 + 2.75, (f ? 4.0 : 1.05) + .6, .36, 1.4, 1.05, { face: 's' });
        else B.box(x0 + 2.75, f ? 4.0 : 1.05, .37, 1.45, 1.15, .02, { mat: ['p_fab_beige', 'p_fab_teal', 'p_fab_brown', 'p_fab_mustard'][(i + f) % 2], collide: false, cast: false });
        fill[f].push(i);
      } else room(B, x0, y, f ? 5.95 : 2.85, { rear: !f && rear.has(i), seed: i * 7 + f, num, ...(o.roomOpts || {}) });
    }
    // back: frosted bathroom windows, meters and AC condensers on pads every other module
    for (const f of [0, 1]) { if ((!f && (i === o.breeze || rear.has(i)))) continue; B.box(x0 + 3.1, (f ? 4.7 : 1.75) + .02, D - .13, .58, .46, .02, { mat: 'glass_frosted', collide: false, cast: false }); }
    if (o.backDress !== false && i % 3 === 1 && i !== o.breeze) B.prop('ac_unit', x0 + 1.6, 0, D + .75, { variant: 'condenser', ry: PI });
  }
  // closed rooms: one solid collider per run of closed modules (nobody can reach them, the navgrid skips them)
  for (const f of [0, 1]) {
    const L0 = fill[f]; let a = 0;
    while (a < L0.length) {
      let b = a; while (b + 1 < L0.length && L0[b + 1] === L0[b] + 1) b++;
      const xa = L0[a] * 4 + .2, xb = L0[b] * 4 + 3.8, y0 = f ? Y1 : GF, y1 = f ? 5.95 : 2.85;
      B.collider({ cx: (xa + xb) / 2, cy: (y0 + y1) / 2, cz: 5, hx: (xb - xa) / 2, hy: (y1 - y0) / 2, hz: 4.7, surf: 'mo_wall' });
      a = b + 1;
    }
  }
  if (o.breeze != null) breezeway(B, o.breeze * 4);
  return L;
}
/** a furnished motel room (module x0..x0+4, local z .25..9.75), floor y, ceiling yc */
function room(B, x0, y, yc, o) {
  const h = yc - y + .05, R = rng(o.seed + 11);
  const carpet = 'mo_carpet';
  // party walls
  B.wall(x0 + .1, .25, x0 + .1, 9.75, { y, h, t: .2, mat: 'mo_wall', mat2: 'mo_wall' });
  B.wall(x0 + 3.9, .25, x0 + 3.9, 9.75, { y, h, t: .2, mat: 'mo_wall', mat2: 'mo_wall' });
  // bathroom (full width, or the west half when the room has a rear door)
  const bx1 = o.rear ? x0 + 2.3 : x0 + 3.8;
  B.wall(x0 + .2, 7.2, bx1, 7.2, { y, h, t: .12, mat: 'tile_white', mat2: 'mo_wall', openings: [{ at: .95, w: .8, h: 2.05, frame: 'mo_trim' }] });
  if (o.rear) B.wall(bx1 + .06, 7.26, bx1 + .06, 9.75, { y, h, t: .12, mat: 'mo_wall', mat2: 'tile_white' });
  // floors (a thin finish over the slab; the ground rooms stand on their own .15 slab)
  if (y < 1) { B.floor(x0 + .2, .25, x0 + 3.8, 7.14, y, { mat: carpet, t: y }); B.floor(x0 + .2, 7.14, x0 + 3.8, 9.75, y, { mat: 'tile_floor', t: y }); }
  else { B.box(x0 + 2, y, 3.7, 3.6, .012, 6.9, { mat: carpet, collide: false, cast: false }); B.box(x0 + 2, y, 8.45, 3.6, .012, 2.55, { mat: 'tile_floor', collide: false, cast: false }); }
  B.box(x0 + 2, yc - .02, 4, .6, .02, .6, { mat: 'emissive_warm', collide: false, cast: false });
  // skirting
  B.box(x0 + .21, y, 3.7, .02, .1, 6.9, { mat: 'wood_dark', collide: false, cast: false }); B.box(x0 + 3.79, y, 3.7, .02, .1, 6.9, { mat: 'wood_dark', collide: false, cast: false });
  // furniture: bed against the east party wall, TV dresser opposite, wardrobe by the bathroom, armchair by the window
  B.prop('bed', x0 + 2.75, y, 3.9, { variant: 'double', ry: -H, color: ['red', 'blue', 'grey'][o.seed % 3] });
  B.box(x0 + 3.55, y, 2.4, .42, .55, .42, { mat: 'p_wood_walnut' }); B.box(x0 + 3.55, y + .55, 2.4, .16, .3, .16, { mat: 'p_fab_beige', collide: false });
  B.box(x0 + 3.55, y + .62, 2.4, .1, .12, .1, { mat: 'emissive_warm', collide: false, cast: false });
  B.box(x0 + 3.55, y, 5.4, .42, .55, .42, { mat: 'p_wood_walnut' });
  B.box(x0 + .45, y, 4.2, .45, .8, 1.5, { mat: 'p_wood_walnut' });                                          // dresser
  B.prop('tv', x0 + .5, y + .8, 4.2, { ry: H, on: R() < .5 });
  B.prop('curtain', x0 + 2.75, y, .32, { variant: ['beige', 'mustard', 'teal'][o.seed % 3], w: 1.9, h: 2.2, open: .7 });
  B.prop('armchair', x0 + 3.1, y, 1.2, { variant: ['brown', 'teal', 'mustard'][o.seed % 3], ry: -2.4 });
  if (!o.rear) B.prop('wardrobe', x0 + .55, y, 6.4, { ry: H });
  B.prop('rug', x0 + 1.4, y + .013, 4.0, { variant: 'red', w: 1.0, d: 1.8 });
  // bathroom fixtures
  B.box(x0 + .55, y, 8.6, .4, .42, .65, { mat: 'p_porcelain' });                                               // toilet
  if (!o.rear) { B.box(x0 + 2.9, y, 8.6, 1.7, .55, .75, { mat: 'p_porcelain' }); B.prop('sink', x0 + 1.6, y, 9.4, { n: 1, ry: PI }); }
  else B.prop('sink', x0 + 1.6, y, 9.4, { n: 1, ry: PI });
  B.box(x0 + 1.6, yc - .02, 8.4, .3, .02, .3, { mat: 'emissive_white', collide: false, cast: false });
  // the mess of a room someone left in a hurry
  B.prop('cardboard_box', x0 + 1.2, y, 6.6, { variant: 'small', ry: R() * 3 });
  B.prop('trash_bag', x0 + 3.5, y, 6.6, { n: 1 });
  decal(B, 'stain', 'gum', x0 + 1.6, y + .02, 2.5, 1.2, 1.2, {});
}
/** the breezeway through the north wing (module x0..x0+4): ice machine, vending machines, a payphone */
function breezeway(B, x0) {
  B.floor(x0 + .2, .25, x0 + 3.8, 9.75, GF, { mat: 'concrete_floor', t: GF });
  B.wall(x0 + .1, .25, x0 + .1, 9.75, { y: 0, h: 2.9, t: .2, mat: 'mo_block', mat2: 'mo_block' });
  B.wall(x0 + 3.9, .25, x0 + 3.9, 9.75, { y: 0, h: 2.9, t: .2, mat: 'mo_block', mat2: 'mo_block' });
  // ice machine (bin + head) and two vending machines against the west wall, a payphone on the east wall
  B.box(x0 + .65, GF, 3.4, .85, .95, .8, { mat: 'p_stainless', surf: 'metal' });
  B.box(x0 + .65, GF + .95, 3.4, .85, .75, .75, { mat: 'p_enamel_white', surf: 'metal' });
  B.box(x0 + 1.08, GF + 1.05, 3.4, .01, .3, .5, { mat: 'p_coat_blue', collide: false, cast: false });
  decal(B, 'glow', 'ice', x0 + 1.09, GF + 2.0, 3.4, .7, .25, { face: 'e' });
  B.prop('vending_machine', x0 + .62, GF, 5.3, { variant: 'drinks', ry: H });
  B.prop('vending_machine', x0 + .62, GF, 6.5, { variant: 'snacks', ry: H });
  B.box(x0 + 3.72, GF + 1.1, 5.5, .16, .55, .32, { mat: 'p_coat_slate', collide: false });
  B.box(x0 + 2, 2.82, 5, .3, .03, .3, { mat: 'emissive_white', collide: false, cast: false });
  B.prop('wheelie_bin', x0 + 3.4, GF, 8.6, { variant: 'grey', ry: -H });
  decal(B, 'sign', 'ice', x0 + 1.95, 2.55, -.012, .6, .2, { face: 's' });
  decal(B, 'stain', 'water', x0 + .3, GF + .02, 3.9, .7, 1.6, { face: 'u' });
}


// ------------------------------------------------------------------------------------------------ the desert around the map
const MESAS = [[-420, 480, 120, 44], [-120, 650, 180, 58], [330, 560, 140, 38], [640, 120, 100, 30], [-620, -230, 130, 48], [200, -640, 150, 40]];
const sstep = t => t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
/** ground height outside the playable area: flat round the map and along the highway, dunes further out, mesas on the horizon */
function desertH(x, z) {
  const dx = Math.max(0, -70 - x, x - 58), dz = Math.max(0, -96 - z, z - 62), d = Math.hypot(dx, dz);
  let h = -.4;
  if (d > 0) {
    const road = sstep((Math.abs(z + 57) - 10) / 30);
    h = -.4 + sstep(d / 140) * road * (2.4 + 2.2 * Math.sin(x * .011 + 1.3) * Math.cos(z * .009) + 1.3 * Math.sin(x * .027 - z * .023));
  }
  for (const [mx, mz, r, mh] of MESAS) {
    const e = Math.hypot(x - mx, z - mz), wob = r * (1 + .12 * Math.sin(Math.atan2(z - mz, x - mx) * 5 + mx));
    const k = sstep((wob + 45 - e) / 45);
    if (k > 0) h = Math.max(h, mh * Math.min(1, k * 1.6));
  }
  return h;
}
/** one merged mesh (one draw call), no colliders */
function desert(B) {
  const N = 120, S = 1250, step = 2 * S / N, P = [], I = [];
  for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) { const x = -S + i * step + 0, z = -S + j * step - 20; P.push(x, desertH(x, z), z); }
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const a = j * (N + 1) + i, b = a + 1, c = a + N + 1, d = c + 1; I.push(a, b, c, b, d, c); }
  const nrm = []; BABYLON.VertexData.ComputeNormals(P, I, nrm);
  const vd = new BABYLON.VertexData(); vd.positions = P; vd.indices = I; vd.normals = nrm;
  const m = new BABYLON.Mesh('mo_desert', B.scene); vd.applyToMesh(m);
  B.mesh(m, { mat: 'sand', collide: 'none', cast: false });
}

// ------------------------------------------------------------------------------------------------ the map
export default {
  id: 'motel', name: 'Starlite Motel',
  desc: 'Two-storey roadside motel on a desert highway at night: exterior walkways, a drained pool, the neon pylon, a diner with gas pumps, and the coach stop across the road.',
  size: 'S', chunk: 256,
  env: { hdri: 'night', sky: 'hdri', time: 'night', exposure: 1.3, sun: { dir: [-.45, -.62, .64], color: [.62, .7, .95], intensity: .8 },
    ambient: [.28, .29, .34], fog: { color: [.085, .08, .085], density: .003 }, weather: 'clear', wind: [1.2, -.6],
    ambience: 'motel', reverb: 'outdoor', indoorIbl: .45 },
  bounds: { minX: -64, maxX: 52, minZ: -90, maxZ: 56, minY: -4, maxY: 20 },

  build(B) {
    mo(B);
    // sun (moon) shadows only from the big things: buildings, canopies, vehicles; everything else is cast:false by default
    if (!B._moCast) {
      B._moCast = true; B.castOn = false;
      const box0 = B.box.bind(B), cyl0 = B.cyl.bind(B), prop0 = B.prop.bind(B);
      B.box = (x, y, z, w, h, d, o = {}) => box0(x, y, z, w, h, d, o.cast === undefined && !B.castOn ? Object.assign({}, o, { cast: false }) : o);
      B.cyl = (x, y, z, r, h, o = {}) => cyl0(x, y, z, r, h, o.cast === undefined && !B.castOn ? Object.assign({}, o, { cast: false }) : o);
      // props merge into the chunk meshes (no thin instances: a thin-instanced prop costs one draw per material)
      B.prop = (t, x, y, z, o = {}) => prop0(t, x, y, z, Object.assign({ inst: false }, o, o.cast === undefined && !B.castOn && !/^(box_truck|truck_tractor|semi_trailer)$/.test(t) ? { cast: false } : null));
    }
    const R = rng(61);
    // ================================================================== ground
    pave(B, [
      [-18, -8, 2, 0, 'none'],                                   // pool basin
      [22, -88, 46, -76, 'mo_terrazzo'], [-12, 44, 4, 54, 'concrete_floor'],
      [-64, -64, 52, -50, 'asphalt'], [14, -72, 52, -64, 'asphalt'], [20, -76, 48, -72, 'pavement'],
      [-64, -90, 52, -64, 'sand'],
      [-64, -50, 52, -47, 'gravel'],
      [-62, -47, -34, -22, 'concrete_floor'], [-62, -22, -34, 0, 'pavement'],
      [-24, -16, 8, 8, 'pavement'],
      [-26, 19, 30, 32, 'concrete_floor'], [29, -28, 52, 44, 'concrete_floor'],
      [-62, 32, 52, 44, 'asphalt'],
      [-64, 0, -28, 32, 'gravel'],
      [-34, -47, 29, 19, 'asphalt'],
    ], { x0: -64, z0: -90, x1: 52, z1: 56 }, 'sand');
    desert(B);
    for (const [x0, x1] of [[-1100, -64], [52, 1100]]) B.box((x0 + x1) / 2, -.3, -57, x1 - x0, .29, 14, { mat: 'asphalt', collide: false, cast: false });

    this.highway(B);
    this.coachStop(B);
    this.gas(B);
    this.diner(B);
    this.pool(B);
    this.wings(B);
    this.office(B);
    this.alley(B);
    this.laundry(B);
    this.westYard(B);
    this.lot(B, R);
    this.perimeter(B);
    this.pylon(B);
    this.lights(B);
    this.markers(B);
    this.skyline(B);
    finish(B);
  },

  // ================================================================== highway and verges
  highway(B) {
    paint(B, -560, -56.9, 560, -56.9, { col: YEL, w: .1 }); paint(B, -560, -57.1, 560, -57.1, { col: YEL, w: .1 });
    paint(B, -560, -63.3, 14, -63.3, { w: .14, col: WHT }); paint(B, 52, -63.3, 560, -63.3, { w: .14, col: WHT });
    paint(B, -560, -50.7, 560, -50.7, { w: .14, col: WHT });
    paint(B, 14, -63.3, 52, -63.3, { w: .14, col: WHT, dash: [1, 1] });
    decal(B, 'sign', 'bus', 33, .013, -67.5, 3.2, .7, { face: 'u', ry: PI });
    for (const [x, z, s] of [[-30, -58, 'tyre'], [6, -55, 'oil0'], [-48, -60, 'patch'], [24, -53, 'crack'], [-10, -61, 'crack'], [40, -59, 'tyre'], [-56, -52, 'oil1']])
      decal(B, 'stain', s, x, .014, z, s === 'tyre' ? 7 : 3, s === 'tyre' ? 1.8 : 3, { face: 'u', ry: s === 'tyre' ? .05 : x });
    for (let x = -60; x < 50; x += 9 + (x * 7 % 5)) decal(B, 'stain', 'sand', x, .016, -50.2, 6, 1.6, { face: 'u' });
    for (let x = -58; x < 50; x += 13) decal(B, 'stain', 'sand', x + 3, .016, -63.8, 5, 1.4, { face: 'u' });
    // the abandoned traffic: a stalled pickup on the north shoulder, a car with its door open on the south one
    B.prop('car', -24, 0, -52.2, { variant: 'pickup', color: 'brown', ry: H + .05, hide: true });
    B.prop('car', 4, 0, -61.6, { variant: 'sedan', color: 'beige', ry: -H + .08, state: 'wreck' });
    B.prop('cone', 7, 0, -59.4, {}); B.prop('cone', 9.5, 0, -59.6, {}); B.prop('cone', -21, 0, -54.6, {});
    B.prop('car', 30, 0, -54.6, { variant: 'hatch', color: 'blue', ry: -H - .25 });
    // ROAD CLOSED barricade (west) and the jackknifed semi (east)
    for (let z = -63; z <= -51; z += 3.05) B.prop('jersey_barrier', -59.5, 0, z, { ry: H, variant: 'plastic', color: z > -58 ? 'red' : 'white', len: 2 });
    B.prop('cone', -57.2, 0, -58.2, { variant: 'sawhorse', ry: H }); B.prop('cone', -57.5, 0, -54.4, { variant: 'drum' }); B.prop('cone', -57.4, 0, -61, { variant: 'drum' });
    B.box(-60.6, 0, -57, .08, 2.3, .08, { mat: 'p_galv', collide: false }); B.box(-60.6, 0, -55.4, .08, 2.3, .08, { mat: 'p_galv', collide: false });
    B.box(-60.55, 1.4, -56.2, .05, .8, 2.4, { mat: 'mo_trim', collide: false });
    decal(B, 'sign', 'closed', -60.51, 1.95, -56.2, 2.3, .34, { face: 'e' }); decal(B, 'sign', 'local', -60.51, 1.6, -56.2, 2.3, .3, { face: 'e' });
    B.prop('car', -67, 0, -56, { variant: 'police', ry: H + .4, lights: true });
    B.prop('truck_tractor', 53.5, 0, -52, { variant: 'red', ry: -2.35 });
    B.prop('semi_trailer', 54.8, 0, -59.5, { variant: 'box', ry: H + .32 });
    for (const [x, z] of [[47.5, -60.5], [46.6, -55.2], [48, -51.6]]) { B.cyl(x, 0, z, .03, .06, { mat: 'mo_neon_red', sides: 6, collide: false, cast: false }); decal(B, 'stain', 'soot', x, .02, z, .6, .6, {}); }
    B.prop('cone', 46, 0, -58, {}); B.prop('cone', 45.4, 0, -53.6, {});
  },

  // ================================================================== T1 lobby: Greyline coach stop
  coachStop(B) {
    const x0 = 22, x1 = 46, z0 = -88, z1 = -76, h = 3.85;
    B.castOn = true;
    B.wall(x0, z1 - .125, x1, z1 - .125, { h, t: .25, mat: 'mo_stucco_sand', mat2: 'plaster_white', matEnd: 'mo_stucco_sand',
      openings: [{ at: 6, w: 2.8, h: 2.7 }, { at: 18, w: 2.8, h: 2.7 }, { at: 2.4, w: 2.2, h: 1.4, y: 1.0 }, { at: 12, w: 4.4, h: 1.4, y: 1.0 }, { at: 21.6, w: 2.2, h: 1.4, y: 1.0 }] });
    B.wall(x0, z0 + .125, x1, z0 + .125, { h, t: .25, mat: 'plaster_white', mat2: 'mo_stucco_sand', matEnd: 'mo_stucco_sand' });
    B.wall(x0 + .125, z0 + .25, x0 + .125, z1 - .25, { h, t: .25, mat: 'mo_stucco_sand', mat2: 'plaster_white', matEnd: 'mo_stucco_sand' });
    B.wall(x1 - .125, z0 + .25, x1 - .125, z1 - .25, { h, t: .25, mat: 'plaster_white', mat2: 'mo_stucco_sand', matEnd: 'mo_stucco_sand' });
    B.push(0, 0, z1 - .125, PI); for (const x of [24.4, 34, 43.6]) win(B, -x, 1.0, 0, x === 34 ? 4.4 : 2.2, 1.4, { mull: x === 34, frame: 'p_chrome' }); B.pop();
    B.floor(x0 + .25, z0 + .25, x1 - .25, z1 - .25, 3.6, { t: .25, mat: 'mo_roof', mats: { b: 'ceiling_tile' } });
    B.castOn = false;
    B.box(34, 3.6, z1 + .05, 24.3, .35, .12, { mat: 'mo_trim', collide: false });
    // platform canopy over the bay
    B.box(34, 3.25, -74, 28, .22, 4.6, { mat: 'corrugated', mats: { b: 'mo_trim', n: 'mo_trim', s: 'mo_trim', e: 'mo_trim', w: 'mo_trim' }, collide: false });
    for (const x of [21, 25, 34, 43, 47]) B.box(x, 0, -72.1, .16, 3.25, .16, { mat: 'paint_black', surf: 'metal' });
    B.box(34, 0, -72.05, 28, .16, .25, { mat: 'concrete', collide: false });                                 // platform kerb nose
    B.box(34, 3.47, -71.82, 28.1, .5, .08, { mat: 'paint_black', collide: false });
    decal(B, 'glow', 'coach', 34, 3.72, -71.77, 3.6, .6, { face: 'n' });
    decal(B, 'sign', 'coach', 34, 3.0, z1 + .02, 4.4, .42, { face: 'n' });
    decal(B, 'sign', 'tickets', 34, 2.55, z1 + .02, 3.2, .3, { face: 'n' });
    B.prop('bench', 25, 0, -73.2, { variant: 'metal', ry: PI }); B.prop('bench', 43, 0, -73.2, { variant: 'metal', ry: PI });
    B.prop('litter_bin', 31.2, 0, -73.0, { variant: 'square' }); B.prop('newspaper_box', 37, 0, -73.0, { variant: 'blue', ry: PI });
    B.prop('road_sign', 48.6, 0, -72.4, { variant: 'parking', ry: PI });
    // inside: benches along the walls, ticket counter, lockers, vending, schedule board, luggage
    for (const x of [26, 30.5, 37.5, 42]) B.prop('bench', x, 0, -87.3, { variant: 'metal' });
    B.box(45.1, 0, -82, 1.1, 1.05, 4.5, { mat: 'p_wood_walnut', mats: { t: 'p_chrome' } });
    B.box(45.7, 1.05, -82, .02, 1.6, 4.5, { mat: 'glass', collide: false, cast: false });
    B.prop('lockers', 22.5, 0, -83, { ry: H, n: 6, variant: 'blue' });
    B.prop('vending_machine', 22.75, 0, -78, { ry: H, variant: 'drinks' }); B.prop('vending_machine', 22.75, 0, -79.1, { ry: H, variant: 'snacks' });
    B.prop('atm', 45.4, 0, -78.2, { variant: 'kiosk', ry: -H });
    B.prop('poster', 30, 1.3, -87.74, { i: 2 }); B.prop('poster', 38, 1.3, -87.74, { i: 4 }); B.prop('wall_clock', 34, 2.8, -87.74, {});
    B.box(34, 2.0, -87.73, 3.2, 1.1, .05, { mat: 'paint_black', collide: false }); decal(B, 'glow', 'menu', 34, 2.55, -87.69, 3.0, .9, { face: 'n' });
    B.prop('fire_extinguisher', 45.75, 0, -86, { ry: -H });
    B.prop('cardboard_box', 23.2, 0, -86.9, { variant: 'pile', n: 3 });
    B.box(44.2, 0, -86.6, .9, .7, .5, { mat: 'p_fab_navy' }); B.box(43.4, 0, -86.9, .6, .45, .35, { mat: 'p_fab_red' });
    for (const [x, z] of [[27, -82.5], [31.5, -79], [36.5, -84], [41, -80.5]]) decal(B, 'stain', 'gum', x, .015, z, 1.4, 1.4, { ry: x });
    decal(B, 'stain', 'dust', 26, .016, -78, 3, 3, {}); decal(B, 'stain', 'dust', 41, .016, -77.5, 3, 2, {});
    for (const x of [26.9, 30.1, 37.9, 41.1]) { B.prop('bench', x, 0, -82.6, { variant: 'metal' }); B.prop('bench', x, 0, -83.25, { variant: 'metal', ry: PI }); }
    B.box(34, 0, -76.38, 23.4, .12, .02, { mat: 'wood_dark', collide: false }); B.box(34, 0, -87.62, 23.4, .12, .02, { mat: 'wood_dark', collide: false });
    for (const x of [22.38, 45.62]) B.box(x, 0, -82, .02, .12, 11.3, { mat: 'wood_dark', collide: false });
    B.box(34, 1.0, -87.6, 23.3, .06, .03, { mat: 'mo_teal', collide: false }); B.box(34, 0, -87.62, 23.3, 1.0, .01, { mat: 'mo_teal', collide: false });
  },

  // ================================================================== gas pumps
  gas(B) {
    B.castOn = true;
    B.box(-48, 4.7, -38, 20, .55, 12, { mat: 'mo_red', mats: { t: 'mo_roof', b: 'mo_trim' }, collide: false });
    B.box(-48, 4.62, -38, 20.2, .1, 12.2, { mat: 'mo_trim', collide: false });
    B.castOn = false;
    for (const z of [-40.5, -35.5]) {
      B.box(-48, 0, z, 13, .18, 1.4, { mat: 'concrete', mats: { t: 'concrete_floor' } });
      for (const x of [-53.6, -42.4]) { B.cyl(x, .18, z, .22, 4.5, { mat: 'mo_trim', sides: 12 }); }
      for (const x of [-50.5, -45.5]) {
        B.box(x, .18, z, 1.0, 1.75, .55, { mat: 'p_enamel_white', surf: 'metal' });
        B.box(x, 1.93, z, 1.05, .25, .6, { mat: 'mo_red', collide: false });
        decal(B, 'glow', 'bar', x, 1.45, z - .28, .5, .14, { face: 's' }); decal(B, 'glow', 'bar', x, 1.45, z + .28, .5, .14, { face: 'n' });
        B.box(x + .38, .9, z - .3, .12, .3, .06, { mat: 'paint_black', collide: false, cast: false });
        B.cyl(x + .55, .4, z, .025, 1.1, { mat: 'rubber', sides: 6, collide: false, cast: false });
      }
      for (const x of [-54.3, -41.7]) B.prop('bollard', x, .18, z, { variant: 'yellow' });
      B.prop('litter_bin', -48, .18, z + .45, { variant: 'square' });
    }
    for (const [x, z] of [[-52, -38], [-44, -38], [-56, -38], [-40, -38]]) B.box(x, 4.6, z, 1.4, .03, .5, { mat: 'emissive_white', collide: false, cast: false });
    // fuel price sign at the road and the air / water post, ice chest, propane cage
    B.box(-59.2, 0, -47.6, .25, 5.6, .25, { mat: 'mo_trim' });
    B.box(-59.2, 5.6, -47.6, 2.6, 1.6, .3, { mat: 'mo_red', collide: false }); decal(B, 'sign', 'fuel', -59.2, 6.05, -47.76, 2.4, .26, { face: 's' }); decal(B, 'sign', 'open24', -59.2, 6.5, -47.76, 2.4, .3, { face: 's' });
    decal(B, 'sign', 'fuel', -59.2, 6.05, -47.44, 2.4, .26, { face: 'n' });
    B.box(-37.2, 0, -45.5, .5, 1.35, .4, { mat: 'mo_red' }); B.cyl(-36.9, .6, -45.5, .02, .6, { mat: 'rubber', sides: 6, collide: false });
    B.box(-61.2, 0, -30, .9, 1.2, 2.2, { mat: 'p_enamel_white' }); decal(B, 'sign', 'ice', -60.74, .85, -30, .8, .25, { face: 'e' });
    B.prop('gas_cylinder', -61.2, 0, -26.8, { variant: 'propane', rack: true, ry: H });
    B.prop('car', -50.6, 0, -38, { variant: 'suv', color: 'black', ry: -H, seed: 3 });
    for (const [x, z, s] of [[-50, -40.5, 'oil0'], [-45.5, -35.5, 'oil1'], [-52, -33.5, 'drip'], [-44, -42.6, 'drip'], [-40, -30, 'tyre']]) decal(B, 'stain', s, x, .015, z, s === 'tyre' ? 6 : 2.6, s === 'tyre' ? 1.6 : 2.6, { face: 'u', ry: x });
  },

  // ================================================================== SITE A: the diner
  diner(B) {
    const x0 = -60, x1 = -36, z0 = -22, z1 = 0, h = 4.4, Y = GF, C = 3.5;
    const ext = 'plaster_white';
    // floors
    B.floor(x0 + .25, z0 + .25, x1 - .25, -5.1, Y, { mat: 'mo_checker', t: Y });
    B.floor(x0 + .25, -5.1, -44.06, z1 - .25, Y, { mat: 'tile_floor', t: Y });
    B.floor(-44.06, -5.1, x1 - .25, z1 - .25, Y, { mat: 'tile_white', t: Y });
    B.box(-46, 0, -23.2, 4.2, Y, 2.4, { mat: 'concrete' });                                                   // entry step / landing
    B.castOn = true;
    // shell
    B.wall(x0, z0 + .125, x1, z0 + .125, { h, t: .25, mat: 'plaster_white', mat2: ext, matEnd: ext,
      openings: [{ at: 4.5, w: 6.6, h: 1.6, y: 1.0 }, { at: 10.6, w: 4, h: 1.6, y: 1.0 }, { at: 14, w: 1.8, h: 2.35, y: Y }, { at: 17.4, w: 4, h: 1.6, y: 1.0 }, { at: 21.5, w: 2.6, h: 1.6, y: 1.0 }] });
    B.wall(x0, z1 - .125, x1, z1 - .125, { h, t: .25, mat: ext, mat2: 'tile_white', matEnd: ext,
      openings: [{ at: 6, w: 1.1, h: 2.15, y: Y }, { at: 3, w: 1.2, h: .9, y: 1.4 }, { at: 12, w: 1.2, h: .9, y: 1.4 }, { at: 22, w: .7, h: .5, y: 1.9 }] });
    B.wall(x0 + .125, z0 + .25, x0 + .125, z1 - .25, { h, t: .25, mat: ext, mat2: 'plaster_white', matEnd: ext });
    B.wall(x1 - .125, z0 + .25, x1 - .125, z1 - .25, { h, t: .25, mat: 'plaster_white', mat2: ext, matEnd: ext,
      openings: [{ at: 3.6, w: 5.6, h: 1.6, y: 1.0 }, { at: 7.75, w: 1.1, h: 2.2, y: Y }, { at: 12.4, w: 6.4, h: 1.6, y: 1.0 }, { at: 19.25, w: .7, h: .5, y: 1.9 }] });
    B.castOn = false;
    // glazing with chrome frames and mullions
    B.push(0, 0, 0, 0);
    for (const [cx, w] of [[-55.5, 6.6], [-49.4, 4], [-42.6, 4], [-38.5, 2.6]]) { win(B, cx, 1.0, z0 + .125, w, 1.6, { frame: 'mo_chrome_band', sill: 'mo_chrome_band' }); for (let k = 1; k < Math.round(w / 1.6); k++) B.box(cx - w / 2 + k * w / Math.round(w / 1.6), 1.0, z0 + .125, .06, 1.6, .1, { mat: 'mo_chrome_band', collide: false, cast: false }); }
    B.pop();
    B.push(x1 - .125, 0, 0, -H);   // east wall: local x = world z, local -z = world +x (outside)
    for (const [cz, w] of [[-18.4, 5.6], [-9.6, 6.4]]) { win(B, cz, 1.0, 0, w, 1.6, { frame: 'mo_chrome_band', sill: 'mo_chrome_band' }); for (let k = 1; k < 4; k++) B.box(cz - w / 2 + k * w / 4, 1.0, 0, .06, 1.6, .1, { mat: 'mo_chrome_band', collide: false, cast: false }); }
    B.pop();
    for (const x of [-57, -48]) B.box(x, 1.45, z1 - .13, 1.15, .85, .02, { mat: 'glass_frosted', collide: false, cast: false });
    B.box(-38, 1.92, z1 - .13, .66, .46, .02, { mat: 'glass_frosted', collide: false, cast: false }); B.box(x1 - .13, 1.92, -2.5, .02, .46, .66, { mat: 'glass_frosted', collide: false, cast: false });
    // front doors (glass, propped open), side door and kitchen back door
    B.push(-46, Y, z0 + .125, PI); door(B, -.45, 0, 0, { w: .86, h: 2.25, open: 95, mat: 'mo_chrome_band', side: -1, nocollide: true }); door(B, .45, 0, 0, { w: .86, h: 2.25, open: 0, mat: 'mo_chrome_band', side: -1 }); B.pop();
    B.push(x1 - .125, Y, -14, -H); door(B, 0, 0, 0, { w: .95, open: 100, mat: 'mo_red', nocollide: true }); B.pop();
    B.push(-54, Y, z1 - .125, 0); door(B, 0, 0, 0, { w: .95, open: 110, mat: 'p_stainless', nocollide: true, side: 1 }); B.pop();
    B.castOn = true;
    // roof, ceiling, parapet bands, red stripe and chrome trim outside
    B.floor(x0 + .25, z0 + .25, x1 - .25, z1 - .25, 3.8, { t: .3, mat: 'mo_roof', mats: { b: 'ceiling_tile' } });
    B.castOn = false;
    for (const [a, b, c, d] of [[x0 - .03, z0 - .06, x1 + .03, z0 - .01], [x0 - .03, z1 + .01, x1 + .03, z1 + .06], [x0 - .06, z0 - .03, x0 - .01, z1 + .03], [x1 + .01, z0 - .03, x1 + .06, z1 + .03]]) {
      B.box((a + c) / 2, 3.15, (b + d) / 2, c - a, .55, d - b, { mat: 'mo_red', collide: false, cast: false });
      B.box((a + c) / 2, 3.7, (b + d) / 2, c - a, .08, d - b, { mat: 'mo_chrome_band', collide: false, cast: false });
      B.box((a + c) / 2, 0, (b + d) / 2, c - a, .9, d - b, { mat: 'mo_red', collide: false, cast: false });
      B.box((a + c) / 2, .9, (b + d) / 2, c - a, .06, d - b, { mat: 'mo_chrome_band', collide: false, cast: false });
    }
    // interior walls: service divider (hatch, kitchen door, restroom, store), restroom / store partitions
    B.wall(x0 + .25, -5, x1 - .25, -5, { y: Y, h: C - Y + .05, t: .2, mat: 'tile_white', mat2: 'plaster_white',
      openings: [{ at: 7.75, w: 1.8, h: .8, y: .95, frame: 'mo_chrome_band' }, { at: 12.75, w: 1.0, h: 2.1, frame: 'mo_chrome_band' }, { at: 17.75, w: .9, h: 2.1, frame: 'wood_dark' }, { at: 21.75, w: .9, h: 2.1, frame: 'wood_dark' }] });
    B.wall(-44, -4.9, -44, z1 - .25, { y: Y, h: C - Y + .05, t: .15, mat: 'tile_white', mat2: 'tile_white' });
    B.wall(-40, -4.9, -40, z1 - .25, { y: Y, h: C - Y + .05, t: .15, mat: 'mo_wall', mat2: 'tile_white' });
    B.box(-52, Y + .9, -5, 1.9, .06, .5, { mat: 'p_stainless', collide: false });                                  // pass-through shelf
    // counter, stools, back bar, register, pie case, menu boards
    B.prop('bar_counter', -54.5, Y, -8.5, { ry: PI, len: 6 }); B.prop('bar_counter', -48.5, Y, -8.5, { ry: PI, len: 6 });
    for (let x = -57.1; x < -45.6; x += .82) B.prop('bar_stool', x, Y, -9.45, { variant: 'leather' });
    B.prop('back_bar', -56.2, Y, -5.33, { ry: PI, len: 3 }); B.prop('back_bar', -49.3, Y, -5.33, { ry: PI, len: 2.4 });
    B.box(-47.6, Y + 1.08, -8.5, .4, .32, .4, { mat: 'paint_black', collide: false }); B.box(-55, Y + 1.08, -8.5, .7, .45, .5, { mat: 'glass', collide: false, cast: false });
    for (const x of [-56, -49.3]) { B.box(x, 2.35, -5.13, 2.4, .9, .04, { mat: 'paint_black', collide: false }); decal(B, 'glow', 'menu', x, 2.8, -5.16, 2.2, .8, { face: 's' }); }
    // booths along the windows, tables in the middle, jukebox, coat stand
    for (const x of [-58.6, -56.5, -54.4, -52.3, -50.2, -42.6, -40.5, -38.4]) B.prop('booth', x, Y, -21.1, { ry: H, variant: 'red' });
    for (const z of [-18.4, -16.3, -11.8]) B.prop('booth', -36.9, Y, z, { variant: 'red' });
    for (const [x, z] of [[-56.5, -15.6], [-51, -16.2], [-43.5, -16.4]]) B.prop('dining_table', x, Y, z, { variant: 'set', w: 1.0, chairs: 4, ry: x * .3 });
    for (const [x, z] of [[-55.5, -12.2], [-41, -11.6]]) B.prop('dining_table', x, Y, z, { variant: 'set', w: 1.0, chairs: 3, ry: x * .7 });
    // waitress station island (cover in the middle of the room): cabinet, chrome top, coffee machine, cups
    B.box(-47.4, Y, -14.2, 1.9, 1.02, .75, { mat: 'mo_red', mats: { t: 'mo_chrome_band' }, surf: 'wood' });
    B.box(-47.4, Y + .3, -14.59, 1.8, .06, .02, { mat: 'mo_chrome_band', collide: false });
    B.box(-48, Y + 1.02, -14.2, .35, .45, .35, { mat: 'p_stainless', collide: false }); B.box(-46.9, Y + 1.02, -14.2, .5, .12, .3, { mat: 'p_porcelain', collide: false });
    B.prop('scan_wet_floor_sign', -45.2, Y, -18.8, { ry: .5 });
    B.box(-59.4, Y, -12, .7, 1.6, .55, { mat: 'mo_red' }); B.box(-59.05, Y + .7, -12, .02, .6, .45, { mat: 'mo_neon_yellow', collide: false, cast: false }); decal(B, 'glow', 'stripe', -59.04, Y + 1.4, -12, .5, .15, { face: 'e' });
    B.prop('newspaper_box', -48.2, Y, -20.7, { variant: 'red' }); B.prop('litter_bin', -43.6, Y, -6.3, { variant: 'square' });
    decal(B, 'glow', 'open', -42.6, 1.9, z0 - .01, 1.0, .4, { face: 's' }); decal(B, 'sign', 'dinerplate', -46, 2.8, z0 - .03, 3.2, .3, { face: 's' });
    decal(B, 'sign', 'restrooms', -42, 2.4, -5.12, 1.0, .2, { face: 's' }); decal(B, 'sign', 'kitchen', -47, 2.4, -5.12, 1.4, .2, { face: 's' });
    // pendant lights over the counter
    for (let x = -57; x < -45; x += 2.4) { B.cyl(x, 2.6, -8.5, .01, C - 2.6, { mat: 'paint_black', sides: 4, collide: false, cast: false }); B.cyl(x, 2.45, -8.5, .16, .16, { mat: 'mo_red', sides: 10, collide: false, cast: false }); B.cyl(x, 2.43, -8.5, .12, .02, { mat: 'emissive_warm', sides: 10, collide: false, cast: false }); }
    // kitchen
    for (const x of [-58.3, -56.05]) B.prop('kitchen_counter', x, Y, -.6, { ry: PI, len: 2.2, variant: 'grey', upper: false, sink: x < -57 ? 0 : -1 });
    B.prop('stove', -52.4, Y, -.62, { ry: PI, hood: true }); B.prop('stove', -51.7, Y, -.62, { ry: PI });
    B.prop('fridge', -49.4, Y, -.7, { ry: PI, variant: 'steel' }); B.prop('fridge', -48.6, Y, -.7, { ry: PI, variant: 'steel' });
    B.box(-52, Y, -2.7, 2.2, .9, .8, { mat: 'p_stainless', surf: 'metal' }); B.box(-52, Y + .25, -2.7, 2.1, .03, .7, { mat: 'p_stainless', collide: false });
    B.prop('shelf_unit', -45.2, Y, -1.0, { ry: PI, variant: 'grey', w: 1.2 });
    B.prop('crate_plastic', -59.2, Y, -4.2, { variant: 'grey', n: 3 }); B.prop('drum', -58.4, Y, -4.3, { variant: 'blue' });
    B.prop('fire_extinguisher', -44.15, Y, -3.4, { ry: -H });
    decal(B, 'stain', 'grime', -52, Y + .03, -1.4, 4, 2, { face: 'u' });
    // restroom (stall) and store room
    B.prop('toilet_stall', -42.2, Y, -2.2, { n: 2, variant: 'beige', ry: PI, open: [0] });
    B.prop('sink', -43.5, Y, -4.62, { n: 1 });
    B.prop('shelf_unit', -37, Y, -1.0, { ry: PI, variant: 'dark' }); B.prop('shelf_unit', -39.3, Y, -2.6, { ry: H, variant: 'dark' });
    B.prop('cardboard_box', -37.4, Y, -3.9, { variant: 'pile', n: 4 }); B.prop('pallet', -37.5, Y, -2.6, { variant: 'sacks' });
    // roof: DINER neon on a frame, AC units, vents
    B.box(-48, 3.8, -20.4, 7.4, 2.1, .2, { mat: 'paint_black', collide: false });
    for (const x of [-51.2, -44.8]) B.box(x, 3.8, -20.2, .12, 2.1, .12, { mat: 'steel_dark', collide: false });
    decal(B, 'glow', 'diner', -48, 4.85, -20.52, 6.6, 1.7, { face: 's' });
    decal(B, 'glow', 'eat', -36.1 - .13, 3.3, -12, 2.0, 1.1, { face: 'e' });
    B.prop('ac_unit', -55, 3.8, -8, { variant: 'hvac' }); B.prop('ac_unit', -41, 3.8, -4, { variant: 'condenser' });
    B.prop('vent', -52, 3.8, -2.5, { variant: 'mushroom' }); B.prop('vent', -45, 3.8, -14, { variant: 'box' });
    // outside: grime, the dumpsters and grease drum behind the kitchen
    for (const [x, z, f] of [[-48, z0 - .03, 's'], [-40, z0 - .03, 's'], [-58, z0 - .03, 's']]) decal(B, 'stain', 'grime', x, .55, z, 6, 1.1, { face: f });
    B.prop('dumpster', -57.4, 0, 1.4, { variant: 'green', ry: PI, hide: true }); B.prop('dumpster', -48.6, 0, 1.3, { variant: 'blue', ry: PI });
    B.prop('drum', -51.6, 0, .9, { variant: 'black', n: 2 }); B.prop('trash_bag', -50.3, 0, 1.1, { n: 4 });
    B.prop('pallet', -45.6, 0, .9, { stack: 4, variant: 'none' }); B.prop('crate_plastic', -44.6, 0, .7, { variant: 'red', n: 4 });
    decal(B, 'stain', 'oil1', -52, .014, 1.6, 3, 2.4, {}); decal(B, 'stain', 'litter', -57, .016, 2.8, 2.6, 2.6, {});
  },

  // ================================================================== MID: the drained pool
  pool(B) {
    const X0 = -18, X1 = 2, Z0 = -8, Z1 = 0;
    // basin walls (inner faces 5 cm proud of the deck slab ends), floors, slope and steps
    B.box(X0 - .15, -2.7, (Z0 + Z1) / 2, .4, 2.68, Z1 - Z0 + .6, { mat: 'mo_pool' });
    B.box(X1 + .15, -2.7, (Z0 + Z1) / 2, .4, 2.68, Z1 - Z0 + .6, { mat: 'mo_pool' });
    B.box((X0 + X1) / 2, -2.7, Z0 - .15, X1 - X0 - .1, 2.68, .4, { mat: 'mo_pool' });
    B.box((X0 + X1) / 2, -2.7, Z1 + .15, X1 - X0 - .1, 2.68, .4, { mat: 'mo_pool' });
    const ix0 = X0 + .05, ix1 = X1 - .05, iz0 = Z0 + .05, iz1 = Z1 - .05;
    B.floor(ix0, iz0, -10, iz1, -2.4, { mat: 'mo_pool_dark', t: .3 });
    B.ramp({ x: -7.5, z: (iz0 + iz1) / 2, w: iz1 - iz0, len: 5, y0: -2.4, y1: -1.0, dir: '+x', mat: 'mo_pool_dark' });
    B.floor(-5, iz0, ix1, iz1, -1.0, { mat: 'mo_pool_dark', t: .3 });
    B.stairs({ x: ix1 - .8, z: -4, w: 3.2, len: 1.6, y0: -1.0, y1: 0, dir: '+x', mat: 'mo_pool', rail: false });
    // coping, depth tiles, the black lane line, ladders, the diving board
    for (const [cx, cz, w, d] of [[(X0 + X1) / 2, Z0 - .2, X1 - X0 + .8, .4], [(X0 + X1) / 2, Z1 + .2, X1 - X0 + .8, .4], [X0 - .2, (Z0 + Z1) / 2, .4, Z1 - Z0], [X1 + .2, (Z0 + Z1) / 2, .4, Z1 - Z0]])
      B.box(cx, 0, cz, w, .06, d, { mat: 'concrete', collide: false });
    B.box(-8, -2.395, -4, 7.6, .005, .25, { mat: 'paint_black', collide: false, cast: false });
    B.box(-1.5, -.995, -4, 6.6, .005, .25, { mat: 'paint_black', collide: false, cast: false });
    decal(B, 'sign', 'deep', -14, .065, Z1 + .2, 1.5, .2, { face: 'u', ry: PI }); decal(B, 'sign', 'shallow', -1, .065, Z1 + .2, 1.5, .2, { face: 'u', ry: PI });
    decal(B, 'sign', 'nodive', -14, .065, Z0 - .2, 1.4, .2, { face: 'u' });
    for (const z of [-6.6, -1.4]) {
      for (const dz of [-.28, .28]) { B.cyl(X0 + .3, -1.5, z + dz, .025, 2.4, { mat: 'p_chrome', sides: 8, collide: false, cast: false }); B.box(X0 - .05, .78, z + dz, .7, .05, .05, { mat: 'p_chrome', collide: false, cast: false }); }
      for (let k = 0; k < 4; k++) B.box(X0 + .25, -1.4 + k * .35, z, .1, .03, .56, { mat: 'p_stainless', collide: false, cast: false });
    }
    B.box(X0 - 1.9, 0, -4, .8, .45, .7, { mat: 'concrete' });
    B.box(X0 - .4, .45, -4, 3.2, .07, .55, { mat: 'mo_trim', surf: 'wood' });
    // what collects in a pool nobody looks after
    decal(B, 'stain', 'algae', -16, -2.385, -2, 3.2, 3.2, {}); decal(B, 'stain', 'leaves', -13.2, -2.385, -6, 3, 3, {});
    decal(B, 'stain', 'leaves', -2, -.985, -1.6, 2.6, 2.6, {}); decal(B, 'stain', 'litter', -15.6, -2.385, -5.4, 2, 2, {});
    B.box(-16.8, -2.39, -1.8, 2.2, .01, 1.6, { mat: 'water', collide: false, cast: false });
    B.prop('drum', -12.5, -2.4, -6.8, { variant: 'rust', fallen: true, ry: .4 }); B.prop('trash_bag', -15.2, -2.4, -6.9, { n: 3 });
    B.prop('chair', -3.5, -1.0, -6.6, { variant: 'plastic', ry: 2.2 }); B.prop('cardboard_box', -10.5, -2.4, -1.2, { variant: 'flat', ry: .6 });
    B.prop('crate_plastic', -1.4, -1.0, -1.0, { variant: 'blue', n: 1 });
    // deck: fence with four gates, loungers, umbrella table, lifeguard chair, pump house, signs, planters
    const FX0 = -24, FX1 = 8, FZ0 = -16, FZ1 = 8;
    for (const [a, b] of [[FX0, -9.2], [-6.8, FX1]]) { rail(B, a, FZ1, b, FZ1, 0, { h: 1.2, bars: true }); rail(B, a, FZ0, b, FZ0, 0, { h: 1.2, bars: true }); }
    for (const [a, b] of [[FZ0, -5.2], [-2.8, FZ1]]) { rail(B, FX0, a, FX0, b, 0, { h: 1.2, bars: true }); rail(B, FX1, a, FX1, b, 0, { h: 1.2, bars: true }); }
    for (const [x, z] of [[-9.2, FZ1], [-6.8, FZ1], [-9.2, FZ0], [-6.8, FZ0], [FX0, -5.2], [FX0, -2.8], [FX1, -5.2], [FX1, -2.8], [FX0, FZ0], [FX1, FZ0], [FX0, FZ1], [FX1, FZ1]])
      B.box(x, 0, z, .1, 1.3, .1, { mat: 'paint_black', surf: 'metal', collide: false });
    decal(B, 'sign', 'pool', -8, 1.0, FZ0 - .07, 1.8, .16, { face: 's' }); B.box(-8, .9, FZ0 - .04, 1.9, .3, .02, { mat: 'mo_trim', collide: false, cast: false });
    const lounger = (x, z, ry) => { B.push(x, 0, z, ry); B.box(0, .22, 0, .65, .08, 1.9, { mat: 'mo_trim', collide: false }); B.box(0, .3, .78, .65, .45, .08, { mat: 'mo_trim', collide: false }); for (const [lx, lz] of [[-.28, -.85], [.28, -.85], [-.28, .7], [.28, .7]]) B.box(lx, 0, lz, .04, .22, .04, { mat: 'p_chrome', collide: false, cast: false }); B.collider({ cx: 0, cy: .28, cz: 0, hx: .33, hy: .28, hz: .95, surf: 'plastic' }); B.pop(); };
    for (const [x, z, r] of [[-21.5, 2, 0], [-20.4, 2.2, .1], [-19, 5.6, H], [-4, 4.2, .2], [-2.6, 4.5, -.15], [5.5, -11, PI], [-21.5, -12.4, 2.9], [-14, -12.6, PI + .3]]) lounger(x, z, r);
    for (const [x, z] of [[-12, 4.5], [4.2, -10.5]]) {
      B.cyl(x, 0, z, .45, .72, { mat: 'mo_trim', sides: 12 }); B.cyl(x, 0, z, .025, 2.4, { mat: 'p_chrome', sides: 6, collide: false });
      B.cyl(x, 2.15, z, 1.3, .12, { mat: 'p_fab_teal', sides: 8, collide: false });
      for (const a of [0, 1.6, 3.2, 4.7]) B.prop('chair', x + Math.cos(a) * .9, 0, z + Math.sin(a) * .9, { variant: 'plastic', ry: -a - H });
    }
    B.box(X0 - .8, 0, -9.2, .9, .1, .9, { mat: 'concrete' });
    for (const [dx, dz] of [[-.35, -.35], [.35, -.35], [-.35, .35], [.35, .35]]) B.box(X0 - .8 + dx, .1, -9.2 + dz, .06, 1.6, .06, { mat: 'mo_trim', collide: false });
    B.box(X0 - .8, 1.7, -9.2, .8, .06, .7, { mat: 'mo_trim', collide: false }); B.box(X0 - .8, 1.76, -8.9, .8, .5, .06, { mat: 'mo_trim', collide: false });
    B.collider({ cx: X0 - .8, cy: .9, cz: -9.2, hx: .4, hy: .9, hz: .4, surf: 'wood' });
    // pump house (low flat roof: up from the condenser beside it)
    B.wall(2.2, 3.2, 7.2, 3.2, { h: 2.05, t: .2, mat: 'mo_block', mat2: 'mo_block', openings: [{ at: 2.4, w: .95, h: 2, frame: 'mo_trim' }] });
    B.wall(2.2, 7.6, 7.2, 7.6, { h: 2.05, t: .2, mat: 'mo_block', mat2: 'mo_block' });
    B.wall(2.3, 3.3, 2.3, 7.5, { h: 2.05, t: .2, mat: 'mo_block', mat2: 'mo_block' });
    B.wall(7.1, 3.3, 7.1, 7.5, { h: 2.05, t: .2, mat: 'mo_block', mat2: 'mo_block' });
    B.box(4.7, 2.03, 5.4, 5.3, .12, 4.8, { mat: 'mo_roof', mats: { b: 'plywood' } });
    B.box(4.7, 2.15, 3.02, 5.3, .08, .06, { mat: 'mo_trim', collide: false }); B.box(4.7, 2.15, 7.78, 5.3, .08, .06, { mat: 'mo_trim', collide: false });
    B.prop('ac_unit', 1.05, 0, 3.9, { variant: 'condenser', ry: -H });
    B.prop('pallet', 1.75, 0, 6.3, { stack: 8, variant: 'none', ry: H, collide: false }); B.collider({ cx: 1.75, cy: .54, cz: 6.3, hx: .42, hy: .54, hz: .62, surf: 'wood' });
    B.prop('pipe', 4.7, 0, 5.4, { variant: 'grey', len: 3, d: .14, h: .2, ry: H }); B.prop('drum', 3, 0, 4.2, { variant: 'blue' }); B.prop('drum', 6.4, 0, 6.8, { variant: 'white', n: 2 });
    B.prop('gas_cylinder', 6.6, 0, 4, { variant: 'co2' });
    for (const [x, z] of [[-23, 7], [-23, -15], [7, -15]]) B.prop('planter', x, 0, z, { len: 1.2 });
    decal(B, 'stain', 'leaves', -20, .015, -10, 3, 3, {}); decal(B, 'stain', 'dust', 0, .016, 5, 4, 4, {}); decal(B, 'stain', 'crack', -6, .015, -12, 3, 3, {}); decal(B, 'stain', 'leaves', 4, .015, -2, 2.4, 2.4, {});
  },

  // ================================================================== the two wings
  wings(B) {
    // north wing: 14 modules from x -26 to 30, front at z 22 facing the lot; breezeway at module 5 (x -6..-2)
    const lit = (i, f) => [0, 1, 0, 2, 0, 0, 1, 0, 3, 0, 1, 0, 0, 2][(i * 3 + f * 5) % 14];
    // local frame: origin (-26, 22), local +x = world +x, local -z (front) = world -z
    B.push(-26, 0, 22, 0);
    wing(B, { n: 14, num: [101, 201], breeze: 5, open: { g: [3, 9], u: [3, 10] }, rear: [3, 9], lit, seed: 5,
      gaps: [[-1, .02], [18.4, 20.05]], gable1: true });
    B.pop();
    // east wing: 10 modules running south from z 14 (local +x = world -z), front at x 32 facing west
    B.push(32, 0, 14, H);
    wing(B, { n: 10, num: [114, 215], open: { g: [3] }, lit: (i, f) => [2, 0, 1, 0, 0, 3, 0, 1, 0, 2][(i + f * 3) % 10], seed: 9,
      gable0: false, stucco: 'mo_stucco_rose', gaps: [], posts0: false });
    B.pop();
    // stairs: west gable, mid (in front of the north wing walkway), south gable of the east wing, alley -> corner balcony
    B.castOn = true;
    const stair = o => B.stairs(Object.assign({ w: 1.4, y0: 0, y1: Y1, mat: 'concrete', tread: 'concrete_floor', railMat: 'paint_black' }, o));
    stair({ x: -26.75, z: 26.8, len: 6.4, dir: '-z', rail: 'right' });
    B.floor(-27.6, 19.5, -26, 23.6, Y1, { t: .25, mat: 'concrete_floor', mats: { b: 'plaster_white' } });
    rail(B, -27.6, 19.55, -26.05, 19.55, Y1, { bars: true }); rail(B, -27.55, 19.5, -27.55, 23.6, Y1, { bars: true });
    for (const [x, z] of [[-27.5, 19.6], [-27.5, 23.5]]) B.box(x, 0, z, .12, Y1 - .25, .12, { mat: 'mo_trim', surf: 'metal' });
    stair({ x: -3.25, z: 18.85, w: 1.3, len: 5.5, dir: '-x', rail: true });
    B.floor(-7.6, 18.2, -6, 19.5, Y1, { t: .25, mat: 'concrete_floor', mats: { b: 'plaster_white' } });
    rail(B, -7.6, 18.25, -6, 18.25, Y1, { bars: true }); rail(B, -7.55, 18.2, -7.55, 19.5, Y1, { bars: true });
    B.box(-7.5, 0, 18.3, .12, Y1 - .25, .12, { mat: 'mo_trim', surf: 'metal' });
    stair({ x: 35.4, z: -26.75, len: 6.4, dir: '-x', rail: 'left' });
    B.floor(29.5, -27.6, 32.25, -25.95, Y1, { t: .25, mat: 'concrete_floor', mats: { b: 'plaster_white' } });
    rail(B, 29.5, -27.55, 32.2, -27.55, Y1, { bars: true }); rail(B, 29.55, -27.6, 29.55, -25.95, Y1, { bars: true });
    for (const [x, z] of [[29.6, -27.5], [32.1, -27.5]]) B.box(x, 0, z, .12, Y1 - .25, .12, { mat: 'mo_trim', surf: 'metal' });
    stair({ x: 35.4, z: 34.75, len: 6.4, dir: '-x', rail: 'right' });
    // corner balcony (over the ground passage x 30..32 to the alley) and the corner roof
    B.floor(29.5, 13.95, 32, 19.5, Y1, { t: .25, mat: 'concrete_floor', mats: { b: 'plaster_white' } });
    B.floor(29.95, 19.5, 32, 35.6, Y1, { t: .25, mat: 'concrete_floor', mats: { b: 'plaster_white' } });
    B.floor(32, 34, 32.25, 35.6, Y1, { t: .25, mat: 'concrete_floor' });
    rail(B, 29.55, 13.95, 29.55, 19.5, Y1, { bars: true });
    rail(B, 30.0, 32, 30.0, 35.55, Y1, { bars: true }); rail(B, 29.95, 35.55, 32.2, 35.55, Y1, { bars: true });
    B.box(30.1, 0, 35.45, .12, Y1 - .25, .12, { mat: 'mo_trim', surf: 'metal' });
    B.floor(29.25, 13.95, 32, 19.25, 6.2, { t: .25, mat: 'mo_roof', mats: { b: 'plaster_white' } });
    B.floor(29.95, 19.25, 32, 34, 6.2, { t: .25, mat: 'mo_roof', mats: { b: 'plaster_white' } });
    B.box(30.9, 0, 32.2, .12, Y1 - .25, .12, { mat: 'mo_trim', surf: 'metal' });
    B.floor(30, 22, 32, 34, GF, { mat: 'concrete_floor', t: GF });
    B.castOn = false;
    B.box(31, 2.6, 22.05, 2, .25, .1, { mat: 'mo_trim', collide: false });
    // walkway life: housekeeping carts (they also break the long balcony sightlines), chairs outside doors, potted plants
    const cart = (x, y, z, ry) => { B.push(x, y, z, ry); B.box(0, .12, 0, 1.25, .85, .55, { mat: 'mo_trim', surf: 'metal' }); B.box(0, .97, 0, 1.2, .3, .5, { mat: 'p_fab_white', collide: false });
      B.box(-.75, .12, 0, .25, .7, .5, { mat: 'p_bag_black', collide: false }); for (const dx of [-.5, .5]) B.cyl(dx, 0, 0, .06, .12, { mat: 'rubber', sides: 8, collide: false }); B.pop(); };
    cart(31.25, Y1, -5.5, H); cart(6.5, Y1, 21.35, 0); cart(31.3, 0.15, 6.5, H);
    for (const [x, z, ry] of [[-19.4, 21.3, 2.9], [-18.8, 21.4, -2.8], [2.6, 21.3, PI], [18.6, 21.2, 2.6], [31.3, -15.4, -H + .3], [31.2, -1.6, -H]]) B.prop('chair', x, GF, z, { variant: 'plastic', ry });
    for (const [x, y, z] of [[-25.4, GF, 21.4], [29.4, GF, 21.4], [-25.4, Y1, 21.5], [31.4, Y1, 13.2], [31.4, GF, -25.4]]) { B.cyl(x, y, z, .28, .45, { mat: 'p_concrete_precast', sides: 10 }); B.prop('bush', x, y + .4, z, { variant: 'small', s: .35, collide: false }); }
    // painted gable signs (east wing south gable faces the highway, north wing west gable faces the diner)
    decal(B, 'sign', 'vac', 37, 4.6, -26.03, 8.6, .8, { face: 's' });
    decal(B, 'sign', 'guests', 37, 2.1, -26.03, 3.2, .3, { face: 's' });
    decal(B, 'sign', 'checkout', -26.03, 4.8, 28, 3, .3, { face: 'w' });
    decal(B, 'stain', 'grime', 37, .4, -26.04, 9, 1.2, { face: 's' }); decal(B, 'stain', 'water', 33, 3.6, -26.04, 1.2, 2.4, { face: 's' });
    decal(B, 'stain', 'water', 30.05, 1.2, 28, 1.2, 2.2, { face: 'e' });
  },

  // ================================================================== office block (SITE B upstairs)
  office(B) {
    const x0 = 32, x1 = 46, z0 = 14, z1 = 34, h = 6.6, T = .25;
    const st = 'mo_stucco_rose';
    // ground floors
    B.floor(x0 + T, z0 + T, 42, 26, GF, { mat: 'mo_terrazzo', t: GF });
    B.floor(42, z0 + T, x1 - T, 26, GF, { mat: 'mo_carpet', t: GF });
    B.floor(x0 + T, 26, x1 - T, z1 - T, GF, { mat: 'tile_floor', t: GF });
    // shell (openings: ground lobby door + window, passage door; upper room 225 door + window, hall door)
    B.castOn = true;
    B.wall(x0, z0 + T / 2, x1, z0 + T / 2, { h, t: T, mat: 'mo_wall', mat2: st, matEnd: st });
    swall(B, x0, z1 - T / 2, x1, z1 - T / 2, { h, t: T, mat: st, mat2: 'mo_wall', matEnd: st,
      openings: [{ at: 10, w: 1.0, h: 2.15, y: GF }, { at: 12, w: 1.2, h: 1.1, y: 4.1 }, { at: 4, w: 1.2, h: 1.1, y: 4.1 }] });
    swall(B, x0 + T / 2, z0 + T, x0 + T / 2, z1 - T, { h, t: T, mat: st, mat2: 'mo_wall', matEnd: st,
      openings: [{ at: 3.75, w: 1.3, h: 2.25, y: GF }, { at: 8.25, w: 3, h: 1.4, y: 1.0 }, { at: 15.75, w: 1.06, h: 2.2, y: GF },
        { at: 2.75, w: 1.06, h: 2.2, y: Y1 }, { at: 6.25, w: 1.5, h: 1.15, y: 4.0 }, { at: 16.75, w: 1.06, h: 2.2, y: Y1 }] });
    swall(B, x1 - T / 2, z0 + T, x1 - T / 2, z1 - T, { h, t: T, mat: 'mo_wall', mat2: st, matEnd: st,
      openings: [{ at: 5.75, w: 1.2, h: 1.1, y: 1.1 }, { at: 3.75, w: 1.4, h: 1.15, y: 4.0 }, { at: 7.75, w: 1.4, h: 1.15, y: 4.0 }] });
    B.castOn = false;
    // glazing and doors (wall along z: frame turned so local x runs along -z... use a frame per face)
    B.push(x0 + T / 2, 0, 0, H);   // west face: local x = world -z, local -z = world -x (outside)
    win(B, -22.5, 1.0, 0, 3, 1.4, { mull: true }); win(B, -20.5, 4.0, 0, 1.5, 1.15, { mull: true });
    door(B, -18, GF, 0, { w: 1.1, h: 2.2, open: 100, mat: 'glass', nocollide: true, side: 1, frame: 'p_chrome' });
    door(B, -30, GF, 0, { open: 100, mat: 'mo_teal', side: 1, nocollide: true });
    door(B, -17, Y1, 0, { open: 95, mat: 'mo_teal', side: 1, nocollide: true });
    door(B, -31, Y1, 0, { open: 105, mat: 'mo_teal', side: 1, nocollide: true });
    decal(B, 'sign', 'r225', -17.78, Y1 + 1.62, -.14, .34, .1, { face: 's' });
    B.pop();
    B.push(x1 - T / 2, 0, 0, -H);  // east face: local x = world z, local -z = world +x (outside)
    win(B, 18, 4.0, 0, 1.4, 1.15); win(B, 22, 4.0, 0, 1.4, 1.15); win(B, 20, 1.1, 0, 1.2, 1.1);
    B.pop();
    B.push(0, 0, z1 - T / 2, PI); win(B, -44, 4.1, 0, 1.2, 1.1); win(B, -36, 4.1, 0, 1.2, 1.1); B.pop();
    B.push(42, GF, z1 - T / 2, PI); door(B, 0, 0, 0, { open: 0, mat: 'p_coat_slate', side: 1 }); B.pop();
    // slabs: upper floor around the stair void, roof
    B.castOn = true;
    B.floor(x0 + T, z0 + T, x1 - T, 32.3, Y1, { t: .25, mat: 'concrete_floor', mats: { b: 'ceiling_tile' } });
    B.floor(x0 + T, 32.3, 34.5, z1 - T, Y1, { t: .25, mat: 'concrete_floor', mats: { b: 'ceiling_tile' } });
    B.floor(40, 32.3, x1 - T, z1 - T, Y1, { t: .25, mat: 'concrete_floor', mats: { b: 'ceiling_tile' } });
    B.floor(x0 + T, z0 + T, x1 - T, z1 - T, 6.2, { t: .25, mat: 'mo_roof', mats: { b: 'ceiling_tile' } });
    B.box(39, 6.2, z0 - .05, 14.1, .4, .1, { mat: 'mo_trim', collide: false });
    B.castOn = false;
    B.stairs({ x: 37.25, z: 33.0, w: 1.4, len: 5.5, y0: GF, y1: Y1, dir: '-x', mat: 'wood_dark', tread: 'mo_carpet', rail: 'left', railMat: 'wood_dark' });
    B.box(37.25, Y1, 32.05, 5.5, 1.0, .5, { mat: 'mo_panel', mats: { t: 'p_wood_walnut' }, surf: 'wood' });   // solid balustrade (the navgrid would mantle over a thin rail)
    B.box(37.25, Y1 - .3, 32.05, 5.5, .3, .5, { mat: 'mo_wall', collide: false }); rail(B, 40.05, 32.3, 40.05, z1 - T, Y1, { mat: 'wood_dark', bars: true });
    // ground interior: lobby | manager's office, stair hall behind
    const gi = { y: GF, h: 2.85 - GF + .05, t: .15 };
    B.wall(x0 + T, 26, x1 - T, 26, { ...gi, mat: 'mo_wall', mat2: 'mo_panel', openings: [{ at: 3.75, w: 1.0, h: 2.1, frame: 'wood_dark' }, { at: 11.75, w: 1.0, h: 2.1, frame: 'wood_dark' }] });
    B.wall(42, z0 + T, 42, 25.93, { ...gi, mat: 'mo_panel', mat2: 'mo_wall', openings: [{ at: 8.75, w: .95, h: 2.1, frame: 'wood_dark' }] });
    // upper interior: room 225 (x 32..40, z 14..24), hall (z 24..34), the manager's flat (x 40..46)
    const ui = { y: Y1, h: 5.95 - Y1 + .05, t: .15 };
    B.wall(x0 + T, 24, 39.93, 24, { ...ui, mat: 'mo_wall', mat2: 'mo_wall', openings: [{ at: 3.75, w: 1.0, h: 2.1, frame: 'mo_trim' }] });
    B.wall(40, z0 + T, 40, z1 - T, { ...ui, mat: 'plaster_white', mat2: 'mo_wall', openings: [{ at: 4.75, w: 1.6, h: 2.15, frame: false }, { at: 10.75, w: 1.0, h: 2.1, frame: 'mo_trim' }] });
    B.wall(40.08, 26, x1 - T, 26, { ...ui, mat: 'plaster_white', mat2: 'plaster_white', openings: [{ at: 2.9, w: 1.0, h: 2.1, frame: 'mo_trim' }] });
    B.box(x0 + 4, Y1, 19, 7.5, .012, 9.5, { mat: 'mo_carpet', collide: false, cast: false });
    B.box(36.1, Y1, 28.15, 7.6, .012, 7.7, { mat: 'mo_carpet', collide: false, cast: false });
    B.box(43, Y1, 29.9, 5.5, .012, 7.6, { mat: 'carpet', collide: false, cast: false });
    B.prop('rug', 36.5, Y1 + .015, 28.5, { variant: 'blue', w: 1.4, d: 3.2 });
    B.box(32.5, Y1, 27.2, .4, .85, 1.6, { mat: 'p_wood_walnut' }); B.prop('poster', 32.27, Y1 + 1.3, 29.5, { i: 4, ry: H });
    B.prop('poster', 39.9, Y1 + 1.2, 29.8, { i: 0, ry: -H });
    B.box(43, Y1, 20, 5.5, .012, 11.5, { mat: 'wood_floor', collide: false, cast: false });
    // the smashed connecting door: leaf on the floor, splinters
    B.box(39.2, Y1 + .02, 19.6, .95, .05, 2.05, { mat: 'mo_teal', ry: .35, collide: false });
    decal(B, 'stain', 'dust', 39.6, Y1 + .02, 19, 2.4, 2.4, {});
    // lobby: reception counter, key board, waiting chairs, brochure rack, ice machine, TV; manager's office
    B.box(39, GF, 18.3, .8, 1.1, 6.2, { mat: 'mo_panel', mats: { t: 'p_wood_walnut' } });
    B.box(39, GF + 1.1, 18.3, 1.0, .05, 6.4, { mat: 'p_wood_walnut', collide: false });
    B.box(41.9, 1.2, 18, .05, .9, 1.4, { mat: 'p_wood_walnut', collide: false });
    for (let k = 0; k < 18; k++) B.box(41.86, 1.3 + Math.floor(k / 6) * .26, 17.45 + (k % 6) * .22, .02, .07, .04, { mat: 'p_chrome', collide: false, cast: false });
    B.prop('monitor', 39, GF + 1.15, 17, { ry: -H }); B.box(39.1, GF + 1.15, 19.6, .3, .1, .22, { mat: 'paint_black', collide: false });
    B.prop('office_chair', 40.6, GF, 18, { ry: -H });
    for (const z of [15.2, 16.1]) B.prop('armchair', 33, GF, z, { variant: 'teal', ry: H });
    B.prop('coffee_table', 34.1, GF, 15.7, { variant: 'wood', ry: H });
    B.prop('vending_machine', 33.4, GF, 25.4, { variant: 'drinks', ry: PI });
    B.box(34.8, GF, 25.6, .9, 1.4, .35, { mat: 'p_wood_walnut' }); B.box(34.8, GF + .4, 25.4, .8, .9, .02, { mat: 'p_fab_red', collide: false, cast: false });
    B.prop('tv', 41.7, 2.0, 22.5, { wall: true, ry: -H, on: true });
    B.prop('poster', 32.27, 1.2, 16.2, { i: 1, ry: H }); B.prop('wall_clock', 41.9, 2.45, 16, { ry: -H });
    B.prop('rug', 35.5, GF + .01, 19.5, { variant: 'red', w: 2.6, d: 3.4 });
    decal(B, 'sign', 'checkout', 41.9, 2.1, 19.6, 1.2, .14, { face: 'w' });
    B.prop('desk', 44.4, GF, 18.2, { variant: 'metal', ry: -H }); B.prop('office_chair', 43.4, GF, 18.2, { ry: H });
    B.prop('filing_cabinet', 45.4, GF, 24.8, { ry: -H, color: 'beige' }); B.prop('filing_cabinet', 45.4, GF, 24.3, { ry: -H, color: 'beige', open: 1 });
    B.box(45.2, GF, 15.2, .8, 1.0, .7, { mat: 'p_coat_slate', surf: 'metal' });                                  // the safe
    B.prop('wardrobe', 43, GF, 25.3, { ry: PI, variant: 'standard' });
    decal(B, 'sign', 'manager', 42.08, 2.25, 23.25, .8, .1, { face: 'w' });
    // stair hall: linen carts, shelving, mop sink
    B.prop('shelf_unit', 45.4, GF, 29, { ry: -H, variant: 'grey', w: 1.2 }); B.prop('shelf_unit', 45.4, GF, 30.3, { ry: -H, variant: 'grey', w: 1.2 });
    B.box(43.6, GF, 27.4, 1.0, .9, .6, { mat: 'p_fab_white' }); B.box(43.6, GF + .9, 27.4, 1.0, .05, .6, { mat: 'p_chrome', collide: false });
    B.box(33, GF, 27.5, .7, .9, .5, { mat: 'p_porcelain' });
    B.prop('trash_bag', 44.2, GF, 32.6, { n: 3 });
    // upper: room 225 (two beds, couch, the TV dresser), the flat (sofa, kitchenette, table), the hall
    B.prop('bed', 37.6, Y1, 16.2, { variant: 'single', ry: -H, color: 'grey' }); B.prop('bed', 37.6, Y1, 19.8, { variant: 'single', ry: -H, color: 'grey' });
    B.box(39.5, Y1, 18, .42, .55, .45, { mat: 'p_wood_walnut' });
    B.box(32.7, Y1, 19, .45, .8, 1.6, { mat: 'p_wood_walnut' }); B.prop('tv', 32.75, Y1 + .8, 19, { ry: H, on: true });
    B.prop('sofa', 32.95, Y1, 22.65, { variant: 'mustard', ry: H }); B.prop('coffee_table', 34.2, Y1, 22.65, { variant: 'glass', ry: H });
    B.box(34.2, Y1, 15.2, 1.6, 1.8, .25, { mat: 'p_mattress', ry: .25 });                                         // mattress against the wall
    B.prop('cardboard_box', 33.3, Y1, 21.5, { variant: 'large', stack: 2 }); B.prop('curtain', 32.3, Y1, 20.5, { ry: H, w: 1.9, variant: 'mustard', open: .5 });
    B.prop('sofa', 43, Y1, 15, { variant: 'brown' }); B.prop('armchair', 45, Y1, 17.5, { variant: 'brown', ry: -H });
    B.prop('coffee_table', 43, Y1, 16.6, { variant: 'wood' }); B.prop('bookshelf', 45.6, Y1, 21, { ry: -H, variant: 'walnut' });
    B.prop('kitchen_counter', 44.6, Y1, 25.55, { ry: PI, len: 2.2, variant: 'wood', hob: 1 }); B.prop('fridge', 41.5, Y1, 25.45, { ry: PI, variant: 'white' });
    B.prop('dining_table', 42.6, Y1, 21.6, { variant: 'set', chairs: 2, w: 1.2, ry: H });
    B.prop('bed', 43.5, Y1, 31.3, { variant: 'double', color: 'blue', ry: PI }); B.prop('wardrobe', 41, Y1, 27, { ry: 0 });
    B.prop('cardboard_box', 44.8, Y1, 27.3, { variant: 'pile', n: 4 });
    B.prop('crate_plastic', 36, Y1, 26, { variant: 'blue', n: 3 }); B.prop('cardboard_box', 38.6, Y1, 25.2, { variant: 'medium', stack: 2 });
    B.box(37.2, Y1, 28.6, 1.1, 1.05, .6, { mat: 'p_fab_white' }); B.box(37.2, Y1 + 1.05, 28.6, 1.1, .05, .6, { mat: 'p_chrome', collide: false });
    for (const [x, z] of [[36, 19], [43, 20], [36, 29], [43, 30]]) B.box(x, 5.93, z, .5, .02, .5, { mat: 'emissive_warm', collide: false, cast: false });
    B.box(36.5, 2.83, 20, 1.2, .02, .3, { mat: 'emissive_white', collide: false, cast: false });
    B.box(44, 2.83, 20, .6, .02, .6, { mat: 'emissive_warm', collide: false, cast: false });
    B.box(39, 2.83, 30, 1.2, .02, .3, { mat: 'emissive_white', collide: false, cast: false });
    // OFFICE neon over the door, VACANCY plate, the drive-up canopy sign
    decal(B, 'glow', 'office', x0 - .02, 2.75, 18.5, 2.2, .45, { face: 'w' });
    decal(B, 'sign', 'office', x0 - .02, 2.35, 18.5, 1.6, .16, { face: 'w' });
    decal(B, 'sign', 'vac', x0 - .02, 5.75, 24, 3.2, .3, { face: 'w' });
    B.prop('ac_unit', 38, 6.2, 22, { variant: 'hvac' }); B.prop('vent', 43, 6.2, 30, { variant: 'mushroom' });
    decal(B, 'stain', 'grime', 39, .5, z1 + .02, 10, 1.0, { face: 'n' });
  },

  // ================================================================== service alley
  alley(B) {
    // north wall (block) with the laundry in it, east end wall
    B.castOn = true;
    const bw = { h: 2.4, t: .25, mat: 'mo_block', mat2: 'mo_block' };
    B.wall(-62.5, 44.125, -12, 44.125, bw); B.wall(4, 44.125, 46.4, 44.125, bw);
    B.wall(46.25, 34.25, 46.25, 44, bw);
    B.castOn = false;
    for (let x = -60; x < 46; x += 6) if (x < -13 || x > 5) B.box(x, 2.4, 44.125, .32, .08, .32, { mat: 'concrete', collide: false });
    // dumpsters, enclosure, condensers, meters, the maintenance pickup, utility poles
    B.wall(-33, 38.2, -33, 42.5, { h: 1.8, t: .2, mat: 'mo_block', mat2: 'mo_block' }); B.wall(-28.6, 38.2, -28.6, 42.5, { h: 1.8, t: .2, mat: 'mo_block', mat2: 'mo_block' });
    B.wall(-33.1, 42.6, -28.5, 42.6, { h: 1.8, t: .2, mat: 'mo_block', mat2: 'mo_block' });
    B.prop('dumpster', -31.9, 0, 41.3, { variant: 'green', hide: true }); B.prop('dumpster', -29.8, 0, 41.3, { variant: 'maroon', lid: 'open' });
    B.prop('dumpster', -18.5, 0, 43, { variant: 'blue', hide: true });
    B.prop('dumpster', 17, 0, 43, { variant: 'green' });
    B.prop('car', 22, 0, 38.6, { variant: 'pickup', color: 'white', ry: H + .05, hide: true });
    B.prop('trash_bag', -16.5, 0, 43.1, { n: 5 }); B.prop('trash_bag', 19.2, 0, 43.2, { n: 3 });
    B.prop('pallet', -24, 0, 43.4, { stack: 3, variant: 'none' }); B.prop('pallet', 9, 0, 43.4, { stack: 5, variant: 'none', ry: .2 });
    B.box(-38.5, 0, 43.4, 1.95, 2.0, .3, { mat: 'p_mattress', ry: -.1 }); B.box(-36.6, 0, 43.3, 1.4, 1.95, .28, { mat: 'p_mattress', ry: .08 });
    B.prop('gas_cylinder', 27, 0, 43.4, { variant: 'propane', rack: true });
    B.prop('tank', 37, 0, 41.5, { variant: 'horizontal', r: .75, len: 3.2 });
    B.prop('wheelie_bin', -2.5, 0, 33, { variant: 'green' }); B.prop('wheelie_bin', -1.6, 0, 33, { variant: 'black' });
    B.prop('utility_pole', -40, 0, 45.2, { variant: 'wood', h: 9, span: 32 });
    B.prop('utility_pole', -8, 0, 54.8, { variant: 'transformer', h: 9.5, span: 30 });
    B.prop('utility_pole', 22, 0, 45.2, { variant: 'wood', h: 9, span: 30 });
    for (const x of [-22, -10, 2, 14, 26]) { B.box(x, 1.2, 32.08, .35, .5, .16, { mat: 'p_coat_slate', collide: false }); B.cyl(x, 1.3, 32.17, .06, .05, { mat: 'glass', sides: 8, collide: false, cast: false }); }
    B.box(-5.5, 0, 32.4, .6, 1.6, .55, { mat: 'p_enamel_white' });
    for (const [x, z, s] of [[-20, 38, 'oil0'], [6, 37, 'patch'], [-44, 39, 'crack'], [30, 38, 'oil1'], [-30, 36, 'tyre'], [12, 40, 'litter'], [-16, 41.5, 'litter']])
      decal(B, 'stain', s, x, .015, z, s === 'tyre' ? 6 : 3, s === 'tyre' ? 1.6 : 3, { ry: x });
    for (let x = -24; x < 30; x += 9) decal(B, 'stain', 'grime', x, .5, 32.02, 8, 1, { face: 'n' });
    decal(B, 'stain', 'sand', -50, .016, 43, 8, 2, {}); decal(B, 'stain', 'sand', 36, .016, 43.4, 8, 1.5, {});
  },

  // ================================================================== T2 lobby: laundry
  laundry(B) {
    const x0 = -12, x1 = 4, z0 = 44, z1 = 54, h = 3.6;
    B.castOn = true;
    B.wall(x0, z0 + .125, x1, z0 + .125, { h, t: .25, mat: 'plaster_white', mat2: 'mo_stucco_sand', matEnd: 'mo_stucco_sand',
      openings: [{ at: 4, w: 2.6, h: 2.6 }, { at: 12, w: 2.6, h: 2.6 }, { at: 8, w: .9, h: .6, y: 1.8 }] });
    B.wall(x0, z1 - .125, x1, z1 - .125, { h, t: .25, mat: 'mo_stucco_sand', mat2: 'plaster_white', matEnd: 'mo_stucco_sand' });
    B.wall(x0 + .125, z0 + .25, x0 + .125, z1 - .25, { h, t: .25, mat: 'mo_stucco_sand', mat2: 'plaster_white', matEnd: 'mo_stucco_sand' });
    B.wall(x1 - .125, z0 + .25, x1 - .125, z1 - .25, { h, t: .25, mat: 'plaster_white', mat2: 'mo_stucco_sand', matEnd: 'mo_stucco_sand' });
    B.floor(x0 + .25, z0 + .25, x1 - .25, z1 - .25, 3.3, { t: .25, mat: 'mo_roof', mats: { b: 'plaster_white' } });
    B.castOn = false;
    B.box(-4, 0, 44.04, .9, .6, .02, { mat: 'glass_frosted', collide: false, cast: false });
    B.box(-4, 1.8, 44.12, .95, .6, .02, { mat: 'glass_frosted', collide: false, cast: false });
    decal(B, 'sign', 'laundry', -4, 2.85, z0 - .02, 2.6, .24, { face: 's' });
    // washers and dryers along the north wall, folding table, carts, shelves, boiler
    const machine = (x, y, front) => {
      B.box(x, y, 53.35, .7, .85, .75, { mat: 'p_enamel_white', surf: 'metal' });
      B.cyl(x, y + .42, 52.97, .22, .01, { mat: front, sides: 16, collide: false, cast: false });
      B.box(x, y + .78, 52.97, .6, .05, .01, { mat: 'p_coat_slate', collide: false, cast: false });
    };
    for (let k = 0; k < 8; k++) { const x = -11.2 + k * .78; machine(x, 0, 'glass'); }
    for (let k = 0; k < 6; k++) { const x = -3.8 + k * .78; machine(x, 0, 'p_glass_dark'); machine(x, .85, 'p_glass_dark'); }
    B.box(2.8, 0, 50, 1.6, .9, .8, { mat: 'p_stainless', surf: 'metal', ry: H });
    for (const [x, z] of [[-11.2, 47], [3.2, 46.2]]) { B.box(x, 0, z, .6, .9, 1.0, { mat: 'p_fab_white' }); B.box(x, .9, z, .6, .05, 1.0, { mat: 'p_chrome', collide: false }); }
    B.prop('shelf_unit', -11.5, 0, 50.4, { ry: H, variant: 'grey', w: 1.2 });
    B.prop('gas_cylinder', 3.4, 0, 52.6, { variant: 'nitrogen' });
    B.cyl(2.9, 0, 52.9, .4, 1.8, { mat: 'p_enamel_white', sides: 12 });
    B.prop('poster', -6, 1.3, 53.74, { variant: 'flyer', ry: PI }); B.prop('fire_extinguisher', 3.75, 0, 47, { ry: -H });
    // south wall between the gates: change machine, notice board, detergent shelf, a bench
    B.box(-4, 0, 44.55, .5, 1.5, .35, { mat: 'p_stainless', surf: 'metal' }); B.box(-4, 1.05, 44.73, .3, .2, .01, { mat: 'mo_neon_green', collide: false });
    B.box(-5.6, 1.2, 44.27, 1.0, .7, .03, { mat: 'p_wood_light', collide: false }); B.prop('poster', -5.85, 1.25, 44.3, { variant: 'flyer', i: 3 }); B.prop('poster', -5.35, 1.3, 44.3, { variant: 'flyer', i: 5 });
    B.prop('shelf_unit', -2.2, 0, 44.55, { variant: 'grey', w: 1.2 });
    B.prop('shelf_unit', -11.5, 0, 45.4, { ry: H, variant: 'grey', w: 1.2 });
    for (const [x, z] of [[-11.4, 52], [3.4, 49]]) B.prop('cardboard_box', x, 0, z, { variant: 'small', stack: 3 });
    B.box(-4, 3.04, 49, 12, .06, .1, { mat: 'p_galv', collide: false }); B.box(-4, 2.6, 52.9, 15, .1, .1, { mat: 'p_galv', collide: false });
    for (let k = 0; k < 6; k++) B.cyl(-10 + k * 2.6, 2.75, 52.9, .07, .55, { mat: 'p_galv', sides: 8, collide: false });
    decal(B, 'stain', 'water', -7, .016, 52, 6, 1.5, {}); decal(B, 'stain', 'dust', 0, .016, 47, 3, 3, {});
  },

  // ================================================================== west yard
  westYard(B) {
    B.prop('box_truck', -46, 0, 14, { variant: 'logo', color: 'white', ry: .25, hide: true });
    B.prop('car', -57.5, 0, 30, { variant: 'pickup', color: 'orange', state: 'wreck', ry: 1.25, hide: true });
    B.prop('boat', -38, .55, 30, { variant: 'white', ry: -.6 });
    B.box(-38, 0, 30, 1.2, .55, 3.6, { mat: 'p_rail', ry: -.6 });
    B.prop('tank', -54, 0, 40.5, { variant: 'horizontal', r: .9, len: 4 });
    B.prop('grass_tall', -58.5, 0, 20, { variant: 'dry', w: 5, d: 7, hide: true }); B.prop('grass_tall', -40, 0, 38.5, { variant: 'dry', w: 4, d: 3 });
    B.prop('grass_tall', -31, 0, 5, { variant: 'dry', w: 3, d: 3, h: .8 });
    B.prop('tree', -60, 0, 8, { variant: 'dead', h: 7 }); B.prop('tree', -33, 0, 21, { variant: 'dead', h: 6 });
    B.prop('rock', -52, 0, 24, { variant: 'medium', red: true }); B.prop('rock', -44, 0, 26, { variant: 'small', red: true }); B.prop('rock', -60.5, 0, 36, { variant: 'cluster', red: true });
    B.prop('bush', -36, 0, 9, { variant: 'shrub' }); B.prop('bush', -61, 0, 13, { variant: 'small' });
    B.prop('drum', -49, 0, 33, { variant: 'rust', n: 3, fallen: true }); 
    B.prop('pallet', -42, 0, 4, { stack: 2, variant: 'none', ry: .4 });
    // the old motel sign lying in the dirt
    B.box(-27.5, 0, 3, 5.2, .3, 1.8, { mat: 'mo_teal', ry: .35, mats: { t: 'p_burnt' } });
    for (const [x, z, s] of [[-48, 10, 'tyre'], [-40, 20, 'litter'], [-55, 28, 'oil0'], [-34, 30, 'leaves']]) decal(B, 'stain', s, x, .015, z, s === 'tyre' ? 6 : 3, s === 'tyre' ? 1.6 : 3, { ry: x });
  },

  // ================================================================== parking lot
  lot(B, R) {
    // kerbs along the highway (driveways open), planting islands
    for (const [a, b] of [[-34, -16], [-4, 4], [16, 29.5]]) B.box((a + b) / 2, 0, -47.1, b - a, .14, .22, { mat: 'concrete' });
    // bay lines: north row (nose to the rooms), east row, middle rows
    for (let x = -24; x <= 28; x += 3) if (x < -9 || x > 1) paint(B, x, 14.4, x, 19.2, { w: .1 });
    for (let z = -25; z <= 13; z += 3) paint(B, 24.4, z, 29.2, z, { w: .1 });
    for (const zr of [-35.5, -29.5]) for (let x = -12; x <= 12; x += 3) paint(B, x, zr - 2.5, x, zr + 2.5, { w: .1 });
    paint(B, -12, -32.5, 12, -32.5, { w: .1 });
    decal(B, 'sign', 'hcap', 26.8, .013, 11.5, 1.2, 1.2, { ry: H });
    decal(B, 'sign', 'stop', 10, .013, -44.5, 2.6, .5, { ry: PI }); decal(B, 'sign', 'stopbar', 10, .013, -45.4, .4, 5, { ry: H });
    decal(B, 'sign', 'arrow', 10, .013, -40, 1.2, 2.5, { ry: PI }); decal(B, 'sign', 'arrow', -46, .013, -45, 1.2, 2.5, {});
    for (let x = -9.5; x < 1.6; x += .8) paint(B, x, 14.5, x + 1.6, 19.1, { w: .12, col: YEL });
    decal(B, 'sign', 'xing', -4, .013, 16, 3, .5, { ry: PI });
    // cars: north row, east row, south lot, a moving van across bays
    const cars = [
      [-22.5, 16.6, 0, 'sedan', 'red'], [-13.5, 16.8, .03, 'hatch', 'white'], [4.5, 16.7, -.02, 'suv', 'grey'], [13.5, 16.6, 0, 'van', 'beige'], [22.5, 16.8, .04, 'sedan', 'navy'],
      [26.9, -20.5, H, 'pickup', 'red'], [26.8, -11.5, H + .03, 'sedan', 'silver'], [26.9, 4.5, H, 'hatch', 'green'],
      [-7.5, -35.4, PI - .05, 'sedan', 'black'], [4.5, -29.6, .02, 'suv', 'white'], [-10.4, -29.4, .1, 'hatch', 'yellow'],
    ];
    for (const [x, z, ry, v, c] of cars) B.prop('car', x, 0, z, { variant: v, color: c, ry, hide: v !== 'van' && R() < .6 });
    B.prop('box_truck', 18, 0, -27, { variant: 'plain', color: 'white', ry: H + .08, hide: true });
    for (const [x, z, s] of [[-22, 16.6, 'oil0'], [-16.5, 16.8, 'drip'], [7.5, 16.6, 'oil1'], [-1.5, 16.6, 'drip'], [26.8, -14.5, 'oil0'], [26.9, -2, 'drip'], [-4.5, -35.6, 'oil1'], [-1.5, -29.6, 'drip'], [16, -38, 'tyre'], [-20, -40, 'patch'], [-26, -20, 'crack'], [20, 0, 'crack'], [-30, 6, 'patch'], [12, -14, 'oil0']])
      decal(B, 'stain', s, x, .015, z, s === 'tyre' ? 7 : 2.8, s === 'tyre' ? 1.8 : 2.8, { ry: x * 1.7 });
    for (let x = -33; x < 29; x += 7) decal(B, 'stain', 'sand', x, .017, -46, 7, 1.8, {});
    for (const [x, z] of [[-30, -10], [24, -40], [-28, 14], [-30, -28]]) decal(B, 'stain', 'litter', x, .016, z, 2, 2, { ry: x });
    // street furniture
    B.prop('mailbox', -2, 0, -46.2, { variant: 'post', ry: PI }); B.prop('newspaper_box', 2.5, 0, -46.3, { variant: 'yellow', ry: PI });
    B.prop('road_sign', 17, 0, -46.6, { variant: 'speed50', ry: PI }); B.prop('road_sign', -35.2, 0, -46.6, { variant: 'stop', ry: PI });
    B.prop('litter_bin', -24.4, 0, 18.8, { variant: 'round' }); B.prop('litter_bin', 29, 0, -24, { variant: 'round' });
    B.prop('bench', 10, 0, -17.3, { variant: 'park', ry: PI }); B.prop('vending_machine', 28.95, 0, -27, { variant: 'drinks', ry: -H });
    B.prop('fire_hydrant', -26.6, 0, -18, { variant: 'red' }); B.prop('fire_hydrant', 29, 0, 9.2, { variant: 'yellow' });
    decal(B, 'sign', 'guests', 29.36, 2.4, -16, 2.8, .26, { face: 'w', ry: 0 });
    B.prop('planter', -27, 0, -12, { len: 2 }); B.prop('planter', 12, 0, -22, { len: 2 });
    B.prop('bush', -30.5, 0, -16, { variant: 'shrub' }); B.prop('bush', 27.5, 0, -45.9, { variant: 'small' });
    B.prop('wheelie_bin', 28.9, 0, 12.4, { variant: 'grey', ry: -H }); B.prop('wheelie_bin', 28.9, 0, 11.6, { variant: 'green', ry: -H });
  },

  // ================================================================== fences around the playable area
  perimeter(B) {
    const fence = (x0, z0, x1, z1, v = 'barbed') => {
      const L = Math.hypot(x1 - x0, z1 - z0), ry = Math.atan2(-(z1 - z0), x1 - x0);
      B.prop('fence_chainlink', (x0 + x1) / 2, 0, (z0 + z1) / 2, { ry, len: L, variant: v, h: 2.2 });
    };
    fence(-62.6, -75.8, 21.9, -75.8); fence(46.1, -75.8, 50.6, -75.8);
    fence(-62.6, -75.8, -62.6, 44); fence(50.6, -75.8, 50.6, -27.9);
    B.castOn = true;
    const bw = { h: 2.4, t: .25, mat: 'mo_block', mat2: 'mo_block' };
    B.wall(41.9, -27.9, 50.6, -27.9, bw); B.wall(41.875, -26, 41.875, -27.78, bw); B.wall(46, 14.1, 50.6, 14.1, bw);
    B.castOn = false;
    // desert scrub against the fences
    for (const [x, z, v] of [[-61, -70, 'shrub'], [-40, -73.5, 'small'], [-10, -74, 'shrub'], [8, -73.6, 'small'], [49, -70, 'small'], [-61.4, -20, 'small'], [-61.2, -3, 'shrub']])
      B.prop('bush', x, 0, z, { variant: v });
    B.prop('grass_tall', -25, 0, -71, { variant: 'dry', w: 8, d: 4, hide: true }); B.prop('grass_tall', 2, 0, -71.5, { variant: 'dry', w: 6, d: 3 });
    for (const [x, z] of [[-50, -70], [-30, -68.5], [12, -70], [-58, -66]]) B.prop('rock', x, 0, z, { variant: 'small', red: true });
  },

  // ================================================================== the neon pylon
  pylon(B) {
    B.castOn = true;
    const x = -10, z = -48.2;
    B.box(x, 0, z, 8, .2, 3.4, { mat: 'concrete', mats: { t: 'gravel' } });
    for (const [dx, v] of [[-3, 'shrub'], [2.8, 'small'], [3.4, 'shrub']]) B.prop('bush', x + dx, .2, z + (dx > 0 ? -.4 : .5), { variant: v, hide: dx < 0 });
    B.prop('rock', x - 1.4, .2, z - 1, { variant: 'small', red: true });
    for (const dx of [-1.6, 1.6]) B.cyl(x + dx, .2, z, .2, 10.5, { mat: 'mo_teal', sides: 12 });
    const board = (y, w, h, d, mat) => B.box(x, y, z, w, h, d, { mat, mats: { t: 'paint_black', b: 'paint_black' }, collide: false });
    board(8.2, 8.2, 2.6, .5, 'mo_teal'); board(6.1, 6.2, 1.8, .45, 'paint_black'); board(4.8, 3.8, 1.05, .4, 'mo_trim');
    B.castOn = false;
    for (const s of [-1, 1]) {
      const zz = z + s * .27, f = s < 0 ? 's' : 'n';
      decal(B, 'glow', 'starlite', x, 9.5, zz, 7.6, 1.5, { face: f }); decal(B, 'glow', 'star', x - 3.4 * s, 10.5, zz, .9, .9, { face: f });
      decal(B, 'glow', 'motel', x, 7.0, z + s * .245, 5.6, 1.4, { face: f });
      decal(B, 'glow', 'vacancy', x + .3 * s, 5.32, z + s * .22, 2.6, .62, { face: f }); decal(B, 'glow', 'no', x - 1.35 * s, 5.32, z + s * .22, .8, .3, { face: f });
      // neon border tubes round the top board
      B.box(x, 8.18, zz + s * .02, 8.1, .06, .03, { mat: 'mo_neon_pink', collide: false, cast: false });
      B.box(x, 10.72, zz + s * .02, 8.1, .06, .03, { mat: 'mo_neon_pink', collide: false, cast: false });
      B.box(x, 7.85, z + s * .25, 6.1, .05, .03, { mat: 'mo_neon_cyan', collide: false, cast: false });
    }
    B.box(x, 10.8, z, 1, .4, .3, { mat: 'paint_black', collide: false });
    decal(B, 'glow', 'arrow', x + 4.6, 6.5, z - .25, 1.2, 1.2, { face: 's' });
  },

  // ================================================================== lights (<= 24 dynamic)
  lights(B) {
    const L = (o) => B.light(Object.assign({ color: [1, .82, .6] }, o));
    L({ x: 28, y: 3.35, z: -82, intensity: 14, fixture: 'tube', color: [.92, .96, 1] });
    L({ x: 40, y: 3.35, z: -82, intensity: 14, fixture: 'tube', color: [.92, .96, 1] });
    L({ x: 34, y: 3.24, z: -74, intensity: 16, fixture: 'can', color: [.95, .97, 1] });
    L({ x: -8, y: 3.05, z: 49, intensity: 18, fixture: 'tube', color: [.9, .95, 1], flicker: .25 });
    L({ x: 0, y: 3.05, z: 49, intensity: 18, fixture: 'tube', color: [.9, .95, 1] });
    L({ x: -53, y: 3.5, z: -15, intensity: 18, fixture: 'panel' });
    L({ x: -42, y: 3.5, z: -15, intensity: 18, fixture: 'panel' });
    L({ x: -52, y: 3.5, z: -2.6, intensity: 10, fixture: 'tube', color: [.92, .96, 1] });
    L({ type: 'spot', x: -52, y: 4.55, z: -38, dir: [0, -1, 0], angle: 1.9, intensity: 70, color: [.95, .97, 1], fixture: false });
    L({ type: 'spot', x: -44, y: 4.55, z: -38, dir: [0, -1, 0], angle: 1.9, intensity: 70, color: [.95, .97, 1], fixture: false });
    B.prop('street_light', -26, 0, -27, { variant: 'single', h: 8, light: true, intensity: 55, warm: true, ry: 0 });
    B.prop('street_light', 14, 0, -21.5, { variant: 'single', h: 8, light: true, intensity: 55, warm: true, ry: -H });
    B.prop('street_light', -31, 0, 12, { variant: 'single', h: 7, light: true, intensity: 45, warm: true, ry: H });
    L({ x: -10, y: 7.5, z: -46.4, intensity: 26, fixture: false, color: [1, .35, .7] });
    L({ x: 37, y: 2.85, z: 20, intensity: 9, fixture: 'panel' });
    L({ x: 36, y: 5.95, z: 19, intensity: 8, fixture: 'bulb' });
    L({ x: 43, y: 5.95, z: 20, intensity: 8, fixture: 'bulb' });
    L({ x: -16, y: 2.78, z: 20.8, intensity: 6, fixture: 'bulb' });
    L({ x: 14, y: 2.78, z: 20.8, intensity: 6, fixture: 'bulb', flicker: .5 });
    L({ x: 30.8, y: 2.78, z: -10, intensity: 6, fixture: 'bulb' });
    L({ x: 30.8, y: 5.85, z: 2, intensity: 6, fixture: 'bulb' });
    L({ x: -20, y: 3.0, z: 31.6, intensity: 9, fixture: 'bulb', color: [1, .7, .4] });
    L({ x: 22, y: 3.0, z: 31.6, intensity: 9, fixture: 'bulb', color: [1, .7, .4] });
    L({ x: -4, y: 2.8, z: 27, intensity: 5, fixture: false, color: [.85, .95, 1] });
  },

  // ================================================================== gameplay markers
  markers(B) {
    // T1 lobby (coach stop) and T2 lobby (laundry) with their roller gates
    B.lobby(1, { x0: 22.25, z0: -87.75, x1: 45.75, z1: -76.25, y: 0 }, [{ x: 28, z: -76.125, w: 2.8, h: 2.7 }, { x: 40, z: -76.125, w: 2.8, h: 2.7 }]);
    for (const x of [25, 28.5, 32, 35.5, 39, 42.5]) for (const z of [-85.2, -80.6]) B.spawn(1, x, 0, z, 0);
    B.lobby(2, { x0: -11.75, z0: 44.25, x1: 3.75, z1: 53.75, y: 0 }, [{ x: -8, z: 44.125, w: 2.6, h: 2.6 }, { x: 0, z: 44.125, w: 2.6, h: 2.6 }]);
    for (const x of [-9.5, -6.9, -4.3, -1.7, .9]) for (const z of [46.6, 49.6]) B.spawn(2, x, 0, z, PI);
    B.spawn(2, -9.5, 0, 51.6, PI); B.spawn(2, .9, 0, 51.6, PI);
    // field spawns: T1 over the south half, T2 over the north half
    for (const [x, y, z] of [[-42, 0, -58], [-20, 0, -66.5], [0, 0, -57], [16, 0, -54], [40, 0, -58], [-56, 0, -46], [-30, 0, -40], [6, 0, -40], [24, 0, -44], [44, 0, -46]])
      B.spawn(1, x, y, z, 0, { field: true });
    for (const [x, y, z] of [[-50, 0, 22], [-56, 0, 38], [-30, 0, 36], [-14, 0, 38], [10, 0, 38], [28, 0, 40], [40, 0, 38], [36, GF, 30], [-20, Y1, 20.8], [12, Y1, 20.8]])
      B.spawn(2, x, y, z, PI, { field: true });
    // FFA over the whole map
    for (const [x, y, z] of [[-54, 0, -30], [-38, 0, -44], [-49.4, GF, -18.6], [-56, GF, -2.6], [-50, 0, 26], [-46, 0, 41], [-20, 0, 37], [6, 0, 37],
      [30, 0, 42], [38, GF, 22], [37, Y1, 30.8], [31, Y1, -12], [26, 0, -36], [12, 0, -10], [-6, 0, 12], [-20, Y1, 20.8], [8, Y1, 20.8], [-14, -2.4, -4], [-22, 0, -22], [0, 0, -50]])
      B.spawn(0, x, y, z, Math.atan2(-x, -z));
    // sites
    B.site('A', { x0: -59.5, z0: -21.5, x1: -36.5, z1: -9.6, y: GF });
    B.site('B', { x0: 32.3, z0: 14.3, x1: 45.7, z1: 25.9, y: Y1 });
    decal(B, 'sign', 'A', -44.3, GF + .012, -18.6, 1.4, 1.4, { ry: PI, col: [.85, .2, .15] });
    decal(B, 'sign', 'B', 36.5, Y1 + .02, 21.3, 1.2, 1.2, { ry: -H, col: [.85, .2, .15] });
    // hides
    for (const [x, y, z, kind] of [[-42.2, GF, -3.75, 'closet'], [-38.5, GF, -3.6, 'dark'], [-26.9, 0, 21.2, 'under'], [30.8, 0, -27, 'under'], [-12.6, Y1, 30.6, 'closet'],
      [40.5, GF, 0, 'closet'], [-16.6, -2.4, -1.2, 'dark'], [4.6, 2.15, 5.4, 'roof'], [-5.2, GF, 29, 'dark'], [44.2, GF, 25.6, 'closet'], [-34.6, 0, 7.2, 'grass']])
      B.hide(x, y, z, { kind });
    // hostages, rescue zone
    B.hostage(44.4, GF, 21.2); B.hostage(43.6, Y1, 29.3); B.hostage(-12.2, Y1, 23.3); B.hostage(-38.4, GF, -.9);
    B.rescue({ x0: 14, z0: -75.5, x1: 50, z1: -64.5 });
    // points
    B.point('dom1', -46, 0, -38, 4); B.point('dom2', -8, 0, -12.5, 4); B.point('dom3', 28, 0, -16, 4);
    B.point('hp1', -8, 0, 4.5, 4); B.point('hp2', -48, 0, -38, 4); B.point('hp3', -12, Y1, 20.8, 4); B.point('hp4', 36.5, GF, 20, 3.5); B.point('hp5', -48, 0, 24, 5);
    B.point('hill', -8, 0, 3.6, 6);
    B.point('flag1', 34, 0, -69, 1.5); B.point('flag2', -4, 0, 38.5, 1.5);
    B.point('extract1', -56, 0, 38, 3); B.point('extract2', 40, 0, 40, 3); B.point('extract3', -56, 0, -56, 3);
    B.point('hq1', 37, GF, 19, 3); B.point('hq2', -52, GF, -2.6, 3);
    B.buyzone(1, { x0: 22.25, z0: -87.75, x1: 45.75, z1: -76.25 }); B.buyzone(1, { x0: 18, z0: -76, x1: 50, z1: -71.8 });
  },

  // ================================================================== out of bounds: desert, mesas, the town, poles, billboard
  skyline(B) {
    // the far town to the east, a radio mast, the highway's power line
    decal(B, 'glow', 'town', 560, 2, -120, 420, 22, { face: 'w' });
    decal(B, 'glow', 'town', -560, 2, 160, 300, 14, { face: 'e' });
    B.box(380, 0, 330, 1.4, 60, 1.4, { mat: 'steel_dark', collide: false, cast: false });
    B.box(380, 60, 330, .8, .8, .8, { mat: 'emissive_red', collide: false, cast: false }); B.box(380, 30, 330, .7, .7, .7, { mat: 'emissive_red', collide: false, cast: false });
    for (let x = -420; x <= 420; x += 48) if (Math.abs(x - 34) > 30) B.prop('utility_pole', x, 0, -97, { variant: 'wood', h: 10, span: 48, ry: H, collide: false });
    for (let x = -390; x <= 420; x += 46) B.prop('utility_pole', x, 0, 62, { variant: 'wood', h: 9.5, span: 46, ry: H, collide: false });
    // the motel's own billboard across the highway
    for (const dx of [-4, 4]) B.box(-38 + dx, 0, -86, .35, 7.5, .35, { mat: 'p_wood_sleeper', collide: false });
    B.box(-38, 6, -86, 13, 4.4, .3, { mat: 'paint_black', collide: false });
    decal(B, 'glow', 'starlite', -38, 8.5, -85.83, 11, 2.0, { face: 'n' }); decal(B, 'glow', 'motel', -38, 6.9, -85.83, 6, 1.4, { face: 'n' });
    decal(B, 'sign', 'vac', -38, 6.35, -85.84, 9, .7, { face: 'n' });
    for (const dx of [-5, 0, 5]) B.box(-38 + dx, 10.5, -85.4, .3, .15, .5, { mat: 'emissive_warm', collide: false, cast: false });
    // scrub and rocks out in the desert
    const r = rng(88);
    for (let i = 0; i < 60; i++) {
      const a = r() * Math.PI * 2, d = 90 + r() * 260, x = 0 + Math.cos(a) * d, z = -20 + Math.sin(a) * d;
      if (Math.abs(z + 57) < 12) continue;
      if (i % 3) B.prop('bush', x, desertH(x, z) - .05, z, { variant: i % 2 ? 'small' : 'shrub', collide: false });
      else B.prop('rock', x, desertH(x, z) - .2, z, { variant: i % 4 ? 'medium' : 'large', red: true, collide: false });
    }
  },
};
