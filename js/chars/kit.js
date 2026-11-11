/* LIVE FIRE — character kit: the Neon Veins human kit + gloves (glTF, loaded once per page into plain vertex arrays), the
   one character material (PBR + the LFChar plugin: per-vertex material ROLE, per-instance palette row, procedural camo,
   team rim light for friendlies) and thin-instance batches (one draw call per geometry for every character in the scene).
   Exports:
     loadKit() -> Promise<KD>          { name: geo } for the kit parts (torso pelvis leg_u leg_l foot arm_u arm_l hand head + _lo,
                                       head_lo2, asymmetric parts also as <name>_L mirrored) and the gloves (glove_grip, glove_hold
                                       and their _L mirrors). geo = { p, n, c (RGBA AO), i, uv? } plain typed arrays, game axes.
     ROLE                              material roles (per vertex attribute 'lfRole'): see the table below
     SLOT                              palette slots (16 per row)
     PAL_ROWS                          rows in the palette texture (one per character look)
     charMaterial(scene) -> PBRMaterial  the shared character material (cached per scene)
     setPaletteRow(scene, row, colours)  colours = { slot: [r, g, b, a?] sRGB 0..1 } -> uploads the row
     makeGeo(scene, name, geo, roles) -> Mesh   a host mesh (unique geometry) with 'lfRole' data (roles: Float32Array or a number)
     Batch                             class: new Batch(scene, name, geo, roles, cap, { shadowOnly })
                                       .reset(), .push(m16 (Float32Array(16), row-major), row, friendly), .flush()
                                       .mesh (the host), .n (instances this frame)
     triSign, orient, mirrorGeo, geoFromVD, geoBounds   geometry helpers (pure JS)
   Roles (vertex colour RGB = baked AO, or for FIXED the albedo itself; the palette row of the instance gives the colour):
     0 FIXED   1 TOP (camo slots 0-3)   2 BOTTOM (camo slots 4-7)   3 GEAR (slot 8)   4 WEB (slot 9: straps, webbing)
     5 SKIN (10)   6 GLOVE (11)   7 BOOT (12)   8 ACCENT (13: team ID colour, a little emissive)   9 SHELL (14: helmet shell)
     10 MASK (15: balaclava / gaiter)   11 METAL (dark metal hardware)   12 GLASS (lens)   13 RUBBER   14 GEARCAMO (top camo, gear)
     15 HAIR (slot 9 of the skin row? no: fixed dark brown x AO)   16 PLASTIC (dark polymer)
   The camo pattern is computed in the fragment shader from the part's LOCAL position (triplanar), so it moves with the body;
   slot 0 / 4 alpha selects solid (0), organic blobs (~.5) or digital pixels (1). */

const B = () => BABYLON;
const MODELS = new URL('../../assets/models/', import.meta.url).href;

export const ROLE = { FIXED: 0, TOP: 1, BOTTOM: 2, GEAR: 3, WEB: 4, SKIN: 5, GLOVE: 6, BOOT: 7, ACCENT: 8, SHELL: 9, MASK: 10,
  METAL: 11, GLASS: 12, RUBBER: 13, GEARCAMO: 14, HAIR: 15, PLASTIC: 16 };
export const SLOT = { TOP: 0, BOTTOM: 4, GEAR: 8, WEB: 9, SKIN: 10, GLOVE: 11, BOOT: 12, ACCENT: 13, SHELL: 14, MASK: 15 };
export const PAL_ROWS = 64;

