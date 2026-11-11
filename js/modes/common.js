/* LIVE FIRE — shared helpers for the ModeDefs in js/modes/*.js (not a mode itself; js/modes/index.js never lists it).
   Exports:
     rows(game, sortFn?) -> score rows       ffaRows(game, key?)       teamHud(game, top, bottom)
     roamGoal(game, bot, urgency?) -> a 'hunt' goal toward a map point (rotates over time; no knowledge of enemy positions)
     elimination(game) -> { winner, reason } | null     standard last-team-standing check for round modes
     bombMode(over) -> ModeDef base for demolition / wingman / snd / retake (bomb setup, plant / defuse win rules, HUD clock, bot goals)
     spotNear(game, c, rmin, rmax, opts) -> spawn spot { x, y, z, yaw } on the navgrid in a distance band around c (retake etc.)
     fmt(s)  m:ss      ms(p) -> p.ms (mode stats)      info(game) -> game.objectives.s.info (per-game mode state: NEVER store
     per-game state on the ModeDef object, loadMode caches it for every match)
     BOLT_SNIPERS, MELEE_IDS */
import { giveOnly } from '../game/objectives.js';
import { hash } from '../core/util.js';

export const BOLT_SNIPERS = ['rook', 'arbiter', 'bjorn'];
export const MELEE_IDS = ['knife', 'zafra', 'ridgehawk'];
export const fmt = s => { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
export const ms = p => p.ms || (p.ms = {});
export const info = game => game.objectives.s.info;
export { giveOnly };

export function rows(game, sort) {
  const list = [...game.players.values()].filter(p => p.connected !== false);
  list.sort(sort || ((a, b) => b.score - a.score || b.kills - a.kills || a.deaths - b.deaths));
  return list.map(p => ({ id: p.id, name: p.name, team: p.team, score: p.score, kills: p.kills, deaths: p.deaths, assists: p.assists, mvps: p.mvps | 0, ms: { ...(p.ms || {}) } }));
}
export const ffaRows = (game, key) => rows(game, key ? (a, b) => ((b.ms && b.ms[key]) | 0) - ((a.ms && a.ms[key]) | 0) || b.kills - a.kills || a.deaths - b.deaths : (a, b) => b.kills - a.kills || a.deaths - b.deaths);

export function teamHud(game, top = '', bottom = '') {
  return { top, bottom, markers: game.objectives ? game.objectives.markers(game.local) : [] };
}

export function roamGoal(game, bot, urgency = 0.35) {
  const m = game.map || {}, pts = [];
  if (m.points) for (const k in m.points) pts.push(m.points[k]);
  if (m.sites) for (const k in m.sites) if (m.sites[k]) pts.push(m.sites[k]);
  const foe = m.spawns && m.spawns[bot.team === 1 ? 2 : bot.team === 2 ? 1 : 0];
  if (foe) for (const s of foe) if (s.field) pts.push(s);
  if (!pts.length) return null;
  const q = pts[(hash(bot.id) + Math.floor((game.time || 0) / 25)) % pts.length];
  return { kind: 'hunt', pos: { x: q.x, y: q.y || 0, z: q.z }, urgency };
}

export function elimination(game) {
  const m = game.match, n1 = m.teamPlayers(1).length, n2 = m.teamPlayers(2).length;
  if (!n1 || !n2) return null;
  const a1 = m.alive(1), a2 = m.alive(2);
  if (a1 === 0 && a2 === 0) return { winner: 2, reason: 'elimination' };
  if (a1 === 0) return { winner: 2, reason: 'elimination' };
  if (a2 === 0) return { winner: 1, reason: 'elimination' };
  return null;
}

/** Bomb-mode base: attackers (team 1) carry the charge to a site; defenders (team 2) stop the plant or defuse it. After a plant the
    round clock stops: the defenders must defuse even when every attacker is dead; the attackers win when the defenders are all
    dead or the charge goes off. */
export function bombMode(over = {}) {
  const base = {
    teams: 2, respawn: false, objectives: ['bomb'], elimination: true, sizes: ['M', 'L'], spawnProtect: 0, warmupTime: 0,
    roundEndTime: 6, halftimeTime: 8, overtime: { rounds: 6, money: 10000 },
    setup(game) { game.objectives.useBomb(this.bomb ? this.bomb(game) : {}); },
    checkWin(game) {
      const m = game.match, b = game.objectives.s.bomb, n1 = m.teamPlayers(1).length, n2 = m.teamPlayers(2).length;
      if (!n1 || !n2) return null;
      const a1 = m.alive(1), a2 = m.alive(2);
      if (b && b.state === 'planted') return a2 === 0 ? { winner: 1, reason: 'elimination' } : null;
      if (a1 === 0) return { winner: 2, reason: 'elimination' };
      if (a2 === 0) return { winner: 1, reason: 'elimination' };
      return null;
    },
    onRoundTime() { return { winner: 2, reason: 'time' }; },
    hud(game) {
      const O = game.objectives, b = O.s.bomb, me = game.local, att = me && me.team === 1;
      let top = '', bottom = '', clock = null;
      if (b) {
        if (b.state === 'planted') { clock = 'ARMED'; top = 'CHARGE PLANTED · SITE ' + b.site; bottom = att ? 'DEFEND THE CHARGE' : 'DEFUSE THE CHARGE'; }
        else if (b.state === 'defused') top = 'CHARGE DEFUSED';
        else if (b.state === 'exploded') top = 'TARGET DESTROYED';
        else if (att) {
          const c = O.bombHolder();
          top = b.state === 'dropped' ? 'THE CHARGE IS DROPPED' : c ? (c === me ? 'YOU CARRY THE CHARGE' : 'CHARGE: ' + c.name.toUpperCase()) : '';
          bottom = 'PLANT AT ' + O.cfg.bomb.sites.join(' OR ');
        } else { top = 'DEFEND SITE' + (O.cfg.bomb.sites.length > 1 ? 'S ' : ' ') + O.cfg.bomb.sites.join(' + '); }
      }
      return { top, bottom, clock, clockAlert: clock != null, markers: O.markers(me) };
    },
    score(game) { return rows(game); },
    botGoal(game, bot) { return game.objectives.botGoal(bot) || roamGoal(game, bot); },
  };
  return Object.assign(base, over);
}

/** A spawn spot on the navgrid between rmin and rmax (horizontal metres) from c, within dy of c.y when given, away from `used`
    spots (>= 1.6 m), outside both lobbies, facing `face` (a point) or away from c. Falls back to null (the default spawn). */
export function spotNear(game, c, rmin, rmax, o = {}) {
  const nav = game.map && game.map.nav; if (!nav || !nav.randomNode) return null;
  const used = o.used || [], L = (game.map && game.map.lobbies) || {}, P = { x: 0, y: 0, z: 0 };
  const inLobby = q => [1, 2].some(t => L[t] && q.x > L[t].x0 - 0.5 && q.x < L[t].x1 + 0.5 && q.z > L[t].z0 - 0.5 && q.z < L[t].z1 + 0.5);
  const rng = game.rng || Math.random;
  const c0 = nav.nearest ? nav.nearest(c.x, (c.y || 0) + 0.5, c.z, 6) : -1, comp = c0 >= 0 && nav.component ? nav.component(c0) : null;
  for (let k = 0; k < 6; k++) {
    const i = nav.randomNode(rng, j => {
      nav.nodePos(j, P);
      const d = Math.hypot(P.x - c.x, P.z - c.z);
      if (d < rmin || d > rmax) return false;
      if (o.dy != null && c.y != null && Math.abs(P.y - c.y) > o.dy) return false;
      if (nav.isCrouchOnly && nav.isCrouchOnly(j)) return false;
      if (comp != null && nav.component(j) !== comp) return false;
      if (inLobby(P)) return false;
      return !used.some(u => Math.hypot(u.x - P.x, u.z - P.z) < 1.6);
    });
    if (i >= 0) {
      const q = nav.nodePos(i, { x: 0, y: 0, z: 0 });
      const f = o.face || c, away = !o.face;
      const yaw = away ? Math.atan2(q.x - c.x, q.z - c.z) : Math.atan2(f.x - q.x, f.z - q.z);
      const spot = { x: q.x, y: q.y, z: q.z, yaw };
      used.push(spot);
      return spot;
    }
  }
  return null;
}
