// LIVE FIRE - HDRI baker (asset pipeline, called by tools/fetch-assets.py; never loaded by the game).
//   node tools/bake-env.mjs <spec.json>     spec = { out: dir, items: [{ name, file /*2K .hdr*/ }] }
// For every HDRI, in headless Chromium with Babylon:
//   1. read the equirect HDR (BABYLON.HDRTools), find the sun disc (when there is one), measure its direction, colour and
//      irradiance, and paint it out of the IBL copy (feathered, replaced by the surrounding sky) so the IBL does not light the
//      scene a second time: env.js adds the sun back as a DirectionalLight with shadows;
//   2. prefilter it into a 512 px cube (HDRCubeTexture prefilterOnLoad) and write a Babylon .env (RGBD, WebP);
//   3. write <name>_sky.jpg: the visible sky as a 2K LDR equirect of the original HDR (scaled by skyScale);
//   4. write <out>/hdri.json with the measurements (directions are in Babylon world space, see dirOf()).
import fs from 'node:fs'; import path from 'node:path'; import url from 'node:url'; import { createRequire } from 'node:module';
const require = createRequire(import.meta.url); const { chromium } = require('playwright');
const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const spec = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const BJS = 'https://cdn.jsdelivr.net/npm/babylonjs@9.31.0/babylon.js';
const LOCAL_BJS = path.join(ROOT, 'tools/test/out/cache/babylon.js');
const NO_SUN = new Set(['overcast', 'storm', 'fog', 'snow', 'night', 'night_city', 'warehouse']);

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 64, height: 64 } });
page.on('console', m => console.log('  [page]', m.text()));
page.on('pageerror', e => console.log('  [pageerror]', e.message));
await page.route('http://bake.local/**', async route => {
  const u = new URL(route.request().url());
  if (u.pathname === '/') return route.fulfill({ contentType: 'text/html', body: `<!doctype html><canvas id=c width=64 height=64></canvas><script src="/babylon.js"></script>` });
  if (u.pathname === '/babylon.js') {
    if (fs.existsSync(LOCAL_BJS)) return route.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(LOCAL_BJS) });
    const r = await fetch(BJS); return route.fulfill({ contentType: 'text/javascript', body: Buffer.from(await r.arrayBuffer()) });
  }
  if (u.pathname.startsWith('/hdr/')) {
    const it = spec.items.find(i => i.name === decodeURIComponent(u.pathname.slice(5)));
    return route.fulfill({ contentType: 'application/octet-stream', body: fs.readFileSync(it.file) });
  }
  route.fulfill({ status: 404, body: '' });
});
await page.goto('http://bake.local/');
await page.waitForFunction('typeof BABYLON !== "undefined"');

