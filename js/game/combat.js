/* LIVE FIRE — hitscan fire, wall penetration, the damage model, friendly-fire rule, kill credit, melee. PURE JS (no BABYLON).
   Exports:
     SURF_RES                 penetration cost per METRE of material (gun.pen points), by surface
     FLESH_RES                pen points a bullet loses going through a player
     MAX_RANGE                bullets travel this far (m)
     SELF_KINDS               damage kinds that may hurt their own attacker (own explosives / fire)
     fireShot(game, shooter, stats, origin, dir, opts?) -> { end: {x,y,z}, dist, hits: [{ victim, group, dmg, point }], walls, stop }
         one bullet / pellet: raycastAll through the world + hitbox capsules of every live player, sorted; each wall costs
         thickness * SURF_RES[surf] of stats.pen and damage scales by the pen left; a player costs FLESH_RES; at most 2 players
         and 4 walls. Damage = dmg * falloff^(dist / 10) * GROUP_MULT[group] * penLeft / pen. Emits 'impact' (entry and exit
         holes) and 'whiz' (bullet passed within 1.6 m of a live player's head). opts: { noscope, pellet: index, quiet }
     meleeAttack(game, p, kind 'slash'|'stab', spec, weaponId) -> { victim, backstab, dmg } | null   (fan test + LOS; impact on miss)
     applyDamage(game, victim, info) -> health damage dealt          (game.damage() is this; THE only way to hurt anyone)
         info = { attacker (PlayerState | id | null), dmg (raw, before armour), group = 'chest', kind = 'bullet'|'melee'|'blast'|
                  'fire'|'gas'|'fall'|'world', weapon, armorPen = 1, point, dir, dist, wallbang, noscope, smoke, backstab,
                  effects: { flash (s), stun (s), slow: { tag, mul, secs } }, confirmed (host-applied claim) }
         Friendly fire OFF: damage AND effects from a teammate (team > 0) are dropped. Self-damage only for SELF_KINDS.
         Spawn protection blocks everything but fall / world damage. Armour (0..100, not legs) and the helmet (head) take
         health damage down to dmg * armorPen; the armour pool loses half of what it absorbed (docs §4). On a client the
         local attacker's hits become claims (game.net.claimHit) and nothing is applied locally.
     killPlayer(game, victim, info)   death, kill credit (last attacker; fall / world deaths within 5 s of a hit credit the
         hitter), assist (>= 40 damage in the last 10 s, the biggest enemy contributor), stats, 'kill' event, mode hook
     smokeBetween(game, a, b) -> bool   segment crosses an active smoke blocker (navgrid blockers only, no world ray)
   Events (game.bus): 'impact' { point, normal, surf, gun, exit, shooter, dir, id (collider), melee, pellets }  'whiz' { p, point, from }
     'hit' { attacker, victim, dmg, group, headshot, armor, kill, kind, weapon, point, dir, predicted }
     'damage' { victim, dmg, from, dir, kind }   'kill' { killer, victim, assister, weapon, headshot, wallbang, noscope, smoke,
     flash, backstab, kind, suicide, killerId, victimId, assisterId } */
import { raycastAll, raycast } from '../phys/ray.js';
import { eyePos, MOVE, applySlow } from '../phys/move.js';
import { raycastPlayer, aimPoint, GROUP_MULT } from './hitbox.js';
import { isEnemy } from './player.js';

export const SURF_RES = {
  glass: 0.6, fabric: 1.2, carpet: 1.5, rubber: 2.5, wood: 2.2, plaster: 3.0, sheetmetal: 7, tile: 6, brick: 6.5,
  concrete: 9, asphalt: 12, metal: 22, dirt: 12, mud: 12, gravel: 13, sand: 14, snow: 8, grass: 12, water: 4,
};
export const FLESH_RES = 0.6;
export const MAX_RANGE = 600;
export const SELF_KINDS = new Set(['blast', 'fire', 'gas', 'fall', 'world']);
const ARMORED_KINDS = new Set(['bullet', 'melee', 'blast']);
const MAX_WALLS = 4, MAX_VICTIMS = 2, MAX_THICK = 2.5;

