/* LIVE FIRE — ambience: looping beds and one-shot events (pure DSP recipes registered in the bank). js/audio/ambience.js
   decides which beds and events each map type uses.
   Bank names:
     amb:<layer>  seamless loops (2 decorrelated variants: the engine plays one left, one right):
                  wind wind_desert wind_snow storm_wind rain rain_roof harbor_water waves hvac hum city metro refinery crickets
                  birds ship_engine mall room club dam_water forest server hangar crowd
     ev:<name>    events placed around the listener: gull crane horn buoy siren carpass honk thunder steam clank drip chime ding
                  monitor train owl bird creak buzzer hammer drill heli jet bell gust door */
import { def } from '../bank.js';
import * as D from '../dsp.js';

const j = (R, k) => 1 + (R() * 2 - 1) * k;
const A = ['amb'];
function lay(name, dur, rms, gen, sr = 'half') { def('amb:' + name, { dur, loop: 1.2, vars: 2, sr, lvl: { rms, max: -3 }, tags: A, gen }); }
function thud(o, sr, at, f, tau, amp, glide = .55) { const s = D.tone(D.len(tau * 6, sr), sr, f, f * glide, { glide: tau * 2.5 }); D.env(s, sr, .0008, tau); D.add(o, s, at, sr, amp); }
function burst(o, sr, R, at, tau, type, f, q, amp, col = 'white', a = .0002) { const b = D.noise(col, D.len(tau * 7 + a, sr), R); D.env(b, sr, a, tau); D.filt(b, sr, type, f, q); D.add(o, b, at, sr, amp); }
function fm(o, sr, at, f, dur, amp, ratio = 2, idx = 1.5, tau = .3, tauI = .1) {
  const n = D.len(dur, sr), b = new Float32Array(n), kI = Math.exp(-1 / (tauI * sr)), kA = Math.exp(-1 / (tau * sr)); let I = idx, g = 1;
  for (let i = 0; i < n; i++) { const t = i / sr; I *= kI; g *= kA; b[i] = Math.sin(D.TAU * f * t + I * Math.sin(D.TAU * f * ratio * t)) * g * Math.min(1, t / .004); }
  D.add(o, b, at, sr, amp);
}
function band(n, R, sr, type, f, q, col = 'pink') { const b = D.noise(col, n, R); D.filt(b, sr, type, f, q); return b; }

// ------------------------------------------------------------------ beds
lay('wind', 11, -30, (o, sr, R) => { const b = band(o.length, R, sr, 'bandpass', 520, .6); D.am(b, sr, .35, .75, R); D.am(b, sr, 2, .25, R); D.addAt(o, b, 0, 1);
  const w = band(o.length, R, sr, 'bandpass', 1150 * j(R, .2), 9, 'white'); D.am(w, sr, .5, .9, R); D.addAt(o, w, 0, .3); });
lay('wind_desert', 11, -30, (o, sr, R) => { const b = band(o.length, R, sr, 'bandpass', 650, .6); D.am(b, sr, .3, .8, R); D.addAt(o, b, 0, 1);
  const s = band(o.length, R, sr, 'highpass', 3200, .7, 'white'); D.am(s, sr, .3, .9, R); D.addAt(o, s, 0, .25); D.grains(o, sr, R, { rate: 300, amp: .02, kind: 'click', fLo: 4000, fHi: 10000 }); });
lay('wind_snow', 11, -31, (o, sr, R) => { const b = band(o.length, R, sr, 'bandpass', 800, .7); D.am(b, sr, .25, .8, R); D.addAt(o, b, 0, .8);
  for (const f of [1500, 2300]) { const w = band(o.length, R, sr, 'bandpass', f * j(R, .1), 14, 'white'); D.am(w, sr, .4, .95, R); D.addAt(o, w, 0, .35); } });
