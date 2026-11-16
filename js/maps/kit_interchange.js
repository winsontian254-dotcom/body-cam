/* LIVE FIRE — interchange kit: custom prefabs for Route 9 Interchange (js/maps/defs/interchange.js), built with the prop Kit
   (js/maps/props/kit.js) and the MapBuilder. All art is original (fictional "Route 9 Toll Authority", "Halcyon" fuel, place
   names Ashby / Kerrow / Millbrook).
   Exports:
     sign(B, slot, x, y, z, w, h, o)       a quad of the interchange sign atlas centred at (x, y, z): o = { face: 'n'|'s'|'e'|'w'|'u',
                                           glow (emissive), stain (alpha-blended grime), lit (lit sign) }
     paint(B, x0, z0, x1, z1, o)            road paint strip (o.mat 'paint_white' | 'paint_yellow', o.y road top)
     dashes(B, x, z0, z1, o)                dashed lane line along z at x (3 m dash, 6 m gap); o.alongX: along x at z = x arg
     guardrail(B, x0, z0, x1, z1, o)        W-beam guardrail on posts (straight), collider .78 m (vaultable)
     tollBooth(B, x, z, o)                  toll island (1.8 x o.len) with a booth kiosk, attenuator nose and bollards
     pump(B, x, y, z, o)                    fuel dispenser (two hoses, display), runs along x
     pier(B, x, z, o)                       overpass hammerhead pier: column + cap (top at o.top), o.w cap length along z
     deck(B, x0, x1, z0, z1, top, o)        overpass deck: slab, 4 girders, parapets (o.parapet: 'both'|'n'|'s'|'none'), collider
     span(B, xLow, xHigh, z0, z1, yLow, yHigh)  the collapsed span: tilted slab + girders + parapets, segmented ramp colliders
     brokenEnd(B, x, z0, z1, top, dir)      ragged concrete edge with rebar at a broken deck end (dir +1 = deck continues to +x)
     gantry(B, x0, x1, z, o)                sign gantry over a road along x at z: posts, truss, o.signs [[slot, cx, w, h]]
     rubble(B, x, y, z, o)                  heap of concrete chunks and rebar (o.n, o.r)
     skyline(B, x0, z0, x1, z1, o)          distant day-lit town blocks (facades from the atlas) for out-of-bounds views
     noiseWall(B, x0, z0, x1, z1, o)        concrete noise barrier panels between steel H posts (o.h)
     tape(B, pts, y)                        police tape between points (no collider)
     slopeRail(B, xa, ya, xb, yb, z)        sloped parapet along x (embankment ramps)
   All placement follows the builder convention: y = bottom, front = +z. */
import { Kit, emitKit } from './props/kit.js';

const PI = Math.PI;