// ------------------------------------------------------------------------------------------------ geometry helpers (pure)
/** sign of the triangle winding relative to the normals (+1 / -1) */
export function triSign(g) {
  const p = g.p, n = g.n, ix = g.i; let s = 0;
  for (let k = 0; k < ix.length; k += 3) {
    const a = ix[k] * 3, b = ix[k + 1] * 3, c = ix[k + 2] * 3;
    const e1x = p[b] - p[a], e1y = p[b + 1] - p[a + 1], e1z = p[b + 2] - p[a + 2], e2x = p[c] - p[a], e2y = p[c + 1] - p[a + 1], e2z = p[c + 2] - p[a + 2];
    s += (e1y * e2z - e1z * e2y) * (n[a] + n[b] + n[c]) + (e1z * e2x - e1x * e2z) * (n[a + 1] + n[b + 1] + n[c + 1]) + (e1x * e2y - e1y * e2x) * (n[a + 2] + n[b + 2] + n[c + 2]);
  }
  return Math.sign(s) || 1;
}
export function orient(g, ref) { if (triSign(g) !== ref) for (let k = 0; k < g.i.length; k += 3) { const t = g.i[k + 1]; g.i[k + 1] = g.i[k + 2]; g.i[k + 2] = t; } return g; }
export function mirrorGeo(g, ref) {
  const o = { p: Float32Array.from(g.p), n: Float32Array.from(g.n), c: g.c, i: Uint32Array.from(g.i), uv: g.uv };
  for (let k = 0; k < o.p.length; k += 3) { o.p[k] = -o.p[k]; o.n[k] = -o.n[k]; }
  return orient(o, ref);
}
export function geoBounds(g) {
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity], p = g.p;
  for (let k = 0; k < p.length; k += 3) for (let j = 0; j < 3; j++) { const v = p[k + j]; if (v < mn[j]) mn[j] = v; if (v > mx[j]) mx[j] = v; }
  return { min: mn, max: mx };
}
export function geoFromVD(vd) {
  const nv = vd.positions.length / 3;
  let c = vd.colors;
  if (!c || c.length !== nv * 4) { c = new Float32Array(nv * 4).fill(1); }
  return { p: Float32Array.from(vd.positions), n: Float32Array.from(vd.normals || new Float32Array(nv * 3)), c: Float32Array.from(c), i: Uint32Array.from(vd.indices), uv: vd.uvs ? Float32Array.from(vd.uvs) : null };
}

// ------------------------------------------------------------------------------------------------ kit loading (once per page)
let KD = null, kdP = null;
const ASYM = new Set(['foot', 'arm_u', 'arm_l', 'hand', 'foot_lo', 'arm_u_lo', 'arm_l_lo', 'hand_lo']);
const WANT = new Set(['torso', 'pelvis', 'leg_u', 'leg_l', 'foot', 'arm_u', 'arm_l', 'hand', 'head_lo', 'head_lo2', 'hair_buzz_lo',
  'torso_lo', 'pelvis_lo', 'leg_u_lo', 'leg_l_lo', 'foot_lo', 'arm_u_lo', 'arm_l_lo', 'hand_lo']);

async function loadContainer(scene, file) {
  const BB = B();
  const c = await BB.SceneLoader.LoadAssetContainerAsync(MODELS, file, scene);
  const out = {};
  for (const m of c.meshes) {
    if (!m.getTotalVertices || !m.getTotalVertices()) continue;
    const vd = BB.VertexData.ExtractFromMesh(m, true, true);
    vd.transform(m.computeWorldMatrix(true));        // bakes the glTF root's handedness flip: game axes (+z forward, +y up)
    out[m.name] = geoFromVD(vd);
  }
  c.dispose();
  return out;
}

/** Loads the kit and the two gloves once per page (any scene can be used for the loader; nothing stays in it). */
export function loadKit(scene) {
  if (KD) return Promise.resolve(KD);
  if (kdP) return kdP;
  kdP = (async () => {
    const BB = B();
    const sph = BB.VertexData.CreateSphere({ diameter: 1, segments: 6 });
    const ref = triSign({ p: sph.positions, n: sph.normals, i: sph.indices });
    const [kit, grip, hold] = await Promise.all([loadContainer(scene, 'human_kit.glb'), loadContainer(scene, 'hand_grip.glb'), loadContainer(scene, 'hand_hold.glb')]);
    const out = {};
    for (const [name, g] of Object.entries(kit)) {
      if (!WANT.has(name)) continue;
      orient(g, ref); out[name] = g;
      if (ASYM.has(name)) { const base = name.replace(/_lo$/, ''), lo = name.endsWith('_lo'); out[base + '_L' + (lo ? '_lo' : '')] = mirrorGeo(g, ref); }
    }
    // gloves: only the glove mesh (its 'body' block, cuff and neon accent belong to Neon Veins' viewmodel)
    const glove = (src, key) => {
      const gg = src.glove; if (!gg) return;
      const g = mergeGeo([{ g: orient(gg, ref), role: ROLE.GLOVE }]);
      out[key] = g; out[key + '_L'] = mirrorGeo(g, ref); out[key + '_L'].roles = g.roles;
    };
    glove(grip, 'glove_grip'); glove(hold, 'glove_hold');
    out._ref = ref;
    KD = out; return out;
  })().catch(e => { kdP = null; throw e; });
  return kdP;
}
export function kitLoaded() { return KD; }

