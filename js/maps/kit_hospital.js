/* LIVE FIRE — St. Aldric General (map "hospital") kit: hospital materials, a canvas atlas of original hospital signage and
   grime decals, a night-city facade texture, architecture helpers (two-tone walls with skirting and bed rails, doors in
   openings, slabs, ceiling fixture grids, dog-leg stairs) and custom props built with the prop Kit (operating theatre,
   mortuary, pharmacy, wards, ambulances, site fencing...).
   Exports:
     HS                      material names used by the map
     wx(B, z, x0, x1, o) / wz(B, x, z0, z1, o)   walls along x at z (left = north) / along z at x (left = west); see wallRun
     slab(B, x0, z0, x1, z1, y0, y1, o)          structural slab (o.top, o.bot materials; o.skipTop)
     finish(B, x0, z0, x1, z1, y, mat)           1 cm floor finish (no collider: the slab below carries it)
     fixtures(B, x0, z0, x1, z1, y, o)           grid of ceiling light fixtures (on / off mix)
     dogleg(B, o)                                two flights + half landing in a shaft
     sign(B, slot, x, y, z, w, h, face, o)       atlas decal (signage, grime) on a wall or the floor; o.glow = emissive
     flushDecals(B)                              emit the collected decals (call once at the end of build)
     skyline(B, x, z, w, d, h, o)                distant lit building (no collider)
     P(B, type, x, y, z, o)                      custom prop (see PROPS below); o.ry, o.inst, o.collide, o.hide
   Nothing here edits shared modules: extra materials are added to MATERIALS under hs_* names at import (as props/kit.js does). */
import { MATERIALS } from '../gfx/materials.js';
import { Kit, emitKit, hashStr, rng } from './props/kit.js';

const PI = Math.PI, TAU = PI * 2;

// ------------------------------------------------------------------------------------------------------------ materials
const TX = (surf, set, scale, o) => Object.assign({ surf, set, tex: set ? 'assets/textures/' + set : null, scale }, o);
const HS_MATS = {
  hs_lino:      TX('tile', 'tile_floor', 1.2, { color: '#8e938b', desat: .9, macro: .12, rough: .7, por: .15, puddle: .3, col: [.55, .57, .54], proc: 'tile' }),
  hs_lino_blue: TX('tile', 'tile_floor', 1.2, { color: '#6d7a86', desat: .95, macro: .12, rough: .7, por: .15, puddle: .3, col: [.42, .47, .52], proc: 'tile' }),
  hs_lino_ward: TX('tile', 'tile_floor', 1.2, { color: '#9a917c', desat: .9, macro: .12, rough: .7, por: .15, puddle: .3, col: [.6, .56, .48], proc: 'tile' }),
  hs_terrazzo:  TX('tile', 'marble', 1.4, { color: '#8f8b82', desat: .6, macro: .1, rough: .6, por: .08, col: [.56, .54, .5], proc: 'noise' }),
  hs_wall:      TX('plaster', 'plaster_white', 2.0, { color: '#b8c4b6', desat: .85, macro: .1, anti: 1, por: .5, col: [.72, .77, .71], proc: 'noise' }),
  hs_wall_cream: TX('plaster', 'plaster_white', 2.0, { color: '#cfc6ae', desat: .85, macro: .1, anti: 1, por: .5, col: [.81, .77, .68], proc: 'noise' }),
  hs_wall_blue: TX('plaster', 'plaster_white', 2.0, { color: '#a8b7c2', desat: .85, macro: .1, anti: 1, por: .5, col: [.66, .72, .76], proc: 'noise' }),
  hs_band:      TX('rubber', 'painted_metal', 2.0, { color: '#6f8a7c', desat: 1, macro: .06, rough: .6, por: .1, col: [.43, .54, .49], proc: 'metal' }),
  hs_band_blue: TX('rubber', 'painted_metal', 2.0, { color: '#4e6276', desat: 1, macro: .06, rough: .6, por: .1, col: [.3, .38, .46], proc: 'metal' }),
  hs_tile_theatre: TX('tile', 'tile_white', 1.27, { color: '#a7bfbb', desat: .9, macro: .06, rough: .8, por: .1, col: [.65, .75, .73], proc: 'tile' }),
  hs_tile_morgue: TX('tile', 'tile_white', 1.27, { color: '#b9bcb4', desat: .9, macro: .1, rough: .8, por: .1, col: [.72, .74, .7], proc: 'tile' }),
  hs_render:    TX('concrete', 'concrete_panels', 2.4, { color: '#a9a291', desat: .8, macro: .16, por: .6, col: [.66, .63, .57], proc: 'tile' }),
  hs_spandrel:  TX('metal', 'painted_metal', 2.0, { color: '#2e5257', desat: 1, macro: .1, rough: .6, por: .1, col: [.18, .32, .34], proc: 'metal' }),
  hs_roof:      TX('gravel', 'gravel', 1.6, { color: '#5b5852', desat: .5, macro: .2, anti: 1, por: .5, puddle: .4, col: [.36, .35, .32], proc: 'noise' }),
};
for (const k in HS_MATS) if (!MATERIALS[k]) MATERIALS[k] = HS_MATS[k];
export const HS = Object.keys(HS_MATS);

