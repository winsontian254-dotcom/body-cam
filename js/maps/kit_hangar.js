/* LIVE FIRE — hangar kit: custom prefabs for Terminal West (js/maps/defs/hangar.js), built with the prop Kit
   (js/maps/props/kit.js) and the MapBuilder. Original geometry and art only (fictional operator "Westair Regional").
   Exports:
     signMat(B, kind)                      per-scene materials over the hangar sign atlas (canvas): 'sign' (alpha-tested), 'glow'
                                           (emissive: screens, lit signs, lit windows), 'stain' (alpha-blended grime / oil)
     sign(B, slot, x, y, z, w, h, o)       a quad of the atlas centred at (x, y, z): o = { ry, face: 'n'|'s'|'e'|'w'|'u', glow, stain, lit }
     refueler(B, x, z, o)                  aviation refuelling truck (cab + tank + hose reel), nose +z
     tug(B, x, z, o)                       baggage tractor with a canopy, nose +z
     dolly(B, x, z, o)                     baggage cart (bags, curtain frame), tow bar +z; o.uld = a container dolly with an LD3
     uld(B, x, y, z, o)                    LD3 unit load device (contoured aluminium container, curtain door +z)
     stairsTruck(B, x, z, o)               passenger stairs truck: walkable flight climbing +z to a 3.2 m platform
     beltLoader(B, x, z, o)                belt loader (inclined conveyor on a small truck), belt rising +z
     belt(B, x0, z0, x1, z1, y, o)         straight baggage conveyor (bed top at y) on legs, with side guards
     carousel(B, x, z, L, W, o)            flat-plate make-up carousel (an oval island), long axis along x
     controlTower(B, x, z, o)              ATC tower shaft + glazed cab (out-of-reach landmark), collider on the shaft
     engineStand(B, x, z, o)               spare turbofan on a transport cradle, axis along z
     toolChest(B, x, z, o)                 red rolling tool cabinet with a top box
     wingDock(B, x, z, o)                  aluminium maintenance platform with a stair (deck at o.h), stair climbing +z
     edgeLights(B, pts, o)                 taxiway / runway edge lights (thin instances), o.color 'blue'|'white'|'amber'|'red'
     windsock(B, x, z, o)                  windsock mast with an orange-white sock
     skyline(B, x0, z0, x1, z1, o)         daytime out-of-bounds blocks (offices, sheds) with window bands
     rail(B, x0, z0, x1, z1, y, o)         handrail along a line (posts, top + knee rail), low ray-false collider
   All placement follows the builder convention: y = bottom, front = +z, turned by o.ry. */
import { Kit, emitKit } from './props/kit.js';
import { wheel, railing, ladder, louvres } from './props/parts.js';

const PI = Math.PI;

