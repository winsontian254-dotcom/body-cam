/* LIVE FIRE — Hostage Rescue (ModeDef, docs §8): the rescue team (team 1) reaches the hostages, picks one up (hold USE 1.6 s; one at a
   time, carried over the shoulder, 82% speed) and carries it into a rescue zone; two rescues win the round. The captors (team 2) win
   on time, by elimination or when too few hostages are left alive. Shooting a hostage costs $10 per hit point, killing one $1000.
   Full economy (+$1000 for the rescuer, +$300 for the team), 16 rounds (first to 9), halftime swap, MR3 overtime.
   Exports: default ModeDef */
import { rows, roamGoal, elimination } from './common.js';

export default {
  id: 'hostage', name: 'Hostage Rescue', teams: 2, respawn: false, rounds: 16, winRounds: 9, roundTime: 135, freezeTime: 12, buyTime: 20,
  economy: true, loadouts: false, timeLimit: 0, scoreLimit: 0, maxPlayers: 10, minPlayers: 2, objectives: ['hostage'], sizes: ['M', 'L'],
  roundEndTime: 6, halftimeTime: 8, overtime: { rounds: 6, money: 10000 }, spawnProtect: 0,
  columns: [{ key: 'rescues', label: 'RESC' }],
  setup(game) { game.objectives.useHostages({ goal: 2 }); },
  checkWin(game) { return elimination(game); },
  onRoundTime() { return { winner: 2, reason: 'time' }; },
  hud(game) {
    const O = game.objectives, s = O.s, me = game.local, resc = me && me.team === 1;
    const alive = s.hostages.filter(h => h.state !== 'dead' && h.state !== 'rescued').length;
    return { top: 'RESCUED ' + s.rescued + ' / ' + s.hostGoal, bottom: resc ? (me.carry ? 'GET TO THE RESCUE ZONE' : 'RESCUE THE HOSTAGES') : alive + ' HOSTAGES · HOLD THEM', markers: O.markers(me) };
  },
  score: g => rows(g),
  botGoal(game, bot) { return game.objectives.botGoal(bot) || roamGoal(game, bot); },
};
