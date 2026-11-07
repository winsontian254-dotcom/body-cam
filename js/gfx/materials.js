/* LIVE FIRE — PBR material library (CC0 photo textures + procedural fallbacks).
   Exports:
     MATERIALS                      { name: { surf, set, tex, scale, color?, desat?, rough?, metal?, bump?, macro?, anti?, por?,
                                       wet?, puddle?, kind?, col, proc?, emissive?, alpha?, parallax?, two? } }  (see DEF below)
     initMaterials(scene, { quality, names?, wet? }) -> Promise   quality tier + optional preload (resolves when the textures of
                                                                  `names` are on the GPU, or after 20 s); safe to call again
     getMaterial(scene, name) -> BABYLON.PBRMaterial              cached per scene; unknown names fall back to concrete (warns once)
     surfaceOf(name) -> surf                                      footsteps / penetration / impacts ('concrete' for unknown names)
     materialNames() -> [names]
     setWetness(scene, wet 0..1, { puddles 0..1, rain 0..1 })     rain maps (env.js calls it): darker albedo, lower roughness,
                                                                  puddles on flat ground, rain ripples in the puddles
     setSkyOcclusion(scene, occ | null)                           env.js: top-surface height map around the camera: roofed
                                                                  surfaces stay dry and get only `indoor` x the sky light (IBL):
                                                                  { tex, x, z, invCell, size, indoor }
     freezeMaterials(scene) / unfreezeMaterials(scene)            freeze once the map, environment and lights are set up
                                                                  (re-done automatically when a light is added or removed;
                                                                  materials with live uniforms — wet scenes, water — stay live)
     whenMaterialsReady(scene) -> Promise                         every texture requested so far has loaded (or fallen back)
     textureStats(scene) -> { textures, bytes, sets, fallbacks, failed: [urls] }   GPU memory estimate (for tools/test/gfx.mjs)
     disposeMaterials(scene)
   Texture sets live in assets/textures/<set>/<set>_{diff,nor,arm[,disp][,opacity]}.jpg (tools/fetch-assets.py, CC0);
   assets/textures/sets.json gives their real tile size and mean albedo.
   UV CONVENTION: map geometry carries world-anchored UVs in TEXTURE TILES: js/maps/builder.js divides world metres by
   MATERIALS[name].scale (metres per tile) when it emits a face, so the materials here use uScale = vScale = 1.
   Meshes added with their own UVs (B.mesh / props) must follow the same rule (1 UV unit = one texture tile).
   Shading: PBRMaterial (albedo + OpenGL normal + ARM: R AO, G roughness, B metalness), specular anti-aliasing, a detail map
   on high+, and the LF surface plugin: world-space macro variation (kills visible tiling), offset-blend anti-tiling on
   organic surfaces (medium+), tint / desaturation driven by an authored target colour, wetness with puddles and ripples.
   Parallax occlusion on ultra for sets that ship a height map. Every texture falls back to a procedural one (DynamicTexture-
   free RawTextures) if a file is missing, so a map never breaks. */

const B = () => BABYLON;
const ASSET_BASE = new URL('../../assets/', import.meta.url).href;

