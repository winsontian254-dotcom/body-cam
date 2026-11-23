/* LIVE FIRE — nightclub kit: map-specific materials, canvas atlases and prefabs used by js/maps/defs/nightclub.js (owned by the
   nightclub map). Original artwork only (fictional names: VELVET, Hollis Street, Brightwater Ales, Kestrel Linen...).
   Exports (all take the MapBuilder B; coordinates follow the current B.push frame):
     nc(B)                                    per-build state
     decal(B, atlas, slot, x, y, z, w, h, o)  quad from an atlas: 'stain' (alpha blend), 'sign' (alpha test), 'glow' (emissive,
                                              alpha blend); o.face n|s|e|w|u|d (which way the quad faces), o.ry, o.col, o.flipU
     paint(B, x0, z0, x1, z1, o)              painted stripe on a floor (o.w, o.col, o.dash [on, off], o.y)
     slab(B, x0, z0, x1, z1, y0, y1, holes, o) a slab minus rectangular holes (holes: [{x0,z0,x1,z1}]), o = box opts
     rail(B, x0, z0, x1, z1, y, o)            steel / brass railing with a movement-only collider (o.h, o.mat, o.glass, o.collide)
     strip(B, x0, y0, z0, x1, y1, z1, mat, s) emissive LED strip (box of thickness s) from point to point (axis-aligned runs)
     keg(B, x, y, z, o)                       steel beer keg (o.lying)
     speaker(B, x, y, z, ry, o)               PA cabinet stack (o.n cabinets, o.sub)
     truss(B, x0, z0, x1, z1, y)              square aluminium truss run (axis-aligned)
     finish(B)                                flushes the accumulated quads (call once at the end of build)
     castOnly(B, fn)                          from here on, box / cyl / mesh geometry only casts sun shadows when fn(x, y, z) of its
                                              world centre is true (interiors never see the sun: halves the shadow draw calls)
     guardNavDrops(B)                         WORKAROUND for a navgrid.js bug: buildNav makes drop / mantle links from a ledge to
                                              any lower node within 3.5 m in the next 1-3 cells, testing only a horizontal segment
                                              at body height, so a node beside a wall or prop on an upper storey gets a "drop"
                                              THROUGH the floor slab to whatever stands below (bar stools, shelves). This wraps
                                              B.finish() and neutralises (self-links) every drop / mantle whose landing column
                                              is blocked; a no-op once navgrid.js checks the column itself.
   Materials registered into the library at import: nc_* (see EXTRA). */
import { MATERIALS } from '../gfx/materials.js';
import { segmentClear } from '../phys/ray.js';

const TAU = Math.PI * 2;
const PM = (surf, set, scale, o) => Object.assign({ surf, set, tex: set ? 'assets/textures/' + set : null, scale }, o);
const EM = (col, e) => ({ surf: 'glass', set: null, tex: null, scale: 1, kind: 'emissive', col, emissive: e });
const EXTRA = {
  nc_brick: PM('brick', 'brick', 1.5, { color: '#6e4a3c', desat: .3, macro: .22, por: .7, parallax: .02, col: [.45, .3, .24], proc: 'brick' }),
  nc_brick_dark: PM('brick', 'brick_red', 2.0, { color: '#4a3029', desat: .4, macro: .2, por: .7, parallax: .02, col: [.3, .2, .17], proc: 'brick' }),
  nc_brick_paint: PM('brick', 'brick', 1.5, { color: '#2a2a2d', desat: 1, macro: .16, por: .5, col: [.17, .17, .18], proc: 'brick' }),
  nc_render: PM('plaster', 'plaster', 1.6, { color: '#7b776f', desat: .7, macro: .24, anti: 1, por: .6, col: [.5, .48, .45], proc: 'noise' }),
  nc_black: PM('plaster', 'plaster_white', 2.0, { color: '#1b1a1c', desat: 1, macro: .12, anti: 1, por: .4, col: [.1, .1, .11], proc: 'noise' }),
  nc_plum: PM('plaster', 'plaster_white', 2.0, { color: '#3a1f33', desat: 1, macro: .12, anti: 1, por: .4, col: [.23, .12, .2], proc: 'noise' }),
  nc_midnight: PM('plaster', 'plaster_white', 2.0, { color: '#262c44', desat: 1, macro: .12, anti: 1, por: .4, col: [.11, .13, .21], proc: 'noise' }),
  nc_cream: PM('plaster', 'plaster_white', 2.0, { color: '#c9c0ad', desat: .8, macro: .1, anti: 1, por: .5, col: [.79, .75, .68], proc: 'noise' }),
  nc_velvet: PM('fabric', 'fabric', .5, { color: '#5a1222', desat: 1, macro: .12, por: 1, col: [.35, .07, .13], proc: 'noise' }),
  nc_velvet_blue: PM('fabric', 'fabric', .5, { color: '#1b2550', desat: 1, macro: .12, por: 1, col: [.1, .14, .31], proc: 'noise' }),
  nc_carpet: PM('carpet', 'carpet', 1.0, { color: '#2e1626', desat: .7, macro: .12, por: 1, col: [.18, .09, .15], proc: 'noise' }),
  nc_carpet_office: PM('carpet', 'carpet', 1.0, { color: '#3b3d42', desat: .8, macro: .1, por: 1, col: [.23, .24, .26], proc: 'noise' }),
  nc_floor_black: PM('tile', 'tile_floor', 1.2, { color: '#1c1c1f', desat: 1, rough: .55, macro: .08, por: .1, col: [.11, .11, .12], proc: 'tile' }),
  nc_floor_hall: PM('tile', 'concrete_floor', 3.0, { color: '#36363c', desat: .9, rough: .45, macro: .12, por: .1, col: [.21, .21, .23], proc: 'noise' }),
  nc_terrazzo: PM('tile', 'marble', 1.5, { color: '#5d5a58', desat: .8, macro: .08, rough: .6, por: .1, col: [.37, .35, .35], proc: 'noise' }),
  nc_quarry: PM('tile', 'tile_floor', 1.2, { color: '#7a3e2c', desat: .6, rough: .8, macro: .12, por: .2, puddle: .3, col: [.48, .24, .17], proc: 'tile' }),
  nc_tile_wall: PM('tile', 'tile_white', 1.0, { color: '#d7d6cf', desat: 1, macro: .08, rough: .7, por: .1, col: [.84, .84, .81], proc: 'tile' }),
  nc_tile_green: PM('tile', 'tile_white', 1.0, { color: '#3f5e55', desat: 1, macro: .1, rough: .6, por: .1, col: [.25, .37, .33], proc: 'tile' }),
  nc_wood_bar: PM('wood', 'wood_dark', 2.0, { color: '#3a2216', desat: .2, rough: .6, macro: .08, por: .3, col: [.23, .13, .09], proc: 'wood' }),
  nc_wood_stage: PM('wood', 'wood_floor', 1.7, { color: '#2a201b', desat: .5, rough: .7, macro: .1, por: .3, col: [.17, .12, .1], proc: 'wood' }),
  nc_brass: PM('metal', 'steel', 1.5, { color: '#b08a3e', desat: 1, rough: .35, metal: 1.2, macro: .05, por: .02, col: [.69, .54, .24], proc: 'metal' }),
  nc_chrome: PM('metal', 'steel', 1.5, { color: '#c9ccd0', desat: 1, rough: .25, macro: .03, por: .02, col: [.8, .8, .82], proc: 'metal' }),
  nc_stainless: PM('metal', 'steel', 1.5, { color: '#a7aaad', desat: 1, rough: .55, macro: .06, por: .02, col: [.65, .66, .68], proc: 'metal' }),
  nc_keg: PM('metal', 'steel', 1.5, { color: '#7d8084', desat: 1, rough: .6, macro: .1, por: .02, col: [.49, .5, .52], proc: 'metal' }),
  nc_alu: PM('metal', 'steel', 1.5, { color: '#b6b8ba', desat: 1, rough: .45, macro: .05, por: .02, col: [.71, .72, .73], proc: 'metal' }),
  nc_door_steel: PM('metal', 'painted_metal', 2.0, { color: '#2c3a36', desat: 1, macro: .16, por: .1, col: [.17, .23, .21], proc: 'metal' }),
  nc_door_red: PM('metal', 'painted_metal', 2.0, { color: '#6a1b16', desat: .8, macro: .16, por: .1, col: [.42, .1, .09], proc: 'metal' }),
  nc_mirror: PM('glass', 'steel', 1.5, { color: '#5b6066', desat: 1, rough: .08, metal: 1.4, macro: .02, por: 0, col: [.36, .38, .4], proc: 'metal' }),
  nc_rubber_mat: PM('rubber', 'rubber', .75, { color: '#151515', desat: 1, macro: .1, por: .1, col: [.08, .08, .08], proc: 'noise' }),
  nc_asphalt: PM('asphalt', 'asphalt', 3.0, { color: '#2b2b2c', desat: .6, macro: .2, anti: 1, por: .55, wet: .55, puddle: .7, col: [.15, .15, .16], proc: 'noise' }),
  nc_cobble: PM('concrete', 'cobblestone', 1.6, { color: '#4b4846', desat: .6, macro: .18, por: .5, wet: .5, puddle: .6, parallax: .02, col: [.3, .29, .28], proc: 'tile' }),
  nc_kerb: PM('concrete', 'concrete_wall', 2.0, { color: '#6d6a65', desat: .7, macro: .22, por: .6, wet: .35, col: [.44, .42, .4], proc: 'noise' }),
  nc_led_pink: EM([1, .16, .62], 2.4), nc_led_cyan: EM([.2, .85, 1], 2.2), nc_led_violet: EM([.55, .25, 1], 2.0), nc_led_amber: EM([1, .62, .24], 2.4),
  nc_led_red: EM([1, .1, .08], 5), nc_led_green: EM([.25, 1, .4], 4), nc_sodium: EM([1, .58, .26], 5), nc_window_warm: EM([1, .72, .45], .26),
  nc_window_cool: EM([.55, .65, .85], .32), nc_screen: EM([.4, .55, 1], .9), nc_exit: EM([.2, 1, .4], 3),
  nc_dance_a: EM([.85, .15, .7], .5), nc_dance_b: EM([.15, .45, 1], .45), nc_dance_c: EM([.4, .1, .9], .4),
};
for (const k in EXTRA) if (!MATERIALS[k]) MATERIALS[k] = EXTRA[k];

