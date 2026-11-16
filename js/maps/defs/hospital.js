/* LIVE FIRE — St. Aldric General (map "hospital"): a closed-down 1970s city general hospital at night, running on emergency
   power. Three levels in one 96 x 54 m block (B1 y -4, ground y 0, first floor y 4), a double-height atrium (mid) with a
   gallery, an ambulance station across the ring road (team 1 lobby) and the basement mortuary (team 2 lobby).
   A site = Theatre 1 (first floor, west wing): south via the theatre corridor / prep room (stair S from the ED), east via
   recovery (gallery / ward), north from the back corridor (stair W from B1 and the ED).
   B site = the pharmacy (ground floor, east wing): front counter from the outpatients corridor, the stock room's loading door
   from the service yard, the lockers' door, and stair E from B1.
   Plan, routes and timings: tools/test/out/notes-map-hospital.md. Map kit (materials, signs, custom props): js/maps/kit_hospital.js.
   Exports: default MapDef */
import { wx, wz, slab, finish, fixtures, dogleg, sign, flushDecals, skyline, cut, P } from '../kit_hospital.js';

// levels
const FB = -4, F0 = 0, F1 = 4;           // floors: basement, ground, first
const C0 = 3.0, C1 = 7.0;               // ceilings (slab bottoms) of ground and first floor
const RS = 3.5;                         // top of the single-storey roofs (ED hall, east wing)
const H0 = 3.4, HR = 3.3, HG = 3.7;     // interior wall heights: under the first-floor slab, under a single-storey roof, under the gallery
const ATR = 8.4;                        // atrium roof slab bottom
// shafts (inside rects)
const STW = { x0: -48, z0: 30, x1: -44.4, z1: 36.5 };      // stair W (B1 / G / 1)
const STC = { x0: 4, z0: 8, x1: 10.6, z1: 11.6 };          // central stair (B1 / G / 1)
const STE = { x0: 44.4, z0: 30, x1: 48, z1: 36.5 };        // stair E (B1 / G)
const SLOT = { x0: -38, z0: 0, x1: -36, z1: 7.0 };         // stair S (G / 1, straight)

// walls: openings
const D = (c, kind = 'white', w = 1.02, open = 95, toLeft = true) => ({ c, w, h: 2.16, door: kind, open, toLeft });
const D2 = (c, kind = 'double', open = 92, toLeft = true, w = 1.82) => ({ c, w, h: 2.16, door: kind, open, toLeft });
const O = (c, w, h = 2.5, frame) => ({ c, w, h, frame });
const WIN = (c, w = 1.6, y = .95, h = 1.4, o = {}) => Object.assign({ c, w, y, h, win: 'modern' }, o);
const BRD = (c, side, w = 1.6, y = .95, h = 1.4) => ({ c, w, y, h, board: side, glass: false, frame: false });
// wall finishes
const CORR = { band: 'hs_band', wall: 'hs_wall' };
const both = (m, band) => ({ n: m, s: m, w: m, e: m, band: band ? { n: band, s: band, w: band, e: band } : undefined });

export default {
  id: 'hospital', name: 'St. Aldric General', size: 'M',
  desc: 'A closed-down city hospital at night: ambulance station, emergency department, atrium, theatres, pharmacy and the basement mortuary.',
  env: { hdri: 'night_city', sky: 'night', time: 'night', exposure: 1.15, sun: { dir: [.35, -.75, .55], color: [.6, .7, 1], intensity: .8 },
    ambient: [.32, .34, .38], fog: { color: [.035, .04, .05], density: .006 }, weather: 'clear', ambience: 'hospital', reverb: 'room', indoorIbl: .6 },
  bounds: { minX: -54, maxX: 62, minZ: -86, maxZ: 41.5, minY: -6, maxY: 14 },
  chunk: 40,

  build(B) {
    ground(B); shell(B); floorsAndRoofs(B); groundFloor(B); firstFloor(B); basement(B); stairs(B); garage(B); outdoors(B);
    dress(B); lights(B); markers(B); skylineAll(B);
    flushDecals(B);
  },
};

// =============================================================================================================== ground
function ground(B) {
  // outdoor surfaces around the building and the garage (the building and the garage carry their own floors)
  const ALL = { x0: -54, z0: -86, x1: 62, z1: 41.5 };
  const BLD = { x0: -48.15, z0: -14.15, x1: 48.15, z1: 40.15 }, GAR = { x0: -12.15, z0: -84.15, x1: 12.15, z1: -69.85 };
  // base (grass / soil) under everything outside: the specific surfaces sit on top of it
  const zones = [
    { r: { x0: -54, z0: -62, x1: 62, z1: -54 }, mat: 'asphalt' },                 // ring road
    { r: { x0: -14, z0: -70, x1: 14, z1: -62 }, mat: 'concrete_floor' },          // garage apron
    { r: { x0: -48, z0: -54, x1: -28, z1: -14.15 }, mat: 'asphalt' },             // ED ambulance drive
    { r: { x0: 8, z0: -54, x1: 48.15, z1: -18 }, mat: 'asphalt' },                // visitor car park
    { r: { x0: 48.15, z0: -54, x1: 62, z1: 41.5 }, mat: 'concrete_floor' },       // service yard
  ];
  const raised = [   // pavements and the entrance plaza (12 cm kerb)
    { r: { x0: -8, z0: -54, x1: 8, z1: -14.15 }, mat: 'pavement' },               // entrance plaza
    { r: { x0: -28, z0: -54, x1: -8, z1: -50 }, mat: 'pavement' },
    { r: { x0: 8, z0: -18, x1: 48.15, z1: -14.15 }, mat: 'pavement' },            // walk along the outpatients facade
    { r: { x0: -54, z0: -54, x1: -48, z1: -14.15 }, mat: 'pavement' },
  ];
  const lawn = { r: { x0: -28, z0: -50, x1: -8, z1: -14.15 }, mat: 'grass' };
  const holes = [BLD, GAR];
  for (const z of zones) for (const r of cut(z.r, holes)) B.floor(r.x0, r.z0, r.x1, r.z1, 0, { mat: z.mat, t: .4 });
  for (const z of raised) for (const r of cut(z.r, holes)) B.floor(r.x0, r.z0, r.x1, r.z1, .12, { mat: z.mat, t: .5 });
  for (const r of cut(lawn.r, holes)) B.floor(r.x0, r.z0, r.x1, r.z1, .1, { mat: lawn.mat, t: .5 });
  // verges beside the garage (out of reach behind the boundary fence) and the strip behind the building
  for (const r of cut({ x0: -54, z0: -86, x1: 62, z1: -62 }, [GAR, { x0: -14, z0: -70, x1: 14, z1: -62 }])) B.floor(r.x0, r.z0, r.x1, r.z1, .05, { mat: 'grass', t: .4 });
  B.floor(-54, 40.15, 48.15, 41.5, .05, { mat: 'gravel', t: .4 });
  B.floor(-54, -14.15, -48.15, 40.15, .05, { mat: 'grass', t: .4 });
  // kerbs (concrete edge strips) along the raised areas
  const kerb = (x0, z0, x1, z1) => B.box((x0 + x1) / 2, 0, (z0 + z1) / 2, Math.abs(x1 - x0) || .15, .14, Math.abs(z1 - z0) || .15, { mat: 'p_concrete_precast', collide: false });
  kerb(-28, -54, 8, -54); kerb(8, -18, 48.15, -18); kerb(-8, -50, -8, -14.15); kerb(8, -50, 8, -18); kerb(-28, -50, -28, -14.15); kerb(-48, -54, -48, -14.15);
}

// =============================================================================================================== exterior shell
function shell(B) {
  const ext = { n: 'hs_render', s: 'hs_render', w: 'hs_render', e: 'hs_render', t: .3 };
  const IN = 'hs_wall_cream';
  // --- south facade z = -14 (outside = south)
  wx(B, -14, -48.15, -16, { y: 0, h: 4.7, t: .3, n: IN, s: 'hs_render', band: { s: 'brick_red', n: 'hs_band_blue', h: 1.1 }, skirt: 'n',
    ops: [O(-34, 4.0, 2.7, 'p_paint_darkgrey'), BRD(-44, -1, 1.8), BRD(-40, -1, 1.8), BRD(-28, -1, 1.8), BRD(-24, -1, 1.8), BRD(-20, -1, 1.8)] });
  wx(B, -14, 16, 48.15, { y: 0, h: 4.7, t: .3, n: IN, s: 'hs_render', band: { s: 'brick_red', n: 'hs_band_blue', h: 1.1 }, skirt: 'n',
    ops: [O(30, 3.2, 2.6, 'p_paint_darkgrey'), BRD(20, -1, 2.0), BRD(24, -1, 2.0), BRD(36, -1, 2.0), BRD(42, -1, 1.6), BRD(46, -1, 1.2)] });
  curtainWall(B);
  // --- west facade x = -48 (outside = west)
  wz(B, -48, -13.85, 0, { y: 0, h: 4.7, t: .3, w: 'hs_render', e: IN, band: { w: 'brick_red', e: 'hs_band_blue', h: 1.1 }, skirt: 'e', ops: [BRD(-10, 1, 1.8), BRD(-4, 1, 1.8)] });
  wz(B, -48, 0, 39.85, { y: 0, h: 4.0, t: .3, w: 'hs_render', e: 'hs_wall', band: { w: 'brick_red', h: 1.1 }, skirt: 'e', ops: [BRD(3.5, 1, 1.4), BRD(24.5, 1, 1.8)] });
  wz(B, -48, 0, 39.85, { y: 4.0, h: 4.4, t: .3, w: 'hs_render', e: 'hs_wall', skirt: 'e', ops: [WIN(3.5, 1.6, .9), WIN(13.5, 1.8, .9), WIN(38.2, 1.2, .9)] });
  // --- north facade z = 40 (outside = north)
  wx(B, 40, -48.15, 48.15, { y: 0, h: 4.0, t: .3, n: 'hs_render', s: 'hs_wall', band: { n: 'brick_red', h: 1.1 }, skirt: 's' });
  wx(B, 40, -48.15, 16, { y: 4.0, h: 4.4, t: .3, n: 'hs_render', s: 'hs_wall', skirt: 's', ops: [WIN(-22, 1.6, .9), WIN(-11, 2.0, .9), WIN(-1, 2.0, .9), WIN(9, 2.0, .9)] });
  wx(B, 40, 16, 48.15, { y: 4.0, h: .7, t: .3, n: 'hs_render', s: 'hs_render', skirt: false });
  // --- east facade x = 48 (outside = east)
  wz(B, 48, -13.85, 39.85, { y: 0, h: 4.7, t: .3, w: IN, e: 'hs_render', band: { e: 'brick_red', h: 1.1 }, skirt: 'w',
    ops: [BRD(-10, -1, 1.6), BRD(-1, -1, 1.6), O(18.75, 3.6, 2.8, 'p_paint_darkgrey'), BRD(8, -1, 1.6), BRD(26, -1, 1.6), { c: 33.9, w: 1.4, y: 3.5, h: 1.2, frame: false }] });
  // --- first floor outer walls over the single-storey roofs
  wx(B, 0, -47.85, -16, { y: C0 + .02, h: 5.38, t: .3, n: 'hs_wall', s: 'hs_render', skirt: false,
    ops: [WIN(-45, 1.6, 1.9), WIN(-41, 1.2, 1.9), WIN(-30, 1.8, 1.9), WIN(-24, 1.8, 1.9), WIN(-19, 1.8, 1.9)] });
  wz(B, 16, 8.15, 39.85, { y: C0 + .02, h: 5.38, t: .3, w: 'hs_wall', e: 'hs_render', skirt: false,
    ops: [{ c: 24, w: 1.12, y: .98, h: 2.16, door: 'metal', open: 100, toLeft: false }, WIN(13, 1.8, 1.9), WIN(18.5, 1.6, 1.9), WIN(31, 1.8, 1.9), WIN(36, 1.8, 1.9)] });
  // --- atrium walls above the low roofs (clerestory windows to the east, gallery windows to the west)
  wz(B, -16, -14, 0, { y: C0, h: 6.6, t: .3, w: 'hs_render', e: 'hs_wall_cream', skirt: false, ops: [WIN(-11, 2.4, 2.0, 1.6), WIN(-6, 2.4, 2.0, 1.6)] });
  wz(B, 16, -14, 8, { y: C0, h: 6.6, t: .3, w: 'hs_wall_cream', e: 'hs_render', skirt: false, ops: [WIN(-10, 3.0, 1.8, 3.0), WIN(-4, 3.0, 1.8, 3.0), WIN(2, 3.0, 1.8, 3.0)] });
  wx(B, 8, -16, 16, { y: 7.4, h: 2.2, t: .3, n: 'hs_render', s: 'hs_wall_cream', skirt: false });
  wz(B, -16, 0, 8, { y: 7.4, h: 2.2, t: .3, w: 'hs_render', e: 'hs_wall_cream', skirt: false });
  // --- parapet copings (thin cap strips)
  const cop = (x0, z0, x1, z1, y) => B.box((x0 + x1) / 2, y, (z0 + z1) / 2, Math.abs(x1 - x0) + .4, .08, Math.abs(z1 - z0) + .4, { mat: 'p_concrete_precast', collide: false });
  cop(-48.15, -14, -16, -14, 4.7); cop(16, -14, 48.15, -14, 4.7); cop(-48, -14, -48, 0, 4.7); cop(48, -14, 48, 40, 4.7); cop(16, 40, 48, 40, 4.7);
  cop(-48, 0, -48, 40, 8.4); cop(-48, 40, 16, 40, 8.4); cop(16, 8, 16, 40, 8.4); cop(-48, 0, -16, 0, 8.4);
  cop(-16, -14, 16, -14, 9.6); cop(-16, -14, -16, 8, 9.6); cop(16, -14, 16, 8, 9.6); cop(-16, 8, 16, 8, 9.6);
}
/** the atrium's glazed south front: mullion grid, glass, some boarded panes, the main entrance gap */
function curtainWall(B) {
  const z = -14, x0 = -16, x1 = 16, top = 9.6;
  // structure: a solid band at the top and bottom
  for (const s of [-1, 1]) B.box(s * 9.25, 0, z, 13.5, .5, .3, { mat: 'p_concrete_precast' });
  B.box(0, 8.3, z, 32.3, top - 8.3, .35, { mat: 'hs_spandrel' });
  B.box(0, 3.6, z, 32.3, .45, .32, { mat: 'hs_spandrel', collide: false });
  const cols = 16, cw = (x1 - x0) / cols;
  for (let i = 0; i <= cols; i++) B.box(x0 + i * cw, .5, z, .1, 7.9, .22, { mat: 'p_paint_darkgrey', collide: false });
  for (const y of [2.6, 6.1]) B.box(0, y, z, 32, .08, .2, { mat: 'p_paint_darkgrey', collide: false });
  // panes: glass with colliders; the entrance (x -2.5..2.5) is open below 3.6; boarded panes on the ground row
  const boarded = new Set([0, 1, 4, 11, 13, 15]);
  for (let i = 0; i < cols; i++) {
    const xc = x0 + (i + .5) * cw;
    for (const [y0, y1] of [[.5, 2.6], [2.68, 3.6], [4.05, 6.1], [6.18, 8.4]]) {
      if (y0 < 3 && Math.abs(xc) < 2.6) continue;     // main entrance
      if (y0 < .6 && boarded.has(i)) { B.box(xc, .5, z - .14, cw - .05, 2.1, .03, { mat: 'plywood', surf: 'wood' }); B.box(xc, y0, z, cw - .1, y1 - y0, .02, { mat: 'glass', surf: 'glass', cast: false, collide: false }); continue; }
      B.box(xc, y0, z, cw - .1, y1 - y0, .02, { mat: 'glass', surf: 'glass', cast: false });
    }
  }
  // the entrance threshold and a header over the doors
  B.box(0, 2.6, z, 5.2, 1.0, .3, { mat: 'hs_spandrel' });
  // collider so nobody slips past the glass edge at the door jambs
  for (const s of [-1, 1]) B.box(s * 2.55, .5, z, .12, 2.1, .3, { mat: 'p_paint_darkgrey' });
}

