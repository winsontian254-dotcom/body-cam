/* LIVE FIRE — environment: HDRI image-based lighting, sky, sun + shadows, fog, weather particles, lightning.
   Exports:
     HDRIS                         { name: { kind: 'sun'|'soft'|'night'|'interior', note } }  (assets/hdri/<name>.env + _sky.jpg)
     applyEnvironment(scene, env, opts) -> Promise<Env>
       env  = MapDef.env: { hdri, sky: 'hdri'|'night'|'overcast'|'none', exposure (multiplier, default 1), rotation (rad, HDRI yaw),
              sun: { dir: [x,y,z] (light direction, pointing DOWN), color: [r,g,b], intensity (multiplier of the matched sun) },
              ambient: [r,g,b] (extra hemispheric fill), fog: { color: [r,g,b] (linear, 0..1 like the sky), density (EXP2) },
              weather: 'clear'|'rain'|'snow'|'fog'|'dust', time: 'day'|'dusk'|'night'|'indoor'|'overcast',
              wind: [x, z] (m/s), puddles: 0..1, lightning: bool, skyHdri (sky image from another HDRI, e.g. indoor maps),
              indoorIbl: share of the sky light under roofs (default .3), groundAlbedo (bounce, default .2), iblLevel, skyLevel }
       opts = { quality: tier, camera?, world? (phys World: roofs keep rain out and surfaces dry; groundAt(x, z, yFrom)),
                groundAt?: (x, z, yFrom) => y|null (instead of world), groundY = 0 (flat fallback), particles = true }
     Env = { sun (DirectionalLight), shadow (CascadedShadowGenerator | ShadowGenerator | null: the game calls
             shadow.addShadowCaster(mesh) for MapInfo.casters and players), sky (Mesh), hdri, time, weather,
             exposure (base exposure postfx starts from), fogColor, onLightning (BABYLON.Observable<{ strength, delay }>),
             setWeather(kind, intensity?), setRotation(rad), addShadowCasters(meshes), setWorld(world | groundAt), dispose() }
   Sun, IBL and sky come from the same measured HDRI (tools/bake-env.mjs paints the sun disc out of the IBL and records its
   direction / colour / strength in assets/hdri/hdri.json): the DirectionalLight puts it back with real shadows. Levels are
   normalised per time of day so every HDRI lands at a sensible exposure; env.exposure fine-tunes it.
   Shadows: CascadedShadowGenerator (PCF, stabilised cascades) on medium+, one camera-following texel-snapped map on low.
   Weather particles are GPU-animated quads around the camera (no per-particle CPU work). With opts.world, a sky-occlusion
   height map (0.5 m cells, 80 m around the camera, updated incrementally) stops rain under roofs, places splashes on the
   surface they hit, keeps roofed surfaces dry and dims the sky light (IBL) under roofs (materials.js setSkyOcclusion;
   env.indoorIbl = the share kept, default .3). */
import { QUALITY, currentTier } from './quality.js';
import { setWetness, setSkyOcclusion } from './materials.js';

const HDRI_BASE = new URL('../../assets/hdri/', import.meta.url).href;
export const HDRIS = {
  clear: { kind: 'sun', ratio: 3.6, note: 'clear day, sun 43 deg' },
  partly_cloudy: { kind: 'sun', ratio: 3, note: 'day, cumulus, sun 48 deg' },
  noon: { kind: 'sun', ratio: 3.8, note: 'clear noon, high sun' },
  golden: { kind: 'sun', ratio: 2.8, note: 'golden hour, low warm sun' },
  dusk: { kind: 'soft', ratio: .6, note: 'sunset behind clouds' },
  overcast: { kind: 'soft', ratio: .35, note: 'bright overcast' },
  storm: { kind: 'soft', ratio: .25, note: 'dark rain overcast' },
  fog: { kind: 'soft', ratio: .3, note: 'misty morning' },
  snow: { kind: 'soft', ratio: .3, note: 'snowy overcast' },
  night: { kind: 'night', ratio: .3, note: 'clear night, stars' },
  night_city: { kind: 'night', ratio: .25, note: 'urban night, sodium lights' },
  warehouse: { kind: 'interior', ratio: 0, note: 'industrial interior' },
};
const TIME_HDRI = { day: 'partly_cloudy', dusk: 'golden', night: 'night_city', overcast: 'overcast', indoor: 'warehouse' };
const WEATHER_HDRI = { rain: 'storm', snow: 'snow', fog: 'fog', dust: 'noon' };
// normalised irradiance on an up-facing surface (sky + sun) per time of day: what "exposure 1" is calibrated against
const TARGET = { day: 1.5, dusk: 1.05, overcast: 1.15, night: .09, indoor: .35 };
// scene radiance scale, for whoever places lights: a white wall in daylight ~1.5, in shade ~.3; ambient at night ~.1 (a street
// lamp pool should reach ~1-2, B.light intensities follow from that); exposure turns these into a camera image
const ACES_BIAS = 2.3;
const FOG_DENSITY = { clear: .0022, rain: .0095, snow: .011, fog: .03, dust: .014 };
const lum = c => .2126 * c[0] + .7152 * c[1] + .0722 * c[2];

let metaPromise = null;
const loadMeta = () => metaPromise || (metaPromise = fetch(HDRI_BASE + 'hdri.json').then(r => r.ok ? r.json() : {}).catch(() => ({})));
const FALLBACK_META = { sun: { dir: [.55, .7, .45], color: [1, .95, .88], illum: 1.5 }, upIrr: [1.5, 1.55, 1.65], sky: [1.2, 1.3, 1.45],
  horizon: [.6, .65, .72], ground: [.25, .25, .25], dominant: [.5, .8, .3], skyScale: 2 };

