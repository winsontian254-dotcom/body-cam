/* LIVE FIRE — kit for the "bank" map (First Federal): extra library materials, a signage atlas (original, fictional names),
   box-built fittings (doors, windows, pendants, column, radiator, vault door, armoured van, fire escape), out-of-bounds street
   facades and a far skyline.
   Exports:
     BK_MATS                         extra library materials (bk_*), registered into gfx/materials.js MATERIALS at import
     sign(B, slot, x, y, z, w, h, ry, glow) / flushSigns(B)      signage quads (batched into two meshes per map)
     door(B, x, y, z, ry, { v, w, h, open, t, double })         door leaf / leaves in a wall opening (hinge -x, opens toward +z)
     win(B, x, y, z, ry, w, h, o)    window unit for an opening (frame, mullions, glass, stone sill): origin = opening centre at the sill
     pendant(B, x, yc, z, drop)      brass + opal globe pendant (emissive), yc = ceiling
     column(B, x, y, z, h, r)        classical column (base, fluted-look shaft, capital)
     vaultDoor(B, x, y, z, ry, open) round vault door (open = swung 100 degrees about its hinge at -x)
     van(B, x, z, ry)                armoured cash-in-transit van (nose +z), colliders included
     fireEscape(B, ...)              (see fn)
     facade(B, x0, z0, x1, z1, o)    a street building front from (x0,z0) to (x1,z1) facing its left side (storefront, floors of
                                     windows, cornice); one collider for the building mass
     skyline(B, list)                far towers (own textured meshes, no colliders)
   All geometry goes through the MapBuilder (merged) except the sign and skyline meshes (their own materials, per scene). */
import { MATERIALS } from '../gfx/materials.js';

// ------------------------------------------------------------------------------------------------ materials
const PM = (surf, set, scale, o) => Object.assign({ surf, set, tex: set ? 'assets/textures/' + set : null, scale }, o);
export const BK_MATS = {
  bk_limestone: PM('concrete', 'concrete_wall', 2.5, { color: '#b9ae98', desat: .8, macro: .14, anti: 1, por: .6, col: [.73, .68, .6], proc: 'noise' }),
  bk_limestone_dk: PM('concrete', 'concrete_wall', 2.5, { color: '#978c79', desat: .8, macro: .16, anti: 1, por: .6, col: [.59, .55, .47], proc: 'noise' }),
  bk_ashlar: PM('concrete', 'concrete_panels', 1.6, { color: '#b5aa94', desat: .85, macro: .14, por: .6, col: [.7, .66, .58], proc: 'tile' }),
  bk_granite: PM('concrete', 'concrete_wall', 1.5, { color: '#4b4846', desat: .9, rough: .7, macro: .1, por: .3, col: [.29, .28, .27], proc: 'noise' }),
  bk_marble: PM('tile', 'marble', 1.4, { color: '#d6d0c4', desat: .5, macro: .05, rough: .5, por: .05, col: [.84, .82, .77], proc: 'noise' }),
  bk_marble_dk: PM('tile', 'marble', 1.4, { color: '#4a3f3a', desat: .4, macro: .06, rough: .45, por: .05, col: [.29, .25, .23], proc: 'noise' }),
  bk_marble_green: PM('tile', 'marble', 1.2, { color: '#3d4c43', desat: .6, macro: .06, rough: .45, por: .05, col: [.24, .3, .26], proc: 'noise' }),
  bk_marble_floor: PM('tile', 'marble', 1.0, { color: '#c3bcae', desat: .6, macro: .07, rough: .55, por: .05, puddle: .2, col: [.76, .74, .68], proc: 'noise' }),
  bk_brass: PM('metal', 'steel', 1.2, { color: '#a7843f', desat: 1, rough: .45, metal: 1, macro: .05, por: .02, col: [.65, .52, .25], proc: 'metal' }),
  bk_walnut: PM('wood', 'wood_dark', 1.6, { color: '#5b3d26', desat: .3, macro: .06, rough: .6, por: .3, col: [.36, .24, .15], proc: 'wood' }),
  bk_oak: PM('wood', 'wood_floor', 1.7, { color: '#8a6a47', desat: .25, macro: .06, rough: .7, por: .3, col: [.54, .42, .28], proc: 'wood' }),
  bk_wall: PM('plaster', 'plaster_white', 2.0, { color: '#d3cbbb', desat: .7, macro: .06, anti: 1, por: .5, col: [.83, .8, .73], proc: 'noise' }),
  bk_wall_green: PM('plaster', 'plaster_white', 2.0, { color: '#8c9a88', desat: .8, macro: .07, anti: 1, por: .5, col: [.55, .6, .53], proc: 'noise' }),
  bk_bh: PM('plaster', 'concrete_panels', 1.2, { color: '#c4c6c0', desat: .9, macro: .08, por: .5, col: [.77, .78, .75], proc: 'tile' }),
  bk_bh_low: PM('plaster', 'plaster_white', 2.0, { color: '#6f7f86', desat: .9, macro: .07, anti: 1, por: .5, col: [.44, .5, .53], proc: 'noise' }),
  bk_vinyl: PM('tile', 'tile_floor', 2.4, { color: '#8f918b', desat: .85, macro: .06, rough: .8, por: .1, col: [.56, .57, .55], proc: 'tile' }),
  bk_carpet: PM('carpet', 'carpet', .6, { color: '#3b4757', desat: .85, macro: .1, por: 1, col: [.23, .28, .34], proc: 'noise' }),
  bk_carpet_red: PM('carpet', 'carpet', .6, { color: '#6a2a28', desat: .8, macro: .1, por: 1, col: [.42, .17, .16], proc: 'noise' }),
  bk_steel: PM('metal', 'steel', 1.5, { color: '#9a9ea2', desat: 1, rough: .5, metal: .9, macro: .05, por: .02, col: [.6, .62, .64], proc: 'metal' }),
  bk_steel_dk: PM('metal', 'steel', 1.5, { color: '#3e4246', desat: 1, rough: .6, metal: .8, macro: .06, por: .02, col: [.24, .26, .28], proc: 'metal' }),
  bk_deposit: PM('metal', 'metal_plate', .5, { color: '#a8a28e', desat: 1, rough: .45, metal: .9, macro: .05, por: .02, col: [.66, .64, .56], proc: 'tile' }),
  bk_door_paint: PM('metal', 'painted_metal', 2.0, { color: '#5d6a6f', desat: 1, rough: .55, macro: .06, por: .1, col: [.36, .41, .43], proc: 'metal' }),
  bk_frame: PM('metal', 'painted_metal', 2.0, { color: '#2b2c2d', desat: 1, rough: .55, macro: .05, por: .1, col: [.17, .17, .18], proc: 'metal' }),
  bk_frame_green: PM('metal', 'painted_metal', 2.0, { color: '#27392f', desat: 1, rough: .5, macro: .05, por: .1, col: [.15, .22, .18], proc: 'metal' }),
  bk_roof: PM('concrete', 'concrete_floor', 2.5, { color: '#55575a', desat: .9, macro: .2, anti: 1, por: .6, puddle: .5, col: [.33, .34, .35], proc: 'noise' }),
  bk_kerb: PM('concrete', 'concrete_wall', 1.5, { color: '#9c9890', desat: .8, macro: .12, anti: 1, por: .6, col: [.6, .59, .56], proc: 'noise' }),
  bk_line: PM('concrete', null, 1, { col: [.86, .85, .8], rough: .8, macro: .2, por: .4, proc: 'noise' }),
  bk_line_y: PM('concrete', null, 1, { col: [.8, .62, .14], rough: .8, macro: .2, por: .4, proc: 'noise' }),
  bk_brick_tan: PM('brick', 'brick', 1.5, { color: '#a28566', desat: .6, macro: .14, por: .7, col: [.62, .52, .4], proc: 'brick' }),
  bk_brick_dk: PM('brick', 'brick_red', 2.0, { color: '#5e3a2e', desat: .4, macro: .14, por: .7, col: [.37, .23, .18], proc: 'brick' }),
  bk_stucco: PM('plaster', 'plaster', 1.6, { color: '#a49a8a', desat: .6, macro: .16, anti: 1, por: .6, col: [.64, .6, .54], proc: 'noise' }),
  bk_stucco_b: PM('plaster', 'plaster', 1.6, { color: '#7e8a8e', desat: .7, macro: .16, anti: 1, por: .6, col: [.5, .54, .56], proc: 'noise' }),
  bk_panel_c: PM('concrete', 'concrete_panels', 2.4, { color: '#8a8780', desat: .6, macro: .14, por: .6, col: [.54, .53, .5], proc: 'tile' }),
  bk_garage: PM('concrete', 'concrete_wall', 2.5, { color: '#8e8c87', desat: .8, macro: .22, anti: 1, por: .7, col: [.56, .55, .53], proc: 'noise' }),
  bk_glass_shop: PM('glass', null, 1, { kind: 'glass', col: [.22, .26, .28], alpha: .55, macro: .03, por: 0 }),
  bk_glow: PM('glass', null, 1, { kind: 'emissive', col: [1, .9, .74], emissive: 2.2 }),
  bk_glow_cool: PM('glass', null, 1, { kind: 'emissive', col: [.9, .95, 1], emissive: 1.6 }),
  bk_glow_dim: PM('glass', null, 1, { kind: 'emissive', col: [.95, .9, .8], emissive: .7 }),
  bk_awning_g: PM('fabric', 'fabric', .5, { color: '#24493a', desat: 1, macro: .1, por: 1, col: [.14, .29, .23], proc: 'noise' }),
  bk_awning_r: PM('fabric', 'fabric', .5, { color: '#7b2420', desat: 1, macro: .1, por: 1, col: [.48, .14, .12], proc: 'noise' }),
  bk_awning_b: PM('fabric', 'fabric', .5, { color: '#25364f', desat: 1, macro: .1, por: 1, col: [.15, .21, .31], proc: 'noise' }),
};
for (const k in BK_MATS) if (!MATERIALS[k]) MATERIALS[k] = BK_MATS[k];

