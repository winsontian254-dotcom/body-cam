// Bots test: plays real matches with bots only (the local player is removed) through LF.game.debugStep, on dev_range and on the
// shipped maps, and checks what the bots do.
//   node tools/test/bots.mjs [--maps=dev_range,harbor|all] [--modes=tdm,demolition] [--mins=3] [--bots=10] [--skill=0.45] [--noshots]
// Per map and mode: kills happen on both teams, nobody is stuck (wants to move but moves < 1 m in 10 s; positions are logged),
// no NaN / fall-through, the bots reach the objectives (demolition: plant attempts, plants, defuses or detonations), bots buy
// (economy), the path budget and the per-tick bot cost stay small (frame budget), zero console errors. Spectator screenshots of
// fights (bots-<map>-<mode>-*.png) from a free camera behind a bot.
import { launch, startServer, shot } from './lib.mjs';
import { openPage } from './smoke.mjs';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '../..');
const arg = (k, d) => { const a = process.argv.find(s => s.startsWith('--' + k + '=')); return a ? a.split('=')[1] : d; };
const flag = k => process.argv.includes('--' + k);
const MINS = +arg('mins', 3), BOTS = +arg('bots', 10), SKILL = arg('skill', '0.45'), SHOTS = !flag('noshots');
const MODES = arg('modes', 'tdm,demolition').split(',');
async function mapList() {
  const want = arg('maps', 'all');
  if (want !== 'all') return want.split(',');
  const { MAPS } = await import(url.pathToFileURL(path.join(ROOT, 'js/maps/index.js')).href);
  const defs = new Set(fs.readdirSync(path.join(ROOT, 'js/maps/defs')).map(f => f.replace(/\.js$/, '')));
  return ['dev_range', ...MAPS.filter(m => defs.has(m.id)).map(m => m.id)];
}
const fails = [], warns = [];
const check = (cond, msg) => { if (!cond) { fails.push(msg); console.log('  FAIL ' + msg); } else console.log('  ok   ' + msg); };

