// LIVE FIRE audio test. Nobody can listen in this container, so this measures instead:
//   1. Node: renders EVERY bank sound (all variants) with the same DSP code the game bakes: no NaN, no clipping, levels on
//      target, durations, render cost; spectrogram + waveform PNGs and WAVs of the key sounds -> tools/test/out/audio/
//   2. Browser (Chromium, OfflineAudioContext): the full runtime chain (buses, limiter, convolver reverb, HRTF panners, air
//      absorption, occlusion, voice limits) for every public API call; loudness by distance; CPU per gunshot (main-thread
//      scheduling time and audio-render time); the live AudioContext path on the game page with zero console errors.
//   node tools/test/audio.mjs [--node] [--browser] [--only=prefix,prefix] [--shots] [--wav] [--trim]
//   --trim writes tools/test/out/audio/trim.json (measured level of every sound vs its target).
import fs from 'node:fs'; import path from 'node:path'; import zlib from 'node:zlib'; import url from 'node:url';
const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'tools/test/out/audio'); fs.mkdirSync(OUT, { recursive: true });
const argv = process.argv.slice(2), has = k => argv.includes('--' + k), arg = (k, d) => { const a = argv.find(s => s.startsWith('--' + k + '=')); return a ? a.split('=')[1] : d; };
const RUN_NODE = has('node') || !has('browser'), RUN_BROWSER = has('browser') || !has('node');
const ONLY = arg('only', '') ? arg('only').split(',') : null;
const fails = [], warns = [];
const check = (ok, msg) => { if (!ok) { fails.push(msg); console.log('  FAIL ' + msg); } return ok; };
const dbs = x => (20 * Math.log10(Math.max(1e-9, x))).toFixed(1);

// ------------------------------------------------------------------ PNG / WAV / FFT helpers
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(b) { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function png(w, h, rgb) {
  const raw = Buffer.alloc((w * 3 + 1) * h); for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; rgb.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3); }
  const chunk = (type, data) => { const l = Buffer.alloc(4); l.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td)); return Buffer.concat([l, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
export function wav(chans, sr) {
  const n = chans[0].length, c = chans.length, b = Buffer.alloc(44 + n * c * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * c * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(c, 22);
  b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * c * 2, 28); b.writeUInt16LE(c * 2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * c * 2, 40);
  for (let i = 0; i < n; i++) for (let k = 0; k < c; k++) b.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(chans[k][i] * 32767))), 44 + (i * c + k) * 2);
  return b;
}
function fft(re, im) {
  const n = re.length; for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
  for (let len = 2; len <= n; len <<= 1) { const a = -2 * Math.PI / len, wr = Math.cos(a), wi = Math.sin(a);
    for (let i = 0; i < n; i += len) { let cr = 1, ci = 0; for (let k = 0; k < len / 2; k++) { const ur = re[i + k], ui = im[i + k], vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci, vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
      re[i + k] = ur + vr; im[i + k] = ui + vi; re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi; const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t; } } }
}
const PAL = [[0, 0, 4], [40, 11, 84], [101, 21, 110], [159, 42, 99], [212, 72, 66], [245, 125, 21], [250, 193, 39], [252, 255, 164]];
const pal = v => { v = Math.max(0, Math.min(1, v)) * (PAL.length - 1); const i = Math.min(PAL.length - 2, Math.floor(v)), t = v - i; return PAL[i].map((c, k) => Math.round(c + (PAL[i + 1][k] - c) * t)); };
/** spectrogram (log frequency 30 Hz .. sr/2, -90..0 dB) under a waveform strip; returns { png, centroid, bands } */
export function spectro(x, sr, title, W = 720, secs = 0) {
  if (secs) x = x.subarray(0, Math.min(x.length, Math.round(secs * sr)));
  const H = 260, WH = 70, N = x.length / sr < .5 ? 512 : x.length / sr < 1.5 ? 1024 : 2048, rows = H, img = Buffer.alloc(W * (H + WH) * 3);
  const win = new Float32Array(N); for (let i = 0; i < N; i++) win[i] = .5 - .5 * Math.cos(2 * Math.PI * i / (N - 1));
  const fLo = 30, fHi = sr / 2, total = x.length;
  let cenNum = 0, cenDen = 0; const bandE = [0, 0, 0, 0, 0, 0]; const edges = [0, 150, 500, 1500, 4000, 10000, 1e9];
  for (let col = 0; col < W; col++) {
    const c = Math.floor(col / W * total), re = new Float32Array(N), im = new Float32Array(N);
    for (let i = 0; i < N; i++) { const k = c + i - N / 2; re[i] = (k >= 0 && k < total ? x[k] : 0) * win[i]; }
    fft(re, im); const mag = new Float32Array(N / 2); for (let k = 0; k < N / 2; k++) { mag[k] = Math.hypot(re[k], im[k]) / (N / 4); const f = k * sr / N, e = mag[k] * mag[k]; cenNum += f * e; cenDen += e; for (let b = 0; b < 6; b++) if (f >= edges[b] && f < edges[b + 1]) bandE[b] += e; }
    for (let r = 0; r < rows; r++) {
      const f = fLo * Math.pow(fHi / fLo, 1 - r / (rows - 1)), k = Math.min(N / 2 - 1, Math.round(f * N / sr)), v = (20 * Math.log10(mag[k] + 1e-9) + 90) / 90, p = pal(v), o = ((WH + r) * W + col) * 3;
      img[o] = p[0]; img[o + 1] = p[1]; img[o + 2] = p[2];
    }
  }
  // waveform strip (min/max per column, with a -6 dB guide and red where |x| >= 0.999)
  for (let col = 0; col < W; col++) {
    const a = Math.floor(col / W * total), b = Math.max(a + 1, Math.floor((col + 1) / W * total)); let mn = 0, mx = 0, clipped = false;
    for (let i = a; i < b && i < total; i++) { mn = Math.min(mn, x[i]); mx = Math.max(mx, x[i]); if (Math.abs(x[i]) >= .999) clipped = true; }
    for (let r = 0; r < WH; r++) { const v = 1 - 2 * r / (WH - 1), o = (r * W + col) * 3, on = v <= mx && v >= mn, guide = Math.abs(Math.abs(v) - .5) < .015;
      const c = on ? (clipped ? [255, 60, 60] : [120, 220, 255]) : guide ? [50, 50, 60] : [12, 12, 18]; img[o] = c[0]; img[o + 1] = c[1]; img[o + 2] = c[2]; }
  }
  // frequency guides at 100 Hz, 1 kHz, 10 kHz
  for (const f of [100, 1000, 10000]) { if (f >= fHi) continue; const r = Math.round((1 - Math.log(f / fLo) / Math.log(fHi / fLo)) * (rows - 1)); for (let col = 0; col < W; col += 3) { const o = ((WH + r) * W + col) * 3; img[o] = 200; img[o + 1] = 200; img[o + 2] = 200; } }
  const tot = bandE.reduce((s, e) => s + e, 0) || 1;
  return { png: png(W, H + WH, img), centroid: cenNum / (cenDen || 1), bands: bandE.map(e => Math.round(e / tot * 100)) };
}

