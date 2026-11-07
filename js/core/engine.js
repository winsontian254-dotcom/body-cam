/* LIVE FIRE — Babylon engine: WebGL2 only, resize, hardware scaling, dynamic resolution.
   Exports:
     bootEngine(canvas, opts?) -> Promise<{ engine }>   WebGL2, stencil, no MSAA (postfx does AA); throws a readable Error
     getEngine() -> BABYLON.Engine | null
     setRenderScale(s)            user render scale 0.5..1 (hardware scaling = 1 / (dpr * s * dyn)); applied at the next frame start
     getRenderScale() -> { user, dyn, dpr, level, width, height }
     frameStart()                 called by loop.js at the TOP of every frame: applies queued resizes / scaling changes
     queueResize()                ask for an engine.resize() at the next frame start (window resize, fullscreen, UI zoom)
     DynRes = { enabled, target, reset(), sample(dtSeconds), info() }   dynamic resolution (driven by loop.js)
     engineInfo() -> { webgl, renderer, vendor, maxTexture, dpr, babylon }
   Rule: the canvas size / hardware scaling never changes between scene.render() and the browser presenting the frame
   (a resize clears the canvas and the browser would present that blank frame). Everything goes through frameStart().
   appBus events: 'gpu:lost', 'gpu:restored', 'engine:resize' { width, height, level }. */
import { Settings } from './settings.js';
import { appBus } from './events.js';
import { DEV } from './dev.js';

let engine = null, canvas = null;
let userScale = 1, dynScale = 1, curLevel = 0;
let pendResize = true, pendLevel = true;
let lost = false;

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const dprCap = () => clamp(Math.min(window.devicePixelRatio || 1, Settings.get('maxDpr') || 2), 0.5, 4);
const levelNow = () => 1 / (dprCap() * clamp(userScale, 0.5, 1) * clamp(dynScale, 0.4, 1));

export async function bootEngine(cv, opts = {}) {
  if (typeof BABYLON === 'undefined' || !BABYLON.Engine) throw new Error('Babylon.js did not load. Check your connection (cdn.jsdelivr.net) and reload.');
  if (engine) return { engine };
  canvas = cv;
  const glOpts = {
    stencil: true, antialias: false, alpha: false, premultipliedAlpha: false, preserveDrawingBuffer: false,
    powerPreference: 'high-performance', failIfMajorPerformanceCaveat: false, desynchronized: false,
    disableWebGL2Support: false, doNotHandleContextLost: false, audioEngine: false, adaptToDeviceRatio: false,
    xrCompatible: false, ...(opts.gl || {}),
  };
  let e;
  try { e = new BABYLON.Engine(canvas, false, glOpts, false); }
  catch (err) { throw new Error('Could not start WebGL: ' + (err && err.message || err) + '. Your browser or GPU driver may have WebGL disabled.'); }
  if (!e || !e._gl) throw new Error('WebGL is not available in this browser.');
  if (e.webGLVersion < 2) { e.dispose(); throw new Error('LIVE FIRE needs WebGL 2. Update your browser or enable hardware acceleration.'); }
  engine = e;
  engine.enableOfflineSupport = false;
  engine.disableManifestCheck = true;
  if (BABYLON.Engine.audioEngine) { try { BABYLON.Engine.audioEngine.useCustomUnlockedButton = true; } catch (er) { /* audio is ours */ } }
  userScale = clamp(+Settings.get('renderScale') || 1, 0.5, 1);
  DynRes.enabled = !!Settings.get('dynRes') && !DEV.nodyn;   // #dev&nodyn: fixed resolution (stable test screenshots)
  DynRes.target = +Settings.get('dynResTarget') || 60;

  engine.onContextLostObservable.add(() => { lost = true; appBus.emit('gpu:lost', {}); });
  engine.onContextRestoredObservable.add(() => { lost = false; pendResize = true; pendLevel = true; appBus.emit('gpu:restored', {}); });
  window.addEventListener('resize', queueResize);
  document.addEventListener('fullscreenchange', queueResize);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', queueResize);
  if (typeof ResizeObserver !== 'undefined') { try { new ResizeObserver(queueResize).observe(canvas); } catch (er) { /* old browser */ } }
  // devicePixelRatio changes (moving the window to another monitor, browser zoom)
  const watchDpr = () => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia('(resolution: ' + (window.devicePixelRatio || 1) + 'dppx)');
    const fn = () => { pendLevel = true; queueResize(); mq.removeEventListener ? mq.removeEventListener('change', fn) : null; watchDpr(); };
    if (mq.addEventListener) mq.addEventListener('change', fn);
  };
  watchDpr();
  Settings.onChange(({ key, value }) => {
    if (key === 'renderScale') setRenderScale(value);
    else if (key === 'maxDpr') pendLevel = true;
    else if (key === 'dynRes') { DynRes.enabled = !!value && !DEV.nodyn; if (!DynRes.enabled) { dynScale = 1; pendLevel = true; } }
    else if (key === 'dynResTarget') DynRes.target = +value || 60;
  });
  frameStart();
  return { engine };
}

