/* LIVE FIRE — Grey Falls Dam kit: map-specific helpers and prefabs used by js/maps/defs/dam.js (owned by the dam map).
   Exports (all take the MapBuilder B; coordinates are WORLD metres unless a B.push frame is active, which they respect):
     rng(seed)                          mulberry32
     lwall(B, x0, z0, x1, z1, o)        wall in horizontal material layers, openings measured from the wall base
     rail(B, x0, z0, x1, z1, y, o)      steel handrail (posts, rails, toe board) with a movement-only collider (1.25 m: no mantle)
     fence(B, x0, z0, x1, z1, o)        chain-link fence prop along a line (o.barbed, o.h)
     slope(B, x0, x1, z0, z1, y0, y1, mat, o)   a sloped quad (y0 at z0, y1 at z1) with world-scale UVs (road surface on a ramp)
     decal(B, atlas, slot, x, y, z, w, h, o)    quad from the dam atlases ('stain' alpha blend, 'sign' alpha test); o.face n|s|e|w|u
     finish(B)                          flushes the decal quads (call at the end of build)
     genUnit, transformer, fireWall, lineGantry, gantryCrane, radialGates, pylon, pine stand-ins ... (see below)
   Canvas materials are created once per scene (original artwork, fictional names: "Grey Falls Hydro"). */
import { Kit, emitKit } from './props/kit.js';

