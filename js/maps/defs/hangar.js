/* LIVE FIRE — Terminal West (hangar): the airside of a small regional airport on a bright afternoon (fictional operator
   Westair Regional). HANGAR 2 with a narrow-body airliner in for maintenance (site A, west), the BAGGAGE HALL with its make-up
   carousel (site B, east), the apron with a second airliner on stand 3 (mid), the control tower base and the airside service
   road (south), the GSE workshop and yard (south-west), FUEL SERVICES garage (T1 lobby, south) and the Gate 3 lounge in the
   terminal (T2 lobby, north). Design notes: tools/test/out/notes-map-hangar.md (git-ignored).
   Plan (x east, z north): hangar x -80..-32, z -18..30 (+ annex z -30..-18); baggage hall x 34..78, z -2..38; concourse
   x -34..34, z 38..46; Gate 3 lounge x -12..12, z 46..64; apron x -34..80, z -40..38; road z -48..-41; tower base x -12..12,
   z -64..-50; GSE workshop x -78..-36, z -66..-52; fuel garage x -16..16, z -100..-74.
   Out of bounds: the taxiway and the runway beyond the south fence, hangar 1 to the west, the landside (car park, parking
   garage, town) to the north, cargo sheds to the east, low hills all round.
   Exports: default MapDef */
import { sign, refueler, tug, dolly, uld, stairsTruck, beltLoader, belt, carousel, controlTower, engineStand, toolChest,
  wingDock, edgeLights, windsock, skyline, rail } from '../kit_hangar.js';
import { Kit, emitKit } from '../props/kit.js';

const PI = Math.PI, HP = PI / 2;
const F = 0.15;            // building floors (apron slab top is .04)
const AP = 0.04;           // apron / road surface
const F2 = F + 3.6;        // hangar annex upper floor + mezzanine walkway
const FC = F + 3.4;        // baggage hall control room floor
const TB = F + 4.0;        // tower base roof deck
// The whole map (play area and out-of-bounds dressing, local x/z -330..330) is built in a frame offset by (OX, OZ) so it sits
// inside ONE 1024 m geometry chunk: one merged mesh per material instead of four (the world origin would split the map into
// four chunks), which keeps the draw calls near the budget. All coordinates in this file are local (plan above).
const OX = 340, OZ = 340;

// ------------------------------------------------------------------------------------------------ helpers
function wallX(B, x0, x1, z, o) {          // along +x; o.n = north face, o.s = south face; ops: [{ c (x centre), w, h, y, frame, glass }]
  return B.wall(x0, z, x1, z, { y: o.y || 0, h: o.h, t: o.t || 0.3, mat: o.n, mat2: o.s, matEnd: o.end || o.n,
    openings: (o.ops || []).map(p => ({ at: p.c - x0, w: p.w, h: p.h, y: p.y || 0, frame: p.frame === undefined ? false : p.frame, glass: p.glass })) });
}
function wallZ(B, z0, z1, x, o) {          // along +z; o.w = west face, o.e = east face; ops: [{ c (z centre), ... }]
  return B.wall(x, z0, x, z1, { y: o.y || 0, h: o.h, t: o.t || 0.3, mat: o.w, mat2: o.e, matEnd: o.end || o.w,
    openings: (o.ops || []).map(p => ({ at: p.c - z0, w: p.w, h: p.h, y: p.y || 0, frame: p.frame === undefined ? false : p.frame, glass: p.glass })) });
}
const nc = { collide: false, cast: false };
/** a painted line on the ground (apron markings): from (x0, z0) to (x1, z1), width w */
function line(B, x0, z0, x1, z1, w, mat = 'p_coat_yellow', y = AP) {
  const L = Math.hypot(x1 - x0, z1 - z0);
  B.box((x0 + x1) / 2, y, (z0 + z1) / 2, w, 0.006, L, { mat, ry: Math.atan2(x1 - x0, z1 - z0), collide: false, cast: false, receive: true });
}
function dashed(B, x0, z0, x1, z1, w, dash, gap, mat) {
  const L = Math.hypot(x1 - x0, z1 - z0), ux = (x1 - x0) / L, uz = (z1 - z0) / L;
  for (let u = 0; u + dash <= L; u += dash + gap) line(B, x0 + ux * u, z0 + uz * u, x0 + ux * (u + dash), z0 + uz * (u + dash), w, mat);
}
/** ceiling light panel (emissive, no light) */
const panelFx = (B, x, y, z, w = 0.6, d = 1.2, mat = 'emissive_white') => { B.box(x, y - 0.03, z, w + 0.06, 0.03, d + 0.06, { mat: 'p_coat_white', ...nc }); B.box(x, y - 0.04, z, w, 0.01, d, { mat, ...nc }); };
/** skirting along a wall face: x0..x1 at z (face 'n' | 's') or along z (face 'e' | 'w') */
function skirtX(B, x0, x1, z, y, face, mat = 'p_coat_black') { B.box((x0 + x1) / 2, y, z + (face === 'n' ? 0.02 : -0.02), x1 - x0, 0.1, 0.03, { mat, ...nc }); }
function skirtZ(B, z0, z1, x, y, face, mat = 'p_coat_black') { B.box(x + (face === 'e' ? 0.02 : -0.02), y, (z0 + z1) / 2, 0.03, 0.1, z1 - z0, { mat, ...nc }); }
/** a steel truss spanning z0..z1 at x (bottom chord at y), merged */
function truss(B, x, z0, z1, y, h) {
  const K = new Kit(3), L = z1 - z0, n = Math.round(L / 3);
  K.box('steel_dark', 0, 0, L / 2, 0.25, 0.25, L); K.box('steel_dark', 0, h - 0.25, L / 2, 0.25, 0.25, L);
  for (let i = 0; i <= n; i++) {
    const z = i * L / n; K.box('steel_dark', 0, 0.2, z, 0.12, h - 0.4, 0.12);
    if (i < n) { const z2 = (i + 1) * L / n; K.tube('steel_dark', [[0, i % 2 ? h - 0.2 : 0.2, z], [0, i % 2 ? 0.2 : h - 0.2, z2]], 0.05, { seg: 4 }); }
  }
  emitKit(B, K, x, y, z0, { cast: false }, 'hg_truss');
}

export default {
  id: 'hangar', name: 'Terminal West', desc: 'Regional airport airside: a maintenance hangar, the baggage hall and an apron with airliners.',
  size: 'L', chunk: 1024,
  env: { hdri: 'partly_cloudy', sky: 'hdri', time: 'day', exposure: 1.0, sun: { dir: [0.48, -0.72, 0.5], color: [1, 0.96, 0.9], intensity: 1.0 },
    fog: { color: [0.72, 0.78, 0.86], density: 0.0022 }, weather: 'clear', wind: [3, 1.5], ambience: 'hangar', reverb: 'outdoor', indoorIbl: 0.6 },
  bounds: { minX: -92 + OX, maxX: 96 + OX, minZ: -106 + OZ, maxZ: 68 + OZ, minY: -3, maxY: 40 },

  build(B) {
    B.push(OX, 0, OZ);
    try { buildLocal(B); } finally { B.pop(); }
  },
};

