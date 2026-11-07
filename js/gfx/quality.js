/* LIVE FIRE — graphics quality presets.
   Exports:
     QUALITY = { low, medium, high, ultra }    preset objects (fields below); read-only
     TIERS = ['low', 'medium', 'high', 'ultra']
     detectTier(engine?) -> 'low'|'medium'|'high'|'ultra'   from the GPU renderer string, device memory, cores, mobile, screen
     resolveTier(setting, engine?) -> tier       'auto' -> detectTier, otherwise the setting itself (unknown -> 'medium')
     applyQuality(engine, scene, tier)           render scale (preset x the user's renderScale, through js/core/engine.js
                                                 setRenderScale, applied at the next frame start), scene flags, remembers the tier
     currentTier(scene?) -> tier
     autoResolution(engine, { target = 60, min = .5 }) -> { stop(), scale() }
                                                 dynamic resolution: configures CORE A's DynRes (frame-time based, coarse steps,
                                                 cooldown, hitch rejection, applied at the top of a frame)
   Preset fields:
     scale          render scale (1 = native, hardware scaling = 1 / scale)
     shadow         0 (none) | map size; cascades: CSM cascades (0 = single camera-following map); shadowDist (m)
     pcf            shadow filtering quality 0 low .. 2 high
     ssao           SSAO2 on/off, ssaoSamples, ssaoRatio
     bloom, bloomScale, fxaa, taa (temporal AA: off by default, ghosting with the body-cam lens), sharpen
     tex            max texture edge (materials.js), aniso, detail, pom (parallax occlusion)
     lens           body-cam lens quality: 0 = cheap (no blur taps), 1 = full
     particles      weather particle budget multiplier (1 = rain 3000 drops)
     lights         max simultaneous lights per material (B.light budget)
     envSize        IBL texture is always the 512 px .env; skySize = largest sky panorama edge
     motionBlur     allowed (the setting still decides)
*/

import { setRenderScale, getEngine, DynRes } from '../core/engine.js';
import { Settings } from '../core/settings.js';

export const TIERS = ['low', 'medium', 'high', 'ultra'];
export const QUALITY = {
  low: { name: 'low', scale: .75, shadow: 1024, cascades: 0, shadowDist: 40, pcf: 0, ssao: false, ssaoSamples: 8, ssaoRatio: .5,
    bloom: true, bloomScale: .25, fxaa: true, taa: false, sharpen: .15, tex: 512, aniso: 2, detail: false, pom: false,
    lens: 0, particles: .4, lights: 4, skySize: 1024, motionBlur: false },
  medium: { name: 'medium', scale: .9, shadow: 1024, cascades: 2, shadowDist: 70, pcf: 1, ssao: true, ssaoSamples: 8, ssaoRatio: .5,
    bloom: true, bloomScale: .5, fxaa: true, taa: false, sharpen: .2, tex: 1024, aniso: 4, detail: false, pom: false,
    lens: 1, particles: .75, lights: 6, skySize: 2048, motionBlur: true },
  high: { name: 'high', scale: 1, shadow: 2048, cascades: 3, shadowDist: 110, pcf: 1, ssao: true, ssaoSamples: 16, ssaoRatio: .75,
    bloom: true, bloomScale: .5, fxaa: true, taa: false, sharpen: .25, tex: 2048, aniso: 8, detail: true, pom: false,
    lens: 1, particles: 1, lights: 8, skySize: 2048, motionBlur: true },
  ultra: { name: 'ultra', scale: 1, shadow: 2048, cascades: 4, shadowDist: 160, pcf: 2, ssao: true, ssaoSamples: 24, ssaoRatio: 1,
    bloom: true, bloomScale: .75, fxaa: true, taa: false, sharpen: .3, tex: 2048, aniso: 16, detail: true, pom: true,
    lens: 1, particles: 1.6, lights: 12, skySize: 2048, motionBlur: true },
};

const tierOf = new WeakMap();
let lastTier = 'medium';

