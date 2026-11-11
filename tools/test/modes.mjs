// Modes test: every game mode, the match flow, the economy and the objectives. FAILS on any console error.
//   node tools/test/modes.mjs [--only=demolition,ctf] [--noshots] [--skipnode] [--bots=5]      screenshots -> tools/test/out/modes-*.png
// 1. Node (no browser): economy rules (start money, kill rewards, round bonuses + loss ladder, plant bonus, max money, buy zones / buy
//    time, kevlar / helmet / kit, grenade carry rules, refunds, round inventories), the charge (plant inside a site only, fuse,
//    defuse with / without a kit, the blast spares the planting side: friendly fire OFF), zones (capture / neutralise / contest
//    timings), flags, dog tags, hostages, round flow with halftime + overtime, snapshot / apply.
// 2. Browser: each of the 26 modes on dev_range with bots, started through LF.app.play (the real menu controller) and simulated with
//    LF.game.debugStep (the scene is detached while simulating: SwiftShader frames are slow): scripted objective play (plant +
//    explode, defuse, hostage rescue, flag capture, zone capture, HQ, tags, VIP, juggernaut, ladders, infection, hide & seek...),
//    rounds advance, explicit friendly-fire checks (bullets, blast / fire / gas / flash / stun from a team-mate never hurt), no NaN,
//    zero console errors, a HUD screenshot per mode (+ buy menu and scoreboard shots).
import { launch, startServer, shot } from './lib.mjs';
import { openPage } from './smoke.mjs';
import { Match } from '../../js/game/match.js';
import { Bus } from '../../js/core/events.js';
import { createPlayer, BTN } from '../../js/game/player.js';
import { makeWeapon } from '../../js/game/weapon.js';
import { applyDamage } from '../../js/game/combat.js';
import { ECON } from '../../js/game/economy.js';
import { MODES } from '../../js/modes/index.js';

const arg = (k, d) => { const a = process.argv.find(s => s.startsWith('--' + k + '=')); return a ? a.split('=')[1] : d; };
const ONLY = arg('only', '') ? arg('only', '').split(',') : null, SHOTS = !process.argv.includes('--noshots'), BOTS = +arg('bots', 5);
const fails = [];
const check = (cond, msg) => { if (!cond) { fails.push(msg); console.log('  FAIL ' + msg); } else console.log('  ok   ' + msg); };

// ===================================================================================================== 1. Node unit checks
function stubGame(modeDef, n1 = 3, n2 = 3) {
  const bus = new Bus('t'), players = new Map();
  const map = {
    sites: { A: { name: 'A', x0: 10, z0: -10, x1: 20, z1: 0, x: 15, z: -5, y: 0 }, B: { name: 'B', x0: -20, z0: 0, x1: -10, z1: 10, x: -15, z: 5, y: 0 } },
    hostages: [{ x: 0, y: 0, z: 20 }, { x: 2, y: 0, z: 20 }, { x: 4, y: 0, z: 20 }, { x: 6, y: 0, z: 20 }],
    rescues: [{ x0: -40, z0: -40, x1: -30, z1: -30, x: -35, z: -35, y: 0 }], rescue: null,
    points: { dom1: { x: 0, y: 0, z: 0, r: 3 }, flag1: { x: -30, y: 0, z: 0, r: 1.5 }, flag2: { x: 30, y: 0, z: 0, r: 1.5 }, extract1: { x: 0, y: 0, z: -30, r: 3 } },
    buyzones: { 1: [{ x0: -50, z0: -5, x1: -40, z1: 5, y: 0 }], 2: [{ x0: 40, z0: -5, x1: 50, z1: 5, y: 0 }] },
    lobbies: {}, hides: [], closeGates() {}, openGates() {},
  };
  map.rescue = map.rescues[0];
  const game = { bus, players, map, world: null, def: { bounds: { minY: -10 } }, seed: 7, rng: (() => { let s = 7; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })(),
    options: {}, time: 0, tick: 0, authority: 'local', drops: [], mode: modeDef,
    spawn(p, spot) { const L = p.team === 1 ? -45 : 45; p.alive = true; p.hp = 100; p.pos.x = spot ? spot.x : L; p.pos.y = 0; p.pos.z = spot ? spot.z : 0; p.onGround = true; bus.emit('spawn', { p }); if (modeDef.onSpawn) modeDef.onSpawn(game, p); return p; },
    resetRound() {}, damage(v, info) { return applyDamage(this, v, info); }, onKill(ev) { this.match.onKill(ev); } };
  let k = 0;
  for (let i = 0; i < n1 + n2; i++) {
    const p = createPlayer({ id: 'p' + i, name: 'P' + i, team: i < n1 ? 1 : 2 });
    p.inv.secondary = makeWeapon('vogt9'); p.inv.melee = makeWeapon('knife'); p.cur = 'secondary'; p.ms = {};
    players.set(p.id, p); k++;
  }
  game.match = new Match(game, modeDef, {});
  return game;
}
const run = (g, s) => { for (let t = 0; t < s; t += 1 / 64) { g.time += 1 / 64; g.tick++; g.match.tick(1 / 64); } };

