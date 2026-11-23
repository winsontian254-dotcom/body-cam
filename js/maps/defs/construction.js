/* LIVE FIRE — Skyline Phase II (construction): a city-block construction site on a bright, partly cloudy day. Original location.
   Plan (x east, z north, metres, ground y 0; plywood hoarding at x +-60, z +-48):
     T1 lobby  = SITE ENTRANCE GATE (SW, x -60..-44, z -48..-38): security cabin, PPE lockers; gates N (laydown) and E (south road).
     South road (z -48..-34): concrete haul road along the hoarding, the long route T1 -> B; a two-high container wall on its north
               side (z -33) with three gaps (west x -29..-24, mid x -12..-7.5, east x 5..12) into the laydown and mid.
     West laydown (x -60..-25, z -31..30): rebar shop shed (open portal frame), precast panel racks, scaffold tube stock, the
               container stores (x -24, a wall with gaps toward mid), the covered walkway from the T1 north gate.
     MID       = haul road + tower crane (x -22..28, z -31..3): crane footing, mixer truck, skips, washout, pipes, hoist.
     BUILDING  (x -12.3..24.3, z 3.7..28.3), concrete frame on a 6 m grid, storeys 4 m: L0 .2, L1 4.2, L2 8.2; L3 12.2 poured over
               the south half only (not playable). Core x 0..10, z 12..20: lift shaft (x 0..4) + switchback stair (x 4..10).
               Scaffold stair towers: west (x -14.9..-12.3, L0-L1) and east (x 24.3..26.9, L0-L1-L2). West void stair L1-L2.
               L1 = blockwork going up (rooms, half-built walls); L0 = open storey under props and festoons.
     SITE A    = L2 around the core (x -2..20, z 6..27, y 8.2). Ways in: core stair, east tower, west void stair.
     SITE B    = material yard (x 33..53, z -22..0, ground), fenced. Ways in: W (from mid), S (from the south road), N (east yard).
     East yard (x 27..60, z 8..32): office / drying-room cabins, generator and bowser, the defenders' rotation A <-> B.
     T2 lobby  = CANTEEN CABIN BLOCK (NE, x 38..56, z 34..42): gates S (two) and W; upper cabins on its roof and a walkway deck
               along its south face reached by a steel stair (overlooks the east yard).
     North strip (z 31..48): workers' car park, portaloos, spoil heap + excavator, skips: the north flank T1 -> A / T2.
   Out of bounds: streets and the city (offices, brick terraces, a glass tower) all round. Prefabs: js/maps/kit_construction.js.
   Notes: tools/test/out/notes-map-construction.md */
import { kit, decal, paint, pave, railing, stair, deck, fence, finish, farGround, rng, YEL, WHT, RED,
  shoring, scaffold, stairTower, edgeGuard, hoarding, festoon, workLight, portaloo, skip, excavator, mixerTruck, towerCrane,
  cityBuilding, concretePipes, plyStack, beamStack, lightTower, hcol } from '../kit_construction.js';

const PI = Math.PI, H = PI / 2;
const L0 = .2, L1 = 4.2, L2 = 8.2, L3 = 12.2, SL = .25;          // slab tops and thickness
const BX0 = -12.3, BX1 = 24.3, BZ0 = 3.7, BZ1 = 28.3;          // building slab edges
const L3Z = 16.25;                                                // L3 is poured south of this line
const GX = [-12, -6, 0, 6, 12, 18, 24], GZ = [4, 10, 16, 22, 28];
const inCore = (x, z) => x >= -.1 && x <= 10.1 && z >= 11.9 && z <= 20.1;
const VOID = [-11.6, 17.2, -6.4, 27];                             // L2 slab void over the west stair
const face = (x, z, tx, tz) => Math.atan2(tx - x, tz - z);
const mound = (x, z) => { const d = Math.hypot((x - 20) / 7.5, (z - 39) / 5); return d < 1 ? 2.4 * (.5 + .5 * Math.cos(PI * d)) : 0; };
const BLOCK = 'concrete_panels';

