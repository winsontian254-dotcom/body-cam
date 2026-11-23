/* LIVE FIRE — Black Creek Refinery kit: the map-specific prefabs and painters used by js/maps/defs/refinery.js (owned by that map).
   Exports (all take the MapBuilder B; WORLD coordinates, no B.push frame is expected):
     kit(B, x, z)                  world-space Kit for the 32 m cell of (x, z) (flushed by finish)
     decal(B, atlas, slot, x, y, z, w, h, o)   atlas quad: 'stain' (alpha blend), 'sign' (alpha test); o.face n|s|e|w|u, o.ry, o.col
     paint(B, x0, z0, x1, z1, o)   worn paint stripe on the ground (o: w, col, dash [on, off], y)
     pave(B, regions, deflt, rect, cell)   ground of non-overlapping quads: regions [[x0, z0, x1, z1, mat]] (first wins)
     railing(B, x0, z0, x1, z1, y, o)      handrail (posts, two rails, toe board) + a movement-only collider (bullets pass)
     stair(B, o)                   open steel stair { x, z, w, len, y0, y1, dir: '+x'|'-x'|'+z'|'-z', rails } + ramp collider
     deck(B, x0, z0, x1, z1, y, o) grated platform whose top is at y (edge beams, o.mat)
     hcol(B, x, z, y1, o)          steel H column from the ground (fireproofed to o.fp), collider
     column(B, x, z, r, h, o)      distillation column: skirt, insulated shell, bands, platforms, ladder, nozzles; cylinder collider
     pipe(B, path, r, mat, o)      a pipe run (rounded corners, flanges every o.fl metres)
     rack(B, x0, x1, z, o)         main pipe rack along x: bents, beams, struts, pipe bundles, fin-fan coolers on top
     exchanger(B, x, z, ry, o)     shell-and-tube exchanger on saddles (collider)
     pump(B, x, z, ry, o)          centrifugal pump + motor on a plinth (collider)
     vessel(B, x, z, ry, o)        horizontal drum on saddles (collider)
     heater(B, x0, z0, x1, z1, o)  fired heater box + stack (collider)
     tanker(B, x, z, ry, o)        road tanker: tractor prop + tank semi trailer (collider)
     flare(B, x, z, h)             flare stack in a lattice derrick with a burning tip (no collider; out of bounds)
     fence(B, x0, z0, x1, z1, o)   chain-link perimeter fence (prop) along a line
     finish(B)                     flushes the quads and kits (call at the end of build)
   Canvas atlases are drawn once per scene (original artwork, fictional names). */
import { Kit, emitKit } from './props/kit.js';

