/* LIVE FIRE — VIP Escort (ModeDef, docs §8): each round one operator of team 1 (rotating) is the VIP: a pistol, full armour and a
   helmet, slightly slower, cannot pick up weapons. Team 1 wins when the VIP stands 2.5 s in an extraction point (map points
   extract1..), team 2 wins when the VIP dies or the clock runs out; wiping out the other team also wins. Profile loadouts for
   everyone else, 12 rounds (first to 7), halftime swap, sudden death on 6-6.
   Exports: default ModeDef */
import { rows, roamGoal, elimination, teamHud } from './common.js';

export default {
  id: 'vip', name: 'VIP Escort', teams: 2, respawn: false, rounds: 12, winRounds: 7, roundTime: 150, freezeTime: 6, buyTime: 0,
  economy: false, loadouts: true, timeLimit: 0, scoreLimit: 0, maxPlayers: 12, minPlayers: 2, objectives: ['vip'], sizes: ['M', 'L'],
  roundEndTime: 6, halftimeTime: 6, overtime: { rounds: 1 }, spawnProtect: 0,
  columns: [{ key: 'extracts', label: 'EXT' }, { key: 'vipkills', label: 'VIPK' }],
  setup(game) { game.objectives.useVip(); },
  checkWin(game) { return elimination(game); },
  onRoundTime() { return { winner: 2, reason: 'time' }; },
  canBuy(game, p) { return p.vip ? { ok: false, reason: 'THE VIP CANNOT BUY' } : { ok: true }; },
  hud(game) {
    const O = game.objectives, v = O.s.vip, me = game.local, vp = v && game.players.get(v.id);
    const top = !vp ? '' : me && me.vip ? 'YOU ARE THE VIP' : me && me.team === 1 ? 'PROTECT ' + vp.name.toUpperCase() : 'ELIMINATE THE VIP';
    return teamHud(game, top, vp && me && me.team === 1 ? 'VIP HEALTH ' + Math.max(0, Math.ceil(vp.hp)) : '');
  },
  score: g => rows(g),
  botGoal(game, bot) { return game.objectives.botGoal(bot) || roamGoal(game, bot); },
};