// in-page driver: run the match for `secs` sim seconds in 0.5 s chunks, sample positions, detect stuck bots
const DRIVER = () => {
  window.BT = {
    setup() {
      const g = LF.game;
      if (g.local && g.players.has(g.local.id)) { g.removePlayer(g.local.id); }
      LF.loop.setScene(null);
      const S = this.S = { kills: { 1: 0, 2: 0, 0: 0 }, obj: {}, stuck: [], nan: [], falls: [], cover: new Set(), moved: {}, chat: [], hs: 0, nadeThrows: 0, events: [] };
      g.bus.on('kill', e => { if (e.killer && e.killer !== e.victim) S.kills[e.killer.team] = (S.kills[e.killer.team] || 0) + 1; if (e.headshot) S.hs++; });
      g.bus.on('objective', e => { const k = e.kind + ':' + e.action; S.obj[k] = (S.obj[k] || 0) + 1; if (/plant|defus|explod/.test(e.action)) S.events.push([+g.time.toFixed(1), k, e.actor ? e.actor.name : '']); });
      g.bus.on('chat', e => { if (e.bot && S.chat.length < 60) S.chat.push((e.from ? e.from.name : '') + ' [' + e.team + ']: ' + e.text); });
      g.bus.on('grenade:throw', () => S.nadeThrows++);
      this.track = new Map();
      if (g.bots.statsReset) g.bots.statsReset();
    },
    run(secs) {
      const g = LF.game, S = this.S, t0 = performance.now(), m = g.match;
      let maxTick = 0, ticks = 0;
      for (let t = 0; t < secs && !g.ended; t += 0.5) {
        const a = performance.now(); g.debugStep(0.5); const dt = performance.now() - a; ticks += 32; maxTick = Math.max(maxTick, dt / 32);
        const frozen = m.isFrozen();
        for (const p of g.players.values()) {
          if (!p.alive) { this.track.delete(p.id); continue; }
          if (!isFinite(p.pos.x) || !isFinite(p.pos.y) || !isFinite(p.pos.z) || !isFinite(p.yaw) || !isFinite(p.pitch)) S.nan.push([p.id, g.time]);
          if (p.pos.y < (g.def.bounds.minY ?? -50) - 5) S.falls.push([p.id, p.pos.x, p.pos.y, p.pos.z]);
          S.cover.add(Math.floor(p.pos.x / 4) + ',' + Math.floor(p.pos.z / 4));
          const b = g.bots.brains.get(p.id); if (!b) continue;
          const wants = b.mv.speed > 0.2 && !frozen && !p.busy && !p.hold;
          let T = this.track.get(p.id);
          if (!T) { T = { x: p.pos.x, z: p.pos.z, t: g.time, want: 0, rep: false }; this.track.set(p.id, T); }
          if (Math.hypot(p.pos.x - T.x, p.pos.z - T.z) > 1.0 || !wants) { T.x = p.pos.x; T.z = p.pos.z; T.t = g.time; T.want = 0; T.rep = false; }
          else { T.want += 0.5; if (T.want >= 10 && !T.rep) { T.rep = true; const d = b.debug(); S.stuck.push({ id: p.id, name: p.name, t: +g.time.toFixed(1), x: +p.pos.x.toFixed(1), y: +p.pos.y.toFixed(1), z: +p.pos.z.toFixed(1), task: d.task, goal: d.goal, path: d.path }); } }
        }
      }
      return { wall: performance.now() - t0, maxTick, ticks };
    },
    /** A stand-in grenade system when js/grenades/sim.js is not there yet: ballistic flight (gravity, the grenade's drag), first
        world contact = landing, smokes become 4.5 m navgrid blockers for 15 s. Landing error vs the bot's target is recorded. */
    async stubNades() {
      const g = LF.game; if (g.getSystem('nades')) return 'real';
      const R = await import('/js/phys/ray.js'), D = await import('/js/grenades/data.js'), M = await import('/js/phys/move.js');
      const S = this.S; S.land = []; const live = [];
      g.addSystem({ name: 'nades', stub: true,
        throw(p, gid, o) {
          const nd = D.getNade(gid); if (!nd) return false;
          const e = M.eyePos(p, { x: 0, y: 0, z: 0 }), sp = o && o.under ? nd.lobSpeed : nd.throwSpeed, cp = Math.cos(p.pitch);
          const b = g.bots.brains.get(p.id);
          const n = { gid, kind: nd.kind, drag: nd.drag || 0, x: e.x, y: e.y, z: e.z, vx: Math.sin(p.yaw) * cp * sp + p.vel.x, vy: -Math.sin(p.pitch) * sp + p.vel.y,
            vz: Math.cos(p.yaw) * cp * sp + p.vel.z, t: 0, want: b && b.lastThrow ? b.lastThrow.to : null, why: b && b.lastThrow ? b.lastThrow.why : '', who: p.name };
          n.pos = n; live.push(n); g.bus.emit('grenade:throw', { p, gid, nade: n }); return true;
        },
        tick(dt) {
          for (let i = live.length - 1; i >= 0; i--) {
            const n = live[i]; n.t += dt;
            n.vy -= 9.81 * dt; const k = Math.exp(-n.drag * dt); n.vx *= k; n.vy *= k; n.vz *= k;
            const nx = n.x + n.vx * dt, ny = n.y + n.vy * dt, nz = n.z + n.vz * dt;
            if (!R.segmentClear(g.world, n.x, n.y, n.z, nx, ny, nz, { solid: true }) || n.t > 6) {
              live.splice(i, 1);
              const err = n.want ? Math.hypot(n.x - n.want.x, n.z - n.want.z) : null;
              S.land.push({ gid: n.gid, why: n.why, who: n.who, err: err == null ? null : +err.toFixed(1), x: +n.x.toFixed(1), z: +n.z.toFixed(1) });
              if (n.kind === 'smoke' && g.map.nav) { const off = g.map.nav.addBlocker({ x: n.x, y: n.y + 1.2, z: n.z, r: 4.5 }); n.off = off; n.until = g.time + 15; S.smokes = (S.smokes || []); S.smokes.push(n); }
              continue;
            }
            n.x = nx; n.y = ny; n.z = nz;
          }
          if (S.smokes) for (let i = S.smokes.length - 1; i >= 0; i--) if (g.time > S.smokes[i].until) { S.smokes[i].off(); S.smokes.splice(i, 1); }
        },
      });
      return 'stub';
    },
    report() {
      const g = LF.game, S = this.S, st = g.bots.stats();
      const ps = [...g.players.values()];
      return { land: S.land || [], time: +g.time.toFixed(1), phase: g.match.phase, round: g.match.round, score: { ...g.match.score }, kills: S.kills, hs: S.hs, obj: S.obj, events: S.events.slice(0, 30),
        stuck: S.stuck, nan: S.nan.length, falls: S.falls.length, cells: S.cover.size, chat: S.chat, nadeThrows: S.nadeThrows, bots: st,
        players: ps.map(p => ({ n: p.name, t: p.team, k: p.kills, d: p.deaths, $: p.money, gun: p.inv.primary ? p.inv.primary.gunId : '-' })) };
    },
    /** a spectator camera behind (and above) the bot that is fighting, else the first live bot */
    async spectate(prefer) {
      const g = LF.game;
      let b = null;
      for (const x of g.bots.brains.values()) if (x.p.alive && x.target && x.tVisible) { b = x; break; }
      if (!b && prefer) b = [...g.bots.brains.values()].find(prefer);
      if (!b) b = [...g.bots.brains.values()].find(x => x.p.alive);
      if (!b) return null;
      const p = b.p, fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
      g.bodies.debug.cam = { pos: [p.pos.x - fx * 3.4 + fz * 0.9, p.pos.y + 2.3, p.pos.z - fz * 3.4 - fx * 0.9], target: [p.pos.x + fx * 6, p.pos.y + 1.2, p.pos.z + fz * 6], fov: 1.0 };
      g.effects && (g.effects.hold = true);
      for (const id of ['hud', 'ui']) { const e = document.getElementById(id); if (e) e.style.visibility = 'hidden'; }
      LF.loop.setScene(g.scene);
      const f0 = LF.loop.loopStats.frames; while (LF.loop.loopStats.frames < f0 + 3) await new Promise(r => setTimeout(r, 30));
      return { id: p.id, name: p.name, task: b.debug().task, target: b.target ? b.target.name : null };
    },
    hide() { LF.loop.setScene(null); for (const id of ['hud', 'ui']) { const e = document.getElementById(id); if (e) e.style.visibility = ''; } },
  };
};

