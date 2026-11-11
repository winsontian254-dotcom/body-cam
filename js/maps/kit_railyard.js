/* LIVE FIRE — railyard kit: custom prefabs for Switchback Yard (js/maps/defs/railyard.js) built with the prop Kit
   (js/maps/props/kit.js) and the MapBuilder. Everything here is original geometry and art (fictional railroad "S&N").
   Exports:
     signMat(B, kind)                       per-scene materials over the railyard sign atlas (canvas): 'sign' (alpha-tested,
                                            lit by the scene), 'glow' (emissive: lit windows, lit signs), 'stain' (alpha-blended
                                            grime / oil decals)
     sign(B, slot, x, y, z, w, h, o)        a quad of the atlas: o = { ry, face: 'n'|'s'|'e'|'w'|'u', glow, stain, lift }
     locomotive(B, x, y, z, o)              diesel road switcher on rails whose TOP is at y + .17 (o.railTop to change), along z
                                            (nose / short hood = +z); o = { ry, num: 'loco_a'|'loco_b', paint }
     boxcarOpen(B, x, y, z, o)              walk-in boxcar (door open on +x side, hollow inside) on a track prop at y
     floodMast(B, x, z, o)                  25 m floodlight mast with a lamp head (emissive) aimed along o.ry; o.light adds a spot
     bufferStop(B, x, y, z, o)              steel buffer stop at the end of a track (faces +z: the track continues toward -z)
     signal(B, x, z, o)                     mast signal (o.aspect 'red'|'amber'|'green') or o.dwarf = ground signal; faces +z
     switchStand(B, x, z, o)                hand-thrown switch stand with a target
     wheelset(B, x, y, z, o)                axle with two wheels (o.ry), stackable
     fuelCrane(B, x, z, o)                  fueling standpipe with a swing arm and hose (arm points +z)
     skyline(B, x0, z0, x1, z1, o)          a dark city block for out-of-bounds views (boxes with lit windows)
     catwalkRail(B, x0, z0, x1, z1, y, o)   handrail (top rail, mid rail, posts) along a line, visual + low collider (ray false)
   All placement follows the builder convention: y = bottom, front = +z, turned by o.ry. */
import { Kit, emitKit } from './props/kit.js';
import { ladder, railing, louvres } from './props/parts.js';

const PI = Math.PI;

