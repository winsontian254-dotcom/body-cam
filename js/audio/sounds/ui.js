/* LIVE FIRE — interface sounds, stingers, radio chatter and miscellaneous world sounds (pure DSP recipes registered in the bank).
   Style: tactile and military (switch clicks, radio squelch, low drums, muted brass), never arcade bleeps.
   Bank names:
     ui:<hover click back buy deny tick round win lose unlock reward notify open close type countdown equip mvp>
     radio:<name>     squelch + band-limited, unintelligible "voice" (syllable pattern seeded by the name) + squelch tail (lazy)
     sfx:<bomb_beep bomb_key bomb_planted bomb_defuse bomb_defused gate_open gate_close door_open door_close pickup drop armor glass
          heartbeat scope_in scope_out light zip>  */
import { def, lazy } from '../bank.js';
import * as D from '../dsp.js';

const j = (R, k) => 1 + (R() * 2 - 1) * k;
const UI = ['ui'];
function thud(o, sr, at, f, tau, amp, glide = .55) { const s = D.tone(D.len(tau * 6, sr), sr, f, f * glide, { glide: tau * 2.5 }); D.env(s, sr, .0008, tau); D.add(o, s, at, sr, amp); }
function burst(o, sr, R, at, tau, type, f, q, amp, col = 'white', a = .0002) { const b = D.noise(col, D.len(tau * 7 + a, sr), R); D.env(b, sr, a, tau); D.filt(b, sr, type, f, q); D.add(o, b, at, sr, amp); }
const polymer = (o, sr, R, at, amp, f = 650) => D.strike(o, sr, at, R, { modes: [[f * j(R, .05), .009, 1], [f * 1.8, .006, .6], [f * 3.1, .004, .35]], amp, click: .35, noise: .6, nf: 1800, nTau: .002 });
const steel = (o, sr, R, at, base, amp, tauK = 1) => D.strike(o, sr, at, R, { modes: [1, 1.59, 2.38, 3.43].map((x, i) => [base * x, [.022, .016, .011, .008][i] * tauK, i ? .8 / (1 + i * .5) : 1]), amp, click: .5, noise: .45, nf: base * 2.2 });
function cloth(o, sr, R, at, dur, amp, f = 2200) { const b = D.pink(D.len(dur, sr), R); D.filt(b, sr, 'bandpass', f, .8); D.am(b, sr, 40, .7, R); D.bell(b, sr, 0, dur * .4, dur); D.add(o, b, at, sr, amp * 1.6); }
/** phase-modulation bell / soft mallet: index decays with tauI */
function fm(o, sr, at, f, dur, amp, ratio = 2, idx = 1.5, tau = .3, tauI = .1, a = .003) {
  const n = D.len(dur, sr), b = new Float32Array(n), kI = Math.exp(-1 / (tauI * sr)), kA = Math.exp(-1 / (tau * sr)); let I = idx, g = 1;
  for (let i = 0; i < n; i++) { const t = i / sr; I *= kI; g *= kA; b[i] = Math.sin(D.TAU * f * t + I * Math.sin(D.TAU * f * ratio * t)) * g * Math.min(1, t / a); }
  D.add(o, b, at, sr, amp);
}
/** muted brass / string section chord: detuned saws, a slow swell and a low-pass that opens with it */
function section(o, sr, R, at, notes, dur, amp, { att = .25, open = [500, 2400], close = 0, bend = 0 } = {}) {
  const n = D.len(dur, sr), mix = new Float32Array(n);
  for (const f of notes) for (const dt of [-.004, .004]) { const s = D.tone(n, sr, f * (1 + dt), f * (1 + dt) * (bend ? Math.pow(2, bend / 12) : 1), { shape: 'saw', glide: dur, vib: .002, vibHz: 4.5 + D.rng(f)() }); D.addAt(mix, s, 0, 1 / notes.length); }
  D.sweep(mix, sr, 'lowpass', open[0], open[1], .9, att * 2.2); if (close) D.sweep(mix, sr, 'lowpass', 1e5, close, .7, dur);
  D.envPts(mix, sr, [[0, 0], [att, 1], [dur * .55, .8], [dur, 0]]); D.add(o, mix, at, sr, amp);
}
function drum(o, sr, R, at, f, amp, tau = .35) { thud(o, sr, at, f, tau, amp, .7); burst(o, sr, R, at, .03, 'lowpass', 700, .7, amp * .5, 'pink', .001); burst(o, sr, R, at, .002, 'bandpass', 1800, .8, amp * .25); }
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
function squelch(o, sr, R, at, open) {
  polymer(o, sr, R, at, .25, 1300);
  const b = D.white(D.len(open ? .05 : .14, sr), R); D.filt(b, sr, 'bandpass', 2100, .7); D.envPts(b, sr, open ? [[0, 1], [.05, 0]] : [[0, .2], [.02, 1], [.14, 0]]); D.add(o, b, at + .002, sr, open ? .25 : .45);
}

