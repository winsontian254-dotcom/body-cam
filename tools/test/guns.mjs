// Gun / attachment / grenade / melee model test (headless Chromium through tools/preview/guns.html):
//   1. every gun of data.js (50) and every melee weapon (3) at LOD 0/1/2: triangle budgets, build time, NaN-free positions, unit normals,
//      sockets for every mount in data.js, muzzle / eject / hand nodes, sight line (eye on it, behind the rear sight), moving parts
//   2. EVERY attachment on EVERY compatible gun (attachments.js compatible()): setMods applies it, the attachment hangs on the right
//      socket, the socket sits on the gun's surface, nothing NaN, slot effects (optic eye + iron fold + built-in scope hidden, canted
//      sight line, muzzle node moved + own device hidden, grips move the left hand, bipods replace the built-in one, lasers / lights
//      expose emitters, stocks replace parts.stock or pose it, magazines / barrels rebuild), a clipping estimate (gun vertices inside
//      the attachment's boxes), setMods({}) restores everything
//   3. every grenade (25) at LOD 0/1/2: budgets, NaN, pin / ring / spoon parts as the data's model hints say, grip / top nodes
//   4. skins, cache clones, InstancedMesh copies, no leaked meshes; zero console errors
//   Screenshots in tools/test/out/guns/: <id>_side / _34 / _close for every gun + melee, sheet_<category> contact sheets, sheet_melee,
//   sheet_nades, att_<slot>[_n] (each attachment on 4 different guns), att_<id> close-ups, LOD shots, report.json
//   node tools/test/guns.mjs [--only=warden,spatz] [--noshots] [--noatt] [--size=720] [--sheets-only]
import { launch, startServer, ROOT, OUT } from './lib.mjs';
import { cdnCache } from './smoke.mjs';
import fs from 'node:fs'; import path from 'node:path';

const arg = (k, d) => { const a = process.argv.find(s => s.startsWith('--' + k)); return a ? (a.includes('=') ? a.split('=')[1] : true) : d; };
const ONLY = arg('only', '') ? String(arg('only')).split(',') : null, SHOTS = !arg('noshots', false), ATT = !arg('noatt', false), SIZE = +arg('size', 720);
const SHEETS_ONLY = !!arg('sheets-only', false);
const DIR = path.join(OUT, 'guns'); fs.mkdirSync(DIR, { recursive: true });
// triangle budgets per LOD: compact (pistol / SMG / shotgun), long (rifle-class + LMG: more parts, rails, scopes), melee, grenades
const BUDGET = { compact: { 0: [7000, 40000], 1: [600, 5000], 2: [150, 1300] }, long: { 0: [7000, 40000], 1: [600, 7000], 2: [150, 2000] },
  melee: { 0: [800, 12000], 1: [150, 3000], 2: [40, 1200] }, nade: { 0: [300, 8000], 1: [80, 2500], 2: [30, 900] } };
const LONG = ['rifle', 'carbine', 'br', 'dmr', 'sniper', 'lmg'];
import os from 'node:os';
// LOD 0 template build (kit + meshes, warm materials): 150 ms on an idle machine; scaled by the load when other processes share the CPUs
const LOAD = Math.max(1, os.loadavg()[0] / Math.max(1, os.cpus().length)), MAX_MS = Math.round(150 * Math.min(LOAD, 4));
if (LOAD > 1.2) console.log(`machine busy (load ${os.loadavg()[0].toFixed(1)} on ${os.cpus().length} CPUs): build-time limit ${MAX_MS} ms`);
const CLIP_FAIL = 60;                                                   // gun vertices inside an attachment box that fail the check

