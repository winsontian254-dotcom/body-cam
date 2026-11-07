/* LIVE FIRE — rendering pipeline and the body-cam lens.
   Exports:
     LENS_MODES = ['full', 'subtle', 'off']
     createPipeline(scene, camera, { quality, lens = 'full', motionBlur = false }) -> Fx
     Fx = {
       setLens(mode)          'full' | 'subtle' | 'off' (competitive: no distortion / noise / auto gain; flash + damage stay)
       setFlash(k)            0..1+ blindness: white-out, then the frozen frame of the flash moment fading out (after-image);
                              call every frame with the decaying value (a rise of > .25 captures a new after-image)
       setDamage(k)           0..1 red edge pulse + desaturation (call with a decaying value)
       setADS(k)              0..1 aiming: vignette tightens, distortion and roll eased
       setScope(on)           full-screen scope overlay active (scope.js draws it): lens distortion / vignette off
       setExposure(mul)       user brightness multiplier on top of the environment's exposure
       setMotionBlur(on), setQuality(tier), setCamera(camera)       structural changes rebuild the chain
       pipeline               BABYLON.DefaultRenderingPipeline, ssao (SSAO2RenderingPipeline | null), lens (PostProcess)
       info() -> { mode, tier, ssao, bloom, motionBlur, gain }
       dispose()
     }
   Chain (in order): SSAO2 (medium+, HDR in / HDR out) -> motion blur (optional, object based, so the viewmodel that moves with
   the camera stays sharp) -> DefaultRenderingPipeline (HDR: bloom, ACES tonemap + exposure from env.js, sharpen, FXAA) ->
   LF lens (LDR): barrel distortion with edge stretch, lateral chromatic aberration growing to the edges, vignette,
   luminance-dependent sensor noise, highlight halation, compression blockiness, rolling-shutter skew from the camera's yaw
   speed, a GPU auto-exposure "gain" (log-average luminance adapted over time, no read-back), damage and flash overlays.
   The viewmodel (renderingGroupId 1) needs nothing special: every pass works on the composited frame. */
import { QUALITY, currentTier } from './quality.js';

export const LENS_MODES = ['full', 'subtle', 'off'];
const MODES = {
  //          distortion, CA,    vignette, noise, halation, blocks, skew, auto-gain, grade
  full:   { k: .2,  ca: .0055, vig: .5,  noise: .05,  hal: .45, block: .3,  skew: 1,  ae: .65, sat: -14, contrast: 1.06 },
  subtle: { k: .08, ca: .0022, vig: .3,  noise: .022, hal: .2,  block: .08, skew: .35, ae: .45, sat: -6, contrast: 1.04 },
  off:    { k: 0,   ca: 0,     vig: 0,   noise: 0,    hal: 0,   block: 0,   skew: 0,  ae: 0,   sat: 0,  contrast: 1.0 },
};