// ------------------------------------------------------------------------------------------------ sign atlas
const AW = 1024, AH = 1024;
const SANS = 'Arial, Helvetica, "Liberation Sans", sans-serif', COND = '"Arial Narrow", Arial, Helvetica, sans-serif';
const SLOTS = {}, DRAW = [];
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
  for (let i = 0; i < 90; i++) { g.fillStyle = `rgba(35,30,24,${(r() * amt).toFixed(3)})`; g.fillRect(r() * w, r() * h, 1 + r() * 5, 1 + r() * 3); }
  for (let i = 0; i < 8; i++) { g.fillStyle = `rgba(30,26,20,${(r() * amt * .6).toFixed(3)})`; g.fillRect(r() * w, r() * h * .2, 1 + r() * 3, h * (.4 + r() * .6)); }
}
function rrect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
function shield(g, x, y, s, num, col = '#fff', ink = '#111') {   // a generic state-route shield
  g.save(); g.translate(x, y); g.fillStyle = col; g.strokeStyle = ink; g.lineWidth = s * .05;
  g.beginPath(); g.moveTo(-s * .42, -s * .44); g.lineTo(s * .42, -s * .44); g.lineTo(s * .44, s * .05); g.quadraticCurveTo(s * .3, s * .38, 0, s * .5);
  g.quadraticCurveTo(-s * .3, s * .38, -s * .44, s * .05); g.closePath(); g.fill(); g.stroke();
  txt(g, num, 0, s * .02, s * .5, { color: ink }); g.restore();
}
function arrowUp(g, x, y, s, col) { g.save(); g.translate(x, y); g.fillStyle = col; g.beginPath(); g.moveTo(0, -s / 2); g.lineTo(s * .38, -s * .08); g.lineTo(s * .13, -s * .08); g.lineTo(s * .13, s / 2); g.lineTo(-s * .13, s / 2); g.lineTo(-s * .13, -s * .08); g.lineTo(-s * .38, -s * .08); g.closePath(); g.fill(); g.restore(); }
function sun(g, x, y, s, col) {   // the Halcyon mark: a half sun over a line
  g.save(); g.translate(x, y); g.fillStyle = col; g.strokeStyle = col; g.lineWidth = s * .07;
  g.beginPath(); g.arc(0, s * .1, s * .26, PI, 0); g.fill();
  for (let i = 0; i < 7; i++) { const a = PI + (i + .5) * PI / 7; g.beginPath(); g.moveTo(Math.cos(a) * s * .34, s * .1 + Math.sin(a) * s * .34); g.lineTo(Math.cos(a) * s * .5, s * .1 + Math.sin(a) * s * .5); g.stroke(); }
  g.fillRect(-s * .5, s * .16, s, s * .07); g.restore();
}
const GREEN = '#0f5a37', GLINE = '#f2f2ec';
// big green guide signs
slot('g_north', 512, 192, (g, w, h) => {
  g.fillStyle = GREEN; rrect(g, 0, 0, w, h, 18); g.fill(); g.strokeStyle = GLINE; g.lineWidth = 6; rrect(g, 8, 8, w - 16, h - 16, 12); g.stroke();
  shield(g, 86, 70, 96, '9'); txt(g, 'NORTH', 86, 140, 30, { color: GLINE });
  txt(g, 'Kerrow', 330, 64, 52, { color: GLINE, weight: 'normal', maxW: 300 }); txt(g, 'Ashby', 330, 128, 52, { color: GLINE, weight: 'normal', maxW: 300 });
  dirt(g, w, h, 3, .18);
});
slot('g_exit', 512, 192, (g, w, h) => {
  g.fillStyle = GREEN; rrect(g, 0, 0, w, h, 18); g.fill(); g.strokeStyle = GLINE; g.lineWidth = 6; rrect(g, 8, 8, w - 16, h - 16, 12); g.stroke();
  g.fillStyle = GLINE; g.fillRect(330, 14, 168, 40); txt(g, 'EXIT 14', 414, 35, 32, { color: GREEN });
  shield(g, 80, 92, 84, '41'); txt(g, 'EAST', 80, 150, 26, { color: GLINE });
  txt(g, 'Millbrook', 300, 100, 50, { color: GLINE, weight: 'normal', maxW: 260 });
  g.save(); g.translate(430, 140); g.rotate(PI / 4); arrowUp(g, 0, 0, 56, GLINE); g.restore();
  dirt(g, w, h, 5, .18);
});
slot('g_south', 512, 192, (g, w, h) => {
  g.fillStyle = GREEN; rrect(g, 0, 0, w, h, 18); g.fill(); g.strokeStyle = GLINE; g.lineWidth = 6; rrect(g, 8, 8, w - 16, h - 16, 12); g.stroke();
  shield(g, 86, 70, 96, '9'); txt(g, 'SOUTH', 86, 140, 30, { color: GLINE });
  txt(g, 'Harlow Bay', 320, 64, 50, { color: GLINE, weight: 'normal', maxW: 300 }); txt(g, 'Port Ennis', 320, 128, 50, { color: GLINE, weight: 'normal', maxW: 300 });
  dirt(g, w, h, 7, .18);
});
slot('g_toll', 512, 128, (g, w, h) => {
  g.fillStyle = '#e8c21a'; rrect(g, 0, 0, w, h, 12); g.fill(); g.strokeStyle = '#111'; g.lineWidth = 6; rrect(g, 8, 8, w - 16, h - 16, 8); g.stroke();
  txt(g, 'TOLL PLAZA', w / 2, 48, 54, { color: '#111' }); txt(g, '1/2 MILE  -  PREPARE TO STOP', w / 2, 98, 26, { color: '#111', maxW: w - 40 });
  dirt(g, w, h, 9, .2);
});
slot('evac', 256, 128, (g, w, h) => {
  g.fillStyle = '#f1f0ea'; rrect(g, 0, 0, w, h, 8); g.fill(); g.fillStyle = '#1f4fa8'; g.fillRect(10, 10, w - 20, 62);
  txt(g, 'EVACUATION', w / 2, 32, 30, { color: '#fff' }); txt(g, 'ROUTE', w / 2, 58, 26, { color: '#fff' });
  g.save(); g.translate(w / 2, 100); g.rotate(PI / 2); arrowUp(g, 0, 0, 44, '#1f4fa8'); g.restore(); dirt(g, w, h, 11, .2);
});
slot('closed', 256, 128, (g, w, h) => {
  g.fillStyle = '#f1f0ea'; g.fillRect(0, 0, w, h); g.strokeStyle = '#111'; g.lineWidth = 6; g.strokeRect(6, 6, w - 12, h - 12);
  txt(g, 'ROAD', w / 2, 42, 44, { color: '#111' }); txt(g, 'CLOSED', w / 2, 90, 44, { color: '#111' }); dirt(g, w, h, 13, .2);
});
slot('police', 256, 128, (g, w, h) => {
  g.fillStyle = '#1b2a4a'; g.fillRect(0, 0, w, h); g.fillStyle = '#f2f2f2'; g.fillRect(0, 84, w, 6);
  txt(g, 'POLICE', w / 2, 40, 54, { color: '#f2f2f2' }); txt(g, 'CHECKPOINT  -  STOP', w / 2, 108, 22, { color: '#f2f2f2' }); dirt(g, w, h, 15, .15);
});
slot('tape', 512, 32, (g, w, h) => {
  g.fillStyle = '#f0c419'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 2; i++) txt(g, 'POLICE LINE  DO NOT CROSS', w * (.25 + i * .5), h / 2 + 1, 20, { color: '#111', maxW: w / 2 - 10 });
});
// toll plaza
slot('tollhdr', 512, 96, (g, w, h) => {
  g.fillStyle = '#16365e'; g.fillRect(0, 0, w, h); g.fillStyle = '#f1f1ea'; g.fillRect(0, 76, w, 5);
  txt(g, 'ROUTE 9 TOLL AUTHORITY', w / 2, 40, 40, { color: '#f1f1ea', maxW: w - 30 }); dirt(g, w, h, 17, .15);
});
for (let i = 1; i <= 9; i++) slot('ln' + i, 64, 64, (g, w, h) => {
  g.fillStyle = '#16365e'; g.fillRect(0, 0, w, h); g.strokeStyle = '#f1f1ea'; g.lineWidth = 3; g.strokeRect(4, 4, w - 8, h - 8);
  txt(g, String(i), w / 2, h / 2 + 2, 42, { color: '#f1f1ea' });
});
slot('cash', 128, 64, (g, w, h) => { g.fillStyle = '#1a6a3a'; g.fillRect(0, 0, w, h); txt(g, 'CASH', w / 2, h / 2 + 2, 38, { color: '#fff' }); });
slot('epass', 128, 64, (g, w, h) => { g.fillStyle = '#5b2c86'; g.fillRect(0, 0, w, h); txt(g, 'E-PASS', w / 2, h / 2 + 2, 34, { color: '#fff' }); });
slot('xred', 64, 64, (g, w, h) => { g.fillStyle = '#050505'; g.fillRect(0, 0, w, h); g.strokeStyle = '#ff2a1a'; g.lineWidth = 9; g.beginPath(); g.moveTo(14, 14); g.lineTo(50, 50); g.moveTo(50, 14); g.lineTo(14, 50); g.stroke(); });
slot('agreen', 64, 64, (g, w, h) => { g.fillStyle = '#050505'; g.fillRect(0, 0, w, h); arrowUp(g, w / 2, h / 2, 44, '#2aff5a'); });
slot('booth', 128, 64, (g, w, h) => { g.fillStyle = '#d9d6cc'; g.fillRect(0, 0, w, h); txt(g, 'STOP', w / 2, 24, 30, { color: '#b3151b' }); txt(g, 'PAY TOLL', w / 2, 48, 20, { color: '#222' }); dirt(g, w, h, 19, .2); });
// service station
slot('halcyon', 512, 128, (g, w, h) => {
  g.fillStyle = '#b81e1e'; g.fillRect(0, 0, w, h); g.fillStyle = '#f5f2e8'; g.fillRect(0, 100, w, 8);
  sun(g, 70, 54, 96, '#f6c21a'); txt(g, 'HALCYON', 290, 54, 72, { color: '#f5f2e8', maxW: 360 }); dirt(g, w, h, 21, .12);
});
slot('mart', 512, 128, (g, w, h) => {
  g.fillStyle = '#f2efe6'; g.fillRect(0, 0, w, h); g.fillStyle = '#b81e1e'; g.fillRect(0, 0, 120, h);
  sun(g, 60, 60, 84, '#f6c21a'); txt(g, 'HALCYON MART', 316, 48, 52, { color: '#b81e1e', maxW: 370 });
  txt(g, 'OPEN 24 HOURS  -  COFFEE  -  SNACKS  -  ICE', 316, 96, 20, { color: '#333', maxW: 370 }); dirt(g, w, h, 23, .15);
});
slot('price', 128, 256, (g, w, h) => {
  g.fillStyle = '#b81e1e'; g.fillRect(0, 0, w, 64); sun(g, w / 2, 30, 50, '#f6c21a');
  g.fillStyle = '#0b0b0b'; g.fillRect(0, 64, w, h - 64);
  const rows = [['REG', '3.89'], ['PLUS', '4.09'], ['PREM', '4.29'], ['DSL', '4.19']];
  rows.forEach(([k, v], i) => { txt(g, k, 26, 92 + i * 44, 16, { color: '#ddd' }); txt(g, v, 86, 92 + i * 44, 34, { color: '#ff3a24', font: '"Courier New", monospace' }); });
});
slot('wash', 256, 96, (g, w, h) => {
  g.fillStyle = '#1f62b0'; g.fillRect(0, 0, w, h); txt(g, 'CAR WASH', w / 2, 40, 46, { color: '#fff' });
  txt(g, 'TOUCHLESS  -  ENTER HERE', w / 2, 78, 18, { color: '#dbe9ff' }); dirt(g, w, h, 25, .15);
});
slot('noz', 128, 64, (g, w, h) => { g.fillStyle = '#e9e6dc'; g.fillRect(0, 0, w, h); txt(g, 'NO SMOKING', w / 2, 22, 20, { color: '#b3151b' }); txt(g, 'ENGINE OFF', w / 2, 46, 18, { color: '#222' }); });
slot('pumpnum', 128, 64, (g, w, h) => { g.fillStyle = '#b81e1e'; g.fillRect(0, 0, w, h); txt(g, 'PUMP', w / 2, 20, 18, { color: '#fff' }); txt(g, '1  2  3  4', w / 2, 46, 24, { color: '#f6c21a' }); });
// depot
slot('depot', 512, 128, (g, w, h) => {
  g.fillStyle = '#e7e1cf'; g.fillRect(0, 0, w, h); g.fillStyle = '#2d5a2e'; g.fillRect(0, 0, w, 36);
  txt(g, 'COUNTY OF MERRIN', w / 2, 19, 24, { color: '#fff' }); txt(g, 'HIGHWAY DEPOT 3', w / 2, 72, 50, { color: '#2d5a2e', maxW: w - 30 });
  txt(g, 'STAFF ONLY  -  KEEP DOORS CLEAR', w / 2, 108, 18, { color: '#333' }); dirt(g, w, h, 27, .2);
});
slot('salt', 256, 64, (g, w, h) => { g.fillStyle = '#2d5a2e'; g.fillRect(0, 0, w, h); txt(g, 'SALT STORE  B', w / 2, h / 2 + 2, 34, { color: '#f0ead6' }); dirt(g, w, h, 29, .2); });
slot('admin', 256, 64, (g, w, h) => { g.fillStyle = '#16365e'; g.fillRect(0, 0, w, h); txt(g, 'PLAZA ADMIN', w / 2, 24, 30, { color: '#fff' }); txt(g, 'STAFF ENTRANCE', w / 2, 50, 16, { color: '#cfd8e6' }); });
slot('bridge', 256, 64, (g, w, h) => {   // bridge number plate on a pier
  g.fillStyle = '#f0eee6'; g.fillRect(0, 0, w, h); g.strokeStyle = '#111'; g.lineWidth = 3; g.strokeRect(3, 3, w - 6, h - 6);
  txt(g, 'BR 9-0414', w / 2, 24, 26, { color: '#111' }); txt(g, 'CLEARANCE 16 FT 9 IN', w / 2, 48, 16, { color: '#111' });
});
slot('clear', 256, 64, (g, w, h) => { g.fillStyle = '#e8c21a'; g.fillRect(0, 0, w, h); g.strokeStyle = '#111'; g.lineWidth = 4; g.strokeRect(4, 4, w - 8, h - 8); txt(g, 'LOW CLEARANCE  16\' 9"', w / 2, h / 2 + 2, 24, { color: '#111', maxW: w - 20 }); });
slot('mile', 64, 128, (g, w, h) => { g.fillStyle = GREEN; g.fillRect(0, 0, w, h); g.strokeStyle = GLINE; g.lineWidth = 3; g.strokeRect(4, 4, w - 8, h - 8); txt(g, 'MILE', w / 2, 26, 14, { color: GLINE }); txt(g, '62', w / 2, 66, 32, { color: GLINE }); txt(g, '.4', w / 2, 100, 22, { color: GLINE }); });
// painted site letters (alpha)
for (const L of ['A', 'B']) slot('site' + L, 128, 128, (g, w, h) => {
  g.fillStyle = 'rgba(244,240,228,.92)'; g.font = 'bold 120px ' + SANS; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(L, w / 2, h / 2 + 6);
  const r = rnd(L.charCodeAt(0)); g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 160; i++) { g.fillStyle = `rgba(0,0,0,${(.3 + r() * .7).toFixed(2)})`; g.fillRect(r() * w, r() * h, 1 + r() * 6, 1 + r() * 3); }
  g.globalCompositeOperation = 'source-over';
});
slot('only', 256, 64, (g, w, h) => {   // road legend (alpha): "ONLY"
  txt(g, 'TOLL', w / 2, h / 2, 60, { color: 'rgba(240,238,230,.9)', font: COND });
  const r = rnd(77); g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 120; i++) { g.fillStyle = `rgba(0,0,0,${(.3 + r() * .7).toFixed(2)})`; g.fillRect(r() * w, r() * h, 1 + r() * 6, 1 + r() * 3); }
  g.globalCompositeOperation = 'source-over';
});
// grime (stain material: alpha-blended)
for (let i = 0; i < 4; i++) slot('oil' + i, 128, 128, (g, w, h) => {
  const r = rnd(40 + i), grd = g.createRadialGradient(w / 2, h / 2, 4, w / 2, h / 2, w / 2);
  grd.addColorStop(0, 'rgba(8,7,6,.7)'); grd.addColorStop(.55, 'rgba(14,12,10,.4)'); grd.addColorStop(1, 'rgba(20,16,12,0)');
  g.fillStyle = grd; g.beginPath();
  for (let k = 0; k <= 24; k++) { const a = k / 24 * PI * 2, rr = w * (.3 + r() * .2); g.lineTo(w / 2 + Math.cos(a) * rr, h / 2 + Math.sin(a) * rr); }
  g.fill();
});
slot('scorch', 256, 256, (g, w, h) => {   // burn scar under a burnt car
  const r = rnd(61), grd = g.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w / 2);
  grd.addColorStop(0, 'rgba(6,5,5,.9)'); grd.addColorStop(.5, 'rgba(12,10,9,.6)'); grd.addColorStop(1, 'rgba(20,18,16,0)');
  g.fillStyle = grd; g.beginPath(); for (let k = 0; k <= 30; k++) { const a = k / 30 * PI * 2, rr = w * (.34 + r() * .16); g.lineTo(w / 2 + Math.cos(a) * rr, h / 2 + Math.sin(a) * rr * .8); } g.fill();
});
slot('skid', 256, 64, (g, w, h) => {   // tyre marks (two parallel streaks)
  for (const y0 of [12, 40]) { const grd = g.createLinearGradient(0, 0, w, 0); grd.addColorStop(0, 'rgba(10,10,10,0)'); grd.addColorStop(.2, 'rgba(10,10,10,.55)'); grd.addColorStop(1, 'rgba(10,10,10,.3)'); g.fillStyle = grd; g.fillRect(0, y0, w, 12); }
});
slot('crack', 256, 256, (g, w, h) => {   // asphalt cracks with tar seal
  const r = rnd(83); g.strokeStyle = 'rgba(12,12,12,.6)'; g.lineCap = 'round';
  for (let k = 0; k < 7; k++) { let x = r() * w, y = r() * h; g.lineWidth = 2 + r() * 4; g.beginPath(); g.moveTo(x, y); for (let s = 0; s < 8; s++) { x += (r() - .5) * 60; y += (r() - .3) * 40; g.lineTo(x, y); } g.stroke(); }
});
slot('streak', 128, 256, (g, w, h) => {   // run-off streaks under a ledge (top dark, fading down)
  const r = rnd(77);
  for (let i = 0; i < 26; i++) {
    const x = r() * w, len = h * (.3 + r() * .7), a = .08 + r() * .3, grd = g.createLinearGradient(0, 0, 0, len);
    grd.addColorStop(0, `rgba(28,24,18,${a})`); grd.addColorStop(1, 'rgba(28,24,18,0)'); g.fillStyle = grd; g.fillRect(x, 0, 2 + r() * 7, len);
  }
});
slot('graf0', 512, 128, (g, w, h) => {   // tags on concrete (original lettering)
  const r = rnd(101); g.lineJoin = 'round';
  for (const [s, x, c] of [['KRW', 120, '#d6402a'], ['SOLO', 330, '#2a7fd6']]) {
    g.save(); g.translate(x, 64); g.rotate(-.08 + r() * .16); g.font = 'bold italic 78px ' + SANS; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 10; g.strokeStyle = 'rgba(20,20,20,.85)'; g.strokeText(s, 0, 0); g.fillStyle = c; g.fillText(s, 0, 0); g.restore();
  }
});
slot('graf1', 512, 128, (g, w, h) => {
  g.save(); g.translate(256, 64); g.rotate(-.05); g.font = 'bold 64px ' + SANS; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = 'rgba(235,235,230,.9)'; g.fillText('GET OUT WHILE U CAN', 0, 0); g.restore();
  g.fillStyle = 'rgba(235,235,230,.7)'; for (let i = 0; i < 9; i++) g.fillRect(40 + i * 50, 100 + (i % 3) * 3, 3, 14 + (i % 4) * 6);   // drips
});
// facades for the out-of-bounds town (lit by the scene, not glowing)
for (let v = 0; v < 3; v++) slot('fac' + v, 256, 256, (g, w, h) => {
  const base = ['#8d877c', '#6f6a64', '#9a8f80'][v]; g.fillStyle = base; g.fillRect(0, 0, w, h);
  const r = rnd(200 + v), cols = v === 1 ? 6 : 5, rows = 8, cw = w / cols, ch = h / rows;
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const k = r(); g.fillStyle = k < .15 ? '#3a3c3e' : k < .3 ? '#555a5e' : '#24282c';
    g.fillRect(i * cw + cw * .2, j * ch + ch * .2, cw * .6, ch * .55);
    g.fillStyle = 'rgba(255,255,255,.08)'; g.fillRect(i * cw + cw * .2, j * ch + ch * .2, cw * .6, ch * .12);
  }
  g.fillStyle = 'rgba(0,0,0,.15)'; for (let j = 0; j < rows; j++) g.fillRect(0, j * ch + ch * .84, w, ch * .08);
});