const ORIG = { x: 0, y: 0, z: 0 };
const EYE = { x: 0, y: 0, z: 0 }, PT = { x: 0, y: 0, z: 0 };
const HIT = { t: 0, shape: 0, group: 'chest', x: 0, y: 0, z: 0 };
const RAY_OUT = { out: { hit: false, dist: 0, point: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 0, z: 0 }, surf: null, id: -1 } };

const resolveP = (game, a) => (a == null ? null : typeof a === 'object' ? a : game.players.get(a) || null);

export function smokeBetween(game, a, b) {
  const nav = game.map && game.map.nav; if (!nav || !nav.blockers || !nav.blockers.length) return false;
  for (const k of nav.blockers) {
    if (k.active === false) continue;
    if (k.test) { if (k.test(a.x, a.y, a.z, b.x, b.y, b.z)) return true; continue; }
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, L2 = dx * dx + dy * dy + dz * dz;
    let t = L2 > 0 ? ((k.x - a.x) * dx + (k.y - a.y) * dy + (k.z - a.z) * dz) / L2 : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
    const px = a.x + dx * t - k.x, py = a.y + dy * t - k.y, pz = a.z + dz * t - k.z;
    if (px * px + py * py + pz * pz < k.r * k.r) return true;
  }
  return false;
}