function nodeChecks() {
  console.log('Node: economy, objectives, flow');
  const demo = { id: 'demolition', teams: 2, respawn: false, rounds: 6, winRounds: 4, roundTime: 60, freezeTime: 5, buyTime: 10, economy: true, roundEndTime: 2, halftimeTime: 2,
    objectives: ['bomb'], overtime: { rounds: 2, money: 10000 }, setup(g) { g.objectives.useBomb({ sites: ['A', 'B'] }); },
    checkWin(g) { const m = g.match, b = g.objectives.s.bomb, a1 = m.alive(1), a2 = m.alive(2); if (b.state === 'planted') return a2 === 0 ? { winner: 1, reason: 'elimination' } : null; if (!a1) return { winner: 2, reason: 'elimination' }; if (!a2) return { winner: 1, reason: 'elimination' }; return null; } };
  const g = stubGame(demo), m = g.match, E = g.economy, O = g.objectives, P = [...g.players.values()];
  m.start();
  check(P.every(p => p.money === ECON.start), 'economy: everyone starts with $' + ECON.start);
  check(m.phase === 'freeze' && O.s.bomb.state === 'carried' && P.filter(p => p.inv.bomb).length === 1 && O.bombHolder().team === 1, 'the charge goes to one attacker at round start');
  const a = P[0], d = P[3];
  check(E.canBuy(a).ok, 'buy: allowed in the own buy zone during freeze');
  a.pos.x = 0; check(!E.canBuy(a).ok && E.canBuy(a).reason === 'NOT IN A BUY ZONE', 'buy: refused outside the buy zone'); a.pos.x = -45;
  check(E.buy(a, 'kevlar').ok && a.armor === 100 && a.money === 150, 'buy: kevlar $650 -> 100 armour');
  check(!E.buy(a, 'warden').ok, 'buy: refused without the money');
  a.money = 2000;
  check(E.priceOf(a, 'kevhelm') === 350 && E.buy(a, 'kevhelm').ok && a.helmet && a.money === 1650, 'buy: helmet only costs $350 with a full vest');
  check(E.buy(a, 'flash').ok && E.buy(a, 'flash').ok && !E.buy(a, 'flash').ok, 'buy: grenade carry rules (2 flashes max)');
  check(E.buy(a, 'frag').ok && !E.buy(a, 'he').ok, 'buy: one lethal grenade');
  check(!E.buy(a, 'kit').ok && E.buy(d, 'kit').ok && d.inv.kit, 'buy: defuse kit for defenders only');
  const m0 = a.money; check(E.refund(a, 'frag').ok && a.money === m0 + 300 && !a.inv.nades.some(n => n.gid === 'frag'), 'buy: refund this round');
  a.money = 16000; E.give(a, 5000, 'test'); check(a.money === ECON.max, 'money capped at $' + ECON.max);
  a.money = 3000; check(E.buy(a, 'spatz').ok && a.inv.primary && a.inv.primary.gunId === 'spatz' && a.cur === 'primary', 'buy: SMG equips into the primary slot');
  // kill rewards
  const before = a.money; E.onKill({ killer: a, victim: d, weapon: 'spatz' }); check(a.money === before + 600, 'kill reward: SMG $600');
  const b2 = a.money; E.onKill({ killer: a, victim: d, weapon: 'knife' }); check(a.money === b2 + 1500, 'kill reward: knife $1500');
  const b3 = a.money; E.onKill({ killer: a, victim: P[1], weapon: 'spatz' }); check(a.money === b3, 'kill reward: nothing for a team-mate');
  // live: plant needs the site rect
  run(g, 5.05);
  check(m.phase === 'live', 'freeze -> live');
  run(g, 25);
  check(E.buyLeft() === 0 && !E.canBuy(P[1]).ok, 'buy time ends ' + ECON.buyTime + ' s after the freeze');
  const c = O.bombHolder();
  c.ibtn = BTN.USE; run(g, 1); check(O.s.bomb.state === 'carried' && O.s.bomb.plantT === 0, 'plant: nothing outside a site');
  c.pos.x = 15; c.pos.z = -5; run(g, 2); check(O.s.bomb.plantT > 1.5 && c.busy === 'plant', 'plant: progress inside site A (locked in place)');
  c.ibtn = 0; run(g, 0.1); check(O.s.bomb.plantT === 0 && !c.busy, 'plant: releasing USE resets it');
  c.ibtn = BTN.USE; run(g, 3.3); c.ibtn = 0;
  check(O.s.bomb.state === 'planted' && O.s.bomb.site === 'A' && m.t === Infinity && !c.inv.bomb, 'planted on A after 3.2 s; the round clock stops');
  // the defuse: kit 5 s, released -> reset
  const df = P[4]; df.pos.x = 15.5; df.pos.z = -5; df.ibtn = BTN.USE; run(g, 2); df.ibtn = 0; run(g, 0.1);
  check(O.s.bomb.defuseT === 0 && O.s.bomb.state === 'planted', 'defuse: releasing USE resets it');
  // the blast: an attacker and a defender next to the charge, no defuse -> attacker unharmed (friendly fire OFF), defender dead
  const att2 = P[1]; att2.pos.x = 15.6; att2.pos.z = -4.6; df.pos.x = 16; df.pos.z = -5.5;
  const money1 = P.filter(p => p.team === 1).map(p => p.money);
  run(g, 40);
  check(O.s.bomb.state === 'exploded' && m.roundWinner === 1 && m.reason === 'bomb', 'the charge detonates after 40 s: attackers win (' + m.reason + ')');
  check(att2.alive && att2.hp === 100, 'blast: the planting side takes no damage (friendly fire OFF)');
  check(!df.alive, 'blast: a defender at 1 m dies');
  const won = P.filter(p => p.team === 1).map((p, i) => p.money - money1[i]);
  check(won.every(x => x === ECON.win.bomb || p => p.money === ECON.max), 'round win bonus $' + ECON.win.bomb + ' (' + won.join(',') + ')');
  check(P.filter(p => p.team === 2).every(p => p.money >= ECON.loss[0]), 'losers get the loss bonus');
  check(m.mvp === c.id, 'round MVP = the planter');
  // round 2: survivors keep their kit; the dead start with the side pistol
  run(g, 2.1);
  check(m.round === 2 && a.inv.primary && a.inv.primary.gunId === 'spatz' && a.armor === 100, 'a survivor keeps the bought SMG and the armour');
  check(!df.inv.primary && df.inv.secondary.gunId === 'shizuka' && df.armor === 0, 'the dead defender restarts with the defence pistol');
  // defuse with a kit: 5 s
  run(g, 5.05);
  const c2 = O.bombHolder(); c2.pos.x = -15; c2.pos.z = 5; c2.ibtn = BTN.USE; run(g, 3.4); c2.ibtn = 0;
  check(O.s.bomb.state === 'planted' && O.s.bomb.site === 'B', 'planted on B');
  const k2 = P[5]; k2.inv.kit = true; k2.pos.x = -15.4; k2.pos.z = 5; k2.ibtn = BTN.USE; run(g, 4.5);
  check(O.s.bomb.state === 'planted', 'kit defuse not done at 4.5 s'); run(g, 0.6); k2.ibtn = 0;
  check(O.s.bomb.state === 'defused' && m.roundWinner === 2 && m.reason === 'defuse' && m.mvp === k2.id, 'kit defuse in 5 s: defenders win, MVP = defuser');
  check(m.history.length === 2, 'round history recorded');
  // loss ladder: attackers lost once -> 1400 next time
  check(E.lossStreak[1] === 1 && E.lossStreak[2] === 0, 'loss streaks (' + JSON.stringify(E.lossStreak) + ')');
  // halftime after 3 rounds: eliminate team 2
  run(g, 2.1); run(g, 5.05);
  for (const p of P) if (p.team === 2) p.alive = false;
  run(g, 0.1); check(m.roundWinner === 1 && m.reason === 'elimination', 'elimination round');
  const t0 = a.team; run(g, 2.1);
  check(m.phase === 'halftime', 'halftime after half the rounds'); run(g, 2.1);
  check(a.team === 3 - t0 && P.every(p => p.money === ECON.start) && !a.inv.primary, 'halftime: sides swap, money resets, inventories reset');
  // snapshot / apply round trip
  const snap = JSON.parse(JSON.stringify(m.snapshot()));
  const g2 = stubGame(demo); g2.match.start(); g2.match.apply(snap);
  check(JSON.stringify(g2.match.snapshot().obj) === JSON.stringify(snap.obj) && g2.match.round === m.round && g2.match.score[1] === m.score[1], 'snapshot / apply round trip (match + objectives)');

  // ---- zones: 8 s alone, x1.5 with two, neutralise in half the capTime, contested freezes
  const dom = { id: 'domination', teams: 2, respawn: true, rounds: 0, timeLimit: 600, scoreLimit: 0, freezeTime: 0, teamScoreOnKill: false,
    setup(g) { g.objectives.useZones([{ id: 'A', point: 'dom1' }], { capTime: 8 }); } };
  const gz = stubGame(dom), Pz = [...gz.players.values()], Z = () => gz.objectives.s.zones[0];
  gz.match.start();
  Pz[0].pos.x = 0; Pz[0].pos.z = 0; run(gz, 7.8); check(Z().owner === 0, 'zone: not captured at 7.8 s alone'); run(gz, 0.3); check(Z().owner === 1, 'zone: captured at 8 s alone');
  Pz[0].pos.x = 50; Pz[3].pos.x = 0; Pz[3].pos.z = 0; Pz[4].pos.x = 0.5; Pz[4].pos.z = 0;
  run(gz, 2.6); check(Z().owner === 0, 'zone: two enemies neutralise in ~2.7 s'); run(gz, 5.3); check(Z().owner === 2, 'zone: ... and capture in 8 / 1.5 s more');
  Pz[1].pos.x = 0; Pz[1].pos.z = 0.5; const cz = Z().c; run(gz, 3); check(Z().contested && Z().c === cz && Z().owner === 2, 'zone: contested freezes the capture');

  // ---- flags
  const ctf = { id: 'ctf', teams: 2, respawn: true, rounds: 0, timeLimit: 600, scoreLimit: 3, freezeTime: 0, teamScoreOnKill: false, setup(g) { g.objectives.useFlags(); } };
  const gf = stubGame(ctf), Pf = [...gf.players.values()], F = gf.objectives.s.flags;
  gf.match.start();
  const runner = Pf[0]; runner.pos.x = 30; runner.pos.z = 0; run(gf, 0.1);
  check(F[2].state === 'carried' && runner.flag === 2, 'flag: walking over the enemy flag takes it');
  runner.pos.x = -30; run(gf, 0.1); check(gf.match.score[1] === 1 && F[2].state === 'home' && !runner.flag, 'flag: touching your own flag at home captures');
  runner.pos.x = 30; run(gf, 0.1); gf.damage(runner, { attacker: Pf[3], dmg: 200, kind: 'bullet' }); runner.pos.x = 0;
  check(F[2].state === 'dropped', 'flag: dropped when the carrier dies');
  Pf[3].pos.x = F[2].x; Pf[3].pos.z = F[2].z; run(gf, 0.1); check(F[2].state === 'home', 'flag: the owners return a dropped flag by touch');

  // ---- dog tags
  const kc = { id: 'killconfirmed', teams: 2, respawn: true, rounds: 0, timeLimit: 600, scoreLimit: 65, freezeTime: 0, teamScoreOnKill: false, setup(g) { g.objectives.useTags(); } };
  const gt = stubGame(kc), Pt = [...gt.players.values()];
  gt.match.start(); Pt[3].pos.x = 5; Pt[3].pos.z = 5; Pt[0].pos.x = 0;
  gt.damage(Pt[3], { attacker: Pt[0], dmg: 200, kind: 'bullet' });
  check(gt.objectives.s.tags.length === 1 && gt.match.score[1] === 0, 'tags: a kill drops tags, no point yet');
  Pt[0].pos.x = 5; Pt[0].pos.z = 5; run(gt, 0.1); check(gt.match.score[1] === 1 && gt.objectives.s.tags.length === 0, 'tags: confirm = +1 team point');
  Pt[4].pos.x = 0; Pt[4].pos.z = 0; gt.damage(Pt[4], { attacker: Pt[1], dmg: 200, kind: 'bullet' }); Pt[5].pos.x = 0; Pt[5].pos.z = 0; run(gt, 0.1);
  check(gt.match.score[1] === 1 && gt.objectives.s.tags.length === 0 && Pt[5].ms.denies === 1, 'tags: a team-mate of the victim denies it');

  // ---- hostages
  const hr = { id: 'hostage', teams: 2, respawn: false, rounds: 4, roundTime: 120, freezeTime: 0, economy: true, setup(g) { g.objectives.useHostages({ goal: 2 }); } };
  const gh = stubGame(hr), Ph = [...gh.players.values()], H = () => gh.objectives.s.hostages;
  gh.match.start(); run(gh, 0.05);
  const r1 = Ph[0]; r1.pos.x = 0; r1.pos.z = 19.2; r1.ibtn = BTN.USE; run(gh, 1.0); check(H()[0].pickBy === r1.id && r1.busy === 'pickup', 'hostage: hold USE to pick up');
  run(gh, 0.7); r1.ibtn = 0; check(H()[0].state === 'carried' && r1.carry === 'h0' && r1.speedMul < 1, 'hostage: carried after 1.6 s, carrier slowed');
  const m1 = r1.money; r1.pos.x = -35; r1.pos.z = -35; run(gh, 0.1);
  check(H()[0].state === 'rescued' && gh.objectives.s.rescued === 1 && r1.money === m1 + 1000, 'hostage: rescued in the zone (+$1000)');
  r1.pos.x = 2; r1.pos.z = 19.2; r1.ibtn = BTN.USE; run(gh, 1.8); r1.ibtn = 0; r1.pos.x = -35; r1.pos.z = -35; run(gh, 0.1);
  check(gh.match.roundWinner === 1 && gh.match.reason === 'hostage', 'hostage: two rescues win the round');
  // ---- overtime (stub elimination mode)
  const el = { id: 'el', teams: 2, respawn: false, rounds: 4, roundTime: 30, freezeTime: 0, roundEndTime: 1, halftimeTime: 1, overtime: { rounds: 2 } };
  const ge = stubGame(el), Pe = [...ge.players.values()], me = ge.match;
  me.start(); const wipe = t => { for (const p of Pe) if (p.team === t) p.alive = false; };
  const seq = [2, 1, 1, 2]; const ev = [];
  ge.bus.on('overtime', e => ev.push('ot' + e.n)); ge.bus.on('match:point', e => ev.push('mp' + e.team));
  for (const t of seq) { wipe(t); run(ge, 0.05); run(ge, 1.1); if (me.phase === 'halftime') run(ge, 1.1); }
  check(me.ot === 1 && ev.includes('ot1') && me.phase !== 'over', 'overtime starts on a tie at full time (' + me.score[1] + '-' + me.score[2] + ')');
  check(ev.some(e => e.startsWith('mp')), 'match point announced');
}

