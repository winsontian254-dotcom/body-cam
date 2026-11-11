/* LIVE FIRE — Sharpshooter (ModeDef, docs §8): free for all where EVERYONE carries the same weapon, picked from a seeded rotation of
   30 guns and swapped for everybody every 45 s (respawns get the current one). No pickups, no grenades. 10 minutes, first to 25.
   Exports: default ModeDef */
import { ffaRows, roamGoal, giveOnly, fmt } from './common.js';
import { gunName } from './gungame.js';

export default {
  id: 'sharpshooter', name: 'Sharpshooter', teams: 0, respawn: true, respawnDelay: 2, rounds: 0, winRounds: 0, roundTime: 0, freezeTime: 3,
  buyTime: 0, economy: false, loadouts: false, timeLimit: 600, scoreLimit: 25, maxPlayers: 12, minPlayers: 2, objectives: ['sharp'],
  sizes: ['S', 'M', 'L'], spawnProtect: 1.5, warmupTime: 0, noPickup: true,
  setup(game) { game.objectives.useSharp({ every: 45 }); },
  onSpawn(game, p) { giveOnly(game, p, game.objectives.s.sharp.gun); p.noPickup = true; },
  hud(game) { const sh = game.objectives.s.sharp; return { top: gunName(sh.gun) + ' · NEXT IN ' + fmt(sh.t), bottom: 'FIRST TO ' + game.match.limit.score, markers: [] }; },
  score: g => ffaRows(g),
  botGoal: (game, bot) => roamGoal(game, bot, 0.4),
};