const TAU = Math.PI * 2;
export function rng(seed) { let a = seed >>> 0 || 1; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// ------------------------------------------------------------------------------------------------ walls, rails, fences
/** o = { y, t, layers: [{ h, mat, mat2, end }], openings: [{ at, w, y, h, glass, frame }] } */
export function lwall(B, x0, z0, x1, z1, o) {
  let lb = 0;
  for (const L of o.layers) {
    const ops = [];
    for (const op of o.openings || []) {
      const a = Math.max(op.y || 0, lb), b = Math.min((op.y || 0) + op.h, lb + L.h);
      if (b - a > .01) ops.push({ at: op.at, w: op.w, y: a - lb, h: b - a, glass: op.glass && a === (op.y || 0) && b === (op.y || 0) + op.h,
        frame: op.frame && a === (op.y || 0) ? op.frame : false });
    }
    B.wall(x0, z0, x1, z1, { y: (o.y || 0) + lb, h: L.h, t: o.t || .3, mat: L.mat, mat2: L.mat2 || L.mat, matEnd: L.end || L.mat, openings: ops, collide: o.collide });
    lb += L.h;
  }
}
/** steel handrail; o = { mat, h (1.05), collide (true), toe (true), ch (collider height 1.25) } */
export function rail(B, x0, z0, x1, z1, y, o = {}) {
  const L = Math.hypot(x1 - x0, z1 - z0), ry = Math.atan2(-(z1 - z0), x1 - x0), cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, m = o.mat || 'paint_yellow';
  const h = o.h || 1.05;
  B.push(cx, y, cz, ry);
  B.box(0, h - .05, 0, L, .05, .05, { mat: m, collide: false }); B.box(0, h * .5, 0, L, .04, .04, { mat: m, collide: false });
  if (o.toe !== false) B.box(0, 0, 0, L, .1, .02, { mat: m, collide: false });
  const n = Math.max(1, Math.round(L / 1.5));
  for (let i = 0; i <= n; i++) B.box(-L / 2 + i * L / n, 0, 0, .05, h, .05, { mat: m, collide: false });
  if (o.collide !== false) B.box(0, 0, 0, L, o.ch || 1.25, .1, { visible: false, ray: false, surf: 'metal' });
  B.pop();
}
export function fence(B, x0, z0, x1, z1, o = {}) {
  const L = Math.hypot(x1 - x0, z1 - z0), ry = Math.atan2(-(z1 - z0), x1 - x0);
  B.prop('fence_chainlink', (x0 + x1) / 2, o.y || 0, (z0 + z1) / 2, { ry, len: L, variant: o.barbed ? 'barbed' : 'plain', h: o.h });
}
/** sloped quad along z: corners (x0, z0, y0) .. (x1, z1, y1), UVs in world metres / tile */
export function slope(B, x0, x1, z0, z1, y0, y1, mat, o = {}) {
  const m = new BABYLON.Mesh('dam_slope', B.scene), vd = new BABYLON.VertexData();
  const t = (o.tile || 3), L = Math.hypot(z1 - z0, y1 - y0);
  vd.positions = [x0, y0, z0, x1, y0, z0, x1, y1, z1, x0, y1, z1];
  const ny = (z1 - z0) / L, nz = -(y1 - y0) / L;
  vd.normals = [0, ny, nz, 0, ny, nz, 0, ny, nz, 0, ny, nz];
  vd.uvs = [x0 / t, 0, x1 / t, 0, x1 / t, L / t, x0 / t, L / t];
  vd.indices = [0, 2, 1, 0, 3, 2];
  vd.applyToMesh(m);
  B.mesh(m, { mat, collide: 'none', cast: false });
}

// ------------------------------------------------------------------------------------------------ canvas atlases
const SCN = new WeakMap();
const ATL = 1024;
const STAIN = { leach0: [0, 0, 256, 512], leach1: [256, 0, 256, 512], oil0: [512, 0, 256, 256], oil1: [768, 0, 256, 256], tyre: [512, 256, 512, 128],
  grime: [512, 384, 512, 128], moss: [0, 512, 256, 256], crack: [256, 512, 256, 256], puddle: [512, 512, 256, 256], dust: [768, 512, 256, 256],
  rust: [0, 768, 128, 256], streak: [128, 768, 128, 256], soot: [256, 768, 256, 256], leaves: [512, 768, 256, 256], patch: [768, 768, 256, 256] };
const SIGN = { A: [0, 0, 256, 256], B: [256, 0, 256, 256], hv: [512, 0, 192, 256], arrow: [704, 0, 128, 256], chev: [832, 0, 192, 128], u1: [832, 128, 64, 128], u2: [896, 128, 64, 128], u3: [960, 128, 64, 128] };
const TEXTS = [
  ['gfh', 'GREY FALLS HYDRO', 'plate', '#1f3b57', '#f2efe6'], ['power', 'GREY FALLS POWER STATION', 'plate', '#e8e5dc', '#1f3b57'],
  ['crest', 'DAM CREST · NO UNAUTHORISED VEHICLES', 'plate', '#c9a227', '#141414'], ['gallery', 'INSPECTION GALLERY G1', 'plate', '#e8e5dc', '#1d2a36'],
  ['shaft', 'ACCESS SHAFT · STAIRS 1', 'plate', '#e8e5dc', '#1d2a36'], ['tx', 'MAIN TRANSFORMER YARD', 'plate', '#b32a1d', '#f5f2ea'],
  ['danger', 'DANGER · 132 kV · KEEP OUT', 'plate', '#b32a1d', '#f5f2ea'], ['canteen', 'STAFF CANTEEN', 'plate', '#2b6b33', '#f5f2ea'],
  ['workshop', 'MAINTENANCE WORKSHOP', 'plate', '#e8e5dc', '#1d2a36'], ['control', 'CONTROL ROOM', 'plate', '#1f3b57', '#f2efe6'],
  ['unit1', 'UNIT 1', 'paint', null, '#f4f2ea'], ['unit2', 'UNIT 2', 'paint', null, '#f4f2ea'], ['unit3', 'UNIT 3', 'paint', null, '#f4f2ea'],
  ['t1', 'GT1', 'paint', null, '#f4f2ea'], ['t2', 'GT2', 'paint', null, '#f4f2ea'], ['t3', 'GT3', 'paint', null, '#f4f2ea'],
  ['gate', 'GATE 1 · SECURITY CHECK', 'plate', '#1f3b57', '#f2efe6'], ['slow', 'SLOW', 'paint', null, '#ffffff'], ['keep', 'KEEP CLEAR', 'paint', null, '#ffffff'],
  ['max10', 'MAX 10', 'paint', null, '#ffffff'], ['hardhat', 'HARD HATS · HEARING PROTECTION', 'plate', '#2b6b33', '#f5f2ea'], ['spill', 'SPILLWAY · DANGER DEEP WATER', 'plate', '#b32a1d', '#f5f2ea'],
  ['erect', 'ERECTION BAY · CRANE OVERHEAD', 'plate', '#c9a227', '#141414'], ['relay', 'RELAY ROOM R1', 'plate', '#e8e5dc', '#1d2a36'],
  ['portal', 'GALLERY PORTAL P2', 'plate', '#e8e5dc', '#1d2a36'], ['level', 'RL 214.00', 'paint', null, '#e8e2c8'], ['assembly', 'ASSEMBLY POINT', 'plate', '#2b6b33', '#f5f2ea'],
  ['noswim', 'NO SWIMMING · STRONG CURRENTS', 'plate', '#b32a1d', '#f5f2ea'],
];
TEXTS.forEach((t, i) => { SIGN[t[0]] = [(i % 2) * 512, 256 + Math.floor(i / 2) * 48, 512, 46]; });
Object.assign(SIGN, { line: [0, 944, 512, 20], yline: [0, 976, 512, 20], hatch: [512, 944, 512, 64], dline: [0, 1000, 512, 20] });

function noiseFill(g, w, h, r, n, col, a0, a1, s0, s1) {
  for (let i = 0; i < n; i++) { g.globalAlpha = a0 + r() * (a1 - a0); g.fillStyle = col; const s = s0 + r() * (s1 - s0); g.fillRect(r() * w, r() * h, s, s); }
  g.globalAlpha = 1;
}
function blob(g, cx, cy, R, r, col, k = 1) {
  const n = 18; g.beginPath();
  for (let i = 0; i <= n; i++) { const a = i / n * TAU, rr = R * (.7 + .3 * r()) ; const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr * k; i ? g.lineTo(x, y) : g.moveTo(x, y); }
  g.closePath(); g.fillStyle = col; g.fill();
}
function radial(g, cx, cy, R, c0, c1) { const gr = g.createRadialGradient(cx, cy, 0, cx, cy, R); gr.addColorStop(0, c0); gr.addColorStop(1, c1); return gr; }
function drawStain(g) {
  const r = rng(77);
  g.clearRect(0, 0, ATL, ATL);
  // leach streaks: lime / water stains running down concrete (top = source)
  for (const [k, x0] of [['leach0', 0], ['leach1', 256]]) {
    for (let i = 0; i < 14; i++) {
      const x = x0 + 20 + r() * 216, w = 6 + r() * 26, len = 140 + r() * 360;
      const gr = g.createLinearGradient(0, 0, 0, len); gr.addColorStop(0, k === 'leach0' ? 'rgba(40,36,30,.55)' : 'rgba(225,222,210,.45)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(x, 0, w, len);
    }
  }
  const oil = (x, y, s) => { for (let i = 0; i < 6; i++) { g.fillStyle = radial(g, x + 128 + (r() - .5) * 80, y + 128 + (r() - .5) * 80, 40 + r() * 70, 'rgba(12,10,8,.55)', 'rgba(12,10,8,0)'); g.fillRect(x, y, 256, 256); } };
  oil(512, 0); oil(768, 0);
  // tyre marks
  for (let i = 0; i < 2; i++) { g.fillStyle = 'rgba(10,10,10,.35)'; for (let x = 0; x < 512; x += 3) { const y = 256 + 30 + i * 50 + Math.sin(x / 90) * 8; g.globalAlpha = .4 + .3 * r(); g.fillRect(512 + x, y, 3, 14); } }
  g.globalAlpha = 1;
  // grime band (bottom of walls: splash dirt)
  { const gr = g.createLinearGradient(0, 384 + 128, 0, 384); gr.addColorStop(0, 'rgba(40,34,26,.7)'); gr.addColorStop(1, 'rgba(40,34,26,0)'); g.fillStyle = gr; g.fillRect(512, 384, 512, 128); noiseFill(g, 512, 40, r, 600, 'rgba(30,26,20,1)', .1, .4, 1, 4); }
  // moss / algae
  for (let i = 0; i < 40; i++) { g.fillStyle = radial(g, 128 + (r() - .5) * 170, 640 + (r() - .5) * 170, 14 + r() * 40, 'rgba(48,62,30,.5)', 'rgba(48,62,30,0)'); g.fillRect(0, 512, 256, 256); }
  // crack
  g.strokeStyle = 'rgba(15,13,10,.8)'; g.lineWidth = 2;
  for (let k = 0; k < 3; k++) { g.beginPath(); let x = 256 + 30 + r() * 60, y = 520 + r() * 40; g.moveTo(x, y); for (let i = 0; i < 14; i++) { x += 6 + r() * 14; y += (r() - .3) * 22; g.lineTo(x, y); } g.stroke(); }
  // puddle
  for (let i = 0; i < 4; i++) blob(g, 640 + (r() - .5) * 60, 640 + (r() - .5) * 60, 50 + r() * 40, r, 'rgba(18,20,22,.35)', .7);
  // dust
  for (let i = 0; i < 10; i++) { g.fillStyle = radial(g, 896 + (r() - .5) * 100, 640 + (r() - .5) * 100, 60 + r() * 50, 'rgba(120,110,95,.3)', 'rgba(120,110,95,0)'); g.fillRect(768, 512, 256, 256); }
  // rust run
  { const gr = g.createLinearGradient(0, 768, 0, 1024); gr.addColorStop(0, 'rgba(110,52,20,.75)'); gr.addColorStop(1, 'rgba(110,52,20,0)'); g.fillStyle = gr; for (let i = 0; i < 7; i++) g.fillRect(10 + r() * 100, 768, 4 + r() * 10, 120 + r() * 130); }
  { const gr = g.createLinearGradient(0, 768, 0, 1024); gr.addColorStop(0, 'rgba(20,20,20,.6)'); gr.addColorStop(1, 'rgba(20,20,20,0)'); g.fillStyle = gr; for (let i = 0; i < 9; i++) g.fillRect(140 + r() * 100, 768, 3 + r() * 9, 90 + r() * 160); }
  // soot
  for (let i = 0; i < 8; i++) { g.fillStyle = radial(g, 384 + (r() - .5) * 90, 896 + (r() - .5) * 90, 40 + r() * 60, 'rgba(10,10,10,.5)', 'rgba(10,10,10,0)'); g.fillRect(256, 768, 256, 256); }
  // leaves / litter
  for (let i = 0; i < 70; i++) { g.save(); g.translate(512 + 20 + r() * 216, 768 + 20 + r() * 216); g.rotate(r() * TAU); g.fillStyle = ['#5a4424', '#6d5a2a', '#3e3a22', '#7a6a40'][i % 4]; g.globalAlpha = .85; g.beginPath(); g.ellipse(0, 0, 6 + r() * 5, 3 + r() * 2, 0, 0, TAU); g.fill(); g.restore(); }
  g.globalAlpha = 1;
  // patch (repaired concrete)
  g.fillStyle = 'rgba(150,146,136,.55)'; g.fillRect(768 + 40, 768 + 50, 170, 140); g.strokeStyle = 'rgba(50,46,40,.5)'; g.lineWidth = 3; g.strokeRect(768 + 40, 768 + 50, 170, 140);
}
function stencil(g, ch, w, h, col) {
  g.fillStyle = col; g.font = 'bold ' + Math.round(h * .82) + 'px Arial Black, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(ch, w / 2, h / 2 + h * .04);
}
function drawSign(g) {
  g.clearRect(0, 0, ATL, ATL);
  const at = (k, fn) => { const [x, y, w, h] = SIGN[k]; g.save(); g.translate(x, y); g.beginPath(); g.rect(0, 0, w, h); g.clip(); fn(w, h); g.restore(); };
  for (const k of ['A', 'B']) at(k, (w, h) => {
    g.fillStyle = '#f2c230'; g.beginPath(); g.arc(w / 2, h / 2, w * .46, 0, TAU); g.fill(); g.lineWidth = 10; g.strokeStyle = '#141414'; g.stroke();
    stencil(g, k, w, h, '#141414');
  });
  at('hv', (w, h) => {
    g.fillStyle = '#f5f2ea'; g.fillRect(0, 0, w, h); g.fillStyle = '#f2c230'; g.beginPath(); g.moveTo(w / 2, 14); g.lineTo(w - 14, 120); g.lineTo(14, 120); g.closePath(); g.fill();
    g.lineWidth = 6; g.strokeStyle = '#141414'; g.stroke();
    g.fillStyle = '#141414'; g.beginPath(); g.moveTo(w / 2 + 8, 40); g.lineTo(w / 2 - 16, 82); g.lineTo(w / 2 + 2, 82); g.lineTo(w / 2 - 10, 112); g.lineTo(w / 2 + 18, 70); g.lineTo(w / 2, 70); g.closePath(); g.fill();
    g.fillStyle = '#b32a1d'; g.fillRect(0, 140, w, 60); g.fillStyle = '#f5f2ea'; g.font = 'bold 40px Arial'; g.textAlign = 'center'; g.fillText('DANGER', w / 2, 184);
    g.fillStyle = '#141414'; g.font = 'bold 24px Arial'; g.fillText('HIGH VOLTAGE', w / 2, 232);
  });
  at('arrow', (w, h) => { g.fillStyle = '#f4f2ea'; g.beginPath(); g.moveTo(w / 2, 6); g.lineTo(w - 8, 90); g.lineTo(w * .66, 90); g.lineTo(w * .66, h - 6); g.lineTo(w * .34, h - 6); g.lineTo(w * .34, 90); g.lineTo(8, 90); g.closePath(); g.fill(); });
  at('chev', (w, h) => { for (let i = -2; i < 8; i++) { g.fillStyle = i % 2 ? '#141414' : '#f2c230'; g.beginPath(); g.moveTo(i * 40, 0); g.lineTo(i * 40 + 40, 0); g.lineTo(i * 40 + 80, h); g.lineTo(i * 40 + 40, h); g.closePath(); g.fill(); } });
  for (const [k, n] of [['u1', '1'], ['u2', '2'], ['u3', '3']]) at(k, (w, h) => stencil(g, n, w, h, '#f4f2ea'));
  for (const [k, txt, kind, bg, fg] of TEXTS) at(k, (w, h) => {
    if (kind === 'plate') { g.fillStyle = bg; g.fillRect(0, 0, w, h); g.strokeStyle = fg; g.lineWidth = 3; g.strokeRect(5, 5, w - 10, h - 10); }
    g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
    let fs = kind === 'plate' ? 30 : 44; g.font = 'bold ' + fs + 'px Arial, sans-serif';
    while (g.measureText(txt).width > w - 30 && fs > 12) { fs -= 2; g.font = 'bold ' + fs + 'px Arial, sans-serif'; }
    g.fillText(txt, w / 2, h / 2 + 2);
  });
  const r = rng(5);
  const worn = (k, col) => at(k, (w, h) => { g.fillStyle = col; g.fillRect(0, 2, w, h - 4); g.globalCompositeOperation = 'destination-out'; noiseFill(g, w, h, r, 500, '#000', .2, .9, 1, 4); g.globalCompositeOperation = 'source-over'; });
  worn('line', '#e9e7df'); worn('yline', '#e2b52a');
  at('dline', (w, h) => { g.fillStyle = '#e9e7df'; for (let x = 0; x < w; x += 128) g.fillRect(x, 2, 72, h - 4); g.globalCompositeOperation = 'destination-out'; noiseFill(g, w, h, r, 400, '#000', .2, .9, 1, 4); g.globalCompositeOperation = 'source-over'; });
  at('hatch', (w, h) => { g.fillStyle = '#141414'; g.fillRect(0, 0, w, h); g.fillStyle = '#e2b52a'; for (let x = -h; x < w + h; x += 48) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 24, 0); g.lineTo(x + 24 + h, h); g.lineTo(x + h, h); g.closePath(); g.fill(); } g.globalCompositeOperation = 'destination-out'; noiseFill(g, w, h, r, 300, '#000', .1, .6, 1, 3); g.globalCompositeOperation = 'source-over'; });
}
function tex(scene, name, w, h, draw) {
  const dt = new BABYLON.DynamicTexture(name, { width: w, height: h }, scene, true);
  const g = dt.getContext(); draw(g, w, h);
  dt.hasAlpha = true; dt.update(true);
  dt.wrapU = BABYLON.Texture.CLAMP_ADDRESSMODE; dt.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE; dt.anisotropicFilteringLevel = 4;
  return dt;
}
function mats(B) {
  const sc = B.scene; let s = SCN.get(sc); if (s) return s;
  s = {}; SCN.set(sc, s); sc.onDisposeObservable.addOnce(() => SCN.delete(sc));
  const PBR = BABYLON.PBRMaterial;
  const stain = new PBR('dam_stain', sc);
  stain.albedoTexture = tex(sc, 'dam_stain_tex', ATL, ATL, drawStain); stain.useAlphaFromAlbedoTexture = true;
  stain.transparencyMode = PBR.PBRMATERIAL_ALPHABLEND; stain.disableDepthWrite = true; stain.metallic = 0; stain.roughness = .75; stain.zOffset = -3;
  const sign = new PBR('dam_sign', sc);
  sign.albedoTexture = tex(sc, 'dam_sign_tex', ATL, ATL, drawSign); sign.useAlphaFromAlbedoTexture = true;
  sign.transparencyMode = PBR.PBRMATERIAL_ALPHATEST; sign.alphaCutOff = .45; sign.metallic = 0; sign.roughness = .6; sign.zOffset = -2;
  for (const m of [stain, sign]) m.metadata = { lf: m.name, surf: 'concrete', map: 'dam' };
  s.stain = stain; s.sign = sign;
  return s;
}
function st(B) { if (!B._dam) B._dam = { acc: new Map() }; return B._dam; }
const TILE = 64;
function qacc(B, key, x, z) {
  const S = st(B), k = key + '|' + Math.floor(x / TILE) + '|' + Math.floor(z / TILE);
  let a = S.acc.get(k); if (!a) { a = { key, P: [], N: [], U: [], C: [], I: [] }; S.acc.set(k, a); }
  return a;
}
const W = { x: 0, y: 0, z: 0 };
function emitQuad(B, key, c, R, U, N, w, h, uv, col) {
  const a = qacc(B, key, c[0], c[2]), base = a.P.length / 3, hw = w / 2, hh = h / 2;
  const pts = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]], uvs = [[uv[0], uv[1]], [uv[2], uv[1]], [uv[2], uv[3]], [uv[0], uv[3]]];
  const T = B.T, cs = T.c, sn = T.s, rot = v => [v[0] * cs + v[2] * sn, v[1], -v[0] * sn + v[2] * cs], n = rot(N), P = [];
  for (let i = 0; i < 4; i++) {
    B.toWorld(c[0] + R[0] * pts[i][0] + U[0] * pts[i][1], c[1] + R[1] * pts[i][0] + U[1] * pts[i][1], c[2] + R[2] * pts[i][0] + U[2] * pts[i][1], W);
    P.push([W.x, W.y, W.z]); a.P.push(W.x, W.y, W.z); a.N.push(n[0], n[1], n[2]); a.U.push(uvs[i][0], uvs[i][1]);
    a.C.push(col ? col[0] : 1, col ? col[1] : 1, col ? col[2] : 1, col && col[3] != null ? col[3] : 1);
  }
  const ux = P[1][0] - P[0][0], uy = P[1][1] - P[0][1], uz = P[1][2] - P[0][2], vx = P[2][0] - P[0][0], vy = P[2][1] - P[0][1], vz = P[2][2] - P[0][2];
  const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
  if (cx * n[0] + cy * n[1] + cz * n[2] < 0) a.I.push(base, base + 1, base + 2, base, base + 2, base + 3);
  else a.I.push(base, base + 2, base + 1, base, base + 3, base + 2);
}
const FACES = { n: [[-1, 0, 0], [0, 1, 0], [0, 0, 1]], s: [[1, 0, 0], [0, 1, 0], [0, 0, -1]], e: [[0, 0, 1], [0, 1, 0], [1, 0, 0]], w: [[0, 0, -1], [0, 1, 0], [-1, 0, 0]], u: [[1, 0, 0], [0, 0, 1], [0, 1, 0]] };
const ry3 = (v, a) => { const c = Math.cos(a), s = Math.sin(a); return [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c]; };
function slotUV(atlas, slot) {
  const r = (atlas === 'stain' ? STAIN : SIGN)[slot];
  if (!r) throw new Error('dam: unknown ' + atlas + ' slot ' + slot);
  return [(r[0] + 1.5) / ATL, 1 - (r[1] + r[3] - 1.5) / ATL, (r[0] + r[2] - 1.5) / ATL, 1 - (r[1] + 1.5) / ATL];
}
/** atlas quad (x, y, z = centre); face = the direction the quad faces; o.ry turns it, o.col tints (rgba), o.flip mirrors u */
export function decal(B, atlas, slot, x, y, z, w, h, o = {}) {
  const f = FACES[o.face || 'u'], a = o.ry || 0, uv = slotUV(atlas, slot);
  if (o.flip) { const t = uv[0]; uv[0] = uv[2]; uv[2] = t; }
  emitQuad(B, atlas, [x, y, z], ry3(f[0], a), ry3(f[1], a), ry3(f[2], a), w, h, uv, o.col);
}
export function finish(B) {
  const S = st(B), M = mats(B);
  for (const a of S.acc.values()) {
    if (!a.I.length) continue;
    const m = new BABYLON.Mesh('dam_' + a.key, B.scene), vd = new BABYLON.VertexData();
    vd.positions = new Float32Array(a.P); vd.normals = new Float32Array(a.N); vd.uvs = new Float32Array(a.U); vd.colors = new Float32Array(a.C);
    vd.indices = a.P.length / 3 > 65535 ? new Uint32Array(a.I) : new Uint16Array(a.I);
    vd.applyToMesh(m, false);
    m.material = M[a.key]; m.hasVertexAlpha = a.key === 'stain';
    B.mesh(m, { collide: 'none', cast: false });
  }
  S.acc.clear();
}

