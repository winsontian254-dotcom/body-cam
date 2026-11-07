/* LIVE FIRE — audio DSP toolkit. PURE JS (no WebAudio, no DOM): runs in the bake worker, on the main thread and in Node tests.
   Every sound in the game is synthesised from these primitives into Float32Arrays (js/audio/sounds/*.js), then baked into
   AudioBuffers (js/audio/baker.js). Times are in SECONDS, frequencies in Hz, buffers are mono Float32Array unless noted.
   Exports:
     rng(seed) -> () => [0,1)            mulberry32;  hashStr(s) -> uint32
     len(sec, sr), buf(sec, sr), add(dst, src, atSec, sr, g), addAt(dst, src, atSample, g), scale(b, g), peakOf(b)
     white(n, R), pink(n, R), brown(n, R), noise(kind, n, R)
     env(b, sr, a, tau, hold, at)        linear attack a, hold, exponential decay tau (in place, starting at time `at`)
     envPts(b, sr, pts)                  piecewise-linear gain [[t, v], ...] (in place)
     bell(b, sr, t0, peakT, t1)          smooth rise / fall (Doppler-ish fly-bys)
     Biquad, filt(b, sr, type, f, q, dB), sweep(b, sr, type, f0, f1, q, dur, dB), lp1(b, sr, f), hp1(b, sr, f), dcblock(b, sr)
     tone(n, sr, f0, f1, { shape, glide, ph, fm, fmHz })   oscillator with an exponential glide over `glide` seconds
     ring(b, sr, at, modes, amp, R, jit)  adds decaying sinusoids [[f, tau, a], ...] (modal impulse response) at time `at`
     strike(b, sr, at, R, o)             a hard object impact: click + noise burst + modal ring
     resonate(x, sr, modes)              drives 2-pole resonators with an excitation buffer -> new buffer
     friedlander(n, sr, T, A)            blast-wave pressure pulse (instant rise, positive phase T, negative phase after)
     nwave(n, sr, dur)                   supersonic N-wave (bullet crack)
     grains(b, sr, R, o)                 Poisson granular layer (clicks / pings / noise grains) with rate + amplitude envelopes
     bubble(b, sr, at, f0, tau, rise, a) Minnaert bubble (rising pitch sine) for water
     shape(b, drive), clip(b, c), delayAdd(b, sr, sec, g, lp), fade(b, sr, inSec, outSec), loopXfade(b, sr, sec)
     fdn(b, sr, rt60, o)                 4-line feedback delay network reverb (baked tails), returns a new buffer (or stereo)
     am(b, sr, rate, depth, R)           smooth random amplitude modulation (turbulence)
     analyze(b, sr) -> { peak, rms, s50, nan, dc, len }   (s50 = loudest 50 ms RMS window)
     db(x), undb(d)
*/
export const TAU = Math.PI * 2;

export function rng(seed) {
  let a = (seed >>> 0) || 0x9e3779b9;
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
export const db = x => 20 * Math.log10(Math.max(1e-12, x));
export const undb = d => Math.pow(10, d / 20);
export const len = (sec, sr) => Math.max(1, Math.ceil(sec * sr));
export const buf = (sec, sr) => new Float32Array(len(sec, sr));
export function addAt(dst, src, at, g = 1) {
  at = at | 0; const n = Math.min(src.length, dst.length - at);
  for (let i = Math.max(0, -at); i < n; i++) dst[at + i] += src[i] * g;
  return dst;
}
export const add = (dst, src, atSec, sr, g = 1) => addAt(dst, src, Math.round((atSec || 0) * sr), g);
export function scale(b, g) { for (let i = 0; i < b.length; i++) b[i] *= g; return b; }
export function peakOf(b) { let p = 0; for (let i = 0; i < b.length; i++) { const v = b[i] < 0 ? -b[i] : b[i]; if (v > p) p = v; } return p; }

// ------------------------------------------------------------------ noise
export function white(n, R) { const b = new Float32Array(n); for (let i = 0; i < n; i++) b[i] = R() * 2 - 1; return b; }
export function pink(n, R) {   // Paul Kellet's refined filter, ~unit RMS
  const b = new Float32Array(n); let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < n; i++) {
    const w = R() * 2 - 1;
    b0 = .99886 * b0 + w * .0555179; b1 = .99332 * b1 + w * .0750759; b2 = .969 * b2 + w * .153852; b3 = .8665 * b3 + w * .3104856;
    b4 = .55 * b4 + w * .5329522; b5 = -.7616 * b5 - w * .016898; b[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * .5362) * .2; b6 = w * .115926;
  }
  return b;
}
export function brown(n, R) { const b = new Float32Array(n); let l = 0; for (let i = 0; i < n; i++) { l = (l + .02 * (R() * 2 - 1)) / 1.02; b[i] = l * 6; } return b; }
export const noise = (kind, n, R) => kind === 'pink' ? pink(n, R) : kind === 'brown' ? brown(n, R) : white(n, R);