// ------------------------------------------------------------------------------------------------ tiny geometry accumulator
class Geo {
  constructor() { this.p = []; this.n = []; this.u = []; this.i = []; }
  quad(a, b, c, d, n, uv) {
    const k = this.p.length / 3;
    for (const q of [a, b, c, d]) this.p.push(q[0], q[1], q[2]);
    for (let i = 0; i < 4; i++) this.n.push(n[0], n[1], n[2]);
    this.u.push(...uv);
    this.i.push(k, k + 2, k + 1, k, k + 3, k + 2);
  }
  mesh(name, scene, mat) {
    if (!this.i.length) return null;
    const m = new BABYLON.Mesh(name, scene), vd = new BABYLON.VertexData();
    vd.positions = this.p; vd.normals = this.n; vd.uvs = this.u; vd.indices = this.i;
    vd.applyToMesh(m, false); m.material = mat; m.isPickable = false;
    return m;
  }
}
const rng = s => () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };

// ------------------------------------------------------------------------------------------------ signage atlas
const SW = 2048, SH = 2048;
const SLOTS = {};
const signState = new WeakMap();
const SANS = 'Arial, Helvetica, "Liberation Sans", sans-serif', SERIF = 'Georgia, "Times New Roman", "Liberation Serif", serif';
function drawSigns(g) {
  let cx = 0, cy = 0, rowH = 0;
  const slot = (name, w, h, fn) => {
    if (cx + w > SW) { cx = 0; cy += rowH + 4; rowH = 0; }
    g.save(); g.translate(cx, cy); g.beginPath(); g.rect(0, 0, w, h); g.clip(); fn(g, w, h); g.restore();
    SLOTS[name] = [cx, cy, cx + w, cy + h]; cx += w + 4; rowH = Math.max(rowH, h);
  };
  const txt = (s, x, y, size, col, o = {}) => {
    g.font = (o.weight || 'bold') + ' ' + size + 'px ' + (o.font || SANS); g.textAlign = o.align || 'center'; g.textBaseline = 'middle'; g.fillStyle = col;
    const m = g.measureText(s).width, mw = o.maxW || 1e9;
    if (o.ls) { try { g.letterSpacing = o.ls + 'px'; } catch (e) { /* old canvas */ } }
    if (m > mw) { g.save(); g.translate(x, y); g.scale(mw / m, 1); g.fillText(s, 0, 0); g.restore(); } else g.fillText(s, x, y);
    if (o.ls) { try { g.letterSpacing = '0px'; } catch (e) { /* */ } }
  };
  const brass = (y0, y1) => { const q = g.createLinearGradient(0, y0, 0, y1); q.addColorStop(0, '#f0dca4'); q.addColorStop(.5, '#b8924f'); q.addColorStop(1, '#7c5c2c'); return q; };
  // carved / bronze lettering for the frieze (transparent background)
  slot('name', 2048, 220, (g, w, h) => { g.clearRect(0, 0, w, h); txt('FIRST  FEDERAL', w / 2, h / 2 + 6, 168, brass(30, 200), { font: SERIF, ls: 30, maxW: w - 40 }); });
  slot('est', 1024, 120, (g, w, h) => { g.clearRect(0, 0, w, h); txt('SAVINGS  &  TRUST   ·   EST. 1924', w / 2, h / 2, 62, '#cdbb93', { font: SERIF, weight: 'normal', ls: 8, maxW: w - 30 }); });
  slot('carved', 2048, 200, (g, w, h) => { g.clearRect(0, 0, w, h); txt('FIRST FEDERAL SAVINGS & TRUST COMPANY', w / 2, h / 2, 120, 'rgba(70,60,45,.85)', { font: SERIF, ls: 14, maxW: w - 40 }); });
  slot('logo', 256, 256, (g, w, h) => {      // round bronze emblem (original: a keystone in a ring)
    g.clearRect(0, 0, w, h); const q = brass(20, 236);
    g.strokeStyle = q; g.lineWidth = 16; g.beginPath(); g.arc(128, 128, 104, 0, 7); g.stroke();
    g.fillStyle = q; g.beginPath(); g.moveTo(92, 60); g.lineTo(164, 60); g.lineTo(150, 196); g.lineTo(106, 196); g.closePath(); g.fill();
    txt('FF', 128, 124, 54, '#5a4320', { font: SERIF });
  });
  const plate = (name, l1, l2, w = 640, bg = '#1f2a25', fg = '#e9dfc4', h = 160) => slot(name, w, h, (g, W, H) => {
    g.fillStyle = bg; g.fillRect(0, 0, W, H); g.strokeStyle = 'rgba(214,190,130,.8)'; g.lineWidth = 6; g.strokeRect(8, 8, W - 16, H - 16);
    txt(l1, W / 2, l2 ? H * .38 : H / 2, H * .34, fg, { ls: 4, maxW: W - 40 });
    if (l2) txt(l2, W / 2, H * .74, H * .16, '#c8bc9e', { weight: 'normal', ls: 3, maxW: W - 40 });
  });
  plate('vault', 'SAFE DEPOSIT', 'VAULT  ·  ESCORTED ACCESS ONLY');
  plate('staff', 'STAFF ONLY', 'AUTHORISED PERSONNEL', 512);
  plate('loans', 'LOANS & MORTGAGES', null, 640);
  plate('private', 'PRIVATE BANKING', null, 640);
  plate('wait', 'PLEASE WAIT HERE', 'NEXT AVAILABLE TELLER', 640);
  plate('records', 'RECORDS', null, 384);
  plate('cash', 'CASH ROOM', 'DUAL CONTROL AT ALL TIMES', 512, '#3a2420', '#f1e2da');
  plate('security', 'SECURITY', null, 384, '#22262b', '#e6e6e6');
  plate('dock', 'LOADING DOCK', 'NO PARKING  ·  CASH IN TRANSIT', 640, '#3d3218', '#f6e7b4');
  plate('breakrm', 'STAFF ROOM', null, 384, '#22262b', '#e6e6e6');
  plate('nightdep', 'NIGHT DEPOSITORY', '24 HOUR BANKING', 640);
  for (let i = 1; i <= 6; i++) slot('tel' + i, 128, 128, (g, w, h) => { g.fillStyle = '#16211c'; g.fillRect(0, 0, w, h); g.strokeStyle = '#c9a85e'; g.lineWidth = 5; g.strokeRect(6, 6, w - 12, h - 12); txt(String(i), w / 2, h / 2 + 4, 84, '#e9d9a8', { font: SERIF }); });
  slot('closed', 256, 96, (g, w, h) => { g.fillStyle = '#efe7d2'; g.fillRect(0, 0, w, h); txt('POSITION CLOSED', w / 2, h / 2, 26, '#7a1f1a'); });
  slot('rates', 384, 512, (g, w, h) => {
    g.fillStyle = '#0f2a22'; g.fillRect(0, 0, w, h); txt('TODAY\'S RATES', w / 2, 46, 34, '#e9d9a8', { font: SERIF, ls: 3 });
    const rows = [['PASSBOOK', '1.85%'], ['12 MO. CD', '4.10%'], ['24 MO. CD', '4.35%'], ['HOME LOAN 30Y', '6.20%'], ['AUTO LOAN', '5.90%'], ['MONEY MKT', '3.05%']];
    rows.forEach(([a, b], i) => { txt(a, 30, 110 + i * 62, 24, '#d8d2bd', { align: 'left', weight: 'normal' }); txt(b, w - 30, 110 + i * 62, 26, '#f3c86a', { align: 'right' }); });
  });
  slot('ad1', 384, 512, (g, w, h) => {      // poster: "home loans" (original)
    const q = g.createLinearGradient(0, 0, 0, h); q.addColorStop(0, '#d9e3e6'); q.addColorStop(1, '#8aa7b1'); g.fillStyle = q; g.fillRect(0, 0, w, h);
    g.fillStyle = '#3b5560'; g.beginPath(); g.moveTo(80, 300); g.lineTo(192, 200); g.lineTo(304, 300); g.closePath(); g.fill(); g.fillRect(100, 300, 184, 120);
    g.fillStyle = '#f2c46b'; g.fillRect(170, 340, 44, 80);
    txt('A KEY OF', w / 2, 70, 46, '#1d3138', { font: SERIF }); txt('YOUR OWN', w / 2, 122, 46, '#1d3138', { font: SERIF });
    txt('FIRST FEDERAL HOME LOANS', w / 2, 470, 22, '#1d3138', { ls: 2 });
  });
  slot('ad2', 384, 512, (g, w, h) => {
    g.fillStyle = '#7d2b24'; g.fillRect(0, 0, w, h); g.fillStyle = '#efe0c1'; g.beginPath(); g.arc(w / 2, 250, 110, 0, 7); g.fill();
    txt('SAVE', w / 2, 230, 70, '#7d2b24', { font: SERIF }); txt('SMART', w / 2, 290, 44, '#7d2b24', { font: SERIF });
    txt('Start a passbook account today', w / 2, 430, 22, '#efe0c1', { weight: 'normal' });
  });
  slot('clock', 256, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h); g.fillStyle = '#f2ecdc'; g.beginPath(); g.arc(128, 128, 120, 0, 7); g.fill(); g.strokeStyle = '#7c5c2c'; g.lineWidth = 12; g.stroke();
    g.strokeStyle = '#222'; g.lineWidth = 6; for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; g.beginPath(); g.moveTo(128 + Math.sin(a) * 92, 128 - Math.cos(a) * 92); g.lineTo(128 + Math.sin(a) * 108, 128 - Math.cos(a) * 108); g.stroke(); }
    g.lineWidth = 8; g.beginPath(); g.moveTo(128, 128); g.lineTo(128 + 50, 128 - 30); g.stroke(); g.lineWidth = 5; g.beginPath(); g.moveTo(128, 128); g.lineTo(128 - 20, 128 - 84); g.stroke();
  });
  slot('exit', 256, 112, (g, w, h) => {
    g.fillStyle = '#0f7a3a'; g.fillRect(0, 0, w, h); txt('EXIT', 150, h / 2 + 2, 70, '#f4fff6');
    g.fillStyle = '#f4fff6'; g.beginPath(); g.moveTo(26, h / 2); g.lineTo(62, h / 2 - 26); g.lineTo(62, h / 2 + 26); g.closePath(); g.fill();
  });
  slot('cctv', 768, 384, (g, w, h) => {      // CCTV monitor wall (glow)
    g.fillStyle = '#05070a'; g.fillRect(0, 0, w, h); const r = rng(11);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) {
      const x = i * 192 + 4, y = j * 192 + 4, W2 = 184, H2 = 184;
      const q = g.createLinearGradient(x, y, x, y + H2); q.addColorStop(0, '#5d6a64'); q.addColorStop(1, '#2c3431'); g.fillStyle = q; g.fillRect(x, y, W2, H2);
      g.fillStyle = 'rgba(20,24,22,.7)'; for (let k = 0; k < 5; k++) g.fillRect(x + r() * 150, y + 60 + r() * 100, 12 + r() * 40, 20 + r() * 70);
      g.strokeStyle = 'rgba(200,210,205,.35)'; g.lineWidth = 2; g.beginPath(); g.moveTo(x, y + H2 * .55); g.lineTo(x + W2, y + H2 * .45); g.stroke();
      g.font = '14px monospace'; g.fillStyle = '#e8f2ea'; g.textAlign = 'left'; g.fillText('CAM 0' + (i + j * 4 + 1), x + 6, y + 16); g.fillText('REC', x + W2 - 40, y + 16);
    }
  });
  slot('screen', 256, 160, (g, w, h) => { g.fillStyle = '#0b2440'; g.fillRect(0, 0, w, h); g.fillStyle = '#d8e6f2'; g.fillRect(12, 12, w - 24, 22); g.fillStyle = '#5d86ad'; for (let i = 0; i < 6; i++) g.fillRect(16, 46 + i * 17, 90 + (i * 37) % 120, 9); });
  // street and shop signs (fictional businesses)
  const shop = (name, l1, l2, bg, fg, w = 1024) => slot(name, w, 160, (g, W, H) => {
    g.fillStyle = bg; g.fillRect(0, 0, W, H); g.fillStyle = 'rgba(255,255,255,.08)'; g.fillRect(0, 0, W, 8);
    txt(l1, W / 2, l2 ? 64 : H / 2 + 4, l2 ? 72 : 88, fg, { font: SERIF, ls: 6, maxW: W - 50 }); if (l2) txt(l2, W / 2, 128, 28, fg, { weight: 'normal', ls: 8, maxW: W - 50 });
  });
  shop('s_deli', 'HARLAN\'S DELI', 'SANDWICHES · COFFEE · SOUP', '#1f3b2d', '#f0e2b6');
  shop('s_shoes', 'PIKE & DAUGHTERS', 'SHOE REPAIR SINCE 1951', '#2a2a2e', '#e3d6b0');
  shop('s_pharm', 'CITY PHARMACY', null, '#e9eef0', '#1f6a3a');
  shop('s_books', 'MARGIN BOOKS', 'USED & RARE', '#5a2320', '#f3e3c3');
  shop('s_cafe', 'BLUE KETTLE', 'ESPRESSO BAR', '#203852', '#e9edf2');
  shop('s_tailor', 'OSTRANDER TAILORS', 'ALTERATIONS', '#3a3127', '#e7d7b3');
  shop('s_jewel', 'VANCE JEWELERS', 'WATCHES · GOLD · REPAIRS', '#101014', '#d6b46a');
  shop('s_insure', 'CORLISS MUTUAL', 'INSURANCE', '#e7e3d9', '#26344a');
  shop('s_garage', 'CIVIC CENTER GARAGE', 'PUBLIC PARKING  ·  OPEN 24 HOURS', '#1e4b8f', '#ffffff');
  shop('s_hotel', 'THE GRANVILLE', 'HOTEL', '#2b1d18', '#d9b977');
  shop('s_laundry', 'SUDS LAUNDROMAT', null, '#5bb2d6', '#0d2a3a');
  shop('s_lease', 'FOR LEASE', '555-0142', '#f2f2ee', '#b01f1a', 512);
  slot('park', 256, 256, (g, w, h) => { g.fillStyle = '#1e4b8f'; g.fillRect(0, 0, w, h); g.strokeStyle = '#fff'; g.lineWidth = 10; g.strokeRect(12, 12, w - 24, h - 24); txt('P', w / 2, h / 2 + 8, 200, '#fff'); });
  plate('g_level', 'LEVEL P1', 'RAMP UP TO P2 – P5', 640, '#e5c22c', '#1a1a1a');
  plate('g_exit', 'EXIT  →  FEDERAL AVE', null, 768, '#1e4b8f', '#ffffff');
  plate('g_pay', 'PAY HERE', 'CARDS · COINS · NOTES', 384, '#1e4b8f', '#ffffff');
  plate('g_clear', 'CLEARANCE 2.1 m', null, 768, '#e5c22c', '#1a1a1a');
  slot('graffiti', 512, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h); g.lineCap = 'round'; g.lineJoin = 'round';
    const tag = (col, lw, dx) => { g.strokeStyle = col; g.lineWidth = lw; g.beginPath(); g.moveTo(40 + dx, 180); g.bezierCurveTo(90 + dx, 30, 140 + dx, 220, 190 + dx, 80); g.bezierCurveTo(230 + dx, 20, 260 + dx, 200, 300 + dx, 120); g.lineTo(360 + dx, 60); g.lineTo(380 + dx, 190); g.bezierCurveTo(420 + dx, 120, 440 + dx, 150, 470 + dx, 90); g.stroke(); };
    tag('rgba(20,20,26,.9)', 26, 4); tag('rgba(60,170,210,.95)', 16, 0);
  });
  slot('stencil', 512, 128, (g, w, h) => { g.clearRect(0, 0, w, h); txt('NO PARKING · LOADING ZONE', w / 2, h / 2, 50, 'rgba(230,200,40,.9)', { ls: 4, maxW: w - 20 }); });
  slot('hydrant', 128, 128, (g, w, h) => { g.clearRect(0, 0, w, h); g.fillStyle = 'rgba(40,36,30,.55)'; for (let i = 0; i < 40; i++) { const a = i * 2.4, r = (i % 7) * 7; g.beginPath(); g.arc(64 + Math.cos(a) * r, 64 + Math.sin(a) * r, 14 - i * .25, 0, 7); g.fill(); } });
  slot('stain', 256, 256, (g, w, h) => { g.clearRect(0, 0, w, h); const q = g.createRadialGradient(128, 128, 10, 128, 128, 124); q.addColorStop(0, 'rgba(30,26,20,.45)'); q.addColorStop(.6, 'rgba(30,26,20,.22)'); q.addColorStop(1, 'rgba(30,26,20,0)'); g.fillStyle = q; g.fillRect(0, 0, w, h); });
  slot('streak', 128, 512, (g, w, h) => { g.clearRect(0, 0, w, h); const q = g.createLinearGradient(0, 0, 0, h); q.addColorStop(0, 'rgba(25,22,18,.55)'); q.addColorStop(1, 'rgba(25,22,18,0)'); g.fillStyle = q; for (let i = 0; i < 9; i++) g.fillRect(8 + i * 13, 0, 5 + (i % 3) * 3, h * (.4 + (i * 37 % 60) / 100)); });
  slot('crosswalk', 64, 64, (g, w, h) => { g.fillStyle = '#e9e7df'; g.fillRect(0, 0, w, h); });
  slot('van', 1024, 256, (g, w, h) => { g.clearRect(0, 0, w, h); txt('IRONGATE', 300, 110, 120, '#1c2f52', { font: SERIF, ls: 6 }); txt('SECURE TRANSPORT', 300, 200, 46, '#9c2a22', { ls: 6 }); g.fillStyle = '#1c2f52'; g.fillRect(680, 50, 300, 16); g.fillRect(680, 190, 300, 16); txt('UNIT 27', 830, 128, 60, '#1c2f52'); });
  slot('busad', 768, 256, (g, w, h) => { const q = g.createLinearGradient(0, 0, w, 0); q.addColorStop(0, '#f29b35'); q.addColorStop(1, '#d4472a'); g.fillStyle = q; g.fillRect(0, 0, w, h); txt('RIVERFRONT FAIR', w / 2, 100, 84, '#fff', { font: SERIF }); txt('THIS WEEKEND ONLY', w / 2, 190, 40, '#fff4d8', { ls: 6 }); });
  slot('pinboard', 384, 256, (g, w, h) => { g.fillStyle = '#9b7a52'; g.fillRect(0, 0, w, h); const r = rng(5); const cols = ['#f4f1e6', '#f7e27a', '#bfe3f0', '#f4c6c6']; for (let i = 0; i < 9; i++) { g.save(); g.translate(30 + r() * 300, 20 + r() * 180); g.rotate((r() - .5) * .3); g.fillStyle = cols[i % 4]; g.fillRect(0, 0, 60 + r() * 30, 70 + r() * 20); g.fillStyle = 'rgba(60,60,60,.6)'; for (let k = 0; k < 5; k++) g.fillRect(8, 14 + k * 11, 40 + r() * 20, 3); g.restore(); } });
}
export function signMats(scene) {
  let st = signState.get(scene);
  if (st) return st;
  const BB = BABYLON;
  const dt = new BB.DynamicTexture('bk_signs', { width: SW, height: SH }, scene, true);
  dt.hasAlpha = true; dt.anisotropicFilteringLevel = 4;
  const g = dt.getContext(); g.clearRect(0, 0, SW, SH); drawSigns(g); dt.update(true);
  const lit = new BB.PBRMaterial('bk_sign', scene);
  lit.albedoTexture = dt; lit.useAlphaFromAlbedoTexture = true; lit.transparencyMode = BB.PBRMaterial.PBRMATERIAL_ALPHATEST; lit.alphaCutOff = .4;
  lit.metallic = .1; lit.roughness = .55;
  const dec = new BB.PBRMaterial('bk_decal', scene);      // soft decals (stains, streaks): alpha blended, no depth write
  dec.albedoTexture = dt; dec.useAlphaFromAlbedoTexture = true; dec.transparencyMode = BB.PBRMaterial.PBRMATERIAL_ALPHABLEND;
  dec.metallic = 0; dec.roughness = .9; dec.zOffset = -2; dec.disableDepthWrite = true;
  const glow = new BB.PBRMaterial('bk_signglow', scene);
  glow.albedoColor = new BB.Color3(0, 0, 0); glow.emissiveTexture = dt; glow.emissiveColor = new BB.Color3(1, 1, 1); glow.emissiveIntensity = 1.4;
  glow.metallic = 0; glow.roughness = 1; glow.environmentIntensity = 0;
  st = { tex: dt, lit, glow, dec };
  signState.set(scene, st);
  scene.onDisposeObservable.addOnce(() => signState.delete(scene));
  return st;
}
const signBatch = new WeakMap();
/** Sign quad: centre (x, y, z) in the current frame, w x h, front = +z of the frame turned by ry. kind: false | true (glow) | 'decal'.
    flat: true = lying on the ground (front = up). */