/** merge [{ g, role, color? }] into one geo with a roles array */
export function mergeGeo(list) {
  let nv = 0, ni = 0;
  for (const { g } of list) { nv += g.p.length / 3; ni += g.i.length; }
  const p = new Float32Array(nv * 3), n = new Float32Array(nv * 3), c = new Float32Array(nv * 4), i = new Uint32Array(ni), roles = new Float32Array(nv);
  let vo = 0, io = 0;
  for (const { g, role, color } of list) {
    const cnt = g.p.length / 3;
    p.set(g.p, vo * 3); n.set(g.n, vo * 3);
    if (g.c && g.c.length === cnt * 4) c.set(g.c, vo * 4); else c.fill(1, vo * 4, (vo + cnt) * 4);
    if (color) for (let k = 0; k < cnt; k++) { const q = (vo + k) * 4; c[q] *= color[0]; c[q + 1] *= color[1]; c[q + 2] *= color[2]; }
    for (let k = 0; k < g.i.length; k++) i[io + k] = g.i[k] + vo;
    const rr = g.roles; for (let k = 0; k < cnt; k++) roles[vo + k] = rr ? rr[k] : role;
    vo += cnt; io += g.i.length;
  }
  return { p, n, c, i, roles };
}

// ------------------------------------------------------------------------------------------------ textures (per scene)
const SC = new WeakMap();
const sc = scene => { let s = SC.get(scene); if (!s) { s = { mat: null, pal: null, palData: null, camo: null, dirty: false }; SC.set(scene, s); } return s; };

// tileable value noise (pure JS), used for the camo blob fields
function tileNoise(N, cells, seed) {
  const g = new Float32Array(cells * cells); let s = seed >>> 0 || 1;
  for (let k = 0; k < g.length; k++) { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; g[k] = s / 4294967296; }
  const out = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const fx = x / N * cells, fy = y / N * cells, ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const a = g[(iy % cells) * cells + ix % cells], b = g[(iy % cells) * cells + (ix + 1) % cells];
    const c = g[((iy + 1) % cells) * cells + ix % cells], d = g[((iy + 1) % cells) * cells + (ix + 1) % cells];
    out[y * N + x] = a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  }
  return out;
}
function camoTexture(scene) {
  const BB = B(), N = 256, data = new Uint8Array(N * N * 4);
  const fields = [];
  for (let f = 0; f < 4; f++) {
    const a = tileNoise(N, 4 + f, 11 + f * 31), b = tileNoise(N, 9 + f * 2, 57 + f * 13), c = tileNoise(N, 23, 91 + f * 7);
    const o = new Float32Array(N * N);
    for (let k = 0; k < o.length; k++) o[k] = a[k] * 0.62 + b[k] * 0.28 + c[k] * 0.10;
    fields.push(o);
  }
  for (let k = 0; k < N * N; k++) for (let f = 0; f < 4; f++) data[k * 4 + f] = Math.max(0, Math.min(255, Math.round(fields[f][k] * 255)));
  const t = new BB.RawTexture(data, N, N, BB.Engine.TEXTUREFORMAT_RGBA, scene, true, false, BB.Texture.TRILINEAR_SAMPLINGMODE);
  t.wrapU = t.wrapV = BB.Texture.WRAP_ADDRESSMODE; t.name = 'lfCamo';
  return t;
}
function paletteTexture(scene, s) {
  const BB = B();
  s.palData = new Uint8Array(16 * PAL_ROWS * 4).fill(160);
  const t = new BB.RawTexture(s.palData, 16, PAL_ROWS, BB.Engine.TEXTUREFORMAT_RGBA, scene, false, false, BB.Texture.NEAREST_SAMPLINGMODE);
  t.wrapU = t.wrapV = BB.Texture.CLAMP_ADDRESSMODE; t.name = 'lfCharPal';
  return t;
}
/** colours: { slotIndex: [r, g, b, a?] } sRGB 0..1 */
export function setPaletteRow(scene, row, colours) {
  const s = sc(scene); if (!s.pal) charMaterial(scene);
  row = Math.max(0, Math.min(PAL_ROWS - 1, row | 0));
  for (const [k, c] of Object.entries(colours)) {
    const q = (row * 16 + (+k)) * 4;
    s.palData[q] = Math.round(Math.max(0, Math.min(1, c[0])) * 255); s.palData[q + 1] = Math.round(Math.max(0, Math.min(1, c[1])) * 255);
    s.palData[q + 2] = Math.round(Math.max(0, Math.min(1, c[2])) * 255); s.palData[q + 3] = Math.round(Math.max(0, Math.min(1, c[3] == null ? 1 : c[3])) * 255);
  }
  s.pal.update(s.palData);
}

