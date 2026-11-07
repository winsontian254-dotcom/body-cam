/* LIVE FIRE — grenade and explosive sounds (pure DSP recipes registered in the bank).
   Exports: BOOM_OF (grenade kind -> explosion size), BODY_OF (kind -> bounce body: heavy | can | soft | stick | bottle)
   Bank names:
     nd:pin nd:spoon nd:throw nd:clacker nd:arm nd:beep nd:stick nd:ping nd:strike nd:pop nd:split nd:decoypop
     nd:bounce:<body>:<hard|metal|wood|soft|water>
     nd:boom:<mini|frag|he|breach|big|conc|bomblet>   close explosion (pressure, blast, debris, fragments, rumble)
     nd:boomfar:<small|frag|big>                     the same from far away (dull thump + rolling thunder), half rate
     nd:flash nd:flash:small                         flashbang (one bang; the Ninefold calls flash:small nine times)
     nd:molotov nd:incend nd:thermite nd:zap nd:emp nd:chaff                       one-shot effects
     loops: nd:hiss (smoke) nd:gas nd:mist (medic) nd:fire nd:sizzle (thermite, flare) nd:fuse (dynamite) nd:buzz (emp) nd:rustle (chaff)
     tin   tinnitus ring texture (used by Audio.tinnitus on top of a live sine pair) */
import { def } from '../bank.js';
import * as D from '../dsp.js';

const j = (R, k) => 1 + (R() * 2 - 1) * k;
function thud(o, sr, at, f, tau, amp, glide = .55) { const s = D.tone(D.len(tau * 6, sr), sr, f, f * glide, { glide: tau * 2.5 }); D.env(s, sr, .0008, tau); D.add(o, s, at, sr, amp); }
function burst(o, sr, R, at, tau, type, f, q, amp, col = 'white', a = .0002) { const b = D.noise(col, D.len(tau * 7 + a, sr), R); D.env(b, sr, a, tau); D.filt(b, sr, type, f, q); D.add(o, b, at, sr, amp); }
const steel = (o, sr, R, at, base, amp, tauK = 1) => D.strike(o, sr, at, R, { modes: [1, 1.59, 2.38, 3.43].map((x, i) => [base * x * j(R, .03), [.022, .016, .011, .008][i] * tauK, i ? .8 / (1 + i * .5) : 1]), amp, click: .5, noise: .45, nf: base * 2.2 });
const polymer = (o, sr, R, at, amp, f = 650) => D.strike(o, sr, at, R, { modes: [[f * j(R, .08), .009, 1], [f * 1.8, .006, .6], [f * 3.1, .004, .35]], amp, click: .35, noise: .6, nf: 1800, nTau: .002 });
function breathe(o, sr, R, at, dur, amp) { const b = D.pink(D.len(dur, sr), R); D.filt(b, sr, 'bandpass', 1100, 2); D.filt(b, sr, 'bandpass', 1900, 1.2); D.envPts(b, sr, [[0, 0], [dur * .2, 1], [dur, 0]]); D.add(o, b, at, sr, amp * 3); }

export const BOOM_OF = { frag: 'frag', he: 'he', impact: 'frag', sticky: 'frag', cluster: 'mini', mini: 'mini', breach: 'breach', satchel: 'big', dynamite: 'big', concussion: 'conc' };
export const FAR_OF = { mini: 'small', frag: 'frag', he: 'frag', breach: 'frag', big: 'big', conc: 'small', bomblet: 'small' };
export const BODY_OF = { frag: 'heavy', he: 'heavy', impact: 'heavy', sticky: 'heavy', cluster: 'heavy', mini: 'heavy', breach: 'soft', satchel: 'soft',
  molotov: 'bottle', flare: 'stick', dynamite: 'stick', flash: 'can', ninebang: 'can', smoke: 'can', smoke_color: 'can', gas: 'can', medic: 'can', emp: 'can',
  chaff: 'can', decoy: 'can', concussion: 'can', stun: 'can', incendiary: 'can', thermite: 'can', sensor: 'can' };