// ===================================================================================================== 2. browser
const PAGE_LIB = () => {
  const USE = 64, FIRE = 1;
  const T = window.MT = {
    g: () => LF.game,
    tp(q, x, z, yaw, y) {
      const g = LF.game; const gr = y != null ? { y } : g.world.groundAt(x, z, 30, 0.3);
      q.pos.x = x; q.pos.y = gr ? gr.y : 0; q.pos.z = z; if (yaw != null) q.yaw = yaw;
      q.vel.x = q.vel.y = q.vel.z = 0; Object.assign(q.prev, { x, y: q.pos.y, z, yaw: q.yaw }); q.mantle = null; q.onGround = true;
      if (q.local && yaw != null) g.setView(yaw, 0);
    },
    /** a bot holds still (and USE when `use`) */
    hold(q, use) {
      if (q.local) { LF.game.setLocalCommand({ buttons: use ? USE : 0 }); return; }
      const b = LF.game.bots.brain(q);
      b.think = (dt, cmd) => { cmd.mx = 0; cmd.mz = 0; cmd.buttons = use ? USE : 0; cmd.slot = null; cmd.yaw = q.yaw; cmd.pitch = q.pitch; };
    },
    free(q) { if (q.local) LF.game.setLocalCommand({ buttons: 0 }); else delete LF.game.bots.brain(q).think; },
    team(t) { return [...LF.game.players.values()].filter(p => p.team === t); },
    other(t, notLocal = true) { return [...LF.game.players.values()].filter(p => p.team === t && p.alive && (!notLocal || !p.local)); },
    kill(v, by, weapon = 'warden', kind = 'bullet') { v.spawnProtect = 0; return LF.game.damage(v, { attacker: by, dmg: 2000, kind, weapon, group: 'chest', armorPen: 1 }); },
    step(s, chunk = 0.5) { const g = LF.game; for (let t = 0; t < s && !g.ended; t += chunk) { g.debugStep(Math.min(chunk, s - t)); T.watch(); } },
    watch() {
      const g = LF.game;
      for (const p of g.players.values()) if (!Number.isFinite(p.pos.x) || !Number.isFinite(p.pos.y) || !Number.isFinite(p.pos.z)) T.nan++;
    },
    nan: 0, ff: 0, ffList: [],
    init() {
      T.nan = 0; T.ff = 0; T.ffList = []; T.checks = [];
      const g = LF.game;
      g.bus.on('damage', e => { if (e.from && e.victim && e.from !== e.victim && e.from.team > 0 && e.from.team === e.victim.team && e.dmg > 0) { T.ff++; T.ffList.push(e.from.name + '>' + e.victim.name + ':' + e.kind); } });
      LF.loop.setScene(null);                        // simulate without rendering (SwiftShader frames are slow)
      g.setLocalCommand({ buttons: 0 });
    },
    ok(c, m) { T.checks.push([!!c, m]); return !!c; },
    /** explicit friendly-fire test: real bullets at a team-mate + blast / fire / gas / melee / flash / stun through game.damage */
    ffTest() {
      const g = LF.game, me = g.local;
      if (!me || !(me.team > 0)) return T.ok(true, 'friendly fire: n/a (free for all)');
      const mate = [...g.players.values()].find(q => q !== me && q.team === me.team && q.alive);
      if (!mate || !me.alive) return T.ok(true, 'friendly fire: n/a (no live team-mate)');
      mate.spawnProtect = 0; me.spawnProtect = 0;
      const hp0 = mate.hp, ar0 = mate.armor;
      const yaw = me.yaw, x = me.pos.x + Math.sin(yaw) * 4, z = me.pos.z + Math.cos(yaw) * 4;
      const sx = mate.pos.x, sy = mate.pos.y, sz = mate.pos.z;
      T.tp(mate, x, z, yaw + Math.PI, me.pos.y); T.hold(mate, false);
      let shots = 0;
      if (me.inv.primary || me.inv.secondary) {
        g.aimAt(mate, 'chest'); const s0 = me.stat.shots;
        if (!me.inv.primary && me.inv.secondary && me.cur !== 'secondary') { g.setLocalCommand({ slot: 'secondary', buttons: 0 }); g.debugStep(1); }
        g.setLocalCommand({ buttons: FIRE }); g.debugStep(0.4); g.setLocalCommand({ buttons: 0 }); g.debugStep(0.05);
        shots = me.stat.shots - s0;
      }
      let dmg = 0;
      for (const kind of ['bullet', 'melee', 'blast', 'fire', 'gas']) dmg += g.damage(mate, { attacker: me, dmg: 80, kind, weapon: 'frag', group: 'chest', effects: { flash: 4, stun: 2, slow: { mul: 0.4, secs: 2 } } });
      const ok = mate.alive && mate.hp === hp0 && mate.armor === ar0 && !(mate.flash > 0) && !(mate.stun > 0) && dmg === 0;
      T.free(mate); T.tp(mate, sx, sz, null, sy);
      return T.ok(ok, 'friendly fire OFF: ' + shots + ' bullets + blast / fire / gas / melee / flash / stun on a team-mate -> ' + (hp0 - mate.hp) + ' hp lost');
    },
    async frames(n = 2) { const f0 = LF.loop.loopStats.frames; const t0 = performance.now(); while (LF.loop.loopStats.frames < f0 + n && performance.now() - t0 < 120000) await new Promise(r => setTimeout(r, 50)); },
    async show() { LF.loop.setScene(LF.game.scene); LF.game.effects && (LF.game.effects.hold = false); await T.frames(3); },
    hide() { LF.loop.setScene(null); },
    face(x, y, z) { const g = LF.game; g.aimAt({ x, y, z }); },
  };
};