// ------------------------------------------------------------------------------------------------ prefabs (Kit based)
const emit = (B, K, key, o = {}) => emitKit(B, K, 0, 0, 0, o, 'dam_' + key);
export { Kit, emitKit, emit };

const ONCE = new WeakMap();
/** build a kit once per builder (key) and place copies as thin instances */
function inst(B, key, build, x, y, z, ry = 0, o = {}) {
  let m = ONCE.get(B); if (!m) { m = new Map(); ONCE.set(B, m); }
  let K = m.get(key); if (!K) { K = build(); m.set(key, K); }
  return emitKit(B, K, x, y, z, { ry, s: o.s, inst: o.inst !== false, collide: o.collide !== false, cast: o.cast }, 'dam_' + key);
}

/** generator unit detail (stator ribs, top deck rail, exciter cap, pipes, hazard ring); colliders come from the map's cylinders */
export function genUnit(B, x, z) {
  return inst(B, 'gen', () => {
    const K = new Kit(3), P = 'p_coat_blue', S = 'steel_dark';
    K.lathe('hazard', [[3.95, .004], [3.62, .004]], { seg: 32 });
    K.cyl(S, 0, .33, 0, 3.56, .05, { seg: 32 });
    for (let i = 0; i < 20; i++) { const a = i / 20 * TAU; K.push(Math.sin(a) * 3.12, .35, Math.cos(a) * 3.12, a); K.box(P, 0, 0, 0, .14, 2.05, .2); K.pop(); }
    K.cyl(S, 0, .35, 0, 3.17, .08, { seg: 32 }); K.cyl(S, 0, 2.33, 0, 3.17, .1, { seg: 32 });
    K.cyl('p_coat_slate', 0, 2.4, 0, 3.0, .03, { seg: 32 });
    for (let i = 0; i < 18; i++) { const a = i / 18 * TAU; K.box('steel', Math.sin(a) * 2.85, 2.4, Math.cos(a) * 2.85, .05, 1.0, .05); }
    K.lathe('paint_yellow', [[2.86, 3.36], [2.86, 3.42], [2.83, 3.42], [2.83, 3.36]], { seg: 32 });
    K.lathe('paint_yellow', [[2.86, 2.86], [2.86, 2.9], [2.83, 2.9], [2.83, 2.86]], { seg: 32 });
    K.lathe('p_coat_white', [[1.12, 3.7], [.95, 3.95], [.4, 4.05], [0, 4.07]], { seg: 18 });
    K.box(S, 1.1, 2.4, -.4, .6, .9, .8); K.box('p_screen', 1.41, 2.75, -.4, .01, .3, .4);
    for (const a of [.6, 2.2, 4.1]) K.tube('p_coat_red', [[Math.sin(a) * 3.3, 0, Math.cos(a) * 3.3], [Math.sin(a) * 3.3, 2.2, Math.cos(a) * 3.3], [Math.sin(a) * 2.6, 2.5, Math.cos(a) * 2.6]], .06, { seg: 8 });
    return K;
  }, x, 0, z, 0, { collide: false });
}