// ------------------------------------------------------------------ handling
def('nd:pin', { dur: .35, vars: 3, lvl: { s50: -27, max: -8 }, tags: ['nade'], gen: (o, sr, R) => {
  D.strike(o, sr, 0, R, { modes: [[2600 * j(R, .05), .03, 1], [4150 * j(R, .05), .02, .7], [6200, .012, .4]], amp: .6, click: .3, noise: .3, nf: 4000 });
  const sq = D.tone(D.len(.07, sr), sr, 3100 * j(R, .08), 4200, { shape: 'saw' }); D.filt(sq, sr, 'bandpass', 4000, 3); D.bell(sq, sr, 0, .03, .07); D.add(o, sq, .025, sr, .12);
  const fr = D.white(D.len(.06, sr), R); D.filt(fr, sr, 'bandpass', 5200, 2); D.bell(fr, sr, 0, .02, .06); D.add(o, fr, .025, sr, .4);
  D.strike(o, sr, .1, R, { modes: [[3300, .04, 1], [5400, .025, .5]], amp: .45, click: .3, noise: .2 });
} });
def('nd:spoon', { dur: .6, vars: 3, lvl: { s50: -25, max: -6 }, tags: ['nade'], gen: (o, sr, R) => {
  D.strike(o, sr, 0, R, { modes: [[1750 * j(R, .06), .06, 1], [3300 * j(R, .05), .04, .7], [5100, .025, .5], [7200, .015, .3]], amp: .8, click: .4, noise: .3, nf: 3500 });
  steel(o, sr, R, .012, 2800, .7, .4); burst(o, sr, R, .013, .002, 'bandpass', 2200, 1, .6);
  burst(o, sr, R, .014, .15, 'highpass', 4200, .7, .1, 'white', .01);
  D.strike(o, sr, .3 + R() * .1, R, { modes: [[1700, .03, 1], [3200, .02, .6]], amp: .25, click: .2, noise: .2 });
} });
def('nd:throw', { dur: .45, vars: 3, lvl: { s50: -26, max: -8 }, tags: ['nade'], gen: (o, sr, R) => {
  const w = D.pink(D.len(.32, sr), R); D.sweep(w, sr, 'bandpass', 450, 1600, 1.2, .18); D.bell(w, sr, 0, .16, .32); D.add(o, w, 0, sr, 1.6);
  const c = D.pink(D.len(.22, sr), R); D.filt(c, sr, 'bandpass', 2400, .8); D.am(c, sr, 40, .7, R); D.bell(c, sr, 0, .08, .22); D.add(o, c, 0, sr, .6);
  breathe(o, sr, R, .05, .22, .35);
} });
def('nd:clacker', { dur: .3, vars: 2, lvl: { s50: -26, max: -8 }, tags: ['nade'], gen: (o, sr, R) => { polymer(o, sr, R, 0, .8, 900); polymer(o, sr, R, .07, 1, 1000); steel(o, sr, R, .072, 3000, .2, .4); } });
def('nd:arm', { dur: .5, vars: 1, lvl: { s50: -26, max: -8 }, tags: ['nade'], gen: (o, sr, R) => { polymer(o, sr, R, 0, .5, 1200); for (const t of [.06, .2]) { const b = D.tone(D.len(.07, sr), sr, 2350, 2350, { shape: 'square' }); D.filt(b, sr, 'bandpass', 2350, 2); D.envPts(b, sr, [[0, 0], [.003, 1], [.06, 1], [.07, 0]]); D.add(o, b, t, sr, .5); } } });
def('nd:beep', { dur: .14, vars: 1, lvl: { s50: -24, max: -8 }, tags: ['nade'], gen: (o, sr, R) => { const b = D.tone(D.len(.07, sr), sr, 2900, 2900, { shape: 'square' }); D.filt(b, sr, 'bandpass', 2900, 2.5); D.envPts(b, sr, [[0, 0], [.002, 1], [.06, 1], [.07, 0]]); D.add(o, b, 0, sr, .5); } });
def('nd:stick', { dur: .3, vars: 3, lvl: { s50: -23, max: -6 }, tags: ['nade'], gen: (o, sr, R) => { thud(o, sr, 0, 190, .015, 1); const s = D.white(D.len(.1, sr), R); D.env(s, sr, .002, .03); D.sweep(s, sr, 'bandpass', 700, 260, 2, .06); D.add(o, s, 0, sr, .8); polymer(o, sr, R, .002, .3, 1400); } });
def('nd:ping', { dur: .7, vars: 1, lvl: { s50: -28, max: -10 }, tags: ['nade'], gen: (o, sr, R) => {
  const a = D.tone(D.len(.6, sr), sr, 1650, 1650, { fm: 12, fmHz: 9 }); D.env(a, sr, .004, .18); D.add(o, a, 0, sr, .5);
  const b = D.tone(D.len(.3, sr), sr, 3300, 3300); D.env(b, sr, .002, .07); D.add(o, b, 0, sr, .15); thud(o, sr, 0, 420, .06, .25, 1);
} });
def('nd:strike', { dur: .9, vars: 2, lvl: { s50: -21, max: -6 }, tags: ['nade'], gen: (o, sr, R) => {
  const s = D.white(D.len(.14, sr), R); D.sweep(s, sr, 'bandpass', 2000, 3600, 2, .12); D.am(s, sr, 120, .7, R); D.bell(s, sr, 0, .06, .14); D.add(o, s, 0, sr, 1.2);
  burst(o, sr, R, .12, .006, 'bandpass', 1600, 1, .8); const f = D.white(D.len(.7, sr), R); D.filt(f, sr, 'highpass', 3000, .7); D.am(f, sr, 25, .4, R); D.envPts(f, sr, [[0, 0], [.15, 1], [.7, .6]]); D.add(o, f, .12, sr, .35);
  D.grains(o, sr, R, { t0: .13, t1: .8, rate: 300, amp: .06, kind: 'click', fLo: 3000, fHi: 9000 });
} });
def('nd:pop', { dur: .35, vars: 3, lvl: { s50: -21, max: -4 }, tags: ['nade'], gen: (o, sr, R) => {
  burst(o, sr, R, 0, .01, 'bandpass', 900 * j(R, .15), .9, 1.2, 'pink', .0005); thud(o, sr, 0, 140, .02, .7); burst(o, sr, R, .004, .08, 'highpass', 2500, .7, .25, 'white', .01);
} });
def('nd:decoypop', { dur: .4, vars: 2, lvl: { s50: -22, max: -4 }, tags: ['nade'], gen: (o, sr, R) => { burst(o, sr, R, 0, .006, 'bandpass', 1500, 1, 1); thud(o, sr, 0, 170, .015, .6); D.grains(o, sr, R, { t0: .01, t1: .25, rate: 80, amp: .1, kind: 'click', fLo: 2000, fHi: 6000 }); } });
def('nd:split', { dur: .8, vars: 2, lvl: { s50: -18, max: -3 }, tags: ['nade'], gen: (o, sr, R) => {
  burst(o, sr, R, 0, .004, 'bandpass', 1400, .9, 1.2); thud(o, sr, 0, 160, .03, .9);
  D.grains(o, sr, R, { t0: .05, t1: .6, rate: 40, rate1: 10, amp: .35, amp1: .1, kind: 'ping', fLo: 1100, fHi: 3400, tauLo: .008, tauHi: .02 });
} });
// bounces: body x surface
const BOUNCE_BODY = {
  heavy: { modes: [[1100, .02, 1], [2300, .012, .6], [3900, .008, .4]], th: [210, .012, .6] },
  can: { modes: [[1700, .04, 1], [3500, .025, .7], [5600, .015, .5]], th: [260, .008, .3], rattle: 1 },
  soft: { modes: [[420, .01, 1], [900, .006, .4]], th: [140, .02, .9] },
  stick: { modes: [[650, .012, 1], [1400, .008, .6], [2600, .005, .3]], th: [220, .01, .5] },
  bottle: { modes: [[880, .04, 1], [1750, .03, .7], [2900, .02, .5]], th: [230, .01, .5] },
};
for (const [b, B] of Object.entries(BOUNCE_BODY)) for (const s of ['hard', 'metal', 'wood', 'soft', 'water']) def('nd:bounce:' + b + ':' + s, { dur: .4, vars: 3, sr: 32000, lvl: { s50: -22, max: -4 }, tags: ['nade'], gen: (o, sr, R) => {
  if (s === 'water') { D.bubble(o, sr, 0, 500 + R() * 300, .02, 2, .6); burst(o, sr, R, 0, .05, 'bandpass', 1500, .8, .8); return; }
  const k = s === 'soft' ? .12 : s === 'wood' ? .5 : s === 'metal' ? 1.3 : 1;
  D.strike(o, sr, 0, R, { modes: B.modes.map(([f, t, a]) => [f * j(R, .06), t * k, a]), amp: s === 'soft' ? .3 : 1, click: s === 'soft' ? .1 : .5, noise: .5, nf: s === 'soft' ? 900 : 2600 });
  thud(o, sr, 0, B.th[0] * j(R, .1), B.th[1], B.th[2] * (s === 'soft' ? 1.4 : 1));
  if (s === 'metal') D.ring(o, sr, 0, [[420, .08, 1], [1050, .05, .6]], .25, R);
  if (s === 'wood') D.ring(o, sr, 0, [[330, .03, 1], [640, .02, .6]], .5, R);
  if (B.rattle && s !== 'soft') D.grains(o, sr, R, { t0: .005, t1: .08, rate: 120, amp: .08, kind: 'ping', fLo: 2500, fHi: 5000, tauLo: .003, tauHi: .008 });
} });