// ------------------------------------------------------------------------------------------------ the material plugin
const VERT_DEFS = `
#ifdef LF_CHAR
attribute float lfRole;
attribute vec4 lfInst;
varying float vLfRole;
varying vec4 vLfInst;
varying vec3 vLfLP;
varying vec3 vLfLN;
#endif
`;
const VERT_END = `
#ifdef LF_CHAR
vLfRole=lfRole;vLfInst=lfInst;vLfLP=position;
#ifdef NORMAL
vLfLN=normal;
#else
vLfLN=vec3(0.,1.,0.);
#endif
#endif
`;
const FRAG_DEFS = `
#ifdef LF_CHAR
varying float vLfRole;
varying vec4 vLfInst;
varying vec3 vLfLP;
varying vec3 vLfLN;
uniform sampler2D lfPalSampler;
uniform sampler2D lfCamoSampler;
float lfMetal=0.;float lfRough=.9;vec3 lfEmis=vec3(0.);vec3 lfRim=vec3(0.);
vec4 lfPal(float slot){return texture2D(lfPalSampler,vec2((slot+.5)/16.,(vLfInst.x+.5)/lfCharP.x));}
vec3 lfLin(vec3 c){return pow(c,vec3(2.2));}
vec4 lfTri(vec3 p,vec3 n,float sc){
  vec3 w=pow(abs(n),vec3(4.));w/=max(w.x+w.y+w.z,1e-4);
  return texture2D(lfCamoSampler,p.zy*sc)*w.x+texture2D(lfCamoSampler,p.xz*sc)*w.y+texture2D(lfCamoSampler,p.xy*sc)*w.z;}
vec3 lfCamo(float s0,vec3 p,vec3 n){
  vec4 b=lfPal(s0);
  float kind=b.a;
  vec3 c=lfLin(b.rgb);
  if(kind<.2)return c;
  vec3 q=p;
  float sc=2.4;
  if(kind>.75){sc=1.6;q=floor(p*92.)/92.;}
  else{q=vec3(p.x,p.y*.62,p.z);}
  vec4 f=lfTri(q+vec3(.37,.11,.53),n,sc);
  float e=kind>.75?.001:.035;
  c=mix(c,lfLin(lfPal(s0+1.).rgb),smoothstep(.5-e,.5+e,f.r));
  c=mix(c,lfLin(lfPal(s0+2.).rgb),smoothstep(.58-e,.58+e,f.g));
  c=mix(c,lfLin(lfPal(s0+3.).rgb),smoothstep(.62-e,.62+e,f.b));
  return c;}
#endif
`;
const FRAG_BEFORE_LIGHTS = `
#ifdef LF_CHAR
{
float r=floor(vLfRole+.5);
vec3 n=normalize(vLfLN);
vec3 lp=vLfLP;
vec3 col=vec3(1.);
float grain=texture2D(lfCamoSampler,lp.xy*11.3+lp.z*7.1).a*.16+.92;
if(r<.5){col=vec3(1.);lfRough=.75;}
else if(r<1.5){col=lfCamo(0.,lp,n)*grain;lfRough=.93;}
else if(r<2.5){col=lfCamo(4.,lp,n)*grain;lfRough=.93;}
else if(r<3.5){col=lfLin(lfPal(8.).rgb)*grain;lfRough=.9;}
else if(r<4.5){col=lfLin(lfPal(9.).rgb)*grain;lfRough=.88;}
else if(r<5.5){col=lfLin(lfPal(10.).rgb);lfRough=.55;}
else if(r<6.5){col=lfLin(lfPal(11.).rgb)*(grain*.5+.5);lfRough=.8;}
else if(r<7.5){col=lfLin(lfPal(12.).rgb);lfRough=.72;}
else if(r<8.5){col=lfLin(lfPal(13.).rgb);lfRough=.6;lfEmis=col*.22;}
else if(r<9.5){col=lfLin(lfPal(14.).rgb);lfRough=.62;}
else if(r<10.5){col=lfLin(lfPal(15.).rgb)*grain;lfRough=.95;}
else if(r<11.5){col=vec3(.045,.047,.05);lfMetal=.85;lfRough=.42;}
else if(r<12.5){col=vec3(.02,.025,.03);lfMetal=.6;lfRough=.06;}
else if(r<13.5){col=vec3(.035,.035,.036);lfRough=.7;}
else if(r<14.5){col=lfCamo(0.,lp*1.07+.21,n)*grain*.94;lfRough=.93;}
else if(r<15.5){col=vec3(.045,.032,.024);lfRough=.8;}
else {col=vec3(.03,.031,.033);lfRough=.55;}
surfaceAlbedo*=col;
if(vLfInst.z>.5){vec3 v=normalize(vEyePosition.xyz-vPositionW);float f=1.-max(dot(normalW,v),0.);lfRim=lfLin(lfPal(13.).rgb)*f*f*f*.55*vLfInst.z;}
}
#endif
`;
const FRAG_ROUGH = `
#ifdef LF_CHAR
metallicRoughness.r=lfMetal;metallicRoughness.g=lfRough;
#endif
`;
const FRAG_BEFORE_FOG = `
#ifdef LF_CHAR
finalColor.rgb+=lfEmis+lfRim;
#endif
`;