const TAU = Math.PI * 2, H = Math.PI / 2;
export function rng(seed) { let a = seed >>> 0 || 1; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export function rf(B) { if (!B._rf) B._rf = { acc: new Map(), kits: new Map(), seed: 1 }; return B._rf; }
const CELL = 32;
export function kit(B, x, z, nc) {
  const S = rf(B), k = Math.floor(x / CELL) + '_' + Math.floor(z / CELL) + (nc ? '_nc' : '');
  let K = S.kits.get(k); if (!K) { K = new Kit(S.seed++); S.kits.set(k, K); }
  return K;
}

// ------------------------------------------------------------------------------------------------ canvas atlases
const SCN = new WeakMap();
const ATL = 1024;
const STAIN = { oil0: [0, 0, 256, 256], oil1: [256, 0, 256, 256], oil2: [512, 0, 256, 256], drip: [768, 0, 256, 256], tyre: [0, 256, 512, 128],
  rust: [512, 256, 128, 256], water: [640, 256, 128, 256], grime: [768, 256, 256, 128], crack: [0, 384, 256, 256], patch: [256, 384, 256, 256],
  litter: [512, 512, 256, 256], dust: [768, 512, 256, 256], leaves: [0, 640, 256, 256], tyre2: [0, 896, 512, 128], soot: [768, 768, 256, 256],
  streak: [768, 384, 256, 128] };
const SIGN = { A: [0, 0, 256, 256], B: [256, 0, 256, 256], arrow: [512, 0, 128, 256], hatch: [640, 0, 256, 256], chev: [896, 0, 128, 256] };
const NAV = '#1d2a36', CRM = '#e9e6dc', YLW = '#f2c230';
const TEXTS = [
  ['brand', 'BLACK CREEK REFINERY', 'plate', '#1c2b22', '#e9e4d2'], ['scale', 'TRUCK SCALE 2 · STOP AT RED LIGHT', 'plate', CRM, NAV],
  ['load', 'PRODUCT LOADING RACK', 'plate', CRM, NAV], ['bay1', 'BAY 1', 'plate', NAV, YLW], ['bay2', 'BAY 2', 'plate', NAV, YLW], ['bay3', 'BAY 3', 'plate', NAV, YLW],
  ['tk101', 'TK-101  CRUDE OIL', 'paint', null, '#2a2f33'], ['tk102', 'TK-102  CRUDE OIL', 'paint', null, '#2a2f33'],
  ['tk103', 'TK-103  DIESEL', 'paint', null, '#2a2f33'], ['tk104', 'TK-104  NAPHTHA', 'paint', null, '#2a2f33'],
  ['cu100', 'CRUDE UNIT 100', 'plate', '#1c2b22', '#e9e4d2'], ['f110', 'F-110 CRUDE HEATER', 'plate', CRM, NAV],
  ['c101', 'C-101', 'paint', null, '#26292c'], ['c102', 'C-102', 'paint', null, '#26292c'],
  ['ctrl', 'CENTRAL CONTROL BUILDING', 'plate', CRM, NAV], ['maint', 'MAINTENANCE WORKSHOP', 'plate', CRM, NAV],
  ['sub', 'SUBSTATION 2 · DANGER 11 kV', 'plate', '#c9a227', '#141414'], ['nosmoke', 'NO SMOKING · NO NAKED FLAMES', 'plate', '#b32a1d', '#f5f2ea'],
  ['h2s', 'DANGER · H2S MAY BE PRESENT', 'plate', '#c9a227', '#141414'], ['permit', 'BUND AREA · ENTRY BY PERMIT ONLY', 'plate', '#b32a1d', '#f5f2ea'],
  ['muster', 'MUSTER POINT 3', 'plate', '#2b6b33', '#f5f2ea'], ['fire', 'FIRE WATER', 'paint', null, '#f5f2ea'],
  ['alley', 'PIPE ALLEY · NO PARKING', 'plate', CRM, NAV], ['speed', 'MAX 15', 'paint', null, '#ffffff'],
  ['stop', 'STOP', 'paint', null, '#ffffff'], ['keep', 'KEEP CLEAR', 'paint', null, '#ffffff'], ['pump', 'P-210 A/B', 'plate', CRM, NAV],
  ['shower', 'EMERGENCY SHOWER', 'plate', '#2b6b33', '#f5f2ea'], ['pumph', 'PRODUCT PUMP HOUSE', 'plate', CRM, NAV],
  ['hardhat', 'HARD HAT · H2S MONITOR · FR CLOTHING', 'plate', '#2b6b33', '#f5f2ea'], ['lane', 'TANKER LANE', 'paint', null, YLW],
  ['scaleN', 'SCALE IN', 'paint', null, '#ffffff'],
];
TEXTS.forEach((t, i) => { SIGN[t[0]] = [(i % 2) * 512, 256 + Math.floor(i / 2) * 48, 512, 46]; });

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
  g.clearRect(0, 0, ATL, ATL);
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
  const paint = new PBR('rf_paint', sc);
  paint.albedoTexture = tex(sc, 'rf_paint_tex', 512, 64, drawPaint, true); paint.useAlphaFromAlbedoTexture = true;
  paint.transparencyMode = PBR.PBRMATERIAL_ALPHATEST; paint.alphaCutOff = .45; paint.metallic = 0; paint.roughness = .62; paint.zOffset = -2;
  const stain = new PBR('rf_stain', sc);
  stain.albedoTexture = tex(sc, 'rf_stain_tex', ATL, ATL, drawStain); stain.useAlphaFromAlbedoTexture = true;
  stain.transparencyMode = PBR.PBRMATERIAL_ALPHABLEND; stain.disableDepthWrite = true; stain.metallic = 0; stain.roughness = .55; stain.zOffset = -3;
  const sign = new PBR('rf_sign', sc);
  sign.albedoTexture = tex(sc, 'rf_sign_tex', ATL, ATL, drawSign); sign.useAlphaFromAlbedoTexture = true;
  sign.transparencyMode = PBR.PBRMATERIAL_ALPHATEST; sign.alphaCutOff = .45; sign.metallic = 0; sign.roughness = .6; sign.zOffset = -2;
  const flame = new PBR('rf_flame', sc);
  const ft = tex(sc, 'rf_flame_tex', 128, 256, drawFlame);
  flame.albedoColor = new BABYLON.Color3(0, 0, 0); flame.emissiveTexture = ft; flame.emissiveColor = new BABYLON.Color3(1, 1, 1); flame.emissiveIntensity = 3;
  flame.opacityTexture = ft; flame.disableLighting = true; flame.environmentIntensity = 0; flame.backFaceCulling = false;
  flame.transparencyMode = PBR.PBRMATERIAL_ALPHABLEND; flame.disableDepthWrite = true;
  for (const m of [paint, stain, sign, flame]) m.metadata = { lf: m.name, surf: 'concrete', map: 'refinery' };
  s.paint = paint; s.stain = stain; s.sign = sign; s.flame = flame;
  return s;
}