// ------------------------------------------------------------------ envelopes (in place)
/** linear attack `a`, optional hold, then exp decay with time constant tau; everything before `at` is silenced. */
export function env(b, sr, a, tau, hold = 0, at = 0) {
  const i0 = Math.round(at * sr), ia = Math.max(1, Math.round(a * sr)), ih = Math.round(hold * sr), k = Math.exp(-1 / Math.max(1e-5, tau * sr));
  let g = 1;
  for (let i = 0; i < b.length; i++) {
    const j = i - i0;
    if (j < 0) { b[i] = 0; continue; }
    if (j < ia) { b[i] *= j / ia; continue; }
    if (j < ia + ih) continue;
    g *= k; b[i] *= g;
  }
  return b;
}
export function envPts(b, sr, pts) {
  let k = 0;
  for (let i = 0; i < b.length; i++) {
    const t = i / sr;
    while (k < pts.length - 1 && t > pts[k + 1][0]) k++;
    let v;
    if (t <= pts[0][0]) v = pts[0][1];
    else if (k >= pts.length - 1) v = pts[pts.length - 1][1];
    else { const [t0, v0] = pts[k], [t1, v1] = pts[k + 1]; v = v0 + (v1 - v0) * ((t - t0) / Math.max(1e-9, t1 - t0)); }
    b[i] *= v;
  }
  return b;
}
/** raised-cosine rise from t0 to peakT, fall to t1 */
export function bell(b, sr, t0, peakT, t1) {
  for (let i = 0; i < b.length; i++) {
    const t = i / sr; let v = 0;
    if (t > t0 && t < peakT) v = .5 - .5 * Math.cos(Math.PI * (t - t0) / (peakT - t0));
    else if (t >= peakT && t < t1) v = .5 + .5 * Math.cos(Math.PI * (t - peakT) / (t1 - peakT));
    b[i] *= v;
  }
  return b;
}
export function fade(b, sr, inSec = 0, outSec = .005) {
  const ni = Math.min(b.length, Math.round(inSec * sr)), no = Math.min(b.length, Math.round(outSec * sr));
  for (let i = 0; i < ni; i++) b[i] *= i / ni;
  for (let i = 0; i < no; i++) b[b.length - 1 - i] *= i / no;
  return b;
}
/** turn the end of a buffer into a seamless loop: the last `sec` is crossfaded (equal power) into the start; returns a shorter buffer */
export function loopXfade(b, sr, sec) {
  const x = Math.min(Math.floor(b.length / 3), Math.round(sec * sr)), n = b.length - x, out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = b[i];
  for (let i = 0; i < x; i++) { const t = i / x; out[i] = b[i] * Math.sin(t * Math.PI / 2) + b[n + i] * Math.cos(t * Math.PI / 2); }
  return out;
}

