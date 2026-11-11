/* LIVE FIRE — Juggernaut (ModeDef, docs §8): free for all around one juggernaut: 400 health, armour and helmet, a belt-fed machine
   gun, 86% speed, no pickups. The first juggernaut is chosen 6 s into the match; whoever kills them takes the suit at once.
   Points: a kill as the juggernaut +2, killing the juggernaut +3, any other kill +1. Respawns, 10 minutes, first to 30 points.
   Exports: default ModeDef */
import { ffaRows, roamGoal, ms } from './common.js';

export default {
  id: 'juggernaut', name: 'Juggernaut', teams: 0, respawn: true, respawnDelay: 2.5, rounds: 0, winRounds: 0, roundTime: 0, freezeTime: 3,
  buyTime: 0, economy: false, loadouts: true, timeLimit: 600, scoreLimit: 30, maxPlayers: 12, minPlayers: 2, objectives: ['jugg'],
  sizes: ['S', 'M', 'L'], spawnProtect: 1.5, warmupTime: 0,
  columns: [{ key: 'pts', label: 'PTS' }, { key: 'juggkills', label: 'JK' }],
  ffaSort: (a, b) => (b.extra.pts | 0) - (a.extra.pts | 0) || b.kills - a.kills,
  setup(game) {
    game.objectives.useJugg();
    // points are decided on the kill event: before objectives hands the suit to the killer
    game.bus.on('kill', e => {
      if (!e.killer || e.suicide || game.match.phase !== 'live') return;
      const j = game.objectives.s.jugg, k = ms(e.killer);
      k.pts = (k.pts | 0) + (e.killer.id === j ? 2 : e.victim.id === j ? 3 : 1);
    });
  },
  checkWin(game) {
    const lim = game.match.limit.score; if (!(lim > 0)) return null;
    for (const p of game.players.values()) if (((p.ms && p.ms.pts) | 0) >= lim) return p.id;
    return null;
  },
  matchWinner(game) {
    let best = null, bs = -1, tie = false;
    for (const p of game.players.values()) { const s = ((p.ms && p.ms.pts) | 0) * 100 + p.kills; if (s > bs) { bs = s; best = p; tie = false; } else if (s === bs) tie = true; }
    return best && !tie ? best.id : 0;
  },
  hud(game) {
    const O = game.objectives, j = O.s.jugg && game.players.get(O.s.jugg), me = game.local;
    const top = j ? (j === me ? 'YOU ARE THE JUGGERNAUT' : 'JUGGERNAUT: ' + j.name.toUpperCase()) : 'JUGGERNAUT INCOMING';
    return { top, bottom: me ? 'YOUR POINTS ' + ((me.ms && me.ms.pts) | 0) + ' / ' + game.match.limit.score : '', markers: O.markers(me) };
  },
  score: g => ffaRows(g, 'pts'),
  botGoal(game, bot) { return bot.jugg ? roamGoal(game, bot, 0.6) : game.objectives.botGoal(bot) || roamGoal(game, bot); },
};