const SCN = new WeakMap();
function atlas(scene) {
  let st = SCN.get(scene);
  if (st) return st;
  st = {}; SCN.set(scene, st);
  const dt = new BABYLON.DynamicTexture('ic_signs', { width: AW, height: AH }, scene, true);
  dt.hasAlpha = true; dt.wrapU = dt.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;
  const g = dt.getContext(); g.clearRect(0, 0, AW, AH);
  for (const [name, fn] of DRAW) {
    const [x, y, w, h] = SLOTS[name];
    g.save(); g.translate(x, y); g.beginPath(); g.rect(0, 0, w, h); g.clip();
    try { fn(g, w, h); } catch (e) { console.warn('[interchange] sign ' + name + ': ' + e.message); }
    g.restore();
  }
  dt.update(true);
  st.tex = dt;
  scene.onDisposeObservable.addOnce(() => SCN.delete(scene));
  return st;
}
function signMat(B, kind = 'sign') {
  const st = atlas(B.scene);
  if (st[kind]) return st[kind];
  const m = new BABYLON.PBRMaterial('m_ic_' + kind, B.scene);
  m.albedoTexture = st.tex; m.metallic = 0; m.roughness = kind === 'glow' ? 1 : .7;
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
  if (kind === 'lit') { m.emissiveTexture = st.tex; m.emissiveColor = new BABYLON.Color3(.45, .43, .4); }
  m.backFaceCulling = true;
  st[kind] = m;
  return m;
}
function uvOf(name) {
  const r = SLOTS[name]; if (!r) throw new Error('interchange sign: unknown slot ' + name);
  const [x, y, w, h] = r, i = 1.5;
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
  else { P = [[-hw, 0, -hh], [hw, 0, -hh], [hw, 0, hh], [-hw, 0, hh]]; N = [0, 1, 0]; }   // 'u': up, text reads from -z (south)
  if (o.rot) {   // 'u' decals: turn about y
    const c = Math.cos(o.rot), s = Math.sin(o.rot); P = P.map(([px, py, pz]) => [px * c + pz * s, py, -px * s + pz * c]);
  }
  const m = new BABYLON.Mesh('ic_sign', B.scene), vd = new BABYLON.VertexData();
  const pos = [], nor = [];
  for (const p of P) { pos.push(p[0], p[1], p[2]); nor.push(N[0], N[1], N[2]); }
  vd.positions = pos; vd.normals = nor;
  vd.uvs = [u0, v0, u1, v0, u1, v1, u0, v1];
  const ax = P[1][0] - P[0][0], ay = P[1][1] - P[0][1], az = P[1][2] - P[0][2], bx = P[2][0] - P[0][0], by = P[2][1] - P[0][1], bz = P[2][2] - P[0][2];
  const cx = ay * bz - az * by, cy = az * bx - ax * bz, cz = ax * by - ay * bx;
  vd.indices = cx * N[0] + cy * N[1] + cz * N[2] < 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2];
  vd.applyToMesh(m, false);
  m.material = signMat(B, kind);
  m.position.set(x, y, z);
  B.mesh(m, { collide: 'none', cast: false });
}