export function nc(B) { if (!B._nc) B._nc = { acc: new Map() }; return B._nc; }
export function rng(seed) { let a = seed >>> 0 || 1; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// ------------------------------------------------------------------------------------------------ atlases
const ATL = 1024;
const STAIN = { oil0: [0, 0, 256, 256], oil1: [256, 0, 256, 256], drip: [512, 0, 256, 256], crack: [768, 0, 256, 256],
  grime: [0, 256, 256, 128], rust: [256, 256, 128, 256], water: [384, 256, 128, 256], dust: [512, 256, 256, 256], puddle: [768, 256, 256, 128],
  litter: [0, 512, 256, 256], butts: [256, 512, 256, 256], soot: [512, 512, 256, 256], patch: [768, 512, 256, 256], spill: [0, 768, 256, 256],
  scuff: [256, 768, 256, 256], graffiti: [512, 768, 512, 256] };
const SIGN = { arrowL: [0, 0, 128, 128], arrowR: [128, 0, 128, 128], exitman: [256, 0, 192, 128], wc: [448, 0, 192, 128], noentry: [640, 0, 128, 128],
  fire: [768, 0, 128, 128], hv: [896, 0, 128, 128], tag1: [0, 128, 256, 128], tag2: [256, 128, 256, 128], tag3: [512, 128, 256, 128], poster0: [768, 128, 128, 192],
  poster1: [896, 128, 128, 192], poster2: [0, 896, 128, 128], poster3: [128, 896, 128, 128], cctv: [256, 896, 256, 128], wet: [512, 896, 128, 128],
  hazard: [640, 896, 384, 64], plate: [640, 960, 384, 64] };
const TEXTS = [
  ['stage', 'STAGE DOOR · NO ENTRY', '#1d1d1f', '#e8e2d2'], ['deliv', 'DELIVERIES · RING BELL', '#e9e6dc', '#26303a'],
  ['fireexit', 'FIRE EXIT · KEEP CLEAR', '#1e6b2e', '#f2f2ee'], ['nopark', 'NO PARKING · ACCESS 24 HRS', '#e9e6dc', '#8e1d18'],
  ['kitchen', 'KITCHEN · STAFF ONLY', '#e9e6dc', '#8e1d18'], ['cellar', 'CELLAR · AUTHORISED STAFF', '#e9e6dc', '#26303a'],
  ['office', 'MANAGEMENT · PRIVATE', '#2a201b', '#d9b260'], ['plant', 'PLANT ROOM · DANGER', '#f2c230', '#141414'],
  ['cloak', 'CLOAKROOM', '#151515', '#d9b260'], ['tickets', 'TICKETS · GUESTLIST', '#151515', '#d9b260'], ['wcs', 'RESTROOMS', '#151515', '#e8e2d2'],
  ['bar', 'BAR', '#151515', '#d9b260'], ['vip', 'VIP · RESERVED', '#151515', '#d9b260'], ['dock', 'BAY 3 · HOLLIS ST. LOGISTICS', '#e9e6dc', '#1d2a36'],
  ['hollis', 'HOLLIS LANE', '#1f4f3a', '#f2f0ea'], ['keg', 'BRIGHTWATER ALES · RETURNS', '#e9e6dc', '#6a1b16'], ['laundry', 'KESTREL LINEN SERVICE', '#e9e6dc', '#1f4f6e'],
  ['capacity', 'MAX CAPACITY 380', '#e9e6dc', '#141414'], ['nosmoke', 'NO SMOKING BEYOND THIS POINT', '#e9e6dc', '#8e1d18'], ['dj', 'DJ BOOTH · NO DRINKS', '#151515', '#e8e2d2'],
  ['cold', 'COLD ROOM 3°C · CLOSE DOOR', '#e9e6dc', '#1f4f6e'], ['staff', 'STAFF ONLY', '#e9e6dc', '#8e1d18'],
];
TEXTS.forEach((t, i) => { SIGN[t[0]] = [(i % 2) * 512, 320 + Math.floor(i / 2) * 52, 512, 48]; });
const GLOW = { velvet: [0, 0, 1024, 220], open: [0, 220, 320, 120], bar: [320, 220, 320, 120], exit: [640, 220, 192, 80], dance: [0, 340, 512, 140],
  heart: [832, 220, 192, 192], arrow: [512, 340, 256, 120], lips: [768, 412, 256, 160], strip: [0, 480, 512, 48], screen: [0, 528, 256, 160],
  screen2: [256, 528, 256, 160], blind: [512, 572, 128, 128], curtain: [640, 572, 128, 128], town: [0, 700, 1024, 200], menu: [768, 572, 256, 128],
  dot: [512, 480, 64, 64], cocktail: [576, 480, 192, 92] };

function text(g, s, x, y, size, o = {}) {
  g.font = (o.weight || 'bold') + ' ' + size + 'px ' + (o.font || 'Arial, Helvetica, sans-serif');
  g.textAlign = o.align || 'center'; g.textBaseline = 'middle'; g.fillStyle = o.color || '#fff';
  const m = g.measureText(s).width;
  if (o.maxW && m > o.maxW) { g.save(); g.translate(x, y); g.scale(o.maxW / m, 1); g.fillText(s, 0, 0); g.restore(); } else g.fillText(s, x, y);
}
function speck(g, w, h, seed, n, col, a0, a1, r0, r1) {
  const r = rng(seed);
  for (let i = 0; i < n; i++) { g.fillStyle = col.replace('A', (a0 + r() * (a1 - a0)).toFixed(3)); const rr = r0 + r() * (r1 - r0); g.beginPath(); g.arc(r() * w, r() * h, rr, 0, TAU); g.fill(); }
}
function blob(g, cx, cy, R, seed, col, k = 1) {
  const r = rng(seed);
  for (let i = 0; i < 24; i++) {
    const a = r() * TAU, d = r() * R * .55, x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d * (.6 + r() * .5), rr = R * (.18 + r() * .38);
    const gr = g.createRadialGradient(x, y, 0, x, y, rr);
    gr.addColorStop(0, col.replace('A', (.22 * k * (.6 + r() * .6)).toFixed(3))); gr.addColorStop(1, col.replace('A', '0'));
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, rr, 0, TAU); g.fill();
  }
}
const inSlot = (g, R, s, fn) => { const [x, y, w, h] = R[s]; g.save(); g.translate(x, y); g.beginPath(); g.rect(0, 0, w, h); g.clip(); fn(w, h); g.restore(); };
function drawStain(g) {
  g.clearRect(0, 0, ATL, ATL);
  const at = (s, fn) => inSlot(g, STAIN, s, fn);
  ['oil0', 'oil1'].forEach((s, i) => at(s, (w, h) => { blob(g, w / 2, h / 2, w * .42, 11 + i * 7, 'rgba(14,11,9,A)', 1.5); blob(g, w * .45, h * .5, w * .2, 31 + i, 'rgba(8,7,6,A)', 1.5); speck(g, w, h, 5 + i, 40, 'rgba(10,9,8,A)', .1, .4, 1, 4); }));
  at('drip', (w, h) => { for (let i = 0; i < 7; i++) blob(g, 30 + (i * 37) % 200, 30 + (i * 71) % 200, 20 + (i * 13) % 26, 70 + i, 'rgba(12,10,8,A)', 1.3); });
  at('crack', (w, h) => { const r = rng(12); g.strokeStyle = 'rgba(12,10,9,.7)'; g.lineCap = 'round'; for (let k = 0; k < 4; k++) { let x = w * r(), y = h * r(); g.lineWidth = 1.5 + r() * 2; g.beginPath(); g.moveTo(x, y); for (let i = 0; i < 14; i++) { x += (r() - .5) * 40; y += (r() - .3) * 26; g.lineTo(x, y); } g.stroke(); } });
  at('grime', (w, h) => { const gr = g.createLinearGradient(0, h, 0, 0); gr.addColorStop(0, 'rgba(30,24,18,.65)'); gr.addColorStop(.5, 'rgba(30,24,18,.22)'); gr.addColorStop(1, 'rgba(30,24,18,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); speck(g, w, h, 3, 90, 'rgba(30,24,18,A)', .05, .3, 1, 5); });
  at('rust', (w, h) => { const r = rng(4); for (let i = 0; i < 18; i++) { const x = w * .5 + (r() - .5) * w * .6, L = h * (.3 + r() * .7), gr = g.createLinearGradient(0, 0, 0, L); gr.addColorStop(0, 'rgba(110,52,20,.55)'); gr.addColorStop(1, 'rgba(110,52,20,0)'); g.fillStyle = gr; g.fillRect(x, 0, 2 + r() * 5, L); } });
  at('water', (w, h) => { const r = rng(6); for (let i = 0; i < 26; i++) { const x = r() * w, L = h * (.4 + r() * .6), gr = g.createLinearGradient(0, 0, 0, L); gr.addColorStop(0, 'rgba(30,28,26,.45)'); gr.addColorStop(1, 'rgba(30,28,26,0)'); g.fillStyle = gr; g.fillRect(x, 0, 2 + r() * 7, L); } });
  at('dust', (w, h) => { blob(g, w / 2, h / 2, w * .45, 41, 'rgba(120,110,95,A)', 1.3); speck(g, w, h, 42, 140, 'rgba(130,118,100,A)', .05, .3, 1, 3); });
  at('puddle', (w, h) => { g.fillStyle = 'rgba(5,6,8,.55)'; g.beginPath(); const r = rng(8); for (let i = 0; i < 24; i++) { const a = i / 24 * TAU; g.lineTo(w / 2 + Math.cos(a) * (w * .42 + r() * 18), h / 2 + Math.sin(a) * (h * .36 + r() * 10)); } g.closePath(); g.fill(); });
  at('litter', (w, h) => { const r = rng(21); for (let i = 0; i < 18; i++) { g.save(); g.translate(20 + r() * (w - 40), 20 + r() * (h - 40)); g.rotate(r() * TAU); const c = r(); g.fillStyle = c < .35 ? 'rgba(225,222,210,.95)' : c < .55 ? 'rgba(170,150,110,.95)' : c < .7 ? 'rgba(160,30,25,.9)' : c < .85 ? 'rgba(40,90,140,.9)' : 'rgba(200,170,40,.9)'; g.fillRect(-6 - r() * 10, -4 - r() * 6, 10 + r() * 16, 7 + r() * 10); g.restore(); } });
  at('butts', (w, h) => { const r = rng(23); for (let i = 0; i < 40; i++) { g.save(); g.translate(10 + r() * (w - 20), 10 + r() * (h - 20)); g.rotate(r() * TAU); g.fillStyle = 'rgba(235,230,220,.95)'; g.fillRect(-5, -1.5, 8, 3); g.fillStyle = 'rgba(200,130,60,.95)'; g.fillRect(3, -1.5, 3, 3); g.restore(); } speck(g, w, h, 24, 60, 'rgba(40,40,40,A)', .1, .4, 1, 3); });
  at('soot', (w, h) => { const gr = g.createRadialGradient(w / 2, h, 0, w / 2, h * .6, w * .6); gr.addColorStop(0, 'rgba(8,8,8,.65)'); gr.addColorStop(1, 'rgba(8,8,8,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
  at('patch', (w, h) => { const r = rng(15); g.fillStyle = 'rgba(16,16,17,.5)'; g.beginPath(); for (let i = 0; i < 16; i++) { const a = i / 16 * TAU; g.lineTo(w / 2 + Math.cos(a) * (w * .38 + r() * 14), h / 2 + Math.sin(a) * (h * .34 + r() * 14)); } g.closePath(); g.fill(); speck(g, w, h, 16, 60, 'rgba(0,0,0,A)', .05, .2, 1, 3); });
  at('spill', (w, h) => { blob(g, w / 2, h / 2, w * .35, 51, 'rgba(70,30,40,A)', 1.4); speck(g, w, h, 52, 30, 'rgba(70,30,40,A)', .2, .5, 2, 6); });
  at('scuff', (w, h) => { const r = rng(57); g.strokeStyle = 'rgba(10,10,10,.35)'; g.lineCap = 'round'; for (let i = 0; i < 40; i++) { g.lineWidth = 1 + r() * 3; const x = r() * w, y = r() * h, a = r() * TAU, L = 10 + r() * 40; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * L, y + Math.sin(a) * L); g.stroke(); } });
  at('graffiti', (w, h) => {
    const r = rng(91); g.lineCap = 'round'; g.lineJoin = 'round';
    const cols = ['rgba(40,170,200,.85)', 'rgba(220,60,140,.85)', 'rgba(240,230,220,.9)', 'rgba(250,190,40,.85)'];
    for (let k = 0; k < 3; k++) { g.strokeStyle = cols[k]; g.lineWidth = 10 - k * 3; g.beginPath(); let x = 30 + k * 20, y = h * .6; g.moveTo(x, y); for (let i = 0; i < 18; i++) { x += 18 + r() * 12; y = h * (.3 + r() * .45); g.quadraticCurveTo(x - 10, y - 30 * (r() - .5), x, y); } g.stroke(); }
    text(g, 'NOVA', w * .55, h * .5, 120, { color: 'rgba(250,250,250,.0)' });
    g.font = 'bold italic 110px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 9; g.strokeStyle = 'rgba(15,15,20,.9)'; g.strokeText('NOVA', w * .55, h * .52); g.fillStyle = 'rgba(220,60,140,.9)'; g.fillText('NOVA', w * .55, h * .52);
    speck(g, w, h, 92, 140, 'rgba(220,60,140,A)', .2, .6, .5, 2);
  });
}
function stencil(g, ch, w, h, col) {
  g.fillStyle = col; g.font = 'bold ' + Math.round(h * .9) + 'px Arial, Helvetica, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(ch, w / 2, h * .54);
}
function drawSign(g) {
  g.clearRect(0, 0, ATL, ATL);
  const at = (s, fn) => inSlot(g, SIGN, s, fn);
  const arrow = (w, h, dir) => { g.save(); g.translate(w / 2, h / 2); g.scale(dir, 1); g.fillStyle = '#1e6b2e'; g.fillRect(-w / 2, -h / 2, w, h); g.fillStyle = '#fff'; g.beginPath(); g.moveTo(-40, -12); g.lineTo(10, -12); g.lineTo(10, -34); g.lineTo(48, 0); g.lineTo(10, 34); g.lineTo(10, 12); g.lineTo(-40, 12); g.closePath(); g.fill(); g.restore(); };
  at('arrowL', (w, h) => arrow(w, h, -1)); at('arrowR', (w, h) => arrow(w, h, 1));
  at('exitman', (w, h) => { g.fillStyle = '#1e6b2e'; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; g.fillRect(w - 70, 14, 52, h - 28); g.fillStyle = '#1e6b2e'; g.fillRect(w - 62, 22, 36, h - 44);
    g.fillStyle = '#fff'; g.beginPath(); g.arc(70, 34, 13, 0, TAU); g.fill(); g.lineWidth = 12; g.strokeStyle = '#fff'; g.lineCap = 'round'; g.beginPath(); g.moveTo(66, 52); g.lineTo(56, 84); g.lineTo(80, 108); g.moveTo(56, 84); g.lineTo(30, 104); g.moveTo(62, 60); g.lineTo(96, 66); g.moveTo(62, 60); g.lineTo(40, 74); g.stroke(); });
  at('wc', (w, h) => { g.fillStyle = '#1a1a1c'; g.fillRect(0, 0, w, h); g.fillStyle = '#e8e2d2'; for (const [cx, skirt] of [[56, 0], [136, 1]]) { g.beginPath(); g.arc(cx, 28, 11, 0, TAU); g.fill(); if (skirt) { g.beginPath(); g.moveTo(cx - 14, 44); g.lineTo(cx + 14, 44); g.lineTo(cx + 22, 92); g.lineTo(cx - 22, 92); g.closePath(); g.fill(); } else g.fillRect(cx - 13, 44, 26, 48); g.fillRect(cx - 10, 90, 8, 26); g.fillRect(cx + 2, 90, 8, 26); } g.fillRect(w / 2 - 2, 14, 4, h - 28); });
  at('noentry', (w, h) => { g.fillStyle = '#c21d14'; g.beginPath(); g.arc(w / 2, h / 2, 58, 0, TAU); g.fill(); g.fillStyle = '#fff'; g.fillRect(18, h / 2 - 11, w - 36, 22); });
  at('fire', (w, h) => { g.fillStyle = '#c21d14'; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; g.beginPath(); g.moveTo(64, 18); g.bezierCurveTo(100, 50, 96, 100, 64, 110); g.bezierCurveTo(30, 100, 30, 60, 50, 46); g.bezierCurveTo(52, 66, 60, 70, 64, 60); g.bezierCurveTo(70, 46, 60, 30, 64, 18); g.fill(); });
  at('hv', (w, h) => { g.fillStyle = '#f2c230'; g.beginPath(); g.moveTo(w / 2, 8); g.lineTo(w - 8, h - 12); g.lineTo(8, h - 12); g.closePath(); g.fill(); g.lineWidth = 6; g.strokeStyle = '#141414'; g.stroke(); g.fillStyle = '#141414'; g.beginPath(); g.moveTo(70, 40); g.lineTo(52, 76); g.lineTo(66, 76); g.lineTo(56, 104); g.lineTo(80, 66); g.lineTo(66, 66); g.lineTo(76, 40); g.closePath(); g.fill(); });
  const tag = (w, h, s, col, seed) => { g.save(); g.translate(w / 2, h / 2); g.rotate(-.08); g.font = 'bold italic 64px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 7; g.strokeStyle = 'rgba(10,10,10,.9)'; g.strokeText(s, 0, 0); g.fillStyle = col; g.fillText(s, 0, 0); g.restore(); speck(g, w, h, seed, 60, col.replace(/[\d.]+\)$/, 'A)'), .2, .6, .5, 2); };
  at('tag1', (w, h) => tag(w, h, 'R3KZ', 'rgba(240,240,240,.95)', 61)); at('tag2', (w, h) => tag(w, h, 'ZEPH', 'rgba(60,190,230,.95)', 62)); at('tag3', (w, h) => tag(w, h, 'OKAY!', 'rgba(250,190,40,.95)', 63));
  const poster = (w, h, bg, fg, title, sub, i) => { g.fillStyle = bg; g.fillRect(0, 0, w, h); const r = rng(70 + i); for (let k = 0; k < 6; k++) { g.fillStyle = `rgba(255,255,255,${.05 + r() * .12})`; g.beginPath(); g.arc(r() * w, r() * h * .6, 10 + r() * 40, 0, TAU); g.fill(); }
    text(g, title, w / 2, h * .62, 30, { color: fg, maxW: w - 12 }); text(g, sub, w / 2, h * .76, 12, { color: '#eee', maxW: w - 14 }); text(g, 'FRI · SAT · 22:00', w / 2, h * .88, 11, { color: fg, maxW: w - 14 }); };
  at('poster0', (w, h) => poster(w, h, '#3a0f3a', '#ff5fc8', 'HELIX', 'all night long', 0)); at('poster1', (w, h) => poster(w, h, '#0d2440', '#5fd6ff', 'LOWTIDE', 'live + guests', 1));
  at('poster2', (w, h) => { g.fillStyle = '#e9e1cf'; g.fillRect(0, 0, w, h); text(g, 'ROOMS', w / 2, 30, 26, { color: '#1d1d1f' }); text(g, 'TO LET', w / 2, 62, 22, { color: '#8e1d18' }); text(g, '0181 4437', w / 2, 96, 16, { color: '#1d1d1f' }); });
  at('poster3', (w, h) => { g.fillStyle = '#f2c230'; g.fillRect(0, 0, w, h); text(g, 'GRIT', w / 2, 40, 34, { color: '#141414' }); text(g, 'VOL. 4', w / 2, 80, 20, { color: '#141414' }); });
  at('cctv', (w, h) => { g.fillStyle = '#f2c230'; g.fillRect(0, 0, w, h); g.fillStyle = '#141414'; g.fillRect(14, 30, 60, 32); g.fillRect(70, 38, 18, 16); g.fillRect(30, 62, 10, 30); text(g, 'CCTV IN', 170, 44, 26, { color: '#141414' }); text(g, 'OPERATION', 170, 80, 22, { color: '#141414' }); });
  at('wet', (w, h) => { g.fillStyle = '#f2c230'; g.beginPath(); g.moveTo(w / 2, 8); g.lineTo(w - 8, h - 10); g.lineTo(8, h - 10); g.closePath(); g.fill(); g.strokeStyle = '#141414'; g.lineWidth = 6; g.stroke(); text(g, '!', w / 2, h * .6, 60, { color: '#141414' }); });
  at('hazard', (w, h) => { for (let x = -h; x < w + h; x += 40) { g.fillStyle = '#f2c230'; g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 20, 0); g.lineTo(x + 20 - h, h); g.lineTo(x - h, h); g.closePath(); g.fill(); g.fillStyle = '#141414'; g.beginPath(); g.moveTo(x + 20, 0); g.lineTo(x + 40, 0); g.lineTo(x + 40 - h, h); g.lineTo(x + 20 - h, h); g.closePath(); g.fill(); } });
  at('plate', (w, h) => { g.fillStyle = '#d9d4c4'; g.fillRect(0, 0, w, h); g.strokeStyle = '#1d2a36'; g.lineWidth = 4; g.strokeRect(4, 4, w - 8, h - 8); text(g, 'KX 7 HLD', w / 2, h * .55, 40, { color: '#1d2a36' }); });
  for (const [k, s, bg, fg] of TEXTS) at(k, (w, h) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h); g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 3; g.strokeRect(2, 2, w - 4, h - 4);
    text(g, s, w / 2, h * .54, Math.round(h * .58), { color: fg, maxW: w - 24 });
    speck(g, w, h, k.length * 7, 40, 'rgba(40,30,20,A)', .05, .25, 1, 3);
  });
}
function neon(g, s, x, y, size, col, o = {}) {
  g.save(); g.font = (o.weight || 'bold') + ' ' + (o.italic ? 'italic ' : '') + size + 'px ' + (o.font || 'Arial, Helvetica, sans-serif');
  g.textAlign = 'center'; g.textBaseline = 'middle';
  if (o.maxW) { const m = g.measureText(s).width; if (m > o.maxW) { g.translate(x, y); g.scale(o.maxW / m, 1); x = 0; y = 0; } }
  g.shadowColor = col; g.shadowBlur = size * .35; g.lineWidth = Math.max(3, size * .09); g.strokeStyle = col; g.lineJoin = 'round';
  g.strokeText(s, x, y); g.shadowBlur = size * .12; g.strokeStyle = '#fff'; g.lineWidth = Math.max(1.5, size * .03); g.strokeText(s, x, y);
  g.restore();
}
function drawGlow(g) {
  g.clearRect(0, 0, ATL, ATL);
  const at = (s, fn) => inSlot(g, GLOW, s, fn);
  at('velvet', (w, h) => neon(g, 'Velvet', w / 2, h * .52, 170, '#ff3c9a', { italic: true, font: 'Georgia, "Times New Roman", serif', maxW: w - 80 }));
  at('open', (w, h) => neon(g, 'OPEN', w / 2, h / 2, 76, '#44e6ff'));
  at('bar', (w, h) => neon(g, 'BAR', w / 2, h / 2, 86, '#ffb43c'));
  at('exit', (w, h) => { g.fillStyle = 'rgb(30,160,70)'; g.fillRect(0, 0, w, h); text(g, 'EXIT', w / 2, h / 2 + 2, 52, { color: '#f2fff4' }); });
  at('dance', (w, h) => neon(g, 'dance', w / 2, h / 2, 110, '#8f5bff', { italic: true, font: 'Georgia, "Times New Roman", serif' }));
  at('heart', (w, h) => { g.save(); g.shadowColor = '#ff2a6a'; g.shadowBlur = 18; g.strokeStyle = '#ff7aa8'; g.lineWidth = 8; g.beginPath(); g.moveTo(w / 2, h * .82); g.bezierCurveTo(-10, h * .45, w * .25, h * .05, w / 2, h * .3); g.bezierCurveTo(w * .75, h * .05, w + 10, h * .45, w / 2, h * .82); g.stroke(); g.restore(); });
  at('arrow', (w, h) => { g.save(); g.shadowColor = '#44e6ff'; g.shadowBlur = 14; g.strokeStyle = '#bff6ff'; g.lineWidth = 7; g.beginPath(); g.moveTo(12, h / 2); g.lineTo(w - 22, h / 2); g.moveTo(w - 60, h / 2 - 36); g.lineTo(w - 18, h / 2); g.lineTo(w - 60, h / 2 + 36); g.stroke(); g.restore(); });
  at('lips', (w, h) => { g.save(); g.shadowColor = '#ff2a6a'; g.shadowBlur = 16; g.strokeStyle = '#ff6a8a'; g.lineWidth = 7; g.beginPath(); g.moveTo(20, h / 2); g.bezierCurveTo(70, 20, 110, 40, w / 2, 52); g.bezierCurveTo(146, 40, 186, 20, w - 20, h / 2); g.bezierCurveTo(186, h - 10, 70, h - 10, 20, h / 2); g.moveTo(20, h / 2); g.lineTo(w - 20, h / 2); g.stroke(); g.restore(); });
  at('strip', (w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(.5, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
  at('screen', (w, h) => { const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, 'rgb(40,50,70)'); gr.addColorStop(1, 'rgb(15,20,30)'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 4; i++) { const x = (i % 2) * w / 2, y = Math.floor(i / 2) * h / 2; g.fillStyle = ['rgb(60,70,80)', 'rgb(50,60,58)', 'rgb(70,60,70)', 'rgb(45,55,70)'][i]; g.fillRect(x + 3, y + 3, w / 2 - 6, h / 2 - 6); text(g, 'CAM 0' + (i + 1), x + 34, y + 14, 11, { color: '#e8ffe8' }); }
    for (let y = 0; y < h; y += 3) { g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(0, y, w, 1); } });
  at('screen2', (w, h) => { g.fillStyle = 'rgb(10,14,24)'; g.fillRect(0, 0, w, h); const r = rng(5); for (let i = 0; i < 40; i++) { g.fillStyle = `rgb(${40 + r() * 200 | 0},${60 + r() * 120 | 0},255)`; const bh = r() * h * .8; g.fillRect(8 + i * 6, h - 10 - bh, 4, bh); } text(g, '128 BPM', 60, 18, 16, { color: '#ff7ad0' }); });
  at('blind', (w, h) => { g.fillStyle = 'rgb(255,200,140)'; g.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 8) { g.fillStyle = 'rgba(40,25,10,.55)'; g.fillRect(0, y, w, 3); } });
  at('curtain', (w, h) => { const gr = g.createLinearGradient(0, 0, w, 0); for (let i = 0; i <= 10; i++) gr.addColorStop(i / 10, i % 2 ? 'rgb(255,170,90)' : 'rgb(190,105,50)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
  at('town', (w, h) => { const r = rng(17); for (let i = 0; i < 520; i++) { const x = r() * w, y = h * .2 + Math.pow(r(), 1.5) * h * .78, k = .35 + r() * .65, warm = r() < .7; g.fillStyle = warm ? `rgba(255,${170 + r() * 50 | 0},90,${k})` : `rgba(200,220,255,${k})`; g.fillRect(x, y, 1 + r() * 3, 1 + r() * 2); } });
  at('menu', (w, h) => { g.fillStyle = 'rgb(20,16,22)'; g.fillRect(0, 0, w, h); ['NEGRONI  11', 'SPRITZ  10', 'OLD FASHIONED  12', 'HOUSE LAGER  6', 'SOFTS  3'].forEach((s, i) => text(g, s, 16, 30 + i * 20, 14, { color: '#ffd9a0', align: 'left' })); text(g, 'COCKTAILS', w / 2, 12, 14, { color: '#ff6ac8' }); });
  at('dot', (w, h) => { const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.4, 'rgba(255,255,255,.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
  at('cocktail', (w, h) => { g.save(); g.shadowColor = '#44e6ff'; g.shadowBlur = 12; g.strokeStyle = '#bff6ff'; g.lineWidth = 5; g.beginPath(); g.moveTo(w / 2 - 30, 12); g.lineTo(w / 2 + 30, 12); g.lineTo(w / 2, 48); g.closePath(); g.moveTo(w / 2, 48); g.lineTo(w / 2, 80); g.moveTo(w / 2 - 18, 82); g.lineTo(w / 2 + 18, 82); g.stroke(); g.restore(); });
}
function tex(scene, name, w, h, draw) {
  const dt = new BABYLON.DynamicTexture(name, { width: w, height: h }, scene, true);
  draw(dt.getContext(), w, h); dt.hasAlpha = true; dt.update(true);
  dt.wrapU = BABYLON.Texture.CLAMP_ADDRESSMODE; dt.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;
  dt.anisotropicFilteringLevel = 4;
  return dt;
}
function drawPaint(g, w, h) {
  g.clearRect(0, 0, w, h);
  const r = rng(5); g.fillStyle = '#fff';
  for (let x = 0; x < w; x += 2) { const t0 = h * (.12 + .06 * Math.sin(x * .05) * r()), t1 = h * (.88 - .06 * Math.sin(x * .031 + 1) * r()); g.fillRect(x, t0, 2, t1 - t0); }
  g.globalCompositeOperation = 'destination-out';
  speck(g, w, h, 6, 460, 'rgba(0,0,0,A)', .5, 1, 1, 3.5);
  g.globalCompositeOperation = 'source-over';
}
const SCN = new WeakMap();
function mats(B) {
  const sc = B.scene; let s = SCN.get(sc); if (s) return s;
  s = {}; SCN.set(sc, s); sc.onDisposeObservable.addOnce(() => SCN.delete(sc));
  const PBR = BABYLON.PBRMaterial;
  const paint = new PBR('nc_paint', sc);
  const pt = tex(sc, 'nc_paint_tex', 512, 64, drawPaint); pt.wrapU = BABYLON.Texture.WRAP_ADDRESSMODE;
  paint.albedoTexture = pt; paint.useAlphaFromAlbedoTexture = true;
  paint.transparencyMode = PBR.PBRMATERIAL_ALPHATEST; paint.alphaCutOff = .45; paint.metallic = 0; paint.roughness = .62; paint.zOffset = -2;
  const stain = new PBR('nc_stain', sc);
  stain.albedoTexture = tex(sc, 'nc_stain_tex', ATL, ATL, drawStain); stain.useAlphaFromAlbedoTexture = true;
  stain.transparencyMode = PBR.PBRMATERIAL_ALPHABLEND; stain.disableDepthWrite = true; stain.metallic = 0; stain.roughness = .6; stain.zOffset = -3;
  const sign = new PBR('nc_sign', sc);
  sign.albedoTexture = tex(sc, 'nc_sign_tex', ATL, ATL, drawSign); sign.useAlphaFromAlbedoTexture = true;
  sign.transparencyMode = PBR.PBRMATERIAL_ALPHATEST; sign.alphaCutOff = .45; sign.metallic = 0; sign.roughness = .6; sign.zOffset = -2;
  const glow = new PBR('nc_glow', sc);
  const gt = tex(sc, 'nc_glow_tex', ATL, ATL, drawGlow);
  glow.albedoColor = new BABYLON.Color3(0, 0, 0); glow.emissiveTexture = gt; glow.emissiveColor = new BABYLON.Color3(1, 1, 1); glow.emissiveIntensity = 2.2;
  glow.opacityTexture = gt; glow.transparencyMode = PBR.PBRMATERIAL_ALPHABLEND; glow.disableDepthWrite = true; glow.zOffset = -2;
  glow.disableLighting = true; glow.environmentIntensity = 0; glow.metallic = 0; glow.roughness = 1; glow.backFaceCulling = true;
  for (const m of [paint, stain, sign, glow]) m.metadata = { lf: m.name, surf: 'concrete', map: 'nightclub' };
  s.paint = paint; s.stain = stain; s.sign = sign; s.glow = glow;
  return s;
}

// ------------------------------------------------------------------------------------------------ quad accumulator
const TILE = 1024;   // one decal mesh per atlas for the whole map (draw calls)
function qacc(B, key, x, z) {
  const S = nc(B), k = key + '|' + Math.floor(x / TILE) + '|' + Math.floor(z / TILE);
  let a = S.acc.get(k); if (!a) { a = { key, P: [], N: [], U: [], C: [], I: [] }; S.acc.set(k, a); }
  return a;
}
const W = { x: 0, y: 0, z: 0 };
function emitQuad(B, key, c, R, U, N, w, h, uv, col) {
  const T = B.T, p0 = B.toWorld(c[0], c[1], c[2], {}), a = qacc(B, key, p0.x, p0.z), base = a.P.length / 3;
  const hw = w / 2, hh = h / 2;
  const pts = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]], uvs = [[uv[0], uv[1]], [uv[2], uv[1]], [uv[2], uv[3]], [uv[0], uv[3]]];
  const rot = v => [v[0] * T.c + v[2] * T.s, v[1], -v[0] * T.s + v[2] * T.c];
  const n = rot(N), P = [];
  for (let i = 0; i < 4; i++) {
    B.toWorld(c[0] + R[0] * pts[i][0] + U[0] * pts[i][1], c[1] + R[1] * pts[i][0] + U[1] * pts[i][1], c[2] + R[2] * pts[i][0] + U[2] * pts[i][1], W);
    P.push([W.x, W.y, W.z]);
    a.P.push(W.x, W.y, W.z); a.N.push(n[0], n[1], n[2]); a.U.push(uvs[i][0], uvs[i][1]);
    a.C.push(col ? col[0] : 1, col ? col[1] : 1, col ? col[2] : 1, 1);
  }
  const ux = P[1][0] - P[0][0], uy = P[1][1] - P[0][1], uz = P[1][2] - P[0][2], vx = P[2][0] - P[0][0], vy = P[2][1] - P[0][1], vz = P[2][2] - P[0][2];
  const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
  if (cx * n[0] + cy * n[1] + cz * n[2] < 0) a.I.push(base, base + 1, base + 2, base, base + 2, base + 3);
  else a.I.push(base, base + 2, base + 1, base, base + 3, base + 2);
}
// face: the direction the visible side looks at. R = the quad's right (u) as seen by a viewer facing it.
const FACES = { n: [[-1, 0, 0], [0, 1, 0], [0, 0, 1]], s: [[1, 0, 0], [0, 1, 0], [0, 0, -1]], e: [[0, 0, 1], [0, 1, 0], [1, 0, 0]], w: [[0, 0, -1], [0, 1, 0], [-1, 0, 0]],
  u: [[1, 0, 0], [0, 0, 1], [0, 1, 0]], d: [[1, 0, 0], [0, 0, -1], [0, -1, 0]] };
const ry3 = (v, a) => { const c = Math.cos(a), s = Math.sin(a); return [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c]; };
function slotUV(atlas, slot) {
  const R = atlas === 'stain' ? STAIN : atlas === 'glow' ? GLOW : SIGN, r = R[slot];
  if (!r) throw new Error('nightclub: unknown ' + atlas + ' slot ' + slot);
  return [(r[0] + 1.5) / ATL, 1 - (r[1] + r[3] - 1.5) / ATL, (r[0] + r[2] - 1.5) / ATL, 1 - (r[1] + 1.5) / ATL];
}
export function decal(B, atlas, slot, x, y, z, w, h, o = {}) {
  const f = FACES[o.face || 'u'], a = o.ry || 0, uv = slotUV(atlas, slot);
  if (o.flipU) { const t = uv[0]; uv[0] = uv[2]; uv[2] = t; }
  emitQuad(B, atlas, [x, y, z], ry3(f[0], a), ry3(f[1], a), ry3(f[2], a), w, h, uv, o.col);
}
export function paint(B, x0, z0, x1, z1, o = {}) {
  const w = o.w || .12, y = o.y == null ? .012 : o.y, col = o.col || [.9, .9, .86], L = Math.hypot(x1 - x0, z1 - z0);
  if (L < .01) return;
  const ux = (x1 - x0) / L, uz = (z1 - z0) / L, R = [ux, 0, uz], U = [uz, 0, -ux], N = [0, 1, 0];
  const segs = [];
  if (o.dash) { for (let s = 0; s < L; s += o.dash[0] + o.dash[1]) segs.push([s, Math.min(L, s + o.dash[0])]); } else segs.push([0, L]);
  const off = Math.abs(x0 * 7.31 + z0 * 3.17) % 1;
  for (const [s0, s1] of segs) { const m = (s0 + s1) / 2; emitQuad(B, 'paint', [x0 + ux * m, y, z0 + uz * m], R, U, N, s1 - s0, w, [off + s0 / 4, 1, off + s1 / 4, 0], col); }
}

// ------------------------------------------------------------------------------------------------ prefabs
/** a slab (y0..y1) over the rectangle minus holes; cells are merged along x runs. o: B.box options (mat, mats, cast...) */
export function slab(B, x0, z0, x1, z1, y0, y1, holes = [], o = {}) {
  const xs = new Set([x0, x1]), zs = new Set([z0, z1]);
  for (const h of holes) { if (h.x0 > x0 && h.x0 < x1) xs.add(h.x0); if (h.x1 > x0 && h.x1 < x1) xs.add(h.x1); if (h.z0 > z0 && h.z0 < z1) zs.add(h.z0); if (h.z1 > z0 && h.z1 < z1) zs.add(h.z1); }
  const X = [...xs].sort((a, b) => a - b), Z = [...zs].sort((a, b) => a - b);
  const inHole = (x, z) => holes.some(h => x > h.x0 && x < h.x1 && z > h.z0 && z < h.z1);
  for (let j = 0; j < Z.length - 1; j++) {
    let run = -1;
    for (let i = 0; i <= X.length - 1; i++) {
      const solid = i < X.length - 1 && !inHole((X[i] + X[i + 1]) / 2, (Z[j] + Z[j + 1]) / 2);
      if (solid && run < 0) run = i;
      if (!solid && run >= 0) { B.boxc(X[run], y0, Z[j], X[i], y1, Z[j + 1], o); run = -1; }
    }
  }
}
/** railing between two points: top rail, posts, glass infill or a mid rail; movement-only collider (bullets and sight pass) */
export function rail(B, x0, z0, x1, z1, y, o = {}) {
  const L = Math.hypot(x1 - x0, z1 - z0), ry = Math.atan2(-(z1 - z0), x1 - x0), m = o.mat || 'steel_dark', h = o.h || 1.05;
  B.push((x0 + x1) / 2, y, (z0 + z1) / 2, ry);
  B.box(0, h - .05, 0, L, .05, .07, { mat: m, collide: false, cast: false });
  if (o.glass) B.box(0, .1, 0, L - .1, h - .2, .02, { mat: 'glass', collide: false, cast: false });
  else B.box(0, .45, 0, L, .035, .035, { mat: m, collide: false, cast: false });
  const n = Math.max(1, Math.round(L / 1.4));
  for (let i = 0; i <= n; i++) B.box(-L / 2 + i * L / n, 0, 0, .05, h - .05, .05, { mat: m, collide: false, cast: false });
  // collider: 1.25 m (above the 1.15 m mantle), surf glass: bullets and bot sight pass almost freely, but the navgrid's ledge
  // test sees it, so no drop / mantle links are made over a railing
  if (o.collide !== false) B.box(0, 0, 0, L, 1.25, .1, { visible: false, surf: 'glass' });
  B.pop();
}
/** emissive LED strip from (x0,y0,z0) to (x1,y1,z1), s = thickness (axis-aligned runs) */
export function strip(B, x0, y0, z0, x1, y1, z1, mat = 'nc_led_pink', s = .03) {
  B.boxc(Math.min(x0, x1) - (x0 === x1 ? s / 2 : 0), Math.min(y0, y1), Math.min(z0, z1) - (z0 === z1 ? s / 2 : 0),
    Math.max(x0, x1) + (x0 === x1 ? s / 2 : 0), Math.max(y0, y1) + (y0 === y1 ? s : 0), Math.max(z0, z1) + (z0 === z1 ? s / 2 : 0), { mat, collide: false, cast: false });
}
let kegMesh = null;
/** steel beer keg (50 l: d .41, h .6); o.lying = on its side along x */
export function keg(B, x, y, z, o = {}) {
  const build = b => {
    const parts = [];
    const body = BABYLON.MeshBuilder.CreateCylinder('keg', { diameter: .4, height: .5, tessellation: 14 }, b.scene); body.position.y = .3; parts.push(body);
    for (const yy of [.07, .53]) { const r = BABYLON.MeshBuilder.CreateCylinder('kr', { diameter: .41, height: .08, tessellation: 14 }, b.scene); r.position.y = yy; parts.push(r); }
    const sp = BABYLON.MeshBuilder.CreateCylinder('ks', { diameter: .08, height: .05, tessellation: 8 }, b.scene); sp.position.y = .6; parts.push(sp);
    const m = BABYLON.Mesh.MergeMeshes(parts, true); m.material = b.mat('nc_keg'); return m;
  };
  if (o.lying) {
    B.push(x, y + .205, z, o.ry || 0); B.push(0, 0, 0, 0);
    // a lying keg: a cylinder along x (no instancing: rare)
    B.cyl(-.3, -.205, 0, .2, .6, { mat: 'nc_stainless', sides: 12, collide: false });
    B.pop(); B.pop();
    return;
  }
  B.instance('nc_keg', build, x, y, z, { ry: o.ry || 0, collide: [{ cx: 0, cy: .3, cz: 0, hx: .2, hy: .3, hz: .2 }] });
}
/** PA cabinet stack: n cabinets (.6 x .7 x .55) on an optional sub (.8 x .6 x .7); front = +z after ry */
export function speaker(B, x, y, z, ry = 0, o = {}) {
  B.push(x, y, z, ry);
  let yy = 0;
  if (o.sub !== false) { B.box(0, 0, 0, .8, .62, .7, { mat: 'plastic_black', surf: 'wood' }); B.box(0, .1, .352, .62, .42, .01, { mat: 'grate', collide: false }); yy = .62; }
  const n = o.n || 2;
  for (let i = 0; i < n; i++) {
    B.box(0, yy, 0, .62, .66, .55, { mat: 'plastic_black', surf: 'wood' });
    B.box(0, yy + .06, .28, .52, .54, .01, { mat: 'grate', collide: false, cast: false });
    yy += .66;
  }
  B.pop();
}
/** square aluminium box truss (.3 m) from (x0,z0) to (x1,z1) at height y (bottom), axis-aligned; no collider */
export function truss(B, x0, z0, x1, z1, y) {
  const L = Math.hypot(x1 - x0, z1 - z0), ry = Math.atan2(-(z1 - z0), x1 - x0), s = .3, r = .025;
  B.push((x0 + x1) / 2, y, (z0 + z1) / 2, ry);
  for (const [dy, dz] of [[0, -s / 2], [0, s / 2], [s, -s / 2], [s, s / 2]]) B.box(0, dy - r, dz, L, r * 2, r * 2, { mat: 'nc_alu', collide: false, cast: false });
  const n = Math.max(1, Math.round(L / .5));
  for (let i = 0; i < n; i++) {
    const xa = -L / 2 + i * L / n + L / n / 2;
    B.box(xa, 0, -s / 2, .018, s, .018, { mat: 'nc_alu', collide: false, cast: false });
    B.box(xa, 0, s / 2, .018, s, .018, { mat: 'nc_alu', collide: false, cast: false });
  }
  B.pop();
}

// ------------------------------------------------------------------------------------------------ shadow casters by zone
export function castOnly(B, fn) {
  const box0 = B.box.bind(B), cyl0 = B.cyl.bind(B), mesh0 = B.mesh.bind(B), P = {};
  B.box = (x, y, z, w, h, d, o = {}) => { if (o.cast !== false) { B.toWorld(x, y + h / 2, z, P); if (!fn(P.x, P.y, P.z)) o = Object.assign({}, o, { cast: false }); } return box0(x, y, z, w, h, d, o); };
  B.cyl = (x, y, z, r, h, o = {}) => { if (o.cast !== false) { B.toWorld(x, y + h / 2, z, P); if (!fn(P.x, P.y, P.z)) o = Object.assign({}, o, { cast: false }); } return cyl0(x, y, z, r, h, o); };
  B.mesh = (m, o = {}) => {
    if (o.cast !== false && m && m.getBoundingInfo) {
      m.computeWorldMatrix(true); const c = m.getBoundingInfo().boundingBox.centerWorld;
      B.toWorld(c.x, c.y, c.z, P); if (!fn(P.x, P.y, P.z)) o = Object.assign({}, o, { cast: false });
    }
    return mesh0(m, o);
  };
}

// ------------------------------------------------------------------------------------------------ navgrid workaround
export function guardNavDrops(B) {
  const orig = B.finish.bind(B);
  B.finish = async (...a) => {
    const info = await orig(...a);
    const nav = info && info.nav, world = info && info.world;
    if (!nav || !nav.spT) return info;
    const p = { x: 0, y: 0, z: 0 }, q = { x: 0, y: 0, z: 0 };
    let cut = 0;
    for (let n = 0; n < nav.nodeCount; n++) for (let k = nav.spStart[n]; k < nav.spStart[n + 1]; k++) {
      const t = nav.spT[k]; if (t === n) continue;
      nav.nodePos(n, p); nav.nodePos(t, q);
      const hi = Math.max(p.y, q.y), lo = Math.min(p.y, q.y), low = p.y < q.y ? p : q;
      // the column above the lower node must be open up to body height over the upper node
      if (!segmentClear(world, low.x, lo + 0.3, low.z, low.x, hi + 0.9, low.z)) { nav.spT[k] = n; cut++; }
    }
    if (cut) { nav._label(); if (nav.stats) nav.stats.cutLinks = cut; }
    return info;
  };
}

// ------------------------------------------------------------------------------------------------ flush
export function finish(B) {
  const S = nc(B), M = mats(B);
  for (const a of S.acc.values()) {
    if (!a.I.length) continue;
    const m = new BABYLON.Mesh('nc_' + a.key, B.scene), vd = new BABYLON.VertexData();
    vd.positions = new Float32Array(a.P); vd.normals = new Float32Array(a.N); vd.uvs = new Float32Array(a.U); vd.colors = new Float32Array(a.C);
    vd.indices = a.P.length / 3 > 65535 ? new Uint32Array(a.I) : new Uint16Array(a.I);
    vd.applyToMesh(m, false);
    m.material = M[a.key]; m.hasVertexAlpha = false;
    B.push(); B.stack[B.stack.length - 1] = { c: 1, s: 0, th: 0, tx: 0, ty: 0, tz: 0, k: 1 };
    B.mesh(m, { collide: 'none', cast: false });
    B.pop();
  }
  S.acc.clear();
}
