/* LIVE FIRE — Domination (ModeDef, docs §8): three zones (map points dom1-3 = A B C). Stand in a zone to capture it (8 s alone,
   faster with more team-mates, 1.5x as long to take an enemy zone: neutralise, then capture; contested zones freeze). Every zone you
   hold scores 1 point every 2.5 s; kills score nothing for the team. Respawns at your field spawns, 10 minutes, first to 200.
   Exports: default ModeDef */
import { rows, teamHud, ms } from './common.js';

export default {
  id: 'domination', name: 'Domination', teams: 2, respawn: true, respawnDelay: 4, rounds: 0, winRounds: 0, roundTime: 0, freezeTime: 5,
  buyTime: 0, economy: false, loadouts: true, timeLimit: 600, scoreLimit: 200, maxPlayers: 16, minPlayers: 2, objectives: ['zones'],
  sizes: ['M', 'L'], spawnProtect: 2, warmupTime: 0, teamScoreOnKill: false,
  columns: [{ key: 'caps', label: 'CAPS' }],
  setup(game) {
    game.objectives.useZones([{ id: 'A', point: 'dom1' }, { id: 'B', point: 'dom2' }, { id: 'C', point: 'dom3' }], { capTime: 8 });
    const T = game.objectives.s.team; T[1].acc = 0; T[2].acc = 0;
  },
  tick(game, dt) {
    const O = game.objectives, T = O.s.team;
    for (const t of [1, 2]) {
      const n = O.s.zones.filter(z => z.owner === t).length;
      T[t].acc += n * dt / 2.5;
      while (T[t].acc >= 1 && game.match.phase === 'live') { T[t].acc -= 1; game.match.addScore(t, 1); }
    }
  },
  hud(game) {
    const O = game.objectives, me = game.local, own = O.s.zones.filter(z => me && z.owner === me.team).length;
    return { ...teamHud(game, 'FIRST TO ' + game.match.limit.score), bottom: 'YOU HOLD ' + own + ' / ' + O.s.zones.length };
  },
  score: g => rows(g),
  botGoal(game, bot) { return game.objectives.botGoal(bot); },
};
