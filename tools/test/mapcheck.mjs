// Map check: builds a map headless (the real builder, materials, environment and post-processing), runs js/maps/validate.js,
// prints timings / sizes / draw calls, and with --shots writes overview screenshots to tools/test/out/maps/<id>/:
//   top.png (orthographic top-down with markers), nav.png (top-down + navgrid reachability), lobby1/2.png, siteA/B.png,
//   spawn-*.png (eye height from spawns).
// Usage:
//   node tools/test/mapcheck.mjs <mapId> [--shots] [--size=1280x720] [--keep-warnings]
//   node tools/test/mapcheck.mjs all [--shots]       every map in js/maps/index.js that has a defs file (+ dev_range)
// Exit code 1 when a map fails validation, throws, or logs a console error.
import { launch, startServer, waitFor, OUT, ROOT } from './lib.mjs';
import { openPage } from './smoke.mjs';
import fs from 'node:fs'; import path from 'node:path';

const args = process.argv.slice(2);
const flag = k => args.includes('--' + k);
const opt = (k, d) => { const a = args.find(s => s.startsWith('--' + k + '=')); return a ? a.split('=')[1] : d; };
const target = args.find(a => !a.startsWith('--')) || 'dev_range';
const [W, H] = opt('size', '1280x720').split('x').map(Number);