// ------------------------------------------------------------------------------------------------------------------
// Material table. Fields:
//   surf      physics surface (footsteps, penetration, impacts)
//   set       texture set under assets/textures (null = untextured / procedural only)
//   scale     metres per texture tile (UVs are metres)
//   color     authored target mean albedo, sRGB hex: the photo is re-tinted so its average becomes this colour
//   desat     0..1, how much of the photo's own colour is removed before tinting (1 = keep only its luminance)
//   bright    albedo multiplier when no color is given
//   rough     roughness multiplier (ARM green x rough), metal: metalness multiplier, bump: normal map strength
//   macro     amplitude of the world-space macro variation (default .12), anti: offset-blend anti-tiling (organic sets only)
//   por       porosity: how much the surface darkens when wet (0 metal/glass .. 1 dirt/fabric); wet: base wetness (always on)
//   puddle    puddle coverage when wet (flat surfaces only), kind: 'opaque' | 'glass' | 'water' | 'emissive' | 'cutout'
//   col       fallback colour (sRGB 0..1) for the procedural texture, proc: procedural pattern for the fallback
//   parallax  height of the relief in metres (parallax occlusion on ultra when the set has a height map)
const M = (surf, set, scale, o = {}) => Object.assign({ surf, set, tex: set ? 'assets/textures/' + set : null, scale }, o);
export const MATERIALS = {
  // concrete & asphalt
  concrete:        M('concrete', 'concrete_wall', 2.5, { color: '#8c8a85', desat: .7, macro: .2, anti: 1, por: .7, col: [.55, .55, .53], proc: 'noise' }),
  concrete_dark:   M('concrete', 'concrete_wall', 2.5, { color: '#55524e', desat: .6, macro: .2, anti: 1, por: .7, col: [.33, .33, .32], proc: 'noise' }),
  concrete_floor:  M('concrete', 'concrete_floor', 3.0, { color: '#7d7a74', desat: .4, macro: .16, anti: 1, por: .6, puddle: .55, col: [.5, .49, .47], proc: 'noise' }),
  concrete_panels: M('concrete', 'concrete_panels', 2.4, { color: '#8a8984', desat: .5, macro: .12, por: .6, col: [.55, .55, .53], proc: 'tile' }),
  pavement:        M('concrete', 'pavement', 1.8, { macro: .14, por: .6, puddle: .5, parallax: .008, col: [.55, .53, .5], proc: 'tile' }),
  asphalt:         M('asphalt', 'asphalt', 3.0, { macro: .14, anti: 1, por: .55, puddle: .6, col: [.18, .18, .19], proc: 'noise' }),
  asphalt_wet:     M('asphalt', 'asphalt', 3.0, { bright: .85, macro: .14, anti: 1, por: .55, wet: .85, puddle: .62, col: [.12, .12, .13], proc: 'noise' }),
  // masonry & plaster & tile
  brick:           M('brick', 'brick', 1.5, { macro: .14, por: .7, parallax: .02, col: [.55, .4, .32], proc: 'brick' }),
  brick_red:       M('brick', 'brick_red', 2.0, { macro: .14, por: .7, parallax: .02, col: [.5, .22, .17], proc: 'brick' }),
  plaster:         M('plaster', 'plaster', 1.6, { color: '#b5ad9f', desat: .4, macro: .14, anti: 1, por: .6, col: [.75, .72, .66], proc: 'noise' }),
  plaster_white:   M('plaster', 'plaster_white', 2.0, { color: '#d4d1ca', desat: .6, macro: .08, anti: 1, por: .5, col: [.88, .87, .84], proc: 'noise' }),
  tile_white:      M('tile', 'tile_white', 1.27, { macro: .06, rough: .8, por: .1, parallax: .004, col: [.85, .86, .86], proc: 'tile' }),
  tile_floor:      M('tile', 'tile_floor', 3.0, { macro: .08, por: .15, puddle: .4, parallax: .004, col: [.6, .58, .55], proc: 'tile' }),
  marble:          M('tile', 'marble', 1.5, { macro: .05, rough: .55, por: .05, col: [.85, .84, .8], proc: 'noise' }),
  ceiling_tile:    M('plaster', 'ceiling_tile', 3.6, { color: '#d9d8d2', desat: .8, macro: .05, por: .3, col: [.86, .86, .84], proc: 'tile' }),
  // wood
  wood_planks:     M('wood', 'wood_planks', 2.0, { macro: .12, por: .6, parallax: .01, col: [.5, .36, .22], proc: 'wood' }),
  wood_floor:      M('wood', 'wood_floor', 1.7, { macro: .08, rough: .85, por: .3, col: [.55, .38, .22], proc: 'wood' }),
  wood_dark:       M('wood', 'wood_dark', 2.0, { macro: .1, por: .5, col: [.3, .2, .12], proc: 'wood' }),
  plywood:         M('wood', 'plywood', 1.2, { macro: .12, por: .6, col: [.7, .58, .4], proc: 'wood' }),
  parquet:         M('wood', 'parquet', 2.4, { macro: .06, rough: .8, por: .25, col: [.6, .45, .3], proc: 'wood' }),
  wood_siding:     M('wood', 'wood_siding', 1.6, { macro: .12, por: .6, col: [.35, .28, .22], proc: 'wood' }),
  barn_red:        M('wood', 'wood_siding', 1.6, { color: '#7a2a20', desat: .85, macro: .14, por: .6, col: [.45, .16, .12], proc: 'wood' }),
  cardboard:       M('wood', 'cardboard', 1.0, { macro: .1, por: .9, col: [.62, .48, .32], proc: 'noise' }),
  // metal
  metal_plate:     M('metal', 'metal_plate', .6, { color: '#6e6e6c', desat: .6, macro: .1, por: .05, parallax: .003, col: [.5, .51, .52], proc: 'metal' }),
  metal_painted:   M('metal', 'painted_metal', 2.0, { color: '#4f5d63', desat: 1, macro: .1, por: .1, col: [.3, .4, .45], proc: 'metal' }),
  metal_rust:      M('metal', 'metal_rust', 2.2, { macro: .16, anti: 1, por: .3, col: [.45, .28, .17], proc: 'noise' }),
  corrugated:      M('sheetmetal', 'corrugated', 1.12, { macro: .14, por: .05, col: [.55, .57, .58], proc: 'corrugated' }),
  corrugated_rust: M('sheetmetal', 'corrugated_rust', 2.0, { macro: .14, por: .2, col: [.5, .3, .2], proc: 'corrugated' }),
  container:       M('sheetmetal', 'container', 1.94, { macro: .12, por: .1, col: [.25, .45, .3], proc: 'corrugated' }),
  container_red:   M('sheetmetal', 'container', 1.94, { color: '#8a2a1e', desat: 1, macro: .14, por: .1, col: [.5, .15, .1], proc: 'corrugated' }),
  container_blue:  M('sheetmetal', 'container', 1.94, { color: '#24456e', desat: 1, macro: .14, por: .1, col: [.15, .27, .43], proc: 'corrugated' }),
  container_orange: M('sheetmetal', 'container', 1.94, { color: '#b5561c', desat: 1, macro: .14, por: .1, col: [.7, .33, .1], proc: 'corrugated' }),
  container_grey:  M('sheetmetal', 'container', 1.94, { color: '#6f726f', desat: 1, macro: .14, por: .1, col: [.43, .44, .43], proc: 'corrugated' }),
  steel_dark:      M('metal', 'steel', 1.5, { color: '#3a3c3f', desat: 1, rough: 1.15, macro: .1, por: .02, col: [.2, .21, .22], proc: 'metal' }),
  steel:           M('metal', 'steel', 1.5, { macro: .08, por: .02, col: [.55, .56, .57], proc: 'metal' }),
  grate:           M('metal', 'grate', 1.0, { kind: 'cutout', two: 1, macro: .1, por: .02, col: [.3, .3, .32], proc: 'grate' }),
  chainlink:       M('metal', 'chainlink', 1.2, { kind: 'cutout', two: 1, macro: .06, por: .02, col: [.6, .6, .62], proc: 'grate' }),
  hazard:          M('metal', 'hazard', 1.5, { macro: .1, por: .1, col: [.9, .7, .1], proc: 'stripes' }),
  paint_yellow:    M('metal', 'painted_metal', 2.0, { color: '#c99a16', desat: 1, macro: .1, por: .1, col: [.85, .65, .1], proc: 'metal' }),
  paint_red:       M('metal', 'painted_metal', 2.0, { color: '#761c15', desat: .6, macro: .1, por: .1, col: [.6, .1, .08], proc: 'metal' }),
  paint_blue:      M('metal', 'painted_metal', 2.0, { color: '#1f3f78', desat: 1, macro: .1, por: .1, col: [.12, .25, .55], proc: 'metal' }),
  paint_green:     M('metal', 'painted_metal', 2.0, { color: '#2f4a2c', desat: 1, macro: .1, por: .1, col: [.18, .3, .17], proc: 'metal' }),
  paint_white:     M('metal', 'painted_metal', 2.0, { color: '#c8c8c3', desat: 1, macro: .08, por: .1, col: [.8, .8, .78], proc: 'metal' }),
  paint_black:     M('metal', 'painted_metal', 2.0, { color: '#202122', desat: 1, macro: .08, por: .1, col: [.12, .12, .13], proc: 'metal' }),
  // ground
  gravel:          M('gravel', 'gravel', 2.25, { color: '#857f74', desat: .55, macro: .16, anti: 1, por: .5, puddle: .35, col: [.45, .43, .4], proc: 'noise' }),
  dirt:            M('dirt', 'dirt', 4.0, { macro: .2, anti: 1, por: .8, puddle: .55, col: [.4, .32, .24], proc: 'noise' }),
  grass:           M('grass', 'grass', 3.0, { macro: .22, anti: 1, por: .6, puddle: .2, col: [.3, .42, .2], proc: 'noise' }),
  sand:            M('sand', 'sand', 6.0, { macro: .16, anti: 1, por: .6, puddle: .3, col: [.78, .68, .5], proc: 'noise' }),
  snow:            M('snow', 'snow', 3.0, { macro: .08, anti: 1, por: .1, col: [.92, .94, .97], proc: 'noise' }),
  rock:            M('concrete', 'rock', 3.0, { macro: .2, anti: 1, por: .5, parallax: .04, col: [.45, .44, .42], proc: 'noise' }),
  mud:             M('mud', 'mud', 2.0, { macro: .18, anti: 1, por: .9, wet: .45, puddle: .55, col: [.3, .24, .18], proc: 'noise' }),
  cobblestone:     M('concrete', 'cobblestone', 2.0, { macro: .14, por: .5, puddle: .5, parallax: .025, col: [.5, .48, .45], proc: 'tile' }),
  roof_tiles:      M('tile', 'roof_tiles', 2.5, { macro: .14, por: .4, parallax: .03, col: [.55, .3, .2], proc: 'tile' }),
  // soft
  carpet:          M('carpet', 'carpet', 1.0, { color: '#3d3a40', desat: .7, macro: .1, por: 1, col: [.3, .28, .32], proc: 'noise' }),
  fabric:          M('fabric', 'fabric', .5, { color: '#5a524c', desat: 1, macro: .1, por: 1, col: [.35, .3, .28], proc: 'noise' }),
  burlap:          M('fabric', 'burlap', .4, { macro: .12, por: 1, col: [.55, .47, .35], proc: 'noise' }),
  leather:         M('fabric', 'leather', .9, { macro: .06, por: .5, col: [.27, .09, .08], proc: 'noise' }),
  rubber:          M('rubber', 'rubber', .75, { macro: .08, por: .1, col: [.1, .1, .1], proc: 'noise' }),
  plastic_white:   M('rubber', null, 1, { col: [.8, .8, .78], rough: .45, macro: .05, por: .05, proc: 'noise' }),
  plastic_black:   M('rubber', null, 1, { col: [.06, .06, .065], rough: .5, macro: .05, por: .05, proc: 'noise' }),
  // special
  glass:           M('glass', null, 1, { kind: 'glass', col: [.6, .7, .75], alpha: .22, macro: .04, por: 0 }),
  glass_frosted:   M('glass', null, 1, { kind: 'glass', col: [.75, .8, .82], alpha: .7, rough: .35, macro: .04, por: 0 }),
  water:           M('water', null, 4, { kind: 'water', col: [.03, .06, .07], alpha: .9, por: 0 }),
  emissive_white:  M('glass', null, 1, { kind: 'emissive', col: [1, 1, 1], emissive: 6 }),
  emissive_warm:   M('glass', null, 1, { kind: 'emissive', col: [1, .78, .52], emissive: 5 }),
  emissive_red:    M('glass', null, 1, { kind: 'emissive', col: [1, .12, .08], emissive: 5 }),
  emissive_green:  M('glass', null, 1, { kind: 'emissive', col: [.25, 1, .35], emissive: 4 }),
};

