/* LIVE FIRE — Headquarters (ModeDef, docs §8): one HQ at a time (map points hq1.., then dom / hill / hp points in turn). Capture it
   (8 s alone); while it is yours your team scores 1 point per second but CANNOT respawn. The enemy destroys it by standing in it
   (drain + capture back to neutral): the HQ goes down, the defenders respawn and a new HQ comes online 10 s later. An HQ held for
   60 s relocates by itself. 10 minutes, first to 250.
   Exports: default ModeDef */
import { rows, teamHud, info, fmt } from './common.js';

const HELD_MAX = 60, RELOC = 10;
export default {
  id: 'headquarters', name: 'Headquarters', teams: 2, respawn: true, respawnDelay: 4, rounds: 0, winRounds: 0, roundTime: 0, freezeTime: 5,
  buyTime: 0, economy: false, loadouts: true, timeLimit: 600, scoreLimit: 250, maxPlayers: 16, minPlayers: 2, objectives: ['zones'],
  sizes: ['M', 'L'], spawnProtect: 2, warmupTime: 0, teamScoreOnKill: false,
  columns: [{ key: 'caps', label: 'CAPS' }],
  setup(game) {
    const P = (game.map && game.map.points) || {};
    const keys = [...Object.keys(P).filter(k => /^hq\d+$/.test(k)).sort(), ...['dom2', 'hill', 'dom1', 'dom3', 'hp1', 'hp2', 'hp3', 'hp4', 'hp5'].filter(k => P[k])];
    const uniq = [...new Set(keys)];
    const I = info(game); I.hq = { i: 0, reloc: 0, held: 0 };
    game.objectives.useZones(uniq.map((k, i) => ({ id: 'HQ' + (i + 1), label: 'HQ', point: k, active: i === 0, r: 3.5 })), {
      capTime: 8,
      onNeutral: (z, lost) => {                       // destroyed by the enemy
        z.active = false; I.hq.reloc = RELOC; I.hq.held = 0;
        game.objectives.emit('destroyed', 'zone', { zone: z.id, team: 3 - lost, lost });
        for (const p of game.players.values()) if (p.team === lost && !p.alive && p.respawnT > 0) p.respawnT = Math.min(p.respawnT, 1);
      },
      onCapture: () => { I.hq.held = 0; },
    });
    const T = game.objectives.s.team; T[1].acc = 0; T[2].acc = 0;
  },
  tick(game, dt) {
    const O = game.objectives, Z = O.s.zones, I = info(game).hq, T = O.s.team;
    if (!Z.length) return;
    if (I.reloc > 0) {
      I.reloc -= dt;
      if (I.reloc <= 0) { I.i = (I.i + 1) % Z.length; const z = Z[I.i]; z.active = true; z.owner = 0; z.c = 0; O.emit('moved', 'zone', { zone: z.id }); }
      return;
    }
    const z = Z[I.i];
    if (z && z.owner) {
      I.held += dt; T[z.owner].acc += dt;
      while (T[z.owner].acc >= 1 && game.match.phase === 'live') { T[z.owner].acc -= 1; game.match.addScore(z.owner, 1); }
      if (I.held >= HELD_MAX) { z.active = false; z.owner = 0; z.c = 0; I.reloc = 5; I.held = 0; O.emit('moved', 'zone', { zone: z.id, timeout: true }); }
    }
  },
  canRespawn(game, p) {
    const Z = game.objectives.s.zones, I = info(game).hq, z = Z && Z[I.i];
    const blocked = !!(z && z.active && z.owner === p.team);
    p.respawnWait = blocked ? 'YOUR HQ IS UP · NO RESPAWNS' : null;
    return !blocked;
  },
  hud(game) {
    const O = game.objectives, I = info(game).hq, z = O.s.zones[I.i], me = game.local;
    let st = '';
    if (I.reloc > 0) st = 'NEW HQ IN ' + fmt(I.reloc);
    else if (z) st = z.contested ? 'HQ CONTESTED' : z.owner ? (me && z.owner === me.team ? 'HQ HELD · NO RESPAWNS · ' + fmt(HELD_MAX - I.held) : 'DESTROY THE ENEMY HQ') : 'CAPTURE THE HQ';
    return teamHud(game, st);
  },
  score: g => rows(g),
  botGoal(game, bot) {
    const I = info(game).hq;
    if (I.reloc > 0) return { kind: 'roam', pos: null, urgency: 0.2 };
    return game.objectives.botGoal(bot);
  },
};
