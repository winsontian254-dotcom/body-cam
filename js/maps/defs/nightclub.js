/* LIVE FIRE — "nightclub" = Velvet Underground: a basement nightclub under a four-storey brick block and the service alley behind
   it, at night. Original layout, fictional names (VELVET, Hollis Lane, Brightwater Ales, Hollis St. Logistics).
   Levels: alley / ground floor G at y 0, basement U at y -3.6 (ceiling -0.35; 3.6 m is deliberately over the navgrid's 3.5 m drop limit), ground-floor ceiling 3.2.
   Plan (x east, z north): building x -30..30, z -18..22; alley z -30..-18; lane x -3..3 z -54..-30; T1 lobby = Hollis St.
   Logistics loading bay x -8..8 z -66..-54. U: kitchen (W), beer cellar = site B, restrooms, fire stair + plant room (E),
   back corridor C1 (z -3..1), cocktail bar (NW), dance hall = site A (NE, double height, DJ stage, VIP booths).
   G: kitchen service landing, stage-door corridor, foyer with the main stair down, balcony + mezzanine over the dance hall,
   staff room, manager office = T2 lobby. Design notes: tools/test/out/notes-map-nightclub.md. Exports: default MapDef */
import { decal, paint, slab, rail, strip, keg, speaker, truss, finish, rng, guardNavDrops, castOnly } from '../kit_nightclub.js';

const U = -3.6, CU = -0.35, CG = 3.2, PI = Math.PI;
const UW = CU + 0.25 - U;     // basement interior wall height: from the floor up into the slab (top at -0.1)
const GW = CG + 0.1;          // ground-floor interior wall height (top inside the roof slab)