// ------------------------------------------------------------------------------------------------ sign atlas
const AW = 1024, AH = 1024;
const SANS = 'Arial, Helvetica, "Liberation Sans", sans-serif', MONO = '"Courier New", "Liberation Mono", monospace';
const SLOTS = {};   // name -> [x, y, w, h] (px, top-left)
const DRAW = [];
let packX = 0, packY = 0, rowH = 0;
function slot(name, w, h, fn) {
  if (packX + w > AW) { packX = 0; packY += rowH + 4; rowH = 0; }
  SLOTS[name] = [packX, packY, w, h]; DRAW.push([name, fn]);
  packX += w + 4; rowH = Math.max(rowH, h);
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
  for (let i = 0; i < 90; i++) { g.fillStyle = `rgba(35,28,20,${(r() * amt).toFixed(3)})`; g.fillRect(r() * w, r() * h, 1 + r() * 5, 1 + r() * 3); }
  for (let i = 0; i < 8; i++) { g.fillStyle = `rgba(30,24,18,${(r() * amt * .6).toFixed(3)})`; g.fillRect(r() * w, r() * h * .2, 1 + r() * 3, h * (.4 + r() * .6)); }
}
function logo(g, x, y, s, col) {   // S&N herald: a diamond with a switchback line through it
  g.save(); g.translate(x, y); g.strokeStyle = col; g.fillStyle = col; g.lineWidth = s * .09;
  g.beginPath(); g.moveTo(0, -s / 2); g.lineTo(s / 2, 0); g.lineTo(0, s / 2); g.lineTo(-s / 2, 0); g.closePath(); g.stroke();
  g.beginPath(); g.moveTo(-s * .3, s * .18); g.lineTo(s * .05, -s * .14); g.lineTo(-s * .05, -s * .14); g.lineTo(s * .3, -s * .18); g.stroke();
  g.restore();
}
const panel = (bg, fg, title, sub, seed) => (g, w, h) => {
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.strokeStyle = fg; g.lineWidth = 6; g.strokeRect(8, 8, w - 16, h - 16);
  logo(g, 58, h / 2, 64, fg);
  txt(g, title, w / 2 + 40, sub ? h * .4 : h / 2, sub ? 46 : 54, { color: fg, maxW: w - 150 });
  if (sub) txt(g, sub, w / 2 + 40, h * .74, 22, { color: fg, maxW: w - 150, weight: 'normal' });
  dirt(g, w, h, seed, .25);
};
slot('office', 512, 128, panel('#13243d', '#e9e6dc', 'YARD OFFICE', 'SWITCHBACK & NORTHERN  -  YARDMASTER', 3));
slot('bunk', 512, 128, panel('#2a3a2a', '#ece6cf', 'CREW BUNKHOUSE', 'REST AREA  -  QUIET HOURS 22:00 - 06:00', 5));
slot('fuel', 512, 128, (g, w, h) => {
  g.fillStyle = '#e8e4da'; g.fillRect(0, 0, w, h); g.fillStyle = '#a3161a'; g.fillRect(0, 0, w, 50);
  txt(g, 'FUEL DEPOT  4', w / 2, 27, 38, { color: '#fff' });
  txt(g, 'NO SMOKING  -  NO OPEN FLAME', w / 2, 76, 28, { color: '#a3161a' }); txt(g, 'ENGINES OFF WHILE FUELING', w / 2, 106, 20, { color: '#222', weight: 'normal' });
  dirt(g, w, h, 7, .22);
});
slot('shed', 512, 128, (g, w, h) => {   // painted on the brick: no background
  txt(g, 'ENGINE HOUSE  No. 2', w / 2, h * .42, 58, { color: 'rgba(226,214,186,.92)', maxW: w - 20 });
  g.fillStyle = 'rgba(226,214,186,.85)'; g.fillRect(30, h * .78, w - 60, 6);
  const r = rnd(11); g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(0,0,0,${(.3 + r() * .7).toFixed(2)})`; g.fillRect(r() * w, r() * h, 2 + r() * 9, 1 + r() * 4); }
  g.globalCompositeOperation = 'source-over';
});
slot('yard', 512, 128, panel('#1d1d1f', '#f0c419', 'SWITCHBACK YARD', 'TOWER  SB  -  CTC DISTRICT 4', 13));
slot('blue', 256, 128, (g, w, h) => {
  g.fillStyle = '#1b4fa0'; g.fillRect(0, 0, w, h); g.strokeStyle = '#fff'; g.lineWidth = 5; g.strokeRect(6, 6, w - 12, h - 12);
  txt(g, 'STOP', w / 2, 40, 46, { color: '#fff' }); txt(g, 'MEN AT WORK', w / 2, 88, 28, { color: '#fff' }); dirt(g, w, h, 17, .2);
});
slot('limit', 256, 128, (g, w, h) => {
  g.fillStyle = '#f2efe6'; g.fillRect(0, 0, w, h); g.strokeStyle = '#111'; g.lineWidth = 5; g.strokeRect(6, 6, w - 12, h - 12);
  txt(g, 'YARD LIMIT', w / 2, 38, 34, { color: '#111' }); txt(g, '10', w / 2, 88, 56, { color: '#111' }); dirt(g, w, h, 19, .2);
});
slot('derail', 256, 64, (g, w, h) => { g.fillStyle = '#e8b80f'; g.fillRect(0, 0, w, h); txt(g, 'DERAIL', w / 2, h / 2 + 2, 44, { color: '#111' }); dirt(g, w, h, 21, .25); });
slot('danger', 256, 128, (g, w, h) => {
  g.fillStyle = '#f1efe8'; g.fillRect(0, 0, w, h); g.fillStyle = '#b3151b'; g.fillRect(0, 0, w, 48);
  txt(g, 'DANGER', w / 2, 26, 40, { color: '#fff' }); txt(g, 'HIGH VOLTAGE', w / 2, 72, 28, { color: '#111' }); txt(g, 'KEEP OUT', w / 2, 104, 24, { color: '#111' }); dirt(g, w, h, 23, .2);
});
slot('pumps', 256, 128, (g, w, h) => {
  g.fillStyle = '#20262c'; g.fillRect(0, 0, w, h); txt(g, 'PUMP HOUSE', w / 2, 44, 36, { color: '#f0c419' });
  txt(g, 'AUTHORISED STAFF ONLY', w / 2, 92, 20, { color: '#ddd', weight: 'normal' }); dirt(g, w, h, 29, .2);
});
for (const [k, s] of [['locoA', '2217'], ['locoB', '1408']]) slot(k, 256, 64, (g, w, h) => {
  g.fillStyle = '#0c0c0c'; g.fillRect(0, 0, w, h); txt(g, s, w / 2, h / 2 + 2, 50, { color: '#f4f0e0', font: MONO });
});
slot('livery', 512, 64, (g, w, h) => {   // the long-hood lettering
  txt(g, 'SWITCHBACK & NORTHERN', w / 2, h / 2 + 2, 46, { color: 'rgba(238,226,190,.95)', maxW: w - 16 });
});
for (const L of ['A', 'B']) slot('site' + L, 128, 128, (g, w, h) => {
  g.fillStyle = 'rgba(240,196,25,.9)'; g.font = 'bold 120px ' + SANS; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(L, w / 2, h / 2 + 6);
  const r = rnd(L.charCodeAt(0)); g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 160; i++) { g.fillStyle = `rgba(0,0,0,${(.3 + r() * .7).toFixed(2)})`; g.fillRect(r() * w, r() * h, 1 + r() * 6, 1 + r() * 3); }
  g.globalCompositeOperation = 'source-over';
});
for (let i = 1; i <= 10; i++) slot('trk' + i, 64, 64, (g, w, h) => {
  g.fillStyle = '#111'; g.fillRect(0, 0, w, h); g.strokeStyle = '#eee'; g.lineWidth = 3; g.strokeRect(3, 3, w - 6, h - 6);
  txt(g, String(i), w / 2, h / 2 + 2, i > 9 ? 34 : 42, { color: '#f2f2f2' });
});
// grime and oil (stain material: alpha-blended)
for (let i = 0; i < 4; i++) slot('oil' + i, 128, 128, (g, w, h) => {
  const r = rnd(40 + i), grd = g.createRadialGradient(w / 2, h / 2, 4, w / 2, h / 2, w / 2);
  grd.addColorStop(0, 'rgba(8,7,6,.85)'); grd.addColorStop(.55, 'rgba(14,12,10,.5)'); grd.addColorStop(1, 'rgba(20,16,12,0)');
  g.fillStyle = grd; g.beginPath();
  for (let k = 0; k <= 24; k++) { const a = k / 24 * PI * 2, rr = w * (.3 + r() * .2); g.lineTo(w / 2 + Math.cos(a) * rr, h / 2 + Math.sin(a) * rr); }
  g.fill();
  for (let k = 0; k < 6; k++) { g.fillStyle = 'rgba(10,9,8,.5)'; g.beginPath(); g.arc(w * (.2 + r() * .6), h * (.2 + r() * .6), 3 + r() * 10, 0, 7); g.fill(); }
});
slot('streak', 128, 256, (g, w, h) => {   // rain streaks / rust run-off under a sill (top dark, fading down)
  const r = rnd(77);
  for (let i = 0; i < 26; i++) {
    const x = r() * w, len = h * (.3 + r() * .7), a = .1 + r() * .35, grd = g.createLinearGradient(0, 0, 0, len);
    grd.addColorStop(0, `rgba(28,20,14,${a})`); grd.addColorStop(1, 'rgba(28,20,14,0)'); g.fillStyle = grd; g.fillRect(x, 0, 2 + r() * 7, len);
  }
});
slot('rust', 256, 128, (g, w, h) => {   // rust bloom around a footing / under a tank
  const r = rnd(91);
  for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(${90 + r() * 40 | 0},${40 + r() * 20 | 0},${15 + r() * 10 | 0},${(.08 + r() * .2).toFixed(2)})`; g.beginPath(); g.ellipse(w * r(), h * r(), 6 + r() * 30, 4 + r() * 16, 0, 0, 7); g.fill(); }
});
slot('wet', 256, 256, (g, w, h) => {   // dark damp patch on concrete
  const r = rnd(95), grd = g.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w / 2);
  grd.addColorStop(0, 'rgba(10,10,12,.55)'); grd.addColorStop(1, 'rgba(10,10,12,0)'); g.fillStyle = grd;
  g.beginPath(); for (let k = 0; k <= 30; k++) { const a = k / 30 * PI * 2, rr = w * (.32 + r() * .18); g.lineTo(w / 2 + Math.cos(a) * rr, h / 2 + Math.sin(a) * rr * .8); } g.fill();
});
// lit windows of the skyline (glow material)
for (let v = 0; v < 3; v++) slot('win' + v, 256, 256, (g, w, h) => {
  g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
  const r = rnd(200 + v), cols = 8, rows = 8, cw = w / cols, ch = h / rows;
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const on = r() < (v === 2 ? .12 : .3);
    const warm = r() < .7;
    g.fillStyle = on ? (warm ? `rgba(255,${190 + r() * 40 | 0},${110 + r() * 50 | 0},${.5 + r() * .5})` : `rgba(170,200,255,${.4 + r() * .4})`) : 'rgba(18,20,26,1)';
    g.fillRect(i * cw + cw * .18, j * ch + ch * .22, cw * .64, ch * .56);
  }
});
slot('winlit', 128, 128, (g, w, h) => {   // a lit office window seen from outside (blinds)
  const grd = g.createLinearGradient(0, 0, 0, h); grd.addColorStop(0, '#ffe3b0'); grd.addColorStop(1, '#d9a866'); g.fillStyle = grd; g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(80,60,40,.35)'; for (let y = 4; y < h; y += 9) g.fillRect(0, y, w, 3);
});
slot('stencilSN', 256, 128, (g, w, h) => {   // stencil on tanks: "S&N  DIESEL  No. n"
  txt(g, 'S&N  DIESEL', w / 2, 44, 44, { color: 'rgba(30,30,30,.9)' }); txt(g, 'CAP. 60 000 L', w / 2, 96, 30, { color: 'rgba(30,30,30,.9)' });
});

