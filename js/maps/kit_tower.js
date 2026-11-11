/* LIVE FIRE — kit for the "tower" map (Meridian Tower): extra library materials, floor / ceiling tiling, glass partitions,
   curtain wall, walls with skirting and door leaves, signage atlas, and the night skyline seen through the windows.
   Exports:
     TW_MATS                      extra library materials (tw_*), registered into gfx/materials.js MATERIALS at import
     tileRects(x0, z0, x1, z1, zones, def) -> [{ x0, z0, x1, z1, mat }]   non-overlapping cover of a rectangle: zones
                                  [{ x0, z0, x1, z1, mat }] (later zones win, mat null = hole), def = material elsewhere
     slabs(B, rects, y0, y1, o)   boxes for each rect (floors, ceilings, plenum slabs)
     wallS(B, x0, z0, x1, z1, o)  B.wall + skirting on both faces + door leaves (opening.leaf = { v, open, flip })
     glassWall(B, x0, z0, x1, z1, o)   aluminium-framed glass partition with doors (o.doors = [{ at, w, h, leaf, open, flip }])
     curtainWall(B, z, x0, x1, y, h, side)   facade glass + mullions + transoms + perimeter convector casing
     signMats(scene) / sign(B, slot, x, y, z, w, h, ry, glow) / flushSigns(B)   signage atlas quads (batched; original, fictional names)
     troffer(B, x, yc, z, on, warm) / strip(B, x, yc, z, ry, on) / door(B, x, y, z, ry, { v, w, h, open, t, frame, double })   box-built fittings
     skyline(B, o)                night city around the tower: street grid 128 m below, blocks of towers with window grids
   All geometry goes through the MapBuilder (merged); the skyline and its materials are per scene. */
import { MATERIALS } from '../gfx/materials.js';

// ------------------------------------------------------------------------------------------------ materials
const PM = (surf, set, scale, o) => Object.assign({ surf, set, tex: set ? 'assets/textures/' + set : null, scale }, o);
export const TW_MATS = {
  tw_carpet31: PM('carpet', 'carpet', .6, { color: '#3a3f47', desat: .85, macro: .1, por: 1, col: [.23, .25, .28], proc: 'noise' }),
  tw_carpet32: PM('carpet', 'carpet', .6, { color: '#4d4740', desat: .85, macro: .1, por: 1, col: [.3, .28, .25], proc: 'noise' }),
  tw_carpet_exec: PM('carpet', 'carpet', .6, { color: '#242d3b', desat: .9, macro: .08, por: 1, col: [.14, .18, .23], proc: 'noise' }),
  tw_raised: PM('tile', 'tile_floor', 2.4, { color: '#9da1a4', desat: .9, macro: .05, rough: .9, por: .1, col: [.62, .63, .64], proc: 'tile' }),
  tw_lobbystone: PM('tile', 'tile_floor', 3.0, { color: '#8f8a82', desat: .5, macro: .06, rough: .7, por: .1, col: [.56, .54, .51], proc: 'tile' }),
  tw_veneer: PM('wood', 'wood_dark', 2.0, { color: '#5a3e29', desat: .2, macro: .06, rough: .6, por: .3, col: [.35, .24, .16], proc: 'wood' }),
  tw_oak: PM('wood', 'wood_floor', 1.7, { color: '#8a6d4c', desat: .2, macro: .06, rough: .7, por: .3, col: [.54, .42, .3], proc: 'wood' }),
  tw_wall: PM('plaster', 'plaster_white', 2.0, { color: '#c9c6bf', desat: .7, macro: .06, anti: 1, por: .5, col: [.79, .78, .75], proc: 'noise' }),
  tw_wall_warm: PM('plaster', 'plaster_white', 2.0, { color: '#c4b9a6', desat: .6, macro: .06, anti: 1, por: .5, col: [.77, .73, .65], proc: 'noise' }),
  tw_wall_grey: PM('plaster', 'plaster_white', 2.0, { color: '#8e9296', desat: .8, macro: .08, anti: 1, por: .5, col: [.56, .57, .59], proc: 'noise' }),
  tw_stair_wall: PM('concrete', 'concrete_panels', 2.4, { color: '#b9b4a6', desat: .7, macro: .1, por: .6, col: [.72, .7, .65], proc: 'tile' }),
  tw_stone_end: PM('concrete', 'concrete_wall', 2.5, { color: '#9e978b', desat: .6, macro: .14, anti: 1, por: .6, col: [.62, .59, .55], proc: 'noise' }),
  tw_mullion: PM('metal', 'steel', 1.5, { color: '#2f2e2c', desat: 1, rough: .55, metal: .8, macro: .03, por: .02, col: [.18, .18, .17], proc: 'metal' }),
  tw_alu: PM('metal', 'steel', 1.5, { color: '#a8acb0', desat: 1, rough: .5, metal: .9, macro: .03, por: .02, col: [.65, .67, .69], proc: 'metal' }),
  tw_skirt: PM('metal', 'painted_metal', 2.0, { color: '#2a2b2d', desat: 1, rough: .6, macro: .04, por: .1, col: [.16, .16, .17], proc: 'metal' }),
  tw_case: PM('metal', 'painted_metal', 2.0, { color: '#d6d5d0', desat: 1, rough: .55, macro: .04, por: .1, col: [.84, .83, .81], proc: 'metal' }),
  tw_steel_door: PM('metal', 'painted_metal', 2.0, { color: '#5d6a6f', desat: 1, rough: .55, macro: .06, por: .1, col: [.36, .41, .43], proc: 'metal' }),
  tw_fascia: PM('plaster', 'plaster_white', 2.0, { color: '#dedbd4', desat: .8, macro: .04, por: .4, col: [.87, .86, .83], proc: 'noise' }),
};
for (const k in TW_MATS) if (!MATERIALS[k]) MATERIALS[k] = TW_MATS[k];