export const surfaceOf = name => (MATERIALS[name] || MATERIALS.concrete).surf;
export const materialNames = () => Object.keys(MATERIALS);

// ------------------------------------------------------------------------------------------------------------------
// Quality: largest texture edge (albedo / normal, and the ARM data map), anisotropy, anti-tiling, detail map, parallax occlusion.
const QCFG = {
  low:    { max: 512,  arm: 256,  aniso: 2,  anti: false, detail: false, pom: false },
  medium: { max: 1024, arm: 512,  aniso: 4,  anti: true,  detail: false, pom: false },
  high:   { max: 2048, arm: 1024, aniso: 8,  anti: true,  detail: true,  pom: false },
  ultra:  { max: 2048, arm: 1024, aniso: 16, anti: true,  detail: true,  pom: true },
};
const qOf = q => QCFG[q] ? q : 'medium';

const STATE = new WeakMap();
let SETS = null, setsPromise = null;
function loadSets() {
  if (!setsPromise) setsPromise = fetch(ASSET_BASE + 'textures/sets.json').then(r => r.ok ? r.json() : {}).catch(() => ({})).then(j => (SETS = j));
  return setsPromise;
}

function st(scene) {
  let s = STATE.get(scene);
  if (!s) {
    s = { scene, q: 'medium', mats: new Map(), tex: new Map(), pending: new Set(), fallbacks: 0, failed: [], noise: null, detail: null, waves: null,
      wet: 0, puddles: .5, rain: 0, occ: null, frozen: false, warned: new Set(), obs: [], views: [], water: [] };
    STATE.set(scene, s);
    const re = () => { if (s.frozen) { unfreezeMaterials(scene); s.refreeze = true; } };
    s.obs.push([scene.onNewLightAddedObservable, scene.onNewLightAddedObservable.add(re)]);
    s.obs.push([scene.onLightRemovedObservable, scene.onLightRemovedObservable.add(re)]);
    s.obs.push([scene.onAfterRenderObservable, scene.onAfterRenderObservable.add(() => {
      if (s.refreeze && !s.pending.size) { s.refreeze = false; freezeMaterials(scene); }
      if (s.water.length) { const t = performance.now() / 1000; for (const w of s.water) w(t); }
    })]);
    // raw (resized / merged) textures keep no CPU copy: after a lost GPU context they are decoded and uploaded again
    const eng = scene.getEngine();
    s.obs.push([eng.onContextRestoredObservable, eng.onContextRestoredObservable.add(() => {
      for (const e of s.tex.values()) if (e.produce && !e.failed) e.produce().then(d => { if (!e.owner.isDisposed || !e.owner.isDisposed()) e.owner.update(d); }).catch(() => {});
    })]);
    scene.onDisposeObservable.addOnce(() => disposeMaterials(scene));
  }
  return s;
}