// ------------------------------------------------------------------------------------------------ sign atlas
const AW = 1024, AH = 2048;
const SANS = 'Arial, Helvetica, "Liberation Sans", sans-serif', MONO = '"Courier New", "Liberation Mono", monospace';
const SLOTS = {}, DRAW = [];
let packX = 0, packY = 0, rowH = 0;
function slot(name, w, h, fn) {
  if (packX + w > AW) { packX = 0; packY += rowH; rowH = 0; }
  if (packY + h > AH) throw new Error('hangar sign atlas full at ' + name);
  SLOTS[name] = [packX, packY, w, h]; DRAW.push([name, fn]);
  packX += w; rowH = Math.max(rowH, h);
}
function txt(g, s, x, y, size, o = {}) {
  g.font = (o.weight || 'bold') + ' ' + size + 'px ' + (o.font || SANS);
  g.textAlign = o.align || 'center'; g.textBaseline = 'middle'; g.fillStyle = o.color || '#fff';
  const m = g.measureText(s).width;
  if (o.maxW && m > o.maxW) { g.save(); g.translate(x, y); g.scale(o.maxW / m, 1); g.fillText(s, 0, 0); g.restore(); } else g.fillText(s, x, y);
}
function rnd(seed) { let a = seed >>> 0 || 1; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function dirt(g, w, h, seed, amt = .2) {
  const r = rnd(seed);
  for (let i = 0; i < 90; i++) { g.fillStyle = `rgba(35,30,24,${(r() * amt).toFixed(3)})`; g.fillRect(r() * w, r() * h, 1 + r() * 5, 1 + r() * 3); }
}
function wing(g, x, y, s, col) {   // Westair mark: a swept wing over a horizon line
  g.save(); g.translate(x, y); g.fillStyle = col;
  g.beginPath(); g.moveTo(-s * .5, s * .12); g.lineTo(s * .45, -s * .38); g.lineTo(s * .18, -s * .02); g.lineTo(s * .5, -s * .02); g.lineTo(s * .1, s * .12); g.closePath(); g.fill();
  g.fillRect(-s * .5, s * .22, s, s * .07);
  g.restore();
}
const panel = (bg, fg, title, sub, seed) => (g, w, h) => {
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  wing(g, 62, h / 2, 76, fg);
  txt(g, title, w / 2 + 44, sub ? h * .4 : h / 2, sub ? 48 : 56, { color: fg, maxW: w - 150 });
  if (sub) txt(g, sub, w / 2 + 44, h * .76, 21, { color: fg, maxW: w - 150, weight: 'normal' });
  dirt(g, w, h, seed, .12);
};
slot('twest', 1024, 128, (g, w, h) => {
  g.fillStyle = '#16365c'; g.fillRect(0, 0, w, h); g.fillStyle = '#f2b51c'; g.fillRect(0, h - 14, w, 14);
  wing(g, 84, h / 2 - 6, 96, '#f4f1e8'); txt(g, 'TERMINAL WEST', w / 2 + 40, h / 2 - 4, 84, { color: '#f4f1e8', maxW: w - 200 });
});
slot('hangar2', 1024, 256, (g, w, h) => {   // painted on the cladding: no background
  txt(g, 'HANGAR 2', w / 2, h * .38, 150, { color: 'rgba(22,54,92,.95)', maxW: w - 40 });
  txt(g, 'WESTAIR TECHNICS  -  LINE & BASE MAINTENANCE', w / 2, h * .82, 44, { color: 'rgba(22,54,92,.92)', maxW: w - 60 });
  const r = rnd(31); g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 300; i++) { g.fillStyle = `rgba(0,0,0,${(.2 + r() * .6).toFixed(2)})`; g.fillRect(r() * w, r() * h, 2 + r() * 8, 1 + r() * 3); }
  g.globalCompositeOperation = 'source-over';
});
slot('gate3', 512, 128, (g, w, h) => {
  g.fillStyle = '#121418'; g.fillRect(0, 0, w, h); g.fillStyle = '#f2b51c'; g.fillRect(14, 14, 100, h - 28);
  txt(g, '3', 64, h / 2 + 4, 92, { color: '#121418' }); txt(g, 'GATE 3', 300, h * .38, 56, { color: '#f4f1e8' });
  txt(g, 'GATES 1 - 4    BOARDING', 300, h * .76, 24, { color: '#c9ccd2', weight: 'normal' });
});
slot('bag', 512, 128, panel('#16365c', '#f4f1e8', 'BAGGAGE HALL', 'MAKE-UP  -  BELTS 1-3  -  AIRSIDE', 3));
slot('fuel', 512, 128, (g, w, h) => {
  g.fillStyle = '#e8e4da'; g.fillRect(0, 0, w, h); g.fillStyle = '#b3161b'; g.fillRect(0, 0, w, 54);
  txt(g, 'FUEL SERVICES', w / 2, 29, 42, { color: '#fff' });
  txt(g, 'JET A-1   -   NO SMOKING', w / 2, 80, 28, { color: '#b3161b' }); txt(g, 'BOND VEHICLES BEFORE TRANSFER', w / 2, 110, 19, { color: '#222', weight: 'normal' });
  dirt(g, w, h, 7, .2);
});
slot('tech', 512, 128, panel('#16365c', '#f4f1e8', 'WESTAIR TECHNICS', 'HANGAR 2  -  WORKSHOP & ENGINEERING', 13));
slot('gse', 512, 128, panel('#2b2f33', '#f2b51c', 'GSE WORKSHOP', 'GROUND SUPPORT EQUIPMENT  -  BAY 1-3', 5));
slot('ops', 512, 128, panel('#f2efe6', '#16365c', 'APRON CONTROL', 'WESTAIR REGIONAL  -  OPERATIONS', 9));
slot('airside', 512, 128, (g, w, h) => {
  g.fillStyle = '#f2efe6'; g.fillRect(0, 0, w, h); g.fillStyle = '#b3161b'; g.fillRect(0, 0, w, 46);
  txt(g, 'AIRSIDE', w / 2, 25, 38, { color: '#fff' }); txt(g, 'AUTHORISED PERSONNEL ONLY', w / 2, 72, 28, { color: '#111' });
  txt(g, 'ID MUST BE DISPLAYED', w / 2, 104, 20, { color: '#333', weight: 'normal' }); dirt(g, w, h, 11, .15);
});
slot('nostep', 256, 64, (g, w, h) => { txt(g, 'NO STEP', w / 2, h / 2 + 2, 40, { color: 'rgba(30,30,30,.85)' }); });
slot('belt2', 256, 128, (g, w, h) => {
  g.fillStyle = '#f2b51c'; g.fillRect(0, 0, w, h); g.fillStyle = '#111'; g.fillRect(10, 10, w - 20, h - 20);
  txt(g, 'BELT 2', w / 2, h * .4, 50, { color: '#f2b51c' }); txt(g, 'FLIGHTS  WR 214 / 230', w / 2, h * .75, 20, { color: '#ddd', weight: 'normal' });
});
slot('ctrl', 256, 64, (g, w, h) => { g.fillStyle = '#16365c'; g.fillRect(0, 0, w, h); txt(g, 'BELT CONTROL', w / 2, h / 2 + 2, 32, { color: '#f4f1e8' }); });
slot('stores', 256, 64, (g, w, h) => { g.fillStyle = '#2b2f33'; g.fillRect(0, 0, w, h); txt(g, 'PARTS STORES', w / 2, h / 2 + 2, 32, { color: '#f2b51c' }); });
slot('exit', 256, 96, (g, w, h) => {
  g.fillStyle = '#0d7a3a'; g.fillRect(0, 0, w, h); txt(g, 'EXIT', w / 2 + 30, h / 2 + 3, 56, { color: '#fff' });
  g.fillStyle = '#fff'; g.beginPath(); g.arc(40, 26, 9, 0, 7); g.fill(); g.fillRect(34, 36, 12, 30); g.fillRect(24, 64, 10, 22); g.fillRect(46, 64, 10, 22);
});
slot('fids', 512, 256, (g, w, h) => {   // departures screen (glow)
  g.fillStyle = '#05080f'; g.fillRect(0, 0, w, h); g.fillStyle = '#16365c'; g.fillRect(0, 0, w, 40);
  txt(g, 'DEPARTURES', 16, 21, 26, { align: 'left', color: '#f4f1e8' }); txt(g, '14:35', w - 16, 21, 26, { align: 'right', color: '#f2b51c' });
  const rows = [['WR 214', 'NORTHPORT', '3', 'BOARDING', '#7dff9b'], ['WR 230', 'ALDER BAY', '4', 'GATE OPEN', '#f2b51c'], ['WR 118', 'KESTON', '1', 'DELAYED', '#ff6b5a'],
    ['WR 302', 'MERRIN FIELD', '2', 'ON TIME', '#c9ccd2'], ['WR 245', 'HALDEN', '3', 'ON TIME', '#c9ccd2'], ['WR 077', 'PORT SELWYN', '4', 'CANCELLED', '#ff6b5a']];
  rows.forEach((r, i) => { const y = 62 + i * 32; g.fillStyle = i % 2 ? 'rgba(255,255,255,.04)' : 'rgba(255,255,255,0)'; g.fillRect(0, y - 15, w, 30);
    txt(g, r[0], 14, y, 19, { align: 'left', color: '#f4f1e8', font: MONO }); txt(g, r[1], 120, y, 19, { align: 'left', color: '#f4f1e8', font: MONO });
    txt(g, r[2], 330, y, 19, { color: '#f2b51c', font: MONO }); txt(g, r[3], w - 14, y, 18, { align: 'right', color: r[4], font: MONO }); });
});
for (const L of ['A', 'B']) slot('site' + L, 128, 128, (g, w, h) => {
  g.strokeStyle = 'rgba(242,181,28,.92)'; g.lineWidth = 8; g.beginPath(); g.arc(w / 2, h / 2, w / 2 - 6, 0, 7); g.stroke();
  g.fillStyle = 'rgba(242,181,28,.92)'; g.font = 'bold 92px ' + SANS; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(L, w / 2, h / 2 + 5);
  const r = rnd(L.charCodeAt(0)); g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 160; i++) { g.fillStyle = `rgba(0,0,0,${(.3 + r() * .7).toFixed(2)})`; g.fillRect(r() * w, r() * h, 1 + r() * 6, 1 + r() * 3); }
  g.globalCompositeOperation = 'source-over';
});
for (const n of ['3', '4', '5']) slot('stand' + n, 128, 128, (g, w, h) => {   // painted stand number on the apron (read from the south)
  g.fillStyle = 'rgba(232,180,30,.92)'; g.fillRect(6, 6, w - 12, h - 12); g.fillStyle = 'rgba(20,20,20,.95)'; g.fillRect(16, 16, w - 32, h - 32);
  txt(g, n, w / 2, h / 2 + 5, 86, { color: 'rgba(232,180,30,.95)' });
  const r = rnd(n.charCodeAt(0) * 3); g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 120; i++) { g.fillStyle = `rgba(0,0,0,${(.2 + r() * .6).toFixed(2)})`; g.fillRect(r() * w, r() * h, 1 + r() * 5, 1 + r() * 3); }
  g.globalCompositeOperation = 'source-over';
});
slot('stop', 256, 64, (g, w, h) => { txt(g, 'STOP  ATR / E175', w / 2, h / 2 + 2, 34, { color: 'rgba(240,240,236,.92)', maxW: w - 10 }); });
slot('nopark', 256, 64, (g, w, h) => { txt(g, 'NO PARKING', w / 2, h / 2 + 2, 42, { color: 'rgba(205,40,30,.9)', maxW: w - 10 }); });
// stains (alpha-blended)
for (let i = 0; i < 4; i++) slot('oil' + i, 128, 128, (g, w, h) => {
  const r = rnd(40 + i), grd = g.createRadialGradient(w / 2, h / 2, 4, w / 2, h / 2, w / 2);
  grd.addColorStop(0, 'rgba(8,7,6,.8)'); grd.addColorStop(.55, 'rgba(14,12,10,.45)'); grd.addColorStop(1, 'rgba(20,16,12,0)');
  g.fillStyle = grd; g.beginPath();
  for (let k = 0; k <= 24; k++) { const a = k / 24 * PI * 2, rr = w * (.3 + r() * .2); g.lineTo(w / 2 + Math.cos(a) * rr, h / 2 + Math.sin(a) * rr); }
  g.fill();
  for (let k = 0; k < 6; k++) { g.fillStyle = 'rgba(10,9,8,.45)'; g.beginPath(); g.arc(w * (.2 + r() * .6), h * (.2 + r() * .6), 3 + r() * 10, 0, 7); g.fill(); }
});
slot('streak', 128, 256, (g, w, h) => {
  const r = rnd(77);
  for (let i = 0; i < 26; i++) {
    const x = r() * w, len = h * (.3 + r() * .7), a = .08 + r() * .3, grd = g.createLinearGradient(0, 0, 0, len);
    grd.addColorStop(0, `rgba(28,24,20,${a})`); grd.addColorStop(1, 'rgba(28,24,20,0)'); g.fillStyle = grd; g.fillRect(x, 0, 2 + r() * 7, len);
  }
});
slot('tyre', 256, 64, (g, w, h) => {   // rubber skid marks
  const r = rnd(55);
  for (let k = 0; k < 2; k++) for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(10,10,10,${(.05 + r() * .12).toFixed(2)})`; g.fillRect(r() * w * .2 + i * w / 40, 8 + k * 30 + r() * 4, w / 30, 10 + r() * 6); }
});
slot('wet', 256, 256, (g, w, h) => {
  const r = rnd(95), grd = g.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w / 2);
  grd.addColorStop(0, 'rgba(10,10,12,.5)'); grd.addColorStop(1, 'rgba(10,10,12,0)'); g.fillStyle = grd;
  g.beginPath(); for (let k = 0; k <= 30; k++) { const a = k / 30 * PI * 2, rr = w * (.32 + r() * .18); g.lineTo(w / 2 + Math.cos(a) * rr, h / 2 + Math.sin(a) * rr * .8); } g.fill();
});
// window bands for the out-of-bounds buildings (daylight: dark glass with a sky reflection; sign material)
for (let v = 0; v < 3; v++) slot('win' + v, 256, 256, (g, w, h) => {
  g.fillStyle = v === 2 ? '#8d8a82' : '#b9b6ad'; g.fillRect(0, 0, w, h);
  const r = rnd(200 + v), cols = 8, rows = 8, cw = w / cols, ch = h / rows;
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const grd = g.createLinearGradient(0, j * ch, 0, j * ch + ch); const b = 60 + r() * 40 | 0;
    grd.addColorStop(0, `rgb(${b + 40},${b + 55},${b + 70})`); grd.addColorStop(1, `rgb(${b - 20},${b - 10},${b})`);
    g.fillStyle = grd; g.fillRect(i * cw + cw * .1, j * ch + ch * .2, cw * .8, ch * .6);
  }
});

const SCN = new WeakMap();
function atlas(scene) {
  let st = SCN.get(scene);
  if (st) return st;
  st = {}; SCN.set(scene, st);
  const dt = new BABYLON.DynamicTexture('hg_signs', { width: AW, height: AH }, scene, true);
  dt.hasAlpha = true; dt.wrapU = dt.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;
  const g = dt.getContext(); g.clearRect(0, 0, AW, AH);
  for (const [name, fn] of DRAW) {
    const [x, y, w, h] = SLOTS[name];
    g.save(); g.translate(x, y); g.beginPath(); g.rect(0, 0, w, h); g.clip();
    try { fn(g, w, h); } catch (e) { console.warn('[hangar] sign ' + name + ': ' + e.message); }
    g.restore();
  }
  dt.update(true);
  st.tex = dt;
  scene.onDisposeObservable.addOnce(() => SCN.delete(scene));
  return st;
}
export function signMat(B, kind = 'sign') {
  const st = atlas(B.scene);
  if (st[kind]) return st[kind];
  const m = new BABYLON.PBRMaterial('m_hg_' + kind, B.scene);
  m.albedoTexture = st.tex; m.metallic = 0; m.roughness = kind === 'glow' ? 1 : .8;
  m.useAlphaFromAlbedoTexture = true;
  if (kind === 'stain') {
    m.transparencyMode = BABYLON.PBRMaterial.PBRMATERIAL_ALPHABLEND; m.alpha = 1; m.zOffset = -2; m.disableDepthWrite = true;
  } else {
    m.transparencyMode = BABYLON.PBRMaterial.PBRMATERIAL_ALPHATEST; m.alphaCutOff = .45; m.zOffset = -1;
  }
  if (kind === 'glow') {
    m.transparencyMode = BABYLON.PBRMaterial.PBRMATERIAL_OPAQUE; m.useAlphaFromAlbedoTexture = false;
    m.emissiveTexture = st.tex; m.emissiveColor = new BABYLON.Color3(1, 1, 1); m.emissiveIntensity = 1.2;
    m.albedoColor = new BABYLON.Color3(.02, .02, .02); m.disableLighting = true;
  }
  if (kind === 'lit') { m.emissiveTexture = st.tex; m.emissiveColor = new BABYLON.Color3(.45, .44, .42); }
  m.backFaceCulling = true;
  st[kind] = m;
  return m;
}
function uvOf(name) {
  const r = SLOTS[name]; if (!r) throw new Error('hangar sign: unknown slot ' + name);
  const [x, y, w, h] = r, i = 2;
  return [(x + i) / AW, 1 - (y + h - i) / AH, (x + w - i) / AW, 1 - (y + i) / AH];
}
export function sign(B, name, x, y, z, w, h, o = {}) {
  const [u0, v0, u1, v1] = uvOf(name), kind = o.glow ? 'glow' : o.stain ? 'stain' : o.lit ? 'lit' : 'sign';
  const hw = w / 2, hh = h / 2, f = o.face || 'n';
  let P, N;
  if (f === 'n') { P = [[-hw, -hh, 0], [hw, -hh, 0], [hw, hh, 0], [-hw, hh, 0]]; N = [0, 0, 1]; }
  else if (f === 's') { P = [[hw, -hh, 0], [-hw, -hh, 0], [-hw, hh, 0], [hw, hh, 0]]; N = [0, 0, -1]; }
  else if (f === 'e') { P = [[0, -hh, hw], [0, -hh, -hw], [0, hh, -hw], [0, hh, hw]]; N = [1, 0, 0]; }
  else if (f === 'w') { P = [[0, -hh, -hw], [0, -hh, hw], [0, hh, hw], [0, hh, -hw]]; N = [-1, 0, 0]; }
  else { P = [[-hw, 0, hh], [hw, 0, hh], [hw, 0, -hh], [-hw, 0, -hh]]; N = [0, 1, 0]; }
  const m = new BABYLON.Mesh('hg_sign', B.scene), vd = new BABYLON.VertexData();
  const pos = [], nor = [];
  for (const p of P) { pos.push(p[0], p[1], p[2]); nor.push(N[0], N[1], N[2]); }
  vd.positions = pos; vd.normals = nor;
  vd.uvs = f === 'u' ? [u0, v1, u1, v1, u1, v0, u0, v0] : [u1, v0, u0, v0, u0, v1, u1, v1];
  const ax = P[1][0] - P[0][0], ay = P[1][1] - P[0][1], az = P[1][2] - P[0][2], bx = P[2][0] - P[0][0], by = P[2][1] - P[0][1], bz = P[2][2] - P[0][2];
  const cx = ay * bz - az * by, cy = az * bx - ax * bz, cz = ax * by - ay * bx;
  vd.indices = cx * N[0] + cy * N[1] + cz * N[2] < 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2];
  vd.applyToMesh(m, false);
  m.material = signMat(B, kind);
  m.position.set(x, y, z); m.rotation.y = o.ry || 0;
  B.mesh(m, { collide: 'none', cast: false });
}

// ------------------------------------------------------------------------------------------------ helpers
function put(B, K, x, y, z, o, key) { return emitKit(B, K, x, y, z, { ry: o.ry || 0, inst: o.inst, hide: o.hide, cast: o.cast, light: o.light }, key); }
// cheap wheels (tyre + hub): GSE has many of them, the full road wheel is ~300 tris each
const wheels = (K, pts, r, w, mat = 'p_alu') => { for (const [x, z] of pts) { const s = x > 0 ? 1 : -1;
  K.cylX('rubber', x - w / 2, x + w / 2, r, z, r, { seg: 12 }); K.cylX(mat, x + s * w / 2, x + s * (w / 2 + .01), r, z, r * .6, { seg: 10 }); } };

// ------------------------------------------------------------------------------------------------ vehicles
/** aviation refueller: 2.5 x 3.3 x 9 m, nose +z */
export function refueler(B, x, z, o = {}) {
  const K = new Kit(3), body = 'p_coat_white', W = 2.5;
  K.box('steel_dark', 0, .55, -.2, 1.0, .3, 8.4);                                               // chassis rails
  // cab (cab-over) at the front
  K.box(body, 0, .8, 3.3, W, 2.1, 1.7, { bev: .08 });
  K.box('p_glass_dark', 0, 1.85, 4.16, W - .3, .85, .02);
  for (const s of [-1, 1]) K.box('p_glass_dark', s * (W / 2 + .005), 1.9, 3.5, .02, .7, .9);
  K.box('p_plastic_dark', 0, .65, 4.17, W - .1, .35, .1, { bev: .03 });                       // bumper
  for (const s of [-1, 1]) { K.box('p_lens_clear', s * .95, .78, 4.2, .25, .14, .02); K.box('p_em_amber', s * 1.15, .8, 4.2, .1, .1, .02); }
  K.box('p_em_amber', 0, 2.9, 3.4, .5, .12, .2);                                                  // beacon bar
  K.box('p_coat_red', 0, 1.2, 4.165, W - .02, .12, .01);
  // tank: elliptical shell on the chassis
  K.push(0, 0, 0);
  K.cylZ(body, -4.0, 2.2, 0, 2.02, 1.12, { seg: 20 });
  K.cylZ('p_coat_red', -2.0, -1.6, 0, 2.02, 1.135, { seg: 20, caps: false });
  K.cylZ('p_coat_red', 0.6, 1.0, 0, 2.02, 1.135, { seg: 20, caps: false });
  K.pop();
  K.box('grate', 0, 3.14, -1.0, .7, .04, 4.6);                                                   // top walkway + hatches
  for (const zz of [-2.5, .3]) K.cyl('p_alu', 0, 3.1, zz, .3, .1, { seg: 12 });
  railing(K, 'p_galv', -.45, -3.2, -.45, 1.2, 3.16, { h: .7, toe: false }); railing(K, 'p_galv', .45, -3.2, .45, 1.2, 3.16, { h: .7, toe: false });
  K.push(-1.0, .6, -4.05); ladder(K, 'p_galv', 0, 0, 0, 2.5, { w: .4 }); K.pop();
  // rear cabinet: hose reel, meters
  K.box('p_coat_slate', 0, .85, -4.15, W, 1.5, .55, { bev: .03 });
  K.cylX('p_plastic_dark', -.9, .9, 1.55, -4.15, .5, { seg: 16 });
  K.box('p_alu', 0, .85, -4.45, W - .2, .25, .06);
  for (const s of [-1, 1]) { K.box('p_coat_slate', s * 1.1, .7, -1.0, .3, .5, 4.2); K.box('p_lens_red', s * .9, 1.0, -4.44, .2, .1, .02); }
  wheels(K, [[-1.05, 3.4], [1.05, 3.4], [-1.05, -1.6], [1.05, -1.6], [-1.05, -2.9], [1.05, -2.9]], .5, .34);
  K.noCast && K.noCast('p_em_amber');
  K.col(0, 0, -.1, W, 3.25, 8.8, { surf: 'metal' });
  K.hide(-2.0, 0, 0, 'car', 1.0);
  return put(B, K, x, o.y || 0, z, o, 'hg_refueler');
}
/** baggage tractor: 1.5 x 2.05 x 3.0 m */
export function tug(B, x, z, o = {}) {
  const K = new Kit(5), paint = o.paint || 'p_coat_yellow';
  K.box('steel_dark', 0, .3, 0, 1.3, .2, 2.9);
  K.box(paint, 0, .5, .55, 1.45, .55, 1.9, { bev: .06 });                                     // engine deck (front)
  K.box(paint, 0, .5, -1.0, 1.45, .45, 1.0, { bev: .05 });
  K.box('p_plastic_dark', 0, .95, -.65, .55, .12, .5); K.box('p_plastic_dark', 0, 1.05, -.92, .55, .5, .1);   // seat
  K.cyl('p_plastic_dark', 0, 1.0, -.05, .03, .5, { seg: 6 }); K.lathe('p_plastic_dark', [[.18, 0], [.18, .03]], { seg: 14, y: 1.48, z: .05 }); // wheel
  for (const [sx, sz] of [[-.66, .25], [.66, .25], [-.66, -1.4], [.66, -1.4]]) K.box('steel_dark', sx, .95, sz, .05, 1.05, .05);
  K.box(paint, 0, 2.0, -.58, 1.45, .06, 1.8, { bev: .02 });                                   // canopy roof
  K.box('p_em_amber', 0, 2.06, -.6, .2, .1, .2);
  K.box('p_plastic_dark', 0, .35, 1.47, 1.4, .3, .1);                                          // bumper
  K.box('steel_dark', 0, .35, -1.55, .2, .14, .25);                                            // tow hitch
  wheels(K, [[-.62, .9], [.62, .9], [-.62, -.95], [.62, -.95]], .3, .22, 'steel_dark');
  K.col(0, 0, -.05, 1.5, 2.05, 3.0, { surf: 'metal' });
  return put(B, K, x, o.y || 0, z, o, 'hg_tug_' + paint);
}
/** baggage cart: 1.6 x 1.9 x 3.3 m; o.uld = container dolly carrying an LD3; o.bags (0..1) load */
export function dolly(B, x, z, o = {}) {
  const K = new Kit(o.seed || 7), r = rnd(o.seed || 7);
  K.box('steel_dark', 0, .35, 0, 1.5, .1, 2.6);
  K.box(o.uld ? 'p_galv' : 'p_coat_slate', 0, .45, 0, 1.55, .05, 2.6);
  wheels(K, [[-.62, .9], [.62, .9], [-.62, -.9], [.62, -.9]], .2, .14, 'steel_dark');
  K.tube('steel_dark', [[-.2, .35, 1.3], [0, .3, 1.9], [.2, .35, 1.3]], .03, { seg: 6 });       // tow bar
  if (o.uld) {
    for (let i = 0; i < 6; i++) K.cyl('p_plastic_dark', -.6 + (i % 3) * .6, .5, i < 3 ? -.8 : .8, .04, .03, { seg: 6 });   // rollers
    uldKit(K, 0, .5, 0, 0);
    K.col(0, 0, 0, 1.9, 2.15, 2.6, { surf: 'metal' });
  } else {
    for (const s of [-1, 1]) for (const sx of [-1, 1]) K.box('p_galv', sx * .74, .5, s * 1.25, .05, 1.4, .05);
    for (const sx of [-1, 1]) K.box('p_galv', sx * .74, 1.88, 0, .05, .05, 2.55);
    for (const s of [-1, 1]) K.box('p_galv', 0, 1.88, s * 1.25, 1.5, .05, .05);
    K.box('p_tarp_blue', 0, 1.92, 0, 1.6, .03, 2.65);                                          // roof sheet
    for (const sx of [-1, 1]) K.box('p_tarp_blue', sx * .78, 1.45, 0, .02, .45, 2.6);           // rolled curtains
    const fill = o.bags == null ? .8 : o.bags, bagMats = ['p_fab_charcoal', 'p_fab_navy', 'p_fab_red', 'p_fab_grey', 'p_plastic_dark', 'p_fab_green', 'p_fab_brown'];
    let n = 0;
    for (let lz = -1.0; lz <= 1.0; lz += .55) for (let lx = -.45; lx <= .46; lx += .45) for (let ly = 0; ly < 3; ly++) {
      if (r() > fill) continue;
      const w = .38 + r() * .12, h = .22 + r() * .12, d = .5 + r() * .2, m = bagMats[(r() * bagMats.length) | 0];
      K.box(m, lx + (r() - .5) * .05, .5 + ly * .3, lz, w, h, d, { ry: (r() - .5) * .3, bev: .04 }); n++;
    }
    K.col(0, 0, 0, 1.6, 1.95, 2.6, { surf: 'metal' });
  }
  return put(B, K, x, o.y || 0, z, o, 'hg_dolly' + (o.uld ? 'u' : '') + (o.seed || 7));
}
function uldKit(K, x, y, z, ry) {
  // LD3: base 1.56 wide, top 2.01 with the contour on +x, 1.63 tall, 1.53 deep
  K.push(x, y, z, ry);
  K.ext('p_galv', [[-.78, 0], [.78, 0], [1.23, .55], [1.23, 1.63], [-.78, 1.63]], -.765, .765, { caps: true });
  for (let i = 0; i < 5; i++) K.box('p_galv', -.78 + i * .5, 1.63, 0, .03, .02, 1.53);
  K.box('p_fab_charcoal', .1, .08, .768, 1.5, 1.4, .02);                                       // curtain door
  K.box('p_em_amber', .7, 1.4, .78, .3, .1, .005);
  K.box('p_galv', 0, -.02, 0, 1.6, .04, 1.56);
  K.pop();
}
export function uld(B, x, y, z, o = {}) {
  const K = new Kit(9);
  uldKit(K, 0, 0, 0, 0);
  K.col(.22, 0, 0, 2.02, 1.65, 1.55, { surf: 'metal' });
  K.hide(-1.3, 0, 0, 'crates', .8);
  return put(B, K, x, y, z, o, 'hg_uld');
}
/** passenger stairs truck: chassis along z, a flight climbing +z to a platform (top 3.2) over the cab */
export function stairsTruck(B, x, z, o = {}) {
  const ry = o.ry || 0, K = new Kit(11), top = o.top || 3.2;
  K.box('steel_dark', 0, .5, 0, .9, .25, 7.4);
  K.box('p_coat_white', 0, .7, 2.8, 2.2, 1.6, 1.6, { bev: .08 });                             // cab under the platform
  K.box('p_glass_dark', 0, 1.45, 3.61, 1.9, .7, .02);
  K.box('p_coat_red', 0, .95, 3.605, 2.2, .1, .01);
  wheels(K, [[-.9, 2.6], [.9, 2.6], [-.9, -2.4], [.9, -2.4]], .42, .3);
  for (const s of [-1, 1]) K.box('p_coat_slate', s * .5, .75, -.4, .08, top - .9, .08);         // stair support posts
  K.box('p_em_amber', 0, 2.3, 2.6, .3, .12, .3);
  K.col(0, 0, 2.8, 2.2, 2.3, 1.7, { surf: 'metal' });
  K.col(0, 0, -.6, 1.9, .95, 5.4, { surf: 'metal' });
  put(B, K, x, 0, z, o, 'hg_stairs');
  // walkable flight + platform (builder geometry inside a frame)
  B.push(x, 0, z, ry);
  B.stairs({ x: 0, z: -.6, w: 1.2, len: 5.0, y0: .95, y1: top, dir: '+z', mat: 'p_coat_white', tread: 'grate', rail: true, railMat: 'steel' });
  B.box(0, 0, -3.35, 1.2, .95, .5, { mat: 'p_coat_white' });                                     // bottom step block
  B.box(0, top - .2, 2.6, 1.8, .2, 2.0, { mat: 'p_coat_white', mats: { t: 'grate' } });
  for (const s of [-1, 1]) B.box(s * .88, top, 2.6, .05, 1.05, 2.0, { mat: 'steel', ray: false });
  B.box(0, top, 3.58, 1.8, 1.05, .05, { mat: 'steel', ray: false, visible: false });
  B.box(0, top + 1.0, 3.58, 1.8, .05, .05, { mat: 'steel', collide: false });
  B.pop();
}
/** belt loader: small truck with a conveyor rising +z (to ~2.4 m) */
export function beltLoader(B, x, z, o = {}) {
  const K = new Kit(13), paint = o.paint || 'p_coat_yellow';
  K.box(paint, 0, .35, -1.4, 1.8, .9, 2.6, { bev: .05 });
  K.box('steel_dark', 0, .3, .8, 1.2, .25, 5.6);
  K.box('p_plastic_dark', -.5, 1.25, -2.2, .5, .5, .5);
  K.push(0, 1.0, -.6, 0, -.32, 0);
  K.box('steel_dark', 0, 0, 2.6, .85, .22, 6.6); K.box('rubber', 0, .22, 2.6, .7, .03, 6.5);
  for (const s of [-1, 1]) K.box('p_galv', s * .42, .22, 2.6, .03, .18, 6.4);
  K.pop();
  wheels(K, [[-.85, -2.0], [.85, -2.0], [-.85, 2.6], [.85, 2.6]], .32, .22, 'steel_dark');
  K.col(0, 0, -1.4, 1.8, 1.4, 2.6, { surf: 'metal' });
  K.col(0, 0, 1.6, 1.0, 1.4, 3.6, { surf: 'metal' });
  return put(B, K, x, 0, z, o, 'hg_bl');
}

// ------------------------------------------------------------------------------------------------ baggage hall
export function belt(B, x0, z0, x1, z1, y, o = {}) {
  const L = Math.hypot(x1 - x0, z1 - z0), ry = Math.atan2(x1 - x0, z1 - z0), w = o.w || 1.0;
  const K = new Kit(17);
  K.box('steel_dark', 0, y - .28, L / 2, w, .2, L);
  K.box('rubber', 0, y - .08, L / 2, w - .16, .08, L - .1);
  for (const s of [-1, 1]) { K.box('p_stainless', s * (w / 2 - .02), y - .1, L / 2, .04, .32, L); K.box('p_plastic_yellow', s * (w / 2 - .02), y + .2, L / 2, .05, .03, L); }
  const n = Math.max(1, Math.round(L / 2.2));
  for (let i = 0; i <= n; i++) for (const s of [-1, 1]) K.box('p_galv', s * (w / 2 - .1), 0, .2 + i * (L - .4) / n, .06, y - .28, .06);
  if (o.bags) { const r = rnd(o.bags); for (let u = .6; u < L - .4; u += .7 + r() * 1.4) K.box(['p_fab_charcoal', 'p_fab_navy', 'p_fab_red', 'p_plastic_dark'][(r() * 4) | 0], (r() - .5) * .3, y, u, .4, .25, .6, { ry: (r() - .5) * .6, bev: .04 }); }
  K.col(0, 0, L / 2, w, y + .22, L, { surf: 'metal' });
  return emitKit(B, K, x0, o.y0 || 0, z0, { ry }, 'hg_belt');
}
export function carousel(B, x, z, L, W, o = {}) {
  const K = new Kit(19), r = rnd(19), R = W / 2, h = .5, pts = [];
  for (let i = 0; i <= 12; i++) { const a = -PI / 2 + i * PI / 12; pts.push([L / 2 - R + Math.cos(a) * R, Math.sin(a) * R]); }
  for (let i = 0; i <= 12; i++) { const a = PI / 2 + i * PI / 12; pts.push([-L / 2 + R + Math.cos(a) * R, Math.sin(a) * R]); }
  K.extY('p_stainless', pts, 0, h - .06);
  K.extY('rubber', pts.map(([a, b]) => [a * .985, b * .96]), h - .06, h);
  const pi = pts.map(([a, b]) => [a * (1 - 1.1 / L), b * (1 - 1.1 / W)]);
  K.extY('steel_dark', pi, h, h + .25);                                                         // the central spine
  for (let u = -L / 2 + .8; u < L / 2 - .8; u += .9 + r() * 1.3) for (const s of [-1, 1]) {
    if (r() < .35) continue;
    K.box(['p_fab_charcoal', 'p_fab_navy', 'p_fab_red', 'p_plastic_dark', 'p_fab_grey'][(r() * 5) | 0], u, h, s * (R - .35), .42, .26, .6, { ry: (r() - .5) * .8, bev: .04 });
  }
  K.col(0, 0, 0, L - W * .6, h + .25, W, { surf: 'metal' });
  for (const s of [-1, 1]) K.col(s * (L / 2 - R * .8), 0, 0, R * 1.5, h, W * .8, { surf: 'metal' });
  K.hide(0, 0, -R - .7, 'crates', .7);
  return put(B, K, x, 0, z, o, 'hg_car');
}

// ------------------------------------------------------------------------------------------------ landmarks
export function controlTower(B, x, z, o = {}) {
  const K = new Kit(23), H = o.h || 30, y0 = o.y || 0;
  K.lathe('p_concrete_precast', [[3.2, 0], [3.0, H * .2], [2.6, H * .85], [3.4, H]], { seg: 24, caps: true });
  for (let i = 1; i < 6; i++) K.box('p_glass_dark', 0, i * H / 6.5, 2.75 - i * .05, .9, 2.2, .3);   // stair-core windows
  // cab: a ring floor, sloped glazing, roof
  K.cyl('p_concrete_precast', 0, H, 0, 5.2, .6, { seg: 12 });
  K.lathe('p_glass_tint', [[5.0, H + .6], [5.6, H + 3.8]], { seg: 12, caps: false, sharp: 89 });
  for (let i = 0; i < 12; i++) { const a = i * PI / 6; K.tube('steel_dark', [[Math.cos(a) * 5.0, H + .6, Math.sin(a) * 5.0], [Math.cos(a) * 5.6, H + 3.8, Math.sin(a) * 5.6]], .06, { seg: 5 }); }
  K.cyl('p_coat_white', 0, H + 3.8, 0, 6.0, .5, { seg: 12 });
  K.cyl('p_paint_grey', 0, H + 4.3, 0, 2.0, 1.2, { seg: 10 });
  K.cyl('p_galv', 1.0, H + 5.5, 0, .06, 6, { seg: 6 }); K.cyl('p_galv', -1.2, H + 5.5, .5, .04, 3.5, { seg: 6 });
  K.box('p_coat_red', 1.0, H + 11.4, 0, .2, .15, .2);
  for (const a of [0.4, 2.0, 3.7, 5.2]) K.lathe('p_coat_white', [[.0, -.3], [.45, -.05], [.45, .05]], { seg: 10, x: Math.cos(a) * 2.2, y: H + 5.6, z: Math.sin(a) * 2.2 });
  K.ccyl(0, 0, 0, 3.2, H, { surf: 'concrete' });
  return put(B, K, x, y0, z, o, 'hg_tower');
}
export function engineStand(B, x, z, o = {}) {
  const K = new Kit(29);
  K.box('p_coat_blue', 0, .25, 0, 1.9, .2, 3.6);
  wheels(K, [[-.85, 1.4], [.85, 1.4], [-.85, -1.4], [.85, -1.4]], .25, .16, 'steel_dark');
  for (const s of [-1, 1]) { K.box('p_coat_blue', 0, .45, s * 1.0, 1.4, .7, .18); }
  K.push(0, 1.6, 0, 0, PI / 2, 0);
  K.lathe('p_coat_white', [[.0, -1.6], [.7, -1.5], [.9, -.8], [1.0, .2], [.98, 1.0], [.9, 1.5]], { seg: 20, capT: false, sharp: 35 });
  K.lathe('p_alu', [[.9, 1.5], [.86, 1.4]], { seg: 20, caps: false });
  K.cyl('steel_dark', 0, 1.2, 0, .88, .08, { seg: 20 });
  K.lathe('p_chrome', [[.25, 1.25], [.1, 1.45], [0, 1.52]], { seg: 12 });
  K.pop();
  K.box('p_fab_blue', 0, 1.6, 1.62, 1.6, 1.6, .02);                                              // intake cover
  K.col(0, 0, 0, 2.0, 2.6, 3.6, { surf: 'metal' });
  K.hide(1.6, 0, 0, 'crates', .8);
  return put(B, K, x, o.y || 0, z, o, 'hg_eng');
}
export function toolChest(B, x, z, o = {}) {
  const K = new Kit(31), paint = o.paint || 'p_coat_red';
  K.box(paint, 0, .1, 0, 1.1, .9, .5, { bev: .02 });
  for (let i = 0; i < 6; i++) K.box('p_alu', 0, .2 + i * .13, .255, .9, .02, .01);
  K.box(paint, 0, 1.0, -.04, 1.05, .45, .42, { bev: .02 });
  for (let i = 0; i < 3; i++) K.box('p_alu', 0, 1.06 + i * .12, .175, .85, .02, .01);
  for (const [sx, sz] of [[-.45, -.18], [.45, -.18], [-.45, .18], [.45, .18]]) K.cyl('rubber', sx, 0, sz, .05, .1, { seg: 8 });
  K.box('p_plastic_dark', .2, 1.45, 0, .4, .12, .2); K.box('p_alu', -.3, 1.45, .05, .1, .3, .02);
  K.col(0, 0, 0, 1.1, 1.45, .5, { surf: 'metal' });
  return put(B, K, x, o.y || 0, z, o, 'hg_tools' + paint);
}
/** maintenance dock: deck (o.w x o.d) at o.h with railings, a stair climbing +z up to its south edge; walkable */
export function wingDock(B, x, z, o = {}) {
  const h = o.h || 2.6, w = o.w || 3.0, d = o.d || 2.4, sl = Math.max(2.4, h / .18 * .28);
  B.push(x, o.y || 0, z, o.ry || 0);
  B.box(0, h - .12, 0, w, .12, d, { mat: 'p_alu', mats: { t: 'grate' } });
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) B.box(sx * (w / 2 - .06), 0, sz * (d / 2 - .06), .08, h - .12, .08, { mat: 'p_alu' });
  B.box(0, .1, d / 2 - .06, w, .06, .06, { mat: 'p_alu', collide: false }); B.box(0, .1, -d / 2 + .06, w, .06, .06, { mat: 'p_alu', collide: false });
  B.stairs({ x: -w / 2 + .5, z: -d / 2 - sl / 2, w: .9, len: sl, y0: 0, y1: h, dir: '+z', mat: 'p_alu', tread: 'grate', rail: true, railMat: 'p_alu' });
  const rails = o.rails || ['n', 'e', 'w', 's'];
  for (const f of rails) {
    if (f === 'n') B.box(0, h, d / 2 - .03, w, 1.05, .05, { mat: 'p_alu', ray: false });
    if (f === 's') B.box(.45, h, -d / 2 + .03, w - .9, 1.05, .05, { mat: 'p_alu', ray: false });
    if (f === 'e') B.box(w / 2 - .03, h, 0, .05, 1.05, d, { mat: 'p_alu', ray: false });
    if (f === 'w') B.box(-w / 2 + .03, h, 0, .05, 1.05, d, { mat: 'p_alu', ray: false });
  }
  B.pop();
}

// ------------------------------------------------------------------------------------------------ out of bounds
const EDGE = { blue: 'p_em_blue', white: 'emissive_white', amber: 'p_em_amber', red: 'emissive_red' };
export function edgeLights(B, pts, o = {}) {
  const mat = EDGE[o.color || 'blue'], y = o.y || 0;
  for (const [x, z] of pts) {
    B.cyl(x, y, z, .04, .3, { mat: 'p_coat_yellow', sides: 6, collide: false });
    B.cyl(x, y + .3, z, .07, .12, { mat, sides: 6, collide: false });
  }
}
export function windsock(B, x, z, o = {}) {
  const K = new Kit(37), H = 6;
  K.box('p_concrete_precast', 0, 0, 0, .8, .3, .8);
  K.cyl('p_coat_white', 0, .3, 0, .06, H, { seg: 8 });
  for (let i = 0; i < 4; i++) K.box('p_coat_red', 0, .3 + H * (.2 + i * .2), 0, .14, .25, .14);
  K.push(0, H + .1, 0, o.yaw || 1.2, -.25, 0);
  for (let i = 0; i < 5; i++) { const r0 = .45 - i * .06, r1 = .45 - (i + 1) * .06; K.lathe(i % 2 ? 'p_coat_white' : 'p_paint_orange', [[r0, 0], [r1, .7]], { seg: 12, caps: false, z: 0, y: 0, x: 0 }); K.push(0, .7, 0); }
  for (let i = 0; i < 5; i++) K.pop();
  K.pop();
  K.ccyl(0, 0, 0, .3, H, { surf: 'metal' });
  return put(B, K, x, 0, z, o, 'hg_sock');
}
/** daytime OOB block row: buildings of varied height with window bands on the faces in o.faces */
export function skyline(B, x0, z0, x1, z1, o = {}) {
  const r = () => B.rand(), faces = o.faces || 'nsew', step = o.step || 16;
  const dx = x1 - x0, dz = z1 - z0, alongX = Math.abs(dx) >= Math.abs(dz), L = alongX ? Math.abs(dx) : Math.abs(dz);
  let u = 0;
  while (u < L - 4) {
    const w = Math.min(L - u, step * (.6 + r() * .8)), d = (o.depth || 16) * (.7 + r() * .6), h = (o.h || 14) * (.5 + r() * .9);
    const cx = alongX ? Math.min(x0, x1) + u + w / 2 : (x0 + x1) / 2, cz = alongX ? (z0 + z1) / 2 : Math.min(z0, z1) + u + w / 2;
    const bw = alongX ? w - 1.5 : d, bd = alongX ? d : w - 1.5;
    const mat = ['concrete', 'plaster', 'brick', 'concrete_panels'][(r() * 4) | 0];
    B.box(cx, -1, cz, bw, h + 1, bd, { mat, collide: false, cast: false });
    B.box(cx, h, cz, bw + .3, .6, bd + .3, { mat: 'concrete_dark', collide: false, cast: false });
    if (r() < .6) B.box(cx + (r() - .5) * bw * .4, h + .6, cz + (r() - .5) * bd * .4, 3, 1.8, 2.4, { mat: 'concrete', collide: false, cast: false });
    const v = Math.floor(r() * 3), wh = Math.min(h - 3, 3.4 * Math.floor((h - 3) / 3.4));
    if (wh > 3) for (const f of faces) {
      const fw = f === 'n' || f === 's' ? bw : bd;
      const px = f === 'e' ? cx + bw / 2 + .05 : f === 'w' ? cx - bw / 2 - .05 : cx, pz = f === 'n' ? cz + bd / 2 + .05 : f === 's' ? cz - bd / 2 - .05 : cz;
      sign(B, 'win' + v, px, 2 + wh / 2, pz, fw - 2, wh, { face: f });
    }
    u += w;
  }
}
export function rail(B, x0, z0, x1, z1, y, o = {}) {
  const K = new Kit(41), L = Math.hypot(x1 - x0, z1 - z0), mat = o.mat || 'p_galv', h = o.h || 1.05;
  railing(K, mat, 0, 0, 0, L, 0, { h, toe: o.toe !== false });
  K.col(0, 0, L / 2, .08, h, L, { surf: 'metal', ray: false });
  return emitKit(B, K, x0, y, z0, { ry: Math.atan2(x1 - x0, z1 - z0) }, 'hg_rail');
}
export { louvres };
