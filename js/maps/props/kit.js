/* LIVE FIRE — prop modelling kit (used by js/maps/props.js and its catalogue files js/maps/props/*.js).
   Exports:
     Kit                         geometry accumulator for ONE prop, in prop-local space (metres; origin = base centre, +y up,
                                 FRONT = +z, left-handed like Babylon). Geometry is bucketed per material name; UVs are in
                                 TEXTURE TILES (local metres / MATERIALS[mat].scale) like the map builder, so library materials tile
                                 at their real-world size; atlas materials (foliage, decals) take explicit UVs.
       K.push(x, y, z, ry = 0, rx = 0, rz = 0, s = 1) / K.pop()   transform stack (yaw / pitch / roll as Babylon: roll, then pitch,
                                 then yaw; pitch > 0 tips +z down)
       K.box(mat, x, y, z, w, h, d, { ry, rx, rz, bev, skip: 'tb..', col, uv, mats: { t, b, n, s, e, w } })  y = BOTTOM
       K.lathe(mat, prof [[r, y]...], { seg, a0, a1, caps, sharp, col, uv, x, y, z })   revolved about local +y
       K.cyl(mat, x, y, z, r, h, { r2, seg, caps, a0, a1, col })   vertical; cylX / cylZ (mat, x0, x1, y, z, r, o) horizontal
       K.ext(mat, pts [[x, y]...], z0, z1, { caps, smooth, col, uv })   polygon in local XY extruded along z (any winding)
       K.tube(mat, path [[x, y, z]...], r, { seg, caps, col, closed })  swept circle (pipes, rails, cables, handles)
       K.blob(mat, x, y, z, rx, ry, rz, { seg, noise, freq, seed, flat, col, uv })   ellipsoid, seeded noise (rocks, bags)
       K.quad(mat, p0, p1, p2, p3, { uv: [u0, v0, u1, v1], n, col, two })   explicit quad (p0..p3 counter-clockwise from the front)
       K.decal(slot, x, y, z, w, h, { face: 'n'|'s'|'e'|'w'|'u', glow, ry })   atlas decal on a plane (see DECALS)
       K.col(x, y, z, w, h, d, { ry, surf, solid, ray, tag, walk })   box collider (y = bottom), K.ccyl(x, y, z, r, h, { surf })
       K.hide(x, y, z, kind, r)   hide-spot hint (registered with B.hide only when the placement asks for it)
       K.bounds() -> { min, max }
     emitKit(B, K, x, y, z, o, key)        places a built kit with the MapBuilder (merged by default, thin instances with o.inst)
     PROP_MATERIALS                        extra library materials (p_*) added to gfx/materials.js MATERIALS at import time
     propMaterial(scene, name, quality)    the custom (non-library) materials: p_foliage, p_bark, p_decal, p_glow
     DECALS                                decal atlas slots { name: [u0, v0, u1, v1] } (filled when the atlas is first drawn)
     rng(seed) -> () => [0, 1)             mulberry32
   Front-face rule (Babylon, checked against builder.js): a triangle (a, b, c) is front-facing when cross(b - a, c - a) . n < 0;
   every primitive passes its intended outward normal and the kit orders the indices accordingly. */
import { MATERIALS } from '../../gfx/materials.js';

const TAU = Math.PI * 2;
export function rng(seed) {
  let a = (seed >>> 0) || 1;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; }

