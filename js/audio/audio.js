/* LIVE FIRE — audio: a WebAudio engine where every sound is synthesised (no samples), positional (HRTF), with distance air
   absorption, occlusion, per-space convolution reverb, voice limiting, a body-cam microphone character, generated music and
   ambience. Contract: docs/ARCHITECTURE.md §9.
   Exports: Audio = {
     init({ force }) -> Promise<bool>   creates the AudioContext on the first user gesture (arms gesture listeners when called
                                        earlier; force: tests); safe to call any number of times. Calls before init are no-ops,
                                        except the state ones (setSpace, ambience, music, setVolumes, listener, setStyle), which are
                                        remembered and applied at init.
     resume(), ready() -> Promise (the warm set is baked), prepare({ families, nades }) -> Promise (bake what a match needs)
     setVolumes({ master, sfx, music, ui, voice, ambience }) (0..1, perceptual curve; also follows Settings masterVol..voiceVol)
     setStyle({ bodycam: 0..1 })        body-cam microphone AGC pumping after loud sounds (default .35)
     listener(pos, yaw, pitch)          every frame from the camera (Babylon axes: yaw = rotation.y, pitch > 0 = looking down)
     setSpace({ reverb: 'outdoor'|'room'|'hall'|'tunnel'|'none', surface })   crossfades the convolution reverb; surface = default ground
     gun(family, { pos, suppressed, local, distant, id, gun (GUNS record or stats), velocity, cycle, archetype, surf, occ, gain })
     dry(family?, { pos, local }), reload(stage, family, { pos, local, id, gun, empty, occ })
     step(surf, { pos, local, speed (0..1 loud fraction (0 = walking: silent for others)), crouch, id, occ })
     land(surf, speed (m/s), { pos, local, id }), jump({ pos, local, surf, id })
     impact(surf, { pos, ricochet, occ, gain }), whiz({ pos, speed (bullet m/s), miss (m), pellet })
     hit({ head, armor, helmet, local, pos }), kill({ head }), hurt(dmg, { hp }), heartbeat()
     nade(kind, stage, { pos, id, surf, speed, family, duration, local, occ })   stages: pin spoon throw bounce stick beep ping arm
                                        detonate boom bomblet loop move end (see §9)
     tinnitus(seconds, { k }), muffle(seconds, k)   ring + muffled world / muffle only
     ui(name), ambience(kind, { rain, wind }), music(mood ('menu'|'lobby'|'tension'|'none')), radio(name, { pos })
     melee(kind, stage, { pos, local, surf }), sfx(name, { pos, gain }), vo(name, { pos }), bodyfall(surf, { pos })
     move(id, pos), stopLoop(id), stopAll(), setEnabled(bool), stats(), ambEvent(name, dist) (one ambience event now)
     render(fn(A, at), secs, { sr, listener, space, volumes, measure }) -> Promise<{ buffer, jsMs, renderMs, stats }>  (tests: the
                                        whole runtime chain on an OfflineAudioContext; at(t, cb) runs cb at offline time t)
   } */
import { Engine } from './engine.js';
import { Baker } from './baker.js';
import { createPlayer } from './play.js';
import { Music } from './music.js';
import { Ambience } from './ambience.js';
import { names as bankNames } from './bank.js';
import { FAMILIES } from './sounds/guns.js';
import './sounds/index.js';
import { Settings } from '../core/settings.js';
import { appBus } from '../core/events.js';

let ctx = null, live = null, cur = null, B = null, initP = null, armed = false, enabled = true, readyP = null;
let M = null, AMBI = null, curM = null, curA = null;
const S = { space: { reverb: 'outdoor', surface: 'concrete' }, amb: null, mood: null, vol: null, style: .35, L: null };
const P = createPlayer(() => cur);
const mobile = typeof navigator !== 'undefined' && (/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '') || (navigator.hardwareConcurrency || 8) <= 2);
const has = () => !!cur;
const safe = fn => (...a) => { if (!cur || !enabled) return; try { return fn(...a); } catch (e) { if (!safe.warned) { safe.warned = true; console.warn('[audio]', e); } } };

