/* LIVE FIRE — Skyline Phase II kit: map-specific prefabs and painters used by js/maps/defs/construction.js (owned by that map).
   Exports (all take the MapBuilder B; WORLD coordinates, no B.push frame is expected):
     kit(B, x, z, nc)              world-space Kit for the 32 m cell of (x, z) (nc = no shadow casting); flushed by finish
     decal(B, atlas, slot, x, y, z, w, h, o)   atlas quad: 'stain' (alpha blend), 'sign' (alpha test); o.face n|s|e|w|u, o.ry, o.col
     paint(B, x0, z0, x1, z1, o)   worn paint stripe on the ground (o: w, col, dash [on, off], y)
     pave(B, regions, deflt, rect, cell)   ground of non-overlapping quads: regions [[x0, z0, x1, z1, mat]] (first wins)
     railing / stair / deck / hcol / fence / skirt / farGround / pylon   steel handrail, open steel stair (ramp collider),
                                   grated deck, H column, chain-link fence line, skirting, scenery heightfield, lattice pylon
     shoring(B, x0, z0, x1, z1, y0, y1, o)   adjustable steel props under a slab (thin instances, thin colliders) + bearers
     scaffold(B, x0, z0, x1, z1, o)          tube-and-fitting façade scaffold (lifts, boards, toe boards, guards, bracing)
     stairTower(B, x, z, levels, o)          scaffold stair tower with switchback flights (2.6 x 7.2 m)
     edgeGuard(B, x0, z0, x1, z1, y)         yellow mesh edge protection (movement-only collider)
     hoarding(B, x0, z0, x1, z1, o)          plywood site hoarding with posts and raking braces
     festoon, workLight, portaloo, skip, excavator, mixerTruck, towerCrane, cityBuilding, concretePipes, plyStack, beamStack, lightTower
     finish(B)                     flushes the quads and kits (call at the end of build)
   Canvas atlases are drawn once per scene (original artwork, fictional names: Skyline Phase II, Halverson & Kite Construction). */
import { Kit, emitKit } from './props/kit.js';