lay('storm_wind', 10, -25, (o, sr, R) => { const b = band(o.length, R, sr, 'lowpass', 500, .7, 'brown'); D.am(b, sr, .4, .6, R); D.addAt(o, b, 0, 1.2);
  const g = band(o.length, R, sr, 'bandpass', 900, .5); D.am(g, sr, .6, .9, R); D.addAt(o, g, 0, .8); const w = band(o.length, R, sr, 'bandpass', 1700, 10, 'white'); D.am(w, sr, .7, .95, R); D.addAt(o, w, 0, .3); });
lay('rain', 9, -26, (o, sr, R) => { const b = band(o.length, R, sr, 'highpass', 700, .7); D.filt(b, sr, 'lowpass', 9000, .7); D.am(b, sr, 1.5, .15, R); D.addAt(o, b, 0, .5);
  D.grains(o, sr, R, { rate: 2600, amp: .14, ampVar: .95, kind: 'click', fLo: 2000, fHi: 10000 });
  D.grains(o, sr, R, { rate: 40, amp: .25, ampVar: .9, kind: 'ping', fLo: 900, fHi: 3800, tauLo: .002, tauHi: .006 }); });
lay('rain_roof', 9, -30, (o, sr, R) => { const b = band(o.length, R, sr, 'lowpass', 1100, .7); D.addAt(o, b, 0, .6);
  D.grains(o, sr, R, { rate: 900, amp: .2, ampVar: .9, kind: 'ping', fLo: 180, fHi: 700, tauLo: .002, tauHi: .006 }); D.grains(o, sr, R, { rate: 6, amp: .5, kind: 'ping', fLo: 1000, fHi: 2500, tauLo: .004, tauHi: .01 }); });
lay('harbor_water', 12, -30, (o, sr, R) => { const b = band(o.length, R, sr, 'lowpass', 520, .7, 'brown'); D.am(b, sr, .28, .85, R); D.addAt(o, b, 0, 1);
  const s = band(o.length, R, sr, 'bandpass', 1300, .8); D.am(s, sr, .28, .95, R); D.addAt(o, s, 0, .35);
  for (let t = .3; t < o.length / sr - .3; t += .2 + R() * .9) D.bubble(o, sr, t, 250 + R() * 600, .02 + R() * .04, .8, .12 + R() * .15);
  D.grains(o, sr, R, { rate: 5, amp: .5, kind: 'noise', fLo: 400, fHi: 1400, tauLo: .01, tauHi: .04 }); });
lay('waves', 12, -26, (o, sr, R) => { const n = o.length, b = band(n, R, sr, 'lowpass', 1600, .7);
  const per = 5 + R() * 2; for (let i = 0; i < n; i++) { const t = i / sr, ph = (t % per) / per; b[i] *= .25 + .75 * Math.pow(Math.sin(Math.PI * Math.min(1, ph * 1.4)), 3); } D.addAt(o, b, 0, 1);
  const r = band(n, R, sr, 'lowpass', 220, .7, 'brown'); D.am(r, sr, .2, .5, R); D.addAt(o, r, 0, .8); });
lay('hvac', 10, -36, (o, sr, R) => { const b = band(o.length, R, sr, 'lowpass', 1400, .7); D.filt(b, sr, 'highpass', 90, .7); D.am(b, sr, .2, .1, R); D.addAt(o, b, 0, 1);
  for (const [f, a] of [[60, .25], [120, .12], [180, .05]]) D.addAt(o, D.tone(o.length, sr, f, f), 0, a);
  const h = band(o.length, R, sr, 'highpass', 3500, .7, 'white'); D.addAt(o, h, 0, .08); });
lay('hum', 10, -38, (o, sr, R) => { for (const [f, a] of [[50, .5], [100, .35], [150, .12], [250, .05]]) D.addAt(o, D.tone(o.length, sr, f, f), 0, a);
  const z = D.tone(o.length, sr, 100, 100, { shape: 'saw' }); D.filt(z, sr, 'bandpass', 2200, 2); D.am(z, sr, 1, .6, R); D.addAt(o, z, 0, .05);
  const b = band(o.length, R, sr, 'lowpass', 900, .7); D.addAt(o, b, 0, .3); });
