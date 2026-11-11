/* LIVE FIRE — Blades Only (ModeDef, docs §8): team deathmatch with knives and tomahawks only (the Profile loadout's melee weapon,
   else the knife); no guns, no grenades, no pickups. Backstabs kill outright. 8 minutes, first to 40.
   Exports: default ModeDef */
import { rows, roamGoal, giveOnly, MELEE_IDS } from './common.js';

export default {
  id: 'blades', name: 'Blades Only', teams: 2, respawn: true, respawnDelay: 3, rounds: 0, winRounds: 0, roundTime: 0, freezeTime: 5,
  buyTime: 0, economy: false, loadouts: true, timeLimit: 480, scoreLimit: 40, maxPlayers: 16, minPlayers: 2, objectives: [],
  sizes: ['S', 'M'], spawnProtect: 2, warmupTime: 0, noPickup: true,
  onSpawn(game, p) {
    const lo = p.loadout || {};
    giveOnly(game, p, MELEE_IDS.includes(lo.melee) ? lo.melee : p.bot ? MELEE_IDS[Math.floor(game.rng() * MELEE_IDS.length)] : 'knife');
    p.noPickup = true;
  },
  hud(game) { const m = game.match; return { top: 'BLADES ONLY · FIRST TO ' + m.limit.score, bottom: '', markers: [] }; },
  score: g => rows(g),
  botGoal: (game, bot) => roamGoal(game, bot, 0.6),
};