// ------------------------------------------------------------------ filters
export class Biquad {
  constructor() { this.b0 = 1; this.b1 = 0; this.b2 = 0; this.a1 = 0; this.a2 = 0; this.x1 = 0; this.x2 = 0; this.y1 = 0; this.y2 = 0; }
  set(type, f, q, dB, sr) {
    f = Math.min(sr * .45, Math.max(8, f)); q = Math.max(.05, q || .707);
    const w = TAU * f / sr, c = Math.cos(w), s = Math.sin(w), al = s / (2 * q), A = Math.pow(10, (dB || 0) / 40);
    let b0, b1, b2, a0, a1, a2;
    switch (type) {
      case 'highpass': b0 = (1 + c) / 2; b1 = -(1 + c); b2 = b0; a0 = 1 + al; a1 = -2 * c; a2 = 1 - al; break;
      case 'bandpass': b0 = al; b1 = 0; b2 = -al; a0 = 1 + al; a1 = -2 * c; a2 = 1 - al; break;
      case 'notch': b0 = 1; b1 = -2 * c; b2 = 1; a0 = 1 + al; a1 = -2 * c; a2 = 1 - al; break;
      case 'peaking': b0 = 1 + al * A; b1 = -2 * c; b2 = 1 - al * A; a0 = 1 + al / A; a1 = -2 * c; a2 = 1 - al / A; break;
      case 'lowshelf': { const sq = 2 * Math.sqrt(A) * al;
        b0 = A * ((A + 1) - (A - 1) * c + sq); b1 = 2 * A * ((A - 1) - (A + 1) * c); b2 = A * ((A + 1) - (A - 1) * c - sq);
        a0 = (A + 1) + (A - 1) * c + sq; a1 = -2 * ((A - 1) + (A + 1) * c); a2 = (A + 1) + (A - 1) * c - sq; break; }
      case 'highshelf': { const sq = 2 * Math.sqrt(A) * al;
        b0 = A * ((A + 1) + (A - 1) * c + sq); b1 = -2 * A * ((A - 1) + (A + 1) * c); b2 = A * ((A + 1) + (A - 1) * c - sq);
        a0 = (A + 1) - (A - 1) * c + sq; a1 = 2 * ((A - 1) - (A + 1) * c); a2 = (A + 1) - (A - 1) * c - sq; break; }
      default: b0 = (1 - c) / 2; b1 = 1 - c; b2 = b0; a0 = 1 + al; a1 = -2 * c; a2 = 1 - al;   // lowpass
    }
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0; this.a1 = a1 / a0; this.a2 = a2 / a0;
    return this;
  }
  run(b, i0 = 0, i1 = b.length) {
    let { x1, x2, y1, y2 } = this; const { b0, b1, b2, a1, a2 } = this;
    for (let i = i0; i < i1; i++) {
      const x = b[i], y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
      x2 = x1; x1 = x; y2 = y1; y1 = (y > -1e-20 && y < 1e-20) ? 0 : y; b[i] = y1;
    }
    this.x1 = x1; this.x2 = x2; this.y1 = y1; this.y2 = y2;
    return b;
  }
}
export function filt(b, sr, type, f, q = .707, dB = 0) { return new Biquad().set(type, f, q, dB, sr).run(b); }
/** exponential cutoff sweep f0 -> f1 over `dur` seconds (then held); coefficients updated every 32 samples */
export function sweep(b, sr, type, f0, f1, q = .707, dur, dB = 0) {
  const bq = new Biquad(), T = Math.max(1e-4, dur == null ? b.length / sr : dur), r = Math.log(Math.max(8, f1) / Math.max(8, f0));
  for (let i = 0; i < b.length; i += 32) {
    const t = Math.min(1, (i / sr) / T);
    bq.set(type, f0 * Math.exp(r * t), q, dB, sr).run(b, i, Math.min(b.length, i + 32));
  }
  return b;
}
export function lp1(b, sr, f) { const a = 1 - Math.exp(-TAU * Math.min(f, sr * .49) / sr); let y = 0; for (let i = 0; i < b.length; i++) { y += a * (b[i] - y); b[i] = y; } return b; }
export function hp1(b, sr, f) { const a = 1 - Math.exp(-TAU * Math.min(f, sr * .49) / sr); let y = 0; for (let i = 0; i < b.length; i++) { y += a * (b[i] - y); b[i] -= y; } return b; }
export function dcblock(b, sr = 48000) { return hp1(b, sr, 18); }