const srv = await startServer(); const browser = await launch();
const fails = [], warns = [];
const check = (cond, msg) => { if (!cond) { fails.push(msg); console.log('  FAIL ' + msg); } return cond; };
const warn = msg => { warns.push(msg); };
try {
  const ctx = await browser.newContext({ viewport: { width: SIZE, height: Math.round(SIZE * .5625) } }); await cdnCache(ctx);
  const page = await ctx.newPage(); const errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  page.on('pageerror', e => errs.push('pageerror: ' + (e.stack || e.message)));
  page.on('requestfailed', r => errs.push('requestfailed: ' + r.url()));
  await page.goto(srv.url + '/tools/preview/guns.html?clean&gun=vogt9');
  await page.waitForFunction(() => window.GV && GV.ready, null, { timeout: 120000 }); await page.evaluate(() => GV.ready);
  const ids = await page.evaluate(async (only) => { const D = await import('/js/weapons/data.js'); return [...D.GUNS, ...D.MELEE].map(g => g.id).filter(id => !only || only.includes(id)); }, ONLY);
  console.log('guns + melee: ' + ids.length);
  let res = { out: [] };

  if (!SHEETS_ONLY) {
  // ------------------------------------------------------------------ 1. per-model checks (in the page)
  res = await page.evaluate(async ({ ids }) => {
    const M = await import('/js/weapons/models.js'), Dt = await import('/js/weapons/data.js'), At = await import('/js/weapons/attachments.js');
    const scene = GV.scene, out = [];
    GV.sheet('all'); for (const m of GV.models) m.dispose(); GV.models = []; M.clearGunCache(scene);   // warm materials
    for (const id of ids) {
      const gun = Dt.getGun(id), r = { id, cat: gun.cat, arch: gun.archetype, lods: [], errors: [] };
      for (const lod of [0, 1, 2]) {
        const t0 = performance.now(); let gm;
        try { gm = M.buildGun(scene, id, { lod, skin: 'factory' }); } catch (e) { r.errors.push('build lod ' + lod + ': ' + e.message); continue; }
        const ms = performance.now() - t0;
        let nan = 0, verts = 0, badN = 0;
        for (const m of gm.meshes) { const p = m.getVerticesData('position') || [], n = m.getVerticesData('normal') || []; verts += p.length / 3;
          for (let i = 0; i < p.length; i++) if (!Number.isFinite(p[i])) nan++;
          for (let i = 0; i < n.length; i += 3) { const l = Math.hypot(n[i], n[i + 1], n[i + 2]); if (!(l > .9 && l < 1.1)) badN++; } }
        let tplMs = gm.info.buildMs || 0;
        // a GC pause or another process on a shared machine can stretch one build: re-measure (fresh template) up to 3 times, keep the best
        for (let k = 0; lod === 0 && tplMs > 150 && k < 3; k++) { M.clearGunCache(scene); const t1 = performance.now(), g2 = M.buildGun(scene, id, { lod, skin: 'factory' }); tplMs = Math.min(tplMs, g2.info.buildMs || (performance.now() - t1)); g2.dispose(); }
        const L = { lod, tris: M.gunTris(gm), ms: +ms.toFixed(1), tplMs: +tplMs.toFixed(1), nan, badN, verts, meshes: gm.meshes.length };
        if (lod === 0) {
          gm.root.computeWorldMatrix(true); const bb = gm.root.getHierarchyBoundingVectors(true); L.size = [bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z].map(v => +(v * 1000).toFixed(0));
          if (gm.melee) { L.melee = { hand: !!gm.hands.right, tip: !!gm.tip, edge: !!(gm.edge[0] && gm.edge[1]) }; }
          else {
            const eye = gm.sight.eye, f = gm.sight.front, b = gm.sight.rear;
            L.sight = { kind: gm.sight.kind, eye: eye.asArray().map(v => +(v * 1000).toFixed(2)), front: f && f.asArray().map(v => +(v * 1000).toFixed(2)), rear: b && b.asArray().map(v => +(v * 1000).toFixed(2)), lens: !!(gm.sight.lens && gm.sight.lens.mesh), reticle: gm.sight.reticle };
            L.sockets = Object.keys(gm.sockets); L.parts = Object.keys(gm.parts);
            L.nodes = { muzzle: !!gm.muzzle, eject: !!gm.eject, handR: !!gm.hands.right, handL: !!gm.hands.left };
            L.muzzleZ = gm.muzzle ? +(gm.muzzle.position.z * 1000).toFixed(1) : null;
          }
        }
        gm.dispose();
        r.lods.push(L);
      }
      if (gun.cat !== 'melee') {
        try { for (const sk of M.SKINS) { const g2 = M.buildGun(scene, id, { lod: 1, skin: sk.id }); g2.dispose(); } } catch (e) { r.errors.push('skin: ' + e.message); }
      }
      try { const t0 = performance.now(), a = M.buildGun(scene, id, { lod: 0 }), t1 = performance.now(); r.cloneMs = +(t1 - t0).toFixed(1); r.cachedHit = a.info.cached; a.dispose(); const inst = M.buildGun(scene, id, { lod: 2, instance: true }); inst.dispose(); } catch (e) { r.errors.push('clone: ' + e.message); }
      out.push(r);
    }
    return { out };
  }, { ids });

  for (const r of res.out) {
    const gl = r.lods.find(l => l.lod === 0) || {}, B = r.cat === 'melee' ? BUDGET.melee : LONG.includes(r.cat) ? BUDGET.long : BUDGET.compact;
    console.log(`${r.id.padEnd(12)} ${r.lods.map(l => `L${l.lod} ${l.tris}t ${l.tplMs}ms`).join('  ')}  clone ${r.cloneMs}ms  size ${gl.size ? gl.size.join('x') : '?'} mm`);
    for (const e of r.errors) check(false, r.id + ': ' + e);
    for (const l of r.lods) {
      check(l.tris >= B[l.lod][0] && l.tris <= B[l.lod][1], `${r.id} LOD${l.lod} triangles ${l.tris} outside ${B[l.lod].join('..')}`);
      check(!l.nan, `${r.id} LOD${l.lod} NaN positions ${l.nan}`); check(!l.badN, `${r.id} LOD${l.lod} bad normals ${l.badN}`);
    }
    check(gl.tplMs <= MAX_MS, `${r.id} LOD0 build ${gl.tplMs} ms > ${MAX_MS} ms`);
    if (r.cat === 'melee') { check(gl.melee && gl.melee.hand && gl.melee.tip && gl.melee.edge, `${r.id} melee nodes (hand, tip, edge) ${JSON.stringify(gl.melee)}`); continue; }
    if (!gl.sockets) continue;
    const gun = await page.evaluate(async id => { const D = await import('/js/weapons/data.js'); const g = D.getGun(id); return { mounts: g.mounts, cat: g.cat, arch: g.archetype, scope: !!g.scope, cycle: g.cycle }; }, r.id);
    for (const slot of ['optic', 'muzzle', 'under', 'side', 'mag', 'stock']) if (gun.mounts[slot]) check(gl.sockets.includes(slot), `${r.id} missing socket ${slot} (mount in data)`);
    check(gl.nodes.muzzle && gl.nodes.eject && gl.nodes.handR && gl.nodes.handL, `${r.id} missing muzzle/eject/hand nodes ${JSON.stringify(gl.nodes)}`);
    const s = gl.sight; check(s.front && s.rear, `${r.id} sight front/rear missing`);
    if (s.front && s.rear) {
      check(Math.abs(s.eye[0]) < .01 && Math.abs(s.eye[1] - s.front[1]) < .3 && Math.abs(s.eye[1] - s.rear[1]) < .3, `${r.id} sight.eye ${s.eye} not on the sight line front ${s.front} rear ${s.rear}`);
      check(s.eye[2] < s.rear[2] && s.rear[2] < s.front[2], `${r.id} sight order eye < rear < front along +Z`);
    }
    if (gun.scope) { check(s.kind === 'scope' && s.lens && s.reticle, `${r.id} built-in scope: sight kind / lens mesh / reticle ${JSON.stringify(s)}`); check(gl.parts.includes('scope') || r.id === 'lodjur', `${r.id} built-in scope part (hidden under an optic)`); }
    check(gl.muzzleZ > 60, `${r.id} muzzle node not ahead of the trigger (${gl.muzzleZ} mm)`);
    const need = gun.cat === 'pistol' ? (gun.arch === 'revolver' ? ['cylinder', 'hammer', 'trigger'] : ['trigger', 'mag']) : ['mag', 'trigger'];
    if (gun.arch === 'shotgun_break') need.splice(0, need.length, 'barrels', 'trigger');
    if (gun.arch === 'shotgun_lever') need.splice(0, need.length, 'lever', 'trigger');
    if (gun.arch === 'pump') need.splice(0, need.length, 'pump', 'trigger');
    if (gun.arch === 'shotgun_semi') need.splice(0, need.length, 'trigger', 'charging');
    if (gun.cycle === 'bolt') need.push('bolt');
    if (['ar15', 'ar10', 'ar_piston', 'sniper_semi'].includes(gun.arch)) need.push('bolt', 'charging', 'cover');
    if (['ak', 'dmr_classic', 'dmr_integral'].includes(gun.arch)) need.push('charging', 'cover');
    for (const p of need) check(gl.parts.includes(p), `${r.id} missing moving part ${p} (has ${gl.parts.join(',')})`);
  }

  // ------------------------------------------------------------------ 2. every attachment on every compatible gun
  if (ATT) {
    const ares = await page.evaluate(async ({ ids }) => {
      const M = await import('/js/weapons/models.js'), Dt = await import('/js/weapons/data.js'), At = await import('/js/weapons/attachments.js');
      const scene = GV.scene, V = BABYLON.Vector3, rows = [];
      const vertsIn = (meshes, inv, box, cap = 1e9, rMin = 0) => {   // count vertices of meshes inside box (frame of inv); rMin skips a thread / bore along z
        let n = 0; const tmp = new V(), M2 = new BABYLON.Matrix();
        for (const m of meshes) { if (!m.isEnabled() || !m.getTotalVertices()) continue; m.computeWorldMatrix(true); m.getWorldMatrix().multiplyToRef(inv, M2); const p = m.getVerticesData('position');
          for (let i = 0; i < p.length; i += 3) { V.TransformCoordinatesFromFloatsToRef(p[i], p[i + 1], p[i + 2], M2, tmp); if (rMin && tmp.x * tmp.x + tmp.y * tmp.y < rMin * rMin) continue; if (tmp.x > box[0] && tmp.x < box[3] && tmp.y > box[1] && tmp.y < box[4] && tmp.z > box[2] && tmp.z < box[5]) { if (++n >= cap) return n; } } }
        return n;
      };
      // per-primitive boxes of the attachment (gunkit records one per emitted shape) in the socket frame
      const localBoxes = (a, inv) => (a.boxes || []).filter(b => b.role !== 'lens' && b.role !== 'window').map(b => {
        b.node.computeWorldMatrix(true); const W = b.node.getWorldMatrix(), mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
        for (let c = 0; c < 8; c++) { const q = V.TransformCoordinates(V.TransformCoordinates(new V(c & 1 ? b.max[0] : b.min[0], c & 2 ? b.max[1] : b.min[1], c & 4 ? b.max[2] : b.min[2]), W), inv);
          mn[0] = Math.min(mn[0], q.x); mn[1] = Math.min(mn[1], q.y); mn[2] = Math.min(mn[2], q.z); mx[0] = Math.max(mx[0], q.x); mx[1] = Math.max(mx[1], q.y); mx[2] = Math.max(mx[2], q.z); }
        return [mn[0], mn[1], mn[2], mx[0], mx[1], mx[2]];
      });
      // does a short ray from just outside the socket (local +Y, or -Z for muzzles / +Z for stocks) hit the gun within 7 mm?
      const onSurface = (gm, sock, slot) => {
        gm.root.computeWorldMatrix(true); for (const m of gm.meshes) m.computeWorldMatrix(true); sock.computeWorldMatrix(true);
        const W = sock.getWorldMatrix(), meshes = new Set(gm.meshes.filter(m => m.isEnabled()));
        // rails / surfaces: rays from 5 mm outside straight in; muzzles (barrel at the thread) and stocks (receiver end): radial rays
        const rays = slot === 'muzzle' ? [0, 1, 2, 3].map(k => { const a = k * Math.PI / 2; return [[Math.cos(a) * .03, Math.sin(a) * .03, -.002], [-Math.cos(a), -Math.sin(a), 0], .03]; })
          : slot === 'stock' ? [[[0, 0, -.006], [0, 0, 1], .02], [[0, .008, -.006], [0, 0, 1], .02], [[0, -.008, -.006], [0, 0, 1], .02], [[.05, 0, .004], [-1, 0, 0], .05], [[0, .05, .004], [0, -1, 0], .05]]
            : [[0, 0], [0, .012], [0, -.012], [.004, 0], [-.004, 0], [0, .03], [0, -.03]].map(([x, z]) => [[x, .005, z], [0, -1, 0], .012]);
        for (const [p, dir, len] of rays) { const o = V.TransformCoordinates(V.FromArray(p), W), d = V.TransformNormal(V.FromArray(dir), W).normalize(), hit = GV.scene.pickWithRay(new BABYLON.Ray(o, d, len), m => meshes.has(m)); if (hit && hit.hit) return true; }
        return false;
      };
      const geoSum = gm => { let t = 0; for (const m of gm.meshes) { if (!m.isEnabled()) continue; const p = m.getVerticesData('position') || []; for (let i = 0; i < p.length; i++) t += Math.abs(p[i]) * (i % 3 + 1); } return +t.toFixed(4); };
      for (const id of ids) {
        const gun = Dt.getGun(id); if (!gun || gun.cat === 'melee') continue;
        const gm = M.buildGun(scene, id, { lod: 0 });
        const base = { eye: gm.sight.eye.clone(), muzzle: gm.muzzle.position.clone(), handParent: gm.hands.left && gm.hands.left.parent, tris: M.gunTris(gm), sum: geoSum(gm) };
        for (const att of At.compatible(gun)) {
          const r = { gun: id, att: att.id, slot: att.slot, kind: att.model.kind, errors: [] };
          try {
            gm.setMods({ [att.slot]: att.id });
            r.applied = gm.mods[att.slot] === att.id;
            const a = gm.attachments[att.slot];
            if (['optic', 'muzzle', 'under', 'side'].includes(att.slot) || (att.slot === 'stock' && att.id !== 'k_folded' && gm.sockets.stock)) {
              r.mounted = !!(a && a.root);
              if (a && a.root) {
                const sock = a.root.parent; r.socket = sock ? sock.name.split('#').pop() : null;
                let nan = 0; for (const m of a.meshes) { const p = m.getVerticesData('position') || []; for (const v of p) if (!Number.isFinite(v)) nan++; } r.nan = nan;
                // the socket sits on the gun (gun surface just below the socket origin), and gun vertices inside the attachment's boxes
                sock.computeWorldMatrix(true); const inv = sock.getWorldMatrix().clone().invert();
                const gunMeshes = gm.meshes.filter(m => m.isEnabled() && m.isEnabled(true));
                r.surface = onSurface(gm, sock, att.slot) ? 1 : 0;
                if (att.slot !== 'stock') {
                  const ex = att.slot === 'muzzle' ? { z: .004 } : { y: .006 }; let clip = 0;
                  for (const b of localBoxes(a, inv)) { const s = [b[0] + .0015, Math.max(b[1] + .0015, ex.y ?? -1), Math.max(b[2] + .0015, ex.z ?? -1), b[3] - .0015, b[4] - .0015, b[5] - .0015]; if (s[0] < s[3] && s[1] < s[4] && s[2] < s[5]) clip += vertsIn(gunMeshes, inv, s, 400, att.slot === 'muzzle' ? .0092 : 0); }
                  r.clip = clip;
                }
              }
            }
            if (att.slot === 'optic') {
              if (att.model.kind === 'canted') r.canted = !!(gm.sight.canted && gm.sight.canted.eye && Math.abs(gm.sight.canted.roll) > .5);
              else { r.eyeMoved = !gm.sight.eye.equalsWithEpsilon(base.eye, 1e-5) && !gm.sight.iron; r.eyeX = +(gm.sight.eye.x * 1000).toFixed(2);
                const sockZ = M.buildGun && a ? a.root.parent.position.z : 0; r.eyeBehind = gm.sight.eye.z < sockZ;
                r.scopeHidden = Object.values(gm.parts).filter(p => p.metadata && p.metadata.meta && p.metadata.meta.replace === 'optic').every(p => !p.isEnabled());
                r.ironsDown = Object.values(gm.parts).filter(p => p.metadata && p.metadata.meta && p.metadata.meta.iron === 'fold').every(p => p.rotation.length() > .5);
                r.lens = ['scope', 'lpvo', 'prism', 'thermal'].includes(att.model.kind) ? !!(gm.sight.lens && gm.sight.lens.mesh) : null; r.reticle = gm.sight.reticle; }
            }
            if (att.slot === 'muzzle') { r.muzzleMoved = gm.muzzle.position.z > base.muzzle.z + .02; r.ownHidden = gm.parts.muzzleDev ? !gm.parts.muzzleDev.isEnabled() : true; }
            if (att.slot === 'under') { r.hand = a && a.hand ? gm.hands.left.parent !== base.handParent : null; r.bipod = att.model.kind === 'bipod' ? !!gm.bipod && Object.values(gm.parts).filter(p => p.metadata && p.metadata.meta && p.metadata.meta.replace === 'bipod').every(p => !p.isEnabled()) : null; }
            if (att.slot === 'side') r.emitter = !!(gm.emitters && (gm.emitters.laser || gm.emitters.light));
            if (att.slot === 'stock') { if (att.id === 'k_folded') { const p = gm.parts.stock; r.pose = !!p && (p.rotation.length() > .1 || Math.abs(p.position.z - p.metadata.rest[2]) > .01); } else r.stockHidden = gm.parts.stock ? !gm.parts.stock.isEnabled() : true; }
            if (att.slot === 'mag') { r.mag = !!gm.parts.mag || att.model.kind === 'tube'; r.trisChanged = geoSum(gm) !== base.sum; }
            if (att.slot === 'barrel') { const dz = gm.muzzle.position.z - base.muzzle.z; r.barrel = att.model.kind === 'long' ? dz > .04 : att.model.kind === 'short' ? dz < -.04 : geoSum(gm) !== base.sum; }
            gm.setMods({});
            r.reset = Object.keys(gm.attachments).length === 0 && gm.sight.eye.equalsWithEpsilon(base.eye, 1e-5) && gm.muzzle.position.equalsWithEpsilon(base.muzzle, 1e-5) && (!gm.parts.stock || gm.parts.stock.isEnabled());
          } catch (e) { r.errors.push(e.stack.split('\n').slice(0, 3).join(' | ')); try { gm.setMods({}); } catch (e2) { /* keep going */ } }
          rows.push(r);
        }
        gm.dispose();
      }
      // every attachment also builds on its own (armory view)
      const solo = [];
      for (const att of At.ATTACHMENTS) { try { const a = M.buildAttachment(scene, att.id, { lod: 0 }); solo.push({ id: att.id, meshes: a.meshes.length }); a.dispose(); } catch (e) { solo.push({ id: att.id, error: e.message }); } }
      return { rows, solo };
    }, { ids });
    let n = 0;
    for (const r of ares.rows) {
      n++; const tag = `${r.gun} + ${r.att}`;
      for (const e of r.errors) check(false, tag + ': ' + e);
      check(r.applied, `${tag}: not applied by setMods`);
      if (r.mounted !== undefined) { check(r.mounted, `${tag}: attachment not mounted`); if (r.mounted) { check(!r.nan, `${tag}: NaN in the attachment`); check(r.socket === 's_' + r.slot || (r.kind === 'canted' && r.socket === 's_canted'), `${tag}: on socket ${r.socket}`); check(r.surface > 0, `${tag}: socket ${r.socket} is not on the gun's surface`); }
        if (r.clip !== undefined) { if (r.clip > CLIP_FAIL) check(false, `${tag}: clipping estimate ${r.clip} gun vertices inside the attachment`); else if (r.clip > 0) warn(`${tag}: ${r.clip} gun vertices inside the attachment boxes`); } }
      if (r.slot === 'optic') { if (r.kind === 'canted') check(r.canted, `${tag}: canted sight line missing`); else { check(r.eyeMoved && Math.abs(r.eyeX) < .05 && r.eyeBehind, `${tag}: optic eye ${r.eyeMoved} x ${r.eyeX} behind ${r.eyeBehind}`); check(r.scopeHidden, `${tag}: built-in scope still shown`); check(r.ironsDown, `${tag}: iron sights still up`); if (r.lens !== null) check(r.lens, `${tag}: no lens mesh for the scope renderer`); check(!!r.reticle, `${tag}: no reticle id`); } }
      if (r.slot === 'muzzle') { check(r.muzzleMoved, `${tag}: muzzle node did not move`); check(r.ownHidden, `${tag}: own muzzle device still shown`); }
      if (r.slot === 'under') { if (r.hand !== null) check(r.hand, `${tag}: left hand not moved to the grip`); if (r.bipod !== null) check(r.bipod, `${tag}: bipod not replacing the built-in one / gm.bipod`); }
      if (r.slot === 'side') check(r.emitter, `${tag}: no laser / light emitter node`);
      if (r.slot === 'stock') { if (r.att === 'k_folded') check(r.pose, `${tag}: folded pose not applied`); else check(r.stockHidden !== false, `${tag}: own stock still shown`); }
      if (r.slot === 'mag') check(r.mag && r.trisChanged, `${tag}: magazine not rebuilt`);
      if (r.slot === 'barrel') check(r.barrel, `${tag}: barrel geometry / muzzle not changed`);
      check(r.reset, `${tag}: setMods({}) did not restore`);
    }
    for (const s of ares.solo) check(!s.error && s.meshes > 0, `buildAttachment ${s.id} on its own: ${s.error || 'no meshes'}`);
    console.log(`attachments: ${n} gun x attachment combinations, ${ares.solo.length} stand-alone builds, ${warns.length} clipping warnings`);
    res.attachments = ares;
  }

  // ------------------------------------------------------------------ 3. grenades
  const nres = await page.evaluate(async () => {
    const N = await import('/js/grenades/models.js'), Gd = await import('/js/grenades/data.js'), scene = GV.scene, out = [];
    for (const g of Gd.GRENADES) {
      const r = { id: g.id, lods: [], errors: [] };
      for (const lod of [0, 1, 2]) {
        try {
          const nm = N.buildNade(scene, g.id, { lod }); let nan = 0, badN = 0;
          for (const m of nm.meshes) { const p = m.getVerticesData('position') || [], n = m.getVerticesData('normal') || []; for (const v of p) if (!Number.isFinite(v)) nan++; for (let i = 0; i < n.length; i += 3) { const l = Math.hypot(n[i], n[i + 1], n[i + 2]); if (!(l > .9 && l < 1.1)) badN++; } }
          r.lods.push({ lod, tris: N.nadeTris(nm), nan, badN, ms: +(nm.info.buildMs || 0).toFixed(1), parts: Object.keys(nm.parts), nodes: Object.keys(nm.nodes) });
          nm.dispose();
        } catch (e) { r.errors.push('lod ' + lod + ': ' + e.message); }
      }
      r.hints = { pin: !!g.model.pin, spoon: !!g.model.spoon };
      try { const a = N.buildNade(scene, g.id, { lod: 2, instance: true }); a.dispose(); } catch (e) { r.errors.push('instance: ' + e.message); }
      out.push(r);
    }
    return out;
  });
  for (const r of nres) {
    for (const e of r.errors) check(false, `nade ${r.id}: ${e}`);
    const l0 = r.lods[0] || {};
    for (const l of r.lods) { check(l.tris >= BUDGET.nade[l.lod][0] && l.tris <= BUDGET.nade[l.lod][1], `nade ${r.id} LOD${l.lod} triangles ${l.tris}`); check(!l.nan && !l.badN, `nade ${r.id} LOD${l.lod} NaN ${l.nan} / bad normals ${l.badN}`); }
    if (r.hints.pin) check(l0.parts.includes('pin') && l0.parts.includes('ring'), `nade ${r.id}: pin + ring parts`);
    if (r.hints.spoon) check(l0.parts.includes('spoon'), `nade ${r.id}: spoon part`);
    check(l0.nodes && l0.nodes.includes('grip') && l0.nodes.includes('top'), `nade ${r.id}: grip / top nodes`);
  }
  console.log('grenades: ' + nres.map(r => `${r.id} ${r.lods.map(l => l.tris).join('/')}`).join('  '));
  res.nades = nres;
  const live = await page.evaluate(() => GV.scene.meshes.filter(m => m.isEnabled() && m.metadata && m.metadata.gk === 'mesh' && !GV.models.some(g => m.isDescendantOf(g.root))).length);
  check(live === 0, `leaked gun meshes after dispose: ${live}`);
  }

  // ------------------------------------------------------------------ 4. screenshots + contact sheets
  if (SHOTS) {
    // software WebGL on a busy shared machine can take a long time per frame: generous timeout + one retry
    const shot = async (name, w, h) => { if (w) await page.setViewportSize({ width: w, height: h }); await page.evaluate(() => GV.frames(2));
      try { await page.screenshot({ path: path.join(DIR, name + '.png'), timeout: 120000 }); } catch (e) { console.log('  (retrying screenshot ' + name + ')'); await page.screenshot({ path: path.join(DIR, name + '.png'), timeout: 240000 }); } };
    await page.setViewportSize({ width: SIZE, height: Math.round(SIZE * .5625) });
    if (!SHEETS_ONLY) for (const id of ids) {
      await page.evaluate(id => GV.show(id, { lod: 0, skin: 'factory', mods: {} }), id);
      for (const v of ['side', '34', 'close']) { await page.evaluate(v => GV.view(v), v); await shot(`${id}_${v}`); }
    }
    for (const sheet of ['pistol', 'smg', 'rifle', 'carbine', 'br', 'shotgun', 'dmr', 'sniper', 'lmg']) { await page.setViewportSize({ width: 1400, height: 800 }); await page.evaluate(s => GV.sheet(s), sheet); await shot('sheet_' + sheet); }
    await page.setViewportSize({ width: 1400, height: 520 }); await page.evaluate(() => GV.grid([{ id: 'knife' }, { id: 'zafra' }, { id: 'ridgehawk' }], { cols: 3, cellH: .5 })); await shot('sheet_melee');
    await page.setViewportSize({ width: 1400, height: 900 }); await page.evaluate(async () => GV.grid((await import('/js/grenades/data.js')).GRENADES.map(n => ({ id: n.id, nade: true })), { cols: 7, cellH: 1 })); await shot('sheet_nades');
    // attachments: one sheet per slot (split by 7 rows): each attachment on 4 different compatible guns
    const plan = await page.evaluate(async () => {
      const At = await import('/js/weapons/attachments.js'), Dt = await import('/js/weapons/data.js'), out = {};
      for (const slot of At.SLOTS) {
        const rows = [];
        for (const a of At.ATTACHMENTS.filter(x => x.slot === slot)) {
          const g = Dt.GUNS.filter(gn => At.compatible(gn, slot).some(x => x.id === a.id)).map(gn => gn.id), pick = [];
          for (let k = 0; k < Math.min(4, g.length); k++) pick.push(g[Math.floor(k * g.length / Math.min(4, g.length) + (g.length > 4 ? g.length / 8 : 0)) % g.length]);
          rows.push({ att: a.id, name: a.name, guns: [...new Set(pick)] });
        }
        out[slot] = rows;
      }
      return out;
    });
    for (const [slot, rows] of Object.entries(plan)) {
      for (let p = 0; p * 7 < rows.length; p++) {
        const part = rows.slice(p * 7, p * 7 + 7), entries = [];
        for (const r of part) for (let k = 0; k < 4; k++) { const g = r.guns[k]; if (g) entries.push({ id: g, mods: { [slot]: r.att }, label: r.name, sub: g + ' + ' + r.att }); else entries.push({ id: r.guns[0], mods: { [slot]: r.att }, label: r.name, sub: r.guns[0] + ' (only fit)' }); }
        await page.setViewportSize({ width: 1800, height: Math.max(500, part.length * 210) });
        await page.evaluate(e => GV.grid(e, { cols: 4, cellH: .5, fill: .9 }), entries);
        await shot(`att_${slot}${rows.length > 7 ? '_' + (p + 1) : ''}`);
      }
    }
    // close-ups of every attachment on its first compatible gun (3/4 view aimed at the attachment)
    if (!SHEETS_ONLY) {
      await page.setViewportSize({ width: SIZE, height: Math.round(SIZE * .5625) });
      for (const rows of Object.values(plan)) for (const r of rows) {
        const g = r.guns[0];
        await page.evaluate(([g, att]) => {
          const slot = { o: 'optic', m: 'muzzle', u: 'under', s: 'side', g: 'mag', k: 'stock', b: 'barrel' }[att[0]], gm0 = GV.show(g, { lod: 0, mods: { [slot]: att } }), gm = GV.gm;
          const a = gm.attachments[slot]; let t = null, d = .32;
          if (a && a.root) { a.root.computeWorldMatrix(true); const bb = a.root.getHierarchyBoundingVectors(true); t = bb.min.add(bb.max).scale(.5); d = Math.max(.16, BABYLON.Vector3.Distance(bb.min, bb.max) * 1.7); }
          else if (slot === 'mag' && gm.parts.mag) { gm.parts.mag.computeWorldMatrix(true); const bb = gm.parts.mag.getHierarchyBoundingVectors(true); t = bb.min.add(bb.max).scale(.5); d = Math.max(.25, BABYLON.Vector3.Distance(bb.min, bb.max) * 1.6); }
          GV.view('34', t ? { target: t.asArray(), dist: d } : {}); void gm0;
        }, [g, r.att]);
        await shot(`att_${r.att}`);
      }
      for (const lod of [1, 2]) { await page.evaluate(lod => { GV.show('warden', { lod, mods: {} }); GV.view('34'); }, lod); await shot(`warden_lod${lod}`); }
      for (const [id, mods, skin] of [['warden', { optic: 'o_holo', muzzle: 'm_supp_556', under: 'u_vgrip', side: 's_combo' }, 'factory'], ['purga', { optic: 'o_4x', muzzle: 'm_brake', under: 'u_agrip', side: 's_light' }, 'woodland'], ['rook', { optic: 'o_canted', muzzle: 'm_supp_762', under: 'u_bipod' }, 'factory'], ['halberd', { optic: 'o_lpvo', side: 's_laser', stock: 'k_heavy' }, 'fde']]) {
        await page.evaluate(([id, mods, skin]) => { GV.show(id, { lod: 0, skin, mods }); GV.view('34'); }, [id, mods, skin]); await shot(`${id}_kit_${skin}`);
      }
    }
    console.log('screenshots -> ' + path.relative(ROOT, DIR));
  }
  check(errs.length === 0, 'zero console errors' + (errs.length ? ' -> ' + errs.slice(0, 5).join(' | ') : ''));
  fs.writeFileSync(path.join(DIR, 'report.json'), JSON.stringify({ ...res, warns }, null, 1));
} finally { await browser.close(); srv.stop(); }
console.log(fails.length ? `\n${fails.length} FAILED` : '\nOK: all gun checks passed');
if (warns.length) console.log(`${warns.length} warnings (report.json): ` + warns.slice(0, 12).join('; '));
process.exit(fails.length ? 1 : 0);
