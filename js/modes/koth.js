/* LIVE FIRE — King of the Hill (ModeDef, docs §8): one fixed hill (map point 'hill'). Take it (5 s alone), then hold it: the owner
   scores 1 point per second while at least one of them is inside and no enemy is (an enemy inside contests it and stops the clock;
   staying alone drains and steals it). Respawns, 10 minutes, first to 150.
   Exports: default ModeDef */
import { rows, teamHud } from './common.js';

export default {
  id: 'koth', name: 'King of the Hill', teams: 2, respawn: true, respawnDelay: 4, rounds: 0, winRounds: 0, roundTime: 0, freezeTime: 5,
  buyTime: 0, economy: false, loadouts: true, timeLimit: 600, scoreLimit: 150, maxPlayers: 12, minPlayers: 2, objectives: ['zones'],
  sizes: ['S', 'M'], spawnProtect: 2, warmupTime: 0, teamScoreOnKill: false,
  columns: [{ key: 'kothT', label: 'TIME', get: p => Math.round((p.ms && p.ms.kothT) || 0) }],
  setup(game) {
    const P = (game.map && game.map.points) || {};
    const pt = P.hill ? 'hill' : P.dom2 ? 'dom2' : Object.keys(P)[0];
    game.objectives.useZones([{ id: 'HILL', label: 'HILL', point: pt, r: Math.max(4, (P[pt] && P[pt].r) || 4) }], { capTime: 5 });
    const T = game.objectives.s.team; T[1].acc = 0; T[2].acc = 0;
  },
  tick(game, dt) {
    const O = game.objectives, z = O.s.zones[0], T = O.s.team;
    if (!z || !z.owner || z.contested) return;
    const n = z.owner === 1 ? z.n1 : z.n2; if (!n) return;
    T[z.owner].acc += dt;
    for (const p of game.players.values()) if (p.alive && p.team === z.owner && O.inZone(z, p)) { p.ms = p.ms || {}; p.ms.kothT = (p.ms.kothT || 0) + dt; p.score += dt * 0.5; }
    while (T[z.owner].acc >= 1 && game.match.phase === 'live') { T[z.owner].acc -= 1; game.match.addScore(z.owner, 1); }
  },
  hud(game) {
    const z = game.objectives.s.zones[0], me = game.local;
    const st = !z ? '' : z.contested ? 'HILL CONTESTED' : z.owner ? (me && z.owner === me.team ? 'YOUR HILL' : 'ENEMY HILL') : 'HILL IS NEUTRAL';
    return teamHud(game, st + ' · FIRST TO ' + game.match.limit.score);
  },
  score: g => rows(g),
  botGoal(game, bot) { return game.objectives.botGoal(bot); },
};