/** Per-mode scripts (run in the page). Each returns nothing; checks go through MT.ok. `pose` (optional) sets up the screenshot. */
const SCRIPTS = {
  async tdm() {
    const g = MT.g(), m = g.match; MT.step(2);
    MT.ok(m.phase === 'live', 'live after the freeze');
    let k = { 1: 0, 2: 0 }; g.bus.on('kill', e => { if (e.killer && e.killer.team !== e.victim.team) k[e.killer.team]++; });
    MT.step(40);
    MT.ok(k[1] + k[2] > 0, 'kills happen (' + (k[1] + k[2]) + ')');
    MT.ok(m.score[1] === k[1] && m.score[2] === k[2], 'team score = team kills (' + JSON.stringify(m.score) + ')');
    MT.ffTest();
  },
  async ffa() {
    const g = MT.g(); MT.step(2);
    MT.ok([...g.players.values()].every(p => p.team === 0), 'everyone on team 0');
    MT.step(35); MT.ok([...g.players.values()].some(p => p.kills > 0), 'kills happen');
  },
  async practice() {
    const g = MT.g(), me = g.local, E = g.economy; MT.step(2);
    MT.tp(me, 0, -18, 0); MT.step(0.2);
    const m0 = me.money, r = E.buy(me, 'arbiter');
    MT.ok(E.free && r.ok && me.inv.primary.gunId === 'arbiter' && me.money === m0, 'free armory: any gun, free, anywhere (' + (r.reason || 'ok') + ')');
    MT.ok(E.buy(me, 'kevhelm').ok && me.armor === 100 && me.helmet, 'free armory: armour');
    MT.step(15); MT.ffTest();
  },
  async demolition() {
    const g = MT.g(), m = g.match, O = g.objectives, E = g.economy, me = g.local;
    MT.ok(m.phase === 'freeze' && g.map.gateList.every(x => !x.open), 'freeze behind closed gates');
    MT.ok(me.money === 800 && !me.inv.primary && me.inv.secondary && me.inv.secondary.gunId === 'vogt9', 'pistol round: $800, the attack pistol');
    MT.ok(E.canBuy(me).ok && E.buy(me, 'kevlar').ok && me.armor === 100, 'buy kevlar in the lobby');
    MT.ok(!E.buy(me, 'warden').ok, 'cannot afford a rifle');
    MT.step(2.2);
    MT.ok(m.phase === 'live' && g.map.gateList.every(x => x.open), 'live: gates open');
    // plant on A, an attacker and a defender next to the charge
    const c = O.bombHolder();
    MT.ok(!!c && c.team === 1, 'an attacker carries the charge');
    MT.tp(c, 16, -20, 0, 1.2); MT.hold(c, true); MT.step(1.5);
    MT.ok(O.s.bomb.plantT > 0.5 && c.busy === 'plant', 'planting');
    MT.step(2.2);
    MT.ok(O.s.bomb.state === 'planted' && O.s.bomb.site === 'A', 'planted on A');
    MT.free(c);
    const a2 = MT.other(1).find(p => p !== c) || c, d2 = MT.other(2)[0];
    MT.tp(a2, 17, -21, 0, 1.2); MT.hold(a2); a2.spawnProtect = 0; const hpA = a2.hp;
    if (d2) { MT.tp(d2, 17.5, -19.5, 0, 1.2); MT.hold(d2); d2.spawnProtect = 0; }
    MT.step(39);
    MT.ok(O.s.bomb.state === 'exploded' && m.roundWinner === 1 && m.reason === 'bomb', 'the charge detonated: attackers win (' + m.reason + ')');
    MT.ok(a2.alive && a2.hp === hpA, 'blast spares the planting side (friendly fire OFF)');
    MT.ok(!d2 || !d2.alive, 'blast kills a defender at the site');
    MT.ok(m.mvp === c.id, 'MVP: the planter');
    MT.free(a2); if (d2) MT.free(d2);
    // round 2: plant B, defuse with a kit
    MT.step(1.6); MT.step(2.2);
    MT.ok(m.round === 2 && m.phase === 'live', 'round 2 live');
    MT.ok(me.armor === 100 || !me.alive, 'a survivor keeps the armour');
    const c2 = O.bombHolder(); MT.tp(c2, -17, 14, 0, 0); MT.hold(c2, true); MT.step(3.6); MT.free(c2);
    MT.ok(O.s.bomb.state === 'planted' && O.s.bomb.site === 'B', 'planted on B');
    const df = MT.other(2)[0]; df.inv.kit = true; MT.tp(df, O.s.bomb.x + 0.6, O.s.bomb.z, 0, O.s.bomb.y); MT.hold(df, true);
    const m0 = df.money; MT.step(5.4); MT.free(df);
    MT.ok(O.s.bomb.state === 'defused' && m.roundWinner === 2 && m.reason === 'defuse', 'defused with a kit in 5 s: defenders win');
    MT.ok(df.money >= m0 + 300 + 3500 || df.money === 16000, 'defuse bonus + round win bonus');
    // halftime after 2 of 4 rounds: sides swap, money resets
    const t0 = me.team; MT.step(1.6);
    MT.ok(m.phase === 'halftime', 'halftime'); MT.step(1.2);
    MT.ok(me.team === 3 - t0 && me.money === 800, 'halftime: sides swapped, money reset to $800');
    MT.step(2.2);
    for (const p of MT.team(2)) MT.kill(p, MT.other(1, false)[0]);
    MT.step(0.1); MT.ok(m.roundWinner === 1 && m.reason === 'elimination', 'elimination round');
    MT.step(1.6); MT.step(2.2);
    MT.ok(m.round >= 4, 'rounds advance (' + m.round + ')');
    MT.ffTest();
  },
  async demolition_pose() {
    const g = MT.g(), O = g.objectives, me = g.local;
    const c = O.bombHolder();
    if (c && c !== me && O.s.bomb.state === 'carried') { MT.tp(c, 16, -20, 0, 1.2); MT.hold(c, true); MT.step(3.5); MT.free(c); }
    if (me.alive) { MT.tp(me, 12, -10, Math.PI * 0.85); if (O.s.bomb.state === 'planted') MT.face(O.s.bomb.x, O.s.bomb.y + 0.3, O.s.bomb.z); }
  },
  async wingman() {
    const g = MT.g(), m = g.match, O = g.objectives;
    MT.ok(O.cfg.bomb.sites.length === 1 && O.cfg.bomb.sites[0] === 'B', 'wingman: one site (B)');
    MT.ok(g.players.size === 4, '2 versus 2');
    MT.step(2.2);
    const c = O.bombHolder(); MT.tp(c, 16, -20, 0, 1.2); MT.hold(c, true); MT.step(4);
    MT.ok(O.s.bomb.state === 'carried', 'no planting on A');
    MT.tp(c, -17, 14, 0, 0); MT.step(3.6); MT.free(c);
    MT.ok(O.s.bomb.state === 'planted' && O.s.bomb.site === 'B', 'planted on B');
    MT.step(41); MT.ok(m.roundWinner === 1 && m.reason === 'bomb', 'detonation wins the round');
    MT.step(1.6); MT.step(2.2); MT.ok(m.round === 2, 'round 2');
    MT.ffTest();
  },
  async retake() {
    const g = MT.g(), m = g.match, O = g.objectives, b = O.s.bomb, S = g.map.sites[b.site];
    MT.ok(b.state === 'planted' && !!S, 'the charge is planted at round start (site ' + b.site + ')');
    const dA = MT.team(1).map(p => Math.hypot(p.pos.x - S.x, p.pos.z - S.z)), dD = MT.team(2).map(p => Math.hypot(p.pos.x - S.x, p.pos.z - S.z));
    MT.ok(Math.max(...dA) < 15 && Math.min(...dD) > 15, 'attackers spawn on the site, defenders away (' + dA.map(Math.round) + ' / ' + dD.map(Math.round) + ')');
    MT.ok(MT.team(1).every(p => p.inv.primary && p.armor === 100), 'fixed kits: rifle + armour');
    MT.step(1.2);
    const df = MT.other(2)[0]; df.inv.kit = true; MT.tp(df, b.x + 0.7, b.z, 0, b.y); MT.hold(df, true); MT.step(5.4); MT.free(df);
    MT.ok(b.state === 'defused' || O.s.bomb.state === 'defused', 'retake: defused');
    MT.ok(m.roundWinner === 2 && m.reason === 'defuse', 'defenders win the retake');
    MT.step(1.6); MT.step(1.2);
    MT.ok(m.round === 2 && O.s.bomb.state === 'planted', 'round 2: planted again');
    for (const p of MT.team(2)) MT.kill(p, MT.other(1)[0] || MT.team(1)[0]);
    MT.step(0.2); MT.ok(m.roundWinner === 1, 'all defenders down: attackers win');
    MT.step(1.6); MT.step(1.2); MT.ffTest();
  },
  async snd() {
    const g = MT.g(), m = g.match, O = g.objectives, E = g.economy, me = g.local;
    MT.ok(!E.on && !E.canBuy(me).ok, 'no economy, no buying');
    MT.ok(!!me.inv.primary, 'own loadout every round');
    MT.step(2.2);
    const c = O.bombHolder(); MT.tp(c, 16, -20, 0, 1.2); MT.hold(c, true); MT.step(3.6);
    MT.ok(O.s.bomb.state === 'carried', 'not planted at 3.5 s (4 s plant)'); MT.step(0.7); MT.free(c);
    MT.ok(O.s.bomb.state === 'planted', 'planted at 4 s');
    const df = MT.other(2)[0]; df.inv.kit = true; MT.tp(df, O.s.bomb.x + 0.6, O.s.bomb.z, 0, O.s.bomb.y); MT.hold(df, true);
    MT.step(7); MT.ok(O.s.bomb.state === 'planted', 'not defused at 7 s (7.5 s, kits do not help)'); MT.step(0.8); MT.free(df);
    MT.ok(O.s.bomb.state === 'defused' && m.roundWinner === 2, 'defused at 7.5 s');
    MT.step(1.6); MT.step(2.2); MT.ok(m.round === 2, 'round 2'); MT.ffTest();
  },
  async hostage() {
    const g = MT.g(), m = g.match, O = g.objectives, H = O.s.hostages;
    MT.ok(H.length >= 4 && H.every(h => h.state === 'idle'), 'hostages placed (' + H.length + ')');
    MT.step(2.2);
    const r = MT.other(1)[0], h0 = H[0];
    MT.tp(r, h0.x + 0.9, h0.z, 0, h0.y); MT.hold(r, true); MT.step(1.9); MT.free(r);
    MT.ok(h0.state === 'carried' && r.carry === h0.id && r.speedMul < 1, 'hostage picked up (hold USE 1.6 s), carrier slowed');
    const z = g.map.rescues[0]; const m0 = r.money;
    MT.tp(r, z.x, z.z, 0); MT.step(0.3);
    MT.ok(h0.state === 'rescued' && O.s.rescued === 1 && r.money >= m0 + 1000, 'rescued in the zone (+$1000)');
    // a shot at a hostage costs money
    const me = g.local; me.money = 5000; g.giveWeapon(me, 'warden'); MT.step(1);
    const h1 = H.find(h => h.state === 'idle' && h.y < 1);
    MT.tp(me, h1.x, h1.z + 3, Math.PI, h1.y); MT.face(h1.x, h1.y + 0.6, h1.z); MT.step(0.3);
    g.setLocalCommand({ buttons: 1 }); g.debugStep(2 / 64); g.setLocalCommand({ buttons: 0 }); MT.step(0.2);
    MT.ok(h1.hp < 100 && me.money < 5000, 'shooting a hostage hurts it and costs money (hp ' + h1.hp + ', $' + me.money + ')');
    const h2 = H.find(h => h.state === 'idle' && h !== h1) || h1;
    MT.tp(r, h2.x + 0.9, h2.z, 0, h2.y); MT.hold(r, true); MT.step(1.9); MT.free(r); MT.tp(r, z.x, z.z, 0); MT.step(0.3);
    MT.ok(m.roundWinner === 1 && m.reason === 'hostage', 'two rescues win the round');
    MT.step(1.6); MT.step(2.2); MT.ok(m.round === 2 && O.s.hostages.every(h => h.state === 'idle' && h.hp === 100), 'round 2: hostages reset');
    MT.ffTest();
  },
  async elimination() {
    const g = MT.g(), m = g.match; MT.step(2.2);
    for (const p of MT.team(2)) MT.kill(p, MT.team(1)[0]);
    MT.step(0.1); MT.ok(m.roundWinner === 1 && m.reason === 'elimination', 'last team standing wins');
    MT.step(1.6); MT.step(2.2); m.t = 0.05; MT.step(0.2);
    MT.ok(m.reason === 'draw' && m.roundWinner === 0, 'time-out with equal numbers: drawn round');
    MT.step(1.6); MT.step(2.2); MT.ok(m.round === 3, 'rounds advance'); MT.ffTest();
  },
  async domination() {
    const g = MT.g(), m = g.match, O = g.objectives, Z = O.s.zones; MT.step(1.2);
    MT.ok(Z.length === 3 && Z.map(z => z.label).join('') === 'ABC', 'three zones A B C');
    const [a, b] = MT.other(1); const A = Z[0];
    MT.tp(a, A.x, A.z, 0); MT.tp(b, A.x + 0.8, A.z, 0); MT.hold(a); MT.hold(b);
    MT.step(5.6); MT.ok(A.owner === 1, 'A captured by two in ~5.3 s');
    const s0 = m.score[1]; MT.step(10); MT.ok(m.score[1] - s0 >= 3, 'held zone ticks points (' + (m.score[1] - s0) + ' in 10 s)');
    const e = MT.other(2)[0]; MT.tp(e, A.x - 0.6, A.z, 0); MT.hold(e); MT.step(2);
    MT.ok(A.contested && A.owner === 1, 'contested');
    MT.free(a); MT.free(b); MT.tp(a, -30, -20, 0); MT.tp(b, -30, -22, 0); MT.hold(a); MT.hold(b); MT.step(13);
    MT.ok(A.owner === 2, 'the enemy neutralises and captures');
    MT.free(a); MT.free(b); MT.free(e); MT.ffTest();
  },
  async hardpoint() {
    const g = MT.g(), m = g.match, O = g.objectives, Z = O.s.zones; MT.step(1.2);
    const act = Z.filter(z => z.active); MT.ok(act.length === 1, 'one hardpoint active (' + Z.length + ' total)');
    const z = act[0], a = MT.other(1)[0]; MT.tp(a, z.x, z.z, 0); MT.hold(a); MT.step(0.3);
    MT.ok(z.owner === 1, 'held instantly when alone'); const s0 = m.score[1]; MT.step(6);
    MT.ok(m.score[1] - s0 >= 5, '1 point per second (' + (m.score[1] - s0) + ')');
    O.s.info.hp.t = 0.2; MT.step(0.5); MT.ok(!z.active && Z.filter(x => x.active).length === 1 && Z.indexOf(Z.find(x => x.active)) === 1, 'the hardpoint moves');
    MT.free(a); MT.ffTest();
  },
  async koth() {
    const g = MT.g(), m = g.match, z = g.objectives.s.zones[0]; MT.step(1.2);
    const a = MT.other(1)[0]; MT.tp(a, z.x, z.z, 0); MT.hold(a); MT.step(4.5); MT.ok(z.owner === 0, 'not yet at 4.5 s');
    MT.step(0.8); MT.ok(z.owner === 1, 'hill taken in 5 s'); const s0 = m.score[1]; MT.step(5); MT.ok(m.score[1] - s0 >= 4, 'scores while held');
    const e = MT.other(2)[0]; MT.tp(e, z.x + 0.5, z.z, 0); MT.hold(e); const s1 = m.score[1]; MT.step(3); MT.ok(m.score[1] === s1 && z.contested, 'contested: the clock stops');
    MT.free(a); MT.free(e); MT.ffTest();
  },
  async headquarters() {
    const g = MT.g(), m = g.match, O = g.objectives, Z = O.s.zones; MT.step(1.2);
    const z = Z.find(x => x.active); const a = MT.other(1)[0], a2 = MT.other(1)[1];
    MT.tp(a, z.x, z.z, 0, z.y); MT.hold(a); MT.step(8.3);
    MT.ok(z.owner === 1, 'HQ captured in 8 s'); const s0 = m.score[1]; MT.step(4); MT.ok(m.score[1] - s0 >= 3, 'HQ scores');
    MT.kill(a2, MT.other(2)[0]); MT.step(6);
    MT.ok(!a2.alive && !!a2.respawnWait, 'no respawn while your HQ stands');
    MT.free(a); MT.tp(a, -30, -24, 0); MT.hold(a);
    const e = MT.other(2)[0]; MT.tp(e, z.x, z.z, 0, z.y); MT.hold(e); MT.step(4.5);
    MT.ok(!z.active && O.s.info.hq.reloc > 0, 'the enemy destroys the HQ');
    MT.step(2.5); MT.ok(a2.alive, 'the defenders respawn');
    MT.step(9); MT.ok(Z.filter(x => x.active).length === 1 && !z.active, 'a new HQ comes online');
    MT.free(a); MT.free(e); MT.ffTest();
  },
  async ctf() {
    const g = MT.g(), m = g.match, F = g.objectives.s.flags; MT.step(1.2);
    const a = MT.other(1)[0]; MT.tp(a, F[2].hx, F[2].hz, 0); MT.hold(a); MT.step(0.2);
    MT.ok(F[2].state === 'carried' && a.flag === 2, 'flag taken');
    MT.tp(a, F[1].hx + 0.5, F[1].hz, 0); MT.step(0.2);
    MT.ok(m.score[1] === 1 && F[2].state === 'home', 'flag captured at home');
    MT.tp(a, F[2].hx, F[2].hz, 0); MT.step(0.2); MT.tp(a, 0, -20, 0); MT.kill(a, MT.other(2)[0]); MT.step(0.2);
    MT.ok(F[2].state === 'dropped', 'dropped on death');
    const d = MT.other(2)[0]; MT.tp(d, F[2].x, F[2].z, 0); MT.hold(d); MT.step(0.2); MT.ok(F[2].state === 'home', 'returned by its owner');
    MT.free(a); MT.free(d); MT.ffTest();
  },
  async killconfirmed() {
    const g = MT.g(), m = g.match, me = g.local; MT.step(1.2);
    const v = MT.other(2)[0]; MT.tp(v, 0, -20, 0); MT.tp(me, -5, -20, 0); MT.hold(v);
    MT.kill(v, me); MT.step(0.1);
    MT.ok(g.objectives.s.tags.length === 1 && m.score[1] === 0, 'a kill drops tags and scores nothing yet');
    const t = g.objectives.s.tags[0]; MT.tp(me, t.x, t.z, 0); MT.step(0.2);
    MT.ok(m.score[1] === 1, 'confirmed: +1');
    MT.free(v); MT.ffTest();
  },
  async gungame() {
    const g = MT.g(), me = g.local, L = g.objectives.s.ladder; MT.step(1.2);
    MT.ok(me.inv.primary && me.inv.primary.gunId === L[0] && !me.inv.secondary, 'level 1: ' + L[0]);
    const v = [...g.players.values()].find(p => !p.local && p.alive); MT.kill(v, me, L[0]); MT.step(0.1);
    MT.ok(me.ms.gg === 1 && (me.inv.primary || me.inv.secondary).gunId === L[1], 'a kill moves you up: ' + L[1]);
    const k = [...g.players.values()].find(p => !p.local && p.alive); MT.kill(me, k, 'knife', 'melee'); MT.step(0.1);
    MT.ok(me.ms.gg === 0, 'a knife kill knocks the victim down a level');
    MT.step(20);
  },
  async gunrush() {
    const g = MT.g(), m = g.match, me = g.local, T = g.objectives.s.team, L = g.objectives.s.ladder; MT.step(1.2);
    const per = Math.max(1, Math.round(m.teamPlayers(1).length / 2));
    for (let i = 0; i < per; i++) { const v = MT.other(2)[0]; if (v) MT.kill(v, me, L[0]); MT.step(0.1); }
    MT.ok(T[1].lvl === 1 && MT.team(1).filter(p => p.alive).every(p => (p.inv.primary || p.inv.secondary || p.inv.melee).gunId === L[1]), 'the whole team moves up after ' + per + ' kills');
    MT.step(15); MT.ffTest();
  },
  async infection() {
    const g = MT.g(), m = g.match; const inf = MT.team(1);
    MT.ok(inf.length === 1 && inf[0].inv.melee && !inf[0].inv.primary && inf[0].hp === 150, 'one infected with a knife and 150 hp');
    MT.step(1.2); MT.ok(inf[0].hold, 'the infected wait in their lobby'); MT.step(8.2); MT.ok(!inf[0].hold, 'released after 8 s');
    const z = inf[0];
    for (let i = 0; i < 12 && MT.team(2).length; i++) { const s = MT.team(2)[0]; MT.tp(z, s.pos.x + 1, s.pos.z, 0, s.pos.y); MT.kill(s, z, 'knife', 'melee'); MT.step(0.1); }
    MT.ok(m.roundWinner === 1 && m.reason === 'infected', 'everyone infected: infected win');
    MT.step(6.5); MT.step(4.2); MT.ok(m.round === 2 && MT.team(1).length === 1, 'round 2: one new infected');
    MT.ffTest();
  },
  async hideseek() {
    const g = MT.g(), m = g.match, me = g.local; MT.step(3.2);
    const seek = MT.team(1), hide = MT.team(2);
    MT.ok(seek.every(p => p.hold && p.blind > 25), 'seekers held and blindfolded');
    MT.ok(hide.every(p => !p.inv.primary && !p.inv.secondary && p.inv.melee), 'hiders: knives only');
    const gl = g.map.gateList; MT.ok(gl.filter(x => x.team === 2).every(x => x.open) && gl.filter(x => x.team === 1).every(x => !x.open), 'hiders\' gate open, seekers\' gate shut');
    MT.step(30.5); MT.ok(seek.every(p => !p.hold) && gl.every(x => x.open), 'seekers released after 30 s');
    for (const p of MT.team(2)) MT.kill(p, MT.team(1)[0]);
    MT.step(0.1); MT.ok(m.roundWinner === 1 && m.reason === 'found', 'all hiders found: seekers win');
    const t0 = me.team; MT.step(6.5); MT.step(3.2); MT.ok(m.round === 2 && me.team === 3 - t0, 'roles swap every round');
    MT.ffTest();
  },
  async vip() {
    const g = MT.g(), m = g.match, O = g.objectives; const v = g.players.get(O.s.vip.id);
    MT.ok(!!v && v.team === 1 && v.inv.secondary.gunId === 'sovereign' && !v.inv.primary && v.armor === 100 && v.helmet, 'VIP: pistol, armour, helmet');
    MT.step(2.2); const e = O.s.extracts[0]; MT.tp(v, e.x, e.z, 0); MT.hold(v); MT.step(2.8); MT.free(v);
    MT.ok(m.roundWinner === 1 && m.reason === 'vip_escaped', 'VIP extracted: team 1 wins');
    MT.step(6.5); MT.step(2.2); const v2 = g.players.get(O.s.vip.id); MT.ok(v2 && v2.id !== v.id || MT.team(1).length === 1, 'a new VIP each round');
    MT.kill(v2, MT.team(2)[0]); MT.step(0.1); MT.ok(m.roundWinner === 2 && m.reason === 'vip_killed', 'VIP down: team 2 wins');
    MT.step(6.5); MT.step(2.2); MT.ffTest();
  },
  async juggernaut() {
    const g = MT.g(), O = g.objectives, me = g.local; MT.step(8);
    const j = g.players.get(O.s.jugg); MT.ok(!!j && j.hp > 100 && j.maxHp === 400 && j.inv.primary.gunId === 'kuznets', 'a juggernaut with 400 hp and the machine gun');
    if (j === me) { const k = [...g.players.values()].find(p => p !== me && p.alive); MT.kill(me, k); MT.step(0.1); MT.ok(O.s.jugg === k.id, 'the killer takes the suit'); }
    else { MT.kill(j, me); MT.step(0.1); MT.ok(O.s.jugg === me.id && me.maxHp === 400 && me.ms.pts >= 3, 'the killer takes the suit (+3 points)'); }
    MT.step(20);
  },
  async oitc() {
    const g = MT.g(), me = g.local; MT.step(1.2);
    MT.ok([...g.players.values()].every(p => p.inv.secondary && p.inv.secondary.mag === 1 && p.inv.secondary.reserve === 0 && !p.inv.primary), 'one round, no reserve');
    const v = [...g.players.values()].find(p => !p.local && p.alive); v.spawnProtect = 0;
    g.damage(v, { attacker: me, dmg: 5, kind: 'bullet', weapon: 'ridgeback', group: 'leg' }); MT.step(0.1);
    MT.ok(!v.alive && me.inv.secondary.mag === 2, 'any hit kills; the kill adds a round');
    MT.ok(v.ms.lives === 2, 'the victim has 2 lives left');
    for (let i = 0; i < 2; i++) { MT.step(2.5); v.spawnProtect = 0; MT.kill(v, me, 'ridgeback'); MT.step(0.1); }
    MT.step(3); MT.ok(v.ms.lives === 0 && !v.alive, 'out of lives: stays out');
    MT.step(10);
  },
  async sharpshooter() {
    const g = MT.g(), sh = g.objectives.s.sharp; MT.step(1.2);
    const gun0 = sh.gun; MT.ok([...g.players.values()].every(p => [p.inv.primary, p.inv.secondary].some(w => w && w.gunId === gun0)), 'everyone holds ' + gun0);
    sh.t = 0.1; MT.step(0.3); MT.ok(sh.gun !== gun0 && [...g.players.values()].filter(p => p.alive).every(p => [p.inv.primary, p.inv.secondary].some(w => w && w.gunId === sh.gun)), 'rotation to ' + sh.gun);
    MT.step(25);
  },
  async snipers() {
    const g = MT.g(); MT.step(1.2);
    MT.ok([...g.players.values()].every(p => p.inv.primary && ['rook', 'arbiter', 'bjorn'].includes(p.inv.primary.gunId) && !p.inv.secondary && !p.inv.nades.length), 'bolt-action rifles only');
    MT.step(20); MT.ffTest();
  },
  async blades() {
    const g = MT.g(); MT.step(1.2);
    MT.ok([...g.players.values()].every(p => !p.inv.primary && !p.inv.secondary && p.inv.melee && p.cur === 'melee'), 'melee only');
    MT.step(20); MT.ffTest();
  },
  async hardcore() {
    const g = MT.g(); MT.step(1.2);
    MT.ok([...g.players.values()].every(p => p.hp === 30 && p.armor === 0), '30 health, no armour');
    MT.ok(document.querySelector('.lf-hud.hc') != null, 'hardcore HUD');
    MT.step(20); MT.ffTest();
  },
};

