/* LIVE FIRE — Gun Rush (ModeDef, docs §8): team gun game. Each team climbs an 11-step ladder together: every few team kills (half the
   team size, at least 1) the whole team gets the next weapon at once; a knife kill takes one kill of progress off the victim's team.
   The team that makes a knife kill on the last level wins (otherwise the higher level when time runs out). Respawns, 10 minutes.
   Exports: default ModeDef */
import { rows, roamGoal, giveOnly, info } from './common.js';
import { RUSH_LADDER } from '../game/objectives.js';
import { getGun } from '../weapons/data.js';
import { gunName } from './gungame.js';

const per = (game, t) => Math.max(1, Math.round(game.match.teamPlayers(t).length / 2));
export default {
  id: 'gunrush', name: 'Gun Rush', teams: 2, respawn: true, respawnDelay: 3, rounds: 0, winRounds: 0, roundTime: 0, freezeTime: 5,
  buyTime: 0, economy: false, loadouts: false, timeLimit: 600, scoreLimit: 0, maxPlayers: 16, minPlayers: 2, objectives: ['ladder'],
  sizes: ['S', 'M'], spawnProtect: 2, warmupTime: 0, teamScoreOnKill: false, noPickup: true,
  setup(game) {
    game.objectives.useLadder(RUSH_LADDER);
    const T = game.objectives.s.team; T[1].lvl = 0; T[1].k = 0; T[2].lvl = 0; T[2].k = 0;
  },
  onSpawn(game, p) { const L = game.objectives.s.ladder, T = game.objectives.s.team[p.team]; giveOnly(game, p, L[Math.min(L.length - 1, T ? T.lvl : 0)]); p.noPickup = true; },
  onKill(game, ev) {
    const k = ev.killer, v = ev.victim, O = game.objectives, L = O.s.ladder, last = L.length - 1;
    if (!k || ev.suicide || k.team === v.team || game.match.phase !== 'live') return;
    const g = getGun(ev.weapon), melee = !!g && g.cat === 'melee', T = O.s.team[k.team], V = O.s.team[v.team];
    if (melee && V) V.k = Math.max(0, V.k - 1);
    if (T.lvl >= last) { if (melee) info(game).rushWinner = k.team; return; }
    if (++T.k >= per(game, k.team)) {
      T.k = 0; T.lvl++;
      game.match.score[k.team] = T.lvl;
      O.emit('level', 'ladder', { team: k.team, level: T.lvl, gun: L[T.lvl] });
      for (const q of game.match.teamPlayers(k.team)) if (q.alive) giveOnly(game, q, L[T.lvl]);
    }
  },
  checkWin(game) { return info(game).rushWinner || null; },
  matchWinner(game) {
    const T = game.objectives.s.team, a = T[1].lvl * 100 + T[1].k, b = T[2].lvl * 100 + T[2].k;
    return a > b ? 1 : b > a ? 2 : 0;
  },
  hud(game) {
    const O = game.objectives, me = game.local, t = me && me.team > 0 ? me.team : 1, T = O.s.team[t], E = O.s.team[3 - t], L = O.s.ladder;
    return { top: 'TEAM LEVEL ' + (T.lvl + 1) + ' / ' + L.length + ' · ' + gunName(L[T.lvl]) + ' · ' + T.k + '/' + per(game, t) + ' KILLS',
      bottom: 'ENEMY LEVEL ' + (E.lvl + 1) + (T.lvl >= L.length - 1 ? ' · KNIFE KILL TO WIN' : ''), markers: [] };
  },
  score: g => rows(g),
  botGoal: (game, bot) => roamGoal(game, bot, 0.5),
};
