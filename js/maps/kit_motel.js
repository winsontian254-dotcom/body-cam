/* LIVE FIRE — Starlite Motel kit: map-specific materials, canvas atlases and prefabs used by js/maps/defs/motel.js (owned by the
   motel map). Original artwork only (fictional names: Starlite Motel, Greyline Coaches, Route 61).
   Exports (all take the MapBuilder B; coordinates follow the current B.push frame):
     mo(B)                          per-build state
     decal(B, atlas, slot, x, y, z, w, h, o)   quad from an atlas: 'stain' (alpha blend), 'sign' (alpha test), 'glow' (emissive,
                                    alpha blend), 'glowdim' (opaque, dimmer: lit curtains, blinds); o.face n|s|e|w|u (which way the quad faces), o.ry, o.col
     paint(B, x0, z0, x1, z1, o)    worn paint stripe on the ground (o.w, o.col, o.dash [on, off], o.y)
     rail(B, x0, z0, x1, z1, y, o)  steel balcony / pool railing with a movement-only collider (o.h, o.mat, o.collide, o.bars)
     wallLamp(B, x, y, z, ry)       walkway wall lamp (emissive), no light
     finish(B)                      flushes the accumulated quads (call once at the end of build)
   Materials registered into the library at import: mo_stucco, mo_stucco_rose, mo_stucco_sand, mo_teal, mo_trim, mo_pool,
   mo_pool_dark, mo_terrazzo, mo_checker, mo_panel, mo_red, mo_chrome_band, mo_roof, mo_block, neon emissives mo_neon_*. */
import { MATERIALS } from '../gfx/materials.js';

const TAU = Math.PI * 2;
const PM = (surf, set, scale, o) => Object.assign({ surf, set, tex: set ? 'assets/textures/' + set : null, scale }, o);
const EM = (col, e) => ({ surf: 'glass', set: null, tex: null, scale: 1, kind: 'emissive', col, emissive: e });
const EXTRA = {
  mo_stucco: PM('plaster', 'plaster_white', 2.0, { color: '#dcc3a6', desat: .9, macro: .14, anti: 1, por: .6, col: [.8, .73, .6], proc: 'noise' }),
  mo_stucco_rose: PM('plaster', 'plaster_white', 2.0, { color: '#c99f88', desat: .9, macro: .14, anti: 1, por: .6, col: [.77, .6, .52], proc: 'noise' }),
  mo_stucco_sand: PM('plaster', 'plaster_white', 2.0, { color: '#ab9d84', desat: .9, macro: .16, anti: 1, por: .6, col: [.66, .6, .5], proc: 'noise' }),
  mo_wall: PM('plaster', 'plaster_white', 2.0, { color: '#c4b393', desat: .9, macro: .1, anti: 1, por: .5, col: [.77, .7, .58], proc: 'noise' }),
  mo_block: PM('concrete', 'concrete_panels', 1.2, { color: '#9a9284', desat: .7, macro: .16, por: .6, col: [.6, .57, .52], proc: 'tile' }),
  mo_teal: PM('metal', 'steel', 1.2, { color: '#2f6a6c', desat: 1, macro: .12, por: .1, rough: 1.35, metal: .15, col: [.18, .42, .42], proc: 'metal' }),
  mo_trim: PM('metal', 'steel', 1.2, { color: '#d8d2c4', desat: 1, macro: .1, por: .1, rough: 1.35, metal: .1, col: [.85, .82, .77], proc: 'metal' }),
  mo_red: PM('metal', 'steel', 1.2, { color: '#8e1d18', desat: 1, macro: .12, por: .1, rough: 1.3, metal: .15, col: [.56, .11, .09], proc: 'metal' }),
  mo_pool: PM('tile', 'tile_white', .9, { color: '#7fb3c2', desat: 1, macro: .1, rough: .7, por: .1, col: [.5, .7, .76], proc: 'tile' }),
  mo_pool_dark: PM('tile', 'tile_white', .9, { color: '#4d7c88', desat: 1, macro: .2, rough: .9, por: .3, col: [.3, .48, .53], proc: 'tile' }),
  mo_terrazzo: PM('tile', 'marble', 1.5, { color: '#b9b2a4', desat: .8, macro: .08, rough: .7, por: .1, col: [.73, .7, .64], proc: 'noise' }),
  mo_checker: PM('tile', 'tile_floor', 1.2, { color: '#8d8a84', desat: 1, macro: .08, rough: .7, por: .15, col: [.55, .54, .52], proc: 'tile' }),
  mo_panel: PM('wood', 'wood_siding', 1.2, { color: '#5a3f28', desat: .3, macro: .08, por: .4, col: [.35, .25, .16], proc: 'wood' }),
  mo_roof: PM('gravel', 'gravel', 1.6, { color: '#6c665d', desat: .6, macro: .16, anti: 1, por: .5, col: [.42, .4, .37], proc: 'noise' }),
  mo_carpet: PM('carpet', 'carpet', 1.0, { color: '#5b3a32', desat: .6, macro: .12, por: 1, col: [.36, .23, .2], proc: 'noise' }),
  mo_chrome_band: PM('metal', 'steel', 1.5, { color: '#c9ccd0', desat: 1, rough: .3, macro: .03, por: .02, col: [.8, .8, .82], proc: 'metal' }),
  mo_neon_pink: EM([1, .22, .62], 6), mo_neon_cyan: EM([.3, .95, 1], 5), mo_neon_red: EM([1, .14, .1], 6), mo_neon_yellow: EM([1, .78, .25], 5),
  mo_neon_green: EM([.35, 1, .45], 4), mo_sodium: EM([1, .62, .28], 5), mo_window_warm: EM([1, .7, .42], 1.6), mo_tv: EM([.45, .6, 1], 1.4),
};
for (const k in EXTRA) if (!MATERIALS[k]) MATERIALS[k] = EXTRA[k];