// ------------------------------------------------------------------ 1. Node: the bank
async function nodeBank() {
  console.log('\n[1] bank (Node, pure DSP)');
  const dsp = await import(url.pathToFileURL(path.join(ROOT, 'js/audio/dsp.js')).href);
  const bank = await import(url.pathToFileURL(path.join(ROOT, 'js/audio/bank.js')).href);
  await import(url.pathToFileURL(path.join(ROOT, 'js/audio/sounds/index.js')).href);
  const extra = (await import(url.pathToFileURL(path.join(ROOT, 'js/audio/sounds/index.js')).href), bank.DEFS);
  const all = [...extra.keys()].filter(n => !ONLY || ONLY.some(p => n.startsWith(p)));
  const SR = 48000, rows = [], trim = {};
  let totalMs = 0, totalSamples = 0, bytes = 0;
  for (const name of all) {
    const r = bank.render(name, SR); totalMs += r.ms;
    const d = bank.getDef(name), lv = d.lvl || {};
    for (let vi = 0; vi < r.vars.length; vi++) {
      const chans = r.ch === 2 ? r.vars[vi] : [r.vars[vi]]; totalSamples += chans[0].length * chans.length; bytes += chans[0].length * chans.length * 4;
      const a = chans.map(c => dsp.analyze(c, r.sr)), pk = Math.max(...a.map(x => x.peak)), nan = a.reduce((s, x) => s + x.nan, 0), s50 = Math.max(...a.map(x => x.s50)), rms = Math.max(...a.map(x => x.rms)), dc = Math.max(...a.map(x => Math.abs(x.dc)));
      check(nan === 0, name + '#' + vi + ': no NaN (' + nan + ')');
      check(pk <= 1.0001, name + '#' + vi + ': no clipping (peak ' + pk.toFixed(3) + ')');
      if (!lv.raw) {
        check(pk > 1e-4, name + '#' + vi + ': not silent');
        check(dc < .02, name + '#' + vi + ': DC offset ' + dc.toFixed(4));
        const tgt = lv.rms != null ? ['rms', lv.rms, rms] : lv.peak != null ? ['peak', lv.peak, pk] : ['s50', lv.s50 == null ? -18 : lv.s50, s50];
        const err = 20 * Math.log10(tgt[2] + 1e-12) - tgt[1], ceilHit = pk >= Math.pow(10, (lv.max == null ? -1 : lv.max) / 20) * .999;
        if (Math.abs(err) > .25 && !ceilHit) check(false, name + '#' + vi + ': level ' + tgt[0] + ' off target by ' + err.toFixed(2) + ' dB');
        if (ceilHit && err < -3) warns.push(name + ' is peak-limited ' + err.toFixed(1) + ' dB under its ' + tgt[0] + ' target (crest factor too high)');
        // tail must have decayed (no clicks at the end) unless it loops
        if (!d.loop) { const c = chans[0], last = c.subarray(Math.max(0, c.length - Math.round(.003 * r.sr))); check(dsp.peakOf(last) < .02 + pk * .02, name + '#' + vi + ': ends silent (tail ' + dsp.peakOf(last).toFixed(3) + ')'); }
        else { const c = chans[0], j = Math.abs(c[0] - c[c.length - 1]); let dd = 0; for (let i = 1; i < c.length; i++) dd += (c[i] - c[i - 1]) ** 2; dd = Math.sqrt(dd / c.length);
          check(j < .02 + dd * 4, name + '#' + vi + ': seamless loop (jump ' + j.toFixed(3) + ' vs typical step ' + dd.toFixed(3) + ')'); }
      }
      if (vi === 0) { rows.push({ name, sr: r.sr, ch: r.ch, vars: r.vars.length, dur: chans[0].length / r.sr, peak: pk, s50, rms, gain: r.stats[0].gain, ms: r.ms }); trim[name] = { peak: +dbs(pk), s50: +dbs(s50), rms: +dbs(rms), gain: +r.stats[0].gain.toFixed(4), target: lv }; }
    }
  }
  console.log('  ' + all.length + ' sounds, ' + rows.reduce((s, r) => s + r.vars, 0) + ' variants, ' + (totalSamples / SR).toFixed(1) + ' s of audio, ' + (bytes / 1048576).toFixed(1)
    + ' MB as Float32, rendered in ' + (totalMs / 1000).toFixed(2) + ' s (' + (totalMs / Math.max(1, totalSamples / SR)).toFixed(1) + ' ms per second of audio)');
  const slow = rows.slice().sort((a, b) => b.ms - a.ms).slice(0, 6); console.log('  slowest: ' + slow.map(r => r.name + ' ' + r.ms.toFixed(0) + ' ms').join(', '));
  fs.writeFileSync(path.join(OUT, 'bank.json'), JSON.stringify(rows.map(r => ({ ...r, peak: +dbs(r.peak), s50: +dbs(r.s50), rms: +dbs(r.rms) })), null, 1));
  if (has('trim')) fs.writeFileSync(path.join(OUT, 'trim.json'), JSON.stringify(trim, null, 1));
  // key sounds: spectrograms + WAVs
  const KEY = (arg('shots', '') ? arg('shots').split(',') : ['gun:pistol_9', 'gun:pistol_45', 'gun:smg_9', 'gun:rifle_556', 'gun:rifle_762', 'gun:br_308', 'gun:sniper_338', 'gun:sniper_50', 'gun:shotgun_12', 'gun:lmg_762',
    'sup:pistol_9', 'sup:rifle_556', 'far:rifle_556', 'far:sniper_50', 'mech:ar', 'mech:ak', 'brass:r:hard', 'crack', 'whiz:super', 'whiz:sub', 'ric', 'imp:concrete', 'imp:metal', 'imp:wood', 'imp:glass', 'imp:dirt', 'imp:water',
    'st:concrete:h', 'st:gravel:h', 'st:snow:h', 'st:metal:h', 'st:water:h', 'st:wood:h', 'hit:body', 'hit:helmet', 'nd:boom:frag', 'nd:boomfar:frag', 'nd:flash', 'nd:fire', 'nd:hiss', 'nd:molotov', 'nd:zap', 'nd:emp', 'nd:pin', 'nd:spoon',
    'rl:magout:m', 'rl:magin:m', 'rl:charge:m', 'rl:pump', 'ui:click', 'ui:win', 'ui:reward', 'ev:gull', 'ev:horn', 'ev:siren', 'ev:thunder', 'amb:rain', 'amb:harbor_water', 'amb:wind', 'amb:crickets', 'radio:go'])
    .filter(n => bank.getDef(n) && (!ONLY || ONLY.some(p => n.startsWith(p))));
  if (arg('shots', '') || has('shots') || has('wav') || !ONLY) {
    const desc = [];
    for (const n of KEY) {
      const r = bank.render(n, SR), x = r.ch === 2 ? r.vars[0][0] : r.vars[0], base = n.replace(/[:]/g, '_');
      const sp = spectro(x, r.sr, n); fs.writeFileSync(path.join(OUT, 'spec_' + base + '.png'), sp.png);
      if (has('wav') || !ONLY) fs.writeFileSync(path.join(OUT, base + '.wav'), wav(r.ch === 2 ? r.vars[0] : [x], r.sr));
      desc.push(n.padEnd(20) + ' centroid ' + String(Math.round(sp.centroid)).padStart(5) + ' Hz  bands% <150 ' + sp.bands.join(' / ') + '  dur ' + (x.length / r.sr).toFixed(2) + ' s');
    }
    fs.writeFileSync(path.join(OUT, 'spectra.txt'), desc.join('\n') + '\n');
    console.log('  spectrograms + WAVs of ' + KEY.length + ' key sounds -> tools/test/out/audio/ (spectra.txt has centroids and band energy: <150 / 150-500 / .5-1.5k / 1.5-4k / 4-10k / >10k)');
  }
  return { rows };
}