// =============================================================================================================== floors, ceilings, roofs
function floorsAndRoofs(B) {
  const BLD = { x0: -48, z0: -14, x1: 48, z1: 40 };
  // basement footprint (its roof is the ground-floor slab -1..0)
  const B1 = [{ x0: -48, z0: 26, x1: -12, z1: 40 }, { x0: -12, z0: 20, x1: 48, z1: 40 }, { x0: 0, z0: 8, x1: 4, z1: 20 }, STC];
  const shafts = [STW, STC, STE];
  // ground slab where there is no basement
  for (const r of cut(BLD, B1)) slab(B, r.x0, r.z0, r.x1, r.z1, -.4, F0, { skipTop: true, skipBot: true });
  // ground-floor slab over the basement (its underside = the basement ceiling)
  for (const b of B1) for (const r of cut(b, shafts)) slab(B, r.x0, r.z0, r.x1, r.z1, -1, F0, { skipTop: true, bot: 'concrete', side: 'concrete' });
  // basement floor
  for (const b of B1) slab(B, b.x0, b.z0, b.x1, b.z1, FB - .3, FB, { skipTop: true, skipBot: true });
  // first-floor slab (3..4) over the west wing north part and the centre north part, minus the stair openings
  const L1 = [{ x0: -48, z0: 0, x1: -16, z1: 40 }, { x0: -16, z0: 8, x1: 16, z1: 40 }];
  for (const b of L1) for (const r of cut(b, [STW, STC, SLOT])) slab(B, r.x0, r.z0, r.x1, r.z1, C0, F1, { skipTop: true, bot: 'ceiling_tile' });
  // galleries (cantilevered slab 3.6..4)
  slab(B, -16, -14, -11, 4, 3.6, F1, { skipTop: true, bot: 'plaster_white', side: 'plaster_white' });
  slab(B, -11, 4, 16, 8, 3.6, F1, { skipTop: true, bot: 'plaster_white', side: 'plaster_white' });
  // roof over the first floor (7..7.6)
  for (const b of L1) slab(B, b.x0, b.z0, b.x1, b.z1, C1, 7.6, { top: 'hs_roof', bot: 'ceiling_tile' });
  // single-storey roofs (3..3.5): ED hall, east wing
  slab(B, -48, -14, -16, 0, C0, RS, { top: 'hs_roof', bot: 'ceiling_tile' });
  slab(B, 16, -14, 48, 40, C0, RS, { top: 'hs_roof', bot: 'ceiling_tile' });
  // atrium roof (8.4..9) with four roof lights
  const sky = [[-6, -8], [6, -8], [-6, -1], [6, -1]].map(([x, z]) => ({ x0: x - 2.5, z0: z - 2, x1: x + 2.5, z1: z + 2 }));
  for (const r of cut({ x0: -16, z0: -14, x1: 16, z1: 8 }, sky)) slab(B, r.x0, r.z0, r.x1, r.z1, ATR, 9.0, { top: 'hs_roof', bot: 'plaster_white', side: 'plaster_white' });
  for (const s of sky) {
    B.box((s.x0 + s.x1) / 2, 9.0, (s.z0 + s.z1) / 2, s.x1 - s.x0 + .2, .45, s.z1 - s.z0 + .2, { mat: 'p_alu', skip: 'tb', collide: false });
    B.box((s.x0 + s.x1) / 2, 9.4, (s.z0 + s.z1) / 2, s.x1 - s.x0, .03, s.z1 - s.z0, { mat: 'glass_frosted', surf: 'glass', cast: false });
    for (let k = 1; k < 4; k++) B.box(s.x0 + k * (s.x1 - s.x0) / 4, 9.0, (s.z0 + s.z1) / 2, .06, .46, s.z1 - s.z0, { mat: 'p_alu', collide: false });
  }
}