// ------------------------------------------------------------------------------------------------------------------
// shaders
const SKY_VS = `precision highp float;
attribute vec3 position; uniform mat4 world; uniform mat4 viewProjection; varying vec3 vDir;
void main(){ vDir = position; gl_Position = viewProjection * (world * vec4(position, 1.0)); }`;
const SKY_FS = `precision highp float;
varying vec3 vDir;
uniform sampler2D skyTex;
uniform vec4 skyP;   // level, unused, unused, mode (0 panorama, 1 night procedural, 2 flat)
uniform mat4 rotM;   // = the environment texture's reflection matrix (RotationY), so sky, IBL and sun agree
uniform vec4 sunP;   // direction to the sun (world), cos(angular radius)
uniform vec3 sunC;   // disc radiance
uniform vec3 fogC;
uniform vec4 fogP;   // haze at the horizon, falloff, below-horizon blend width, lightning flash
uniform vec4 nightP; // stars, glow, glow falloff, time
uniform vec3 glowC;
uniform vec4 ipP;    // apply tonemap in shader (no pipeline), exposure
const float PI = 3.14159265;
vec3 s2l(vec3 c){ return mix(c / 12.92, pow((c + .055) / 1.055, vec3(2.4)), step(.04045, c)); }
float h31(vec3 p){ p = fract(p * .1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
vec3 stars(vec3 d){
  vec3 p = d * 220.0; vec3 id = floor(p); vec3 f = fract(p) - .5;
  float h = h31(id); float on = step(.965, h);
  vec3 o = vec3(h31(id + 7.1), h31(id + 3.7), h31(id + 9.3)) - .5;
  float s = smoothstep(.16, .0, length(f - o * .6));
  float b = pow(h31(id + 1.3), 6.0) * 3.0 + .15;
  float tw = .75 + .25 * sin(nightP.w * (2.0 + h * 5.0) + h * 40.0);
  vec3 tint = mix(vec3(.75, .85, 1.0), vec3(1.0, .85, .7), h31(id + 5.5));
  return tint * on * s * b * tw;
}
void main(){
  vec3 d = normalize(vDir);
  vec3 r = normalize((rotM * vec4(d, 0.0)).xyz);
  vec3 c;
  if (skyP.w < .5) {
    float th = atan(r.z, r.x); float ph = acos(clamp(r.y, -1.0, 1.0));
    vec2 uv = vec2(th / (2.0 * PI) + .5, 1.0 - ph / PI);
    vec2 uv2 = vec2(fract(uv.x + .5), uv.y);
    vec2 dx = dFdx(uv), dy = dFdy(uv), dx2 = dFdx(uv2), dy2 = dFdy(uv2);
    if (dot(dx2, dx2) + dot(dy2, dy2) < dot(dx, dx) + dot(dy, dy)) { dx = dx2; dy = dy2; }
    c = s2l(textureGrad(skyTex, uv, dx, dy).rgb) * skyP.x;
  } else if (skyP.w < 1.5) {
    float h = max(d.y, 0.0);
    vec3 zen = vec3(.0016, .0024, .0048) * skyP.x;
    c = zen + glowC * nightP.y * exp(-h * nightP.z) + glowC * nightP.y * .12 * exp(-h * 2.0);
    c += stars(r) * nightP.x * smoothstep(.02, .3, h) * skyP.x * (1.0 - clamp(nightP.y * exp(-h * nightP.z) * 3.0, 0.0, .85));
  } else {
    c = fogC;
  }
  float cs = dot(d, sunP.xyz);
  c += sunC * (smoothstep(sunP.w - .000015, sunP.w + .000015, cs) + .0035 * pow(max(cs, 0.0), 900.0) + .0004 * pow(max(cs, 0.0), 40.0));
  float h = d.y;
  float haze = clamp(fogP.x * exp(-max(h, 0.0) * fogP.y), 0.0, 1.0);
  haze = max(haze, smoothstep(0.0, -fogP.z, h));
  c = mix(c, fogC, haze);
  c += fogP.w * vec3(.75, .8, 1.0) * (.6 + .4 * max(h, 0.0));
  if (ipP.x > .5) { c *= ipP.y; c = clamp((c * (2.51 * c + .03)) / (c * (2.43 * c + .59) + .14), 0.0, 1.0); c = pow(c, vec3(1.0 / 2.2)); }
  gl_FragColor = vec4(c, 1.0);
}`;