export function mo(B) { if (!B._mo) B._mo = { acc: new Map() }; return B._mo; }
function rng(seed) { let a = seed >>> 0 || 1; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export { rng };

// ------------------------------------------------------------------------------------------------ atlases
const ATL = 1024;
const STAIN = { oil0: [0, 0, 256, 256], oil1: [256, 0, 256, 256], drip: [512, 0, 256, 256], crack: [768, 0, 256, 256],
  grime: [0, 256, 256, 128], rust: [256, 256, 128, 256], water: [384, 256, 128, 256], dust: [512, 256, 256, 256], tyre: [768, 256, 256, 128],
  litter: [0, 512, 256, 256], leaves: [256, 512, 256, 256], soot: [512, 512, 256, 256], patch: [768, 512, 256, 256], sand: [0, 768, 512, 256],
  algae: [512, 768, 256, 256], gum: [768, 768, 256, 256] };
const SIGN = { A: [0, 0, 192, 192], B: [192, 0, 192, 192], arrow: [384, 0, 96, 192], stopbar: [480, 0, 96, 192], hcap: [576, 0, 192, 192], chev: [768, 0, 96, 192], plate: [864, 0, 160, 96] };
const TEXTS = [
  ['office', 'MOTEL OFFICE', 'plate', '#efe6d0', '#7a1f1a'], ['laundry', 'LAUNDRY · STAFF ONLY', 'plate', '#e9e6dc', '#24343c'],
  ['ice', 'ICE', 'plate', '#1f4f6e', '#f2f0ea'], ['pool', 'POOL CLOSED · NO LIFEGUARD ON DUTY', 'plate', '#f0ece0', '#8e1d18'],
  ['coach', 'GREYLINE COACHES', 'plate', '#26303a', '#e8e3d6'], ['tickets', 'TICKETS · WAITING ROOM', 'plate', '#e9e6dc', '#26303a'],
  ['checkout', 'CHECK-OUT 11 AM', 'plate', '#efe6d0', '#3a2a20'], ['guests', 'PARKING FOR MOTEL GUESTS ONLY', 'plate', '#efe6d0', '#1f4f6e'],
  ['stop', 'STOP', 'paint', null, '#ffffff'], ['slow', 'SLOW', 'paint', null, '#ffffff'], ['restrooms', 'RESTROOMS', 'plate', '#2a2b2e', '#e9e6dc'],
  ['kitchen', 'KITCHEN · STAFF ONLY', 'plate', '#e9e6dc', '#8e1d18'], ['open24', 'OPEN 24 HOURS', 'plate', '#8e1d18', '#f6efe0'],
  ['fuel', 'REGULAR  3.89    DIESEL  4.29', 'plate', '#f4f1e8', '#1d1d1d'], ['closed', 'ROAD CLOSED', 'plate', '#d8701c', '#141414'],
  ['local', 'BRIDGE OUT AHEAD · DETOUR', 'plate', '#d8701c', '#141414'], ['deep', 'DEEP END  8 FT', 'paint', null, '#1d2a36'],
  ['shallow', 'SHALLOW  3 FT', 'paint', null, '#1d2a36'], ['nodive', 'NO DIVING', 'paint', null, '#8e1d18'], ['exit', 'EXIT', 'plate', '#1e6b2e', '#f2f2ee'],
  ['manager', 'MANAGER · PRIVATE', 'plate', '#efe6d0', '#3a2a20'], ['route', 'ROUTE 61', 'plate', '#f2f0ea', '#141414'],
  ['dinerplate', 'STARLITE DINER · HOME COOKING', 'plate', '#efe6d0', '#8e1d18'], ['bus', 'BUS', 'paint', null, '#ffffff'],
  ['xing', 'NO PARKING', 'paint', null, '#f2c230'], ['vac', 'COLOR TV · AIR COOLED · POOL', 'plate', '#1f4f6e', '#f6efe0'],
];
TEXTS.forEach((t, i) => { SIGN[t[0]] = [(i % 2) * 512, 192 + Math.floor(i / 2) * 52, 512, 48]; });
// room number plates 101-123, 201-225 (brass on dark): 8 per row, 128 x 20, from y 870
const ROOMS = []; for (let r = 1; r <= 23; r++) ROOMS.push(100 + r); for (let r = 1; r <= 25; r++) ROOMS.push(200 + r);
ROOMS.forEach((n, i) => { SIGN['r' + n] = [(i % 8) * 128, 870 + Math.floor(i / 8) * 20, 128, 20]; });
// glow atlas (emissive): neon art + lit window textures
const GLOW = { starlite: [0, 0, 1024, 200], motel: [0, 200, 640, 150], vacancy: [640, 200, 384, 90], no: [640, 290, 160, 60], diner: [0, 350, 512, 150],
  eat: [512, 350, 256, 150], open: [768, 350, 256, 100], star: [768, 450, 128, 128], arrow: [896, 450, 128, 128], curtain: [0, 500, 128, 128],
  curtain2: [128, 500, 128, 128], blind: [256, 500, 128, 128], town: [384, 500, 384, 128], coach: [0, 628, 512, 90], ice: [512, 628, 256, 90],
  cafe: [768, 628, 256, 90], tv: [0, 718, 128, 96], vend: [128, 718, 128, 192], menu: [256, 718, 256, 160], office: [512, 718, 512, 110],
  bar: [512, 828, 256, 64], stripe: [768, 828, 256, 64] };

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
  at('grime', (w, h) => { const gr = g.createLinearGradient(0, h, 0, 0); gr.addColorStop(0, 'rgba(36,28,20,.6)'); gr.addColorStop(.5, 'rgba(36,28,20,.2)'); gr.addColorStop(1, 'rgba(36,28,20,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); speck(g, w, h, 3, 90, 'rgba(30,24,18,A)', .05, .3, 1, 5); });
  at('rust', (w, h) => { const r = rng(4); for (let i = 0; i < 18; i++) { const x = w * .5 + (r() - .5) * w * .6, L = h * (.3 + r() * .7), gr = g.createLinearGradient(0, 0, 0, L); gr.addColorStop(0, 'rgba(110,52,20,.55)'); gr.addColorStop(1, 'rgba(110,52,20,0)'); g.fillStyle = gr; g.fillRect(x, 0, 2 + r() * 5, L); } });
  at('water', (w, h) => { const r = rng(6); for (let i = 0; i < 26; i++) { const x = r() * w, L = h * (.4 + r() * .6), gr = g.createLinearGradient(0, 0, 0, L); gr.addColorStop(0, 'rgba(40,34,28,.4)'); gr.addColorStop(1, 'rgba(40,34,28,0)'); g.fillStyle = gr; g.fillRect(x, 0, 2 + r() * 7, L); } });
  at('dust', (w, h) => { blob(g, w / 2, h / 2, w * .45, 41, 'rgba(170,150,115,A)', 1.3); speck(g, w, h, 42, 140, 'rgba(175,155,120,A)', .05, .3, 1, 3); });
  at('tyre', (w, h) => { const r = rng(9); for (const y0 of [h * .3, h * .7]) for (let x = 0; x < w; x += 2) { const a = Math.min(1, x / 60, (w - x) / 60) * (.22 + r() * .2); g.fillStyle = 'rgba(12,12,12,' + a.toFixed(3) + ')'; g.fillRect(x, y0 - 9 + Math.sin(x * .012) * 4, 2, 18); } });
  at('litter', (w, h) => { const r = rng(21); for (let i = 0; i < 18; i++) { g.save(); g.translate(20 + r() * (w - 40), 20 + r() * (h - 40)); g.rotate(r() * TAU); const c = r(); g.fillStyle = c < .35 ? 'rgba(225,222,210,.95)' : c < .55 ? 'rgba(170,150,110,.95)' : c < .7 ? 'rgba(160,30,25,.9)' : c < .85 ? 'rgba(40,90,140,.9)' : 'rgba(200,170,40,.9)'; g.fillRect(-6 - r() * 10, -4 - r() * 6, 10 + r() * 16, 7 + r() * 10); g.restore(); } });
  at('leaves', (w, h) => { const r = rng(33); for (let i = 0; i < 46; i++) { g.save(); g.translate(r() * w, r() * h); g.rotate(r() * TAU); g.fillStyle = `rgba(${110 + r() * 50 | 0},${85 + r() * 40 | 0},${40 + r() * 20 | 0},.9)`; g.beginPath(); g.ellipse(0, 0, 4 + r() * 6, 2 + r() * 2, 0, 0, TAU); g.fill(); g.restore(); } });
  at('soot', (w, h) => { const gr = g.createRadialGradient(w / 2, h, 0, w / 2, h * .6, w * .6); gr.addColorStop(0, 'rgba(8,8,8,.65)'); gr.addColorStop(1, 'rgba(8,8,8,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
  at('patch', (w, h) => { const r = rng(15); g.fillStyle = 'rgba(16,16,17,.5)'; g.beginPath(); for (let i = 0; i < 16; i++) { const a = i / 16 * TAU; g.lineTo(w / 2 + Math.cos(a) * (w * .38 + r() * 14), h / 2 + Math.sin(a) * (h * .34 + r() * 14)); } g.closePath(); g.fill(); speck(g, w, h, 16, 60, 'rgba(0,0,0,A)', .05, .2, 1, 3); });
  at('sand', (w, h) => { for (let i = 0; i < 5; i++) blob(g, 60 + i * 95, h / 2 + (i % 2 ? 20 : -20), 120, 50 + i, 'rgba(120,100,72,A)', .9); speck(g, w, h, 59, 260, 'rgba(120,100,72,A)', .08, .3, .8, 2.5); });
  at('algae', (w, h) => { blob(g, w / 2, h * .6, w * .45, 61, 'rgba(48,62,30,A)', 1.8); blob(g, w * .4, h * .7, w * .25, 62, 'rgba(30,36,20,A)', 1.6); speck(g, w, h, 63, 80, 'rgba(60,70,40,A)', .1, .4, 1, 4); });
  at('gum', (w, h) => { speck(g, w, h, 71, 70, 'rgba(25,22,20,A)', .3, .7, 2, 6); });
}
function stencil(g, ch, w, h, col) {
  g.fillStyle = col; g.font = 'bold ' + Math.round(h * .9) + 'px Arial, Helvetica, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(ch, w / 2, h * .54);
  g.globalCompositeOperation = 'destination-out';
  g.fillRect(0, h * .47, w, h * .045); g.fillRect(w * .485, 0, w * .03, h * .3);
  speck(g, w, h, ch.charCodeAt(0), 220, 'rgba(0,0,0,A)', .4, 1, 1, 5);
  g.globalCompositeOperation = 'source-over';
}
function drawSign(g) {
  g.clearRect(0, 0, ATL, ATL);
  const at = (s, fn) => inSlot(g, SIGN, s, fn);
  at('A', (w, h) => stencil(g, 'A', w, h, '#ffffff')); at('B', (w, h) => stencil(g, 'B', w, h, '#ffffff'));
  at('arrow', (w, h) => { g.fillStyle = '#fff'; g.beginPath(); g.moveTo(w / 2, 6); g.lineTo(w - 6, h * .38); g.lineTo(w * .66, h * .38); g.lineTo(w * .66, h - 6); g.lineTo(w * .34, h - 6); g.lineTo(w * .34, h * .38); g.lineTo(6, h * .38); g.closePath(); g.fill();
    g.globalCompositeOperation = 'destination-out'; speck(g, w, h, 77, 120, 'rgba(0,0,0,A)', .4, 1, 1, 4); g.globalCompositeOperation = 'source-over'; });
  at('stopbar', (w, h) => { g.fillStyle = '#fff'; g.fillRect(8, 0, w - 16, h); g.globalCompositeOperation = 'destination-out'; speck(g, w, h, 78, 160, 'rgba(0,0,0,A)', .4, 1, 1, 4); g.globalCompositeOperation = 'source-over'; });
  at('hcap', (w, h) => { g.fillStyle = '#1f4f9e'; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; g.beginPath(); g.arc(w * .5, h * .2, 14, 0, TAU); g.fill(); g.lineWidth = 14; g.strokeStyle = '#fff'; g.beginPath(); g.arc(w * .46, h * .62, 44, .3, TAU - .9); g.stroke(); g.fillRect(w * .44, h * .3, 14, 60); g.fillRect(w * .44, h * .58, 50, 12);
    g.globalCompositeOperation = 'destination-out'; speck(g, w, h, 79, 160, 'rgba(0,0,0,A)', .4, 1, 1, 4); g.globalCompositeOperation = 'source-over'; });
  at('chev', (w, h) => { for (let i = 0; i < 6; i++) { g.fillStyle = i % 2 ? '#1a1a1a' : '#e07a18'; g.beginPath(); g.moveTo(0, i * 40); g.lineTo(w, i * 40 - 26); g.lineTo(w, i * 40 + 14); g.lineTo(0, i * 40 + 40); g.closePath(); g.fill(); } });
  at('plate', (w, h) => { g.fillStyle = '#e9e6da'; g.fillRect(0, 0, w, h); g.strokeStyle = '#1d2a36'; g.lineWidth = 4; g.strokeRect(4, 4, w - 8, h - 8); text(g, '6EV 412', w / 2, h * .58, 40, { color: '#1d2a36' }); text(g, 'SILVER STATE', w / 2, 18, 13, { color: '#8e1d18' }); });
  for (const [k, s, kind, bg, fg] of TEXTS) at(k, (w, h) => {
    if (kind === 'plate') { g.fillStyle = bg; g.fillRect(0, 0, w, h); g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 3; g.strokeRect(2, 2, w - 4, h - 4); }
    text(g, s, w / 2, h * .54, Math.round(h * .62), { color: fg, maxW: w - 24 });
    if (kind === 'paint') { g.globalCompositeOperation = 'destination-out'; speck(g, w, h, k.length * 13, 160, 'rgba(0,0,0,A)', .4, 1, 1, 3); g.globalCompositeOperation = 'source-over'; }
    else speck(g, w, h, k.length * 7, 40, 'rgba(40,30,20,A)', .05, .25, 1, 3);
  });
  for (const n of ROOMS) at('r' + n, (w, h) => { g.fillStyle = '#2a201a'; g.fillRect(0, 0, w, h); g.strokeStyle = '#b08a45'; g.lineWidth = 2; g.strokeRect(3, 3, w - 6, h - 6); text(g, String(n), w / 2, h * .56, 16, { color: '#d9b260', font: 'Georgia, "Times New Roman", serif' }); });
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
  at('starlite', (w, h) => neon(g, 'Starlite', w / 2, h * .52, 150, '#ff3c9a', { italic: true, font: 'Georgia, "Times New Roman", serif', maxW: w - 60 }));
  at('motel', (w, h) => neon(g, 'MOTEL', w / 2, h / 2, 118, '#44e6ff', { maxW: w - 40 }));
  at('vacancy', (w, h) => neon(g, 'VACANCY', w / 2, h / 2, 60, '#ff2a1c', { maxW: w - 30 }));
  at('no', (w, h) => { g.globalAlpha = .25; neon(g, 'NO', w / 2, h / 2, 44, '#ff2a1c'); g.globalAlpha = 1; });
  at('diner', (w, h) => neon(g, 'DINER', w / 2, h / 2, 118, '#ff2a1c', { maxW: w - 40 }));
  at('eat', (w, h) => neon(g, 'EAT', w / 2, h / 2, 110, '#ffd23c'));
  at('open', (w, h) => { neon(g, 'OPEN', w / 2, h / 2, 64, '#3cff7a'); });
  at('star', (w, h) => { g.save(); g.shadowColor = '#ffd23c'; g.shadowBlur = 16; g.strokeStyle = '#ffe9a0'; g.lineWidth = 6; g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 22 : 52; g.lineTo(w / 2 + Math.cos(a) * r, h / 2 + Math.sin(a) * r); } g.closePath(); g.stroke(); g.restore(); });
  at('arrow', (w, h) => { g.save(); g.shadowColor = '#ffd23c'; g.shadowBlur = 14; g.strokeStyle = '#ffe9a0'; g.lineWidth = 7; g.beginPath(); g.moveTo(12, h / 2); g.lineTo(w - 22, h / 2); g.moveTo(w - 50, h / 2 - 30); g.lineTo(w - 18, h / 2); g.lineTo(w - 50, h / 2 + 30); g.stroke(); g.restore(); });
  const curtain = (w, h, a, b) => { const gr = g.createLinearGradient(0, 0, w, 0); for (let i = 0; i <= 10; i++) gr.addColorStop(i / 10, i % 2 ? a : b); g.fillStyle = gr; g.fillRect(0, 0, w, h); const v = g.createLinearGradient(0, 0, 0, h); v.addColorStop(0, 'rgba(0,0,0,.35)'); v.addColorStop(.5, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.4)'); g.fillStyle = v; g.fillRect(0, 0, w, h); };
  at('curtain', (w, h) => curtain(w, h, 'rgb(255,170,90)', 'rgb(190,105,50)'));
  at('curtain2', (w, h) => { curtain(w, h, 'rgb(240,200,140)', 'rgb(170,120,70)'); g.fillStyle = 'rgba(255,230,190,.9)'; g.fillRect(w * .44, 0, w * .12, h); });
  at('blind', (w, h) => { g.fillStyle = 'rgb(120,150,200)'; g.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 8) { g.fillStyle = 'rgba(20,25,40,.55)'; g.fillRect(0, y, w, 3); } });
  at('town', (w, h) => { g.fillStyle = 'rgba(0,0,0,0)'; const r = rng(17); for (let i = 0; i < 260; i++) { const x = r() * w, y = h * .45 + Math.pow(r(), 2) * h * .5, k = .4 + r() * .6, warm = r() < .75; g.fillStyle = warm ? `rgba(255,${170 + r() * 50 | 0},90,${k})` : `rgba(200,220,255,${k})`; g.fillRect(x, y, 1 + r() * 2.5, 1 + r() * 1.5); } });
  at('coach', (w, h) => neon(g, 'GREYLINE', w / 2, h / 2, 64, '#9ad8ff', { maxW: w - 30 }));
  at('ice', (w, h) => neon(g, 'ICE', w / 2, h / 2, 64, '#44e6ff'));
  at('cafe', (w, h) => neon(g, 'CAFE', w / 2, h / 2, 60, '#ffd23c'));
  at('tv', (w, h) => { const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, 'rgb(90,120,200)'); gr.addColorStop(1, 'rgb(30,50,110)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 3) { g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(0, y, w, 1); } });
  at('vend', (w, h) => { g.fillStyle = 'rgb(200,30,30)'; g.fillRect(0, 0, w, h); g.fillStyle = 'rgb(250,240,230)'; g.fillRect(10, 10, w - 20, 40); text(g, 'FIZZ', w / 2, 30, 30, { color: '#b31a1a' }); for (let i = 0; i < 6; i++) { g.fillStyle = 'rgba(255,255,255,.85)'; g.fillRect(w - 34, 64 + i * 20, 22, 12); } g.fillStyle = 'rgb(255,220,200)'; g.fillRect(14, 64, 70, 110); });
  at('menu', (w, h) => { g.fillStyle = 'rgb(30,26,22)'; g.fillRect(0, 0, w, h); const items = ['BURGER 6.50', 'PIE 3.25', 'COFFEE 1.50', 'SHAKE 4.00', 'EGGS 5.75', 'FRIES 2.75']; items.forEach((s, i) => text(g, s, 20, 26 + i * 22, 16, { color: '#ffe8b0', align: 'left' })); text(g, 'MENU', w / 2, 10, 14, { color: '#ff6a4a' }); });
  at('office', (w, h) => neon(g, 'OFFICE', w / 2, h / 2, 82, '#ff3c9a', { maxW: w - 30 }));
  at('bar', (w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(255,240,220,0)'); gr.addColorStop(.5, 'rgba(255,240,220,1)'); gr.addColorStop(1, 'rgba(255,240,220,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
  at('stripe', (w, h) => { g.fillStyle = 'rgb(255,60,150)'; g.fillRect(0, h * .35, w, h * .3); g.shadowColor = '#ff3c9a'; g.shadowBlur = 10; g.fillRect(0, h * .4, w, h * .2); });
}
function drawPaint(g, w, h) {
  g.clearRect(0, 0, w, h);
  const r = rng(5); g.fillStyle = '#fff';
  for (let x = 0; x < w; x += 2) { const t0 = h * (.12 + .06 * Math.sin(x * .05) * r()), t1 = h * (.88 - .06 * Math.sin(x * .031 + 1) * r()); g.fillRect(x, t0, 2, t1 - t0); }
  g.globalCompositeOperation = 'destination-out';
  speck(g, w, h, 6, 460, 'rgba(0,0,0,A)', .5, 1, 1, 3.5);
  for (let i = 0; i < 10; i++) { const x = r() * w; g.fillStyle = 'rgba(0,0,0,.85)'; g.beginPath(); g.ellipse(x, h * r(), 8 + r() * 26, 4 + r() * 14, 0, 0, TAU); g.fill(); }
  g.globalCompositeOperation = 'source-over';
}
function tex(scene, name, w, h, draw, wrapU) {
  const dt = new BABYLON.DynamicTexture(name, { width: w, height: h }, scene, true);
  draw(dt.getContext(), w, h); dt.hasAlpha = true; dt.update(true);
  dt.wrapU = wrapU ? BABYLON.Texture.WRAP_ADDRESSMODE : BABYLON.Texture.CLAMP_ADDRESSMODE; dt.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;
  dt.anisotropicFilteringLevel = 4;
  return dt;
}
const SCN = new WeakMap();
function mats(B) {
  const sc = B.scene; let s = SCN.get(sc); if (s) return s;
  s = {}; SCN.set(sc, s); sc.onDisposeObservable.addOnce(() => SCN.delete(sc));
  const PBR = BABYLON.PBRMaterial;
  const paint = new PBR('mo_paint', sc);
  paint.albedoTexture = tex(sc, 'mo_paint_tex', 512, 64, drawPaint, true); paint.useAlphaFromAlbedoTexture = true;
  paint.transparencyMode = PBR.PBRMATERIAL_ALPHATEST; paint.alphaCutOff = .45; paint.metallic = 0; paint.roughness = .62; paint.zOffset = -2;
  const stain = new PBR('mo_stain', sc);
  stain.albedoTexture = tex(sc, 'mo_stain_tex', ATL, ATL, drawStain); stain.useAlphaFromAlbedoTexture = true;
  stain.transparencyMode = PBR.PBRMATERIAL_ALPHABLEND; stain.disableDepthWrite = true; stain.metallic = 0; stain.roughness = .6; stain.zOffset = -3;
  const sign = new PBR('mo_sign', sc);
  sign.albedoTexture = tex(sc, 'mo_sign_tex', ATL, ATL, drawSign); sign.useAlphaFromAlbedoTexture = true;
  sign.transparencyMode = PBR.PBRMATERIAL_ALPHATEST; sign.alphaCutOff = .45; sign.metallic = 0; sign.roughness = .6; sign.zOffset = -2;
  const glow = new PBR('mo_glow', sc);
  const gt = tex(sc, 'mo_glow_tex', ATL, ATL, drawGlow);
  glow.albedoColor = new BABYLON.Color3(0, 0, 0); glow.emissiveTexture = gt; glow.emissiveColor = new BABYLON.Color3(1, 1, 1); glow.emissiveIntensity = 2.2;
  glow.opacityTexture = gt; glow.transparencyMode = PBR.PBRMATERIAL_ALPHABLEND; glow.disableDepthWrite = true; glow.zOffset = -2;
  glow.disableLighting = true; glow.environmentIntensity = 0; glow.metallic = 0; glow.roughness = 1; glow.backFaceCulling = true;
  const dim = new PBR('mo_glowdim', sc);
  dim.albedoColor = new BABYLON.Color3(0, 0, 0); dim.emissiveTexture = gt; dim.emissiveColor = new BABYLON.Color3(1, 1, 1); dim.emissiveIntensity = .6;
  dim.transparencyMode = PBR.PBRMATERIAL_OPAQUE;   // opaque slots only (curtains, blinds, screens): no sorting against the glass
  dim.disableLighting = true; dim.environmentIntensity = 0; dim.metallic = 0; dim.roughness = 1;
  for (const m of [paint, stain, sign, glow, dim]) m.metadata = { lf: m.name, surf: 'concrete', map: 'motel' };
  s.paint = paint; s.stain = stain; s.sign = sign; s.glow = glow; s.glowdim = dim;
  return s;
}

// ------------------------------------------------------------------------------------------------ quad accumulator
const TILE = 64;
function qacc(B, key, x, z) {
  const S = mo(B), k = key + '|' + Math.floor(x / TILE) + '|' + Math.floor(z / TILE);
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
  // Babylon is left-handed: a front face winds clockwise seen from its normal
  if (cx * n[0] + cy * n[1] + cz * n[2] < 0) a.I.push(base, base + 1, base + 2, base, base + 2, base + 3);
  else a.I.push(base, base + 2, base + 1, base, base + 3, base + 2);
}
// face: the direction the visible side looks at. R = the quad's right (u) as seen by a viewer facing it.
const FACES = { n: [[-1, 0, 0], [0, 1, 0], [0, 0, 1]], s: [[1, 0, 0], [0, 1, 0], [0, 0, -1]], e: [[0, 0, 1], [0, 1, 0], [1, 0, 0]], w: [[0, 0, -1], [0, 1, 0], [-1, 0, 0]], u: [[1, 0, 0], [0, 0, 1], [0, 1, 0]] };
const ry3 = (v, a) => { const c = Math.cos(a), s = Math.sin(a); return [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c]; };
function slotUV(atlas, slot) {
  const R = atlas === 'stain' ? STAIN : atlas === 'glow' || atlas === 'glowdim' ? GLOW : SIGN, r = R[slot];
  if (!r) throw new Error('motel: unknown ' + atlas + ' slot ' + slot);
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
/** steel railing (top rail, mid rail, posts or pickets) with a movement-only collider (bullets and sight pass) */
export function rail(B, x0, z0, x1, z1, y, o = {}) {
  const L = Math.hypot(x1 - x0, z1 - z0), ry = Math.atan2(-(z1 - z0), x1 - x0), m = o.mat || 'paint_black', h = o.h || 1.05;
  B.push((x0 + x1) / 2, y, (z0 + z1) / 2, ry);
  B.box(0, h - .05, 0, L, .05, .06, { mat: m, collide: false, cast: false });
  B.box(0, .1, 0, L, .04, .04, { mat: m, collide: false, cast: false });
  const step = o.bars ? .14 : 1.5, n = Math.max(1, Math.round(L / step));
  for (let i = 0; i <= n; i++) {
    const big = !o.bars || i % 10 === 0 || i === n;
    B.box(-L / 2 + i * L / n, 0, 0, big ? .05 : .018, h - .05, big ? .05 : .018, { mat: m, collide: false, cast: false });
  }
  if (o.collide !== false) B.box(0, 0, 0, L, h + .05, .1, { visible: false, ray: false, surf: 'metal' });
  B.pop();
}
/** walkway wall lamp: a small box with an emissive lens (back on the wall, faces local +z after ry) */
export function wallLamp(B, x, y, z, ry = 0) {
  B.push(x, y, z, ry);
  B.box(0, 0, .06, .16, .26, .12, { mat: 'paint_black', collide: false, cast: false });
  B.box(0, .03, .125, .12, .18, .02, { mat: 'emissive_warm', collide: false, cast: false });
  B.pop();
}

// ------------------------------------------------------------------------------------------------ flush
export function finish(B) {
  const S = mo(B), M = mats(B);
  for (const a of S.acc.values()) {
    if (!a.I.length) continue;
    const m = new BABYLON.Mesh('mo_' + a.key, B.scene), vd = new BABYLON.VertexData();
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