// ------------------------------------------------------------------------------------------------------------------
// Procedural textures (tileable value noise; RawTextures, no canvas)
function hash3(x, y, s) { let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function vnoise(x, y, period, seed) {   // tileable value noise, period in lattice cells
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const p = (a, b) => hash3(((a % period) + period) % period, ((b % period) + period) % period, seed);
  const a = p(xi, yi), b = p(xi + 1, yi), c = p(xi, yi + 1), d = p(xi + 1, yi + 1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}
function fbm(size, period, octaves, seed, gain = .5) {
  const out = new Float32Array(size * size);
  let amp = 1, tot = 0, per = period;
  for (let o = 0; o < octaves; o++) {
    const k = per / size;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) out[y * size + x] += amp * vnoise(x * k, y * k, per, seed + o * 17);
    tot += amp; amp *= gain; per *= 2;
  }
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < out.length; i++) { out[i] /= tot; lo = Math.min(lo, out[i]); hi = Math.max(hi, out[i]); }
  const r = hi - lo || 1; for (let i = 0; i < out.length; i++) out[i] = (out[i] - lo) / r;   // stretch to 0..1
  return out;
}
function rawRGBA(scene, data, size, name, linear = true) {
  const t = new (B().RawTexture)(data, size, size, B().Constants.TEXTUREFORMAT_RGBA, scene, true, false, B().Texture.TRILINEAR_SAMPLINGMODE);
  t.name = name; t.wrapU = t.wrapV = B().Texture.WRAP_ADDRESSMODE; t.gammaSpace = !linear;
  return t;
}
function heightToNormal(h, size, strength, out, oi = 0, stride = 4) {
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const l = h[y * size + ((x + size - 1) % size)], r = h[y * size + ((x + 1) % size)];
    const u = h[((y + size - 1) % size) * size + x], d = h[((y + 1) % size) * size + x];
    let nx = (l - r) * strength, ny = (d - u) * strength, nz = 1; const il = 1 / Math.hypot(nx, ny, nz);
    nx *= il; ny *= il; nz *= il;
    const i = (y * size + x) * stride + oi;
    out[i] = (nx * .5 + .5) * 255; out[i + 1] = (ny * .5 + .5) * 255; out[i + 2] = (nz * .5 + .5) * 255;
  }
}
// shared noise: R big blotches, G medium, B fine, A a second independent big field (all tileable, 256 px)
function makeNoise(scene) {
  const N = 256, r = fbm(N, 4, 5, 11), g = fbm(N, 8, 4, 23), b = fbm(N, 16, 3, 37), a = fbm(N, 4, 5, 51);
  const d = new Uint8Array(N * N * 4);
  for (let i = 0; i < N * N; i++) { d[i * 4] = r[i] * 255; d[i * 4 + 1] = g[i] * 255; d[i * 4 + 2] = b[i] * 255; d[i * 4 + 3] = a[i] * 255; }
  return rawRGBA(scene, d, N, 'lf_noise');
}
// Babylon detail map layout: R albedo (.5 neutral), G normal y, B roughness (.5 neutral), A normal x
function makeDetail(scene) {
  const N = 256, h = fbm(N, 16, 4, 71, .55), h2 = fbm(N, 32, 3, 83);
  const n = new Uint8Array(N * N * 4); heightToNormal(h, N, 6, n);
  const d = new Uint8Array(N * N * 4);
  for (let i = 0; i < N * N; i++) {
    d[i * 4] = 128 + (h2[i] - .5) * 90; d[i * 4 + 1] = n[i * 4 + 1]; d[i * 4 + 2] = 128 + (h[i] - .5) * 110; d[i * 4 + 3] = n[i * 4];
  }
  return rawRGBA(scene, d, N, 'lf_detail');   // per-material views repeat it every ~45 cm
}
function makeWaves(scene) {
  const N = 256, h = fbm(N, 8, 4, 91, .45), d = new Uint8Array(N * N * 4);
  heightToNormal(h, N, 5, d); for (let i = 0; i < N * N; i++) d[i * 4 + 3] = 255;
  return rawRGBA(scene, d, N, 'lf_waves');
}
// procedural fallback set for one material: { diff, nor, arm } RawTextures (size 256)
function procSet(scene, def) {
  const N = 256, kind = def.proc || 'noise', col = def.col || [.5, .5, .5];
  const h = new Float32Array(N * N), alb = new Float32Array(N * N), rough = new Float32Array(N * N).fill(.8), alpha = new Uint8Array(N * N).fill(255);
  const n1 = fbm(N, 8, 4, 5), n2 = fbm(N, 32, 3, 9);
  let metal = def.surf === 'metal' || def.surf === 'sheetmetal' ? .85 : 0;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x, u = x / N, v = y / N; let hh = n1[i] * .5 + n2[i] * .5, a = .85 + .3 * (n1[i] - .5) + .15 * (n2[i] - .5), r = .75 + .2 * n2[i];
    if (kind === 'brick') {   // 4 bricks across, 14 courses, running bond, 1 cm mortar
      const row = Math.floor(v * 14), bu = u * 4 + (row & 1) * .5, bv = v * 14;
      const mx = Math.min(bu - Math.floor(bu), 1 - (bu - Math.floor(bu))) * .25, my = Math.min(bv - row, 1 - (bv - row)) * .0714;
      const mortar = Math.min(mx, my) < .006; const bj = hash3(Math.floor(bu), row, 3);
      hh = mortar ? .1 : .7 + .3 * n2[i]; a = mortar ? 1.25 : .75 + .5 * bj + .2 * (n2[i] - .5); r = mortar ? .95 : .8;
    } else if (kind === 'tile') {
      const gu = u * 4, gv = v * 4, d = Math.min(gu - Math.floor(gu), 1 - gu + Math.floor(gu), gv - Math.floor(gv), 1 - gv + Math.floor(gv));
      const grout = d < .03; hh = grout ? .2 : .8; a = grout ? .7 : .95 + .1 * (n2[i] - .5); r = grout ? .9 : .35;
    } else if (kind === 'wood') {
      const plank = Math.floor(u * 6), pu = u * 6 - plank, edge = Math.min(pu, 1 - pu) < .02;
      const grain = .5 + .5 * Math.sin((v * 40 + n1[i] * 6 + hash3(plank, 0, 7) * 20) * Math.PI);
      hh = edge ? .1 : .7 + .1 * grain; a = edge ? .5 : .8 + .25 * grain + .2 * (hash3(plank, 1, 8) - .5); r = .7;
    } else if (kind === 'metal') {
      const streak = fbmRow(n2, i, N); hh = .5 + .05 * streak; a = .9 + .15 * streak; r = .35 + .2 * n1[i];
    } else if (kind === 'corrugated') {
      hh = .5 + .5 * Math.sin(u * Math.PI * 2 * 8); a = .9 + .15 * (n1[i] - .5); r = .5 + .2 * n1[i];
    } else if (kind === 'grate') {
      const gu = (u * 10) % 1, gv = (v * 10) % 1, bar = gu < .18 || gv < .18; alpha[i] = bar ? 255 : 0; hh = bar ? .8 : 0; r = .5;
    } else if (kind === 'stripes') {
      const s = ((u + v) * 6) % 1 < .5; a = s ? 1 : .08; r = .6; hh = .5 + .1 * n2[i];
      if (s) { alb[i] = -1; }
    }
    h[i] = hh; if (alb[i] !== -1) alb[i] = a; rough[i] = r;
  }
  const diff = new Uint8Array(N * N * 4), nor = new Uint8Array(N * N * 4), arm = new Uint8Array(N * N * 4);
  heightToNormal(h, N, kind === 'noise' ? 3 : 8, nor);
  for (let i = 0; i < N * N; i++) {
    const yel = alb[i] === -1;   // hazard stripes: yellow on black
    for (let c = 0; c < 3; c++) {
      const base = yel ? [.9, .7, .1][c] : col[c] * Math.max(0, alb[i]);
      diff[i * 4 + c] = Math.min(255, Math.pow(Math.max(0, base), 1 / 2.2) * 255);
    }
    diff[i * 4 + 3] = alpha[i]; nor[i * 4 + 3] = 255;
    arm[i * 4] = 255 * (.75 + .25 * h[i]); arm[i * 4 + 1] = 255 * rough[i]; arm[i * 4 + 2] = 255 * metal; arm[i * 4 + 3] = 255;
  }
  return { diff: rawRGBA(scene, diff, N, 'proc_diff', false), nor: rawRGBA(scene, nor, N, 'proc_nor'), arm: rawRGBA(scene, arm, N, 'proc_arm') };
}
function fbmRow(n, i, N) { const y = Math.floor(i / N); return n[y * N + ((i * 7) % N)] - .5; }

