/* LIVE FIRE — Team Deathmatch (ModeDef, docs §8): two teams, respawns at field spawns away from enemies, first team to the kill
   limit (or the leader when time runs out) wins. Round 1 starts in the lobbies behind closed gates (freeze time).
   Exports: default ModeDef */
export default {
  id: 'tdm', name: 'Team Deathmatch', teams: 2, respawn: true, respawnDelay: 3, rounds: 0, winRounds: 0,
  roundTime: 0, freezeTime: 5, buyTime: 0, economy: false, loadouts: true, timeLimit: 600, scoreLimit: 75,
  maxPlayers: 16, minPlayers: 2, objectives: [], sizes: ['S', 'M', 'L'], spawnProtect: 2, warmupTime: 0,
  hud(game) {
    const m = game.match;
    return { top: m.limit.score ? 'FIRST TO ' + m.limit.score : '', bottom: '', markers: [] };
  },
  score(game) {
    return [...game.players.values()].sort((a, b) => b.score - a.score || b.kills - a.kills || a.deaths - b.deaths)
      .map(p => ({ id: p.id, name: p.name, team: p.team, score: p.score, kills: p.kills, deaths: p.deaths, assists: p.assists }));
  },
};