// ------------------------------------------------------------------------------------------------ rectangle tiling
export function tileRects(x0, z0, x1, z1, zones, def) {
  const xs = new Set([x0, x1]), zs = new Set([z0, z1]);
  const cl = (v, a, b) => Math.max(a, Math.min(b, v));
  for (const r of zones) { xs.add(cl(r.x0, x0, x1)); xs.add(cl(r.x1, x0, x1)); zs.add(cl(r.z0, z0, z1)); zs.add(cl(r.z1, z0, z1)); }
  const X = [...xs].sort((a, b) => a - b), Z = [...zs].sort((a, b) => a - b);
  const nx = X.length - 1, nz = Z.length - 1, cell = [];
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const cx = (X[i] + X[i + 1]) / 2, cz = (Z[j] + Z[j + 1]) / 2;
    let m = def;
    for (const r of zones) if (cx > r.x0 && cx < r.x1 && cz > r.z0 && cz < r.z1) m = r.mat;
    cell[j * nx + i] = m;
  }
  // runs along x per row, then merge identical runs of consecutive rows
  let open = new Map(); const out = [];
  for (let j = 0; j < nz; j++) {
    const runs = [];
    for (let i = 0; i < nx;) {
      const m = cell[j * nx + i]; let k = i + 1;
      while (k < nx && cell[j * nx + k] === m) k++;
      if (m != null && X[k] - X[i] > 1e-6 && Z[j + 1] - Z[j] > 1e-6) runs.push({ x0: X[i], x1: X[k], mat: m });
      i = k;
    }
    const next = new Map();
    for (const r of runs) {
      const key = r.x0 + '|' + r.x1 + '|' + r.mat, prev = open.get(key);
      if (prev && Math.abs(prev.z1 - Z[j]) < 1e-6) { prev.z1 = Z[j + 1]; next.set(key, prev); }
      else { const q = { x0: r.x0, x1: r.x1, z0: Z[j], z1: Z[j + 1], mat: r.mat }; out.push(q); next.set(key, q); }
    }
    open = next;
  }
  return out;
}
/** Boxes between y0 and y1 for every rect; o.mats(rect) -> per-face mats, o.collide. */
export function slabs(B, rects, y0, y1, o = {}) {
  for (const r of rects) {
    if (r.x1 - r.x0 < 1e-3 || r.z1 - r.z0 < 1e-3) continue;
    B.box((r.x0 + r.x1) / 2, y0, (r.z0 + r.z1) / 2, r.x1 - r.x0, y1 - y0, r.z1 - r.z0,
      { mat: o.side || r.mat, mats: o.face === 'b' ? { b: r.mat } : { t: r.mat }, collide: o.collide !== false, cast: o.cast !== false, skip: o.skip });
  }
}

// ------------------------------------------------------------------------------------------------ walls
const segs = (L, ops) => {   // solid spans of a wall of length L between full-height... openings that start at the floor
  const o = ops.filter(q => !(q.y > 0.01)).map(q => [Math.max(0, q.at - (q.w || 1.2) / 2), Math.min(L, q.at + (q.w || 1.2) / 2)]).sort((a, b) => a[0] - b[0]);
  const out = []; let u = 0;
  for (const [a, b] of o) { if (a > u + 0.02) out.push([u, a]); u = Math.max(u, b); }
  if (u < L - 0.02) out.push([u, L]);
  return out;
};
/** A wall with skirting boards on both faces and optional door leaves. o = B.wall options + { skirt: mat|false, sk2 (other side),
    noSkirt: 'l'|'r' }; an opening may carry leaf: { v: 'wood'|'white'|'metal'|'glass'|'double'|'steel', open: deg, flip } */
