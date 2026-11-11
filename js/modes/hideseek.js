/* LIVE FIRE — Hide and Seek (ModeDef, docs §8): HIDERS (team 2) get knives only and a 30 s head start: their gates open at once and
   the map's hide spots (closets, vents, bushes, dark corners, crates...) are marked for them. SEEKERS (team 1) wait in their lobby,
   blinded, then hunt with their loadouts. A hider crouched and still inside a hide spot is "hidden" (p.hidden: bots cannot spot
   them). Seekers win the round when every hider is found; hiders win when the 180 s clock runs out (+5 score each survivor) or the
   seekers are all down. Teams swap roles EVERY round (scores follow the players), 6 rounds.
   Exports: default ModeDef */
import { rows, giveOnly, ms, fmt } from './common.js';

export default {
  id: 'hideseek', name: 'Hide and Seek', teams: 2, respawn: false, rounds: 6, winRounds: 4, roundTime: 180, freezeTime: 3, buyTime: 0,
  economy: false, loadouts: true, timeLimit: 0, scoreLimit: 0, maxPlayers: 16, minPlayers: 2, objectives: ['hide'], sizes: ['S', 'M', 'L'],
  roundEndTime: 6, spawnProtect: 0, swapEveryRound: true, noPickup: false, teamNames: { 1: 'SEEKERS', 2: 'HIDERS', plural: true },
  columns: [{ key: 'found', label: 'FOUND' }, { key: 'survived', label: 'SURV' }],
  setup(game) { game.objectives.useHide({ head: 30, seekers: 1, blind: true, hidden: true }); },
  openGates(game) { game.objectives.hideStart(); },
  onSpawn(game, p) {
    if (p.team === 2) { giveOnly(game, p, 'knife'); p.armor = 0; p.helmet = false; p.speedMul = 1.04; p.noPickup = true; }
    else { p.noPickup = false; p.speedMul = 1; }
  },
  onKill(game, ev) { if (ev.killer && ev.killer.team === 1 && ev.victim.team === 2) ms(ev.killer).found = (ms(ev.killer).found | 0) + 1; },
  checkWin(game) {
    const m = game.match; if (!m.teamPlayers(1).length || !m.teamPlayers(2).length) return null;
    if (m.alive(2) === 0) return { winner: 1, reason: 'found' };
    if (m.alive(1) === 0) return { winner: 2, reason: 'hidden' };
    return null;
  },
  onRoundTime() { return { winner: 2, reason: 'hidden' }; },
  onRoundEnd(game, r) { if (r.winner === 2) for (const p of game.players.values()) if (p.team === 2 && p.alive) { p.score += 5; ms(p).survived = (ms(p).survived | 0) + 1; } },
  hud(game) {
    const m = game.match, me = game.local, h = game.objectives.s.hold, seek = me && me.team === 1;
    const top = h && h.on ? (seek ? 'RELEASED IN ' + Math.ceil(h.t) : 'HIDE! SEEKERS RELEASED IN ' + Math.ceil(h.t)) : m.alive(2) + ' HIDERS LEFT · ' + fmt(m.t);
    return { top, bottom: seek ? 'FIND EVERY HIDER' : me && me.hidden ? 'HIDDEN' : 'STAY OUT OF SIGHT · CROUCH IN A HIDE SPOT', markers: game.objectives.markers(me) };
  },
  score: g => rows(g),
  botGoal(game, bot) { return game.objectives.botGoal(bot); },
};