// ------------------------------------------------------------------ interface
def('ui:hover', { dur: .05, vars: 3, lvl: { s50: -36, max: -18 }, tags: UI, crit: true, gen: (o, sr, R) => { D.ring(o, sr, 0, [[2900 * j(R, .03), .003, 1], [5600, .002, .4]], 1, R); burst(o, sr, R, 0, .0004, 'highpass', 3000, .7, .3); } });
def('ui:click', { dur: .12, vars: 3, lvl: { s50: -25, max: -8 }, tags: UI, crit: true, gen: (o, sr, R) => {
  polymer(o, sr, R, 0, 1, 1650); steel(o, sr, R, .001, 3900, .25, .4); polymer(o, sr, R, .045 + R() * .01, .45, 1900); } });
def('ui:back', { dur: .14, vars: 2, lvl: { s50: -27, max: -10 }, tags: UI, crit: true, gen: (o, sr, R) => { polymer(o, sr, R, 0, .8, 950); thud(o, sr, 0, 300, .02, .35, .7); polymer(o, sr, R, .04, .3, 1100); } });
def('ui:buy', { dur: .45, vars: 2, lvl: { s50: -22, max: -6 }, tags: UI, crit: true, gen: (o, sr, R) => {
  cloth(o, sr, R, 0, .2, .5); steel(o, sr, R, .1, 1500, .8, 1.1); steel(o, sr, R, .19, 1350, 1, 1.2); thud(o, sr, .19, 250, .01, .35); D.ring(o, sr, .3, [[3200, .03, 1], [6400, .015, .3]], .12, R); } });
def('ui:deny', { dur: .3, vars: 1, lvl: { s50: -24, max: -8 }, tags: UI, crit: true, gen: (o, sr, R) => {
  for (const t of [0, .12]) { const b = D.tone(D.len(.08, sr), sr, 155, 150, { shape: 'square' }); D.filt(b, sr, 'lowpass', 900, .7); D.envPts(b, sr, [[0, 0], [.004, 1], [.07, .8], [.08, 0]]); D.add(o, b, t, sr, .5); polymer(o, sr, R, t, .2, 700); } } });