export function wallS(B, x0, z0, x1, z1, o = {}) {
  const dx = x1 - x0, dz = z1 - z0, L = Math.hypot(dx, dz); if (L < 1e-3) return [];
  const th = Math.atan2(-dz, dx), t = o.t || 0.12, y = o.y || 0;
  const ops = (o.openings || []).map(q => Object.assign({ w: 1.0, h: 2.1 }, q, { frame: q.leaf ? false : (q.frame === undefined ? 'tw_skirt' : q.frame) }));
  const ids = B.wall(x0, z0, x1, z1, Object.assign({ h: 2.95, t, mat: 'tw_wall' }, o, { openings: ops }));
  const sk = o.skirt === undefined ? 'tw_skirt' : o.skirt, sk2 = o.sk2 === undefined ? sk : o.sk2;
  B.push(x0, y, z0, th);
  for (const [a, b] of segs(L, ops)) {
    if (sk && o.noSkirt !== 'l') B.box((a + b) / 2, 0, t / 2 + 0.008, b - a, 0.1, 0.016, { mat: sk, collide: false, cast: false });
    if (sk2 && o.noSkirt !== 'r') B.box((a + b) / 2, 0, -t / 2 - 0.008, b - a, 0.1, 0.016, { mat: sk2, collide: false, cast: false });
  }
  B.pop();
  for (const q of ops) if (q.leaf) {
    const ux = dx / L, uz = dz / L, px = x0 + ux * q.at, pz = z0 + uz * q.at;
    const v = q.leaf.v || 'wood';
    door(B, px, y + (q.y || 0), pz, th + (q.leaf.flip ? Math.PI : 0), { v, w: q.w - 0.1, h: Math.min(2.1, q.h - 0.05), open: q.leaf.open || 0, t });
  }
  return ids;
}
/** Aluminium-framed glass partition (local +x from start to end). o = { y, h, doors: [{ at, w, h, leaf, open, flip }], post, frost, sill } */
export function glassWall(B, x0, z0, x1, z1, o = {}) {
  const dx = x1 - x0, dz = z1 - z0, L = Math.hypot(dx, dz); if (L < 1e-3) return;
  const th = Math.atan2(-dz, dx), y = o.y || 0, h = o.h || 2.95, post = o.post || 1.25, fm = o.frame || 'tw_alu';
  const doors = (o.doors || []).map(d => Object.assign({ w: 1.0, h: 2.15 }, d)).sort((a, b) => a.at - b.at);
  B.push(x0, y, z0, th);
  const spans = []; let u = 0;
  for (const d of doors) { const a = d.at - d.w / 2, b = d.at + d.w / 2; if (a > u) spans.push([u, a]); u = b; }
  if (u < L) spans.push([u, L]);
  for (const [a, b] of spans) {
    const w = b - a, c = (a + b) / 2;
    B.box(c, 0, 0, w, 0.09, 0.09, { mat: fm });                                          // floor track
    B.box(c, 0.09, 0, w, h - 0.15, 0.014, { mat: 'glass', surf: 'glass', cast: false });  // pane
    if (o.frost !== false) for (const s of [-1, 1]) B.box(c, 1.0, s * 0.012, w, 0.22, 0.004, { mat: 'glass_frosted', collide: false, cast: false });
    const n = Math.max(1, Math.round(w / post));
    for (let i = 0; i <= n; i++) B.box(a + w * i / n, 0, 0, 0.045, h, 0.08, { mat: fm, collide: false });
  }
  B.box(L / 2, h - 0.06, 0, L, 0.06, 0.1, { mat: fm, collide: false });                // head track
  for (const d of doors) {
    if (h - d.h > 0.1) { B.box(d.at, d.h, 0, d.w, 0.06, 0.1, { mat: fm, collide: false }); B.box(d.at, d.h + 0.06, 0, d.w, h - d.h - 0.12, 0.014, { mat: 'glass', surf: 'glass', cast: false }); }
    for (const s of [-1, 1]) B.box(d.at + s * (d.w / 2 + 0.0), 0, 0, 0.05, d.h, 0.1, { mat: fm, collide: false });
  }
  B.pop();
  for (const d of doors) if (d.leaf !== false) {
    const ux = dx / L, uz = dz / L, px = x0 + ux * d.at, pz = z0 + uz * d.at;
    const dbl = d.w > 1.4;
    door(B, px, y, pz, th + (d.flip ? Math.PI : 0), { v: 'glass', double: dbl, w: d.w - 0.1, h: Math.min(2.1, d.h - 0.03), open: d.open == null ? 90 : d.open, frame: false });
  }
}
/** Facade along z = zf (side = +1 north facade, -1 south): glass, mullions every 1.5 m, transoms, convector casing. */
export function curtainWall(B, zf, x0, x1, y, h, side, o = {}) {
  const inn = -side;                                    // direction pointing into the building
  B.box((x0 + x1) / 2, y, zf, x1 - x0, h, 0.03, { mat: 'glass', surf: 'glass', cast: false });
  const n = Math.round((x1 - x0) / 1.5);
  for (let i = 0; i <= n; i++) B.box(x0 + (x1 - x0) * i / n, y, zf + inn * 0.07, 0.06, h, 0.12, { mat: 'tw_mullion', collide: false });
  B.box((x0 + x1) / 2, y, zf + inn * 0.05, x1 - x0, 0.07, 0.1, { mat: 'tw_mullion', collide: false });          // sill rail
  B.box((x0 + x1) / 2, y + h - 0.08, zf + inn * 0.05, x1 - x0, 0.08, 0.1, { mat: 'tw_mullion', collide: false }); // head rail
  B.box((x0 + x1) / 2, y + 2.2, zf + inn * 0.035, x1 - x0, 0.05, 0.07, { mat: 'tw_mullion', collide: false });   // transom
  if (o.convector !== false) {
    // perimeter fan-coil casing (realistic office detail), with gaps where something interrupts it
    const gaps = (o.gaps || []).slice().sort((a, b) => a[0] - b[0]);
    let u = x0 + 0.05;
    const run = (a, b) => { if (b - a < 0.3) return;
      B.box((a + b) / 2, y, zf + inn * 0.3, b - a, 0.42, 0.34, { mat: 'tw_case', mats: { t: 'tw_case' } });
      B.box((a + b) / 2, y + 0.42, zf + inn * 0.3, b - a - 0.04, 0.006, 0.2, { mat: 'grate', collide: false, cast: false });
      B.box((a + b) / 2, y, zf + inn * 0.472, b - a, 0.06, 0.012, { mat: 'tw_skirt', collide: false, cast: false });
    };
    for (const [a, b] of gaps) { run(u, a); u = Math.max(u, b); }
    run(u, x1 - 0.05);
  }
}