const TAU = Math.PI * 2, H = Math.PI / 2;
export function rng(seed) { let a = seed >>> 0 || 1; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export function cs(B) { if (!B._cs) B._cs = { acc: new Map(), kits: new Map(), seed: 1 }; return B._cs; }
const CELL = 32;
export function kit(B, x, z, nc) {
  const S = cs(B), k = Math.floor(x / CELL) + '_' + Math.floor(z / CELL) + (nc ? '_nc' : '');
  let K = S.kits.get(k); if (!K) { K = new Kit(S.seed++); S.kits.set(k, K); }
  return K;
}

// ------------------------------------------------------------------------------------------------ canvas atlases
const SCN = new WeakMap();
const ATL = 1024, SGH = 2048;   // stain atlas 1024 x 1024, sign atlas 1024 x 2048
const STAIN = { oil0: [0, 0, 256, 256], oil1: [256, 0, 256, 256], oil2: [512, 0, 256, 256], drip: [768, 0, 256, 256], tyre: [0, 256, 512, 128],
  rust: [512, 256, 128, 256], water: [640, 256, 128, 256], grime: [768, 256, 256, 128], crack: [0, 384, 256, 256], patch: [256, 384, 256, 256],
  litter: [512, 512, 256, 256], dust: [768, 512, 256, 256], leaves: [0, 640, 256, 256], tyre2: [0, 896, 512, 128], soot: [768, 768, 256, 256],
  streak: [768, 384, 256, 128] };
const SIGN = { A: [0, 0, 256, 256], B: [256, 0, 256, 256], arrow: [512, 0, 128, 256], hatch: [640, 0, 256, 256], chev: [896, 0, 128, 256] };
const NAV = '#1d2a36', CRM = '#e9e6dc', YLW = '#f2c230';
const TEXTS = [
  ['brand', 'SKYLINE PHASE II', 'plate', '#16263a', '#f2c230'], ['builder', 'HALVERSON & KITE CONSTRUCTION', 'plate', '#f2c230', '#16263a'],
  ['entrance', 'SITE ENTRANCE · ALL VISITORS REPORT TO SECURITY', 'plate', '#2b6b33', '#f5f2ea'], ['ppe', 'HARD HAT · HI-VIS · SAFETY BOOTS', 'plate', '#1f4d8c', '#f5f2ea'],
  ['crane', 'DANGER · CRANE OPERATING OVERHEAD', 'plate', '#c9a227', '#141414'], ['noentry', 'NO UNAUTHORISED ENTRY', 'plate', '#b32a1d', '#f5f2ea'],
  ['edge', 'EDGE PROTECTION MUST NOT BE REMOVED', 'plate', '#c9a227', '#141414'], ['deliv', 'DELIVERIES · GATE 2', 'plate', CRM, NAV],
  ['office', 'SITE OFFICE', 'plate', CRM, NAV], ['canteen', 'CANTEEN · DRYING ROOM', 'plate', CRM, NAV], ['first', 'FIRST AID', 'plate', '#2b6b33', '#f5f2ea'],
  ['l0', 'LEVEL 0', 'paint', null, '#f2c230'], ['l1', 'LEVEL 1', 'paint', null, '#f2c230'], ['l2', 'LEVEL 2', 'paint', null, '#f2c230'],
  ['muster', 'FIRE ASSEMBLY POINT', 'plate', '#2b6b33', '#f5f2ea'], ['rebar', 'REBAR SHOP', 'plate', CRM, NAV], ['store', 'MATERIAL STORE · BAY 4', 'plate', CRM, NAV],
  ['load', 'MAX LOAD 2.5 t', 'plate', '#c9a227', '#141414'], ['speed', 'SITE SPEED 10', 'paint', null, '#ffffff'], ['keep', 'KEEP CLEAR', 'paint', null, '#ffffff'],
  ['hoist', 'HOIST 1 · 1500 kg', 'plate', '#c9a227', '#141414'], ['wash', 'WHEEL WASH', 'plate', CRM, NAV], ['core', 'CORE 1 · STAIR', 'paint', null, '#d63a2a'],
  ['lift', 'LIFT SHAFT · DANGER', 'paint', null, '#d63a2a'], ['void', 'VOID · DO NOT ENTER', 'paint', null, '#d63a2a'], ['homes', '212 NEW HOMES · COMPLETING 2028', 'plate', '#16263a', '#ffffff'],
  ['permit', 'HOT WORKS BY PERMIT ONLY', 'plate', '#b32a1d', '#f5f2ea'], ['mixer', 'CONCRETE WASHOUT', 'plate', CRM, NAV], ['grid', 'C4', 'paint', null, '#d63a2a'],
  ['grid2', 'E2', 'paint', null, '#d63a2a'], ['grid3', 'B6', 'paint', null, '#d63a2a'], ['street1', 'FENWICK STREET', 'plate', '#1f3d2a', '#f5f2ea'], ['street2', 'CANAL ROW', 'plate', '#1f3d2a', '#f5f2ea'],
];
TEXTS.forEach((t, i) => { SIGN[t[0]] = [(i % 2) * 512, 256 + Math.floor(i / 2) * 48, 512, 46]; });
SIGN.banner1 = [0, 1100, 1024, 205]; SIGN.banner2 = [0, 1320, 1024, 205]; SIGN.rules = [0, 1540, 360, 500]; SIGN.render = [380, 1540, 640, 400];

function noiseFill(g, w, h, seed, n, col, a0, a1, r0, r1) {
  const r = rng(seed);
  for (let i = 0; i < n; i++) { g.fillStyle = col.replace('A', (a0 + r() * (a1 - a0)).toFixed(3)); const rr = r0 + r() * (r1 - r0); g.beginPath(); g.arc(r() * w, r() * h, rr, 0, TAU); g.fill(); }
}
function blob(g, cx, cy, R, seed, col, k = 1) {
  const r = rng(seed);
  for (let i = 0; i < 26; i++) {
    const a = r() * TAU, d = r() * R * .55, x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d * (.6 + r() * .5), rr = R * (.18 + r() * .38);
    const gr = g.createRadialGradient(x, y, 0, x, y, rr);
    gr.addColorStop(0, col.replace('A', (.22 * k * (.6 + r() * .6)).toFixed(3))); gr.addColorStop(1, col.replace('A', '0'));
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, rr, 0, TAU); g.fill();
  }
}
function drawStain(g) {
  g.clearRect(0, 0, ATL, ATL);
  const at = (s, fn) => { const [x, y, w, h] = STAIN[s]; g.save(); g.translate(x, y); g.beginPath(); g.rect(0, 0, w, h); g.clip(); fn(w, h); g.restore(); };
  ['oil0', 'oil1', 'oil2'].forEach((s, i) => at(s, (w, h) => { blob(g, w / 2, h / 2, w * .42, 11 + i * 7, 'rgba(14,11,9,A)', 1.5); blob(g, w * .45, h * .5, w * .22, 31 + i, 'rgba(8,7,6,A)', 1.6); noiseFill(g, w, h, 5 + i, 40, 'rgba(10,9,8,A)', .1, .4, 1, 4); }));
  at('drip', (w, h) => { for (let i = 0; i < 7; i++) blob(g, 30 + (i * 37) % 200, 30 + (i * 71) % 200, 20 + (i * 13) % 26, 70 + i, 'rgba(12,10,8,A)', 1.4); });
  at('tyre', (w, h) => { const r = rng(9); for (const y0 of [h * .3, h * .7]) for (let x = 0; x < w; x += 2) { const a = Math.min(1, x / 60, (w - x) / 60) * (.25 + r() * .2); g.fillStyle = 'rgba(12,12,12,' + a.toFixed(3) + ')'; g.fillRect(x, y0 - 9 + Math.sin(x * .01) * 3, 2, 18); } });
  at('tyre2', (w, h) => { const r = rng(19); for (let x = 0; x < w; x += 2) { const a = Math.min(1, x / 90, (w - x) / 40) * (.2 + r() * .15); g.fillStyle = 'rgba(14,13,12,' + a.toFixed(3) + ')'; g.fillRect(x, h * .5 - 14 + Math.sin(x * .013) * 10, 2, 28); } });
  at('rust', (w, h) => { const r = rng(4); for (let i = 0; i < 18; i++) { const x = w * .5 + (r() - .5) * w * .5, L = h * (.3 + r() * .7), gr = g.createLinearGradient(0, 0, 0, L); gr.addColorStop(0, 'rgba(110,52,20,.55)'); gr.addColorStop(1, 'rgba(110,52,20,0)'); g.fillStyle = gr; g.fillRect(x, 0, 2 + r() * 5, L); } });
  at('water', (w, h) => { const r = rng(6); for (let i = 0; i < 26; i++) { const x = r() * w, L = h * (.4 + r() * .6), gr = g.createLinearGradient(0, 0, 0, L); gr.addColorStop(0, 'rgba(20,22,22,.42)'); gr.addColorStop(1, 'rgba(20,22,22,0)'); g.fillStyle = gr; g.fillRect(x, 0, 2 + r() * 7, L); } });
  at('streak', (w, h) => { const r = rng(17); for (let i = 0; i < 40; i++) { const x = r() * w, L = h * (.3 + r() * .7), gr = g.createLinearGradient(0, 0, 0, L); gr.addColorStop(0, 'rgba(70,45,25,.38)'); gr.addColorStop(1, 'rgba(60,40,25,0)'); g.fillStyle = gr; g.fillRect(x, 0, 1 + r() * 4, L); } });
  at('grime', (w, h) => { const gr = g.createLinearGradient(0, h, 0, 0); gr.addColorStop(0, 'rgba(22,19,15,.6)'); gr.addColorStop(.5, 'rgba(22,19,15,.2)'); gr.addColorStop(1, 'rgba(22,19,15,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); noiseFill(g, w, h, 3, 90, 'rgba(20,16,12,A)', .05, .3, 1, 5); });
  at('crack', (w, h) => { const r = rng(12); g.strokeStyle = 'rgba(10,10,10,.75)'; g.lineCap = 'round'; for (let k = 0; k < 4; k++) { let x = w * r(), y = h * r(); g.lineWidth = 2 + r() * 2; g.beginPath(); g.moveTo(x, y); for (let i = 0; i < 14; i++) { x += (r() - .5) * 40; y += (r() - .3) * 26; g.lineTo(x, y); } g.stroke(); } });
  at('patch', (w, h) => { const r = rng(15); g.fillStyle = 'rgba(16,16,17,.55)'; g.beginPath(); g.moveTo(20, 30); for (let i = 0; i < 16; i++) { const a = i / 16 * TAU; g.lineTo(w / 2 + Math.cos(a) * (w * .38 + r() * 14), h / 2 + Math.sin(a) * (h * .34 + r() * 14)); } g.closePath(); g.fill(); noiseFill(g, w, h, 16, 60, 'rgba(0,0,0,A)', .05, .2, 1, 3); });
  at('litter', (w, h) => { const r = rng(21); for (let i = 0; i < 16; i++) { g.save(); g.translate(20 + r() * (w - 40), 20 + r() * (h - 40)); g.rotate(r() * TAU); const c = r(); g.fillStyle = c < .4 ? 'rgba(225,222,210,.95)' : c < .6 ? 'rgba(170,150,110,.95)' : c < .8 ? 'rgba(60,90,140,.9)' : 'rgba(190,60,40,.9)'; g.fillRect(-6 - r() * 10, -4 - r() * 6, 12 + r() * 16, 8 + r() * 10); g.restore(); } });
  at('dust', (w, h) => { blob(g, w / 2, h / 2, w * .45, 41, 'rgba(150,140,120,A)', 1.2); noiseFill(g, w, h, 42, 120, 'rgba(160,150,128,A)', .05, .25, 1, 3); });
  at('leaves', (w, h) => { const r = rng(33); for (let i = 0; i < 40; i++) { g.save(); g.translate(r() * w, r() * h); g.rotate(r() * TAU); g.fillStyle = `rgba(${90 + r() * 60 | 0},${60 + r() * 40 | 0},${20 + r() * 20 | 0},.9)`; g.beginPath(); g.ellipse(0, 0, 5 + r() * 5, 2.5 + r() * 2, 0, 0, TAU); g.fill(); g.restore(); } });
  at('soot', (w, h) => { const gr = g.createRadialGradient(w / 2, h, 0, w / 2, h * .6, w * .6); gr.addColorStop(0, 'rgba(8,8,8,.6)'); gr.addColorStop(1, 'rgba(8,8,8,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
}
function stencil(g, ch, w, h, col) {
  g.fillStyle = col; g.font = 'bold ' + Math.round(h * .9) + 'px Arial, Helvetica, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(ch, w / 2, h * .54);
  g.globalCompositeOperation = 'destination-out';
  g.fillRect(0, h * .47, w, h * .045); g.fillRect(w * .485, 0, w * .03, h * .3);
  noiseFill(g, w, h, ch.charCodeAt(0), 220, 'rgba(0,0,0,A)', .4, 1, 1, 5);
  g.globalCompositeOperation = 'source-over';
}
function drawSign(g) {
  g.clearRect(0, 0, ATL, SGH);
  const at = (s, fn) => { const [x, y, w, h] = SIGN[s]; g.save(); g.translate(x, y); g.beginPath(); g.rect(0, 0, w, h); g.clip(); fn(w, h); g.restore(); };
  at('A', (w, h) => stencil(g, 'A', w, h, '#ffffff')); at('B', (w, h) => stencil(g, 'B', w, h, '#ffffff'));
  at('arrow', (w, h) => { g.fillStyle = '#fff'; g.beginPath(); g.moveTo(w / 2, 6); g.lineTo(w - 10, h * .38); g.lineTo(w * .64, h * .38); g.lineTo(w * .64, h - 6); g.lineTo(w * .36, h - 6); g.lineTo(w * .36, h * .38); g.lineTo(10, h * .38); g.closePath(); g.fill();
    g.globalCompositeOperation = 'destination-out'; noiseFill(g, w, h, 77, 160, 'rgba(0,0,0,A)', .4, 1, 1, 4); g.globalCompositeOperation = 'source-over'; });
  at('hatch', (w, h) => { g.fillStyle = '#fff'; for (let i = -h; i < w + h; i += 46) { g.beginPath(); g.moveTo(i, h); g.lineTo(i + 22, h); g.lineTo(i + 22 + h, 0); g.lineTo(i + h, 0); g.closePath(); g.fill(); }
    g.strokeStyle = '#fff'; g.lineWidth = 14; g.strokeRect(7, 7, w - 14, h - 14); g.globalCompositeOperation = 'destination-out'; noiseFill(g, w, h, 78, 260, 'rgba(0,0,0,A)', .4, 1, 1, 4); g.globalCompositeOperation = 'source-over'; });
  at('chev', (w, h) => { for (let i = 0; i < 6; i++) { g.fillStyle = i % 2 ? '#1a1a1a' : '#e8b416'; g.beginPath(); g.moveTo(0, i * 48); g.lineTo(w, i * 48 - 30); g.lineTo(w, i * 48 + 18); g.lineTo(0, i * 48 + 48); g.closePath(); g.fill(); } });
  for (const [k, text, kind, bg, fg] of TEXTS) at(k, (w, h) => {
    if (kind === 'plate') { g.fillStyle = bg; g.fillRect(0, 0, w, h); g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 3; g.strokeRect(2, 2, w - 4, h - 4); }
    g.fillStyle = fg; g.font = 'bold ' + Math.round(h * .62) + 'px Arial, Helvetica, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    const m = g.measureText(text).width, mw = w - 24;
    if (m > mw) { g.save(); g.translate(w / 2, h * .54); g.scale(mw / m, 1); g.fillText(text, 0, 0); g.restore(); } else g.fillText(text, w / 2, h * .54);
    if (kind === 'paint') { g.globalCompositeOperation = 'destination-out'; noiseFill(g, w, h, k.length * 13, 160, 'rgba(0,0,0,A)', .4, 1, 1, 3); g.globalCompositeOperation = 'source-over'; }
    else noiseFill(g, w, h, k.length * 7, 40, 'rgba(40,30,20,A)', .05, .25, 1, 3);
  });
  const fit = (text, x, y, size, mw, col, font = 'bold') => { g.fillStyle = col; g.font = font + ' ' + size + 'px Arial, Helvetica, sans-serif'; const m = g.measureText(text).width;
    if (m > mw) { g.save(); g.translate(x, y); g.scale(mw / m, 1); g.fillText(text, 0, 0); g.restore(); } else g.fillText(text, x, y); };
  const skyline = (w, h, base, col, seed) => { const r = rng(seed); g.fillStyle = col; let x = 0; while (x < w) { const bw = 20 + r() * 50, bh = h * (.25 + r() * .6); g.fillRect(x, base - bh, bw - 3, bh); x += bw; } };
  at('banner1', (w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#1c3350'); gr.addColorStop(1, '#0f1d2e'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    skyline(w, h, h, 'rgba(70,110,150,.35)', 4);
    g.fillStyle = '#f2c230'; g.fillRect(0, h - 14, w, 14);
    g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    fit('SKYLINE', 40, h * .52, 92, 420, '#f2c230'); fit('PHASE II', 44, h * .8, 44, 300, '#ffffff');
    g.textAlign = 'right'; fit('212 NEW HOMES · RETAIL · ROOF GARDEN', w - 40, h * .42, 34, 560, '#ffffff'); fit('COMPLETING SPRING 2028', w - 40, h * .62, 28, 500, '#9fc3e6');
    fit('HALVERSON & KITE CONSTRUCTION', w - 40, h * .82, 22, 500, '#f2c230');
    noiseFill(g, w, h, 12, 160, 'rgba(255,255,255,A)', .01, .06, 1, 3);
  });
  at('banner2', (w, h) => {
    g.fillStyle = '#e8e6df'; g.fillRect(0, 0, w, h);
    for (let x = -h; x < w; x += 60) { g.fillStyle = '#f2b600'; g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 30, 0); g.lineTo(x + 30 - 26, 26); g.lineTo(x - 26, 26); g.fill(); g.beginPath(); g.moveTo(x, h - 26); g.lineTo(x + 30, h - 26); g.lineTo(x + 30 - 26, h); g.lineTo(x - 26, h); g.fill(); }
    g.textAlign = 'center'; g.textBaseline = 'middle';
    fit('THINK SAFE · WORK SAFE · HOME SAFE', w / 2, h * .42, 54, w - 80, '#16263a'); fit('EVERY WORKER HOME EVERY DAY  ·  REPORT ALL NEAR MISSES', w / 2, h * .68, 26, w - 160, '#b32a1d');
    noiseFill(g, w, h, 13, 220, 'rgba(60,50,40,A)', .02, .1, 1, 3);
  });
  at('rules', (w, h) => {
    g.fillStyle = '#f4f2ec'; g.fillRect(0, 0, w, h); g.fillStyle = '#1f4d8c'; g.fillRect(0, 0, w, 70); g.textAlign = 'center'; g.textBaseline = 'middle';
    fit('SITE SAFETY RULES', w / 2, 38, 38, w - 30, '#ffffff');
    const L = ['ALL VISITORS MUST SIGN IN', 'HARD HATS MUST BE WORN', 'HIGH VISIBILITY CLOTHING', 'SAFETY FOOTWEAR', 'EYE PROTECTION', 'GLOVES WHEN HANDLING', 'NO SMOKING ON SITE', 'SITE SPEED 10 KM/H'];
    const C = ['#1f4d8c', '#1f4d8c', '#1f4d8c', '#1f4d8c', '#1f4d8c', '#1f4d8c', '#b32a1d', '#b32a1d'];
    g.textAlign = 'left';
    L.forEach((s, i) => { const y = 100 + i * 50; g.fillStyle = C[i]; g.beginPath(); g.arc(36, y, 18, 0, TAU); g.fill(); g.fillStyle = '#fff'; g.fillRect(28, y - 3, 16, 6); fit(s, 66, y + 2, 22, w - 80, '#222'); });
    noiseFill(g, w, h, 14, 120, 'rgba(60,50,40,A)', .02, .12, 1, 4);
  });
  at('render', (w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#7fb2df'); gr.addColorStop(.7, '#dcebf5'); gr.addColorStop(1, '#c9d6c0'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    skyline(w, h, h * .82, 'rgba(120,140,160,.5)', 7);
    g.fillStyle = '#4a6a86'; g.fillRect(w * .36, h * .1, w * .26, h * .74); g.fillStyle = '#c7cfd4'; for (let y = h * .12; y < h * .84; y += 16) g.fillRect(w * .36, y, w * .26, 3);
    for (let x = w * .36; x < w * .62; x += 22) { g.fillStyle = 'rgba(220,235,245,.35)'; g.fillRect(x, h * .1, 2, h * .74); }
    g.fillStyle = '#d8d1c3'; g.fillRect(w * .2, h * .62, w * .62, h * .22); g.fillStyle = '#3b4a55'; for (let x = w * .22; x < w * .8; x += 34) g.fillRect(x, h * .66, 24, h * .14);
    g.fillStyle = '#3f6b35'; for (let i = 0; i < 9; i++) { g.beginPath(); g.arc(w * .1 + i * w * .1, h * .86, 18 + (i % 3) * 6, 0, TAU); g.fill(); }
    g.fillStyle = '#6d7a62'; g.fillRect(0, h * .9, w, h * .1);
    g.textAlign = 'left'; g.textBaseline = 'middle'; fit('SKYLINE PHASE II', 18, 26, 30, w * .6, '#16263a');
  });
}
function drawPaint(g, w, h) {
  g.clearRect(0, 0, w, h);
  const r = rng(5);
  g.fillStyle = '#fff';
  for (let x = 0; x < w; x += 2) { const t0 = h * (.12 + .06 * Math.sin(x * .05) * r()), t1 = h * (.88 - .06 * Math.sin(x * .031 + 1) * r()); g.fillRect(x, t0, 2, t1 - t0); }
  g.globalCompositeOperation = 'destination-out';
  noiseFill(g, w, h, 6, 420, 'rgba(0,0,0,A)', .5, 1, 1, 3.5);
  for (let i = 0; i < 9; i++) { const x = r() * w; g.fillStyle = 'rgba(0,0,0,.85)'; g.beginPath(); g.ellipse(x, h * r(), 8 + r() * 26, 4 + r() * 14, 0, 0, TAU); g.fill(); }
  g.globalCompositeOperation = 'source-over';
}
function drawFlame(g, w, h) {    // flare flame: soft hot core fading to orange, alpha in the texture
  g.clearRect(0, 0, w, h);
  const r = rng(3);
  for (let i = 0; i < 70; i++) {
    const t = r(), x = w / 2 + (r() - .5) * w * .5 * (1 - t * .3), y = h * (1 - t * .92), R = w * (.08 + .22 * (1 - t)) * (.6 + r() * .6);
    const gr = g.createRadialGradient(x, y, 0, x, y, R), hot = 1 - t;
    gr.addColorStop(0, `rgba(255,${200 + 55 * hot | 0},${120 + 120 * hot | 0},${(.22 + .25 * hot).toFixed(3)})`); gr.addColorStop(1, 'rgba(255,90,20,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, R, 0, TAU); g.fill();
  }
}
function tex(scene, name, w, h, draw, wrapU) {
  const dt = new BABYLON.DynamicTexture(name, { width: w, height: h }, scene, true);
  const g = dt.getContext(); draw(g, w, h);
  dt.hasAlpha = true; dt.update(true);
  dt.wrapU = wrapU ? BABYLON.Texture.WRAP_ADDRESSMODE : BABYLON.Texture.CLAMP_ADDRESSMODE; dt.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;
  dt.anisotropicFilteringLevel = 4;
  return dt;
}
function mats(B) {
  const sc = B.scene; let s = SCN.get(sc); if (s) return s;
  s = {}; SCN.set(sc, s); sc.onDisposeObservable.addOnce(() => SCN.delete(sc));
  const PBR = BABYLON.PBRMaterial;
  const paint = new PBR('cs_paint', sc);
  paint.albedoTexture = tex(sc, 'cs_paint_tex', 512, 64, drawPaint, true); paint.useAlphaFromAlbedoTexture = true;
  paint.transparencyMode = PBR.PBRMATERIAL_ALPHATEST; paint.alphaCutOff = .45; paint.metallic = 0; paint.roughness = .62; paint.zOffset = -2;
  const stain = new PBR('cs_stain', sc);
  stain.albedoTexture = tex(sc, 'cs_stain_tex', ATL, ATL, drawStain); stain.useAlphaFromAlbedoTexture = true;
  stain.transparencyMode = PBR.PBRMATERIAL_ALPHABLEND; stain.disableDepthWrite = true; stain.metallic = 0; stain.roughness = .55; stain.zOffset = -3;
  const sign = new PBR('cs_sign', sc);
  sign.albedoTexture = tex(sc, 'cs_sign_tex', ATL, SGH, drawSign); sign.useAlphaFromAlbedoTexture = true;
  sign.transparencyMode = PBR.PBRMATERIAL_ALPHATEST; sign.alphaCutOff = .45; sign.metallic = 0; sign.roughness = .6; sign.zOffset = -2;
  const flame = new PBR('cs_flame', sc);
  const ft = tex(sc, 'cs_flame_tex', 128, 256, drawFlame);
  flame.albedoColor = new BABYLON.Color3(0, 0, 0); flame.emissiveTexture = ft; flame.emissiveColor = new BABYLON.Color3(1, 1, 1); flame.emissiveIntensity = 3;
  flame.opacityTexture = ft; flame.disableLighting = true; flame.environmentIntensity = 0; flame.backFaceCulling = false;
  flame.transparencyMode = PBR.PBRMATERIAL_ALPHABLEND; flame.disableDepthWrite = true;
  for (const m of [paint, stain, sign, flame]) m.metadata = { lf: m.name, surf: 'concrete', map: 'construction' };
  s.paint = paint; s.stain = stain; s.sign = sign; s.flame = flame;
  return s;
}

// ------------------------------------------------------------------------------------------------ quad accumulator (atlas materials)
const TILE = 64;
function qacc(B, key, x, z) {
  const S = cs(B), k = key + '|' + Math.floor(x / TILE) + '|' + Math.floor(z / TILE);
  let a = S.acc.get(k); if (!a) { a = { key, P: [], N: [], U: [], C: [], I: [] }; S.acc.set(k, a); }
  return a;
}
function emitQuad(B, key, c, R, U, N, w, h, uv, col) {
  const a = qacc(B, key, c[0], c[2]), base = a.P.length / 3, hw = w / 2, hh = h / 2;
  const pts = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]], uvs = [[uv[0], uv[1]], [uv[2], uv[1]], [uv[2], uv[3]], [uv[0], uv[3]]];
  const P = [];
  for (let i = 0; i < 4; i++) {
    const x = c[0] + R[0] * pts[i][0] + U[0] * pts[i][1], y = c[1] + R[1] * pts[i][0] + U[1] * pts[i][1], z = c[2] + R[2] * pts[i][0] + U[2] * pts[i][1];
    P.push([x, y, z]); a.P.push(x, y, z); a.N.push(N[0], N[1], N[2]); a.U.push(uvs[i][0], uvs[i][1]);
    a.C.push(col ? col[0] : 1, col ? col[1] : 1, col ? col[2] : 1, 1);
  }
  const ux = P[1][0] - P[0][0], uy = P[1][1] - P[0][1], uz = P[1][2] - P[0][2], vx = P[2][0] - P[0][0], vy = P[2][1] - P[0][1], vz = P[2][2] - P[0][2];
  const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
  if (cx * N[0] + cy * N[1] + cz * N[2] < 0) a.I.push(base, base + 1, base + 2, base, base + 2, base + 3);
  else a.I.push(base, base + 2, base + 1, base, base + 3, base + 2);
}
const FACES = { n: [[-1, 0, 0], [0, 1, 0], [0, 0, 1]], s: [[1, 0, 0], [0, 1, 0], [0, 0, -1]], e: [[0, 0, 1], [0, 1, 0], [1, 0, 0]], w: [[0, 0, -1], [0, 1, 0], [-1, 0, 0]], u: [[1, 0, 0], [0, 0, 1], [0, 1, 0]] };
const ry3 = (v, a) => { const c = Math.cos(a), s = Math.sin(a); return [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c]; };
function slotUV(atlas, slot) {
  const r = (atlas === 'stain' ? STAIN : SIGN)[slot];
  if (!r) throw new Error('construction: unknown ' + atlas + ' slot ' + slot);
  const H = atlas === 'stain' ? ATL : SGH;
  return [(r[0] + 1.5) / ATL, 1 - (r[1] + r[3] - 1.5) / H, (r[0] + r[2] - 1.5) / ATL, 1 - (r[1] + 1.5) / H];
}
export function decal(B, atlas, slot, x, y, z, w, h, o = {}) {
  const f = FACES[o.face || 'u'], a = o.ry || 0, uv = slotUV(atlas, slot);
  emitQuad(B, atlas, [x, y, z], ry3(f[0], a), ry3(f[1], a), ry3(f[2], a), w, h, uv, o.col);
}
/** a flame card (always faces its own normal; use two crossed) */
function flameQuad(B, x, y, z, w, h, a) {
  emitQuad(B, 'flame', [x, y, z], ry3([1, 0, 0], a), [0, 1, 0], ry3([0, 0, 1], a), w, h, [0, 0, 1, 1]);
}
export function paint(B, x0, z0, x1, z1, o = {}) {
  const w = o.w || .15, y = o.y == null ? .012 : o.y, col = o.col || [1, 1, 1], L = Math.hypot(x1 - x0, z1 - z0);
  if (L < .01) return;
  const ux = (x1 - x0) / L, uz = (z1 - z0) / L, R = [ux, 0, uz], U = [uz, 0, -ux], N = [0, 1, 0];
  const segs = [];
  if (o.dash) { for (let s = 0; s < L; s += o.dash[0] + o.dash[1]) segs.push([s, Math.min(L, s + o.dash[0])]); } else segs.push([0, L]);
  const off = (x0 * 7.31 + z0 * 3.17) % 1;
  for (const [s0, s1] of segs) { const m = (s0 + s1) / 2, l = s1 - s0; emitQuad(B, 'paint', [x0 + ux * m, y, z0 + uz * m], R, U, N, l, w, [off + s0 / 4, 1, off + s1 / 4, 0], col); }
}
export const YEL = [.95, .72, .12], WHT = [.92, .92, .88], RED = [.75, .12, .08];

export function pave(B, regions, deflt, R, cell = 2) {
  const nx = Math.round((R.x1 - R.x0) / cell), nz = Math.round((R.z1 - R.z0) / cell);
  const matAt = (x, z) => { for (const r of regions) if (x > r[0] && x < r[2] && z > r[1] && z < r[3]) return r[4]; return deflt; };
  let prev = null;
  const rows = [];
  for (let j = 0; j < nz; j++) {
    const z = R.z0 + (j + .5) * cell, runs = [];
    let cur = null, s = 0;
    for (let i = 0; i <= nx; i++) {
      const m = i < nx ? matAt(R.x0 + (i + .5) * cell, z) : null;
      if (m !== cur) { if (cur) runs.push([s, i, cur]); cur = m; s = i; }
    }
    const key = runs.map(r => r.join(':')).join(',');
    if (prev && prev.key === key) prev.j1 = j + 1; else { prev = { key, runs, j0: j, j1: j + 1 }; rows.push(prev); }
  }
  for (const r of rows) for (const [i0, i1, m] of r.runs) {
    if (m === 'none') continue;
    B.ground({ minX: R.x0 + i0 * cell, maxX: R.x0 + i1 * cell, minZ: R.z0 + r.j0 * cell, maxZ: R.z0 + r.j1 * cell, mat: m, res: cell });
  }
}

// ------------------------------------------------------------------------------------------------ steelwork
const RAIL = 'p_coat_yellow', STL = 'p_paint_grey', DK = 'steel_dark';
/** handrail along a line at deck height y; o.mat, o.collide (default true), o.toe */
export function railing(B, x0, z0, x1, z1, y, o = {}) {
  const L = Math.hypot(x1 - x0, z1 - z0); if (L < .05) return;
  const ry = Math.atan2(-(z1 - z0), x1 - x0), cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, m = o.mat || RAIL, K = kit(B, cx, cz, true);
  K.push(cx, y, cz, ry);
  K.box(m, 0, 1.0, 0, L, .05, .05); K.box(m, 0, .5, 0, L, .04, .04);
  if (o.toe !== false) K.box(m, 0, 0, 0, L, .1, .015);
  const n = Math.max(1, Math.round(L / 1.6));
  for (let i = 0; i <= n; i++) K.box(m, -L / 2 + i * L / n, 0, 0, .05, 1.03, .05);
  K.pop();
  if (o.collide !== false) B.box(cx, y, cz, L, 1.1, .1, { ry, visible: false, ray: false, surf: 'metal' });
}
/** open steel stair: footprint centre (x, z), w wide, len long, rising from y0 to y1 along dir */
export function stair(B, o) {
  const w = o.w || 1.1, y0 = o.y0 || 0, y1 = o.y1, len = o.len, dir = o.dir || '+z', dy = y1 - y0;
  const ry = { '+z': 0, '-z': Math.PI, '+x': H, '-x': -H }[dir];
  const n = Math.max(2, Math.round(dy / .19)), rise = dy / n, run = len / n, K = kit(B, o.x, o.z, true), m = o.mat || RAIL;
  K.push(o.x, 0, o.z, ry);
  for (let i = 0; i < n; i++) { const zc = -len / 2 + run * (i + .5), top = y0 + rise * (i + 1); K.box('grate', 0, top - .04, zc, w, .04, run + .03); K.box(DK, 0, top - .07, zc + run / 2 - .015, w, .03, .03); }
  const sl = Math.hypot(len, dy), a = Math.atan2(dy, len);
  for (const s of [-1, 1]) {
    K.push(s * (w / 2 + .04), y0 + dy / 2 - .12, 0, 0, -a); K.box(DK, 0, -.13, 0, .05, .26, sl + .2); K.pop();
    const rails = o.rails === undefined ? 'both' : o.rails;
    if (rails === 'both' || (rails === 'left' && s < 0) || (rails === 'right' && s > 0)) {
      const x = s * (w / 2 + .06);
      K.tube(m, [[x, y0 + 1.0, -len / 2], [x, y1 + 1.0, len / 2]], .025, { seg: 6 });
      K.tube(m, [[x, y0 + .55, -len / 2], [x, y1 + .55, len / 2]], .02, { seg: 6 });
      for (const t of [0, .5, 1]) K.box(m, x, y0 + dy * t - .05, -len / 2 + len * t, .045, 1.08, .045);
    }
  }
  K.pop();
  // ramp collider (axis aligned; bullets and sight pass the open steps)
  const ax = dir === '+x' || dir === '-x' ? 'x' : 'z', up = dir === '+x' || dir === '+z';
  B.world.addRamp({ cx: o.x, cz: o.z, hx: ax === 'x' ? len / 2 : w / 2, hz: ax === 'z' ? len / 2 : w / 2, y0: up ? y0 : y1, y1: up ? y1 : y0, axis: ax, surf: 'metal', ray: false });
}
/** grated deck: top at y; o.beam = edge beams (default true), o.mat */
export function deck(B, x0, z0, x1, z1, y, o = {}) {
  const w = x1 - x0, d = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  B.box(cx, y - .06, cz, w, .06, d, { mat: o.mat || 'grate', surf: 'metal', cast: false });
  if (o.beam !== false) {
    const K = kit(B, cx, cz), m = o.beamMat || STL;
    K.box(m, cx, y - .32, z0 + .1, w, .26, .2); K.box(m, cx, y - .32, z1 - .1, w, .26, .2);
    K.box(m, x0 + .1, y - .32, cz, .2, .26, d - .4); K.box(m, x1 - .1, y - .32, cz, .2, .26, d - .4);
    for (let x = x0 + 3; x < x1 - 1; x += 3) K.box(m, x, y - .26, cz, .14, .2, d - .4);
  }
}
/** H column from the ground to y1; o.fp = fireproofing height (concrete encasement), o.mat */
export function hcol(B, x, z, y1, o = {}) {
  const K = kit(B, x, z), m = o.mat || STL, fp = o.fp || 0;
  if (fp > 0) B.box(x, 0, z, .5, fp, .5, { mat: 'p_concrete_precast', surf: 'concrete' });
  B.box(x, 0, z, .32, y1, .32, { visible: false, surf: 'metal' });
  K.box(m, x, fp, z - .14, .32, y1 - fp, .03); K.box(m, x, fp, z + .14, .32, y1 - fp, .03); K.box(m, x, fp, z, .02, y1 - fp, .26);
  if (!fp) K.box('p_concrete_precast', x, 0, z, .6, .25, .6);
}
/** distillation column / vertical vessel: o.mat shell (insulated alu), o.plat [heights], o.skirt, o.label */

export function fence(B, x0, z0, x1, z1, o = {}) {
  const L = Math.hypot(x1 - x0, z1 - z0), ry = Math.atan2(-(z1 - z0), x1 - x0);
  B.prop('fence_chainlink', (x0 + x1) / 2, o.y || 0, (z0 + z1) / 2, { ry, len: L, variant: o.plain ? 'plain' : 'barbed', h: o.h });
}

// ------------------------------------------------------------------------------------------------ flush
export function finish(B) {
  const S = cs(B), M = mats(B);
  for (const a of S.acc.values()) {
    if (!a.I.length) continue;
    const m = new BABYLON.Mesh('cs_' + a.key, B.scene), vd = new BABYLON.VertexData();
    vd.positions = new Float32Array(a.P); vd.normals = new Float32Array(a.N); vd.uvs = new Float32Array(a.U); vd.colors = new Float32Array(a.C);
    vd.indices = a.P.length / 3 > 65535 ? new Uint32Array(a.I) : new Uint16Array(a.I);
    vd.applyToMesh(m, false);
    m.material = M[a.key];
    B.mesh(m, { collide: 'none', cast: false });
  }
  S.acc.clear();
  for (const [k, K] of S.kits) emitKit(B, K, 0, 0, 0, { collide: false, cast: !k.endsWith('_nc') }, 'cs_' + k.replace(/[^a-z0-9]/gi, '_'));
  S.kits.clear();
}

// ------------------------------------------------------------------------------------------------ out of bounds (no colliders)

export function pylon(B, x, z, h = 30, ry = 0, span = 0) {
  const K = kit(B, x, z), b = 3, t = .8;
  K.push(x, 0, z, ry);
  for (let i = 0; i < h; i += 3) { const k0 = b - (b - t) * Math.min(1, i / (h * .7)), k1 = b - (b - t) * Math.min(1, (i + 3) / (h * .7));
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) K.tube(STL, [[sx * k0, i, sz * k0], [sx * k1, i + 3, sz * k1]], .08, { seg: 4 });
    K.tube(STL, [[-k0, i, -k0], [k1, i + 3, -k1]], .04, { seg: 4 }); K.tube(STL, [[-k0, i, k0], [k1, i + 3, k1]], .04, { seg: 4 }); }
  for (const y of [h * .72, h * .86, h]) { K.box(STL, 0, y, 0, .3, .3, 12); for (const s of [-1, 1]) K.cyl('p_porcelain', 0, y - 1.4, s * 5.6, .12, 1.4, { seg: 6 }); }
  if (span) for (const y of [h * .72, h * .86, h]) for (const s of [-1, 1]) {
    const pts = []; for (let k = 0; k <= 8; k++) { const u = k / 8; pts.push([span * u, y - 1.4 - Math.sin(u * Math.PI) * span * .035, s * 5.6]); }
    K.tube(DK, pts, .025, { seg: 3 });
  }
  K.pop();
}
/** flame cards at the tip of a far stack */

/** one merged heightfield mesh (no collider, one draw call) for scenery ground outside the play area */
export function farGround(B, x0, x1, z0, z1, res, mat, hf) {
  const nx = Math.round((x1 - x0) / res), nz = Math.round((z1 - z0) / res), W = nx + 1, P = [], N = [], I = [];
  const h = (i, j) => hf(x0 + i * res, z0 + j * res);
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
    const gx = (h(i + 1, j) - h(i - 1, j)) / (2 * res), gz = (h(i, j + 1) - h(i, j - 1)) / (2 * res), l = Math.hypot(gx, 1, gz);
    P.push(x0 + i * res, h(i, j), z0 + j * res); N.push(-gx / l, 1 / l, -gz / l);
  }
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const a = j * W + i, b = a + 1, c = a + W, d = c + 1; I.push(a, b, c, b, d, c); }
  const m = new BABYLON.Mesh('cs_ground_' + mat, B.scene), vd = new BABYLON.VertexData();
  vd.positions = new Float32Array(P); vd.normals = new Float32Array(N); vd.indices = P.length / 3 > 65535 ? new Uint32Array(I) : new Uint16Array(I);
  vd.applyToMesh(m, false);
  B.mesh(m, { mat, collide: 'none', cast: false });
}
/** skirting + optional dado rail along a wall face from (x0, z0) to (x1, z1) at floor y; gaps [[a, b]] in metres along the line */
export function skirt(B, x0, z0, x1, z1, y, o = {}) {
  const L = Math.hypot(x1 - x0, z1 - z0), ux = (x1 - x0) / L, uz = (z1 - z0) / L, ry = Math.atan2(-uz, ux), K = kit(B, (x0 + x1) / 2, (z0 + z1) / 2, true);
  const segs = []; let a = 0;
  for (const [g0, g1] of (o.gaps || []).slice().sort((p, q) => p[0] - q[0])) { if (g0 > a) segs.push([a, g0]); a = Math.max(a, g1); }
  if (a < L) segs.push([a, L]);
  for (const [s0, s1] of segs) {
    const m = (s0 + s1) / 2, cx = x0 + ux * m, cz = z0 + uz * m;
    K.box(o.mat || 'wood_dark', cx, y, cz, s1 - s0, o.h || .1, .025, { ry });
    if (o.dado) K.box(o.dado, cx, y + (o.dy || 1.0), cz, s1 - s0, .06, .03, { ry });
  }
}

// ================================================================================================ construction prefabs
const GALV = 'p_galv', YB = 'p_coat_yellow', TIMBER = 'p_wood_light', PLY = 'plywood';
const kitCache = new WeakMap();
function cachedKit(B, key, build) {
  let m = kitCache.get(B); if (!m) { m = new Map(); kitCache.set(B, m); }
  let K = m.get(key); if (!K) { K = new Kit(7); build(K); m.set(key, K); }
  return K;
}
/** placement helper: local frame along a line (x0, z0) -> (x1, z1); returns { L, ry, cx, cz, ux, uz } */
function line(x0, z0, x1, z1) { const L = Math.hypot(x1 - x0, z1 - z0), ux = (x1 - x0) / L, uz = (z1 - z0) / L; return { L, ux, uz, ry: Math.atan2(-uz, ux), cx: (x0 + x1) / 2, cz: (z0 + z1) / 2 }; }

/** adjustable steel props (acrow) under a slab soffit: grid over the rect, y0 floor top, y1 soffit; thin instances + thin colliders;
    timber bearers under the soffit along x. o.sp spacing (1.5), o.skip(x, z) -> true leaves a gap */
export function shoring(B, x0, z0, x1, z1, y0, y1, o = {}) {
  const h = +(y1 - y0 - .2).toFixed(2), sp = o.sp || 1.5, key = 'cs_acrow_' + h;
  const K = cachedKit(B, key, K => {
    K.box('p_coat_red', 0, 0, 0, .15, .01, .15); K.cyl('p_coat_red', 0, 0, 0, .03, h * .62, { seg: 7 });
    K.cyl(GALV, 0, h * .62 - .1, 0, .024, h * .38 + .1, { seg: 7 }); K.cyl('p_coat_red', 0, h * .6, 0, .045, .06, { seg: 8 });
    K.box('p_coat_red', 0, h - .01, 0, .15, .01, .15); K.cylX(GALV, -.12, .12, h * .64, 0, .008);
    K.col(0, 0, 0, .1, h, .1, { surf: 'metal' });
  });
  const nx = Math.max(1, Math.round((x1 - x0) / sp)), nz = Math.max(1, Math.round((z1 - z0) / sp));
  for (let j = 0; j <= nz; j++) {
    const z = z0 + (z1 - z0) * j / nz; let any = false;
    for (let i = 0; i <= nx; i++) { const x = x0 + (x1 - x0) * i / nx; if (o.skip && o.skip(x, z)) continue; any = true; emitKit(B, K, x, y0, z, { inst: true, cast: false }, key); }
    if (any) kit(B, (x0 + x1) / 2, z, true).box('p_wood_pallet', (x0 + x1) / 2, y1 - .2, z, x1 - x0 + .3, .2, .08);
  }
}

/** façade scaffold along a line, outward to the RIGHT of (x0, z0) -> (x1, z1) (o.out = -1: to the left).
    o.lifts: heights of the board lifts; o.walk: lifts that get walkable colliders; o.top: standard height; o.net: debris netting on the face */
export function scaffold(B, x0, z0, x1, z1, o = {}) {
  const Ln = line(x0, z0, x1, z1), out = o.out || 1, K = kit(B, Ln.cx, Ln.cz, true), lifts = o.lifts || [2, 4, 6], top = o.top || (lifts[lifts.length - 1] + 1.1);
  const zi = .3 * out, zo = 1.55 * out, n = Math.max(1, Math.round(Ln.L / 2.5));
  K.push(Ln.cx, o.y || 0, Ln.cz, Ln.ry);
  const xs = []; for (let i = 0; i <= n; i++) xs.push(-Ln.L / 2 + Ln.L * i / n);
  for (const x of xs) for (const z of [zi, zo]) { K.cyl(GALV, x, 0, z, .024, top, { seg: 6 }); K.box('steel_dark', x, 0, z, .15, .02, .15); K.box(TIMBER, x, 0, z, .22, .04, .5, { ry: 0 }); }
  const ledg = []; for (let y = 2; y <= top - .5; y += 2) ledg.push(y);
  for (const y of new Set([...ledg, ...lifts])) {
    for (const z of [zi, zo]) K.cylX(GALV, -Ln.L / 2 - .1, Ln.L / 2 + .1, y, z, .024, { seg: 6 });
    for (const x of xs) K.cylZ(GALV, Math.min(zi, zo) - .15, Math.max(zi, zo) + .15, x, y + .05, .024, { seg: 6 });
  }
  for (const y of lifts) {
    for (let k = 0; k < 5; k++) K.box(TIMBER, 0, y + .1, zi + (zo - zi) * (k + .5) / 5, Ln.L, .05, .22);
    K.box(YB, 0, y + .15, zo + .03 * out, Ln.L, .15, .02);           // toe board
    for (const gy of [.55, 1.0]) K.cylX(GALV, -Ln.L / 2, Ln.L / 2, y + gy + .15, zo + .03 * out, .024, { seg: 6 });
    if (o.walk && o.walk.includes(y)) {
      B.box(Ln.cx + Math.sin(Ln.ry) * (zi + zo) / 2, (o.y || 0) + y + .1, Ln.cz + Math.cos(Ln.ry) * (zi + zo) / 2, Ln.L, .05, Math.abs(zo - zi) + .3, { ry: Ln.ry, visible: false, surf: 'wood' });
      B.box(Ln.cx + Math.sin(Ln.ry) * (zo + .08 * out), (o.y || 0) + y + .15, Ln.cz + Math.cos(Ln.ry) * (zo + .08 * out), Ln.L, 1.1, .08, { ry: Ln.ry, visible: false, ray: false, surf: 'metal' });
    }
  }
  // face bracing (zig-zag on the outer row)
  for (let i = 0; i < n; i++) { const a = xs[i], b = xs[i + 1], up = i % 2; K.tube(GALV, [[a, up ? top - .3 : .3, zo + .05 * out], [b, up ? .3 : top - .3, zo + .05 * out]], .022, { seg: 5 }); }
  if (o.net) { K.box('p_tarp_blue', 0, o.net[0], zo + .1 * out, Ln.L, o.net[1] - o.net[0], .01); K.noCast('p_tarp_blue'); }
  K.pop();
  if (o.cols !== false) for (const x of xs) for (const z of [zi, zo]) {
    const wx = Ln.cx + Ln.ux * x + Math.sin(Ln.ry) * z, wz = Ln.cz + Ln.uz * x + Math.cos(Ln.ry) * z;
    B.collider({ cx: wx, cy: (o.y || 0) + top / 2, cz: wz, hx: .05, hy: top / 2, hz: .05, surf: 'metal' });
  }
}

/** scaffold stair tower: footprint centre (x, z), 2.6 wide (x) x 7.2 long (z); switchback flights between consecutive levels.
    Arrival landings at the SOUTH end (z - 3.6 .. z - 2.4); o.open = [{ level, side: 'w'|'e'|'s' }] sides left open at that
    landing (the rest gets a guard). Flight 1 climbs north on the west half, flight 2 south on the east half. */
export function stairTower(B, x, z, levels, o = {}) {
  const w = 2.6, d = 7.2, x0 = x - w / 2, x1 = x + w / 2, z0 = z - d / 2, z1 = z + d / 2, K = kit(B, x, z, true);
  const open = o.open || [];
  const isOpen = (lv, side) => open.some(p => p.level === lv && p.side === side);
  for (let i = 0; i + 1 < levels.length; i++) {
    const ya = levels[i], yb = levels[i + 1], m = (ya + yb) / 2;
    stair(B, { x: x - .66, z, w: 1.1, len: d - 2.4, y0: ya, y1: m, dir: '+z', rails: 'left' });
    stair(B, { x: x + .66, z, w: 1.1, len: d - 2.4, y0: m, y1: yb, dir: '-z', rails: 'right' });
    deck(B, x0, z1 - 1.2, x1, z1, m, { beam: true });
    deck(B, x0, z0, x1, z0 + 1.2, yb, { beam: true });
    // separation guard between the flights (movement only)
    B.box(x, ya, z, .08, yb - ya + 1.1, d - 2.4, { visible: false, ray: false, surf: 'metal' });
    K.box(GALV, x, m + 1.0, z, .05, .05, d - 2.4); K.box(GALV, x, yb + 1.0, z - d / 2 + 1.2, .05, .05, .05);
    // guards at the landings
    railing(B, x0, z1, x1, z1, m); railing(B, x0, z1 - 1.2, x0, z1, m); railing(B, x1, z1 - 1.2, x1, z1, m);
    if (!isOpen(i + 1, 's')) railing(B, x0, z0, x1, z0, yb);
    if (!isOpen(i + 1, 'w')) railing(B, x0, z0, x0, z0 + 1.2, yb);
    if (!isOpen(i + 1, 'e')) railing(B, x1, z0, x1, z0 + 1.2, yb);
  }
  // tower frame: standards, ledgers every 2 m, boarded sides to 1.1 m above each landing
  const top = levels[levels.length - 1] + 2.2;
  for (const [sx, sz] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1], [x0, z], [x1, z]]) { K.cyl(GALV, sx, 0, sz, .024, top, { seg: 6 }); B.collider({ cx: sx, cy: top / 2, cz: sz, hx: .05, hy: top / 2, hz: .05, surf: 'metal' }); }
  for (let y = 2; y < top; y += 2) { K.cylX(GALV, x0 - .1, x1 + .1, y, z0, .024, { seg: 6 }); K.cylX(GALV, x0 - .1, x1 + .1, y, z1, .024, { seg: 6 }); K.cylZ(GALV, z0 - .1, z1 + .1, x0, y, .024, { seg: 6 }); K.cylZ(GALV, z0 - .1, z1 + .1, x1, y, .024, { seg: 6 }); }
  // outer side (o.outer 'e' default | 'w'): guard over the whole height; inner side: guarded per storey except at open landings
  const outer = o.outer || 'e', xo = outer === 'e' ? x1 + .02 : x0 - .02, xi = outer === 'e' ? x0 - .02 : x1 + .02, inner = outer === 'e' ? 'w' : 'e';
  B.box(xo, levels[0], z, .06, top - levels[0], d, { visible: false, ray: false, surf: 'metal' });
  const y0 = levels[0];
  B.box(xi, y0, z + .6, .06, top - y0, d - 1.2, { visible: false, ray: false, surf: 'metal' });
  // south strip (arrival landings): solid except a 2.3 m window at each landing open on the inner side
  let yc = y0;
  for (let lv = 1; lv < levels.length; lv++) if (isOpen(lv, inner)) {
    if (levels[lv] - yc > .05) B.box(xi, yc, z0 + .6, .06, levels[lv] - yc, 1.2, { visible: false, ray: false, surf: 'metal' });
    yc = levels[lv] + 2.3;
  }
  if (top - yc > .05) B.box(xi, yc, z0 + .6, .06, top - yc, 1.2, { visible: false, ray: false, surf: 'metal' });
}