export function sign(B, slot, x, y, z, w, h, ry = 0, kind = false, flat = false) {
  if (!Object.keys(SLOTS).length) signMats(B.scene);
  const r = SLOTS[slot]; if (!r) { B.warn('bank: unknown sign ' + slot); return; }
  let bt = signBatch.get(B); if (!bt) { bt = { lit: new Geo(), glow: new Geo(), dec: new Geo() }; signBatch.set(B, bt); }
  const u0 = r[0] / SW, u1 = r[2] / SW, v0 = 1 - r[3] / SH, v1 = 1 - r[1] / SH;
  const p = B.toWorld(x, y, z, {}), th = B.T.th + ry, c = Math.cos(th), sn = Math.sin(th), hw = w / 2, hh = h / 2;
  const geo = kind === 'decal' ? bt.dec : kind ? bt.glow : bt.lit;
  if (flat) {
    const P = (lx, lz) => [p.x + lx * c + lz * sn, p.y, p.z - lx * sn + lz * c];
    geo.quad(P(-hw, hh), P(hw, hh), P(hw, -hh), P(-hw, -hh), [0, 1, 0], [u0, v0, u1, v0, u1, v1, u0, v1]);
    return;
  }
  const P = (lx, ly) => [p.x + lx * c, p.y + ly, p.z - lx * sn];
  geo.quad(P(hw, -hh), P(-hw, -hh), P(-hw, hh), P(hw, hh), [sn, 0, c], [u0, v0, u1, v0, u1, v1, u0, v1]);
}
export function flushSigns(B) {
  const bt = signBatch.get(B); if (!bt) return;
  const S = signMats(B.scene);
  B.push(); B.stack[B.stack.length - 1] = { c: 1, s: 0, th: 0, tx: 0, ty: 0, tz: 0, k: 1 };
  for (const [g, mat, nm] of [[bt.lit, S.lit, 'bk_signs'], [bt.glow, S.glow, 'bk_signs_glow'], [bt.dec, S.dec, 'bk_decals']]) {
    const m = g.mesh(nm, B.scene, mat); if (m) { B.mesh(m, { merge: false, collide: 'none', cast: false }); if (g === bt.dec) m.alphaIndex = 10; }
  }
  B.pop();
  signBatch.delete(B);
}