const SCN = new WeakMap();
function atlas(scene) {
  let st = SCN.get(scene);
  if (st) return st;
  st = {}; SCN.set(scene, st);
  const dt = new BABYLON.DynamicTexture('ry_signs', { width: AW, height: AH }, scene, true);
  dt.hasAlpha = true; dt.wrapU = dt.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;
  const g = dt.getContext(); g.clearRect(0, 0, AW, AH);
  for (const [name, fn] of DRAW) {
    const [x, y, w, h] = SLOTS[name];
    g.save(); g.translate(x, y); g.beginPath(); g.rect(0, 0, w, h); g.clip();
    try { fn(g, w, h); } catch (e) { console.warn('[railyard] sign ' + name + ': ' + e.message); }
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
  const m = new BABYLON.PBRMaterial('m_ry_' + kind, B.scene);
  m.albedoTexture = st.tex; m.metallic = 0; m.roughness = kind === 'glow' ? 1 : .78;
  m.useAlphaFromAlbedoTexture = true;
  if (kind === 'stain') {
    m.transparencyMode = BABYLON.PBRMaterial.PBRMATERIAL_ALPHABLEND; m.alpha = 1; m.zOffset = -2; m.disableDepthWrite = true;
    m.albedoColor = new BABYLON.Color3(1, 1, 1);
  } else {
    m.transparencyMode = BABYLON.PBRMaterial.PBRMATERIAL_ALPHATEST; m.alphaCutOff = .45; m.zOffset = -1;
  }
  if (kind === 'glow') {
    m.transparencyMode = BABYLON.PBRMaterial.PBRMATERIAL_OPAQUE; m.useAlphaFromAlbedoTexture = false;
    m.emissiveTexture = st.tex; m.emissiveColor = new BABYLON.Color3(1, 1, 1); m.emissiveIntensity = 1.4;
    m.albedoColor = new BABYLON.Color3(.02, .02, .02); m.disableLighting = true;
  }
  if (kind === 'lit') {   // a sign under its own lamp: lit albedo + a little emission
    m.emissiveTexture = st.tex; m.emissiveColor = new BABYLON.Color3(.55, .52, .48);
  }
  m.backFaceCulling = true;
  st[kind] = m;
  return m;
}
function uvOf(name) {
  const r = SLOTS[name]; if (!r) throw new Error('railyard sign: unknown slot ' + name);
  const [x, y, w, h] = r, i = 1.5;
  return [(x + i) / AW, 1 - (y + h - i) / AH, (x + w - i) / AW, 1 - (y + i) / AH];   // u0, v0 (bottom), u1, v1 (top)
}
/** A quad of the sign atlas centred at (x, y, z) in the current frame. o.face: 'n' (default, faces +z) | 's' | 'e' | 'w' | 'u'. */
export function sign(B, name, x, y, z, w, h, o = {}) {
  const [u0, v0, u1, v1] = uvOf(name), kind = o.glow ? 'glow' : o.stain ? 'stain' : o.lit ? 'lit' : 'sign';
  const hw = w / 2, hh = h / 2, f = o.face || 'n';
  let P, N;
  // corners: bottom-left, bottom-right, top-right, top-left as seen from the side the face points to
  if (f === 'n') { P = [[-hw, -hh, 0], [hw, -hh, 0], [hw, hh, 0], [-hw, hh, 0]]; N = [0, 0, 1]; }
  else if (f === 's') { P = [[hw, -hh, 0], [-hw, -hh, 0], [-hw, hh, 0], [hw, hh, 0]]; N = [0, 0, -1]; }
  else if (f === 'e') { P = [[0, -hh, hw], [0, -hh, -hw], [0, hh, -hw], [0, hh, hw]]; N = [1, 0, 0]; }
  else if (f === 'w') { P = [[0, -hh, -hw], [0, -hh, hw], [0, hh, hw], [0, hh, -hw]]; N = [-1, 0, 0]; }
  else { P = [[-hw, 0, hh], [hw, 0, hh], [hw, 0, -hh], [-hw, 0, -hh]]; N = [0, 1, 0]; }
  const m = new BABYLON.Mesh('ry_sign', B.scene), vd = new BABYLON.VertexData();
  const pos = [], nor = [];
  for (const p of P) { pos.push(p[0], p[1], p[2]); nor.push(N[0], N[1], N[2]); }
  vd.positions = pos; vd.normals = nor;
  // Babylon flips V on load of a DynamicTexture? (invertY true): v1 = top of the slot
  vd.uvs = [u0, v0, u1, v0, u1, v1, u0, v1];
  // front face: cross(b - a, c - a) . n < 0 -> pick the winding numerically
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
function truck(K, z, rt, axles = 2, wb = 2.6) {   // a bogie on rails whose top is at rt (local x across)
  const g = 1.435 / 2 + .036;
  for (const s of [-1, 1]) {
    K.box('steel_dark', s * .98, rt + .32, z, .14, .5, wb + 1.0, { bev: .03 });
    K.box('steel_dark', s * .98, rt + .12, z, .1, .2, wb + .4);
    for (let i = 0; i < axles; i++) K.box('steel_dark', s * 1.04, rt + .28, z - wb / 2 + i * wb / (axles - 1), .08, .36, .5, { bev: .02 });   // journal boxes
  }
  for (let i = 0; i < axles; i++) {
    const az = z - wb / 2 + i * wb / (axles - 1);
    K.cylX('steel_dark', -.95, .95, rt + .5, az, .085, { seg: 8 });
    for (const s of [-1, 1]) K.lathe('p_rail', [[.49, -.07], [.51, -.05], [.49, -.03], [.45, .07], [.22, .07], [.13, .1]], { rz: -s * PI / 2, x: s * g, y: rt + .5, z: az, seg: 18 });
  }
  K.box('steel_dark', 0, rt + .45, z, 2.0, .34, .7, { bev: .03 });                                   // bolster
  for (const s of [-1, 1]) for (const dz of [-.35, .35]) K.lathe('p_galv', [[.09, 0], [.09, .26]], { x: s * .98, y: rt + .6, z: z + dz, seg: 8 });   // springs
  K.box('steel_dark', 0, rt + .25, z - wb / 2 - .62, 1.6, .12, .1); K.box('steel_dark', 0, rt + .25, z + wb / 2 + .62, 1.6, .12, .1);
}
function handrail(K, mat, pts, y, h = 1.0) {   // posts every <= 1.5 m along a polyline, a top rail and a knee rail
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, z0] = pts[i], [x1, z1] = pts[i + 1], L = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.ceil(L / 1.5));
    for (let k = 0; k <= n; k++) { if (k === 0 && i > 0) continue; const f = k / n; K.cyl(mat, x0 + (x1 - x0) * f, y, z0 + (z1 - z0) * f, .022, h, { seg: 6, caps: false }); }
  }
  K.tube(mat, pts.map(([x, z]) => [x, y + h, z]), .025, { seg: 6 });
  K.tube(mat, pts.map(([x, z]) => [x, y + h * .5, z]), .018, { seg: 5 });
}