// ------------------------------------------------------------------------------------------------ signage atlas
const SIGN_W = 2048, SIGN_H = 1024;
const SLOTS = {};      // name -> [u0, v0, u1, v1] in canvas pixels
const signState = new WeakMap();
const SANS = 'Arial, Helvetica, "Liberation Sans", sans-serif';
function drawSigns(g) {
  let cx = 0, cy = 0, rowH = 0;
  const slot = (name, w, h, fn) => {
    if (cx + w > SIGN_W) { cx = 0; cy += rowH + 4; rowH = 0; }
    g.save(); g.translate(cx, cy); g.beginPath(); g.rect(0, 0, w, h); g.clip(); fn(g, w, h); g.restore();
    SLOTS[name] = [cx, cy, cx + w, cy + h]; cx += w + 4; rowH = Math.max(rowH, h);
  };
  const txt = (s, x, y, size, col, o = {}) => {
    g.font = (o.weight || 'bold') + ' ' + size + 'px ' + (o.font || SANS); g.textAlign = o.align || 'center'; g.textBaseline = 'middle'; g.fillStyle = col;
    if (o.ls) { try { g.letterSpacing = o.ls + 'px'; } catch (e) { /* old canvas */ } }
    if (o.maxW) { const m = g.measureText(s).width; if (m > o.maxW) { g.save(); g.translate(x, y); g.scale(o.maxW / m, 1); g.fillText(s, 0, 0); g.restore(); if (o.ls) g.letterSpacing = '0px'; return; } }
    g.fillText(s, x, y); if (o.ls) { try { g.letterSpacing = '0px'; } catch (e) { /* */ } }
  };
  // company wordmark (fictional): brushed-brass letters on transparent
  slot('logo', 1024, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    const grd = g.createLinearGradient(0, 40, 0, 210); grd.addColorStop(0, '#e9d6a4'); grd.addColorStop(.5, '#b8955a'); grd.addColorStop(1, '#8d6a37');
    g.strokeStyle = grd; g.lineWidth = 12; g.beginPath(); g.arc(128, 128, 82, 0, Math.PI * 2); g.stroke();
    g.fillStyle = grd; g.beginPath(); g.moveTo(128, 62); g.lineTo(172, 172); g.lineTo(128, 146); g.lineTo(84, 172); g.closePath(); g.fill();
    txt('HALDEN & ROOK', 610, 112, 92, grd, { ls: 6, maxW: 740 });
    txt('CAPITAL  ADVISORY', 610, 196, 40, '#c9b07a', { weight: 'normal', ls: 14, maxW: 700 });
  });
  slot('tower', 1024, 160, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    txt('MERIDIAN TOWER', w / 2, 62, 84, '#d9dcdf', { ls: 18, maxW: w - 40 });
    txt('425 HARROW STREET', w / 2, 132, 34, '#9aa0a6', { weight: 'normal', ls: 10 });
  });
  const lvl = (n) => slot('lvl' + n, 256, 256, (g, w, h) => {
    g.fillStyle = '#1d2024'; g.fillRect(0, 0, w, h);
    txt(String(n), w / 2, 112, 170, '#e8e6e0');
    txt('LEVEL', w / 2, 220, 40, '#b9b6ae', { ls: 8 });
  });
  lvl(31); lvl(32);
  const stair = (name, letter, n) => slot(name, 384, 256, (g, w, h) => {
    g.fillStyle = '#e7e3d8'; g.fillRect(0, 0, w, h); g.fillStyle = '#1b1c1e'; g.fillRect(10, 10, w - 20, h - 20);
    txt('STAIR ' + letter, w / 2, 70, 64, '#f2efe6');
    txt('LEVEL ' + n, w / 2, 140, 44, '#d4d0c6');
    txt('ROOF ACCESS: NO   GROUND: 1-31', w / 2, 205, 22, '#bdb9ae', { weight: 'normal' });
  });
  stair('stA31', 'A', 31); stair('stA32', 'A', 32); stair('stB31', 'B', 31); stair('stB32', 'B', 32);
  slot('exit', 256, 112, (g, w, h) => {
    g.fillStyle = '#0f7a3a'; g.fillRect(0, 0, w, h);
    txt('EXIT', 150, h / 2 + 2, 70, '#f4fff6');
    g.fillStyle = '#f4fff6'; g.beginPath(); g.moveTo(26, h / 2); g.lineTo(62, h / 2 - 26); g.lineTo(62, h / 2 + 26); g.closePath(); g.fill();
  });
  const plate = (name, line1, line2, w = 768, bg = '#25282c', fg = '#ecebe7') => slot(name, w, 160, (g, W2, H2) => {
    g.fillStyle = bg; g.fillRect(0, 0, W2, H2); g.fillStyle = 'rgba(255,255,255,.08)'; g.fillRect(0, 0, W2, 6);
    txt(line1, W2 / 2, line2 ? 62 : H2 / 2, 58, fg, { ls: 4, maxW: W2 - 30 });
    if (line2) txt(line2, W2 / 2, 122, 28, '#b7b5ae', { weight: 'normal', ls: 3, maxW: W2 - 30 });
  });
  plate('server', 'DATA ROOM 31-02', 'AUTHORISED PERSONNEL ONLY  ·  CLEAN AGENT FIRE SUPPRESSION');
  plate('noc', 'NETWORK OPERATIONS', 'NOC  ·  24 / 7');
  plate('exec', 'EXECUTIVE SUITE', 'BY APPOINTMENT');
  plate('board', 'BOARDROOM', null, 512);
  plate('freight', 'FREIGHT ELEVATOR', 'RATED LOAD 2500 KG  ·  NO PASSENGERS', 768, '#3a3524', '#f3e7b9');
  plate('security', 'SECURITY', 'ALL VISITORS MUST SIGN IN', 640);
  plate('training', 'TRAINING 31-A', null, 512);
  plate('workshop', 'IT WORKSHOP', 'ESD PROTECTED AREA', 640);
  plate('mail', 'MAIL & STORES', null, 512);
  plate('break', 'STAFF KITCHEN', null, 512);
  plate('dining', 'EXECUTIVE DINING', null, 512);
  plate('library', 'LIBRARY', null, 512);
  plate('ceo', 'OFFICE OF THE CHAIR', null, 640);
  plate('wcm', 'WASHROOM', 'MEN', 384); plate('wcw', 'WASHROOM', 'WOMEN', 384);
  plate('janitor', 'JANITOR', null, 384);
  plate('riser', 'ELEC. RISER 31', 'KEEP CLEAR', 384, '#5a1d18', '#f2e3df');
  // NOC video wall: graphs and a map (emissive)
  slot('vwall', 1024, 384, (g, w, h) => {
    g.fillStyle = '#05080c'; g.fillRect(0, 0, w, h);
    const r = (s => () => (s = (s * 16807) % 2147483647) / 2147483647)(7);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) {
      const x = i * 256 + 6, y = j * 192 + 6, W2 = 244, H2 = 180;
      g.fillStyle = '#0b1622'; g.fillRect(x, y, W2, H2); g.strokeStyle = '#1e3b55'; g.lineWidth = 2; g.strokeRect(x, y, W2, H2);
      const k = (i + j * 4) % 4;
      if (k === 0) { g.strokeStyle = '#38d0ff'; g.lineWidth = 3; g.beginPath(); for (let t = 0; t < 40; t++) { const px = x + 10 + t * 5.6, py = y + 120 - 60 * r() - t; t ? g.lineTo(px, py) : g.moveTo(px, py); } g.stroke(); }
      if (k === 1) { for (let t = 0; t < 14; t++) { const bh = 20 + 120 * r(); g.fillStyle = t % 5 === 0 ? '#ff6a3a' : '#2fe08a'; g.fillRect(x + 12 + t * 16, y + H2 - 12 - bh, 10, bh); } }
      if (k === 2) { g.fillStyle = '#123'; g.fillRect(x + 8, y + 8, W2 - 16, H2 - 16); g.strokeStyle = '#3b8fd0'; g.lineWidth = 1; for (let t = 0; t < 9; t++) { g.beginPath(); g.moveTo(x + 8 + r() * 228, y + 8 + r() * 164); g.lineTo(x + 8 + r() * 228, y + 8 + r() * 164); g.stroke(); } for (let t = 0; t < 12; t++) { g.fillStyle = r() > .8 ? '#ff4040' : '#5cf'; g.fillRect(x + 12 + r() * 220, y + 12 + r() * 156, 5, 5); } }
      if (k === 3) { g.font = '14px monospace'; g.textAlign = 'left'; for (let t = 0; t < 10; t++) { g.fillStyle = r() > .85 ? '#ffb347' : '#7fe0a0'; g.fillText((r() > .5 ? 'OK  ' : 'UP  ') + 'core-sw' + Math.floor(r() * 90) + '  ' + Math.floor(r() * 999) + ' Mb/s', x + 10, y + 20 + t * 16); } }
    }
  });
  slot('hallLantern', 256, 64, (g, w, h) => { g.fillStyle = '#0a0a0a'; g.fillRect(0, 0, w, h); txt('▲ 31 ▼', w / 2, h / 2 + 2, 40, '#ffb347'); });
  slot('hallLantern2', 256, 64, (g, w, h) => { g.fillStyle = '#0a0a0a'; g.fillRect(0, 0, w, h); txt('▲ 32 ▼', w / 2, h / 2 + 2, 40, '#ffb347'); });
  slot('cardreader', 64, 96, (g, w, h) => { g.fillStyle = '#1a1a1a'; g.fillRect(0, 0, w, h); g.fillStyle = '#2a2a2a'; g.fillRect(8, 8, 48, 60); g.fillStyle = '#e53a2a'; g.fillRect(24, 76, 16, 8); });
  slot('art1', 512, 384, (g, w, h) => {      // abstract artwork (original)
    g.fillStyle = '#e9e4da'; g.fillRect(0, 0, w, h);
    const cols = ['#24425f', '#c2562f', '#d9b25a', '#5f7f7a', '#1c1c1e'];
    for (let i = 0; i < 9; i++) { g.fillStyle = cols[i % 5]; g.globalAlpha = .85; g.fillRect(30 + (i * 53) % 400, 30 + (i * 97) % 250, 60 + (i * 31) % 160, 30 + (i * 17) % 120); }
    g.globalAlpha = 1; g.strokeStyle = '#1c1c1e'; g.lineWidth = 6; g.beginPath(); g.arc(330, 190, 90, 0.4, 4.6); g.stroke();
  });
  slot('art2', 384, 512, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, 0, h); grd.addColorStop(0, '#13293d'); grd.addColorStop(.55, '#c46d3b'); grd.addColorStop(1, '#2b1d17');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(20,16,14,.85)'; for (let i = 0; i < 9; i++) { const bw = 24 + (i * 13) % 30, bh = 80 + (i * 61) % 220; g.fillRect(i * 42, h - 60 - bh, bw, bh + 60); }
  });
  slot('map', 512, 384, (g, w, h) => {      // floor evacuation plan
    g.fillStyle = '#f2f0ea'; g.fillRect(0, 0, w, h); g.strokeStyle = '#333'; g.lineWidth = 4; g.strokeRect(30, 70, w - 60, h - 110);
    g.strokeRect(w / 2 - 110, h / 2 - 15, 220, 50); g.fillStyle = '#d33'; g.beginPath(); g.arc(w / 2 + 40, h / 2 + 70, 9, 0, 7); g.fill();
    g.fillStyle = '#0a7a3a'; g.fillRect(w / 2 - 140, h / 2 - 8, 24, 36); g.fillRect(w / 2 + 116, h / 2 - 8, 24, 36);
    txt('EVACUATION PLAN', w / 2, 36, 32, '#222'); txt('YOU ARE HERE', w / 2 + 40, h / 2 + 98, 18, '#d33');
  });
}
export function signMats(scene) {
  let st = signState.get(scene);
  if (st) return st;
  const BB = BABYLON;
  const dt = new BB.DynamicTexture('tw_signs', { width: SIGN_W, height: SIGN_H }, scene, true);
  dt.hasAlpha = true;
  const g = dt.getContext(); g.clearRect(0, 0, SIGN_W, SIGN_H); drawSigns(g); dt.update(true);
  const lit = new BB.PBRMaterial('tw_sign', scene);
  lit.albedoTexture = dt; lit.useAlphaFromAlbedoTexture = true; lit.transparencyMode = BB.PBRMaterial.PBRMATERIAL_ALPHATEST; lit.alphaCutOff = .45;
  lit.metallic = .15; lit.roughness = .45;
  const glow = new BB.PBRMaterial('tw_glow', scene);
  glow.albedoColor = new BB.Color3(0, 0, 0); glow.emissiveTexture = dt; glow.emissiveColor = new BB.Color3(1, 1, 1); glow.emissiveIntensity = 1.6;
  glow.metallic = 0; glow.roughness = 1; glow.environmentIntensity = 0;
  st = { tex: dt, lit, glow };
  signState.set(scene, st);
  scene.onDisposeObservable.addOnce(() => signState.delete(scene));
  return st;
}
/** A sign quad (centre x, y, z, size w x h, facing ry: front = +z of the frame turned by ry). glow = emissive.
    Quads are batched per builder; flushSigns(B) at the end of the build turns them into two meshes (lit, glowing). */