// Weather particles: one quad per drop / flake / mote / splash, everything animated here.
const WX_VS = `precision highp float;
attribute vec3 position;   // seeds 0..1
attribute vec2 uv;         // corner: x -1..1 across, y 0..1 along (splash: -1..1)
attribute vec2 uv2;        // seed w, size seed
uniform mat4 viewProjection;
uniform vec3 camPos; uniform vec3 camRight; uniform vec3 camUp;
uniform vec4 vol;    // half extent R, height H, speed, time
uniform vec4 wxP;    // wind x, streak length, wind z, width
uniform vec4 occP;   // occlusion origin x, z, 1/cell, size (0 = off)
uniform vec4 misc;   // ground y, pixel angle, intensity (0..1 of the quads drawn), sun-scatter
uniform vec3 sunDir;
uniform sampler2D occTex;
varying vec2 vC; varying float vA; varying float vPh;
float topAt(vec2 xz, out float known){
  known = 0.0;
  if (occP.w > 0.0) {
    vec2 dd = abs(xz - occP.xy) * occP.z;
    if (max(dd.x, dd.y) < occP.w * .5 - 1.0) { known = 1.0; return texture2D(occTex, (mod(floor(xz * occP.z), occP.w) + .5) / occP.w).r; }
    return -1.0e4;
  }
  known = 1.0; return misc.x;
}
vec2 wrap(vec2 p, float R2){ return camPos.xz + mod(p - camPos.xz + R2 * .5, R2) - R2 * .5; }
void main(){
  float R2 = vol.x * 2.0, H = vol.y, t = vol.w;
  vA = step(uv2.x, misc.z);   // intensity: only a share of the quads is alive
  vC = uv; vPh = 0.0;
  vec3 p;
#if defined(SPLASH)
  float cyc = t / (vol.z * (.8 + .4 * position.z)) + position.z * 7.0;
  float c = floor(cyc); vPh = fract(cyc);
  vec2 h = fract(sin(vec2(dot(position.xy + c * .173, vec2(12.9898, 78.233)), dot(position.xy + c * .311, vec2(39.346, 11.135)))) * 43758.5453);
  vec2 xz = wrap(h * R2, R2);
  float known; float top = topAt(xz, known);
  vA *= known * step(-1.0e3, top) * (1.0 - smoothstep(vol.x * .6, vol.x, length(xz - camPos.xz)));
  float size = wxP.w * (.6 + .8 * uv2.y);
  p = vec3(xz.x, top + .005, xz.y) + camRight * uv.x * size + vec3(0.0, (uv.y * .5 + .5) * size * 1.1, 0.0);
#else
  float speed = vol.z * (.8 + .4 * uv2.y);
  float fy = fract(position.y - t * speed / H);
  float fall = (1.0 - fy) * H / speed;              // seconds since this drop entered the volume
  vec2 xz0 = position.xz * R2 + wxP.xz * fall;
#if defined(SNOW) || defined(MOTES)
  xz0 += vec2(sin(t * .7 + position.x * 40.0), cos(t * .6 + position.z * 40.0)) * .35;
#endif
  vec2 xz = wrap(xz0, R2);
  float y = camPos.y - H * .35 + fy * H;
#if defined(MOTES)
  y = camPos.y - 1.2 + fract(position.y + sin(t * .05 + position.x * 9.0) * .2) * 3.5;
#endif
  vec3 head = vec3(xz.x, y, xz.y);
  float known; float top = topAt(xz, known);
  vA *= step(top, y);
  float dist = length(camPos - head);
  vA *= smoothstep(.35, 1.4, dist) * (1.0 - smoothstep(vol.x * .7, vol.x, length(xz - camPos.xz)));
#if defined(RAIN)
  vec3 dir = normalize(vec3(wxP.x, -speed, wxP.z));
  vec3 side = normalize(cross(dir, normalize(camPos - head)));
  float w = max(wxP.w, dist * misc.y * 1.2);
  vA *= min(1.0, wxP.w / w * 2.0);
  p = head + side * uv.x * w - dir * uv.y * wxP.y * (.7 + .6 * uv2.y);
#else
  float size = wxP.w * (.6 + .8 * uv2.y);
  float w = max(size, dist * misc.y * 1.5);
  vA *= min(1.0, size / w * 1.5);
#if defined(MOTES)
  vA *= .25 + misc.w * pow(max(dot(normalize(head - camPos), sunDir), 0.0), 6.0);
#endif
  p = head + camRight * uv.x * w + camUp * (uv.y * 2.0 - 1.0) * w;
#endif
#endif
  gl_Position = viewProjection * vec4(p, 1.0);
}`;
const WX_FS = `precision highp float;
varying vec2 vC; varying float vA; varying float vPh;
uniform vec4 colP;
void main(){
  float a;
#if defined(RAIN)
  a = (1.0 - vC.x * vC.x) * smoothstep(0.0, .2, vC.y) * smoothstep(1.0, .5, vC.y);
#elif defined(SPLASH)
  vec2 q = vec2(vC.x, vC.y * .5 + .5);
  float ring = 1.0 - smoothstep(0.0, .18, abs(length(vec2(q.x, (q.y - .08) * 3.0)) - vPh * .95));
  float crown = smoothstep(.5, 0.0, abs(q.x) - vPh * .7) * smoothstep(.15 + vPh * .8, 0.0, q.y) * step(abs(q.x), vPh * .9) * step(vPh * .5, abs(q.x));
  float drops = smoothstep(.12, 0.0, length(q - vec2(.35 * vPh, .25 + .6 * vPh - vPh * vPh * .9))) + smoothstep(.12, 0.0, length(q - vec2(-.3 * vPh, .2 + .5 * vPh - vPh * vPh * .8)));
  a = max(max(ring * .25, crown), drops) * pow(1.0 - vPh, 1.5);
#else
  float r = length(vec2(vC.x, vC.y * 2.0 - 1.0));
  a = smoothstep(1.0, .2, r);
#endif
  a *= vA * colP.a;
  if (a < .003) discard;
  gl_FragColor = vec4(colP.rgb, a);
}`;

function registerShaders() {
  const S = BABYLON.Effect.ShadersStore;
  if (S.lfSkyVertexShader) return;
  S.lfSkyVertexShader = SKY_VS; S.lfSkyFragmentShader = SKY_FS;
  S.lfWxVertexShader = WX_VS; S.lfWxFragmentShader = WX_FS;
}

// ------------------------------------------------------------------------------------------------------------------
// Sky occlusion height map: top surface height per 0.5 m cell, 160 x 160 cells (80 m) around the camera, toroidal.
class SkyOcclusion {
  constructor(scene, groundAt, { size = 160, cell = .5 } = {}) {
    this.size = size; this.cell = cell; this.inv = 1 / cell; this.groundAt = groundAt;
    this.data = new Float32Array(size * size).fill(-1e4);
    this.kx = new Int32Array(size * size).fill(0x7fffffff); this.kz = new Int32Array(size * size).fill(0x7fffffff);
    this.tex = new BABYLON.RawTexture(this.data, size, size, BABYLON.Constants.TEXTUREFORMAT_R, scene, false, false,
      BABYLON.Constants.TEXTURE_NEAREST_SAMPLINGMODE, BABYLON.Constants.TEXTURETYPE_FLOAT);
    this.tex.wrapU = this.tex.wrapV = BABYLON.Constants.TEXTURE_CLAMP_ADDRESSMODE; this.tex.name = 'lf_skyOcc';
    this.cx = 1e9; this.cz = 1e9; this.dirty = false; this.todo = true; this.yRef = 0;
    this.params = { tex: this.tex, x: 0, z: 0, invCell: this.inv, size };
  }
  update(cam, budget = 2500) {
    const cx = Math.floor(cam.x * this.inv), cz = Math.floor(cam.z * this.inv), N = this.size, h = N >> 1;
    if (cx !== this.cx || cz !== this.cz || Math.abs(cam.y - this.yRef) > 6) {
      if (Math.abs(cam.y - this.yRef) > 6) { this.kx.fill(0x7fffffff); this.yRef = cam.y; }
      this.cx = cx; this.cz = cz; this.todo = true;
    }
    this.params.x = (cx + .5) * this.cell; this.params.z = (cz + .5) * this.cell;
    if (!this.todo) return;
    let n = 0, done = true;
    const yFrom = this.yRef + 40;
    for (let j = -h; j < h && n < budget; j++) {
      const wz = cz + j, tz = ((wz % N) + N) % N;
      for (let i = -h; i < h; i++) {
        const wx = cx + i, tx = ((wx % N) + N) % N, k = tz * N + tx;
        if (this.kx[k] === wx && this.kz[k] === wz) continue;
        if (n >= budget) { done = false; break; }
        const y = this.groundAt((wx + .5) * this.cell, (wz + .5) * this.cell, yFrom);
        this.data[k] = y == null || !isFinite(y) ? -1e4 : y; this.kx[k] = wx; this.kz[k] = wz; n++; this.dirty = true;
      }
    }
    if (n >= budget) done = false;
    this.todo = !done;
    if (this.dirty) { this.tex.update(this.data); this.dirty = false; }
  }
  dispose() { this.tex.dispose(); }
}

