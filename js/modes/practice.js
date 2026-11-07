/* LIVE FIRE — Practice (ModeDef, docs §8): free practice against bots. No time or score limit, 1.5 s respawns, infinite reserve
   ammo by default (cfg.options.infiniteAmmo = false turns it off), a short freeze at the start.
   Exports: default ModeDef */
export default {
  id: 'practice', name: 'Practice', teams: 2, respawn: true, respawnDelay: 1.5, rounds: 0, winRounds: 0,
  roundTime: 0, freezeTime: 2, buyTime: 0, economy: false, loadouts: true, timeLimit: 0, scoreLimit: 0,
  maxPlayers: 16, minPlayers: 1, objectives: [], sizes: ['S', 'M', 'L'], spawnProtect: 1, warmupTime: 0,
  defaults: { infiniteAmmo: true },
  hud(game) { return { top: 'PRACTICE', bottom: game.options.infiniteAmmo ? 'INFINITE AMMO' : '', markers: [] }; },
  score(game) {
    return [...game.players.values()].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths)
      .map(p => ({ id: p.id, name: p.name, team: p.team, score: p.score, kills: p.kills, deaths: p.deaths, assists: p.assists }));
  },
};