/** GSU transformer on its bund (origin = bund top centre, long axis x): tank, radiator banks, HV/LV bushings, conservator,
 *  fans, marshalling cabinet, deluge ring; colliders included */
export function transformer(B, x, y, z) {
  return inst(B, 'gsu', () => {
    const K = new Kit(5), T = 'p_coat_slate', S = 'steel_dark', G = 'p_galv';
    K.box(S, 0, 0, 0, 5.4, .3, 3.6);
    K.box(T, 0, .3, 0, 5, 3.3, 3.2, { bev: .04 }); K.box(T, 0, 3.6, 0, 5.2, .14, 3.4);
    for (let i = 0; i < 6; i++) for (const sz of [-1, 1]) K.box(T, -2.1 + i * .84, .4, sz * 1.64, .14, 3.1, .12);
    for (const sx of [-1, 1]) {                       // radiator banks on the ends
      for (let i = 0; i < 9; i++) K.box(G, sx * 3.15, .7, -1.3 + i * .32, .9, 2.6, .05);
      K.cylZ(G, -1.45, 1.45, sx * 3.15, 3.4, .11); K.cylZ(G, -1.45, 1.45, sx * 3.15, .6, .11);
      K.box(S, sx * 2.62, .5, 0, .2, 3.0, .3);
      for (const fz of [-.8, .8]) { K.cylX(S, sx * 3.55, sx * 3.75, .3, fz, .38, { seg: 14 }); }
    }
    const bush = (bx, bz, h, r) => { const prof = []; for (let i = 0; i <= 10; i++) { const yy = i / 10 * h; prof.push([r * (i % 2 ? 1.5 : 1), yy]); } prof.push([r * .6, h + .1]); K.lathe('p_porcelain', prof, { seg: 10, x: bx, y: 3.74, z: bz }); K.cyl('p_alu', bx, 3.74 + h + .08, bz, r * .7, .18, { seg: 8 }); };
    for (const bx of [-1.4, 0, 1.4]) bush(bx, -.7, 2.0, .13);
    for (const bx of [-1.1, -.2, .7]) bush(bx, .9, .8, .09);
    K.cylX(T, -1.6, 1.6, 5.2, .9, .5, { seg: 16 }); for (const sx of [-1.2, 1.2]) K.box(S, sx, 3.74, .9, .12, 1.0, .12);
    K.tube(G, [[0, 4.7, .9], [0, 4.2, .5], [0, 3.74, .3]], .05, { seg: 6 });
    K.box(T, 1.2, .3, -1.85, 1.0, 1.8, .5); K.box(S, 1.2, 1.1, -2.11, .9, .02, .02);
    K.decal('haz_flame', -.4, 2.4, -1.61, .4, .4, { face: 's' });
    // deluge ring (red pipe on posts)
    const rr = [[-3.9, -2.4], [3.9, -2.4], [3.9, 2.4], [-3.9, 2.4], [-3.9, -2.4]].map(([a, b]) => [a, 4.1, b]);
    K.tube('p_coat_red', rr, .045, { seg: 6 });
    for (const [a, b] of [[-3.9, -2.4], [3.9, -2.4], [3.9, 2.4], [-3.9, 2.4]]) K.box('p_coat_red', a, 0, b, .07, 4.1, .07);
    K.col(0, 0, 0, 5.4, 3.75, 3.6, { surf: 'metal' }); K.col(-3.15, .5, 0, 1.2, 3.0, 2.9, { surf: 'metal' }); K.col(3.15, .5, 0, 1.2, 3.0, 2.9, { surf: 'metal' });
    K.col(1.2, .3, -1.85, 1.0, 1.8, .5, { surf: 'metal' });
    return K;
  }, x, y, z);
}

