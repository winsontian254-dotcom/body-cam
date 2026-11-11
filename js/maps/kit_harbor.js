/* LIVE FIRE — Harbor Nine kit: the map-specific prefabs and painters used by js/maps/defs/harbor.js (owned by the harbor map).
   Exports (all take the MapBuilder B; coordinates are WORLD metres unless a B.push frame is active, which they respect):
     hb(B)                         per-build state (canvas materials, decal accumulators, kits)
     pave(B, regions, deflt, rect, cell)   ground of non-overlapping quads: regions [[x0, z0, x1, z1, mat]] (first wins)
     paint(B, x0, z0, x1, z1, o)   worn road paint stripe on the ground (o: w, col, dash [on, off], y)
     decal(B, atlas, slot, x, y, z, w, h, o)   quad from one of the harbor atlases ('stain' alpha blend, 'sign' alpha test,
                                   'glow' emissive); o.face n|s|e|w|u, o.ry, o.col
     ccont(B, x, y, z, ry, o)      container from boxes (container texture + frame; 250 tris): o.len 20|40, o.color, o.plain
     block(B, x0, z0, x1, z1, o)   container stack block: rows along o.dir ('z'|'x'), o.tiers (number | fn(row, i)), o.rnd,
                                   o.detail: sides ('nsew') whose bottom tier uses the detailed container prop
     stsCrane(B, x, zLand, zSea, o) ship-to-shore gantry crane (legs, bogies, portal, boom, A-frame, machinery house, trolley)
     freighter(B, o)               moored feeder ship (out of bounds, no colliders): hull, bow, deck cargo, bridge
     mast(B, x, z, o)              high-mast floodlight (o.h, o.aim [x, z], o.light: real spot light)
     quayEdge(B, x0, x1, z)        cope edge, quay wall face, fenders, bollards, mooring lines
     skyline(B)                    distant city, hills and the opposite terminal
     hatch(B, x, y, z, ry)         ship hatch cover (walkable steel pontoon, .9 m)
     finish(B)                     flushes the accumulated quads and kits (call at the end of build)
   Canvas materials are created once per scene (original artwork, fictional names). */
import { Kit, emitKit, propMaterial, decalUV } from './props/kit.js';
import { MATERIALS } from '../gfx/materials.js';

const TAU = Math.PI * 2;

// ------------------------------------------------------------------------------------------------ extra container paints
const CPAINT = (hex, col) => ({ surf: 'sheetmetal', set: 'container', tex: 'assets/textures/container', scale: 1.94, color: hex, desat: 1, macro: .14, por: .1, col, proc: 'corrugated' });
const EXTRA = { hb_cont_maroon: CPAINT('#5c1f1b', [.36, .12, .1]), hb_cont_teal: CPAINT('#1d5a5c', [.11, .35, .36]), hb_cont_yellow: CPAINT('#b88a14', [.72, .54, .08]),
  hb_cont_navy: CPAINT('#1b2a45', [.1, .16, .27]), hb_cont_brown: CPAINT('#5b3c24', [.36, .24, .14]) };
for (const k in EXTRA) if (!MATERIALS[k]) MATERIALS[k] = EXTRA[k];
export const CMAT = { red: 'container_red', blue: 'container_blue', green: 'container', orange: 'container_orange', grey: 'container_grey', white: 'p_cont_white',
  rust: 'p_cont_rust', maroon: 'hb_cont_maroon', teal: 'hb_cont_teal', yellow: 'hb_cont_yellow', navy: 'hb_cont_navy', brown: 'hb_cont_brown' };
export const PAL = ['red', 'blue', 'red', 'grey', 'blue', 'white', 'green', 'maroon', 'orange', 'teal', 'rust', 'navy', 'grey', 'red', 'blue', 'yellow', 'brown', 'white'];
const PROPVAR = new Set(['red', 'blue', 'green', 'orange', 'grey', 'white', 'rust']);