/** match options per mode (short timers so the flow fits in a short simulation) */
const OPTS = {
  demolition: { rounds: 4, freezeTime: 2, buyTime: 10, roundEndTime: 1.5, halftimeTime: 1, botMode: 'passive' },
  wingman: { rounds: 4, freezeTime: 2, roundEndTime: 1.5, halftimeTime: 1, botMode: 'passive' },
  retake: { rounds: 4, freezeTime: 1, roundEndTime: 1.5, halftimeTime: 1, botMode: 'passive' },
  snd: { rounds: 4, freezeTime: 2, roundEndTime: 1.5, halftimeTime: 1, botMode: 'passive' },
  hostage: { rounds: 4, freezeTime: 2, roundEndTime: 1.5, halftimeTime: 1, botMode: 'passive' },
  elimination: { rounds: 4, freezeTime: 2, roundEndTime: 1.5, halftimeTime: 1, botMode: 'passive' },
  infection: { freezeTime: 1, roundEndTime: 6, botMode: 'passive' },
  hideseek: { freezeTime: 3, roundEndTime: 6, botMode: 'passive' },
  vip: { rounds: 4, freezeTime: 2, roundEndTime: 6, halftimeTime: 1, botMode: 'passive' },
  domination: { freezeTime: 1, botMode: 'passive' }, hardpoint: { freezeTime: 1, botMode: 'passive' }, koth: { freezeTime: 1, botMode: 'passive' },
  headquarters: { freezeTime: 1, botMode: 'passive' }, ctf: { freezeTime: 1, botMode: 'passive' }, killconfirmed: { freezeTime: 1, botMode: 'passive' },
  gungame: { freezeTime: 1, botMode: 'passive' }, gunrush: { freezeTime: 1, botMode: 'passive' }, juggernaut: { freezeTime: 1, botMode: 'passive' },
  oitc: { freezeTime: 1, botMode: 'passive' }, sharpshooter: { freezeTime: 1 }, snipers: { freezeTime: 1 }, blades: { freezeTime: 1 }, hardcore: { freezeTime: 1 },
  tdm: { freezeTime: 1, scoreLimit: 500 }, ffa: { freezeTime: 1, scoreLimit: 500 }, practice: { freezeTime: 1 },
};
const NBOTS = { wingman: 3, demolition: 5, hostage: 5, retake: 5 };