/** lattice gantry column (square, w wide, h tall) and beam pieces built into K */
function lattice(K, mat, x, z, w, h, o = {}) {
  const hw = w / 2, a = .09;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) K.box(mat, x + sx * hw, 0, z + sz * hw, a, h, a);
  const n = Math.max(2, Math.round(h / w));
  for (let i = 0; i <= n; i++) { const yy = i * h / n; K.box(mat, x, yy, z - hw, w, a, a); K.box(mat, x, yy, z + hw, w, a, a); K.box(mat, x - hw, yy, z, a, a, w); K.box(mat, x + hw, yy, z, a, a, w); }
  const L = Math.hypot(w, h / n), ang = Math.atan2(h / n, w);
  for (let i = 0; i < n; i++) {
    const yy = (i + .5) * h / n, s = i % 2 ? 1 : -1;
    for (const sz of [-1, 1]) { K.push(x, yy, z + sz * hw, 0, 0, s * ang); K.box(mat, 0, -a / 2, 0, L, a * .7, a * .7); K.pop(); }
    for (const sx of [-1, 1]) { K.push(x + sx * hw, yy, z, 0, s * ang, 0); K.box(mat, 0, -a / 2, 0, a * .7, a * .7, L); K.pop(); }
  }
}
/** substation line gantry: lattice columns at xs, a lattice beam at height h, insulator strings and droppers */
export function lineGantry(B, xs, z, h) {
  const K = new Kit(7), G = 'p_galv', x0 = xs[0], x1 = xs[xs.length - 1];
  for (const x of xs) { lattice(K, G, x, z, .7, h); K.col(x, 0, z, .8, h, .8, { surf: 'metal' }); K.box('concrete', x, -.02, z, 1.2, .25, 1.2); }
  for (const yy of [h - .1, h - 1.0]) for (const sz of [-1, 1]) K.box(G, (x0 + x1) / 2, yy, z + sz * .45, x1 - x0, .1, .1);
  for (let x = x0; x < x1 - .1; x += 1.0) for (const sz of [-1, 1]) { K.push(x + .5, h - .55, z + sz * .45, 0, 0, .73); K.box(G, 0, -.04, 0, 1.25, .07, .07); K.pop(); }
  for (let i = 0; i < xs.length - 1; i++) for (const k of [-1, 0, 1]) {
    const cx = (xs[i] + xs[i + 1]) / 2 + k * 2.2;
    for (let j = 0; j < 7; j++) K.cyl('p_porcelain', cx, h - 1.1 - j * .2, z, j % 2 ? .1 : .14, .12, { seg: 8 });
    K.box(S_D, cx, h - 2.7, z, .1, .2, .1);
  }
  emitKit(B, K, 0, 0, 0, { collide: true }, 'dam_gantry');
}
const S_D = 'steel_dark';

