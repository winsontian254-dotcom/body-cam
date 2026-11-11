/* LIVE FIRE — Infection (ModeDef, docs §8): every round starts with everyone a SURVIVOR (team 2, own loadout) except one INFECTED per
   eight players (team 1). The infected wait 8 s in their lobby, then hunt with knives only: 150 health, 12% faster, no pickups. A
   survivor who dies is infected and respawns 3 s later on the infected side; infected respawn too. The infected win the round when
   nobody is left to infect; the survivors win when the 150 s clock runs out (+5 score each). 6 rounds (first to 4); teams are
   re-drawn every round (no halftime, no auto-balance).
   Exports: default ModeDef */
import { rows, roamGoal, giveOnly, ms } from './common.js';
import { hash } from '../core/util.js';

export default {
  id: 'infection', name: 'Infection', teams: 2, respawn: true, respawnDelay: 3, rounds: 6, winRounds: 4, roundTime: 150, freezeTime: 4,
  buyTime: 0, economy: false, loadouts: true, timeLimit: 0, scoreLimit: 0, maxPlayers: 16, minPlayers: 2, objectives: [], sizes: ['S', 'M', 'L'],
  roundEndTime: 6, spawnProtect: 0, halftime: false, autoBalance: false, teamNames: { 1: 'INFECTED', 2: 'SURVIVORS', plural: true },
  columns: [{ key: 'infects', label: 'INF' }, { key: 'survived', label: 'SURV' }],
  setup(game) { game.objectives.useHide({ head: 8, seekers: 1, blind: false, hidden: false }); },
  beforeRound(game) {
    const list = [...game.players.values()].filter(p => p.connected !== false).sort((a, b) => (a.id < b.id ? -1 : 1));
    for (const p of list) p.team = 2;
    const n = Math.max(1, Math.round(list.length / 8)), k0 = hash(game.seed + ':inf:' + game.match.round) % Math.max(1, list.length);
    for (let i = 0; i < n && i < list.length; i++) list[(k0 + i * 5) % list.length].team = 1;
  },
  openGates(game) { game.objectives.hideStart(); },
  onSpawn(game, p) {
    if (p.team === 1) { giveOnly(game, p, 'knife'); p.hp = p.maxHp = 150; p.armor = 0; p.helmet = false; p.speedMul = 1.12; p.noPickup = true; }
    else { p.noPickup = false; p.speedMul = 1; }
  },
  onKill(game, ev) {
    const v = ev.victim;
    if (v.team === 2 && game.match.phase === 'live') {
      v.team = 1;                                                        // infected: respawns on the infected side
      if (ev.killer && ev.killer.team === 1) { ms(ev.killer).infects = (ms(ev.killer).infects | 0) + 1; game.objectives.emit('infected', 'infect', { p: ev.killer, actor: ev.killer, victim: v.id }); }
    }
  },
  respawnTime(game, p) { return p.team === 1 ? 3 : null; },
  checkWin(game) { return game.match.teamPlayers(2).length === 0 ? { winner: 1, reason: 'infected' } : null; },
  onRoundTime() { return { winner: 2, reason: 'survived' }; },
  onRoundEnd(game, r) { if (r.winner === 2) for (const p of game.players.values()) if (p.team === 2 && p.alive) { p.score += 5; ms(p).survived = (ms(p).survived | 0) + 1; } },
  hud(game) {
    const m = game.match, me = game.local, h = game.objectives.s.hold;
    const top = h && h.on ? 'INFECTED RELEASED IN ' + Math.ceil(h.t) : m.teamPlayers(2).length + ' SURVIVORS LEFT';
    return { top, bottom: me ? (me.team === 1 ? 'INFECT THEM ALL' : 'SURVIVE') : '', markers: [] };
  },
  score: g => rows(g),
  botGoal(game, bot) {
    if (bot.team === 1) {
      let best = null, bd = Infinity;
      for (const q of game.players.values()) if (q.alive && q.team === 2) { const d = Math.hypot(q.pos.x - bot.pos.x, q.pos.z - bot.pos.z); if (d < bd) { bd = d; best = q; } }
      return best ? { kind: 'hunt', pos: { x: best.pos.x, y: best.pos.y, z: best.pos.z }, target: best.id, urgency: 1, melee: true } : roamGoal(game, bot, 1);
    }
    const hides = (game.map && game.map.hides) || [];
    const sp = hides.length ? hides[hash(bot.id) % hides.length] : null;
    return sp ? { kind: 'hold', pos: { x: sp.x, y: sp.y == null ? bot.pos.y : sp.y, z: sp.z }, urgency: 0.6, radius: 3 } : roamGoal(game, bot, 0.3);
  },
};