async function listMaps() {
  const src = fs.readFileSync(path.join(ROOT, 'js/maps/index.js'), 'utf8');
  const ids = Array.from(src.matchAll(/\{\s*id:\s*'([a-z0-9_]+)'/g)).map(m => m[1]);
  return ['dev_range', ...ids];
}

const frames = async (page, n = 3) => { const f0 = await page.evaluate(() => LF.loop.loopStats.frames); await page.waitForFunction(k => LF.loop.loopStats.frames >= k, f0 + n, { timeout: 90000, polling: 100 }); };

async function checkMap(browser, base, id, dir) {
  const res = { id, ok: false, errors: [], warnings: [], console: [], shots: [] };
  const defFile = path.join(ROOT, 'js/maps/defs', id + '.js');
  if (!fs.existsSync(defFile)) { res.errors.push('no map file js/maps/defs/' + id + '.js'); return res; }
  const { ctx, page, errs } = await openPage(browser, base, '#dev&sandbox&map=' + id + '&q=low&nolens&nodyn', { width: W, height: H });
  try {
    await waitFor(page, () => (window.LF && LF.sandbox) || document.querySelector('#boot.err'), 300000);
    const bootErr = await page.evaluate(() => { const b = document.querySelector('#boot.err'); return b ? b.textContent : null; });
    if (bootErr) { res.errors.push('build failed: ' + bootErr); return res; }
    await frames(page, 2);
    const out = await page.evaluate(async () => {
      const { validateMap } = await import('/js/maps/validate.js');
      const S = LF.sandbox, info = S.info, v = validateMap(info);
      const meta = await import('/js/maps/index.js').then(m => m.getMapMeta(info.id)).catch(() => null);
      return { v, stats: info.stats, nav: info.nav ? info.nav.stats : null, world: info.world.stats(), name: info.def.name, size: info.def.size,
        meta: meta ? { name: meta.name, size: meta.size } : null, bounds: info.bounds, lightMode: info.lightMode || 'none' };
    });
    Object.assign(res, out, { ok: out.v.ok });
    res.errors.push(...out.v.errors); res.warnings.push(...out.v.warnings);
    if (flag('shots')) {
      fs.mkdirSync(dir, { recursive: true });
      const shot = async (name, cam, overlay) => {
        await page.evaluate(c => LF.sandbox.cam(c), cam);
        await frames(page, 3);
        if (overlay) await page.evaluate(overlay);
        const f = path.join(dir, name + '.png'); await page.screenshot({ path: f }); res.shots.push(path.relative(ROOT, f));
        const s = await page.evaluate(() => { const o = document.getElementById('mc-ov'); if (o) o.remove(); return LF.sandbox.stats(); });
        res['dc_' + name] = s.drawCalls;
      };
      await page.evaluate(() => { const d = document.querySelector('.dbg'); if (d) d.style.display = 'none'; const h = document.querySelector('.sbx-help'); if (h) h.remove(); const x = document.querySelector('.sbx-xh'); if (x) x.remove(); });
      const b = out.bounds || { minX: -50, maxX: 50, minZ: -50, maxZ: 50, maxY: 20 };
      const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2, bw = b.maxX - b.minX, bd = b.maxZ - b.minZ;
      const asp = W / H; let hw = bw / 2 * 1.04, hd = bd / 2 * 1.04;
      if (hw / hd > asp) hd = hw / asp; else hw = hd * asp;
      const top = { x: cx, y: (b.maxY || 20) + 60, z: cz, yaw: 0, pitch: Math.PI / 2, ortho: { left: -hw, right: hw, top: hd, bottom: -hd } };
      const markers = () => {
        const S = LF.sandbox, info = S.info, sc = S.scene, cam = S.camera, eng = sc.getEngine();
        const w = eng.getRenderWidth(), h = eng.getRenderHeight(), cw = window.innerWidth, ch = window.innerHeight;
        const tm = sc.getTransformMatrix(), vp = cam.viewport.toGlobal(w, h), I = BABYLON.Matrix.Identity();
        const P = (x, y, z) => { const v = BABYLON.Vector3.Project(new BABYLON.Vector3(x, y || 0, z), I, tm, vp); return [v.x * cw / w, v.y * ch / h]; };
        const c = document.createElement('canvas'); c.id = 'mc-ov'; c.width = cw; c.height = ch;
        Object.assign(c.style, { position: 'fixed', left: 0, top: 0, width: cw + 'px', height: ch + 'px', zIndex: 30, pointerEvents: 'none' });
        document.body.appendChild(c); const g = c.getContext('2d');
        g.lineWidth = 2; g.font = 'bold 12px monospace'; g.textBaseline = 'middle';
        const label = (t, x, y, col) => { g.fillStyle = 'rgba(0,0,0,.65)'; const m = g.measureText(t).width; g.fillRect(x + 6, y - 8, m + 6, 16); g.fillStyle = col; g.fillText(t, x + 9, y); };
        const rect = (r, col, t) => { const a = P(r.x0, r.y, r.z0), d = P(r.x1, r.y, r.z1); g.strokeStyle = col; g.setLineDash([6, 4]); g.strokeRect(Math.min(a[0], d[0]), Math.min(a[1], d[1]), Math.abs(d[0] - a[0]), Math.abs(d[1] - a[1])); g.setLineDash([]); if (t) label(t, Math.min(a[0], d[0]), Math.min(a[1], d[1]) + 10, col); };
        const dot = (p, col, r = 4) => { const [x, y] = P(p.x, p.y, p.z); g.fillStyle = col; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); g.strokeStyle = '#000'; g.lineWidth = 1; g.stroke(); g.lineWidth = 2; return [x, y]; };
        const arrow = (p, col) => { const [x, y] = dot(p, col, 4); const [x2, y2] = P(p.x + Math.sin(p.yaw) * 1.4, p.y, p.z + Math.cos(p.yaw) * 1.4); g.strokeStyle = col; g.beginPath(); g.moveTo(x, y); g.lineTo(x2, y2); g.stroke(); };
        for (const t of [1, 2]) { const L = info.lobbies[t]; if (L) rect(L, t === 1 ? '#5aa0ff' : '#ff7a59', 'LOBBY ' + t); }
        for (const k in info.sites) rect(info.sites[k], '#ffd23f', 'SITE ' + k);
        for (const r of info.rescues || []) rect(r, '#7dff9b', 'RESCUE');
        for (const t of [1, 2]) for (const s of info.spawns[t]) arrow(s, s.field ? (t === 1 ? '#9cc7ff' : '#ffb39e') : (t === 1 ? '#2f7bff' : '#ff4f2b'));
        for (const s of info.spawns[0]) arrow(s, '#e0e0e0');
        for (const h of info.hides) { const [x, y] = dot(h, '#c86bff', 3.5); }
        for (const h of info.hostages) { const [x, y] = dot(h, '#7dff9b', 5); label('H', x, y, '#7dff9b'); }
        for (const k in info.points) { const p = info.points[k]; const [x, y] = dot(p, '#ffffff', 3); label(k, x, y, '#fff'); }
        for (const gt of info.gateList) { const [x, y] = dot(gt, '#ff2d55', 5); }
        g.fillStyle = 'rgba(0,0,0,.7)'; g.fillRect(8, ch - 28, 760, 20); g.fillStyle = '#fff'; g.font = '11px monospace';
        g.fillText(info.id + '  blue/red = lobby spawns (light = field), white = FFA, purple = hides, green H = hostages, red dots = gates', 14, ch - 18);
      };
      const navOverlay = () => {
        const S = LF.sandbox, info = S.info, nav = info.nav; if (!nav) return;
        const sc = S.scene, eng = sc.getEngine(), w = eng.getRenderWidth(), h = eng.getRenderHeight(), cw = window.innerWidth, ch = window.innerHeight;
        const tm = sc.getTransformMatrix(), vp = S.camera.viewport.toGlobal(w, h), I = BABYLON.Matrix.Identity(), v = new BABYLON.Vector3();
        const c = document.createElement('canvas'); c.id = 'mc-ov'; c.width = cw; c.height = ch;
        Object.assign(c.style, { position: 'fixed', left: 0, top: 0, width: cw + 'px', height: ch + 'px', zIndex: 30, pointerEvents: 'none' });
        document.body.appendChild(c); const g = c.getContext('2d');
        const seeds = t => info.spawns[t].filter(s => !s.field).map(s => nav.nearest(s.x, s.y, s.z, 1)).filter(n => n >= 0);
        const r1 = nav.flood(seeds(1), true), r2 = nav.flood(seeds(2), true), p = {};
        const px = Math.max(1, nav.cell * cw / ((S.camera.orthoRight - S.camera.orthoLeft) || 100));
        // unreachable first (roofs, wall tops, sealed rooms), reachable on top so floors under roofs still show
        for (const pass of [0, 1]) for (let n = 0; n < nav.nodeCount; n++) {
          const both = r1[n] && r2[n];
          if ((pass === 1) !== !!both) continue;
          nav.nodePos(n, p); v.set(p.x, p.y, p.z);
          const q = BABYLON.Vector3.Project(v, I, tm, vp);
          g.fillStyle = both ? (nav.isCrouchOnly(n) ? 'rgba(255,200,0,.8)' : nav.isGate(n) ? 'rgba(255,40,180,.9)' : 'rgba(60,255,120,.4)') : 'rgba(255,40,40,.45)';
          g.fillRect(q.x * cw / w - px / 2, q.y * ch / h - px / 2, px, px);
        }
        g.fillStyle = 'rgba(0,0,0,.7)'; g.fillRect(8, ch - 28, 640, 20); g.fillStyle = '#fff'; g.font = '11px monospace';
        g.fillText('navgrid (top level drawn last): green = reachable by both teams, yellow = crouch only, pink = gate, red = not reachable (roofs, sealed)', 14, ch - 18);
      };
      await shot('top', top, markers);
      await shot('nav', top, navOverlay);
      const look = (fx, fy, fz, tx, ty, tz) => ({ x: fx, y: fy, z: fz, yaw: Math.atan2(tx - fx, tz - fz), pitch: -Math.atan2(ty - fy, Math.hypot(tx - fx, tz - fz)) });
      const info = await page.evaluate(() => { const i = LF.sandbox.info; return { lobbies: i.lobbies, sites: i.sites, spawns: i.spawns, gates: i.gateList.map(g => ({ x: g.x, y: g.y, z: g.z, team: g.team })) }; });
      for (const t of [1, 2]) {
        const L = info.lobbies[t]; if (!L) continue;
        const g = info.gates.find(q => q.team === t) || { x: L.x, z: L.z, y: L.y };
        // from the back of the lobby, eye height, looking at the gate
        const dx = L.x - g.x, dz = L.z - g.z, d = Math.hypot(dx, dz) || 1;
        const fx = L.x + dx / d * Math.min(3, Math.max(0, (Math.min(L.x1 - L.x0, L.z1 - L.z0) / 2 - 1))), fz = L.z + dz / d * Math.min(3, Math.max(0, (Math.min(L.x1 - L.x0, L.z1 - L.z0) / 2 - 1)));
        await shot('lobby' + t, look(fx, (L.y || 0) + 1.64, fz, g.x, (g.y || 0) + 1.4, g.z));
      }
      for (const k of Object.keys(info.sites)) {
        const s = info.sites[k], y = s.y || 0, r = Math.max(s.x1 - s.x0, s.z1 - s.z0);
        await shot('site' + k, look(s.x - r * 0.55, y + Math.max(5, r * 0.5), s.z - r * 0.55, s.x, y, s.z));
      }
      const pick = (t, field) => (info.spawns[t] || []).filter(s => !!s.field === field)[0];
      for (const [name, s] of [['spawn-t1', pick(1, false)], ['spawn-t2', pick(2, false)], ['spawn-t1-field', pick(1, true)], ['spawn-t2-field', pick(2, true)], ['spawn-ffa', pick(0, false)]]) {
        if (s) await shot(name, { x: s.x, y: s.y + 1.64, z: s.z, yaw: s.yaw, pitch: 0.05 });
      }
    }
    res.console = errs.slice();
    if (errs.length) { res.ok = false; res.errors.push(...errs.map(e => 'console: ' + e)); }
  } catch (e) {
    res.errors.push('exception: ' + (e && e.message || e)); res.ok = false;
  } finally { await ctx.close(); }
  return res;
}