// =============================================================================================================== ground floor (y 0)
function groundFloor(B) {
  const y = F0;
  // ----- floor finishes
  const FIN = [
    [-48, -14, -16, 0, 'hs_lino'],            // ED hall
    [-48, 0, -38, 8, 'hs_lino'], [-38, 0, -36, 8, 'hs_lino_blue'], [-36, 0, -32, 40, 'hs_lino_blue'],
    [-48, 8, -36, 19, 'hs_lino'], [-48, 19, -36, 30, 'hs_lino'], [-44.4, 30, -36, 40, 'hs_lino_blue'], [-48, 36.5, -44.4, 40, 'hs_lino_blue'],
    [-32, 0, -16, 22, 'hs_lino_ward'], [-32, 26, -16, 40, 'hs_lino'], [-32, 22, 16, 26, 'hs_lino_blue'],
    [-16, -14, 16, 8, 'hs_terrazzo'], [-16, 8, -4, 22, 'carpet'], [-4, 8, 4, 22, 'hs_terrazzo'], [4, 11.6, 16, 22, 'hs_lino'], [10.6, 8, 16, 11.6, 'hs_lino'],
    [-16, 26, -2, 40, 'parquet'], [-2, 26, 16, 40, 'hs_lino'],
    [16, -14, 40, 4, 'hs_lino_blue'], [40, -14, 48, 4, 'hs_lino'], [16, 4, 26, 30, 'hs_lino_blue'], [16, 30, 20, 40, 'hs_lino_blue'],
    [26, 4, 40, 30, 'hs_lino'], [40, 4, 48, 30, 'concrete_floor'], [20, 30, 44.4, 40, 'hs_lino'], [44.4, 36.5, 48, 40, 'hs_lino'],
  ];
  for (const [x0, z0, x1, z1, m] of FIN) finish(B, x0, z0, x1, z1, y, m);

  // ----- west wing
  // ED hall north wall (single-storey roof on the south side; the first-floor wall stands on it from y 3)
  wx(B, 0, -48, -16, { y, h: C0, n: 'hs_wall', s: 'hs_wall_cream', band: { s: 'hs_band_blue', n: 'hs_band' },
    ops: [D(-45.5, 'white', 1.02, 100, true), D(-40.5, 'white', 1.02, 100, true), O(-37, 1.9, 2.6), O(-34, 3.8, 2.7), D2(-22, 'double', 95, true)] });
  wz(B, -43, 0, 8, { y, h: H0, ...both('hs_wall') });
  wz(B, -38, 0, 8, { y, h: H0, w: 'hs_wall', e: 'hs_wall_cream', skirt: 'w' });
  wx(B, 8, -48, -36, { y, h: H0, ...both('hs_wall') });
  wx(B, 19, -48, -36, { y, h: H0, n: 'hs_wall', s: 'hs_wall_cream' });
  wx(B, 30, -48, -36, { y, h: H0, n: 'hs_wall', s: 'hs_wall' });
  // ED corridor
  wz(B, -36, 0, 40, { y, h: H0, w: 'hs_wall_cream', e: 'hs_wall', band: { e: 'hs_band' }, rail: 'e',
    ops: [D(13.5, 'metal', 1.22, 100, true), D(24.5, 'white', 1.02, 100, true), O(33, 3.0, 2.5)] });
  wz(B, -32, 0, 22, { y, h: H0, w: 'hs_wall', e: 'hs_wall', band: { w: 'hs_band', e: 'hs_band' }, rail: 'w', ops: [D2(11, 'double', 92, false)] });
  wz(B, -32, 26, 40, { y, h: H0, w: 'hs_wall', e: 'hs_wall', band: { w: 'hs_band' }, rail: 'w', ops: [D(33, 'white', 1.22, 95, false)] });
  wx(B, 22, -32, -16, { y, h: H0, n: 'hs_wall', s: 'hs_wall', band: { n: 'hs_band', s: 'hs_band' }, rail: 'n', ops: [D2(-24, 'double', 92, false)] });
  wx(B, 26, -32, -16, { y, h: H0, n: 'hs_wall', s: 'hs_wall', band: { s: 'hs_band' }, rail: 's', ops: [D(-20, 'white', 1.22, 95, true)] });
  wz(B, -16, 0, 8, { y, h: HG, w: 'hs_wall', e: 'hs_wall_cream' });
  wz(B, -16, 8, 22, { y, h: H0, w: 'hs_wall', e: 'hs_wall' });
  wz(B, -16, 26, 40, { y, h: H0, w: 'hs_wall', e: 'plaster_white', ops: [D(33, 'wood', 1.02, 100, true)] });
  // stair W: shaft walls and the lobby
  wz(B, STW.x1, 30, 36.5, { y, h: H0, w: 'hs_wall', e: 'hs_wall', ops: [O(30.85, 1.4, 2.3)] });
  wx(B, 36.5, -48, -44.4, { y, h: H0, n: 'hs_wall', s: 'hs_wall' });

  // ----- centre
  wz(B, -16, -14, 0, { y, h: C0, t: .3, w: 'hs_wall_cream', e: 'hs_wall_cream', band: { w: 'hs_band_blue' }, ops: [O(-7, 4.0, 2.8, 'p_paint_darkgrey')] });
  wx(B, 8, -16, 16, { y, h: HG, n: 'hs_wall', s: 'hs_wall_cream', ops: [D(-10, 'wood', 1.22, 95, true), O(0, 6.0, 2.8, 'p_paint_darkgrey')] });
  wz(B, -4, 8, 22, { y, h: H0, w: 'hs_wall', e: 'plaster_white' });
  wx(B, 22, -16, -4, { y, h: H0, n: 'hs_wall', s: 'hs_wall', band: { n: 'hs_band' }, rail: 'n', ops: [D(-10, 'wood', 1.22, 95, false)] });
  wz(B, 4, 8, 22, { y, h: H0, w: 'plaster_white', e: 'hs_wall', ops: [O(9.8, 3.0, 2.4), D(17, 'metal', 1.02, 92, false)] });
  wx(B, STC.z1, 4, 10.6, { y, h: H0, ...both('hs_wall') });
  wz(B, 10.6, 8, 22, { y, h: H0, ...both('hs_wall') });
  wx(B, 22, 4, 16, { y, h: H0, n: 'hs_wall', s: 'hs_wall', band: { n: 'hs_band' }, ops: [D(13, 'white', 1.02, 92, false)] });
  wz(B, 16, -14, 8, { y, h: C0, t: .3, w: 'hs_wall_cream', e: 'hs_wall', band: { e: 'hs_band_blue' }, ops: [O(-6.5, 5.0, 2.8, 'p_paint_darkgrey')] });
  wz(B, 16, 8, 22, { y, h: H0, w: 'hs_wall', e: 'hs_wall', band: { e: 'hs_band_blue' }, rail: 'e' });
  wz(B, 16, 26, 40, { y, h: H0, w: 'hs_wall_cream', e: 'hs_wall', band: { e: 'hs_band_blue' }, rail: 'e', ops: [D(33, 'white', 1.22, 95, true)] });
  wx(B, 26, -16, 16, { y, h: H0, n: 'hs_wall', s: 'hs_wall', band: { s: 'hs_band' }, rail: 's', ops: [D2(-9, 'double', 95, true, 1.72), D(8, 'white', 1.22, 95, true)] });
  wz(B, -2, 26, 40, { y, h: H0, w: 'plaster_white', e: 'hs_wall_cream' });

  // ----- east wing
  wx(B, 4, 26, 48, { y, h: HR, n: 'hs_wall', s: 'hs_wall_cream', band: { s: 'hs_band_blue' } });
  wz(B, 40, -14, 4, { y, h: HR, w: 'hs_wall_cream', e: 'hs_wall', band: { w: 'hs_band_blue' }, ops: [D(-9.5, 'white', 1.02, 95, false), D(-.5, 'white', 1.02, 95, false)] });
  wx(B, -5, 40, 48, { y, h: HR, ...both('hs_wall') });
  wz(B, 20, 30, 40, { y, h: HR, w: 'hs_wall', e: 'hs_wall', band: { w: 'hs_band_blue' }, ops: [D(35, 'white', 1.22, 95, false)] });
  // pharmacy front: counter run with glazing (one bay broken out), staff door
  wz(B, 26, 4, 30, { y, h: HR, w: 'hs_wall', e: 'plaster_white', band: { w: 'hs_band_blue' }, ops: [{ c: 11, w: 10, y: 0, h: 3.0, frame: false }, D(19, 'white', 1.22, 100, false)] });
  pharmacyCounter(B);
  wx(B, 30, 20, 44.4, { y, h: HR, n: 'hs_wall', s: 'plaster_white', ops: [D2(33, 'double', 95, false, 1.72)] });
  wz(B, 40, 4, 30, { y, h: HR, w: 'plaster_white', e: 'hs_wall_cream', ops: [O(15, 6.0, 2.6), D(26, 'white', 1.22, 95, true)] });
  wz(B, STE.x0, 30, 36.5, { y, h: HR, ...both('hs_wall') });
  wx(B, 36.5, STE.x0, 48, { y, h: HR, ...both('hs_wall') });
  wx(B, 30, STE.x0, 48, { y, h: HR, n: 'hs_wall', s: 'hs_wall_cream', ops: [O(46.2, 3.0, 2.4)] });
}
function pharmacyCounter(B) {
  // counter 1.05 m high along x = 26 from z 6 to 16; security glass above it, one bay smashed (vault through)
  const x = 26, z0 = 6, z1 = 16;
  B.box(x, 0, (z0 + z1) / 2, .5, 1.02, z1 - z0, { mat: 'hs_spandrel', mats: { t: 'p_wood_walnut' } });
  B.box(x - .3, 1.02, (z0 + z1) / 2, .12, .04, z1 - z0, { mat: 'p_wood_walnut', collide: false });
  const bays = 5, bw = (z1 - z0) / bays;
  for (let i = 0; i < bays; i++) {
    const zc = z0 + (i + .5) * bw;
    B.box(x, 1.02, z0 + i * bw, .06, 1.98, .06, { mat: 'p_alu' });
    if (i === 2) { B.box(x, 1.06, zc - bw * .3, .02, .3, bw * .3, { mat: 'glass', surf: 'glass', cast: false, collide: false }); continue; }   // smashed
    B.box(x, 1.06, zc, .02, 1.92, bw - .06, { mat: 'glass', surf: 'glass', cast: false });
    B.box(x - .02, 1.1, zc, .02, .06, .3, { mat: 'p_alu', collide: false });   // speech grille
  }
  B.box(x, 1.02, z1, .06, 1.98, .06, { mat: 'p_alu' });
  B.box(x, 2.94, (z0 + z1) / 2, .1, .06, z1 - z0, { mat: 'p_alu', collide: false });
}

// =============================================================================================================== first floor (y 4)
function firstFloor(B) {
  const y = F1;
  const FIN = [
    [-48, 0, -38, 7, 'hs_lino'], [-36, 0, -16, 11, 'hs_lino_blue'], [-38, 7, -36, 11, 'hs_lino_blue'], [-48, 7, -38, 11, 'hs_lino_blue'],
    [-48, 11, -32, 16, 'hs_lino'], [-48, 16, -32, 30, 'hs_lino'], [-32, 11, -16, 30, 'hs_lino_ward'],
    [-44.4, 30, -16, 34, 'hs_lino_blue'], [-48, 34, -30, 40, 'hs_lino'], [-48, 36.5, -44.4, 40, 'hs_lino'], [-30, 34, -16, 40, 'hs_lino'],
    [-16, -14, -11, 4, 'hs_terrazzo'], [-11, 4, 16, 8, 'hs_terrazzo'], [-16, 4, -11, 8, 'hs_terrazzo'],
    [-16, 8, -4, 22, 'hs_lino'], [-4, 8, 4, 22, 'hs_terrazzo'], [4, 11.6, 16, 22, 'hs_lino'], [10.6, 8, 16, 11.6, 'hs_lino'],
    [-16, 22, 16, 26, 'hs_lino_blue'], [-16, 26, 16, 40, 'hs_lino_ward'],
  ];
  for (const [x0, z0, x1, z1, m] of FIN) finish(B, x0, z0, x1, z1, y, m);
  // stair S well (balustrade on the holding-bay side) and the theatre office
  B.box(SLOT.x1, y, (SLOT.z0 + SLOT.z1) / 2, .08, 1.05, SLOT.z1 - SLOT.z0, { mat: 'p_alu', surf: 'metal' });
  wz(B, -38, 0, 7, { y, h: H0, w: 'hs_wall', e: 'hs_wall' });
  wx(B, 7, -48, -38, { y, h: H0, n: 'hs_wall', s: 'hs_wall', ops: [D(-43, 'white', 1.02, 95, false)] });
  // theatre corridor north wall: prep room door, recovery opening
  wx(B, 11, -48, -16, { y, h: H0, n: 'hs_tile_theatre', s: 'hs_wall', band: { s: 'hs_band' }, rail: 's', ops: [D2(-41, 'double', 95, true, 1.72), O(-24, 7.0, 2.6, 'p_paint_darkgrey')] });
  // prep / theatre / recovery
  wz(B, -32, 11, 30, { y, h: H0, w: 'hs_tile_theatre', e: 'hs_wall_blue', band: { e: 'hs_band_blue' }, ops: [D2(23, 'steel2', 92, false, 1.92)] });
  wx(B, 16, -48, -32, { y, h: H0, n: 'hs_tile_theatre', s: 'hs_tile_theatre', ops: [D2(-40, 'steel2', 92, true, 1.92)] });
  wx(B, 30, -44.4, -16, { y, h: H0, n: 'hs_wall', s: 'hs_tile_theatre', band: { n: 'hs_band' }, rail: 'n', ops: [D2(-38, 'steel2', 95, true, 1.72), D(-20, 'white', 1.22, 95, true)] });
  wx(B, 30, -48, -44.4, { y, h: H0, n: 'hs_wall', s: 'hs_tile_theatre' });
  wz(B, STW.x1, 30, 36.5, { y, h: H0, w: 'hs_wall', e: 'hs_wall', ops: [O(30.85, 1.4, 2.3)] });
  wx(B, 36.5, -48, -44.4, { y, h: H0, ...both('hs_wall') });
  wx(B, 34, -44.4, -16, { y, h: H0, n: 'hs_wall', s: 'hs_wall', band: { s: 'hs_band' }, rail: 's', ops: [D(-37, 'white', 1.22, 95, true), D(-23, 'white', 1.02, 95, true)] });
  wz(B, -30, 34, 40, { y, h: H0, ...both('hs_wall') });
  // west wing / centre boundary x = -16
  wz(B, -16, 0, 11, { y, h: H0, w: 'hs_wall', e: 'hs_wall_cream', ops: [O(4, 5.0, 2.7, 'p_paint_darkgrey'), D2(9.5, 'double', 95, false, 1.72)] });
  wz(B, -16, 11, 40, { y, h: H0, w: 'hs_wall_blue', e: 'hs_wall', ops: [O(24, 2.0, 2.4), D(32, 'white', 1.22, 95, false)] });
  // centre block
  wx(B, 8, -16, 16, { y, h: H0, n: 'hs_wall', s: 'hs_wall_cream', ops: [D2(-10, 'double', 95, true, 1.72), O(0, 6.0, 2.7, 'p_paint_darkgrey')] });
  wz(B, -4, 8, 22, { y, h: H0, w: 'hs_wall', e: 'plaster_white', ops: [O(15, 1.8, 2.3)] });
  wz(B, 4, 8, 22, { y, h: H0, w: 'plaster_white', e: 'hs_wall', ops: [O(9.8, 3.0, 2.3)] });
  wx(B, STC.z1, 4, 10.6, { y, h: H0, ...both('hs_wall') });
  wz(B, 10.6, 8, 11.6, { y, h: H0, ...both('hs_wall') });
  wx(B, STC.z1, 10.6, 16, { y, h: H0, ...both('hs_wall'), ops: [D(13.3, 'white', 1.02, 95, true)] });
  wx(B, 22, -16, 16, { y, h: H0, n: 'hs_wall', s: 'hs_wall', band: { n: 'hs_band' }, rail: 'n', ops: [O(-10, 3.0, 2.3), O(0, 6.0, 2.6, 'p_paint_darkgrey'), D(12, 'white', 1.22, 95, false)] });
  wx(B, 26, -16, 16, { y, h: H0, n: 'hs_wall', s: 'hs_wall', band: { s: 'hs_band' }, rail: 's', ops: [D2(-10.7, 'double', 95, true, 1.92), D2(0, 'double', 95, true, 1.92), D2(10.7, 'double', 95, true, 1.92)] });
  wz(B, -5.33, 26, 40, { y, h: H0, ...both('hs_wall'), ops: [D(36, 'white', 1.02, 95, true)] });
  wz(B, 5.33, 26, 40, { y, h: H0, ...both('hs_wall'), ops: [D(36, 'white', 1.02, 95, false)] });
  // gallery balustrades (glass + handrail) and the feature stair landing
  const bal = (x0, z0, x1, z1) => {
    const L = Math.hypot(x1 - x0, z1 - z0), ry = Math.atan2(-(z1 - z0), x1 - x0);
    B.box((x0 + x1) / 2, F1, (z0 + z1) / 2, L, 1.0, .03, { mat: 'glass', ry, surf: 'glass', cast: false });
    B.box((x0 + x1) / 2, F1 + 1.0, (z0 + z1) / 2, L, .06, .08, { mat: 'p_stainless', ry, collide: false });
    B.box((x0 + x1) / 2, F1 - .4, (z0 + z1) / 2, L + .02, .5, .2, { mat: 'plaster_white', ry, collide: false, skip: 't' });
  };
  bal(-11, -14, -11, -3.4); bal(-11, -1.4, -11, 4); bal(-11, 4, 16, 4); bal(-11, -1.4, -8, -1.4); bal(-8, -3.4, -8, -1.4);
  slab(B, -11, -3.4, -8, -1.4, 3.6, F1, { skipTop: true, bot: 'plaster_white', side: 'plaster_white' });
  finish(B, -11, -3.4, -8, -1.4, F1, 'hs_terrazzo');
  // the roof: steps down from the ward corridor's fire door, the plant screen, the fire escape gap
  B.stairs({ x: 16.65, z: 24, w: 1.2, len: 1.0, y0: RS, y1: F1, dir: '-x', mat: 'steel_dark', rail: true });
  B.box(32, RS, 8, 32, 2.4, .12, { mat: 'corrugated', surf: 'sheetmetal' });
}