/** Guess a tier from what the browser tells us. Conservative: a wrong 'high' costs more than a wrong 'medium'. */
export function detectTier(engine) {
  let renderer = '';
  try {
    const gl = engine && engine._gl ? engine._gl : document.createElement('canvas').getContext('webgl2');
    if (gl) {
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      renderer = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER) || '');
    }
  } catch (e) { /* no GL: low */ }
  const r = renderer.toLowerCase();
  const nav = typeof navigator !== 'undefined' ? navigator : {};
  const mem = nav.deviceMemory || 8, cores = nav.hardwareConcurrency || 4;
  const mobile = /android|iphone|ipad|ipod|mobile/i.test(nav.userAgent || '') || (nav.maxTouchPoints > 1 && /macintosh/i.test(nav.userAgent || ''));
  const px = typeof screen !== 'undefined' ? screen.width * screen.height * (typeof devicePixelRatio !== 'undefined' ? devicePixelRatio ** 2 : 1) : 2e6;
  if (!r || /swiftshader|llvmpipe|software|basic render|microsoft basic/.test(r)) return 'low';
  if (mobile) {
    if (/apple gpu|apple a1[5-9]|apple m\d/.test(r) && mem >= 6) return 'medium';
    if (/adreno.*(7[3-9]\d|8\d\d)|mali-g7[1-9]|mali-g[6-9]\d\d|immortalis|xclipse/.test(r) && mem >= 8) return 'medium';
    return 'low';
  }
  // discrete desktop GPUs
  if (/rtx\s*(30[6-9]0|40\d0|50\d0)|rx\s*(6[7-9]\d0|7[6-9]\d\d|9\d\d\d)|radeon pro w7|arc\s*a7|apple m[2-9] (pro|max|ultra)/.test(r) && mem >= 8 && cores >= 6)
    return px > 9e6 ? 'high' : 'ultra';
  if (/rtx|gtx\s*(10[6-8]0|16[5-6]0)|rx\s*(5[6-7]00|6[5-6]\d0|580|590)|arc|apple m\d|radeon pro/.test(r) && mem >= 8) return 'high';
  if (/gtx|radeon|rx\s|geforce|quadro/.test(r)) return 'medium';
  // integrated
  if (/intel.*(iris xe|arc)|radeon.*(vega|graphics)|apple/.test(r)) return mem >= 8 ? 'medium' : 'low';
  if (/intel/.test(r)) return 'low';
  return 'medium';
}

export function resolveTier(setting, engine) {
  if (setting === 'auto' || !setting) return detectTier(engine);
  return QUALITY[setting] ? setting : 'medium';
}

function setScale(engine, s) {
  // CORE A owns the canvas scale (js/core/engine.js): the preset scale multiplies the user's renderScale setting
  const user = +Settings.get('renderScale') || 1;
  if (getEngine()) setRenderScale(Math.max(.5, Math.min(1, user * s)));
  else if (engine) engine.setHardwareScalingLevel(1 / Math.max(.5, Math.min(1, s)));
}

export function applyQuality(engine, scene, tier) {
  tier = QUALITY[tier] ? tier : resolveTier(tier, engine);
  const q = QUALITY[tier];
  lastTier = tier;
  if (scene) {
    tierOf.set(scene, tier);
    scene.metadata = Object.assign(scene.metadata || {}, { lfQuality: tier });
    scene.particlesEnabled = true;
    scene.shadowsEnabled = q.shadow > 0;
  }
  setScale(engine, q.scale);   // dynamic resolution (DynRes) scales on top of this, at the start of a frame
  return q;
}

export const currentTier = scene => (scene && tierOf.get(scene)) || lastTier;

/** Dynamic resolution ('auto'): CORE A's DynRes (js/core/engine.js, driven by loop.js at the top of each frame) does the
    measuring and the stepping; this only configures it. Returns { stop(), scale() }. */
export function autoResolution(engine, { target = 60, min = .5 } = {}) {
  DynRes.enabled = true; DynRes.target = target; DynRes.min = min; DynRes.reset();
  return { stop() { DynRes.enabled = false; DynRes.set(1); }, scale: () => DynRes.info().scale };
}