async function runOne(browser, srv, map, mode) {
  console.log(`\n== ${map} / ${mode} (${BOTS} bots, ${MINS} sim min, skill ${SKILL})`);
  const hash = `#dev&map=${map}&mode=${mode}&bots=${BOTS}&skill=${SKILL}&q=low&autostart&nolens&nodyn&seed=11&warmup=0&score=9999`;
  const { ctx, page, errs } = await openPage(browser, srv.url, hash, { width: 640, height: 360 });
  page.setDefaultTimeout(900000);
  const t0 = Date.now();
  try {
    await page.waitForFunction(() => window.LF && LF.game && LF.game.ready, null, { timeout: 600000, polling: 500 });
    await page.evaluate(DRIVER);
    await page.evaluate(() => BT.setup());
    const nades = await page.evaluate(() => BT.stubNades());
    console.log('  loaded in ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s');
    await page.evaluate(() => { BT.run(4); LF.game.bots.statsReset(); });      // JIT warm-up, then measure
    let wall = 0, maxTick = 0, nshot = 0;
    const total = MINS * 60, chunk = 30;
    for (let s = 0; s < total; s += chunk) {
      const r = await page.evaluate(n => BT.run(n), Math.min(chunk, total - s));
      wall += r.wall; maxTick = Math.max(maxTick, r.maxTick);
      if (SHOTS && nshot < 3 && s >= chunk && (s / chunk) % 2 === 1) {
        const v = await page.evaluate(() => BT.spectate());
        if (v) { await shot(page, `bots-${map}-${mode}-${nshot}`); console.log(`  shot ${nshot}: ${v.name} ${v.task}${v.target ? ' vs ' + v.target : ''}`); nshot++; }
        await page.evaluate(() => BT.hide());
      }
    }
    const R = await page.evaluate(() => BT.report());
    const B = R.bots;
    console.log(`  sim ${R.time}s in ${(wall / 1000).toFixed(1)}s wall (x${(R.time / (wall / 1000)).toFixed(1)}), round ${R.round}, score ${JSON.stringify(R.score)}, kills ${JSON.stringify(R.kills)} hs ${R.hs}`);
    console.log(`  bots: think avg ${B.thinkAvg} ms max ${B.thinkMax} ms, system avg ${B.sysAvg} max ${B.sysMax} ms, worst tick ${maxTick.toFixed(2)} ms; paths ${JSON.stringify(B.paths)}`);
    console.log(`  nades (${nades}) started ${B.nades} thrown ${B.thrown} (game throws ${R.nadeThrows}), repaths ${B.repaths}, map cells visited ${R.cells}`);
    const errsN = R.land.filter(l => l.err != null).map(l => l.err);
    if (R.land.length) console.log('  grenade landings ' + R.land.slice(0, 10).map(l => `${l.gid}/${l.why} err ${l.err}`).join(', ') + (errsN.length ? ` · median error ${errsN.sort((a, b) => a - b)[Math.floor(errsN.length / 2)]} m` : ''));
    if (Object.keys(R.obj).length) console.log('  objectives ' + JSON.stringify(R.obj));
    if (R.events.length) console.log('  events ' + R.events.slice(0, 12).map(e => e.join(' ')).join(' | '));
    if (B.buys && B.buys.length) console.log('  buys ' + B.buys.map(b => `T${b.list ? '' : ''}${b.kind}($${b.avg})`).join(', ') + ' :: ' + (B.buys[0].list || []).slice(0, 5).join(' '));
    if (R.chat.length) console.log('  chat ' + R.chat.slice(0, 10).join(' | '));
    if (R.stuck.length) console.log('  stuck ' + R.stuck.slice(0, 12).map(s => `${s.name}@${s.x},${s.y},${s.z} t${s.t} ${s.task}/${s.goal} p${s.path}`).join(' | '));
    const tag = map + '/' + mode;
    if (mode === 'hideseek' || mode === 'infection') check(R.kills[1] + R.kills[2] > 0, `${tag}: kills happen (${R.kills[1]} / ${R.kills[2]})`);
    else if (mode === 'ffa') check(R.kills[0] > 3, `${tag}: kills happen (${R.kills[0]})`);
    else check(R.kills[1] > 0 && R.kills[2] > 0, `${tag}: kills on both teams (${R.kills[1]} / ${R.kills[2]})`);
    const OBJ = { hostage: ['hostage:picked', 'hostage:pick_start'], ctf: ['flag:taken'], domination: ['zone:captured'], koth: ['zone:captured'], hardpoint: ['zone:captured'],
      killconfirmed: ['tag:confirmed', 'tag:denied'], vip: ['vip:extracting', 'vip:escaped', 'vip:killed'], headquarters: ['zone:captured'] }[mode];
    if (OBJ) check(OBJ.some(k => R.obj[k] > 0), `${tag}: the bots play the objective (${OBJ.join(' / ')}: ${JSON.stringify(R.obj)})`);
    check(R.nan === 0 && R.falls === 0, `${tag}: no NaN (${R.nan}) and nobody under the map (${R.falls})`);
    check(R.stuck.length <= 1, `${tag}: nobody stuck > 10 s (${R.stuck.length})`);
    check(!B.err, `${tag}: no brain exceptions ${B.err ? B.err.slice(0, 300) : ''}`);
    check(B.tickAvg < 1.2 && B.tickP99 < 4, `${tag}: frame budget: all bots per 64 Hz tick avg ${B.tickAvg} ms, p99 ${B.tickP99} ms (max ${B.tickMax}, GC included)`);
    if (mode === 'demolition' && nades === 'stub' && R.land.length) {
      const e = R.land.filter(l => l.err != null && l.why !== 'flash').map(l => l.err).sort((a, b) => a - b);
      if (e.length >= 3) check(e[Math.floor(e.length / 2)] < 4.5, `${tag}: grenades land near what the bots aimed at (median ${e[Math.floor(e.length / 2)]} m of ${e.length})`);
    }
    if (mode === 'demolition') {
      const tries = (R.obj['bomb:plant_start'] || 0), planted = R.obj['bomb:planted'] || 0;
      check(tries > 0, `${tag}: the attackers reach a site and start planting (${tries})`);
      check(planted > 0, `${tag}: charges get planted (${planted})`);
      if (planted) { const out = (R.obj['bomb:defused'] || 0) + (R.obj['bomb:exploded'] || 0) + (R.obj['bomb:defuse_start'] || 0); check(out > 0, `${tag}: defuse attempts / detonations (${JSON.stringify(R.obj)})`); }
      check(B.buys && B.buys.length > 0, `${tag}: the teams buy`);
    }
    check(errs.length === 0, `${tag}: zero console errors` + (errs.length ? ' -> ' + errs.slice(0, 4).join(' | ') : ''));
    return R;
  } catch (e) {
    check(false, `${map}/${mode}: ${e.message.split('\n')[0]}`);
    return null;
  } finally { await ctx.close(); }
}

const srv = await startServer();
const browser = await launch();
const results = {};
try {
  const maps = await mapList();
  console.log('maps: ' + maps.join(', ') + ' · modes: ' + MODES.join(', '));
  for (const map of maps) for (const mode of MODES) results[map + '/' + mode] = await runOne(browser, srv, map, mode);
} finally { await browser.close(); srv.stop(); }
fs.writeFileSync(path.join(ROOT, 'tools/test/out/bots-results.json'), JSON.stringify(results, null, 1));
console.log(fails.length ? `\nBOTS FAILED (${fails.length}):\n  ` + fails.join('\n  ') : '\nBOTS OK');
process.exit(fails.length ? 1 : 0);
