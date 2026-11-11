/* LIVE FIRE — Hardcore (ModeDef, docs §8): team deathmatch with 30 health and no armour, no HUD (no crosshair, vitals, ammo counter
   or hit markers; the score bar and kill feed stay), 4 s respawns. Friendly fire stays OFF like every mode. 10 minutes, first to 75.
   Exports: default ModeDef */
import { rows, roamGoal } from './common.js';

export default {
  id: 'hardcore', name: 'Hardcore', teams: 2, respawn: true, respawnDelay: 4, rounds: 0, winRounds: 0, roundTime: 0, freezeTime: 5,
  buyTime: 0, economy: false, loadouts: true, timeLimit: 600, scoreLimit: 75, maxPlayers: 16, minPlayers: 2, objectives: [],
  sizes: ['S', 'M', 'L'], spawnProtect: 1.5, warmupTime: 0, hardcore: true,
  defaults: { hp: 30, armor: 0, helmet: false },
  hud(game) { const m = game.match; return { top: 'HARDCORE · FIRST TO ' + m.limit.score, bottom: '', markers: [] }; },
  score: g => rows(g),
  botGoal: (game, bot) => roamGoal(game, bot),
};
