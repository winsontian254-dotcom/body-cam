/* LIVE FIRE — One in the Chamber (ModeDef, docs §8): free for all with a pistol holding ONE round (no reserve) and a knife. Any bullet
   or knife hit kills outright; every kill puts one more round in your pistol. Three lives each: when they are gone you spectate.
   The last operator with lives left wins (or the most kills when the 8 minutes are up). No pickups.
   Exports: default ModeDef */
import { ffaRows, roamGoal, giveOnly, ms } from './common.js';
import { statsOf } from '../game/weapon.js';

const GUN = 'ridgeback', LIVES = 3;
export default {
  id: 'oitc', name: 'One in the Chamber', teams: 0, respawn: true, respawnDelay: 2, rounds: 0, winRounds: 0, roundTime: 0, freezeTime: 3,
  buyTime: 0, economy: false, loadouts: false, timeLimit: 480, scoreLimit: 0, maxPlayers: 12, minPlayers: 2, objectives: [], sizes: ['S', 'M'],
  spawnProtect: 1.5, warmupTime: 0, noPickup: true, defaults: { armor: 0, helmet: false },
  columns: [{ key: 'lives', label: 'LIVES', get: p => (p.ms && p.ms.lives != null ? p.ms.lives : LIVES) }],
  ffaSort: (a, b) => (b.extra.lives | 0) - (a.extra.lives | 0) || b.kills - a.kills,
  setup(game) {
    for (const p of game.players.values()) ms(p).lives = LIVES;
    // one hit kills: a bullet or knife hit that did not kill finishes the victim (host / local authority only)
    game.bus.on('hit', e => {
      if (game.authority === 'client' || e.predicted || !e.victim || !e.victim.alive || !e.attacker || e.attacker === e.victim) return;
      if (e.kind !== 'bullet' && e.kind !== 'melee') return;
      game.kill(e.victim, { attacker: e.attacker, weapon: e.weapon, group: e.group, kind: e.kind, point: e.point, dir: e.dir });
    });
    game.bus.on('player:join', e => { if (e.p && (ms(e.p).lives == null)) ms(e.p).lives = game.match.phase === 'live' ? 1 : LIVES; });
  },
  onSpawn(game, p) { if (ms(p).lives == null) ms(p).lives = LIVES; giveOnly(game, p, GUN, { mag: 1, reserve: 0 }); p.armor = 0; p.helmet = false; p.noPickup = true; },
  onKill(game, ev) {
    const v = ev.victim, k = ev.killer;
    if (game.match.phase !== 'live') return;
    ms(v).lives = Math.max(0, (ms(v).lives ?? LIVES) - 1);
    if (k && !ev.suicide) { const w = k.inv.secondary; if (w) { const st = statsOf(w); if (w.mag < (st ? st.mag : 1)) w.mag++; else w.reserve++; } }
  },
  respawnTime(game, p) { return (ms(p).lives | 0) > 0 ? 2 : null; },
  checkWin(game) {
    const all = [...game.players.values()].filter(p => p.connected !== false);
    if (all.length < 2) return null;
    const left = all.filter(p => (ms(p).lives | 0) > 0);
    return left.length <= 1 ? (left[0] ? left[0].id : 0) : null;
  },
  matchWinner(game) {
    let best = null, bs = -1, tie = false;
    for (const p of game.players.values()) { const s = ((ms(p).lives | 0) * 1000) + p.kills; if (s > bs) { bs = s; best = p; tie = false; } else if (s === bs) tie = true; }
    return best && !tie ? best.id : 0;
  },
  hud(game) {
    const me = game.local, w = me && me.inv.secondary, left = [...game.players.values()].filter(p => (ms(p).lives | 0) > 0).length;
    return { top: left + ' OPERATORS LEFT', bottom: me ? 'LIVES ' + (ms(me).lives | 0) + ' · ROUNDS ' + (w ? w.mag + w.reserve : 0) : '', markers: [] };
  },
  score: g => ffaRows(g, 'lives'),
  botGoal: (game, bot) => roamGoal(game, bot, 0.4),
};