// =============================================================================================================== basement (y -4)
function basement(B) {
  const y = FB;
  const FIN = [
    [-48, 26, -12, 30, 'hs_lino_blue'], [-12, 20, 4, 30, 'hs_lino_blue'], [4, 20, 48, 24, 'hs_lino_blue'], [0, 8, 4, 20, 'hs_lino_blue'], [44.4, 24, 48, 30, 'hs_lino_blue'],
    [-12, 30, 4, 40, 'tile_floor'], [4, 24, 16, 40, 'hs_lino'], [16, 24, 44.4, 40, 'concrete_floor'], [-44.4, 30, -36, 40, 'hs_lino'], [-48, 36.5, -44.4, 40, 'hs_lino'],
    [-36, 30, -12, 40, 'concrete_floor'], [STW.x0, STW.z0, STW.x1, STW.z1, 'hs_lino_blue'], [STE.x0, STE.z0, STE.x1, STE.z1, 'hs_lino_blue'], [STC.x0, STC.z0, STC.x1, STC.z1, 'hs_lino_blue'],
  ];
  for (const [x0, z0, x1, z1, m] of FIN) finish(B, x0, z0, x1, z1, y, m);
  const R = { t: .3, ...both('concrete') }, Hb = 3.4;
  // retaining walls
  wx(B, 26, -48.15, -12, { y, h: Hb, t: .3, n: 'hs_wall_cream', s: 'concrete', band: { n: 'hs_band' }, rail: 'n', skirt: 'n' });
  wz(B, -12, 20, 26, { y, h: Hb, t: .3, w: 'concrete', e: 'hs_wall_cream', band: { e: 'hs_band' }, skirt: 'e' });
  wx(B, 20, -12, 0, { y, h: Hb, t: .3, n: 'hs_wall_cream', s: 'concrete', band: { n: 'hs_band' }, skirt: 'n' });
  wx(B, 20, 4, 48.15, { y, h: Hb, t: .3, n: 'hs_wall_cream', s: 'concrete', band: { n: 'hs_band' }, rail: 'n', skirt: 'n' });
  wz(B, 0, 8, 20, { y, h: Hb, t: .3, w: 'concrete', e: 'hs_wall_cream', band: { e: 'hs_band' }, skirt: 'e' });
  wz(B, 4, 11.6, 20, { y, h: Hb, t: .3, w: 'hs_wall_cream', e: 'concrete', band: { w: 'hs_band' }, skirt: 'w' });
  wx(B, 8, -.15, 10.75, { y, h: Hb, t: .3, n: 'hs_wall', s: 'concrete', skirt: 'n' });
  wz(B, 10.6, 8, 11.6, { y, h: Hb, t: .3, ...both('hs_wall') });
  wx(B, STC.z1, 4, 10.6, { y, h: Hb, ...both('hs_wall') });
  wz(B, -48, 26, 40.15, { y, h: Hb, t: .3, w: 'concrete', e: 'hs_wall' });
  wx(B, 40, -48.15, 48.15, { y, h: Hb, t: .3, n: 'concrete', s: 'hs_wall' });
  wz(B, 48, 20, 40.15, { y, h: Hb, t: .3, w: 'hs_wall', e: 'concrete' });
  // west corridor north side: stair W, linen, plant room doors
  wx(B, 30, -48, -12, { y, h: Hb, n: 'hs_wall', s: 'hs_wall_cream', band: { s: 'hs_band' }, rail: 's',
    ops: [O(-46.2, 3.0, 2.4), D(-40, 'metal', 1.22, 95, true), D2(-30, 'steel2', 92, true, 1.72), D(-18, 'metal', 1.22, 95, true)] });
  wz(B, STW.x1, 30, 36.5, { y, h: Hb, ...both('hs_wall') });
  wx(B, 36.5, -48, -44.4, { y, h: Hb, ...both('hs_wall') });
  wz(B, -36, 30, 40, { y, h: Hb, w: 'hs_wall', e: 'concrete_panels' });
  wz(B, -12, 30, 40, { y, h: Hb, w: 'concrete_panels', e: 'hs_tile_morgue' });
  // morgue front (the lobby gate) and the cold room
  wx(B, 30, -12, 4, { y, h: Hb, n: 'hs_tile_morgue', s: 'hs_wall_cream', band: { s: 'hs_band' }, ops: [O(-4, 3.2, 2.9, false)] });
  wz(B, 4, 24, 40, { y, h: Hb, w: 'hs_tile_morgue', e: 'hs_tile_morgue' });
  // east corridor north side: cold room, bulk store, stair E passage
  wx(B, 24, 4, 44.4, { y, h: Hb, n: 'hs_wall', s: 'hs_wall_cream', band: { s: 'hs_band' }, rail: 's', ops: [D(10, 'steel', 1.22, 95, true), D2(24, 'steel2', 92, true, 1.72), D(38, 'metal', 1.22, 95, true)] });
  wz(B, 16, 24, 40, { y, h: Hb, w: 'hs_tile_morgue', e: 'concrete_panels' });
  wz(B, STE.x0, 24, 36.5, { y, h: Hb, w: 'concrete_panels', e: 'hs_wall_cream', ops: [D(27, 'metal', 1.22, 95, true)] });
  wx(B, 36.5, STE.x0, 48, { y, h: Hb, ...both('hs_wall') });
  wx(B, 30, STE.x0, 48, { y, h: Hb, n: 'hs_wall', s: 'hs_wall_cream', ops: [O(46.2, 3.0, 2.4)] });
}

// =============================================================================================================== stairs
function stairs(B) {
  // stair W: B1 -> G -> 1 (entry at the south end, flight 1 on the west half)
  const sw = { x0: STW.x0 + .15, z0: STW.z0 + .1, x1: STW.x1 - .1, z1: STW.z1 - .1 };
  dogleg(B, { ...sw, y0: FB, y1: F0, entry: 's', first: 'l', landTop: true });
  dogleg(B, { ...sw, y0: F0, y1: F1, entry: 's', first: 'l', landTop: true, top: true });
  // central stair: B1 -> G -> 1 (entry at the west end)
  const sc = { x0: STC.x0 + .1, z0: STC.z0 + .1, x1: STC.x1 - .1, z1: STC.z1 - .1 };
  dogleg(B, { ...sc, y0: FB, y1: F0, entry: 'w', first: 'l', landTop: true });
  dogleg(B, { ...sc, y0: F0, y1: F1, entry: 'w', first: 'l', landTop: true, top: true });
  // stair E: B1 -> G (entry at the south end)
  const se = { x0: STE.x0 + .1, z0: STE.z0 + .1, x1: STE.x1 - .15, z1: STE.z1 - .1 };
  dogleg(B, { ...se, y0: FB, y1: F0, entry: 's', first: 'l', landTop: true, top: true });
  // stair S: straight flight G -> 1 from the ED hall north to the theatre corridor
  B.stairs({ x: (SLOT.x0 + SLOT.x1) / 2, z: 3.8, w: 1.8, len: 6.4, y0: F0, y1: F1, dir: '+z', mat: 'concrete', tread: 'hs_lino_blue', rail: 'right', railMat: 'p_alu' });
  // atrium feature stair: G -> gallery landing
  B.stairs({ x: -9.5, z: -6.7, w: 3.0, len: 6.6, y0: F0, y1: F1, dir: '+z', mat: 'hs_terrazzo', tread: 'hs_terrazzo', rail: true, railMat: 'p_stainless' });
  // fire escape: yard -> east wing roof (outside the east facade)
  B.stairs({ x: 48.95, z: 30.6, w: 1.2, len: 5.6, y0: 0, y1: RS, dir: '+z', mat: 'steel_dark', tread: 'grate', rail: true, railMat: 'p_galv' });
  B.box(48.95, RS - .2, 34.15, 1.3, .2, 1.5, { mat: 'steel_dark', mats: { t: 'grate' } });
  B.box(49.62, RS, 34.15, .05, 1.1, 1.5, { mat: 'p_galv' }); B.box(48.95, RS, 34.92, 1.3, 1.1, .05, { mat: 'p_galv' });
}

// =============================================================================================================== ambulance station (team 1 lobby)
function garage(B) {
  const x0 = -12, x1 = 12, z0 = -84, z1 = -70, h = 5.6;
  B.floor(x0 - .15, z0 - .15, x1 + .15, z1 + .15, 0, { mat: 'concrete_floor', t: .3 });
  for (const s of [-1, 1]) B.box(s * 13.1, 0, -70, 1.9, 2.4, .3, { mat: 'brick_red' });   // stub walls: no way round the garage
  // walls: brick below, ribbed cladding above; bay doors on the north side (the lobby gates roll up in them)
  const bays = [-7.5, 0, 7.5];
  wx(B, z1, x0 - .15, x1 + .15, { y: 0, h, t: .3, n: 'brick_red', s: 'hs_wall_cream', skirt: 's', ops: bays.map(c => ({ c, w: 3.6, h: 3.8, frame: 'paint_yellow' })) });
  wx(B, z0, x0 - .15, x1 + .15, { y: 0, h, t: .3, n: 'hs_wall_cream', s: 'brick_red', skirt: 'n' });
  wz(B, x0, z0, z1, { y: 0, h, t: .3, w: 'brick_red', e: 'hs_wall_cream', skirt: 'e', ops: [BRD(-80, 1, 2.0, 1.2, 1.2), BRD(-75, 1, 2.0, 1.2, 1.2)] });
  wz(B, x1, z0, z1, { y: 0, h, t: .3, w: 'hs_wall_cream', e: 'brick_red', skirt: 'w', ops: [BRD(-80, -1, 2.0, 1.2, 1.2), BRD(-75, -1, 2.0, 1.2, 1.2)] });
  slab(B, x0 - .15, z0 - .15, x1 + .15, z1 + .15, h, h + .4, { top: 'hs_roof', bot: 'corrugated' });
  B.box(0, h - .9, z1 + .25, 24.6, .9, .2, { mat: 'corrugated', collide: false });   // fascia
  sign(B, 'station', 0, h - .45, z1 + .36, 6, 1.0, 'n');
  B.lobby(1, { x0: x0 + .2, z0: z0 + .2, x1: x1 - .2, z1: z1 - .2, y: 0 }, bays.map(x => ({ x, z: z1, w: 3.6, h: 3.8, ry: 0 })));
  // bay markings on the floor
  for (const x of [-3.75, 3.75]) B.box(x, .01, -77, .12, .005, 13, { mat: 'paint_yellow', collide: false, cast: false });
}