// ------------------------------------------------------------------------------------------------ locomotive
/** Diesel road switcher (~17.6 m over couplers, 3.1 m wide, 4.6 m tall), long hood to -z, cab + short hood to +z. */
export function locomotive(B, x, y, z, o = {}) {
  const K = new Kit(o.seed || 7), rt = o.railTop == null ? .17 : o.railTop;   // rail top above y
  const paint = o.paint || 'p_paint_teal', stripe = 'paint_yellow', dark = 'steel_dark';
  const deck = rt + 1.32, L = 16.4, hl = L / 2, W = 3.08;
  // underframe, deck, sills
  K.box(dark, 0, deck - .42, 0, 2.2, .42, L - 1.2);
  K.box(paint, 0, deck - .1, 0, W, .12, L, { bev: .02 });
  K.box(stripe, 0, deck - .32, 0, W + .02, .2, L - .1);
  for (const s of [-1, 1]) {
    K.box(dark, 0, deck - .7, s * (hl - .1), W - .1, .62, .22);                                         // end sills / pilots
    for (let i = 0; i < 7; i++) K.box(i % 2 ? 'paint_black' : stripe, -W / 2 + .3 + i * (W - .6) / 6, deck - .66, s * (hl + .02), (W - .6) / 7, .5, .02);
    K.box(dark, 0, deck - .98, s * (hl + .25), .3, .3, .6, { bev: .04 }); K.box(dark, 0, deck - 1.0, s * (hl + .58), .38, .34, .14, { bev: .05 });   // couplers
    // end steps (grated) and the corner handrails
    for (const sx of [-1, 1]) { K.box('grate', sx * (W / 2 - .3), deck - .6, s * (hl - .3), .5, .03, .35); K.box('grate', sx * (W / 2 - .3), deck - .95, s * (hl - .3), .5, .03, .35); }
    truck(K, s * 5.3, rt, 2, 2.75);
  }
  // fuel tank and air reservoirs between the trucks
  K.box(dark, 0, rt + .55, 0, 2.3, .78, 6.0, { bev: .18 });
  K.decal('un_plate', 1.16, rt + .95, -1.6, .4, .28, { face: 'e' }); K.decal('un_plate', -1.16, rt + .95, 1.6, .4, .28, { face: 'w' });
  for (const s of [-1, 1]) K.cylZ('p_galv', -2.4, 2.4, s * 1.25, deck - .62, .14, { seg: 10 });
  // long hood (to -z): z -hl+.5 .. 2.6
  const hw = 1.02, hz0 = -hl + .55, hz1 = 2.55, hh = 2.55;
  K.box(paint, 0, deck, (hz0 + hz1) / 2, hw * 2, hh, hz1 - hz0, { bev: .12 });
  for (const s of [-1, 1]) {
    for (let z0 = hz0 + .6; z0 < hz1 - .6; z0 += 1.15) {                                                  // hood doors
      K.box(paint, s * (hw + .012), deck + .25, z0 + .5, .02, hh - .6, 1.05, { bev: .01 });
      K.box('p_chrome', s * (hw + .03), deck + 1.3, z0 + .9, .02, .14, .03);
    }
    louvres(K, 'steel_dark', s * (hw + .035), deck + 1.65, hz0 + 1.3, 1.6, .7, 8, { ry: s * PI / 2 });
    // walkway handrails along the hood
    handrail(K, stripe, [[s * (W / 2 - .06), -hl + .4], [s * (W / 2 - .06), hz1 + .1]], deck);
  }
  K.box('steel_dark', 0, deck + hh - .02, hz0 + 1.6, 1.7, .08, 2.6);                                     // radiator grille top
  for (const fz of [hz0 + .9, hz0 + 2.3]) { K.cyl('steel_dark', 0, deck + hh, fz, .55, .09, { seg: 16 }); K.cyl('paint_black', 0, deck + hh + .09, fz, .5, .01, { seg: 16 }); }
  K.box('steel_dark', 0, deck + hh, hz1 - 3.2, .6, .25, 1.0, { bev: .05 });                             // exhaust stack
  K.cyl('paint_black', -.14, deck + hh + .2, hz1 - 3.2, .1, .28, { seg: 10 }); K.cyl('paint_black', .14, deck + hh + .2, hz1 - 3.2, .1, .28, { seg: 10 });
  K.box(paint, 0, deck + hh, hz1 - 6.5, 1.2, .35, 1.6, { bev: .08 });                                   // dynamic brake blister
  // cab
  const cz0 = 2.55, cz1 = 5.75, ch = 3.25;
  K.box(paint, 0, deck, (cz0 + cz1) / 2, W - .14, ch, cz1 - cz0, { bev: .06 });
  K.box(paint, 0, deck + ch, (cz0 + cz1) / 2, W - .06, .14, cz1 - cz0 + .12, { bev: .06 });             // roof overhang
  K.box('steel_dark', 0, deck + ch + .12, (cz0 + cz1) / 2, .5, .18, .5);                                  // horn / AC box
  K.cyl('p_chrome', .35, deck + ch + .14, cz0 + .5, .05, .3, { seg: 8 });
  for (const s of [-1, 1]) {
    K.box('p_glass_dark', s * ((W - .14) / 2 + .005), deck + 1.55, cz0 + 1.0, .02, .95, 1.1);              // side windows
    K.box('p_glass_dark', s * ((W - .14) / 2 + .005), deck + 1.55, cz0 + 2.35, .02, .95, .85);
    K.box('steel_dark', s * ((W - .14) / 2 + .01), deck + 1.5, cz0 + 1.7, .02, 1.05, .06);
    K.box(paint, s * ((W - .14) / 2 + .01), deck + .2, cz0 + .25, .03, 2.1, .7, { bev: .01 });              // cab door (rear)
    K.box('p_glass_dark', s * ((W - .14) / 2 + .02), deck + 1.4, cz0 + .25, .02, .6, .45);
    K.box(stripe, s * ((W - .14) / 2 + .012), deck + .55, (cz0 + cz1) / 2, .02, .12, cz1 - cz0 - .1);
  }
  K.box('p_glass_dark', -.62, deck + 1.65, cz1 + .005, .95, .9, .02); K.box('p_glass_dark', .62, deck + 1.65, cz1 + .005, .95, .9, .02);   // front windows
  K.box('p_glass_dark', -.62, deck + 1.65, cz0 - .005, .9, .8, .02); K.box('p_glass_dark', .62, deck + 1.65, cz0 - .005, .9, .8, .02);
  // short hood (nose) with headlights and number boards
  const nz0 = cz1, nz1 = hl - .45, nh = 1.75;
  K.box(paint, 0, deck, (nz0 + nz1) / 2, hw * 2, nh, nz1 - nz0, { bev: .1 });
  K.box(paint, 0, deck + nh - .02, nz1 - .2, 1.3, .55, .35, { bev: .08 });                               // headlight housing
  for (const s of [-1, 1]) K.cyl('emissive_warm', s * .2, deck + nh + .26, nz1 - .02, .085, .02, { seg: 10, rx: PI / 2 });
  for (const s of [-1, 1]) K.cyl('p_lens_red', s * .9, deck + .55, hl - .01, .07, .02, { seg: 8, rx: PI / 2 });
  K.box(stripe, 0, deck + .3, nz1 + .005, hw * 2 - .02, .3, .02);
  handrail(K, stripe, [[-(W / 2 - .06), nz0 + .2], [-(W / 2 - .06), hl - .25], [W / 2 - .06, hl - .25], [W / 2 - .06, nz0 + .2]], deck);
  handrail(K, stripe, [[-(W / 2 - .06), -hl + .25], [W / 2 - .06, -hl + .25]], deck);
  for (const s of [-1, 1]) K.cyl('emissive_warm', s * .2, deck + hh - .35, -hl + .55 - .01, .08, .02, { seg: 10, rx: -PI / 2 });     // rear headlights
  for (const s of [-1, 1]) K.decal('rail_mark', s * (hw + .025), deck + .75, -1.6, 2.4, .62, { face: s > 0 ? 'e' : 'w' });
  K.noCast('emissive_warm');
  // colliders: trucks (rails up), body above the deck; the space under the frame between the trucks stays open over a pit
  for (const s of [-1, 1]) K.col(0, rt, s * 5.3, 2.3, 1.0, 4.4, { surf: 'metal' });
  K.col(0, rt + .55, 0, 2.3, .8, 6.0, { surf: 'metal' });
  K.col(0, deck - .45, 0, W, .45, L, { surf: 'metal' });
  K.col(0, deck, (hz0 + hz1) / 2, hw * 2, hh, hz1 - hz0, { surf: 'metal' });
  K.col(0, deck, (cz0 + cz1) / 2, W - .14, ch + .2, cz1 - cz0, { surf: 'metal' });
  K.col(0, deck, (nz0 + nz1) / 2, hw * 2, nh + .5, nz1 - nz0, { surf: 'metal' });
  const id = put(B, K, x, y, z, o, 'ry_loco');
  // number boards and the livery lettering (atlas)
  B.push(x, y, z, o.ry || 0);
  const num = o.num || 'locoA';
  sign(B, num, 0, deck + nh + .26, nz1 + .17, .5, .14);
  sign(B, num, 0, deck + hh - .1, hz0 - .03, .5, .14, { face: 's' });
  for (const s of [-1, 1]) {
    sign(B, 'livery', s * (hw + .03), deck + 1.95, -3.5, 4.6, .58, { face: s > 0 ? 'e' : 'w' });
    sign(B, num, s * ((W - .14) / 2 + .03), deck + 2.55, cz0 + 1.7, .7, .2, { face: s > 0 ? 'e' : 'w' });
  }
  B.pop();
  return id;
}