export default {
  id: 'nightclub', name: 'Velvet Underground', size: 'S',
  desc: 'Basement nightclub and the service alley behind it at night: dance hall, cocktail bar, beer cellar, kitchen, foyer and balcony.',
  env: { hdri: 'night_city', sky: 'night', time: 'night', exposure: 1.4, sun: { dir: [.3, -.8, .5], color: [.6, .68, .95], intensity: .5 },
    ambient: [.34, .32, .4], fog: { color: [.03, .028, .035], density: .006 }, weather: 'clear', indoorIbl: .5,
    ambience: 'club', reverb: 'room' },
  bounds: { minX: -42, maxX: 42, minZ: -68, maxZ: 23, minY: -5, maxY: 16 },
  chunk: 64,

  build(B) {
    guardNavDrops(B);
    // the moon (from the south-west) only matters in the alley: the club, the bay interior and far scenery cast no shadows
    // (roof, upper floors, the rear and west walls still cast: they keep the moonlight out of the building)
    castOnly(B, (x, y, z) => z > -72 && z < 25 && Math.abs(x) < 46 && (y > 3.3 || x < -29.6 || (z < -17.8 && !(x > -8.4 && x < 8.4 && z < -53.6 && y < 5.3))));
    const R = rng(4242);
    let seedK = 0;
    const P = (type, x, y, z, o = {}) => B.prop(type, x, y, z, Object.assign({ seed: 1 + (seedK++ % 3) }, o));
    const box = (x, y, z, w, h, d, o) => B.box(x, y, z, w, h, d, o);
    const boxc = (x0, y0, z0, x1, y1, z1, o) => B.boxc(x0, y0, z0, x1, y1, z1, o);
    const W = (x0, z0, x1, z1, o) => B.wall(x0, z0, x1, z1, o);
    const nc = { collide: false, cast: false };

    // ================================================================== ground: alley, lane, loading bay
    // alley z -30..-18 (cobbles in the middle, a concrete apron along the club wall), lane + bay
    box(0, -0.3, -24, 84, 0.3, 12, { mat: 'nc_asphalt' });
    box(0, -0.3, -42, 6, 0.3, 24, { mat: 'nc_asphalt' });
    box(0, -0.3, -60, 16, 0.3, 12, { mat: 'concrete_floor' });
    boxc(-42, 0, -19.2, 42, 0.012, -18.15, { mat: 'nc_kerb', collide: false, cast: false });             // apron strip along the club
    boxc(-42, 0, -30, 42, 0.012, -29.2, { mat: 'nc_kerb', collide: false, cast: false });                // gutter strip on the south side
    paint(B, -2.9, -30, -2.9, -54, { w: .1, col: [.85, .7, .2] }); paint(B, 2.9, -30, 2.9, -54, { w: .1, col: [.85, .7, .2] });
    for (const x of [-34, -18, -2, 14, 30]) P('manhole', x, 0, -24.5);

    // ================================================================== basement structure (U)
    // floors per room (top y U)
    const fl = (x0, z0, x1, z1, mat) => boxc(x0, U - 0.3, z0, x1, U, z1, { mat, cast: false });
    fl(-30, -18, -16, -3, 'nc_quarry');            // kitchen
    fl(-16, -18, 3.4, -3, 'concrete_floor');       // cellar (site B)
    fl(3.4, -18, 16, -3, 'tile_floor');            // restrooms
    fl(16, -18, 30, -3, 'concrete_floor');         // fire lobby + plant
    fl(-30, -3, 30, 1, 'nc_terrazzo');             // back corridor
    fl(-30, 1, -6, 22, 'wood_floor');              // bar
    fl(-6, 1, 30, 22, 'nc_floor_hall');           // dance hall
    // exterior basement walls (outer faces are underground)
    const ext = { y: U, h: -U, t: 0.3 };
    W(-30, -18, -16, -18, { ...ext, mat: 'nc_tile_wall', mat2: 'concrete' });
    W(-16, -18, 3.4, -18, { ...ext, mat: 'concrete', mat2: 'concrete' });
    W(3.4, -18, 16, -18, { ...ext, mat: 'nc_tile_wall', mat2: 'concrete' });
    W(16, -18, 30, -18, { ...ext, mat: 'concrete', mat2: 'concrete' });
    W(-30, 22, -6, 22, { ...ext, mat: 'concrete', mat2: 'nc_brick_paint' });
    W(-6, 22, 30, 22, { ...ext, h: -U + CG + 0.3, mat: 'concrete', mat2: 'nc_midnight' });
    W(-30, -17.85, -30, -3, { ...ext, mat: 'concrete', mat2: 'nc_tile_wall' });
    W(-30, -3, -30, 1, { ...ext, mat: 'concrete', mat2: 'nc_plum' });
    W(-30, 1, -30, 21.85, { ...ext, mat: 'concrete', mat2: 'nc_brick_paint' });
    W(30, 21.85, 30, 1, { ...ext, h: -U + CG + 0.3, mat: 'concrete', mat2: 'nc_midnight' });
    W(30, 1, 30, -3, { ...ext, mat: 'concrete', mat2: 'nc_plum' });
    W(30, -3, 30, -17.85, { ...ext, mat: 'concrete', mat2: 'concrete' });
    // interior walls (U)
    const uw = { y: U, h: UW };
    W(-16, -17.85, -16, -3, { ...uw, mat: 'nc_tile_wall', mat2: 'nc_render', openings: [{ at: 8.85, w: 1.6, h: 2.2, frame: 'nc_stainless' }] });
    W(-30, -3, -16, -3, { ...uw, mat: 'nc_plum', mat2: 'nc_tile_wall', openings: [{ at: 9, w: 1.2, h: 2.15, frame: 'nc_stainless' }] });
    W(-16, -3, 0.6, -3, { ...uw, mat: 'nc_plum', mat2: 'nc_render', openings: [{ at: 4, w: 1.8, h: 2.2, frame: 'steel_dark' }, { at: 12, w: 1.2, h: 2.15, frame: 'steel_dark' }] });
    W(0.6, -3.1, 0.6, -10, { ...uw, mat: 'nc_black', mat2: 'nc_render' });                       // main stair enclosure (west)
    W(0.6, -10, 3.4, -10, { ...uw, mat: 'nc_black', mat2: 'nc_render' });
    W(3.4, -17.85, 3.4, -3.1, { ...uw, mat: 'nc_render', mat2: 'nc_tile_wall' });
    W(3.4, -3, 16, -3, { ...uw, mat: 'nc_plum', mat2: 'nc_tile_wall', openings: [{ at: 2.6, w: 1.2, h: 2.15, frame: 'nc_brass' }, { at: 10.2, w: 1.2, h: 2.15, frame: 'nc_brass' }] });
    W(10, -17.85, 10, -9, { ...uw, mat: 'nc_tile_wall', mat2: 'nc_tile_green' });                // restrooms partition (shared sink lobby north)
    W(16, -17.85, 16, -3.1, { ...uw, mat: 'nc_tile_green', mat2: 'concrete' });
    W(16, -3, 30, -3, { ...uw, mat: 'nc_plum', mat2: 'concrete', openings: [{ at: 6, w: 1.8, h: 2.2, frame: 'nc_door_red' }] });
    W(23, -17.85, 23, -10.5, { ...uw, mat: 'concrete', mat2: 'concrete', openings: [{ at: 4.6, w: 1.1, h: 2.1, frame: 'steel_dark' }] });
    W(16.1, -10.5, 23.1, -10.5, { ...uw, mat: 'concrete', mat2: 'concrete' });
    W(-30, 1, -6, 1, { ...uw, mat: 'nc_brick_paint', mat2: 'nc_plum', openings: [{ at: 6, w: 2.6, h: 2.4, frame: 'nc_brass' }, { at: 19, w: 2.6, h: 2.4, frame: 'nc_brass' }] });
    W(-6, 1, 14, 1, { ...uw, mat: 'nc_midnight', mat2: 'nc_plum', openings: [{ at: 10, w: 2.8, h: 2.4, frame: 'nc_brass' }] });
    W(14, 1, 30, 1, { y: U, h: -U + GW, mat: 'nc_midnight', mat2: 'nc_plum', openings: [{ at: 8, w: 1.8, h: 2.2, frame: 'nc_brass' }] });
    W(-6, 1.1, -6, 4, { ...uw, mat: 'nc_brick_paint', mat2: 'nc_midnight' });                        // bar / hall under the balcony
    // pockets under the two service landings (behind the top of each stair): solid
    boxc(-29.85, U, -17.85, -28.15, 0 - 0.36, -16.4, { mat: 'concrete', cast: false });
    boxc(28.15, U, -17.85, 29.85, 0 - 0.36, -16.4, { mat: 'concrete', cast: false });

    // stairs
    B.stairs({ x: -29.05, z: -13.55, w: 1.6, len: 5.7, y0: U, y1: 0, dir: '-z', mat: 'concrete', tread: 'nc_rubber_mat', rail: 'left', railMat: 'nc_stainless' });    // kitchen service stair (rail on the open, kitchen side)
    B.stairs({ x: 29.05, z: -13.55, w: 1.6, len: 5.7, y0: U, y1: 0, dir: '-z', mat: 'concrete', tread: 'concrete_dark', rail: 'right', railMat: 'paint_yellow' });     // fire stair (rail on the open side)
    B.stairs({ x: 2.0, z: -6.6, w: 2.4, len: 6.0, y0: U, y1: 0, dir: '-z', mat: 'nc_black', tread: 'nc_carpet', rail: true, railMat: 'nc_brass' });                   // main stair (foyer -> corridor)
    B.stairs({ x: -29.15, z: 6.15, w: 1.4, len: 5.7, y0: U, y1: 0, dir: '+z', mat: 'concrete_dark', tread: 'nc_rubber_mat', rail: 'right', railMat: 'steel_dark' });  // staff stair (anteroom -> bar)
    B.stairs({ x: -4.7, z: 17.65, w: 2.0, len: 5.7, y0: U, y1: 0, dir: '+z', mat: 'nc_black', tread: 'nc_wood_stage', rail: true, railMat: 'nc_brass' });           // feature stair (mezzanine -> hall)

    // ================================================================== ground-floor slab (= basement ceiling) and roof
    const holes = [{ x0: -6, z0: 4, x1: 30, z1: 22 }, { x0: 14, z0: 1.1, x1: 30, z1: 4 },
      { x0: -30, z0: -16.4, x1: -28.15, z1: -10.5 }, { x0: 28.15, z0: -16.4, x1: 30, z1: -10.5 },
      { x0: 0.8, z0: -9.6, x1: 3.2, z1: -3 }, { x0: -30, z0: 3.3, x1: -28.4, z1: 9 }];
    slab(B, -30, -18, 30, 22, CU, 0, holes, { mat: 'concrete', mats: { b: 'nc_black' }, cast: false });
    boxc(-6, CU, 20.5, -3.7, 0, 22, { mat: 'concrete', mats: { b: 'nc_black' }, cast: false });       // feature-stair landing
    // ceilings in back-of-house rooms (2 cm under the slab, visual)
    const ceil = (x0, z0, x1, z1, mat) => boxc(x0, CU - 0.02, z0, x1, CU, z1, { ...nc, mat });
    ceil(-28.15, -17.85, -16.1, -3.1, 'ceiling_tile'); ceil(-29.85, -10.5, -28.15, -3.1, 'ceiling_tile');
    ceil(3.5, -17.85, 15.9, -3.1, 'ceiling_tile'); ceil(-15.9, -17.85, 0.5, -3.1, 'concrete'); ceil(0.7, -17.85, 3.3, -10.1, 'concrete');
    ceil(16.1, -10.4, 28.15, -3.1, 'concrete'); ceil(23.1, -17.85, 28.15, -10.4, 'concrete'); ceil(16.1, -17.85, 22.9, -10.6, 'concrete');
    // roof slab over the ground floor and the hall (underside 3.2)
    boxc(-30.15, CG, -18.15, 30.15, CG + 0.35, 22.15, { mat: 'concrete_dark', mats: { b: 'nc_black' }, cast: true });

    // ================================================================== ground floor (G)
    const gw = { y: 0, h: GW };
    // exterior: rear (alley) facade with the kitchen door, stage door and fire exit
    W(-30, -18, 30, -18, { y: 0, h: CG + 0.35, t: 0.3, mat: 'nc_render', mat2: 'nc_brick',
      openings: [{ at: 3, w: 1.1, h: 2.15, frame: 'steel_dark' }, { at: 38, w: 1.2, h: 2.2, frame: 'steel_dark' }, { at: 57, w: 1.2, h: 2.15, frame: 'steel_dark' }] });
    W(-30, 22, 30, 22, { y: 0, h: CG + 0.35, t: 0.3, mat: 'nc_brick', mat2: 'nc_black' });
    W(-30, -17.85, -30, 21.85, { y: 0, h: CG + 0.35, t: 0.3, mat: 'nc_brick', mat2: 'nc_cream' });
    W(30, 21.85, 30, -17.85, { y: 0, h: CG + 0.35, t: 0.3, mat: 'nc_brick', mat2: 'nc_midnight' });
    // kitchen service landing + stairwell
    W(-26, -17.85, -26, -16.4, { ...gw, mat: 'nc_render', mat2: 'nc_render' });
    W(-28.15, -16.4, -25.9, -16.4, { ...gw, mat: 'nc_render', mat2: 'nc_render' });
    W(-28.15, -16.5, -28.15, -10.5, { ...gw, mat: 'nc_render', mat2: 'nc_render' });
    W(-29.85, -10.5, -28.05, -10.5, { ...gw, mat: 'nc_render', mat2: 'nc_render' });
    // fire-exit landing + stairwell
    W(26, -17.85, 26, -16.4, { ...gw, mat: 'concrete', mat2: 'concrete' });
    W(25.9, -16.4, 28.15, -16.4, { ...gw, mat: 'concrete', mat2: 'concrete' });
    W(28.15, -16.5, 28.15, -10.5, { ...gw, mat: 'concrete', mat2: 'concrete' });
    W(28.05, -10.5, 29.85, -10.5, { ...gw, mat: 'concrete', mat2: 'concrete' });
    // stage-door corridor x 6.5..9.5, z -18..-12 and the foyer x -6..14, z -12..1
    W(6.5, -17.85, 6.5, -12, { ...gw, mat: 'nc_render', mat2: 'nc_black' });
    W(9.5, -17.85, 9.5, -12, { ...gw, mat: 'nc_black', mat2: 'nc_render' });
    W(-6, -12, 14, -12, { ...gw, mat: 'nc_plum', mat2: 'nc_render', openings: [{ at: 14, w: 1.4, h: 2.2, frame: 'nc_brass' }] });
    W(-6, -11.9, -6, 1, { ...gw, mat: 'nc_render', mat2: 'nc_plum' });
    W(14, 1, 14, -11.9, { ...gw, mat: 'nc_render', mat2: 'nc_plum' });
    W(14, 1, 30, 1, { ...gw, mat: 'nc_midnight', mat2: 'nc_render' });                // upper part of the hall's south wall (built from U above)
    W(-17, 1, -6, 1, { ...gw, mat: 'nc_midnight', mat2: 'nc_render' });           // mezzanine south wall
    // staff room (anteroom) x -30..-17, z 1..10 and manager office x -30..-17, z 10..22 (T2 lobby)
    W(-30, 1, -17, 1, { ...gw, mat: 'nc_cream', mat2: 'nc_render' });
    W(-17, 1.1, -17, 10, { ...gw, mat: 'nc_cream', mat2: 'nc_midnight', openings: [{ at: 4.2, w: 1.1, h: 2.15, frame: 'wood_dark' }] });
    W(-29.85, 10, -17, 10, { ...gw, mat: 'nc_cream', mat2: 'nc_cream', openings: [{ at: 7.85, w: 2.0, h: 2.6, frame: false }] });
    W(-17, 10.1, -17, 21.85, { ...gw, mat: 'nc_cream', mat2: 'nc_midnight', openings: [{ at: 5.9, w: 2.0, h: 2.6, frame: false }, { at: 9.8, w: 1.6, h: 1.0, y: 1.0, glass: true, frame: 'wood_dark' }] });
    // G finishes (1 cm, visual)
    const gf = (x0, z0, x1, z1, mat) => boxc(x0, 0, z0, x1, 0.01, z1, { ...nc, mat });
    gf(-29.85, -17.85, -26, -16.4, 'concrete_floor'); gf(28.15, -17.85, 26, -16.4, 'concrete_floor');
    gf(6.6, -17.85, 9.4, -12, 'nc_rubber_mat');
    gf(-5.9, -11.9, 0.7, 1, 'nc_terrazzo'); gf(3.3, -11.9, 13.9, 1, 'nc_terrazzo'); gf(0.7, -11.9, 3.3, -9.6, 'nc_terrazzo');
    gf(-5.9, 1, 14, 4, 'nc_carpet'); gf(-16.9, 1, -6, 20.5, 'nc_carpet'); gf(-16.9, 20.5, -3.7, 21.85, 'nc_carpet');
    gf(-28.4, 1.1, -17.1, 9.9, 'tile_floor'); gf(-29.85, 1.1, -28.4, 3.3, 'tile_floor'); gf(-29.85, 9, -28.4, 9.9, 'tile_floor');
    gf(-29.85, 10.1, -17.1, 21.85, 'nc_carpet_office');
    // railings: main stair hole, balcony, mezzanine edge, staff stair void, service stairwells
    rail(B, 0.7, -9.6, 0.7, -3, 0, { mat: 'nc_brass', glass: true }); rail(B, 3.3, -9.6, 3.3, -3, 0, { mat: 'nc_brass', glass: true });
    rail(B, 0.7, -3, 3.3, -3, 0, { mat: 'nc_brass', glass: true });
    rail(B, -6, 4, 10.6, 4, 0, { mat: 'nc_brass', glass: true }); rail(B, 11.8, 4, 14, 4, 0, { mat: 'nc_brass', glass: true });
    rail(B, 14, 1.1, 14, 4, 0, { mat: 'nc_brass', glass: true });
    rail(B, -6, 4, -6, 20.5, 0, { mat: 'nc_brass', glass: true }); rail(B, -3.7, 20.5, -3.7, 21.85, 0, { mat: 'nc_brass' });
    W(-28.3, 3.2, -28.3, 8.2, { ...gw, mat: 'nc_cream', mat2: 'concrete_dark' }); W(-29.85, 3.2, -28.2, 3.2, { ...gw, mat: 'nc_cream', mat2: 'concrete_dark' });   // staff stairwell
    // the gap at x 10.6..11.8 in the balcony rail is a VIP rope: you can drop 3.4 m to the dance floor
    for (const x of [10.6, 11.8]) { B.cyl(x, 0, 4, .03, .95, { mat: 'nc_brass', sides: 8, collide: false }); B.cyl(x, .93, 4, .05, .06, { mat: 'nc_brass', sides: 8, collide: false }); }
    box(11.2, .78, 4, 1.15, .035, .035, { mat: 'nc_velvet', collide: false, cast: false });

    // ================================================================== upper storeys (visual) + alley facades
    // club block above the ground floor: brick to a parapet at 13 m, windows with sills and lit / dark glass
    boxc(-30.2, CG + 0.35, -18.2, 30.2, 12.6, 22.2, { mat: 'nc_brick', mats: { t: 'concrete_dark' }, cast: false });
    boxc(-30.4, 12.6, -18.4, 30.4, 13.1, 22.4, { mat: 'concrete', cast: false });
    for (let f = 0; f < 3; f++) for (let i = 0; i < 12; i++) {
      const x = -27 + i * 4.9, y = 4.4 + f * 2.8, lit = R() < 0.18;
      box(x, y - 0.12, -18.32, 1.5, 0.12, 0.25, { ...nc, mat: 'concrete' });
      box(x, y, -18.22, 1.3, 1.7, 0.06, { ...nc, mat: lit ? 'nc_window_warm' : 'p_glass_dark' });
      box(x, y + 1.7, -18.26, 1.5, 0.18, 0.14, { ...nc, mat: 'nc_brick_dark' });
    }
    // south side of the alley: Hollis St. Logistics (warehouse, 3 storeys) split by the lane
    const south = (x0, x1) => {
      boxc(x0, 0, -54, x1, 14, -30, { mat: 'nc_brick_dark', mats: { t: 'concrete_dark' }, cast: false });
      boxc(x0, 14, -30.2, x1, 14.5, -30, { ...nc, mat: 'concrete' });
      boxc(x0, 0, -30.12, x1, 0.6, -30, { ...nc, mat: 'concrete_dark' });
      for (let f = 0; f < 3; f++) for (let x = x0 + 2.4; x < x1 - 1.5; x += 4.2) {
        const y = 4.2 + f * 3.2, lit = R() < 0.18;
        box(x, y - 0.1, -29.98, 1.6, 0.1, 0.2, { ...nc, mat: 'concrete' });
        box(x, y, -29.99, 1.4, 1.5, 0.04, { ...nc, mat: lit ? 'nc_window_cool' : 'p_glass_dark' });
      }
    };
    south(-42, -3); south(3, 42);
    // lane walls + loading bay (T1 lobby) building
    boxc(-8.3, 0, -66.3, 8.3, 0.01, -66, { ...nc, mat: 'concrete' });
    boxc(-8.3, 6, -66.3, 8.3, 14, -53.7, { mat: 'nc_brick_dark', cast: false });                 // upper floors over the bay
    boxc(-8.3, 5.4, -66.3, 8.3, 6, -53.7, { mat: 'concrete', mats: { b: 'concrete_dark' }, cast: false });
    W(-8, -66, 8, -66, { y: 0, h: 5.4, t: 0.3, mat: 'concrete_panels', mat2: 'nc_brick_dark' });
    W(-8, -65.85, -8, -54.15, { y: 0, h: 5.4, t: 0.3, mat: 'nc_brick_dark', mat2: 'concrete_panels' });
    W(8, -54.15, 8, -65.85, { y: 0, h: 5.4, t: 0.3, mat: 'nc_brick_dark', mat2: 'concrete_panels' });
    W(-8, -54, 8, -54, { y: 0, h: 5.4, t: 0.3, mat: 'nc_brick_dark', mat2: 'concrete_panels', openings: [{ at: 8, w: 5.4, h: 3.0, frame: 'paint_yellow' }] });
    box(0, 0, -54, 0.2, 3.0, 0.3, { mat: 'paint_yellow' });                                       // centre post between the two shutters
    B.lobby(1, { x0: -8, z0: -66, x1: 8, z1: -54, y: 0 }, [{ x: -1.4, z: -54, w: 2.6, h: 3.0 }, { x: 1.4, z: -54, w: 2.6, h: 3.0 }]);

    // ================================================================== markers: lobbies, spawns
    B.lobby(2, { x0: -30, z0: 10, x1: -17, z1: 22, y: 0 }, [{ x: -17, z: 16, w: 2.0, h: 2.6, ry: PI / 2 }, { x: -22, z: 10, w: 2.0, h: 2.6 }]);
    for (const [x, z] of [[-6.5, -64], [-4.2, -64], [-1.9, -64], [0.4, -64], [-6.5, -61], [-4.2, -61], [-1.9, -61], [0.4, -61], [-6.5, -58], [-4.2, -58], [-1.9, -58], [0.4, -58]])
      B.spawn(1, x, 0, z, 0);
    for (const [x, z] of [[-27.4, 11.5], [-25, 11.5], [-22.6, 11.5], [-27.4, 13.9], [-25, 13.9], [-22.6, 13.9], [-27.4, 18.8], [-25, 16.3], [-22.6, 16.3], [-20.2, 13.9], [-20.2, 16.3], [-25, 18.8]])
      B.spawn(2, x, 0, z, PI / 2);
    for (const [x, y, z, yaw] of [[-36, 0, -24, PI / 2], [-24, 0, -27, PI / 2], [-12, 0, -27, 0], [0, 0, -34, 0], [0, 0, -23, 0], [12, 0, -27, 0], [24, 0, -27, -PI / 2], [36, 0, -24, -PI / 2], [-27.6, 0, -17.2, 0]])
      B.spawn(1, x, y, z, yaw, { field: true });
    for (const [x, y, z, yaw] of [[-25.5, 0, 4, PI / 2], [-11, 0, 8, PI], [-11, 0, 17, PI], [-26, U, 14, PI / 2], [-18, U, 6, PI], [24, U, 20.8, PI], [26.6, U + 0.45, 11.2, -PI / 2], [2, U, 20.5, PI], [-13, U, 9, PI]])
      B.spawn(2, x, y, z, yaw, { field: true });
    for (const [x, y, z] of [[-34, 0, -21], [-15, 0, -21.5], [5, 0, -27], [20, 0, -21.5], [35, 0, -28], [0, 0, -38], [-23.2, U, -5.2], [-8, U, -15], [-2, U, -6], [12, U, -7], [26, U, -6],
      [-25, U, -1], [16, U, -1], [-22, U, 10], [10, U, 8], [20, U, 15], [26.6, U + 0.45, 8], [-12, 0, 14], [-2, 0, -8], [-23, 0, 4]])
      B.spawn(0, x, y, z, Math.atan2(-x, -(z + 8)));

    // ================================================================== objectives
    B.site('A', { x0: -2, z0: 5, x1: 23, z1: 18, y: U });
    B.site('B', { x0: -15.5, z0: -17.5, x1: 0, z1: -4, y: U });
    B.hostage(27.4, U + 0.45, 7.6); B.hostage(-7.2, U, -16.6); B.hostage(-24.5, U, -14.2); B.hostage(-27, U, 13); B.hostage(10, 0, -9);
    B.rescue({ x0: -2.5, z0: -40.5, x1: 2.5, z1: -31, y: 0 });
    B.point('dom1', -23, U, -8, 3); B.point('dom2', 7, 0, -6, 3); B.point('dom3', 22, U, -6.5, 3);
    B.point('hp1', 0, 0, -24, 4); B.point('hp2', -8, U, -11, 3.5); B.point('hp3', -20, U, 12, 4); B.point('hp4', 12, U, 10, 4); B.point('hp5', 7, 0, -6, 3);
    B.point('hill', 10, U, 11, 4);
    B.point('flag1', 0, 0, -37, 1.5); B.point('flag2', -23, 0, 5, 1.5);
    B.point('extract1', -37, 0, -24, 3); B.point('extract2', 37, 0, -24, 3); B.point('extract3', 0, 0, -34, 2.5);

    dress(B, { P, box, boxc, R });
    finish(B);
  },
};

