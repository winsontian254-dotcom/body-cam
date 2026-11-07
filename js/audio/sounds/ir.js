/* LIVE FIRE — generated stereo impulse responses for the convolution reverb (pure DSP, registered in the bank).
   Bank names (ch: 2, raw level; each channel normalised to ~unity power gain over 150 Hz - 3 kHz, so a send of g gives a reverb of
   ~g^2 x the input power for typical sounds):
     ir:outdoor   sparse: discrete slap echoes off buildings / terrain 60-450 ms, a faint diffuse tail
     ir:room      dense early reflections (3-25 ms), RT60 ~0.5 s, bright
     ir:hall      15 ms pre-delay, early reflections to 90 ms, RT60 ~1.9 s, darkening
     ir:tunnel    flutter echo between parallel walls + RT60 ~2.4 s, low-mid heavy
     ir:music     smooth 3 s hall for the menu music
   Frequency-dependent decay: the tail is the sum of three noise bands (low / mid / high), each with its own RT60. */
import { def } from '../bank.js';
import * as D from '../dsp.js';

function tail(c, sr, R, pre, rt, amp, attack = .012) {
  const n = c.length, bands = [['lowpass', 450, rt[0]], ['bandpass', 1300, rt[1]], ['highpass', 3200, rt[2]]];
  for (const [type, f, T] of bands) {
    const b = D.white(n, R); D.filt(b, sr, type, f, type === 'bandpass' ? .5 : .707);
    const k = Math.exp(-6.91 / (Math.max(.05, T) * sr)), i0 = Math.round(pre * sr), ia = Math.max(1, Math.round(attack * sr)); let g = 1;
    for (let i = 0; i < n; i++) { if (i < i0) { b[i] = 0; continue; } const j = i - i0; if (j < ia) b[i] *= j / ia; else { g *= k; b[i] *= g; } }
    D.addAt(c, b, 0, amp);
  }
}
function tap(c, sr, R, ms, g, lp = 3000, smear = .002) {
  const n = D.len(smear + .002, sr), b = D.white(n, R); D.env(b, sr, .0002, smear * .4); D.lp1(b, sr, lp); D.add(c, b, ms / 1000, sr, g * 3);
}
/** scale so that the response averages ~unity power over 150 Hz - 3 kHz (where program material lives): a plain unit-energy
 *  IR whose energy sits low would boost a gunshot's reverb by 10-20 dB */
function unit(c, sr = unit.sr) {
  const b = c.slice(); D.filt(b, sr, 'highpass', 150, .707); D.filt(b, sr, 'lowpass', 3000, .707);
  let e = 0; for (let i = 0; i < b.length; i++) e += b[i] * b[i];
  const g = Math.sqrt((3000 - 150) / (sr / 2) / Math.max(1e-12, e)); for (let i = 0; i < c.length; i++) c[i] *= g;
}
const IR = {
  outdoor(o, sr, R) {
    const echoes = []; for (let k = 0; k < 10; k++) echoes.push([60 + Math.pow(R(), 1.3) * 400, .25 * Math.exp(-k * .18) * (.5 + R() * .5)]);
    o.forEach((c, ch) => {
      for (const [ms, g] of echoes) tap(c, sr, R, ms + (ch ? R() * 9 : 0), g * (ch ? .6 + R() * .8 : .6 + R() * .8), 2400 - ms * 2, .004 + R() * .006);
      tail(c, sr, R, .03, [1.3, .9, .45], .03, .05); unit(c);
    });
  },
  room(o, sr, R) {
    o.forEach(c => { for (let k = 0; k < 14; k++) tap(c, sr, R, 2.5 + R() * 24, (.3 + R() * .5) * Math.exp(-k * .08), 7000, .0006); tail(c, sr, R, .006, [.6, .5, .32], .09, .01); unit(c); });
  },
  hall(o, sr, R) {
    o.forEach(c => { for (let k = 0; k < 12; k++) tap(c, sr, R, 15 + R() * 75, (.2 + R() * .35) * Math.exp(-k * .06), 5000, .001); tail(c, sr, R, .02, [2.3, 1.9, 1.0], .07, .03); unit(c); });
  },
  tunnel(o, sr, R) {
    o.forEach((c, ch) => {
      const per = 8.5 + ch * .7 + R();
      for (let k = 1; k < 40; k++) tap(c, sr, R, k * per + R() * .4, .55 * Math.exp(-k * .1), 4000 - k * 60, .0008);
      tail(c, sr, R, .012, [2.9, 2.3, 1.1], .08, .04); D.filt(c, sr, 'peaking', 350, .8, 4); unit(c);
    });
  },
  music(o, sr, R) { o.forEach(c => { tail(c, sr, R, .022, [3.4, 2.9, 1.6], .1, .08); unit(c); }); },
};
const DUR = { outdoor: 1.8, room: 1.0, hall: 2.8, tunnel: 3.2, music: 3.8 };
for (const k of Object.keys(IR)) def('ir:' + k, { dur: DUR[k], ch: 2, vars: 1, lvl: { raw: true }, tags: ['ir'], gen: (o, sr, R) => { unit.sr = sr; IR[k](o, sr, R); } });