// ------------------------------------------------------------------------------------------------ walk-in boxcar
/** Boxcar with the +x side door slid open and an empty, walkable interior (floor at deck height): stands on a track prop at y. */
export function boxcarOpen(B, x, y, z, o = {}) {
  const K = new Kit(o.seed || 3), RT = .39, deck = RT + 1.1, W = 3.2, L = 15.5, hl = L / 2, H = 3.3, t = .06;
  const body = o.color === 'rust' ? 'metal_rust' : 'p_paint_' + (o.color || 'olive');
  K.box('steel_dark', 0, deck - .35, 0, .6, .35, L - .5);
  K.box('p_wood_sleeper', 0, deck - .1, 0, W - .1, .1, L - .2);                                          // plank floor
  for (const s of [-1, 1]) { K.box('steel_dark', 0, deck - .45, s * (hl - .1), W - .2, .4, .25); K.box('steel_dark', 0, deck - .4, s * (hl + .25), .25, .25, .55, { bev: .03 }); truck(K, s * (hl - 2.4), RT, 2, 1.72); }
  const door = 3.0;   // door opening on +x, centred
  for (const s of [-1, 1]) {
    // side walls (the +x side has the doorway), ribs outside
    const sx = s * (W / 2 - t / 2);
    if (s < 0) K.box(body, sx, deck, 0, t, H, L - .4);
    else { K.box(body, sx, deck, -(door / 2 + (hl - .2 - door / 2) / 2), t, H, hl - .2 - door / 2); K.box(body, sx, deck, door / 2 + (hl - .2 - door / 2) / 2, t, H, hl - .2 - door / 2); }
    for (let zz = -hl + .5; zz < hl - .2; zz += .62) if (s < 0 || Math.abs(zz) > door / 2 + .1) K.box(body, s * (W / 2 + .02), deck + .05, zz, .04, H - .1, .08);
    K.box(body, 0, deck, s * (hl - .2 - t / 2), W, H, t);                                                   // end walls
    for (const sz of [-1, 1]) { K.push(s * (W / 2 - .2), deck - .1, sz * (hl - .21), sz > 0 ? 0 : PI); ladder(K, 'steel_dark', 0, 0, 0, H, { w: .4 }); K.pop(); }
  }
  // the door leaf slid back along the outside of the +x wall
  K.box(body, W / 2 + .1, deck, -door + .1, .06, H - .1, door, { bev: .01 });
  for (let i = 0; i < 4; i++) K.box(body, W / 2 + .14, deck + .3 + i * .8, -door + .1, .03, .05, door - .1);
  K.box('steel_dark', W / 2 + .1, deck - .08, -door / 2, .08, .08, door * 2 + .4); K.box('steel_dark', W / 2 + .1, deck + H - .1, -door / 2, .06, .06, door * 2 + .4);
  K.box(body, 0, deck + H, 0, W + .05, .1, L - .3, { bev: .02 });
  for (let zz = -hl + .6; zz < hl; zz += 1.2) K.box(body, 0, deck + H + .08, zz, W, .04, .1);
  K.decal('rail_mark', -(W / 2 + .025), deck + .7, 4.5, 2.4, .68, { face: 'w' }); K.decal('graffiti_1', -(W / 2 + .025), deck + .9, -4.2, 3.6, 1.6, { face: 'w' });
  K.decal('rail_mark', W / 2 + .14, deck + .7, 4.8, 2.4, .68, { face: 'e' });
  // inside: a couple of crates and loose dunnage
  K.box('p_wood_crate', -.7, deck, -5.6, 1.1, .9, 1.1, { bev: .02 }); K.box('p_wood_crate', -.9, deck + .9, -5.4, .8, .6, .8, { bev: .02 });
  K.box('p_wood_pallet', .6, deck, 5.8, 1.2, .14, .8); K.box('p_wood_pallet', .6, deck + .14, 5.8, 1.2, .14, .8);
  K.box('cardboard', -1.0, deck, 4.6, .6, .45, .5);
  // a step under the doorway (pallets on a crate) so people can climb in
  K.box('p_wood_crate', W / 2 + .5, 0, .8, .8, .62, .9, { bev: .02 }); K.box('p_wood_pallet', W / 2 + .5, .62, .8, .8, .12, 1.1);
  K.col(W / 2 + .5, 0, .8, .8, .74, .9, { surf: 'wood' });
  // colliders: floor (walkable), walls, roof; bogies below
  K.col(0, RT + .2, 0, W, deck - RT - .2, L - .3, { surf: 'wood', walk: true });
  K.col(-(W / 2 - t / 2), deck, 0, t + .04, H, L - .4, { surf: 'sheetmetal' });
  K.col(W / 2 - t / 2, deck, -(door / 2 + (hl - .2 - door / 2) / 2), t + .04, H, hl - .2 - door / 2, { surf: 'sheetmetal' });
  K.col(W / 2 - t / 2, deck, door / 2 + (hl - .2 - door / 2) / 2, t + .04, H, hl - .2 - door / 2, { surf: 'sheetmetal' });
  K.col(W / 2 + .1, deck, -door + .1, .1, H, door, { surf: 'sheetmetal' });
  for (const s of [-1, 1]) K.col(0, deck, s * (hl - .2 - t / 2), W, H, t + .04, { surf: 'sheetmetal' });
  K.col(0, deck + H, 0, W + .05, .14, L - .3, { surf: 'sheetmetal' });
  K.col(-.7, deck, -5.6, 1.1, 1.5, 1.1, { surf: 'wood' });
  K.hide(-.8, deck, -3.2, 'closet', .8); K.hide(.5, deck, 3.6, 'dark', .8);
  return put(B, K, x, y, z, o, 'ry_boxopen');
}

