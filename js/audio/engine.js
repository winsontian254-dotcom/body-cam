/* LIVE FIRE — the WebAudio runtime graph (works on an AudioContext or an OfflineAudioContext for tests).
   Exports: class Engine, CLASS (spatial presets), distGain(d, ref, roll), airCutoff(d)
   Graph:
     voices -> bus.sfx / bus.amb / bus.voice --> world --> deaf (low-pass + gain: tinnitus / concussion) --> cam (body-cam AGC:
               an explicit duck after loud sounds, pump()) --> master --> soft-clip limiter (WaveShaper, zero latency) --> out
     voice sends --> revIn --> convolver (A/B crossfaded on setSpace) --> bus.sfx
     bus.music --> musicDuck --> master;  bus.ui --> uiDuck --> master;  tinnitus ring --> master (not muffled)
   A voice = sources (layers) -> in -> [air / occlusion low-pass] -> direct gain -> [PannerNode HRTF | equalpower | StereoPanner]
             -> bus,  + a reverb send whose level falls slower with distance than the direct sound (far = wetter).
   Distance: gain = (ref / max(ref, d)) ^ roll; air absorption: low-pass at 8 kHz * (30 / d) ^ 0.59 (-3 dB where the ISO 9613
   absorption reaches ~3 dB); arrival delay d / 343 s (capped at 0.9 s); occlusion (0..1): -55% gain, low-pass to ~700 Hz, more reverb.
   Voice management: max voices (96 desktop / 40 mobile), HRTF for the 20 most recent positional voices within 60 m (0 on mobile:
   equalpower), per-key concurrency (maxSame: the oldest of the key is faded out) and minimum gap (minGap), global stealing of the
   lowest score (prio + log10(gain)) when full. Positional loops follow the listener (gain / air filter refreshed in setListener). */
export const CLASS = {
  gun:    { ref: 3, roll: .85, max: 900, send: .85, prio: 8 },
  mech:   { ref: 1.5, roll: 1.4, max: 14, send: .3, prio: 4 },
  brass:  { ref: 1, roll: 1.5, max: 9, send: .2, prio: 1, maxSame: 6 },
  step:   { ref: 1.5, roll: 1.15, max: 40, send: .25, prio: 7, maxSame: 16 },
  impact: { ref: 2, roll: 1.05, max: 70, send: .5, prio: 5, maxSame: 10 },
  ric:    { ref: 3, roll: 1, max: 60, send: .45, prio: 4, maxSame: 3 },
  whiz:   { ref: 1, roll: 1, max: 12, send: .2, prio: 9, maxSame: 4 },
  hit:    { ref: 2, roll: 1.1, max: 50, send: .3, prio: 6, maxSame: 6 },
  boom:   { ref: 6, roll: .8, max: 1500, send: 1, prio: 9, maxSame: 6 },
  nade:   { ref: 2, roll: 1.1, max: 45, send: .4, prio: 6, maxSame: 8 },
  loop:   { ref: 2.5, roll: 1.1, max: 50, send: .3, prio: 8 },
  reload: { ref: 1.5, roll: 1.3, max: 22, send: .3, prio: 6, maxSame: 8 },
  vo:     { ref: 2, roll: 1.1, max: 35, send: .3, prio: 5, maxSame: 6 },
  amb:    { ref: 25, roll: .9, max: 1200, send: .2, prio: 2, maxSame: 4 },
  world:  { ref: 3, roll: 1, max: 90, send: .5, prio: 6, maxSame: 6 },
};
export const distGain = (d, ref, roll) => d <= ref ? 1 : Math.pow(ref / d, roll);
export const airCutoff = d => d < 4 ? 22000 : 8000 * Math.pow(30 / d, .59);
let CLIP = null;
/** WaveShaper curve over an input pre-scaled by 1/4 (+12 dB of headroom before the curve's end) */
export function softClip() {
  if (CLIP) return CLIP; const n = 8192, T = .6, c = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = (i / (n - 1) * 2 - 1) * 4, a = Math.abs(x); c[i] = Math.sign(x) * (a <= T ? a : T + (1 - T) * Math.tanh((a - T) / (1 - T))); }
  return (CLIP = c);
}
/** a ConvolverNode needs its buffer at the context rate: resample (linear) and cache when the bake rate differs */
const RS = new WeakMap();
export function matchRate(buf, ctx) {
  const sr = ctx.sampleRate; if (!buf || buf.sampleRate === sr) return buf;
  let m = RS.get(buf); if (m && m.sampleRate === sr) return m;
  const n = Math.max(1, Math.round(buf.length * sr / buf.sampleRate)), k = buf.sampleRate / sr;
  m = ctx.createBuffer(buf.numberOfChannels, n, sr);
  for (let c = 0; c < buf.numberOfChannels; c++) { const a = buf.getChannelData(c), b = m.getChannelData(c); for (let i = 0; i < n; i++) { const x = i * k, i0 = x | 0, f = x - i0; b[i] = (a[i0] || 0) * (1 - f) + (a[i0 + 1] || 0) * f; } }
  RS.set(buf, m); return m;
}
const SPACES = { outdoor: { wet: .3, far: 1, outdoor: 1 }, room: { wet: .75, far: .35, outdoor: 0 }, hall: { wet: .85, far: .55, outdoor: 0 }, tunnel: { wet: .95, far: .8, outdoor: 0 }, none: { wet: 0, far: 1, outdoor: 1 } };