function report(r) {
  const s = r.stats || {}, n = r.nav || {};
  console.log('\nMAPCHECK ' + r.id + (r.name ? ' — ' + r.name + (r.size ? ' (' + r.size + ')' : '') : ''));
  if (s.msTotal != null) {
    console.log('  build ' + s.msTotal + ' ms  (def ' + s.msDef + ', models ' + s.msModels + ', meshes ' + s.msMeshes + ', world ' + s.msWorld + ', lights ' + s.msLights + ', nav ' + s.msNav + ')');
    console.log('  ' + s.meshes + ' meshes, ' + (s.tris || 0).toLocaleString() + ' tris, ' + (r.world ? r.world.colliders : '?') + ' colliders, ' + s.lights + ' lights (' + r.lightMode + '), nav ' + (n.nodes || 0).toLocaleString() + ' nodes / ' + (n.levels || 0) + ' levels / ' + (n.components || 0) + ' areas');
    const dcs = Object.keys(r).filter(k => k.startsWith('dc_')).map(k => k.slice(3) + ' ' + r[k]);
    if (dcs.length) console.log('  draw calls: ' + dcs.join(', '));
    if (r.v && r.v.stats) console.log('  ' + Object.entries(r.v.stats).map(([k, v]) => k + ' ' + v).join(', '));
  }
  console.log('  VALIDATE: ' + (r.ok ? 'OK' : 'FAILED (' + r.errors.length + ' error' + (r.errors.length === 1 ? '' : 's') + ')'));
  for (const e of r.errors) console.log('    ERROR ' + e);
  for (const w of r.warnings.slice(0, flag('keep-warnings') ? 1e9 : 25)) console.log('    warn  ' + w);
  if (r.warnings.length > 25 && !flag('keep-warnings')) console.log('    ... ' + (r.warnings.length - 25) + ' more warnings (--keep-warnings)');
  if (r.shots.length) console.log('  shots: ' + r.shots.join(', '));
}

async function main() {
  const ids = target === 'all' ? await listMaps() : [target];
  const srv = await startServer(); const browser = await launch();
  const results = [];
  try {
    for (const id of ids) {
      const r = await checkMap(browser, srv.url, id, path.join(OUT, 'maps', id));
      results.push(r); report(r);
    }
  } finally { await browser.close(); srv.stop(); }
  if (ids.length > 1) {
    console.log('\nSUMMARY');
    for (const r of results) console.log('  ' + (r.ok ? 'OK    ' : 'FAIL  ') + r.id.padEnd(14) + (r.stats && r.stats.msTotal != null ? r.stats.msTotal + ' ms' : '') + (r.ok ? '' : '  ' + (r.errors[0] || '')));
  }
  process.exit(results.every(r => r.ok) ? 0 : 1);
}
main();
