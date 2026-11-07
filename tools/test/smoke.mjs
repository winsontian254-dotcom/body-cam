// Smoke test: boots LIVE FIRE headless, checks the title, then the dev sandbox on dev_range; walks through the map with the
// real movement code via window.LF (stairs, mantle, gates), takes screenshots, and FAILS on any console error.
//   node tools/test/smoke.mjs [--map=dev_range] [--keep]      screenshots -> tools/test/out/smoke-*.png
import { launch, startServer, waitFor, shot, errors, ROOT } from './lib.mjs';
import fs from 'node:fs'; import path from 'node:path';

const arg = (k, d) => { const a = process.argv.find(s => s.startsWith('--' + k + '=')); return a ? a.split('=')[1] : d; };
const MAP = arg('map', 'dev_range');
const CACHE = path.join(ROOT, 'tools/test/out/cache');

/** Serve the pinned CDN scripts from tools/test/out/cache when present (SwiftShader runs are slow enough already). */
export async function cdnCache(ctx) {
  await ctx.route(/cdn\.jsdelivr\.net\/npm\/(babylonjs(?:-loaders)?)@9\.31\.0\/(.+)$/, async (route) => {
    const m = route.request().url().match(/npm\/(babylonjs(?:-loaders)?)@9\.31\.0\/(.+)$/);
    const f = m && path.join(CACHE, m[2]);
    if (f && fs.existsSync(f)) return route.fulfill({ status: 200, contentType: 'text/javascript', body: fs.readFileSync(f) });
    const resp = await route.fetch();
    try { fs.mkdirSync(CACHE, { recursive: true }); if (resp.ok() && f) fs.writeFileSync(f, await resp.body()); } catch (e) { /* cache is optional */ }
    return route.fulfill({ response: resp });
  });
}
export async function openPage(browser, base, hash, { width = 960, height = 540 } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height } });
  await cdnCache(ctx);
  const page = await ctx.newPage();
  const errs = errors(page);
  page.on('console', m => { if (m.type() === 'warning' && /\[map|\[loop|\[input/.test(m.text())) console.log('    warn: ' + m.text()); });
  await page.goto(base + '/index.html' + (hash ? '#' + hash.replace(/^#/, '') : ''), { waitUntil: 'load' });
  return { ctx, page, errs };
}
const frames = async (page, n = 3) => { const f0 = await page.evaluate(() => LF.loop.loopStats.frames); await page.waitForFunction(k => LF.loop.loopStats.frames >= k, f0 + n, { timeout: 60000, polling: 100 }); };

async function main() {
  const t0 = Date.now();
  const srv = await startServer();
  const browser = await launch();
  const fails = [];
  const check = (cond, msg) => { if (!cond) { fails.push(msg); console.log('  FAIL ' + msg); } else console.log('  ok   ' + msg); };
  try {
    // ---------------------------------------------------------------- 1. title boot
    {
      const { ctx, page, errs } = await openPage(browser, srv.url, '');
      await waitFor(page, () => document.querySelector('.core-title, #ui .menu, #ui [data-screen]') && window.LF, 60000);
      check(await page.evaluate(() => getComputedStyle(document.getElementById('boot')).display === 'none'), 'title: boot overlay hidden');
      check(await page.evaluate(() => LF.engine.webGLVersion === 2), 'title: WebGL2 engine');
      await shot(page, 'smoke-title');
      check(errs.length === 0, 'title: zero console errors' + (errs.length ? ' -> ' + errs.join(' | ') : ''));
      await ctx.close();
    }
    // ---------------------------------------------------------------- 2. sandbox on the test map
    const { ctx, page, errs } = await openPage(browser, srv.url, '#dev&sandbox&map=' + MAP + '&q=low&nolens&nodyn');
    await waitFor(page, () => window.LF && LF.sandbox, 180000);
    await frames(page, 4);
    const st = await page.evaluate(() => { const s = LF.sandbox.stats(); return { ...s, boot: LF.sandbox.bootMs, warnings: LF.sandbox.info.warnings, lightMode: LF.sandbox.info.lightMode, world: LF.sandbox.info.world.stats() }; });
    console.log('  map ' + MAP + ': build ' + st.build.msTotal + ' ms (def ' + st.build.msDef + ', meshes ' + st.build.msMeshes + ', world ' + st.build.msWorld + ', nav ' + st.build.msNav + ', lights ' + st.build.msLights + ')'
      + ', sandbox boot ' + st.boot + ' ms, ' + st.build.meshes + ' meshes, ' + st.build.tris + ' tris, ' + st.world.colliders + ' colliders, ' + st.build.navNodes + ' nav nodes, lights ' + st.build.lights + ' (' + st.lightMode + ')');
    if (st.warnings.length) console.log('  builder warnings: ' + st.warnings.join(' | '));
    await shot(page, 'smoke-lobby');
    const dc1 = await page.evaluate(() => LF.sandbox.stats());
    console.log('  lobby view: ' + dc1.drawCalls + ' draw calls, ' + dc1.activeMeshes + ' active meshes, ' + dc1.tris + ' tris');

    // walk forward into the closed gate: blocked
    const r1 = await page.evaluate(() => { const S = LF.sandbox, p = S.player; S.teleport(-39, 0.13, 0, Math.PI / 2, 0); S.step(4, {}); const x0 = p.pos.x; S.step(192, { mz: 1 });
      const g = S.info.gateList[0]; return { x0, x1: p.pos.x, gx: g.x }; });
    check(Math.abs(r1.x1 - (r1.gx - 0.12 - 0.32)) < 0.02, 'closed gate stops the player at the shutter (x ' + r1.x1.toFixed(2) + ')');
    // open the gates and walk out
    const r2 = await page.evaluate(() => { const S = LF.sandbox, p = S.player; S.gates(true); S.step(100, {}); S.step(256, { mz: 1 }); return { x: p.pos.x, open: S.info.gateList.every(g => g.open) }; });
    check(r2.open && r2.x > -28, 'gates open, walked out of the lobby (x ' + r2.x.toFixed(2) + ')');
    // stairs: climb to the second floor
    const r3 = await page.evaluate(() => { const S = LF.sandbox, p = S.player; S.teleport(-8.6, 0.13, 6.6, Math.PI / 2, 0); S.step(4, {}); S.step(140, { mz: 1 }); return { y: p.pos.y, x: p.pos.x, g: p.onGround }; });
    check(Math.abs(r3.y - 3.32) < 0.02 && r3.g, 'climbed the stairs to the second floor (y ' + r3.y.toFixed(2) + ')');
    // mantle onto a 1 m crate (site B)
    const r4 = await page.evaluate(() => { const S = LF.sandbox, p = S.player; S.teleport(-18.7, 0.01, 13.8, 0, 0); S.step(8, {}); let m = null;
      for (let i = 0; i < 90; i++) { S.step(1, { mz: m ? 0 : 1, buttons: i > 6 && i < 40 ? 4 : 0 }); if (S.stats().lastEv.mantled) m = 1; } return { y: p.pos.y, m: S.stats().lastEv.mantled }; });
    check(Math.abs(r4.y - 1.0) < 0.02, 'mantled onto the 1 m crate (y ' + r4.y.toFixed(2) + ', ' + r4.m + ')');
    // terrain: walk up the hill
    const r5 = await page.evaluate(() => { const S = LF.sandbox, p = S.player; S.teleport(30, 0.01, 8, 0, 0); S.step(4, {}); let top = 0, air = 0;
      for (let i = 0; i < 300; i++) { S.step(1, { mz: 1 }); top = Math.max(top, p.pos.y); if (!p.onGround) air++; } return { top, air }; });
    check(r5.top > 3.0 && r5.air < 4, 'walked over the terrain hill (top y ' + r5.top.toFixed(2) + ', ' + r5.air + ' airborne ticks)');

    // views for the screenshots
    const views = [
      ['smoke-yard', [-27, 0, 0], -Math.PI / 2 + 2.2, 0.05],
      ['smoke-building', [-14, 0, -12], 0.75, 0.04],
      ['smoke-interior', [-7.5, 0.12, -6.5], 0.6, 0.12],
      ['smoke-upstairs', [-1, 3.32, -6], -0.5, 0.15],
      ['smoke-dock', [19, 0, -9], Math.PI, 0.1],
      ['smoke-siteB', [-12, 0, 12], -1.3, 0.12],
    ];
    for (const [name, [x, y, z], yaw, pitch] of views) {
      await page.evaluate(([x, y, z, yaw, pitch]) => { const S = LF.sandbox; S.teleport(x, y + 0.01, z, yaw, pitch); S.step(16, {}); }, [x, y, z, yaw, pitch]);
      await frames(page, 3);
      await shot(page, name);
      const s = await page.evaluate(() => LF.sandbox.stats());
      console.log('  ' + name + ': ' + s.drawCalls + ' draw calls, ' + s.activeMeshes + ' active meshes, ' + s.tris + ' tris');
    }
    const loopErr = await page.evaluate(() => LF.loop.loopStats.errors);
    check(loopErr === 0, 'no errors inside loop callbacks (' + loopErr + ')');
    check(errs.length === 0, 'sandbox: zero console errors' + (errs.length ? ' -> ' + errs.slice(0, 8).join(' | ') : ''));
    await ctx.close();
  } catch (e) {
    fails.push('exception: ' + (e && e.stack || e)); console.log('  FAIL exception ' + (e && e.stack || e));
  } finally {
    await browser.close(); srv.stop();
  }
  console.log((fails.length ? 'SMOKE FAILED (' + fails.length + ')' : 'SMOKE OK') + ' in ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s');
  process.exit(fails.length ? 1 : 0);
}
if (import.meta.url === 'file://' + process.argv[1]) main();