// ------------------------------------------------------------------ explosions
const SIZES = {
  mini:    { T: .004, nTau: .01, low: [62, .09], drive: 3.5, deb: [.1, .9, 40], frags: 6, glass: 0, rum: .5, dur: 2.0, lvl: -8.5 },
  frag:    { T: .007, nTau: .016, low: [52, .12], drive: 4, deb: [.12, 1.6, 70], frags: 12, glass: 0, rum: .8, dur: 2.8, lvl: -6 },
  he:      { T: .009, nTau: .02, low: [48, .14], drive: 4.5, deb: [.1, 1.9, 90], frags: 0, glass: 1, rum: 1, dur: 3.0, lvl: -5.5 },
  breach:  { T: .006, nTau: .014, low: [58, .1], drive: 4, deb: [.05, 1.4, 140], frags: 0, glass: 0, wood: 1, rum: .7, dur: 2.4, lvl: -6 },
  big:     { T: .013, nTau: .03, low: [40, .2], drive: 5, deb: [.15, 2.6, 110], frags: 0, glass: 1, rum: 1.3, dur: 3.6, lvl: -4.5 },
  conc:    { T: .012, nTau: .012, low: [38, .2], drive: 4.5, deb: [.1, .6, 15], frags: 0, glass: 0, rum: 1, dur: 2.4, lvl: -6 },
  bomblet: { T: .0035, nTau: .008, low: [70, .07], drive: 3.5, deb: [.08, .6, 30], frags: 3, glass: 0, rum: .4, dur: 1.4, lvl: -10 },
};
function zip(o, sr, R, at, amp) { const d = .05 + R() * .1, n = D.white(D.len(d, sr), R); D.sweep(n, sr, 'bandpass', 2500 + R() * 3500, 900 + R() * 700, 4, d); D.bell(n, sr, 0, d * .3, d); D.add(o, n, at, sr, amp); }
function boom(o, sr, R, S) {
  const T = S.T * j(R, .12), p = D.friedlander(D.len(T * 10, sr), sr, T, 1.3); D.lp1(p, sr, 4500); D.addAt(o, p, 0, 1);
  const b = D.white(D.len(S.nTau * 8, sr), R); D.env(b, sr, .0002, S.nTau * j(R, .15)); D.sweep(b, sr, 'lowpass', 11000, 1400, .6, .12); D.addAt(o, b, 0, .9);
  const m = D.white(D.len(.4, sr), R); D.env(m, sr, .001, .06); D.filt(m, sr, 'bandpass', 420 * j(R, .15), .8); D.addAt(o, m, 0, 2.6);
  const h = D.white(D.len(.25, sr), R); D.env(h, sr, .0006, .03); D.filt(h, sr, 'bandpass', 1300 * j(R, .15), .8); D.addAt(o, h, 0, 1.6);
  thud(o, sr, 0, S.low[0] * j(R, .08), Math.min(S.low[1], 1.2 / S.low[0]), .6, .5);
  const pk = D.peakOf(o); D.scale(o, 1 / pk); D.shape(o, S.drive, .08); D.scale(o, 1 / Math.max(1e-6, D.peakOf(o))); D.shape(o, 2);
  D.delayAdd(o, sr, .006 + R() * .006, .35, 2500);
  // rumble that rolls on
  const rb = D.brown(D.len(S.dur, sr), R); D.env(rb, sr, .02, S.dur * .22); D.filt(rb, sr, 'lowpass', 220, .7); D.am(rb, sr, 6, .5, R); D.addAt(o, rb, 0, .18 * S.rum);
  const rl = D.pink(D.len(S.dur, sr), R); D.env(rl, sr, .03, S.dur * .14); D.filt(rl, sr, 'lowpass', 900, .7); D.am(rl, sr, 9, .6, R); D.add(o, rl, .02, sr, .12 * S.rum);
  // debris: stones, earth and bits raining down; dirt patter
  const [d0, d1, dr] = S.deb;
  D.grains(o, sr, R, { t0: d0, t1: d1, rate: dr * .5, rate1: 2, amp: .1, amp1: .02, kind: 'ping', fLo: 1200, fHi: 5200, tauLo: .0015, tauHi: .005 });
  D.grains(o, sr, R, { t0: d0 * .8, t1: d1 * .8, rate: dr * 4, rate1: 8, amp: .1, amp1: .015, kind: 'noise', fLo: 500, fHi: 4000, tauLo: .002, tauHi: .006 });
  const dirt = D.pink(D.len(d1, sr), R); D.filt(dirt, sr, 'bandpass', 2400, .6); D.envPts(dirt, sr, [[0, 0], [d0, 0], [d0 + .15, 1], [d1, 0]]); D.add(o, dirt, 0, sr, .05);
  for (let i = 0; i < S.frags; i++) zip(o, sr, R, .004 + R() * .07, .18 + R() * .2);
  if (S.glass) D.grains(o, sr, R, { t0: .18, t1: 1.6, rate: 60, rate1: 3, amp: .1, amp1: .02, kind: 'ping', fLo: 2600, fHi: 9000, tauLo: .01, tauHi: .05 });
  if (S.wood) D.grains(o, sr, R, { t0: .02, t1: .9, rate: 90, rate1: 5, amp: .18, amp1: .03, kind: 'ping', fLo: 350, fHi: 1400, tauLo: .006, tauHi: .02 });
  D.dcblock(o, sr);
}
function boomFar(o, sr, R, k) {
  const T = .02 * k * j(R, .15), p = D.friedlander(D.len(T * 8, sr), sr, T, 1.2); D.lp1(p, sr, 700); D.addAt(o, p, 0, 1);
  thud(o, sr, 0, 45 / Math.sqrt(k), .12 * k, .8, .5);
  const L = 2.4 * Math.sqrt(k);
  for (let i = 0; i < 10; i++) { const t = .08 + L * .75 * Math.pow(R(), 1.4), a = (.2 + .5 * R()) * Math.exp(-t / (L * .35)), e = D.brown(D.len(.7, sr), R); D.env(e, sr, .01 + .04 * R(), .1 + .2 * R()); D.filt(e, sr, 'lowpass', 250 + 500 * Math.exp(-t), .7); D.add(o, e, t, sr, a * 2); }
  const rb = D.brown(o.length, R); D.env(rb, sr, .05, L * .3); D.filt(rb, sr, 'lowpass', 180, .7); D.addAt(o, rb, 0, .5);
  D.dcblock(o, sr);
}
for (const [k, S] of Object.entries(SIZES)) def('nd:boom:' + k, { dur: S.dur, vars: k === 'big' ? 2 : 3, sr: 32000, lvl: { s50: S.lvl, max: -.3 }, tags: ['nade', 'boom'], gen: (o, sr, R) => boom(o, sr, R, S) });
for (const [k, s] of Object.entries({ small: .6, frag: 1, big: 1.6 })) def('nd:boomfar:' + k, { dur: 2.6 * Math.sqrt(s) + .4, vars: 2, sr: 'half', lvl: { s50: -11, max: -1 }, tags: ['nade', 'boom'], gen: (o, sr, R) => boomFar(o, sr, R, s) });
function flash(o, sr, R, k) {
  const T = .0011 * j(R, .1), p = D.friedlander(D.len(T * 10, sr), sr, T, 1.4); D.addAt(o, p, 0, 1);
  const b = D.white(D.len(.06, sr), R); D.env(b, sr, .00005, .0035); D.filt(b, sr, 'bandpass', 2200, .5); D.addAt(o, b, 0, 1.6);
  const m = D.white(D.len(.12, sr), R); D.env(m, sr, .0002, .014); D.filt(m, sr, 'bandpass', 900, .8); D.addAt(o, m, 0, 2);
  thud(o, sr, 0, 120, .008, .4);
  const pk = D.peakOf(o); D.scale(o, 1 / pk); D.shape(o, 5, .05);
  D.delayAdd(o, sr, .004, .4, 4000);
  D.ring(o, sr, .002, [[1400 * j(R, .05), .05, 1], [2950, .035, .7], [4800, .02, .5]], .05 * k, R);
  const t = D.pink(D.len(.5, sr), R); D.env(t, sr, .002, .06); D.filt(t, sr, 'lowpass', 2500, .7); D.add(o, t, .002, sr, .1);
  D.filt(o, sr, 'highpass', 140, .7); D.filt(o, sr, 'lowpass', 11000, .7); D.dcblock(o, sr);
}
def('nd:flash', { dur: .7, vars: 3, lvl: { s50: -13, max: -.3 }, tags: ['nade', 'boom'], gen: (o, sr, R) => flash(o, sr, R, 1) });
def('nd:flash:small', { dur: .45, vars: 4, lvl: { s50: -16, max: -1 }, tags: ['nade', 'boom'], gen: (o, sr, R) => flash(o, sr, R, .5) });