def('ui:tick', { dur: .06, vars: 2, lvl: { s50: -27, max: -10 }, tags: UI, crit: true, gen: (o, sr, R) => { D.ring(o, sr, 0, [[3800, .006, 1], [7300, .003, .4]], 1, R); burst(o, sr, R, 0, .0005, 'highpass', 2500, .7, .5); } });
def('ui:countdown', { dur: .16, vars: 1, lvl: { s50: -24, max: -8 }, tags: UI, gen: (o, sr, R) => { const b = D.tone(D.len(.11, sr), sr, 1046, 1046, { shape: 'tri' }); D.envPts(b, sr, [[0, 0], [.003, 1], [.09, .8], [.11, 0]]); D.add(o, b, 0, sr, .5); } });
def('ui:type', { dur: .04, vars: 3, lvl: { s50: -35, max: -18 }, tags: UI, gen: (o, sr, R) => polymer(o, sr, R, 0, 1, 2200 * j(R, .1)) });
def('ui:open', { dur: .3, vars: 2, lvl: { s50: -31, max: -14 }, tags: UI, gen: (o, sr, R) => { const b = D.pink(D.len(.25, sr), R); D.sweep(b, sr, 'bandpass', 600, 2400, 1.2, .2); D.bell(b, sr, 0, .12, .25); D.add(o, b, 0, sr, 1); polymer(o, sr, R, .2, .3, 1400); } });
def('ui:close', { dur: .3, vars: 2, lvl: { s50: -32, max: -14 }, tags: UI, gen: (o, sr, R) => { const b = D.pink(D.len(.22, sr), R); D.sweep(b, sr, 'bandpass', 2200, 600, 1.2, .2); D.bell(b, sr, 0, .08, .22); D.add(o, b, 0, sr, 1); polymer(o, sr, R, .17, .3, 900); } });
def('ui:equip', { dur: .4, vars: 2, lvl: { s50: -24, max: -8 }, tags: UI, gen: (o, sr, R) => { cloth(o, sr, R, 0, .15, .4); steel(o, sr, R, .12, 1300, 1, 1.2); thud(o, sr, .12, 240, .012, .4); } });
def('ui:notify', { dur: .7, vars: 1, lvl: { s50: -27, max: -10 }, tags: UI, gen: (o, sr, R) => { fm(o, sr, 0, mtof(81), .6, .5, 2, 1, .25, .05); fm(o, sr, .09, mtof(86), .6, .45, 2, 1, .3, .05); } });
def('ui:round', { dur: 1.2, vars: 1, lvl: { s50: -20, max: -4 }, tags: UI, crit: true, gen: (o, sr, R) => {
  squelch(o, sr, R, 0, true); drum(o, sr, R, .03, 62, 1, .5);
  for (const [t, f] of [[.09, 1250], [.17, 1660]]) { const b = D.tone(D.len(.07, sr), sr, f, f, { shape: 'sine' }); D.envPts(b, sr, [[0, 0], [.004, 1], [.06, .9], [.07, 0]]); D.add(o, b, t, sr, .22); }
  const n = D.white(D.len(.5, sr), R); D.filt(n, sr, 'bandpass', 2000, .6); D.envPts(n, sr, [[0, 0], [.02, .3], [.5, 0]]); D.add(o, n, .05, sr, .05); squelch(o, sr, R, .3, false);
} });
def('ui:win', { dur: 3.4, vars: 1, sr: 'half', lvl: { s50: -18, max: -3 }, tags: UI, gen: (o, sr, R) => {
  drum(o, sr, R, 0, 58, 1, .6); drum(o, sr, R, .2, 65, .5, .4);
  section(o, sr, R, .02, [38, 45, 50, 54, 57].map(mtof), 3.2, .9, { att: .5, open: [300, 2600] });
  section(o, sr, R, .45, [62, 66, 69].map(mtof), 2.6, .35, { att: .4, open: [700, 3200] });
  fm(o, sr, .5, mtof(81), 2.4, .08, 3.01, 1.2, .9, .2, .05);
} });
def('ui:lose', { dur: 3.4, vars: 1, sr: 'half', lvl: { s50: -19, max: -3 }, tags: UI, gen: (o, sr, R) => {
  drum(o, sr, R, 0, 52, 1, .7);
  section(o, sr, R, .02, [38, 45, 50, 53, 57].map(mtof), 3.2, .9, { att: .6, open: [250, 1500], close: 300, bend: -1 });
  section(o, sr, R, .6, [62, 65].map(mtof), 2.4, .25, { att: .5, open: [400, 1200], close: 400, bend: -2 });
} });
def('ui:unlock', { dur: 1.4, vars: 1, lvl: { s50: -21, max: -4 }, tags: UI, gen: (o, sr, R) => {
  steel(o, sr, R, 0, 1100, 1, 1.4); thud(o, sr, 0, 180, .03, .6);
  [74, 78, 81, 86].forEach((m, i) => fm(o, sr, .12 + i * .09, mtof(m), 1.1, .22, 2.005, .9, .45, .08));
  const s = D.white(D.len(.9, sr), R); D.filt(s, sr, 'highpass', 7000, .7); D.envPts(s, sr, [[0, 0], [.3, 1], [.9, 0]]); D.add(o, s, .2, sr, .03);
} });
def('ui:reward', { dur: 2.6, vars: 1, sr: 'half', lvl: { s50: -18, max: -3 }, tags: UI, gen: (o, sr, R) => {
  drum(o, sr, R, 0, 70, .8, .45);
  [[0, 57], [.16, 62], [.32, 66], [.5, 69]].forEach(([t, m], i) => section(o, sr, R, t, [mtof(m), mtof(m - 12)], i === 3 ? 1.9 : .5, .45, { att: .05, open: [600, 2800] }));
  [81, 86, 90].forEach((m, i) => fm(o, sr, .5 + i * .07, mtof(m), 1.6, .07, 3, 1, .6, .1));
} });
def('ui:mvp', { dur: 2.2, vars: 1, sr: 'half', lvl: { s50: -19, max: -3 }, tags: UI, gen: (o, sr, R) => { drum(o, sr, R, 0, 60, 1, .5); drum(o, sr, R, .25, 60, .6, .4); section(o, sr, R, .05, [43, 50, 55, 59, 62].map(mtof), 2, .8, { att: .3, open: [400, 3000] }); } });

