/* LIVE FIRE — Switchback Yard (railyard): a freight classification yard of the fictional Switchback & Northern railroad at
   night in steady rain. Nine yard tracks (east-west) full of boxcars, tank cars and flatcars form lanes; an engine house with
   inspection pits and a diesel inside (site A, north-west), a fuel depot with a fueling canopy, catwalk, tank farm and pump
   house (site B, north-east); a signal tower and a footbridge over the yard (mid); yard office (T1, south) and crew bunkhouse
   (T2, north) are the team lobbies. Design notes: tools/test/out/notes-map-railyard.md (git-ignored).
   Plan (x east, z north): yard x -47..47, z -37..18; engine house x -88..-52, z 30..54; fuel depot x 46..86, z 19..54;
   yard office x -26..0, z -82..-68; bunkhouse x -10..24, z 64..80; signal tower (-58, -2); footbridge x 20.5, z -19.5..22.
   Exports: default MapDef */
import { locomotive, boxcarOpen, floodMast, bufferStop, signal, switchStand, wheelset, fuelCrane, skyline, catwalkRail, sign } from '../kit_railyard.js';

const PI = Math.PI, HP = PI / 2;
const TRK = [-35, -30, -25, -14, -9, -4, 1, 11, 16];          // yard track centres (z)
const xW = z => -47 + (z + 35) * 0.12, xE = z => 47 - (z + 35) * 0.12;   // west / east ladder lines
const RT = 0.39;                                              // rail top of a track prop
const FL = 0.1;                                               // building floors sit 10 cm above the yard
const PITCH = { box: 16.6, tank: 16.1, flat: 16.6, open: 16.6 };

// ------------------------------------------------------------------------------------------------ helpers
function wallX(B, x0, x1, z, o) {          // runs +x; o.n = north face material, o.s = south face material
  return B.wall(x0, z, x1, z, { y: o.y || 0, h: o.h, t: o.t || 0.3, mat: o.n, mat2: o.s, matEnd: o.end || o.n, uv: o.uv,
    openings: (o.ops || []).map(p => ({ at: p.c - x0, w: p.w, h: p.h, y: p.y || 0, frame: p.frame, glass: p.glass })) });
}
function wallZ(B, z0, z1, x, o) {          // runs +z; o.w = west face material, o.e = east face material
  return B.wall(x, z0, x, z1, { y: o.y || 0, h: o.h, t: o.t || 0.3, mat: o.w, mat2: o.e, matEnd: o.end || o.w, uv: o.uv,
    openings: (o.ops || []).map(p => ({ at: p.c - z0, w: p.w, h: p.h, y: p.y || 0, frame: p.frame, glass: p.glass })) });
}
/** a track along x from x0 to x1 at z (segments <= 24 m) */
// segments are 18 m plus one remainder rounded to 0.6 m (one sleeper), so a handful of kits serve every track
function segs(L) { const out = []; let u = 0; while (L - u > 18.3) { out.push(18); u += 18; } const r = Math.max(0.6, Math.round((L - u) / 0.6) * 0.6); out.push(r); return out; }
function trackX(B, x0, x1, z, y = 0, v = 'concrete') {
  let x = x0; for (const s of segs(x1 - x0)) { B.prop('track', x + s / 2, y, z, { ry: HP, len: s, variant: v }); x += s; }
}
function trackZ(B, z0, z1, x, y = 0, v = 'wood') {
  let z = z0; for (const s of segs(z1 - z0)) { B.prop('track', x, y, z + s / 2, { len: s, variant: v }); z += s; }
}
/** a straight diagonal track between two points (y lifted a little so its ballast never z-fights the tracks it crosses) */
function trackLine(B, x0, z0, x1, z1, y = 0.012, v = 'concrete') {
  const L = Math.hypot(x1 - x0, z1 - z0), ry = Math.atan2(x1 - x0, z1 - z0), ux = (x1 - x0) / L, uz = (z1 - z0) / L;
  let u = 0; for (const s of segs(L)) { B.prop('track', x0 + ux * (u + s / 2), y, z0 + uz * (u + s / 2), { ry, len: s, variant: v }); u += s; }
}
let carSeed = 0;
/** railcars along x on the track at z: list of tokens 'box:maroon', 'tank:black', 'flat:pipes', 'open:olive', or a number = gap (m).
 *  Cars with no gap token between them are coupled (an invisible blocker fills the coupling). Returns the x reached. */
function consistX(B, z, x0, list, y = 0) {
  let x = x0, prevCoupled = false;
  for (const t of list) {
    if (typeof t === 'number') { x += t; prevCoupled = false; continue; }
    const [kind, opt] = t.split(':'), p = PITCH[kind], cx = x + p / 2;
    if (kind === 'open') boxcarOpen(B, cx, y, z, { ry: HP, color: opt || 'olive', hide: true });
    else {
      const o = { ry: HP, variant: kind === 'box' ? 'boxcar' : kind === 'tank' ? 'tanker' : 'flatcar', seed: 1 + (carSeed++ % 3) };
      if (kind === 'flat') { if (opt) o.load = opt; } else if (opt) o.color = opt;
      B.prop('railcar', cx, y, z, o);
    }
    if (prevCoupled) B.collider({ cx: x, cy: y + 2.4, cz: z, hx: 0.75, hy: 2.0, hz: 1.65, surf: 'metal', ray: false });
    x += p; prevCoupled = true;
  }
  return x;
}
/** shed rails on a concrete floor (rail top at floor + .17) along x */
function shedRails(B, x0, x1, z, y = 0) {
  for (const s of [-1, 1]) {
    B.box((x0 + x1) / 2, y, z + s * 0.7535, x1 - x0, 0.15, 0.075, { mat: 'p_rail', collide: false });
    B.box((x0 + x1) / 2, y + 0.15, z + s * 0.7535, x1 - x0, 0.02, 0.06, { mat: 'p_chrome', collide: false, cast: false });
  }
}
const lamp = (B, x, y, z, o = {}) => B.light(Object.assign({ x, y, z, intensity: 14, color: [1, 0.86, 0.66], fixture: 'tube' }, o));