function buildLocal(B) {
    const r = () => B.rand();
    // ================================================================== ground, apron, roads
    const hills = (x, z) => {
      const d = Math.max(Math.abs(x) - 210, (z < 0 ? -z - 225 : z - 170), 0);
      return d > 0 ? Math.min(45, d * 0.5) * (0.6 + 0.4 * Math.sin(x * 0.017 + z * 0.023) * Math.cos(x * 0.006)) : 0;
    };
    B.ground({ minX: -330, maxX: 330, minZ: -330, maxZ: 280, res: 10, mat: 'grass', height: hills });
    // apron concrete (5 m slabs) and the hard-standing around the buildings
    B.floor(-34, -40, 80, 38, AP, { mat: 'concrete_panels', t: 0.1, uv: 2 });
    B.floor(-90, -40, -34, 30, AP, { mat: 'concrete_panels', t: 0.1, uv: 2 });                    // hangar forecourt + west lane
    B.floor(-90, 30, -34, 38, AP, { mat: 'concrete_floor', t: 0.1 });                              // service alley
    B.floor(78, -40, 94, 40, AP, { mat: 'asphalt', t: 0.1 });                                      // east lane
    // service road (2 x 3.5 m + verges) and the yards south of it
    B.floor(-92, -48, 96, -40, AP - 0.005, { mat: 'asphalt', t: 0.1 });
    dashed(B, -90, -44.5, 94, -44.5, 0.15, 3, 6, 'p_coat_white');
    line(B, -90, -47.6, 94, -47.6, 0.12, 'p_coat_white'); line(B, -90, -40.4, 94, -40.4, 0.25, 'p_coat_yellow');
    B.floor(-92, -104, 96, -48, AP - 0.01, { mat: 'concrete_floor', t: 0.1 });                     // GSE yard / depot hard-standing
    line(B, -34, -40, 80, -40, 0.2, 'p_coat_red');                                                  // apron edge (red: equipment line)

    // ================================================================== HANGAR 2 (site A)
    const HX0 = -80, HX1 = -32, HZ0 = -18, HZ1 = 30, HH = 14;
    B.floor(HX0, HZ0, HX1, HZ1, F, { mat: 'p_concrete_precast', t: 0.15 });
    // north wall: personnel double door to the service alley
    wallX(B, HX0, HX1, HZ1, { h: HH, n: 'corrugated', s: 'corrugated', ops: [{ c: -50, w: 1.8, h: 2.3, frame: 'steel_dark' }] });
    // south wall: workshop door, stair-hall door (ground) and the office door onto the mezzanine walkway; office windows over the floor
    wallX(B, HX0, -44, HZ0, { h: HH, n: 'corrugated', s: 'concrete_panels', ops: [
      { c: -70, w: 2.6, h: 3.0, frame: 'steel_dark' }, { c: -52, w: 1.4, h: 2.3, frame: 'steel_dark' },
      { c: -60, y: F2 - 0.05, w: 1.1, h: 2.25, frame: 'steel_dark' },
      { c: -74, y: F2 + 0.95, w: 2.2, h: 1.3 }, { c: -67, y: F2 + 0.95, w: 2.2, h: 1.3 }] });
    wallX(B, -44, HX1, HZ0, { h: HH, n: 'corrugated', s: 'corrugated' });
    wallZ(B, HZ0, HZ1, HX0, { h: HH, w: 'corrugated', e: 'corrugated' });
    // east: the hangar door header and the sliding leaves (gap z -2..10 = A main)
    B.box(HX1, 11.6, (HZ0 + HZ1) / 2, 0.6, HH - 11.6, HZ1 - HZ0 + 0.3, { mat: 'corrugated' });
    for (const [z0, z1, dx] of [[HZ0, -10, 0.2], [-10, -2, -0.25], [10, 18, -0.25], [18, HZ1, 0.2]]) {
      B.box(HX1 + dx, 0, (z0 + z1) / 2, 0.35, 11.6, z1 - z0 + 0.1, { mat: 'corrugated', mats: { e: 'corrugated', w: 'corrugated' } });
      B.box(HX1 + dx + (dx > 0 ? 0.2 : -0.2), 0, (z0 + z1) / 2, 0.05, 0.25, z1 - z0, { mat: 'rubber', ...nc });
      for (let z = z0 + 2; z < z1 - 1; z += 4) B.box(HX1 + dx + (dx > 0 ? 0.19 : -0.19), 0.3, z, 0.04, 11, 0.12, { mat: 'steel_dark', ...nc });
      B.box(HX1 + dx + 0.2, 2.6, (z0 + z1) / 2, 0.03, 0.7, z1 - z0 - 0.2, { mat: 'p_coat_blue', ...nc });
      B.box(HX1 + dx + 0.2, 3.35, (z0 + z1) / 2, 0.03, 0.15, z1 - z0 - 0.2, { mat: 'p_coat_yellow', ...nc });
    }
    B.box(HX1, 0, 4, 0.5, 0.04, 12, { mat: 'steel_dark', collide: false });                         // door track in the floor
    // dado and cladding trims outside, roof, gutters
    for (const [x0, x1, z, f] of [[HX0, HX1, HZ1, 1], [-44, HX1, HZ0, -1]]) B.box((x0 + x1) / 2, 0, z + f * 0.17, x1 - x0, 2.4, 0.06, { mat: 'concrete_panels', ...nc });
    B.box(HX0 - 0.17, 0, (HZ0 + HZ1) / 2, 0.06, 2.4, HZ1 - HZ0, { mat: 'concrete_panels', ...nc });
    B.box((HX0 + HX1) / 2, HH, (HZ0 + HZ1) / 2, HX1 - HX0 + 1.0, 0.35, HZ1 - HZ0 + 1.0, { mat: 'p_coat_slate', mats: { t: 'corrugated', b: 'corrugated' } });
    B.box((HX0 + HX1) / 2, HH + 0.35, (HZ0 + HZ1) / 2, HX1 - HX0 - 2, 0.9, 6, { mat: 'corrugated', collide: false });   // ridge
    for (const z of [HZ0 - 0.55, HZ1 + 0.55]) B.box((HX0 + HX1) / 2, HH - 0.25, z, HX1 - HX0 + 1, 0.25, 0.25, { mat: 'steel_dark', ...nc });
    for (const x of [-78, -56, -34.5]) for (const z of [HZ1 + 0.6]) B.box(x, 0, z, 0.14, HH - 0.2, 0.14, { mat: 'steel_dark', ...nc });   // downpipes
    sign(B, 'hangar2', -56, 12.4, HZ1 + 0.2, 20, 5, { face: 'n' });
    sign(B, 'hangar2', HX1 + 0.33, 12.8, 4, 4.8, 1.2, { face: 'e' });
    sign(B, 'airside', -46.2, 2.0, HZ1 + 0.2, 1.2, 0.3, { face: 'n' });
    // structure: trusses, columns, purlins, inner dado, high-bay lights
    for (let x = HX0 + 4; x < HX1; x += 8) {
      truss(B, x, HZ0 + 0.2, HZ1 - 0.2, 11.8, 2.0);
      for (const z of [HZ0 + 0.35, HZ1 - 0.35]) B.box(x, F, z, 0.4, 11.65, 0.3, { mat: 'steel_dark', collide: false });
    }
    for (let z = HZ0 + 3; z < HZ1; z += 6) B.box((HX0 + HX1) / 2, 13.7, z, HX1 - HX0 - 0.6, 0.18, 0.12, { mat: 'steel_dark', ...nc });
    // daylight: a translucent polycarbonate band high on the walls and roof-light strips between the trusses
    B.box((HX0 + HX1) / 2, 9.2, HZ1 - 0.17, HX1 - HX0 - 0.6, 1.8, 0.02, { mat: 'p_em_dim', ...nc });
    B.box((HX0 + HX1) / 2, 9.2, HZ1 + 0.17, HX1 - HX0, 1.8, 0.02, { mat: 'p_plastic_milky', ...nc });
    B.box(HX0 + 0.17, 9.2, (HZ0 + HZ1) / 2, 0.02, 1.8, HZ1 - HZ0 - 0.6, { mat: 'p_em_dim', ...nc });
    B.box(HX0 - 0.17, 9.2, (HZ0 + HZ1) / 2, 0.02, 1.8, HZ1 - HZ0, { mat: 'p_plastic_milky', ...nc });
    B.box((HX0 + HX1) / 2, 9.2, HZ0 + 0.17, HX1 - HX0 - 0.6, 1.8, 0.02, { mat: 'p_em_dim', ...nc });
    B.box((-44 + HX1) / 2, 9.2, HZ0 - 0.17, HX1 + 44, 1.8, 0.02, { mat: 'p_plastic_milky', ...nc });
    B.box(HX0 / 2 - 22, 9.2, HZ0 - 0.17, 36, 1.8, 0.02, { mat: 'p_plastic_milky', ...nc });
    for (let x = HX0 + 8; x < HX1 - 1; x += 8) B.box(x, HH - 0.02, (HZ0 + HZ1) / 2, 1.4, 0.02, HZ1 - HZ0 - 4, { mat: 'p_em_dim', ...nc });
    B.box((HX0 + HX1) / 2, F, HZ1 - 0.17, HX1 - HX0 - 0.6, 1.2, 0.04, { mat: 'p_coat_slate', ...nc });
    B.box(HX0 + 0.17, F, (HZ0 + HZ1) / 2, 0.04, 1.2, HZ1 - HZ0 - 0.6, { mat: 'p_coat_slate', ...nc });
    B.box((-44 + HX1) / 2, F, HZ0 + 0.17, HX1 + 44 - 0.4, 1.2, 0.04, { mat: 'p_coat_slate', ...nc });
    for (const [x, z] of [[-70, -4], [-56, -6], [-42, -4], [-70, 18], [-56, 20], [-42, 18]]) {
      B.light({ type: 'spot', x, y: 11.6, z, dir: [0, -1, 0], angle: 2.0, intensity: 1500, range: 30, color: [1, 0.95, 0.86], fixture: false });
    }
    for (let x = -74; x < HX1; x += 7) for (const z of [-6, 6, 18]) {
      B.cyl(x, 11.3, z, 0.32, 0.45, { mat: 'steel_dark', collide: false, sides: 10 });
      B.cyl(x, 11.28, z, 0.28, 0.03, { mat: 'emissive_white', collide: false, sides: 10 });
    }
    // floor markings: aircraft parking box, walkways, centreline
    for (const [x0, z0, x1, z1] of [[-77, -13.5, -36, -13.5], [-77, 25.5, -36, 25.5], [-77, -13.5, -77, 25.5]]) line(B, x0, z0, x1, z1, 0.15, 'p_coat_yellow', F);
    line(B, -78, 6, -33, 6, 0.12, 'p_coat_yellow', F);
    for (let x = -78; x < -34; x += 2.5) line(B, x, -15.8, x + 1.2, -15.8, 0.1, 'p_coat_white', F);
    // the airliner in for maintenance (gear on the floor, nose east)
    B.prop('airliner', -58, F, 6, { ry: HP, hide: true });
    // maintenance docks: tail dock, nose stairs; engine work stand
    wingDock(B, -68, -1.6, { y: F, h: 2.4, w: 3.0, d: 2.2, rails: ['s', 'e', 'w'] });
    wingDock(B, -41.5, 2.0, { y: F, h: 1.9, w: 2.2, d: 1.8, ry: 0, rails: ['s', 'e', 'w'] });
    // site A cover: engine on a cradle, tool chests, tyre stack, GPU, parts crates
    engineStand(B, -64, -6.5, { y: F });
    toolChest(B, -51.5, -1.5, { y: F, ry: 0.4 }); toolChest(B, -61, 14.5, { y: F, ry: PI }); toolChest(B, -48, 13, { y: F, ry: -2.2, paint: 'p_coat_blue' });
    for (const [x, z, n] of [[-55.5, 15.5, 3], [-56.3, 16.6, 2]]) for (let i = 0; i < n; i++) B.cyl(x, F + i * 0.36, z, 0.58, 0.35, { mat: 'rubber', sides: 18 });
    B.prop('generator', -47, F, -6.5, { variant: 'trailer', ry: HP });
    B.prop('crate', -66, F, 15.6, { variant: 'large', ry: 0.2 }); B.prop('crate', -64.6, F, 16.2, { variant: 'medium', ry: -0.3 });
    B.prop('crate_stack', -49, F, 22.5, { ry: PI, hide: true });
    B.prop('pallet', -45.5, F, 23.5, { variant: 'wrap', stack: 2 });
    B.prop('drum', -78.6, F, -16.6, { variant: 'blue', n: 3 }); B.prop('drum', -78.6, F, 13.5, { variant: 'red', n: 2 });
    B.prop('gas_cylinder', -36.5, F, 27.8, { rack: true });
    B.prop('ladder', -73, F, 1.4, { variant: 'step', ry: 0.3 });
    B.prop('pallet_jack', -38, F, 22, { variant: 'yellow', ry: 1.2 });
    tug(B, -38, -10, { y: F, ry: -HP + 0.2, paint: 'p_coat_white' });
    B.prop('cone', -40.5, F, -0.5); B.prop('cone', -40.5, F, 12.5); B.prop('cone', -52, F, -11.2); B.prop('cone', -52, F, 23.2);
    // parts racking along the north wall + parts stores in the north-west corner
    B.prop('rack', -64, F, HZ1 - 1.0, { bays: 2, levels: 3, ry: PI, load: 0.7 }); B.prop('rack', -56, F, HZ1 - 1.0, { bays: 2, levels: 3, ry: PI, load: 0.5 });
    wallX(B, HX0 + 0.15, -70, 22, { y: F, h: 3.1, n: 'p_coat_slate', s: 'p_coat_slate', ops: [{ c: -73, w: 1.2, h: 2.2, frame: 'steel_dark' }] });
    wallZ(B, 22, HZ1 - 0.15, -70, { y: F, h: 3.1, w: 'p_coat_slate', e: 'p_coat_slate' });
    B.floor(HX0 + 0.15, 22, -69.85, HZ1 - 0.15, F + 3.25, { mat: 'metal_plate', t: 0.15 });
    sign(B, 'stores', -73, F + 2.6, 21.83, 1.4, 0.35, { face: 's' });
    B.prop('shelf_unit', -77.6, F, 27.4, { ry: PI, w: 1.8 }); B.prop('shelf_unit', -73.5, F, 27.4, { ry: PI, w: 1.8, variant: 'grey' });
    B.prop('lockers', -79.4, F, 24.5, { ry: HP, n: 3, variant: 'grey' });
    B.light({ x: -75, y: F + 3.1, z: 26, intensity: 45, fixture: 'tube', color: [0.9, 0.95, 1] });
    B.hide(-71, F, 27.5, { kind: 'closet' });

    // mezzanine walkway along the south wall (y F2) with a stair down at the east end
    B.floor(HX0 + 0.15, HZ0 + 0.15, -50, HZ0 + 2.55, F2, { mat: 'grate', t: 0.12, mats: { b: 'steel_dark' } });
    for (let x = -78; x <= -52; x += 6.5) B.box(x, F, HZ0 + 2.35, 0.2, F2 - F - 0.12, 0.2, { mat: 'steel_dark' });
    rail(B, HX0 + 0.2, HZ0 + 2.5, -50, HZ0 + 2.5, F2, { mat: 'p_coat_yellow' });
    B.stairs({ x: -47.15, z: HZ0 + 1.0, w: 1.4, len: 5.7, y0: F, y1: F2, dir: '-x', mat: 'steel_dark', tread: 'grate', rail: 'right', railMat: 'p_coat_yellow' });
    B.hide(-79, F2, -16.8, { kind: 'dark' });

    // ================================================================== HANGAR ANNEX (workshop, stair hall; offices above)
    const AZ0 = -30;
    B.floor(HX0, AZ0, -44, HZ0, F, { mat: 'concrete_floor', t: 0.15 });
    wallX(B, HX0, -44, AZ0, { h: 7.0, n: 'plaster', s: 'brick', ops: [
      { c: -66, w: 3.6, h: 3.2, frame: 'steel_dark' }, { c: -46, w: 1.6, h: 2.3, frame: 'steel_dark' },
      { c: -75, y: 1.0, w: 1.8, h: 1.4, glass: true }, { c: -58, y: 1.0, w: 1.4, h: 1.4, glass: true },
      { c: -76, y: F2 + 0.9, w: 2.4, h: 1.4, glass: true }, { c: -70, y: F2 + 0.9, w: 2.4, h: 1.4, glass: true }, { c: -64, y: F2 + 0.9, w: 2.4, h: 1.4, glass: true },
      { c: -52, y: F2 + 0.9, w: 1.6, h: 1.4, glass: true }] });
    wallZ(B, AZ0, HZ0, HX0, { h: 7.0, w: 'brick', e: 'plaster' });
    wallZ(B, AZ0, HZ0, -44, { h: 7.0, w: 'plaster', e: 'brick', ops: [{ c: -24, y: 1.0, w: 1.6, h: 1.3, glass: true }] });
    // ground partition workshop | stair hall
    wallZ(B, AZ0 + 0.15, HZ0 - 0.15, -58, { y: F, h: F2 - F - 0.1, w: 'plaster_white', e: 'plaster_white', ops: [{ c: -21, w: 1.2, h: 2.2, frame: 'wood_dark' }] });
    // upper floor slab (stairwell hole x -54..-47.6 along the south wall)
    const slab = { mat: 'carpet', t: 0.2, mats: { b: 'plaster_white' } };
    B.floor(HX0 + 0.15, AZ0 + 1.85, -44.15, HZ0 - 0.15, F2, slab);
    B.floor(HX0 + 0.15, AZ0 + 0.15, -54, AZ0 + 1.85, F2, slab);
    B.floor(-47.55, AZ0 + 0.15, -44.15, AZ0 + 1.85, F2, slab);
    B.stairs({ x: -50.8, z: AZ0 + 1.0, w: 1.6, len: 6.4, y0: F, y1: F2, dir: '-x', mat: 'concrete', tread: 'concrete_dark', rail: 'left', railMat: 'steel_dark' });
    B.box(-50.8, F2, AZ0 + 1.88, 6.4, 1.0, 0.05, { mat: 'steel_dark', ray: false });              // stairwell guard rail
    // upper partition office | landing, roof
    wallZ(B, AZ0 + 0.15, HZ0 - 0.15, -56, { y: F2, h: 2.9, w: 'plaster_white', e: 'plaster_white', ops: [{ c: -22.5, w: 1.0, h: 2.1, frame: 'wood_dark' }] });
    B.floor(HX0 - 0.3, AZ0 - 0.3, -43.7, HZ0, 7.2, { mat: 'concrete_dark', t: 0.3, mats: { b: 'ceiling_tile' } });
    B.box(-62, 7.2, AZ0 - 0.2, 36.6, 0.4, 0.2, { mat: 'concrete', collide: false });                // parapet coping
    sign(B, 'tech', -66, 4.4, AZ0 - 0.18, 5, 1.25, { face: 's' });
    // workshop dressing (ground, x -80..-58)
    B.prop('lockers', -73, F, -29.6 + 0.3, { n: 5, variant: 'blue', bench: true });
    B.hide(-76.5, F, -28.8, { kind: 'closet' });
    B.prop('shelf_unit', -79.4, F, -24.3, { ry: HP, w: 2.0 }); B.prop('shelf_unit', -79.4, F, -27.6, { ry: HP, w: 2.0, variant: 'grey' });
    B.box(-63, F, -19.0, 4.0, 0.92, 0.9, { mat: 'wood_dark', mats: { t: 'metal_plate' } });            // workbench
    B.prop('crate', -60, F, -19.3, { variant: 'small' });
    toolChest(B, -59, -26, { y: F, ry: -HP });
    engineStand(B, -68, -24, { y: F, ry: HP });
    B.prop('drum', -61, F, -29, { variant: 'yellow', n: 2 });
    B.box(-79.4, F, -20.5, 0.9, 0.92, 4.0, { mat: 'wood_dark', mats: { t: 'metal_plate' } });              // bench along the west wall
    B.box(-79.6, F + 0.92, -20.5, 0.3, 1.2, 4.0, { mat: 'p_coat_slate', collide: false });                // tool board
    for (let i = 0; i < 6; i++) B.box(-79.42, F + 1.15 + (i % 3) * 0.3, -22 + i * 0.55, 0.06, 0.2, 0.08, { mat: i % 2 ? 'p_coat_red' : 'steel', ...nc });
    B.box(-63, F + 0.92, -19.2, 0.25, 0.2, 0.18, { mat: 'p_coat_blue', ...nc });                            // vise
    B.box(-75.5, F, -19.0, 1.0, 0.95, 0.75, { mat: 'p_coat_red' }); B.box(-75.5, F + 0.95, -19.0, 1.0, 0.5, 0.05, { mat: 'p_coat_red', collide: false });   // parts washer
    B.cyl(-72.6, F, -19.2, 0.18, 1.7, { mat: 'p_coat_slate', sides: 10 }); B.box(-72.6, F + 1.3, -19.4, 0.5, 0.45, 0.5, { mat: 'p_coat_slate', collide: false });   // drill press
    for (const [x, z] of [[-66, -28.6], [-64.6, -28.6], [-63.2, -28.6]]) for (let i = 0; i < 2; i++) B.cyl(x, F + i * 0.36, z, 0.58, 0.35, { mat: 'rubber', sides: 18 });
    B.prop('poster', -71, F + 1.4, -18.17, { ry: PI, i: 5 }); B.prop('wall_clock', -66, F2 - 0.7, -18.17, { ry: PI });
    sign(B, 'stores', -66, F + 2.6, -18.17, 1.4, 0.35, { face: 's' });
    B.prop('fire_extinguisher', -57.85, F, -27.5, { ry: -HP });
    B.light({ x: -69, y: F2 - 0.2, z: -24, intensity: 65, fixture: 'tube', color: [0.92, 0.96, 1] });
    for (const x of [-75, -63]) panelFx(B, x, F2 - 0.2, -24, 0.3, 2.4);
    // stair hall dressing
    B.prop('vending_machine', -45.0, F, -21.5, { ry: -HP }); B.prop('bench', -55.6, F, -21.2, { variant: 'metal', ry: HP });
    B.prop('poster', -57.8, F + 1.3, -24, { ry: HP, i: 2 });
    B.prop('fire_extinguisher', -44.2, F, -27, { ry: -HP });
    // upper offices (x -80..-56) and landing (x -56..-44)
    B.prop('desk', -76.5, F2, -26.8, { ry: 0 }); B.prop('office_chair', -76.5, F2, -26.0, { ry: PI });
    B.prop('desk', -70.5, F2, -26.8, { ry: 0, variant: 'metal' }); B.prop('office_chair', -70.3, F2, -26.0, { ry: PI - 0.3 });
    B.prop('monitor', -76.5, F2 + 0.75, -27.1, {}); B.prop('monitor', -70.5, F2 + 0.75, -27.1, { on: false });
    B.prop('filing_cabinet', -79.5, F2, -21, { ry: HP }); B.prop('filing_cabinet', -79.5, F2, -20.4, { ry: HP, color: 'beige' });
    B.prop('whiteboard', -64, F2 + 1.0, -29.84, { w: 2.4 }); B.prop('sofa', -60, F2, -28.8, { variant: 'grey', seats: 2 });
    wallX(B, -66, -56.15, -23.0, { y: F2, h: 2.9, t: 0.12, n: 'plaster_white', s: 'plaster_white', ops: [{ c: -61, y: 0.9, w: 6, h: 1.4, glass: true }, { c: -65, w: 1.0, h: 2.1, frame: 'wood_dark' }] });
    B.prop('dining_table', -61, F2, -20.6, { variant: 'dark', chairs: 6, w: 2.4 });
    B.prop('desk', -76.5, F2, -20.4, { ry: PI }); B.prop('office_chair', -76.5, F2, -21.2, {}); B.prop('monitor', -76.5, F2 + 0.75, -20.1, { ry: PI });
    B.prop('desk', -70.5, F2, -20.4, { ry: PI, variant: 'metal' }); B.prop('office_chair', -70.5, F2, -21.3, { ry: 0.3 });
    B.prop('planter', -67.6, F2, -26.8, { len: 0.8 }); B.prop('filing_cabinet', -73.5, F2, -29.4, { color: 'grey' }); B.prop('filing_cabinet', -73.0, F2, -29.4, { color: 'grey', open: 1 });
    B.box(-79.5, F2, -25.2, 0.55, 1.0, 0.45, { mat: 'p_plastic_grey' }); B.cyl(-79.5, F2, -23.8, 0.16, 1.15, { mat: 'p_plastic_milky', sides: 12 });
    B.prop('bookshelf', -56.35, F2, -21, { ry: -HP, variant: 'metal' });
    B.prop('wall_clock', -68, F2 + 2.2, -18.17, { ry: PI });
    B.light({ x: -68, y: F2 + 2.9, z: -24, intensity: 50, fixture: 'panel', color: [1, 0.92, 0.8] });
    for (const [x, z] of [[-75, -26], [-62, -26], [-50, -22]]) panelFx(B, x, F2 + 2.9, z);
    B.prop('armchair', -46, F2, -26, { ry: -2.3, variant: 'teal' }); B.prop('coffee_table', -48, F2, -24.5, {});
    B.hide(-45.2, F2, -19.2, { kind: 'dark' });

    // ================================================================== west lane + service alley (behind the hangar)
    B.prop('fence_chainlink', -90, AP, -33, { variant: 'barbed', ry: HP, len: 143, h: 2.6 });
    B.prop('fence_chainlink', -84.5, AP, 38.5, { variant: 'barbed', len: 11, h: 2.6 });
    B.prop('fence_chainlink', -71.5, AP, 38.5, { variant: 'barbed', len: 3, h: 2.6 });
    B.prop('gate', -76, AP, 38.5, { variant: 'chainlink', len: 6 });
    // apron ops building (solid mass) along the alley's north side
    B.box(-52, 0, 44.15, 36, 8.0, 12.0, { mat: 'concrete_panels', mats: { t: 'concrete_dark', s: 'concrete_panels' } });
    for (let x = -68; x <= -38; x += 5) { B.box(x, 4.4, 38.13, 3.4, 1.6, 0.04, { mat: 'p_glass_dark', ...nc }); B.box(x, 4.3, 38.0, 3.6, 0.1, 0.3, { mat: 'concrete', ...nc }); }
    B.box(-52, 8.0, 38.3, 36, 0.5, 0.3, { mat: 'concrete_dark', collide: false });
    sign(B, 'ops', -52, 6.6, 38.12, 5.5, 1.4, { face: 's' });
    B.box(-62, 0, 38.0, 1.2, 2.3, 0.08, { mat: 'p_coat_white', ...nc });                               // service door (locked)
    B.prop('ac_unit', -44, AP, 37.4, { variant: 'condenser', ry: PI }); B.prop('ac_unit', -42.6, AP, 37.4, { variant: 'condenser', ry: PI });
    B.prop('dumpster', -66, AP, 36.7, { variant: 'green', ry: PI, hide: true });
    B.prop('dumpster', -70, AP, 36.7, { variant: 'blue', ry: PI });
    B.prop('pallet', -57, AP, 36.6, { stack: 5 }); B.prop('pallet', -55.6, AP, 36.6, { stack: 3, variant: 'boxes' });
    B.prop('box_truck', -82, AP, 34, { variant: 'logo', ry: HP + 0.05, hide: true });
    B.prop('wheelie_bin', -45, AP, 31.0, { variant: 'grey' }); B.prop('wheelie_bin', -44.2, AP, 31.0, { variant: 'green' });
    B.prop('gas_cylinder', -38, AP, 31.0, { variant: 'propane', n: 3 });
    B.prop('crate_stack', -84.5, AP, 18, { ry: -HP, hide: true });
    B.prop('grass_tall', -86.5, AP, -6, { variant: 'dry', w: 3, d: 8, hide: true });
    B.prop('drum', -84.8, AP, -20, { variant: 'rust', n: 3, fallen: true });
    B.prop('pallet', -85, AP, 4, { stack: 4, variant: 'none' });
    // west lane: a wall-mounted light and signs on the hangar back
    B.prop('light_fixture', -80.3, 5.0, 10, { variant: 'wall', ry: -HP });

    // ================================================================== hangar forecourt (apron west of the hangar door)
    for (let x = -88; x < -34; x += 6) line(B, x, -36, x + 3, -36, 0.15, 'p_coat_white');
    B.prop('jersey_barrier', -40, AP, -34, { len: 3 }); B.prop('jersey_barrier', -36.8, AP, -34, { len: 3 });
    tug(B, -74, -36, { ry: HP }); dolly(B, -78.5, -36, { ry: HP, seed: 3 });
    B.prop('cone', -46, AP, -33); B.prop('cone', -44.4, AP, -33.2, { variant: 'small' });
    B.prop('street_light', -60, AP, -39.2, { variant: 'double', on: false, h: 9 });

    // ================================================================== TERMINAL: concourse, Gate 3 lounge (T2), solid masses
    const CX0 = -34, CX1 = 34, CZ0 = 38, CZ1 = 46, CH = 3.6;
    B.floor(CX0, CZ0, CX1, CZ1, F, { mat: 'marble', t: 0.15 });
    // apron facade: glass curtain wall with two doors
    {
      const doors = [-28, -10], y0 = 0.5, y1 = CH + F;
      let xs = CX0;
      for (const d of doors.concat([CX1 + 2])) { const xe = Math.min(CX1, d - 2); if (xe > xs) B.box((xs + xe) / 2, 0, CZ0, xe - xs, y0, 0.3, { mat: 'concrete' }); xs = d + 2; }
      for (let x = CX0; x < CX1 - 0.01; x += 2) {
        const xc = x + 1, isDoor = doors.some(d => Math.abs(d - xc) < 1.01);
        if (!isDoor) B.box(xc, y0, CZ0, 1.96, y1 - y0, 0.03, { mat: 'glass', surf: 'glass', cast: false });
        B.box(x, 0, CZ0, 0.12, y1 + 0.2, 0.2, { mat: 'steel_dark', collide: false });
        B.box(xc, y0, CZ0, 2, 0.06, 0.22, { mat: 'steel_dark', ...nc });
      }
      for (const d of doors) B.box(d, F - 0.02, CZ0, 4.0, 0.03, 0.4, { mat: 'steel', collide: false });
    }
    B.box(0, CH + F, CZ0, CX1 - CX0 + 0.3, 7.6 - CH - F, 0.3, { mat: 'concrete_panels', mats: { s: 'p_coat_slate' } });
    B.box(0, 7.6, CZ0 + 4, CX1 - CX0 + 1.2, 0.4, 9.0, { mat: 'concrete_dark', mats: { b: 'p_coat_slate' } });   // roof + canopy edge
    B.box(0, CH + F, CZ0 - 1.2, CX1 - CX0, 0.25, 2.4, { mat: 'p_coat_slate', collide: false });            // canopy over the doors
    sign(B, 'twest', -10, 5.7, CZ0 - 0.17, 12, 1.5, { face: 's' });
    sign(B, 'gate3', -10, 3.0, CZ0 - 0.17, 1.6, 0.4, { face: 's' });
    // concourse back wall with the two lobby gates, end walls
    wallX(B, CX0, CX1, CZ1, { h: 7.6, n: 'plaster_white', s: 'plaster_white', ops: [{ c: -6, w: 2.4, h: 2.6 }, { c: 6, w: 2.4, h: 2.6 }] });
    wallZ(B, CZ0 + 0.15, CZ1 - 0.15, CX0, { h: 7.6, w: 'concrete_panels', e: 'plaster_white' });
    wallZ(B, CZ0, 48, CX1, { h: 7.6, w: 'plaster_white', e: 'plaster_white', ops: [{ c: 42, w: 1.4, h: 2.3, frame: 'steel_dark' }] });
    B.floor(CX0 + 0.15, CZ0 + 0.15, CX1 - 0.15, CZ1 - 0.15, F + CH + 0.15, { mat: 'concrete', t: 0.15, mats: { b: 'ceiling_tile' } });
    skirtX(B, CX0 + 0.15, CX1 - 0.15, CZ1 - 0.17, F, 's', 'wood_dark');
    for (let x = -30; x <= 30; x += 6) panelFx(B, x, F + CH, 42, 0.6, 1.2);
    B.light({ x: -18, y: F + CH - 0.35, z: 42, intensity: 50, fixture: false, color: [1, 0.95, 0.88] });
    B.light({ x: 18, y: F + CH - 0.35, z: 42, intensity: 50, fixture: false, color: [1, 0.95, 0.88] });
    // concourse dressing: seats facing the apron, bins, columns, a desk, a vending row, signs
    for (const x of [-24, -18, 14, 20, 26]) B.prop('bench', x, F, 40.6, { variant: 'metal', len: 3.0, ry: PI });
    for (const x of [-22, 0, 22]) B.box(x, F, 44.6, 0.5, CH, 0.5, { mat: 'concrete' });
    B.prop('litter_bin', -15.5, F, 44.9, { variant: 'square' }); B.prop('litter_bin', 15.5, F, 44.9, { variant: 'square' });
    B.prop('vending_machine', -31.5, F, 45.3, { ry: PI }); B.prop('vending_machine', -30.4, F, 45.3, { ry: PI, variant: 'snacks' });
    B.prop('atm', 31.3, F, 45.6, { variant: 'kiosk', ry: PI });
    sign(B, 'exit', 0, F + 2.6, CZ1 - 0.17, 0.6, 0.22, { face: 's', lit: true });
    B.prop('poster', -27, F + 1.2, CZ1 - 0.16, { ry: PI, i: 0 }); B.prop('poster', 28, F + 1.2, CZ1 - 0.16, { ry: PI, i: 4 });
    B.prop('planter', -4, F, 39.5, { len: 1.5 }); B.prop('planter', 9, F, 39.5, { len: 1.5 });
    // Gate 3 lounge (T2 lobby): x -12..12, z 46..64
    const LZ1 = 64;
    B.floor(-12, CZ1, 12, LZ1, F, { mat: 'carpet', t: 0.15 });
    wallZ(B, CZ1 + 0.15, LZ1 - 0.15, -12, { h: 7.6, w: 'plaster', e: 'plaster_white' });
    wallZ(B, CZ1 + 0.15, LZ1 - 0.15, 12, { h: 7.6, w: 'plaster_white', e: 'plaster' });
    wallX(B, -12.15, 12.15, LZ1, { h: 7.6, n: 'concrete_panels', s: 'plaster_white', ops: [-8, -3, 3, 8].map(c => ({ c, y: 0.9, w: 3.6, h: 2.2, glass: true })) });
    B.floor(-11.85, CZ1 + 0.15, 11.85, LZ1 - 0.15, F + CH + 0.15, { mat: 'concrete', t: 0.15, mats: { b: 'ceiling_tile' } });
    B.box(0, 7.6, 56, 26, 0.4, 20, { mat: 'concrete_dark', collide: false });
    for (const z of [50, 54, 58]) for (const x of [-7.5, 0, 7.5]) {
      B.prop('bench', x, F, z, { variant: 'metal', len: 3.6, ry: 0 }); B.prop('bench', x, F, z + 1.0, { variant: 'metal', len: 3.6, ry: PI });
    }
    B.box(-9.5, F, 61.6, 3.2, 1.05, 0.8, { mat: 'wood_dark', mats: { t: 'marble' } });                  // gate desk
    B.prop('monitor', -10, F + 1.05, 61.7, { ry: PI });
    sign(B, 'fids', -2, F + 2.3, LZ1 - 0.17, 2.4, 1.2, { face: 's', glow: true });
    sign(B, 'gate3', 6, F + 2.6, LZ1 - 0.17, 2.4, 0.6, { face: 's', lit: true });
    B.prop('vending_machine', 11.0, F, 62.6, { ry: -HP }); B.prop('planter', 10.5, F, 47.2, { len: 1.2, ry: HP });
        for (const [x, z] of [[-6, 52], [6, 52], [-6, 59], [6, 59]]) panelFx(B, x, F + CH, z);
    B.light({ x: -5, y: F + CH - 0.35, z: 55, intensity: 45, fixture: false, color: [1, 0.93, 0.84] });
    B.light({ x: 5, y: F + CH - 0.35, z: 55, intensity: 45, fixture: false, color: [1, 0.93, 0.84] });
    B.lobby(2, { x0: -11.8, z0: CZ1 + 0.2, x1: 11.8, z1: LZ1 - 0.2, y: F }, [{ x: -6, z: CZ1, w: 2.4, h: 2.6 }, { x: 6, z: CZ1, w: 2.4, h: 2.6 }]);
    for (let i = 0; i < 6; i++) for (const z of [48.3, 62.6]) B.spawn(2, -8.75 + i * 3.5, F, z, PI);
    // solid terminal masses (offices, check-in hall) behind the concourse and over the baggage hall
    B.box(-23.1, 0, 56.1, 21.6, 7.6, 19.8, { mat: 'concrete_panels', mats: { t: 'concrete_dark' } });
    B.box(23.3, 0, 56.1, 22.0, 7.6, 19.8, { mat: 'concrete_panels', mats: { t: 'concrete_dark' } });
    B.box(46 + 16.15, 0, 52.15, 32.3, 9.5, 28.0, { mat: 'concrete_panels', mats: { t: 'concrete_dark', s: 'concrete_panels' } });
    B.box(40.15, 0, 57.15, 11.7, 9.5, 18.0, { mat: 'concrete_panels', mats: { t: 'concrete_dark' } });
    for (let x = -32; x <= 30; x += 4) if (Math.abs(x) > 13) B.box(x, 2.0, 66.2, 2.6, 3.2, 0.06, { mat: 'p_glass_dark', ...nc });
    sign(B, 'twest', 0, 6.4, 66.25, 14, 1.75, { face: 'n' });

    // ================================================================== BAGGAGE HALL (site B)
    const BX0 = 34, BX1 = 78, BZ0 = -2, BZ1 = 38, BH = 6.6;
    B.floor(BX0, BZ0, BX1, BZ1, F, { mat: 'p_concrete_precast', t: 0.15 });
    wallZ(B, BZ0, CZ0, BX0, { h: BH, w: 'concrete_panels', e: 'concrete_panels', ops: [{ c: 6, w: 4.2, h: 3.4, frame: 'hazard' }, { c: 26, w: 4.2, h: 3.4, frame: 'hazard' }] });
    wallX(B, BX0, BX1, BZ0, { h: BH, n: 'concrete_panels', s: 'concrete_panels', ops: [{ c: 70, w: 3.2, h: 3.2, frame: 'hazard' }, { c: 50, y: 3.8, w: 6, h: 1.0, glass: true }] });
    wallZ(B, BZ0, CZ0, BX1, { h: BH, w: 'concrete_panels', e: 'concrete_panels', ops: [{ c: 8, y: 3.8, w: 8, h: 1.0, glass: true }, { c: 24, y: 3.8, w: 8, h: 1.0, glass: true }] });
    wallX(B, BX0 + 0.15, BX1, CZ0, { h: BH, n: 'plaster_white', s: 'concrete_panels', ops: [{ c: 40, w: 1.3, h: 2.3, frame: 'steel_dark' }, { c: 66, y: 3.0, w: 1.4, h: 1.0 }] });
    B.floor(BX0 - 0.3, BZ0 - 0.3, BX1 + 0.3, BZ1, BH + 0.3, { mat: 'concrete_dark', t: 0.3, mats: { b: 'corrugated' } });
    B.box((BX0 + BX1) / 2, 0, BZ0 - 0.17, BX1 - BX0 + 0.3, 0.6, 0.05, { mat: 'concrete_dark', ...nc });
    B.box(BX0 - 0.17, 0, 18, 0.05, 0.6, BZ1 - BZ0 + 0.3, { mat: 'concrete_dark', ...nc });
    B.box(BX1 + 0.17, 0, 18, 0.05, 0.6, BZ1 - BZ0 + 0.3, { mat: 'concrete_dark', ...nc });
    for (const x of [36, 48, 60, 76]) B.box(x, 0, BZ0 - 0.25, 0.12, BH + 0.2, 0.12, { mat: 'p_galv', ...nc });           // downpipes
    for (const z of [0, 16, 36]) B.box(BX0 - 0.25, 0, z, 0.12, BH + 0.2, 0.12, { mat: 'p_galv', ...nc });
    for (const z of [-1, 12, 26, 37]) B.box(BX1 + 0.25, 0, z, 0.12, BH + 0.2, 0.12, { mat: 'p_galv', ...nc });
    for (const [x, z, ry] of [[70, BZ0 - 0.2, PI], [BX0 - 0.2, 6, -HP], [BX0 - 0.2, 26, -HP]]) B.prop('light_fixture', x, 4.0, z, { variant: 'wall', ry });
    for (const dx of [-2.1, 2.1]) B.prop('bollard', 70 + dx, AP, BZ0 - 0.6, { variant: 'yellow' });
    for (const z of [6, 26]) for (const dz of [-2.6, 2.6]) B.prop('bollard', BX0 - 0.6, AP, z + dz, { variant: 'yellow' });
    B.prop('ac_unit', 62, BH + 0.3, 30, { variant: 'hvac' }); B.prop('ac_unit', 50, BH + 0.3, 4, { variant: 'hvac' });
    B.prop('vent', 40, BH + 0.3, 20, { variant: 'mushroom' }); B.prop('vent', 72, BH + 0.3, 12, { variant: 'mushroom' });
    sign(B, 'bag', BX0 - 0.17, 5.0, 16, 6, 1.5, { face: 'w' });
    sign(B, 'airside', BX0 - 0.17, 2.0, 2.6, 1.2, 0.3, { face: 'w' });
    sign(B, 'bag', 56, 5.0, BZ0 - 0.17, 5, 1.25, { face: 's' });
    // strip curtains in the tug openings (visual)
    for (const z of [6, 26]) for (let i = 0; i < 12; i++) B.box(BX0, F + 0.4, z - 1.95 + i * 0.355, 0.01, 3.0, 0.3, { mat: 'glass_frosted', ...nc });
    // inner: dado paint, columns, roof beams, lights
    for (const [x0, x1, z, f] of [[BX0 + 0.15, BX1 - 0.15, BZ0 + 0.17, 'n']]) B.box((x0 + x1) / 2, F, z, x1 - x0, 1.2, 0.03, { mat: 'p_coat_blue', ...nc });
    B.box(BX1 - 0.17, F, 18, 0.03, 1.2, 39.6, { mat: 'p_coat_blue', ...nc });
    for (const x of [45, 56, 67]) for (const z of [8, 18, 28]) if (!(x === 56 && z === 18)) {
      B.box(x, F, z, 0.4, BH - F, 0.4, { mat: 'p_coat_yellow', mats: { t: 'steel_dark' } });
      B.box(x, F, z, 0.5, 1.0, 0.5, { mat: 'hazard', collide: false });
    }
    for (const x of [45, 56, 67]) B.box(x, BH - 0.6, 18, 0.3, 0.6, BZ1 - BZ0, { mat: 'steel_dark', ...nc });
    for (const x of [39.5, 50.5, 61.5, 72.5]) B.box(x, BH - 0.02, 18, 0.9, 0.02, BZ1 - BZ0 - 6, { mat: 'p_em_dim', ...nc });
    for (const [x, z] of [[45, 8], [67, 8], [45, 26], [67, 26]]) B.light({ type: 'spot', x, y: BH - 0.7, z, dir: [0, -1, 0], angle: 2.3, intensity: 1000, range: 22, color: [1, 0.94, 0.82], fixture: false });
    for (const x of [40, 50.5, 61.5, 72.5]) for (const z of [3, 13, 23, 33]) { B.box(x, BH - 0.4, z, 0.25, 0.08, 2.4, { mat: 'p_coat_white', ...nc }); B.box(x, BH - 0.41, z, 0.16, 0.01, 2.3, { mat: 'emissive_white', ...nc }); }
    // make-up carousel (site B centre) and belts
    carousel(B, 56, 17, 15, 4.4, { hide: true });
    belt(B, 64, BZ1 - 0.4, 64, 21, 0.85, { bags: 3 });
    B.box(64, F, BZ1 - 0.3, 1.2, 1.6, 0.2, { mat: 'steel_dark' });                                   // belt portal in the north wall
    B.box(64, F + 1.6, BZ1 - 0.15, 1.6, 0.6, 0.3, { mat: 'rubber', collide: false });
    belt(B, 74.5, 4, 74.5, 30, 0.85, { bags: 5 });
    sign(B, 'belt2', 65.2, F + 2.8, BZ1 - 0.17, 1.2, 0.6, { face: 's', lit: true });
    // carts and containers around the carousel
    dolly(B, 50, 10.4, { ry: HP, seed: 4 }); dolly(B, 53.6, 10.4, { ry: HP, seed: 5, bags: 0.4 }); dolly(B, 61, 10.4, { ry: HP, uld: true });
    dolly(B, 49, 23.6, { ry: -HP, seed: 6 }); dolly(B, 58.5, 23.6, { ry: -HP, uld: true });
    tug(B, 44.5, 10.4, { ry: -HP });
    uld(B, 70.2, F, 14, { ry: HP }); uld(B, 70.2, F, 16.4, { ry: HP }); uld(B, 70.2, F, 11.6, { ry: HP, hide: true });
    uld(B, 39, F, 1.0, {}); uld(B, 41.4, F, 1.0, {}); uld(B, 39, F, 3.4, { ry: PI, hide: true });
    B.prop('crate_plastic', 68, F, 25, { n: 4, variant: 'grey' }); B.prop('crate_plastic', 68.7, F, 25.4, { n: 3, variant: 'blue' });
    B.prop('pallet', 72, F, 34.5, { variant: 'wrap', stack: 2 }); B.prop('pallet', 70.6, F, 34.5, { stack: 6 });
    B.prop('cardboard_box', 72.5, F, 0.8, { variant: 'pile', n: 6 });
    B.prop('wheelie_bin', 76.8, F, 36.5, { variant: 'blue', ry: -HP });
    B.prop('fire_extinguisher', BX1 - 0.18, F, 20, { ry: -HP });
    sign(B, 'siteB', 46.5, F + 2.6, BZ0 + 0.17, 1.2, 1.2, { face: 'n' });
    sign(B, 'siteB', BX1 - 0.17, F + 2.6, 30, 1.2, 1.2, { face: 'w' });
    // belt control room (y FC) over the north-west corner, its stair and the screening machine below
    B.floor(BX0 + 0.15, 30, 44, CZ0 - 0.15, FC, { mat: 'tile_floor', t: 0.2, mats: { b: 'p_coat_slate' } });
    for (const [x, z] of [[43.8, 30.2], [BX0 + 0.35, 30.2]]) B.box(x, F, z, 0.25, FC - F - 0.2, 0.25, { mat: 'steel_dark' });
    wallX(B, BX0 + 0.15, 44, 30, { y: FC, h: 2.9, n: 'plaster_white', s: 'p_coat_slate', ops: [{ c: 37, y: 0.95, w: 2.2, h: 1.2 }, { c: 41, y: 0.95, w: 2.2, h: 1.2 }] });
    wallZ(B, 30, CZ0 - 0.15, 44, { y: FC, h: 2.9, w: 'plaster_white', e: 'p_coat_slate', ops: [{ c: 31.6, w: 1.0, h: 2.1, frame: 'steel_dark' }, { c: 35.5, y: 0.95, w: 2.0, h: 1.1 }] });
    B.floor(BX0 + 0.15, 30, 44.15, CZ0 - 0.15, FC + 3.0, { mat: 'concrete', t: 0.12, mats: { b: 'ceiling_tile' } });
    B.floor(44.15, 30.0, 47.2, 33.2, FC, { mat: 'grate', t: 0.15, mats: { b: 'steel_dark' } });            // landing
    B.box(47.0, F, 33.0, 0.2, FC - F - 0.15, 0.2, { mat: 'steel_dark' });
    B.stairs({ x: 46.5, z: 26.85, w: 1.3, len: 6.3, y0: F, y1: FC, dir: '+z', mat: 'steel_dark', tread: 'grate', rail: 'right', railMat: 'p_coat_yellow' });
    rail(B, 47.15, 30.0, 47.15, 33.2, FC, { mat: 'p_coat_yellow' }); rail(B, 44.2, 30.0, 45.8, 30.0, FC, { mat: 'p_coat_yellow' });
    rail(B, 44.15, 33.2, 47.15, 33.2, FC, { mat: 'p_coat_yellow', h: 1.05 });
    sign(B, 'ctrl', 44.0 + 0.17, FC + 2.4, 31.6, 1.1, 0.28, { face: 'e' });
    B.prop('control_console', 39, FC, 31.0, { ry: PI, len: 3.6 }); B.prop('office_chair', 39, FC, 32.2, { ry: PI });
    B.prop('server_rack', 35.2, FC, 36, { ry: HP, n: 2 });
    B.prop('filing_cabinet', 42.8, FC, 37.3, { ry: PI });
    B.light({ x: 39, y: FC + 2.88, z: 34, intensity: 40, fixture: 'panel', color: [0.95, 0.98, 1] });
    B.hide(36, FC, 32.5, { kind: 'dark' });
    B.box(38.5, F, 34.5, 2.2, 1.9, 4.2, { mat: 'p_coat_white', mats: { n: 'p_coat_slate', s: 'p_coat_slate' } });   // baggage screening machine
    belt(B, 38.5, 25, 38.5, 32.4, 0.85, {});
    B.hide(42.2, F, 36.6, { kind: 'dark' });
    // baggage office (x 34..46, z 38..48) between the concourse and the hall
    B.floor(BX0, CZ0, 46, 48, F, { mat: 'tile_floor', t: 0.15 });
    wallX(B, BX0, 46.15, 48, { h: 7.6, n: 'concrete_panels', s: 'plaster_white' });
    wallZ(B, CZ0 + 0.15, 48 - 0.15, 46, { h: 7.6, w: 'plaster_white', e: 'concrete_panels' });
    B.floor(BX0 + 0.15, CZ0 + 0.15, 45.85, 47.85, F + 3.0, { mat: 'concrete', t: 0.15, mats: { b: 'ceiling_tile' } });
    B.prop('desk', 43.5, F, 46.6, { ry: PI }); B.prop('office_chair', 43.5, F, 45.8, {});
    B.prop('lockers', 36.8, F, 47.5, { ry: PI, n: 4, variant: 'grey' });
    B.prop('filing_cabinet', 45.5, F, 40.5, { ry: -HP });
    B.prop('whiteboard', 40, F + 1.0, 47.82, { ry: PI, w: 1.6 });
    B.light({ x: 40, y: F + 2.85, z: 43, intensity: 40, fixture: 'panel', color: [1, 0.95, 0.88] });

    // ================================================================== APRON (mid): stand 3 with the second airliner
    B.prop('airliner', 0, AP, 13, { hide: true });
    line(B, 0, -36, 0, 30, 0.15); line(B, -2.5, 30.6, 2.5, 30.6, 0.3, 'p_coat_white');
    sign(B, 'stand3', 0, AP + 0.007, -33, 3, 3, { face: 'u' });
    sign(B, 'stop', 4.5, AP + 0.007, 30.6, 3, 0.75, { face: 'u' });
    for (const x of [-22, 22]) { line(B, x, -36, x, 30, 0.15); }
    sign(B, 'stand4', 22, AP + 0.007, -33, 3, 3, { face: 'u' }); sign(B, 'stand5', -22, AP + 0.007, -33, 3, 3, { face: 'u' });
    // stand safety lines (red) and the equipment staging boxes
    for (const [x0, z0, x1, z1] of [[-19, -30, 19, -30], [-19, -30, -19, 33], [19, -30, 19, 33]]) line(B, x0, z0, x1, z1, 0.18, 'p_coat_red');
    for (let x = 26; x < 33; x += 2) line(B, x, -30, x, -10, 0.1, 'p_coat_white');
    for (let i = 0; i < 6; i++) sign(B, 'oil' + (i % 4), -8 + i * 3.2 + r() * 2, AP + 0.004, 6 + r() * 14, 1.2 + r() * 1.5, 1.2 + r() * 1.5, { face: 'u', stain: true });
    for (let i = 0; i < 5; i++) sign(B, 'tyre', -20 + i * 12, AP + 0.004, -24 + r() * 8, 6, 1.5, { face: 'u', stain: true, ry: r() * 0.4 });
    // ground equipment at the stand
    stairsTruck(B, -5.9, 26.0, { ry: HP });
    beltLoader(B, 7.8, 4.5, { ry: -HP + 0.04 });
    for (let i = 0; i < 3; i++) dolly(B, 12.5 + i * 3.6, 1.2, { ry: -HP, seed: 10 + i, uld: i === 1 });
    tug(B, 23.4, 1.2, { ry: HP });
    B.prop('generator', 4.5, AP, 27.5, { variant: 'trailer', ry: PI });
    refueler(B, 11.5, 22, { ry: PI - 0.05, hide: true });
    for (const [x, z] of [[-17, 9], [17, 9], [-5.8, 21.5], [5.8, 21.5], [0, -5.6], [-3, 33.5], [3, 33.5]]) B.prop('cone', x, AP, z);
    B.prop('cone', 13.5, AP, 26, { variant: 'small' });
    // the south apron: parked equipment that breaks the long east-west line
    stairsTruck(B, -28, -20, { ry: 0 });
    refueler(B, 9, -22, { ry: HP + 0.1, hide: true });
    for (let i = 0; i < 4; i++) dolly(B, 26 + i * 3.6, -32, { ry: -HP, seed: 20 + i, bags: i === 2 ? 0 : 0.6 });
    tug(B, 41.2, -32, { ry: HP, paint: 'p_coat_white' });
    uld(B, -12, AP, -14, { ry: 0.2, hide: true }); uld(B, -14.4, AP, -14.2, { ry: -0.1 }); uld(B, -13.2, AP, -16.4, { ry: 0.4 });
    B.prop('jersey_barrier', -4, AP, -26, { len: 3, variant: 'plastic', color: 'red' }); B.prop('jersey_barrier', -1, AP, -26.1, { len: 3, variant: 'plastic', color: 'white' });
    B.prop('box_truck', -11, AP, -2, { variant: 'logo', ry: HP, hide: true });                         // catering truck behind the tail
    for (let i = 0; i < 3; i++) dolly(B, -6 + i * 3.6, -12.5, { ry: HP, seed: 60 + i, bags: i === 1 ? 0.3 : 0.8 });
    tug(B, -10, -12.5, { ry: -HP + 0.1 });
    beltLoader(B, -26, 12, { ry: PI - 0.15 });
    tug(B, -25.5, 26, { ry: 0.5 }); dolly(B, -26.6, 21.4, { ry: 0.45, seed: 30 });
    B.prop('pallet', 28.5, AP, 30, { variant: 'wrap', stack: 2 }); B.prop('pallet', 30, AP, 30, { variant: 'boxes' });
    B.prop('crate_stack', 26, AP, 34.5, { hide: true });
    // apron flood masts (unlit by day)
    for (const [x, z] of [[-30, -38], [30, -38]]) {
      B.cyl(x, AP, z, 0.35, 22, { mat: 'p_galv', sides: 10 });
      B.box(x, 21.6, z + 0.2, 3.2, 1.2, 0.4, { mat: 'p_paint_darkgrey', collide: false });
      B.box(x, 21.7, z + 0.42, 3.0, 1.0, 0.02, { mat: 'p_lens_clear', ...nc });
    }

    // ================================================================== ULD shelter + baggage staging (apron east, south of the hall)
    B.floor(36, -26, 60, -16, AP + 0.06, { mat: 'concrete_floor', t: 0.08 });
    for (const x of [36.2, 48, 59.8]) for (const z of [-25.8, -16.2]) B.box(x, AP, z, 0.3, 4.2, 0.3, { mat: 'steel_dark' });
    B.box(48, AP + 4.2, -21, 25, 0.3, 11, { mat: 'corrugated', mats: { b: 'corrugated' } });
    for (let x = 38; x < 59; x += 2.4) { uld(B, x, AP + 0.1, -24.5, { ry: 0 }); if (x < 47 || x > 52) uld(B, x, AP + 0.1, -17.5, { ry: PI }); }
    B.hide(49.5, AP, -21, { kind: 'crates' });
    B.prop('forklift', 62, AP, -20, { ry: -HP - 0.2 });
    dolly(B, 66, -8, { ry: 0.1, uld: true }); dolly(B, 66.5, -12.2, { ry: 0.05, uld: true });
    B.prop('crate_stack', 72, AP, -14, { ry: HP, hide: true });
    B.prop('ibc_tank', 75.5, AP, -6, {}); B.prop('ibc_tank', 77.0, AP, -6.2, { variant: 'blue' });
    B.prop('dumpster', 76, AP, -30, { variant: 'grey', ry: HP, hide: true });
    // east lane (between the hall and the perimeter fence)
    B.prop('fence_chainlink', 94.5, AP, -32, { variant: 'barbed', ry: HP, len: 144, h: 2.6 });
    B.prop('fence_chainlink', 86, AP, 40.2, { variant: 'barbed', len: 16, h: 2.6 });
    B.prop('box_truck', 86, AP, 22, { variant: 'plain', ry: PI, hide: true });
    B.prop('utility_pole', 92, AP, -20, { variant: 'concrete', span: 30 }); B.prop('utility_pole', 92, AP, 10, { variant: 'concrete' });
    B.prop('pallet', 84, AP, 2, { stack: 3, variant: 'sacks' }); B.prop('drum', 82, AP, -3, { variant: 'orange', n: 3 });
    windsock(B, 91, -36, { yaw: 2.4 });

    // ================================================================== CONTROL TOWER BASE (apron control)
    const TX0 = -12, TX1 = 12, TZ0 = -64, TZ1 = -50;
    B.floor(TX0, TZ0, TX1, TZ1, F, { mat: 'tile_floor', t: 0.15 });
    wallX(B, TX0, TX1, TZ1, { h: TB - 0.25, n: 'concrete', s: 'plaster_white', ops: [{ c: 4, w: 1.4, h: 2.3, frame: 'steel_dark' }, { c: -6, y: 1.0, w: 3.0, h: 1.4, glass: true }, { c: 9, y: 1.0, w: 2.0, h: 1.4, glass: true }] });
    wallX(B, TX0, TX1, TZ0, { h: TB - 0.25, n: 'plaster_white', s: 'concrete', ops: [{ c: -4, w: 1.4, h: 2.3, frame: 'steel_dark' }, { c: 6, y: 1.0, w: 3.0, h: 1.4, glass: true }] });
    wallZ(B, TZ0 + 0.15, TZ1 - 0.15, TX0, { h: TB - 0.25, w: 'concrete', e: 'plaster_white', ops: [{ c: -57, y: 1.0, w: 3.0, h: 1.4, glass: true }] });
    wallZ(B, TZ0 + 0.15, TZ1 - 0.15, TX1, { h: TB - 0.25, w: 'plaster_white', e: 'concrete' });
    wallZ(B, TZ0 + 0.15, TZ1 - 0.15, 1.0, { y: F, h: TB - F - 0.25, w: 'plaster_white', e: 'plaster_white', ops: [{ c: -56, w: 1.2, h: 2.2, frame: 'wood_dark' }] });
    B.floor(TX0 - 0.15, TZ0 - 0.15, TX1 + 0.15, TZ1 + 0.15, TB, { mat: 'concrete_dark', t: 0.25, mats: { b: 'ceiling_tile' } });
    for (const [x0, z0, x1, z1] of [[TX0 - 0.15, TZ1, TX1 + 0.15, TZ1], [TX0 - 0.15, TZ0, TX1 + 0.15, TZ0]]) B.box((x0 + x1) / 2, TB, z0 + (z0 === TZ1 ? 0.05 : -0.05), x1 - x0, 1.05, 0.2, { mat: 'concrete' });
    B.box(TX0 - 0.1, TB, (TZ0 + TZ1) / 2, 0.2, 1.05, TZ1 - TZ0 + 0.3, { mat: 'concrete' });
    B.box(TX1 + 0.1, TB, -61.0, 0.2, 1.05, 6.3, { mat: 'concrete' }); B.box(TX1 + 0.1, TB, -51.5, 0.2, 1.05, 3.3, { mat: 'concrete' });
    B.stairs({ x: 12.95, z: -60.9, w: 1.3, len: 6.2, y0: AP, y1: TB, dir: '+z', mat: 'steel_dark', tread: 'grate', rail: 'right', railMat: 'p_coat_yellow' });
    B.floor(12.0, -57.8, 13.6, -53.2, TB, { mat: 'grate', t: 0.2, mats: { b: 'steel_dark' } });
    rail(B, 13.6, -57.8, 13.6, -53.2, TB, { mat: 'p_coat_yellow' }); rail(B, 12.2, -53.2, 13.6, -53.2, TB, { mat: 'p_coat_yellow' });
    B.box(13.45, AP, -53.4, 0.15, TB - 0.25, 0.15, { mat: 'steel_dark' });
    B.prop('ac_unit', -8, TB, -60, { variant: 'hvac' }); B.prop('vent', 4, TB, -61.8, { variant: 'mushroom' }); B.prop('vent', 6, TB, -61.8, { variant: 'box' });
    B.cyl(-2, TB, -62.5, 0.04, 4.0, { mat: 'p_galv', collide: false }); B.cyl(-1.5, TB, -62.6, 0.04, 2.6, { mat: 'p_galv', collide: false });
    B.hide(-9.5, TB, -52.5, { kind: 'roof' });
    sign(B, 'ops', 0, TB - 1.0, TZ1 + 0.17, 4.8, 1.2, { face: 'n' });
    // inside: the ops room (west) and a crew room (east)
    B.prop('control_console', -6, F, -51.2, { ry: PI, len: 4.8 }); B.prop('office_chair', -7, F, -52.4, { ry: PI }); B.prop('office_chair', -4.6, F, -52.4, { ry: PI - 0.4 });
    B.prop('desk', -9.6, F, -62.6, { ry: 0, variant: 'metal' }); B.prop('filing_cabinet', -11.5, F, -59, { ry: HP });
    B.prop('whiteboard', -3, F + 1.0, -63.82, { w: 2.0 });
    B.prop('dining_table', 6.5, F, -57, { variant: 'white', chairs: 4 }); B.prop('fridge', 11.3, F, -62.8, { ry: -HP, variant: 'white' });
    B.prop('kitchen_counter', 6, F, -63.5, { len: 3.0, variant: 'white' }); B.prop('sofa', 9.5, F, -51.0, { ry: PI, variant: 'blue' });
    B.prop('tv', 9.5, F + 1.4, -63.8, { wall: true, on: false });
    B.light({ x: -5.5, y: TB - 0.25, z: -57, intensity: 45, fixture: 'panel', color: [1, 0.95, 0.88] });
    panelFx(B, 6.5, TB - 0.25, -57);
    // the tower itself rises from its own plinth west of the base building
    controlTower(B, -21, -57.5, { h: 30 });
    B.box(-21, AP, -57.5, 8.4, 0.12, 8.4, { mat: 'concrete' });

    // ================================================================== GSE WORKSHOP (west route) and the GSE yard
    const GX0 = -78, GX1 = -36, GZ0 = -66, GZ1 = -52, GH = 6.5;
    B.floor(GX0, GZ0, GX1, GZ1, F, { mat: 'concrete_floor', t: 0.15 });
    wallX(B, GX0, GX1, GZ1, { h: GH, n: 'corrugated', s: 'corrugated', ops: [{ c: -70, w: 4.5, h: 4.5, frame: 'hazard' }, { c: -57, w: 4.5, h: 4.5, frame: 'hazard' }, { c: -44, w: 4.5, h: 4.5, frame: 'hazard' }] });
    wallX(B, GX0, GX1, GZ0, { h: GH, n: 'corrugated', s: 'corrugated', ops: [{ c: -64, w: 1.2, h: 2.2, frame: 'steel_dark' }, { c: -46, w: 4.0, h: 4.0, frame: 'hazard' }] });
    wallZ(B, GZ0 + 0.15, GZ1 - 0.15, GX0, { h: GH, w: 'corrugated', e: 'corrugated', ops: [{ c: -59, w: 1.2, h: 2.2, frame: 'steel_dark' }] });
    wallZ(B, GZ0 + 0.15, GZ1 - 0.15, GX1, { h: GH, w: 'corrugated', e: 'corrugated', ops: [{ c: -59, w: 1.2, h: 2.2, frame: 'steel_dark' }] });
    B.box(-70, 0, GZ1, 4.5, 4.5, 0.12, { mat: 'corrugated' });                                          // closed roller door
    B.box(-44, F + 1.45, GZ1, 4.5, 4.5 - F - 1.45, 0.12, { mat: 'corrugated' });                         // half-open roller door (crouch under)
    for (const x of [-70, -57, -44]) B.box(x, 4.65, GZ1 + 0.3, 5.0, 0.6, 0.6, { mat: 'p_coat_slate', collide: false });
    B.floor(GX0 - 0.4, GZ0 - 0.4, GX1 + 0.4, GZ1 + 0.4, GH + 0.25, { mat: 'corrugated', t: 0.25, mats: { b: 'corrugated' } });
    B.box(-57, 0, GZ1 + 0.17, 42, 1.2, 0.04, { mat: 'concrete_panels', ...nc });
    sign(B, 'gse', -63.5, 5.4, GZ1 + 0.17, 5.5, 1.4, { face: 'n' });
    for (let x = -74; x <= -40; x += 8.5) truss(B, x, GZ0 + 0.2, GZ1 - 0.2, GH - 1.4, 1.2);
    for (const x of [-69.75, -61.25, -52.75, -44.25]) B.box(x, GH - 0.02, (GZ0 + GZ1) / 2, 1.2, 0.02, GZ1 - GZ0 - 3, { mat: 'p_em_dim', ...nc });
    B.light({ x: -66, y: GH - 0.3, z: -59, intensity: 100, fixture: 'tube', color: [0.92, 0.96, 1] });
    B.light({ x: -48, y: GH - 0.3, z: -59, intensity: 100, fixture: 'tube', color: [0.92, 0.96, 1] });
    // dressing: a tug on axle stands, a belt loader in for repair, benches, tyres, lockers
    tug(B, -70, -59, { y: F, ry: 0.1 }); beltLoader(B, -57, -61, { ry: HP });
    B.box(-77.4, F, -62, 0.9, 0.92, 4.0, { mat: 'wood_dark', mats: { t: 'metal_plate' } });
    B.prop('shelf_unit', -77.5, F, -55, { ry: HP, w: 2.0 }); B.prop('lockers', -50, F, -65.5, { n: 4, variant: 'green' });
    toolChest(B, -63, -64.9, { y: F }); toolChest(B, -41, -55, { y: F, ry: PI, paint: 'p_coat_blue' });
    for (const [x, z, n] of [[-38.2, -63.5, 4], [-39.4, -63.8, 3]]) for (let i = 0; i < n; i++) B.cyl(x, F + i * 0.24, z, 0.36, 0.23, { mat: 'rubber', sides: 14 });
    B.prop('drum', -37.2, F, -53.2, { variant: 'black', n: 3 }); B.prop('gas_cylinder', -77.5, F, -65.4, { rack: true });
    B.hide(-77.2, F, -52.8, { kind: 'dark' }); B.hide(-50.4, F, -64.2, { kind: 'closet' });
    for (let i = 0; i < 3; i++) sign(B, 'oil' + i, -66 + i * 9, F + 0.004, -60 + r() * 3, 2, 2, { face: 'u', stain: true });
    // the yard south of the workshop and west of the depot
    for (let i = 0; i < 4; i++) { dolly(B, -70 + i * 3.6, -80, { ry: HP, seed: 40 + i, bags: 0 }); }
    tug(B, -74.4, -80, { ry: HP });
    for (let i = 0; i < 3; i++) dolly(B, -52 + i * 3.6, -88, { ry: HP, seed: 50 + i, uld: i !== 1 });
    beltLoader(B, -30, -78, { ry: 0.3 }); beltLoader(B, -34, -92, { ry: -0.2, paint: 'p_coat_white' });
    stairsTruck(B, -62, -94, { ry: HP });
    tug(B, -40, -71, { ry: 0.2, paint: 'p_coat_white' });
    for (let x = -86; x < -24; x += 4) line(B, x, -74, x, -98, 0.12, 'p_coat_white', AP - 0.005);
    B.prop('cone', -44, AP, -74.5); B.prop('cone', -47, AP, -74.8, { variant: 'drum' });
    B.prop('container', -84, AP, -88, { variant: 'blue', ry: 0, doors: 'closed' });
    B.prop('container', -84, AP, -72, { variant: 'grey', ry: 0, doors: 'open', hide: true });
    B.prop('street_light', -52, AP, -70.6, { on: false, ry: PI });

    // ================================================================== FUEL SERVICES garage (T1 lobby)
    const DX0 = -16, DX1 = 16, DZ0 = -100, DZ1 = -74, DH = 6.5;
    B.floor(DX0, DZ0, DX1, DZ1, F, { mat: 'p_concrete_precast', t: 0.15 });
    wallX(B, DX0, DX1, DZ1, { h: DH, n: 'concrete_panels', s: 'plaster', ops: [{ c: -7, w: 3.0, h: 3.2 }, { c: 7, w: 3.0, h: 3.2 }] });
    wallX(B, DX0, DX1, DZ0, { h: DH, n: 'plaster', s: 'concrete_panels', ops: [{ c: -2, y: 1.2, w: 8, h: 1.2, glass: true }] });
    wallZ(B, DZ0 + 0.15, DZ1 - 0.15, DX0, { h: DH, w: 'concrete_panels', e: 'plaster' });
    wallZ(B, DZ0 + 0.15, DZ1 - 0.15, DX1, { h: DH, w: 'plaster', e: 'concrete_panels' });
    B.floor(DX0 - 0.4, DZ0 - 0.4, DX1 + 0.4, DZ1 + 0.4, DH + 0.25, { mat: 'concrete_dark', t: 0.25, mats: { b: 'concrete' } });
    B.box(0, DH - 1.2, DZ1 + 0.17, 32.3, 1.2, 0.05, { mat: 'p_coat_red', ...nc });
    sign(B, 'fuel', 0, 4.4, DZ1 + 0.19, 6, 1.5, { face: 'n' });
    B.box(0, F, DZ1 - 0.17, 31.6, 1.0, 0.03, { mat: 'p_coat_white', ...nc });
    refueler(B, -11.6, -87.5, { y: F, ry: 0 }); refueler(B, 11.6, -87.5, { y: F, ry: 0 });
    B.prop('lockers', -2, F, -99.6, { n: 6, variant: 'red' });
    B.prop('bench', -2, F, -98.1, { variant: 'metal', len: 3.2 });
    B.prop('fire_extinguisher', -15.82, F, -80, { ry: HP }); B.prop('fire_extinguisher', 15.82, F, -80, { ry: -HP });
    B.prop('whiteboard', 5, F + 1.0, -99.84, { w: 2.0 }); B.prop('wall_clock', -6, F + 2.6, -99.83, {});
    B.prop('shelf_unit', 15.5, F, -97.5, { ry: -HP, w: 1.8, variant: 'grey' }); B.prop('shelf_unit', -15.5, F, -97.5, { ry: HP, w: 1.8 });
    B.prop('drum', 14.9, F, -76.2, { variant: 'red', n: 2 }); B.prop('drum', -15.0, F, -76.2, { variant: 'yellow', n: 3 });
    B.prop('poster', 9, F + 1.3, -99.84, { i: 3 }); sign(B, 'nopark', 0, F + 0.004, -76.4, 2.6, 0.65, { face: 'u' });
    for (const x of [-11.6, 11.6]) { sign(B, 'oil' + (x > 0 ? 1 : 2), x, F + 0.004, -88, 2.2, 2.2, { face: 'u', stain: true }); B.box(x + (x > 0 ? 3.6 : -3.6), F + 1.2, -88, 0.3, 0.5, 0.5, { mat: 'p_coat_red', collide: false }); }
    for (let x = -4; x <= 4; x += 4) line(B, x, -99, x, -75, 0.12, 'p_coat_yellow', F);
    B.light({ x: -6, y: DH - 0.3, z: -86, intensity: 112, fixture: 'tube', color: [0.95, 0.97, 1] });
    B.light({ x: 6, y: DH - 0.3, z: -86, intensity: 112, fixture: 'tube', color: [0.95, 0.97, 1] });
    B.lobby(1, { x0: DX0 + 0.3, z0: DZ0 + 0.3, x1: DX1 - 0.3, z1: DZ1 - 0.3, y: F }, [{ x: -7, z: DZ1, w: 3.0, h: 3.2 }, { x: 7, z: DZ1, w: 3.0, h: 3.2 }]);
    for (let i = 0; i < 4; i++) for (const z of [-96, -92, -88]) B.spawn(1, -4.5 + i * 3, F, z, 0);
    // fuel farm east of the garage (bund, horizontal tanks, pump skid)
    const FX0 = 22, FX1 = 56, FZ0 = -100, FZ1 = -80;
    for (const [x0, z0, x1, z1] of [[FX0, FZ1, FX1, FZ1], [FX0, FZ0, FX1, FZ0]]) B.box((x0 + x1) / 2, AP, z0, x1 - x0, 1.0, 0.3, { mat: 'p_concrete_precast' });
    B.box(FX0, AP, (FZ0 + FZ1) / 2 - 4, 0.3, 1.0, FZ1 - FZ0 - 8, { mat: 'p_concrete_precast' });
    B.box(FX1, AP, (FZ0 + FZ1) / 2, 0.3, 1.0, FZ1 - FZ0, { mat: 'p_concrete_precast' });
    for (const x of [30, 42]) { B.box(x, AP, FZ1 + 0.7, 1.2, 0.5, 1.0, { mat: 'concrete' }); B.box(x, AP, FZ1 - 0.7, 1.2, 0.5, 1.0, { mat: 'concrete' }); }
    for (const x of [29, 39, 49]) B.prop('tank', x, AP, -90, { variant: 'horizontal', len: 9, r: 1.6, ry: HP });
    B.hide(36, AP, -86, { kind: 'crates' });
    B.prop('pipe', 36, AP, -96, { ry: HP, len: 24, d: 0.2, variant: 'yellow', h: 0.4 });
    B.prop('generator', 26, AP, -96, { variant: 'yellow' });
    B.prop('fence_chainlink', 2, AP, -104.6, { variant: 'barbed', len: 186, h: 2.6 });
    // staff car park (east)
    for (let i = 0; i < 6; i++) {
      line(B, 58 + i * 3, -66, 58 + i * 3, -60, 0.12, 'p_coat_white');
      if (i !== 2) B.prop('car', 59.5 + i * 3, AP, -63, { ry: (i % 2 ? PI : 0) + (r() - 0.5) * 0.08, hide: i === 1 || i === 4 });
    }
    B.prop('car', 80, AP, -60, { variant: 'van', ry: HP, color: 'white', hide: true });
    B.prop('car', 72, AP, -92, { variant: 'pickup', ry: 0.4, color: 'red' });
    B.prop('street_light', 66, AP, -57.5, { on: false });

    // ================================================================== out of bounds
    // south: grass strip, taxiway and the runway with edge lights; hold line
    B.floor(-330, -150, 330, -124, 0.02, { mat: 'asphalt', t: 0.1, collide: false });
    dashed(B, -320, -137, 320, -137, 0.18, 30, 0.01, 'p_coat_yellow');
    B.floor(-330, -205, 330, -160, 0.02, { mat: 'asphalt', t: 0.1, collide: false });
    for (let x = -300; x < 300; x += 50) line(B, x, -182.5, x + 30, -182.5, 0.9, 'p_coat_white', 0.02);
    for (let i = 0; i < 8; i++) line(B, 250 + 0 * i, -199 + i * 4.8, 290, -199 + i * 4.8, 1.8, 'p_coat_white', 0.02);
    const pts = []; for (let x = -300; x <= 300; x += 30) { pts.push([x, -123]); pts.push([x, -151]); }
    edgeLights(B, pts, { color: 'blue' });
    const rpts = []; for (let x = -300; x <= 300; x += 60) { rpts.push([x, -159]); rpts.push([x, -206]); }
    edgeLights(B, rpts, { color: 'white' });
    windsock(B, -60, -115, { yaw: 2.2 });
    B.prop('airliner', 120, 0.02, -137, { ry: -HP, collide: false });                                  // an arrival taxiing in
    skyline(B, -200, -222, 200, -222, { faces: 'n', h: 9, depth: 22, step: 34 });                       // cargo sheds across the runway
    for (let i = 0; i < 14; i++) { const x = -260 + i * 40 + r() * 12, z = -236 - r() * 10; B.prop('tree', x, hills(x, z) - 0.3, z, { variant: r() < 0.5 ? 'poplar' : 'oak', collide: false }); }
    // west: hangar 1 and its apron
    B.box(-135, 0, -10, 60, 16, 52, { mat: 'corrugated', mats: { t: 'p_coat_slate' }, collide: false, cast: false });
    B.box(-104.9, 0, -10, 0.4, 12, 40, { mat: 'p_coat_white', collide: false });
    B.floor(-104, -40, -92, 30, 0.03, { mat: 'concrete_panels', t: 0.1, uv: 2, collide: false });
    B.prop('container_40', -100, AP, 34, { variant: 'white', ry: HP, collide: false });
    // north: landside road and the car park, the parking garage and the town
    B.floor(-120, 68, 140, 80, 0.03, { mat: 'asphalt', t: 0.1, collide: false });
    dashed(B, -120, 74, 140, 74, 0.15, 3, 6, 'p_coat_white');
    for (let i = 0; i < 12; i++) B.prop('car', -60 + i * 9 + r() * 2, AP, 85 + (i % 3) * 6, { ry: (i % 2) * PI, collide: false });
    B.floor(-80, 82, 60, 104, 0.03, { mat: 'asphalt', t: 0.1, collide: false });
    skyline(B, -100, 130, 120, 130, { faces: 's', h: 16, depth: 18 });
    B.box(90, 0, 98, 40, 13, 30, { mat: 'concrete', mats: { t: 'concrete_dark' }, collide: false, cast: false });   // parking garage
    for (const y of [3.2, 6.4, 9.6]) B.box(90, y, 82.98, 40, 1.1, 0.04, { mat: 'p_glass_dark', ...nc });
    for (const [x, z] of [[-90, 66], [-40, 70], [40, 72], [120, 70]]) B.prop('tree', x, 0, z + 12, { variant: 'poplar', collide: false });
    // east: cargo sheds
    skyline(B, 130, -100, 130, 60, { faces: 'w', h: 12, depth: 30, step: 40 });
    B.box(112, 0, -70, 18, 8, 30, { mat: 'corrugated', collide: false, cast: false });
    for (const [x, z] of [[-160, -60], [-150, 60], [170, -40], [150, 110], [-120, 110]]) B.prop('tree', x, 0, z, { variant: r() < 0.5 ? 'oak' : 'birch', collide: false });

    // ================================================================== objectives
    B.site('A', { x0: -66, z0: -4, x1: -46, z1: 16, y: F });
    sign(B, 'siteA', -50, F + 0.006, -1, 3, 3, { face: 'u', ry: -HP });
    sign(B, 'siteB', 62.5, F + 0.006, 8.5, 3, 3, { face: 'u', ry: HP });
    sign(B, 'siteA', -50, F + 3.0, HZ1 - 0.2, 1.4, 1.4, { face: 's' });
    sign(B, 'siteA', HX1 - 0.33, F + 3.0, -4, 1.4, 1.4, { face: 'e' });
    B.site('B', { x0: 46, z0: 6, x1: 68, z1: 27, y: F });
    B.hostage(-74, F, -24); B.hostage(-66, F2, -24.5); B.hostage(39, FC, 34); B.hostage(40, F, 44.5); B.hostage(-74.5, F, 26);
    B.rescue({ x0: -14, z0: -72, x1: 14, z1: -66 });
    B.point('dom1', -27, null, -6, 4); B.point('dom2', 0, null, -18, 4); B.point('dom3', 46, null, -8, 4);
    B.point('hp1', -42, F, 20, 4); B.point('hp2', -12, null, -36, 4); B.point('hp3', 26, null, 18, 4); B.point('hp4', 52, F, 30, 4); B.point('hp5', -56, null, 34, 4);
    B.point('hill', -22, null, 2, 5);
    B.point('flag1', 0, null, -70, 1.5); B.point('flag2', 0, F, 42, 1.5);
    B.point('extract1', -86, null, -40, 3); B.point('extract2', 88, null, -36, 3); B.point('extract3', -70, null, -98, 3);
    B.point('hq1', 0, F, -57, 3); B.point('hq2', -66, F, -24, 3);

    // ================================================================== field spawns (respawn modes) and FFA spawns
    for (const [x, z, yaw, y] of [[-40, -82, 0.4], [-64, -84, 0.3], [-26, -72, 0.2], [-64, -56, 0, F], [-22, -44, 0.6], [40, -76, -0.4],
      [70, -72, -0.3], [88, -86, -0.6], [0, -70, 0], [24, -66, -0.2], [-84, -60, 0.2]])
      B.spawn(1, x, y == null ? null : y, z, yaw, { field: true });
    for (const [x, z, yaw, y] of [[-60, 34, PI, AP], [-76, 32, 2.6, AP], [-24, 42, PI, F], [24, 42, PI, F], [40, 44, PI, F], [60, 34, PI, F],
      [24, 32, -2.4, AP], [-26, 33, 2.8, AP], [86, 32, -2.6, AP], [-64, 26, PI, F]])
      B.spawn(2, x, y, z, yaw, { field: true });
    for (const [x, y, z] of [[-86, null, -66], [-70, null, -88], [-28, null, -88], [32, null, -74], [62, null, -56], [88, null, -10],
      [86, null, 30], [72, F, 30], [44, F, 4], [-56, null, 35], [-84, null, 10], [-74, F, -6], [-40, F, 26], [-71, F2, -23.5], [-30, null, -30],
      [20, null, -16], [-18, null, 28], [0, F, 42], [-6, F, -58], [-46, F, -58]])
      B.spawn(0, x, y, z, Math.atan2(-x, -z));
}