lay('city', 12, -30, (o, sr, R) => { const b = band(o.length, R, sr, 'lowpass', 420, .7, 'brown'); D.am(b, sr, .12, .5, R); D.addAt(o, b, 0, 1);
  const p = band(o.length, R, sr, 'lowpass', 1300, .7); D.am(p, sr, .18, .6, R); D.addAt(o, p, 0, .35); });
lay('metro', 12, -32, (o, sr, R) => { const b = band(o.length, R, sr, 'lowpass', 160, .7, 'brown'); D.am(b, sr, .1, .6, R); D.addAt(o, b, 0, 1.2);
  D.addAt(o, D.tone(o.length, sr, 50, 50), 0, .2); const a = band(o.length, R, sr, 'bandpass', 320, .8); D.addAt(o, a, 0, .25); });
lay('refinery', 11, -28, (o, sr, R) => { const d = D.tone(o.length, sr, 41, 41, { shape: 'saw', fm: .3, fmHz: .2 }); D.filt(d, sr, 'lowpass', 300, .7); D.addAt(o, d, 0, .4);
  const r = band(o.length, R, sr, 'lowpass', 650, .7, 'brown'); D.am(r, sr, 5, .35, R); D.addAt(o, r, 0, .8); const h = band(o.length, R, sr, 'highpass', 2200, .7, 'white'); D.am(h, sr, .3, .4, R); D.addAt(o, h, 0, .12); });
lay('crickets', 10, -32, (o, sr, R) => {
  for (let c = 0; c < 9; c++) {
    const f = 4300 + R() * 1200, rate = 16 + R() * 14, chirp = .12 + R() * .2, gap = .25 + R() * .9, amp = .1 + R() * .25; let t = R() * 2;
    while (t < o.length / sr - .4) { for (let k = 0; k < Math.round(chirp * rate); k++) { const s = D.tone(D.len(.02, sr), sr, f, f * 1.01); D.env(s, sr, .001, .005); D.add(o, s, t + k / rate, sr, amp); } t += chirp + gap * (.7 + R() * .6); }
  }
  const g = band(o.length, R, sr, 'bandpass', 600, .6); D.am(g, sr, .3, .6, R); D.addAt(o, g, 0, .15); }, 32000);
function tweet(o, sr, R, at, amp) { const n = 2 + Math.floor(R() * 4), f = 2600 + R() * 2600; for (let k = 0; k < n; k++) { const d = .04 + R() * .08, s = D.tone(D.len(d, sr), sr, f * j(R, .15), f * (.7 + R() * .7), { glide: d }); D.bell(s, sr, 0, d * .3, d); D.add(o, s, at + k * (d + .02), sr, amp); } }
lay('birds', 12, -36, (o, sr, R) => { for (let t = .2; t < o.length / sr - .6; t += .4 + R() * 2.2) tweet(o, sr, R, t, .2 + R() * .4); const g = band(o.length, R, sr, 'bandpass', 700, .6); D.am(g, sr, .3, .5, R); D.addAt(o, g, 0, .08); }, 32000);
lay('ship_engine', 10, -27, (o, sr, R) => { const n = o.length, e = new Float32Array(n), fire = 7.3;
  for (let t = 0; t < n / sr; t += 1 / fire) thud(e, sr, t, 46 * j(R, .03), .05, .8 + R() * .2, .8); D.addAt(o, e, 0, 1);
  const h = D.tone(n, sr, 29.2, 29.2, { shape: 'saw' }); D.filt(h, sr, 'lowpass', 180, .7); D.addAt(o, h, 0, .4);
  D.grains(o, sr, R, { rate: 30, amp: .06, kind: 'ping', fLo: 900, fHi: 3000, tauLo: .002, tauHi: .006 }); const b = band(n, R, sr, 'lowpass', 900, .7); D.addAt(o, b, 0, .2); }, 16000);
