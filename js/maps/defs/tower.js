/* LIVE FIRE — "tower" = Meridian Tower: levels 31 and 32 of a downtown slab office tower at night (long narrow floor plate,
   central core with elevator banks, a fire stair at each end of the core, a double-height atrium with a feature stair).
   L31 = IT & operations (freight hall = team 1 lobby, server room = site A, NOC, open plans, training room, staff kitchen),
   L32 = executive floor (security desk lobby = team 2 lobby, executive suite = site B, boardroom, CEO office, meeting
   rooms, library, executive dining). Original layout and fictional tenant ("Halden & Rook").
   Plan (x east, z north): slab x -46..46, z -20..20; glass facades at z = +-19.75; L31 floor y 0, L32 floor y 4.2,
   ceilings 2.9 m. Design notes: tools/test/out/notes-map-tower.md. Exports: default MapDef */
import { tileRects, slabs, wallS, glassWall, curtainWall, sign, flushSigns, skyline, troffer, strip, door } from '../kit_tower.js';
import { PROPS } from '../props.js';

const XW = 45.6, ZF = 19.75, CH = 2.9, L2 = 4.2, Y = [0, L2];
const COLX = [-40.5, -31.5, -22.5, -13.5, -4.5, 4.5, 13.5, 22.5, 31.5, 40.5];
const PI = Math.PI;