// ====================================================================================================== dressing
function dress(B, { P, box, boxc, R }) {
  const nc = { collide: false, cast: false };
  // ceiling strip light: the visible fitting at the ceiling + an omni point light hung under it (lights walls and ceiling too)
  const lamp = (x, ceil, z, intensity, color, o = {}) => {
    P('light_fixture', x, ceil, z, { variant: o.variant || 'strip', light: false, warm: color[2] < .85, ry: o.ry || 0 });
    B.light({ x, y: ceil - (o.drop || .55), z, intensity, color, fixture: false, flicker: o.flicker || 0 });
  };
  // ---------------------------------------------------------------- alley
  // fences at both ends with the cross streets beyond (out of bounds)
  for (const x of [-40, 40]) {
    P('fence_chainlink', x, 0, -27.2, { ry: PI / 2, len: 5.4, h: 2.4, variant: 'barbed' });
    P('gate', x, 0, -21, { ry: PI / 2, len: 5.6 });
    box(x, 0, -18.4, 0.3, 2.6, 0.3, { mat: 'concrete' }); box(x, 0, -29.7, 0.3, 2.6, 0.3, { mat: 'concrete' });
  }
  // dumpsters, bins, bags, kegs, van
  P('dumpster', -19.5, 0, -28.9, { variant: 'green', hide: true });
  P('dumpster', 15.5, 0, -28.9, { variant: 'blue', lid: 'open', hide: true });
  P('wheelie_bin', -16.9, 0, -29.3, { variant: 'black' }); P('wheelie_bin', -16.1, 0, -29.3, { variant: 'blue', open: true });
  P('wheelie_bin', 18.2, 0, -29.3, { variant: 'green' }); P('wheelie_bin', -24.6, 0, -18.7, { variant: 'grey', ry: PI });
  P('trash_bag', -22.2, 0, -29.2, { n: 5 }); P('trash_bag', 13.2, 0, -29.3, { n: 4 }); P('trash_bag', 22, 0, -18.6, { n: 3 });
  P('car', -7.5, 0, -20.6, { variant: 'van', color: 'white', ry: PI / 2, hide: true });
  P('pallet', -31, 0, -18.8, { variant: 'none', stack: 3 }); P('crate_plastic', -32.2, 0, -18.7, { variant: 'red', n: 4 });
  for (const [x, z] of [[-24, -18.6], [-23.55, -18.6], [-23.78, -19.05], [-23.1, -18.62]]) keg(B, x, 0, z);
  for (const [x, z] of [[33, -29.3], [33.45, -29.3], [32.6, -29.3]]) keg(B, x, 0, z);
  P('pallet', 33, 0, -18.8, { variant: 'boxes', ry: PI / 2 }); P('cardboard_box', 31.4, 0, -18.8, { variant: 'pile', n: 5 });
  boxc(3.5, 0, -18.62, 4.5, 1.15, -18.15, { mat: 'p_coat_green', surf: 'metal' }); P('litter_bin', -35, 0, -29.4, { variant: 'square' });
  P('cone', 26.2, 0, -19.4);
  P('bench', 12.6, 0, -18.55, { variant: 'metal', ry: PI, len: 1.4 }); B.cyl(14, 0, -18.6, .16, .45, { mat: 'paint_red', sides: 10 });
  boxc(-25.2, 1.2, -18.4, -24.5, 2.0, -18.15, { ...nc, mat: 'p_coat_slate' });
  P('crate_plastic', 30.4, 0, -29.3, { variant: 'green', n: 5 }); P('crate_plastic', 30.4, 1e-3, -28.85, { variant: 'green', n: 3 });
  P('ac_unit', -12, 2.4, -18.15, { variant: 'wall', ry: PI }); P('ac_unit', 20, 2.6, -18.15, { variant: 'wall', ry: PI });
  P('ac_unit', -34, 0, -29.3, { variant: 'condenser' });
  // fire escape on the warehouse: steel stair (alley -> 3.0 m landing), landing with a closed door and a ladder above
  B.stairs({ x: -12.6, z: -29.2, w: 1.0, len: 5.0, y0: 0, y1: 3.0, dir: '-x', mat: 'steel_dark', tread: 'grate', rail: 'left', railMat: 'steel_dark' });
  boxc(-20.5, 2.9, -30, -15.1, 3.0, -28.6, { mat: 'grate' });
  boxc(-20.5, 2.75, -30, -15.1, 2.9, -28.6, { mat: 'steel_dark', skip: 't' , collide: false });
  rail(B, -20.5, -28.65, -15.1, -28.65, 3.0, { mat: 'steel_dark' }); rail(B, -20.45, -30, -20.45, -28.65, 3.0, { mat: 'steel_dark' });
  for (const x of [-20.4, -15.2]) B.cyl(x, 0, -28.7, .05, 2.9, { mat: 'steel_dark', sides: 6 });
  box(-18.5, 3.0, -30.02, 1.1, 2.1, 0.06, { ...nc, mat: 'nc_door_steel' });
  P('ladder', -16, 4.1, -29.98, { h: 3.6, variant: 'galv' });
  B.hide(-12.4, 0, -29.3, { kind: 'under', r: .7 });
  B.hide(-19, 3.0, -29.3, { kind: 'roof' });
  // doors, canopies, lamps and signs on the club facade
  const door = (x, mat, sign) => {
    box(x, 0, -18.06, 1.0, 2.1, 0.06, { ...nc, mat });
    box(x + 0.32, 1.0, -18.12, 0.12, 0.04, 0.06, { ...nc, mat: 'nc_stainless' });
    box(x, 2.35, -18.6, 1.8, 0.08, 1.1, { mat: 'steel_dark', collide: false });
    if (sign) decal(B, 'sign', sign, x, 2.66, -18.17, 1.6, 0.15, { face: 's' });
  };
  // the door leaves stand open into the building (doorways stay passable)
  door(-27, 'nc_door_steel', 'deliv'); door(8, 'nc_door_red', 'stage'); door(27, 'nc_door_steel', 'fireexit');
  decal(B, 'glow', 'velvet', 8, 3.15, -18.2, 3.4, 0.74, { face: 's' });
  box(10.6, 3.6, -18.95, .14, 2.4, 1.3, { ...nc, mat: 'paint_black' }); box(10.6, 3.55, -18.4, .05, .05, .9, { ...nc, mat: 'steel_dark' });
  for (const [f, x] of [['e', 10.68], ['w', 10.52]]) decal(B, 'glow', 'velvet', x, 4.8, -18.95, 1.2, .9, { face: f, ry: 0 });
  strip(B, 10.6, 3.55, -19.62, 10.6, 6.05, -19.62, 'nc_led_pink', .04);
  decal(B, 'sign', 'keg', -24, 1.6, -18.17, 1.4, 0.13, { face: 's' });
  decal(B, 'sign', 'nopark', -8, 1.8, -18.17, 1.6, 0.15, { face: 's' });
  decal(B, 'sign', 'cctv', 12, 2.1, -18.17, .5, .25, { face: 's' });
  decal(B, 'sign', 'hollis', -36, 3.0, -18.17, 1.4, 0.13, { face: 's' });
  decal(B, 'sign', 'dock', -6, 3.4, -29.98, 2.2, 0.21, { face: 'n' });
  decal(B, 'sign', 'laundry', 22, 2.4, -29.98, 1.6, 0.15, { face: 'n' });
  for (const [x, s, h] of [[-10, 'poster0', 1.1], [-9.3, 'poster1', 1.1], [-8.6, 'poster0', 1.1], [18, 'poster3', 1.3], [36, 'poster2', 1.4]]) decal(B, 'sign', s, x, h + .45, -18.17, .6, s === 'poster2' || s === 'poster3' ? .6 : .9, { face: 's' });
  decal(B, 'stain', 'graffiti', 30, 1.3, -29.97, 4.2, 2.1, { face: 'n' });
  decal(B, 'sign', 'tag1', -30, 1.0, -18.17, 2.0, 1.0, { face: 's' });
  decal(B, 'sign', 'tag2', 22.5, 0.9, -29.97, 1.8, .9, { face: 'n' });
  decal(B, 'sign', 'tag3', -2, 1.2, -18.17, 1.6, .8, { face: 's' });
  // wall grime and water streaks along both facades, puddles, litter and butts on the ground
  for (let x = -40; x < 40; x += 4.3 + R() * 2) {
    decal(B, 'stain', 'grime', x, .6, -18.16, 4.5, 1.2, { face: 's' });
    decal(B, 'stain', 'grime', x + 1.2, .6, -29.98, 4.5, 1.2, { face: 'n' });
    if (R() < .5) decal(B, 'stain', 'water', x + .5, 1.8 + R(), -18.16, .8, 3.0, { face: 's' });
  }
  for (const [x, z, w] of [[-30, -24, 3.5], [-12, -25.5, 4], [2, -22, 2.4], [14, -25, 5], [26, -23, 3], [0, -36, 2.5], [-36, -27, 2]]) decal(B, 'stain', 'puddle', x, .013, z, w, w * .5, { ry: R() * PI });
  for (const [x, z] of [[-27, -19.6], [8, -19.6], [27, -19.6]]) decal(B, 'stain', 'butts', x, .014, z, 1.4, 1.4, { ry: R() * PI });
  for (let i = 0; i < 18; i++) decal(B, 'stain', R() < .5 ? 'litter' : 'oil0', -38 + R() * 76, .015, -29 + R() * 10, .8 + R(), .8 + R(), { ry: R() * PI });
  // pipes: downpipes and a cable run along the club wall, overhead cables across the alley
  for (const x of [-29.4, -14.2, 4.6, 19.3, 29.4]) { B.cyl(x, 0, -18.32, .055, 12.6, { mat: 'paint_black', sides: 8, collide: false }); box(x, 0, -18.45, .3, .12, .3, { ...nc, mat: 'paint_black' }); }
  box(0, 3.55, -18.2, 60, .06, .06, { ...nc, mat: 'paint_black' });
  for (const x of [-31, -6, 17, 34]) box(x, 6.2 + (x % 3) * .3, -24, .025, .025, 12, { ...nc, mat: 'paint_black' });
  // wall packs (sodium) over the three doors + two lamps on the warehouse
  for (const x of [-27, 8, 27]) {
    box(x, 3.0, -18.3, .3, .22, .25, { ...nc, mat: 'paint_black' }); box(x, 2.98, -18.3, .24, .03, .2, { ...nc, mat: 'nc_sodium' });
    B.light({ type: 'spot', x, y: 2.95, z: -18.6, dir: [0, -1, -.35], angle: 2.0, intensity: 26, color: [1, .66, .36], fixture: false });
  }
  for (const x of [-10]) {
    box(x, 4.6, -29.75, .5, .18, .4, { ...nc, mat: 'paint_black' }); box(x, 4.58, -29.75, .4, .03, .3, { ...nc, mat: 'nc_window_cool' });
    B.light({ type: 'spot', x, y: 4.55, z: -29.4, dir: [0, -1, .5], angle: 2.1, intensity: 40, color: [.7, .78, 1], fixture: false });
  }
  // cross streets beyond the fences (out of bounds): kerbs, a parked car, facades with lit windows, a street light
  for (const s of [-1, 1]) {
    box(s * 52, -0.3, -24, 20, 0.3, 50, { mat: 'nc_asphalt', collide: false });
    boxc(s > 0 ? 42 : -45, 0, -50, s > 0 ? 45 : -42, .15, 2, { ...nc, mat: 'pavement' });
    boxc(s > 0 ? 60 : -66, 0, -60, s > 0 ? 66 : -60, 18, 10, { ...nc, mat: 'nc_brick_dark' });
    for (let f = 0; f < 5; f++) for (let z = -54; z < 8; z += 3.6) if (R() < .45) box(s > 0 ? 59.98 : -59.98, 2 + f * 3.2, z, .05, 1.4, 1.2, { ...nc, mat: R() < .5 ? 'nc_window_warm' : 'nc_window_cool' });
    P('car', s * 47, 0, -26 + s * 4, { ry: s > 0 ? 0 : PI, collide: false });
    P('street_light', s * 44, .15, -14, { ry: s > 0 ? -PI / 2 : PI / 2, h: 7, collide: false });
  }
  // distant skyline (above the roofs)
  for (let i = 0; i < 26; i++) {
    const a = -PI * .95 + i / 25 * PI * 1.9, d = 110 + R() * 60, x = Math.sin(a) * d, z = -20 + Math.cos(a) * d, w = 14 + R() * 16, h = 25 + R() * 45;
    box(x, 0, z, w, h, w, { ...nc, mat: 'concrete_dark', ry: a });
    decal(B, 'glow', 'town', x - Math.sin(a) * (w / 2 + .1), h * .5, z - Math.cos(a) * (w / 2 + .1), w * .95, h * .9, { face: 'n', ry: a + PI });
  }

  // ---------------------------------------------------------------- lane + loading bay (T1 lobby)
  P('box_truck', 5.2, 0, -60.6, { variant: 'logo', color: 'white' });
  P('pallet', -6.8, 0, -65.2, { variant: 'wrap', stack: 1 }); P('pallet', -5.4, 0, -65.2, { variant: 'boxes' });
  P('pallet_jack', 2.4, 0, -65.1, { ry: PI / 2 }); P('shelf_unit', -7.6, 0, -55.6, { ry: PI / 2, w: 1.2 });
  P('rack', -1.6, 0, -65.3, { bays: 2, levels: 2, lh: 1.7, load: .8 });
  P('forklift', 6.6, 0, -55.6, { variant: 'yellow', ry: PI });
  P('wheelie_bin', -7.4, 0, -57.2, { variant: 'grey', ry: PI / 2 });
  for (const [x, z] of [[-3, -59], [1.5, -62.5], [-5.5, -62]]) decal(B, 'stain', 'oil0', x, .012, z, 1.6, 1.6, { ry: x });
  P('fire_extinguisher', -7.83, 0, -59, { ry: PI / 2 }); P('whiteboard', 7.84, 1.0, -56, { ry: -PI / 2, w: 1.4 });
  decal(B, 'sign', 'hazard', 0, .01, -54.6, 5.4, .3, { face: 'u' });
  decal(B, 'sign', 'dock', 0, 3.6, -54.17, 2.6, .25, { face: 'n' });
  P('light_fixture', -2, 5.4, -60, { variant: 'highbay', drop: .6, light: false }); P('light_fixture', 4, 5.4, -62, { variant: 'highbay', drop: .6, light: false });
  B.light({ x: -2, y: 4.5, z: -60, intensity: 22, color: [.9, .95, 1], fixture: false });
  decal(B, 'stain', 'oil1', -2, .012, -60, 2.4, 2.4); decal(B, 'stain', 'oil0', 4, .012, -58, 2, 2);
  P('car', -1.75, 0, -45.5, { variant: 'hatch', color: 'grey', hide: true });
  P('wheelie_bin', 2.5, 0, -49.5, { variant: 'green', ry: -PI / 2 }); P('wheelie_bin', 2.5, 0, -48.7, { variant: 'black', ry: -PI / 2 }); P('trash_bag', 2.4, 0, -47.6, { n: 3 });
  for (const [x, f] of [[-2.99, 'e'], [2.99, 'w']]) for (let z = -52; z < -31; z += 5.5) decal(B, 'stain', 'grime', x, .6, z, 4.6, 1.2, { face: f });
  for (const z of [-50, -38]) { box(-2.9, 3.4, z, .2, .26, .14, { ...nc, mat: 'paint_black' }); box(-2.79, 3.43, z, .02, .2, .1, { ...nc, mat: 'nc_window_warm' }); }
  decal(B, 'sign', 'hollis', 2.98, 2.8, -44, 1.4, .13, { face: 'w' }); decal(B, 'sign', 'tag2', -2.98, 1.3, -41, 1.6, .8, { face: 'e' });
  B.cyl(2.75, 0, -36, .055, 14, { mat: 'paint_black', sides: 8, collide: false });
  for (const z of [-52, -40, -35]) { P('bollard', -2.4, 0, z, { variant: 'yellow' }); P('bollard', 2.4, 0, z, { variant: 'yellow' }); }
  decal(B, 'sign', 'nosmoke', -2.97, 1.8, -36, 1.4, .13, { face: 'e' });

  // ---------------------------------------------------------------- kitchen (U)
  const u = U;
  P('kitchen_counter', -26.4, u, -3.45, { ry: PI, variant: 'grey', len: 2.4, sink: 1, upper: false });
  P('kitchen_counter', -18.7, u, -3.45, { ry: PI, variant: 'grey', len: 2.4, hob: -1, sink: -1, upper: false });
  P('stove', -25.5, u, -17.5, { variant: 'steel', hood: true }); P('stove', -24.8, u, -17.5, { variant: 'steel' });
  P('fridge', -27.3, u, -17.45, { variant: 'steel' });
  boxc(-27.9, u + 2.0, -17.85, -22.2, u + 2.6, -16.6, { mat: 'nc_stainless', collide: false });
  box(-25, u + 2.6, -17.3, .45, CU - u - 2.6, .45, { ...nc, mat: 'nc_stainless' });
  boxc(-23.8, u + 2.15, -10.2, -19.6, u + 2.2, -9.4, { ...nc, mat: 'nc_stainless' });
  for (let x = -23.4; x < -19.8; x += .55) { B.cyl(x, u + 1.75, -9.8, .14, .06, { ...nc, mat: 'steel_dark', sides: 10 }); B.cyl(x, u + 1.81, -9.8, .01, .34, { ...nc, mat: 'steel_dark', sides: 4 }); }
  for (const [x, z] of [[-23.8, -10.2], [-19.6, -10.2], [-23.8, -9.4], [-19.6, -9.4]]) B.cyl(x, u + 2.2, z, .01, CU - u - 2.2, { ...nc, mat: 'steel_dark', sides: 4 });
  boxc(-17.4, u, -6.2, -16.1, u + .9, -3.3, { mat: 'nc_stainless', surf: 'metal' }); boxc(-17.3, u + .9, -5.8, -16.4, u + 1.3, -4.6, { ...nc, mat: 'nc_chrome' });
  P('pallet', -28.8, u, -8.6, { variant: 'sacks', ry: PI / 2 });
  // stainless prep island (cover) with shelf and pans
  boxc(-24, u, -11, -19.4, u + 0.9, -8.6, { mat: 'nc_stainless', surf: 'metal' });
  boxc(-24.1, u + 0.9, -11.1, -19.3, u + 0.94, -8.5, { mat: 'nc_stainless', collide: false });
  boxc(-23.7, u + 0.94, -10.6, -23.2, u + 1.06, -10.1, { ...nc, mat: 'nc_chrome' });
  boxc(-21.2, u + 0.94, -9.6, -20.4, u + 1.02, -9.1, { ...nc, mat: 'plastic_white' });
  P('shelf_unit', -27.7, u, -6, { ry: PI / 2, variant: 'grey', boards: false });
  P('shelf_unit', -27.7, u, -8.3, { ry: PI / 2, variant: 'grey', boards: false });
  P('crate_plastic', -26, u, -6.5, { variant: 'yellow', n: 3 }); P('crate_plastic', -25.4, u, -6.5, { variant: 'blue', n: 2 });
  // walk-in cold room (closet hide) in the SE corner
  const cr = { y: u, h: 2.5, t: 0.12, mat: 'p_coat_white', mat2: 'p_coat_white' };
  B.wall(-21.5, -17.85, -21.5, -13.6, { ...cr, openings: [{ at: 2.9, w: 0.95, h: 2.0, frame: 'nc_stainless' }] });
  B.wall(-21.56, -13.6, -16.1, -13.6, { ...cr });
  boxc(-21.56, u + 2.5, -17.85, -16.1, u + 2.6, -13.54, { mat: 'p_coat_white' });
  decal(B, 'sign', 'cold', -21.58, u + 2.25, -15.3, 1.2, .11, { face: 'w' });
  P('shelf_unit', -17.0, u, -16.8, { ry: -PI / 2, variant: 'grey', boards: false });
  P('crate_plastic', -19.0, u, -17.4, { variant: 'green', n: 4 });
  B.hide(-19, u, -15.6, { kind: 'closet', r: .7 });
  decal(B, 'sign', 'kitchen', -21, u + 2.45, -3.11, 1.4, .13, { face: 'n' });
  decal(B, 'stain', 'spill', -22, u + .012, -7, 1.2, 1.2); decal(B, 'stain', 'scuff', -24, u + .012, -12, 3, 3);
  lamp(-24.5, CU - .02, -12, 8, [.92, .97, 1]);
  lamp(-21, CU - .02, -6, 7, [.92, .97, 1]);
  P('fire_extinguisher', -16.13, u, -5, { ry: -PI / 2 });

  // ---------------------------------------------------------------- beer cellar = site B (U)
  // keg pallets in two aisles, shelving on the walls, crate stacks, CO2 bottles
  const kegPallet = (x, z, two) => {
    P('pallet', x, u, z, { variant: 'none' });
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) { keg(B, x - .27 + i * .54, u + .14, z - .2 + j * .4); if (two) keg(B, x - .27 + i * .54, u + .76, z - .2 + j * .4); }
  };
  kegPallet(-11, -14.8, true); kegPallet(-11, -13.8, false); kegPallet(-9.6, -14.8, false);
  kegPallet(-5.2, -9.4, true); kegPallet(-5.2, -10.4, true); kegPallet(-3.8, -9.4, false);
  kegPallet(-12.6, -6.4, true); kegPallet(-1.6, -15.6, true);
  P('crate_stack', -13.6, u, -16.6, { hide: true });
  P('crate_stack', -7.6, u, -6.2, { ry: PI });
  P('shelf_unit', -15.6, u, -11, { ry: PI / 2, w: 1.2 }); P('shelf_unit', -15.6, u, -9.6, { ry: PI / 2, w: 1.2 });
  P('shelf_unit', -4, u, -17.5, { w: 1.2 }); P('shelf_unit', -9, u, -17.5, { w: 1.2 });
  P('gas_cylinder', -0.6, u, -17.6, { variant: 'co2', n: 4 });
  P('cardboard_box', -6.8, u, -13, { variant: 'medium', stack: 3 }); P('cardboard_box', -6.0, u, -12.2, { variant: 'large', ry: .3 }); P('cardboard_box', 1.7, u, -11, { variant: 'large', stack: 2 });
  P('crate_plastic', -1.2, u, -6.4, { variant: 'black', n: 5 }); P('crate_plastic', -0.5, u, -6.4, { variant: 'black', n: 4 });
  P('pallet_jack', -8, u, -10, { ry: .4 });
  // beer-line cooler unit + python pipes along the ceiling toward the bar
  boxc(-15.8, u, -5.6, -14.7, u + 1.8, -3.2, { mat: 'p_coat_white', surf: 'metal' });
  for (let i = 0; i < 4; i++) box(-8, CU - .12 - i * .07, -3.4, 15.4, .05, .05, { ...nc, mat: i % 2 ? 'p_plastic_red' : 'p_plastic_blue' });
  B.hide(1.9, u, -16.2, { kind: 'dark' });
  B.hide(-13.2, u, -15.1, { kind: 'crates' });
  decal(B, 'sign', 'cellar', -12, u + 2.5, -3.11, 1.4, .13, { face: 's' });
  decal(B, 'sign', 'capacity', -2, u + 1.7, -17.84, 1.0, .1, { face: 'n' });
  for (const [x, z] of [[-9, -12], [-3, -14], [-12, -8], [-6, -5]]) decal(B, 'stain', R() < .5 ? 'oil1' : 'dust', x, u + .012, z, 2.2, 2.2, { ry: R() * PI });
  for (let x = -15; x < 3; x += 3.4) decal(B, 'stain', 'water', x, u + 2, -17.84, .9, 2.6, { face: 'n' });
  lamp(-10.5, CU - .02, -12.5, 7, [1, .88, .66]);
  lamp(-4, CU - .02, -6.5, 6, [1, .88, .66], { flicker: .35 });

  // ---------------------------------------------------------------- restrooms (U)
  P('toilet_stall', 12.05, u, -16.82, { variant: 'grey', n: 4, open: [0, 2] });
  P('toilet_stall', 7.6, u, -16.82, { variant: 'blue', n: 2, open: [1] });
  for (let i = 0; i < 3; i++) { boxc(3.5, u + .45, -13.6 + i * 1.0, 3.85, u + 1.2, -13.15 + i * 1.0, { ...nc, mat: 'p_porcelain' }); }
  P('sink', 10, u, -8.5, { ry: 0, n: 2 }); P('sink', 15.15, u, -3.12, { ry: PI, n: 2 });
  box(10, u, -8.75, .25, 2.1, .5, { mat: 'nc_tile_wall' });
  B.hide(13.45, u, -16.5, { kind: 'closet', r: .6 });
  boxc(3.42, u + 1.2, -12.4, 3.44, u + 2.2, -9.4, { ...nc, mat: 'nc_mirror' }); boxc(9.88, u + 1.2, -15, 9.9, u + 2.2, -11.2, { ...nc, mat: 'nc_mirror' });
  boxc(3.42, u, -12.6, 4.0, u + .85, -9.2, { mat: 'nc_terrazzo' });
  for (const z of [-11.7, -10.1]) B.cyl(3.75, u + .86, z, .17, .04, { ...nc, mat: 'p_porcelain', sides: 14 });
  for (const [x, z, f] of [[15.88, -12, 'w'], [15.88, -10.4, 'w'], [3.52, -7, 'e']]) boxc(f === 'w' ? x - .2 : x, u + 1.1, z - .14, f === 'w' ? x : x + .2, u + 1.4, z + .14, { ...nc, mat: 'nc_chrome' });
  strip(B, 3.6, CU - .1, -3.3, 15.8, CU - .1, -3.3, 'nc_led_cyan', .02);
  for (let i = 0; i < 4; i++) decal(B, 'stain', i % 2 ? 'scuff' : 'water', 11 + i, u + .012, -14 + i * 1.3, 1.2, 1.2, { ry: i });
  decal(B, 'sign', 'wc', 10, u + 2.4, -3.11, .6, .4, { face: 'n' });
  decal(B, 'sign', 'wcs', 10, u + 2.6, -2.89, 1.4, .13, { face: 'n' });
  decal(B, 'stain', 'scuff', 9, u + .012, -11, 3, 3); decal(B, 'sign', 'wet', 5.5, u + .01, -6, .6, .6, { face: 'u' });
  decal(B, 'sign', 'tag1', 9.98, u + 1.4, -13, 1.2, .6, { face: 'w' });
  lamp(10, CU - .02, -10.5, 7, [.85, .95, 1], { variant: 'troffer' });

  // ---------------------------------------------------------------- fire lobby + plant room (U)
  P('generator', 19.5, u, -16.5, { variant: 'portable' }); P('ac_unit', 17.6, u, -12.2, { variant: 'hvac', ry: PI / 2 });
  boxc(21.9, u, -17.85, 22.9, u + 2.0, -16.8, { mat: 'p_coat_slate', surf: 'metal' });   // switchboard
  boxc(16.1, u, -16.3, 16.6, u + 1.8, -14.9, { mat: 'p_coat_slate', surf: 'metal' });
  B.cyl(20.5, u, -11.3, .35, 1.8, { mat: 'p_coat_white', sides: 12 });                  // water heater
  for (let i = 0; i < 3; i++) box(19.5, CU - .25 - i * .2, -14, 6.8, .14, .14, { ...nc, mat: i ? 'p_galv' : 'p_coat_red' });
  decal(B, 'sign', 'hv', 22.4, u + 1.5, -16.78, .3, .3, { face: 'n' });
  decal(B, 'sign', 'plant', 23.11, u + 2.4, -14.2, 1.2, .11, { face: 'e' });
  B.hide(18.0, u, -14.0, { kind: 'dark' });
  P('crate_plastic', 24.2, u, -8.2, { variant: 'red', n: 4 }); P('crate_plastic', 24.9, u, -8.2, { variant: 'red', n: 3 });
  P('fire_extinguisher', 27.4, u, -3.17, { ry: PI }); P('cardboard_box', 26, u, -17.4, { variant: 'flat' });
  P('cone', 25.5, u, -12.6);
  for (let i = 0; i < 3; i++) for (let k = 0; k < 4; k++) P('chair', 17.0 + i * .55, u + k * .12, -3.6, { variant: 'plastic', ry: PI, collide: k === 0 });
  boxc(19.8, u, -9.9, 21.0, u + .8, -9.1, { mat: 'p_coat_black', surf: 'wood' }); boxc(19.85, u + .8, -9.85, 20.95, u + 1.5, -9.15, { mat: 'p_coat_black', surf: 'wood' });
  boxc(21.2, u, -9.9, 22.2, u + 1.1, -9.2, { mat: 'p_coat_black', surf: 'wood' });
  speaker(B, 26.6, u, -4.2, PI, { n: 1 });
  boxc(29.3, u, -9.4, 29.8, u + 1.2, -6.8, { mat: 'wood_dark' });
  boxc(16.1, u, -9.2, 16.8, u + .85, -8.4, { mat: 'p_porcelain' }); P('pallet', 25.6, u, -14.2, { variant: 'boxes', ry: PI / 2 });
  decal(B, 'sign', 'exitman', 28.15 - 0.01, u + 2.2, -9.5, .5, .33, { face: 'w' });
  decal(B, 'sign', 'fireexit', 22, u + 2.5, -3.11, 1.4, .13, { face: 's' });
  decal(B, 'stain', 'crack', 22, u + .012, -7, 2.5, 2.5); decal(B, 'stain', 'dust', 26.5, u + .012, -13, 2.5, 2.5);
  lamp(22.5, CU - .02, -6.8, 6, [.85, .95, 1], { flicker: .5 });

  // ---------------------------------------------------------------- services under the slab: spiral ducts and cable trays
  const duct = (x0, z0, x1, z1, y, r = .2) => {
    const L = Math.hypot(x1 - x0, z1 - z0), ry = Math.atan2(-(z1 - z0), x1 - x0);
    B.push((x0 + x1) / 2, y, (z0 + z1) / 2, ry);
    B.mesh((() => { const m = BABYLON.MeshBuilder.CreateCylinder('duct', { diameter: r * 2, height: L, tessellation: 12 }, B.scene); m.rotation.z = PI / 2; return m; })(), { mat: 'p_galv', collide: 'none', cast: false });
    for (let k = -L / 2 + .6; k < L / 2; k += 1.5) B.cyl(k, r, 0, .008, CU - y - r, { ...nc, mat: 'steel_dark', sides: 4 });
    B.pop();
  };
  duct(-29.5, 13, -6.4, 13, CU - .45, .25); duct(-29.5, -1.9, 29.5, -1.9, CU - .32, .18);
  duct(-15.5, -12, 0.2, -12, CU - .3, .2); duct(-29.5, -14, -16.5, -14, CU - .3, .22); duct(16.5, -7, 29.5, -7, CU - .3, .2);
  for (const [x0, z0, x1, z1] of [[-29.5, -0.2, 29.5, -0.2], [-29.5, 7.5, -6.5, 7.5], [-15.5, -8, 0.2, -8]]) {
    const L = Math.hypot(x1 - x0, z1 - z0);
    box((x0 + x1) / 2, CU - .16, (z0 + z1) / 2, x1 !== x0 ? L : .3, .06, x1 !== x0 ? .3 : L, { ...nc, mat: 'p_galv' });
  }

  // ---------------------------------------------------------------- back corridor C1 (U)
  // posters, LED cove, lockers, a cigarette machine, bench, exit signs
  strip(B, -29.8, CU - .05, -2.85, 29.8, CU - .05, -2.85, 'nc_led_violet', .03);
  strip(B, -29.8, CU - .05, 0.85, -6.2, CU - .05, 0.85, 'nc_led_violet', .03);
  P('lockers', -28.6, u, -2.75, { n: 4, variant: 'grey', bench: false });
  P('vending_machine', 15.2, u, 0.4, { ry: PI, variant: 'snacks' });
  P('bench', -2.2, u, 0.55, { variant: 'metal', ry: PI, len: 1.6 });
  for (const [x, s] of [[-18, 'poster0'], [-17.2, 'poster1'], [8.5, 'poster0'], [9.3, 'poster1'], [17.5, 'poster1'], [26, 'poster0']]) decal(B, 'sign', s, x, u + 1.55, x > 15 || x < -6 ? 0.89 : -2.89, .6, .9, { face: x > 15 || x < -6 ? 's' : 'n' });
  decal(B, 'sign', 'arrowL', -7, u + 2.3, -2.89, .3, .3, { face: 'n' }); decal(B, 'glow', 'exit', 22, u + 2.55, -2.88, .5, .2, { face: 'n' });
  decal(B, 'glow', 'exit', -21, u + 2.45, -2.88, .5, .2, { face: 'n' });
  for (let x = -28; x < 29; x += 3.5) decal(B, 'stain', 'scuff', x, u + .012, -1, 3, 3, { ry: R() * PI });
  B.light({ x: -15, y: CU - 0.02, z: -1, intensity: 6, color: [1, .72, .5], fixture: 'bulb' });
  B.light({ x: 12, y: CU - 0.02, z: -1, intensity: 6, color: [1, .72, .5], fixture: 'bulb' });

  // ---------------------------------------------------------------- cocktail bar (U)
  for (const x of [-25.6, -21.4, -17.2]) P('bar_counter', x, u, 18.9, { ry: PI, len: 4.2 });
  for (const x of [-27, -24, -21, -18, -15.2]) P('back_bar', x, u, 21.6, { ry: PI, len: 3 });
  for (let x = -27.2; x < -15.4; x += 1.0) P('bar_stool', x, u, 17.9, { variant: 'leather' });
  decal(B, 'glow', 'bar', -21, u + 2.7 - .2, 21.82, 1.6, .6, { face: 's' });
  decal(B, 'glow', 'cocktail', -16.4, u + 2.6, 21.82, .7, .34, { face: 's' });
  decal(B, 'glow', 'menu', -26, u + 2.5, 21.82, 1.0, .5, { face: 's' });
  strip(B, -28, u + 1.08, 18.45, -15.1, u + 1.08, 18.45, 'nc_led_amber', .02);
  B.hide(-21.5, u, 20.4, { kind: 'under', r: .7 });
  // lounge: booths along the west wall, sofas round low tables, high tables
  for (const z of [5.0, 8.6, 12.2]) P('booth', -28.6, u, z, { variant: 'leather', len: 1.3 });
  P('sofa', -20, u, 4.2, { variant: 'red', ry: 0 }); P('sofa', -20, u, 7.6, { variant: 'red', ry: PI }); P('coffee_table', -20, u, 5.9, { variant: 'glass' });
  P('armchair', -15.2, u, 9.6, { variant: 'mustard', ry: -PI / 2 }); P('armchair', -15.2, u, 11.4, { variant: 'mustard', ry: -PI / 2 }); P('coffee_table', -16.6, u, 10.5, { variant: 'wood', ry: PI / 2 });
  for (const [x, z] of [[-24, 14.5], [-19, 14.6], [-10.5, 6.8], [-10.5, 17], [-24, 9]]) {
    B.cyl(x, u, z, .05, 1.05, { mat: 'nc_brass', sides: 8, collide: false }); B.cyl(x, u + 1.05, z, .36, .04, { mat: 'nc_wood_bar', sides: 16 });
    B.cyl(x, u, z, .25, .02, { mat: 'nc_brass', sides: 16, collide: false });
    for (let k = 0; k < 2; k++) P('bar_stool', x + (k ? .6 : -.6), u, z, { variant: 'wood' });
  }
  P('rug', -20, u, 5.9, { variant: 'red', w: 2.4, d: 3.4 });
  for (const [x0, x1] of [[-23.5, -19.6], [-17.4, -13.5]]) {
    boxc(x0, u, 12.6, x1, u + 1.0, 13.4, { mat: 'nc_wood_bar', surf: 'wood' }); boxc(x0 - .05, u + 1.0, 12.55, x1 + .05, u + 1.06, 13.45, { mat: 'nc_brass', collide: false });
    boxc(x0 + .1, u + 1.06, 12.7, x1 - .1, u + 1.12, 13.3, { ...nc, mat: 'p_soil' });
    for (let x = x0 + .4; x < x1 - .2; x += .7) P('bush', x, u + 1.06, 13, { variant: 'small', s: .35, collide: false });
  }
  decal(B, 'glow', 'lips', -29.82, u + 1.9, 15.5, 1.4, .9, { face: 'e' });
  for (const z of [5, 9, 13]) { B.cyl(-29.5, u + 2.3, z, .09, .26, { ...nc, mat: 'nc_brass', sides: 10 }); B.cyl(-29.5, u + 2.25, z, .07, .05, { ...nc, mat: 'nc_led_amber', sides: 10 }); }
  // columns + drink rail between the bar and the hall
  for (const z of [4.1, 8.1, 12.1, 16.1, 20.1]) box(-6, u, z, .4, -U - .35 + .36, .4, { mat: 'nc_black' });
  for (const [z0, z1] of [[4.3, 6.8], [10, 12.6], [15.4, 21.8]]) { boxc(-6.2, u, z0, -5.8, u + 1.05, z1, { mat: 'nc_wood_bar', surf: 'wood' }); boxc(-6.3, u + 1.05, z0, -5.7, u + 1.1, z1, { mat: 'nc_brass', collide: false }); }
  B.light({ x: -23, y: CU, z: 11, intensity: 7, color: [1, .6, .35], fixture: false });
  B.light({ x: -13, y: CU, z: 17, intensity: 6, color: [1, .3, .55], fixture: false });
  for (const [x, z] of [[-23, 11], [-13, 17], [-13, 5], [-25, 18]]) { B.cyl(x, CU - .5, z, .22, .3, { ...nc, mat: 'nc_brass', sides: 14 }); B.cyl(x, CU - .52, z, .17, .03, { ...nc, mat: 'nc_led_amber', sides: 14 }); B.cyl(x, CU - .2, z, .008, .2, { ...nc, mat: 'paint_black', sides: 4 }); }

  boxc(-29.85, CU - .03, 1.1, -6.2, CU, 21.85, { ...nc, mat: 'nc_wood_bar' });
  for (let x = -29; x < -6.5; x += 1.2) box(x, CU - .12, 11.5, .08, .09, 20.6, { ...nc, mat: 'nc_wood_bar' });

  // ---------------------------------------------------------------- dance hall = site A (U)
  // DJ stage (north) with steps, booth, screens and PA; VIP platform (east) with booths and a rail
  boxc(6, u, 18.5, 18, u + 0.9, 21.85, { mat: 'nc_black', mats: { t: 'nc_wood_stage' }, surf: 'wood' });
  for (const x of [6.6, 17.4]) B.stairs({ x, z: 17.8, w: 1.2, len: 1.4, y0: u, y1: u + 0.9, dir: '+z', mat: 'nc_black', tread: 'nc_wood_stage', rail: false });
  boxc(9.6, u + .9, 19.4, 14.4, u + 2.0, 20.2, { mat: 'nc_black', surf: 'wood' });              // DJ booth front
  boxc(9.5, u + 2.0, 19.3, 14.5, u + 2.05, 20.3, { mat: 'nc_brass', collide: false });
  strip(B, 9.6, u + 1.3, 19.38, 14.4, u + 1.3, 19.38, 'nc_led_cyan', .03);
  boxc(10.2, u + 2.05, 19.6, 11.2, u + 2.12, 20.1, { ...nc, mat: 'plastic_black' }); boxc(12.8, u + 2.05, 19.6, 13.8, u + 2.12, 20.1, { ...nc, mat: 'plastic_black' });
  boxc(11.5, u + 2.05, 19.6, 12.5, u + 2.1, 20.1, { ...nc, mat: 'p_screen' });
  B.hide(12, u + 0.9, 20.9, { kind: 'dark', r: .7 });
  boxc(7.5, u + 1.6, 21.75, 16.5, u + 4.6, 21.84, { ...nc, mat: 'nc_screen' });                    // LED wall behind the DJ
  decal(B, 'glow', 'screen2', 12, u + 3.1, 21.73, 8.8, 2.9, { face: 's' });
  speaker(B, 4.6, u, 20.6, PI + .25, { n: 3 }); speaker(B, 19.4, u, 20.6, PI - .25, { n: 3 });
  // dance floor: LED tiles in a 6 x 5 grid
  for (let i = 0; i < 7; i++) for (let j = 0; j < 5; j++) {
    const m = ['nc_dance_a', 'nc_dance_b', 'nc_dance_c', 'nc_floor_black'][(i * 3 + j * 5 + (i * j) % 3) % 4];
    boxc(3.6 + i * 1.6 + .03, u, 8.4 + j * 1.6 + .03, 3.6 + (i + 1) * 1.6 - .03, u + .012, 8.4 + (j + 1) * 1.6 - .03, { ...nc, mat: m });
  }
  boxc(3.5, u, 8.3, 14.9, u + .006, 16.5, { ...nc, mat: 'nc_chrome' });
  // VIP platform
  boxc(24, u, 4, 29.85, u + 0.45, 20.2, { mat: 'nc_black', mats: { t: 'nc_carpet' }, surf: 'wood' });
  boxc(23.55, u, 4.4, 24, u + 0.225, 19.8, { mat: 'nc_black', mats: { t: 'nc_carpet' }, surf: 'wood' });
  for (const z of [6.2, 9.5, 12.8, 16.1, 19.0]) P('booth', 28.9, u + 0.45, z, { variant: 'red', len: 1.3 });
  rail(B, 24.1, 4.1, 24.1, 7.4, u + .45, { mat: 'nc_brass' }); rail(B, 24.1, 9.8, 24.1, 13.6, u + .45, { mat: 'nc_brass' }); rail(B, 24.1, 16, 24.1, 20.1, u + .45, { mat: 'nc_brass' });
  strip(B, 23.55, u + .2, 4.4, 23.55, u + .2, 19.8, 'nc_led_pink', .02);
  decal(B, 'sign', 'vip', 29.83, u + 2.6, 12, 1.4, .13, { face: 'w' });
  decal(B, 'glow', 'heart', 29.82, u + 2.2, 14.4, .9, .9, { face: 'w' });
  B.hide(29.2, u + 0.45, 4.6, { kind: 'dark', r: .6 });
  // cover on the floor: flight cases, speaker stacks, high tables, pillars
  speaker(B, -1.2, u, 6.2, PI / 2, { n: 1 }); speaker(B, 21.2, u, 7, -PI / 2, { n: 2 });
  boxc(1.0, u, 13.6, 2.2, u + 1.0, 14.4, { mat: 'p_coat_black', surf: 'wood' }); boxc(1.05, u + 1.0, 13.65, 2.15, u + 1.6, 14.35, { mat: 'p_coat_black', surf: 'wood' });
  boxc(18.4, u, 10.2, 19.6, u + 0.9, 11.4, { mat: 'p_coat_black', surf: 'wood' });
  for (const [x, z] of [[1.2, 3], [21.5, 3]]) box(x, u, z, .5, 3.2, .5, { mat: 'nc_black' });
  for (const [x, z] of [[18.5, 14.5], [0.5, 10], [20.5, 18]]) { B.cyl(x, u, z, .05, 1.05, { mat: 'nc_chrome', sides: 8, collide: false }); B.cyl(x, u + 1.05, z, .35, .04, { mat: 'nc_chrome', sides: 16 }); B.collider({ cx: x, cy: u + .55, cz: z, hx: .3, hy: .55, hz: .3 }); }
  // lighting truss + moving heads + mirror ball, LED cove round the hall
  truss(B, 1, 7, 23, 7, 2.2); truss(B, 1, 15, 23, 15, 2.2); truss(B, 1, 7, 1, 15, 2.2); truss(B, 23, 7, 23, 15, 2.2);
  for (const [x, z] of [[1, 7], [1, 15], [23, 7], [23, 15]]) B.cyl(x, 2.5, z, .015, CG - 2.5, { ...nc, mat: 'steel_dark', sides: 4 });
  for (let i = 0; i < 6; i++) for (const z of [7, 15]) { const x = 3 + i * 3.6; boxc(x - .15, 1.9, z - .15, x + .15, 2.2, z + .15, { ...nc, mat: 'plastic_black' }); B.cyl(x, 1.82, z, .1, .1, { ...nc, mat: i % 2 ? 'nc_led_cyan' : 'nc_led_pink', sides: 10 }); }
  B.cyl(12, 0.2, 11, .012, 3.0, { ...nc, mat: 'steel_dark', sides: 4 });
  B.mesh((() => { const s = BABYLON.MeshBuilder.CreateSphere('mirrorball', { diameter: .7, segments: 6 }, B.scene); s.position.set(12, -.15, 11); return s; })(), { mat: 'nc_chrome', collide: 'none', cast: false });
  strip(B, -5.8, CG - .2, 21.8, 29.8, CG - .2, 21.8, 'nc_led_pink', .04);
  strip(B, 29.8, CG - .2, 1.2, 29.8, CG - .2, 21.8, 'nc_led_cyan', .04);
  strip(B, 14.2, CG - .2, 1.2, 29.8, CG - .2, 1.2, 'nc_led_pink', .04);
  strip(B, -5.8, CU - .08, 1.2, 13.9, CU - .08, 1.2, 'nc_led_violet', .03);
  // acoustic panels on the hall walls
  for (let z = 2.5; z < 21; z += 2.4) { if (z > 3.5 && z < 20.5) boxc(29.78, u + 1.2, z - 1, 29.85, u + 3.8, z + 1, { ...nc, mat: 'nc_velvet_blue' }); }
  for (let x = -3; x < 29; x += 2.4) if (x < 4 || x > 20) boxc(x - 1, u + 1.2, 21.78, x + 1, u + 3.8, 21.85, { ...nc, mat: 'nc_velvet_blue' });
  decal(B, 'glow', 'dance', 22, u + 4.6, 21.8, 4, 1.1, { face: 's' });
  for (const [x, z, s] of [[8, 6, 'spill'], [16, 13, 'scuff'], [4, 18, 'scuff'], [14, 4, 'butts'], [20, 9, 'scuff']]) decal(B, 'stain', s, x, u + .014, z, 2.6, 2.6, { ry: R() * PI });
  B.light({ type: 'spot', x: 6, y: 1.9, z: 15, dir: [.3, -1, .45], angle: 1.15, intensity: 120, color: [1, .25, .7], fixture: false });
  B.light({ type: 'spot', x: 18, y: 1.9, z: 15, dir: [-.3, -1, .45], angle: 1.15, intensity: 120, color: [.3, .6, 1], fixture: false });
  B.light({ type: 'spot', x: 12, y: 1.9, z: 7, dir: [0, -1, -.1], angle: 1.5, intensity: 140, color: [.75, .5, 1], fixture: false });
  B.light({ x: 26.5, y: 0.2, z: 12, intensity: 22, color: [1, .35, .45], fixture: false });
  B.light({ x: 12, y: 0.4, z: 11, intensity: 55, color: [.7, .55, 1], fixture: false });

  // ---------------------------------------------------------------- foyer, stage-door corridor (G)
  // ticket booth (glass screen) in the SE corner, cloakroom counter on the west wall, rope stanchions, ATM, mirror
  boxc(10.5, 0, -11.9, 10.7, 1.05, -8.6, { mat: 'nc_wood_bar' }); boxc(10.7, 0, -8.8, 13.9, 1.05, -8.6, { mat: 'nc_wood_bar' });
  boxc(10.45, 1.05, -11.9, 10.75, 1.1, -8.55, { mat: 'nc_brass', collide: false }); boxc(10.7, 1.05, -8.85, 13.9, 1.1, -8.55, { mat: 'nc_brass', collide: false });
  boxc(10.58, 1.1, -11.9, 10.62, 2.3, -8.6, { mat: 'glass', surf: 'glass' }); boxc(10.7, 1.1, -8.72, 13.9, 2.3, -8.68, { mat: 'glass', surf: 'glass' });
  P('office_chair', 12.6, 0, -10.6, { variant: 'charcoal', ry: PI }); P('monitor', 12.4, 1.1, -9.1, { ry: PI, keyboard: false });
  decal(B, 'sign', 'tickets', 12.2, 2.55, -8.66, 1.4, .13, { face: 'n' });
  boxc(-3.9, 0, -9.2, -3.2, 1.05, -4.6, { mat: 'nc_wood_bar' }); boxc(-3.95, 1.05, -9.25, -3.15, 1.1, -4.55, { mat: 'nc_brass', collide: false });
  for (const x of [-5.6, -4.8]) {
    B.cyl(x, 1.75, -9.2, .015, .02, { ...nc, mat: 'nc_chrome' }); box(x, 1.75, -6.9, .03, .03, 4.6, { ...nc, mat: 'nc_chrome' });
    for (let z = -9.0; z < -4.7; z += .2 + R() * .12) { const h = .75 + R() * .35; box(x, 1.72 - h, z, .38 + R() * .1, h, .06, { ...nc, mat: ['p_fab_charcoal', 'p_fab_navy', 'p_fab_brown', 'p_fab_red', 'p_fab_olive', 'p_leather_black'][Math.floor(R() * 6)], ry: (R() - .5) * .5 }); }
  }
  B.collider({ cx: -5.2, cy: .9, cz: -6.9, hx: .45, hy: .9, hz: 2.2, surf: 'fabric' });
  decal(B, 'sign', 'cloak', -5.89, 2.4, -6.5, 1.2, .11, { face: 'e' });
  P('atm', 13.6, 0, -3, { variant: 'kiosk', ry: -PI / 2 });
  for (let i = 0; i < 5; i++) { const z = -11 + i * 1.6; B.cyl(4.6, 0, z, .03, .95, { mat: 'nc_brass', sides: 8, collide: false }); B.cyl(4.6, .93, z, .05, .06, { mat: 'nc_brass', sides: 8, collide: false }); if (i < 4) box(4.6, .78, z + .8, .035, .035, 1.55, { ...nc, mat: 'nc_velvet' }); }
  boxc(-5.95, 1.0, -2.6, -5.9, 2.6, -0.4, { ...nc, mat: 'nc_mirror' });
  P('bench', -2.6, 0, -11.55, { variant: 'park', len: 1.8 });
  for (const [x, s] of [[-4.2, 'poster0'], [-1.2, 'poster1'], [12, 'poster0']]) decal(B, 'sign', s, x, 1.3, -11.89, .6, .9, { face: 'n' });
  decal(B, 'glow', 'arrow', 4.2, 2.6, -11.88, .7, .33, { face: 'n', flipU: true });
  decal(B, 'sign', 'staff', 8, 2.45, -12.11, 1.0, .1, { face: 's' });
  decal(B, 'glow', 'velvet', 4, 2.4, 0.95, 2.6, .56, { face: 's' });
  // the street-side entrance shutter (closed tonight) on the east wall
  boxc(13.88, 0, -7.2, 13.92, 2.6, -4.2, { ...nc, mat: 'corrugated' }); boxc(13.7, 2.6, -7.3, 13.9, 2.9, -4.1, { ...nc, mat: 'metal_painted' });
  B.hide(-5.2, 0, -10.0, { kind: 'closet', r: .6 });
  for (const [x, z] of [[1, -11], [7, -6], [-3, -1]]) decal(B, 'stain', 'scuff', x, .015, z, 3, 3, { ry: R() * PI });
  B.light({ x: 7, y: CG, z: -6, intensity: 9, color: [1, .75, .55], fixture: 'can' });
  for (const [x, z] of [[-2.5, -5], [-2.5, -10], [8, -2]]) { B.cyl(x, CG - .55, z, .25, .35, { ...nc, mat: 'nc_brass', sides: 14 }); B.cyl(x, CG - .56, z, .2, .03, { ...nc, mat: 'nc_led_amber', sides: 14 }); B.cyl(x, CG - .2, z, .008, .2, { ...nc, mat: 'paint_black', sides: 4 }); }
  P('light_fixture', 8, CG, -15, { variant: 'troffer', light: false });

  // ---------------------------------------------------------------- balcony + mezzanine (G)
  for (const x of [-3, 2, 7]) P('bar_stool', x, 0, 3.3, { variant: 'leather' });
  boxc(-5.8, 0.95, 3.75, 10.4, 1.0, 3.95, { ...nc, mat: 'nc_wood_bar' });
  for (const z of [6.5, 11.5, 16.5]) { P('sofa', -9, 0, z, { variant: 'teal', ry: PI / 2, seats: 3 }); P('coffee_table', -7.6, 0, z, { variant: 'glass', ry: PI / 2 }); }
  P('armchair', -14.8, 0, 9, { variant: 'mustard', ry: PI / 2 }); P('armchair', -14.8, 0, 14, { variant: 'mustard', ry: PI / 2 });
  boxc(-16.9, 0, 18.6, -12.8, 1.05, 19.4, { mat: 'nc_wood_bar' }); boxc(-16.95, 1.05, 18.55, -12.75, 1.1, 19.45, { mat: 'nc_brass', collide: false });
  P('back_bar', -14.8, 0, 21.6, { ry: PI, len: 3 });
  P('planter', -15.9, 0, 2, { len: 1.5 });
  B.hide(-16.2, 0, 20.4, { kind: 'dark', r: .6 });
  decal(B, 'glow', 'open', -16.88, 2.3, 12, 1.0, .38, { face: 'e' });
  strip(B, -16.85, CG - .1, 1.2, -16.85, CG - .1, 21.8, 'nc_led_violet', .03);
  B.light({ x: -11.5, y: CG, z: 12, intensity: 9, color: [1, .5, .7], fixture: false });
  for (const [x, z] of [[-11.5, 6], [-11.5, 12], [-11.5, 18], [5, 2.5]]) { B.cyl(x, CG - .5, z, .3, .3, { ...nc, mat: 'nc_velvet', sides: 14 }); B.cyl(x, CG - .52, z, .24, .03, { ...nc, mat: 'nc_led_amber', sides: 14 }); B.cyl(x, CG - .2, z, .008, .2, { ...nc, mat: 'paint_black', sides: 4 }); }

  // ---------------------------------------------------------------- staff room + manager office (G)
  P('lockers', -24, 0, 1.35, { n: 6, variant: 'blue', bench: true }); P('dining_table', -22, 0, 6.5, { variant: 'white', chairs: 4, w: 1.4 });
  P('sofa', -18.3, 0, 7, { variant: 'grey', ry: -PI / 2, seats: 2 }); P('fridge', -26.8, 0, 9.5, { variant: 'white', ry: PI });
  P('wall_clock', -23, 2.3, 9.88, { ry: PI }); P('poster', -19, 1.2, 1.12, { variant: 'flyer', i: 2 });
  B.hide(-27.6, 0, 1.6, { kind: 'closet', r: .6 });
  P('desk', -20.4, 0, 19.6, { variant: 'exec', ry: PI, w: 1.8 }); P('office_chair', -20.4, 0, 20.6, { variant: 'leather', ry: PI });
  P('filing_cabinet', -29.4, 0, 21.4, { variant: '4', color: 'black' }); P('filing_cabinet', -28.8, 0, 21.4, { variant: '4', color: 'black' });
  P('bookshelf', -24.6, 0, 21.7, { variant: 'walnut', w: 1.8 }); P('sofa', -29.3, 0, 16.6, { variant: 'leather', ry: PI / 2, seats: 3 });
  boxc(-29.84, 1.3, 12, -29.8, 2.3, 14.4, { ...nc, mat: 'nc_screen' }); decal(B, 'glow', 'screen', -29.78, 1.8, 13.2, 2.3, .95, { face: 'e' });
  boxc(-18.1, 0, 21.2, -17.2, 1.0, 21.8, { mat: 'p_coat_slate', surf: 'metal' });   // safe
  P('rug', -24, 0, 15.5, { variant: 'red', w: 3, d: 4 });
  decal(B, 'sign', 'office', -21.8, 2.45, 10.1, 1.2, .11, { face: 'n' });
  for (const [x0, z0, x1, z1] of [[-29.85, 10.1, -29.8, 21.85], [-29.85, 21.8, -17.1, 21.85], [-29.85, 10.1, -24, 10.15], [-20, 10.1, -17.1, 10.15]]) boxc(x0, 0, z0, x1, 1.05, z1, { ...nc, mat: 'wood_dark' });
  P('monitor', -20.9, .75, 19.3, { ry: PI }); P('monitor', -19.9, .75, 19.3, { ry: PI, on: true });
  P('planter', -18, 0, 11, { len: .9 }); P('tv', -26, 1.2, 10.15, { wall: true, on: true });
  P('coffee_table', -27.6, 0, 16.6, { variant: 'wood', ry: PI / 2 });
  boxc(-29.85, CG - .03, 10.1, -17.1, CG, 21.85, { ...nc, mat: 'ceiling_tile' }); boxc(-28.3, CG - .03, 1.1, -17.1, CG, 9.9, { ...nc, mat: 'ceiling_tile' });
  for (const z of [5.5, 13, 19]) {
    boxc(-29.86, 1.0, z - .8, -29.8, 2.3, z + .8, { ...nc, mat: 'p_glass_dark' }); decal(B, 'glow', 'blind', -29.79, 1.65, z, 1.5, 1.2, { face: 'e' });
    boxc(-29.86, .92, z - .9, -29.7, 1.0, z + .9, { ...nc, mat: 'wood_dark' }); boxc(-29.86, 2.3, z - .9, -29.8, 2.38, z + .9, { ...nc, mat: 'wood_dark' });
  }
  lamp(-23.5, CG, 16, 9, [1, .82, .62], { variant: 'troffer' });
  lamp(-23.5, CG, 5.5, 7, [.95, .97, 1]);
}
