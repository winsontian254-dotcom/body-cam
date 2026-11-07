/* LIVE FIRE — generated menu / lobby music: a restrained, moody ambient score (live WebAudio synthesis, scheduled ahead on
   the audio clock). No arpeggios, no bright leads: slow detuned string-like pads in D minor through a moving low-pass, a sub
   an octave below, sparse soft FM bell notes in a long dark hall, and (lobby / tension) a muted low pulse and a ticking clock.
   Exports: class Music
     new Music(engine)   set(mood: 'menu' | 'lobby' | 'tension' | 'none')   stop()   tick() (scheduler step; called by its own timer,
     or by tests on an offline engine)   active (mood) */
import { matchRate } from './engine.js';
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
const MOODS = {
  menu: { dur: 8, chords: [[38, 45, 53, 60, 64], [34, 41, 50, 57, 60], [41, 48, 57, 64, 67], [43, 50, 58, 65, 69], [38, 45, 53, 57, 62], [33, 40, 50, 55, 57]],
    cut: [480, 1000], bells: .5, pulse: 0, tick: 0, level: .9, scale: [62, 65, 67, 69, 72, 74, 77] },
  lobby: { dur: 6, chords: [[38, 45, 50, 53, 57], [34, 41, 46, 50, 53], [36, 43, 48, 51, 55], [33, 40, 45, 48, 52]],
    cut: [360, 700], bells: .25, pulse: 1.6, tick: .8, level: .85, scale: [62, 65, 67, 69, 72] },
  tension: { dur: 4, chords: [[38, 45, 51, 57], [38, 44, 50, 56]], cut: [300, 620], bells: 0, pulse: .8, tick: .5, level: .8, scale: [] },
};