export default {
  id: 'construction', name: 'Skyline Phase II', size: 'M', chunk: 64,
  desc: 'City-block construction site on a bright day: a three-storey concrete frame with a stair core and scaffold towers, a tower crane over the haul road, the fenced material yard and the site cabins.',
  env: { hdri: 'partly_cloudy', sky: 'hdri', time: 'day', exposure: 1.0, sun: { dir: [.42, -.78, .46], color: [1, .96, .9], intensity: 1 },
    fog: { color: [.7, .76, .84], density: .0018 }, weather: 'clear', wind: [2.5, 1], ambience: 'construction', reverb: 'outdoor', indoorIbl: .32, puddles: .15 },
  bounds: { minX: -64, maxX: 64, minZ: -52, maxZ: 52, minY: -3, maxY: 60 },

  build(B) {
    const R = rng(4242);
    const CASTS = new Set(['container', 'container_40', 'site_cabin', 'crate_stack', 'dumpster', 'generator', 'car', 'box_truck', 'semi_trailer', 'truck_tractor', 'forklift', 'rack']);
    const prop0 = B.prop.bind(B);
    B.prop = (type, x, y, z, o = {}) => prop0(type, x, y, z, Object.assign({ cast: CASTS.has(type) }, o));
    const box = (x, y, z, w, h, d, mat, o = {}) => B.box(x, y, z, w, h, d, { mat, ...o });
    const cont = (x, y, z, ry, len, variant, doors = 'none') => B.prop('container', x, y, z, { ry, len, variant, doors });
    const block = (x0, z0, x1, z1, h = 6) => B.box((x0 + x1) / 2, 0, (z0 + z1) / 2, Math.abs(x1 - x0) || .2, h, Math.abs(z1 - z0) || .2, { visible: false, ray: false, surf: 'wood' });

    // ================================================================ ground
    pave(B, [
      [-62.6, -50.6, 62.6, -48.1, 'pavement'], [-62.6, 48.1, 62.6, 50.6, 'pavement'], [-62.6, -48.1, -60.1, 48.1, 'pavement'], [60.1, -48.1, 62.6, 48.1, 'pavement'],
      [-64, -52, 64, -50.6, 'asphalt'], [-64, 50.6, 64, 52, 'asphalt'], [-64, -50.6, -62.6, 50.6, 'asphalt'], [62.6, -50.6, 64, 50.6, 'asphalt'],
      [-60, -48, -44, -38, 'asphalt'],                       // entrance pen
      [-44, -48, 60, -34, 'concrete_floor'],                 // south road (hardstanding)
      [28, -34, 60, 6, 'concrete_floor'],                    // material yard slab
      [-24, -34, 28, 2, 'gravel'],                           // haul road / mid
      [11.6, 32.4, 28.4, 45.6, 'none'],                      // spoil heap (own heightfield)
      [-60, 32, -30, 48, 'asphalt'],                         // car park
      [-30, 30, 36, 48, 'dirt'],                             // north strip
      [36, 30, 60, 48, 'concrete_floor'],                    // cabin pad
    ], 'gravel', { x0: -64, z0: -52, x1: 64, z1: 52 }, 1.6);
    B.ground({ minX: 11.6, maxX: 28.4, minZ: 32.4, maxZ: 45.6, mat: 'dirt', res: 1.2, height: mound });
    // the city ground beyond the play area (scenery, no collider)
    farGround(B, -220, 220, -220, 220, 20, 'asphalt', () => -.03);

    // ================================================================ hoarding (perimeter) + an invisible cap so nothing climbs over
    const hz = { paint: 'p_paint_darkgrey' };
    hoarding(B, -60, -48, 60, -48, { ...hz });          // south (walking +x: right side = -z = outside)
    hoarding(B, 60, 48, -60, 48, { ...hz });            // north (walking -x: right = +z)
    hoarding(B, -60, 48, -60, -48, { ...hz });          // west (walking -z: right = -x)
    hoarding(B, 60, -48, 60, 48, { ...hz });            // east (walking +z: right = +x)
    for (const [x0, z0, x1, z1] of [[-60, -48, 60, -48], [-60, 48, 60, 48], [-60, -48, -60, 48], [60, -48, 60, 48]]) block(x0, z0, x1, z1, 9);

    // ================================================================ T1 lobby: site entrance pen
    const T1 = { x0: -60, z0: -48, x1: -44, z1: -38 };
    hoarding(B, -60, -38, -44, -38, { h: 2.7, inside: 'plywood', paint: 'p_paint_darkgrey', openings: [{ at: 8, w: 2.8, h: 2.7 }], noBrace: true, postSide: 1 });
    hoarding(B, -44, -48, -44, -38, { h: 2.7, inside: 'plywood', paint: 'p_paint_darkgrey', openings: [{ at: 5, w: 2.8, h: 2.7 }], noBrace: true, postSide: 1 });
    B.box(-56, 2.7, -38, 8, 5, .1, { visible: false, ray: false }); B.box(-47.6, 2.7, -38, 7.2, 5, .1, { visible: false, ray: false });
    B.box(-44, 2.7, -45.5, .1, 5, 5, { visible: false, ray: false }); B.box(-44, 2.7, -39.8, .1, 5, 3.6, { visible: false, ray: false });
    B.box(-52, 2.7, -38, 3, 5, .1, { visible: false, ray: false }); B.box(-44, 2.7, -43, .1, 5, 3, { visible: false, ray: false });
    B.lobby(1, { ...T1, y: 0 }, [{ x: -52, z: -38, w: 2.8, h: 2.7 }, { x: -44, z: -43, w: 2.8, h: 2.7, ry: H }]);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) B.spawn(1, -53.6 + i * 2.5, 0, -46.2 + j * 2.6, face(0, 0, 1, 1));
    B.prop('site_cabin', -57.3, 0, -44.2, { ry: H, variant: 'blue' });                       // security cabin (door faces east)
    B.prop('lockers', -57.6, 0, -38.35, { ry: PI, n: 4, variant: 'blue' });
    B.prop('fire_extinguisher', -55.2, 0, -38.08, { ry: PI });
    B.prop('bench', -47.2, 0, -47.5, { variant: 'metal', len: 2.4 });
    box(-46.9, 0, -38.35, 1.9, 1.6, .5, 'p_coat_yellow');                                    // PPE rack
    for (let i = 0; i < 5; i++) { box(-47.7 + i * .38, 1.15, -38.5, .3, .18, .22, i % 2 ? 'p_plastic_yellow' : 'p_plastic_orange', { collide: false }); box(-47.7 + i * .38, .55, -38.5, .32, .5, .06, 'p_plastic_yellow', { collide: false }); }
    decal(B, 'sign', 'entrance', -52, 3.0, -38.07, 3.6, .33, { face: 's' });
    decal(B, 'sign', 'ppe', -52, 2.95, -37.93, 3.0, .27, { face: 'n' });
    decal(B, 'sign', 'rules', -58.6, 1.5, -38.06, .9, 1.25, { face: 's' });
    decal(B, 'sign', 'keep', -44.07, 3.0, -43, 2.6, .28, { face: 'w' });
    decal(B, 'sign', 'deliv', -43.93, 3.0, -43, 2.6, .28, { face: 'e' });
    for (const [x, z] of [[-50, -44], [-56, -41], [-46, -46]]) decal(B, 'stain', R() < .5 ? 'oil1' : 'tyre', x, .013, z, 3, 2, { face: 'u', ry: R() * PI });

    // ================================================================ T2 lobby: canteen cabin block, its roof cabins and walkway
    B.room({ x: 47, z: 38, w: 18, d: 8, y: .15, h: 2.8, t: .15, wall: 'p_paint_cream', outer: 'p_paint_cream', floor: 'p_wood_light', ceil: 'plaster_white', roof: 'p_paint_darkgrey',
      doors: { s: [{ at: 5, w: 2.6, h: 2.6, frame: false }, { at: 13, w: 2.6, h: 2.6, frame: false }], w: [{ at: 4, w: 2.6, h: 2.6, frame: false }] },
      windows: { n: [{ at: 4, w: 1.6, glass: true }, { at: 9, w: 1.6, glass: true }, { at: 14, w: 1.6, glass: true }], e: [{ at: 4, w: 1.4, glass: true }] }, frames: 'steel_dark' });
    B.box(47, 0, 38, 18.4, .15, 8.4, { mat: 'p_paint_darkgrey' });
    B.lobby(2, { x0: 38.2, z0: 34.2, x1: 55.8, z1: 41.8, y: .15 }, [{ x: 43, z: 34.07, w: 2.6, h: 2.6 }, { x: 51, z: 34.07, w: 2.6, h: 2.6 }, { x: 38.07, z: 38, w: 2.6, h: 2.6, ry: H }]);
    for (let i = 0; i < 6; i++) for (let j = 0; j < 2; j++) B.spawn(2, 40.2 + i * 2.6, .15, 35.8 + j * 2.6, face(0, 0, -1, -1));
    for (const x of [41.2, 45.6, 50]) B.prop('dining_table', x, .15, 40.9, { variant: 'white', chairs: 4 });
    B.prop('lockers', 55.35, .15, 36.4, { ry: -H, n: 5, variant: 'grey' });
    B.prop('vending_machine', 55.2, .15, 40.6, { ry: -H, variant: 'drinks' });
    B.prop('fridge', 39.0, .15, 41.35, { ry: PI, variant: 'white' });
    B.prop('whiteboard', 47, 1.0, 34.23, { w: 2.4 });
    B.prop('wall_clock', 52, 2.3, 34.23, {});
    B.prop('fire_extinguisher', 38.27, .15, 35.3, { ry: H });
    B.prop('poster', 44.3, 1.3, 41.77, { ry: PI, i: 2 }); B.prop('poster', 53.2, 1.3, 41.77, { ry: PI, i: 4 });
    for (const x of [42, 47, 52]) B.prop('light_fixture', x, 2.95, 38, { variant: 'troffer' });
    B.light({ x: 44, y: 2.95, z: 38, intensity: 6, fixture: false, color: [1, .95, .88] });
    B.light({ x: 51, y: 2.95, z: 38, intensity: 6, fixture: false, color: [1, .95, .88] });
    decal(B, 'sign', 'canteen', 47, 3.25, 33.91, 3.2, .29, { face: 's' });
    decal(B, 'sign', 'first', 55.9, 2.5, 39.5, 1.6, .15, { face: 'e' });
    // roof: two office cabins, and the walkway deck along the south face reached by a stair from the west
    B.prop('site_cabin', 42.2, 3.1, 38.4, { ry: PI, variant: 'cream', interior: true });
    B.prop('site_cabin', 50.6, 3.1, 38.4, { ry: PI, variant: 'grey', interior: true });
    deck(B, 38, 31.8, 56, 33.85, 3.1, { beamMat: 'p_paint_grey' });
    { const K = kit(B, 47, 32.8); for (let x = 38.2; x <= 56; x += 4.45) for (const z of [31.95]) K.box('p_paint_grey', x, 0, z, .15, 2.78, .15); }
    for (let x = 38.2; x <= 56; x += 4.45) B.collider({ cx: x, cy: 1.39, cz: 31.95, hx: .08, hy: 1.39, hz: .08, surf: 'metal' });
    railing(B, 38.9, 31.8, 56, 31.8, 3.1); railing(B, 56, 31.8, 56, 33.85, 3.1);
    stair(B, { x: 34.4, z: 32.8, w: 1.1, len: 7, y0: 0, y1: 3.1, dir: '+x', rails: 'both' });
    deck(B, 37.9, 31.8, 38.9, 33.85, 3.1, { beam: false });
    edgeGuard(B, 38.1, 41.9, 55.9, 41.9, 3.1, { collide: false });
    B.box(47, 3.1, 41.95, 18, 1.2, .1, { visible: false, ray: false });
    B.box(56, 3.1, 38, .1, 1.2, 8, { visible: false, ray: false });

    // ================================================================ building: slabs, columns, core
    const slab = (x0, z0, x1, z1, y, o = {}) => B.box((x0 + x1) / 2, y - SL, (z0 + z1) / 2, x1 - x0, SL, z1 - z0, { mat: 'concrete', mats: { t: o.top || 'concrete_floor', b: 'concrete' }, ...o.box });
    B.box((BX0 + BX1) / 2, 0, (BZ0 + BZ1) / 2, BX1 - BX0, L0, BZ1 - BZ0, { mat: 'concrete', mats: { t: 'concrete_floor' } });
    const L1R = [[BX0, BZ0, BX1, 12], [BX0, 20, BX1, BZ1], [BX0, 12, 0, 20], [10, 12, BX1, 20]];
    for (const r of L1R) slab(...r, L1);
    const [vx0, vz0, vx1, vz1] = VOID;
    for (const r of [[BX0, BZ0, BX1, 12], [10, 12, BX1, 20], [BX0, 12, 0, vz0], [BX0, vz0, vx0, BZ1], [vx1, vz0, 0, 20], [vx1, 20, BX1, BZ1], [vx0, vz1, vx1, BZ1]]) slab(...r, L2);
    slab(BX0, BZ0, BX1, L3Z, L3);
    // stair shaft landings (inner x 4.15..9.85, z 12.15..19.85)
    for (const y of [L1, L2]) slab(4.15, 12.15, 9.85, 13.6, y);
    for (const y of [L0 + 2, L1 + 2]) slab(4.15, 17.6, 9.85, 19.85, y);
    // columns (per storey, between slab top and the slab above); north of the L3 pour they stand with starter bars
    const KC = kit(B, 6, 16, true);
    for (const x of GX) for (const z of GZ) {
      if (inCore(x, z)) continue;
      for (const [y0, y1] of [[L0, L1 - SL], [L1, L2 - SL], [L2, L3 - SL]]) B.box(x, y0, z, .5, y1 - y0, .5, { mat: 'p_concrete_precast' });
      if (z > L3Z) for (let i = 0; i < 4; i++) KC.box('metal_rust', x + (i % 2 ? .17 : -.17), L3 - SL, z + (i < 2 ? .17 : -.17), .025, .9, .025);
      else if (z > 12) for (let i = 0; i < 4; i++) KC.box('metal_rust', x + (i % 2 ? .17 : -.17), L3, z + (i < 2 ? .17 : -.17), .025, .7, .025);
    }
    // starter bars along the L3 pour edge, and the shutter (stop-end) board under it
    for (let x = BX0 + .3; x < BX1; x += .3) KC.box('metal_rust', x, L3 - .14, L3Z + .35, .02, .02, .8);
    KC.box('plywood', (BX0 + BX1) / 2, L3 - SL - .05, L3Z + .02, BX1 - BX0, .32, .03);
    // core walls (t .3), per storey; the core is also cast up to L3 on its south half
    for (const [y0, k] of [[L0, 0], [L1, 1], [L2, 2]]) {
      const h = 4 - SL, w = { y: y0, h, t: .3, mat: 'concrete', mat2: 'concrete' };
      B.wall(0, 12, 10, 12, { ...w, openings: [{ at: 2, w: 1.6, h: 2.4 }, { at: 7.1, w: 1.9, h: 2.3 }] });
      B.wall(0, 20, 10, 20, k < 2 ? w : { ...w, h: 2.6 });
      B.wall(0, 12.15, 0, 19.85, k < 2 ? w : { ...w, h: 2.6 });
      B.wall(10, 12.15, 10, 19.85, k < 2 ? w : { ...w, h: 2.6 });
      B.wall(4, 12.15, 4, 19.85, { ...w, t: .25, ...(k < 2 ? {} : { h: 2.6 }) });
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
    stairTower(B, -13.6, 14, [0, L1], { open: [{ level: 1, side: 'e' }], outer: 'w' });
    stairTower(B, 25.6, 14, [0, L1, L2], { open: [{ level: 1, side: 'w' }, { level: 2, side: 'w' }], outer: 'e' });
    decal(B, 'sign', 'load', 25.6, 1.6, 10.37, 1.4, .13, { face: 's' });
    decal(B, 'sign', 'load', -13.6, 1.6, 10.37, 1.4, .13, { face: 's' });

    // slab edge protection on L1 / L2 (gaps where the towers meet the slab), L3 for show
    for (const y of [L1, L2]) {
      edgeGuard(B, BX0 + .1, BZ0 + .1, BX1 - .1, BZ0 + .1, y);
      edgeGuard(B, BX0 + .1, BZ1 - .1, BX1 - .1, BZ1 - .1, y);
      if (y === L1) { edgeGuard(B, BX0 + .1, BZ0 + .1, BX0 + .1, 10.3, y); edgeGuard(B, BX0 + .1, 11.7, BX0 + .1, BZ1 - .1, y); }
      else edgeGuard(B, BX0 + .1, BZ0 + .1, BX0 + .1, BZ1 - .1, y);
      edgeGuard(B, BX1 - .1, BZ0 + .1, BX1 - .1, 10.3, y); edgeGuard(B, BX1 - .1, 11.7, BX1 - .1, BZ1 - .1, y);
    }
    edgeGuard(B, BX0 + .1, BZ0 + .1, BX1 - .1, BZ0 + .1, L3, { collide: false });
    edgeGuard(B, BX0 + .1, BZ0 + .1, BX0 + .1, L3Z - .1, L3, { collide: false }); edgeGuard(B, BX1 - .1, BZ0 + .1, BX1 - .1, L3Z - .1, L3, { collide: false });
    for (const [y, t] of [[L0, 'l0'], [L1, 'l1'], [L2, 'l2']]) { decal(B, 'sign', t, 5.2, y + 2.55, 11.83, 1.6, .15, { face: 's' }); decal(B, 'sign', 'core', 7.1, y + 2.55, 11.83, 1.6, .15, { face: 's' }); }
    for (const y of [L1, L2]) decal(B, 'sign', 'lift', 2, y + 2.65, 11.83, 1.6, .15, { face: 's' });
    decal(B, 'sign', 'void', -9, L2 + .012, 16.7, 2.4, .22, { face: 'u' });
    for (const [x, z, t] of [[-6, 10, 'grid'], [12, 22, 'grid2'], [18, 10, 'grid3'], [-6, 22, 'grid2'], [12, 10, 'grid'], [0, 4, 'grid3']]) for (const y of [L0, L1, L2])
      decal(B, 'sign', t, x, y + 1.7, z - .26, .32, .14, { face: 's' });

    // L0: shoring under L1 in two bays, materials, festoons; the lift pit is a dark corner
    shoring(B, 18.6, 4.4, 23.6, 9.6, L0, L1 - SL);
    shoring(B, -11.6, 22.6, -6.6, 27.6, L0, L1 - SL);
    shoring(B, 13, 22.6, 17, 27.6, L1, L2 - SL);
    shoring(B, 19, 4.4, 23.6, 15.6, L2, L3 - SL);
    shoring(B, -11.6, 4.4, -7, 15.6, L2, L3 - SL);
    plyStack(B, -2, 22, .1, .9, { beams: true }); plyStack(B, 14.5, 17.5, H, .6);
    B.prop('pallet', -5.5, L0, 6.5, { variant: 'bricks', stack: 1 }); B.prop('pallet', -4.1, L0, 6.6, { variant: 'bricks', stack: 1 }); B.prop('pallet', -4.8, L0, 8, { variant: 'sacks', stack: 1 });
    B.prop('cement_mixer', -1.5, L0, 5.4, { ry: .6, variant: 'orange' });
    B.prop('pallet', 15, L0, 6, { variant: 'wrap', stack: 2 }); B.prop('pallet', 16.4, L0, 6.2, { variant: 'boxes', stack: 1 });
    B.prop('drum', 22.8, L0, 18, { n: 3, variant: 'blue' }); B.prop('ibc_tank', 21.5, L0, 26.4, { variant: 'white' });
    B.prop('crate_stack', -3, L0, 26.8, { n: 4 }); B.prop('gas_cylinder', 11.2, L0, 21.5, { rack: true, variant: 'oxygen' });
    B.prop('rebar_bundle', 18, L0, 13.5, { ry: 0 }); B.prop('rebar_bundle', 19.4, L0, 13.2, { ry: .04 });
    B.prop('scaffolding', -6, L0, 13.5, { ry: H, bays: 1, levels: 1 });
    box(-0.6, L0, 21.4, .6, 1.3, .3, 'p_coat_yellow');                                       // site distribution board on the core
    workLight(B, 2, L0, 9, PI * .9); workLight(B, 20, L1, 25, PI * 1.2);
    festoon(B, [[-11, L1 - .45, 7], [-6, L1 - .35, 7], [0, L1 - .45, 7], [6, L1 - .35, 7], [12, L1 - .45, 7], [18, L1 - .35, 7], [23.5, L1 - .45, 7]]);
    festoon(B, [[-11, L1 - .45, 25], [-6, L1 - .35, 25], [0, L1 - .45, 25], [6, L1 - .35, 25], [12, L1 - .45, 25], [18, L1 - .35, 25], [23.5, L1 - .45, 25]]);
    festoon(B, [[-11, L2 - .45, 13], [-6, L2 - .35, 13], [-.5, L2 - .45, 10.6], [10.5, L2 - .45, 10.6], [18, L2 - .35, 13], [23.5, L2 - .45, 13]]);
    festoon(B, [[-11, L2 - .45, 25], [-6, L2 - .35, 25], [0, L2 - .45, 23], [6, L2 - .35, 23], [12, L2 - .45, 25], [18, L2 - .35, 25], [23.5, L2 - .45, 25]]);
    festoon(B, [[-11, L3 - .45, 7], [-3, L3 - .35, 7], [6, L3 - .45, 7], [14, L3 - .35, 7], [23.5, L3 - .45, 7]]);
    for (const [x, y, z] of [[-3, L0, 8], [9, L0, 8], [18, L0, 20], [-6, L0, 20], [-3, L1, 7], [13, L1, 7], [-2, L1, 25], [16, L1, 25], [5, L2, 7], [-6, L2, 9]])
      B.light({ x, y: y + 3.6, z, intensity: 3.2, color: [1, .82, .6], fixture: false, range: 9 });
    // building signage
    decal(B, 'sign', 'edge', 6, L1 + 1.9, BZ0 - .02, 3.2, .3, { face: 's' });
    decal(B, 'sign', 'edge', 6, L2 + 1.9, BZ0 - .02, 3.2, .3, { face: 's' });
    // scaffold on the north face (debris netting at the top lift), a material hoist on the south face
    scaffold(B, BX1, BZ1 + .05, BX0, BZ1 + .05, { lifts: [L1, L2, L3], top: L3 + 1.2, net: [L2 + .2, L3 + 1.2] });
    {
      const K = kit(B, 15, 2.4), hx = 15, hzc = 2.6;
      for (let y = 0; y < L3 + 3; y += 1.5) { for (const [a, b] of [[-.3, -.3], [.3, -.3], [.3, .3], [-.3, .3]]) K.box('p_coat_yellow', hx + a - .03, y, hzc + b - .03, .06, 1.5, .06); K.box('p_coat_yellow', hx, y + 1.45, hzc, .66, .05, .66); }
      K.box('p_galv', hx, 0, hzc - 1.6, 1.6, .2, 2.4); K.box('grate', hx - .8, .2, hzc - 1.6, .03, 2.2, 2.4); K.box('grate', hx + .8, .2, hzc - 1.6, .03, 2.2, 2.4);
      K.box('p_galv', hx, 2.4, hzc - 1.6, 1.6, .12, 2.4); K.box('p_coat_yellow', hx, 2.52, hzc - 1.6, 1.0, .3, .3);
      B.box(hx, 0, hzc, .7, L3 + 3, .7, { visible: false, surf: 'metal' });
      B.box(hx, 0, hzc - 1.6, 1.7, 2.6, 2.4, { visible: false, surf: 'metal', ray: false });
      fence(B, 13.5, -.6, 16.5, -.6, { plain: true, h: 2 });
      decal(B, 'sign', 'hoist', hx, 1.8, -.66, 1.6, .15, { face: 's' });
    }

    // L1: blockwork going up (full-height walls stop inside the slab above; half-built runs with block pallets)
    const FH = 4 - SL - .1, bw = (x0, z0, x1, z1, o = {}) => B.wall(x0, z0, x1, z1, { y: L1, h: o.h || FH, t: .2, mat: BLOCK, mat2: BLOCK, openings: o.op });
    bw(BX0 + .3, 10, -1.2, 10, { op: [{ at: 3.2, w: 1.1, h: 2.1 }, { at: 8.6, w: 1.1, h: 2.1 }] });
    bw(-6, 16.6, -6, BZ1 - .3, { op: [{ at: 3.2, w: 1.1, h: 2.1 }, { at: 8.8, w: 1.1, h: 2.1 }] });
    bw(BX0 + .3, 16.4, -6.1, 16.4, { h: 1.25 });
    bw(16, BZ0 + .3, 16, 10, { op: [{ at: 3.0, w: 1.1, h: 2.1 }] });
    bw(10.2, 22, BX1 - .3, 22, { op: [{ at: 2.6, w: 1.1, h: 2.1 }, { at: 9.4, w: 1.2, h: 2.1 }] });
    bw(16.1, 10.2, 22.5, 10.2, { h: 1.45 });
    bw(0.2, 23.8, 0.2, BZ1 - .3, { h: 1.0 });
    B.prop('pallet', -9, L1, 15.2, { variant: 'bricks', stack: 1 }); B.prop('pallet', -10.4, L1, 15.0, { variant: 'bricks', stack: 1 });
    B.prop('pallet', 20.5, L1, 8.8, { variant: 'bricks', stack: 1 }); B.prop('pallet', 1.4, L1, 26.4, { variant: 'sacks', stack: 1 });
    B.prop('cement_mixer', -3.4, L1, 14.5, { ry: 2.2, variant: 'yellow' });
    B.prop('scaffolding', 13, L1, 14.5, { ry: 0, bays: 1, levels: 1 });
    B.prop('cardboard_box', 20.5, L1, 26, { variant: 'pile', n: 5 });
    B.prop('drum', -10.8, L1, 5.0, { n: 2, variant: 'black' });
    B.prop('crate', 13.4, L1, 5.2, { variant: 'ply' }); B.prop('crate', 13.5, L1, 6.3, { variant: 'large' });
    for (const [x, z] of [[-9, 6.5], [6, 25], [19, 15]]) decal(B, 'stain', 'dust', x, L1 + .012, z, 3, 3, { face: 'u', ry: R() * PI });

    // L2 = SITE A: formwork, rebar, materials on the open deck around the core
    plyStack(B, 3.6, 8.6, .05, .9, { beams: true });
    beamStack(B, 14.2, 7.6, H, 4);
    B.prop('rebar_bundle', 7.5, L2, 24.6, { ry: H, len: 6 }); B.prop('rebar_bundle', 7.6, L2, 25.6, { ry: H + .03, len: 6 });
    B.prop('pallet', -1.2, L2, 18.6, { variant: 'bricks', stack: 2 }); B.prop('pallet', -1.2, L2, 20.0, { variant: 'sacks', stack: 1 });
    B.prop('pallet', 12.2, L2, 13.2, { variant: 'sacks', stack: 2 }); B.prop('pallet', 13.6, L2, 13.3, { variant: 'wrap', stack: 1 });
    B.prop('ibc_tank', 18.2, L2, 26.6, { variant: 'white' }); B.prop('drum', 20.4, L2, 21.5, { n: 2, variant: 'yellow' });
    B.prop('scaffolding', 17.5, L2, 18, { ry: H, bays: 1, levels: 1 });
    B.cyl(2.4, L2, 24, .75, 1.25, { mat: 'p_galv', sides: 14 });                             // crane concrete skip
    box(2.4, L2 + 1.25, 24, .3, .5, .08, 'p_coat_yellow', { collide: false });
    B.prop('crate_stack', 10.6, L2, 25.8, { n: 4 }); B.prop('cardboard_box', -1.5, L2, 7, { variant: 'pile', n: 4 });
    workLight(B, 9.5, L2, 21.5, -2.4);
    for (const [x, z] of [[4, 18], [12, 20], [8, 9]]) decal(B, 'stain', R() < .5 ? 'patch' : 'dust', x, L2 + .012, z, 3.4, 3.4, { face: 'u', ry: R() * PI });
    decal(B, 'stain', 'water', 6, L2 + .012, 26, 4, 3, { face: 'u' });

    // ================================================================ MID: haul road, tower crane, mixer, skips, washout
    towerCrane(B, 6, -9, 38, .62, { jib: 52, cjib: 16, trolley: 30, hookY: 22 });
    decal(B, 'sign', 'crane', 6, 2.0, -10.08, 1.9, .2, { face: 's' });
    mixerTruck(B, -6.5, -16, .35);
    skip(B, 17.5, -23.5, .25); skip(B, -1.5, -27.5, H + .1, { mat: 'p_coat_blue' });
    concretePipes(B, 19, -9.5, .05, 3);
    plyStack(B, 15, -1.2, .08, .7, { beams: true });
    beamStack(B, -10.8, -4.5, .1, 3);
    B.prop('cement_mixer', 22, 0, 2.1, { ry: 2.6, variant: 'yellow' });
    B.prop('generator', 23.2, 0, -4.2, { ry: -H, variant: 'yellow' });
    B.prop('pallet', -14.6, 0, -17, { variant: 'bricks', stack: 1 }); B.prop('pallet', -14.8, 0, -18.4, { variant: 'bricks', stack: 1 });
    B.prop('pallet', 10.8, 0, -18.2, { variant: 'sacks', stack: 2 });
    B.prop('jersey_barrier', 8.5, 0, -29.2, { len: 3 }); B.prop('jersey_barrier', 3, 0, -21.5, { ry: .15 });
    B.prop('cone', 6.3, 0, -28.7, { variant: 'drum' }); B.prop('cone', 11.2, 0, -28.8, { variant: 'drum' });
    // concrete washout bay
    for (const [x, z, w, d] of [[-14.5, -24.5, 4.4, .3], [-14.5, -27.9, 4.4, .3], [-16.55, -26.2, .3, 3.1]]) box(x, 0, z, w, .7, d, 'p_concrete_precast');
    box(-14.3, 0, -26.2, 3.8, .2, 3.1, 'concrete_dark', { collide: false });
    decal(B, 'sign', 'mixer', -14.5, .55, -24.33, 1.6, .15, { face: 'n' });
    decal(B, 'stain', 'patch', -13.8, .21, -26.2, 3, 2.6, { face: 'u' });
    // tyre tracks and stains on the haul road
    for (let i = 0; i < 9; i++) decal(B, 'stain', i % 2 ? 'tyre' : 'tyre2', -14 + i * 4.5, .013, -13 + R() * 6, 4.6, 1.6, { face: 'u', ry: R() * .3 });
    for (const [x, z] of [[-8, -20], [4, -3], [12, -14], [-2, -10], [20, -16]]) decal(B, 'stain', ['oil0', 'oil2', 'drip'][(R() * 3) | 0], x, .013, z, 2.4, 2.4, { face: 'u', ry: R() * PI });
    lightTower(B, -19, -1.5, .4);

    // ================================================================ SOUTH ROAD + the container wall (gaps: west, mid, east)
    cont(-35, 0, -33.2, H, 40, 'blue'); cont(-38, 2.59, -33.2, H, 20, 'red');
    cont(-17.9, 0, -33.2, H, 40, 'green'); cont(-17.9, 2.59, -33.2, H, 40, 'grey');
    cont(-4.4, 0, -33.2, H, 20, 'orange'); cont(1.8, 0, -33.2, H, 20, 'white'); cont(-1.3, 2.59, -33.2, H, 40, 'rust');
    cont(18.1, 0, -33.2, H, 40, 'red'); cont(15.3, 2.59, -33.2, H, 20, 'blue');
    B.prop('jersey_barrier', 8.6, 0, -33.6, { len: 3 });
    fence(B, 24.3, -33.2, 27.6, -33.2, { plain: true });
    // B's south boundary: a container, the S entrance (x 39.5..46), then fence to the hoarding
    cont(33.4, 0, -31.6, H, 40, 'grey');
    fence(B, 46, -31.6, 59.8, -31.6, { plain: true });
    B.prop('gate', 42.7, 0, -31.6, { variant: 'chainlink', len: 6.4, open: 100 });
    // parked on the road
    B.prop('semi_trailer', -4, 0, -44.6, { ry: H, variant: 'flat' });
    for (let i = 0; i < 4; i++) box(-4.4, 1.3, -45.4 + i * .52, 11.5, .3, .32, 'p_paint_grey', { collide: false });
    B.box(-4.4, 1.3, -44.6, 11.6, .4, 2.2, { visible: false, surf: 'metal' });
    B.prop('box_truck', 31, 0, -44.2, { ry: -H, variant: 'logo' });
    B.prop('truck_tractor', 4.4, 0, -44.6, { ry: H, variant: 'white' });
    for (const [x, z] of [[-30, -40], [-12, -38], [14, -41], [40, -42], [52, -38]]) decal(B, 'stain', R() < .5 ? 'tyre' : 'tyre2', x, .013, z, 5, 1.8, { face: 'u', ry: R() * .2 });
    paint(B, -43.5, -35.4, 26, -35.4, { col: YEL, w: .12 });
    paint(B, -43.5, -36.6, 26, -36.6, { col: YEL, w: .12 });
    for (let x = -40; x < 24; x += 6) decal(B, 'sign', 'arrow', x, .015, -36, .3, .6, { face: 'u', ry: -H });
    decal(B, 'sign', 'speed', -24, .015, -42, 2.6, .25, { face: 'u', ry: H });
    decal(B, 'sign', 'speed', 22, .015, -42, 2.6, .25, { face: 'u', ry: -H });
    decal(B, 'sign', 'keep', -40, .015, -43, 2.4, .26, { face: 'u', ry: H });
    // wheel wash at the entrance
    box(-37, 0, -44, 6, .12, 3.2, 'grate', { collide: false }); box(-37, 0, -45.75, 6, .5, .3, 'p_coat_yellow'); box(-37, 0, -42.25, 6, .5, .3, 'p_coat_yellow');
    decal(B, 'sign', 'wash', -37, .8, -45.92, 1.6, .15, { face: 's' });
    decal(B, 'stain', 'water', -33, .013, -44, 4, 3, { face: 'u' });

    // ================================================================ WEST LAYDOWN
    // container stores (a wall between the laydown and mid, with gaps)
    cont(-24, 0, -21, 0, 40, 'green'); cont(-24, 0, -7, 0, 20, 'blue'); cont(-24, 2.59, -7, 0, 20, 'white');
    cont(-24, 0, 6.2, 0, 40, 'orange', 'open');
    decal(B, 'sign', 'store', -22.74, 1.8, -21, 2.4, .22, { face: 'e' });
    // rebar shop: open portal-frame shed (clad west + half the north), benches, bending machine, offcuts
    {
      const x0 = -48, x1 = -34, z0 = -22, z1 = -12, hh = 5.2;
      for (const x of [x0, -43.3, -38.7, x1]) for (const z of [z0, z1]) hcol(B, x, z, hh, { mat: 'p_coat_blue' });
      B.box((x0 + x1) / 2, hh, (z0 + z1) / 2, x1 - x0 + 1, .12, z1 - z0 + 1, { mat: 'corrugated', mats: { b: 'corrugated' } });
      const K = kit(B, -41, -17);
      for (const z of [z0, z1, (z0 + z1) / 2]) K.box('p_coat_blue', (x0 + x1) / 2, hh - .45, z, x1 - x0, .45, .2);
      K.box('p_galv', (x0 + x1) / 2, hh + .12, z1 + .5, x1 - x0 + 1, .12, .15);
      B.wall(x0, z0, x0, z1, { h: hh, t: .06, mat: 'corrugated', mat2: 'corrugated' });
      B.wall(x0, z1, -41, z1, { h: hh, t: .06, mat: 'corrugated', mat2: 'corrugated' });
      for (const [x, z] of [[-44.5, -19], [-38.5, -19]]) { box(x, 0, z, 1.3, .85, 5.5, 'p_paint_grey'); for (let i = 0; i < 9; i++) box(x - .45 + i * .11, .85, z, .02, .02, 5.4, 'metal_rust', { collide: false }); }
      box(-44.5, 0, -14.4, 1.6, 1.15, 1.1, 'p_coat_yellow'); box(-44.5, 1.15, -14.4, .9, .1, .9, 'steel_dark', { collide: false });
      B.prop('rebar_bundle', -36, 0, -14.5, { ry: H, len: 6 }); B.prop('rebar_bundle', -36, 0, -15.6, { ry: H, len: 6 });
      B.prop('rebar_bundle', -41.3, 0, -24.8, { ry: H, len: 6 }); B.prop('rebar_bundle', -41.3, 0, -26, { ry: H, len: 6 });
      box(-47.2, 0, -21.2, 1.2, .9, 1.2, 'metal_rust');
      B.prop('light_fixture', -44.5, hh - .5, -19, { variant: 'highbay' }); B.prop('light_fixture', -38.5, hh - .5, -19, { variant: 'highbay' });
      B.light({ x: -41.5, y: hh - .6, z: -17, intensity: 6, fixture: false, color: [.95, .97, 1] });
      decal(B, 'sign', 'rebar', -44.5, 3.6, -11.96, 3.0, .27, { face: 'n' });
      decal(B, 'sign', 'permit', -47.95, 2.2, -17, 2.4, .22, { face: 'e' });
      decal(B, 'stain', 'rust', -38.5, .013, -19, 2.5, 5, { face: 'u' });
    }
    // precast wall panels on A-frame racks, scaffold stock, pallets
    for (const [x, z, ry] of [[-41, 4, 0], [-41, 12, 0]]) {
      const K = kit(B, x, z);
      K.push(x, 0, z, ry);
      K.box('p_coat_blue', 0, 0, 0, 4.4, .2, 2.4);
      for (const s of [-1, 1]) { for (let i = 0; i < 3; i++) { K.push(0, .2, s * (.35 + i * .22), s * -.12); K.box('p_concrete_precast', 0, 0, 0, 4, 2.9, .18); K.pop(); } }
      K.box('p_coat_blue', 0, .2, 0, .2, 3.1, .2);
      K.pop();
      B.box(x, 0, z, 4.4, 3.2, 2.2, { ry, visible: false, surf: 'concrete' });
    }
    {
      const K = kit(B, -52, -3);
      for (const [x, z] of [[-53, -6], [-53, -1.5]]) { K.box('p_coat_red', x, 0, z, 6.4, .9, .12); K.box('p_coat_red', x, 0, z + 1.4, 6.4, .9, .12); for (let i = 0; i < 4; i++) K.box('p_coat_red', x - 3.1 + i * 2.05, 0, z + .7, .1, 1.3, 1.5);
        for (let i = 0; i < 26; i++) K.cylX(i % 5 ? 'p_galv' : 'metal_rust', x - 3.2, x + 3.2, .2 + Math.floor(i / 9) * .1, z + .2 + (i % 9) * .13, .024, { seg: 6 });
        B.box(x, 0, z + .7, 6.5, 1.3, 1.5, { visible: false, surf: 'metal' }); }
    }
    B.prop('pallet', -30, 0, -6, { variant: 'bricks', stack: 1 }); B.prop('pallet', -31.4, 0, -6.2, { variant: 'bricks', stack: 1 }); B.prop('pallet', -30.6, 0, -4.8, { variant: 'wrap', stack: 2 });
    plyStack(B, -32, 18, .3, .8); beamStack(B, -36.5, 21, H + .1, 4);
    concretePipes(B, -50, 14, H, 2, .6);
    B.prop('crate_stack', -55.5, 0, 6, { n: 5 });
    B.prop('ibc_tank', -57.8, 0, -10, { variant: 'blue' }); B.prop('ibc_tank', -57.8, 0, -11.3, { variant: 'blue' });
    B.prop('gas_cylinder', -47.6, 0, -11.2, { rack: true, variant: 'propane' });
    lightTower(B, -30, -27, -.5);
    B.prop('generator', -56.6, 0, 24, { ry: H, variant: 'trailer' });
    skip(B, -33, 27.6, H + .05, { mat: 'p_coat_green' });
    // covered walkway (scaffold tunnel) from the T1 north gate
    {
      const K = kit(B, -52, -33), x0 = -54, x1 = -50, z0 = -37.6, z1 = -28;
      for (let z = z0; z <= z1 + .01; z += 2.4) for (const x of [x0, x1]) { K.cyl('p_galv', x, 0, z, .024, 2.9, { seg: 6 }); B.collider({ cx: x, cy: 1.45, cz: z, hx: .05, hy: 1.45, hz: .05, surf: 'metal' }); }
      for (const x of [x0, x1]) K.cylZ('p_galv', z0, z1, x, 2.7, .024, { seg: 6 });
      for (let z = z0; z <= z1; z += 2.4) K.cylX('p_galv', x0 - .1, x1 + .1, 2.75, z, .024, { seg: 6 });
      K.box('plywood', (x0 + x1) / 2, 2.8, (z0 + z1) / 2, x1 - x0 + .4, .04, z1 - z0, { mats: { b: 'plywood' } });
      K.box('p_coat_yellow', (x0 + x1) / 2, 2.84, z0, x1 - x0 + .4, .2, .03); K.box('p_coat_yellow', (x0 + x1) / 2, 2.84, z1, x1 - x0 + .4, .2, .03);
      K.box('p_tarp_blue', x0 - .03, 1.2, (z0 + z1) / 2, .01, 1.5, z1 - z0);
      paint(B, -52, -37.6, -52, -28.2, { col: YEL, w: .1, dash: [1, .6] });
      B.light({ x: -52, y: 2.75, z: -33, intensity: 2.5, fixture: 'tube', color: [.95, .97, 1] });
    }
    for (const [x, z] of [[-45, -2], [-36, 25], [-56, -20], [-30, 10]]) decal(B, 'stain', R() < .5 ? 'tyre2' : 'oil1', x, .013, z, 4, 2, { face: 'u', ry: R() * PI });

    // ================================================================ NORTH STRIP: car park, portaloos, spoil heap, excavator
    const carT = ['sedan', 'hatch', 'suv', 'pickup', 'van'];
    for (let i = 0; i < 6; i++) B.prop('car', -56.4 + i * 3.1, 0, 45, { ry: 0, variant: carT[(i * 3 + 1) % 5] });
    for (let i = 0; i < 5; i++) if (i !== 2) B.prop('car', -55 + i * 3.6, 0, 34.8, { ry: PI, variant: carT[(i * 2) % 5] });
    for (let i = 0; i <= 6; i++) paint(B, -57.95 + i * 3.1, 42.4, -57.95 + i * 3.1, 47.7, { col: WHT, w: .1 });
    for (let i = 0; i <= 5; i++) paint(B, -56.8 + i * 3.6, 32.2, -56.8 + i * 3.6, 37.4, { col: WHT, w: .1 });
    for (let i = 0; i < 5; i++) portaloo(B, -27.5 + i * 1.3, 46.9, PI, i === 3 ? 'p_plastic_green' : 'p_plastic_blue');
    B.prop('litter_bin', -21, 0, 47.2, { variant: 'square' });
    skip(B, -13.5, 44.6, H + .05);
    B.prop('pallet', -4, 0, 45.6, { variant: 'pipes', stack: 1 }); B.prop('pallet', -2.6, 0, 45.6, { variant: 'cylinders', stack: 1 });
    excavator(B, 9.5, 41, H + .15, { slew: -.4 });
    for (const [x, z] of [[18, 37], [22, 41], [15.5, 40.8]]) B.prop('grass_tall', x, null, z, { variant: 'dry', w: 3.4, d: 2.6, h: 1.0 });
    for (const [x, z] of [[-8, 46.8], [30, 46.6], [-30, 31.5]]) B.prop('bush', x, 0, z, { variant: 'shrub' });
    B.prop('trash_bag', -19.6, 0, 47.2, { n: 4 });
    B.prop('rebar_bundle', -2, 0, 32, { ry: H, len: 6 }); B.prop('rebar_bundle', -2.1, 0, 33.1, { ry: H, len: 6 });
    plyStack(B, 4, 33, -.1, .5);
    decal(B, 'sign', 'muster', -45, 1.6, 47.93, 2.6, .23, { face: 's' });
    for (const [x, z] of [[-45, 39.6], [-38, 39.6], [-10, 38], [2, 40]]) decal(B, 'stain', R() < .5 ? 'oil0' : 'tyre2', x, .013, z, 3, 2, { face: 'u', ry: R() * PI });

    // ================================================================ EAST YARD: site office cabins, plant, the A <-> B rotation
    B.prop('site_cabin', 33.6, 0, 25.8, { ry: 0, variant: 'cream', interior: true });
    B.prop('site_cabin', 33.6, 2.64, 25.8, { ry: 0, variant: 'cream' });
    B.prop('site_cabin', 42.4, 0, 25.8, { ry: 0, variant: 'blue' });
    decal(B, 'sign', 'office', 33.6, 2.35, 27.63, 1.8, .16, { face: 'n' });
    decal(B, 'sign', 'brand', 33.6, 4.6, 24.0, 3.4, .3, { face: 's' });
    B.prop('generator', 55.5, 0, 22, { ry: -H, variant: 'yellow' });
    B.prop('tank', 55.6, 0, 14, { variant: 'horizontal', len: 3.6, r: .75 });
    B.prop('gas_cylinder', 51.8, 0, 28.5, { rack: true, variant: 'acetylene' });
    lightTower(B, 56.5, 28.4, -.8);
    B.prop('pallet', 47.8, 0, 17.4, { variant: 'bricks', stack: 1 }); B.prop('pallet', 49.2, 0, 17.2, { variant: 'sacks', stack: 1 });
    plyStack(B, 36.5, 15.5, H + .05, .7, { beams: true });
    B.prop('crate_stack', 45, 0, 11.4, { n: 4 });
    B.prop('drum', 30.4, 0, 19.6, { n: 3, variant: 'red' });
    for (const [x, z] of [[40, 20], [32, 12], [50, 25]]) decal(B, 'stain', R() < .5 ? 'tyre' : 'oil2', x, .013, z, 3.6, 2, { face: 'u', ry: R() * PI });
    // container row between the east yard and the material yard (the N entrance in the middle)
    cont(32.9, 0, 7.4, H, 20, 'blue'); cont(50.0, 0, 7.4, H, 40, 'green'); cont(53.0, 2.59, 7.4, H, 20, 'orange');
    fence(B, 27.6, 7.4, 29.8, 7.4, { plain: true }); fence(B, 56.2, 7.4, 59.8, 7.4, { plain: true });

    // ================================================================ SITE B: fenced material yard
    fence(B, 28, -30.4, 28, -17.5, { plain: true }); fence(B, 28, -9, 28, 6.1, { plain: true });
    B.prop('gate', 28, 0, -13.25, { ry: H, variant: 'chainlink', len: 8.4, open: 95 });
    decal(B, 'sign', 'store', 30.2, 1.8, -31.6 + 1.24, 2.4, .22, { face: 'n' });
    plyStack(B, 44, -6.5, .1, .9, { beams: true });
    plyStack(B, 39.5, -1.2, -.05, .6);
    beamStack(B, 46.5, -22, H + .05, 4);
    concretePipes(B, 36.5, -18.5, 0, 3, .55);
    for (let i = 0; i < 3; i++) B.prop('rebar_bundle', 48 + i * 1.15, 0, -13.5, { ry: 0, len: 6 });
    cont(55.6, 0, -8, -H, 20, 'rust', 'open');
    B.prop('forklift', 40.5, 0, -13, { ry: .55, variant: 'yellow' });
    B.prop('ibc_tank', 50.8, 0, -1.2, { variant: 'white' }); B.prop('ibc_tank', 52.1, 0, -1.2, { variant: 'white' });
    B.prop('pallet', 35, 0, -6, { variant: 'bricks', stack: 2 }); B.prop('pallet', 35, 0, -7.4, { variant: 'bricks', stack: 1 }); B.prop('pallet', 36.4, 0, -6.1, { variant: 'wrap', stack: 1 });
    B.prop('pallet', 49.6, 0, -18.4, { variant: 'sacks', stack: 2 }); B.prop('pallet', 51, 0, -18.4, { variant: 'sacks', stack: 1 });
    B.prop('drum', 56.5, 0, -24, { n: 4, variant: 'blue' });
    B.prop('crate_stack', 31.5, 0, -24.5, { n: 5 });
    // steel beam stack on sleepers
    { const K = kit(B, 38.5, -10.5); for (const z of [-12.5, -8.5]) K.box('p_wood_sleeper', 38.5, 0, z, 1.6, .12, .2); for (let l = 0; l < 3; l++) for (let i = 0; i < 4; i++) { const x = 38 + i * .36 - .2; K.box('p_paint_grey', x, .12 + l * .32, -10.5, .3, .02, 5.6); K.box('p_paint_grey', x, .12 + l * .32 + .3, -10.5, .3, .02, 5.6); K.box('p_paint_grey', x, .14 + l * .32, -10.5, .015, .28, 5.6); }
      B.box(38.5, 0, -10.5, 1.5, 1.08, 5.6, { visible: false, surf: 'metal' }); }
    lightTower(B, 58.2, -16, -H);
    for (const [x, z] of [[42, -16], [37, -2], [48, -8], [44, -26]]) decal(B, 'stain', ['tyre', 'oil1', 'dust', 'tyre2'][(R() * 4) | 0], x, .013, z, 3.6, 2.2, { face: 'u', ry: R() * PI });
    paint(B, 33, -22, 53, -22, { col: YEL, w: .1, dash: [.6, .4] }); paint(B, 33, 0, 53, 0, { col: YEL, w: .1, dash: [.6, .4] });

    // ================================================================ out of bounds: streets and the city
    const city = [
      [-42, -64, 34, 14, 12, 'brick', { shops: 'p_paint_maroon' }], [-6, -66, 34, 16, 21, 'office'], [28, -63, 26, 12, 9, 'old', { shops: 'p_paint_teal' }], [56, -68, 26, 22, 30, 'concrete'],
      [-44, 66, 36, 16, 24, 'concrete'], [-6, 63, 34, 12, 12, 'brick', { shops: 'p_paint_darkgrey' }], [34, 70, 30, 24, 52, 'glass'], [-82, 70, 24, 28, 16, 'render'],
      [-76, -22, 14, 44, 15, 'render'], [-78, 26, 16, 44, 28, 'office'], [76, -24, 14, 44, 12, 'brick', { tank: true }], [78, 22, 16, 44, 34, 'concrete'], [84, 72, 30, 30, 22, 'old'], [86, -74, 28, 28, 18, 'office'],
    ];
    for (const [x, z, w, d, h, style, o] of city) cityBuilding(B, x, z, w, d, h, { style, ...(o || {}) });
    for (const [x, z, ry] of [[-30, -55.6, 0], [0, -55.6, 0], [30, -55.6, 0], [-30, 55.6, PI], [10, 55.6, PI], [40, 55.6, PI], [-67.6, 0, H], [67.6, 10, -H], [67.6, -30, -H]]) B.prop('street_light', x, 0, z, { ry, variant: 'single', on: false });
    for (const [x, z, ry] of [[-20, -58.2, H], [14, -58.2, -H], [-36, 58.2, H], [24, 58.2, -H], [70, 30, 0], [-70, -12, PI]]) B.prop('car', x, 0, z, { ry });
    B.prop('bus_shelter', 44, 0, -57, { ry: PI });
    for (const [x, z] of [[-48, -55.2], [12, -55.2], [-20, 55.2], [-66.8, 30], [66.8, -10]]) B.prop('tree', x, 0, z, { variant: 'poplar', h: 9 });
    decal(B, 'sign', 'banner1', -20, 1.3, -48.06, 10, 2.0, { face: 's' });
    decal(B, 'sign', 'banner2', 20, 1.3, -48.06, 10, 2.0, { face: 's' });
    decal(B, 'sign', 'homes', 0, 2.05, -48.06, 7, .62, { face: 's' });
    decal(B, 'sign', 'render', 45, 1.3, -48.06, 3.2, 2.0, { face: 's' });
    decal(B, 'sign', 'banner1', 0, 1.3, 48.06, 10, 2.0, { face: 'n' });
    decal(B, 'sign', 'noentry', -52, 1.6, -48.06, 2.8, .25, { face: 's' });
    decal(B, 'sign', 'street1', -60.06, 2.2, -20, 2.0, .18, { face: 'w' });
    decal(B, 'sign', 'street2', 60.06, 2.2, 10, 2.0, .18, { face: 'e' });
    for (const [z0, z1, x] of [[-52, 52, -66], [-52, 52, 66]]) paint(B, x, z0, x, z1, { col: WHT, w: .12, dash: [3, 3], y: -.015 });

    // ================================================================ markers
    B.site('A', { x0: -2, z0: 6, x1: 20, z1: 27, y: L2 });
    B.site('B', { x0: 33, z0: -22, x1: 53, z1: 0 });
    B.rescue({ x0: -58, z0: -34, x1: -50, z1: -26 });
    B.hostage(-9, L1, 6.5); B.hostage(19.5, L1, 25.5); B.hostage(55.4, 0, -8.6); B.hostage(-40, 0, -14.6); B.hostage(33.2, 0, 25.4);
    B.point('dom1', -36, null, -2, 4); B.point('dom2', 6, L0, 7.5, 4); B.point('dom3', 44, null, 18, 4);
    B.point('hp1', 0, null, -19, 5); B.point('hp2', -6, L1, 7, 4); B.point('hp3', 42, null, -10, 5); B.point('hp4', -44, null, 39.6, 5); B.point('hp5', 13, L2, 21, 4);
    B.point('hill', 2, null, -19, 5);
    B.point('flag1', -50, null, -30.5, 1.5); B.point('flag2', 47, null, 29.5, 1.5);
    B.point('extract1', -56, null, 18, 3); B.point('extract2', 12, null, -42, 3); B.point('extract3', 57, null, 2, 3);
    B.point('hq1', -38, null, -17, 4); B.point('hq2', 18, L1, 24, 4);

    for (const [x, y, z, k] of [[2, L0, 15, 'dark'], [7, L0, 15.5, 'under'], [-46.6, 0, -13.2, 'dark'], [-46, 0, 39.6, 'car'], [17.8, null, 37, 'grass'],
      [-24, 0, 8.4, 'closet'], [56.2, 0, -8, 'closet'], [-13.5, 0, 42.4, 'crates'], [-11, L1, 5, 'dark'], [16.8, L2, 25.2, 'crates'], [54, 3.1, 33, 'roof'],
      [-8.6, 0, -15.2, 'car'], [-8, 0, 45.6, 'bush'], [33.6, 0, 25.3, 'closet'], [31.6, 0, -22.6, 'crates'], [22, L1, 11.4, 'dark']]) B.hide(x, y, z, { kind: k });

    // field spawns (T1 = west / south-west half, T2 = east / north-east half) and FFA
    for (const [x, z] of [[-40, -28.6], [-56, -28], [-30, -38], [-27, -12], [-52, 0], [-36, 15], [-48, 26], [-18, -42], [-10, -24], [-52, 40]]) B.spawn(1, x, null, z, face(x, z, 6, 6), { field: true });
    for (const [x, z] of [[45, 22], [54, 12], [36, 19], [30, 38], [54, -40], [40, -38], [28, 22], [22, 46], [50, 30], [32, 1]]) B.spawn(2, x, null, z, face(x, z, 6, 6), { field: true });
    for (const [x, y, z] of [[-54, 0, -18], [-52, 0, 20], [-30, 0, 40], [-6, 0, 40], [28, 0, 32], [46, 0, 22], [57, 0, 2], [52, 0, -42], [22, 0, -40], [-14, 0, -40], [-30, 0, -15],
      [0, 0, -6], [20, 0, -18], [-8, L0, 8], [20, L0, 23], [-8, L1, 13], [19, L1, 16], [-2, L2, 25], [20, L2, 8], [44, 0, -18]]) B.spawn(0, x, y, z, face(x, z, 6, 6));

    finish(B);
  },
};