// ------------------------------------------------------------------------------------------------ road paint
export function paint(B, x0, z0, x1, z1, o = {}) {
  const y = o.y == null ? 0.02 : o.y;
  B.boxc(x0, y, z0, x1, y + 0.006, z1, { mat: o.mat || 'paint_white', collide: false, cast: false });
}
export function dashes(B, a, b0, b1, o = {}) {
  const dl = o.dash || 3, gap = o.gap || 6, wd = o.w || 0.12;
  for (let t = b0; t + dl <= b1 + 1e-6; t += dl + gap) {
    if (o.alongX) paint(B, t, a - wd / 2, t + dl, a + wd / 2, o); else paint(B, a - wd / 2, t, a + wd / 2, t + dl, o);
  }
}

// ------------------------------------------------------------------------------------------------ guardrail
const GR_PROF = [[0, 0], [.08, .02], [.1, .1], [.08, .18], [.1, .26], [.08, .34], [0, .32], [.02, .26], [0, .18], [.02, .1]];
export function guardrail(B, x0, z0, x1, z1, o = {}) {
  const L = Math.hypot(x1 - x0, z1 - z0); if (L < .5) return;
  const ry = Math.atan2(x1 - x0, z1 - z0), y = o.y || 0;
  const K = new Kit(5);
  const n = Math.max(1, Math.round(L / 1.9));
  for (let i = 0; i <= n; i++) {
    const zz = -L / 2 + L * i / n;
    K.box('p_galv', 0, 0, zz, .1, .72, .15);                          // C-post (behind the beam, -x side)
    K.box('p_galv', .09, .42, zz, .12, .25, .12);                     // blockout
  }
  K.push(.15, .44, 0);
  K.ext('p_galv', GR_PROF.map(([px, py]) => [px, py]), -L / 2, L / 2, { smooth: 40 });
  K.pop();
  B.push((x0 + x1) / 2, y, (z0 + z1) / 2, ry);
  emitKit(B, K, 0, 0, 0, { collide: false }, 'guardrail');
  if (o.collide !== false) B.collider({ cx: .08, cy: .39, cz: 0, hx: .16, hy: .39, hz: L / 2, surf: 'metal', ray: false });
  B.pop();
}

