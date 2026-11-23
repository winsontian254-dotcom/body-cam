/* LIVE FIRE — "bank" = First Federal: a 1920s downtown bank branch on the corner of Federal Ave (south), Cedar Lane (west) and
   Fifth St (east), with its service alley behind (north) and the Civic Center parking garage across the avenue (south-west).
   Ground floor: marble banking hall with a teller line and a gallery above it, loan and private offices, a west stair hall with
   a side entrance from Cedar Lane, the safe-deposit antechamber and vault (site A), back corridor, cash room, security office,
   staff hall and loading dock; upper floor: records office, gallery, staff break room (team 2 lobby); low roof with HVAC over
   the back of house (fire escape down to the alley). The loading alley with the armoured van is site B. Team 1 stages on the
   garage's ramp level (P1). Original layout, fictional businesses.
   Plan (x east, z north): bank x -20..24, z -6..26 (floor FY .45, upper UY 4.65); avenue road z -24..-12; Cedar Lane road
   x -31..-24; Fifth St road x 27..34; alley z 26..38; garage x -84..-48, z -64..-30. Design notes: tools/test/out/notes-map-bank.md.
   Exports: default MapDef */
import { sign, flushSigns, door, win, pendant, column, vaultDoor, van, facade, skyline } from '../kit_bank.js';
import { PROPS } from '../props.js';

const PI = Math.PI, H = PI / 2;
const FY = 0.45, UY = 4.65, TOP = 7.75;      // ground floor, upper floor, upper ceiling
const HALL = 8.05;                           // banking hall ceiling
// Everything below is built in local coordinates (the plan above) inside a frame offset by (OX, OZ), so the whole map sits in ONE
// 1024 m geometry chunk (the world origin would split it into four): one merged mesh per material, far fewer draw calls.
const OX = 300, OZ = 300;
const NOCAST = new Set(['bk_marble_floor', 'bk_vinyl', 'bk_carpet', 'bk_carpet_red', 'bk_oak', 'concrete_floor', 'pavement', 'asphalt', 'bk_line', 'bk_line_y',
  'paint_yellow', 'bk_glow', 'p_lens_red', 'p_lens_clear', 'p_lens_amber', 'p_bag_blue', 'p_fab_green', 'p_plastic_beige', 'p_plastic_milky',
  'p_coat_black', 'p_glass_dark', 'bk_marble_green', 'bk_ashlar', 'bk_brass', 'p_stainless', 'bk_door_paint', 'bk_carpet_red', 'bk_kerb',
  'bk_marble_dk', 'p_coat_green', 'bk_awning_r', 'bk_awning_b', 'bk_stucco', 'p_glass_tint', 'glass']);

export default {
  id: 'bank', name: 'First Federal', size: 'M',
  desc: 'Downtown bank branch and the streets around it: marble banking hall, vault, back offices, loading alley, roof.',
  env: { hdri: 'partly_cloudy', sky: 'hdri', time: 'day', exposure: 1.0, sun: { color: [1, 0.97, 0.9], intensity: 1.0 },
    fog: { color: [0.7, 0.75, 0.82], density: 0.0026 }, weather: 'clear', wind: [2, 1], ambience: 'city', reverb: 'outdoor', indoorIbl: 0.45 },
  bounds: { minX: -86 + OX, maxX: 46 + OX, minZ: -66 + OZ, maxZ: 42 + OZ, minY: -2, maxY: 30 },
  chunk: 1024,

  build(B) {
    // shadow casters by material: floors, lenses, glows, markings and small trim never cast (fewer meshes in the shadow pass,
    // and all of a material's geometry lands in one merged mesh). The builder has no public per-material cast policy yet, so
    // this wraps its accumulator lookup on this builder instance only (falls back to the plain build if the internals change).
    const acc = B._acc, accMat = B._accMat;
    if (typeof acc === 'function') B._acc = function (name, x, z, cast, receive) { return acc.call(this, name, x, z, cast !== false && !NOCAST.has(name), receive); };
    if (typeof accMat === 'function') B._accMat = function (mat, x, z, cast, receive) {
      return accMat.call(this, mat, x, z, cast !== false && !NOCAST.has(String(mat && mat.name).replace(/^m_/, '')), receive);
    };
    B.push(OX, 0, OZ);
    try { buildLocal(B); } finally { B.pop(); if (acc) B._acc = acc; if (accMat) B._accMat = accMat; }
  },
};

