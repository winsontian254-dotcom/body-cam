/* LIVE FIRE — Harbor Nine (harbor): a working container terminal berth at dusk.
   Original location. Plan (x east, z north, metres, yard at y 0; water to the north beyond the quay edge z 63.5):
     T1 lobby  = the out-gate truck inspection shed (south, x -30..6, z -79..-63), gate plaza with the booth canopy in front.
     T2 lobby  = the harbourmaster / port operations building (x 2..20, z 14..28) on the quay road.
     SITE A    = the crane yard under gantry crane STS 07 on the quay apron (x -60..-39, z 40..58): hatch covers, staged boxes.
     SITE B    = inside the bonded warehouse (x 36..84, z -14..30, floor at dock height 1.1 m): racks, bonded cage, mezzanine.
     MID       = the container maze (x -55..24, z -35..30) around a courtyard (x -29..-9, z -22..-6) with a stair onto a
                 one-high block (high ground); lanes: A lane + reefer gantry (west), crane lane / A cut (to A), office lane
                 (T2 into mid), customs connector + customs lane (to the B ramp), dock apron (B docks).
   Out of bounds: the moored feeder KESTREL TIDE (bow to the east), the harbour, a far terminal, the town, hills.
   Prefabs and painters: js/maps/kit_harbor.js. Design notes: tools/test/out/notes-map-harbor.md (git-ignored). */
import { hb, pave, paint, decal, ccont, pcont, block, stsCrane, freighter, mast, quayEdge, hatch, skyline, cableDrum, bigBags, finish, rng, PAL, YEL, WHT, RED } from '../kit_harbor.js';

const FL = 1.1;                 // warehouse floor (dock height)
const QZ = 63.5;                // quay edge (cope line)
const RL = 37, RS = 61;         // crane rails: landside / seaside
const PI = Math.PI, H = PI / 2;
const PF = { t: 0, out: [] };
const mark = k => { if (!globalThis.__HB_PROF) return; const t = performance.now(); if (PF.t) PF.out.push(k + ' ' + Math.round(t - PF.t)); PF.t = t; };
const CARS = [{ variant: 'sedan', color: 'silver', seed: 1 }, { variant: 'hatch', color: 'red', seed: 1 }, { variant: 'suv', color: 'black', seed: 1 }, { variant: 'pickup', color: 'white', seed: 1 }, { variant: 'van', color: 'blue', seed: 1 }];
const face = (x, z, tx = -10, tz = 0) => Math.atan2(tx - x, tz - z);   // yaw that looks from (x, z) at (tx, tz)

/** wall in horizontal layers (materials) with openings given from the wall base: o = { y, t, layers: [{ h, mat, mat2 }],
 *  openings: [{ at, w, y, h, glass, frame }] } (mat = left side walking from start to end, as B.wall) */
function lwall(B, x0, z0, x1, z1, o) {
  let lb = 0;
  for (const L of o.layers) {
    const ops = [];
    for (const op of o.openings || []) {
      const a = Math.max(op.y || 0, lb), b = Math.min((op.y || 0) + op.h, lb + L.h);
      if (b - a > .01) ops.push({ at: op.at, w: op.w, y: a - lb, h: b - a, glass: op.glass && a === (op.y || 0) && b === (op.y || 0) + op.h, frame: op.frame && a === (op.y || 0) ? op.frame : false });
    }
    B.wall(x0, z0, x1, z1, { y: (o.y || 0) + lb, h: L.h, t: o.t || .3, mat: L.mat, mat2: L.mat2, matEnd: L.end || L.mat, openings: ops });
    lb += L.h;
  }
}
/** a rectangular building shell: R = { x0, z0, x1, z1 }, o = { y, t, layers: [{ h, out, in }], ops: { n, s, e, w: [{ c (absolute x or z), w, y, h, glass }] } } */
function shell(B, R, o) {
  const t = o.t || .3, L = s => o.layers.map(l => ({ h: l.h, mat: s ? l.out : l.in, mat2: s ? l.in : l.out, end: l.out }));
  const ops = (side, base) => (o.ops && o.ops[side] || []).map(p => ({ at: p.c - base, w: p.w, y: p.y || 0, h: p.h, glass: p.glass, frame: p.frame }));
  lwall(B, R.x0, R.z0 + t / 2, R.x1, R.z0 + t / 2, { y: o.y, t, layers: L(false), openings: ops('s', R.x0) });
  lwall(B, R.x0, R.z1 - t / 2, R.x1, R.z1 - t / 2, { y: o.y, t, layers: L(true), openings: ops('n', R.x0) });
  lwall(B, R.x0 + t / 2, R.z0 + t, R.x0 + t / 2, R.z1 - t, { y: o.y, t, layers: L(true), openings: ops('w', R.z0 + t) });
  lwall(B, R.x1 - t / 2, R.z0 + t, R.x1 - t / 2, R.z1 - t, { y: o.y, t, layers: L(false), openings: ops('e', R.z0 + t) });
}
/** steel railing along a line (visual posts + rails) with a movement-only collider (bullets and sight pass) */
function railing(B, x0, z0, x1, z1, y, o = {}) {
  const L = Math.hypot(x1 - x0, z1 - z0), ry = Math.atan2(-(z1 - z0), x1 - x0), cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, m = o.mat || 'paint_yellow';
  B.push(cx, y, cz, ry);
  B.box(0, 1.02, 0, L, .05, .05, { mat: m, collide: false }); B.box(0, .52, 0, L, .04, .04, { mat: m, collide: false });
  if (o.toe !== false) B.box(0, 0, 0, L, .1, .02, { mat: m, collide: false });
  const n = Math.max(1, Math.round(L / 1.5));
  for (let i = 0; i <= n; i++) B.box(-L / 2 + i * L / n, 0, 0, .05, 1.05, .05, { mat: m, collide: false });
  if (o.collide !== false) B.box(0, 0, 0, L, 1.1, .1, { visible: false, ray: false, surf: 'metal' });
  B.pop();
}
const fence = (B, x0, z0, x1, z1, o = {}) => {
  const L = Math.hypot(x1 - x0, z1 - z0), ry = Math.atan2(-(z1 - z0), x1 - x0);
  B.prop('fence_chainlink', (x0 + x1) / 2, 0, (z0 + z1) / 2, { ry, len: L, variant: o.barbed === false ? 'plain' : 'barbed', h: o.h });
};