// ------------------------------------------------------------------------------------------------------------------
// Texture loading. Direct URL loads (engine-cached, shared by every material that uses the set) when the file fits the
// quality's size limit; otherwise (or to merge an alpha / height channel) decode -> resize -> RawTexture once per scene.
// Every material gets its own lightweight Texture VIEW (its own uScale) of the shared GPU texture.
function texUrl(set, kind) { return ASSET_BASE + 'textures/' + set + '/' + set + '_' + kind + '.jpg'; }
// hero sets ship albedo + normal at 2K; data maps (arm, disp, opacity) are always 1K
function sizeOfSet(set, kind = 'diff') { const s = SETS && SETS[set]; return s && s.res === '2k' && (kind === 'diff' || kind === 'nor') ? 2048 : 1024; }

async function decode(url, size) {
  const r = await fetch(url); if (!r.ok) throw new Error(r.status + ' ' + url);
  const blob = await r.blob();
  const bmp = await createImageBitmap(blob, { resizeWidth: size, resizeHeight: size, resizeQuality: 'high' });
  const cv = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(size, size) : Object.assign(document.createElement('canvas'), { width: size, height: size });
  const g = cv.getContext('2d', { willReadFrequently: true }); g.drawImage(bmp, 0, 0); bmp.close && bmp.close();
  return g.getImageData(0, 0, size, size).data;
}

// shared entry: { key, owner (the texture holding the GPU data), ready (Promise), failed, bytes }
function sharedTex(s, key, make) {
  let e = s.tex.get(key);
  if (!e) { e = make(); e.key = key; s.tex.set(key, e); s.pending.add(e.ready); e.ready.finally(() => s.pending.delete(e.ready)); }
  return e;
}
function directTex(s, url, linear) {
  return sharedTex(s, 'u|' + url, () => {
    const e = { failed: false, bytes: 0 };
    e.ready = new Promise(res => {
      e.owner = new (B().Texture)(url, s.scene, false, true, B().Texture.TRILINEAR_SAMPLINGMODE, () => {
        const sz = e.owner.getSize(); e.bytes = sz.width * sz.height * 4 * 1.333; res(true);
      }, () => { e.failed = true; s.failed.push(url); res(false); });
      e.owner.gammaSpace = !linear;
    });
    return e;
  });
}
function rawTex(s, key, size, linear, produce) {
  return sharedTex(s, 'r|' + key + '|' + size, () => {
    const e = { failed: false, bytes: size * size * 4 * 1.333 };
    e.owner = new (B().RawTexture)(null, size, size, B().Constants.TEXTUREFORMAT_RGBA, s.scene, true, true, B().Texture.TRILINEAR_SAMPLINGMODE);
    e.owner.gammaSpace = !linear; e.owner.name = key;
    e.ready = produce().then(data => {
      if (e.owner.isDisposed && e.owner.isDisposed()) return false;
      e.owner.update(data);
      const it = e.owner.getInternalTexture(); if (it) it._bufferView = null;   // no CPU copy (re-decoded on context restore)
      return true;
    }).catch(err => { e.failed = true; s.failed.push(key + ' (' + (err && err.message) + ')'); return false; });
    e.produce = produce;
    return e;
  });
}
// a per-material Texture object sharing the GPU texture of `owner` (own uScale/vScale/level)
function viewOf(s, owner, scale) {
  const T = B().Texture;
  if (owner instanceof T && owner.url && !(owner instanceof B().RawTexture)) {
    const t = owner.clone(); t.uScale = t.vScale = 1 / scale; s.views.push(t); return t;
  }
  const t = new T(null, s.scene, false, true, T.TRILINEAR_SAMPLINGMODE);
  const it = owner.getInternalTexture(); t._texture = it; it && it.incrementReferences(); s.views.push(t);
  t.gammaSpace = owner.gammaSpace; t.wrapU = t.wrapV = T.WRAP_ADDRESSMODE; t.uScale = t.vScale = 1 / scale; t.name = owner.name + '@' + scale;
  return t;
}

// texture for one map of a set, honouring the quality's size limit
function setTex(s, set, kind, linear) {
  const cfg = QCFG[s.q], full = sizeOfSet(set, kind), size = Math.min(full, kind === 'arm' ? cfg.arm : cfg.max);
  if (size === full) return directTex(s, texUrl(set, kind), linear);
  return rawTex(s, set + '_' + kind, size, linear, () => decode(texUrl(set, kind), size));
}
// albedo with the opacity mask in alpha (cut-outs), or normal with height in alpha (parallax occlusion)
function mergedTex(s, set, kindRGB, kindA, linear) {
  const size = Math.min(sizeOfSet(set, kindRGB), QCFG[s.q].max);
  return rawTex(s, set + '_' + kindRGB + '+' + kindA, size, linear, async () => {
    const [rgb, a] = await Promise.all([decode(texUrl(set, kindRGB), size), decode(texUrl(set, kindA), size)]);
    for (let i = 3; i < rgb.length; i += 4) rgb[i] = a[i - 1];   // red channel of the grey mask
    return rgb;
  });
}

// ------------------------------------------------------------------------------------------------------------------
// The LF surface plugin (GLSL injected into PBRMaterial)
const SRGB = h => { const v = parseInt(h.slice(1), 16), f = c => { c /= 255; return c <= .04045 ? c / 12.92 : Math.pow((c + .055) / 1.055, 2.4); };
  return [f(v >> 16 & 255), f(v >> 8 & 255), f(v & 255)]; };

