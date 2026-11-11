/* LIVE FIRE — Kill Confirmed (ModeDef, docs §8): a kill drops the victim's dog tags. The kill only scores when someone of the killing
   team walks over the tags (CONFIRM, +1 team point); the victim's team-mates can pick them up first to DENY it. Tags vanish after
   60 s. Respawns, 10 minutes, first to 65.
   Exports: default ModeDef */
import { rows, teamHud, roamGoal } from './common.js';

export default {
  id: 'killconfirmed', name: 'Kill Confirmed', teams: 2, respawn: true, respawnDelay: 3, rounds: 0, winRounds: 0, roundTime: 0, freezeTime: 5,
  buyTime: 0, economy: false, loadouts: true, timeLimit: 600, scoreLimit: 65, maxPlayers: 16, minPlayers: 2, objectives: ['tags'],
  sizes: ['S', 'M', 'L'], spawnProtect: 2, warmupTime: 0, teamScoreOnKill: false,
  columns: [{ key: 'confirms', label: 'CONF' }, { key: 'denies', label: 'DENY' }],
  setup(game) { game.objectives.useTags(); },
  hud(game) { return teamHud(game, 'CONFIRM KILLS · FIRST TO ' + game.match.limit.score, game.objectives.s.tags.length + ' TAGS ON THE GROUND'); },
  score: g => rows(g),
  botGoal(game, bot) { return game.objectives.botGoal(bot) || roamGoal(game, bot); },
};