// ------------------------------------------------------------------------------------------------ floodlight mast
export function floodMast(B, x, z, o = {}) {
  const K = new Kit(5), H = o.h || 24, y = o.y || 0;
  K.box('p_concrete_precast', 0, 0, 0, 1.4, .5, 1.4, { bev: .04 });
  K.lathe('p_galv', [[.34, .5], [.3, 4], [.2, H * .7], [.15, H]], { seg: 12, caps: true });
  K.push(0, .5, .32); ladder(K, 'p_galv', 0, 0, 0, H - 2, { w: .42, cage: true }); K.pop();
  for (let i = 1; i < 4; i++) K.box('p_galv', 0, i * H / 4, .25, .5, .04, .5);                           // rest platforms
  // head: a platform with a railing and 2 x 4 lamps aimed forward (+z) and down
  K.box('grate', 0, H - .1, .2, 3.4, .06, 1.1);
  railing(K, 'p_galv', -1.7, -.35, 1.7, -.35, H - .05, { h: .9, toe: false });
  K.box('p_galv', 0, H + .4, .55, 3.4, .1, .1); K.box('p_galv', 0, H + 1.2, .55, 3.4, .1, .1);
  for (let r = 0; r < 2; r++) for (let i = 0; i < 4; i++) {
    K.push(-1.2 + i * .8, H + .25 + r * .8, .62, 0, .55, 0);
    K.box('p_paint_darkgrey', 0, 0, 0, .62, .5, .24, { bev: .02 });
    K.box(o.off ? 'p_lens_clear' : 'emissive_warm', 0, .04, .125, .54, .42, .01);
    K.pop();
  }
  K.noCast('emissive_warm');
  K.box('p_paint_grey', .45, 1.0, .35, .5, .7, .25, { bev: .02 });                                       // switch box
  K.ccyl(0, 0, 0, .7, .5, { surf: 'concrete' }); K.ccyl(0, .5, 0, .34, H, { surf: 'metal' });
  const id = put(B, K, x, y, z, o, 'ry_mast');
  if (o.light !== false) {
    const ry = o.ry || 0, aim = o.aim || 26, drop = o.drop || .62;   // aim: metres ahead on the ground
    const fx = Math.sin(ry), fz = Math.cos(ry), d = Math.hypot(aim, H);
    B.light({ type: 'spot', x: x + fx * .8, y: y + H + .6, z: z + fz * .8, dir: [fx * aim / d, -H / d, fz * aim / d], angle: o.angle || 1.25,
      intensity: o.intensity || 900, range: o.range || 62, color: o.color || [1, .78, .5], fixture: false });
  }
  return id;
}