// ------------------------------------------------------------------------------------------------ per-build state
export function hb(B) {
  if (!B._hb) B._hb = { acc: new Map(), kits: new Map(), n: 0, detail: 0, cheap: 0 };
  return B._hb;
}
function rng(seed) { let a = seed >>> 0 || 1; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export { rng };

// ------------------------------------------------------------------------------------------------ canvas materials
const SCN = new WeakMap();
const ATL = 1024;
// stain atlas slots (px rects in a 1024 x 1024 canvas)
const STAIN = { oil0: [0, 0, 256, 256], oil1: [256, 0, 256, 256], oil2: [512, 0, 256, 256], drip: [768, 0, 256, 256], tyre: [0, 256, 512, 128],
  rust: [512, 256, 128, 256], water: [640, 256, 128, 256], grime: [768, 256, 256, 128], crack: [0, 384, 256, 256], patch: [256, 384, 256, 256],
  litter: [512, 512, 256, 256], dust: [768, 512, 256, 256], leaves: [0, 640, 256, 256], tyre2: [256, 640, 512, 128], soot: [768, 768, 256, 256] };
// sign atlas: big stencil letters, arrows, text rows
const SIGN = { A: [0, 0, 256, 256], B: [256, 0, 256, 256], arrow: [512, 0, 128, 256], hatch: [640, 0, 256, 256], chev: [896, 0, 128, 256] };
const TEXTS = [
  ['harbor9', 'HARBOR NINE', 'plate', '#13324f', '#f2efe6'], ['bonded', 'BONDED WAREHOUSE 3', 'plate', '#e9e6dc', '#1d2a36'],
  ['hm', 'HARBOURMASTER · PORT OPS', 'plate', '#e9e6dc', '#173a5c'], ['outgate', 'OUT GATE 4', 'plate', '#173a5c', '#f2f0ea'],
  ['berth', 'BERTH 9  ·  AUTHORISED PERSONNEL ONLY', 'plate', '#c9a227', '#141414'], ['customs', 'CUSTOMS CONTROL · STOP', 'plate', '#b32a1d', '#f5f2ea'],
  ['slow', 'SLOW', 'paint', null, '#ffffff'], ['stop', 'STOP', 'paint', null, '#ffffff'], ['keep', 'KEEP CLEAR', 'paint', null, '#ffffff'],
  ['noped', 'NO PEDESTRIANS', 'paint', null, '#ffffff'], ['dock1', 'DOCK 1', 'plate', '#1d2a36', '#f2c230'], ['dock2', 'DOCK 2', 'plate', '#1d2a36', '#f2c230'],
  ['dock3', 'DOCK 3', 'plate', '#1d2a36', '#f2c230'], ['ship', 'KESTREL TIDE', 'paint', null, '#f4f2ea'], ['port', 'NORDHAVEN', 'paint', null, '#f4f2ea'],
  ['speed', 'MAX 15', 'paint', null, '#ffffff'], ['reefer', 'REEFER STACK R2', 'plate', '#e9e6dc', '#1d2a36'], ['crane1', 'STS 07', 'paint', null, '#f4f2ea'],
  ['crane2', 'STS 08', 'paint', null, '#f4f2ea'], ['parking', 'STAFF PARKING', 'plate', '#173a5c', '#f2f0ea'], ['lane1', 'LANE 1', 'paint', null, '#f2c230'],
  ['lane2', 'LANE 2', 'paint', null, '#f2c230'], ['bay', 'BAY', 'paint', null, '#f2c230'], ['inspect', 'INSPECTION BAY', 'plate', '#e9e6dc', '#1d2a36'],
  ['hardhat', 'HARD HATS · HI-VIS BEYOND THIS POINT', 'plate', '#2b6b33', '#f5f2ea'], ['wharf', 'WHARF EDGE', 'paint', null, '#f2c230'],
];
TEXTS.forEach((t, i) => { SIGN[t[0]] = [(i % 2) * 512, 256 + Math.floor(i / 2) * 56, 512, 52]; });

function noiseFill(g, w, h, seed, n, col, a0, a1, r0, r1) {
  const r = rng(seed);
  for (let i = 0; i < n; i++) { g.fillStyle = col.replace('A', (a0 + r() * (a1 - a0)).toFixed(3)); const rr = r0 + r() * (r1 - r0); g.beginPath(); g.arc(r() * w, r() * h, rr, 0, TAU); g.fill(); }
}
function blob(g, cx, cy, R, seed, col, k = 1) {   // irregular soft stain
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
  g.fillRect(0, h * .47, w, h * .045); g.fillRect(w * .485, 0, w * .03, h * .3);               // stencil bridges
  noiseFill(g, w, h, ch.charCodeAt(0), 220, 'rgba(0,0,0,A)', .4, 1, 1, 5);                  // worn
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
    else { noiseFill(g, w, h, k.length * 7, 40, 'rgba(40,30,20,A)', .05, .25, 1, 3); }
  });
}
function drawPaint(g, w, h) {      // a tileable worn road-paint stripe: white, alpha holes; u along the line
  g.clearRect(0, 0, w, h);
  const r = rng(5);
  g.fillStyle = '#fff';
  for (let x = 0; x < w; x += 2) { const t0 = h * (.12 + .06 * Math.sin(x * .05) * r()), t1 = h * (.88 - .06 * Math.sin(x * .031 + 1) * r()); g.fillRect(x, t0, 2, t1 - t0); }
  g.globalCompositeOperation = 'destination-out';
  noiseFill(g, w, h, 6, 420, 'rgba(0,0,0,A)', .5, 1, 1, 3.5);
  for (let i = 0; i < 9; i++) { const x = r() * w; g.fillStyle = 'rgba(0,0,0,.85)'; g.beginPath(); g.ellipse(x, h * r(), 8 + r() * 26, 4 + r() * 14, 0, 0, TAU); g.fill(); }
  g.globalCompositeOperation = 'source-over';
}
function drawGlow(g) {         // night windows of distant buildings / the ship's bridge: a 16 x 32 grid of lit and dark panes
  g.fillStyle = '#000'; g.fillRect(0, 0, 512, 512);
  const r = rng(91);
  for (let j = 0; j < 32; j++) for (let i = 0; i < 16; i++) {
    const on = r() < .38, warm = r() < .7, k = .35 + r() * .65;
    g.fillStyle = on ? (warm ? `rgba(${255 * k | 0},${190 * k | 0},${110 * k | 0},1)` : `rgba(${170 * k | 0},${200 * k | 0},${255 * k | 0},1)`) : 'rgba(18,22,28,1)';
    g.fillRect(i * 32 + 4, j * 16 + 3, 24, 10);
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
  const paint = new PBR('hb_paint', sc);
  paint.albedoTexture = tex(sc, 'hb_paint_tex', 512, 64, drawPaint, true); paint.useAlphaFromAlbedoTexture = true;
  paint.transparencyMode = PBR.PBRMATERIAL_ALPHATEST; paint.alphaCutOff = .45; paint.metallic = 0; paint.roughness = .62; paint.zOffset = -2;
  const stain = new PBR('hb_stain', sc);
  stain.albedoTexture = tex(sc, 'hb_stain_tex', ATL, ATL, drawStain); stain.useAlphaFromAlbedoTexture = true;
  stain.transparencyMode = PBR.PBRMATERIAL_ALPHABLEND; stain.disableDepthWrite = true; stain.metallic = 0; stain.roughness = .55; stain.zOffset = -3;
  const sign = new PBR('hb_sign', sc);
  sign.albedoTexture = tex(sc, 'hb_sign_tex', ATL, ATL, drawSign); sign.useAlphaFromAlbedoTexture = true;
  sign.transparencyMode = PBR.PBRMATERIAL_ALPHATEST; sign.alphaCutOff = .45; sign.metallic = 0; sign.roughness = .6; sign.zOffset = -2;
  const glow = new PBR('hb_glow', sc);
  const gt = tex(sc, 'hb_glow_tex', 512, 512, drawGlow, true); gt.wrapV = BABYLON.Texture.WRAP_ADDRESSMODE; gt.hasAlpha = false;
  glow.albedoColor = new BABYLON.Color3(0, 0, 0); glow.emissiveTexture = gt; glow.emissiveColor = new BABYLON.Color3(1, 1, 1); glow.emissiveIntensity = 1.3;
  glow.disableLighting = true; glow.environmentIntensity = 0; glow.metallic = 0; glow.roughness = 1;
  for (const m of [paint, stain, sign, glow]) m.metadata = { lf: m.name, surf: 'concrete', map: 'harbor' };
  s.paint = paint; s.stain = stain; s.sign = sign; s.glow = glow;
  return s;
}

// ------------------------------------------------------------------------------------------------ quad accumulator (my materials)
const TILE = 64;
function qacc(B, key, x, z) {
  const S = hb(B), k = key + '|' + Math.floor(x / TILE) + '|' + Math.floor(z / TILE);
  let a = S.acc.get(k); if (!a) { a = { key, P: [], N: [], U: [], C: [], I: [] }; S.acc.set(k, a); }
  return a;
}
const W = { x: 0, y: 0, z: 0 };
/** quad from centre c, right vector R (u), up vector U (v), normal N; uv = [u0, v0, u1, v1] */
function emitQuad(B, key, c, R, U, N, w, h, uv, col) {
  const a = qacc(B, key, c[0], c[2]), base = a.P.length / 3;
  const hw = w / 2, hh = h / 2;
  const pts = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]], uvs = [[uv[0], uv[1]], [uv[2], uv[1]], [uv[2], uv[3]], [uv[0], uv[3]]];
  const T = B.T, cs = T.c, sn = T.s;
  const rot = v => [v[0] * cs + v[2] * sn, v[1], -v[0] * sn + v[2] * cs];
  const n = rot(N);
  const P = [];
  for (let i = 0; i < 4; i++) {
    const lx = c[0] + R[0] * pts[i][0] + U[0] * pts[i][1], ly = c[1] + R[1] * pts[i][0] + U[1] * pts[i][1], lz = c[2] + R[2] * pts[i][0] + U[2] * pts[i][1];
    B.toWorld(lx, ly, lz, W); P.push([W.x, W.y, W.z]);
    a.P.push(W.x, W.y, W.z); a.N.push(n[0], n[1], n[2]); a.U.push(uvs[i][0], uvs[i][1]);
    a.C.push(col ? col[0] : 1, col ? col[1] : 1, col ? col[2] : 1, 1);
  }
  const ux = P[1][0] - P[0][0], uy = P[1][1] - P[0][1], uz = P[1][2] - P[0][2], vx = P[2][0] - P[0][0], vy = P[2][1] - P[0][1], vz = P[2][2] - P[0][2];
  const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
  if (cx * n[0] + cy * n[1] + cz * n[2] < 0) a.I.push(base, base + 1, base + 2, base, base + 2, base + 3);
  else a.I.push(base, base + 2, base + 1, base, base + 3, base + 2);
}
const FACES = { n: [[-1, 0, 0], [0, 1, 0], [0, 0, 1]], s: [[1, 0, 0], [0, 1, 0], [0, 0, -1]], e: [[0, 0, 1], [0, 1, 0], [1, 0, 0]], w: [[0, 0, -1], [0, 1, 0], [-1, 0, 0]], u: [[1, 0, 0], [0, 0, 1], [0, 1, 0]] };
const ry3 = (v, a) => { const c = Math.cos(a), s = Math.sin(a); return [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c]; };
function slotUV(atlas, slot) {
  if (atlas === 'glow') return null;
  const r = (atlas === 'stain' ? STAIN : SIGN)[slot];
  if (!r) throw new Error('harbor: unknown ' + atlas + ' slot ' + slot);
  return [(r[0] + 1.5) / ATL, 1 - (r[1] + r[3] - 1.5) / ATL, (r[0] + r[2] - 1.5) / ATL, 1 - (r[1] + 1.5) / ATL];
}
/** atlas quad: atlas 'stain' | 'sign' | 'glow' (glow: o.uv = [u0, v0, u1, v1] in window-grid tiles) */
export function decal(B, atlas, slot, x, y, z, w, h, o = {}) {
  const f = FACES[o.face || 'u'], a = o.ry || 0;
  const uv = atlas === 'glow' ? (o.uv || [0, 0, w / 4, h / 4]) : slotUV(atlas, slot);
  if (o.flipV) { const t = uv[1]; uv[1] = uv[3]; uv[3] = t; }
  emitQuad(B, atlas, [x, y, z], ry3(f[0], a), ry3(f[1], a), ry3(f[2], a), w, h, uv, o.col);
}
/** worn paint stripe on the ground from (x0, z0) to (x1, z1) */
export function paint(B, x0, z0, x1, z1, o = {}) {
  const w = o.w || .15, y = o.y == null ? .012 : o.y, col = o.col || [1, 1, 1], L = Math.hypot(x1 - x0, z1 - z0);
  if (L < .01) return;
  const ux = (x1 - x0) / L, uz = (z1 - z0) / L, R = [ux, 0, uz], U = [uz, 0, -ux], N = [0, 1, 0];
  const segs = [];
  if (o.dash) { for (let s = 0; s < L; s += o.dash[0] + o.dash[1]) segs.push([s, Math.min(L, s + o.dash[0])]); } else segs.push([0, L]);
  const off = (x0 * 7.31 + z0 * 3.17) % 1;
  for (const [s0, s1] of segs) {
    const m = (s0 + s1) / 2, l = s1 - s0;
    emitQuad(B, 'paint', [x0 + ux * m, y, z0 + uz * m], R, U, N, l, w, [off + s0 / 4, 1, off + s1 / 4, 0], col);
  }
}
export const YEL = [.95, .72, .12], WHT = [.92, .92, .88], RED = [.75, .12, .08];