/** One bullet (or pellet). Pure hit logic + damage; the caller (weapon.js) emits the 'shot' event with the traces. */
export function fireShot(game, shooter, stats, origin, dir, opts = {}) {
  const world = game.world, stamp = game.tick;
  const walls = raycastAll(world, origin, dir, MAX_RANGE);
  // players on the line (one entry per player: the first shape the ray enters)
  const cand = game._candScratch || (game._candScratch = []);
  cand.length = 0;
  for (const q of game.players.values()) {
    if (q === shooter || !q.alive) continue;
    const h = raycastPlayer(q, origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, MAX_RANGE, stamp, HIT);
    if (h) cand.push({ t: h.t, q, group: h.group, shape: h.shape, x: h.x, y: h.y, z: h.z });
  }
  if (cand.length > 1) cand.sort((a, b) => a.t - b.t);
  const pen0 = Math.max(0, stats.pen || 0);
  let pen = pen0, power = 1, iw = 0, ip = 0, nWalls = 0, nVict = 0, end = MAX_RANGE, stop = null;
  const hits = [];
  const gunId = stats.id;
  while (true) {
    const w = iw < walls.length ? walls[iw] : null, c = ip < cand.length ? cand[ip] : null;
    const dw = w ? w.dist : Infinity, dp = c ? c.t : Infinity;
    if (dp === Infinity && dw === Infinity) break;
    if (dp <= dw) {
      ip++;
      const q = c.q;
      if (!q.alive) continue;
      const fall = Math.pow(stats.falloff || 0.9, c.t / 10);
      const dmg = (stats.dmg || 0) * fall * (GROUP_MULT[c.group] || 1) * power;
      ORIG.x = c.x; ORIG.y = c.y; ORIG.z = c.z;
      const smoke = smokeBetween(game, origin, ORIG);
      const dealt = applyDamage(game, q, { attacker: shooter, dmg, group: c.group, kind: 'bullet', weapon: gunId, armorPen: stats.armorPen,
        point: { x: c.x, y: c.y, z: c.z }, dir: { x: dir.x, y: dir.y, z: dir.z }, dist: c.t, wallbang: nWalls > 0, noscope: !!opts.noscope, smoke });
      hits.push({ victim: q, group: c.group, dmg: dealt, point: { x: c.x, y: c.y, z: c.z }, dist: c.t, wallbang: nWalls > 0 });
      if (game.bus) game.bus.emit('bullet:body', { point: { x: c.x, y: c.y, z: c.z }, dir: { x: dir.x, y: dir.y, z: dir.z }, victim: q, group: c.group, dmg: dealt, friendly: !isEnemy(shooter, q) });
      nVict++;
      pen -= FLESH_RES;
      if (pen <= 0 || nVict >= MAX_VICTIMS) { end = c.t; stop = 'body'; break; }
      power = pen0 > 0 ? pen / pen0 : 0;
      continue;
    }
    iw++;
    // entry hole
    if (game.bus && !opts.quiet) game.bus.emit('impact', { point: w.point, normal: w.normal, surf: w.surf, gun: gunId, exit: false, shooter, dir, id: w.id, pellets: stats.pellets || 1 });
    const thick = Math.min(MAX_THICK + 1, (w.exitDist === Infinity ? 99 : w.exitDist) - w.dist);
    const cost = thick > MAX_THICK ? Infinity : thick * (SURF_RES[w.surf] ?? 9);
    if (cost >= pen || nWalls >= MAX_WALLS) { end = w.dist; stop = w.surf; break; }
    pen -= cost; power = pen0 > 0 ? pen / pen0 : 0; nWalls++;
    if (game.bus && !opts.quiet) {
      const ex = w.exitDist;
      game.bus.emit('impact', { point: { x: origin.x + dir.x * ex, y: origin.y + dir.y * ex, z: origin.z + dir.z * ex },
        normal: { x: dir.x, y: dir.y, z: dir.z }, surf: w.surf, gun: gunId, exit: true, shooter, dir, id: w.id, pellets: stats.pellets || 1 });
    }
    // skip colliders that start inside this one (touching pieces of the same wall)
    while (iw < walls.length && walls[iw].dist < w.exitDist - 1e-3 && walls[iw].exitDist <= w.exitDist + 1e-3) iw++;
  }
  const res = { end: { x: origin.x + dir.x * end, y: origin.y + dir.y * end, z: origin.z + dir.z * end }, dist: end, hits, walls: nWalls, stop };
  // near misses (audio crack, bot awareness)
  if (game.bus && !opts.quiet) {
    for (const q of game.players.values()) {
      if (q === shooter || !q.alive) continue;
      if (hits.length && hits.some(h => h.victim === q)) continue;
      eyePos(q, EYE);
      const ox = EYE.x - origin.x, oy = EYE.y - origin.y, oz = EYE.z - origin.z;
      const t = ox * dir.x + oy * dir.y + oz * dir.z;
      if (t < 2 || t > end) continue;
      const px = ox - dir.x * t, py = oy - dir.y * t, pz = oz - dir.z * t, d2 = px * px + py * py + pz * pz;
      if (d2 < 1.6 * 1.6) game.bus.emit('whiz', { p: q, point: { x: origin.x + dir.x * t, y: origin.y + dir.y * t, z: origin.z + dir.z * t }, from: shooter, dist: Math.sqrt(d2) });
    }
  }
  return res;
}