// ------------------------------------------------------------------------------------------------------------ materials
// Extra library materials for props. Same fields as gfx/materials.js MATERIALS (set = texture set under assets/textures,
// scale = metres per tile, color = target mean albedo, desat). Registered at import (only names not defined yet), so
// B.mat('p_car_red') and merged geometry work like any library material (LF surface shader: wetness, sky occlusion).
const PM = (surf, set, scale, o) => Object.assign({ surf, set, tex: set ? 'assets/textures/' + set : null, scale }, o);
const PAINT = (hex, o = {}) => PM('metal', 'painted_metal', 2.0, Object.assign({ color: hex, desat: 1, macro: .05, por: .1, rough: .55 }, o));
// car paint: the brushed-steel set (fine, even grain) tinted, mostly dielectric, under a clear coat (props.js) -- the painted_metal
// photo carries chips and scratches that read as a wreck on a whole car body
const CARPAINT = (hex, o = {}) => PM('metal', 'steel', 3.0, Object.assign({ color: hex, desat: 1, macro: .04, por: .08, rough: .5, metal: .35 }, o));
const PLAST = (c, o = {}) => PM('rubber', null, 1, Object.assign({ col: c, rough: .5, macro: .05, por: .05, proc: 'noise' }, o));
const FAB = (hex, o = {}) => PM('fabric', 'fabric', .5, Object.assign({ color: hex, desat: 1, macro: .1, por: 1 }, o));
export const PROP_MATERIALS = {
  // car paints (glossy; props.js adds a clear coat)
  p_car_white: CARPAINT('#cfd0cb', { rough: .35 }), p_car_silver: CARPAINT('#8d9095', { rough: .35 }), p_car_grey: CARPAINT('#45484d', { rough: .35 }),
  p_car_black: CARPAINT('#111213', { rough: .3 }), p_car_red: CARPAINT('#7a1611', { rough: .35 }), p_car_blue: CARPAINT('#1a3157', { rough: .35 }),
  p_car_green: CARPAINT('#1e3a2b', { rough: .35 }), p_car_beige: CARPAINT('#a39377', { rough: .4 }), p_car_yellow: CARPAINT('#d29f12', { rough: .35 }),
  p_car_navy: CARPAINT('#141c2c', { rough: .35 }), p_car_orange: CARPAINT('#b04d18', { rough: .35 }), p_car_brown: CARPAINT('#47321f', { rough: .4 }),
  // flat paints
  p_paint_olive: PAINT('#4a4f2e', { rough: .9 }), p_paint_tan: PAINT('#9a8762', { rough: .9 }), p_paint_milgreen: PAINT('#39432f', { rough: .9 }),
  p_paint_orange: PAINT('#c0561a', { rough: .7 }), p_paint_grey: PAINT('#6b6e70', { rough: .7 }), p_paint_cream: PAINT('#cbc3ad', { rough: .7 }),
  p_paint_lightblue: PAINT('#6d8fa6', { rough: .7 }), p_paint_darkgrey: PAINT('#34373a', { rough: .75 }), p_paint_beige: PAINT('#b9ad91', { rough: .8 }),
  p_paint_teal: PAINT('#1f5a5c', { rough: .7 }), p_paint_maroon: PAINT('#55201c', { rough: .7 }), p_paint_purple: PAINT('#3c2a4a', { rough: .7 }),
  // plastics (untextured, procedural noise; vertex colours tint them)
  p_plastic_red: PLAST([.5, .05, .04]), p_plastic_blue: PLAST([.05, .16, .42]), p_plastic_green: PLAST([.08, .28, .1]),
  p_plastic_yellow: PLAST([.8, .55, .04]), p_plastic_orange: PLAST([.85, .3, .04]), p_plastic_grey: PLAST([.32, .33, .34]),
  p_plastic_dark: PLAST([.07, .07, .075], { rough: .6 }), p_plastic_beige: PLAST([.6, .55, .44]), p_plastic_milky: PLAST([.78, .78, .74], { rough: .35 }),
  p_plastic_brown: PLAST([.24, .15, .08]), p_tape: PLAST([.55, .42, .24], { rough: .35 }),
  p_bag_black: PLAST([.025, .025, .03], { rough: .22, surf: 'fabric' }), p_bag_green: PLAST([.06, .14, .07], { rough: .25, surf: 'fabric' }),
  p_bag_blue: PLAST([.05, .1, .22], { rough: .25, surf: 'fabric' }), p_porcelain: PLAST([.86, .86, .84], { rough: .12, surf: 'tile' }),
  p_screen: PLAST([.015, .016, .02], { rough: .08, surf: 'glass' }), p_lens_red: PLAST([.42, .02, .02], { rough: .12, surf: 'glass' }),
  p_lens_amber: PLAST([.62, .28, .02], { rough: .12, surf: 'glass' }), p_lens_clear: PLAST([.7, .72, .74], { rough: .08, surf: 'glass' }),
  // metals
  p_chrome: PM('metal', 'steel', 1.5, { color: '#d0d3d6', desat: 1, rough: .22, macro: .03, por: .02 }),
  p_alu: PM('metal', 'steel', 1.5, { color: '#a7abb0', desat: 1, rough: .6, macro: .06, por: .02 }),
  p_galv: PM('metal', 'steel', 1.5, { color: '#8f9496', desat: .9, rough: .85, macro: .14, por: .05 }),
  p_stainless: PM('metal', 'steel', 1.5, { color: '#b5b9bd', desat: 1, rough: .45, macro: .04, por: .02 }),
  p_rail: PM('metal', 'metal_rust', 2.2, { color: '#5a4a3e', desat: .5, macro: .12, por: .3 }),
  p_burnt: PM('metal', 'metal_rust', 2.2, { color: '#2a2522', desat: .7, macro: .25, por: .3 }),
  // glass and lights
  // chain-link with a lower alpha cut-off (props.js): the thin wires survive mip-mapping at distance
  p_chainlink: { surf: 'metal', set: 'chainlink', tex: 'assets/textures/chainlink', scale: 1.2, kind: 'cutout', two: 1, macro: .06, por: .02, col: [.6, .6, .62], proc: 'grate' },
  p_glass_tint: { surf: 'glass', set: null, tex: null, scale: 1, kind: 'glass', col: [.08, .1, .11], alpha: .62, macro: .04, por: 0 },
  p_glass_dark: { surf: 'glass', set: null, tex: null, scale: 1, kind: 'glass', col: [.02, .02, .025], alpha: .86, macro: .02, por: 0 },
  p_em_amber: { surf: 'glass', set: null, tex: null, scale: 1, kind: 'emissive', col: [1, .55, .12], emissive: 4 },
  p_em_blue: { surf: 'glass', set: null, tex: null, scale: 1, kind: 'emissive', col: [.2, .45, 1], emissive: 4 },
  p_em_cyan: { surf: 'glass', set: null, tex: null, scale: 1, kind: 'emissive', col: [.45, .9, 1], emissive: 3 },
  p_em_dim: { surf: 'glass', set: null, tex: null, scale: 1, kind: 'emissive', col: [.9, .92, 1], emissive: 1.2 },
  p_em_head: { surf: 'glass', set: null, tex: null, scale: 1, kind: 'emissive', col: [1, .95, .85], emissive: 2.2 },
  // textiles
  p_fab_grey: FAB('#4a4b4e'), p_fab_blue: FAB('#2a3953'), p_fab_red: FAB('#5a1e1c'), p_fab_green: FAB('#2e4232'), p_fab_beige: FAB('#8a7d68'),
  p_fab_brown: FAB('#4a392b'), p_fab_white: FAB('#bdb8ac'), p_fab_olive: FAB('#4a4e33'), p_fab_tan: FAB('#8e7f5e'), p_fab_charcoal: FAB('#2a2b2e'),
  p_fab_navy: FAB('#1c2436'), p_fab_mustard: FAB('#8c6d22'), p_fab_teal: FAB('#25494b'), p_tarp_blue: FAB('#1d4878', { rough: .7 }),
  p_sandbag: PM('fabric', 'burlap', .45, { color: '#8a7955', desat: .75, macro: .16, por: 1 }),
  p_geotex: PM('fabric', 'burlap', .7, { color: '#a08f6b', desat: .9, macro: .14, por: 1 }),
  p_hay: PM('fabric', 'burlap', .35, { color: '#b39853', desat: .6, macro: .2, por: 1 }),
  p_leather_black: PM('fabric', 'leather', .9, { color: '#1d1b1a', desat: .9, macro: .06, por: .5 }),
  p_leather_brown: PM('fabric', 'leather', .9, { color: '#4a2b1b', desat: .5, macro: .06, por: .5 }),
  p_mattress: FAB('#c6c1b3'), p_foam: PLAST([.5, .47, .4], { surf: 'fabric', rough: .9 }),
  // woods
  p_wood_light: PM('wood', 'wood_floor', 1.7, { color: '#a5845a', desat: .2, macro: .08, por: .3 }),
  p_wood_pallet: PM('wood', 'wood_planks', 1.6, { color: '#9b8261', desat: .45, macro: .14, por: .6 }),
  p_wood_crate: PM('wood', 'wood_planks', 1.6, { color: '#86694a', desat: .3, macro: .14, por: .6 }),
  p_wood_mil: PM('wood', 'wood_planks', 1.6, { color: '#4b4f33', desat: .9, macro: .14, por: .6 }),
  p_wood_white: PM('wood', 'wood_planks', 1.6, { color: '#c9c6bc', desat: .95, macro: .08, por: .4 }),
  p_wood_sleeper: PM('wood', 'wood_dark', 2.0, { color: '#3a3028', desat: .4, macro: .16, por: .5 }),
  p_wood_walnut: PM('wood', 'wood_dark', 2.0, { color: '#3d2a1c', desat: .1, macro: .08, por: .4, rough: .7 }),
  p_wood_fence: PM('wood', 'wood_planks', 1.6, { color: '#7a6247', desat: .35, macro: .16, por: .6 }),
  // minerals
  p_concrete_precast: PM('concrete', 'concrete_wall', 2.5, { color: '#a2a098', desat: .8, macro: .18, anti: 1, por: .7 }),
  p_ballast: PM('gravel', 'gravel', 1.6, { color: '#6c675f', desat: .6, macro: .16, anti: 1, por: .5 }),
  p_rock: PM('concrete', 'rock', 2.2, { color: '#77736b', desat: .5, macro: .22, anti: 1, por: .5 }),
  p_rock_red: PM('concrete', 'rock', 2.2, { color: '#8a6a52', desat: .4, macro: .22, anti: 1, por: .5 }),
  p_soil: PM('dirt', 'dirt', 2.0, { color: '#3e3125', desat: .3, macro: .2, por: .8 }),
  // plants (untextured parts)
  p_leaf_core: PLAST([.05, .1, .035], { surf: 'grass', rough: .9 }), p_stalk: PLAST([.36, .42, .14], { surf: 'grass', rough: .7 }), p_leaf_corn: PLAST([.28, .4, .1], { surf: 'grass', rough: .6 }),
  p_dead_wood: PM('wood', 'wood_dark', 2.0, { color: '#5b5048', desat: .7, macro: .14, por: .6 }),
};
for (const k in PROP_MATERIALS) if (!MATERIALS[k]) MATERIALS[k] = PROP_MATERIALS[k];

// custom materials: not in the library (atlas textures under assets/models/tex, or the decal atlas drawn at run time)
const CUSTOM = { p_foliage: 1, p_bark: 1.2, p_decal: 1, p_glow: 1 };
const ASSET = new URL('../../../assets/', import.meta.url).href;
const customState = new WeakMap();
export function isCustom(name) { return name in CUSTOM; }
export function tileOf(name) { return CUSTOM[name] || (MATERIALS[name] && MATERIALS[name].scale) || 2; }

/** Load an image (no CORS issues: same origin). */
function img(url) { return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('image ' + url)); i.src = url; }); }

