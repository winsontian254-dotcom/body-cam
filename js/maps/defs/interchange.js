/* LIVE FIRE — Route 9 Interchange (interchange): a state highway two days after an evacuation order, overcast. Route 9 (3 + 3
   lanes, north-south) runs under the Route 41 overpass (east-west, deck top 6.6 m) whose middle span has dropped: its west end
   lies on the ground, its east end still sits on the pier, so it is a 20 degree concrete ramp up onto the east deck. North of
   the overpass is the Route 9 toll plaza (site A: canopy, ten booth islands, admin building with a control room); east is a
   Halcyon service station (site B: fuel canopy, mart, car wash). A storm-drain channel runs north-south east of mid and passes
   under the Route 41 embankment in a box culvert (the B tunnel). Police roadblock (T1, south) and the county highway depot
   (T2, north) are the lobbies. Design notes: tools/test/out/notes-map-interchange.md (git-ignored).
   Plan (x east, z north): Route 9 x -34..-6; plaza x -48..2, z 18..54; admin x -66..-52, z 22..42; overpass deck z -5..7
   (west ramp x -92..-62, west deck -62..-3, fallen span -1..17, east deck 17..40, east ramp 40..84); channel x 44..48.5,
   z -62..20 (culvert z -12..12); station forecourt x 32..78, z 14..54; T1 lobby x -35..-5, z -90..-71; T2 depot x -2..30, z 66..80.
   Exports: default MapDef */
import { sign, paint, dashes, guardrail, tollBooth, pump, pier, deck, span, brokenEnd, gantry, rubble, skyline, noiseWall, tape, slopeRail } from '../kit_interchange.js';

const PI = Math.PI, HP = PI / 2;
const TOP = 6.6;                 // overpass road top
const RY = 0.02;                 // road surface top (visual slab over the ground)
const FL = 0.15;                 // building floors
const CH = -2.4;                 // drain channel floor
// Route 9 lanes (x centres): southbound (nose -z) and northbound (nose +z)
const SB = [-29.75, -26.25, -22.75], NB = [-17.25, -13.75, -10.25];
// cars: a few (variant, colour, seed) sets so identical copies become thin instances
const CARSET = [['sedan', 'silver'], ['sedan', 'white'], ['suv', 'black'], ['hatch', 'red'], ['sedan', 'grey'], ['pickup', 'white'], ['suv', 'navy'],
  ['hatch', 'blue'], ['van', 'white'], ['sedan', 'beige'], ['taxi', 'yellow'], ['suv', 'silver']];

function road(B, x0, z0, x1, z1, mat = 'asphalt', y = RY) { B.floor(x0, z0, x1, z1, y, { mat, t: 0.06, collide: false, cast: false }); }
function kerb(B, x0, z0, x1, z1, h = 0.15) { B.boxc(x0, 0, z0, x1, h, z1, { mat: 'concrete' }); }
/** an embankment ramp along x: retaining-wall body + asphalt overlay; support box below a floating wedge */
function embank(B, x0, x1, y0, y1, z0, z1, base = 0) {
  const lo = Math.min(y0, y1), cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, w = z1 - z0;
  if (lo > base + 0.01) B.box(cx, base, cz, x1 - x0, lo - base, w, { mat: 'concrete_panels' });
  B.ramp({ x: cx, z: cz, w, len: x1 - x0, y0, y1, dir: '+x', mat: 'concrete_panels' });
  B.ramp({ x: cx, z: cz, w: w - 0.9, len: x1 - x0, y0: y0 + 0.02, y1: y1 + 0.02, dir: '+x', mat: 'asphalt', collide: false });
}
let carN = 0;
function car(B, x, z, ry, o = {}) {
  const s = o.set != null ? CARSET[o.set % CARSET.length] : CARSET[(carN++ * 7) % CARSET.length];
  return B.prop('car', x, 0, z, { ry: ry + (o.skew || 0), variant: o.variant || s[0], color: o.color || s[1], seed: o.seed || 1, state: o.state, hide: o.hide });
}
/** a lane of stopped traffic along z: list of tokens: 'c' car, 'b' bus, 's' school bus, 't' box truck, 'w' wreck, 'x' burnt, number = gap (m) */
function lane(B, x, z0, dir, list, o = {}) {
  let z = z0; const ry = dir > 0 ? 0 : PI;
  for (const t of list) {
    if (typeof t === 'number') { z += dir * t; continue; }
    const skew = (B.rand() - 0.5) * 0.14, dx = (B.rand() - 0.5) * 0.5;
    if (t === 'b' || t === 's') { B.prop('bus', x + dx, 0, z + dir * 6.05, { ry, variant: t === 's' ? 'school' : 'city', hide: !!o.hide }); z += dir * 13.2; }
    else if (t === 't') { B.prop('box_truck', x + dx, 0, z + dir * 3.8, { ry: ry + skew, variant: B.rand() < 0.5 ? 'logo' : 'plain' }); z += dir * 8.6; }
    else { car(B, x + dx, z + dir * 2.4, ry, { skew, state: t === 'w' ? 'wreck' : t === 'x' ? 'burnt' : undefined, hide: o.hide && B.rand() < 0.3 }); z += dir * (5.6 + B.rand() * 1.2); }
  }
  return z;
}