// ------------------------------------------------------------------------------------------------ fittings
const NC = { collide: false };
/** Door leaf (or two) in an opening: origin = centre of the doorway on the wall line (wall along local x), hinge at -x,
    opens toward +z by `open` degrees. v: 'wood' | 'metal' | 'glass' | 'steel'. */
export function door(B, x, y, z, ry, o = {}) {
  const v = o.v || 'wood', W = o.w || 0.9, H = o.h || 2.1, t = o.t || 0.2, a = (o.open || 0) * Math.PI / 180;
  const mat = { wood: 'bk_walnut', metal: 'bk_door_paint', glass: 'bk_brass', steel: 'bk_steel' }[v] || 'bk_walnut';
  const fm = v === 'wood' ? 'bk_walnut' : v === 'glass' ? 'bk_brass' : 'bk_frame';
  B.push(x, y, z, ry);
  if (o.frame !== false) { for (const s of [-1, 1]) B.box(s * (W / 2 + 0.035), 0, 0, 0.07, H + 0.05, t + 0.06, { mat: fm, collide: false }); B.box(0, H, 0, W + 0.14, 0.07, t + 0.06, { mat: fm, collide: false }); }
  const leaf = (hx, side, lw, ang) => {
    B.push(hx, 0, 0, side > 0 ? -ang : ang);
    const x0 = side > 0 ? lw / 2 : -lw / 2, far = side > 0 ? lw - 0.1 : -lw + 0.1, solid = !!o.solid;
    if (v === 'glass') {
      for (const [bx, by, bw, bh] of [[x0, 0, lw, 0.22], [x0, H - 0.1, lw, 0.1], [x0 - lw / 2 + 0.05, 0, 0.1, H], [x0 + lw / 2 - 0.05, 0, 0.1, H]]) B.box(bx, by, 0, bw, bh, 0.05, { mat, collide: false });
      B.box(x0, 0.22, 0, lw - 0.2, H - 0.32, 0.012, { mat: 'glass', surf: 'glass', cast: false, collide: solid });
      B.box(far, 0.95, 0.05, 0.03, 0.8, 0.03, { mat: 'bk_brass', collide: false }); B.box(far, 0.95, -0.05, 0.03, 0.8, 0.03, { mat: 'bk_brass', collide: false });
    } else {
      B.box(x0, 0, 0, lw - 0.01, H - 0.01, 0.05, { mat, surf: v === 'wood' ? 'wood' : 'metal', collide: solid });
      if (v === 'wood') for (const [py, ph] of [[0.15, 0.85], [1.15, 0.8]]) for (const f of [-1, 1]) B.box(x0, py, f * 0.027, lw - 0.22, ph, 0.006, { mat: 'bk_oak', collide: false });
      if (v === 'metal') { B.box(x0, 1.45, 0.026, lw * 0.3, 0.5, 0.004, { mat: 'glass', collide: false, cast: false }); B.box(x0, 0.03, 0.026, lw - 0.06, 0.22, 0.004, { mat: 'p_stainless', collide: false }); }
      for (const f of [-1, 1]) B.box(far - (side > 0 ? 0.05 : -0.05), 1.0, f * 0.06, 0.13, 0.025, 0.025, { mat: v === 'wood' ? 'bk_brass' : 'p_chrome', collide: false });
    }
    B.pop();
  };
  if (o.double) { leaf(-W / 2, 1, W / 2, a); leaf(W / 2, -1, W / 2, a); } else leaf(-W / 2, 1, W, a);
  B.pop();
}
/** Window unit for a wall opening (origin = opening centre on the wall line at the sill, wall along local x, outside = -z). */
export function win(B, x, y, z, ry, w, h, o = {}) {
  const t = o.t || 0.35, fm = o.frame || 'bk_frame', cols = o.cols || Math.max(1, Math.round(w / 0.9)), rows = o.rows || (h > 2 ? 3 : 2);
  B.push(x, y, z, ry);
  B.box(0, -0.06, -0.02, w + 0.16, 0.06, t + 0.14, { mat: o.sill || 'bk_limestone_dk', collide: false });      // stone sill
  B.box(0, 0, 0, w, 0.06, 0.08, { mat: fm, collide: false }); B.box(0, h - 0.06, 0, w, 0.06, 0.08, { mat: fm, collide: false });
  B.box(-w / 2 + 0.03, 0, 0, 0.06, h, 0.08, { mat: fm, collide: false }); B.box(w / 2 - 0.03, 0, 0, 0.06, h, 0.08, { mat: fm, collide: false });
  for (let i = 1; i < cols; i++) B.box(-w / 2 + w * i / cols, 0.06, 0, 0.04, h - 0.12, 0.05, { mat: fm, collide: false });
  for (let j = 1; j < rows; j++) B.box(0, h * j / rows, 0, w - 0.1, 0.04, 0.05, { mat: fm, collide: false });
  B.box(0, 0.06, 0, w - 0.1, h - 0.12, 0.012, { mat: o.glass || 'glass', surf: 'glass', cast: false, collide: o.collide !== false });
  B.pop();
}
/** Pendant: rod from the ceiling yc down `drop`, brass gallery and an opal globe (glowing). */
export function pendant(B, x, yc, z, drop = 1.6, big = false) {
  const r = big ? 0.32 : 0.2;
  B.cyl(x, yc - 0.06, z, 0.12, 0.06, { mat: 'bk_brass', sides: 10, collide: false });
  B.cyl(x, yc - drop, z, 0.012, drop, { mat: 'bk_brass', sides: 6, collide: false, caps: false });
  B.cyl(x, yc - drop - 0.06, z, r * 0.55, 0.08, { mat: 'bk_brass', sides: 12, collide: false });
  const s = BABYLON.MeshBuilder.CreateSphere('bk_globe', { diameter: r * 2, segments: 8 }, B.scene);
  const p = B.toWorld(x, yc - drop - 0.06 - r * 0.85, z, {});
  B.push(); B.stack[B.stack.length - 1] = { c: 1, s: 0, th: 0, tx: 0, ty: 0, tz: 0, k: 1 };
  s.position.set(p.x, p.y, p.z); B.mesh(s, { mat: 'bk_glow', collide: 'none', cast: false });
  B.pop();
}
/** Classical column: square plinth, base, shaft (16 sides), capital and abacus; y = floor, h = to the underside of the beam. */
export function column(B, x, y, z, h, r = 0.42, mat = 'bk_limestone') {
  B.box(x, y, z, r * 2.5, 0.35, r * 2.5, { mat: 'bk_granite' });
  B.cyl(x, y + 0.35, z, r * 1.14, 0.18, { mat, sides: 20, collide: false });
  B.cyl(x, y + 0.53, z, r, h - 1.1, { mat, sides: 20 });
  B.cyl(x, y + h - 0.57, z, r * 1.08, 0.12, { mat, sides: 20, collide: false });
  B.cyl(x, y + h - 0.45, z, r * 1.2, 0.2, { mat, sides: 20, collide: false });
  B.box(x, y + h - 0.25, z, r * 2.7, 0.25, r * 2.7, { mat, collide: false });
  // flutes (thin dark strips) suggest the fluting without the triangle cost
  for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; B.box(x + Math.cos(a) * (r - 0.005), y + 0.62, z + Math.sin(a) * (r - 0.005), 0.035, h - 1.3, 0.012, { mat: 'bk_limestone_dk', ry: -a + Math.PI / 2, collide: false, cast: false }); }
}
/** Round vault door (r 1.25, 0.6 thick) hinged at local -x of the opening (origin = opening centre on the wall face, y = floor). */
export function vaultDoor(B, x, y, z, ry, open = 100) {
  B.push(x, y, z, ry);
  const R = 1.25, a = open * Math.PI / 180;
  // frame ring on the wall face
  B.box(0, 0, 0.05, 2.9, 0.18, 0.12, { mat: 'bk_steel', collide: false });
  B.box(0, 2.62, 0.05, 2.9, 0.18, 0.12, { mat: 'bk_steel', collide: false });
  for (const s of [-1, 1]) B.box(s * 1.36, 0, 0.05, 0.18, 2.8, 0.12, { mat: 'bk_steel', collide: false });
  // hinge column
  B.cyl(-1.42, 0, 0.28, 0.12, 2.7, { mat: 'bk_steel_dk', sides: 12 });
  B.push(-1.42, 0, 0.28, -a);
  const disk = BABYLON.MeshBuilder.CreateCylinder('bk_vdoor', { diameter: R * 2, height: 0.6, tessellation: 28 }, B.scene);
  const c = B.toWorld(R + 0.15, 1.36, 0.3, {}), th = B.T.th;
  B.push(); B.stack[B.stack.length - 1] = { c: 1, s: 0, th: 0, tx: 0, ty: 0, tz: 0, k: 1 };
  disk.rotation.set(Math.PI / 2, th, 0); disk.position.set(c.x, c.y, c.z);
  B.mesh(disk, { mat: 'bk_steel', collide: [{ cx: c.x, cy: c.y, cz: c.z, hx: R * .9, hy: R * .9, hz: 0.3, ry: th }] });
  B.pop();
  // bolt wheel and handles on the inner face (+z side of the disk when open... local -z = front of the closed door)
  B.cyl(R + 0.15, 1.3, 0.62, 0.32, 0.1, { mat: 'bk_steel_dk', sides: 16, collide: false });
  for (let i = 0; i < 3; i++) B.box(R + 0.15, 1.33, 0.7, 1.0, 0.06, 0.06, { mat: 'p_chrome', ry: i * Math.PI / 3, collide: false });
  for (let i = 0; i < 8; i++) { const q = i * Math.PI / 4; B.cyl(R + 0.15 + Math.cos(q) * 1.02, 1.32 + Math.sin(q) * 1.02, 0.3, 0.06, 0.1, { mat: 'p_chrome', sides: 8, collide: false }); }
  B.pop();
  B.pop();
}
/** Armoured cash-in-transit van, ~6.4 x 2.3 x 2.75 m, nose = +z. */
export function van(B, x, z, ry = 0) {
  B.push(x, 0, z, ry);
  const body = 'p_paint_cream', W = 2.3;
  B.box(0, 0.55, 3.0, W - 0.05, 0.95, 0.5, { mat: 'p_coat_black', collide: false });                  // bumper + grille block
  B.box(0, 0.55, 2.0, W, 1.0, 1.6, { mat: body });                                                    // cab lower
  B.box(0, 1.55, 1.95, W - 0.08, 0.95, 1.4, { mat: body, collide: false });                             // cab upper
  B.box(0, 1.6, 2.66, W - 0.25, 0.75, 0.04, { mat: 'p_glass_dark', ry: 0, collide: false });         // windscreen (slightly raked: flat)
  for (const s of [-1, 1]) B.box(s * (W / 2 + 0.005), 1.7, 2.05, 0.02, 0.5, 0.75, { mat: 'p_glass_dark', collide: false });
  B.box(0, 0.55, -1.15, W + 0.04, 2.25, 4.6, { mat: body });                                          // armoured box
  B.box(0, 2.8, -1.15, W - 0.2, 0.06, 4.4, { mat: 'p_coat_white', collide: false });
  for (const s of [-1, 1]) {
    B.box(s * (W / 2 + 0.025), 1.95, -1.15, 0.01, 0.12, 4.5, { mat: 'p_coat_blue', collide: false });   // stripe
    B.box(s * (W / 2 + 0.03), 1.65, -0.2, 0.012, 0.18, 0.3, { mat: 'p_glass_dark', collide: false });  // gun port window
    for (const zz of [2.0, -2.35]) {
      const wh = BABYLON.MeshBuilder.CreateCylinder('bk_wheel', { diameter: 1.0, height: 0.32, tessellation: 18 }, B.scene);
      const p = B.toWorld(s * (W / 2 - 0.12), 0.5, zz, {});
      B.push(); B.stack[B.stack.length - 1] = { c: 1, s: 0, th: 0, tx: 0, ty: 0, tz: 0, k: 1 };
      wh.rotation.set(0, B.stack[B.stack.length - 2].th, Math.PI / 2); wh.position.set(p.x, p.y, p.z);
      B.mesh(wh, { mat: 'rubber', collide: 'none' }); B.pop();
      B.box(s * (W / 2 - 0.05), 0.42, zz, 0.06, 0.16, 0.36, { mat: 'p_chrome', collide: false });
    }
  }
  B.box(0, 0.25, -0.2, W - 0.5, 0.3, 4.6, { mat: 'p_coat_black', collide: false });                  // chassis
  B.box(0, 3.0 - 0.45, -3.47, W - 0.1, 0.04, 0.04, { mat: 'p_chrome', collide: false });
  for (const s of [-1, 1]) {                                                                            // rear doors, one ajar
    B.push(s * 0.57, 0.6, -3.48, s > 0 ? 0 : 0.9);
    B.box(s * 0 , 0, 0, 1.1, 2.1, 0.06, { mat: body, collide: s < 0 });
    B.pop();
    B.box(s * 1.0, 0.95, 3.27, 0.36, 0.16, 0.03, { mat: 'p_lens_clear', collide: false });              // headlights
    B.box(s * 1.0, 1.0, -3.43, 0.16, 0.3, 0.03, { mat: 'p_lens_red', collide: false });
  }
  B.pop();
}
/** Steel fire escape stair against a wall: flight from (xb, 0) rising along -x to the top landing; z0 = wall face, outward +z. */
export function fireEscape(B, xb, z0, y1, len, w = 1.2) {
  const xt = xb - len, zc = z0 + 0.15 + w / 2;
  B.stairs({ x: (xb + xt) / 2, z: zc, w, len, y0: 0, y1, dir: '-x', mat: 'p_galv', tread: 'grate', rail: 'right', railMat: 'p_galv' });
  return { xt, zc };
}