export function propMaterial(scene, name, quality) {
  let st = customState.get(scene);
  // materials and textures die with the scene (scene.dispose disposes them all): only forget the per-scene state
  if (!st) { st = {}; customState.set(scene, st); scene.onDisposeObservable.addOnce(() => customState.delete(scene)); }
  if (st[name]) return st[name];
  const BB = BABYLON;
  let m;
  if (name === 'p_foliage') {
    m = new BB.PBRMaterial('m_p_foliage', scene);
    // albedo + alpha in ONE texture (the shadow map's alpha test reads the albedo alpha): composed on a canvas when both load
    const S = quality === 'low' ? 512 : 1024;
    const dt = new BB.DynamicTexture('p_foliage_tex', { width: S, height: S }, scene, true);
    dt.hasAlpha = true; dt.wrapU = dt.wrapV = BB.Texture.CLAMP_ADDRESSMODE;
    const g = dt.getContext(); g.fillStyle = 'rgba(70,90,50,0)'; g.fillRect(0, 0, S, S); dt.update(true);
    Promise.all([img(ASSET + 'models/tex/foliage.jpg'), img(ASSET + 'models/tex/foliage_a.jpg')]).then(([c, a]) => {
      if (scene.isDisposed) return;
      const cv = document.createElement('canvas'); cv.width = cv.height = S; const cg = cv.getContext('2d', { willReadFrequently: true });
      cg.drawImage(a, 0, 0, S, S); const A = cg.getImageData(0, 0, S, S).data;
      cg.drawImage(c, 0, 0, S, S); const C = cg.getImageData(0, 0, S, S);
      for (let i = 0; i < A.length; i += 4) C.data[i + 3] = A[i];
      g.putImageData(C, 0, 0); dt.update(true);
    }).catch(e => console.warn('[props] foliage texture: ' + e.message));
    m.albedoTexture = dt; m.useAlphaFromAlbedoTexture = true;
    m.transparencyMode = BB.PBRMaterial.PBRMATERIAL_ALPHATEST; m.alphaCutOff = .42;
    m.backFaceCulling = false; m.twoSidedLighting = true;
    m.metallic = 0; m.roughness = .72; m.environmentIntensity = .85;
    m.albedoColor = new BB.Color3(.92, .95, .9);
  } else if (name === 'p_bark') {
    m = new BB.PBRMaterial('m_p_bark', scene);
    m.albedoTexture = new BB.Texture(ASSET + 'models/tex/bark.jpg', scene);
    m.bumpTexture = new BB.Texture(ASSET + 'models/tex/bark_nor.jpg', scene);
    m.metallic = 0; m.roughness = .9; m.albedoColor = new BB.Color3(.85, .82, .78);
  } else if (name === 'p_decal' || name === 'p_glow') {
    const tex = decalTexture(scene, st, quality);
    m = new BB.PBRMaterial('m_' + name, scene);
    m.metallic = 0; m.roughness = .55;
    if (name === 'p_decal') {
      m.albedoTexture = tex; m.useAlphaFromAlbedoTexture = true;
      m.transparencyMode = BB.PBRMaterial.PBRMATERIAL_ALPHATEST; m.alphaCutOff = .5;
    } else {
      m.albedoColor = new BB.Color3(0, 0, 0); m.emissiveTexture = tex; m.emissiveColor = new BB.Color3(1, 1, 1);
      m.emissiveIntensity = 1.6; m.disableLighting = true; m.environmentIntensity = 0;
    }
  } else throw new Error('unknown prop material ' + name);
  m.metadata = { lf: name, surf: name === 'p_foliage' ? 'grass' : name === 'p_bark' ? 'wood' : 'metal', prop: true };
  st[name] = m;
  return m;
}

// ------------------------------------------------------------------------------------------------------------ decal atlas
// Drawn once per scene on a canvas (DynamicTexture). Every slot is original artwork (fictional names, generic symbols).
export const DECALS = {};
const SLOTS = [];       // [name, atlas px w, atlas px h, draw(g, w, h), logical w, logical h]
/** A decal slot: draw(g, w, h) paints a w x h LOGICAL canvas; k scales it into the atlas (k < 1 for big, low-detail slots). */
export function defineDecal(name, w, h, draw, k = 1) { SLOTS.push([name, Math.round(w * k), Math.round(h * k), draw, w, h]); }
function decalTexture(scene, st, quality) {
  if (st._decalTex) return st._decalTex;
  const W = 2048, H = 2048, k = quality === 'low' ? .5 : 1;
  const dt = new BABYLON.DynamicTexture('p_decals', { width: W * k, height: H * k }, scene, true);
  dt.hasAlpha = true; dt.wrapU = dt.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;
  const g = dt.getContext();
  g.clearRect(0, 0, W * k, H * k);
  layoutDecals(W, H);
  for (const [name, pw, ph, draw, w, h] of SLOTS) {
    const r = DECALS[name]; if (!r || !r.px) continue;
    g.save(); g.scale(k, k); g.translate(r.px[0], r.px[1]);
    g.beginPath(); g.rect(0, 0, pw, ph); g.clip();
    g.scale(pw / w, ph / h);
    try { draw(g, w, h); } catch (e) { console.warn('[props] decal ' + name + ': ' + e.message); }
    g.restore();
  }
  dt.update(true);
  st._decalTex = dt;
  return dt;
}
let laidOut = false;
/** Skyline-pack the slots (deterministic, tallest first) and fill DECALS with UV rects (v up: Babylon flips textures on load). */
export function layoutDecals(W = 2048, H = 2048) {
  if (laidOut) return; laidOut = true;
  const list = SLOTS.slice().sort((a, b) => b[2] - a[2] || b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
  const pad = 4;
  let sky = [{ x: 0, y: 0, w: W }];          // skyline segments, left to right
  for (const [name, w0, h0] of list) {
    const w = w0 + pad, h = h0 + pad;
    let best = null;
    for (let i = 0; i < sky.length; i++) {
      const x = sky[i].x; if (x + w > W) break;
      let y = 0, rem = w, j = i;
      while (rem > 0 && j < sky.length) { y = Math.max(y, sky[j].y); rem -= sky[j].w; j++; }
      if (rem > 0 || y + h > H) continue;
      if (!best || y < best.y || (y === best.y && x < best.x)) best = { x, y, i };
    }
    if (!best) { console.warn('[props] decal atlas full at ' + name); continue; }
    const { x, y } = best;
    // raise the skyline over [x, x + w)
    const out = [];
    for (const s of sky) {
      const s0 = s.x, s1 = s.x + s.w;
      if (s1 <= x || s0 >= x + w) { out.push(s); continue; }
      if (s0 < x) out.push({ x: s0, y: s.y, w: x - s0 });
      if (s1 > x + w) out.push({ x: x + w, y: s.y, w: s1 - x - w });
    }
    out.push({ x, y: y + h, w }); out.sort((a, b) => a.x - b.x);
    sky = []; for (const s of out) { const l = sky[sky.length - 1]; if (l && l.y === s.y && l.x + l.w === s.x) l.w += s.w; else sky.push(s); }
    // inset by 1.5 px so mips / filtering never reach the neighbour
    DECALS[name] = { px: [x, y, w0, h0], uv: [(x + 1.5) / W, 1 - (y + h0 - 1.5) / H, (x + w0 - 1.5) / W, 1 - (y + 1.5) / H] };
  }
}
export function decalUV(name) {
  if (!laidOut) layoutDecals();
  const d = DECALS[name];
  if (!d) throw new Error('unknown decal "' + name + '"');
  return d.uv;
}

// ------------------------------------------------------------------------------------------------------------ geometry
class Geo {
  constructor(mat) { this.mat = mat; this.P = []; this.N = []; this.U = []; this.C = null; this.I = []; this.cast = true; }
  get nv() { return this.P.length / 3; }
}
const ID = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];   // 3x4 row-major: x' = m0 x + m1 y + m2 z + m3 ...

