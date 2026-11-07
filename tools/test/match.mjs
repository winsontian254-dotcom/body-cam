// Match test: boots LIVE FIRE headless and drives real matches through window.LF (game.debugStep runs the 64 Hz simulation
// synchronously, so nothing waits on SwiftShader frame times). FAILS on any console error.
//   node tools/test/match.mjs [--map=dev_range] [--bots=8] [--secs=90] [--quick]      screenshots -> tools/test/out/match-*.png
// 1. TDM with bots: kills happen, team scores follow team kills, nobody falls through the world, no NaN positions, bots move,
//    respawns land away from enemies; HUD screenshots of a fight (hit marker, killfeed, damage).
// 2. Combat rules: friendly fire is dropped, armour / helmet, wall penetration (rifle through brick, pistol stopped by concrete),
//    exact automatic fire rate at 64 Hz, semi-auto rate limit, empty reload time, knife backstab.
// 3. FFA: everyone on team 0, kills counted per player.
// 4. Match end (score limit) -> results screen -> CONTINUE -> main menu; menu flow: title -> PLAY -> DEPLOY -> pause -> quit.
import { launch, startServer, shot } from './lib.mjs';
import { openPage } from './smoke.mjs';
import { Match } from '../../js/game/match.js';
import { Bus } from '../../js/core/events.js';

const arg = (k, d) => { const a = process.argv.find(s => s.startsWith('--' + k + '=')); return a ? a.split('=')[1] : d; };
const MAP = arg('map', 'dev_range'), BOTS = +arg('bots', 8), SECS = +arg('secs', 90), QUICK = process.argv.includes('--quick');
const fails = [];
const check = (cond, msg) => { if (!cond) { fails.push(msg); console.log('  FAIL ' + msg); } else console.log('  ok   ' + msg); };
const frames = async (page, n = 3) => { const f0 = await page.evaluate(() => LF.loop.loopStats.frames); await page.waitForFunction(k => LF.loop.loopStats.frames >= k, f0 + n, { timeout: 90000, polling: 50 }); };
const ready = page => page.waitForFunction(() => window.LF && LF.game && LF.game.ready, null, { timeout: 240000, polling: 250 });

// shared in-page helpers (installed once per page)
const HELPERS = () => {
  window.T = {
    tp(q, x, z, yaw, y) { const g = LF.game; const gr = y != null ? { y } : g.world.groundAt(x, z, 30, 0.3); q.pos.x = x; q.pos.y = gr ? gr.y : 0; q.pos.z = z; if (yaw != null) q.yaw = yaw;
      q.vel.x = q.vel.y = q.vel.z = 0; Object.assign(q.prev, { x, y: q.pos.y, z, yaw: q.yaw }); q.mantle = null; if (q.local && yaw != null) g.setView(yaw, 0); },
    foe() { const g = LF.game, p = g.local; return [...g.players.values()].find(q => q !== p && q.alive && (q.team === 0 || q.team !== p.team)); },
    mate() { const g = LF.game, p = g.local; return [...g.players.values()].find(q => q !== p && q.team === p.team && p.team > 0); },
    give(id) { const g = LF.game, p = g.local; g.giveWeapon(p, id); g.debugStep(1.5); },
    fireTicks(n, btn = 1) { const g = LF.game; g.setLocalCommand({ buttons: btn }); g.debugStep(n / 64); g.setLocalCommand(null); g.debugStep(1 / 64); },
  };
};

