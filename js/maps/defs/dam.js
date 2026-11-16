/* LIVE FIRE — Grey Falls Dam (dam): a 14 m roller-compacted concrete gravity dam across a wooded river gorge, overcast.
   Original location. Plan (x east, z north, metres; tailwater yard y 0, crest road y 14; reservoir north, river south):
     T1 lobby  = crest road gatehouse on the west abutment (x -64..-50, z 40..55, y 14); gates E (crest) and S (west ramp road).
     SITE A    = POWERHOUSE turbine hall at the dam toe (x -38..8, z 6..34): three generator units, erection bay (west roller
                 door), north walkway and control-room mezzanine (y 4.5, exterior stair from mid), gallery door (north).
     SITE B    = MAIN TRANSFORMER YARD (x 22..56, z -6..30, fenced): three GSU transformers between fire walls, line gantry,
                 relay kiosk (roof = high ground). Gates W (mid), N (toe road / gallery portal), S (car park).
     MID       = toe yard between them (x 8..22) with the ACCESS SHAFT (stair tower embedded in the dam, x 11..17) whose
                 portal opens at the toe and whose stair house opens on the crest.
     GALLERY   = inspection gallery inside the dam (z 45..50, y 0) linking the powerhouse, the shaft and the B portal.
     East flank = steel stair in the notch by the spillway training wall (x 56..63) from the toe road up to the crest.
     T2 lobby  = STAFF CANTEEN on the river road (x -14..10, z -50..-36); maintenance workshop west of it, car park east.
   Out of bounds: reservoir + far shore (north), spillway gates and chute (east), river and wooded far bank (south), rock hills.
   Prefabs and painters: js/maps/kit_dam.js. Design notes: tools/test/out/notes-map-dam.md (git-ignored). */
import { rng, lwall, rail, fence, slope, decal, finish } from '../kit_dam.js';

const PI = Math.PI, H = PI / 2;
const CR = 14;                       // crest road surface
const TOE = 34, SH = 1.75, ST = 1.45; // dam toe line, step rise / tread (8 steps up to the crest)
const CZ0 = 45.6, CZ1 = 54.4;        // crest slab (downstream / upstream edges)
const RZ0 = -20, RZ1 = 38;           // west ramp road: y 0 at RZ0 .. y CR at RZ1
const rampH = z => Math.max(0, Math.min(CR, (z - RZ0) / (RZ1 - RZ0) * CR));
const smooth = t => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
const n2 = (x, z) => Math.sin(x * .13 + z * .07) * Math.cos(z * .11 - x * .05) + .5 * Math.sin(x * .31 - z * .23);
// west hill (beyond the ramp, x < -62): climbs from the ramp edge
const hillW = (x, z) => {
  if (z >= 38) { const d = Math.max(0, -64 - x); return d > 0 ? CR + .9 * Math.pow(d, 1.15) + (d > 3 ? n2(x, z) * 1.5 : 0) : CR - .1; }
  const d = Math.max(0, -62 - x), lift = smooth((z + 20) / 6) * 1.3; return rampH(z) + lift + 0.9 * Math.pow(d, 1.15) + (d > 3 ? n2(x, z) * 1.5 : 0);
};
const face = (x, z, tx, tz) => Math.atan2(tx - x, tz - z);   // yaw that looks from (x, z) at (tx, tz)

/** concrete parapet along x at z (centre line), from x0 to x1, top at y + 1.05, with a movement collider to y + 1.35 */
function parapet(B, x0, x1, z, y, o = {}) {
  const L = x1 - x0, cx = (x0 + x1) / 2;
  B.box(cx, y, z, L, .95, .4, { mat: o.mat || 'concrete', collide: false });
  B.box(cx, y + .95, z, L + .04, .1, .48, { mat: 'concrete_panels', collide: false });       // coping
  B.box(cx, y, z, L, 1.38, .4, { visible: false, surf: 'concrete' });
}
/** a concrete edge wall whose top follows a slope along z (y0 at z0 .. y1 at z1): visual wedge + stepped colliders */
function edgeWall(B, x, z0, z1, y0, y1, o = {}) {
  const w = o.w || .3, up = o.up || 1.0;
  B.ramp({ x, z: (z0 + z1) / 2, w, len: z1 - z0, y0: y0 + up, y1: y1 + up, dir: '+z', mat: o.mat || 'concrete', collide: false });
  const n = Math.ceil((z1 - z0) / 2);
  for (let i = 0; i < n; i++) {
    const a = z0 + (z1 - z0) * i / n, b = z0 + (z1 - z0) * (i + 1) / n, top = y0 + (y1 - y0) * (i + 1) / n + 1.35;
    B.box(x, 0, (a + b) / 2, w, top, b - a, { visible: false, surf: 'concrete' });
  }
}
/** ground pieces (flat, y 0) of non-overlapping rects [x0, z0, x1, z1, mat] */
function pave(B, rects) { for (const [x0, z0, x1, z1, mat] of rects) if (mat !== 'none') B.ground({ minX: x0, maxX: x1, minZ: z0, maxZ: z1, mat, res: .1 }); }

