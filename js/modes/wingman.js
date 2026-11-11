/* LIVE FIRE — Wingman (ModeDef, docs §8): two-versus-two demolition on ONE bomb site (B when the map has it), short 90 s rounds,
   10 s freeze + 15 s buy time, full economy, 16 rounds (first to 9), halftime swap, MR3 overtime.
   Exports: default ModeDef */
import { bombMode } from './common.js';

export default bombMode({
  id: 'wingman', name: 'Wingman', rounds: 16, winRounds: 9, roundTime: 90, freezeTime: 10, buyTime: 15, economy: true, loadouts: false,
  timeLimit: 0, scoreLimit: 0, maxPlayers: 4, minPlayers: 2, sizes: ['S'], overtime: { rounds: 6, money: 10000 },
  bomb(game) { const S = (game.map && game.map.sites) || {}; return { sites: [S.B ? 'B' : Object.keys(S)[0] || 'A'] }; },
});