/** Round flow in Node (pure JS Match with a stub game): freeze -> live -> elimination -> round end -> halftime swap -> over. */
function roundFlow() {
  console.log('Round flow (Node, stub game)');
  const bus = new Bus('t'), gates = [], events = [];
  const players = new Map();
  for (let i = 0; i < 6; i++) players.set('p' + i, { id: 'p' + i, team: i < 3 ? 1 : 2, alive: false, connected: true, score: 0, kills: 0, respawnT: 0 });
  const game = { bus, players, map: { closeGates: () => gates.push('closed'), openGates: () => gates.push('open') }, spawn: p => { p.alive = true; }, resetRound() {} };
  for (const n of ['round:freeze', 'round:start', 'round:end', 'halftime', 'match:end']) bus.on(n, e => events.push(n + (e && e.winner != null ? ':' + e.winner : '')));
  const mode = { id: 'elim', teams: 2, respawn: false, rounds: 6, winRounds: 4, roundTime: 30, freezeTime: 2, roundEndTime: 3, halftimeTime: 4 };
  const m = new Match(game, mode, {});
  m.start();
  const run = s => { for (let t = 0; t < s; t += 1 / 64) m.tick(1 / 64); };
  check(m.phase === 'freeze' && gates.at(-1) === 'closed' && m.isFrozen(), 'round 1 starts frozen behind closed gates');
  run(2.05);
  check(m.phase === 'live' && gates.at(-1) === 'open', 'freeze ends -> live, gates open');
  const kill = team => { for (const p of players.values()) if (p.team === team) p.alive = false; };
  const sideOf = id => players.get(id).team;
  kill(2); run(0.05);
  check(m.phase === 'roundEnd' && m.score[1] === 1, 'eliminating team 2 wins the round for team 1');
  run(3.05);
  check(m.phase === 'freeze' && m.round === 2 && [...players.values()].every(p => p.alive), 'next round respawns everyone frozen');
  run(2.05); kill(2); run(3.2); run(2.05); kill(1); run(3.2); run(2.05);
  // 3 rounds played (team 1: 2, team 2: 1) -> halftime
  check(m.phase === 'halftime' || events.includes('halftime'), 'halftime after half of the rounds (' + m.phase + ', score ' + JSON.stringify(m.score) + ')');
  const before = { s1: m.score[1], s2: m.score[2], side: sideOf('p0') };
  run(4.1);
  check(sideOf('p0') === 3 - before.side && m.score[1] === before.s2 && m.score[2] === before.s1, 'halftime swaps sides and the scores follow the players');
  // p0's group (now team 2) wins rounds until it reaches 4
  for (let i = 0; i < 6 && m.phase !== 'over'; i++) { run(2.05); if (m.phase !== 'live') break; kill(1); run(3.2); }
  check(m.phase === 'over' && m.winner === 2 && m.score[2] >= 4, 'first to winRounds ends the match (' + JSON.stringify(m.score) + ', winner ' + m.winner + ')');
  // time-out goes to the defenders
  const m2 = new Match(game, { ...mode, freezeTime: 0 }, {}); m2.start(); for (let t = 0; t < 31; t += 1 / 64) m2.tick(1 / 64);
  check(m2.phase === 'roundEnd' && m2.roundWinner === 2 && m2.reason === 'time', 'round timer expiry: defenders (team 2) win');
  // timed respawn mode: score limit
  const m3 = new Match(game, { teams: 2, respawn: true, rounds: 0, timeLimit: 60, scoreLimit: 3, freezeTime: 0 }, {}); m3.start();
  for (let i = 0; i < 3; i++) m3.addScore(1, 1);
  check(m3.phase === 'over' && m3.winner === 1, 'timed mode: reaching the score limit ends the match');
  const m4 = new Match(game, { teams: 2, respawn: true, rounds: 0, timeLimit: 2, scoreLimit: 0, freezeTime: 0 }, {}); m4.start(); m4.addScore(2, 1);
  for (let t = 0; t < 2.1; t += 1 / 64) m4.tick(1 / 64);
  check(m4.phase === 'over' && m4.winner === 2 && m4.reason === 'time', 'timed mode: time limit -> the leader wins');
}