// =============================================================================================================== outdoors
function outdoors(B) {
  // boundary: palisade / heras fencing so the out-of-bounds edges read as a closed site
  const fenceRow = (x0, z, x1, ry = 0) => { const n = Math.max(1, Math.round((x1 - x0) / 3.5)); for (let i = 0; i < n; i++) P(B, 'heras', x0 + (i + .5) * (x1 - x0) / n, 0, z, { ry, lean: (i % 5 === 2) ? .06 : 0 }); };
  fenceRow(-54, -63, -14); fenceRow(14, -63, 62);
  for (let z = -48; z < -16; z += 3.5) P(B, 'heras', -53.6, 0, z + 1.75, { ry: PI2 });
  fenceRow(-54, -16, -48.2);
  fenceRow(48.3, 38, 62);
  for (let z = -60; z < 38; z += 3.5) P(B, 'heras', 61.6, 0, z + 1.75, { ry: PI2 });
  // canopies: ED ambulance bay and the main entrance
  canopy(B, -46, -24, -26, -14.2, 3.6);
  canopy(B, -7, -21, 7, -14.2, 3.9);
  sign(B, 'emergency', -34, 3.45, -24.06, 4.0, .84, 's', { glow: true });
  sign(B, 'main_ent', 0, 3.75, -21.06, 3.0, .66, 's');
  sign(B, 'hosp_name', 0, 8.95, -14.18, 9.6, 1.5, 's');
  sign(B, 'amb_only', -34, .03, -30, 3.2, .7, 'u');
}
const PI2 = Math.PI / 2;
function canopy(B, x0, z0, x1, z1, h) {
  const w = x1 - x0, d = z1 - z0;
  B.box((x0 + x1) / 2, h, (z0 + z1) / 2, w, .35, d, { mat: 'hs_spandrel', mats: { b: 'p_alu' } });
  B.box((x0 + x1) / 2, h - .62, z0 + .05, w, 1.0, .1, { mat: 'hs_spandrel', collide: false });   // fascia
  for (const x of [x0 + .3, x1 - .3]) B.cyl(x, 0, z0 + .3, .14, h, { mat: 'p_paint_darkgrey', sides: 10 });
  if (w > 16) B.cyl((x0 + x1) / 2, 0, z0 + .3, .14, h, { mat: 'p_paint_darkgrey', sides: 10 });
}

// =============================================================================================================== lights
function lights(B) {
  const W = [1, .93, .82], C = [.85, .95, 1], S = [1, .7, .38];
  const L = (x, y, z, intensity, color = W, o = {}) => B.light(Object.assign({ x, y, z, intensity, color }, o));
  // ambulance station
  L(-4, 5.6, -77, 26, C, { fixture: 'tube' }); L(4, 5.6, -77, 26, C, { fixture: 'tube' });
  // outside: canopies, a street light, yard floods
  L(-34, 3.6, -19, 22, C, { fixture: 'tube', flicker: .5 });
  L(0, 3.9, -17.5, 22, W, { type: 'spot', dir: [0, -1, 0], angle: 1.6, fixture: 'can' });
  L(54, 4.2, -30, 60, S, { type: 'spot', dir: [-.2, -1, .1], angle: 1.4, fixture: false });
  L(53, 4.2, 18, 50, S, { type: 'spot', dir: [-.3, -1, 0], angle: 1.3, fixture: false });
  // ground floor
  L(-32, C0, -7, 14, W, { fixture: 'panel' });
  L(-24, C0, 11, 10, C, { fixture: 'tube', flicker: .7 });
  L(-6, ATR, -6, 40, W, { type: 'spot', dir: [0, -1, 0], angle: 1.5, fixture: 'can' }); L(8, ATR, -2, 30, W, { type: 'spot', dir: [0, -1, 0], angle: 1.5, fixture: 'can' });
  L(-10, C0, 24, 10, C, { fixture: 'tube' });
  L(28, C0, -6, 14, W, { fixture: 'panel' });
  L(33, C0, 16, 14, C, { fixture: 'tube' }); L(44, C0, 14, 9, W, { fixture: 'tube', flicker: .35 });
  // first floor
  L(-40, C1, 23, 26, C, { fixture: 'panel' });
  L(-24, C1, 20, 10, C, { fixture: 'tube' });
  L(-26, C1, 8, 10, W, { fixture: 'tube', flicker: .4 });
  L(2, C1, 24, 10, W, { fixture: 'tube' });
  // basement
  L(-4, -1, 25, 12, C, { fixture: 'tube' });
  L(-30, -1, 28, 9, C, { fixture: 'tube', flicker: .8 });
  L(28, -1, 22, 9, C, { fixture: 'tube' });
  L(-4, -1, 35, 12, C, { fixture: 'panel' });
}

// =============================================================================================================== markers
function markers(B) {
  // team 1: ambulance station (spawns between and beside the vehicles)
  const t1 = [[0, -82], [0, -79.5], [0, -77], [0, -74.5], [0, -72], [-10.6, -81], [-10.6, -77], [-10.6, -73], [10.6, -81], [10.6, -77], [10.6, -73], [-2.4, -80], [2.4, -80], [-2.4, -75], [2.4, -75]];
  for (const [x, z] of t1) B.spawn(1, x, 0, z, 0);
  // team 2: the mortuary
  const t2 = [[-9.5, 32.5], [-6.5, 32.5], [-3.5, 32.5], [-.5, 32.5], [2.5, 32.5], [-9.5, 35], [-6.5, 35], [-3.5, 35], [-.5, 35], [2.5, 35], [-9.5, 38], [2.5, 38]];
  for (const [x, z] of t2) B.spawn(2, x, FB, z, Math.PI);
  B.lobby(2, { x0: -11.8, z0: 30.2, x1: 3.8, z1: 39.8, y: FB }, [{ x: -4, z: 30, w: 3.2, h: 2.9, ry: 0, y: FB }]);
  // field spawns (respawn modes): each team's half
  for (const [x, y, z, yaw] of [[-40, 0, -44, .6], [-20, .12, -52, .2], [0, .12, -48, 0], [22, 0, -46, -.3], [40, 0, -40, -.5], [55, 0, -46, -.2], [-38, 0, -30, .3],
    [30, 0, -30, 0], [-40, 0, -8, 1.2], [32, 0, -10, -.4], [56, 0, -10, 0]]) B.spawn(1, x, y, z, yaw, { field: true });
  for (const [x, y, z, yaw] of [[-30, FB, 28, 1.6], [26, FB, 22, -1.6], [0, F1, 34, PI2 * 2], [-11, F1, 34, PI2 * 2], [11, F1, 34, PI2 * 2], [8, F0, 34, PI2 * 2],
    [-9, F0, 36, PI2 * 2], [-26, F1, 32, PI2], [32, F0, 35, -PI2], [-24, F0, 34, PI2], [2, FB, 14, PI2 * 2]]) B.spawn(2, x, y, z, yaw, { field: true });
  // FFA spawns over the whole map
  for (const [x, y, z] of [[-44, 0, -44], [-14, .12, -52], [16, 0, -50], [44, 0, -36], [56, 0, -20], [56, 0, 30], [-44, 0, -6], [-22, 0, 4], [-40, 0, 24],
    [-6, 0, -10], [10, 0, -10], [-10, 0, 14], [27.5, 0, -7.5], [44, 0, -8], [34, 0, 24], [44, 0, 22], [-40, F1, 9], [-22, F1, 28], [-8, F1, 30], [10, F1, 30],
    [-13, F1, -10], [-40, FB, 28], [-24, FB, 35], [28, FB, 34], [36, FB, 22], [8, F0, 36]])
    B.spawn(0, x, y, z, Math.atan2(-x, -z));
  // sites
  B.site('A', { x0: -47.6, z0: 16.4, x1: -32.4, z1: 29.6, y: F1 });
  B.site('B', { x0: 26.4, z0: 6, x1: 39.6, z1: 28, y: F0 });
  // hostages + rescue at the ambulance station apron
  B.hostage(-43, F0, 13); B.hostage(-13.6, F0, 38.5); B.hostage(11, F1, 35); B.hostage(30, FB, 34); B.hostage(10, F0, 34);
  B.rescue({ x0: -12, z0: -69, x1: 12, z1: -62.5, y: 0 });
  // objectives for the other modes
  B.point('dom1', -30, F0, -7, 4); B.point('dom2', 3, F0, -3, 4); B.point('dom3', 29, F0, -7, 4);
  B.point('hp1', -36, 0, -19, 4); B.point('hp2', -24, F1, 20, 4); B.point('hp3', -4, FB, 24, 4); B.point('hp4', 23, F0, 14, 3.5); B.point('hp5', 0, F0, 15, 3.5);
  B.point('hill', 4, F0, -6, 5);
  B.point('flag1', 0, 0, -66, 1.5); B.point('flag2', -4, FB, 24, 1.5);
  B.point('extract1', -50, 0, -58, 3); B.point('extract2', 58, 0, -58, 3); B.point('extract3', 55, 0, 32, 3);
  B.point('hq1', 0, F1, 24, 3); B.point('hq2', -10, F0, 24, 3);
  // hiding places
  const H = (x, y, z, kind, r) => B.hide(x, y, z, { kind, r });
  H(-46.5, F0, 17.5, 'dark'); H(-46, F0, 28.5, 'closet'); H(-11.5, F0, 38.5, 'dark'); H(-14.2, F0, 9.8, 'crates'); H(14.5, F0, 9.5, 'closet');
  H(-9.5, F0, -11.6, 'under'); H(43, F0, -12.5, 'closet'); H(46.5, F0, 28.5, 'crates'); H(14, F0, 38.5, 'crates');
  H(-46.6, F1, 18, 'closet'); H(-46.6, F1, 38.5, 'crates'); H(14.5, F1, 38.5, 'dark'); H(-46.5, F1, 1.5, 'dark');
  H(-34, FB, 38.5, 'dark'); H(-42.5, FB, 38.5, 'crates'); H(42.5, FB, 38.5, 'crates'); H(14.5, FB, 38.5, 'dark');
  H(30, RS, 38.5, 'roof'); H(-22, .1, -40, 'bush'); H(58, 0, 0, 'crates'); H(-44, 0, -30, 'car');
}

// =============================================================================================================== skyline
function skylineAll(B) {
  // the hospital's own ward tower behind the playable block
  skyline(B, -2, 52, 40, 16, 34, { u: .25 });
  skyline(B, 36, 58, 20, 14, 22, { u: .5, v: .3 });
  // the city south of the ring road and to the sides
  const r = (a, b, k) => a + (b - a) * ((Math.sin(k * 12.9898) * 43758.5453) % 1 + 1) % 1;
  let k = 1;
  for (let x = -70; x < 80; x += 18) { skyline(B, x, -104 - r(0, 10, k++), 14 + r(0, 6, k++), 12, 12 + r(0, 26, k++), { u: r(0, 1, k++), v: r(0, 1, k++) }); }
  for (let z = -80; z < 50; z += 20) { skyline(B, -78 - r(0, 8, k++), z, 12, 14 + r(0, 6, k++), 10 + r(0, 20, k++), { u: r(0, 1, k++) }); }
  for (let z = -80; z < 50; z += 20) { skyline(B, 82 + r(0, 8, k++), z, 12, 14 + r(0, 6, k++), 10 + r(0, 24, k++), { u: r(0, 1, k++) }); }
  for (let x = -60; x < 70; x += 22) { skyline(B, x, 78 + r(0, 10, k++), 16, 14, 16 + r(0, 30, k++), { u: r(0, 1, k++) }); }
}

// =============================================================================================================== dressing
// rotations: the front of a prop faces +z at ry 0; FX = front +x, BX = front -x, SZ = front -z
const FX = Math.PI / 2, BX = -Math.PI / 2, SZ = Math.PI;
const pr = (B, type, x, y, z, o = {}) => B.prop(type, x, y, z, o);
/** overhead duct / cable tray / pipe run (visual, no collider): along x or z at height y */
function run(B, x0, z0, x1, z1, y, w = .4, h = .3, mat = 'p_galv') {
  const L = Math.hypot(x1 - x0, z1 - z0), alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0);
  B.box((x0 + x1) / 2, y, (z0 + z1) / 2, alongX ? L : w, h, alongX ? w : L, { mat, collide: false, cast: false });
  // hangers every 2.4 m
  for (let f = 1.2; f < L; f += 2.4) { const x = x0 + (x1 - x0) * f / L, z = z0 + (z1 - z0) * f / L; B.box(x, y + h, z, .03, .35, .03, { mat: 'p_galv', collide: false, cast: false }); }
}
function dress(B) {
  dressGround(B); dressFirst(B); dressBasement(B); dressGarage(B); dressOutside(B); signage(B);
}

