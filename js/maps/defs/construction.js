/* LIVE FIRE — Skyline Phase II (construction): a city-block construction site on a bright, partly cloudy day. Original location.
   Plan (x east, z north, metres, ground y 0; plywood hoarding at x +-60, z +-48):
     T1 lobby  = SITE ENTRANCE GATE (SW, x -60..-44, z -48..-38): security cabin, turnstiles, PPE racks; gates N and E.
     West laydown (x -60..-16, z -36..30): container stores, rebar shop shed, scaffold stock, precast stack.
     MID       = haul road + tower crane (x -16..28, z -30..2): crane footing, mixer truck, skips, container row, hoist.
     South road (z -47..-36) along the hoarding: the long route T1 -> B.
     BUILDING  (x -12.3..24.3, z 3.7..28.3), concrete frame on a 6 m grid, storeys 4 m: L0 .2, L1 4.2, L2 8.2, L3 12.2 (roof,
               not playable; props still under it). Core x 0..10, z 12..20: lift shaft (x 0..4) + switchback stair (x 4..10).
               Scaffold stair towers: west (x -14.9..-12.3, L0-L1) and east (x 24.3..26.9, L0-L1-L2). West void + stair L1-L2.
     SITE A    = L2 around the core (x -2..20, z 6..27, y 8.2). Ways in: core stair, east tower, west void stair.
     SITE B    = material yard (x 32..52, z -20..0, ground). Ways in: W (haul road), S (south road), N (from the building / tower).
     T2 lobby  = OFFICE CABINS (NE, x 38..56, z 34..42): canteen block, gates S and W; upper cabins + walkway reached by a stair.
     North strip (z 30..47): car park, portaloos, spoil heap, excavator; north flank.
   Out of bounds: streets and the city (offices, brick terraces, a glass tower) all round. Prefabs: js/maps/kit_construction.js.
   Notes: tools/test/out/notes-map-construction.md */
import { kit, decal, paint, pave, railing, stair, deck, fence, finish, farGround, skirt, rng, YEL, WHT, RED,
  shoring, scaffold, stairTower, edgeGuard, hoarding, festoon, workLight, portaloo, skip, excavator, mixerTruck, towerCrane,
  cityBuilding, concretePipes, plyStack, beamStack, lightTower } from '../kit_construction.js';

const PI = Math.PI, H = PI / 2;
const L0 = .2, L1 = 4.2, L2 = 8.2, L3 = 12.2, SL = .25;          // slab tops and thickness
const BX0 = -12.3, BX1 = 24.3, BZ0 = 3.7, BZ1 = 28.3;          // building slab edges
const GX = [-12, -6, 0, 6, 12, 18, 24], GZ = [4, 10, 16, 22, 28];
const inCore = (x, z) => x >= -.1 && x <= 10.1 && z >= 11.9 && z <= 20.1;
const VOID = [-11.6, 17.2, -6.4, 27];                             // L2 slab void over the west stair
const face = (x, z, tx, tz) => Math.atan2(tx - x, tz - z);
const mound = (x, z) => { const d = Math.hypot((x - 20) / 7.5, (z - 39) / 5); return d < 1 ? 2.4 * (.5 + .5 * Math.cos(PI * d)) : 0; };