// ------------------------------------------------------------------------------------------------ ground
/** non-overlapping ground quads on a cell grid; regions [[x0, z0, x1, z1, mat]], first match wins; colliders included */
export function pave(B, regions, deflt, R, cell = 2) {
  const nx = Math.round((R.x1 - R.x0) / cell), nz = Math.round((R.z1 - R.z0) / cell);
  const matAt = (x, z) => { for (const r of regions) if (x > r[0] && x < r[2] && z > r[1] && z < r[3]) return r[4]; return deflt; };
  let prev = null, z0 = 0;
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

// ------------------------------------------------------------------------------------------------ containers
const CW = 2.438, CH = 2.591;
/** a container from boxes (body with the container texture, posts, castings, rails, door gear); front (doors) = +z */
export function ccont(B, x, y, z, ry, o = {}) {
  const L = +o.len === 40 ? 12.192 : 6.058, H = o.hc ? 2.896 : CH, mat = CMAT[o.color] || 'container', hl = L / 2, hw = CW / 2;
  const S = hb(B); S.cheap++;
  B.push(x, y, z, ry);
  B.box(0, .01, 0, CW - .05, H - .02, L - .05, { mat, surf: 'sheetmetal', collide: o.collide !== false, cast: o.cast });
  if (!o.plain) {
    const d = { collide: false, mat }, k = { collide: false, mat: 'steel_dark' };
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      B.box(sx * (hw - .08), .11, sz * (hl - .08), .17, H - .22, .17, d);
      B.box(sx * (hw - .09), 0, sz * (hl - .09), .19, .12, .19, k); B.box(sx * (hw - .09), H - .12, sz * (hl - .09), .19, .12, .19, k);
    }
    for (const sx of [-1, 1]) { B.box(sx * (hw - .03), 0, 0, .08, .16, L - .38, d); B.box(sx * (hw - .03), H - .11, 0, .08, .11, L - .38, d); }
    // door end: header, sill, four lock bars with cams and handles, hinge line
    B.box(0, H - .24, hl - .03, CW - .36, .24, .08, d); B.box(0, 0, hl - .03, CW - .36, .2, .08, d);
    for (const bx of [-.86, -.36, .36, .86]) { B.box(bx, .24, hl + .025, .045, H - .52, .045, k); B.box(bx + .07, 1.0, hl + .03, .14, .05, .04, k); }
    B.box(0, .22, hl + .005, .012, H - .48, .02, k);
    // logo + code decals (shared prop atlas)
    if (o.marks !== false) {
      const r = S.marks || (S.marks = rng(77));
      const logo = Math.floor(r() * 4), code = Math.floor(r() * 4), K = decalKit(B, x, z);
      K.push(B.toWorld(0, 0, 0).x, B.toWorld(0, 0, 0).y, B.toWorld(0, 0, 0).z, B.T.th);
      for (const s of [-1, 1]) {
        const f = s > 0 ? 'e' : 'w';
        K.decal('cont_logo_' + logo, s * (hw + .012), H * .55, 0, Math.min(3.2, L * .5), 1.2, { face: f });
        K.decal('cont_code_' + code, s * (hw + .012), H - .45, s * (hl - 1.0), 1.0, .22, { face: f });
      }
      K.decal('cont_code_' + code, -.55, H - .5, hl + .06, .9, .2, { face: 'n' });
      K.pop();
    }
  }
  B.pop();
}
function decalKit(B, x, z) {
  const S = hb(B), k = 'decal|' + Math.floor(x / TILE) + '|' + Math.floor(z / TILE);
  let K = S.kits.get(k); if (!K) { K = new Kit(1); S.kits.set(k, K); }
  return K;
}
/** the detailed container prop (merged, not instanced) */
export function pcont(B, x, y, z, ry, o = {}) {
  const S = hb(B); S.detail++;
  const v = PROPVAR.has(o.color) ? o.color : 'red';
  return B.prop('container', x, y, z, { ry, variant: v, len: o.len === 40 ? 40 : 20, doors: o.doors || 'closed', inst: false, hide: !!o.hide });
}
/** container stack block filling [x0..x1] x [z0..z1]: rows along o.dir; o.tiers number | fn(row, i) -> tiers of container i of row */
export function block(B, x0, z0, x1, z1, o = {}) {
  const dir = o.dir || 'z', r = o.rnd || rng(Math.round(x0 * 31 + z0 * 17 + x1 * 7 + z1));
  const along0 = dir === 'z' ? z0 : x0, along1 = dir === 'z' ? z1 : x1, across0 = dir === 'z' ? x0 : z0, across1 = dir === 'z' ? x1 : z1;
  const gapRow = o.gapRow == null ? .26 : o.gapRow, gapEnd = o.gapEnd == null ? .32 : o.gapEnd, pitch = CW + gapRow;
  const nRows = Math.max(1, Math.floor((across1 - across0 + gapRow) / pitch));
  const span = nRows * pitch - gapRow, a0 = (across0 + across1) / 2 - span / 2 + CW / 2;
  const detail = o.detail || '';
  for (let row = 0; row < nRows; row++) {
    // pack 40 ft and 20 ft boxes along the row
    const avail = along1 - along0, lens = [];
    let used = 0;
    while (true) {
      const want40 = r() < (o.p40 == null ? .6 : o.p40);
      const L = want40 && used + 12.192 <= avail + 1e-6 ? 12.192 : used + 6.058 <= avail + 1e-6 ? 6.058 : 0;
      if (!L) break;
      lens.push(L); used += L + gapEnd;
    }
    used -= gapEnd;
    let s = o.align === 'start' ? along0 : o.align === 'end' ? along1 - used : (along0 + along1) / 2 - used / 2;
    const ac = a0 + row * pitch;
    lens.forEach((L, i) => {
      const c = s + L / 2; s += L + gapEnd;
      const tiers = typeof o.tiers === 'function' ? o.tiers(row, i, nRows, lens.length) : (o.tiers || 2);
      const px = dir === 'z' ? ac : c, pz = dir === 'z' ? c : ac, ry = (dir === 'z' ? 0 : Math.PI / 2) + (r() < .5 ? Math.PI : 0);
      // which sides of this container face a lane (edge of the block)
      const edgeA0 = row === 0, edgeA1 = row === nRows - 1, edgeL0 = i === 0, edgeL1 = i === lens.length - 1;
      const sides = dir === 'z' ? { w: edgeA0, e: edgeA1, s: edgeL0, n: edgeL1 } : { s: edgeA0, n: edgeA1, w: edgeL0, e: edgeL1 };
      const outer = sides.w || sides.e || sides.n || sides.s;
      const longSide = dir === 'z' ? ['w', 'e'] : ['s', 'n'];
      const det = [...detail].some(k => sides[k] && (longSide.includes(k) || r() < .35));
      for (let t = 0; t < tiers; t++) {
        const color = o.color || PAL[Math.floor(r() * PAL.length)];
        const y = t * CH;
        if (t === 0 && det && PROPVAR.has(color)) pcont(B, px, y, pz, ry, { color, len: L > 7 ? 40 : 20 });
        else ccont(B, px, y, pz, ry, { color, len: L > 7 ? 40 : 20, plain: !outer, marks: outer && r() < .8, cast: outer });
      }
    });
  }
}