const metaFile = path.join(spec.out, 'hdri.json');
const meta = fs.existsSync(metaFile) ? JSON.parse(fs.readFileSync(metaFile, 'utf8')) : {};
for (const it of spec.items) {
  const t0 = Date.now();
  const res = await page.evaluate(async ({ name, noSun }) => {
    const B = BABYLON;
    if (!window._eng) { window._eng = new B.Engine(document.getElementById('c'), false, { preserveDrawingBuffer: true }); window._scn = new B.Scene(window._eng); }
    const scene = window._scn;
    const buf = new Uint8Array(await (await fetch('/hdr/' + encodeURIComponent(name))).arrayBuffer());
    const hdr = B.HDRTools.RGBE_ReadHeader(buf);
    const px = B.HDRTools.RGBE_ReadPixels(buf, hdr);
    const W = hdr.width, H = hdr.height;
    // Direction of pixel (x, y) (row 0 = top of the image = zenith) in Babylon world space (left-handed, +Y up).
    // Verified against the baked cube in tools/preview (the sun's mirror image sits where the DirectionalLight comes from).
    const dirOf = (x, y) => { const th = ((x + .5) / W * 2 - 1) * Math.PI, ph = (y + .5) / H * Math.PI;
      return [Math.sin(ph) * Math.cos(th), Math.cos(ph), Math.sin(ph) * Math.sin(th)]; };
    const lum = i => .2126 * px[i] + .7152 * px[i + 1] + .0722 * px[i + 2];
    const dW = 2 * Math.PI / W, dH = Math.PI / H;
    // statistics
    let maxL = 0, maxI = 0; const sky = [0, 0, 0], gnd = [0, 0, 0], hor = [0, 0, 0]; let skyW = 0, gndW = 0, horW = 0;
    const up = [0, 0, 0]; const dom = [0, 0, 0];
    for (let y = 0; y < H; y++) {
      const ph = (y + .5) / H * Math.PI, sw = Math.sin(ph) * dW * dH, cy = Math.cos(ph);
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 3, L = lum(i);
        if (L > maxL) { maxL = L; maxI = i; }
        const d = dirOf(x, y);
        for (let c = 0; c < 3; c++) { dom[c] += d[c] * L * sw; }
        if (cy > 0) { for (let c = 0; c < 3; c++) { sky[c] += px[i + c] * sw; up[c] += px[i + c] * cy * sw; } skyW += sw; }
        else { for (let c = 0; c < 3; c++) gnd[c] += px[i + c] * sw; gndW += sw; }
        if (Math.abs(cy) < .09) { for (let c = 0; c < 3; c++) hor[c] += px[i + c] * sw; horW += sw; }
      }
    }
    for (let c = 0; c < 3; c++) { sky[c] /= skyW; gnd[c] /= gndW; hor[c] /= horW; up[c] /= Math.PI; }
    const orig = px.slice();   // the visible sky keeps the real sun and its lit cloud rims; only the IBL is painted
    const dl = Math.hypot(...dom) || 1;
    const out = { w: W, h: H, maxLum: maxL, sky, ground: gnd, horizon: hor, upIrr: up, dominant: dom.map(v => v / dl), sun: null };
    // sun: brightest pixel, a 7 degree cone; everything brighter than 4x the ring around it is the disc + aureole core
    if (!noSun) {
      const p0 = maxI / 3, sx = p0 % W, sy = (p0 - sx) / W, sd = dirOf(sx, sy);
      const cone = Math.cos(7 * Math.PI / 180), ringIn = Math.cos(8 * Math.PI / 180), ringOut = Math.cos(12 * Math.PI / 180);
      const ys0 = Math.max(0, Math.floor((Math.acos(Math.min(1, sd[1])) - .22) / Math.PI * H)), ys1 = Math.min(H - 1, Math.ceil((Math.acos(Math.max(-1, sd[1])) + .22) / Math.PI * H));
      const ring = []; const ringC = [];
      for (let y = ys0; y <= ys1; y++) for (let x = 0; x < W; x++) {
        const d = dirOf(x, y), c = d[0] * sd[0] + d[1] * sd[1] + d[2] * sd[2];
        if (c < ringIn && c > ringOut) { const i = (y * W + x) * 3; ring.push(lum(i)); ringC.push([px[i], px[i + 1], px[i + 2]]); }
      }
      ring.sort((a, b) => a - b); const med = ring[ring.length >> 1] || 0;
      const rc = [0, 0, 0]; let rn = 0; for (const c of ringC) { const l = .2126 * c[0] + .7152 * c[1] + .0722 * c[2]; if (l <= med * 1.5) { rc[0] += c[0]; rc[1] += c[1]; rc[2] += c[2]; rn++; } }
      for (let c = 0; c < 3; c++) rc[c] /= Math.max(1, rn);
      // feathered paint-out: weight 1 for the disc, fading over the bright aureole / sun-lit cloud rims, 0 outside the cone
      const E = [0, 0, 0], ctr = [0, 0, 0]; let n = 0;
      for (let y = ys0; y <= ys1; y++) {
        const ph = (y + .5) / H * Math.PI, sw = Math.sin(ph) * dW * dH;
        for (let x = 0; x < W; x++) {
          const d = dirOf(x, y), c = d[0] * sd[0] + d[1] * sd[1] + d[2] * sd[2]; if (c < cone) continue;
          const i = (y * W + x) * 3, L = lum(i);
          const t = Math.min(1, Math.max(0, (L - med * 2.5) / (med * 5))), wgt = t * t * (3 - 2 * t) * Math.min(1, (c - cone) / ((1 - cone) * .35));
          if (wgt <= 0) continue;
          for (let k = 0; k < 3; k++) { const nv = px[i + k] + (rc[k] * 1.15 - px[i + k]) * wgt; E[k] += Math.max(0, px[i + k] - nv) * sw; px[i + k] = nv; }
          const w = Math.max(0, L - med) * wgt * sw; ctr[0] += d[0] * w; ctr[1] += d[1] * w; ctr[2] += d[2] * w; n++;
        }
      }
      const cl = Math.hypot(...ctr) || 1, mx = Math.max(...E) || 1;
      // irradiance of the disc / PI = the DirectionalLight intensity that matches the IBL's units (Babylon PBR)
      out.sun = { dir: ctr.map(v => v / cl), color: E.map(v => v / mx), illum: (.2126 * E[0] + .7152 * E[1] + .0722 * E[2]) / Math.PI, pixels: n, ring: med };
      // the sun's contribution to an upward surface, for exposure
      out.sunUp = out.sun.illum * Math.max(0, out.sun.dir[1]);
    }
    // the visible sky: an LDR equirect JPG of the ORIGINAL panorama, scaled so the 99.7th percentile is white
    // (env.js multiplies it back by skyScale; the sky shader adds an HDR sun disc + glow at sun.dir for bloom)
    {
      const SW = Math.min(W, 2048), SH = SW >> 1, sxs = W / SW;
      const ls = new Float32Array(SW * SH);
      const samp = (x, y) => (Math.min(H - 1, Math.floor(y * sxs)) * W + Math.min(W - 1, Math.floor(x * sxs))) * 3;
      const lumO = i => .2126 * orig[i] + .7152 * orig[i + 1] + .0722 * orig[i + 2];
      for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) ls[y * SW + x] = lumO(samp(x, y));
      const sorted = Float32Array.from(ls).sort(); const scale = Math.max(1e-4, sorted[Math.floor(sorted.length * .997)]);
      const cv = document.createElement('canvas'); cv.width = SW; cv.height = SH; const g = cv.getContext('2d');
      const im = g.createImageData(SW, SH); const enc = v => { v = Math.min(1, Math.max(0, v / scale));
        return Math.round(255 * (v <= .0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - .055)); };
      for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) { const i = samp(x, y), o = (y * SW + x) * 4;
        im.data[o] = enc(orig[i]); im.data[o + 1] = enc(orig[i + 1]); im.data[o + 2] = enc(orig[i + 2]); im.data[o + 3] = 255; }
      g.putImageData(im, 0, 0);
      const blob = await new Promise(r => cv.toBlob(r, 'image/jpeg', .9));
      const sb = new Uint8Array(await blob.arrayBuffer()); let sbin = ''; for (let i = 0; i < sb.length; i += 0x8000) sbin += String.fromCharCode.apply(null, sb.subarray(i, i + 0x8000));
      out.skyScale = scale; out.skyJpg = btoa(sbin);
    }
    // re-encode the (painted) panorama as RLE RGBE so HDRCubeTexture can read it
    const head = new TextEncoder().encode(`#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y ${H} +X ${W}\n`);
    const body = new Uint8Array(H * (4 + W * 4 + Math.ceil(W / 128) * 4));
    let o = 0; const ch = new Uint8Array(W * 4);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 3, r = px[i], g = px[i + 1], b = px[i + 2], m = Math.max(r, g, b);
        if (m < 1e-32) { ch[x] = ch[W + x] = ch[2 * W + x] = ch[3 * W + x] = 0; continue; }
        let e = Math.floor(Math.log2(m)) + 1, f = 256 / Math.pow(2, e);   // frexp: value = byte * 2^e / 256
        if (m * f >= 256) { e++; f *= .5; }
        ch[x] = Math.floor(r * f); ch[W + x] = Math.floor(g * f); ch[2 * W + x] = Math.floor(b * f); ch[3 * W + x] = e + 128;
      }
      body[o++] = 2; body[o++] = 2; body[o++] = W >> 8; body[o++] = W & 255;
      for (let c = 0; c < 4; c++) for (let x = 0; x < W; x += 128) { const n = Math.min(128, W - x); body[o++] = n; body.set(ch.subarray(c * W + x, c * W + x + n), o); o += n; }
    }
    const file = new Uint8Array(head.length + o); file.set(head); file.set(body.subarray(0, o), head.length);
    const blobUrl = URL.createObjectURL(new Blob([file], { type: 'application/octet-stream' }));
    const tex = await new Promise((res, rej) => {
      const t = new B.HDRCubeTexture(blobUrl, scene, 512, false, true, false, true, () => res(t), (m, e) => rej(new Error('hdr load ' + m + ' ' + e)));
    });
    await new Promise(r => { const tick = () => tex.isReady() ? r() : setTimeout(tick, 50); tick(); });
    const env = await B.EnvironmentTextureTools.CreateEnvTextureAsync(tex, { imageType: 'image/webp', imageQuality: .82 });
    const bytes = new Uint8Array(env); let bin = ''; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    tex.dispose(); URL.revokeObjectURL(blobUrl);
    return { meta: out, b64: btoa(bin) };
  }, { name: it.name, noSun: NO_SUN.has(it.name) });
  const buf = Buffer.from(res.b64, 'base64');
  fs.writeFileSync(path.join(spec.out, it.name + '.env'), buf);
  const sky = Buffer.from(res.meta.skyJpg, 'base64'); fs.writeFileSync(path.join(spec.out, it.name + '_sky.jpg'), sky);
  const m = res.meta; const r3 = a => a && a.map(v => +(+v).toPrecision(4));
  meta[it.name] = { sun: m.sun && { dir: r3(m.sun.dir), color: r3(m.sun.color), illum: +m.sun.illum.toPrecision(4) }, sunUp: m.sunUp ? +m.sunUp.toPrecision(4) : 0,
    upIrr: r3(m.upIrr), sky: r3(m.sky), horizon: r3(m.horizon), ground: r3(m.ground), dominant: r3(m.dominant), maxLum: +m.maxLum.toPrecision(4), skyScale: +m.skyScale.toPrecision(4) };
  console.log(`[bake] ${it.name}: env ${(buf.length / 1e6).toFixed(2)} MB, sky ${(sky.length / 1e6).toFixed(2)} MB in ${((Date.now() - t0) / 1000).toFixed(0)} s, sun ${JSON.stringify(meta[it.name].sun)}`);
  fs.writeFileSync(metaFile, JSON.stringify(meta, null, 1) + '\n');
}
await browser.close();