const FRAG_DEFS = `
#ifdef LF_SURF
uniform sampler2D lfNoiseSampler;
#ifdef LF_OCC
uniform sampler2D lfOccSampler;
#endif
float lfWetK=0.;float lfPuddle=0.;float lfRoughMacro=0.;float lfTileK=0.;float lfSky=1.;
vec2 lfPlane(vec3 p,vec3 n){vec3 a=abs(n);return a.y>.7?p.xz:(a.x>a.z?p.zy:p.xy);}
float lfHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
#endif
`;
const FRAG_BEFORE_LIGHTS = `
#ifdef LF_SURF
{
vec3 lfN=geometricNormalW;
vec2 lfP=lfPlane(vPositionW,lfN);
vec4 lfA=texture2D(lfNoiseSampler,lfP*lfMacro.y);
vec4 lfB=texture2D(lfNoiseSampler,lfP*lfMacro.y*4.37+.31);
#if defined(LF_ANTITILE) && defined(ALBEDO)
lfTileK=smoothstep(.4,.6,texture2D(lfNoiseSampler,lfP*lfTile.w+.57).a)*lfTile.z;
vec4 lfAlt=texture2D(albedoSampler,vAlbedoUV+uvOffset+lfTile.xy);
#ifdef GAMMAALBEDO
vec3 lfC0=toLinearSpace(albedoTexture.rgb);vec3 lfC1=toLinearSpace(lfAlt.rgb);
#else
vec3 lfC0=albedoTexture.rgb;vec3 lfC1=lfAlt.rgb;
#endif
surfaceAlbedo*=mix(vec3(1.),min(lfC1/max(lfC0,vec3(.004)),vec3(6.)),lfTileK);
#ifdef BUMP
vec3 lfNb=perturbNormal(TBN,texture2D(bumpSampler,vBumpUV+uvOffset+lfTile.xy).xyz,vBumpInfos.y);
normalW=normalize(mix(normalW,lfNb,lfTileK));
#endif
#endif
float lfL=dot(surfaceAlbedo,vec3(.2126,.7152,.0722));
surfaceAlbedo=mix(surfaceAlbedo,vec3(lfL),lfTint.w)*lfTint.rgb;
float lfM=(lfA.r*.62+lfB.g*.38)-.5;
surfaceAlbedo*=max(0.,1.+lfMacro.x*2.2*lfM);
surfaceAlbedo=mix(surfaceAlbedo,surfaceAlbedo*vec3(1.07,1.,.88),clamp((lfA.a-.5)*lfMacro.w*2.,-1.,1.));
lfRoughMacro=lfM*lfMacro.z;
#ifdef LF_OCC
{
// sky visibility from the top-surface height map (env.js): 0 under a roof, 1 in the open; 4 taps = soft 0.5 m transitions
vec3 lfQ=vPositionW+lfN*.6;
vec2 lfD=abs(lfQ.xz-lfOcc.xy)*lfOcc.z;
vec2 lfG=lfQ.xz*lfOcc.z-.5;vec2 lfC0=floor(lfG);vec2 lfFr=fract(lfG);
float lfO00=step(texture2D(lfOccSampler,(mod(lfC0,lfOcc.w)+.5)/lfOcc.w).r,lfQ.y+.05);
float lfO10=step(texture2D(lfOccSampler,(mod(lfC0+vec2(1.,0.),lfOcc.w)+.5)/lfOcc.w).r,lfQ.y+.05);
float lfO01=step(texture2D(lfOccSampler,(mod(lfC0+vec2(0.,1.),lfOcc.w)+.5)/lfOcc.w).r,lfQ.y+.05);
float lfO11=step(texture2D(lfOccSampler,(mod(lfC0+vec2(1.,1.),lfOcc.w)+.5)/lfOcc.w).r,lfQ.y+.05);
lfSky=mix(1.,mix(mix(lfO00,lfO10,lfFr.x),mix(lfO01,lfO11,lfFr.x),lfFr.y),step(max(lfD.x,lfD.y),lfOcc.w*.5-2.));
}
#endif
#ifdef LF_WET
float lfExp=lfSky;
float lfUp=clamp((lfN.y-.6)*2.6,0.,1.);
float lfW=clamp(lfWet.x*lfExp,0.,1.);
float lfStreak=texture2D(lfNoiseSampler,vec2(lfP.x*.7,lfP.y*.06)).g;
lfW*=mix(.45+.55*smoothstep(.3,.7,lfStreak),1.,lfUp);
float lfLow=1.-(lfA.g*.6+lfB.b*.25+clamp(lfL*2.,0.,1.)*.15);
lfPuddle=lfUp*smoothstep(1.-lfWet.y,1.-lfWet.y+.07,lfLow)*clamp(lfW*1.5-.2,0.,1.);
lfWetK=lfW;
surfaceAlbedo*=mix(1.,1.-.5*lfWet.z,lfW)*mix(1.,.72,lfPuddle);
normalW=normalize(mix(normalW,geometricNormalW,lfPuddle*.94));
#ifdef LF_RIPPLE
vec2 lfRp=vPositionW.xz*3.2;vec2 lfCi=floor(lfRp);vec2 lfF=fract(lfRp)-.5-(vec2(lfHash(lfCi+1.7),lfHash(lfCi+3.1))-.5)*.5;
float lfPh=fract(lfOcc2.x*1.3+lfHash(lfCi));float lfR=length(lfF);
float lfWave=sin(clamp((lfR-lfPh*.45)*55.,-3.1416,3.1416))*(1.-lfPh)*(1.-lfPh)*step(lfR,.5);
normalW=normalize(normalW+vec3(lfF.x,0.,lfF.y)/max(lfR,.001)*lfWave*.12*lfPuddle*lfOcc2.y);
#endif
#endif
}
#endif
`;
const FRAG_ROUGH = `
#ifdef LF_SURF
#if defined(LF_OCC) && defined(AOSTOREINMETALMAPRED)
outParams.ambientOcclusionColor*=mix(lfOcc2.z,1.,lfSky);   // roofed: the sky light (IBL, diffuse + specular) mostly blocked
#endif
#if defined(LF_ANTITILE) && defined(REFLECTIVITY)
float lfRA=texture2D(reflectivitySampler,vReflectivityUV+lfTile.xy).g;
metallicRoughness.g*=mix(1.,clamp(lfRA/max(surfaceMetallicOrReflectivityColorMap.g,.03),0.,4.),lfTileK);
#endif
metallicRoughness.g=clamp(metallicRoughness.g+lfRoughMacro,.02,1.);
#ifdef LF_WET
metallicRoughness.g=mix(metallicRoughness.g,metallicRoughness.g*.42,lfWetK);
metallicRoughness.g=mix(metallicRoughness.g,.035,lfPuddle);
metallicRoughness.r*=1.-lfPuddle;
#endif
#endif
`;