// ------------------------------------------------------------------------------------------------ kits (crane, ship, mast...)
function emit(B, K, key, o = {}) { emitKit(B, K, 0, 0, 0, o, 'hb_' + key); }
/** STS gantry crane: legs at x +- span/2 on rails z = zLand / zSea; boom along +z (seaward); o.up = boom raised; o.paint */
export function stsCrane(B, x, zLand, zSea, o = {}) {
  const K = new Kit(5), P = o.paint || 'paint_red', Wt = 'paint_white', D = 'steel_dark', span = o.span || 16, hs = span / 2;
  const gauge = zSea - zLand, zc = (zLand + zSea) / 2, Hp = 15, Hg = 33, Hb = 36.2, apex = 52;
  K.push(x, 0, 0);
  // legs (box section, slight taper), bogies on the rails, sill beams, portal beams, braces
  for (const sx of [-1, 1]) for (const zz of [zLand, zSea]) {
    const lx = sx * hs;
    K.box(P, lx, 2.1, zz, 1.6, Hg - 2.1, 1.6, { bev: .06 });
    for (let yy = 4; yy < Hg - 1; yy += 2.9) K.box(P, lx, yy, zz, 1.66, .06, 1.66);
    // bogie: equaliser beam along x (the rail direction), 8 wheels, buffers
    K.box(P, lx, .55, zz, 6.4, 1.15, 1.2, { bev: .05 }); K.box(D, lx, 1.7, zz, 2.2, .4, 1.5);
    for (let i = 0; i < 8; i++) K.cylZ(D, zz - .32, zz + .32, lx - 2.6 + i * .74, .38, .36, { seg: 12 });
    for (const bx of [-3.35, 3.35]) K.box('p_plastic_yellow', lx + bx, .55, zz, .3, .5, .6);
    K.box('hazard', lx, 1.7, zz + .76, 1.6, .5, .02); K.box('hazard', lx, 1.7, zz - .76, 1.6, .5, .02);
    K.col(lx, 0, zz, 6.4, 2.1, 1.25, { surf: 'metal' }); K.col(lx, 2.1, zz, 1.6, Hg - 2.1, 1.6, { surf: 'metal' });
  }
  for (const zz of [zLand, zSea]) {           // sill beam between the legs on each rail (high: trucks pass under)
    K.box(P, 0, Hp, zz, span - 1.6, 2.2, 1.3, { bev: .05 });
    const L = Math.hypot(hs, Hg - Hp - 3), a = Math.atan2(Hg - Hp - 3, hs);
    for (const sx of [-1, 1]) { K.push(sx * hs / 2, Hp + 2.2 + (Hg - Hp - 3) / 2, zz, 0, 0, sx * -a); K.box(P, 0, -.35, 0, L, .7, .7); K.pop(); }
  }
  for (const sx of [-1, 1]) {                  // portal beams between the land and sea legs, + diagonal
    K.box(P, sx * hs, Hp + .2, zc, 1.3, 1.8, gauge - 1.6, { bev: .05 });
    K.box(P, sx * hs, Hg - 1.2, zc, 1.5, 2.6, gauge + 1.6, { bev: .05 });
    const L = Math.hypot(gauge, Hg - Hp - 3), a = Math.atan2(Hg - Hp - 3, gauge);
    K.push(sx * hs, Hp + 1.9 + (Hg - Hp - 3) / 2, zc, 0, a, 0); K.box(P, 0, -.3, 0, .6, .6, L); K.pop();
  }
  for (const zz of [zLand, zSea]) K.box(P, 0, Hg - 1.2, zz, span + 1.6, 2.6, 1.5, { bev: .05 });
  // stair tower on a landside leg (visual)
  for (const [px, pz] of [[-.7, -.7], [.7, -.7], [-.7, .7], [.7, .7]]) K.box('p_galv', -hs - 1.6 + px, 0, zLand + .2 + pz, .1, Hg - 1, .1);
  for (let yy = 2.6; yy < Hg - 1; yy += 2.6) { K.box('grate', -hs - 1.6, yy, zLand + .2, 1.5, .05, 1.5); K.box('p_galv', -hs - 2.35, yy + .95, zLand + .2, .05, .05, 1.5); K.box('p_galv', -hs - 1.6, yy + .95, zLand + .95, 1.5, .05, .05); }
  K.col(-hs - 1.6, 0, zLand + .2, 1.5, 2.5, 1.5, { surf: 'metal', ray: false });
  // boom + girder: two box girders along z
  const back = zLand - 20, tip = zSea + 44, hinge = zSea + 2;
  const girder = (z0, z1, up) => {
    for (const gx of [-3.6, 3.6]) {
      if (!up) { K.box(P, gx, Hb, (z0 + z1) / 2, 1.3, 3.0, z1 - z0); K.box(D, gx, Hb - .25, (z0 + z1) / 2, .6, .25, z1 - z0); }
      else { const L = z1 - z0; K.push(gx, Hb + 1.5, z0, 0, -up, 0); K.box(P, 0, -1.5, L / 2, 1.3, 3.0, L); K.pop(); }
    }
    if (!up) for (let zz = z0 + 2; zz < z1 - 1; zz += 6) K.box(P, 0, Hb + 2.4, zz, 7.2, .5, .5);
  };
  girder(back, hinge, 0);
  if (o.up) girder(hinge, tip, o.up); else girder(hinge, tip, 0);
  // A-frame and stays
  for (const gx of [-3.6, 3.6]) {
    const legL = Math.hypot(apex - Hb - 3, 8);
    K.push(gx, Hb + 3, zSea - 10, 0, -Math.atan2(8, apex - Hb - 3) * 0, 0);
    K.tube(P, [[0, 0, 0], [0, apex - Hb - 3, 6]], .55, { seg: 8 }); K.tube(P, [[0, 0, 14], [0, apex - Hb - 3, 6]], .5, { seg: 8 });
    K.pop();
    const ap = [gx, apex, zSea - 4];
    const tipP = o.up ? [gx, Hb + 1.5 + Math.sin(o.up) * (tip - hinge), hinge + Math.cos(o.up) * (tip - hinge)] : [gx, Hb + 2.8, tip - 1];
    K.tube(D, [ap, tipP], .09, { seg: 6 }); K.tube(D, [ap, [gx, Hb + 2.8, back + 1]], .09, { seg: 6 });
    if (!o.up) K.tube(D, [ap, [gx, Hb + 2.8, hinge + 18]], .07, { seg: 6 });
  }
  K.box(P, 0, apex - .8, zSea - 4, 8.6, 1.2, 1.4);
  // machinery house on the backreach, electrical room, operator cab + trolley + spreader
  K.box(Wt, 0, Hb + 3, back + 7, 9.6, 5.2, 12, { bev: .08 }); K.box(D, 0, Hb + 8.2, back + 7, 9.8, .25, 12.2);
  K.box('p_glass_tint', 4.81, Hb + 5.5, back + 7, .02, 1, 8); K.box('p_glass_tint', -4.81, Hb + 5.5, back + 7, .02, 1, 8);
  K.box(Wt, 0, Hb + 3, back + 15, 6, 3.4, 4);
  const tz = o.up ? zc : zSea + (o.trolley || 16);
  if (!o.up) {
    K.box(P, 0, Hb + 3, tz, 8.6, 1.6, 5.2); K.box(D, 0, Hb + 4.6, tz, 7.6, .4, 4.6);
    K.box(Wt, 2.6, Hb - 3, tz + .8, 2.4, 2.8, 2.6); K.box('p_glass_tint', 2.6, Hb - 2.8, tz + 2.11, 2.2, 2.2, .04); K.box('p_glass_tint', 2.6, Hb - 3.01, tz + .8, 2.2, .02, 2.2);
    const sy = o.spreaderY || 22;
    for (const [dx, dz] of [[-2, -1.4], [2, -1.4], [-2, 1.4], [2, 1.4]]) K.tube(D, [[dx * .6, Hb, tz + dz * .7], [dx * 2.4, sy + .6, tz + dz * .6]], .025, { seg: 4 });
    K.box('paint_yellow', 0, sy, tz, 12.4, .6, 2.6); K.box(D, 0, sy + .6, tz, 2.2, .7, 2.2);
    if (o.load) { K.push(0, sy - CH - .05, tz, Math.PI / 2); K.box(o.load, 0, 0, 0, CW, CH, 12.19); K.pop(); }
  } else { K.box(P, 0, Hb + 3, zc - 4, 8.6, 1.6, 5.2); K.box(Wt, 2.6, Hb - 3, zc - 3.2, 2.4, 2.8, 2.6); }
  // flood lights under the girders (emissive) and warning beacons
  for (let zz = back + 4; zz < hinge; zz += 9) for (const gx of [-3.6, 3.6]) K.box('emissive_warm', gx, Hb - .45, zz, .9, .18, .5);
  K.box('emissive_red', 0, apex + .4, zSea - 4, .4, .3, .4);
  K.pop();
  K.noCast('emissive_warm'); K.noCast('emissive_red');
  emit(B, K, 'crane' + x);
  // name boards on the sill beam (sign atlas)
  if (o.name) for (const zz of [zLand]) { decal(B, 'sign', o.name, x, Hp + 1.1, zz - .66, 7, .9, { face: 's' }); decal(B, 'sign', o.name, x, Hp + 1.1, zz + .66, 7, .9, { face: 'n' }); }
}