const signBatch = new WeakMap();
export function sign(B, slot, x, y, z, w, h, ry = 0, glow = false) {
  const r = SLOTS[slot]; if (!r && !Object.keys(SLOTS).length) { signMats(B.scene); return sign(B, slot, x, y, z, w, h, ry, glow); }
  if (!r) { B.warn('tower: unknown sign ' + slot); return; }
  let bt = signBatch.get(B); if (!bt) { bt = { lit: new Geo(), glow: new Geo() }; signBatch.set(B, bt); }
  const u0 = r[0] / SIGN_W, u1 = r[2] / SIGN_W, v0 = 1 - r[3] / SIGN_H, v1 = 1 - r[1] / SIGN_H;
  const p = B.toWorld(x, y, z, {}), th = B.T.th + ry, c = Math.cos(th), sn = Math.sin(th), hw = w / 2, hh = h / 2;
  const P = (lx, ly) => [p.x + lx * c, p.y + ly, p.z - lx * sn];
  // seen from the front (+z of the sign), +x of the sign is on the viewer's left: u runs from +x to -x
  (glow ? bt.glow : bt.lit).quad(P(hw, -hh), P(-hw, -hh), P(-hw, hh), P(hw, hh), [sn, 0, c], [u0, v0, u1, v0, u1, v1, u0, v1]);
}
export function flushSigns(B) {
  const bt = signBatch.get(B); if (!bt) return;
  const S = signMats(B.scene);
  for (const [g, mat, nm] of [[bt.lit, S.lit, 'tw_signs'], [bt.glow, S.glow, 'tw_signs_glow']]) {
    const m = g.mesh(nm, B.scene, mat); if (m) B.mesh(m, { merge: false, collide: 'none', cast: false });
  }
  signBatch.delete(B);
}