let LFPluginClass = null;   // defined on first use, so this module can be imported where BABYLON is absent (Node tools)
function lfPlugin() { return LFPluginClass || (LFPluginClass = class LFSurfacePlugin extends BABYLON.MaterialPluginBase {
  constructor(material, s, def, u) {
    super(material, 'LFSurface', 210, { LF_SURF: false, LF_ANTITILE: false, LF_WET: false, LF_OCC: false, LF_RIPPLE: false }, true, true);
    this._s = s; this._def = def; this._u = u;
  }
  getClassName() { return 'LFSurfacePlugin'; }
  isCompatible(lang) { return lang === BABYLON.ShaderLanguage.GLSL; }
  prepareDefines(defines) {
    const s = this._s, d = this._def, wet = s.wet > 0 || (d.wet || 0) > 0;
    defines.LF_SURF = true;
    defines.LF_ANTITILE = !!(d.anti && QCFG[s.q].anti);
    defines.LF_WET = wet && (d.por !== undefined ? d.por > 0 || d.wet > 0 : true);
    defines.LF_OCC = !!s.occ;
    defines.LF_RIPPLE = defines.LF_WET && s.rain > 0 && s.q !== 'low';
  }
  getUniforms() {
    return { ubo: [{ name: 'lfMacro', size: 4, type: 'vec4' }, { name: 'lfTint', size: 4, type: 'vec4' }, { name: 'lfWet', size: 4, type: 'vec4' },
      { name: 'lfTile', size: 4, type: 'vec4' }, { name: 'lfOcc', size: 4, type: 'vec4' }, { name: 'lfOcc2', size: 4, type: 'vec4' }],
      fragment: '#ifdef LF_SURF\nuniform vec4 lfMacro;uniform vec4 lfTint;uniform vec4 lfWet;uniform vec4 lfTile;uniform vec4 lfOcc;uniform vec4 lfOcc2;\n#endif\n' };
  }
  getSamplers(samplers) { samplers.push('lfNoiseSampler', 'lfOccSampler'); }
  bindForSubMesh(ubo) {
    const s = this._s, d = this._def, u = this._u;
    ubo.updateFloat4('lfMacro', u.macro, u.macroScale, u.roughAmp, u.hue);
    ubo.updateFloat4('lfTint', u.tint[0], u.tint[1], u.tint[2], u.desat);
    const wet = Math.min(1, Math.max(s.wet, d.wet || 0));
    ubo.updateFloat4('lfWet', wet, wet > 0 ? Math.min(1, (d.puddle || 0) * (s.wet > 0 ? s.puddles * 2 : 1) * wet) : 0, d.por === undefined ? .5 : d.por, 0);
    ubo.updateFloat4('lfTile', .37, .61, 1, 1 / (u.tileScale));
    const o = s.occ;
    if (o) ubo.updateFloat4('lfOcc', o.x, o.z, o.invCell, o.size); else ubo.updateFloat4('lfOcc', 0, 0, 1, 0);
    ubo.updateFloat4('lfOcc2', performance.now() / 1000, s.rain, o && o.indoor !== undefined ? o.indoor : .3, 0);
    ubo.setTexture('lfNoiseSampler', s.noise);
    if (o && o.tex) ubo.setTexture('lfOccSampler', o.tex);
  }
  getCustomCode(type) {
    if (type !== 'fragment') return null;
    return { CUSTOM_FRAGMENT_DEFINITIONS: FRAG_DEFS, CUSTOM_FRAGMENT_BEFORE_LIGHTS: FRAG_BEFORE_LIGHTS, CUSTOM_FRAGMENT_UPDATE_METALLICROUGHNESS: FRAG_ROUGH };
  }
  getActiveTextures(list) { if (this._s.noise) list.push(this._s.noise); }
  hasTexture(t) { return t === this._s.noise; }
}); }

// ------------------------------------------------------------------------------------------------------------------
function tintOf(def) {
  const set = def.set && SETS && SETS[def.set];
  const desat = def.desat || 0;
  if (!def.color) { const b = def.bright || 1; return { tint: [b, b, b], desat }; }
  const want = SRGB(def.color);
  if (!set) return { tint: want.map(v => v / .2), desat: 1 };   // procedural fallback: unknown mean, assume .2
  const m = set.mean, lum = .2126 * m[0] + .7152 * m[1] + .0722 * m[2];
  const after = m.map(v => v + (lum - v) * desat);
  return { tint: want.map((v, i) => Math.min(8, v / Math.max(.01, after[i]))), desat };
}

function buildMaterial(s, name, def) {
  const BB = B(), scene = s.scene, cfg = QCFG[s.q];
  const mat = new BB.PBRMaterial('m_' + name, scene);   // 'm_' + name: builder.js maps a material object back to its name
  mat.metadata = { lf: name, surf: def.surf };
  const kind = def.kind || 'opaque';
  mat.enableSpecularAntiAliasing = true;
  mat.useRadianceOcclusion = true; mat.useHorizonOcclusion = true;
  mat.albedoColor = BB.Color3.White();
  mat.metallic = def.metal !== undefined ? def.metal : 1;
  mat.roughness = def.rough !== undefined ? def.rough : 1;
  const promises = [];
  if (kind === 'emissive') {
    const c = def.col; mat.albedoColor = new BB.Color3(0, 0, 0); mat.metallic = 0; mat.roughness = .4;
    mat.emissiveColor = new BB.Color3(c[0], c[1], c[2]); mat.emissiveIntensity = def.emissive || 4;
    mat.disableLighting = true; mat.environmentIntensity = 0;
    return { mat, ready: Promise.resolve() };
  }
  if (kind === 'glass') {
    const c = def.col; mat.albedoColor = new BB.Color3(c[0] * .25, c[1] * .25, c[2] * .25);
    mat.metallic = 0; mat.roughness = def.rough || .04; mat.alpha = def.alpha || .25;
    mat.transparencyMode = BB.PBRMaterial.PBRMATERIAL_ALPHABLEND;
    mat.useRadianceOverAlpha = true; mat.useSpecularOverAlpha = true; mat.backFaceCulling = true;
    mat.forceDepthWrite = false;
    new (lfPlugin())(mat, s, def, { macro: 0, macroScale: 1 / 3, roughAmp: .06, hue: 0, tint: [1, 1, 1], desat: 0, tileScale: 9 });
    return { mat, ready: Promise.resolve() };
  }
  if (kind === 'water') {
    const c = def.col; mat.albedoColor = new BB.Color3(c[0], c[1], c[2]); mat.metallic = 0; mat.roughness = .03; mat.alpha = def.alpha || .9;
    mat.transparencyMode = BB.PBRMaterial.PBRMATERIAL_ALPHABLEND; mat.useRadianceOverAlpha = true; mat.useSpecularOverAlpha = true;
    if (!s.waves) s.waves = makeWaves(scene);
    const w1 = viewOf(s, s.waves, 1), w2 = viewOf(s, s.waves, .37);   // UVs are in tiles of def.scale metres
    mat.bumpTexture = w1; w1.level = .55;
    mat.detailMap.texture = w2; mat.detailMap.isEnabled = true; mat.detailMap.bumpLevel = .6; mat.detailMap.diffuseBlendLevel = 0; mat.detailMap.roughnessBlendLevel = 0;
    s.water.push(t => { w1.uOffset = t * .021; w1.vOffset = t * .013; w2.uOffset = -t * .034; w2.vOffset = t * .027; });
    return { mat, ready: Promise.resolve() };
  }
  // textured opaque / cutout (UVs arrive in texture tiles: every view uses uScale 1)
  const scale = def.scale || 2, TILE = 1;
  const proc = () => (s._proc || (s._proc = new Map())).get(name) || (s._proc.set(name, procSet(scene, def)), s._proc.get(name));
  let set = def.set;
  if (set && SETS && Object.keys(SETS).length && !SETS[set]) set = null;   // index loaded and the set is not in it
  const assign = (slot, entry, fallbackKey, after) => {
    const apply = tex => { mat[slot] = tex; after && after(tex); };
    if (!entry) { const p = proc(); apply(viewOf(s, p[fallbackKey], TILE)); if (def.set) s.fallbacks++; return; }   // set-less = procedural by design
    apply(viewOf(s, entry.owner, TILE));
    promises.push(entry.ready.then(ok => { if (!ok) { const p = proc(); const old = mat[slot]; apply(viewOf(s, p[fallbackKey], TILE)); old && old.dispose(); s.fallbacks++; } }));
  };
  const aniso = t => { t.anisotropicFilteringLevel = cfg.aniso; };
  const sets = set && SETS ? SETS[set] : null;
  const hasMap = k => !sets || sets.maps.includes(k);
  if (kind === 'cutout') {
    assign('albedoTexture', set && hasMap('opacity') ? mergedTex(s, set, 'diff', 'opacity', false) : null, 'diff', t => { aniso(t); t.hasAlpha = true; });
    mat.useAlphaFromAlbedoTexture = true; mat.transparencyMode = BB.PBRMaterial.PBRMATERIAL_ALPHATEST; mat.alphaCutOff = .5;
    mat.backFaceCulling = !def.two; mat.twoSidedLighting = !!def.two;
  } else {
    assign('albedoTexture', set ? setTex(s, set, 'diff', false) : null, 'diff', aniso);
  }
  const pom = cfg.pom && def.parallax && set && hasMap('disp');
  assign('bumpTexture', set ? (pom ? mergedTex(s, set, 'nor', 'disp', true) : setTex(s, set, 'nor', true)) : null, 'nor', t => { aniso(t); t.level = def.bump || 1; });
  if (pom) { mat.useParallax = true; mat.useParallaxOcclusion = true; mat.parallaxScaleBias = Math.min(.08, def.parallax / scale); }
  assign('metallicTexture', set ? setTex(s, set, 'arm', true) : null, 'arm', aniso);
  mat.useAmbientOcclusionFromMetallicTextureRed = true; mat.useRoughnessFromMetallicTextureGreen = true; mat.useMetallnessFromMetallicTextureBlue = true;
  if (cfg.detail && (def.por || 0) >= .3 && kind !== 'cutout') {
    if (!s.detail) s.detail = makeDetail(scene);
    mat.detailMap.texture = viewOf(s, s.detail, .45 / scale); mat.detailMap.isEnabled = true;
    mat.detailMap.diffuseBlendLevel = .1; mat.detailMap.bumpLevel = .3; mat.detailMap.roughnessBlendLevel = .2;
  }
  const t = tintOf(def);
  new (lfPlugin())(mat, s, def, { macro: def.macro !== undefined ? def.macro : .12, macroScale: 1 / 23, roughAmp: .18 * (def.macro !== undefined ? def.macro : .12) / .12,
    hue: (def.macro || .12) * 1.2, tint: t.tint, desat: t.desat, tileScale: Math.max(scale * 3.3, 6) });
  return { mat, ready: Promise.all(promises) };
}