// ------------------------------------------------------------------------------------------------ toll booth island
function boothKit(len, seed) {
  const K = new Kit(seed);
  // island: kerbed concrete, yellow-black nose
  K.box('concrete', 0, 0, 0, 1.8, .2, len, { bev: .03 });
  K.box('hazard', 0, 0, len / 2 - .6, 1.82, .22, 1.2, { mats: { t: 'concrete' } });
  K.box('hazard', 0, 0, -len / 2 + .6, 1.82, .22, 1.2, { mats: { t: 'concrete' } });
  // crash attenuator (yellow drum cluster) on the south nose
  for (const dz of [0, .62]) K.cyl('p_plastic_yellow', 0, .2, -len / 2 + .4 - dz, .36, .95, { seg: 14 });
  K.cyl('p_coat_black', 0, 1.0, -len / 2 + .4, .2, .04, { seg: 12 });
  // booth: 1.4 x 2.8 footprint, steel base, glass band, roof
  const bz = 0, bw = 1.4, bd = 2.8;
  K.box('p_coat_white', 0, .2, bz, bw, 1.05, bd, { bev: .02 });
  K.box('p_glass_tint', 0, 1.25, bz, bw - .04, 1.05, bd - .04);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) K.box('p_coat_slate', sx * (bw / 2 - .03), 1.25, bz + sz * (bd / 2 - .03), .08, 1.05, .08);
  K.box('p_coat_slate', 0, 2.3, bz, bw + .3, .18, bd + .3, { bev: .02 });
  K.box('p_coat_white', 0, 2.48, bz, bw + .1, .12, bd + .1);
  K.box('p_coat_slate', bw / 2 + .01, .2, bz + .6, .02, 2.0, .7);                   // door (east side)
  K.box('p_coat_slate', -bw / 2 - .12, 1.0, bz - .2, .24, .12, .5);                  // pay window shelf (west, driver side)
  K.box('p_plastic_dark', -bw / 2 - .05, 1.12, bz - .2, .08, .32, .36);              // card reader
  // lane signal head on a pole at the north end + bollards
  K.cyl('p_galv', 0, .2, len / 2 - .9, .05, 2.4, { seg: 8 });
  K.box('p_coat_black', 0, 2.4, len / 2 - .9, .32, .5, .3);
  for (const dz of [-1.8, 1.8]) K.cyl('p_coat_yellow', .55, .2, bz + dz + (dz > 0 ? .6 : -.6), .08, .9, { seg: 10 });
  K.col(0, .2, bz, bw + .1, 2.4, bd + .1, { surf: 'metal' });
  K.ccyl(0, .2, -len / 2 + .4, .38, .95, { surf: 'rubber' }); K.ccyl(0, .2, -len / 2 - .22, .38, .95, { surf: 'rubber' });
  return K;
}
const BOOTHS = new Map();
export function tollBooth(B, x, z, o = {}) {
  const len = o.len || 20, key = 'booth' + len;
  let K = BOOTHS.get(key); if (!K) { K = boothKit(len, 7); BOOTHS.set(key, K); }
  emitKit(B, K, x, 0, z, { ry: o.ry || 0 }, key);
  // the island top is walkable: a collider for the kerbed slab (not in the kit so its top is exact)
  B.collider({ cx: x, cy: .1, cz: z, hx: .9, hy: .1, hz: len / 2, surf: 'concrete' });
}