// ------------------------------------------------------------------------------------------------ quad accumulator (atlas materials)
const TILE = 64;
function qacc(B, key, x, z) {
  const S = rf(B), k = key + '|' + Math.floor(x / TILE) + '|' + Math.floor(z / TILE);
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
  if (!r) throw new Error('refinery: unknown ' + atlas + ' slot ' + slot);
  return [(r[0] + 1.5) / ATL, 1 - (r[1] + r[3] - 1.5) / ATL, (r[0] + r[2] - 1.5) / ATL, 1 - (r[1] + 1.5) / ATL];
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
export function column(B, x, z, r, h, o = {}) {
  const K = kit(B, x, z), sk = o.skirt || 3.2, m = o.mat || 'p_alu';
  B.cyl(x, 0, z, r + .15, h, { visible: false, surf: 'metal', mat: 'steel' });
  K.lathe('p_concrete_precast', [[r + .6, 0], [r + .6, .4], [r + .2, .4]], { x, z, seg: 24 });
  K.lathe('steel_dark', [[r + .12, .4], [r + .12, sk]], { x, z, seg: 24 });
  K.lathe(m, [[r + .12, sk], [r + .08, sk + .25], [r + .08, h - r * .55], [r * .75, h - r * .12], [r * .3, h], [.01, h + .02]], { x, z, seg: 28, sharp: 50 });
  for (let y = sk + 2.2; y < h - r; y += 2.4) K.lathe('p_galv', [[r + .1, y], [r + .12, y + .015], [r + .12, y + .07], [r + .1, y + .085]], { x, z, seg: 28 });
  // manway in the skirt and nozzles
  K.push(x, 0, z, o.face || 0); K.box('steel_dark', 0, .9, r + .1, .7, .7, .14); K.pop();
  const plats = o.plat || [];
  for (const [i, py] of plats.entries()) {
    const a0 = (o.pa0 || 0) + (i % 2) * 1.1, a1 = a0 + (o.span || 3.4);
    K.lathe('metal_plate', [[r + .15, py - .05], [r + 1.25, py - .05], [r + 1.25, py], [r + .15, py]], { x, z, seg: 20, a0, a1, sharp: 30 });
    K.lathe(RAIL, [[r + 1.22, py + .98], [r + 1.25, py + 1.02], [r + 1.22, py + 1.04]], { x, z, seg: 20, a0, a1 });
    for (let k = 0; k <= 6; k++) { const a = a0 + (a1 - a0) * k / 6; K.box(RAIL, x + Math.sin(a) * (r + 1.23), py, z + Math.cos(a) * (r + 1.23), .045, 1.0, .045); }
    for (let k = 0; k <= 3; k++) { const a = a0 + (a1 - a0) * (k + .5) / 4; K.box(STL, x + Math.sin(a) * (r + .7), py - .35, z + Math.cos(a) * (r + .7), .1, .3, .1, { ry: a }); }
  }
  // caged ladder from the first platform up
  if (plats.length) {
    const la = (o.pa0 || 0) - .25, lx = x + Math.sin(la) * (r + .45), lz = z + Math.cos(la) * (r + .45);
    K.push(lx, 0, lz, la);
    const yb = o.ladder0 == null ? plats[0] : o.ladder0, yt = plats[plats.length - 1] + 1;
    K.box(RAIL, -.22, yb, 0, .05, yt - yb, .05); K.box(RAIL, .22, yb, 0, .05, yt - yb, .05);
    for (let y = yb + .3; y < yt; y += .3) K.box(RAIL, 0, y, 0, .44, .03, .03);
    for (let y = yb + 2.4; y < yt; y += 1.2) K.lathe(RAIL, [[.4, y], [.42, y + .04]], { x: 0, z: .3, seg: 10, a0: -2.2, a1: 2.2 });
    K.pop();
  }
  for (const nz of o.nozzles || []) {   // [height, angle, radius, drop to] : nozzle then a pipe down to the ground
    const [ny, na, nr, to] = nz, nx0 = x + Math.sin(na) * (r + .1), nz0 = z + Math.cos(na) * (r + .1), nx1 = x + Math.sin(na) * (r + .9), nz1 = z + Math.cos(na) * (r + .9);
    K.tube('p_galv', [[nx0, ny, nz0], [nx1, ny, nz1]], nr + .05, { seg: 10 });
    pipe(B, [[nx1, ny, nz1], [nx1, to, nz1]], nr, o.pipeMat || 'p_alu', { fl: 0 });
  }
  if (o.label) decal(B, 'sign', o.label, x + Math.sin(o.face || 0) * (r + .14), sk + 1.6, z + Math.cos(o.face || 0) * (r + .14), 2.4, .23, { face: 'n', ry: o.face || 0 });
}
function roundPath(pts, rad) {
  if (pts.length < 3 || !rad) return pts;
  const out = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i], a = pts[i - 1], b = pts[i + 1];
    const da = [a[0] - p[0], a[1] - p[1], a[2] - p[2]], db = [b[0] - p[0], b[1] - p[1], b[2] - p[2]];
    const la = Math.hypot(...da), lb = Math.hypot(...db), t = Math.min(rad, la * .45, lb * .45);
    const pa = da.map((v, k) => p[k] + v / la * t), pb = db.map((v, k) => p[k] + v / lb * t);
    for (let s = 0; s <= 4; s++) { const u = s / 4, q = (1 - u) * (1 - u), w = 2 * u * (1 - u), e = u * u; out.push([q * pa[0] + w * p[0] + e * pb[0], q * pa[1] + w * p[1] + e * pb[1], q * pa[2] + w * p[2] + e * pb[2]]); }
  }
  out.push(pts[pts.length - 1]);
  return out;
}
/** pipe run along a path of points: r radius, flanges every o.fl metres (0 = none), o.collide = box colliders per straight segment */
export function pipe(B, path, r, mat = 'p_galv', o = {}) {
  const K = kit(B, path[0][0], path[0][2], r < .2);
  K.tube(mat, roundPath(path, Math.max(r * 2.5, .3)), r, { seg: r > .25 ? 12 : 8 });
  const fl = o.fl == null ? 6 : o.fl;
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i], b = path[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    if (fl > 0 && L > fl) for (let s = fl; s < L - 1; s += fl) {
      const t = s / L, p = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t], u = [(b[0] - a[0]) / L * .04, (b[1] - a[1]) / L * .04, (b[2] - a[2]) / L * .04];
      K.tube(mat === 'p_alu' ? 'p_galv' : mat, [[p[0] - u[0], p[1] - u[1], p[2] - u[2]], [p[0] + u[0], p[1] + u[1], p[2] + u[2]]], r + .045, { seg: 10 });
    }
    if (o.collide && (a[1] === b[1])) {
      const cx = (a[0] + b[0]) / 2, cz = (a[2] + b[2]) / 2, ry = Math.atan2(-(b[2] - a[2]), b[0] - a[0]);
      B.box(cx, a[1] - r, cz, L, r * 2, r * 2, { ry, visible: false, surf: 'metal' });
    }
  }
}
/** main pipe rack along x at z (width w): bents every o.bay m, tiers o.tiers, o.walk = { x0, x1, side: +1 north, y } walkway */
export function rack(B, x0, x1, z, o = {}) {
  const w = o.w || 6, bay = o.bay || 6, tiers = o.tiers || [4.5, 7], zs = z - w / 2, zn = z + w / 2, top = tiers[tiers.length - 1];
  const xs = []; for (let x = x0; x <= x1 + .01; x += bay) xs.push(x);
  for (const x of xs) {
    hcol(B, x, zs, top + .3, { fp: 4.2 }); hcol(B, x, zn, top + .3, { fp: 4.2 });
    const K = kit(B, x, z);
    for (const ty of tiers) K.box(STL, x, ty - .32, z, .3, .32, w + .3);
    K.push(x, 0, z); K.box(STL, 0, top + .3 - .15, 0, .25, .15, w + .3); K.pop();
  }
  for (let i = 0; i < xs.length - 1; i++) {
    const xa = xs[i], xb = xs[i + 1], cx = (xa + xb) / 2, K = kit(B, cx, z);
    for (const ty of tiers) for (const zz of [zs, zn]) K.box(STL, cx, ty - .25, zz, bay - .3, .22, .16);
    if (i % 3 === 1) for (const zz of [zs, zn]) { K.push(cx, (tiers[0] + top) / 2, zz, 0, 0, Math.atan2(top - tiers[0], bay)); K.box(STL, 0, -.06, 0, Math.hypot(bay, top - tiers[0]) - .3, .12, .12); K.pop(); }
  }
  // pipe bundles on each tier (sit on the beams), colliders per tier
  const PM = ['p_galv', 'p_alu', 'p_paint_grey', 'p_galv', 'p_alu', 'p_coat_green', 'p_galv', 'p_alu', 'steel_dark', 'p_coat_yellow'];
  const r0 = rng(31);
  tiers.forEach((ty, ti) => {
    let zz = zs + .35, k = 0;
    while (zz < zn - .3) {
      const r = [.08, .15, .2, .12, .3, .1, .25, .18, .06][Math.floor(r0() * 9)], mat = PM[(k + ti * 3) % PM.length];
      if (zz + 2 * r > zn - .2) break;
      const zc = zz + r, y = ty + r;
      for (let x = x0 - 2; x < x1 + 2; x += 26) { const xe = Math.min(x1 + 2, x + 26); pipe(B, [[x, y, zc], [xe, y, zc]], r, mat, { fl: r > .14 ? 6.5 : 0 }); }
      zz += 2 * r + .12 + r0() * .15; k++;
    }
    B.box((x0 + x1) / 2, ty, z, x1 - x0 + 4, .65, w - .3, { visible: false, surf: 'metal', walk: false });
  });
  // fin-fan coolers on the top tier
  if (o.fans) for (const [fx0, fx1] of o.fans) {
    const K = kit(B, (fx0 + fx1) / 2, z), yb = top + .3;
    for (let x = fx0; x < fx1 - .1; x += 6) {
      K.box(STL, x + 3, yb, z, 5.8, .4, w - .2);                                   // plenum frame
      K.box('p_galv', x + 3, yb + .4, z, 5.8, .9, w - .4);                          // tube bundle box
      K.box('steel_dark', x + 3, yb + 1.3, z, 5.8, .12, w - .2);
      for (const fz of [-1, 1]) { K.lathe('p_galv', [[1.25, yb + 1.42], [1.25, yb + 1.95], [1.3, yb + 2.0]], { x: x + 3, z: z + fz * 1.45, seg: 18 }); K.lathe('grate', [[1.25, yb + 1.9], [0, yb + 1.9]], { x: x + 3, z: z + fz * 1.45, seg: 18 }); }
      K.box(RAIL, x + 3, yb + 1.42, zn - .15, 5.8, .04, .04); K.box(RAIL, x + 3, yb + 2.4, zn - .15, 5.8, .04, .04);
    }
  }
  // walkway on tier 1 along one side (deck + rail + collider)
  if (o.walk) {
    const Wk = o.walk, y = Wk.y || tiers[0] + .1, z0 = Wk.side > 0 ? zn + .15 : zs - 1.35, z1 = z0 + 1.2;
    deck(B, Wk.x0, z0, Wk.x1, z1, y, { beam: true });
    railing(B, Wk.x0, Wk.side > 0 ? z1 : z0, Wk.x1, Wk.side > 0 ? z1 : z0, y);
    railing(B, Wk.x0, Wk.side > 0 ? z0 : z1, Wk.x1, Wk.side > 0 ? z0 : z1, y, { collide: false, toe: false });
    const K = kit(B, (Wk.x0 + Wk.x1) / 2, z);
    for (let x = Wk.x0 + 1; x < Wk.x1; x += 6) K.box(STL, x, y - .5, (z0 + z1) / 2, .12, .45, 1.4);
  }
}

