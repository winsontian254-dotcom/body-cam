/* LIVE FIRE — game mode registry.
   Exports:
     MODES              [{ id, name, short, desc, teams, respawn, rounds, objectives, sizes, available }] — all 26 ids of docs §8
                        (available = a js/modes/<id>.js file exists; the menus grey out the others)
     getModeMeta(id)    registry entry or null
     loadMode(id) -> Promise<ModeDef>   imports js/modes/<id>.js (cached); rejects for an unavailable mode
     getMode(id)        the loaded ModeDef (after loadMode) or null
   A modes worker adds the remaining files: write js/modes/<id>.js (export default ModeDef, docs §8) and set available: true. */

export const MODES = [
  { id: 'tdm', name: 'Team Deathmatch', short: 'TDM', teams: 2, respawn: true, rounds: 0, objectives: [], sizes: ['S', 'M', 'L'], available: true,
    desc: 'Two teams, instant respawns at the far side of the map. First team to the kill limit, or the most kills when time runs out.' },
  { id: 'ffa', name: 'Free For All', short: 'FFA', teams: 0, respawn: true, rounds: 0, objectives: [], sizes: ['S', 'M', 'L'], available: true,
    desc: 'Everyone for themselves. Respawn away from enemies; first operator to the kill limit wins.' },
  { id: 'demolition', name: 'Demolition', short: 'DEM', teams: 2, respawn: false, rounds: 24, objectives: ['bomb'], sizes: ['M', 'L'], available: false,
    desc: 'Attackers carry a charge to site A or B and defend it until it detonates; defenders stop the plant or defuse it. One life per round, buy phase, economy.' },
  { id: 'hostage', name: 'Hostage Rescue', short: 'HR', teams: 2, respawn: false, rounds: 16, objectives: ['hostage'], sizes: ['M', 'L'], available: false,
    desc: 'Attackers reach the hostages and walk them to a rescue zone; defenders hold them. One life per round.' },
  { id: 'wingman', name: 'Wingman', short: '2V2', teams: 2, respawn: false, rounds: 16, objectives: ['bomb'], sizes: ['S'], available: false,
    desc: 'Two-versus-two demolition on one bomb site, short rounds, small maps.' },
  { id: 'retake', name: 'Retake', short: 'RTK', teams: 2, respawn: false, rounds: 16, objectives: ['bomb'], sizes: ['M', 'L'], available: false,
    desc: 'The charge is already planted: defenders retake the site and defuse, attackers hold it. Fixed loadouts.' },
  { id: 'snd', name: 'Search and Destroy', short: 'S&D', teams: 2, respawn: false, rounds: 12, objectives: ['bomb'], sizes: ['M', 'L'], available: false,
    desc: 'Classic one-life bomb mode without an economy: pick a loadout every round.' },
  { id: 'elimination', name: 'Elimination', short: 'ELIM', teams: 2, respawn: false, rounds: 12, objectives: [], sizes: ['S', 'M', 'L'], available: false,
    desc: 'One life per round, no objective: the last team standing takes the round.' },
  { id: 'domination', name: 'Domination', short: 'DOM', teams: 2, respawn: true, rounds: 0, objectives: ['zones'], sizes: ['M', 'L'], available: false,
    desc: 'Capture and hold three zones; held zones tick points.' },
  { id: 'hardpoint', name: 'Hardpoint', short: 'HP', teams: 2, respawn: true, rounds: 0, objectives: ['zones'], sizes: ['M', 'L'], available: false,
    desc: 'One zone at a time, moving around the map every minute. Stand in it alone to score.' },
  { id: 'koth', name: 'King of the Hill', short: 'KOTH', teams: 2, respawn: true, rounds: 0, objectives: ['zones'], sizes: ['S', 'M'], available: false,
    desc: 'One fixed hill. Hold it to score; contest it to stop the clock.' },
  { id: 'ctf', name: 'Capture the Flag', short: 'CTF', teams: 2, respawn: true, rounds: 0, objectives: ['flags'], sizes: ['M', 'L'], available: false,
    desc: 'Take the enemy flag home while yours is still at your base.' },
  { id: 'killconfirmed', name: 'Kill Confirmed', short: 'KC', teams: 2, respawn: true, rounds: 0, objectives: ['tags'], sizes: ['S', 'M', 'L'], available: false,
    desc: 'A kill only counts when you pick up the dropped tag; deny the enemy by picking up your own.' },
  { id: 'gungame', name: 'Gun Game', short: 'GG', teams: 0, respawn: true, rounds: 0, objectives: [], sizes: ['S', 'M'], available: false,
    desc: 'Every kill moves you to the next weapon; the first to finish the ladder with the knife wins.' },
  { id: 'gunrush', name: 'Gun Rush', short: 'RUSH', teams: 2, respawn: true, rounds: 0, objectives: [], sizes: ['S', 'M'], available: false,
    desc: 'Team gun game: the whole team climbs the weapon ladder together.' },
  { id: 'infection', name: 'Infection', short: 'INF', teams: 2, respawn: true, rounds: 6, objectives: [], sizes: ['S', 'M', 'L'], available: false,
    desc: 'One infected hunts the rest with a knife; every victim joins them. Survive the round to win.' },
  { id: 'hideseek', name: 'Hide and Seek', short: 'H&S', teams: 2, respawn: false, rounds: 6, objectives: [], sizes: ['S', 'M', 'L'], available: false,
    desc: 'Hiders get a head start into closets, vents and bushes; seekers have the clock.' },
  { id: 'vip', name: 'VIP Escort', short: 'VIP', teams: 2, respawn: false, rounds: 12, objectives: ['vip'], sizes: ['M', 'L'], available: false,
    desc: 'Escort the VIP to an extraction point; the other team has to stop them.' },
  { id: 'juggernaut', name: 'Juggernaut', short: 'JUG', teams: 0, respawn: true, rounds: 0, objectives: [], sizes: ['S', 'M', 'L'], available: false,
    desc: 'One heavily armoured juggernaut against everyone; whoever kills them takes the suit.' },
  { id: 'oitc', name: 'One in the Chamber', short: 'OITC', teams: 0, respawn: true, rounds: 0, objectives: [], sizes: ['S', 'M'], available: false,
    desc: 'One bullet, one kill: every kill refills the chamber. Three lives.' },
  { id: 'sharpshooter', name: 'Sharpshooter', short: 'SHARP', teams: 0, respawn: true, rounds: 0, objectives: [], sizes: ['S', 'M', 'L'], available: false,
    desc: 'Everyone carries the same random weapon, rotating every 45 seconds.' },
  { id: 'headquarters', name: 'Headquarters', short: 'HQ', teams: 2, respawn: true, rounds: 0, objectives: ['zones'], sizes: ['M', 'L'], available: false,
    desc: 'Capture the HQ; while it is yours your team cannot respawn but scores every second.' },
  { id: 'snipers', name: 'Snipers Only', short: 'SNIPE', teams: 2, respawn: true, rounds: 0, objectives: [], sizes: ['M', 'L'], available: false,
    desc: 'Team deathmatch with bolt-action rifles only.' },
  { id: 'blades', name: 'Blades Only', short: 'BLADE', teams: 2, respawn: true, rounds: 0, objectives: [], sizes: ['S', 'M'], available: false,
    desc: 'Knives and tomahawks only. Watch your back.' },
  { id: 'hardcore', name: 'Hardcore', short: 'HC', teams: 2, respawn: true, rounds: 0, objectives: [], sizes: ['S', 'M', 'L'], available: false,
    desc: 'Team deathmatch with low health, no HUD and no crosshair.' },
  { id: 'practice', name: 'Practice', short: 'PRAC', teams: 2, respawn: true, rounds: 0, objectives: [], sizes: ['S', 'M', 'L'], available: true,
    desc: 'Free practice against bots: no time limit, quick respawns, infinite ammo by default.' },
];

export const getModeMeta = id => MODES.find(m => m.id === id) || null;
const cache = new Map(), loaded = new Map();
export function loadMode(id) {
  const meta = getModeMeta(id);
  if (!meta) return Promise.reject(new Error('Unknown mode "' + id + '"'));
  if (!meta.available) return Promise.reject(new Error(meta.name + ' is not available yet'));
  if (!cache.has(id)) cache.set(id, import('./' + id + '.js').then(m => { const def = { ...meta, ...m.default }; loaded.set(id, def); return def; }));
  return cache.get(id);
}
export const getMode = id => loaded.get(id) || null;
