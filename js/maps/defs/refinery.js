/* LIVE FIRE — Black Creek Refinery (refinery): a mid-size crude oil refinery on a creek, overcast day.
   Original location. Plan (x east, z north, metres, ground y 0):
     T1 lobby  = TRUCK SCALE HOUSE (x -8..8, z -72..-62), gates north onto the scale plaza; weighbridges either side.
     Loading bay (x -28..34, z -56..-32): product loading rack canopy with tankers in two lanes.
     South process strip: crude heater F-110 on the centre line (x -6..6, z -28..-20), exchanger pad (west), substation 2 (east).
     MID       = PIPE ALLEY (z -4..8, x -36..42) under the main pipe rack (tiers 4.6 / 7.0, fin-fans on top), long A<->B sightline;
                 CRUDE UNIT 100 structure north of it (x -14..14, z 9..30, decks 4.6 / 9.2, columns C-101 / C-102 behind it);
                 the rack walkway (y 4.6) runs from the structure west over the road and drops into the tank farm (A catwalk).
     SITE A    = TANK FARM (bund x -84..-38, z -24..36, 1.3 m walls): two crude tanks west, diesel / naphtha tanks east, manifold
                 and pump shelter between them. Ways in: south ramp (A main, from the south road), east stile (A short, from
                 the pipe alley), catwalk stair (from the rack walkway), north ramp (defenders, from the north road).
     SITE B    = CENTRAL CONTROL BUILDING (x 44..68, z -10..12, floor .3): control hall; vestibule (W door, from the pipe alley),
                 rack room, kitchen / shift office / lockers (S door, B main from the east road), N door (defenders). Roof by
                 the east stair.
     T2 lobby  = MAINTENANCE WORKSHOP (x -11..11, z 50..63), gates south onto the north yard and the north road.
   Out of bounds: more process units and the flare stack (north), cooling tower (east), Black Creek and its woods (west),
   the access road, the tank truck park and the hills (south). Prefabs: js/maps/kit_refinery.js. Notes: tools/test/out/notes-map-refinery.md */
import { kit, decal, paint, pave, railing, stair, deck, hcol, column, pipe, rack, exchanger, pump, vessel, heater, tanker, flare, fence, farUnit, coolingTower, pylon, farGround, skirt, finish, rng, YEL, WHT, RED } from '../kit_refinery.js';

const PI = Math.PI, H = PI / 2;
const FL = .15;                     // workshop / scale house floors
const CB = .3, CBH = 3.6;           // control building floor and storey height
const L1 = 4.6, L2 = 9.2;           // structure decks (L1 = rack walkway too)
const BW = 1.3;                     // bund wall height
const face = (x, z, tx, tz) => Math.atan2(tx - x, tz - z);

