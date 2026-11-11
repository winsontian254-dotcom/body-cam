/* LIVE FIRE — prop decal atlas artwork. Every slot is drawn here with Canvas 2D (original designs, fictional names and
   generic symbols only), packed into one 2048 x 2048 texture per scene by kit.js (p_decal = alpha-tested, p_glow = emissive).
   Exports: nothing (registers slots with defineDecal at import). Slot names are listed in DECAL_NAMES for the gallery.  */
import { defineDecal, rng } from './kit.js';

const SANS = 'Arial, Helvetica, "Liberation Sans", sans-serif', MONO = '"Courier New", "Liberation Mono", monospace';
export const DECAL_NAMES = [];
// big, low-detail slots are stored at a fraction of their logical size (the atlas is 2048 x 2048)
const SCALE = { sign: .75, poster: .8, rug: .62, cont_logo: .7, graffiti: .62, vend: .75, ad_panel: .7, scr: .8, menu: .7, clock: .7, airline: .7,
  books: .75, truck: .7, bus_ad: .7, cont_code: .8, rail: .8, stencil: .8, haz: .8, console: .75, flyer: .8, news: .8, lnum: .8 };
const D = (name, w, h, fn) => { DECAL_NAMES.push(name); const pre = Object.keys(SCALE).find(p => name.startsWith(p)); defineDecal(name, w, h, fn, pre ? SCALE[pre] : 1); };
function text(g, s, x, y, size, o = {}) {
  g.font = (o.weight || 'bold') + ' ' + size + 'px ' + (o.font || SANS);
  g.textAlign = o.align || 'center'; g.textBaseline = o.base || 'middle'; g.fillStyle = o.color || '#fff';
  if (o.maxW) { const m = g.measureText(s).width; if (m > o.maxW) { g.save(); g.translate(x, y); g.scale(o.maxW / m, 1); g.fillText(s, 0, 0); g.restore(); return; } }
  g.fillText(s, x, y);
}
function rrect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
function grime(g, w, h, seed, amt = .18) {   // dirt speckle and streaks so nothing looks freshly printed
  const r = rng(seed);
  g.save();
  for (let i = 0; i < 60; i++) { g.fillStyle = `rgba(40,32,24,${(r() * amt).toFixed(3)})`; const x = r() * w, y = r() * h; g.fillRect(x, y, 1 + r() * 4, 1 + r() * 3); }
  for (let i = 0; i < 6; i++) { g.fillStyle = `rgba(30,25,20,${(r() * amt * .5).toFixed(3)})`; g.fillRect(r() * w, r() * h * .3, 1 + r() * 2, h * (.3 + r() * .6)); }
  g.restore();
}
function poly(g, pts) { g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]); g.closePath(); }