// ------------------------------------------------------------------------------------------------ out-of-bounds facades
/** A building front along the line (x0,z0)->(x1,z1) facing its LEFT side. o = { h (height), floors, mat, trim, depth, shop: slot|null,
    awning: mat|null, seed, glass, gap }: storefront on the ground floor, floors of windows, a cornice; the mass is one collider. */
export function facade(B, x0, z0, x1, z1, o = {}) {
  const dx = x1 - x0, dz = z1 - z0, L = Math.hypot(dx, dz); if (L < 1) return;
  const th = Math.atan2(-dz, dx), H = o.h || 12, D = o.depth || 10, mat = o.mat || 'bk_brick_tan', trim = o.trim || 'bk_limestone';
  const r = rng(o.seed || 7), floors = o.floors || Math.max(2, Math.floor((H - 1) / 3.3)), gf = o.gf || 4.2;
  B.push(x0, o.y || 0, z0, th);
  // building mass (local x 0..L, the street side is local +z)
  B.box(L / 2, 0, -D / 2, L, H, D, { mat, mats: { t: 'bk_roof' } });
  // ground-floor storefront
  const bay = o.bay || 3.6, nb = Math.max(1, Math.round(L / bay)), bw = L / nb;
  B.box(L / 2, 0, 0.06, L, 0.5, 0.12, { mat: 'bk_granite', collide: false });
  if (o.shop !== false) {
    for (let i = 0; i < nb; i++) {
      const cx = bw * (i + 0.5), door = o.doors ? o.doors.includes(i) : (i % 3 === 1);
      B.box(cx, 0.5, 0.02, bw - 0.5, gf - 1.4, 0.03, { mat: door ? 'bk_glass_shop' : (o.glass || 'p_glass_dark'), collide: false, cast: false });
      if (door) B.box(cx, 0.03, 0.04, 1.0, 2.2, 0.04, { mat: 'bk_frame', collide: false });
      B.box(cx, gf - 0.9, 0.05, bw - 0.4, 0.06, 0.1, { mat: 'bk_frame', collide: false });
    }
    for (let i = 0; i <= nb; i++) B.box(bw * i, 0, 0.1, 0.42, gf, 0.2, { mat: trim, collide: false });
    B.box(L / 2, gf - 0.9, 0.12, L, 0.9, 0.24, { mat: o.band || 'bk_frame', collide: false });                  // sign band
    if (o.shop) sign(B, o.shop, L / 2, gf - 0.45, 0.25, Math.min(L - 1, 6), 0.9);
    if (o.awning) {
      const aw = Math.min(L - 1, o.awW || L - 1);
      B.push(L / 2, gf - 1.0, 0.3, 0); B.box(0, 0, 0.6, aw, 0.05, 1.3, { mat: o.awning, collide: false, ry: 0 }); B.pop();
      B.box(L / 2, gf - 1.35, 1.25, aw, 0.35, 0.03, { mat: o.awning, collide: false });
    }
  } else B.box(L / 2, 0.5, 0.03, L, gf - 0.5, 0.06, { mat: trim, collide: false });
  // upper floors
  const fh = (H - gf - 0.9) / Math.max(1, floors - 1), ww = o.winW || 1.3, wh = Math.min(2.0, fh - 1.2);
  const nw = Math.max(1, Math.floor(L / (o.winSp || 3.0))), sp = L / nw;
  for (let f = 0; f < floors - 1; f++) {
    const y = gf + 0.3 + f * fh + 0.9;
    B.box(L / 2, y - 0.95, 0.04, L, 0.14, 0.08, { mat: trim, collide: false });                                 // string course
    for (let i = 0; i < nw; i++) {
      const cx = sp * (i + 0.5), lit = r() < 0.12;
      B.box(cx, y, 0.015, ww, wh, 0.03, { mat: lit ? 'bk_glow_dim' : (r() < 0.3 ? 'p_glass_tint' : 'p_glass_dark'), collide: false, cast: false });
      B.box(cx, y - 0.08, 0.07, ww + 0.2, 0.08, 0.14, { mat: trim, collide: false });                          // sill
      B.box(cx, y + wh, 0.05, ww + 0.16, 0.16, 0.1, { mat: trim, collide: false });                             // lintel
      B.box(cx, y + wh / 2, 0.035, 0.05, wh, 0.04, { mat: 'bk_frame', collide: false });
      if (r() < 0.25) B.box(cx + (r() - 0.5) * 0.3, y + 0.15, 0.06, ww * 0.42, wh - 0.3, 0.02, { mat: r() < .5 ? 'p_fab_beige' : 'p_fab_grey', collide: false, cast: false });   // blind / curtain
      if (o.ac && r() < 0.12) B.prop('ac_unit', cx, y - 0.5, 0.35, { variant: 'wall', collide: false, cast: false });
    }
  }
  B.box(L / 2, H - 0.6, 0.18, L + 0.3, 0.45, 0.36, { mat: trim, collide: false });                              // cornice
  B.box(L / 2, H - 0.15, 0.1, L, 0.15, 0.2, { mat: trim, collide: false });
  B.pop();
}

