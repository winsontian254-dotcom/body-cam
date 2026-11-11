/* LIVE FIRE — Hardpoint (ModeDef, docs §8): ONE zone at a time (map points hp1-hp5 in order), moving every 60 s (the next one is
   announced 10 s before). A team scores 1 point per second while it holds the zone ALONE (no capture time; any enemy inside
   contests it and stops the clock). Respawns, 10 minutes, first to 250.
   Exports: default ModeDef */
import { rows, teamHud, info, fmt } from './common.js';

const ROTATE = 60;
export default {
  id: 'hardpoint', name: 'Hardpoint', teams: 2, respawn: true, respawnDelay: 4, rounds: 0, winRounds: 0, roundTime: 0, freezeTime: 5,
  buyTime: 0, economy: false, loadouts: true, timeLimit: 600, scoreLimit: 250, maxPlayers: 16, minPlayers: 2, objectives: ['zones'],
  sizes: ['M', 'L'], spawnProtect: 2, warmupTime: 0, teamScoreOnKill: false,
  columns: [{ key: 'hpT', label: 'TIME', get: p => Math.round((p.ms && p.ms.hpT) || 0) }],
  setup(game) {
    const P = (game.map && game.map.points) || {}, ids = Object.keys(P).filter(k => /^hp\d+$/.test(k)).sort((a, b) => +a.slice(2) - +b.slice(2));
    const list = (ids.length ? ids : ['dom1', 'dom2', 'dom3'].filter(k => P[k])).map((k, i) => ({ id: 'P' + (i + 1), label: 'P' + (i + 1), point: k, active: i === 0 }));
    game.objectives.useZones(list, { instant: true });
    const I = info(game); I.hp = { i: 0, t: ROTATE }; const T = game.objectives.s.team; T[1].acc = 0; T[2].acc = 0;
  },
  tick(game, dt) {
    const O = game.objectives, Z = O.s.zones, I = info(game).hp, T = O.s.team;
    if (!Z.length) return;
    I.t -= dt;
    if (I.t <= 0) {
      Z[I.i].active = false; Z[I.i].owner = 0; Z[I.i].c = 0;
      I.i = (I.i + 1) % Z.length; I.t = ROTATE; Z[I.i].active = true;
      O.emit('moved', 'zone', { zone: Z[I.i].id });
    }
    const z = Z[I.i];
    if (z.owner && !z.contested) {
      T[z.owner].acc += dt;
      for (const p of game.players.values()) if (p.alive && p.team === z.owner && O.inZone(z, p)) { p.ms = p.ms || {}; p.ms.hpT = (p.ms.hpT || 0) + dt; p.score += dt * 0.5; }
      while (T[z.owner].acc >= 1 && game.match.phase === 'live') { T[z.owner].acc -= 1; game.match.addScore(z.owner, 1); }
    }
  },
  hud(game) {
    const O = game.objectives, I = info(game).hp, z = O.s.zones[I.i], me = game.local;
    const st = !z ? '' : z.contested ? 'CONTESTED' : z.owner ? (me && z.owner === me.team ? 'HOLDING ' + z.label : 'ENEMY HOLDS ' + z.label) : z.label + ' IS OPEN';
    return { ...teamHud(game, st + ' · MOVES IN ' + fmt(I.t)), bottom: I.t < 10 ? 'HARDPOINT MOVING' : '' };
  },
  score: g => rows(g),
  botGoal(game, bot) { return game.objectives.botGoal(bot); },
};