/** yellow mesh edge-protection barrier along a slab edge at floor y (movement-only collider) */
export function edgeGuard(B, x0, z0, x1, z1, y, o = {}) {
  const Ln = line(x0, z0, x1, z1); if (Ln.L < .3) return;
  const K = kit(B, Ln.cx, Ln.cz, true), n = Math.max(1, Math.round(Ln.L / 2.6)), pw = Ln.L / n;
  K.push(Ln.cx, y, Ln.cz, Ln.ry);
  for (let i = 0; i < n; i++) {
    const cx = -Ln.L / 2 + pw * (i + .5);
    K.box('grate', cx, .1, 0, pw - .08, 1.1, .02);
    K.box(YB, cx, 1.18, 0, pw - .04, .04, .04); K.box(YB, cx, .08, 0, pw - .04, .04, .04);
    K.box(YB, cx - pw / 2 + .03, .08, 0, .04, 1.14, .04); K.box(YB, cx + pw / 2 - .03, .08, 0, .04, 1.14, .04);
  }
  for (let i = 0; i <= n; i++) { const px = -Ln.L / 2 + pw * i; K.box('steel_dark', px, 0, 0, .06, 1.25, .06); K.box('steel_dark', px, 0, -.12, .12, .02, .3); }
  K.pop();
  if (o.collide !== false) B.box(Ln.cx, y, Ln.cz, Ln.L, 1.25, .1, { ry: Ln.ry, visible: false, ray: false, surf: 'metal' });
}