export class Kit {
  constructor(seed = 1) {
    this.geos = new Map(); this.cols = []; this.hides = []; this.stack = [ID()]; this.rand = rng(seed); this.lights = [];
    this.min = [Infinity, Infinity, Infinity]; this.max = [-Infinity, -Infinity, -Infinity];
  }
  g(mat) { let g = this.geos.get(mat); if (!g) { g = new Geo(mat); this.geos.set(mat, g); } return g; }
  noCast(mat) { this.g(mat).cast = false; return this; }
  get M() { return this.stack[this.stack.length - 1]; }
  push(x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0, s = 1) {
    const P = this.M;
    const cy = Math.cos(ry), sy = Math.sin(ry), cx = Math.cos(rx), sx = Math.sin(rx), cz = Math.cos(rz), sz = Math.sin(rz);
    // R = Ry * Rx * Rz (roll first, then pitch, then yaw), Babylon conventions:
    // Ry: x' = x c + z s, z' = -x s + z c;  Rx: y' = y c - z s, z' = y s + z c;  Rz: x' = x c - y s, y' = x s + y c
    const Rz = [[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]], Rx = [[1, 0, 0], [0, cx, -sx], [0, sx, cx]], Ry = [[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]];
    const mm = (A, B) => A.map((r, i) => [0, 1, 2].map(j => r[0] * B[0][j] + r[1] * B[1][j] + r[2] * B[2][j]));
    const R = mm(Ry, mm(Rx, Rz));
    const L = [R[0][0] * s, R[0][1] * s, R[0][2] * s, x, R[1][0] * s, R[1][1] * s, R[1][2] * s, y, R[2][0] * s, R[2][1] * s, R[2][2] * s, z];
    // parent * L
    const o = new Array(12);
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) o[r * 4 + c] = P[r * 4] * L[c] + P[r * 4 + 1] * L[4 + c] + P[r * 4 + 2] * L[8 + c];
      o[r * 4 + 3] = P[r * 4] * L[3] + P[r * 4 + 1] * L[7] + P[r * 4 + 2] * L[11] + P[r * 4 + 3];
    }
    this.stack.push(o);
    return this;
  }
  pop() { if (this.stack.length > 1) this.stack.pop(); return this; }
  /** vertex: local position + local normal -> transformed; uv in tiles; returns index */
  _v(g, x, y, z, nx, ny, nz, u, v, col) {
    const M = this.M;
    const X = M[0] * x + M[1] * y + M[2] * z + M[3], Y = M[4] * x + M[5] * y + M[6] * z + M[7], Z = M[8] * x + M[9] * y + M[10] * z + M[11];
    let NX = M[0] * nx + M[1] * ny + M[2] * nz, NY = M[4] * nx + M[5] * ny + M[6] * nz, NZ = M[8] * nx + M[9] * ny + M[10] * nz;
    const l = Math.hypot(NX, NY, NZ) || 1; NX /= l; NY /= l; NZ /= l;
    g.P.push(X, Y, Z); g.N.push(NX, NY, NZ); g.U.push(u, v);
    if (col || g.C) {
      if (!g.C) { g.C = []; for (let i = 0; i < g.nv - 1; i++) g.C.push(1, 1, 1, 1); }
      g.C.push(col ? col[0] : 1, col ? col[1] : 1, col ? col[2] : 1, 1);
    }
    if (X < this.min[0]) this.min[0] = X; if (Y < this.min[1]) this.min[1] = Y; if (Z < this.min[2]) this.min[2] = Z;
    if (X > this.max[0]) this.max[0] = X; if (Y > this.max[1]) this.max[1] = Y; if (Z > this.max[2]) this.max[2] = Z;
    return g.nv - 1;
  }
  /** triangle with the intended (transformed) normal of its first vertex */
  _t(g, a, b, c) {
    const P = g.P, N = g.N;
    const ax = P[a * 3], ay = P[a * 3 + 1], az = P[a * 3 + 2];
    const ux = P[b * 3] - ax, uy = P[b * 3 + 1] - ay, uz = P[b * 3 + 2] - az, vx = P[c * 3] - ax, vy = P[c * 3 + 1] - ay, vz = P[c * 3 + 2] - az;
    const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
    const nx = N[a * 3] + N[b * 3] + N[c * 3], ny = N[a * 3 + 1] + N[b * 3 + 1] + N[c * 3 + 1], nz = N[a * 3 + 2] + N[b * 3 + 2] + N[c * 3 + 2];
    if (cx * nx + cy * ny + cz * nz < 0) g.I.push(a, b, c); else g.I.push(a, c, b);
  }
  _quad(g, q, n, uv, col) {     // q = 4 local points [x,y,z]; n = local normal; uv = 8 numbers (tiles)
    const i0 = this._v(g, q[0][0], q[0][1], q[0][2], n[0], n[1], n[2], uv[0], uv[1], col);
    const i1 = this._v(g, q[1][0], q[1][1], q[1][2], n[0], n[1], n[2], uv[2], uv[3], col);
    const i2 = this._v(g, q[2][0], q[2][1], q[2][2], n[0], n[1], n[2], uv[4], uv[5], col);
    const i3 = this._v(g, q[3][0], q[3][1], q[3][2], n[0], n[1], n[2], uv[6], uv[7], col);
    this._t(g, i0, i1, i2); this._t(g, i0, i2, i3);
  }
  /** box-projected UV of a local point for a local normal */
  static uvp(x, y, z, nx, ny, nz, tile) {
    const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);
    if (ay >= ax && ay >= az) return [x / tile, z / tile];
    if (ax >= az) return [z / tile, y / tile];
    return [x / tile, y / tile];
  }

  // ---------------------------------------------------------------------------------------------- box (optionally chamfered)
  box(mat, x, y, z, w, h, d, o = {}) {
    if (!(w > 0 && h > 0 && d > 0)) return this;
    const rot = !!(o.ry || o.rx || o.rz);
    this.push(x, y + h / 2, z, o.ry || 0, o.rx || 0, o.rz || 0);
    const hx = w / 2, hy = h / 2, hz = d / 2, b = Math.min(o.bev || 0, hx * .45, hy * .45, hz * .45), col = o.col, uvk = o.uv || 1;
    const skip = o.skip || '', mats = o.mats;
    // UVs from prop-local coordinates (continuous across touching parts) unless the part is turned (then its own axes)
    const ox = rot ? 0 : x, oy = rot ? 0 : y + hy, oz = rot ? 0 : z;
    const uvq = (pts, n, tile) => { const uv = []; for (const p of pts) { const t = Kit.uvp(p[0] + ox, p[1] + oy, p[2] + oz, n[0], n[1], n[2], tile); uv.push(t[0], t[1]); } return uv; };
    const faces = [['e', 1, 0, 0], ['w', -1, 0, 0], ['t', 0, 1, 0], ['b', 0, -1, 0], ['n', 0, 0, 1], ['s', 0, 0, -1]];
    for (const [k, nx, ny, nz] of faces) {
      if (skip.includes(k)) continue;
      const m = (mats && mats[k]) || mat, g = this.g(m), tile = tileOf(m) * uvk;
      const q = [];
      if (nx) { const X = nx * hx; for (const [a, c] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) q.push([X, a * (hy - b), c * (hz - b)]); }
      else if (ny) { const Y = ny * hy; for (const [a, c] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) q.push([a * (hx - b), Y, c * (hz - b)]); }
      else { const Z = nz * hz; for (const [a, c] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) q.push([a * (hx - b), c * (hy - b), Z]); }
      this._quad(g, q, [nx, ny, nz], uvq(q, [nx, ny, nz], tile), col);
    }
    if (b > 0) {
      const g = this.g(mat), tile = tileOf(mat) * uvk, s2 = Math.SQRT1_2, s3 = 1 / Math.sqrt(3);
      const edge = (n, pts) => this._quad(g, pts, n, uvq(pts, n, tile), col);
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) {   // edges along z
        if ((sy > 0 && skip.includes('t')) || (sy < 0 && skip.includes('b'))) continue;
        edge([sx * s2, sy * s2, 0], [[sx * hx, sy * (hy - b), -(hz - b)], [sx * (hx - b), sy * hy, -(hz - b)], [sx * (hx - b), sy * hy, hz - b], [sx * hx, sy * (hy - b), hz - b]]);
      }
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {   // edges along y
        edge([sx * s2, 0, sz * s2], [[sx * hx, -(hy - b), sz * (hz - b)], [sx * (hx - b), -(hy - b), sz * hz], [sx * (hx - b), hy - b, sz * hz], [sx * hx, hy - b, sz * (hz - b)]]);
      }
      for (const sy of [-1, 1]) for (const sz of [-1, 1]) {   // edges along x
        if ((sy > 0 && skip.includes('t')) || (sy < 0 && skip.includes('b'))) continue;
        edge([0, sy * s2, sz * s2], [[-(hx - b), sy * hy, sz * (hz - b)], [-(hx - b), sy * (hy - b), sz * hz], [hx - b, sy * (hy - b), sz * hz], [hx - b, sy * hy, sz * (hz - b)]]);
      }
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {   // 8 corners
        if ((sy > 0 && skip.includes('t')) || (sy < 0 && skip.includes('b'))) continue;
        const n = [sx * s3, sy * s3, sz * s3], P = [[sx * hx, sy * (hy - b), sz * (hz - b)], [sx * (hx - b), sy * hy, sz * (hz - b)], [sx * (hx - b), sy * (hy - b), sz * hz]];
        const uv = uvq(P, n, tile);
        const ii = P.map((p, i) => this._v(g, p[0], p[1], p[2], n[0], n[1], n[2], uv[i * 2], uv[i * 2 + 1], col));
        this._t(g, ii[0], ii[1], ii[2]);
      }
    }
    this.pop();
    return this;
  }
  /** box by two corners (local, unrotated) */
  boxc(mat, x0, y0, z0, x1, y1, z1, o) { return this.box(mat, (x0 + x1) / 2, Math.min(y0, y1), (z0 + z1) / 2, Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0), o); }

  // ---------------------------------------------------------------------------------------------- lathe / cylinders
  lathe(mat, prof, o = {}) {
    const seg = o.seg || 16, a0 = o.a0 || 0, a1 = o.a1 == null ? TAU : o.a1, full = Math.abs(a1 - a0 - TAU) < 1e-6;
    const g = this.g(mat), tile = tileOf(mat) * (o.uv || 1), col = o.col, sharp = Math.cos((o.sharp || 40) * Math.PI / 180);
    this.push(o.x || 0, o.y || 0, o.z || 0, o.ry || 0, o.rx || 0, o.rz || 0);
    const n = prof.length;
    // segment normals in the (r, y) plane: outward
    const sn = [], sl = [];
    for (let i = 0; i < n - 1; i++) {
      const dr = prof[i + 1][0] - prof[i][0], dy = prof[i + 1][1] - prof[i][1], l = Math.hypot(dr, dy) || 1;
      sn.push([dy / l, -dr / l]); sl.push(l);
    }
    let acc = 0;
    for (let i = 0; i < n - 1; i++) {
      const L = sl[i];
      if (L < 1e-6) continue;
      const nA = (i > 0 && sn[i - 1][0] * sn[i][0] + sn[i - 1][1] * sn[i][1] > sharp && sl[i - 1] > 1e-6) ? norm2(sn[i - 1], sn[i]) : sn[i];
      const nB = (i < n - 2 && sn[i + 1][0] * sn[i][0] + sn[i + 1][1] * sn[i][1] > sharp && sl[i + 1] > 1e-6) ? norm2(sn[i], sn[i + 1]) : sn[i];
      const rA = prof[i][0], yA = prof[i][1], rB = prof[i + 1][0], yB = prof[i + 1][1], rm = Math.max(.02, (rA + rB) / 2);
      const base = [];
      for (let k = 0; k <= seg; k++) {
        const a = a0 + (a1 - a0) * k / seg, ca = Math.cos(a), sa = Math.sin(a), u = a * rm / tile;
        const iA = this._v(g, ca * rA, yA, sa * rA, ca * nA[0], nA[1], sa * nA[0], u, acc / tile, col);
        const iB = this._v(g, ca * rB, yB, sa * rB, ca * nB[0], nB[1], sa * nB[0], u, (acc + L) / tile, col);
        base.push([iA, iB]);
      }
      for (let k = 0; k < seg; k++) {
        const [a, b] = base[k], [c, d] = base[k + 1];
        if (rA > 1e-6) this._t(g, a, c, b);
        if (rB > 1e-6) this._t(g, b, c, d);
      }
      acc += L;
    }
    // caps
    const cap = (r, y, up) => {
      if (r <= 1e-6) return;
      const ny = up ? 1 : -1, c0 = this._v(g, 0, y, 0, 0, ny, 0, 0, 0, col), ring = [];
      for (let k = 0; k <= seg; k++) { const a = a0 + (a1 - a0) * k / seg, X = Math.cos(a) * r, Z = Math.sin(a) * r; ring.push(this._v(g, X, y, Z, 0, ny, 0, X / tile, Z / tile, col)); }
      for (let k = 0; k < seg; k++) this._t(g, c0, ring[k], ring[k + 1]);
    };
    if (o.caps !== false) {
      if (o.capB !== false) cap(prof[0][0], prof[0][1], prof[0][1] > prof[n - 1][1]);
      if (o.capT !== false) cap(prof[n - 1][0], prof[n - 1][1], prof[n - 1][1] >= prof[0][1]);
    }
    if (!full && o.ends !== false) {   // close a partial lathe with flat ends
      for (const a of [a0, a1]) {
        const ca = Math.cos(a), sa = Math.sin(a), nrm = a === a0 ? [sa, 0, -ca] : [-sa, 0, ca];
        const pts = prof.map(p => [ca * p[0], p[1], sa * p[0]]);
        for (let i = 0; i < pts.length - 1; i++) {
          const q = [[0, pts[i][1], 0], pts[i], pts[i + 1], [0, pts[i + 1][1], 0]];
          const uv = []; for (const p of q) uv.push(Math.hypot(p[0], p[2]) / tile, p[1] / tile);
          this._quad(g, q, nrm, uv, col);
        }
      }
    }
    this.pop();
    return this;
  }
  cyl(mat, x, y, z, r, h, o = {}) { return this.lathe(mat, [[r, 0], [o.r2 == null ? r : o.r2, h]], Object.assign({ sharp: 89 }, o, { x, y, z })); }
  /** horizontal cylinder along x from x0 to x1, axis at (y, z) */
  cylX(mat, x0, x1, y, z, r, o = {}) { this.push(x0, y, z, 0, 0, -Math.PI / 2); this.lathe(mat, [[r, 0], [o.r2 == null ? r : o.r2, x1 - x0]], Object.assign({ sharp: 89 }, o)); return this.pop(); }
  /** horizontal cylinder along z from z0 to z1, axis at (x, y) */
  cylZ(mat, z0, z1, x, y, r, o = {}) { this.push(x, y, z0, 0, Math.PI / 2, 0); this.lathe(mat, [[r, 0], [o.r2 == null ? r : o.r2, z1 - z0]], Object.assign({ sharp: 89 }, o)); return this.pop(); }
  /** torus-like ring (tyres, hoses): ring radius R, tube radius r, about local +y */
  ring(mat, x, y, z, R, r, o = {}) {
    const prof = []; const n = o.tseg || 8;
    for (let i = 0; i <= n; i++) { const a = -Math.PI / 2 + i * TAU / n; prof.push([R + Math.cos(a) * r * (o.sx || 1), Math.sin(a) * r]); }
    return this.lathe(mat, prof, Object.assign({ caps: false, sharp: 60 }, o, { x, y, z }));
  }

  // ---------------------------------------------------------------------------------------------- extrusion
  ext(mat, pts, z0, z1, o = {}) {
    const g = this.g(mat), tile = tileOf(mat) * (o.uv || 1), col = o.col, n = pts.length;
    if (n < 3) return this;
    let area = 0; for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i + 1) % n]; area += a[0] * b[1] - b[0] * a[1]; }
    const ccw = area > 0;
    // side normals (outward): for CCW polygons the outward normal of edge a->b is (dy, -dx)
    const en = [];
    for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i + 1) % n]; const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1; en.push(ccw ? [dy / l, -dx / l] : [-dy / l, dx / l]); }
    const sm = o.smooth ? Math.cos(o.smooth * Math.PI / 180) : 2;
    let acc = 0;
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % n], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (L < 1e-7) continue;
      const p = en[(i + n - 1) % n], c = en[i], q = en[(i + 1) % n];
      const nA = p[0] * c[0] + p[1] * c[1] > sm ? norm2(p, c) : c, nB = q[0] * c[0] + q[1] * c[1] > sm ? norm2(c, q) : c;
      const i0 = this._v(g, a[0], a[1], z0, nA[0], nA[1], 0, acc / tile, z0 / tile, col), i1 = this._v(g, b[0], b[1], z0, nB[0], nB[1], 0, (acc + L) / tile, z0 / tile, col);
      const i2 = this._v(g, b[0], b[1], z1, nB[0], nB[1], 0, (acc + L) / tile, z1 / tile, col), i3 = this._v(g, a[0], a[1], z1, nA[0], nA[1], 0, acc / tile, z1 / tile, col);
      this._t(g, i0, i1, i2); this._t(g, i0, i2, i3);
      acc += L;
    }
    if (o.caps !== false) {
      const tris = earcut(pts);
      for (const [zz, nz] of [[z0, -1], [z1, 1]]) {
        if ((nz < 0 && o.cap0 === false) || (nz > 0 && o.cap1 === false)) continue;
        const ids = pts.map(p => this._v(g, p[0], p[1], zz, 0, 0, nz, p[0] / tile, p[1] / tile, col));
        for (let t = 0; t < tris.length; t += 3) this._t(g, ids[tris[t]], ids[tris[t + 1]], ids[tris[t + 2]]);
      }
    }
    return this;
  }

  /** a side profile [[z, y]...] (local side view) extruded across x from x0 to x1 */
  extX(mat, ptsZY, x0, x1, o = {}) {
    // frame: ry = +90deg maps local x -> world -z and local z -> world +x, so feed (-z, y) as the polygon
    this.push(0, 0, 0, Math.PI / 2);
    this.ext(mat, ptsZY.map(p => [-p[0], p[1]]), x0, x1, o);
    return this.pop();
  }
  /** a plan polygon [[x, z]...] extruded up from y0 to y1 */
  extY(mat, ptsXZ, y0, y1, o = {}) {
    // rx = -90deg: local z -> world +y, local y -> world -z: feed (x, -z)
    this.push(0, 0, 0, 0, -Math.PI / 2, 0);
    this.ext(mat, ptsXZ.map(p => [p[0], -p[1]]), y0, y1, o);
    return this.pop();
  }

  // ---------------------------------------------------------------------------------------------- loft (car bodies, hulls)
  /** Skin a list of cross-sections [{ z, pts: [[x, y]...] }] (same point count, closed loops in local XY at depth z, sorted by
   *  z). o.mat(i, j) -> material for the quad between sections i..i+1 and points j..j+1 (default `mat`; null = leave a hole);
   *  o.caps (default true) closes both ends; smooth normals everywhere except across o.crease (Set of point indices);
   *  o.inward = normals point to the inside (the inner skin of a hull). */
  loft(mat, secs, o = {}) {
    const S = secs.length, N = secs[0].pts.length, col = o.col;
    if (S < 2 || N < 3) return this;
    const P = (i, j) => [secs[i].pts[j % N][0], secs[i].pts[j % N][1], secs[i].z];
    // section centroids for outward checks
    const cen = secs.map(s => { let x = 0, y = 0; for (const p of s.pts) { x += p[0]; y += p[1]; } return [x / N, y / N, s.z]; });
    const Nn = []; for (let i = 0; i < S; i++) { Nn.push([]); for (let j = 0; j < N; j++) Nn[i].push([0, 0, 0]); }
    const fn = [];
    for (let i = 0; i < S - 1; i++) {
      fn.push([]);
      for (let j = 0; j < N; j++) {
        const a = P(i, j), b = P(i, j + 1), c = P(i + 1, j + 1), d = P(i + 1, j);
        let n = cross(sub(c, a), sub(d, b));
        const m = [(a[0] + b[0] + c[0] + d[0]) / 4, (a[1] + b[1] + c[1] + d[1]) / 4, (a[2] + b[2] + c[2] + d[2]) / 4];
        const cc = [(cen[i][0] + cen[i + 1][0]) / 2, (cen[i][1] + cen[i + 1][1]) / 2, m[2]];
        if ((dot(n, sub(m, cc)) < 0) !== !!o.inward) n = [-n[0], -n[1], -n[2]];
        const l = Math.hypot(...n); n = l > 1e-12 ? [n[0] / l, n[1] / l, n[2] / l] : [0, 0, 0];
        fn[i].push(n);
        for (const [ii, jj] of [[i, j], [i, (j + 1) % N], [i + 1, (j + 1) % N], [i + 1, j]]) { const t = Nn[ii][jj]; t[0] += n[0]; t[1] += n[1]; t[2] += n[2]; }
      }
    }
    const crease = o.crease || null;
    // cumulative perimeter (u) per section
    const U = secs.map(s => { const u = [0]; for (let j = 1; j <= N; j++) { const a = s.pts[j - 1], b = s.pts[j % N]; u.push(u[j - 1] + Math.hypot(b[0] - a[0], b[1] - a[1])); } return u; });
    for (let i = 0; i < S - 1; i++) for (let j = 0; j < N; j++) {
      const m = o.mat ? o.mat(i, j) : mat; if (!m) continue;
      const g = this.g(m), tile = tileOf(m) * (o.uv || 1), f = fn[i][j];
      const ids = [[i, j, U[i][j]], [i, j + 1, U[i][j + 1]], [i + 1, j + 1, U[i + 1][j + 1]], [i + 1, j, U[i + 1][j]]].map(([ii, jj, u]) => {
        const p = P(ii, jj); let n = Nn[ii][jj % N];
        if (crease && (crease.has(jj % N))) n = f;
        n = nrm3(n);
        return this._v(g, p[0], p[1], p[2], n[0], n[1], n[2], u / tile, p[2] / tile, col);
      });
      this._t(g, ids[0], ids[1], ids[2]); this._t(g, ids[0], ids[2], ids[3]);
    }
    if (o.caps !== false) for (const [i, nz] of [[0, -1], [S - 1, 1]]) {
      const m = (o.capMat || mat), g = this.g(m), tile = tileOf(m);
      const tris = earcut(secs[i].pts);
      const ids = secs[i].pts.map(p => this._v(g, p[0], p[1], secs[i].z, 0, 0, nz, p[0] / tile, p[1] / tile, col));
      for (let t = 0; t < tris.length; t += 3) this._t(g, ids[tris[t]], ids[tris[t + 1]], ids[tris[t + 2]]);
    }
    return this;
  }

  // ---------------------------------------------------------------------------------------------- tube along a path
  tube(mat, path, r, o = {}) {
    const g = this.g(mat), tile = tileOf(mat) * (o.uv || 1), col = o.col, seg = o.seg || 8, n = path.length;
    if (n < 2) return this;
    const T = [];
    for (let i = 0; i < n; i++) {
      const a = path[Math.max(0, i - 1)], b = path[Math.min(n - 1, i + 1)];
      const t = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]; const l = Math.hypot(...t) || 1; T.push([t[0] / l, t[1] / l, t[2] / l]);
    }
    // parallel transport frame
    let up = Math.abs(T[0][1]) < .9 ? [0, 1, 0] : [1, 0, 0];
    let N = cross(T[0], up); N = nrm3(N); let Bv = cross(T[0], N);
    const rings = [], frames = []; let acc = 0;
    for (let i = 0; i < n; i++) {
      if (i > 0) {
        const v = cross(T[i - 1], T[i]); const s = Math.hypot(...v);
        if (s > 1e-6) N = rotAxis(N, nrm3(v), Math.acos(Math.max(-1, Math.min(1, dot(T[i - 1], T[i])))));
        Bv = cross(T[i], N);
        acc += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1], path[i][2] - path[i - 1][2]);
      }
      const rr = Array.isArray(r) ? r[i] : r, ring = [];
      frames.push([N.slice(), Bv.slice()]);
      for (let k = 0; k <= seg; k++) {
        const a = k * TAU / seg, ca = Math.cos(a), sa = Math.sin(a);
        const nx = N[0] * ca + Bv[0] * sa, ny = N[1] * ca + Bv[1] * sa, nz = N[2] * ca + Bv[2] * sa;
        ring.push(this._v(g, path[i][0] + nx * rr, path[i][1] + ny * rr, path[i][2] + nz * rr, nx, ny, nz, a * rr / tile, acc / tile, col));
      }
      rings.push(ring);
    }
    for (let i = 0; i < n - 1; i++) for (let k = 0; k < seg; k++) {
      const a = rings[i][k], b = rings[i][k + 1], c = rings[i + 1][k + 1], d = rings[i + 1][k];
      this._t(g, a, b, c); this._t(g, a, c, d);
    }
    if (o.caps) for (const [i, sg] of [[0, -1], [n - 1, 1]]) {
      const t = T[i], rr = Array.isArray(r) ? r[i] : r, nn = [t[0] * sg, t[1] * sg, t[2] * sg];
      const c0 = this._v(g, path[i][0], path[i][1], path[i][2], nn[0], nn[1], nn[2], 0, 0, col);
      const ids = [];
      for (let k = 0; k <= seg; k++) {
        const a = k * TAU / seg, ca = Math.cos(a), sa = Math.sin(a), Nf = frames[i];
        const px = path[i][0] + (Nf[0][0] * ca + Nf[1][0] * sa) * rr, py = path[i][1] + (Nf[0][1] * ca + Nf[1][1] * sa) * rr, pz = path[i][2] + (Nf[0][2] * ca + Nf[1][2] * sa) * rr;
        ids.push(this._v(g, px, py, pz, nn[0], nn[1], nn[2], ca * rr / tile, sa * rr / tile, col));
      }
      for (let k = 0; k < seg; k++) this._t(g, c0, ids[k], ids[k + 1]);
    }
    return this;
  }

  // ---------------------------------------------------------------------------------------------- ellipsoid / organic blob
  blob(mat, x, y, z, rx, ry, rz, o = {}) {
    const g = this.g(mat), tile = tileOf(mat) * (o.uv || 1), col = o.col;
    const seg = o.seg || 12, rings = Math.max(4, Math.round(seg / 2)), amp = o.noise || 0, fq = o.freq || 2.2, seed = o.seed || 1;
    const flat = o.flat == null ? -Infinity : o.flat;   // local y (relative to the centre, in units of ry) below which it is flattened
    const P = [];
    for (let j = 0; j <= rings; j++) {
      const v = j / rings, th = v * Math.PI, sy = -Math.cos(th), sr = Math.sin(th);
      for (let k = 0; k <= seg; k++) {
        const a = (k % seg) * TAU / seg;
        let px = Math.cos(a) * sr, py = sy, pz = Math.sin(a) * sr;
        let d = 1;
        if (amp) d += amp * (vnoise3(px * fq + seed * 1.7, py * fq + seed * .3, pz * fq - seed) - .5) * 2 + amp * .5 * (vnoise3(px * fq * 2.3 - seed, py * fq * 2.3, pz * fq * 2.3 + seed * .7) - .5);
        if (o.squash) py = py < 0 ? py * o.squash : py;
        let X = px * d * rx, Y = py * d * ry, Z = pz * d * rz;
        if (Y < flat * ry) Y = flat * ry + (Y - flat * ry) * .05;
        if (o.top != null && Y > o.top * ry) Y = o.top * ry + (Y - o.top * ry) * .15;
        P.push([X, Y, Z]);
      }
    }
    // smooth normals from the grid
    const W = seg + 1, Nn = P.map(() => [0, 0, 0]);
    const tris = [];
    for (let j = 0; j < rings; j++) for (let k = 0; k < seg; k++) {
      const a = j * W + k, b = a + 1, c = a + W + 1, d = a + W;
      tris.push([a, b, c], [a, c, d]);
    }
    for (const [a, b, c] of tris) {
      const u = sub(P[b], P[a]), v = sub(P[c], P[a]); let n = cross(u, v);
      // outward: away from the centre
      const m = [(P[a][0] + P[b][0] + P[c][0]) / 3, (P[a][1] + P[b][1] + P[c][1]) / 3, (P[a][2] + P[b][2] + P[c][2]) / 3];
      if (dot(n, m) < 0) n = [-n[0], -n[1], -n[2]];
      for (const i of [a, b, c]) { Nn[i][0] += n[0]; Nn[i][1] += n[1]; Nn[i][2] += n[2]; }
    }
    // seam / pole welding of normals
    for (let j = 0; j <= rings; j++) { const a = j * W, b = j * W + seg; const s = [Nn[a][0] + Nn[b][0], Nn[a][1] + Nn[b][1], Nn[a][2] + Nn[b][2]]; Nn[a] = s; Nn[b] = s.slice(); }
    for (const j of [0, rings]) { const s = [0, 0, 0]; for (let k = 0; k <= seg; k++) { const n = Nn[j * W + k]; s[0] += n[0]; s[1] += n[1]; s[2] += n[2]; } for (let k = 0; k <= seg; k++) Nn[j * W + k] = s.slice(); }
    this.push(x, y, z, o.ry || 0, o.rx || 0, o.rz || 0);
    const ids = P.map((p, i) => { const n = nrm3(Nn[i]); const uv = Kit.uvp(p[0], p[1], p[2], n[0], n[1], n[2], tile); return this._v(g, p[0], p[1], p[2], n[0], n[1], n[2], uv[0], uv[1], col); });
    for (const [a, b, c] of tris) {
      // skip degenerate pole triangles
      if (Math.hypot(...sub(P[a], P[b])) < 1e-7 || Math.hypot(...sub(P[b], P[c])) < 1e-7 || Math.hypot(...sub(P[a], P[c])) < 1e-7) continue;
      this._t(g, ids[a], ids[b], ids[c]);
    }
    this.pop();
    return this;
  }

  // ---------------------------------------------------------------------------------------------- quads, cards, decals
  quad(mat, p0, p1, p2, p3, o = {}) {
    const g = this.g(mat), col = o.col;
    const n = o.n || nrm3(cross(sub(p1, p0), sub(p3, p0))).map(v => -v);   // p0..p3 counter-clockwise seen from the front
    let uv;
    if (o.uv) { const [u0, v0, u1, v1] = o.uv; uv = [u0, v0, u1, v0, u1, v1, u0, v1]; }
    else { const tile = tileOf(mat); uv = []; for (const p of [p0, p1, p2, p3]) { const t = Kit.uvp(p[0], p[1], p[2], n[0], n[1], n[2], tile); uv.push(t[0], t[1]); } }
    this._quad(g, [p0, p1, p2, p3], n, uv, col);
    if (o.two) this._quad(g, [p1, p0, p3, p2], n.map(v => -v), [uv[2], uv[3], uv[0], uv[1], uv[6], uv[7], uv[4], uv[5]], col);
    return this;
  }
  /** a decal rectangle w x h centred at (x, y, z) on a plane facing `face` (n = +z, s = -z, e = +x, w = -x, u = up) */
  decal(slot, x, y, z, w, h, o = {}) {
    const uv = decalUV(slot), mat = o.glow ? 'p_glow' : 'p_decal', f = o.face || 'n', hw = w / 2, hh = h / 2;
    this.noCast(mat);
    this.push(x, y, z, o.ry || 0, o.rx || 0, o.rz || 0);
    let q, n;
    if (f === 'n') { q = [[-hw, -hh, 0], [hw, -hh, 0], [hw, hh, 0], [-hw, hh, 0]]; n = [0, 0, 1]; }
    else if (f === 's') { q = [[hw, -hh, 0], [-hw, -hh, 0], [-hw, hh, 0], [hw, hh, 0]]; n = [0, 0, -1]; }
    else if (f === 'e') { q = [[0, -hh, hw], [0, -hh, -hw], [0, hh, -hw], [0, hh, hw]]; n = [1, 0, 0]; }
    else if (f === 'w') { q = [[0, -hh, -hw], [0, -hh, hw], [0, hh, hw], [0, hh, -hw]]; n = [-1, 0, 0]; }
    else { q = [[-hw, 0, hh], [hw, 0, hh], [hw, 0, -hh], [-hw, 0, -hh]]; n = [0, 1, 0]; }
    // the quads above list their corners left-to-right as seen from the side the face points to... mirrored: u runs the other way
    const [u0, v0, u1, v1] = o.flip ? uv : [uv[2], uv[1], uv[0], uv[3]];
    this._quad(this.g(mat), q, n, [u0, v0, u1, v0, u1, v1, u0, v1], o.col);
    this.pop();
    return this;
  }
  /** an alpha-cut foliage card: centre (x, y, z), size w x h, cell 0..3 of the foliage atlas, turned by ry / pitched by rx */
  card(x, y, z, w, h, cell, o = {}) {
    const c = cell & 3, u0 = (c & 1) * .5, v1 = 1 - (c >> 1) * .5, inset = .004;
    const hw = w / 2, mat = 'p_foliage', g = this.g(mat);
    this.push(x, y, z, o.ry || 0, o.rx || 0, o.rz || 0);
    const bottom = o.base ? 0 : -h / 2, top = bottom + h;
    // bent normal: the canopy's outward direction (given) gives volume lighting instead of flat cards
    const n = o.n || [0, 0, 1];
    const q = [[-hw, bottom, 0], [hw, bottom, 0], [hw, top, 0], [-hw, top, 0]];
    const uv = o.flipU ? [u0 + .5 - inset, v1 - .5 + inset, u0 + inset, v1 - .5 + inset, u0 + inset, v1 - inset, u0 + .5 - inset, v1 - inset]
      : [u0 + inset, v1 - .5 + inset, u0 + .5 - inset, v1 - .5 + inset, u0 + .5 - inset, v1 - inset, u0 + inset, v1 - inset];
    const ids = q.map((p, i) => this._v(g, p[0], p[1], p[2], 0, 0, 1, uv[i * 2], uv[i * 2 + 1], o.col));
    // overwrite normals with the bent (prop-space) normal
    if (o.n) for (const id of ids) { const l = Math.hypot(...n) || 1; g.N[id * 3] = n[0] / l; g.N[id * 3 + 1] = n[1] / l; g.N[id * 3 + 2] = n[2] / l; }
    // two-sided material: the index order only has to be consistent
    g.I.push(ids[0], ids[1], ids[2], ids[0], ids[2], ids[3]);
    this.pop();
    return this;
  }

  // ---------------------------------------------------------------------------------------------- gameplay metadata
  col(x, y, z, w, h, d, o = {}) { const M = this.M; this.cols.push({ x: M[0] * x + M[2] * z + M[3], y: M[7] + y, z: M[8] * x + M[10] * z + M[11], w, h, d, ry: (o.ry || 0) + Math.atan2(M[2], M[0]), surf: o.surf, solid: o.solid, ray: o.ray, tag: o.tag, walk: o.walk }); return this; }
  ccyl(x, y, z, r, h, o = {}) { const M = this.M; this.cols.push({ cyl: true, x: M[0] * x + M[2] * z + M[3], y: M[7] + y, z: M[8] * x + M[10] * z + M[11], r, h, surf: o.surf }); return this; }
  hide(x, y, z, kind = 'dark', r = .8) { const M = this.M; this.hides.push({ x: M[0] * x + M[2] * z + M[3], y: M[7] + y, z: M[8] * x + M[10] * z + M[11], kind, r }); return this; }
  light(spec) { this.lights.push(spec); return this; }
  bounds() { return { min: this.min.slice(), max: this.max.slice() }; }
  /** after building: typed arrays (half the memory, no copies when meshes are made) */
  compact() {
    for (const g of this.geos.values()) {
      if (g.P instanceof Float32Array) continue;
      g.P = new Float32Array(g.P); g.N = new Float32Array(g.N); g.U = new Float32Array(g.U); if (g.C) g.C = new Float32Array(g.C);
      g.I = g.P.length / 3 > 65535 ? new Uint32Array(g.I) : new Uint16Array(g.I);
    }
    this.stack = [ID()];
    return this;
  }
  tris() { let t = 0; for (const g of this.geos.values()) t += g.I.length / 3; return t; }
}