// ------------------------------------------------------------------ 2. Browser: the runtime engine
// runs inside the page (self-contained: serialised by page.evaluate). A = the Audio API.
async function browserSuite(ONLY) {
  const { Audio: A } = await import('/js/audio/audio.js');
  const log = [], fails = [], pcm = [], ok = (c, m) => { if (!c) fails.push(m); return c; };
  const dB = x => 20 * Math.log10(Math.max(1e-9, x));
  const meas = (buf, t0 = 0, t1 = 1e9) => {
    const L = buf.getChannelData(0), R = buf.numberOfChannels > 1 ? buf.getChannelData(1) : L, sr = buf.sampleRate, i0 = Math.max(0, Math.floor(t0 * sr)), i1 = Math.min(L.length, Math.floor(t1 * sr));
    let pk = 0, el = 0, er = 0, nan = 0, hf = 0, on = -1, w = Math.round(.05 * sr), s50 = 0, acc = 0;
    for (let i = i0; i < i1; i++) { const a = L[i], b = R[i]; if (!Number.isFinite(a) || !Number.isFinite(b)) { nan++; continue; } const m = Math.max(Math.abs(a), Math.abs(b)); if (m > pk) pk = m; el += a * a; er += b * b;
      if (i > i0) { const d = (a - L[i - 1]); hf += d * d; } acc += (a * a + b * b) / 2; if (i - i0 >= w) { const o = L[i - w], p = R[i - w]; acc -= (o * o + p * p) / 2; } if (i - i0 >= w - 1 && acc / w > s50) s50 = acc / w; }
    for (let i = i0; i < i1; i++) if (Math.max(Math.abs(L[i]), Math.abs(R[i])) > pk * .1) { on = (i - i0) / sr; break; }
    const n = Math.max(1, i1 - i0);
    return { peak: pk, peakDb: dB(pk), rmsDb: dB(Math.sqrt((el + er) / 2 / n)), s50Db: dB(Math.sqrt(s50)), nan, lr: dB(Math.sqrt(er / Math.max(1e-12, el))), bright: dB(Math.sqrt(hf / Math.max(1e-12, el))), onset: on };
  };
  const keep = (name, buf) => { const enc = ch => { const f = buf.getChannelData(ch), u = new Uint8Array(f.buffer.slice(f.byteOffset, f.byteOffset + f.byteLength)); let s = ''; for (let i = 0; i < u.length; i += 32768) s += String.fromCharCode.apply(null, u.subarray(i, i + 32768)); return btoa(s); };
    pcm.push({ name, sr: buf.sampleRate, L: enc(0), R: enc(buf.numberOfChannels > 1 ? 1 : 0) }); };
  const want = p => !ONLY || ONLY.some(x => p.startsWith(x) || x.startsWith(p));
  const tb = performance.now();
  await A.init({ force: true }); await A.ready();
  const st0 = A.stats();
  log.push('init + warm bake: ' + Math.round(performance.now() - tb) + ' ms wall (' + st0.baked + ' sounds, ' + st0.mb + ' MB, worker CPU ' + st0.bakeMs + ' ms, ' + st0.baker + ')');
  ok(st0.baker === 'worker', 'baking runs in the worker');
  const R = (fn, secs, o) => A.render(fn, secs, o);
  const P0 = { x: 0, y: 1.6, z: 0 };
  const fams = ['pistol_9', 'pistol_45', 'pistol_mag', 'smg_9', 'smg_45', 'rifle_556', 'rifle_545', 'rifle_762', 'br_308', 'dmr_762', 'sniper_338', 'sniper_50', 'shotgun_12', 'lmg_556', 'lmg_762'];
  // ---- 1. guns: the shooter's own shot, unsuppressed and suppressed, outdoors
  if (want('gun')) {
    const rows = [];
    for (const f of fams) for (const sup of [false, true]) {
      const r = await R(A2 => A2.gun(f, { local: true, suppressed: sup }), 1.4, { space: { reverb: 'outdoor', surface: 'concrete' } }); const m = meas(r.buffer);
      ok(m.nan === 0 && m.peak <= 1.0001, 'gun ' + f + (sup ? ' sup' : '') + ': clean output (peak ' + m.peak.toFixed(3) + ', nan ' + m.nan + ')');
      ok(m.peak > (sup ? .02 : .2), 'gun ' + f + (sup ? ' sup' : '') + ': audible (peak ' + m.peakDb.toFixed(1) + ' dB)');
      rows.push(f.padEnd(11) + (sup ? ' sup' : '    ') + '  peak ' + m.peakDb.toFixed(1).padStart(5) + '  s50 ' + m.s50Db.toFixed(1).padStart(6) + '  rms ' + m.rmsDb.toFixed(1).padStart(6));
      if (!sup && (f === 'rifle_556' || f === 'pistol_9' || f === 'shotgun_12' || f === 'sniper_50')) keep('rt_local_' + f, r.buffer);
    }
    log.push('local gunshots (full chain, outdoor, all volumes 1):', ...rows.map(x => '  ' + x));
  }
  // ---- 2. distance: rifle shot ahead at d metres (arrival delay, level, brightness), then occluded
  if (want('dist')) {
    const rows = []; let prev = null, on3 = 0, first = null;
    for (const d of [3, 10, 25, 50, 100, 200, 400]) {
      const r = await R(A2 => A2.gun('rifle_556', { pos: { x: 0, y: 1.5, z: d } }), 3.2, { space: { reverb: 'outdoor' } }), m = meas(r.buffer);
      ok(m.nan === 0 && m.peak <= 1.0001, 'distance ' + d + ' m: clean');
      if (d === 3) { on3 = m.onset - 3 / 343; log.push('output latency of the chain (limiter look-ahead + HRTF): ' + (on3 * 1000).toFixed(1) + ' ms'); ok(on3 < .015, 'chain latency under 15 ms'); }
      ok(Math.abs(m.onset - on3 - d / 343) < .008, 'distance ' + d + ' m: arrives d / 343 s later (' + (m.onset - on3).toFixed(3) + ' vs ' + (d / 343).toFixed(3) + ')');
      if (prev) ok(m.s50Db < prev.s50Db + .5, 'distance ' + d + ' m: not louder than closer (' + m.s50Db.toFixed(1) + ' vs ' + prev.s50Db.toFixed(1) + ')');
      if (d === 3) first = m; if (d >= 100) ok(m.bright < first.bright - 4, 'distance ' + d + ' m: duller than at 3 m (air absorption: ' + (m.bright - first.bright).toFixed(1) + ' dB)');
      prev = m; rows.push(String(d).padStart(4) + ' m  onset ' + m.onset.toFixed(3) + ' s  s50 ' + m.s50Db.toFixed(1).padStart(6) + ' dB  brightness ' + m.bright.toFixed(1).padStart(6) + ' dB');
      if (d === 25 || d === 200) keep('rt_rifle_' + d + 'm', r.buffer);
    }
    log.push('rifle_556 by distance (outdoor):', ...rows.map(x => '  ' + x));
    const a = meas((await R(A2 => A2.gun('rifle_556', { pos: { x: 0, y: 1.5, z: 20 } }), 2, {})).buffer), b = meas((await R(A2 => A2.gun('rifle_556', { pos: { x: 0, y: 1.5, z: 20 }, occ: 1 }), 2, {})).buffer);
    ok(b.s50Db < a.s50Db - 3 && b.bright < a.bright - 3, 'occlusion: quieter and duller (' + (b.s50Db - a.s50Db).toFixed(1) + ' dB, brightness ' + (b.bright - a.bright).toFixed(1) + ' dB)');
    log.push('occlusion at 20 m: ' + (b.s50Db - a.s50Db).toFixed(1) + ' dB, brightness ' + (b.bright - a.bright).toFixed(1) + ' dB');
  }
  // ---- 2b. the mix: what a player hears relative to their own gun (s50 dBFS, all volumes 1, outdoor, concrete)
  if (want('mix')) {
    const rows = [], lvl = async (label, fn, secs = 1.5, o = {}) => { const m = meas((await R(fn, secs, { space: { reverb: 'outdoor', surface: 'concrete' }, ...o })).buffer); rows.push(label.padEnd(34) + ' s50 ' + m.s50Db.toFixed(1).padStart(6) + '  peak ' + m.peakDb.toFixed(1).padStart(6)); return m; };
    const own = await lvl('own rifle_556', A2 => A2.gun('rifle_556', { local: true }));
    await lvl('own pistol_9', A2 => A2.gun('pistol_9', { local: true }));
    await lvl('enemy rifle 25 m', A2 => A2.gun('rifle_556', { pos: { x: 10, y: 1.5, z: 23 } }));
    await lvl('enemy rifle 100 m', A2 => A2.gun('rifle_556', { pos: { x: 30, y: 1.5, z: 95 } }), 2);
    await lvl('enemy rifle 300 m', A2 => A2.gun('rifle_556', { pos: { x: 0, y: 1.5, z: 300 } }), 3);
    const s5 = await lvl('enemy running steps 5 m', A2 => A2.step('concrete', { pos: { x: 3, y: 0, z: 4 }, speed: 1 }));
    const s15 = await lvl('enemy running steps 15 m', A2 => A2.step('concrete', { pos: { x: 9, y: 0, z: 12 }, speed: 1 }));
    const s30 = await lvl('enemy running steps 30 m', A2 => A2.step('concrete', { pos: { x: 18, y: 0, z: 24 }, speed: 1 }));
    await lvl('own running step', A2 => A2.step('concrete', { local: true, speed: 1 }));
    await lvl('own walking step', A2 => A2.step('concrete', { local: true, speed: 0 }));
    await lvl('bullet impact 4 m', A2 => A2.impact('concrete', { pos: { x: 2, y: 1, z: 3.5 } }));
    await lvl('supersonic snap past the ear', A2 => A2.whiz({ pos: { x: .6, y: 1.6, z: .2 }, speed: 900 }));
    await lvl('reload magin (own)', A2 => A2.reload('magin', 'rifle_556', { local: true }));
    await lvl('frag at 15 m', A2 => A2.nade('frag', 'boom', { pos: { x: 0, y: .2, z: 15 } }), 3);
    const amb = await lvl('ambience city (rms in 2-6 s)', A2 => A2.ambience('city'), 6);
    rows.push('  ambience city rms ' + meas((await R(A2 => A2.ambience('city'), 6)).buffer, 2, 6).rmsDb.toFixed(1));
    await lvl('ui click (ui volume 1)', A2 => A2.ui('click'));
    log.push('mix balance (s50 / peak dBFS, all volumes 1):', ...rows.map(x => '  ' + x));
    ok(own.peak <= 1.0001 && own.peakDb > -4, 'own rifle peaks just under full scale (' + own.peakDb.toFixed(1) + ')');
    ok(s5.s50Db > -36 && s15.s50Db > -45 && s15.s50Db < s5.s50Db - 4 && s30.s50Db < s15.s50Db - 3, 'enemy footsteps: clearly audible at 5 m, fading by 15 / 30 m (' + s5.s50Db.toFixed(1) + ' / ' + s15.s50Db.toFixed(1) + ' / ' + s30.s50Db.toFixed(1) + ')');
  }
  // ---- 3. direction: HRTF right / left / behind, listener yaw
  if (want('dir')) {
    const side = async (x, z, yaw = 0) => { const b = (await R(A2 => A2.gun('pistol_9', { pos: { x, y: 1.6, z } }), 1, { listener: { p: P0, yaw, pitch: 0 } })).buffer, m = meas(b); return meas(b, m.onset, m.onset + .03).lr; };
    const r1 = await side(6, 0), r2 = await side(-6, 0), r3 = await side(0, 6, Math.PI / 2), r4 = await side(0, 6, -Math.PI / 2);
    ok(r1 > 4 && r2 < -4, 'HRTF: a shot on the right is louder in the right ear (' + r1.toFixed(1) + ' / ' + r2.toFixed(1) + ' dB R-L)');
    ok(r3 < -4 && r4 > 4, 'listener yaw (+z ahead, yaw 90 deg = facing +x): a source at +z is on the LEFT (' + r3.toFixed(1) + ') / RIGHT when yaw -90 (' + r4.toFixed(1) + ')');
    log.push('panning R-L dB: right ' + r1.toFixed(1) + ', left ' + r2.toFixed(1) + ', yaw+90 ' + r3.toFixed(1) + ', yaw-90 ' + r4.toFixed(1));
  }
  // ---- 4. spaces: the same local shot in each reverb (energy after 150 ms)
  if (want('space')) {
    const rows = [];
    for (const rv of ['outdoor', 'room', 'hall', 'tunnel']) {
      const r = await R(A2 => A2.gun('rifle_556', { local: true }), 3, { space: { reverb: rv } }), m = meas(r.buffer), t = meas(r.buffer, .15, 3), t2 = meas(r.buffer, .8, 3);
      ok(m.nan === 0 && m.peak <= 1.0001, 'space ' + rv + ': clean'); rows.push(rv.padEnd(8) + ' tail 0.15-3 s ' + t.rmsDb.toFixed(1) + ' dB, 0.8-3 s ' + t2.rmsDb.toFixed(1) + ' dB'); keep('rt_space_' + rv, r.buffer);
    }
    log.push('reverb tails (rifle, local):', ...rows.map(x => '  ' + x));
  }
  // ---- 5. every other public call
  const sweep = async (label, fn, secs, o = {}) => {
    const r = await R(fn, secs, o), m = meas(r.buffer);
    ok(m.nan === 0, label + ': no NaN'); ok(m.peak <= 1.0001, label + ': no clipping (' + m.peak.toFixed(3) + ')');
    if (!o.silent) ok(m.peak > 1e-3, label + ': audible (peak ' + m.peakDb.toFixed(1) + ')');
    return m;
  };
  if (want('foley')) {
    const surfs = ['concrete', 'brick', 'plaster', 'asphalt', 'tile', 'marble', 'wood', 'metal', 'sheetmetal', 'glass', 'carpet', 'fabric', 'dirt', 'grass', 'gravel', 'sand', 'snow', 'water', 'mud', 'rubber', 'rock', 'nonsense'];
    const rows = [];
    for (const s of surfs) {
      const m = await sweep('step ' + s, (A2, at) => { at(0, () => A2.step(s, { pos: { x: 3, y: 0, z: 2 }, speed: 1 })); at(.4, () => A2.step(s, { local: true, speed: 1 })); at(.8, () => A2.step(s, { local: true, speed: 0 })); at(1.2, () => A2.impact(s, { pos: { x: 4, y: 1, z: 6 } })); at(1.8, () => A2.land(s, 7, { local: true })); }, 2.6);
      rows.push(s.padEnd(10) + ' peak ' + m.peakDb.toFixed(1));
    }
    const q = meas((await R(A2 => A2.step('concrete', { pos: { x: 3, y: 0, z: 2 }, speed: 0 }), 1)).buffer); ok(q.peak < 1e-4, 'walking (speed 0) is silent for others');
    await sweep('whiz / hits / kill / hurt', (A2, at) => { at(0, () => A2.whiz({ pos: { x: .5, y: 1.6, z: .3 }, speed: 900 })); at(.3, () => A2.whiz({ pos: { x: -.5, y: 1.6, z: .3 }, speed: 300 }));
      at(.6, () => A2.whiz({ pos: { x: .5, y: 1.6, z: 0 }, pellet: true })); at(.9, () => A2.hit({ local: true })); at(1.1, () => A2.hit({ local: true, head: true, armor: true })); at(1.3, () => A2.hit({ local: true, head: true }));
      at(1.5, () => A2.hit({ local: true, armor: true })); at(1.7, () => A2.hit({ pos: { x: 5, y: 1.4, z: 5 } })); at(1.9, () => A2.kill({})); at(2.4, () => A2.kill({ head: true })); at(3, () => A2.hurt(12)); at(3.6, () => A2.hurt(40)); at(4.2, () => A2.hurt(80, { hp: 10 })); }, 7);
    await sweep('reload stages', (A2, at) => { let t = 0; for (const f of ['pistol_9', 'rifle_556', 'rifle_762', 'shotgun_12', 'sniper_338', 'lmg_556']) for (const s of ['start', 'magout', 'magin', 'shell', 'chamber', 'end', 'draw', 'firemode', 'ads', 'inspect', 'bogus', 'cancel']) { at(t, () => A2.reload(s, f, { local: true })); t += .12; } at(t, () => A2.dry('pistol_9')); at(t + .2, () => A2.dry('rifle_556', { local: true })); }, 10);
    await sweep('reload kinds', (A2, at) => { const G = [{ reloadKind: 'cylinder', archetype: 'revolver' }, { reloadKind: 'belt', archetype: 'belt_lmg' }, { reloadKind: 'break', archetype: 'shotgun_break' }, { reloadKind: 'shell', cycle: 'pump' }, { reloadKind: 'mag', cycle: 'bolt', archetype: 'bolt' }, { reloadKind: 'shell', cycle: 'lever' }];
      let t = 0; for (const g of G) for (const s of ['start', 'magout', 'magin', 'chamber', 'end']) { at(t, () => A2.reload(s, 'rifle_556', { local: true, gun: g })); t += .3; } }, 10);
    await sweep('manual-action guns', (A2, at) => { at(0, () => A2.gun('shotgun_12', { local: true, gun: { cycle: 'pump', rpm: 70 } })); at(1.2, () => A2.gun('sniper_338', { local: true, gun: { cycle: 'bolt', rpm: 41 } })); at(3, () => A2.gun('shotgun_12', { pos: { x: 6, y: 1.5, z: 6 }, gun: { cycle: 'lever', rpm: 80 }, id: 7 })); }, 5);
    await sweep('melee / misc', (A2, at) => { let t = 0; for (const k of ['knife', 'machete', 'axe', 'tomahawk']) for (const s of ['draw', 'swing', 'hit', 'stab']) { at(t, () => A2.melee(k, s, { local: true })); t += .25; }
      for (const n of ['bomb_beep', 'bomb_key', 'bomb_planted', 'bomb_defuse', 'bomb_defused', 'gate_open', 'door_open', 'door_close', 'pickup', 'drop', 'armor', 'glass', 'scope_in', 'light', 'zip']) { at(t, () => A2.sfx(n, { pos: { x: 3, y: 1, z: 4 } })); t += .4; }
      for (const n of ['cough', 'pain', 'death', 'exhale', 'breath']) { at(t, () => A2.vo(n, { pos: { x: 2, y: 1.6, z: 2 } })); t += .5; } for (const s of ['concrete', 'metal', 'dirt', 'water', 'wood']) { at(t, () => A2.bodyfall(s, { pos: { x: 2, y: 0, z: 3 } })); t += .5; }
      for (const n of ['go', 'enemy_spotted', 'need_backup', 'bomb_planted', 'x']) { at(t, () => A2.radio(n)); t += .6; } }, 24);
    log.push('footsteps + impacts per surface (peaks):', '  ' + rows.join(' | '));
  }
  if (want('nade')) {
    const kinds = ['frag', 'he', 'flash', 'smoke', 'molotov', 'incendiary', 'decoy', 'concussion', 'stun', 'gas', 'sticky', 'impact', 'cluster', 'thermite', 'sensor', 'emp', 'smoke_color', 'breach', 'flare', 'chaff', 'ninebang', 'mini', 'satchel', 'dynamite', 'medic'];
    const rows = [];
    for (const k of kinds) {
      const m = await sweep('nade ' + k, (A2, at) => { const p = { x: 4, y: .1, z: 8 };
        at(0, () => A2.nade(k, 'pin', { local: true, id: 1 })); at(.3, () => A2.nade(k, 'throw', { local: true, id: 1 })); at(.8, () => A2.nade(k, 'bounce', { pos: p, id: 1, speed: 7, surf: 'concrete' })); at(1.1, () => A2.nade(k, 'bounce', { pos: p, id: 1, speed: 3, surf: 'dirt' }));
        at(1.3, () => A2.nade(k, 'stick', { pos: p, id: 1 })); at(1.4, () => A2.nade(k, 'beep', { pos: p, id: 1 })); at(1.5, () => A2.nade(k, 'ping', { pos: p, id: 1 })); at(1.6, () => A2.nade(k, 'detonate', { local: true, id: 1 }));
        at(2, () => A2.nade(k, 'boom', { pos: p, id: 1, duration: 3 })); if (k === 'cluster') for (let i = 0; i < 6; i++) at(2.6 + i * .12, () => A2.nade(k, 'bomblet', { pos: { x: p.x + i - 3, y: 0, z: p.z + (i % 3) }, id: 1 }));
        if (k === 'ninebang') for (let i = 1; i < 9; i++) at(2 + i * .16, () => A2.nade(k, 'boom', { pos: p, id: 1 }));
        at(2.05, () => A2.nade(k, 'loop', { pos: p, id: 1, duration: 3 })); at(4.5, () => A2.nade(k, 'end', { pos: p, id: 1 })); }, 6.5);
      rows.push(k + ' ' + m.peakDb.toFixed(1) + '/' + m.s50Db.toFixed(1));
    }
    log.push('grenade sequences (pin..end, peak/s50 dB):', '  ' + rows.join(', '));
    for (const k of ['frag', 'flash', 'molotov', 'smoke']) { const r = await R((A2, at) => { at(0, () => A2.nade(k, 'boom', { pos: { x: 0, y: .2, z: 12 }, id: 9, duration: 4 })); }, 4.5, { space: { reverb: 'outdoor' } }); keep('rt_nade_' + k, r.buffer); }
    const far = meas((await R(A2 => A2.nade('frag', 'boom', { pos: { x: 0, y: 0, z: 300 } }), 4)).buffer), near = meas((await R(A2 => A2.nade('frag', 'boom', { pos: { x: 0, y: 0, z: 15 } }), 3)).buffer);
    ok(far.s50Db < near.s50Db - 10, 'a frag at 300 m is much quieter than at 15 m (' + far.s50Db.toFixed(1) + ' vs ' + near.s50Db.toFixed(1) + ')');
  }
  if (want('tin')) {
    const r = await R((A2, at) => { at(0, () => A2.ambience('city')); at(.2, () => A2.gun('rifle_556', { pos: { x: 3, y: 1.5, z: 10 } })); at(.5, () => A2.nade('flash', 'boom', { pos: { x: 0, y: 1, z: 4 } })); at(.5, () => A2.tinnitus(3)); at(1.2, () => A2.gun('rifle_556', { pos: { x: 3, y: 1.5, z: 10 } })); at(4.5, () => A2.gun('rifle_556', { pos: { x: 3, y: 1.5, z: 10 } })); }, 6);
    keep('rt_tinnitus', r.buffer); ok(meas(r.buffer).nan === 0 && meas(r.buffer).peak <= 1.0001, 'tinnitus render: clean');
    const shot = (muff) => R((A2, at) => { if (muff) at(0, () => A2.muffle(3, 1)); at(.6, () => A2.gun('rifle_556', { pos: { x: 3, y: 1.5, z: 10 } })); }, 1.4, { space: { reverb: 'none' } });
    const m1 = meas((await shot(true)).buffer, .6, 1.4), m2 = meas((await shot(false)).buffer, .6, 1.4);
    ok(m1.bright < m2.bright - 6 && m1.s50Db < m2.s50Db - 6, 'deafened (flash / tinnitus): the world is muffled (' + (m1.s50Db - m2.s50Db).toFixed(1) + ' dB, brightness ' + (m1.bright - m2.bright).toFixed(1) + ' dB)');
    const rec = R((A2, at) => { at(0, () => A2.muffle(1, 1)); at(4, () => A2.gun('rifle_556', { pos: { x: 3, y: 1.5, z: 10 } })); }, 5, { space: { reverb: 'none' } }), m3 = meas((await rec).buffer, 4, 5);
    ok(Math.abs(m3.s50Db - m2.s50Db) < 1.5, 'deafness recovers (' + (m3.s50Db - m2.s50Db).toFixed(1) + ' dB after 4 s)');
    log.push('deafen: muffled shot ' + (m1.s50Db - m2.s50Db).toFixed(1) + ' dB, brightness ' + (m1.bright - m2.bright).toFixed(1) + ' dB; recovered to ' + (m3.s50Db - m2.s50Db).toFixed(1) + ' dB');
  }
  if (want('ui')) {
    const names = ['hover', 'click', 'back', 'buy', 'deny', 'tick', 'round', 'win', 'lose', 'unlock', 'reward', 'notify', 'open', 'close', 'type', 'countdown', 'equip', 'mvp'];
    const rows = []; for (const n of names) { const m = await sweep('ui ' + n, A2 => A2.ui(n), n === 'win' || n === 'lose' || n === 'reward' ? 3.6 : 1.4); rows.push(n + ' ' + m.peakDb.toFixed(1) + '/' + m.s50Db.toFixed(1)); }
    log.push('ui (peak/s50 dB, ui volume 1):', '  ' + rows.join(', '));
  }
  if (want('music')) {
    for (const mood of ['menu', 'lobby', 'tension']) { const r = await R(A2 => A2.music(mood), 16, {}), m = meas(r.buffer, 3, 16); ok(m.nan === 0 && m.peak <= 1.0001 && m.peak > .01, 'music ' + mood + ': clean and audible'); log.push('music ' + mood + ': rms ' + m.rmsDb.toFixed(1) + ' dB, peak ' + m.peakDb.toFixed(1) + ' dB (music volume 1)'); if (mood === 'menu') keep('rt_music_menu', r.buffer); }
  }
  if (want('amb')) {
    const kinds = ['harbor', 'office', 'desert', 'city', 'snow', 'hospital', 'mall', 'metro', 'refinery', 'farm', 'ship', 'village', 'prison', 'lab', 'construction', 'estate', 'factory', 'bazaar', 'dam', 'suburb', 'club', 'hangar', 'railyard', 'interchange', 'outpost', 'storm', 'tower', 'nonsense'];
    const rows = [];
    for (const k of kinds) {
      const r = await R(A2 => { A2.ambience(k, { rain: k === 'railyard' || k === 'ship' ? .8 : 0, wind: k === 'snow' ? .6 : 0 }); }, 8, {});
      const m = meas(r.buffer, 3, 8); ok(m.nan === 0 && m.peak <= 1.0001 && m.peak > 1e-3, 'ambience ' + k + ': clean and audible (rms ' + m.rmsDb.toFixed(1) + ')'); rows.push(k + ' ' + m.rmsDb.toFixed(1));
      if (k === 'harbor' || k === 'farm' || k === 'railyard') keep('rt_amb_' + k, r.buffer);
    }
    // events: force a few
    await sweep('ambience events', (A2, at, e) => { const names = ['gull', 'crane', 'horn', 'buoy', 'siren', 'carpass', 'honk', 'thunder', 'steam', 'clank', 'drip', 'chime', 'ding', 'monitor', 'train', 'owl', 'bird', 'creak', 'buzzer', 'hammer', 'drill', 'heli', 'jet', 'bell', 'gust', 'door'];
      A2.ambience('harbor'); names.forEach((n, i) => at(i * .35, () => A2.ambEvent(n, 40))); }, 14);
    log.push('ambience beds (rms dB, sfx volume 1):', '  ' + rows.join(', '));
  }
  // ---- 6. voice limits + CPU
  if (want('cpu')) {
    const pos = i => ({ x: Math.sin(i) * (5 + i % 40), y: 1.5, z: Math.cos(i * 1.3) * (5 + i % 37) });
    const base = await R(() => {}, 2, {});
    const r = await R(A2 => { for (let i = 0; i < 100; i++) A2.gun(['rifle_556', 'smg_9', 'pistol_9', 'lmg_762'][i % 4], { pos: pos(i), id: i }); }, 2, {});
    const m = meas(r.buffer); ok(m.nan === 0 && m.peak <= 1.0001, '100 simultaneous shots: clean');
    ok(r.stats.peakVoices <= 96, 'voice cap holds (' + r.stats.peakVoices + ' live voices at most, ' + r.stats.stolen + ' stolen, ' + r.stats.dropped + ' dropped)');
    const spread = await R((A2, at) => { for (let i = 0; i < 100; i++) at(i * .02, () => A2.gun('rifle_556', { pos: pos(i), id: i % 10 })); }, 3, {});
    const one = await R(A2 => A2.gun('rifle_556', { pos: { x: 3, y: 1.5, z: 8 } }), 2, {});
    log.push('CPU: scheduling ' + (r.jsMs / 100 * 1000).toFixed(0) + ' us per gunshot on the main thread (100 shots, ' + r.stats.played + ' voices played)');
    log.push('CPU: rendering 2 s with 100 overlapping shots ' + r.renderMs.toFixed(0) + ' ms vs empty ' + base.renderMs.toFixed(0) + ' ms vs one shot ' + one.renderMs.toFixed(0) + ' ms (offline, faster than real time = ' + (2000 / r.renderMs).toFixed(1) + 'x)');
    log.push('CPU: 100 shots spread over 2 s (10 shooters, 50 rounds/s) rendered in ' + spread.renderMs.toFixed(0) + ' ms for 3 s of audio (' + (3000 / spread.renderMs).toFixed(1) + 'x real time), peak voices ' + spread.stats.peakVoices);
    ok(2000 / r.renderMs > 1.5, 'worst case renders faster than real time on this machine');
  }
  const st = A.stats(); log.push('baker after the suite: ' + st.baked + ' sounds, ' + st.mb + ' MB, errors ' + st.errors);
  ok(st.errors === 0, 'no bake errors');
  return { log, fails, pcm };
}
async function browser() {
  console.log('\n[2] runtime engine (Chromium OfflineAudioContext + live page)');
  const { launch, startServer } = await import('./lib.mjs');
  const { openPage } = await import('./smoke.mjs');
  const srv = await startServer(); const br = await launch();
  try {
    // the game page (index.html): proves the module graph loads with the rest of the game, then the suite runs there
    const g = await openPage(br, srv.url, '');
    await g.page.waitForFunction(() => window.LF, null, { timeout: 90000 });
    const res = await g.page.evaluate(browserSuite, ONLY);
    for (const l of res.log || []) console.log('  ' + l);
    for (const f of res.fails || []) check(false, 'browser: ' + f);
    for (const p of res.pcm || []) {
      const L = new Float32Array(Buffer.from(p.L, 'base64').buffer.slice(0)), Rr = new Float32Array(Buffer.from(p.R, 'base64').buffer.slice(0));
      fs.writeFileSync(path.join(OUT, p.name + '.wav'), wav([L, Rr], p.sr));
      const mono = new Float32Array(L.length); for (let i = 0; i < L.length; i++) mono[i] = (L[i] + Rr[i]) / 2;
      fs.writeFileSync(path.join(OUT, 'spec_' + p.name + '.png'), spectro(mono, p.sr, p.name).png);
    }
    if ((res.pcm || []).length) console.log('  wrote ' + res.pcm.length + ' runtime renders (WAV + spectrogram) to tools/test/out/audio/rt_*');
    // the live AudioContext path (worker bake, real-time voices, loops, music, ambience) for a second, then stop
    const live = await g.page.evaluate(async () => {
      const { Audio } = await import('/js/audio/audio.js');
      Audio.ui('click'); Audio.listener({ x: 0, y: 1.6, z: 0 }, 0, 0); Audio.setSpace({ reverb: 'room', surface: 'tile' });
      Audio.gun('rifle_556', { local: true }); Audio.gun('pistol_9', { pos: { x: 10, y: 1.5, z: 5 } }); Audio.step('gravel', { pos: { x: 2, y: 0, z: 1 }, speed: 1 });
      Audio.ambience('harbor', { rain: .5 }); Audio.music('menu'); Audio.nade('smoke', 'boom', { pos: { x: 3, y: 0, z: 3 }, id: 'n1' });
      await new Promise(r => setTimeout(r, 1500)); const st = Audio.stats(); Audio.nade('smoke', 'end', { id: 'n1' }); Audio.music('none'); Audio.stopAll();
      await new Promise(r => setTimeout(r, 600)); return { ...st, after: Audio.stats() };
    });
    console.log('  live page: ctx ' + live.state + ' @ ' + live.sampleRate + ' Hz, ' + live.baked + ' sounds baked (' + live.mb + ' MB), worker CPU ' + live.bakeMs + ' ms, voices ' + live.voices + ' (peak ' + live.peakVoices + '), loops ' + live.loops + ' -> after stopAll: voices ' + live.after.voices + ', loops ' + live.after.loops);
    check(live.state === 'running', 'live page: AudioContext running');
    check(live.loops >= 2, 'live page: ambience beds / smoke loop running (' + live.loops + ')');
    check(live.after.loops === 0, 'live page: stopAll clears loops');
    check(g.errs.length === 0, 'live page: zero console errors' + (g.errs.length ? ' -> ' + g.errs.slice(0, 5).join(' | ') : ''));
    await g.ctx.close();
    // a real match: game events -> SoundSystem (js/game/game.js) -> Audio, with bots fighting (simulated with debugStep)
    if (!ONLY || ONLY.includes('match')) {
      const m = await openPage(br, srv.url, '#dev&map=dev_range&mode=tdm&bots=6&q=low&autostart&nolens&nodyn&seed=3');
      await m.page.waitForFunction(() => window.LF && LF.game && LF.game.ready && LF.audio, null, { timeout: 180000 });
      const res = await m.page.evaluate(async () => {
        const A = LF.audio; await A.init({ force: true }); await A.ready(); const g = LF.game;
        const before = A.stats().played || 0; const t0 = performance.now();
        if (g.match && g.match.limit) { try { g.options.god = true; } catch (e) { /* ok */ } }
        for (let i = 0; i < 40; i++) { g.debugStep(.25); await new Promise(r => setTimeout(r, 20)); }
        const st = A.stats(); return { played: st.played - before, peak: st.peakVoices, voices: st.voices, culled: st.culled, stolen: st.stolen, ms: performance.now() - t0, amb: st.ambience, state: st.state };
      });
      console.log('  match (dev_range, 6 bots, 10 s simulated): ' + res.played + ' voices played, peak ' + res.peak + ' live, ' + res.culled + ' culled (inaudible), ' + res.stolen + ' stolen; ambience ' + res.amb + '; ' + res.ms.toFixed(0) + ' ms wall');
      check(res.played > 20, 'match: game events reach the audio engine (' + res.played + ' voices)');
      check(m.errs.length === 0, 'match: zero console errors' + (m.errs.length ? ' -> ' + m.errs.slice(0, 5).join(' | ') : ''));
      await m.ctx.close();
    }
  } finally { await br.close(); srv.stop(); }
}

async function main() {
  const t0 = Date.now();
  if (RUN_NODE) await nodeBank();
  if (RUN_BROWSER) await browser();
  if (warns.length) console.log('\nwarnings:\n  ' + warns.slice(0, 40).join('\n  '));
  console.log('\n' + (fails.length ? 'FAILED ' + fails.length + ' checks' : 'audio: all checks passed') + ' (' + ((Date.now() - t0) / 1000).toFixed(1) + ' s)');
  process.exit(fails.length ? 1 : 0);
}
if (import.meta.url === url.pathToFileURL(process.argv[1]).href) main().catch(e => { console.error(e); process.exit(1); });
