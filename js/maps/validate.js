/* LIVE FIRE — map checks (docs §7). PURE JS (works on a MapInfo in the browser and in Node).
   Exports:
     validateMap(info, opts?) -> { ok, errors: [string], warnings: [string], stats }
     REQUIRED = { lobbySpawns: 10, fieldSpawns: 8, ffaSpawns: 16, hides: 10, hostages: 4, points: [...] }
   Checks: spawns free (player cylinder) and on the ground, spaced apart, lobby spawns inside their lobby; lobbies exist, have
   gates and are sealed while the gates are closed (no navgrid path out) but open onto the map when they open; every spawn,
   site, hostage, rescue zone, point and hide reachable on the navgrid from BOTH teams' lobbies (gates open); required markers
   present; markers inside the bounds. Messages carry coordinates so map authors can find the spot. */
import { MOVE } from '../phys/move.js';

export const REQUIRED = {
  lobbySpawns: 10, fieldSpawns: 8, ffaSpawns: 16, hides: 10, hostages: 4,
  points: ['dom1', 'dom2', 'dom3', 'hp1', 'hp2', 'hp3', 'hp4', 'hill', 'flag1', 'flag2', 'extract1'],
};

const f1 = v => (Math.round(v * 10) / 10).toFixed(1);
const at = p => '(' + f1(p.x) + ', ' + f1(p.y == null ? 0 : p.y) + ', ' + f1(p.z) + ')';