export class Music {
  constructor(E) {
    this.E = E; const c = E.ctx; this.c = c; this.mood = 'none'; this.cfg = null; this.timer = null; this.i = 0; this.nextT = 0; this.beatT = 0; this.tickT = 0;
    this.out = c.createGain(); this.out.gain.value = 1; this.out.connect(E.bus.music);
    this.dry = c.createGain(); this.dry.gain.value = .75; this.dry.connect(this.out);
    this.wetIn = c.createGain(); this.wetIn.gain.value = .55; this.conv = null;
    this.lite = !!E.mobile; this.live = new Set();   // scheduled notes: { srcs, g } (released on a mood change)
  }
  _track(srcs, g) { const n = { srcs, g }; this.live.add(n); srcs[0].addEventListener('ended', () => this.live.delete(n)); }
  _release(fade = 1.4) {
    const t = this.c.currentTime;
    for (const n of this.live) { try { n.g.gain.cancelScheduledValues(t); n.g.gain.setValueAtTime(n.g.gain.value, t); n.g.gain.linearRampToValueAtTime(0, t + fade); for (const s of n.srcs) s.stop(t + fade + .05); } catch (e) { /* not started yet: stop() before start is fine */ } }
    this.live.clear();
  }
  _verb() {
    if (this.conv || this.verbReq) return; this.verbReq = true;
    const go = () => { const v = this.E.B.get('ir:music'); if (!v) return; const cv = this.c.createConvolver(); cv.normalize = false; cv.buffer = matchRate(v[0], this.c); this.wetIn.connect(cv); cv.connect(this.out); this.conv = cv; };
    if (this.E.B.has('ir:music')) go(); else this.E.B.request(['ir:music'], true).then(go);
  }
  set(mood) {
    mood = MOODS[mood] ? mood : 'none';
    if (mood === this.mood) return;
    const t = this.c.currentTime;
    // let what is playing release under the new mood
    this.out.gain.cancelScheduledValues(t); this.out.gain.setValueAtTime(this.out.gain.value, t);
    if (mood === 'none') { this.out.gain.setTargetAtTime(0, t, .8); this.mood = 'none'; this.cfg = null; this._timer(false); this._release(2.5); return; }
    this._release(1.6);
    this.out.gain.setTargetAtTime(MOODS[mood].level, t, .6);
    this.mood = mood; this.cfg = MOODS[mood]; this.i = 0; this.nextT = t + .15; this.beatT = t + .5; this.tickT = t + .25;
    this._verb(); this.tick(); this._timer(true);
  }
  _timer(on) {
    if (this.E.offline) return;
    if (on && !this.timer) this.timer = setInterval(() => { try { this.tick(); } catch (e) { /* never break the page */ } }, 200);
    if (!on && this.timer) { clearInterval(this.timer); this.timer = null; }
  }
  stop() { this.set('none'); }
  tick(horizon) {
    const C = this.cfg; if (!C) return;
    const ahead = horizon != null ? horizon : this.c.currentTime + 1.2;
    while (this.nextT < ahead) { this._chord(this.nextT, C.chords[this.i % C.chords.length], C); this.nextT += C.dur; this.i++; }
    if (C.pulse) while (this.beatT < ahead) { this._pulse(this.beatT, (Math.round(this.beatT / C.pulse) % 4) === 0 ? 1 : .55); this.beatT += C.pulse; }
    if (C.tick) while (this.tickT < ahead) { this._click(this.tickT); this.tickT += C.tick; }
  }
  _chord(t, notes, C) {
    const len = C.dur + 3.5;
    notes.forEach((m, k) => this._pad(t + k * .12, mtof(m), len, k === 0 ? .045 : .03, C.cut));
    const root = notes[0] - 12; if (mtof(root) > 27) this._sub(t, mtof(root), len, .06);
    if (C.bells && Math.random() < C.bells && C.scale.length) {
      const n = 2 + Math.floor(Math.random() * 3); let tt = t + 1.5 + Math.random() * 2;
      for (let k = 0; k < n; k++) { this._bell(tt, mtof(C.scale[Math.floor(Math.random() * C.scale.length)]), .022 + Math.random() * .012); tt += .7 + Math.random() * 1.6; }
    }
  }
  _pad(t, f, len, gain, cut) {
    const c = this.c, g = c.createGain(), lp = c.createBiquadFilter(), oscs = [];
    lp.type = 'lowpass'; lp.Q.value = .6;
    lp.frequency.setValueAtTime(cut[0], t); lp.frequency.linearRampToValueAtTime(cut[1], t + len * .45); lp.frequency.linearRampToValueAtTime(cut[0] * .9, t + len);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 2.8); g.gain.setValueAtTime(gain, t + len - 3.5); g.gain.linearRampToValueAtTime(0, t + len);
    for (const det of this.lite ? [0] : [-6, 6]) { const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = det + (Math.random() - .5) * 3; o.connect(lp); o.start(t); o.stop(t + len + .05); oscs.push(o); }
    lp.connect(g); g.connect(this.dry); g.connect(this.wetIn);
    oscs[0].onended = () => { try { lp.disconnect(); g.disconnect(); } catch (e) { /* ok */ } }; this._track(oscs, g);
  }
  _sub(t, f, len, gain) {
    const c = this.c, o = c.createOscillator(), g = c.createGain(); o.frequency.value = f;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 3); g.gain.setValueAtTime(gain, t + len - 3.5); g.gain.linearRampToValueAtTime(0, t + len);
    o.connect(g); g.connect(this.dry); o.start(t); o.stop(t + len + .05); o.onended = () => { try { g.disconnect(); } catch (e) { /* ok */ } }; this._track([o], g);
  }
  _bell(t, f, gain) {
    const c = this.c, car = c.createOscillator(), mod = c.createOscillator(), mg = c.createGain(), g = c.createGain(), d = 3.2;
    car.frequency.value = f; mod.frequency.value = f * 2; mg.gain.setValueAtTime(f * 1.1, t); mg.gain.exponentialRampToValueAtTime(f * .02, t + 1.2);
    mod.connect(mg); mg.connect(car.frequency);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + .01); g.gain.exponentialRampToValueAtTime(.0001, t + d);
    car.connect(g); g.connect(this.wetIn); g.connect(this.dry);
    car.start(t); mod.start(t); car.stop(t + d + .05); mod.stop(t + d + .05);
    car.onended = () => { try { mg.disconnect(); g.disconnect(); } catch (e) { /* ok */ } }; this._track([car, mod], g);
  }
  _pulse(t, k) {
    const c = this.c, o = c.createOscillator(), g = c.createGain(); o.frequency.setValueAtTime(62, t); o.frequency.exponentialRampToValueAtTime(38, t + .25);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.16 * k, t + .006); g.gain.exponentialRampToValueAtTime(.0001, t + .5);
    o.connect(g); g.connect(this.dry); g.connect(this.wetIn); o.start(t); o.stop(t + .55); o.onended = () => { try { g.disconnect(); } catch (e) { /* ok */ } };
  }
  _click(t) {
    const c = this.c, o = c.createOscillator(), g = c.createGain(), f = c.createBiquadFilter(); o.type = 'square'; o.frequency.value = 2100;
    f.type = 'bandpass'; f.frequency.value = 3200; f.Q.value = 4;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.012, t + .001); g.gain.exponentialRampToValueAtTime(.0001, t + .03);
    o.connect(f); f.connect(g); g.connect(this.dry); g.connect(this.wetIn); o.start(t); o.stop(t + .04); o.onended = () => { try { f.disconnect(); g.disconnect(); } catch (e) { /* ok */ } };
  }
  get active() { return this.mood; }
}