// ------------------------------------------------------------------ effect one-shots
function glassBreak(o, sr, R, at, amp, thick = 1) {
  burst(o, sr, R, at, .0015, 'highpass', 2400, .7, amp * 1.1);
  D.ring(o, sr, at, [[880 * thick, .03, 1], [1750, .02, .6]], .3 * amp, R);
  D.grains(o, sr, R, { t0: at + .002, t1: at + .7, rate: 220, rate1: 8, amp: .4 * amp, amp1: .05 * amp, kind: 'ping', fLo: 1800 / thick, fHi: 8500, tauLo: .008, tauHi: .04 });
}
def('nd:molotov', { dur: 1.8, vars: 3, sr: 32000, lvl: { s50: -14, max: -1 }, tags: ['nade'], gen: (o, sr, R) => {
  glassBreak(o, sr, R, 0, 1, 1.2);
  burst(o, sr, R, .005, .12, 'bandpass', 900, .8, .6, 'pink', .01); for (let i = 0; i < 6; i++) D.bubble(o, sr, .01 + R() * .15, 300 + R() * 700, .01 + R() * .02, 1.5, .1);
  const w = D.pink(D.len(1.2, sr), R); D.sweep(w, sr, 'lowpass', 180, 1500, .8, .25); D.envPts(w, sr, [[0, 0], [.12, 1], [.5, .45], [1.2, 0]]); D.add(o, w, .06, sr, 1.4);
  thud(o, sr, .07, 62, .22, .55, .6);
  D.grains(o, sr, R, { t0: .3, t1: 1.6, rate: 25, amp: .12, kind: 'click', fLo: 1500, fHi: 6000 });
} });
def('nd:incend', { dur: 1.6, vars: 2, sr: 32000, lvl: { s50: -14, max: -1 }, tags: ['nade'], gen: (o, sr, R) => {
  burst(o, sr, R, 0, .004, 'bandpass', 1500, .9, 1); thud(o, sr, 0, 130, .03, .7);
  const f = D.white(D.len(1.4, sr), R); D.filt(f, sr, 'highpass', 2500, .7); D.am(f, sr, 30, .5, R); D.envPts(f, sr, [[0, 0], [.08, 1], [.6, .7], [1.4, 0]]); D.add(o, f, .02, sr, .45);
  D.grains(o, sr, R, { t0: .02, t1: 1.3, rate: 900, rate1: 200, amp: .08, kind: 'click', fLo: 3500, fHi: 10000 });
  const w = D.pink(D.len(1, sr), R); D.sweep(w, sr, 'lowpass', 200, 1300, .8, .2); D.envPts(w, sr, [[0, 0], [.1, 1], [1, 0]]); D.add(o, w, .04, sr, 1.1);
} });
def('nd:thermite', { dur: 1.3, vars: 2, sr: 32000, lvl: { s50: -15, max: -2 }, tags: ['nade'], gen: (o, sr, R) => {
  burst(o, sr, R, 0, .003, 'bandpass', 2000, .9, .8); const f = D.white(D.len(1.2, sr), R); D.filt(f, sr, 'highpass', 1800, .7); D.am(f, sr, 45, .6, R); D.envPts(f, sr, [[0, 0], [.05, 1], [1.2, .5]]); D.add(o, f, 0, sr, .6);
  D.grains(o, sr, R, { t0: 0, t1: 1.2, rate: 1600, amp: .1, kind: 'click', fLo: 3000, fHi: 11000 }); D.grains(o, sr, R, { t0: .05, t1: 1.2, rate: 12, amp: .5, kind: 'noise', fLo: 600, fHi: 2000, tauLo: .004, tauHi: .01 });
} });
function arc(o, sr, R, at, amp) {
  burst(o, sr, R, at, .0008, 'highpass', 2000, .7, amp);
  const d = .03 + R() * .06, z = D.tone(D.len(d, sr), sr, 110 + R() * 90, 100 + R() * 80, { shape: 'saw', fm: 40, fmHz: 300 + R() * 400 }); D.shape(z, 3); D.filt(z, sr, 'bandpass', 1300, .8); D.envPts(z, sr, [[0, 1], [d * .7, .7], [d, 0]]); D.add(o, z, at, sr, amp * .5);
  D.grains(o, sr, R, { t0: at, t1: at + d, rate: 1500, amp: amp * .12, kind: 'click', fLo: 3000, fHi: 10000 });
}
def('nd:zap', { dur: 1.8, vars: 3, sr: 32000, lvl: { s50: -15, max: -2 }, tags: ['nade'], gen: (o, sr, R) => {
  burst(o, sr, R, 0, .003, 'bandpass', 1800, .9, 1); thud(o, sr, 0, 150, .02, .6); let t = .01;
  while (t < 1.5) { arc(o, sr, R, t, .9 * Math.exp(-t * 1.1)); t += .03 + R() * .12 * (1 + t); }
} });
def('nd:emp', { dur: 2.2, vars: 2, sr: 32000, lvl: { s50: -13, max: -1 }, tags: ['nade'], gen: (o, sr, R) => {
  thud(o, sr, 0, 56, .32, 1, .5); burst(o, sr, R, 0, .006, 'bandpass', 900, .8, .7, 'pink', .001);
  const w = D.tone(D.len(1.1, sr), sr, 3600, 160, { glide: .9, fm: 300, fmHz: 82 }); D.env(w, sr, .01, .35); D.add(o, w, .01, sr, .3);
  for (let t = 0; t < .9; t += .04 + R() * .1) arc(o, sr, R, t, .5 * Math.exp(-t * 2));
  const hm = D.tone(D.len(1.6, sr), sr, 100, 100, { shape: 'saw' }); D.filt(hm, sr, 'lowpass', 1200, .7); D.envPts(hm, sr, [[0, 0], [.2, .4], [1.6, 0]]); D.add(o, hm, .3, sr, .12);
} });
def('nd:chaff', { dur: 2.2, vars: 2, sr: 32000, lvl: { s50: -17, max: -2 }, tags: ['nade'], gen: (o, sr, R) => {
  burst(o, sr, R, 0, .005, 'bandpass', 1100, .9, 1.1); thud(o, sr, 0, 120, .03, .8);
  D.grains(o, sr, R, { t0: .01, t1: 2, rate: 700, rate1: 20, amp: .1, amp1: .02, kind: 'click', fLo: 4500, fHi: 13000 });
  const w = D.pink(D.len(1.5, sr), R); D.filt(w, sr, 'highpass', 3000, .7); D.am(w, sr, 20, .7, R); D.envPts(w, sr, [[0, 0], [.05, 1], [1.5, 0]]); D.add(o, w, .01, sr, .3);
} });