/** Knife / melee: a fan test in front of the attacker. */
export function meleeAttack(game, p, kind, spec, weaponId) {
  const s = kind === 'stab' ? spec.stab : spec.slash;
  if (!s) return null;
  eyePos(p, EYE);
  const yaw = p.yaw, pitch = p.pitch, cp = Math.cos(pitch);
  const fx = Math.sin(yaw) * cp, fy = -Math.sin(pitch), fz = Math.cos(yaw) * cp;
  const arc = (s.arc || spec.slash.arc || 0.8) * 0.5 + 0.12, range = s.range || 1.5;
  let best = null, bestD = Infinity;
  for (const q of game.players.values()) {
    if (q === p || !q.alive) continue;
    for (const part of ['chest', 'head', 'pelvis']) {
      aimPoint(q, part, PT, game.tick);
      const vx = PT.x - EYE.x, vy = PT.y - EYE.y, vz = PT.z - EYE.z, d = Math.hypot(vx, vy, vz);
      if (d > range + 0.3 || d < 1e-3) continue;
      const hd = Math.hypot(vx, vz), hf = Math.hypot(fx, fz) || 1;
      const cosH = hd > 1e-3 ? (vx * fx + vz * fz) / (hd * hf) : 1;
      if (cosH < Math.cos(arc)) continue;
      const vang = Math.atan2(vy, hd) - Math.atan2(fy, hf);
      if (Math.abs(vang) > 0.85) continue;
      RAY_OUT.ignore = null;
      const dir = { x: vx / d, y: vy / d, z: vz / d };
      const r = raycast(game.world, EYE, dir, d, RAY_OUT);
      if (r.hit) continue;
      if (d < bestD) { bestD = d; best = { q, part, x: PT.x, y: PT.y, z: PT.z, dir }; }
      break;
    }
  }
  if (!best) {
    // swing into the world: sparks / sound
    const dir = { x: fx, y: fy, z: fz };
    const r = raycast(game.world, EYE, dir, range, RAY_OUT);
    if (r.hit && game.bus) game.bus.emit('impact', { point: { ...r.point }, normal: { ...r.normal }, surf: r.surf, gun: weaponId, exit: false, shooter: p, melee: true, dir, id: r.id });
    return null;
  }
  const q = best.q;
  // backstab: the attacker stands behind the victim (more than 110 degrees off the victim's facing)
  const bx = p.pos.x - q.pos.x, bz = p.pos.z - q.pos.z, bl = Math.hypot(bx, bz) || 1;
  const facing = (Math.sin(q.yaw) * bx + Math.cos(q.yaw) * bz) / bl;
  const backstab = facing < Math.cos(110 * Math.PI / 180);
  const dmg = backstab ? (s.back || s.dmg) : s.dmg;
  const dealt = applyDamage(game, q, { attacker: p, dmg, group: best.part === 'head' ? 'head' : 'chest', kind: 'melee', weapon: weaponId,
    armorPen: spec.armorPen ?? 0.85, point: { x: best.x, y: best.y, z: best.z }, dir: best.dir, dist: bestD, backstab, noMult: true });
  if (game.bus) game.bus.emit('bullet:body', { point: { x: best.x, y: best.y, z: best.z }, dir: best.dir, victim: q, group: 'chest', dmg: dealt, melee: true, friendly: !isEnemy(p, q) });
  return { victim: q, backstab, dmg: dealt };
}