// ------------------------------------------------------------------------------------------------------------ canvas atlas
// One 2048 x 2048 canvas per scene: original hospital signage (fictional names) and grime. Slots are packed in rows.
const SANS = 'Arial, Helvetica, "Liberation Sans", sans-serif';
const SLOTS = [];          // [name, logical w, h, draw, atlas scale]
const SC = { papers: .5, dirt: .5, leaves: .5, hatch: .5, tag_: .55, closed: .7, directory: .6, wash: .6, notice: .6, stain_: .6, mould: .6, scorch: .6, leak: .6, crack: .6, oxygen: .7, radiation: .6 };
const S = (name, w, h, draw) => { const p = Object.keys(SC).find(k => name.startsWith(k)); SLOTS.push([name, w, h, draw, p ? SC[p] : 1]); };
function txt(g, s, x, y, size, col = '#fff', o = {}) {
  g.font = (o.weight || 'bold') + ' ' + size + 'px ' + SANS; g.textAlign = o.align || 'center'; g.textBaseline = 'middle'; g.fillStyle = col;
  if (o.maxW) { const m = g.measureText(s).width; if (m > o.maxW) { g.save(); g.translate(x, y); g.scale(o.maxW / m, 1); g.fillText(s, 0, 0); g.restore(); return; } }
  g.fillText(s, x, y);
}
function grime(g, w, h, seed, amt = .22) {
  const r = rng(seed);
  for (let i = 0; i < 70; i++) { g.fillStyle = `rgba(40,34,26,${(r() * amt).toFixed(3)})`; g.fillRect(r() * w, r() * h, 1 + r() * 5, 1 + r() * 3); }
  for (let i = 0; i < 5; i++) { g.fillStyle = `rgba(30,26,20,${(r() * amt * .6).toFixed(3)})`; g.fillRect(r() * w, r() * h * .4, 1 + r() * 3, h * (.3 + r() * .6)); }
}
function panel(g, w, h, bg, fg, lines, o = {}) {
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  if (o.stripe) { g.fillStyle = o.stripe; g.fillRect(0, 0, o.sw || 26, h); }
  const n = lines.length, x0 = o.stripe ? (o.sw || 26) : 0;
  lines.forEach((ln, i) => {
    const [s, size, col, al] = Array.isArray(ln) ? ln : [ln, h * .5 / n, fg, o.align];
    const align = al || o.align || 'center';
    const x = align === 'left' ? x0 + 24 : align === 'right' ? w - 24 : (x0 + w) / 2;
    txt(g, s, x, h * (i + .5) / n, size, col || fg, { align, maxW: w - x0 - 40 });
  });
  if (o.grime !== false) grime(g, w, h, hashStr(lines.join('')), .18);
}
const arrow = (g, x, y, s, dir, col) => {   // dir: 0 right, 1 up, 2 left, 3 down
  g.save(); g.translate(x, y); g.rotate(-dir * PI / 2); g.fillStyle = col;
  g.beginPath(); g.moveTo(s, 0); g.lineTo(0, -s * .8); g.lineTo(0, -s * .32); g.lineTo(-s, -s * .32); g.lineTo(-s, s * .32); g.lineTo(0, s * .32); g.lineTo(0, s * .8); g.closePath(); g.fill(); g.restore();
};
const NHS_BLUE = '#1c4f8f', ED_RED = '#b3241c', GREEN = '#1d7a4a';
// --- signage
S('hosp_name', 1024, 160, (g, w, h) => {
  g.fillStyle = '#e8e6df'; g.fillRect(0, 0, w, h); g.fillStyle = NHS_BLUE; g.fillRect(0, 0, 150, h);
  g.fillStyle = '#fff'; g.fillRect(55, 30, 40, 100); g.fillRect(25, 60, 100, 40);           // a generic cross
  txt(g, 'ST. ALDRIC GENERAL', 590, 62, 72, NHS_BLUE, { maxW: 820 }); txt(g, 'HOSPITAL', 590, 125, 44, '#333', { maxW: 820, weight: 'normal' });
  grime(g, w, h, 11, .3);
});
S('emergency', 768, 160, (g, w, h) => { g.fillStyle = ED_RED; g.fillRect(0, 0, w, h); txt(g, 'EMERGENCY', w / 2, h * .42, 92, '#fff', { maxW: w - 40 }); txt(g, 'ACCIDENT & EMERGENCY DEPARTMENT', w / 2, h * .82, 26, '#ffd9d4', { maxW: w - 40 }); grime(g, w, h, 3, .2); });
S('amb_only', 512, 112, (g, w, h) => panel(g, w, h, '#f2d21b', '#111', [['AMBULANCES ONLY', 46, '#111'], ['NO PARKING · NO WAITING', 24, '#111']], {}));
S('main_ent', 512, 112, (g, w, h) => panel(g, w, h, NHS_BLUE, '#fff', [['MAIN ENTRANCE', 50], ['Reception · Outpatients · Wards', 22, '#cfe0f5']]));
S('opd', 512, 112, (g, w, h) => panel(g, w, h, NHS_BLUE, '#fff', [['OUTPATIENTS', 54], ['Clinics A–D', 24, '#cfe0f5']]));
S('pharmacy', 640, 160, (g, w, h) => {
  g.fillStyle = '#f4f4f0'; g.fillRect(0, 0, w, h); g.fillStyle = GREEN; g.fillRect(36, 40, 30, 80); g.fillRect(11, 65, 80, 30);
  txt(g, 'PHARMACY', 370, 64, 76, GREEN, { maxW: 500 }); txt(g, 'Prescription collection', 370, 124, 26, '#444', { weight: 'normal' }); grime(g, w, h, 5, .18);
});
S('theatres', 512, 112, (g, w, h) => panel(g, w, h, '#2b6a6a', '#fff', [['THEATRES', 56], ['Authorised staff only beyond this point', 20, '#cfe']]));
S('recovery', 512, 96, (g, w, h) => panel(g, w, h, '#2b6a6a', '#fff', [['RECOVERY', 52]]));
S('majors', 512, 96, (g, w, h) => panel(g, w, h, ED_RED, '#fff', [['MAJORS · RESUS', 48]]));
S('xray', 512, 112, (g, w, h) => { panel(g, w, h, '#f2f0e8', '#222', [['X-RAY 2', 52, '#222'], ['RADIATION — DO NOT ENTER WHEN LIT', 20, '#a01810']]); });
S('mortuary', 512, 112, (g, w, h) => panel(g, w, h, '#3b3f45', '#fff', [['MORTUARY', 52], ['Authorised staff only', 22, '#ccc']]));
S('chapel', 512, 96, (g, w, h) => panel(g, w, h, '#5b4a7a', '#fff', [['CHAPEL & QUIET ROOM', 40]]));
S('records', 512, 96, (g, w, h) => panel(g, w, h, NHS_BLUE, '#fff', [['MEDICAL RECORDS', 44]]));
S('ward7', 512, 112, (g, w, h) => panel(g, w, h, NHS_BLUE, '#fff', [['WARD 7', 60], ['Kestrel Ward · General Surgery', 22, '#cfe0f5']]));
S('reception', 512, 96, (g, w, h) => panel(g, w, h, NHS_BLUE, '#fff', [['RECEPTION', 56]]));
S('lifts', 384, 96, (g, w, h) => panel(g, w, h, '#2a2d31', '#fff', [['LIFTS', 52]]));
S('stairs', 384, 96, (g, w, h) => panel(g, w, h, '#2a2d31', '#fff', [['STAIRS', 52]]));
S('lockers', 384, 96, (g, w, h) => panel(g, w, h, '#2a2d31', '#fff', [['STAFF ONLY', 44]]));
S('stores', 384, 96, (g, w, h) => panel(g, w, h, '#2a2d31', '#fff', [['STORES', 52]]));
S('plant', 384, 96, (g, w, h) => panel(g, w, h, '#f2d21b', '#111', [['PLANT ROOM', 44, '#111']]));
S('coldroom', 384, 96, (g, w, h) => panel(g, w, h, '#2a2d31', '#fff', [['COLD ROOM', 46]]));
for (const [n, s] of [['lvl_b1', 'B1'], ['lvl_g', 'G'], ['lvl_1', '1']]) S(n, 192, 192, (g, w, h) => { g.fillStyle = '#20252b'; g.fillRect(0, 0, w, h); g.fillStyle = '#f2d21b'; g.fillRect(0, h - 22, w, 22); txt(g, s, w / 2, h * .44, 120, '#fff'); });
for (const [n, s, d] of [['dir_a', 'A', 0], ['dir_b', 'B', 0]]) S(n, 256, 256, (g, w, h) => {   // spray-painted site letters (stencil)
  g.clearRect(0, 0, w, h); g.font = 'bold 220px ' + SANS; g.textAlign = 'center'; g.textBaseline = 'middle';
  const col = n === 'dir_a' ? 'rgba(232,90,40,' : 'rgba(250,210,40,';
  const r = rng(n === 'dir_a' ? 7 : 9);
  for (let i = 0; i < 260; i++) { g.fillStyle = col + (.15 + r() * .3).toFixed(2) + ')'; const a = r() * TAU, q = 60 + r() * 70; g.fillRect(w / 2 + Math.cos(a) * q, h / 2 + Math.sin(a) * q, 2, 2); }
  g.fillStyle = col + '.92)'; g.fillText(s, w / 2, h / 2 + 8);
  g.globalCompositeOperation = 'destination-out'; g.fillRect(w / 2 - 3, 20, 6, h - 40); g.globalCompositeOperation = 'source-over';
});
S('exit', 384, 160, (g, w, h) => {   // generic green exit sign (pictogram + arrow)
  g.fillStyle = '#0e8a3e'; g.fillRect(0, 0, w, h); g.fillStyle = '#e9fff0'; g.fillRect(14, 14, w - 28, h - 28); g.fillStyle = '#0e8a3e'; g.fillRect(20, 20, w - 40, h - 40);
  g.fillStyle = '#fff'; g.beginPath(); g.arc(88, 50, 13, 0, TAU); g.fill();
  g.lineWidth = 13; g.strokeStyle = '#fff'; g.lineCap = 'round';
  g.beginPath(); g.moveTo(84, 66); g.lineTo(74, 100); g.lineTo(52, 124); g.moveTo(74, 100); g.lineTo(100, 112); g.lineTo(104, 136); g.moveTo(82, 74); g.lineTo(60, 84); g.moveTo(82, 74); g.lineTo(104, 90); g.stroke();
  txt(g, 'EXIT', 236, 80, 64, '#fff'); arrow(g, 330, 80, 26, 0, '#fff');
});
S('closed', 640, 400, (g, w, h) => {
  g.fillStyle = '#f5f3ec'; g.fillRect(0, 0, w, h); g.fillStyle = ED_RED; g.fillRect(0, 0, w, 110);
  txt(g, 'SITE CLOSED', w / 2, 58, 78, '#fff');
  txt(g, 'DANGER — KEEP OUT', w / 2, 160, 50, '#111');
  txt(g, 'This building is no longer in use.', w / 2, 224, 28, '#333', { weight: 'normal' });
  txt(g, 'Unsafe floors · No power · Asbestos', w / 2, 262, 28, '#333', { weight: 'normal' });
  txt(g, '24 HOUR SECURITY PATROLS', w / 2, 330, 36, ED_RED); grime(g, w, h, 21, .35);
});
S('directory', 512, 640, (g, w, h) => {
  g.fillStyle = NHS_BLUE; g.fillRect(0, 0, w, h); txt(g, 'ST. ALDRIC GENERAL', w / 2, 44, 40, '#fff');
  const rows = [['Emergency · Majors', 2], ['Theatres · Recovery', 1], ['Ward 7', 1], ['Outpatients', 0], ['Pharmacy', 0], ['Medical Records', 3], ['Chapel', 3], ['Mortuary (staff)', 3], ['X-Ray', 2]];
  rows.forEach(([s, d], i) => { const y = 120 + i * 56; g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(20, y - 24, w - 40, 48); txt(g, s, 40, y, 30, '#fff', { align: 'left', maxW: 360 }); arrow(g, w - 60, y, 18, d, '#f2d21b'); });
  grime(g, w, h, 33, .2);
});
S('oxygen', 384, 256, (g, w, h) => { panel(g, w, h, '#f5f3ec', '#111', [['OXYGEN', 64, '#1d5fa0'], ['NO SMOKING', 34, ED_RED], ['NO NAKED LIGHTS', 34, ED_RED]]); });
S('radiation', 256, 256, (g, w, h) => {
  g.fillStyle = '#f2d21b'; g.beginPath(); g.moveTo(w / 2, 10); g.lineTo(w - 10, h - 20); g.lineTo(10, h - 20); g.closePath(); g.fill();
  g.strokeStyle = '#111'; g.lineWidth = 10; g.stroke(); g.fillStyle = '#111'; g.beginPath(); g.arc(w / 2, h * .62, 12, 0, TAU); g.fill();
  for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(w / 2, h * .62); g.arc(w / 2, h * .62, 52, -PI / 2 + i * TAU / 3 - .5, -PI / 2 + i * TAU / 3 + .5); g.closePath(); g.fill(); }
});
S('in_use', 384, 128, (g, w, h) => { g.fillStyle = '#2a0503'; g.fillRect(0, 0, w, h); txt(g, 'THEATRE IN USE', w / 2, h / 2, 46, '#ff4a32', { maxW: w - 30 }); });
S('wash', 320, 448, (g, w, h) => {
  g.fillStyle = '#fbfbf7'; g.fillRect(0, 0, w, h); g.fillStyle = '#1c7f9e'; g.fillRect(0, 0, w, 70); txt(g, 'CLEAN HANDS', w / 2, 36, 40, '#fff');
  for (let i = 0; i < 6; i++) { const x = 30 + (i % 2) * 150, y = 100 + Math.floor(i / 2) * 110; g.fillStyle = '#d7eef5'; g.fillRect(x, y, 120, 90); g.fillStyle = '#e8a77f'; g.beginPath(); g.ellipse(x + 60, y + 45, 34, 22, i * .5, 0, TAU); g.fill(); txt(g, String(i + 1), x + 14, y + 14, 22, '#1c7f9e'); }
  grime(g, w, h, 41, .15);
});
S('notice', 320, 448, (g, w, h) => {
  g.fillStyle = '#f7f1d8'; g.fillRect(0, 0, w, h); txt(g, 'NOTICE TO STAFF', w / 2, 40, 30, '#222');
  g.fillStyle = '#555'; for (let i = 0; i < 14; i++) g.fillRect(28, 80 + i * 24, 200 + (i * 37) % 64, 6);
  txt(g, 'All services transferred to the', w / 2, 430 - 70, 18, '#222', { weight: 'normal' }); txt(g, 'Northgate Infirmary site.', w / 2, 430 - 46, 18, '#222', { weight: 'normal' });
  grime(g, w, h, 43, .3);
});
for (let i = 0; i < 3; i++) S('bay_' + (i + 1), 256, 96, (g, w, h) => panel(g, w, h, NHS_BLUE, '#fff', [['BAY ' + (i + 1), 54]]));
S('nil', 256, 192, (g, w, h) => { panel(g, w, h, '#fff', '#a01810', [['NIL BY', 50, '#a01810'], ['MOUTH', 50, '#a01810']], {}); });
S('stripe_red', 64, 64, (g, w, h) => { g.fillStyle = '#9e2a22'; g.fillRect(0, 0, w, h); });
// --- grime (alpha): water stains, mould, graffiti, cracks, litter
const blot = (g, w, h, seed, rgba, n, rr) => { const r = rng(seed); for (let i = 0; i < n; i++) { const x = w * (.2 + r() * .6), y = h * (.2 + r() * .6), R = rr * (.3 + r()); g.fillStyle = rgba(r()); g.beginPath(); g.ellipse(x, y, R, R * (.5 + r() * .8), r() * PI, 0, TAU); g.fill(); } };
for (let i = 0; i < 3; i++) S('stain_' + i, 256, 256, (g, w, h) => {
  g.clearRect(0, 0, w, h); blot(g, w, h, 100 + i, a => `rgba(${70 + a * 30 | 0},${55 + a * 20 | 0},${30 + a * 10 | 0},${(.55 + a * .4).toFixed(2)})`, 26, 42);
  g.globalCompositeOperation = 'destination-out'; blot(g, w, h, 200 + i, a => `rgba(0,0,0,${(.5 + a * .5).toFixed(2)})`, 14, 26); g.globalCompositeOperation = 'source-over';
});
S('leak', 128, 512, (g, w, h) => { g.clearRect(0, 0, w, h); const r = rng(5); for (let i = 0; i < 9; i++) { const x = w * (.3 + r() * .4); g.fillStyle = `rgba(60,48,30,${(.5 + r() * .45).toFixed(2)})`; g.fillRect(x, 0, 5 + r() * 16, h * (.4 + r() * .6)); } g.fillStyle = 'rgba(60,48,30,.8)'; g.fillRect(0, 0, w, 40); });
S('mould', 256, 256, (g, w, h) => { g.clearRect(0, 0, w, h); const r = rng(77); for (let i = 0; i < 900; i++) { const a = r() * TAU, q = Math.pow(r(), .7) * 120; g.fillStyle = `rgba(${20 + r() * 20 | 0},${28 + r() * 20 | 0},${18 + r() * 10 | 0},${(.6 + r() * .4).toFixed(2)})`; g.fillRect(128 + Math.cos(a) * q, 128 + Math.sin(a) * q * .7, 2 + r() * 4, 2 + r() * 4); } });
S('scorch', 256, 256, (g, w, h) => { g.clearRect(0, 0, w, h); blot(g, w, h, 55, a => `rgba(${12 + a * 15 | 0},${10 + a * 10 | 0},8,${(.6 + a * .4).toFixed(2)})`, 30, 46); });
const TAG = [['#d93a8f', '#2a2a2a'], ['#3ab0d9', '#111'], ['#e8e8e8', '#c43']];
for (let i = 0; i < 3; i++) S('tag_' + i, 512, 256, (g, w, h) => {   // abstract original spray tags
  g.clearRect(0, 0, w, h); const r = rng(300 + i), [c1, c2] = TAG[i];
  g.lineCap = 'round'; g.lineJoin = 'round';
  for (const [col, lw] of [[c2, 30], [c1, 18]]) {
    g.strokeStyle = col; g.lineWidth = lw; g.beginPath(); let x = 40, y = 150 + r() * 40; g.moveTo(x, y);
    for (let k = 0; k < 9; k++) { const nx = x + 40 + r() * 30, ny = 60 + r() * 140; g.quadraticCurveTo(x + 20, r() < .5 ? 40 : 220, nx, ny); x = nx; y = ny; }
    g.stroke(); r(); }
  for (let k = 0; k < 30; k++) { g.fillStyle = c1; g.fillRect(40 + r() * 420, 200 + r() * 50, 3, 6 + r() * 30); }
});
S('crack', 512, 128, (g, w, h) => { g.clearRect(0, 0, w, h); const r = rng(9); g.strokeStyle = 'rgba(25,22,20,.9)'; g.lineWidth = 3; g.beginPath(); let x = 0, y = 64; g.moveTo(x, y); while (x < w) { x += 10 + r() * 20; y = Math.max(8, Math.min(120, y + (r() - .5) * 26)); g.lineTo(x, y); if (r() < .2) { g.moveTo(x, y); g.lineTo(x + 20, y + (r() - .5) * 50); g.moveTo(x, y); } } g.stroke(); });
S('papers', 512, 512, (g, w, h) => {
  g.clearRect(0, 0, w, h); const r = rng(13);
  for (let i = 0; i < 16; i++) { g.save(); g.translate(40 + r() * 430, 40 + r() * 430); g.rotate(r() * TAU); g.fillStyle = r() < .8 ? '#e9e6dc' : '#9fc0d8'; g.fillRect(-30, -40, 60, 80); g.fillStyle = 'rgba(60,60,60,.5)'; for (let k = 0; k < 6; k++) g.fillRect(-22, -30 + k * 10, 30 + r() * 14, 3); g.restore(); }
});
S('dirt', 512, 512, (g, w, h) => { g.clearRect(0, 0, w, h); const r = rng(17); for (let i = 0; i < 1600; i++) { const x = r() * w, y = r() * h, d = Math.hypot(x - w / 2, y - h / 2) / (w / 2); if (r() < d * 1.1) continue; g.fillStyle = `rgba(${50 + r() * 30 | 0},${42 + r() * 20 | 0},${30 + r() * 12 | 0},${(.5 + r() * .5).toFixed(2)})`; g.fillRect(x, y, 2 + r() * 7, 2 + r() * 5); } });
S('leaves', 512, 512, (g, w, h) => { g.clearRect(0, 0, w, h); const r = rng(19); for (let i = 0; i < 70; i++) { g.save(); g.translate(30 + r() * 450, 30 + r() * 450); g.rotate(r() * TAU); g.fillStyle = ['#6b4a22', '#8a6a2a', '#4f3a1c', '#7a5a30'][i % 4]; g.beginPath(); g.ellipse(0, 0, 14, 7, 0, 0, TAU); g.fill(); g.restore(); } });
S('lines', 256, 64, (g, w, h) => { g.fillStyle = '#e8e3c8'; g.fillRect(0, 0, w, h); const r = rng(23); for (let i = 0; i < 40; i++) { g.clearRect(r() * w, r() * h, 3 + r() * 10, 2 + r() * 5); } });   // road markings (worn)
S('lines_y', 256, 64, (g, w, h) => { g.fillStyle = '#d8b62a'; g.fillRect(0, 0, w, h); const r = rng(29); for (let i = 0; i < 40; i++) { g.clearRect(r() * w, r() * h, 3 + r() * 10, 2 + r() * 5); } });
S('hatch', 512, 512, (g, w, h) => { g.clearRect(0, 0, w, h); g.strokeStyle = '#d8b62a'; g.lineWidth = 26; for (let i = -w; i < w * 2; i += 90) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + h, h); g.stroke(); } g.lineWidth = 18; g.strokeRect(9, 9, w - 18, h - 18); });
S('amb_word', 512, 128, (g, w, h) => { g.clearRect(0, 0, w, h); g.save(); g.translate(w, 0); g.scale(-1, 1); txt(g, 'AMBULANCE', w / 2, h / 2, 96, '#1a3f8a', { maxW: w - 20 }); g.restore(); });
S('amb_side', 512, 128, (g, w, h) => { g.clearRect(0, 0, w, h); txt(g, 'AMBULANCE SERVICE', w / 2, h * .35, 44, '#1a3f8a', { maxW: w - 20 }); txt(g, 'EMERGENCY · 24 HOURS', w / 2, h * .78, 28, '#1a3f8a', { maxW: w - 20 }); });
S('station', 768, 128, (g, w, h) => panel(g, w, h, '#1a3f8a', '#fff', [['AMBULANCE STATION', 58], ['Keep clear · Vehicles exit at speed', 24, '#cfe0f5']]));