// ------------------------------------------------------------------ oscillators
/** shape: sine | tri | saw | square | pulse(o.pw); glide: seconds for the exponential f0 -> f1 glide; fm: index (Hz deviation) at fmHz */
export function tone(n, sr, f0, f1 = f0, o = {}) {
  const b = new Float32Array(n), shape = o.shape || 'sine', G = Math.max(1e-4, o.glide == null ? n / sr : o.glide), r = Math.log(Math.max(1, f1) / Math.max(1, f0));
  let ph = o.ph || 0, mph = 0; const pw = o.pw || .5, fmD = o.fm || 0, fmHz = o.fmHz || 0, vib = o.vib || 0, vibHz = o.vibHz || 5;
  for (let i = 0; i < n; i++) {
    const t = i / sr; let f = f0 * Math.exp(r * Math.min(1, t / G));
    if (fmD) { mph += fmHz / sr; f += fmD * Math.sin(TAU * mph); }
    if (vib) f *= 1 + vib * Math.sin(TAU * vibHz * t);
    const dt = f / sr; ph += dt; if (ph >= 1) ph -= Math.floor(ph);
    let v;
    if (shape === 'sine') v = Math.sin(TAU * ph);
    else if (shape === 'tri') v = 1 - 4 * Math.abs(ph - .5);
    else if (shape === 'saw') { v = 2 * ph - 1; v -= blep(ph, dt); }
    else { v = ph < pw ? 1 : -1; v += blep(ph, dt); v -= blep((ph + 1 - pw) % 1, dt); }
    b[i] = v;
  }
  return b;
}
function blep(t, dt) {   // polyBLEP residual
  if (dt <= 0) return 0;
  if (t < dt) { t /= dt; return t + t - t * t - 1; }
  if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
  return 0;
}
/** adds a modal impulse response: modes = [[f, tau, amp], ...]; jit = random detune fraction; random phases */
export function ring(b, sr, at, modes, amp, R, jit = 0) {
  const i0 = Math.round(at * sr);
  for (const m of modes) {
    const f = m[0] * (1 + (R ? (R() * 2 - 1) * jit : 0)); if (f >= sr * .48) continue;
    const tau = m[1], a = (m[2] == null ? 1 : m[2]) * amp, n = Math.min(b.length - i0, Math.ceil(tau * 7 * sr)); if (n <= 0) continue;
    const d = Math.exp(-1 / (tau * sr)), w = TAU * f / sr, cw = Math.cos(w), sw = Math.sin(w);
    const ph = R ? R() * TAU : 0; let re = Math.cos(ph) * a, im = Math.sin(ph) * a;
    // soft start over ~0.15 ms so random phases do not click
    const ns = Math.max(1, Math.round(.00015 * sr));
    for (let i = 0; i < n; i++) { const r2 = (re * cw - im * sw) * d; im = (re * sw + im * cw) * d; re = r2; b[i0 + i] += im * (i < ns ? i / ns : 1); }
  }
  return b;
}
/** a hard impact: o = { modes, amp = 1, click = .5, noise = .4, nTau = .0015, nf = 3000 (noise band), nq = .8, jit = .03 } */
export function strike(b, sr, at, R, o) {
  const amp = o.amp == null ? 1 : o.amp, i0 = Math.round(at * sr);
  if (o.click !== 0) { const n = Math.max(2, Math.round(.0004 * sr)), c = white(n, R); for (let i = 0; i < n; i++) c[i] *= 1 - i / n; hp1(c, sr, 2500); addAt(b, c, i0, amp * (o.click == null ? .5 : o.click)); }
  if (o.noise !== 0) {
    const tau = o.nTau || .0015, nb = white(len(tau * 6, sr), R); env(nb, sr, .0001, tau); filt(nb, sr, 'bandpass', o.nf || 3000, o.nq || .8);
    addAt(b, nb, i0, amp * (o.noise == null ? .4 : o.noise) * 2.5);
  }
  if (o.modes) ring(b, sr, at, o.modes, amp * .35, R, o.jit == null ? .03 : o.jit);
  return b;
}
/** 2-pole resonators driven by x; modes [[f, tau, gain]] -> new buffer of x.length (+ ring-out) */
export function resonate(x, sr, modes, extra = 0) {
  const n = x.length + Math.round(extra * sr), y = new Float32Array(n);
  for (const [f, tau, g] of modes) {
    if (f >= sr * .48) continue;
    const r = Math.exp(-1 / (tau * sr)), w = TAU * f / sr, a1 = 2 * r * Math.cos(w), a2 = r * r, k = (g == null ? 1 : g) * Math.sin(w) * (1 - r) * 4;
    let y1 = 0, y2 = 0;
    for (let i = 0; i < n; i++) { const v = (i < x.length ? x[i] : 0) * k + a1 * y1 - a2 * y2; y2 = y1; y1 = v; y[i] += v; }
  }
  return y;
}
/** Friedlander blast wave: p(t) = (1 - t/T) exp(-A t / T), t >= 0 (peak 1 at t = 0, negative phase after T) */
export function friedlander(n, sr, T, A = 1.5) {
  const b = new Float32Array(n);
  for (let i = 0; i < n; i++) { const t = i / sr / T; b[i] = (1 - t) * Math.exp(-A * t); }
  return b;
}
/** supersonic N-wave of total length dur (seconds): +1 ramping to -1, band-limited by the sample grid */
export function nwave(n, sr, dur) {
  const b = new Float32Array(n), m = Math.max(2, dur * sr);
  for (let i = 0; i < n && i <= m + 1; i++) { const x = i / m; b[i] = x <= 1 ? 1 - 2 * x : 0; }
  // soften the two edges a little (rise ~ 2 samples)
  b[0] *= .6; return b;
}

