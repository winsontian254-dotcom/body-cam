/* LIVE FIRE — Elimination (ModeDef, docs §8): one life per round, no objective; the last team standing takes the round. When the
   clock runs out the team with more operators alive wins (equal = a drawn round). Profile loadouts every round, 12 rounds (first to
   7), halftime swap, sudden-death rounds on 6-6.
   Exports: default ModeDef */
import { rows, roamGoal, elimination } from './common.js';

export default {
  id: 'elimination', name: 'Elimination', teams: 2, respawn: false, rounds: 12, winRounds: 7, roundTime: 120, freezeTime: 5, buyTime: 0,
  economy: false, loadouts: true, timeLimit: 0, scoreLimit: 0, maxPlayers: 12, minPlayers: 2, objectives: [], sizes: ['S', 'M', 'L'],
  roundEndTime: 5, halftimeTime: 6, overtime: { rounds: 1 }, spawnProtect: 0,
  checkWin: g => elimination(g),
  onRoundTime(game) {
    const m = game.match, a = m.alive(1), b = m.alive(2);
    return a > b ? { winner: 1, reason: 'time' } : b > a ? { winner: 2, reason: 'time' } : { winner: 0, reason: 'draw' };
  },
  hud(game) { const m = game.match; return { top: m.alive(1) + ' VS ' + m.alive(2), bottom: '', markers: [] }; },
  score: g => rows(g),
  botGoal: (game, bot) => roamGoal(game, bot, 0.5),
};