/** moored feeder ship along the quay (hull side at zHull, bow toward +x at xBow), out of bounds: no colliders */
export function freighter(B, o) {
  const K = new Kit(9), z0 = o.zHull, beam = o.beam || 24, xs = o.xStern, xb = o.xBow, dk = o.deck || 7.5, wl = o.water || -2.4, keel = wl - 7;
  const z1 = z0 + beam, zc = z0 + beam / 2;
  const hull = 'p_paint_darkgrey', red = 'paint_red', wt = 'paint_white';
  // hull body: parallel mid-body as boxes (side plating, boot top), bow as a loft of narrowing sections
  const xm = xb - 26;
  K.box(hull, (xs + xm) / 2, wl + .9, zc, xm - xs, dk - wl - .9, beam);
  K.box(red, (xs + xm) / 2, keel, zc, xm - xs, wl - keel + .15, beam - .2);
  K.box('paint_black', (xs + xm) / 2, wl + .15, zc, xm - xs + .05, .8, beam + .05);
  // bow: sections along x from xm to xb (local loft z = world x)
  const secs = [];
  for (let i = 0; i <= 8; i++) {
    const f = i / 8, xx = xm + f * (xb - xm), half = beam / 2 * Math.sqrt(Math.max(0, 1 - f * f)) * (1 - .1 * f) + .25, top = dk + 2.4 * f * f, bot = keel + (wl - keel) * Math.pow(f, 3) * .9;
    const flare = 1 + .18 * f;
    secs.push({ z: xx, pts: [[-half * .82, bot], [half * .82, bot], [half, wl], [half * flare, top], [-half * flare, top], [-half, wl]] });
  }
  K.push(0, 0, zc, Math.PI / 2);   // local z -> world x, local x -> world -z
  K.loft(hull, secs.map(s => ({ z: s.z, pts: s.pts.map(p => [p[0], p[1]]) })), { caps: true, crease: new Set([0, 1, 3, 4]) });
  K.pop();
  // forecastle and deck edge, bulwark rail, anchor, hawse, name
  K.box(wt, (xs + xm) / 2, dk, z0 + .1, xm - xs, 1.2, .2); K.box(wt, (xs + xm) / 2, dk, z1 - .1, xm - xs, 1.2, .2);
  K.box(hull, xm - 6, dk, zc, 14, 2.4, beam - 2);
  K.box(D_(), xb - 9, wl + 4.8, z0 - .05, 1.6, 1.6, .2); K.box('steel_dark', xb - 9.2, wl + 1.6, z0 - .25, .5, 3.2, .3);
  // deck cargo: bays of containers (tiers 3-5), lashing bridges
  const r = rng(13);
  for (let bx = xs + 34; bx < xm - 10; bx += 13.4) {
    const tiers = 3 + Math.floor(r() * 3);
    for (let row = 0; row < 8; row++) {
      const zz = z0 + 1.6 + row * 2.6 + CW / 2;
      const tt = Math.max(1, tiers - (row === 0 || row === 7 ? 1 : 0) - (r() < .2 ? 1 : 0));
      for (let t = 0; t < tt; t++) { const c = CMAT[PAL[Math.floor(r() * PAL.length)]]; K.push(bx, dk + .4 + t * CH, zz, Math.PI / 2); K.box(c, 0, 0, 0, CW - .04, CH - .02, 12.15); K.pop(); }
    }
    K.box('p_galv', bx + 6.6, dk, zc, .5, 5.2, beam - 2);
  }
  // bridge superstructure at the stern + funnel
  const bx0 = xs + 4, bx1 = xs + 24;
  K.box(wt, (bx0 + bx1) / 2, dk, zc, bx1 - bx0, 15, beam - 6);
  K.box(wt, (bx0 + bx1) / 2 + 2, dk + 15, zc, bx1 - bx0 - 6, 3, beam + 2);
  K.box('paint_black', bx0 + 4, dk + 15, zc, 5, 9, 6); K.box(red, bx0 + 4, dk + 21, zc, 5.1, 1.2, 6.1);
  K.box('p_galv', (bx0 + bx1) / 2 + 2, dk + 18, zc, 1, 6, 1);
  emit(B, K, 'ship', { collide: false });
  // lit windows on the bridge and the name on the bow (my atlases)
  for (let d = 0; d < 5; d++) decal(B, 'glow', null, bx1 + .02, dk + 2 + d * 3, zc, beam - 7, 1.2, { face: 'e', uv: [d * 1.3, d * .4, d * 1.3 + 4, d * .4 + .25] });
  decal(B, 'glow', null, bx1 + 2.02, dk + 16.5, zc, beam + 1, 1.4, { face: 'e', uv: [0, 5, 6, 5.2] });
  decal(B, 'sign', 'ship', xb - 14, dk - 1.2, z0 - .06, 10, 1.3, { face: 's' });
}
const D_ = () => 'steel_dark';