// ------------------------------------------------------------------------------------------------ cheap fittings (B.box only)
/** Ceiling troffer (600 x 600) hanging under a ceiling at yc; on = lit. */
export function troffer(B, x, yc, z, on = true, warm = false) {
  B.box(x, yc - 0.035, z, 0.62, 0.035, 0.62, { mat: 'paint_white', collide: false, cast: false });
  B.box(x, yc - 0.042, z, 0.56, 0.007, 0.56, { mat: on ? (warm ? 'emissive_warm' : 'emissive_white') : 'p_lens_clear', collide: false, cast: false });
}
/** Surface strip light (1.2 m) along x (ry turns it). */
export function strip(B, x, yc, z, ry = 0, on = true) {
  B.box(x, yc - 0.05, z, 1.25, 0.05, 0.1, { mat: 'paint_white', ry, collide: false, cast: false });
  B.box(x, yc - 0.062, z, 1.18, 0.012, 0.07, { mat: on ? 'emissive_white' : 'p_lens_clear', ry, collide: false, cast: false });
}
const DOORMAT = { wood: 'p_wood_walnut', white: 'p_wood_white', metal: 'tw_steel_door', steel: 'p_stainless', glass: 'tw_alu', double: 'p_wood_walnut' };
/** A door in a wall opening (frame + leaf/leaves + levers), built from boxes. Origin = centre of the doorway on the wall line,
    the wall runs along local x; hinge at -x, the leaf opens toward +z by `open` degrees (double: two leaves). t = wall thickness. */
export function door(B, x, y, z, ry, o = {}) {
  const v = o.v || 'wood', W = o.w || 0.9, H = o.h || 2.1, t = o.t || 0.12, a = (o.open || 0) * Math.PI / 180, mat = DOORMAT[v] || 'p_wood_walnut';
  const fm = v === 'metal' || v === 'steel' || v === 'glass' ? 'tw_skirt' : 'p_wood_walnut';
  B.push(x, y, z, ry);
  if (o.frame !== false) { for (const s of [-1, 1]) B.box(s * (W / 2 + 0.03), 0, 0, 0.06, H + 0.03, t + 0.05, { mat: fm, collide: false }); B.box(0, H, 0, W + 0.12, 0.06, t + 0.05, { mat: fm, collide: false }); }
  const leaf = (hx, side, lw, ang) => {
    B.push(hx, 0, 0, side > 0 ? -ang : ang);
    const x0 = side > 0 ? lw / 2 : -lw / 2, far = side > 0 ? lw - 0.12 : -lw + 0.12;
    if (v === 'glass') {
      for (const [bx, by, bw, bh] of [[x0, 0, lw, 0.1], [x0, H - 0.1, lw, 0.1], [x0 - lw / 2 + 0.04, 0, 0.08, H], [x0 + lw / 2 - 0.04, 0, 0.08, H]]) B.box(bx, by, 0, bw, bh, 0.045, { mat, collide: false });
      B.box(x0, 0.1, 0, lw - 0.16, H - 0.2, 0.012, { mat: 'glass', surf: 'glass', cast: false });
      B.box(far, 0.75, 0.04, 0.03, 0.6, 0.03, { mat: 'p_chrome', collide: false }); B.box(far, 0.75, -0.04, 0.03, 0.6, 0.03, { mat: 'p_chrome', collide: false });
    } else {
      B.box(x0, 0, 0, lw - 0.01, H - 0.01, 0.045, { mat, surf: v === 'metal' || v === 'steel' ? 'metal' : 'wood' });
      if (v === 'wood' || v === 'double' || v === 'white') for (const [py, ph] of [[0.15, 0.85], [1.15, 0.8]]) for (const f of [-1, 1]) B.box(x0, py, f * 0.025, lw - 0.2, ph, 0.006, { mat, collide: false });
      if (v === 'metal' || v === 'steel') { B.box(x0, 1.5, 0.024, lw * 0.35, 0.4, 0.004, { mat: 'glass', collide: false, cast: false }); B.box(x0, 0.05, 0.024, lw - 0.06, 0.25, 0.004, { mat: 'p_stainless', collide: false }); }
      for (const f of [-1, 1]) { B.box(far, 0.98, f * 0.05, 0.05, 0.05, 0.05, { mat: 'p_chrome', collide: false }); B.box(far - (side > 0 ? 0.06 : -0.06), 0.99, f * 0.075, 0.14, 0.025, 0.025, { mat: 'p_chrome', collide: false }); }
    }
    B.pop();
  };
  if (v === 'double' || o.double) { leaf(-W / 2, 1, W / 2, a); leaf(W / 2, -1, W / 2, a); }
  else leaf(-W / 2, 1, W, a);
  B.pop();
}

