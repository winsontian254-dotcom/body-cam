/* LIVE FIRE — Practice (ModeDef, docs §8): free practice against bots. No time or score limit, 1.5 s respawns, infinite reserve ammo
   by default (cfg.options.infiniteAmmo = false turns it off), a short freeze at the start. The buy menu (B) is FREE here: every gun,
   grenade and armour, anywhere, any time (to try the arsenal).
   Exports: default ModeDef */
import { rows, roamGoal } from './common.js';

export default {
  id: 'practice', name: 'Practice', teams: 2, respawn: true, respawnDelay: 1.5, rounds: 0, winRounds: 0,
  roundTime: 0, freezeTime: 2, buyTime: 0, economy: false, freeBuy: true, loadouts: true, timeLimit: 0, scoreLimit: 0,
  maxPlayers: 16, minPlayers: 1, objectives: [], sizes: ['S', 'M', 'L'], spawnProtect: 1, warmupTime: 0,
  defaults: { infiniteAmmo: true },
  hud(game) { return { top: 'PRACTICE · [B] FREE ARMORY', bottom: game.options.infiniteAmmo ? 'INFINITE AMMO' : '', markers: [] }; },
  score: g => rows(g, (a, b) => b.kills - a.kills || a.deaths - b.deaths),
  botGoal: (game, bot) => roamGoal(game, bot, 0.3),
};