lay('mall', 11, -36, (o, sr, R) => { const b = band(o.length, R, sr, 'lowpass', 2000, .7); D.filt(b, sr, 'highpass', 100, .7); D.addAt(o, b, 0, .7);
  const e = D.tone(o.length, sr, 60, 60, { shape: 'saw' }); D.filt(e, sr, 'lowpass', 250, .7); D.addAt(o, e, 0, .15);
  const c = band(o.length, R, sr, 'bandpass', 700, 1.2); D.am(c, sr, 5, .7, R); D.addAt(o, c, 0, .12); });
lay('room', 8, -44, (o, sr, R) => { const b = band(o.length, R, sr, 'lowpass', 600, .7); D.filt(b, sr, 'highpass', 50, .7); D.addAt(o, b, 0, 1); }, 16000);
lay('club', 7.742, -31, (o, sr, R) => {   // 124 bpm, 4 bars: the loop length is exactly the pattern, so the crossfade is seamless
  const beat = 60 / 124, n = o.length, notes = [43.65, 43.65, 49, 38.89];
  for (let b = 0; b < 20; b++) { const t = b * beat; if (t * sr >= n) break; thud(o, sr, t, 58, .09, 1, .5); if (b % 2) burst(o, sr, R, t, .03, 'lowpass', 400, .7, .3, 'pink', .002);
    const s = D.tone(D.len(beat * .9, sr), sr, notes[Math.floor(b / 4) % 4], notes[Math.floor(b / 4) % 4], { shape: 'saw' }); D.filt(s, sr, 'lowpass', 160, .9); D.envPts(s, sr, [[0, 0], [.01, 1], [beat * .8, .7], [beat * .9, 0]]); D.add(o, s, t + beat / 2, sr, .35); }
  D.lp1(o, sr, 260); }, 16000);
lay('dam_water', 10, -26, (o, sr, R) => { const b = band(o.length, R, sr, 'lowpass', 2800, .7, 'white'); D.am(b, sr, 1.2, .2, R); D.addAt(o, b, 0, .6); const r = band(o.length, R, sr, 'lowpass', 300, .7, 'brown'); D.addAt(o, r, 0, 1); });
lay('forest', 12, -34, (o, sr, R) => { const b = band(o.length, R, sr, 'highpass', 1500, .7); D.filt(b, sr, 'lowpass', 6000, .7); D.am(b, sr, .2, .8, R); D.addAt(o, b, 0, 1); });
lay('server', 10, -34, (o, sr, R) => { const b = band(o.length, R, sr, 'bandpass', 1500, .5); D.addAt(o, b, 0, 1); D.addAt(o, D.tone(o.length, sr, 2410, 2410), 0, .015); D.addAt(o, D.tone(o.length, sr, 120, 120), 0, .2); });
lay('hangar', 12, -33, (o, sr, R) => { const b = band(o.length, R, sr, 'lowpass', 900, .7); D.am(b, sr, .15, .5, R); D.addAt(o, b, 0, 1);
  const w = D.tone(o.length, sr, 3300, 3360, { fm: 15, fmHz: .1 }); D.am(w, sr, .2, .7, R); D.addAt(o, w, 0, .02); });
lay('crowd', 12, -36, (o, sr, R) => { for (let k = 0; k < 6; k++) { const v = band(o.length, R, sr, 'bandpass', 450 + R() * 900, 3); D.am(v, sr, 5 + R() * 3, .9, R); D.am(v, sr, .4, .6, R); D.addAt(o, v, 0, .5); } D.lp1(o, sr, 1800); });