// ------------------------------------------------------------------------------------------------ track furniture
export function bufferStop(B, x, y, z, o = {}) {
  const K = new Kit(9), rt = o.railTop == null ? .39 : o.railTop, g = 1.435 / 2 + .036;
  for (const s of [-1, 1]) {
    K.box('p_rail', s * g, rt, 0, .14, 1.05, .16);
    K.push(s * g, rt, -.9, 0, -.62, 0); K.box('p_rail', 0, 0, 0, .12, .14, 1.9); K.pop();                 // diagonal struts
    K.box('steel_dark', s * g, rt - .02, -.95, .2, .06, 2.1);
  }
  K.box('paint_red', 0, rt + .7, .02, 2.5, .38, .3, { bev: .03 });
  for (let i = 0; i < 5; i++) K.box('paint_white', -1.0 + i * .5, rt + .7, .175, .22, .38, .01);
  for (const s of [-1, 1]) { K.cylZ('steel_dark', .17, .5, s * .85, rt + .89, .17, { seg: 12 }); K.cyl('p_chrome', s * .85, rt + .72, .5, .2, .02, { seg: 12, rx: PI / 2 }); }
  K.cyl('emissive_red', 0, rt + 1.25, .1, .07, .03, { seg: 10, rx: PI / 2 }); K.box('steel_dark', 0, rt + 1.08, .0, .08, .2, .08); K.noCast('emissive_red');
  K.col(0, rt - .2, -.4, 2.6, 1.3, 1.4, { surf: 'metal' });
  return put(B, K, x, y, z, o, 'ry_buffer');
}
export function signal(B, x, z, o = {}) {
  const K = new Kit(11), y = o.y || 0, asp = o.aspect || 'red';
  const lens = { red: 'emissive_red', amber: 'p_em_amber', green: 'emissive_green' };
  const dark = { red: 'p_lens_red', amber: 'p_lens_amber', green: 'p_plastic_green' };
  if (o.dwarf) {
    K.box('p_concrete_precast', 0, 0, 0, .5, .25, .5);
    K.box('paint_black', 0, .25, 0, .36, .6, .3, { bev: .03 });
    ['red', 'amber'].forEach((c, i) => K.cyl(c === asp ? lens[c] : dark[c], 0, .65 - i * .22, .155, .07, .03, { seg: 10, rx: PI / 2 }));
    K.col(0, 0, 0, .5, .85, .5, { surf: 'metal' });
  } else {
    const H = o.h || 4.2;
    K.box('p_concrete_precast', 0, 0, 0, .8, .4, .8);
    K.cyl('p_galv', 0, .4, 0, .09, H, { seg: 10 });
    K.push(0, .4, -.14); ladder(K, 'p_galv', 0, 0, 0, H - 1.2, { w: .38 }); K.pop();
    K.box('grate', 0, H - .8, -.25, .8, .04, .6);
    K.box('paint_black', 0, H - .55, .05, .42, 1.25, .28, { bev: .05 });
    ['red', 'amber', 'green'].forEach((c, i) => {
      const yy = H + .45 - i * .38;
      K.cyl(c === asp ? lens[c] : dark[c], 0, yy, .2, .1, .02, { seg: 12, rx: PI / 2 });
      K.box('paint_black', 0, yy + .1, .25, .26, .02, .14);                                              // hoods
    });
    K.box('paint_white', 0, H - .9, .2, .3, .3, .01);
    K.col(0, 0, 0, .8, .4, .8, { surf: 'concrete' }); K.ccyl(0, .4, 0, .12, H, { surf: 'metal' }); K.col(0, H - .55, .05, .45, 1.3, .3, { surf: 'metal' });
  }
  K.noCast(lens[asp]);
  return put(B, K, x, y, z, o, 'ry_sig' + (o.dwarf ? 'd' : '') + asp);
}
export function switchStand(B, x, z, o = {}) {
  const K = new Kit(13), y = o.y || 0;
  K.box('p_wood_sleeper', 0, 0, 0, .9, .14, .3);
  K.box('steel_dark', 0, .14, 0, .22, .5, .2, { bev: .02 });
  K.cyl('p_galv', 0, .64, 0, .035, .9, { seg: 6 });
  K.box('paint_red', 0, 1.25, 0, .02, .28, .28); K.box('paint_white', 0, 1.25, 0, .3, .28, .02);
  K.push(.12, .55, 0, 0, 0, .4); K.box('paint_yellow', .2, 0, 0, .5, .05, .05); K.pop();
  K.col(0, 0, 0, .3, 1.0, .3, { surf: 'metal', ray: false });
  return put(B, K, x, y, z, o, 'ry_switch');
}
export function wheelset(B, x, y, z, o = {}) {
  const K = new Kit(17), g = 1.435 / 2 + .036, r = .46;
  K.cylX('p_rail', -1.05, 1.05, r, 0, .085, { seg: 10 });
  for (const s of [-1, 1]) K.lathe('p_rail', [[r + .03, -.07], [r + .05, -.05], [r + .03, -.03], [r - .01, .07], [.22, .07], [.13, .1]], { rz: -s * PI / 2, x: s * g, y: r, z: 0, seg: 20 });
  for (const s of [-1, 1]) K.box('steel_dark', s * 1.0, r - .1, 0, .12, .2, .25);
  K.col(0, 0, 0, 2.1, r * 2 + .06, 1.0, { surf: 'metal' });
  return put(B, K, x, y, z, Object.assign({ inst: true }, o), 'ry_wheelset');
}
export function fuelCrane(B, x, z, o = {}) {
  const K = new Kit(19), y = o.y || 0;
  K.box('p_concrete_precast', 0, 0, 0, .9, .3, .9);
  K.cyl('paint_yellow', 0, .3, 0, .12, 4.6, { seg: 10 });
  K.box('paint_yellow', 0, 2.2, 0, .32, .8, .32, { bev: .03 }); K.cyl('paint_red', 0, 2.6, .2, .12, .03, { seg: 10, rx: PI / 2 });   // meter + valve wheel
  K.tube('paint_yellow', [[0, 4.6, 0], [0, 4.9, .3], [0, 4.9, 2.6]], .1, { seg: 8 });
  K.tube('rubber', [[0, 4.85, 2.6], [0, 4.2, 2.75], [0, 2.4, 2.7], [.1, 1.6, 2.4]], .05, { seg: 6 });
  K.box('steel_dark', .1, 1.3, 2.35, .12, .3, .12);
  K.box('paint_black', 0, .3, -.5, .7, .9, .3, { bev: .02 }); K.decal('haz_flame', 0, .85, -.655, .3, .3, { face: 's' });
  K.col(0, 0, 0, .9, .3, .9, { surf: 'concrete' }); K.ccyl(0, .3, 0, .16, 4.6, { surf: 'metal' }); K.col(0, .3, -.5, .7, .9, .3, { surf: 'metal' });
  return put(B, K, x, y, z, o, 'ry_crane');
}