function buildLocal(B) {
    let seedK = 0;
    // props: no shadows and no instancing by default (merged into the chunks: fewer draw calls); organic ones share 3 seeds
    const P = (type, x, y, z, o = {}) => {
      const d = PROPS[type], q = Object.assign({ cast: false, inst: false }, o);
      if (d && d.vary && q.seed == null) q.seed = 1 + (seedK++ % 3);
      return B.prop(type, x, y, z, q);
    };
    const box = (x, y, z, w, h, d, o) => B.box(x, y, z, w, h, d, o);
    const bc = (x0, y0, z0, x1, y1, z1, o) => B.boxc(x0, y0, z0, x1, y1, z1, o);
    const NC = { collide: false };
    const nc = (mat, o = {}) => Object.assign({ mat, collide: false }, o);
    const W = (x0, z0, x1, z1, o) => B.wall(x0, z0, x1, z1, Object.assign({ t: 0.3 }, o));
    const skirt = (x0, z0, x1, z1, y = FY, mat = 'bk_walnut', hh = 0.12) => {      // skirting strip along a wall face (thin box)
      const L = Math.hypot(x1 - x0, z1 - z0), th = Math.atan2(-(z1 - z0), x1 - x0);
      box((x0 + x1) / 2, y, (z0 + z1) / 2, L, hh, 0.02, { mat, ry: th, collide: false, cast: false });
    };
    const light = (x, y, z, o = {}) => B.light(Object.assign({ x, y, z }, o));

    // ================================================================== ground, streets, sidewalks
    box(-20, -0.4, -10, 200, 0.4, 140, { mat: 'asphalt', mats: { t: 'asphalt' }, cast: false });      // base (top y 0): x -120..80, z -80..60
    // avenue markings: double yellow centre, dashed lane lines, parking bays, stop lines and zebra crossings
    const line = (x0, z0, x1, z1, mat = 'bk_line') => bc(x0, 0, z0, x1, 0.012, z1, { mat, collide: false, cast: false });
    line(-86, -18.12, 46, -18.02, 'bk_line_y'); line(-86, -17.98, 46, -17.88, 'bk_line_y');
    for (let x = -84; x < 44; x += 6) { if (Math.abs(x + 27.5) < 6 || Math.abs(x - 30.5) < 6) continue; line(x, -21.06, x + 3, -20.94); line(x, -15.06, x + 3, -14.94); }
    for (const zc of [-22.3, -13.7]) for (let x = -84; x < 44; x += 6.5) { if (Math.abs(x + 27.5) < 7 || Math.abs(x - 30.5) < 7 || (zc < -18 && x > -78 && x < -58)) continue; line(x, zc - 1.2, x + 0.1, zc + 1.2); }
    for (const xc of [-27.5, 30.5]) {
      for (let i = 0; i < 9; i++) { const z = -23.2 + i * 1.3; bc(xc - 2.6, 0, z, xc + 2.6, 0.012, z + 0.6, { mat: 'bk_line', collide: false, cast: false }); }
      for (const zz of [-25.5, -10.5]) { const cz = zz; bc(xc - 3.6, 0, cz, xc + 3.6, 0.012, cz + 0.3, { mat: 'bk_line', collide: false, cast: false }); }
    }
    for (let z = -6; z < 40; z += 6) { line(-27.56, z, -27.44, z + 3); line(30.44, z, 30.56, z + 3); }
    // sidewalks: slabs with kerbs (top .15)
    const walk = (x0, z0, x1, z1, k = '') => {
      bc(x0, 0, z0, x1, 0.15, z1, { mat: 'pavement', cast: false });
      if (k.includes('n')) bc(x0, 0, z1 - 0.25, x1, 0.16, z1, { mat: 'bk_kerb', collide: false, cast: false });
      if (k.includes('s')) bc(x0, 0, z0, x1, 0.16, z0 + 0.25, { mat: 'bk_kerb', collide: false, cast: false });
      if (k.includes('e')) bc(x1 - 0.25, 0, z0, x1, 0.16, z1, { mat: 'bk_kerb', collide: false, cast: false });
      if (k.includes('w')) bc(x0, 0, z0, x0 + 0.25, 0.16, z1, { mat: 'bk_kerb', collide: false, cast: false });
    };
    walk(-86, -12, -31, -6, 's');  walk(-24, -12, 27, -6, 's');  walk(34, -12, 46, -6, 's');          // north side of the avenue
    walk(-86, -30, -76, -24, 'n'); walk(-60, -30, 46, -24, 'n');                                      // south side (garage driveway x -76..-60)
    bc(-76, 0, -30, -60, 0.05, -24, { mat: 'concrete_floor', cast: false });                          // driveway apron
    walk(-34, -6, -31, 41, 'e');   walk(-24, -6, -20, 26, 'w');                                       // Cedar Lane sidewalks
    walk(24, -6, 27, 26, 'e');     walk(34, -6, 37, 41, 'w');                                         // Fifth St sidewalks
    // the alley: concrete with a centre drain channel
    bc(-24, 0, 26, 27, 0.03, 38, { mat: 'concrete_floor', cast: false });
    bc(-24, 0.03, 31.85, 27, 0.04, 32.15, { mat: 'bk_steel_dk', collide: false, cast: false });
    for (let x = -20; x < 26; x += 9) P('manhole', x, 0.04, 32, { variant: 'random' });

    // ================================================================== the bank: floors
    const fl = (x0, z0, x1, z1, mat, y = FY) => bc(x0, 0, z0, x1, y, z1, { mat: 'bk_granite', mats: { t: mat }, cast: false });
    fl(-11.85, -5.65, 11.85, 7.4, 'bk_marble_floor');                                     // banking hall
    fl(-11.85, 7.4, 11.85, 12.35, 'bk_oak');                                              // teller strip
    fl(-19.65, -5.65, -12.15, 1, 'bk_carpet');                                            // loan office
    fl(-19.65, 1, -12.15, 12.35, 'bk_marble_floor');                                      // stair hall
    fl(-19.65, 12.35, 2.15, 19.5, 'bk_marble_floor');                                     // antechamber (A)
    fl(-19.65, 19.5, 2.15, 25.65, 'bk_vinyl');                                            // vault + records closet
    fl(2.15, 12.35, 23.65, 25.65, 'bk_vinyl');                                            // back of house
    fl(12.15, -5.65, 23.65, 3, 'bk_carpet_red');                                          // private office
    fl(12.15, 3, 23.65, 12.35, 'bk_vinyl');                                               // staff hall
    // hall floor inlays: dark marble border and a medallion
    for (const [x0, z0, x1, z1] of [[-11.2, -5.0, 11.2, -4.6], [-11.2, 5.6, 11.2, 6.0], [-11.2, -4.6, -10.8, 5.6], [10.8, -4.6, 11.2, 5.6]])
      bc(x0, FY, z0, x1, FY + 0.004, z1, { mat: 'bk_marble_dk', collide: false, cast: false });
    B.cyl(0, FY, 0.5, 2.0, 0.004, { mat: 'bk_marble_dk', sides: 32, collide: false });
    B.cyl(0, FY + 0.002, 0.5, 1.6, 0.004, { mat: 'bk_marble_green', sides: 32, collide: false });
    B.cyl(0, FY + 0.004, 0.5, 0.5, 0.004, { mat: 'bk_brass', sides: 16, collide: false });

    // ================================================================== exterior walls (stone front, brick back), two lifts each
    const EXT = 'bk_limestone', EXT2 = 'bk_brick_tan', IN = 'bk_wall';
    // south facade (z -6): lower 0..UY, upper UY..9.6; walking +x the left side is the inside
    W(-20, -5.825, 24, -5.825, { t: 0.35, h: UY, mat: IN, mat2: 'bk_ashlar', matEnd: EXT, openings: [
      { at: 4, w: 1.6, h: 2.0, y: FY + 0.9 },                                   // loan office
      { at: 13, w: 2.4, h: 3.6, y: FY + 1.0 }, { at: 27, w: 2.4, h: 3.6, y: FY + 1.0 },   // hall windows (lower part)
      { at: 20, w: 2.6, h: 3.1, y: FY },                                        // main doors
      { at: 38, w: 1.6, h: 2.0, y: FY + 0.9 }] });                              // private office
    W(-20, -5.825, 24, -5.825, { t: 0.35, y: UY, h: 9.6 - UY, mat: IN, mat2: EXT, openings: [
      { at: 4, w: 1.6, h: 1.8, y: 0.9 }, { at: 13, w: 2.4, h: 2.6, y: 0 }, { at: 27, w: 2.4, h: 2.6, y: 0 },
      { at: 20, w: 3.2, h: 2.2, y: 0.4 }, { at: 41.5, w: 1.4, h: 1.6, y: 1.0 }] });
    // north wall (z 26): back of house and the roof parapet; walking +x the left side is outside
    W(-20, 25.825, 24, 25.825, { t: 0.35, h: UY, mat: EXT2, mat2: 'bk_bh', matEnd: EXT2, openings: [
      { at: 24, w: 1.1, h: 2.2, y: FY }, { at: 35, w: 4.0, h: 3.3, y: FY }] });
    W(-20, 25.825, 24, 25.825, { t: 0.35, y: UY, h: 1.05, mat: EXT2, mat2: EXT2, openings: [{ at: 9.75, w: 1.5, h: 2, y: 0 }] });
    // west wall (x -20)
    W(-19.825, -5.65, -19.825, 25.65, { t: 0.35, h: UY, mat: 'bk_ashlar', mat2: IN, matEnd: EXT, openings: [
      { at: 3.15, w: 1.6, h: 2.0, y: FY + 0.9 }, { at: 8.65, w: 2.2, h: 2.7, y: FY },
      { at: 21.65, w: 1.6, h: 1.1, y: FY + 1.6 }] });
    W(-19.825, -5.65, -19.825, 12.65, { t: 0.35, y: UY, h: 9.0 - UY, mat: EXT, mat2: IN, openings: [{ at: 3.15, w: 1.6, h: 1.8, y: 0.9 }, { at: 12.65, w: 1.6, h: 1.8, y: 0.9 }] });
    W(-19.825, 12.65, -19.825, 25.65, { t: 0.35, y: UY, h: 1.05, mat: EXT, mat2: EXT });
    // east wall (x 24): walking +z the left side is inside
    W(23.825, -5.65, 23.825, 25.65, { t: 0.35, h: UY, mat: IN, mat2: 'bk_ashlar', matEnd: EXT, openings: [
      { at: 4.15, w: 1.6, h: 2.0, y: FY + 0.9 }, { at: 12.65, w: 1.1, h: 2.2, y: FY }, { at: 21.65, w: 1.6, h: 1.0, y: FY + 1.7 }] });
    W(23.825, -5.65, 23.825, 12.65, { t: 0.35, y: UY, h: 9.0 - UY, mat: IN, mat2: EXT, openings: [{ at: 2.65, w: 1.4, h: 1.6, y: 1.0 }, { at: 14.65, w: 1.4, h: 1.6, y: 1.0 }] });
    W(23.825, 12.65, 23.825, 25.65, { t: 0.35, y: UY, h: 1.05, mat: EXT, mat2: EXT });
    // copings on the parapets
    bc(-20.1, UY + 1.05, 12.6, -19.55, UY + 1.15, 26.1, nc('bk_limestone_dk')); bc(23.55, UY + 1.05, 12.6, 24.1, UY + 1.15, 26.1, nc('bk_limestone_dk'));
    bc(-20.1, UY + 1.05, 25.55, -11.0, UY + 1.15, 26.1, nc('bk_limestone_dk')); bc(-9.5, UY + 1.05, 25.55, 24.1, UY + 1.15, 26.1, nc('bk_limestone_dk'));
    // granite plinth around the base, string course at the upper floor
    for (const [x0, z0, x1, z1] of [[-20.08, -6.08, 24.08, -5.95], [-20.08, -6.08, -19.95, 26.08], [23.95, -6.08, 24.08, 26.08], [-20.08, 25.95, 24.08, 26.08]]) {
      bc(x0, 0, z0, x1, 0.75, z1, nc('bk_granite', { cast: false }));
      bc(x0 - 0.04, UY - 0.1, z0 - 0.04, x1 + 0.04, UY + 0.12, z1 + 0.04, nc('bk_limestone_dk', { cast: false }));
    }

    // ================================================================== the portico on Federal Ave
    bc(-8.5, 0, -9.0, 8.5, FY, -6.0, { mat: 'bk_granite', mats: { t: 'bk_limestone' } });
    bc(-8.2, 0, -9.35, 8.2, FY - 0.15, -9.0, { mat: 'bk_granite' });                                // second step
    for (const x of [-6.6, -2.4, 2.4, 6.6]) column(B, x, FY, -7.6, 7.15, 0.42);
    bc(-8.6, FY + 7.15, -8.8, 8.6, FY + 8.5, -5.95, { mat: 'bk_limestone', mats: { b: 'bk_limestone_dk' } });   // entablature
    bc(-8.8, FY + 8.5, -9.0, 8.8, FY + 8.75, -5.95, nc('bk_limestone_dk'));
    bc(-8.4, FY + 7.15, -8.85, 8.4, FY + 7.4, -8.8, nc('bk_limestone_dk'));
    sign(B, 'name', 0, FY + 7.95, -8.82, 13.5, 1.45, PI);
    sign(B, 'logo', -16, 7.0, -6.0 - 0.02, 1.6, 1.6, PI); sign(B, 'logo', 18, 7.0, -6.0 - 0.02, 1.6, 1.6, PI);
    // doors: double bronze-and-glass doors (open), lantern brackets, the date plaque
    door(B, 0, FY, -5.825, 0, { v: 'glass', w: 2.5, h: 3.0, double: true, open: 80, t: 0.35 });
    bc(-1.35, FY + 3.1, -5.98, 1.35, FY + 3.12, -5.66, nc('bk_brass'));
    sign(B, 'est', 0, FY + 3.55, -6.0 - 0.02, 4.0, 0.47, PI);
    for (const x of [-3.9, 3.9]) { box(x, FY + 2.9, -6.2, 0.12, 0.12, 0.4, nc('bk_brass')); B.cyl(x, FY + 2.55, -6.45, 0.13, 0.4, { mat: 'bk_glow', sides: 10, collide: false }); B.cyl(x, FY + 2.95, -6.45, 0.16, 0.06, { mat: 'bk_brass', sides: 10, collide: false }); }
    // facade windows (frames, mullions, sills)
    for (const x of [-7, 7]) {
      win(B, x, FY + 1.0, -5.83, 0, 2.4, UY - FY - 1.0, { cols: 3, rows: 3 });
      win(B, x, UY, -5.83, 0, 2.4, 2.6, { cols: 3, rows: 2, sill: 'bk_frame' });
    }
    win(B, 0, UY + 0.4, -5.83, 0, 3.2, 2.2, { cols: 4, rows: 2 });
    win(B, -16, FY + 0.9, -5.83, 0, 1.6, 2.0); win(B, 18, FY + 0.9, -5.83, 0, 1.6, 2.0);
    win(B, -16, UY + 0.9, -5.83, 0, 1.6, 1.8); win(B, 21.5, UY + 1.0, -5.83, 0, 1.4, 1.6, { glass: 'glass_frosted' });
    win(B, -19.83, FY + 0.9, -2.5, H, 1.6, 2.0); win(B, -19.83, UY + 0.9, -2.5, H, 1.6, 1.8); win(B, -19.83, UY + 0.9, 7, H, 1.6, 1.8);
    win(B, -19.83, FY + 1.6, 16, H, 1.6, 1.1, { cols: 2, rows: 1 });
    for (let i = 0; i < 6; i++) box(-19.6, FY + 1.6, 15.3 + i * 0.28, 0.03, 1.1, 0.03, nc('bk_frame'));                 // bars inside the A window
    win(B, 23.83, FY + 0.9, -1.5, -H, 1.6, 2.0); win(B, 23.83, UY + 1.0, -3, -H, 1.4, 1.6, { glass: 'glass_frosted' }); win(B, 23.83, UY + 1.0, 9, -H, 1.4, 1.6);
    win(B, 23.83, FY + 1.7, 16, -H, 1.6, 1.0, { cols: 2, rows: 1 });
    for (let i = 0; i < 6; i++) box(23.6, FY + 1.7, 15.3 + i * 0.28, 0.03, 1.0, 0.03, nc('bk_frame'));
    // cornice on the front block
    bc(-20.3, 8.9, -6.35, 24.3, 9.3, -5.6, nc('bk_limestone_dk'));
    bc(-20.3, 8.9, -6.35, -19.6, 9.3, 12.8, nc('bk_limestone_dk')); bc(23.6, 8.9, -6.35, 24.3, 9.3, 12.8, nc('bk_limestone_dk'));
    bc(-20.1, 9.3, -6.1, 24.1, 9.6, -5.65, nc('bk_limestone'));

    // ================================================================== interior walls, ground floor (FY .. into the upper slab)
    const GH = UY - FY - 0.1;                     // ground-floor wall height (top 10 cm into the slab)
    // x = -12 (hall | west wing): tall part to the hall ceiling, split at the upper floor
    W(-12, -5.65, -12, 8.0, { y: FY, h: UY - FY, mat: IN, mat2: 'bk_wall', openings: [{ at: 3.15, w: 1.0, h: 2.2, frame: 'bk_walnut' }, { at: 10.65, w: 1.4, h: 2.4, frame: 'bk_walnut' }] });
    W(-12, -5.65, -12, 8.0, { y: UY, h: HALL - UY + 0.05, mat: IN, mat2: 'bk_wall', openings: [{ at: 3.65, w: 2.4, h: 1.4, y: 0.95, frame: 'bk_walnut' }, { at: 10.85, w: 4.0, h: 2.2, y: 1.0, frame: 'bk_walnut' }] });
    W(-12, 8.0, -12, 12.35, { y: FY, h: GH, mat: IN, mat2: IN });
    // x = 12 (hall | east wing)
    W(12, -5.65, 12, 8.0, { y: FY, h: UY - FY, mat: IN, mat2: IN, openings: [{ at: 4.65, w: 1.0, h: 2.2, frame: 'bk_walnut' }] });
    W(12, -5.65, 12, 8.0, { y: UY, h: HALL - UY + 0.05, mat: IN, mat2: IN, openings: [{ at: 12.15, w: 1.6, h: 1.5, y: 1.0, frame: 'bk_walnut' }] });
    W(12, 8.0, 12, 12.35, { y: FY, h: GH, mat: IN, mat2: 'bk_bh', openings: [{ at: 2.0, w: 1.0, h: 2.2, frame: 'bk_frame' }] });
    // z = 12.5 (teller strip / stair hall / staff hall | A, back corridor, cash room, staff corridor, security)
    W(-19.65, 12.5, 23.65, 12.5, { y: FY, h: GH, mat: 'bk_bh', mat2: IN, openings: [
      { at: 4.65, w: 1.2, h: 2.3, frame: 'bk_walnut' }, { at: 14.65, w: 1.4, h: 2.4, frame: 'bk_walnut' }, { at: 23.65, w: 1.0, h: 2.2, frame: 'bk_frame' },
      { at: 32.95, w: 2.3, h: 2.5, frame: false }] });
    // west wing: loan office | stair hall
    W(-19.65, 1, -12.15, 1, { y: FY, h: GH, mat: IN, mat2: IN, openings: [{ at: 5.65, w: 1.0, h: 2.2, frame: 'bk_walnut' }] });
    // east wing: private office | staff hall
    W(12.15, 3, 23.65, 3, { y: FY, h: GH, mat: 'bk_bh', mat2: IN, openings: [{ at: 7.85, w: 1.0, h: 2.2, frame: 'bk_walnut' }] });
    // back corridor west wall (A side) and the vault walls (0.8 m)
    W(2, 12.65, 2, 19.5, { y: FY, h: GH, mat: 'bk_bh', mat2: 'bk_wall', openings: [{ at: 3.35, w: 1.1, h: 2.2, frame: 'bk_frame' }] });
    W(1.675, 19.5, 1.675, 25.65, { y: FY, h: GH, t: 0.95, mat: 'bk_bh', mat2: 'bk_steel_dk', matEnd: 'bk_steel_dk', openings: [{ at: 3.5, w: 1.3, h: 2.3, frame: 'bk_steel' }] });
    W(-17.8, 19.9, 1.2, 19.9, { y: FY, h: GH, t: 0.8, mat: 'bk_steel_dk', mat2: 'bk_wall', matEnd: 'bk_steel_dk', openings: [{ at: 9.8, w: 2.5, h: 2.6, frame: false }] });
    W(-17.4, 20.3, -17.4, 25.65, { y: FY, h: GH, t: 0.8, mat: 'bk_steel_dk', mat2: 'bk_bh', matEnd: 'bk_steel_dk' });
    W(-19.65, 19.65, -17.8, 19.65, { y: FY, h: GH, mat: 'bk_bh', mat2: IN, openings: [{ at: 0.95, w: 1.05, h: 2.1, frame: 'bk_frame' }] });
    // cash room, staff corridor, security
    W(6, 12.65, 6, 20.15, { y: FY, h: GH, mat: 'bk_bh', mat2: 'bk_bh', openings: [{ at: 4.35, w: 1.0, h: 2.2, frame: 'bk_frame' }] });
    W(6.15, 20, 11.85, 20, { y: FY, h: GH, mat: 'bk_bh', mat2: 'bk_bh' });
    W(12, 12.65, 12, 20.15, { y: FY, h: GH, mat: 'bk_bh', mat2: 'bk_bh', openings: [{ at: 2.35, w: 1.0, h: 2.2, frame: 'bk_frame' }] });
    W(14.6, 12.65, 14.6, 20.15, { y: FY, h: GH, mat: 'bk_bh', mat2: 'bk_bh', openings: [{ at: 3.35, w: 1.0, h: 2.2, frame: 'bk_frame' }] });
    W(14.75, 20, 23.65, 20, { y: FY, h: GH, mat: 'bk_bh', mat2: 'bk_bh', openings: [{ at: 6.25, w: 1.0, h: 2.2, frame: 'bk_frame' }] });
    // doors (leaves) in the ground floor openings
    door(B, -12, FY, -2.5, H, { v: 'wood', w: 0.95, open: 95, t: 0.3 });
    door(B, -14, FY, 1, PI, { v: 'wood', w: 0.95, open: 80, t: 0.3 });
    door(B, 12, FY, -1, -H, { v: 'wood', w: 0.95, open: 100, t: 0.3 });
    door(B, 20, FY, 3, 0, { v: 'wood', w: 0.95, open: 90, t: 0.3 });
    door(B, -5, FY, 12.5, 0, { v: 'wood', w: 1.15, open: 100, t: 0.3 });
    door(B, 4, FY, 12.5, PI, { v: 'metal', w: 0.95, open: 85, t: 0.3 });
    door(B, 12, FY, 10, H, { v: 'metal', w: 0.95, open: 90, t: 0.3 });
    door(B, 2, FY, 16, -H, { v: 'metal', w: 1.05, open: 90, t: 0.3 });
    door(B, 6, FY, 17, H, { v: 'metal', w: 0.95, open: 80, t: 0.3 });
    door(B, 12, FY, 15, -H, { v: 'metal', w: 0.95, open: 95, t: 0.3 });
    door(B, 14.6, FY, 16, -H, { v: 'metal', w: 0.95, open: 90, t: 0.3 });
    door(B, 21, FY, 20, PI, { v: 'metal', w: 0.95, open: 85, t: 0.3 });
    door(B, -18.7, FY, 19.65, PI, { v: 'metal', w: 0.95, open: 95, t: 0.3 });
    door(B, 4, FY, 25.825, PI, { v: 'metal', w: 1.05, open: 75, t: 0.35 });
    door(B, 23.825, FY, 7, -H, { v: 'metal', w: 1.05, open: 70, t: 0.35 });
    door(B, -19.825, FY, 3, -H, { v: 'glass', w: 2.15, h: 2.65, double: true, open: 85, t: 0.35 });
    // vault: round door swung open, steel grille at the back
    vaultDoor(B, -8, FY, 19.5, PI, 105);
    for (let i = 0; i < 9; i++) box(1.675, FY, 22.4 + i * 0.15, 0.04, 2.3, 0.03, nc('bk_steel'));        // grille gate (slid open: stacked bars)
    box(1.675, FY + 2.25, 23, 0.06, 0.06, 1.3, nc('bk_steel'));

    // ================================================================== upper floor: slabs, walls
    const slab = (x0, z0, x1, z1, top, mat, ceil = 'bk_wall') => bc(x0, top - 0.3, z0, x1, top, z1, { mat: 'bk_limestone_dk', mats: { t: mat, b: ceil }, cast: false });
    slab(-19.65, -5.65, -12.15, 4.5, UY, 'bk_carpet'); slab(-18.2, 4.5, -12.15, 11, UY, 'bk_marble_floor'); slab(-19.65, 11, -12.15, 12.35, UY, 'bk_marble_floor');
    slab(-12.15, 8.0, 12.15, 12.35, UY, 'bk_carpet');                                                   // gallery
    slab(12.15, -5.65, 23.65, 10.9, UY, 'bk_vinyl'); slab(12.15, 10.9, 15, 12.35, UY, 'bk_vinyl'); slab(21.5, 10.9, 23.65, 12.35, UY, 'bk_vinyl');
    // the low roof over the back of house (skylight hole over A)
    const rf = (x0, z0, x1, z1) => bc(x0, UY - 0.3, z0, x1, UY, z1, { mat: 'bk_limestone_dk', mats: { t: 'bk_roof', b: 'bk_wall' }, cast: false });
    rf(-19.65, 12.65, 23.65, 14.5); rf(-19.65, 17.5, 23.65, 25.65); rf(-19.65, 14.5, -11, 17.5); rf(-5, 14.5, 23.65, 17.5);
    // upper ceilings / roofs
    bc(-19.65, TOP, -5.65, -12.15, TOP + 0.3, 12.35, { mat: 'bk_roof', mats: { b: 'bk_wall' }, cast: false });
    bc(12.15, TOP, -5.65, 23.65, TOP + 0.3, 12.35, { mat: 'bk_roof', mats: { b: 'bk_wall' }, cast: false });
    bc(-12.15, HALL, -5.65, 12.15, HALL + 0.4, 12.35, { mat: 'bk_roof', mats: { b: 'plaster_white' }, cast: false });
    // upper walls
    const UH = TOP - UY + 0.1;
    W(-19.65, 2, -12.15, 2, { y: UY, h: UH, mat: IN, mat2: IN, openings: [{ at: 5.65, w: 1.0, h: 2.2, frame: 'bk_walnut' }] });
    W(12.15, 5, 23.65, 5, { y: UY, h: UH, mat: IN, mat2: IN, openings: [{ at: 2.85, w: 2.4, h: 2.6, frame: false }, { at: 8.85, w: 2.4, h: 2.6, frame: false }] });
    W(-19.65, 12.5, 23.65, 12.5, { y: UY, h: 8.6 - UY, mat: EXT, mat2: IN, openings: [{ at: 4.15, w: 1.0, h: 2.2, frame: 'bk_frame' }, { at: 13.65, w: 1.2, h: 2.2, frame: 'bk_frame' }] });
    door(B, -15.5, UY, 12.5, 0, { v: 'metal', w: 0.95, open: 95, t: 0.3 });
    door(B, -6, UY, 12.5, 0, { v: 'metal', w: 1.15, open: 100, t: 0.3 });
    door(B, -14, UY, 2, 0, { v: 'wood', w: 0.95, open: 90, t: 0.3 });
    // gallery balustrade (marble, brass rail), landing / stair guards, S3 guard
    bc(-11.85, UY, 7.85, 11.85, UY + 0.95, 8.15, { mat: 'bk_marble', mats: { t: 'bk_marble_dk' } });
    bc(-11.85, UY + 0.95, 7.92, 11.85, UY + 1.0, 8.08, nc('bk_brass'));
    bc(-11.85, UY - 0.32, 7.6, 11.85, UY + 0.02, 8.15, nc('bk_limestone', { cast: false }));                 // fascia
    for (let x = -10.5; x <= 10.5; x += 3) bc(x - 0.18, UY - 0.55, 7.65, x + 0.18, UY - 0.32, 8.0, nc('bk_limestone_dk'));   // corbels
    bc(-18.25, UY, 4.5, -18.15, UY + 1.0, 10.0, { mat: 'bk_brass' }); bc(-19.65, UY, 4.4, -18.15, UY + 1.0, 4.5, { mat: 'bk_brass' });
    bc(15, UY, 10.85, 20.0, UY + 1.0, 10.95, { mat: 'bk_frame' });
    // stairs: S1 west (climbs north), S3 east (climbs east)
    B.stairs({ x: -18.95, z: 7.75, w: 1.4, len: 6.5, y0: FY, y1: UY, dir: '+z', mat: 'bk_marble', tread: 'bk_marble_floor', rail: 'right', railMat: 'bk_brass' });
    B.stairs({ x: 18.25, z: 11.65, w: 1.4, len: 6.5, y0: FY, y1: UY, dir: '+x', mat: 'bk_bh', tread: 'bk_vinyl', rail: 'right', railMat: 'bk_frame' });

    // ================================================================== hall ceiling: coffers, laylight, cornice
    for (let x = -12; x <= 12.01; x += 4) bc(x - 0.2, HALL - 0.45, -5.65, x + 0.2, HALL, 12.35, nc('plaster_white', { cast: false }));
    for (let z = -5.65; z <= 8.1; z += 3.45) bc(-11.85, HALL - 0.45, z - 0.2, 11.85, HALL, z + 0.2, nc('plaster_white', { cast: false }));
    bc(-4, HALL - 0.02, -2.2, 4, HALL - 0.01, 4.7, nc('bk_glow_cool', { cast: false }));
    for (const [x0, z0, x1, z1] of [[-11.85, -5.65, 11.85, -5.3], [-11.85, 7.9, 11.85, 8.15], [-11.85, -5.65, -11.5, 8.15], [11.5, -5.65, 11.85, 8.15]])
      bc(x0, HALL - 0.6, z0, x1, HALL, z1, nc('bk_limestone', { cast: false }));
    // hall walls: marble dado, pilasters, rate boards
    for (const [x0, z0, x1, z1] of [[-11.85, -5.65, -11.8, 7.4], [11.8, -5.65, 11.85, 7.4]]) bc(x0, FY, z0, x1, FY + 1.2, z1, nc('bk_marble_green', { cast: false }));
    bc(-11.85, FY, -5.65, -3, FY + 1.2, -5.6, nc('bk_marble_green', { cast: false })); bc(3, FY, -5.65, 11.85, FY + 1.2, -5.6, nc('bk_marble_green', { cast: false }));
    for (const z of [-3, 3]) for (const x of [-11.75, 11.75]) bc(x - 0.15, FY, z - 0.35, x + 0.15, HALL - 0.6, z + 0.35, { mat: 'bk_marble', cast: false });
    sign(B, 'rates', -11.82, FY + 2.0, 0, 1.2, 1.6, H); sign(B, 'ad1', -11.82, FY + 2.0, 5.2, 1.0, 1.33, H);
    sign(B, 'ad2', 11.82, FY + 2.0, 0, 1.0, 1.33, -H); sign(B, 'private', 11.82, FY + 2.5, -1, 1.6, 0.4, -H); sign(B, 'loans', -11.82, FY + 2.5, -2.5, 1.6, 0.4, H);
    sign(B, 'clock', 0, FY + 5.6, 8.17, 1.2, 1.2, PI);

    // ================================================================== banking hall: columns, teller line, furniture
    for (const x of [-6, 6]) for (const z of [-1.5, 3.5]) column(B, x, FY, z, HALL - FY - 0.45, 0.45, 'bk_marble');
    // teller counter (walnut, marble top, brass-framed glass screens with open windows) z 6.6..7.4, gap (gate) x 9..11
    const cnt = (x0, x1) => {
      bc(x0, FY, 6.6, x1, FY + 1.0, 7.4, { mat: 'bk_walnut' });
      bc(x0 - 0.04, FY + 1.0, 6.5, x1 + 0.04, FY + 1.06, 7.45, nc('bk_marble_dk'));
      bc(x0, FY, 6.55, x1, FY + 0.12, 6.6, nc('bk_marble_dk', { cast: false }));
      for (let x = x0 + 0.6; x < x1 - 0.3; x += 1.2) bc(x - 0.45, FY + 0.25, 6.58, x + 0.45, FY + 0.85, 6.6, nc('bk_oak', { cast: false }));
    };
    cnt(-11.85, 9); cnt(11, 11.85);
    for (let i = 0; i < 6; i++) {
      const x = -9.5 + i * 3.4;
      bc(x - 1.0, FY + 1.06, 6.95, x + 1.0, FY + 2.2, 6.98, { mat: 'glass', surf: 'glass', cast: false });     // screen, open below 1.06 m? no: the window slot
      bc(x - 0.35, FY + 1.06, 6.9, x + 0.35, FY + 1.12, 7.05, nc('bk_brass'));
      for (const s of [-1.05, 1.05]) bc(x + s - 0.04, FY + 1.06, 6.92, x + s + 0.04, FY + 2.25, 7.0, nc('bk_brass'));
      sign(B, 'tel' + (i + 1), x, FY + 2.42, 6.93, 0.32, 0.32, PI);
      if (i === 2 || i === 5) sign(B, 'closed', x, FY + 1.25, 6.93, 0.5, 0.19, PI);
      bc(x - 1.0, FY + 2.2, 6.92, x + 1.0, FY + 2.26, 7.0, nc('bk_brass'));
      P('monitor', x + 0.3, FY + 0.75, 7.95, { ry: PI, collide: false });
      P('office_chair', x, FY, 8.5, { ry: PI, variant: 'charcoal' });
      bc(x - 0.8, FY, 7.4, x + 0.8, FY + 0.75, 8.0, { mat: 'bk_walnut', mats: { t: 'bk_marble_dk' } });            // teller desk behind
      box(x - 0.45, FY + 0.6, 7.6, 0.45, 0.1, 0.35, nc('bk_steel_dk'));                                          // cash drawer
    }
    // gaps between screens let players vault the counter (1.06 m)
    bc(9.05, FY, 7.0, 9.1, FY + 0.95, 7.95, nc('bk_walnut')); box(9.5, FY + 0.05, 7.0, 0.9, 0.85, 0.05, { mat: 'bk_walnut', ry: 0.9, collide: false });  // swing gate (open)
    // queue: stanchions with ropes, "please wait" sign
    for (let i = 0; i < 6; i++) { const x = -2.5 + i, z = 3.6; B.cyl(x, FY, z, 0.16, 0.03, { mat: 'bk_brass', sides: 10, collide: false }); B.cyl(x, FY, z, 0.025, 0.95, { mat: 'bk_brass', sides: 6, collide: false }); if (i) box(x - 0.5, FY + 0.82, z, 0.95, 0.03, 0.03, nc('bk_carpet_red')); }
    box(-3.1, FY, 3.6, 0.04, 1.4, 0.04, nc('bk_brass')); sign(B, 'wait', -3.1, FY + 1.55, 3.6, 0.9, 0.22, PI);
    // check-writing islands (cover)
    for (const x of [-3.2, 3.2]) {
      bc(x - 1.1, FY, -0.3, x + 1.1, FY + 0.15, 0.5, nc('bk_granite')); bc(x - 0.9, FY + 0.15, -0.2, x + 0.9, FY + 1.05, 0.4, { mat: 'bk_walnut' });
      bc(x - 1.15, FY + 1.05, -0.4, x + 1.15, FY + 1.12, 0.6, nc('bk_marble_dk')); box(x, FY + 1.12, 0.1, 0.5, 0.02, 0.3, nc('p_paint_cream', { cast: false }));
    }
    // benches along the walls, concierge desk, plants, waiting chairs, rugs
    for (const z of [-4.2, 1.5]) { bc(-11.6, FY, z - 1.0, -11.0, FY + 0.45, z + 1.0, { mat: 'bk_walnut' }); bc(-11.75, FY + 0.45, z - 1.0, -11.6, FY + 1.0, z + 1.0, nc('bk_walnut')); }
    bc(6.8, FY, -4.4, 9.6, FY + 1.05, -3.6, { mat: 'bk_walnut', mats: { t: 'bk_marble_dk' } }); bc(9.6, FY, -4.4, 10.4, FY + 1.05, -2.4, { mat: 'bk_walnut', mats: { t: 'bk_marble_dk' } });
    P('office_chair', 8.4, FY, -3.0, { ry: PI, variant: 'leather' }); P('monitor', 8.6, FY + 0.8, -4.1, { ry: PI, collide: false });
    const pot = (x, y, z, s = 1) => { B.cyl(x, y, z, 0.32 * s, 0.55 * s, { mat: 'bk_marble_dk', sides: 12 }); P('bush', x, y + 0.45 * s, z, { variant: 'small', s: 0.55 * s, collide: false }); };
    pot(-10.9, FY, -5.0); pot(10.9, FY, -5.0); pot(-10.9, FY, 6.0); pot(10.9, FY, 5.6);
    for (const x of [7.4, 8.4]) P('armchair', x, FY, 1.2, { variant: 'leather', ry: PI });
    P('coffee_table', 7.9, FY, 0.1, { variant: 'wood' });
    P('rug', 0, FY + 0.005, -3.5, { variant: 'red', w: 3.2, d: 2.2 });
    // vestibule: brass-framed glass box inside the main doors, inner doors open
    for (const x of [-1.9, 1.9]) bc(x - 0.03, FY, -5.65, x + 0.03, FY + 2.9, -3.6, { mat: 'glass', surf: 'glass', cast: false });
    for (const x of [-1.9, 1.9]) { bc(x - 0.05, FY, -3.65, x + 0.05, FY + 2.95, -3.55, nc('bk_brass')); bc(x - 0.05, FY + 2.9, -5.65, x + 0.05, FY + 2.98, -3.55, nc('bk_brass')); }
    bc(-1.9, FY + 2.9, -3.65, 1.9, FY + 2.98, -3.55, nc('bk_brass'));
    bc(-1.9, FY + 2.98, -5.65, 1.9, FY + 3.0, -3.55, nc('bk_glass_shop', { cast: false }));
    door(B, 0, FY, -3.6, 0, { v: 'glass', w: 2.0, h: 2.7, double: true, open: 75, frame: false });
    P('rug', 0, FY + 0.006, -4.6, { variant: 'blue', w: 3.4, d: 1.8 });
    // hall lights: four big pendants (two are real lights), laylight
    for (const x of [-8.5, 8.5]) for (const z of [-2.5, 4.5]) pendant(B, x, HALL, z, 2.7, true);
    light(-8.5, HALL - 2.9, 1, { intensity: 34, color: [1, 0.86, 0.66], fixture: false, range: 16 });
    light(8.5, HALL - 2.9, 1, { intensity: 34, color: [1, 0.86, 0.66], fixture: false, range: 16 });
    light(0, HALL - 0.5, 1.2, { intensity: 26, color: [0.92, 0.95, 1], fixture: false, range: 14 });

    // ================================================================== teller strip (behind the counter, under the gallery)
    for (let x = -11.4; x < -6; x += 0.5) P('filing_cabinet', x, FY, 12.0, { ry: PI, color: 'beige' });
    bc(-4, FY, 11.7, -2.4, FY + 1.4, 12.35, { mat: 'bk_steel_dk' });                  // teller safe
    box(-3.2, FY + 0.6, 11.68, 0.3, 0.3, 0.02, nc('p_chrome'));
    bc(-1.6, FY, 11.8, 1.2, FY + 0.9, 12.35, { mat: 'bk_walnut', mats: { t: 'bk_marble_dk' } });   // back counter
    box(-0.8, FY + 0.9, 12.05, 0.45, 0.3, 0.4, nc('p_plastic_grey')); box(0.4, FY + 0.9, 12.05, 0.5, 0.35, 0.45, nc('p_plastic_dark'));
    for (let x = 6.4; x < 11.6; x += 0.6) P('filing_cabinet', x, FY, 12.0, { ry: PI, variant: '2', color: 'grey' });
    sign(B, 'staff', 4, FY + 2.55, 12.33, 0.8, 0.25, PI); sign(B, 'vault', -5, FY + 2.7, 12.33, 1.4, 0.35, PI);
    for (const x of [-7, 3]) light(x, UY - 0.3, 10, { intensity: 7, fixture: 'panel', color: [1, 0.93, 0.82] });
    for (const x of [-10.5, -3.5, 6.5, 10]) box(x, UY - 0.34, 10, 0.6, 0.04, 0.6, nc('bk_glow', { cast: false }));

    // ================================================================== west wing: loan office, stair hall
    P('desk', -16, FY, -3.2, { variant: 'exec', ry: 0 }); P('office_chair', -16, FY, -4.2, { variant: 'leather' });
    for (const x of [-16.6, -15.4]) P('chair', x, FY, -1.8, { variant: 'dark', ry: PI });
    P('bookshelf', -19.4, FY, -2.0, { ry: H, variant: 'walnut', w: 1.6 }); P('filing_cabinet', -12.6, FY, -5.2, { color: 'black' });
    pot(-13.0, FY, 0.2, 0.8); P('rug', -16, FY + 0.005, -2.5, { variant: 'green', w: 2.6, d: 2.0 });
    light(-16, UY - 0.3, -2.4, { intensity: 6, fixture: 'panel', color: [1, 0.9, 0.75] });
    // stair hall: side doors from Cedar Lane, night depository, benches
    sign(B, 'nightdep', -15, FY + 2.6, 1.17, 1.6, 0.4, 0); P('atm', -12.17, FY, 9.8, { variant: 'wall', ry: -H });
    bc(-14.3, FY, 11.7, -12.3, FY + 0.45, 12.25, { mat: 'bk_walnut' });
    P('fire_extinguisher', -17.6, FY, 12.33, { ry: PI }); sign(B, 'exit', -19.62, FY + 2.75, 3, 0.5, 0.22, H, true);
    light(-15, UY - 0.3, 6.5, { intensity: 7, fixture: 'panel', color: [1, 0.9, 0.75] });
    sign(B, 'ad1', -12.17, FY + 1.4, 3.5, 0.8, 1.06, -H);

    // ================================================================== site A: safe-deposit antechamber + vault
    // viewing booths along the west wall (curtained cubicles), attendant desk, counting table, deposit wall
    for (let i = 0; i < 3; i++) {
      const z = 12.8 + i * 1.7;
      bc(-19.65, FY, z - 0.05, -17.6, FY + 2.2, z + 0.05, { mat: 'bk_walnut' });
      bc(-19.6, FY, z + 0.1, -18.8, FY + 0.75, z + 1.5, { mat: 'bk_walnut', mats: { t: 'bk_marble_dk' } });
      P('chair', -18.4, FY, z + 0.85, { ry: -H, variant: 'dark' });
      bc(-17.62, FY + 0.3, z + 0.1, -17.58, FY + 2.15, z + 0.8, nc('p_fab_green'));
    }
    bc(-19.65, FY, 17.85, -17.6, FY + 2.2, 17.95, { mat: 'bk_walnut' });
    bc(-19.65, FY + 2.2, 12.7, -17.6, FY + 2.28, 17.95, nc('bk_walnut'));
    P('desk', -0.8, FY, 14.4, { variant: 'exec', ry: -H }); P('office_chair', 0.3, FY, 14.4, { ry: -H, variant: 'leather' }); P('monitor', -0.8, FY + 0.75, 14.4, { ry: -H, collide: false });
    bc(-11.5, FY, 15.3, -8.5, FY + 0.92, 16.7, { mat: 'bk_walnut', mats: { t: 'bk_marble_dk' } });     // counting table (cover)
    for (const [x, z] of [[-10.6, 14.8], [-9.4, 17.2]]) P('chair', x, FY, z, { variant: 'dark', ry: x < -10 ? 0 : PI });
    // deposit-box wall on the vault front (either side of the door) and inside the vault
    const boxes = (x0, x1, z, face, y0 = FY + 0.1, h = 2.4) => {
      bc(x0, y0, z - 0.25, x1, y0 + h, z + 0.25, { mat: 'bk_deposit', mats: { t: 'bk_steel_dk' }, cast: false });
      const n = Math.floor((x1 - x0) / 0.3);
      for (let i = 0; i < n; i++) box(x0 + 0.15 + i * 0.3, y0 + 0.1, z + face * 0.255, 0.012, h - 0.2, 0.01, nc('bk_steel_dk', { cast: false }));
    };
    boxes(-16.8, -10.0, 19.1 - 0.15, -1, FY, 2.2); boxes(-6.0, -0.4, 19.1 - 0.15, -1, FY, 2.2);
    boxes(-16.0, 1.0, 25.4, -1); boxes(-16.0, -11.0, 20.9, 1, FY + 0.1, 1.2);
    for (let x = -15.6; x < -12; x += 1.4) P('crate_plastic', x, FY, 21.6, { variant: 'grey', n: 2, ry: 0.1 });
    bc(-10, FY, 22.0, -6, FY + 0.9, 23.2, { mat: 'bk_steel', mats: { t: 'bk_steel_dk' } });                    // vault table (cover)
    for (const [x, z] of [[-3.5, 22.3], [-2.4, 23.4]]) { bc(x - 0.4, FY, z - 0.55, x + 0.4, FY + 1.1, z + 0.55, { mat: 'p_galv' }); for (let k = 0; k < 3; k++) box(x, FY + 0.25 + k * 0.33, z, 0.7, 0.2, 0.9, nc(k % 2 ? 'p_plastic_milky' : 'p_paint_milgreen', { cast: false })); }
    bc(-17.0, FY + 3.1, 20.3, 1.2, FY + 3.3, 25.65, { mat: 'bk_steel_dk' });                                   // vault ceiling
    light(-8, FY + 3.08, 23, { intensity: 6, fixture: 'tube', color: [0.92, 0.96, 1] });
    pendant(B, -13.5, UY - 0.3, 16, 1.2); pendant(B, -4, UY - 0.3, 16, 1.2);
    light(-13.5, UY - 1.75, 16, { intensity: 9, color: [1, 0.86, 0.66], fixture: false, range: 10 });
    light(-4, UY - 1.75, 16, { intensity: 9, color: [1, 0.86, 0.66], fixture: false, range: 10 });
    // skylight over A (glass you can see and shoot through, walkable frame)
    bc(-11.2, UY - 0.3, 14.3, -4.8, UY + 0.35, 14.5, { mat: 'bk_frame' }); bc(-11.2, UY - 0.3, 17.5, -4.8, UY + 0.35, 17.7, { mat: 'bk_frame' });
    bc(-11.2, UY - 0.3, 14.5, -11.0, UY + 0.35, 17.5, { mat: 'bk_frame' }); bc(-5.0, UY - 0.3, 14.5, -4.8, UY + 0.35, 17.5, { mat: 'bk_frame' });
    bc(-11.0, UY + 0.3, 14.5, -5.0, UY + 0.32, 17.5, { mat: 'glass', surf: 'glass', cast: false });
    for (let x = -10; x < -5.5; x += 1.5) bc(x - 0.03, UY + 0.26, 14.5, x + 0.03, UY + 0.34, 17.5, nc('bk_frame'));
    // records closet (hide)
    P('shelf_unit', -18.7, FY, 25.3, { ry: PI, variant: 'grey' }); P('cardboard_box', -18.9, FY, 24.0, { variant: 'medium', stack: 3 });
    sign(B, 'records', -18.7, FY + 2.35, 19.48, 0.6, 0.25, PI);

    // ================================================================== back of house: back corridor, cash room, security, staff, dock
    P('fire_extinguisher', 5.85, FY, 14.0, { ry: -H }); sign(B, 'cash', 6.17, FY + 2.4, 17, 0.9, 0.28, H);
    bc(2.4, FY, 13.0, 3.4, FY + 1.0, 14.2, { mat: 'p_galv' });                                                  // cash cart
    // cash room: counting tables, note counters, a safe, shelves of bags
    for (const z of [14.2, 17.6]) { bc(7.0, FY, z - 0.5, 10.6, FY + 0.9, z + 0.5, { mat: 'p_galv', mats: { t: 'bk_steel' } }); box(8.0, FY + 0.9, z, 0.4, 0.3, 0.4, nc('p_plastic_dark')); box(9.6, FY + 0.9, z, 0.4, 0.3, 0.4, nc('p_plastic_dark')); }
    bc(10.6, FY, 18.9, 11.85, FY + 1.6, 19.85, { mat: 'bk_steel_dk' });
    P('shelf_unit', 7.2, FY, 19.6, { ry: PI, variant: 'grey' });
    light(8.8, UY - 0.3, 16, { intensity: 6, fixture: 'tube', color: [0.95, 0.98, 1] });
    // staff hall: lockers, bench, notice board; private office; security room
    P('lockers', 14.0, FY, 3.35, { n: 6, variant: 'grey' }); P('lockers', 17.8, FY, 3.35, { n: 4, variant: 'grey', bench: true });
    sign(B, 'pinboard', 23.62, FY + 1.5, 4.8, 1.2, 0.8, -H); sign(B, 'breakrm', 23.62, UY - 1.6, 9.5, 0.7, 0.28, -H);
    P('fire_extinguisher', 23.6, FY, 10.2, { ry: -H }); sign(B, 'exit', 23.62, FY + 2.75, 7, 0.5, 0.22, -H, true);
    light(17.5, UY - 0.3, 7, { intensity: 7, fixture: 'tube', color: [0.95, 0.98, 1] });
    P('desk', 18.5, FY, -3.6, { variant: 'exec' }); P('office_chair', 18.5, FY, -4.6, { variant: 'leather' });
    for (const x of [17.8, 19.2]) P('chair', x, FY, -2.3, { variant: 'dark', ry: PI });
    P('sofa', 22.9, FY, 0.2, { variant: 'leather', ry: -H }); P('coffee_table', 21.6, FY, 0.2, { variant: 'glass', ry: H });
    P('bookshelf', 12.5, FY, -3, { ry: H, variant: 'walnut', w: 1.8 }); pot(13.0, FY, 2.4, 0.8); P('rug', 19, FY + 0.005, -1.0, { variant: 'blue', w: 3, d: 2.4 });
    light(18.5, UY - 0.3, -1.4, { intensity: 6, fixture: 'panel', color: [1, 0.9, 0.75] });
    P('control_console', 19.5, FY, 18.9, { ry: PI, len: 3.2 }); sign(B, 'cctv', 19.5, FY + 1.75, 19.83, 3.2, 1.6, PI, true);
    P('office_chair', 19.0, FY, 17.6, { ry: PI }); P('office_chair', 20.4, FY, 17.8, { ry: PI + 0.4 });
    P('server_rack', 23.0, FY, 13.6, { n: 2, ry: -H }); P('lockers', 16.2, FY, 13.0, { n: 3, variant: 'blue' });
    P('desk', 16.0, FY, 16.4, { variant: 'metal', ry: H }); P('monitor', 16.0, FY + 0.75, 16.4, { ry: H, collide: false });
    sign(B, 'security', 14.43, FY + 2.35, 16, 0.6, 0.25, -H);
    light(19, UY - 0.3, 15.5, { intensity: 5, fixture: 'tube', color: [0.92, 0.96, 1] });
    // loading dock: roller door (rolled up), cages, pallets, cart, signage
    bc(13.0, FY + 3.3, 25.5, 17.0, FY + 3.85, 26.4, { mat: 'bk_steel_dk' });                                   // shutter coil housing
    for (const s of [-1, 1]) bc(15 + s * 2.05 - 0.05, FY, 25.6, 15 + s * 2.05 + 0.05, FY + 3.3, 26.05, nc('bk_steel'));
    sign(B, 'dock', 15, FY + 4.2 - 0.25 + 0.1, 26.03, 2.2, 0.55, 0);
    P('pallet', 20.5, FY, 24.2, { variant: 'boxes', stack: 1, h: 1.0, ry: 0.1 }); P('pallet', 22.4, FY, 24.4, { variant: 'wrap', h: 1.2 });
    P('crate_stack', 9.5, FY, 24.2, { n: 4, hide: true }); P('pallet_jack', 18, FY, 23.0, { ry: 0.4 });
    for (const x of [7.6, 8.8]) { bc(x - 0.45, FY, 21.3, x + 0.45, FY + 1.6, 22.3, { mat: 'p_galv', collide: true, cast: false }); box(x, FY + 0.2, 21.8, 0.8, 0.6, 0.9, nc('p_bag_blue')); }
    P('shelf_unit', 23.3, FY, 21.5, { ry: -H, variant: 'grey' }); P('wheelie_bin', 12.9, FY, 25.2, { variant: 'grey', ry: PI });
    light(15, UY - 0.3, 22.8, { intensity: 8, fixture: 'tube', color: [0.95, 0.98, 1] });
    box(4, FY + 2.6, 25.62, 0.5, 0.22, 0.04, nc('p_lens_red')); sign(B, 'exit', 4, FY + 2.45, 25.62, 0.5, 0.22, PI, true);

    // ================================================================== upper floor: records, landing, gallery, break room (T2 lobby), corridor
    for (let i = 0; i < 4; i++) P('shelf_unit', -18.2 + i * 1.5, UY, -0.9, { variant: 'grey', ry: 0 });
    for (let i = 0; i < 3; i++) P('filing_cabinet', -19.3, UY, -4.8 + i * 0.6, { ry: H, color: 'grey' });
    P('desk', -14.5, UY, -4.4, { variant: 'metal' }); P('office_chair', -14.5, UY, -5.2); P('cardboard_box', -13.0, UY, -2.4, { variant: 'pile', n: 5 });
    light(-16, TOP, -2, { intensity: 5, fixture: 'tube', color: [0.95, 0.98, 1] });
    // landing over the west stair, benches by the overlook
    bc(-17.6, UY, 11.75, -16.0, UY + 0.45, 12.3, { mat: 'bk_walnut' }); pot(-12.6, UY, 2.6, 0.8);
    sign(B, 'ad2', -15.0, UY + 1.2, 2.17, 0.75, 1.0, 0);
    // gallery: officers' platform desks along the back wall, filing, plants
    for (const x of [-9, -2.5, 3.5, 9]) { P('desk', x, UY, 11.6, { variant: 'office', ry: PI }); P('office_chair', x, UY, 10.8, { ry: PI }); P('monitor', x + 0.2, UY + 0.75, 11.75, { ry: PI, collide: false }); }
    P('filing_cabinet', -11.5, UY, 12.05, { ry: PI }); P('filing_cabinet', 11.5, UY, 12.05, { ry: PI });
    pot(-0.5, UY, 9.0, 0.8); pot(6.5, UY, 9.0, 0.8);
    light(0, HALL, 10.2, { intensity: 8, fixture: 'panel', color: [1, 0.93, 0.82] });
    // break room (T2 lobby): kitchenette, fridge, vending, lockers, tables at the walls, TV, notice board
    P('kitchen_counter', 15.6, UY, -5.32, { variant: 'white', len: 4.2, sink: 1, hob: -1 });
    P('fridge', 18.2, UY, -5.25, { variant: 'steel' }); P('vending_machine', 19.4, UY, -5.15, { variant: 'drinks' }); P('vending_machine', 20.5, UY, -5.15, { variant: 'snacks' });
    P('lockers', 12.4, UY, 0.5, { n: 6, ry: H, variant: 'blue' });
    P('dining_table', 22.3, UY, -3.6, { variant: 'set', chairs: 2, w: 1.2, ry: H }); P('sofa', 23.1, UY, 2.3, { variant: 'teal', ry: -H, seats: 2 });
    P('tv', 21.7, UY + 1.5, 4.83, { ry: PI, wall: true, on: false }); sign(B, 'pinboard', 14.6, UY + 1.4, 4.83, 1.0, 0.66, PI);
    sign(B, 'breakrm', 18, UY + 2.75, 5.17, 0.7, 0.28, 0);
    light(15.5, TOP, -0.5, { intensity: 6, fixture: 'panel', color: [1, 0.95, 0.88] }); light(20.5, TOP, -0.5, { intensity: 6, fixture: 'panel', color: [1, 0.95, 0.88] });
    // upper corridor: copier, water cooler, bench
    bc(22.8, UY, 6.0, 23.6, UY + 1.1, 7.0, { mat: 'p_plastic_beige' }); B.cyl(13.0, UY, 9.6, 0.17, 1.15, { mat: 'p_plastic_milky', sides: 10 });
    light(17.5, TOP, 8.2, { intensity: 5, fixture: 'tube', color: [0.95, 0.98, 1] });

    // ================================================================== the low roof: HVAC, ducts, vents, hatch, fire escape
    P('ac_unit', -14.5, UY, 21.5, { variant: 'hvac', hide: true, cast: true }); P('ac_unit', 7.5, UY, 18.5, { variant: 'hvac', ry: H, cast: true });
    P('ac_unit', 17.5, UY, 23.0, { variant: 'hvac', hide: true, cast: true });
    for (const [x, z] of [[-2, 23.5], [0, 23.5], [12, 15.0], [14, 15.0]]) P('ac_unit', x, UY, z, { variant: 'condenser', cast: true });
    for (const [x, z] of [[-17, 14.5], [3, 20.0], [21.5, 15.5], [-8, 24.5]]) P('vent', x, UY, z, { variant: 'mushroom' });
    bc(-12.8, UY + 0.4, 21.2, -1.5, UY + 0.95, 21.8, { mat: 'p_galv' });                                        // duct run on stands
    for (let x = -12; x < -1; x += 2.5) bc(x - 0.05, UY, 21.4, x + 0.05, UY + 0.4, 21.6, nc('p_galv'));
    bc(8.6, UY + 0.4, 17.9, 9.2, UY + 0.95, 24.5, { mat: 'p_galv' });
    bc(19.5, UY, 18.0, 20.6, UY + 0.6, 19.1, { mat: 'p_galv', mats: { t: 'bk_steel_dk' } });                    // roof hatch
    bc(-20.1, 0, 26.05, -19.8, UY + 0.6, 26.25, nc('p_galv')); bc(22.5, 0, 26.05, 22.8, UY + 0.9, 26.2, nc('p_galv'));   // downpipes
    // fire escape: open galvanised stair from the alley up to a landing at the parapet gap
    {
      const n = 26, len = 7.3, x0 = -2.0, zc = 26.85, w = 1.2, rise = UY / n, run = len / n;
      for (let i = 0; i < n; i++) bc(x0 - run * (i + 1), rise * (i + 1) - 0.04, zc - w / 2, x0 - run * i, rise * (i + 1), zc + w / 2, nc('grate', { cast: false }));
      for (const s of [-1, 1]) {
        const m = BABYLON.MeshBuilder.CreateBox('bk_stringer', { width: Math.hypot(len, UY) + 0.2, height: 0.22, depth: 0.04 }, B.scene);
        m.rotation.z = -Math.atan2(UY, len); m.position.set(x0 - len / 2, UY / 2 - 0.08, zc + s * (w / 2 + 0.02));
        B.mesh(m, { mat: 'p_galv', collide: 'none' });
      }
      B.world.addRamp({ cx: x0 - len / 2, cz: zc, hx: len / 2, hz: w / 2, y0: 0, y1: UY, axis: 'x', ry: PI, surf: 'metal' });
      bc(-11.0, UY - 0.08, 26.15, x0 - len, UY, 27.5, { mat: 'grate', cast: false });                           // top landing
      bc(-11.0, UY, 27.45, x0 - len, UY + 1.05, 27.5, { mat: 'p_galv' }); bc(-11.05, UY, 26.15, -11.0, UY + 1.05, 27.5, { mat: 'p_galv' });
      for (let i = 0; i <= 6; i++) { const x = x0 - i * len / 6; bc(x - 0.025, (i * len / 6) / len * UY, zc + w / 2 + 0.02, x + 0.025, (i * len / 6) / len * UY + 1.0, zc + w / 2 + 0.07, nc('p_galv')); }
      const rail = BABYLON.MeshBuilder.CreateBox('bk_rail', { width: Math.hypot(len, UY), height: 0.05, depth: 0.05 }, B.scene);
      rail.rotation.z = -Math.atan2(UY, len); rail.position.set(x0 - len / 2, UY / 2 + 1.0, zc + w / 2 + 0.045);
      B.mesh(rail, { mat: 'p_galv', collide: [{ cx: x0 - len / 2, cy: UY / 2 + 0.5, cz: zc + w / 2 + 0.05, hx: len / 2, hy: UY / 2 + 0.6, hz: 0.04, ry: 0 }] });
    }

    // ================================================================== site B: the loading alley
    van(B, 15, 31.2, PI);                                                                                       // backed up to the dock
    sign(B, 'van', 16.17, 2.0, 30.0, 2.6, 0.65, H); sign(B, 'van', 13.83, 2.0, 32.4, 2.6, 0.65, -H);
    B.ramp({ x: 15, z: 26.9, w: 4.2, len: 1.4, y0: FY, y1: 0.03, dir: '+z', mat: 'concrete' });
    bc(2.9, 0, 26.0, 5.1, FY, 27.1, { mat: 'concrete', mats: { t: 'concrete_floor' } }); bc(3.1, 0, 27.1, 4.9, FY / 2, 27.45, { mat: 'concrete' });
    for (const x of [12.6, 17.4]) { B.cyl(x, 0, 27.0, 0.12, 1.1, { mat: 'paint_yellow', sides: 10 }); }
    sign(B, 'stencil', 15, 0.045, 29.2, 3.2, 0.8, PI, 'decal', true);
    P('dumpster', -3.5, 0.03, 36.9, { variant: 'green', ry: PI, hide: true, cast: true }); P('dumpster', 21.0, 0.03, 36.9, { variant: 'blue', ry: PI, lid: 'open', hide: true, cast: true });
    P('pallet', 3.6, 0.03, 36.8, { stack: 5 }); P('pallet', 5.0, 0.03, 36.9, { stack: 3, ry: 0.2 });
    P('crate_stack', 8.0, 0.03, 36.2, { n: 5, ry: PI, hide: true, cast: true });
    P('wheelie_bin', -1.4, 0.03, 37.4, { variant: 'black', ry: PI }); P('wheelie_bin', -0.6, 0.03, 37.45, { variant: 'blue', ry: PI });
    P('trash_bag', 0.4, 0.03, 37.2, { n: 5 }); P('trash_bag', 23.0, 0.03, 37.3, { n: 3 });
    P('cardboard_box', 6.5, 0.03, 27.3, { variant: 'flat', stack: 4 }); P('pallet', 20.5, 0.03, 27.2, { stack: 2, variant: 'drums' });
    P('drum', 23.0, 0.03, 27.0, { variant: 'blue', n: 2 });
    sign(B, 'graffiti', 10.0, 1.4, 37.98, 2.6, 1.3, PI);
    // north side of the alley: backs of the next block (out of bounds) with doors, pipes, a fire escape, AC units
    facade(B, 27.05, 38, -24.05, 38, { h: 14, depth: 12, mat: 'bk_brick_dk', trim: 'bk_limestone_dk', shop: false, gf: 3.6, floors: 4, seed: 21, winW: 1.0, winSp: 3.4, ac: true });
    for (const x of [-18, 1, 27.5]) { bc(x - 0.55, 0, 37.9, x + 0.55, 2.2, 38.0, nc('bk_door_paint')); bc(x - 0.7, 2.25, 37.6, x + 0.7, 2.32, 38.0, nc('bk_frame')); }
    for (const x of [-10, 12.5, 33]) bc(x - 0.06, 0, 37.82, x + 0.06, 13, 37.95, nc('p_galv'));
    bc(-30, 0, 37.55, -26, 2.2, 38.0, { mat: 'bk_steel_dk' });                                                // electrical cabinet bank
    // seal the alley mouths beyond the streets (north ends of Cedar and Fifth): construction fence + barriers
    P('fence_chainlink', -27.5, 0, 40.8, { len: 13, variant: 'barbed' }); P('fence_chainlink', 30.5, 0, 40.8, { len: 13, variant: 'barbed' });
    for (const x of [-30, -25]) P('jersey_barrier', x, 0, 40.0, { variant: 'plastic', color: 'red', len: 2 });
    for (const x of [28, 33]) P('jersey_barrier', x, 0, 40.0, { variant: 'plastic', color: 'white', len: 2 });
    box(-29, 0, 41.8, 11, 14, 0.8, { mat: 'bk_brick_dk' }); box(32, 0, 41.8, 11, 14, 0.8, { mat: 'bk_brick_dk' });

    // ================================================================== Cedar Lane (west flank)
    facade(B, -34, 38, -34, -5.95, { h: 16, depth: 14, mat: 'bk_stucco', trim: 'bk_limestone', shop: 's_books', awning: 'bk_awning_r', seed: 31, doors: [1, 6, 10] });
    facade(B, -34, 44, -34, 38, { h: 16, depth: 14, mat: 'bk_brick_dk', shop: false, seed: 32 });
    for (const [z, ry, v, c] of [[-1, 0, 'sedan', 'grey'], [9, 0, 'hatch', 'red'], [21, PI, 'suv', 'black']]) P('car', -30.0, 0, z, { variant: v, color: c, ry, hide: true, cast: true });
    P('box_truck', -29.8, 0, 32.5, { variant: 'logo', ry: PI, hide: true, cast: true });
    P('newspaper_box', -21.0, 0.15, -3.2, { variant: 'blue' }); P('newspaper_box', -21.0, 0.15, -2.4, { variant: 'red' });
    P('fire_hydrant', -23.6, 0.15, 6.0); P('mailbox', -21.0, 0.15, 12.0, { variant: 'blue' });
    P('street_light', -23.6, 0.15, -2, { ry: -H, on: false }); P('street_light', -31.4, 0.15, 24, { ry: H, on: false });
    P('road_sign', -23.7, 0.15, -10.8, { variant: 'street', ry: H }); P('road_sign', -31.3, 0.15, 30.0, { variant: 'oneway', ry: H });
    for (const z of [18, 30]) P('tree', -22.0, 0.15, z, { variant: 'oak', h: 8.5, cast: true });
    for (const z of [18, 30]) bc(-22.8, 0.149, z - 0.8, -21.2, 0.155, z + 0.8, nc('bk_steel_dk', { cast: false }));
    P('scan_utility_box_2', -21.4, 0.15, 24.5, { ry: H });
    P('litter_bin', -21.0, 0.15, 7.2, { variant: 'square' });

    // ================================================================== Fifth St (east)
    facade(B, 37, -5.95, 37, 44, { h: 18, depth: 14, mat: 'bk_brick_tan', trim: 'bk_limestone', shop: 's_cafe', awning: 'bk_awning_b', seed: 41, doors: [2, 7] });
    P('box_truck', 30.2, 0, 15.0, { variant: 'plain', color: 'white', hide: true, cast: true });
    for (const [z, ry, v, c] of [[0, PI, 'sedan', 'blue'], [26, 0, 'taxi'], [35, PI, 'pickup', 'white']]) P('car', 32.7, 0, z, { variant: v, color: c, ry, hide: true, cast: true });
    P('scaffolding', 35.7, 0.15, 22, { bays: 3, levels: 3, ry: -H });
    P('fire_hydrant', 24.6, 0.15, 12.0); P('street_light', 26.4, 0.15, 4, { ry: H, on: false }); P('street_light', 34.4, 0.15, 30, { ry: -H, on: false });
    P('scan_utility_box', 24.6, 0.15, 20.5, { ry: -H }); P('wheelie_bin', 24.6, 0.15, 23.5, { variant: 'green', ry: -H });
    for (const z of [-3, 30]) P('cone', 28.0, 0, z, { variant: 'drum' });
    P('road_sign', 26.6, 0.15, -10.8, { variant: 'street', ry: -H });

    // ================================================================== Federal Ave (front)
    // north sidewalk in front of the bank: bollards, planters, benches, street lights, trees, bins
    for (let x = -18; x <= 22; x += 2.4) if (Math.abs(x) > 9) P('bollard', x, 0.15, -11.2, { variant: 'concrete' });
    for (const x of [-15, 16]) { P('planter', x, 0.15, -9.0, { len: 2.4 }); }
    P('bench', -11.5, 0.15, -10.5, { variant: 'metal', ry: PI }); P('bench', 11.5, 0.15, -10.5, { variant: 'metal', ry: PI });
    P('litter_bin', -9.6, 0.15, -10.8, { variant: 'round' }); P('atm', 10.5, 0.15, -6.0, { variant: 'wall', ry: PI });
    for (const x of [-22, 22]) P('street_light', x, 0.15, -11.4, { variant: 'double', ry: 0, on: false });
    for (const x of [-4, 4]) P('street_light', x, 0.15, -11.4, { variant: 'park', on: false });
    for (const x of [-40, -55, 40]) P('tree', x, 0.15, -9.0, { variant: 'birch', h: 9, cast: true });
    P('traffic_light', -24.4, 0.15, -11.6, { variant: 'mast', ry: PI, len: 6, state: 'green' }); P('traffic_light', 34.6, 0.15, -11.6, { variant: 'mast', ry: PI, len: 6, state: 'red' });
    P('traffic_light', -31.6, 0.15, -24.4, { variant: 'pole', state: 'green', ry: 0 }); P('traffic_light', 26.6, 0.15, -24.4, { variant: 'pole', state: 'red', ry: 0 });
    P('fire_hydrant', 0, 0.15, -11.4, { variant: 'yellow' });
    // the road: stopped traffic (cover), parked cars along both kerbs, a city bus at the stop
    for (const [x, z, ry, v, c] of [[-46, -13.7, H, 'sedan', 'white'], [-37, -13.7, H, 'hatch', 'blue'], [-12, -13.7, H, 'police', null], [-5, -13.7, H, 'sedan', 'black'],
      [14, -13.7, -H, 'suv', 'grey'], [21, -13.7, -H, 'van', 'white'], [-40, -22.3, -H, 'sedan', 'silver'], [-18, -22.3, -H, 'pickup', 'red'], [12, -22.3, -H, 'hatch', 'green'],
      [-9, -16.2, -H, 'taxi', null], [6, -19.6, H, 'sedan', 'beige'], [40, -16.0, -H, 'suv', 'navy']])
      P('car', x, 0, z, Object.assign({ variant: v, ry, hide: true, cast: true }, c ? { color: c } : {}));
    P('bus', 0, 0, -22.4, { variant: 'city', color: 'white', ry: H, hide: true, cast: true });
    sign(B, 'busad', 0, 2.25, -20.76, 3.6, 1.2, 0);
    P('bus_shelter', -4, 0.15, -26.3, { ry: 0 }); P('newspaper_box', 6, 0.15, -25.0, { variant: 'yellow', ry: PI });
    P('mailbox', 9, 0.15, -25.0, { variant: 'blue', ry: PI }); P('litter_bin', -9, 0.15, -24.8, { variant: 'round' });
    for (const x of [-15, 17]) P('street_light', x, 0.15, -24.6, { ry: PI, on: false });
    for (const x of [-30, -6, 20]) P('tree', x, 0.15, -26.8, { variant: 'oak', h: 8, cast: true });
    for (const x of [-30, -6, 20]) bc(x - 0.8, 0.149, -27.6, x + 0.8, 0.155, -26.0, nc('bk_steel_dk', { cast: false }));
    // south side buildings (out of bounds): shops along z -30
    facade(B, -48, -30, -22, -30, { h: 15, mat: 'bk_brick_tan', trim: 'bk_limestone', shop: 's_deli', awning: 'bk_awning_g', seed: 51 });
    facade(B, -22, -30, -2, -30, { h: 19, mat: 'bk_stucco_b', trim: 'bk_limestone', shop: 's_pharm', seed: 52 });
    facade(B, -2, -30, 18, -30, { h: 13, mat: 'bk_brick_dk', trim: 'bk_limestone', shop: 's_jewel', awning: 'bk_awning_r', seed: 53 });
    facade(B, 18, -30, 46, -30, { h: 22, mat: 'bk_panel_c', trim: 'bk_limestone_dk', shop: 's_insure', seed: 54, winW: 2.2, winSp: 3.2 });
    // north side west of Cedar and east of Fifth
    facade(B, -60, -6, -86, -6, { h: 14, mat: 'bk_stucco', trim: 'bk_limestone', shop: 's_tailor', awning: 'bk_awning_g', seed: 61 });
    facade(B, -34.05, -6, -60, -6, { h: 20, mat: 'bk_brick_tan', trim: 'bk_limestone', shop: 's_hotel', awning: 'bk_awning_r', seed: 62 });
    facade(B, 46, -6, 37.05, -6, { h: 18, mat: 'bk_brick_tan', trim: 'bk_limestone', shop: 's_lease', seed: 63 });
    // street ends: road closed (barriers, police car) at both ends of the avenue
    for (const z of [-21, -18, -15]) { P('jersey_barrier', -84.5, 0, z, { ry: H, variant: 'concrete' }); P('jersey_barrier', 44.5, 0, z, { ry: H, variant: 'concrete' }); }
    facade(B, -86.05, -6, -120, -6, { h: 16, mat: 'bk_brick_dk', trim: 'bk_limestone', shop: 's_laundry', seed: 71 });
    facade(B, -120, -30, -86.2, -30, { h: 12, mat: 'bk_stucco_b', trim: 'bk_limestone', shop: 's_shoes', awning: 'bk_awning_b', seed: 72 });
    facade(B, 80, -6, 46.05, -6, { h: 24, mat: 'bk_panel_c', trim: 'bk_limestone_dk', shop: false, seed: 73 });
    facade(B, 46, -30, 80, -30, { h: 14, mat: 'bk_brick_tan', trim: 'bk_limestone', shop: 's_deli', seed: 74 });
    facade(B, -120, -5.95, -120, -30.05, { h: 22, mat: 'bk_stucco', trim: 'bk_limestone', shop: false, seed: 75 });
    facade(B, 80, -30.05, 80, -5.95, { h: 26, mat: 'bk_brick_dk', trim: 'bk_limestone', shop: false, seed: 76 });
    P('car', -80, 0, -19, { variant: 'police', ry: 0.3, lights: true, cast: true }); P('car', 42, 0, -20.5, { variant: 'police', ry: -0.5, lights: true, cast: true });
    for (const z of [-27, -9]) { P('cone', -83, 0.15, z, { variant: 'sawhorse', ry: H }); P('cone', 43.5, 0.15, z, { variant: 'sawhorse', ry: H }); }

    // ================================================================== the parking garage (team 1): ramp level P1 + drive aisle
    const GY = 0, GC = 2.9;
    // shell: west, south, east walls and the street facade with the vehicle and pedestrian entrances
    W(-84, -64, -84, -30, { t: 0.4, h: 13.5, mat: 'bk_garage', mat2: 'bk_garage' });
    W(-84, -64, -48, -64, { t: 0.4, h: 13.5, mat: 'bk_garage', mat2: 'bk_garage' });
    W(-48, -64, -48, -30, { t: 0.4, h: 13.5, mat: 'bk_garage', mat2: 'bk_garage' });
    W(-84, -30.2, -48, -30.2, { t: 0.4, h: GC + 0.35, mat: 'bk_garage', mat2: 'bk_garage', openings: [{ at: 14, w: 12, h: 2.5 }, { at: 30, w: 1.8, h: 2.3 }] });
    // upper decks seen from the street: spandrels and open bays (no access)
    for (let k = 1; k < 4; k++) {
      const y = k * 3.25;
      bc(-84, y, -30.4, -48, y + 1.1, -30.0, { mat: 'bk_panel_c' });
      if (k > 1) bc(-83.8, y - 0.35, -63.8, -48.2, y, -30.4, { mat: 'concrete', mats: { b: 'bk_garage' }, collide: false });
      for (let x = -84; x <= -48; x += 6) bc(x - 0.25, y + 1.1, -30.4, x + 0.25, y + 3.25, -29.9, nc('bk_panel_c'));
    }
    bc(-84, 13.0, -30.4, -48, 13.6, -29.9, nc('bk_panel_c'));
    bc(-83.8, 13.0, -63.8, -48.2, 13.4, -30.4, { mat: 'bk_roof', collide: false });
    for (let k = 1; k < 4; k++) for (let i = 0; i < 6; i++) P('car', -80 + i * 6, k * 3.25, -34.5, { variant: ['sedan', 'hatch', 'suv'][(i + k) % 3], ry: PI, collide: false });
    sign(B, 's_garage', -66, 3.8, -30.45, 9, 1.4, PI); sign(B, 'park', -53.5, 3.0, -30.45, 1.1, 1.1, PI);
    sign(B, 'g_clear', -68, 2.75, -30.45, 3.2, 0.42, PI);
    // ground deck: aisle ceiling, columns, lighting tubes, stalls, ticket island, barrier arms
    for (const [x0, z0, x1, z1] of [[-83.8, -63.8, -48.2, -55.8], [-83.8, -48, -48.2, -30.4], [-83.8, -55.8, -79.8, -48], [-74.4, -55.8, -48.2, -48]])
      bc(x0, GC, z0, x1, GC + 0.35, z1, { mat: 'concrete', mats: { b: 'bk_garage' }, cast: false });
    bc(-79.8, GC - 0.4, -48.1, -74.4, GC + 0.35, -47.9, nc('bk_garage'));
    for (const x of [-76, -68, -60, -52]) for (const z of [-36.5]) bc(x - 0.3, 0, z - 0.3, x + 0.3, GC, z + 0.3, { mat: 'bk_garage' });
    for (const x of [-79, -71, -63, -55]) bc(x - 0.6, GC - 0.06, -36.5 - 0.06, x + 0.6, GC, -36.5 + 0.06, nc('bk_glow_cool', { cast: false }));
    for (let x = -82; x < -48; x += 2.6) line(x, -32.4, x + 0.1, -31.2, 'bk_line');
    for (const [x, v, c] of [[-82.3, 'sedan', 'silver'], [-50.5, 'hatch', 'white']]) P('car', x, 0, -37.8, { variant: v, color: c, ry: PI, hide: true, cast: true });
    bc(-69.0, 0, -36.0, -67.0, 0.15, -33.0, { mat: 'concrete' }); bc(-68.4, 0.15, -35.5, -67.6, 1.5, -35.0, { mat: 'p_coat_blue' });
    sign(B, 'g_pay', -68, 1.25, -35.53, 0.6, 0.25, PI);
    P('gate', -71.5, 0, -33.6, { variant: 'barrier', len: 4, open: true }); P('gate', -64.5, 0, -34.0, { variant: 'barrier', len: 4, open: false, ry: PI });
    sign(B, 'g_exit', -68, 2.55, -41.7, 2.6, 0.5, 0); sign(B, 'g_level', -54, 1.9, -41.7, 1.6, 0.4, 0);
    P('scan_covered_car', -80.5, 0, -45, { ry: 0, collide: true });
    // the ramp hall (team 1 lobby) x -80..-56, z -56..-42: walls, the ramp up to the closed P2 shutter, gates in the north wall
    W(-80, -56, -56, -56, { t: 0.4, h: GC, mat: 'bk_garage', mat2: 'bk_garage' });
    W(-80, -55.8, -80, -42.2, { t: 0.4, h: GC, mat: 'bk_garage', mat2: 'bk_garage' });
    W(-56, -55.8, -56, -42.2, { t: 0.4, h: GC, mat: 'bk_garage', mat2: 'bk_garage' });
    W(-80.2, -42, -55.8, -42, { t: 0.4, h: GC, mat: 'bk_garage', mat2: 'bk_garage', openings: [{ at: 6.2, w: 3.2, h: 2.6, frame: false }, { at: 18.2, w: 3.2, h: 2.6, frame: false }] });
    bc(-80, -0.02, -56, -56, 0.02, -42, { mat: 'concrete_floor', cast: false });
    B.ramp({ x: -77.0, z: -50.3, w: 5.2, len: 11, y0: 0, y1: GC + 0.35, dir: '-z', mat: 'bk_garage' });
    bc(-74.4, 0, -55.8, -74.2, GC, -44.8, { mat: 'bk_garage' });                                                 // ramp side wall
    bc(-79.6, 0.5, -48.1, -74.4, GC - 0.4, -47.95, { mat: 'bk_steel_dk' });                                     // closed P2 shutter across the ramp
    for (let y = 0.7; y < GC - 0.4; y += 0.12) bc(-79.6, y, -47.96, -74.4, y + 0.015, -47.94, nc('bk_frame', { cast: false }));
    for (let z = -55; z < -45; z += 1.6) line(-79.3, z, -74.7, z + 0.6, 'bk_line_y');
    sign(B, 'g_level', -77, 2.2, -42.22, 1.8, 0.45, PI); sign(B, 'park', -60, 2.0, -55.78, 0.8, 0.8, 0);
    for (const x of [-60.6, -58]) P('car', x, 0, -52.6, { variant: x < -59 ? 'sedan' : 'suv', color: x < -59 ? 'red' : 'grey', ry: 0, cast: true });
    for (let x = -71; x < -56; x += 3) line(x, -55.8, x + 0.1, -50.8, 'bk_line');
    light(-70, GC, -46.5, { intensity: 6, fixture: 'tube', color: [0.9, 0.95, 1] }); light(-62, GC, -46.5, { intensity: 6, fixture: 'tube', color: [0.9, 0.95, 1] });
    for (const x of [-77, -66]) bc(x - 0.6, GC - 0.06, -52.5, x + 0.6, GC, -52.4, nc('bk_glow_cool', { cast: false }));
    P('fire_extinguisher', -56.2, 0, -45, { ry: -H }); P('drum', -79.3, 0, -43, { variant: 'yellow' });
    B.lobby(1, { x0: -79.8, z0: -55.8, x1: -56.2, z1: -42.2, y: 0 }, [{ x: -74, z: -42, w: 3.2, h: 2.6 }, { x: -62, z: -42, w: 3.2, h: 2.6 }]);
    for (let i = 0; i < 5; i++) for (let j = 0; j < 3; j++) if (!(i === 4 && j === 0)) B.spawn(1, -72 + i * 3, 0.02, -50 + j * 2.6, 0);
    // the street lane west of the garage entrance and the corner building behind it (sealed)
    bc(-86, 0, -66, -84.2, 14, -30.05, { mat: 'bk_brick_tan', mats: { t: 'bk_roof' } });

    // ================================================================== team 2 lobby: staff break room (upper floor)
    B.lobby(2, { x0: 12.4, z0: -4.6, x1: 23.4, z1: 4.8, y: UY }, [{ x: 15, z: 5, w: 2.4, h: 2.6 }, { x: 21, z: 5, w: 2.4, h: 2.6 }]);
    for (const x of [14.2, 16.6, 19.0, 21.2]) for (const z of [-3.0, -0.6, 1.9]) B.spawn(2, x, UY, z, PI);

    // ================================================================== far skyline and the bank's corner neighbours
    skyline(B, [
      [-120, -40, 30, 30, 70, 0], [-110, 10, 26, 26, 52, 1], [-130, 60, 34, 30, 95, 0], [-60, 80, 30, 24, 60, 2], [-10, 95, 40, 30, 120, 0],
      [40, 85, 28, 28, 75, 1], [90, 60, 30, 30, 88, 0], [100, 0, 26, 30, 55, 2], [95, -50, 30, 26, 66, 0], [40, -100, 34, 30, 80, 1],
      [-20, -105, 30, 26, 58, 0], [-80, -110, 28, 30, 45, 2], [-150, -10, 30, 30, 40, 2], [140, 20, 30, 30, 110, 0], [0, 150, 40, 40, 140, 1]]);

    // ================================================================== objectives
    B.site('A', { x0: -19.6, z0: 12.7, x1: 2.0, z1: 25.6, y: FY });
    B.site('B', { x0: -4, z0: 26.2, x1: 24, z1: 37.6, y: 0 });
    B.hostage(-1.5, FY, 4.6); B.hostage(17.2, FY, -1.6); B.hostage(21.5, FY, 15.5); B.hostage(-8.5, FY, 24.4); B.hostage(9.0, FY, 16.0);
    B.rescue({ x0: -82, z0: -40.6, x1: -50, z1: -31.5, y: 0 });
    B.point('dom1', -27.5, 0, 8, 4); B.point('dom2', 0, FY, 1.5, 4); B.point('dom3', 30.5, 0, 7, 4);
    B.point('hp1', 0, FY, 1.5, 5); B.point('hp2', 6, 0.03, 31.5, 5); B.point('hp3', -9.5, FY, 15.5, 4); B.point('hp4', -14, 0.15, -9, 5); B.point('hp5', 4, UY, 20, 5);
    B.point('hill', 0, FY, 0.5, 5);
    B.point('flag1', -66, 0, -38, 2); B.point('flag2', 19.5, FY, 8.5, 2);
    B.point('extract1', -27.5, 0, 35, 3); B.point('extract2', 41, 0, -17, 3); B.point('extract3', -78, 0, -17, 3);
    B.point('hq1', 19, FY, 15.5, 3); B.point('hq2', -16, UY, -2.5, 3);
    // hiding places
    B.hide(-18.6, FY, 22.0, { kind: 'closet' }); B.hide(-0.3, FY, 24.9, { kind: 'dark' }); B.hide(-11.0, FY, 8.6, { kind: 'dark' });
    B.hide(16.6, 0.03, 34.8, { kind: 'car' }); B.hide(-5.6, 0.03, 36.6, { kind: 'crates' }); B.hide(8.0, 0.03, 34.6, { kind: 'crates' });
    B.hide(-14.5, UY, 23.4, { kind: 'roof' }); B.hide(17.5, UY, 25.0, { kind: 'roof' }); B.hide(-27.6, 0, 9, { kind: 'car' });
    B.hide(28.2, 0, 15, { kind: 'car' }); B.hide(11.0, FY, 24.6, { kind: 'crates' }); B.hide(23.0, FY, 18.8, { kind: 'dark' });
    B.hide(-82.0, 0, -40.2, { kind: 'car' }); B.hide(-19.0, UY, -5.0, { kind: 'dark' }); B.hide(0, 0, -20.4, { kind: 'car' });

    // ================================================================== spawns: field (respawn modes) and FFA
    for (const [x, y, z, yaw] of [[-50, 0, -18, H], [-40, 0.15, -27, H], [-80, 0, -34, H], [-52, 0, -34, 0], [-27.5, 0, -4, 0], [-12, 0.15, -27, 0.3],
      [5, 0.15, -27, -0.3], [-32.5, 0.15, 12, H], [-21, 0, -16, 0.6], [-62, 0.15, -27, H]])
      B.spawn(1, x, y, z, yaw, { field: true });
    for (const [x, y, z, yaw] of [[20, FY, 8, -H], [18, FY, 23, PI], [0, UY, 10, PI], [10, UY, 21, PI], [30.5, 0, 9, PI], [20, 0.03, 34.5, -H],
      [19, FY, 14.5, PI], [16.5, UY, 8.5, -H], [16.5, FY, -1.5, PI], [-14, UY, 7, PI]])
      B.spawn(2, x, y, z, yaw, { field: true });
    for (const [x, y, z] of [[-70, 0, -36], [-55, 0, -36], [-45, 0, -18], [-28, 0, -20], [-27.5, 0, 14], [-27.5, 0, 30], [-12, 0.03, 30], [6, 0.03, 34], [22, 0.03, 30],
      [30.5, 0, 20], [30.5, 0, -3], [14, 0.15, -9], [-8, FY, -2], [8, FY, 3], [-15, FY, 16], [-5, FY, 23], [12.5, FY, 22.2], [18, FY, 10], [-16, UY, -3], [8, UY, 10], [17, UY, 8.5],
      [-6, UY, 19], [15, UY, 17], [0, FY, 10], [-16, FY, 7.5], [8.8, FY, 15.9]])
      B.spawn(0, x, y, z, Math.atan2(-x, -z));

    flushSigns(B);
}