/** overhead travelling crane across the hall (span along z), at x; rails at zA / zB, rail top yR */
export function hallCrane(B, x, zA, zB, yR) {
  const K = new Kit(8), Y = 'p_coat_yellow', S = 'steel_dark', span = zB - zA, zc = (zA + zB) / 2;
  for (const dx of [-1.1, 1.1]) { K.box(Y, x + dx, yR + .25, zc, .7, 1.4, span - .3, { bev: .02 }); K.box(S, x + dx, yR + 1.65, zc, .74, .05, span - .3); }
  for (const zz of [zA + .35, zB - .35]) { K.box(Y, x, yR, zz, 4.6, .8, .7); for (const dx of [-1.8, 1.8]) K.cylX(S, x + dx - .25, x + dx + .25, yR + .1, zz, .22, { seg: 10 }); }
  K.box(S, x, yR + 1.7, zc - 3, 3.0, .9, 2.4); K.box(Y, x, yR + 2.6, zc - 3, 3.0, .08, 2.4);
  K.cylX(S, x - 1, x + 1, yR + 2.1, zc - 3, .45, { seg: 14 });
  for (const dz of [-.3, .3]) K.box('steel', x, yR - 3.6, zc - 3 + dz, .03, 5.4, .03);
  K.box(Y, x, yR - 4.1, zc - 3, .5, .6, .7); K.tube(S, [[x, yR - 4.1, zc - 3], [x, yR - 4.6, zc - 3], [x + .25, yR - 4.8, zc - 3], [x + .3, yR - 4.5, zc - 3]], .06, { seg: 8 });
  K.box(Y, x - 1.8, yR + .5, zA + 2.5, .8, 1.2, 1.2); K.box('p_glass_dark', x - 1.8, yR + .75, zA + 1.88, .7, .7, .02);
  K.decal('stencil_explo', x + 1.48, yR + .95, zc + 4, .9, .3, { face: 'e' });
  emitKit(B, K, 0, 0, 0, { collide: false }, 'dam_crane');
}