async function browserChecks() {
  const srv = await startServer();
  const browser = await launch();
  const ids = MODES.map(m => m.id).filter(id => !ONLY || ONLY.includes(id));
  try {
    const { page, errs } = await openPage(browser, srv.url, '#dev&q=low&nolens&nodyn');
    page.setDefaultTimeout(600000);
    await page.waitForFunction(() => window.LF && LF.app && LF.app.play && document.querySelector('#ui [data-screen="title"]'), null, { timeout: 240000, polling: 250 });
    await page.evaluate(PAGE_LIB);
    for (const id of ids) {
      console.log('Mode ' + id);
      const e0 = errs.length;
      const t0 = Date.now();
      const ok = await page.evaluate(async ([id, opts, bots]) => {
        const g = await LF.app.play({ mapId: 'dev_range', modeId: id, bots, botSkill: 0.45, seed: 21, quality: 'low', local: { team: 1, name: 'Tester' }, options: opts });
        if (!g) return false;
        MT.init(); return true;
      }, [id, OPTS[id] || {}, NBOTS[id] ?? BOTS]);
      check(ok, id + ': match started');
      if (!ok) continue;
      const script = SCRIPTS[id];
      if (!script) { check(false, id + ': has a test script'); continue; }
      const res = await page.evaluate(async ([src]) => {
        try { const fn = (0, eval)('(' + src + ')'); await fn(); } catch (e) { MT.ok(false, 'script threw: ' + (e && e.stack || e)); }
        const g = LF.game;
        return { checks: MT.checks, nan: MT.nan, ff: MT.ff, ffList: MT.ffList.slice(0, 6), phase: g.match.phase, round: g.match.round, score: { ...g.match.score }, loopErr: LF.loop.loopStats.errors };
      }, [script.toString().replace(/^async\s+\w+\s*\(/, 'async function (')]);
      for (const [c, msg] of res.checks) check(c, id + ': ' + msg);
      check(res.nan === 0, id + ': no NaN positions');
      check(res.ff === 0, id + ': no friendly damage during the whole run' + (res.ff ? ' -> ' + res.ffList.join(' | ') : ''));
      console.log('    ' + id + ': phase ' + res.phase + ', round ' + res.round + ', score ' + JSON.stringify(res.score) + ', ' + ((Date.now() - t0) / 1000).toFixed(0) + ' s');
      if (SHOTS) {
        const pose = SCRIPTS[id + '_pose'];
        await page.evaluate(async ([src]) => {
          const g = LF.game; const me = g.local;
          if (src) { const fn = (0, eval)('(' + src + ')'); await fn(); }
          else if (me && me.alive) { const mk = g.objectives.markers(me).find(m => m.icon !== 'site') || g.objectives.markers(me)[0]; if (mk) MT.face(mk.x, mk.y, mk.z); }
          g.debugStep(0.05);
          await MT.show();
        }, [pose ? pose.toString().replace(/^async\s+\w+\s*\(/, 'async function (') : null]);
        await shot(page, 'modes-' + id, { timeout: 300000 });
        if (id === 'demolition' || id === 'ctf' || id === 'infection') {
          await page.evaluate(async () => { LF.app.hud.showScoreboard(true); await MT.frames(2); });
          await shot(page, 'modes-' + id + '-board', { timeout: 300000 });
          await page.evaluate(() => LF.app.hud.showScoreboard(false));
        }
        if (id === 'demolition' || id === 'practice') {
          const opened = await page.evaluate(async () => {
            const g = LF.game, me = g.local, L = g.map.lobbies[me.team];
            if (g.match.rounds) { g.match.t = 0.01; g.match.phase = g.match.phase === 'live' ? 'live' : g.match.phase; }
            if (L && g.match.phase !== 'freeze') { MT.tp(me, L.x, L.z, null, L.y); }
            me.money = Math.max(me.money, 4750);
            const ok = LF.app.hud.buy.open(); if (ok) { LF.app.hud.buy.cat = 'rifle'; LF.app.hud.buy.catPending = false; LF.app.hud.buy.render(); }
            await MT.frames(2); return ok;
          });
          if (opened) await shot(page, 'modes-' + id + '-buy', { timeout: 300000 });
          await page.evaluate(() => LF.app.hud.buy.close());
        }
        await page.evaluate(() => MT.hide());
      }
      await page.evaluate(() => LF.app.toMenu());
      const errsNow = errs.slice(e0);
      check(errsNow.length === 0, id + ': zero console errors' + (errsNow.length ? ' -> ' + errsNow.slice(0, 4).join(' | ') : ''));
    }
  } finally { await browser.close(); srv.stop(); }
}

async function main() {
  const t0 = Date.now();
  if (!process.argv.includes('--skipnode')) nodeChecks();
  await browserChecks();
  console.log('\n' + (fails.length ? 'MODES FAIL: ' + fails.length + ' check(s)\n  - ' + fails.join('\n  - ') : 'MODES OK') + '  (' + ((Date.now() - t0) / 1000).toFixed(0) + ' s)');
  process.exit(fails.length ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