/** plywood site hoarding (2.44 m) from (x0, z0) to (x1, z1); paint = the face on the RIGHT (outside), ply on the left (inside) */
export function hoarding(B, x0, z0, x1, z1, o = {}) {
  const Ln = line(x0, z0, x1, z1), h = o.h || 2.44;
  B.wall(x0, z0, x1, z1, { h, t: .04, mat: o.inside || PLY, mat2: o.paint || 'p_paint_darkgrey', matEnd: 'wood_planks', openings: o.openings });
  const K = kit(B, Ln.cx, Ln.cz, true), n = Math.max(1, Math.round(Ln.L / 2.44)), side = o.postSide || -1;
  K.push(Ln.cx, 0, Ln.cz, Ln.ry);
  const gaps = (o.openings || []).map(p => [p.at - Ln.L / 2 - (p.w || 1.2) / 2 - .1, p.at - Ln.L / 2 + (p.w || 1.2) / 2 + .1]);
  for (let i = 0; i <= n; i++) {
    const px = -Ln.L / 2 + Ln.L * i / n; if (gaps.some(g => px > g[0] && px < g[1])) continue;
    K.box('wood_planks', px, 0, side * .07, .1, h + .05, .1);
    if (i % 2 === 0 && !o.noBrace) { K.tube('wood_planks', [[px, h * .7, side * .1], [px, .05, side * 1.3]], .04, { seg: 4 }); K.box('p_concrete_precast', px, 0, side * 1.35, .4, .25, .4); }
  }
  for (const y of [.3, h - .4]) K.box('wood_planks', 0, y, side * .045, Ln.L, .1, .05);
  K.pop();
}