export class Engine {
  constructor(ctx, baker, opts = {}) {
    this.ctx = ctx; this.B = baker; this.offline = !!opts.offline; this.mobile = !!opts.mobile;
    this.maxVoices = opts.maxVoices || (this.mobile ? 40 : 96); this.maxHrtf = opts.maxHrtf != null ? opts.maxHrtf : this.mobile ? 0 : 20;
    this.voices = []; this.alive = 0; this.pumpT = -1; this.loops = new Map(); this.lastKey = new Map(); this.hrtf = 0; this.tOff = 0;
    this.st = { played: 0, dropped: 0, stolen: 0, peakVoices: 0, culled: 0 };
    this.L = { x: 0, y: 1.6, z: 0, yaw: 0, pitch: 0 };
    this.space = { reverb: 'outdoor', surface: 'concrete', ...SPACES.outdoor };
    this.build();
  }
  build() {
    const c = this.ctx, G = v => { const g = c.createGain(); g.gain.value = v; return g; };
    // the safety limiter is a soft clipper (zero latency): linear to -4.4 dBFS, then a tanh knee that never exceeds 0 dBFS.
    // (Chrome's DynamicsCompressorNode was measured pulling a 0 dBFS gunshot down to -17 dBFS and adds 6 ms of look-ahead.)
    this.out = G(.98); this.out.connect(c.destination);
    this.limiter = c.createWaveShaper(); this.limiter.curve = softClip(); this.limiter.oversample = this.offline ? 'none' : '2x'; this.limiter.connect(this.out);
    this.pre = G(1 / 4); this.pre.connect(this.limiter);
    this.master = G(1); this.master.connect(this.pre);
    this.cam = G(1); this.cam.connect(this.master); this.setStyle(.35);   // body-cam AGC (an explicit duck: no compressor latency)
    this.deafG = G(1); this.deafG.connect(this.cam);
    this.deafLP = c.createBiquadFilter(); this.deafLP.type = 'lowpass'; this.deafLP.frequency.value = 20000; this.deafLP.Q.value = .5; this.deafLP.connect(this.deafG);
    this.world = G(1); this.world.connect(this.deafLP);
    this.ambLP = c.createBiquadFilter(); this.ambLP.type = 'lowpass'; this.ambLP.frequency.value = 20000; this.ambLP.Q.value = .5; this.ambLP.connect(this.world);
    this.bus = { sfx: G(1), amb: G(1), voice: G(1), music: G(1), ui: G(1) };
    this.ambTrim = G(.6); this.bus.sfx.connect(this.world); this.bus.amb.connect(this.ambTrim); this.ambTrim.connect(this.ambLP); this.bus.voice.connect(this.world);
    this.musicDuck = G(1); this.bus.music.connect(this.musicDuck); this.musicDuck.connect(this.master);
    this.uiDuck = G(1); this.bus.ui.connect(this.uiDuck); this.uiDuck.connect(this.master);
    this.revIn = G(1); this.revOut = G(1); this.revOut.connect(this.bus.sfx); this.conv = null;
    this.ringBus = G(1); this.ringBus.connect(this.master);
  }
  now() { return this.ctx.currentTime + this.tOff; }
  // -------------------------------------------------------------- mix controls
  setVolumes(v) {
    const t = this.ctx.currentTime, set = (p, x, tc = .03) => { if (this.offline) p.value = x; else { p.cancelScheduledValues(t); p.setTargetAtTime(x, t, tc); } };
    const curve = x => x <= 0 ? 0 : Math.pow(Math.min(1, x), 1.6);
    if (v.master != null) set(this.master.gain, curve(v.master));
    if (v.sfx != null) { set(this.bus.sfx.gain, curve(v.sfx)); if (v.ambience == null) set(this.bus.amb.gain, curve(v.sfx)); }
    if (v.ambience != null) set(this.bus.amb.gain, curve(v.ambience));
    if (v.music != null) set(this.bus.music.gain, curve(v.music));
    if (v.ui != null) set(this.bus.ui.gain, curve(v.ui));
    if (v.voice != null) set(this.bus.voice.gain, curve(v.voice));
  }
  /** body-cam microphone character: k 0 = transparent .. 1 = heavy AGC pumping after loud shots */
  setStyle(k) { this.style = Math.max(0, Math.min(1, +k || 0)); }
  /** the camera's automatic gain control reacting to a loud sound `level` (0..1) starting at `at` seconds from now: the world
   *  (not the transient itself: the duck starts 12 ms later, like an AGC attack) dips and recovers over a few hundred ms */
  pump(level, at = 0) {
    const k = this.style * Math.max(0, Math.min(1, level)); if (k < .02) return;
    const p = this.cam.gain, t = this.ctx.currentTime + Math.max(0, at) + .012, lo = 1 - Math.min(.6, .6 * k), cur = Math.min(p.value, 1);
    if (cur < lo + .02 && this.pumpT > t - .05) return;
    p.cancelScheduledValues(t); p.setValueAtTime(cur, t); p.linearRampToValueAtTime(Math.min(cur, lo), t + .025); p.setTargetAtTime(1, t + .06, .1 + .3 * this.style);
    this.pumpT = t;
  }
  setSpace(o = {}) {
    const rv = SPACES[o.reverb] ? o.reverb : this.space.reverb, changed = rv !== this.space.reverb || !this.conv;
    this.space = { ...this.space, ...SPACES[rv], reverb: rv, surface: o.surface || this.space.surface };
    const t = this.ctx.currentTime;
    this.ambLP.frequency.setTargetAtTime(this.space.outdoor || this.ambIndoor ? 20000 : 1400, t, .25);
    if (!changed || rv === 'none') { if (rv === 'none' && this.conv) this._dropConv(); return; }
    const want = 'ir:' + rv;
    const apply = () => {
      if (this.space.reverb !== rv) return;
      const v = this.B.get(want); if (!v) return;
      const cv = this.ctx.createConvolver(); cv.normalize = false; cv.buffer = matchRate(v[0], this.ctx);
      const g = this.ctx.createGain(); g.gain.value = 0; this.revIn.connect(cv); cv.connect(g); g.connect(this.revOut);
      const tt = this.ctx.currentTime; if (this.offline) g.gain.value = 1; else g.gain.setTargetAtTime(1, tt, .12);
      this._dropConv(); this.conv = { cv, g, rv };
    };
    if (this.B.has(want)) apply(); else this.B.request([want], true).then(apply);
  }
  _dropConv() {
    const old = this.conv; if (!old) return; this.conv = null;
    const t = this.ctx.currentTime; if (this.offline) old.g.gain.value = 0; else old.g.gain.setTargetAtTime(0, t, .12);
    setTimeout(() => { try { this.revIn.disconnect(old.cv); old.cv.disconnect(); old.g.disconnect(); } catch (e) { /* gone */ } }, 1200);
  }
  setListener(p, yaw = 0, pitch = 0) {
    const L = this.L; L.x = +p.x || 0; L.y = +p.y || 0; L.z = +p.z || 0; L.yaw = +yaw || 0; L.pitch = +pitch || 0;
    const sy = Math.sin(L.yaw), cy = Math.cos(L.yaw), sp = Math.sin(L.pitch), cp = Math.cos(L.pitch);
    const fx = sy * cp, fy = -sp, fz = cy * cp, ux = sy * sp, uy = cp, uz = cy * sp, al = this.ctx.listener;
    // Babylon is left-handed (+Z forward), WebAudio right-handed (-Z forward): flip z
    if (al.positionX) {
      al.positionX.value = L.x; al.positionY.value = L.y; al.positionZ.value = -L.z;
      al.forwardX.value = fx; al.forwardY.value = fy; al.forwardZ.value = -fz; al.upX.value = ux; al.upY.value = uy; al.upZ.value = -uz;
    } else { al.setPosition(L.x, L.y, -L.z); al.setOrientation(fx, fy, -fz, ux, uy, -uz); }
    for (const v of this.loops.values()) if (v.pos && v.alive) this._respatial(v);
  }
  // -------------------------------------------------------------- voices
  /** o: { cls, bus = 'sfx', pos, local, gain = 1, prio, key, maxSame, minGap, send, ref, roll, max, occ, delay, pan, lp, hrtf, loop, id } */
  voice(o) {
    const c = this.ctx, C = CLASS[o.cls || 'world'] || CLASS.world, L = this.L;
    const ref = o.ref || C.ref, roll = o.roll || C.roll, maxD = o.max || C.max, prio = o.prio != null ? o.prio : C.prio;
    let gain = o.gain == null ? 1 : o.gain, d = 0, cut = o.lp || 22000, delay = o.delay || 0, gd = 1;
    const pos = !o.local && o.pos ? o.pos : null;
    if (pos) {
      const dx = pos.x - L.x, dy = (pos.y == null ? L.y : pos.y) - L.y, dz = pos.z - L.z; d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (!(d <= maxD)) { this.st.culled++; return null; }
      gd = distGain(d, ref, roll); gain *= gd; cut = Math.min(cut, airCutoff(d));
      if (!o.nodelay) delay += Math.min(1.6, d / 343);
    }
    const occ = Math.max(0, Math.min(1, +o.occ || 0));
    if (occ) { gain *= 1 - .55 * occ; cut = Math.min(cut, 20000 * Math.pow(700 / 20000, occ)); }
    if (gain < .0012) { this.st.culled++; return null; }
    const now = this.now(), key = o.key || null;
    if (key && o.minGap) { const lt = this.lastKey.get(key); if (lt != null && now - lt < o.minGap) { this.st.dropped++; return null; } }
    const score = prio + Math.log10(Math.max(1e-4, gain));
    if (key) {
      const ms = o.maxSame || C.maxSame || 0;
      if (ms) { let n = 0, old = null; for (const v of this.voices) if (v.key === key && v.alive) { n++; if (!old || v.t0 < old.t0) old = v; } if (n >= ms && old) { this._stop(old, .02); this.st.stolen++; } }
    }
    if (this.alive >= this.maxVoices) {
      let lo = null; for (const v of this.voices) if (v.alive && !v.loop && (!lo || v.score < lo.score)) lo = v;
      if (lo && lo.score < score) { this._stop(lo, .015); this.st.stolen++; } else { this.st.dropped++; return null; }
    }
    if (key) this.lastKey.set(key, now);
    const V = { e: this, key, score, prio, t0: now + delay, end: now + delay, srcs: [], left: 0, alive: true, loop: !!o.loop, pos: pos ? { x: pos.x, y: pos.y == null ? L.y : pos.y, z: pos.z } : null,
      base: gain / gd, gain1: 1, ref, roll, occ, lpBase: o.lp || 22000, hrtfOn: false, send: 0 };
    V.in = c.createGain(); let tail = V.in;
    if (cut < 16000 || pos) { V.f = c.createBiquadFilter(); V.f.type = 'lowpass'; V.f.frequency.value = Math.min(20000, cut); V.f.Q.value = .5; tail.connect(V.f); tail = V.f; }
    V.dg = c.createGain(); V.dg.gain.value = gain; tail.connect(V.dg);
    const bus = this.bus[o.bus || 'sfx'] || this.bus.sfx;
    if (pos) {
      const p = V.pn = c.createPanner(), useH = o.hrtf !== false && this.hrtf < this.maxHrtf && d < 60;
      p.panningModel = useH ? 'HRTF' : 'equalpower'; p.distanceModel = 'linear'; p.refDistance = 1; p.maxDistance = 1e5; p.rolloffFactor = 0;
      if (p.positionX) { p.positionX.value = V.pos.x; p.positionY.value = V.pos.y; p.positionZ.value = -V.pos.z; } else p.setPosition(V.pos.x, V.pos.y, -V.pos.z);
      V.dg.connect(p); p.connect(bus); if (useH) { this.hrtf++; V.hrtfOn = true; }
    } else if (o.pan) { V.sp = c.createStereoPanner(); V.sp.pan.value = Math.max(-1, Math.min(1, o.pan)); V.dg.connect(V.sp); V.sp.connect(bus); }
    else V.dg.connect(bus);
    const sendK = (o.send != null ? o.send : C.send) * this.space.wet;
    if (sendK > 0 && o.bus !== 'ui' && o.bus !== 'music') {
      V.send = sendK; V.sg = c.createGain(); V.sg.gain.value = gain * sendK * Math.min(4, Math.pow(gd, -.45)) * (1 + .8 * occ); tail.connect(V.sg); V.sg.connect(this.revIn);
    }
    this.voices.push(V); this.alive++; this.st.played++; if (this.alive > this.st.peakVoices) this.st.peakVoices = this.alive;
    V.add = (buf, a) => this._add(V, buf, a);
    V.stop = f => this._stop(V, f);
    // a voice whose layers were all missing (not baked yet) would never end: drop it once the caller has had its chance
    queueMicrotask(() => { if (!V.srcs.length && !V.gone) this._dispose(V); });
    return V;
  }
  /** a layer: buf (AudioBuffer), a = { gain, at (s after the voice start), rate, offset, loop, fadeIn } */
  _add(V, buf, a = {}) {
    if (!buf || !V.alive) return null;
    const c = this.ctx, s = c.createBufferSource(); s.buffer = buf;
    const rate = a.rate || 1; if (rate !== 1) s.playbackRate.value = rate;
    let dst = V.in;
    if ((a.gain != null && a.gain !== 1) || a.fadeIn) { const g = c.createGain(); g.gain.value = a.gain == null ? 1 : a.gain; g.connect(V.in); dst = g; s._g = g;
      if (a.fadeIn) { const t = V.t0 + (a.at || 0); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(a.gain == null ? 1 : a.gain, t + a.fadeIn); } }
    s.connect(dst);
    const t = Math.max(c.currentTime, V.t0 + (a.at || 0));
    if (a.loop || V.loop) { s.loop = true; s.start(t, (a.offset || 0) % buf.duration); }
    else { s.start(t, a.offset || 0); V.end = Math.max(V.end, t + (buf.duration - (a.offset || 0)) / rate); }
    V.left++; V.srcs.push(s);
    s.onended = () => { V.left--; if (V.left <= 0) this._dispose(V); };
    return s;
  }
  _stop(V, fade = .03) {
    if (!V || !V.alive) return;
    const t = this.ctx.currentTime;
    if (V.srcs.length === 0) { this._dispose(V); return; }
    try {
      for (const g of [V.dg, V.sg]) if (g) { g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(g.gain.value, t); g.gain.linearRampToValueAtTime(0, t + fade); }
      for (const s of V.srcs) { try { s.stop(t + fade + .01); } catch (e) { /* not started yet or stopped */ } }
    } catch (e) { this._dispose(V); }
    if (V.alive) { V.alive = false; this.alive--; }
  }
  _dispose(V) {
    if (V.gone) return; V.gone = true; if (V.alive) { V.alive = false; this.alive--; }
    const i = this.voices.indexOf(V); if (i >= 0) this.voices.splice(i, 1);
    if (V.hrtfOn) { this.hrtf--; V.hrtfOn = false; }
    for (const n of [V.in, V.f, V.dg, V.sg, V.pn, V.sp]) if (n) try { n.disconnect(); } catch (e) { /* ok */ }
    for (const s of V.srcs) { try { s.disconnect(); if (s._g) s._g.disconnect(); if (s._p) s._p.disconnect(); } catch (e) { /* ok */ } }
    if (V.id != null && this.loops.get(V.id) === V) this.loops.delete(V.id);
  }
  _respatial(V) {
    const L = this.L, dx = V.pos.x - L.x, dy = V.pos.y - L.y, dz = V.pos.z - L.z, d = Math.sqrt(dx * dx + dy * dy + dz * dz), t = this.ctx.currentTime;
    const gd = distGain(d, V.ref, V.roll), g = V.base * V.gain1 * gd * (1 - .55 * V.occ);
    if (this.offline) V.dg.gain.value = g; else V.dg.gain.setTargetAtTime(g, t, .08);
    if (V.sg) { const s = g * V.send * Math.min(4, Math.pow(gd, -.45)); if (this.offline) V.sg.gain.value = s; else V.sg.gain.setTargetAtTime(s, t, .08); }
    if (V.f) { const cut = Math.min(V.lpBase, airCutoff(d), V.occ ? 20000 * Math.pow(700 / 20000, V.occ) : 22000); if (this.offline) V.f.frequency.value = Math.min(20000, cut); else V.f.frequency.setTargetAtTime(Math.min(20000, cut), t, .1); }
  }
  // -------------------------------------------------------------- loops (by id)
  /** start (or move) a positional / flat loop: bufs = AudioBuffer | [AudioBuffer, ...] (several = stereo spread for beds) */
  loop(id, bufs, o = {}) {
    if (this.loops.has(id)) { this.moveLoop(id, o.pos); return this.loops.get(id); }
    if (!bufs) return null;
    const list = Array.isArray(bufs) ? bufs : [bufs];
    // a loop's voice: its gain envelope (fade in / out) lives on V.dg via gain1; distance is refreshed by setListener
    const V = this.voice({ ...o, loop: true, prio: o.prio != null ? o.prio : 9, nodelay: true, gain: o.gain == null ? 1 : o.gain });
    if (!V) return null;
    V.id = id; V.gain1 = 1; V.base = (o.gain == null ? 1 : o.gain);
    const fadeIn = o.fadeIn == null ? .4 : o.fadeIn;
    list.forEach((b, i) => {
      const s = this._add(V, b, { gain: list.length > 1 ? .75 : 1, offset: Math.random() * b.duration, loop: true, fadeIn: fadeIn > 0 ? fadeIn : 0 });
      if (s && list.length > 1) { const p = this.ctx.createStereoPanner(); p.pan.value = i % 2 ? .7 : -.7; s.disconnect(); s.connect(p); p.connect(s._g || V.in); s._p = p; }
    });
    if (o.life) V.lifeTimer = setTimeout(() => this.stopLoop(id, 1), o.life * 1000);
    this.loops.set(id, V);
    return V;
  }
  moveLoop(id, pos) {
    const V = this.loops.get(id); if (!V || !pos || !V.pos) return;
    V.pos.x = pos.x; V.pos.y = pos.y == null ? V.pos.y : pos.y; V.pos.z = pos.z;
    const p = V.pn; if (p) { if (p.positionX) { p.positionX.value = V.pos.x; p.positionY.value = V.pos.y; p.positionZ.value = -V.pos.z; } else p.setPosition(V.pos.x, V.pos.y, -V.pos.z); }
    this._respatial(V);
  }
  stopLoop(id, fade = .8) { const V = this.loops.get(id); if (!V) return; this.loops.delete(id); if (V.lifeTimer) clearTimeout(V.lifeTimer); this._stop(V, fade); }
  // -------------------------------------------------------------- hearing damage
  /** k 0..1: muffle the world (low-pass to ~450 Hz at k = 1, gain -15 dB) and recover over `secs` */
  deafen(secs, k = 1) {
    const t = this.ctx.currentTime, lp = this.deafLP.frequency, g = this.deafG.gain, f0 = 20000 * Math.pow(450 / 20000, k), hold = Math.min(1.2, secs * .25);
    for (const [p, lo, tc] of [[lp, f0, secs / 3.5], [g, 1 - .82 * k, secs / 3], [this.musicDuck.gain, 1 - .9 * k, secs / 2.5], [this.uiDuck.gain, 1 - .5 * k, secs / 3]]) {
      p.cancelScheduledValues(t); p.setValueAtTime(p.value, t); p.linearRampToValueAtTime(lo, t + .015); p.setValueAtTime(lo, t + .015 + hold); p.setTargetAtTime(p === lp ? 20000 : 1, t + .015 + hold, Math.max(.05, tc));
    }
  }
  // -------------------------------------------------------------- housekeeping
  stopAll(fade = .2) { for (const v of this.voices.slice()) this._stop(v, fade); for (const V of this.loops.values()) if (V.lifeTimer) clearTimeout(V.lifeTimer); this.loops.clear(); }
  stats() { return { voices: this.alive, nodes: this.voices.length, loops: this.loops.size, hrtf: this.hrtf, ...this.st }; }
}
