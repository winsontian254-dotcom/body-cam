/* LIVE FIRE — Gun Game (ModeDef, docs §8): free for all up a fixed ladder of 17 guns (rifles -> battle rifle -> carbine -> LMG ->
   SMGs -> shotguns -> marksman -> sniper -> pistols) and the knife. Every kill moves you to the next weapon at once; a knife kill
   also knocks the victim down one level. The first to make a knife kill on the last level wins. No pickups, no grenades.
   Exports: default ModeDef */
import { ffaRows, roamGoal, giveOnly, ms, info } from './common.js';
import { GG_LADDER } from '../game/objectives.js';
import { getGun } from '../weapons/data.js';

export const gunName = id => { const g = getGun(id); return g ? g.name.toUpperCase() : String(id).toUpperCase(); };
export default {
  id: 'gungame', name: 'Gun Game', teams: 0, respawn: true, respawnDelay: 2, rounds: 0, winRounds: 0, roundTime: 0, freezeTime: 3,
  buyTime: 0, economy: false, loadouts: false, timeLimit: 600, scoreLimit: 0, maxPlayers: 12, minPlayers: 2, objectives: ['ladder'],
  sizes: ['S', 'M'], spawnProtect: 1.5, warmupTime: 0, noPickup: true,
  columns: [{ key: 'gg', label: 'LVL', get: (p, g) => ((p.ms && p.ms.gg) | 0) + 1 + '/' + g.objectives.s.ladder.length }],
  ffaSort: (a, b) => parseInt(b.extra.gg, 10) - parseInt(a.extra.gg, 10) || b.kills - a.kills,
  setup(game) { game.objectives.useLadder(GG_LADDER); },
  onSpawn(game, p) { const L = game.objectives.s.ladder, lv = Math.min(L.length - 1, (ms(p).gg | 0)); giveOnly(game, p, L[lv]); p.noPickup = true; },
  onKill(game, ev) {
    const k = ev.killer, v = ev.victim, L = game.objectives.s.ladder, last = L.length - 1;
    if (!k || ev.suicide || game.match.phase !== 'live') return;
    const g = getGun(ev.weapon), melee = !!g && g.cat === 'melee';
    if (melee && (ms(v).gg | 0) > 0) { ms(v).gg--; game.objectives.emit('demoted', 'ladder', { actor: v, level: ms(v).gg }); }
    const lv = ms(k).gg | 0;
    if (lv >= last) { if (melee) info(game).ggWinner = k.id; return; }
    ms(k).gg = lv + 1;
    game.objectives.emit('level', 'ladder', { actor: k, level: lv + 1, gun: L[lv + 1] });
    if (k.alive) giveOnly(game, k, L[lv + 1]);
  },
  checkWin(game) { return info(game).ggWinner || null; },
  matchWinner(game) {
    let best = null, bs = -1, tie = false;
    for (const p of game.players.values()) { const s = ((p.ms && p.ms.gg) | 0) * 1000 + p.kills; if (s > bs) { bs = s; best = p; tie = false; } else if (s === bs) tie = true; }
    return best && !tie ? best.id : 0;
  },
  hud(game) {
    const L = game.objectives.s.ladder, me = game.local, lv = me ? Math.min(L.length - 1, (ms(me).gg | 0)) : 0;
    const next = L[lv + 1];
    return { top: 'LEVEL ' + (lv + 1) + ' / ' + L.length + ' · ' + gunName(L[lv]), bottom: next ? 'NEXT: ' + gunName(next) : 'KNIFE KILL TO WIN', markers: [] };
  },
  score: g => ffaRows(g, 'gg'),
  botGoal: (game, bot) => roamGoal(game, bot, 0.5),
};