// ------------------------------------------------------------------ events (positional one-shots)
function ev(name, dur, s50, gen, sr = 'half', vars = 3) { def('ev:' + name, { dur, vars, sr, lvl: { s50, max: -2 }, tags: ['ev'], gen }); }
function voiced(o, sr, R, at, d, f0, f1, formants, amp, shape = 'saw') {
  const s = D.tone(D.len(d, sr), sr, f0, f1, { shape, glide: d * .6, vib: .01, vibHz: 9 }); const out = new Float32Array(s.length);
  formants.forEach(([f, q, a]) => { const b = s.slice(); D.filt(b, sr, 'bandpass', f, q); D.addAt(out, b, 0, a); }); D.bell(out, sr, 0, d * .25, d); D.add(o, out, at, sr, amp);
}
ev('gull', 1.6, -22, (o, sr, R) => { let t = 0; for (let k = 0; k < 2 + R() * 3; k++) { const d = .18 + R() * .15, f = 1100 + R() * 500; voiced(o, sr, R, t, d, f, f * 1.6, [[2600, 3, 2], [4100, 4, 1]], .6); voiced(o, sr, R, t + d * .55, d * .5, f * 1.7, f * 1.2, [[2800, 3, 2]], .3); t += d + .08 + R() * .2; } }, 32000);
ev('crane', 2, -20, (o, sr, R) => { D.strike(o, sr, 0, R, { modes: [[310, .3, 1], [690, .2, .7], [1180, .12, .5], [1900, .07, .3]], amp: 1, click: .3, noise: .5, nf: 1200 }); thud(o, sr, 0, 70, .1, .6);
  D.grains(o, sr, R, { t0: .05, t1: 1.4, rate: 30, rate1: 5, amp: .25, kind: 'ping', fLo: 900, fHi: 2600, tauLo: .01, tauHi: .04 }); });
ev('horn', 4.2, -16, (o, sr, R) => { const d = 3.2, h = D.tone(D.len(d, sr), sr, 98, 98, { shape: 'saw', vib: .003, vibHz: 5 }), h2 = D.tone(D.len(d, sr), sr, 98.6, 98.6, { shape: 'square' });
  D.addAt(h, h2, 0, .4); D.filt(h, sr, 'lowpass', 1300, .8); D.filt(h, sr, 'peaking', 350, 1, 6); D.envPts(h, sr, [[0, 0], [.25, 1], [d - .6, .95], [d, 0]]); D.add(o, h, 0, sr, .7); D.lp1(o, sr, 2500); }, 16000, 2);
ev('buoy', 4, -22, (o, sr, R) => { fm(o, sr, 0, 520 * j(R, .02), 3.8, .6, 2.76, 2, 1.2, .3); fm(o, sr, 0, 1040, 2, .2, 2.76, 1, .7, .2); });
ev('siren', 5, -22, (o, sr, R) => { const d = 4.5, s = D.tone(D.len(d, sr), sr, 650, 650, { shape: 'tri', fm: 380, fmHz: .55 }); D.filt(s, sr, 'lowpass', 2500, .7); D.envPts(s, sr, [[0, 0], [.5, 1], [d - .8, 1], [d, 0]]); D.add(o, s, 0, sr, .7); D.lp1(o, sr, 2200); }, 16000, 2);
ev('carpass', 4, -22, (o, sr, R) => { const d = 3.4, b = D.pink(D.len(d, sr), R); D.sweep(b, sr, 'bandpass', 900, 380, .8, d); D.bell(b, sr, 0, d * .5, d); D.add(o, b, 0, sr, 1.4);
  const e = D.tone(D.len(d, sr), sr, 78, 58, { shape: 'saw' }); D.filt(e, sr, 'lowpass', 400, .8); D.bell(e, sr, 0, d * .5, d); D.add(o, e, 0, sr, .35); }, 16000);