// ------------------------------------------------------------------------------------------------------------ small math
function norm2(a, b) { const x = a[0] + b[0], y = a[1] + b[1], l = Math.hypot(x, y) || 1; return [x / l, y / l]; }
function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function nrm3(a) { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
function rotAxis(v, k, a) {   // Rodrigues
  const c = Math.cos(a), s = Math.sin(a), d = dot(k, v), x = cross(k, v);
  return nrm3([v[0] * c + x[0] * s + k[0] * d * (1 - c), v[1] * c + x[1] * s + k[1] * d * (1 - c), v[2] * c + x[2] * s + k[2] * d * (1 - c)]);
}
function h3(x, y, z) { let h = (x * 374761393 + y * 668265263 + z * 1274126177) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
export function vnoise3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), fx = x - xi, fy = y - yi, fz = z - zi;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz);
  const L = (a, b, t) => a + (b - a) * t;
  return L(L(L(h3(xi, yi, zi), h3(xi + 1, yi, zi), u), L(h3(xi, yi + 1, zi), h3(xi + 1, yi + 1, zi), u), v),
    L(L(h3(xi, yi, zi + 1), h3(xi + 1, yi, zi + 1), u), L(h3(xi, yi + 1, zi + 1), h3(xi + 1, yi + 1, zi + 1), u), v), w);
}
/** ear clipping for a simple polygon [[x, y]...] -> triangle index list */
export function earcut(pts) {
  const n = pts.length; if (n < 3) return [];
  let area = 0; for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i + 1) % n]; area += a[0] * b[1] - b[0] * a[1]; }
  const idx = []; for (let i = 0; i < n; i++) idx.push(area > 0 ? i : n - 1 - i);
  const out = []; let guard = 0;
  const cr = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const inside = (p, a, b, c) => cr(a, b, p) >= -1e-12 && cr(b, c, p) >= -1e-12 && cr(c, a, p) >= -1e-12;
  while (idx.length > 3 && guard++ < 10000) {
    let cut = false;
    for (let i = 0; i < idx.length; i++) {
      const ia = idx[(i + idx.length - 1) % idx.length], ib = idx[i], ic = idx[(i + 1) % idx.length];
      const a = pts[ia], b = pts[ib], c = pts[ic];
      if (cr(a, b, c) <= 1e-12) continue;          // reflex or degenerate
      let ok = true;
      for (const j of idx) { if (j === ia || j === ib || j === ic) continue; if (inside(pts[j], a, b, c)) { ok = false; break; } }
      if (!ok) continue;
      out.push(ia, ib, ic); idx.splice(i, 1); cut = true; break;
    }
    if (!cut) { // numerically stuck (collinear points): fan the rest
      for (let i = 1; i < idx.length - 1; i++) out.push(idx[0], idx[i], idx[i + 1]);
      return out;
    }
  }
  if (idx.length === 3) out.push(idx[0], idx[1], idx[2]);
  return out;
}