/** crest lamp post: concrete plinth, galvanised pole, arm over the road (toward +z), luminaire with an emissive lens */
export function lampPost(B, x, y, z, ry = 0) {
  return inst(B, 'lamp', () => {
    const K = new Kit(9), G = 'p_galv';
    K.box('concrete', 0, 0, 0, .4, .35, .4); K.cyl(G, 0, .35, 0, .08, 6.6, { r2: .055, seg: 8 });
    K.tube(G, [[0, 6.8, 0], [0, 7.05, .4], [0, 7.1, 1.2]], .045, { seg: 6 });
    K.box('p_coat_slate', 0, 7.0, 1.4, .3, .14, .7); K.box('emissive_white', 0, 6.99, 1.4, .24, .02, .55);
    K.noCast('emissive_white');
    K.col(0, 0, 0, .3, 6.8, .3, { surf: 'metal' });
    return K;
  }, x, y, z, ry);
}

/** conifer stand-in for distant forests: trunk + 3 stacked cones (s = height scale) */
export function conifer(B, x, y, z, s = 1, kind = 0) {
  return inst(B, 'fir' + kind, () => {
    const K = new Kit(11 + kind), L = kind ? 'p_hedge_core' : 'p_leaf_core';
    K.cyl('p_bark', 0, -.5, 0, .22, 3.5, { seg: 6 });
    K.lathe(L, [[2.4, 1.6], [1.5, 4.5], [0, 6.5]], { seg: 7 });
    K.lathe(L, [[1.9, 4.2], [1.1, 7.2], [0, 9]], { seg: 7 });
    K.lathe(L, [[1.3, 7.0], [.6, 9.4], [0, 11.2]], { seg: 6 });
    return K;
  }, x, y, z, 0, { collide: false, cast: false, s });
}