/** high-mast floodlight with a head of lamps; o.light adds one real spot aimed at o.aim */
export function mast(B, x, z, o = {}) {
  const K = new Kit(3), h = o.h || 26;
  K.box('p_concrete_precast', x, 0, z, 1.4, .5, 1.4, { bev: .05 }); K.col(x, 0, z, 1.4, .5, 1.4, { surf: 'concrete' });
  K.lathe('p_galv', [[.36, 0], [.34, .3], [.16, h]], { seg: 12, x, y: .5, z });
  K.box('steel_dark', x - .3, 1.2, z + .3, .45, .7, .1);
  const ry = o.aim ? Math.atan2(o.aim[0] - x, o.aim[1] - z) : 0;
  K.push(x, h + .5, z, ry);
  K.box('p_galv', 0, 0, 0, 3.4, .14, .14); K.box('p_galv', 0, 0, .5, 3.4, .14, .14);
  for (const lx of [-1.3, -.45, .45, 1.3]) { K.push(lx, -.05, .8, 0, .55, 0); K.box('steel_dark', 0, 0, 0, .7, .5, .25); K.box(o.on === false ? 'p_lens_clear' : 'emissive_warm', 0, .05, .13, .6, .4, .02); K.pop(); }
  K.box('emissive_red', 0, .3, 0, .14, .12, .14);
  K.pop();
  K.col(x, 0, z, .7, h, .7, { surf: 'metal' });
  K.noCast('emissive_warm'); K.noCast('emissive_red');
  emit(B, K, 'mast' + x + '_' + z);
  if (o.light) {
    const ax = o.aim ? o.aim[0] : x, az = o.aim ? o.aim[1] : z + 10, dx = ax - x, dz = az - z, dy = -(h - 1);
    const l = Math.hypot(dx, dy, dz);
    B.light({ type: 'spot', x: x + Math.sin(ry) * .9, y: h + .3, z: z + Math.cos(ry) * .9, dir: [dx / l, dy / l, dz / l], angle: o.angle || 1.45,
      intensity: o.intensity || 2200, range: o.range || 60, color: o.color || [1, .78, .5], fixture: false });
  }
}