export const getEngine = () => engine;
export function setRenderScale(s) { userScale = clamp(+s || 1, 0.5, 1); pendLevel = true; }
export function queueResize() { pendResize = true; }
export function getRenderScale() {
  return { user: userScale, dyn: dynScale, dpr: dprCap(), level: curLevel,
    width: engine ? engine.getRenderWidth() : 0, height: engine ? engine.getRenderHeight() : 0 };
}

/** Top of the frame (before anything renders): apply queued canvas resizes and scaling changes. */
export function frameStart() {
  if (!engine || lost) return;
  const lvl = levelNow();
  let changed = false;
  if (pendLevel || Math.abs(lvl - curLevel) > 1e-6) {
    pendLevel = false;
    if (Math.abs(lvl - curLevel) > 1e-6) { curLevel = lvl; engine.setHardwareScalingLevel(lvl); changed = true; pendResize = false; }
  }
  if (pendResize) { pendResize = false; engine.resize(); changed = true; }
  if (changed) appBus.emit('engine:resize', { width: engine.getRenderWidth(), height: engine.getRenderHeight(), level: curLevel });
}

/* Dynamic resolution: coarse steps, a cooldown, hitch rejection and a grace period after scene changes. A sharpening step
   that lowers the frame rate is undone and sharpening stays off until the next reset() (a v-synced frame rate cannot show
   headroom, so blind climbing would flip-flop). */
export const DynRes = {
  enabled: true, target: 60, min: 0.5,
  _avg: 1 / 60, _grace: 3, _cool: 0, _steady: 0, _upLock: false, _upAt: -1, _t: 0, _drops: 0,
  reset() { this._grace = 3; this._cool = 0; this._steady = 0; this._upLock = false; this._upAt = -1; this._avg = 1 / this.target; },
  sample(dt) {
    this._t += dt;
    if (!this.enabled || !engine) return;
    if (dt > 0.25) { this._grace = Math.max(this._grace, 0.6); return; }   // hitch (tab switch, shader compile): ignore
    if (this._grace > 0) { this._grace -= dt; this._avg = 1 / this.target; return; }
    this._avg += (dt - this._avg) * 0.04;
    if (this._cool > 0) { this._cool -= dt; return; }
    const fps = 1 / this._avg, tgt = this.target;
    if (fps < tgt * 0.88 && dynScale > this.min + 1e-3) {
      const step = fps < tgt * 0.6 ? 0.3 : 0.15;
      dynScale = Math.max(this.min, dynScale - step); pendLevel = true;
      if (this._upAt >= 0 && this._t - this._upAt < 5) this._upLock = true;     // the last sharpening step cost frames
      this._cool = 2; this._steady = 0; this._drops++; this._avg = 1 / tgt;
    } else if (fps >= tgt * 0.97 && dynScale < 1 - 1e-3 && !this._upLock) {
      this._steady += dt;
      if (this._steady > 6) { dynScale = Math.min(1, dynScale + 0.1); pendLevel = true; this._cool = 2; this._steady = 0; this._upAt = this._t; }
    } else this._steady = 0;
  },
  info() { return { enabled: this.enabled, scale: dynScale, fps: 1 / this._avg, upLock: this._upLock, drops: this._drops }; },
  set(scale) { dynScale = clamp(scale, this.min, 1); pendLevel = true; },
};

export function engineInfo() {
  if (!engine) return null;
  const gl = engine._gl; let renderer = '', vendor = '';
  try {
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    renderer = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    vendor = ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR);
  } catch (e) { /* privacy settings */ }
  return { webgl: engine.webGLVersion, renderer, vendor, maxTexture: engine.getCaps().maxTextureSize, dpr: window.devicePixelRatio || 1,
    babylon: BABYLON.Engine.Version };
}