export default {
  id: 'harbor', name: 'Harbor Nine',
  desc: 'Container terminal berth at dusk: gantry cranes over a moored feeder, a container maze, the bonded warehouse and the harbourmaster\'s office.',
  size: 'L', chunk: 128,
  env: { hdri: 'golden', sky: 'hdri', time: 'dusk', exposure: .78, sun: { dir: [.84, -.17, -.5], color: [1, .62, .36], intensity: 1.15 },
    fog: { color: [.5, .42, .37], density: .003 }, weather: 'clear', wind: [2.5, -1], ambience: 'harbor', reverb: 'outdoor', indoorIbl: .25 },
  bounds: { minX: -84, maxX: 90, minZ: -81, maxZ: QZ, minY: -6, maxY: 40 },

  build(B) {
    const R = rng(9);
    hb(B); PF.t = 0; PF.out.length = 0; mark('init');
    mark('ground'); // ================================================================== ground, water, quay edge
    pave(B, [
      [-30, -79, 6, -63, 'concrete_floor'],                 // T1 shed
      [2, 14, 20, 28, 'none'], [36, -14, 84, 30, 'none'],   // buildings carry their own floors
      [-200, -78, 200, -66, 'asphalt'], [-200, -66, 200, -63.3, 'pavement'], [-200, -200, 200, -78, 'concrete_floor'],
      [-34, -63.3, 10, -46, 'asphalt'],                      // gate plaza lanes
      [-84, -63.3, -34, -46, 'asphalt'],                     // staff car park
      [-84, -46, 90, -36, 'asphalt'],                        // gate road
      [-65.8, -36, -56, 37, 'asphalt'],                      // A lane
      [-84, 30, 40, 37, 'asphalt'], [36, 30, 200, 37, 'asphalt'],   // quay road + warehouse north yard
      [24, -36, 36, 30, 'asphalt'],                          // customs lane
      [-200, 37, 200, QZ, 'concrete_panels'],                // apron
    ], 'concrete_floor', { x0: -200, z0: -200, x1: 200, z1: QZ });
    B.floor(-400, QZ, 400, 700, -2.4, { mat: 'water', t: .1, collide: false });
    B.box(0, -12, 300, 800, 6, 480, { mat: 'concrete_dark', collide: false, cast: false });   // harbour bed (water depth)
    quayEdge(B, -200, 200, QZ, { lines: [-10, 7.6] });
    B.box(5, 0, QZ - .2, 410, .22, .4, { visible: false, surf: 'concrete' });           // cope kerb collider

    mark('perimeter'); // ================================================================== perimeter (fences seal the playable yard)
    fence(B, -78.6, -63.15, -30.2, -63.15); fence(B, 6.2, -63.15, 88.6, -63.15);
    fence(B, -78.6, -63.1, -78.6, -33.5); fence(B, -78.6, 26.5, -78.6, QZ - .4);
    fence(B, 88.6, -63.1, 88.6, -14.2); fence(B, 84.2, -14.15, 88.6, -14.15);
    fence(B, 52.2, 30.2, 52.2, 37); fence(B, 40.2, 37, 40.2, QZ - .4); fence(B, 40.2, 37, 52.2, 37);
    B.prop('gate', 40.25, 0, 50, { ry: H, len: 6 });
    decal(B, 'sign', 'berth', 40.1, 1.5, 44, 3.6, .37, { face: 'w', ry: 0 });

    mark('T1 lobby'); // ================================================================== T1 lobby: out-gate inspection shed
    const SH = { x0: -30, z0: -79, x1: 6, z1: -63 };
    shell(B, SH, { t: .3, layers: [{ h: 1.2, out: 'concrete_panels', in: 'concrete_panels' }, { h: 6, out: 'corrugated', in: 'corrugated' }],
      ops: { n: [{ c: -21, w: 4.6, h: 4.6 }, { c: -3, w: 4.6, h: 4.6 }], s: [{ c: -12, w: 5, h: 4.6 }] } });
    B.box(-12, 0, -78.95, 5.2, 4.6, .2, { mat: 'corrugated' });                                  // closed south roller door
    B.box(-12, 7.2, -71, 36.4, .3, 16.4, { mat: 'corrugated', mats: { b: 'corrugated' } });       // roof
    for (const z of [-79.33, -62.67]) B.box(-12, 7.05, z, 36.4, .6, .25, { mat: 'p_paint_darkgrey', collide: false });   // fascia
    for (let x = -24; x <= 0; x += 6) {                                                           // portal frames
      for (const z of [-78.55, -63.45]) B.box(x, 0, z, .32, 6.6, .3, { mat: 'paint_blue', collide: x > -26 && x < 2 });
      B.box(x, 6.4, -71, .25, .55, 15.4, { mat: 'paint_blue', collide: false });
    }
    for (const [x, z] of [[-17, -71], [-6, -71], [2, -71]]) B.light({ x, y: 6.85, z, intensity: 14, color: [.95, .97, 1], fixture: 'tube' });
    for (const x of [-25, -12, 0]) B.box(x, 6.82, -66, 1.2, .05, .12, { mat: 'emissive_white', collide: false, cast: false });
    B.prop('box_truck', -25.5, 0, -72.5, { variant: 'logo', color: 'white' });
    B.prop('lockers', 5.35, 0, -74, { ry: -H, n: 5, variant: 'grey', bench: true });
    B.prop('shelf_unit', 5.4, 0, -68.5, { ry: -H, variant: 'grey' });
    B.prop('desk', 1, 0, -77.9, { variant: 'metal', ry: 0 }); B.prop('monitor', 1, .75, -78.1, {}); B.prop('office_chair', 1, 0, -77, { ry: PI });
    B.prop('pallet', -8, 0, -77.6, { variant: 'wrap', stack: 1 }); B.prop('pallet', -6.6, 0, -77.6, { variant: 'boxes' });
    B.prop('pallet_jack', -9.6, 0, -76.6, { ry: .4 });
    B.prop('cone', -14, 0, -77.5, {}); B.prop('cone', -14.6, 0, -77.9, {});
    B.prop('fire_extinguisher', -29.65, 0, -66, { ry: H }); B.prop('fire_extinguisher', 5.65, 0, -64.5, { ry: -H });
    decal(B, 'sign', 'inspect', -12, 4.6, -78.82, 6, .6, { face: 'n' });
    paint(B, -18.2, -78.6, -18.2, -63.4, { col: YEL, w: .12 }); paint(B, -14.2, -78.6, -14.2, -63.4, { col: YEL, w: .12 });
    for (let z = -77; z < -64; z += 2) paint(B, -18.1, z, -14.3, z + 1.4, { col: YEL, w: .18 });
    decal(B, 'stain', 'oil0', -25.5, .012, -70, 3, 3, {}); decal(B, 'stain', 'tyre', -25.5, .012, -66, 1.6, 6, { ry: H });
    B.lobby(1, { x0: -29.7, z0: -78.7, x1: 5.7, z1: -63.3, y: 0 }, [{ x: -21, z: -63.15, w: 4.6, h: 4.6, ry: 0 }, { x: -3, z: -63.15, w: 4.6, h: 4.6, ry: 0 }]);
    for (const x of [-17, -13.5, -10, -6.5, -3, .5]) for (const z of [-70.5, -66.5]) B.spawn(1, x, 0, z, 0);
    decal(B, 'sign', 'harbor9', -12, 8.4, -62.85, 9, .92, { face: 'n' });

    mark('gate plaza'); // ================================================================== gate plaza: booth canopy, islands, barriers
    for (const x of [-30, -20, -6, 6]) for (const z of [-60, -50]) B.box(x, 0, z, .4, 6.5, .4, { mat: 'paint_white' });
    B.box(-12, 6.5, -55, 38, .5, 12.6, { mat: 'p_paint_teal', mats: { b: 'paint_white', t: 'metal_plate' }, collide: false });
    decal(B, 'sign', 'outgate', -12, 6.75, -48.68, 8, .8, { face: 'n' }); decal(B, 'sign', 'outgate', -12, 6.75, -61.32, 8, .8, { face: 's' });
    for (const x of [-12, 3]) {
      B.box(x, 0, -55, 1.8, .15, 10, { mat: 'concrete', mats: { t: 'concrete' } });
      B.box(x, .15, -59.8, 1.8, .9, .3, { mat: 'hazard', collide: false }); B.box(x, .15, -50.2, 1.8, .9, .3, { mat: 'hazard', collide: false });
      // booth
      B.box(x, .15, -55.6, 1.6, .9, 2.4, { mat: 'paint_white' });
      B.box(x, 1.05, -55.6, 1.6, 1.25, 2.4, { mat: 'p_glass_tint', surf: 'glass', cast: false });
      B.box(x, 2.3, -55.6, 1.8, .25, 2.6, { mat: 'p_paint_darkgrey' });
      B.prop('gate', x - 2.1, .15, -51, { variant: 'barrier', len: 4 }); B.prop('gate', x + 2.1, .15, -59.4, { variant: 'barrier', len: 4, ry: PI });
      B.prop('bollard', x, .15, -60.3, { variant: 'yellow' }); B.prop('bollard', x, .15, -49.7, { variant: 'yellow' });
    }
    for (const x of [-12, 3]) B.light({ type: 'spot', x: x - 4, y: 6.45, z: -55, dir: [0, -1, 0], angle: 1.3, intensity: 70, color: [1, .92, .8], fixture: 'can', range: 16 });
    for (const x of [-26, -17, -7, 1]) paint(B, x, -62.5, x, -47, { col: WHT, w: .12, dash: [3, 3] });
    paint(B, -33, -48, 9, -48, { col: WHT, w: .4 });
    decal(B, 'sign', 'stop', -21, .012, -46.9, 3.2, .7, {}); decal(B, 'sign', 'stop', -6, .012, -46.9, 3.2, .7, {});
    B.prop('jersey_barrier', -32.6, 0, -56, { ry: H }); B.prop('jersey_barrier', 8.6, 0, -56, { ry: H });
    B.prop('cone', -25, 0, -48.5, {}); B.prop('cone', -24.2, 0, -48.2, {}); B.prop('cone', 6.8, 0, -47.6, { variant: 'drum' });
    B.rescue({ x0: -30, z0: -62.6, x1: 6, z1: -50, y: 0 });

    mark('staff car park'); // ================================================================== staff car park (west of the plaza) + truck park (east)
    decal(B, 'sign', 'parking', -56, 1.9, -62.95, 4, .4, { face: 'n' });
    for (let i = 0; i < 9; i++) {
      const x = -74 + i * 4.6;
      paint(B, x - 2.3, -63, x - 2.3, -57.5, { col: WHT, w: .1 }); paint(B, x - 2.3, -52, x - 2.3, -46.5, { col: WHT, w: .1 });
      if (![2, 5, 7].includes(i)) B.prop('car', x, 0, -60.2, { ry: PI * (i % 3 === 0 ? 0 : 1) + (R() - .5) * .06, ...CARS[i % 4], hide: i === 3, inst: false });
      if (![0, 4, 6].includes(i)) B.prop('car', x + .4, 0, -49.4, { ry: (i % 2 ? 0 : PI) + (R() - .5) * .06, ...CARS[(i + 2) % 5], hide: i === 8, inst: false });
    }
    B.prop('grass_tall', -76.5, 0, -55, { w: 3, d: 13, variant: 'dry', h: 1.1 }); B.hide(-76.6, null, -55, { kind: 'grass' });
    B.prop('street_light', -60, 0, -54.8, { variant: 'double', h: 8 }); B.prop('street_light', -42, 0, -54.8, { variant: 'double', h: 8 });
    B.prop('litter_bin', -36, 0, -62.4, {}); B.prop('bench', -40, 0, -62.5, { variant: 'metal' });
    mast(B, -37, -47.2, { h: 24, aim: [-14, -44], light: true, intensity: 1600, range: 55 });
    // truck park
    for (const [x, z, ry, k] of [[20, -55, 0, 'box'], [32, -56, .05, 'flat'], [58, -55, -.04, 'box'], [72, -55.5, 0, 'box']]) {
      B.prop('semi_trailer', x, 0, z, { ry, variant: k, seed: 1, color: ['red', 'white', 'blue', 'grey'][Math.floor(x / 20) % 4] });
      if (k === 'flat') ccont(B, x, 1.35, z, ry, { len: 40, color: 'blue' });
    }
    B.prop('truck_tractor', 58, 0, -46.8 + 1.0, { ry: PI, variant: 'red' }); B.hide(54.8, null, -50, { kind: 'car' });
    for (let x = 14; x < 86; x += 6) paint(B, x, -62.8, x, -48.5, { col: YEL, w: .12 });
    mast(B, 44, -47.2, { h: 24, aim: [44, -30], light: true, intensity: 1600, range: 55 });

    mark('gate road'); // ================================================================== gate road
    paint(B, -78, -41, 88, -41, { col: YEL, w: .14, dash: [4, 4] }); paint(B, -78, -45.6, 88, -45.6, { col: WHT, w: .12 }); paint(B, -78, -36.4, 88, -36.4, { col: WHT, w: .12 });
    B.prop('truck_tractor', -44.5, 0, -43.4, { ry: H, variant: 'blue' }); B.prop('semi_trailer', -54.9, 0, -43.4, { ry: H, variant: 'flat', seed: 1 });
    ccont(B, -54.9, 1.35, -43.4, H, { len: 40, color: 'red' });
    B.prop('truck_tractor', 14.5, 0, -38.6, { ry: -H, variant: 'white' }); B.prop('semi_trailer', 24.9, 0, -38.6, { ry: -H, variant: 'box', color: 'green', seed: 1 });
    for (const [x, z, ry] of [[-66, -41, 0], [-20, -41, .1], [-2.5, -41, -.1], [60, -41, 0], [70, -38.2, H * .2]]) B.prop('jersey_barrier', x, 0, z, { ry });
    decal(B, 'sign', 'slow', -30, .012, -43.4, 3.2, .7, { ry: -H }); decal(B, 'sign', 'slow', 40, .012, -38.6, 3.2, .7, { ry: H });
    decal(B, 'stain', 'tyre2', -10, .012, -43, 8, 1.4, {}); decal(B, 'stain', 'patch', 30, .012, -42, 4, 3, {});
    decal(B, 'stain', 'oil1', -44, .013, -43.4, 2.4, 2.4, {}); decal(B, 'stain', 'oil2', 16, .013, -38.6, 2.2, 2.2, {});

    mark('west'); // ================================================================== west: reefer rows R1 / R2, reefer gantry walkway, A lane
    const reefer = (x, z, t, ends) => {        // 20 ft reefer along x; machinery end at x + ends * 3.03
      ccont(B, x, t * 2.591, z, ends > 0 ? -H : H, { color: 'white', len: 20 });
      const ex = x + ends * 3.06;
      B.box(ex + ends * .07, t * 2.591 + .2, z, .14, 2.2, 2.25, { mat: 'p_alu', collide: false });
      B.box(ex + ends * .15, t * 2.591 + .5, z - .5, .04, 1.1, .9, { mat: 'steel_dark', collide: false });
      B.box(ex + ends * .15, t * 2.591 + 1.75, z + .55, .03, .16, .3, { mat: 'p_em_cyan', collide: false, cast: false });
    };
    for (let i = 0; i < 22; i++) {
      const z = -33 + i * 2.7;
      reefer(-78.39, z, 0, 1); reefer(-78.39, z, 1, 1);
      reefer(-68.87, z, 0, -1);
      if (z < -16 || z > 8) reefer(-68.87, z, 1, -1);
    }
    // gantry deck (y 2.8) between the machinery ends, posts, railings, stairs at both ends
    const GX0 = -75.1, GX1 = -72.1, GZ0 = -28, GZ1 = 20, GY = 2.8;
    B.box((GX0 + GX1) / 2, GY - .2, (GZ0 + GZ1) / 2, GX1 - GX0, .2, GZ1 - GZ0, { mat: 'metal_plate', mats: { b: 'steel_dark' }, surf: 'metal' });
    for (let z = GZ0 + .3; z <= GZ1; z += 6) for (const x of [GX0 + .15, GX1 - .15]) B.box(x, 0, z, .18, GY - .2, .18, { mat: 'paint_yellow', collide: false });
    railing(B, GX0 + .05, GZ0, GX0 + .05, GZ1, GY); railing(B, GX1 - .05, GZ0, GX1 - .05, GZ1, GY);
    for (let z = GZ0 + 3; z < GZ1; z += 6) { B.box(GX0 + .25, GY + .9, z, .2, .3, .14, { mat: 'p_paint_grey', collide: false }); B.box(GX1 - .25, GY + .9, z, .2, .3, .14, { mat: 'p_paint_grey', collide: false }); }
    B.stairs({ x: -73.6, z: -30.4, w: 2.9, len: 4.8, y0: 0, y1: GY, dir: '+z', mat: 'steel_dark', tread: 'metal_plate', rail: true, railMat: 'paint_yellow' });
    B.stairs({ x: -73.6, z: 22.4, w: 2.9, len: 4.8, y0: 0, y1: GY, dir: '-z', mat: 'steel_dark', tread: 'metal_plate', rail: true, railMat: 'paint_yellow' });
    decal(B, 'sign', 'reefer', -73.6, 3.4, -33.2, 3.6, .37, { face: 's' });
    B.light({ x: -73.6, y: 5.2, z: -4, intensity: 10, color: [.85, .95, 1], fixture: 'tube' });
    B.box(-73.6, 5.2, -4, .1, .1, .1, { visible: false, collide: false });
    B.hide(-73.6, GY, 17.5, { kind: 'roof' }); B.hide(-73.6, GY, -25.5, { kind: 'dark' });
    // A lane cover: chassis with boxes, barriers, a cable reel, mast
    B.prop('semi_trailer', -61.5, 0, -20, { variant: 'flat', ry: PI, seed: 1 }); ccont(B, -61.5, 1.35, -20, PI, { len: 40, color: 'maroon' });
    B.prop('semi_trailer', -60.5, 0, 14, { variant: 'flat', seed: 1 }); ccont(B, -60.5, 1.35, 11, 0, { len: 20, color: 'teal' });
    B.prop('jersey_barrier', -58.4, 0, -4, { ry: H * .9 }); B.prop('jersey_barrier', -63, 0, 3, { ry: .2 });
    B.prop('crate_stack', -63.5, 0, -6.5, { ry: H });
    cableDrum(B, -58, 0, 26, H, { r: .85, w: 1.1 });
    mast(B, -64.9, -31.5, { h: 22, aim: [-60, 0], light: true, intensity: 1300, range: 50 });
    for (let z = -34; z < 36; z += 8) paint(B, -60.9, z, -60.9, z + 4, { col: WHT, w: .12 });

    mark('mid'); // ================================================================== mid: container maze
    // column A (x -55..-44)
    block(B, -55, -35, -44, -13, { tiers: (r, i) => 3 - (r === 1 && i === 0 ? 1 : 0), detail: 'we', align: 'center' });
    block(B, -55, -7, -44, 13, { tiers: 2, detail: 'wens' });
    block(B, -55, 17, -44, 29.5, { tiers: 3, detail: 'wn' });
    // column B (x -40..-29); B2 = the one-high block with the stair (high ground over the courtyard)
    block(B, -40, -35, -29, -21.9, { tiers: 2, detail: 'se', align: 'end' });
    block(B, -40, -21.6, -29, -15.4, { tiers: 1, gapRow: .02, p40: 0, align: 'start', detail: 'ens' });
    block(B, -40, -7, -29, 13, { tiers: 3, detail: 'swe' });
    block(B, -40, 17, -29, 30, { tiers: (r) => r === 3 ? 1 : 2, detail: 'nse' });
    // centre-south, east-south, centre-north, north-east
    block(B, -29, -35, -15, -22, { tiers: 2, dir: 'x', detail: 'ne' });
    block(B, -9, -35, 10, -16, { tiers: (r, i) => r === 0 && i === 0 ? 2 : 3, detail: 'wsn' });
    block(B, 13, -35, 24, -16, { tiers: 2, detail: 'wsne' });
    block(B, -24, -6, -4, 10, { tiers: 2, dir: 'x', detail: 'swen' });
    block(B, -24, 14, -4, 30, { tiers: 3, dir: 'x', detail: 'snwe' });
    block(B, 1, -10, 10, 12, { tiers: 2, detail: 'wse' });
    block(B, 13, -10, 24, 14, { tiers: 3, detail: 'wse' });
    // courtyard: stair onto B2, an open box (hide), reels, crates, a forklift
    B.stairs({ x: -26.75, z: -19.6, w: 1.4, len: 4.5, y0: 0, y1: 2.6, dir: '-x', mat: 'paint_yellow', tread: 'grate', rail: true, railMat: 'paint_yellow' });
    pcont(B, -18, 0, -10.6, H, { color: 'rust', doors: 'open', hide: true });
    cableDrum(B, -12.2, 0, -19.6, .3); cableDrum(B, -10.6, 0, -18.3, .3, { r: .7 });
    B.prop('crate_stack', -21, 0, -20.5, { ry: .1 });
    B.prop('forklift', -13.5, 0, -12.5, { ry: 2.3, variant: 'orange' });
    B.prop('pallet', -10.8, 0, -8, { variant: 'sacks', stack: 1 }); B.prop('pallet', -10.8, 0, -9.1, { variant: 'drums' });
    mast(B, -27.4, -8.3, { h: 20, aim: [-15, -16], light: true, intensity: 900, range: 40 });
    for (const [x, z] of [[-20, -16], [-15, -9], [-24, -12]]) decal(B, 'stain', ['oil0', 'oil2', 'drip'][Math.floor(R() * 3)], x, .013, z, 2 + R() * 2, 2 + R() * 2, { ry: R() * 6 });
    // lane markings in the maze
    paint(B, -12, -35, -12, -22, { col: YEL, w: .12, dash: [3, 3] }); paint(B, -1.5, -6, -1.5, 29, { col: YEL, w: .12, dash: [3, 3] });
    paint(B, -26.5, -6, -26.5, 29, { col: YEL, w: .12, dash: [3, 3] }); paint(B, -9, -13, 24, -13, { col: YEL, w: .12, dash: [3, 3] });
    B.prop('jersey_barrier', -42, 0, 0.5, { ry: H }); B.prop('crate_stack', -41.5, 0, 22, { ry: H });
    B.prop('pallet', 11.5, 0, 0, { variant: 'wrap', stack: 1 }); B.prop('drum', 11.6, 0, -5, { n: 3, variant: 'blue' });
    B.prop('dumpster', -42, 0, -28, { ry: H, variant: 'blue' });
    B.prop('jersey_barrier', 5, 0, -13, { ry: 0 }); B.prop('ibc_tank', 18, 0, -12.8, {});

    mark('T2 lobby'); // ================================================================== T2 lobby: harbourmaster / port ops building
    const HM = { x0: 2, z0: 14, x1: 20, z1: 28 };
    shell(B, HM, { t: .25, layers: [{ h: 3.6, out: 'brick_red', in: 'plaster_white' }, { h: 3.5, out: 'plaster', in: 'plaster' }],
      ops: { w: [{ c: 21, w: 3, h: 2.8 }, { c: 16.5, w: 1.6, y: 1, h: 1.3 }, { c: 25.5, w: 1.6, y: 1, h: 1.3 }],
        n: [{ c: 8, w: 3, h: 2.8 }, { c: 13.5, w: 2.4, y: 1, h: 1.4 }, { c: 17, w: 2.4, y: 1, h: 1.4 }, { c: 4, w: 1.6, y: 1, h: 1.4 }],
        e: [{ c: 21, w: 3, h: 2.8 }, { c: 25.5, w: 1.6, y: 1, h: 1.3 }], s: [{ c: 6, w: 1.6, y: 1, h: 1.3 }, { c: 11, w: 1.6, y: 1, h: 1.3 }, { c: 16, w: 1.6, y: 1, h: 1.3 }] } });
    for (const [x, z, ry, w, h] of [[2.125, 16.5, H, 1.6, 1.3], [2.125, 25.5, H, 1.6, 1.3], [13.5, 27.875, 0, 2.4, 1.4], [17, 27.875, 0, 2.4, 1.4], [4, 27.875, 0, 1.6, 1.4],
      [19.875, 25.5, H, 1.6, 1.3], [6, 14.125, 0, 1.6, 1.3], [11, 14.125, 0, 1.6, 1.3], [16, 14.125, 0, 1.6, 1.3]]) B.prop('window', x, 1, z, { ry, w, h, t: .25, variant: 'modern' });
    B.floor(2.25, 14.25, 19.75, 27.75, 0, { mat: 'tile_floor', t: .1 });
    B.box(11, 3.6, 21, 17.5, .3, 13.5, { mat: 'concrete', mats: { b: 'ceiling_tile' } });
    B.box(11, 7.1, 21, 18.6, .35, 14.6, { mat: 'concrete_dark', mats: { b: 'plaster' } });
    for (const [x0, z0, x1, z1] of [[1.7, 13.7, 20.3, 13.95], [1.7, 28.05, 20.3, 28.3], [1.7, 13.95, 1.95, 28.05], [20.05, 13.95, 20.3, 28.05]]) B.box((x0 + x1) / 2, 7.45, (z0 + z1) / 2, x1 - x0, .45, z1 - z0, { mat: 'concrete', collide: false });
    for (const x of [4, 7.4, 10.8, 14.2, 17.6]) { decal(B, 'glow', null, x, 5.3, 28.01, 2.2, 1.3, { face: 'n', uv: [x * .7, 3, x * .7 + 1.1, 3.6] }); B.box(x, 4.6, 28.08, 2.4, .08, .16, { mat: 'concrete', collide: false }); }
    for (const z of [17, 21, 25]) decal(B, 'glow', null, 1.99, 5.3, z, 2.2, 1.3, { face: 'w', uv: [z * .5, 7, z * .5 + 1.1, 7.6] });
    for (const x of [6, 11, 16]) decal(B, 'glow', null, x, 5.3, 13.99, 2.2, 1.3, { face: 's', uv: [x * .3, 11, x * .3 + 1.1, 11.6] });
    decal(B, 'sign', 'hm', 11, 3.95, 28.12, 7, .7, { face: 'n' });
    for (const [x, z] of [[6, 18], [11, 24], [16, 18]]) B.light({ x, y: 3.6, z, intensity: 9, color: [1, .95, .86], fixture: 'panel' });
    for (const [x, z] of [[6, 24], [16, 24], [11, 18]]) B.box(x, 3.56, z, .6, .04, .6, { mat: 'emissive_white', collide: false, cast: false });
    // interior: radio desk at the north window, desks, lockers, kitchenette
    B.prop('control_console', 15.3, 0, 26.9, { ry: PI, len: 3.6 }); B.prop('office_chair', 15, 0, 25.7, { ry: 0 });
    B.prop('desk', 4.6, 0, 15, { ry: PI, variant: 'office' }); B.prop('desk', 9, 0, 15, { ry: PI, variant: 'office' }); B.prop('office_chair', 4.6, 0, 16, { ry: PI }); B.prop('office_chair', 9, 0, 16.1, { ry: PI + .3 });
    B.prop('lockers', 19.5, 0, 16.6, { ry: -H, n: 4, variant: 'blue' }); B.prop('filing_cabinet', 19.45, 0, 24.2, { ry: -H });
    B.prop('kitchen_counter', 15.5, 0, 14.6, { len: 2.4, variant: 'white' }); B.prop('fridge', 18.2, 0, 14.65, { variant: 'white' });
    B.prop('whiteboard', 2.27, 1, 19, { ry: H, w: 2 }); B.prop('wall_clock', 2.27, 2.6, 23, { ry: H }); B.prop('poster', 19.73, 1.2, 19.5, { ry: -H, i: 2 });
    B.prop('bookshelf', 2.6, 0, 27.4, { ry: PI, variant: 'metal' });
    B.lobby(2, { x0: 2.25, z0: 14.25, x1: 19.75, z1: 27.75, y: 0 }, [{ x: 2.125, z: 21, w: 3, h: 2.8, ry: H }, { x: 8, z: 27.875, w: 3, h: 2.8, ry: 0 }, { x: 19.875, z: 21, w: 3, h: 2.8, ry: H }]);
    for (const x of [6, 9, 12, 15]) for (const z of [18.6, 21.4, 24.2]) B.spawn(2, x, 0, z, face(x, z, -10, 0));
    // outside: planters / shrubs, parked cars, flag pole
    for (const z of [16, 26]) { B.prop('planter', -.5, 0, z, { ry: H, len: 2.4 }); }
    B.prop('bush', -2.6, 0, 22, { variant: 'shrub', hide: true }); B.hide(-2.6, null, 22, { kind: 'bush' });
    B.prop('car', 22, 0, 24.5, { ...CARS[2], hide: true });
    B.cyl(.6, 0, 29.4, .05, 9, { mat: 'p_galv', sides: 8 });

    mark('quay road'); // ================================================================== quay road + apron: cranes, site A, staging
    for (const z of [RL, RS]) { B.box(-15, 0, z, 210, .012, .16, { mat: 'steel', collide: false, cast: false }); B.box(-15, 0, z + .5, 210, .006, .9, { mat: 'steel_dark', collide: false, cast: false }); }
    paint(B, -80, 30.4, 40, 30.4, { col: WHT, w: .12 }); paint(B, -80, 33.5, 40, 33.5, { col: YEL, w: .12, dash: [4, 4] });
    paint(B, -82, 39.6, 40, 39.6, { col: YEL, w: .16 }); paint(B, -82, 58.6, 40, 58.6, { col: YEL, w: .16 });
    decal(B, 'sign', 'wharf', -20, .012, 62.2, 4, .45, { ry: PI }); decal(B, 'sign', 'wharf', 20, .012, 62.2, 4, .45, { ry: PI });
    stsCrane(B, -50, RL, RS, { name: 'crane1', load: 'container_blue', trolley: 18, spreaderY: 21 });
    stsCrane(B, 10, RL, RS, { name: 'crane2', up: 1.32, paint: 'paint_red' });
    B.light({ type: 'spot', x: -50, y: 35, z: 49, dir: [0, -1, 0], angle: 1.25, intensity: 2600, range: 48, color: [1, .9, .75], fixture: false });
    // site A
    hatch(B, -51.5, 0, 49, 0);
    decal(B, 'sign', 'A', -51.5, .91, 49, 4, 4, { col: YEL, ry: PI });
    decal(B, 'sign', 'A', -57.2, 4.2, 37.82, 2.6, 2.6, { face: 's', col: [.95, .95, .9] });
    pcont(B, -45, 0, 56.4, H, { color: 'green', len: 40 });
    pcont(B, -59.2, 0, 43.5, 0, { color: 'orange' }); ccont(B, -59.2, 2.591, 43.5, 0, { color: 'navy' });
    pcont(B, -41.6, 0, 44.6, PI, { color: 'blue', doors: 'open', hide: true });
    B.box(-36.6, 0, 50, 12.4, .55, 2.6, { mat: 'paint_yellow', collide: true }); B.box(-36.6, .55, 50, 2.2, .5, 2.2, { mat: 'steel_dark' });   // spare spreader
    B.prop('crate', -55.5, 0, 56.8, { variant: 'large' }); B.prop('pallet', -53.8, 0, 57.2, { variant: 'cylinders', stack: 1 });
    for (const [x, z] of [[-48, 42.5], [-54, 54], [-43, 51]]) decal(B, 'stain', 'oil' + Math.floor(R() * 3), x, .013, z, 2.5, 2.5, { ry: R() * 6 });
    // hatch yard (west of A)
    hatch(B, -70.5, 0, 50.5, H); hatch(B, -70.5, .9, 50.5, H);
    hatch(B, -67, 0, 59.5, 0);
    B.hide(-75.2, null, 44.5, { kind: 'crates' });
    B.prop('site_cabin', -69.5, 0, 33.5, { interior: true, variant: 'blue' });
    block(B, -78.4, 27, -73, 37.5, { tiers: 2, dir: 'z' });
    mast(B, -76, 60, { h: 26, aim: [-52, 48], light: true, intensity: 2000, range: 60 });
    // apron staging east of A (the defenders' quay route)
    block(B, -34, 44.6, -21, 47.4, { tiers: 2, dir: 'x', detail: 'ns' });
    block(B, -24.5, 52.8, -11, 55.4, { tiers: 1, dir: 'x', detail: 'nsew' });
    hatch(B, -6, 0, 45.5, H * .04);
    pcont(B, 28, 0, 46, H, { color: 'white', len: 40 }); ccont(B, 28, 2.591, 46, H, { color: 'red', len: 40 });
    block(B, 22.5, 52.8, 38.5, 58.2, { tiers: 2, dir: 'x', detail: 'ws' });
    B.prop('forklift', 32, 0, 41.5, { ry: -H, variant: 'yellow' });
    mast(B, -30.5, 40.8, { h: 26, aim: [-46, 48], light: true, intensity: 1800, range: 60 });
    B.prop('jersey_barrier', -36, 0, 33.5, { ry: .05 }); B.prop('jersey_barrier', -14, 0, 33.6, { ry: -.05 });
    B.prop('semi_trailer', -8.5, 0, 34.4, { variant: 'flat', ry: H, seed: 1 }); ccont(B, -8.5, 1.35, 34.4, H, { len: 40, color: 'grey' });

    mark('customs lane'); // ================================================================== customs lane: checkpoint + B ramp
    B.box(30, 0, 21, 1.8, .15, 6, { mat: 'concrete' });
    B.box(30, .15, 20.6, 1.6, 1.0, 2.2, { mat: 'paint_white' }); B.box(30, 1.15, 20.6, 1.6, 1.2, 2.2, { mat: 'p_glass_tint', surf: 'glass', cast: false }); B.box(30, 2.35, 20.6, 1.9, .25, 2.5, { mat: 'p_paint_darkgrey' });
    B.light({ x: 30, y: 2.3, z: 20.6, intensity: 3, color: [1, .85, .6], fixture: 'bulb' });
    B.prop('gate', 27, .15, 23.6, { variant: 'barrier', len: 5.5 }); B.prop('gate', 33, .15, 18.4, { variant: 'barrier', len: 5.5, ry: PI });
    B.prop('jersey_barrier', 26, 0, 13, { ry: .1 }); B.prop('jersey_barrier', 34, 0, 9, { ry: -.1 });
    decal(B, 'sign', 'customs', 30, 3.05, 22.2, 3.8, .4, { face: 'n' }); B.box(30, 2.6, 22.08, 4, .9, .06, { mat: 'p_paint_darkgrey', collide: false });
    decal(B, 'sign', 'stop', 30, .012, 25, 3, .66, { ry: PI });
    B.hide(31.4, null, 19, { kind: 'dark' });
    B.prop('semi_trailer', 27, 0, -26, { variant: 'box', ry: PI, color: 'silver', seed: 1 });
    B.ramp({ x: 34, z: -9, w: 3.6, len: 10, y0: 0, y1: FL, dir: '+z', mat: 'concrete' });
    B.box(34, 0, .5, 4, FL, 9, { mat: 'concrete', mats: { t: 'concrete_floor' } });
    railing(B, 32.15, -14, 32.15, -5, 0, { collide: false });
    paint(B, 25, -36, 25, 30, { col: WHT, w: .12 }); paint(B, 30, -36, 30, 14, { col: YEL, w: .12, dash: [3, 3] });
    mast(B, 25.5, -18, { h: 22, aim: [34, -2], light: false });

    mark('SITE B'); // ================================================================== SITE B: bonded warehouse (floor y 1.1)
    const WX0 = 36, WX1 = 84, WZ0 = -14, WZ1 = 30;
    B.box((WX0 + WX1) / 2, 0, (WZ0 + WZ1) / 2, WX1 - WX0 - .6, FL, WZ1 - WZ0 - .6, { mat: 'concrete', mats: { t: 'concrete_floor' } });
    shell(B, { x0: WX0, z0: WZ0, x1: WX1, z1: WZ1 }, { t: .3, layers: [{ h: 2.6, out: 'concrete_panels', in: 'concrete_panels' }, { h: 9.4, out: 'corrugated', in: 'corrugated' }],
      ops: { s: [{ c: 54, w: 3.2, y: FL, h: 3.4 }, { c: 64, w: 3.2, y: FL, h: 3.4 }, { c: 74, w: 3.2, y: FL, h: 3.4 }],
        w: [{ c: 2, w: 4, y: FL, h: 4 }], n: [{ c: 42, w: 2.6, y: FL, h: 3.1 }],
        e: [{ c: 0, w: 6, y: 8.6, h: 1.4, glass: true }, { c: 16, w: 6, y: 8.6, h: 1.4, glass: true }] } });
    B.box(54, FL, WZ0 + .15, 3.25, 3.4, .12, { mat: 'corrugated' });                                   // dock 1 shutter closed
    B.box(74, FL + 1.32, WZ0 + .15, 3.25, 3.4 - 1.32, .12, { mat: 'corrugated' });                     // dock 3 half open (crouch)
    for (const x of [54, 64, 74]) B.box(x, FL + 3.4, WZ0 + .15, 3.5, .4, .45, { mat: 'p_paint_darkgrey', collide: false });
    B.box((WX0 + WX1) / 2, 12, (WZ0 + WZ1) / 2, WX1 - WX0 + .4, .35, WZ1 - WZ0 + .4, { mat: 'corrugated', mats: { b: 'corrugated' } });
    for (const z of [-5, 9, 21]) B.box(60, 11.99, z, 44, .02, 2.2, { mat: 'glass_frosted', collide: false, cast: false });
    // steel frame: columns along the long walls, trusses across
    for (let x = 39; x <= 81; x += 6) {
      for (const z of [WZ0 + .52, WZ1 - .52]) B.box(x, FL, z, .36, 12 - FL, .34, { mat: 'paint_blue', collide: true });
      B.box(x, 11.2, (WZ0 + WZ1) / 2, .22, .3, WZ1 - WZ0 - .6, { mat: 'steel_dark', collide: false });
      B.box(x, 10.2, (WZ0 + WZ1) / 2, .18, .2, WZ1 - WZ0 - .6, { mat: 'steel_dark', collide: false });
      for (let z = WZ0 + 2; z < WZ1 - 2; z += 4) B.box(x, 10.4, z, .1, .8, .1, { mat: 'steel_dark', collide: false });
    }
    // highbay lights (6 real, the rest emissive)
    for (const x of [46, 60, 74]) for (const z of [-4, 13]) { B.prop('light_fixture', x, 10.2, z, { variant: 'highbay' }); B.light({ x, y: 9.4, z, intensity: 55, color: [1, .93, .82], fixture: false, range: 22 }); }
    for (const x of [46, 60, 74]) B.prop('light_fixture', x, 10.2, 4.5, { variant: 'highbay' });
    // mezzanine along the north wall (deck y 4.6), stair, railing, office
    const MY = 4.6;
    B.box(48.2, MY - .25, 25.85, 23.8, .25, 7.7, { mat: 'metal_plate', mats: { b: 'steel_dark' }, surf: 'metal' });
    for (const x of [42, 48, 54, 59.8]) B.box(x, FL, 22.2, .25, MY - .25 - FL, .25, { mat: 'paint_yellow' });
    railing(B, 36.4, 22.08, 59.9, 22.08, MY, { mat: 'paint_yellow' }); railing(B, 59.98, 22.08, 59.98, 26.7, MY, { mat: 'paint_yellow' }); railing(B, 59.98, 28.45, 59.98, 29.6, MY, { mat: 'paint_yellow' });
    B.stairs({ x: 62.8, z: 27.6, w: 1.5, len: 5.6, y0: FL, y1: MY, dir: '-x', mat: 'steel_dark', tread: 'metal_plate', rail: 'left', railMat: 'paint_yellow' });
    shell(B, { x0: 36.3, z0: 23.4, x1: 47, z1: 29.7 }, { y: MY, t: .12, layers: [{ h: 3, out: 'plaster_white', in: 'plaster_white' }],
      ops: { s: [{ c: 45.6, w: 1, h: 2.1 }, { c: 39.5, w: 2.6, y: 1, h: 1.3, glass: true }, { c: 42.8, w: 1.6, y: 1, h: 1.3, glass: true }], e: [{ c: 26.5, w: 1.5, y: 1, h: 1.3, glass: true }] } });
    B.box(41.65, MY + 3, 26.55, 10.7, .1, 6.3, { mat: 'plaster_white', collide: false });
    B.light({ x: 41.5, y: MY + 2.95, z: 26.5, intensity: 5, color: [1, .94, .84], fixture: 'panel' });
    B.prop('desk', 39.8, MY, 28.8, { ry: PI, variant: 'metal' }); B.prop('filing_cabinet', 46.4, MY, 28.8, { ry: PI });
    B.prop('pallet', 52, MY, 27.5, { variant: 'boxes', stack: 1 }); B.prop('pallet', 55, MY, 28.2, { variant: 'wrap' }); B.prop('cardboard_box', 57.5, MY, 27.8, { variant: 'pile' });
    // racks (west half), aisles, dock staging, cage (east)
    for (const [i, [x, z, ry]] of [[44.6, 15.3, 0], [55.5, 15.3, 0], [44.6, 16.55, PI], [55.5, 16.55, PI], [44.6, 8.3, 0], [55.5, 8.3, 0], [44.6, 9.55, PI], [55.5, 9.55, PI],
      [44.6, -5.2, 0], [44.6, -3.95, PI]].entries()) B.prop('rack', x, FL, z, { ry, bays: 4, levels: 4, load: .5, seed: 1 + i % 2 });
    B.prop('vent', 39.4, FL, -13.05, { variant: 'duct', len: 2.4, ry: H, hide: true });
    // bonded cage
    const CG = { x0: 74, z0: 10, x1: 83.5, z1: 21 };
    B.prop('fence_chainlink', (CG.x0 + 77.5) / 2 + .5, FL, CG.z0, { len: 4.5, variant: 'plain', h: 2.6 });
    B.prop('fence_chainlink', CG.x0, FL, (CG.z0 + CG.z1) / 2, { len: CG.z1 - CG.z0, variant: 'plain', h: 2.6, ry: H });
    B.prop('fence_chainlink', (CG.x0 + CG.x1) / 2, FL, CG.z1, { len: CG.x1 - CG.x0, variant: 'plain', h: 2.6 });
    B.prop('crate', 81.8, FL, 19.6, { variant: 'large' }); B.prop('crate', 80.4, FL, 19.8, { variant: 'mil' }); B.prop('crate_stack', 79, FL, 12.2, { ry: .2 });
    B.prop('pallet', 82.6, FL, 14.5, { variant: 'wrap', ry: H }); B.hide(82.4, FL, 17, { kind: 'crates' });
    // site floor clutter: wrapped pallets, totes, a forklift, crates
    for (const [x, z, v] of [[66, 3, 'wrap'], [67.3, 3, 'boxes'], [72, -6, 'wrap'], [69, 9.5, 'sacks'], [77, -2, 'drums']]) B.prop('pallet', x, FL, z, { variant: v, stack: 1 });
    B.prop('ibc_tank', 79.5, FL, 4, {}); B.prop('ibc_tank', 80.8, FL, 4, { variant: 'blue' });
    pcont(B, 69.5, FL, 7.6, H, { color: 'red', doors: 'open', hide: true });                          // a box being stripped
    bigBags(B, 78.2, FL, -5, H, { n: 3 }); bigBags(B, 66.6, FL, -6.5, 0, { n: 2 });
    for (const [x, z] of [[73.5, -1.5], [64.5, 11.8]]) { B.prop('pallet', x, FL, z, { variant: 'wrap', h: 1.1, seed: 2 }); B.prop('pallet', x, FL + 1.25, z, { variant: 'wrap', h: 1.0, seed: 3 }); }
    B.prop('crate', 76, FL, 9.2, { variant: 'large' }); B.prop('crate', 77.3, FL, 9.3, { variant: 'medium' });
    B.prop('forklift', 70.5, FL, 15, { ry: PI * .8, variant: 'yellow' });
    B.prop('crate_stack', 64, FL, -9, { ry: H });
    B.prop('pallet_jack', 74, FL, -11, { ry: .5 });
    paint(B, 36.6, -1, 83.4, -1, { col: YEL, w: .1, y: FL + .012 }); paint(B, 36.6, 5, 83.4, 5, { col: YEL, w: .1, y: FL + .012 });
    paint(B, 62, -13.4, 62, 21.8, { col: YEL, w: .1, y: FL + .012 });
    decal(B, 'sign', 'B', 71, FL + .012, 1.5, 4.5, 4.5, { col: YEL });
    decal(B, 'sign', 'B', 83.68, FL + 4.5, 1.5, 3, 3, { face: 'w', col: [.95, .95, .9] });
    decal(B, 'sign', 'bonded', 52, 9.4, WZ0 - .02, 14, 1.4, { face: 's' }); decal(B, 'sign', 'bonded', 60, 9.4, WZ1 + .02, 14, 1.4, { face: 'n' });
    for (const [x, n] of [[54, 'dock1'], [64, 'dock2'], [74, 'dock3']]) decal(B, 'sign', n, x, FL + 3.95, WZ0 - .02, 2.2, .26, { face: 's' });
    // north door: landing + steps
    B.box(42, 0, 31, 4, FL, 2, { mat: 'concrete', mats: { t: 'concrete_floor' } });
    B.stairs({ x: 42, z: 33.25, w: 2.6, len: 2.5, y0: 0, y1: FL, dir: '-z', mat: 'concrete' });
    // dock platform, bumpers, stairs; trailers backed in
    B.box(64, 0, -15.3, 32, FL, 2.6, { mat: 'concrete', mats: { t: 'concrete_floor' } });
    B.box(64, FL - .02, -16.55, 32, .02, .12, { mat: 'paint_yellow', collide: false });
    for (const x of [54, 64, 74]) for (const s of [-1, 1]) B.box(x + s * 1.9, .25, -16.7, .3, .5, .2, { mat: 'rubber' });
    B.stairs({ x: 47.2, z: -15.3, w: 2.2, len: 1.6, y0: 0, y1: FL, dir: '+x', mat: 'concrete' });
    B.prop('semi_trailer', 54, 0, -23.6, { variant: 'box', ry: PI, color: 'blue', seed: 1 });
    B.prop('semi_trailer', 81.5, 0, -27, { variant: 'box', ry: PI * .97, color: 'red', seed: 1 });
    B.prop('truck_tractor', 46, 0, -29, { ry: .35, variant: 'red' });
    B.prop('dumpster', 39.4, 0, -16.3, { variant: 'green', hide: true }); B.prop('dumpster', 39.4, 0, -18.6, { variant: 'grey' });
    B.prop('pallet', 69, 0, -20, { variant: 'none', stack: 8 }); B.prop('pallet', 70.4, 0, -20.2, { variant: 'none', stack: 5 });
    B.hide(57.8, null, -24, { kind: 'car' });
    for (const x of [44, 58, 69, 79]) B.box(x, 9.5, WZ0 - .2, .3, .25, .25, { mat: 'emissive_warm', collide: false, cast: false });
    mast(B, 70, -34.5, { h: 24, aim: [62, -18], light: true, intensity: 1600, range: 52 });
    for (const [x, z] of [[60, -20], [66, -26], [75, -21]]) decal(B, 'stain', ['oil1', 'tyre', 'drip'][Math.floor(R() * 3)], x, .013, z, 3, 3, { ry: R() * 6 });

    mark('out of bounds'); // ================================================================== out of bounds: ship, town, terminal, outside roads
    freighter(B, { zHull: 66.4, xStern: -128, xBow: 62, deck: 7.5, beam: 24 });
    skyline(B);
    for (let x = -190; x < 190; x += 26) { B.prop('utility_pole', x, 0, -64.6, { variant: 'wood', span: 26, h: 9, seed: 1, inst: false }); }
    for (const [i, x] of [-60, -48, -20, 26, 50, 74].entries()) B.prop('car', x, 0, -76.6, { ry: H * (i % 2 ? 1 : -1), ...CARS[i % 5], collide: false, inst: false });
    paint(B, -200, -72, 200, -72, { col: WHT, w: .12, dash: [3, 6] });
    for (let i = 0; i < 9; i++) ccont(B, -88, i < 5 ? 0 : 2.591, -30 + (i % 5) * 9, H, { color: PAL[i * 3 % PAL.length], len: 20, collide: false });
    for (let i = 0; i < 6; i++) ccont(B, 96, 0, -40 + i * 8, H, { color: PAL[i * 5 % PAL.length], len: 20, collide: false });

    mark('objectives'); // ================================================================== objectives
    B.site('A', { x0: -60, z0: 40, x1: -39, z1: 58, y: 0 });
    B.site('B', { x0: 63, z0: -10, x1: 80, z1: 12, y: FL });
    B.hostage(80.5, FL, 16.5); B.hostage(41.5, MY, 26.2); B.hostage(-76.2, 0, 41.5); B.hostage(28.6, 0, 21.5); B.hostage(-18, 0, -10.6);
    B.point('dom1', -61, null, -8, 4); B.point('dom2', -19, null, -14.5, 4); B.point('dom3', 62, null, -26, 4);
    B.point('hp1', -19, null, -14.5, 5); B.point('hp2', -50, null, 43, 5); B.point('hp3', -14, null, 49, 5); B.point('hp4', 70, FL, 3, 5); B.point('hp5', 62, null, -26, 5);
    B.point('hill', -19, null, -14.5, 6);
    B.point('flag1', -20, null, -54, 1.5); B.point('flag2', 8, null, 32.5, 1.5);
    B.point('extract1', -72, null, 57, 3); B.point('extract2', 84, null, -30, 3); B.point('extract3', 30, null, 33.5, 3);
    B.point('hq1', -61, null, 22, 4); B.point('hq2', 30, null, 4, 4);

    mark('field + FFA'); // ================================================================== field + FFA spawns
    for (const [x, z] of [[-52, -54.6], [-45, -57], [-70, -40], [-35, -41.5], [-5, -38.5], [25, -42.5], [30, -52], [62, -51], [-62, -28], [12, -51]])
      B.spawn(1, x, null, z, face(x, z, -10, 0), { field: true });
    for (const [x, z] of [[-30, 51], [-12, 58], [25, 49], [33, 61], [-15, 32], [46, 33.5], [31, 27], [-66, 42], [0, 33.5], [-46, 33]])
      B.spawn(2, x, null, z, face(x, z, -10, 0), { field: true });
    for (const [x, y, z] of [[-56, null, -55], [-70, null, -40], [-58, null, -12], [-73.6, GY, 0], [-50, null, 15], [-19, null, -17], [-26.5, null, 22], [-1, null, 5],
      [12, null, -12.5], [30, null, -24], [30, null, 8], [50, FL, 2], [70, FL, -2], [60, null, -27], [80, null, -42], [-50, null, 45], [-16, null, 50], [28, null, 52],
      [-72, null, 31], [-40, null, -40], [10, null, -55], [-42, null, -10], [11.5, null, 6]])
      B.spawn(0, x, y, z, face(x, z, -10, 0));

    mark('spawns'); finish(B); mark('finish');
    if (globalThis.__HB_PROF) console.log('[hb] prof ' + PF.out.join(', '));
  },
};