const ATLAS = {};     // name -> uv rect [u0, v0, u1, v1]
const AW = 2048, AH = 2048;
(function layout() {
  const list = SLOTS.map(([name, w0, h0, , k]) => [name, Math.ceil(w0 * k), Math.ceil(h0 * k)]).sort((a, b) => b[2] - a[2] || b[1] - a[1]);
  let x = 0, y = 0, rowH = 0;
  for (const [name, w, h] of list) {
    if (x + w > AW) { x = 0; y += rowH + 4; rowH = 0; }
    if (y + h > AH) { console.warn('[hospital] atlas full at ' + name); continue; }
    ATLAS[name] = { px: [x, y, w, h], uv: [(x + 1.5) / AW, 1 - (y + h - 1.5) / AH, (x + w - 1.5) / AW, 1 - (y + 1.5) / AH] };
    x += w + 4; rowH = Math.max(rowH, h);
  }
})();
const sceneState = new WeakMap();
function stateOf(scene) {
  let st = sceneState.get(scene);
  if (!st) { st = {}; sceneState.set(scene, st); scene.onDisposeObservable.addOnce(() => sceneState.delete(scene)); }
  return st;
}
let QUAL = 'medium';
function atlasTexture(scene) {
  const st = stateOf(scene);
  if (st.tex) return st.tex;
  const k = QUAL === 'low' ? .5 : 1;
  const dt = new BABYLON.DynamicTexture('hs_atlas', { width: AW * k, height: AH * k }, scene, true);
  dt.hasAlpha = true; dt.wrapU = dt.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;
  const g = dt.getContext(); g.clearRect(0, 0, AW * k, AH * k);
  for (const [name, w, h, draw] of SLOTS) {
    const r = ATLAS[name]; if (!r) continue;
    g.save(); g.scale(k, k); g.translate(r.px[0], r.px[1]); g.beginPath(); g.rect(0, 0, r.px[2], r.px[3]); g.clip(); g.scale(r.px[2] / w, r.px[3] / h);
    try { draw(g, w, h); } catch (e) { console.warn('[hospital] slot ' + name + ': ' + e.message); }
    g.restore();
  }
  dt.update(true);
  st.tex = dt;
  return dt;
}
function atlasMaterial(scene, glow) {
  const st = stateOf(scene), key = glow ? 'glow' : 'sign';
  if (st[key]) return st[key];
  const m = new BABYLON.PBRMaterial('m_hs_' + key, scene), tex = atlasTexture(scene);
  m.metallic = 0; m.roughness = .6;
  m.transparencyMode = BABYLON.PBRMaterial.PBRMATERIAL_ALPHATEST; m.alphaCutOff = .45; m.useAlphaFromAlbedoTexture = true;
  m.albedoTexture = tex;
  if (glow) { m.emissiveTexture = tex; m.emissiveColor = new BABYLON.Color3(1, 1, 1); m.emissiveIntensity = 1.4; m.albedoColor = new BABYLON.Color3(.2, .2, .2); m.environmentIntensity = .2; }
  m.metadata = { lf: 'hs_' + key, surf: 'plaster' };
  st[key] = m;
  return m;
}

// ------------------------------------------------------------------------------------------------------------ decals
// collected per builder (world space), emitted as one mesh per material at the end of the build
const DEC = new WeakMap();
export function sign(B, slot, x, y, z, w, h, face = 'n', o = {}) {
  const r = ATLAS[slot]; if (!r) { B.warn('hospital: unknown sign slot ' + slot); return; }
  let list = DEC.get(B); if (!list) { list = { sign: [], glow: [] }; DEC.set(B, list); }
  const off = o.off == null ? .012 : o.off, hw = w / 2, hh = h / 2;
  // local corners (counter-clockwise as seen from the front) and the normal, in the builder frame
  let q, n;
  if (face === 'n') { q = [[-hw, -hh, off], [hw, -hh, off], [hw, hh, off], [-hw, hh, off]]; n = [0, 0, 1]; }
  else if (face === 's') { q = [[hw, -hh, -off], [-hw, -hh, -off], [-hw, hh, -off], [hw, hh, -off]]; n = [0, 0, -1]; }
  else if (face === 'e') { q = [[off, -hh, hw], [off, -hh, -hw], [off, hh, -hw], [off, hh, hw]]; n = [1, 0, 0]; }
  else if (face === 'w') { q = [[-off, -hh, -hw], [-off, -hh, hw], [-off, hh, hw], [-off, hh, -hw]]; n = [-1, 0, 0]; }
  else if (face === 'd') { q = [[-hw, -off, -hh], [hw, -off, -hh], [hw, -off, hh], [-hw, -off, hh]]; n = [0, -1, 0]; }
  else { q = [[-hw, off, hh], [hw, off, hh], [hw, off, -hh], [-hw, off, -hh]]; n = [0, 1, 0]; }
  const ry = o.ry || 0, c = Math.cos(ry), s = Math.sin(ry);
  const pts = q.map(([a, b, d]) => B.toWorld(x + a * c + d * s, y + b, z - a * s + d * c));
  const th = B.T.th + ry, cs = Math.cos(th), sn = Math.sin(th);
  const nw = [n[0] * cs + n[2] * sn, n[1], -n[0] * sn + n[2] * cs];
  let [u0, v0, u1, v1] = r.uv;
  if (o.flip) { const t = u0; u0 = u1; u1 = t; }
  if (o.crop) { const [a, b2, c2, d2] = o.crop; const U0 = u0 + (u1 - u0) * a, U1 = u0 + (u1 - u0) * c2, V0 = v0 + (v1 - v0) * b2, V1 = v0 + (v1 - v0) * d2; u0 = U0; u1 = U1; v0 = V0; v1 = V1; }
  (o.glow ? list.glow : list.sign).push({ pts, n: nw, uv: [u0, v0, u1, v0, u1, v1, u0, v1] });
}
export function flushDecals(B) {
  QUAL = (B.opts && B.opts.quality) || QUAL;
  const list = DEC.get(B); if (!list) return;
  for (const kind of ['sign', 'glow']) {
    const L = list[kind]; if (!L.length) continue;
    const P = new Float32Array(L.length * 12), N = new Float32Array(L.length * 12), U = new Float32Array(L.length * 8), I = new Uint32Array(L.length * 6);
    L.forEach((d, i) => {
      for (let k = 0; k < 4; k++) { const p = d.pts[k]; P.set([p.x, p.y, p.z], i * 12 + k * 3); N.set(d.n, i * 12 + k * 3); }
      U.set(d.uv, i * 8);
      // Babylon front face: cross(b - a, c - a) . n < 0
      const a = d.pts[0], b = d.pts[1], c = d.pts[2];
      const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z, vx = c.x - a.x, vy = c.y - a.y, vz = c.z - a.z;
      const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx, o4 = i * 4;
      if (cx * d.n[0] + cy * d.n[1] + cz * d.n[2] < 0) I.set([o4, o4 + 1, o4 + 2, o4, o4 + 2, o4 + 3], i * 6);
      else I.set([o4, o4 + 2, o4 + 1, o4, o4 + 3, o4 + 2], i * 6);
    });
    const m = new BABYLON.Mesh('hs_decals_' + kind, B.scene), vd = new BABYLON.VertexData();
    vd.positions = P; vd.normals = N; vd.uvs = U; vd.indices = I; vd.applyToMesh(m, false);
    m.material = atlasMaterial(B.scene, kind === 'glow');
    B.push(); B.stack[B.stack.length - 1] = { c: 1, s: 0, th: 0, tx: 0, ty: 0, tz: 0, k: 1 };
    B.mesh(m, { collide: 'none', cast: false });
    B.pop();
  }
  DEC.delete(B);
}