// ------------------------------------------------------------------------------------------------------------ emitting
const clearCoated = new WeakMap();
/** Library material tweaks the table cannot express (car paint clear coat). Once per scene and material. */
function libMat(B, name) {
  const m = B.mat(name);
  if (name === 'p_chainlink' && m && m.alphaCutOff > .25) m.alphaCutOff = .2;
  if (/^p_car_/.test(name)) {
    let set = clearCoated.get(B.scene); if (!set) { set = new Set(); clearCoated.set(B.scene, set); }
    if (!set.has(name) && m && m.clearCoat) { set.add(name); m.clearCoat.isEnabled = true; m.clearCoat.intensity = .7; m.clearCoat.roughness = .06; }
  }
  return m;
}
function geoMesh(B, g, name, copy) {
  const m = new BABYLON.Mesh(name, B.scene);
  const vd = new BABYLON.VertexData();
  const f = a => (a instanceof Float32Array && !copy) ? a : new Float32Array(a);
  vd.positions = f(g.P); vd.normals = f(g.N); vd.uvs = f(g.U);
  if (g.C) vd.colors = f(g.C);
  vd.indices = (g.I instanceof Uint16Array || g.I instanceof Uint32Array) && !copy ? g.I : g.nv > 65535 ? new Uint32Array(g.I) : new Uint16Array(g.I);
  vd.applyToMesh(m, false);
  m.material = isCustom(g.mat) ? propMaterial(B.scene, g.mat, B.opts && B.opts.quality) : libMat(B, g.mat);
  m.isPickable = false;
  return m;
}
/**
 * Place a built kit with the MapBuilder at (x, y, z) in the CURRENT builder frame.
 * o: { ry, s, inst (thin instances: repeated identical props), collide (false = no colliders), hide (true = register the kit's
 *      hide hints), cast (false = no shadows), light (forwarded to the kit's light specs: false disables them) }
 * key: the instance key (type + variant) when o.inst.  Returns the first collider id or -1.
 */