// ------------------------------------------------------------------------------------------------------------------
export async function initMaterials(scene, opts = {}) {
  const s = st(scene);
  if (opts.quality) s.q = qOf(opts.quality);
  if (opts.wet !== undefined) s.wet = +opts.wet || 0;
  await loadSets();
  if (!s.noise) s.noise = makeNoise(scene);
  const names = opts.names || [];
  for (const n of names) getMaterial(scene, n);
  await Promise.race([whenMaterialsReady(scene), new Promise(r => setTimeout(r, 20000))]);
}

export function getMaterial(scene, name) {
  const s = st(scene);
  let e = s.mats.get(name);
  if (e) return e.mat;
  let def = MATERIALS[name];
  if (!def) {
    if (!s.warned.has(name)) { s.warned.add(name); console.warn('[materials] unknown material "' + name + '", using concrete'); }
    def = MATERIALS.concrete;
  }
  if (!s.noise) s.noise = makeNoise(scene);
  if (!SETS) { loadSets(); }   // first use before initMaterials: textures resolve at 1K; the index arrives shortly
  e = buildMaterial(s, name, def);
  s.mats.set(name, e);
  return e.mat;
}

export function whenMaterialsReady(scene) {
  const s = st(scene);
  const wait = async () => { while (s.pending.size) await Promise.all([...s.pending]); };
  return wait();
}

export function setWetness(scene, wet, o = {}) {
  const s = st(scene);
  const was = s.wet > 0, wasRain = s.rain > 0;
  s.wet = Math.max(0, Math.min(1, +wet || 0));
  if (o.puddles !== undefined) s.puddles = Math.max(0, Math.min(1, o.puddles));
  if (o.rain !== undefined) s.rain = Math.max(0, Math.min(1, o.rain));
  if (was !== s.wet > 0 || wasRain !== s.rain > 0) redefine(s);
}
export function setSkyOcclusion(scene, occ) {
  const s = st(scene); const had = !!s.occ; s.occ = occ || null;
  if (had !== !!s.occ) redefine(s);
}
function redefine(s) {
  const fz = s.frozen; if (fz) unfreezeMaterials(s.scene);
  for (const { mat } of s.mats.values()) mat.markAsDirty(B().Material.MiscDirtyFlag);
  if (fz) s.refreeze = true;
}

export function freezeMaterials(scene) {
  const s = st(scene); s.frozen = true;
  for (const [name, { mat }] of s.mats) {
    const d = MATERIALS[name] || {};
    // per-frame uniforms (water offsets, ripples, the sky-occlusion window that follows the camera) keep a material live
    const live = d.kind !== 'emissive' && (d.kind === 'water' || s.wet > 0 || d.wet > 0 || !!s.occ);
    if (!live) mat.freeze();
  }
}
export function unfreezeMaterials(scene) {
  const s = st(scene); s.frozen = false;
  for (const { mat } of s.mats.values()) mat.unfreeze();
}

export function textureStats(scene) {
  const s = st(scene); let bytes = 0;
  for (const e of s.tex.values()) bytes += e.failed ? 0 : e.bytes || 0;
  for (const t of [s.noise, s.detail, s.waves]) if (t) bytes += 256 * 256 * 4 * 1.333;
  return { textures: s.tex.size, bytes, sets: new Set([...s.mats.keys()].map(n => (MATERIALS[n] || {}).set).filter(Boolean)).size,
    materials: s.mats.size, fallbacks: s.fallbacks, failed: s.failed.slice(), quality: s.q };
}

export function disposeMaterials(scene) {
  const s = STATE.get(scene); if (!s) return;
  for (const [o, h] of s.obs) o.remove(h);
  for (const { mat } of s.mats.values()) mat.dispose(false, false);
  for (const t of s.views) t.dispose();
  for (const e of s.tex.values()) e.owner && e.owner.dispose();
  if (s._proc) for (const p of s._proc.values()) { p.diff.dispose(); p.nor.dispose(); p.arm.dispose(); }
  for (const t of [s.noise, s.detail, s.waves]) t && t.dispose();
  STATE.delete(scene);
}