// ------------------------------------------------------------------ radio chatter (lazy, one per name)
const VOW = [[700, 1200, 2500], [400, 2000, 2600], [320, 900, 2300], [550, 1700, 2500], [650, 1080, 2650]];
function babble(o, sr, R, at, n, pitch) {
  let t = at;
  for (let s = 0; s < n; s++) {
    const d = .07 + R() * .1, V = VOW[Math.floor(R() * VOW.length)], f0 = pitch * (1 + (R() - .4) * .25);
    const src = D.tone(D.len(d, sr), sr, f0, f0 * (.85 + R() * .3), { shape: 'saw', vib: .03, vibHz: 7 }); const nz = D.pink(src.length, R); for (let i = 0; i < src.length; i++) src[i] = src[i] * .8 + nz[i] * .25;
    const out = new Float32Array(src.length); V.forEach((f, k) => { const b = src.slice(); D.filt(b, sr, 'bandpass', f * j(R, .08), 6 - k * 1.5); D.addAt(out, b, 0, [1, .7, .35][k] * 3); });
    D.envPts(out, sr, [[0, 0], [.012, 1], [d * .7, .8], [d, 0]]); D.add(o, out, t, sr, .7);
    if (R() < .5) burst(o, sr, R, t + d, .012, 'bandpass', 3000 + R() * 2000, 1.5, .25, 'white', .003);   // a consonant
    t += d + (R() < .2 ? .06 + R() * .08 : .015);
  }
  return t;
}
lazy('radio:', name => ({ dur: 2.2, vars: 1, sr: 24000, lvl: { s50: -21, max: -4 }, tags: ['radio'], gen: (o, sr, R) => {
  const key = name.slice(6), n = Math.max(2, Math.min(9, 2 + Math.round(key.length / 2.5)));
  squelch(o, sr, R, 0, true); const end = babble(o, sr, R, .06, n, 105 + (D.hashStr(key) % 40));
  const bed = D.white(D.len(end + .1, sr), R); D.filt(bed, sr, 'bandpass', 1800, .5); D.addAt(o, bed, 0, .025);
  squelch(o, sr, R, Math.min(end + .03, 1.95), false);
  D.filt(o, sr, 'highpass', 350, .9); D.filt(o, sr, 'lowpass', 3200, .9); D.shape(o, 2.5); D.filt(o, sr, 'peaking', 1600, 1, 4);
} }));