let PluginClass = null;
function charPlugin() {
  if (PluginClass) return PluginClass;
  const BB = B();
  PluginClass = class LFCharPlugin extends BB.MaterialPluginBase {
    constructor(material, s) { super(material, 'LFChar', 220, { LF_CHAR: false }, true, true); this._s = s; }
    getClassName() { return 'LFCharPlugin'; }
    isCompatible(lang) { return lang === BB.ShaderLanguage.GLSL; }
    prepareDefines(defines) { defines.LF_CHAR = true; }
    getAttributes(attributes) { attributes.push('lfRole', 'lfInst'); }
    getUniforms() { return { ubo: [{ name: 'lfCharP', size: 4, type: 'vec4' }], fragment: '#ifdef LF_CHAR\nuniform vec4 lfCharP;\n#endif\n' }; }
    getSamplers(samplers) { samplers.push('lfPalSampler', 'lfCamoSampler'); }
    bindForSubMesh(ubo) {
      ubo.updateFloat4('lfCharP', PAL_ROWS, 0, 0, 0);
      ubo.setTexture('lfPalSampler', this._s.pal); ubo.setTexture('lfCamoSampler', this._s.camo);
    }
    getActiveTextures(list) { if (this._s.pal) list.push(this._s.pal); if (this._s.camo) list.push(this._s.camo); }
    hasTexture(t) { return t === this._s.pal || t === this._s.camo; }
    getCustomCode(type) {
      if (type === 'vertex') return { CUSTOM_VERTEX_DEFINITIONS: VERT_DEFS, CUSTOM_VERTEX_MAIN_END: VERT_END };
      return { CUSTOM_FRAGMENT_DEFINITIONS: FRAG_DEFS, CUSTOM_FRAGMENT_BEFORE_LIGHTS: FRAG_BEFORE_LIGHTS,
        CUSTOM_FRAGMENT_UPDATE_METALLICROUGHNESS: FRAG_ROUGH, CUSTOM_FRAGMENT_BEFORE_FOG: FRAG_BEFORE_FOG };
    }
  };
  return PluginClass;
}