// ------------------------------------------------------------------------------------------------ equipment
export function exchanger(B, x, z, ry, o = {}) {
  const L = o.len || 5, r = o.r || .5, y = o.y || 1.0, K = kit(B, x, z), m = o.mat || 'p_paint_grey';
  K.push(x, 0, z, ry);
  for (const s of [-1, 1]) { K.box('p_concrete_precast', 0, 0, s * L * .3, r * 2 + .3, y - r * .6, .45); K.box(STL, 0, y - r * .7, s * L * .3, r * 2, r * .4, .2); }
  K.cylZ(m, -L / 2 + .3, L / 2 - .2, 0, y, r, { seg: 16 });
  K.lathe(m, [[r, 0], [r * .8, .18], [r * .4, .28], [.01, .3]], { x: 0, y, z: L / 2 - .2, rx: H, seg: 16 });
  K.cylZ('p_paint_grey', -L / 2 - .5, -L / 2 + .3, 0, y, r + .02, { seg: 16 });
  K.cylZ(DK, -L / 2 + .25, -L / 2 + .37, 0, y, r + .1, { seg: 16 }); K.cylZ(DK, -L / 2 - .55, -L / 2 - .43, 0, y, r + .1, { seg: 16 });
  for (const nz of [-L / 2 + .9, L / 2 - 1]) K.cyl('p_galv', 0, y + r - .05, nz, r * .35, .45, { seg: 10 });
  K.pop();
  B.collider({ cx: x, cy: (y + r) / 2, cz: z, hx: r + .1, hy: (y + r) / 2, hz: L / 2 + .3, ry, surf: 'metal' });
}
export function pump(B, x, z, ry, o = {}) {
  const K = kit(B, x, z), m = o.mat || 'p_coat_blue';
  K.push(x, 0, z, ry);
  K.box('p_concrete_precast', 0, 0, 0, .9, .3, 2.0); K.box(STL, 0, .3, 0, .7, .12, 1.8);
  K.cylZ(m, -.85, -.05, 0, .72, .3, { seg: 14 }); K.box(m, 0, .42, -.5, .5, .28, .5);              // motor
  K.box(RAIL, 0, .5, .15, .32, .36, .3);                                                             // coupling guard
  K.lathe('p_coat_red', [[.05, 0], [.32, .1], [.34, .3], [.05, .4]], { x: 0, y: .7, z: .55, rx: H, seg: 14 });   // volute
  K.tube('p_galv', [[0, .7, .95], [0, .7, 1.2], [0, 1.6, 1.2]], .1); K.tube('p_galv', [[0, 1.05, .55], [0, 2.0, .55]], .08);
  K.lathe('p_coat_red', [[.18, 0], [.2, .04], [.02, .06]], { x: 0, y: 1.45, z: 1.2, seg: 12 });
  K.pop();
  B.collider({ cx: x, cy: .5, cz: z, hx: .45, hy: .5, hz: 1.05, ry, surf: 'metal' });
}
export function vessel(B, x, z, ry, o = {}) {
  const L = o.len || 6, r = o.r || 1, y = o.y || 1.6, K = kit(B, x, z), m = o.mat || 'p_coat_white';
  K.push(x, 0, z, ry);
  for (const s of [-1, 1]) { K.box('p_concrete_precast', 0, 0, s * L * .3, r * 1.6, y - r * .5, .5); K.box(STL, 0, y - r * .75, s * L * .3, r * 1.7, r * .35, .25); }
  K.cylZ(m, -L / 2, L / 2, 0, y, r, { seg: 20 });
  for (const s of [-1, 1]) K.lathe(m, [[r, 0], [r * .82, r * .3], [r * .45, r * .48], [.01, r * .52]], { x: 0, y, z: s * L / 2, rx: s * H, seg: 20 });
  K.cyl('p_galv', 0, y + r - .1, L * .25, .25, .5, { seg: 10 }); K.cyl('p_galv', 0, y + r - .1, -L * .25, .18, .4, { seg: 10 });
  K.pop();
  B.collider({ cx: x, cy: (y + r) / 2, cz: z, hx: r, hy: (y + r) / 2, hz: L / 2 + r * .5, ry, surf: 'metal' });
}
/** fired heater: radiant box x0..x1, z0..z1 (h), convection section and stack */
export function heater(B, x0, z0, x1, z1, o = {}) {
  const h = o.h || 9, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, w = x1 - x0, d = z1 - z0, K = kit(B, cx, cz), sh = o.stack || 42;
  // legs (the box stands on columns, burners underneath)
  B.box(cx, 0, cz, w, 2.2, d, { visible: false, surf: 'metal' });
  for (const x of [x0 + .2, cx, x1 - .2]) for (const z of [z0 + .2, z1 - .2]) K.box(STL, x, 0, z, .35, 2.4, .35);
  K.box('p_concrete_precast', cx, 0, cz, w - .6, .25, d - .6);
  for (let i = 0; i < 6; i++) for (let j = 0; j < 2; j++) K.cyl('steel_dark', x0 + 1.2 + i * (w - 2.4) / 5, 1.2, z0 + d * (j ? .7 : .3), .3, 1.0, { seg: 10 });
  B.box(cx, 2.2, cz, w, h - 2.2, d, { mat: 'p_paint_grey', mats: { t: 'steel_dark' }, surf: 'metal' });
  for (let x = x0; x <= x1 + .01; x += w / 6) { K.box(DK, x - .08, 2.2, z0 - .12, .16, h - 2.2, .14); K.box(DK, x - .08, 2.2, z1 - .02, .16, h - 2.2, .14); }
  for (let y = 3.5; y < h; y += 2.2) { K.box(DK, cx, y, z0 - .1, w, .14, .1); K.box(DK, cx, y, z1, w, .14, .1); }
  for (let i = 0; i < 4; i++) { K.box('p_paint_grey', x0 + 1.5 + i * (w - 3) / 3, 3.2, z0 - .16, .35, .3, .08); K.box('p_paint_grey', x0 + 1.5 + i * (w - 3) / 3, 3.2, z1 + .08, .35, .3, .08); }
  // convection box + breeching + stack
  K.box('steel_dark', cx, h, cz, w * .7, 3.2, d * .75);
  K.lathe('steel_dark', [[Math.min(w, d) * .35, h + 3.2], [1.3, h + 5.2], [1.25, sh]], { x: cx, z: cz, seg: 20 });
  K.lathe(DK, [[1.32, sh - 1.5], [1.35, sh], [1.2, sh + .05]], { x: cx, z: cz, seg: 20 });
  for (let y = h + 8; y < sh; y += 6) K.lathe(STL, [[1.27, y], [1.35, y + .05], [1.35, y + .2], [1.27, y + .25]], { x: cx, z: cz, seg: 20 });
  // platform round the box at y 5.2 (visual) + caged ladder
  const py = 5.6;
  K.box('grate', cx, py - .05, z0 - .9, w + 1.8, .05, 1.6); K.box('grate', cx, py - .05, z1 + .9, w + 1.8, .05, 1.6);
  K.box(RAIL, cx, py + 1.0, z0 - 1.65, w + 1.8, .05, .05); K.box(RAIL, cx, py + 1.0, z1 + 1.65, w + 1.8, .05, .05);
  for (let x = x0 - .9; x <= x1 + .95; x += 2) { K.box(RAIL, x, py, z0 - 1.65, .05, 1.0, .05); K.box(RAIL, x, py, z1 + 1.65, .05, 1.0, .05); K.box(STL, x, py - .4, z0 - .9, .1, .35, 1.6); K.box(STL, x, py - .4, z1 + .9, .1, .35, 1.6); }
  K.push(x1 + .5, 0, z0 - 1.2, H);
  K.box(RAIL, -.22, 0, 0, .05, py + 1.1, .05); K.box(RAIL, .22, 0, 0, .05, py + 1.1, .05);
  for (let y = .3; y < py + 1; y += .3) K.box(RAIL, 0, y, 0, .44, .03, .03);
  K.pop();
  B.box(x1 + .5, 0, z0 - 1.2, .6, 2.2, .3, { visible: false, surf: 'metal' });
  if (o.label) decal(B, 'sign', o.label, cx, 6.4, z0 - .19, 4, .36, { face: 's' });
  decal(B, 'stain', 'soot', cx, h + 2.2, z0 - .02, w * .7, 3, { face: 's' });
}
/** road tanker: tractor (prop, nose +z after ry) + a 3-axle tank semi-trailer behind it */
export function tanker(B, x, z, ry, o = {}) {
  const c = Math.cos(ry), s = Math.sin(ry), at = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
  const [tx, tz] = at(0, 5.0);
  B.prop('truck_tractor', tx, 0, tz, { ry, variant: o.tractor || 'white' });
  const K = kit(B, x, z), m = o.mat || 'p_stainless', L = 11.6, R = 1.18, y = 2.35;
  K.push(x, 0, z, ry);
  K.box(DK, 0, 1.0, -2.6, 1.1, .32, L - 1.2);                                          // chassis rails
  K.cylZ(m, -L / 2 - 1.6, L / 2 - 1.6, 0, y, R, { seg: 24 });
  for (const [s2, zz] of [[1, L / 2 - 1.6], [-1, -L / 2 - 1.6]]) K.lathe(m, [[R, 0], [R * .9, .22], [R * .5, .36], [.01, .4]], { x: 0, y, z: zz, rx: s2 * H, seg: 24 });
  for (const zz of [-6.2, -3.4, -.6, 2.2]) K.lathe(DK, [[R + .01, -.04], [R + .05, -.02], [R + .05, .02], [R + .01, .04]], { x: 0, y, z: zz, rx: H, seg: 24 });
  for (let zz = -6.6; zz <= 2.6; zz += 3.1) { K.cyl(DK, 0, y + R - .05, zz, .28, .22, { seg: 12 }); }
  K.box('grate', 0, y + R + .14, -2, .6, .04, 9); K.box(RAIL, -.36, y + R + .5, -2, .04, .04, 9);
  for (const zz of [-6.4, -2, 2.4]) K.box(RAIL, -.36, y + R + .14, zz, .04, .4, .04);
  for (const az of [-5.4, -6.7, -8.0]) for (const sx of [-1, 1]) { K.cylX('rubber', sx * 1.25 - .28, sx * 1.25 + .28, .52, az, .52, { seg: 14 }); K.cylX('p_alu', sx * 1.25 - .29, sx * 1.25 + .29, .52, az, .28, { seg: 10 }); }
  for (const sx of [-1, 1]) K.box(DK, sx * 1.0, .9, -6.7, .1, .55, 3.6);
  for (const sx of [-.9, .9]) K.box(DK, sx, 0, 2.2, .14, 1.05, .14);                   // landing legs
  K.box('p_coat_red', 0, .9, -8.25, 2.4, .2, .1);
  K.pop();
  const [cx, cz] = at(0, -1.6);
  B.collider({ cx, cy: (y + R) / 2 + .05, cz, hx: 1.3, hy: (y + R) / 2, hz: L / 2 + .4, ry, surf: 'metal' });
  if (o.hide) { const [hx, hz] = at(1.9, -3); B.hide(hx, 0, hz, { kind: 'car', r: .8 }); }
}
/** flare stack in a lattice derrick (out of bounds) */
export function flare(B, x, z, h = 60) {
  const K = kit(B, x, z), b = 5, t = 1.4;
  K.lathe('steel_dark', [[.7, 0], [.7, h], [.85, h + .5]], { x, z, seg: 14 });
  for (let i = 0; i < h; i += 4) { const k0 = b - (b - t) * i / h, k1 = b - (b - t) * (i + 4) / h;
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) K.tube('p_coat_red', [[x + sx * k0, i, z + sz * k0], [x + sx * k1, i + 4, z + sz * k1]], .12, { seg: 6 });
    K.tube(STL, [[x - k1, i + 4, z - k1], [x + k1, i + 4, z - k1], [x + k1, i + 4, z + k1], [x - k1, i + 4, z + k1], [x - k1, i + 4, z - k1]], .06, { seg: 5 });
    K.tube(STL, [[x - k0, i, z - k0], [x + k1, i + 4, z - k1]], .05, { seg: 5 }); K.tube(STL, [[x + k0, i, z + k0], [x - k1, i + 4, z + k1]], .05, { seg: 5 });
  }
  for (const a of [0, H, H / 2, -H / 2]) flameQuad(B, x, h + 5, z, 7, 11, a);
}
export function fence(B, x0, z0, x1, z1, o = {}) {
  const L = Math.hypot(x1 - x0, z1 - z0), ry = Math.atan2(-(z1 - z0), x1 - x0);
  B.prop('fence_chainlink', (x0 + x1) / 2, o.y || 0, (z0 + z1) / 2, { ry, len: L, variant: o.plain ? 'plain' : 'barbed', h: o.h });
}

