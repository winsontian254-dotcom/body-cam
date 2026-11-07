/* LIVE FIRE — the sound bank: a registry of synthesised sound DEFINITIONS (pure JS, no WebAudio) and their renderer.
   Sounds are registered by js/audio/sounds/*.js (import js/audio/sounds/index.js to get them all).
   Exports:
     def(name, d)          register a sound. d = {
                             dur (s), sr: 'full' | 'half' | Hz (capped at the full rate), vars (variants, default 3), ch: 1 | 2,
                             lvl: { s50 | rms | peak: dBFS target, max: peak ceiling dBFS (default -1) } | { raw: true },
                             gen(out, sr, R, vi, name)   fills out (Float32Array, or [L, R] when ch = 2); R = seeded rng
                             loop: seconds of crossfade -> the buffer loops seamlessly (dur + loop is generated)
                             crit: true  -> may be rendered synchronously on the main thread when it is needed before the bake
                             tags: ['ui', 'gun', ...] for warm-up ordering and tests }
     lazy(prefix, factory) names starting with prefix are created on demand: factory(name) -> d | null (radio callouts, combos)
     getDef(name) -> d | null,  names(tag?) -> [names],  has(name)
     render(name, fullRate, { vars }) -> { name, sr, ch, vars: [Float32Array | [L, R]], stats: [{ peak, s50, rms, gain, nan }], ms }
     srFor(d, fullRate)
   Normalisation: each variant is scaled so that its loudest 50 ms window (s50), its RMS (rms, loops) or its peak hits the
   target, but its peak never exceeds lvl.max (default -1 dBFS). The engine adds per-play gain / pitch jitter. */
import { rng, hashStr, analyze, undb, loopXfade, fade } from './dsp.js';

export const DEFS = new Map();
const LAZY = [];
export function def(name, d) { DEFS.set(name, d); return d; }
export function lazy(prefix, factory) { LAZY.push([prefix, factory]); }
export function getDef(name) {
  let d = DEFS.get(name); if (d) return d;
  for (const [p, f] of LAZY) if (name.startsWith(p)) { d = f(name); if (d) { DEFS.set(name, d); return d; } }
  return null;
}
export const has = name => !!getDef(name);
export function names(tag) { const out = []; for (const [n, d] of DEFS) if (!tag || (d.tags && d.tags.includes(tag))) out.push(n); return out; }
export function srFor(d, full) {
  const s = d.sr == null ? 'full' : d.sr;
  if (s === 'full') return full;
  if (s === 'half') return Math.max(16000, Math.round(full / 2));
  return Math.min(full, s);
}

export function render(name, full = 48000, opts = {}) {
  const d = getDef(name); if (!d) return null;
  const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const sr = srFor(d, full), ch = d.ch || 1, nv = Math.max(1, Math.min(d.vars || 3, opts.vars || 99)), seed = hashStr(name);
  const vars = [], stats = [];
  for (let vi = 0; vi < nv; vi++) {
    const R = rng(seed + vi * 7919 + 13), n = Math.max(1, Math.ceil(((d.dur || .5) + (d.loop || 0)) * sr));
    let out = ch === 2 ? [new Float32Array(n), new Float32Array(n)] : new Float32Array(n);
    d.gen(out, sr, R, vi, name);
    if (d.loop) out = ch === 2 ? out.map(c => loopXfade(c, sr, d.loop)) : loopXfade(out, sr, d.loop);
    else if (!(d.lvl && d.lvl.raw)) { if (ch === 2) out.forEach(c => fade(c, sr, 0, .004)); else fade(out, sr, 0, .004); }
    const st = norm(out, sr, d.lvl || { s50: -18 });
    vars.push(out); stats.push(st);
  }
  const t1 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  return { name, sr, ch, vars, stats, ms: t1 - t0 };
}

function norm(out, sr, lvl) {
  const chans = Array.isArray(out) ? out : [out];
  let nan = 0; for (const c of chans) for (let i = 0; i < c.length; i++) if (!Number.isFinite(c[i])) { c[i] = 0; nan++; }
  const a = chans.map(c => analyze(c, sr)), peak = Math.max(...a.map(x => x.peak)), s50 = Math.max(...a.map(x => x.s50)),
    rms = Math.sqrt(a.reduce((s, x) => s + x.rms * x.rms, 0) / a.length);
  if (lvl.raw || peak < 1e-9) return { peak, s50, rms, gain: 1, nan };
  let g;
  if (lvl.rms != null) g = undb(lvl.rms) / Math.max(1e-9, rms);
  else if (lvl.peak != null) g = undb(lvl.peak) / peak;
  else g = undb(lvl.s50 == null ? -18 : lvl.s50) / Math.max(1e-9, s50);
  g = Math.min(g, undb(lvl.max == null ? -1 : lvl.max) / peak);
  for (const c of chans) for (let i = 0; i < c.length; i++) c[i] *= g;
  return { peak: peak * g, s50: s50 * g, rms: rms * g, gain: g, nan };
}