// ------------------------------------------------------------------ misc world / objective sounds
const S = ['sfx'];
const beep = (o, sr, at, f, d, amp, shape = 'square') => { const b = D.tone(D.len(d, sr), sr, f, f, { shape }); D.filt(b, sr, 'bandpass', f, 2.5); D.envPts(b, sr, [[0, 0], [.002, 1], [d - .006, 1], [d, 0]]); D.add(o, b, at, sr, amp); };
def('sfx:bomb_beep', { dur: .1, vars: 1, lvl: { s50: -21, max: -6 }, tags: S, gen: (o, sr) => beep(o, sr, 0, 2650, .07, .5) });
def('sfx:bomb_key', { dur: .1, vars: 3, lvl: { s50: -26, max: -8 }, tags: S, gen: (o, sr, R) => { polymer(o, sr, R, 0, .4, 1500); beep(o, sr, .005, 3150 * j(R, .05), .045, .4, 'sine'); } });
def('sfx:bomb_planted', { dur: .9, vars: 1, lvl: { s50: -20, max: -5 }, tags: S, gen: (o, sr, R) => { [0, .14, .28].forEach((t, i) => beep(o, sr, t, 1800 + i * 450, .09, .5)); steel(o, sr, R, .45, 2600, .5, .5); polymer(o, sr, R, .45, .4, 900); } });
def('sfx:bomb_defuse', { dur: .5, vars: 3, lvl: { s50: -27, max: -8 }, tags: S, gen: (o, sr, R) => { steel(o, sr, R, 0, 2400, .6, .6); const f = D.white(D.len(.15, sr), R); D.sweep(f, sr, 'bandpass', 2500, 4000, 3, .12); D.bell(f, sr, 0, .05, .15); D.add(o, f, .05, sr, .3); steel(o, sr, R, .2, 3000, .8, .5); polymer(o, sr, R, .3, .3, 1000); } });
def('sfx:bomb_defused', { dur: .8, vars: 1, lvl: { s50: -21, max: -6 }, tags: S, gen: (o, sr, R) => { [0, .12].forEach((t, i) => beep(o, sr, t, 2300 - i * 700, .1, .5)); steel(o, sr, R, .3, 2200, .6, .6); } });
function shutter(o, sr, R, dur, closing) {
  const m = D.tone(D.len(dur, sr), sr, 52, 52, { shape: 'saw', fm: 1.5, fmHz: .5 }); D.filt(m, sr, 'lowpass', 400, .8); D.envPts(m, sr, [[0, 0], [.2, 1], [dur - .3, 1], [dur, 0]]); D.add(o, m, 0, sr, .35);
  D.grains(o, sr, R, { t0: .15, t1: dur - .15, rate: 55, amp: .35, ampVar: .6, kind: 'ping', fLo: 550, fHi: 2600, tauLo: .006, tauHi: .03 });
  const r = D.pink(D.len(dur, sr), R); D.filt(r, sr, 'bandpass', 900, .7); D.am(r, sr, 18, .5, R); D.envPts(r, sr, [[0, 0], [.2, 1], [dur - .2, 1], [dur, 0]]); D.add(o, r, 0, sr, .5);
  steel(o, sr, R, 0, 700, 1, 2); thud(o, sr, 0, 120, .04, .7);
  steel(o, sr, R, dur - .05, 650, closing ? 1.4 : .9, 2.2); thud(o, sr, dur - .05, 100, .06, closing ? 1.2 : .7);
}
def('sfx:gate_open', { dur: 3.2, vars: 1, sr: 32000, lvl: { s50: -17, max: -3 }, tags: S, gen: (o, sr, R) => shutter(o, sr, R, 2.9, false) });
def('sfx:gate_close', { dur: 3.2, vars: 1, sr: 32000, lvl: { s50: -17, max: -3 }, tags: S, gen: (o, sr, R) => shutter(o, sr, R, 2.9, true) });
function creak(o, sr, R, at, d, amp) { const c = D.tone(D.len(d, sr), sr, 210 * j(R, .2), 330 * j(R, .2), { shape: 'saw', vib: .05, vibHz: 18 + R() * 12 }); D.filt(c, sr, 'bandpass', 1100, 2.5); D.am(c, sr, 30, .6, R); D.bell(c, sr, 0, d * .4, d); D.add(o, c, at, sr, amp); }
def('sfx:door_open', { dur: 1, vars: 2, lvl: { s50: -22, max: -6 }, tags: S, gen: (o, sr, R) => { steel(o, sr, R, 0, 1900, .7, .7); creak(o, sr, R, .08, .6, .25); thud(o, sr, .05, 140, .03, .3); } });
def('sfx:door_close', { dur: .9, vars: 2, lvl: { s50: -19, max: -4 }, tags: S, gen: (o, sr, R) => { creak(o, sr, R, 0, .3, .15); thud(o, sr, .3, 95, .06, 1); D.ring(o, sr, .3, [[160, .06, 1], [310, .04, .6]], .6, R); steel(o, sr, R, .31, 1900, .7, .7); } });
def('sfx:pickup', { dur: .4, vars: 2, lvl: { s50: -24, max: -8 }, tags: S, gen: (o, sr, R) => { cloth(o, sr, R, 0, .2, .5); steel(o, sr, R, .12, 1450, .9, 1.1); polymer(o, sr, R, .13, .4, 520); } });
def('sfx:drop', { dur: .6, vars: 3, lvl: { s50: -21, max: -5 }, tags: S, gen: (o, sr, R) => { thud(o, sr, 0, 140, .03, .8); steel(o, sr, R, 0, 1200, .9, 1.4); polymer(o, sr, R, .01, .6, 480); steel(o, sr, R, .12 + R() * .05, 1300, .4, 1.2); polymer(o, sr, R, .2, .3, 520); } });
def('sfx:armor', { dur: .8, vars: 2, lvl: { s50: -22, max: -6 }, tags: S, gen: (o, sr, R) => {
  for (const t of [0, .3]) { const v = D.white(D.len(.18, sr), R); D.filt(v, sr, 'bandpass', 3000, .8); D.am(v, sr, 140, .9, R); D.bell(v, sr, 0, .03, .18); D.add(o, v, t, sr, .5); }
  thud(o, sr, .55, 110, .04, .8); polymer(o, sr, R, .56, .4, 500);
} });
def('sfx:glass', { dur: 2, vars: 3, sr: 32000, lvl: { s50: -14, max: -1 }, tags: S, gen: (o, sr, R) => {
  burst(o, sr, R, 0, .002, 'highpass', 1800, .7, 1.2); D.ring(o, sr, 0, [[650, .04, 1], [1300, .03, .7], [2200, .02, .5]], .4, R);
  D.grains(o, sr, R, { t0: .005, t1: 1.8, rate: 300, rate1: 6, amp: .45, amp1: .06, kind: 'ping', fLo: 1600, fHi: 9500, tauLo: .01, tauHi: .06 });
  D.grains(o, sr, R, { t0: .25, t1: 1.4, rate: 30, rate1: 4, amp: .35, kind: 'noise', fLo: 2500, fHi: 6000, tauLo: .004, tauHi: .01 });
} });
def('sfx:heartbeat', { dur: .9, vars: 1, lvl: { s50: -22, max: -6 }, tags: S, gen: (o, sr) => { thud(o, sr, 0, 55, .05, 1, .7); thud(o, sr, .22, 50, .06, .7, .7); D.lp1(o, sr, 300); } });
def('sfx:scope_in', { dur: .3, vars: 2, lvl: { s50: -30, max: -12 }, tags: S, gen: (o, sr, R) => { cloth(o, sr, R, 0, .15, .5, 2600); polymer(o, sr, R, .1, .3, 900); steel(o, sr, R, .11, 3200, .2, .4); } });
def('sfx:scope_out', { dur: .25, vars: 2, lvl: { s50: -32, max: -12 }, tags: S, gen: (o, sr, R) => { cloth(o, sr, R, 0, .14, .5, 2000); } });
def('sfx:light', { dur: .08, vars: 2, lvl: { s50: -32, max: -12 }, tags: S, gen: (o, sr, R) => { polymer(o, sr, R, 0, 1, 1800); steel(o, sr, R, .002, 3500, .3, .3); } });
def('sfx:zip', { dur: .5, vars: 2, lvl: { s50: -24, max: -8 }, tags: S, gen: (o, sr, R) => { D.grains(o, sr, R, { t0: 0, t1: .35, rate: 110, amp: .5, kind: 'click', fLo: 1500, fHi: 3500 }); cloth(o, sr, R, 0, .4, .3); } });