// ------------------------------------------------------------------------------------------------------------ night city facades
function facadeTextures(scene) {
  const st = stateOf(scene);
  if (st.fac) return st.fac;
  const k = QUAL === 'low' ? .5 : 1, W = 1024 * k;
  const alb = new BABYLON.DynamicTexture('hs_fac', { width: W, height: W }, scene, true), emi = new BABYLON.DynamicTexture('hs_fac_e', { width: W, height: W }, scene, true);
  const a = alb.getContext(), e = emi.getContext(), r = rng(91), n = 8, cw = W / n;
  a.fillStyle = '#3a3a3c'; a.fillRect(0, 0, W, W); e.fillStyle = '#000'; e.fillRect(0, 0, W, W);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = i * cw + cw * .14, y = j * cw + cw * .2, w = cw * .72, h = cw * .56, lit = r() < .22;
    a.fillStyle = '#121519'; a.fillRect(x, y, w, h);
    if (lit) {
      const warm = r() < .7, col = warm ? [255, 196 + r() * 40 | 0, 120 + r() * 50 | 0] : [190, 215, 255], blind = r() < .4;
      const grd = e.createLinearGradient(0, y, 0, y + h); const k2 = .45 + r() * .55;
      grd.addColorStop(0, `rgba(${col[0] * k2 | 0},${col[1] * k2 | 0},${col[2] * k2 | 0},1)`); grd.addColorStop(1, `rgba(${col[0] * k2 * .6 | 0},${col[1] * k2 * .6 | 0},${col[2] * k2 * .6 | 0},1)`);
      e.fillStyle = grd; e.fillRect(x, y, w, h);
      if (blind) { e.fillStyle = 'rgba(0,0,0,.55)'; for (let b = 0; b < h; b += 6 * k + 2) e.fillRect(x, y + b, w, 2 * k + 1); }
      a.fillStyle = '#4a4a46'; a.fillRect(x, y, w, h);
    }
    a.fillStyle = '#55554f'; a.fillRect(x - 2, y + h, w + 4, 4 * k + 2);   // sill
  }
  alb.update(true); emi.update(true);
  for (const t of [alb, emi]) { t.wrapU = t.wrapV = BABYLON.Texture.WRAP_ADDRESSMODE; }
  const m = new BABYLON.PBRMaterial('m_hs_facade', scene);
  m.albedoTexture = alb; m.emissiveTexture = emi; m.emissiveColor = new BABYLON.Color3(1, 1, 1); m.emissiveIntensity = 1.2;
  m.metallic = 0; m.roughness = .9; m.environmentIntensity = .5;
  m.metadata = { lf: 'hs_facade', surf: 'concrete' };
  st.fac = m;
  return m;
}
/** a distant building (no collider): box w x d x h at (x, z), facade texture with one window per ~3.4 x 3.2 m */
export function skyline(B, x, z, w, d, h, o = {}) {
  QUAL = (B.opts && B.opts.quality) || QUAL;
  const mat = facadeTextures(B.scene), y0 = o.y || 0, uo = o.u || 0, vo = o.v || 0;
  const P = [], N = [], U = [], I = [];
  const face = (a, b, c, dd, n, uw, vh) => {
    const i = P.length / 3;
    for (const p of [a, b, c, dd]) P.push(...p);
    for (let k = 0; k < 4; k++) N.push(...n);
    U.push(uo, vo, uo + uw, vo, uo + uw, vo + vh, uo, vo + vh);
    I.push(i, i + 2, i + 1, i, i + 3, i + 2);
  };
  const x0 = x - w / 2, x1 = x + w / 2, z0 = z - d / 2, z1 = z + d / 2, y1 = y0 + h, cu = 1 / (8 * 3.4), cv = 1 / (8 * 3.2);
  face([x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [0, 0, -1], w * cu, h * cv);
  face([x1, y0, z1], [x0, y0, z1], [x0, y1, z1], [x1, y1, z1], [0, 0, 1], w * cu, h * cv);
  face([x0, y0, z1], [x0, y0, z0], [x0, y1, z0], [x0, y1, z1], [-1, 0, 0], d * cu, h * cv);
  face([x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0], [1, 0, 0], d * cu, h * cv);
  const m = new BABYLON.Mesh('hs_sky', B.scene), vd = new BABYLON.VertexData();
  // fix winding against the normals (Babylon: cross(b - a, c - a) . n < 0 is front)
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t], b = I[t + 1], c = I[t + 2];
    const ux = P[b * 3] - P[a * 3], uy = P[b * 3 + 1] - P[a * 3 + 1], uz = P[b * 3 + 2] - P[a * 3 + 2], vx = P[c * 3] - P[a * 3], vy = P[c * 3 + 1] - P[a * 3 + 1], vz = P[c * 3 + 2] - P[a * 3 + 2];
    const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
    if (cx * N[a * 3] + cy * N[a * 3 + 1] + cz * N[a * 3 + 2] > 0) { I[t + 1] = c; I[t + 2] = b; }
  }
  vd.positions = P; vd.normals = N; vd.uvs = U; vd.indices = I; vd.applyToMesh(m, false);
  m.material = mat;
  B.mesh(m, { collide: 'none', cast: false, receive: false });
  // roof
  B.box(x, y1, z, w, .3, d, { mat: 'concrete_dark', collide: false, cast: false });
  if (o.parapet !== false) B.box(x, y1 + .3, z, w, .9, d, { mat: 'concrete_dark', collide: false, cast: false, skip: 'tb' });
}

// ------------------------------------------------------------------------------------------------------------ architecture
const SKIRT = 'p_plastic_dark', RAIL = 'wood_floor';
/** a wall from (ax, az) to (bx, bz); left / right materials; openings at absolute positions along the run.
   o: { y = 0, h = 3, t = .2, l: mat (left), r: mat (right), ends, ops: [{ c (absolute along the run), w, h = 2.1, y = 0, frame,
        door: variant|false, open (deg), toLeft (swing side), glass, board (plywood over a window), win: 'modern'|'wood'|... }],
        skirt = true, band: { l, r, h = 1.2 } (lower wall cladding), rail: 'l'|'r'|'both' (bed bumper rail), collide }
   left = north for runs along +x, west for runs along +z. */
function wallRun(B, ax, az, bx, bz, o = {}) {
  const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz); if (L < 1e-3) return;
  const ux = dx / L, uz = dz / L, nx = -uz, nz = ux;            // left normal
  const along = Math.abs(ux) > .5 ? 'x' : 'z', start = along === 'x' ? ax : az;
  const y = o.y || 0, h = o.h || 3, t = o.t || .2, ml = o.l || 'hs_wall', mr = o.r || ml;
  const ops = (o.ops || []).map(p => Object.assign({ w: 1.2, h: 2.1, y: 0 }, p, { at: p.c - start }));
  B.wall(ax, az, bx, bz, { y, h, t, mat: ml, mat2: mr, matEnd: o.ends || ml, uv: o.uv, collide: o.collide,
    openings: ops.map(p => ({ at: p.at, w: p.w, h: p.h, y: p.y, frame: p.door ? false : (p.frame === undefined ? (p.y > 0 ? false : 'p_paint_grey') : p.frame), glass: p.glass })) });
  const th = Math.atan2(-dz, dx);
  const pt = (s, side, off) => ({ x: ax + ux * s + nx * side * off, z: az + uz * s + nz * side * off });
  // intervals [a, b] of the run where nothing interrupts an element of height top
  const free = top => {
    const cut = ops.filter(p => p.y < top).map(p => [p.at - p.w / 2, p.at + p.w / 2]).sort((p, q) => p[0] - q[0]);
    const out = []; let u = 0;
    for (const [a, b] of cut) { if (a > u + .02) out.push([u, a]); u = Math.max(u, b); }
    if (u < L - .02) out.push([u, L]);
    return out;
  };
  const strip = (side, mat, y0, hh, depth, top) => {
    for (const [a, b] of free(top)) {
      const p = pt((a + b) / 2, side, t / 2 + depth / 2);
      B.box(p.x, y + y0, p.z, b - a, hh, depth, { mat, ry: th, collide: false, cast: false });
    }
  };
  const sides = s => s === 'both' ? [1, -1] : s === 'l' ? [1] : s === 'r' ? [-1] : [];
  if (o.skirt !== false) for (const s of sides(o.skirt === undefined ? 'both' : o.skirt)) strip(s, SKIRT, 0, .1, .016, .1);
  if (o.band) {
    const bh = o.band.h || 1.2;
    if (o.band.l) strip(1, o.band.l, .1, bh - .1, .008, bh);
    if (o.band.r) strip(-1, o.band.r, .1, bh - .1, .008, bh);
  }
  if (o.rail) for (const s of sides(o.rail)) { strip(s, RAIL, .84, .16, .04, 1.0); strip(s, 'p_alu', .9, .03, .05, 1.0); }
  // doors, windows, boards
  for (const p of ops) {
    const c = pt(p.at, 1, 0);
    if (p.door) {
      const leaf = p.door === 'double' || p.door === 'steel2' ? 'double' : p.door;
      const lw = Math.max(.6, p.w - .12);
      const ryd = th + (p.toLeft ? 0 : PI);
      B.prop('door', c.x, y + p.y, c.z, { ry: ryd, variant: p.door === 'steel2' ? 'double' : leaf, w: lw, h: Math.min(p.h - .05, 2.1), open: p.open == null ? 95 : p.open });
    }
    if (p.win) B.prop('window', c.x, y + p.y, c.z, { ry: th, variant: p.win, w: p.w, h: p.h, t });
    if (p.board) {   // plywood boarding fixed over the outside (side = p.board: 1 left, -1 right)
      const q = pt(p.at, p.board, t / 2 + .03);
      B.box(q.x, y + p.y - .05, q.z, p.w + .2, p.h + .1, .025, { mat: 'plywood', ry: th, surf: 'wood' });
    }
  }
}
/** wall along x at z from x0 to x1 (left = north): o.n / o.s materials, ops at absolute x */
export function wx(B, z, x0, x1, o = {}) { wallRun(B, x0, z, x1, z, Object.assign({}, o, { l: o.n || o.l, r: o.s || o.r, band: o.band && { l: o.band.n, r: o.band.s, h: o.band.h }, rail: o.rail && ({ n: 'l', s: 'r', both: 'both' })[o.rail], skirt: o.skirt && ({ n: 'l', s: 'r', both: 'both' })[o.skirt] || o.skirt })); }
/** wall along z at x from z0 to z1 (left = west): o.w / o.e materials, ops at absolute z */
export function wz(B, x, z0, z1, o = {}) { wallRun(B, x, z0, x, z1, Object.assign({}, o, { l: o.w || o.l, r: o.e || o.r, band: o.band && { l: o.band.w, r: o.band.e, h: o.band.h }, rail: o.rail && ({ w: 'l', e: 'r', both: 'both' })[o.rail], skirt: o.skirt && ({ w: 'l', e: 'r', both: 'both' })[o.skirt] || o.skirt })); }