async function main() {
  const t0 = Date.now();
  roundFlow();
  const srv = await startServer();
  const browser = await launch();
  try {
    // ======================================================================= 1. TDM with bots
    {
      console.log('TDM on ' + MAP + ' with ' + BOTS + ' bots, ' + SECS + ' s simulated');
      const { ctx, page, errs } = await openPage(browser, srv.url, `#dev&map=${MAP}&mode=tdm&bots=${BOTS}&q=low&autostart&nolens&nodyn&seed=11&freeze=1&score=500`);
      await ready(page); await page.evaluate(HELPERS);
      const gt = await page.evaluate(() => { const g = LF.game, a = { phase: g.match.phase, closed: g.map.gateList.every(x => !x.open) }; g.debugStep(1.2); return { ...a, phase2: g.match.phase, open: g.map.gateList.every(x => x.open), solid: g.map.gateList.some(x => g.world.get(x.id).solid) }; });
      check(gt.phase === 'freeze' && gt.closed && gt.phase2 === 'live' && gt.open && !gt.solid, 'lobby gates closed during freeze, open (not solid) when live');
      check(await page.evaluate(n => LF.game.players.size === n + 1, BOTS), 'players created (' + await page.evaluate(() => LF.game.players.size) + ')');
      const sim = await page.evaluate(async (SECS) => {
        const g = LF.game, P = [...g.players.values()];
        const minY = (g.def.bounds && g.def.bounds.minY != null ? g.def.bounds.minY : -50) - 1;
        const travel = new Map(P.map(p => [p.id, 0])), last = new Map(P.map(p => [p.id, { ...p.pos }]));
        const spawnD = []; let nan = 0, low = 0, hs = 0, kills = 0, teamKills = { 1: 0, 2: 0 }, suicides = 0, wallbangs = 0;
        g.bus.on('kill', e => { kills++; if (e.headshot) hs++; if (e.wallbang) wallbangs++; if (e.suicide) suicides++; else if (e.killer && e.killer.team !== e.victim.team) teamKills[e.killer.team]++; });
        g.bus.on('spawn', e => { if (e.lobby) return; let d = 1e9; for (const q of g.players.values()) if (q.alive && q !== e.p && q.team !== e.p.team) d = Math.min(d, Math.hypot(q.pos.x - e.p.pos.x, q.pos.z - e.p.pos.z)); spawnD.push(d); });
        g.setLocalCommand({ buttons: 0 });       // the local player stands still in the lobby / field: bots fight
        const t0 = performance.now();
        for (let s = 0; s < SECS; s += 0.5) {
          g.debugStep(0.5);
          for (const p of g.players.values()) {
            if (!Number.isFinite(p.pos.x) || !Number.isFinite(p.pos.y) || !Number.isFinite(p.pos.z) || !Number.isFinite(p.yaw)) nan++;
            if (p.alive && p.pos.y < minY) low++;
            const l = last.get(p.id); if (p.alive) travel.set(p.id, travel.get(p.id) + Math.min(5, Math.hypot(p.pos.x - l.x, p.pos.z - l.z))); last.set(p.id, { ...p.pos });
          }
        }
        const ms = performance.now() - t0;
        const bots = P.filter(p => p.bot);
        return { ms, kills, hs, wallbangs, suicides, teamKills, score: { ...g.match.score }, nan, low, phase: g.match.phase, spawnD,
          minTravel: Math.min(...bots.map(p => travel.get(p.id))), avgTravel: bots.reduce((a, p) => a + travel.get(p.id), 0) / bots.length,
          shots: P.reduce((a, p) => a + p.stat.shots, 0), hits: P.reduce((a, p) => a + p.stat.hits, 0), errors: LF.loop.loopStats.errors };
      }, SECS);
      console.log('  sim ' + SECS + ' s in ' + Math.round(sim.ms) + ' ms: ' + sim.kills + ' kills (' + sim.hs + ' HS, ' + sim.wallbangs + ' wallbangs, ' + sim.suicides + ' suicides), score '
        + sim.score[1] + '-' + sim.score[2] + ', shots ' + sim.shots + ' hits ' + sim.hits + ', bot travel min ' + sim.minTravel.toFixed(0) + ' m avg ' + sim.avgTravel.toFixed(0) + ' m');
      check(sim.kills >= Math.max(3, BOTS / 2), 'kills happen (' + sim.kills + ')');
      check(sim.score[1] === sim.teamKills[1] && sim.score[2] === sim.teamKills[2], 'team scores follow team kills (' + JSON.stringify(sim.score) + ' vs ' + JSON.stringify(sim.teamKills) + ')');
      check(sim.nan === 0, 'no NaN positions');
      check(sim.low === 0, 'nobody fell through the world');
      check(sim.minTravel > 8, 'every bot moved (min ' + sim.minTravel.toFixed(1) + ' m)');
      check(sim.hs / Math.max(1, sim.kills) < 0.75, 'headshot share is plausible (' + Math.round(100 * sim.hs / Math.max(1, sim.kills)) + '%)');
      check(sim.spawnD.length === 0 || Math.min(...sim.spawnD) > 6, 'respawns land away from enemies (min ' + (sim.spawnD.length ? Math.min(...sim.spawnD).toFixed(1) : '-') + ' m over ' + sim.spawnD.length + ')');
      check(sim.errors === 0, 'no loop errors');
      // ---- the local player in a fight: HUD screenshots
      await page.evaluate(() => {
        const g = LF.game, p = g.local; g.setLocalCommand(null);
        if (!p.alive) g.spawn(p);
        g.options.botMode = 'static';
        const f = T.foe(); T.tp(p, -20, -12, Math.PI / 2); T.tp(f, -11, -12.5, -Math.PI / 2 + 0.4); f.hp = 100; f.armor = 100; f.helmet = true;
        g.debugStep(0.2); g.aimAt(f, 'chest');
      });
      await frames(page, 3);
      await shot(page, 'match-hud-aim');
      const fight = await page.evaluate(() => { const g = LF.game, f = T.foe(); g.aimAt(f, 'chest'); const hp0 = f.hp; T.fireTicks(6, 1); return { hp0, hp1: f.hp, alive: f.alive }; });
      await frames(page, 1); await shot(page, 'match-hud-hit');
      check(fight.hp1 < fight.hp0 || !fight.alive, 'local fire damages the target (' + fight.hp0 + ' -> ' + fight.hp1 + ')');
      await page.evaluate(() => { const g = LF.game, f = T.foe(); if (f) { g.aimAt(f, 'head'); T.fireTicks(10, 1); } g.debugStep(0.3); });
      await frames(page, 3); await shot(page, 'match-hud-kill');
      // take damage from a bot (damage indicator, aim punch)
      await page.evaluate(() => { const g = LF.game, p = g.local, f = T.foe(); if (f) g.damage(p, { attacker: f, dmg: 35, group: 'chest', kind: 'bullet', weapon: 'purga' }); g.options.botMode = 'normal'; });
      await frames(page, 2); await shot(page, 'match-hud-damage');
      check(errs.length === 0, 'TDM: zero console errors' + (errs.length ? ' -> ' + errs.slice(0, 5).join(' | ') : ''));
      await ctx.close();
    }
    // ======================================================================= 2. combat rules
    {
      console.log('Combat rules (practice, static bots)');
      const { ctx, page, errs } = await openPage(browser, srv.url, `#dev&map=dev_range&mode=practice&bots=3&team=1&q=low&autostart&nolens&nodyn&seed=4&freeze=0&botmode=static&infammo=false`);
      await ready(page); await page.evaluate(HELPERS);
      const r = await page.evaluate(() => {
        const g = LF.game, p = g.local, out = {};
        g.options.infiniteAmmo = false;
        const mate = T.mate(), foe = T.foe();
        // friendly fire
        mate.hp = 100; out.ff = g.damage(mate, { attacker: p, dmg: 50, group: 'chest', kind: 'bullet' }); out.ffHp = mate.hp;
        out.ffFlash = (g.damage(mate, { attacker: p, dmg: 0, kind: 'blast', effects: { flash: 3 } }), mate.flash);
        out.self = g.damage(p, { attacker: p, dmg: 20, kind: 'bullet' });
        // armour: 100 dmg chest at armorPen .5 vs fresh armour
        foe.hp = 100; foe.armor = 100; foe.helmet = false; foe.spawnProtect = 0;
        out.armorDealt = g.damage(foe, { attacker: p, dmg: 40, group: 'chest', armorPen: 0.5, kind: 'bullet' }); out.armorLeft = foe.armor;
        out.legDealt = g.damage(foe, { attacker: p, dmg: 20, group: 'leg', armorPen: 0.5, kind: 'bullet' });
        foe.hp = 100; foe.armor = 100;
        // exact automatic rate: Warden 750 rpm, 1 s of trigger
        T.give('warden'); T.tp(p, -20, -20, Math.PI, 0); g.setView(Math.PI, -0.4);
        const w = p.inv.primary; w.mag = 30; const s0 = p.stat.shots;
        g.setLocalCommand({ buttons: 1 }); g.debugStep(1); g.setLocalCommand(null); g.debugStep(0.05);
        out.auto = p.stat.shots - s0;
        // semi limit: the pistol (400 rpm) with the trigger toggled every tick
        g.setLocalCommand({ slot: 'secondary' }); g.debugStep(1); g.setLocalCommand(null); g.debugStep(0.1);
        const s1 = p.stat.shots; p.inv.secondary.mag = 18;
        for (let i = 0; i < 64; i++) { g.setLocalCommand({ buttons: i % 2 ? 0 : 1 }); g.debugStep(1 / 64); }
        g.setLocalCommand(null); out.semi = p.stat.shots - s1;
        // empty reload of the Warden
        g.setLocalCommand({ slot: 'primary' }); g.debugStep(1.2); g.setLocalCommand(null);
        p.inv.primary.mag = 0; p.inv.primary.reserve = 90;
        g.setLocalCommand({ buttons: 32 }); g.debugStep(2 / 64); g.setLocalCommand(null);
        const st = p.ws.rl ? p.ws.rl.dur : 0;
        g.debugStep(st - 0.15); out.rlMid = { state: p.ws.state, mag: p.inv.primary.mag };
        g.debugStep(0.3); out.rlEnd = { state: p.ws.state, mag: p.inv.primary.mag, reserve: p.inv.primary.reserve, dur: st };
        // penetration: rifle through the building's west wall (brick / plaster, .2 m)
        foe.hp = 100; foe.armor = 0; foe.helmet = false; foe.alive = true;
        T.tp(p, -14.5, -6.5, Math.PI / 2, 0); T.tp(foe, -8.2, -6.5, -Math.PI / 2, 0.12); g.debugStep(2 / 64);
        let wb = null; const off = g.bus.on('hit', e => { if (e.victim === foe) wb = e; });
        let hits = [];
        const off2 = g.bus.on('shot', e => { if (e.p === p) hits.push(e.traces[0]); });
        g.aimAt(foe, 'chest'); p.ws.ax = p.ws.ay = 0; p.ws.bloom = 0; T.fireTicks(1, 1); g.debugStep(0.4);
        off(); off2();
        out.pen = { hp: foe.hp, hit: wb && { dmg: wb.dmg, group: wb.group }, end: hits[0] && hits[0].dist };
        // pistol (pen 1) into the concrete lobby wall (.2 m): stopped
        foe.hp = 100; foe.alive = true;
        T.tp(p, -37, 3.5, 0, 0.12); T.tp(foe, -37, 8.5, Math.PI, 0); g.debugStep(2 / 64);
        g.setLocalCommand({ slot: 'secondary' }); g.debugStep(1); g.setLocalCommand(null);
        g.aimAt(foe, 'chest'); p.ws.ax = p.ws.ay = 0; T.fireTicks(1, 1); g.debugStep(0.3);
        out.pistolWall = foe.hp;
        // knife backstab from behind
        foe.hp = 100; foe.armor = 100; foe.alive = true;
        T.tp(foe, -20, -10, 0, 0); T.tp(p, -20, -11.1, 0, 0); g.debugStep(2 / 64);
        g.setLocalCommand({ slot: 'melee' }); g.debugStep(0.6); g.setLocalCommand(null);
        g.aimAt(foe, 'chest'); g.setLocalCommand({ buttons: 2 }); g.debugStep(0.5); g.setLocalCommand(null); g.debugStep(0.6);
        out.backstab = { alive: foe.alive, hp: foe.hp };
        // burst: the Tsubame fires exactly 3 rounds per trigger pull
        T.give('tsubame'); T.tp(p, -20, -20, Math.PI, 0); g.setView(Math.PI, -0.4);
        let b0 = p.stat.shots; T.fireTicks(30, 1); g.debugStep(0.4); out.burst1 = p.stat.shots - b0;
        b0 = p.stat.shots; for (let i = 0; i < 2; i++) { T.fireTicks(2, 1); g.debugStep(0.5); } out.burst2 = p.stat.shots - b0;
        // fire-mode switch (X): the Spatz goes auto -> burst -> semi
        T.give('spatz'); const modes = [p.inv.primary.fireMode];
        for (let i = 0; i < 2; i++) { g.setLocalCommand({ buttons: 4096 }); g.debugStep(2 / 64); g.setLocalCommand(null); g.debugStep(2 / 64); modes.push(p.inv.primary.fireMode); }
        out.modes = modes;
        // shotgun: pellets on a chest at 5 m
        T.give('cacciatore'); foe.hp = 100; foe.armor = 0; foe.alive = true; T.tp(foe, -20, -25, 0, 0); g.debugStep(2 / 64);
        let pel = 0; const offP = g.bus.on('hit', e => { if (e.victim === foe) pel++; });
        g.aimAt(foe, 'chest'); p.ws.ax = p.ws.ay = 0; T.fireTicks(1, 1); g.debugStep(0.2); offP();
        out.pellets = { hits: pel, hp: foe.hp, alive: foe.alive };
        // shell-by-shell reload of the Cacciatore, interrupted by the trigger after the current shell
        const sg = p.inv.primary; sg.mag = 2; sg.reserve = 32; g.debugStep(1.2);
        g.setLocalCommand({ buttons: 32 }); g.debugStep(2 / 64); g.setLocalCommand(null);
        g.debugStep(0.45 + 0.5 * 2 + 0.1);          // start + two shells
        const m1 = sg.mag; g.setLocalCommand({ buttons: 1 }); g.debugStep(2 / 64); g.setLocalCommand(null); g.debugStep(1.0);
        out.shell = { afterTwo: m1, final: sg.mag, state: p.ws.state };
        // drop (G) and pick up again (walk over after the own-drop grace period)
        const id0 = p.inv.primary.uid, n0 = g.drops.length;
        g.setLocalCommand({ buttons: 512 }); g.debugStep(2 / 64); g.setLocalCommand(null);
        const mine = g.drops.find(x => x.w.uid === id0);
        out.dropped = { primary: !!p.inv.primary, added: g.drops.length - n0, mine: !!mine };
        g.debugStep(2.5);
        if (mine) { T.tp(p, mine.x, mine.z, 0, mine.y - 0.02); g.debugStep(0.3); }
        out.picked = !!p.inv.primary && p.inv.primary.uid === id0 && !g.drops.includes(mine);
        out.errors = LF.loop.loopStats.errors;
        return out;
      });
      console.log('  ' + JSON.stringify(r));
      check(r.ff === 0 && r.ffHp === 100, 'friendly fire: teammate damage dropped');
      check(r.ffFlash === 0 || r.ffFlash == null, 'friendly fire: teammate effects (flash) dropped');
      check(r.self === 0, 'no self damage from bullets');
      check(r.armorDealt === 20 && Math.abs(r.armorLeft - 90) < 0.01, 'armour: 40 dmg at .5 pen -> 20 health, armour 100 -> 90 (' + r.armorDealt + ', ' + r.armorLeft + ')');
      check(r.legDealt === 20, 'armour does not cover the legs');
      check(r.auto >= 12 && r.auto <= 13, 'Warden 750 rpm: ' + r.auto + ' shots in 1 s (expected 12-13)');
      check(r.semi >= 6 && r.semi <= 7, 'semi-auto 400 rpm limit: ' + r.semi + ' shots in 1 s of spam (expected 6-7)');
      check(r.rlMid.state === 'reload' && r.rlEnd.state === 'idle' && r.rlEnd.mag === 30 && r.rlEnd.reserve === 60 && Math.abs(r.rlEnd.dur - 2.9) < 0.01, 'empty reload takes reloadEmpty (2.9 s) and moves 30 rounds');
      check(r.pen.hit && r.pen.hp < 100, 'rifle penetrates a .2 m brick wall (' + JSON.stringify(r.pen) + ')');
      check(r.pistolWall === 100, 'pistol is stopped by a .2 m concrete wall');
      check(!r.backstab.alive, 'knife heavy stab from behind kills through armour');
      check(r.burst1 === 3 && r.burst2 === 6, 'burst gun: 3 rounds per trigger pull, holding does not repeat (' + r.burst1 + ', ' + r.burst2 + ')');
      check(r.modes.join('>') === 'auto>burst>semi', 'fire-mode switch cycles auto > burst > semi (' + r.modes.join('>') + ')');
      check(r.pellets.hits >= 4 && (r.pellets.hp < 40 || !r.pellets.alive), 'shotgun: several pellets land at 5 m (' + JSON.stringify(r.pellets) + ')');
      check(r.shell.afterTwo === 4 && r.shell.final === 5 && r.shell.state === 'idle', 'shell reload loads one at a time and stops after the current shell on fire (' + JSON.stringify(r.shell) + ')');
      check(!r.dropped.primary && r.dropped.added === 1 && r.dropped.mine && r.picked, 'drop (G) puts the weapon in the world, walking over it picks it up again');
      check(r.errors === 0, 'no loop errors');
      check(errs.length === 0, 'combat: zero console errors' + (errs.length ? ' -> ' + errs.slice(0, 5).join(' | ') : ''));
      await ctx.close();
    }
    // ======================================================================= 3. FFA
    {
      console.log('FFA');
      const { ctx, page, errs } = await openPage(browser, srv.url, `#dev&map=dev_range&mode=ffa&bots=5&q=low&autostart&nolens&nodyn&seed=7&freeze=1`);
      await ready(page);
      const r = await page.evaluate(secs => { const g = LF.game; g.setLocalCommand({ buttons: 0 }); g.debugStep(secs);
        const P = [...g.players.values()]; return { teams: [...new Set(P.map(p => p.team))], kills: P.reduce((a, p) => a + p.kills, 0), deaths: P.reduce((a, p) => a + p.deaths, 0), err: LF.loop.loopStats.errors }; }, QUICK ? 25 : 45);
      console.log('  ' + JSON.stringify(r));
      check(r.teams.length === 1 && r.teams[0] === 0, 'FFA: everyone on team 0');
      check(r.kills >= 2, 'FFA: kills happen (' + r.kills + ')');
      await frames(page, 3); await shot(page, 'match-ffa');
      check(errs.length === 0, 'FFA: zero console errors' + (errs.length ? ' -> ' + errs.slice(0, 5).join(' | ') : ''));
      await ctx.close();
    }
    // ======================================================================= 4. match end + menu flow
    {
      console.log('Match end and menu flow');
      const { ctx, page, errs } = await openPage(browser, srv.url, `#dev&map=dev_range&mode=tdm&bots=5&q=low&autostart&nolens&nodyn&seed=9&freeze=0&score=3`);
      await ready(page);
      const r = await page.evaluate(() => { const g = LF.game; g.setLocalCommand({ buttons: 0 }); let ended = null; g.bus.on('match:end', e => { ended = e; });
        for (let i = 0; i < 240 && !ended; i++) g.debugStep(0.5); return { ended, phase: g.match.phase }; });
      check(r.ended && r.phase === 'over' && (r.ended.score[1] >= 3 || r.ended.score[2] >= 3), 'score limit ends the match (' + JSON.stringify(r.ended) + ')');
      await page.waitForFunction(() => document.querySelector('[data-screen="results"]'), null, { timeout: 30000, polling: 200 });
      await frames(page, 2); await shot(page, 'match-results');
      await page.click('[data-screen="results"] .lf-btn.primary');
      await page.waitForFunction(() => document.querySelector('[data-screen="title"]') && !LF.game, null, { timeout: 30000, polling: 200 });
      check(true, 'results -> CONTINUE -> main menu, game disposed');
      await shot(page, 'match-title');
      // menu flow
      await page.click('[data-screen="title"] .mn-item[data-id="play"]');
      await page.waitForSelector('[data-screen="practice"]');
      await page.click('[data-screen="practice"] .lf-seg-b[data-id="tdm"]');
      const bots = await page.$('[data-screen="practice"] .pr-bots input');
      await bots.evaluate(e => { e.value = 3; e.dispatchEvent(new Event('input')); });
      await shot(page, 'match-practice-setup');
      await page.click('[data-screen="practice"] .pr-start');
      await ready(page);
      check(await page.evaluate(() => LF.game.players.size === 4), 'DEPLOY starts a match with the chosen bot count');
      await page.evaluate(() => LF.app.pause(true));
      await page.waitForSelector('[data-screen="pause"]');
      await frames(page, 2); await shot(page, 'match-pause');
      check(await page.evaluate(() => LF.game.paused && LF.loop.isPaused()), 'pause menu pauses a local match');
      await page.click('[data-screen="pause"] .lf-btn.danger');
      await page.waitForSelector('.lf-modal-wrap');
      await page.click('.lf-modal-wrap .lf-btn.primary');
      await page.waitForFunction(() => document.querySelector('[data-screen="title"]') && !LF.game && !LF.loop.isPaused(), null, { timeout: 30000, polling: 200 });
      check(true, 'QUIT TO MENU (confirmed) returns to the title and unpauses the loop');
      // a second match after quitting: no leaked listeners / meshes
      await page.click('[data-screen="title"] .mn-item[data-id="play"]');
      await page.waitForSelector('[data-screen="practice"]');
      await page.click('[data-screen="practice"] .pr-start');
      await ready(page);
      const leak = await page.evaluate(() => { const g = LF.game; g.debugStep(5); return { sys: g.systems.length, inputListeners: 0, err: LF.loop.loopStats.errors, hud: document.querySelectorAll('#hud .lf-hud').length }; });
      check(leak.hud === 1 && leak.err === 0, 'second match: one HUD, no loop errors (' + JSON.stringify(leak) + ')');
      check(errs.length === 0, 'menu flow: zero console errors' + (errs.length ? ' -> ' + errs.slice(0, 5).join(' | ') : ''));
      await ctx.close();
    }
  } catch (e) {
    fails.push('exception: ' + (e && e.stack || e));
    console.log('  FAIL exception ' + (e && e.stack || e));
  } finally {
    await browser.close(); srv.stop();
  }
  console.log((fails.length ? 'MATCH FAILED (' + fails.length + ')' : 'MATCH OK') + ' in ' + ((Date.now() - t0) / 1000).toFixed(0) + ' s');
  process.exit(fails.length ? 1 : 0);
}
main();
