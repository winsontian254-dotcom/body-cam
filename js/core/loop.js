/* LIVE FIRE — main loop: fixed 64 Hz simulation ticks + per-frame callbacks + scene.render().
   Exports:
     TICK_DT = 1/64, MAX_TICKS_PER_FRAME = 8
     startLoop(engine)                    starts engine.runRenderLoop (idempotent); stopLoop()
     onTick(fn) -> off                    fn(dt) at a fixed 64 Hz (Input.pressed() edges are valid inside ticks)
     onFrame(fn) -> off                   fn(dt, alpha) every rendered frame BEFORE scene.render(); alpha = tick interpolation 0..1
     onLateFrame(fn) -> off               fn(dt, alpha) after scene.render() (HUD/DOM updates, stats)
     setScene(scene|null), getScene()     the scene the loop renders (menu scene, match scene); resets dynamic resolution
     setPaused(bool), isPaused()          paused: no ticks (frames and rendering continue)
     setTimeScale(k), getTimeScale()      slow motion / fast forward of the simulation (0..4)
     setFpsCap(fps)                       0 = uncapped (the settings key fpsCap drives this)
     runTicks(n)                          run n ticks synchronously now (tests / headless driving through window.LF)
     loopStats                            { fps, frameMs, cpuMs, tick, ticksLastFrame, dropped, errors, lastError, alpha, time }
   Frame order: engine.frameStart() (resize/scaling) -> Input.frame(dt) -> ticks -> onFrame -> render -> onLateFrame -> DynRes.
   Every callback runs in try/catch: an error is counted (loopStats.errors), logged once per message and reported on
   appBus 'loop:error' { where, message }; one bad callback never stops the loop or leaves keys stuck. */
import { Input } from './input.js';
import { frameStart, DynRes } from './engine.js';
import { appBus } from './events.js';
import { Settings } from './settings.js';

export const TICK_DT = 1 / 64;
export const MAX_TICKS_PER_FRAME = 8;

const tickFns = [], frameFns = [], lateFns = [];
let scene = null, paused = false, timeScale = 1, acc = 0, last = 0, running = false, eng = null;
let capMs = 0, capAcc = 0;
const seen = new Map();

export const loopStats = { fps: 0, frameMs: 0, cpuMs: 0, tick: 0, ticksLastFrame: 0, dropped: 0, errors: 0, lastError: '', alpha: 0, time: 0, frames: 0 };

function add(list, fn) { list.push(fn); return () => { const i = list.indexOf(fn); if (i >= 0) list.splice(i, 1); }; }
export const onTick = fn => add(tickFns, fn);
export const onFrame = fn => add(frameFns, fn);
export const onLateFrame = fn => add(lateFns, fn);

function fail(where, e) {
  loopStats.errors++;
  const msg = (e && e.message) || String(e);
  loopStats.lastError = where + ': ' + msg;
  const n = (seen.get(msg) || 0) + 1; seen.set(msg, n);
  if (n === 1) { console.error('[loop] ' + where + ' failed:', e); appBus.emit('loop:error', { where, message: msg }); }
}

function tickOnce() {
  try { Input.beginTick(); } catch (e) { fail('input', e); }
  for (let i = 0; i < tickFns.length; i++) { try { tickFns[i](TICK_DT); } catch (e) { fail('tick', e); } }
  loopStats.tick++; loopStats.time += TICK_DT;
}

export function runTicks(n = 1) { for (let i = 0; i < n; i++) tickOnce(); }

function frame() {
  const now = performance.now();
  let dt = last ? (now - last) / 1000 : 1 / 60;
  last = now;
  if (capMs > 0) {
    capAcc += dt * 1000;
    if (capAcc < capMs - 0.5) return;            // nothing drawn this rAF: the browser keeps showing the last frame
    dt = capAcc / 1000; capAcc = capAcc % capMs;
  }
  if (dt > 0.25) dt = 0.25;
  const t0 = performance.now();
  try { frameStart(); } catch (e) { fail('engine', e); }
  try { Input.frame(dt); } catch (e) { fail('input', e); }
  let n = 0;
  if (!paused) {
    acc += dt * timeScale;
    while (acc >= TICK_DT && n < MAX_TICKS_PER_FRAME) { tickOnce(); acc -= TICK_DT; n++; }
    if (acc >= TICK_DT) { loopStats.dropped += Math.floor(acc / TICK_DT); acc %= TICK_DT; }   // spiral of death guard
  }
  const alpha = acc / TICK_DT;
  loopStats.alpha = alpha; loopStats.ticksLastFrame = n;
  for (let i = 0; i < frameFns.length; i++) { try { frameFns[i](dt, alpha); } catch (e) { fail('frame', e); } }
  if (scene && scene.activeCamera && !scene.isDisposed) { try { scene.render(); } catch (e) { fail('render', e); } }
  for (let i = 0; i < lateFns.length; i++) { try { lateFns[i](dt, alpha); } catch (e) { fail('late', e); } }
  try { DynRes.sample(dt); } catch (e) { fail('dynres', e); }
  const cpu = performance.now() - t0;
  loopStats.frames++;
  loopStats.frameMs += (dt * 1000 - loopStats.frameMs) * 0.1;
  loopStats.cpuMs += (cpu - loopStats.cpuMs) * 0.1;
  loopStats.fps = loopStats.frameMs > 0 ? 1000 / loopStats.frameMs : 0;
}

export function startLoop(engine) {
  if (running) return;
  eng = engine; running = true; last = 0;
  setFpsCap(Settings.get('fpsCap'));
  Settings.onChange(({ key, value }) => { if (key === 'fpsCap') setFpsCap(value); });
  engine.runRenderLoop(frame);
}
export function stopLoop() { if (eng && running) { eng.stopRenderLoop(frame); running = false; } }
export function setScene(s) { scene = s || null; acc = 0; DynRes.reset(); }
export const getScene = () => scene;
export function setPaused(p) { paused = !!p; if (paused) acc = 0; }
export const isPaused = () => paused;
export function setTimeScale(k) { timeScale = Math.max(0, Math.min(4, +k || 0)); }
export const getTimeScale = () => timeScale;
export function setFpsCap(fps) { fps = +fps || 0; capMs = fps >= 20 ? 1000 / fps : 0; capAcc = 0; }