// ------------------------------------------------------------------ texture
/** Poisson granular layer. o = { t0, t1, rate (grains/s at t0), rate1 (at t1, default rate), amp, amp1 (at t1), ampVar (0..1),
 *  kind: 'click' | 'ping' | 'noise', fLo, fHi (Hz, log-uniform), tauLo, tauHi, q (noise grains) } */
export function grains(b, sr, R, o) {
  const t0 = o.t0 || 0, t1 = o.t1 == null ? b.length / sr : o.t1, r0 = o.rate, r1 = o.rate1 == null ? o.rate : o.rate1;
  const a0 = o.amp == null ? 1 : o.amp, a1 = o.amp1 == null ? a0 : o.amp1, av = o.ampVar == null ? .7 : o.ampVar, kind = o.kind || 'click';
  const fLo = o.fLo || 1000, fHi = o.fHi || 6000, tLo = o.tauLo || .001, tHi = o.tauHi || .004, lf = Math.log(fHi / fLo);
  let t = t0, guard = 0;
  while (t < t1 && guard++ < 20000) {
    const u = (t - t0) / Math.max(1e-6, t1 - t0), rate = Math.max(.01, r0 + (r1 - r0) * (o.rateCurve ? Math.pow(u, o.rateCurve) : u));
    t += -Math.log(1 - R() * .999) / rate; if (t >= t1) break;
    const uu = (t - t0) / Math.max(1e-6, t1 - t0), a = (a0 + (a1 - a0) * uu) * (1 - av + av * R()), f = fLo * Math.exp(lf * R()), tau = tLo + (tHi - tLo) * R();
    if (kind === 'ping') ring(b, sr, t, [[f, tau, 1]], a * 2.2, R, 0);
    else {
      const n = len(kind === 'click' ? Math.max(.0003, tau) : tau * 5, sr), g = white(n, R);
      if (kind === 'click') { for (let i = 0; i < n; i++) g[i] *= 1 - i / n; filt(g, sr, 'bandpass', f, 1.2); }
      else { env(g, sr, .0002, tau); filt(g, sr, 'bandpass', f, o.q || 2); }
      add(b, g, t, sr, a * (kind === 'click' ? 3 : 2));
    }
  }
  return b;
}
export function bubble(b, sr, at, f0, tau, rise = 1.5, a = 1) {
  const i0 = Math.round(at * sr), n = Math.min(b.length - i0, Math.ceil(tau * 6 * sr)); let ph = 0, g = 1; const d = Math.exp(-1 / (tau * sr));
  for (let i = 0; i < n; i++) { const t = i / sr; ph += f0 * (1 + rise * t / Math.max(.004, tau)) / sr; g *= d; b[i0 + i] += Math.sin(TAU * ph) * g * a * Math.min(1, i / (.0005 * sr)); }
  return b;
}
/** smooth random amplitude modulation around 1: depth 0..1, rate Hz */
export function am(b, sr, rate, depth, R) {
  const step = Math.max(1, Math.round(sr / rate)); let a = 1, bb = 1 - depth * R();
  for (let i = 0; i < b.length; i++) {
    if (i % step === 0) { a = bb; bb = 1 - depth * R(); }
    const t = (i % step) / step, s = t * t * (3 - 2 * t); b[i] *= a + (bb - a) * s;
  }
  return b;
}

