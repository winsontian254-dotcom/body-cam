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
    lights(B); markers(B); skylineAll(B);
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
    [-6, 0, -10], [10, 0, -10], [-10, 0, 14], [24, 0, -6], [44, 0, -8], [34, 0, 24], [44, 0, 22], [-40, F1, 9], [-22, F1, 28], [-8, F1, 30], [10, F1, 30],
    [-13, F1, -10], [-40, FB, 28], [-24, FB, 35], [28, FB, 34], [36, FB, 22], [8, F0, 36]])
    B.spawn(0, x, y, z, Math.atan2(-x, -z));
  // sites
  B.site('A', { x0: -47.6, z0: 16.4, x1: -32.4, z1: 29.6, y: F1 });
  B.site('B', { x0: 26.4, z0: 6, x1: 39.6, z1: 28, y: F0 });
  // hostages + rescue at the ambulance station apron
  B.hostage(-43, F0, 13); B.hostage(-12, F0, 36); B.hostage(11, F1, 35); B.hostage(30, FB, 34); B.hostage(10, F0, 34);
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
