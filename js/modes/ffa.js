/* LIVE FIRE — Free For All (ModeDef, docs §8): everyone on team 0, FFA spawns away from everybody, first to the kill limit.
   Exports: default ModeDef */
export default {
  id: 'ffa', name: 'Free For All', teams: 0, respawn: true, respawnDelay: 2, rounds: 0, winRounds: 0,
  roundTime: 0, freezeTime: 3, buyTime: 0, economy: false, loadouts: true, timeLimit: 600, scoreLimit: 30,
  maxPlayers: 12, minPlayers: 2, objectives: [], sizes: ['S', 'M', 'L'], spawnProtect: 1.5, warmupTime: 0,
  hud(game) {
    const m = game.match, me = game.local;
    const rows = [...game.players.values()].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
    const lead = rows[0];
    return { top: m.limit.score ? 'FIRST TO ' + m.limit.score : '', bottom: me && lead ? (lead === me ? 'YOU LEAD' : 'LEADER ' + lead.name.toUpperCase() + ' ' + lead.kills) : '', markers: [] };
  },
  score(game) {
    return [...game.players.values()].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths)
      .map(p => ({ id: p.id, name: p.name, team: 0, score: p.score, kills: p.kills, deaths: p.deaths, assists: p.assists }));
  },
};