/** festoon string with warm bulbs between points [[x, y, z]...] (sags .25 m per span) */
export function festoon(B, pts, o = {}) {
  const K = kit(B, pts[0][0], pts[0][2], true), sp = o.sp || 1.2;
  for (let i = 0; i + 1 < pts.length; i++) {
    const [a, b] = [pts[i], pts[i + 1]], L = Math.hypot(b[0] - a[0], b[2] - a[2]), n = Math.max(2, Math.round(L / sp)), path = [];
    for (let k = 0; k <= n; k++) { const u = k / n; path.push([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u - Math.sin(u * Math.PI) * (o.sag || .25), a[2] + (b[2] - a[2]) * u]); }
    K.tube('steel_dark', path, .008, { seg: 3 });
    for (let k = 1; k < n; k++) { const p = path[k]; K.box('steel_dark', p[0], p[1] - .08, p[2], .03, .08, .03); K.box(o.off ? 'p_lens_clear' : 'emissive_warm', p[0], p[1] - .17, p[2], .06, .09, .06); }
  }
  K.noCast('emissive_warm');
}

/** LED work flood on a tripod at floor y, aimed along yaw ry */
export function workLight(B, x, y, z, ry, o = {}) {
  const K = kit(B, x, z, true), h = o.h || 1.9;
  K.push(x, y, z, ry);
  for (let i = 0; i < 3; i++) { const a = i * TAU / 3; K.tube('p_coat_yellow', [[Math.sin(a) * .55, 0, Math.cos(a) * .55], [0, h * .45, 0]], .015, { seg: 4 }); }
  K.cyl('p_coat_yellow', 0, h * .45, 0, .02, h * .55, { seg: 6 });
  K.box('p_coat_yellow', 0, h - .05, 0, .5, .05, .05);
  for (const s of [-1, 1]) { K.push(s * .14, h, .05, 0, -.35); K.box('p_plastic_dark', 0, 0, 0, .26, .2, .08); K.box('emissive_white', 0, .02, .045, .22, .16, .01); K.pop(); }
  K.pop(); K.noCast('emissive_white');
  B.collider({ cx: x, cy: y + h / 2, cz: z, hx: .2, hy: h / 2, hz: .2, surf: 'metal', ray: false });
}