/** spillway east of the playable crest (out of bounds): piers, radial gates, hoist houses, bridge deck, chute, basin */
export function spillway(B, o) {
  const K = new Kit(13), C = 'concrete', x0 = o.x0, x1 = o.x1, CR = o.crest, zc = o.z0;   // zc = downstream crest edge
  const bays = o.bays || 4, bw = (x1 - x0) / bays;
  for (let i = 0; i <= bays; i++) {
    const px = x0 + i * bw;
    K.box(C, px, CR - 14, zc - 8, 2.4, 14, 16, { bev: .05 });                         // pier (upstream nose to the north)
    K.cyl(C, px, CR - 14, zc + 8, 1.2, 14, { seg: 12 });
    K.box('concrete_panels', px, CR, zc + 4.5, 3, 3.6, 4.5);                          // hoist house
    K.box('p_coat_slate', px, CR + 3.6, zc + 4.5, 3.3, .25, 4.8);
    K.box('p_glass_dark', px + 1.51, CR + 1.4, zc + 4.5, .02, 1, 2);
  }
  K.box(C, (x0 + x1) / 2, CR - 1.2, zc + 4, x1 - x0 + 2.4, 1.2, 8.8);                 // road bridge over the piers
  K.box('asphalt', (x0 + x1) / 2, CR, zc + 4, x1 - x0 + 2.4, .02, 7.6);
  for (const zz of [zc + .2, zc + 8.2]) K.box('p_galv', (x0 + x1) / 2, CR, zz, x1 - x0 + 2.4, 1.1, .06);
  for (let i = 0; i < bays; i++) {                                                     // radial gates: curved skin + arms
    const gx = x0 + (i + .5) * bw, gw = bw - 2.6, R = 11, cy = CR - 6, cz = zc - 14;
    const n = 9;
    for (let j = 0; j < n; j++) {
      const a0 = -.32 + j * .64 / n, a1 = a0 + .64 / n, am = (a0 + a1) / 2, yy = cy + Math.sin(am) * R, zz = cz + Math.cos(am) * R;
      K.push(gx, yy, zz, 0, -am, 0); K.box('p_coat_slate', 0, -R * .64 / n / 2, 0, gw, R * .64 / n + .02, .12); K.pop();
    }
    for (const sx of [-1, 1]) { K.push(gx + sx * (gw / 2 - .4), cy, cz, 0, 0, 0); K.box('p_coat_slate', 0, -.2, R / 2, .3, .4, R); K.pop(); }
    K.box('p_hedge_core', gx, cy - 4, cz + R - 1.2, gw, .02, 3);                         // wet dark sill
  }
  // chute: ogee crest then the sloped chute down to the stilling basin
  const zA = zc - 6, zB = o.zBasin, yA = CR - 5, yB = o.yBasin;
  K.quad(C, [x1 + 1.2, yA, zA], [x0 - 1.2, yA, zA], [x0 - 1.2, yB, zB], [x1 + 1.2, yB, zB], { uv: [0, 0, (x1 - x0) / 2.5, (zA - zB) / 2.5] });
  K.box('concrete', x1 + 2.2, yB - 2, (zA + zB) / 2, 2, CR - yB + 2, zA - zB);          // far training wall
  emitKit(B, K, 0, 0, 0, { collide: false, cast: true }, 'dam_spill');
}