function dressGround(B) {
  const y = F0, C = C0;
  // ---- ED hall: triage desk, waiting rows, vending, trolleys
  P(B, 'counter', -27.5, y, -2.6, { ry: SZ, len: 5 });
  for (const [x, z, n, ry] of [[-43, -9, 6, 0], [-43, -6, 6, 0], [-25.5, -11.6, 5, 0], [-20.5, -11.6, 5, 0], [-25.5, -8.6, 5, SZ]]) P(B, 'seats', x, y, z, { n, ry, broken: true });
  pr(B, 'vending_machine', -47.35, y, -12.4, { ry: FX, variant: 'drinks', on: false }); pr(B, 'vending_machine', -47.35, y, -11.3, { ry: FX, variant: 'snacks' });
  P(B, 'wheelchair', -46.2, y, -1.1, { ry: SZ }); P(B, 'wheelchair', -45.4, y, -1.3, { ry: SZ + .3 });
  pr(B, 'gurney', -18.5, y, -1.2, { ry: FX }); pr(B, 'litter_bin', -31.2, y, -13.4, { variant: 'square' });
  P(B, 'debris', -38.5, y, -6.5); pr(B, 'trash_bag', -46.5, y, -13.2, { n: 4 });
  pr(B, 'wall_clock', -27.5, 2.45, -.16, { ry: SZ }); pr(B, 'fire_extinguisher', -16.2, y, -1.5, { ry: BX });
  pr(B, 'poster', -40, 1.2, -.16, { ry: SZ, i: 2 }); pr(B, 'poster', -19, 1.2, -.16, { ry: SZ, i: 4 });
  P(B, 'gel', -32.4, y, -.16, { ry: SZ });
  fixtures(B, -48, -14, -16, 0, C, { dx: 4, dz: 3.5, on: .45 });
  // ---- X-ray, plaster room, stair W lobby
  P(B, 'xray', -42, y, 15.2);
  pr(B, 'shelf_unit', -47.55, y, 10.5, { ry: FX, variant: 'grey' }); pr(B, 'office_chair', -38, y, 9.5, { ry: SZ });
  pr(B, 'medical_cart', -47.4, y, 22, { ry: FX, variant: 'red' }); P(B, 'trolley', -40.5, y, 27.5, {});
  pr(B, 'shelf_unit', -41, y, 29.5, { ry: SZ, variant: 'grey' }); pr(B, 'shelf_unit', -39.8, y, 29.5, { ry: SZ, variant: 'grey' });
  pr(B, 'hospital_bed', -44.5, y, 22.4, { ry: FX, monitor: false });
  P(B, 'cage', -38.5, y, 38.8, { ry: SZ }); P(B, 'wheelchair', -43.6, y, 39.2, { ry: SZ });
  fixtures(B, -48, 8, -36, 30, C, { dx: 4, dz: 3.6, on: .35 });
  fixtures(B, -36, 0, -32, 40, C, { dx: 4, dz: 4, kind: 'strip', on: .5 });
  // ---- Majors: curtained bays along both walls, nurses' station
  for (const z of [2.6, 5.6, 8.6, 14, 17, 20]) {
    pr(B, 'hospital_bed', -30.75, y, z, { ry: FX, monitor: z % 2 > 1 });
    P(B, 'curtainbay', -30.55, y, z, { ry: FX, w: 2.7, d: 2.6, ceil: C - .05, fab: 'p_fab_teal' });
  }
  for (const z of [2.6, 5.6, 14, 17, 20]) {
    pr(B, 'hospital_bed', -17.25, y, z, { ry: BX, monitor: z % 2 < 1 });
    P(B, 'curtainbay', -17.45, y, z, { ry: BX, w: 2.7, d: 2.6, ceil: C - .05, fab: 'p_fab_teal' });
  }
  P(B, 'counter', -24, y, 7, { len: 3.2 }); pr(B, 'medical_cart', -21.5, y, 9.5, { ry: SZ, variant: 'red' });
  P(B, 'ivstand', -27, y, 15.5, {}); P(B, 'ivstand', -21, y, 3, {}); pr(B, 'gurney', -24, y, 18.5, { ry: .3 });
  fixtures(B, -32, 0, -16, 22, C, { dx: 4, dz: 3.2, kind: 'strip', on: .35 });
  // ---- Decon / store
  for (const x of [-30.4, -29.2, -26, -24.8]) pr(B, 'shelf_unit', x, y, 39.55, { ry: SZ, variant: 'grey' });
  pr(B, 'pallet', -20, y, 37.5, { variant: 'boxes', h: .9 }); pr(B, 'cardboard_box', -18.5, y, 30, { variant: 'pile', n: 6 });
  P(B, 'cage', -29, y, 28, { ry: .4 }); P(B, 'wheelchair', -17.5, y, 38, { ry: SZ });
  fixtures(B, -32, 26, -16, 40, C, { dx: 4, dz: 3.5, on: .25 });
  // ---- atrium: information desk, coffee kiosk, waiting rows, dead planters
  P(B, 'counter', 0, y, -.6, { ry: SZ, len: 4.4 });
  P(B, 'kiosk', 10, y, 6.3, { ry: SZ });
  for (const [x, z, ry] of [[7, -8.2, 0], [7, -9.0, SZ], [12, -8.2, 0], [12, -9.0, SZ], [-4, -4, 0]]) P(B, 'seats', x, y, z, { n: 5, ry, broken: true });
  P(B, 'planterdead', -6.2, y, -12.6, { len: 2.4 }); P(B, 'planterdead', 6.2, y, -12.6, { len: 2.4 });
  P(B, 'planterdead', -14, y, 3, { len: 2.4, ry: FX });
  pr(B, 'vending_machine', 15.4, y, 1.2, { ry: BX, variant: 'drinks' }); pr(B, 'vending_machine', 15.4, y, 2.3, { ry: BX, variant: 'snacks', on: false });
  pr(B, 'atm', 15.55, y, 4.4, { ry: BX, variant: 'wall' });
  pr(B, 'litter_bin', 3.6, y, -13.2, { variant: 'round' }); pr(B, 'litter_bin', -3.6, y, -13.2, { variant: 'round' });
  pr(B, 'scan_wet_floor_sign', 1.5, y, -6, { ry: .5 }); P(B, 'debris', 8, y, -2.5); P(B, 'debris', -3, y, 4.5);
  P(B, 'wheelchair', 13.5, y, -12.5, { ry: 2.6 });
  for (const [x, z] of [[-6, -8], [6, -8], [-6, -1], [6, -1], [0, -11]]) pr(B, 'light_fixture', x, ATR, z, { variant: 'pendant', drop: 2.6, on: x !== 6 || z !== -1 });
  fixtures(B, -16, -14, -11, 4, 3.6, { dx: 5, dz: 3.6, on: .5 });
  fixtures(B, -11, 4, 16, 8, 3.6, { dx: 3.6, dz: 4, on: .4 });
  // ---- admissions office (carpet): workstations, filing
  for (const [x, z] of [[-13.2, 12.5], [-7, 12.5], [-13.2, 16.5], [-7, 16.5]]) pr(B, 'workstation', x, y, z, { variant: 'single', on: false });
  for (const z of [18.6, 19.1, 19.6, 20.1, 20.6]) pr(B, 'filing_cabinet', -15.55, y, z, { ry: FX, open: z === 19.6 ? 1 : -1 });
  pr(B, 'whiteboard', -10, 1.0, 21.82, { ry: SZ, w: 2.4 });
  fixtures(B, -16, 8, -4, 22, C, { dx: 3, dz: 3.5, on: .2 });
  // ---- lift lobby
  P(B, 'lift', -3.85, y, 12.5, { ry: FX }); P(B, 'lift', -3.85, y, 18, { ry: FX });
  fixtures(B, -4, 8, 4, 22, C, { dx: 4, dz: 3.5, kind: 'pendant', on: .5 });
  // ---- main corridor
  P(B, 'seats', -6, y, 25.6, { n: 4, ry: SZ }); pr(B, 'gurney', -26, y, 22.6, { ry: FX }); P(B, 'cage', 12, y, 22.5, { ry: 0 });
  fixtures(B, -32, 22, 16, 26, C, { dx: 4, dz: 4, kind: 'strip', on: .4 });
  // ---- chapel: pews, altar
  for (const z of [29.6, 31.6, 33.6, 35.6]) { P(B, 'pew', -12.8, y, z, { len: 3 }); P(B, 'pew', -5.7, y, z, { len: 3 }); }
  B.box(-9, y, 38.7, 1.9, .9, .8, { mat: 'p_wood_walnut', surf: 'wood' }); B.box(-9, y + .9, 38.7, 2.0, .02, .85, { mat: 'p_fab_white', collide: false });
  B.box(-9, 1.6, 39.82, .12, 1.2, .04, { mat: 'p_wood_walnut', collide: false }); B.box(-9, 2.0, 39.82, .6, .12, .04, { mat: 'p_wood_walnut', collide: false });
  fixtures(B, -16, 26, -2, 40, C, { dx: 4.5, dz: 4.5, kind: 'pendant', warm: true, on: .5 });
  // ---- medical records
  for (const z of [30.2, 33.2, 36.2]) for (const x of [.6, 1.8, 3, 4.2, 9.6, 10.8, 12, 13.2]) pr(B, 'shelf_unit', x, y, z, { variant: 'grey', ry: (x * 7 + z) % 2 > 1 ? 0 : SZ });
  for (const z of [27, 27.5, 28, 28.5, 29]) pr(B, 'filing_cabinet', 15.55, y, z, { ry: BX, color: 'beige' });
  pr(B, 'cardboard_box', 6.5, y, 38.5, { variant: 'pile', n: 8 }); pr(B, 'cardboard_box', 2, y, 27.5, { variant: 'pile', n: 5 });
  fixtures(B, -2, 26, 16, 40, C, { dx: 4.5, dz: 3, kind: 'strip', on: .25 });
  // ---- outpatients hall and clinics
  for (const [x, z, ry] of [[22, -9, 0], [22, -6, 0], [34.5, -9, 0], [34.5, -6, 0], [22, -2.6, SZ]]) P(B, 'seats', x, y, z, { n: 6, ry, broken: true });
  P(B, 'counter', 31, y, 1.6, { ry: SZ, len: 4 });
  pr(B, 'vending_machine', 39.4, y, -13, { ry: BX, variant: 'drinks', on: false }); pr(B, 'tv', 28, 2.0, -13.8, { wall: true, on: false });
  P(B, 'wheelchair', 17.2, y, -12.6, { ry: .8 }); pr(B, 'litter_bin', 26.5, y, -13.3, { variant: 'square' }); P(B, 'debris', 36, y, -2.6);
  fixtures(B, 16, -14, 40, 4, C, { dx: 4, dz: 3.6, on: .35 });
  pr(B, 'desk', 44.5, y, -6.1, { ry: SZ, variant: 'metal' }); pr(B, 'office_chair', 44.5, y, -7, { ry: SZ });
  pr(B, 'hospital_bed', 46.6, y, -10, { ry: BX, monitor: false });
  pr(B, 'hospital_bed', 46.6, y, -1.2, { ry: BX, monitor: false }); pr(B, 'desk', 44, y, 3.3, { ry: SZ, variant: 'metal' }); pr(B, 'filing_cabinet', 41, y, 3.5, { ry: SZ });
  fixtures(B, 40, -14, 48, 4, C, { dx: 4, dz: 4.5, on: .3 });
  // ---- outpatients corridor (pharmacy queue)
  P(B, 'seats', 16.5, y, 9.2, { n: 4, ry: FX }); P(B, 'seats', 16.5, y, 14, { n: 4, ry: FX });
  P(B, 'wheelchair', 17.3, y, 28.5, { ry: 2 }); pr(B, 'fire_extinguisher', 16.2, y, 20.5, { ry: FX });
  fixtures(B, 16, 4, 26, 30, C, { dx: 5, dz: 4, kind: 'strip', on: .4 });
  // ---- PHARMACY (B site): dispensary islands, shelving on the walls, fridges, the CD safe
  for (const x of [28.6, 32.8, 37]) P(B, 'medshelf', x, y, 4.38, { len: 4, sparse: x > 35 });
  P(B, 'medshelf', 30.4, y, 9.6, { ry: FX, len: 4 }); P(B, 'medshelf', 30.86, y, 9.6, { ry: BX, len: 4, empty: true });
  P(B, 'medshelf', 30.4, y, 22.4, { ry: FX, len: 4, sparse: true }); P(B, 'medshelf', 30.86, y, 22.4, { ry: BX, len: 4 });
  P(B, 'medshelf', 36.4, y, 22.4, { ry: FX, len: 3, empty: true });
  B.box(35.8, y, 9.5, 2.4, .92, .7, { mat: 'p_paint_cream', mats: { t: 'p_stainless' }, surf: 'wood' });   // dispensing bench
  P(B, 'drugfridge', 27, y, 29.3, { ry: SZ }); P(B, 'drugfridge', 27.7, y, 29.3, { ry: SZ }); P(B, 'cdsafe', 39.4, y, 7, { ry: BX });
  for (const [x, z, n] of [[34.5, 15, 5], [28.5, 17.5, 4], [38.6, 27.6, 6]]) pr(B, 'cardboard_box', x, y, z, { variant: 'pile', n });
  P(B, 'debris', 33.5, y, 18); pr(B, 'office_chair', 35.6, y, 10.5, { ry: 2.5 });
  fixtures(B, 26, 4, 40, 30, C, { dx: 3.5, dz: 3.2, on: .4 });
  // ---- stock room (loading door from the yard)
  pr(B, 'rack', 47.0, y, 9, { ry: BX, bays: 2, levels: 2, lh: 1.25, load: .8 }); pr(B, 'rack', 47.0, y, 25, { ry: BX, bays: 2, levels: 2, lh: 1.25, load: .6 });
  pr(B, 'pallet', 43, y, 8, { variant: 'boxes', h: 1.1 }); pr(B, 'pallet', 43.2, y, 24.5, { variant: 'wrap', stack: 1 }); pr(B, 'pallet_jack', 44, y, 20.5, { ry: 1.2 });
  pr(B, 'cardboard_box', 42, y, 28.8, { variant: 'pile', n: 6 });
  fixtures(B, 40, 4, 48, 30, C, { dx: 4, dz: 4.5, kind: 'strip', on: .3 });
  // ---- staff lockers
  for (const x of [24, 29.5, 35]) pr(B, 'lockers', x, y, 39.55, { ry: SZ, n: 8, open: [2, 5], bench: x !== 29.5 });
  pr(B, 'lockers', 20.5, y, 33, { ry: FX, n: 4, variant: 'blue' });
  fixtures(B, 20, 30, 44.4, 40, C, { dx: 4, dz: 5, kind: 'strip', on: .3 });
}