/** portable toilet cabin (1.15 x 2.3 x 1.2), door +z; collider; color = plastic material */
export function portaloo(B, x, z, ry, mat = 'p_plastic_blue') {
  const K = kit(B, x, z);
  K.push(x, 0, z, ry);
  K.box('p_plastic_grey', 0, 0, 0, 1.18, .12, 1.22);
  K.box(mat, 0, .12, 0, 1.12, 2.08, 1.16, { bev: .03 });
  K.box(mat, 0, 2.2, 0, 1.18, .14, 1.22, { bev: .05 });
  K.box('p_plastic_milky', 0, 2.33, 0, .9, .06, .95, { bev: .03 });
  K.box('p_plastic_grey', 0, .25, .585, .82, 1.85, .03);
  K.box('p_plastic_dark', .3, 1.1, .61, .1, .06, .04); K.box('p_coat_red', -.25, 1.15, .605, .16, .05, .02);
  for (let k = 0; k < 6; k++) K.box(mat, -.45 + k * .18, 1.0, .59, .04, 1.0, .02);
  K.pop();
  B.box(x, 0, z, 1.18, 2.36, 1.22, { ry, visible: false, surf: 'rubber' });
}

/** open steel skip (builder's skip, 1.8 x 1.5 x 3.6) with rubble; collider (top 1.5) */
export function skip(B, x, z, ry, o = {}) {
  const K = kit(B, x, z), m = o.mat || 'p_coat_yellow', L = 3.6, W = 1.8, H = 1.45;
  K.push(x, 0, z, ry);
  K.pop();
  K.push(x, 0, z, ry + Math.PI / 2);
  for (const s of [-1, 1]) { K.push(0, .2, s * (L / 2 - .32), s > 0 ? -.45 : .45); K.box(m, 0, 0, 0, W, 1.4, .06); K.pop(); }
  K.box('steel_dark', 0, 0, 0, W - .2, .2, L - 1.4);
  for (const s of [-1, 1]) K.box(m, 0, H - .06, s * (L / 2 - .02), W + .02, .08, .08);
  if (o.fill !== false) { K.blob('p_rock', 0, .6, 0, .75, .5, 1.2, { seg: 8, noise: .3, seed: (x * 13 + z) | 0, flat: .4 }); K.blob('p_wood_pallet', .3, 1.0, -.4, .5, .12, .9, { seg: 6, noise: .4, seed: 3 }); }
  K.pop();
  B.box(x, 0, z, W, H, L, { ry, visible: false, surf: 'metal' });
}