export default {
  id: 'construction', name: 'Skyline Phase II', size: 'M', chunk: 64,
  desc: 'City-block construction site on a bright day: a three-storey concrete frame with a stair core and scaffold towers, a tower crane over the haul road, the material yard and the site cabins.',
  env: { hdri: 'partly_cloudy', sky: 'hdri', time: 'day', exposure: 1.0, sun: { dir: [.42, -.78, .46], color: [1, .96, .9], intensity: 1 },
    fog: { color: [.7, .76, .84], density: .0024 }, weather: 'clear', wind: [2.5, 1], ambience: 'construction', reverb: 'outdoor', indoorIbl: .32, puddles: .15 },
  bounds: { minX: -64, maxX: 64, minZ: -52, maxZ: 52, minY: -3, maxY: 60 },

  build(B) {
    const R = rng(4242);
    const CASTS = new Set(['container', 'container_40', 'site_cabin', 'crate_stack', 'dumpster', 'generator', 'car', 'box_truck', 'semi_trailer', 'truck_tractor', 'forklift', 'rack']);
    const prop0 = B.prop.bind(B);
    B.prop = (type, x, y, z, o = {}) => prop0(type, x, y, z, Object.assign({ cast: CASTS.has(type) }, o));

    // ================================================================ ground
    pave(B, [
      [-62.6, -50.6, 62.6, -48.1, 'pavement'], [-62.6, 48.1, 62.6, 50.6, 'pavement'], [-62.6, -48.1, -60.1, 48.1, 'pavement'], [60.1, -48.1, 62.6, 48.1, 'pavement'],
      [-64, -52, 64, -50.6, 'asphalt'], [-64, 50.6, 64, 52, 'asphalt'], [-64, -50.6, -62.6, 50.6, 'asphalt'], [62.6, -50.6, 64, 50.6, 'asphalt'],
      [-60, -48, -44, -38, 'asphalt'],                       // entrance pen
      [-44, -47, 60, -36, 'concrete_floor'],                 // south road (hardstanding)
      [28, -36, 60, 8, 'concrete_floor'],                    // material yard slab
      [-16, -36, 28, 2, 'gravel'],                           // haul road / mid
      [11.6, 32.4, 28.4, 45.6, 'none'],                      // spoil heap (own heightfield)
      [-60, 30, 36, 48, 'dirt'],                             // north strip
      [36, 30, 60, 48, 'concrete_floor'],                    // cabin pad
    ], 'gravel', { x0: -64, z0: -52, x1: 64, z1: 52 }, 1.6);
    B.ground({ minX: 11.6, maxX: 28.4, minZ: 32.4, maxZ: 45.6, mat: 'dirt', res: 1.2, height: mound });

    // ================================================================ hoarding (perimeter) + gates to the street
    const hz = { paint: 'p_paint_darkgrey' };
    hoarding(B, -60, -48, 60, -48, { ...hz });          // south (walking +x: right side = -z = outside)
    hoarding(B, 60, 48, -60, 48, { ...hz });            // north (walking -x: right = +z)
    hoarding(B, -60, 48, -60, -48, { ...hz });          // west (walking -z: right = -x)
    hoarding(B, 60, -48, 60, 48, { ...hz });            // east (walking +z: right = +x)

    // ================================================================ T1 lobby: site entrance pen
    const T1 = { x0: -60, z0: -48, x1: -44, z1: -38 };
    hoarding(B, -60, -38, -44, -38, { h: 2.7, inside: 'plywood', paint: 'plywood', openings: [{ at: 8, w: 2.8, h: 2.7 }], noBrace: true });
    hoarding(B, -44, -48, -44, -38, { h: 2.7, inside: 'plywood', paint: 'plywood', openings: [{ at: 5, w: 2.8, h: 2.7 }], noBrace: true });
    B.lobby(1, { ...T1, y: 0 }, [{ x: -52, z: -38, w: 2.8, h: 2.7 }, { x: -44, z: -43, w: 2.8, h: 2.7, ry: H }]);
    for (let i = 0; i < 6; i++) for (let j = 0; j < 2; j++) B.spawn(1, -57 + i * 2, 0, -45.5 + j * 3.2, face(0, 0, 1, 1));

    // ================================================================ T2 lobby: canteen cabin block
    B.room({ x: 47, z: 38, w: 18, d: 8, y: .15, h: 2.8, t: .15, wall: 'p_paint_cream', outer: 'p_paint_cream', floor: 'p_wood_light', ceil: 'plaster_white', roof: 'p_paint_darkgrey',
      doors: { s: [{ at: 5, w: 2.6, h: 2.6, frame: false }, { at: 13, w: 2.6, h: 2.6, frame: false }], w: [{ at: 4, w: 2.6, h: 2.6, frame: false }] },
      windows: { n: [{ at: 4, w: 1.6, glass: true }, { at: 9, w: 1.6, glass: true }, { at: 14, w: 1.6, glass: true }], e: [{ at: 4, w: 1.4, glass: true }] }, frames: 'steel_dark' });
    B.box(47, 0, 38, 18, .15, 8, { mat: 'p_paint_darkgrey' });
    B.lobby(2, { x0: 38.2, z0: 34.2, x1: 55.8, z1: 41.8, y: .15 }, [{ x: 43, z: 34.07, w: 2.6, h: 2.6 }, { x: 51, z: 34.07, w: 2.6, h: 2.6 }, { x: 38.07, z: 38, w: 2.6, h: 2.6, ry: H }]);
    for (let i = 0; i < 6; i++) for (let j = 0; j < 2; j++) B.spawn(2, 40.5 + i * 2.6, .15, 37 + j * 3, face(0, 0, -1, -1));

    // ================================================================ building: slabs, columns, core
    const slab = (x0, z0, x1, z1, y, o = {}) => B.box((x0 + x1) / 2, y - SL, (z0 + z1) / 2, x1 - x0, SL, z1 - z0, { mat: 'concrete', mats: { t: o.top || 'concrete_floor', b: 'concrete' }, ...o.box });
    B.box((BX0 + BX1) / 2, 0, (BZ0 + BZ1) / 2, BX1 - BX0, L0, BZ1 - BZ0, { mat: 'concrete', mats: { t: 'concrete_floor' } });
    const L1R = [[BX0, BZ0, BX1, 12], [BX0, 20, BX1, BZ1], [BX0, 12, 0, 20], [10, 12, BX1, 20]];
    for (const r of L1R) slab(...r, L1);
    const [vx0, vz0, vx1, vz1] = VOID;
    for (const r of [[BX0, BZ0, BX1, 12], [10, 12, BX1, 20], [BX0, 12, 0, vz0], [BX0, vz0, vx0, BZ1], [vx1, vz0, 0, 20], [vx1, 20, BX1, BZ1], [vx0, vz1, vx1, BZ1]]) slab(...r, L2);
    slab(BX0, BZ0, BX1, BZ1, L3);
    // stair shaft landings (inner x 4.15..9.85, z 12.15..19.85)
    for (const y of [L1, L2]) slab(4.15, 12.15, 9.85, 13.6, y);
    for (const y of [L0 + 2, L1 + 2]) slab(4.15, 17.6, 9.85, 19.85, y);
    // columns (per storey, between slab top and the slab above)
    for (const x of GX) for (const z of GZ) {
      if (inCore(x, z)) continue;
      for (const [y0, y1] of [[L0, L1 - SL], [L1, L2 - SL], [L2, L3 - SL]]) B.box(x, y0, z, .5, y1 - y0, .5, { mat: 'p_concrete_precast' });
    }
    // core walls (t .3), per storey
    for (const [y0, k] of [[L0, 0], [L1, 1], [L2, 2]]) {
      const h = 4 - SL, w = { y: y0, h, t: .3, mat: 'concrete', mat2: 'concrete' };
      B.wall(0, 12, 10, 12, { ...w, openings: [{ at: 2, w: 1.6, h: 2.4 }, { at: 7.1, w: 1.9, h: 2.3 }] });
      B.wall(0, 20, 10, 20, w);
      B.wall(0, 12.15, 0, 19.85, w);
      B.wall(10, 12.15, 10, 19.85, w);
      B.wall(4, 12.15, 4, 19.85, { ...w, t: .25 });
    }
    // core stair: two flights per storey
    for (const ya of [L0, L1]) {
      B.stairs({ x: 5.1, z: 15.6, w: 1.6, len: 4, y0: ya, y1: ya + 2, dir: '+z', mat: 'concrete', tread: 'concrete_floor', rail: 'right' });
      B.stairs({ x: 8.85, z: 15.6, w: 1.6, len: 4, y0: ya + 2, y1: ya + 4, dir: '-z', mat: 'concrete', tread: 'concrete_floor', rail: 'right' });
    }
    railing(B, 5.9, 13.6, 8.05, 13.6, L1);
    railing(B, 4.15, 13.6, 8.05, 13.6, L2);
    // lift shaft openings guarded on L1 / L2 (L0 open: the pit is a dark corner)
    for (const y of [L1, L2]) edgeGuard(B, 1.1, 11.75, 2.9, 11.75, y);

    // west void stair L1 -> L2 and the void guards
    B.stairs({ x: -9.0, z: 21.0, w: 1.6, len: 7.6, y0: L1, y1: L2, dir: '-z', mat: 'concrete', tread: 'concrete_floor', rail: true, railMat: 'p_coat_yellow' });
    edgeGuard(B, vx0, vz1, vx1, vz1, L2); edgeGuard(B, vx0, vz0, vx0, vz1, L2); edgeGuard(B, vx1, vz0, vx1, vz1, L2);
    edgeGuard(B, vx0, vz0, -9.85, vz0, L2); edgeGuard(B, -8.15, vz0, vx1, vz0, L2);

    // stair towers
    stairTower(B, -13.6, 14, [0, L1], { open: [{ level: 1, side: 'e' }] });
    stairTower(B, 25.6, 14, [0, L1, L2], { open: [{ level: 1, side: 'w' }, { level: 2, side: 'w' }] });

    // slab edge protection on L1 / L2 (gaps where the towers meet the slab)
    for (const y of [L1, L2]) {
      edgeGuard(B, BX0 + .1, BZ0 + .1, BX1 - .1, BZ0 + .1, y);
      edgeGuard(B, BX0 + .1, BZ1 - .1, BX1 - .1, BZ1 - .1, y);
      if (y === L1) { edgeGuard(B, BX0 + .1, BZ0 + .1, BX0 + .1, 10.3, y); edgeGuard(B, BX0 + .1, 11.7, BX0 + .1, BZ1 - .1, y); }
      else edgeGuard(B, BX0 + .1, BZ0 + .1, BX0 + .1, BZ1 - .1, y);
      edgeGuard(B, BX1 - .1, BZ0 + .1, BX1 - .1, 10.3, y); edgeGuard(B, BX1 - .1, 11.7, BX1 - .1, BZ1 - .1, y);
    }

    // ================================================================ temporary markers (blockout)
    B.site('A', { x0: -2, z0: 6, x1: 20, z1: 27, y: L2 });
    B.site('B', { x0: 32, z0: -20, x1: 52, z1: 0 });
    B.rescue({ x0: -42, z0: -34, x1: -34, z1: -26 });
    B.hostage(-4, L1, 24); B.hostage(16, L1, 8); B.hostage(46, 0, -24); B.hostage(20, L0, 25); B.hostage(2, L0, 8);
    B.point('dom1', -36, null, -8, 4); B.point('dom2', 6, L0, 7, 4); B.point('dom3', 44, null, 14, 4);
    B.point('hp1', 4, null, -18, 5); B.point('hp2', -4, L1, 8, 4); B.point('hp3', 42, null, -10, 5); B.point('hp4', -30, null, 38, 5); B.point('hp5', 14, L2, 22, 4);
    B.point('hill', 6, L0, 7, 5);
    B.point('flag1', -38, null, -30, 1.5); B.point('flag2', 46, null, 26, 1.5);
    B.point('extract1', -56, null, 20, 3); B.point('extract2', 0, null, -44, 3); B.point('extract3', 56, null, 0, 3);
    B.point('hq1', -30, null, 0, 4); B.point('hq2', 18, L1, 24, 4);

    for (const [x, y, z, k] of [[2, L0, 15, 'dark'], [7, L0, 15.5, 'dark'], [-50, 0, 10, 'crates'], [30, 0, 30, 'crates'], [-40, 0, 40, 'car'], [-20, L1, 26, 'dark'], [16, L2, 26, 'crates'],
      [20, 1.8, 38, 'grass'], [-8, 0, 44, 'closet'], [50, 0, -30, 'crates'], [-30, 0, -40, 'crates'], [10, 0, -28, 'crates']]) B.hide(x, y, z, { kind: k });

    // field spawns (T1 = west / south-west half, T2 = east / north-east half) and FFA
    for (const [x, z] of [[-40, -20], [-50, -28], [-30, -32], [-24, -10], [-52, 0], [-40, 20], [-28, 30], [-20, -40], [-8, -30], [-46, 34]]) B.spawn(1, x, null, z, face(x, z, 10, 10), { field: true });
    for (const [x, z] of [[44, 24], [54, 12], [36, 16], [30, 40], [54, -32], [36, -30], [28, 22], [16, 42], [50, 28], [32, 4]]) B.spawn(2, x, null, z, face(x, z, 0, 0), { field: true });
    for (const [x, y, z] of [[-54, 0, -20], [-50, 0, 24], [-30, 0, 42], [-6, 0, 40], [22, 0, 30], [44, 0, 30], [54, 0, 2], [46, 0, -40], [20, 0, -40], [-12, 0, -40], [-30, 0, -16],
      [0, 0, -8], [20, 0, -20], [-6, L0, 8], [18, L0, 24], [-8, L1, 8], [18, L1, 14], [-2, L2, 24], [20, L2, 8]]) B.spawn(0, x, y, z, face(x, z, 0, 0));

    finish(B);
  },
};