function dressFirst(B) {
  const y = F1, C = C1;
  // theatre corridor and office
  pr(B, 'gurney', -30, y, 8, { ry: FX }); P(B, 'trolley', -22, y, 10.3, {}); P(B, 'cage', -46.5, y, 9.5, { ry: FX });
  pr(B, 'desk', -45.5, y, 3, { ry: FX, variant: 'metal' }); pr(B, 'office_chair', -44.7, y, 3, { ry: BX }); pr(B, 'filing_cabinet', -39.2, y, 6.5, { ry: SZ });
  P(B, 'sharps', -47.8, y + 1.1, 5.5, { ry: FX });
  fixtures(B, -48, 7, -16, 11, C, { dx: 4, dz: 4, kind: 'strip', on: .4 });
  fixtures(B, -48, 0, -38, 7, C, { dx: 5, dz: 3.5, on: .3 });
  fixtures(B, -36, 0, -16, 7, C, { dx: 4, dz: 3.5, on: .2 });
  // anaesthetic / prep room
  P(B, 'scrub', -45, y, 15.85, { ry: SZ }); P(B, 'trolley', -35.5, y, 13, {}); P(B, 'trolley', -36.6, y, 14.3, {});
  pr(B, 'medical_cart', -33, y, 15.4, { ry: SZ, variant: 'blue' });
  fixtures(B, -48, 11, -32, 16, C, { dx: 4, dz: 5, on: .5 });
  // THEATRE 1 (A site)
  P(B, 'optable', -40, y, 23); P(B, 'oplight', -40, C, 23); P(B, 'anaes', -40, y, 20.3, { ry: SZ });
  P(B, 'tower', -36.9, y, 24.5, {}); P(B, 'tower', -43.4, y, 25.6, {}); P(B, 'trolley', -37.2, y, 21, {}); P(B, 'ivstand', -42.5, y, 21.5, {});
  P(B, 'medshelf', -47.6, y, 22.5, { ry: FX, len: 2, sparse: true }); P(B, 'medshelf', -47.6, y, 26.5, { ry: FX, len: 2 });
  pr(B, 'wardrobe', -47.25, y, 18.2, { ry: FX, variant: 'large', open: true, mat: 'p_stainless' });
  P(B, 'debris', -35, y, 28);
  fixtures(B, -48, 16, -32, 30, C, { dx: 4, dz: 3.5, kind: 'troffer', on: .6 });
  // recovery: beds round the walls
  for (const z of [13, 16, 19, 27.6]) { pr(B, 'hospital_bed', -17.3, y, z, { ry: BX }); P(B, 'bedhead', -16.15, y, z, { ry: BX }); }
  for (const z of [14, 17, 27.6]) { pr(B, 'hospital_bed', -30.7, y, z, { ry: FX, monitor: false }); P(B, 'bedhead', -31.85, y, z, { ry: FX }); }
  P(B, 'counter', -24, y, 22.5, { ry: FX, len: 3 }); P(B, 'ivstand', -21, y, 14.5, {}); pr(B, 'medical_cart', -26.5, y, 12, { ry: 0, variant: 'red' });
  fixtures(B, -32, 11, -16, 30, C, { dx: 4, dz: 3.8, kind: 'strip', on: .35 });
  // back corridor, sterile store, staff room
  for (const x of [-46.8, -45.6, -40, -38.8, -35, -33.8]) pr(B, 'shelf_unit', x, y, 39.55, { ry: SZ, variant: 'grey' });
  P(B, 'cage', -43, y, 35, { ry: .3 });
  pr(B, 'kitchen_counter', -23, y, 39.6, { ry: SZ, len: 3.6, variant: 'white' }); pr(B, 'dining_table', -24, y, 36.5, { variant: 'white', chairs: 4 });
  pr(B, 'sofa', -17, y, 37, { ry: BX, variant: 'teal', seats: 2 }); pr(B, 'fridge', -28.9, y, 39.4, { ry: SZ, variant: 'white' });
  fixtures(B, -44.4, 30, -16, 34, C, { dx: 4, dz: 4, kind: 'strip', on: .3 });
  fixtures(B, -48, 34, -16, 40, C, { dx: 4, dz: 6, on: .3 });
  // gallery: benches and dead planters along the rail
  P(B, 'seats', -15.6, y, -6, { n: 4, ry: FX }); P(B, 'planterdead', -15.4, y, 0, { len: 2, ry: FX });
  P(B, 'seats', 3, y, 7.6, { n: 5, ry: SZ }); P(B, 'planterdead', 9, y, 7.5, { len: 2.4 });
  // day room (west), first-floor lift lobby, staff office
  pr(B, 'armchair', -14.5, y, 10, { ry: .5, variant: 'teal' }); pr(B, 'armchair', -12.5, y, 9.6, { ry: -.2, variant: 'mustard' });
  pr(B, 'coffee_table', -13.2, y, 11.6, {}); pr(B, 'tv', -9, y, 21.4, { ry: SZ }); pr(B, 'dining_table', -10, y, 16, { variant: 'set', chairs: 4 });
  pr(B, 'sofa', -6, y, 9.3, { variant: 'blue' });
  P(B, 'lift', -3.85, y, 11.2, { ry: FX }); P(B, 'lift', -3.85, y, 19, { ry: FX });
  pr(B, 'desk', 13, y, 20.5, { ry: SZ, variant: 'office' }); pr(B, 'office_chair', 13, y, 19.7, {}); pr(B, 'filing_cabinet', 15.55, y, 14, { ry: BX });
  pr(B, 'bookshelf', 15.7, y, 16.5, { ry: BX, variant: 'metal' });
  fixtures(B, -16, 8, 16, 22, C, { dx: 4, dz: 3.5, on: .3 });
  // ward corridor + bays
  pr(B, 'medical_cart', -13, y, 22.5, { ry: 0, variant: 'blue' }); P(B, 'cage', 6, y, 22.6, { ry: 0 }); P(B, 'wheelchair', 15, y, 25.2, { ry: SZ });
  fixtures(B, -16, 22, 16, 26, C, { dx: 4, dz: 4, kind: 'strip', on: .4 });
  for (const [cx, offs] of [[-10.67, [-3.2, 0, 3.2]], [0, [-3.2, 0, 3.2]], [10.67, [-3.2, 0]]]) {
    for (const o of offs) {
      pr(B, 'hospital_bed', cx + o, y, 38.7, { ry: SZ, monitor: false });
      P(B, 'bedside', cx + o + 1.1, y, 39.4, {});
      P(B, 'curtainbay', cx + o, y, 38.55, { ry: SZ, w: 3.0, d: 2.6, ceil: 2.95, fab: o === 0 ? 'p_fab_blue' : 'p_fab_teal' });
    }
    pr(B, 'hospital_bed', cx - 4.1, y, 30, { ry: FX, monitor: false });
    fixtures(B, cx - 5.33, 26, cx + 5.33, 40, C, { dx: 3.5, dz: 4.5, on: .25 });
  }
}

function dressBasement(B) {
  const y = FB, C = -1;
  // MORTUARY (team 2 lobby): fridge banks, post-mortem table, trolleys
  P(B, 'fridge3', -5, y, 38.95, { ry: SZ }); P(B, 'fridge3', -2.25, y, 38.95, { ry: SZ });
  P(B, 'pmtable', -10.8, y, 36.5); P(B, 'trolley', 3.2, y, 31, { ry: FX });
  P(B, 'sharps', -11.8, y + 1.1, 31.5, { ry: FX }); P(B, 'gel', 3.85, y, 34, { ry: BX });
  fixtures(B, -12, 30, 4, 40, C, { dx: 4, dz: 3.5, kind: 'strip', on: .55 });
  // corridors: ducts and cable trays under the ceiling, parked trolleys
  run(B, -46, 28.9, -12.2, 28.9, C - .45, .6, .35); run(B, -46, 27.0, -12.2, 27.0, C - .2, .35, .06, 'p_paint_darkgrey');
  run(B, 4.2, 21.1, 46, 21.1, C - .45, .6, .35); run(B, 4.2, 23, 46, 23, C - .2, .35, .06, 'p_paint_darkgrey');
  run(B, 2.9, 8.2, 2.9, 20, C - .45, .5, .3);
  pr(B, 'gurney', -20, y, 26.5, { ry: FX }); P(B, 'cage', -44, y, 29.4, { ry: SZ }); P(B, 'cage', 30, y, 20.5, {}); pr(B, 'gurney', 14, y, 20.6, { ry: FX });
  pr(B, 'trash_bag', -36, y, 26.4, { n: 3 }); pr(B, 'trash_bag', 40, y, 23.6, { n: 3 });
  fixtures(B, -48, 26, -12, 30, C, { dx: 4.5, dz: 4, kind: 'strip', on: .3 });
  fixtures(B, -12, 20, 4, 30, C, { dx: 4, dz: 5, kind: 'strip', on: .4 });
  fixtures(B, 4, 20, 48, 24, C, { dx: 4.5, dz: 4, kind: 'strip', on: .3 });
  fixtures(B, 0, 8, 4, 20, C, { dx: 4, dz: 4, kind: 'strip', on: .4 });
  // plant room: boilers, generator, pipes
  P(B, 'boiler', -22, y, 36.6, { ry: SZ }); P(B, 'boiler', -16.6, y, 36.6, { ry: SZ });
  pr(B, 'generator', -33, y, 38.6, { ry: SZ, variant: 'green' });
  pr(B, 'gas_cylinder', -13, y, 31, { rack: true, variant: 'oxygen' });
  run(B, -35, 34.5, -13, 34.5, C - .5, .25, .25, 'p_coat_green'); run(B, -35, 33.8, -13, 33.8, C - .5, .25, .25, 'p_coat_red');
  fixtures(B, -36, 30, -12, 40, C, { dx: 6, dz: 5, kind: 'strip', on: .3 });
  // linen store
  for (const [x, z] of [[-42.5, 32], [-41.5, 33.2], [-38, 37], [-39.2, 38.6]]) P(B, 'cage', x, y, z, { ry: x });
  fixtures(B, -44.4, 30, -36, 40, C, { dx: 4, dz: 5, kind: 'strip', on: .2 });
  // cold store + bulk store
  for (const x of [5, 6.2, 7.4, 12.5, 13.7, 14.9]) pr(B, 'shelf_unit', x, y, 39.55, { ry: SZ, variant: 'dark' });
  pr(B, 'cardboard_box', 8, y, 30, { variant: 'pile', n: 6 }); pr(B, 'drum', 14.5, y, 26, { n: 2, variant: 'blue' });
  fixtures(B, 4, 24, 16, 40, C, { dx: 4, dz: 5, kind: 'strip', on: .3 });
  pr(B, 'rack', 22, y, 38.65, { ry: SZ, bays: 2, levels: 2, lh: 1.2, load: .7 }); pr(B, 'rack', 36, y, 38.65, { ry: SZ, bays: 2, levels: 2, lh: 1.2, load: .5 });
  pr(B, 'pallet', 20, y, 28, { variant: 'boxes', h: 1.0 }); pr(B, 'pallet', 40.5, y, 27.5, { variant: 'wrap' }); pr(B, 'forklift', 25, y, 30, { ry: 1.2, variant: 'yellow' });
  pr(B, 'ibc_tank', 36, y, 27, {});
  fixtures(B, 16, 24, 44.4, 40, C, { dx: 5, dz: 5, kind: 'strip', on: .3 });
}

