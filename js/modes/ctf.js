/* LIVE FIRE — Capture the Flag (ModeDef, docs §8): each team's flag stands at its base (map points flag1 / flag2). Walk over the
   enemy flag to take it, carry it home and touch your OWN flag (which must be at home) to capture. A carrier who dies drops it; the
   owners return a dropped flag by touching it, otherwise it returns by itself after 30 s. Respawns 5 s, 10 minutes, first to 3.
   Exports: default ModeDef */
import { rows, teamHud } from './common.js';

export default {
  id: 'ctf', name: 'Capture the Flag', teams: 2, respawn: true, respawnDelay: 5, rounds: 0, winRounds: 0, roundTime: 0, freezeTime: 5,
  buyTime: 0, economy: false, loadouts: true, timeLimit: 600, scoreLimit: 3, maxPlayers: 16, minPlayers: 2, objectives: ['flags'],
  sizes: ['M', 'L'], spawnProtect: 2, warmupTime: 0, teamScoreOnKill: false,
  columns: [{ key: 'caps', label: 'CAPS' }, { key: 'returns', label: 'RET' }],
  setup(game) { game.objectives.useFlags(); },
  hud(game) {
    const F = game.objectives.s.flags, me = game.local, t = me && me.team > 0 ? me.team : 1, mine = F[t], theirs = F[3 - t];
    const st = f => f.state === 'home' ? 'HOME' : f.state === 'dropped' ? 'DROPPED ' + Math.ceil(game.objectives.cfg.flags.returnT - f.t) + 'S' : 'TAKEN';
    return { ...teamHud(game, 'YOUR FLAG ' + st(mine) + ' · ENEMY FLAG ' + st(theirs)), bottom: me && me.flag ? 'BRING THE FLAG HOME' : '' };
  },
  score: g => rows(g),
  botGoal(game, bot) { return game.objectives.botGoal(bot); },
};