// ------------------------------------------------------------------------------------------------ fuel pump
let PUMPK = null;
export function pump(B, x, y, z, o = {}) {
  if (!PUMPK) {
    const K = new Kit(9);
    K.box('p_stainless', 0, 0, 0, 1.25, .12, .55);
    K.box('p_coat_white', 0, .12, 0, 1.1, 1.55, .46, { bev: .03 });
    K.box('p_coat_red', 0, 1.67, 0, 1.16, .38, .5, { bev: .03 });
    for (const sz of [-1, 1]) {
      K.box('p_screen', -.22, 1.12, sz * .235, .34, .22, .01);
      K.box('p_em_dim', .22, 1.18, sz * .235, .22, .1, .008);
      K.box('p_plastic_dark', .22, .95, sz * .235, .2, .14, .01);
      for (let i = 0; i < 3; i++) K.box(['p_plastic_yellow', 'p_plastic_green', 'p_plastic_red'][i], -.36 + i * .18, .72, sz * .24, .12, .1, .03);
    }
    // nozzles in their boots, hoses looping down
    for (const sx of [-1, 1]) {
      K.box('p_plastic_dark', sx * .6, .85, 0, .1, .3, .14);
      K.tube('p_plastic_dark', [[sx * .58, 1.6, 0], [sx * .7, 1.3, .05], [sx * .74, .7, .12], [sx * .66, .35, .16], [sx * .62, .85, .02]], .018, { seg: 6 });
    }
    K.col(0, 0, 0, 1.25, 2.05, .55, { surf: 'metal' });
    PUMPK = K;
  }
  emitKit(B, PUMPK, x, y, z, { ry: o.ry || 0, inst: true }, 'ic_pump');
}
/** sloped concrete parapet (with a galvanised rail) along x at z, from (xa, ya) to (xb, yb) road-top heights; stepped colliders */
export function slopeRail(B, xa, ya, xb, yb, z) {
  const dx = xb - xa, dy = yb - ya, L = Math.hypot(dx, dy), ang = Math.atan2(dy, dx);
  const K = new Kit(19);
  K.push((xa + xb) / 2, (ya + yb) / 2, z, 0, 0, ang);
  K.box('concrete', 0, -.3, 0, L, 1.12, .4, { mats: { t: 'concrete_dark' } });
  K.box('p_galv', 0, .82, 0, L, .06, .1); K.box('p_galv', 0, 1.0, 0, L, .05, .08);
  for (let k = 1; k < Math.floor(L / 2.5); k++) K.box('p_galv', -L / 2 + k * 2.5, .82, 0, .06, .2, .06);
  K.pop();
  emitKit(B, K, 0, 0, 0, { collide: false }, 'ic_srail');
  const n = Math.max(1, Math.ceil(Math.abs(dx) / 3));
  for (let i = 0; i < n; i++) {
    const x0 = xa + dx * i / n, x1 = xa + dx * (i + 1) / n, y0 = ya + dy * i / n, y1 = ya + dy * (i + 1) / n, lo = Math.min(y0, y1), hi = Math.max(y0, y1);
    B.collider({ cx: (x0 + x1) / 2, cy: (lo + hi + 1) / 2, cz: z, hx: Math.abs(x1 - x0) / 2, hy: (hi - lo + 1) / 2, hz: .2, surf: 'concrete' });
  }
}