/** structural slab from y0 to y1 (top / bottom materials; o.skipTop: no top face, the finish floor shows instead) */
export function slab(B, x0, z0, x1, z1, y0, y1, o = {}) {
  if (x1 - x0 < .01 || z1 - z0 < .01) return;
  B.box((x0 + x1) / 2, y0, (z0 + z1) / 2, x1 - x0, y1 - y0, z1 - z0, { mat: o.side || 'concrete', mats: { t: o.top || 'concrete_floor', b: o.bot || 'ceiling_tile' },
    skip: (o.skipTop ? 't' : '') + (o.skipBot ? 'b' : ''), surf: o.surf, cast: o.cast });
}
/** 1 cm floor finish (visual only) */
export function finish(B, x0, z0, x1, z1, y, mat) {
  if (x1 - x0 < .01 || z1 - z0 < .01) return;
  B.box((x0 + x1) / 2, y, (z0 + z1) / 2, x1 - x0, .008, z1 - z0, { mat, collide: false, cast: false, skip: 'b' });
}
/** ceiling fixtures in a grid: o = { dx = 3.6, dz = 2.4, kind = 'troffer', on = .5 (share lit), warm, seed, light: [indices with a real light] } */
export function fixtures(B, x0, z0, x1, z1, y, o = {}) {
  const dx = o.dx || 3.6, dz = o.dz || 2.4, nx = Math.max(1, Math.round((x1 - x0) / dx)), nz = Math.max(1, Math.round((z1 - z0) / dz));
  const r = rng(o.seed || hashStr(x0 + ',' + z0 + ',' + y)), on = o.on == null ? .5 : o.on;
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const x = x0 + (i + .5) * (x1 - x0) / nx, z = z0 + (j + .5) * (z1 - z0) / nz;
    B.prop('light_fixture', x, y, z, { variant: o.kind || 'troffer', on: r() < on, warm: o.warm, ry: o.ry || 0 });
  }
}
/** dog-leg stair in a shaft. o: { x0, z0, x1, z1 (shaft inside), y0, y1, entry: 's'|'n'|'w'|'e' (end where flight 1 starts),
   first: 'l'|'r' (half used by flight 1, seen from the entry looking in), land = 1.5, mat, tread, landTop: true = also the top landing } */
export function dogleg(B, o) {
  const land = o.land || 1.5, mat = o.mat || 'concrete', tread = o.tread || 'hs_lino_blue', ym = (o.y0 + o.y1) / 2;
  const alongZ = o.entry === 's' || o.entry === 'n';
  const len = (alongZ ? o.z1 - o.z0 : o.x1 - o.x0) - 2 * land, wid = alongZ ? o.x1 - o.x0 : o.z1 - o.z0, fw = (wid - .14) / 2;
  // entry end coordinate and the inward direction sign
  const sgn = o.entry === 's' || o.entry === 'w' ? 1 : -1;
  const e0 = alongZ ? (sgn > 0 ? o.z0 : o.z1) : (sgn > 0 ? o.x0 : o.x1);
  // the two halves: 'l' / 'r' seen from the entry looking in (inward = +z: left = -x; inward = -z: left = +x; inward +x: left = +z)
  const lo = alongZ ? o.x0 : o.z0, hi = alongZ ? o.x1 : o.z1;
  const leftLow = (o.entry === 's') || (o.entry === 'e');   // which side the 'left' half is on (low coordinate) for this entry
  const half = which => { const isLow = (which === 'l') === leftLow; return isLow ? [lo, lo + fw] : [hi - fw, hi]; };
  const f1 = half(o.first || 'l'), f2 = half((o.first || 'l') === 'l' ? 'r' : 'l');
  const mid = () => e0 + sgn * (land + len / 2);
  const dir1 = alongZ ? (sgn > 0 ? '+z' : '-z') : (sgn > 0 ? '+x' : '-x'), dir2 = alongZ ? (sgn > 0 ? '-z' : '+z') : (sgn > 0 ? '-x' : '+x');
  const put = (h, y0, y1, dir) => {
    const c = (h[0] + h[1]) / 2;
    if (alongZ) B.stairs({ x: c, z: mid(), w: fw, len, y0, y1, dir, mat, tread, rail: false });
    else B.stairs({ x: mid(), z: c, w: fw, len, y0, y1, dir, mat, tread, rail: false });
  };
  put(f1, o.y0, ym, dir1); put(f2, ym, o.y1, dir2);
  // half landing at the far end
  const far0 = e0 + sgn * (land + len), far1 = e0 + sgn * (2 * land + len);
  if (alongZ) slab(B, o.x0, Math.min(far0, far1), o.x1, Math.max(far0, far1), ym - .25, ym, { top: tread, bot: 'plaster_white', side: 'concrete' });
  else slab(B, Math.min(far0, far1), o.z0, Math.max(far0, far1), o.z1, ym - .25, ym, { top: tread, bot: 'plaster_white', side: 'concrete' });
  // the centre (spine) wall between the flights, solid from the bottom to the top of this storey (+ a rail height on the top storey)
  const sp = (f1[0] + f1[1] + f2[0] + f2[1]) / 4, e1 = e0 + sgn * land, e2 = e0 + sgn * (land + len), top = o.y1 + (o.top ? 1.0 : 0);
  if (alongZ) B.box(sp, o.y0, (e1 + e2) / 2, .12, top - o.y0, Math.abs(e2 - e1), { mat: 'plaster_white', mats: { t: 'p_alu' } });
  else B.box((e1 + e2) / 2, o.y0, sp, Math.abs(e2 - e1), top - o.y0, .12, { mat: 'plaster_white', mats: { t: 'p_alu' } });
  // wall handrails beside each flight (visual): h = the flight's half, rising from ya at e1 to yb at e2
  const rail = (h, ya, yb) => {
    const outer = h[0] <= lo + 1e-6 ? lo + .05 : hi - .05, steps = 6;
    for (let i = 0; i < steps; i++) {
      const f = (i + .5) / steps, yy = ya + (yb - ya) * f + .88, s = e1 + (e2 - e1) * f, L = Math.abs(e2 - e1) / steps + .03;
      if (alongZ) B.box(outer, yy, s, .05, .04, L, { mat: 'p_alu', collide: false, cast: false });
      else B.box(s, yy, outer, L, .04, .05, { mat: 'p_alu', collide: false, cast: false });
    }
  };
  rail(f1, o.y0, ym); rail(f2, o.y1, ym);
  if (o.landTop) {   // the landing at the entry end on the top level (usually part of the floor above)
    if (alongZ) slab(B, o.x0, Math.min(e0, e1), o.x1, Math.max(e0, e1), o.y1 - .25, o.y1, { top: tread, bot: 'plaster_white' });
    else slab(B, Math.min(e0, e1), o.z0, Math.max(e0, e1), o.z1, o.y1 - .25, o.y1, { top: tread, bot: 'plaster_white' });
  }
  return { f1, f2, e0, e1, e2, far0, far1, ym };
}

/** rect minus holes -> non-overlapping rects ({ x0, z0, x1, z1 }); holes may stick out of the rect */
export function cut(r, holes = []) {
  const H = holes.map(h => ({ x0: Math.max(r.x0, h.x0), z0: Math.max(r.z0, h.z0), x1: Math.min(r.x1, h.x1), z1: Math.min(r.z1, h.z1) })).filter(h => h.x1 > h.x0 + 1e-6 && h.z1 > h.z0 + 1e-6);
  const xs = [...new Set([r.x0, r.x1, ...H.flatMap(h => [h.x0, h.x1])])].sort((a, b) => a - b);
  const zs = [...new Set([r.z0, r.z1, ...H.flatMap(h => [h.z0, h.z1])])].sort((a, b) => a - b);
  const inHole = (x, z) => H.some(h => x > h.x0 && x < h.x1 && z > h.z0 && z < h.z1);
  let out = [], prev = [];
  for (let j = 0; j < zs.length - 1; j++) {
    const z0 = zs[j], z1 = zs[j + 1], zm = (z0 + z1) / 2, row = [];
    let run = null;
    for (let i = 0; i < xs.length - 1; i++) {
      const x0 = xs[i], x1 = xs[i + 1], solid = !inHole((x0 + x1) / 2, zm);
      if (solid) { if (run) run.x1 = x1; else run = { x0, x1 }; } else if (run) { row.push(run); run = null; }
    }
    if (run) row.push(run);
    const cur = [];
    for (const s of row) {   // extend a rect from the previous band with the same x span
      const p = prev.find(q => Math.abs(q.x0 - s.x0) < 1e-6 && Math.abs(q.x1 - s.x1) < 1e-6);
      if (p) { p.z1 = z1; cur.push(p); } else { const n = { x0: s.x0, z0, x1: s.x1, z1 }; out.push(n); cur.push(n); }
    }
    prev = cur;
  }
  return out;
}

// ------------------------------------------------------------------------------------------------------------ custom props
const KC = new Map();
function kit(key, build) {
  let K = KC.get(key);
  if (!K) { K = new Kit(hashStr(key) || 1); build(K, K.rand); K.compact(); KC.set(key, K); }
  return K;
}
const wheel = (K, x, y, z, r, w = .03) => { K.push(x, y, z, 0, 0, PI / 2); K.cyl('p_plastic_dark', 0, -w / 2, 0, r, w, { seg: 10 }); K.pop(); };