ev('honk', .7, -20, (o, sr, R) => { for (const f of [410, 515]) { const h = D.tone(D.len(.45, sr), sr, f, f, { shape: 'square' }); D.filt(h, sr, 'lowpass', 1800, .8); D.envPts(h, sr, [[0, 0], [.01, 1], [.42, 1], [.45, 0]]); D.add(o, h, 0, sr, .4); } }, 16000, 2);
ev('thunder', 7, -14, (o, sr, R) => { burst(o, sr, R, 0, .03, 'bandpass', 1500, .6, .4, 'pink', .005);
  for (let k = 0; k < 9; k++) { const t = R() * 2.5, e = D.brown(D.len(2, sr), R); D.env(e, sr, .05 + R() * .3, .3 + R() * .6); D.filt(e, sr, 'lowpass', 300 + R() * 400, .7); D.add(o, e, t, sr, (.6 + R() * .6) * Math.exp(-t * .4)); }
  const r = D.brown(o.length, R); D.env(r, sr, .2, 1.6); D.filt(r, sr, 'lowpass', 160, .7); D.addAt(o, r, 0, 1.2); }, 16000);
ev('steam', 2, -20, (o, sr, R) => { const b = D.white(D.len(1.8, sr), R); D.filt(b, sr, 'highpass', 1500, .7); D.filt(b, sr, 'lowpass', 7000, .7); D.am(b, sr, 20, .3, R); D.envPts(b, sr, [[0, 0], [.05, 1], [1.2, .7], [1.8, 0]]); D.add(o, b, 0, sr, 1); });
ev('clank', 1.5, -20, (o, sr, R) => { D.strike(o, sr, 0, R, { modes: [[180 * j(R, .2), .4, 1], [420 * j(R, .2), .25, .8], [760, .15, .5], [1300, .08, .3]], amp: 1, click: .4, noise: .5, nf: 1500 }); thud(o, sr, 0, 90, .05, .5); });
ev('drip', .5, -24, (o, sr, R) => { D.bubble(o, sr, 0, 1400 + R() * 1500, .015 + R() * .02, 3, 1); burst(o, sr, R, 0, .004, 'bandpass', 3000, 1, .3); }, 32000, 4);
ev('chime', 3.4, -22, (o, sr, R) => { [79, 76, 72].forEach((m, i) => fm(o, sr, i * .45, 440 * Math.pow(2, (m - 69) / 12), 2.2, .5, 2, .7, .9, .1)); }, 32000, 1);
ev('ding', 2, -24, (o, sr, R) => { fm(o, sr, 0, 1318.5, 1.8, .6, 2.01, .8, .7, .08); }, 32000, 1);
ev('monitor', 1.2, -26, (o, sr, R) => { for (const t of [0, .5]) { const b = D.tone(D.len(.12, sr), sr, 980, 980); D.envPts(b, sr, [[0, 0], [.004, 1], [.11, 1], [.12, 0]]); D.add(o, b, t, sr, .5); } }, 32000, 1);
ev('train', 9, -15, (o, sr, R) => { const d = 8.5, r = D.brown(D.len(d, sr), R); D.filt(r, sr, 'lowpass', 300, .7); D.bell(r, sr, 0, d * .5, d); D.add(o, r, 0, sr, 1.5);
  const m = D.pink(D.len(d, sr), R); D.filt(m, sr, 'bandpass', 900, .7); D.bell(m, sr, 1, d * .5, d - .5); D.add(o, m, 0, sr, .5);
  for (let t = 2; t < 7; t += .45 + R() * .05) { thud(o, sr, t, 160, .02, .25); thud(o, sr, t + .08, 150, .02, .2); }
  const sq = D.tone(D.len(2.5, sr), sr, 3400, 3200, { vib: .01, vibHz: 6 }); D.envPts(sq, sr, [[0, 0], [.5, 1], [2, .8], [2.5, 0]]); D.add(o, sq, 5.5, sr, .05); }, 16000, 2);