const LENS_FS = `precision highp float;
varying vec2 vUV;
uniform sampler2D textureSampler;
uniform sampler2D captureSampler;
uniform sampler2D adaptSampler;
uniform vec4 lensA;   // distortion k, CA, vignette, noise
uniform vec4 lensB;   // halation, blockiness, rolling-shutter shift (fraction of width, top to bottom), time
uniform vec4 fxA;     // white-out, after-image, damage, ADS
uniform vec4 fxB;     // scope, gain min, gain max, auto-gain strength
uniform vec4 screen;  // width, height, 1/width, 1/height
float luma(vec3 c){ return dot(c, vec3(.2126, .7152, .0722)); }
float hash(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 warp(vec2 p, float s, float aspect){ return p * s / vec2(aspect, 1.0) + .5; }
void main(){
  float aspect = screen.x * screen.w;
  vec2 uv = vUV;
  float scope = fxB.x;
  // rolling shutter: lower rows were read out later, so they see the scene shifted by the turn
  uv.x += lensB.z * (.5 - uv.y) * (1.0 - scope);
  vec2 p = (uv - .5) * vec2(aspect, 1.0);
  float rn = dot(p, p) / (.25 * (aspect * aspect + 1.0));          // 0 centre .. 1 corners
  float k = lensA.x * (1.0 - scope) * (1.0 - .35 * fxA.w);
  float s = (1.0 + k * rn) / (1.0 + k);                            // barrel: corners map to corners, centre magnified
  float ca = lensA.y * rn * (1.0 - scope);
  vec2 uvR = warp(p, s * (1.0 + ca), aspect), uvG = warp(p, s, aspect), uvB = warp(p, s * (1.0 - ca), aspect);
  vec3 col = vec3(texture2D(textureSampler, uvR).r, texture2D(textureSampler, uvG).g, texture2D(textureSampler, uvB).b);
#ifndef LOWQ
  // halation: small bright highlights bleed a warm red glow into their darker surroundings (not into big bright areas)
  if (lensB.x > 0.0) {
    float h = 0.0; vec2 px = vec2(screen.z, screen.w) * 7.0; float c0 = max(luma(col), .7);
    for (int i = 0; i < 8; i++) {
      float a = float(i) * .7854 + .39;
      vec3 t = texture2D(textureSampler, uvG + vec2(cos(a), sin(a)) * px * (1.0 + float(i - (i / 2) * 2))).rgb;
      h += max(luma(t) - c0, 0.0);
    }
    col += vec3(1.0, .32, .16) * h * .45 * lensB.x;
  }
#endif
  // auto exposure "gain": slow adapted log-average luminance (GPU, see adaptation passes)
  float L = exp(texture2D(adaptSampler, vec2(.5)).r);
  float gain = clamp(.36 / max(L, .001), fxB.y, fxB.z);
  gain = mix(1.0, gain, fxB.w);
  col *= gain;
#ifndef LOWQ
  // compression: 8x8 blocks carry their chroma, dark areas posterise a little
  if (lensB.y > 0.0) {
    vec2 blk = (floor(gl_FragCoord.xy / 8.0) * 8.0 + 4.0) * screen.zw;
    vec3 cb = texture2D(textureSampler, warp((blk - .5) * vec2(aspect, 1.0), s, aspect)).rgb * gain;
    float Y = luma(col), Yb = luma(cb);
    col = Y + mix(col - Y, cb - Yb, lensB.y * .8);
    float q = mix(Y, floor(Y * 40.0 + .5) / 40.0, lensB.y * .6 * (1.0 - smoothstep(.05, .35, Y)));
    col *= q / max(Y, 1e-4);
  }
#endif
  // damage: desaturate + red edges
  float Yd = luma(col);
  col = mix(col, vec3(Yd), fxA.z * .6);
  col = mix(col, vec3(.55, .03, .02) * (.4 + Yd), fxA.z * smoothstep(.15, 1.0, rn) * .85);
  // flash: frozen after-image of the flash moment, then white
  vec3 after = texture2D(captureSampler, vUV).rgb;
  col = mix(col, min(after * 1.5 + .18, vec3(1.0)), fxA.y);
  col = mix(col, vec3(1.0), fxA.x);
  // vignette (tighter when aiming)
  float vr = mix(1.15, .82, fxA.w);
  float v = smoothstep(vr, .18, sqrt(rn) * (1.0 + fxA.w * .25));
  col *= mix(1.0, v, lensA.z * (1.0 - scope));
  // sensor noise: stronger in the dark and with more gain
  float n = hash(gl_FragCoord.xy + fract(lensB.w * 13.37) * 571.0) - .5;
  float nc = hash(gl_FragCoord.yx * 1.31 + fract(lensB.w * 7.1) * 311.0) - .5;
  float amp = lensA.w * (.3 + 1.4 * pow(1.0 - clamp(luma(col), 0.0, 1.0), 2.0)) * sqrt(gain) * (1.0 - fxA.x);
  col += vec3(n) * amp + vec3(nc, -nc * .5, nc * .3) * amp * .35;
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;
// log-luminance downsample: each output texel averages 4x4 taps of its region of the input
const LUM_FS = `precision highp float;
varying vec2 vUV; uniform sampler2D src; uniform vec2 cells;
void main(){
  vec2 c = floor(vUV * cells); float s = 0.0;
  for (int y = 0; y < 4; y++) for (int x = 0; x < 4; x++) {
    vec2 uv = (c + (vec2(float(x), float(y)) + .5) / 4.0) / cells;
    uv = .15 + uv * .7;   // centre-weighted metering: ignore the outer 15 percent
    vec3 t = texture2D(src, uv).rgb; s += log(max(dot(t, vec3(.2126, .7152, .0722)), .001));
  }
  gl_FragColor = vec4(s / 16.0, 0.0, 0.0, 1.0);
}`;
const ADAPT_FS = `precision highp float;
varying vec2 vUV; uniform sampler2D small; uniform sampler2D prev; uniform vec4 ad;   // rate up, rate down, first, unused
void main(){
  float s = 0.0;
  for (int y = 0; y < 16; y++) for (int x = 0; x < 16; x++) s += texture2D(small, (vec2(float(x), float(y)) + .5) / 16.0).r;
  float cur = s / 256.0, old = texture2D(prev, vec2(.5)).r;
  float r = cur > old ? ad.y : ad.x;   // darker scene -> exposure opens slowly, brighter -> closes faster
  gl_FragColor = vec4(ad.z > .5 ? cur : mix(old, cur, r), 0.0, 0.0, 1.0);
}`;
const COPY_FS = `precision highp float; varying vec2 vUV; uniform sampler2D src; void main(){ gl_FragColor = vec4(texture2D(src, vUV).rgb, 1.0); }`;

function registerShaders() {
  const S = BABYLON.Effect.ShadersStore;
  if (!S.lfLensFragmentShader) S.lfLensFragmentShader = LENS_FS;
}

export function createPipeline(scene, camera, opts = {}) {
  const BB = BABYLON, engine = scene.getEngine();
  registerShaders();
  const st = {
    camera, tier: opts.quality && QUALITY[opts.quality] ? opts.quality : currentTier(scene), mode: MODES[opts.lens] ? opts.lens : 'full',
    motionBlur: !!opts.motionBlur, flash: 0, flashPrev: 0, after: 0, damage: 0, ads: 0, scope: 0, expMul: 1,
    yaw: null, pitch: 0, yawVel: 0, lastT: performance.now(), capture: false, firstAdapt: true, adaptIdx: 0, frame: 0,
  };
  let pipeline = null, ssao = null, mblur = null, lens = null;
  let er = null, wLum = null, wAdapt = null, wCopy = null, rtLum = null, rtAdapt = [null, null], rtCap = null, thinCap = null, thinAdapt = [null, null];
  const observers = [];

  function makeTargets() {
    er = new BB.EffectRenderer(engine);
    wLum = new BB.EffectWrapper({ engine, name: 'lfLum', fragmentShader: LUM_FS, uniformNames: ['cells'], samplerNames: ['src'] });
    wAdapt = new BB.EffectWrapper({ engine, name: 'lfAdapt', fragmentShader: ADAPT_FS, uniformNames: ['ad'], samplerNames: ['small', 'prev'] });
    wCopy = new BB.EffectWrapper({ engine, name: 'lfCopy', fragmentShader: COPY_FS, samplerNames: ['src'] });
    // persistent uniform setters (nothing allocated per frame)
    wCopy.onApplyObservable.add(() => wCopy.effect.setTexture('src', st.src));
    wLum.onApplyObservable.add(() => { wLum.effect.setTexture('src', st.src); wLum.effect.setFloat2('cells', 16, 16); });
    wAdapt.onApplyObservable.add(() => {
      const dt = 2 / 60;
      wAdapt.effect.setTexture('small', st.lumThin); wAdapt.effect.setTexture('prev', thinAdapt[st.adaptIdx]);
      wAdapt.effect.setFloat4('ad', 1 - Math.exp(-dt * .9), 1 - Math.exp(-dt * 2.2), st.firstAdapt ? 1 : 0, 0);
    });
    const half = BB.Constants.TEXTURETYPE_HALF_FLOAT, near = BB.Constants.TEXTURE_NEAREST_SAMPLINGMODE;
    const opt = { generateMipMaps: false, generateDepthBuffer: false, generateStencilBuffer: false, type: half, samplingMode: near };
    rtLum = engine.createRenderTargetTexture({ width: 16, height: 16 }, opt);
    rtAdapt = [engine.createRenderTargetTexture({ width: 1, height: 1 }, opt), engine.createRenderTargetTexture({ width: 1, height: 1 }, opt)];
    thinAdapt = rtAdapt.map(r => new BB.ThinTexture(r.texture));
    makeCapture();
  }
  function makeCapture() {
    const w = Math.max(16, engine.getRenderWidth() >> 1), h = Math.max(16, engine.getRenderHeight() >> 1);
    if (rtCap && rtCap.width === w && rtCap.height === h) return;
    if (rtCap) { rtCap.dispose(); }
    rtCap = engine.createRenderTargetTexture({ width: w, height: h }, { generateMipMaps: false, generateDepthBuffer: false, generateStencilBuffer: false,
      type: BB.Constants.TEXTURETYPE_UNSIGNED_BYTE, samplingMode: BB.Constants.TEXTURE_BILINEAR_SAMPLINGMODE });
    thinCap = new BB.ThinTexture(rtCap.texture);
    // start black so a flash with nothing captured is still clean
    engine.bindFramebuffer(rtCap); engine.clear(new BB.Color4(0, 0, 0, 1), true, false, false); engine.unBindFramebuffer(rtCap);
  }

  function build() {
    const Q = QUALITY[st.tier], cam = st.camera;
    const half = BB.Constants.TEXTURETYPE_HALF_FLOAT;
    if (Q.ssao && BB.SSAO2RenderingPipeline && BB.SSAO2RenderingPipeline.IsSupported) {
      ssao = new BB.SSAO2RenderingPipeline('lfSSAO', scene, { ssaoRatio: Q.ssaoRatio, blurRatio: Q.ssaoRatio < 1 ? .5 : 1 }, [cam], false, half);
      ssao.radius = 1.1; ssao.totalStrength = 1.15; ssao.base = .08; ssao.samples = Q.ssaoSamples; ssao.maxZ = 120; ssao.minZAspect = .3;
      ssao.expensiveBlur = st.tier !== 'medium'; ssao.bilateralSamples = st.tier === 'ultra' ? 16 : 12; ssao.bilateralSoften = .5; ssao.bilateralTolerance = .25;
      ssao.epsilon = .02;
    }
    if (st.motionBlur && Q.motionBlur && BB.MotionBlurPostProcess) {
      mblur = new BB.MotionBlurPostProcess('lfMotionBlur', scene, 1, cam, BB.Texture.BILINEAR_SAMPLINGMODE, engine, false, half);
      mblur.motionStrength = .35; mblur.motionBlurSamples = st.tier === 'ultra' ? 24 : 12; mblur.isObjectBased = true;
    }
    pipeline = new BB.DefaultRenderingPipeline('lfPipeline', true, scene, [cam]);
    pipeline.samples = 1;
    pipeline.imageProcessingEnabled = true;
    const ip = pipeline.imageProcessing;
    ip.toneMappingEnabled = true; ip.toneMappingType = BB.ImageProcessingConfiguration.TONEMAPPING_ACES;
    ip.vignetteEnabled = false;
    pipeline.bloomEnabled = Q.bloom; pipeline.bloomThreshold = .95; pipeline.bloomWeight = .22; pipeline.bloomKernel = 64; pipeline.bloomScale = Q.bloomScale;
    pipeline.fxaaEnabled = Q.fxaa;
    pipeline.sharpenEnabled = Q.sharpen > 0; if (pipeline.sharpenEnabled) { pipeline.sharpen.edgeAmount = Q.sharpen; pipeline.sharpen.colorAmount = 1; }
    pipeline.grainEnabled = false; pipeline.chromaticAberrationEnabled = false; pipeline.depthOfFieldEnabled = false;
    grade();
    const defines = Q.lens ? '' : '#define LOWQ\n';
    lens = new BB.PostProcess('lfLens', 'lfLens', ['lensA', 'lensB', 'fxA', 'fxB', 'screen'], ['captureSampler', 'adaptSampler'], 1, cam,
      BB.Texture.BILINEAR_SAMPLINGMODE, engine, false, defines);
    lens.onApply = applyLens;
  }
  function grade() {
    const m = MODES[st.mode], ip = pipeline.imageProcessing;
    ip.contrast = m.contrast;
    ip.colorCurvesEnabled = st.mode !== 'off';
    if (ip.colorCurvesEnabled) {
      const cc = ip.colorCurves || new BB.ColorCurves();
      cc.globalSaturation = m.sat; cc.shadowsHue = 210; cc.shadowsDensity = st.mode === 'full' ? 18 : 8; cc.shadowsSaturation = 20;
      cc.highlightsHue = 40; cc.highlightsDensity = st.mode === 'full' ? 10 : 4; cc.highlightsSaturation = 10;
      ip.colorCurves = cc;
    }
  }
  const lensA = new BB.Vector4(), lensB = new BB.Vector4(), fxA = new BB.Vector4(), fxB = new BB.Vector4(), scr = new BB.Vector4();
  function applyLens(effect) {
    const m = MODES[st.mode];
    const w = lens.width || engine.getRenderWidth(), h = lens.height || engine.getRenderHeight();
    lensA.set(m.k, m.ca, m.vig, m.noise);
    // rolling shutter: a readout of ~1/45 s, expressed as a fraction of the horizontal field of view
    const hfov = 2 * Math.atan(Math.tan((st.camera.fov || .9) / 2) * (w / h));
    const shift = Math.max(-.04, Math.min(.04, st.yawVel * (1 / 45) / hfov)) * m.skew * (1 - .6 * st.ads);
    lensB.set(m.hal, m.block, shift, performance.now() / 1000);
    const white = Math.min(1, Math.max(0, (st.flash - .55) / .45));
    fxA.set(white, Math.min(1, st.after) * (1 - white), Math.min(1, st.damage), st.ads);
    fxB.set(st.scope, .78, 1.65, m.ae * (st.firstAdapt ? 0 : 1));
    scr.set(w, h, 1 / w, 1 / h);
    effect.setVector4('lensA', lensA); effect.setVector4('lensB', lensB); effect.setVector4('fxA', fxA); effect.setVector4('fxB', fxB);
    effect.setVector4('screen', scr);
    effect.setTexture('captureSampler', thinCap);
    effect.setTexture('adaptSampler', thinAdapt[st.adaptIdx]);
  }

  // per frame: camera yaw speed, exposure base, flash decay bookkeeping
  observers.push([scene.onBeforeRenderObservable, scene.onBeforeRenderObservable.add(() => {
    const now = performance.now(), dt = Math.max(1e-3, Math.min(.1, (now - st.lastT) / 1000)); st.lastT = now;
    const cam = st.camera; if (!cam) return;
    const f = cam.getDirection(BB.Axis.Z), yaw = Math.atan2(f.x, f.z);
    if (st.yaw !== null) { let d = yaw - st.yaw; d -= Math.round(d / (2 * Math.PI)) * 2 * Math.PI; st.yawVel += (d / dt - st.yawVel) * Math.min(1, dt * 20); }
    st.yaw = yaw;
    const base = (scene.metadata && scene.metadata.lfEnv && scene.metadata.lfEnv.exposure) || 1;
    if (pipeline) pipeline.imageProcessing.exposure = base * st.expMul;
    // the after-image decays on its own once the white-out is over
    if (st.flash < .55) st.after = Math.max(0, st.after - dt * .45);
  })]);
  // after the frame: capture for the flash after-image, update the GPU auto exposure
  observers.push([scene.onAfterRenderObservable, scene.onAfterRenderObservable.add(() => {
    if (!lens || !er) return;
    const input = lens.inputTexture; if (!input || !input.texture) return;
    if (!st.src || st.src._lfIt !== input.texture) { st.src = new BB.ThinTexture(input.texture); st.src._lfIt = input.texture; }   // no per-frame allocation
    if (!st.lumThin || st.lumThin._lfIt !== rtLum.texture) { st.lumThin = new BB.ThinTexture(rtLum.texture); st.lumThin._lfIt = rtLum.texture; }
    if (st.capture && wCopy.effect.isReady()) {
      st.capture = false; makeCapture();
      er.render(wCopy, rtCap);
    }
    st.frame++;
    if (MODES[st.mode].ae > 0 && (st.frame & 1) === 0 && wLum.effect.isReady() && wAdapt.effect.isReady()) {
      er.render(wLum, rtLum);
      const next = 1 - st.adaptIdx;
      er.render(wAdapt, rtAdapt[next]);   // reads thinAdapt[st.adaptIdx] (the previous value)
      st.adaptIdx = next; st.firstAdapt = false;
    }
    engine.restoreDefaultFramebuffer();
  })]);

  function teardown() {
    if (lens) { lens.dispose(st.camera); lens = null; }
    if (pipeline) { pipeline.dispose(); pipeline = null; }
    if (mblur) { mblur.dispose(st.camera); mblur = null; }
    if (ssao) { ssao.dispose(true); ssao = null; }
  }
  makeTargets();
  build();

  const api = {
    get pipeline() { return pipeline; }, get ssao() { return ssao; }, get lens() { return lens; },
    setLens(mode) { if (!MODES[mode]) return; st.mode = mode; grade(); },
    setFlash(k) {
      k = Math.max(0, +k || 0);
      if (k - st.flashPrev > .25 || (k > .5 && st.flashPrev === 0)) { st.capture = true; st.after = 1; }
      st.flashPrev = k; st.flash = k;
      if (k >= .55) st.after = 1;
    },
    setDamage(k) { st.damage = Math.max(0, Math.min(1, +k || 0)); },
    setADS(k) { st.ads = Math.max(0, Math.min(1, +k || 0)); },
    setScope(on) { st.scope = on ? 1 : 0; },
    setExposure(mul) { st.expMul = Math.max(.25, Math.min(4, +mul || 1)); },
    setMotionBlur(on) { if (!!on === st.motionBlur) return; st.motionBlur = !!on; teardown(); build(); },
    setQuality(tier) { if (!QUALITY[tier] || tier === st.tier) return; st.tier = tier; teardown(); build(); },
    setCamera(cam) { if (!cam || cam === st.camera) return; teardown(); st.camera = cam; st.yaw = null; build(); },
    info() { return { mode: st.mode, tier: st.tier, ssao: !!ssao, bloom: !!(pipeline && pipeline.bloomEnabled), motionBlur: !!mblur, flash: st.flash, after: st.after }; },
    dispose() {
      for (const [o, h] of observers) o.remove(h); observers.length = 0;
      teardown();
      for (const w of [wLum, wAdapt, wCopy]) w && w.dispose();
      er && er.dispose(); er = null;
      for (const r of [rtLum, rtAdapt[0], rtAdapt[1], rtCap]) r && r.dispose();
    },
  };
  return api;
}