/** quay edge from x0 to x1 at z (water beyond +z): cope, wall face, rubber fenders, bollards (with colliders), ladders */
export function quayEdge(B, x0, x1, z, o = {}) {
  const K = new Kit(4);
  K.box('concrete', (x0 + x1) / 2, -4.5, z + .45, x1 - x0, 4.5, .9);
  K.box('paint_yellow', (x0 + x1) / 2, 0, z - .2, x1 - x0, .22, .4);
  for (let x = x0 + 6; x < x1 - 2; x += 16) {
    // cylindrical fender on chains + a bollard on the cope
    K.cylX('rubber', x - 1.6, x + 1.6, -1.2, z + 1.25, .55, { seg: 14 });
    K.tube('steel_dark', [[x - 1.2, .05, z + .6], [x - 1.2, -.7, z + 1.1]], .03, { seg: 4 }); K.tube('steel_dark', [[x + 1.2, .05, z + .6], [x + 1.2, -.7, z + 1.1]], .03, { seg: 4 });
    const bz = z - .9, bx = x + 7;
    if (bx < x1 - 2) {
      K.lathe('paint_black', [[.34, 0], [.3, .2], [.24, .26], [.22, .55], [.32, .62], [.32, .72], [0, .74]], { seg: 14, x: bx, y: 0, z: bz });
      K.box('steel_dark', bx, 0, bz, .9, .06, .9);
      K.ccyl(bx, 0, bz, .34, .74, { surf: 'metal' });
      if (o.lines && Math.abs(bx - o.lines[0]) < 40) {
        const sx = bx < o.lines[0] ? -1 : 1;
        K.tube('p_fab_tan', [[bx, .55, bz], [bx + sx * 3, 1.6, z + 1.5], [bx + sx * 9, o.lines[1], z + 3.1]], .06, { seg: 6 });
      }
    }
    if ((x - x0) % 48 < 16) for (let s = 0; s < 6; s++) K.box('p_galv', x + 3.6, -.4 - s * .5, z + .02, .5, .04, .14);
  }
  emit(B, K, 'quay' + x0);
}

/** ship hatch cover (steel pontoon 12.6 x .9 x 8.5 with coamings) — walkable */
export function hatch(B, x, y, z, ry = 0, o = {}) {
  B.push(x, y, z, ry);
  const m = o.mat || 'p_paint_darkgrey';
  B.box(0, 0, 0, 12.6, .82, 8.4, { mat: m, mats: { t: 'metal_plate' }, surf: 'metal' });
  B.box(0, .82, 0, 12.4, .06, 8.2, { mat: 'metal_plate', collide: false });
  for (const s of [-1, 1]) { B.box(s * 6.36, .1, 0, .14, .6, 8.2, { mat: 'paint_red', collide: false }); B.box(0, .1, s * 4.26, 12.4, .6, .14, { mat: 'paint_red', collide: false }); }
  for (const lx of [-4, 0, 4]) B.box(lx, .88, 0, .22, .08, 8, { mat: 'steel_dark', collide: false });
  B.pop();
}