// ------------------------------------------------------------------ nonlinear / time
/** tanh saturation normalised so that a full-scale input stays near full scale */
export function shape(b, drive = 2, asym = 0) {
  const n = Math.tanh(drive);
  for (let i = 0; i < b.length; i++) { const x = b[i] + asym * b[i] * b[i]; b[i] = Math.tanh(drive * x) / n; }
  return b;
}
export function clip(b, c = 1) { for (let i = 0; i < b.length; i++) b[i] = b[i] > c ? c : b[i] < -c ? -c : b[i]; return b; }
/** adds a delayed (optionally low-passed) copy: a reflection */
export function delayAdd(b, sr, sec, g, lp) {
  const d = Math.round(sec * sr); if (d <= 0 || d >= b.length) return b;
  const c = b.slice(0, b.length - d); if (lp) lp1(c, sr, lp);
  for (let i = 0; i < c.length; i++) b[i + d] += c[i] * g;
  return b;
}
/** feedback delay network reverb: rt60 seconds, o = { lp (damping Hz), mix (wet gain), pre (s), stereo: true -> [L, R], tail (extra s) } */
export function fdn(x, sr, rt60, o = {}) {
  const extra = o.tail == null ? rt60 : o.tail, n = x.length + Math.round(extra * sr), pre = Math.round((o.pre || 0) * sr);
  const D = (o.sizes || [.0297, .0371, .0411, .0437]).map(s => Math.max(8, Math.round(s * (o.size || 1) * sr)));
  const lines = D.map(d => new Float32Array(d)), idx = [0, 0, 0, 0], lpS = [0, 0, 0, 0];
  const g = D.map(d => Math.pow(10, -3 * d / (sr * Math.max(.05, rt60)))), damp = 1 - Math.exp(-TAU * (o.lp || 6000) / sr);
  const L = new Float32Array(n), Rr = o.stereo ? new Float32Array(n) : null, wet = o.mix == null ? 1 : o.mix;
  for (let i = 0; i < n; i++) {
    const xi = i - pre >= 0 && i - pre < x.length ? x[i - pre] : 0;
    const v0 = lines[0][idx[0]], v1 = lines[1][idx[1]], v2 = lines[2][idx[2]], v3 = lines[3][idx[3]];
    const s = (v0 + v1 + v2 + v3) * .5;   // Householder: v - 2/N * sum
    lpS[0] += damp * ((v0 - s) * g[0] - lpS[0]); lpS[1] += damp * ((v1 - s) * g[1] - lpS[1]);
    lpS[2] += damp * ((v2 - s) * g[2] - lpS[2]); lpS[3] += damp * ((v3 - s) * g[3] - lpS[3]);
    for (let k = 0; k < 4; k++) { lines[k][idx[k]] = lpS[k] + xi * (k & 1 ? -.5 : .5); if (++idx[k] >= D[k]) idx[k] = 0; }
    L[i] = (v0 + v2 - v1 * .6) * wet;
    if (Rr) Rr[i] = (v1 + v3 - v2 * .6) * wet;
  }
  return Rr ? [L, Rr] : L;
}

// ------------------------------------------------------------------ analysis
export function analyze(b, sr) {
  let peak = 0, sum = 0, dc = 0, nan = 0;
  for (let i = 0; i < b.length; i++) { const v = b[i]; if (!Number.isFinite(v)) { nan++; continue; } const a = v < 0 ? -v : v; if (a > peak) peak = a; sum += v * v; dc += v; }
  const w = Math.max(1, Math.round(.05 * sr)), hop = Math.max(1, Math.round(.01 * sr)); let s50 = 0;
  // running window
  let acc = 0; for (let i = 0; i < Math.min(w, b.length); i++) acc += (Number.isFinite(b[i]) ? b[i] * b[i] : 0);
  s50 = acc / Math.min(w, b.length);
  for (let s = hop; s + w <= b.length; s += hop) {
    for (let i = s - hop; i < s; i++) acc -= Number.isFinite(b[i]) ? b[i] * b[i] : 0;
    for (let i = s + w - hop; i < s + w; i++) acc += Number.isFinite(b[i]) ? b[i] * b[i] : 0;
    if (acc / w > s50) s50 = acc / w;
  }
  return { peak, rms: Math.sqrt(sum / Math.max(1, b.length)), s50: Math.sqrt(Math.max(0, s50)), nan, dc: dc / Math.max(1, b.length), len: b.length / sr };
}