// ------------------------------------------------------------------------------------------------ flush
export function finish(B) {
  const S = rf(B), M = mats(B);
  for (const a of S.acc.values()) {
    if (!a.I.length) continue;
    const m = new BABYLON.Mesh('rf_' + a.key, B.scene), vd = new BABYLON.VertexData();
    vd.positions = new Float32Array(a.P); vd.normals = new Float32Array(a.N); vd.uvs = new Float32Array(a.U); vd.colors = new Float32Array(a.C);
    vd.indices = a.P.length / 3 > 65535 ? new Uint32Array(a.I) : new Uint16Array(a.I);
    vd.applyToMesh(m, false);
    m.material = M[a.key];
    B.mesh(m, { collide: 'none', cast: false });
  }
  S.acc.clear();
  for (const [k, K] of S.kits) emitKit(B, K, 0, 0, 0, { collide: false, cast: !k.endsWith('_nc') }, 'rf_' + k.replace(/[^a-z0-9]/gi, '_'));
  S.kits.clear();
}

// ------------------------------------------------------------------------------------------------ out of bounds (no colliders)
/** far process unit: o = { cols: [[dx, dz, r, h]], frame: [w, d, levels], tanks } around (x, z) */
export function farUnit(B, x, z, o = {}) {
  const K = kit(B, x, z);
  for (const [dx, dz, r, h] of o.cols || []) {
    K.lathe('p_alu', [[r + .1, 0], [r + .1, 3], [r, 3.3], [r, h - r * .5], [r * .4, h], [.01, h + .05]], { x: x + dx, z: z + dz, seg: 18, sharp: 50 });
    for (let y = 8; y < h - 2; y += 7) K.lathe('grate', [[r, y], [r + 1.1, y], [r + 1.1, y + .06], [r, y + .06]], { x: x + dx, z: z + dz, seg: 14, a0: y, a1: y + 3.2 });
  }
  if (o.frame) {
    const [w, d, lv] = o.frame, x0 = x - w / 2, z0 = z - d / 2;
    for (let i = 0; i <= Math.round(w / 6); i++) for (let j = 0; j <= Math.round(d / 6); j++) K.box(STL, x0 + i * w / Math.round(w / 6), 0, z0 + j * d / Math.round(d / 6), .35, lv * 5 + 1, .35);
    for (let l = 1; l <= lv; l++) { K.box('grate', x, l * 5 - .1, z, w, .1, d); K.box(STL, x, l * 5 - .5, z0, w, .4, .25); K.box(STL, x, l * 5 - .5, z0 + d, w, .4, .25); K.box(RAIL, x, l * 5 + .95, z0, w, .05, .05); }
    for (let k = 0; k < (o.boxes || 3); k++) K.box(k % 2 ? 'p_coat_white' : 'p_paint_grey', x0 + 2 + k * (w - 4) / Math.max(1, (o.boxes || 3) - 1) - 1.2, 5 * (1 + k % lv), z0 + d * .3, 2.4, 2.6, d * .4);
  }
  for (const [dx, dz, r, h] of o.tanks || []) {
    K.lathe(o.tankMat || 'p_coat_white', [[r, 0], [r, h], [r * .7, h + r * .12], [.01, h + r * .2]], { x: x + dx, z: z + dz, seg: 32 });
    K.lathe(RAIL, [[r, h + .9], [r + .02, h + .95]], { x: x + dx, z: z + dz, seg: 32 });
    for (let i = 0; i < 5; i++) { const b = i * 1.3 + dx; decal(B, 'stain', 'streak', x + dx + Math.sin(b) * (r + .02), h - 1.6, z + dz + Math.cos(b) * (r + .02), 2.5, 3.2, { face: 'n', ry: b }); }
  }
}
/** mechanical draught cooling tower: n cells along x */
export function coolingTower(B, x, z, n = 4) {
  const K = kit(B, x, z), cw = 10, w = n * cw, x0 = x - w / 2;
  K.box('p_concrete_precast', x, 0, z, w, 1.2, 13);
  K.box('p_paint_lightblue', x, 1.2, z, w, 9, 11);
  for (let i = 0; i <= n * 5; i++) K.box('steel_dark', x0 + i * 2, 1.2, z - 5.55, .12, 9, .1);
  K.box('p_concrete_precast', x, 1.2, z - 5.6, w, 3, .2);
  for (let i = 0; i < n; i++) {
    const cx = x0 + cw / 2 + i * cw;
    K.lathe('p_paint_grey', [[3.6, 10.2], [3.6, 13.2], [3.9, 13.5], [3.75, 13.6]], { x: cx, z, seg: 24 });
    K.lathe('grate', [[3.6, 13.0], [0, 13.0]], { x: cx, z, seg: 24 });
  }
  K.box(RAIL, x, 11.2, z - 5.5, w, .05, .05); K.box(RAIL, x, 11.2, z + 5.5, w, .05, .05);
  decal(B, 'stain', 'water', x, 6, z - 5.62, w, 7, { face: 's' });
}
/** lattice transmission pylon (h) with crossarms, wires toward +x for span m */
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
export function flameAt(B, x, y, z, s = 1) { for (const a of [0, H, H / 2, -H / 2]) flameQuad(B, x, y, z, 6 * s, 10 * s, a); }
/** one merged heightfield mesh (no collider, one draw call) for scenery ground outside the play area */
export function farGround(B, x0, x1, z0, z1, res, mat, hf) {
  const nx = Math.round((x1 - x0) / res), nz = Math.round((z1 - z0) / res), W = nx + 1, P = [], N = [], I = [];
  const h = (i, j) => hf(x0 + i * res, z0 + j * res);
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
    const gx = (h(i + 1, j) - h(i - 1, j)) / (2 * res), gz = (h(i, j + 1) - h(i, j - 1)) / (2 * res), l = Math.hypot(gx, 1, gz);
    P.push(x0 + i * res, h(i, j), z0 + j * res); N.push(-gx / l, 1 / l, -gz / l);
  }
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const a = j * W + i, b = a + 1, c = a + W, d = c + 1; I.push(a, b, c, b, d, c); }
  const m = new BABYLON.Mesh('rf_ground_' + mat, B.scene), vd = new BABYLON.VertexData();
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