// ------------------------------------------------------------------------------------------------ skyline
/** Out-of-bounds city block: towers of varied height with lit windows on the faces toward the map. */
export function skyline(B, x0, z0, x1, z1, o = {}) {
  const r = () => B.rand(), faces = o.faces || 'nsew', step = o.step || 14;
  const dx = x1 - x0, dz = z1 - z0, alongX = Math.abs(dx) >= Math.abs(dz), L = alongX ? Math.abs(dx) : Math.abs(dz);
  let u = 0;
  while (u < L - 4) {
    const w = Math.min(L - u, step * (.6 + r() * .8)), d = (o.depth || 18) * (.7 + r() * .6), h = (o.h || 30) * (.4 + r() * 1.0);
    const cx = alongX ? Math.min(x0, x1) + u + w / 2 : (x0 + x1) / 2, cz = alongX ? (z0 + z1) / 2 : Math.min(z0, z1) + u + w / 2;
    const bw = alongX ? w - 1 : d, bd = alongX ? d : w - 1;
    B.box(cx, -1, cz, bw, h + 1, bd, { mat: r() < .5 ? 'concrete_dark' : 'brick', collide: false, cast: false });
    B.box(cx, h, cz, bw + .4, .5, bd + .4, { mat: 'concrete_dark', collide: false, cast: false });
    if (r() < .5) B.box(cx + (r() - .5) * bw * .4, h + .5, cz + (r() - .5) * bd * .4, 3, 2, 3, { mat: 'metal_painted', collide: false, cast: false });
    const v = Math.floor(r() * 3), win = 'win' + v, wh = Math.min(h - 4, 3.2 * Math.floor((h - 4) / 3.2));
    if (wh > 3) for (const f of faces) {
      const fw = f === 'n' || f === 's' ? bw : bd;
      const tiles = Math.max(1, Math.round(fw / 24));
      for (let t = 0; t < tiles; t++) {
        const tw = (fw - 2) / tiles, off = -fw / 2 + 1 + tw * (t + .5);
        for (let yy = 3; yy + 1 < wh; yy += 25.6) {
          const hh = Math.min(25.6, wh - yy);
          const px = f === 'e' ? cx + bw / 2 + .05 : f === 'w' ? cx - bw / 2 - .05 : cx + off, pz = f === 'n' ? cz + bd / 2 + .05 : f === 's' ? cz - bd / 2 - .05 : cz + off;
          sign(B, 'win' + ((v + t + (yy | 0)) % 3), px, yy + hh / 2, pz, tw, hh, { face: f, glow: true });
        }
      }
    }
    u += w;
  }
}
export function catwalkRail(B, x0, z0, x1, z1, y, o = {}) {
  const K = new Kit(23), L = Math.hypot(x1 - x0, z1 - z0), mat = o.mat || 'paint_yellow';
  handrail(K, mat, [[0, 0], [0, L]], 0, o.h || 1.05);
  if (o.toe !== false) K.box(mat, 0, 0, L / 2, .02, .12, L);
  K.col(0, 0, L / 2, .08, o.h || 1.05, L, { surf: 'metal', ray: false });
  const ry = Math.atan2(x1 - x0, z1 - z0);
  return put(B, K, x0, y, z0, { ry }, 'ry_rail');
}