/** tracked excavator (body + cab + boom) facing +z rotated ry; collider box */
export function excavator(B, x, z, ry, o = {}) {
  const K = kit(B, x, z), Y = 'p_coat_yellow';
  K.push(x, 0, z, ry);
  for (const s of [-1, 1]) { K.box('p_plastic_dark', s * 1.15, 0, 0, .6, .8, 3.8, { bev: .25 }); K.box('steel_dark', s * 1.15, .2, 0, .64, .4, 3.0); }
  K.box('steel_dark', 0, .55, 0, 1.6, .4, 2.0);
  K.push(0, .95, 0, o.slew || 0);
  K.box(Y, 0, 0, 0, 2.4, 1.0, 3.0, { bev: .05 }); K.box('steel_dark', 0, 0, -1.55, 2.3, .9, .3, { bev: .08 });
  K.box(Y, -.62, 1.0, .55, 1.0, 1.55, 1.3, { bev: .04 }); K.box('p_glass_dark', -.62, 1.15, .55, 1.02, 1.2, 1.25); K.noCast('p_glass_dark');
  K.box('steel_dark', .55, 1.0, -.8, .8, .3, 1.2);
  K.tube(Y, [[.3, .8, 1.3], [.3, 3.0, 3.3], [.3, 2.4, 5.4]], .22, { seg: 6 });
  K.tube(Y, [[.3, 2.4, 5.4], [.3, .4, 5.9]], .15, { seg: 6 });
  K.box('steel_dark', .3, 0, 5.6, .9, .6, .7, { bev: .05 });
  K.pop(); K.pop();
  B.box(x, 0, z, 2.6, 2.2, 4.0, { ry, visible: false, surf: 'metal' });
  const bx = x + Math.sin(ry) * 5.2, bz = z + Math.cos(ry) * 5.2;
  B.box(bx, 0, bz, 1, .9, 1.4, { ry, visible: false, surf: 'metal' });
}

/** concrete truck mixer (nose +z) with a tilted drum; collider */
export function mixerTruck(B, x, z, ry, o = {}) {
  const K = kit(B, x, z);
  K.push(x, 0, z, ry);
  K.box('steel_dark', 0, .55, -.6, 1.0, .35, 7.0);
  for (const zz of [2.6, -1.4, -2.9]) for (const s of [-1, 1]) K.cylX('p_plastic_dark', s * 1.25 - .17, s * 1.25 + .17, .52, zz, .52, { seg: 14 });
  K.box(o.cab || 'p_coat_white', 0, .9, 2.55, 2.45, 2.0, 1.9, { bev: .1 }); K.box('p_glass_dark', 0, 1.95, 3.48, 2.2, .85, .04); K.noCast('p_glass_dark');
  K.box('steel_dark', 0, .7, 3.5, 2.5, .3, .1);
  K.push(0, 1.55, -1.3, 0, -.22);
  K.lathe(o.drum || 'p_coat_red', [[.3, -2.9], [1.05, -2.0], [1.22, -.6], [1.1, .9], [.55, 2.1], [.4, 2.2]], { seg: 20 });
  K.pop();
  K.box('steel_dark', 0, 1.3, -4.4, .8, 1.4, .5);
  K.tube('p_galv', [[0, 2.3, -4.2], [0, 1.8, -5.2], [0, 1.0, -5.6]], .12, { seg: 8 });
  K.pop();
  B.box(x, 0, z, 2.55, 3.4, 8.2, { ry, visible: false, surf: 'metal' });
}

/** tower crane: footing, lattice mast to h, slewing ring, cab, jib along yaw jry (len jl), counter-jib with blocks, apex + ties.
    Collider = footing + mast only. */