// ------------------------------------------------------------------------------------------------------------------
function quadMesh(scene, name, count, seedFn) {
  const pos = new Float32Array(count * 12), uv = new Float32Array(count * 8), uv2 = new Float32Array(count * 8), idx = new Uint32Array(count * 6);
  const C = [[-1, 0], [1, 0], [1, 1], [-1, 1]];
  for (let q = 0; q < count; q++) {
    const s = seedFn(q);
    for (let v = 0; v < 4; v++) {
      const o = q * 4 + v;
      pos[o * 3] = s[0]; pos[o * 3 + 1] = s[1]; pos[o * 3 + 2] = s[2];
      uv[o * 2] = C[v][0]; uv[o * 2 + 1] = C[v][1]; uv2[o * 2] = s[3]; uv2[o * 2 + 1] = s[4];
    }
    idx.set([q * 4, q * 4 + 1, q * 4 + 2, q * 4, q * 4 + 2, q * 4 + 3], q * 6);
  }
  const m = new BABYLON.Mesh(name, scene);
  const vd = new BABYLON.VertexData(); vd.positions = pos; vd.uvs = uv; vd.uvs2 = uv2; vd.indices = idx; vd.applyToMesh(m, false);
  m.alwaysSelectAsActiveMesh = true; m.isPickable = false; m.doNotSyncBoundingInfo = true; m.applyFog = true;
  m.metadata = { lfFx: true };
  return m;
}
function rnd(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

function dummyOcc(scene) {
  const t = new BABYLON.RawTexture(new Float32Array([-1e4]), 1, 1, BABYLON.Constants.TEXTUREFORMAT_R, scene, false, false,
    BABYLON.Constants.TEXTURE_NEAREST_SAMPLINGMODE, BABYLON.Constants.TEXTURETYPE_FLOAT);
  t.name = 'lf_noOcc'; return t;
}
function wxMaterial(scene, kind, occ) {
  registerShaders();
  const m = new BABYLON.ShaderMaterial('lf_wx_' + kind, scene, { vertex: 'lfWx', fragment: 'lfWx' }, {
    attributes: ['position', 'uv', 'uv2'], uniforms: ['viewProjection', 'camPos', 'camRight', 'camUp', 'vol', 'wxP', 'occP', 'misc', 'sunDir', 'colP'],
    samplers: ['occTex'], defines: [kind.toUpperCase()], needAlphaBlending: true });
  m.backFaceCulling = false; m.disableDepthWrite = true; m.alphaMode = BABYLON.Constants.ALPHA_COMBINE;
  m.setTexture('occTex', occ ? occ.tex : (scene._lfNoOcc || (scene._lfNoOcc = dummyOcc(scene))));
  return m;
}

// ------------------------------------------------------------------------------------------------------------------
export async function applyEnvironment(scene, env = {}, opts = {}) {
  const BB = BABYLON;
  const tier = opts.quality && QUALITY[opts.quality] ? opts.quality : currentTier(scene);
  const Q = QUALITY[tier];
  const weather = env.weather || 'clear';
  const time = env.time || 'day';
  const metaAll = await loadMeta();
  let hdri = env.hdri && HDRIS[env.hdri] ? env.hdri : null;
  if (env.hdri && !HDRIS[env.hdri]) console.warn('[env] unknown hdri "' + env.hdri + '", using the default for ' + time);
  if (!hdri) hdri = (time === 'day' || time === 'overcast') && WEATHER_HDRI[weather] ? WEATHER_HDRI[weather] : TIME_HDRI[time] || 'partly_cloudy';
  const H = HDRIS[hdri], meta = metaAll[hdri] || FALLBACK_META;
  const kind = time === 'indoor' ? 'interior' : H.kind;
  const disposers = [];
  const camera = () => opts.camera || scene.activeCamera;

  // ---- sun direction (world, TOWARD the sun) and HDRI rotation -------------------------------------------------------
  // The environment is looked up with lookup = R * worldDir (R = RotationY(rot), Babylon's reflection matrix), so a direction
  // measured in the HDRI maps to world as R^T * dir. With env.sun.dir and no env.rotation, the sky turns so its sun (or its
  // brightest region) sits at the map's sun azimuth.
  const hdriSun = meta.sun ? meta.sun.dir : (meta.dominant || [.4, .8, .3]);
  const toWorld = (v, a) => { const m = BB.Matrix.RotationY(a).transpose(); return BB.Vector3.TransformNormal(new BB.Vector3(v[0], v[1], v[2]), m).asArray(); };
  const az = v => Math.atan2(v[0], v[2]);
  let rot = +env.rotation || 0;
  let sunTo;
  if (env.sun && env.sun.dir) {
    const d = env.sun.dir, l = Math.hypot(d[0], d[1], d[2]) || 1;
    sunTo = [-d[0] / l, -d[1] / l, -d[2] / l];
    if (env.rotation === undefined && Math.hypot(hdriSun[0], hdriSun[2]) > .05) {
      const want = az(sunTo), base = az(hdriSun);
      rot = want - base;   // pick the sign Babylon's convention needs (checked, not assumed)
      if (Math.abs(Math.sin(az(toWorld(hdriSun, rot)) - want)) > .01) rot = base - want;
    }
  } else {
    sunTo = toWorld(hdriSun, rot);
    if (!meta.sun) { const e = Math.max(sunTo[1], kind === 'night' ? .55 : .62); const q = Math.sqrt(Math.max(0, 1 - e * e)) / (Math.hypot(sunTo[0], sunTo[2]) || 1); sunTo = [sunTo[0] * q, e, sunTo[2] * q]; }
  }
  if (sunTo[1] < .03) { sunTo[1] = .03; const l = Math.hypot(...sunTo); sunTo = sunTo.map(v => v / l); }
  const rotM = BB.Matrix.RotationY(rot);

  // ---- levels: normalise the HDRI so an up-facing surface gets TARGET[time] ------------------------------------------
  const upL = lum(meta.upIrr || [1, 1, 1]);
  let sunIllum = meta.sun ? meta.sun.illum : 0;
  if (H.ratio > 0) sunIllum = Math.max(sunIllum, H.ratio * upL * (meta.sun ? 1 : 1));   // HDRI suns are under-recorded
  if (kind === 'interior') sunIllum = 0;
  const sunUp = sunIllum * Math.max(0, sunTo[1]);
  // night / interior HDRIs carry their street lamps / ceiling lights on the horizon: walls facing them would be lit as if
  // by day, so normalise against the brighter of the up-facing and the horizon irradiance there (map lights are the key)
  const ref = kind === 'night' || kind === 'interior' ? Math.max(upL, lum(meta.horizon || [1, 1, 1]) * .6) : upL + sunUp;
  // the light level follows what the HDRI is (a night HDRI on a map that says time: 'day' still lights like night)
  const tkey = kind === 'night' ? 'night' : kind === 'interior' ? 'indoor' : hdri === 'golden' || hdri === 'dusk' ? 'dusk' : kind === 'soft' ? 'overcast' : 'day';
  const k = TARGET[tkey] / Math.max(.05, ref);
  const iblLevel = k * (env.iblLevel || 1);
  const sunColor = (env.sun && env.sun.color) || (meta.sun ? meta.sun.color : kind === 'night' ? [.62, .72, 1] : [1, .97, .93]);
  const sunIntensity = sunIllum * k * (env.sun && env.sun.intensity !== undefined ? env.sun.intensity : 1);

  // ---- IBL -------------------------------------------------------------------------------------------------------------
  const envTex = BB.CubeTexture.CreateFromPrefilteredData(HDRI_BASE + hdri + '.env', scene);
  envTex.name = 'lf_env_' + hdri;
  envTex.rotationY = rot;
  scene.environmentTexture = envTex;
  scene.environmentIntensity = iblLevel;
  disposers.push(() => { if (scene.environmentTexture === envTex) scene.environmentTexture = null; envTex.dispose(); });
  await new Promise(res => { if (envTex.isReady()) res(); else { envTex.onLoadObservable.addOnce(() => res()); setTimeout(res, 15000); } });

  // ---- sun -------------------------------------------------------------------------------------------------------------
  const sun = new BB.DirectionalLight('sun', new BB.Vector3(-sunTo[0], -sunTo[1], -sunTo[2]), scene);
  sun.diffuse = new BB.Color3(...sunColor); sun.specular = sun.diffuse.clone();
  sun.intensity = sunIntensity;
  sun.position = new BB.Vector3(sunTo[0] * 150, sunTo[1] * 150, sunTo[2] * 150);
  if (sunIntensity <= 0) sun.setEnabled(false);
  disposers.push(() => sun.dispose());

  // ---- shadows ---------------------------------------------------------------------------------------------------------
  let shadow = null, follow = null;
  if (Q.shadow > 0 && sunIntensity > 0 && (kind !== 'interior' || (env.sun && env.sun.dir))) {
    const filt = [BB.ShadowGenerator.QUALITY_LOW, BB.ShadowGenerator.QUALITY_MEDIUM, BB.ShadowGenerator.QUALITY_HIGH][Q.pcf];
    if (Q.cascades >= 2 && BB.CascadedShadowGenerator) {
      const csm = new BB.CascadedShadowGenerator(Q.shadow, sun);
      csm.numCascades = Q.cascades; csm.shadowMaxZ = Q.shadowDist; csm.lambda = .82;
      csm.stabilizeCascades = true; csm.cascadeBlendPercentage = .07; csm.depthClamp = true;
      csm.usePercentageCloserFiltering = true; csm.filteringQuality = filt;
      // acne-free on flat ground at a grazing sun: bias grows with the world size of a shadow texel
      const texel = Q.shadowDist / Q.cascades / Q.shadow;
      csm.bias = .004 + texel * .12; csm.normalBias = .015 + texel * 1.4;
      csm.darkness = kind === 'sun' ? 0 : .25;
      csm.freezeShadowCastersBoundingInfo = false;
      shadow = csm;
    } else {
      const sg = new BB.ShadowGenerator(Q.shadow, sun);
      sg.usePercentageCloserFiltering = true; sg.filteringQuality = filt; sg.bias = .004; sg.normalBias = .04;
      sg.darkness = kind === 'sun' ? 0 : .25;
      sun.autoUpdateExtends = false; sun.autoCalcShadowZBounds = false;
      const span = Q.shadowDist * 1.2; sun.shadowFrustumSize = span; sun.shadowMinZ = 1; sun.shadowMaxZ = 600;
      // follow the camera, snapped to whole shadow-map texels so edges do not crawl
      const L = new BB.Vector3(-sunTo[0], -sunTo[1], -sunTo[2]);
      const right = BB.Vector3.Cross(Math.abs(L.y) > .99 ? BB.Axis.Z : BB.Axis.Y, L).normalize(), up = BB.Vector3.Cross(L, right).normalize();
      const texel = span / Q.shadow, tmp = new BB.Vector3();
      follow = () => {
        const c = camera(); if (!c) return;
        const p = c.globalPosition || c.position, f = c.getForwardRay ? c.getDirection(BB.Axis.Z) : BB.Vector3.Zero();
        tmp.set(p.x + f.x * span * .3, p.y, p.z + f.z * span * .3);
        const a = Math.round(BB.Vector3.Dot(tmp, right) / texel) * texel, b = Math.round(BB.Vector3.Dot(tmp, up) / texel) * texel, d = BB.Vector3.Dot(tmp, L);
        sun.position.set(right.x * a + up.x * b + L.x * (d - 300), right.y * a + up.y * b + L.y * (d - 300), right.z * a + up.z * b + L.z * (d - 300));
      };
      shadow = sg;
    }
    disposers.push(() => shadow.dispose());
  }

  // ---- fill lights -------------------------------------------------------------------------------------------------------
  if (env.ambient) {
    const hemi = new BB.HemisphericLight('ambient', new BB.Vector3(0, 1, 0), scene);
    hemi.diffuse = new BB.Color3(...env.ambient); hemi.groundColor = hemi.diffuse.scale(.45); hemi.specular = BB.Color3.Black(); hemi.intensity = k;
    disposers.push(() => hemi.dispose());
  }
  if (kind === 'sun' || kind === 'soft') {   // ground bounce: sunlit ground lights shaded walls from below (no GI otherwise)
    const ga = env.groundAlbedo !== undefined ? env.groundAlbedo : weather === 'snow' ? .6 : .2;
    const e = (upL + sunUp) * k * ga;
    const bounce = new BB.HemisphericLight('bounce', new BB.Vector3(0, 1, 0), scene);
    bounce.diffuse = new BB.Color3(0, 0, 0); bounce.specular = BB.Color3.Black();
    bounce.groundColor = new BB.Color3(e * (.75 + .25 * sunColor[0]), e * (.75 + .25 * sunColor[1]), e * (.75 + .25 * sunColor[2]) * .92);
    bounce.intensity = 1;
    disposers.push(() => bounce.dispose());
  }
  if (kind === 'interior') {   // interior bounce: warm light coming back up from the floor, a little from the ceiling
    const g = meta.ground || [.3, .28, .25];
    const bounce = new BB.HemisphericLight('bounce', new BB.Vector3(0, -1, 0), scene);
    bounce.diffuse = new BB.Color3(g[0] * 1.2 + .05, g[1] * 1.15 + .05, g[2] + .04); bounce.groundColor = new BB.Color3(.05, .05, .055);
    bounce.specular = BB.Color3.Black(); bounce.intensity = .18 * k;
    disposers.push(() => bounce.dispose());
  }

  // ---- fog -----------------------------------------------------------------------------------------------------------------
  const horizon = meta.horizon || [.6, .65, .7];
  // fog: the horizon by day; at night / indoors a dim haze lit by the ambient (the horizon there is full of street lights)
  const skyAvg = meta.sky || [1, 1, 1], skyL = Math.max(.01, lum(skyAvg));
  let fogColor = env.fog && env.fog.color ? env.fog.color.slice() :
    (kind === 'night' || kind === 'interior' ? skyAvg.map(v => v / skyL * upL * k * .55) :
      weather === 'dust' || weather === 'fog' ? skyAvg.map(v => v / skyL * (upL + sunUp * .5) * k * .7) : horizon.map(v => v * k * .9))
      .map((v, i) => v * (weather === 'dust' ? [1.3, 1.0, .68][i] : 1));
  const fogDensity = env.fog && env.fog.density !== undefined ? env.fog.density : (FOG_DENSITY[weather] || FOG_DENSITY.clear) * (kind === 'interior' ? .5 : 1);
  scene.fogMode = fogDensity > 0 ? BB.Scene.FOGMODE_EXP2 : BB.Scene.FOGMODE_NONE;
  scene.fogDensity = fogDensity; scene.fogColor = new BB.Color3(...fogColor);
  scene.clearColor = new BB.Color4(fogColor[0], fogColor[1], fogColor[2], 1);
  disposers.push(() => { scene.fogMode = BB.Scene.FOGMODE_NONE; });

  // ---- exposure (postfx reads scene.metadata.lfEnv.exposure as its base) --------------------------------------------------
  // ACES (Hill fit) maps scene middle grey 0.18 to ~0.1: a ~2x pre-exposure puts it where a camera would (and body cams
  // expose for the shadows: the sky and sunlit concrete roll off in the shoulder)
  const exposure = ACES_BIAS * (env.exposure || 1) * (kind === 'night' ? 1.7 : kind === 'interior' ? 1.15 : 1);   // night: camera gain
  scene.metadata = Object.assign(scene.metadata || {}, { lfEnv: { exposure, hdri, time, weather, kind, fogColor, sunTo, k } });
  const ipc = scene.imageProcessingConfiguration;
  if (!ipc.applyByPostProcess) {   // no pipeline yet: let the materials tonemap themselves
    ipc.isEnabled = true; ipc.toneMappingEnabled = true; ipc.toneMappingType = BB.ImageProcessingConfiguration.TONEMAPPING_ACES;
  }
  ipc.exposure = exposure;

  // ---- sky -------------------------------------------------------------------------------------------------------------------
  registerShaders();
  let skyMode = env.sky || (kind === 'night' ? 'night' : 'hdri');
  if (time === 'night' && env.sky === undefined) skyMode = 'night';
  let skyName = env.skyHdri && HDRIS[env.skyHdri] ? env.skyHdri : hdri;
  if (kind === 'interior' && !env.skyHdri) skyName = 'overcast';
  const skyMeta = metaAll[skyName] || meta;
  let skyMesh = null, skyMat = null, skyTex = null;
  if (skyMode !== 'none') {
    skyMat = new BB.ShaderMaterial('lf_sky', scene, { vertex: 'lfSky', fragment: 'lfSky' }, {
      attributes: ['position'], uniforms: ['world', 'viewProjection', 'rotM', 'skyP', 'sunP', 'sunC', 'fogC', 'fogP', 'nightP', 'glowC', 'ipP'], samplers: ['skyTex'] });
    skyMat.backFaceCulling = false; skyMat.disableDepthWrite = true;
    if (skyMode !== 'night') {
      skyTex = new BB.Texture(HDRI_BASE + skyName + '_sky.jpg', scene, false, true, BB.Texture.TRILINEAR_SAMPLINGMODE);
      skyTex.wrapU = BB.Texture.WRAP_ADDRESSMODE; skyTex.wrapV = BB.Texture.CLAMP_ADDRESSMODE; skyTex.anisotropicFilteringLevel = 4;
      skyMat.setTexture('skyTex', skyTex);
    } else {
      skyTex = new BB.RawTexture(new Uint8Array([0, 0, 0, 255]), 1, 1, BB.Constants.TEXTUREFORMAT_RGBA, scene, false);
      skyMat.setTexture('skyTex', skyTex);
    }
    const maxZ = Math.min(camera() ? camera().maxZ || 1000 : 1000, 5000);
    skyMesh = BB.MeshBuilder.CreateBox('lf_sky', { size: maxZ, sideOrientation: BB.Mesh.BACKSIDE }, scene);
    skyMesh.infiniteDistance = true; skyMesh.isPickable = false; skyMesh.applyFog = false; skyMesh.material = skyMat;
    skyMesh.metadata = { lfSky: true }; skyMesh.receiveShadows = false;
    disposers.push(() => { skyMesh.dispose(); skyMat.dispose(); skyTex && skyTex.dispose(); });
  }
  const skyLevel = k * (skyMeta.skyScale || 1) * (env.skyLevel || 1) * (skyName !== hdri ? (lum(meta.upIrr || [1, 1, 1]) / Math.max(.05, lum(skyMeta.upIrr || [1, 1, 1]))) : 1);
  const sunDisc = kind === 'sun' && skyMode === 'hdri' ? Math.min(60, sunIntensity * 18) : 0;
  const glow = kind === 'night' ? (hdri === 'night_city' ? [1, .55, .28] : [.55, .5, .55]) : [0, 0, 0];
  const glowAmt = skyMode === 'night' ? (hdri === 'night_city' ? .03 : .008) * (env.glow || 1) : 0;
  const haze = Math.min(1, fogDensity * (weather === 'fog' ? 60 : 90));
  const lightning = { flash: 0, next: 8 + Math.random() * 20, on: env.lightning !== undefined ? !!env.lightning : (weather === 'rain' && (hdri === 'storm' || kind === 'night')) };
  const onLightning = new BB.Observable();
  const ipP = new BB.Vector4(0, 1, 0, 0);
  if (skyMat) {
    skyMat.onBindObservable.add(() => {
      const e = skyMat.getEffect(); if (!e) return;
      e.setFloat4('skyP', skyLevel, 0, 0, skyMode === 'night' ? 1 : skyMode === 'flat' ? 2 : 0);
      e.setMatrix('rotM', rotM);
      e.setFloat4('sunP', sunTo[0], sunTo[1], sunTo[2], Math.cos(.0047 * (env.sunSize || 1)));
      e.setFloat3('sunC', sunColor[0] * sunDisc, sunColor[1] * sunDisc, sunColor[2] * sunDisc);
      e.setFloat3('fogC', fogColor[0], fogColor[1], fogColor[2]);
      e.setFloat4('fogP', haze, weather === 'dust' || weather === 'fog' ? 2.2 : weather === 'snow' || weather === 'rain' ? 4.5 : 9, .06, lightning.flash * k * 2.5);
      e.setFloat4('nightP', kind === 'night' ? .8 : 0, glowAmt * k * 40, hdri === 'night_city' ? 7 : 10, performance.now() / 1000);
      e.setFloat3('glowC', glow[0], glow[1], glow[2]);
      ipP.x = scene.imageProcessingConfiguration.applyByPostProcess ? 0 : 1; ipP.y = scene.imageProcessingConfiguration.exposure;
      e.setVector4('ipP', ipP);
    });
  }

  // ---- wetness + sky occlusion ------------------------------------------------------------------------------------------------
  // the sky-occlusion map (needs the collision world): rain stops at roofs, roofed surfaces stay dry and get only a share of
  // the sky light (interiors are not lit by the open sky: the IBL knows nothing about walls)
  let occ = null;
  const wantWet = weather === 'rain' || (env.puddles || 0) > 0;
  const occFrom = w => typeof w === 'function' ? w : w && w.groundAt ? (() => { const out = {}; return (x, z, y) => { const g = w.groundAt(x, z, y, 0, out); return g ? g.y : null; }; })() : null;
  function setWorld(w) {
    const ga = occFrom(w);
    if (occ) { setSkyOcclusion(scene, null); occ.dispose(); occ = null; }
    if (!ga) return;
    occ = new SkyOcclusion(scene, ga);
    occ.params.indoor = env.indoorIbl !== undefined ? env.indoorIbl : kind === 'interior' ? 1 : kind === 'night' ? .5 : .3;
    setSkyOcclusion(scene, occ.params);
    for (const e of wx) e.mat.setTexture('occTex', occ.tex);
  }
  disposers.push(() => { if (occ) { setSkyOcclusion(scene, null); occ.dispose(); occ = null; } });
  if (wantWet) {
    setWetness(scene, weather === 'rain' ? 1 : .6, { puddles: env.puddles !== undefined ? env.puddles : weather === 'rain' ? .55 : .3, rain: weather === 'rain' ? 1 : 0 });
    disposers.push(() => setWetness(scene, 0, { rain: 0 }));
  }

  // ---- weather particles -------------------------------------------------------------------------------------------------------
  const wx = [];
  const wind = env.wind || (weather === 'dust' ? [3.2, 1.1] : weather === 'snow' ? [.8, .3] : [.9, .4]);
  const pm = Q.particles * (opts.particles === false ? 0 : 1);
  const skyRad = (skyMeta.sky || [1, 1, 1]).map(v => v * k);
  const addFx = (type, count, cfg) => {
    if (count < 1) return;
    const r = rnd(type.length * 7919 + count);
    const mesh = quadMesh(scene, 'lf_' + type, count, () => [r(), r(), r(), r(), r()]);
    const mat = wxMaterial(scene, type, occ);   // occ may arrive later (setWorld): the bind reads it every frame
    if (cfg.add) mat.alphaMode = BB.Constants.ALPHA_ADD;
    mesh.material = mat;
    const e = { type, mesh, mat, cfg, intensity: 1 };
    mat.onBindObservable.add(() => {
      const ef = mat.getEffect(); const c = camera(); if (!ef || !c) return;
      const p = c.globalPosition || c.position, vm = c.getViewMatrix();
      ef.setFloat3('camPos', p.x, p.y, p.z);
      ef.setFloat3('camRight', vm.m[0], vm.m[4], vm.m[8]); ef.setFloat3('camUp', vm.m[1], vm.m[5], vm.m[9]);
      ef.setFloat4('vol', cfg.R, cfg.H, cfg.speed, performance.now() / 1000);
      ef.setFloat4('wxP', wind[0] * (cfg.windK || 1), cfg.len || 0, wind[1] * (cfg.windK || 1), cfg.width);
      if (occ) { ef.setFloat4('occP', occ.params.x, occ.params.z, occ.params.invCell, occ.params.size); ef.setTexture('occTex', occ.tex); }
      else ef.setFloat4('occP', 0, 0, 1, 0);
      const fov = c.fov || .9, hgt = scene.getEngine().getRenderHeight() || 720;
      ef.setFloat4('misc', opts.groundY || 0, 2 * Math.tan(fov / 2) / hgt, e.intensity, cfg.scatter || 0);
      ef.setFloat3('sunDir', sunTo[0], sunTo[1], sunTo[2]);
      const lf = 1 + lightning.flash * 6;
      ef.setFloat4('colP', cfg.col[0] * lf, cfg.col[1] * lf, cfg.col[2] * lf, cfg.alpha);
    });
    disposers.push(() => { if (!mesh.isDisposed()) { mesh.dispose(); mat.dispose(); } });
    wx.push(e);
  };
  const lit = (m, floor) => skyRad.map(v => Math.max(floor, v * m));
  function buildWeather(kindW) {
    if (kindW === 'rain') {
      addFx('rain', Math.round(6000 * pm), { R: 13, H: 11, speed: 9.5, len: .5, width: .0035, col: lit(.85, .012), alpha: .3, windK: 1 });
      addFx('splash', Math.round(600 * pm), { R: 11, H: 1, speed: .42, width: .055, col: lit(1.2, .015), alpha: .45, add: true });
    } else if (kindW === 'snow') {
      addFx('snow', Math.round(8000 * pm), { R: 11, H: 8, speed: 1.1, width: .016, col: lit(1.25, .02), alpha: .85, windK: 1 });
    } else if (kindW === 'dust') {
      addFx('motes', Math.round(700 * pm), { R: 9, H: 6, speed: .25, width: .006, col: lit(1.2, .1).map((v, i) => v * [1.1, .95, .75][i]), alpha: .35, windK: .6, scatter: 3 });
    }
    if ((kindW === 'clear' && (kind === 'interior' || time === 'indoor')) || kindW === 'fog') {
      addFx('motes', Math.round(260 * pm), { R: 7, H: 5, speed: .1, width: .004, col: lit(1, .06), alpha: .25, windK: .15, scatter: 4 });
    }
  }
  buildWeather(weather);
  setWorld(opts.world || opts.groundAt || null);

  // ---- per frame ------------------------------------------------------------------------------------------------------------
  let last = performance.now();
  const tick = scene.onBeforeRenderObservable.add(() => {
    const now = performance.now(), dt = Math.min(.1, (now - last) / 1000); last = now;
    const c = camera();
    if (occ && c) occ.update(c.globalPosition || c.position);
    if (follow) follow();
    if (lightning.on) {
      lightning.next -= dt;
      if (lightning.next <= 0) {
        lightning.next = 12 + Math.random() * 28; lightning.strikes = 1 + (Math.random() * 3 | 0); lightning.t = 0;
        onLightning.notifyObservers({ strength: .5 + Math.random() * .5, delay: 1 + Math.random() * 5 });
      }
      if (lightning.strikes > 0) {
        lightning.t += dt;
        const ph = lightning.t * 9;
        lightning.flash = Math.max(0, Math.sin(ph * Math.PI)) * (ph < lightning.strikes ? 1 : 0) * (1 - lightning.t * .8);
        if (ph >= lightning.strikes) { lightning.strikes = 0; lightning.flash = 0; }
      }
      scene.environmentIntensity = iblLevel * (1 + lightning.flash * 3);
    }
  });
  disposers.push(() => scene.onBeforeRenderObservable.remove(tick));

  const api = {
    sun, shadow, sky: skyMesh, hdri, time, weather, exposure, fogColor, onLightning, kind,
    addShadowCasters(meshes) { if (shadow) for (const m of meshes || []) shadow.addShadowCaster(m, false); },
    setWorld,   // (World | (x, z, yFrom) => y | null) when the collision world exists only after the environment
    setRotation(r) {   // turns the HDRI, the sky and the sun together
      rot = r; envTex.rotationY = r; BB.Matrix.RotationYToRef(r, rotM);
      const t = toWorld(hdriSun, r); sunTo[0] = t[0]; sunTo[2] = t[2];
      const hl = Math.hypot(sunTo[0], sunTo[2]) || 1, want = Math.sqrt(Math.max(0, 1 - sunTo[1] * sunTo[1]));
      sunTo[0] *= want / hl; sunTo[2] *= want / hl;
      sun.direction.set(-sunTo[0], -sunTo[1], -sunTo[2]);
    },
    setWeather(kindW, intensity = 1) {
      for (const e of wx.splice(0)) { e.mesh.dispose(); e.mat.dispose(); }
      if (kindW && kindW !== 'clear') buildWeather(kindW);
      for (const e of wx) e.intensity = Math.max(0, Math.min(1, intensity));
      if (kindW === 'rain') setWetness(scene, intensity, { rain: intensity });
      else setWetness(scene, 0, { rain: 0 });
    },
    stats() { return { hdri, kind, sunIntensity, iblLevel, k, fogDensity, particles: wx.map(e => e.type + ':' + (e.mesh.getTotalVertices() / 4)), shadow: shadow ? shadow.getClassName() : null }; },
    dispose() { for (const d of disposers.reverse()) { try { d(); } catch (e) { console.warn('[env] dispose', e); } } disposers.length = 0; onLightning.clear(); },
  };
  return api;
}