// ------------------------------------------------------------------------------------------------ overpass
export function pier(B, x, z, o = {}) {
  const top = o.top || 5.2, w = o.w || 12.4, cw = o.col || 1.5;
  for (const dz of o.cols || [-3.2, 3.2]) B.box(x, 0, z + dz, cw, top - 1.3, cw, { mat: 'concrete' });
  B.box(x, 0, z + (o.cols || [-3.2, 3.2])[0] - cw / 2 - .02, cw * .7, .3, .04, { mat: 'concrete_dark', collide: false });
  B.box(x, top - 1.3, z, 2.0, 1.3, w, { mat: 'concrete', mats: { b: 'concrete_dark' } });
  // bearing pads
  for (let i = 0; i < 4; i++) B.box(x, top - .02, z - 4.5 + i * 3, 1.0, .02, .5, { mat: 'rubber', collide: false });
}
export function deck(B, x0, x1, z0, z1, top, o = {}) {
  const t = .35, len = x1 - x0, cx = (x0 + x1) / 2;
  B.box(cx, top - t, (z0 + z1) / 2, len, t, z1 - z0, { mat: 'concrete', mats: { t: 'asphalt', b: 'concrete_dark' } });
  for (let i = 0; i < 4; i++) B.box(cx, top - t - 1.0, z0 + 1.5 + i * ((z1 - z0 - 3) / 3), len, 1.0, .5, { mat: 'concrete_dark', collide: false });
  // edge beams (fascia) with a drip line
  for (const zz of [z0 + .15, z1 - .15]) B.box(cx, top - t - .55, zz, len, .55, .3, { mat: 'concrete', collide: false });
  const par = o.parapet || 'both';
  for (const [zz, side] of [[z0 + .2, 's'], [z1 - .2, 'n']]) {
    if (par !== 'both' && par !== side) continue;
    const gaps = (o.gaps && o.gaps[side]) || [];
    let u = x0;
    for (const [g0, g1] of [...gaps, [x1, x1]]) {
      if (g0 > u + .05) {
        B.box((u + g0) / 2, top, zz, g0 - u, .82, .4, { mat: 'concrete', mats: { t: 'concrete_dark' } });
        B.box((u + g0) / 2, top + .82, zz, g0 - u, .06, .1, { mat: 'p_galv', collide: false });
        const n = Math.floor((g0 - u) / 2.5);
        for (let k = 1; k < n; k++) B.box(u + k * 2.5, top + .82, zz, .06, .2, .06, { mat: 'p_galv', collide: false });
        B.box((u + g0) / 2, top + 1.0, zz, g0 - u, .05, .08, { mat: 'p_galv', collide: false });
        B.collider({ cx: (u + g0) / 2, cy: top + .5, cz: zz, hx: (g0 - u) / 2, hy: .5, hz: .2, surf: 'concrete' });
      }
      u = g1;
    }
  }
  // lane lines
  const yP = top + .002;
  paint(B, x0, z0 + 1.15, x1, z0 + 1.27, { y: yP }); paint(B, x0, z1 - 1.27, x1, z1 - 1.15, { y: yP });
  paint(B, x0, (z0 + z1) / 2 - .17, x1, (z0 + z1) / 2 - .05, { y: yP, mat: 'paint_yellow' }); paint(B, x0, (z0 + z1) / 2 + .05, x1, (z0 + z1) / 2 + .17, { y: yP, mat: 'paint_yellow' });
}
/** the dropped span: top surface line from (xLow, yLow) to (xHigh, yHigh), z0..z1 */
export function span(B, xLow, xHigh, z0, z1, yLow, yHigh) {
  const dx = xHigh - xLow, dy = yHigh - yLow, L = Math.hypot(dx, dy), ang = Math.atan2(dy, dx), cx = (xLow + xHigh) / 2, cy = (yLow + yHigh) / 2, zc = (z0 + z1) / 2, W = z1 - z0;
  const K = new Kit(11);
  // frame: origin at the middle of the top surface, x along the slope (roll = ang about z)
  K.push(cx, cy, zc, 0, 0, ang);
  K.box('concrete', 0, -.35, 0, L, .35, W, { mats: { t: 'asphalt', b: 'concrete_dark' } });
  for (let i = 0; i < 4; i++) K.box('concrete_dark', 0, -1.35, -W / 2 + 1.5 + i * (W - 3) / 3, L - .6, 1.0, .5);
  for (const s of [-1, 1]) {
    K.box('concrete', 0, -.9, s * (W / 2 - .15), L, .55, .3);
    K.box('concrete', -.6, 0, s * (W / 2 - .2), L - 1.6, .82, .4, { mats: { t: 'concrete_dark' } });
    K.box('p_galv', -.6, .82, s * (W / 2 - .2), L - 1.6, .06, .1);
    K.box('p_galv', -.6, 1.0, s * (W / 2 - .2), L - 1.6, .05, .08);
  }
  // lane paint
  for (const zz of [-W / 2 + 1.21, W / 2 - 1.21]) K.box('paint_white', 0, .002, zz, L, .006, .12);
  K.box('paint_yellow', 0, .002, -.11, L, .006, .12); K.box('paint_yellow', 0, .002, .11, L, .006, .12);
  // the snapped low end: rebar curling out, a crushed lip
  for (let i = 0; i < 18; i++) {
    const zz = -W / 2 + .5 + i * (W - 1) / 17, r = K.rand;
    K.tube('p_rail', [[-L / 2 + .1, -.2, zz], [-L / 2 - .35 - r() * .3, -.1 + r() * .3, zz + (r() - .5) * .3], [-L / 2 - .7 - r() * .6, .1 + r() * .6, zz + (r() - .5) * .5]], .016, { seg: 5 });
  }
  K.pop();
  emitKit(B, K, 0, 0, 0, { collide: false }, 'ic_span');
  // walkable top: ramp segments (thick slabs; underside steps ~.9 m below the top)
  const nSeg = Math.ceil(dx / 2);
  for (let i = 0; i < nSeg; i++) {
    const xa = xLow + dx * i / nSeg, xb = xLow + dx * (i + 1) / nSeg, ya = yLow + dy * i / nSeg, yb = yLow + dy * (i + 1) / nSeg;
    B.world.addRamp({ cx: (xa + xb) / 2, cz: zc, hx: (xb - xa) / 2, hz: W / 2, y0: ya, y1: yb, axis: 'x', base: Math.max(0, ya - 1.3), surf: 'asphalt' });
  }
  // parapet colliders along the slope (stepped boxes)
  for (let i = 0; i < nSeg; i++) {
    const xa = xLow + dx * i / nSeg, xb = xLow + dx * (i + 1) / nSeg, ya = yLow + dy * i / nSeg, yb = yLow + dy * (i + 1) / nSeg;
    for (const s of [-1, 1]) B.collider({ cx: (xa + xb) / 2, cy: (ya + yb) / 2 + .45, cz: zc + s * (W / 2 - .2), hx: (xb - xa) / 2, hy: .5 + (yb - ya) / 2, hz: .2, surf: 'concrete' });
  }
}
/** a broken deck end at x (the deck continues toward -dir... dir = +1 means the deck lies at x < xEnd, broken face looks +x) */
export function brokenEnd(B, x, z0, z1, top, dir = 1) {
  const K = new Kit(13), W = z1 - z0;
  for (let i = 0; i < 9; i++) {
    const zz = -W / 2 + .7 + i * (W - 1.4) / 8, r = K.rand;
    K.blob('concrete', dir * (.1 + r() * .25), -.35 - r() * .6, zz, .35 + r() * .2, .3 + r() * .2, .45 + r() * .3, { seg: 8, noise: .3, seed: 20 + i });
  }
  for (let i = 0; i < 22; i++) {
    const zz = -W / 2 + .4 + i * (W - .8) / 21, r = K.rand, yb = -.1 - r() * .9;
    K.tube('p_rail', [[0, yb, zz], [dir * (.35 + r() * .3), yb + (r() - .6) * .3, zz + (r() - .5) * .2], [dir * (.6 + r() * .7), yb - .2 - r() * .8, zz + (r() - .5) * .4]], .016, { seg: 5 });
  }
  emitKit(B, K, x, top, (z0 + z1) / 2, { collide: false }, 'ic_broken');
}