const PROPS = {
  // operating table: pedestal base, column, padded top in sections, arm boards (long axis = z)
  optable(K) {
    K.box('p_stainless', 0, 0, 0, .6, .08, 1.1, { bev: .02 }); K.box('p_plastic_grey', 0, .08, 0, .5, .1, .9, { bev: .03 });
    K.cyl('p_stainless', 0, .18, 0, .14, .55, { seg: 12 });
    K.box('p_stainless', 0, .73, 0, .56, .06, 1.95, { bev: .01 });
    for (const [z, l] of [[-.72, .5], [0, .9], [.75, .42]]) K.box('p_fab_navy', 0, .79, z, .52, .07, l - .02, { bev: .025 });
    for (const s of [-1, 1]) { K.box('p_stainless', s * .55, .74, -.35, .55, .03, .16, { bev: .008 }); K.box('p_fab_navy', s * .55, .77, -.35, .53, .04, .14, { bev: .015 }); }
    K.box('p_stainless', 0, .66, -1.0, .5, .05, .1);
    K.col(0, 0, 0, .6, .86, 1.95, { surf: 'metal' });
  },
  // ceiling pendant with two lamp heads: y = ceiling height
  oplight(K) {
    K.cyl('p_paint_cream', 0, -.12, 0, .16, .12, { seg: 14 }); K.cyl('p_alu', 0, -.75, 0, .045, .65, { seg: 8 });
    for (const [a, r, d, h] of [[.4, 1.0, -1.25, .3], [2.7, .75, -1.05, .26]]) {
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      K.tube('p_paint_cream', [[0, -.72, 0], [x * .6, -.78, z * .6], [x, d + .1, z]], .035, { seg: 6 });
      K.lathe('p_paint_cream', [[.06, d + .12], [h * .9, d], [h, d - .1], [h * .95, d - .14]], { x, z, seg: 18, caps: false });
      K.cyl('p_lens_clear', x, d - .135, z, h * .85, .01, { seg: 18 });
      K.cyl('emissive_white', x, d - .14, z, h * .3, .008, { seg: 12 }); K.noCast('emissive_white');
      K.cyl('p_alu', x, d - .2, z, .03, .08, { seg: 6 });
    }
  },
  // anaesthetic machine: cart, vaporisers, monitors on an arm, gas cylinders at the back
  anaes(K) {
    K.box('p_plastic_grey', 0, .1, 0, .75, .9, .62, { bev: .02 }); K.box('p_paint_cream', 0, 1.0, 0, .78, .05, .66, { bev: .01 });
    for (let i = 0; i < 3; i++) K.box('p_plastic_grey', 0, .2 + i * .26, .315, .68, .22, .012, { bev: .006 });
    K.box('p_plastic_grey', 0, 1.05, -.18, .7, .55, .28, { bev: .02 });
    for (let i = 0; i < 2; i++) K.box(['p_plastic_yellow', 'p_plastic_blue'][i], -.18 + i * .2, 1.25, .02, .12, .22, .12, { bev: .02 });
    K.cyl('p_chrome', .32, 1.05, -.2, .02, .75, { seg: 6 });
    K.box('p_plastic_dark', .32, 1.65, -.05, .42, .3, .06, { bev: .01, ry: -.3 }); K.box('p_screen', .33, 1.68, -.015, .36, .24, .01, { ry: -.3 });
    K.box('p_plastic_dark', -.05, 1.62, -.2, .36, .26, .06, { bev: .01 }); K.box('p_screen', -.05, 1.65, -.165, .3, .2, .01);
    for (const x of [-.25, 0, .25]) K.cyl(x === 0 ? 'p_coat_white' : 'p_coat_green', x, .1, -.4, .07, .8, { seg: 10 });
    K.tube('p_fab_charcoal', [[.3, 1.0, .1], [.5, .8, .4], [.4, .7, .7]], .02, { seg: 5 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) wheel(K, sx * .3, .05, sz * .24, .05);
    K.col(0, 0, 0, .8, 1.35, .7, { surf: 'metal' });
  },
  // stainless instrument trolley (two shelves)
  trolley(K, r) {
    const W = .9, D = .5;
    for (const y of [.25, .85]) K.box('p_stainless', 0, y, 0, W, .03, D, { bev: .006 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { K.cyl('p_stainless', sx * (W / 2 - .03), .06, sz * (D / 2 - .03), .012, .82, { seg: 6 }); wheel(K, sx * (W / 2 - .03), .04, sz * (D / 2 - .03), .04); }
    for (let i = 0; i < 6; i++) K.box(['p_fab_teal', 'p_alu', 'p_plastic_milky'][i % 3], -.35 + r() * .7, .88, -.18 + r() * .36, .1 + r() * .15, .015 + r() * .03, .06 + r() * .1, { ry: r() * PI });
    K.col(0, 0, 0, W, .9, D, { surf: 'metal' });
  },
  // scrub trough: back at z = 0, front +z
  scrub(K) {
    K.box('p_stainless', 0, .85, .32, 2.4, .25, .6, { bev: .02 }); K.box('p_stainless', 0, 0, .1, 2.3, .85, .16);
    for (let i = 0; i < 3; i++) { const x = -.8 + i * .8; K.tube('p_chrome', [[x, 1.3, .03], [x, 1.42, .12], [x, 1.38, .26]], .015, { seg: 6 }); K.box('p_stainless', x, 1.1, .04, .2, .3, .06, { bev: .01 }); }
    K.box('p_stainless', 0, 1.5, .02, 2.4, .6, .03);
    K.col(0, 0, 0, 2.4, 1.1, .64, { surf: 'metal' });
  },
  // equipment tower (diathermy, laparoscopy stack) on castors
  tower(K) {
    K.box('p_paint_cream', 0, .1, 0, .6, .08, .6, { bev: .01 });
    for (let i = 0; i < 4; i++) K.box(i % 2 ? 'p_plastic_dark' : 'p_plastic_grey', 0, .25 + i * .32, 0, .55, .28, .5, { bev: .01 });
    K.box('p_plastic_dark', 0, 1.55, -.05, .62, .42, .06, { bev: .01 }); K.box('p_screen', 0, 1.58, -.015, .56, .36, .01);
    for (const x of [-.24, .24]) K.cyl('p_alu', x, .1, -.22, .015, 1.5, { seg: 6 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) wheel(K, sx * .24, .05, sz * .24, .05);
    K.col(0, 0, 0, .62, 1.5, .62, { surf: 'metal' });
  },
  // x-ray room: ceiling-rail tube head (y = floor), bucky table, wall stand
  xray(K) {
    K.box('p_paint_cream', 0, 0, 0, .8, .7, .5, { bev: .03 }); K.box('p_paint_cream', 0, .7, 0, .85, .08, 2.2, { bev: .02 }); K.box('p_fab_charcoal', 0, .78, 0, .75, .04, 2.1, { bev: .015 });
    K.box('p_alu', 0, 2.95, 0, .12, .05, 3.2); K.box('p_alu', 0, 2.6, .2, .18, .35, .18);
    K.cyl('p_alu', 0, 1.9, .2, .05, .7, { seg: 8 }); K.box('p_paint_cream', 0, 1.62, .2, .45, .3, .35, { bev: .04 }); K.box('p_plastic_dark', 0, 1.48, .2, .3, .14, .3, { bev: .02 });
    K.box('p_paint_cream', 0, 0, -2.2, .5, .06, .5); K.box('p_alu', 0, .06, -2.3, .15, 2.0, .12); K.box('p_paint_cream', 0, .8, -2.2, .55, .6, .1, { bev: .02 });
    K.col(0, 0, 0, .85, .82, 2.2, { surf: 'metal' }); K.col(0, 0, -2.25, .55, 2.0, .3, { surf: 'metal' });
  },
  // bank of mortuary fridge doors 3 wide x 3 high (front +z, back z = -.9); the doors stand out of the wall
  fridge3(K) {
    const W = 2.7, H = 2.2, D = .9;
    K.box('p_stainless', 0, 0, -D / 2, W, H, D, { bev: .01 });
    K.box('p_stainless', 0, H, -D / 2, W, .12, D);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
      const x = -W / 3 + i * W / 3, y = .12 + j * .7;
      K.box('p_stainless', x, y, .005, W / 3 - .06, .62, .04, { bev: .01 });
      K.box('p_chrome', x + .3, y + .26, .05, .05, .12, .04); K.box('p_plastic_milky', x - .25, y + .5, .028, .16, .06, .005);
    }
    K.box('p_plastic_dark', W / 2 - .2, H - .1, .02, .25, .14, .04);
    K.col(0, 0, -D / 2, W, H + .12, D + .1, { surf: 'metal' });
  },
  // post-mortem table: stainless top with a drain lip on a pedestal and a sink at the head
  pmtable(K) {
    K.box('p_stainless', 0, 0, 0, .5, .08, .7, { bev: .01 }); K.box('p_stainless', 0, .08, 0, .3, .7, .4, { bev: .02 });
    K.box('p_stainless', 0, .78, 0, .78, .05, 2.3, { bev: .01 });
    for (const s of [-1, 1]) K.box('p_stainless', s * .37, .83, 0, .04, .05, 2.3); for (const s of [-1, 1]) K.box('p_stainless', 0, .83, s * 1.13, .78, .05, .04);
    K.box('p_stainless', 0, .55, -1.3, .6, .3, .4, { bev: .01 }); K.tube('p_chrome', [[0, .85, -1.45], [0, 1.15, -1.45], [0, 1.15, -1.25]], .015, { seg: 6 });
    K.col(0, 0, 0, .8, .88, 2.6, { surf: 'metal' });
  },
  // wheelchair (front +z)
  wheelchair(K) {
    for (const s of [-1, 1]) { K.push(s * .3, .3, -.1, 0, 0, PI / 2); K.ring('p_plastic_dark', 0, 0, 0, .28, .02, { seg: 18 }); K.ring('p_chrome', 0, 0, 0, .25, .008, { seg: 18 }); K.pop(); wheel(K, s * .22, .08, .3, .08); }
    K.box('p_fab_charcoal', 0, .48, 0, .44, .05, .42); K.box('p_fab_charcoal', 0, .5, -.22, .44, .45, .03, { rx: -.1 });
    for (const s of [-1, 1]) { K.tube('p_chrome', [[s * .23, .1, .32], [s * .23, .5, .2], [s * .23, .5, -.2], [s * .23, .98, -.28], [s * .2, 1.0, -.38]], .012, { seg: 5 }); K.box('p_plastic_dark', s * .24, .68, -.02, .05, .03, .35); }
    K.box('p_plastic_dark', 0, .1, .33, .36, .02, .12);
    K.col(0, 0, 0, .64, .95, .8, { surf: 'metal' });
  },
  ivstand(K) { K.cyl('p_chrome', 0, .06, 0, .012, 1.9, { seg: 6 }); for (let i = 0; i < 5; i++) { const a = i * TAU / 5; K.tube('p_chrome', [[0, .1, 0], [Math.cos(a) * .3, .06, Math.sin(a) * .3]], .01, { seg: 4 }); wheel(K, Math.cos(a) * .3, .03, Math.sin(a) * .3, .03); } K.tube('p_chrome', [[-.15, 1.96, 0], [0, 1.9, 0], [.15, 1.96, 0]], .006, { seg: 4 }); K.box('p_plastic_milky', .12, 1.6, 0, .1, .22, .04, { bev: .02 }); },
  // cubicle curtain on a ceiling track around three sides of a bay (w x d, open side +z), y = ceiling
  curtainbay(K, r, o) {
    const w = o.w || 2.4, d = o.d || 2.6, drop = o.drop || .4, H = o.ceil || 2.9;
    const track = [[-w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2], [w / 2, -d / 2]];
    K.box('p_alu', -w / 2, H - .04, 0, .03, .03, d); K.box('p_alu', w / 2, H - .04, 0, .03, .03, d); K.box('p_alu', 0, H - .04, d / 2, w, .03, .03);
    const fab = o.fab || 'p_fab_teal';
    const hang = (x0, z0, x1, z1, frac) => {
      const L = Math.hypot(x1 - x0, z1 - z0) * frac, n = Math.max(4, Math.round(L / .12)), ux = (x1 - x0) / Math.hypot(x1 - x0, z1 - z0), uz = (z1 - z0) / Math.hypot(x1 - x0, z1 - z0);
      const pts = []; for (let i = 0; i <= n; i++) { const f = i / n * L, wob = Math.sin(i * PI) * .05 * (i % 2 ? 1 : -1); pts.push([x0 + ux * f - uz * wob, z0 + uz * f + ux * wob]); }
      const poly = pts.concat(pts.slice().reverse().map(p => [p[0] - uz * .015, p[1] + ux * .015]));
      K.extY(fab, poly, .35, H - drop, { caps: true });
      K.box('p_chainlink', x0 + ux * L / 2, H - drop, z0 + uz * L / 2, Math.abs(ux) * L + .02, drop - .05, Math.abs(uz) * L + .02);
    };
    // back (-z) is a wall; curtains on the two sides, partly drawn
    hang(-w / 2, -d / 2 + .05, -w / 2, d / 2, .55 + r() * .4);
    hang(w / 2, d / 2, w / 2, -d / 2 + .05, .3 + r() * .5);
    if (o.front) hang(-w / 2, d / 2, w / 2, d / 2, .35 + r() * .3);
  },
  // row of n beam-mounted waiting seats (front +z)
  seats(K, r, o) {
    const n = o.n || 4, pitch = .56, W = n * pitch;
    K.box('p_paint_darkgrey', 0, .36, -.05, W + .1, .06, .08);
    for (const x of [-W / 2 + .1, W / 2 - .1]) { K.box('p_paint_darkgrey', x, 0, -.05, .06, .36, .06); K.box('p_paint_darkgrey', x, 0, -.05, .06, .03, .5); }
    for (let i = 0; i < n; i++) {
      const x = -W / 2 + (i + .5) * pitch, mat = o.mat || 'p_plastic_blue';
      if (o.broken && r() < .2) continue;
      K.box(mat, x, .42, .02, .48, .05, .44, { bev: .015 }); K.box(mat, x, .47, -.2, .48, .42, .04, { bev: .015, rx: -.12 });
      if (i < n - 1) K.box('p_paint_darkgrey', x + pitch / 2, .55, .0, .04, .12, .38);
    }
    K.col(0, 0, 0, W + .1, .5, .5, { surf: 'metal' });
  },
  // reception / nurses' counter run along x (staff side -z, public side +z): o.len
  counter(K, r, o) {
    const L = o.len || 4, H = 1.1;
    K.box('p_paint_cream', 0, 0, .05, L, .74, .7, { bev: .01 }); K.box('p_wood_walnut', 0, .74, .05, L + .02, .03, .74);
    K.box(o.front || 'hs_spandrel', 0, 0, .42, L, H, .06, { bev: .01 }); K.box('p_wood_walnut', 0, H, .38, L + .04, .03, .22);
    K.box(SKIRT, 0, 0, .456, L, .1, .01);
    for (let i = 0; i < Math.floor(L / 1.2); i++) { const x = -L / 2 + .6 + i * 1.2; K.box('p_plastic_dark', x, .77, -.1, .45, .32, .04, { bev: .01, rx: -.1 }); K.box('p_screen', x, .79, -.078, .4, .26, .005, { rx: -.1 }); K.box('p_plastic_dark', x, .77, .1, .4, .015, .14); }
    for (let i = 0; i < 6; i++) K.box(r() < .5 ? 'p_plastic_milky' : 'p_fab_beige', -L / 2 + .3 + r() * (L - .6), .77, -.2 + r() * .3, .21, .01 + r() * .05, .3, { ry: r() - .5 });
    K.col(0, 0, .05, L, H + .03, .8, { surf: 'wood' });
  },
  // pharmacy dispensary shelving (front +z): o.len, tall white unit with stock boxes
  medshelf(K, r, o) {
    const L = o.len || 2.0, H = 2.1, D = .42, n = Math.max(1, Math.round(L / 1.0));
    K.box('p_paint_cream', 0, 0, 0, L, .08, D); K.box('p_paint_cream', 0, H - .03, 0, L, .03, D);
    for (let i = 0; i <= n; i++) K.box('p_paint_cream', -L / 2 + i * L / n, 0, 0, .025, H, D);
    K.box('p_paint_cream', 0, 0, -D / 2 + .01, L, H, .02);
    const COLS = ['p_coat_white', 'p_coat_white', 'p_plastic_milky', 'p_coat_blue', 'p_coat_red', 'p_coat_green', 'p_paint_cream', 'p_coat_yellow'];
    for (let s = 0; s < 6; s++) {
      const y = .08 + s * .33;
      K.box('p_paint_cream', 0, y, 0, L, .02, D);
      if (o.empty && r() < .6) continue;
      let x = -L / 2 + .04;
      while (x < L / 2 - .1) {
        const bw = .05 + r() * .12;
        if (r() < (o.sparse ? .45 : .15)) { x += bw + .01; continue; }
        const bh = .08 + r() * .15, bd = .1 + r() * .2;
        K.box(COLS[(r() * COLS.length) | 0], x + bw / 2, y + .02, D / 2 - bd / 2 - .02, bw, bh, bd);
        x += bw + .006;
      }
    }
    K.col(0, 0, 0, L, H, D, { surf: 'metal' });
  },
  // glass-door drugs fridge (front +z)
  drugfridge(K) {
    K.box('p_coat_white', 0, 0, 0, .65, 1.85, .65, { bev: .01 }); K.box('p_alu', 0, .1, .33, .6, 1.65, .02); K.box('p_glass_tint', 0, .16, .345, .5, 1.5, .01);
    for (let i = 0; i < 4; i++) { K.box('p_chrome', 0, .3 + i * .36, 0, .55, .01, .55); for (let k = 0; k < 4; k++) K.box(['p_coat_white', 'p_coat_blue', 'p_plastic_milky'][k % 3], -.2 + k * .13, .31 + i * .36, .05, .1, .12, .18); }
    K.box('p_plastic_dark', .2, 1.7, .335, .14, .06, .01);
    K.col(0, 0, 0, .65, 1.85, .7, { surf: 'metal' });
  },
  // controlled drugs safe on a stand
  cdsafe(K) { K.box('p_paint_grey', 0, 0, 0, .7, .9, .6, { bev: .01 }); K.box('p_paint_darkgrey', 0, .9, 0, .62, .6, .55, { bev: .01 }); K.box('p_chrome', .18, 1.15, .28, .06, .06, .04); K.cylZ('p_chrome', .27, .31, -.05, 1.2, .05, { seg: 10 }); K.col(0, 0, 0, .7, 1.5, .6, { surf: 'metal' }); },
  // chapel pew (front +z), o.len
  pew(K, r, o) {
    const L = o.len || 3.0;
    K.box('p_wood_walnut', 0, .42, 0, L, .05, .42, { bev: .01 }); K.box('p_wood_walnut', 0, .45, -.21, L, .5, .04, { bev: .008, rx: -.1 });
    for (const x of [-L / 2 + .03, L / 2 - .03]) K.extX('p_wood_walnut', [[-.25, 0], [.22, 0], [.22, .44], [-.18, .92], [-.25, .92]], x - .03, x + .03);
    K.box('p_wood_walnut', 0, .7, -.29, L, .04, .1); K.box('p_wood_walnut', 0, .1, .1, L - .1, .04, .14);
    K.col(0, 0, 0, L, .9, .5, { surf: 'wood' });
  },
  // lift doors in a stainless frame (wall item: back at z = 0, front +z); call panel to the right
  lift(K) {
    K.box('p_stainless', 0, 0, .02, 1.5, 2.35, .04); K.box('p_chrome', -.3, .02, .045, .58, 2.12, .02); K.box('p_chrome', .3, .02, .045, .58, 2.12, .02);
    K.box('p_plastic_dark', 0, 2.2, .045, .4, .1, .01); K.box('p_stainless', 1.0, 1.0, .02, .16, .3, .03); K.box('p_plastic_dark', 1.0, 1.15, .036, .05, .05, .01); K.box('p_plastic_dark', 1.0, 1.05, .036, .05, .05, .01);
    K.col(0, 0, 0, 1.5, 2.35, .08, { surf: 'metal' });
  },
  // gas fired boiler with flue and pipes (front +z)
  boiler(K) {
    K.box('p_coat_red', 0, .15, 0, 1.6, 1.9, 2.6, { bev: .04 }); K.box('p_paint_darkgrey', 0, 0, 0, 1.8, .15, 2.8);
    K.box('p_paint_darkgrey', 0, .6, 1.31, 1.2, .9, .04, { bev: .01 }); K.cylZ('p_chrome', 1.33, 1.4, .3, 1.3, .1, { seg: 10 });
    K.cyl('p_galv', 0, 2.05, -.6, .25, 1.4, { seg: 12 });
    for (const x of [-.5, .5]) { K.tube('p_coat_green', [[x, 1.6, -1.3], [x, 2.6, -1.3], [x, 2.75, -1.6]], .06, { seg: 8 }); }
    K.box('p_plastic_dark', .6, 1.2, 1.32, .3, .4, .05);
    K.col(0, 0, 0, 1.8, 2.1, 2.8, { surf: 'metal' });
  },
  // roll cage (laundry) with bags (front +z)
  cage(K, r) {
    K.box('p_galv', 0, .1, 0, .8, .03, .7); for (const sx of [-1, 1]) for (const sz of [-1, 1]) { K.cyl('p_galv', sx * .38, .1, sz * .33, .015, 1.6, { seg: 6 }); wheel(K, sx * .33, .05, sz * .28, .05); }
    for (const sx of [-1, 1]) K.box('p_chainlink', sx * .39, .15, 0, .01, 1.5, .66); K.box('p_chainlink', 0, .15, -.34, .78, 1.5, .01);
    for (let i = 0; i < 4; i++) K.blob(['p_fab_white', 'p_fab_blue', 'p_fab_white', 'p_fab_red'][i], -.15 + (i % 2) * .3, .4 + Math.floor(i / 2) * .45, (r() - .5) * .2, .3, .22, .25, { seg: 7, noise: .2 });
    K.col(0, 0, 0, .8, 1.7, .7, { surf: 'metal', ray: false });
  },
  // bedside locker + overbed table
  bedside(K) { K.box('p_paint_cream', 0, 0, 0, .45, .8, .45, { bev: .01 }); K.box('p_paint_cream', 0, .2, .225, .38, .25, .01); K.box('p_plastic_milky', .1, .8, 0, .07, .2, .07); K.col(0, 0, 0, .45, .8, .45, { surf: 'wood' }); },
  // heras temporary fence panel (3.5 m along x) on rubber blocks; o.lean
  heras(K, r, o) {
    const L = 3.45, H = 2.0;
    K.push(0, 0, 0, 0, o.lean || 0, 0);
    K.box('p_galv', 0, .08, 0, L, .04, .04); K.box('p_galv', 0, H - .04, 0, L, .04, .04);
    for (const x of [-L / 2, L / 2]) K.cyl('p_galv', x, .02, 0, .02, H, { seg: 6 });
    K.box('p_chainlink', 0, .1, 0, L - .04, H - .14, .01);
    K.pop();
    for (const x of [-L / 2, L / 2]) K.box('p_plastic_dark', x, 0, 0, .25, .14, .65, { bev: .03 });
    K.col(0, 0, 0, L, H, .12, { surf: 'metal', ray: false });
  },
  // ambulance (front +z): van cab + box body, battenburg panels, light bars, wheels
  ambulance(K, r, o) {
    const W = 2.3, L = 6.6, cab = 1.7, H = 2.9;
    const body = 'p_coat_yellow', alt = 'p_coat_green';
    // chassis + wheels
    K.box('p_plastic_dark', 0, .35, 0, W - .3, .3, L - .6);
    for (const sz of [L / 2 - .95, -L / 2 + 1.2]) for (const s of [-1, 1]) { K.push(s * (W / 2 - .2), .38, sz, 0, 0, PI / 2); K.cyl('p_plastic_dark', 0, -.13, 0, .38, .26, { seg: 14 }); K.cyl('p_alu', 0, -.135, 0, .22, .27, { seg: 10 }); K.pop(); }
    // cab: lower body, bonnet slope, windscreen
    const zc = L / 2 - cab / 2;
    K.box(body, 0, .55, zc, W - .1, .9, cab - .1, { bev: .05 });
    K.extX(body, [[L / 2 - cab, 1.45], [L / 2 - .55, 1.45], [L / 2 - .1, 1.15], [L / 2 - .1, 1.0], [L / 2 - cab, 1.0]], -W / 2 + .06, W / 2 - .06);
    K.extX('p_glass_dark', [[L / 2 - cab + .05, 1.47], [L / 2 - .5, 1.47], [L / 2 - .05, 2.15], [L / 2 - cab + .05, 2.15]], -W / 2 + .1, W / 2 - .1);
    K.box(body, 0, 2.15, zc - .15, W - .1, .12, cab - .3);
    // box body
    const zb = -L / 2 + (L - cab) / 2;
    K.box('p_coat_white', 0, .55, zb, W, H - .55, L - cab + .02, { bev: .04 });
    // battenburg checks on both sides and the back (two rows)
    const cells = 7, cw = (L - cab - .2) / cells;
    for (const s of [-1, 1]) for (let i = 0; i < cells; i++) for (let j = 0; j < 2; j++) {
      const m = (i + j) % 2 ? body : 'p_coat_blue';
      K.box(m, s * (W / 2 + .005), .75 + j * .42, -L / 2 + .1 + (i + .5) * cw, .01, .4, cw - .01);
    }
    for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) K.box((i + j) % 2 ? body : 'p_coat_blue', -W / 2 + (i + .5) * W / 4, .75 + j * .42, -L / 2 - .005, W / 4 - .01, .4, .01);
    K.box('p_coat_green', 0, 1.65, -L / 2 - .006, W - .3, .1, .01);
    for (const s of [-1, 1]) { K.box('p_coat_green', s * (W / 2 + .006), 1.75, zb, .01, .08, L - cab - .2); K.box('p_glass_dark', s * (W / 2 + .004), 2.0, zb + .8, .01, .5, .9); }
    // rear doors
    K.box('p_alu', 0, .6, -L / 2 - .01, .02, 2.1, .02);
    // light bars + side lights
    for (const [z, w] of [[L / 2 - cab + .4, W - .4], [-L / 2 + .2, W - .6]]) { K.box('p_lens_clear', 0, z > 0 ? 2.27 : H, z, w, .12, .25, { bev: .03 }); K.box('p_em_blue', -w / 4, (z > 0 ? 2.27 : H) + .02, z, w * .4, .09, .2); }
    for (const s of [-1, 1]) { K.box('p_lens_red', s * (W / 2 - .2), 2.4, -L / 2 - .02, .2, .3, .02); K.box('p_lens_amber', s * (W / 2 - .25), .9, L / 2 - .08, .25, .14, .04); }
    K.box('p_plastic_dark', 0, .55, L / 2 - .08, W - .2, .25, .08);
    if (o.door) { K.push(W / 2, .55, zb - .4, 0); K.box('p_coat_white', .45, 0, 0, .9, 1.85, .04); K.pop(); }
    K.col(0, 0, zb, W, H, L - cab, { surf: 'metal' }); K.col(0, 0, zc, W - .1, 2.2, cab - .1, { surf: 'metal' });
    K.hide(W / 2 + .6, 0, -L / 2 + 1.5, 'car');
  },
  // waste / sharps / hand gel wall items: back at z = 0
  gel(K) { K.box('p_coat_white', 0, 1.1, .05, .12, .25, .1, { bev: .02 }); K.box('p_plastic_dark', 0, 1.12, .1, .04, .04, .02); },
  sharps(K) { K.box('p_coat_yellow', 0, 0, 0, .3, .4, .25, { bev: .02 }); K.box('p_coat_red', 0, .4, 0, .3, .05, .25, { bev: .01 }); },
  // skip bin with rubble (front +z)
  skip(K, r) {
    K.extX('p_coat_yellow', [[-1.8, 0], [1.8, 0], [2.1, 1.4], [-2.1, 1.4]], -.85, .85);
    for (let i = 0; i < 9; i++) K.blob(['p_concrete_precast', 'plywood', 'p_rock', 'ceiling_tile'][i % 4], -1.4 + r() * 2.8, 1.25 + r() * .2, -.5 + r() * 1, .3 + r() * .3, .15 + r() * .2, .25 + r() * .2, { seg: 6, noise: .3 });
    K.col(0, 0, 0, 1.75, 1.4, 4.2, { surf: 'metal' });
  },
  // fallen ceiling tiles and debris pile (no collider)
  debris(K, r) {
    for (let i = 0; i < 7; i++) K.box('ceiling_tile', (r() - .5) * 1.8, .005 + i * .01, (r() - .5) * 1.8, .6, .015, .6, { ry: r() * PI, rx: (r() - .5) * .15, rz: (r() - .5) * .15 });
    for (let i = 0; i < 6; i++) K.blob('p_concrete_precast', (r() - .5) * 1.6, .02, (r() - .5) * 1.6, .06 + r() * .08, .03 + r() * .04, .05 + r() * .08, { seg: 5, noise: .3 });
  },
  // patient monitor + bed head panel (wall item, back at z = 0) with gases and sockets
  bedhead(K) {
    K.box('p_paint_cream', 0, 1.25, .04, 2.0, .3, .08, { bev: .01 }); for (let i = 0; i < 4; i++) K.box(['p_coat_white', 'p_coat_blue', 'p_coat_green', 'p_plastic_dark'][i], -.6 + i * .3, 1.33, .085, .08, .08, .02);
    K.box('p_plastic_dark', .7, 1.5, .03, .4, .3, .1, { bev: .01 }); K.box('p_screen', .7, 1.53, .081, .34, .24, .005);
    K.box('p_lens_clear', 0, 1.62, .03, 1.4, .06, .06);
  },
  // bulk liquid oxygen tank (VIE) on legs, fenced compound handled by the map
  lox(K) {
    K.cyl('p_coat_white', 0, .7, 0, 1.0, 6.5, { seg: 18 }); K.lathe('p_coat_white', [[1.0, 0], [.7, .45], [0, .6]], { y: 7.2, seg: 18 });
    for (let i = 0; i < 4; i++) { const a = i * TAU / 4 + .4; K.box('p_galv', Math.cos(a) * .85, 0, Math.sin(a) * .85, .15, .9, .15); }
    K.box('p_galv', 1.2, 0, 0, .6, 1.4, 1.2, { bev: .02 }); K.tube('p_galv', [[.95, 1.2, .3], [1.3, 1.3, .3], [1.3, 3.0, .3]], .04, { seg: 6 });
    K.col(0, 0, 0, 2.2, 7.8, 2.2, { surf: 'metal' });
  },
  // waiting room vending / kiosk counter: coffee kiosk (front +z)
  kiosk(K) {
    K.box('hs_spandrel', 0, 0, 0, 3.0, 1.05, .8, { bev: .02 }); K.box('p_wood_walnut', 0, 1.05, 0, 3.1, .04, .9);
    for (const x of [-1.45, 1.45]) K.box('p_alu', x, 1.09, -.3, .06, 1.3, .06);
    K.box('hs_spandrel', 0, 2.35, -.1, 3.1, .45, .9); K.box('p_lens_clear', 0, 2.35, .36, 3.0, .04, .02);
    K.box('p_chrome', -.6, 1.09, -.15, .5, .45, .4, { bev: .03 }); K.box('p_plastic_dark', .5, 1.09, -.2, .4, .3, .3);
    K.box('p_paint_darkgrey', 0, 0, -1.2, 3.0, 2.0, .5);
    K.col(0, 0, 0, 3.1, 1.1, .9, { surf: 'wood' }); K.col(0, 0, -1.2, 3.0, 2.0, .5, { surf: 'metal' });
  },
  // planter with dead shrubs (concrete box)
  planterdead(K, r, o) {
    const L = o.len || 2.4;
    K.box('p_concrete_precast', 0, 0, 0, L, .6, 1.0, { bev: .03 }); K.box('p_soil', 0, .55, 0, L - .16, .04, .84);
    for (let i = 0; i < Math.round(L * 2); i++) { const x = -L / 2 + .3 + r() * (L - .6), z = (r() - .5) * .6; for (let k = 0; k < 4; k++) K.tube('p_dead_wood', [[x, .58, z], [x + (r() - .5) * .3, .9 + r() * .3, z + (r() - .5) * .3]], .01, { seg: 3 }); }
    K.col(0, 0, 0, L, .6, 1.0, { surf: 'concrete' });
  },
};
/** place a custom prop: P(B, type, x, y, z, { ry, inst, collide, hide, ...build options }) */
export function P(B, type, x, y, z, o = {}) {
  const fn = PROPS[type];
  if (!fn) { B.warn('hospital: unknown prop ' + type); return -1; }
  const keyOpts = Object.assign({}, o); delete keyOpts.ry; delete keyOpts.inst; delete keyOpts.collide; delete keyOpts.hide;
  const key = 'hs_' + type + '_' + JSON.stringify(keyOpts);
  const K = kit(key, (K, r) => fn(K, r, keyOpts));
  return emitKit(B, K, x, y, z, { ry: o.ry || 0, inst: o.inst, collide: o.collide, hide: o.hide }, key.replace(/[^a-z0-9_]/gi, '_'));
}
export const HS_PROPS = Object.keys(PROPS);