export function towerCrane(B, x, z, h, jry, o = {}) {
  const Kb = kit(B, x, z), Y = 'p_coat_yellow', a = 1.0, jl = o.jib || 50, cj = o.cjib || 15;
  Kb.box('p_concrete_precast', x, 0, z, 7, .9, 7); B.box(x, 0, z, 7, .9, 7, { visible: false, surf: 'concrete' });
  Kb.box('p_coat_red', x, .9, z, 2.6, .25, 2.6);
  B.box(x, .9, z, 2.1, h - .9, 2.1, { visible: false, surf: 'metal' });
  // mast (lattice) in sections, kit per cell (it is tall; same cell)
  for (let y = 1.15; y < h; y += 2.4) {
    const y1 = Math.min(h, y + 2.4);
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) Kb.box(Y, x + sx * a - .06, y, z + sz * a - .06, .12, y1 - y, .12);
    for (const [p, q] of [[[-1, -1], [1, -1]], [[1, -1], [1, 1]], [[1, 1], [-1, 1]], [[-1, 1], [-1, -1]]]) {
      Kb.tube(Y, [[x + p[0] * a, y, z + p[1] * a], [x + q[0] * a, y1, z + q[1] * a]], .035, { seg: 4 });
      Kb.tube(Y, [[x + p[0] * a, y1, z + p[1] * a], [x + q[0] * a, y1, z + q[1] * a]], .03, { seg: 4 });
    }
  }
  // ladder inside the mast
  Kb.box('steel_dark', x - .3, 1.15, z + .7, .04, h - 1.2, .04); Kb.box('steel_dark', x + .1, 1.15, z + .7, .04, h - 1.2, .04);
  const K = kit(B, x, z);
  K.push(x, h, z, jry);
  K.lathe('steel_dark', [[1.3, 0], [1.3, .6], [1.1, .8]], { seg: 16 });
  K.box(Y, 0, .8, 0, 2.4, 1.2, 2.4);
  K.box('p_coat_white', 1.6, .2, 1.3, 1.4, 1.9, 1.6, { bev: .05 }); K.box('p_glass_dark', 1.6, .6, 2.1, 1.3, 1.3, .04); K.noCast('p_glass_dark');
  // apex (A-frame)
  for (const s of [-1, 1]) for (const t of [-1, 1]) K.tube(Y, [[s * 1.0, 2.0, t * 1.0], [0, 8.5, 0]], .08, { seg: 5 });
  // jib (triangular lattice along +z local), counter jib along -z
  const tri = (z0, z1, ht) => {
    const n = Math.max(1, Math.round((z1 - z0) / 2.4)), st = (z1 - z0) / n;
    for (const s of [-1, 1]) K.tube(Y, [[s * .8, 2.0, z0], [s * .8, 2.0, z1]], .07, { seg: 5 });
    K.tube(Y, [[0, 2.0 + ht, z0], [0, 2.0 + ht * .85, z1]], .07, { seg: 5 });
    for (let i = 0; i < n; i++) {
      const za = z0 + i * st, zb = za + st, hh = ht * (1 - .15 * (i + .5) / n);
      for (const s of [-1, 1]) K.tube(Y, [[s * .8, 2.0, za], [0, 2.0 + hh, (za + zb) / 2], [s * .8, 2.0, zb]], .035, { seg: 4 });
      K.tube(Y, [[-.8, 2.0, zb], [.8, 2.0, zb]], .03, { seg: 4 });
    }
  };
  tri(1.2, jl, 1.6); tri(-cj, -1.2, .9);
  K.box('grate', 0, 1.95, -cj / 2, 2.2, .06, cj - 2); K.noCast('grate');
  for (let i = 0; i < 4; i++) K.box('p_concrete_precast', 0, 0, -cj + 1 + i * .95, 2.2, 2.0, .9);
  // ties from the apex
  K.tube('steel_dark', [[0, 8.5, 0], [0, 3.6, jl * .55]], .03, { seg: 4 }); K.tube('steel_dark', [[0, 8.5, 0], [0, 3.6, jl * .95]], .03, { seg: 4 });
  K.tube('steel_dark', [[0, 8.5, 0], [0, 2.9, -cj + .5]], .03, { seg: 4 });
  // trolley + hook block
  const tz = o.trolley || jl * .5, hookY = o.hookY != null ? o.hookY - h : -h * .45;
  K.box('steel_dark', 0, 1.6, tz, 1.4, .35, 1.4);
  K.tube('steel_dark', [[-.15, 1.6, tz], [-.15, hookY + .8, tz]], .012, { seg: 3 }); K.tube('steel_dark', [[.15, 1.6, tz], [.15, hookY + .8, tz]], .012, { seg: 3 });
  K.box('p_coat_red', 0, hookY + .2, tz, .5, .6, .3); K.box(Y, 0, hookY, tz, .1, .25, .1);
  // logo plates on the counter jib
  K.pop();
  const s = Math.sin(jry), c = Math.cos(jry);
  decal(B, 'sign', 'builder', x - s * (cj * .55) + c * 1.12, h + 2.6, z - c * (cj * .55) - s * 1.12, 4.6, .42, { face: 'e', ry: jry });
}

/** one building outside the site (no collider): o.style 'brick' | 'office' | 'concrete' | 'glass' | 'old', o.floor (3.2), o.ry.
    The facades face +-x / +-z of the box; window grid by style. */
export function cityBuilding(B, x, z, w, d, h, o = {}) {
  const K = kit(B, x, z, true), st = o.style || 'concrete', fl = o.floor || 3.2, ry = o.ry || 0;
  const wallM = { brick: 'brick', old: 'brick_red', office: 'concrete_panels', concrete: 'p_concrete_precast', glass: 'steel_dark', render: 'plaster' }[st] || 'concrete';
  K.push(x, 0, z, ry);
  K.box(wallM, 0, 0, 0, w, h, d);
  const nF = Math.floor((h - 1) / fl);
  const faces = [[0, w, d / 2, 0], [0, w, -d / 2, Math.PI], [w / 2, d, 0, Math.PI / 2], [-w / 2, d, 0, -Math.PI / 2]];
  for (const [fx, len, fz, fr] of faces) {
    K.push(fx, 0, fz, fr);
    if (st === 'glass') {
      K.box('p_screen', 0, 1.0, .01, len - .6, h - 1.4, .04);
      for (let y = 1 + fl; y < h - .5; y += fl) K.box('steel_dark', 0, y, .05, len - .5, .25, .05);
      for (let xx = -len / 2 + 1.5; xx < len / 2; xx += 1.5) K.box('steel_dark', xx, 1, .05, .06, h - 1.4, .05);
    } else if (st === 'office' || st === 'concrete') {
      for (let f = 0; f < nF; f++) { const y = 1.1 + f * fl; K.box('p_screen', 0, y, .01, len - 1.2, fl * .55, .04); if (st === 'office') for (let xx = -len / 2 + 1.8; xx < len / 2 - .8; xx += 1.8) K.box('p_alu', xx, y, .04, .07, fl * .55, .05); }
      K.box('p_screen', 0, .2, .01, len - 1.2, 3.0, .04);
    } else {
      const nw = Math.max(1, Math.floor(len / 3.2)), sp = len / nw;
      for (let f = 0; f < nF; f++) for (let i = 0; i < nw; i++) {
        const wx = -len / 2 + sp * (i + .5), y = 1.0 + f * fl + .7;
        K.box('p_screen', wx, y, .01, 1.3, 1.6, .04); K.box('p_concrete_precast', wx, y - .1, .06, 1.5, .1, .1);
        if (st === 'old') K.box('p_concrete_precast', wx, y + 1.6, .03, 1.5, .18, .06);
      }
      if (o.shops) { K.box('p_screen', 0, .3, .01, len - 1, 2.8, .04); K.box(o.shops, 0, 3.1, .08, len - .4, .7, .12); }
    }
    K.pop();
  }
  // parapet + roof clutter
  K.box(wallM, 0, h, d / 2 - .15, w, .9, .3); K.box(wallM, 0, h, -d / 2 + .15, w, .9, .3);
  K.box(wallM, w / 2 - .15, h, 0, .3, .9, d); K.box(wallM, -w / 2 + .15, h, 0, .3, .9, d);
  K.box('concrete_dark', 0, h, 0, w - .6, .05, d - .6);
  const r = rng((x * 31 + z * 7) | 0);
  if (h > 12) { K.box('p_paint_grey', (r() - .5) * w * .4, h, (r() - .5) * d * .4, 3.2, 2.2, 2.4); K.box('concrete_dark', (r() - .5) * w * .3, h, (r() - .5) * d * .3, 2.6, 3.4, 2.6); }
  if (o.tank) { K.cyl('wood_dark', w * .2, h + 2.2, d * .2, 1.4, 2.6, { seg: 14 }); for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) K.box('steel_dark', w * .2 + a, h, d * .2 + b, .1, 2.2, .1); }
  K.pop();
}

/** precast concrete pipes lying along x (n in a row) */
export function concretePipes(B, x, z, ry, n = 3, r = .55) {
  const K = kit(B, x, z);
  K.push(x, 0, z, ry);
  for (let i = 0; i < n; i++) { const zz = (i - (n - 1) / 2) * (2 * r + .15); K.push(0, r, zz, 0, 0, Math.PI / 2); K.lathe('p_concrete_precast', [[r, -1.2], [r, 1.2], [r - .09, 1.2], [r - .09, -1.2]], { seg: 16, caps: false }); K.pop(); }
  K.box('p_wood_sleeper', 0, 0, 0, .15, .1, n * (2 * r + .15));
  K.pop();
  B.box(x, 0, z, 2.4, 2 * r, n * (2 * r + .15), { ry, visible: false, surf: 'concrete' });
}

/** stack of timber formwork / plywood sheets (2.44 x 1.22) on bearers, h tall */
export function plyStack(B, x, z, ry, h = .6, o = {}) {
  const K = kit(B, x, z);
  K.push(x, 0, z, ry);
  K.box('p_wood_pallet', 0, 0, -.45, 2.4, .1, .1); K.box('p_wood_pallet', 0, 0, .45, 2.4, .1, .1);
  K.box(o.mat || 'plywood', 0, .1, 0, 2.44, h, 1.22, { mats: { t: o.top || 'plywood' } });
  if (o.beams) for (let i = 0; i < 6; i++) K.box('p_coat_yellow', 0, .1 + h + i * .08, -.5 + (i % 3) * .5, 2.9, .08, .08);
  K.pop();
  B.box(x, 0, z, 2.44, h + .1 + (o.beams ? .48 : 0), 1.22, { ry, visible: false, surf: 'wood' });
}

/** stacked H20 timber beams (yellow) */
export function beamStack(B, x, z, ry, layers = 4) {
  const K = kit(B, x, z);
  K.push(x, 0, z, ry);
  for (let l = 0; l < layers; l++) { K.box('p_wood_pallet', 0, l * .3, -.6, .1, .08, 1.4); for (let i = 0; i < 8; i++) K.box('p_coat_yellow', -.7 + i * .2, l * .3 + .08, 0, .08, .2, 3.9); }
  K.pop();
  B.box(x, 0, z, 1.7, layers * .3, 3.9, { ry, visible: false, surf: 'wood' });
}

/** mobile lighting tower (trailer + mast + 4 heads), off in daytime */
export function lightTower(B, x, z, ry) {
  const K = kit(B, x, z);
  K.push(x, 0, z, ry);
  K.box('p_coat_yellow', 0, .45, 0, 1.3, 1.1, 2.4, { bev: .05 }); for (const s of [-1, 1]) K.cylX('p_plastic_dark', s * .7 - .1, s * .7 + .1, .3, 0, .3, { seg: 10 });
  K.box('steel_dark', 0, .3, 1.5, .1, .1, 1.2); K.cyl(GALV, 0, 1.55, -.3, .07, 6.5, { seg: 8 });
  K.box('steel_dark', 0, 8.0, -.3, 1.4, .08, .1);
  for (const s of [-1, 1]) for (const t of [-1, 1]) { K.box('p_plastic_dark', s * .45, 8.1 + (t + 1) * .2, -.25, .4, .35, .12); K.box('p_lens_clear', s * .45, 8.13 + (t + 1) * .2, -.18, .34, .28, .01); }
  K.pop();
  B.box(x, 0, z, 1.4, 1.6, 2.5, { ry, visible: false, surf: 'metal' });
}