// ------------------------------------------------------------------------------------------------ far skyline
const skyState = new WeakMap();
function skyMats(scene) {
  let st = skyState.get(scene); if (st) return st;
  const mk = (name, draw) => {
    const dt = new BABYLON.DynamicTexture(name, { width: 256, height: 512 }, scene, true);
    const g = dt.getContext(); draw(g); dt.update(true); dt.wrapU = dt.wrapV = 1;
    const m = new BABYLON.PBRMaterial(name, scene); m.albedoTexture = dt; m.metallic = 0.1; m.roughness = 0.7; m.environmentIntensity = 0.8;
    return m;
  };
  const r = rng(3);
  st = [
    mk('bk_sky_glass', g => { g.fillStyle = '#5b6a78'; g.fillRect(0, 0, 256, 512); for (let j = 0; j < 16; j++) for (let i = 0; i < 4; i++) { const v = 70 + r() * 50; g.fillStyle = `rgb(${v * .8},${v * .95},${v * 1.15})`; g.fillRect(i * 64 + 3, j * 32 + 4, 58, 26); } }),
    mk('bk_sky_stone', g => { g.fillStyle = '#a69c8a'; g.fillRect(0, 0, 256, 512); for (let j = 0; j < 16; j++) for (let i = 0; i < 4; i++) { const v = 40 + r() * 40; g.fillStyle = `rgb(${v},${v * 1.05},${v * 1.1})`; g.fillRect(i * 64 + 18, j * 32 + 8, 28, 18); } }),
    mk('bk_sky_brick', g => { g.fillStyle = '#7a5644'; g.fillRect(0, 0, 256, 512); for (let j = 0; j < 16; j++) for (let i = 0; i < 4; i++) { const v = 35 + r() * 35; g.fillStyle = `rgb(${v},${v * 1.05},${v * 1.12})`; g.fillRect(i * 64 + 14, j * 32 + 7, 36, 19); g.fillStyle = '#8b6a56'; g.fillRect(i * 64 + 10, j * 32 + 26, 44, 3); } }),
  ];
  skyState.set(scene, st); scene.onDisposeObservable.addOnce(() => skyState.delete(scene));
  return st;
}
/** list: [[x, z, w, d, h, kind 0 glass | 1 stone | 2 brick], ...]; one mesh per kind; a tile = 16 m wide x 32 m tall (4 x 16 windows). */
export function skyline(B, list) {
  const mats = skyMats(B.scene), G = [new Geo(), new Geo(), new Geo()], roof = new Geo();
  for (const [x, z, w, d, h, k] of list) {
    const g = G[k], x0 = x - w / 2, x1 = x + w / 2, z0 = z - d / 2, z1 = z + d / 2, U = 16, V = 32;
    g.quad([x0, 0, z0], [x1, 0, z0], [x1, h, z0], [x0, h, z0], [0, 0, -1], [0, 0, w / U, 0, w / U, h / V, 0, h / V]);
    g.quad([x1, 0, z1], [x0, 0, z1], [x0, h, z1], [x1, h, z1], [0, 0, 1], [0, 0, w / U, 0, w / U, h / V, 0, h / V]);
    g.quad([x0, 0, z1], [x0, 0, z0], [x0, h, z0], [x0, h, z1], [-1, 0, 0], [0, 0, d / U, 0, d / U, h / V, 0, h / V]);
    g.quad([x1, 0, z0], [x1, 0, z1], [x1, h, z1], [x1, h, z0], [1, 0, 0], [0, 0, d / U, 0, d / U, h / V, 0, h / V]);
    roof.quad([x0, h, z1], [x1, h, z1], [x1, h, z0], [x0, h, z0], [0, 1, 0], [0, 0, 1, 0, 1, 1, 0, 1]);
  }
  B.push();                                    // list coordinates are in the current frame (the map's local plan)
  G.forEach((g, i) => { const m = g.mesh('bk_skyline' + i, B.scene, mats[i]); if (m) B.mesh(m, { merge: false, collide: 'none', cast: false, receive: false }); });
  const rm = roof.mesh('bk_skyroof', B.scene, B.mat('bk_roof')); if (rm) B.mesh(rm, { merge: false, collide: 'none', cast: false, receive: false });
  B.pop();
}