// --------------------------------------------------------------------------------------------------- containers / freight
const CODES = ['ORCU 482913 4', 'NVKU 220519 7', 'KSTU 771204 2', 'TMRU 509387 1'];
CODES.forEach((c, i) => D('cont_code_' + i, 512, 112, (g, w, h) => {
  text(g, c, w / 2, 40, 54, { color: 'rgba(236,236,230,.95)', maxW: w - 20 });
  text(g, i % 2 ? '45G1' : '22G1', w * .82, 92, 30, { color: 'rgba(236,236,230,.9)' });
  text(g, 'MAX GROSS 30480 KG', w * .32, 92, 22, { color: 'rgba(236,236,230,.85)', weight: 'normal' });
}));
const LINES = [['ORCA LINE', '#e8e6df'], ['NORDVIK', '#f2f0ea'], ['KESTREL', '#efe6cf'], ['TRANSMAR', '#f5f5f0']];
LINES.forEach(([name, col], i) => D('cont_logo_' + i, 512, 192, (g, w, h) => {
  g.fillStyle = col; g.strokeStyle = col; g.lineWidth = 10;
  if (i === 0) { g.beginPath(); for (let k = 0; k < 3; k++) { g.moveTo(40, 60 + k * 30); g.bezierCurveTo(90, 30 + k * 30, 130, 90 + k * 30, 180, 60 + k * 30); } g.stroke(); }
  if (i === 1) { poly(g, [[40, 150], [40, 40], [80, 40], [150, 120], [150, 40], [190, 40], [190, 150], [150, 150], [80, 70], [80, 150]]); g.fill(); }
  if (i === 2) { poly(g, [[30, 120], [110, 40], [190, 120], [160, 120], [110, 75], [60, 120]]); g.fill(); poly(g, [[60, 150], [110, 100], [160, 150]]); g.fill(); }
  if (i === 3) { g.beginPath(); g.arc(110, 96, 64, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.moveTo(46, 96); g.lineTo(174, 96); g.moveTo(110, 32); g.lineTo(110, 160); g.stroke(); }
  text(g, name, 360, 100, 64, { color: col, maxW: 300 });
}));
D('cont_plate', 128, 96, (g, w, h) => {
  g.fillStyle = '#9a9c98'; rrect(g, 2, 2, w - 4, h - 4, 6); g.fill(); g.fillStyle = '#5b5d5a';
  for (let k = 0; k < 6; k++) g.fillRect(12, 16 + k * 12, 60 + (k * 23) % 40, 4);
  g.fillStyle = '#2a2b2a'; text(g, 'CSC', 100, 26, 18, { color: '#2a2b2a' });
});
D('haz_flame', 160, 160, (g, w, h) => {
  g.fillStyle = '#c4271b'; poly(g, [[80, 4], [156, 80], [80, 156], [4, 80]]); g.fill();
  g.strokeStyle = '#111'; g.lineWidth = 4; poly(g, [[80, 12], [148, 80], [80, 148], [12, 80]]); g.stroke();
  g.fillStyle = '#111'; g.beginPath(); g.moveTo(80, 30); g.bezierCurveTo(110, 60, 104, 92, 80, 100); g.bezierCurveTo(56, 92, 54, 64, 72, 50); g.bezierCurveTo(70, 66, 80, 70, 80, 30); g.fill();
  g.fillRect(56, 100, 48, 5); text(g, '3', 80, 128, 24, { color: '#111' });
});
D('haz_corrosive', 160, 160, (g, w, h) => {
  g.fillStyle = '#f3f3f0'; poly(g, [[80, 4], [156, 80], [80, 156], [4, 80]]); g.fill();
  g.fillStyle = '#111'; poly(g, [[80, 104], [156, 80], [80, 156], [4, 80]]); g.fill();
  g.strokeStyle = '#111'; g.lineWidth = 4; poly(g, [[80, 12], [148, 80], [80, 148], [12, 80]]); g.stroke();
  g.fillStyle = '#111'; g.fillRect(52, 46, 18, 22); g.fillRect(90, 46, 18, 22); g.fillRect(48, 76, 64, 6);
  text(g, '8', 80, 130, 24, { color: '#fff' });
});
D('haz_gas', 160, 160, (g, w, h) => {
  g.fillStyle = '#1f7a3a'; poly(g, [[80, 4], [156, 80], [80, 156], [4, 80]]); g.fill();
  g.strokeStyle = '#fff'; g.lineWidth = 4; poly(g, [[80, 12], [148, 80], [80, 148], [12, 80]]); g.stroke();
  g.fillStyle = '#fff'; rrect(g, 64, 34, 32, 64, 12); g.fill(); g.fillRect(74, 26, 12, 10); text(g, '2', 80, 128, 24, { color: '#fff' });
});
D('un_plate', 160, 112, (g, w, h) => {
  g.fillStyle = '#e07a10'; g.fillRect(0, 0, w, h); g.strokeStyle = '#111'; g.lineWidth = 6; g.strokeRect(4, 4, w - 8, h - 8);
  g.fillStyle = '#111'; g.fillRect(4, h / 2 - 3, w - 8, 6); text(g, '33', w / 2, 30, 36, { color: '#111' }); text(g, '1203', w / 2, 82, 36, { color: '#111' });
});
D('stencil_fragile', 320, 112, (g, w, h) => { g.globalAlpha = .9; text(g, 'FRAGILE', w / 2, 44, 60, { color: '#b2271b', font: MONO }); text(g, 'HANDLE WITH CARE', w / 2, 92, 26, { color: '#b2271b', font: MONO }); });
D('stencil_up', 160, 160, (g, w, h) => {
  g.fillStyle = '#1b1b1b'; for (const x of [44, 116]) { poly(g, [[x, 20], [x + 30, 62], [x + 12, 62], [x + 12, 120], [x - 12, 120], [x - 12, 62], [x - 30, 62]]); g.fill(); }
  g.fillRect(14, 132, 132, 8);
});
D('stencil_ammo', 448, 160, (g, w, h) => {
  const c = 'rgba(232,226,200,.92)';
  text(g, 'CARTRIDGES 7.62 MM', w / 2, 34, 40, { color: c, font: MONO, maxW: w - 20 });
  text(g, '880 ROUNDS  BALL  LINKED', w / 2, 82, 28, { color: c, font: MONO, maxW: w - 20 });
  text(g, 'LOT LF-47-13   NET WT 26 KG', w / 2, 124, 24, { color: c, font: MONO, maxW: w - 20 });
});
D('stencil_mil', 320, 128, (g, w, h) => {
  const c = 'rgba(228,224,205,.9)';
  text(g, 'No. 4  MK II', w / 2, 34, 36, { color: c, font: MONO }); text(g, '12-88 / ARS 31', w / 2, 84, 30, { color: c, font: MONO });
});
D('stencil_explo', 320, 112, (g, w, h) => {
  g.fillStyle = '#d9731a'; g.fillRect(0, 0, w, h); text(g, 'EXPLOSIVE', w / 2, 40, 48, { color: '#111' }); text(g, '1.1D  KEEP AWAY FROM FIRE', w / 2, 86, 22, { color: '#111' });
});
D('label_ship', 192, 128, (g, w, h) => {
  g.fillStyle = '#f2f1ec'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#222'; text(g, 'PRIORITY', 60, 18, 18, { color: '#222' }); g.fillRect(8, 30, w - 16, 3);
  for (let k = 0; k < 4; k++) g.fillRect(10, 42 + k * 11, 80 + (k * 31) % 60, 5);
  const r = rng(7); let x = 12; while (x < w - 12) { const bw = 1 + Math.floor(r() * 4); g.fillRect(x, 92, bw, 28); x += bw + 1 + Math.floor(r() * 3); }
});
D('rail_mark', 512, 144, (g, w, h) => {
  const c = 'rgba(240,238,228,.95)';
  text(g, 'LFRX 204178', 20, 40, 52, { color: c, align: 'left' });
  text(g, 'CAPY 154000   LD LMT 202300', 20, 92, 24, { color: c, align: 'left', font: MONO });
  text(g, 'LT WT 61700   NEW 6-19', 20, 124, 24, { color: c, align: 'left', font: MONO });
});
D('truck_logo', 512, 192, (g, w, h) => {
  g.fillStyle = '#1d4d7a'; g.beginPath(); g.arc(90, 96, 70, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#f4f2ea'; poly(g, [[50, 120], [90, 60], [130, 120]]); g.fill(); g.fillStyle = '#1d4d7a'; g.fillRect(80, 98, 20, 22);
  text(g, 'HALCYON', 330, 78, 64, { color: '#1d4d7a', maxW: 300 }); text(g, 'MOVING & STORAGE', 330, 134, 30, { color: '#c0392b', maxW: 300 });
});

// --------------------------------------------------------------------------------------------------- vehicles
['LF 4721', 'KT 902 R', 'MRD 118', 'HB 3307'].forEach((t, i) => D('plate_' + i, 256, 64, (g, w, h) => {
  g.fillStyle = '#ecebe4'; rrect(g, 1, 1, w - 2, h - 2, 6); g.fill(); g.strokeStyle = '#222'; g.lineWidth = 3; rrect(g, 4, 4, w - 8, h - 8, 5); g.stroke();
  text(g, t, w / 2, h / 2 + 2, 40, { color: '#1a1a1c', font: MONO, maxW: w - 30 });
}));
D('taxi_sign', 256, 72, (g, w, h) => { g.fillStyle = '#f2c230'; g.fillRect(0, 0, w, h); text(g, 'TAXI', w / 2, h / 2 + 2, 52, { color: '#111' }); });
D('patrol', 512, 96, (g, w, h) => {
  g.fillStyle = '#e9e9e4'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#1b2a4a'; text(g, 'PATROL', 150, 50, 64, { color: '#1b2a4a' });
  g.fillStyle = '#b8892b'; g.fillRect(300, 18, 196, 10); g.fillRect(300, 68, 196, 10);
  text(g, 'UNIT 17', 398, 49, 30, { color: '#1b2a4a' });
});
D('bus_dest', 512, 72, (g, w, h) => {
  g.fillStyle = '#0b0b0a'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#ff9d1c';
  const t = '14  CENTRAL STATION';
  g.font = 'bold 44px ' + MONO; g.textBaseline = 'middle'; g.textAlign = 'left'; g.fillText(t, 16, 38);
  g.fillStyle = 'rgba(0,0,0,.45)'; for (let x = 0; x < w; x += 4) g.fillRect(x, 0, 1, h); for (let y = 0; y < h; y += 4) g.fillRect(0, y, w, 1);
});
D('bus_ad', 512, 160, (g, w, h) => {
  const gr = g.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, '#16324f'); gr.addColorStop(1, '#2f7f9e'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
  text(g, 'BLUE PEAK WATER', 30, 60, 48, { align: 'left', maxW: 320 }); text(g, 'from the mountains to your door', 32, 112, 24, { align: 'left', weight: 'normal' });
  g.fillStyle = '#d8eef7'; rrect(g, 400, 22, 64, 120, 14); g.fill(); g.fillStyle = '#16324f'; g.fillRect(418, 10, 28, 16);
});
D('airline', 1024, 144, (g, w, h) => {
  g.fillStyle = '#c0392b'; g.beginPath(); g.arc(70, 72, 50, 0, Math.PI * 2); g.fill(); g.fillStyle = '#f4f4f0'; poly(g, [[70, 34], [92, 72], [70, 110], [48, 72]]); g.fill();
  text(g, 'LANTERN AIR', 150, 76, 96, { color: '#16243c', align: 'left' });
});
D('air_reg', 256, 64, (g, w, h) => text(g, 'LF-ANT', w / 2, h / 2, 48, { color: '#16243c' }));

// --------------------------------------------------------------------------------------------------- signs
D('sign_stop', 256, 256, (g, w, h) => {
  const o = [], R = 124; for (let k = 0; k < 8; k++) { const a = Math.PI / 8 + k * Math.PI / 4; o.push([128 + Math.cos(a) * R, 128 + Math.sin(a) * R]); }
  g.fillStyle = '#f2f2ee'; poly(g, o); g.fill(); g.fillStyle = '#b3171a'; g.save(); g.translate(128, 128); g.scale(.92, .92); g.translate(-128, -128); poly(g, o); g.fill(); g.restore();
  text(g, 'STOP', 128, 132, 78, { color: '#f4f4f0' });
});
D('sign_yield', 256, 256, (g, w, h) => {
  g.fillStyle = '#b3171a'; poly(g, [[8, 20], [248, 20], [128, 236]]); g.fill(); g.fillStyle = '#f2f2ee'; poly(g, [[48, 44], [208, 44], [128, 184]]); g.fill();
});
D('sign_noentry', 256, 256, (g, w, h) => {
  g.fillStyle = '#f2f2ee'; g.beginPath(); g.arc(128, 128, 124, 0, Math.PI * 2); g.fill(); g.fillStyle = '#b3171a'; g.beginPath(); g.arc(128, 128, 114, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#f4f4f0'; g.fillRect(40, 106, 176, 44);
});
['30', '50'].forEach(n => D('sign_speed' + n, 256, 256, (g, w, h) => {
  g.fillStyle = '#f2f2ee'; g.beginPath(); g.arc(128, 128, 124, 0, Math.PI * 2); g.fill(); g.strokeStyle = '#b3171a'; g.lineWidth = 26; g.beginPath(); g.arc(128, 128, 104, 0, Math.PI * 2); g.stroke();
  text(g, n, 128, 134, 100, { color: '#111' });
}));
D('sign_parking', 256, 256, (g, w, h) => { g.fillStyle = '#f2f2ee'; rrect(g, 4, 4, 248, 248, 20); g.fill(); g.fillStyle = '#1d4f9a'; rrect(g, 14, 14, 228, 228, 14); g.fill(); text(g, 'P', 128, 136, 190, { color: '#f4f4f0' }); });
D('sign_warn', 256, 256, (g, w, h) => {
  g.fillStyle = '#b3171a'; poly(g, [[128, 6], [250, 226], [6, 226]]); g.fill(); g.fillStyle = '#f2f2ee'; poly(g, [[128, 48], [212, 202], [44, 202]]); g.fill();
  g.fillStyle = '#111'; g.fillRect(118, 90, 20, 66); g.fillRect(118, 168, 20, 20);
});
D('sign_ped', 256, 256, (g, w, h) => {
  g.fillStyle = '#f2f2ee'; rrect(g, 4, 4, 248, 248, 20); g.fill(); g.fillStyle = '#1d4f9a'; rrect(g, 14, 14, 228, 228, 14); g.fill();
  g.fillStyle = '#f2f2ee'; poly(g, [[128, 34], [226, 214], [30, 214]]); g.fill();
  g.fillStyle = '#111'; g.beginPath(); g.arc(132, 96, 12, 0, Math.PI * 2); g.fill(); poly(g, [[124, 112], [142, 112], [150, 150], [168, 192], [154, 196], [134, 158], [114, 196], [100, 192], [120, 148]]); g.fill();
  for (let k = 0; k < 4; k++) g.fillRect(70 + k * 32, 200, 18, 8);
});
D('sign_oneway', 512, 128, (g, w, h) => {
  g.fillStyle = '#111'; g.fillRect(0, 0, w, h); g.fillStyle = '#f2f2ee'; poly(g, [[30, 44], [360, 44], [360, 18], [480, 64], [360, 110], [360, 84], [30, 84]]); g.fill();
  text(g, 'ONE WAY', 190, 65, 34, { color: '#111' });
});
['MAPLE CT', 'HARBOR AVE', '9TH ST', 'ELM ST', 'QUARRY RD', 'DEPOT ST'].forEach((t, i) => D('sign_street_' + i, 512, 96, (g, w, h) => {
  g.fillStyle = '#1f6b3a'; rrect(g, 2, 2, w - 4, h - 4, 10); g.fill(); g.strokeStyle = '#f2f2ee'; g.lineWidth = 4; rrect(g, 8, 8, w - 16, h - 16, 8); g.stroke();
  text(g, t, w / 2, h / 2 + 3, 56, { color: '#f4f4f0', maxW: w - 50 });
}));
D('sign_exit', 256, 112, (g, w, h) => {
  g.fillStyle = '#138a3e'; g.fillRect(0, 0, w, h); g.fillStyle = '#f4f4f0';
  g.beginPath(); g.arc(46, 30, 9, 0, Math.PI * 2); g.fill(); poly(g, [[38, 42], [54, 42], [64, 62], [78, 56], [80, 64], [60, 74], [54, 66], [52, 84], [64, 102], [54, 106], [42, 88], [30, 104], [22, 98], [36, 78], [36, 60], [24, 70], [18, 64]]); g.fill();
  text(g, 'EXIT', 162, 58, 64, { color: '#f4f4f0' });
});
D('sign_nosmoke', 192, 192, (g, w, h) => {
  g.fillStyle = '#f2f2ee'; g.fillRect(0, 0, w, h); g.fillStyle = '#222'; g.fillRect(40, 92, 100, 18); g.fillStyle = '#c96'; g.fillRect(140, 92, 14, 18);
  g.strokeStyle = '#b3171a'; g.lineWidth = 16; g.beginPath(); g.arc(96, 100, 76, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.moveTo(42, 46); g.lineTo(150, 154); g.stroke();
});
D('sign_fire', 192, 192, (g, w, h) => {
  g.fillStyle = '#b3171a'; g.fillRect(0, 0, w, h); g.fillStyle = '#f4f4f0';
  rrect(g, 72, 60, 40, 100, 14); g.fill(); g.fillRect(80, 44, 22, 18); poly(g, [[100, 48], [134, 40], [138, 50], [104, 58]]); g.fill();
  text(g, 'FIRE', 150, 160, 22, { color: '#f4f4f0' });
});
D('sign_firstaid', 160, 160, (g, w, h) => { g.fillStyle = '#138a3e'; g.fillRect(0, 0, w, h); g.fillStyle = '#f4f4f0'; g.fillRect(62, 26, 36, 108); g.fillRect(26, 62, 108, 36); });
D('sign_danger', 384, 192, (g, w, h) => {
  g.fillStyle = '#f2f2ee'; g.fillRect(0, 0, w, h); g.fillStyle = '#c41a1a'; rrect(g, 10, 10, w - 20, 66, 10); g.fill();
  text(g, 'DANGER', w / 2, 44, 50, { color: '#f4f4f0' }); text(g, 'HIGH VOLTAGE', w / 2, 116, 40, { color: '#111' }); text(g, 'KEEP OUT', w / 2, 160, 34, { color: '#111' });
});
D('sign_keepout', 384, 192, (g, w, h) => {
  g.fillStyle = '#f2f2ee'; g.fillRect(0, 0, w, h); g.fillStyle = '#1d4f9a'; g.fillRect(0, 0, w, 64);
  text(g, 'NOTICE', w / 2, 34, 44, { color: '#f4f4f0' }); text(g, 'AUTHORIZED', w / 2, 104, 40, { color: '#111' }); text(g, 'PERSONNEL ONLY', w / 2, 152, 36, { color: '#111' });
});
D('sign_hardhat', 384, 192, (g, w, h) => {
  g.fillStyle = '#1d4f9a'; g.fillRect(0, 0, w, h); g.fillStyle = '#f4f4f0'; g.beginPath(); g.arc(80, 110, 50, Math.PI, 0); g.fill(); g.fillRect(20, 108, 120, 12);
  text(g, 'HARD HATS', 260, 70, 40, { color: '#f4f4f0' }); text(g, 'MUST BE WORN', 260, 124, 32, { color: '#f4f4f0' });
});

// --------------------------------------------------------------------------------------------------- posters / wall art
const POSTERS = [
  (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#1b1030'); gr.addColorStop(1, '#a8323b'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = '#f2c14e'; g.beginPath(); g.arc(w / 2, h * .42, 70, 0, Math.PI * 2); g.fill(); g.fillStyle = '#1b1030'; for (let k = 0; k < 6; k++) g.fillRect(0, h * .42 + k * 14, w, 5);
    text(g, 'THE STATIC HOURS', w / 2, h * .78, 30, { maxW: w - 20 }); text(g, 'LIVE  ·  FRI 21:00', w / 2, h * .86, 18, { weight: 'normal' }); },
  (g, w, h) => { g.fillStyle = '#f0c419'; g.fillRect(0, 0, w, h); g.fillStyle = '#111'; g.fillRect(0, 0, w, 60);
    text(g, 'SAFETY FIRST', w / 2, 32, 30, { color: '#f0c419', maxW: w - 16 }); g.beginPath(); g.arc(w / 2, h * .5, 64, Math.PI, 0); g.fill(); g.fillRect(w / 2 - 84, h * .5 - 4, 168, 14);
    text(g, 'WEAR YOUR', w / 2, h * .72, 30, { color: '#111', maxW: w - 16 }); text(g, 'HELMET', w / 2, h * .82, 40, { color: '#111', maxW: w - 16 }); },
  (g, w, h) => { g.fillStyle = '#0d1b2a'; g.fillRect(0, 0, w, h); g.fillStyle = '#e0e1dd'; for (let k = 0; k < 40; k++) { g.globalAlpha = .3 + (k % 5) * .1; g.fillRect((k * 53) % w, (k * 97) % (h * .6), 2, 2); } g.globalAlpha = 1;
    g.fillStyle = '#415a77'; poly(g, [[0, h * .7], [w * .3, h * .45], [w * .55, h * .62], [w * .8, h * .4], [w, h * .6], [w, h], [0, h]]); g.fill();
    text(g, 'NIGHT SHIFT', w / 2, h * .2, 40, { color: '#e0e1dd', maxW: w - 16 }); text(g, 'IN CINEMAS SOON', w / 2, h * .9, 18, { color: '#e0e1dd', weight: 'normal' }); },
  (g, w, h) => { g.fillStyle = '#e9e1cf'; g.fillRect(0, 0, w, h); g.fillStyle = '#3f6e8c'; g.fillRect(0, h * .55, w, h * .45); g.fillStyle = '#c9a227'; g.beginPath(); g.arc(w * .7, h * .3, 40, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#6b4f3a'; poly(g, [[0, h * .55], [w * .25, h * .32], [w * .5, h * .55]]); g.fill(); text(g, 'VISIT', w / 2, h * .7, 30, { color: '#e9e1cf' }); text(g, 'KESTREL HILL', w / 2, h * .8, 32, { color: '#e9e1cf', maxW: w - 20 }); },
  (g, w, h) => { g.fillStyle = '#f4f4f0'; g.fillRect(0, 0, w, h); g.fillStyle = '#c0392b'; g.fillRect(0, 0, w, 70); text(g, 'SEE SOMETHING?', w / 2, 36, 26, { maxW: w - 20 });
    g.fillStyle = '#222'; g.beginPath(); g.arc(w / 2, h * .45, 60, 0, Math.PI * 2); g.fill(); g.fillStyle = '#f4f4f0'; g.beginPath(); g.arc(w / 2, h * .45, 22, 0, Math.PI * 2); g.fill();
    text(g, 'REPORT IT', w / 2, h * .75, 34, { color: '#222', maxW: w - 16 }); text(g, 'CALL 555 0199', w / 2, h * .86, 20, { color: '#222', weight: 'normal' }); },
  (g, w, h) => { g.fillStyle = '#2d6a4f'; g.fillRect(0, 0, w, h); g.fillStyle = '#95d5b2'; for (let k = 0; k < 5; k++) { g.beginPath(); g.arc(w / 2, h * .42, 20 + k * 18, 0, Math.PI * 2); g.lineWidth = 6; g.strokeStyle = '#95d5b2'; g.stroke(); }
    text(g, 'GREEN CITY', w / 2, h * .76, 34, { color: '#d8f3dc', maxW: w - 16 }); text(g, 'RECYCLE  ·  REUSE', w / 2, h * .86, 18, { color: '#d8f3dc', weight: 'normal' }); },
];
POSTERS.forEach((fn, i) => D('poster_' + i, 192, 288, (g, w, h) => { fn(g, w, h); grime(g, w, h, 30 + i, .12); }));
['LOST CAT', 'ROOM FOR RENT'].forEach((t, i) => D('flyer_' + i, 128, 176, (g, w, h) => {
  g.fillStyle = '#f5f3ea'; g.fillRect(0, 0, w, h); text(g, t, w / 2, 22, 18, { color: '#111', maxW: w - 10 });
  g.fillStyle = '#bbb'; g.fillRect(16, 40, w - 32, 60); g.fillStyle = '#333'; for (let k = 0; k < 4; k++) g.fillRect(14, 112 + k * 10, w - 28 - (k % 2) * 20, 4);
  for (let k = 0; k < 7; k++) { g.save(); g.translate(8 + k * 17, 156); g.rotate(-Math.PI / 2); text(g, '555-0142', 0, 0, 9, { color: '#333', weight: 'normal' }); g.restore(); }
}));
D('clock', 256, 256, (g, w, h) => {
  g.fillStyle = '#f4f3ee'; g.beginPath(); g.arc(128, 128, 126, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#1a1a1a'; for (let k = 0; k < 60; k++) { const a = k * Math.PI / 30, l = k % 5 ? 8 : 22, wd = k % 5 ? 3 : 7; g.save(); g.translate(128, 128); g.rotate(a); g.fillRect(-wd / 2, -118, wd, l); g.restore(); }
  for (let k = 1; k <= 12; k++) { const a = k * Math.PI / 6; text(g, String(k), 128 + Math.sin(a) * 82, 128 - Math.cos(a) * 82, 26, { color: '#1a1a1a' }); }
  g.save(); g.translate(128, 128); g.rotate(-.9); g.fillRect(-4, -64, 8, 70); g.rotate(2.6); g.fillRect(-3, -96, 6, 104); g.fillStyle = '#b3171a'; g.rotate(1.1); g.fillRect(-1, -104, 2, 120); g.restore();
  g.beginPath(); g.arc(128, 128, 7, 0, Math.PI * 2); g.fill();
});
['#24324f', '#5a1e1c', '#2e4232'].forEach((c, i) => D('rug_' + i, 256, 384, (g, w, h) => {
  g.fillStyle = c; g.fillRect(0, 0, w, h);
  const b = ['#c9a96e', '#d6c4a0', '#b88b4a'][i];
  g.strokeStyle = b; g.lineWidth = 10; g.strokeRect(14, 14, w - 28, h - 28); g.lineWidth = 3; g.strokeRect(30, 30, w - 60, h - 60);
  g.fillStyle = b; for (let y = 50; y < h - 50; y += 36) for (let x = 50; x < w - 50; x += 36) { g.save(); g.translate(x + 8, y + 8); g.rotate(Math.PI / 4); g.fillRect(-6, -6, 12, 12); g.restore(); }
  g.fillStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.ellipse(w / 2, h / 2, 60, 100, 0, 0, Math.PI * 2); g.fill();
  g.strokeStyle = b; g.lineWidth = 2; for (let x = 4; x < w; x += 6) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 8); g.moveTo(x, h); g.lineTo(x, h - 8); g.stroke(); }
}));
for (let i = 0; i < 4; i++) D('books_' + i, 256, 128, (g, w, h) => {
  const r = rng(91 + i * 13); let x = 0;
  const cols = ['#5a1e1c', '#1c2a44', '#2e4232', '#6b5a3a', '#3a2a4a', '#8a6d22', '#1d1b1a', '#7a7468', '#244e5a', '#a33b2a'];
  while (x < w) {
    const bw = 10 + Math.floor(r() * 18), bh = h * (.72 + r() * .28), c = cols[Math.floor(r() * cols.length)];
    g.fillStyle = c; g.fillRect(x, h - bh, bw - 1, bh);
    g.fillStyle = 'rgba(255,255,255,.08)'; g.fillRect(x + 1, h - bh, 2, bh);
    g.fillStyle = 'rgba(214,180,90,.8)'; if (r() > .4) { g.fillRect(x + 2, h - bh + 8, bw - 5, 2); g.fillRect(x + 2, h - 14, bw - 5, 2); }
    if (r() > .6) g.fillRect(x + bw / 2 - 1, h - bh + 18, 2, bh * .4);
    x += bw;
  }
  g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(0, 0, w, h * .05);
});
D('keyboard', 256, 96, (g, w, h) => {
  g.fillStyle = '#1b1c1e'; g.fillRect(0, 0, w, h);
  for (let r = 0; r < 5; r++) for (let c = 0; c < 15; c++) { const kw = (r === 4 && c > 3 && c < 9) ? 0 : 14; if (!kw) continue; g.fillStyle = '#2c2d30'; g.fillRect(6 + c * 16.5, 6 + r * 17, 14, 14); g.fillStyle = '#55575c'; g.fillRect(8 + c * 16.5, 8 + r * 17, 4, 2); }
  g.fillStyle = '#2c2d30'; g.fillRect(6 + 4 * 16.5, 6 + 4 * 17, 5 * 16.5 - 2, 14);
});
for (let i = 1; i <= 12; i++) D('lnum_' + i, 64, 40, (g, w, h) => { g.fillStyle = '#d8d6cc'; g.fillRect(0, 0, w, h); text(g, String(i), w / 2, h / 2 + 1, 26, { color: '#1a1a1a' }); });
D('menu_board', 384, 256, (g, w, h) => {
  g.fillStyle = '#1f2421'; g.fillRect(0, 0, w, h); g.strokeStyle = '#6b4f3a'; g.lineWidth = 12; g.strokeRect(6, 6, w - 12, h - 12);
  const c = 'rgba(236,236,226,.9)';
  text(g, 'TODAY', w / 2, 38, 34, { color: c }); const items = [['COFFEE', '2.50'], ['TEA', '2.00'], ['SOUP', '4.50'], ['SANDWICH', '6.00'], ['PIE', '3.75']];
  items.forEach(([a, b], k) => { text(g, a, 40, 82 + k * 32, 22, { color: c, align: 'left', weight: 'normal' }); text(g, b, w - 40, 82 + k * 32, 22, { color: c, align: 'right', weight: 'normal' }); });
});
D('gas_label', 160, 64, (g, w, h) => { g.fillStyle = '#f2f1ea'; g.fillRect(0, 0, w, h); text(g, 'COMPRESSED GAS', w / 2, 22, 16, { color: '#111' }); g.fillStyle = '#1f7a3a'; g.fillRect(8, 38, w - 16, 16); });
D('news_box', 256, 112, (g, w, h) => {
  g.fillStyle = '#f2f1ea'; g.fillRect(0, 0, w, h); text(g, 'The Daily Ledger', w / 2, 24, 26, { color: '#111', font: 'Georgia, "Times New Roman", serif' });
  g.fillStyle = '#111'; g.fillRect(8, 42, w - 16, 3); text(g, 'CITY ORDERS EVACUATION', w / 2, 66, 18, { color: '#111', maxW: w - 16 });
  g.fillStyle = '#777'; for (let k = 0; k < 3; k++) g.fillRect(10 + k * 82, 84, 74, 22);
});
D('atm_panel', 256, 96, (g, w, h) => { g.fillStyle = '#123a5c'; g.fillRect(0, 0, w, h); text(g, 'CASH POINT', w / 2, 40, 34, { color: '#f4f4f0' }); text(g, '24 HOURS', w / 2, 76, 18, { color: '#9fc6e6' }); });
D('graffiti_0', 512, 224, (g, w, h) => {
  g.lineJoin = 'round'; g.font = 'bold 150px ' + SANS; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.save(); g.translate(w / 2, h / 2); g.rotate(-.06); g.lineWidth = 22; g.strokeStyle = '#111'; g.strokeText('RIOT', 0, 0); g.fillStyle = '#d64f1e'; g.fillText('RIOT', 0, 0);
  g.lineWidth = 4; g.strokeStyle = '#f4f0dc'; g.strokeText('RIOT', -4, -4); g.restore();
});
D('graffiti_1', 512, 224, (g, w, h) => {
  g.save(); g.translate(w / 2, h / 2); g.rotate(.05); g.font = 'italic bold 120px ' + SANS; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 16; g.strokeStyle = '#1c2a6b'; g.strokeText('KOVA', 0, 0); g.fillStyle = '#5fd4c8'; g.fillText('KOVA', 0, 0); g.restore();
  g.strokeStyle = '#e8e2d0'; g.lineWidth = 5; g.beginPath(); g.moveTo(40, 190); g.bezierCurveTo(160, 160, 320, 210, 480, 170); g.stroke();
});
D('graffiti_2', 384, 192, (g, w, h) => {
  g.strokeStyle = '#e8e2d0'; g.lineWidth = 7; g.lineCap = 'round'; const r = rng(77);
  for (let k = 0; k < 5; k++) { g.beginPath(); let x = 30 + k * 66, y = 60 + r() * 40; g.moveTo(x, y); for (let j = 0; j < 4; j++) { x += r() * 30 - 5; y += r() * 60 - 30; g.lineTo(x, y); } g.stroke(); }
  g.fillStyle = '#c81d25'; g.font = 'bold 40px ' + SANS; g.fillText('22', 300, 160);
});

// --------------------------------------------------------------------------------------------------- glowing (emissive) panels
const screen = (fn) => (g, w, h) => { g.fillStyle = '#05070a'; g.fillRect(0, 0, w, h); fn(g, w, h); g.fillStyle = 'rgba(255,255,255,.03)'; for (let y = 0; y < h; y += 3) g.fillRect(0, y, w, 1); };
D('scr_desktop', 256, 160, screen((g, w, h) => {
  const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#1d3a5c'); gr.addColorStop(1, '#3a6b8c'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
  g.fillStyle = '#e8eef4'; g.fillRect(30, 24, 150, 100); g.fillStyle = '#2b5c8a'; g.fillRect(30, 24, 150, 12);
  g.fillStyle = '#9aa7b4'; for (let k = 0; k < 6; k++) g.fillRect(38, 46 + k * 11, 60 + (k * 37) % 70, 5);
  g.fillStyle = '#111d2b'; g.fillRect(0, h - 14, w, 14); for (let k = 0; k < 4; k++) { g.fillStyle = '#c8d4e0'; g.fillRect(8 + k * 18, 8, 12, 10); }
}));
D('scr_code', 256, 160, screen((g, w, h) => {
  const r = rng(5), cols = ['#7fd1b9', '#e6c07b', '#61afef', '#c678dd', '#abb2bf'];
  for (let y = 10; y < h - 6; y += 9) { let x = 8 + Math.floor(r() * 4) * 12; while (x < w - 20 && r() > .15) { const l = 10 + r() * 40; g.fillStyle = cols[Math.floor(r() * cols.length)]; g.fillRect(x, y, l, 4); x += l + 6; } }
}));
D('scr_cctv', 256, 160, screen((g, w, h) => {
  const r = rng(9);
  for (let i = 0; i < 4; i++) { const x = (i % 2) * 128, y = Math.floor(i / 2) * 80; const gr = g.createLinearGradient(x, y, x, y + 80); gr.addColorStop(0, '#3a4a44'); gr.addColorStop(1, '#1a221e'); g.fillStyle = gr; g.fillRect(x + 2, y + 2, 124, 76);
    g.fillStyle = 'rgba(200,220,210,.35)'; for (let k = 0; k < 6; k++) g.fillRect(x + 10 + r() * 100, y + 20 + r() * 40, 8 + r() * 20, 8 + r() * 30);
    text(g, 'CAM 0' + (i + 1), x + 34, y + 10, 10, { color: '#e8f0ea' }); }
  g.fillStyle = '#e33'; g.beginPath(); g.arc(246, 10, 4, 0, Math.PI * 2); g.fill();
}));
D('scr_graph', 256, 160, screen((g, w, h) => {
  g.strokeStyle = '#1e3d2f'; g.lineWidth = 1; for (let x = 0; x < w; x += 16) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); } for (let y = 0; y < h; y += 16) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
  const r = rng(3); for (const c of ['#3ddc84', '#f2c14e']) { g.strokeStyle = c; g.lineWidth = 2; g.beginPath(); let y = 80; g.moveTo(0, y); for (let x = 0; x < w; x += 8) { y = Math.max(10, Math.min(150, y + (r() - .5) * 30)); g.lineTo(x, y); } g.stroke(); }
  g.fillStyle = '#3ddc84'; text(g, 'PRESS 4.21 BAR', 60, 12, 11, { color: '#3ddc84' });
}));
D('scr_map', 256, 160, screen((g, w, h) => {
  g.fillStyle = '#0d1f2d'; g.fillRect(0, 0, w, h); g.strokeStyle = '#2b6f8f'; g.lineWidth = 3;
  const r = rng(12); for (let k = 0; k < 9; k++) { g.beginPath(); g.moveTo(r() * w, r() * h); g.lineTo(r() * w, r() * h); g.stroke(); }
  g.fillStyle = '#e8c547'; for (let k = 0; k < 5; k++) { g.beginPath(); g.arc(r() * w, r() * h, 4, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = '#e33'; g.beginPath(); g.arc(150, 70, 6, 0, Math.PI * 2); g.fill();
}));
D('scr_atm', 256, 192, screen((g, w, h) => {
  g.fillStyle = '#0f3b66'; g.fillRect(0, 0, w, h); text(g, 'WELCOME', w / 2, 50, 34, { color: '#f4f4f0' }); text(g, 'PLEASE INSERT', w / 2, 100, 20, { color: '#cfe3f5', weight: 'normal' }); text(g, 'YOUR CARD', w / 2, 128, 20, { color: '#cfe3f5', weight: 'normal' });
  g.fillStyle = '#e8c547'; g.fillRect(w / 2 - 30, 150, 60, 8);
}));
D('scr_hosp', 256, 160, screen((g, w, h) => {
  g.strokeStyle = '#3ddc84'; g.lineWidth = 2; g.beginPath(); let x = 0; g.moveTo(0, 50);
  while (x < w) { g.lineTo(x + 20, 50); g.lineTo(x + 26, 20); g.lineTo(x + 32, 76); g.lineTo(x + 38, 50); x += 64; } g.stroke();
  text(g, 'HR 72', 50, 110, 30, { color: '#3ddc84' }); text(g, 'SpO2 98', 180, 110, 26, { color: '#5fd4f0' }); text(g, 'BP 121/80', 128, 145, 20, { color: '#f2c14e' });
}));
D('vend_drinks', 256, 512, (g, w, h) => {
  g.fillStyle = '#0c1018'; g.fillRect(0, 0, w, h);
  const gr = g.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, '#c0392b'); gr.addColorStop(1, '#e74c3c'); g.fillStyle = gr; g.fillRect(0, 0, w, 90);
  text(g, 'KOLD', w / 2, 46, 64, { color: '#fff' });
  const cols = ['#c0392b', '#2471a3', '#f1c40f', '#27ae60', '#ecf0f1', '#8e44ad'];
  for (let r = 0; r < 5; r++) { g.fillStyle = '#1c2230'; g.fillRect(8, 104 + r * 76, w - 16, 70); for (let c = 0; c < 6; c++) { g.fillStyle = cols[(r + c) % cols.length]; rrect(g, 16 + c * 38, 112 + r * 76, 26, 50, 6); g.fill(); g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(20 + c * 38, 116 + r * 76, 5, 40); } g.fillStyle = '#7f8c8d'; g.fillRect(8, 166 + r * 76, w - 16, 6); }
});
D('vend_snacks', 256, 512, (g, w, h) => {
  g.fillStyle = '#10141c'; g.fillRect(0, 0, w, h); g.fillStyle = '#1f6f8b'; g.fillRect(0, 0, w, 80); text(g, 'MUNCH', w / 2, 42, 56, { color: '#f9d342' });
  const cols = ['#e67e22', '#9b59b6', '#f1c40f', '#e74c3c', '#2ecc71', '#3498db'];
  for (let r = 0; r < 6; r++) { for (let c = 0; c < 4; c++) { g.fillStyle = cols[(r * 3 + c) % cols.length]; g.fillRect(16 + c * 58, 94 + r * 68, 44, 46); g.fillStyle = 'rgba(255,255,255,.4)'; g.fillRect(20 + c * 58, 98 + r * 68, 36, 8); } g.strokeStyle = '#95a5a6'; g.lineWidth = 2; for (let c = 0; c < 4; c++) { g.beginPath(); g.arc(38 + c * 58, 148 + r * 68, 8, 0, Math.PI * 2); g.stroke(); } }
});
D('server_leds', 256, 64, (g, w, h) => {
  g.fillStyle = '#07090b'; g.fillRect(0, 0, w, h); const r = rng(21);
  for (let y = 4; y < h; y += 8) for (let x = 6; x < w; x += 10) { const v = r(); if (v < .55) continue; g.fillStyle = v > .93 ? '#ffb02e' : v > .8 ? '#2ea8ff' : '#38e070'; g.fillRect(x, y, 3, 3); }
});
D('console_panel', 512, 160, (g, w, h) => {
  g.fillStyle = '#14181b'; g.fillRect(0, 0, w, h); const r = rng(33);
  for (let k = 0; k < 3; k++) { const x = 12 + k * 128; g.fillStyle = '#05170e'; g.fillRect(x, 10, 116, 70); g.strokeStyle = '#3ddc84'; g.beginPath(); let y = 45; g.moveTo(x, y); for (let i = 0; i < 116; i += 6) { y = Math.max(14, Math.min(76, y + (r() - .5) * 22)); g.lineTo(x + i, y); } g.stroke(); }
  for (let k = 0; k < 24; k++) { const c = ['#e33', '#3ddc84', '#f2c14e', '#2ea8ff'][k % 4]; g.fillStyle = c; g.globalAlpha = .4 + r() * .6; g.fillRect(14 + (k % 12) * 30, 96 + Math.floor(k / 12) * 26, 18, 14); } g.globalAlpha = 1;
  g.fillStyle = '#f2c14e'; text(g, 'LINE 2  OK', 450, 40, 18, { color: '#3ddc84' }); text(g, 'TEMP 64', 450, 70, 18, { color: '#f2c14e' });
});
D('ad_panel', 256, 448, (g, w, h) => {
  const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#f4e6c8'); gr.addColorStop(1, '#d9a85c'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
  g.fillStyle = '#6b3a1e'; g.beginPath(); g.ellipse(w / 2, h * .42, 80, 90, 0, 0, Math.PI * 2); g.fill(); g.fillStyle = '#f4e6c8'; g.beginPath(); g.ellipse(w / 2, h * .38, 50, 40, 0, 0, Math.PI * 2); g.fill();
  text(g, 'RISE & GRIND', w / 2, h * .74, 32, { color: '#3b1f0f', maxW: w - 20 }); text(g, 'CORNER BAKERY', w / 2, h * .84, 22, { color: '#3b1f0f' });
});
D('exit_glow', 256, 112, (g, w, h) => { g.fillStyle = '#0f8f42'; g.fillRect(0, 0, w, h); text(g, 'EXIT', w / 2, h / 2 + 3, 72, { color: '#eafff0' }); });
D('neon_open', 256, 112, (g, w, h) => { g.fillStyle = '#000'; g.fillRect(0, 0, w, h); g.shadowColor = '#ff3b6b'; g.shadowBlur = 14; text(g, 'OPEN', w / 2, h / 2 + 3, 72, { color: '#ff5c86' }); g.shadowBlur = 0; });
D('air_windows', 512, 72, (g, w, h) => {
  for (let i = 0; i < 4; i++) { const x = i * 128 + 64; g.fillStyle = '#c9ccd0'; rrect(g, x - 22, 6, 44, 60, 18); g.fill(); g.fillStyle = '#16191d'; rrect(g, x - 17, 11, 34, 50, 14); g.fill(); g.fillStyle = 'rgba(120,140,160,.5)'; rrect(g, x - 13, 14, 12, 22, 6); g.fill(); }
});
D('car_grille', 256, 64, (g, w, h) => {
  g.fillStyle = '#0d0e10'; rrect(g, 0, 0, w, h, 14); g.fill(); g.strokeStyle = '#2a2c30'; g.lineWidth = 3;
  for (let x = 10; x < w; x += 14) { g.beginPath(); g.moveTo(x, 6); g.lineTo(x - 6, h - 6); g.stroke(); }
  for (let y = 10; y < h; y += 12) { g.beginPath(); g.moveTo(6, y); g.lineTo(w - 6, y); g.stroke(); }
});
// camouflage net garnish (alpha cut): a knotted cord mesh with jagged leaf-like cut-outs in two palettes. Tiles with itself
// (shapes that cross an edge are drawn again on the opposite side), so camo_net can lay it cell by cell over the sagging net.
[['camo_wood', ['#3b4a2a', '#56603a', '#2a3020', '#5e4a32', '#1e2318', '#47512f']], ['camo_desert', ['#b8a47a', '#9c8559', '#c9b88f', '#7d6a48', '#d6c7a0', '#a8916a']]]
  .forEach(([name, pal], idx) => D(name, 256, 256, (g, w, h) => {
    const r = rng(91 + idx * 7);
    g.strokeStyle = idx ? 'rgba(92,78,54,1)' : 'rgba(34,38,26,1)'; g.lineWidth = 2.2;     // cord diamonds (32 px)
    for (let k = -8; k <= 16; k++) { g.beginPath(); g.moveTo(k * 32, 0); g.lineTo(k * 32 + h, h); g.stroke(); g.beginPath(); g.moveTo(k * 32, 0); g.lineTo(k * 32 - h, h); g.stroke(); }
    const leaf = (cx, cy, rad, rot, n, col) => {
      g.fillStyle = col; g.beginPath();
      for (let i = 0; i < n * 2; i++) { const a = rot + i * Math.PI / n, rr = rad * (i % 2 ? .45 + r() * .2 : .8 + r() * .35); const x = cx + Math.cos(a) * rr * 1.25, y = cy + Math.sin(a) * rr * .8; i ? g.lineTo(x, y) : g.moveTo(x, y); }
      g.closePath(); g.fill();
    };
    for (let i = 0; i < 95; i++) {
      const cx = r() * w, cy = r() * h, rad = 9 + r() * 18, rot = r() * Math.PI, n = 4 + Math.floor(r() * 4), col = pal[Math.floor(r() * pal.length)];
      for (const dx of [-w, 0, w]) for (const dy of [-h, 0, h]) if (cx + dx > -40 && cx + dx < w + 40 && cy + dy > -40 && cy + dy < h + 40) leaf(cx + dx, cy + dy, rad, rot, n, col);
    }
  }));
// cast iron manhole cover seen from above: raised rim, a non-slip pattern of raised studs and bars, a generic DRAIN legend
D('manhole', 256, 256, (g, w, h) => {
  const cx = w / 2, cy = h / 2, R = w / 2 - 2, r = rng(55);
  g.fillStyle = '#2b2b2a'; g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#4a4946'; g.lineWidth = 9; g.beginPath(); g.arc(cx, cy, R - 6, 0, Math.PI * 2); g.stroke();
  g.strokeStyle = '#191918'; g.lineWidth = 3; g.beginPath(); g.arc(cx, cy, R - 12, 0, Math.PI * 2); g.stroke();
  g.save(); g.beginPath(); g.arc(cx, cy, R - 16, 0, Math.PI * 2); g.clip();
  for (let y = 8; y < h; y += 15) for (let x = 8 + (Math.round(y / 15) % 2) * 7; x < w; x += 14) {   // raised studs with a worn shine
    g.fillStyle = '#121212'; g.fillRect(x - 3, y - 2, 8, 6);
    g.fillStyle = r() < .55 ? '#5d5b57' : '#4a4845'; g.fillRect(x - 4, y - 3, 7, 5);
  }
  g.restore();
  g.fillStyle = '#2b2b2a'; rrect(g, cx - 62, cy - 17, 124, 34, 6); g.fill();
  text(g, 'DRAIN', cx, cy + 1, 28, { color: '#55534f' });
  for (const a of [.6, 3.74]) { g.fillStyle = '#0d0d0d'; g.beginPath(); g.ellipse(cx + Math.cos(a) * (R - 34), cy + Math.sin(a) * (R - 34), 9, 4, a, 0, Math.PI * 2); g.fill(); }   // lifting keyholes
  grime(g, w, h, 56, .3);
});