function dressGarage(B) {
  const y = 0;
  P(B, 'ambulance', -6, y, -77.2, {}); P(B, 'ambulance', 6, y, -77.2, { door: true });
  for (const x of [-11.2, -10]) pr(B, 'shelf_unit', x, y, -83.6, { variant: 'grey' });
  pr(B, 'lockers', 9.6, y, -83.55, { n: 6, variant: 'green' }); pr(B, 'gurney', -3.8, y, -83, { ry: FX });
  pr(B, 'medical_cart', 3.2, y, -83.3, { variant: 'red' });
  for (const x of [-7.5, 0, 7.5]) pr(B, 'light_fixture', x, 5.6, -80.5, { variant: 'strip', on: true });
  for (const x of [-7.5, 7.5]) pr(B, 'light_fixture', x, 5.6, -73.5, { variant: 'strip', on: x < 0 });
  pr(B, 'whiteboard', -6, 1.0, -83.84, { w: 2.4 }); pr(B, 'wall_clock', 0, 3.2, -83.84, {});
}

function dressOutside(B) {
  // visitor car park: rows of abandoned cars
  const carRow = (z, ry, xs) => xs.forEach((x, i) => pr(B, 'car', x, 0, z, { ry, state: (i * 7 + Math.round(z)) % 9 === 0 ? 'wreck' : 'ok', variant: ['sedan', 'hatch', 'suv', 'sedan', 'van'][(i + Math.round(x)) % 5] }));
  carRow(-22.5, SZ, [12, 15, 21, 27, 33, 39, 45]);
  carRow(-35.5, SZ, [12, 18, 24, 33, 36]);
  carRow(-41, 0, [12, 18, 21, 27, 33, 45]);
  for (const x of [10, 13.5, 17, 20.5, 24, 27.5, 31, 34.5, 38, 41.5, 45]) for (const z of [-25.4, -38.2]) B.box(x - 1.5, .005, z, .1, .004, 5, { mat: 'paint_white', collide: false, cast: false });
  // ED ambulance bay
  P(B, 'ambulance', -40.5, 0, -27, { ry: SZ }); pr(B, 'car', -30.5, 0, -44, { ry: .3, variant: 'police', state: 'wreck' });
  pr(B, 'jersey_barrier', -36, 0, -50.5, { ry: 0 }); pr(B, 'jersey_barrier', -32.5, 0, -50.6, { ry: .1 });
  // lawn: trees and shrubs
  for (const [x, z, v] of [[-24, -30, 'oak'], [-12, -45, 'birch'], [-25, -47, 'dead'], [-11, -24, 'oak']]) pr(B, 'tree', x, .1, z, { variant: v });
  for (const [x, z] of [[-22, -40], [-20.5, -41.2], [-15, -18], [-26.5, -18.5], [-13, -33]]) pr(B, 'bush', x, .1, z, { variant: 'shrub' });
  pr(B, 'grass_tall', -18, .1, -26, { variant: 'dry', w: 4, d: 3, h: .7 });
  // forecourt furniture
  for (const x of [-7, -3.5, 3.5, 7]) pr(B, 'bollard', x, .12, -22, { variant: 'concrete' });
  pr(B, 'bench', -5, .12, -30, { variant: 'metal' }); pr(B, 'bench', 5, .12, -30, { variant: 'metal' }); pr(B, 'litter_bin', 0, .12, -30, {});
  P(B, 'planterdead', -4, .12, -40, { len: 3 }); P(B, 'planterdead', 4, .12, -40, { len: 3 });
  for (const [x, z] of [[-26, -53], [-6, -53], [14, -53], [34, -53]]) pr(B, 'street_light', x, 0, z, { ry: SZ, on: x !== 14 });
  pr(B, 'bus_shelter', -18, .12, -51.2, { ry: SZ });
  pr(B, 'road_sign', 9, 0, -53.2, { variant: 'noentry', ry: SZ });
  // service yard
  P(B, 'lox', 57.5, 0, 9); pr(B, 'fence_chainlink', 57.5, 0, 6.3, { len: 6 }); pr(B, 'fence_chainlink', 54.4, 0, 9.2, { len: 6, ry: FX });
  P(B, 'skip', 53, 0, -3);
  pr(B, 'dumpster', 60.4, 0, 24, { ry: BX, variant: 'green' }); pr(B, 'dumpster', 60.4, 0, 21.6, { ry: BX, variant: 'blue', lid: 'open' });
  pr(B, 'generator', 58.6, 0, -30, { ry: BX, variant: 'trailer' });
  for (const [x, z] of [[50.5, 14], [51.5, 23.2]]) pr(B, 'pallet', x, 0, z, { variant: 'boxes', stack: 2, h: .8 });
  for (const z of [28, 28.8, 29.6]) pr(B, 'wheelie_bin', 60.8, 0, z, { ry: BX, variant: 'grey' });
  pr(B, 'trash_bag', 59, 0, 26.5, { n: 7 }); pr(B, 'cone', 51, 0, 18, {}); pr(B, 'cone', 51.2, 0, 19.8, {});
  pr(B, 'box_truck', 59.4, 0, -12, { ry: SZ, variant: 'plain', color: 'white' });
  // ring road: litter and a broken-down van
  pr(B, 'car', 30, 0, -58, { ry: BX, variant: 'van', state: 'wreck' }); pr(B, 'cone', 26.5, 0, -57.5, { variant: 'drum' });
  for (const [x, z] of [[-30, -16.5], [20, -16.2], [44, -16.5], [-46, -40]]) pr(B, 'trash_bag', x, .12, z, { n: 3 });
  for (const x of [-20, 20, 40]) pr(B, 'manhole', x, 0, -58, {});
}

function signage(B) {
  const S = (slot, x, y, z, w, h, f, o) => sign(B, slot, x, y, z, w, h, f, o);
  // ground floor
  S('directory', -15.8, 1.6, -3, 1.0, 1.25, 'e'); S('reception', -27.5, 2.55, -.17, 1.6, .3, 's');
  S('majors', -32.17, 2.5, 11, 1.4, .26, 'w'); S('xray', -35.83, 2.5, 13.5, 1.4, .3, 'e'); S('radiation', -36.2, 1.6, 12.2, .3, .3, 'w');
  S('lifts', -1, 2.7, 7.83, 1.2, .3, 's'); S('stairs', 4.17, 2.6, 13.4, 1.2, .3, 'e');
  S('chapel', -9, 2.5, 25.83, 1.4, .26, 's'); S('records', 8, 2.5, 25.83, 1.4, .26, 's');
  S('opd', 16.2, 2.6, -2, 1.6, .35, 'w'); S('pharmacy', 25.83, 2.45, 11, 2.4, .6, 'w');
  S('lockers', 20.2, 2.4, 35, 1.0, .25, 'w'); S('stores', 40.2, 2.5, 15, 1.0, .25, 'w');
  S('exit', -34, 2.75, -13.83, .8, .33, 'n', { glow: true }); S('exit', 0, 2.75, -13.6, .8, .33, 'n', { glow: true }); S('exit', 30, 2.75, -13.83, .8, .33, 'n', { glow: true });
  S('exit', -36.17, 2.7, 33, .8, .33, 'w', { glow: true }); S('exit', 47.83, 2.95, 18.75, .8, .33, 'w', { glow: true });
  S('lvl_g', -44.6, 1.6, 33, .4, .4, 'e'); S('lvl_g', 10.75, 1.6, 9.8, .4, .4, 'e');
  S('notice', 15.83, 1.3, -10, .5, .7, 'w'); S('wash', -32.17, 1.3, 8.5, .45, .63, 'w'); S('notice', -36.17, 1.3, 5, .45, .63, 'w');
  // site letters (spray paint)
  S('dir_b', 26.17, 1.2, 21, 1.0, 1.0, 'w'); S('dir_b', 39.83, 1.5, 20, 1.0, 1.0, 'w', { off: -.33 });
  // first floor
  S('theatres', -32, F1 + 2.55, 10.83, 1.6, .35, 's'); S('in_use', -40, F1 + 2.4, 16.17, .9, .3, 'n'); S('recovery', -24, F1 + 2.75, 11.17, 1.4, .26, 'n');
  S('ward7', 0, F1 + 2.6, 26.17, 1.6, .35, 'n'); S('bay_1', -10.67, F1 + 2.35, 26.17, .7, .26, 'n'); S('bay_2', 0, F1 + 2.35, 26.17, .7, .26, 'n'); S('bay_3', 10.67, F1 + 2.35, 26.17, .7, .26, 'n');
  S('lvl_1', -44.6, F1 + 1.6, 33, .4, .4, 'e'); S('lvl_1', 10.75, F1 + 1.6, 9.8, .4, .4, 'e');
  S('dir_a', -32.17, F1 + 1.3, 26, 1.0, 1.0, 'w'); S('dir_a', -38, F1 + 1.3, 30.17, 1.0, 1.0, 'n'); S('dir_a', -40, F1 + 1.3, 10.83, 1.0, 1.0, 's');
  S('exit', -38, F1 + 2.8, 7.2, .8, .33, 'n', { glow: true }); S('exit', -16.2, F1 + 2.8, 32, .8, .33, 'e', { glow: true });
  // basement
  S('mortuary', -4, FB + 3.1, 29.83, 1.6, .35, 's'); S('plant', -30, FB + 2.55, 29.83, 1.0, .25, 's'); S('coldroom', 10, FB + 2.55, 24.17, 1.0, .25, 'n');
  S('stores', 24, FB + 2.55, 24.17, 1.0, .25, 'n'); S('lvl_b1', -44.6, FB + 1.6, 33, .4, .4, 'e'); S('oxygen', -12.17, FB + 1.6, 33, .5, .33, 'w');
  S('exit', -46.2, FB + 2.75, 29.83, .8, .33, 's', { glow: true }); S('exit', 46.2, FB + 2.75, 29.83, .8, .33, 's', { glow: true });
  // grime: stains, leaks, cracks, tags, litter on the floors
  const G = [['leak', -24, 1.8, -.17, .5, 2, 's'], ['mould', -47.83, 2.4, -6, 1.2, 1.2, 'e'], ['stain_0', -30, .5, -13.83, 1.4, 1.4, 'n'],
    ['crack', 4.2, 2.2, -5, 2, .5, 'e'], ['tag_0', 15.83, 1.6, -11, 2.4, 1.2, 'w'], ['tag_1', -47.85, 1.4, 34, 2.4, 1.2, 'e'],
    ['mould', -11.83, FB + 2.6, 38, 1.4, 1.4, 'e'], ['leak', -20, FB + 1.8, 29.83, .5, 2, 's'], ['stain_1', 20, FB + .6, 20.17, 1.6, 1.6, 'n'],
    ['tag_2', 30, 1.6, -14.17, 2.4, 1.2, 's'], ['tag_0', -12.15, 1.6, -69.85, 2.6, 1.3, 'w'], ['scorch', 36, .9, 29.83, 1.4, 1.4, 's'],
    ['stain_2', -16.17, F1 + 1, 18, 1.4, 1.4, 'w'], ['leak', -40, F1 + 1.8, 7.17, .5, 2, 'n'], ['crack', -24, F1 + 2.4, 29.83, 2, .5, 's']];
  for (const g of G) S(...g);
  const F = [['papers', -38, .02, -6, 2.4, 2.4], ['papers', 3, .02, 2.5, 2.4, 2.4], ['dirt', -6, .02, -11, 3, 3], ['papers', 32, .02, 14, 2.6, 2.6],
    ['dirt', 22, .02, -10, 3, 3], ['papers', 8, .02, 34, 2.4, 2.4], ['dirt', -24, .02, 12, 3, 3], ['papers', -38, F1 + .02, 25.5, 2.4, 2.4],
    ['dirt', -24, F1 + .02, 20, 3, 3], ['papers', 0, F1 + .02, 32, 2.4, 2.4], ['dirt', -4, FB + .02, 24, 3, 3], ['dirt', -30, FB + .02, 28, 3, 3],
    ['leaves', 0, .14, -16, 3, 3], ['leaves', 30, .02, -12.5, 2.4, 2.4], ['leaves', -34, .02, -12, 2.6, 2.6], ['dirt', 0, .02, -66, 4, 4]];
  for (const [s, x, yy, z, w, h] of F) S(s, x, yy, z, w, h, 'u', { ry: (x * 13 + z) % 6 });
}
