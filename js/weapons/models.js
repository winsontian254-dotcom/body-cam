/* LIVE FIRE — procedural first-person / world gun models (Babylon). Geometry comes from js/weapons/gunkit.js (pure JS kit);
   this module owns the gun materials, skins, the per-gun model specs and the GunModel API. Contract: docs/ARCHITECTURE.md §5.
   Exports:
     initGunKit(scene) -> Promise           shared gun materials + procedural textures for this scene (buildGun also inits lazily)
     buildGun(scene, gunId, { lod: 0|1|2, skin, mods, instance }) -> GunModel   (cached per scene + id + lod + skin + intrinsic mods)
     buildAttachment(scene, attId, { lod, gun, slot, skin }) -> { root, meshes, eye?, lens?, length?, hand?, dispose }
     SKINS                                  [{ id, name, price, rarity, kind, desc, ... }] (factory + 15 original finishes)
     MODEL_SPECS                            { gunId: spec } — every built gun's composition (see "MODEL_SPECS" below + docs §5)
     BUILDERS                               { builderName: (K, spec, gun, ctx) => void } archetype builders used by the specs
     ATTACH_SPECS                           { attId: { kind, ... } } attachment model specs (part B fills / extends it)
     registerAttachmentBuilder(idOrKind, fn)   fn(K, att, ctx) -> { eye?, length?, lens?, hand? } (kit geometry, see docs §5)
     registerGunBuilder(name, fn), registerModelSpec(gunId, spec)   extension points for further gun families
     gunMaterial(scene, matId, skinId?) -> PBRMaterial,  MATS (material table),  PALETTES,  kitToMeshes(scene, built, palette, opts)
     modelInfo(gunId) -> { spec, builder, built: bool }   gunTris(gm) -> triangle count of a GunModel   clearGunCache(scene)
     runBuilder(K, spec, gun, ctx) -> K      run a gun builder into a Kit (tests, part B)
   GunModel = { id, gun, lod, skin, root, meshes, parts, sockets, muzzle, eject, sight: { eye, front, rear, line }, hands: { right, left },
     mods, attachments, info: { tris, buildMs, cached }, setMods(mods), dispose() }   (gun-local axes: +Z muzzle, +Y up, +X right,
     origin at the trigger, metres). setMods updates the SAME object in place (re-read parts/meshes after a magazine/barrel swap).
*/
import { getGun, GUNS } from './data.js';
import { getAttachment, fits } from './attachments.js';
import { Kit, TEX, ROLES, shape, rr, circle, ellipse, arc, mm, mlokSlots, rowSlots, mirrorU, hex2 } from './gunkit.js';
import { reticleMaterial, glintMaterial } from './scope.js';

const B = () => BABYLON;
const TAU = Math.PI * 2, HALF = Math.PI / 2;

// ------------------------------------------------------------------------------------------------------------------
// Materials. a = albedo (sRGB hex), m = metallic, r = roughness, n = normal map kind (gunkit TEX), ns = metres per normal tile,
// nl = normal strength, rm = roughness-variation map, rs = metres per roughness tile, tex = albedo map kind (wood), ts = metres per
// albedo tile, wear = [colour, metallic, roughness] that edge wear reveals, e = emissive colour, ei = emissive intensity, alpha.
export const MATS = {
  nitride:   { a: '#2c2d30', m: .8, r: .36, n: 'brush', ns: .05, nl: .1, rm: 'smudge', wear: ['#8a8c90', 1, .24] },
  park:      { a: '#3b3c3a', m: .62, r: .6, n: 'cast', ns: .022, nl: .42, rm: 'smudge', wear: ['#8f908f', 1, .3] },
  blued_k:   { a: '#1e232c', m: 1, r: .4, n: 'knurl', ns: .008, nl: .9, wear: ['#9a9ca0', 1, .25] },
  steel_k:   { a: '#b6b7b9', m: 1, r: .32, n: 'knurl', ns: .008, nl: .9, wear: ['#d2d2d4', 1, .2] },
  bakelite:  { a: '#3a1c12', m: 0, r: .42, n: 'checker', ns: .011, nl: .9, wear: ['#5c3424', 0, .35] },
  rubber_g:  { a: '#161617', m: 0, r: .88, n: 'stipple', ns: .009, nl: .8 },
  blued:     { a: '#1e232c', m: 1, r: .24, n: 'brush', ns: .035, nl: .14, rm: 'smudge', wear: ['#9a9ca0', 1, .2] },
  steel:     { a: '#8d8e91', m: 1, r: .3, n: 'brush', ns: .04, nl: .14, rm: 'smudge', wear: ['#bdbec0', 1, .18] },
  dksteel:   { a: '#303135', m: .9, r: .42, n: 'cast', ns: .02, nl: .28, rm: 'smudge', wear: ['#8c8d90', 1, .26] },
  stainless: { a: '#b6b7b9', m: 1, r: .22, n: 'brush', ns: .03, nl: .2, rm: 'smudge', wear: ['#d2d2d4', 1, .14] },
  chrome:    { a: '#d4d5d7', m: 1, r: .1, wear: ['#e0e0e2', 1, .08] },
  stamp:     { a: '#26282c', m: .85, r: .5, n: 'cast', ns: .02, nl: .4, rm: 'smudge', wear: ['#7d7f83', 1, .3] },
  alu_blk:   { a: '#222326', m: .45, r: .46, n: 'cast', ns: .014, nl: .18, rm: 'smudge', wear: ['#bcbdc0', 1, .3] },
  alu_gry:   { a: '#4d5054', m: .5, r: .44, n: 'cast', ns: .014, nl: .18, rm: 'smudge', wear: ['#c4c5c8', 1, .28] },
  cer_fde:   { a: '#8a7757', m: .12, r: .56, n: 'cast', ns: .014, nl: .2, rm: 'smudge', wear: ['#b8b9bc', 1, .3] },
  cer_od:    { a: '#4e543f', m: .12, r: .56, n: 'cast', ns: .014, nl: .2, rm: 'smudge', wear: ['#b8b9bc', 1, .3] },
  poly_blk:  { a: '#1e1e20', m: 0, r: .58, n: 'poly', ns: .02, nl: .3, rm: 'smudge', rs: .12, wear: ['#232325', 0, .4] },
  poly_grp:  { a: '#1e1e20', m: 0, r: .74, n: 'stipple', ns: .011, nl: 1, wear: ['#212123', 0, .58] },
  poly_gry:  { a: '#2b2d31', m: 0, r: .56, n: 'poly', ns: .02, nl: .3, rm: 'smudge', rs: .12, wear: ['#5a5d61', 0, .66] },
  poly_gryg: { a: '#2b2d31', m: 0, r: .72, n: 'stipple', ns: .011, nl: 1, wear: ['#55585c', 0, .78] },
  poly_fde:  { a: '#86724f', m: 0, r: .6, n: 'poly', ns: .02, nl: .3, rm: 'smudge', rs: .12, wear: ['#a08c68', 0, .7] },
  poly_fdeg: { a: '#86724f', m: 0, r: .72, n: 'stipple', ns: .011, nl: 1, wear: ['#8c7856', 0, .58] },
  poly_od:   { a: '#4c513e', m: 0, r: .6, n: 'poly', ns: .02, nl: .3, rm: 'smudge', rs: .12, wear: ['#646a55', 0, .7] },
  poly_brn:  { a: '#3a2a20', m: 0, r: .5, n: 'poly', ns: .02, nl: .3, rm: 'smudge', rs: .12, wear: ['#5a4434', 0, .6] },
  rubber:    { a: '#141415', m: 0, r: .9, n: 'rubber', ns: .01, nl: .7 },
  walnut:    { tex: 'walnut', ts: .32, m: 0, r: .4, n: 'wood', ns: .32, nl: .3, rm: 'wood', rs: .3, wear: ['#9a7046', 0, .6] },
  walnut_chk:{ tex: 'walnut', ts: .32, m: 0, r: .55, n: 'checker', ns: .012, nl: .9, wear: ['#9a7046', 0, .65] },
  beech:     { tex: 'beech', ts: .32, m: 0, r: .45, n: 'wood', ns: .32, nl: .3, rm: 'wood', rs: .3, wear: ['#c9955f', 0, .6] },
  laminate:  { tex: 'laminate', ts: .2, m: 0, r: .36, n: 'wood', ns: .3, nl: .2, rm: 'wood', rs: .3, wear: ['#b8784a', 0, .55] },
  brass:     { a: '#b38a44', m: 1, r: .3, rm: 'smudge', wear: ['#dcb872', 1, .2] },
  copper:    { a: '#b4653c', m: 1, r: .34, wear: ['#d68a5e', 1, .25] },
  casehard:  { a: '#5a5650', m: 1, r: .3, n: 'brush', ns: .03, nl: .15, rm: 'smudge', wear: ['#a8a8a6', 1, .2] },
  nickel:    { a: '#a9aaa8', m: 1, r: .2, n: 'brush', ns: .03, nl: .15, wear: ['#cfcfcd', 1, .12] },
  bore:      { a: '#070707', m: .4, r: .7 },
  spring:    { a: '#404145', m: 1, r: .38, n: 'brush', ns: .02, nl: .2 },
  fibre_r:   { a: '#280400', m: 0, r: .3, e: '#ff3414', ei: 2.4 },
  fibre_g:   { a: '#032800', m: 0, r: .3, e: '#4dff38', ei: 2.4 },
  trit:      { a: '#b9c4b2', m: 0, r: .4, e: '#7aff62', ei: .9 },
  white:     { a: '#d9d7cd', m: 0, r: .5 },
  orange:    { a: '#e5531b', m: 0, r: .5 },
  fabric_od: { a: '#3e4331', m: 0, r: .96, n: 'fabric', ns: .006, nl: .85 },
  fabric_blk:{ a: '#1d1e1f', m: 0, r: .96, n: 'fabric', ns: .006, nl: .85 },
  trans:     { a: '#3a3e46', m: 0, r: .22, alpha: .6 },
  glass:     { a: '#0b0d12', m: 0, r: .04, alpha: .3 },
  paint_red: { a: '#8c1a14', m: 0, r: .45 },
};
/** palettes: material role (gunkit ROLES) -> MATS id. Specs pick a base palette and override roles. */
const BASE_PAL = { rcv: 'nitride', frame: 'poly_blk', slide: 'nitride', furn: 'poly_blk', grip: 'poly_grp', metal: 'dksteel', barrel: 'nitride',
  dark: 'dksteel', bright: 'steel', bore: 'bore', wood: 'walnut', wood2: 'walnut_chk', rubber: 'rubber', brass: 'brass', copper: 'copper',
  spring: 'spring', alu: 'alu_blk', alu2: 'alu_blk', fibre_r: 'fibre_r', fibre_g: 'fibre_g', trit: 'trit', white: 'white', trans: 'trans',
  glass: 'glass', fabric: 'fabric_od', mag: 'poly_blk', stamp: 'stamp' };
export const PALETTES = {
  polymer: { ...BASE_PAL },
  black:   { ...BASE_PAL, rcv: 'alu_blk', frame: 'poly_blk', mag: 'poly_blk' },
  steel:   { ...BASE_PAL, rcv: 'blued', slide: 'blued', barrel: 'blued', metal: 'blued', furn: 'poly_blk', mag: 'blued' },
  wood:    { ...BASE_PAL, rcv: 'blued', slide: 'blued', barrel: 'blued', metal: 'blued', furn: 'walnut', mag: 'blued', grip: 'walnut_chk' },
  park:    { ...BASE_PAL, rcv: 'park', slide: 'park', barrel: 'park', metal: 'park', mag: 'park', stamp: 'park' },
  att:     { ...BASE_PAL, rcv: 'alu_blk', frame: 'poly_blk', metal: 'dksteel' },
};
// roles a skin may recolour (metal small parts, bores, brass, sights and wood stay)
const SKIN_ROLES = ['rcv', 'frame', 'slide', 'furn', 'grip', 'alu', 'alu2', 'mag', 'stamp'];

/* SKINS: factory + 15 original finishes. kind: tint (solid cerakote / anodising per role group), twotone (metal one colour,
   furniture another), camo (procedural pattern from gunkit PATTERNS), worn (factory colours, heavy edge wear), full (also the
   barrel and small parts). colors = pattern colours; tint = { metal, poly }; scale = metres per pattern tile; wear = x factor. */
export const SKINS = [
  { id: 'factory', name: 'Factory', price: 0, rarity: 'common', kind: 'factory', desc: 'As it left the maker.' },
  { id: 'graphite', name: 'Graphite', price: 300, rarity: 'common', kind: 'tint', tint: { metal: '#3d4045', poly: '#3a3d41' }, desc: 'Matte graphite cerakote on every coated part.' },
  { id: 'fde', name: 'Flat Dark Earth', price: 450, rarity: 'common', kind: 'tint', tint: { metal: '#8a7757', poly: '#86724f' }, desc: 'Desert tan cerakote and furniture.' },
  { id: 'olive', name: 'Olive Drab', price: 450, rarity: 'common', kind: 'tint', tint: { metal: '#4e543f', poly: '#4c513e' }, desc: 'Field olive cerakote and furniture.' },
  { id: 'twotone', name: 'Two-Tone Patrol', price: 600, rarity: 'uncommon', kind: 'twotone', tint: { metal: '#26272a', poly: '#86724f' }, desc: 'Black metal, tan furniture.' },
  { id: 'sentry', name: 'Sentry Grey', price: 600, rarity: 'uncommon', kind: 'twotone', tint: { metal: '#5a5e63', poly: '#1f2022' }, desc: 'Sniper-grey metal with black furniture.' },
  { id: 'woodland', name: 'Fernline Woodland', price: 900, rarity: 'rare', kind: 'camo', pattern: 'woodland', scale: .34, colors: ['#5f6447', '#3a3f2b', '#7a6a4a', '#1d1d18'], desc: 'Four-colour woodland blotch.' },
  { id: 'arid', name: 'Dune Drift', price: 900, rarity: 'rare', kind: 'camo', pattern: 'arid', scale: .4, colors: ['#b49a72', '#8a6f4c', '#d2bf98'], desc: 'Three-colour arid blotch.' },
  { id: 'digital', name: 'Gridlock Urban', price: 1000, rarity: 'rare', kind: 'camo', pattern: 'digital', scale: .3, colors: ['#7a7d80', '#4b4e52', '#a9abad', '#2a2b2e'], desc: 'Pixel-block urban greys.' },
  { id: 'tiger', name: 'Reedline Tiger', price: 1100, rarity: 'rare', kind: 'camo', pattern: 'tiger', scale: .3, colors: ['#6d6a45', '#2e3020', '#4d4a2c', '#141410'], desc: 'Horizontal reed stripes.' },
  { id: 'splinter', name: 'Shardfall', price: 1200, rarity: 'epic', kind: 'camo', pattern: 'splinter', scale: .3, colors: ['#7c7f6a', '#4f553f', '#9c8c6a', '#2d2f26'], desc: 'Angular shard pattern with rain streaks.' },
  { id: 'arctic', name: 'Whiteout', price: 1200, rarity: 'epic', kind: 'camo', pattern: 'arctic', scale: .36, colors: ['#d6d8d8', '#9da3a6', '#eef0f0', '#5f6467'], desc: 'Snow-field white with ice-grey blots.' },
  { id: 'carbon', name: 'Carbon Weave', price: 1300, rarity: 'epic', kind: 'camo', pattern: 'carbon', scale: .05, colors: ['#26282b', '#17181a'], desc: 'Clear-coated carbon-fibre weave wrap.' },
  { id: 'hexcell', name: 'Honeycomb', price: 1300, rarity: 'epic', kind: 'camo', pattern: 'hex', scale: .25, colors: ['#3b3f45', '#2b2e33', '#4a4f56', '#33373c', '#17181a'], desc: 'Hex-cell tactical wrap.' },
  { id: 'cobalt', name: 'Cobalt Anodise', price: 1500, rarity: 'epic', kind: 'twotone', tint: { metal: '#24406e', poly: '#1c1d20' }, gloss: true, desc: 'Deep blue anodised metal, black furniture.' },
  { id: 'battleworn', name: 'Battle-Worn', price: 800, rarity: 'uncommon', kind: 'worn', wear: 3.2, desc: 'Years of holster, sling and range: bare metal on every edge.' },
  { id: 'nickel', name: 'Bright Nickel', price: 2000, rarity: 'legendary', kind: 'full', tint: { metal: '#a9aaa8', poly: '#1c1c1e' }, nickel: true, desc: 'Polished nickel plating on all steel, black grips.' },
];
const SKIN_BY = new Map(SKINS.map(s => [s.id, s]));

// ------------------------------------------------------------------------------------------------------------------
// per-scene state
const STATE = new WeakMap();
function st(scene) {
  let s = STATE.get(scene);
  if (!s) {
    s = { scene, tex: new Map(), mats: new Map(), templates: new Map(), atts: new Map(), noise: null, root: null };
    STATE.set(scene, s);
    scene.onDisposeObservable.addOnce(() => STATE.delete(scene));
  }
  return s;
}
const lin = h => { const c = hex2(h); return c.map(v => { v /= 255; return v <= .04045 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }); };
function rawTex(s, key, gen, linear = true) {
  let t = s.tex.get(key); if (t) return t;
  const BB = B(), img = gen();
  t = new BB.RawTexture(img.data, img.w, img.h, BB.Constants.TEXTUREFORMAT_RGBA, s.scene, true, false, BB.Texture.TRILINEAR_SAMPLINGMODE, BB.Constants.TEXTURETYPE_UNSIGNED_BYTE);
  t.name = 'gk_' + key; t.wrapU = t.wrapV = BB.Texture.WRAP_ADDRESSMODE; t.anisotropicFilteringLevel = 8; t.gammaSpace = !linear;
  s.tex.set(key, t); return t;
}
const texView = (base, scale) => { const t = base.clone(); t.uScale = t.vScale = 1 / scale; return t; };

// GunWear: edge wear from a per-vertex attribute 'gwear' (chipped by a noise texture in object space).
let WearPlugin = null;
function wearPlugin() {
  if (WearPlugin) return WearPlugin;
  const BB = B();
  WearPlugin = class GunWearPlugin extends BB.MaterialPluginBase {
    constructor(material, s, wear) { super(material, 'GunWear', 230, { GUNWEAR: false }, true, true); this._s = s; this._w = wear; }
    getClassName() { return 'GunWearPlugin'; }
    isCompatible(lang) { return lang === BB.ShaderLanguage.GLSL; }
    prepareDefines(defines, scene, mesh) { defines.GUNWEAR = !!(mesh && mesh.isVerticesDataPresent && mesh.isVerticesDataPresent('gwear')); }
    getAttributes(attributes, scene, mesh) { if (mesh && mesh.isVerticesDataPresent && mesh.isVerticesDataPresent('gwear')) attributes.push('gwear'); }
    getUniforms() {
      return { ubo: [{ name: 'gwA', size: 4, type: 'vec4' }, { name: 'gwB', size: 4, type: 'vec4' }],
        fragment: '#ifdef GUNWEAR\nuniform vec4 gwA;uniform vec4 gwB;\n#endif\n' };
    }
    getSamplers(samplers) { samplers.push('gwNoiseSampler'); }
    bindForSubMesh(ubo) {
      const w = this._w; ubo.updateFloat4('gwA', w.c[0], w.c[1], w.c[2], w.k); ubo.updateFloat4('gwB', w.m, w.r, w.ns, 0);
      ubo.setTexture('gwNoiseSampler', this._s.noise);
    }
    getActiveTextures(list) { if (this._s.noise) list.push(this._s.noise); }
    hasTexture(t) { return t === this._s.noise; }
    getCustomCode(type) {
      if (type === 'vertex') return {
        CUSTOM_VERTEX_DEFINITIONS: '#ifdef GUNWEAR\nattribute float gwear;\nvarying float vGwear;\nvarying vec3 vGwPos;\n#endif\n',
        CUSTOM_VERTEX_MAIN_END: '#ifdef GUNWEAR\nvGwear=gwear;vGwPos=position;\n#endif\n' };
      return {
        CUSTOM_FRAGMENT_DEFINITIONS: '#ifdef GUNWEAR\nuniform sampler2D gwNoiseSampler;varying float vGwear;varying vec3 vGwPos;float gwK=0.;\n#endif\n',
        CUSTOM_FRAGMENT_BEFORE_LIGHTS: `#ifdef GUNWEAR
{vec2 gwUV=vec2(vGwPos.z+vGwPos.x*.61,vGwPos.y-vGwPos.x*.43)*gwB.z;
vec4 gwN=texture2D(gwNoiseSampler,gwUV);vec4 gwN2=texture2D(gwNoiseSampler,gwUV*3.7+.29);
float gwT=gwN.r*.62+gwN2.g*.38;float gwW=vGwear*gwA.w;
gwK=smoothstep(gwT-.06,gwT+.06,gwW*.6);
surfaceAlbedo=mix(surfaceAlbedo,gwA.rgb,gwK);}
#endif
`,
        CUSTOM_FRAGMENT_UPDATE_METALLICROUGHNESS: '#ifdef GUNWEAR\nmetallicRoughness.r=mix(metallicRoughness.r,gwB.x,gwK);metallicRoughness.g=mix(metallicRoughness.g,gwB.y,gwK);\n#endif\n',
      };
    }
  };
  return WearPlugin;
}

/** the scene material for MATS[id] (optionally recoloured by a skin for a skinnable role) */
export function gunMaterial(scene, id, skinId = 'factory', role = null) {
  const s = st(scene), skin = SKIN_BY.get(skinId) || SKINS[0];
  const skinned = skin.kind !== 'factory' && skin.kind !== 'worn' && role && (SKIN_ROLES.includes(role) || (skin.kind === 'full' && ['barrel', 'metal'].includes(role)));
  const key = skinned ? id + '@' + skin.id + ':' + skinClass(id, role) : id;
  let m = s.mats.get(key); if (m) return m;
  const BB = B(), def = MATS[id] || MATS.poly_blk;
  if (!s.noise) s.noise = rawTex(s, 'noise', () => TEX.noise(256));
  m = new BB.PBRMaterial('gun_' + key, scene);
  m.metadata = { gunMat: id, skin: skinned ? skin.id : 'factory' };
  m.enableSpecularAntiAliasing = true; m.useRadianceOcclusion = true; m.useHorizonOcclusion = true;
  let alb = def.a ? lin(def.a) : [1, 1, 1], metal = def.m ?? 0, rough = def.r ?? .5, wear = def.wear;
  if (def.tex) { const sz = def.tex === 'walnut' ? 512 : 256; m.albedoTexture = texView(rawTex(s, 'alb_' + def.tex + sz, () => TEX.albedo(def.tex, sz), false), def.ts || .3); alb = def.tint ? lin(def.tint) : [1, 1, 1]; }
  if (skinned) {
    const cls = skinClass(id, role);
    if (skin.kind === 'camo') {
      m.albedoTexture = texView(rawTex(s, 'camo_' + skin.id, () => TEX.albedo(skin.pattern, 256, skin.colors), false), skin.scale || .3);
      alb = [1, 1, 1]; if (cls === 'metal') { metal = Math.min(metal, .2); rough = Math.max(rough, .5); }
      if (def.tex) rough = .55;
    } else {
      const t = skin.tint || {}, hx = cls === 'metal' ? t.metal : t.poly;
      if (hx) { alb = lin(hx); if (m.albedoTexture) { m.albedoTexture = null; } }
      if (skin.kind === 'full' && skin.nickel && cls === 'metal') { metal = 1; rough = .2; }
      else if (cls === 'metal' && skin.kind !== 'full') { metal = skin.gloss ? .7 : .15; rough = skin.gloss ? .3 : .55; }
      if (def.tex && hx) rough = .55;
    }
    if (cls === 'metal') wear = ['#b5b6b9', 1, .3];
  }
  m.albedoColor = new BB.Color3(alb[0], alb[1], alb[2]);
  m.metallic = metal; m.roughness = rough;
  if (def.n) { const nt = texView(rawTex(s, 'n_' + def.n, () => TEX.normal(def.n, 256)), def.ns || .02); m.bumpTexture = nt; nt.level = def.nl ?? .4; }
  if (def.rm) { m.metallicTexture = texView(rawTex(s, 'r_' + def.rm, () => TEX.rough(def.rm, 256)), def.rs || .16);
    m.useRoughnessFromMetallicTextureGreen = true; m.useMetallnessFromMetallicTextureBlue = true; m.useAmbientOcclusionFromMetallicTextureRed = false; }
  if (def.e) { const e = lin(def.e); m.emissiveColor = new BB.Color3(e[0], e[1], e[2]); m.emissiveIntensity = def.ei || 1; }
  if (def.alpha) { m.alpha = def.alpha; m.transparencyMode = BB.PBRMaterial.PBRMATERIAL_ALPHABLEND; m.useRadianceOverAlpha = true; m.useSpecularOverAlpha = true; m.needDepthPrePass = true; }
  if (wear) { const c = lin(wear[0]); new (wearPlugin())(m, s, { c, k: 1, m: wear[1], r: wear[2], ns: 34 }); }
  s.mats.set(key, m);
  return m;
}
const skinClass = (id, role) => (['poly_', 'rubber', 'walnut', 'beech', 'laminate'].some(p => id.startsWith(p)) || role === 'furn' || role === 'grip' || role === 'frame' || role === 'mag' && id.startsWith('poly') ? 'poly' : 'metal');

export async function initGunKit(scene) {
  const s = st(scene);
  if (s.ready) return s.ready;
  s.ready = (async () => {
    const tick = () => new Promise(r => setTimeout(r, 0));
    // every gun material (textures are generated once per page and uploaded per scene), yielding between them
    for (const id of Object.keys(MATS)) { gunMaterial(scene, id); await tick(); }
  })();
  return s.ready;
}

// ------------------------------------------------------------------------------------------------------------------
// kit result -> Babylon nodes + meshes (one mesh per part per material role)
export function kitToMeshes(scene, built, palette, { name = 'gun', skin = 'factory', parent = null } = {}) {
  const BB = B(), root = new BB.TransformNode(name, scene); if (parent) root.parent = parent;
  root.metadata = { gk: 'root' };
  const nodes = { body: root }, meshes = [];
  for (const P of built.parts) {
    let node = root;
    if (P.name !== 'body') {
      node = new BB.TransformNode(name + '/' + P.name, scene);
      node.metadata = { gk: 'part:' + P.name, meta: P.meta || null, rest: P.local.slice() };
      nodes[P.name] = node;
    }
  }
  for (const P of built.parts) {
    const node = nodes[P.name];
    if (P.name !== 'body') { node.parent = nodes[P.parent] || root; node.position.set(P.local[0], P.local[1], P.local[2]); if (P.hide) node.setEnabled(false); }
    for (const [role, R] of Object.entries(P.roles)) {
      const mesh = new BB.Mesh(name + '/' + P.name + '/' + role, scene);
      const vd = new BB.VertexData(); vd.positions = R.p; vd.normals = R.n; vd.uvs = R.uv; vd.colors = R.c; vd.indices = R.i;
      vd.applyToMesh(mesh, false);
      mesh.setVerticesData('gwear', R.w, false, 1);
      mesh.parent = node; mesh.isPickable = false; mesh.receiveShadows = true;
      const matId = (palette && palette[role]) || BASE_PAL[role] || 'poly_blk';
      mesh.material = gunMaterial(scene, matId, skin, role);
      mesh.metadata = { gk: 'mesh', role, part: P.name };
      meshes.push(mesh);
    }
  }
  const loc = {};
  for (const [nm, N] of Object.entries(built.nodes)) {
    const t = new BB.TransformNode(name + '#' + nm, scene), owner = nodes[N.part] || root;
    t.parent = owner; const pv = owner === root ? [0, 0, 0] : partWorldPivot(built, N.part);
    t.position.set(N.p[0] - pv[0], N.p[1] - pv[1], N.p[2] - pv[2]); t.rotation.set(N.r[0], N.r[1], N.r[2]);
    t.metadata = { gk: 'node:' + nm, meta: N.meta || null };
    loc[nm] = t;
  }
  return { root, nodes, meshes, loc };
}
function partWorldPivot(built, name) { const P = built.parts.find(p => p.name === name); return P ? P.pivot : [0, 0, 0]; }

/** deep clone of a kitToMeshes template root (meshes share geometry + materials); instance = InstancedMesh copies (grenades, props) */
export function cloneTemplate(src, instance = false) { const r = instance ? instTree(src, null) : cloneTree(src, null, new Map()); r.setEnabled(true); return r; }
// deep clone of a template hierarchy (meshes share geometry + materials)
function cloneTree(src, parent, map) {
  const BB = B(); let c;
  if (src instanceof BB.Mesh) { c = src.clone(src.name, null, true, false); }
  else { c = new BB.TransformNode(src.name, src.getScene()); c.position.copyFrom(src.position); c.rotation.copyFrom(src.rotation); if (src.rotationQuaternion) c.rotationQuaternion = src.rotationQuaternion.clone(); c.scaling.copyFrom(src.scaling); }
  c.metadata = src.metadata ? { ...src.metadata } : null; c.parent = parent; c.setEnabled(src.isEnabled(false));
  map.set(src, c);
  for (const ch of src.getChildren(null, true)) cloneTree(ch, c, map);
  return c;
}
function instTree(src, parent) {   // InstancedMesh copy (third-person crowds): same materials, no per-copy changes
  const BB = B(); let c;
  if (src instanceof BB.Mesh) c = src.createInstance(src.name);
  else { c = new BB.TransformNode(src.name, src.getScene()); c.position.copyFrom(src.position); c.rotation.copyFrom(src.rotation); c.scaling.copyFrom(src.scaling); }
  c.metadata = src.metadata ? { ...src.metadata } : null; c.parent = parent; c.setEnabled(src.isEnabled(false));
  for (const ch of src.getChildren(null, true)) instTree(ch, c);
  return c;
}

// ------------------------------------------------------------------------------------------------------------------
// registries
export const MODEL_SPECS = {};
export const BUILDERS = {};
export const ATTACH_SPECS = {};
const ATT_BUILDERS = new Map();
export function registerGunBuilder(name, fn) { BUILDERS[name] = fn; }
export function registerModelSpec(gunId, spec) { MODEL_SPECS[gunId] = spec; }
/** fn(K, att, ctx) emits geometry into Kit K (attachment-local axes: mounting surface at y = 0, +Y away from the rail, +Z toward
    the muzzle; muzzle devices start at z = 0 and extend along +Z) and returns { eye?, length?, lens?, hand?, palette? }. */
export function registerAttachmentBuilder(idOrKind, fn) { ATT_BUILDERS.set(idOrKind, fn); }
/** run a gun builder into Kit K (sets the LOD-dependent profile resolution first). Exported for tests and part B. */
export function runBuilder(K, spec, gun, ctx) { CS_N = K.lod === 0 ? 3 : 1; (BUILDERS[spec.b] || BUILDERS.generic)(K, spec, gun, { lod: K.lod, mods: {}, intr: {}, gun, ...ctx }); return K; }
export function modelInfo(gunId) { const g = getGun(gunId), sp = g && MODEL_SPECS[g.id]; return { spec: sp || null, builder: sp ? sp.b : 'generic', built: !!sp }; }

// intrinsic mods change the geometry (magazine, barrel); the others are attachments on sockets or poses
const INTRINSIC = ['mag', 'barrel'];
function normMods(gun, mods) {
  const out = {};
  if (mods) for (const [slot, id] of Object.entries(mods)) { if (!id) continue; const a = getAttachment(id); if (a && a.slot === slot && fits(gun, a)) out[slot] = id; }
  return out;
}
const intrKey = mods => INTRINSIC.map(k => mods[k] || '').join(',');

function buildTemplate(scene, gun, lod, skin, mods) {
  const s = st(scene), t0 = performance.now(), spec = MODEL_SPECS[gun.id] || genericSpec(gun);
  const sk = SKIN_BY.get(skin) || SKINS[0];
  const K = new Kit({ lod, wear: (spec.wear ?? 1) * (sk.wear || 1), seed: hashStr(gun.id) });
  const ctx = { lod, mods, gun, skin, intr: { mag: mods.mag ? getAttachment(mods.mag) : null, barrel: mods.barrel ? getAttachment(mods.barrel) : null } };
  runBuilder(K, spec, gun, ctx);
  postIntrinsic(K, spec, ctx);
  const built = K.build(), genMs = performance.now() - t0;
  if (!s.root) { s.root = new (B().TransformNode)('gunkit_templates', scene); s.root.setEnabled(false); }
  const pal = { ...(PALETTES[spec.pal || paletteFor(gun)] || PALETTES.polymer), ...(spec.mats || {}) };
  const res = kitToMeshes(scene, built, pal, { name: 'gun_' + gun.id, skin, parent: s.root });
  addOpticFx(scene, res, built.meta, lod);
  return { gun, lod, skin, built, res, meta: built.meta, nodes: built.nodes, tris: built.stats.tris, genMs, ms: performance.now() - t0 };
}
function paletteFor(gun) { const f = gun.model && gun.model.finish; return f === 'wood' ? 'wood' : f === 'steel' ? 'steel' : f === 'black' ? 'black' : 'polymer'; }
function hashStr(s) { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

/** Build (or clone from the per-scene cache) a gun model. opts: { lod 0|1|2, skin, mods: { slot: attId }, instance (InstancedMesh copy) } */
export function buildGun(scene, gunId, opts = {}) {
  const gun = getGun(gunId); if (!gun) throw new Error('buildGun: unknown gun ' + gunId);
  if (gun.cat === 'melee') return buildMelee(scene, gun, opts);
  const lod = Math.max(0, Math.min(2, opts.lod | 0)), skin = SKIN_BY.has(opts.skin) ? opts.skin : 'factory';
  const mods = normMods(gun, opts.mods), s = st(scene), t0 = performance.now();
  const key = gun.id + '|' + lod + '|' + skin + '|' + intrKey(mods);
  let tpl = s.templates.get(key), cachedHit = !!tpl;
  if (!tpl) { tpl = buildTemplate(scene, gun, lod, skin, mods); s.templates.set(key, tpl); }
  const gm = { id: gun.id, gun, lod, skin, scene, mods: {}, attachments: {}, info: {} };
  mountTemplate(gm, tpl, !!opts.instance, null);
  gm.setMods = m => setMods(gm, m);
  gm.dispose = () => { for (const a of Object.values(gm.attachments)) a && a.dispose && a.dispose(); gm.attachments = {}; gm.root.dispose(false, false); };
  setMods(gm, mods);
  gm.info = { tris: tpl.tris, buildMs: cachedHit ? 0 : tpl.ms, genMs: tpl.genMs, cloneMs: performance.now() - t0, cached: cachedHit, key };
  return gm;
}
/** drop every cached gun / attachment template of a scene (materials and textures stay) */
export function clearGunCache(scene) { const s = STATE.get(scene); if (!s) return; for (const t of s.templates.values()) t.res.root.dispose(false, false); for (const t of s.atts.values()) t.res.root.dispose(false, false); s.templates.clear(); s.atts.clear(); }
export const gunTris = gm => gm.meshes.reduce((n, m) => n + (m.getTotalIndices ? m.getTotalIndices() / 3 : 0), 0);

function mountTemplate(gm, tpl, instance, keepRoot) {
  const BB = B(), map = new Map();
  const src = tpl.res.root, root = instance ? instTree(src, null) : cloneTree(src, null, map);
  root.setEnabled(true);
  if (keepRoot) {   // swap internals under the existing root (setMods with a new magazine / barrel)
    // nodes other systems parented to ours (hand meshes, lights, effects) move to the matching new node instead of dying with the old one
    const byKey = new Map(); for (const n of root.getDescendants(false)) { const g = n.metadata && n.metadata.gk; if (g && g !== 'mesh') byKey.set(g, n); }
    for (const old of keepRoot.getDescendants(false)) {
      const g = old.metadata && old.metadata.gk; if (!g || g === 'mesh') continue;
      for (const ch of old.getChildren(null, true).slice()) if (!(ch.metadata && ch.metadata.gk) && !(ch.metadata && ch.metadata.att)) ch.parent = byKey.get(g) || root;
    }
    for (const ch of keepRoot.getChildren(null, true).slice()) if (ch.metadata && ch.metadata.gk) ch.dispose(false, false);
    for (const ch of root.getChildren(null, true).slice()) ch.parent = keepRoot;
    root.dispose(true, false);
  }
  const R = keepRoot || root;
  R.name = 'gun_' + gm.id; R.metadata = { gk: 'root', gun: gm.id };
  gm.root = R; gm.tpl = tpl; gm.parts = {}; gm.sockets = {}; gm.meshes = []; gm.loc = {};
  for (const n of R.getDescendants(false)) {
    const g = n.metadata && n.metadata.gk; if (!g) continue;
    if (g === 'mesh') gm.meshes.push(n);
    else if (g.startsWith('part:')) gm.parts[g.slice(5)] = n;
    else if (g.startsWith('node:')) gm.loc[g.slice(5)] = n;
  }
  const L = gm.loc;
  gm.sockets = { optic: L.s_optic, muzzle: L.s_muzzle, under: L.s_under, side: L.s_side, mag: L.s_mag, stock: L.s_stock, barrel: L.s_barrel, canted: L.s_canted };
  for (const k of Object.keys(gm.sockets)) if (!gm.sockets[k]) delete gm.sockets[k];
  gm.muzzle = L.muzzle; gm.eject = L.eject;
  gm.hands = { right: L.hand_r, left: L.hand_l };
  const sm = tpl.meta.sight || {}, V = BB.Vector3;
  gm.sight = { eye: V.FromArray(sm.eye || [0, .06, -.2]), front: sm.front ? V.FromArray(sm.front) : null, rear: sm.rear ? V.FromArray(sm.rear) : null, line: sm.eye ? sm.eye[1] : .06, iron: true, kind: sm.kind || 'iron' };
  const lm = tpl.meta.lens;
  gm.sight.lens = lm ? lensInfo(gm.parts[lm.part], lm, BB) : null; gm.sight.reticle = tpl.meta.reticle ? tpl.meta.reticle.id : null; gm.sight.glint = L.glint || null; gm.sight.canted = null;
  gm.emitters = {}; gm.bipod = gm.parts.bipod || null;
  gm.base = { eye: gm.sight.eye.clone(), muzzle: gm.muzzle ? gm.muzzle.position.clone() : null, handL: L.hand_l ? { p: L.hand_l.position.clone(), r: L.hand_l.rotation.clone(), parent: L.hand_l.parent } : null,
    lens: gm.sight.lens, reticle: gm.sight.reticle, glint: gm.sight.glint, kind: gm.sight.kind, bipod: gm.bipod };
  gm.meta = tpl.meta;
}

/** apply attachments: { optic, muzzle, under, side, mag, stock, barrel } -> ids (null to remove). Updates gm in place. */
function setMods(gm, mods) {
  const gun = gm.gun, want = normMods(gun, mods || {}), BB = B(), scene = gm.scene, s = st(scene);
  // intrinsic: magazine / barrel need new geometry
  if (intrKey(want) !== intrKey(gm.mods) && gm.root) {
    for (const a of Object.values(gm.attachments)) a && a.dispose && a.dispose(); gm.attachments = {};
    const key = gun.id + '|' + gm.lod + '|' + gm.skin + '|' + intrKey(want);
    let tpl = s.templates.get(key); if (!tpl) { tpl = buildTemplate(scene, gun, gm.lod, gm.skin, want); s.templates.set(key, tpl); }
    mountTemplate(gm, tpl, false, gm.root);
    gm.mods = Object.fromEntries(INTRINSIC.filter(k => want[k]).map(k => [k, want[k]]));
  }
  // reset poses
  gm.sight.eye.copyFrom(gm.base.eye); gm.sight.iron = true; gm.sight.kind = gm.base.kind; gm.sight.lens = gm.base.lens; gm.sight.reticle = gm.base.reticle; gm.sight.glint = gm.base.glint; gm.sight.canted = null;
  gm.emitters = {}; gm.bipod = gm.base.bipod; if (gm.parts.stock) gm.parts.stock.setEnabled(true);
  if (gm.muzzle && gm.base.muzzle) gm.muzzle.position.copyFrom(gm.base.muzzle);
  if (gm.hands.left && gm.base.handL) { const h = gm.base.handL; gm.hands.left.parent = h.parent; gm.hands.left.position.copyFrom(h.p); gm.hands.left.rotation.copyFrom(h.r); gm.hands.left.metadata.meta = { ...(gm.hands.left.metadata.meta || {}), via: null }; }
  for (const [nm, p] of Object.entries(gm.parts)) {
    const md = p.metadata || {}, meta = md.meta || {};
    if (meta.iron) { p.setEnabled(true); p.rotation.set(0, 0, 0); }
    if (meta.replace) p.setEnabled(!meta.hideDefault);
    if (meta.fold && md.rest) { p.position.set(md.rest[0], md.rest[1], md.rest[2]); p.rotation.set(0, 0, 0); }
    if (meta.optOnly) p.setEnabled(false);
    void nm;
  }
  const slots = ['optic', 'muzzle', 'under', 'side', 'stock'];
  if (gm.meta.stock && want.stock && want.stock !== 'k_folded' && !gm.sockets.stock) delete want.stock;   // no stock socket: nothing to mount on
  for (const slot of slots) {
    const id = want[slot] || null, cur = gm.attachments[slot];
    if (cur && cur.id !== id) { cur.dispose(); delete gm.attachments[slot]; }
    if (!id) continue;
    const att = getAttachment(id);
    if (slot === 'stock' && (id === 'k_folded' || !gm.sockets.stock)) { applyStockPose(gm, att); gm.attachments.stock = { id, pose: true, dispose() {} }; continue; }
    const canted = slot === 'optic' && att.model && att.model.kind === 'canted';
    const sock = canted ? (gm.sockets.canted || gm.sockets.optic) : gm.sockets[slot]; if (!sock) continue;
    let a = gm.attachments[slot];
    if (!a) {
      const iface = slot === 'stock' ? (gm.meta.stock || null) : null, span = canted ? cantedSpan(gm) : 0;
      a = buildAttachment(scene, id, { lod: gm.lod, gun, slot, skin: gm.skin, iface, span }); a.root.parent = sock; gm.attachments[slot] = a;
    }
    if (canted) {
      if (a.canted) { const e = localToGun(gm, sock, a.canted.eye), f = localToGun(gm, sock, a.canted.front), r0 = localToGun(gm, sock, a.canted.rear), o = localToGun(gm, sock, [0, 0, 0]), u = localToGun(gm, sock, a.canted.up).subtract(o).normalize();
        gm.sight.canted = { eye: e, front: f, rear: r0, up: u, roll: Math.atan2(u.x, u.y) }; }
    } else if (slot === 'optic') {
      for (const p of Object.values(gm.parts)) { const meta = (p.metadata && p.metadata.meta) || {}; if (meta.iron === 'hide') p.setEnabled(false); else if (meta.iron === 'fold' && meta.foldR) p.rotation.set(meta.foldR[0], meta.foldR[1], meta.foldR[2]); if (meta.optOnly) p.setEnabled(true); if (meta.coverPlate) p.setEnabled(false); if (meta.replace === 'optic') p.setEnabled(false); }
      if (a.eye) { const e = localToGun(gm, sock, a.eye); gm.sight.eye.copyFrom(e); gm.sight.iron = false; gm.sight.kind = a.kind || 'optic'; }
      gm.sight.lens = a.lens ? { ...a.lens, c: localToGun(gm, a.lens.node || sock, [0, 0, 0]) } : null; gm.sight.reticle = a.reticle || null; gm.sight.glint = a.glint || null;
    } else if (slot === 'stock') {
      if (gm.parts.stock) gm.parts.stock.setEnabled(false);
      for (const p of Object.values(gm.parts)) { const meta = (p.metadata && p.metadata.meta) || {}; if (meta.replace === 'stock') p.setEnabled(false); }
    } else if (slot === 'side') {
      gm.emitters = { laser: a.nodes.laser || null, light: a.nodes.light || null };
    } else if (slot === 'muzzle') {
      for (const p of Object.values(gm.parts)) { const meta = (p.metadata && p.metadata.meta) || {}; if (meta.replace === 'muzzle') p.setEnabled(false); }
      if (gm.muzzle) gm.muzzle.position.copyFrom(localToGunIn(gm, sock, [0, 0, a.length || 0], gm.muzzle.parent));
    } else if (slot === 'under') {
      if (a.hand && gm.hands.left) {
        const h = gm.hands.left; h.parent = sock; h.position.set(a.hand.p[0], a.hand.p[1], a.hand.p[2]); h.rotation.set(...(a.hand.r || [0, 0, 0]));
        h.metadata.meta = { ...(h.metadata.meta || {}), kind: a.hand.kind || 'grip', via: id };
      }
      for (const p of Object.values(gm.parts)) { const meta = (p.metadata && p.metadata.meta) || {}; if (meta.replace === 'under' || (a.bipod && meta.replace === 'bipod')) p.setEnabled(false); }
      if (a.bipod) gm.bipod = a.nodes.legs || null;
    }
  }
  gm.mods = Object.fromEntries(Object.entries(want).filter(([k]) => INTRINSIC.includes(k) || gm.attachments[k]));
  return gm;
}
function applyStockPose(gm, att) {
  if (!att || att.id !== 'k_folded') return;
  const p = gm.parts.stock; if (!p) return; const meta = (p.metadata && p.metadata.meta) || {}, f = meta.fold; if (!f) return;
  const rest = p.metadata.rest || [0, 0, 0];
  p.position.set(rest[0] + (f.p ? f.p[0] : 0), rest[1] + (f.p ? f.p[1] : 0), rest[2] + (f.p ? f.p[2] : 0));
  if (f.r) p.rotation.set(f.r[0], f.r[1], f.r[2]);
}
// point in a socket's local space -> gun-root space
function localToGun(gm, node, p) {
  const BB = B(); gm.root.computeWorldMatrix(true); node.computeWorldMatrix(true);
  const inv = gm.root.getWorldMatrix().clone().invert(), w = BB.Vector3.TransformCoordinates(BB.Vector3.FromArray(p), node.getWorldMatrix());
  return BB.Vector3.TransformCoordinates(w, inv);
}
function localToGunIn(gm, node, p, target) {
  const BB = B(); node.computeWorldMatrix(true); target.computeWorldMatrix(true);
  const inv = target.getWorldMatrix().clone().invert(), w = BB.Vector3.TransformCoordinates(BB.Vector3.FromArray(p), node.getWorldMatrix());
  return BB.Vector3.TransformCoordinates(w, inv);
}

/** attachment model. opts: { lod, gun, slot, skin, iface (stock interface, gm.meta.stock), span (canted sight spacing, mm) }.
    Returns { id, root, meshes, nodes, eye?, length, hand?, lens? { node, mesh, r, c }, reticle (id), glint (hidden plane), canted?,
    bipod?, emitters { laser?, light? } (TransformNodes, +Z = beam), dispose() }. Templates are cached per scene + id + lod + gun bore. */
export function buildAttachment(scene, attId, opts = {}) {
  const att = getAttachment(attId); if (!att) throw new Error('buildAttachment: unknown ' + attId);
  const s = st(scene), lod = Math.max(0, Math.min(2, opts.lod | 0)), gun = opts.gun ? (typeof opts.gun === 'string' ? getGun(opts.gun) : opts.gun) : null;
  const iface = att.slot === 'stock' && opts.iface ? opts.iface : null, span = att.model && att.model.kind === 'canted' ? Math.round(opts.span || 150) : 0;
  const key = attId + '|' + lod + '|' + (gun ? gun.bore + ':' + gun.cat : '') + (iface ? '|' + iface.kind + ':' + (iface.tube || 0) : '') + (span ? '|' + span : '');
  let tpl = s.atts.get(key);
  if (!tpl) {
    const fn = ATT_BUILDERS.get(attId) || ATT_BUILDERS.get('kind:' + (att.model && att.model.kind)) || PLACEHOLDER[att.model && att.model.kind] || PLACEHOLDER.box;
    const K = new Kit({ lod, seed: hashStr(attId) }), ctx = { lod, gun, slot: opts.slot || att.slot, iface, spec: { ...(att.model || {}), ...(ATTACH_SPECS[attId] || {}), ...(span ? { span } : {}) } };
    CS_N = lod === 0 ? 3 : 1; K.boxes = [];
    let meta = {};
    // pistol dust-cover rails: lasers / lights sit forward of the trigger guard (clamp at the rear of the body)
    if (att.slot === 'side' && gun && gun.cat === 'pistol') { const L = (ctx.spec.length || .08) * 1000; K.at({ p: P3(0, 0, L / 2 + 3) }, () => { meta = fn(K, att, ctx) || {}; }); }
    else meta = fn(K, att, ctx) || {};
    if (!s.root) { s.root = new (B().TransformNode)('gunkit_templates', scene); s.root.setEnabled(false); }
    const res = kitToMeshes(scene, K.build(), { ...PALETTES.att, ...(meta.palette || {}) }, { name: 'att_' + attId, parent: s.root });
    addOpticFx(scene, res, meta, lod);
    tpl = { res, meta, boxes: K.boxes }; s.atts.set(key, tpl);
  }
  const root = cloneTree(tpl.res.root, null, new Map()); root.setEnabled(true); root.metadata = { ...(root.metadata || {}), gk: null, att: attId };
  const meshes = root.getChildMeshes(false), m = tpl.meta, nodes = {};
  for (const n of root.getDescendants(false)) { const g = n.metadata && n.metadata.gk; if (g && (g.startsWith('node:') || g.startsWith('part:'))) nodes[g.slice(5)] = n; }
  const lens = m.lens ? lensInfo(nodes[m.lens.part] || root, m.lens, B()) : null;
  return { id: attId, kind: att.model && att.model.kind, root, meshes, nodes, eye: m.eye || null, lens, reticle: m.reticle ? m.reticle.id : null, glint: nodes.glint || null,
    length: m.length || 0, hand: m.hand || null, canted: m.canted || null, bipod: m.bipod || null, emitters: { laser: nodes.laser || null, light: nodes.light || null }, laserColor: m.laserColor || null,
    boxes: (tpl.boxes || []).map(b => ({ node: b.part === 'body' ? root : nodes[b.part] || root, role: b.role, min: b.min, max: b.max })),
    dispose() { root.dispose(false, false); } };
}
/** lens descriptor for the scope renderer: { node, mesh (the glass / screen the magnified view goes onto), r (m), c (local to node) } */
function lensInfo(node, lm, BB) {
  if (!node) return null;
  const mesh = node.getChildMeshes(true).find(x => x.metadata && ['lens', 'screen'].includes(x.metadata.role)) || null;
  return { node, mesh, r: lm.r, obj: lm.obj ? BB.Vector3.FromArray(lm.obj) : null, objR: lm.objR || null };
}
/** reticle disc (scope.js material, front face toward the eye at -Z) and a hidden glint flare for optics; added to a template */
function addOpticFx(scene, res, meta, lod) {
  const BB = B();
  const holder = part => (part && res.nodes[part]) || res.root;
  const pivotOf = n => { const p = [0, 0, 0]; for (let q = n; q && q !== res.root; q = q.parent) { p[0] += q.position.x; p[1] += q.position.y; p[2] += q.position.z; } return p; };
  const put = (mesh, part, c) => { const n = holder(part), pv = pivotOf(n); mesh.parent = n; mesh.position.set(c[0] - pv[0], c[1] - pv[1], c[2] - pv[2]); mesh.isPickable = false; };
  if (meta.reticle && lod < 2) {
    const R = meta.reticle, d = BB.MeshBuilder.CreateDisc('reticle_' + R.id, { radius: R.r, tessellation: lod ? 16 : 40 }, scene);
    d.material = reticleMaterial(scene, R.id, R.bg ? { bg: R.bg } : {}); put(d, R.part, R.c);
    d.metadata = { gk: 'mesh', role: 'reticle', part: R.part || 'body', reticle: R.id };
  }
  const gl = meta.glint;
  if (gl && lod < 2) {
    const g = BB.MeshBuilder.CreatePlane('glint', { size: gl.r * 2 }, scene); g.rotation.y = Math.PI; g.material = glintMaterial(scene); put(g, gl.part, gl.c);
    g.metadata = { gk: 'node:glint' }; g.setEnabled(false);
  }
}
/** distance between the two canted sight units for a gun (mm): rail length behind the optic socket, clamped */
function cantedSpan(gm) { const o = gm.sockets.optic, c = gm.sockets.canted; if (!o || !c) return 150; return Math.max(90, Math.min(260, Math.abs(o.position.z - c.position.z) * 1000 + 40)); }

// ------------------------------------------------------------------------------------------------------------------
// placeholder attachments (simple but correctly sized; part B replaces them with registerAttachmentBuilder)
const PLACEHOLDER = {
  box(K, att) { K.mat('rcv').box(mm(20), mm(20), mm(40), { p: [0, mm(10), 0] }); return {}; },
  micro(K, a, c) { const L = c.spec.length || mm(45), H = c.spec.height || mm(30); K.mat('rcv').extrude(K.sh([[-L / 2, 0], [L / 2, 0], [L / 2, H * .45, mm(3)], [L * .1, H, mm(4)], [-L / 2, H, mm(3)]]), mm(26), { b: mm(1), bs: 2 }); K.mat('glass').box(mm(20), H * .6, mm(1.5), { p: [0, H * .55, L * .05], b: 0 }); return { eye: [0, H * .62, -.25] }; },
  reflex(K, a, c) { return PLACEHOLDER.micro(K, a, { spec: { length: c.spec.length || mm(60), height: c.spec.height || mm(50) } }); },
  holo(K, a, c) { const L = c.spec.length || mm(95), H = c.spec.height || mm(60); K.mat('rcv').box(mm(36), mm(14), L, { p: [0, mm(7), 0] }); K.mat('rcv').extrude(rr(mm(36), H - mm(12), mm(5), 0, 0, K.arcN), mm(6), { plane: 'xy', p: [0, mm(12) + (H - mm(12)) / 2, L / 2 - mm(6)], holes: [rr(mm(30), H - mm(20), mm(3), 0, 0, K.arcN)], b: mm(1) }); K.mat('rcv').extrude(rr(mm(36), H - mm(12), mm(5), 0, 0, K.arcN), mm(6), { plane: 'xy', p: [0, mm(12) + (H - mm(12)) / 2, -L / 2 + mm(6)], holes: [rr(mm(30), H - mm(20), mm(3), 0, 0, K.arcN)], b: mm(1) }); K.mat('glass').box(mm(30), H - mm(20), mm(1.5), { p: [0, mm(12) + (H - mm(12)) / 2, L / 2 - mm(9)], b: 0 }); return { eye: [0, mm(12) + (H - mm(12)) / 2, -.12] }; },
  prism(K, a, c) { const L = c.spec.length || mm(90), H = c.spec.height || mm(60); K.mat('rcv').box(mm(30), mm(12), L * .8, { p: [0, mm(6), 0] }); K.mat('rcv').lathe([[mm(16), -L / 2], [mm(18), -L / 2 + mm(4)], [mm(18), L / 2 - mm(4)], [mm(19), L / 2]], { p: [0, H - mm(18), 0] }); K.mat('glass').disc(mm(16), mm(1), { p: [0, H - mm(18), L / 2 - mm(2)] }); return { eye: [0, H - mm(18), -L / 2 - .07] }; },
  scope(K, a, c) {
    const L = c.spec.length || mm(300), tr = (c.spec.tube || mm(30)) / 2, lr = (c.spec.lens || mm(40)) / 2 + mm(3), H = (c.spec.height || mm(70));
    const y = H - lr; K.mat('rcv').lathe([[mm(13), -L / 2], [lr * .85, -L / 2 + mm(2)], [lr * .85, -L / 2 + mm(40)], [tr, -L / 2 + mm(70)], [tr, L / 2 - mm(80)], [lr, L / 2 - mm(30)], [lr, L / 2]], { p: [0, y, 0] });
    for (const z of [-L * .2, L * .18]) { K.mat('rcv').box(mm(22), y, mm(14), { p: [0, y / 2, z] }); K.mat('rcv').lathe([[tr + mm(3), z - mm(7)], [tr + mm(3), z + mm(7)]], { p: [0, y, 0] }); }
    K.mat('glass').disc(lr - mm(2), mm(1), { p: [0, y, L / 2 - mm(3)] }); K.mat('glass').disc(lr * .8, mm(1), { p: [0, y, -L / 2 + mm(2)] });
    return { eye: [0, y, -L / 2 - .085] };
  },
  lpvo(K, a, c) { return PLACEHOLDER.scope(K, a, c); }, thermal(K, a, c) { const L = c.spec.length || mm(170); K.mat('rcv').box(mm(50), mm(55), L, { p: [0, mm(32), 0], b: mm(3) }); return { eye: [0, mm(40), -L / 2 - .07] }; },
  canted(K) { K.mat('rcv').box(mm(16), mm(30), mm(30), { p: [0, mm(15), 0] }); return {}; },
  can(K, a, c) { const L = c.spec.length || mm(170), r = (c.spec.dia || mm(36)) / 2; K.mat('rcv').lathe([[mm(4), 0], [r * .7, 0], [r, mm(8)], [r, L - mm(4)], [r * .8, L], [mm(4), L]], { segs: 28 }); K.mat('bore').cyl(mm(4.2), mm(1), { p: [0, 0, L - mm(.5)] }); return { length: L }; },
  comp(K, a, c) { const L = c.spec.length || mm(55), r = (c.spec.dia || mm(26)) / 2; K.mat('rcv').lathe([[mm(4), 0], [r, 0], [r, L], [mm(5), L]], { segs: 18 }); return { length: L }; },
  flash(K, a, c) { const L = c.spec.length || mm(60), r = (c.spec.dia || mm(22)) / 2; K.mat('rcv').lathe([[mm(4), 0], [r, 0], [r, L], [mm(5), L]], { segs: 18 }); return { length: L }; },
  brake(K, a, c) { return PLACEHOLDER.comp(K, a, { spec: { length: c.spec.length || mm(70), dia: c.spec.dia || mm(30) } }); },
  choke(K, a, c) { return PLACEHOLDER.comp(K, a, { spec: { length: c.spec.length || mm(50), dia: c.spec.dia || mm(24) } }); },
  vgrip(K, a, c) { const L = c.spec.length || mm(100); K.mat('frame').lathe([[0, 0], [mm(15), 0], [mm(14), L - mm(6)], [mm(12), L], [0, L]], { axis: 'y', segs: 20 }); K.mat('rcv').box(mm(22), mm(10), mm(34), { p: [0, mm(5), 0] }); return { hand: { p: [0, L * .55, 0], r: [Math.PI, 0, 0], kind: 'grip' } }; },
  agrip(K, a, c) { const L = c.spec.length || mm(70); K.mat('frame').extrude(K.sh([[-L / 2, 0], [L / 2, 0], [L / 2 - mm(8), mm(22), mm(4)], [-L / 2, mm(10), mm(3)]]), mm(24), { b: mm(2), bs: 2 }); return { hand: { p: [0, mm(14), 0], r: [Math.PI, 0, 0], kind: 'hold' } }; },
  stubby(K, a, c) { return PLACEHOLDER.vgrip(K, a, { spec: { length: c.spec.length || mm(50) } }); },
  handstop(K) { K.mat('frame').extrude(K.sh([[-mm(16), 0], [mm(18), 0], [mm(10), mm(16), mm(4)], [-mm(14), mm(8), mm(3)]]), mm(20), { b: mm(1.5), bs: 2 }); return {}; },
  bipod(K, a, c) { const L = c.spec.length || mm(180); K.mat('rcv').box(mm(30), mm(16), mm(30), { p: [0, mm(8), 0] }); for (const sx of [-1, 1]) K.mat('rcv').lathe([[mm(5), 0], [mm(5), L]], { p: [sx * mm(10), mm(14), 0], r: [0, 0, 0], segs: 10 }); return {}; },
  laser(K, a, c) { const L = c.spec.length || mm(70); K.mat('rcv').box(mm(24), mm(24), L, { p: [0, mm(12), 0], b: mm(2) }); K.mat('glass').disc(mm(4), mm(1), { p: [0, mm(14), L / 2] }); return {}; },
  light(K, a, c) { const L = c.spec.length || mm(120), r = (c.spec.dia || mm(28)) / 2; K.mat('rcv').box(mm(20), mm(10), mm(36), { p: [0, mm(5), 0] }); K.mat('rcv').lathe([[mm(4), -L / 2], [r * .9, -L / 2], [r * .9, L / 2 - mm(25)], [r, L / 2 - mm(15)], [r, L / 2]], { p: [0, mm(10) + r, 0] }); K.mat('glass').disc(r - mm(2), mm(1), { p: [0, mm(10) + r, L / 2] }); return {}; },
  combo(K, a, c) { return PLACEHOLDER.laser(K, a, { spec: { length: c.spec.length || mm(100) } }); },
};

// ------------------------------------------------------------------------------------------------------------------
// MODEL_SPECS format (docs §5): { b: builder name, pal: base palette, mats: { role: matId }, wear: factor, ...builder params (mm) }.
// The builders below read real dimensions; ctx = { lod, mods, gun, skin, intr: { mag, barrel } }.
// Every builder MUST set: K.meta.sight = { eye, front, rear, kind } and nodes muzzle, eject, s_optic?, s_muzzle, s_under?, s_side?,
// s_mag, s_stock?, s_barrel?, hand_r, hand_l (see helpers sockets() / hands() below).
/*@@BUILDERS@@*/
const D = mm;   // authoring in millimetres: D(12) = 0.012 m
const P3 = (x, y, z) => [D(x), D(y), D(z)];
// ---- shared builder helpers -------------------------------------------------------------------------------------------
/** sockets: { slot: [[x, y, z] (mm), part?, rot?] } -> nodes s_<slot> (under faces down, side faces +X; docs §5) */
function sockets(K, s) {
  for (const [k, v] of Object.entries(s)) {
    if (!v) continue; const [p, part, rot] = v;
    const r = rot || (k === 'under' ? [0, 0, Math.PI] : k === 'side' ? [0, 0, -HALF] : k === 'sideL' ? [0, 0, HALF] : [0, 0, 0]);
    const prev = K.cur; if (part) K.use(part); K.node('s_' + k, P3(...p), r, { part: part || prev.name }); K.cur = prev;
  }
}
/** hand poses: right = { p (mm), ang (grip rake, rad: grip axis tilts forward going up) }, left = { p, kind: 'hold'|'grip'|'support'|'pump', part, r } */
function handNodes(K, right, left) {
  const prev = K.cur;
  if (right.part) K.use(right.part); K.node('hand_r', P3(...right.p), [right.ang || 0, 0, 0], { meta: { kind: 'grip', ang: right.ang || 0 } }); K.cur = prev;
  if (left.part) K.use(left.part); K.node('hand_l', P3(...left.p), left.r || [left.ang || 0, 0, 0], { meta: { kind: left.kind || 'hold' } }); K.cur = prev;
}
/** iron-sight metadata: front / rear = sight-line points (mm), relief = eye distance behind the rear sight (mm) */
function sightMeta(K, front, rear, relief, kind = 'iron') {
  const f = P3(...front), r = P3(...rear); K.meta.sight = { front: f, rear: r, eye: [0, f[1], r[2] - D(relief)], kind };
}
function muzzleNode(K, y, z, part) { const prev = K.cur; if (part) K.use(part); K.node('muzzle', P3(0, y, z), [0, 0, 0]); K.cur = prev; }
/** eject node: local +Z = casing direction ('right' | 'left' | 'down' | 'none' | 'break') */
function ejectNode(K, p, dir = 'right', part) {
  const r = dir === 'right' ? [-.55, 1.75, 0] : dir === 'left' ? [-.55, -1.75, 0] : dir === 'down' ? [1.35, 3.0, 0] : dir === 'break' ? [-.6, Math.PI, 0] : [0, 0, 0];
  const prev = K.cur; if (part) K.use(part); K.node('eject', P3(...p), r, { meta: { dir } }); K.cur = prev;
}
/** fixed-topology arc (count points from a0 to a1 inclusive) */
const arcN = (cx, cy, r, a0, a1, count, w = 1) => { const o = []; for (let k = 0; k <= count; k++) { const a = a0 + (a1 - a0) * k / count; o.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r, w]); } return o; };
const scaleP = (pts, s) => pts.map(p => [p[0] * s, p[1] * s, p[2] || 0]);
const mmP = pts => pts.map(p => [D(p[0]), D(p[1]), p[2] === undefined ? undefined : (p[2] > 0 || p[2] < 0 ? D(p[2]) : 0), p[3]]).map(p => p[3] === undefined ? (p[2] === undefined ? [p[0], p[1]] : [p[0], p[1], p[2]]) : p);
/** shape in millimetres through the kit (fillets / chamfers in mm) */
const SH = (K, pts, fall = 1.4) => K.sh(pts.map(p => [D(p[0]), D(p[1]), p[2] ? D(p[2]) : 0, p[3]]), D(fall));

/** slide / receiver cross-section (x, y in mm, bottom at y = 0), fixed topology so variants can be lofted.
    w width, h height; top 'chamfer' (ch = 45-degree top corners), 'round' (r = top corner radius, 'arch' when r >= w/2), 'flat';
    si = side inset (serration groove depth) between yi0 and yi1; bot = bottom corner chamfer. n = arc segments. */
let CS_N = 3;   // arc segments of slideCS (set per build from the LOD)
function slideCS(w, h, ch, { round = 0, si = 0, yi0 = 2.5, yi1 = null, bot = 1.0, n = CS_N, r = null } = {}) {
  const hw = w / 2, rad = round ? Math.min(r ?? hw * .85, hw, h * .7) : 0, topY = round ? h - rad : h - ch, y1 = Math.min(yi1 ?? topY - 1.4, topY - .6);
  const side = sg => {
    const L = [[sg * (hw - bot), 0, 1], [sg * hw, bot, 1], [sg * hw, bot + .9, 0], [sg * hw, yi0, 0], [sg * (hw - si), yi0 + Math.max(si, .02), 0], [sg * (hw - si), y1 - Math.max(si, .02), 0], [sg * hw, y1, 0], [sg * hw, topY - .5, 0]];
    if (round) { for (let k = 0; k <= n * 2; k++) { const a = (k / (n * 2)) * HALF; L.push([sg * (hw - rad + Math.cos(a) * rad), topY + Math.sin(a) * rad, 1]); } }
    else { const f = Math.min(.6, ch * .25); L.push([sg * hw, topY, 1]); L.push([sg * (hw - f * .3), topY + f * .7, 1]); L.push([sg * (hw - ch + f * .7), h - f * .3, 1]); L.push([sg * (hw - ch), h, 1]); L.push([sg * (hw - ch - .6), h, 0]); }
    return L;
  };
  const R = side(1), Lf = side(-1).reverse();
  if (round && rad >= hw - 1e-6) Lf.shift();   // the arch meets at x = 0: drop the duplicate apex
  return [...R, ...Lf];
}
const csMM = pts => pts.map(p => [D(p[0]), D(p[1]), p[2] || 0]);
const shift = (pts, dx, dy) => pts.map(p => [p[0] + dx, p[1] + dy, p[2] || 0]);
const scaleXY = (pts, sx, sy, cy = 0) => pts.map(p => [p[0] * sx, cy + (p[1] - cy) * sy, p[2] || 0]);

/** extrude a cross-section (mm points) along z from z0 to z1 (mm) at height y0 (mm), with bevel at the chosen ends */
function cs(K, pts, z0, z1, y0, { bf = 0, bb = 0, mat, recess, holes, b, x0 = 0 } = {}) {
  const P = csMM(shift(pts, x0, y0)), len = D(z1 - z0); if (len <= 0) return;
  K.extrude(P, len, { plane: 'xy', off: D(z0), b: b ? D(b) : (bf || bb ? D(Math.max(bf, bb)) : 0), bf: D(bf), bb: D(bb), bs: 2, mat, crease: 28, recess, holes });
}
/** loft a list of [z (mm), pts (mm)] at height y0 */
function loftZ(K, list, y0, o = {}) { K.loft(list.map(([z, pts, extra]) => ({ z: D(z), pts: csMM(shift(pts, o.x0 || 0, y0)), ...(extra || {}) })), o); }

/** cartridge (brass case + copper/lead bullet) along +z, base at z = 0. cal: { d (case mm), len (case), bl (bullet length), neck } */
function cartridge(K, cal, o = {}) {
  if (K.lod >= 1 && !o.force) return;
  const r = cal.d / 2, L = cal.len, rn = (cal.neck || cal.d * .9) / 2, bl = cal.bl || cal.d * 1.1, segs = o.segs || 12;
  K.at({ p: o.p, r: o.r }, () => {
    const prof = cal.bottle
      ? [[0, 0], [r * .92, 0], [r, D(.6) * 1000 / 1000 * 0 + .6], [r, 1.6], [r * .9, 1.6], [r * .9, 2.2], [r, 2.6], [r * .97, L - (cal.shoulder || 6)], [rn, L - (cal.shoulder || 6) + 2.5], [rn, L]]
      : [[0, 0], [r * .92, 0], [r, .6], [r, 1.1], [r * .9, 1.1], [r * .9, 1.6], [r, 2.1], [r * .985, L]];
    K.lathe(prof.map(([a, b]) => [D(a), D(b)]).concat([[D(rn * .98), D(L)]]), { segs, mat: o.case || 'brass', crease: 40 });
    const tip = [];
    for (let k = 0; k <= 4; k++) { const t = k / 4; tip.push([D(rn * .97 * Math.cos(t * HALF) ** (cal.flat ? .3 : .8)), D(L + bl * (cal.flat ? .7 : 1) * Math.sin(t * HALF))]); }
    if (cal.flat) tip.push([D(rn * .4), D(L + bl * .72)], [0, D(L + bl * .72)]); else tip.push([0, D(L + bl)]);
    K.lathe([[D(rn * .97), D(L - .5)], ...tip], { segs, mat: o.bullet || 'copper', crease: 50 });
    if (K.lod === 0) K.cyl(D(r * .3), D(.4), { p: [0, 0, -D(.2)], segs: 8, mat: 'brass', ao: .7 });
  });
}
const CAL = {
  '9': { d: 9.9, len: 19.1, bl: 10, neck: 9.6 }, '40': { d: 10.8, len: 21.6, bl: 9, neck: 10.6, flat: true }, '45': { d: 12, len: 22.8, bl: 9.5, neck: 11.9 },
  '38': { d: 9.6, len: 29.3, bl: 8, neck: 9.5, flat: true, rim: 11.2 }, '357': { d: 9.6, len: 33, bl: 8, neck: 9.5, flat: true, rim: 11.2 },
  '50': { d: 13.9, len: 32.6, bl: 10, neck: 13.7, flat: true }, '22': { d: 5.7, len: 15.6, bl: 6, neck: 5.7, rim: 7 },
  'pdw47': { d: 8, len: 29, bl: 8, neck: 5.5, bottle: true, shoulder: 9 }, 'pdw57': { d: 8, len: 28.9, bl: 10, neck: 5.7, bottle: true, shoulder: 8 },
  '12g': { d: 20.5, len: 70, bl: 0, neck: 20.5, shell: true }, '556': { d: 9.6, len: 44.7, bl: 12, neck: 6.4, bottle: true, shoulder: 8 },
  '762': { d: 11.3, len: 38.7, bl: 16, neck: 8.6, bottle: true, shoulder: 9 }, '762r': { d: 12.4, len: 53.7, bl: 18, neck: 8.5, bottle: true, shoulder: 12 },
};
/** 12 gauge shell along +z: hull (plastic colour) + brass head */
function shell(K, o = {}) {
  if (K.lod >= 1 && !o.force) return;
  const r = 10.3, L = o.len || 68;
  K.at({ p: o.p, r: o.r }, () => {
    K.lathe([[0, 0], [D(r + .5), 0], [D(r + .6), D(.9)], [D(r), D(1.4)], [D(r), D(13)], [D(r - .3), D(13.5)]], { segs: 14, mat: 'brass', crease: 40 });
    K.lathe([[D(r - .3), D(13)], [D(r - .1), D(L - 2)], [D(r - 2.5), D(L)], [0, D(L + .3)]], { segs: 14, mat: o.hull || 'paint_red', crease: 30 });
  });
}

/** generic trigger blade (side profile, mm) as part 'trigger' pivoting at piv; face = curved | flat | straight; width w */
function triggerPart(K, piv, { face = 'curved', w = 6.5, len = 22, safety = false, mat = 'metal', shoe = null } = {}) {
  K.part('trigger', { pivot: P3(0, piv[1], piv[2]) });
  const [py, pz] = [piv[1], piv[2]];
  let prof;
  if (face === 'flat') prof = [[pz - 2, py + 2], [pz + 2.5, py + 2], [pz + 1.5, py - len * .35, 1.5], [pz + .8, py - len, 1.2], [pz - 2.2, py - len, 1], [pz - 2.4, py - len * .35, 2]];
  else if (face === 'straight') prof = [[pz - 2, py + 2], [pz + 2.2, py + 2], [pz + 2.6, py - len, 1.2], [pz - .6, py - len, 1], [pz - 1.8, py - len * .4, 2]];
  else prof = [[pz - 2.2, py + 2], [pz + 2.2, py + 2], [pz + 3.4, py - len * .45, 6], [pz + 2.2, py - len * .85, 4], [pz - .2, py - len, 1.2], [pz - 2, py - len * .82, 3], [pz - 1, py - len * .45, 6]];
  K.mat(mat).extrude(SH(K, prof, .8), D(w), { b: D(Math.min(1.4, w * .22)), bs: 2 });
  if (safety) K.mat(mat).extrude(SH(K, [[pz + .2, py - len * .25], [pz + 2.8, py - len * .3, 1], [pz + 3.2, py - len * .62, 1], [pz + .4, py - len * .7]], .5), D(2.2), { b: D(.4), bs: 1, p: [0, 0, D(.6)] });
  if (shoe) K.mat(shoe).extrude(SH(K, prof.map(p => [p[0] + .15, p[1], p[2]]), .5), D(w + .3), { b: D(.5), bs: 1, s: [1, 1, 1] });
  K.use('body');
}

/** grip outline along a raked axis. top = [z, y] (mm) where the axis starts, ang = rake (rad), len along the axis,
    front(t) / back(t) = offsets (mm) from the axis (t 0 top .. 1 bottom), bottom corner radii rf / rb. Returns mm points. */
function gripOutline({ top, ang, len, front, back, n = 14, rf = 4, rb = 5, topExtra = [] }) {
  const dD = [-Math.sin(ang), -Math.cos(ang)], fw = [Math.cos(ang), -Math.sin(ang)], pts = [];
  const at = (t, off) => [top[0] + dD[0] * t * len + fw[0] * off, top[1] + dD[1] * t * len + fw[1] * off];
  for (let k = 0; k <= n; k++) { const t = k / n * .999; const p = at(t, front(t)); pts.push([p[0], p[1], k === n ? rf : 0]); }
  for (let k = n; k >= 0; k--) { const t = k / n * .999; const p = at(t, -back(t)); pts.push([p[0], p[1], k === n ? rb : 0]); }
  return pts.concat(topExtra);
}
const gripAxisAt = (top, ang, t, len) => [top[0] - Math.sin(ang) * t * len, top[1] - Math.cos(ang) * t * len];
/** rounded-rectangle section (fixed topology) in local (s, x): s from 0 (back) to L (front), x from -hw..hw; rf / rb corner radii */
function ovalPts(L, hw, rf, rb, n = 4) {
  rf = Math.max(.05, Math.min(rf, hw - .01, L * .49)); rb = Math.max(.05, Math.min(rb, hw - .01, L * .49));
  const o = [];
  o.push([L, 0]);
  for (let k = 0; k <= n; k++) { const a = k / n * HALF; o.push([L - rf + Math.cos(a) * rf, hw - rf + Math.sin(a) * rf]); }
  o.push([(L - rf + rb) / 2, hw]);
  for (let k = 0; k <= n; k++) { const a = HALF + k / n * HALF; o.push([rb + Math.cos(a) * rb, hw - rb + Math.sin(a) * rb]); }
  o.push([0, 0]);
  for (let k = 0; k <= n; k++) { const a = Math.PI + k / n * HALF; o.push([rb + Math.cos(a) * rb, -hw + rb + Math.sin(a) * rb]); }
  o.push([(L - rf + rb) / 2, -hw]);
  for (let k = 0; k <= n; k++) { const a = -HALF + k / n * HALF; o.push([L - rf + Math.cos(a) * rf, -hw + rf + Math.sin(a) * rf]); }
  return o;
}
/** organic grip lofted through slices: perpendicular to the rake axis at the base, horizontal near the top (so a tang can tuck
    under a slide). o = { top: [z, y], ang, len, front(t), back(t), width(t), rf(t), rb(t), tTop (negative = above the axis top),
    yMax (clip the top slices below the slide), rows, mat }. All mm. */
function gripLoft(K, o) {
  const { top, ang, len } = o, dD = [Math.cos(ang), -Math.sin(ang)], ax = t => gripAxisAt(top, ang, t, len);
  const F = t => { const a = ax(t), f = o.front(t); return [a[0] + dD[0] * f, a[1] + dD[1] * f]; };
  const Bk = t => { const a = ax(t), b = o.back(t); return [a[0] - dD[0] * b, a[1] - dD[1] * b]; };
  const tAtY = (fn, y) => { let lo = -1, hi = 1.2; for (let k = 0; k < 40; k++) { const m = (lo + hi) / 2; if (fn(m)[1] > y) lo = m; else hi = m; } return (lo + hi) / 2; };
  const R = K.lod === 0 ? (o.rows || 22) : K.lod === 1 ? 7 : 4, n = K.lod === 0 ? 4 : 1, tTop = o.tTop ?? -.1, rows = [];
  for (let k = 0; k <= R; k++) {
    const u = k / R, tf = 1 - (1 - tTop) * u;                 // front parameter, bottom -> top
    const blend = Math.min(1, u / (o.blendAt || .3));          // perpendicular at the base -> horizontal higher up
    let fp = F(tf); if (o.yMax !== undefined && fp[1] > o.yMax) { fp = F(tAtY(F, o.yMax)); }
    const th = tAtY(Bk, fp[1]), tb = tf + (th - tf) * blend, bp = Bk(tb), tm = (tf + tb) / 2;
    const L = Math.hypot(fp[0] - bp[0], fp[1] - bp[1]), hw = o.width(tm) / 2, ux = (fp[0] - bp[0]) / L, uy = (fp[1] - bp[1]) / L;
    const sec = ovalPts(L, hw, o.rf(tm), o.rb(tm), n).map(([sv, x]) => [D(x), D(bp[1] + uy * sv), D(bp[0] + ux * sv), 0]);
    rows.push(sec);
  }
  K.mat(o.mat || 'grip').loft3(rows, { crease: 50, capB: o.capTop !== false });
  return { F, Bk, ax };
}


/** pistol slide made of z-segments. S = { z0, len, h, w, ch, y (bottom), serrR: { z0, n, gw, rw }, serrF, port: [z0, z1], optic: [z0, z1, depth],
    nose: mm, round: 0|1, topPorts: [[z, len]], rib } */
function pistolSlide(K, S, mat = 'slide') {
  const { w, h, ch, y } = S, z0 = S.z0, z1 = S.z0 + S.len, round = S.round || 0;
  const full = slideCS(w, h, ch, { round, r: S.r }), groove = slideCS(w, h, ch, { round, r: S.r, si: S.serrDepth || .75 });
  const cuts = [];   // [za, zb, kind]
  const addSerr = (sr) => { if (!sr || !K.detail(0)) return; let z = sr.z0; for (let k = 0; k < sr.n; k++) { cuts.push([z, z + sr.gw, 'groove']); z += sr.gw + sr.rw; } };
  addSerr(S.serrR); addSerr(S.serrF);
  if (S.optic && K.detail(1)) cuts.push([S.optic[0], S.optic[1], 'optic']);
  if (S.port && K.detail(1)) cuts.push([S.port[0], S.port[1], 'port']);
  for (const tp of S.topPorts || []) if (K.detail(1)) cuts.push([tp[0], tp[0] + tp[1], 'top']);
  cuts.sort((a, b) => a[0] - b[0]);
  const zn = z1 - (S.nose || 8);
  let z = z0, first = true;
  const seg = (za, zb, kind) => {
    if (zb - za < .05) return;
    const bb = first ? 1.1 : 0; first = false;
    if (kind === 'plain') cs(K, full, za, zb, y, { bb, mat });
    else if (kind === 'groove') cs(K, groove, za, zb, y, { mat });
    else if (kind === 'optic') {
      const d = S.optic[2] || 3.2, low = slideCS(w, h - d, Math.max(.6, ch - d * .6), { round: 0 });
      cs(K, low, za, zb, y, { mat });
    } else if (kind === 'top') {   // lightening / compensator window through the top
      const hw = (S.topW || 7) / 2, Lp = [[-w / 2, 0], [-hw, 0], [-hw, h], [-w / 2 + ch, h], [-w / 2, h - ch]], Rp = [[hw, 0], [w / 2, 0], [w / 2, h - ch], [w / 2 - ch, h], [hw, h]];
      cs(K, Lp, za, zb, y, { mat }); cs(K, Rp, za, zb, y, { mat });
    } else if (kind === 'port') {
      const t = 2.4, pl = S.portLeft ?? -1.5, pb = S.portBottom ?? h * .52;
      const Lp = [[-w / 2, 0], [-w / 2 + t, 0], [-w / 2 + t, h - 3.2], [pl, h - 3.2], [pl, h], [-w / 2 + ch, h], [-w / 2, h - ch]];
      const Rp = [[w / 2 - t, 0], [w / 2, 0], [w / 2, pb], [w / 2 - t, pb]];
      cs(K, Lp, za, zb, y, { mat }); cs(K, Rp, za, zb, y, { mat });
      // port floor seen through the port (the barrel hood fills most of it)
    }
  };
  for (const [za, zb, kind] of cuts) { if (za > z) seg(z, Math.min(za, zn), 'plain'); seg(Math.max(za, z), Math.min(zb, zn), kind); z = Math.max(z, zb); }
  if (z < zn) seg(z, zn, 'plain');
  // nose: taper + chamfered front face (loft, fixed topology)
  const noseCS = slideCS(w - (S.noseIn || 1.6), h - (S.noseUp || 1.2), ch, { round, r: S.r }).map(p => [p[0], p[1] + (S.noseUp || 1.2), p[2]]);
  const faceCS = noseCS.map(p => [p[0] * (1 - 1.0 / (w / 2)), (p[1] - h / 2) * (1 - 1.0 / (h / 2)) + h / 2 + .2, 1]);
  const row = (pts, zz) => pts.map(p => [D(p[0]), D(p[1] + y), D(zz), p[2] || 0]);
  const holes = (S.holes || []).map(hh => ({ pts: circle(D(hh.r), K.seg(hh.n || 20), D(hh.x || 0), D(hh.y)).map(([px, py]) => [px, py, D(z1)]), d: D(hh.d || 6), ao: .35 }));
  K.mat(mat).loft3([row(full, zn), row(noseCS, z1 - 1), row(faceCS, z1)], { crease: 28, sharpRows: [1], holesB: holes, cw: 0 });
}

BUILDERS.striker = (K, S, gun, ctx) => {
  const sl = S.slide, fr = S.frame, yF = 12, yB = sl.bore || 26.5, zR = sl.z0, zF = sl.z0 + sl.len, top = yF + sl.h;
  // ----------------------------------------------------------- slide
  K.part('slide', { pivot: P3(0, yB, 0) });
  pistolSlide(K, { ...sl, y: yF, holes: [{ r: (sl.barrelR || 6.9) + .55, y: yB, d: 7 }, { r: (sl.rodR || 3.6) + .9, y: yB - (sl.rodDy || 11.5), d: 5, n: 14 }] });
  // rear sight (dovetail block + notch + dots)
  const rsZ = zR + (sl.rearAt || 6), rsH = sl.rearH || 6.2, notch = sl.notch || 2.2, sLine = top + rsH - notch;
  const nw = (sl.notchW || 3.4) / 2, rw = (sl.rearW || 19) / 2;
  K.mat('metal').extrude(SH(K, [[-rw, -.4], [rw, -.4], [rw - .9, rsH - 1.2, 1], [rw - 4.3, rsH, .6], [nw, rsH, .3], [nw, rsH - notch, .4], [-nw, rsH - notch, .4], [-nw, rsH, .3], [-rw + 4.3, rsH, .6], [-rw + .9, rsH - 1.2, 1]], .6), D(sl.rearL || 8.5), { plane: 'xy', off: D(rsZ - (sl.rearL || 8.5) / 2), p: [0, D(top), 0], b: D(.5), bs: 1 });
  for (const sx of [-1, 1]) if (sl.rearDots !== false) K.mat(sl.rearDots === 'trit' ? 'trit' : 'white').cyl(D(.95), D(.3), { p: P3(sx * (nw + 2.3), top + rsH - notch - .3, rsZ - (sl.rearL || 8.5) / 2 + .1), r: [0, Math.PI, 0], segs: 10 });
  // front sight post with dot / fibre
  const fsZ = zF - (sl.frontAt || 7), fsH = sLine - top;
  K.mat('metal').extrude(SH(K, [[-3.4, -.4], [3.6, -.4], [2.6, fsH, .5], [-1.4, fsH, .4], [-2.4, fsH - 1.4, .6], [-2.4, .6]], .4), D(sl.frontW || 3.3), { p: P3(0, top, fsZ), b: D(.35), bs: 1 });
  const fdot = sl.frontDot || 'white';
  if (fdot === 'fibre_r' || fdot === 'fibre_g') K.mat(fdot).cyl(D(.85), D(4.2), { p: P3(0, sLine - 1.3, fsZ - 2.3), segs: 10 });
  else K.mat(fdot === 'trit' ? 'trit' : 'white').cyl(D(1.0), D(.3), { p: P3(0, sLine - 1.5, fsZ - 2.3), r: [0, Math.PI, 0], segs: 10 });
  // extractor (right side, ahead of the port's rear edge), rear cover plate
  if (sl.port) K.mat('metal').extrude(SH(K, [[sl.port[0] - 13, 0], [sl.port[0] + 1.5, 0], [sl.port[0] + 1.5, 4.2, 1], [sl.port[0] - 11, 4.2, 2]], .5), D(.6), { p: [D(sl.w / 2 + .2), D(yF + sl.h * .52 - 2.4), 0], b: D(.2), bs: 1 });
  K.mat('frame').extrude(SH(K, [[-8, 2], [8, 2], [8, sl.h * .62, 2.5], [-8, sl.h * .62, 2.5]], .5), D(1.2), { plane: 'xy', off: D(zR - .6), p: [0, D(yF), 0], b: D(.4), bs: 1 });
  if (sl.optic) {
    K.part('optplate', { pivot: P3(0, top, (sl.optic[0] + sl.optic[1]) / 2), parent: 'slide', meta: { coverPlate: true } });
    const d = sl.optic[2] || 3.2, L = sl.optic[1] - sl.optic[0] - .4;
    K.mat('slide').box(D(sl.w - 2 * (sl.ch - .4)), D(d - .1), D(L), { p: P3(0, top - d / 2 - .05, (sl.optic[0] + sl.optic[1]) / 2), b: D(.4), bs: 1 });
    for (const dz of [-L * .3, L * .3]) K.screw({ p: P3(0, top - .1, (sl.optic[0] + sl.optic[1]) / 2 + dz), axis: 'y', d: D(3.4), h: D(.6), type: 'torx', mat: 'metal' });
    K.use('slide');
  }
  K.use('body');
  // ----------------------------------------------------------- barrel (hood in the port, crown, guide rod)
  K.part('barrel', { pivot: P3(0, yB, 0) });
  const bz0 = (sl.port ? sl.port[0] : zR + 50) - 1, bz1 = zF - .4, br = sl.barrelR || 6.9;
  K.mat('barrel').tube(D(br), D(4.6), D(bz1 - bz0), { p: P3(0, yB, bz0), segs: 24, ch: D(.6) });
  K.mat('bore').lathe([[D(4.6), D(bz1 - .2)], [D(4.6), D(bz1 - 10)]], { p: P3(0, yB, 0), segs: 16 });
  if (sl.port) {
    const pw = sl.hoodW || 15.5, pz0 = sl.port[0] + .4, pz1 = sl.port[1] + 4;
    K.use('slide'); K.mat('bore').box(D(sl.w - 5), D(2.4), D(sl.port[1] - sl.port[0] + 2), { p: P3(0, yF + 1.6, (sl.port[0] + sl.port[1]) / 2), b: 0, ao: .5 }); K.use('barrel');
    K.mat('barrel').extrude(SH(K, [[-pw / 2, -br], [pw / 2, -br], [pw / 2, top - yB - .5, .8], [-pw / 2, top - yB - .5, .8]], .5), D(pz1 - pz0), { plane: 'xy', off: D(pz0), p: [0, D(yB), 0], b: D(.6), bs: 1, recess: [{ pts: csMM(circle(5.2, 16)), d: D(6), side: -1, ao: .3 }] });
  }
  K.use('body');
  K.mat('bright').cyl(D(sl.rodR || 3.6), D(42), { p: P3(0, yB - (sl.rodDy || 11.5), zF - 41.5), segs: 16, ch: D(.6) });
  K.mat('spring').cyl(D(4.4), D(30), { p: P3(0, yB - (sl.rodDy || 11.5), zF - 70), segs: 10 });
  // ----------------------------------------------------------- frame: dust cover + rail
  const wd = fr.wd || sl.w - 1.6, zd0 = fr.zd0 || 28, zd1 = zF - (fr.dustBack || 9);
  const rail = [[-wd / 2, yF + .6], [-wd / 2, 3.6, 1.2], [-wd / 2 + 2.3, 2.6, .4], [-wd / 2 + 2.3, .9, .3], [-wd / 2 + .5, -.3, .3], [-wd / 2 + 1.6, -3.4, .8], [wd / 2 - 1.6, -3.4, .8], [wd / 2 - .5, -.3, .3], [wd / 2 - 2.3, .9, .3], [wd / 2 - 2.3, 2.6, .4], [wd / 2, 3.6, 1.2], [wd / 2, yF + .6]];
  const railCS = SH(K, rail, .5).map(p => [p[0] * 1000, p[1] * 1000, p[2]]);
  const slotCS = SH(K, rail.map(p => [p[0], Math.max(p[1], 1.1), p[2]]), .5).map(p => [p[0] * 1000, p[1] * 1000, p[2]]);
  const slots = K.detail(0) ? (fr.railSlots || 1) : 0;
  const slotZ = []; for (let k = 0; k < slots; k++) slotZ.push(zd0 + 16 + k * 10);
  let zz = zd0;
  for (const sz of slotZ) { cs(K, railCS, zz, sz, 0, { mat: 'frame' }); cs(K, slotCS, sz, sz + 5.2, 0, { mat: 'frame' }); zz = sz + 5.2; }
  // front of the dust cover: loft into a rounded nose
  cs(K, railCS, zz, zd1 - 4, 0, { mat: 'frame' });
  loftZ(K, [[zd1 - 4, railCS], [zd1, railCS.map(p => [p[0] * .92, p[1] * .96 + .5, 1])]], 0, { mat: 'frame' });
  // frame centre above the trigger (between the grip and the dust cover)
  const zg = fr.zg ?? -26;
  cs(K, csMM2(SH(K, [[-wd / 2, 1.5], [wd / 2, 1.5], [wd / 2, yF + .6], [-wd / 2, yF + .6]], .5)), zg, zd0 + .5, 0, { mat: 'frame' });
  K.mat('bore').box(D(7.6), D(.3), D(fr.trigSlot || 16), { p: P3(0, 1.4, -1), b: 0 });
  // trigger guard (loop) — round-bevelled narrow extrusion
  const gF = fr.guardFront || 37, gB = fr.guardBottom || -22, sq = fr.guard === 'round' ? 9 : 3.2;
  const guardOuter = [[zd0 - 1, 2.5], [gF, 2.5, 2], [gF + (fr.guardHook ? 1.8 : 0), gB + 7, sq], [gF - 2.5, gB - 1.4, 4.5], [-10, gB - 1.6, 6], [-20, gB + 7, 5], [-22, 2.5, 0]];
  const guardHole = [[gF - 6, -1.4, 2], [gF - 6.4, gB + 5.6, sq * .7 + 1], [gF - 8, gB + 5.2, 3], [-7, gB + 5.3, 4], [-13.6, gB + 10.5, 3.5], [-14.2, -1.4, 1]];
  K.mat('frame').extrude(SH(K, guardOuter, .8), D(fr.guardW || 10.5), { b: D(2.6), bs: 3, holes: [SH(K, guardHole, .5)] });
  if (fr.guardSerr && K.detail(0)) for (let k = 0; k < 4; k++) K.mat('frame').box(D(9), D(.9), D(.9), { p: P3(0, gB + 6 + k * 2.6 - 2, gF + .1), b: D(.2), bs: 1 });
  // grip (stippled) + upper frame / beavertail (smooth)
  const ga = fr.ang ?? .37, gTop = [fr.gz ?? -34, fr.gy ?? -5], gLen = fr.gh || 100, gw = fr.gw || 30.5;
  const fo = fr.frontDepth || 18.5, front = fr.grooves ? (t => fo + (t > .12 && t < .78 ? -1.8 * Math.max(0, Math.sin((t - .12) / .66 * Math.PI * 3)) : 0) - t * 1.2) : (t => fo - t * 1.6 + (t > .05 && t < .2 ? 1.1 * Math.sin((t - .05) / .15 * Math.PI) : 0));
  const back = t => (fr.backDepth || 29) - t * 1.5 + (t < .15 ? (fr.hump || 1.2) * (1 - t / .15) : 0) + (t > .55 ? (fr.backSwell || 1.5) * Math.sin((t - .55) / .45 * HALF) : 0);
  const ax = (t) => gripAxisAt(gTop, ga, t, gLen), dD = [Math.cos(ga), -Math.sin(ga)], bt = fr.beaver ?? 6;
  const backT = t => back(Math.max(0, t)) + (t < .02 ? bt * Math.min(1, (.02 - t) / .1) ** .7 : 0);
  const widthT = t => t < -.02 ? wd - .3 : t < .14 ? wd - .3 + (gw - wd + .3) * sm((t + .02) / .16) : t > .93 ? gw + (fr.flare ?? 1.4) * sm((t - .93) / .07) : gw + (fr.swell ?? .6) * Math.sin((t - .14) / .79 * Math.PI);
  gripLoft(K, { top: gTop, ang: ga, len: gLen, front, back: backT, width: widthT, rf: t => 6 + ((gw / 2) * (fr.rfK ?? .82) - 6) * sm((t + .05) / .14), rb: t => 7 + ((gw / 2) * (fr.rbK ?? .72) - 7) * sm((t + .02) / .14),
    tTop: fr.tTop ?? -.27, yMax: yF - .6, mat: 'grip', blendAt: .4 });
  // frame between the trigger guard and the grip (smooth band under the slide)
  const fA = ax(.1), fP = [fA[0] + dD[0] * (front(.1) - 1.5), fA[1] + dD[1] * (front(.1) - 1.5)];
  K.mat('frame').extrude(SH(K, [fP, [-16, 1.5, 3], [zg + 30, 1.5], [zg + 30, yF + .6], [fP[0] - 14, yF + .6], [fP[0] - 16, fP[1] + 4]], 1), D(wd + .2), { b: D(2.4), bs: K.lod ? 1 : 3 });
  // controls: slide stop (left), takedown tabs (both), mag release (left), pins
  K.mat('metal').extrude(SH(K, [[-14, 0], [9, 0, 1], [12, 1.6, 1.2], [9, 3.4, 1], [-2, 3.4, 1.4], [-6, 5.6, 1.6], [-13.5, 5.6, 1.5], [-15, 2, 1]], .5), D(1.4), { p: P3(-wd / 2 - .7, yF - 6, 0), b: D(.35), bs: 1 });
  for (const sx of [-1, 1]) K.mat('metal').extrude(SH(K, [[-2.6, -1], [3.4, -1, 1.2], [3.4, 2.4, 1.2], [-2.6, 2.4, 1.2]], .4), D(1), { p: P3(sx * (wd / 2 + .3), yF - 6.5, zd0 - 4), b: D(.3), bs: 1 });
  K.mat('frame').extrude(SH(K, [[-3.2, -4.2], [3.2, -4.2], [3.2, 4.2], [-3.2, 4.2]].map(p => [p[0], p[1], 2.2]), .5), D(2.4), { p: P3(-gw / 2 + .2, -3.5, fr.magRel ?? -19), b: D(.8), bs: 2 });
  for (const sx of [-1, 1]) { K.pin({ p: P3(sx * wd / 2, 5.8, -3.5), d: D(3), mat: 'metal' }); K.pin({ p: P3(sx * wd / 2, 8.3, 9.5), d: D(3.4), mat: 'metal' }); }
  // trigger
  triggerPart(K, [0, 8.5, 1.5], { face: S.trigger || 'curved', safety: S.safety !== false, len: 20.5, w: 6.4, mat: S.trigMat || 'frame' });
  // ----------------------------------------------------------- magazine (part 'mag' along the grip axis)
  const mTop = ax(.04), magLen = gLen + (fr.magExt || 3.5);
  K.part('mag', { pivot: P3(0, mTop[1], mTop[0]) });
  K.at({ p: P3(0, mTop[1], mTop[0]), r: [ga, 0, 0] }, () => {
    const md = fr.magD || 31, mw = fr.magW || 22.5, mb = magLen - 2;
    const body = [[-md * .45, 0], [md * .5, 0], [md * .55 + (ctx.intr.mag ? 0 : 0), -mb * .2], [md * .5, -mb], [-md * .5, -mb], [-md * .52, -mb * .5]];
    K.mat('mag').extrude(SH(K, body.map((p, i) => [p[0], p[1], i < 2 ? .6 : 1.2]), .6), D(mw), { b: D(1.1), bs: 2,
      recess: K.detail(0) ? [-.16, -.3, -.44, -.58].map(t => ({ pts: csMM(circle(1.5, 10, -md * .1, mb * t)), d: D(.8), side: 1, ao: .25 })) : [] });
    const ext = ctx.intr.mag ? (ctx.intr.mag.model.ext ? ctx.intr.mag.model.ext * 1000 : 0) : 0; K.meta.magExt = true;
    const baseH = (fr.baseH || 5) + (ext > 0 ? ext : 0);
    const bf = front(1) - .6, bb = back(1) - .4;
    K.mat('frame').extrude(SH(K, [[-bb, -mb - .5], [bf, -mb - .5], [bf + (fr.baseLip || 2.5), -mb - baseH + 1.2, 1.5], [bf - 1, -mb - baseH, 1.2], [-bb + 1, -mb - baseH, 1.5], [-bb - .6, -mb - 1.8, 1]], .6), D(fr.baseW || mw + 3), { b: D(1.4), bs: 2 });
    if (ext > 0) K.mat('mag').extrude(SH(K, [[-md * .5, -mb + 1], [md * .5, -mb + 1], [md * .5, -mb - ext], [-md * .5, -mb - ext]], .5), D(mw - .4), { b: D(.5), bs: 1 });
    // feed lips + top round
    K.mat('mag').box(D(mw - 4), D(1.6), D(md * .8), { p: P3(0, .6, -md * .05), b: D(.5) });
    const cc = CAL[fr.cal || '9']; cartridge(K, cc, { p: P3(0, cc.d / 2 - 2.6, -md * .5 + 1), r: [0, 0, 0], segs: 10 });
  });
  K.use('body');
  // ----------------------------------------------------------- nodes
  sockets(K, {
    optic: sl.optic ? [[0, top - (sl.optic[2] || 3.2), (sl.optic[0] + sl.optic[1]) / 2], 'slide'] : null,
    muzzle: [[0, yB, zF - .2], 'barrel'],
    side: [[0, -3.4, zd0 + 22], null, [0, 0, Math.PI]],
    mag: [[0, mTop[1], mTop[0]], null, [ga, 0, 0]],
  });
  muzzleNode(K, yB, zF + .2, 'barrel');
  ejectNode(K, [sl.w / 2, yB + 5, sl.port ? (sl.port[0] + sl.port[1]) / 2 : 10]);
  const hp = ax(.42);
  handNodes(K, { p: [0, hp[1], hp[0]], ang: ga }, { p: [-gw / 2 - 6, hp[1] - 4, hp[0] + 4], kind: 'support', r: [ga, 0, 0] });
  sightMeta(K, [0, sLine, fsZ], [0, sLine, rsZ], 300);
  K.meta.slideTravel = D(sl.travel || 52);
};

// ---- pistol parts shared by the steel pistols ----------------------------------------------------------------------
/** hammer as part 'hammer' pivoting at piv [y, z] (mm): kind 'spur' | 'ring' | 'round'; w width */
function hammerPart(K, piv, { kind = 'spur', w = 7.5, mat = 'metal', len = 22 } = {}) {
  const [y, z] = piv; K.part('hammer', { pivot: P3(0, y, z) });
  let prof;
  if (kind === 'ring') prof = [[z + 3, y - 3], [z + 4.5, y + 8, 2], [z - 2, y + len * .62, 5], [z - 10, y + len * .55, 4], [z - 5, y + 3, 3], [z - 3, y - 4, 2]];
  else if (kind === 'round') prof = [[z + 3, y - 3], [z + 4, y + 9, 3], [z - 3, y + len * .55, 6], [z - 8, y + len * .3, 4], [z - 4, y - 4, 2]];
  else prof = [[z + 3, y - 3], [z + 4.5, y + 7, 2], [z + 1, y + len * .55, 2], [z - 5, y + len * .8, 2], [z - 13, y + len * .82, 3], [z - 12.5, y + len * .62, 2], [z - 6, y + len * .45, 3], [z - 4, y - 4, 2]];
  const holes = kind === 'ring' ? [SH(K, [[z - 3, y + len * .3, 2], [z + .5, y + len * .3, 1], [z - 1, y + len * .48, 2], [z - 5, y + len * .45, 2]], .3)] : [];
  K.mat(mat).extrude(SH(K, prof, .6), D(w), { b: D(.6), bs: 2, holes });
  if (kind === 'spur' && K.detail(0)) for (let k = 0; k < 5; k++) K.mat(mat).box(D(w - .4), D(.5), D(.7), { p: P3(0, y + len * .78 + .6 - k * .1, z - 4.5 - k * 1.8), r: [-.25, 0, 0], b: 0 });
  K.pin({ p: P3(0, y, z), d: D(4), len: D(w + 1.2), mat: 'metal' });
  K.use('body');
}
/** round / square trigger guard loop (frame part) given outer + hole outlines (mm, z/y), width w */
function guardLoop(K, outer, hole, w, b = 1.8, mat = 'rcv') { K.mat(mat).extrude(SH(K, outer, .8), D(w), { b: D(b), bs: 3, holes: [SH(K, hole, .5)] }); }
/** grip panels (slabs on both flat sides of a grip): outline (mm z/y), x = flat-side half width, t thickness, screws [[z, y]] */
function gripPanels(K, outline, x, t, { mat = 'wood2', screws = [], bevel = 1.6, sides = [-1, 1] } = {}) {
  for (const sx of sides) {
    K.mat(mat).extrude(SH(K, outline, .8), D(t), { off: sx > 0 ? D(x - .3) : -D(x + t - .3), b: D(bevel), bs: 3 });
    for (const [sz, sy] of screws) K.screw({ p: P3(sx * (x + t - .5), sy, sz), axis: sx > 0 ? 'x' : '-x', d: D(5.2), h: D(1.2), type: 'slot', mat: 'metal' });
  }
}
/** revolver cylinder (part, along +z from z0 to z0 + len, axis at cy, mm): fluted middle, chambers with bullet noses at the front */
function revolverCylinder(K, { z0, len, r, cy, n = 6, flutes = true, chR = 5.1, chOff, cal = '38', part = 'cylinder', parent = 'crane' }) {
  K.part(part, { pivot: P3(0, cy, z0), parent });
  const segs = K.seg(48), off = chOff ?? r * .56, ch = Array.from({ length: n }, (_, k) => { const a = HALF + k * TAU / n; return circle(chR, K.seg(18), Math.cos(a) * off, cy + Math.sin(a) * off); });
  const body = circle(r, segs, 0, cy);
  const fluted = [];
  for (let k = 0; k < segs; k++) {
    const a = TAU * k / segs; let rr2 = r;
    if (flutes) for (let j = 0; j < n; j++) { const fa = HALF + (j + .5) * TAU / n; let d = Math.atan2(Math.sin(a - fa), Math.cos(a - fa)); const fw = TAU / n * .26; if (Math.abs(d) < fw) rr2 = Math.min(rr2, r - (r * .13) * Math.sqrt(1 - (d / fw) ** 2)); }
    fluted.push([Math.cos(a) * rr2, cy + Math.sin(a) * rr2]);
  }
  const zA = z0 + len * .18, zB = z0 + len * .86;
  const sec = (pts, a, b, o2 = {}) => K.mat('rcv').extrude(csMM(pts), D(b - a), { plane: 'xy', off: D(a), holes: ch.map(c => csMM(c)), crease: 25, ...o2 });
  sec(body, z0, zA, { b: D(1.1), bf: 0, bb: D(1.1), bs: 2 });
  if (flutes && K.detail(1)) sec(fluted, zA, zB); else sec(body, zA, zB);
  sec(body, zB, z0 + len, { b: D(1.4), bf: D(1.4), bb: 0, bs: 2 });
  if (K.detail(1)) for (let k = 0; k < n; k++) { const a = HALF + k * TAU / n; cartridge(K, CAL[cal], { p: P3(Math.cos(a) * off, cy + Math.sin(a) * off, z0 + len - CAL[cal].len - CAL[cal].bl - 1.2), segs: 10 }); }
  // locking notches on the outside (between flutes, rear band)
  if (K.detail(0)) for (let k = 0; k < n; k++) { const a = HALF + (k + .5) * TAU / n; K.mat('dark').box(D(3), D(1.2), D(5), { p: P3(Math.cos(a) * (r - .3), cy + Math.sin(a) * (r - .3), z0 + len * .09), r: [0, 0, a - HALF], b: 0, ao: .5 }); }
  K.mat('bore').cyl(D(3.6), D(len + 2), { p: P3(0, cy, z0 - 1), segs: 14 });
  K.use('body');
}

BUILDERS.singlestack = (K, S, gun, ctx) => {
  // all-steel single-action .45 (1911 pattern): z0 slide rear, len, bushing, spur hammer, grip safety, thumb safety, wood panels
  const sl = S.slide, fr = S.frame, yF = 12, yB = sl.bore || 27, zR = sl.z0, zF = zR + sl.len, top = yF + sl.h;
  K.part('slide', { pivot: P3(0, yB, 0) });
  pistolSlide(K, { ...sl, y: yF, round: 1, r: sl.r || 7, holes: [{ r: 8.6, y: yB, d: 6 }, { r: 5.6, y: yB - 12.5, d: 4, n: 16 }] });
  // fixed sights
  const sLine = top + 5.2;
  K.mat('slide').extrude(SH(K, [[-8.5, -1], [8.5, -1], [7.6, 4.2, 1.2], [5.6, 6.6, .8], [1.6, 6.6, .3], [1.6, 4.1, .4], [-1.6, 4.1, .4], [-1.6, 6.6, .3], [-5.6, 6.6, .8], [-7.6, 4.2, 1.2]], .5), D(8), { plane: 'xy', off: D(zR + 2), p: P3(0, top - 1.1, 0), b: D(.6), bs: 1 });
  K.mat('slide').extrude(SH(K, [[-3, -1], [3.2, -1], [2.4, sLine - top, .4], [-1.2, sLine - top, .4], [-2.6, sLine - top - 1.4, .6]], .4), D(2.8), { p: P3(0, top - .5, zF - 9), b: D(.3), bs: 1 });
  K.use('body');
  // barrel + bushing + recoil plug
  K.part('barrel', { pivot: P3(0, yB, 0) });
  K.mat('barrel').tube(D(7.4), D(5.8), D(sl.len - 22), { p: P3(0, yB, zR + 23), segs: 24 });
  K.mat('bore').lathe([[D(5.8), D(zF + 1 - .2)], [D(5.8), D(zF - 8)]], { p: P3(0, yB, 0), segs: 16 });
  const pw = 13.5; K.mat('barrel').extrude(SH(K, [[-pw / 2, -7], [pw / 2, -7], [pw / 2, top - yB - .5, .8], [-pw / 2, top - yB - .5, .8]], .5), D(sl.port[1] - sl.port[0] + 6), { plane: 'xy', off: D(sl.port[0] + .4), p: [0, D(yB), 0], b: D(.5), bs: 1, recess: [{ pts: csMM(circle(6, 16)), d: D(6), side: -1, ao: .3 }] });
  K.use('slide'); K.mat('bore').box(D(sl.w - 5), D(2.4), D(sl.port[1] - sl.port[0] + 2), { p: P3(0, yF + 1.6, (sl.port[0] + sl.port[1]) / 2), b: 0, ao: .5 });
  K.mat('metal').lathe(mmP([[7.7, zF - 7], [8.9, zF - 7], [9.1, zF - 6.2], [9.1, zF + 2.2], [8.6, zF + 3], [7.7, zF + 3]]).map(p => [p[0], p[1], 1]), { p: P3(0, yB, 0), segs: 28, crease: 40 });
  K.mat('metal').lathe(mmP([[0, zF - 4], [5.2, zF - 4], [5.4, zF - 3.4], [5.4, zF + .6], [4.8, zF + 1.2], [0, zF + 1.2]]), { p: P3(0, yB - 12.5, 0), segs: 22 });
  K.use('body');
  // frame: dust cover (round-bottom), centre, guard, grip with panels, mainspring housing
  const wd = sl.w - .9, zd1 = zF - 33;
  const dust = [[-wd / 2, yF + .5], [-wd / 2, 4, 1], [-wd / 2 + 2.2, 1.2, 3], [0, .2], [wd / 2 - 2.2, 1.2, 3], [wd / 2, 4, 1], [wd / 2, yF + .5]];
  cs(K, csMM2(SH(K, dust, .5)), -26, zd1, 0, { bf: 1.2, mat: 'rcv' });
  guardLoop(K, [[-22, 4], [36, 4], [37, -6, 6], [30, -21, 9], [-4, -23, 10], [-19, -12, 5], [-22, 0]], [[-15, -1.2, 1], [31, -1.2, 2], [30.5, -8, 6], [25, -17.8, 7], [-3, -18.8, 7], [-13.5, -9.5, 4]], 7.2, 2.2);
  const ga = fr.ang ?? .3, gTop = [-44, -2], gLen = fr.gh || 96, gw = fr.gw || 24.2;
  const front = t => 15.5 - t * 1.5, back = t => 13.5 + t * 1.4;
  gripLoft(K, { top: gTop, ang: ga, len: gLen, front, back, width: t => gw, rf: t => gw / 2 * .8, rb: t => 3.2, tTop: -.08, yMax: yF - 1.5, mat: 'rcv', blendAt: .25 });
  // mainspring housing (checkered, back strap) and grip safety tang (part)
  const dD = [Math.cos(ga), -Math.sin(ga)], ax = t => gripAxisAt(gTop, ga, t, gLen);
  const msh = []; for (let k = 0; k <= 6; k++) { const t = .2 + k / 6 * .8, a = ax(t); msh.push([a[0] - dD[0] * (back(t) + .4), a[1] - dD[1] * (back(t) + .4)]); }
  for (let k = 6; k >= 0; k--) { const t = .2 + k / 6 * .8, a = ax(t); msh.push([a[0] - dD[0] * (back(t) - 6), a[1] - dD[1] * (back(t) - 6)]); }
  K.mat(fr.mshMat || 'metal').extrude(SH(K, msh.map(p => [p[0], p[1], 0]), .5), D(gw - 1.4), { b: D(2.2), bs: 2 });
  K.part('gsafety', { pivot: P3(0, 4, -50) });
  K.mat('rcv').extrude(SH(K, [[-49, -14], [-46, 9, 2], [-62, 11, 3], [-75, 8, 4], [-79, 3.5, 2.5], [-74, 1.5, 3], [-60, 0, 4], [-55, -9, 3], [-53, -15, 2]], .7), D(gw - 2), { b: D(2.6), bs: 3 });
  K.mat('rcv').extrude(SH(K, [[-55, -12], [-50, -12, 2], [-49.5, -26, 2], [-55, -24, 3]], .5), D(gw - 6), { b: D(1.2), bs: 2 });
  K.use('body');
  // wood panels with screws (checkered)
  const pAt = (t, off) => { const a = ax(t); return [a[0] + dD[0] * off, a[1] + dD[1] * off]; };
  const panel = [pAt(.12, 12.5), pAt(.95, 12), pAt(.98, -11).map((v, i) => v), pAt(.12, -11.5)].map(p => [p[0], p[1], 6]);
  gripPanels(K, panel, gw / 2, 3.2, { mat: S.panelMat || 'wood2', screws: [pAt(.22, .5), pAt(.86, .5)] });
  // controls: slide stop, thumb safety (part), plunger tube, mag release, pins
  K.mat('metal').extrude(SH(K, [[-26, 1], [6, 1, 1.5], [9, 4.6, 2], [2, 7.2, 1.2], [-19, 7.2, 2], [-27, 4, 2]], .5), D(1.6), { p: P3(-wd / 2 - .8, yF - 7.5, 0), b: D(.4), bs: 1 });
  K.pin({ p: P3(wd / 2, yF - 4.2, -2), d: D(4.4), mat: 'metal' });
  K.mat('metal').cyl(D(2.6), D(16), { p: P3(-wd / 2 - 1.6, yF - 2.6, -42), segs: 12, ch: D(.8) });
  K.part('safety', { pivot: P3(-wd / 2, yF - 5, -60) });
  K.mat('metal').extrude(SH(K, [[-66, -1], [-56, -1, 2], [-50, 3, 1.4], [-54, 5.5, 1.4], [-66, 5, 2]], .5), D(1.8), { p: P3(-wd / 2 - 1, yF - 8, 0), b: D(.4), bs: 1 });
  K.use('body');
  K.mat('metal').cyl(D(4.2), D(2.2), { p: P3(-gw / 2 - .8, -6, -36), axis: 'x', segs: 18 });
  for (const sx of [-1, 1]) K.pin({ p: P3(sx * gw / 2, 3, -24), d: D(3.2), mat: 'metal' });
  hammerPart(K, [yF - 2, zR + 4], { kind: fr.hammer || 'spur', w: 7.6, len: 24, mat: 'metal' });
  // trigger: long flat solid trigger (slides) with a bow
  K.part('trigger', { pivot: P3(0, 4, 2) });
  K.mat(fr.trigMat || 'metal').extrude(SH(K, [[-1.5, 6], [3.2, 6], [3.2, -14, 1.5], [1.2, -16, 1.4], [-1.6, -15, 1.2]], .5), D(7.4), { b: D(.8), bs: 2, holes: K.detail(0) && fr.trigHoles ? [SH(K, [[-.2, -2], [1.8, -2], [1.8, -5], [-.2, -5]], .2)] : [] });
  K.use('body');
  // magazine (single stack) + base pad
  const mTop = ax(-.06);
  K.part('mag', { pivot: P3(0, mTop[1], mTop[0]) });
  K.at({ p: P3(0, mTop[1], mTop[0]), r: [ga, 0, 0] }, () => {
    const mb = gLen + 8;
    K.mat('mag').extrude(SH(K, [[-13.5, 0], [12, 0], [12.5, -mb], [-13.5, -mb]].map(q => [q[0], q[1], 1]), .5), D(13.6), { b: D(.8), bs: 1, recess: K.detail(0) ? [-.2, -.4, -.6].map(t => ({ pts: csMM(circle(1.6, 10, -3, mb * t)), d: D(.6), side: 1, ao: .25 })) : [] });
    K.mat('mag').extrude(SH(K, [[-14.5, -mb], [13, -mb], [13.4, -mb - 2.2, .8], [-14.6, -mb - 2.2, .8]], .4), D(15.4), { b: D(.6), bs: 1 });
    if (fr.bumper !== false) K.mat('rubber').extrude(SH(K, [[-14, -mb - 2], [12.5, -mb - 2], [12, -mb - 6, 2], [-13.6, -mb - 6.5, 2.4]], .4), D(15), { b: D(1.2), bs: 2 });
    cartridge(K, CAL['45'], { p: P3(0, 4, -14.5), segs: 10 });
  });
  K.use('body');
  sockets(K, { optic: [[0, top, zR + 55], 'slide'], muzzle: [[0, yB, zF + 3], 'barrel'], side: [[0, .5, zd1 - 18], null, [0, 0, Math.PI]], mag: [[0, mTop[1], mTop[0]], null, [ga, 0, 0]] });
  muzzleNode(K, yB, zF + 3.2, 'barrel'); ejectNode(K, [sl.w / 2, yB + 5, (sl.port[0] + sl.port[1]) / 2]);
  const hp = ax(.42); handNodes(K, { p: [0, hp[1], hp[0]], ang: ga }, { p: [-gw / 2 - 7, hp[1] - 4, hp[0] + 4], kind: 'support', r: [ga, 0, 0] });
  sightMeta(K, [0, sLine, zF - 9], [0, sLine, zR + 6], 300);
};

BUILDERS.revolver = (K, S, gun, ctx) => {
  // double-action revolver: frame with top strap + cylinder window, crane + fluted cylinder (parts), barrel (round or full underlug)
  const yB = 35, cy = yB - (S.cylDy || 13.5), cr = S.cylR || 18.5, cz0 = -9, cz1 = cz0 + (S.cylLen || 40), zb0 = cz1 + 1.5, bl = S.barrel || 102, zM = zb0 + bl;
  const fw = S.frameW || 31.5, topY = yB + 10.5;
  // frame side profile with the cylinder window (hole), extruded wide, + recoil shield, top strap
  const outer = [[-26, topY - 8, 8], [-12, topY, 4], [zb0 + 8, topY, 4], [zb0 + 9, yB - 11, 5], [zb0 + 2, cy - cr - 3, 6], [cz0 + 22, cy - cr - 6, 3], [cz0 + 4, cy - cr - 5, 3], [-24, 2, 3]];
  const win = [[cz0, cy - cr - 1.2], [zb0, cy - cr - 1.2], [zb0, topY - 5.4, 1], [cz0, topY - 5.4, 1]];
  K.mat('rcv').extrude(SH(K, outer, 1), D(fw), { b: D(3.2), bs: 3, holes: [SH(K, win, .3)] });
  // top strap groove (rear notch sight) or adjustable rear sight
  if (S.rail) {
    K.mat('metal').extrude(SH(K, [[-8, -1], [8, -1], [8, 3.5, 1], [2, 5.8, .6], [2, 4, .3], [-2, 4, .3], [-2, 5.8, .6], [-8, 3.5, 1]], .4), D(13), { plane: 'xy', off: D(-17), p: P3(0, topY - .6, 0), b: D(.5), bs: 1 });
  } else K.mat('bore').box(D(3.4), D(1.6), D(30), { p: P3(0, topY - .5, -6), b: 0, ao: .6 });
  const sLine = S.rail ? topY + 4.6 : topY - 1.2;
  // grip frame + grips
  const ga = S.ang ?? .45, gTop = [-31, 6], gLen = S.gh || 84, grip = S.grip || {};
  const front = grip.grooves ? (t => 14 + (t > .2 && t < .85 ? -1.8 * Math.max(0, Math.sin((t - .2) / .65 * Math.PI * 3)) : 0)) : (t => 14.5 - t * 2);
  const back = t => 15 + t * 3 + (grip.round ? -3 * Math.max(0, (t - .7) / .3) ** 2 : 0) + (t < .1 ? 4 * (1 - t / .1) : 0);
  K.mat('rcv').extrude(SH(K, [[-24, 4], [-12, 4], [-15, -6, 3], [-30, -2, 3], [-45, 8, 5], [-40, topY - 6, 6]], .8), D(fw - 5), { b: D(2.4), bs: 3 });
  gripLoft(K, { top: gTop, ang: ga, len: gLen, front, back, width: t => (grip.w || 35) - (t < .12 ? 8 * (1 - t / .12) : 0), rf: t => 12, rb: t => grip.round ? 13 : 9, tTop: -.04, mat: grip.mat || 'wood2', blendAt: .35, rows: 18 });
  if (grip.medallion && K.detail(0)) for (const sx of [-1, 1]) K.mat('metal').cyl(D(4.5), D(.8), { p: P3(sx * (grip.w || 35) / 2, gripAxisAt(gTop, ga, .22, gLen)[1], gripAxisAt(gTop, ga, .22, gLen)[0] - 2), axis: 'x', segs: 16 });
  // trigger guard + trigger + hammer
  guardLoop(K, [[-14, 3], [cz0 + 30, 3], [cz0 + 30, -8, 6], [cz0 + 22, -19, 8], [-6, -21, 9], [-17, -11, 4]], [[-11, -1], [cz0 + 26, -1, 2], [cz0 + 25.5, -7, 5], [cz0 + 19, -15.5, 7], [-5, -17.3, 7], [-13, -9, 4]], 7.4, 2);
  K.part('trigger', { pivot: P3(0, 6, 1) });
  K.mat('metal').extrude(SH(K, [[-2.5, 8], [3, 8], [5.5, -2, 6], [3.5, -11, 4], [.5, -14, 1.5], [-2, -12, 3], [-1, -2, 6]], .6), D(S.trigW || 8.5), { b: D(1.5), bs: 2 });
  K.use('body');
  hammerPart(K, [yB - 12, -20], { kind: 'spur', w: 8, len: 26, mat: 'metal' });
  // crane (part) + cylinder (child part) + ejector rod
  K.part('crane', { pivot: P3(-6, cy - cr + 3, 0), meta: { swing: [0, 0, 1.25] } });
  K.mat('rcv').box(D(10), D(9), D(5), { p: P3(-2, cy - cr + 4, cz1 + 3), b: D(1.4) });
  revolverCylinder(K, { z0: cz0, len: cz1 - cz0, r: cr, cy, cal: S.cal || '38', parent: 'crane' });
  K.use('crane');
  const rodL = S.underlug ? bl - 12 : Math.min(bl * .7, 58);
  K.mat('bright').cyl(D(2.6), D(rodL + 4), { p: P3(0, cy, cz1 - 2), segs: 14, ch: D(.6) });
  if (!S.underlug) K.mat('metal').lathe(mmP([[2.6, 0], [4.2, 0], [4.4, .6], [4.4, 7.4], [4, 8], [0, 8]]), { p: P3(0, cy, cz1 + rodL + 1), segs: 18 });
  K.use('body');
  // barrel: lathe (tapered) + ejector shroud / full underlug + rib / rail, front sight
  K.mat('barrel').lathe(mmP([[4.5, zb0], [S.bR || 8.2, zb0], [S.bR || 8.2, zb0 + 10], [(S.bR || 8.2) - .6, zM - 2, 1], [(S.bR || 8.2) - 1.2, zM, 1], [4.6, zM], [4.6, zM - 4]]), { p: P3(0, yB, 0), segs: 28, crease: 30 });
  K.mat('bore').lathe([[D(4.6), D(zM - 3)], [D(4.6), D(zM - 30)]], { p: P3(0, yB, 0), segs: 14 });
  if (S.underlug) {
    const lug = [[zb0 - 1, yB - 2], [zM, yB - 2], [zM, cy - 5.5, 4], [zM - 4, cy - 7, 1], [zb0 + 6, cy - 7, 3], [zb0, cy - 1]];
    K.mat('barrel').extrude(SH(K, lug, 1), D(14), { b: D(5.4), bs: 4 });
    K.mat('barrel').extrude(SH(K, [[zb0 - 1, yB + 2], [zM - .5, yB + 2], [zM - .5, yB + 9.5, 1.2], [zb0 + 4, yB + 9.5, 1.2]], .8), D(8), { b: D(1.8), bs: 2 });
    if (S.rail) K.rail(D(bl - 30), { p: P3(0, yB + 9.2, zb0 + 12), w: .95 });
  } else {
    K.mat('barrel').extrude(SH(K, [[zb0 - 1, yB - 3], [zb0 + rodL - 4, yB - 3], [zb0 + rodL + 2, cy - 2, 6], [zb0 + rodL - 6, cy - 6.5, 3], [zb0 + 4, cy - 6.5, 3], [zb0 - 1, cy - 2]], .8), D(10), { b: D(2), bs: 3 });
    K.mat('barrel').extrude(SH(K, [[zb0 - 1, yB], [zM - .5, yB], [zM - .5, yB + 8.3, 1], [zb0 + 4, yB + 8.3, 1.4]], .8), D(7.5), { b: D(1.6), bs: 2 });
  }
  const fz = zM - 7, fh = sLine - (yB + (S.underlug ? 9.5 : 8.3));
  K.mat('metal').extrude(SH(K, [[-14, 0], [2, 0], [2, fh, .4], [-3, fh, .6]], .4), D(3), { p: P3(0, sLine - fh, fz), b: D(.4), bs: 1 });
  if (S.insert) K.mat(S.insert).box(D(3.2), D(2.2), D(1.4), { p: P3(0, sLine - 1.6, fz - 2.2), b: 0 });
  // cylinder release latch (left), side plate seam screws, crane latch
  K.mat('metal').extrude(SH(K, [[-14, -3], [-2, -3, 1.4], [-2, 3, 1.4], [-14, 3, 1.4]], .5), D(2.4), { p: P3(-fw / 2 - .8, cy + 4, 0), b: D(.5), bs: 1 });
  if (K.detail(0)) for (const [sz, sy] of [[-30, 26], [-8, -8], [14, -10]]) K.screw({ p: P3(-fw / 2 + .3, sy, sz), axis: '-x', d: D(5), h: D(.8), type: 'slot', mat: 'metal' });
  sockets(K, { optic: S.rail ? [[0, yB + 9.2 + 9, zb0 + 12 + (bl - 30) * .45]] : null, side: [[0, cy - 7, zb0 + (S.underlug ? bl * .3 : 6)], null, [0, 0, Math.PI]], muzzle: [[0, yB, zM]], mag: [[0, cy, cz0], 'cylinder'] });
  muzzleNode(K, yB, zM + .2); ejectNode(K, [-cr - 4, cy, cz0 + 10], 'none', 'cylinder');
  const hp = gripAxisAt(gTop, ga, .42, gLen); handNodes(K, { p: [0, hp[1], hp[0]], ang: ga }, { p: [-(grip.w || 35) / 2 - 6, hp[1] - 4, hp[0] + 4], kind: 'support', r: [ga, 0, 0] });
  sightMeta(K, [0, sLine, fz], [0, sLine, S.rail ? -12 : -20], 290);
};

BUILDERS.machinePistol = (K, S, gun, ctx) => {
  // steel select-fire pistol: long round-top slide, slide-mounted selector, drum rear sight, big grip with bakelite wrap, wire stock
  const sl = S.slide, yF = 12, yB = sl.bore || 27, zR = sl.z0, zF = zR + sl.len, top = yF + sl.h;
  K.part('slide', { pivot: P3(0, yB, 0) });
  pistolSlide(K, { ...sl, y: yF, round: 1, r: sl.r || 8, holes: [{ r: 7.6, y: yB, d: 6 }] });
  // drum (tangent) rear sight + front blade
  const sLine = top + 5.6;
  K.mat('metal').lathe(mmP([[0, -8], [4.8, -8], [5, -7.4], [5, 7.4], [4.8, 8], [0, 8]]), { axis: 'x', p: P3(0, top + 1.6, zR + 14), segs: 16 });
  K.mat('metal').extrude(SH(K, [[-6, 0], [6, 0], [6, 6.6, .6], [1.5, 6.6, .3], [1.5, 4, .3], [-1.5, 4, .3], [-1.5, 6.6, .3], [-6, 6.6, .6]], .4), D(3), { plane: 'xy', off: D(zR + 18), p: P3(0, top - .4, 0), b: D(.3), bs: 1 });
  K.mat('metal').extrude(SH(K, [[-4, -.5], [3, -.5], [2, sLine - top, .4], [-1.4, sLine - top, .4], [-2.6, sLine - top - 1.4, .6]], .4), D(2.6), { p: P3(0, top, zF - 8), b: D(.3), bs: 1 });
  K.part('selector', { pivot: P3(-sl.w / 2 - 1, yB + 2, zR + 16), parent: 'slide' });
  K.mat('metal').cyl(D(6.5), D(2.2), { p: P3(-sl.w / 2 - 1.1, yB + 2, zR + 16), axis: 'x', segs: 22, ch: D(.6) });
  K.mat('metal').extrude(SH(K, [[-2.6, 0], [2.6, 0], [1.8, 14, 1.6], [-1.8, 14, 1.6]], .4), D(2), { p: P3(-sl.w / 2 - 2.6, yB + 2, zR + 16), r: [-.5, 0, 0], b: D(.4), bs: 1 });
  K.use('body');
  K.part('barrel', { pivot: P3(0, yB, 0) });
  K.mat('barrel').tube(D(7), D(4.6), D(sl.len - 40), { p: P3(0, yB, zR + 40), segs: 22 });
  K.mat('bore').lathe([[D(4.6), D(zF - .2)], [D(4.6), D(zF - 10)]], { p: P3(0, yB, 0), segs: 14 });
  K.use('slide'); K.mat('bore').box(D(sl.w - 5), D(2.6), D(sl.port[1] - sl.port[0]), { p: P3(0, yF + 1.8, (sl.port[0] + sl.port[1]) / 2), b: 0, ao: .5 });
  K.mat('barrel').box(D(13), D(8), D(sl.port[1] - sl.port[0] + 4), { p: P3(0, yB + 1, (sl.port[0] + sl.port[1]) / 2 + 2), b: D(.6) });
  K.use('body');
  // frame: round dust cover, big round guard, grip wrapped in bakelite, lanyard ring
  const wd = sl.w - 1;
  cs(K, csMM2(SH(K, [[-wd / 2, yF + .5], [-wd / 2, 3.5, 1], [-wd / 2 + 3, .5, 4], [0, -.2], [wd / 2 - 3, .5, 4], [wd / 2, 3.5, 1], [wd / 2, yF + .5]], .5)), -28, zF - 26, 0, { bf: 1.4, mat: 'rcv' });
  guardLoop(K, [[-24, 3], [40, 3], [42, -8, 8], [32, -26, 12], [-6, -28, 12], [-22, -14, 6], [-25, 0]], [[-16, -1.4, 1], [34, -1.4, 2], [35, -8, 6], [26, -21.5, 9], [-4, -22.6, 9], [-15, -11, 4]], 7.6, 2.2);
  const ga = .26, gTop = [-44, -2], gLen = 104, gw = 33;
  gripLoft(K, { top: gTop, ang: ga, len: gLen, front: t => 17 - t * 1.5, back: t => 17 + t * 1.6 + (t < .1 ? 4 * (1 - t / .1) : 0), width: t => t < .08 ? 26 + 7 * t / .08 : gw, rf: t => 9, rb: t => 8, tTop: -.08, yMax: yF - 1.5, mat: 'bakelite', blendAt: .3 });
  K.mat('rcv').extrude(SH(K, [[-30, 3], [-20, 3], [-26, -12, 3], [-46, -12, 3], [-62, 0, 4], [-62, yF + .5], [-30, yF + .5]], .8), D(wd), { b: D(2), bs: 2 });
  const heel = gripAxisAt(gTop, ga, 1, gLen);
  K.mat('metal').lathe(mmP([[5, -1.6], [6.6, -1.6], [6.6, 1.6], [5, 1.6], [5, -1.6]]), { axis: 'x', p: P3(0, heel[1] - 4, heel[0] - 17), segs: 18 });
  hammerPart(K, [yF - 1, zR + 3], { kind: 'round', w: 8, len: 20 });
  triggerPart(K, [0, 8, 2], { face: 'curved', len: 21, w: 7, mat: 'metal' });
  // magazine
  const mTop = gripAxisAt(gTop, ga, .02, gLen);
  K.part('mag', { pivot: P3(0, mTop[1], mTop[0]) });
  K.at({ p: P3(0, mTop[1], mTop[0]), r: [ga, 0, 0] }, () => {
    const mb = gLen + 2;
    K.mat('mag').extrude(SH(K, [[-14, 0], [14, 0], [14, -mb], [-14, -mb]].map(q => [q[0], q[1], 1]), .5), D(19), { b: D(.8), bs: 1 });
    K.mat('mag').extrude(SH(K, [[-15, -mb], [15.5, -mb], [15.8, -mb - 3, 1], [-15, -mb - 3, 1]], .4), D(21), { b: D(.7), bs: 1 });
    cartridge(K, CAL['9'], { p: P3(0, 4.4, -14), segs: 10 });
  });
  K.use('body');
  // wire stock (part, folds up over the slide)
  const hz = heel[0] - 22, hy = heel[1] + 10;
  K.part('stock', { pivot: P3(0, hy, hz), meta: { fold: { r: [2.85, 0, 0] } } });
  K.mat('rcv').box(D(16), D(22), D(14), { p: P3(0, hy + 2, hz - 3), b: D(2.4) });
  for (const sx of [-1, 1]) K.mat('rcv').sweep([P3(sx * 6, hy + 8, hz - 8), P3(sx * 9, hy + 20, hz - 80), P3(sx * 10, hy + 26, hz - 175), P3(sx * 10, hy + 27, hz - 196)], { rad: D(3.6), segs: 10 });
  K.mat('rcv').sweep([P3(-5, hy - 6, hz - 8), P3(0, hy - 10, hz - 100), P3(0, hy - 14, hz - 196)], { rad: D(3.4), segs: 10 });
  K.mat('rubber').extrude(SH(K, [[-6, -26], [6, -26], [6, 44, 4], [-6, 44, 4]].map(q => [q[0], q[1], 4]), .8), D(32), { p: P3(0, hy + 8, hz - 200), b: D(3), bs: 3 });
  K.use('body');
  sockets(K, { muzzle: [[0, yB, zF], 'barrel'], side: [[0, -.2, zF - 40], null, [0, 0, Math.PI]], mag: [[0, mTop[1], mTop[0]], null, [ga, 0, 0]], stock: [[0, hy, hz]] });
  muzzleNode(K, yB, zF + .2, 'barrel'); ejectNode(K, [sl.w / 2, yB + 5, (sl.port[0] + sl.port[1]) / 2]);
  const hp = gripAxisAt(gTop, ga, .42, gLen); handNodes(K, { p: [0, hp[1], hp[0]], ang: ga }, { p: [-gw / 2 - 7, hp[1] - 4, hp[0] + 4], kind: 'support', r: [ga, 0, 0] });
  sightMeta(K, [0, sLine, zF - 8], [0, sLine, zR + 18], 250);
};

BUILDERS.largePistol = (K, S, gun, ctx) => {
  // big-bore gas pistol: angular slide on the rear, fixed barrel in a faceted triangular shroud with a top rail
  const yF = 13, yB = 31, zR = -96, zS = 42, zM = 174, sw = 32, sh = 33, top = yF + sh;
  K.part('slide', { pivot: P3(0, yB, 0) });
  const full = slideCS(sw, sh, 6.5, {}), groove = slideCS(sw, sh, 6.5, { si: 1.4 });
  cs(K, full, zR, zR + 6, yF, { bb: 1.6, mat: 'slide' });
  let z = zR + 6; for (let k = 0; k < (K.detail(0) ? 7 : 0); k++) { cs(K, groove, z, z + 3.2, yF, { mat: 'slide' }); cs(K, full, z + 3.2, z + 6, yF, { mat: 'slide' }); z += 6; }
  cs(K, full, z, -6, yF, { mat: 'slide' });
  const pt = 2.6, Lp = [[-sw / 2, 0], [-sw / 2 + pt, 0], [-sw / 2 + pt, sh - 3.6], [-1.5, sh - 3.6], [-1.5, sh], [-sw / 2 + 6.5, sh], [-sw / 2, sh - 6.5]], Rp = [[sw / 2 - pt, 0], [sw / 2, 0], [sw / 2, sh * .45], [sw / 2 - pt, sh * .45]];
  cs(K, Lp, -6, 34, yF, { mat: 'slide' }); cs(K, Rp, -6, 34, yF, { mat: 'slide' });
  cs(K, full, 34, zS, yF, { bf: 1.6, mat: 'slide' });
  K.mat('bore').box(D(sw - 6), D(3), D(40), { p: P3(0, yF + 2, 14), b: 0, ao: .5 });
  K.mat('barrel').box(D(18), D(16), D(40), { p: P3(0, yB + 1, 14), b: D(.8) });
  for (const sx of [-1, 1]) { K.part('safety_' + (sx > 0 ? 'r' : 'l'), { pivot: P3(sx * sw / 2, yB + 4, zR + 14), parent: 'slide' }); K.mat('metal').extrude(SH(K, [[-4, -3], [5, -3, 1.5], [12, 1, 1.5], [10, 4, 1.5], [-4, 3, 2]], .5), D(2), { p: P3(sx * (sw / 2 + 1), yB + 4, zR + 14), b: D(.5), bs: 1 }); K.use('slide'); }
  K.mat('metal').extrude(SH(K, [[-11, -1], [11, -1], [10, 5.6, 1], [7, 7.8, .6], [1.8, 7.8, .3], [1.8, 5, .3], [-1.8, 5, .3], [-1.8, 7.8, .3], [-7, 7.8, .6], [-10, 5.6, 1]], .5), D(10), { plane: 'xy', off: D(zR + 4), p: P3(0, top - .5, 0), b: D(.5), bs: 1 });
  K.use('body');
  // faceted barrel shroud (fixed): loft3 from the slide front to the muzzle, tapering into a triangular nose, bore hole
  const sec = (k) => { const w = 33 - k * 2.5, hb = 26 - k * 6, tw = w; return [[-tw / 2, yB + 10], [-tw / 2 + 3, yB + 13], [tw / 2 - 3, yB + 13], [tw / 2, yB + 10], [w / 2 - 2.5, yB - 4], [w * .18, yB - hb + 2], [0, yB - hb], [-w * .18, yB - hb + 2], [-w / 2 + 2.5, yB - 4]]; };
  const rowAt = (pts, zz) => pts.map(p => [D(p[0]), D(p[1]), D(zz), p[2] || 0]);
  K.mat('barrel').loft3([rowAt(sec(0), zS - 6), rowAt(sec(0), zM - 30), rowAt(sec(.55), zM - 3), rowAt(sec(.6).map(p => [p[0] * .96, yB + (p[1] - yB) * .96, 1]), zM)],
    { sharpRows: [2], crease: 30, holesB: [{ pts: circle(D(7.4), K.seg(22), 0, D(yB)).map(([x, y]) => [x, y, D(zM)]), d: D(8), ao: .3 }], cw: 0 });
  K.mat('bore').cyl(D(6.4), D(12), { p: P3(0, yB, zM - 14), segs: 16 });
  if (K.detail(0)) for (const zz of [zM - 60, zM - 44]) for (const sx of [-1, 1]) K.mat('bore').box(D(1.2), D(5), D(9), { p: P3(sx * 15.8, yB + 2, zz), b: 0, ao: .5 });
  K.rail(D(zM - zS - 22), { p: P3(0, yB + 13, zS + 4) });
  const sLine = yB + 13 + 9 + 3.6;
  K.mat('metal').extrude(SH(K, [[-6, -.5], [3, -.5], [2, sLine - yB - 22, .4], [-2, sLine - yB - 22, .4], [-4, sLine - yB - 23.6, .6]], .4), D(4), { p: P3(0, yB + 22, zM - 9), b: D(.4), bs: 1 });
  // frame: dust cover, hooked guard, grip (wraparound rubber), hammer, trigger
  const wd = sw - 2;
  cs(K, csMM2(SH(K, [[-wd / 2, yF + .5], [-wd / 2, 3, 1.5], [-wd / 2 + 4, -1.2, 2], [wd / 2 - 4, -1.2, 2], [wd / 2, 3, 1.5], [wd / 2, yF + .5]], .5)), -34, 64, 0, { bf: 2.4, mat: 'rcv' });
  guardLoop(K, [[-24, 2], [46, 2], [50, -10, 2], [46, -12, 2], [42, -26, 6], [-6, -28, 10], [-24, -14, 5], [-27, 0]], [[-16, -2, 1], [38, -2, 2], [37, -21, 6], [-4, -22.5, 8], [-15, -12, 4]], 8.8, 2.4);
  const ga = .3, gTop = [-50, -2], gLen = 110, gw = 35;
  gripLoft(K, { top: gTop, ang: ga, len: gLen, front: t => 20 - t * 1.2, back: t => 21 + t * 1.2 + (t < .1 ? 3 * (1 - t / .1) : 0), width: t => t < .06 ? 29 + 6 * t / .06 : gw, rf: t => 9, rb: t => 7, tTop: -.08, yMax: yF - 1.5, mat: 'rubber_g', blendAt: .3 });
  K.mat('rcv').extrude(SH(K, [[-30, 2], [-22, 2], [-27, -14, 3], [-48, -12, 3], [-72, 2, 4], [-74, yF + .5], [-30, yF + .5]], .8), D(wd), { b: D(2.2), bs: 2 });
  hammerPart(K, [yF - 1, zR - 2], { kind: 'round', w: 9, len: 24 });
  triggerPart(K, [0, 8, 2], { face: 'straight', len: 22, w: 8.5, mat: 'metal' });
  K.mat('metal').extrude(SH(K, [[-18, -1], [10, -1, 1.5], [12, 4, 2], [-12, 5, 2], [-19, 3, 1.5]], .5), D(1.8), { p: P3(-wd / 2 - .9, yF - 6, 0), b: D(.45), bs: 1 });
  for (const sx of [-1, 1]) { for (const t of [.25, .78]) { const a = gripAxisAt(gTop, ga, t, gLen); K.screw({ p: P3(sx * (gw / 2 - .3), a[1], a[0]), axis: sx > 0 ? 'x' : '-x', d: D(5.6), h: D(1), type: 'torx', mat: 'metal' }); } K.pin({ p: P3(sx * wd / 2, yF - 4, -8), d: D(4.4), mat: 'metal' }); K.pin({ p: P3(sx * wd / 2, yF - 6, 30), d: D(3.6), mat: 'metal' }); }
  K.use('slide'); K.mat('metal').extrude(SH(K, [[-10, 4], [10, 4], [10, 24, 3], [-10, 24, 3]], .5), D(1.4), { plane: 'xy', off: D(zR - .8), p: P3(0, yF, 0), b: D(.4), bs: 1 }); K.use('body');
  const mTop = gripAxisAt(gTop, ga, .02, gLen);
  K.part('mag', { pivot: P3(0, mTop[1], mTop[0]) });
  K.at({ p: P3(0, mTop[1], mTop[0]), r: [ga, 0, 0] }, () => {
    const mb = gLen + 2;
    K.mat('mag').extrude(SH(K, [[-19, 0], [19, 0], [19, -mb], [-19, -mb]].map(q => [q[0], q[1], 1]), .5), D(18), { b: D(.8), bs: 1 });
    K.mat('rubber').extrude(SH(K, [[-21, -mb], [21, -mb], [22, -mb - 5, 2], [-21, -mb - 5, 2]], .5), D(24), { b: D(1.4), bs: 2 });
    cartridge(K, CAL['50'], { p: P3(0, 5, -19), segs: 12 });
  });
  K.use('body');
  sockets(K, { optic: [[0, yB + 22, 110]], muzzle: [[0, yB, zM]], side: [[0, -1.2, 47], null, [0, 0, Math.PI]], mag: [[0, mTop[1], mTop[0]], null, [ga, 0, 0]] });
  muzzleNode(K, yB, zM + .2); ejectNode(K, [sw / 2, yB + 5, 14]);
  const hp = gripAxisAt(gTop, ga, .42, gLen); handNodes(K, { p: [0, hp[1], hp[0]], ang: ga }, { p: [-gw / 2 - 7, hp[1] - 4, hp[0] + 4], kind: 'support', r: [ga, 0, 0] });
  sightMeta(K, [0, sLine, zM - 9], [0, sLine, zR + 9], 300);
};

BUILDERS.integralPistol = (K, S, gun, ctx) => {
  // .22 target pistol: round receiver tube with top rail, bolt with ears, integral suppressor tube, steep graphite grip
  const yB = 22, rr0 = 12.6, zR = -72, zC = 54, zM = 226, cR = 14.6;
  K.mat('rcv').lathe(mmP([[0, zR], [rr0 - 1.2, zR, 1], [rr0, zR + 1.2, 1], [rr0, zC - 1, 1], [rr0 - .8, zC, 1], [0, zC]]), { p: P3(0, yB, 0), segs: 32 });
  K.rail(D(98), { p: P3(0, yB + rr0 - 2.4, zR + 6) });
  K.mat('bore').box(D(3), D(8), D(30), { p: P3(rr0 - .8, yB + 2, -30), b: 0, ao: .4 });
  K.part('bolt', { pivot: P3(0, yB, zR) });
  K.mat('bright').cyl(D(7.5), D(26), { p: P3(0, yB, zR - 12), segs: 20, ch: D(.8) });
  for (const sx of [-1, 1]) K.mat('bright').extrude(SH(K, [[-4, -4], [4, -4, 1.5], [4, 4, 1.5], [-4, 4, 1.5]], .4), D(9), { p: P3(sx * 10, yB, zR - 8), b: D(1), bs: 2 });
  K.use('body');
  // integral suppressor: lathe with end caps and a knurled grip band
  K.mat('barrel').lathe(mmP([[rr0 - 1, zC - 4], [cR - .8, zC - 4, 1], [cR, zC - 3, 1], [cR, zC + 18, 1], [cR - .5, zC + 19], [cR - .5, zC + 30], [cR, zC + 31, 1], [cR, zM - 3, 1], [cR - 1.6, zM, 1], [3.4, zM], [3.4, zM - 5]]), { p: P3(0, yB, 0), segs: 36, crease: 30 });
  K.mat('steel_k').lathe(mmP([[cR - .5, zC + 19], [cR - .3, zC + 19.5], [cR - .3, zC + 29.5], [cR - .5, zC + 30]]), { p: P3(0, yB, 0), segs: 36 });
  K.mat('bore').lathe([[D(3.4), D(zM - 1)], [D(3.4), D(zM - 20)]], { p: P3(0, yB, 0), segs: 12 });
  if (K.detail(0)) for (const zz of [zM - 40, zM - 80, zM - 120]) K.mat('dark').lathe(mmP([[cR + .05, zz - .6], [cR + .05, zz + .6]]), { p: P3(0, yB, 0), segs: 36 });
  // sights: rear notch on the rail, front blade clamped on the can
  const sLine = yB + cR + 6.5;
  K.mat('metal').extrude(SH(K, [[-8, -1], [8, -1], [7, 5.5, 1], [1.6, 6.8, .4], [1.6, 4.4, .3], [-1.6, 4.4, .3], [-1.6, 6.8, .4], [-7, 5.5, 1]], .4), D(9), { plane: 'xy', off: D(zR + 8), p: P3(0, sLine - 4.4, 0), b: D(.4), bs: 1 });
  K.mat('metal').lathe(mmP([[cR + .1, zM - 30], [cR + 2, zM - 29.5], [cR + 2, zM - 14.5], [cR + .1, zM - 14]]), { p: P3(0, yB, 0), segs: 32, a0: HALF - .6, a1: HALF + .6 });
  K.mat('metal').extrude(SH(K, [[-8, 0], [4, 0], [3, sLine - yB - cR - 1.6, .4], [-3, sLine - yB - cR - 1.6, .5]], .4), D(2.6), { p: P3(0, yB + cR + 1.6, zM - 20), b: D(.3), bs: 1 });
  K.mat('fibre_r').cyl(D(.8), D(4), { p: P3(0, sLine - 1.3, zM - 23), segs: 8 });
  // frame (graphite polymer): under the receiver, guard, steep grip
  K.mat('frame').extrude(SH(K, [[-58, yB - 8], [44, yB - 8], [44, yB - 15, 3], [30, 3, 4], [-30, 3], [-58, yB - 18, 6]], .8), D(19), { b: D(2.6), bs: 3 });
  guardLoop(K, [[-22, 4], [38, 4], [40, -8, 8], [30, -22, 12], [-4, -24, 10], [-20, -12, 5], [-24, 0]], [[-15, -1, 1], [32, -1, 2], [32.5, -8, 6], [24, -18.5, 9], [-3, -19.5, 8], [-14, -10, 4]], 9, 2.4, 'frame');
  const ga = .5, gTop = [-40, 0], gLen = 96, gw = 29;
  gripLoft(K, { top: gTop, ang: ga, len: gLen, front: t => 15 - t * 1.2, back: t => 15.5 + t * 2 + (t < .1 ? 5 * (1 - t / .1) : 0), width: t => t < .08 ? 19 + 10 * t / .08 : gw, rf: t => 10, rb: t => 9, tTop: -.08, yMax: yB - 10, mat: 'grip', blendAt: .3 });
  triggerPart(K, [0, 8, 2], { face: 'curved', len: 20, w: 6.5, mat: 'metal' });
  for (const sx of [-1, 1]) { for (const t of [.3, .75]) { const a = gripAxisAt(gTop, ga, t, gLen); K.screw({ p: P3(sx * (gw / 2 - .2), a[1], a[0] - 3), axis: sx > 0 ? 'x' : '-x', d: D(5), h: D(.9), type: 'hex', mat: 'metal' }); } K.pin({ p: P3(sx * 9.5, yB - 12, -40), d: D(3.6), mat: 'metal' }); K.pin({ p: P3(sx * 9.5, yB - 12, 30), d: D(3.6), mat: 'metal' }); }
  { const heel = gripAxisAt(gTop, ga, .98, gLen); K.mat('metal').cyl(D(3.4), D(6), { p: P3(0, heel[1] + 2, heel[0] - 17), r: [-HALF + ga, 0, 0], segs: 12, ch: D(.6) }); }
  K.mat('metal').extrude(SH(K, [[-8, -2], [6, -2, 1.5], [6, 4, 1.5], [-8, 4, 1.5]], .4), D(1.4), { p: P3(-9.8, yB - 6, -8), b: D(.4), bs: 1 });
  const mTop = gripAxisAt(gTop, ga, .02, gLen);
  K.part('mag', { pivot: P3(0, mTop[1], mTop[0]) });
  K.at({ p: P3(0, mTop[1], mTop[0]), r: [ga, 0, 0] }, () => {
    const mb = gLen + 2;
    K.mat('mag').extrude(SH(K, [[-12, 0], [10, 0], [10, -mb], [-12, -mb]].map(q => [q[0], q[1], .8]), .5), D(9), { b: D(.6), bs: 1 });
    K.mat('frame').extrude(SH(K, [[-14, -mb], [12, -mb], [12, -mb - 5, 1.5], [-14, -mb - 5, 1.5]], .4), D(17), { b: D(1.2), bs: 2 });
    cartridge(K, CAL['22'], { p: P3(0, 3, -11), segs: 10 });
  });
  K.use('body');
  sockets(K, { optic: [[0, yB + rr0 - 2.4 + 9, -10]], side: [[0, 7, 46], null, [0, 0, Math.PI]], mag: [[0, mTop[1], mTop[0]], null, [ga, 0, 0]], muzzle: [[0, yB, zM]] });
  muzzleNode(K, yB, zM + .2); ejectNode(K, [rr0, yB + 3, -30]);
  const hp = gripAxisAt(gTop, ga, .45, gLen); handNodes(K, { p: [0, hp[1], hp[0]], ang: ga }, { p: [-gw / 2 - 7, hp[1] - 4, hp[0] + 4], kind: 'support', r: [ga, 0, 0] });
  sightMeta(K, [0, sLine, zM - 20], [0, sLine, zR + 12], 300);
};

// ---- long-gun helpers ---------------------------------------------------------------------------------------------
/** raked pistol grip (loft), top [z, y] where it meets the receiver; returns the right-hand pose */
function longGrip(K, o) {
  const { z, y, ang = .28, len = 92, w = 30, f = 16, b = 21, mat = 'grip', grooves = false, tTop = -.04, flare = 0 } = o;
  const front = grooves ? (t => f + (t > .14 && t < .86 ? -1.7 * Math.max(0, Math.sin((t - .14) / .72 * Math.PI * 3)) : 0) - t * 1.0) : (t => f - t * 1.2);
  const back = t => b + t * 1.6 + (o.hump ? o.hump * Math.sin(Math.min(1, Math.max(0, t) / .55) * Math.PI) : 0);
  gripLoft(K, { top: [z, y], ang, len, front, back, width: t => w + (t > .9 ? flare * (t - .9) / .1 : 0), rf: t => w / 2 * (o.rfK || .82), rb: t => w / 2 * (o.rbK || .72), tTop, mat, blendAt: .55, yMax: o.yMax, rows: o.rows || 16 });
  const hp = gripAxisAt([z, y], ang, .45, len);
  return { p: [0, hp[1], hp[0]], ang };
}
/** box magazine as part 'mag' (pivot at the top centre): len along the spine, d depth, w width, bend (rad, + curves forward going
    down), rake, ribs, base plate height; ext extends it (extended magazines); cal = top round */
function boxMag(K, { top, len, d, w, bend = 0, rake = 0, mat = 'mag', cal = '9', base = 4, ribs = true, ext = 0, frame = null, rot = null, baseMat = null, part = 'mag', parent, variant = null }) {
  K.part(part, { pivot: P3(0, top[1], top[0]), parent });
  K.meta.magExt = K.meta.magCoupled = true;
  const vk = variant && variant.model && variant.model.kind;
  if (vk === 'drum' || vk === 'twindrum') {   // drum magazines: feed tower + round drum(s) (Barrel-Drum 50 / Century 100)
    K.at({ p: P3(0, top[1], top[0]), r: rot || [rake, 0, 0] }, () => {
      const R = (variant.model.dia || .13) * 500, tw = vk === 'twindrum' ? 2 : 1, th = vk === 'twindrum' ? 44 : 54;
      K.mat(mat).extrude(SH(K, [[-d / 2, 2], [d / 2, 2], [d / 2 + 2, -46, 3], [-d / 2 - 2, -46, 3]], .6), D(w), { b: D(1), bs: 2 });
      for (let k = 0; k < tw; k++) { const x = tw === 2 ? (k ? 1 : -1) * (th / 2 + 2) : 0;
        K.mat(mat).lathe(mmP([[0, -th / 2], [R - 3, -th / 2, 1], [R, -th / 2 + 3, 1], [R, th / 2 - 3, 1], [R - 3, th / 2, 1], [0, th / 2]]), { axis: 'x', p: P3(x, -40 - R, R * .25), segs: 40, crease: 35 });
        if (K.detail(0)) for (const sx of [-1, 1]) K.mat('metal').lathe(mmP([[0, 0], [R * .5, 0, 1], [R * .5, 2, 1], [0, 3]]), { axis: sx > 0 ? 'x' : '-x', p: P3(x + sx * th / 2, -40 - R, R * .25), segs: 24 }); }
    });
    K.use('body'); return;
  }
  if (vk === 'coupler' && K.detail(1)) {   // a second magazine clamped beside the first
    K.at({ p: P3(0, top[1], top[0]), r: rot || [rake, 0, 0] }, () => { K.mat('furn').box(D(w * 2 + 6), D(10), D(d + 4), { p: P3(w / 2 + 2, -len * .55, 0), b: D(1.4) }); });
  }
  K.at({ p: P3(0, top[1], top[0]), r: rot || [rake, 0, 0] }, () => {
    const L = len + ext, n = K.lod ? 5 : 12, R = Math.abs(bend) > 1e-4 ? L / bend : 0;
    const C = sv => bend ? [R * (1 - Math.cos(bend * sv / L)), -R * Math.sin(bend * sv / L)] : [0, -sv];
    const N = sv => bend ? [Math.cos(bend * sv / L), -Math.sin(bend * sv / L)] : [1, 0];
    const edge = (sv, off) => { const c = C(sv), nn = N(sv); return [c[0] + nn[0] * off, c[1] + nn[1] * off]; };
    const fr = [], bk = []; for (let k = 0; k <= n; k++) { const sv = L * k / n; fr.push([...edge(sv, d / 2), 0]); bk.push([...edge(sv, -d / 2), 0]); }
    fr[n][2] = 2; bk[n][2] = 2;
    K.mat(mat).extrude(SH(K, [...fr, ...bk.reverse()], .8), D(w), { b: D(1), bs: 2 });
    if (ribs && K.detail(1)) { const rr2 = []; const rb = []; for (let k = 0; k <= n; k++) { const sv = 12 + (L - 34) * k / n; rr2.push([...edge(sv, d * .12), 0]); rb.push([...edge(sv, -d * .12), 0]); } rr2[0][2] = rr2[n][2] = rb[0][2] = rb[n][2] = 3; K.mat(mat).extrude(SH(K, [...rr2, ...rb.reverse()], .5), D(w + 1.4), { b: D(.6), bs: 2 }); }
    const bb = []; for (const sv of [L - 1.5, L + base]) { bb.push([...edge(sv, d / 2 + 1.4), sv > L ? 1.5 : 0]); } for (const sv of [L + base, L - 1.5]) bb.push([...edge(sv, -d / 2 - 1.4), sv > L ? 1.5 : 0]);
    K.mat(baseMat || mat).extrude(SH(K, [bb[0], bb[1], bb[2], bb[3]], .5), D(w + 2.6), { b: D(1), bs: 2 });
    K.mat(mat).box(D(w - 4), D(2), D(d * .7), { p: P3(0, .8, -d * .05), b: D(.5) });
    const cc = CAL[cal]; if (cc && !cc.shell) cartridge(K, cc, { p: P3(0, cc.d / 2 + .6, -d / 2 + 1.2), segs: 10 });
    if (cc && cc.shell) shell(K, { p: P3(0, 11, -d / 2 + 2), len: 66 });
    if (vk === 'coupler' && K.detail(1)) K.at({ p: P3(w + 4, -8, 0) }, () => K.mat(mat).extrude(SH(K, [...fr.slice(), ...bk.slice()].length ? [...fr.map(p => [p[0], p[1], 0]), ...bk.map(p => [p[0], p[1], 0])] : [], .8), D(w), { b: D(1), bs: 2 }));
  });
  K.use('body');
}
/** flip-up sight (part 'name', folds flat when an optic is mounted): kind 'rear' aperture or 'front' post with ears.
    Sits on a rail top at y (mm) centred at z; returns the sight point y */
function flipSight(K, name, { z, y, kind = 'rear', h = 12, mat = 'alu', dir = 1 }) {
  const fold = kind === 'rear' ? [-1.45, 0, 0] : [1.45, 0, 0];
  K.mat(mat).extrude(SH(K, [[-9, 0], [9, 0], [8, 5, 1], [-8, 5, 1]], .4), D(16), { p: P3(0, y, z), b: D(.6), bs: 1, plane: 'zy' });
  K.part(name, { pivot: P3(0, y + 5, z), meta: { iron: 'fold', foldR: fold } });
  if (kind === 'rear') {
    K.mat(mat).extrude(SH(K, [[-8, 0], [8, 0], [8, h - 2, 1.5], [5, h + 2, 2], [-5, h + 2, 2], [-8, h - 2, 1.5]], .5), D(4.5), { plane: 'xy', off: D(z - 2.2), p: P3(0, y + 4.5, 0), b: D(.5), bs: 1, holes: [csMM(circle(1.3, 12, 0, h - 2))] });
    for (const sx of [-1, 1]) K.mat(mat).box(D(2.5), D(5), D(6), { p: P3(sx * 7, y + 4.5 + h - 1, z), b: D(.5) });
  } else {
    K.mat(mat).extrude(SH(K, [[-9, 0], [9, 0], [9, h * .55, 2], [6.5, h + 1, 1.5], [3.4, h + 1, 1], [3.4, h * .5, 1.5], [-3.4, h * .5, 1.5], [-3.4, h + 1, 1], [-6.5, h + 1, 1.5], [-9, h * .55, 2]], .5), D(6), { plane: 'xy', off: D(z - 3), p: P3(0, y + 4.5, 0), b: D(.5), bs: 1 });
    K.mat('metal').extrude(SH(K, [[-1.4, 0], [1.4, 0], [1, h - 2.5, .3], [-1, h - 2.5, .3]], .3), D(2.4), { plane: 'xy', off: D(z - 1.2), p: P3(0, y + 4.5 + h * .45, 0), b: D(.25), bs: 1 });
  }
  K.use('body');
  return y + 4.5 + h - 2;
}
/** AR-style collapsible stock on a buffer tube: tube from z0 (receiver rear) back; part 'stock' collapses forward (k_folded) */
function bufferStock(K, { z0, y, len = 200, mat = 'furn', tube = 'alu', pad = 'rubber', w = 42, h = 95, slide = 75 }) {
  K.mat(tube).lathe(mmP([[0, z0 - len], [13, z0 - len, 1], [14.6, z0 - len + 2, 1], [14.6, z0 - 12], [17, z0 - 10], [17, z0 - 4], [15, z0], [0, z0]]), { p: P3(0, y, 0), segs: 26, crease: 35 });
  if (K.detail(0)) for (let k = 0; k < 6; k++) K.mat('bore').box(D(5), D(2), D(4), { p: P3(0, y - 14.4, z0 - len + 30 + k * 22), b: 0, ao: .5 });
  K.part('stock', { pivot: P3(0, y, z0 - len), meta: { fold: { p: [0, 0, D(slide)] } } });
  const zb = z0 - len - 25;
  const prof = [[zb, y + 22], [zb + 120, y + 18, 6], [zb + 128, y + 6, 4], [zb + 120, y - 22, 8], [zb + 60, y - 28, 10], [zb + 18, y - h + 25, 10], [zb, y - h + 22, 4]];
  K.mat(mat).extrude(SH(K, prof, 1), D(w - 4), { b: D(5), bs: K.lod ? 1 : 3, holes: K.detail(1) ? [SH(K, [[zb + 26, y - 30, 6], [zb + 62, y - 30, 6], [zb + 34, y - h + 32, 5]], .6)] : [] });
  K.mat(mat).lathe(mmP([[15.5, zb + 30], [21, zb + 34, 1], [21, zb + 112, 1], [16, zb + 120]]), { p: P3(0, y, 0), segs: 22 });
  K.mat(pad).extrude(SH(K, [[zb - 14, y + 26, 5], [zb + 2, y + 26], [zb + 2, y - h + 20], [zb - 14, y - h + 18, 6]], .6), D(w), { b: D(4), bs: K.lod ? 1 : 3 });
  K.use('body');
}
/** simple rivets in a row (mm points, both sides at +/-x) */
function rivets(K, pts, x, d = 3.6, mat = 'metal') { if (!K.detail(0)) return; for (const [z, y] of pts) for (const sx of [-1, 1]) K.rivet({ p: P3(sx * x, y, z), axis: sx > 0 ? 'x' : '-x', d: D(d), mat }); }

/** sling swivel: base stud + swivel loop (axis 'x' loop plane faces sideways), at p (mm) hanging along -Y */
function swivel(K, p, { mat = 'metal', w = 26, r = 2.2, down = true } = {}) {
  if (!K.detail(0)) return;
  const [x, y, z] = p, sg = down ? -1 : 1;
  K.mat(mat).lathe(mmP([[0, 0], [4.5, 0, 1], [4.5, 5, 1], [3, 6], [0, 6]]), { axis: down ? 'y' : 'y', p: P3(x, y + (down ? -6 : 0), z), segs: 14 });
  const pts = []; for (let k = 0; k <= 12; k++) { const a = Math.PI * k / 12; pts.push(P3(x - Math.cos(a) * w / 2, y + sg * (6 + Math.sin(a) * 10), z)); }
  K.mat(mat).sweep(pts, { rad: D(r), segs: 8 });
}
/** QD sling socket: round boss with a hole facing x */
function qdSocket(K, p, side = 1, mat = 'metal') { if (!K.detail(0)) return; K.at({ p: P3(...p) }, () => K.mat(mat).extrude(csMM(circle(5.5, K.seg(18))), D(4), { plane: 'zy', off: side > 0 ? 0 : -D(4), b: D(.8), bs: 2, recess: [{ pts: csMM(circle(2.4, 12)), d: D(3), side, ao: .3 }] })); }

// ---- SMGs ----------------------------------------------------------------------------------------------------------
BUILDERS.smgRoller = (K, S, gun, ctx) => {
  const yB = 36, yT = 49, top = 62, zR = -98;
  // receiver: round-top stamped body with side beads, ejection port (right), claw rail
  const rcs = slideCS(34, top - 12, 0, { round: 1, r: 17 });
  cs(K, rcs, zR, 74, 12, { bb: 1.4, bf: 1, mat: 'rcv' });
  for (const yy of [24, 42]) for (const sx of [-1, 1]) K.mat('rcv').extrude(SH(K, [[zR + 10, -1.2, 1.2], [70, -1.2, 1.2], [70, 1.2, 1.2], [zR + 10, 1.2, 1.2]], .4), D(1.6), { p: P3(sx * 17.2, yy, 0), b: D(.5), bs: 1 });
  K.mat('bore').box(D(1), D(14), D(36), { p: P3(16.9, 44, 12), b: 0, ao: .5 }); K.mat('bright').box(D(1.2), D(10), D(30), { p: P3(16.2, 44, 12), b: D(.3) });
  K.rail(D(96), { p: P3(0, top - 1.4, -60) });
  // cocking tube, barrel (3 lugs), front sight tower with ring hood
  K.mat('rcv').lathe(mmP([[0, 60], [12.6, 60], [12.6, 236, 1], [11.6, 238, 1], [0, 238]]), { p: P3(0, yT, 0), segs: 28 });
  K.mat('barrel').lathe(mmP([[4.6, 60], [9, 60], [9, 120], [8, 128], [7.6, 252], [8.4, 254, 1], [8.4, 264, 1], [7.6, 266, 1], [4.6, 266], [4.6, 258]]), { p: P3(0, yB, 0), segs: 26, crease: 30 });
  K.mat('bore').lathe([[D(4.6), D(265)], [D(4.6), D(240)]], { p: P3(0, yB, 0), segs: 12 });
  for (let k = 0; k < 3; k++) { const a = HALF + k * TAU / 3; K.mat('barrel').box(D(4), D(3), D(10), { p: P3(Math.cos(a) * 9.5, yB + Math.sin(a) * 9.5, 248), r: [0, 0, a - HALF], b: D(.6) }); }
  K.mat('rcv').extrude(SH(K, [[218, yB - 6], [236, yB - 6, 2], [238, yT + 8, 2], [233, yT + 16, 3], [222, yT + 16, 3], [218, yT + 6]], .6), D(14), { b: D(1.8), bs: 2 });
  const sLine = top + 9 + 1.2;
  K.mat('rcv').tube(D(10), D(8.3), D(12), { p: P3(0, sLine - 1, 223), segs: 26 });
  K.mat('metal').extrude(SH(K, [[-1.2, 0], [1.2, 0], [1, 10, .3], [-1, 10, .3]], .3), D(2.4), { plane: 'xy', off: D(228), p: P3(0, sLine - 10, 0), b: D(.2), bs: 1 });
  K.mat('rcv').box(D(6), D(sLine - yT - 18), D(12), { p: P3(0, yT + 12 + (sLine - yT - 18) / 2 + 2, 229), b: D(1) });
  // handguard: ribbed polymer U around the barrel
  const hg = [[-21, 55], [-21, 26, 9], [0, 19], [21, 26, 9], [21, 55], [15.5, 55], [15.5, 29, 5], [-15.5, 29, 5], [-15.5, 55]];
  const hgIn = hg.map(p => [Math.sign(p[0]) * Math.max(0, Math.abs(p[0]) - (Math.abs(p[0]) > 16 ? 1.3 : 0)), p[1] + (p[1] < 22 ? 1.3 : 0), p[2]]);
  const hcs = csMM2(SH(K, hg, .6)), hcsIn = csMM2(SH(K, hgIn, .6));
  let z = 74; cs(K, hcs, z, z + 10, 0, { bb: 2, mat: 'furn' }); z += 10;
  for (let k = 0; k < (K.detail(0) ? 9 : 0); k++) { cs(K, hcsIn, z, z + 5, 0, { mat: 'furn' }); cs(K, hcs, z + 5, z + 12, 0, { mat: 'furn' }); z += 12; }
  cs(K, hcs, z, 212, 0, { bf: 2.5, mat: 'furn' });
  // trigger housing + guard + grip + selector + mag well + paddle
  K.mat('furn').extrude(SH(K, [[-78, 12.5], [26, 12.5], [26, 2, 3], [-14, 0], [-30, -6, 4], [-60, -6, 4], [-78, 6, 4]], .8), D(30), { b: D(2.4), bs: 3 });
  guardLoop(K, [[-26, 0], [36, 0], [37, -14, 6], [30, -34, 8], [-12, -36, 8], [-26, -20, 5]], [[-16, -3, 2], [30, -3, 2], [30.5, -12, 5], [24, -29, 6], [-8, -30.5, 6], [-17, -18, 4]], 12, 2.6, 'furn');
  triggerPart(K, [0, 4, 3], { face: 'curved', len: 20, w: 7, mat: 'metal' });
  const hr = longGrip(K, { z: -38, y: -3, ang: .32, len: 96, w: 31, f: 16, b: 22, mat: 'grip', grooves: true, hump: 1.6 });
  K.mat('metal').cyl(D(7), D(2.2), { p: P3(-15.6, 4, -40), axis: '-x', segs: 20, ch: D(.6) });
  K.mat('metal').extrude(SH(K, [[-2.5, 0], [2.5, 0], [1.6, 12, 1.4], [-1.6, 12, 1.4]], .4), D(2), { p: P3(-17.4, 4, -40), r: [-.9, 0, 0], b: D(.4), bs: 1 });
  K.mat('rcv').extrude(SH(K, [[18, 12.5], [62, 12.5], [61, -6, 2.5], [21, -6, 2.5]], .6), D(29), { b: D(2), bs: 2 });
  K.mat('metal').extrude(SH(K, [[10, -2], [18, -2], [18, -10, 2], [8, -10, 2]], .4), D(16), { b: D(1), bs: 1 });
  rivets(K, [[-60, 30], [-40, 30], [30, 30], [50, 30], [-60, 18], [50, 18]], 17.3, 3);
  const mx = ctx.intr.mag; boxMag(K, { variant: mx, top: [40, 6], len: 196, d: 33, w: 23.5, bend: .42, rake: .04, mat: 'mag', cal: '9', ext: mx && mx.model.ext ? mx.model.ext * 1000 : 0 });
  // drum rear sight
  K.mat('rcv').box(D(20), D(8), D(20), { p: P3(0, top + 2, zR + 14), b: D(1.2) });
  K.mat('metal').lathe(mmP([[0, -11], [9, -11, 1], [9.5, -10], [9.5, 10], [9, 11, 1], [0, 11]]), { axis: 'x', p: P3(0, sLine - 1, zR + 14), segs: 18 });
  K.mat('bore').cyl(D(1.4), D(20), { p: P3(0, sLine - 1, zR + 4), segs: 10 });
  // stock: two struts + buttplate (collapses forward)
  K.part('stock', { pivot: P3(0, 40, zR), meta: { fold: { p: [0, 0, D(190)] } } });
  for (const sx of [-1, 1]) K.mat('metal').cyl(D(4.6), D(222), { p: P3(sx * 13, 40, zR - 220), segs: 14, ch: D(.6) });
  K.mat('rcv').box(D(40), D(16), D(14), { p: P3(0, 40, zR - 215), b: D(3) });
  K.mat('rubber').extrude(SH(K, [[zR - 240, 82, 8], [zR - 222, 82, 4], [zR - 222, 6, 4], [zR - 240, 2, 8]], .8), D(44), { b: D(4), bs: K.lod ? 1 : 3 });
  K.use('body');
  K.part('charging', { pivot: P3(-12, yT, 205) });
  K.mat('metal').extrude(SH(K, [[-8, -3], [26, -3, 2], [26, 3, 2], [-8, 3, 2]], .4), D(5), { p: P3(-14, yT + 2, 205), b: D(.8), bs: 2 });
  K.mat('metal').cyl(D(3.8), D(10), { p: P3(-20, yT + 2, 226), axis: '-x', segs: 14 });
  K.use('body');
  sockets(K, { optic: [[0, top + 7.6, -12]], muzzle: [[0, yB, 254]], under: [[0, 19, 150]], side: [[21, 40, 150]], mag: [[0, 6, 40], null, [.04, 0, 0]], stock: [[0, 40, zR]], barrel: [[0, yB, 74]] });
  muzzleNode(K, yB, 266.2); ejectNode(K, [17, 44, 12]);
  handNodes(K, hr, { p: [0, 30, 150], kind: 'hold' });
  sightMeta(K, [0, sLine, 229], [0, sLine, zR + 14], 75);
};

BUILDERS.pdw = (K, S, gun, ctx) => {
  const yB = 38, top = 58, zR = -96;
  K.mat('rcv').extrude(SH(K, [[zR, 20, 3], [zR, top, 3], [92, top, 3], [96, 52, -3], [96, 24, 5], [68, 18, 5], [24, 16], [-28, 16], [-44, 10, 3], [-80, 10, 4]], .8), D(34), { b: D(3), bs: 1 });
  K.mat('rcv').extrude(SH(K, [[zR + 4, 22], [90, 22], [90, top - 4], [zR + 4, top - 4]], .6), D(36), { b: D(1.4), bs: 1 });
  K.rail(D(176), { p: P3(0, top, -88) });
  for (const sx of [-1, 1]) K.rail(D(48), { p: P3(sx * 18, 36, 34), r: [0, 0, -sx * HALF] });
  K.mat('bore').box(D(1), D(12), D(30), { p: P3(18.2, 42, -18), b: 0, ao: .5 });
  K.mat('barrel').lathe(mmP([[4, 90], [7.6, 90], [7.6, 129], [4, 129]]), { p: P3(0, yB, 0), segs: 24 });
  K.part('muzzleDev', { pivot: P3(0, yB, 128), meta: { replace: 'muzzle' } }); K.mat('barrel').lathe(mmP([[4, 128], [9, 128, 1], [9, 156, 1], [8, 158, 1], [4, 158]]), { p: P3(0, yB, 0), segs: 24 });
  if (K.detail(0)) for (let k = 0; k < 4; k++) { const a = k * TAU / 4 + .4; K.mat('bore').box(D(2.2), D(1.5), D(14), { p: P3(Math.cos(a) * 8.6, yB + Math.sin(a) * 8.6, 148), r: [0, 0, a - HALF], b: 0, ao: .5 }); }
  K.mat('bore').cyl(D(4), D(1), { p: P3(0, yB, 157.4), segs: 12 }); K.use('body');
  const hr = longGrip(K, { z: -16, y: 14, ang: .14, len: 104, w: 32, f: 19, b: 20, mat: 'grip', flare: 2 });
  guardLoop(K, [[-4, 16], [38, 16], [38, 2, 6], [30, -14, 6], [6, -18, 6], [-6, -8, 4]], [[2, 12], [32, 12, 2], [32, 2, 4], [26, -10, 4], [8, -13, 4], [2, -4, 2]], 11, 2.2, 'rcv');
  triggerPart(K, [0, 13, 3], { face: 'curved', len: 19, w: 7 });
  const mx = ctx.intr.mag; boxMag(K, { variant: mx, top: [-12, 12], len: 236, d: 26, w: 18.5, rake: .14, mat: 'mag', cal: 'pdw47', base: 5, ext: mx && mx.model.ext ? mx.model.ext * 1000 : 0 });
  K.part('foregrip', { pivot: P3(0, 16, 58), meta: { fold: { r: [-1.45, 0, 0] }, replace: 'under' } });
  K.mat('grip').loft3([0, 1].map(k => ovalPts(26, 13, 9, 9, K.lod ? 2 : 4).map(([sv, x]) => [D(x), D(16 - k * 82), D(45 + sv - (k ? 6 : 0)), 0])), { crease: 50 });
  K.mat('rcv').box(D(22), D(10), D(30), { p: P3(0, 13, 58), b: D(2) });
  K.use('body');
  K.part('stock', { pivot: P3(0, 40, zR), meta: { fold: { p: [0, 0, D(160)] } } });
  for (const sx of [-1, 1]) K.mat('metal').cyl(D(3.6), D(186), { p: P3(sx * 13, 44, zR - 184), segs: 12, ch: D(.5) });
  K.mat('rcv').extrude(SH(K, [[zR - 200, 76, 6], [zR - 186, 76, 4], [zR - 186, 6, 4], [zR - 200, 0, 6]], .8), D(42), { b: D(3), bs: 1 });
  K.mat('rubber').extrude(SH(K, [[zR - 206, 74, 4], [zR - 199, 74], [zR - 199, 2], [zR - 206, 4, 4]], .6), D(40), { b: D(2.4), bs: 2 });
  K.use('body');
  K.part('charging', { pivot: P3(0, top - 6, zR) });
  K.mat('rcv').extrude(SH(K, [[-22, -4, 3], [22, -4, 3], [22, 4, 3], [5, 4], [5, 30], [-5, 30], [-5, 4], [-22, 4, 3]].map(p => [p[0], p[1], p[2]]), .5), D(7), { plane: 'xz', off: D(top - 9), p: P3(0, 0, zR - 6), b: D(1.2), bs: 2 });
  K.use('body');
  const sY = flipSight(K, 'sightRear', { z: -78, y: top + 9, kind: 'rear', h: 11 });
  flipSight(K, 'sightFront', { z: 80, y: top + 9, kind: 'front', h: 13.5 });
  sockets(K, { optic: [[0, top + 9, -10]], muzzle: [[0, yB, 128]], under: [[0, 16, 84]], side: [[27, 36, 58]], mag: [[0, 12, -12], null, [.14, 0, 0]], stock: [[0, 40, zR]], barrel: [[0, yB, 90]] });
  muzzleNode(K, yB, 158.2); ejectNode(K, [18, 42, -18]);
  handNodes(K, hr, { p: [0, -22, 52], kind: 'grip', part: 'foregrip' });
  sightMeta(K, [0, sY, 80], [0, sY, -78], 70);
};

BUILDERS.smgClassic = (K, S, gun, ctx) => {
  const yB = 31, top = 52, zR = -112;
  const rcs = slideCS(32, top - 8, 0, { round: 1, r: 16 });
  cs(K, rcs, zR, 62, 8, { bb: 2, bf: 1.5, mat: 'rcv' });
  K.mat('bore').box(D(6), D(1.6), D(84), { p: P3(0, top - .6, -6), b: 0, ao: .5 });
  K.mat('bore').box(D(1), D(14), D(42), { p: P3(15.9, 38, 10), b: 0, ao: .5 }); K.mat('bright').box(D(1.2), D(10), D(36), { p: P3(15.3, 38, 10), b: D(.3) });
  K.part('charging', { pivot: P3(0, top, 26) });
  K.mat('metal').lathe(mmP([[0, -5], [7, -5, 1], [8, -3], [8, 3], [7, 5, 1], [0, 5]]), { axis: 'y', p: P3(0, top + 9, 26), segs: 18 });
  K.mat('metal').cyl(D(2.6), D(10), { p: P3(0, top, 26), axis: 'y', segs: 10 });
  K.use('body');
  // finned barrel + plain barrel + ported compensator
  const fins = [[5.6, 62], [10, 62]]; const nF = K.detail(0) ? 26 : 0;
  for (let k = 0; k < nF; k++) { const z0 = 70 + k * 5.6; fins.push([10, z0], [15, z0 + .8, 1], [15, z0 + 2.2, 1], [10, z0 + 3]); }
  fins.push([10, 216], [8.6, 222], [8.2, 318], [5.6, 318]);
  K.mat('barrel').lathe(mmP(fins), { p: P3(0, yB, 0), segs: 26, crease: 30 });
  K.part('muzzleDev', { pivot: P3(0, yB, 316), meta: { replace: 'muzzle' } }); K.mat('barrel').lathe(mmP([[5, 316], [11, 316, 1], [12, 318, 1], [12, 356, 1], [11, 358, 1], [5.4, 358], [5.4, 350]]), { p: P3(0, yB, 0), segs: 26 });
  if (K.detail(0)) for (let k = 0; k < 4; k++) K.mat('bore').box(D(2.2), D(3), D(4), { p: P3(0, yB + 11.4, 326 + k * 7.5), b: 0, ao: .4 });
  K.mat('bore').cyl(D(5.4), D(1), { p: P3(0, yB, 357.3), segs: 14 }); K.use('body');
  const sLine = top + 13;
  K.mat('metal').extrude(SH(K, [[-6, 0], [6, 0], [4, sLine - yB - 12, .4], [-3, sLine - yB - 12, .6]], .4), D(2.6), { p: P3(0, yB + 11.6, 344), b: D(.3), bs: 1 });
  // rear peep sight with ears
  K.mat('rcv').extrude(SH(K, [[-10, 0], [10, 0], [9, 10, 1], [6, 16, 2], [3, 16], [3, 11], [-3, 11], [-3, 16], [-6, 16, 2], [-9, 10, 1]], .4), D(5), { plane: 'xy', off: D(zR + 12), p: P3(0, top - .4, 0), b: D(.5), bs: 1, holes: [csMM(circle(1.4, 12, 0, sLine - top + .4))] });
  // lower frame + guard + wood grip + selectors + mag well
  K.mat('rcv').extrude(SH(K, [[-104, 9], [46, 9], [46, -8, 3], [16, -10], [-24, -6], [-66, -6, 4], [-104, 2, 4]], .8), D(28), { b: D(2.2), bs: 2 });
  guardLoop(K, [[-24, -4], [24, -4], [26, -18, 8], [16, -32, 10], [-10, -32, 8], [-24, -18, 5]], [[-15, -7], [18, -7, 2], [19, -17, 6], [12, -27, 7], [-7, -27, 6], [-16, -17, 4]], 9, 2.2);
  triggerPart(K, [0, 2, 2], { face: 'curved', len: 18, w: 7 });
  const hr = longGrip(K, { z: -46, y: -5, ang: .38, len: 96, w: 30, f: 14, b: 20, mat: 'wood', grooves: true, hump: 1.4 });
  for (const [zz, ang] of [[-62, .6], [-36, -.4]]) { K.mat('metal').cyl(D(5.5), D(2), { p: P3(-14.8, 2, zz), axis: '-x', segs: 16 }); K.mat('metal').extrude(SH(K, [[-2, 0], [2, 0], [1.4, 10, 1.2], [-1.4, 10, 1.2]], .3), D(1.8), { p: P3(-16.2, 2, zz), r: [ang, 0, 0], b: D(.4), bs: 1 }); }
  const mx = ctx.intr.mag; boxMag(K, { variant: mx, top: [33, 4], len: 214, d: 38, w: 25, mat: 'mag', cal: '45', ext: mx && mx.model.ext ? mx.model.ext * 1000 : 0 });
  // wood foregrip with finger grooves on a barrel bracket
  K.mat('rcv').extrude(SH(K, [[120, yB - 2], [168, yB - 2], [166, yB - 15, 3], [122, yB - 15, 3]], .6), D(20), { b: D(1.6), bs: 2 });
  K.mat('rcv').lathe(mmP([[10.2, 128], [14, 128, 1], [14, 160, 1], [10.2, 160]]), { p: P3(0, yB, 0), segs: 24 });
  K.part('woodGrip', { pivot: P3(0, yB - 13, 144), meta: { replace: 'under' } });
  const fg = longGrip(K, { z: 144, y: yB - 13, ang: -.12, len: 98, w: 32, f: 17, b: 17, mat: 'wood', grooves: true, tTop: 0 });
  K.use('body');
  // wooden buttstock (lofted) with steel butt plate + sling swivel
  const stockRows = [];
  for (let k = 0; k <= (K.lod ? 4 : 9); k++) {
    const t = k / (K.lod ? 4 : 9), z = zR - 2 - t * 300, yT2 = 46 + t * 14, yBt = 14 - t * 70, hw = 14 + t * 6;
    stockRows.push(ovalPts(yT2 - yBt, hw, hw * .6, hw * .8, K.lod ? 2 : 3).map(([sv, x]) => [D(x), D(yBt + sv), D(z), 0]));
  }
  K.mat('wood').loft3(stockRows, { crease: 50, uvSwap: true });
  K.mat('rcv').extrude(SH(K, [[zR - 305, 64, 4], [zR - 300, 64], [zR - 300, -60], [zR - 306, -60, 4]], .5), D(41), { b: D(2), bs: 2 });
  K.mat('metal').lathe(mmP([[2, -6], [8, -6], [8, 6], [2, 6], [2, -6]]), { axis: 'x', p: P3(0, -40, zR - 210), segs: 14 });
  sockets(K, { muzzle: [[0, yB, 318]], under: [[0, yB - 15, 144]], side: [[16, yB, 250]], mag: [[0, 4, 33]], barrel: [[0, yB, 62]] });
  muzzleNode(K, yB, 358.2); ejectNode(K, [16, 38, 10]);
  handNodes(K, hr, { p: fg.p, ang: fg.ang, kind: 'grip' });
  sightMeta(K, [0, sLine, 344], [0, sLine, zR + 14], 80);
};

BUILDERS.pdwBullpup = (K, S, gun, ctx) => {
  // one-piece angular shell with thumbhole + front finger loop, translucent magazine on top, raised sight mount, down ejection
  const yB = 40, top = 62;
  const outer = [[-266, top - 2, 6], [-272, 8, 10], [-258, -66, 12], [-208, -80, 12], [-130, -74, 16], [-70, -76, 12], [-8, -76, 10], [60, -70, 14], [118, -44, 16], [158, 2, 12], [192, 30, 10], [194, 52, 6], [160, top, 6]];
  const thumb = [[-168, -58, 12], [-62, -60, 12], [-50, -18, 10], [-66, 16, 10], [-150, 18, 12], [-178, -20, 10]];
  const loop = [[-6, -55, 9], [72, -54, 12], [96, -26, 10], [62, 6, 8], [-4, 6, 6]];
  K.mat('frame').extrude(SH(K, outer, 1.2), D(54), { b: D(5.5), bs: 1, holes: [SH(K, thumb, .8), SH(K, loop, .8)] });
  // side panels (texture), front cap, barrel + flash hider
  for (const sx of [-1, 1]) K.mat('grip').extrude(SH(K, [[-90, -54, 6], [-40, -60, 6], [-28, -20, 6], [-44, 14, 6]], .5), D(1.4), { off: sx > 0 ? D(25) : D(-26.4), b: D(.5), bs: 1 });
  K.mat('rcv').lathe(mmP([[0, 180], [15, 180], [15, 194, 1], [12, 200, 1], [0, 200]]), { p: P3(0, yB, 0), segs: 26 });
  K.mat('barrel').lathe(mmP([[4, 198], [7.2, 198], [7.2, 227], [4, 227]]), { p: P3(0, yB, 0), segs: 22 });
  K.part('muzzleDev', { pivot: P3(0, yB, 226), meta: { replace: 'muzzle' } }); K.mat('barrel').lathe(mmP([[4, 226], [9, 226, 1], [9, 256, 1], [8, 258, 1], [4, 258]]), { p: P3(0, yB, 0), segs: 22 });
  if (K.detail(0)) for (let k = 0; k < 5; k++) { const a = k * TAU / 5; K.mat('bore').box(D(2), D(1.4), D(18), { p: P3(Math.cos(a) * 8.6, yB + Math.sin(a) * 8.6, 244), r: [0, 0, a - HALF], b: 0, ao: .5 }); }
  K.mat('bore').cyl(D(4), D(1), { p: P3(0, yB, 257.4), segs: 12 }); K.use('body');
  // translucent magazine on top with two rows of rounds lying across the bore
  K.part('mag', { pivot: P3(0, top, -40) });
  const mz0 = -214, mz1 = 112;
  K.mat('trans').extrude(SH(K, [[mz0, top, 4], [mz1, top, 3], [mz1 + 6, top + 12, 4], [mz1, top + 25, 4], [mz0 + 10, top + 25, 6], [mz0, top + 18, 5]], .8), D(54), { b: D(2.6), bs: 2 });
  K.mat('rcv').extrude(SH(K, [[mz0 - 4, top + 2, 2], [mz0 + 26, top + 2], [mz0 + 26, top + 22, 2], [mz0 - 2, top + 22, 4]], .5), D(56), { b: D(1.2), bs: 2 });
  if (K.detail(0)) for (let row = 0; row < 2; row++) for (let k = 0; k < 18; k++) { const z = mz0 + 34 + k * 9.4 + row * 4.7, y = top + 7 + row * 9; K.mat('brass').cyl(D(3.9), D(22), { p: P3(-15, y, z), axis: 'x', segs: 8 }); K.mat('copper').lathe(mmP([[2.8, 0], [2.8, 4], [0, 10]]), { axis: 'x', p: P3(7, y, z), segs: 8 }); }
  K.use('body');
  // raised sight mount over the magazine front with a rail and integral low irons
  K.mat('frame').extrude(SH(K, [[112, top], [194, top - 6, 4], [190, top + 36, 4], [96, top + 38, 3], [86, top + 30, 3], [100, top + 26]], .8), D(30), { b: D(3), bs: 1 });
  K.mat('frame').extrude(SH(K, [[-6, top + 24], [104, top + 26], [104, top + 38, 2], [-2, top + 38, 2]], .5), D(26), { b: D(2.4), bs: 1 });
  K.rail(D(104), { p: P3(0, top + 37.6, -2) });
  const sLine = top + 37.6 + 9 + 3.4;
  K.mat('frame').extrude(SH(K, [[-8, 0], [8, 0], [8, 5, 1], [2, 5], [2, 2.8], [-2, 2.8], [-2, 5], [-8, 5, 1]], .3), D(5), { plane: 'xy', off: D(2), p: P3(0, sLine - 2.8, 0), b: D(.4), bs: 1 });
  K.mat('frame').extrude(SH(K, [[-6, 0], [-1, 0], [-1, 5], [1, 5], [1, 0], [6, 0], [6, 6, 1], [-6, 6, 1]], .3), D(5), { plane: 'xy', off: D(98), p: P3(0, sLine - 5, 0), b: D(.4), bs: 1 });
  // charging knobs both sides, trigger, selector disc under the trigger
  for (const sx of [-1, 1]) { K.mat('metal').cyl(D(5), D(8), { p: P3(sx * 27, yB - 6, 150), axis: sx > 0 ? 'x' : '-x', segs: 14, ch: D(1) }); K.mat('bore').box(D(1), D(5), D(46), { p: P3(sx * 27, yB - 6, 136), b: 0, ao: .5 }); }
  triggerPart(K, [0, 4, 6], { face: 'curved', len: 22, w: 8, mat: 'frame' });
  K.mat('metal').cyl(D(8), D(3), { p: P3(0, -2, 26), axis: 'y', segs: 18 });
  for (const sx of [-1, 1]) { qdSocket(K, [sx * 27, -40, -250], sx); qdSocket(K, [sx * 27, 20, 170], sx); }
  if (K.detail(0)) for (const sx of [-1, 1]) for (const [z0, z1, y] of [[-250, -190, 30], [-120, 60, 40], [120, 180, -10]]) K.mat('bore').box(D(.8), D(1.2), D(z1 - z0), { p: P3(sx * 27.1, y, (z0 + z1) / 2), b: 0, ao: .5 });
  sockets(K, { optic: [[0, top + 46.6, 50]], muzzle: [[0, yB, 226]], side: [[27, 40, 50]], mag: [[0, top, -40]], barrel: [[0, yB, 180]] });
  muzzleNode(K, yB, 258.2); ejectNode(K, [0, -78, -150], 'down');
  handNodes(K, { p: [0, -32, -30], ang: .1 }, { p: [0, -60, 70], kind: 'hold', r: [Math.PI * .1, 0, 0] });
  sightMeta(K, [0, sLine, 100], [0, sLine, 4], 70);
};

BUILDERS.smgOffset = (K, S, gun, ctx) => {
  // tall angular receiver, low bore, magazine well ahead of the trigger, side-folding skeleton stock
  const yB = 28, top = 80, zR = -78;
  K.mat('rcv').extrude(SH(K, [[zR, top, -3], [150, top, -3], [158, 66, -4], [158, 42, -4], [146, 14, -4], [96, 10, -3], [52, 6], [52, 0], [-26, 0], [zR, 12, -4]], .8), D(38), { b: D(3), bs: 1 });
  for (const sx of [-1, 1]) K.mat('rcv').extrude(SH(K, [[-50, 30, -2], [120, 30, -2], [120, 66, -2], [-50, 66, -2]], .5), D(1.2), { off: sx > 0 ? D(19) : D(-20.2), b: D(.4), bs: 1 });
  K.mat('bore').box(D(1), D(12), D(30), { p: P3(19.3, 48, 0), b: 0, ao: .5 });
  K.rail(D(222), { p: P3(0, top, -70) });
  K.rail(D(46), { p: P3(0, 10, 145), r: [0, 0, Math.PI] });
  K.mat('barrel').lathe(mmP([[4, 150], [7.6, 150], [7.6, 196, 1], [6.2, 198], [6.2, 214], [4, 214]]), { p: P3(0, yB, 0), segs: 22 });
  if (K.detail(0)) for (let k = 0; k < 7; k++) K.mat('dark').lathe(mmP([[6.25, 199 + k * 2], [6.5, 199.6 + k * 2], [6.25, 200.2 + k * 2]]), { p: P3(0, yB, 0), segs: 22 });
  K.mat('bore').cyl(D(4), D(1), { p: P3(0, yB, 213.4), segs: 12 });
  // magazine well + guard + grip
  K.mat('rcv').extrude(SH(K, [[52, 8], [96, 8], [94, -36, -2], [54, -36, -2]], .6), D(32), { b: D(2.2), bs: 1 });
  guardLoop(K, [[-26, 1], [54, 1], [54, -12, 3], [44, -26, 6], [-6, -28, 8], [-22, -16, 5]], [[-16, -3], [46, -3, 2], [46, -10, 3], [38, -21, 5], [-4, -22.5, 6], [-15, -13, 4]], 10, 2, 'rcv');
  triggerPart(K, [0, 2, 3], { face: 'flat', len: 18, w: 7 });
  const hr = longGrip(K, { z: -38, y: 1, ang: .3, len: 96, w: 31, f: 16, b: 21, mat: 'grip', hump: 1.4 });
  const mx = ctx.intr.mag; boxMag(K, { variant: mx, top: [74, 4], len: 176, d: 33, w: 24, mat: 'mag', cal: '45', base: 6, baseMat: 'frame', ext: mx && mx.model.ext ? mx.model.ext * 1000 : 0 });
  // charging handle (left, folding), selector
  K.part('charging', { pivot: P3(-19, 60, 116) });
  K.mat('metal').extrude(SH(K, [[-3, -2], [20, -2, 2], [24, 4, 2], [-3, 4, 2]], .4), D(5), { p: P3(-22, 60, 116), r: [0, 0, 0], b: D(.8), bs: 2 });
  K.use('body');
  for (const sx of [-1, 1]) K.mat('metal').extrude(SH(K, [[-3, -2], [3, -2], [2, 9, 1.4], [-2, 9, 1.4]], .3), D(2), { p: P3(sx * 20.4, 6, -46), r: [-.8, 0, 0], b: D(.4), bs: 1 });
  // side-folding skeleton stock (part)
  K.part('stock', { pivot: P3(0, 56, zR), meta: { fold: { r: [0, -2.95, 0], p: [D(-24), 0, 0] } } });
  K.mat('rcv').box(D(26), D(30), D(14), { p: P3(0, 56, zR - 6), b: D(2) });
  K.mat('frame').extrude(SH(K, [[zR - 8, 70], [zR - 250, 76, 6], [zR - 266, 64, 6], [zR - 266, -26, 8], [zR - 242, -36, 6], [zR - 220, 4, 10], [zR - 40, 40, 8], [zR - 8, 40]], 1), D(22), { b: D(2.6), bs: 1, holes: [SH(K, [[zR - 210, 56, 8], [zR - 60, 60, 6], [zR - 50, 50, 5], [zR - 212, 18, 8]], .8)] });
  K.mat('rubber').extrude(SH(K, [[zR - 278, 78, 6], [zR - 264, 78], [zR - 264, -38], [zR - 278, -38, 6]], .6), D(34), { b: D(3), bs: 2 });
  K.use('body');
  const sY = flipSight(K, 'sightRear', { z: -60, y: top + 9, kind: 'rear', h: 11 });
  flipSight(K, 'sightFront', { z: 136, y: top + 9, kind: 'front', h: 13.5 });
  sockets(K, { optic: [[0, top + 9, 10]], muzzle: [[0, yB, 196]], under: [[0, 1, 168]], side: [[19, 46, 90]], mag: [[0, 4, 74]], stock: [[0, 56, zR]], barrel: [[0, yB, 150]] });
  muzzleNode(K, yB, 214.2); ejectNode(K, [19, 48, 0]);
  handNodes(K, hr, { p: [0, -14, 74], kind: 'hold' });
  sightMeta(K, [0, sY, 136], [0, sY, -60], 70);
};

BUILDERS.smgStamped = (K, S, gun, ctx) => {
  // stamped tube receiver, side magazine (left), perforated barrel shroud, wire stock, L-slot cocking knob (right)
  const yB = 34, r = 18.5, zR = -172, zS = 56, zE = 206;
  K.mat('stamp').lathe(mmP([[0, zR - 6], [12, zR - 6, 1], [13, zR - 4], [13, zR], [r - 1, zR, 1], [r, zR + 1, 1], [r, zS], [0, zS]]), { p: P3(0, yB, 0), segs: 30, crease: 35 });
  K.mat('stamp').lathe(mmP([[r - 3.5, zS - 2], [r + 1, zS - 2, 1], [r + 1, zS + 6, 1], [r - 3.5, zS + 6]]), { p: P3(0, yB, 0), segs: 30 });
  // shroud: ring bands + bars (slot windows)
  const bands = []; for (let z = zS + 6; z < zE - 4; z += 26) bands.push(z);
  for (const z of bands) K.mat('stamp').tube(D(r), D(r - 1.4), D(5), { p: P3(0, yB, z), segs: 30 });
  K.mat('metal').tube(D(r + 1.4), D(r - .2), D(30), { p: P3(0, yB, 135), segs: 30 });   // accessory clamp ring
  const nb = K.detail(1) ? 8 : 4;
  for (let k = 0; k < nb; k++) { const a = (k + .5) * TAU / nb; K.mat('stamp').box(D(5.2), D(1.4), D(zE - zS - 6), { p: P3(Math.cos(a) * (r - .7), yB + Math.sin(a) * (r - .7), (zS + zE) / 2), r: [0, 0, a - HALF], b: D(.3), bs: 1 }); }
  K.mat('stamp').lathe(mmP([[8, zE - 4], [r, zE - 4, 1], [r, zE + 2, 1], [11, zE + 6, 1], [8, zE + 6]]), { p: P3(0, yB, 0), segs: 30 });
  K.mat('barrel').lathe(mmP([[4.6, zS], [8, zS], [8, zE + 18, 1], [7.4, zE + 20, 1], [4.6, zE + 20], [4.6, zE + 14]]), { p: P3(0, yB, 0), segs: 20 });
  K.mat('bore').cyl(D(4.6), D(1), { p: P3(0, yB, zE + 19.4), segs: 12 });
  rivets(K, [[-150, yB - 8], [-60, yB - 8], [30, yB - 8], [-150, yB + 8], [30, yB + 8]], r - .2, 3.2, 'stamp');
  // side magazine housing (left) + magazine sticking out to the left
  K.mat('stamp').extrude(SH(K, [[-6, -14], [44, -14], [44, 14], [-6, 14]].map(q => [q[0], q[1], 2]), .5), D(34), { off: -D(r + 30), p: P3(0, yB, 0), b: D(1.2), bs: 2 });
  const mx = ctx.intr.mag;
  boxMag(K, { variant: mx, top: [19, yB], len: 186 + 8, d: 33, w: 23.5, mat: 'mag', cal: '9', rot: [0, 0, -HALF], ext: mx && mx.model.ext ? mx.model.ext * 1000 : 0 });
  K.use('body');
  // trigger housing + guard + cheap polymer grip
  K.mat('stamp').extrude(SH(K, [[-150, yB - r + 2], [-34, yB - r + 2], [-34, 2, 3], [-58, -4], [-130, -4, 3], [-150, 4, 3]], .6), D(26), { b: D(1.6), bs: 2 });
  guardLoop(K, [[-30, 2], [24, 2], [24, -12, 4], [14, -26, 6], [-14, -26, 6], [-30, -12, 4]], [[-20, -2], [16, -2, 2], [16, -10, 3], [10, -20, 4], [-10, -20, 4], [-21, -10, 3]], 7, 1.6, 'stamp');
  triggerPart(K, [0, 4, 2], { face: 'straight', len: 19, w: 6, mat: 'stamp' });
  const hr = longGrip(K, { z: -76, y: -2, ang: .26, len: 92, w: 30, f: 15, b: 19, mat: 'grip' });
  // cocking knob in an L slot (right)
  K.mat('bore').box(D(2), D(8), D(70), { p: P3(r - .2, yB + 4, -95), b: 0, ao: .5 });
  K.part('charging', { pivot: P3(r, yB + 4, -128) });
  K.mat('metal').lathe(mmP([[0, 0], [3, 0], [3, 10], [6, 11, 1], [6.5, 18, 1], [5, 20, 1], [0, 20]]), { axis: 'x', p: P3(r - 1, yB + 4, -128), segs: 16 });
  K.use('body');
  // sights: rear peep tower, front blade with wings
  const sLine = yB + r + 15;
  K.mat('stamp').extrude(SH(K, [[-9, 0], [9, 0], [7, 14, 2], [4, 19, 2], [-4, 19, 2], [-7, 14, 2]], .5), D(5), { plane: 'xy', off: D(zR + 8), p: P3(0, yB + r - 4, 0), b: D(.5), bs: 1, holes: [csMM(circle(1.6, 12, 0, sLine - (yB + r - 4)))] });
  K.mat('stamp').extrude(SH(K, [[-8, 0], [8, 0], [8, 10, 2], [4, 13, 1], [4, 6], [-4, 6], [-4, 13, 1], [-8, 10, 2]], .4), D(6), { plane: 'xy', off: D(zE - 12), p: P3(0, yB + r - 2, 0), b: D(.5), bs: 1 });
  K.mat('metal').extrude(SH(K, [[-1.2, 0], [1.2, 0], [1, sLine - (yB + r + 4), .3], [-1, sLine - (yB + r + 4), .3]], .3), D(2.2), { plane: 'xy', off: D(zE - 10), p: P3(0, yB + r + 4, 0), b: D(.2), bs: 1 });
  // wire stock loop (part, folds down-forward)
  K.part('stock', { pivot: P3(0, yB, zR - 6), meta: { fold: { r: [-2.9, 0, 0] } } });
  const ws = [P3(0, yB + 12, zR - 6), P3(0, yB + 16, zR - 120), P3(0, yB + 18, zR - 290), P3(0, yB + 10, zR - 306), P3(0, yB - 54, zR - 306), P3(0, yB - 60, zR - 290), P3(0, 2, zR - 60), P3(0, yB - 12, zR + 4)];
  K.mat('stamp').sweep(ws, { rad: D(4.2), segs: 10 });
  K.mat('stamp').extrude(SH(K, [[-8, -40], [8, -40], [8, 30, 4], [-8, 30, 4]].map(q => [q[0], q[1], 3]), .6), D(34), { p: P3(0, yB - 18, zR - 306), b: D(2), bs: 2 });
  K.use('body');
  sockets(K, { muzzle: [[0, yB, zE + 14]], under: [[0, yB - r, 150]], side: [[r, yB, 150]], mag: [[-r, yB, 19], null, [0, 0, -HALF]], stock: [[0, yB, zR - 6]], barrel: [[0, yB, zS]] });
  muzzleNode(K, yB, zE + 20.2); ejectNode(K, [r, yB + 6, -40]);
  handNodes(K, hr, { p: [-r - 24, yB, 19], kind: 'hold', r: [0, 0, -HALF] });
  sightMeta(K, [0, sLine, zE - 10], [0, sLine, zR + 10], 80);
};

BUILDERS.smgIntegral = (K, S, gun, ctx) => {
  // short angular receiver + long integral suppressor (with a handguard sleeve), straight mag, AR-style stock
  const yB = 34, top = 58, zR = -96, zC0 = 30, zC1 = 336, cr = 21;
  K.mat('rcv').extrude(SH(K, [[zR, 14, -2], [zR, top, -3], [zC0 + 14, top, -3], [zC0 + 14, 14, -3]], .6), D(32), { b: D(2.4), bs: 1 });
  K.mat('bore').box(D(1), D(12), D(30), { p: P3(16.3, 42, -20), b: 0, ao: .5 });
  K.rail(D(118), { p: P3(0, top, -86) });
  K.mat('rcv').lathe(mmP([[8, zC0], [cr - 1.6, zC0, 1], [cr, zC0 + 2, 1], [cr, zC1 - 8, 1], [cr - 3, zC1 - 1, 2], [cr - 6, zC1, 1], [5, zC1], [5, zC1 - 6]]), { p: P3(0, yB, 0), segs: 36, crease: 30 });
  if (K.detail(0)) { for (let k = 0; k < 6; k++) { const a = k * TAU / 6 + .5; K.mat('bore').cyl(D(1.6), D(2), { p: P3(Math.cos(a) * 11, yB + Math.sin(a) * 11, zC1 - 1.2), segs: 8 }); } K.screw({ p: P3(0, yB - 12, zC1 - .2), d: D(4), type: 'hex', mat: 'metal' }); }
  K.mat('bore').cyl(D(5), D(1), { p: P3(0, yB, zC1 - .6), segs: 12 });
  // knurled clamp band near the rear + OD handguard sleeve with grooves
  K.mat('steel_k').tube(D(cr + 1.2), D(cr - .5), D(14), { p: P3(0, yB, zC0 + 18), segs: 36 });
  const sleeve = [[cr + .2, 56], [cr + 3.4, 58, 1], [cr + 3.4, 196, 1], [cr + .2, 198]];
  for (let k = 0; k < (K.detail(1) ? 6 : 0); k++) { sleeve.splice(2 + k * 2, 0, [cr + 3.4, 70 + k * 21], [cr + 2.2, 72 + k * 21]); }
  K.mat('furn').lathe(mmP(sleeve.sort((a, b) => a[1] - b[1])), { p: P3(0, yB, 0), segs: 36, crease: 40 });
  // lower: trigger housing, guard, grip, magwell + straight mag
  K.mat('furn').extrude(SH(K, [[-80, 14.5], [10, 14.5], [10, 2, 3], [-24, -2], [-56, -6, 4], [-80, 6, 4]], .8), D(30), { b: D(2.4), bs: 3 });
  guardLoop(K, [[-26, 1], [34, 1], [35, -12, 5], [26, -28, 7], [-8, -30, 7], [-24, -18, 5]], [[-16, -3, 2], [27, -3, 2], [28, -11, 4], [21, -23, 5], [-5, -24.5, 5], [-15, -16, 4]], 10, 2.2, 'furn');
  triggerPart(K, [0, 6, 2], { face: 'curved', len: 20, w: 7 });
  const hr = longGrip(K, { z: -40, y: -4, ang: .3, len: 96, w: 30, f: 16, b: 21, mat: 'grip', grooves: true });
  K.mat('rcv').extrude(SH(K, [[6, 14.5], [46, 14.5], [45, -4, 2.5], [8, -4, 2.5]], .6), D(29), { b: D(2), bs: 2 });
  const mx = ctx.intr.mag; boxMag(K, { variant: mx, top: [26, 6], len: 192, d: 33, w: 23.5, bend: .1, mat: 'mag', cal: '9', ext: mx && mx.model.ext ? mx.model.ext * 1000 : 0 });
  // charging handle on the left of the clamp, AR stock
  K.part('charging', { pivot: P3(-cr, yB + 6, zC0 + 25) });
  K.mat('metal').extrude(SH(K, [[-4, -2.5], [16, -2.5, 2], [18, 3, 2], [-4, 3, 2]], .4), D(5), { p: P3(-cr - 4, yB + 6, zC0 + 25), b: D(.8), bs: 2 });
  K.use('body');
  bufferStock(K, { z0: zR, y: 40, len: 190, mat: 'furn', tube: 'rcv', w: 40, h: 92 });
  const sY = flipSight(K, 'sightRear', { z: -76, y: top + 9, kind: 'rear', h: 11 });
  const fz = zC1 - 30, ch = sY - (yB + cr) - 4;
  K.mat('rcv').lathe(mmP([[cr + .1, fz - 8], [cr + 2.4, fz - 7], [cr + 2.4, fz + 7], [cr + .1, fz + 8]]), { p: P3(0, yB, 0), segs: 36, a0: HALF - .9, a1: HALF + .9 });
  K.mat('rcv').extrude(SH(K, [[-8, 0], [8, 0], [8, ch * .5, 2], [5, ch + 2, 1.5], [3, ch + 2], [3, ch * .45, 1], [-3, ch * .45, 1], [-3, ch + 2], [-5, ch + 2, 1.5], [-8, ch * .5, 2]], .4), D(6), { plane: 'xy', off: D(fz - 3), p: P3(0, yB + cr + 1.4, 0), b: D(.5), bs: 1 });
  K.mat('metal').extrude(SH(K, [[-1.3, 0], [1.3, 0], [1, sY - (yB + cr + 1.4) - ch * .45, .3], [-1, sY - (yB + cr + 1.4) - ch * .45, .3]], .3), D(2.4), { plane: 'xy', off: D(fz - 1.2), p: P3(0, yB + cr + 1.4 + ch * .45, 0), b: D(.2), bs: 1 });
  sockets(K, { optic: [[0, top + 9, -30]], under: [[0, yB - cr - 3.4, 130]], side: [[cr + 3.4, yB, 130]], mag: [[0, 6, 26]], stock: [[0, 40, zR]] });
  muzzleNode(K, yB, zC1 + .2); ejectNode(K, [16, 42, -20]);
  handNodes(K, hr, { p: [0, yB - cr - 3, 130], kind: 'hold' });
  sightMeta(K, [0, sY, fz], [0, sY, -76], 75);
};

BUILDERS.smgMicro = (K, S, gun, ctx) => {
  // boxy stamped receiver, magazine through the grip, top cocking knob, threaded stub, MAC-style rod stock, front strap
  const yB = 38, top = 62, zR = -92, zF = 84;
  K.mat('stamp').extrude(SH(K, [[zR, 10, -2], [zR, top, -2], [zF, top, -2], [zF, 10, -2]], .5), D(46), { b: D(1.6), bs: 1 });
  for (const sx of [-1, 1]) K.mat('stamp').extrude(SH(K, [[zR + 10, 22], [zF - 10, 22], [zF - 10, 50], [zR + 10, 50]].map(q => [q[0], q[1], 4]), .5), D(1), { off: sx > 0 ? D(23) : D(-24), b: D(.4), bs: 1 });
  rivets(K, [[zR + 6, 16], [zR + 6, 56], [zF - 6, 16], [zF - 6, 56], [-20, 16], [30, 16]], 23.2, 3.4, 'stamp');
  K.mat('bore').box(D(8), D(1.6), D(110), { p: P3(0, top - .6, -6), b: 0, ao: .5 });
  K.part('charging', { pivot: P3(0, top, 40) });
  K.mat('metal').lathe(mmP([[0, 0], [6, 0, 1], [6.5, 4], [6.5, 9], [5.5, 10, 1], [0, 10]]), { axis: 'y', p: P3(0, top + 1, 40), segs: 18 });
  K.mat('bore').box(D(1.6), D(1.2), D(13), { p: P3(0, top + 11, 40), b: 0 });
  K.use('body');
  K.mat('barrel').lathe(mmP([[4.6, zF], [9, zF], [9, zF + 8, 1], [8.2, zF + 10]].concat(K.detail(0) ? Array.from({ length: 14 }, (_, k) => [[8.2, zF + 11 + k * 2], [8.8, zF + 12 + k * 2]]).flat() : [[8.5, zF + 38]]).concat([[8.4, zF + 40, 1], [4.6, zF + 40], [4.6, zF + 34]])), { p: P3(0, yB, 0), segs: 20, crease: 40 });
  K.mat('bore').cyl(D(4.6), D(1), { p: P3(0, yB, zF + 39.4), segs: 12 });
  const sLine = top + 13;
  for (const [zz, kind] of [[zR + 8, 'r'], [zF - 8, 'f']]) {
    K.mat('stamp').extrude(SH(K, [[-11, 0], [11, 0], [11, 13, 2], [7, 13], [7, 4], [-7, 4], [-7, 13], [-11, 13, 2]], .4), D(5), { plane: 'xy', off: D(zz - 2.5), p: P3(0, top - .5, 0), b: D(.5), bs: 1 });
    if (kind === 'r') K.mat('stamp').extrude(SH(K, [[-5, 0], [5, 0], [5, 12, 2], [-5, 12, 2]], .3), D(3), { plane: 'xy', off: D(zz - 1.5), p: P3(0, top + 3, 0), b: D(.3), bs: 1, holes: [csMM(circle(1.5, 12, 0, sLine - top - 3))] });
    else K.mat('metal').extrude(SH(K, [[-1.2, 0], [1.2, 0], [1, sLine - top - 3, .3], [-1, sLine - top - 3, .3]], .3), D(2.4), { plane: 'xy', off: D(zz - 1.2), p: P3(0, top + 3, 0), b: D(.2), bs: 1 });
  }
  // grip with the magazine through it, guard, selector, front fabric strap
  const hr = longGrip(K, { z: -26, y: 10, ang: .1, len: 100, w: 34, f: 19, b: 19, mat: 'grip', tTop: 0 });
  guardLoop(K, [[-10, 10.5], [44, 10.5], [44, -4, 4], [34, -20, 6], [6, -22, 6], [-10, -10, 4]], [[-4, 6], [38, 6, 2], [38, -3, 3], [30, -15, 4], [8, -17, 4], [-4, -8, 3]], 9, 1.8, 'stamp');
  triggerPart(K, [0, 9, 2], { face: 'curved', len: 18, w: 6.5, mat: 'stamp' });
  const mx = ctx.intr.mag; boxMag(K, { variant: mx, top: [-26, 12], len: 236, d: 31, w: 22, rake: .1, mat: 'mag', cal: '9', base: 5, ext: mx && mx.model.ext ? mx.model.ext * 1000 : 0 });
  K.mat('metal').extrude(SH(K, [[-3, -2], [3, -2], [2, 12, 1.4], [-2, 12, 1.4]], .3), D(2), { p: P3(-24, 24, zR + 22), r: [-.6, 0, 0], b: D(.4), bs: 1 });
  K.mat('fabric').sweep([P3(0, 12, zF - 14), P3(0, -6, zF - 6), P3(0, -22, zF - 30), P3(0, -18, zF - 62), P3(0, 0, zF - 74), P3(0, 12, zF - 70)], { rad: D(2), sx: 1, sy: 8, segs: 8, up: [1, 0, 0] });
  // rod stock (two rods along the sides + butt bar); collapses forward along the receiver
  K.part('stock', { pivot: P3(0, 30, zR), meta: { fold: { p: [0, 0, D(205)] } } });
  for (const sx of [-1, 1]) K.mat('metal').cyl(D(3.4), D(230), { p: P3(sx * 26, 30, zR - 212), segs: 12, ch: D(.5) });
  K.mat('metal').extrude(SH(K, [[-30, -4], [30, -4], [30, 4], [-30, 4]].map(q => [q[0], q[1], 3]), .4), D(60), { plane: 'xy', off: D(zR - 222), p: P3(0, 30, 0), b: D(1), bs: 2 });
  K.mat('rubber').extrude(SH(K, [[-16, -26], [16, -26], [16, 36, 6], [-16, 36, 6]].map(q => [q[0], q[1], 5]), .5), D(10), { plane: 'xy', off: D(zR - 232), p: P3(0, 30, 0), b: D(2), bs: 2 });
  K.use('body');
  sockets(K, { optic: [[0, top, -10]], muzzle: [[0, yB, zF + 10]], side: [[23, 30, 40]], mag: [[0, 12, -26], null, [.1, 0, 0]], stock: [[0, 30, zR]] });
  muzzleNode(K, yB, zF + 40.2); ejectNode(K, [23, 46, 0]);
  handNodes(K, hr, { p: [0, -14, zF - 40], kind: 'hold' });
  sightMeta(K, [0, sLine, zF - 8], [0, sLine, zR + 8], 80);
};

// ---- shotguns ------------------------------------------------------------------------------------------------------
/** classic shotgun buttstock with a pistol-grip wrist (loft) from z0 back to z0 - len; heights in mm; returns the wrist grip pose */
function fieldStock(K, { z0, yTop, len = 360, mat = 'wood', pad = 'rubber', drop = 34, butt = 128, w = 40, wrist = true, straight = false }) {
  const R = K.lod ? 6 : 14, rows = [];
  for (let k = 0; k <= R; k++) {
    const t = k / R, z = z0 - t * len;
    const yt = yTop - drop * Math.min(1, t * 1.6) * .55 - (t > .25 ? (t - .25) * drop * .45 : 0);
    const wristK = straight ? 0 : Math.exp(-((t - .18) ** 2) / .006);
    const hgt = 46 + (butt - 46) * Math.max(0, (t - .22) / .78) ** .9 - wristK * 6 + (t < .1 ? (1 - t / .1) * 4 : 0);
    const hw = (w / 2) * (t < .3 ? .78 + .22 * (1 - wristK) : 1) - (t > .9 ? (t - .9) * 8 : 0);
    rows.push(ovalPts(hgt, hw, hw * .7, hw * .85, K.lod ? 2 : 3).map(([sv, x]) => [D(x), D(yt - sv * 0 - hgt + sv), D(z), 0]));
  }
  K.mat(mat).loft3(rows, { crease: 55, uvSwap: true });
  const zb = z0 - len, ytb = yTop - drop;
  K.mat(pad).extrude(SH(K, [[zb + 1, ytb + 2, 4], [zb - 16, ytb + 3, 7], [zb - 17, ytb - butt + 6, 8], [zb + 1, ytb - butt + 4, 4]], .8), D(w + 2), { b: D(5), bs: K.lod ? 1 : 3 });
  K.mat('dark').extrude(SH(K, [[zb + 1, ytb + 2], [zb - 3, ytb + 2.4], [zb - 3.5, ytb - butt + 4], [zb + 1, ytb - butt + 4]], .4), D(w + 1), { b: D(1), bs: 1 });
  if (!wrist) return null;
  const gz = z0 - len * .2, gy = yTop - 44;
  return longGrip(K, { z: gz, y: gy, ang: .5, len: 64, w: w * .78, f: 13, b: 20, mat: mat === 'wood' ? 'wood2' : mat, tTop: -.2, rows: 10 });
}

BUILDERS.shotgunTube = (K, S, gun, ctx) => {
  // tube-fed 12 gauge: pump (slide forend on action bars) or gas semi (fixed forend, twin gas cylinders), bead+rib or ghost ring
  K.meta.magExt = true;
  const yB = 31, yT = 9, zR = -112, zF = 58, bl = S.barrel || 510, zM = zF + bl, tubeEnd = zF + (S.tube || 330) + (ctx.intr.mag ? ctx.intr.mag.model.ext * 1000 : 0), top = 50;
  K.mat('rcv').extrude(SH(K, [[zR, 42, 7], [zR + 7, top, 5], [zF - 4, top, 4], [zF, top - 6, 2], [zF, 2, 5], [zF - 24, -2], [-58, -2], [-86, 6, 6], [zR, 24, 8]], 1), D(S.rw || 34), { b: D(3.2), bs: K.lod ? 1 : 3 });
  K.mat('bore').box(D(1), D(18), D(64), { p: P3((S.rw || 34) / 2 + .1, 30, 0), b: 0, ao: .5 });
  K.part('bolt', { pivot: P3(0, 30, 0) }); K.mat('bright').box(D(2), D(14), D(54), { p: P3((S.rw || 34) / 2 - 1.2, 30, 0), b: D(.6) }); K.use('body');
  K.mat('bore').box(D(22), D(1), D(64), { p: P3(0, -2.2, 10), b: 0, ao: .5 });
  if (S.engrave && K.detail(0)) for (const sx of [-1, 1]) K.mat('nickel').extrude(SH(K, [[-80, 10, 6], [30, 10, 6], [30, 36, 6], [-80, 36, 6]], .5), D(.6), { off: sx > 0 ? D((S.rw || 34) / 2 - .2) : -D((S.rw || 34) / 2 + .4), b: D(.3), bs: 1 });
  if (S.rail) K.rail(D(120), { p: P3(0, top, -96) });
  // barrel + rib / ghost ring
  K.mat('barrel').lathe(mmP([[8.9, zF - 6], [11.4, zF - 6], [11.4, zF + 40, 1], [10.6, zF + 52], [10.2, zM - 4, 1], [10.6, zM - 1, 1], [9.4, zM, 1], [9.4, zM - 20]]), { p: P3(0, yB, 0), segs: 30, crease: 30 });
  K.mat('bore').lathe([[D(9.3), D(zM - .2)], [D(9.3), D(zM - 40)]], { p: P3(0, yB, 0), segs: 16 });
  let sLine, fz;
  if (S.rib) {
    K.mat('barrel').extrude(SH(K, [[zF, 0], [zM - 2, 0], [zM - 2, 3.2], [zF, 3.2]], .4), D(8), { p: P3(0, yB + 10.4 + 2.6, 0), b: D(.6), bs: 1 });
    if (K.detail(1)) for (let z = zF + 20; z < zM - 30; z += 36) K.mat('barrel').box(D(4), D(3), D(5), { p: P3(0, yB + 11.4, z), b: D(.4) });
    sLine = yB + 10.4 + 5.8 + 2.4; fz = zM - 8;
    K.mat(S.bead || 'brass').sphere(D(1.9), { p: P3(0, sLine - 1.9, fz), segs: 12 });
    if (S.midBead && K.detail(0)) K.mat('white').sphere(D(1.1), { p: P3(0, sLine - 2.6, zF + bl * .5), segs: 10 });
  } else if (S.ghost) {
    sLine = top + 14; fz = zM - 22;
    K.part('sightRear', { pivot: P3(0, top + (S.rail ? 9 : 0), -91), meta: { iron: 'hide' } });   // removable ghost ring (comes off under an optic)
    K.mat('rcv').extrude(SH(K, [[-12, 0], [12, 0], [12, 7, 2], [8, 18, 2.5], [4, 18], [4, 11], [-4, 11], [-4, 18], [-8, 18, 2.5], [-12, 7, 2]], .5), D(14), { plane: 'xy', off: D(-96), p: P3(0, top - .5 + (S.rail ? 9 : 0), 0), b: D(.6), bs: 1 });
    K.mat('metal').extrude(SH(K, [[-4, 0], [4, 0], [4, 6, 2], [-4, 6, 2]], .4), D(5), { plane: 'xy', off: D(-91), p: P3(0, top + (S.rail ? 9 : 0) + 7.5, 0), b: D(.4), bs: 1, holes: [csMM(circle(1.8, 14, 0, 3))] });
    K.use('body');
    sLine = top + (S.rail ? 9 : 0) + 10.5;
    const fh = sLine - (yB + 10.4);
    K.mat('rcv').lathe(mmP([[10.3, fz - 9], [12.2, fz - 8], [12.2, fz + 8], [10.3, fz + 9]]), { p: P3(0, yB, 0), segs: 30, a0: HALF - 1.1, a1: HALF + 1.1 });
    K.mat('rcv').extrude(SH(K, [[-9, 0], [9, 0], [9, fh * .55, 2], [6, fh + 1.5, 1.5], [3.4, fh + 1.5], [3.4, fh * .4, 1], [-3.4, fh * .4, 1], [-3.4, fh + 1.5], [-6, fh + 1.5, 1.5], [-9, fh * .55, 2]], .5), D(7), { plane: 'xy', off: D(fz - 3.5), p: P3(0, yB + 10.4, 0), b: D(.5), bs: 1 });
    K.mat('metal').extrude(SH(K, [[-1.3, 0], [1.3, 0], [1.1, fh * .6, .3], [-1.1, fh * .6, .3]], .3), D(2.6), { plane: 'xy', off: D(fz - 1.3), p: P3(0, yB + 10.4 + fh * .4, 0), b: D(.2), bs: 1 });
    if (S.fibre) K.mat(S.fibre).cyl(D(.8), D(3), { p: P3(0, sLine - 1, fz - 1.5), segs: 8 });
  }
  // magazine tube + cap + barrel clamp
  K.mat('rcv').lathe(mmP([[0, zF - 2], [11, zF - 2], [11, tubeEnd - 12, 1], [12, tubeEnd - 10, 1], [12, tubeEnd + 4, 1], [10, tubeEnd + 6, 1], [0, tubeEnd + 6]]), { p: P3(0, yT, 0), segs: 26, crease: 35 });
  if (K.detail(0)) for (let k = 0; k < 7; k++) K.mat('dark').lathe(mmP([[12.05, tubeEnd - 8 + k * 1.8], [12.3, tubeEnd - 7.2 + k * 1.8], [12.05, tubeEnd - 6.4 + k * 1.8]]), { p: P3(0, yT, 0), segs: 26 });
  K.mat('rcv').extrude(SH(K, [[-8, yT - 12, 4], [8, yT - 12, 4], [8, yB + 9, 6], [-8, yB + 9, 6]], .5), D(16), { plane: 'xy', off: D(tubeEnd - 30), b: D(1.2), bs: 2 });
  // forend: pump (part) or fixed with gas cylinders
  const fz0 = S.pump ? zF + 62 : zF + 6, fz1 = fz0 + (S.forendLen || 190);
  if (S.pump) K.part('pump', { pivot: P3(0, yT, fz0), meta: { slide: [0, 0, -D(S.stroke || 92)] } });
  if (S.forend === 'wood') {
    const rows = [];
    for (let k = 0; k <= (K.lod ? 4 : 10); k++) {
      const t = k / (K.lod ? 4 : 10), z = fz0 + t * (fz1 - fz0), groove = S.pump && K.detail(1) && t > .1 && t < .9 && Math.floor(t * 14) % 2 === 0 ? 1.2 : 0;
      const hw = 21 - groove - (t < .08 ? (1 - t / .08) * 3 : t > .92 ? (t - .92) / .08 * 3 : 0);
      rows.push(ovalPts(40, hw, hw * .9, hw * .9, K.lod ? 2 : 4).map(([sv, x]) => [D(x), D(yT - 15 + sv), D(z), 0]));
    }
    K.mat('wood').loft3(rows, { crease: 60, uvSwap: true });
  } else {
    const fcs = [[-21, yT + 20], [-21, yT - 6, 6], [-12, yT - 17, 6], [12, yT - 17, 6], [21, yT - 6, 6], [21, yT + 20], [13, yT + 20], [13, yT - 4, 4], [-13, yT - 4, 4], [-13, yT + 20]];
    cs(K, csMM2(SH(K, fcs, .6)), fz0, fz1, 0, { bb: 2.4, bf: 2.4, mat: 'furn' });
    if (K.detail(1)) for (const sx of [-1, 1]) for (let k = 0; k < 4; k++) K.mat('bore').box(D(1.2), D(7), D(28), { p: P3(sx * 21.1, yT + 4, fz0 + 26 + k * 40), b: 0, ao: .4 });
  }
  if (S.pump) { for (const sx of [-1, 1]) K.mat('metal').box(D(2), D(5), D(fz0 - zF + 70), { p: P3(sx * 11.5, yT + 8, (zF - 70 + fz0) / 2 + 10), b: D(.4) }); K.use('body'); }
  if (S.gas) for (const sx of [-1, 1]) K.mat('rcv').lathe(mmP([[0, zF], [5, zF], [5, zF + 120, 1], [4, zF + 122], [0, zF + 122]]), { p: P3(sx * 10, yT + 11, 0), segs: 14 });
  if (S.charging) { K.part('charging', { pivot: P3((S.rw || 34) / 2, 30, 16) }); K.mat('metal').lathe(mmP([[0, 0], [4, 0], [4, 8], [7, 9, 1], [7, 18, 2], [0, 19]]), { axis: 'x', p: P3((S.rw || 34) / 2 - 1, 30, 16), segs: 16 }); K.use('body'); }
  // trigger group, guard, cross-bolt safety
  K.mat(S.groupMat || 'rcv').extrude(SH(K, [[-64, 2], [16, 2], [14, -8, 3], [-20, -10], [-64, -8, 4]], .6), D(28), { b: D(2), bs: 2 });
  guardLoop(K, [[-26, -6], [24, -6], [25, -18, 5], [16, -32, 7], [-12, -33, 7], [-26, -20, 5]], [[-17, -8.5], [18, -8.5, 2], [18.5, -16, 4], [11, -27, 6], [-9, -27.6, 5], [-17.5, -18, 4]], 8.5, 2, S.groupMat || 'rcv');
  triggerPart(K, [0, -2, 2], { face: 'curved', len: 18, w: 7, mat: 'metal' });
  K.mat('metal').cyl(D(3.6), D(30), { p: P3(-15, -3.5, -21), axis: 'x', segs: 14, ch: D(.6) });
  K.mat(S.saddle ? 'fibre_r' : 'metal').cyl(D(3.6), D(1), { p: P3(14.8, -3.5, -21), axis: 'x', segs: 14 });
  // stock
  let hr;
  if (S.stock === 'collapsible') { bufferStock(K, { z0: zR, y: 38, len: 200, mat: 'furn', tube: 'rcv', w: 42, h: 96 }); hr = longGrip(K, { z: -50, y: -4, ang: .32, len: 94, w: 31, f: 16, b: 21, mat: 'grip' }); }
  else hr = fieldStock(K, { z0: zR + 2, yTop: top - 6, len: S.stockLen || 350, mat: 'wood', drop: 30 });
  // side saddle (left) with shells
  if (S.saddle) { K.mat('furn').extrude(SH(K, [[-82, 10, 3], [24, 10, 3], [24, 40, 3], [-82, 40, 3]], .5), D(3), { off: -D((S.rw || 34) / 2 + 3), b: D(.8), bs: 1 }); for (let k = 0; k < 6; k++) shell(K, { p: P3(-(S.rw || 34) / 2 - 13.5, 2, -74 + k * 17), r: [-HALF, 0, 0], len: 66, hull: S.hull || 'paint_red' }); }
  K.node('pumpShell', P3(0, yT, zF), [0, 0, 0]);
  swivel(K, [0, yT - 12, tubeEnd - 4]); if (S.stock !== 'collapsible') swivel(K, [0, -60, zR - 300]);
  for (const sx of [-1, 1]) for (const [pz, py] of [[-40, 4], [6, 4], [-80, 30], [30, 30]]) K.pin({ p: P3(sx * (S.rw || 34) / 2, py, pz), d: D(4.2), mat: 'metal' });
  if (K.detail(0)) K.mat('metal').extrude(SH(K, [[-4, -2], [5, -2, 1.5], [5, 3, 1.5], [-4, 3, 1.5]], .4), D(1.6), { p: P3(-(S.rw || 34) / 2 - .6, -2, 26), b: D(.4), bs: 1 });
  sockets(K, { optic: S.rail ? [[0, top + 9, -40]] : [[0, top, -40]], muzzle: [[0, yB, zM]], under: S.pump ? null : [[0, yT - 17, fz0 + 100]], side: [[21, yT + 2, S.pump ? fz1 + 20 : fz0 + 100]], mag: [[0, yT, zF]], stock: [[0, 38, zR]], barrel: [[0, yB, zF]] });
  muzzleNode(K, yB, zM + .2); ejectNode(K, [(S.rw || 34) / 2, 32, 0]);
  handNodes(K, hr, { p: [0, yT - 4, (fz0 + fz1) / 2 + 10], kind: S.pump ? 'pump' : 'hold', part: S.pump ? 'pump' : undefined });
  sightMeta(K, [0, sLine, fz], [0, sLine, S.ghost ? -91 : zR + 10], S.ghost ? 80 : 110);
};

/** AK-pattern stamped receiver: body + dust cover (rounded) + trunnion rivets + long charging handle (part) + safety lever */
function akReceiver(K, { zR = -120, zF = 112, top = 48, w = 30, cover = true, rail = false }) {
  K.mat('stamp').extrude(SH(K, [[zR, 8, 3], [zR, top - 9], [zF, top - 9], [zF, -2, 4], [zF - 70, -2], [zR + 50, 2], [zR + 10, 2]], .6), D(w), { b: D(1.2), bs: 1 });
  const dc = slideCS(w + 1, 13, 0, { round: 1, r: (w + 1) / 2 });
  if (cover) { K.part('cover', { pivot: P3(0, top - 9, zF) }); cs(K, dc, zR - 6, zF - 4, top - 12, { bb: 2, bf: 1.2, mat: 'stamp' }); if (K.detail(0)) for (let k = 0; k < 6; k++) K.mat('stamp').box(D(w + 1.2), D(1.2), D(6), { p: P3(0, top - 2, zR + 30 + k * 18), b: D(.4) }); if (rail) K.rail(D(zF - zR - 30), { p: P3(0, top + 1, zR + 10) }); K.use('body'); }
  rivets(K, [[zF - 10, 4], [zF - 22, 4], [zF - 10, 18], [zR + 14, 14], [zR + 30, 6], [zR + 48, 6]], w / 2 + .1, 3.4, 'stamp');
  K.mat('bore').box(D(1), D(13), D(64), { p: P3(w / 2 + .1, top - 18, zR + 140), b: 0, ao: .5 });
  K.part('charging', { pivot: P3(w / 2, top - 16, zF - 40) });
  K.mat('bright').extrude(SH(K, [[-34, -3], [8, -3, 1], [8, 3, 1], [-34, 3, 1]], .4), D(4), { p: P3(w / 2 + 1.6, top - 16, zF - 50), b: D(.6), bs: 1 });
  K.mat('bright').lathe(mmP([[0, 0], [4.4, 0, 1], [5, 3], [5, 9, 1], [3.4, 12], [0, 12]]), { axis: 'x', p: P3(w / 2 + 2, top - 16, zF - 44), segs: 16 });
  K.use('body');
  K.part('safety', { pivot: P3(w / 2, top - 14, zR + 20) });
  K.mat('stamp').extrude(SH(K, [[-8, -3], [118, -3, 2], [126, -8, 3], [126, -2, 3], [118, 4, 2], [-8, 4, 3]], .4), D(1.8), { p: P3(w / 2 + 1, top - 14, zR + 8), r: [-.02, 0, 0], b: D(.4), bs: 1 });
  K.use('body');
}

BUILDERS.shotgunDrum = (K, S, gun, ctx) => {
  const yB = 34, top = 50, zR = -120, zF = 112, bl = 480, zM = zF + bl - 120;
  akReceiver(K, { zR, zF, top, w: 31, rail: true });
  K.mat('barrel').lathe(mmP([[9, zF - 4], [12.6, zF - 4], [12.6, zF + 30, 1], [11, zF + 36], [10.4, zM - 2], [9.4, zM]]), { p: P3(0, yB, 0), segs: 26 });
  K.part('muzzleDev', { pivot: P3(0, yB, zM), meta: { replace: 'muzzle' } }); K.mat('barrel').lathe(mmP([[9.4, zM - 2], [15, zM - 2, 1], [15.5, zM], [15.5, zM + 62, 1], [14, zM + 64, 1], [9.6, zM + 64], [9.6, zM + 58]]), { p: P3(0, yB, 0), segs: 26 });
  if (K.detail(0)) for (const sx of [-1, 1]) for (let k = 0; k < 4; k++) K.mat('bore').box(D(2), D(9), D(7), { p: P3(sx * 14.8, yB, zM + 10 + k * 13), b: 0, ao: .4 });
  K.mat('bore').cyl(D(9.4), D(1), { p: P3(0, yB, zM + 63.4), segs: 14 }); K.use('body');
  // gas block + tube + front post, polymer handguard with rails, rear leaf
  const gz = zM - 120;
  K.mat('stamp').extrude(SH(K, [[gz - 14, yB - 12], [gz + 14, yB - 12, 2], [gz + 14, yB + 30, 3], [gz - 10, yB + 30, 3], [gz - 14, yB + 22]], .6), D(26), { b: D(1.6), bs: 2 });
  K.mat('stamp').lathe(mmP([[0, zF + 10], [9, zF + 10], [9, gz - 12, 1], [0, gz - 12]]), { p: P3(0, yB + 20, 0), segs: 20 });
  const sLine = top + 9 + 12;
  K.mat('stamp').extrude(SH(K, [[-9, 0], [9, 0], [9, 10, 2], [5, 16, 2], [3, 16], [3, 6], [-3, 6], [-3, 16], [-5, 16, 2], [-9, 10, 2]], .5), D(8), { plane: 'xy', off: D(gz + 2), p: P3(0, yB + 30, 0), b: D(.5), bs: 1 });
  K.mat('metal').extrude(SH(K, [[-1.3, 0], [1.3, 0], [1.1, sLine - yB - 36, .3], [-1.1, sLine - yB - 36, .3]], .3), D(2.6), { plane: 'xy', off: D(gz + 4.7), p: P3(0, yB + 36, 0), b: D(.2), bs: 1 });
  const hg = [[-20, yB + 26], [-20, yB - 14, 7], [20, yB - 14, 7], [20, yB + 26], [13, yB + 26], [13, yB - 6, 4], [-13, yB - 6, 4], [-13, yB + 26]];
  cs(K, csMM2(SH(K, hg, .6)), zF + 4, gz - 16, 0, { bb: 2, bf: 2, mat: 'furn' });
  K.rail(D(gz - zF - 40), { p: P3(0, yB - 14, zF + 14), r: [0, 0, Math.PI] });
  for (const sx of [-1, 1]) K.rail(D(80), { p: P3(sx * 20, yB + 6, gz - 110), r: [0, 0, -sx * HALF] });
  K.mat('stamp').extrude(SH(K, [[-6, -1], [6, -1], [6, 6, 1], [1.6, 9], [1.6, 7], [-1.6, 7], [-1.6, 9], [-6, 6, 1]], .4), D(16), { plane: 'xy', off: D(zF - 10), p: P3(0, sLine - 7, 0), b: D(.4), bs: 1 });
  // guard, grip, mag well + drum (part)
  guardLoop(K, [[-28, -1], [30, -1], [31, -14, 4], [22, -28, 6], [-12, -30, 7], [-28, -16, 5]], [[-19, -4], [24, -4, 2], [24.5, -11, 4], [17, -23, 5], [-9, -24.5, 5], [-19.5, -14, 4]], 8, 1.8, 'stamp');
  triggerPart(K, [0, 2, 2], { face: 'curved', len: 18, w: 7 });
  const hr = longGrip(K, { z: -48, y: -1, ang: .32, len: 96, w: 30, f: 15, b: 21, mat: 'grip' });
  K.part('mag', { pivot: P3(0, 0, 58) });
  K.mat('mag').extrude(SH(K, [[40, 2], [78, 2], [80, -36, 3], [38, -36, 3]], .6), D(28), { b: D(2), bs: 2 });
  K.mat('mag').lathe(mmP([[0, -24], [60, -24, 2], [62, -22, 2], [62, 22, 2], [60, 24, 2], [0, 24]]), { axis: 'x', p: P3(0, -88, 66), segs: 40, crease: 35 });
  if (K.detail(0)) { for (let k = 0; k < 10; k++) { const a = k * TAU / 10; K.mat('mag').box(D(50), D(3), D(8), { p: P3(0, -88 + Math.sin(a) * 62, 66 + Math.cos(a) * 62), r: [-a, 0, 0], b: D(.8) }); } for (const sx of [-1, 1]) K.mat('mag').lathe(mmP([[0, 0], [18, 0, 1], [18, 3, 1], [0, 4]]), { axis: sx > 0 ? 'x' : '-x', p: P3(sx * 24, -88, 66), segs: 24 }); }
  K.use('body');
  // side-folding skeleton stock (polymer)
  K.part('stock', { pivot: P3(0, 30, zR), meta: { fold: { r: [0, 2.95, 0], p: [D(24), 0, 0] } } });
  K.mat('furn').extrude(SH(K, [[zR, 44], [zR - 240, 52, 6], [zR - 252, 40, 6], [zR - 252, -56, 8], [zR - 232, -64, 6], [zR - 210, -10, 10], [zR - 40, 14, 8], [zR, 14]], 1), D(24), { b: D(3), bs: 2, holes: [SH(K, [[zR - 200, 36, 8], [zR - 40, 34, 6], [zR - 40, 24, 5], [zR - 196, 2, 8]], .8)] });
  K.mat('rubber').extrude(SH(K, [[zR - 264, 54, 6], [zR - 250, 54], [zR - 250, -66], [zR - 264, -66, 6]], .6), D(36), { b: D(3), bs: 2 });
  K.use('body');
  sockets(K, { optic: [[0, top + 10, -30], 'cover'], muzzle: [[0, yB, zM]], under: [[0, yB - 23, zF + 80]], side: [[29, yB + 6, gz - 70]], mag: [[0, 0, 58]], stock: [[0, 30, zR]], barrel: [[0, yB, zF]] });
  muzzleNode(K, yB, zM + 64.2); ejectNode(K, [16, top - 18, 20]);
  handNodes(K, hr, { p: [0, yB - 8, zF + 120], kind: 'hold' });
  sightMeta(K, [0, sLine, gz + 4.7], [0, sLine, zF - 2], 260);
};

BUILDERS.shotgunBreak = (K, S, gun, ctx) => {
  // side-by-side coach gun: barrels (part, hinge) with rib + bead, boxlock action with exposed hammers, two triggers, top lever
  const yB = 34, hz = 40, bl = 460, zM = hz + bl, bx = 10.6;
  K.part('barrels', { pivot: P3(0, yB - 16, hz), meta: { breakR: [.62, 0, 0] } });
  for (const sx of [-1, 1]) {
    K.mat('barrel').lathe(mmP([[9.3, hz], [12.4, hz], [12.4, hz + 50, 1], [11, hz + 70], [10.4, zM - 2], [9.3, zM]]), { p: P3(sx * bx, yB, 0), segs: 26 });
    K.mat('bore').lathe([[D(9.3), D(zM - .2)], [D(9.3), D(zM - 40)]], { p: P3(sx * bx, yB, 0), segs: 16 });
  }
  K.mat('barrel').extrude(SH(K, [[hz + 6, 0], [zM - 2, 0], [zM - 2, 3.6], [hz + 30, 4.6], [hz + 6, 5]], .4), D(10), { p: P3(0, yB + 8, 0), b: D(.8), bs: 1 });
  K.mat('barrel').extrude(SH(K, [[hz + 6, 0], [zM - 6, 0], [zM - 6, 4], [hz + 6, 4]], .4), D(8), { p: P3(0, yB - 13, 0), b: D(.6), bs: 1 });
  const sLine = yB + 8 + 3.6 + 3.4;
  K.mat('brass').sphere(D(1.9), { p: P3(0, sLine - 1.9, zM - 8), segs: 12 });
  // splinter forend (wood) on the barrels
  K.mat('wood').loft3([0, 1, 2, 3].map(k => ovalPts(22, 22 - (k === 0 || k === 3 ? 3 : 0), 8, 8, K.lod ? 2 : 4).map(([sv, x]) => [D(x), D(yB - 30 + sv), D(hz + 10 + [0, 6, 170, 182][k]), 0])), { crease: 50, uvSwap: true });
  K.use('body');
  // boxlock action
  K.mat('rcv').extrude(SH(K, [[-58, 34, 8], [-46, 46, 6], [hz + 2, 46, 2], [hz + 2, 12, 6], [hz - 8, 2, 4], [-30, 0], [-58, 14, 8]], 1), D(44), { b: D(4), bs: K.lod ? 1 : 3 });
  if (K.detail(0)) for (const sx of [-1, 1]) { K.mat('nickel').extrude(SH(K, [[-30, 14, 10], [26, 14, 6], [26, 34, 6], [-30, 34, 10]], .5), D(.5), { off: sx > 0 ? D(21.8) : -D(22.3), b: D(.2), bs: 1 }); K.pin({ p: P3(sx * 22, 24, 30), d: D(6), mat: 'metal' }); }
  K.part('lever', { pivot: P3(0, 46, -44) });
  K.mat('metal').extrude(SH(K, [[-50, 0], [-30, 0, 2], [-30, 4, 2], [-36, 6, 2], [-62, 4, 3], [-64, 1, 2]], .4), D(10), { plane: 'xz', off: D(46), p: P3(0, 0, 0), b: D(.8), bs: 1 });
  K.use('body');
  for (const sx of [-1, 1]) {
    K.part(sx < 0 ? 'hammer_l' : 'hammer_r', { pivot: P3(sx * 14, 34, -40) });
    K.mat('metal').extrude(SH(K, [[-36, 28], [-38, 38, 3], [-52, 48, 2], [-58, 46, 2], [-50, 38, 3], [-46, 28, 2]], .5), D(6), { p: P3(sx * 14, 0, 0), b: D(.8), bs: 2 });
    K.use('body');
  }
  // trigger guard + two triggers + stock (pistol grip)
  guardLoop(K, [[-36, 2], [26, 2], [27, -12, 6], [16, -28, 8], [-20, -30, 8], [-36, -16, 5]], [[-27, -1], [19, -1, 2], [19, -10, 4], [11, -23, 6], [-17, -24.5, 6], [-27, -13, 4]], 8.5, 2, 'rcv');
  for (const [dz, nm] of [[8, 'trigger'], [-10, 'trigger2']]) { K.part(nm, { pivot: P3(0, 1, dz) }); K.mat('metal').extrude(SH(K, [[dz - 2, 3], [dz + 2, 3], [dz + 3.6, -8, 5], [dz + 1, -16, 1.4], [dz - 1.6, -14, 2], [dz - 1, -6, 4]], .4), D(5.5), { b: D(.8), bs: 2 }); K.use('body'); }
  const hr = fieldStock(K, { z0: -56, yTop: 44, len: 340, mat: 'wood', drop: 34, butt: 124 });
  swivel(K, [0, -62, -350]);
  K.use('barrels'); swivel(K, [0, yB - 17, zM - 70]); K.mat('metal').extrude(SH(K, [[hz + 150, -2], [hz + 186, -2, 2], [hz + 190, 3, 2], [hz + 150, 3]], .4), D(10), { p: P3(0, yB - 29, 0), b: D(.6), bs: 1 }); K.use('body');
  K.mat('metal').cyl(D(5), D(4), { p: P3(0, 46, -44), axis: 'y', segs: 18, ch: D(.8) });
  K.mat('rcv').lathe(mmP([[0, -24], [8, -24, 1], [8, 24, 1], [0, 24]]), { axis: 'x', p: P3(0, yB - 16, hz), segs: 24 });
  K.mat('metal').extrude(SH(K, [[-3, -2], [10, -2, 2], [10, 2.5, 2], [-3, 2.5, 2]], .4), D(8), { plane: 'xz', off: D(46), p: P3(0, 0, -60), b: D(.8), bs: 2 });
  for (const sx of [-1, 1]) K.screw({ p: P3(sx * 21.6, 30, -48), axis: sx > 0 ? 'x' : '-x', d: D(5), h: D(.8), type: 'slot', mat: 'metal' });
  for (const sx of [-1, 1]) for (const [pz, py] of [[-20, 6], [10, 6], [-40, 20]]) K.pin({ p: P3(sx * 22, py, pz), d: D(4), mat: 'metal' });
  sockets(K, { muzzle: [[0, yB, zM], 'barrels'], side: [[22, yB - 20, hz + 100], 'barrels'] });
  muzzleNode(K, yB, zM + .2, 'barrels'); ejectNode(K, [0, yB, hz - 4], 'break', 'barrels');
  handNodes(K, hr, { p: [0, yB - 26, hz + 100], kind: 'hold', part: 'barrels' });
  sightMeta(K, [0, sLine, zM - 8], [0, sLine, -46], 120);
};

BUILDERS.shotgunLever = (K, S, gun, ctx) => {
  // rolling-block lever 12 gauge: rounded case-hardened receiver, big loop lever (part), hammer, half-octagon barrel, tube, walnut
  const yB = 36, yT = 13, zR = -70, zF = 70, bl = 510, zM = zF + bl, top = 54;
  K.mat('rcv').extrude(SH(K, [[zR, 30, 10], [zR + 18, top, 14], [zF - 6, top, 4], [zF, top - 8, 2], [zF, 2, 6], [zF - 30, -2], [zR + 20, -2], [zR, 10, 6]], 1), D(36), { b: D(4), bs: K.lod ? 1 : 3 });
  K.mat('bore').box(D(26), D(1), D(80), { p: P3(0, -2.4, 10), b: 0, ao: .5 });
  for (const sx of [-1, 1]) for (const [z, y] of [[-40, 24], [40, 20], [0, 10]]) K.screw({ p: P3(sx * 18, y, z), axis: sx > 0 ? 'x' : '-x', d: D(5), h: D(.8), type: 'slot', mat: 'metal' });
  // half-octagon barrel: octagonal breech section (flat-shaded lathe) then round
  K.mat('barrel').lathe(mmP([[0, zF - 4], [14, zF - 4], [14, zF + 140], [0, zF + 140]]), { p: P3(0, yB, 0), segs: 8, fixed: true, flat: true, phase: Math.PI / 8 });
  K.mat('barrel').lathe(mmP([[9.3, zF + 130], [12, zF + 130], [12, zF + 146, 1], [10.6, zF + 150], [10.2, zM - 2, 1], [9.3, zM]]), { p: P3(0, yB, 0), segs: 26 });
  K.mat('bore').lathe([[D(9.3), D(zM - .2)], [D(9.3), D(zM - 40)]], { p: P3(0, yB, 0), segs: 16 });
  const sLine = yB + 10.2 + 5;
  K.mat('brass').sphere(D(2), { p: P3(0, sLine - 2, zM - 10), segs: 12 });
  K.mat('metal').extrude(SH(K, [[-12, 0], [12, 0], [12, 4, 2], [2, sLine - yB - 12, .5], [-2, sLine - yB - 12, .5], [-12, 4, 2]], .4), D(10), { plane: 'xy', off: D(zF + 120), p: P3(0, yB + 12, 0), b: D(.6), bs: 1 });
  K.mat('bore').box(D(2.4), D(2), D(4), { p: P3(0, sLine - .5, zF + 125), b: 0 });
  // tube magazine + barrel band + walnut forearm
  const tx = ctx.intr.mag && ctx.intr.mag.model.ext ? ctx.intr.mag.model.ext * 1000 : 0; K.meta.magExt = true;
  K.mat('rcv').lathe(mmP([[0, zF - 2], [11, zF - 2], [11, zF + 330 + tx, 1], [12, zF + 334 + tx], [12, zF + 344 + tx, 1], [0, zF + 346 + tx]]), { p: P3(0, yT, 0), segs: 24 });
  K.mat('rcv').extrude(SH(K, [[-8, yT - 13, 4], [8, yT - 13, 4], [8, yB + 12, 6], [-8, yB + 12, 6]], .5), D(12), { plane: 'xy', off: D(zF + 300), b: D(1), bs: 2 });
  const rows = []; for (let k = 0; k <= (K.lod ? 3 : 6); k++) { const t = k / (K.lod ? 3 : 6), hw = 20 - (t < .1 ? 3 * (1 - t / .1) : t > .9 ? 3 * (t - .9) / .1 : 0); rows.push(ovalPts(42, hw, hw * .9, hw * .9, K.lod ? 2 : 4).map(([sv, x]) => [D(x), D(yT - 14 + sv), D(zF + 4 + t * 210), 0])); }
  K.mat('wood').loft3(rows, { crease: 60, uvSwap: true });
  // loop lever (part) + trigger + hammer
  K.part('lever', { pivot: P3(0, 4, zF - 18), meta: { cycleR: [.95, 0, 0] } });
  K.mat('metal').extrude(SH(K, [[zF - 24, 6], [zF - 10, 6, 4], [zF - 12, -6, 4], [-14, -10, 3], [-36, -20, 8], [-62, -32, 10], [-112, -36, 14], [-128, -18, 10], [-118, 0, 6], [-80, 0]], 1), D(10), { b: D(2.4), bs: 2, holes: [SH(K, [[-22, -8, 4], [-40, -24, 8], [-104, -28, 10], [-112, -16, 6], [-92, -10, 6], [-34, -12, 4]], .6)] });
  K.use('body');
  triggerPart(K, [0, 4, 0], { face: 'curved', len: 18, w: 7, mat: 'metal' });
  hammerPart(K, [top - 14, zR + 26], { kind: 'spur', w: 9, len: 28, mat: 'metal' });
  const hr = fieldStock(K, { z0: zR + 4, yTop: top - 4, len: 340, mat: 'wood', drop: 30, straight: true, wrist: false });
  if (K.detail(0)) { K.mat('metal').lathe(mmP([[7, -1.6], [10, -1.6], [10, 1.6], [7, 1.6], [7, -1.6]]), { axis: 'x', p: P3(-20, 26, -40), segs: 20 }); K.mat('metal').cyl(D(3), D(4), { p: P3(-18, 26, -40), axis: '-x', segs: 10 }); }
  K.mat('metal').extrude(SH(K, [[-6, 0], [6, 0], [6, 5, 1], [1.4, 9], [1.4, 7], [-1.4, 7], [-1.4, 9], [-6, 5, 1]], .4), D(14), { plane: 'xy', off: D(zF + 118), p: P3(0, yB + 12.5, 0), b: D(.4), bs: 1 });
  swivel(K, [0, yT - 12, zF + 330]); swivel(K, [0, -62, zR - 300]);
  K.mat('metal').extrude(SH(K, [[-30, 18, 3], [30, 18, 3], [30, 40, 3], [-30, 40, 3]], .5), D(.8), { off: D(18 - .2), b: D(.3), bs: 1 });
  for (const [z, y] of [[zR - 20, top - 6], [zR - 60, top - 10], [zR - 30, -4]]) K.screw({ p: P3(0, y, z), axis: 'y', d: D(5), h: D(.8), type: 'slot', mat: 'metal' });
  sockets(K, { muzzle: [[0, yB, zM]], side: [[20, yT, zF + 120]], mag: [[0, yT, zF]], stock: [[0, 40, zR]] });
  muzzleNode(K, yB, zM + .2); ejectNode(K, [0, top, 10], 'right');
  const gp = { p: [0, -12, zR - 40], ang: .9 };
  handNodes(K, gp, { p: [0, yT - 6, zF + 110], kind: 'hold' });
  sightMeta(K, [0, sLine, zM - 10], [0, sLine, zF + 125], 260);
};

// ---- machine guns --------------------------------------------------------------------------------------------------
/** folding bipod (part 'bipod') clamped at z (mm) under the barrel at yb; legs fold forward along the barrel */
function bipodPart(K, { z, yb, len = 230, mat = 'metal', spread = .18, folded = true, back = false }) {
  K.part('bipod', { pivot: P3(0, yb - 12, z), meta: { deployR: [back ? 1.5 : -1.5, 0, 0], replace: 'bipod' } });
  if (back) len = -len;
  K.mat(mat).extrude(SH(K, [[-12, 4], [12, 4], [12, -12, 3], [-12, -12, 3]], .5), D(30), { plane: 'xy', off: D(z - 15), p: P3(0, yb - 6, 0), b: D(1.4), bs: 2 });
  for (const sx of [-1, 1]) {
    const x0 = sx * 10, a = folded ? 0 : 1;
    const p0 = P3(x0, yb - 14, z), p1 = folded ? P3(x0 * .6, yb - 9, z + len) : P3(x0 + sx * len * spread, yb - 14 - len, z + 20);
    K.mat(mat).sweep([p0, p1], { rad: D(5), segs: 10 }); void a;
    K.mat('rubber').sweep([p1, folded ? P3(x0 * .6, yb - 8, z + len + 16 * Math.sign(len)) : P3(x0 + sx * len * spread * 1.08, yb - 14 - len - 16, z + 22)], { rad: D(6), segs: 10 });
  }
  K.use('body');
}
/** a belt of cartridges + links along a path of points (mm) */
function beltAlong(K, pts, cal, every = 1, linkMat = 'dark') {
  if (!K.detail(0)) return;
  const c = CAL[cal];
  for (let i = 0; i < pts.length; i += every) {
    const [p, dir] = pts[i];
    K.at({ p: P3(...p), r: dir }, () => { cartridge(K, c, { p: [-D(c.len * .55), 0, 0], r: [0, HALF, 0], segs: 8 }); K.mat(linkMat).tube(D(c.d / 2 + 1.2), D(c.d / 2 + .3), D(6), { axis: 'x', p: [-D(8), 0, 0], segs: 10 }); });
  }
}

BUILDERS.beltLmg = (K, S, gun, ctx) => {
  // belt-fed MG: long stamped receiver, hinged feed cover (part) with rail, heavy barrel + carry handle, gas tube, bipod, ammo pouch/box
  const bmm = barrelMod(ctx), v = S.variant || 'varg', yB = 40, top = 66, zR = -150, zF = 152, bl = (S.barrel || 465) + bmm.ext, zM = zF + bl - 40, w = S.rw || 46; K.meta.barrelDone = true;
  K.mat('stamp').extrude(SH(K, [[zR, 6, 4], [zR, top - 10, 4], [zF, top - 10, 3], [zF + 8, top - 18, 3], [zF + 8, 10, 4], [zF - 30, 2], [zR + 40, 2]], .8), D(w), { b: D(1.6), bs: 1 });
  for (const yy of [16, 40]) for (const sx of [-1, 1]) K.mat('stamp').extrude(SH(K, [[zR + 16, -1.4, 1.4], [zF - 12, -1.4, 1.4], [zF - 12, 1.4, 1.4], [zR + 16, 1.4, 1.4]], .4), D(1.6), { p: P3(sx * (w / 2 + .3), yy, 0), b: D(.5), bs: 1 });
  rivets(K, [[zR + 10, 10], [zR + 10, 48], [zF - 8, 10], [zF - 8, 48], [-20, 10], [60, 10]], w / 2 + .1, 3.6, 'stamp');
  // feed cover (part) hinged at the rear, with rail and the rear sight
  const cz0 = -70, cz1 = 92;
  K.part('cover', { pivot: P3(0, top - 10, cz0), meta: { openR: [-1.1, 0, 0] } });
  K.mat('stamp').extrude(SH(K, [[cz0, top - 10], [cz1, top - 10], [cz1, top - 2, 3], [cz1 - 10, top + 2, 4], [cz0 + 6, top + 2, 4], [cz0, top - 4, 3]], .6), D(w - 2), { b: D(2), bs: 2 });
  if (S.rail !== false) K.rail(D(cz1 - cz0 - 30), { p: P3(0, top + 2, cz0 + 20) });
  K.mat('stamp').box(D(14), D(4), D(8), { p: P3(-w / 2 + 3, top - 4, cz1 - 8), b: D(1) });
  const rH = (S.rail !== false ? 9 : 0) + 6;
  K.part('sightRear', { pivot: P3(0, top + 2, cz0 + 7), parent: 'cover', meta: { iron: 'fold', foldR: [1.45, 0, 0] } });
  K.mat('stamp').extrude(SH(K, [[-10, 0], [10, 0], [10, rH + 4, 2], [5, rH + 10, 2], [3, rH + 10], [3, rH + 3], [-3, rH + 3], [-3, rH + 10], [-5, rH + 10, 2], [-10, rH + 4, 2]], .5), D(6), { plane: 'xy', off: D(cz0 + 4), p: P3(0, top + 1.6, 0), b: D(.5), bs: 1 });
  K.mat('metal').extrude(SH(K, [[-4, 0], [4, 0], [4, 7, 2], [-4, 7, 2]], .4), D(3), { plane: 'xy', off: D(cz0 + 5.5), p: P3(0, top + 1.6 + rH - 1, 0), b: D(.4), bs: 1, holes: [csMM(circle(1.5, 12, 0, 3.6))] });
  K.use('cover');
  const sLine = top + 1.6 + rH - 1 + 3.6;
  K.use('body');
  // barrel: heavy, fluted (kuznets) or plain with flash hider; carry handle; gas block + tube; front sight
  const bR = bmm.heavy ? Math.max(bmm.heavy, (S.bR || 11) + 1.5) : S.bR || 11;
  K.mat('barrel').lathe(mmP([[7, zF - 8], [bR + 3, zF - 8], [bR + 3, zF + 26, 1], [bR, zF + 32], [bR - 1, zM - 2, 1], [bR - 1.6, zM]]), { p: P3(0, yB, 0), segs: 30, rmod: S.flutes && K.detail(1) ? (a, z) => (z > D(zF + 60) && z < D(zM - 90) ? 1 - .1 * Math.max(0, Math.cos(a * 6)) ** 4 : 1) : null });
  const fhL = S.fhLen || 62;
  K.part('muzzleDev', { pivot: P3(0, yB, zM), meta: { replace: 'muzzle' } }); K.mat('barrel').lathe(mmP([[6, zM - 2], [bR - .5, zM - 2], [bR - .5, zM + fhL, 1], [bR - 1.5, zM + fhL + 1], [6, zM + fhL + 1], [6, zM + fhL - 6]]), { p: P3(0, yB, 0), segs: 26 });
  if (K.detail(0)) { const n = S.fhSlots || 5; for (let k = 0; k < n; k++) { const a = k * TAU / n + .3; K.mat('bore').box(D(2.4), D(2.6), D(fhL * .7), { p: P3(Math.cos(a) * (bR - .8), yB + Math.sin(a) * (bR - .8), zM + fhL * .55), r: [0, 0, a - HALF], b: 0, ao: .4 }); } }
  K.mat('bore').cyl(D(5.8), D(1), { p: P3(0, yB, zM + fhL + .4), segs: 12 }); K.use('body');
  const gz = zF + (S.gasAt || 260);
  K.mat('stamp').extrude(SH(K, [[gz - 16, yB - 34], [gz + 16, yB - 34, 3], [gz + 16, yB + 4, 4], [gz - 16, yB + 4, 4]], .6), D(30), { b: D(2), bs: 2 });
  K.mat('stamp').lathe(mmP([[0, zF + 10], [9, zF + 10], [9, gz - 14, 1], [0, gz - 14]]), { p: P3(0, yB - 20, 0), segs: 20 });
  const fz = zM - (S.frontBack || 30), fh = sLine - yB - bR;
  K.mat('stamp').extrude(SH(K, [[-9, 0], [9, 0], [9, fh * .5, 2], [6, fh + 2, 2], [3, fh + 2], [3, fh * .45], [-3, fh * .45], [-3, fh + 2], [-6, fh + 2, 2], [-9, fh * .5, 2]], .5), D(10), { plane: 'xy', off: D(fz - 5), p: P3(0, yB + bR - 1, 0), b: D(.6), bs: 1 });
  K.mat('metal').extrude(SH(K, [[-1.4, 0], [1.4, 0], [1.2, fh * .58, .3], [-1.2, fh * .58, .3]], .3), D(2.8), { plane: 'xy', off: D(fz - 1.4), p: P3(0, yB + bR - 1 + fh * .45, 0), b: D(.2), bs: 1 });
  // carry handle on the barrel (part, folds)
  const hz0 = zF + 60;
  K.part('handle', { pivot: P3(w / 2 - 6, yB + bR, hz0) });
  K.mat('stamp').box(D(10), D(12), D(18), { p: P3(0, yB + bR + 4, hz0), b: D(1.6) });
  K.mat('stamp').sweep([P3(4, yB + bR + 8, hz0), P3(22, yB + bR + 40, hz0 - 20), P3(26, yB + bR + 44, hz0 - 90), P3(14, yB + bR + 30, hz0 - 120)], { rad: D(3.4), segs: 10 });
  K.mat(S.handleMat || 'furn').lathe(mmP([[0, 0], [8, 0, 1], [9, 6], [9, 54], [8, 60, 1], [0, 60]]), { p: P3(25, yB + bR + 44, hz0 - 88), segs: 16 });
  K.use('body');
  // lower: handguard under the receiver front, guard, grip, charging handle
  const hg = [[-w / 2 + 2, yB - 22], [-w / 2 + 2, yB - 44, 6], [w / 2 - 2, yB - 44, 6], [w / 2 - 2, yB - 22]];
  cs(K, csMM2(SH(K, hg, .6)), zF - 10, zF + 120, 0, { bb: 3, bf: 3, mat: 'furn' });
  guardLoop(K, [[-48, 3], [30, 3], [32, -14, 5], [20, -34, 8], [-30, -36, 8], [-48, -18, 5]], [[-36, 0], [22, 0, 2], [22.5, -11, 4], [14, -28, 6], [-26, -30, 6], [-37, -16, 4]], 11, 2.2, 'stamp');
  triggerPart(K, [0, 2, -2], { face: 'curved', len: 22, w: 8.5 });
  const hr = longGrip(K, { z: -62, y: 2, ang: .28, len: 98, w: 32, f: 16, b: 22, mat: 'grip', grooves: v === 'varg' });
  K.part('charging', { pivot: P3(w / 2, yB - 6, 110) });
  K.mat('metal').extrude(SH(K, [[-6, -4], [6, -4, 2], [6, 4, 2], [-6, 4, 2]], .4), D(16), { p: P3(w / 2 + 8, yB - 6, 110), b: D(1.4), bs: 2 });
  K.use('body');
  bipodPart(K, { z: gz + 14, yb: yB - 18, len: 190 });
  // ammunition: pouch (fabric, left) or box (steel, right) + belt into the feed tray
  const side = v === 'varg' ? -1 : 1, bs = ctx.intr.mag && ctx.intr.mag.model.kind === 'beltbox' ? 1.32 : 1;
  K.part('mag', { pivot: P3(side * w / 2, 10, 30) });
  K.at({ p: P3(side * w / 2, 10, 30), s: [1, bs, bs] }, () => K.at({ p: P3(-side * w / 2, -10, -30) }, () => {
  if (v === 'varg') {
    K.mat('fabric').extrude(SH(K, [[-50, -8, 10], [60, -8, 10], [64, -96, 14], [-46, -100, 14]], 1.2), D(84), { off: -D(w / 2 + 70), b: D(10), bs: K.lod ? 1 : 3 });
    K.mat('fabric').extrude(SH(K, [[-46, -4, 8], [58, -4, 8], [58, 6, 4], [-46, 6, 4]], .6), D(80), { off: -D(w / 2 + 68), b: D(3), bs: 2 });
    for (const zz of [-26, 34]) K.mat('fabric_blk').box(D(2), D(84), D(14), { p: P3(-w / 2 - 70, -46, zz), b: D(.6) });
    const bp = []; for (let k = 0; k < 7; k++) { const t = k / 6; bp.push([[-w / 2 - 34 + t * 20, 8 + t * 22, 0 + t * 30], [0, 0, -.6 + t * .6]]); }
    beltAlong(K, bp, '556');
  } else {
    K.mat('stamp').extrude(SH(K, [[-60, 0, 3], [70, 0, 3], [70, -110, 4], [-60, -110, 4]], .6), D(76), { off: D(w / 2 + 6), b: D(2.4), bs: 2 });
    K.mat('stamp').extrude(SH(K, [[-62, 0], [72, 0], [72, 6, 2], [-62, 6, 2]], .4), D(80), { off: D(w / 2 + 4), b: D(1), bs: 1 });
    K.mat('metal').sweep([P3(w / 2 + 44, 6, -40), P3(w / 2 + 44, 22, -20), P3(w / 2 + 44, 22, 30), P3(w / 2 + 44, 6, 50)], { rad: D(3), segs: 8 });
    const bp = []; for (let k = 0; k < 7; k++) { const t = k / 6; bp.push([[w / 2 + 30 - t * 20, 8 + t * 24, 10 + t * 20], [0, 0, .6 - t * .6]]); }
    beltAlong(K, bp, '762r');
  }
  }));
  K.use('body');
  // stock: collapsible (varg) or laminated skeleton (kuznets)
  if (S.stock === 'skeleton') {
    K.mat('wood').extrude(SH(K, [[zR + 4, 54], [zR - 260, 34, 10], [zR - 300, 40, 10], [zR - 304, -76, 12], [zR - 270, -84, 10], [zR - 180, -40, 20], [zR - 40, 6, 10], [zR + 4, 8]], 1.4), D(40), { b: D(6), bs: K.lod ? 1 : 3, holes: [SH(K, [[zR - 50, 32, 10], [zR - 236, 18, 14], [zR - 270, -50, 12], [zR - 196, -24, 18]], 1)] });
    K.mat('stamp').extrude(SH(K, [[zR - 300, 42, 6], [zR - 306, 42], [zR - 310, -78], [zR - 304, -80, 6]], .5), D(42), { b: D(1.4), bs: 1 });
  } else bufferStock(K, { z0: zR, y: 44, len: 210, mat: 'furn', tube: 'stamp', w: 46, h: 104 });
  K.node('belt', P3(side * w / 2, 30, 40), [0, 0, 0]);
  sockets(K, { optic: S.rail !== false ? [[0, top + 11, -12], 'cover'] : null, muzzle: [[0, yB, zM]], under: [[0, yB - 44, zF + 70]], side: [[w / 2 - 2, yB - 33, zF + 70]], mag: [[side * w / 2, 10, 30]], stock: [[0, 44, zR]], barrel: [[0, yB, zF]] });
  muzzleNode(K, yB, zM + fhL + 1.2); ejectNode(K, [-side * w / 2, yB - 14, -10], v === 'varg' ? 'down' : 'left');
  handNodes(K, hr, { p: [0, yB - 40, zF + 70], kind: 'hold' });
  sightMeta(K, [0, sLine, fz], [0, sLine, cz0 + 7], 85);
};

BUILDERS.lmgMag = (K, S, gun, ctx) => {
  // squad automatic on an AK-pattern action: heavy long barrel, front sight base + bipod, 75-round drum, club-foot wood stock
  const bmm = barrelMod(ctx), yB = 34, top = 50, zR = -120, zF = 112, zM = zF + (S.barrel || 590) - 60 + bmm.ext; K.meta.barrelDone = true;
  akReceiver(K, { zR, zF, top, w: 31, rail: false });
  K.mat('barrel').lathe(mmP([[6, zF - 4], [12, zF - 4], [12, zF + 30, 1], [10.4, zF + 36], [10, zM - 2], [9.2, zM]]), { p: P3(0, yB, 0), segs: 26 });
  K.part('muzzleDev', { pivot: P3(0, yB, zM), meta: { replace: 'muzzle' } }); K.mat('barrel').lathe(mmP([[6, zM - 2], [12, zM - 2, 1], [12.4, zM], [12.4, zM + 44, 1], [11, zM + 46, 1], [6, zM + 46], [6, zM + 40]]), { p: P3(0, yB, 0), segs: 24 });
  if (K.detail(0)) for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) K.mat('bore').box(D(2), D(8), D(7), { p: P3(sx * 12, yB, zM + 10 + k * 11), b: 0, ao: .4 });
  K.mat('bore').cyl(D(5.8), D(1), { p: P3(0, yB, zM + 45.4), segs: 12 }); K.use('body');
  const gz = zF + 260, sLine = top + 14;
  K.mat('stamp').extrude(SH(K, [[gz - 14, yB - 12], [gz + 14, yB - 12, 2], [gz + 14, yB + 30, 3], [gz - 10, yB + 30, 3], [gz - 14, yB + 22]], .6), D(26), { b: D(1.6), bs: 2 });
  K.mat('stamp').lathe(mmP([[0, zF + 10], [9, zF + 10], [9, gz - 12, 1], [0, gz - 12]]), { p: P3(0, yB + 20, 0), segs: 20 });
  const fz = zM - 24;
  K.mat('stamp').extrude(SH(K, [[fz - 12, yB - 14], [fz + 12, yB - 14, 3], [fz + 12, sLine - 6, 3], [fz - 8, sLine - 6, 3], [fz - 12, yB + 10]], .6), D(20), { b: D(1.6), bs: 2 });
  K.mat('stamp').extrude(SH(K, [[-9, 0], [9, 0], [9, 6, 2], [5, 12, 2], [3, 12], [3, 3], [-3, 3], [-3, 12], [-5, 12, 2], [-9, 6, 2]], .5), D(8), { plane: 'xy', off: D(fz - 4), p: P3(0, sLine - 9, 0), b: D(.5), bs: 1 });
  K.mat('metal').extrude(SH(K, [[-1.3, 0], [1.3, 0], [1.1, 7, .3], [-1.1, 7, .3]], .3), D(2.6), { plane: 'xy', off: D(fz - 1.3), p: P3(0, sLine - 7, 0), b: D(.2), bs: 1 });
  K.mat('stamp').extrude(SH(K, [[-7, -1], [7, -1], [7, 8, 1], [1.6, 13], [1.6, 11], [-1.6, 11], [-1.6, 13], [-7, 8, 1]], .4), D(18), { plane: 'xy', off: D(zF - 12), p: P3(0, sLine - 11, 0), b: D(.4), bs: 1 });
  // wooden handguards (lower + upper over the gas tube)
  const lw = [[-19, yB + 8], [-19, yB - 12, 8], [19, yB - 12, 8], [19, yB + 8], [12, yB + 8], [12, yB - 4, 4], [-12, yB - 4, 4], [-12, yB + 8]];
  cs(K, csMM2(SH(K, lw, .6)), zF + 4, zF + 170, 0, { bb: 4, bf: 4, mat: 'wood' });
  cs(K, csMM2(SH(K, [[-13, yB + 13], [13, yB + 13], [13, yB + 22, 5], [-13, yB + 22, 5]], .6)), zF + 20, zF + 150, 0, { bb: 3, bf: 3, mat: 'wood' });
  bipodPart(K, { z: zM - 60, yb: yB + 2, len: 170, back: true });
  guardLoop(K, [[-28, -1], [30, -1], [31, -14, 4], [22, -28, 6], [-12, -30, 7], [-28, -16, 5]], [[-19, -4], [24, -4, 2], [24.5, -11, 4], [17, -23, 5], [-9, -24.5, 5], [-19.5, -14, 4]], 8, 1.8, 'stamp');
  triggerPart(K, [0, 2, 2], { face: 'curved', len: 18, w: 7 });
  const hr = longGrip(K, { z: -48, y: -1, ang: .32, len: 96, w: 30, f: 15, b: 21, mat: 'wood' });
  // 75-round drum (part), or the fitted magazine variant: twin drum (g_100) / coupled 40-round boxes (g_fast) / longer box (ext)
  if (ctx.intr.mag) rmag(K, { kind: 'ak', top: [58, 2], rake: .02, variant: ctx.intr.mag.model.kind === 'drum' ? null : ctx.intr.mag });
  else {
  K.part('mag', { pivot: P3(0, 0, 58) });
  K.mat('mag').extrude(SH(K, [[40, 2], [76, 2], [76, -30, 3], [40, -30, 3]], .6), D(26), { b: D(1.6), bs: 2 });
  K.mat('mag').lathe(mmP([[0, -30], [70, -30, 2], [74, -27, 2], [74, 27, 2], [70, 30, 2], [0, 30]]), { axis: 'x', p: P3(0, -92, 60), segs: 44, crease: 35 });
  if (K.detail(0)) for (const sx of [-1, 1]) { K.mat('mag').lathe(mmP([[0, 0], [50, 0, 1], [56, 2, 1], [56, 4], [0, 5]]), { axis: sx > 0 ? 'x' : '-x', p: P3(sx * 30, -92, 60), segs: 36 }); for (let k = 0; k < 8; k++) { const a = k * TAU / 8; K.mat('mag').box(D(2), D(4), D(40), { p: P3(sx * 33.5, -92 + Math.sin(a) * 34, 60 + Math.cos(a) * 34), r: [-a + HALF, 0, 0], b: D(1) }); } }
  K.mat('metal').extrude(SH(K, [[-6, -12], [6, -12], [6, 12, 3], [-6, 12, 3]], .4), D(4), { p: P3(34, -92, 60), b: D(1), bs: 2 });
  K.use('body');
  }
  // club-foot wooden stock + butt plate
  const rows = [];
  for (let k = 0; k <= (K.lod ? 5 : 12); k++) {
    const t = k / (K.lod ? 5 : 12), z = zR - 2 - t * 330, yt = 44 - t * 16, hgt = 40 + t * 70 + (t > .55 ? Math.sin((t - .55) / .45 * Math.PI) * 26 : 0) * 0;
    const yb2 = yt - hgt - (t > .5 && t < .85 ? -Math.sin((t - .5) / .35 * Math.PI) * 16 : 0);
    const hw = 16 + t * 5;
    rows.push(ovalPts(yt - yb2, hw, hw * .7, hw * .85, K.lod ? 2 : 3).map(([sv, x]) => [D(x), D(yb2 + sv), D(z), 0]));
  }
  K.mat('wood').loft3(rows, { crease: 55, uvSwap: true });
  K.mat('stamp').extrude(SH(K, [[zR - 334, 30, 3], [zR - 338, 30], [zR - 338, -82], [zR - 334, -82, 3]], .4), D(44), { b: D(1), bs: 1 });
  akSideMount(K, { z0: -96, z1: 24, w: 31, top, yRail: top + 10 });
  sockets(K, { optic: [[0, top + 19, -36]], muzzle: [[0, yB, zM]], under: [[0, yB - 12, zF + 90]], side: [[19, yB - 2, zF + 90]], mag: [[0, 0, 58]], stock: [[0, 30, zR]], barrel: [[0, yB, zF]] });
  muzzleNode(K, yB, zM + 46.2); ejectNode(K, [16, top - 18, 20]);
  handNodes(K, hr, { p: [0, yB - 10, zF + 90], kind: 'hold' });
  sightMeta(K, [0, sLine, fz], [0, sLine, zF - 12], 300);
};

const sm = t => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
const csMM2 = pts => pts.map(p => [p[0] * 1000, p[1] * 1000, p[2] || 0]);

// ---- generic fallback (guns without a MODEL_SPECS entry yet): a plain but correctly sized long gun / pistol ----
function genericSpec(gun) { return { b: 'generic', pal: paletteFor(gun) }; }
BUILDERS.generic = (K, S, gun) => {
  const m = gun.model || {}, L = (m.length || .8) * 1000, bl = (m.barrel || .4) * 1000, pistol = gun.slot === 'secondary', yB = pistol ? 26 : 22;
  if (pistol) {
    K.mat('slide').box(D(25), D(28), D(L), { p: P3(0, 26, L * .6 - L / 2 + 10), b: D(2) });
    K.mat('frame').extrude(SH(K, gripOutline({ top: [-30, 2], ang: .35, len: 95, front: () => 13, back: () => 18 }), 1), D(29), { b: D(6), bs: 3 });
    sockets(K, { optic: [[0, 40, 0]], muzzle: [[0, yB, L * .6 - L / 2 + 10 + L / 2]], side: [[0, -2, 40], null, [0, 0, Math.PI]], mag: [[0, -2, -30]] });
    muzzleNode(K, yB, L * .6 - L / 2 + 10 + L / 2); ejectNode(K, [13, 30, 20]);
    handNodes(K, { p: [0, -40, -45], ang: .35 }, { p: [-22, -45, -40], kind: 'support' });
    sightMeta(K, [0, 44, L * .5], [0, 44, -60], 300); return;
  }
  const zr = -L * .32, zm = zr + L;
  K.mat('rcv').box(D(26), D(40), D(L * .38), { p: P3(0, 20, zr + 60 + L * .19), b: D(2) });
  K.mat('barrel').cyl(D(9), D(bl), { p: P3(0, yB, zm - bl), segs: 20 });
  K.mat('furn').box(D(40), D(44), D(L * .28), { p: P3(0, 12, zr + L * .14), b: D(3) });
  K.mat('furn').extrude(SH(K, gripOutline({ top: [-25, 0], ang: .3, len: 90, front: () => 12, back: () => 18 }), 1), D(28), { b: D(6), bs: 3 });
  K.part('mag', { pivot: P3(0, 0, 25) }); K.mat('mag').box(D(22), D(110), D(36), { p: P3(0, -50, 25), b: D(2) }); K.use('body');
  sockets(K, { optic: [[0, 41, 30]], muzzle: [[0, yB, zm]], under: [[0, 6, zm - bl * .6]], side: [[14, yB, zm - bl * .6]], mag: [[0, 0, 25]], stock: [[0, 20, zr + 60]], barrel: [[0, yB, zr + 60 + L * .38]] });
  muzzleNode(K, yB, zm); ejectNode(K, [13, 30, 40]);
  handNodes(K, { p: [0, -40, -40], ang: .3 }, { p: [0, 4, zm - bl * .55], kind: 'hold' });
  sightMeta(K, [0, 50, zm - 40], [0, 50, zr + 70], 90);
};

// =========================================================================================================================
// MODEL_SPECS (mm unless noted). See docs §5 for the format.
Object.assign(MODEL_SPECS, {
  vogt9: { b: 'striker', pal: 'polymer', wear: .55, mats: { slide: 'nitride', frame: 'poly_blk', grip: 'poly_grp', mag: 'poly_blk', metal: 'dksteel', barrel: 'dksteel' },
    slide: { z0: -70, len: 186, h: 28.5, w: 25.4, ch: 4.2, nose: 8, serrR: { z0: -64, n: 9, gw: 1.6, rw: 1.7 }, port: [5, 43], optic: [-52, -18, 3.2], frontDot: 'white', rearDots: 'white' },
    frame: { wd: 23.6, zd0: 30, railSlots: 1, guard: 'square', ang: .37, gh: 100, gw: 30.5, gripBevel: 8.5, beaver: 7, cal: '9' }, trigger: 'curved' },
  ridgeback: { b: 'striker', pal: 'polymer', wear: .7, mats: { slide: 'nitride', frame: 'poly_fde', grip: 'poly_fdeg', mag: 'dksteel', metal: 'dksteel', barrel: 'dksteel' },
    slide: { z0: -73, len: 194, h: 29.5, w: 26.2, ch: 3.0, nose: 11, noseIn: 2.4, serrR: { z0: -67, n: 8, gw: 2.1, rw: 1.7 }, serrF: { z0: 71, n: 6, gw: 1.9, rw: 1.8 }, serrDepth: .95,
      port: [5, 45], optic: [-56, -21, 3.6], topPorts: [[82, 9], [96, 9]], topW: 8.5, frontDot: 'fibre_g', rearDots: 'trit', rearH: 7.6, notch: 2.6, rearW: 20.5, barrelR: 7.3, bore: 27 },
    frame: { wd: 24.6, zd0: 31, railSlots: 3, guard: 'square', guardHook: true, guardSerr: true, ang: .33, gh: 103, gw: 31.6, beaver: 10, cal: '40', baseLip: 3.8, magExt: 4, flare: 2.6,
      frontDepth: 19.5, backDepth: 30, magRel: -20 }, trigger: 'flat', safety: true },
  chispa: { b: 'striker', pal: 'polymer', wear: 1.5, mats: { slide: 'stainless', frame: 'poly_blk', grip: 'poly_grp', mag: 'steel', metal: 'dksteel', barrel: 'steel' },
    slide: { z0: -61, len: 162, h: 27, w: 23.8, ch: 2, round: 1, r: 5.5, nose: 7, serrR: { z0: -56, n: 6, gw: 2.6, rw: 2.6 }, serrDepth: .9,
      port: [3, 37], optic: [-48, -18, 3], frontDot: 'white', rearDots: 'white', rearH: 5.6, rearW: 17.5, barrelR: 6.5, bore: 25.5, rodDy: 10.5, rodR: 3.3, travel: 46 },
    frame: { wd: 22.8, zd0: 26, railSlots: 1, guard: 'round', ang: .41, gh: 80, gw: 29.2, grooves: true, beaver: 4, cal: '9', baseLip: 5.5, magExt: 8, baseH: 7, flare: .6,
      frontDepth: 17.6, backDepth: 27.5, swell: .3 }, trigger: 'curved', safety: true },
  lawman: { b: 'singlestack', pal: 'steel', wear: 1.1, mats: { slide: 'blued', rcv: 'blued', metal: 'blued', barrel: 'blued', mag: 'blued', wood2: 'walnut_chk' },
    slide: { z0: -84, len: 214, h: 29.5, w: 23.4, r: 7.5, nose: 6, noseIn: .8, noseUp: .3, serrR: { z0: -79, n: 14, gw: 1.1, rw: 1.2 }, serrDepth: .7, port: [-2, 38], portBottom: 13, bore: 27.5 },
    frame: { ang: .3, gh: 96, gw: 24.4, hammer: 'spur', mshMat: 'blued_k', trigHoles: false } },
  constable: { b: 'revolver', pal: 'steel', wear: 1.0, mats: { rcv: 'blued', barrel: 'blued', metal: 'blued', wood2: 'walnut_chk' }, cylLen: 39.5, cylR: 18.2, barrel: 102, bR: 8,
    ang: .5, gh: 80, grip: { mat: 'wood2', round: true, w: 33, medallion: true }, cal: '38', trigW: 8 },
  sovereign: { b: 'revolver', pal: 'steel', wear: .6, mats: { rcv: 'stainless', barrel: 'stainless', metal: 'stainless', bright: 'chrome' }, cylLen: 42, cylR: 20, cylDy: 14.5, barrel: 152, bR: 8.8,
    underlug: true, rail: true, frameW: 33.5, insert: 'orange', ang: .45, gh: 92, grip: { mat: 'rubber_g', grooves: true, w: 37 }, cal: '357', trigW: 9.5 },
  ovod: { b: 'machinePistol', pal: 'steel', wear: 1.5, mats: { slide: 'park', rcv: 'park', metal: 'park', barrel: 'park', mag: 'park', stamp: 'park' },
    slide: { z0: -82, len: 210, h: 30, w: 25.5, r: 8.5, nose: 7, noseIn: 1.2, noseUp: .6, serrR: { z0: -64, n: 10, gw: 1.6, rw: 1.8 }, port: [4, 40], bore: 27 } },
  monolith: { b: 'largePistol', pal: 'steel', wear: .55, mats: { slide: 'nitride', rcv: 'alu_gry', barrel: 'nitride', metal: 'dksteel', mag: 'dksteel' } },
  shizuka: { b: 'integralPistol', pal: 'polymer', wear: .35, mats: { rcv: 'nitride', barrel: 'nitride', frame: 'poly_gry', grip: 'poly_gryg', mag: 'dksteel', metal: 'dksteel' } },
  // ---- SMGs
  spatz: { b: 'smgRoller', pal: 'black', wear: .5, mats: { rcv: 'nitride', furn: 'poly_blk', grip: 'poly_grp', mag: 'nitride', barrel: 'nitride', metal: 'dksteel' } },
  hachi: { b: 'pdw', pal: 'polymer', wear: .4, mats: { rcv: 'poly_gry', grip: 'poly_gryg', mag: 'poly_gry', barrel: 'nitride', alu: 'alu_blk', metal: 'dksteel' } },
  roughneck: { b: 'smgClassic', pal: 'wood', wear: 1.2, mats: { rcv: 'blued', barrel: 'blued', metal: 'blued', mag: 'blued', wood: 'walnut' } },
  corvid: { b: 'pdwBullpup', pal: 'polymer', wear: .35, mats: { frame: 'poly_gry', grip: 'poly_gryg', rcv: 'nitride', barrel: 'nitride', metal: 'dksteel' } },
  torsion: { b: 'smgOffset', pal: 'black', wear: .45, mats: { rcv: 'poly_blk', frame: 'poly_blk', grip: 'poly_grp', mag: 'poly_blk', alu: 'alu_blk', barrel: 'nitride' } },
  avispa: { b: 'smgStamped', pal: 'park', wear: 1.6, mats: { stamp: 'park', grip: 'poly_brn', mag: 'park', barrel: 'park', metal: 'dksteel' } },
  nightjar: { b: 'smgIntegral', pal: 'black', wear: .7, mats: { rcv: 'blued', furn: 'poly_od', grip: 'poly_od', mag: 'blued', alu: 'alu_blk', metal: 'blued' } },
  pulga: { b: 'smgMicro', pal: 'park', wear: 1.4, mats: { stamp: 'park', grip: 'poly_grp', mag: 'park', barrel: 'park', fabric: 'fabric_blk' } },
  // ---- shotguns
  cacciatore: { b: 'shotgunTube', pal: 'wood', wear: 1.0, mats: { rcv: 'blued', barrel: 'blued', metal: 'blued', wood: 'walnut', wood2: 'walnut_chk' }, pump: true, barrel: 510, tube: 335, rib: true, midBead: true, forend: 'wood', stock: 'wood', stockLen: 350, engrave: true },
  breachpoint: { b: 'shotgunTube', pal: 'park', wear: .9, mats: { rcv: 'park', barrel: 'park', metal: 'dksteel', furn: 'poly_fde', grip: 'poly_fdeg', alu: 'alu_blk' }, pump: true, barrel: 470, tube: 300, ghost: true, fibre: 'fibre_g', rail: true, saddle: true, forend: 'poly', forendLen: 170, stock: 'collapsible', hull: 'paint_red' },
  tempesta: { b: 'shotgunTube', pal: 'black', wear: .5, mats: { rcv: 'alu_blk', barrel: 'nitride', metal: 'dksteel', furn: 'poly_blk', grip: 'poly_grp', groupMat: 'poly_blk' }, pump: false, gas: true, charging: true, barrel: 470, tube: 300, ghost: true, rail: true, forend: 'poly', forendLen: 220, stock: 'collapsible', rw: 32 },
  raskat: { b: 'shotgunDrum', pal: 'polymer', wear: 1.2, mats: { stamp: 'park', barrel: 'park', furn: 'poly_blk', grip: 'poly_grp', mag: 'poly_blk', metal: 'dksteel', bright: 'steel' } },
  gemelli: { b: 'shotgunBreak', pal: 'wood', wear: .8, mats: { rcv: 'casehard', barrel: 'blued', metal: 'blued', wood: 'walnut', wood2: 'walnut_chk' } },
  drover: { b: 'shotgunLever', pal: 'wood', wear: 1.2, mats: { rcv: 'casehard', barrel: 'blued', metal: 'blued', wood: 'walnut' } },
  // ---- machine guns
  varg: { b: 'beltLmg', pal: 'black', wear: .8, variant: 'varg', mats: { stamp: 'alu_gry', barrel: 'park', furn: 'poly_od', grip: 'poly_od', metal: 'dksteel', fabric: 'fabric_od', handleMat: 'poly_od' }, barrel: 465, bR: 11, gasAt: 250 },
  kuznets: { b: 'beltLmg', pal: 'steel', wear: 1.3, variant: 'kuznets', mats: { stamp: 'park', barrel: 'park', furn: 'poly_brn', grip: 'bakelite', metal: 'park', wood: 'laminate' }, barrel: 605, bR: 10.5, rail: true, flutes: true, stock: 'skeleton', fhLen: 82, fhSlots: 4, gasAt: 330, handleMat: 'laminate', rw: 40 },
  mula: { b: 'lmgMag', pal: 'wood', wear: 1.5, mats: { stamp: 'park', barrel: 'park', metal: 'park', mag: 'park', wood: 'beech' }, barrel: 590 },
});
/*@@END_SPECS@@*/

// =========================================================================================================================
// PART B — rifles, carbines, battle rifles, DMRs and sniper rifles (24 guns), every attachment of attachments.js, melee weapons.
// Same conventions as above: millimetres through D / P3 / SH / cs, origin at the trigger, +Z muzzle, parts = moving nodes.
/*@@PARTB@@*/
const LP = pts => pts.map(p => [D(p[0]), D(p[1]), (p[2] || 0) * .3]);    // lathe profile in mm (wear flag 1 -> a light edge wear)
// extra materials (lenses, displays, blades, field kit) and the matching default roles
Object.assign(MATS, {
  lens:        { a: '#0c1a22', m: .55, r: .03, alpha: .62 },                 // multi-coated objective / ocular glass
  lens_ge:     { a: '#15121c', m: .7, r: .08 },                              // germanium thermal objective (opaque, purple-grey)
  window:      { a: '#2a3a34', m: .2, r: .02, alpha: .28 },                  // reflex / holographic window (slight tint)
  screen:      { a: '#020403', m: 0, r: .25, e: '#24301f', ei: .6 },         // thermal display (glowing dark)
  laminate_dk: { tex: 'laminate', tint: '#a07c68', ts: .2, m: 0, r: .4, n: 'wood', ns: .3, nl: .2, rm: 'wood', rs: .3, wear: ['#a8704a', 0, .55] },
  blade:       { a: '#9fa1a4', m: 1, r: .26, n: 'brush', ns: .05, nl: .18, rm: 'smudge', wear: ['#c9cacc', 1, .16] },
  blade_blk:   { a: '#202124', m: .6, r: .5, n: 'cast', ns: .02, nl: .2, wear: ['#c4c5c8', 1, .2] },
  edge:        { a: '#c8cacd', m: 1, r: .14, n: 'brush', ns: .02, nl: .3 },
  g10:         { a: '#2c2e2a', m: 0, r: .62, n: 'stipple', ns: .01, nl: .7, wear: ['#4e524a', 0, .7] },
  cord:        { a: '#2e3326', m: 0, r: .9, n: 'fabric', ns: .004, nl: 1 },
  canvas:      { a: '#5c5a44', m: 0, r: .95, n: 'fabric', ns: .008, nl: .9 },
  tape:        { a: '#1b1b1a', m: 0, r: .55, n: 'poly', ns: .02, nl: .3 },
  kraft:       { a: '#a8875c', m: 0, r: .8, n: 'fabric', ns: .02, nl: .3 },
  led_r:       { a: '#300400', m: 0, r: .3, e: '#ff2a10', ei: 3 },
  led_g:       { a: '#033000', m: 0, r: .3, e: '#38ff44', ei: 2.4 },
  emit_w:      { a: '#ffffff', m: 0, r: .2, e: '#fff6dc', ei: 1.6 },
});
Object.assign(BASE_PAL, { lens: 'lens', window: 'window', screen: 'screen', lens_ge: 'lens_ge', edge: 'edge', led: 'led_r', emit: 'emit_w' });
const CSX = (K, pts, fall = .6) => csMM2(SH(K, pts, fall));                // filleted cross-section (mm in, mm out) for cs()
Object.assign(CAL, {
  '545': { d: 10, len: 39.8, bl: 14, neck: 6.3, bottle: true, shoulder: 8 }, '300': { d: 9.6, len: 34.7, bl: 16, neck: 8.4, bottle: true, shoulder: 5 },
  '308': { d: 11.9, len: 51.2, bl: 18, neck: 8.7, bottle: true, shoulder: 9 }, '68': { d: 12, len: 51, bl: 17, neck: 7.8, bottle: true, shoulder: 9 },
  '338': { d: 14.9, len: 69.2, bl: 24, neck: 9.4, bottle: true, shoulder: 12 }, '50bmg': { d: 20.4, len: 99, bl: 38, neck: 14.2, bottle: true, shoulder: 16 },
  '939': { d: 11.3, len: 38.7, bl: 24, neck: 9.6, bottle: true, shoulder: 7 },
});
/** annulus sector outline (mm): outer arc a0 -> a1, inner arc back */
function annSector(ri, ro, a0, a1, n) {
  const o = []; for (let k = 0; k <= n; k++) { const a = a0 + (a1 - a0) * k / n; o.push([Math.cos(a) * ro, Math.sin(a) * ro]); }
  for (let k = n; k >= 0; k--) { const a = a0 + (a1 - a0) * k / n; o.push([Math.cos(a) * ri, Math.sin(a) * ri]); } return o;
}
/** tube section with real slots cut through the wall (prongs between slots are extrusions along z). slots = [[angle rad, width mm]] */
function slotted(K, { z0, len, ri, ro, slots, y = 0, x = 0, mat = 'barrel', b = .4 }) {
  if (!slots.length || !K.detail(1)) { K.mat(mat).lathe(LP([[ri, z0], [ro, z0], [ro, z0 + len], [ri, z0 + len], [ri, z0]]), { p: P3(x, y, 0), segs: 28, crease: 40 }); return; }
  const S = slots.map(([a, w]) => [((a % TAU) + TAU) % TAU, w / 2 / ro]).sort((p, q) => p[0] - q[0]);
  for (let i = 0; i < S.length; i++) {
    const nx = S[(i + 1) % S.length], a0 = S[i][0] + S[i][1], a1 = (i + 1 < S.length ? nx[0] : nx[0] + TAU) - nx[1];
    if (a1 - a0 < .04) continue;
    const n = Math.max(1, Math.round((a1 - a0) / TAU * K.seg(32)));
    K.mat(mat).extrude(csMM(annSector(ri, ro, a0, a1, n)), D(len), { plane: 'xy', off: D(z0), p: P3(x, y, 0), b: D(b), bs: 1, crease: 40 });
  }
}
/** ring / short tube along z (mm) with chamfered ends */
const ring = (K, { z0, len, ri, ro, y = 0, x = 0, mat = 'barrel', ch = .6, segs = 28 }) => K.mat(mat).lathe(LP([[ri + ch, z0, 1], [ro - ch, z0, 1], [ro, z0 + ch, 1], [ro, z0 + len - ch, 1], [ro - ch, z0 + len, 1], [ri + ch, z0 + len, 1], [ri, z0 + len - ch], [ri, z0 + ch], [ri + ch, z0, 1]]), { p: P3(x, y, 0), segs, crease: 40 });

/** muzzle device on a thread at z (mm), local +Z out. kind: a2 prong g3 slotted brake ak74 ak47 booster am comp flash choke can-endcap.
    Goes into part `part` (meta.replace 'muzzle': setMods hides it under a muzzle attachment); returns its length (mm). */
function mdev(K, kind, { z = 0, y = 0, mat = 'barrel', part = 'muzzleDev', s = 1 } = {}) {
  if (!kind || kind === 'crown' || kind === 'none' || kind === 'integral') return 0;
  if (part) K.part(part, { pivot: P3(0, y, z), meta: { replace: 'muzzle' } });
  let L = 0;
  K.at({ p: P3(0, y, z), s }, () => {
    const bore = (K2, zz, r = 3.4) => K2.mat('bore').disc(D(r), D(.6), { p: P3(0, 0, zz - .4), segs: 14 });
    if (kind === 'a2' || kind === 'flash') {          // birdcage: closed bottom (compensating), 5 slots
      L = kind === 'flash' ? 60 : 56; const ro = 10.8, ri = 7.6;
      K.mat(mat).lathe(LP([[3.6, 0], [ro - 1.2, 0, 1], [ro, 1.4, 1], [ro, 19, 1], [ro - .5, 20], [ro - .5, 22], [ri, 22]]), { segs: 28, crease: 40 });
      if (K.detail(0)) for (const sx of [-1, 1]) K.mat(mat).box(D(2), D(9), D(12), { p: P3(sx * (ro - .6), 0, 9), b: D(.3) });   // wrench flats
      const sl = kind === 'flash' ? [[HALF, 3.2], [HALF + 1.26, 3.2], [HALF - 1.26, 3.2], [HALF + 2.51, 3.2], [HALF - 2.51, 3.2]] : [[HALF, 3.2], [HALF + 1.05, 3.2], [HALF - 1.05, 3.2], [HALF + 1.95, 3.2], [HALF - 1.95, 3.2]];
      slotted(K, { z0: 22, len: L - 27, ri, ro, slots: sl, mat });
      ring(K, { z0: L - 5, len: 5, ri, ro, mat, ch: .9 });
    } else if (kind === 'prong' || kind === 'g3') {    // 3 open prongs / 4 slots with a front ring
      L = kind === 'g3' ? 60 : 58; const ro = 11, ri = 7.8, open = kind === 'prong';
      K.mat(mat).lathe(LP([[3.6, 0], [ro - 1.2, 0, 1], [ro, 1.4, 1], [ro, 20, 1], [ri, 21]]), { segs: 28, crease: 40 });
      slotted(K, { z0: 20, len: L - 20 - (open ? 0 : 6), ri, ro, slots: open ? [[HALF, 6], [HALF + TAU / 3, 6], [HALF - TAU / 3, 6]] : [[HALF / 2, 4.5], [HALF * 1.5, 4.5], [HALF * 2.5, 4.5], [HALF * 3.5, 4.5]], mat, b: open ? .9 : .4 });
      if (!open) ring(K, { z0: L - 6, len: 6, ri, ro, mat, ch: 1 });
    } else if (kind === 'slotted') {                   // long 5-slot flash hider (marksman rifles)
      L = 78; const ro = 11.4, ri = 8;
      K.mat(mat).lathe(LP([[3.8, 0], [ro - 1.2, 0, 1], [ro, 1.4, 1], [ro, 15], [ri, 16]]), { segs: 28, crease: 40 });
      slotted(K, { z0: 15, len: 56, ri, ro, slots: [0, 1, 2, 3, 4].map(k => [HALF + k * TAU / 5, 3.4]), mat });
      ring(K, { z0: 71, len: 7, ri, ro, mat, ch: 1 });
    } else if (kind === 'brake' || kind === 'comp') {  // ported brake (side windows) / compensator (top ports + side)
      const comp = kind === 'comp'; L = comp ? 55 : 66; const ro = comp ? 12 : 12.8, ri = 6.4, P = comp ? [[10, 18], [24, 32], [38, 46]] : [[12, 22], [28, 38], [44, 54]];
      let zz = 0;
      K.mat(mat).lathe(LP([[3.6, 0], [ro - 1.4, 0, 1], [ro, 1.6, 1], [ro, P[0][0]], [ri, P[0][0]]]), { segs: 30, crease: 40 });
      for (let k = 0; k < P.length; k++) {
        const [a, b2] = P[k]; slotted(K, { z0: a, len: b2 - a, ri, ro, slots: comp ? [[HALF, 9 - k * 2]] : [[0, 15], [Math.PI, 15]], mat });
        zz = k + 1 < P.length ? P[k + 1][0] : L; ring(K, { z0: b2, len: zz - b2, ri, ro, mat, ch: k + 1 < P.length ? .4 : 1.4 });
      }
      if (comp && K.detail(0)) for (const sx of [-1, 1]) K.mat('bore').box(D(1), D(5), D(9), { p: P3(sx * (ro - .3), 0, 41), b: 0, ao: .4 });
      bore(K, L, ri);
    } else if (kind === 'ak74') {                      // cylindrical two-port brake with a slanted front and top holes
      L = 58; const ro = 12, ri = 6;
      K.mat(mat).lathe(LP([[3.6, 0], [ro - 1.4, 0, 1], [ro, 1.6, 1], [ro, 12], [ro - .8, 13], [ro - .8, 15], [ro, 16], [ro, 20], [ri, 20]]), { segs: 30, crease: 40 });
      slotted(K, { z0: 20, len: 16, ri, ro, slots: [[0, 13], [Math.PI, 13]], mat });
      const rowA = [], rowB = [], n = K.seg(30);
      for (let k = 0; k < n; k++) { const a = TAU * k / n; rowA.push([D(Math.cos(a) * ro), D(Math.sin(a) * ro), D(36)]); rowB.push([D(Math.cos(a) * ro), D(Math.sin(a) * ro), D(L - 9 + 9 * Math.max(0, -Math.cos(a + .6)))]); }
      K.mat(mat).loft3([rowA, rowB], { crease: 40 });
      if (K.detail(0)) for (const zz of [42, 48]) K.mat('bore').disc(D(1.6), D(.6), { p: P3(-3, ro - .25, zz), r: [-HALF, 0, 0], segs: 10 });
      bore(K, L - 4, ri);
    } else if (kind === 'ak47') {                      // short slant-cut compensator
      L = 26; const ro = 11.5, n = K.seg(30), A = [], Bq = [];
      for (let k = 0; k < n; k++) { const a = TAU * k / n; A.push([D(Math.cos(a) * ro), D(Math.sin(a) * ro), 0]); Bq.push([D(Math.cos(a) * ro), D(Math.sin(a) * ro), D(17 + 9 * (1 + Math.cos(a)) / 2)]); }
      K.mat(mat).loft3([A, Bq], { crease: 40 });
      bore(K, 18.5, 5.4);
    } else if (kind === 'booster') {                   // conical expansion chamber (short carbines)
      L = 76;
      K.mat(mat).lathe(LP([[3.8, 0], [10.6, 0, 1], [11.6, 1.5, 1], [11.6, 14, 1], [10.8, 15.5], [11.8, 17], [13.4, 24, 1], [13.4, 30, 1], [15.6, 50], [16.2, 66, 1], [15.4, 76, 1], [12.8, 76], [12.8, 72], [9, 60], [6.2, 42], [6.2, 20], [3.8, 18]]), { segs: 32, crease: 30 });
      if (K.detail(0)) K.mat('metal').box(D(3), D(4), D(9), { p: P3(0, -12.8, 8), b: D(.6) });
    } else if (kind === 'am') {                        // anti-materiel two-chamber brake, side windows (u = z, v = y)
      L = 118;
      K.mat(mat).lathe(LP([[6, 0], [17, 0, 1], [18, 2, 1], [18, 16, 1], [6, 16]]), { segs: 30, crease: 40 });
      const out = SH(K, [[14, -22, 4], [118, -22, 5], [118, 22, 5], [14, 22, 4]], 1);
      const win = K.detail(1) ? [SH(K, [[24, -15, 3], [56, -15, 3], [56, 15, 3], [24, 15, 3]], .6), SH(K, [[66, -15, 3], [104, -15, 3], [104, 15, 3], [66, 15, 3]], .6)] : [];
      K.mat(mat).extrude(out, D(60), { b: D(2.4), bs: 2, holes: win });
      if (K.detail(0)) for (const zz of [61, 111]) K.mat('bore').box(D(54), D(4), D(1), { p: P3(0, 0, zz), b: 0, ao: .3 });
      bore(K, 118.2, 8);
    } else if (kind === 'choke') {                     // extended shotgun choke: knurled ring + ported tip
      L = 52; const ro = 12.6, ri = 9;
      K.mat(mat === 'barrel' ? 'blued_k' : mat).lathe(LP([[ri, 0], [ro, 0, 1], [ro, 14, 1], [ri, 14]]), { segs: 30, crease: 40 });
      K.mat(mat).lathe(LP([[ri, 14], [12, 14], [12, 22, 1], [11.6, 23], [ri, 23]]), { segs: 30, crease: 40 });
      slotted(K, { z0: 23, len: 22, ri, ro: 11.6, slots: [0, 1, 2, 3, 4, 5, 6, 7].map(k => [k * TAU / 8 + .2, 3.2]), mat });
      ring(K, { z0: 45, len: 7, ri, ro: 11.6, mat, ch: 1 });
    }
  });
  if (part) K.use('body');
  return L * s;
}
/** suppressor can along +Z from z0 (mm): QD collar (knurled), body tube, castellated front cap; r = outer radius */
function canGeom(K, { z0 = 0, len = 170, r = 20, y = 0, x = 0, mat = 'rcv', knurl = 'blued_k', front = true, bore = 4.2 }) {
  const at = P3(x, y, 0);
  const n = 34, c1 = Math.min(26, len * .16);
  K.mat(knurl).lathe(LP([[bore + 1.4, z0], [r * .72, z0, 1], [r * .78, z0 + 2, 1], [r * .78, z0 + c1 - 2], [r * .74, z0 + c1], [bore + 1.4, z0 + c1]]), { p: at, segs: n, crease: 40 });
  K.mat(mat).lathe(LP([[r * .74, z0 + c1 - 1], [r - 1.4, z0 + c1, 1], [r, z0 + c1 + 2.2, 1], [r, z0 + len - 14, 1], [r - .3, z0 + len - 13]]), { p: at, segs: n, crease: 40 });
  if (K.detail(0)) for (const zz of [z0 + c1 + 10, z0 + len - 20]) K.mat('bore').lathe(LP([[r + .01, zz], [r - .5, zz + .6], [r + .01, zz + 1.2]]), { p: at, segs: n });
  K.mat(mat).lathe(LP([[r - .3, z0 + len - 13], [r - .6, z0 + len - 12], [r - .6, z0 + len - 4, 1], [r - 2, z0 + len, 1], [r - 3.4, z0 + len]]), { p: at, segs: n, crease: 40 });
  if (front && K.detail(1)) slotted(K, { z0: z0 + len - 1.2, len: 2.4, ri: bore + 2.2, ro: r - 3.4, slots: [0, 1, 2, 3, 4, 5, 6, 7].map(k => [k * TAU / 8, 3]), mat, b: .3, x, y });
  K.mat(mat).lathe(LP([[r - 3.4, z0 + len], [bore + 2.2, z0 + len - .2], [bore, z0 + len - 2], [bore, z0 + len - 30]]), { p: at, segs: 20 });
  K.mat('bore').disc(D(bore), D(.6), { p: P3(x, y, z0 + len - 6), segs: 14 });
}

// ---- magazines ------------------------------------------------------------------------------------------------------
/* rifle magazines: side profile along a curved spine (pivot at the top centre, local -Y = down the spine). kind table (mm):
   len, d (front-back), w, bend (rad), cal, style: stanag (alu, ribs) | pmag (polymer, grip band) | ak (steel, ribs + lug) |
   poly (plum polymer) | box (straight steel) | trans (translucent with visible rounds) | short (bolt-action box) */
const MAGS = {
  stanag: { len: 186, d: 62, w: 22.4, bend: .3, cal: '556', style: 'stanag' },
  pmag:   { len: 188, d: 63, w: 24, bend: .3, cal: '556', style: 'pmag' },
  pmag300:{ len: 188, d: 63, w: 24, bend: .3, cal: '300', style: 'pmag' },
  ar10:   { len: 142, d: 68, w: 25, bend: .05, cal: '308', style: 'pmag' },
  m68:    { len: 150, d: 68, w: 25, bend: .06, cal: '68', style: 'pmag' },
  ak:     { len: 196, d: 70, w: 26, bend: .5, cal: '762', style: 'ak' },
  ak545:  { len: 196, d: 66, w: 25, bend: .42, cal: '545', style: 'poly' },
  g3:     { len: 160, d: 72, w: 25, bend: .07, cal: '308', style: 'box' },
  m14:    { len: 150, d: 72, w: 25, bend: .04, cal: '308', style: 'box' },
  svd:    { len: 112, d: 80, w: 26, bend: .02, cal: '762r', style: 'box' },
  sniper: { len: 92, d: 82, w: 26, bend: 0, cal: '308', style: 'short' },
  sniper338: { len: 106, d: 98, w: 30, bend: 0, cal: '338', style: 'short' },
  bmg:    { len: 112, d: 140, w: 36, bend: 0, cal: '50bmg', style: 'short' },
  trans:  { len: 186, d: 63, w: 24, bend: .3, cal: '556', style: 'trans' },
  pcc:    { len: 170, d: 34, w: 24, bend: .02, cal: '9', style: 'box' },
  vss:    { len: 128, d: 70, w: 26, bend: .06, cal: '939', style: 'box' },
};
function rmag(K, { kind = 'stanag', top, rake = 0, variant = null, mat = 'mag', parent, part = 'mag' }) {
  const T = MAGS[kind] || MAGS.stanag, v = variant && variant.model, vk = v && v.kind;
  K.meta.magExt = K.meta.magCoupled = true;
  if (vk === 'drum' || vk === 'twindrum') { boxMag(K, { top, len: T.len, d: Math.min(T.d, 66), w: T.w, rake, mat, cal: T.cal, variant, part, parent }); return; }
  const ext = vk === 'extmag' ? v.ext * 1000 * (T.len < 120 ? .6 : 1) : 0, L = T.len + ext, d = T.d, w = T.w, bend = T.bend, st = T.style;
  K.part(part, { pivot: P3(0, top[1], top[0]), parent });
  const n = K.lod ? 4 : 12, R = Math.abs(bend) > 1e-4 ? L / bend : 0;
  const C = sv => bend ? [R * (1 - Math.cos(bend * sv / L)), -R * Math.sin(bend * sv / L)] : [0, -sv];
  const N = sv => bend ? [Math.cos(bend * sv / L), -Math.sin(bend * sv / L)] : [1, 0];
  const E = (sv, off) => { const c = C(sv), nn = N(sv); return [c[0] + nn[0] * off, c[1] + nn[1] * off]; };
  const band = (s0, s1, f0, f1, cnt = n) => { const a = [], b = []; for (let k = 0; k <= cnt; k++) { const sv = s0 + (s1 - s0) * k / cnt; a.push([...E(sv, f1), 0]); b.push([...E(sv, f0), 0]); } return [...a, ...b.reverse()]; };
  const steel = st === 'ak' || st === 'box' || st === 'stanag';
  const body = (K2) => {
    const prof = band(0, L, -d / 2, d / 2); prof[n][2] = steel ? 1.6 : 3; prof[n + 1][2] = steel ? 1.6 : 3;
    K2.mat(st === 'trans' ? 'trans' : mat).extrude(SH(K2, prof, .8), D(w), { b: D(steel ? .8 : 1.6), bs: 2 });
    // feed lips + follower / top round
    K2.mat(st === 'trans' ? 'mag' : mat).extrude(SH(K2, [[-d / 2 + 4, 0], [d / 2 - 10, 0], [d / 2 - 12, 4, 1], [-d / 2 + 6, 4, 1]], .4), D(w - 3), { p: P3(0, .2, 0), b: D(.5), bs: 1 });
    const cc = CAL[T.cal]; if (cc) cartridge(K2, cc, { p: P3(0, cc.d / 2 + 1, -d / 2 + 3), segs: 12 });
    if (st === 'trans' && K2.detail(0) && cc) for (let k = 1; k < 13; k++) { const sv = k * (L - 30) / 13, e = E(sv, -d / 2 + 4), a = Math.atan2(N(sv)[1], N(sv)[0]); cartridge(K2, cc, { p: P3((k % 2 ? 1 : -1) * 3.2, e[1] - 2, e[0]), r: [-a, 0, 0], segs: 8 }); }
    // base plate
    const bp = [[...E(L - 2, d / 2 + (steel ? 1.2 : 2)), 0], [...E(L + 5, d / 2 + (steel ? 1.2 : 2.4)), 2], [...E(L + 5, -d / 2 - (steel ? 1.2 : 2.4)), 2], [...E(L - 2, -d / 2 - (steel ? 1.2 : 2)), 0]];
    K2.mat(st === 'trans' ? 'mag' : mat).extrude(SH(K2, bp, .5), D(w + (steel ? 1.6 : 3)), { b: D(1.2), bs: 2 });
    if (!K2.detail(1)) return;
    if (st === 'stanag') {                  // two pressed stiffening ribs per side + spine bead
      for (const f of [-.18, .2]) K2.mat(mat).extrude(SH(K2, band(16, L - 22, f * d - 2.6, f * d + 2.6, n), .4), D(w + 1.2), { b: D(.5), bs: 2 });
    } else if (st === 'pmag' || st === 'poly' || st === 'trans') {   // raised bands, grip texture near the base, dot-matrix panel
      K2.mat(st === 'trans' ? 'mag' : mat).extrude(SH(K2, band(8, 22, -d / 2 + 1, d / 2 - 1, 3), .4), D(w + 1.4), { b: D(.6), bs: 1 });
      if (st !== 'trans') K2.mat(st === 'poly' ? mat : 'grip').extrude(SH(K2, band(L - 46, L - 8, -d / 2 + 4, d / 2 - 4, 4), .4), D(w + 1.2), { b: D(.5), bs: 1 });
      if (st === 'poly') for (let k = 0; k < 4; k++) K2.mat(mat).extrude(SH(K2, band(30 + k * 34, 46 + k * 34, -d * .3, d * .3, 2), .4), D(w + 1), { b: D(.4), bs: 1 });
      if (st === 'pmag' && K2.detail(0)) for (let k = 0; k < 6; k++) { const e = E(36 + k * 9, d * .2); K2.mat('white').box(D(w + 1.1), D(1), D(1.6), { p: P3(0, e[1], e[0]), b: 0, ao: .9 }); }
    } else if (st === 'ak') {               // three long ribs + locking lug at the front top + floorplate dimple
      for (const f of [-.26, 0, .24]) K2.mat(mat).extrude(SH(K2, band(20, L - 14, f * d - 1.6, f * d + 1.6, n), .3), D(w + 1.4), { b: D(.6), bs: 2 });
      K2.mat(mat).box(D(w - 6), D(6), D(5), { p: P3(0, -3, d / 2 + 1.5), b: D(1) });
    } else if (st === 'box') {
      for (let k = 0; k < 3; k++) K2.mat(mat).extrude(SH(K2, band(22 + k * (L - 40) / 3, 34 + k * (L - 40) / 3, -d * .36, d * .36, 2), .3), D(w + 1.2), { b: D(.5), bs: 1 });
    } else if (st === 'short') {
      K2.mat(mat).extrude(SH(K2, band(10, L - 10, -d * .38, d * .38, 2), .4), D(w + 1), { b: D(.5), bs: 1 });
    }
  };
  K.at({ p: P3(0, top[1], top[0]), r: [rake, 0, 0] }, () => {
    body(K);
    if (vk === 'coupler' && K.detail(1)) {     // a second magazine clamped beside the first
      K.at({ p: P3(w + 3, 6, 0) }, () => body(K));
      for (const s of [L * .3, L * .72]) { const e = E(s, 0); K.mat('furn').box(D(w * 2 + 9), D(12), D(d + 5), { p: P3(w / 2 + 1.5, e[1], e[0]), b: D(1.6) }); }
    }
  });
  K.use('body');
}

// ---- sights, rails, stocks -------------------------------------------------------------------------------------------
/** back-up iron sight on a rail top at y (mm), centred at z: rear aperture / front post, both with the sight point at y + 7 + h.
    The upper part is `name` (meta.iron 'fold': flips down under an optic). Returns the sight line y. */
function buis(K, name, { z, y, kind = 'rear', h = 22, mat = 'alu', fixed = false }) {
  K.mat(mat).extrude(SH(K, [[z - 11, y], [z + 11, y], [z + 10, y + 7, 1.6], [z - 10, y + 7, 1.6]], .5), D(19), { b: D(.8), bs: 2 });
  if (K.detail(0)) K.screw({ p: P3(9.6, y + 3.5, z), axis: 'x', d: D(5.5), h: D(1.6), type: 'hex', mat: 'metal' });
  if (!fixed) K.part(name, { pivot: P3(0, y + 7, z), meta: { iron: 'fold', foldR: kind === 'rear' ? [-1.5, 0, 0] : [1.5, 0, 0] } });
  if (kind === 'rear') {
    K.mat(mat).extrude(SH(K, [[-8.5, 0], [8.5, 0], [8.5, h - 5, 2.4], [4.5, h + 3.4, 2.4], [-4.5, h + 3.4, 2.4], [-8.5, h - 5, 2.4]], .5), D(4.4), { plane: 'xy', off: D(z - 2.2), p: P3(0, y + 6.5, 0), b: D(.6), bs: 2, holes: [csMM(circle(1.25, 14, 0, h + .5))] });
    for (const sx of [-1, 1]) K.mat(mat).extrude(SH(K, [[0, 0], [2.6, 0], [2.6, h * .7], [0, h * .9]], .3), D(8), { plane: 'xy', off: D(z - 4), p: P3(sx > 0 ? 6 : -8.6, y + 6.5, 0), b: D(.5), bs: 1 });
    if (K.detail(0)) K.mat('metal').cyl(D(3.6), D(7), { p: P3(9, y + 6.5 + h * .45, z - 3.5), axis: 'x', segs: 14 });
  } else {
    K.mat(mat).extrude(SH(K, [[-9, 0], [9, 0], [9, h * .62, 2], [6.6, h + 4, 1.4], [3.7, h + 4, 1], [3.7, h * .56, 1.4], [-3.7, h * .56, 1.4], [-3.7, h + 4, 1], [-6.6, h + 4, 1.4], [-9, h * .62, 2]], .5), D(6), { plane: 'xy', off: D(z - 3), p: P3(0, y + 6.5, 0), b: D(.6), bs: 2 });
    K.mat('metal').extrude(SH(K, [[-1.4, 0], [1.4, 0], [1.05, h * .44 + .5, .3], [-1.05, h * .44 + .5, .3]], .3), D(2.6), { plane: 'xy', off: D(z - 1.3), p: P3(0, y + 6.5 + h * .56, 0), b: D(.25), bs: 1 });
  }
  if (!fixed) K.use('body');
  return y + 7 + h;
}
/** octagonal free-float handguard (M-LOK slots cut through the faces) centred at yc, from z0 to z1 (mm), outer apothem R; top rail */
function mlokGuard(K, { z0, z1, yc, R = 20, t = 2.6, mat = 'alu', rail = true, slotFaces = [2, 3, 4, 5, 6], railTop }) {
  const W = 2 * R * Math.tan(Math.PI / 8) + .5, L = z1 - z0;
  for (let k = 0; k < 8; k++) {
    const th = HALF + k * TAU / 8, hasSlots = slotFaces.includes(k) && (K.detail(0) || (K.lod === 1 && k % 2 === 0));
    const holes = hasSlots ? mlokSlots(D(z0 + 22), D(z1 - 16), 0, { n: K.lod ? 1 : 2 }) : [];
    K.at({ p: P3(0, yc, 0), r: [0, 0, th] }, () => K.mat(mat).extrude(SH(K, [[z0, -W / 2], [z1, -W / 2], [z1, W / 2], [z0, W / 2]], .5), D(t), { off: D(R - t), b: D(holes.length ? .45 : .6), bs: 1, holes, fall: !holes.length }));
  }
  const oc = 1 / Math.cos(Math.PI / 8);   // clamp collar (octagonal, faces aligned with the panels)
  K.mat(mat).lathe(LP([[(R - t - 1) * oc, z0], [(R - .2) * oc, z0, 1], [(R + .3) * oc, z0 + 1], [(R + .3) * oc, z0 + 11], [(R - .2) * oc, z0 + 12, 1], [(R - t - 1) * oc, z0 + 12]]), { p: P3(0, yc, 0), segs: 8, fixed: true, phase: Math.PI / 8, flat: true, crease: 40 });
  if (K.detail(0)) for (const sx of [-1, 1]) K.screw({ p: P3(sx * (R - .7) * .707, yc - (R - .7) * .707, z0 + 6), r: [0, 0, sx > 0 ? -Math.PI * .75 : Math.PI * .75], axis: 'y', d: D(5), h: D(1.2), type: 'hex', mat: 'metal' });
  if (rail) K.rail(D(L - 2), { p: P3(0, railTop ?? yc + R, z0 + 1), marks: true });
  if (K.detail(0)) qdSocket(K, [R + .2, yc - 6, z0 + 18], 1, 'metal');
}
/** round tube with four Picatinny rails (quad rail) centred at yc */
function quadGuard(K, { z0, z1, yc, R = 19.5, mat = 'alu', vents = true }) {
  K.mat(mat).lathe(LP([[R - 2.2, z0], [R - .6, z0, 1], [R, z0 + .6, 1], [R, z1 - .6, 1], [R - .6, z1, 1], [R - 2.2, z1], [R - 2.2, z0]]), { p: P3(0, yc, 0), segs: 32, crease: 40 });
  for (let k = 0; k < 4; k++) { const a = k * HALF; K.at({ p: P3(0, yc, 0), r: [0, 0, a] }, () => K.rail(D(z1 - z0 - 4), { p: P3(0, R - .8, z0 + 2), marks: k === 0 })); }
  if (vents && K.detail(0)) for (let k = 0; k < 5; k++) for (const a of [Math.PI / 4, Math.PI * .75, -Math.PI / 4, -Math.PI * .75]) K.mat('bore').box(D(5.4), D(.8), D(18), { p: P3(Math.cos(a) * (R + .1), yc + Math.sin(a) * (R + .1), z0 + 30 + k * (z1 - z0 - 50) / 4), r: [0, 0, a - HALF], b: 0, ao: .35 });
}
/** precision (PRS-style) fixed stock on a buffer tube: adjustable cheek riser and length-of-pull knobs, rubber pad, bottom hook */
function prsStock(K, { z0, y, len = 230, mat = 'furn', tube = 'alu', w = 44, h = 112, metal = 'metal' }) {
  K.mat(tube).lathe(LP([[0, z0 - 40], [13, z0 - 40, 1], [14.6, z0 - 38, 1], [14.6, z0 - 12], [17, z0 - 10], [17, z0 - 4], [15, z0], [0, z0]]), { p: P3(0, y, 0), segs: 26, crease: 35 });
  K.part('stock', { pivot: P3(0, y, z0 - 30), meta: { fold: null } });
  const zb = z0 - len;
  K.mat(mat).extrude(SH(K, [[z0 - 38, y + 18, 6], [zb + 40, y + 14, 4], [zb + 8, y + 20, 6], [zb + 4, y - h + 12, 6], [zb + 34, y - h + 8, 10], [zb + 70, y - 46, 14], [z0 - 60, y - 26, 10], [z0 - 38, y - 18, 6]], 1), D(w - 6), { b: D(4), bs: K.lod ? 1 : 3, holes: K.detail(1) ? [SH(K, [[zb + 46, y - 30, 8], [z0 - 70, y - 20, 6], [zb + 76, y - 58, 8]], .6)] : [] });
  // cheek riser on two posts + knob
  K.mat(mat).extrude(SH(K, [[zb + 20, y + 30, 6], [z0 - 60, y + 30, 8], [z0 - 56, y + 22, 4], [zb + 24, y + 20, 4]], .8), D(w - 10), { b: D(3), bs: K.lod ? 1 : 2 });
  for (const zz of [zb + 40, z0 - 80]) K.mat(metal).cyl(D(3.5), D(10), { p: P3(0, y + 16, zz), axis: 'y', segs: 12 });
  if (K.detail(0)) { K.mat(metal).lathe(LP([[0, 0], [7, 0, 1], [7.4, 1], [7.4, 9, 1], [6, 10], [0, 10]]), { axis: 'x', p: P3(w / 2 - 4, y + 15, z0 - 70), segs: 18, rmod: (a) => 1 - .06 * (Math.cos(a * 12) > .3 ? 1 : 0) });
    K.mat(metal).lathe(LP([[0, 0], [8, 0, 1], [8.4, 1], [8.4, 8, 1], [7, 9], [0, 9]]), { axis: 'x', p: P3(w / 2 - 5, y - 30, zb + 56), segs: 18, rmod: (a) => 1 - .06 * (Math.cos(a * 12) > .3 ? 1 : 0) }); }
  K.mat('rubber').extrude(SH(K, [[zb - 14, y + 24, 5], [zb + 6, y + 24], [zb + 6, y - h + 6], [zb - 12, y - h + 4, 6]], .6), D(w), { b: D(3.5), bs: K.lod ? 1 : 3 });
  K.mat(metal).extrude(SH(K, [[zb + 2, y - h + 14], [zb + 16, y - h + 14], [zb + 26, y - h - 4, 3], [zb + 10, y - h - 14, 6], [zb + 2, y - h - 6, 4]], .5), D(16), { b: D(1.5), bs: 2 });
  K.use('body');
}
/** riflescope along +Z: eyepiece end at z0 (mm), length len, tube centre at y. o = { tube, obj, oc, rings: [z], railY, lever, param,
    caps, mat }. The ocular glass is part `lensPart` (role 'lens': the scope renderer draws onto it). Returns { ocZ, ocR, objZ, objR }. */
function scopeGeom(K, o) {
  const { z0, len, y, tube = 30, obj = 42, oc = 40, mat = 'rcv', railY = null, rings = [], lensPart = 'lens' } = o;
  const tr = tube / 2, orr = Math.max(tr + 1, obj / 2 + 2.6), ocr = oc / 2, z1 = z0 + len;
  const bellL = Math.max(4, (orr - tr) * 2.4), zb = z1 - 24 - bellL, nS = 40, rib = (a) => 1 - .035 * (Math.cos(a * 18) > .2 ? 1 : 0);
  const pr0 = z0 + 33, pr1 = z0 + Math.min(56, len * .26);
  if (K.lod < 2) K.mat('rubber').lathe(LP([[ocr - 3.8, z0, 1], [ocr - .5, z0, 1], [ocr, z0 + 2, 1], [ocr, z0 + 7], [ocr - .6, z0 + 8]]), { p: P3(0, y, 0), segs: nS, crease: 40 });
  if (K.lod < 2) K.mat(mat).lathe(LP([[ocr - .6, z0 + 8], [ocr, z0 + 9, 1], [ocr, z0 + 30, 1], [ocr - 1.2, z0 + 32]]), { p: P3(0, y, 0), segs: nS, crease: 40 });
  if (K.lod < 2) K.mat(mat).lathe(LP([[ocr - 1.2, pr0], [ocr - .4, pr0 + 1, 1], [ocr - .4, pr1 - 1, 1], [ocr - 1.4, pr1]]), { p: P3(0, y, 0), segs: nS, crease: 40, rmod: K.detail(0) ? rib : null });
  if (K.lod === 2) { K.mat(mat).lathe(LP([[ocr - 3, z0], [ocr, z0], [ocr, pr1], [tr, pr1 + 14], [tr, zb], [orr, zb + bellL], [orr, z1], [orr - 3, z1]]), { p: P3(0, y, 0), segs: 10, fixed: true, crease: 30 }); }
  else K.mat(mat).lathe(LP([[ocr - 1.4, pr1], [tr + 2, pr1 + 10], [tr, pr1 + 14], [tr, zb, 1], [orr - .8, zb + bellL], [orr, zb + bellL + 2, 1], [orr, z1 - 9, 1], [orr - .8, z1 - 8], [orr - .8, z1 - 1], [orr - 1.6, z1, 1], [orr - 3.2, z1]]), { p: P3(0, y, 0), segs: nS, crease: 30 });
  if (o.lever && K.detail(1)) K.mat(mat).extrude(SH(K, [[-3, 0], [3, 0], [2.4, 16, 2], [-2.4, 16, 2]], .4), D(5), { plane: 'xy', off: D(pr0 + 6), p: P3(0, y + ocr - 2, 0), r: [0, 0, -.5], b: D(.8), bs: 2 });
  // turret saddle + elevation (top) + windage (right) + parallax / illumination (left)
  const zc = o.turretZ ?? (z0 + len * .52), sw = tr + 4;
  if (K.detail(1)) K.mat(mat).lathe(LP([[tr, zc - 26], [sw - 1, zc - 22, 1], [sw, zc - 20, 1], [sw, zc + 20, 1], [sw - 1, zc + 22, 1], [tr, zc + 26]]), { p: P3(0, y, 0), segs: nS, crease: 40 });
  K.mat(mat).extrude(SH(K, [[zc - 19, -sw + 2, 4], [zc + 19, -sw + 2, 4], [zc + 19, sw - 2, 4], [zc - 19, sw - 2, 4]], .6), D(2 * sw), { p: P3(0, y, 0), b: D(1.4), bs: 2 });
  const knob = (axis, r, h, base, p) => {
    K.at({ p }, () => {
      K.mat(mat).lathe(LP([[0, 0], [r - 1.6, 0], [r - 1.6, base, 1], [r, base + .6, 1], [r, base + h - 1, 1], [r - 1.2, base + h, 1], [0, base + h]]), { axis, segs: 30, crease: 40, rmod: K.detail(0) ? (a, z) => (z > D(base + 2) && z < D(base + h - 2) ? 1 - .05 * (Math.cos(a * 22) > 0 ? 1 : 0) : 1) : null });
      if (K.detail(0)) K.mat('white').box(axis === 'y' ? D(1) : D(.6), axis === 'y' ? D(.6) : D(1), D(3.4), { p: axis === 'y' ? P3(0, base + h - .1, r * .55) : P3(axis === 'x' ? base + h - .1 : -base - h + .1, 0, r * .55), b: 0 });
    });
  };
  knob('y', o.elevR || 12.5, o.elevH || 15, sw - 3, P3(0, y, zc));
  if (K.detail(1)) knob('x', o.windR || 11.5, 12, sw - 3, P3(0, y, zc));
  if (o.param !== false && K.detail(1)) knob('-x', o.paramR || 15, 9, sw - 3, P3(0, y, zc));
  // rings on a rail at railY
  if (railY !== null) for (const zr of rings) {
    K.mat(mat).lathe(LP([[tr - .1, zr - 7], [tr + 3.4, zr - 7, 1], [tr + 4, zr - 6.4, 1], [tr + 4, zr + 6.4, 1], [tr + 3.4, zr + 7, 1], [tr - .1, zr + 7]]), { p: P3(0, y, 0), segs: nS, crease: 40 });
    K.mat(mat).extrude(SH(K, [[zr - 8, railY], [zr + 8, railY], [zr + 7, y - tr + 2, 2], [zr - 7, y - tr + 2, 2]], .6), D(24), { b: D(1.2), bs: 2 });
    K.mat(mat).extrude(SH(K, [[zr - 9, railY - 3.2], [zr + 9, railY - 3.2], [zr + 9, railY + 4, 1], [zr - 9, railY + 4, 1]], .5), D(27), { b: D(1), bs: 1 });
    if (K.detail(0)) {
      K.screw({ p: P3(13.6, railY + .6, zr), axis: 'x', d: D(9), h: D(3), type: 'hex', mat: 'metal' });
      for (const sx of [-1, 1]) for (const dz of [-3.6, 3.6]) K.screw({ p: P3(sx * (tr + 5.6), y + 1.4, zr + dz), axis: sx > 0 ? 'x' : '-x', d: D(4), h: D(1), type: 'torx', mat: 'metal' });
      for (const sx of [-1, 1]) K.mat(mat).box(D(3), D(6), D(12), { p: P3(sx * (tr + 4.6), y + 1.4, zr), b: D(.6) });
    }
  }
  if (o.caps && K.detail(0)) {   // flip-up lens caps (open)
    K.mat('furn').lathe(LP([[orr, z1 - 6], [orr + 1.8, z1 - 6, 1], [orr + 1.8, z1 + 4, 1], [orr, z1 + 4]]), { p: P3(0, y, 0), segs: nS, crease: 40 });
    K.mat('furn').extrude(csMM(circle(orr + 1.6, K.seg(28))), D(2.4), { plane: 'xy', off: 0, p: P3(0, y + orr + 1.6, z1 + 3), r: [-1.9, 0, 0], b: D(.6), bs: 1 });
  }
  // glass: objective (coated) and the ocular as its own part (scope renderer target)
  K.mat('lens').disc(D(orr - 3.4), D(1.2), { p: P3(0, y, z1 - 9.6), segs: 36 });
  if (K.detail(1)) K.mat('bore').lathe(LP([[orr - 3.3, z1 - 10.4], [orr - 3.3, z1 - 34]]), { p: P3(0, y, 0), segs: 30 });
  K.part(lensPart, { pivot: P3(0, y, z0 + 1.2), meta: { lens: true } });
  K.mat('lens').disc(D(ocr - 4.2), D(1), { p: P3(0, y, z0 + 1.6), segs: 36 });
  K.use('body');
  return { ocZ: z0 + 1.1, ocR: ocr - 4.2, objZ: z1 - 9.6, objR: orr - 3.4 };
}
/** barrel intrinsic mod -> { ext (mm), heavy (radius mm or 0) } */
function barrelMod(ctx) {
  const b = ctx.intr && ctx.intr.barrel, m = b && b.model;
  if (!m) return { ext: 0, heavy: 0, kind: null };
  return { ext: m.kind === 'long' ? (m.ext || .1) * 1000 : m.kind === 'short' ? (m.ext || -.08) * 1000 : 0, heavy: m.kind === 'heavy' ? (m.dia || .024) * 500 : 0, kind: m.kind };
}
/** built-in scope sight metadata: eye = relief behind the ocular, reticle on the ocular glass (meta.reticle -> a reticle disc) */
function scopeSight(K, sc, y, relief, reticle, lensPart = 'lens') {
  K.meta.sight = { front: P3(0, y, sc.objZ), rear: P3(0, y, sc.ocZ), eye: P3(0, y, sc.ocZ - relief), kind: 'scope' };
  K.meta.reticle = { part: lensPart, c: P3(0, y, sc.ocZ - .4), r: D(sc.ocR), id: reticle || 'duplex' };
  K.meta.lens = { part: lensPart, c: P3(0, y, sc.ocZ), r: D(sc.ocR), obj: P3(0, y, sc.objZ), objR: D(sc.objR) };
}

// ---- AR family (warden, switchback, morker, weitblick, habicht, longreach, richter) -----------------------------------------
BUILDERS.ar = (K, S, gun, ctx) => {
  const L10 = !!S.large, yB = 38, wU = L10 ? 29 : 26.4, hw = wU / 2, uBot = 22, uTop = L10 ? 58 : 55, rT = uTop + 9;
  const zR = L10 ? -98 : -88, zN = L10 ? 112 : 100, bm = barrelMod(ctx), bl = (S.bl || gun.model.barrel * 1000) + bm.ext, zBF = 48, zM = zBF + bl;
  const H = uTop - uBot, hgL = Math.min(S.hgLen || 300, zM - zN - 20), zH = zN + hgL;
  // --- upper receiver: plain / ejection-port cross-sections, forward assist, brass deflector, rail
  const csF = [[-hw, 0, 1.4], [hw, 0, 1.4], [hw, H - 9.5], [hw - 2.4, H - 5.4, 1], [10.6, H - 5.4], [10.6, H], [-10.6, H], [-10.6, H - 5.4], [-hw + 2.4, H - 5.4, 1], [-hw, H - 9.5]];
  const csP = [[-hw, 0, 1.4], [hw, 0, 1.4], [hw, 8], [hw - 2.4, 8], [hw - 2.4, 2.6], [-hw + 2.4, 2.6], [-hw + 2.4, H - 7.6], [hw - 2.4, H - 7.6], [hw - 2.4, H - 10.6], [hw, H - 10.6], [hw, H - 9.5], [hw - 2.4, H - 5.4, 1], [10.6, H - 5.4], [10.6, H], [-10.6, H], [-10.6, H - 5.4], [-hw + 2.4, H - 5.4, 1], [-hw, H - 9.5]];
  const p0 = L10 ? 6 : 8, p1 = L10 ? 76 : 66;
  cs(K, CSX(K, csF), zR, p0, uBot, { bb: 1.4, mat: 'rcv' }); cs(K, CSX(K, csP), p0, p1, uBot, { mat: 'rcv' }); cs(K, CSX(K, csF), p1, zN, uBot, { bf: 1, mat: 'rcv' });
  K.rail(D(zN - zR - 4), { p: P3(0, uTop, zR + 2), marks: true });
  K.at({ p: P3(hw - 3.4, yB + 1.5, -10), r: [0, Math.PI - .3, 0] }, () => {          // forward assist
    K.mat('rcv').lathe(LP([[0, -4], [8.4, -4], [8.4, 17, 1], [7.4, 19], [0, 19]]), { segs: 26, crease: 40 });
    K.mat('metal').lathe(LP([[0, 18], [6.4, 18], [6.8, 19, 1], [6.8, 30, 1], [5.8, 31.5, 1], [0, 31.5]]), { segs: 26, crease: 40, rmod: K.detail(0) ? (a, z) => (z > D(20) && z < D(30) ? 1 - .07 * (Math.cos(a * 9) > .4 ? 1 : 0) : 1) : null });
  });
  K.mat('rcv').extrude(SH(K, [[-16, yB - 4], [-2, yB - 4], [4, yB + 14, 2.4], [-10, yB + 16, 4], [-16, yB + 10, 3]], .6), D(6.5), { off: D(hw - 2), b: D(1.4), bs: 2 });   // brass deflector
  // bolt carrier (part, visible through the port) + dust cover (part)
  K.part('bolt', { pivot: P3(0, yB, 30), meta: { slide: [0, 0, -D(L10 ? 92 : 80)] } });
  K.mat('dark').lathe(LP([[0, -60], [8.6, -60, 1], [8.6, 58, 1], [7.6, 60], [0, 60]]), { p: P3(0, yB, 0), segs: 22, crease: 40 });
  K.mat('bright').lathe(LP([[0, 60], [6.6, 60], [6.6, 72, 1], [0, 73]]), { p: P3(0, yB, 0), segs: 18 });
  if (K.detail(0)) { K.mat('bright').cyl(D(3.4), D(6), { p: P3(6.6, yB + 3, 30), axis: 'x', segs: 12 }); K.mat('dark').box(D(4), D(5), D(20), { p: P3(7.4, yB - 4, 40), b: D(.6) }); }
  K.use('body');
  K.part('cover', { pivot: P3(hw + .7, uBot + 7.4, (p0 + p1) / 2), meta: { openR: [0, 0, -1.7] } });
  K.mat('rcv').extrude(SH(K, [[p0 + 1, uBot + 7.6], [p1 - 1, uBot + 7.6], [p1 - 1, uBot + H - 10.2, 1], [p0 + 1, uBot + H - 10.2, 1]], .4), D(1.3), { off: D(hw + .1), b: D(.4), bs: 1 });
  if (K.detail(0)) { K.mat('rcv').box(D(2), D(3), D(8), { p: P3(hw + 1.5, uBot + H - 12, p1 - 8), b: D(.5) }); K.mat('metal').cyl(D(1.3), D(p1 - p0 - 2), { p: P3(hw + 1, uBot + 7.6, p0 + 1), segs: 8 }); }
  K.use('body');
  // charging handle (part): T-handle behind the upper with the latch on the left
  K.part('charging', { pivot: P3(0, uTop - 4, zR), meta: { slide: [0, 0, -D(60)] } });
  K.mat('alu').extrude(SH(K, [[-15, -3], [15, -3], [16, 3, 2], [9, 6, 2], [-9, 6, 2], [-16, 3, 2]], .5), D(10), { plane: 'xz', off: D(uTop - 9), p: P3(0, 0, zR - 6), b: D(.8), bs: 2 });
  K.mat('alu').box(D(10), D(6), D(30), { p: P3(0, uTop - 6, zR + 10), b: D(1) });
  if (K.detail(0)) K.mat('alu').box(D(5), D(4), D(12), { p: P3(-14, uTop - 5, zR - 3), r: [0, -.3, 0], b: D(.8) });
  K.use('body');
  // --- lower receiver: fire-control body, hollow magwell + flare, guard, pins, controls
  const MT = MAGS[S.mag || 'stanag'], mIn = MT.w + .8, mLin = MT.d + 2.4, mzc = L10 ? 68 : 62, mw0 = mzc - mLin / 2, mw1 = mzc + mLin / 2;
  const wL = mIn + 4.6;
  K.mat('rcv').extrude(SH(K, [[zR - 6, uBot, 1], [zN + 4, uBot, 1], [zN + 9, uBot - 4, 3], [zN + 7, 8, 4], [mw1 + 1, 6], [mw0 - 1, 6], [mw0 - 5, 0, 3], [-30, 0], [-64, -2, 5], [-76, 6, 8], [zR + 2, 12, 6], [zR - 6, 18, 3]], 1), D(wL), { b: D(1.4), bs: 2 });
  const magCut = [rr(D(mIn), D(mLin), D(1.5), 0, D(mzc), K.arcN)];
  K.mat('rcv').extrude(rr(D(wL), D(mLin + 5), D(2.4), 0, D(mzc), K.arcN), D(36), { plane: 'xz', off: D(-28), b: D(.8), bs: 2, holes: magCut });
  K.mat('rcv').extrude(rr(D(wL + 2.4), D(mLin + 8), D(3.4), 0, D(mzc + 1.5), K.arcN), D(4), { plane: 'xz', off: D(-31), b: D(1.2), bs: 2, holes: magCut });
  K.mat('rcv').lathe(LP([[13, zR - 12], [17.4, zR - 10, 1], [17.4, zR + 6, 1], [13, zR + 8]]), { p: P3(0, yB - 1, 0), segs: 28, crease: 40 });   // buffer tower
  guardLoop(K, [[-30, 1], [mw0, 1], [mw0 + 1, -12, 4], [mw0 - 6, -25, 6], [-18, -27, 6], [-30, -14, 5]], [[-21, -1.6], [mw0 - 4, -1.6, 2], [mw0 - 4, -10, 4], [mw0 - 10, -21, 5], [-14, -22.6, 5], [-22, -11, 4]], 10.5, 1.8, 'rcv');
  triggerPart(K, [0, 8, 2], { face: S.trigger || 'curved', len: 22, w: 7.5, mat: 'metal' });
  const hr = longGrip(K, { z: -47, y: 1, ang: .42, len: 100, w: 30, f: 15, b: 23, mat: 'grip', grooves: S.gripGrooves !== false, hump: 2.2, flare: 2 });
  K.part('selector', { pivot: P3(-wL / 2, 13, -40), meta: { safeR: [0, 0, 0], fireR: [0, 0, HALF] } });
  K.mat('metal').cyl(D(6.4), D(2), { p: P3(-wL / 2 - .4, 13, -40), axis: '-x', segs: 20 });
  K.mat('metal').extrude(SH(K, [[-2.6, 0], [2.6, 0], [1.6, 13, 1.4], [-1.6, 13, 1.4]], .4), D(2), { p: P3(-wL / 2 - 2.2, 13, -40), r: [-1.2, 0, 0], b: D(.4), bs: 1 });
  K.use('body');
  if (K.detail(0)) {
    K.mat('metal').extrude(SH(K, [[mw0 - 8, 10], [mw0 + 10, 10, 1], [mw0 + 10, 20, 2], [mw0 - 4, 21, 2]], .4), D(2.4), { off: -D(wL / 2 + 2), b: D(.5), bs: 1 });   // bolt catch
    K.mat('metal').cyl(D(5), D(3.4), { p: P3(wL / 2 + 1.4, 6, mw0 - 6), axis: 'x', segs: 18, ch: D(.8) });                                  // mag release
    K.mat('rcv').extrude(SH(K, [[mw0 - 14, 0], [mw0 + 2, 0], [mw0 + 2, 12, 3], [mw0 - 14, 12, 3]], .5), D(2.4), { off: D(wL / 2 - .2), b: D(.6), bs: 1 });
    for (const sx of [-1, 1]) { K.pin({ p: P3(sx * wL / 2, 16, zR + 14), d: D(6), mat: 'metal' }); K.pin({ p: P3(sx * wL / 2, 13, zN + 2), d: D(6), mat: 'metal' }); K.pin({ p: P3(sx * wL / 2, 9, 0), d: D(4), mat: 'metal' }); K.pin({ p: P3(sx * wL / 2, 10, -16), d: D(4), mat: 'metal' }); }
  }
  qdSocket(K, [-wL / 2 - .2, 14, zR + 2], -1, 'metal');
  // --- barrel, gas, handguard
  const br = bm.heavy || (S.prof === 'heavy' ? 11.6 : S.prof === 'pencil' ? 8.4 : 9.6), zG = zBF + (S.gasLen || (bl < 300 ? 178 : bl < 420 ? 228 : 302));
  const flute = (S.prof === 'fluted' && K.detail(1)) ? (a, z) => (z > D(zH + 14) && z < D(zM - 30) ? 1 - .085 * Math.max(0, Math.cos(a * 6)) ** 6 : 1) : null;
  K.mat('barrel').lathe(LP([[5, zN - 8], [12.4, zN - 8], [12.4, zN + 18, 1], [br, zN + 22], [br, zG - 12], [br - .6, zG - 9], [br - .6, zG + 12], [br, zG + 14], [br, zM - 22, 1], [Math.min(br, 8.4), zM - 16], [7.2, zM - 15], [7.2, zM], [4.6, zM]]), { p: P3(0, yB, 0), segs: 30, crease: 30, rmod: flute });
  K.mat('bore').lathe(LP([[2.9, zM - .1], [2.9, zM - 30]]), { p: P3(0, yB, 0), segs: 12 });
  const piston = S.gas === 'piston';
  K.mat('dark').lathe(LP([[br - .6, zG - 10], [14.6, zG - 10, 1], [15.2, zG - 9, 1], [15.2, zG + 10, 1], [14.6, zG + 11], [br - .6, zG + 11]]), { p: P3(0, yB, 0), segs: 24, crease: 40 });
  K.mat('dark').extrude(SH(K, [[zG - 10, yB + 6], [zG + 10, yB + 6], [zG + 10, yB + (piston ? 26 : 18), 3], [zG - 10, yB + (piston ? 26 : 18), 3]], .5), D(piston ? 22 : 16), { b: D(1), bs: 2 });
  if (piston) { K.mat('dark').lathe(LP([[0, zG + 9], [6, zG + 9], [6, zG + 18, 1], [4.8, zG + 20], [0, zG + 20]]), { p: P3(0, yB + 17, 0), segs: 16 }); K.mat('bright').cyl(D(3.6), D(zG - zN - 8), { p: P3(0, yB + 17, zN + 2), segs: 14 }); }
  else K.mat('metal').cyl(D(2.4), D(zG - zN + 12), { p: P3(0, yB + 13.5, zN - 14), segs: 10 });
  const yc = uTop - 20.2;
  const qR = 19.2, qyc = uTop - qR + .8;
  if (S.hg === 'quad') quadGuard(K, { z0: zN + 1, z1: zH, yc: qyc, R: qR, mat: 'alu' });
  else mlokGuard(K, { z0: zN + 1, z1: zH, yc, R: 20.2, mat: 'alu', railTop: uTop });
  const md = mdev(K, S.muzzle || 'a2', { z: zM, y: yB, mat: 'barrel', s: L10 || gun.bore === '762' ? 1.08 : 1 });
  // --- sights / built-in scope
  let sight;
  if (S.scope) {
    const sc = S.scope, ys = rT + Math.max(sc.obj / 2 + 9, sc.tube / 2 + 22);
    K.part('scope', { pivot: P3(0, ys, -40), meta: { replace: 'optic' } });
    const g = scopeGeom(K, { z0: sc.z0, len: sc.len, y: ys, tube: sc.tube, obj: sc.obj, oc: sc.oc || 42, railY: rT, rings: sc.rings, mat: 'alu2', param: true, caps: true, lensPart: 'scopeLens' });
    K.use('body'); K.parts.get('scopeLens').parent = 'scope';
    scopeSight(K, g, ys, sc.relief || 88, gun.scope && gun.scope.reticle, 'scopeLens');
    sight = null;
  } else {
    const sh = S.sightH || 22, yF = rT;
    const sL = buis(K, 'sightRear', { z: zR + 12, y: rT, kind: 'rear', h: sh });
    buis(K, 'sightFront', { z: zH - 13, y: yF, kind: 'front', h: sh });
    sight = sL;
    sightMeta(K, [0, sL, zH - 13], [0, sL, zR + 12], S.relief || 82);
  }
  // --- magazine + stock
  const mag = ctx.intr.mag;
  rmag(K, { kind: S.mag || 'stanag', top: [mzc, 9], rake: 0, variant: mag });
  if (S.stock === 'prs') prsStock(K, { z0: zR - 8, y: yB - 1, len: S.stockLen || 250, mat: 'furn', tube: 'alu' });
  else bufferStock(K, { z0: zR - 8, y: yB - 1, len: S.stockLen || 220, mat: 'furn', tube: 'alu', w: 42, h: 96, slide: 75 });
  if (S.bipodStud && K.detail(0)) swivel(K, [0, yc - 20.2, zH - 18]);
  // --- nodes
  sockets(K, { optic: S.scope ? [[0, rT, -6]] : [[0, rT, 24]], canted: S.scope ? [[0, rT, S.cantedZ ?? 60]] : null, muzzle: [[0, yB, zM]], under: [[0, (S.hg === 'quad' ? qyc - qR - 8.2 : yc - 20.2), zN + hgL * .56]],
    side: [[S.hg === 'quad' ? qR + 8.2 : 20.2, S.hg === 'quad' ? qyc : yc, zN + hgL * .62]], mag: [[0, 9, mzc]], stock: [[0, yB - 1, zR - 8]], barrel: [[0, yB, zN]] });
  muzzleNode(K, yB, zM + md + .2); ejectNode(K, [hw + 1, yB - 1, (p0 + p1) / 2]);
  handNodes(K, hr, { p: [0, yc - 20.2, zN + hgL * .42], kind: 'hold' });
  K.meta.stock = { kind: 'tube', y: yB - 1, z: zR - 8, tube: S.stockLen ? S.stockLen - 40 : 180, r: 14.6 };
  void sight;
};
Object.assign(MODEL_SPECS, {
  warden: { b: 'ar', pal: 'black', wear: .6, mats: { rcv: 'alu_blk', alu: 'alu_blk', alu2: 'alu_blk', furn: 'poly_blk', grip: 'poly_grp', mag: 'alu_gry', barrel: 'nitride', metal: 'dksteel' },
    hgLen: 290, muzzle: 'a2', mag: 'stanag', stockLen: 220 },
  switchback: { b: 'ar', pal: 'black', wear: .8, mats: { rcv: 'alu_blk', alu: 'alu_blk', furn: 'poly_blk', grip: 'poly_grp', mag: 'poly_blk', barrel: 'nitride', metal: 'dksteel' },
    hgLen: 210, muzzle: 'prong', mag: 'pmag', stockLen: 200 },
  morker: { b: 'ar', pal: 'black', wear: .5, mats: { rcv: 'cer_od', alu: 'cer_od', furn: 'poly_od', grip: 'poly_od', mag: 'poly_od', barrel: 'nitride', metal: 'dksteel' },
    hgLen: 190, muzzle: 'prong', mag: 'pmag300', stockLen: 205, gasLen: 120 },
  weitblick: { b: 'ar', pal: 'black', wear: .45, mats: { rcv: 'cer_fde', alu: 'cer_fde', furn: 'poly_fde', grip: 'poly_fdeg', mag: 'poly_fde', barrel: 'stainless', metal: 'dksteel' },
    hgLen: 380, muzzle: 'a2', mag: 'pmag', stock: 'prs', stockLen: 250, prof: 'fluted', trigger: 'flat', relief: 86 },
  habicht: { b: 'ar', pal: 'black', wear: .55, mats: { rcv: 'alu_blk', alu: 'alu_blk', furn: 'poly_blk', grip: 'poly_grp', mag: 'stamp', barrel: 'nitride', metal: 'dksteel' },
    hgLen: 230, hg: 'quad', gas: 'piston', prof: 'heavy', muzzle: 'flash', mag: 'stanag', stockLen: 225, gasLen: 190 },
  longreach: { b: 'ar', pal: 'black', wear: .5, large: true, mats: { rcv: 'alu_blk', alu: 'alu_blk', furn: 'poly_blk', grip: 'poly_grp', mag: 'poly_blk', barrel: 'nitride', metal: 'dksteel' },
    hgLen: 380, muzzle: 'brake', mag: 'ar10', stock: 'prs', stockLen: 255, prof: 'heavy', trigger: 'flat', relief: 88 },
  richter: { b: 'ar', pal: 'black', wear: .45, large: true, mats: { rcv: 'cer_fde', alu: 'cer_fde', alu2: 'alu_blk', furn: 'poly_fde', grip: 'poly_fdeg', mag: 'poly_blk', barrel: 'nitride', metal: 'dksteel' },
    hgLen: 420, muzzle: 'brake', mag: 'sniper338', stock: 'prs', stockLen: 260, prof: 'fluted', trigger: 'flat', bipodStud: true,
    scope: { z0: -150, len: 330, tube: 34, obj: 50, oc: 44, rings: [-62, 40], relief: 90 } },
});

// ---- AK family (purga, taiga, kroha) ----------------------------------------------------------------------------------
/** AK side-rail optic mount (shown only with an optic: meta.optOnly): clamp on the receiver's left dovetail, arm over the cover */
function akSideMount(K, { z0, z1, w, top, yRail }) {
  K.part('sideMount', { pivot: P3(-w / 2, top - 14, z0), meta: { optOnly: true } });
  K.mat('alu').extrude(SH(K, [[z0, top - 26], [z1, top - 26], [z1, top - 4, 3], [z0, top - 4, 3]], .6), D(6), { off: -D(w / 2 + 6), b: D(1), bs: 2 });
  K.mat('alu').extrude(SH(K, [[-w / 2 - 6, top - 8], [-w / 2 - .5, top - 8], [-w / 2 - .5, yRail - 4, 2], [12, yRail - 4], [12, yRail], [-w / 2 - 6, yRail, 3]], .6), D(z1 - z0), { plane: 'xy', off: D(z0), b: D(1), bs: 2 });
  K.rail(D(z1 - z0 - 4), { p: P3(0, yRail, z0 + 2) });
  if (K.detail(0)) { K.mat('metal').lathe(LP([[0, 0], [7, 0, 1], [7, 4, 1], [0, 5]]), { axis: '-x', p: P3(-w / 2 - 6, top - 15, (z0 + z1) / 2 - 12), segs: 16 }); K.mat('metal').box(D(3), D(22), D(5), { p: P3(-w / 2 - 10, top - 20, (z0 + z1) / 2 - 12), r: [.5, 0, 0], b: D(1) }); }
  K.use('body');
}
BUILDERS.ak = (K, S, gun, ctx) => {
  const yB = 34, top = 50, zR = -122, zF = 112, w = S.rw || 30, bm = barrelMod(ctx), bl = (S.bl || gun.model.barrel * 1000) + bm.ext, zC = 32, zM = zC + bl;
  const wood = S.furn === 'wood', short = bl < 300;
  akReceiver(K, { zR, zF, top, w, rail: !!S.coverRail });
  if (K.detail(0)) K.mat('stamp').extrude(SH(K, [[zR + 6, 14], [zR + 40, 14], [zR + 40, 34, 2], [zR + 6, 34, 2]], .5), D(1.2), { off: -D(w / 2 + .5), b: D(.4), bs: 1 });   // left side rail
  if (K.detail(0)) K.mat('stamp').extrude(SH(K, [[zR + 50, 4], [zF - 70, 0], [zF - 70, 6, 2], [zR + 50, 10, 2]], .5), D(w + 1), { b: D(.5), bs: 1 });              // magwell reinforcement
  // rear sight block on the trunnion (leaf + notch), gas tube lock lever
  const sLine = S.sLine || 64, rz = short ? -40 : zF + 4, gt0 = short ? zF + 2 : zF + 44;
  if (short) {   // rear sight (flip aperture) on the hinged dust cover front
    K.use('cover');
    K.mat('stamp').extrude(SH(K, [[-12, 0], [12, 0], [12, 4, 2], [-12, 4, 2]], .4), D(14), { plane: 'xy', off: D(rz - 7), p: P3(0, top + .5, 0), b: D(.6), bs: 1 });
    K.mat('stamp').extrude(SH(K, [[-7, 0], [7, 0], [7, sLine - top - 4, 2.6], [-7, sLine - top - 4, 2.6]], .4), D(3.4), { plane: 'xy', off: D(rz - 1.7), p: P3(0, top + 3, 0), b: D(.4), bs: 1, holes: [csMM(circle(1.4, 14, 0, sLine - top - 3))] });
    K.use('body');
  } else {
    K.mat('stamp').extrude(SH(K, [[zF - 8, yB + 6], [zF + 44, yB + 6], [zF + 44, top - 2, 3], [zF + 26, top + 4, 4], [zF - 8, top + 4, 2]], .6), D(26), { b: D(1.4), bs: 2 });
    K.mat('stamp').extrude(SH(K, [[-10, 0], [10, 0], [10, 2.2], [5, 4, 1], [1.6, 4], [1.6, sLine - top - 7.6], [-1.6, sLine - top - 7.6], [-1.6, 4], [-5, 4, 1], [-10, 2.2]], .3), D(4), { plane: 'xy', off: D(rz - 2), p: P3(0, top + 4, 0), b: D(.4), bs: 1 });
    K.mat('stamp').extrude(SH(K, [[rz - 2, top + 4], [zF + 36, top + 4], [zF + 36, top + 7.5, 1], [rz - 2, sLine - .5, 1]], .4), D(16), { b: D(.6), bs: 1 });
    K.mat('metal').extrude(SH(K, [[-6, 0], [6, 0], [6, 3.4], [1.1, 3.4], [1.1, 1.6], [-1.1, 1.6], [-1.1, 3.4], [-6, 3.4]], .2), D(3), { plane: 'xy', off: D(rz - 3), p: P3(0, sLine - 3.4, 0), b: D(.3), bs: 1 });
    if (K.detail(0)) { K.mat('metal').box(D(6), D(7), D(8), { p: P3(0, top + 6, zF + 30), b: D(1) }); K.mat('metal').cyl(D(3.2), D(4), { p: P3(w / 2 - 6, yB + 18, zF + 40), axis: 'x', segs: 14 }); K.mat('metal').extrude(SH(K, [[-2, 0], [12, 0, 2], [12, 4, 2], [-2, 4]], .4), D(2), { p: P3(w / 2 - 2, yB + 17, zF + 38), r: [-.3, 0, 0], b: D(.4), bs: 1 }); }
  }
  // barrel + trunnion collar, gas block (45 deg port), gas tube, front sight base with hood (or combined block on short guns)
  const br = bm.heavy || (short ? 9.4 : 8.6), zG = short ? zM - 34 : Math.min(zM - 130, zC + 330), zFS = short ? zG : zM - 44;
  K.mat('barrel').lathe(LP([[4, zF - 6], [13, zF - 6], [13, zF + 28, 1], [11, zF + 32], [br + 1, zF + 40], [br, zF + 60], [br, zM - 14, 1], [7.8, zM - 12], [7.8, zM], [4, zM]]), { p: P3(0, yB, 0), segs: 28, crease: 30 });
  K.mat('bore').lathe(LP([[2.9, zM - .1], [2.9, zM - 30]]), { p: P3(0, yB, 0), segs: 12 });
  K.mat('stamp').lathe(LP([[br, zG - 16], [14, zG - 16, 1], [15, zG - 14, 1], [15, zG + 12, 1], [14, zG + 14], [br, zG + 14]]), { p: P3(0, yB, 0), segs: 24, crease: 40 });
  K.mat('stamp').extrude(SH(K, [[zG - 16, yB + 4], [zG + 14, yB + 4], [zG + 8, yB + 28, 4], [zG - 10, yB + 28, 4]], .6), D(20), { b: D(1.4), bs: 2 });
  K.mat('stamp').lathe(LP([[10, zG - 10], [11, zG - 9, 1], [11, zG + 6, 1], [10, zG + 8], [0, zG + 8]]), { p: P3(0, yB + 18, 0), segs: 22 });
  K.mat('stamp').lathe(LP([[0, gt0], [9.4, gt0], [10, gt0 + 2, 1], [10, zG - 10, 1], [9.2, zG - 9]]), { p: P3(0, yB + 18, 0), segs: 22 });
  if (K.detail(0)) for (let k = 0; k < (short ? 2 : 4); k++) K.mat('bore').box(D(12), D(3), D(4), { p: P3(0, yB + 18 + 7, zG - 34 - k * 14), r: [0, 0, 0], b: 0, ao: .45 });
  const fh = sLine - yB - 2;
  K.mat('stamp').extrude(SH(K, [[zFS - 13, yB - 10], [zFS + 13, yB - 10, 3], [zFS + 13, yB + 12, 2], [zFS + 6, sLine - 15, 3], [zFS - 6, sLine - 15, 3], [zFS - 13, yB + 12, 2]], .6), D(18), { b: D(1.2), bs: 2 });
  K.mat('stamp').lathe(LP([[9, zFS - 6], [11, zFS - 6, 1], [11, zFS + 6, 1], [9, zFS + 6]]), { p: P3(0, sLine - 4, 0), segs: 26, crease: 40, a0: S.hood === 'open' ? -.6 : 0, a1: S.hood === 'open' ? Math.PI + .6 : TAU });
  K.mat('metal').lathe(LP([[0, 0], [1.9, 0], [1.6, fh - 22], [1.2, fh - 20.5], [0, fh - 20.4]]), { axis: 'y', p: P3(0, sLine - (fh - 20.4), zFS), segs: 12 });
  if (K.detail(0)) K.mat('metal').cyl(D(2.2), D(20), { p: P3(-10, yB + 4, zFS), axis: 'x', segs: 10 });
  const md = mdev(K, S.muzzle || 'ak47', { z: zM, y: yB, mat: 'barrel' });
  // handguards: wood (upper over the gas tube + lower with finger grooves) or aluminium quad rail
  const h0 = gt0 + 2, h1 = zG - 16;
  if (S.hg === 'quad') {
    quadGuard(K, { z0: h0, z1: h1, yc: yB + 2, R: 21, mat: 'alu' });
    K.mat('alu').lathe(LP([[10.4, zF + 50], [12, zF + 50, 1], [12, zG - 14, 1], [10.4, zG - 14]]), { p: P3(0, yB + 18, 0), segs: 22 });
    K.rail(D(zG - zF - 70), { p: P3(0, yB + 18 + 11.2, zF + 54) });
  } else {
    const mat = wood ? 'wood' : 'furn', R = K.lod ? 4 : 12, rows = [];
    for (let k = 0; k <= R; k++) {
      const t = k / R, z = h0 + t * (h1 - h0), groove = K.detail(1) && t > .2 && t < .8 ? 1.4 * Math.max(0, Math.sin((t - .2) / .6 * Math.PI * 3)) : 0;
      const hw2 = 20 - groove - (t < .06 ? (1 - t / .06) * 2 : 0) + (t > .9 ? (t - .9) * 18 : 0);
      rows.push(ovalPts(38, hw2, hw2 * .85, hw2 * .95, K.lod ? 2 : 4).map(([sv, x]) => [D(x), D(yB - 22 + sv), D(z), 0]));
    }
    K.mat(mat).loft3(rows, { crease: 60, uvSwap: true });
    const ur = []; for (let k = 0; k <= (K.lod ? 3 : 8); k++) { const t = k / (K.lod ? 3 : 8), z = gt0 + 8 + t * (zG - gt0 - 32); ur.push(ovalPts(16, 13, 6, 6, K.lod ? 2 : 3).map(([sv, x]) => [D(x), D(yB + 12 + sv), D(z), 0])); }
    K.mat(mat).loft3(ur, { crease: 60, uvSwap: true });
    if (K.detail(0)) for (let k = 0; k < (short ? 2 : 3); k++) for (const sx of [-1, 1]) K.mat('bore').box(D(1), D(5), D(12), { p: P3(sx * 12.8, yB + 22, gt0 + 26 + k * 26), b: 0, ao: .4 });
    K.mat('stamp').lathe(LP([[17, h1 - 4], [21, h1 - 3, 1], [21, h1 + 3, 1], [17, h1 + 4]]), { p: P3(0, yB - 3, 0), segs: 24 });
  }
  // lower: magwell, trigger guard (stamped), mag release paddle, grip
  guardLoop(K, [[-36, -1], [22, -1], [22, -12, 3], [14, -26, 5], [-22, -28, 6], [-36, -14, 4]], [[-28, -3], [16, -3, 1.5], [16, -10, 3], [9, -22, 4], [-18, -23.5, 4], [-28.5, -12, 3]], 14, 1.6, 'stamp');
  triggerPart(K, [0, 4, 0], { face: 'curved', len: 18, w: 7, mat: 'metal' });
  if (K.detail(0)) K.mat('stamp').extrude(SH(K, [[20, -1], [26, -1], [28, -14, 2], [21, -16, 2]], .4), D(14), { b: D(.6), bs: 1 });
  const hr = longGrip(K, { z: -46, y: -1, ang: .36, len: 96, w: 29, f: 15, b: 20, mat: 'grip', grooves: S.gripGrooves || false, flare: 1.4 });
  const mag = ctx.intr.mag;
  rmag(K, { kind: S.mag || 'ak', top: [60, 2], rake: .02, variant: mag });
  // stocks
  K.mat('stamp').extrude(SH(K, [[zR - 2, 8], [zR + 14, 8], [zR + 14, top - 10], [zR - 2, top - 10]], .5), D(w + 3), { b: D(1), bs: 1 });   // rear trunnion block
  if (S.stock === 'wood') {
    fieldStock(K, { z0: zR - 2, yTop: top - 8, len: S.stockLen || 300, mat: 'wood', drop: 30, butt: 118, w: 38, wrist: false, straight: true });
    if (K.detail(0)) K.mat('stamp').extrude(SH(K, [[zR - 4, top - 11], [zR - 96, top - 22, 1], [zR - 96, top - 18], [zR - 4, top - 7]], .3), D(10), { b: D(.6), bs: 1 });
  } else if (S.stock === 'side') {     // side-folding adjustable skeleton stock (folds to the right)
    K.mat('stamp').extrude(SH(K, [[zR - 22, 12], [zR - 2, 12], [zR - 2, top - 10], [zR - 22, top - 10, 3]], .6), D(w + 2), { b: D(2), bs: 2 });
    K.part('stock', { pivot: P3(w / 2, 30, zR - 22), meta: { fold: { r: [0, 2.95, 0], p: [D(22), 0, D(4)] } } });
    K.mat('furn').lathe(LP([[0, zR - 250], [14, zR - 250, 1], [14, zR - 26, 1], [16, zR - 24], [0, zR - 22]]), { p: P3(0, 36, 0), segs: 24, crease: 40 });
    K.mat('furn').extrude(SH(K, [[zR - 262, 64, 6], [zR - 130, 58, 8], [zR - 70, 44, 6], [zR - 150, 30, 4], [zR - 262, 32, 4]], .8), D(34), { b: D(4), bs: K.lod ? 1 : 3 });
    K.mat('furn').extrude(SH(K, [[zR - 268, 62, 5], [zR - 236, 62, 5], [zR - 228, -50, 8], [zR - 236, -66, 6], [zR - 268, -66, 6]], .8), D(40), { b: D(4), bs: K.lod ? 1 : 3, holes: K.detail(1) ? [SH(K, [[zR - 258, 20, 4], [zR - 240, 20, 4], [zR - 238, -40, 4], [zR - 258, -48, 4]], .6)] : [] });
    K.mat('rubber').extrude(SH(K, [[zR - 280, 64, 5], [zR - 266, 64], [zR - 266, -68], [zR - 280, -68, 6]], .6), D(42), { b: D(3), bs: 2 });
    K.use('body');
  } else if (S.stock === 'tri') {      // triangular steel side-folder (folds to the left)
    K.part('stock', { pivot: P3(-w / 2, 28, zR - 4), meta: { fold: { r: [0, -2.98, 0], p: [-D(20), 0, D(2)] } } });
    const zb = zR - 236; K.mat('stamp').sweep([P3(0, top - 14, zR - 4), P3(0, top - 22, zb + 8)], { rad: D(5), segs: 10 }); K.mat('stamp').sweep([P3(0, 12, zR - 4), P3(0, -6, zb + 50), P3(0, top - 26, zb + 10)], { rad: D(5), segs: 10 });
    K.mat('stamp').extrude(SH(K, [[zb - 4, top - 14, 6], [zb + 14, top - 14, 4], [zb + 14, -56, 4], [zb - 4, -60, 8]], .8), D(40), { b: D(3), bs: 2, holes: K.detail(1) ? [SH(K, [[zb + 1, top - 26, 3], [zb + 9, top - 26, 3], [zb + 9, -44, 3], [zb + 1, -46, 3]], .5)] : [] });
    K.use('body');
  }
  if (S.coverRail) { /* dust cover rail is part of akReceiver */ } else akSideMount(K, { z0: -96, z1: 24, w, top, yRail: top + 10 });
  K.node('belt', P3(0, 0, 0), [0, 0, 0]);
  const hgBot = S.hg === 'quad' ? yB + 2 - 21 - 8.2 : yB - 22;
  sockets(K, { optic: [[0, S.coverRail ? top + 10 : top + 19, -36], S.coverRail ? 'cover' : null], muzzle: [[0, yB, zM]], under: [[0, hgBot, (h0 + h1) / 2]], side: [[S.hg === 'quad' ? 29.2 : 20, yB - 3, (h0 + h1) / 2 + 10]], mag: [[0, 2, 60], null, [.02, 0, 0]], stock: [[0, 30, zR - 2]], barrel: [[0, yB, zF]] });
  muzzleNode(K, yB, zM + md + .2); ejectNode(K, [w / 2 + 1, top - 18, 20]);
  handNodes(K, hr, { p: [0, hgBot, (h0 + h1) / 2 - 10], kind: 'hold' });
  sightMeta(K, [0, sLine, zFS], [0, sLine, rz], S.relief || 260);
  K.meta.stock = { kind: S.stock === 'wood' ? 'fixed' : 'fold', y: 30, z: zR - 2 };
};
Object.assign(MODEL_SPECS, {
  purga: { b: 'ak', pal: 'wood', wear: 1.3, furn: 'wood', stock: 'wood', muzzle: 'ak47', mag: 'ak', hood: 'closed', stockLen: 290,
    mats: { stamp: 'park', rcv: 'park', barrel: 'park', metal: 'park', wood: 'laminate_dk', grip: 'bakelite', mag: 'park', alu: 'alu_blk' } },
  taiga: { b: 'ak', pal: 'polymer', wear: .7, furn: 'poly', stock: 'side', muzzle: 'ak74', mag: 'ak545', hg: 'quad', coverRail: true, hood: 'open', gripGrooves: true,
    mats: { stamp: 'park', rcv: 'park', barrel: 'park', metal: 'dksteel', furn: 'poly_blk', grip: 'poly_grp', mag: 'poly_brn', alu: 'alu_blk' } },
  kroha: { b: 'ak', pal: 'wood', wear: 1.5, furn: 'wood', stock: 'tri', muzzle: 'booster', mag: 'ak', hood: 'open', sLine: 62,
    mats: { stamp: 'blued', rcv: 'blued', barrel: 'blued', metal: 'blued', wood: 'walnut', grip: 'bakelite', mag: 'blued', alu: 'alu_blk' } },
});

// ---- bolt actions (rook, arbiter) and the anti-materiel rifle (bjorn) ----------------------------------------------------
/** round bolt action along z (mm) on the bore axis yB: receiver tube with ejection port (right), recoil lug, bolt (part) with handle */
function boltAction(K, { yB, z0, z1, r = 17, port = [-26, 46], handle = 'tactical', knob = 9, mat = 'rcv', boltMat = 'bright', railY = null, railMat = 'alu', rail20 = true }) {
  const n = 34, pr = (K2, za, zb) => K2.mat(mat).lathe(LP([[r - 3, za], [r, za], [r, zb], [r - 3, zb]]), { p: P3(0, yB, 0), segs: n, crease: 60 });
  K.mat(mat).lathe(LP([[0, z0 - 4], [r - 4, z0 - 4, 1], [r, z0, 1], [r, port[0]]]), { p: P3(0, yB, 0), segs: n, crease: 40 });
  if (K.detail(1)) K.mat(mat).lathe(LP([[r, port[0]], [r, port[1]], [r - 3, port[1]], [r - 3, port[0]], [r, port[0]]]), { p: P3(0, yB, 0), segs: 26, a0: .55, a1: TAU - .5, crease: 60 }); else pr(K, port[0], port[1]);
  K.mat(mat).lathe(LP([[r, port[1]], [r, z1 - 3, 1], [r - 2, z1], [9, z1]]), { p: P3(0, yB, 0), segs: n, crease: 40 });
  K.mat(mat).extrude(SH(K, [[z1 - 16, yB - r - 5], [z1, yB - r - 5], [z1, yB - 6], [z1 - 16, yB - 6]], .5), D(r * 1.6), { b: D(1), bs: 1 });   // recoil lug
  if (K.detail(0)) for (const zz of [z0 + 20, z1 - 30]) K.screw({ p: P3(0, yB - r - .2, zz), axis: '-y', d: D(6), h: D(1), type: 'hex', mat: 'metal' });
  if (railY !== null) {   // one-piece (20 MOA) scope base on top
    K.mat(railMat).extrude(SH(K, [[z0 + 2, yB + r - 4], [z1 - 2, yB + r - 4], [z1 - 2, railY - (rail20 ? .2 : 0)], [z0 + 2, railY + (rail20 ? 1.2 : 0)]], .4), D(16), { b: D(.6), bs: 1 });
    K.rail(D(z1 - z0 - 6), { p: P3(0, railY, z0 + 3), marks: true });
  }
  // bolt: body, rear shroud, handle with knob, visible lugs through the port
  K.part('bolt', { pivot: P3(0, yB, z0), meta: { cycleR: [0, 0, 1.05], slide: [0, 0, -D(port[1] - port[0] + 34)] } });
  K.mat(boltMat).lathe(LP([[0, z0 - 26], [7, z0 - 26, 1], [10.6, z0 - 22, 1], [10.6, z0 - 6], [9.4, z0 - 4], [9.4, port[1] - 4, 1], [8, port[1]], [0, port[1]]]), { p: P3(0, yB, 0), segs: 26, crease: 35 });
  if (K.detail(0)) for (let k = 0; k < 3; k++) K.mat(boltMat).lathe(LP([[9.45, port[0] + 8 + k * 18], [9.2, port[0] + 9 + k * 18], [9.45, port[0] + 10 + k * 18]]), { p: P3(0, yB, 0), segs: 26 });
  K.mat('dark').lathe(LP([[0, z0 - 46], [6, z0 - 46, 1], [11.6, z0 - 40, 1], [12.6, z0 - 28, 1], [11, z0 - 26]]), { p: P3(0, yB, 0), segs: 26, crease: 35 });
  const hz = z0 + 4, hp = handle === 'straight' ? [[9, 0, hz], [26, -12, hz - 4], [38, -24, hz - 10]] : [[9, 0, hz], [24, -6, hz - 6], [32, -18, hz - 16], [34, -28, hz - 22]];
  K.mat(boltMat).sweep(hp.map(([x, y, z]) => P3(x, yB + y, z)), { rads: hp.map((_, i) => D(i ? 3.6 : 5)), segs: 12 });
  const kp = hp[hp.length - 1];
  K.mat(handle === 'tactical' ? 'furn' : boltMat).sphere(D(knob), { p: P3(kp[0] + 3, yB + kp[1] - 4, kp[2] - 2), segs: 20, s: [1, 1.15, 1] });
  K.use('body');
}
/** bolt-gun trigger guard + box magazine well (bottom metal), mm */
function bottomMetal(K, { zm0, zm1, y = -6, w = 30, mat = 'metal' }) {
  K.mat(mat).extrude(SH(K, [[-34, y + 8], [zm1 + 4, y + 8], [zm1 + 4, y - 6, 2], [zm0 - 2, y - 6], [zm0 - 4, y - 2], [-34, y + 2]], .5), D(w), { b: D(1), bs: 2 });
  guardLoop(K, [[-34, y + 2], [zm0 - 2, y + 2], [zm0 - 3, y - 12, 4], [zm0 - 10, y - 26, 6], [-26, y - 28, 6], [-36, y - 14, 5]], [[-26, y - 1], [zm0 - 10, y - 1, 2], [zm0 - 10, y - 10, 4], [zm0 - 16, y - 21, 5], [-20, y - 22.6, 5], [-27, y - 11, 4]], 11, 1.8, mat);
  if (K.detail(0)) K.mat(mat).extrude(SH(K, [[zm0 - 9, y - 2], [zm0 - 3, y - 2], [zm0 - 3, y - 12, 1.5], [zm0 - 9, y - 10, 1.5]], .4), D(14), { b: D(.5), bs: 1 });   // mag release lever
}
BUILDERS.bolt = (K, S, gun, ctx) => {
  const yB = 36, r = S.rcvR || 17, z0 = -116, z1 = 104, bm = barrelMod(ctx), bl = (S.bl || gun.model.barrel * 1000) + bm.ext, zC = 52, zM = zC + bl;
  const railY = yB + r + 3, rT = railY + 9, chassis = !!S.chassis;
  boltAction(K, { yB, z0, z1, r, port: [-30, 52], handle: chassis ? 'tactical' : 'tactical', knob: chassis ? 10 : 8.6, railY, mat: 'rcv', boltMat: S.boltMat || 'bright' });
  // barrel: heavy contour (fluted on the chassis gun) + thread / crown, muzzle device
  const br = bm.heavy || (S.bR || 11), flute = S.flutes && K.detail(1) ? (a, z) => (z > D(z1 + 60) && z < D(zM - 50) ? 1 - .08 * Math.max(0, Math.cos(a * 6)) ** 6 : 1) : null;
  K.mat('barrel').lathe(LP([[5, z1 - 2], [r - 1, z1 - 2], [r - 1, z1 + 6, 1], [br + 3, z1 + 40], [br, z1 + 120], [br - (S.taper || 2), zM - 30], [br - (S.taper || 2), zM - 2, 1], [br - (S.taper || 2) - 1.2, zM], [4, zM]]), { p: P3(0, yB, 0), segs: 30, crease: 30, rmod: flute });
  K.mat('bore').lathe(LP([[3.2, zM - .1], [3.2, zM - 30]]), { p: P3(0, yB, 0), segs: 12 });
  const md = mdev(K, S.muzzle || 'crown', { z: zM, y: yB, mat: 'barrel', s: S.mdScale || 1.1 });
  // magazine (detachable box) + bottom metal
  const zm0 = 4, zm1 = 4 + (S.magD || 82);
  bottomMetal(K, { zm0, zm1, y: chassis ? -2 : -8, w: chassis ? 34 : 30, mat: chassis ? 'alu' : 'metal' });
  triggerPart(K, [0, 4, 0], { face: 'flat', len: 20, w: 7, mat: S.trigMat || 'metal' });
  rmag(K, { kind: S.mag || 'sniper', top: [(zm0 + zm1) / 2, 6], variant: ctx.intr.mag });
  let hr, hgBot, hgSide, hz;
  if (chassis) {
    // aluminium chassis: centre section, long M-LOK forend, vertical grip, folding skeleton stock with cheek riser
    K.mat('alu').extrude(SH(K, [[z0 - 30, yB - 6], [z1 + 30, yB - 6], [z1 + 30, -2, 4], [zm1 + 8, -4], [zm0 - 40, -4], [-60, -6, 6], [z0 - 30, 8, 8]], 1), D(40), { b: D(2.4), bs: 2, holes: K.detail(1) ? [SH(K, [[-100, 26, 4], [-74, 26, 4], [-74, 8, 4], [-100, 8, 4]], .5)] : [] });
    const hz0 = z1 + 30, hz1 = Math.min(zM - 60, hz0 + (S.hgLen || 420));
    mlokGuard(K, { z0: hz0, z1: hz1, yc: yB - 1, R: 24, mat: 'alu', railTop: rT - 9 + .01 });
    hr = longGrip(K, { z: -48, y: -2, ang: .2, len: 96, w: 30, f: 16, b: 21, mat: 'grip', grooves: true, flare: 3 });
    K.mat('alu').extrude(SH(K, [[z0 - 30, yB + 4], [z0 - 6, yB + 4], [z0 - 6, -6, 3], [z0 - 30, 4, 3]], .6), D(36), { b: D(2), bs: 2 });   // hinge block
    K.part('stock', { pivot: P3(18, yB - 10, z0 - 30), meta: { fold: { r: [0, 2.95, 0], p: [D(30), 0, 0] } } });
    const zb = z0 - 30 - (S.stockLen || 300);
    K.mat('alu').extrude(SH(K, [[z0 - 32, yB + 4, 3], [zb + 20, yB + 4, 4], [zb + 20, -96, 6], [zb + 50, -96, 8], [z0 - 120, -30, 20], [z0 - 32, -6, 6]], 1), D(26), { b: D(2), bs: 2, holes: K.detail(1) ? [SH(K, [[zb + 36, -10, 6], [z0 - 70, -10, 6], [z0 - 70, -2, 4], [zb + 36, -2, 4]], .6), SH(K, [[zb + 34, -40, 8], [z0 - 130, -40, 10], [zb + 34, -80, 6]], .6)] : [] });
    K.mat('furn').extrude(SH(K, [[zb + 24, yB + 26, 8], [z0 - 70, yB + 26, 10], [z0 - 66, yB + 12, 4], [zb + 28, yB + 12, 4]], .8), D(34), { b: D(4), bs: K.lod ? 1 : 3 });
    for (const zz of [zb + 60, z0 - 100]) K.mat('metal').cyl(D(4), D(14), { p: P3(0, yB + 2, zz), axis: 'y', segs: 12 });
    K.mat('rubber').extrude(SH(K, [[zb - 6, yB + 8, 5], [zb + 22, yB + 8], [zb + 22, -100], [zb - 4, -102, 6]], .6), D(42), { b: D(3), bs: 2 });
    if (K.detail(0)) K.mat('metal').lathe(LP([[0, 0], [9, 0, 1], [9.4, 1], [9.4, 10, 1], [8, 11], [0, 11]]), { axis: 'x', p: P3(13, yB + 18, z0 - 96), segs: 18, rmod: a => 1 - .05 * (Math.cos(a * 12) > .3 ? 1 : 0) });
    K.use('body');
    hgBot = yB - 1 - 24; hgSide = 24; hz = (hz0 + hz1) / 2;
  } else {
    // synthetic hunting / tactical stock: forend, bedding block, near-vertical grip, butt with comb + recoil pad, sling studs
    const W = 44, f1 = Math.min(zM - 120, z1 + 230);
    K.mat('furn').extrude(SH(K, [[z1 - 20, yB - 12], [f1, yB - 12, 6], [f1 + 6, yB - 22, 10], [f1, -12, 12], [zm1 + 6, -10, 8], [zm1, -12], [zm0, -12], [-30, -10], [-44, -6, 4], [-40, 14], [z0 + 8, yB - 8], [z1 - 20, yB - 8]], 1.2), D(W), { b: D(7), bs: K.lod ? 1 : 3 });
    K.mat('bore').box(D(26), D(3), D(f1 - z1 - 10), { p: P3(0, yB - 11.5, (f1 + z1) / 2 + 4), b: 0, ao: .35 });
    hr = longGrip(K, { z: -52, y: 2, ang: .3, len: 92, w: 34, f: 18, b: 25, mat: 'furn', grooves: false, flare: 4, rows: 12, hump: 3 });
    const zb = z0 - (S.stockLen || 310);
    K.mat('furn').extrude(SH(K, [[z0 + 10, yB - 8], [z0 - 30, yB - 2, 30], [zb + 40, yB + 10, 30], [zb, yB + 10, 8], [zb, -86, 10], [zb + 50, -82, 30], [-96, -36, 40], [-74, -10, 16], [-62, 8, 10], [z0 + 30, yB - 10]], 1.2), D(40), { b: D(9), bs: K.lod ? 1 : 3 });
    K.mat('furn').extrude(SH(K, [[zb + 8, yB + 20, 10], [zb + 150, yB + 18, 20], [zb + 196, yB + 4, 12], [zb + 8, yB + 4, 4]], 1), D(32), { b: D(7), bs: K.lod ? 1 : 3 });   // raised comb
    K.mat('rubber').extrude(SH(K, [[zb - 22, yB + 16, 6], [zb + 1, yB + 16], [zb + 1, -88], [zb - 20, -90, 8]], .8), D(44), { b: D(4), bs: K.lod ? 1 : 3 });
    K.mat('dark').extrude(SH(K, [[zb + 1, yB + 15], [zb + 4, yB + 15], [zb + 4, -87], [zb + 1, -87]], .3), D(42), { b: D(.6), bs: 1 });
    swivel(K, [0, -86, zb + 60]); swivel(K, [0, yB - 32, f1 - 40]); swivel(K, [0, yB - 32, f1 - 90]);
    hgBot = -11.6; hgSide = W / 2; hz = (z1 + f1) / 2;
  }
  // built-in scope on the rail (part 'scope' hides under an optic attachment)
  const sc = S.scope, ys = rT + Math.max(sc.obj / 2 + 9, sc.tube / 2 + 20);
  K.part('scope', { pivot: P3(0, ys, -20), meta: { replace: 'optic' } });
  const sz0 = -10 - sc.len * .52;
  const g = scopeGeom(K, { z0: sz0, len: sc.len, y: ys, tube: sc.tube, obj: sc.obj, oc: sc.oc || 42, railY: rT, rings: [z0 + 28, z1 - 30], mat: 'alu2', param: true, caps: true, lensPart: 'scopeLens' });
  K.use('body'); K.parts.get('scopeLens').parent = 'scope';
  scopeSight(K, g, ys, sc.relief || 90, gun.scope && gun.scope.reticle, 'scopeLens');
  sockets(K, { optic: [[0, rT, -6]], canted: [[0, rT, z0 + 11]], muzzle: [[0, yB, zM]], under: [[0, hgBot, hz + 30]], side: S.side ? [[hgSide, yB - 6, hz + 40]] : null, mag: [[0, 6, (zm0 + zm1) / 2]], stock: S.stockMount ? [[0, yB - 10, z0 - 30]] : null });
  muzzleNode(K, yB, zM + md + .2); ejectNode(K, [r + 1, yB, 10]);
  handNodes(K, hr, { p: [0, hgBot, hz - 30], kind: 'hold' });
  K.meta.stock = { kind: chassis ? 'fold' : 'fixed', y: yB - 10, z: z0 - 30 };
};
BUILDERS.boltAM = (K, S, gun, ctx) => {
  // .50 bolt rifle: rectangular aluminium upper with long rail and top handle, steel barrel with the two-chamber brake, lower with
  // grip + 5-round box, adjustable stock with monopod, folding bipod (part 'bipod', replaced by an under-barrel bipod attachment)
  const yB = 48, z0 = -150, z1 = 210, bm = barrelMod(ctx), bl = (S.bl || gun.model.barrel * 1000) + bm.ext, zC = 70, zM = zC + bl, w = 48;
  const top = yB + 30, rT = top + 9;
  K.mat('rcv').extrude(SH(K, [[z0, yB - 26, 4], [z1, yB - 26, 3], [z1 + 30, yB - 16, 4], [z1 + 30, top, 3], [z0, top, 4]], 1), D(w), { b: D(2.4), bs: 2, holes: K.detail(1) ? [SH(K, [[60, yB - 12, 6], [190, yB - 12, 6], [190, yB + 14, 6], [60, yB + 14, 6]], .6)] : [] });
  K.mat('bore').box(D(w - 8), D(24), D(126), { p: P3(0, yB + 1, 125), b: 0, ao: .3 });
  K.rail(D(z1 - z0 + 40), { p: P3(0, top, z0 + 4), marks: true });
  K.mat('rcv').extrude(SH(K, [[z0 + 20, yB - 30], [z1 - 10, yB - 30], [z1 - 10, -2, 4], [zC + 40, -8, 3], [-10, -8], [-70, -8, 6], [z0 + 20, 10, 8]], 1), D(w - 6), { b: D(2), bs: 2 });
  // bolt (part): big handle on the right
  K.part('bolt', { pivot: P3(0, yB, -40), meta: { cycleR: [0, 0, 1.1], slide: [0, 0, -D(150)] } });
  K.mat('bright').lathe(LP([[0, -110], [12, -110, 1], [12, 56, 1], [10, 60], [0, 60]]), { p: P3(0, yB, 0), segs: 24 });
  K.mat('bright').sweep([P3(10, yB, -50), P3(36, yB - 6, -56), P3(46, yB - 20, -64)], { rads: [D(6), D(5), D(5)], segs: 12 });
  K.mat('furn').sphere(D(11), { p: P3(49, yB - 26, -66), segs: 20, s: [1, 1.2, 1] });
  K.use('body');
  if (K.detail(1)) K.mat('bore').box(D(1), D(26), D(120), { p: P3(w / 2 + .1, yB, -20), b: 0, ao: .4 });
  // barrel + brake + barrel collar
  const br = bm.heavy ? bm.heavy + 4 : 15.5;
  K.mat('barrel').lathe(LP([[6, z1 - 10], [22, z1 - 10], [22, z1 + 30, 1], [br + 2, z1 + 46], [br, z1 + 80], [br - 2, zM - 30], [br - 2, zM]]), { p: P3(0, yB, 0), segs: 32, crease: 30, rmod: K.detail(1) ? (a, z) => (z > D(z1 + 100) && z < D(zM - 60) ? 1 - .07 * Math.max(0, Math.cos(a * 8)) ** 6 : 1) : null });
  const md = mdev(K, 'am', { z: zM, y: yB, mat: 'barrel', s: 1 });
  // top carry handle (part, folds)
  K.part('handle', { pivot: P3(0, rT, 252), meta: { fold: { r: [-1.4, 0, 0] } } });
  K.mat('metal').extrude(SH(K, [[0, 0], [10, 0], [6, 26, 4], [-52, 28, 6], [-58, 24, 4], [-62, 0], [-48, 0], [-44, 16, 4], [-4, 15, 4]], .8), D(18), { p: P3(0, rT, 252), b: D(1.6), bs: 2 });
  K.use('body');
  // lower: grip, guard, magazine
  guardLoop(K, [[-36, -6], [24, -6], [24, -18, 4], [16, -34, 6], [-26, -36, 6], [-38, -20, 5]], [[-28, -9], [16, -9, 2], [16, -16, 4], [10, -29, 5], [-20, -30, 5], [-29, -18, 4]], 12, 2, 'rcv');
  triggerPart(K, [0, -2, 0], { face: 'flat', len: 20, w: 8 });
  const hr = longGrip(K, { z: -54, y: -6, ang: .26, len: 104, w: 34, f: 17, b: 24, mat: 'grip', grooves: true, flare: 4 });
  rmag(K, { kind: 'bmg', top: [100, -6], variant: ctx.intr.mag });
  // stock: buffer housing + adjustable butt with cheek piece and monopod
  K.mat('rcv').lathe(LP([[0, z0 - 220], [24, z0 - 220, 1], [26, z0 - 216, 1], [26, z0 - 4, 1], [22, z0], [0, z0]]), { p: P3(0, yB - 4, 0), segs: 30 });
  K.mat('furn').extrude(SH(K, [[z0 - 280, yB + 30, 6], [z0 - 140, yB + 30, 10], [z0 - 130, yB + 18, 4], [z0 - 280, yB + 18, 4]], .8), D(40), { b: D(4), bs: K.lod ? 1 : 3 });
  K.mat('rcv').extrude(SH(K, [[z0 - 296, yB + 34, 5], [z0 - 216, yB + 30], [z0 - 216, yB - 30], [z0 - 260, -70, 10], [z0 - 296, -76, 6]], 1), D(46), { b: D(3), bs: 2, holes: K.detail(1) ? [SH(K, [[z0 - 280, yB - 10, 6], [z0 - 236, yB - 10, 6], [z0 - 270, -50, 6]], .6)] : [] });
  K.mat('rubber').extrude(SH(K, [[z0 - 316, yB + 36, 6], [z0 - 294, yB + 36], [z0 - 294, -78], [z0 - 312, -80, 8]], .8), D(48), { b: D(4), bs: K.lod ? 1 : 3 });
  K.mat('metal').lathe(LP([[0, 0], [10, 0, 1], [10, 8, 1], [8, 10], [8, 80, 1], [0, 82]]), { axis: 'y', p: P3(0, -140, z0 - 250), segs: 18 });
  // folding bipod (part)
  K.part('bipod', { pivot: P3(0, yB - 16, z1 + 70), meta: { deployR: [-1.5, 0, 0], replace: 'bipod' } });
  K.mat('metal').extrude(SH(K, [[-16, 6], [16, 6], [16, -14, 4], [-16, -14, 4]], .6), D(40), { plane: 'xy', off: D(z1 + 50), p: P3(0, yB - 18, 0), b: D(1.6), bs: 2 });
  for (const sx of [-1, 1]) { K.mat('metal').sweep([P3(sx * 14, yB - 30, z1 + 70), P3(sx * 12, yB - 26, z1 + 330)], { rad: D(7), segs: 12 }); K.mat('rubber').sphere(D(10), { p: P3(sx * 12, yB - 26, z1 + 340), segs: 14, s: [1, .8, 1.4] }); }
  K.use('body');
  const sc = S.scope, ys = rT + Math.max(sc.obj / 2 + 9, sc.tube / 2 + 20);
  K.part('scope', { pivot: P3(0, ys, 0), meta: { replace: 'optic' } });
  const sz0 = -20 - sc.len * .52;
  const g = scopeGeom(K, { z0: sz0, len: sc.len, y: ys, tube: sc.tube, obj: sc.obj, oc: sc.oc || 44, railY: rT, rings: [-110, 90], mat: 'alu2', param: true, caps: true, lensPart: 'scopeLens', turretZ: -20 });
  K.use('body'); K.parts.get('scopeLens').parent = 'scope';
  scopeSight(K, g, ys, sc.relief || 95, gun.scope && gun.scope.reticle, 'scopeLens');
  sockets(K, { optic: [[0, rT, -20]], canted: [[0, rT, z0 + 14]], muzzle: [[0, yB, zM]], under: [[0, yB - 18, z1 + 70]], mag: [[0, -6, 100]] });
  muzzleNode(K, yB, zM + md + .2); ejectNode(K, [w / 2 + 1, yB, -20]);
  handNodes(K, hr, { p: [0, -60, z0 - 250], kind: 'support' });
  K.meta.stock = { kind: 'fixed', y: yB - 4, z: z0 };
};
Object.assign(MODEL_SPECS, {
  rook: { b: 'bolt', pal: 'black', wear: .7, mats: { rcv: 'nitride', alu: 'alu_blk', alu2: 'alu_blk', furn: 'poly_od', grip: 'poly_od', barrel: 'nitride', metal: 'dksteel', mag: 'poly_blk' },
    bR: 10.6, taper: 2.6, muzzle: 'crown', stockLen: 300, side: false, scope: { len: 300, tube: 30, obj: 42, oc: 42, relief: 90 } },
  arbiter: { b: 'bolt', pal: 'black', wear: .5, chassis: true, mats: { rcv: 'nitride', alu: 'cer_od', alu2: 'alu_blk', furn: 'poly_od', grip: 'poly_od', barrel: 'nitride', metal: 'dksteel', mag: 'poly_blk' },
    rcvR: 18.5, bR: 12.4, taper: 2, flutes: true, muzzle: 'brake', mdScale: 1.2, mag: 'sniper338', magD: 98, stockLen: 290, hgLen: 440, side: true, stockMount: true,
    scope: { len: 340, tube: 34, obj: 50, oc: 44, relief: 92 } },
  bjorn: { b: 'boltAM', pal: 'black', wear: .6, mats: { rcv: 'alu_blk', alu: 'alu_blk', alu2: 'alu_blk', furn: 'poly_blk', grip: 'poly_grp', barrel: 'park', metal: 'dksteel', mag: 'dksteel' },
    scope: { len: 380, tube: 34, obj: 56, oc: 46, relief: 96 } },
});

// ---- bullpups (lodjur, kogarashi, jarv) ----------------------------------------------------------------------------------
BUILDERS.bullpup = (K, S, gun, ctx) => {
  const st = S.style || 'modern', yB = 52, bm = barrelMod(ctx), bl = (S.bl || gun.model.barrel * 1000) + bm.ext, zC = -118, zM = zC + bl;
  const zB = S.butt || -330, front = S.front || 40, W = S.w || 44, top = S.top || 74, cal = gun.bore === '762' ? '308' : '556';
  // shell (side profile) + cheek piece, trigger guard / hand guard, grip
  const shell = st === 'classic'
    ? [[zB, -54, 10], [zB, top - 10, 12], [zB + 40, top, 14], [-170, top, 6], [-160, yB + 4], [front + 20, yB + 4, 8], [front + 30, yB - 12, 10], [front, 0, 8], [-10, 0], [-40, -6], [-80, -6], [-150, -28, 16], [zB + 50, -60, 20]]
    : st === 'smooth'
      ? [[zB, -56, 12], [zB, top - 6, 14], [zB + 60, top + 2, 30], [front + 120, top, 30], [front + 160, yB + 10, 20], [front + 150, yB - 20, 14], [front + 40, yB - 26, 10], [front + 30, 0, 8], [-10, 0], [-40, -6], [-80, -6], [-150, -30, 20], [zB + 50, -62, 20]]
      : [[zB, -52, 6], [zB, top - 8, 8], [zB + 24, top, 6], [front + 60, top, 4], [front + 70, yB - 4, 4], [front + 60, yB - 22, 4], [front + 30, 0, 6], [-10, 0], [-40, -6], [-80, -6], [-150, -26, 10], [zB + 40, -58, 10]];
  K.mat('frame').extrude(SH(K, shell, 1.2), D(W), { b: D(st === 'modern' ? 4 : 8), bs: K.lod ? 1 : 3 });
  if (st !== 'smooth' && K.detail(1)) for (const sx of [-1, 1]) K.mat('frame').extrude(SH(K, [[zB + 30, 10, 6], [-170, 10, 6], [-170, top - 18, 6], [zB + 30, top - 18, 6]], .8), D(3), { off: sx > 0 ? D(W / 2 - 1) : -D(W / 2 + 2), b: D(1.2), bs: 2 });
  K.mat('rubber').extrude(SH(K, [[zB - 16, -56, 6], [zB + 1, -56], [zB + 1, top - 8], [zB - 14, top - 10, 6]], .8), D(W + 2), { b: D(4), bs: K.lod ? 1 : 3 });
  if (st === 'classic') guardLoop(K, [[-56, 0], [front + 10, 0], [front + 14, -40, 10], [front, -104, 18], [-40, -112, 16], [-62, -96, 10]], [[-34, -8], [front, -8, 4], [front + 2, -40, 8], [front - 10, -96, 12], [-26, -100, 10], [-34, -88, 6]], 18, 3, 'frame');
  else guardLoop(K, [[-36, -4], [front - 4, -4], [front - 2, -18, 6], [front - 12, -34, 8], [-24, -36, 8], [-38, -20, 5]], [[-28, -7], [front - 12, -7, 2], [front - 12, -16, 4], [front - 18, -28, 5], [-20, -29, 5], [-29, -18, 4]], 14, 2.4, 'frame');
  triggerPart(K, [0, -2, 0], { face: 'curved', len: 18, w: 7, mat: 'metal' });
  const hr = longGrip(K, { z: -50, y: -4, ang: st === 'classic' ? .36 : .3, len: 98, w: 30, f: 15, b: 22, mat: 'grip', grooves: st !== 'smooth', flare: 2 });
  // magazine behind the grip (+ release paddle), cheek / ejection cover, charging handle
  rmag(K, { kind: S.mag || (cal === '308' ? 'g3' : st === 'classic' ? 'trans' : 'pmag'), top: [-150, 0], rake: -.04, variant: ctx.intr.mag });
  if (K.detail(0)) K.mat('frame').extrude(SH(K, [[-112, -2], [-106, -2], [-104, -16, 2], [-112, -14, 2]], .4), D(20), { b: D(.6), bs: 1 });
  if (st !== 'smooth' && K.detail(1)) { K.mat('bore').box(D(1), D(18), D(64), { p: P3(W / 2 + .1, yB + 2, -150), b: 0, ao: .45 }); K.mat('frame').box(D(2), D(20), D(70), { p: P3(-W / 2 - .6, yB + 2, -150), b: D(.6) }); }
  K.part('charging', { pivot: P3(st === 'classic' ? -W / 2 : 0, yB + 10, front - 20), meta: { slide: [0, 0, -D(110)] } });
  if (st === 'classic') { K.mat('metal').box(D(8), D(10), D(16), { p: P3(-W / 2 - 4, yB + 8, -60), b: D(2) }); K.mat('metal').cyl(D(5), D(10), { p: P3(-W / 2 - 8, yB + 8, -60), axis: '-x', segs: 14 }); }
  else if (st === 'modern') { K.mat('metal').extrude(SH(K, [[-6, 0], [6, 0], [5, 14, 3], [-5, 14, 3]], .4), D(8), { plane: 'xy', off: D(front + 30), p: P3(-W / 2 - 1, yB, 0), r: [0, 0, HALF], b: D(1), bs: 2 }); }
  else { K.mat('metal').extrude(SH(K, [[-5, 0], [5, 0], [4, 12, 3], [-4, 12, 3]], .4), D(8), { plane: 'xy', off: D(front + 60), p: P3(0, top - 2, 0), b: D(1), bs: 2 }); }
  K.use('body');
  // barrel, gas, forend
  const br = bm.heavy || 9.4;
  K.mat('barrel').lathe(LP([[5, front - 20], [14, front - 20, 1], [14, front + 10, 1], [br, front + 16], [br, zM - 16, 1], [7.4, zM - 14], [7.4, zM], [4, zM]]), { p: P3(0, yB, 0), segs: 28, crease: 30 });
  K.mat('bore').lathe(LP([[2.9, zM - .1], [2.9, zM - 30]]), { p: P3(0, yB, 0), segs: 12 });
  let zFG = front + 120, hgBot;
  if (st === 'classic') {   // barrel jacket ribs + gas cylinder + folding foregrip (part)
    K.mat('rcv').lathe(LP([[br, front + 10], [16, front + 12, 1], [16, front + 60, 1], [12, front + 64]]), { p: P3(0, yB, 0), segs: 26, rmod: K.detail(0) ? (a, z) => 1 - .06 * (Math.cos(a * 10) > .5 ? 1 : 0) : null });
    K.mat('rcv').lathe(LP([[0, front + 60], [7, front + 60], [7, front + 150, 1], [5, front + 154], [0, front + 154]]), { p: P3(0, yB + 14, 0), segs: 16 });
    K.part('foregrip', { pivot: P3(0, yB - 12, front + 100), meta: { fold: { r: [1.3, 0, 0] } } });
    K.mat('rcv').extrude(SH(K, [[front + 86, yB + 4], [front + 114, yB + 4], [front + 112, yB - 18, 3], [front + 88, yB - 18, 3]], .5), D(24), { b: D(1.2), bs: 2 });
    K.mat('frame').lathe(LP([[0, 0], [13, 0, 1], [14, 4], [14, 84, 1], [12, 92, 1], [0, 92]]), { axis: 'y', p: P3(0, yB - 106, front + 100), segs: 22, rmod: K.detail(0) ? (a, z) => (z > D(10) && z < D(80) ? 1 - .05 * (Math.cos(a * 8) > .3 ? 1 : 0) : 1) : null });
    K.use('body');
    K.mat('rcv').lathe(LP([[9.4, front + 112], [13, front + 112, 1], [13, front + 168, 1], [9.4, front + 168]]), { p: P3(0, yB, 0), segs: 24 });
    K.mat('rcv').extrude(SH(K, [[front + 114, -6], [front + 166, -6], [front + 166, 6], [front + 114, 6]], .5), D(8), { off: D(11), p: P3(0, yB, 0), b: D(.8), bs: 1 });
    K.at({ p: P3(19, yB, 0), r: [0, 0, -HALF] }, () => K.rail(D(50), { p: P3(0, 0, front + 115) }));
    zFG = front + 100; hgBot = yB - 16;
  } else if (st === 'modern') {
    K.mat('frame').extrude(SH(K, [[front + 60, yB + 20, 3], [front + 210, yB + 20, 3], [front + 214, yB + 10, 3], [front + 214, yB - 18, 6], [front + 60, yB - 22, 4]], .8), D(40), { b: D(3), bs: 2, holes: K.detail(1) ? [SH(K, [[front + 90, yB - 6, 3], [front + 190, yB - 6, 3], [front + 190, yB + 4, 3], [front + 90, yB + 4, 3]], .5)] : [] });
    K.mat('dark').lathe(LP([[0, front + 214], [8, front + 214], [8, front + 236, 1], [6, front + 238], [0, front + 238]]), { p: P3(0, yB + 13, 0), segs: 16 });
    for (const sx of [-1, 1]) K.at({ p: P3(sx * 21, yB, 0), r: [0, 0, -sx * HALF] }, () => K.rail(D(70), { p: P3(0, 0, front + 120) }));
    hgBot = yB - 22;
  } else {   // smooth: forend enclosing the barrel up to front + 160, gas tube under it
    hgBot = yB - 26;
  }
  if (st !== 'classic') K.rail(D(front + (st === 'smooth' ? 150 : 210) + 190), { p: P3(0, top, -190), marks: true });
  // sights: classic = 1.5x optic in the carry handle; others flip-up irons on the rail
  const md = mdev(K, S.muzzle || 'flash', { z: zM, y: yB, mat: 'barrel', s: cal === '308' ? 1.08 : 1 });
  if (st === 'classic') {
    const ys = top + 42;
    K.mat('rcv').extrude(SH(K, [[-200, top - 4], [60, top - 4], [70, top + 4, 6], [40, ys - 14, 10], [-150, ys - 14, 10], [-190, top + 10, 8]], 1), D(26), { b: D(4), bs: K.lod ? 1 : 3, holes: K.detail(1) ? [SH(K, [[-130, top + 6, 6], [20, top + 6, 6], [20, ys - 24, 6], [-130, ys - 24, 6]], .8)] : [] });
    const g = scopeGeom(K, { z0: -175, len: 190, y: ys, tube: 30, obj: 30, oc: 36, mat: 'rcv', param: false, lensPart: 'scopeLens', turretZ: -60, elevR: 6, elevH: 6 });
    scopeSight(K, g, ys, 70, gun.scope && gun.scope.reticle || 'ring', 'scopeLens');
    if (K.detail(0)) K.mat('metal').extrude(SH(K, [[-2, 0], [2, 0], [1.5, 8, .5], [-1.5, 8, .5]], .3), D(2), { plane: 'xy', off: D(-60), p: P3(0, ys + 15, 0), b: D(.3), bs: 1 });
  } else {
    const sL = buis(K, 'sightRear', { z: -170, y: top + 9, kind: 'rear', h: 18 });
    buis(K, 'sightFront', { z: (st === 'smooth' ? front + 140 : front + 190), y: top + 9, kind: 'front', h: 18 });
    sightMeta(K, [0, sL, st === 'smooth' ? front + 140 : front + 190], [0, sL, -170], 70);
  }
  if (st === 'smooth') {     // forward ejection tube on the right + smooth front shell around the barrel
    K.mat('frame').extrude(SH(K, [[-120, yB - 4, 4], [front + 150, yB - 4, 6], [front + 150, yB + 12, 6], [-120, yB + 12, 4]], .6), D(10), { off: D(W / 2 - 3), b: D(2), bs: 2 });
    if (K.detail(0)) K.mat('bore').box(D(8), D(10), D(1), { p: P3(W / 2 + 2, yB + 4, front + 150.6), b: 0, ao: .3 });
  }
  if (K.detail(0)) { qdSocket(K, [W / 2 + .2, 30, zB + 40], 1, 'metal'); qdSocket(K, [-W / 2 - .2, 30, zB + 40], -1, 'metal'); }
  sockets(K, { optic: st === 'classic' ? null : [[0, top + 9, -40]], muzzle: [[0, yB, zM]], under: [[0, hgBot, st === 'classic' ? zFG + 60 : front + 130]], side: [[st === 'modern' ? 21 + 9 : st === 'classic' ? 28 : W / 2 + 2, yB, st === 'classic' ? front + 140 : front + 120]], mag: [[0, 0, -150], null, [-.04, 0, 0]], barrel: [[0, yB, front]] });
  muzzleNode(K, yB, zM + md + .2); ejectNode(K, st === 'smooth' ? [W / 2 + 2, yB + 4, front + 150] : [W / 2 + 1, yB + 2, -150], st === 'smooth' ? 'right' : 'right');
  handNodes(K, hr, st === 'classic' ? { p: [0, yB - 60, zFG], kind: 'grip' } : { p: [0, hgBot, front + 120], kind: 'hold' });
  if (st === 'classic') { const h = K.nodes.hand_l; h.part = 'foregrip'; }
};
Object.assign(MODEL_SPECS, {
  lodjur: { b: 'bullpup', style: 'classic', pal: 'polymer', wear: .5, butt: -336, front: 30, w: 46, top: 76, muzzle: 'flash', mag: 'trans',
    mats: { frame: 'poly_od', grip: 'poly_od', rcv: 'alu_blk', alu: 'alu_blk', barrel: 'nitride', metal: 'dksteel', mag: 'poly_od' } },
  kogarashi: { b: 'bullpup', style: 'modern', pal: 'black', wear: .5, butt: -300, front: 36, w: 42, top: 74, muzzle: 'prong', mag: 'pmag',
    mats: { frame: 'poly_blk', grip: 'poly_grp', rcv: 'alu_blk', alu: 'alu_blk', barrel: 'nitride', metal: 'dksteel', mag: 'poly_blk' } },
  jarv: { b: 'bullpup', style: 'smooth', pal: 'polymer', wear: .4, butt: -320, front: 30, w: 48, top: 80, muzzle: 'flash', mag: 'g3',
    mats: { frame: 'poly_fde', grip: 'poly_fdeg', rcv: 'alu_blk', alu: 'alu_blk', barrel: 'nitride', metal: 'dksteel', mag: 'poly_fde' } },
});

// ---- modular rifles (halberd, axion) --------------------------------------------------------------------------------------
BUILDERS.modular = (K, S, gun, ctx) => {
  const yB = 40, top = 62, rT = top + 9, zR = -110, bm = barrelMod(ctx), bl = (S.bl || gun.model.barrel * 1000) + bm.ext, zC = 40, zM = zC + bl, W = 36, zF = Math.min(zM - 150, 236);
  // monolithic upper: body with chamfered top, full-length rail, short side rails at the front, NRCH on the left (part)
  const cU = [[-W / 2, 0, 2], [W / 2, 0, 2], [W / 2, top - yB + 8, 0], [W / 2 - 4, top - yB + 18, 2], [10.6, top - yB + 18], [10.6, top - yB + 22], [-10.6, top - yB + 22], [-10.6, top - yB + 18], [-W / 2 + 4, top - yB + 18, 2], [-W / 2, top - yB + 8, 0]];
  cs(K, CSX(K, cU), zR, zF, yB - 18, { bb: 2, bf: 2, mat: 'rcv' });
  K.rail(D(zF - zR - 4), { p: P3(0, top, zR + 2), marks: true });
  for (const sx of [-1, 1]) K.at({ p: P3(sx * W / 2, yB + 6, 0), r: [0, 0, -sx * HALF] }, () => K.rail(D(90), { p: P3(0, 0, zF - 100) }));
  K.mat('rcv').extrude(SH(K, [[zF - 2, yB - 18], [zF + 70, yB - 14, 4], [zF + 70, yB + 18, 4], [zF - 2, yB + 22]], .6), D(W - 6), { b: D(2), bs: 2 });   // barrel nut housing
  if (K.detail(1)) K.mat('bore').box(D(1), D(18), D(70), { p: P3(W / 2 + .1, yB - 2, 0), b: 0, ao: .4 });
  K.part('charging', { pivot: P3(-W / 2, yB + 8, 60), meta: { slide: [0, 0, -D(130)] } });
  K.mat('metal').extrude(SH(K, [[0, -4], [8, -4, 2], [8, 4, 2], [0, 4]], .4), D(16), { plane: 'xz', off: D(yB + 4), p: P3(-W / 2 - 1, 0, 60), r: [0, 0, 0], b: D(1), bs: 1 });
  K.mat('metal').lathe(LP([[0, 0], [6, 0, 1], [6.6, 3], [6.6, 18, 1], [5, 20], [0, 20]]), { axis: 'x', p: P3(-W / 2 - 22, yB + 8, 64), segs: 18 });
  K.use('body');
  // lower (polymer): integrated guard, magwell, grip, ambi mag release, selector
  const MT = MAGS[S.mag], mIn = MT.w + .8, mLin = MT.d + 2.4, mzc = 66;
  K.mat('frame').extrude(SH(K, [[zR + 10, yB - 18], [zF - 10, yB - 18], [zF - 6, yB - 24, 3], [mzc + mLin / 2 + 6, yB - 30, 6], [mzc + mLin / 2 + 2, -26, 4], [mzc - mLin / 2 - 2, -26, 4], [mzc - mLin / 2 - 4, 0, 3], [-34, 0], [-70, -2, 6], [zR + 10, 12, 8]], 1), D(W - 6), { b: D(2.4), bs: K.lod ? 1 : 2 });
  guardLoop(K, [[-32, 1], [mzc - mLin / 2, 1], [mzc - mLin / 2, -12, 4], [mzc - mLin / 2 - 8, -26, 6], [-20, -28, 6], [-34, -14, 5]], [[-24, -2], [mzc - mLin / 2 - 6, -2, 2], [mzc - mLin / 2 - 6, -11, 4], [mzc - mLin / 2 - 12, -21, 5], [-16, -23, 5], [-25, -12, 4]], 12, 2, 'frame');
  triggerPart(K, [0, 6, 0], { face: 'flat', len: 20, w: 7, mat: 'metal' });
  const hr = longGrip(K, { z: -52, y: 0, ang: .4, len: 100, w: 30, f: 15, b: 23, mat: 'grip', grooves: true, flare: 2.4 });
  rmag(K, { kind: S.mag, top: [mzc, -4], variant: ctx.intr.mag });
  if (K.detail(0)) for (const sx of [-1, 1]) { K.mat('metal').extrude(SH(K, [[-3, 0], [3, 0], [2, 12, 1.4], [-2, 12, 1.4]], .4), D(2), { p: P3(sx * ((W - 6) / 2 + 1), 12, -42), r: [-1.2, 0, 0], b: D(.4), bs: 1 }); K.mat('metal').cyl(D(4.4), D(3), { p: P3(sx * ((W - 6) / 2 + 1), -6, mzc - mLin / 2 - 8), axis: sx > 0 ? 'x' : '-x', segs: 16 }); }
  // barrel, gas block (ahead of the receiver), muzzle
  const br = bm.heavy || 9.8, zG = Math.min(zM - 40, zF + 96);
  K.mat('barrel').lathe(LP([[5, zF + 60], [12, zF + 60], [12, zF + 76, 1], [br, zF + 82], [br, zM - 14, 1], [7.6, zM - 12], [7.6, zM], [4, zM]]), { p: P3(0, yB, 0), segs: 28, crease: 30 });
  K.mat('bore').lathe(LP([[2.9, zM - .1], [2.9, zM - 30]]), { p: P3(0, yB, 0), segs: 12 });
  K.mat('dark').extrude(SH(K, [[zG - 14, yB - 14, 3], [zG + 14, yB - 14, 3], [zG + 14, yB + 24, 4], [zG - 8, yB + 24, 4], [zG - 14, yB + 16]], .6), D(26), { b: D(1.4), bs: 2 });
  K.mat('dark').lathe(LP([[0, zF + 64], [7.4, zF + 64], [7.4, zG - 12]]), { p: P3(0, yB + 16, 0), segs: 14 });
  const md = mdev(K, S.muzzle || 'a2', { z: zM, y: yB, mat: 'barrel', s: 1.08 });
  // folding + adjustable stock (part)
  K.mat('rcv').extrude(SH(K, [[zR - 14, yB - 14], [zR, yB - 14], [zR, top - 4], [zR - 14, top - 4, 3]], .6), D(W - 4), { b: D(2), bs: 2 });
  K.part('stock', { pivot: P3(W / 2 - 2, yB, zR - 14), meta: { fold: { r: [0, 2.9, 0], p: [D(28), 0, D(6)] } } });
  const zb = zR - 14 - (S.stockLen || 260);
  K.mat('frame').extrude(SH(K, [[zR - 14, top - 6, 3], [zb + 40, top - 4, 6], [zb + 20, top - 2, 3], [zb + 10, -60, 6], [zb + 40, -64, 8], [zb + 90, -20, 20], [zR - 40, yB - 20, 10], [zR - 14, yB - 16, 3]], 1), D(30), { b: D(3), bs: K.lod ? 1 : 2, holes: K.detail(1) ? [SH(K, [[zb + 50, yB - 6, 6], [zR - 50, yB - 6, 6], [zR - 50, yB - 10, 4], [zb + 90, -14, 8], [zb + 40, -40, 6]], .6)] : [] });
  K.mat('frame').extrude(SH(K, [[zb + 26, top + 14, 6], [zR - 70, top + 12, 8], [zR - 66, top - 2, 3], [zb + 30, top - 2, 3]], .8), D(26), { b: D(3), bs: 2 });
  K.mat('rubber').extrude(SH(K, [[zb - 4, top + 2, 5], [zb + 14, top + 2], [zb + 14, -66], [zb - 2, -68, 6]], .6), D(38), { b: D(3), bs: 2 });
  if (K.detail(0)) { K.mat('metal').cyl(D(4), D(34), { p: P3(-17, top - 14, zb + 70), axis: 'x', segs: 12 }); K.mat('metal').extrude(SH(K, [[-6, 0], [6, 0], [5, 8, 2], [-5, 8, 2]], .4), D(6), { plane: 'xy', off: D(zR - 60), p: P3(0, -6, 0), b: D(.8), bs: 1 }); }
  K.use('body');
  const sL = buis(K, 'sightRear', { z: zR + 16, y: rT, kind: 'rear', h: 20 }); buis(K, 'sightFront', { z: zF - 14, y: rT, kind: 'front', h: 20 });
  sockets(K, { optic: [[0, rT, 24]], muzzle: [[0, yB, zM]], under: [[0, yB - 18 - 9, zF - 52]], side: [[W / 2 + 9, yB + 6, zF - 55]], mag: [[0, -4, mzc]], stock: [[0, yB, zR - 14]], barrel: [[0, yB, zF + 60]] });
  if (K.detail(1)) K.rail(D(80), { p: P3(0, yB - 18, zF - 92), r: [0, 0, Math.PI] });
  muzzleNode(K, yB, zM + md + .2); ejectNode(K, [W / 2 + 1, yB - 2, 0]);
  handNodes(K, hr, { p: [0, yB - 20, zF - 40], kind: 'hold' });
  sightMeta(K, [0, sL, zF - 14], [0, sL, zR + 16], 80);
  K.meta.stock = { kind: 'fold', y: yB, z: zR - 14 };
};
Object.assign(MODEL_SPECS, {
  halberd: { b: 'modular', pal: 'polymer', wear: .55, mag: 'ar10', muzzle: 'g3', stockLen: 260,
    mats: { rcv: 'cer_fde', frame: 'poly_fde', grip: 'poly_fdeg', mag: 'poly_fde', barrel: 'nitride', metal: 'dksteel', alu: 'cer_fde' } },
  axion: { b: 'modular', pal: 'polymer', wear: .4, mag: 'm68', muzzle: 'brake', stockLen: 250,
    mats: { rcv: 'cer_od', frame: 'poly_od', grip: 'poly_od', mag: 'poly_od', barrel: 'nitride', metal: 'dksteel', alu: 'cer_od' } },
});

// ---- polymer rifle with carry handle (tsubame) ------------------------------------------------------------------------------
BUILDERS.polyRifle = (K, S, gun, ctx) => {
  const yB = 40, zR = -96, zF = 130, bm = barrelMod(ctx), bl = (S.bl || gun.model.barrel * 1000) + bm.ext, zC = 44, zM = zC + bl, W = 40, top = 62;
  // receiver shell + magwell, handguard with vents, carry handle with a rail on top and the rear aperture inside it
  K.mat('frame').extrude(SH(K, [[zR, 14, 4], [zR, top, 4], [zF, top, 4], [zF + 6, top - 6, 3], [zF + 6, 12, 4], [104, 6, 3], [30, -2], [-30, 0], [-70, 2, 6], [zR + 6, 8, 4]], 1), D(W - 4), { b: D(3), bs: K.lod ? 1 : 2 });
  if (K.detail(1)) { K.mat('bore').box(D(1), D(20), D(70), { p: P3((W - 4) / 2 + .1, yB + 2, 10), b: 0, ao: .4 }); for (let k = 0; k < 4; k++) K.mat('frame').box(D(W - 2), D(3), D(4), { p: P3(0, top - 20, -80 + k * 18), b: D(.6) }); }
  const hz0 = zF + 6, hz1 = Math.min(zM - 70, zF + 230);
  K.mat('frame').extrude(SH(K, [[hz0, top - 6, 3], [hz1, top - 10, 6], [hz1 + 8, yB - 2, 6], [hz1, 4, 10], [hz0, 10, 4]], 1), D(W - 2), { b: D(3), bs: K.lod ? 1 : 2, holes: K.detail(1) ? [0, 1, 2, 3, 4, 5].map(k => SH(K, [[hz0 + 26 + k * 32, 26, 3], [hz0 + 44 + k * 32, 26, 3], [hz0 + 44 + k * 32, 36, 3], [hz0 + 26 + k * 32, 36, 3]], .5)) : [] });
  const hT = top + 46;
  K.mat('frame').extrude(SH(K, [[-80, top - 2], [100, top - 2], [96, hT - 12, 8], [80, hT, 6], [-70, hT, 6], [-86, hT - 18, 8]], 1), D(26), { b: D(3), bs: K.lod ? 1 : 2, holes: K.detail(1) ? [SH(K, [[-46, top + 4, 8], [70, top + 4, 8], [70, hT - 14, 6], [-46, hT - 14, 6]], .8)] : [] });
  K.rail(D(160), { p: P3(0, hT, -70), marks: true });
  // barrel + front sight on the gas block, flash hider, bayonet lug
  const br = bm.heavy || 9.4, zG = hz1 + 16;
  K.mat('barrel').lathe(LP([[5, hz0], [12, hz0], [br, hz0 + 10], [br, zM - 14, 1], [7.4, zM - 12], [7.4, zM], [4, zM]]), { p: P3(0, yB, 0), segs: 28, crease: 30 });
  K.mat('bore').lathe(LP([[2.9, zM - .1], [2.9, zM - 30]]), { p: P3(0, yB, 0), segs: 12 });
  K.mat('dark').extrude(SH(K, [[zG - 12, yB - 12, 3], [zG + 14, yB - 12, 3], [zG + 14, yB + 16, 3], [zG - 12, yB + 16, 3]], .6), D(24), { b: D(1.4), bs: 2 });
  const sLine = hT - 12;
  const md = mdev(K, S.muzzle || 'flash', { z: zM, y: yB, mat: 'barrel' });
  // rear aperture inside the handle + front post on a tower: the sight line runs through the handle's window
  K.mat('frame').extrude(SH(K, [[-8, 0], [8, 0], [8, 9, 2], [-8, 9, 2]], .4), D(5), { plane: 'xy', off: D(-48), p: P3(0, sLine - 5, 0), b: D(.5), bs: 1, holes: [csMM(circle(1.3, 14, 0, 5))] });
  K.mat('dark').extrude(SH(K, [[-8, 0], [8, 0], [8, sLine - yB - 22, 3], [3.6, sLine - yB - 12, 2], [3.6, sLine - yB - 22, 1], [-3.6, sLine - yB - 22, 1], [-3.6, sLine - yB - 12, 2], [-8, sLine - yB - 22, 3]], .5), D(10), { plane: 'xy', off: D(zG - 5), p: P3(0, yB + 14, 0), b: D(.6), bs: 1 });
  K.mat('metal').extrude(SH(K, [[-1.3, 0], [1.3, 0], [1, 10, .3], [-1, 10, .3]], .3), D(2.4), { plane: 'xy', off: D(zG - 1.2), p: P3(0, sLine - 10, 0), b: D(.25), bs: 1 });
  // lower: guard, grip, translucent magazine, selector, charging handle under the carry handle (part)
  guardLoop(K, [[-32, 0], [28, 0], [28, -14, 4], [20, -28, 6], [-20, -30, 6], [-34, -16, 5]], [[-24, -3], [20, -3, 2], [20, -12, 4], [14, -23, 5], [-16, -25, 5], [-25, -13, 4]], 14, 2, 'frame');
  triggerPart(K, [0, 4, 0], { face: 'curved', len: 18, w: 7, mat: 'metal' });
  const hr = longGrip(K, { z: -50, y: 0, ang: .36, len: 100, w: 30, f: 15, b: 22, mat: 'grip', grooves: true });
  rmag(K, { kind: 'trans', top: [64, -2], variant: ctx.intr.mag });
  K.part('charging', { pivot: P3(0, top + 4, -40), meta: { slide: [0, 0, -D(100)] } });
  K.mat('metal').extrude(SH(K, [[-12, 0], [12, 0], [10, 6, 2], [-10, 6, 2]], .4), D(10), { plane: 'xz', off: D(top + 1), p: P3(0, 0, -40), b: D(.8), bs: 1 });
  K.use('body');
  // skeleton stock (fixed, polymer)
  const zb = zR - (S.stockLen || 290);
  K.mat('frame').extrude(SH(K, [[zR + 2, top - 4, 4], [zb + 20, top - 4, 8], [zb, top - 4, 4], [zb, -70, 6], [zb + 30, -70, 6], [zR - 40, 6, 20], [zR + 2, 10, 4]], 1), D(34), { b: D(4), bs: K.lod ? 1 : 3, holes: K.detail(1) ? [SH(K, [[zb + 26, top - 18, 8], [zR - 22, top - 18, 8], [zR - 22, 16, 6], [zb + 26, -54, 8]], .8)] : [] });
  K.mat('rubber').extrude(SH(K, [[zb - 12, top - 4, 4], [zb + 1, top - 4], [zb + 1, -72], [zb - 10, -72, 6]], .6), D(38), { b: D(3), bs: 2 });
  sockets(K, { optic: [[0, hT + 9, 10]], muzzle: [[0, yB, zM]], under: [[0, 4, (hz0 + hz1) / 2]], side: [[(W - 2) / 2, 30, (hz0 + hz1) / 2 + 20]], mag: [[0, -2, 64]], stock: [[0, 40, zR]], barrel: [[0, yB, hz0]] });
  muzzleNode(K, yB, zM + md + .2); ejectNode(K, [(W - 4) / 2 + 1, yB + 2, 10]);
  handNodes(K, hr, { p: [0, 4, (hz0 + hz1) / 2 - 20], kind: 'hold' });
  sightMeta(K, [0, sLine, zG], [0, sLine, -48], 80);
  K.meta.stock = { kind: 'fixed', y: 40, z: zR };
};

// ---- wood-stocked pistol-calibre carbine (prairie) --------------------------------------------------------------------------
BUILDERS.pcc = (K, S, gun, ctx) => {
  const yB = 30, zR = -96, zF = 110, bm = barrelMod(ctx), bl = (S.bl || gun.model.barrel * 1000) + bm.ext, zC = 20, zM = zC + bl, top = 48;
  // round steel receiver with a short rail, bolt handle (part, right), ejection port
  K.mat('rcv').lathe(LP([[0, zR], [13, zR, 1], [16, zR + 4, 1], [16, zF - 4, 1], [13, zF], [0, zF]]), { p: P3(0, yB + 2, 0), segs: 30, crease: 40 });
  K.mat('rcv').extrude(SH(K, [[-94, yB + 12], [86, yB + 12], [86, yB + 16], [-94, yB + 16]], .4), D(16), { b: D(.5), bs: 1 });
  K.rail(D(176), { p: P3(0, yB + 16, -92), marks: true });
  if (K.detail(1)) K.mat('bore').box(D(1), D(12), D(50), { p: P3(16, yB + 3, 10), b: 0, ao: .4 });
  K.part('bolt', { pivot: P3(16, yB + 2, 30), meta: { slide: [0, 0, -D(60)] } });
  K.mat('bright').lathe(LP([[0, 0], [3.4, 0], [3.4, 14], [5.4, 16, 1], [5.4, 22, 1], [0, 23]]), { axis: 'x', p: P3(15, yB + 2, 30), segs: 16 });
  K.use('body');
  // stock: one-piece walnut with a pistol-grip wrist + forend, barrel band, steel buttplate
  const R = K.lod ? 6 : 16, rows = [];
  for (let k = 0; k <= R; k++) {
    const t = k / R, z = zF + 150 - t * (zF + 150 - zR + 300);
    const fore = z > -20, wrist = z < -40 && z > zR - 80, butt = z <= zR - 80;
    const yt = fore ? yB - 4 : wrist ? yB - 2 - (zR - z) * .02 : yB - 2 - 3 - (zR - 80 - z) * .06;
    const yb2 = fore ? yB - 26 - (z < 60 ? (60 - z) * .1 : 0) : wrist ? -14 - Math.max(0, (-40 - z)) * .5 : -48 - (zR - 80 - z) * .2;
    const hw2 = fore ? 17 : wrist ? 14 : 19;
    rows.push(ovalPts(Math.max(10, yt - yb2), hw2, hw2 * .8, hw2 * .9, K.lod ? 2 : 3).map(([sv, x]) => [D(x), D(yb2 + sv), D(z), 0]));
  }
  K.mat('wood').loft3(rows.reverse(), { crease: 60, uvSwap: true });
  const zb = zR - 300 + 4;
  K.mat('metal').extrude(SH(K, [[zb - 6, yB - 8, 4], [zb + 2, yB - 8], [zb + 2, -110], [zb - 6, -110, 4]], .5), D(38), { b: D(1), bs: 1 });
  K.mat('metal').lathe(LP([[16, zF + 120], [19, zF + 121, 1], [19, zF + 132, 1], [16, zF + 133]]), { p: P3(0, yB - 8, 0), segs: 26, s: [1, 1, 1] });
  // barrel + front sight with ears + crown; rear aperture on the rail
  const br = bm.heavy || 8.6;
  K.mat('barrel').lathe(LP([[4, zF - 2], [11, zF - 2], [11, zF + 30, 1], [br, zF + 36], [br, zM - 2, 1], [br - 1, zM], [4.6, zM]]), { p: P3(0, yB, 0), segs: 26, crease: 30 });
  K.mat('bore').lathe(LP([[4.4, zM - .1], [4.4, zM - 30]]), { p: P3(0, yB, 0), segs: 12 });
  const sLine = yB + 16 + 9 + 16;
  K.mat('metal').extrude(SH(K, [[-9, 0], [9, 0], [9, 12, 3], [6, sLine - yB - 6, 2], [3.4, sLine - yB - 6, 1], [3.4, 10, 1], [-3.4, 10, 1], [-3.4, sLine - yB - 6, 1], [-6, sLine - yB - 6, 2], [-9, 12, 3]], .5), D(10), { plane: 'xy', off: D(zM - 22), p: P3(0, yB + br - 3, 0), b: D(.6), bs: 1 });
  K.mat('metal').extrude(SH(K, [[-1.3, 0], [1.3, 0], [1, sLine - yB - br - 4, .3], [-1, sLine - yB - br - 4, .3]], .3), D(2.4), { plane: 'xy', off: D(zM - 18.2), p: P3(0, yB + br + 1, 0), b: D(.25), bs: 1 });
  const sL = buis(K, 'sightRear', { z: -80, y: yB + 25, kind: 'rear', h: sLine - yB - 25 - 7 });
  // guard (steel), trigger, straight 9 mm magazine ahead of the guard
  guardLoop(K, [[-30, -2], [26, -2], [26, -14, 4], [18, -28, 6], [-20, -30, 6], [-32, -16, 5]], [[-22, -5], [18, -5, 2], [18, -13, 4], [12, -24, 5], [-14, -26, 5], [-23, -14, 4]], 12, 1.8, 'metal');
  triggerPart(K, [0, 2, 0], { face: 'curved', len: 18, w: 7 });
  rmag(K, { kind: 'pcc', top: [56, 2], variant: ctx.intr.mag });
  swivel(K, [0, -100, zb + 70]); swivel(K, [0, yB - 30, zF + 110]);
  sockets(K, { optic: [[0, yB + 25, 14]], muzzle: [[0, yB, zM]], under: [[0, yB - 26, zF + 60]], side: [[17, yB - 14, zF + 70]], mag: [[0, 2, 56]], barrel: [[0, yB, zF]] });
  muzzleNode(K, yB, zM + .2); ejectNode(K, [17, yB + 3, 10]);
  handNodes(K, { p: [0, -40, -50], ang: .55 }, { p: [0, yB - 26, zF + 50], kind: 'hold' });
  sightMeta(K, [0, sLine, zM - 18], [0, sL, -80], 80);
  K.meta.stock = { kind: 'fixed', y: yB, z: zR };
};

// ---- battle rifles (eisenhut roller-delayed, longhorn classic) ----------------------------------------------------------------
BUILDERS.brRoller = (K, S, gun, ctx) => {
  const yB = 38, top = 66, zR = -150, zF = 140, bm = barrelMod(ctx), bl = (S.bl || gun.model.barrel * 1000) + bm.ext, zC = 52, zM = zC + bl, w = 34;
  // stamped receiver (round top), side ribs, cocking tube over the barrel, charging handle (part, left), claw rail
  const rcs = slideCS(w, top - 14, 0, { round: 1, r: w / 2 });
  cs(K, rcs, zR, zF, 14, { bb: 1.6, bf: 1.2, mat: 'stamp' });
  if (K.detail(0)) for (const yy of [26, 46]) for (const sx of [-1, 1]) K.mat('stamp').extrude(SH(K, [[zR + 12, -1.3, 1.3], [zF - 12, -1.3, 1.3], [zF - 12, 1.3, 1.3], [zR + 12, 1.3, 1.3]], .4), D(1.6), { p: P3(sx * (w / 2 + .2), yy, 0), b: D(.5), bs: 1 });
  if (K.detail(1)) K.mat('bore').box(D(1), D(14), D(56), { p: P3(w / 2 + .1, yB + 6, 20), b: 0, ao: .45 });
  rivets(K, [[zR + 20, 22], [zR + 20, 50], [zF - 16, 22], [zF - 16, 50], [-30, 20], [80, 20]], w / 2 + .1, 3.4, 'stamp');
  K.mat('stamp').lathe(LP([[0, zF - 6], [13.4, zF - 6], [13.4, zF + 230, 1], [12.4, zF + 233, 1], [0, zF + 233]]), { p: P3(0, yB + 14, 0), segs: 28 });
  K.part('charging', { pivot: P3(-12, yB + 14, zF + 80), meta: { slide: [0, 0, -D(120)] } });
  K.mat('metal').extrude(SH(K, [[0, -3], [10, -3, 2], [10, 3, 2], [0, 3]], .4), D(5), { plane: 'xz', off: D(yB + 12), p: P3(-14, 0, zF + 80), b: D(.8), bs: 1, r: [0, -.25, 0] });
  K.mat('metal').cyl(D(4), D(10), { p: P3(-24, yB + 14, zF + 84), axis: '-x', segs: 14 });
  K.use('body');
  if (S.claw !== false) {   // claw mount: a raised rail bridge over the receiver (only fitted with an optic)
    K.part('clawMount', { pivot: P3(0, top, -20), meta: { optOnly: true } });
    for (const zz of [zR + 40, zF - 40]) K.mat('alu').extrude(SH(K, [[zz - 12, top - 4], [zz + 12, top - 4], [zz + 10, top + 16, 2], [zz - 10, top + 16, 2]], .5), D(28), { b: D(1), bs: 2 });
    K.mat('alu').extrude(SH(K, [[zR + 26, top + 12], [zF - 26, top + 12], [zF - 26, top + 18, 2], [zR + 26, top + 18, 2]], .4), D(24), { b: D(1), bs: 1 });
    K.rail(D(zF - zR - 56), { p: P3(0, top + 18, zR + 28), marks: true }); K.use('body');
  }
  // drum rear sight + hooded front post on the cocking tube end
  const sLine = top + 4 + 9 + 12;
  K.mat('stamp').box(D(22), D(sLine - top - 2), D(20), { p: P3(0, top + (sLine - top - 2) / 2 + 1, zR + 14), b: D(1.4) });
  K.mat('metal').lathe(LP([[0, -12], [10, -12, 1], [10.6, -11], [10.6, 11], [10, 12, 1], [0, 12]]), { axis: 'x', p: P3(0, sLine, zR + 14), segs: 20 });
  K.mat('bore').cyl(D(1.5), D(22), { p: P3(0, sLine, zR + 3), segs: 10 });
  const fz = zF + 222;
  K.mat('stamp').extrude(SH(K, [[fz - 12, yB + 4], [fz + 10, yB + 4, 2], [fz + 10, sLine - 6, 3], [fz - 12, sLine - 4, 3]], .6), D(14), { b: D(1.4), bs: 2 });
  K.mat('stamp').tube(D(10.6), D(8.8), D(14), { p: P3(0, sLine - 1, fz - 7), segs: 26 });
  K.mat('metal').extrude(SH(K, [[-1.2, 0], [1.2, 0], [1, 9, .3], [-1, 9, .3]], .3), D(2.4), { plane: 'xy', off: D(fz - 1.2), p: P3(0, sLine - 9, 0), b: D(.25), bs: 1 });
  // barrel + flash hider, slim polymer handguard
  const br = bm.heavy || 9.4;
  K.mat('barrel').lathe(LP([[5, zF - 4], [13, zF - 4], [13, zF + 20, 1], [br, zF + 26], [br, zM - 14, 1], [8, zM - 12], [8, zM], [4, zM]]), { p: P3(0, yB, 0), segs: 28, crease: 30 });
  K.mat('bore').lathe(LP([[3.4, zM - .1], [3.4, zM - 30]]), { p: P3(0, yB, 0), segs: 12 });
  const md = mdev(K, S.muzzle || 'g3', { z: zM, y: yB, mat: 'barrel', s: 1.08 });
  const hg = [[-20, yB + 20], [-20, yB - 12, 9], [0, yB - 20], [20, yB - 12, 9], [20, yB + 20], [15, yB + 20], [15, yB - 8, 5], [-15, yB - 8, 5], [-15, yB + 20]];
  const hcs = CSX(K, hg), hz0 = zF + 4, hz1 = zF + 190;
  cs(K, hcs, hz0, hz1, 0, { bb: 2, bf: 2, mat: 'furn' });
  if (K.detail(1)) for (let k = 0; k < 7; k++) for (const sx of [-1, 1]) K.mat('bore').box(D(1), D(8), D(10), { p: P3(sx * 20.1, yB + 6, hz0 + 22 + k * 24), b: 0, ao: .4 });
  // lower: trigger housing (polymer), guard, paddle release, grip, magazine
  K.mat('furn').extrude(SH(K, [[-80, 14], [40, 14], [40, 2, 3], [-14, 0], [-30, -6, 4], [-62, -6, 4], [-80, 6, 4]], .8), D(32), { b: D(2.4), bs: 3 });
  guardLoop(K, [[-26, 0], [36, 0], [37, -14, 6], [30, -34, 8], [-12, -36, 8], [-26, -20, 5]], [[-16, -3, 2], [30, -3, 2], [30.5, -12, 5], [24, -29, 6], [-8, -30.5, 6], [-17, -18, 4]], 12, 2.6, 'furn');
  triggerPart(K, [0, 4, 3], { face: 'curved', len: 20, w: 7 });
  const hr = longGrip(K, { z: -40, y: -3, ang: .32, len: 96, w: 31, f: 16, b: 22, mat: 'grip', grooves: true, hump: 1.6 });
  K.mat('stamp').extrude(SH(K, [[42, 14], [118, 14], [116, -6, 2.5], [44, -6, 2.5]], .6), D(32), { b: D(2), bs: 2 });
  if (K.detail(0)) K.mat('metal').extrude(SH(K, [[34, -2], [44, -2], [44, -12, 2], [32, -12, 2]], .4), D(18), { b: D(1), bs: 1 });
  rmag(K, { kind: 'g3', top: [80, 6], rake: .02, variant: ctx.intr.mag });
  // fixed polymer stock with a rubber pad
  const zb = zR - (S.stockLen || 270);
  K.mat('furn').extrude(SH(K, [[zR + 2, top - 4, 3], [zb + 30, top - 4, 10], [zb, top, 4], [zb, -86, 6], [zb + 40, -88, 10], [zR - 50, 6, 30], [zR + 2, 18, 4]], 1.2), D(42), { b: D(7), bs: K.lod ? 1 : 3 });
  K.mat('rubber').extrude(SH(K, [[zb - 16, top + 2, 6], [zb + 1, top + 2], [zb + 1, -88], [zb - 14, -90, 6]], .6), D(44), { b: D(3.5), bs: 3 });
  swivel(K, [0, -86, zb + 40]);
  sockets(K, { optic: [[0, top + 27, -6]], muzzle: [[0, yB, zM]], under: [[0, yB - 20, (hz0 + hz1) / 2]], side: [[20, yB + 4, (hz0 + hz1) / 2 + 20]], mag: [[0, 6, 80], null, [.02, 0, 0]], stock: [[0, 40, zR]] });
  muzzleNode(K, yB, zM + md + .2); ejectNode(K, [w / 2 + 1, yB + 6, 20]);
  handNodes(K, hr, { p: [0, yB - 20, (hz0 + hz1) / 2 - 10], kind: 'hold' });
  sightMeta(K, [0, sLine, fz], [0, sLine, zR + 14], 80);
  K.meta.stock = { kind: 'fixed', y: 40, z: zR };
};
BUILDERS.brClassic = (K, S, gun, ctx) => {
  const yB = 30, zR = -110, zF = 120, bm = barrelMod(ctx), bl = (S.bl || gun.model.barrel * 1000) + bm.ext, zC = 30, zM = zC + bl, w = 30;
  // receiver (milled, exposed above the stock), bolt + op-rod handle (part, right side), clip guide
  K.mat('rcv').extrude(SH(K, [[zR, yB - 6, 3], [zR + 10, yB + 18, 4], [zR + 40, yB + 18, 3], [zR + 50, yB + 10], [zF - 30, yB + 10], [zF - 20, yB + 16, 3], [zF, yB + 16, 2], [zF, yB - 6]], .8), D(w), { b: D(1.6), bs: 2 });
  K.mat('bright').lathe(LP([[0, -60], [9, -60, 1], [9, 40, 1], [0, 40]]), { p: P3(0, yB + 6, 0), segs: 20 });
  K.part('charging', { pivot: P3(w / 2 + 2, yB, 60), meta: { slide: [0, 0, -D(110)] } });
  K.mat('metal').extrude(SH(K, [[-10, -4], [200, -4], [204, 0, 2], [200, 4], [-10, 4, 2]], .4), D(4), { p: P3(w / 2 + 2, yB - 2, 0), b: D(.6), bs: 1 });
  K.mat('metal').extrude(SH(K, [[0, 0], [16, 0, 2], [18, 14, 4], [4, 18, 4], [0, 8]], .5), D(10), { p: P3(w / 2 + 6, yB - 2, 60), b: D(1.4), bs: 2 });
  K.use('body');
  // full walnut stock with a semi-pistol wrist, upper handguard, front band, buttplate
  const R = K.lod ? 7 : 18, rows = [], zb = zR - (S.stockLen || 300);
  for (let k = 0; k <= R; k++) {
    const t = k / R, z = zF + 300 - t * (zF + 300 - zb);
    const fore = z > -10, wrist = z <= -10 && z > zR - 60;
    const yt = fore ? yB - 2 : wrist ? yB - 6 : yB - 6 - (zR - 60 - z) * .055;
    const yb2 = fore ? (z > zF ? yB - 26 : yB - 34) : wrist ? -18 - Math.min(40, (-10 - z) * .55) : -56 - (zR - 60 - z) * .18;
    const hw2 = fore ? (z > zF + 200 ? 15 : 18) : wrist ? 15 : 20;
    rows.push(ovalPts(Math.max(10, yt - yb2), hw2, hw2 * .8, hw2 * .9, K.lod ? 2 : 3).map(([sv, x]) => [D(x), D(yb2 + sv), D(z), 0]));
  }
  K.mat('wood').loft3(rows.reverse(), { crease: 60, uvSwap: true });
  const ur = []; for (let k = 0; k <= (K.lod ? 2 : 6); k++) { const z = zF + 6 + k / (K.lod ? 2 : 6) * 160; ur.push(ovalPts(16, 14, 7, 7, K.lod ? 2 : 3).map(([sv, x]) => [D(x), D(yB + 4 + sv), D(z), 0])); }
  K.mat('wood').loft3(ur, { crease: 60, uvSwap: true });
  K.mat('metal').extrude(SH(K, [[zb - 6, yB - 2, 4], [zb + 2, yB - 2], [zb + 2, -114], [zb - 6, -114, 4]], .5), D(42), { b: D(1), bs: 1 });
  // barrel, gas cylinder + front band, flash hider with the front sight, rear aperture with knobs
  const br = bm.heavy || 9.2, zG = zM - 110;
  K.mat('barrel').lathe(LP([[4, zF - 4], [12, zF - 4], [12, zF + 30, 1], [br, zF + 36], [br, zM - 12, 1], [8, zM - 10], [8, zM], [4, zM]]), { p: P3(0, yB, 0), segs: 28, crease: 30 });
  K.mat('bore').lathe(LP([[3.4, zM - .1], [3.4, zM - 30]]), { p: P3(0, yB, 0), segs: 12 });
  K.mat('metal').lathe(LP([[0, zG - 50], [9, zG - 50, 1], [9, zG + 40, 1], [7, zG + 44], [0, zG + 44]]), { p: P3(0, yB - 16, 0), segs: 18 });
  K.mat('metal').extrude(SH(K, [[zG - 10, yB - 28], [zG + 30, yB - 28, 3], [zG + 30, yB + 12, 3], [zG - 10, yB + 12, 3]], .6), D(24), { b: D(1.4), bs: 2 });
  const sLine = yB + 36;
  const md = mdev(K, 'a2', { z: zM, y: yB, mat: 'barrel', s: 1.06 });
  K.mat('metal').extrude(SH(K, [[-6, 0], [6, 0], [3, sLine - yB - 10, 2], [1.2, sLine - yB - 10], [1.2, sLine - yB], [-1.2, sLine - yB], [-1.2, sLine - yB - 10], [-3, sLine - yB - 10, 2]], .4), D(5), { plane: 'xy', off: D(zM + 12), p: P3(0, yB + 6, 0), b: D(.4), bs: 1 });
  K.mat('metal').extrude(SH(K, [[-11, 0], [11, 0], [11, 6, 2], [-11, 6, 2]], .4), D(20), { plane: 'xy', off: D(zR + 10), p: P3(0, yB + 18, 0), b: D(.8), bs: 1 });
  K.mat('metal').extrude(SH(K, [[-6, 0], [6, 0], [5, sLine - yB - 20, 2], [-5, sLine - yB - 20, 2]], .4), D(4), { plane: 'xy', off: D(zR + 16), p: P3(0, yB + 24, 0), b: D(.4), bs: 1, holes: [csMM(circle(1.3, 14, 0, sLine - yB - 24))] });
  for (const sx of [-1, 1]) K.mat('metal').lathe(LP([[0, 0], [7, 0, 1], [7, 6, 1], [0, 6]]), { axis: sx > 0 ? 'x' : '-x', p: P3(sx * 11, yB + 22, zR + 20), segs: 18, rmod: K.detail(0) ? a => 1 - .06 * (Math.cos(a * 14) > .3 ? 1 : 0) : null });
  // guard, trigger, magazine, side mount for optics (optOnly)
  guardLoop(K, [[-34, yB - 32], [24, yB - 32], [24, yB - 46, 4], [16, yB - 60, 6], [-22, yB - 62, 6], [-36, yB - 46, 5]], [[-26, yB - 35], [16, yB - 35, 2], [16, yB - 44, 4], [10, yB - 55, 5], [-16, yB - 57, 5], [-27, yB - 45, 4]], 12, 2, 'metal');
  triggerPart(K, [0, yB - 30, 0], { face: 'curved', len: 18, w: 7 });
  rmag(K, { kind: 'm14', top: [62, yB - 30], variant: ctx.intr.mag });
  K.part('sideMount', { pivot: P3(-w / 2, yB + 10, -60), meta: { optOnly: true } });
  K.mat('alu').extrude(SH(K, [[-110, yB - 4], [10, yB - 4], [10, yB + 30, 3], [-110, yB + 30, 3]], .6), D(8), { off: -D(w / 2 + 8), b: D(1), bs: 2 });
  K.mat('alu').extrude(SH(K, [[-w / 2 - 8, yB + 20], [-w / 2, yB + 20], [-4, yB + 28], [12, yB + 28], [12, yB + 34], [-w / 2 - 8, yB + 34, 3]], .6), D(120), { plane: 'xy', off: D(-110), b: D(1), bs: 2 });
  K.rail(D(116), { p: P3(0, yB + 34, -108) });
  K.use('body');
  swivel(K, [0, -110, zb + 60]); swivel(K, [0, yB - 30, zM - 140]);
  sockets(K, { optic: [[0, yB + 43, -50]], muzzle: [[0, yB, zM]], under: [[0, yB - 26, zF + 180]], side: [[18, yB - 12, zF + 150]], mag: [[0, yB - 30, 62]] });
  muzzleNode(K, yB, zM + md + .2); ejectNode(K, [w / 2 + 1, yB + 8, 0]);
  handNodes(K, { p: [0, -30, -50], ang: .5 }, { p: [0, yB - 30, zF + 120], kind: 'hold' });
  sightMeta(K, [0, sLine, zM + 14], [0, sLine, zR + 18], 80);
};
Object.assign(MODEL_SPECS, {
  tsubame: { b: 'polyRifle', pal: 'polymer', wear: .4, muzzle: 'flash', stockLen: 290, mats: { frame: 'poly_gry', grip: 'poly_gryg', mag: 'poly_gry', barrel: 'nitride', metal: 'dksteel', dark: 'dksteel' } },
  prairie: { b: 'pcc', pal: 'wood', wear: 1.0, mats: { rcv: 'blued', barrel: 'blued', metal: 'blued', wood: 'walnut', mag: 'blued', alu: 'alu_blk' } },
  eisenhut: { b: 'brRoller', pal: 'black', wear: .9, muzzle: 'g3', stockLen: 270, mats: { stamp: 'park', furn: 'poly_blk', grip: 'poly_grp', mag: 'park', barrel: 'park', metal: 'dksteel', alu: 'alu_blk' } },
  longhorn: { b: 'brClassic', pal: 'wood', wear: .9, stockLen: 300, mats: { rcv: 'park', barrel: 'park', metal: 'park', wood: 'walnut', mag: 'park', bright: 'steel', alu: 'alu_blk' } },
});

// ---- marksman rifles on an AK-type action (krechet: long barrel + slotted hider, penumbra: integral suppressor) -------------
/** skeleton thumbhole stock (wood / laminate), receiver rear at zR, top at yT (mm); cheek rest optional */
function thumbStock(K, { zR, yT, len = 330, mat = 'wood', cheek = true, w = 38 }) {
  const zb = zR - len;
  K.mat(mat).extrude(SH(K, [[zR + 2, yT, 3], [zb + 24, yT + 4, 10], [zb, yT + 4, 6], [zb, -96, 8], [zb + 44, -96, 12], [-58, -86, 14], [-46, -40, 12], [-36, -4, 6], [zR + 2, 6, 4]], 1.2), D(w), { b: D(6), bs: K.lod ? 1 : 3,
    holes: K.detail(2) ? [SH(K, [[zR - 30, yT - 18, 12], [-66, -16, 10], [-76, -64, 12], [zR - 50, -44, 14]], 1), SH(K, [[zb + 30, yT - 18, 10], [zR - 80, yT - 18, 10], [zR - 90, -40, 14], [zb + 34, -70, 10]], 1)] : [] });
  if (cheek) K.mat('rubber').extrude(SH(K, [[zb + 40, yT + 14, 6], [zR - 70, yT + 12, 8], [zR - 74, yT, 3], [zb + 40, yT + 2, 3]], .8), D(w - 6), { b: D(4), bs: K.lod ? 1 : 3 });
  K.mat('rubber').extrude(SH(K, [[zb - 14, yT + 6, 5], [zb + 1, yT + 6], [zb + 1, -98], [zb - 12, -100, 6]], .6), D(w + 2), { b: D(3), bs: 2 });
  return { p: [0, -50, -56], ang: .3 };
}
BUILDERS.dmrAK = (K, S, gun, ctx) => {
  const integral = !!S.integral, yB = 34, top = 50, zR = -122, zF = 112, w = 30, bm = barrelMod(ctx), bl = (S.bl || gun.model.barrel * 1000) + bm.ext, zC = 32, zM = zC + bl;
  akReceiver(K, { zR, zF, top, w, rail: !!S.coverRail });
  const sLine = 66, rz = zF + 4;
  // rear tangent sight block + gas tube + handguards (vented wood) / integral can
  K.mat('stamp').extrude(SH(K, [[zF - 8, yB + 6], [zF + 40, yB + 6], [zF + 40, top - 2, 3], [zF + 24, top + 4, 4], [zF - 8, top + 4, 2]], .6), D(26), { b: D(1.4), bs: 2 });
  K.mat('stamp').extrude(SH(K, [[rz - 2, top + 4], [zF + 34, top + 4], [zF + 34, top + 7.5, 1], [rz - 2, sLine - .5, 1]], .4), D(16), { b: D(.6), bs: 1 });
  K.mat('metal').extrude(SH(K, [[-6, 0], [6, 0], [6, 3.4], [1.1, 3.4], [1.1, 1.6], [-1.1, 1.6], [-1.1, 3.4], [-6, 3.4]], .2), D(3), { plane: 'xy', off: D(rz - 3), p: P3(0, sLine - 3.4, 0), b: D(.3), bs: 1 });
  let md = 0, fz;
  if (integral) {   // suppressor shroud over the whole barrel (with clamp + front sight on the can)
    const cz0 = zF + 40, cz1 = Math.max(cz0 + 200, zM);
    K.mat('barrel').lathe(LP([[5, zF - 6], [13, zF - 6], [13, cz0, 1], [5, cz0]]), { p: P3(0, yB, 0), segs: 26 });
    canGeom(K, { z0: cz0, len: cz1 - cz0, r: 21, y: yB, mat: 'rcv', knurl: 'rcv' });
    K.mat('stamp').lathe(LP([[21, cz0 + 2], [23, cz0 + 4, 1], [23, cz0 + 26, 1], [21, cz0 + 28]]), { p: P3(0, yB, 0), segs: 28 });
    fz = cz1 - 26;
    K.mat('stamp').extrude(SH(K, [[fz - 8, yB + 18], [fz + 8, yB + 18], [fz + 6, sLine - 8, 2], [fz - 6, sLine - 8, 2]], .4), D(10), { b: D(.8), bs: 1 });
    K.mat('metal').extrude(SH(K, [[-1.2, 0], [1.2, 0], [1, 9, .3], [-1, 9, .3]], .3), D(2.4), { plane: 'xy', off: D(fz - 1.2), p: P3(0, sLine - 9, 0), b: D(.25), bs: 1 });
    const R = K.lod ? 3 : 8, rows = [];
    for (let k = 0; k <= R; k++) { const t = k / R, z = zF + 6 + t * 30; rows.push(ovalPts(46, 22, 10, 12, K.lod ? 2 : 3).map(([sv, x]) => [D(x), D(yB - 24 + sv), D(z), 0])); }
    K.mat('wood').loft3(rows, { crease: 60, uvSwap: true });
  } else {
    const zG = zM - 180, br = bm.heavy || 8.4;
    K.mat('barrel').lathe(LP([[4, zF - 6], [13, zF - 6], [13, zF + 28, 1], [11, zF + 32], [br + 1, zF + 40], [br, zF + 60], [br, zM - 14, 1], [7.8, zM - 12], [7.8, zM], [4, zM]]), { p: P3(0, yB, 0), segs: 28, crease: 30 });
    K.mat('stamp').lathe(LP([[br, zG - 16], [14, zG - 16, 1], [15, zG - 14, 1], [15, zG + 12, 1], [14, zG + 14], [br, zG + 14]]), { p: P3(0, yB, 0), segs: 24 });
    K.mat('stamp').extrude(SH(K, [[zG - 16, yB + 4], [zG + 14, yB + 4], [zG + 8, yB + 28, 4], [zG - 10, yB + 28, 4]], .6), D(20), { b: D(1.4), bs: 2 });
    K.mat('stamp').lathe(LP([[0, zF + 44], [9.4, zF + 44], [10, zF + 46, 1], [10, zG - 10, 1], [9.2, zG - 9]]), { p: P3(0, yB + 18, 0), segs: 22 });
    const R = K.lod ? 4 : 10, rows = [], h0 = zF + 46, h1 = zG - 18;
    for (let k = 0; k <= R; k++) { const t = k / R, z = h0 + t * (h1 - h0); rows.push(ovalPts(52, 21, 10, 12, K.lod ? 2 : 4).map(([sv, x]) => [D(x), D(yB - 22 + sv), D(z), 0])); }
    K.mat('wood').loft3(rows, { crease: 60, uvSwap: true });
    if (K.detail(1)) for (let k = 0; k < 6; k++) for (const sx of [-1, 1]) K.mat('bore').box(D(1), D(14), D(6), { p: P3(sx * 20.6, yB + 12, h0 + 24 + k * ((h1 - h0 - 40) / 5)), b: 0, ao: .35 });
    fz = zM - 60;
    K.mat('stamp').extrude(SH(K, [[fz - 12, yB - 10], [fz + 12, yB - 10, 3], [fz + 12, yB + 12, 2], [fz + 6, sLine - 15, 3], [fz - 6, sLine - 15, 3], [fz - 12, yB + 12, 2]], .6), D(18), { b: D(1.2), bs: 2 });
    K.mat('stamp').lathe(LP([[9, fz - 6], [11, fz - 6, 1], [11, fz + 6, 1], [9, fz + 6]]), { p: P3(0, sLine - 4, 0), segs: 26, a0: -.6, a1: Math.PI + .6 });
    K.mat('metal').lathe(LP([[0, 0], [1.9, 0], [1.6, sLine - yB - 22], [0, sLine - yB - 21]]), { axis: 'y', p: P3(0, yB + 21, fz), segs: 12 });
    md = mdev(K, S.muzzle || 'slotted', { z: zM, y: yB, mat: 'barrel' });
  }
  guardLoop(K, [[-36, -1], [22, -1], [22, -12, 3], [14, -26, 5], [-22, -28, 6], [-36, -14, 4]], [[-28, -3], [16, -3, 1.5], [16, -10, 3], [9, -22, 4], [-18, -23.5, 4], [-28.5, -12, 3]], 14, 1.6, 'stamp');
  triggerPart(K, [0, 4, 0], { face: 'curved', len: 18, w: 7, mat: 'metal' });
  rmag(K, { kind: S.mag, top: [60, 2], rake: .02, variant: ctx.intr.mag });
  K.mat('stamp').extrude(SH(K, [[zR - 2, 8], [zR + 14, 8], [zR + 14, top - 10], [zR - 2, top - 10]], .5), D(w + 3), { b: D(1), bs: 1 });
  const hr = thumbStock(K, { zR, yT: top - 8, len: S.stockLen || 330, mat: 'wood', cheek: !integral });
  if (!S.coverRail) akSideMount(K, { z0: -96, z1: 24, w, top, yRail: top + 10 });
  sockets(K, { optic: [[0, S.coverRail ? top + 10 : top + 19, -36], S.coverRail ? 'cover' : null], muzzle: integral ? null : [[0, yB, zM]], under: [[0, yB - 22, zF + 110]], side: [[21, yB - 2, zF + 100]], mag: [[0, 2, 60], null, [.02, 0, 0]], stock: [[0, 30, zR - 2]] });
  muzzleNode(K, yB, zM + md + .2); ejectNode(K, [w / 2 + 1, top - 18, 20]);
  handNodes(K, hr, { p: [0, yB - 22, zF + 90], kind: 'hold' });
  sightMeta(K, [0, sLine, fz], [0, sLine, rz], 280);
  K.meta.stock = { kind: 'fixed', y: 30, z: zR - 2 };
};
Object.assign(MODEL_SPECS, {
  krechet: { b: 'dmrAK', pal: 'wood', wear: 1.1, mag: 'svd', muzzle: 'slotted', stockLen: 340, mats: { stamp: 'park', rcv: 'park', barrel: 'park', metal: 'park', wood: 'laminate_dk', mag: 'park', alu: 'alu_blk' } },
  penumbra: { b: 'dmrAK', pal: 'wood', wear: .8, integral: true, mag: 'vss', coverRail: true, stockLen: 300, mats: { stamp: 'park', rcv: 'nitride', barrel: 'park', metal: 'dksteel', wood: 'walnut', mag: 'park', alu: 'alu_blk' } },
});

// =========================================================================================================================
// Attachments (every entry of attachments.js; registered by kind, a few by id). Attachment-local axes: mounting surface at y = 0,
// +Y away from the rail, +Z toward the muzzle (muzzle devices start at z = 0 on the thread). Builders return
// { eye, length, hand, reticle: { c, r, id, bg }, lens: { part, c, r }, glint: { c, r }, canted: { eye, up }, bipod, palette }.
// ---- optics -----------------------------------------------------------------------------------------------------------------
/** rail clamp (cross-bolt or QD lever) on a Picatinny rail under an optic body, from z0 to z1 (mm), top at h */
function railClamp(K, { z0, z1, h = 6, w = 24, mat = 'rcv', qd = false }) {
  K.mat(mat).extrude(SH(K, [[-w / 2, -3.4], [-7.6, -3.4], [-7.6, 0], [7.6, 0], [7.6, -3.4], [w / 2, -3.4], [w / 2, h, 1.5], [-w / 2, h, 1.5]], .5), D(z1 - z0), { plane: 'xy', off: D(z0), b: D(.8), bs: 2 });
  if (!K.detail(0)) return;
  if (qd) { K.mat('metal').extrude(SH(K, [[0, -3], [26, -2, 3], [28, 3, 3], [0, 3]], .5), D(3), { plane: 'xz', off: D(-1), p: P3(w / 2 + .6, 0, (z0 + z1) / 2 - 8), b: D(.8), bs: 1 }); K.mat('metal').cyl(D(4.4), D(4), { p: P3(w / 2 + .2, 0, (z0 + z1) / 2 - 8), axis: 'x', segs: 16 }); }
  else { K.screw({ p: P3(w / 2 + .1, -1, (z0 + z1) / 2), axis: 'x', d: D(9), h: D(3), type: 'hex', mat: 'metal' }); K.mat('metal').cyl(D(2), D(3), { p: P3(-w / 2 - 2.4, -1, (z0 + z1) / 2), axis: 'x', segs: 10 }); }
}
registerAttachmentBuilder('kind:micro', (K, att, c) => {
  const L = (c.spec.length || .045) * 1000, H = (c.spec.height || .03) * 1000, W = 25, Lb = Math.min(L, 34);
  K.mat('rcv').extrude(SH(K, [[-Lb / 2, 0], [L / 2, 0], [L / 2, 6, 1.5], [L / 2 - 6, 8, 2], [-Lb / 2 + 4, 8, 2], [-Lb / 2, 5, 1.5]], .5), D(W), { b: D(1.2), bs: 2 });
  // hood: front loop around the window, swept back into the body sides
  const hood = [[-W / 2, 6], [W / 2, 6], [W / 2 - 1, H - 7, 4], [W / 2 - 5, H, 4], [-W / 2 + 5, H, 4], [-W / 2 + 1, H - 7, 4]];
  const win = [[-W / 2 + 3, 8.5], [W / 2 - 3, 8.5], [W / 2 - 3.6, H - 7.6, 2.4], [W / 2 - 6.6, H - 3, 2.4], [-W / 2 + 6.6, H - 3, 2.4], [-W / 2 + 3.6, H - 7.6, 2.4]];
  K.mat('rcv').extrude(SH(K, hood, .6), D(7), { plane: 'xy', off: D(L / 2 - 9), b: D(1.2), bs: 2, holes: [SH(K, win, .4)] });
  for (const sx of [-1, 1]) K.mat('rcv').extrude(SH(K, [[-Lb / 2 + 4, 6], [L / 2 - 6, 6], [L / 2 - 6, H - 8, 3], [L / 2 - 14, H - 12, 6], [-Lb / 2 + 4, 10, 3]], .5), D(3), { off: sx > 0 ? D(W / 2 - 3) : -D(W / 2), b: D(.8), bs: 1 });
  const wy = (8.5 + H - 3) / 2;
  K.mat('window').box(D(W - 6), D(H - 11), D(1.2), { p: P3(0, wy, L / 2 - 6), r: [-.1, 0, 0], b: 0 });
  if (K.detail(0)) { K.mat('led').sphere(D(1.1), { p: P3(0, 9, -Lb / 2 + 6), segs: 8 }); K.screw({ p: P3(0, 8, -Lb / 2 + 12), axis: 'y', d: D(4), h: D(.8), type: 'slot', mat: 'metal' }); K.screw({ p: P3(W / 2, 7, -Lb / 2 + 8), axis: 'x', d: D(4), h: D(.8), type: 'slot', mat: 'metal' });
    for (const sz of [-1, 1]) K.mat('rubber').box(D(5), D(2.4), D(7), { p: P3(-W / 2 - .6, 4, sz * 6), b: D(.6) }); }
  return { eye: P3(0, wy, -250), reticle: { c: P3(0, wy, L / 2 - 6.8), r: D(Math.min(W - 8, H - 12) / 2), id: att.mods.reticle || 'dot' }, length: L };
});
registerAttachmentBuilder('kind:reflex', (K, att, c) => {
  const L = (c.spec.length || .06) * 1000, H = (c.spec.height || .05) * 1000, R = 15.5, yc = H - R - 1;
  K.mat('rcv').lathe(LP([[R - 2, -L / 2], [R + 1.6, -L / 2, 1], [R + 2, -L / 2 + 2, 1], [R + 2, -L / 2 + 8, 1], [R, -L / 2 + 10], [R, L / 2 - 12], [R + 2, L / 2 - 10, 1], [R + 2, L / 2 - 1.5, 1], [R + 1.4, L / 2, 1], [R - 2.2, L / 2]]), { p: P3(0, yc, 0), segs: 36, crease: 40 });
  K.mat('rcv').lathe(LP([[R - 2.2, -L / 2], [R - 2.2, L / 2]]), { p: P3(0, yc, 0), segs: 30 });
  // turrets: elevation (top), windage (right), illumination dial (left)
  K.mat('rcv').lathe(LP([[0, 0], [6.4, 0], [6.4, 6, 1], [5.6, 7, 1], [0, 7]]), { axis: 'y', p: P3(0, yc + R - 1, 4), segs: 22 });
  K.mat('rcv').lathe(LP([[0, 0], [6.4, 0], [6.4, 6, 1], [5.6, 7, 1], [0, 7]]), { axis: 'x', p: P3(R - 1, yc, 4), segs: 22 });
  K.mat('rcv').lathe(LP([[0, 0], [10, 0], [10, 6, 1], [9, 8, 1], [0, 8]]), { axis: 'x', p: P3(-R - 7, yc, 4), r: [0, 0, 0], segs: 26, rmod: K.detail(0) ? a => 1 - .05 * (Math.cos(a * 16) > .2 ? 1 : 0) : null, s: [-1, 1, 1] });
  // riser mount + QD lever
  K.mat('rcv').extrude(SH(K, [[-L / 2 + 6, 0], [L / 2 - 8, 0], [L / 2 - 10, yc - R + 6, 3], [-L / 2 + 8, yc - R + 6, 3]], .6), D(20), { b: D(1.2), bs: 2 });
  railClamp(K, { z0: -L / 2 + 4, z1: L / 2 - 6, h: 4, w: 26, qd: true });
  K.mat('lens').disc(D(R - 2.4), D(1), { p: P3(0, yc, L / 2 - 4), segs: 32 });
  K.mat('window').disc(D(R - 2.4), D(1), { p: P3(0, yc, -L / 2 + 3), segs: 32 });
  if (K.detail(0)) for (const zz of [-L / 2 - 4, L / 2 + 1]) K.mat('rubber').lathe(LP([[R + .6, zz], [R + 2.4, zz], [R + 2.4, zz + 3], [R + .6, zz + 3]]), { p: P3(0, yc, 0), segs: 30 });
  return { eye: P3(0, yc, -230), reticle: { c: P3(0, yc, L / 2 - 6), r: D(R - 3), id: att.mods.reticle || 'dot' }, length: L };
});
registerAttachmentBuilder('kind:holo', (K, att, c) => {
  const L = (c.spec.length || .095) * 1000, H = (c.spec.height || .06) * 1000, W = 38, wy = 14 + (H - 14) / 2;
  K.mat('rcv').extrude(SH(K, [[-L / 2, 0], [L / 2, 0], [L / 2, 14, 2], [-L / 2, 14, 2]], .6), D(W - 6), { b: D(1.6), bs: 2 });
  K.mat('rcv').lathe(LP([[0, -L / 2 + 6], [8, -L / 2 + 6, 1], [8.6, -L / 2 + 8], [8.6, L / 2 - 30, 1], [8, L / 2 - 28], [0, L / 2 - 28]]), { p: P3(0, 7, 0), r: [0, 0, 0], segs: 22 });
  const ring = rr(D(W), D(H - 12), D(6), 0, 0, K.arcN), hole = rr(D(W - 7), D(H - 18), D(4), 0, 0, K.arcN);
  for (const zz of [L / 2 - 8, -L / 2 + 22]) K.mat('rcv').extrude(ring, D(6), { plane: 'xy', p: [0, D(12 + (H - 12) / 2), 0], off: D(zz), b: D(1.2), bs: 2, holes: [hole] });
  for (const sx of [-1, 1]) K.mat('rcv').extrude(SH(K, [[-L / 2 + 22, 12], [L / 2 - 2, 12], [L / 2 - 2, 18, 2], [-L / 2 + 22, 18, 2]], .5), D(3.4), { off: sx > 0 ? D(W / 2 - 3.4) : -D(W / 2), b: D(.8), bs: 1 });
  K.mat('window').box(D(W - 8), D(H - 19), D(1.2), { p: P3(0, wy + 1, L / 2 - 5), b: 0 });
  K.mat('window').box(D(W - 8), D(H - 19), D(1.2), { p: P3(0, wy + 1, -L / 2 + 25), b: 0 });
  if (K.detail(0)) { for (const sx of [-1, 1]) K.mat('rubber').box(D(7), D(3), D(9), { p: P3(sx * 7, 14.6, -L / 2 + 8), b: D(1) }); K.mat('rubber').box(D(10), D(3), D(9), { p: P3(0, 14.6, -L / 2 + 19), b: D(1) }); }
  railClamp(K, { z0: -L / 2 + 10, z1: L / 2 - 20, h: 2, w: 30, qd: true });
  return { eye: P3(0, wy + 1, -230), reticle: { c: P3(0, wy + 1, -L / 2 + 23.5), r: D((H - 20) / 2), id: att.mods.reticle || 'holo' }, length: L };
});
registerAttachmentBuilder('kind:prism', (K, att, c) => {
  const L = (c.spec.length || .09) * 1000, H = (c.spec.height || .06) * 1000, lr = (c.spec.lens || .026) * 500, z = att.mods.zoom || 1.5;
  const yc = Math.max(H - lr - 7, 26), bw = 32, bL = L * .46;
  // prism housing (box with chamfers), objective tube + hood, ocular, turrets, base, light pipe (4x)
  K.mat('rcv').extrude(SH(K, [[-bw / 2, yc - 16], [bw / 2, yc - 16], [bw / 2, yc + 12, 4], [bw / 2 - 6, yc + 17, 3], [-bw / 2 + 6, yc + 17, 3], [-bw / 2, yc + 12, 4]], .6), D(bL), { plane: 'xy', off: D(-bL / 2 - 4), b: D(1.6), bs: 2 });
  K.mat('rcv').lathe(LP([[lr - 1, bL / 2 - 6], [lr + 3, bL / 2 - 4, 1], [lr + 3, L / 2 - 2, 1], [lr + 2, L / 2], [lr - 1, L / 2]]), { p: P3(0, yc, 0), segs: 32, crease: 40 });
  K.mat('rcv').lathe(LP([[0, -L / 2 + 2], [11, -L / 2 + 2, 1], [12.4, -L / 2 + 4, 1], [12.4, -bL / 2 - 2, 1], [0, -bL / 2]]), { p: P3(0, yc - 2, 0), segs: 28, crease: 40 });
  if (z >= 3) K.mat('rubber').lathe(LP([[10, -L / 2 - 6], [13, -L / 2 - 6, 1], [13.4, -L / 2], [12.4, -L / 2 + 2]]), { p: P3(0, yc - 2, 0), segs: 28 });
  for (const [ax, p] of [['y', P3(0, yc + 16, 0)], ['x', P3(bw / 2 - 1, yc, 0)]]) K.mat('rcv').lathe(LP([[0, 0], [7.4, 0], [7.4, 7, 1], [6.4, 8.6, 1], [0, 8.6]]), { axis: ax, p, segs: 22 });
  K.mat('rcv').extrude(SH(K, [[-bL / 2, 0], [bL / 2, 0], [bL / 2 - 4, yc - 15, 3], [-bL / 2 + 4, yc - 15, 3]], .6), D(22), { b: D(1.2), bs: 2 });
  railClamp(K, { z0: -bL / 2 - 4, z1: bL / 2 + 4, h: 3, w: 28, qd: z < 3 });
  if (z >= 4 && K.detail(0)) { K.mat('fibre_g').box(D(3), D(2), D(bL - 10), { p: P3(0, yc + 18, -2), b: D(.6) }); K.mat('rcv').box(D(8), D(3), D(10), { p: P3(0, yc + 18.5, bL / 2 - 10), b: D(1) }); }
  K.mat('lens').disc(D(lr), D(1), { p: P3(0, yc, L / 2 - 3), segs: 32 });
  K.part('lens', { pivot: P3(0, yc - 2, -L / 2 + 3), meta: { lens: true } }); K.mat('lens').disc(D(10), D(1), { p: P3(0, yc - 2, -L / 2 + 3.4), segs: 28 }); K.use('body');
  return { eye: P3(0, yc - 2, -L / 2 - (z >= 3 ? 66 : 80)), reticle: { c: P3(0, yc - 2, -L / 2 + 2.8), r: D(10), id: att.mods.reticle || 'chevron' }, lens: { part: 'lens', c: P3(0, yc - 2, -L / 2 + 3), r: D(10) }, glint: z >= 3 ? { c: P3(0, yc, L / 2 + .5), r: D(lr * 3) } : null, length: L };
});
function scopeAttachment(K, att, c, extra = {}) {
  const L = (c.spec.length || .3) * 1000, tube = (c.spec.tube || .03) * 1000, obj = (c.spec.lens || .042) * 1000, z0 = -L / 2;
  const oc = Math.min(44, Math.max(tube + 8, obj * .82)), y = Math.max(obj / 2 + 2.6 + 6, tube / 2 + 14);
  const zc = z0 + L * .52, sad = L < 160 ? 14 : 20, orr = Math.max(tube / 2 + 1, obj / 2 + 2.6), bellL = Math.max(4, (orr - tube / 2) * 2.4), zb = z0 + L - 24 - bellL;
  let r1 = Math.max(z0 + 74, -80), r2 = Math.min(zb - 10, 80);
  if (Math.abs(r1 - zc) < sad + 9) r1 = zc - sad - 9; if (Math.abs(r2 - zc) < sad + 9) r2 = zc + sad + 9;
  const rings = L < 160 ? [zc] : [r1, r2];
  const g = scopeGeom(K, { z0, len: L, y, tube, obj, oc, railY: 0, rings, mat: 'rcv', lever: !!c.spec.flipLever, param: L > 280, caps: L > 280, turretZ: zc, elevR: L < 160 ? 9 : 12.5, elevH: L < 160 ? 8 : 15, windR: L < 160 ? 8.5 : 11.5, ...extra });
  return { eye: P3(0, y, g.ocZ - (extra.relief || (L < 220 ? 80 : 92))), reticle: { c: P3(0, y, g.ocZ - .4), r: D(g.ocR), id: att.mods.reticle || 'duplex' }, lens: { part: 'lens', c: P3(0, y, g.ocZ), r: D(g.ocR) }, glint: { c: P3(0, y, z0 + L + .5), r: D(g.objR * 3) }, length: L };
}
registerAttachmentBuilder('kind:scope', (K, att, c) => scopeAttachment(K, att, c, att.id === 'o_pistol2x' ? { relief: 250, param: false, caps: false } : {}));
registerAttachmentBuilder('kind:lpvo', (K, att, c) => scopeAttachment(K, att, c, { relief: 96 }));
registerAttachmentBuilder('kind:thermal', (K, att, c) => {
  const L = (c.spec.length || .17) * 1000, lr = (c.spec.lens || .04) * 500, W = 52, H = 54, yc = H / 2 + 18;
  K.mat('rcv').extrude(SH(K, [[-L / 2 + 16, 14], [L / 2 - 24, 14], [L / 2 - 24, H + 16, 8], [-L / 2 + 30, H + 16, 10], [-L / 2 + 16, H - 2, 8]], 1), D(W), { b: D(4), bs: K.lod ? 1 : 3 });
  K.mat('rcv').lathe(LP([[lr - 2, L / 2 - 30], [lr + 4, L / 2 - 28, 1], [lr + 5, L / 2 - 6, 1], [lr + 4, L / 2, 1], [lr, L / 2]]), { p: P3(0, yc, 0), segs: 34, crease: 40 });
  K.mat('lens_ge').disc(D(lr), D(1.2), { p: P3(0, yc, L / 2 - 7), segs: 32 });
  K.mat('rubber').lathe(LP([[9, -L / 2 + 16], [17, -L / 2 + 16, 1], [19, -L / 2 + 8, 1], [20, -L / 2, 1], [18, -L / 2 - 1], [12, -L / 2 + 4]]), { p: P3(0, yc + 4, 0), segs: 30 });
  K.part('lens', { pivot: P3(0, yc + 4, -L / 2 + 14), meta: { lens: true } }); K.mat('screen').disc(D(11), D(1), { p: P3(0, yc + 4, -L / 2 + 15), segs: 28 }); K.use('body');
  if (K.detail(0)) { for (let k = 0; k < 3; k++) K.mat('rubber').cyl(D(4.2), D(2.2), { p: P3(-12 + k * 12, H + 10, -10 + (k === 1 ? 6 : 0)), axis: 'y', segs: 16 });
    K.mat('rcv').lathe(LP([[0, 0], [11, 0, 1], [11, 18, 1], [10, 20, 1], [0, 20]]), { axis: 'x', p: P3(W / 2 - 2, yc, -18), segs: 24, rmod: a => 1 - .05 * (Math.cos(a * 14) > .2 ? 1 : 0) }); }
  K.mat('rcv').extrude(SH(K, [[-L / 2 + 40, 0], [L / 2 - 50, 0], [L / 2 - 54, 16, 3], [-L / 2 + 44, 16, 3]], .6), D(24), { b: D(1.2), bs: 2 });
  railClamp(K, { z0: -L / 2 + 36, z1: L / 2 - 46, h: 3, w: 28, qd: true });
  return { eye: P3(0, yc + 4, -L / 2 - 30), reticle: { c: P3(0, yc + 4, -L / 2 + 14.4), r: D(11), id: 'thermal', bg: 'thermal' }, lens: { part: 'lens', c: P3(0, yc + 4, -L / 2 + 15), r: D(11) }, length: L };
});
registerAttachmentBuilder('kind:canted', (K, att, c) => {
  // two offset (45 degree) iron sight units on the rail: rear aperture at z = 0, front post at z = span; returns the canted sight line
  const span = c.spec.span || 150, a = Math.PI / 4, d = 30, up = [Math.sin(a), Math.cos(a), 0];
  for (const [zz, kind] of [[0, 'rear'], [span, 'front']]) {
    railClamp(K, { z0: zz - 9, z1: zz + 9, h: 5, w: 24 });
    K.at({ p: P3(9, 3, zz), r: [0, 0, -a] }, () => {
      K.mat('rcv').extrude(SH(K, [[-5, 0], [5, 0], [5, d - 6, 2], [-5, d - 6, 2]], .5), D(12), { plane: 'xy', off: -D(6), b: D(1), bs: 2 });
      if (kind === 'rear') K.mat('rcv').extrude(SH(K, [[-7, 0], [7, 0], [7, 10, 2.6], [-7, 10, 2.6]], .4), D(4), { plane: 'xy', off: -D(2), p: P3(0, d - 9, 0), b: D(.5), bs: 1, holes: [csMM(circle(1.25, 14, 0, 6))] });
      else { K.mat('rcv').extrude(SH(K, [[-7, 0], [7, 0], [7, 6, 2], [4.5, 13, 1], [3, 13], [3, 4], [-3, 4], [-3, 13], [-4.5, 13, 1], [-7, 6, 2]], .4), D(5), { plane: 'xy', off: -D(2.5), p: P3(0, d - 9, 0), b: D(.5), bs: 1 }); K.mat('metal').extrude(SH(K, [[-1.1, 0], [1.1, 0], [.9, 6.4, .3], [-.9, 6.4, .3]], .3), D(2.2), { plane: 'xy', off: -D(1.1), p: P3(0, d - 3.4, 0), b: D(.2), bs: 1 }); }
    });
  }
  const sp = [D(9 + Math.sin(a) * (d - 3)), D(3 + Math.cos(a) * (d - 3)), 0];
  return { canted: { eye: [sp[0], sp[1], -D(80)], up, front: [sp[0], sp[1], D(span)], rear: sp }, length: span + 9 };
});
// ---- muzzle devices ---------------------------------------------------------------------------------------------------------
const boreScale = (gun, base = 1) => !gun ? base : gun.bore === '50' ? base * 1.35 : (gun.bore === '338') ? base * 1.18 : gun.bore === '762' ? base * 1.08 : base;
registerAttachmentBuilder('kind:can', (K, att, c) => {
  const L = (c.spec.length || .17) * 1000, r = (c.spec.dia || .036) * 500, pistol = c.gun && c.gun.cat === 'pistol';
  if (!pistol) { K.mat('metal').lathe(LP([[3.4, 0], [9, 0, 1], [9.6, 1], [9.6, 14, 1], [r * .7, 18]]), { segs: 26 }); }
  canGeom(K, { z0: pistol ? 0 : 14, len: pistol ? L : L - 14, r, mat: 'rcv', knurl: att.id === 'm_supp_pistol' ? 'rcv' : 'blued_k', bore: pistol ? 3.4 : 4.6 });
  return { length: L, palette: { rcv: att.id === 'm_supp_762' ? 'cer_fde' : 'alu_blk' } };
});
for (const k of ['comp', 'flash', 'brake', 'choke']) registerAttachmentBuilder('kind:' + k, (K, att, c) => {
  const dia = (c.spec.dia || .026) * 1000, base = k === 'brake' ? 25.6 : k === 'comp' ? 24 : k === 'choke' ? 25.2 : 21.6;
  const s = c.gun && c.gun.cat === 'pistol' ? .82 : boreScale(c.gun, dia / base);
  const L = mdev(K, k === 'flash' ? 'flash' : k, { z: 0, y: 0, mat: 'rcv', part: null, s });
  return { length: L, palette: { rcv: k === 'comp' ? 'nitride' : 'dksteel' } };
});
// ---- under-barrel ---------------------------------------------------------------------------------------------------------------
function underClamp(K, L = 30) { railClamp(K, { z0: -L / 2, z1: L / 2, h: 7, w: 26, mat: 'frame' }); }
registerAttachmentBuilder('kind:vgrip', (K, att, c) => {
  const L = (c.spec.length || .1) * 1000, short = L < 70;
  underClamp(K, short ? 28 : 34);
  K.mat('frame').lathe(LP([[0, 5], [14, 5, 1], [15.4, 8], [15, L - 8, 1], [13.6, L - 3, 1], [11, L], [0, L]]), { axis: 'y', segs: 26, crease: 40, rmod: K.detail(0) && !short ? (a, z) => (z > D(16) && z < D(L - 14) ? 1 - .045 * Math.max(0, Math.sin((z * 1000 - 16) / (L - 30) * Math.PI * 4)) : 1) : null });
  if (!short && K.detail(0)) K.mat('grip').lathe(LP([[15.1, 20], [15.3, 22], [15.1, L - 18], [14.9, L - 16]]), { axis: 'y', segs: 26 });
  if (K.detail(0)) K.mat('rubber').lathe(LP([[0, L], [11, L], [11.4, L + 2, 1], [0, L + 3]]), { axis: 'y', segs: 22 });
  return { hand: { p: P3(0, L * (short ? .7 : .55), 0), r: [Math.PI, 0, 0], kind: 'grip' } };
});
registerAttachmentBuilder('kind:stubby', (K, att, c) => ATT_BUILDERS.get('kind:vgrip')(K, att, { ...c, spec: { ...c.spec, length: c.spec.length || .05 } }));
registerAttachmentBuilder('kind:agrip', (K, att, c) => {
  const L = (c.spec.length || .07) * 1000;
  K.mat('frame').extrude(SH(K, [[-L / 2 - 6, -3.4], [L / 2 + 4, -3.4], [L / 2 + 4, 4, 2], [L / 2 - 6, 26, 6], [L / 2 - 16, 28, 4], [-L / 2 + 4, 12, 8], [-L / 2 - 6, 6, 3]], .8), D(26), { b: D(3), bs: K.lod ? 1 : 3 });
  if (K.detail(0)) K.mat('grip').extrude(SH(K, [[-L / 2 + 6, 9], [L / 2 - 10, 20], [L / 2 - 14, 24, 2], [-L / 2 + 4, 13, 2]], .4), D(27), { b: D(.6), bs: 1 });
  return { hand: { p: P3(0, 14, 0), r: [Math.PI, 0, 0], kind: 'hold' } };
});
registerAttachmentBuilder('kind:handstop', (K, att, c) => {
  K.mat('frame').extrude(SH(K, [[-20, -3.4], [16, -3.4], [16, 2, 2], [8, 18, 4], [2, 18, 3], [-14, 6, 6], [-20, 2, 2]], .6), D(24), { b: D(2.4), bs: K.lod ? 1 : 3 });
  if (K.detail(0)) K.screw({ p: P3(12.1, 1, -6), axis: 'x', d: D(5), h: D(1), type: 'hex', mat: 'metal' });
  return { hand: { p: P3(0, 10, -40), r: [Math.PI, 0, 0], kind: 'hold' } };
});
registerAttachmentBuilder('kind:bipod', (K, att, c) => {
  const L = (c.spec.length || .18) * 1000;
  railClamp(K, { z0: -16, z1: 16, h: 6, w: 30, mat: 'rcv' });
  K.mat('rcv').extrude(SH(K, [[-22, 6], [22, 6], [20, 20, 4], [-20, 20, 4]], .6), D(52), { plane: 'xy', off: -D(18), p: P3(0, 0, 0), b: D(1.6), bs: 2 });
  if (K.detail(0)) K.mat('metal').lathe(LP([[0, 0], [7, 0, 1], [7, 10, 1], [0, 11]]), { axis: 'x', p: P3(24, 14, 0), segs: 18, rmod: a => 1 - .06 * (Math.cos(a * 12) > .2 ? 1 : 0) });
  K.part('legs', { pivot: P3(0, 16, 12), meta: { deployR: [HALF, 0, 0] } });   // folded forward along +Z; deploy = rotate to +Y (down)
  for (const sx of [-1, 1]) {
    K.mat('rcv').lathe(LP([[0, 0], [6, 0, 1], [6, L * .55, 1], [5, L * .56]]), { p: P3(sx * 16, 16, 12), segs: 16 });
    K.mat('metal').lathe(LP([[0, L * .5], [4.4, L * .5], [4.4, L, 1], [0, L]]), { p: P3(sx * 16, 16, 12), segs: 14 });
    K.mat('rubber').sphere(D(7), { p: P3(sx * 16, 16, 12 + L + 3), segs: 14, s: [1, 1, 1.3] });
    if (K.detail(0)) K.spring({ p: P3(sx * 23, 12, 2), coil: D(2.2), wire: D(.7), len: D(26), turns: 9 });
  }
  K.use('body');
  return { bipod: { part: 'legs', deployR: [HALF, 0, 0] } };
});
// ---- side (lasers, lights): socket +Y = outward, +X = down ---------------------------------------------------------------------
function laserBox(K, { L, W = 26, H = 30, mat = 'rcv', lens = 'lens', two = false }) {
  K.mat(mat).extrude(SH(K, [[-L / 2, 4], [L / 2, 4], [L / 2, H, 4], [-L / 2 + 8, H, 6], [-L / 2, H - 8, 4]], .8), D(W), { b: D(2.4), bs: K.lod ? 1 : 3 });
  railClamp(K, { z0: -L / 2 + 6, z1: L / 2 - 10, h: 4, w: W - 2, mat });
  const ap = (x, y, r) => { K.mat(mat).lathe(LP([[r - 1, L / 2 - 2], [r + 1.6, L / 2 - 2, 1], [r + 2, L / 2 + 3, 1], [r, L / 2 + 4]]), { p: P3(x, y, 0), segs: 24 }); K.mat(lens).disc(D(r), D(1), { p: P3(x, y, L / 2 + 2.6), segs: 22 }); };
  ap(two ? -6 : 0, H * .62, 4.4); if (two) ap(6, H * .62, 6.4);
  if (K.detail(0)) { K.mat('rubber').box(D(10), D(3), D(14), { p: P3(0, H + 1, -L / 2 + 14), b: D(1.4) }); for (const zz of [L / 2 - 16, L / 2 - 30]) K.screw({ p: P3(W / 2, H * .62, zz), axis: 'x', d: D(5.6), h: D(1.4), type: 'slot', mat: 'metal' }); }
  return H * .62;
}
registerAttachmentBuilder('kind:laser', (K, att, c) => {
  const L = (c.spec.length || .07) * 1000, y = laserBox(K, { L, lens: att.mods.laser === 'ir' ? 'lens_ge' : 'led' });
  K.node('laser', P3(0, y, L / 2 + 3), [0, 0, 0]);
  return { emitters: { laser: true }, laserColor: c.spec.color || [1, .1, .08] };
});
registerAttachmentBuilder('kind:combo', (K, att, c) => {
  const L = (c.spec.length || .1) * 1000, y = laserBox(K, { L, W: 32, H: 34, two: true, lens: 'led_g' });
  K.node('laser', P3(-6, y, L / 2 + 3), [0, 0, 0]); K.node('light', P3(6, y, L / 2 + 3), [0, 0, 0]);
  return { emitters: { laser: true, light: true }, laserColor: c.spec.color || [.15, 1, .2] };
});
registerAttachmentBuilder('kind:light', (K, att, c) => {
  const L = (c.spec.length || .12) * 1000, r = (c.spec.dia || .028) * 500, y = 9 + r + 6;
  railClamp(K, { z0: -16, z1: 16, h: 5, w: 26 });
  K.mat('rcv').extrude(SH(K, [[-14, 4], [14, 4], [12, y - r + 3, 3], [-12, y - r + 3, 3]], .6), D(18), { b: D(1.4), bs: 2 });
  K.mat('rcv').lathe(LP([[r - 3, -L / 2 + 4], [r - 1, -L / 2 + 4, 1], [r - 1, -L / 2 + 30], [r - 2, -L / 2 + 32], [r - 2, L / 2 - 34], [r, L / 2 - 30], [r + 2.6, L / 2 - 12, 1], [r + 2.6, L / 2 - 1, 1], [r + 1.8, L / 2, 1], [r - 1.6, L / 2]]), { p: P3(0, y, 0), segs: 30, crease: 40, rmod: K.detail(0) ? (a, z) => (z < D(-L / 2 + 30) && z > D(-L / 2 + 6) ? 1 - .04 * (Math.cos(a * 18) > 0 ? 1 : 0) : 1) : null });
  K.mat('rubber').lathe(LP([[0, -L / 2 - 2], [5, -L / 2 - 2, 1], [6, -L / 2 + 1], [6, -L / 2 + 4]]), { p: P3(0, y, 0), segs: 20 });
  K.mat('bright').lathe(LP([[2, L / 2 - 8], [r - .6, L / 2 - 2]]), { p: P3(0, y, 0), segs: 26 });
  K.mat('lens').disc(D(r - 1.4), D(.8), { p: P3(0, y, L / 2 - 1.2), segs: 26 });
  K.mat('emit').disc(D(2.4), D(1), { p: P3(0, y, L / 2 - 7), segs: 12 });
  K.node('light', P3(0, y, L / 2 + .5), [0, 0, 0]);
  return { emitters: { light: true } };
});
registerAttachmentBuilder('s_light', ATT_BUILDERS.get('kind:light'));
// ---- magazines, stocks, barrels as stand-alone models (armory) — on guns they are built into the gun (setMods rebuild) ----------
const MAG_FOR = gun => !gun ? 'stanag' : gun.cat === 'sniper' ? (gun.bore === '50' ? 'bmg' : gun.bore === '338' ? 'sniper338' : 'sniper') : gun.bore === '762' ? (gun.cat === 'carbine' ? 'ak' : 'ar10') : gun.bore === '9' || gun.bore === 'pdw' ? 'pcc' : 'stanag';
for (const k of ['extmag', 'drum', 'twindrum', 'coupler']) registerAttachmentBuilder('kind:' + k, (K, att, c) => {
  if (c.gun && c.gun.cat === 'pistol') { boxMag(K, { top: [0, 0], len: 128, d: 32, w: 22, rake: .25, cal: '9', ext: (att.model.ext || 0) * 1000, variant: att }); return {}; }
  rmag(K, { kind: MAG_FOR(c.gun), top: [0, 0], variant: att }); return {};
});
registerAttachmentBuilder('kind:tube', (K, att) => {
  const L = (att.model.ext || .12) * 1000;
  K.mat('rcv').lathe(LP([[0, -10], [11, -10], [11, L - 12, 1], [12, L - 10, 1], [12, L + 4, 1], [10, L + 6, 1], [0, L + 6]]), { segs: 26, crease: 35 });
  K.mat('rcv').extrude(SH(K, [[-8, -12, 4], [8, -12, 4], [8, 30, 6], [-8, 30, 6]], .5), D(16), { plane: 'xy', off: D(L - 24), b: D(1.2), bs: 2 });
  return {};
});
registerAttachmentBuilder('kind:beltbox', (K, att) => {
  const [w, h, d] = (att.model.size || [.14, .12, .09]).map(v => v * 1000);
  K.mat('stamp').extrude(SH(K, [[-w / 2, 0, 3], [w / 2, 0, 3], [w / 2, -h, 4], [-w / 2, -h, 4]], .6), D(d), { b: D(2), bs: 2 });
  K.mat('stamp').extrude(SH(K, [[-w / 2 - 2, 0], [w / 2 + 2, 0], [w / 2 + 2, 6, 2], [-w / 2 - 2, 6, 2]], .4), D(d + 4), { b: D(1), bs: 1 });
  K.mat('metal').sweep([P3(0, 6, -w * .3), P3(0, 22, -w * .2), P3(0, 22, w * .2), P3(0, 6, w * .3)], { rad: D(3), segs: 8 });
  if (K.detail(0)) for (let k = 0; k < 4; k++) K.at({ p: P3(d / 2 + 10, 4 + k * 3, -w / 2 + 20 + k * 14), r: [0, 0, .2 * k] }, () => cartridge(K, CAL['556'], { p: [-D(20), 0, 0], r: [0, HALF, 0], segs: 8 }));
  return { palette: { stamp: 'park' } };
});
function stockGeom(K, kind, iface) {
  // stand-alone stock assembly from z = 0 back (-Z): adapter + buffer tube (unless the gun has its own tube) + stock body
  const heavy = kind === 'heavy', tube = iface && iface.kind === 'tube' ? (iface.tube || 180) : 0, yt = 0;
  let z0 = 0;
  if (!tube) {
    K.mat('alu').extrude(SH(K, [[-22, -16, 3], [0, -16], [0, 18], [-22, 18, 3]], .6), D(30), { b: D(1.6), bs: 2 });
    K.mat('alu').lathe(LP([[0, -200], [13, -200, 1], [14.6, -198, 1], [14.6, -24], [17, -22], [17, -18], [15, -16], [0, -16]]), { segs: 26, crease: 35 });
    z0 = -200;
  } else z0 = -tube;
  const zb = z0 - 30;
  if (heavy) {
    K.mat('furn').extrude(SH(K, [[z0 + 110, 18, 6], [zb + 26, 26, 6], [zb, 30, 5], [zb, -100, 8], [zb + 40, -100, 10], [z0 + 40, -30, 18], [z0 + 120, -18, 8]], 1), D(46), { b: D(6), bs: K.lod ? 1 : 3 });
    K.mat('furn').lathe(LP([[15.6, z0 + 20], [21, z0 + 26, 1], [21, z0 + 120, 1], [16, z0 + 126]]), { segs: 24 });
    K.mat('furn').extrude(SH(K, [[zb + 20, 44, 8], [z0 + 90, 42, 10], [z0 + 96, 24, 4], [zb + 24, 24, 4]], .8), D(36), { b: D(4), bs: K.lod ? 1 : 3 });
    K.mat('rubber').extrude(SH(K, [[zb - 18, 32, 6], [zb + 1, 32], [zb + 1, -104], [zb - 16, -106, 8]], .8), D(48), { b: D(4), bs: K.lod ? 1 : 3 });
    if (K.detail(0)) for (const zz of [zb + 40, z0 + 70]) K.mat('metal').cyl(D(4), D(14), { p: P3(0, 20, zz), axis: 'y', segs: 12 });
  } else {
    K.mat('furn').lathe(LP([[15.4, z0 + 30], [18, z0 + 33, 1], [18, z0 + 96, 1], [15.4, z0 + 100]]), { segs: 22 });
    K.mat('furn').sweep([P3(0, 12, z0 + 60), P3(0, 22, zb + 30), P3(0, 24, zb + 6)], { rad: D(5), segs: 10 });
    K.mat('furn').sweep([P3(0, -12, z0 + 50), P3(0, -70, zb + 26), P3(0, -84, zb + 6)], { rad: D(5), segs: 10 });
    K.mat('rubber').extrude(SH(K, [[zb - 12, 28, 5], [zb + 6, 28], [zb + 6, -90], [zb - 10, -92, 6]], .6), D(36), { b: D(3), bs: 2, holes: K.detail(1) ? [SH(K, [[zb - 8, 10, 3], [zb + 2, 10, 3], [zb + 2, -70, 3], [zb - 6, -72, 3]], .4)] : [] });
  }
  void yt;
}
registerAttachmentBuilder('kind:heavy', (K, att, c) => { if (att.slot === 'barrel') return barrelGeom(K, att, c); stockGeom(K, 'heavy', c.iface); return { palette: { furn: 'poly_blk', alu: 'alu_blk' } }; });
registerAttachmentBuilder('kind:light', (K, att, c) => {
  if (att.slot === 'side') return ATT_BUILDERS.get('s_light')(K, att, c);
  stockGeom(K, 'light', c.iface); return { palette: { furn: 'poly_blk', alu: 'alu_blk' } };
});
registerAttachmentBuilder('kind:folded', (K) => {   // stand-alone: the folding hinge adapter (on guns k_folded is a pose of parts.stock)
  K.mat('alu').extrude(SH(K, [[-30, -16, 3], [0, -16], [0, 18], [-30, 18, 3]], .6), D(30), { b: D(1.6), bs: 2 });
  K.mat('metal').cyl(D(5), D(36), { p: P3(0, 0, -30), axis: 'y', c: true, segs: 18 });
  return {};
});
function barrelGeom(K, att, c) {
  const kind = att.model.kind, L = 300 + (kind === 'long' ? 100 : kind === 'short' ? -80 : 0), r = kind === 'heavy' ? (att.model.dia || .024) * 500 : 9.6;
  K.mat('barrel').lathe(LP([[4, 0], [12.4, 0], [12.4, 22, 1], [r, 26], [r, L - 20, 1], [7.2, L - 14], [7.2, L], [4, L]]), { segs: 28, crease: 30 });
  K.mat('dark').lathe(LP([[r - .6, L * .6 - 10], [14.6, L * .6 - 10, 1], [15.2, L * .6 - 9, 1], [15.2, L * .6 + 10, 1], [r - .6, L * .6 + 11]]), { segs: 24 });
  return { palette: { barrel: 'nitride' } };
}
registerAttachmentBuilder('kind:long', barrelGeom);
registerAttachmentBuilder('kind:short', barrelGeom);


// =========================================================================================================================
// Melee weapons (buildGun(scene, 'knife' | 'zafra' | 'ridgehawk')). Melee-local axes: +Z along the blade / handle toward the tip
// (or the head), +Y = spine side, -Y = cutting edge, origin at the hand (mid-grip). hands.right: +Y toward the tip (the grip axis),
// +Z toward the edge. Nodes: tip (blade point / bit centre), edge0 / edge1 (edge line for trails), pommel.
/** blade as a loft of 6-point cross-sections along z: spine(t), edge(t), grind(t) heights (mm), thickness th (mm), z0..z1 */
function bladeLoft(K, { z0, z1, spine, edge, grind, th, n = 36, mat = 'blade', edgeMat = 'edge' }) {
  const flat = [], bev = [], N = K.lod ? Math.max(4, Math.round(n / 3)) : n;
  for (let k = 0; k <= N; k++) {
    const t = k / N, z = z0 + (z1 - z0) * t, ys = spine(t), ye = edge(t), yg = grind(t), h = th * (1 - Math.pow(t, 6) * .92) / 2, e = Math.max(.12, h * .08);
    flat.push([[-h, ys, z, .25], [h, ys, z, .25], [h, yg, z, 0], [-h, yg, z, 0]].map(([x, y, zz, w]) => [D(x), D(y), D(zz), w]));
    bev.push([[-h, yg, z], [h, yg, z], [e, ye, z], [-e, ye, z]].map(([x, y, zz]) => [D(x), D(y), D(zz), 0]));
  }
  K.mat(mat).loft3(flat, { crease: 25, capB: true });
  K.mat(edgeMat).loft3(bev, { crease: 25, capB: true });
}
function meleeSpec(K, g) {
  const id = g.id, lod = K.lod;
  if (id === 'knife' || g.archetype === 'knife') {
    // drop-point fixed blade: black coated with a bright ground edge, polymer handle with finger grooves, guard, pommel + lanyard hole
    const L = (g.model.blade || .165) * 1000, zg = 34;
    bladeLoft(K, { z0: zg, z1: zg + L, th: 4.6, mat: 'blade', spine: t => t < .62 ? 15 - t * 3 : 13 - (t - .62) / .38 * 13.5, edge: t => t < .7 ? -16 : -16 + Math.pow((t - .7) / .3, 1.6) * 15.4, grind: t => (t < .62 ? 15 - t * 3 : 13 - (t - .62) / .38 * 13.5) * .3 + (t < .7 ? -16 : -16 + Math.pow((t - .7) / .3, 1.6) * 15.4) * .7 + 9 });
    K.mat('blade').extrude(SH(K, [[zg - 3, -17], [zg + 14, -17], [zg + 14, 14], [zg - 3, 15]], .4), D(4.6), { b: D(.6), bs: 1 });            // ricasso
    if (K.detail(0)) for (let k = 0; k < 7; k++) K.mat('blade').box(D(5), D(1.2), D(2), { p: P3(0, 14.6, zg + 10 + k * 4.5), b: D(.3) });     // spine jimping
    K.mat('metal').extrude(SH(K, [[-4, -24, 1], [3, -26, 2], [4, -16], [4, 18, 2], [-4, 20, 2], [-5, -10]], .4), D(14), { p: P3(0, 0, zg - 7), b: D(1.2), bs: 3 });   // guard
    if (K.detail(0)) { K.mat('metal').lathe(LP([[12.6, -95], [13.8, -94, 1], [13.8, -86, 1], [12.6, -85]]), { segs: 30, s: [1, 1.25, 1] }); for (const zz of [-20, -60]) K.screw({ p: P3(6.2, -1, zz), axis: 'x', d: D(6), h: D(1), type: 'torx', mat: 'metal' }); }
    const rows = [];
    for (let k = 0; k <= (lod ? 4 : 32); k++) {
      const t = k / (lod ? 4 : 32), z = zg - 7 - t * 112, groove = lod ? 0 : Math.max(0, Math.sin(t * Math.PI * 4 - .3)) * 2.2 * (t < .8 ? 1 : 0);
      const hh = 30 - Math.sin(t * Math.PI) * 2 + (t > .9 ? 2 : 0), hw = 11.5 + Math.sin(t * Math.PI) * 1.4;
      rows.push(ovalPts(hh - groove, hw, 7, 9, lod ? 2 : 6).map(([sv, x]) => [D(x), D(-hh / 2 + groove + sv - 1), D(z), 0]).map(p => [p[0], p[1], p[2], 0]).map(([x, y, z2]) => [x, y, z2, 0]));
    }
    K.mat('grip').loft3(rows.map(r => r.map(p => [p[0], p[1], p[2], p[3]])), { crease: 50 });
    K.mat('metal').extrude(SH(K, [[-94, -14, 4], [-84, -14], [-84, 15], [-94, 15, 5], [-102, 2, 4]], .5), D(16), { b: D(1.6), bs: 2, holes: K.detail(1) ? [csMM(circle(3, 14, -95, 1))] : [] });
    if (K.detail(0)) for (const zz of [-10, -50]) K.mat('metal').cyl(D(3), D(25), { p: P3(0, -1, zz), axis: 'x', c: true, segs: 14 });
    K.node('tip', P3(0, -.5, zg + L), [0, 0, 0]); K.node('edge0', P3(0, -16, zg + 4), [0, 0, 0]); K.node('edge1', P3(0, -2, zg + L - 4), [0, 0, 0]); K.node('pommel', P3(0, 0, -102), [0, 0, 0]);
    return { hand: [0, -2, -30], pal: { blade: 'blade_blk', edge: 'blade', grip: 'poly_grp', metal: 'dksteel' } };
  }
  if (id === 'zafra' || g.archetype === 'machete') {
    // cane-cutter machete: long thin blade widening toward the tip, hooked spine at the end, two riveted wooden scales
    const L = (g.model.blade || .46) * 1000, zg = 20;
    bladeLoft(K, { z0: zg, z1: zg + L, th: 3.2, mat: 'blade', n: 48, spine: t => 12 + t * 18 + (t > .9 ? (t - .9) / .1 * 12 : 0), edge: t => -16 - t * 24 + (t > .94 ? (t - .94) / .06 * 34 : 0), grind: t => -6 - t * 12 });
    if (K.detail(1)) K.mat('blade').extrude(SH(K, [[zg + L - 20, 26], [zg + L - 2, 42, 2], [zg + L + 2, 40], [zg + L - 6, 26]], .4), D(3), { b: D(.6), bs: 1 });   // hook
    K.mat('blade').extrude(SH(K, [[-110, -12, 4], [zg + 8, -16], [zg + 8, 13], [-110, 10, 4]], .4), D(3.2), { b: D(.4), bs: 1 });                // tang
    for (const sx of [-1, 1]) K.mat('wood').extrude(SH(K, [[-118, -16, 8], [zg - 4, -18, 3], [zg - 2, 15, 3], [-118, 12, 8], [-128, -2, 6]], .8), D(7), { off: sx > 0 ? D(1.6) : -D(8.6), b: D(2.6), bs: K.lod ? 1 : 3 });
    if (K.detail(0)) for (const zz of [-90, -40, 0]) K.mat('brass').cyl(D(3), D(19.4), { p: P3(0, -1, zz), axis: 'x', c: true, segs: 14 });
    if (K.detail(0)) K.mat('cord').sweep([P3(0, 0, -122), P3(0, 14, -146), P3(0, 0, -172), P3(0, -14, -146), P3(0, 0, -122)], { rad: D(2), segs: 8 });
    K.node('tip', P3(0, 0, zg + L), [0, 0, 0]); K.node('edge0', P3(0, -18, zg + 30), [0, 0, 0]); K.node('edge1', P3(0, -38, zg + L - 30), [0, 0, 0]); K.node('pommel', P3(0, 0, -128), [0, 0, 0]);
    return { hand: [0, -2, -50], pal: { blade: 'blade', edge: 'edge', wood: 'walnut', metal: 'dksteel' } };
  }
  // tomahawk: G10-scaled full-tang handle, head with the bit (edge side, -Y) and the breaching spike (+Y), lightening holes
  const L = (g.model.length || .4) * 1000, zh = L - 120;
  K.mat('metal').extrude(SH(K, [[-60, -9, 3], [zh + 10, -10], [zh + 10, 10], [-60, 9, 3], [-70, 0, 4]], .5), D(6), { b: D(1), bs: 1 });
  for (const sx of [-1, 1]) K.mat('grip').extrude(SH(K, [[-64, -15, 6], [zh - 40, -13, 8], [zh - 40, 13, 8], [-64, 14, 6], [-74, 0, 6]], .8), D(9), { off: sx > 0 ? D(3) : -D(12), b: D(4), bs: K.lod ? 1 : 3 });
  if (K.detail(0)) for (const zz of [-40, 40, 120, 200]) K.mat('metal').cyl(D(3.2), D(18.2), { p: P3(0, 0, zz), axis: 'x', c: true, segs: 14 });
  if (K.detail(0)) K.mat('cord').sweep(Array.from({ length: 20 }, (_, k) => P3(Math.sin(k * 1.4) * 9.8, Math.cos(k * 1.4) * 13, -60 + k * 4.2)), { rad: D(1.6), segs: 6 });
  const bit = [[zh - 6, -8], [zh + 40, -8, 4], [zh + 52, -30, 10], [zh + 98, -76, 2], [zh + 108, -58, 6], [zh + 112, -6, 4], [zh + 112, 8, 3], [zh + 70, 14], [zh - 6, 12, 3]];
  K.mat('blade').extrude(SH(K, bit, .6), D(7), { b: D(2.6), bs: K.lod ? 1 : 2, holes: K.detail(1) ? [SH(K, [[zh + 18, -2, 4], [zh + 46, -2, 4], [zh + 46, 6, 4], [zh + 18, 6, 4]], .5)] : [] });
  bladeLoft(K, { z0: zh + 46, z1: zh + 108, th: 7, mat: 'blade', n: 20, spine: t => -24 - t * 30, edge: t => -50 - t * 26 + Math.sin(t * Math.PI) * -4, grind: t => -34 - t * 28 });
  const sp = []; for (let k = 0; k <= 4; k++) { const t = k / 4, w = 3.5 * (1 - t) + .3, h = 7 * (1 - t) + .3, y = 12 + t * 46, z = zh + 60 - t * 10; sp.push([[-w, y, z - h], [w, y, z - h], [w, y, z + h], [-w, y, z + h]].map(([x, yy, zz]) => [D(x), D(yy), D(zz), t > .7 ? 1 : 0])); }
  K.mat('blade').loft3(sp, { crease: 30 });
  K.node('tip', P3(0, -62, zh + 104), [0, 0, 0]); K.node('edge0', P3(0, -50, zh + 108), [0, 0, 0]); K.node('edge1', P3(0, -76, zh + 98), [0, 0, 0]); K.node('pommel', P3(0, 0, -74), [0, 0, 0]);
  return { hand: [0, 0, 20], pal: { blade: 'blade_blk', edge: 'blade', grip: 'g10', metal: 'dksteel' } };
}
function buildMelee(scene, gun, opts = {}) {
  const lod = Math.max(0, Math.min(2, opts.lod | 0)), s = st(scene), key = 'melee|' + gun.id + '|' + lod, t0 = performance.now();
  let tpl = s.templates.get(key), hit = !!tpl;
  if (!tpl) {
    const K = new Kit({ lod, seed: hashStr(gun.id), wear: 1 }); CS_N = lod === 0 ? 3 : 1;
    const r = meleeSpec(K, gun);
    K.node('hand_r', P3(...r.hand), [HALF, 0, 0], { meta: { kind: 'melee' } });
    const built = K.build();
    if (!s.root) { s.root = new (B().TransformNode)('gunkit_templates', scene); s.root.setEnabled(false); }
    const res = kitToMeshes(scene, built, { ...BASE_PAL, ...r.pal }, { name: 'melee_' + gun.id, parent: s.root });
    tpl = { res, meta: built.meta, tris: built.stats.tris, ms: performance.now() - t0 }; s.templates.set(key, tpl);
  }
  const root = opts.instance ? instTree(tpl.res.root, null) : cloneTree(tpl.res.root, null, new Map()); root.setEnabled(true); root.name = 'melee_' + gun.id; root.metadata = { gk: 'root', gun: gun.id };
  const loc = {}, meshes = [];
  for (const n of root.getDescendants(false)) { const g = n.metadata && n.metadata.gk; if (g === 'mesh') meshes.push(n); else if (g && g.startsWith('node:')) loc[g.slice(5)] = n; }
  const gm = { id: gun.id, gun, lod, skin: 'factory', scene, melee: true, root, meshes, parts: {}, sockets: {}, attachments: {}, mods: {}, muzzle: null, eject: null,
    sight: null, emitters: {}, hands: { right: loc.hand_r || null, left: null }, tip: loc.tip || null, edge: [loc.edge0 || null, loc.edge1 || null], pommel: loc.pommel || null, loc,
    info: { tris: tpl.tris, buildMs: hit ? 0 : tpl.ms, cloneMs: performance.now() - t0, cached: hit, key },
    setMods() { return gm; }, dispose() { root.dispose(false, false); } };
  return gm;
}

// ---- intrinsic variants for builders that do not model them themselves (magazine extension / coupling, barrel length) ----------
/** after a builder ran: extend or couple the 'mag' part, and z-warp the front of the gun for barrel length mods (spec.warp) */
function postIntrinsic(K, spec, ctx) {
  const mg = ctx.intr.mag, bb = ctx.intr.barrel, P = K.parts.get('mag');
  if (mg && P && P.roles.size) {
    const k = mg.model.kind;
    if (k === 'extmag' && !K.meta.magExt) extendMagPart(K, P, (mg.model.ext || .05) * 1000);
    if (k === 'coupler' && !K.meta.magCoupled) coupleMagPart(K, P);
  }
  if (bb && !K.meta.barrelDone && spec.warp) {
    const W = spec.warp, span = W.z1 - W.z0, kd = bb.model.kind;
    const ext = kd === 'long' ? (bb.model.ext || .1) * 1000 : kd === 'short' ? Math.max((bb.model.ext || -.08) * 1000, -span * .7) : 0;
    if (ext) K.warpZ({ z0: D(W.z0), z1: D(W.z1), ext: D(ext), yMin: W.yMin !== undefined ? D(W.yMin) : -Infinity, skip: W.skip || ['mag', 'stock'] });
    if (kd === 'heavy') K.meta.heavyBarrel = true;
  }
}
const partBounds = P => { const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity]; for (const B of P.roles.values()) for (let i = 0; i < B.p.length; i += 3) for (let a = 0; a < 3; a++) { const v = B.p[i + a]; if (v < mn[a]) mn[a] = v; if (v > mx[a]) mx[a] = v; } return { mn, mx }; };
/** push the lower third of a magazine part down (part-local -Y) by ext mm: extended base */
function extendMagPart(K, P, ext) {
  const { mn, mx } = partBounds(P), cut = mn[1] + (mx[1] - mn[1]) * .4, e = D(ext);
  for (const B of P.roles.values()) for (let i = 0; i < B.p.length; i += 3) if (B.p[i + 1] < cut) B.p[i + 1] -= e;
}
/** duplicate a magazine part beside itself (+X) with two clamps: coupled fast-reload magazines */
function coupleMagPart(K, P) {
  const { mn, mx } = partBounds(P), dx = mx[0] - mn[0] + D(3);
  for (const B of P.roles.values()) {
    const n = B.nv, L = B.p.length;
    for (let i = 0; i < L; i += 3) { B.p.push(B.p[i] + dx, B.p[i + 1], B.p[i + 2]); B.n.push(B.n[i], B.n[i + 1], B.n[i + 2]); }
    B.uv.push(...B.uv.slice(0, n * 2)); B.c.push(...B.c.slice(0, n * 4)); B.w.push(...B.w.slice(0, n));
    const I = B.i.length; for (let t = 0; t < I; t++) B.i.push(B.i[t] + n); B.nv += n;
  }
  const prev = K.cur; K.use(P.name);
  for (const f of [.3, .7]) { const y = mn[1] + (mx[1] - mn[1]) * f, z = (mn[2] + mx[2]) / 2; K.mat('furn').box(mx[0] - mn[0] + dx + D(5), D(10), mx[2] - mn[2] + D(5), { p: [P.pivot[0] + (mn[0] + mx[0] + dx) / 2, P.pivot[1] + y, P.pivot[2] + z], b: D(1.4) }); }
  K.cur = prev;
}
Object.assign(MODEL_SPECS.spatz, { warp: { z0: 100, z1: 252, yMin: 10 } });
Object.assign(MODEL_SPECS.hachi, { warp: { z0: 30, z1: 126, yMin: 10 } });
Object.assign(MODEL_SPECS.corvid, { warp: { z0: 120, z1: 224, yMin: 10 } });
Object.assign(MODEL_SPECS.torsion, { warp: { z0: 90, z1: 212, yMin: 10 } });