export default {
  id: 'dam', name: 'Grey Falls Dam',
  desc: 'Hydroelectric dam on an overcast day: the crest road, a turbine hall at the toe, a stair shaft and inspection gallery inside the concrete, and the main transformer yard.',
  size: 'L', chunk: 64,
  env: { hdri: 'overcast', sky: 'hdri', time: 'overcast', exposure: 1.0, sun: { dir: [.42, -.78, .46], color: [1, .97, .92], intensity: .9 },
    fog: { color: [.62, .66, .7], density: .0035 }, weather: 'clear', wind: [1.5, -2], ambience: 'dam', reverb: 'outdoor', indoorIbl: .35 },
  bounds: { minX: -64, maxX: 63, minZ: -56, maxZ: 55, minY: -6, maxY: 30 },

  build(B) {
    const R = rng(31);
    const PF = globalThis.__DAM_PROF ? { t: performance.now() } : null;
    const mark = k => { if (!PF) return; const t = performance.now(); console.log('[dam] ' + k + ' ' + Math.round(t - PF.t)); PF.t = t; };
    // ================================================================== ground (valley floor y 0) and terrain
    pave(B, [
      [-64, -34, 63, -27, 'asphalt'],                               // river road
      [-64, -56, -14, -34, 'grass'], [10, -56, 63, -34, 'grass'], [-14, -56, 10, -50, 'grass'],
      [-14, -50, 10, -36, 'tile_floor'], [-14, -36, 10, -34, 'pavement'],   // canteen floor + its pavement
      [-64, -27, -40, 6, 'asphalt'], [-64, 6, -38, 34, 'asphalt'],          // west yard
      [-40, -27, 8, -12, 'concrete_floor'], [-40, -12, 8, 6, 'concrete_panels'],   // workshop yard, south deck
      [-38, 6, 8, 34, 'concrete_floor'],                            // turbine hall floor
      [8, -27, 22, 34, 'concrete_floor'],                           // mid toe yard
      [22, -6, 56, 30, 'gravel'], [22, -27, 56, -6, 'asphalt'],     // transformer yard, car park
      [22, 30, 56, 34, 'asphalt'], [56, -27, 63, 34, 'asphalt'], [56, 34, 63, 45.6, 'gravel'],   // toe road, east lane, stair notch
    ]);
    B.ground({ minX: -120, maxX: -62, minZ: -60, maxZ: 60, res: 2, mat: 'rock', height: hillW });

    mark('the dam: crest'); // ================================================================== the dam: crest, stepped downstream face, upstream face
    B.box(6.5, CR - 2, (CZ0 + CZ1) / 2, 113, 2, CZ1 - CZ0, { mat: 'concrete', mats: { t: 'asphalt' } });      // crest slab x -50..63
    B.box(6.5, 4, 54.7, 113, 8, .6, { mat: 'concrete', collide: false });                                       // upstream face (to the water)
    parapet(B, -50, 63, 54.2, CR);
    // downstream parapet with openings at the shaft stair house (x 11.5..13.5) and the east stair (x 56.5..61.5)
    parapet(B, -50, 11.4, 45.8, CR); parapet(B, 13.6, 56.4, 45.8, CR); parapet(B, 61.6, 63, 45.8, CR);
    // steps (front z = TOE + ST * i), cut where structures stand in front of / through the face
    const stepCut = i => {
      const cuts = [[-38.3, 8.3, i <= 6], [11, 17, i <= 6], [40, 43, i <= 1]];
      const segs = []; let u = -55;
      for (const [a, b, on] of cuts) if (on) { if (a > u) segs.push([u, a]); u = b; }
      segs.push([u, 56]); return segs;
    };
    for (let i = 0; i < 8; i++) for (const [a, b] of stepCut(i)) {
      const dd = i === 7 ? ST : ST + .25; B.box((a + b) / 2, SH * i, TOE + ST * i + dd / 2, b - a, SH, dd, { mat: 'concrete', skip: 'b' });
    }

    mark('T1 lobby: crest'); // ================================================================== T1 lobby: crest road gatehouse (west abutment)
    const LY = CR;
    B.box(-57, 8.75, 47.5, 14, LY - 8.75, 15, { mat: 'concrete', mats: { t: 'concrete_floor' } });             // abutment block
    B.room({ x: -57, z: 47.5, w: 14, d: 15, y: LY, h: 4, wall: 'concrete_panels', outer: 'concrete', frames: false,
      doors: { e: [{ at: 10, w: 4.2, h: 3.2, frame: false }], s: [{ at: 5.5, w: 4.2, h: 3.2, frame: false }] } });
    B.lobby(1, { x0: -63.8, z0: 40.2, x1: -50.2, z1: 54.8, y: LY }, [
      { x: -50.1, z: 50, w: 4.2, h: 3.2, ry: H, y: LY }, { x: -58.5, z: 40.1, w: 4.2, h: 3.2, ry: 0, y: LY }]);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) B.spawn(1, -61.5 + i * 2.6, LY, 43.5 + j * 2.8, j === 0 ? PI * .8 : H);

    mark('west ramp road'); // ================================================================== west ramp road (from the gatehouse down to the west yard)
    B.ramp({ x: -58.5, z: (RZ0 + RZ1) / 2, w: 7, len: RZ1 - RZ0, y0: 0, y1: CR, dir: '+z', mat: 'concrete' });
    B.box(-58.5, 0, 39, 7, CR, 2, { mat: 'concrete', mats: { t: 'asphalt' } });
    slope(B, -61.9, -55.1, RZ0, RZ1, .02, CR + .02, 'asphalt');
    edgeWall(B, -55.15, -14, RZ1, rampH(-14), CR, { w: .3, up: .9 });
    B.box(-55.15, 0, 39, .3, CR + .9, 2, { mat: 'concrete' });
    edgeWall(B, -61.85, RZ0, RZ1, 0, CR, { w: .3, up: 1.45 });
    B.box(-61.85, 0, 39, .3, CR + 1.45, 2, { mat: 'concrete' });

    mark('SITE A: powerhouse'); // ================================================================== SITE A: powerhouse (turbine hall)
    const PX0 = -38, PX1 = 8, PZ0 = 6, PZ1 = 34, PT = .3, ROOF = 13;
    // B.wall: mat = the left side walking from start to end (+z for walls running east, -x for walls running north)
    lwall(B, PX0, PZ0 + PT / 2, PX1, PZ0 + PT / 2, { t: PT, layers: [{ h: 4, mat: 'concrete_panels', mat2: 'concrete_panels' }, { h: 8.8, mat: 'paint_white', mat2: 'concrete' }],
      openings: [{ at: 18, w: 1.2, h: 2.2, frame: 'steel_dark' }, { at: 30, w: 4.2, h: 4.6, frame: 'steel_dark' },
        ...[3, 9, 15, 21, 27, 35, 41].map(a => ({ at: a, w: 3.2, y: 8, h: 3, glass: true, frame: 'steel_dark' }))] });
    lwall(B, PX0 + PT, PZ1 - PT / 2, PX1 - PT, PZ1 - PT / 2, { t: PT, layers: [{ h: 4, mat: 'concrete', mat2: 'concrete_panels' }, { h: 8.8, mat: 'concrete', mat2: 'paint_white' }],
      openings: [{ at: 11.2, w: 1.6, h: 2.4, frame: 'steel_dark' }] });
    lwall(B, PX0 + PT / 2, PZ0 + PT, PX0 + PT / 2, 44.2, { t: PT, layers: [{ h: 4, mat: 'concrete_panels', mat2: 'concrete_panels' }, { h: 8.8, mat: 'concrete', mat2: 'paint_white' }],
      openings: [{ at: 5.7, w: 5, h: 5.5, frame: 'steel_dark' }, { at: 14, w: 2.4, y: 7.5, h: 2.6, glass: true, frame: 'steel_dark' }] });
    lwall(B, PX1 - PT / 2, PZ0 + PT, PX1 - PT / 2, 44.2, { t: PT, layers: [{ h: 4, mat: 'concrete_panels', mat2: 'concrete_panels' }, { h: 8.8, mat: 'paint_white', mat2: 'concrete' }],
      openings: [{ at: 3.7, w: 1.2, y: 4.5, h: 2.2, frame: 'steel_dark' }, { at: 14, w: 2.4, y: 7.5, h: 2.6, glass: true, frame: 'steel_dark' }] });
    B.box((PX0 + PX1) / 2, ROOF - .4, 25.05, PX1 - PX0 + .3, .4, 38.3, { mat: 'concrete_dark', mats: { b: 'metal_painted' } });   // roof z 5.9..44.2
    // mezzanine (control room + balcony) and the north walkway, both at y 4.5
    const MZ = 4.5;
    B.floor(1, PZ0 + PT, PX1 - PT, PZ1 - PT, MZ, { t: .3, mat: 'concrete_floor', mats: { b: 'paint_white' } });
    B.floor(PX0 + PT, 31.2, 1, PZ1 - PT, MZ, { t: .3, mat: 'concrete_floor', mats: { b: 'paint_white' } });
    for (const z of [6.7, 12, 18, 24, 30]) B.box(1.25, 0, z, .4, MZ - .3, .4, { mat: 'concrete' });
    rail(B, 1.1, PZ0 + PT, 1.1, 14, MZ, { mat: 'paint_yellow' });
    rail(B, PX0 + 2.5, 31.2, 1, 31.2, MZ, { mat: 'paint_yellow' });
    // control room glass wall + ceiling
    B.wall(1.1, 16, 1.1, PZ1 - PT, { y: MZ, h: 3.0, t: .12, mat: 'paint_white', openings: [
      { at: 8, w: 9, y: .9, h: 1.9, glass: true, frame: 'steel_dark' }, { at: 16.4, w: 1.0, h: 2.2, frame: 'steel_dark' }] });
    B.wall(1.04, 16, PX1 - PT, 16, { y: MZ, h: 3.0, t: .12, mat: 'paint_white', openings: [{ at: 3.4, w: 1.0, h: 2.2, frame: 'steel_dark' }] });
    B.floor(1.05, 16, PX1 - PT, PZ1 - PT, MZ + 3.2, { t: .2, mat: 'concrete', mats: { b: 'ceiling_tile' } });
    // stairs: erection bay -> walkway, hall -> balcony (landing), exterior (mid) -> east door
    B.stairs({ x: PX0 + 1.3, z: 27.7, w: 2, len: 7, y0: 0, y1: MZ, dir: '+z', mat: 'steel_dark', tread: 'grate', rail: 'right', railMat: 'paint_yellow' });
    B.stairs({ x: 0, z: 10.5, w: 1.8, len: 7, y0: 0, y1: MZ, dir: '+z', mat: 'steel_dark', tread: 'grate', rail: true, railMat: 'paint_yellow' });
    B.floor(-.9, 14, 1, 16, MZ, { t: .3, mat: 'grate', mats: { b: 'steel_dark' } });
    rail(B, -.95, 14, -.95, 16, MZ); rail(B, -.95, 16, 1, 16, MZ);
    B.floor(PX1, 8.6, PX1 + 2, 11.4, MZ, { t: .3, mat: 'grate', mats: { b: 'steel_dark' } });
    B.stairs({ x: PX1 + 1, z: 14.9, w: 1.8, len: 7, y0: 0, y1: MZ, dir: '-z', mat: 'steel_dark', tread: 'grate', rail: true, railMat: 'paint_yellow' });
    rail(B, PX1 + 2, 8.6, PX1 + 2, 11.4, MZ); rail(B, PX1, 8.6, PX1 + 2, 8.6, MZ);
    // generator units (pedestal, stator housing, exciter): walkable tops at 2.4
    const UNITS = [-26, -15, -4], UZ = 20;
    for (const ux of UNITS) {
      B.cyl(ux, 0, UZ, 3.5, .35, { mat: 'concrete', sides: 28 });
      B.cyl(ux, .35, UZ, 3.1, 2.05, { mat: 'paint_blue', sides: 28 });
      B.cyl(ux, 2.4, UZ, 1.1, 1.3, { mat: 'paint_white', sides: 18 });
    }
    B.stairs({ x: -26, z: 15.2, w: 1.1, len: 2.8, y0: .35, y1: 2.4, dir: '+z', mat: 'steel_dark', tread: 'grate', rail: true, railMat: 'paint_yellow' });
    B.stairs({ x: -4, z: 15.2, w: 1.1, len: 2.8, y0: .35, y1: 2.4, dir: '+z', mat: 'steel_dark', tread: 'grate', rail: true, railMat: 'paint_yellow' });
    B.site('A', { x0: -33, z0: 10, x1: -9, z1: 30, y: 0 });

    mark('inspection gallery'); // ================================================================== inspection gallery, adits, access shaft (inside the dam)
    const T3 = .3, GM = 'concrete_dark';
    const wb = (x0, x1, z0, z1, y0, y1, m = GM) => B.box((x0 + x1) / 2, y0, (z0 + z1) / 2, x1 - x0, y1 - y0, z1 - z0, { mat: m });
    const cb = (x0, x1, z0, z1, y) => B.box((x0 + x1) / 2, y, (z0 + z1) / 2, x1 - x0, .3, z1 - z0, { mat: GM, mats: { b: GM } });
    const fb = (x0, x1, z0, z1) => B.floor(x0, z0, x1, z1, 0, { t: .3, mat: 'concrete_floor' });
    // west gallery G1 (interior x -27.7..-1.3, z 46.3..48.7, h 3)
    fb(-27.7, -1, 46.3, 48.7);
    wb(-28, -27.7, 46, 46.3, 0, 3); wb(-25.3, -1.3, 46, 46.3, 0, 3); wb(-28, -1.3, 48.7, 49, 0, 3); wb(-28, -27.7, 46.3, 48.7, 0, 3);
    cb(-28, -1.3, 46, 49, 3);
    // valve chamber (interior x -1..9, z 45.4..50.4, h 3.6)
    fb(-1, 9, 45.4, 50.4);
    wb(-1.3, -1, 45.1, 46.3, 0, 3.6); wb(-1.3, -1, 48.7, 50.7, 0, 3.6); wb(-1.3, -1, 46.3, 48.7, 3, 3.6);
    wb(9, 9.3, 45.1, 47.3, 0, 3.6); wb(9, 9.3, 49.7, 50.7, 0, 3.6); wb(9, 9.3, 47.3, 49.7, 3, 3.6);
    wb(-1, 9, 45.1, 45.4, 0, 3.6); wb(-1, 9, 50.4, 50.7, 0, 3.6);
    cb(-1.3, 9.3, 45.1, 50.7, 3.6);
    // east gallery G2 (interior x 9.3..42.7, z 47.3..49.7, h 3)
    fb(9, 42.7, 47.3, 49.7);
    wb(9.3, 14.3, 47, 47.3, 0, 3); wb(16.7, 40.3, 47, 47.3, 0, 3); wb(42.7, 43, 47, 47.3, 0, 3); wb(9.3, 43, 49.7, 50, 0, 3); wb(42.7, 43, 47.3, 49.7, 0, 3);
    cb(9.3, 43, 47, 50, 3);
    // powerhouse adit (interior x -27.7..-25.3, z 34..46)
    fb(-27.7, -25.3, 34, 46.3); wb(-28, -27.7, 34, 46, 0, 2.7); wb(-25.3, -25, 34, 46, 0, 2.7); cb(-28, -25, 34, 46, 2.7); wb(-27.7, -25.3, 46, 46.3, 2.7, 3);
    // B portal adit (interior x 40.3..42.7, z 34..47), hood over the portal
    fb(40.3, 42.7, 34, 47.3); wb(40, 40.3, 34, 47, 0, 3.2); wb(42.7, 43, 34, 47, 0, 3.2); cb(40, 43, 33.6, 47, 3.2); wb(40.3, 42.7, 47, 47.3, 3, 3.2);
    // shaft passage (interior x 14.3..16.7, z 43.3..47)
    fb(14.3, 16.7, 43.3, 47.3); wb(14, 14.3, 43.6, 47, 0, 2.6); wb(16.7, 17, 43.6, 47, 0, 2.6); cb(14, 17, 43.6, 47, 2.6); wb(14.3, 16.7, 47, 47.3, 2.6, 3);
    // access shaft (stair tower x 11..17, z 34..43.6): 5 flights of 2.8 m round a spine wall
    const TX0 = 11, TX1 = 17, TZ0 = 34, TZ1 = 43.6, TT = .3, TOP = 17.1;
    lwall(B, TX0, TZ0 + TT / 2, TX1, TZ0 + TT / 2, { t: TT, layers: [{ h: TOP, mat: 'concrete_dark', mat2: 'concrete' }],
      openings: [{ at: 3, w: 1.6, h: 2.4, frame: 'steel_dark' }, { at: 1.5, w: .9, y: 6.8, h: .6 }, { at: 1.5, w: .9, y: 12.4, h: .6 }] });
    lwall(B, TX0, TZ1 - TT / 2, TX1, TZ1 - TT / 2, { t: TT, layers: [{ h: TOP, mat: 'concrete', mat2: 'concrete_dark' }],
      openings: [{ at: 4.5, w: 2.0, h: 2.5 }, { at: 1.5, w: 1.3, y: CR, h: 2.2, frame: 'steel_dark' }] });
    lwall(B, TX0 + TT / 2, TZ0 + TT, TX0 + TT / 2, TZ1 - TT, { t: TT, layers: [{ h: TOP, mat: 'concrete', mat2: 'concrete_dark' }] });
    lwall(B, TX1 - TT / 2, TZ0 + TT, TX1 - TT / 2, TZ1 - TT, { t: TT, layers: [{ h: TOP, mat: 'concrete_dark', mat2: 'concrete' }],
      openings: [{ at: 1.1, w: .9, y: 6.6, h: .6 }, { at: 7.9, w: .9, y: 3.9, h: .6 }, { at: 7.9, w: .9, y: 9.5, h: .6 }] });
    B.floor(TX0 + TT, TZ0, TX1 - TT, TZ1 - TT, 0, { t: .3, mat: 'concrete_floor' });
    B.box(14, TOP - .3, 38.8, 6.2, .3, 9.8, { mat: 'concrete_dark', mats: { b: 'concrete_dark' } });
    B.box(14, 0, 38.75, .3, TOP - .3, 4.5, { mat: 'concrete_dark' });                                    // spine wall z 36.5..41
    for (const y of [5.6, 11.2]) B.floor(TX0 + TT, TZ0 + TT, TX1 - TT, 36.5, y, { t: .25, mat: 'concrete_floor', mats: { b: 'concrete_dark' } });
    for (const y of [2.8, 8.4, CR]) B.floor(TX0 + TT, 41, TX1 - TT, TZ1 - TT, y, { t: .25, mat: 'concrete_floor', mats: { b: 'concrete_dark' } });
    const flight = (x, y0, dir) => B.stairs({ x, z: 38.75, w: 2.4, len: 4.5, y0, y1: y0 + 2.8, dir, mat: 'concrete', tread: 'concrete_floor', rail: false });
    flight(12.5, 0, '+z'); flight(15.5, 2.8, '-z'); flight(12.5, 5.6, '+z'); flight(15.5, 8.4, '-z'); flight(12.5, 11.2, '+z');
    // filler between the tower and the top step (the top door's bridge), leaving the passage below
    B.box(14, 3.0, (TZ1 + 44.15) / 2, 6, CR - 3, 44.15 - TZ1, { mat: 'concrete' });
    B.box(12.5, 0, (TZ1 + 44.15) / 2, 3, 3, 44.15 - TZ1, { mat: 'concrete' });

    mark('MID: toe'); // ================================================================== MID: toe yard, toe road
    // (dressing later)

    mark('SITE B: main'); // ================================================================== SITE B: main transformer yard
    fence(B, 22, -6, 22, 10, { barbed: true, h: 2.4 }); fence(B, 22, 14, 22, 30, { barbed: true, h: 2.4 });
    fence(B, 22, 30, 38, 30, { barbed: true, h: 2.4 }); fence(B, 42, 30, 56, 30, { barbed: true, h: 2.4 });
    fence(B, 56, -6, 56, 30, { barbed: true, h: 2.4 });
    fence(B, 22, -6, 44, -6, { barbed: true, h: 2.4 }); fence(B, 48, -6, 56, -6, { barbed: true, h: 2.4 });
    for (const tx of [30, 40, 50]) {
      B.box(tx, 0, 12, 9, .3, 8, { mat: 'concrete', mats: { t: 'gravel' } });            // bund
      B.box(tx, .3, 12, 5, 3.6, 3.2, { mat: 'metal_painted' });   // tank
      B.box(tx - 3.1, .3, 12, 1.2, 3.0, 2.8, { mat: 'steel' }); B.box(tx + 3.1, .3, 12, 1.2, 3.0, 2.8, { mat: 'steel' });   // radiators
    }
    for (const fx of [35, 45]) B.box(fx, 0, 12, .4, 6.5, 11, { mat: 'concrete' });            // fire walls
    // relay kiosk (SW) with a stair to its roof
    B.room({ x: 26.5, z: -2, w: 7, d: 6, h: 3.2, wall: 'plaster_white', outer: 'concrete_panels', ceil: 'ceiling_tile', roof: 'concrete_dark', frames: 'steel_dark',
      doors: { n: [3.5] }, windows: { w: [{ at: 3, w: 1.4, glass: true }] } });
    B.stairs({ x: 30.9, z: -1.2, w: 1.0, len: 5.4, y0: 0, y1: 3.4, dir: '-z', mat: 'steel_dark', tread: 'grate', rail: 'right', railMat: 'paint_yellow' });
    B.floor(30, -5, 31.4, -3.9, 3.4, { t: .2, mat: 'grate', mats: { b: 'steel_dark' } });
    for (const [a, b, c, d] of [[23.1, .9, 29.9, .9], [23.1, -4.9, 31.3, -4.9], [23.1, -4.9, 23.1, .9], [29.9, -3.9, 29.9, .9], [31.35, -4.9, 31.35, -3.9]]) rail(B, a, b, c, d, 3.4, { mat: 'steel_dark' });
    B.site('B', { x0: 25, z0: 2, x1: 54, z1: 24, y: 0 });

    mark('east stair'); // ================================================================== east stair (notch by the spillway training wall)
    B.box(63.5, 0, -5, 1, 4, 102, { mat: 'concrete' });
    B.box(63.5, 4, 33, 1, 11, 26, { mat: 'concrete' });
    const EF = (x, y0, dir) => B.stairs({ x, z: 35.75, w: 2, len: 4.5, y0, y1: y0 + 2.8, dir, mat: 'steel_dark', tread: 'grate', rail: true, railMat: 'paint_yellow' });
    EF(57.5, 0, '+z'); EF(60.5, 2.8, '-z'); EF(57.5, 5.6, '+z'); EF(60.5, 8.4, '-z'); EF(57.5, 11.2, '+z');
    for (const y of [2.8, 8.4]) B.floor(56.5, 38, 61.5, 40, y, { t: .2, mat: 'grate', mats: { b: 'steel_dark' } });
    for (const y of [5.6, 11.2]) B.floor(56.5, 31.5, 61.5, 33.5, y, { t: .2, mat: 'grate', mats: { b: 'steel_dark' } });
    B.floor(56.5, 38, 61.5, CZ0, CR, { t: .2, mat: 'grate', mats: { b: 'steel_dark' } });
    for (const y of [2.8, 8.4]) { rail(B, 56.5, 40, 61.5, 40, y); rail(B, 61.5, 38, 61.5, 40, y); rail(B, 56.5, 38, 56.5, 40, y); }
    for (const y of [5.6, 11.2]) { rail(B, 56.5, 31.5, 61.5, 31.5, y); rail(B, 61.5, 31.5, 61.5, 33.5, y); rail(B, 56.5, 31.5, 56.5, 33.5, y); }
    rail(B, 56.5, 38, 56.5, CZ0, CR); rail(B, 61.5, 38, 61.5, CZ0, CR); rail(B, 58.5, 38, 61.5, 38, CR);

    mark('south: workshop'); // ================================================================== south: workshop, deck, river road, car park
    B.room({ x: -28, z: -19, w: 20, d: 14, h: 5.5, wall: 'corrugated', outer: 'corrugated', ceil: 'corrugated', roof: 'corrugated', frames: 'steel_dark',
      doors: { w: [{ at: 7, w: 4, h: 4.2 }], e: [{ at: 4, w: 1.2, h: 2.2 }, { at: 9, w: 3.6, h: 4 }], n: [{ at: 10, w: 1.2, h: 2.2 }] },
      windows: { s: [{ at: 5, w: 2.4, glass: true }, { at: 15, w: 2.4, glass: true }] } });
    // river edge: quay wall + railing
    B.box(0, -3, -56.2, 140, 3, .4, { mat: 'concrete', collide: false });
    rail(B, -64, -55.6, 63, -55.6, 0, { mat: 'steel' });

    mark('T2 lobby'); // ================================================================== T2 lobby: staff canteen
    B.room({ x: -2, z: -43, w: 24, d: 14, h: 3.2, wall: 'plaster', outer: 'concrete_panels', ceil: 'ceiling_tile', roof: 'concrete_dark', frames: false,
      doors: { n: [{ at: 12, w: 2.6, h: 2.7, frame: false }], e: [{ at: 7, w: 2.6, h: 2.7, frame: false }] },
      windows: { n: [{ at: 4, w: 2.4, glass: true }, { at: 19, w: 2.4, glass: true }], s: [{ at: 6, w: 2.4, glass: true }, { at: 12, w: 2.4, glass: true }, { at: 18, w: 2.4, glass: true }] } });
    B.lobby(2, { x0: -13.8, z0: -49.8, x1: 9.8, z1: -36.2, y: 0 }, [{ x: -2, z: -36.1, w: 2.6, h: 2.7, ry: 0 }, { x: 9.9, z: -43, w: 2.6, h: 2.7, ry: H }]);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) B.spawn(2, -9 + i * 3.2, 0, -46.5 + j * 3, j === 2 ? 0 : PI * .25);

    mark('objectives'); // ================================================================== objectives
    B.hostage(5, MZ, 26); B.hostage(4, 0, 47.9); B.hostage(-26, 0, -20); B.hostage(26.5, 0, -3); B.hostage(-26.5, 0, 40);
    B.rescue({ x0: -49, z0: 46.4, x1: -40, z1: 53.6, y: CR });
    B.rescue({ x0: -60, z0: -26, x1: -50, z1: -18 });
    B.point('dom1', -48, null, 5, 3.5); B.point('dom2', 15, null, 6, 3.5); B.point('dom3', 39, null, -17, 3.5);
    B.point('hp1', 15, null, 22, 4); B.point('hp2', -20, 0, 26, 4); B.point('hp3', -28, null, -6, 4); B.point('hp4', 40, null, 21, 4); B.point('hp5', 0, CR, 50, 4);
    B.point('hill', 15, null, 0, 4.5);
    B.point('flag1', -45, CR, 50, 1.5); B.point('flag2', -2, null, -32, 1.5);
    B.point('extract1', -56, null, -24, 3); B.point('extract2', 52, null, -22, 3); B.point('extract3', 50, CR, 50, 3);
    // hides
    B.hide(-36.6, 0, 32.6, { kind: 'dark' }); B.hide(11, 0, 19.5, { kind: 'crates' }); B.hide(3, 0, 8, { kind: 'dark' });
    B.hide(7.5, 0, 48.5, { kind: 'dark' }); B.hide(41.5, 0, 46.5, { kind: 'dark' }); B.hide(59, 0, 42.5, { kind: 'under' });
    B.hide(-34, 0, -24.5, { kind: 'crates' }); B.hide(53, 0, 27, { kind: 'crates' }); B.hide(44, 0, 5, { kind: 'dark' });
    B.hide(-48, 0, 31, { kind: 'bush' }); B.hide(-40, 0, -50, { kind: 'grass' }); B.hide(30, 0, -50, { kind: 'grass' });
    B.hide(26.5, 3.4, -2, { kind: 'roof' }); B.hide(-12, 0, -48.5, { kind: 'closet' });

    // ================================================================== spawns (field + FFA)
    for (const [x, y, z] of [[-40, CR, 50], [-22, CR, 50], [0, CR, 50], [-58.5, null, 14], [-50, 0, 26], [-48, 0, -4], [-15, 0, 47.5], [26, 0, 48.5], [-50, 0, 15], [-52, 0, -14]])
      B.spawn(1, x, y, z, face(x, z, 0, 0), { field: true });
    for (const [x, y, z] of [[30, 0, -20], [50, 0, -16], [59.5, 0, 2], [-20, 0, -30], [-28, 0, -20], [15, 0, -20], [42, 0, -1], [0, 0, -30], [59.5, 0, 20], [-8, 0, -8]])
      B.spawn(2, x, y, z, face(x, z, 0, 10), { field: true });
    for (const [x, y, z] of [[-52, 0, 30], [-45, 0, -20], [-20, 0, 25], [-30, 0, 12], [-5, 0, 28], [5, MZ, 28], [-15, 0, 48], [20, 0, 48.5], [14, 0, 20], [16, 0, -10],
      [30, 0, 20], [50, 0, 2], [40, 0, -20], [59, 0, 25], [-28, 0, -17], [-10, 0, -30], [-25, CR, 50], [35, CR, 50], [-50, 0, 8], [12, CR, 51]])
      B.spawn(0, x, y, z, face(x, z, 0, 5));

    mark('markers'); finish(B); mark('finish');
  },
};