export default {
  id: 'tower', name: 'Meridian Tower', size: 'M',
  desc: 'Levels 31-32 of a downtown office tower at night: server room, executive suite, atrium, two fire stairs.',
  env: { hdri: 'night_city', sky: 'night', time: 'night', exposure: 1.0, ambient: [2.4, 2.5, 2.8], fog: { color: [0.035, 0.032, 0.03], density: 0.0014 },
    indoorIbl: .5, weather: 'clear', ambience: 'office', reverb: 'room' },
  bounds: { minX: -46.5, maxX: 46.5, minZ: -20.5, maxZ: 20.5, minY: -1, maxY: 11 },

  build(B) {
    let seedK = 0;   // organic props would get a seed per position (a new kit each): give them one of three seeds so kits are shared
    const P = (type, x, y, z, o = {}) => B.prop(type, x, y, z, PROPS[type] && PROPS[type].vary && o.seed == null ? Object.assign({ seed: 1 + (seedK++ % 3) }, o) : o);
    const box = (x, y, z, w, h, d, o) => B.box(x, y, z, w, h, d, o);

    // ================================================================== structure: slabs, floors, ceilings
    // L31 structural slab + finishes (top y 0)
    box(0, -0.4, 0, 92, 0.38, 40, { mat: 'concrete', cast: false });
    const f31 = tileRects(-XW, -ZF, XW, ZF, [
      { x0: -XW, z0: -6, x1: -35.8, z1: 6, mat: 'concrete_floor' },
      { x0: -35.8, z0: -6, x1: -18, z1: 6, mat: 'tile_floor' },
      { x0: -XW, z0: 6, x1: -18, z1: ZF, mat: 'tile_floor' },
      { x0: -XW, z0: -ZF, x1: -18, z1: -6, mat: 'concrete_floor' },
      { x0: -18, z0: -5, x1: -13.8, z1: 5, mat: 'concrete_floor' }, { x0: 13.8, z0: -5, x1: 18, z1: 5, mat: 'concrete_floor' },
      { x0: -13.8, z0: -5, x1: -3, z1: 5, mat: null }, { x0: 3, z0: -5, x1: 13.8, z1: 5, mat: null },
      { x0: -3, z0: -5, x1: 3, z1: 5, mat: 'marble' },
      { x0: -8.5, z0: -ZF, x1: 8.5, z1: -5, mat: 'marble' },
      { x0: 18, z0: 8.5, x1: 34, z1: ZF, mat: 'concrete_floor' },
      { x0: 34, z0: 8.5, x1: XW, z1: ZF, mat: 'tile_floor' },
      { x0: 30, z0: -ZF, x1: XW, z1: -8, mat: 'tile_floor' },
    ], 'tw_carpet31');
    slabs(B, f31, -0.02, 0);
    // L31 ceilings (bottom y 2.9) and the slab between the floors
    const holes = [{ x0: -18, z0: -5, x1: -13.8, z1: 5, mat: null }, { x0: 13.8, z0: -5, x1: 18, z1: 5, mat: null },
      { x0: -13.8, z0: -5, x1: -3, z1: 5, mat: null }, { x0: 3, z0: -5, x1: 13.8, z1: 5, mat: null }];
    const voidR = { x0: -6.5, z0: -17, x1: 6.5, z1: -8.5, mat: null };
    const c31 = tileRects(-XW, -ZF, XW, ZF, [
      { x0: -42.6, z0: -6, x1: -35.8, z1: 6, mat: 'plaster_white' },
      { x0: -3, z0: -5, x1: 3, z1: 5, mat: 'plaster_white' },
      { x0: -8.5, z0: -ZF, x1: 8.5, z1: -5, mat: 'plaster_white' },
      ...holes, voidR], 'ceiling_tile');
    slabs(B, c31, CH, CH + 0.1, { face: 'b', side: 'tw_fascia', cast: false });
    const s12 = tileRects(-XW, -ZF, XW, ZF, [...holes, voidR], 'concrete');
    slabs(B, s12, CH + 0.1, L2 - 0.02, { cast: false });
    // L32 finishes (top y 4.2)
    const f32 = tileRects(-XW, -ZF, XW, ZF, [
      { x0: -XW, z0: -6, x1: -35.8, z1: 6, mat: 'tile_floor' },
      { x0: -35.8, z0: -6, x1: -18, z1: 6, mat: 'tw_lobbystone' },
      { x0: -XW, z0: 6, x1: -18, z1: ZF, mat: 'parquet' },
      { x0: -XW, z0: -ZF, x1: -18, z1: -6, mat: 'parquet' },
      { x0: -3, z0: -5, x1: 3, z1: 5, mat: 'marble' },
      { x0: -8.5, z0: -ZF, x1: 8.5, z1: -5, mat: 'marble' },
      { x0: 8.5, z0: -ZF, x1: 30, z1: -8, mat: 'tw_oak' },
      { x0: 8.5, z0: -ZF, x1: 18, z1: -14, mat: 'tw_carpet_exec' },
      { x0: 30, z0: -ZF, x1: XW, z1: -8, mat: 'tw_oak' },
      { x0: 18, z0: -8, x1: XW, z1: 8.5, mat: 'tw_carpet_exec' },
      { x0: 34, z0: 8.5, x1: XW, z1: ZF, mat: 'tw_lobbystone' },
      ...holes, voidR], 'tw_carpet32');
    slabs(B, f32, L2 - 0.02, L2);
    // L32 ceilings (bottom 7.1) and the roof slab
    const c32 = tileRects(-XW, -ZF, XW, ZF, [
      { x0: -3, z0: -5, x1: 3, z1: 5, mat: 'plaster_white' },
      { x0: -8.5, z0: -ZF, x1: 8.5, z1: -5, mat: 'plaster_white' },
      { x0: 34, z0: 8.5, x1: XW, z1: ZF, mat: 'plaster_white' },
      { x0: 8.5, z0: -ZF, x1: XW, z1: -8, mat: 'plaster_white' },
      ...holes], 'ceiling_tile');
    slabs(B, c32, L2 + CH, L2 + CH + 0.1, { face: 'b', side: 'tw_fascia', cast: false });
    slabs(B, tileRects(-XW, -ZF, XW, ZF, holes, 'concrete'), L2 + CH + 0.1, 8.4, { cast: false });
    // the atrium void: fascia around the slab edge (seen from the atrium floor), nosing on the walkway edge
    const fas = { mat: 'tw_fascia', collide: false, cast: false };
    box(0, CH - 0.05, -8.5 + 0.03, 13.06, L2 - CH + 0.07, 0.06, fas); box(0, CH - 0.05, -17 - 0.03, 13.06, L2 - CH + 0.07, 0.06, fas);
    box(-6.5 - 0.03, CH - 0.05, -12.75, 0.06, L2 - CH + 0.07, 8.5, fas); box(6.5 + 0.03, CH - 0.05, -12.75, 0.06, L2 - CH + 0.07, 8.5, fas);
    for (const [x, z, w, d] of [[0, -8.5, 13, .06], [0, -17, 13, .06], [-6.5, -12.75, .06, 8.5], [6.5, -12.75, .06, 8.5]]) box(x, L2 - 0.03, z, w + .1, .05, d + .1, { mat: 'tw_alu', collide: false });

    // ================================================================== envelope: end walls, facades, columns
    for (const s of [-1, 1]) box(s * 45.8, 0, 0, 0.4, 8.4, 40, { mat: 'tw_wall', mats: { [s < 0 ? 'w' : 'e']: 'tw_stone_end' } });
    const colGaps = COLX.map(x => [x - 0.45, x + 0.45]);
    for (const y of Y) for (const s of [-1, 1]) {
      curtainWall(B, s * ZF, -XW, XW, y, CH, s, { gaps: colGaps });
      box(0, y + CH, s * ZF, 91.2, L2 - CH, 0.1, { mat: 'tw_mullion', cast: false });   // spandrel behind the ceiling
    }
    for (const x of COLX) for (const s of [-1, 1]) {
      box(x, 0, s * 19.3, 0.75, 8.4, 0.8, { mat: 'tw_fascia' });                                    // facade columns
      for (const y of Y) box(x, y, s * 18.89, 0.77, 0.1, 0.02, { mat: 'tw_skirt', collide: false, cast: false });
    }
    for (const x of COLX) for (const s of [-1, 1]) {
      box(x, 0, s * 12, 0.7, 8.4, 0.7, { mat: 'tw_fascia' });                                      // interior columns
      for (const y of Y) box(x, y, s * 12, 0.73, 0.1, 0.73, { mat: 'tw_skirt', collide: false, cast: false });
    }

    // ================================================================== core: stair shafts, core blocks, elevator lobby
    for (const sx of [-1, 1]) {
      const s = sx, cx = sx * 15.775, xw = sx * 17.875;
      // shaft walls (door wall with openings on L31 and L32), cap above L33
      wallS(B, xw, -5, xw, 5, { t: 0.25, h: 10.6, mat: sx < 0 ? 'tw_wall' : 'tw_stair_wall', mat2: sx < 0 ? 'tw_stair_wall' : 'tw_wall',
        openings: [{ at: 5 + s * 3.2, w: 1.1, h: 2.15, leaf: { v: 'metal', open: 100, flip: sx > 0 } }, { at: 5 + s * 3.2, w: 1.1, h: 2.15, y: L2, leaf: { v: 'metal', open: 100, flip: sx > 0 } }] });
      for (const zz of [-1, 1]) wallS(B, sx * 17.75, zz * 4.875, sx * 13.8, zz * 4.875, { t: 0.25, h: 10.6,
        mat: (zz > 0) === (sx < 0) ? 'tw_wall' : 'tw_stair_wall', mat2: (zz > 0) === (sx < 0) ? 'tw_stair_wall' : 'tw_wall', skirt: false });
      box(sx * 13.925, 8.4, 0, 0.25, 2.2, 10, { mat: 'tw_stair_wall' });
      box(cx, 10.6, 0, 4.2, 0.2, 10, { mat: 'tw_stair_wall' });
      const st = { w: 1.7, len: 3.36, mat: 'tw_stair_wall', tread: 'concrete_dark', rail: true, railMat: 'paint_yellow' };
      const up = s < 0 ? '+z' : '-z', dn = s < 0 ? '-z' : '+z';
      for (const [y0, k] of [[0, 0], [L2, 1], [8.4, 2]]) {
        if (k < 2) {
          B.stairs({ ...st, x: sx * 16.9, z: -s * 0.08, y0, y1: y0 + 2.1, dir: up });
          box(cx, y0 + 1.9, -s * 3.255, 3.95, 0.2, 2.99, { mat: 'concrete', mats: { t: 'concrete_dark', b: 'tw_stair_wall' } });
          B.stairs({ ...st, x: sx * 14.65, z: -s * 0.08, y0: y0 + 2.1, y1: y0 + L2, dir: dn });
        }
        if (k > 0) box(cx, y0 - 0.3, s * 3.175, 3.95, 0.3, 3.15, { mat: 'concrete', mats: { t: 'concrete_dark', b: 'tw_stair_wall' } });
      }
      // locked security gate at the foot of the flight to level 33 (chain-link panel in a steel frame)
      const gz = s * 1.64;
      B.box(sx * 16.9, L2, gz, 1.7, 2.3, 0.06, { mat: 'chainlink', surf: 'metal', ray: false });
      for (const e of [-1, 1]) box(sx * 16.9 + e * 0.83, L2, gz, 0.05, 2.3, 0.06, { mat: 'paint_yellow', collide: false });
      box(sx * 16.9, L2 + 2.25, gz, 1.7, 0.05, 0.06, { mat: 'paint_yellow', collide: false });
      box(sx * 16.9, L2 + 1.0, gz, 1.7, 0.05, 0.07, { mat: 'paint_yellow', collide: false });
      sign(B, 'riser', sx * 16.9, L2 + 1.5, gz + s * 0.05, 0.42, 0.18, s < 0 ? PI : 0);
      // closed door on level 33 (visual)
      door(B, xw - sx * 0.13, 8.4, s * 3.2, PI / 2, { v: 'metal', w: 0.95, open: 0, t: 0.02 });
      // lights: a wall bulkhead at each mid landing (one real light per shaft), emissive ones higher up
      P('light_fixture', cx, 2.1 + 2.3, -s * 4.75, { variant: 'wall', ry: s < 0 ? PI : 0, light: true, intensity: 7 });
      P('light_fixture', cx, L2 + 2.1 + 2.3, -s * 4.75, { variant: 'wall', ry: s < 0 ? PI : 0 });
      P('light_fixture', cx, L2 + 2.5, s * 4.75, { variant: 'wall', ry: s < 0 ? 0 : PI });
      // signs at the doors (outside), exit signs
      for (const y of Y) {
        const fx = xw + sx * 0.14, fz = s * 3.2;
        sign(B, 'exit', fx, y + 2.42, fz, 0.42, 0.18, sx < 0 ? -PI / 2 : PI / 2, true);
        sign(B, (sx < 0 ? 'stA' : 'stB') + (y ? 32 : 31), fx, y + 1.55, fz - s * 1.05, 0.48, 0.32, sx < 0 ? -PI / 2 : PI / 2);
        P('fire_extinguisher', sx * 18.0, y, s * 3.2 + s * 1.7, { ry: sx < 0 ? -PI / 2 : PI / 2 });
        sign(B, 'lvl' + (y ? 32 : 31), sx * 17.74, y + 1.6, s * 0.2, 0.5, 0.5, sx < 0 ? PI / 2 : -PI / 2);
      }
      // the nook under the upper flight: spare chairs and a mop bucket
      const nx = sx * 14.65;
      P('chair', nx, 0, -s * 3.9, { variant: 'plastic', ry: 0.4 }); P('chair', nx + 0.1, 0.45, -s * 3.9, { variant: 'plastic', ry: 0.5, collide: false });
      P('cardboard_box', nx - sx * 0.2, 0, -s * 2.9, { variant: 'flat' });
      B.hide(nx, 0, -s * 3.2, { kind: 'under', r: 0.7 });
    }
    // core blocks (solid, both floors) with closets cut into them
    const coreBlock = (x0, x1, faceW, faceE, cuts) => {
      for (const [y0, y1] of [[0, L2], [L2, 8.4]]) {
        const mine = cuts.filter(c => c.y0 >= y0 && c.y0 < y1);
        const mats = { w: faceW, e: faceE, n: 'tw_wall', s: 'tw_wall', t: 'concrete', b: 'concrete' };
        if (!mine.length) { box((x0 + x1) / 2, y0, 0, x1 - x0, y1 - y0, 10, { mat: 'tw_wall', mats }); continue; }
        const c = mine[0];
        box((x0 + c.x0) / 2, y0, 0, c.x0 - x0, y1 - y0, 10, { mat: 'tw_wall', mats });
        box((c.x1 + x1) / 2, y0, 0, x1 - c.x1, y1 - y0, 10, { mat: 'tw_wall', mats });
        const za = c.side > 0 ? -5 : -5 + 1.4, zb = c.side > 0 ? 5 - 1.4 : 5;
        box((c.x0 + c.x1) / 2, y0, (za + zb) / 2, c.x1 - c.x0, y1 - y0, zb - za, { mat: 'tw_wall', mats });
        const ca = c.side > 0 ? 5 - 1.4 : -5, cb = c.side > 0 ? 5 : -5 + 1.4;
        box((c.x0 + c.x1) / 2, c.y0 + 2.2, (ca + cb) / 2, c.x1 - c.x0, y1 - c.y0 - 2.2, cb - ca, { mat: 'tw_wall', mats: { b: 'plaster_white' } });
        box((c.x0 + c.x1) / 2, c.y0 - 0.02, (ca + cb) / 2, c.x1 - c.x0, 0.02, cb - ca, { mat: 'tile_floor' });
        // frame + an open door + shelves inside
        const fz = c.side * 5;
        for (const e of [-1, 1]) box((c.x0 + c.x1) / 2 + e * ((c.x1 - c.x0) / 2 - 0.035), c.y0, fz, 0.07, 2.2, 0.06, { mat: 'tw_skirt', collide: false });
        box((c.x0 + c.x1) / 2, c.y0 + 2.13, fz, c.x1 - c.x0, 0.07, 0.06, { mat: 'tw_skirt', collide: false });
        P('shelf_unit', (c.x0 + c.x1) / 2, c.y0, fz - c.side * 1.15, { ry: c.side > 0 ? 0 : PI, w: 1.2, variant: 'grey' });
        P('light_fixture', (c.x0 + c.x1) / 2, c.y0 + 2.2, fz - c.side * 0.6, { variant: 'bulb', drop: .2 });
        sign(B, c.sign, (c.x0 + c.x1) / 2, c.y0 + 2.42, fz + c.side * 0.01, 0.4, 0.17, c.side > 0 ? 0 : PI);
        B.hide((c.x0 + c.x1) / 2, c.y0, fz - c.side * 0.45, { kind: 'closet', r: 0.5 });
      }
    };
    coreBlock(-13.8, -3, 'tw_stair_wall', 'tw_veneer', [{ x0: -9.2, x1: -7.8, y0: 0, side: 1, sign: 'janitor' }, { x0: -13.4, x1: -12.0, y0: L2, side: -1, sign: 'janitor' }]);
    coreBlock(3, 13.8, 'tw_veneer', 'tw_stair_wall', [{ x0: 9.0, x1: 10.4, y0: 0, side: -1, sign: 'riser' }]);
    // washroom doors on the corridor faces (closed: the washrooms are not part of the playable space), signs
    for (const y of Y) {
      for (const [x, z, sg] of [[-6, 5, 'wcm'], [-11.8, 5, 'wcw'], [6, -5, 'wcm'], [11.8, -5, 'wcw'], [6.2, 5, null], [-11.0, -5, null]]) {
        if (y && x === -11.0) continue;
        door(B, x, y, z + (z > 0 ? 0.03 : -0.03), z > 0 ? 0 : PI, { v: sg ? 'white' : 'metal', w: 0.9, open: 0, t: 0.02 });
        if (sg) sign(B, sg, x + 0.95, y + 1.5, z + (z > 0 ? 0.01 : -0.01), 0.3, 0.13, z > 0 ? 0 : PI);
      }
      // elevator lobby: three cars each side, stainless surrounds, hall lanterns, call buttons
      for (const sx of [-1, 1]) for (const z of [-3.2, 0, 3.2]) {
        const fx = sx * 3, ry = sx < 0 ? PI / 2 : -PI / 2, inx = -sx;
        box(fx + inx * 0.02, y, z, 0.04, 2.45, 1.36, { mat: 'p_stainless', collide: false });
        box(fx + inx * 0.035, y, z - 0.275, 0.02, 2.3, 0.54, { mat: 'p_chrome', collide: false });
        box(fx + inx * 0.035, y, z + 0.275, 0.02, 2.3, 0.54, { mat: 'p_chrome', collide: false });
        sign(B, y ? 'hallLantern2' : 'hallLantern', fx + inx * 0.045, y + 2.6, z, 0.4, 0.1, ry, true);
      }
      for (const sx of [-1, 1]) for (const z of [-1.6, 1.6]) { box(sx * 2.96, y + 1.0, z, 0.04, 0.22, 0.1, { mat: 'p_stainless', collide: false }); box(sx * 2.94, y + 1.06, z, 0.01, 0.04, 0.04, { mat: 'p_em_amber', collide: false }); }
      sign(B, 'lvl' + (y ? 32 : 31), 0, y + 1.7, 4.98, 0.6, 0.6, PI);
      sign(B, 'map', 2.99, y + 1.3, -4.2, 0.5, 0.38, -PI / 2);
      for (const z of [-3, 0, 3]) P('light_fixture', 0, y + CH, z, { variant: 'pendant', drop: .45, warm: true });
    }
    // L32: tenant glass entry doors across both ends of the elevator lobby
    for (const z of [-5, 5]) glassWall(B, -3, z, 3, z, { y: L2, h: CH, doors: [{ at: 3, w: 1.8, open: 88 }] });

    // ================================================================== level 31
    const w31 = (x0, z0, x1, z1, o = {}) => wallS(B, x0, z0, x1, z1, Object.assign({ y: 0 }, o));
    // ---- team 1 lobby: freight elevator hall (west end)
    // freight shaft block with one car standing open
    box(-44.1, 0, -5.2, 3, 8.4, 1.6, { mat: 'tw_wall', mats: { e: 'tw_stair_wall' } });
    box(-44.1, 0, 2.2, 3, 8.4, 7.6, { mat: 'tw_wall', mats: { e: 'tw_stair_wall' } });
    box(-45.5, 0, -3, 0.2, 2.6, 2.8, { mat: 'p_fab_navy' });
    box(-44.1, 2.6, -3, 3, 5.8, 2.8, { mat: 'tw_wall', mats: { e: 'tw_stair_wall', b: 'p_stainless' } });
    box(-44.0, 0, -3, 2.8, 0.03, 2.8, { mat: 'metal_plate' });
    for (const zz of [-4.38, -1.62]) box(-44.0, 0.15, zz, 2.6, 2.3, 0.04, { mat: 'p_fab_navy', collide: false });
    for (const zz of [-4.38, -1.62]) for (let i = 0; i < 4; i++) box(-45.0 + i * 0.66, 0.15, zz, 0.02, 2.3, 0.05, { mat: 'p_fab_charcoal', collide: false });
    box(-44.0, 2.56, -3, 1.2, 0.03, 0.6, { mat: 'emissive_white', collide: false, cast: false });
    for (const zz of [-4.48, -1.52]) box(-42.62, 0, zz, 0.1, 2.6, 0.12, { mat: 'p_stainless', collide: false });
    box(-42.62, 2.6, -3, 0.1, 0.12, 3.08, { mat: 'p_stainless', collide: false });
    for (const y of Y) {
      box(-42.58, y, 3, 0.04, 2.7, 3.1, { mat: 'p_stainless', collide: false });                          // the closed car
      box(-42.56, y, 3, 0.02, 2.55, 0.03, { mat: 'tw_skirt', collide: false });
      sign(B, 'freight', -42.55, y + 2.95, 0, 1.2, 0.25, PI / 2);
      box(-42.56, y + 1.1, 0.0, 0.04, 0.3, 0.12, { mat: 'p_stainless', collide: false });
      box(-42.55, y + 1.2, 0.0, 0.02, 0.05, 0.05, { mat: 'p_em_amber', collide: false });
    }
    box(-42.58, L2, -3, 0.04, 2.7, 3.1, { mat: 'p_stainless', collide: false });
    w31(-42.6, 6, -36, 6, { t: 0.2, mat: 'tw_wall', mat2: 'tw_stair_wall', openings: [{ at: 3.35, w: 2.6, h: 2.6, frame: false }] });
    w31(-42.6, -6, -36, -6, { t: 0.2, mat: 'tw_stair_wall', mat2: 'tw_wall', openings: [{ at: 3.35, w: 2.6, h: 2.6, frame: false }] });
    w31(-35.9, -6.1, -35.9, 6.1, { t: 0.2, mat: 'tw_stair_wall', mat2: 'tw_wall' });
    B.lobby(1, { x0: -45.4, z0: -5.9, x1: -36, z1: 5.9, y: 0 }, [{ x: -39.25, z: 6, w: 2.6, h: 2.6 }, { x: -39.25, z: -6, w: 2.6, h: 2.6 }]);
    {
      let i = 0;
      for (const x of [-41.6, -39.8, -38.0, -36.6]) for (const z of [-4.3, -1.4, 1.4, 4.3]) { if ((x === -36.6 && Math.abs(z) > 4) || i > 13) continue; B.spawn(1, x, 0, z, z > 0 ? 0 : PI); i++; }
      B.spawn(1, -44.6, 0, -3.8, PI / 2); B.spawn(1, -43.4, 0, -2.2, PI / 2);
    }
    B.light({ x: -39.2, y: CH, z: 0, intensity: 9, fixture: 'tube', color: [0.92, 0.96, 1] });
    for (const z of [-3.5, 3.5]) strip(B, -39.2, CH, z);
    P('pallet_jack', -36.8, 0, -5.2, { ry: -PI / 2 }); P('cardboard_box', -36.6, 0, 5.3, { variant: 'pile', n: 4 });
    P('fire_extinguisher', -36.03, 0, -3.0, { ry: -PI / 2 });
    sign(B, 'map', -36.02, 1.4, 2.6, 0.5, 0.38, -PI / 2);
    for (const z of [-5.86, 5.86]) for (const [a, b] of [[-42.55, -40.6], [-37.9, -36.05]]) for (const yy of [0.3, 0.9]) box((a + b) / 2, yy, z, b - a, 0.14, 0.05, { mat: 'p_wood_pallet', collide: false });
    for (const yy of [0.3, 0.9]) box(-36.05, yy, 0, 0.05, 0.14, 11.7, { mat: 'p_wood_pallet', collide: false });

    // ---- west service lobby (between the freight hall and stair A)
    w31(-35.8, 6, -18, 6, { mat2: 'tw_wall', openings: [{ at: 5.8, w: 2.4, h: 2.4 }, { at: 13.3, w: 1.8, h: 2.15, leaf: { v: 'double', open: 95 } }] });
    w31(-35.8, -6, -18, -6, { openings: [{ at: 5.8, w: 2.4, h: 2.4 }, { at: 13.3, w: 1.8, h: 2.15, leaf: { v: 'double', open: 95, flip: true } }] });
    P('cardboard_box', -34.8, 0, -5.4, { variant: 'pile', n: 5 }); P('pallet', -33.6, 0, 5.3, { variant: 'boxes', ry: 0.1 });
    P('trash_bag', -19.0, 0, 5.4, { n: 3 }); P('wheelie_bin', -19.2, 0, -5.45, { variant: 'blue', ry: PI }); P('wheelie_bin', -20.0, 0, -5.45, { variant: 'grey', ry: PI });
    P('vending_machine', -26.4, 0, 5.45, { ry: PI, variant: 'drinks' }); P('vending_machine', -25.4, 0, 5.45, { ry: PI, variant: 'snacks' });
    B.light({ x: -27, y: CH, z: 0, intensity: 8, fixture: 'panel', color: [1, 0.95, 0.88] });
    for (const [x, z] of [[-32, -3], [-32, 3], [-22, -3], [-22, 3]]) strip(B, x, CH, z);

    // ---- NW mail room and central stores
    w31(-18, 5, -18, ZF, { openings: [{ at: 4.5, w: 1.8, h: 2.15, leaf: { v: 'double', open: 92 } }, { at: 8.5, w: 1.3, h: 1.45, frame: false }, { at: 12.5, w: 1.6, h: 2.3 }] });
    P('vent', -18, 0, 13.5, { variant: 'duct', ry: PI / 2, len: 2.4, hide: true });
    for (const [x, z0, n, ry] of [[-45.3, 8.0, 4, PI / 2], [-42.6, 8.0, 4, PI / 2], [-42.1, 8.0, 4, -PI / 2], [-39.4, 8.0, 3, -PI / 2], [-45.3, 14.0, 4, PI / 2], [-42.6, 14.0, 4, PI / 2], [-42.1, 14.0, 4, -PI / 2]])
      for (let i = 0; i < n; i++) P('shelf_unit', x, 0, z0 + 0.6 + i * 1.22, { ry, w: 1.2, variant: (i + n) % 3 ? 'grey' : 'dark' });
    P('desk', -33.5, 0, 9.6, { variant: 'metal', w: 2.4 }); P('desk', -33.5, 0, 11.2, { variant: 'metal', w: 2.4, ry: PI });
    P('crate_plastic', -33.0, 0.75, 9.5, { variant: 'grey', n: 2 }); P('cardboard_box', -34.4, 0.75, 9.6, { variant: 'small' }); P('cardboard_box', -32.4, 0.75, 11.3, { variant: 'medium' });
    // stores cage (chain-link) with boxed equipment inside; the door panel stands open
    const cage = [[-30, 14, -24, 14], [-24, 14, -24, 19.1], [-30, 14, -30, 19.1]];
    for (const [x0, z0, x1, z1] of cage) {
      const L = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(L / 1.7));
      for (let k = 0; k < n; k++) { if (x0 === x1 && x0 === -24 && k === 1) continue;
        const a = (k + 0.5) / n, px = x0 + (x1 - x0) * a, pz = z0 + (z1 - z0) * a;
        box(px, 0, pz, x0 === x1 ? 0.04 : L / n - 0.06, 2.4, x0 === x1 ? L / n - 0.06 : 0.04, { mat: 'chainlink', surf: 'metal', ray: false });
        if (k) { const qx = x0 + (x1 - x0) * k / n, qz = z0 + (z1 - z0) * k / n; box(qx, 0, qz, 0.05, 2.45, 0.05, { mat: 'steel_dark', collide: false }); } }
    }
    for (const [x, z] of [[-30, 14], [-24, 14], [-30, 19.1], [-24, 19.1]]) box(x, 0, z, 0.06, 2.45, 0.06, { mat: 'steel_dark' });
    box(-23.2, 0, 16.4, 0.04, 2.4, 1.6, { mat: 'chainlink', surf: 'metal', ray: false, ry: 0.9 });
    P('pallet', -28.5, 0, 16.5, { variant: 'boxes', h: 1.1 }); P('pallet', -26.5, 0, 18.0, { variant: 'wrap', h: 1.4 }); P('cardboard_box', -28.8, 0, 18.5, { variant: 'pile', n: 6 });
    B.hide(-25.0, 0, 15.2, { kind: 'crates', r: 0.6 }); B.hide(-40.7, 0, 13.0, { kind: 'crates', r: 0.6 });
    P('pallet', -36.5, 0, 16.0, { variant: 'sacks' }); P('pallet_jack', -35.0, 0, 17.4, { ry: 0.3 });
    P('cardboard_box', -21.0, 0, 18.6, { variant: 'large', stack: 2 }); P('cardboard_box', -19.8, 0, 18.6, { variant: 'large', stack: 3 });
    sign(B, 'mail', -18.07, 2.5, 9.5, 0.6, 0.15, -PI / 2);
    B.light({ x: -33, y: CH, z: 13.5, intensity: 8, fixture: 'tube', color: [0.95, 0.97, 1] });
    for (const [x, z] of [[-41, 10], [-41, 16.5], [-27, 10], [-21, 14]]) strip(B, x, CH, z);

    // ---- SW IT staging / receiving
    w31(-18, -ZF, -18, -5, { openings: [{ at: 4.75, w: 1.0, h: 2.1, leaf: { v: 'wood', open: 95, flip: true } }, { at: 12.25, w: 2.0, h: 2.3 }] });
    P('rack', -40.5, 0, -17.9, { bays: 3, levels: 2, load: .7, lh: 1.2 });
    for (const [x, z, ry] of [[-34, -10, 0], [-31.5, -10.5, 0.2], [-34.5, -14.5, 0.1], [-28.5, -15.5, -0.15]]) P('pallet', x, 0, z, { variant: 'boxes', ry, h: 1.0 });
    P('server_rack', -26.0, 0, -9.0, { n: 2, on: false }); P('server_rack', -23.2, 0, -10.6, { n: 1, on: false, ry: 0.5 });
    P('pallet_jack', -24.5, 0, -12.5, { ry: 1.0 }); P('cardboard_box', -38.0, 0, -8.0, { variant: 'pile', n: 6 }); P('cardboard_box', -21.0, 0, -18.4, { variant: 'pile', n: 5 });
    P('crate_plastic', -35.2, 0, -16.8, { variant: 'blue', n: 4 }); P('crate_plastic', -34.5, 0, -16.8, { variant: 'blue', n: 3 });
    P('ibc_tank', -43.6, 0, -8.6, {}); P('drum', -44.4, 0, -10.2, { variant: 'blue', n: 2 });
    B.hide(-33.0, 0, -15.6, { kind: 'crates', r: 0.6 }); B.hide(-37.6, 0, -9.2, { kind: 'crates', r: 0.6 });
    B.light({ x: -31, y: CH, z: -13, intensity: 8, fixture: 'tube', color: [0.95, 0.97, 1] });
    for (const [x, z] of [[-40, -10], [-40, -15.5], [-24, -16], [-24, -9]]) strip(B, x, CH, z);

    // ---- north band: IT open plan (cubicle clusters back to back), huddle room, copier, water cooler
    glassWall(B, -4, 14.5, 2, 14.5, { doors: [{ at: 3, w: 1.0 }] });
    glassWall(B, -4, 14.5, -4, ZF - 0.5, {});
    glassWall(B, 2, 14.5, 2, ZF - 0.5, { doors: [{ at: 2.5, w: 1.0, open: -90 }] });
    P('dining_table', -1, 0, 17.2, { variant: 'white', w: 2.4, chairs: 6 }); P('whiteboard', -3.93, 1.0, 17.0, { ry: PI / 2, w: 1.6 });
    const cluster = (cx, cz, y, v) => { for (const dx of [0, 1.82]) { P('cubicle', cx + dx, y, cz - 0.91, { variant: v, ry: PI }); P('cubicle', cx + dx, y, cz + 0.91, { variant: v === 'grey' ? 'blue' : 'grey', ry: 0 }); } };
    cluster(-16, 9.8, 0, 'grey'); cluster(-11.6, 9.8, 0, 'blue'); cluster(-7.2, 9.8, 0, 'grey'); cluster(-16, 16.2, 0, 'beige'); cluster(-11.6, 16.2, 0, 'grey');
    cluster(4.0, 9.8, 0, 'grey'); cluster(4.0, 16.2, 0, 'blue');
    P('filing_cabinet', -17.65, 0, 7.4, { ry: PI / 2 }); P('filing_cabinet', -17.65, 0, 7.9, { ry: PI / 2, variant: '2' });
    const copier = (x, y, z, ry) => B.frame(x, y, z, ry, () => { box(0, 0, 0, 1.1, 0.95, 0.7, { mat: 'p_plastic_beige' }); box(0, 0.95, 0.05, 1.0, 0.18, 0.55, { mat: 'p_plastic_grey' }); box(-0.3, 0.98, -0.3, 0.3, 0.03, 0.1, { mat: 'p_em_dim', collide: false }); box(0.2, 0.3, 0.36, 0.5, 0.25, 0.02, { mat: 'p_plastic_grey', collide: false }); });
    const cooler = (x, y, z) => { box(x, y, z, 0.32, 1.0, 0.32, { mat: 'plastic_white' }); B.cyl(x, y + 1.0, z, 0.14, 0.42, { mat: 'p_glass_tint', sides: 12, collide: false }); };
    copier(8.4, 0, 6.6, 0); cooler(9.4, 0, 18.6); copier(-17.2, L2, 7.6, PI / 2);
    B.light({ x: -11, y: CH, z: 12.6, intensity: 8, fixture: 'panel', color: [0.98, 0.97, 0.93] });
    B.light({ x: 4.5, y: CH, z: 13.2, intensity: 7, fixture: 'panel', color: [0.98, 0.97, 0.93] });

    // ---- NOC (glass room) and the server room = SITE A
    glassWall(B, 10, 8.5, 10, ZF - 0.5, { doors: [{ at: 5.5, w: 1.0, open: 95 }] });
    w31(10, 8.5, 18, 8.5, { openings: [{ at: 4, w: 1.0, h: 2.1, leaf: { v: 'wood', open: 95 } }] });
    glassWall(B, 18, 8.5, 18, 19.15, { doors: [{ at: 5.5, w: 1.2, open: 95, flip: true }], frost: false });
    for (const z of [11.6, 16.2]) P('control_console', 14, 0, z, { len: 4.8, ry: PI });
    for (const z of [10.8, 15.4]) for (const x of [12.6, 14, 15.4]) P('office_chair', x, 0, z, { ry: 0, variant: 'charcoal' });
    box(14, 0.55, 19.0, 7.0, 2.1, 0.12, { mat: 'paint_black' });
    sign(B, 'vwall', 14, 1.6, 18.93, 6.8, 2.0, PI, true);
    sign(B, 'noc', 9.93, 2.45, 11.3, 0.9, 0.19, -PI / 2);
    B.hide(17.3, 0, 17.6, { kind: 'dark', r: 0.5 });
    w31(18, 8.5, 34, 8.5, { mat: 'tw_wall_grey', mat2: 'tw_wall', openings: [{ at: 7, w: 1.2, h: 2.15, leaf: { v: 'steel', open: 100, flip: true } }] });
    w31(34, 8.5, 34, ZF, { mat: 'tw_wall_grey', mat2: 'tw_wall_grey', openings: [{ at: 5.5, w: 1.2, h: 2.15, leaf: { v: 'steel', open: 100 } }] });
    w31(18.06, 19.15, 33.94, 19.15, { mat: 'tw_wall_grey', mat2: 'tw_wall_grey', skirt: false });
    box(26, 0, 13.82, 15.8, 0.25, 10.64, { mat: 'tw_skirt', mats: { t: 'tw_raised' } });
    for (const [x, z, w, d] of [[26, 8.56, 15.8, .04], [18.08, 13.82, .04, 10.64], [33.92, 13.82, .04, 10.64]]) box(x, 0.235, z, w, .02, d, { mat: 'hazard', collide: false });
    // rack rows run north-south in pairs (hot aisle between the backs), CRAC units on the north wall, UPS east, gas cylinders
    for (const xp of [20.0, 24.4, 28.8]) { P('server_rack', xp, 0.25, 12.3, { n: 8, ry: -PI / 2 }); P('server_rack', xp + 1.07, 0.25, 12.3, { n: 8, ry: PI / 2 }); }
    for (const x of [21.0, 25.0, 29.0]) { box(x, 0.25, 18.6, 1.8, 1.95, 0.85, { mat: 'tw_case', mats: { t: 'grate' } }); box(x, 1.4, 18.165, 1.6, 0.6, 0.02, { mat: 'grate', collide: false }); box(x + 0.6, 1.0, 18.16, 0.12, 0.08, 0.01, { mat: 'p_em_cyan', collide: false }); }
    P('gas_cylinder', 32.9, 0.25, 18.6, { variant: 'argon', rack: true }); P('gas_cylinder', 33.4, 0.25, 16.8, { variant: 'nitrogen', n: 3, ry: PI / 2 });
    for (const z of [9.6, 10.75]) box(32.9, 0.25, z, 1.2, 1.9, 0.9, { mat: 'p_paint_darkgrey', mats: { w: 'grate' } });
    B.hide(31.4, 0.25, 18.4, { kind: 'dark', r: 0.6 }); B.hide(18.8, 0.25, 17.8, { kind: 'dark', r: 0.5 });
    for (const xp of [20.53, 24.93, 29.33]) { box(xp, 2.55, 12.3, 0.45, 0.06, 4.9, { mat: 'grate', collide: false }); for (const e of [-1, 1]) box(xp + e * 0.22, 2.61, 12.3, 0.02, 0.06, 4.9, { mat: 'p_galv', collide: false }); }
    box(26, 2.55, 16.3, 15, 0.06, 0.45, { mat: 'grate', collide: false });
    sign(B, 'server', 25, 2.4, 8.43, 1.4, 0.29, PI);
    box(25.85, 1.1, 8.43, 0.06, 0.09, 0.01, { mat: 'p_em_amber', collide: false }); sign(B, 'cardreader', 25.85, 1.25, 8.43, 0.07, 0.11, PI);
    B.site('A', { x0: 19, z0: 9.2, x1: 33, z1: 18.8, y: 0.25 });
    B.light({ x: 22.4, y: CH, z: 12.3, intensity: 7, fixture: 'tube', color: [0.85, 0.92, 1] });
    B.light({ x: 30.5, y: CH, z: 15.6, intensity: 6, fixture: 'tube', color: [0.85, 0.92, 1] });
    for (const [x, z] of [[26.7, 10], [26.7, 14.6], [22.4, 16.6], [19.3, 9.4]]) strip(B, x, CH, z);

    // ---- NE IT workshop
    w31(34.06, 8.5, XW, 8.5, { openings: [{ at: 5.94, w: 1.2, h: 2.15, leaf: { v: 'metal', open: 95, flip: true } }] });
    P('desk', 38.0, 0, 12.6, { variant: 'metal', w: 2.4 }); P('desk', 38.0, 0, 15.8, { variant: 'metal', w: 2.4, ry: PI });
    P('shelf_unit', 45.35, 0, 10.6, { ry: -PI / 2, w: 1.2 }); P('shelf_unit', 45.35, 0, 11.82, { ry: -PI / 2, w: 1.2 }); P('shelf_unit', 45.35, 0, 13.04, { ry: -PI / 2, w: 1.2, variant: 'grey' });
    P('server_rack', 36.0, 0, 18.2, { n: 2, on: false, ry: PI }); P('cardboard_box', 43.0, 0, 9.3, { variant: 'pile', n: 5 });
    P('monitor', 37.6, 0.75, 12.4, {}); P('monitor', 38.6, 0.75, 16.0, { ry: PI });
    sign(B, 'workshop', 40, 2.45, 8.43, 0.8, 0.2, PI);
    for (const [x, z] of [[37, 11], [37, 17], [43, 14]]) troffer(B, x, CH, z);

    // ---- east operations area (around stair B)
    for (const [x, z, ry] of [[24, 1.5, 0], [24, -2.3, PI], [28, 1.5, 0], [28, -2.3, PI], [32, 1.5, 0], [32, -2.3, PI]]) P('workstation', x, 0, z, { ry, variant: 'dual' });
    P('shelf_unit', 45.35, 0, -2.0, { ry: -PI / 2, w: 1.2 }); P('shelf_unit', 45.35, 0, -0.78, { ry: -PI / 2, w: 1.2 }); P('filing_cabinet', 45.3, 0, 1.0, { ry: -PI / 2 });
    P('sofa', 37.0, 0, 7.95, { ry: PI, variant: 'charcoal' }); P('coffee_table', 37.0, 0, 6.8, { variant: 'glass' });
    B.light({ x: 30, y: CH, z: 0, intensity: 9, fixture: 'panel', color: [1, 0.97, 0.92] });

    // ---- south band: training room, atrium cafe, support open plan, staff kitchen
    w31(-18, -8.5, -8.5, -8.5, { openings: [{ at: 6, w: 1.0, h: 2.1, leaf: { v: 'wood', open: 95, flip: true } }] });
    w31(-8.5, -ZF, -8.5, -8.5, { openings: [{ at: 6.75, w: 1.6, h: 2.15, leaf: { v: 'double', open: 92 } }] });
    for (let r = 0; r < 4; r++) for (const x of [-15.4, -12.2]) { P('dining_table', x, 0, -11.0 - r * 2.0, { variant: 'white', w: 2.4 }); for (const dx of [-0.7, 0.7]) P('chair', x + dx, 0, -11.6 - r * 2.0, { variant: 'plastic', ry: 0 }); }
    P('whiteboard', -15.0, 1.0, -8.56, { w: 2.4, ry: PI }); P('tv', -10.2, 1.4, -8.56, { wall: true, on: true, ry: PI });
    P('dining_table', -9.4, 0, -10.6, { variant: 'white', w: 1.6, ry: PI / 2 }); P('dining_table', -9.4, 0.75, -10.6, { variant: 'white', w: 1.6, ry: PI / 2, collide: false });
    B.hide(-9.3, 0, -9.3, { kind: 'crates', r: 0.5 });
    sign(B, 'training', -12, 2.45, -8.43, 0.6, 0.15, 0);
    // atrium (double height): cafe bar against the core, lounge seating, planters, the feature stair
    B.stairs({ x: 0, z: -11.85, w: 1.8, len: 6.7, y0: 0, y1: L2, dir: '+z', mat: 'tw_fascia', tread: 'tw_oak', rail: true, railMat: 'tw_alu' });
    P('bar_counter', -5.4, 0, -6.75, { len: 4.0, ry: PI }); P('back_bar', -5.4, 0, -5.24, { len: 4.0, ry: PI });
    for (const x of [-6.8, -5.4, -4.0]) P('bar_stool', x, 0, -7.65, {});
    for (const z of [-10.0, -14.4]) { P('sofa', -6.0, 0, z, { ry: PI / 2, variant: 'teal', seats: 3 }); P('coffee_table', -4.7, 0, z, { variant: 'wood', ry: PI / 2 }); P('armchair', -3.3, 0, z, { ry: -PI / 2, variant: 'mustard' }); P('rug', -4.7, 0, z, { variant: 'blue', w: 2.4, d: 3.0 }); }
    for (const [x, z] of [[4.6, -10.2], [4.6, -15.0]]) P('dining_table', x, 0, z, { variant: 'oak', w: 1.2, chairs: 4 });
    for (const [x, z] of [[-7.6, -18.6], [7.6, -18.6], [-2.2, -18.6], [2.2, -18.6]]) P('planter', x, 0, z, { len: 1.4 });
    B.hide(-2.2, 0, -17.6, { kind: 'bush', r: 0.6 });
    B.light({ type: 'spot', x: 0, y: L2 + CH - 0.15, z: -12.8, dir: [0, -1, 0], angle: 1.5, intensity: 40, color: [1, 0.9, 0.75], fixture: 'can' });
    for (const x of [-4.5, 0, 4.5]) P('light_fixture', x, L2 + CH, -14.6, { variant: 'pendant', drop: 1.6, warm: true });
    for (const x of [-6, -3, 3, 6]) troffer(B, x, CH, -6.8, true, true);
    // support open plan (under the executive suite)
    for (const x of [11.0, 15.8, 19.4, 25.4, 29.0]) for (const z of [-11.0, -16.0]) { P('workstation', x, 0, z, { ry: 0, variant: 'single' }); P('workstation', x, 0, z - 1.6, { ry: PI, variant: 'single' }); }
    B.light({ x: 19, y: CH, z: -13.6, intensity: 8, fixture: 'panel', color: [0.98, 0.97, 0.93] });
    w31(30, -8, XW, -8, { openings: [{ at: 8, w: 1.2, h: 2.15, leaf: { v: 'wood', open: 95, flip: true } }] });
    w31(30, -ZF, 30, -8.06, { openings: [{ at: 7.75, w: 1.0, h: 2.1, leaf: { v: 'wood', open: 95 } }] });
    P('kitchen_counter', 41.7, 0, -8.42, { len: 5.4, variant: 'white', sink: 2, hob: -1, ry: PI }); P('fridge', 44.95, 0, -8.45, { variant: 'steel', ry: PI });
    P('vending_machine', 45.05, 0, -12.5, { ry: -PI / 2, variant: 'drinks' }); P('vending_machine', 45.05, 0, -11.5, { ry: -PI / 2, variant: 'snacks' });
    for (const [x, z] of [[34, -12], [34, -16], [38, -12], [38, -16]]) P('dining_table', x, 0, z, { variant: 'white', w: 1.6, chairs: 4 });
    sign(B, 'break', 38, 2.45, -7.93, 0.6, 0.15, 0);
    for (const [x, z] of [[34, -14], [40, -14], [43, -10.5]]) troffer(B, x, CH, z, true, true);

    // ================================================================== level 32
    const w32 = (x0, z0, x1, z1, o = {}) => wallS(B, x0, z0, x1, z1, Object.assign({ y: L2 }, o));
    // ---- catering pantry above the freight hall (closed freight doors)
    w32(-42.6, 6, -36, 6, { t: 0.2, openings: [{ at: 5.8, w: 1.2, h: 2.15, leaf: { v: 'white', open: 95 } }] });
    w32(-42.6, -6, -36, -6, { t: 0.2, openings: [{ at: 5.8, w: 1.2, h: 2.15, leaf: { v: 'white', open: 95, flip: true } }] });
    w32(-35.9, -6.1, -35.9, 6.1, { t: 0.2 });
    P('kitchen_counter', -40.3, L2, 5.55, { len: 4.2, variant: 'grey', ry: PI, sink: 1, hob: 3 }); P('fridge', -41.9, L2, -5.45, { variant: 'steel' });
    P('dining_table', -39.0, L2, -1.0, { variant: 'white', w: 2.4, ry: PI / 2 }); P('crate_plastic', -38.8, L2 + 0.75, -1.4, { variant: 'grey', n: 2 });
    P('shelf_unit', -36.3, L2, -2.5, { ry: -PI / 2, w: 1.2 });
    for (const z of [-3, 3]) troffer(B, -39.2, L2 + CH, z);
    // ---- service lobby L32, library (NW), executive dining (SW)
    w32(-35.8, 6, -18, 6, { mat: 'tw_wall_warm', mat2: 'tw_wall', openings: [{ at: 5.8, w: 2.4, h: 2.4 }, { at: 13.3, w: 1.6, h: 2.15 }] });
    w32(-35.8, -6, -18, -6, { mat: 'tw_wall', mat2: 'tw_wall_warm', openings: [{ at: 5.8, w: 2.4, h: 2.4 }, { at: 13.3, w: 1.6, h: 2.15 }] });
    w32(-18, 5, -18, ZF, { mat: 'tw_wall_warm', mat2: 'tw_wall', openings: [{ at: 4.5, w: 1.8, h: 2.3 }, { at: 11, w: 1.6, h: 2.3 }] });
    w32(-18, -ZF, -18, -5, { mat: 'tw_wall_warm', mat2: 'tw_wall', openings: [{ at: 4.75, w: 1.6, h: 2.3 }, { at: 12.25, w: 2.0, h: 2.3 }] });
    P('sofa', -27, L2, 2.0, { variant: 'leather', ry: PI }); P('sofa', -27, L2, -2.0, { variant: 'leather' }); P('coffee_table', -27, L2, 0, { variant: 'glass' });
    P('planter', -34.6, L2, 0, { len: 1.2 }); sign(B, 'art1', -35.79, L2 + 1.6, 3.2, 1.2, 0.9, PI / 2);
    for (const [x, z] of [[-32, 0], [-22, 0]]) troffer(B, x, L2 + CH, z, true, true);
    // library
    for (let i = 0; i < 6; i++) P('bookshelf', -45.44, L2, 8.2 + i * 1.8, { ry: PI / 2, w: 1.8, variant: 'walnut' });
    for (let i = 0; i < 3; i++) P('bookshelf', -36 + i * 1.8, L2, 6.22, { ry: 0, w: 1.8, variant: 'walnut' });
    for (const [x, z] of [[-38, 11], [-38, 16], [-29, 13]]) { P('armchair', x - 1.1, L2, z, { variant: 'leather', ry: PI / 2 }); P('armchair', x + 1.1, L2, z, { variant: 'leather', ry: -PI / 2 }); P('coffee_table', x, L2, z, { variant: 'wood', ry: PI / 2 }); P('rug', x, L2, z, { variant: 'red', w: 3.2, d: 2.4 }); }
    P('dining_table', -23, L2, 15, { variant: 'dark', w: 2.4, chairs: 6 }); P('dining_table', -23, L2, 9.6, { variant: 'dark', w: 2.4, chairs: 4 });
    sign(B, 'library', -18.07, L2 + 2.5, 9.5, 0.6, 0.15, -PI / 2);
    B.hide(-44.6, L2, 18.7, { kind: 'dark', r: 0.6 });
    B.light({ x: -35, y: L2 + CH, z: 13, intensity: 7, fixture: 'panel', color: [1, 0.86, 0.66] });
    for (const [x, z] of [[-42, 10], [-42, 16], [-24, 12.3], [-30, 8.5]]) troffer(B, x, L2 + CH, z, true, true);
    // executive dining
    for (const [x, z] of [[-37.5, -10.8], [-37.5, -16], [-28.5, -10.8], [-28.5, -16]]) P('dining_table', x, L2, z, { variant: 'dark', w: 2.0, chairs: 6 });
    P('back_bar', -45.37, L2, -12, { len: 4.0, ry: PI / 2 }); P('back_bar', -18.29, L2, -11.5, { len: 3.0, ry: -PI / 2 });
    P('wardrobe', -20.0, L2, -6.4, { variant: 'standard', ry: PI });
    sign(B, 'dining', -18.07, L2 + 2.5, -9.0, 0.6, 0.15, -PI / 2);
    B.hide(-44.4, L2, -17.8, { kind: 'dark', r: 0.6 });
    B.light({ x: -33, y: L2 + CH, z: -13.4, intensity: 7, fixture: 'panel', color: [1, 0.84, 0.62] });
    for (const [x, z] of [[-37.5, -13.4], [-28.5, -13.4]]) P('light_fixture', x, L2 + CH, z, { variant: 'pendant', drop: .9, warm: true });

    // ---- north band L32: finance open plan, meeting rooms, client lounge
    for (const x of [-15, -10, -5, 0, 5]) for (const z of [9.0, 15.6]) {
      for (const dx of [-0.85, 0.85]) { P('workstation', x + dx, L2, z, { ry: 0, variant: 'dual' }); P('workstation', x + dx, L2, z + 1.55, { ry: PI, variant: 'single' }); }
      box(x, L2 + 0.75, z + 0.78, 3.4, 0.36, 0.04, { mat: 'p_fab_grey' });
    }
    B.light({ x: -7, y: L2 + CH, z: 12.6, intensity: 8, fixture: 'panel', color: [0.98, 0.97, 0.93] });
    glassWall(B, 10, 10.5, 28, 10.5, { y: L2, h: CH, doors: [{ at: 3, w: 1.0, open: 90, flip: true }, { at: 9, w: 1.0, open: 90, flip: true }, { at: 15, w: 1.0, open: 90, flip: true }] });
    glassWall(B, 10, 10.5, 10, ZF - 0.5, { y: L2, h: CH, doors: [{ at: 4.5, w: 1.0, open: 90 }] });
    glassWall(B, 28, 10.5, 28, ZF - 0.5, { y: L2, h: CH, doors: [{ at: 4.5, w: 1.0, open: -90 }] });
    for (const x of [16, 22]) w32(x, 10.56, x, 19.25, { openings: [{ at: 6.44, w: 1.0, h: 2.1, leaf: { v: 'wood', open: 90 } }] });
    for (const x of [13, 19, 25]) P('dining_table', x, L2, 15.3, { variant: 'oak', w: 2.8, ry: PI / 2, chairs: 6 });
    P('tv', 15.93, L2 + 1.0, 14.2, { wall: true, on: false, ry: -PI / 2 }); P('tv', 21.93, L2 + 1.0, 14.2, { wall: true, on: true, ry: -PI / 2 }); P('tv', 22.07, L2 + 1.0, 14.2, { wall: true, on: false, ry: PI / 2 });
    P('whiteboard', 16.07, L2 + 1.0, 13.5, { ry: PI / 2, w: 1.6 });
    B.light({ x: 19, y: L2 + CH, z: 15, intensity: 6, fixture: 'panel', color: [1, 0.97, 0.92] });
    for (const x of [13, 25]) troffer(B, x, L2 + CH, 15);
    P('sofa', 31, L2, 18.2, { ry: PI, variant: 'grey' }); P('armchair', 29.2, L2, 16.6, { ry: PI / 2, variant: 'blue' }); P('coffee_table', 31, L2, 16.9, { variant: 'glass' });
    P('planter', 33.2, L2, 9.4, { len: 1.0 });
    // ---- team 2 lobby: security desk lobby, executive lifts (NE corner)
    w32(34, 8.5, 34, ZF, { mat: 'tw_wall_warm', mat2: 'tw_veneer', openings: [{ at: 5.5, w: 2.6, h: 2.6, frame: false }] });
    w32(34.06, 8.5, XW, 8.5, { mat: 'tw_veneer', mat2: 'tw_wall_warm', openings: [{ at: 5.94, w: 2.6, h: 2.6, frame: false }] });
    B.lobby(2, { x0: 34.1, z0: 8.6, x1: 45.5, z1: 19.3, y: L2 }, [{ x: 34, z: 14, w: 2.6, h: 2.6, ry: PI / 2 }, { x: 40, z: 8.5, w: 2.6, h: 2.6 }]);
    for (const [x, z] of [[35.3, 10.0], [37.1, 10.0], [38.9, 10.0], [42.6, 10.0], [44.4, 10.0], [35.3, 12.2], [37.1, 12.2], [38.9, 12.2], [42.6, 12.2], [44.4, 12.2],
      [35.3, 14.4], [37.1, 14.4], [38.9, 14.4], [42.6, 14.4]]) B.spawn(2, x, L2, z, x < 40 ? -PI / 2 : PI);
    for (const z of [11.6, 15.6]) {
      box(45.58, L2, z, 0.04, 2.5, 1.4, { mat: 'p_stainless', collide: false });
      box(45.56, L2, z - 0.28, 0.02, 2.35, 0.55, { mat: 'p_chrome', collide: false }); box(45.56, L2, z + 0.28, 0.02, 2.35, 0.55, { mat: 'p_chrome', collide: false });
      sign(B, 'hallLantern2', 45.55, L2 + 2.65, z, 0.4, 0.1, -PI / 2, true);
    }
    box(43.0, L2, 17.4, 3.6, 1.05, 0.8, { mat: 'tw_veneer', mats: { t: 'marble' } });
    box(43.0, L2 + 1.05, 17.15, 3.7, 0.04, 0.5, { mat: 'marble', collide: false });
    for (const x of [42.2, 43.8]) P('monitor', x, L2 + 0.75, 17.85, { ry: PI, keyboard: false });
    P('office_chair', 43.0, L2, 18.2, { ry: PI, variant: 'leather' });
    box(43.0, L2, 18.68, 4.0, 2.6, 0.1, { mat: 'tw_veneer' });
    sign(B, 'logo', 43.0, L2 + 1.85, 18.62, 3.0, 0.75, PI);
    sign(B, 'security', 43.0, L2 + 0.55, 16.99, 1.0, 0.25, PI);
    P('planter', 35.0, L2, 18.6, { len: 1.0 }); P('sofa', 37.6, L2, 18.4, { ry: PI, variant: 'leather', seats: 2 });
    B.light({ x: 39.5, y: L2 + CH, z: 14, intensity: 8, fixture: 'panel', color: [1, 0.92, 0.8] });
    for (const [x, z] of [[36, 11], [36, 17], [44, 13]]) troffer(B, x, L2 + CH, z, true, true);

    // ---- east zone L32: executive reception / waiting (around stair B)
    P('sofa', 26.5, L2, 6.8, { ry: PI, variant: 'leather' }); P('sofa', 26.5, L2, 3.6, { variant: 'leather' }); P('coffee_table', 26.5, L2, 5.2, { variant: 'glass' });
    P('planter', 21.0, L2, 7.6, { len: 1.2 }); P('planter', 33.0, L2, -6.8, { len: 1.2 });
    P('desk', 30.0, L2, -2.5, { variant: 'exec', w: 2.2, ry: PI }); P('office_chair', 30.0, L2, -3.3, { ry: 0, variant: 'leather' });
    box(37.0, L2 + 0.2, -7.9, 3.0, 2.6, 0.04, { mat: 'tw_veneer', collide: false }); sign(B, 'tower', 37.0, L2 + 1.8, -7.875, 2.4, 0.38, 0);
    sign(B, 'art2', 45.58, L2 + 1.7, 0, 1.2, 1.6, -PI / 2);
    B.light({ x: 31, y: L2 + CH, z: 1, intensity: 8, fixture: 'panel', color: [1, 0.9, 0.78] });
    // ---- south band L32: coffee point (west of the void), walkways and balustrades
    P('kitchen_counter', -10.2, L2, -5.33, { len: 2.8, variant: 'wood', ry: PI, sink: 0, hob: -1, upper: false });
    for (const [x, z] of [[-15.5, -10.0], [-15.5, -15.5], [-11.0, -15.5], [-11.0, -10.4]]) P('dining_table', x, L2, z, { variant: 'white', w: 1.2, chairs: 4 });
    for (const [x, z, d] of [[-3.7, -8.5, 'x'], [3.7, -8.5, 'x'], [-6.5, -12.75, 'z'], [6.5, -12.75, 'z'], [0, -17, 'x']]) {
      const L = d === 'x' ? (x === 0 ? 13 : 5.6) : 8.5;
      if (d === 'x') { glassWall(B, x - L / 2, z, x + L / 2, z, { y: L2, h: 1.1, post: 1.6, frost: false }); B.box(x, L2 + 1.1, z, L, 1.2, 0.06, { visible: false, ray: false, surf: 'glass' }); }
      else { glassWall(B, x, z - L / 2, x, z + L / 2, { y: L2, h: 1.1, post: 1.6, frost: false }); B.box(x, L2 + 1.1, z, 0.06, 1.2, L, { visible: false, ray: false, surf: 'glass' }); }
    }
    B.light({ x: -13, y: L2 + CH, z: -12.6, intensity: 6, fixture: 'panel', color: [1, 0.9, 0.78] });
    // ---- executive suite = SITE B
    glassWall(B, 8.5, -ZF + 0.5, 8.5, -8.06, { y: L2, h: CH, doors: [{ at: 6.75, w: 1.8, open: 85 }] });
    w32(8.5, -8, 30, -8, { mat: 'tw_veneer', mat2: 'tw_wall_warm', t: 0.16, openings: [{ at: 5.5, w: 1.8, h: 2.2, leaf: { v: 'double', open: 92, flip: true } }] });
    w32(30, -ZF, 30, -8.08, { mat: 'tw_wall_warm', mat2: 'tw_veneer', openings: [{ at: 8.75, w: 1.0, h: 2.1, leaf: { v: 'wood', open: 95 } }] });
    glassWall(B, 8.56, -14, 18, -14, { y: L2, h: CH, doors: [{ at: 4.44, w: 1.0, open: 90 }] });
    glassWall(B, 18, -ZF + 0.5, 18, -14.06, { y: L2, h: CH, doors: [{ at: 2.75, w: 1.0, open: -90 }] });
    P('dining_table', 13.2, L2, -16.9, { variant: 'dark', w: 4.4, chairs: 0 });
    for (const dx of [-1.6, -0.55, 0.55, 1.6]) for (const s of [-1, 1]) P('office_chair', 13.2 + dx, L2, -16.9 + s * 0.85, { ry: s > 0 ? PI : 0, variant: 'leather' });
    P('tv', 9.4, L2, -16.9, { variant: 'big', on: true, ry: PI / 2 });
    sign(B, 'board', 13.0, L2 + 2.45, -13.96, 0.5, 0.12, 0);
    P('desk', 13.0, L2, -10.2, { variant: 'exec', w: 2.4, ry: PI }); P('office_chair', 13.0, L2, -11.0, { variant: 'leather', ry: 0 });
    P('monitor', 12.6, L2 + 0.75, -10.3, { ry: PI });
    for (const x of [20.2, 24.2]) P('sofa', x, L2, -8.6, { variant: 'grey', ry: PI, seats: 3 });
    P('coffee_table', 22.2, L2, -10.1, { variant: 'glass' });
    for (const x of [21, 25.6]) { P('sofa', x, L2, -17.6, { variant: 'leather', seats: 2 }); P('coffee_table', x, L2, -16.4, { variant: 'wood' }); }
    P('armchair', 28.6, L2, -14.6, { variant: 'leather', ry: -PI / 2 }); P('bookshelf', 29.78, L2, -17.4, { ry: -PI / 2, w: 1.8 });
    P('planter', 9.6, L2, -9.0, { len: 1.0 }); P('planter', 28.8, L2, -9.2, { len: 1.0 });
    sign(B, 'art1', 21.0, L2 + 1.75, -8.09, 1.6, 1.2, PI); sign(B, 'exec', 14.0, L2 + 2.5, -7.91, 1.0, 0.2, 0);
    B.hide(11.6, L2, -9.4, { kind: 'dark', r: 0.5 });
    B.site('B', { x0: 9.4, z0: -18.8, x1: 29, z1: -8.8, y: L2 });
    B.light({ x: 14, y: L2 + CH, z: -11, intensity: 7, fixture: 'panel', color: [1, 0.9, 0.78] });
    B.light({ x: 24, y: L2 + CH, z: -13, intensity: 7, fixture: 'panel', color: [1, 0.9, 0.78] });
    for (const [x, z] of [[11, -16.9], [15.4, -16.9]]) troffer(B, x, L2 + CH, z);
    for (const [x, z] of [[20, -11], [20, -16], [27, -11], [27, -16]]) P('light_fixture', x, L2 + CH, z, { variant: 'pendant', drop: .5, warm: true });
    // ---- CEO office (south-east corner)
    w32(30, -8, XW, -8, { mat: 'tw_veneer', mat2: 'tw_wall_warm', t: 0.16, openings: [{ at: 12, w: 1.0, h: 2.1, leaf: { v: 'wood', open: 95, flip: true } }] });
    P('desk', 38.5, L2, -15.2, { variant: 'exec', w: 2.6, ry: PI }); P('office_chair', 38.5, L2, -16.0, { variant: 'leather', ry: 0 });
    P('monitor', 38.2, L2 + 0.75, -15.3, { ry: PI });
    P('sofa', 34.2, L2, -11.0, { variant: 'leather', ry: PI / 2 }); P('armchair', 36.6, L2, -9.4, { variant: 'tan', ry: PI }); P('coffee_table', 35.6, L2, -11.0, { variant: 'wood', ry: PI / 2 });
    P('rug', 35.6, L2, -11.0, { variant: 'blue', w: 3, d: 3.6 });
    P('wardrobe', 45.1, L2, -10.0, { variant: 'large', ry: -PI / 2 });
    P('bookshelf', 45.44, L2, -14.0, { ry: -PI / 2, w: 1.8, variant: 'walnut' }); P('bookshelf', 45.44, L2, -15.8, { ry: -PI / 2, w: 1.8, variant: 'walnut' });
    sign(B, 'ceo', 42, L2 + 2.45, -7.91, 0.6, 0.12, 0);
    B.hide(45.1, L2, -10.0, { kind: 'closet', r: 0.5 });
    B.light({ x: 38, y: L2 + CH, z: -13.5, intensity: 6, fixture: 'panel', color: [1, 0.88, 0.7] });
    for (const [x, z] of [[34, -11], [42, -11], [42, -17]]) troffer(B, x, L2 + CH, z, true, true);

    // ================================================================== ceiling troffers (emissive, merged) on a 3.6 m grid
    const lit = (x, z, f) => {   // f = floor index; skip rooms with their own fittings
      if (Math.abs(z) < 5.6 && Math.abs(x) < 18.6) return false;            // core
      if (x < -35.8 && Math.abs(z) < 6.2) return false;                    // freight hall / pantry
      if (x < -18 && f === 0) return false;                                // back of house: strip lights placed by hand
      if (x < -18 && f === 1 && Math.abs(z) > 6) return false;             // library / dining: hand-placed
      if (Math.abs(x) < 8.6 && z < -4.8) return false;                     // atrium
      if (f === 0 && x > 17.9 && x < 34.1 && z > 8.4) return false;        // server room
      if (f === 0 && x > 9.9 && x < 18.1 && z > 8.4) return false;         // NOC
      if (f === 0 && x > 33.9 && z > 8.4) return false;                    // workshop
      if (f === 0 && x > 29.9 && z < -7.9) return false;                   // kitchen
      if (f === 1 && x > 9.9 && x < 28.1 && z > 10.4) return false;        // meeting rooms
      if (f === 1 && x > 33.9 && z > 8.4) return false;                    // T2 lobby
      if (f === 1 && x > 8.4 && z < -7.9) return false;                    // exec suite + CEO
      return true;
    };
    const lightOn = (x, z, f) => !((f === 0 && x > -18 && x < 8 && z > 5 && (Math.round(x / 3.6) % 3 === 0)) || (f === 1 && x < -16));
    for (let f = 0; f < 2; f++) for (let x = -43.2; x <= 43.3; x += 3.6) for (let z = -18.0; z <= 18.1; z += 3.6) {
      if (!lit(x, z, f)) continue;
      if (COLX.some(cx => Math.abs(cx - x) < 0.8) && Math.abs(Math.abs(z) - 12) < 0.8) continue;
      troffer(B, x, Y[f] + CH, z, lightOn(x, z, f));
    }

    // ================================================================== the city outside
    skyline(B, { street: -128, seed: 777, keep: [-80, -60, 80, 60], hand: [
      { x: 0, z: 118, w: 54, d: 34, top: 64, k: 2, lamp: true, plant: true },        // glass tower across the street (north)
      { x: -88, z: -112, w: 40, d: 40, top: -22, k: 1, plant: true },                // lower stone block south-west (roof below us)
      { x: 70, z: -96, w: 36, d: 30, top: 18, k: 0, lamp: true },                    // office block south-east
      { x: -122, z: 64, w: 30, d: 46, top: 96, k: 2, lamp: true },                   // tall tower north-west
      { x: 132, z: 30, w: 42, d: 28, top: -8, k: 0, plant: true },                   // east neighbour, roof just below
      { x: 18, z: -150, w: 50, d: 30, top: 40, k: 0, lamp: true },
    ] });

    // ================================================================== markers: objectives, hides, spawns
    B.hostage(10.0, L2, -15.2); B.hostage(16.8, 0, 18.0); B.hostage(41.6, L2, -13.2); B.hostage(36.0, 0, -14.0); B.hostage(19.0, L2, 12.0);
    B.rescue({ x0: -34.8, z0: -4.8, x1: -28.5, z1: 4.8, y: 0 });
    B.buyzone(1, { x0: -45.4, z0: -5.9, x1: -36, z1: 5.9, y: 0 });
    B.buyzone(2, { x0: 34.1, z0: 8.6, x1: 45.5, z1: 19.3, y: L2 });
    B.point('dom1', -9.6, 0, 6.6, 3); B.point('dom2', 0, 0, -6.8, 3.5); B.point('dom3', 27.0, L2, 0.5, 3);
    B.point('hp1', 0, 0, 0, 3); B.point('hp2', -7, L2, 12.6, 4); B.point('hp3', 26, 0, -0.4, 4); B.point('hp4', -27, L2, -13.4, 4); B.point('hp5', -13.8, 0, -9.8, 3);
    B.point('hill', 0, L2, 0, 3);
    B.point('flag1', -28.5, 0, 0, 1.5); B.point('flag2', 31.5, L2, 4.5, 1.5);
    B.point('extract1', 40.5, 0, 1.0, 3); B.point('extract2', -40.5, L2, 13.6, 3); B.point('extract3', -36.0, 0, -12.0, 3);
    B.point('hq1', 0, 0, 2.0, 3); B.point('hq2', -27, L2, 12.5, 3);
    // field (respawn) spawns: team 1 the west half, team 2 the east half (both floors)
    for (const [x, y, z, yaw] of [[-37.5, 0, 12.5, PI / 2], [-33, 0, 17, PI / 2], [-27, 0, -13.5, PI / 2], [-41, 0, -13.5, PI / 2], [-24, 0, 0, PI / 2], [-12.6, 0, 18.6, PI / 2],
      [-13.6, 0, -18.2, 0], [-40, L2, 14, PI / 2], [-27, L2, -13.8, PI / 2], [-31.5, L2, 0, PI / 2], [-12.5, L2, 18.5, PI / 2], [-13, L2, -8.0, PI / 2]])
      B.spawn(1, x, y, z, yaw, { field: true });
    for (const [x, y, z, yaw] of [[42, 0, 13.5, -PI / 2], [40, 0, -1.0, -PI / 2], [37, 0, -14.0, -PI / 2], [21.7, 0, -18.6, -PI / 2], [36, 0, 5.4, -PI / 2],
      [24, L2, 1.0, -PI / 2], [31.5, L2, 13.8, -PI / 2], [41.5, L2, -12.4, -PI / 2], [20.8, L2, 18.2, PI], [40, L2, -3.0, -PI / 2], [26, L2, -15.2, -PI / 2]])
      B.spawn(2, x, y, z, yaw, { field: true });
    for (const [x, y, z] of [[-40.5, 0, 9.0], [-30.0, 0, -18.4], [-22.0, 0, 2.0], [-9.0, 0, 18.4], [1.8, 0, 7.0], [6.0, 0, -18.0], [25.5, 0, 6.6], [40.5, 0, -5.0],
      [42.0, 0, 18.4], [28.0, 0, -14.4], [-41.0, L2, 18.0], [-40.0, L2, -18.4], [-22.0, L2, -2.6], [-10.0, L2, 7.0], [7.5, L2, -6.2], [24.0, L2, -6.6],
      [36.0, L2, 2.0], [31.0, L2, 11.0], [5.0, L2, 18.4], [-7.4, L2, -18.4]])
      B.spawn(0, x, y, z, Math.atan2(-x, -z));
    flushSigns(B);
  },
};
