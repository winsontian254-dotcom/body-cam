// LIVE FIRE — graphics test: every material / texture / HDRI loads (no 404s, no procedural fallbacks, no console errors),
// load time and GPU memory estimate per quality tier, plus screenshots of the HDRIs and the street-corner scene.
//   node tools/test/gfx.mjs            all tiers + all HDRIs + street shots (slow on SwiftShader: several minutes)
//   node tools/test/gfx.mjs --quick    low + medium, two HDRIs, one street shot
// Screenshots: tools/test/out/gfx/. Exit code 1 when anything failed to load or logged an error.
import { launch, startServer, errors, OUT, ROOT } from './lib.mjs';
import fs from 'node:fs'; import path from 'node:path';

const quick = process.argv.includes('--quick');
const dir = path.join(OUT, 'gfx'); fs.mkdirSync(dir, { recursive: true });
const TIERS = quick ? ['low', 'medium'] : ['low', 'medium', 'high', 'ultra'];
const HDRIS = quick ? ['partly_cloudy', 'night_city'] : JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/hdri/hdri.json'), 'utf8')) && Object.keys(JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/hdri/hdri.json'), 'utf8')));
const STREET = quick ? [['street_day', 'time=day']] : [
  ['street_day', 'time=day&lens=full'], ['street_day_off', 'time=day&lens=off'], ['street_golden', 'time=dusk'],
  ['street_overcast', 'time=overcast'], ['street_rain', 'time=overcast&weather=rain'], ['street_night', 'time=night'],
  ['street_night_rain', 'time=night&weather=rain'], ['street_snow', 'time=day&weather=snow'], ['street_dust', 'time=day&weather=dust'],
];
// rough GPU memory model (bytes) for a 1920x1080 frame at the tier's render scale
const QUAL = {
  low: { scale: .75, shadow: 1024, cascades: 1, ssao: 0, sky: 1024 }, medium: { scale: .9, shadow: 1024, cascades: 2, ssao: .5, sky: 2048 },
  high: { scale: 1, shadow: 2048, cascades: 3, ssao: .75, sky: 2048 }, ultra: { scale: 1, shadow: 2048, cascades: 4, ssao: 1, sky: 2048 },
};
function gpuEstimate(tier, texBytes) {
  const q = QUAL[tier], w = 1920 * q.scale, h = 1080 * q.scale;
  const ibl = 6 * 512 * 512 * 8 * 1.333;                       // .env decoded to half float, with mips
  const sky = q.sky * q.sky / 2 * 4 * 1.333;
  const shadow = q.shadow * q.shadow * 8 * q.cascades;         // half-float RGBA shadow maps (CSM: a texture array)
  const rts = w * h * (8 * 4 + 4 * 3) + (q.ssao ? w * h * q.ssao * q.ssao * (16 + 8 * 2) : 0) + w * h * 4 * 1.5; // HDR chain, LDR, SSAO/prepass, bloom
  return { textures: texBytes, ibl, sky, shadow, targets: rts, total: texBytes + ibl + sky + shadow + rts };
}
const MB = b => (b / 1048576).toFixed(0) + ' MB';

const srv = await startServer(8100 + Math.floor(Math.random() * 800));
const browser = await launch();
const cache = path.join(ROOT, 'tools/test/out/cache');
let failures = 0;
async function open(query, { w = 480, h = 270, frames = 3 } = {}) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  const errs = errors(page), bad = [];
  page.on('response', r => { if (r.status() >= 400) bad.push(r.status() + ' ' + r.url()); });
  if (fs.existsSync(path.join(cache, 'babylon.js'))) {
    await page.route(/cdn\.jsdelivr\.net\/npm\/babylonjs@9\.31\.0\/babylon\.js/, r => r.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(path.join(cache, 'babylon.js')) }));
  }
  const t0 = Date.now();
  await page.goto(srv.url + '/tools/preview/materials.html?clean&' + query, { waitUntil: 'load' });
  await page.waitForFunction('window.PV_READY === true', null, { timeout: 300000, polling: 300 });
  const f0 = await page.evaluate('window.PV.stats().frames');
  await page.waitForFunction(`window.PV.stats().frames >= ${f0 + frames}`, null, { timeout: 300000, polling: 300 });
  const stats = await page.evaluate('window.PV.stats()');
  return { page, errs, bad, stats, wall: Date.now() - t0 };
}
function check(name, r) {
  const probs = [...r.errs, ...r.bad.map(b => 'http ' + b), ...r.stats.failed.map(f => 'texture failed: ' + f)];
  if (r.stats.fallbacks) probs.push(r.stats.fallbacks + ' procedural fallbacks');
  if (probs.length) { failures++; console.log('  FAIL ' + name + '\n    ' + probs.join('\n    ')); }
  return probs.length === 0;
}

console.log('== materials: every material at every tier ==');
const rows = [];
for (const tier of TIERS) {
  const r = await open('scene=all&lens=off&q=' + tier, { w: 960, h: 540, frames: 2 });
  const ok = check('all@' + tier, r);
  const est = gpuEstimate(tier, r.stats.bytes);
  rows.push({ tier, ok, materials: r.stats.materials, textures: r.stats.textures, load: r.stats.loadMs, est });
  await r.page.screenshot({ path: path.join(dir, `materials_${tier}.png`), timeout: 180000 });
  await r.page.close();
}
for (const r of rows) console.log(`  ${r.tier.padEnd(6)} ${r.ok ? 'ok  ' : 'FAIL'} ${r.materials} materials, ${r.textures} textures, load ${(r.load / 1000).toFixed(1)} s (SwiftShader)  ` +
  `GPU est: textures ${MB(r.est.textures)} + ibl ${MB(r.est.ibl)} + sky ${MB(r.est.sky)} + shadows ${MB(r.est.shadow)} + targets ${MB(r.est.targets)} = ${MB(r.est.total)} (all materials loaded)`);

console.log('== HDRIs ==');
for (const h of HDRIS) {
  const r = await open('scene=hdri&q=low&hdri=' + h, { w: 640, h: 360 });
  check('hdri ' + h, r);
  await r.page.screenshot({ path: path.join(dir, `hdri_${h}.png`), timeout: 180000 });
  console.log(`  ${h.padEnd(14)} ${JSON.stringify(r.stats.env)}`);
  await r.page.close();
}

console.log('== street corner ==');
for (const [name, q] of STREET) {
  const r = await open('scene=street&q=medium&' + q, { w: 960, h: 540, frames: 4 });
  check(name, r);
  await r.page.screenshot({ path: path.join(dir, name + '.png'), timeout: 180000 });
  console.log(`  ${name.padEnd(18)} load ${(r.stats.loadMs / 1000).toFixed(1)} s  ${JSON.stringify(r.stats.env)}`);
  await r.page.close();
}

await browser.close(); srv.stop();
console.log(failures ? `\n${failures} check(s) FAILED` : '\nall graphics checks passed', '- screenshots in', dir);
process.exit(failures ? 1 : 0);