/** distant city, hills and the far terminal (no colliders) */
export function skyline(B, o = {}) {
  const K = new Kit(21), r = rng(404);
  const mats = ['concrete', 'concrete_panels', 'brick', 'p_paint_beige', 'p_paint_grey', 'plaster', 'brick_red'];
  const towers = [];
  // city to the south and east: a ring of blocks 260..520 m out
  for (let i = 0; i < 70; i++) {
    const a = -Math.PI * .02 - r() * Math.PI * .95, d = 260 + r() * 260, x = Math.sin(a) * d * 1.1 + 40, z = Math.cos(a) * d * .9 - 60;
    if (z > 40) continue;
    const w = 14 + r() * 30, dd = 14 + r() * 30, h = 10 + Math.pow(r(), 2) * 70 + (Math.abs(a + 1.4) < .5 ? r() * 40 : 0);
    K.box(mats[Math.floor(r() * mats.length)], x, -1, z, w, h + 1, dd);
    towers.push([x, z, w, h, dd]);
    if (h > 60) K.box('emissive_red', x, h, z, .5, .4, .5);
  }
  // far terminal across the water (north-east): crane silhouettes and stacks
  for (let i = 0; i < 6; i++) {
    const x = 120 + i * 34, z = 420 + i * 6;
    for (const sx of [-8, 8]) for (const sz of [-12, 12]) K.box('paint_blue', x + sx, -2, z + sz, 1.4, 34, 1.4);
    K.box('paint_blue', x, 30, z - 30, 2.4, 3, 90); K.box('paint_white', x, 33, z - 22, 6, 5, 9); K.box('emissive_red', x, 33.2, z + 46, .8, .6, .8);
  }
  for (let i = 0; i < 26; i++) K.box(CMAT[PAL[i % PAL.length]], 90 + r() * 260, -2, 380 + r() * 40, 12, 2.6 * (1 + Math.floor(r() * 4)), 2.5 + r() * 20);
  // breakwater + lighthouse to the north-west
  K.box('rock', -260, -4, 330, 420, 5.5, 14, { ry: .25 }); K.cyl('paint_white', -60, 0, 300, 3, 18, { seg: 12 }); K.box('paint_red', -60, 18, 300, 5, 3, 5); K.box('emissive_warm', -60, 21, 300, 1.2, 1.2, 1.2);
  K.noCast('emissive_red'); K.noCast('emissive_warm');
  emit(B, K, 'skyline', { collide: false, cast: false });
  for (const [x, z, w, h, dd] of towers) if (h > 18) {
    const rows = Math.floor(h / 3.3), cols = Math.max(2, Math.floor(w / 3.2));
    const fx = Math.abs(x - 0) > Math.abs(z + 40) ? (x > 0 ? 'w' : 'e') : 'n';
    const u0 = Math.floor(r() * 12), v0 = Math.floor(r() * 24);
    if (fx === 'n') decal(B, 'glow', null, x, h / 2, z + dd / 2 + .05, w * .9, h * .85, { face: 'n', uv: [u0, v0, u0 + cols / 2, v0 + rows / 2] });
    else decal(B, 'glow', null, fx === 'w' ? x - w / 2 - .05 : x + w / 2 + .05, h / 2, z, dd * .9, h * .85, { face: fx, uv: [u0, v0, u0 + cols / 2, v0 + rows / 2] });
  }
  // hills to the west and south-west (heightfield, no collider)
  B.ground({ minX: -900, maxX: -140, minZ: -700, maxZ: 300, res: 20, mat: 'grass', collide: false,
    height: (x, z) => { const d = Math.max(0, -140 - x); return Math.min(1, d / 260) * (40 + 30 * Math.sin(z * .011) + 20 * Math.sin(z * .027 + x * .013)) - 2; } });
}

/** cable drum lying on its side (axis along local x): flanges, wound cable, battens; collider */
export function cableDrum(B, x, y, z, ry = 0, o = {}) {
  const r = o.r || .9, w = o.w || 1.0, K = new Kit(2);
  K.push(x, y, z, ry);
  for (const s of [-1, 1]) K.cylX('p_wood_sleeper', s * w / 2 - .04, s * w / 2 + .04, r, 0, r, { seg: 18 });
  K.cylX(o.cable || 'rubber', -w / 2 + .04, w / 2 - .04, r, 0, r * .78, { seg: 16 });
  K.cylX('steel_dark', -w / 2 - .08, w / 2 + .08, r, 0, .07, { seg: 8 });
  K.col(0, 0, 0, w + .1, r * 2, r * 1.6, { surf: 'wood' });
  K.pop();
  emit(B, K, 'drum' + Math.round(x * 10) + '_' + Math.round(z * 10));
}
/** woven bulk bag (FIBC) on a pallet: o.n bags in a row along local x */
export function bigBags(B, x, y, z, ry = 0, o = {}) {
  const K = new Kit(6), n = o.n || 1;
  K.push(x, y, z, ry);
  for (let i = 0; i < n; i++) {
    const bx = (i - (n - 1) / 2) * 1.12;
    K.box('p_wood_pallet', bx, 0, 0, 1.1, .14, 1.1);
    K.box('p_geotex', bx, .14, 0, 1.0, 1.05, 1.0, { bev: .08 });
    for (const [lx, lz] of [[-.42, -.42], [.42, -.42], [-.42, .42], [.42, .42]]) K.tube('p_geotex', [[bx + lx, 1.17, lz], [bx + lx * .8, 1.36, lz * .8], [bx + lx * .6, 1.17, lz * .6]], .025, { seg: 4 });
    K.decal('stencil_fragile', bx, .7, .505, .6, .21, {});
  }
  K.col(0, 0, 0, n * 1.12, 1.2, 1.1, { surf: 'fabric' });
  K.pop();
  emit(B, K, 'bags' + Math.round(x * 10) + '_' + Math.round(z * 10));
}

// ------------------------------------------------------------------------------------------------ flush
export function finish(B) {
  const S = hb(B), M = mats(B);
  if (globalThis.__HB_PROF) console.log('[hb] containers: detailed ' + S.detail + ', cheap ' + S.cheap);
  for (const a of S.acc.values()) {
    if (!a.I.length) continue;
    const m = new BABYLON.Mesh('hb_' + a.key, B.scene), vd = new BABYLON.VertexData();
    vd.positions = new Float32Array(a.P); vd.normals = new Float32Array(a.N); vd.uvs = new Float32Array(a.U); vd.colors = new Float32Array(a.C);
    vd.indices = a.P.length / 3 > 65535 ? new Uint32Array(a.I) : new Uint16Array(a.I);
    vd.applyToMesh(m, false);
    m.material = M[a.key];
    B.mesh(m, { collide: 'none', cast: false });
  }
  S.acc.clear();
  for (const [k, K] of S.kits) emitKit(B, K, 0, 0, 0, { collide: false }, 'hb_' + k.replace(/[^a-z0-9]/gi, '_'));
  S.kits.clear();
}