/** THE damage entry point (game.damage). Returns the health damage dealt. */
export function applyDamage(game, victim, info) {
  if (!victim || !victim.alive || !info) return 0;
  const att = resolveP(game, info.attacker);
  const kind = info.kind || 'bullet';
  // friendly fire is OFF in every mode: teammates' damage and effects are dropped
  if (att && att !== victim && att.team > 0 && att.team === victim.team) return 0;
  if (att && att === victim && !SELF_KINDS.has(kind)) return 0;
  if (victim.spawnProtect > 0 && kind !== 'fall' && kind !== 'world') return 0;
  if (game.options && game.options.god && victim.local && kind !== 'world') return 0;
  // a client does not apply damage: its own hits are sent as claims, the host's verdict comes back as events
  if (game.authority === 'client' && !info.confirmed) {
    if (att && att.local && game.net && game.net.claimHit) game.net.claimHit(victim, info);
    if (att && att.local && game.bus) game.bus.emit('hit', { attacker: att, victim, dmg: Math.round(info.dmg || 0), group: info.group || 'chest',
      headshot: info.group === 'head', armor: false, kill: false, kind, weapon: info.weapon, point: info.point, dir: info.dir, predicted: true });
    return 0;
  }
  const fx = info.effects;
  if (fx) {
    if (fx.flash > 0) victim.flash = Math.max(victim.flash || 0, fx.flash);
    if (fx.stun > 0) victim.stun = Math.max(victim.stun || 0, fx.stun);
    if (fx.slow) applySlow(victim, fx.slow.tag || kind, fx.slow.mul ?? 0.5, fx.slow.secs ?? 1);
  }
  const raw = +info.dmg || 0;
  if (!(raw > 0)) return 0;
  const group = info.group || 'chest';
  let h = raw, armored = false;
  if (ARMORED_KINDS.has(kind)) {
    const ap = info.armorPen ?? 1;
    if (group === 'head') { if (victim.helmet) { h = raw * ap; armored = true; } }
    else if (group !== 'leg' && victim.armor > 0) {
      h = raw * ap; armored = true;
      let loss = (raw - h) / 2;
      if (loss > victim.armor) { h += (loss - victim.armor) * 2; loss = victim.armor; }
      victim.armor = Math.max(0, Math.round((victim.armor - loss) * 10) / 10);
    }
  }
  const hpDmg = Math.max(1, Math.round(h));
  const dealt = Math.min(victim.hp, hpDmg);
  victim.hp -= hpDmg;
  const t = game.time || 0;
  if (att && att !== victim) {
    const rec = victim.dmgBy[att.id] || (victim.dmgBy[att.id] = { d: 0, t: 0 });
    rec.d += dealt; rec.t = t;
    victim.lastAttacker = att.id;
    att.damageDone += dealt; att.life.dmg += dealt; att.stat.hits++;
  }
  victim.lastHurtT = t;
  if (kind === 'bullet' || kind === 'melee') victim.tagged = MOVE.tagTime;
  const kill = victim.hp <= 0;
  if (game.bus) {
    game.bus.emit('hit', { attacker: att, victim, dmg: dealt, group, headshot: group === 'head', armor: armored, kill, kind, weapon: info.weapon,
      point: info.point, dir: info.dir });
    game.bus.emit('damage', { victim, dmg: dealt, from: att, dir: info.dir, kind, point: info.point });
  }
  if (kill) killPlayer(game, victim, info);
  return dealt;
}

export function killPlayer(game, victim, info = {}) {
  if (!victim.alive) return null;
  victim.alive = false; victim.hp = 0; victim.deaths++; victim.deadT = 0; victim.lean = 0;
  const t = game.time || 0;
  let killer = resolveP(game, info.attacker);
  const kind = info.kind || 'bullet';
  if ((!killer || killer === victim) && (kind === 'fall' || kind === 'world') && victim.lastAttacker != null && t - victim.lastHurtT < 5) {
    const k2 = game.players.get(victim.lastAttacker); if (k2 && isEnemy(k2, victim)) killer = k2;
  }
  const suicide = !killer || killer === victim;
  let assister = null, best = 39.999;
  for (const id in victim.dmgBy) {
    const r = victim.dmgBy[id], q = game.players.get(id);   // player ids are strings
    if (!q || q === killer || q === victim || !isEnemy(q, victim)) continue;
    if (t - r.t <= 10 && r.d > best) { best = r.d; assister = q; }
  }
  const headshot = info.group === 'head' && (kind === 'bullet');
  if (!suicide && isEnemy(killer, victim)) {
    killer.kills++; killer.life.kills++;
    if (headshot) killer.headshots++;
  }
  if (assister) assister.assists++;
  const ev = { killer: suicide ? null : killer, victim, assister, weapon: info.weapon || kind, headshot, wallbang: !!info.wallbang,
    noscope: !!info.noscope, smoke: !!info.smoke, flash: !!(killer && !suicide && killer.flash > 0.3), backstab: !!info.backstab, kind, suicide,
    killerId: suicide ? null : killer.id, victimId: victim.id, assisterId: assister ? assister.id : null, time: t };
  if (game.bus) game.bus.emit('kill', ev);
  if (game.onKill) game.onKill(ev);
  return ev;
}