export function emitKit(B, K, x, y, z, o = {}, key = 'prop') {
  let first = -1;
  B.push(x, y, z, o.ry || 0, o.s || 1);
  try {
    if (o.inst) {
      B.instance('prop:' + key, () => { const out = []; for (const g of K.geos.values()) if (g.I.length) out.push(geoMesh(B, g, 'prop_' + key + '_' + g.mat, true)); return out; }, 0, 0, 0, { collide: false });
    } else {
      for (const g of K.geos.values()) {
        if (!g.I.length) continue;
        const m = geoMesh(B, g, 'prop_' + key);
        B.mesh(m, isCustom(g.mat) ? { collide: 'none', cast: o.cast === false ? false : g.cast } : { mat: g.mat, collide: 'none', cast: o.cast === false ? false : g.cast });
      }
    }
    if (o.collide !== false) {
      for (const c of K.cols) {
        let id;
        if (c.cyl) id = B.cyl(c.x, c.y, c.z, c.r, c.h, { visible: false, surf: c.surf || 'metal', mat: 'steel' });
        else id = B.collider({ cx: c.x, cy: c.y + c.h / 2, cz: c.z, hx: c.w / 2, hy: c.h / 2, hz: c.d / 2, ry: c.ry || 0, surf: c.surf || 'metal',
          solid: c.solid, ray: c.ray, tag: c.tag, walk: c.walk });
        if (first < 0 && id >= 0) first = id;
      }
    }
    if (o.hide) for (const h of K.hides) B.hide(h.x, h.y, h.z, { kind: h.kind, r: h.r });
    if (o.light !== false) for (const L of K.lights) B.light(Object.assign({}, L, typeof o.light === 'object' ? o.light : null));
  } finally { B.pop(); }
  return first;
}