function warmList() {
  const all = bankNames(), pre = p => all.filter(n => n.startsWith(p));
  return [...pre('ui:'), ...Object.keys(FAMILIES).flatMap(f => ['gun:' + f, 'sup:' + f]), ...pre('mech:'), 'crack', ...pre('st:'), 'gear', 'gear:heavy', 'jump',
    ...pre('imp:'), 'ric', ...pre('whiz:'), ...pre('hit:'), 'kill', 'kill:head', ...pre('hurt:'), 'dry', 'dry:h', 'tin', 'ir:outdoor', 'ir:room',
    ...Object.keys(FAMILIES).map(f => 'far:' + f), 'nd:pin', 'nd:spoon', 'nd:throw', 'nd:boom:frag', 'nd:boomfar:frag', 'nd:flash', 'nd:pop', 'nd:hiss', 'nd:molotov', 'nd:fire',
    'rl:magout:m', 'rl:magin:m', 'rl:magout:l', 'rl:magin:l', 'rl:start:m', 'rl:start:l', 'rl:end:m', 'rl:end:l', 'rl:draw:m', 'rl:draw:l', 'rl:sliderel', 'rl:boltrel:m', 'rl:charge:m',
    'brass:r:hard', 'brass:p:hard', 'brass:rl:hard', 'brass:sh:hard', 'vo:exhale', 'sfx:heartbeat'];
}
function applySettings() {
  const g = k => { try { return Settings.get(k); } catch (e) { return undefined; } };
  const v = { master: g('masterVol'), sfx: g('sfxVol'), music: g('musicVol'), ui: g('uiVol'), voice: g('voiceVol') };
  for (const k in v) if (v[k] == null) delete v[k];
  if (S.vol) Object.assign(v, S.vol);
  if (live) live.setVolumes(v);
}
function armGesture() {
  if (armed || typeof window === 'undefined') return; armed = true;
  const go = () => { for (const t of ['pointerdown', 'keydown', 'touchend', 'mousedown']) window.removeEventListener(t, go, true); armed = false; Audio.init(); };
  for (const t of ['pointerdown', 'keydown', 'touchend', 'mousedown']) window.addEventListener(t, go, true);
}