export default {
  id: 'railyard', name: 'Switchback Yard', size: 'L',
  desc: 'Freight rail yard at night in the rain: rows of railcars, an engine house, a fuel depot, a signal tower and a footbridge.',
  env: { time: 'night', weather: 'rain', exposure: 1.15, ambient: [0.05, 0.05, 0.065], fog: { color: [0.08, 0.075, 0.08], density: 0.011 },
    sun: { dir: [0.35, -1, 0.25], color: [0.55, 0.62, 0.85], intensity: 0.6 }, puddles: 0.8, wind: [1.5, -0.8], ambience: 'railyard', reverb: 'outdoor' },
  bounds: { minX: -98, maxX: 98, minZ: -84, maxZ: 88, minY: -3, maxY: 30 },
  chunk: 64,

  build(B) {
    // ================================================================ ground (the engine house floor is its own slab: pits)
    const G = { mat: 'gravel' };
    B.ground({ minX: -98, maxX: 98, minZ: -84, maxZ: 30, ...G });
    B.ground({ minX: -98, maxX: 98, minZ: 54, maxZ: 88, ...G });
    B.ground({ minX: -98, maxX: -88, minZ: 30, maxZ: 54, ...G });
    B.ground({ minX: -52, maxX: 98, minZ: 30, maxZ: 54, ...G });
    const road = (x0, z0, x1, z1, mat = 'asphalt_wet') => B.floor(x0, z0, x1, z1, 0.02, { mat, t: 0.06, collide: false, cast: false });
    road(-97, -50, 97, -42);                       // south service road
    road(-97, -42, -89, 63);                       // west road
    road(89, -42, 97, 63);                         // east road
    road(-89, 55.5, 89, 63);                       // north apron road
    road(-30, -67, 4, -50, 'concrete_floor');      // yard office apron
    road(-12, 63, 50, 64, 'concrete_floor');       // bunkhouse apron strip
    road(-52, 30, -30, 55.5, 'concrete_floor');    // engine house apron
    road(46, 19.5, 88, 38, 'concrete_floor');      // fuel depot pad
    road(-46, 19, 40, 24.5, 'dirt');               // north service road (yard)
    road(-48, -22.6, 44, -16.4, 'dirt');           // south lane between track groups
    road(28, 64, 52, 79, 'asphalt_wet');           // staff car park
    // kerbs along the asphalt edges near buildings
    for (const [x0, z0, x1, z1] of [[-30, -67.2, 4, -67], [-30, -50, -29.8, -67], [3.8, -50, 4, -67]]) B.boxc(x0, 0, z0, x1, 0.14, z1, { mat: 'concrete', collide: false });

    // ================================================================ perimeter (out of bounds sealed + views)
    // south: barbed chain-link along z -83 with tall weeds, an industrial street and sheds beyond
    for (let x = -97; x < 97; x += 6) B.prop('fence', x + 3, 0, -83, { variant: 'barbed', len: 6 });
    B.floor(-140, -110, 140, -84, -0.02, { mat: 'asphalt_wet', t: 0.1, collide: false });
    for (const x of [-80, -50, -20, 18, 44, 72]) B.prop('grass_tall', x, 0, -81.6, { variant: 'dry', w: 7, d: 1.6, h: 1.0 });
    skyline(B, -150, -128, 150, -128, { faces: 'n', h: 18, depth: 26, step: 22 });
    B.box(-60, 0, -96, 40, 9, 14, { mat: 'corrugated', collide: false }); B.box(-60, 9, -96, 40, 0.4, 14.6, { mat: 'metal_painted', collide: false });
    B.box(30, 0, -97, 52, 11, 16, { mat: 'concrete_panels', collide: false }); B.box(30, 11, -97, 52.6, 0.4, 16.6, { mat: 'concrete_dark', collide: false });
    // north: retaining wall and the main line on an embankment, city behind
    B.box(0, 0, 87.6, 196, 3.2, 0.8, { mat: 'concrete_panels' });
    B.box(0, 0, 97, 260, 3.2, 18, { mat: 'gravel', collide: false, cast: false });
    trackX(B, -130, 130, 92, 3.2); trackX(B, -130, 130, 97, 3.2);
    for (let x = -96; x <= 96; x += 32) B.prop('utility_pole', x, 3.2, 102, { variant: 'concrete', h: 9, ry: HP, span: 32 });
    consistX(B, 97, -60, ['tank:black', 'tank:black', 'tank:white', 'tank:black', 'tank:black'], 3.2);
    skyline(B, -170, 125, 170, 125, { faces: 's', h: 42, depth: 30, step: 18 });
    skyline(B, -120, 150, 140, 150, { faces: 's', h: 70, depth: 20, step: 26 });
    // west: retaining wall with a fence on top, a highway and the city
    B.box(-97.8, 0, 2, 0.8, 4.2, 172, { mat: 'concrete' });
    for (let z = -82; z < 86; z += 6) B.prop('fence', -97.6, 4.2, z + 3, { ry: HP, len: 6 });
    B.box(-118, 0, 2, 36, 4.2, 200, { mat: 'gravel', collide: false, cast: false });
    B.box(-112, 7, 2, 12, 1.0, 230, { mat: 'concrete_dark', collide: false });
    B.box(-106, 8, 2, 0.4, 0.9, 230, { mat: 'concrete', collide: false });
    for (let z = -100; z < 110; z += 30) B.box(-112, 4.2, z, 2, 2.8, 2, { mat: 'concrete', collide: false });
    skyline(B, -150, -120, -150, 140, { faces: 'e', h: 34, depth: 26, step: 20 });
    // east: the blind back walls of warehouses
    B.box(104, 0, 2, 12, 9, 172, { mat: 'brick_red', collide: false });
    B.box(104, 9, 2, 12.6, 0.5, 172.6, { mat: 'concrete_dark', collide: false });
    B.box(97.8, 0, 2, 0.6, 3.0, 172, { mat: 'concrete' });
    for (let z = -70; z < 80; z += 24) { B.box(97.4, 2.6, z, 0.2, 3.2, 4.2, { mat: 'corrugated_rust', collide: false }); B.box(97.6, 0, z + 9, 0.6, 9, 0.6, { mat: 'brick', collide: false }); }
    skyline(B, 140, -120, 140, 140, { faces: 'w', h: 40, depth: 24, step: 20 });

    // ================================================================ the yard: tracks, ladders, cars
    for (const z of TRK) trackX(B, xW(z), xE(z), z);
    trackLine(B, xW(-37.5), -37.5, xW(18.5), 18.5);                 // west ladder
    trackLine(B, xE(-37.5), -37.5, xE(18.5), 18.5);                 // east ladder
    trackLine(B, xW(18.5), 18.5, -36.5, 35.2, 0.016);               // lead to the engine house
    trackLine(B, xE(18.5), 18.5, 46, 27.1, 0.016);                  // lead to the fuel track
    // rows: lanes are the gaps between rows; crossings are offset row to row (no straight north-south line)
    consistX(B, -35, -46, ['box:maroon', 'box:grey', 4, 'tank:black', 'tank:black', 'tank:black', 9, 'flat:pipes']);
    consistX(B, -30, -43, [12, 'flat:logs', 'flat', 5, 'box:teal', 'box:rust', 'box:maroon']);
    consistX(B, -25, -45, ['tank:white', 'tank:white', 8, 'box:olive', 'open:teal', 6, 'box:grey']);
    consistX(B, -14, -44, ['box:rust', 'box:maroon', 'box:teal', 7, 'flat:pipes', 'flat', 2]);
    consistX(B, -9, -38, [14, 'tank:black', 'tank:black', 5, 'box:grey', 'box:olive']);
    consistX(B, -4, -45, ['flat:logs', 4, 'box:maroon', 'box:maroon', 9, 'tank:white']);
    // track 1 = the through track, kept clear (the long sightline of the yard)
    consistX(B, 11, -43, ['box:teal', 'box:grey', 10, 'open:rust', 'box:olive', 3]);
    consistX(B, 16, -36, ['tank:black', 6, 'flat:pipes', 'box:maroon', 'box:rust']);
    for (const z of TRK) { bufferStop(B, xE(z) - 0.6, 0, z, { ry: -HP }); }
    // flatcar steps (crates / pallets to climb onto the decks)
    for (const [x, z] of [[-42.5, -27.7], [-26.2, -27.6], [-1.2, -11.6], [-24.6, -6.4], [9.0, -32.6]]) B.prop('crate', x, 0, z, { variant: 'large', ry: 0.1 });
    // track numbers and switch stands at the west throat
    TRK.forEach((z, i) => { switchStand(B, xW(z) + 3, z - 2.3, {}); B.box(xW(z) + 1.2, 0, z - 2.4, 0.08, 1.6, 0.08, { mat: 'steel_dark', collide: false }); sign(B, 'trk' + (i + 1), xW(z) + 1.15, 1.75, z - 2.4, 0.42, 0.42, { face: 'w' }); });
    signal(B, xW(-14) - 3.5, -18.5, { aspect: 'red', ry: HP }); signal(B, xW(11) - 3, 7.5, { aspect: 'green', ry: HP });
    signal(B, xE(1) + 2.5, 3.6, { dwarf: true, aspect: 'red', ry: -HP }); signal(B, xE(-25) + 2.8, -21.5, { dwarf: true, aspect: 'amber', ry: -HP });
    // floodlight masts (the main light of the yard)
    floodMast(B, -20, -19.5, { ry: 0.6, aim: 22, intensity: 950 });
    floodMast(B, 27, 6, { ry: -2.2, aim: 24, intensity: 950 });
    floodMast(B, -40, 52, { ry: -1.9, aim: 16, intensity: 650 });
    floodMast(B, 87.5, 36, { ry: -1.75, aim: 24, intensity: 850 });
    floodMast(B, -6, -59, { ry: -0.25, aim: 20, intensity: 700 });
    floodMast(B, 62, -27, { ry: -0.6, aim: 26, intensity: 800 });

    // ================================================================ T1: yard office (south)
    {
      const x0 = -26, x1 = 0, z0 = -82, z1 = -68, h1 = 3.4, h2 = 3.2, top = FL + h1 + 0.25 + h2;
      B.floor(x0, z0, x1, z1, FL, { mat: 'tile_floor', t: 0.3 });
      // outer walls (two storeys in one go), gates in the north wall, a door + windows on the east
      wallX(B, x0, x1, z1, { h: top, n: 'brick', s: 'plaster', end: 'brick', ops: [
        { c: -20, w: 2.8, h: 2.9, y: FL, frame: 'steel_dark' }, { c: -13, w: 2.8, h: 2.9, y: FL, frame: 'steel_dark' },
        { c: -4, w: 1.6, h: 1.3, y: FL + 1.0, frame: 'steel_dark', glass: true },
        { c: -20, w: 2.2, h: 1.4, y: FL + h1 + 1.1, frame: 'steel_dark', glass: true }, { c: -13, w: 2.2, h: 1.4, y: FL + h1 + 1.1, frame: 'steel_dark', glass: true },
        { c: -5, w: 2.2, h: 1.4, y: FL + h1 + 1.1, frame: 'steel_dark', glass: true }] });
      wallX(B, x0, x1, z0, { h: top, n: 'plaster', s: 'brick', end: 'brick', ops: [{ c: -4, w: 1.6, h: 1.3, y: FL + 1.0, frame: 'steel_dark', glass: true }] });
      wallZ(B, z0 + 0.15, z1 - 0.15, x0, { h: top, w: 'brick', e: 'plaster' });
      wallZ(B, z0 + 0.15, z1 - 0.15, x1, { h: top, w: 'plaster', e: 'brick', ops: [{ c: -74, w: 1.1, h: 2.2, y: FL, frame: 'steel_dark' }, { c: -78.5, w: 1.6, h: 1.3, y: FL + 1.0, frame: 'steel_dark', glass: true }] });
      // partition between the lobby (crew room) and the dispatcher office
      wallZ(B, z0 + 0.15, z1 - 0.15, -8, { h: h1 + 0.2, y: FL, w: 'plaster_white', e: 'plaster_white', t: 0.2 });
      // ceiling / upper floor slab (sealed upper storey: lit windows only), roof with a parapet
      B.box((x0 + x1) / 2, FL + h1, (z0 + z1) / 2, x1 - x0 - 0.6, 0.25, z1 - z0 - 0.6, { mat: 'concrete', mats: { b: 'ceiling_tile' } });
      B.box((x0 + x1) / 2, top, (z0 + z1) / 2, x1 - x0, 0.3, z1 - z0, { mat: 'concrete_dark' });
      for (const [cx, cz, w, d] of [[(x0 + x1) / 2, z0 + 0.1, x1 - x0, 0.2], [(x0 + x1) / 2, z1 - 0.1, x1 - x0, 0.2], [x0 + 0.1, (z0 + z1) / 2, 0.2, z1 - z0], [x1 - 0.1, (z0 + z1) / 2, 0.2, z1 - z0]])
        B.box(cx, top + 0.3, cz, w, 0.7, d, { mat: 'concrete' });
      B.prop('ac_unit', -18, top + 0.3, -76, { variant: 'hvac' }); B.prop('ac_unit', -6, top + 0.3, -73, { variant: 'condenser' }); B.prop('vent', -10, top + 0.3, -79, { variant: 'mushroom' });
      sign(B, 'office', -16.5, FL + h1 - 0.15, -67.82, 3.6, 0.9, { lit: true });
      // upper storey lit windows seen from outside (blinds)
      for (const c of [-20, -13, -5]) sign(B, 'winlit', c, FL + h1 + 1.8, -67.95, 2.1, 1.3, { glow: true });
      lamp(B, -21, FL + h1, -74.5, { intensity: 12 }); lamp(B, -13, FL + h1, -74.5, { intensity: 12 });
      // lobby furniture (crew room): lockers, benches, a table, notice board, vending machine
      B.prop('lockers', -25.4, FL, -76, { ry: HP, n: 6, variant: 'grey', bench: true });
      B.prop('lockers', -25.4, FL, -71.5, { ry: HP, n: 4, variant: 'blue' });
      B.prop('dining_table', -16.5, FL, -78.6, { variant: 'set', chairs: 4, w: 2.2 });
      B.prop('vending_machine', -9.0, FL, -80.9, { variant: 'drinks', ry: 0 });
      B.prop('whiteboard', -16.5, FL + 1.0, -81.82, { w: 2.4 });
      B.prop('wall_clock', -12, FL + 2.5, -81.82, {});
      B.prop('fire_extinguisher', -8.3, FL, -70, { ry: -HP });
      B.prop('poster', -22.5, FL + 1.3, -81.82, { i: 2 });
      // dispatcher office (east, reachable from outside): desks, consoles, filing cabinets, a closet
      B.prop('control_console', -3.8, FL, -80.8, { len: 3.2 });
      B.prop('desk', -4.5, FL, -72.0, { variant: 'metal', ry: PI });
      B.prop('office_chair', -4.5, FL, -73.0, { ry: 0 });
      B.prop('filing_cabinet', -7.5, FL, -69.0, { variant: '4', ry: PI });
      B.prop('wardrobe', -7.4, FL, -77.0, { variant: 'large', ry: HP });
      B.hide(-7.4, FL, -77.0, { kind: 'closet', r: 0.6 });
      B.prop('light_fixture', -4, FL + h1, -76, { variant: 'troffer' });
      // lobby: 15 spawns facing the gates, buy zone = the room
      B.lobby(1, { x0: -25.7, z0: -81.7, x1: -8.2, z1: -68.3, y: FL }, [
        { x: -20, z: -68, w: 2.8, h: 2.9, y: FL }, { x: -13, z: -68, w: 2.8, h: 2.9, y: FL }]);
      for (let i = 0; i < 5; i++) for (let j = 0; j < 3; j++) B.spawn(1, -22.5 + i * 2.6, FL, -75.6 + j * 1.9, 0);
    }

    // ================================================================ T2: crew bunkhouse (north)
    {
      const x0 = -10, x1 = 24, z0 = 64, z1 = 80, h = 3.3;
      B.floor(x0, z0, x1, z1, FL, { mat: 'wood_floor', t: 0.3 });
      wallX(B, x0, x1, z0, { h: h + FL, n: 'plaster', s: 'wood_siding', end: 'wood_siding', ops: [
        { c: -4, w: 2.8, h: 2.9, y: FL, frame: 'steel_dark' }, { c: 3.5, w: 2.8, h: 2.9, y: FL, frame: 'steel_dark' },
        { c: 16, w: 1.0, h: 2.15, y: FL, frame: 'wood_dark' }, { c: 11, w: 1.3, h: 1.2, y: FL + 1.0, frame: 'wood_dark', glass: true }, { c: 21, w: 1.3, h: 1.2, y: FL + 1.0, frame: 'wood_dark', glass: true }] });
      wallX(B, x0, x1, z1, { h: h + FL, n: 'wood_siding', s: 'plaster', end: 'wood_siding' });
      wallZ(B, z0 + 0.15, z1 - 0.15, x0, { h: h + FL, w: 'wood_siding', e: 'plaster' });
      wallZ(B, z0 + 0.15, z1 - 0.15, x1, { h: h + FL, w: 'plaster', e: 'wood_siding', ops: [{ c: 70, w: 1.0, h: 2.15, y: FL, frame: 'wood_dark' }] });
      // common room (lobby) | corridor + bunk rooms + washroom
      wallZ(B, z0 + 0.15, z1 - 0.15, 8, { h: h, y: FL, w: 'plaster', e: 'plaster', t: 0.2 });
      wallX(B, 8.1, x1 - 0.15, 72.5, { h: h, y: FL, n: 'plaster', s: 'plaster', t: 0.2, ops: [{ c: 12, w: 0.9, h: 2.1, y: FL, frame: 'wood_dark' }, { c: 20, w: 0.9, h: 2.1, y: FL, frame: 'wood_dark' }] });
      wallZ(B, 72.6, z1 - 0.15, 16, { h: h, y: FL, w: 'plaster', e: 'plaster', t: 0.2 });
      B.box((x0 + x1) / 2, FL + h, (z0 + z1) / 2, x1 - x0, 0.3, z1 - z0, { mat: 'concrete_dark', mats: { b: 'ceiling_tile' } });
      for (let i = 0; i < 4; i++) B.box(x0 + 1 + i * 11, FL + h + 0.3, 72, 0.1, 0.25, 16, { mat: 'steel_dark', collide: false });
      B.prop('ac_unit', 4, FL + h + 0.3, 75, { variant: 'hvac' }); B.prop('vent', 18, FL + h + 0.3, 70, { variant: 'box' });
      sign(B, 'bunk', -0.3, FL + h - 0.15, 63.82, 3.6, 0.9, { face: 's', lit: true });
      lamp(B, -5, FL + h, 72, { intensity: 11 }); lamp(B, 3, FL + h, 72, { intensity: 11 });
      // common room: sofas, a TV, kitchenette, table, lockers
      B.prop('sofa', -6.5, FL, 77.6, { variant: 'brown', ry: PI }); B.prop('sofa', -8.9, FL, 74.5, { variant: 'charcoal', ry: HP, seats: 2 });
      B.prop('coffee_table', -6.5, FL, 76.0, { variant: 'wood' }); B.prop('tv', -6.5, FL, 79.4, { ry: PI, on: true });
      B.prop('kitchen_counter', 3.5, FL, 79.5, { variant: 'grey', ry: PI, len: 4.2, sink: 1, hob: 3 }); B.prop('fridge', 6.9, FL, 79.3, { ry: PI });
      B.prop('dining_table', 2.5, FL, 75.6, { variant: 'set', chairs: 6, w: 2.2 });
      B.prop('lockers', 7.6, FL, 68, { ry: -HP, n: 6, variant: 'green', bench: true });
      B.prop('wall_clock', -1, FL + 2.4, 79.82, { ry: PI }); B.prop('poster', 0.5, FL + 1.3, 79.82, { ry: PI, i: 4 });
      // bunk rooms and washroom (outside the lobby: hides)
      B.prop('bed', 10.2, FL, 76.5, { variant: 'bunk', ry: HP }); B.prop('bed', 13.8, FL, 78.4, { variant: 'bunk', ry: -HP });
      B.prop('wardrobe', 15.45, FL, 74.0, { variant: 'large', ry: -HP });
      B.prop('bed', 18.2, FL, 78.4, { variant: 'bunk', ry: HP }); B.prop('bed', 22.5, FL, 76.4, { variant: 'bunk', ry: -HP });
      B.prop('toilet_stall', 13.0, FL, 65.25, { n: 3, ry: 0 }); B.prop('sink', 18.6, FL, 64.45, { n: 2 });
      B.hide(15.3, FL, 74.0, { kind: 'closet', r: 0.6 }); B.hide(18.2, FL, 78.4, { kind: 'under', r: 0.7 });
      lamp(B, 16, FL + h, 68.5, { intensity: 6, flicker: 0.4 });
      B.lobby(2, { x0: -9.75, z0: 64.3, x1: 7.8, z1: 79.7, y: FL }, [{ x: -4, z: 64, w: 2.8, h: 2.9, y: FL }, { x: 3.5, z: 64, w: 2.8, h: 2.9, y: FL }]);
      for (let i = 0; i < 5; i++) for (let j = 0; j < 3; j++) B.spawn(2, -7.2 + i * 2.6, FL, 66.6 + j * 2.2, PI);
    }

    // ================================================================ A: engine house (north-west)
    {
      const x0 = -88, x1 = -52, z0 = 30, z1 = 54, H = 9.5, t = 0.5;
      // floor slab with two inspection pits (roads 1 and 2), 1.3 m deep, steps at both ends
      const pits = [35, 42], px0 = -77, px1 = -57, slabT = 1.6;
      const slab = (a, b, c, d) => B.floor(a, b, c, d, 0, { mat: 'concrete_floor', t: slabT });
      slab(x0, z0, x1, 34.5); slab(x0, 35.5, x1, 41.5); slab(x0, 42.5, x1, z1);
      for (const pz of pits) { slab(x0, pz - 0.5, px0, pz + 0.5); slab(px1, pz - 0.5, x1, pz + 0.5); }
      for (const pz of pits) {
        B.floor(px0, pz - 0.5, px1, pz + 0.5, -1.3, { mat: 'concrete_dark', t: 0.3 });
        B.stairs({ x: px0 + 1.3, z: pz, w: 0.98, len: 2.6, y0: -1.3, y1: 0, dir: '-x', mat: 'concrete_dark', rail: false });
        B.stairs({ x: px1 - 1.3, z: pz, w: 0.98, len: 2.6, y0: -1.3, y1: 0, dir: '+x', mat: 'concrete_dark', rail: false });
        for (let x = px0 + 3; x < px1 - 3; x += 4) B.box(x, -1.2, pz - 0.48, 0.25, 0.12, 0.04, { mat: 'emissive_warm', collide: false, cast: false });   // pit lights
      }
      // walls: brick outside, whitewashed brick inside; big track doors east, workshop doors south, back doors north
      const OUT = 'brick_red', IN = 'brick';
      wallX(B, x0, x1, z0 + t / 2, { h: H, t, n: IN, s: OUT, ops: [{ c: -80, w: 1.2, h: 2.2, frame: 'steel_dark' }, { c: -68, w: 3.2, h: 3.6, frame: 'steel_dark' },
        ...[-84, -74, -62, -56].map(c => ({ c, w: 3.2, h: 3.0, y: 5.2, frame: 'steel_dark', glass: true }))] });
      wallX(B, x0, x1, z1 - t / 2, { h: H, t, n: OUT, s: IN, ops: [{ c: -74, w: 3.0, h: 3.4, frame: 'steel_dark' }, { c: -60, w: 1.2, h: 2.2, frame: 'steel_dark' },
        ...[-84, -67, -56].map(c => ({ c, w: 3.2, h: 3.0, y: 5.2, frame: 'steel_dark', glass: true }))] });
      wallZ(B, z0 + t, z1 - t, x0 + t / 2, { h: H, t, w: OUT, e: IN, ops: [36, 48].map(c => ({ c, w: 3.2, h: 3.0, y: 5.2, frame: 'steel_dark', glass: true })) });
      wallZ(B, z0 + t, z1 - t, x1 - t / 2, { h: H, t, w: IN, e: OUT, ops: [{ c: 35, w: 4.6, h: 5.8, frame: 'steel_dark' }, { c: 42, w: 4.6, h: 5.8, frame: 'steel_dark' }, { c: 49, w: 4.6, h: 5.8, frame: 'steel_dark' }] });
      B.box(x1 - 0.3, 0, 49, 0.12, 5.8, 4.6, { mat: 'corrugated' });                    // road 3 door shut
      B.box(x1 + 0.25, 5.8, 49, 0.5, 0.6, 5.2, { mat: 'metal_painted', collide: false });
      for (const c of [35, 42]) B.box(x1 + 0.25, 5.8, c, 0.5, 0.6, 5.2, { mat: 'metal_painted', collide: false });
      // pilasters outside, a dado band inside
      for (const x of [-79.5, -71, -63]) B.box(x, 0, z1 + 0.15, 0.7, H + 0.3, 0.3, { mat: OUT });
      B.box(-59, 0, z0 - 0.15, 0.7, H + 0.3, 0.3, { mat: OUT });
      for (const z of [33, 41.5, 52]) B.box(x0 - 0.15, 0, z, 0.3, H + 0.3, 0.7, { mat: OUT });
      // roof: two flat bays and a glazed monitor along the middle; steel trusses
      B.box((x0 + x1) / 2, H, 34.25, x1 - x0, 0.35, 8.5, { mat: 'corrugated', mats: { b: 'steel_dark' } });
      B.box((x0 + x1) / 2, H, 49.75, x1 - x0, 0.35, 8.5, { mat: 'corrugated', mats: { b: 'steel_dark' } });
      for (const z of [38.6, 45.4]) { B.box((x0 + x1) / 2, H, z, x1 - x0, 1.9, 0.2, { mat: 'glass', collide: false, cast: false }); B.box((x0 + x1) / 2, H + 1.9, z, x1 - x0, 0.15, 0.3, { mat: 'steel_dark', collide: false }); }
      B.box((x0 + x1) / 2, H + 2.0, 42, x1 - x0, 0.3, 7.6, { mat: 'corrugated', mats: { b: 'steel_dark' } });
      B.collider({ cx: (x0 + x1) / 2, cy: H + 1.0, cz: 42, hx: (x1 - x0) / 2, hy: 1.0, hz: 3.4, surf: 'metal' });   // monitor keeps the rain out
      for (let x = x0 + 4; x < x1; x += 6) { B.box(x, H - 0.7, 42, 0.25, 0.7, z1 - z0 - 1, { mat: 'steel_dark', collide: false }); B.box(x, H - 0.1, 42, 0.3, 0.1, z1 - z0 - 1, { mat: 'steel_dark', collide: false }); }
      for (const z of [36, 48]) B.box((x0 + x1) / 2, H - 0.5, z, x1 - x0 - 1, 0.3, 0.2, { mat: 'steel_dark', collide: false });
      // shed rails (road 1, 2 over the pits; road 3 on the floor) running out onto the apron
      for (const z of [35, 42, 49]) shedRails(B, -79, x1, z);
      for (const z of [35, 42, 49]) bufferStop(B, -78.6, 0.17 - RT, z, { ry: HP, railTop: RT });
      // the loco on road 2 (over the pit), a boxcar on road 1, workbenches along road 3
      locomotive(B, -66, 0, 42, { ry: -HP, num: 'locoA' });
      B.prop('railcar', -63.5, 0.17 - RT, 35, { ry: HP, variant: 'boxcar', color: 'rust', seed: 2 });
      // mezzanine (west end, 3.6 m): stores below, foreman's office + gallery above, stair along the north wall
      const MZ = 3.6, mx = -80;
      B.floor(x0 + t, z0 + t, mx, z1 - t, MZ, { mat: 'metal_plate', t: 0.25, mats: { b: 'steel_dark' } });
      wallZ(B, z0 + t, 50.4, mx - 0.1, { h: MZ - 0.25, t: 0.2, w: 'plaster', e: 'concrete_panels', ops: [{ c: 37, w: 1.1, h: 2.2, frame: 'steel_dark' }, { c: 45, w: 1.1, h: 2.2, frame: 'steel_dark' }] });
      wallX(B, x0 + t, mx - 0.2, 41, { h: MZ - 0.25, t: 0.2, n: 'plaster', s: 'plaster' });
      B.stairs({ x: -77.2, z: 52.6, w: 1.4, len: 5.6, y0: 0, y1: MZ, dir: '-x', mat: 'steel_dark', tread: 'metal_plate', rail: 'right' });
      catwalkRail(B, mx, 30.5, mx, 51.6, MZ, {});
      B.room({ x: -83.9, z: 34.5, w: 7.2, d: 8, y: MZ, h: 2.8, t: 0.12, wall: 'plaster_white', outer: 'paint_white', ceil: 'ceiling_tile', frames: 'steel_dark',
        doors: { n: [{ at: 5.5, w: 0.9, h: 2.1 }] }, windows: { e: [{ at: 2.5, w: 3.0, h: 1.1, y: 1.0, glass: true }, { at: 6.0, w: 2.0, h: 1.1, y: 1.0, glass: true }], n: [{ at: 2.5, w: 2.0, h: 1.1, y: 1.0, glass: true }] } });
      B.prop('desk', -84.5, MZ, 33.4, { variant: 'metal' }); B.prop('filing_cabinet', -87.3, MZ, 37.0, { ry: HP }); B.prop('office_chair', -84.5, MZ, 34.4, { ry: PI });
      B.prop('shelf_unit', -86.0, MZ, 52.9, { variant: 'grey' }); B.prop('shelf_unit', -84.6, MZ, 52.9, { variant: 'grey' }); B.prop('cardboard_box', -82.5, MZ, 51.5, { variant: 'pile', n: 5 });
      B.prop('shelf_unit', -87.2, 0, 32.5, { variant: 'dark', ry: HP }); B.prop('shelf_unit', -87.2, 0, 34.0, { variant: 'dark', ry: HP }); B.prop('drum', -82, 0, 39.5, { n: 3, variant: 'blue' });
      B.prop('rack', -84, 0, 47.8, { bays: 2, levels: 2, lh: 1.5, load: 0.8 });
      B.hide(-86.4, 0, 39.6, { kind: 'dark', r: 0.7 });
      // floor dressing: workbenches, a wheelset on stands, drums, pallets, a forklift, the sand pipes over road 3
      B.box(-70, 0, 52.9, 6, 0.9, 0.8, { mat: 'steel_dark' }); B.box(-70, 0.9, 52.9, 6.1, 0.05, 0.85, { mat: 'wood_dark' });
      B.prop('shelf_unit', -63.5, 0, 53.2, { variant: 'grey' }); B.prop('gas_cylinder', -61.2, 0, 53.3, { rack: true, ry: PI });
      wheelset(B, -64, 0, 49.6, { ry: 0 }); wheelset(B, -61, 0, 49.6, { ry: 0 });
      B.prop('pallet', -56.5, 0, 46.2, { variant: 'drums', ry: 0.2 }); B.prop('pallet', -56.4, 0, 51.6, { variant: 'boxes', stack: 2 });
      B.prop('forklift', -71.5, 0, 46.6, { ry: HP, variant: 'yellow' });
      B.prop('drum', -58.3, 0, 38.6, { n: 2, variant: 'red', fallen: true });
      B.prop('ibc_tank', -76, 0, 31.4, {}); B.prop('ibc_tank', -74.6, 0, 31.4, { variant: 'blue' });
      for (const x of [-72, -64, -56]) B.prop('light_fixture', x, H - 0.75, 45.5, { variant: 'highbay', drop: 1.2 });
      lamp(B, -68, H - 2.2, 38.5, { intensity: 34, fixture: false, type: 'spot', angle: 1.5, range: 18 });
      lamp(B, -60, H - 2.2, 45.5, { intensity: 34, fixture: false, type: 'spot', angle: 1.5, range: 18 });
      lamp(B, -73, H - 2.2, 47.5, { intensity: 26, fixture: false, type: 'spot', angle: 1.5, range: 18 });
      for (const x of [-72, -64]) B.prop('light_fixture', x, H - 0.75, 38.5, { variant: 'highbay', drop: 1.2 });
      sign(B, 'siteA', -55.5, 3.8, 53.68, 1.6, 1.6, { face: 's' });
      sign(B, 'siteA', x0 + t + 0.02, 2.0, 44, 1.4, 1.4, { face: 'e' });
      sign(B, 'blue', -56.4, 1.6, 30.53, 0.8, 0.4, { face: 'n' });
      sign(B, 'shed', -70, 7.0, 29.83, 9, 2.25, { face: 's' });
      B.site('A', { x0: -77, z0: 32, x1: -55, z1: 52, y: 0 });
      B.hide(-66, -1.3, 42, { kind: 'under', r: 0.6 });
      B.hostage(-84.5, 0, 31.5);
      // workshop lean-to on the south side (A main)
      const wz0 = 22, wh = 4.6;
      B.floor(x0, wz0, -62, z0, FL, { mat: 'concrete_floor', t: 0.3 });
      wallX(B, x0, -62, wz0, { h: wh, t: 0.3, n: 'concrete_panels', s: 'corrugated', end: 'corrugated', ops: [{ c: -76, w: 3.4, h: 3.4, y: FL, frame: 'steel_dark' }, { c: -66.5, w: 1.1, h: 2.2, y: FL, frame: 'steel_dark' }, { c: -83, w: 2.4, h: 1.0, y: 2.2, frame: 'steel_dark', glass: true }] });
      wallZ(B, wz0 + 0.15, z0, x0 + 0.15, { h: wh, t: 0.3, w: 'corrugated', e: 'concrete_panels', ops: [{ c: 26, w: 1.1, h: 2.2, y: FL, frame: 'steel_dark' }] });
      wallZ(B, wz0 + 0.15, z0, -62.15, { h: wh, t: 0.3, w: 'concrete_panels', e: 'corrugated', ops: [{ c: 26, w: 2.0, h: 1.0, y: 2.0, frame: 'steel_dark', glass: true }] });
      B.box(-75, wh, 26, 26.4, 0.25, 8.6, { mat: 'corrugated', mats: { b: 'steel_dark' } });
      B.box(-75.8, 0, 29.3, 4, 0.92, 0.9, { mat: 'steel_dark' }); B.box(-75.8, 0.92, 29.3, 4.1, 0.06, 0.95, { mat: 'wood_dark' });
      B.box(-86.5, 0, 26.5, 1.2, 1.6, 0.9, { mat: 'paint_green' });       // pillar drill / cabinet
      B.prop('shelf_unit', -63.2, FL, 23.0, { variant: 'grey' }); B.prop('shelf_unit', -64.6, FL, 23.0, { variant: 'grey' });
      B.prop('gas_cylinder', -71.5, FL, 29.4, { n: 3, variant: 'oxygen' }); B.prop('generator', -84.0, FL, 23.4, { variant: 'portable' });
      B.prop('pallet', -69.5, FL, 23.5, { variant: 'cylinders' }); B.prop('drum', -87.1, FL, 29.2, { n: 2, variant: 'black' });
      lamp(B, -75, wh, 26, { intensity: 10 });
      sign(B, 'blue', -76, 3.6, 21.82, 1.0, 0.5, { face: 's' });
    }

    // ================================================================ A apron, sand tower, west field, signal tower
    {
      for (const z of [35, 42]) trackX(B, -52, -36.5, z, 0, 'wood');
      trackX(B, -52, -46, 49, 0, 'wood');
      trackLine(B, -36.5, 35.2, -46.5, 49.4, 0.02, 'wood');
      switchStand(B, -38.5, 37.6, {}); switchStand(B, -43.0, 44.0, {});
      signal(B, -47.5, 32.4, { dwarf: true, aspect: 'red', ry: HP });
      // sand tower: hopper on four legs with a delivery spout over road 1 and 2
      {
        const sx = -44, sz = 52.5;
        for (const [dx, dz] of [[-1.6, -1.2], [1.6, -1.2], [-1.6, 1.2], [1.6, 1.2]]) B.box(sx + dx, 0, sz + dz, 0.3, 7, 0.3, { mat: 'steel_dark' });
        B.cyl(sx, 7, sz, 1.9, 3.2, { mat: 'metal_painted', sides: 14 }); B.cyl(sx, 6.2, sz, 0.6, 0.8, { mat: 'metal_painted', sides: 10, collide: false });
        B.box(sx, 10.2, sz, 4.2, 0.2, 4.2, { mat: 'corrugated', collide: false });
        B.box(sx - 3, 6.5, sz - 2.4, 6, 0.25, 0.25, { mat: 'steel_dark', collide: false }); B.box(sx - 5.6, 5.2, sz - 2.4, 0.2, 1.4, 0.2, { mat: 'steel_dark', collide: false });
        B.box(sx, 0, sz + 2.6, 4, 1.6, 2, { mat: 'concrete' });          // sand bin
        B.prop('ladder', sx + 1.9, 0, sz, { h: 7, ry: HP, variant: 'galv', cage: true });
      }
      // west field: a storage track along z with dead cars (splits the west road from the yard throat)
      trackZ(B, -40, 18, -74);
      B.prop('railcar', -74, 0, -30.5, { variant: 'boxcar', color: 'rust', seed: 3 });
      B.prop('railcar', -74, 0, -13.9, { variant: 'boxcar', color: 'olive', seed: 1 });
      B.collider({ cx: -74, cy: 2.4, cz: -22.2, hx: 1.0, hy: 2.0, hz: 0.75, surf: 'metal', ray: false });
      B.prop('railcar', -74, 0, 9.0, { variant: 'flatcar', load: 'logs', seed: 2 });
      bufferStop(B, -74, 0, 17.4, { ry: PI }); bufferStop(B, -74, 0, -39.4, { ry: 0 });
      // material stacks: sleepers, rails, ballast heaps
      for (const [x, z, r] of [[-84, -18, 0], [-85, -6, 0.1], [-62, 10, 1.6], [-82, 8, 0]]) {
        B.box(x, 0, z, 2.6, 0.6, 4.4, { mat: 'p_wood_sleeper', ry: r }); B.box(x, 0.6, z, 2.6, 0.5, 3.6, { mat: 'p_wood_sleeper', ry: r + 0.03 });
      }
      for (const [x, z] of [[-64, -32], [-86, 16]]) { B.box(x, 0, z, 1.6, 0.35, 12, { mat: 'p_rail' }); B.box(x, 0.35, z, 1.2, 0.17, 12, { mat: 'p_rail', collide: false }); }
      B.prop('rock', -62, 0, -10, { variant: 'cluster' }); B.prop('container', -84, 0, -30, { variant: 'rust', doors: 'open', ry: 0.05 });
      B.hide(-84, 0, -30.8, { kind: 'closet', r: 0.7 });
      B.prop('grass_tall', -94, 0, -26, { variant: 'dry', w: 3, d: 8, h: 1.1 }); B.hide(-94, 0, -26, { kind: 'grass' });
      B.prop('dumpster', -86.5, 0, 19.5, { variant: 'green', ry: HP }); B.hide(-86.6, 0, 18, { kind: 'crates', r: 0.6 });
      // signal tower at the west throat: relay room, equipment floor, operator cabin at 6.4 m, external stairs
      {
        const tx = -58, tz = -2, F1 = 3.2, F2 = 6.4;
        B.room({ x: tx, z: tz, w: 6, d: 5, y: FL, h: F1 - FL, t: 0.25, wall: 'plaster', outer: 'brick_red', floor: 'concrete_floor', frames: 'steel_dark', doors: { e: [{ at: 1.5, w: 1.0, h: 2.1 }] }, windows: { s: [{ at: 3.0, w: 1.0, h: 0.9, y: 1.2, glass: true }] } });
        B.floor(tx - 3, tz - 2.5, tx + 3, tz + 2.5, F1, { mat: 'concrete', t: 0.25, mats: { b: 'concrete' } });
        B.room({ x: tx, z: tz, w: 6, d: 5, y: F1, h: F2 - F1, t: 0.25, wall: 'plaster', outer: 'brick_red', frames: 'steel_dark', windows: { e: [{ at: 2.5, w: 1.0, h: 0.9, y: 1.2, glass: true }] } });
        B.floor(tx - 3, tz - 2.5, tx + 3, tz + 2.5, F2, { mat: 'wood_floor', t: 0.25, mats: { b: 'concrete' } });
        B.room({ x: tx, z: tz, w: 6, d: 5, y: F2, h: 2.8, t: 0.2, wall: 'wood_siding', outer: 'wood_siding', ceil: 'wood_planks', roof: 'concrete_dark', frames: 'wood_dark',
          doors: { n: [{ at: 5.0, w: 0.9, h: 2.1 }] },
          windows: { e: [{ at: 1.3, w: 1.6, h: 1.1, y: 1.0, glass: true }, { at: 3.6, w: 1.6, h: 1.1, y: 1.0, glass: true }], n: [{ at: 1.8, w: 2.2, h: 1.1, y: 1.0, glass: true }, { at: 4.4, w: 1.6, h: 1.1, y: 1.0, glass: true }], s: [{ at: 2.0, w: 2.2, h: 1.1, y: 1.0, glass: true }, { at: 4.6, w: 1.4, h: 1.1, y: 1.0, glass: true }] } });
        B.box(tx, F2 + 3.0, tz, 7.2, 0.15, 6.2, { mat: 'metal_painted', collide: false });   // eaves
        // stairs: flight 1 up the west side to a landing at the north-west corner (F1), flight 2 east along the north side
        // to a landing at the cabin door (F2)
        B.stairs({ x: tx - 3.7, z: tz - 1.0, w: 1.2, len: 5.2, y0: 0, y1: F1, dir: '+z', mat: 'steel_dark', tread: 'grate', rail: 'left' });
        B.floor(tx - 4.3, tz + 1.6, tx - 3.05, tz + 3.6, F1, { mat: 'grate', t: 0.1 });
        B.stairs({ x: tx - 0.8, z: tz + 3.1, w: 1.0, len: 4.5, y0: F1, y1: F2, dir: '+x', mat: 'steel_dark', tread: 'grate', rail: 'left' });
        B.floor(tx + 1.45, tz + 2.6, tx + 3.0, tz + 3.6, F2, { mat: 'grate', t: 0.1 });
        catwalkRail(B, tx - 4.3, tz + 3.6, tx - 3.05, tz + 3.6, F1); catwalkRail(B, tx - 4.3, tz + 1.6, tx - 4.3, tz + 3.6, F1);
        catwalkRail(B, tx + 1.45, tz + 3.6, tx + 3.0, tz + 3.6, F2); catwalkRail(B, tx + 3.0, tz + 2.6, tx + 3.0, tz + 3.6, F2);
        B.prop('control_console', tx + 1.6, F2, tz - 0.2, { len: 2.4, ry: -HP }); B.prop('office_chair', tx + 0.6, F2, tz - 0.2, { ry: HP });
        B.prop('desk', tx - 1.6, F2, tz + 1.6, { variant: 'metal', ry: PI, w: 1.2 }); B.prop('filing_cabinet', tx - 2.6, F2, tz - 2.0, { ry: HP });
        B.prop('server_rack', tx + 2.4, FL, tz + 1.4, { n: 3, ry: -HP }); B.prop('shelf_unit', tx - 2.5, FL, tz - 1.6, { ry: HP });
        sign(B, 'yard', tx, F2 + 3.3, tz + 2.62, 3.2, 0.8, { lit: true });
        lamp(B, tx, F2 + 2.8, tz, { intensity: 6, fixture: 'panel', color: [1, 0.8, 0.6] });
        B.hostage(tx + 1.0, FL, tz - 1.2);
        B.hide(tx - 2.2, FL, tz + 1.4, { kind: 'dark', r: 0.6 });
      }
    }

    // ================================================================ footbridge over the yard (x 20.5)
    {
      const bx = 20.5, Y = 6.8, z0 = -19.5, z1 = 22.0;
      B.box(bx, Y - 0.35, (z0 + z1) / 2, 2.0, 0.35, z1 - z0 + 1.6, { mat: 'steel_dark', mats: { t: 'grate' } });
      // sides: the west side opens at the south landing (stair from the west), the east side at the north landing
      for (const [s, za, zb] of [[-1, z0 + 0.6, z1 + 0.8], [1, z0 - 0.8, z1 - 0.6]]) {
        B.box(bx + s * 0.95, Y, (za + zb) / 2, 0.08, 1.1, zb - za, { mat: 'metal_painted' });                       // solid lower sides
        B.box(bx + s * 0.95, Y + 1.1, (za + zb) / 2, 0.05, 0.9, zb - za, { mat: 'chainlink', ray: false });         // mesh above
        B.box(bx + s * 0.95, Y + 2.0, (za + zb) / 2, 0.1, 0.1, zb - za, { mat: 'steel_dark', collide: false });
        for (let z = za; z <= zb + 0.01; z += (zb - za) / Math.round((zb - za) / 3.6)) B.box(bx + s * 0.95, Y, z, 0.12, 2.1, 0.12, { mat: 'steel_dark', collide: false });
      }
      B.box(bx, Y - 1.1, (z0 + z1) / 2, 0.4, 0.75, z1 - z0, { mat: 'steel_dark', collide: false });               // box girder
      for (const z of [-18.5, 6.0, 21.2]) B.box(bx, 0, z, 0.5, Y - 1.1, 0.5, { mat: 'steel_dark' });              // piers
      // south stair: ground (x 10.0) up east to the deck, north stair: deck down east to the north service road
      B.stairs({ x: 15.0, z: z0 - 0.2, w: 1.5, len: 9.6, y0: 0, y1: Y, dir: '+x', mat: 'steel_dark', tread: 'grate', rail: true });
      B.floor(bx - 1.0, z0 - 1.0, bx + 1.0, z0 + 0.6, Y, { mat: 'grate', t: 0.1 });
      B.stairs({ x: 26.0, z: z1 + 0.2, w: 1.5, len: 9.6, y0: Y, y1: 0, dir: '+x', mat: 'steel_dark', tread: 'grate', rail: true });
      B.floor(bx - 1.0, z1 - 0.6, bx + 1.0, z1 + 1.0, Y, { mat: 'grate', t: 0.1 });
      catwalkRail(B, bx - 1.0, z0 - 1.0, bx + 1.0, z0 - 1.0, Y); catwalkRail(B, bx - 1.0, z1 + 1.0, bx + 1.0, z1 + 1.0, Y);
      catwalkRail(B, bx + 1.0, z0 - 1.0, bx + 1.0, z0 + 0.6, Y); catwalkRail(B, bx - 1.0, z1 - 0.6, bx - 1.0, z1 + 1.0, Y);
      for (const z of [-8, 12]) { B.box(bx, Y + 1.85, z, 0.3, 0.12, 0.3, { mat: 'steel_dark', collide: false }); B.box(bx, Y + 1.8, z, 0.22, 0.05, 0.22, { mat: 'emissive_warm', collide: false, cast: false }); }
      B.hide(12.0, 0, z0 - 0.3, { kind: 'under', r: 0.6 });
    }

    // ================================================================ north yard: stores shed, dead line, materials
    {
      // stores / car shop: a long shed that screens the bunkhouse from the yard; doors at both ends and on the south side
      const x0 = -22, x1 = 26, z0 = 38, z1 = 48, h = 5.2;
      B.floor(x0, z0, x1, z1, FL, { mat: 'concrete_floor', t: 0.3 });
      wallX(B, x0, x1, z0, { h, t: 0.3, n: 'concrete_panels', s: 'corrugated', end: 'corrugated', ops: [{ c: -10, w: 3.2, h: 3.4, y: FL, frame: 'steel_dark' }, { c: 12, w: 1.1, h: 2.2, y: FL, frame: 'steel_dark' }, ...[-16, 0, 6, 20].map(c => ({ c, w: 2.4, h: 1.0, y: 2.8, frame: 'steel_dark', glass: true }))] });
      wallX(B, x0, x1, z1, { h, t: 0.3, n: 'corrugated', s: 'concrete_panels', end: 'corrugated', ops: [{ c: 2, w: 3.2, h: 3.4, y: FL, frame: 'steel_dark' }] });
      wallZ(B, z0 + 0.15, z1 - 0.15, x0 + 0.15, { h, t: 0.3, w: 'corrugated', e: 'concrete_panels', ops: [{ c: 43, w: 3.0, h: 3.4, y: FL, frame: 'steel_dark' }] });
      wallZ(B, z0 + 0.15, z1 - 0.15, x1 - 0.15, { h, t: 0.3, w: 'concrete_panels', e: 'corrugated', ops: [{ c: 43, w: 3.0, h: 3.4, y: FL, frame: 'steel_dark' }] });
      B.box(2, h, 43, x1 - x0 + 0.6, 0.25, z1 - z0 + 0.6, { mat: 'corrugated', mats: { b: 'steel_dark' } });
      B.prop('rack', -12, FL, 46.9, { bays: 3, levels: 3, load: 0.7 }); B.prop('rack', 16, FL, 46.9, { bays: 3, levels: 3, load: 0.8 });
      B.prop('rack', 5.5, FL, 39.1, { bays: 2, levels: 3, load: 0.6, ry: PI });
      B.prop('pallet', -4, FL, 42.5, { variant: 'wrap', stack: 2 }); B.prop('pallet', 8.5, FL, 43.6, { variant: 'sacks' }); B.prop('crate_stack', -16.5, FL, 41.5, {});
      B.prop('forklift', 20.5, FL, 41.0, { ry: -HP, variant: 'orange' }); B.prop('pallet_jack', -2, FL, 39.5, { ry: 0.4 });
      B.prop('crate', 0.6, FL, 45.6, { variant: 'long' }); B.prop('drum', 22.8, FL, 46.8, { n: 4, variant: 'yellow' });
      lamp(B, 2, h, 43, { intensity: 16 });
      for (const x of [-12, 16]) B.prop('light_fixture', x, h, 43, { variant: 'strip' });
      B.hostage(-19.8, FL, 46.6); B.hostage(-20.5, FL, 39.4);
      B.hide(-16.5, FL, 43.6, { kind: 'crates', r: 0.7 });
      // dead line (rusty cars on a spur at z 32) and the materials yard
      trackX(B, -28, 30, 32, 0, 'wood');
      consistX(B, 32, -26, ['box:rust', 'flat', 6, 'open:rust']);
      bufferStop(B, 29.4, 0, 32, { ry: -HP }); bufferStop(B, -27.4, 0, 32, { ry: HP });
      for (const [x, z] of [[-26, 52], [31, 52]]) { B.box(x, 0, z, 4.4, 0.6, 2.6, { mat: 'p_wood_sleeper' }); B.box(x, 0.6, z, 3.6, 0.5, 2.6, { mat: 'p_wood_sleeper' }); }
      B.prop('container', 34, 0, 43, { variant: 'blue', ry: HP }); B.prop('container', -30, 0, 43.5, { variant: 'green', ry: HP, len: 40 });
      B.prop('pallet', 33, 0, 36.5, { variant: 'bricks' }); B.prop('cone', -2, 0, 52.5, {}); B.prop('cone', 6, 0, 52.5, {});
    }

    // ================================================================ B: fuel depot (north-east)
    {
      const FZ = 27.1;                                  // fuel track
      trackX(B, 46, 87, FZ, 0, 'concrete'); bufferStop(B, 86.6, 0, FZ, { ry: -HP });
      consistX(B, FZ, 50.5, ['tank:black', 7.5, 'tank:white']);
      // fueling platform (raised walk, cranes), canopy over track and platform
      B.box(66, 0, 31.6, 32, 0.32, 3.2, { mat: 'concrete', mats: { t: 'concrete_floor' } });
      for (const x of [55, 63, 71, 79]) fuelCrane(B, x, 30.6, { ry: PI, y: 0.32 });
      for (const x of [50, 58, 66, 74, 82]) for (const z of [23.6, 34.6]) B.box(x, 0, z, 0.35, 7.0, 0.35, { mat: 'paint_white' });
      B.box(66, 7.0, 29.1, 33.4, 0.45, 12.4, { mat: 'corrugated', mats: { b: 'metal_painted' } });
      B.box(66, 6.6, 23.6, 33.4, 0.4, 0.3, { mat: 'paint_white', collide: false }); B.box(66, 6.6, 34.6, 33.4, 0.4, 0.3, { mat: 'paint_white', collide: false });
      for (const x of [50, 58, 66, 74, 82]) B.box(x, 6.6, 29.1, 0.3, 0.4, 11.4, { mat: 'paint_white', collide: false });
      for (const x of [54, 62, 70, 78]) B.prop('light_fixture', x, 6.6, 29.1, { variant: 'strip' });
      lamp(B, 56, 6.5, 29.1, { intensity: 22, fixture: false, type: 'spot', angle: 1.9, range: 16 });
      lamp(B, 70, 6.5, 29.1, { intensity: 22, fixture: false, type: 'spot', angle: 1.9, range: 16 });
      // catwalk at 3.4 m over the platform, stairs both ends
      const CW = 3.4;
      B.box(66, CW - 0.12, 32.7, 26, 0.12, 1.2, { mat: 'grate' });
      for (const x of [54, 62, 70, 78]) for (const z of [32.2, 33.2]) B.box(x, 0.32, z, 0.12, CW - 0.44, 0.12, { mat: 'paint_yellow' });
      catwalkRail(B, 53, 32.1, 79, 32.1, CW); catwalkRail(B, 53, 33.3, 79, 33.3, CW);
      B.stairs({ x: 48.4, z: 32.7, w: 1.1, len: 4.4, y0: 0, y1: CW, dir: '+x', mat: 'paint_yellow', tread: 'grate', rail: true });
      B.box(51.8, CW - 0.12, 32.7, 2.4, 0.12, 1.2, { mat: 'grate' });
      B.stairs({ x: 83.6, z: 32.7, w: 1.1, len: 4.4, y0: CW, y1: 0, dir: '+x', mat: 'paint_yellow', tread: 'grate', rail: true });
      B.box(80.2, CW - 0.12, 32.7, 2.4, 0.12, 1.2, { mat: 'grate' });
      sign(B, 'fuel', 66, 5.9, 23.43, 3.6, 0.9, { face: 's', lit: true });
      sign(B, 'siteB', 66, 0.33, 36.4, 2.0, 2.0, { face: 'u' });
      // tank farm: concrete bund (1.1 m), four horizontal diesel tanks, manifold
      const bx0 = 52, bx1 = 86, bz0 = 38, bz1 = 54;
      for (const [a, b, c, d] of [[bx0, bz0, bx1, bz0 + 0.3], [bx0, bz1 - 0.3, bx1, bz1], [bx0, bz0, bx0 + 0.3, bz1], [bx1 - 0.3, bz0, bx1, bz1]]) B.boxc(a, 0, b, c, 1.1, d, { mat: 'concrete_panels' });
      B.floor(bx0 + 0.3, bz0 + 0.3, bx1 - 0.3, bz1 - 0.3, 0.05, { mat: 'concrete_floor', t: 0.1, collide: false });
      for (const [x, z] of [[61, 42.6], [77, 42.6], [61, 49.6], [77, 49.6]]) {
        B.prop('tank', x, 0, z, { variant: 'horizontal', r: 1.7, len: 12, ry: HP, mat: 'paint_white' });
        sign(B, 'stencilSN', x, 2.3, z - 1.62, 2.6, 1.3, { face: 's' });
      }
      B.prop('pipe', 69, 0, 53.2, { ry: HP, len: 30, d: 0.25, h: 0.4, variant: 'yellow' });
      for (const x of [58, 74]) B.prop('valve', x, 0, 53.2, { ry: HP, variant: 'yellow', h: 0.4 });
      B.stairs({ x: 56, z: bz0 - 0.7, w: 1.0, len: 1.4, y0: 0, y1: 1.1, dir: '+z', mat: 'paint_yellow', tread: 'grate', rail: false });
      B.stairs({ x: 84, z: bz1 + 0.7, w: 1.0, len: 1.4, y0: 0, y1: 1.1, dir: '-z', mat: 'paint_yellow', tread: 'grate', rail: false });
      B.hide(69.5, 0.05, 46.1, { kind: 'dark', r: 0.6 });
      // pump house
      B.room({ x: 47, z: 42, w: 6, d: 8, y: FL, h: 3.4, t: 0.25, wall: 'concrete_panels', outer: 'brick', floor: 'concrete_floor', ceil: 'concrete', roof: 'concrete_dark', frames: 'steel_dark',
        doors: { s: [{ at: 4.2, w: 1.1, h: 2.2 }], w: [{ at: 5.5, w: 1.1, h: 2.2 }] }, windows: { e: [{ at: 2.0, w: 1.2, h: 0.8, y: 1.6 }] } });
      for (const z of [40, 43.5]) { B.box(48.4, FL, z, 1.4, 0.8, 1.0, { mat: 'paint_blue' }); B.cyl(48.4, FL + 0.8, z, 0.3, 0.5, { mat: 'paint_blue', collide: false }); }
      B.prop('pipe', 49.3, FL + 0.3, 42, { len: 6.6, d: 0.2, h: 0.5, variant: 'yellow' });
      B.prop('control_console', 45.2, FL, 44.2, { len: 1.6, ry: HP });
      sign(B, 'pumps', 47, 2.65, 37.86, 1.2, 0.6, { face: 's' });
      lamp(B, 47, 3.4 + FL, 42, { intensity: 6 });
      B.hostage(45.6, FL, 39.6); B.hide(48.8, FL, 45.4, { kind: 'dark', r: 0.6 });
      // depot fence along z 19 (see-through), gates at the west (B yard) and the south-east (B main)
      for (let x = 50; x < 82; x += 4) B.prop('fence', x + 2, 0, 19.2, { len: 4 });
      B.prop('gate', 84.8, 0, 19.2, { variant: 'chainlink', open: 80, len: 5.6 });
      B.prop('bush', 47.2, 0, 21.0, { variant: 'shrub' }); B.hide(47.2, 0, 21.0, { kind: 'bush' });
      B.site('B', { x0: 50, z0: 22.5, x1: 82, z1: 37.5, y: 0 });
    }

    // ================================================================ east lead (B main approach): cripple track, containers
    {
      trackZ(B, -38, 12, 70, 0, 'wood'); bufferStop(B, 70, 0, 11.4, { ry: PI });
      B.prop('railcar', 70, 0, -6, { variant: 'tanker', color: 'black', seed: 1 });
      B.prop('railcar', 70, 0, -29, { variant: 'boxcar', color: 'teal', seed: 3 });
      // an open repair shed over the cripple track (the tank car is in for valve work)
      for (const [x, z] of [[66, -16], [74, -16], [66, 4], [74, 4], [66, -6], [74, -6]]) B.box(x, 0, z, 0.3, 6.5, 0.3, { mat: 'steel_dark' });
      B.box(70, 6.5, -6, 9.4, 0.25, 21, { mat: 'corrugated', mats: { b: 'steel_dark' } });
      wheelset(B, 77.5, 0, -14.5, { ry: HP }); wheelset(B, 79.6, 0, -14.5, { ry: HP });
      B.prop('gas_cylinder', 75.2, 0, -2, { rack: true, ry: -HP }); B.prop('ladder', 72.2, 0, -10, { variant: 'step', ry: HP });
      B.prop('light_fixture', 70, 6.5, -6, { variant: 'strip' });
      // container stacks
      B.prop('container', 56, 0, -30, { variant: 'red', ry: HP, len: 40 }); B.prop('container', 56, 2.59, -30, { variant: 'blue', ry: HP });
      B.prop('container', 56, 0, -22.5, { variant: 'grey', ry: HP }); B.prop('container', 86, 0, -32, { variant: 'orange' });
      B.prop('container', 86, 0, -24, { variant: 'white', doors: 'open', ry: PI }); B.hide(86, 0, -23.0, { kind: 'closet', r: 0.7 });
      B.prop('site_cabin', 60, 0, 12, { variant: 'grey', interior: true, ry: PI }); B.hide(60, 0.3, 12.6, { kind: 'closet', r: 0.6 });
      B.prop('generator', 54, 0, -8, { variant: 'trailer', ry: 0.3 }); B.prop('pallet', 58, 0, -2, { variant: 'pipes', stack: 2, ry: HP });
      B.prop('jersey_barrier', 80, 0, 14.5, { ry: 0.1 }); B.prop('jersey_barrier', 76.5, 0, 15, { ry: -0.1 });
      B.prop('drum', 89, 0, 8, { n: 4, variant: 'rust' }); B.prop('ibc_tank', 91, 0, -6, {});
    }

    // ================================================================ south: office apron, repair area, intermodal pad
    {
      // apron: parked yard trucks, a dumpster, a bus shelter for the crews
      B.prop('car', -27, 0, -55, { variant: 'pickup', color: 'white', ry: 0.1 }); B.prop('car', 0, 0, -53.5, { variant: 'suv', color: 'grey', ry: PI - 0.05 });
      B.hide(-25.2, 0, -55, { kind: 'car', r: 0.6 });
      B.prop('dumpster', 2.5, 0, -63, { variant: 'blue', ry: -HP }); B.prop('wheelie_bin', 2.5, 0, -60.8, { variant: 'green', ry: -HP });
      B.prop('street_light', -28, 0, -60, { ry: HP, light: true, intensity: 70 });
      B.prop('bollard', -24, 0, -67.6, { variant: 'yellow' }); B.prop('bollard', -9, 0, -67.6, { variant: 'yellow' }); B.prop('bollard', -16.5, 0, -67.6, { variant: 'yellow' });
      sign(B, 'limit', 6, 1.8, -44, 0.9, 0.45, { face: 'n' }); B.box(6, 0, -44.1, 0.08, 2.3, 0.08, { mat: 'p_galv', collide: false });
      // wagon repair area (south-west): open shed with a boxcar on stands, wheelsets, scrap
      for (const [x, z] of [[-80, -72], [-62, -72], [-80, -58], [-62, -58]]) B.box(x, 0, z, 0.35, 7, 0.35, { mat: 'steel_dark' });
      B.box(-71, 7, -65, 19.4, 0.3, 15, { mat: 'corrugated', mats: { b: 'steel_dark' } });
      trackX(B, -88, -50, -65, 0, 'wood'); bufferStop(B, -87.4, 0, -65, { ry: HP });
      B.prop('railcar', -71, 0, -65, { ry: HP, variant: 'boxcar', color: 'maroon', seed: 1 });
      B.prop('railcar', -55, 0, -76.5, { ry: HP, variant: 'flatcar', seed: 3 });
      trackX(B, -66, -44, -76.5, 0, 'wood');
      for (let i = 0; i < 4; i++) wheelset(B, -64 + i * 2.2, 0, -57.2, { ry: 0 });
      for (let i = 0; i < 3; i++) wheelset(B, -63 + i * 2.2, 0.93, -57.2, { ry: 0 });
      B.prop('dumpster', -84, 0, -56, { variant: 'grey', lid: 'open' });
      B.prop('gas_cylinder', -78.5, 0, -59.0, { rack: true }); B.prop('pallet', -82, 0, -74.5, { variant: 'none', stack: 6 });
      B.hide(-84, 0, -54.8, { kind: 'crates', r: 0.6 });
      lamp(B, -71, 6.9, -65, { intensity: 16 });
      B.prop('grass_tall', -92, 0, -70, { variant: 'dry', w: 6, d: 5, h: 1.1 }); B.hide(-92, 0, -70, { kind: 'grass' });
      // intermodal pad (south-east): container stacks, a tractor and trailer
      const st = [[36, -60, 'red', 2], [36, -68, 'blue', 1], [50, -60, 'grey', 3], [50, -68, 'orange', 2], [64, -60, 'green', 1], [64, -68, 'white', 2], [78, -64, 'rust', 1]];
      for (const [x, z, v, n] of st) for (let k = 0; k < n; k++) B.prop('container', x, k * 2.59, z, { variant: ['red', 'blue', 'grey', 'orange', 'green', 'white', 'rust'][(st.indexOf(st.find(q => q[0] === x && q[1] === z)) + k) % 7], ry: HP + (k ? 0.02 : 0), len: 40 });
      B.prop('truck_tractor', 22, 0, -72, { variant: 'red', ry: HP }); B.prop('semi_trailer', 13.4, 0, -72, { variant: 'flat', ry: HP });
      B.prop('container', 88, 0, -72, { variant: 'blue', doors: 'open', ry: -HP }); B.hide(87.5, 0, -72, { kind: 'closet', r: 0.6 });
      B.prop('street_light', 30, 0, -52, { ry: PI, light: true, intensity: 70 });
    }

    // ================================================================ north: apron road, car park, A back yard, tank farm north
    {
      for (const [x, z, v, c] of [[32, 67, 'sedan', 'red'], [35.5, 67.2, 'hatch', 'blue'], [42.5, 67, 'suv', 'black'], [46, 76, 'pickup', 'grey'], [32, 76, 'van', 'white']])
        B.prop('car', x, 0, z, { variant: v, color: c, ry: z > 70 ? PI : 0 });
      B.hide(39.2, 0, 67, { kind: 'car', r: 0.6 }); B.hide(34, 0, 73.5, { kind: 'car', r: 0.6 });
      B.prop('street_light', 26, 0, 61, { ry: PI });
      for (const x of [-30, -60]) B.prop('utility_pole', x, 0, 64, { variant: 'wood', ry: HP, span: 30 });
      B.prop('bush', -14, 0, 70, { variant: 'round' }); B.hide(-14, 0, 70, { kind: 'bush' });
      B.prop('bush', 26.5, 0, 82, { variant: 'shrub' });
      // A back yard: sand / coal bunkers (concrete bays), wheel stacks, a lube store
      for (let i = 0; i < 3; i++) { B.box(-84 + i * 6, 0, 70, 0.4, 2.2, 8, { mat: 'concrete' }); }
      B.box(-78, 0, 74, 12.4, 2.2, 0.4, { mat: 'concrete' });
      B.box(-81, 0, 70, 5.2, 0.9, 7, { mat: 'sand', collide: false }); B.box(-75, 0, 71, 5.2, 0.6, 5, { mat: 'p_soil', collide: false });
      B.room({ x: -54, z: 74, w: 8, d: 6, y: FL, h: 3.2, t: 0.25, wall: 'concrete_panels', outer: 'corrugated', floor: 'concrete_floor', ceil: 'corrugated', frames: 'steel_dark',
        doors: { s: [{ at: 4.0, w: 2.4, h: 2.6 }] } });
      B.prop('drum', -56.5, FL, 75.5, { n: 4, variant: 'green' }); B.prop('shelf_unit', -51, FL, 76.4, {});
      B.hide(-57, FL, 76, { kind: 'dark', r: 0.6 });
      B.prop('container', -40, 0, 78, { variant: 'grey', ry: HP }); B.prop('container', -40, 2.59, 78, { variant: 'red', ry: HP + 0.03 });
      // tank farm north: a vertical tank, pipe rack
      B.prop('tank', 80, 0, 72, { variant: 'medium', r: 4.5, h: 8 }); B.prop('pipe', 66, 0, 66, { ry: HP, len: 24, d: 0.3, h: 1.6, variant: 'grey' });
      B.prop('generator', 58, 0, 74, { variant: 'yellow' });
    }

    // ================================================================ objectives
    B.rescue({ x0: -28, z0: -64, x1: -4, z1: -52 });
    B.point('dom1', -42, null, 40, 4); B.point('dom2', 4, null, 6, 4); B.point('dom3', 64, null, -2, 4);
    B.point('hp1', -58, null, -9, 4); B.point('hp2', -6, null, -19.5, 4); B.point('hp3', 66, 0.32, 31.6, 4); B.point('hp4', 2, FL, 43, 4); B.point('hp5', -70, null, -54, 4);
    B.point('hill', 12, null, 6, 4);
    B.point('flag1', -16.5, null, -58, 1.5); B.point('flag2', 3, null, 59, 1.5);
    B.point('extract1', -86, null, 80, 3); B.point('extract2', 90, null, 78, 3); B.point('extract3', 92, null, -20, 3);
    B.point('hq1', 2, FL, 43, 3); B.point('hq2', -71, 0, -61, 3);

    // ================================================================ field (respawn) spawns, FFA
    for (const [x, z, yaw] of [[-40, -58, 0.6], [-60, -48, 0.3], [-82, -46, 0.2], [-12, -46, 0], [20, -46, -0.4], [44, -48, -0.6], [-93, -10, 0.1], [84, -44, -0.5], [5, -58, -0.3], [-34, -21, 0.4]])
      B.spawn(1, x, null, z, yaw, { field: true });
    for (const [x, z, yaw] of [[-20, 59, PI], [20, 59, PI], [-48, 60, 2.6], [60, 59, -2.6], [-70, 78, 2.8], [72, 78, -2.8], [-93, 50, 2.9], [93, 46, -2.9], [36, 72, -2.2], [-30, 36, 2.5]])
      B.spawn(2, x, null, z, yaw, { field: true });
    for (const [x, y, z] of [[-90, null, -76], [-40, null, -50], [10, null, -50], [60, null, -48], [92, null, -48], [-93, null, 0], [-62, null, 20], [-30, null, -19.5],
      [0, null, -20], [36, null, 6], [56, null, 0], [92, null, 20], [-46, null, 30], [-70, 0, 48], [10, null, 22], [66, 0.32, 31.5], [-28, null, 60],
      [50, null, 60], [-84, null, 84], [88, null, 82], [10, FL, 43]])
      B.spawn(0, x, y, z, Math.atan2(-x, -z));
  },
};