// ------------------------------------------------------------------------------------------------ skyline
const skyState = new WeakMap();
function facadeTex(scene, kind, seed) {
  const BB = BABYLON, S = 1024, dt = new BB.DynamicTexture('tw_fac' + kind, { width: S, height: S }, scene, true);
  const g = dt.getContext();
  let s = seed; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const bays = kind === 2 ? 24 : 16, floors = 16, bw = S / bays, fh = S / floors;
  g.fillStyle = kind === 1 ? '#0b0a09' : '#07090c'; g.fillRect(0, 0, S, S);
  const warm = ['#ffcf8a', '#ffd9a3', '#ffc070', '#f5e2b8'], cool = ['#dfe9ff', '#cfe0ff', '#eef4ff', '#d8f0ff'];
  for (let f = 0; f < floors; f++) {
    const floorLit = r() < (kind === 1 ? .32 : .22), floorCool = r() < .7, fl = r() < .5;
    for (let b = 0; b < bays; b++) {
      const lit = floorLit ? r() < .8 : r() < .1;
      const x = b * bw + bw * (kind === 2 ? .06 : .12), y = f * fh + fh * (kind === 2 ? .1 : .22), w = bw * (kind === 2 ? .88 : .76), h = fh * (kind === 2 ? .82 : .6);
      if (lit) {
        const pal = kind === 1 ? warm : (floorCool ? cool : warm);
        g.fillStyle = pal[Math.floor(r() * pal.length)]; g.globalAlpha = .55 + r() * .45; g.fillRect(x, y, w, h);
        if (fl && r() < .3) { g.globalAlpha = .5; g.fillStyle = '#111'; g.fillRect(x, y + h * .55, w, h * .45); }   // blinds
      } else { g.globalAlpha = 1; g.fillStyle = kind === 2 ? '#0e1622' : '#0c1016'; g.fillRect(x, y, w, h); g.fillStyle = 'rgba(70,90,120,.10)'; g.fillRect(x, y, w, h * .3); }
      g.globalAlpha = 1;
    }
  }
  dt.update(true);
  dt.wrapU = dt.wrapV = BB.Texture.WRAP_ADDRESSMODE;
  return dt;
}
function skyMats(scene) {
  let st = skyState.get(scene); if (st) return st;
  const BB = BABYLON, mk = (name, tex, k) => {
    const m = new BB.PBRMaterial(name, scene);
    m.albedoColor = new BB.Color3(0.004, 0.005, 0.007); m.metallic = 0; m.roughness = 1; m.environmentIntensity = 0; m.directIntensity = 0;
    m.emissiveTexture = tex; m.emissiveColor = new BB.Color3(1, 1, 1); m.emissiveIntensity = k;
    return m;
  };
  const f0 = facadeTex(scene, 0, 11), f1 = facadeTex(scene, 1, 23), f2 = facadeTex(scene, 2, 37);
  // the street grid seen from 130 m: dark blocks, sodium-lit streets, car lights
  const S = 1024, gt = new BB.DynamicTexture('tw_streets', { width: S, height: S }, scene, true), g = gt.getContext();
  let s = 99; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  g.fillStyle = '#060606'; g.fillRect(0, 0, S, S);
  const cell = S / 4, road = cell * .22;
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    const x = i * cell + road / 2, y = j * cell + road / 2, w = cell - road;
    g.fillStyle = '#0d0d0f'; g.fillRect(x, y, w, w);
    for (let k = 0; k < 40; k++) { g.fillStyle = r() < .5 ? 'rgba(255,200,120,.5)' : 'rgba(200,220,255,.35)'; g.fillRect(x + r() * w, y + r() * w, 2, 2); }
  }
  for (let i = 0; i < 4; i++) {
    const c = i * cell;
    g.fillStyle = '#16120c'; g.fillRect(c - road / 2 + 2, 0, road - 4, S); g.fillRect(0, c - road / 2 + 2, S, road - 4);
    for (let t = 0; t < S; t += 22) {     // sodium street lamps both kerbs
      g.fillStyle = 'rgba(255,170,70,.95)'; g.fillRect(c - road / 2 + 4, t, 3, 3); g.fillRect(c + road / 2 - 7, t + 11, 3, 3);
      g.fillRect(t, c - road / 2 + 4, 3, 3); g.fillRect(t + 11, c + road / 2 - 7, 3, 3);
    }
    for (let t = 0; t < 30; t++) {        // cars: white heads one way, red tails the other
      const p = r() * S; g.fillStyle = 'rgba(255,250,235,.9)'; g.fillRect(c - road * .2, p, 2, 6); g.fillStyle = 'rgba(255,40,30,.9)'; g.fillRect(c + road * .12, p + 40, 2, 5);
      const q = r() * S; g.fillStyle = 'rgba(255,250,235,.9)'; g.fillRect(q, c - road * .2, 6, 2); g.fillStyle = 'rgba(255,40,30,.9)'; g.fillRect(q + 30, c + road * .12, 5, 2);
    }
  }
  gt.update(true); gt.wrapU = gt.wrapV = BB.Texture.WRAP_ADDRESSMODE;
  const roof = new BB.PBRMaterial('tw_roof', scene); roof.albedoColor = new BB.Color3(.012, .012, .014); roof.metallic = 0; roof.roughness = 1; roof.environmentIntensity = .4;
  const red = new BB.PBRMaterial('tw_redlight', scene); red.albedoColor = new BB.Color3(0, 0, 0); red.emissiveColor = new BB.Color3(1, .08, .05); red.emissiveIntensity = 6;
  st = { fac: [mk('tw_facA', f0, 1.05), mk('tw_facB', f1, 1.0), mk('tw_facC', f2, 1.1)], street: mk('tw_street', gt, 1.4), roof, red };
  skyState.set(scene, st); scene.onDisposeObservable.addOnce(() => skyState.delete(scene));
  return st;
}
class Geo { constructor() { this.p = []; this.n = []; this.u = []; this.i = []; }
  quad(a, b, c, d, n, uv) { const k = this.p.length / 3; this.p.push(...a, ...b, ...c, ...d); for (let q = 0; q < 4; q++) this.n.push(...n); this.u.push(...uv); this.i.push(k, k + 1, k + 2, k, k + 2, k + 3); }
  mesh(name, scene, mat) { if (!this.i.length) return null; const m = new BABYLON.Mesh(name, scene), vd = new BABYLON.VertexData(); vd.positions = this.p; vd.normals = this.n; vd.uvs = this.u; vd.indices = this.i; vd.applyToMesh(m, false); m.material = mat; return m; }
}
/** A box building: footprint centre (x, z), size w x d, from y0 to y1, facade kind (0..2) with a random u offset. */
function building(G, R, x, z, w, d, y0, y1, uo) {
  const tw = [48, 48, 72], th = 64;
  const x0 = x - w / 2, x1 = x + w / 2, z0 = z - d / 2, z1 = z + d / 2, v0 = (y0 + 128) / th, v1 = (y1 + 128) / th;
  const k = G.k, T = tw[k];
  // faces (outward normals); u along the face
  G.f[k].quad([x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [0, 0, -1], [uo, v0, uo + w / T, v0, uo + w / T, v1, uo, v1]);
  G.f[k].quad([x1, y0, z1], [x0, y0, z1], [x0, y1, z1], [x1, y1, z1], [0, 0, 1], [uo + .3, v0, uo + .3 + w / T, v0, uo + .3 + w / T, v1, uo + .3, v1]);
  G.f[k].quad([x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0], [1, 0, 0], [uo + .6, v0, uo + .6 + d / T, v0, uo + .6 + d / T, v1, uo + .6, v1]);
  G.f[k].quad([x0, y0, z1], [x0, y0, z0], [x0, y1, z0], [x0, y1, z1], [-1, 0, 0], [uo + .9, v0, uo + .9 + d / T, v0, uo + .9 + d / T, v1, uo + .9, v1]);
  G.roof.quad([x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], [0, 1, 0], [0, 0, 1, 0, 1, 1, 0, 1]);
}
function cube(G, x, y, z, w, h, d) {   // small dark box (rooftop plant, parapets)
  const x0 = x - w / 2, x1 = x + w / 2, z0 = z - d / 2, z1 = z + d / 2, y1 = y + h, uv = [0, 0, 1, 0, 1, 1, 0, 1];
  G.roof.quad([x0, y, z0], [x1, y, z0], [x1, y1, z0], [x0, y1, z0], [0, 0, -1], uv); G.roof.quad([x1, y, z1], [x0, y, z1], [x0, y1, z1], [x1, y1, z1], [0, 0, 1], uv);
  G.roof.quad([x1, y, z0], [x1, y, z1], [x1, y1, z1], [x1, y1, z0], [1, 0, 0], uv); G.roof.quad([x0, y, z1], [x0, y, z0], [x0, y1, z0], [x0, y1, z1], [-1, 0, 0], uv);
  G.roof.quad([x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], [0, 1, 0], uv);
}
function lamp(G, x, y, z, s) { const h = s / 2;
  G.red.quad([x - h, y, z - h], [x + h, y, z - h], [x + h, y + s, z - h], [x - h, y + s, z - h], [0, 0, -1], [0, 0, 1, 0, 1, 1, 0, 1]);
  G.red.quad([x + h, y, z + h], [x - h, y, z + h], [x - h, y + s, z + h], [x + h, y + s, z + h], [0, 0, 1], [0, 0, 1, 0, 1, 1, 0, 1]);
  G.red.quad([x + h, y, z - h], [x + h, y, z + h], [x + h, y + s, z + h], [x + h, y + s, z - h], [1, 0, 0], [0, 0, 1, 0, 1, 1, 0, 1]);
  G.red.quad([x - h, y, z + h], [x - h, y, z - h], [x - h, y + s, z - h], [x - h, y + s, z + h], [-1, 0, 0], [0, 0, 1, 0, 1, 1, 0, 1]);
}
/** The city: o = { keep: [x0, z0, x1, z1] (no buildings there), street: y of the street, seed } */
export function skyline(B, o = {}) {
  const scene = B.scene, M = skyMats(scene);
  let s = o.seed || 4242; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const G = { f: [new Geo(), new Geo(), new Geo()], roof: new Geo(), red: new Geo(), street: new Geo(), k: 0 };
  const ys = o.street == null ? -128 : o.street;
  // street plane: 3 km square, a texture tile = 4 city blocks of 100 m
  const E = 1600, T = 400;
  G.street.quad([-E, ys, -E], [E, ys, -E], [E, ys, E], [-E, ys, E], [0, 1, 0], [-E / T, -E / T, E / T, -E / T, E / T, E / T, -E / T, E / T]);
  const keep = o.keep || [-70, -45, 70, 45];
  const hand = o.hand || [];
  for (const b of hand) { G.k = b.k || 0; building(G, r, b.x, b.z, b.w, b.d, ys, b.top, r() * 4);
    if (b.lamp) lamp(G, b.x + b.w * .3, b.top + 3, b.z + b.d * .3, 2.2);
    if (b.plant) cube(G, b.x - b.w * .15, b.top, b.z, b.w * .4, 5, b.d * .4); }
  // grid of blocks (100 m pitch, streets 22 m), 1-3 buildings per block
  for (let gx = -11; gx <= 11; gx++) for (let gz = -11; gz <= 11; gz++) {
    const cx = gx * 100 + 50, cz = gz * 100 + 50, dist = Math.hypot(cx, cz);
    if (dist > 1150) continue;
    if (cx + 40 > keep[0] && cx - 40 < keep[2] && cz + 40 > keep[1] && cz - 40 < keep[3]) continue;
    if (hand.some(b => Math.abs(b.x - cx) < 50 && Math.abs(b.z - cz) < 50)) continue;
    const n = 1 + Math.floor(r() * 3), down = Math.max(0, 1 - dist / 1100);
    for (let i = 0; i < n; i++) {
      const w = 22 + r() * 34, d = 22 + r() * 34;
      const ox = n === 1 ? 0 : (i - (n - 1) / 2) * 26 + (r() - .5) * 6, oz = (r() - .5) * (78 - d);
      let hgt = 25 + Math.pow(r(), 1.6) * (60 + 230 * down);
      if (r() < .08 * down) hgt += 80;
      const top = ys + hgt;
      G.k = r() < .45 ? 0 : r() < .6 ? 1 : 2;
      building(G, r, cx + ox, cz + oz, Math.min(w, 34), d, ys, top, r() * 8);
      if (hgt > 120) { cube(G, cx + ox, top, cz + oz, w * .5, 6, d * .5); if (r() < .6) lamp(G, cx + ox, top + 6, cz + oz, 2.4); }
      else if (r() < .5) cube(G, cx + ox + (r() - .5) * w * .4, top, cz + oz, 6, 3, 5);
    }
  }
  const out = [];
  G.f.forEach((g, i) => { const m = g.mesh('tw_city' + i, scene, M.fac[i]); if (m) out.push(m); });
  for (const [g, mat, nm] of [[G.roof, M.roof, 'tw_roofs'], [G.red, M.red, 'tw_lamps'], [G.street, M.street, 'tw_streets']]) { const m = g.mesh(nm, scene, mat); if (m) out.push(m); }
  for (const m of out) { m.applyFog = true; B.mesh(m, { merge: false, collide: 'none', cast: false, receive: false }); }
  return out;
}