ev('owl', 2, -24, (o, sr, R) => { for (const [t, d] of [[0, .25], [.45, .55]]) voiced(o, sr, R, t, d, 370 * j(R, .03), 340, [[380, 4, 2], [800, 5, .4]], .8, 'tri'); }, 16000, 2);
ev('bird', 1.5, -24, (o, sr, R) => tweet(o, sr, R, 0, 1), 32000, 4);
ev('creak', 1.5, -26, (o, sr, R) => { const d = .5 + R() * .7, c = D.tone(D.len(d, sr), sr, 180 * j(R, .3), 260 * j(R, .3), { shape: 'saw', vib: .06, vibHz: 14 + R() * 10 }); D.filt(c, sr, 'bandpass', 900, 2); D.am(c, sr, 25, .6, R); D.bell(c, sr, 0, d * .4, d); D.add(o, c, 0, sr, 1); });
ev('buzzer', 1.6, -20, (o, sr, R) => { const b = D.tone(D.len(1.2, sr), sr, 118, 118, { shape: 'square' }); D.filt(b, sr, 'lowpass', 2500, .7); D.envPts(b, sr, [[0, 0], [.01, 1], [1.19, 1], [1.2, 0]]); D.add(o, b, 0, sr, .5); }, 16000, 1);
ev('hammer', 2.2, -20, (o, sr, R) => { for (let k = 0; k < 3 + R() * 3; k++) { const t = k * (.32 + R() * .1); D.strike(o, sr, t, R, { modes: [[1100 * j(R, .1), .05, 1], [2400, .03, .6]], amp: 1, click: .5, noise: .6, nf: 2500 }); thud(o, sr, t, 200, .02, .5); } });
ev('drill', 2.5, -22, (o, sr, R) => { const d = 1.4 + R() * .8, z = D.tone(D.len(d, sr), sr, 140, 150, { shape: 'saw' }); D.am(z, sr, 30, .8, R); D.filt(z, sr, 'bandpass', 1400, 1); D.envPts(z, sr, [[0, 0], [.05, 1], [d - .1, 1], [d, 0]]); D.add(o, z, 0, sr, 1);
  D.grains(o, sr, R, { t0: 0, t1: d, rate: 200, amp: .1, kind: 'click', fLo: 2000, fHi: 6000 }); });
ev('heli', 10, -18, (o, sr, R) => { const d = 9.5, n = D.len(d, sr), b = new Float32Array(n), bps = 5.6; for (let t = 0; t < d; t += 1 / bps) thud(b, sr, t, 70 * j(R, .05), .03, 1, .7);
  const w = D.pink(n, R); D.filt(w, sr, 'bandpass', 600, .6); D.addAt(b, w, 0, .25); D.bell(b, sr, 0, d * .5, d); D.lp1(b, sr, 900); D.addAt(o, b, 0, 1); }, 16000, 2);
ev('jet', 8, -18, (o, sr, R) => { const d = 7.5, b = D.white(D.len(d, sr), R); D.sweep(b, sr, 'bandpass', 2400, 400, .6, d); D.bell(b, sr, 0, d * .45, d); D.add(o, b, 0, sr, 1); D.lp1(o, sr, 3000); }, 16000, 2);
ev('bell', 6, -18, (o, sr, R) => { for (let k = 0; k < 3; k++) { fm(o, sr, k * 1.6, 392, 3.5, .6, 2.76, 2.2, 1.6, .3); fm(o, sr, k * 1.6, 196, 3.5, .35, 2.01, 1, 1.8, .4); } }, 32000, 1);
ev('gust', 4, -22, (o, sr, R) => { const d = 3.5, b = D.pink(D.len(d, sr), R); D.sweep(b, sr, 'bandpass', 400, 1100, .6, d * .5); D.bell(b, sr, 0, d * .4, d); D.add(o, b, 0, sr, 1.4);
  const w = D.white(D.len(d, sr), R); D.filt(w, sr, 'bandpass', 1500, 10); D.bell(w, sr, d * .2, d * .45, d * .9); D.add(o, w, 0, sr, .4); });
ev('door', 1.2, -20, (o, sr, R) => { thud(o, sr, 0, 90, .07, 1); D.strike(o, sr, 0, R, { modes: [[160, .07, 1], [330, .05, .6], [1900, .01, .3]], amp: .8, click: .4, noise: .5, nf: 1500 }); });