export default {
  id: 'refinery', name: 'Black Creek Refinery', size: 'L', chunk: 128,
  desc: 'Crude oil refinery on an overcast day: tank farm, pipe alley under the main rack, a crude unit with catwalks and a blast-proof control building.',
  env: { hdri: 'overcast', sky: 'hdri', time: 'overcast', exposure: 1.0, sun: { dir: [.38, -.82, .42], color: [1, .97, .92], intensity: .85 },
    fog: { color: [.6, .62, .64], density: .0042 }, weather: 'clear', wind: [2, -1.2], ambience: 'refinery', reverb: 'outdoor', indoorIbl: .3, puddles: .25 },
  bounds: { minX: -88, maxX: 80, minZ: -77, maxZ: 69, minY: -4, maxY: 40 },

  build(B) {
    const R = rng(1207), PF = globalThis.__rfProf = [], t0 = { t: performance.now() };
    const CASTS = new Set(['tank', 'truck_tractor', 'semi_trailer', 'container', 'site_cabin', 'crate_stack', 'dumpster', 'generator']);
    const prop0 = B.prop.bind(B);
    B.prop = (type, x, y, z, o = {}) => prop0(type, x, y, z, Object.assign({ cast: CASTS.has(type), inst: false }, o));
    const mark = k => { const t = performance.now(); PF.push(k + ' ' + Math.round(t - t0.t)); t0.t = t; };
    mark('before ground');
    // ============================================================ ground
    pave(B, [
      [-16, -77, 16, -56, 'concrete_floor'],          // scale plaza
      [-36, -56, -28, 46, 'asphalt'], [34, -56, 42, 46, 'asphalt'],   // west / east roads
      [-88, 40, 80, 46, 'asphalt'],                   // north road
      [-88, -38, -28, -30, 'asphalt'],                // south road
      [-28, -56, 34, -32, 'concrete_floor'],          // loading bay
      [-28, -4, 34, 8, 'concrete_floor'],             // pipe alley
      [-16, 8, 16, 32, 'concrete_floor'],             // crude unit pad
      [-28, -32, 28, -10, 'concrete'],                // south process pads
      [42, -30, 78, 18, 'pavement'],                  // control building surround
      [-14, 46, 14, 50, 'concrete_floor'],            // north yard
      [-84, -24, -38, 36, 'gravel'],                  // bund floor
    ], 'gravel', { x0: -88, z0: -78, x1: 80, z1: 70 }, 2);

    mark('before T1 lobby: truck scal');
    // ============================================================ T1 lobby: truck scale house
    B.room({ x: 0, z: -67, w: 16, d: 10, y: FL, h: 3.2, wall: 'plaster_white', outer: 'plaster', floor: 'tile_floor', ceil: 'ceiling_tile', roof: 'metal_plate', frames: 'steel_dark',
      doors: { n: [{ at: 4, w: 2.6, h: 2.6, frame: false }, { at: 12, w: 2.6, h: 2.6, frame: false }] },
      windows: { n: [{ at: 8, w: 2.6, h: 1.2, glass: true }], w: [{ at: 5, w: 1.8, glass: true }], e: [{ at: 5, w: 1.8, glass: true }], s: [{ at: 3, w: 1.4, glass: true }, { at: 13, w: 1.4, glass: true }] } });
    B.box(0, 0, -67, 16.3, FL - .03, 10.3, { mat: 'concrete_dark', collide: false });           // plinth
    B.lobby(1, { x0: -7.8, z0: -71.8, x1: 7.8, z1: -62.2, y: FL }, [{ x: -4, z: -62.1, w: 2.6, h: 2.6, ry: 0 }, { x: 4, z: -62.1, w: 2.6, h: 2.6, ry: 0 }]);
    for (const x of [-5.6, -2.8, 0, 2.8, 5.6]) for (const z of [-69, -65.4]) B.spawn(1, x, FL, z, 0);
    // furniture: scale desk + console along the south wall, lockers west, kitchenette east
    B.prop('desk', -2, FL, -71.2, { variant: 'metal', ry: PI, w: 2.4 }); B.prop('monitor', -2.4, FL + .75, -71.4, { ry: PI }); B.prop('monitor', -1.4, FL + .75, -71.4, { ry: PI, on: false });
    B.prop('office_chair', -2, FL, -70.3, { variant: 'grey', ry: PI });
    B.prop('control_console', 3, FL, -71.3, { ry: PI, len: 2.4 });
    B.prop('lockers', -7.45, FL, -66, { ry: H, n: 5, variant: 'grey' });
    B.prop('kitchen_counter', 7.45, FL, -66.5, { ry: -H, len: 2.4, variant: 'white', upper: false });
    B.prop('fridge', 7.4, FL, -64.2, { ry: -H, variant: 'white' });
    B.prop('whiteboard', -7.88, FL + 1.0, -69.2, { ry: H, w: 1.6 }); B.prop('wall_clock', 0, FL + 2.6, -71.88, {});
    B.prop('fire_extinguisher', 7.85, FL, -70.5, { ry: -H }); B.prop('poster', -7.88, FL + 1.1, -63.6, { ry: H, i: 2 });
    for (const x of [-4, 4]) B.light({ x, y: FL + 3.2, z: -67, intensity: 7, fixture: 'tube', color: [.92, .96, 1] });
    decal(B, 'sign', 'scale', 0, 3.0, -61.88, 4.6, .42, { face: 'n' });
    { const sk = { mat: 'steel_dark', dado: 'p_paint_grey', dy: 1.05 };
      skirt(B, -7.79, -62.21, 7.79, -62.21, FL, { ...sk, gaps: [[2.5, 5.4], [10.5, 13.4]] }); skirt(B, -7.79, -71.79, 7.79, -71.79, FL, sk);
      skirt(B, -7.79, -71.79, -7.79, -62.21, FL, sk); skirt(B, 7.79, -71.79, 7.79, -62.21, FL, sk);
      const K = kit(B, 0, -67);   // outside: awning over the scale window, wall AC, downpipes
      K.box('p_paint_grey', 0, 2.75, -61.4, 3.2, .08, 1.2); for (const x of [-1.5, 1.5]) K.tube('steel_dark', [[x, 2.3, -61.95], [x, 2.78, -60.9]], .025, { seg: 5 });
      for (const [x, z] of [[-8.05, -61.95], [8.05, -61.95], [-8.05, -72.05], [8.05, -72.05]]) K.cyl('p_galv', x, .1, z, .05, 3.3, { seg: 8 });
      K.box('p_galv', 0, 3.3, -61.85, 16.4, .1, .14); K.box('p_galv', 0, 3.3, -72.15, 16.4, .1, .14);
    }
    B.prop('ac_unit', 8.32, 1.4, -69.5, { variant: 'wall', ry: H });
    decal(B, 'sign', 'brand', 0, 3.0, -72.12, 5, .44, { face: 's' });
    // weighbridges + a tanker on the west one, booth canopy, barriers
    for (const x of [-13, 13]) {
      B.box(x, 0, -66, 3.4, .06, 17, { mat: 'metal_plate', surf: 'metal' });
      B.box(x, 0, -66, 3.8, .03, 17.4, { mat: 'concrete_dark', collide: false });
      for (const s of [-1, 1]) { B.prop('bollard', x + s * 2.2, 0, -73.5, { variant: 'yellow' }); B.prop('bollard', x + s * 2.2, 0, -58.5, { variant: 'yellow' }); }
      B.prop('traffic_light', x - 2.4 * Math.sign(x), 0, -58.2, { ry: PI, state: x < 0 ? 'red' : 'green' });
    }
    tanker(B, -13, -68.5, 0, { mat: 'p_stainless', hide: false });
    B.prop('car', 13, 0, -66, { variant: 'pickup', color: 'white', ry: PI });
    B.prop('gate', -13, 0, -75.2, { variant: 'barrier', len: 4 }); B.prop('gate', 13, 0, -75.2, { variant: 'barrier', len: 4, open: true });

    mark('before loading bay: rack ca');
    // ============================================================ loading bay: rack canopy, islands, tankers
    for (const z of [-49, -43, -37]) {
      B.box(0, 0, z, 28, .2, 1.4, { mat: 'concrete', mats: { t: 'concrete_floor' } });
      for (const x of [-12, -4, 4, 12]) B.prop('bollard', x + 1.2, .2, z + .6 * (z === -49 ? 1 : -1), { variant: 'yellow' });
    }
    for (const x of [-12, -4, 4, 12]) for (const z of [-49, -43, -37]) hcol(B, x, z, 7.4, { mat: 'p_paint_grey' });
    B.box(0, 7.2, -43, 32, .5, 15, { mat: 'p_paint_grey', mats: { b: 'metal_plate', t: 'corrugated' }, collide: true, surf: 'sheetmetal' });
    { const K = kit(B, 0, -43);
      for (const x of [-12, -4, 4, 12]) K.box('p_paint_grey', x, 6.7, -43, .3, .5, 13);
      K.box('p_coat_yellow', 0, 7.0, -50.6, 32, .3, .15); K.box('p_coat_yellow', 0, 7.0, -35.4, 32, .3, .15);
      // loading arms on the middle island: riser, swivel, arm, counterweight
      for (const x of [-10, -6, -2, 2, 6, 10]) {
        const s = x % 4 === 0 ? 1 : -1;
        K.cyl('p_galv', x, .2, -43, .1, 2.6, { seg: 10 }); K.cyl('p_paint_grey', x, 2.7, -43, .14, .3, { seg: 10 });
        K.tube('p_galv', [[x, 2.9, -43], [x + .3, 3.7, -43 + s * 1.2], [x + .3, 2.2, -43 + s * 2.2]], .07, { seg: 8 });
        K.box('p_coat_yellow', x - .2, 3.3, -43 - s * .5, .3, .3, .5);
        K.box('p_coat_red', x, .2, -43 + .35 * s, .35, .9, .25);               // valve box
      }
      for (const z of [-49, -37]) for (const x of [-10, -2, 6]) { K.box('p_paint_grey', x, .2, z, .6, 1.4, .4); K.box('p_screen', x, 1.1, z + .21 * (z < -43 ? 1 : -1), .4, .3, .01); }
    }
    for (const [x, z, k] of [[-14, -49.8, 'bay1'], [-14, -43.8, 'bay2'], [-14, -37.8, 'bay3']]) decal(B, 'sign', k, x - 1.6, 6.4, z + .5, 1.8, .4, { face: 'w', ry: 0 });
    decal(B, 'sign', 'load', 0, 6.85, -50.69, 6, .5, { face: 's' }); decal(B, 'sign', 'load', 0, 6.85, -35.31, 6, .5, { face: 'n' });
    tanker(B, -3, -46, H, { mat: 'p_stainless', hide: true, tractor: 'red' });
    tanker(B, 6, -40, -H, { mat: 'p_coat_white', hide: true, tractor: 'blue' });

    mark('before south process strip');
    // ============================================================ south process strip
    heater(B, -6, -28, 6, -20, { h: 9, stack: 42, label: 'f110' });
    pipe(B, [[-7.2, 1.3, -29.2], [7.2, 1.3, -29.2], [7.2, 1.3, -18.8], [-7.2, 1.3, -18.8], [-7.2, 1.3, -29.2]], .07, 'p_coat_yellow', { fl: 0 });
    pipe(B, [[7.6, .4, -24], [12, .4, -24], [12, 1.3, -24]], .1, 'p_coat_yellow', { fl: 0 });
    { const K = kit(B, 0, -24, true); for (let i = 0; i < 6; i++) for (const z of [-29.2, -18.8]) { const x = -5 + i * 2; K.tube('p_coat_yellow', [[x, 1.3, z], [x, 1.6, z + (z < -24 ? .3 : -.3)], [x, 1.9, z + (z < -24 ? .9 : -.9)]], .03, { seg: 5 }); } }
    // prefabricated equipment rooms (they also break the long lines from the north road into the loading bay)
    const ler = (x0, z0, x1, z1, door) => {
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, w = x1 - x0, d = z1 - z0, K = kit(B, cx, cz);
      B.box(cx, 0, cz, w + .3, .45, d + .3, { mat: 'p_concrete_precast' });
      B.box(cx, .45, cz, w, 3.0, d, { mat: 'p_paint_cream', mats: { t: 'metal_plate' }, surf: 'sheetmetal' });
      for (let x = x0 + 1.2; x < x1 - .5; x += 1.2) { K.box('p_paint_cream', x, .45, z0 - .03, .06, 3.0, .06); K.box('p_paint_cream', x, .45, z1 - .03, .06, 3.0, .06); }
      K.box('p_paint_grey', cx, 3.45, cz, w + .12, .12, d + .12); K.box('p_paint_grey', cx, .45, cz, w + .1, .12, d + .1);
      const dz = door > 0 ? z1 + .02 : z0 - .06;
      K.box('p_paint_grey', x0 + 1.6, .55, dz, 1.0, 2.1, .04); K.box('steel_dark', x0 + 1.95, 1.5, dz + (door > 0 ? .04 : -.04), .12, .04, .04);
      K.box('p_galv', x0 + 1.6, .1, z0 - .9 + (door > 0 ? d + 1.8 : 0), 1.4, .35, .9);
      K.box('p_paint_grey', x1 - .35, 1.6, cz, .7, .9, .9); K.box('steel_dark', x1 - .02, 1.65, cz, .04, .8, .8);
      decal(B, 'stain', 'grime', cx, .9, door > 0 ? z1 + .03 : z0 - .03, w, 1.2, { face: door > 0 ? 'n' : 's' });
    };
    ler(-27, -33.6, -15, -30.6, -1); ler(-16, -14.5, -6, -11.5, 1); ler(4, -15, 13, -12, 1);
    // exchanger pad (west)
    B.box(-19, 0, -21, 14, .12, 16, { mat: 'concrete_floor', collide: false });
    exchanger(B, -23, -26, 0, { len: 6, r: .55 }); exchanger(B, -19.5, -26, 0, { len: 6, r: .55 }); exchanger(B, -16, -25, 0, { len: 5, r: .45 });
    exchanger(B, -23, -16, H, { len: 5, r: .5 }); vessel(B, -16.5, -16.5, H, { len: 5, r: .9, y: 1.4, mat: 'p_coat_white' });
    pump(B, -25.5, -19.5, 0); pump(B, -22.5, -19.5, 0); pump(B, -12.5, -24, H);
    // substation 2 (walk-through: W / E doors, N door)
    B.room({ x: 18, z: -25, w: 12, d: 10, y: FL, h: 4.2, wall: 'plaster_white', outer: 'brick_red', floor: 'concrete_floor', ceil: 'concrete', roof: 'concrete_dark', frames: 'steel_dark',
      doors: { w: [{ at: 5, w: 1.6 }], e: [{ at: 5, w: 1.6 }], n: [{ at: 7.5, w: 1.2 }] }, windows: { s: [{ at: 3, w: 1.4, y: 2.2, h: .8 }, { at: 9, w: 1.4, y: 2.2, h: .8 }] } });
    for (const x of [14, 15.2, 16.4, 19.6, 20.8, 22]) { B.box(x, FL, -29.3, 1.1, 2.2, .8, { mat: 'p_paint_lightblue', surf: 'metal' }); }
    for (const x of [14.5, 16.5, 20, 22]) B.box(x, FL, -20.6, 1.6, 1.9, .7, { mat: 'p_paint_lightblue', surf: 'metal' });
    B.light({ x: 18, y: FL + 4.2, z: -25, intensity: 6, fixture: 'tube', color: [.9, .95, 1] });
    decal(B, 'sign', 'sub', 18, 3.5, -19.86, 5, .45, { face: 'n' });

    mark('before pipe alley + main ra');
    // ============================================================ pipe alley + main rack + walkway (A catwalk)
    rack(B, -36, 36, 2, { w: 6, bay: 6, tiers: [4.5, 7.0], fans: [[-24, 12]] });
    const WZ0 = 5.25, WZ1 = 6.45;
    deck(B, -41.4, WZ0, -12.8, WZ1, L1);
    railing(B, -40.2, WZ0, -13.5, WZ0, L1, { collide: false, toe: false });
    railing(B, -41.4, WZ1, -14.2, WZ1, L1); railing(B, -41.4, WZ0, -41.4, WZ1, L1);
    deck(B, -14.2, WZ1, -12.8, 9, L1);                       // bridge onto the structure
    railing(B, -14.2, WZ1, -14.2, 9, L1); railing(B, -12.8, WZ0, -12.8, 9, L1);
    B.box(-39.1, L1, WZ0, 2.2, 1.1, .1, { visible: false, ray: false, surf: 'metal' });
    stair(B, { x: -40.8, z: (-2.1 + WZ0) / 2, w: 1.2, len: WZ0 + 2.1, y0: 0, y1: L1, dir: '+z' });
    { const K = kit(B, -38, 6); for (const x of [-41.2, -37.6]) { K.box('p_paint_grey', x, 0, WZ1 - .15, .22, L1 - .3, .22); K.box('p_paint_grey', x, 0, WZ0 + .15, .22, L1 - .3, .22); } }
    B.box(-41.2, 0, (WZ0 + WZ1) / 2, .3, L1 - .3, 1.2, { visible: false, surf: 'metal' }); B.box(-37.6, 0, (WZ0 + WZ1) / 2, .3, L1 - .3, 1.2, { visible: false, surf: 'metal' });
    // low pipe runs on sleepers along the south edge of the alley (gaps to cross)
    for (const [xa, xb] of [[-26, -15], [-9, 4], [10, 22], [27, 33]]) {
      for (let x = xa; x <= xb; x += 3) B.box(x, 0, -3.2, .3, .35, 1.6, { mat: 'p_concrete_precast', collide: false });
      for (const [dz, r, m] of [[-3.7, .16, 'p_galv'], [-3.2, .12, 'p_alu'], [-2.75, .1, 'p_coat_yellow']]) pipe(B, [[xa - .5, .35 + r, dz], [xb + .5, .35 + r, dz]], r, m, { fl: 0 });
      B.box((xa + xb) / 2, 0, -3.2, xb - xa + 1, .7, 1.4, { visible: false, surf: 'metal' });
    }
    pump(B, -20, 6.2, PI / 2); pump(B, -6, 6.2, PI / 2); pump(B, 20, 6.2, PI / 2);
    decal(B, 'sign', 'alley', -36.1, 3.2, 2, 3.6, .32, { face: 'w' }); decal(B, 'sign', 'alley', 36.1, 3.2, 2, 3.6, .32, { face: 'e' });

    mark('before crude unit 100 (stru');
    // ============================================================ crude unit 100 (structure)
    const CX = [-14, -7, 0, 7, 14], CZ = [9, 16, 23, 30];
    for (const x of CX) for (const z of CZ) hcol(B, x, z, x >= -7 && z >= 16 ? L2 + 3 : L1 + 1.2, { fp: L1 });
    deck(B, -14.2, 9, 14.2, 30.2, L1, { mat: 'metal_plate' });
    deck(B, -7.2, 16, 14.2, 30.2, L2, { mat: 'metal_plate' });
    // L1 rails (gaps: SW bridge, W / E stair landings, interior stair foot)
    railing(B, -12.8, 9, 14.2, 9, L1); railing(B, -14.2, 30.2, 14.2, 30.2, L1);
    railing(B, -14.2, 9, -14.2, 18.8, L1); railing(B, -14.2, 21.2, -14.2, 30.2, L1);
    railing(B, 14.2, 9, 14.2, 17.8, L1); railing(B, 14.2, 20.2, 14.2, 30.2, L1);
    // L2 rails (gap: interior stair landing on the west side)
    railing(B, -7.2, 16, 14.2, 16, L2); railing(B, -7.2, 30.2, 14.2, 30.2, L2); railing(B, 14.2, 16, 14.2, 30.2, L2);
    railing(B, -7.2, 16, -7.2, 25.6, L2);
    // stairs: west (ground -> L1, rising north), east (rising south), interior L1 -> L2 (rising north) + landing
    stair(B, { x: -15.4, z: 15.2, w: 1.2, len: 7.4, y0: 0, y1: L1, dir: '+z' });
    deck(B, -16, 18.9, -14.2, 21.1, L1); railing(B, -16, 21.1, -14.2, 21.1, L1); railing(B, -16, 18.9, -16, 21.1, L1);
    stair(B, { x: 15.4, z: 21.8, w: 1.2, len: 7.4, y0: 0, y1: L1, dir: '-z' });
    deck(B, 14.2, 15.9, 16, 18.1, L1); railing(B, 14.2, 15.9, 16, 15.9, L1); railing(B, 16, 15.9, 16, 18.1, L1);
    stair(B, { x: -10.4, z: 22.1, w: 1.2, len: 7.4, y0: L1, y1: L2, dir: '+z' });
    deck(B, -11, 25.8, -7.2, 28.2, L2); railing(B, -11, 28.2, -7.2, 28.2, L2); railing(B, -11, 25.8, -11, 28.2, L2); railing(B, -11, 25.8, -7.2, 25.8, L2, { collide: false });
    railing(B, -9.8, 18.4, -9.8, 25.8, L1, { collide: false, toe: false });
    // ground floor equipment (lanes x -3.5 / 3.5 and z 19.5 kept open)
    exchanger(B, -10.5, 12.8, 0, { len: 5, r: .55 }); exchanger(B, -10.5, 26.5, 0, { len: 5, r: .55 }); vessel(B, 10, 12.5, 0, { len: 5, r: .9, y: 1.5, mat: 'p_coat_white' });
    pump(B, 9, 26.8, H); pump(B, 11.5, 22.5, H); pump(B, -5.5, 26.8, H);
    exchanger(B, 5.5, 12.6, 0, { len: 4.4, r: .45 });
    // L1 / L2 equipment: reflux drum, air receiver, exchangers on L1
    vessel(B, 4, 26.5, H, { len: 6, r: 1.1, y: L2 + 1.5, mat: 'p_coat_white' });
    exchanger(B, 6, 12.8, H, { len: 5, r: .5, y: L1 + 1.0 }); exchanger(B, -2, 26.5, H, { len: 5, r: .5, y: L1 + 1.0 });
    B.box(-4, L1, 13.5, 1.6, 1.0, .8, { mat: 'p_paint_grey', surf: 'metal' });          // instrument cabinet
    column(B, -4, 35.2, 2.4, 38, { plat: [L1, L2, 16, 23, 30, 36], pa0: PI, label: 'c101', face: PI,
      nozzles: [[L2 + 2, PI * .8, .2, L1], [20, PI * .55, .15, L1], [33, PI * .5, .25, L2]] });
    column(B, 6, 35.4, 1.6, 28, { plat: [L1, L2, 15, 21, 26], pa0: PI, label: 'c102', face: PI, nozzles: [[12, -PI * .8, .15, L2]] });
    deck(B, -7.5, 30.2, -.5, 32.4, L1); railing(B, -7.5, 32.4, -.5, 32.4, L1); railing(B, -7.5, 30.2, -7.5, 32.4, L1); railing(B, -.5, 30.2, -.5, 32.4, L1);
    decal(B, 'sign', 'cu100', 0, 3.3, 8.74, 4.4, .44, { face: 's' });
    // risers, cable trays, instrument stands, flood lights on the structure
    for (const [x, z, r, m, top] of [[-13.4, 9.6, .16, 'p_alu', L2 + 2], [13.4, 9.6, .12, 'p_galv', L1 + 1.5], [-13.4, 29.6, .2, 'p_alu', L1 + 2], [13.4, 29.6, .15, 'p_coat_yellow', L2 + 1.5], [-6.4, 29.6, .12, 'p_galv', L2 + 1]])
      { pipe(B, [[x, .3, z], [x, top, z]], r, m, { fl: 3 }); B.box(x, 0, z, r * 2, top, r * 2, { visible: false, surf: 'metal' }); }
    { const K = kit(B, 0, 20, true);
      for (const z of [9.8, 29.4]) { K.box('p_galv', 0, L1 - .75, z, 27, .08, .45); K.box('p_galv', 0, L1 - .7, z - .22, 27, .1, .02); K.box('p_galv', 0, L1 - .7, z + .22, 27, .1, .02); K.box('steel_dark', 0, L1 - .72, z, 27, .05, .36); }
      for (const [x, z] of [[-12, 14], [-2, 20], [8, 24], [12, 11], [-8, 29]]) { K.box('p_galv', x, L1, z, .06, 1.1, .06); K.box('p_paint_grey', x, L1 + 1.1, z, .3, .3, .18); K.box('p_galv', x, L1 + 1.1, z - .12, .02, .02, .02); }
      for (const [x, z] of [[-3, 18], [6, 22], [-12, 24]]) { K.box('p_galv', x, 0, z, .06, 1.2, .06); K.box('p_paint_grey', x, 1.2, z, .32, .34, .2); }
    }
    for (const [x, y, z, a] of [[-14, L1 + 1.1, 9, PI], [14, L1 + 1.1, 9, PI], [0, L2 + 2.6, 16, PI], [-14, L1 + 1.1, 30, 0], [14, L1 + 1.1, 30, 0]]) B.prop('light_fixture', x, y, z, { variant: 'flood', on: false, ry: a });
    for (const [x, z] of [[-10, 12], [10, 12], [-10, 27], [10, 27], [0, 19.5]]) B.light({ x, y: L1 - .35, z, intensity: 5, fixture: 'can', color: [1, .9, .75] });
    B.light({ x: 3, y: L2 - .1, z: 20, intensity: 5, fixture: false, color: [1, .9, .75] });

    mark('before site A: tank farm');
    // ============================================================ site A: tank farm
    const bund = { mat: 'concrete', surf: 'concrete' };
    B.box(-61, 0, -24, 46, BW, .4, { ...bund, ry: 0 });                                     // south wall (S ramp gap below)
    B.box(-61, 0, 36, 46, BW, .4, bund);
    B.box(-84, 0, 6, .4, BW, 60, bund); B.box(-38, 0, 6, .4, BW, 60, bund);
    // ramps over the bund: south (x -55.5) and north (x -53)
    for (const [x, zw, s] of [[-55.5, -24, -1], [-53, 36, 1]]) {
      B.box(x, 0, zw, 4.2, BW + .02, .9, { mat: 'concrete_dark', surf: 'concrete' });
      B.ramp({ x, z: zw + s * (.45 + 2.4), w: 4, len: 4.8, y0: 0, y1: BW + .02, dir: s > 0 ? '-z' : '+z', mat: 'concrete_dark' });
      B.ramp({ x, z: zw - s * (.45 + 2.4), w: 4, len: 4.8, y0: 0, y1: BW + .02, dir: s > 0 ? '+z' : '-z', mat: 'concrete_dark' });
      for (const dx of [-2.1, 2.1]) railing(B, x + dx, zw - .45, x + dx, zw + .45, BW, { collide: false, toe: false });
    }
    // east stile (A short) at z 16
    stair(B, { x: -36.75, z: 16, w: 1.2, len: 2.1, y0: 0, y1: BW, dir: '-x' });
    stair(B, { x: -39.25, z: 16, w: 1.2, len: 2.1, y0: 0, y1: BW, dir: '+x' });
    deck(B, -38.2, 15.4, -37.8, 16.6, BW + .02, { beam: false });
    // tanks
    for (const [x, z, r, h, k, m] of [[-69, 21, 10, 13, 'tk101', 'p_coat_white'], [-69, -9, 10, 13, 'tk102', 'p_coat_white'], [-46.5, 27, 5, 11, 'tk103', 'p_paint_beige'], [-46.5, -15, 5, 11, 'tk104', 'p_paint_beige']]) {
      B.cyl(x, 0, z, r + .45, .35, { mat: 'p_concrete_precast', sides: 40 });
      B.prop('tank', x, .35, z, { variant: r > 6 ? 'large' : 'medium', r, h, mat: m, ry: face(x, z, -50, 6) });
      const a = face(x, z, -48, 6), dx = Math.sin(a), dz = Math.cos(a);
      decal(B, 'sign', k, x + dx * (r + .03), h * .6, z + dz * (r + .03), r * 1.4, r * 1.4 * .09, { face: 'n', ry: a });
      for (let i = 0; i < 9; i++) { const b = a + (i - 4) * .5 + R() * .2; decal(B, 'stain', 'streak', x + Math.sin(b) * (r + .02), h - 1.6, z + Math.cos(b) * (r + .02), 1.8 + R() * 2, 3.2, { face: 'n', ry: b }); }
    }
    // manifold + pump shelter (site A)
    B.box(-49, 0, 6, 14, .1, 16, { mat: 'concrete_floor', collide: false });
    { const K = kit(B, -49, 6);
      for (let i = 0; i < 4; i++) pipe(B, [[-58, .7 + i * .0, -1 + i * .55], [-44, .7, -1 + i * .55], [-44, .7 + 1.1, -1 + i * .55], [-41, .7 + 1.1, -1 + i * .55]], .14, i % 2 ? 'p_galv' : 'p_paint_grey', { fl: 0 });
      for (let x = -57; x <= -45; x += 4) K.box('p_concrete_precast', x, 0, .0, .4, .5, 2.6);
      for (const x of [-54, -50]) for (let i = 0; i < 4; i++) { K.box('p_coat_red', x, .55, -1 + i * .55 - .08, .2, .3, .16); K.cyl('p_coat_yellow', x, .95, -1 + i * .55, .02, .25, { seg: 6 }); K.lathe('p_coat_red', [[.18, 0], [.2, .02], [.18, .04]], { x, y: 1.2, z: -1 + i * .55, seg: 12 }); }
      // pump shelter: 4 posts + roof
      for (const [x, z] of [[-55, 9], [-47, 9], [-55, 14], [-47, 14]]) K.box('p_paint_grey', x, 0, z, .2, 3.4, .2);
      K.box('corrugated', -51, 3.4, 11.5, 9, .1, 6.2); K.box('p_paint_grey', -51, 3.25, 11.5, 8.4, .16, .16);
    }
    B.box(-51, 0, .7, 14.2, .95, 2.5, { visible: false, surf: 'metal' });
    B.box(-51, 3.4, 11.5, 9, .1, 6.2, { visible: false, surf: 'sheetmetal' });
    pump(B, -53, 11.5, 0, { mat: 'p_coat_green' }); pump(B, -49, 11.5, 0, { mat: 'p_coat_green' });
    B.prop('ibc_tank', -45.5, 0, 13.5, {}); B.prop('ibc_tank', -44.2, 0, 13.6, { variant: 'blue' });
    B.prop('drum', -42, 0, 11, { n: 3, variant: 'blue' }); B.prop('drum', -42.5, 0, 3.5, { n: 2, variant: 'black', fallen: true });
    B.prop('crate_stack', -56.5, 0, 4.5, { ry: H, hide: true });
    B.prop('generator', -44.5, 0, -4.5, { variant: 'yellow', ry: -H });
    B.prop('generator', -53.2, 0, 4.2, { variant: 'trailer', ry: .3 }); B.prop('pallet', -46.2, 0, 8.2, { variant: 'sacks', stack: 2 });
    B.box(-49.5, 0, 2.7, 3.4, .9, .3, { mat: 'p_concrete_precast', surf: 'concrete' }); B.box(-51.05, 0, 3.5, .3, .9, 1.3, { mat: 'p_concrete_precast', surf: 'concrete' });
    // tank lines: crude tanks into the manifold, product tanks up onto a pipe bridge to the rack
    pipe(B, [[-59.2, .65, 16], [-58.6, .65, 16], [-58.6, .65, 2.4]], .22, 'p_paint_grey', { fl: 0 });
    pipe(B, [[-59.3, .65, -5], [-58.6, .65, -5], [-58.6, .65, -1.6]], .22, 'p_paint_grey', { fl: 0 });
    B.box(-58.6, 0, 9.2, .5, .9, 13.6, { visible: false, surf: 'metal' }); B.box(-58.6, 0, -3.3, .5, .9, 3.4, { visible: false, surf: 'metal' });
    for (const z of [-4, 4, 8, 12, 15]) kit(B, -58.6, z).box('p_concrete_precast', -58.6, 0, z, .6, .4, .3);
    pipe(B, [[-41.4, .7, -15], [-39.4, .7, -15], [-39.4, 6.2, -15], [-39.4, 6.2, -.6], [-35, 6.2, -.6]], .16, 'p_galv', { fl: 0 });
    pipe(B, [[-46.5, .7, 21.8], [-46.5, .7, 20], [-39.8, .7, 20], [-39.8, 6.6, 20], [-39.8, 6.6, -.2], [-35, 6.6, -.2]], .14, 'p_alu', { fl: 0 });
    B.box(-43.1, 0, 20, 6.8, .95, .5, { visible: false, surf: 'metal' });
    { const K = kit(B, -39.6, 5);
      for (const z of [-12, -6, 0, 6, 12, 18]) { K.box('p_paint_grey', -39.6, 0, z, .2, 6.2, .2); K.box('p_paint_grey', -39.6, 5.95, z, 1.2, .2, .2); }
      for (const [x, z, a] of [[-82.5, -22.5, .8], [-82.5, 34.5, 2.4], [-40, 34.5, -2.4]]) { K.push(x, 0, z, a); K.cyl('p_coat_red', 0, 0, 0, .09, 1.6, { seg: 8 }); K.box('p_coat_red', -.15, 1.5, -.15, .3, .3, .3); K.tube('p_coat_red', [[0, 1.75, 0], [0, 2.0, .3], [0, 2.1, .7]], .06, { seg: 8 }); K.pop(); }
    }
    for (const z of [-12, -6, 0, 6, 12, 18]) B.box(-39.6, 0, z, .25, 6, .25, { visible: false, surf: 'metal' });
    // site letters and arrows on the bund and the control building
    for (const [x, y, z, f, w] of [[-55.5, .66, -24.47, 's', 1.0], [-37.78, .66, 18.4, 'e', 1.0], [-53, .66, 36.47, 'n', 1.0]]) decal(B, 'sign', 'A', x, y, z, w, w, { face: f, col: [.95, .75, .1] });
    decal(B, 'sign', 'A', -36.1, 5.6, 5.8, 1, 1, { face: 'e', col: [.95, .75, .1] });
    for (const [x, y, z, f] of [[43.78, 2.5, 6.2, 'w'], [59.2, 2.3, -10.22, 's'], [54.2, 2.3, 12.22, 'n']]) decal(B, 'sign', 'B', x, y, z, 1.2, 1.2, { face: f, col: [.95, .75, .1] });
    B.site('A', { x0: -58, z0: -4, x1: -40, z1: 16 });
    decal(B, 'sign', 'A', -50, .02, 6, 3, 3, { face: 'u' });
    decal(B, 'sign', 'permit', -55.5, 1.0, -23.78, 3.4, .32, { face: 'n' }); decal(B, 'sign', 'permit', -37.78, 1.0, 13, 3.4, .32, { face: 'e' });
    B.light({ x: -51, y: 3.35, z: 11.5, intensity: 4, fixture: 'tube', color: [.95, .97, 1] });

    mark('before site B: central cont');
    // ============================================================ site B: central control building
    B.room({ x: 56, z: 1, w: 24, d: 22, y: CB, h: CBH, t: .4, wall: 'plaster_white', outer: 'concrete_panels', floor: 'tile_floor', ceil: 'ceiling_tile', roof: 'concrete_dark', frames: 'steel_dark',
      doors: { w: [{ at: 18, w: 1.4, h: 2.3 }], s: [{ at: 13, w: 1.4, h: 2.3 }], n: [{ at: 8, w: 1.4, h: 2.3 }] },
      windows: { s: [{ at: 5, w: 1.2, h: .9, y: 1.2, glass: true }, { at: 9.5, w: 1.2, h: .9, y: 1.2, glass: true }] } });
    B.box(56, 0, 1, 24.4, CB - .04, 22.4, { mat: 'concrete_dark', collide: false });
    const IW = { y: CB, h: CBH - .1, t: .15, mat: 'plaster_white' };
    B.wall(48, -2.8, 48, 11.6, { ...IW, openings: [{ at: 3.8, w: 1.2, h: 2.2, frame: 'steel_dark' }, { at: 10.8, w: 1.4, h: 2.2, frame: 'steel_dark' }] });
    B.wall(44.4, 4, 47.92, 4, IW);
    B.wall(44.4, -3, 67.6, -3, { ...IW, openings: [{ at: 4.6, w: 1.1, h: 2.2, frame: 'steel_dark' }, { at: 13.1, w: 1.4, h: 2.2, frame: 'steel_dark' }] });
    B.wall(53, -9.6, 53, -3.08, IW);
    B.wall(62, -9.6, 62, -3.08, { ...IW, openings: [{ at: 3.1, w: 1.0, h: 2.2, frame: 'steel_dark' }] });
    // control hall: console arc, video wall, supervisor desk
    for (const [x, z, a] of [[51.5, 4.5, .45], [55, 3.4, .15], [58.6, 3.4, -.15], [62.1, 4.5, -.45]]) B.prop('control_console', x, CB, z, { ry: a + PI, len: 3.2 });
    for (const [x, z] of [[51.8, 2.6], [55.2, 1.8], [58.4, 1.8], [61.8, 2.6]]) B.prop('office_chair', x, CB, z, { ry: face(x, z, 57, 12) + PI, variant: 'charcoal' });
    B.box(57, CB + .9, 11.55, 12, 2.2, .1, { mat: 'p_screen', collide: false });
    decal(B, 'stain', 'grime', 57, CB + .1, 11.5, 12, .4, { face: 's' });
    B.prop('desk', 57, CB, -1.6, { variant: 'office', w: 2.4 }); B.prop('monitor', 56.6, CB + .75, -1.8, {}); B.prop('monitor', 57.5, CB + .75, -1.8, {});
    B.prop('server_rack', 66.6, CB, 6, { ry: -H, n: 4 });
    B.prop('filing_cabinet', 67.3, CB, 1.4, { ry: -H }); B.prop('filing_cabinet', 67.3, CB, .9, { ry: -H });
    B.prop('fire_extinguisher', 48.2, CB, 11.4, { ry: H });
    // rack room
    B.prop('server_rack', 45.2, CB, 1.3, { ry: H, n: 4 }); B.prop('server_rack', 47.2, CB, -1.5, { ry: 0, n: 1 });
    // kitchen, office, lockers
    B.prop('kitchen_counter', 48.5, CB, -9.25, { len: 4.2, variant: 'grey', sink: 1, hob: -1 });
    B.prop('fridge', 51.8, CB, -9.15, { variant: 'steel' }); B.prop('dining_table', 48.5, CB, -6, { chairs: 4 });
    B.prop('vending_machine', 52.3, CB, -5, { ry: -H });
    B.prop('workstation', 55, CB, -8.5, { ry: 0 }); B.prop('workstation', 59.3, CB, -8.5, { ry: 0, variant: 'dual' });
    B.prop('filing_cabinet', 61.4, CB, -4.2, { ry: -H, variant: '2' }); B.prop('whiteboard', 57.5, CB + 1, -3.17, { ry: PI, w: 2.2 });
    B.prop('lockers', 65, CB, -9.4, { n: 6, variant: 'blue', bench: true });
    B.prop('lockers', 67.35, CB, -5.5, { ry: -H, n: 3, variant: 'blue' });
    for (const [x, z] of [[52, 1.5], [62, 1.5], [52, 8.5], [62, 8.5], [57, 5]]) B.light({ x, y: CB + CBH, z, intensity: 6, fixture: 'panel', color: [.95, .97, 1] });
    B.light({ x: 46, y: CB + CBH, z: 8, intensity: 3, fixture: 'panel' }); B.light({ x: 46, y: CB + CBH, z: .5, intensity: 3, fixture: 'panel', color: [.8, .9, 1] });
    B.light({ x: 48.5, y: CB + CBH, z: -6.5, intensity: 4, fixture: 'panel', color: [1, .92, .8] }); B.light({ x: 57.5, y: CB + CBH, z: -6.5, intensity: 4, fixture: 'panel' });
    B.site('B', { x0: 48.6, z0: -2.4, x1: 67.4, z1: 11.4, y: CB });
    { const sk = { mat: 'steel_dark' };
      skirt(B, 48.08, 11.59, 67.59, 11.59, CB, { ...sk, gaps: [[3.2, 4.8]] }); skirt(B, 67.59, -2.92, 67.59, 11.59, CB, sk);
      skirt(B, 48.08, -2.92, 67.59, -2.92, CB, { ...sk, gaps: [[0, 1.6], [8.3, 10.1]] }); skirt(B, 48.08, -2.92, 48.08, 11.59, CB, { ...sk, gaps: [[2.8, 4.8], [10.1, 12.3]] });
    }
    decal(B, 'sign', 'B', 57, CB + .015, 7.2, 2.4, 2.4, { face: 'u' });
    decal(B, 'sign', 'ctrl', 56, 3.4, -10.22, 6.5, .5, { face: 's' }); decal(B, 'sign', 'ctrl', 43.78, 3.4, 1, 5.5, .45, { face: 'w' });
    // door steps, roof parapet and roof stair (east)
    for (const [x, z, w, d] of [[43.4, 8, 1.2, 2.2], [57, -10.6, 2.2, 1.2], [52, 12.6, 2.2, 1.2]]) B.box(x, 0, z, w, CB - .02, d, { mat: 'concrete', surf: 'concrete' });
    const RT = CB + CBH + .4;                                // roof top
    for (const [x, z, w, d] of [[56, -9.9, 24, .3], [56, 11.9, 24, .3], [44.15, 1, .3, 21.5]]) B.box(x, RT, z, w, .9, d, { mat: 'concrete_panels' });
    B.box(67.85, RT, -1.5, .3, .9, 16.5, { mat: 'concrete_panels' }); B.box(67.85, RT, 11.2, .3, .9, 1.1, { mat: 'concrete_panels' });
    stair(B, { x: 69, z: 3.6, w: 1.2, len: 7.6, y0: 0, y1: RT, dir: '+z' });
    deck(B, 67.9, 7.4, 69.6, 10.6, RT); railing(B, 69.6, 7.4, 69.6, 10.6, RT); railing(B, 67.9, 10.6, 69.6, 10.6, RT);
    B.prop('ac_unit', 60, RT, 4, { variant: 'hvac' }); B.prop('ac_unit', 52, RT, -4, { variant: 'hvac', ry: H });
    B.prop('ac_unit', 49, RT, 8, { variant: 'condenser' }); B.prop('ac_unit', 50.4, RT, 8, { variant: 'condenser' });
    B.prop('vent', 56, RT, 9, { variant: 'mushroom' }); B.prop('vent', 63, RT, -6, { variant: 'box' });
    { const K = kit(B, 56, 1);
      // door canopies (W, S, N), parapet coping, downpipes, windsock, cable tray from the rack
      for (const [x, z, a] of [[43.8, 8, -H], [57, -10.2, PI], [52, 12.2, 0]]) { K.push(x, 0, z, a); K.box('concrete_dark', 0, 2.75, .65, 2.6, .18, 1.3); K.box('p_galv', 0, 2.7, 1.28, 2.6, .06, .04);
        for (const sx of [-1.15, 1.15]) { K.tube('steel_dark', [[sx, 2.2, 0], [sx, 2.74, 1.1]], .03, { seg: 5 }); } K.pop(); }
      for (const [x, z, w, d] of [[56, -10.05, 24.3, .55], [56, 12.05, 24.3, .55], [44.05, 1, .55, 22], [67.95, -1.5, .55, 16.5]]) K.box('p_galv', x, RT + .9, z, w, .05, d);
      for (const [x, z] of [[44.1, -9.9], [67.9, -9.9], [44.1, 11.9], [67.9, 11.9], [56, -10.05], [56, 12.05]]) { K.cyl('p_galv', x, .1, z, .055, RT - .1, { seg: 8 }); K.box('p_galv', x, .05, z + (z < 0 ? -.12 : .12), .12, .1, .3); }
      K.cyl('p_galv', 66.5, RT, -8.5, .05, 6, { seg: 6 }); K.lathe('p_coat_red', [[.32, 0], [.14, 1.6]], { x: 66.5, y: RT + 5.6, z: -8.5, rz: -H * .9, seg: 10 });
      for (let x = 33.6; x < 44; x += .5) K.box('p_galv', x, 3.35, 9.2, .04, .05, .5);
      K.box('p_galv', 38.7, 3.4, 8.97, 10.6, .1, .03); K.box('p_galv', 38.7, 3.4, 9.43, 10.6, .1, .03); K.box('steel_dark', 38.7, 3.42, 9.2, 10.6, .08, .4);
      for (const x of [33.6, 42.6]) { K.box('p_paint_grey', x, 0, 9.65, .2, 3.4, .2); K.box('p_paint_grey', x, 3.2, 9.4, .2, .2, .7); }
    }
    for (const z of [-6, 0, 6]) B.prop('ac_unit', 68.55, 1.6, z, { variant: 'wall', ry: H });
    B.box(33.6, 0, 9.65, .25, 3.4, .25, { visible: false, surf: 'metal' }); B.box(42.6, 0, 9.65, .25, 3.4, .25, { visible: false, surf: 'metal' });
    decal(B, 'sign', 'nosmoke', 43.78, 2.0, 5.4, 2.4, .22, { face: 'w' });

    mark('before T2 lobby: maintenanc');
    // ============================================================ T2 lobby: maintenance workshop
    B.room({ x: 0, z: 56.5, w: 22, d: 13, y: FL, h: 6.5, t: .25, wall: 'corrugated', outer: 'corrugated', floor: 'concrete_floor', ceil: 'corrugated', roof: 'corrugated', frames: false,
      doors: { s: [{ at: 5, w: 3, h: 3 }, { at: 17, w: 3, h: 3 }] },
      windows: { n: [{ at: 5, w: 3, h: 1.2, y: 4, glass: true }, { at: 11, w: 3, h: 1.2, y: 4, glass: true }, { at: 17, w: 3, h: 1.2, y: 4, glass: true }] } });
    B.box(0, 0, 56.5, 22.3, FL - .03, 13.3, { mat: 'concrete_dark', collide: false });
    for (const [x0, x1] of [[-11, -7.6], [-4.4, 4.4], [7.6, 11]]) B.box((x0 + x1) / 2, 0, 49.84, x1 - x0, 1.2, .08, { mat: 'concrete_panels', collide: false });
    B.lobby(2, { x0: -10.75, z0: 50.25, x1: 10.75, z1: 62.75, y: FL }, [{ x: -6, z: 50.1, w: 3, h: 3, ry: 0 }, { x: 6, z: 50.1, w: 3, h: 3, ry: 0 }]);
    for (const x of [-8, -4, 0, 4, 8]) for (const z of [55.5, 58.5]) B.spawn(2, x, FL, z, PI);
    B.prop('shelf_unit', -10.4, FL, 55, { ry: H, w: 1.8 }); B.prop('shelf_unit', -10.4, FL, 58, { ry: H, w: 1.8, variant: 'green' });
    B.prop('lockers', 10.5, FL, 57, { ry: -H, n: 6, variant: 'green' });
    B.prop('desk', -6, FL, 62, { variant: 'metal', ry: PI }); B.prop('desk', 6, FL, 62, { variant: 'metal', ry: PI });
    B.prop('gas_cylinder', -10.3, FL, 61.6, { rack: true, ry: H });
    B.prop('drum', -10, FL, 51.6, { n: 2, variant: 'red' });
    B.prop('whiteboard', 0, FL + 1.2, 62.7, { ry: PI, w: 2.4 });
    for (const x of [-6, 6]) for (const z of [54, 59]) B.prop('light_fixture', x, FL + 6.3, z, { variant: 'highbay', light: false });
    B.light({ x: -5, y: FL + 6, z: 56.5, intensity: 10, fixture: false, color: [1, .95, .85] }); B.light({ x: 5, y: FL + 6, z: 56.5, intensity: 10, fixture: false, color: [1, .95, .85] });
    decal(B, 'sign', 'maint', 0, 4.6, 49.85, 6, .5, { face: 's' });
    { const K = kit(B, 0, 56.5);
      // portal frames, crane runway, skylights, block dado
      for (const x of [-10.6, -5.5, 0, 5.5, 10.6]) { for (const z of [50.45, 62.55]) K.box('p_paint_grey', x, FL, z, .3, 6.3, .25); K.box('p_paint_grey', x, FL + 6.0, 56.5, .25, .4, 12.2); }
      for (const z of [51, 62]) K.box('p_coat_yellow', 0, FL + 5.2, z, 21, .35, .3);
      K.box('p_coat_yellow', 2, FL + 5.55, 56.5, .5, .5, 11.4); K.box('steel_dark', 2, FL + 4.9, 56.5, .4, .65, .7); K.tube('steel_dark', [[2, FL + 4.9, 56.5], [2, FL + 2.2, 56.5]], .015, { seg: 4 });
      K.box('p_coat_yellow', 2, FL + 2.0, 56.5, .25, .2, .12);
      for (const x of [-8, -2.75, 2.75, 8]) K.box('emissive_white', x, FL + 6.48, 56.5, 1.4, .02, 10.5);
      for (const [x0, x1] of [[-10.85, -7.6], [-4.4, 4.4], [7.6, 10.85]]) K.box('concrete_panels', (x0 + x1) / 2, FL, 50.3, x1 - x0, 1.2, .12);
      K.box('concrete_panels', 0, FL, 62.68, 21.7, 1.2, .12); K.box('concrete_panels', -10.68, FL, 56.5, .12, 1.2, 12.2); K.box('concrete_panels', 10.68, FL, 56.5, .12, 1.2, 12.2);
      // pipe vice bench + welding screen
      K.box('p_paint_grey', 9.2, FL, 51.6, .9, .85, 1.8); K.box('steel_dark', 9.2, FL + .85, 51.6, .95, .05, 1.85);
      K.box('p_coat_red', 9.2, FL + .9, 51.0, .2, .2, .25); K.cylZ('p_galv', 50.6, 53.6, 9.2, FL + 1.1, .08, { seg: 8 });
    }
    B.prop('shelf_unit', -3, FL, 62.4, { ry: PI, w: 1.6, variant: 'grey' }); B.prop('shelf_unit', 3, FL, 62.4, { ry: PI, w: 1.6 });
    B.prop('pallet', -10, FL, 53.2, { variant: 'boxes', stack: 2, ry: H }); B.prop('cardboard_box', -8, FL, 62.2, { variant: 'pile', n: 4 });
    B.prop('drum', 10.1, FL, 61.5, { n: 2, variant: 'blue' }); B.prop('crate_plastic', -1, FL, 61.9, { variant: 'yellow', n: 3 });
    B.prop('valve', 9.2, FL + .9, 52.8, { variant: 'galv', d: .15 });

    mark('before dressing: control ha');
    // ============================================================ dressing: control hall screens, floors
    { const K = kit(B, 57, 11);
      const scr = ['scr_map', 'scr_graph', 'scr_cctv', 'scr_graph', 'scr_code', 'scr_map', 'scr_graph', 'scr_cctv'];
      for (let i = 0; i < 8; i++) K.decal(scr[i], 51.9 + (i % 4) * 3.4, CB + 1.0 + Math.floor(i / 4) * 1.1 + .52, 11.48, 3.3, 1.02, { face: 's', glow: true });
      K.box('steel_dark', 57, CB + .92, 11.52, 13.8, 2.3, .06);
    }
    mark('before perimeter fence + ga');
    // ============================================================ perimeter fence + gates
    for (const [x0, z0, x1, z1] of [[-88, -75.6, -15.4, -75.6], [-10.6, -75.6, 10.6, -75.6], [15.4, -75.6, 80, -75.6], [-86.6, -75.2, -86.6, 67.6], [78.6, -75.2, 78.6, 67.6], [-86.6, 67.8, 78.6, 67.8]]) fence(B, x0, z0, x1, z1);

    mark('before out of bounds: groun');
    // ============================================================ out of bounds: ground, creek, woods, far units, flare, cooling tower, pylons
    const n2 = (x, z) => Math.sin(x * .031 + z * .017) * Math.cos(z * .027 - x * .013) + .5 * Math.sin(x * .071 - z * .053);
    const sm = t => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
    const hf = (x, z) => {
      const dx = Math.max(-88 - x, x - 80, 0), dz = Math.max(z - 70, -78 - z, 0), e = Math.hypot(dx, dz);
      let y = e < 70 ? 0 : (e - 70) * .16 + n2(x, z) * 3 * sm((e - 70) / 40);
      const dW = -88 - x; if (dW > 0) y += -1.8 * sm(1 - Math.abs(dW - 15) / 7) + (dW > 24 ? (dW - 24) * .08 + n2(x, z) * 1.2 * sm((dW - 24) / 20) : 0);
      return y;
    };
    farGround(B, -260, -88, -260, 260, 5, 'grass', hf); farGround(B, 80, 260, -260, 260, 8, 'gravel', hf);
    farGround(B, -88, 80, 70, 260, 8, 'gravel', hf); farGround(B, -88, 80, -260, -78, 8, 'grass', hf);
    B.box(-103, -.9, 0, 9.5, .05, 520, { mat: 'water', collide: false, cast: false });
    for (let i = 0; i < 20; i++) { const z = -112 + i * 11.5 + R() * 6, x = -131 - R() * 16;
      B.prop('tree', x, hf(x, z) - .2, z, { variant: ['poplar', 'oak', 'birch', 'oak', 'dead'][i % 5], seed: 1 + (i % 2), collide: false }); }
    for (let i = 0; i < 14; i++) { const z = -100 + i * 14 + R() * 5, x = -97.5 - R() * 1.5; B.prop('grass_tall', x, hf(x, z) - .1, z, { variant: 'dry', w: 3, d: 5, h: 1.4, seed: 3, collide: false }); }
    farUnit(B, 4, 108, { cols: [[-10, 0, 2.6, 44], [7, 5, 1.8, 30], [16, -4, 1.4, 22]], frame: [26, 14, 3] });
    farUnit(B, -46, 100, { tanks: [[0, 0, 12, 14], [30, 4, 9, 12]] });
    farUnit(B, 52, 98, { cols: [[0, 0, 3.2, 36]], frame: [18, 12, 2], boxes: 2 });
    flare(B, 70, 150, 62);
    coolingTower(B, 122, 22, 5);
    farUnit(B, 118, -40, { tanks: [[0, 0, 14, 15], [-4, 34, 11, 13]], tankMat: 'p_paint_beige' });
    farUnit(B, -60, -120, { tanks: [[0, 0, 13, 14], [32, -6, 13, 14]] });
    for (let i = 0; i < 4; i++) pylon(B, 100 + i * 60, -100, 32, 0, i < 3 ? 60 : 0);
    B.box(-6, .02, -92, 300, .03, 9, { mat: 'asphalt', collide: false, cast: false });
    for (const [x, z, a, v] of [[-34, -85, H, 'white'], [-46, -85, H, 'red'], [-58, -85, H, 'blue']]) B.prop('truck_tractor', x, 0, z, { ry: a, variant: v, collide: false });
    B.prop('semi_trailer', -40, 0, -98, { ry: -H, variant: 'box', collide: false });

    mark('before inside the fence: ya');
    // ============================================================ inside the fence: yards, buildings and street furniture
    // north-east stores warehouse (closed) + container yard
    B.box(40, 0, 58, 24, 8.5, 13, { mat: 'corrugated', mats: { t: 'corrugated_rust' }, surf: 'sheetmetal' });
    B.box(40, 0, 51.45, 24.2, .6, .2, { mat: 'concrete_dark', collide: false });
    B.box(34, .05, 51.42, 4.4, 4.6, .1, { mat: 'p_paint_grey', collide: false }); B.box(46, .05, 51.42, 4.4, 4.6, .1, { mat: 'p_paint_grey', collide: false });
    decal(B, 'stain', 'grime', 40, .1, 51.38, 24, 1.4, { face: 's' });
    for (const [x, z, a, v, y] of [[62, 54, 0, 'blue', 0], [65, 54, 0, 'red', 0], [62, 54, 0, 'grey', 2.59], [71, 60, H, 'green', 0], [71, 60, H, 'white', 2.59], [58, 63, H, 'rust', 0]]) B.prop('container', x, y, z, { ry: a, variant: v, len: 20 });
    B.prop('forklift', 67, 0, 49.5, { ry: -2.4 }); B.prop('dumpster', 54.5, 0, 49, { variant: 'green', hide: true });
    // north-west: fire water tank, fire pump house, laydown yard
    B.cyl(-45, 0, 58, 7.4, .3, { mat: 'p_concrete_precast', sides: 36 });
    B.prop('tank', -45, .3, 58, { variant: 'medium', r: 7, h: 10, mat: 'p_coat_red', ry: PI });
    decal(B, 'sign', 'fire', -45, 6.5, 50.98, 6, .6, { face: 's' });
    B.room({ x: -28, z: 57, w: 7, d: 6, y: FL, h: 3.2, wall: 'plaster_white', outer: 'brick_red', floor: 'concrete_floor', ceil: 'concrete', roof: 'concrete_dark', frames: 'steel_dark', doors: { s: [3.5] }, windows: { e: [{ at: 3, w: 1.2 }] } });
    pump(B, -29.5, 57.5, 0, { mat: 'p_coat_red' }); pump(B, -26.5, 57.5, 0, { mat: 'p_coat_red' });
    B.light({ x: -28, y: FL + 3.2, z: 57, intensity: 4, fixture: 'bulb', color: [1, .88, .7] });
    for (const [x, z] of [[-78, 52], [-74, 52], [-70, 52]]) { B.prop('pallet', x, 0, z, { variant: 'pipes', stack: 1, ry: H }); }
    { const K = kit(B, -66, 60);
      for (let row = 0; row < 3; row++) { K.box('p_wood_sleeper', -66, 0, 56 + row * 4, 12, .2, .25); K.box('p_wood_sleeper', -66, 0, 58.5 + row * 4, 12, .2, .25);
        for (let k = 0; k < 4 - row % 2; k++) K.cylX(row === 1 ? 'p_coat_white' : 'p_galv', -71.5, -60.5, .2 + .46, 56.6 + row * 4 + k * .62 + (row % 2) * .3, .3, { seg: 14 }); } }
    for (let row = 0; row < 3; row++) B.box(-66, 0, 57.25 + row * 4, 11, .95, 2.7, { visible: false, surf: 'metal' });
    B.hide(-66, null, 59.3, { kind: 'crates' });
    B.prop('site_cabin', -76, 0, 61, { variant: 'blue', ry: PI }); B.prop('site_cabin', -60, 0, 64.5, { variant: 'cream', ry: PI });
    B.prop('rebar_bundle', -80, 0, 57, { len: 6 }); B.prop('scaffolding', -52, 0, 64.8, { bays: 2, levels: 1 });
    B.prop('grass_tall', -84.2, 0, 44, { variant: 'dry', w: 3, d: 6, h: 1.3, hide: true });
    B.prop('bush', -85, 0, 30, { variant: 'shrub', hide: true }); B.prop('bush', 77, 0, 34, { variant: 'round', hide: true });
    // analyser house (west of the structure) and compressor shelter (east)
    B.prop('site_cabin', -22, 0, 30, { variant: 'grey', ry: H });
    B.prop('gas_cylinder', -24.5, 0, 25.6, { rack: true }); B.prop('gas_cylinder', -20.3, 0, 25.4, { variant: 'nitrogen', n: 3 });
    { const K = kit(B, 25, 20);
      for (const [x, z] of [[19, 13], [31, 13], [19, 27], [31, 27], [25, 13], [25, 27]]) K.box('p_paint_grey', x, 0, z, .25, 5.4, .25);
      K.box('corrugated', 25, 5.4, 20, 13, .12, 15); K.box('p_paint_grey', 25, 5.2, 13, 12.4, .22, .2); K.box('p_paint_grey', 25, 5.2, 27, 12.4, .22, .2);
      for (const z of [17, 23]) { K.box('p_concrete_precast', 25, 0, z, 8, .4, 2.6); K.box('p_coat_green', 21.6, .4, z, 2.6, 1.6, 1.8); K.cylX('p_coat_green', 23, 28.5, 1.4, z, .75, { seg: 16 });
        K.box('steel_dark', 29, .4, z, 1.4, 2.2, 1.4); K.tube('p_galv', [[29, 2.6, z], [29, 3.6, z], [26, 3.6, z], [26, 4.9, z]], .2); }
    }
    for (const z of [17, 23]) B.box(25, 0, z, 9, 2.6, 2.6, { visible: false, surf: 'metal' });
    B.box(25, 5.4, 20, 13, .12, 15, { visible: false, surf: 'sheetmetal' });
    B.light({ x: 25, y: 5.35, z: 20, intensity: 4, fixture: 'tube', color: [.95, .97, 1] });
    // product pump house (south-west) + truck park
    B.room({ x: -54, z: -49, w: 16, d: 10, y: FL, h: 4.5, wall: 'plaster', outer: 'brick', floor: 'concrete_floor', ceil: 'corrugated', roof: 'corrugated', frames: 'steel_dark',
      doors: { n: [{ at: 4, w: 1.4 }, { at: 12, w: 2.4, h: 2.8 }], e: [{ at: 5, w: 1.2 }] }, windows: { s: [{ at: 4, w: 1.4, y: 2.4, h: .8 }, { at: 12, w: 1.4, y: 2.4, h: .8 }] } });
    for (const x of [-59, -55.5, -52]) pump(B, x, -50.5, 0, { mat: 'p_paint_grey' });
    pipe(B, [[-61, .9, -52.6], [-49, .9, -52.6], [-48, .9, -52.6], [-48, 3.6, -52.6]], .18, 'p_galv', { collide: false });
    B.light({ x: -54, y: FL + 4.5, z: -49, intensity: 5, fixture: 'tube', color: [.95, .97, 1] });
    decal(B, 'sign', 'pumph', -54, 3.9, -43.88, 5, .4, { face: 'n' });
    B.hide(-61, FL, -52.6, { kind: 'dark' });
    tanker(B, -74, -46, 0, { mat: 'p_coat_white', tractor: 'white', hide: true });
    B.prop('truck_tractor', -80, 0, -46, { variant: 'red' });
    // loading bay sides: driver cabin, spill kit, IBCs, cones
    B.prop('site_cabin', 26, 0, -54, { variant: 'cream' }); B.prop('vending_machine', 30.2, 0, -52.4, { ry: -H }); B.prop('bench', 22.4, 0, -51.8, { ry: PI });
    B.prop('ibc_tank', -24, 0, -38.5, {}); B.prop('ibc_tank', -22.7, 0, -38.5, { variant: 'blue' }); B.prop('drum', -25.6, 0, -39.6, { n: 4, variant: 'yellow' });
    B.prop('cone', -17, 0, -52, { variant: 'drum' }); B.prop('cone', -18.5, 0, -52.6, {}); B.prop('cone', 17, 0, -33.6, {});
    B.prop('pallet', 28, 0, -40, { variant: 'drums', stack: 1 }); B.prop('pallet', 29.4, 0, -38.6, { variant: 'sacks', stack: 1 });
    B.prop('crate_stack', 28, 0, -45, { ry: -H, hide: true });
    // diesel day tank in a low bund + cooling water lines (east of the substation)
    B.box(29, 0, -14, 9, .7, .3, { mat: 'concrete' }); B.box(29, 0, -8.15, 9, .7, .3, { mat: 'concrete' }); B.box(24.65, 0, -11.1, .3, .7, 5.6, { mat: 'concrete' }); B.box(33.35, 0, -11.1, .3, .7, 5.6, { mat: 'concrete' });
    B.prop('tank', 29, 0, -11.1, { variant: 'horizontal', len: 6.5, ry: H, mat: 'p_coat_white' });
    B.hide(31.5, null, -15, { kind: 'crates' });
    pipe(B, [[-6, .5, -6.5], [30, .5, -6.5]], .3, 'p_coat_green', { fl: 6.5 }); pipe(B, [[-6, .5, -5.6], [30, .5, -5.6]], .3, 'p_coat_blue', { fl: 6.5 });
    for (let x = -4; x <= 28; x += 4) kit(B, x, -6).box('p_concrete_precast', x, 0, -6.05, .4, .25, 2.2);
    for (const [xa, xb] of [[-6, 3], [9, 18.5], [22.5, 30]]) B.box((xa + xb) / 2, 0, -6.05, xb - xa, 1.1, 2.0, { visible: false, surf: 'metal' });
    // control building surroundings: car park, transformer yard, generator, flag pole style windsock
    for (const [x, c] of [[46, 'silver'], [48.8, 'black'], [54.4, 'red'], [57.2, 'white'], [62.8, 'blue']]) B.prop('car', x, 0, -17, { ry: PI, color: c, hide: x === 54.4 });
    for (let x = 44.6; x < 66; x += 2.8) paint(B, x, -19.6, x, -14.6, { w: .12 });
    for (const [x0, z0, x1, z1] of [[52, -42, 76, -42], [52, -28, 76, -28], [52, -42, 52, -28], [76, -42, 76, -28]]) fence(B, x0, z0, x1, z1);
    { const K = kit(B, 64, -35);
      for (const x of [57, 64, 71]) { K.box('p_concrete_precast', x, 0, -35, 4, .3, 4); K.box('p_paint_grey', x, .3, -35, 2.4, 2.6, 2); for (let k = -4; k <= 4; k++) K.box('p_paint_grey', x + k * .26, .6, -36.3, .05, 1.9, .6);
        for (let k = -1; k <= 1; k++) K.cyl('p_porcelain', x + k * .7, 2.9, -34.6, .09, .8, { seg: 8 }); }
    }
    B.prop('generator', 73, 0, 4, { variant: 'yellow', ry: H }); B.prop('dumpster', 73, 0, -6, { variant: 'blue', ry: -H, hide: true });
    B.prop('vent', 72.5, 0, 18, { variant: 'duct', len: 3, hide: true });
    // shower stations, hydrants, monitors, signs
    { const K = kit(B, 0, 0);
      for (const [x, z, a] of [[-33.5, -8, H], [-26, -40, 0], [32, -8, -H], [16.2, 12, -H]]) { const Kk = kit(B, x, z); Kk.push(x, 0, z, a);
        Kk.box('p_coat_green', 0, 0, 0, .12, 2.4, .12); Kk.box('p_coat_green', 0, 2.3, .25, .1, .1, .5); Kk.lathe('p_coat_green', [[.02, 0], [.22, .12], [.24, .16]], { x: 0, y: 2.08, z: .5, seg: 12 });
        Kk.box('p_coat_green', 0, 1.0, .25, .45, .06, .35); Kk.pop(); }
      void K;
    }
    for (const [x, z] of [[-28.5, 40], [33.5, 40], [-28.5, -32], [33.5, -32], [-28.5, -10], [42.5, 20], [-14, 46.5], [14, 46.5]]) B.prop('fire_hydrant', x, 0, z, { variant: 'red' });
    for (const [x, z] of [[-30, 46.5], [-60, 46.5], [30, 46.5], [60, 39.5], [-40, -29.5], [-70, -29.5], [-26, -57], [26, -57], [-37, -20], [43, -24]]) B.prop('street_light', x, 0, z, { ry: face(x, z, x, x > 0 ? (z > 0 ? 43 : -34) : (z > 0 ? 43 : -34)), on: false, h: 8 });
    for (const [x, z, a, k] of [[-28.2, -36, H, 'nosmoke'], [16.2, 9.5, H, 'h2s'], [-12.5, 46.3, 0, 'muster'], [16.5, -55.9, PI, 'hardhat']]) {
      const K = kit(B, x, z); K.push(x, 0, z, a); K.box('p_galv', -.9, 0, 0, .08, 2.6, .08); K.box('p_galv', .9, 0, 0, .08, 2.6, .08); K.box('p_paint_grey', 0, 1.9, -.03, 2.0, .5, .04); K.pop();
      decal(B, 'sign', k, x + Math.sin(a) * .0, 2.15, z, 1.96, .2, { face: 'n', ry: a });
    }
    // road paint
    for (const [x0, z0, x1, z1] of [[-32, -56, -32, 40], [38, -56, 38, 40], [-84, 43, 76, 43], [-84, -34, -32, -34]]) paint(B, x0, z0, x1, z1, { w: .12, dash: [3, 4] });
    for (const [x0, z0, x1, z1] of [[-35.8, -56, -35.8, 40], [-28.2, -32, -28.2, 40], [34.2, -32, 34.2, 40], [41.8, -56, 41.8, 40], [-84, 40.2, -36, 40.2], [-28, 40.2, 34, 40.2], [42, 40.2, 76, 40.2], [-84, 45.8, 76, 45.8]]) paint(B, x0, z0, x1, z1, { w: .1, col: YEL });
    decal(B, 'sign', 'speed', -32, .013, -20, 4.5, .8, { face: 'u', ry: PI }); decal(B, 'sign', 'speed', 38, .013, 20, 4.5, .8, { face: 'u' });
    decal(B, 'sign', 'stop', -32, .013, 37.4, 3, .9, { face: 'u', ry: PI }); decal(B, 'sign', 'stop', 38, .013, 37.4, 3, .9, { face: 'u', ry: PI });
    decal(B, 'sign', 'lane', 0, .013, -46, 4, .8, { face: 'u', ry: -H }); decal(B, 'sign', 'scaleN', -13, .07, -59.5, 2.6, .7, { face: 'u' });
    for (const x of [-13, 13]) paint(B, x - 1.7, -57.6, x + 1.7, -57.6, { w: .35 });
    decal(B, 'sign', 'hatch', 0, .013, -56.5, 3, 3, { face: 'u', col: YEL });
    decal(B, 'sign', 'keep', 0, .013, 1.5, 3.6, 1, { face: 'u', ry: H });
    // route arrows to the sites (yellow, on the ground)
    for (const [x, z, a, k] of [[-25, -44, -H, 'A'], [30, -44, H, 'B'], [-24, 3.5, -H, 'A'], [26, 3.5, H, 'B'], [-14, 43, -H, 'A'], [14, 43, H, 'B'], [-32, -26, 0, 'A'], [38, -26, 0, 'B']]) {
      decal(B, 'sign', 'arrow', x, .014, z, .9, 1.8, { face: 'u', ry: a, col: YEL });
      decal(B, 'sign', k, x - Math.sin(a) * 1.7, .014, z - Math.cos(a) * 1.7, 1.1, 1.1, { face: 'u', ry: a, col: YEL });
    }
    for (const x of [-10, -2, 6]) for (const z of [-46, -40]) B.prop('light_fixture', x, 7.2, z, { variant: 'strip', on: true });
    // stains, tyre marks, cracks, litter
    for (const [x, z, s] of [[-3, -46, 'oil0'], [6, -40, 'oil1'], [-10, -46, 'drip'], [10, -40, 'oil2'], [-13, -68, 'oil1'], [-20, 6.2, 'drip'], [-6, 6.2, 'oil2'], [20, 6.2, 'drip'], [-25.5, -19.5, 'oil0'], [-22.5, -19.5, 'drip'], [-55.5, -50.5, 'oil1'], [-74, -46, 'oil0'], [-53, 11.5, 'oil2'], [-49, 11.5, 'drip'], [25, 17, 'oil1'], [25, 23, 'oil0'], [9, 26.8, 'drip']])
      decal(B, 'stain', s, x, .016, z, 2.2 + R() * 1.6, 2.2 + R() * 1.6, { face: 'u', ry: R() * 6 });
    for (const [x, z, a] of [[-18, -46, 0], [-20, -40, 0], [16, -46, 0], [-32, -44, H], [38, -40, H], [-13, -62, H], [13, -62, H], [-32, 20, H], [38, 26, H], [0, 43, 0], [-50, 43, 0]]) decal(B, 'stain', R() < .5 ? 'tyre' : 'tyre2', x, .014, z, 8, 2, { face: 'u', ry: a });
    for (let i = 0; i < 26; i++) { const pts = [[-32, -50 + i * 3.4], [38, -50 + i * 3.4], [-60 + i * 4.6, 43]][i % 3]; decal(B, 'stain', ['crack', 'patch', 'crack'][i % 3], pts[0] + R() * 4 - 2, .015, pts[1], 2.5, 2.5, { face: 'u', ry: R() * 6 }); }
    for (const [x, z] of [[-27, -44], [24, -36], [-30, 30], [36, -10], [-10, 47], [70, -12], [-70, 46], [-12, 34]]) decal(B, 'stain', R() < .5 ? 'dust' : 'leaves', x, .017, z, 2.4, 2.4, { face: 'u', ry: R() * 6 });
    for (const [x, z, w, f] of [[0, -61.88, 16, 'n'], [56, -10.22, 24, 's'], [56, 12.22, 24, 'n'], [18, -19.86, 12, 'n'], [-54, -43.88, 16, 'n']]) decal(B, 'stain', 'grime', x, .7, z, w, 1.4, { face: f });
    for (const [x, z] of [[-30, -20], [-60, 30], [30, 34], [-10, -36]]) B.prop('trash_bag', x, 0, z, { n: 3 });
    // scale house extras
    B.prop('bench', -5.8, FL, -62.9, { ry: PI }); B.prop('litter_bin', 7.2, FL, -62.8, { variant: 'square' }); B.prop('vending_machine', 7.3, FL, -68.8, { ry: -H, variant: 'snacks' });
    B.prop('chair', 1.4, FL, -70.4, { variant: 'plastic', ry: PI }); B.prop('poster', 7.88, FL + 1.1, -70.2, { ry: -H, i: 4 });

    mark('before markers: objectives,');
    // ============================================================ markers: objectives, spawns, hides
    B.hostage(51, CB, -4.2); B.hostage(46, CB, -1); B.hostage(65.5, CB, -7); B.hostage(10, 0, 19.5); B.hostage(-51, 0, 12.5);
    B.rescue({ x0: -27, z0: -56, x1: -18, z1: -48 });
    B.point('dom1', -32, null, 2, 4); B.point('dom2', 0, null, 2, 4); B.point('dom3', 38, null, 2, 4);
    B.point('hp1', -20, 0, -44, 5); B.point('hp2', -49, null, 6, 5); B.point('hp3', 0, null, 19.5, 5); B.point('hp4', 57, CB, 5, 5); B.point('hp5', -22, null, -12, 5);
    B.point('hill', 0, null, 2, 5);
    B.point('flag1', 0, null, -57, 1.5); B.point('flag2', 0, null, 47.5, 1.5);
    B.point('extract1', -72, null, 43, 3); B.point('extract2', 70, null, 43, 3); B.point('extract3', 22, 0, 47.5, 3);
    B.point('hq1', -22, null, -44, 4); B.point('hq2', 25, 0, 20, 4);
    for (const [x, z] of [[-20, -52], [20, -52], [-31, -44], [30, -44], [-24, -35], [26, -35], [-20, -61], [20, -61], [-31, -18], [38, -20]])
      B.spawn(1, x, null, z, face(x, z, 0, 0), { field: true });
    for (const [x, z] of [[-20, 48], [20, 48], [-32, 43], [32, 43], [-32, 28], [38, 28], [-60, 52], [56, 50], [0, 43], [-14, 52]])
      B.spawn(2, x, null, z, face(x, z, 0, 0), { field: true });
    for (const [x, y, z] of [[-70, null, -45], [-50, null, -34], [-25, null, -46], [25, null, -52], [50, null, -20], [72, null, -4], [60, CB, 8], [38, null, 20],
      [-32, null, 30], [-62, null, 2], [-78, null, 6], [-46, null, 34], [0, null, 2], [-20, null, 14], [12, L1, 20], [-60, null, 43], [-20, 0, 54], [24, null, 44], [66, null, 30], [18, null, -12]])
      B.spawn(0, x, y, z, face(x, z, 0, 0));
    B.hide(-82, null, 21, { kind: 'dark' }); B.hide(-82, null, -9, { kind: 'dark' }); B.hide(-42.4, null, 1.5, { kind: 'under' });
    B.hide(-12.5, null, 28.6, { kind: 'dark' }); B.hide(12.5, L2, 29, { kind: 'roof' }); B.hide(45.4, CB, -2.2, { kind: 'closet' });
    B.hide(66, RT, 10, { kind: 'roof' }); B.hide(-40.2, null, -21.8, { kind: 'crates' }); B.hide(-24.4, null, -14.2, { kind: 'crates' });

    mark('markers'); finish(B); mark('finish');
    B.prop = prop0;
  },
};
