/* LIVE FIRE — Snipers Only (ModeDef, docs §8): team deathmatch with bolt-action rifles only (the Profile loadout's primary when it is
   a bolt gun, else the Rook) and the knife; no pistols, no grenades. 10 minutes, first to 50.
   Exports: default ModeDef */
import { rows, roamGoal, giveOnly, BOLT_SNIPERS } from './common.js';

export default {
  id: 'snipers', name: 'Snipers Only', teams: 2, respawn: true, respawnDelay: 3, rounds: 0, winRounds: 0, roundTime: 0, freezeTime: 5,
  buyTime: 0, economy: false, loadouts: true, timeLimit: 600, scoreLimit: 50, maxPlayers: 16, minPlayers: 2, objectives: [],
  sizes: ['M', 'L'], spawnProtect: 2, warmupTime: 0,
  onSpawn(game, p) {
    const lo = p.loadout || {};
    const gun = BOLT_SNIPERS.includes(lo.primary) ? lo.primary : p.bot ? BOLT_SNIPERS[Math.floor(game.rng() * BOLT_SNIPERS.length)] : 'rook';
    giveOnly(game, p, gun, { melee: lo.melee && ['knife', 'zafra', 'ridgehawk'].includes(lo.melee) ? lo.melee : 'knife' });
  },
  hud(game) { const m = game.match; return { top: 'BOLT-ACTION ONLY · FIRST TO ' + m.limit.score, bottom: '', markers: [] }; },
  score: g => rows(g),
  botGoal: (game, bot) => roamGoal(game, bot, 0.25),
};