// ------------------------------------------------------------------------------------------------ sign gantry
export function gantry(B, x0, x1, z, o = {}) {
  const h = o.h || 6.2, cx = (x0 + x1) / 2, L = x1 - x0;
  for (const x of [x0, x1]) {
    B.box(x, 0, z, .8, .3, .8, { mat: 'concrete' });
    B.cyl(x, .3, z - .4, .14, h + .9, { mat: 'p_galv', sides: 10 });
    B.cyl(x, .3, z + .4, .14, h + .9, { mat: 'p_galv', sides: 10 });
    for (let k = 0; k < 4; k++) B.box(x, .8 + k * 1.6, z, .06, .06, .8, { mat: 'p_galv', collide: false });
  }
  // box truss
  const K = new Kit(17);
  for (const yy of [h, h + 1.1]) for (const zz of [-.4, .4]) K.cylX('p_galv', -L / 2, L / 2, yy, zz, .08, { seg: 8 });
  const n = Math.round(L / 1.6);
  for (let i = 0; i <= n; i++) {
    const xx = -L / 2 + L * i / n;
    K.cyl('p_galv', xx, h, -.4, .035, 1.1, { seg: 6 }); K.cyl('p_galv', xx, h, .4, .035, 1.1, { seg: 6 });
    if (i < n) { const xb = -L / 2 + L * (i + 1) / n; K.tube('p_galv', [[xx, h, -.4], [xb, h + 1.1, -.4]], .03, { seg: 5 }); K.tube('p_galv', [[xx, h, .4], [xb, h + 1.1, .4]], .03, { seg: 5 }); }
  }
  // catwalk under the signs (south side)
  K.box('grate', 0, h - .12, -.95, L - 1.2, .06, .8);
  emitKit(B, K, cx, 0, z, { collide: false }, 'ic_gantry' + Math.round(L));
  for (const [slot, sx, w, hh, face] of o.signs || []) {
    const f = face || 's', zz = z + (f === 's' ? -.5 : .5);
    B.box(sx, h - .2, zz + (f === 's' ? .03 : -.03), w + .1, hh + .1, .06, { mat: 'p_galv', collide: false });
    sign(B, slot, sx, h - .15 + hh / 2, zz + (f === 's' ? -.005 : .005), w, hh, { face: f });
  }
}

// ------------------------------------------------------------------------------------------------ rubble, noise wall, tape, skyline
export function rubble(B, x, y, z, o = {}) {
  const K = new Kit(o.seed || 31), n = o.n || 7, R = o.r || 1.6;
  for (let i = 0; i < n; i++) {
    const r = K.rand, a = r() * PI * 2, d = r() * R, s = .25 + r() * .5;
    K.blob(i % 3 ? 'concrete' : 'concrete_dark', Math.cos(a) * d, s * .4, Math.sin(a) * d, s * (1 + r()), s * .7, s * (1 + r() * .6), { seg: 8, noise: .35, seed: i + 3, flat: -.6 });
    if (r() < .5) K.tube('p_rail', [[Math.cos(a) * d, s * .5, Math.sin(a) * d], [Math.cos(a) * d + (r() - .5), s + r() * .6, Math.sin(a) * d + (r() - .5)]], .014, { seg: 5 });
  }
  if (o.collide !== false) K.col(0, 0, 0, R * 1.3, .7, R * 1.3, { surf: 'concrete' });
  emitKit(B, K, x, y || 0, z, { ry: o.ry || 0 }, 'ic_rubble');
}
export function noiseWall(B, x0, z0, x1, z1, o = {}) {
  const h = o.h || 4, L = Math.hypot(x1 - x0, z1 - z0), ux = (x1 - x0) / L, uz = (z1 - z0) / L, ry = Math.atan2(-(z1 - z0), x1 - x0);
  const n = Math.max(1, Math.round(L / 4));
  for (let i = 0; i <= n; i++) { const t = L * i / n; B.box(x0 + ux * t, 0, z0 + uz * t, .3, h + .15, .3, { mat: 'steel_dark', ry, collide: false }); }
  B.wall(x0, z0, x1, z1, { h, t: .18, mat: o.mat || 'concrete_panels', mat2: o.mat2 || o.mat || 'concrete_panels' });
  B.box((x0 + x1) / 2, h, (z0 + z1) / 2, L, .08, .26, { mat: 'concrete_dark', ry, collide: false });
}
export function tape(B, pts, y = 1.0) {
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1], L = Math.hypot(bx - ax, bz - az);
    const face = Math.abs(bx - ax) > Math.abs(bz - az) ? 'n' : 'e';
    // two faces so it reads from both sides
    const mx = (ax + bx) / 2, mz = (az + bz) / 2;
    if (face === 'n') { sign(B, 'tape', mx, y, mz + .005, L, .07, { face: 'n' }); sign(B, 'tape', mx, y, mz - .005, L, .07, { face: 's' }); }
    else { sign(B, 'tape', mx + .005, y, mz, L, .07, { face: 'e' }); sign(B, 'tape', mx - .005, y, mz, L, .07, { face: 'w' }); }
  }
}
export function skyline(B, x0, z0, x1, z1, o = {}) {
  const r = () => B.rand(), face = o.face || 'n', step = o.step || 16;
  const alongX = Math.abs(x1 - x0) >= Math.abs(z1 - z0), L = alongX ? Math.abs(x1 - x0) : Math.abs(z1 - z0);
  let u = 0;
  while (u < L - 4) {
    const w = Math.min(L - u, step * (.6 + r() * .8)), d = (o.depth || 16) * (.7 + r() * .6), h = (o.h || 20) * (.45 + r() * .9);
    const cx = alongX ? Math.min(x0, x1) + u + w / 2 : (x0 + x1) / 2, cz = alongX ? (z0 + z1) / 2 : Math.min(z0, z1) + u + w / 2;
    const bw = alongX ? w - 1.5 : d, bd = alongX ? d : w - 1.5, y0 = o.yf ? o.yf(cx, cz) - 1 : (o.y || 0);
    const mat = ['concrete_panels', 'brick', 'plaster', 'concrete'][Math.floor(r() * 4)];
    B.box(cx, y0 - 1, cz, bw, h + 1, bd, { mat, collide: false, cast: false });
    B.box(cx, y0 + h, cz, bw + .4, .6, bd + .4, { mat: 'concrete_dark', collide: false, cast: false });
    if (r() < .6) B.box(cx + (r() - .5) * bw * .4, y0 + h + .6, cz + (r() - .5) * bd * .4, 3 + r() * 3, 2.2, 3 + r() * 2, { mat: 'metal_painted', collide: false, cast: false });
    const v = Math.floor(r() * 3), fw = alongX ? bw : bd;
    const tiles = Math.max(1, Math.round(fw / 14)), tw = (fw - 2) / tiles;
    for (let t = 0; t < tiles; t++) {
      const off = -fw / 2 + 1 + tw * (t + .5);
      for (let yy = 4; yy + 4 < h; yy += 14) {
        const hh = Math.min(14, h - yy - 1);
        const px = face === 'e' ? cx + bw / 2 + .06 : face === 'w' ? cx - bw / 2 - .06 : cx + off, pz = face === 'n' ? cz + bd / 2 + .06 : face === 's' ? cz - bd / 2 - .06 : cz + off;
        sign(B, 'fac' + ((v + t) % 3), px, y0 + yy + hh / 2, pz, tw, hh, { face });
      }
    }
    u += w;
  }
}