export function validateMap(info, opts = {}) {
  const errors = [], warnings = [];
  const W = info.world, nav = info.nav, R = MOVE.radius, H = MOVE.height;
  const err = m => errors.push(m), warn = m => warnings.push(m);
  for (const w of info.warnings || []) warn('builder: ' + w);
  const b = info.bounds;
  const inBounds = p => !b || (p.x > b.minX && p.x < b.maxX && p.z > b.minZ && p.z < b.maxZ && (b.minY == null || p.y >= b.minY - 1) && (b.maxY == null || p.y <= b.maxY));
  const G = {}, ids = [];
  const free = (p, what) => {
    // from 20 cm up: a slope or a curb under the feet is fine (the ground check below catches standing inside low boxes)
    W.overlapCylinder(p.x, p.y + 0.2, p.z, R, H - 0.22, ids);
    if (ids.length) { const c = W.get(ids[0]); err(what + ' at ' + at(p) + ' is inside a collider (id ' + ids[0] + (c && c.tag ? ', tag ' + c.tag : '') + (c ? ', ' + c.surf : ', terrain') + ')'); return false; }
    const g = W.groundAt(p.x, p.z, p.y + 0.3, R * 0.9, G);
    if (!g || Math.abs(g.y - p.y) > 0.08) { err(what + ' at ' + at(p) + ' is not on the ground' + (g ? ' (ground at y ' + f1(g.y) + ')' : ' (nothing below)')); return false; }
    return true;
  };
  const nodeOf = (p, what, maxR = 1.2) => {
    if (!nav) return -1;
    const n = nav.nearest(p.x, p.y == null ? 0 : p.y, p.z, maxR);
    if (n < 0) { err(what + ' at ' + at(p) + ' has no walkable navgrid node within ' + maxR + ' m'); return -1; }
    const q = nav.nodePos(n);
    if (Math.abs(q.y - (p.y == null ? q.y : p.y)) > 1.2) { warn(what + ' at ' + at(p) + ': nearest walkable node is ' + f1(q.y - p.y) + ' m away vertically'); }
    return n;
  };
  const inRect = (p, r, m = 0) => p.x >= r.x0 - m && p.x <= r.x1 + m && p.z >= r.z0 - m && p.z <= r.z1 + m;

  // ---------------------------------------------------------------- spawns
  const sp = info.spawns || { 0: [], 1: [], 2: [] };
  const lobbySp = { 1: [], 2: [] }, fieldSp = { 1: [], 2: [] };
  for (const t of [1, 2]) for (const s of sp[t] || []) (s.field ? fieldSp : lobbySp)[t].push(s);
  for (const t of [1, 2]) {
    if (lobbySp[t].length < REQUIRED.lobbySpawns) err('team ' + t + ' has ' + lobbySp[t].length + ' lobby spawns (needs >= ' + REQUIRED.lobbySpawns + ')');
    if (fieldSp[t].length < REQUIRED.fieldSpawns) err('team ' + t + ' has ' + fieldSp[t].length + ' field spawns (needs >= ' + REQUIRED.fieldSpawns + ')');
  }
  if ((sp[0] || []).length < REQUIRED.ffaSpawns) err('FFA (team 0) has ' + (sp[0] || []).length + ' spawns (needs >= ' + REQUIRED.ffaSpawns + ')');
  const all = [];
  for (const t of [0, 1, 2]) for (const s of sp[t] || []) {
    const what = (t ? 'team ' + t + (s.field ? ' field' : ' lobby') : 'FFA') + ' spawn';
    all.push({ s, what, t });
    if (!inBounds(s)) err(what + ' at ' + at(s) + ' is outside the map bounds');
    free(s, what);
    if (!Number.isFinite(s.yaw)) err(what + ' at ' + at(s) + ' has no yaw');
  }
  // spacing within a group (players spawning inside each other)
  const groups = [sp[0] || [], lobbySp[1], lobbySp[2], fieldSp[1], fieldSp[2]];
  for (const g of groups) for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) {
    const a = g[i], c = g[j];
    if (Math.hypot(a.x - c.x, a.z - c.z) < 2 * R + 0.1 && Math.abs(a.y - c.y) < H) err('spawns ' + at(a) + ' and ' + at(c) + ' overlap (' + f1(Math.hypot(a.x - c.x, a.z - c.z)) + ' m apart)');
  }
  // field spawns spread over their half
  for (const t of [1, 2]) {
    const g = fieldSp[t]; if (g.length < 2) continue;
    let mx = 0; for (const a of g) for (const c of g) mx = Math.max(mx, Math.hypot(a.x - c.x, a.z - c.z));
    if (mx < 15) warn('team ' + t + ' field spawns all lie within ' + f1(mx) + ' m of each other (spread them over the team\'s half)');
  }

  // ---------------------------------------------------------------- lobbies
  const L = info.lobbies || {};
  for (const t of [1, 2]) {
    const lb = L[t];
    if (!lb) { err('team ' + t + ' has no lobby (B.lobby)'); continue; }
    if (!lb.gates || !lb.gates.length) err('team ' + t + ' lobby has no gates');
    for (const s of lobbySp[t]) if (!inRect(s, lb, 0.3)) err('team ' + t + ' lobby spawn at ' + at(s) + ' is outside its lobby rect');
    if (!(info.buyzones && info.buyzones[t] && info.buyzones[t].length)) warn('team ' + t + ' has no buy zone');
  }
  // ---------------------------------------------------------------- required markers
  if (!info.sites || !info.sites.A) err('bomb site A is missing'); if (!info.sites || !info.sites.B) err('bomb site B is missing');
  for (const k in info.sites || {}) { const s = info.sites[k]; const area = (s.x1 - s.x0) * (s.z1 - s.z0); if (area < 16) warn('site ' + k + ' is only ' + f1(area) + ' m2'); }
  if ((info.hostages || []).length < REQUIRED.hostages) err((info.hostages || []).length + ' hostages (needs >= ' + REQUIRED.hostages + ')');
  if (!info.rescue) err('hostage rescue zone is missing (B.rescue)');
  for (const k of REQUIRED.points) if (!info.points || !info.points[k]) err('point "' + k + '" is missing (B.point)');
  if ((info.hides || []).length < REQUIRED.hides) err((info.hides || []).length + ' hiding spots (needs >= ' + REQUIRED.hides + ')');
  for (const h of info.hostages || []) { if (!inBounds(h)) err('hostage at ' + at(h) + ' is outside the bounds'); free(h, 'hostage'); }
  for (const k in info.points || {}) if (!inBounds(info.points[k])) err('point ' + k + ' at ' + at(info.points[k]) + ' is outside the bounds');

  // ---------------------------------------------------------------- navgrid reachability
  const stats = { spawns: all.length, hides: (info.hides || []).length, nodes: nav ? nav.nodeCount : 0 };
  if (!nav) { warn('no navgrid: reachability not checked'); }
  else {
    const seeds = { 1: [], 2: [] };
    for (const t of [1, 2]) for (const s of lobbySp[t]) { const n = nodeOf(s, 'team ' + t + ' lobby spawn', 0.8); if (n >= 0) seeds[t].push(n); }
    // sealed while closed
    for (const t of [1, 2]) {
      const lb = L[t]; if (!lb || !seeds[t].length) continue;
      const vis = nav.flood(seeds[t], false), p = {};
      let leak = null, ld = Infinity, inside = 0;
      for (let n = 0; n < nav.nodeCount; n++) if (vis[n]) {
        nav.nodePos(n, p);
        if (inRect(p, lb, 1.0)) { inside++; continue; }
        const d = Math.hypot(p.x - lb.x, p.z - lb.z); if (d < ld) { ld = d; leak = { ...p }; }   // the way out nearest the lobby
      }
      if (leak) err('team ' + t + ' lobby is NOT sealed with its gates closed: walkable way out near ' + at(leak));
      stats['lobby' + t + 'Nodes'] = inside;
    }
    const reach = { 1: nav.flood(seeds[1], true), 2: nav.flood(seeds[2], true) };
    const check = (p, what, maxR = 1.2) => {
      const n = nodeOf(p, what, maxR); if (n < 0) return;
      for (const t of [1, 2]) if (seeds[t].length && !reach[t][n]) err(what + ' at ' + at(p) + ' cannot be reached from team ' + t + '\'s lobby (gates open)');
    };
    for (const { s, what } of all) check(s, what, 0.8);
    // zones: enough walkable floor inside the rect that both teams can reach
    const zone = (r, what, need) => {
      const p = {}; let n1 = 0, n2 = 0, any = 0;
      const ylo = r.y == null ? -Infinity : r.y - 1.5, yhi = r.y == null ? Infinity : r.y + 3;
      for (let n = 0; n < nav.nodeCount; n++) {
        nav.nodePos(n, p);
        if (p.x < r.x0 || p.x > r.x1 || p.z < r.z0 || p.z > r.z1 || p.y < ylo || p.y > yhi) continue;
        any++; if (reach[1][n]) n1++; if (reach[2][n]) n2++;
      }
      if (!any) err(what + ' (' + f1(r.x0) + '..' + f1(r.x1) + ', ' + f1(r.z0) + '..' + f1(r.z1) + ') has no walkable floor');
      else for (const [t, c] of [[1, n1], [2, n2]]) if (seeds[t].length && c < need) err(what + ': only ' + c + ' of its ' + any + ' walkable cells can be reached from team ' + t + '\'s lobby');
      return any;
    };
    for (const k in info.sites || {}) stats['site' + k + 'Cells'] = zone(info.sites[k], 'site ' + k, 16);
    for (const h of info.hostages || []) check(h, 'hostage');
    for (const r of info.rescues || []) zone(r, 'rescue zone', 6);
    for (const k in info.points || {}) check(info.points[k], 'point ' + k, Math.max(1.5, Math.min(3, info.points[k].r || 2)));
    let badHides = 0;
    for (const h of info.hides || []) {
      const n = nav.nearest(h.x, h.y, h.z, Math.max(1.2, h.r || 0.8));
      if (n < 0 || !reach[1][n] || !reach[2][n]) { badHides++; warn('hide (' + h.kind + ') at ' + at(h) + ' is not reachable on the navgrid'); }
    }
    stats.unreachableHides = badHides;
    if ((info.hides || []).length - badHides < REQUIRED.hides) err('only ' + ((info.hides || []).length - badHides) + ' reachable hiding spots (needs >= ' + REQUIRED.hides + ')');
    stats.navMs = nav.stats ? nav.stats.ms : 0;
  }
  return { ok: errors.length === 0, errors, warnings, stats };
}