// ------------------------------------------------------------------ loops (positional; the engine fades them in and out)
def('nd:hiss', { dur: 4, loop: .6, vars: 1, sr: 32000, lvl: { rms: -22, max: -3 }, tags: ['nade', 'loop'], gen: (o, sr, R) => {
  const n = D.white(o.length, R); D.filt(n, sr, 'bandpass', 2700, .55); D.filt(n, sr, 'highpass', 700, .7); D.am(n, sr, 13, .3, R); D.am(n, sr, 2.5, .25, R); D.addAt(o, n, 0, 1);
  D.grains(o, sr, R, { rate: 7, amp: .5, kind: 'noise', fLo: 900, fHi: 2600, tauLo: .01, tauHi: .03 });
} });
def('nd:gas', { dur: 4, loop: .6, vars: 1, sr: 32000, lvl: { rms: -24, max: -3 }, tags: ['nade', 'loop'], gen: (o, sr, R) => {
  const n = D.white(o.length, R); D.filt(n, sr, 'bandpass', 1900, .6); D.am(n, sr, 9, .4, R); D.addAt(o, n, 0, 1);
  D.grains(o, sr, R, { rate: 16, amp: .9, kind: 'noise', fLo: 700, fHi: 2200, tauLo: .006, tauHi: .02 });
} });
def('nd:mist', { dur: 4, loop: .6, vars: 1, sr: 32000, lvl: { rms: -30, max: -8 }, tags: ['nade', 'loop'], gen: (o, sr, R) => { const n = D.white(o.length, R); D.filt(n, sr, 'bandpass', 4200, .5); D.am(n, sr, 4, .3, R); D.addAt(o, n, 0, 1); } });
def('nd:fire', { dur: 6, loop: .8, vars: 1, sr: 32000, lvl: { rms: -21, max: -3 }, tags: ['nade', 'loop'], gen: (o, sr, R) => {
  const r = D.brown(o.length, R); D.filt(r, sr, 'lowpass', 650, .7); D.am(r, sr, 4, .55, R); D.am(r, sr, 11, .3, R); D.addAt(o, r, 0, 1.2);
  const p = D.pink(o.length, R); D.filt(p, sr, 'bandpass', 420, .7); D.am(p, sr, 7, .6, R); D.addAt(o, p, 0, .5);
  D.grains(o, sr, R, { rate: 35, amp: .5, ampVar: .9, kind: 'click', fLo: 1200, fHi: 6500 });
  D.grains(o, sr, R, { rate: 4, amp: .8, ampVar: .8, kind: 'noise', fLo: 250, fHi: 900, tauLo: .004, tauHi: .012 });
} });
def('nd:sizzle', { dur: 3, loop: .5, vars: 1, sr: 32000, lvl: { rms: -23, max: -4 }, tags: ['nade', 'loop'], gen: (o, sr, R) => {
  D.grains(o, sr, R, { rate: 2400, amp: .2, ampVar: .9, kind: 'click', fLo: 2800, fHi: 11000 });
  const h = D.white(o.length, R); D.filt(h, sr, 'highpass', 4500, .7); D.am(h, sr, 16, .6, R); D.addAt(o, h, 0, .25);
  D.grains(o, sr, R, { rate: 9, amp: .5, kind: 'noise', fLo: 900, fHi: 2500, tauLo: .003, tauHi: .01 });
} });
def('nd:fuse', { dur: 2, loop: .4, vars: 1, sr: 32000, lvl: { rms: -27, max: -6 }, tags: ['nade', 'loop'], gen: (o, sr, R) => {
  D.grains(o, sr, R, { rate: 900, amp: .25, ampVar: .9, kind: 'click', fLo: 3000, fHi: 10000 });
  const h = D.white(o.length, R); D.filt(h, sr, 'bandpass', 5500, 1); D.am(h, sr, 22, .7, R); D.addAt(o, h, 0, .2);
  D.grains(o, sr, R, { rate: 6, amp: .6, kind: 'click', fLo: 1500, fHi: 4000 });
} });
def('nd:buzz', { dur: 3, loop: .5, vars: 1, sr: 32000, lvl: { rms: -27, max: -6 }, tags: ['nade', 'loop'], gen: (o, sr, R) => {
  const h = D.tone(o.length, sr, 100, 100, { shape: 'saw', fm: 2, fmHz: .7 }); D.filt(h, sr, 'lowpass', 1600, .7); D.am(h, sr, 6, .5, R); D.addAt(o, h, 0, .5);
  const h2 = D.tone(o.length, sr, 300.5, 300.5, { shape: 'square' }); D.filt(h2, sr, 'bandpass', 1200, 1.5); D.am(h2, sr, 3, .7, R); D.addAt(o, h2, 0, .15);
  D.grains(o, sr, R, { rate: 25, amp: .4, kind: 'click', fLo: 2000, fHi: 8000 });
} });
def('nd:rustle', { dur: 3, loop: .5, vars: 1, sr: 32000, lvl: { rms: -33, max: -10 }, tags: ['nade', 'loop'], gen: (o, sr, R) => {
  D.grains(o, sr, R, { rate: 220, amp: .2, ampVar: .9, kind: 'click', fLo: 4500, fHi: 12000 }); const h = D.white(o.length, R); D.filt(h, sr, 'highpass', 6000, .7); D.am(h, sr, 3, .6, R); D.addAt(o, h, 0, .05);
} });
// tinnitus texture: narrow band noise around 4 kHz (Audio.tinnitus adds two detuned sines on top)
def('tin', { dur: 3, loop: .5, vars: 1, sr: 32000, lvl: { rms: -30, max: -10 }, tags: ['loop'], gen: (o, sr, R) => { const n = D.white(o.length, R); D.filt(n, sr, 'bandpass', 3900, 12); D.filt(n, sr, 'bandpass', 3900, 6); D.am(n, sr, 2, .3, R); D.addAt(o, n, 0, 1); } });