export default {
  id: 'interchange', name: 'Route 9 Interchange', size: 'L',
  desc: 'A highway interchange after an evacuation: stopped traffic, a toll plaza, a fallen overpass span, a drain tunnel and a service station.',
  env: { hdri: 'overcast', time: 'overcast', exposure: 1.0, sun: { dir: [0.42, -0.85, 0.32], color: [1, 0.97, 0.92], intensity: 0.8 },
    ambient: [0.05, 0.055, 0.06], fog: { color: [0.62, 0.64, 0.66], density: 0.0042 }, weather: 'clear', wind: [2.2, 0.8],
    ambience: 'interchange', reverb: 'outdoor', indoorIbl: 0.3 },
  bounds: { minX: -96, maxX: 96, minZ: -92, maxZ: 92, minY: -4, maxY: 32 },
  chunk: 64,

  build(B) {
    // ================================================================ ground (the drain channel is cut out)
    B.ground({ minX: -96, maxX: 44, minZ: -92, maxZ: 92, mat: 'grass' });
    B.ground({ minX: 48.5, maxX: 96, minZ: -92, maxZ: 92, mat: 'grass' });
    B.ground({ minX: 44, maxX: 48.5, minZ: -92, maxZ: -62, mat: 'grass' });
    B.ground({ minX: 44, maxX: 48.5, minZ: 20, maxZ: 92, mat: 'concrete_floor' });
    // out-of-bounds terrain: rolling fields and wooded hills beyond the edges (visual only)
    const hills = (x, z) => {
      const d = Math.max(Math.abs(x) - 96, Math.abs(z) - 92, 0);
      const cor = Math.abs(z) > 92 ? Math.abs(x + 20) - 18 : Math.abs(z - 1) - 10;      // keep Route 9 / Route 41 flat
      return Math.min(14, d * d * 0.0025 + Math.max(0, d - 30) * 0.1) * (0.75 + 0.25 * Math.sin(x * 0.03 + z * 0.021)) * Math.min(1, Math.max(0, cor) / 30);
    };
    for (const [x0, x1, z0, z1] of [[-260, 260, 92, 260], [-260, 260, -260, -92], [-260, -96, -92, 92], [96, 260, -92, 92]])
      B.ground({ minX: x0, maxX: x1, minZ: z0, maxZ: z1, mat: 'grass', res: 8, height: hills, collide: false });

    // ================================================================ Route 9 (north-south)
    road(B, -34, -130, -6, 18); road(B, -34, 54, -6, 130);
    road(B, -48, 18, 2, 54, 'concrete_floor');                      // toll plaza apron (concrete pavement)
    road(B, -34, 14, -6, 18, 'concrete_floor');
    for (const x of [-34, -6]) for (const [z0, z1] of [[-130, 14], [58, 130]]) paint(B, x + (x < -20 ? 0.3 : -0.42), z0, x + (x < -20 ? 0.42 : -0.3), z1);
    for (const [z0, z1] of [[-130, 14], [58, 130]]) {
      for (const x of [-28, -24.5, -15.5, -12]) dashes(B, x, z0, z1);
      paint(B, -21.2, z0, -21.08, z1, { mat: 'paint_yellow' }); paint(B, -18.92, z0, -18.8, z1, { mat: 'paint_yellow' });
    }
    // median barrier (continuous F-shape) and the shoulders' guard rails
    for (const [z0, z1] of [[-70.4, -5.5], [7.5, 22], [54, 92]]) B.prop('jersey_barrier', -20, 0, (z0 + z1) / 2, { ry: HP, len: z1 - z0 });
    guardrail(B, -35.2, -66, -35.2, -6); guardrail(B, -35.2, 8, -35.2, 16);
    guardrail(B, -4.8, -66, -4.8, -6, {}); guardrail(B, -4.8, 8, -4.8, 15);
    guardrail(B, -35.2, 58, -35.2, 92); guardrail(B, -4.8, 58, -4.8, 92);

    // ================================================================ T1 lobby: police roadblock across Route 9 (south)
    noiseWall(B, -35.6, -92, -35.6, -70.6, { h: 4 });
    noiseWall(B, -4.4, -92, -4.4, -70.6, { h: 4 });
    B.wall(-35.6, -91.8, -4.4, -91.8, { h: 3.2, t: 0.4, mat: 'concrete', mat2: 'concrete' });
    // the police line: jersey barriers + temporary fence, two checkpoint gates
    const g1 = [-26, -14];
    for (const [a, b] of [[-35.4, g1[0] - 1.6], [g1[0] + 1.6, g1[1] - 1.6], [g1[1] + 1.6, -4.6]]) {
      B.prop('jersey_barrier', (a + b) / 2, 0, -70.8, { len: b - a });
      for (let x = a; x < b - 0.1; x += 3) { const l = Math.min(3, b - x); B.prop('fence', x + l / 2, 0.81, -70.8, { len: l, h: 1.8 }); }
      B.collider({ cx: (a + b) / 2, cy: 1.6, cz: -70.8, hx: (b - a) / 2, hy: 1.6, hz: 0.32, ray: false, surf: 'metal' });
    }
    for (const gx of g1) {   // checkpoint portals around the shutters
      for (const s of [-1, 1]) B.box(gx + s * 1.45, 0, -70.8, 0.3, 3.1, 0.5, { mat: 'p_coat_white' });
      B.box(gx, 3.1, -70.8, 3.2, 0.5, 0.6, { mat: 'p_coat_white' });
      sign(B, 'police', gx, 3.35, -71.12, 1.6, 0.4, { face: 's' });
      B.prop('light_fixture', gx, 3.1, -71.5, { variant: 'flood', on: true });
    }
    B.lobby(1, { x0: -35.3, z0: -91.5, x1: -4.7, z1: -71.1, y: 0 }, g1.map(x => ({ x, z: -70.8, w: 2.6, h: 2.8, ry: 0 })));
    B.buyzone(1, { x0: -35.3, z0: -91.5, x1: -4.7, z1: -71.1 });
    // lobby dressing: patrol cars angled at the walls, a command trailer, a light tower, kit tables
    B.prop('car', -32.4, 0, -76, { variant: 'police', ry: 0.25, seed: 2, lights: true });
    B.prop('car', -32.4, 0, -83, { variant: 'police', ry: -0.2, seed: 3 });
    B.prop('car', -7.6, 0, -77, { variant: 'police', ry: -0.25, seed: 2, lights: true });
    B.prop('box_truck', -7.9, 0, -86, { variant: 'plain', color: 'navy', ry: PI });
    B.prop('site_cabin', -20, 0, -89.4, { variant: 'blue' });
    sign(B, 'police', -20, 2.1, -87.58, 1.6, 0.8, { face: 'n' });
    B.prop('generator', -30.5, 0, -89.6, { variant: 'trailer' });
    B.prop('field_desk', -27, 0, -86.6, { ry: PI });
    B.prop('field_desk', -13, 0, -86.6, { ry: PI });
    B.prop('ammo_crate', -24.2, 0, -88.8, { n: 3 }); B.prop('ammo_crate', -15.4, 0, -89.2, { n: 2 });
    B.prop('cone', -22, 0, -72.2); B.prop('cone', -18, 0, -72.2); B.prop('cone', -10, 0, -72.4, { variant: 'drum' }); B.prop('cone', -30, 0, -72.4, { variant: 'drum' });
    B.prop('cone', -20, 0, -73.6, { variant: 'sawhorse' });
    B.prop('street_light', -34.6, 0, -80, { ry: HP, light: true, intensity: 40 });
    for (let i = 0; i < 5; i++) for (let j = 0; j < 3; j++) B.spawn(1, -28 + i * 4, 0, -74.5 - j * 4, 0);

    // traffic jam south of the overpass (southbound queue, northbound mostly clear)
    lane(B, SB[0], -6, -1, [4, 'c', 'c', 't', 'c', 2, 'c', 'b', 'c'], { hide: true });
    lane(B, SB[1], -6, -1, [9, 'c', 'c', 'c', 's', 1, 'c', 'c'], { hide: true });
    lane(B, SB[2], -6, -1, ['c', 'x', 6, 'c', 'c', 'c', 2, 'b', 'c']);
    lane(B, NB[0], -66, 1, [6, 'c', 40, 't']);
    lane(B, NB[2], -66, 1, [12, 'w', 30, 'c', 'c']);
    // a jackknifed semi across the northbound lanes breaks the long highway sightline
    B.prop('truck_tractor', -11.5, 0, -30.5, { variant: 'red', ry: 0.9 });
    B.prop('semi_trailer', -15.2, 0, -40.5, { variant: 'box', ry: 0.25 });
    sign(B, 'skid', -13, RY + 0.004, -24, 7, 1.4, { face: 'u', stain: true, rot: 0.6 });

    // ================================================================ west field: evacuation triage camp
    const tents = [[-76, -40, 0], [-66, -40, 0], [-56, -40, 0], [-76, -26, PI], [-62, -24, PI]];
    for (const [x, z, ry] of tents) B.prop('tent', x, 0, z, { ry, color: 'tan', hide: true });
    B.prop('tent', -48, 0, -56, { variant: 'command', color: 'olive', ry: HP });
    B.prop('field_desk', -60, 0, -32, { ry: 0.3 }); B.prop('field_desk', -70, 0, -33, { ry: -0.2 });
    B.prop('generator', -84, 0, -48, { variant: 'trailer', ry: 0.4 });
    B.prop('car', -82, 0, -18, { variant: 'van', color: 'white', ry: 0.8, seed: 4 });
    B.prop('box_truck', -86, 0, -60, { variant: 'military', ry: 0.3 });
    B.prop('box_truck', -72, 0, -62, { variant: 'military', ry: -0.15 });
    for (const [x, z] of [[-58, -53], [-60.5, -53.6], [-71, -53]]) B.prop('cardboard_box', x, 0, z, { variant: 'pile', n: 5 });
    B.prop('pallet', -52, 0, -46, { variant: 'boxes', stack: 2 }); B.prop('pallet', -53.6, 0, -47.2, { variant: 'wrap' });
    B.prop('ibc_tank', -88, 0, -38); B.prop('ibc_tank', -88, 0, -36.6, { variant: 'blue' });
    B.prop('trash_bag', -64, 0, -48, { n: 6 }); B.prop('wheelie_bin', -66, 0, -48.6, { variant: 'green' });
    B.prop('cone', -68, 0, -20, { variant: 'small' }); B.prop('cone', -66, 0, -19.4);
    for (const [x, z, w, d] of [[-90, -12, 8, 5], [-44, -14, 6, 4], [-90, -80, 9, 7], [-60, -78, 12, 6], [-42, -76, 6, 6]]) B.prop('grass_tall', x, 0, z, { variant: 'dry', w, d, h: 1.1, hide: true });
    for (const [x, z, v] of [[-92, -30, 'oak'], [-90, -66, 'poplar'], [-48, -84, 'oak'], [-78, -86, 'birch'], [-94, -88, 'pine']]) B.prop('tree', x, 0, z, { variant: v });
    for (const [x, z] of [[-86, -10], [-40, -30]]) B.prop('bush', x, 0, z, { variant: 'shrub' });
    // a dirt track from the frontage road into the camp
    road(B, -60, -70, -54, -44, 'dirt', 0.01);
    road(B, -88, -50, -40, -46.5, 'mud', 0.012);
    // utility line along the west edge
    for (let z = -84; z < 90; z += 34) B.prop('utility_pole', -93.5, 0, z, { span: 34, h: 10 });

    // ================================================================ Route 41 overpass
    // west embankment (0 -> 6.6), west deck, broken end
    embank(B, -92, -62, 0, TOP, -5, 7);
    slopeRail(B, -92, 0.02, -62, TOP, -4.8); slopeRail(B, -92, 0.02, -62, TOP, 6.8);
    road(B, -140, -5, -92, 7);
    for (const x of [-48.5, -35, -20, -4.5]) pier(B, x, 1, { top: TOP - 1.35 });
    deck(B, -62, -3, -5, 7, TOP, { gaps: { n: [[-39.4, -37.2]] } });
    brokenEnd(B, -3, -5, 7, TOP, 1);
    sign(B, 'bridge', -35, 2.2, -2.96, 1.1, 0.28, { face: 's' });
    sign(B, 'clear', -27, 5.97, -5.02, 2.0, 0.5, { face: 's' }); sign(B, 'clear', -13, 5.97, 7.02, 2.0, 0.5, { face: 'n' });
    sign(B, 'graf0', -75, 1.6, -5.02, 5, 1.25, { face: 's' });
    sign(B, 'graf1', -80, 1.5, 7.02, 4, 1, { face: 'n' });
    // the switchback stair up to the west deck (north side, by the plaza)
    B.stairs({ x: -49.3, z: 8.9, w: 1.4, len: 5.4, y0: 0, y1: TOP / 2, dir: '+x', mat: 'steel_dark', tread: 'grate', rail: true });
    B.floor(-46.6, 7.6, -44.6, 10.2, TOP / 2, { mat: 'grate', t: 0.12 });
    B.stairs({ x: -41.9, z: 8.9, w: 1.4, len: 5.4, y0: TOP / 2, y1: TOP, dir: '+x', mat: 'steel_dark', tread: 'grate', rail: true });
    B.floor(-39.2, 7.0, -37.2, 9.8, TOP, { mat: 'grate', t: 0.12 });
    for (const [x0, x1, z0, z1, y] of [[-46.6, -44.6, 10.14, 10.2, TOP / 2], [-46.6, -44.6, 7.6, 7.66, TOP / 2], [-44.66, -44.6, 7.6, 8.18, TOP / 2], [-44.66, -44.6, 9.62, 10.2, TOP / 2],
      [-46.6, -46.54, 7.6, 8.18, TOP / 2], [-46.6, -46.54, 9.62, 10.2, TOP / 2], [-39.2, -37.2, 9.74, 9.8, TOP], [-37.26, -37.2, 7.0, 9.8, TOP], [-39.2, -39.14, 9.62, 9.8, TOP], [-39.2, -39.14, 7.3, 8.18, TOP]]) {
      B.boxc(x0, y, z0, x1, y + 1.0, z1, { mat: 'steel_dark', ray: false });
    }
    for (const [x, z, y] of [[-46.6, 10.2, 0], [-44.6, 10.2, 0], [-46.6, 7.6, 0], [-39.2, 9.8, 0], [-37.2, 9.8, 0]]) B.box(x, y, z, 0.12, (x < -44 ? TOP / 2 : TOP) - 0.12, 0.12, { mat: 'steel_dark' });
    B.hide(-44.2, 0, 9.6, { kind: 'under' });
    // the fallen span (ground at x -1 -> deck at x 17) and the east deck
    span(B, -1, 17, -5, 7, 0.32, TOP);
    rubble(B, -2.2, 0, -6.6, { n: 9, r: 1.8, seed: 41 }); rubble(B, -3.4, 0, 8.6, { n: 7, r: 1.4, seed: 43 }); rubble(B, 2, 0, 9.4, { n: 5, r: 1.1, seed: 45, collide: false });
    B.hide(13.4, 0, 1, { kind: 'under', r: 1.0 });
    for (const x of [17, 28.5, 40]) pier(B, x, 1, { top: TOP - 1.35 });
    deck(B, 17, 40, -5, 7, TOP);
    // east embankment over the culvert (6.6 at x 40 -> 0 at x 84)
    const eY = x => TOP * (84 - x) / 44;
    embank(B, 40, 43.7, TOP, eY(43.7), -5, 7);
    embank(B, 43.7, 48.8, eY(43.7), eY(48.8), -5, 7, 0.62);
    embank(B, 48.8, 84, eY(48.8), 0, -5, 7);
    slopeRail(B, 40, TOP, 84, 0.02, -4.8); slopeRail(B, 40, TOP, 84, 0.02, 6.8);
    road(B, 84, -5, 140, 7);
    sign(B, 'graf0', 62, 1.5, -5.02, 4.4, 1.1, { face: 's' });
    // deck clutter: abandoned cars, a stalled truck on the west deck (high ground cover)
    B.prop('box_truck', -52, TOP, 3.2, { variant: 'logo', ry: -HP + 0.08 });
    car(B, -29.75, -1.2, PI, { set: 2 });
    B.hide(-46.5, TOP, -2.8, { kind: 'roof' });
    B.prop('car', -24, TOP, -1.8, { ry: HP + 0.1, variant: 'sedan', color: 'grey', seed: 1 });
    B.prop('car', -12, TOP, 3.6, { ry: -HP + 0.2, variant: 'suv', color: 'white', seed: 1, state: 'wreck' });
    B.prop('car', 31, TOP, -1.7, { ry: HP - 0.15, variant: 'hatch', color: 'red', seed: 1 });
    B.prop('car', 24.5, TOP, 3.9, { ry: -HP, variant: 'van', color: 'white', seed: 1 });
    B.prop('cone', -6, TOP, -3, {}); B.prop('cone', -6.4, TOP, 1, {}); B.prop('cone', 19, TOP, 5, { variant: 'drum' });
    B.prop('jersey_barrier', -6.6, TOP, 2.6, { ry: HP + 0.3, variant: 'plastic', color: 'red' });
    // gantry signs over Route 9 (south of the overpass, facing south-bound / north-bound traffic)
    gantry(B, -35.6, -4.4, -24, { signs: [['g_north', -16.2, 5.4, 2.0, 's'], ['g_toll', -9.4, 3.6, 0.9, 's'], ['g_south', -27, 5.4, 2.0, 'n']] });
    gantry(B, -35.6, -4.4, 60, { signs: [['g_toll', -26.5, 4.4, 1.1, 'n'], ['g_exit', -13.8, 5.4, 2.0, 's']] });

    // ================================================================ mid: under the east deck, the jackknifed tanker, debris
    road(B, 18.5, -63, 25.5, 66);                                   // depot road (north-south)
    dashes(B, 22, -63, 66, { mat: 'paint_yellow' });
    B.prop('semi_trailer', 18, 0, -24, { variant: 'flat', ry: -1.35 });
    B.prop('tank', 18, 1.3, -24, { variant: 'horizontal', r: 1.15, len: 11.2, mat: 'p_stainless', ry: -1.35 });
    B.prop('truck_tractor', 8.8, 0, -20.4, { variant: 'white', ry: -0.5 });
    sign(B, 'scorch', 4, RY + 0.004, -12, 6, 5, { face: 'u', stain: true });
    B.prop('car', 4, 0, -12.5, { variant: 'sedan', state: 'burnt', ry: 0.7, seed: 1 });
    B.prop('car', 0, 0, -26, { variant: 'police', state: 'wreck', ry: -0.6, seed: 2, hide: true });
    B.prop('car', 31.5, 0, 12, { variant: 'pickup', color: 'white', ry: 0.25, seed: 1, hide: true });
    B.prop('car', 8, 0, 14.5, { variant: 'suv', color: 'black', ry: 2.6, seed: 1 });
    rubble(B, 9, 0, 10.5, { n: 8, r: 1.6, seed: 47 }); rubble(B, 24, 0, -9.5, { n: 6, r: 1.2, seed: 49 });
    B.prop('jersey_barrier', 4, 0, -9, { ry: 0.3 }); B.prop('jersey_barrier', 10.5, 0, -10.5, { ry: -0.2 });
    B.prop('jersey_barrier', 33, 0, -11, { ry: HP });
    B.prop('cone', 12, 0, -8, { variant: 'sawhorse', ry: 0.2 }); B.prop('cone', 14.2, 0, -8.6);
    sign(B, 'closed', 13, 1.1, -7.6, 1.0, 0.5, { face: 's' });
    B.prop('drum', 36.5, 0, -13, { variant: 'rust', n: 3 }); B.prop('pallet', 34.5, 0, 16, { variant: 'bricks' });
    B.prop('utility_pole', 32, 0, -30, { variant: 'transformer', h: 9 });

    // ================================================================ drain channel + culvert (B tunnel)
    const CW0 = 44, CW1 = 48.5;
    B.ramp({ x: 46.25, z: -57, w: 4.5, len: 10, y0: CH, y1: 0, dir: '-z', mat: 'concrete_dark' });
    B.floor(CW0, -52, CW1, 12, CH, { mat: 'concrete_dark', t: 0.3 });
    B.floor(45.6, -52, 46.9, 12, CH + 0.012, { mat: 'mud', t: 0.03, collide: false });
    B.ramp({ x: 46.25, z: 16, w: 4.5, len: 8, y0: CH, y1: 0, dir: '+z', mat: 'concrete_dark' });
    for (const x of [CW0 - 0.15, CW1 + 0.15]) B.box(x, CH, -21, 0.3, -CH + 0.18, 82, { mat: 'concrete', mats: { t: 'concrete_dark' } });
    // culvert box (roof slab, headwalls, wing walls)
    B.box(46.25, 0.2, 0, 5.1, 0.42, 24, { mat: 'concrete', mats: { b: 'concrete_dark' } });
    for (const zz of [-12.2, 12.2]) { B.box(46.25, 0.62, zz, 6.2, 0.8, 0.4, { mat: 'concrete' }); }
    sign(B, 'streak', 46.25, -0.3, -12.42, 4.2, 1.2, { face: 's', stain: true }); sign(B, 'streak', 46.25, -0.3, 12.42, 4.2, 1.2, { face: 'n', stain: true });
    sign(B, 'graf1', 43.86, -1.2, -30, 4, 1, { face: 'e' });
    // side stair (west wall) at z -26: up to the park-and-ride
    B.stairs({ x: 45.0, z: -26.5, w: 1.6, len: 4.2, y0: CH, y1: 0, dir: '+z', mat: 'concrete', rail: false });
    for (let z = -60; z < 21; z += 3) for (const x of [CW0 - 0.15, CW1 + 0.15]) if (z < -12 || z > 12) B.box(x, 0.18, z, 0.05, 1.0, 0.05, { mat: 'p_galv', collide: false });
    B.box(CW0 - 0.15, 1.1, -24, 0.06, 0.05, 72, { mat: 'p_galv', collide: false }); B.box(CW1 + 0.15, 1.1, -24, 0.06, 0.05, 72, { mat: 'p_galv', collide: false });
    for (const [x, z] of [[47.4, -40], [45.2, -18], [47.6, 4]]) B.prop('trash_bag', x, CH, z, { n: 2 });
    B.prop('cardboard_box', 47.4, CH, -6, { variant: 'flat' }); B.prop('drum', 45.1, CH, 8.2, { variant: 'rust', fallen: true });
    B.prop('pallet', 47.6, CH, -32, {});
    B.light({ x: 46.25, y: 0.18, z: -6, intensity: 3, color: [0.9, 0.95, 1], fixture: 'tube' });
    B.light({ x: 46.25, y: 0.18, z: 5, intensity: 3, color: [0.9, 0.95, 1], fixture: 'tube', flicker: 0.6 });
    B.hide(47.6, CH, -10.4, { kind: 'dark' });
    B.hide(44.8, CH, -36, { kind: 'dark' });

    // ================================================================ park-and-ride (south-east) and frontage road
    road(B, -4, -70, 96, -63);
    dashes(B, -66.5, -4, 96, { alongX: true, mat: 'paint_yellow' });
    road(B, 0, -50, 38, -28);
    for (let x = 2; x <= 36; x += 2.7) { paint(B, x, -50, x + 0.1, -45); paint(B, x, -33, x + 0.1, -28); }
    const parked = [[3.4, -47.5, 0], [8.8, -47.5, 0], [11.5, -47.5, 0.05], [19.6, -47.5, 0], [27.7, -47.5, -0.04], [33.1, -47.5, 0], [6.1, -30.5, PI], [14.2, -30.5, PI], [16.9, -30.5, PI + 0.06], [25, -30.5, PI], [30.4, -30.5, PI]];
    parked.forEach(([x, z, r], i) => car(B, x, z, r, { set: i * 5, hide: i % 3 === 0 }));
    for (const x of [4, 20, 36]) B.prop('street_light', x, 0, -39, { variant: 'double' });
    B.prop('bus_shelter', 10, 0, -53, { ry: PI });
    B.prop('atm', 15, 0, -52.6, { ry: PI });
    B.prop('litter_bin', 5.4, 0, -52.6); B.prop('bench', 20, 0, -52.8, { ry: PI, variant: 'metal' });
    for (const [x, z, w, d] of [[30, -58, 10, 4], [70, -52, 14, 6], [88, -24, 7, 10], [60, -18, 8, 4], [-1, -58, 4, 6]]) B.prop('grass_tall', x, 0, z, { variant: 'green', w, d, h: 1.05, hide: true });
    for (const [x, z, v] of [[56, -76, 'oak'], [76, -80, 'poplar'], [92, -70, 'oak'], [38, -80, 'birch'], [8, -80, 'oak'], [-1, -88, 'birch'], [26, -86, 'pine'], [92, -46, 'spruce']]) B.prop('tree', x, 0, z, { variant: v });
    B.prop('car', 64, 0, -64.8, { ry: HP + 0.05, variant: 'sedan', color: 'blue', seed: 1 });
    B.prop('car', 72, 0, -68.3, { ry: -HP, variant: 'pickup', color: 'red', seed: 1, state: 'wreck' });
    B.prop('bus', 30, 0, -68.2, { ry: -HP + 0.04, variant: 'school' });
    B.prop('jersey_barrier', -2.4, 0, -66.5, { ry: HP, len: 6 }); sign(B, 'closed', -1.9, 1.0, -66.5, 1.2, 0.6, { face: 'e' });
    // the substation (fenced)
    for (const [x0, z0, x1, z1] of [[62, -44, 82, -44], [62, -26, 82, -26], [62, -44, 62, -26], [82, -44, 82, -26]]) {
      const L = Math.hypot(x1 - x0, z1 - z0), n = Math.round(L / 3), ry = x0 === x1 ? HP : 0;
      for (let i = 0; i < n; i++) { const t = (i + 0.5) / n; if (x0 === x1 && x0 === 62 && Math.abs(z0 + (z1 - z0) * t + 35) < 2) continue; B.prop('fence', x0 + (x1 - x0) * t, 0, z0 + (z1 - z0) * t, { ry, len: L / n, variant: 'barbed' }); }
    }
    B.floor(62, -44, 82, -26, 0.02, { mat: 'gravel', t: 0.05, collide: false, cast: false });
    for (const [x, z] of [[67, -39], [67, -31], [76, -39], [76, -31]]) {
      B.box(x, 0, z, 3, 0.3, 2.4, { mat: 'concrete' });
      B.box(x, 0.3, z, 2.4, 2.2, 1.8, { mat: 'p_paint_grey' });
      for (let k = 0; k < 5; k++) B.box(x - 1.3, 0.5, z - 0.8 + k * 0.4, 0.12, 1.6, 0.06, { mat: 'p_paint_grey', collide: false });
      for (const dx of [-0.7, 0, 0.7]) B.cyl(x + dx, 2.5, z, 0.12, 0.8, { mat: 'p_porcelain', sides: 8, collide: false });
    }
    B.hide(71.5, 0, -35, { kind: 'crates' });

    // ================================================================ north of the overpass: Route 9 to the plaza
    lane(B, SB[0], 92, -1, [3, 'c', 'c', 'c', 'b'], { hide: true });
    lane(B, SB[1], 92, -1, ['t', 'c', 'c', 'c']);
    lane(B, SB[2], 92, -1, [7, 'c', 'c', 'w', 'c']);
    lane(B, NB[1], 60, 1, [6, 'c']);
    B.prop('semi_trailer', -13.5, 0, 79, { variant: 'box', ry: 0.5 });
    B.prop('truck_tractor', -7.8, 0, 87.6, { variant: 'blue', ry: 0.9 });
    for (const x of [-31, -27, -23, -17, -13, -9]) B.prop('jersey_barrier', x, 0, 91, { len: 3 });
    // south approach to the plaza: queue in the toll lanes, an empty northbound side
    lane(B, NB[0], 9, 1, [1, 'c']);
    car(B, -30, 12.5, PI, { set: 3 }); car(B, -9.5, 11.5, 0.1, { set: 6, state: 'wreck' });

    // ================================================================ SITE A: the toll plaza
    const ISL = []; for (let i = 0; i < 10; i++) ISL.push(-46.4 + i * 5.2);
    for (const x of ISL) tollBooth(B, x, 36, { len: 20 });
    // lane paint between the islands, lane numbers on the canopy, painted TOLL legends
    for (let i = 0; i < 9; i++) {
      const lx = (ISL[i] + ISL[i + 1]) / 2;
      if (i % 2 === 0) sign(B, 'only', lx, RY + 0.006, 21, 2.6, 0.65, { face: 'u', rot: PI });
      sign(B, 'ln' + (i + 1), lx, 6.85, 30.69, 0.7, 0.7, { face: 's' });
      sign(B, i % 3 === 1 ? 'epass' : 'cash', lx, 6.85, 41.31, 1.3, 0.65, { face: 'n' });
      sign(B, i === 4 || i === 6 ? 'agreen' : 'xred', lx + 1.1, 6.85, 30.69, 0.6, 0.6, { face: 's', glow: true });
    }
    for (const x of ISL) { paint(B, x - 0.06, 14, x + 0.06, 26); paint(B, x - 0.06, 46, x + 0.06, 58); }
    // canopy
    B.box(-23, 5.9, 36, 51.4, 0.5, 10.6, { mat: 'metal_painted', mats: { b: 'p_coat_white' } });
    for (const zz of [30.6, 41.4]) B.box(-23, 6.35, zz, 51.6, 1.05, 0.16, { mat: 'p_coat_white', mats: { n: zz > 36 ? 'p_coat_white' : 'p_coat_white' }, collide: false });
    for (const xx of [-48.7, 2.7]) B.box(xx, 6.35, 36, 0.16, 1.05, 11, { mat: 'p_coat_white', collide: false });
    B.box(-23, 7.38, 30.6, 51.6, 0.06, 0.2, { mat: 'p_coat_slate', collide: false }); B.box(-23, 7.38, 41.4, 51.6, 0.06, 0.2, { mat: 'p_coat_slate', collide: false });
    sign(B, 'tollhdr', -23, 6.86, 30.5, 4.2, 0.78, { face: 's', lit: true });
    for (const x of ISL) for (const zz of [32.2, 39.8]) B.cyl(x, 0.2, zz, 0.22, 5.7, { mat: 'p_coat_slate', sides: 12 });
    for (const x of [-36, -10]) B.light({ x, y: 5.9, z: 36, intensity: 14, color: [1, 0.96, 0.9], fixture: 'panel' });
    for (let i = 0; i < 9; i++) for (const zz of [33.5, 38.5]) B.box((ISL[i] + ISL[i + 1]) / 2, 5.86, zz, 0.5, 0.04, 1.6, { mat: 'emissive_white', collide: false, cast: false });
    // barrier arms (down), cars stopped at the booths, a gap where the defenders can walk through
    for (let i = 0; i < 9; i++) { const lx = (ISL[i] + ISL[i + 1]) / 2; B.prop('gate', lx - 0.3, 0.0, 43.4, { variant: 'barrier', len: 3.2 }); }
    car(B, -38.6, 22.5, PI, { set: 0 }); car(B, -28.2, 25, PI, { set: 4, hide: true }); car(B, -17.8, 23.5, PI + 0.1, { set: 2 });
    car(B, -2.2, 24.5, 0.05, { set: 7 }); car(B, -33.4, 49.2, PI, { set: 9 }); car(B, -23, 52.5, PI, { set: 1, hide: true });
    B.prop('box_truck', -7.4, 0, 51.2, { variant: 'logo', ry: PI + 0.03 });
    B.prop('cone', -26, 0, 28, { variant: 'drum' }); B.prop('cone', -21, 0, 44.6); B.prop('cone', -31.2, 0, 45);
    sign(B, 'oil0', -28.2, RY + 0.006, 36, 1.8, 1.8, { face: 'u', stain: true }); sign(B, 'oil2', -12.6, RY + 0.006, 40, 1.6, 1.6, { face: 'u', stain: true });
    sign(B, 'crack', -40, RY + 0.006, 50, 5, 5, { face: 'u', stain: true }); sign(B, 'crack', -6, RY + 0.006, 20, 5, 5, { face: 'u', stain: true, rot: 1 });
    sign(B, 'siteA', -23, RY + 0.006, 28.5, 2.2, 2.2, { face: 'u' });
    tape(B, [[-36, 26.5], [-30.8, 26.5], [-25.6, 26.5]], 1.0);
    // plaza edges: kerbs, sidewalk, the east grass strip with a low wall
    kerb(B, -48.2, 18, -48, 54); kerb(B, 2, 18, 2.2, 54);
    B.floor(-52, 18, -48.2, 54, 0.15, { mat: 'pavement', t: 0.15 });
    for (const z of [22, 50]) B.prop('street_light', -49.4, 0.15, z, { ry: HP, variant: 'single' });
    B.prop('street_light', 3.2, 0, 18, { ry: -HP }); B.prop('street_light', 3.2, 0, 54, { ry: -HP });
    B.box(10, 0, 30, 0.4, 0.9, 12, { mat: 'concrete_panels', mats: { t: 'concrete_dark' } });
    B.box(13, 0, 44, 6, 0.9, 0.4, { mat: 'concrete_panels', mats: { t: 'concrete_dark' } });
    B.prop('bush', 11.8, 0, 22, { variant: 'round', hide: true }); B.prop('bush', 6, 0, 46, { variant: 'shrub' });
    B.prop('tree', 14, 0, 33, { variant: 'birch' });
    B.prop('road_sign', 4, 0, 14, { variant: 'speed30', ry: PI });
    B.site('A', { x0: -42, z0: 26, x1: -10, z1: 46 });

    // ================================================================ toll admin building (2 storeys, control room over the plaza)
    const AX0 = -66, AX1 = -52, AZ0 = 22, AZ1 = 42, U = 3.6;
    B.room({ x: -59, z: 32, w: 14, d: 20, y: FL, h: U, wall: 'plaster', outer: 'concrete_panels', floor: 'tile_floor', frames: 'steel_dark',
      doors: { e: [{ at: 14, w: 1.2 }], s: [{ at: 7.5, w: 1.6 }], w: [{ at: 14, w: 1.1 }] },
      windows: { s: [{ at: 3 }, { at: 11.5 }], e: [{ at: 5.4, w: 1.6 }, { at: 18, w: 1.4 }], w: [{ at: 5 }, { at: 9 }] } });
    B.floor(AX0 + 0.2, AZ0 + 0.2, -53.6, AZ1 - 0.2, FL + U, { mat: 'concrete_floor', mats: { b: 'ceiling_tile' }, t: 0.25 });
    B.floor(-53.6, AZ0 + 0.2, AX1 - 0.2, 26.4, FL + U, { mat: 'concrete_floor', mats: { b: 'ceiling_tile' }, t: 0.25 });
    B.floor(-53.6, 32, AX1 - 0.2, AZ1 - 0.2, FL + U, { mat: 'concrete_floor', mats: { b: 'ceiling_tile' }, t: 0.25 });
    B.room({ x: -59, z: 32, w: 14, d: 20, y: FL + U, h: 3.2, wall: 'plaster_white', outer: 'concrete_panels', ceil: 'ceiling_tile', roof: 'concrete_dark', frames: 'steel_dark',
      doors: { n: [{ at: 3, w: 1.1 }] },
      windows: { e: [{ at: 4, w: 3, h: 1.3, y: 1.0 }, { at: 9, w: 3, h: 1.3, y: 1.0 }, { at: 14.5, w: 3, h: 1.3, y: 1.0 }], s: [{ at: 4, w: 2 }, { at: 10, w: 2 }], w: [{ at: 6 }, { at: 14 }] } });
    // interior: stair along the east wall (z 26.4 -> 32), ground-floor partitions
    B.stairs({ x: -52.9, z: 29.2, w: 1.1, len: 5.6, y0: FL, y1: FL + U, dir: '+z', mat: 'concrete', tread: 'concrete_dark', rail: 'left' });
    B.box(-53.6, FL + U, 29.2, 0.06, 1.0, 5.6, { mat: 'steel_dark', ray: false });
    B.wall(AX0 + 0.2, 30, -54, 30, { y: FL, h: U - 0.1, mat: 'plaster', openings: [{ at: 6.5, w: 1.1, h: 2.2, frame: 'steel_dark' }] });
    B.wall(-60, 30, -60, AZ1 - 0.2, { y: FL, h: U - 0.1, mat: 'plaster_white', mat2: 'plaster', openings: [{ at: 6.5, w: 1.0, h: 2.2, frame: 'steel_dark' }] });
    // ground floor: lobby (south), counting room (north-west), break room (north-east)
    B.prop('desk', -62, FL, 24.5, { variant: 'metal' }); B.prop('office_chair', -62, FL, 25.4, { ry: PI });
    B.prop('filing_cabinet', -65.4, FL, 26.5, { ry: HP }); B.prop('filing_cabinet', -65.4, FL, 27.1, { ry: HP, open: 1 });
    B.prop('vending_machine', -55.2, FL, 22.7, {}); B.prop('bench', -58.5, FL, 22.6, { variant: 'metal' });
    B.prop('poster', -63, FL + 1.4, 29.88, { ry: PI, i: 2 }); B.prop('fire_extinguisher', -54, FL, 22.3, {});
    B.prop('shelf_unit', -65.4, FL, 34, { ry: HP }); B.prop('shelf_unit', -65.4, FL, 37, { ry: HP });
    B.prop('desk', -63, FL, 40.5, { variant: 'metal', ry: PI, items: true }); B.prop('workstation', -62.8, FL, 33.4, { ry: 0 });
    B.prop('lockers', -61, FL, 41.5, { ry: PI, n: 3 });
    B.prop('kitchen_counter', -56, FL, 41.5, { ry: PI, len: 3.2, upper: true });
    B.prop('fridge', -53.2, FL, 41.4, { ry: PI }); B.prop('dining_table', -56.5, FL, 36, { chairs: 4 });
    B.prop('sofa', -58.6, FL, 31.2, { ry: HP, seats: 2, variant: 'blue' });
    B.prop('wardrobe', -59.4, FL, 39.6, { ry: -HP, variant: 'large', hide: true });
    B.hostage(-63.5, FL, 37.5); B.hostage(-55, FL, 33.5);
    // upper floor: the plaza control room
    const UY = FL + U;
    B.prop('control_console', -54.2, UY, 33.6, { ry: -HP, len: 3.6 }); B.prop('control_console', -54.2, UY, 38.6, { ry: -HP, len: 3.6 });
    B.prop('office_chair', -55.6, UY, 33.6, { ry: HP }); B.prop('office_chair', -55.4, UY, 38.2, { ry: HP + 0.4 });
    B.prop('server_rack', -65.4, UY, 36, { ry: HP, n: 2 });
    B.prop('desk', -63, UY, 24.4, { variant: 'office' }); B.prop('office_chair', -63, UY, 25.3, { ry: PI });
    B.prop('whiteboard', -65.82, UY + 1.0, 30, { ry: HP });
    B.prop('filing_cabinet', -65.4, UY, 41, { ry: HP });
    B.prop('wall_clock', -60, UY + 2.4, 41.75, { ry: PI });
    for (const [x, z, y] of [[-62, 25.5, FL + U - 0.25], [-62, 35, FL + U - 0.25], [-58, 38, UY + 3.2], [-60, 27, UY + 3.2]]) B.light({ x, y, z, intensity: 7, color: [1, 0.94, 0.86], fixture: 'panel' });
    // the fire escape on the north wall (upper floor door at x -63)
    B.floor(-64.4, 42.2, -60.4, 43.6, UY, { mat: 'grate', t: 0.1 });
    B.stairs({ x: -57.3, z: 42.9, w: 1.3, len: 6.2, y0: UY, y1: 0, dir: '+x', mat: 'steel_dark', tread: 'grate', rail: true });
    B.boxc(-64.4, UY, 43.56, -60.4, UY + 1.0, 43.62, { mat: 'steel_dark', ray: false }); B.boxc(-64.46, UY, 42.2, -64.4, UY + 1.0, 43.6, { mat: 'steel_dark', ray: false });
    for (const x of [-64.3, -60.5]) B.box(x, 0, 43.5, 0.1, UY, 0.1, { mat: 'steel_dark' });
    B.hide(-62.4, 0, 43.0, { kind: 'under' });
    sign(B, 'admin', -56, 2.9, 21.79, 1.6, 0.4, { face: 's' }); sign(B, 'streak', -59, 6.0, 21.78, 14, 2.4, { face: 's', stain: true });
    // roof: parapet, HVAC, mast
    B.box(-59, UY + 3.4, 22.1, 14, 0.6, 0.2, { mat: 'concrete_panels', collide: false }); B.box(-59, UY + 3.4, 41.9, 14, 0.6, 0.2, { mat: 'concrete_panels', collide: false });
    B.prop('ac_unit', -61, UY + 3.4, 30, { variant: 'hvac' }); B.cyl(-55, UY + 3.4, 38, 0.08, 6, { mat: 'p_galv', sides: 8, collide: false });
    // staff parking west of the admin building
    road(B, -92, 12, -66, 52);
    for (let z = 14; z <= 50; z += 2.7) paint(B, -88, z, -82, z + 0.1);
    for (let z = 14; z <= 50; z += 2.7) paint(B, -76, z, -70, z + 0.1);
    [[-85, 18.1], [-85, 23.5], [-85, 31.6], [-85, 42.4], [-73, 15.4], [-73, 26.2], [-73, 34.3], [-73, 47.8]].forEach(([x, z], i) => car(B, x, z, HP * (i < 4 ? -1 : 1), { set: i * 3 + 1, hide: i === 2 || i === 6 }));
    B.prop('dumpster', -67.4, 0, 46, { ry: -HP, hide: true });
    B.prop('street_light', -79, 0, 32, { variant: 'double' });
    // toll authority storage yard (north-west) behind a fence
    for (let x = -94; x < -50; x += 3) B.prop('fence', x + 1.5, 0, 58, { len: 3 });
    for (const [x, z] of [[-88, 66], [-84, 66], [-80, 66], [-88, 70.5], [-84, 70.5]]) B.prop('jersey_barrier', x, 0, z, { len: 3 });
    for (const [x, z] of [[-70, 66], [-66, 70], [-74, 74]]) B.prop('pallet', x, 0, z, { variant: 'none', stack: 6 });
    B.prop('cone', -62, 0, 66, { n: 1 }); B.prop('generator', -58, 0, 72, { variant: 'yellow' });
    for (const [x, z, v] of [[-90, 82, 'spruce'], [-74, 86, 'pine'], [-56, 84, 'spruce'], [-92, 50, 'oak'], [-46, 76, 'oak'], [-40, 88, 'birch']]) B.prop('tree', x, 0, z, { variant: v });
    for (const [x, z, w, d] of [[-60, 80, 10, 6], [-90, 74, 6, 6]]) B.prop('grass_tall', x, 0, z, { variant: 'dry', w, d, h: 1.1, hide: true });

    // ================================================================ SITE B: Halcyon service station
    B.floor(34, 14, 78, 54, 0.03, { mat: 'concrete_floor', t: 0.08, collide: false, cast: false });
    kerb(B, 34, 13.8, 44, 14); kerb(B, 48.5, 13.8, 64, 14);
    // canopy (underside 5.0)
    B.box(49, 5.0, 29, 26.6, 0.55, 16.6, { mat: 'metal_painted', mats: { b: 'p_coat_white' } });
    B.box(49, 5.55, 20.65, 27, 0.9, 0.12, { mat: 'p_coat_red', collide: false }); B.box(49, 5.55, 37.35, 27, 0.9, 0.12, { mat: 'p_coat_red', collide: false });
    B.box(35.65, 5.55, 29, 0.12, 0.9, 16.8, { mat: 'p_coat_red', collide: false }); B.box(62.35, 5.55, 29, 0.12, 0.9, 16.8, { mat: 'p_coat_red', collide: false });
    B.box(49, 5.42, 20.62, 27, 0.06, 0.16, { mat: 'p_coat_white', collide: false }); B.box(49, 5.42, 37.38, 27, 0.06, 0.16, { mat: 'p_coat_white', collide: false });
    sign(B, 'halcyon', 49, 6.0, 20.58, 3.6, 0.9, { face: 's' }); sign(B, 'halcyon', 49, 6.0, 37.42, 3.6, 0.9, { face: 'n' });
    sign(B, 'halcyon', 35.58, 6.0, 29, 3.6, 0.9, { face: 'w' }); sign(B, 'halcyon', 62.42, 6.0, 29, 3.6, 0.9, { face: 'e' });
    for (const zi of [25, 33]) for (const [x0, x1] of [[38, 47], [51, 60]]) {
      B.box((x0 + x1) / 2, 0, zi, x1 - x0, 0.2, 1.3, { mat: 'concrete', mats: { t: 'concrete_dark' } });
      B.box(x0 + 0.4, 0, zi, 0.8, 0.22, 1.32, { mat: 'hazard', collide: false }); B.box(x1 - 0.4, 0, zi, 0.8, 0.22, 1.32, { mat: 'hazard', collide: false });
      B.cyl((x0 + x1) / 2, 0.2, zi, 0.28, 4.8, { mat: 'p_coat_white', sides: 12 });
      pump(B, x0 + 2.2, 0.2, zi); pump(B, x1 - 2.2, 0.2, zi);
      B.prop('litter_bin', (x0 + x1) / 2 + 1.0, 0.2, zi, { variant: 'square' });
      sign(B, 'pumpnum', x0 + 2.2, 2.4, zi + 0.27, 0.6, 0.3, { face: 'n' });
    }
    for (const [x, z] of [[42.5, 29], [55.5, 29]]) B.light({ x, y: 5.0, z, intensity: 12, color: [0.95, 0.97, 1], fixture: 'panel' });
    for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) B.box(38.5 + i * 7, 4.97, 23 + j * 6, 1.2, 0.03, 1.2, { mat: 'emissive_white', collide: false, cast: false });
    car(B, 42.5, 27.2, HP, { set: 5, hide: true }); car(B, 55, 31, -HP + 0.1, { set: 8 }); car(B, 56.5, 22.6, HP + 0.05, { set: 10 });
    sign(B, 'oil1', 44, 0.04, 29, 1.7, 1.7, { face: 'u', stain: true }); sign(B, 'oil3', 53, 0.04, 27, 1.4, 1.4, { face: 'u', stain: true });
    sign(B, 'siteB', 49, 0.04, 29, 2.2, 2.2, { face: 'u' });
    // underground tank fills + the delivery tanker (east of the canopy)
    for (let i = 0; i < 4; i++) B.cyl(65 + i * 1.4, 0.03, 16.5, 0.32, 0.03, { mat: 'steel_dark', collide: false });
    B.prop('truck_tractor', 69.5, 0, 31.4, { variant: 'white', ry: 0 });
    B.prop('semi_trailer', 69.5, 0, 21.5, { variant: 'flat', ry: 0 });
    B.prop('tank', 69.5, 1.3, 21.5, { variant: 'horizontal', r: 1.15, len: 11.4, mat: 'p_stainless' });
    // price pylon at the road
    B.box(37, 0, 9, 0.5, 6.2, 0.5, { mat: 'p_coat_slate' }); B.box(37, 6.2, 9, 1.6, 3.0, 0.4, { mat: 'p_coat_slate', collide: false });
    sign(B, 'price', 37, 7.7, 8.79, 1.4, 2.8, { face: 's', glow: true }); sign(B, 'price', 37, 7.7, 9.21, 1.4, 2.8, { face: 'n', glow: true });
    // the station's south hedge line (two gaps) and the east lot
    B.prop('bush', 39, 0, 12.6, { variant: 'hedge', len: 4, h: 1.4 }); B.prop('bush', 59, 0, 12.6, { variant: 'hedge', len: 9, h: 1.4 });
    B.prop('bush', 40.6, 0, 12.4, { variant: 'flowering', hide: true });
    road(B, 64, 38, 84, 56, 'asphalt', 0.035);
    for (let x = 65; x < 84; x += 3.2) paint(B, x, 50, x + 0.1, 56, { y: 0.035 });
    B.prop('semi_trailer', 78, 0, 46, { variant: 'box', ry: 0.04 }); B.prop('truck_tractor', 78.5, 0, 56.5, { variant: 'red', ry: 0.04 });
    car(B, 70, 53, 0, { set: 11 }); car(B, 66.6, 53, 0.04, { set: 4 });
    B.prop('generator', 74, 0, 16, { variant: 'portable' });

    // ---------------------------------------------------------------- the mart (x 40..66, z 41..53)
    const MX = 53, MZ = 47, MW = 26, MD = 12, MH = 4.2;
    B.room({ x: MX, z: MZ, w: MW, d: MD, y: FL, h: MH, wall: 'plaster_white', outer: 'brick_red', floor: 'tile_floor', ceil: 'ceiling_tile', roof: 'concrete_dark', frames: 'steel',
      doors: { s: [{ at: 13, w: 2.0, h: 2.3 }], n: [{ at: 10, w: 1.1 }], e: [{ at: 3, w: 1.1 }] },
      windows: { s: [{ at: 4.5, w: 6.4, h: 2.4, y: 0.5, glass: true }, { at: 20.8, w: 7.6, h: 2.4, y: 0.5, glass: true }], w: [{ at: 6, w: 3.4, h: 1.4, y: 1.0 }] } });
    B.box(MX, FL + MH + 0.2, 40.92, MW + 0.4, 1.3, 0.24, { mat: 'p_coat_red', collide: false });
    sign(B, 'mart', MX, FL + MH + 0.85, 40.79, 5.2, 1.3, { face: 's' });
    B.box(MX, FL + 3.05, 40.4, 14, 0.12, 1.4, { mat: 'p_coat_white', collide: false });    // entrance awning
    for (const [x0, x1] of [[40.2, 65.8]]) { B.box((x0 + x1) / 2, FL + MH + 0.2, 53.1, x1 - x0, 0.7, 0.2, { mat: 'brick_red', collide: false }); }
    // inside: counter, aisles, coolers, toilets, storeroom
    B.box(43.2, FL, 44.3, 4.0, 1.0, 0.7, { mat: 'wood_dark', mats: { t: 'p_stainless' } });
    B.box(41.3, FL, 45.8, 0.7, 1.0, 3.0, { mat: 'wood_dark', mats: { t: 'p_stainless' } });
    B.prop('monitor', 43.2, FL + 1.0, 44.4, { ry: PI });
    for (const ax of [47.5, 51, 54.5]) for (const az of [44.6, 48.2]) B.prop('shelf_unit', ax, FL, az, { ry: HP, w: 2.4 });
    for (let i = 0; i < 4; i++) B.prop('vending_machine', 51.4 + i * 1.0, FL, 52.36, { ry: PI, variant: i % 2 ? 'snacks' : 'drinks' });
    B.prop('fridge', 55.6, FL, 52.4, { ry: PI }); B.prop('fridge', 56.4, FL, 52.4, { ry: PI });
    B.prop('atm', 58.8, FL, 41.66, { ry: 0 }); B.prop('newspaper_box', 46.4, FL, 41.66, {});
    // toilets (north-east block) and the storeroom (north-west)
    B.wall(60, 47, 60, 52.8, { y: FL, h: MH - 0.1, mat: 'tile_white', mat2: 'plaster_white', openings: [{ at: 2.2, w: 1.0, h: 2.2, frame: 'steel' }] });
    B.wall(60.1, 47, 65.8, 47, { y: FL, h: MH - 0.1, mat: 'tile_white', mat2: 'plaster_white' });
    B.prop('toilet_stall', 63.6, FL, 51.7, { n: 3, ry: PI, hide: true });
    B.prop('sink', 65.5, FL, 48.6, { ry: -HP, n: 1 });
    B.wall(40.2, 49.4, 46.5, 49.4, { y: FL, h: MH - 0.1, mat: 'plaster', mat2: 'plaster_white', openings: [{ at: 4.6, w: 1.0, h: 2.2, frame: 'steel' }] });
    B.wall(46.5, 49.3, 46.5, 52.8, { y: FL, h: MH - 0.1, mat: 'plaster_white', mat2: 'plaster' });
    B.prop('shelf_unit', 41.0, FL, 52.4, { ry: PI }); B.prop('shelf_unit', 42.4, FL, 52.4, { ry: PI, variant: 'grey' });
    B.prop('cardboard_box', 45.4, FL, 51.8, { variant: 'pile', n: 4 }); B.prop('pallet', 43.2, FL, 50.4, { variant: 'boxes' });
    B.hide(41.6, FL, 50.6, { kind: 'closet' });
    B.hostage(49.2, FL, 46.4); B.hostage(61.5, FL, 43.2);
    for (const [x, z] of [[46, 44], [52, 44], [52, 50], [46, 50]]) B.light({ x, y: FL + MH, z, intensity: 8, color: [1, 0.97, 0.92], fixture: 'panel' });
    B.prop('poster', 47, FL + 1.3, 52.79, { ry: PI, i: 4 }); B.prop('fire_extinguisher', 57.6, FL, 41.25, {});
    // roof kit
    B.prop('ac_unit', 47, FL + MH + 0.2, 48, { variant: 'hvac' }); B.prop('ac_unit', 60, FL + MH + 0.2, 45, { variant: 'condenser' });
    B.prop('vent', 55, FL + MH + 0.2, 50, { variant: 'mushroom' });
    // back lot (defenders' approach)
    road(B, 32, 54, 66, 62, 'asphalt', 0.03);
    B.prop('dumpster', 44, 0, 55.4, { ry: 0, hide: true }); B.prop('dumpster', 46.4, 0, 55.6, { variant: 'blue' });
    B.prop('wheelie_bin', 58, 0, 54.2, { variant: 'black' }); B.prop('trash_bag', 60, 0, 54.4, { n: 4 });
    B.prop('gas_cylinder', 63, 0, 54.0, { variant: 'propane', rack: true });
    B.prop('pallet', 36, 0, 56, { variant: 'none', stack: 8 }); B.prop('crate_stack', 38.5, 0, 58.5, { ry: 0.2, hide: true });
    B.prop('ac_unit', 66.6, 0, 44, { ry: HP, variant: 'condenser' });
    sign(B, 'noz', 59.5, 1.6, 40.85, 0.8, 0.4, { face: 's' });

    // ---------------------------------------------------------------- car wash (x 22..30, z 16..34), open both ends
    const WX = 30.5;
    B.floor(WX - 4, 16, WX + 4, 34, 0.04, { mat: 'tile_floor', t: 0.08, collide: false });
    for (const s of [-1, 1]) B.box(WX + s * 3.85, 0, 25, 0.3, 4.4, 18, { mat: 'concrete_panels', mats: { [s < 0 ? 'e' : 'w']: 'tile_white' } });
    B.box(WX, 4.4, 25, 8.4, 0.4, 18.2, { mat: 'metal_painted', mats: { b: 'corrugated' } });
    B.box(WX, 4.0, 16.05, 8.4, 0.4, 0.15, { mat: 'p_coat_blue', collide: false }); B.box(WX, 4.0, 33.95, 8.4, 0.4, 0.15, { mat: 'p_coat_blue', collide: false });
    sign(B, 'wash', WX, 3.3, 15.85, 2.6, 0.95, { face: 's' });
    for (const zz of [21, 27]) { B.box(WX - 2.6, 0, zz, 0.3, 3.2, 0.3, { mat: 'p_stainless' }); B.box(WX + 2.6, 0, zz, 0.3, 3.2, 0.3, { mat: 'p_stainless' }); B.box(WX, 3.0, zz, 5.5, 0.3, 0.3, { mat: 'p_stainless', collide: false }); }
    sign(B, 'oil2', WX, 0.05, 25, 2.4, 2.4, { face: 'u', stain: true });
    sign(B, 'graf0', WX - 3.69, 1.5, 22, 4, 1, { face: 'w' });
    B.prop('car', WX, 0, 30, { variant: 'hatch', color: 'green', ry: 0, seed: 1 });
    B.light({ x: WX, y: 4.4, z: 24, intensity: 5, color: [0.85, 0.92, 1], fixture: 'tube' });
    B.hide(WX - 2.8, 0, 17.4, { kind: 'dark' });
    B.prop('scan_wet_floor_sign', WX + 1.5, 0.04, 17, {});

    // ================================================================ T2 lobby: county highway depot (garage)
    const DX = 14, DZ = 73, DW = 32, DD = 14, DH = 6.2, GX = [4, 14, 24];
    const DY = 0.05;
    B.room({ x: DX, z: DZ, w: DW, d: DD, y: DY, h: DH, wall: 'concrete_panels', outer: 'corrugated', floor: 'concrete_floor', ceil: 'corrugated', roof: 'metal_painted', frames: false,
      doors: { s: GX.map(x => ({ at: x - (DX - DW / 2), w: 3.6, h: 4.0, frame: false })), e: [{ at: 4, w: 1.1, h: 2.2, frame: 'steel_dark' }] },
      windows: { n: [{ at: 6, w: 2.4, h: 1, y: 3.6 }, { at: 16, w: 2.4, h: 1, y: 3.6 }, { at: 26, w: 2.4, h: 1, y: 3.6 }] } });
    B.lobby(2, { x0: DX - DW / 2 + 0.2, z0: DZ - DD / 2 + 0.2, x1: DX + DW / 2 - 0.2, z1: DZ + DD / 2 - 0.2, y: DY }, GX.map(x => ({ x, z: DZ - DD / 2 + 0.1, w: 3.6, h: 4.0, ry: 0, y: DY })));
    B.buyzone(2, { x0: DX - DW / 2 + 0.2, z0: DZ - DD / 2 + 0.2, x1: DX + DW / 2 - 0.2, z1: DZ + DD / 2 - 0.2 });
    // the east side door is locked during the freeze: a solid door leaf (part of the lobby seal)
    B.box(DX + DW / 2 - 0.1, DY, DZ - DD / 2 + 4, 0.08, 2.2, 1.1, { mat: 'p_coat_slate' });
    sign(B, 'depot', DX, DH + 0.3 - 1.2, DZ - DD / 2 - 0.02, 5.6, 1.4, { face: 's' });
    B.box(DX, DY + DH + 0.2, DZ - DD / 2 - 0.35, DW + 0.6, 0.15, 0.7, { mat: 'metal_painted', collide: false });   // gutter / eave
    for (const x of [-1.6, 29.6]) B.cyl(x, 0, DZ - DD / 2 - 0.25, 0.06, DH, { mat: 'p_galv', sides: 8, collide: false });
    B.prop('box_truck', 0.6, DY, 74.8, { variant: 'plain', color: 'orange', ry: PI });
    B.prop('box_truck', 27.6, DY, 74.8, { variant: 'plain', color: 'orange', ry: PI });
    B.prop('shelf_unit', 8, DY, 79.4, { ry: PI, w: 2.4 }); B.prop('shelf_unit', 11, DY, 79.4, { ry: PI, w: 2.4, variant: 'grey' });
    B.box(17.5, DY, 79.3, 4, 0.9, 0.8, { mat: 'wood_dark', mats: { t: 'steel_dark' } });
    B.prop('lockers', 21.5, DY, 79.5, { ry: PI, n: 4, bench: false });
    B.prop('drum', 5, DY, 79.2, { variant: 'blue', n: 2 }); B.prop('scan_tyre', 3, DY, 79.5, {});
    for (const x of [5, 14, 23]) B.prop('light_fixture', x, DY + DH, 73, { variant: 'highbay', light: true, intensity: 16 });
    sign(B, 'oil0', 9, DY + 0.006, 72, 2, 2, { face: 'u', stain: true }); sign(B, 'oil1', 19, DY + 0.006, 74.6, 1.6, 1.6, { face: 'u', stain: true });
    for (let i = 0; i < 5; i++) for (let j = 0; j < 3; j++) B.spawn(2, 5 + i * 4.5, DY, 68.8 + j * 3.6, PI);
    // depot yard: apron, plough blades, salt barn, sand bags
    road(B, -2, 56, 32, 66, 'concrete_floor');
    for (const x of GX) paint(B, x - 1.8, 65, x + 1.8, 65.12, { mat: 'paint_yellow' });
    B.prop('pallet', 0, 0, 58.4, { variant: 'sacks', stack: 1 }); B.prop('pallet', 1.4, 0, 60, { variant: 'sacks' });
    B.prop('crate_stack', 30.5, 0, 59.5, { ry: -0.3, hide: true });
    for (const [x, z, ry] of [[-4, 60, 0.2], [34.6, 64.6, -0.4]]) { B.box(x, 0, z, 3.2, 1.1, 0.5, { mat: 'p_coat_yellow', ry }); }
    B.prop('cone', 9, 0, 60, { n: 1 }); B.prop('cone', 19.5, 0, 59, {});
    // salt barn (open front to the south)
    B.box(49, 0, 79.75, 18, 2.4, 0.5, { mat: 'concrete_panels' });
    B.box(40.25, 0, 76, 0.5, 2.4, 8, { mat: 'concrete_panels' }); B.box(57.75, 0, 76, 0.5, 2.4, 8, { mat: 'concrete_panels' });
    B.box(49, 2.4, 76, 19, 0.3, 9, { mat: 'wood_planks', collide: false });
    for (const x of [41, 45, 49, 53, 57]) B.box(x, 0, 72.4, 0.3, 2.4, 0.3, { mat: 'wood_dark' });
    B.prop('pallet', 52, 0, 77, { variant: 'sacks', stack: 2 }); B.prop('pallet', 54, 0, 78.4, { variant: 'sacks' });
    B.prop('cone', 46, 0, 73, {});
    B.box(49, 2.7, 76, 19.4, 1.6, 9.4, { mat: 'metal_rust', skip: 'b', collide: false });
    sign(B, 'salt', 49, 1.8, 71.73, 2.4, 0.6, { face: 's' });
    B.hide(42, 0, 77.6, { kind: 'dark' });
    // truck park (north-east)
    road(B, 62, 60, 92, 90, 'asphalt', 0.02);
    for (const [x, z, ry] of [[68, 72, 0], [74, 74, 0.05], [80, 71, 0], [86, 75, -0.03]]) { B.prop('semi_trailer', x, 0, z, { variant: B.rand() < 0.5 ? 'box' : 'flat', ry }); }
    B.prop('truck_tractor', 74, 0, 84.5, { ry: 0.05, variant: 'red' }); B.prop('truck_tractor', 86, 0, 86, { ry: -0.03, variant: 'white' });
    for (const [x, z, v] of [[94, 60, 'spruce'], [92, 90, 'pine'], [60, 90, 'spruce'], [38, 88, 'oak'], [94, 30, 'oak'], [93, 0, 'poplar']]) B.prop('tree', x, 0, z, { variant: v });

    // ================================================================ east lane (frontage track x 84..96)
    road(B, 85, -63, 92, 92, 'gravel', 0.015);
    for (let z = -60; z < 92; z += 30) B.prop('utility_pole', 94.5, 0, z, { span: 30, h: 10 });
    B.prop('car', 88, 0, -20, { variant: 'pickup', color: 'brown', ry: 0.1, seed: 1, state: 'wreck', hide: true });
    B.prop('car', 89, 0, 26, { variant: 'sedan', color: 'grey', ry: -0.15, seed: 1 });
    B.prop('box_truck', 89, 0, 2, { variant: 'plain', ry: 0.02 });

    // ================================================================ perimeter seal + out-of-bounds views
    // the highway continues: queue of cars beyond the police line (south) and the north edge
    for (const [x, z0, dir] of [[SB[0], -100, -1], [SB[1], -96, -1], [SB[2], -104, -1]]) lane(B, x, z0, dir, ['c', 'c', 'b', 'c', 'c', 'c']);
    lane(B, SB[0], 128, -1, ['c', 'c', 'c', 'c', 'c']); lane(B, SB[1], 124, -1, ['c', 'b', 'c', 'c']); lane(B, SB[2], 130, -1, ['t', 'c', 'c', 'c']);
    // bounds fences (chain-link) along the field edges, noise walls along the road
    for (let x = -94; x < 94; x += 6) { if (x > -36 && x < -4) continue; B.prop('fence', x + 3, 0, -91.6, { len: 6, variant: 'barbed' }); B.prop('fence', x + 3, 0, 91.6, { len: 6 }); }
    for (let z = -88; z < 92; z += 6) { if (z > -6 && z < 8) continue; B.prop('fence', -95.6, 0, z + 3, { len: 6, ry: HP }); B.prop('fence', 95.6, 0, z + 3, { len: 6, ry: HP }); }
    for (const [x, z, ry] of [[-94.5, 1, HP], [94.5, 1, HP]]) { B.prop('jersey_barrier', x, 0, z, { ry, len: 12 }); }
    sign(B, 'closed', -94.2, 1.1, 1, 1.2, 0.6, { face: 'e' }); sign(B, 'closed', 94.2, 1.1, 1, 1.2, 0.6, { face: 'w' });
    B.prop('car', -100, 0, 3, { variant: 'police', ry: HP + 0.3, seed: 2, collide: false }); B.prop('car', 101, 0, -1, { variant: 'police', ry: -HP + 0.2, seed: 3, collide: false });
    skyline(B, 40, 150, 230, 150, { face: 's', h: 24, depth: 20, step: 18, yf: hills });
    skyline(B, -230, -170, -60, -170, { face: 'n', h: 18, depth: 18, step: 16, yf: hills });
    skyline(B, 170, -150, 170, 60, { face: 'w', h: 30, depth: 22, step: 20, yf: hills });
    for (let i = 0; i < 40; i++) {
      const a = i / 40 * PI * 2, R = 118 + (i * 37 % 5) * 9, x = Math.cos(a) * R * 1.05, z = Math.sin(a) * R;
      if (Math.abs(x + 20) < 22 || Math.abs(z - 1) < 14) continue;
      B.prop('tree', x, hills(x, z) - 0.3, z, { variant: ['spruce', 'oak', 'pine', 'poplar', 'spruce'][i % 5], collide: false });
    }
    for (const [x, z] of [[-150, 40], [-150, -60], [150, 110], [-60, 150]]) { const y = hills(x, z) - 0.5; B.box(x, y, z, 1.2, 38, 1.2, { mat: 'p_galv', collide: false, cast: false }); B.box(x, y + 30, z, 12, 0.6, 1.0, { mat: 'p_galv', collide: false, cast: false }); B.box(x, y + 36, z, 8, 0.6, 1.0, { mat: 'p_galv', collide: false, cast: false }); }

    // ================================================================ objectives
    B.site('B', { x0: 36, z0: 21, x1: 62, z1: 37 });
    B.hostage(30.5, 0, 22.5);   // car wash (a fifth)
    B.rescue({ x0: -32, z0: -68.5, x1: -22, z1: -60 });
    B.point('dom1', -56, null, -16, 4); B.point('dom2', 6, null, -6, 4); B.point('dom3', 64, null, -14, 4);
    B.point('hp1', -26, null, 36, 5); B.point('hp2', -44, null, -2, 5); B.point('hp3', 28, TOP, 1, 5); B.point('hp4', 53, FL, 47, 5); B.point('hp5', 18, null, -40, 5);
    B.point('hill', 10, null, -14, 5);
    B.point('flag1', -20, null, -64, 1.5); B.point('flag2', 14, null, 61, 1.5);
    B.point('extract1', -84, null, 36, 4); B.point('extract2', 88, null, 66, 4); B.point('extract3', 89, null, -50, 4);
    B.point('hq1', -60, FL + U, 36, 3); B.point('hq2', 26, null, -40, 4);

    // ================================================================ field (respawn) spawns + FFA
    for (const [x, z, yaw] of [[-72, -52, 0.6], [-52, -66, 0.3], [-44, -30, 0.5], [-80, -14, 1.2], [-1, -46, 0.1], [12, -58, 0.2], [40, -56, -0.4], [58, -46, -0.6], [76, -58, -0.5], [90, -32, -0.3], [-8, -60, 0.1]])
      B.spawn(1, x, null, z, yaw, { field: true });
    for (const [x, z, yaw] of [[-86, 56, 2.6], [-70, 80, 2.8], [-44, 64, 3.0], [-2, 52, 3.1], [34, 60, -2.8], [56, 62, -3.0], [82, 62, -2.6], [90, 40, -2.6], [60, 86, 3.1], [-40, 70, 3.0]])
      B.spawn(2, x, null, z, yaw, { field: true });
    for (const [x, y, z] of [[-80, null, -70], [-56, null, -16], [-40, null, 0], [-80, null, 30], [-70, null, 64], [-40, null, 84], [-58, FL + U, 33], [-12.6, null, 30], [10, null, 40], [6, null, -32],
      [34, null, 0], [26, TOP, -1], [52, FL, 45], [72, null, 44], [90, null, 14], [86, null, -46], [60, null, -72], [20, null, -76], [46, CH, -40], [-12, null, 70], [-44, TOP, -1]])
      B.spawn(0, x, y, z, Math.atan2(-x, -z));
  },
};