export const Audio = {
  init(o = {}) {
    if (initP) { Audio.resume(); return initP; }
    const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
    if (!AC) return Promise.resolve(false);
    const ua = navigator.userActivation;
    if (!o.force && ua && !ua.hasBeenActive) { armGesture(); return Promise.resolve(false); }
    initP = (async () => {
      try { ctx = new AC({ latencyHint: 'interactive' }); } catch (e) { ctx = new AC(); }
      B = new Baker(ctx, { mobile });
      live = cur = new Engine(ctx, B, { mobile });
      B.pin(warmList()); readyP = B.request(warmList());
      M = curM = new Music(live); AMBI = curA = new Ambience(live);
      applySettings(); live.setStyle(S.style); live.setSpace(S.space);
      if (S.L) live.setListener(S.L.p, S.L.yaw, S.L.pitch);
      if (S.amb) AMBI.set(S.amb[0], S.amb[1]);
      if (S.mood) M.set(S.mood);
      appBus.on('settings', e => { const k = e && e.key || ''; if (!/Vol$/.test(k)) return; if (S.vol) delete S.vol[k.replace(/Vol$/, '')]; applySettings(); });
      document.addEventListener('visibilitychange', () => { if (!ctx) return; if (document.hidden) ctx.suspend().catch(() => {}); else ctx.resume().catch(() => {}); });
      if (ctx.state !== 'running') { ctx.resume().catch(() => {}); armGesture(); }
      return true;
    })().catch(e => { console.warn('[audio] init failed', e); initP = null; return false; });
    return initP;
  },
  resume() { if (ctx && ctx.state !== 'running' && ctx.state !== 'closed') ctx.resume().catch(() => {}); },
  ready() { return readyP || Promise.resolve(); },
  prepare(o) { return B ? P.prepare(o) : Promise.resolve(); },
  setVolumes(v = {}) { S.vol = { ...(S.vol || {}), ...v }; if (live) live.setVolumes(v); },
  setStyle(o = {}) { if (o.bodycam != null) S.style = +o.bodycam; if (live) live.setStyle(S.style); },
  setEnabled(on) { enabled = !!on; if (live) live.master.gain.value = enabled ? 1 : 0; if (!enabled && live) live.stopAll(.05); },
  listener(pos, yaw, pitch) { if (!pos) return; if (cur === live) S.L = { p: { x: pos.x, y: pos.y, z: pos.z }, yaw, pitch }; if (cur) cur.setListener(pos, yaw, pitch); },
  setSpace(o = {}) { const sp = { ...(cur && cur !== live ? cur.space : S.space), ...o }; if (cur === live) S.space = sp; if (cur) cur.setSpace(sp); },
  gun: safe((f, o) => P.gun(f, o || {})),
  dry: safe((f, o) => P.dry(f, o || {})),
  reload: safe((s, f, o) => P.reload(s, f, o || {})),
  step: safe((s, o) => P.step(s, o || {})),
  land: safe((s, v, o) => P.land(s, v, o || {})),
  jump: safe(o => P.jump(o || {})),
  impact: safe((s, o) => P.impact(s, o || {})),
  whiz: safe(o => P.whiz(o || {})),
  hit: safe(o => P.hit(o || {})),
  kill: safe(o => P.kill(o || {})),
  hurt: safe((d, o) => P.hurt(d, o || {})),
  heartbeat: safe(() => P.heartbeat()),
  nade: safe((k, s, o) => P.nade(k, s, o || {})),
  tinnitus: safe((s, o) => P.tinnitus(s, o || {})),
  muffle: safe((s, k) => cur.deafen(Math.max(.1, +s || 1), Math.max(0, Math.min(1, k == null ? .7 : +k)))),
  ui: safe(n => P.ui(n)),
  melee: safe((k, s, o) => P.melee(k, s, o || {})),
  sfx: safe((n, o) => P.sfx(n, o || {})),
  vo: safe((n, o) => P.vo(n, o || {})),
  bodyfall: safe((s, o) => P.bodyfall(s, o || {})),
  radio: safe((n, o) => P.radio(n, o || {})),
  move: safe((id, pos) => cur.moveLoop('nd:' + id, pos) || cur.moveLoop(id, pos)),
  stopLoop: safe(id => { cur.stopLoop('nd:' + id); cur.stopLoop(id); }),
  ambience(kind, o = {}) { if (cur === live) S.amb = [kind, o]; if (curA) curA.set(kind, o); },
  music(mood) { if (cur === live) S.mood = mood; if (curM) curM.set(mood); },
  ambEvent(name, dist) { if (curA) curA.spawn(name, dist || 30, dist || 120); },
  stopAll() { if (!cur) return; if (curA) curA.stop(); if (cur === live) S.amb = null; cur.stopAll(.25); },
  stats() {
    const b = B ? B.stats() : {}, e = cur ? cur.stats() : {};
    return { state: ctx ? ctx.state : 'none', sampleRate: ctx ? ctx.sampleRate : 0, baker: b.worker ? 'worker' : 'main', mobile, music: curM ? curM.mood : null, ambience: curA ? curA.kind : null, ...b, ...e };
  },
  get ctx() { return ctx; },
  get engine() { return cur; },
  get bank() { return B; },
  async render(fn, secs = 2, o = {}) {
    if (!B) { const AC = window.OfflineAudioContext || window.webkitOfflineAudioContext; B = new Baker(new AC(2, 128, o.sr || 48000), { mobile }); }
    const sr = o.sr || B.sr || 48000, space = o.space || S.space;
    const mk = () => {
      const c = new OfflineAudioContext(2, Math.ceil(secs * sr), sr), e = new Engine(c, B, { offline: true, mobile: !!o.mobile, maxVoices: o.maxVoices, maxHrtf: o.maxHrtf });
      e.setVolumes(o.volumes || { master: 1, sfx: 1, music: 1, ui: 1, voice: 1 }); e.setStyle(o.style != null ? o.style : S.style);
      const L = o.listener || { p: { x: 0, y: 1.6, z: 0 }, yaw: 0, pitch: 0 }; e.setListener(L.p, L.yaw, L.pitch); return e;
    };
    const run = (e, collect) => {
      const save = [cur, curM, curA]; cur = e; curM = new Music(e); curA = new Ambience(e);
      const misses = new Set(), pick0 = B.pick, get0 = B.get, has0 = B.has;
      if (collect) {
        B.pick = function (n) { const r = pick0.call(B, n, false); if (!r) misses.add(n); return r; };
        B.get = function (n) { const r = get0.call(B, n); if (!r) misses.add(n); return r; };
        B.has = function (n) { const r = has0.call(B, n); if (!r) misses.add(n); return r; };
      }
      e.setSpace(space);
      const at = (t, cb) => { const s0 = e.tOff; e.tOff = t; try { cb(); } finally { e.tOff = s0; } };
      const t0 = performance.now();
      try { fn(Audio, at, e); if (curM.mood !== 'none') curM.tick(secs); }
      finally { if (collect) { B.pick = pick0; B.get = get0; B.has = has0; } [cur, curM, curA] = save; }
      return { misses, jsMs: performance.now() - t0 };
    };
    await B.request(['ir:' + (space.reverb || 'outdoor'), 'ir:music', 'tin']);
    for (let pass = 0; pass < 4; pass++) { const r = run(mk(), true); if (!r.misses.size) break; await B.request([...r.misses], true); }
    const e = mk(); const r = run(e, false);
    const t1 = performance.now(), buffer = await e.ctx.startRendering(), renderMs = performance.now() - t1;
    return { buffer, jsMs: r.jsMs, renderMs, stats: e.stats() };
  },
};