export function charMaterial(scene) {
  const s = sc(scene);
  if (s.mat && !s.mat.isDisposed) return s.mat;
  const BB = B();
  if (!s.pal) s.pal = paletteTexture(scene, s);
  if (!s.camo) s.camo = camoTexture(scene);
  const m = new BB.PBRMaterial('lfChar', scene);
  m.albedoColor = BB.Color3.White(); m.metallic = 0; m.roughness = 0.9;
  m.enableSpecularAntiAliasing = true; m.useRadianceOcclusion = true; m.useHorizonOcclusion = true;
  m.maxSimultaneousLights = 6;
  new (charPlugin())(m, s);
  s.mat = m;
  return m;
}

// ------------------------------------------------------------------------------------------------ host meshes + batches
/** A host mesh with its OWN geometry (thin-instance buffers live on the geometry). */
export function makeGeo(scene, name, geo, roles) {
  const BB = B(), m = new BB.Mesh(name, scene), vd = new BB.VertexData();
  vd.positions = geo.p; vd.normals = geo.n; vd.indices = geo.i;
  if (geo.c) vd.colors = geo.c;
  vd.applyToMesh(m, false);
  const nv = geo.p.length / 3;
  let r = roles != null ? roles : geo.roles;
  if (typeof r === 'number' || r == null) { const v = r == null ? 0 : r; r = new Float32Array(nv).fill(v); }
  m.setVerticesData('lfRole', r, false, 1);
  m.hasVertexAlpha = false;
  m.isPickable = false; m.doNotSyncBoundingInfo = true;
  return m;
}

export class Batch {
  constructor(scene, name, geo, roles, cap, opts = {}) {
    this.mesh = makeGeo(scene, name, geo, roles);
    this.mesh.material = charMaterial(scene);
    this.mesh.alwaysSelectAsActiveMesh = true;
    this.mesh.receiveShadows = true;
    this.cap = cap; this.n = 0; this.shadowOnly = !!opts.shadowOnly;
    this.m4 = new Float32Array(cap * 16); this.inst = new Float32Array(cap * 4);
    this.mesh.thinInstanceSetBuffer('matrix', this.m4, 16, false);
    this.mesh.thinInstanceSetBuffer('lfInst', this.inst, 4, false);
    this.mesh.thinInstanceCount = 0; this.mesh.isVisible = false;
    if (this.shadowOnly) this.mesh.layerMask = 0x10000000;   // not drawn by the camera (layerMask 0x0FFFFFFF), still in the shadow map
    this.tris = geo.i.length / 3;
  }
  reset() { this.n = 0; }
  /** m: 16 floats (row-major Babylon matrix) */
  push(m, row, friendly) {
    if (this.n >= this.cap) this.grow();
    const o = this.n * 16, M = this.m4;
    for (let k = 0; k < 16; k++) M[o + k] = m[k];
    const q = this.n * 4; this.inst[q] = row; this.inst[q + 1] = 0; this.inst[q + 2] = friendly ? 1 : 0; this.inst[q + 3] = 0;
    this.n++;
  }
  grow() {
    const cap = this.cap * 2, m4 = new Float32Array(cap * 16), inst = new Float32Array(cap * 4);
    m4.set(this.m4); inst.set(this.inst); this.m4 = m4; this.inst = inst; this.cap = cap;
    this.mesh.thinInstanceSetBuffer('matrix', this.m4, 16, false);
    this.mesh.thinInstanceSetBuffer('lfInst', this.inst, 4, false);
  }
  flush() {
    const m = this.mesh;
    m.thinInstanceCount = this.n; m.isVisible = this.n > 0;
    if (this.n) { m.thinInstanceBufferUpdated('matrix'); m.thinInstanceBufferUpdated('lfInst'); }
  }
  dispose() { this.mesh.dispose(false, false); }
}
