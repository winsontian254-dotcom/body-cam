/* LIVE FIRE — bot brain. PURE JS (no BABYLON). Bots are simulated on the host with exactly the same movement and weapon code as
   players: a bot only fills a Command (docs §4) every tick.
   Exports:
     SKILLS = { easy: .2, normal: .45, hard: .7, expert: .92 }      (cfg.botSkill; aim.js interpolates profiles between them)
     createBot(mgr, p) -> Bot          Bot.think(dt, cmd) fills cmd (game.js calls it once per tick for a live bot); Bot.reset()
     BotManager                        the game system 'bots' (game.js creates it): brains, team brains, the path service, hearing
                                       (game.bus events), the team buy (handlesBuy = true), stats()
   The brain (one per bot):
     senses (every ~0.1 s; perception.js): view cone + light + line of sight (smoke / foliage / walls), flash and blindfold, hearing
       of footsteps / shots / reloads / landings / grenades / plant + defuse noises through walls, being hit, memory of last known
       positions, team knowledge with a radio delay and callouts (team.js);
     plan (every ~0.4 s): the mode's goal (mode.botGoal, docs §8) + tactics: bomb rounds gather at a staging point and execute
       together (smokes / flashes first), a lurker, defenders hold angles from cover spots and rotate on callouts, plant / defuse
       only when safe (or when the clock forces it), retreat to cover at low health, reload in cover, trade a team-mate's death,
       search last known positions with pre-aim, pick up better weapons, frags at heard enemies, molotovs on the charge, hide &
       seek, hostages, flags, zones, VIP, infection (knife);
     act (every tick): fight (aim.js: reaction, flick + settle, tracking, recoil control, tap / burst / spray by distance and gun,
       counter-strafe before a shot, crouch-spray, strafe between bursts, ADS for scopes, pistol switch when empty up close, knife),
       or move along a navgrid path (path.js: time-sliced searches, look-ahead steering, crouch / drop / mantle links, separation,
       stuck escalation) while checking corners and open angles (never staring at walls).
   Dev: LF.game.bots.stats(), LF.game.bots.brain(p).debug() (state for tests). */
import { aimPoint } from '../game/hitbox.js';
import { eyePos, MOVE } from '../phys/move.js';
import { currentWeapon, statsOf, currentCone, nearestDrop } from '../game/weapon.js';
import { isEnemy } from '../game/player.js';
import { getGun } from '../weapons/data.js';
import { getNade } from '../grenades/data.js';
import { Aim, profileFor, SKILL_OF } from './aim.js';
import { Memory, lightAt, sightLine, HEAR } from './perception.js';
import { PathService, Follower } from './path.js';
import { TeamBrain } from './team.js';
import { findCover, holdSpots, routeInfo, openAngle, wallAhead, nadeAim, dist2D, areaName } from './tactics.js';

export const SKILLS = SKILL_OF;
const BTN = { FIRE: 1, ADS: 2, JUMP: 4, CROUCH: 8, WALK: 16, RELOAD: 32, USE: 64 };
const DEG = Math.PI / 180, TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const wrap = a => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };
const EYE = { x: 0, y: 0, z: 0 }, TP = { x: 0, y: 0, z: 0 }, LP = { x: 0, y: 0, z: 0 };
const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const SMOKES = ['smoke', 'smoke_color'], FLASHES = ['flash', 'ninebang'], FRAGS = ['frag', 'he', 'mini', 'impact', 'cluster'], FIRES = ['molotov', 'incendiary', 'thermite'];

export class Bot {
  constructor(mgr, p) {
    this.mgr = mgr; this.g = mgr.g; this.p = p; this.id = p.id; this.rng = mgr.rng;
    this.prof = profileFor(p.skill ?? 0.45); this.skill0 = p.skill;
    this.aim = new Aim(this.rng, this.prof);
    this.mem = new Memory();
    this.fol = new Follower(this.rng);
    this.vis = new Map(); this.seenAt = new Map();
    this.mv = { yaw: 0, speed: 0, walk: false, crouch: false, jump: false };
    this.steerOut = { yaw: 0, move: false, crouch: false, jump: false, stuck: 0, arrived: false, dist: 0 };
    this.reset();
    this.senseT = this.rng() * 0.12; this.planT = this.rng() * 0.3;
  }
  get team() { return this.mgr.team(this.p.team); }
  reset() {
    const p = this.p;
    if (p.skill !== this.skill0) { this.prof = profileFor(p.skill); this.aim.prof = this.prof; this.skill0 = p.skill; }
    this.aim.reset(p.yaw, 0);
    this.mem.clear(); this.vis.clear(); this.seenAt.clear(); this.fol.clear();
    this.target = null; this.reactT = 0; this.lastVisT = -99; this.part = 'chest'; this.tVisible = false;
    this.task = null; this.goal = null; this.navPos = null; this.navReqT = -99; this.navR = 1;
    this.lookT = 0; this.lookYaw = p.yaw; this.lookPitch = 0; this.checkT = 0; this.checkYaw = null;
    this.hurtLook = null; this.soundLook = null; this.trade = null; this.nade = null; this.nadeCd = 2 + this.rng() * 4;
    this.burstN = 0; this.pauseT = 0; this.strafe = this.rng() < 0.5 ? -1 : 1; this.strafeT = 0; this.crouchSpray = false; this.peekT = 0;
    this.useT = 0; this.atStage = false; this.spot = null; this.spotT = 0; this.wanderT = 0; this.stuckLog = 0; this.unstickT = 0;
    this.lostT = -99; this.flee = null; this.saveMode = false; this.lookAway = 0; this.tradeT = -99; this.searchT = -99;
    this.peek = null; this.peekFor = null;
    this.blindT = -99; this.reloading = false; this.lastPlan = null; this.idleYaw = null; this.hideYaw = null; this.walkWanted = false;
  }

  // ============================================================================================== senses
  sense() {
    const g = this.g, p = this.p, P = this.prof, now = g.time;
    this.vis.clear();
    if (p.blind > 0 || p.flash > 0.35) { this.blindT = now; this.tVisible = false; return; }
    eyePos(p, EYE);
    const flashK = p.flash > 0 ? 0.5 : 1;
    let best = null, bs = Infinity;
    for (const q of g.players.values()) {
      if (!q.alive || !isEnemy(p, q) || q.connected === false) continue;
      const dx = q.pos.x - p.pos.x, dz = q.pos.z - p.pos.z, d = Math.hypot(dx, dz);
      if (d > P.sight * 1.25) continue;
      if (q.hidden && d > 3.2 && Math.hypot(q.vel.x, q.vel.z) < 0.3) continue;   // a hider crouched still in a hide spot
      const ang = Math.abs(wrap(Math.atan2(dx, dz) - this.aim.yaw));
      const vert = Math.abs(Math.atan2((q.pos.y + 1.2) - EYE.y, Math.max(0.5, d)) + this.aim.pitch);
      let fov = P.fov * flashK; if (d < 3.5) fov = Math.max(fov, 1.9);
      const keep = q === this.target && now - this.lastVisT < 0.6;
      if ((ang > fov || vert > 1.0) && !(keep && ang < fov + 0.5)) continue;
      const fired = q.ws && q.ws.since < 0.18 && !(statsOf(currentWeapon(q)) || {}).suppressed;
      const light = fired ? 1 : lightAt(g, q.pos.x, q.pos.y, q.pos.z);
      const still = Math.hypot(q.vel.x, q.vel.z) < 0.8;
      const range = P.sight * (0.28 + 0.72 * light) * (still && q.crouch > 0.5 ? 0.75 : 1) * flashK;
      if (d > range && !keep) continue;
      const part = sightLine(g, EYE, q);
      if (!part) continue;
      this.vis.set(q.id, { q, part, d, ang, light });
      this.mem.see(q, now);
      const last = this.seenAt.get(q.id);
      if (last == null || now - last > 3) this.team.report(this, q, q.pos, 'see');
      this.seenAt.set(q.id, now);
      // target choice: close, central, shooting at me, weak; hysteresis for the current target
      let s = d * (0.6 + ang * 0.5);
      if (p.lastAttacker === q.id && now - p.lastHurtT < 2) s *= 0.5;
      if (q.hp < 40) s *= 0.85;
      if (q === this.target) s *= 0.6;
      if (s < bs) { bs = s; best = q; }
    }
    if (best) {
      const v = this.vis.get(best.id);
      if (best !== this.target) {
        const switching = this.target && now - this.lastVisT < 0.6;
        eyePos(p, EYE); aimPoint(best, 'chest', TP, g.tick);
        const ty = Math.atan2(TP.x - EYE.x, TP.z - EYE.z), tp = -Math.atan2(TP.y - EYE.y, Math.hypot(TP.x - EYE.x, TP.z - EYE.z));
        const flick = Math.hypot(wrap(ty - this.aim.yaw), tp - this.aim.pitch);
        let k = 1 + (1 - v.light) * 0.7 + (v.ang / P.fov) * 0.45 + (v.d > 45 ? 0.3 : 0);
        k *= 0.55 + 0.45 * Math.min(1, flick / 0.3);    // it walked into the angle I was holding: faster
        if (switching) k *= 0.7;
        if (now - this.blindT < 1) k *= 1.4;
        this.target = best; this.reactT = now + this.aim.reaction(k);
        this.aim.acquire(v.d, flick);
        this.part = this.choosePart(v.d);
        this.burstN = 0; this.pauseT = 0;
      }
      this.lastVisT = now; this.tVisible = true;
    } else this.tVisible = false;
  }
  choosePart(d) {
    const w = currentWeapon(this.p), st = w ? statsOf(w) : null;
    if (!st || w.melee || st.pellets > 1) return 'chest';
    const k = d < 6 ? 0.55 : d < 25 ? 1 : 1.1;
    return this.rng() < this.prof.head * k ? 'head' : 'chest';
  }
  /** A sound (manager): kind 'step'|'shot'|'reload'|'land'|'nade'|'obj'. */
  hear(src, pos, kind, d, occluded) {
    const g = this.g, now = g.time;
    const err = (kind === 'shot' ? 1 + d * 0.05 : 1.5 + d * 0.1) * (occluded ? 1.6 : 1);
    const e = this.mem.hear(src ? src.id : null, pos, now, err, this.rng);
    if (kind === 'shot' || kind === 'step' || kind === 'obj') { if (d > 6 || kind !== 'step') this.team.report(this, src, e, 'hear'); }
    if (!this.tVisible && (!this.soundLook || now - this.soundLook.t > 0.8)) {
      // turn toward it after a short delay (people do not snap to every sound)
      if (this.rng() < 0.4 + 0.5 * this.prof.skill) this.soundLook = { x: e.x, y: e.y, z: e.z, t: now + 0.15 + this.rng() * 0.3, until: now + 1.6 };
    }
  }
  hurt(att, dmg) {
    const now = this.g.time;
    if (!att || !att.alive) return;
    const e = this.mem.hit(att.id, { x: att.pos.x + (this.rng() - 0.5) * 2, y: att.pos.y, z: att.pos.z + (this.rng() - 0.5) * 2 }, now);
    if (!this.tVisible) this.hurtLook = { x: e.x, y: e.y, z: e.z, t: now + 0.12 + this.rng() * 0.18 * (1 - this.prof.skill), until: now + 2 };
    this.team.report(this, att, e, 'hit');
    void dmg;
  }

  // ============================================================================================== plan
  plan() {
    const g = this.g, p = this.p, now = g.time, P = this.prof;
    let goal = null;
    try { goal = g.mode && g.mode.botGoal ? g.mode.botGoal(g, p) : null; } catch (e) { goal = null; }
    this.goal = goal;
    const w = currentWeapon(p), st = w ? statsOf(w) : null;
    const threat = this.mem.best(now, 6, p.pos);
    const busy = !!p.busy;
    // what is the most important thing now?
    let t = null;
    const crit = goal && (goal.kind === 'plant' || goal.kind === 'defuse') && goal.urgency >= 0.9;
    if (busy) t = { kind: 'busy' };
    else if (p.hp < 32 && threat && now - Math.max(this.lastVisT, p.lastHurtT) < 3 && !crit && !(goal && goal.melee)) t = this.coverTask(threat, 'retreat');
    else if (w && !w.melee && st && w.mag < st.mag * 0.35 && (w.reserve > 0 || g.options.infiniteAmmo) && now - this.lastVisT > 2 && !crit) {
      t = threat && dist2D(threat, p.pos) < 30 && now - threat.t < 5 ? this.coverTask(threat, 'reload') : { kind: 'reload' };
    }
    if (!t && this.trade && now - this.trade.t < 4 && !crit && P.skill > 0.3 && !(goal && (goal.kind === 'hide'))) t = { kind: 'search', pos: this.trade, radius: 2.5, walk: false, why: 'trade' };
    if (!t && !crit && !(goal && (goal.kind === 'hide' || goal.melee))) {
      const pick = this.pickupTask(); if (pick) t = pick;
    }
    // how far a memory may pull the bot off its job: less while executing a bomb plan / escorting / holding an objective
    const TP0 = this.team.plan0, bombJob = goal && (goal.kind === 'escort' || goal.kind === 'plant') && g.objectives && g.objectives.s.bomb;
    const holdJob = goal && (goal.kind === 'defend' || goal.kind === 'hold' || goal.kind === 'capture');
    let pull = threat ? (threat.src === 'hear' ? (bombJob ? 8 : 18) : bombJob && TP0 && TP0.phase === 'exec' ? 14 : bombJob ? 22 : 40) : 0;
    if (holdJob) pull = Math.min(pull, threat && threat.src === 'hear' ? 6 : 12);
    if (!t && threat && threat.src !== 'team' && now - threat.t < 7 && !crit && !(goal && goal.kind === 'hide') && dist2D(threat, p.pos) < pull) {
      const holding = goal && (goal.kind === 'defend' || goal.kind === 'hold') && this.spot && dist2D(p.pos, this.spot) < 2;
      t = holding ? { kind: 'watch', pos: threat } : { kind: 'search', pos: threat, radius: 3, walk: dist2D(threat, p.pos) < 25 && P.skill > 0.4, why: 'memory' };
    }
    if (!t) t = this.goalTask(goal);
    this.task = t;
    this.maybeNade(goal, threat);
  }
  coverTask(threat, why) {
    const g = this.g, p = this.p;
    if (this.task && this.task.kind === why && this.task.cover && g.time - this.task.t0 < 4) return this.task;
    const tEye = { x: threat.x, y: threat.y + 1.5, z: threat.z };
    const c = findCover(g, p.pos, tEye, { rng: this.rng, maxR: why === 'retreat' ? 10 : 7 });
    return { kind: why, pos: c || null, cover: !!c, crouch: c && c.crouch, t0: g.time, threat: { x: threat.x, y: threat.y, z: threat.z }, radius: 0.6 };
  }
  pickupTask() {
    const g = this.g, p = this.p;
    if (!g.drops || !g.drops.length || p.noPickup) return null;
    const cur = p.inv.primary ? (getGun(p.inv.primary.gunId) || {}).price || 0 : 0;
    let best = null, bv = 0;
    for (const d of g.drops) {
      if (!d.rest && d.t < 1) continue;
      const gun = getGun(d.w.gunId); if (!gun || gun.slot !== 'primary') continue;
      const dd = Math.hypot(d.x - p.pos.x, d.z - p.pos.z); if (dd > 16 || Math.abs(d.y - p.pos.y) > 2) continue;
      if (d.w.mag + d.w.reserve <= 0) continue;
      const v = (gun.price || 0) - cur - dd * 40;
      if ((p.inv.primary ? v > 900 : v > -1000) && v > bv) { bv = v; best = d; }
    }
    return best ? { kind: 'pickup', pos: { x: best.x, y: best.y, z: best.z }, radius: 0.5, drop: best, use: !!p.inv.primary } : null;
  }
  goalTask(goal) {
    const g = this.g, p = this.p, now = g.time;
    if (!goal) return { kind: 'roam' };
    const k = goal.kind, O = g.objectives, b = O && O.s && O.s.bomb;
    if (b && (k === 'escort' || k === 'plant' || k === 'defend' || k === 'defuse')) return this.bombTask(goal, b);
    if (k === 'hunt') {
      // the team's knowledge beats a rotating map point (callouts: push where they were seen)
      if (!goal.target && !goal.melee) {
        let near = null, nd = Infinity;
        for (const e of this.mem.entries(now, 10)) { const d = dist2D(e, p.pos); if (d < nd) { nd = d; near = e; } }
        if (near && nd < 70) return { kind: 'hunt', pos: near, radius: 3, walk: nd < 18 && this.prof.skill > 0.45 };
      }
      return { kind: 'hunt', pos: goal.pos, radius: goal.radius || 3, melee: goal.melee, target: goal.target };
    }
    if (k === 'hide') return { kind: 'hide', pos: goal.pos, radius: Math.min(goal.radius || 0.8, 0.8), crouch: true, walk: true };
    if (k === 'seek') return { kind: 'seek', pos: goal.pos, radius: goal.radius || 1.5 };
    if (k === 'capture' || k === 'hold') return { kind: 'zone', pos: goal.pos, radius: Math.max(1, goal.radius || 3), hold: k === 'hold' };
    if (k === 'defend') return { kind: 'defend', pos: goal.pos, radius: goal.radius || 6, area: goal.pos };
    if (k === 'escort') return { kind: 'escort', pos: goal.pos, radius: goal.radius || 4, target: goal.target, self: goal.self };
    if (k === 'roam' || !goal.pos) return { kind: 'roam' };
    return { kind: 'go', pos: goal.pos, radius: goal.radius || 1, use: !!goal.use, goalKind: k };
  }
  bombTask(goal, b) {
    const g = this.g, p = this.p, now = g.time, O = g.objectives, cfg = O.cfg.bomb, S = g.map.sites || {};
    const P = this.team.plan() || {};
    const att = p.team === cfg.attackers;
    const siteName = P.site || b.target || cfg.sites[0], site = S[siteName];
    const info = site ? this.mgr.siteInfo(siteName) : null;
    if (goal.kind === 'defuse') {
      const need = (p.inv.kit ? 5 : 10) + dist2D(p.pos, b) / 4.6 + 0.6;
      if (b.fuse < need && b.defuser !== p.id) return this.saveTask(b, 'no time');
      // retake together: with time to spare, wait for a team-mate at the defenders' staging point before going in
      const di = this.mgr.siteInfo(b.site), st = di && di.route[2] && di.route[2].staging;
      const slack = b.fuse - need, db = dist2D(p.pos, b);
      if (st && slack > 9 && db > 14 && b.defuser !== p.id) {
        const mates = [...g.players.values()].filter(q => q.alive && q.team === p.team);
        const near = mates.filter(q => dist2D(q.pos, st) < 9 || dist2D(q.pos, b) < 14).length;
        if (mates.length > 1 && near < 2) {
          const h = hashId(p.id), a = (h % 12) / 12 * TAU;
          return { kind: 'stage', pos: { x: st.x + Math.sin(a) * 1.5, y: st.y, z: st.z + Math.cos(a) * 1.5 }, radius: 2.2, look: b, retake: true };
        }
      }
      return { kind: 'defuse', pos: goal.pos, radius: 0.85, use: true };
    }
    if (att) {
      if (b.state === 'planted' || P.phase === 'post') {
        const post = this.mgr.siteInfo(b.site || siteName, 'post');
        return { kind: 'defend', pos: { x: b.x, y: b.y, z: b.z }, radius: 7, area: b, spots: post && post.spots[1], watch: b };
      }
      if (goal.kind === 'plant') {
        const inSite = O.siteAt(p);
        if (inSite || P.phase !== 'gather') return { kind: 'plant', pos: inSite ? this.plantSpot(inSite) : goal.pos, radius: inSite ? 0.8 : 2, use: !!inSite, site: siteName };
        return this.stageTask(info, site, 'carrier');
      }
      if (b.state === 'dropped') return { kind: 'go', pos: goal.pos, radius: 0.5, goalKind: 'attack' };
      if (P.lurker === p.id && P.phase !== 'post') {
        const other = cfg.sites.find(n => n !== siteName && S[n]);
        const oi = other ? this.mgr.siteInfo(other) : null;
        if (oi && oi.route[1]) return { kind: 'lurk', pos: oi.route[1].staging, radius: 2.5, walk: true, look: oi.route[1].entry };
      }
      if (P.phase === 'gather') return this.stageTask(info, site, 'mate');
      // execute: onto the site, cover the carrier
      const c = O.bombHolder();
      if (c && c !== p && dist2D(c.pos, site || c.pos) > 6) return { kind: 'escort', pos: c.pos, radius: 5, target: c.id };
      return { kind: 'defend', pos: site ? { x: site.x, y: site.y || 0, z: site.z } : goal.pos, radius: 6, area: site, spots: info && info.spots[1], entering: true };
    }
    // defenders: the site the mode's goal gives (botGoal spreads them; they do NOT know the attackers' target), rotation on callouts
    let sn = P.defSite && P.defSite.get(p.id);                     // the team spreads its defenders over the sites (team.js)
    if (!sn) { let bd = Infinity; for (const n of cfg.sites) { const q = S[n]; if (q && goal.pos) { const d = dist2D(q, goal.pos); if (d < bd) { bd = d; sn = n; } } } }
    sn = sn || cfg.sites[0];
    if (P.rotate && P.rotate !== sn && (hashId(p.id) % 10) < 7) sn = P.rotate;
    const ds = S[sn], di = ds ? this.mgr.siteInfo(sn) : null;
    return { kind: 'defend', pos: ds ? { x: ds.x, y: ds.y || 0, z: ds.z } : goal.pos, radius: goal.radius || 6, area: ds, spots: di && di.spots[2], site: sn };
  }
  stageTask(info, site, who) {
    const p = this.p, P = this.team.plan0;
    // split execute: some of the team gathers on the second route (the carrier stays on the main one)
    const alt = info && info.route.alt && P && P.split && who !== 'carrier' && (hashId(p.id + ':' + this.g.match.round) & 1);
    const r = info && (alt ? info.route.alt : info.route[1]);
    let pos = r ? r.staging : site ? { x: site.x, y: site.y || 0, z: site.z } : p.pos;
    // spread out at the staging point
    const h = hashId(p.id), a = (h % 12) / 12 * TAU, rr = 1.2 + (h % 3) * 0.8;
    pos = { x: pos.x + Math.sin(a) * rr, y: pos.y, z: pos.z + Math.cos(a) * rr };
    return { kind: 'stage', pos, radius: 2.2, walk: false, look: r ? r.entry : site, who };
  }
  plantSpot(site) {
    // a spot inside the rect near the centre, a little off it (seeded per round)
    const h = hashId(this.p.id + ':' + this.g.match.round);
    const w = Math.max(0.5, (site.x1 - site.x0) / 2 - 1), d = Math.max(0.5, (site.z1 - site.z0) / 2 - 1);
    return { x: site.x + ((h % 100) / 100 - 0.5) * w, y: site.y || this.p.pos.y, z: site.z + (((h >> 7) % 100) / 100 - 0.5) * d };
  }
  saveTask(from, why) {
    const g = this.g, p = this.p;
    if (this.task && this.task.kind === 'save') return this.task;
    const nav = g.map.nav; let pos = null;
    if (nav) for (let k = 0; k < 20 && !pos; k++) {
      const n = nav.randomNode(this.rng); if (n < 0) continue;
      const q = nav.nodePos(n); if (dist2D(q, from) > 30 && dist2D(q, p.pos) < 60 && nav.component(n) === nav.component(Math.max(0, nav.nearest(p.pos.x, p.pos.y + 0.3, p.pos.z)))) pos = q;
    }
    if (why) this.team.say(this, 'No time, saving', 'save' + g.match.round, 0);
    return { kind: 'save', pos, radius: 2, walk: false };
  }

  // ============================================================================================== grenades
  hasNade(list) { const n = this.p.inv.nades || []; for (const e of n) if (e.n > 0 && list.includes(e.gid)) return e.gid; return null; }
  maybeNade(goal, threat) {
    const g = this.g, p = this.p, now = g.time;
    if (this.nade || !this.mgr.nadesOk || this.nadeCd > 0 || this.tVisible || p.busy || p.carry) return;
    const P = this.team.plan0, O = g.objectives, b = O && O.s && O.s.bomb;
    const t = this.task || {};
    // 1. execute utility: smoke the best defender angle, flash over the entry
    if (b && P && P.phase === 'exec' && p.team === O.cfg.bomb.attackers && now - P.execT < 6 && !P.nadeDone.has(p.id)) {
      const info = this.mgr.siteInfo(P.site), r = info && info.route[1];
      if (r) {
        const sm = this.hasNade(SMOKES), fl = this.hasNade(FLASHES);
        const dspot = info.spots[2] && info.spots[2][0];
        if (sm && dspot && dist2D(p.pos, dspot) < 38) { P.nadeDone.add(p.id); return this.startNade(sm, { x: (dspot.x + r.entry.x) / 2, y: dspot.y, z: (dspot.z + r.entry.z) / 2 }, 'smoke'); }
        if (fl && dist2D(p.pos, r.entry) < 26) {
          const S = g.map.sites[P.site]; const dx = S.x - r.entry.x, dz = S.z - r.entry.z, L = Math.hypot(dx, dz) || 1;
          P.nadeDone.add(p.id); return this.startNade(fl, { x: r.entry.x + dx / L * 5, y: r.entry.y + 1.5, z: r.entry.z + dz / L * 5 }, 'flash');
        }
      }
    }
    // 2. molotov on the charge while it is being defused / planted (heard or known)
    const fire = this.hasNade(FIRES);
    if (fire && b && (b.state === 'planted' && b.defuser && p.team === O.cfg.bomb.attackers || b.plantT > 0 && p.team !== O.cfg.bomb.attackers)) {
      const d = dist2D(p.pos, b);
      if (d > 6 && d < 28 && (this.mem.best(now, 3) || this.rng() < 0.5)) return this.startNade(fire, { x: b.x, y: b.y, z: b.z }, 'fire');
    }
    // 3. frag at a fresh, unseen position (heard / called)
    const fr = this.hasNade(FRAGS);
    if (fr && threat && now - threat.t < 3 && threat.conf >= 0.4) {
      const d = dist2D(p.pos, threat);
      if (d > 9 && d < 30 && this.rng() < 0.35 + 0.4 * this.prof.skill) return this.startNade(fr, threat, 'frag');
    }
    // 4. retake: flash / smoke the site before going in for the defuse
    if (b && b.state === 'planted' && t.kind === 'defuse' && !this.retakeNade) {
      const d = dist2D(p.pos, b), fl2 = this.hasNade(FLASHES) || this.hasNade(SMOKES);
      eyePos(p, EYE); LP.x = b.x; LP.y = b.y + 1.2; LP.z = b.z;
      if (fl2 && d > 8 && d < 24 && !g.map.nav.losClear(EYE, LP)) { this.retakeNade = true; return this.startNade(fl2, { x: b.x, y: b.y + (FLASHES.includes(fl2) ? 1.8 : 0), z: b.z }, FLASHES.includes(fl2) ? 'flash' : 'smoke'); }
    }
    // 5. flash before pushing a known position around a corner
    const fl = this.hasNade(FLASHES);
    if (fl && t.kind === 'search' && t.pos && this.rng() < 0.5) {
      const d = dist2D(p.pos, t.pos);
      if (d > 7 && d < 20) return this.startNade(fl, { x: t.pos.x, y: (t.pos.y || 0) + 1.6, z: t.pos.z }, 'flash');
    }
  }
  startNade(gid, to, why) {
    const sol = nadeAim(this.g, this.p, gid, to);
    if (!sol) { this.nadeCd = 1.5; return; }
    this.nade = { gid, to, sol, why, t0: this.g.time, phase: 'draw', pinT: 0 };
    this.mgr.st.nades++;
  }
  runNade(dt, cmd) {
    const g = this.g, p = this.p, N = this.nade, now = g.time;
    if (now - N.t0 > 4 || (this.tVisible && now >= this.reactT && N.phase !== 'pin')) { this.endNade(cmd, false); return; }
    const have = (p.inv.nades || []).some(e => e.gid === N.gid && e.n > 0);
    if (!have && N.phase !== 'thrown') { this.endNade(cmd, N.phase === 'pin'); return; }
    this.mv.speed = 0;
    if (N.phase === 'draw') {
      if (p.cur !== 'nade') { p.curNade = N.gid; cmd.slot = 'nade'; }
      else if (p.curNade !== N.gid) p.curNade = N.gid;
      else if (p.ws.state === 'idle') N.phase = 'aim';
      this.aim.look(dt, N.sol.yaw, N.sol.pitch, 2.2);
      return;
    }
    if (N.phase === 'aim') {
      this.aim.look(dt, N.sol.yaw, N.sol.pitch, 2.2);
      const sp = Math.hypot(p.vel.x, p.vel.z);
      if (Math.abs(wrap(N.sol.yaw - this.aim.yaw)) < 0.025 && Math.abs(N.sol.pitch - this.aim.pitch) < 0.025 && sp < 0.6) { N.phase = 'pin'; N.pinT = 0; }
      return;
    }
    if (N.phase === 'pin') {
      this.aim.look(dt, N.sol.yaw, N.sol.pitch, 2.2);
      N.pinT += dt;
      cmd.buttons |= N.sol.under ? BTN.ADS : BTN.FIRE;
      const nd = getNade(N.gid), cook = nd && nd.cookable && N.why === 'frag' ? Math.max(0, Math.min(1.2, (nd.fuse || 3) - (N.sol.t || 1) - 1.2)) : 0;
      if (N.pinT >= 0.22 + cook) N.phase = 'release';
      return;
    }
    if (N.phase === 'release') {
      // buttons up this tick: weapon.js throws on the release edge
      N.phase = 'thrown'; N.relT = now; this.lastThrow = { gid: N.gid, to: N.to, why: N.why, t: now, yaw: this.aim.yaw, pitch: this.aim.pitch };
      if (N.why === 'flash') this.lookAway = now + 0.25;
      return;
    }
    if (N.phase === 'thrown') {
      if (now - N.relT > 0.25) { this.mgr.st.thrown += (p.inv.nades || []).some(e => e.gid === N.gid) ? 0 : 0; this.endNade(cmd, true); }
    }
  }
  endNade(cmd, thrown) {
    const N = this.nade; this.nade = null;
    this.nadeCd = thrown ? 4 + this.rng() * 5 : 2;
    if (thrown && N) { this.mgr.st.thrown++; if (N.why === 'smoke' || N.why === 'flash' || N.why === 'fire') this.team.say(this, N.why === 'smoke' ? 'Smoke out' : N.why === 'flash' ? 'Flashing!' : 'Molly on the charge', 'n' + N.why, 6); }
    if (this.p.cur === 'nade') cmd.slot = this.bestSlot();
  }

  // ============================================================================================== think (every tick)
  think(dt, cmd) {
    const t0 = nowMs();
    try { this._think(dt, cmd); } catch (e) { if (!this.mgr.err) { this.mgr.err = e; console.error('[bots] think failed', e); } cmd.mx = cmd.mz = 0; cmd.buttons = 0; }
    const ms = nowMs() - t0; const S = this.mgr.perf; S.n++; S.ms += ms; S.cur += ms; if (ms > S.max) { S.max = ms; S.what = this._what + ' ' + (this.task ? this.task.kind : '-'); }
    if (ms > 2) S.slow = (S.slow || 0) + 1;
  }
  _think(dt, cmd) {
    const g = this.g, p = this.p, now = g.time;
    cmd.mx = 0; cmd.mz = 0; cmd.buttons = 0; cmd.slot = null; cmd.nade = null;
    this.mv.speed = 0; this.mv.walk = false; this.mv.crouch = false; this.mv.jump = false;
    if (this.nadeCd > 0) this.nadeCd -= dt;
    const frozen = g.match && g.match.isFrozen && g.match.isFrozen();
    if (p.hold) { this.idle(dt, frozen); this.out(cmd); return; }
    this.senseT -= dt;
    this._what = 'tick';
    if (this.senseT <= 0) { this._what = 'sense'; this.sense(); this.senseT = 0.075 + 0.07 * (1 - this.prof.skill) + this.rng() * 0.03; }
    this.planT -= dt;
    if (this.planT <= 0) { this._what += '+plan'; this.plan(); this.planT = 0.32 + this.rng() * 0.18; }
    const q = this.target;
    if (q && (!q.alive || now - this.lastVisT > 1.4 || !isEnemy(p, q))) { this.target = null; this.aim.lose(); this.lostT = now; }
    this.weapons(cmd);
    if (frozen) { this.idle(dt, true); this.out(cmd); return; }
    if (this.nade) this.runNade(dt, cmd);
    else if (this.target && (this.tVisible || now - this.lastVisT < 0.5)) this.fight(dt, cmd);
    else this.move(dt, cmd);
    this.out(cmd);
  }
  out(cmd) {
    const p = this.p, mv = this.mv;
    cmd.yaw = this.aim.yaw; cmd.pitch = this.aim.pitch;
    if (mv.speed > 0) { const rel = wrap(mv.yaw - cmd.yaw); cmd.mz = Math.cos(rel) * mv.speed; cmd.mx = Math.sin(rel) * mv.speed; }
    if (mv.walk) cmd.buttons |= BTN.WALK;
    if (mv.crouch) cmd.buttons |= BTN.CROUCH;
    if (mv.jump && p.onGround) cmd.buttons |= BTN.JUMP;
  }
  idle(dt, frozen) {
    // frozen / held: look toward where the round will be played, a little sway
    const p = this.p, g = this.g;
    if (!this.idleYaw || g.time - this.idleT > 3) {
      this.idleT = g.time;
      eyePos(p, EYE);
      const t = this.task && this.task.pos;
      const base = t ? Math.atan2(t.x - p.pos.x, t.z - p.pos.z) : this.aim.yaw;
      this.idleYaw = openAngle(g, EYE, base, 0.8, 5).yaw;
    }
    this.aim.look(dt, this.idleYaw + Math.sin(g.time * 0.7 + hashId(p.id)) * 0.08, 0.05, 0.6);
    void frozen;
  }

  // ============================================================================================== weapons
  bestSlot() {
    const p = this.p, inf = this.g.options && this.g.options.infiniteAmmo;
    const ok = w => w && (inf || w.mag + w.reserve > 0);
    if (ok(p.inv.primary)) return 'primary';
    if (ok(p.inv.secondary)) return 'secondary';
    return 'melee';
  }
  weapons(cmd) {
    const g = this.g, p = this.p, now = g.time, ws = p.ws;
    if (this.nade) return;
    const goal = this.goal, w = currentWeapon(p), st = w ? statsOf(w) : null;
    const melee = goal && goal.melee;
    if (melee) { if (p.cur !== 'melee' && p.inv.melee) cmd.slot = 'melee'; return; }
    if (p.cur === 'nade' || (p.cur === 'bomb' && !p.busy)) { cmd.slot = this.bestSlot(); return; }
    if (!w) { cmd.slot = this.bestSlot(); return; }
    const inf = g.options && g.options.infiniteAmmo;
    if (w.melee) {
      const s = this.bestSlot();
      if (s !== 'melee' && !(this.target && dist2D(this.target.pos, p.pos) < 2)) cmd.slot = s;
      return;
    }
    const d = this.target ? dist2D(this.target.pos, p.pos) : 99;
    if (w.mag === 0) {
      if (this.target && d < 16 && p.cur === 'primary' && p.inv.secondary && p.inv.secondary.mag > 0) { cmd.slot = 'secondary'; return; }
      if (w.reserve > 0 || inf) { if (ws.state === 'idle') cmd.buttons |= BTN.RELOAD; }
      else cmd.slot = this.bestSlot() === p.cur ? 'melee' : this.bestSlot();
      return;
    }
    const t = this.task;
    if (!this.target && now - this.lastVisT > 2.0 && ws.state === 'idle' && st && w.mag < st.mag * 0.55 && (w.reserve > 0 || inf)) {
      if (!t || t.kind !== 'reload' || !t.cover || (t.pos && dist2D(p.pos, t.pos) < 1.2) || w.mag < st.mag * 0.2) cmd.buttons |= BTN.RELOAD;
    }
    if (p.cur === 'secondary' && !this.target && now - this.lastVisT > 2.5 && p.inv.primary && (p.inv.primary.mag + p.inv.primary.reserve > 0 || inf) && ws.state !== 'reload') cmd.slot = 'primary';
  }

  // ============================================================================================== fight
  fight(dt, cmd) {
    const g = this.g, p = this.p, q = this.target, P = this.prof, ws = p.ws, now = g.time;
    const w = currentWeapon(p), st = w ? statsOf(w) : null;
    eyePos(p, EYE);
    const visible = this.tVisible;
    if (visible) aimPoint(q, this.part, TP, g.tick);
    else { const e = this.mem.get(q.id); TP.x = e ? e.x : q.pos.x; TP.y = (e ? e.y : q.pos.y) + 1.35; TP.z = e ? e.z : q.pos.z; }
    const dx = TP.x - EYE.x, dy = TP.y - EYE.y, dz = TP.z - EYE.z, hd = Math.hypot(dx, dz), d = Math.hypot(hd, dy);
    const ty = Math.atan2(dx, dz), tp = -Math.atan2(dy, Math.max(0.05, hd));
    const reacted = now >= this.reactT;
    if (!reacted) {
      // not processed yet: keep doing what we did (a tiny start of the turn)
      this.aim.look(dt, this.lookYaw, this.lookPitch, 0.7);
      this.moveOn(dt, 0.6);
      return;
    }
    this.aim.track(dt, ty, tp, { recoilX: ws.ax, recoilY: ws.ay, dist: d, tvx: visible ? q.vel.x : 0, tvz: visible ? q.vel.z : 0 });
    this.lookYaw = this.aim.yaw; this.lookPitch = this.aim.pitch;
    if (!w || !st) { this.mv.speed = 0; return; }
    const melee = w.melee;
    // ---------------------------------------------------------------- movement
    const sp = Math.hypot(p.vel.x, p.vel.z), spd = Math.max(1, st.speed || 5);
    const cqb = melee || st.pellets > 1 || st.cat === 'smg';
    const scoped = st.cat === 'sniper' || (st.zoomLevels && st.zoomLevels.length && Math.max(...st.zoomLevels) >= 3) || st.cat === 'dmr';
    const err = this.aim.error(ty, tp, ws);
    const hw = this.part === 'head' ? 0.11 : 0.21;
    const tol = Math.atan2(hw, Math.max(1, d)) * P.trigger + currentCone(p) * 0.35 + 0.003;
    this.strafeT -= dt;
    if (this.strafeT <= 0) { this.strafe = this.rng() < 0.7 ? -this.strafe : this.strafe; this.strafeT = 0.25 + this.rng() * 0.55; }
    const goal = this.goal, t = this.task;
    if (melee) {
      this.mv.yaw = ty; this.mv.speed = 1;
      if (d > 3 && this.rng() < 0.01) this.mv.jump = true;
    } else if (p.hp < 30 && t && (t.kind === 'retreat') && t.pos && dist2D(p.pos, t.pos) > 0.8) {
      this.navTo(t.pos, 0.6, false); this.steer(dt, false);        // fall back to cover while shooting
    } else {
      const wantStop = !cqb || d > 12;
      const aboutToShoot = err < tol * 2.2 && ws.state === 'idle';
      if (this.pauseT > 0 && this.rng() < P.strafe * 1.2) { this.mv.yaw = ty + this.strafe * Math.PI / 2; this.mv.speed = 1; }
      else if (wantStop && aboutToShoot && this.rng() < P.stop * 0.9 + 0.08) {
        if (sp > spd * 0.2) { this.mv.yaw = Math.atan2(-p.vel.x, -p.vel.z); this.mv.speed = Math.min(1, sp / spd + 0.2); }   // counter-strafe
      } else if (d < 9 && P.strafe > 0.3) { this.mv.yaw = ty + this.strafe * Math.PI / 2; this.mv.speed = 1; }
      else if (cqb && d > 9 && (!goal || goal.kind !== 'defend')) { this.mv.yaw = ty; this.mv.speed = 0.85; }   // close the distance
      if (st.cat === 'sniper' && d < 7 && p.inv.secondary && p.inv.secondary.mag > 0 && this.rng() < 0.03) cmd.slot = 'secondary';
      // crouch-spray at mid range
      if (!this.crouchSpray && this.burstN === 0 && d > 10 && d < 35 && this.rng() < P.crouch * 0.1) this.crouchSpray = true;
      if (this.crouchSpray && (d < 8 || this.burstN === 0 && this.pauseT > 0)) this.crouchSpray = false;
      if (this.crouchSpray) this.mv.crouch = true;
      // behind low cover: duck to reload, stand to shoot
      if (t && t.kind === 'defend' && this.spot && this.spot.crouch && dist2D(p.pos, this.spot) < 1) this.mv.crouch = ws.state === 'reload';
    }
    // ---------------------------------------------------------------- trigger
    if (melee) {
      const back = Math.abs(wrap(q.yaw - Math.atan2(p.pos.x - q.pos.x, p.pos.z - q.pos.z))) > 2.0;
      if (d < 1.9 && err < 0.5) cmd.buttons |= back && d < 1.5 ? BTN.ADS : BTN.FIRE;
      return;
    }
    if (scoped && d > 5 && ws.state === 'idle') cmd.buttons |= BTN.ADS;
    else if (!scoped && d > 26 && P.skill > 0.5 && (st.adsTime || 0.3) < 0.4 && this.mv.speed === 0) cmd.buttons |= BTN.ADS;
    if (!visible) {
      // lost sight a moment ago: hold the angle; a good bot prefires a known close corner
      if (d < 10 && now - this.lastVisT < 0.25 && this.rng() < P.skill * 0.2 && st.modes && st.modes[0] === 'auto') cmd.buttons |= BTN.FIRE;
      this.burstN = 0;
      return;
    }
    if (ws.state !== 'idle' || ws.cyc > 0) return;
    if (scoped && (cmd.buttons & BTN.ADS) && ws.ads < 0.92) return;
    if (this.pauseT > 0) { this.pauseT -= dt; if (this.pauseT > 0) return; }
    const moving = sp > spd * 0.35;
    if (!cqb && d > 15 && moving && this.rng() < P.stop) return;         // wait until stopped (first-shot accuracy)
    const mode = w.fireMode || (st.modes && st.modes[0]) || 'semi';
    if (err > tol * (this.burstN > 0 ? 1.6 : 1)) { if (mode === 'auto' && this.burstN > 0 && err > tol * 3) { this.burstN = 0; this.pauseT = 0.05; } return; }
    if (mode === 'auto') {
      const maxB = d < 10 ? P.spray + (cqb ? 10 : 0) : d < 22 ? P.burst + 1 : d < 40 ? Math.max(1, P.burst - 2) : 1;
      cmd.buttons |= BTN.FIRE;
      if (ws.since < 0.01) this.burstN++;
      if (this.burstN >= maxB) { this.burstN = 0; this.pauseT = d < 10 ? 0.08 + this.rng() * 0.12 : P.patience * (0.6 + this.rng() * 0.8) + (d > 40 ? 0.2 : 0); }
    } else {
      // semi / burst / bolt: a press each time the gun is ready (released in between so the trigger resets)
      if (ws.cool <= 0 && !(ws.btn & BTN.FIRE)) {
        if (d > 30 && ws.shots > 0.8) return;                          // let the recoil settle at range
        cmd.buttons |= BTN.FIRE; this.burstN++;
      }
    }
  }

  // ============================================================================================== movement
  navTo(pos, radius, walk) {
    const g = this.g, p = this.p, now = g.time;
    this.navR = radius;
    const moved = !this.navPos || dist2D(this.navPos, pos) > Math.max(1.5, dist2D(p.pos, pos) * 0.15) || Math.abs((this.navPos.y || 0) - (pos.y || 0)) > 2;
    const need = moved || (!this.fol.active && !this.mgr.paths.pending(this) && dist2D(p.pos, pos) > radius + 0.3);
    if (need && now - this.navReqT > 0.6) {
      this.navReqT = now; this.navPos = { x: pos.x, y: pos.y || 0, z: pos.z };
      const self = this;
      this.mgr.paths.request(this, p.pos, this.navPos, path => { if (self.p.alive) self.fol.set(path); }, { prio: this.task && (this.task.kind === 'defuse' || this.task.kind === 'plant') ? 2 : 0 });
    }
    this.walkWanted = !!walk;
  }
  arrived(pos, r) { const p = this.p; return dist2D(p.pos, pos) < r && Math.abs((pos.y ?? p.pos.y) - p.pos.y) < 1.8; }
  steer(dt, look = true) {
    const p = this.p, g = this.g, o = this.steerOut;
    const mates = this.mates || (this.mates = []); mates.length = 0;
    for (const q of g.players.values()) if (q !== p && q.alive && !isEnemy(p, q) && Math.abs(q.pos.x - p.pos.x) < 2 && Math.abs(q.pos.z - p.pos.z) < 2) mates.push(q);
    this.fol.nav = g.map && g.map.nav;
    this.fol.steer(p, dt, o, mates);
    if (o.move) {
      this.mv.yaw = o.yaw; this.mv.speed = 1; this.mv.walk = this.walkWanted; this.mv.crouch = o.crouch; this.mv.jump = o.jump;
      // stuck: repath, then wander off a little
      if (o.stuck > 2.2 && g.time - this.navReqT > 1.5) { this.navPos = null; this.fol.clear(); this.mgr.st.repaths++; }
      if (o.stuck > 4.5) { this.unstickT = g.time + 1.2; }
    } else if (this.navPos && !this.mgr.paths.pending(this) && dist2D(p.pos, this.navPos) > this.navR + 0.4) {
      // no path (yet / failed): walk straight if the nav says it is clear
      const nav = g.map.nav;
      if (nav && nav.walkLine(p.pos, this.navPos)) { this.mv.yaw = Math.atan2(this.navPos.x - p.pos.x, this.navPos.z - p.pos.z); this.mv.speed = 1; }
    }
    if (this.unstickT > g.time) { this.mv.yaw = this.mv.yaw + Math.PI * 0.75; this.mv.speed = 1; this.mv.jump = this.rng() < 0.05; }
    if (look) this.lookAround(dt);
    return o;
  }
  /** Keep moving on the current path at a fraction of speed (reacting / fighting from a path). */
  moveOn(dt, k) { if (this.fol.active) { this.steer(dt, false); this.mv.speed *= k; } }

  move(dt, cmd) {
    const g = this.g, p = this.p, t = this.task || { kind: 'roam' }, now = g.time;
    const O = g.objectives;
    switch (t.kind) {
      case 'busy':
        cmd.buttons |= BTN.USE; this.lookAround(dt, true); return;
      case 'reload': case 'retreat':
        if (t.pos && !this.arrived(t.pos, 0.7)) { this.navTo(t.pos, 0.6, false); this.steer(dt); }
        else { this.mv.crouch = !!t.crouch; this.watch(dt, t.threat); }
        if (t.threat) this.watchWhileMoving(t.threat);
        return;
      case 'search': {
        if (this.arrived(t.pos, t.radius)) { const e = this.mem.best(now, 7, p.pos); if (e && dist2D(e, t.pos) < 4) this.mem.forget(e.id); if (t.why === 'trade') this.trade = null; this.task = null; this.planT = 0; this.lookAround(dt); return; }
        // jiggle peek: at a corner with the enemy believed around it, step out and back a few times before committing
        const d = dist2D(p.pos, t.pos);
        if (!this.peek && this.peekFor !== t.pos && this.prof.skill > 0.3 && d < 16 && d > 4) {
          const c = this.fol.nextCorner(p, 1.8, 0.7);
          if (c) { eyePos(p, EYE); LP.x = t.pos.x; LP.y = (t.pos.y || 0) + 1.4; LP.z = t.pos.z; if (!g.map.nav.losClear(EYE, LP)) { this.peek = { n: 0, t: now, yaw: c.yaw, out: true }; this.peekFor = t.pos; } }
        }
        if (this.peek) {
          const K = this.peek;
          if (now - K.t > (K.out ? 0.28 : 0.22) + this.rng() * 0.06) { K.out = !K.out; K.t = now; K.n++; }
          if (K.n >= 4) this.peek = null;
          else { this.mv.yaw = K.out ? K.yaw : K.yaw + Math.PI; this.mv.speed = 1; this.preaim(dt, t.pos, 1.3); return; }
        }
        this.navTo(t.pos, t.radius, t.walk); this.steer(dt, false);
        this.preaim(dt, t.pos);
        return;
      }
      case 'watch': this.watch(dt, t.pos); if (this.spot && !this.arrived(this.spot, 1)) { this.navTo(this.spot, 0.6, true); this.steer(dt, false); } return;
      case 'pickup':
        if (this.arrived(t.pos, 0.8)) { if (t.use && p.cur === 'primary') cmd.buttons |= BTN.USE; else if (t.use) cmd.slot = 'primary'; if (!this.g.drops.includes(t.drop)) this.planT = 0; }
        this.navTo(t.pos, 0.3, false); this.steer(dt); return;
      case 'stage': {
        this.atStage = this.arrived(t.pos, t.radius + 1.5);
        if (!this.arrived(t.pos, t.radius)) { this.navTo(t.pos, t.radius * 0.7, false); this.steer(dt); }
        else { this.watch(dt, t.look); this.wanderNear(dt, t.pos, 1.2, 2.5); }
        return;
      }
      case 'lurk':
        if (!this.arrived(t.pos, t.radius)) { this.navTo(t.pos, t.radius * 0.7, true); this.steer(dt); }
        else { this.mv.crouch = true; this.watch(dt, t.look); }
        return;
      case 'plant': {
        const site = O && O.siteAt(p);
        if (site && t.use && this.safe(2.5)) {
          cmd.buttons |= BTN.USE; this.lookAround(dt, true);
          if (!this.planted && p.busy === 'plant') { this.planted = true; this.team.say(this, 'Planting ' + (t.site || ''), 'plant' + g.match.round, 0); }
          return;
        }
        if (!this.arrived(t.pos, t.radius)) { this.navTo(t.pos, t.radius * 0.6, false); this.steer(dt); }
        else this.lookAround(dt, true);
        return;
      }
      case 'defuse': {
        const b = O && O.s.bomb;
        if (b && Math.hypot(p.pos.x - b.x, p.pos.z - b.z) < 1.25 && Math.abs(p.pos.y - b.y) < 1.5 && (this.safe(2.0) || (b.fuse < (p.inv.kit ? 7 : 12)))) {
          cmd.buttons |= BTN.USE; this.lookAround(dt, true);
          if (p.busy === 'defuse' && !this.defusing) { this.defusing = true; this.team.say(this, 'Defusing, cover me', 'def' + g.match.round, 0); }
          return;
        }
        this.defusing = false;
        this.navTo(t.pos, 0.6, false); this.steer(dt); return;
      }
      case 'defend': return this.defend(dt, t);
      case 'zone': {
        if (!this.arrived(t.pos, t.radius)) { this.navTo(t.pos, t.radius * 0.6, false); this.steer(dt); return; }
        this.wanderNear(dt, t.pos, t.radius * 0.8, 4); this.lookAround(dt, !this.fol.active);
        return;
      }
      case 'hide': {
        if (!this.arrived(t.pos, t.radius + 0.2)) { this.navTo(t.pos, t.radius * 0.5, true); this.steer(dt); return; }
        this.mv.crouch = true; this.mv.speed = 0;
        if (!this.hideYaw) { eyePos(p, EYE); this.hideYaw = openAngle(g, EYE, this.aim.yaw, Math.PI, 9).yaw; }
        this.aim.look(dt, this.hideYaw, 0.1, 0.4);
        return;
      }
      case 'seek': {
        if (!this.arrived(t.pos, t.radius)) { this.navTo(t.pos, t.radius * 0.7, false); this.steer(dt, false); this.preaim(dt, t.pos, 0.6); return; }
        this.preaim(dt, t.pos, 0.6); return;
      }
      case 'escort': {
        const c = t.target ? g.players.get(t.target) : null;
        const pos = t.self ? t.pos : c ? c.pos : t.pos;
        if (!pos) break;
        if (!this.arrived(pos, t.radius)) { this.navTo(pos, t.radius * 0.6, false); this.steer(dt); }
        else this.lookAround(dt, true);
        return;
      }
      case 'save':
        if (t.pos && !this.arrived(t.pos, t.radius)) { this.navTo(t.pos, t.radius, false); this.steer(dt); } else { this.mv.crouch = true; this.lookAround(dt, true); }
        return;
      case 'hunt': case 'go': {
        if (t.target && t.melee) { const q = g.players.get(t.target); if (q && q.alive) { this.navTo(q.pos, 0.8, false); this.steer(dt); return; } }
        if (this.arrived(t.pos, t.radius)) {
          if (t.use) cmd.buttons |= BTN.USE;
          if (t.kind === 'hunt') { this.wanderNear(dt, t.pos, 6, 3); }
          this.lookAround(dt, true);
          if (!t.use) this.planT = Math.min(this.planT, 0.1);
          return;
        }
        this.navTo(t.pos, Math.max(0.4, t.radius * 0.7), t.walk); this.steer(dt);
        return;
      }
    }
    // roam: random nav nodes
    if (!this.roamPos || this.arrived(this.roamPos, 2) || now - (this.roamT || 0) > 30) {
      const nav = g.map && g.map.nav; this.roamT = now;
      if (nav) { const n0 = nav.nearest(p.pos.x, p.pos.y + 0.3, p.pos.z, 3), c = n0 >= 0 ? nav.component(n0) : -1; const n = nav.randomNode(this.rng, i => c < 0 || nav.component(i) === c); if (n >= 0) this.roamPos = nav.nodePos(n); }
    }
    if (this.roamPos) { this.navTo(this.roamPos, 1.5, false); this.steer(dt); }
    else this.lookAround(dt, true);
  }
  defend(dt, t) {
    const g = this.g, p = this.p, now = g.time;
    // pick (and keep) a hold spot: distinct from team-mates, refreshed every 25-45 s
    if (!this.spot || now > this.spotT || (t.area && dist2D(this.spot, t.area) > 22) || (this.spot.fallback && t.spots && t.spots.length)) {
      const spots = t.spots && t.spots.length ? t.spots : null;
      this.spot = null;
      if (spots) {
        const taken = new Set(); for (const b of this.mgr.brains.values()) if (b !== this && b.p.team === p.team && b.spot) taken.add(b.spot);
        const free = spots.filter(s => !taken.has(s) && ![...taken].some(o => dist2D(o, s) < 2.5));
        const list = free.length ? free : spots;
        this.spot = list[Math.floor(this.rng() * Math.min(list.length, 3))];
      } else if (t.pos) this.spot = { x: t.pos.x + (this.rng() - 0.5) * 4, y: t.pos.y, z: t.pos.z + (this.rng() - 0.5) * 4, look: null, fallback: true };
      this.spotT = now + 25 + this.rng() * 20;
    }
    const s = this.spot;
    if (s && !this.arrived(s, 0.8)) { this.navTo(s, 0.5, dist2D(p.pos, s) < 12); this.steer(dt); return; }
    // holding: watch the angle standing (crouched behind low cover only to reload or when just hit), check other angles now and then
    this.mv.crouch = !!(s && s.crouch) && (p.ws.state === 'reload' || now - p.lastHurtT < 1.2);
    const look = (s && s.look) || t.watch || t.pos;
    this.watch(dt, this.checkYaw != null && now < this.checkT ? null : look);
    if (now > this.checkT + 3 + this.rng() * 4) { eyePos(p, EYE); this.checkYaw = openAngle(g, EYE, this.aim.yaw, 1.5, 7).yaw; this.checkT = now + 0.7 + this.rng() * 0.8; }
    if (this.checkYaw != null && now < this.checkT) this.aim.look(dt, this.checkYaw, 0.05, 0.7);
  }
  wanderNear(dt, c, r, every) {
    const g = this.g, p = this.p, now = g.time;
    if (now > this.wanderT) {
      this.wanderT = now + every * (0.6 + this.rng() * 0.8);
      const nav = g.map.nav;
      if (nav) { const list = nav.nodesNear(c.x, c.y || p.pos.y, c.z, r, [], { stride: 2, dy: 1.2, max: 300 }); if (list.length) { const n = list[Math.floor(this.rng() * list.length)]; this.wanderPos = nav.nodePos(n); } }
    }
    if (this.wanderPos && !this.arrived(this.wanderPos, 0.6)) { this.navTo(this.wanderPos, 0.5, true); this.steer(dt, false); }
  }
  safe(secs) {
    const now = this.g.time;
    if (this.tVisible) return false;
    for (const e of this.mem.entries(now, secs)) if (e.src === 'see' && dist2D(e, this.p.pos) < 30) return false;
    return true;
  }

  // ============================================================================================== looking
  watch(dt, pos) {
    if (!pos) return;
    const p = this.p; eyePos(p, EYE);
    const y = Math.atan2(pos.x - EYE.x, pos.z - EYE.z), pt = -Math.atan2(((pos.y || 0) + 1.3) - EYE.y, Math.max(0.5, Math.hypot(pos.x - EYE.x, pos.z - EYE.z)));
    this.aim.look(dt, y, clamp(pt, -0.6, 0.6), 1);
    this.lookYaw = this.aim.yaw; this.lookPitch = this.aim.pitch;
  }
  watchWhileMoving(threat) { void threat; }
  preaim(dt, pos, speed = 1) {
    const p = this.p; eyePos(p, EYE);
    // pre-aim the position at chest height, unless it is behind us while we walk away from it
    const y = Math.atan2(pos.x - EYE.x, pos.z - EYE.z);
    if (this.mv.speed > 0 && Math.abs(wrap(y - this.mv.yaw)) > 2.0) { this.lookAround(dt); return; }
    const pt = -Math.atan2(((pos.y || 0) + 1.3) - EYE.y, Math.max(0.5, Math.hypot(pos.x - EYE.x, pos.z - EYE.z)));
    this.aim.look(dt, y, clamp(pt, -0.5, 0.5), speed * 1.2);
    this.lookYaw = this.aim.yaw; this.lookPitch = this.aim.pitch;
  }
  /** Relaxed head: reacts to hits and sounds, checks the next corner and open angles, looks where it goes, never at a wall. */
  lookAround(dt, still = false) {
    const g = this.g, p = this.p, now = g.time;
    eyePos(p, EYE);
    let yaw = null, pitch = 0.02, speed = 1;
    const H = this.hurtLook, S = this.soundLook;
    if (this.lookAway > now - 0.9 && this.lookAway < now) { yaw = this.aim.yaw + 0.04; speed = 2; }
    else if (this.lookAway >= now) { yaw = this.aim.yaw + Math.PI * 0.7; speed = 2.5; }
    else if (H && now >= H.t && now < H.until) { yaw = Math.atan2(H.x - EYE.x, H.z - EYE.z); speed = 2.2; pitch = this.pitchTo(H); }
    else if (S && now >= S.t && now < S.until) { yaw = Math.atan2(S.x - EYE.x, S.z - EYE.z); speed = 1.5; pitch = this.pitchTo(S); }
    if (yaw == null) {
      const e = this.mem.best(now, 6, p.pos);
      if (e && dist2D(e, p.pos) < 45) {
        const y = Math.atan2(e.x - EYE.x, e.z - EYE.z);
        if (still || this.mv.speed === 0 || Math.abs(wrap(y - this.mv.yaw)) < 1.9) { yaw = y; pitch = this.pitchTo(e); speed = 1.2; }
      }
    }
    if (yaw == null && this.fol.active && this.mv.speed > 0) {
      const c = this.fol.nextCorner(p, 6, 0.55);
      if (c) { yaw = Math.atan2(c.x + Math.sin(c.yaw) * 4 - EYE.x, c.z + Math.cos(c.yaw) * 4 - EYE.z); }   // pre-aim around the corner
      else if (now < this.checkT && this.checkYaw != null) yaw = this.checkYaw;
      else {
        const lp = this.fol.lookPoint(p, 5, LP); yaw = lp ? Math.atan2(lp.x - EYE.x, lp.z - EYE.z) : this.mv.yaw;
        if (now > this.checkT + 1.2 + this.rng() * 1.5) {
          const oa = openAngle(g, EYE, yaw, 1.25, 7);
          if (oa.dist > 8) { this.checkYaw = oa.yaw; this.checkT = now + 0.5 + this.rng() * 0.6; }
          else this.checkT = now;
        }
      }
    }
    if (yaw == null) {
      if (now > this.checkT + 2 + this.rng() * 3 || this.checkYaw == null) { const oa = openAngle(g, EYE, this.aim.yaw, 1.7, 7); this.checkYaw = oa.yaw; this.checkT = now + 0.6; }
      yaw = this.checkYaw; speed = 0.6;
    }
    // never stare into a wall
    if (wallAhead(g, EYE, this.aim.yaw, this.aim.pitch, 1.2) && (!this.wallT || now - this.wallT > 0.5)) {
      this.wallT = now; const oa = openAngle(g, EYE, this.aim.yaw, 1.6, 7); this.checkYaw = oa.yaw; this.checkT = now + 0.6;
      if (yaw === this.aim.yaw || this.mv.speed === 0) yaw = oa.yaw;
    }
    this.aim.look(dt, yaw, clamp(pitch, -0.5, 0.5), speed);
    this.lookYaw = this.aim.yaw; this.lookPitch = this.aim.pitch;
  }
  pitchTo(pos) { return -Math.atan2(((pos.y || 0) + 1.3) - EYE.y, Math.max(0.5, Math.hypot(pos.x - EYE.x, pos.z - EYE.z))); }

  /** State for tests / the debug overlay. */
  debug() {
    const t = this.task;
    return { id: this.id, task: t ? t.kind : null, why: t && t.why, goal: this.goal ? this.goal.kind : null, target: this.target ? this.target.id : null,
      vis: [...this.vis.keys()], path: this.fol.active ? this.fol.path.length - this.fol.i : 0, nade: this.nade ? this.nade.gid + ':' + this.nade.phase : null,
      spot: this.spot ? [+this.spot.x.toFixed(1), +this.spot.z.toFixed(1)] : null, mem: this.mem.entries(this.g.time, 10).length, yaw: +this.aim.yaw.toFixed(2) };
  }
}

export function createBot(mgr, p) { return new Bot(mgr, p); }
function hashId(s) { let h = 2166136261; s = String(s); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

// ================================================================================================== the manager (game system 'bots')
export class BotManager {
  constructor(game) {
    this.name = 'bots'; this.g = game; this.rng = game.rng || Math.random;
    this.brains = new Map(); this.teams = new Map();
    this.paths = new PathService(game);
    this.handlesBuy = true;
    this.sites = new Map();
    this.perf = { n: 0, ms: 0, max: 0, cur: 0, ring: new Float32Array(4096), ringB: new Float32Array(4096), ri: 0, rn: 0 };
    this.st = { nades: 0, thrown: 0, repaths: 0, ticks: 0, tickMs: 0, tickMax: 0, thinkMax: 0 };
    this.nadesOk = false; this.err = null;
    const on = (n, f) => game.bus.on(n, e => { try { f(e || {}); } catch (er) { if (!this.err) { this.err = er; console.error('[bots] ' + n, er); } } });
    this.offs = [
      on('shot', e => { if (e.p) this.sound(e.p, e.p.pos, e.suppressed ? HEAR.shotSup : HEAR.shot, 'shot'); }),
      on('footstep', e => { if (e.p) this.sound(e.p, e.p.pos, HEAR.step * (e.loud ? 1.3 : 1), 'step'); }),
      on('land', e => { if (e.p && e.speed > 4) this.sound(e.p, e.p.pos, HEAR.land, 'land'); }),
      on('reload', e => { if (e.p && e.stage === 'start') this.sound(e.p, e.p.pos, HEAR.reload, 'reload'); }),
      on('grenade:throw', e => { if (e.p) this.sound(e.p, e.p.pos, HEAR.nade, 'nade'); this.onNade(e); }),
      on('objective', e => { if (e.actor && (e.action === 'plant_start' || e.action === 'defuse_start')) this.sound(e.actor, e.actor.pos, 26, 'obj'); }),
      on('hit', e => { const v = e.victim; if (v && v.bot) { const b = this.brains.get(v.id); if (b && e.attacker && e.attacker !== v) b.hurt(e.attacker, e.dmg); } }),
      on('kill', e => this.onKill(e)),
      on('spawn', e => { const b = e.p && this.brains.get(e.p.id); if (b) { b.reset(); b.aim.reset(e.p.yaw, 0); } }),
      on('round:freeze', () => this.roundStart()),
      on('round:start', () => { if (!this._roundSeen || this._roundSeen !== (game.match && game.match.round)) this.roundStart(); }),
      on('match:start', () => { this.sites.clear(); }),
    ];
  }
  team(t) { let T = this.teams.get(t); if (!T) { T = new TeamBrain(this, t); this.teams.set(t, T); } return T; }
  brain(p) { let b = this.brains.get(p.id); if (!b) { b = createBot(this, p); this.brains.set(p.id, b); } return b; }
  remove(id) { const b = this.brains.get(id); if (b) this.paths.cancel(b); this.brains.delete(id); }
  takeBudget() { return true; }
  roundStart() {
    const m = this.g.match; this._roundSeen = m ? m.round : 0;
    for (const T of this.teams.values()) T.roundStart(this._roundSeen);
    for (const b of this.brains.values()) { b.mem.clear(); b.retakeNade = false; b.spot = null; b.task = null; b.planted = false; b.defusing = false; b.atStage = false; b.nade = null; b.trade = null; b.hideYaw = null; }
  }
  sound(src, pos, range, kind) {
    const g = this.g, nav = g.map && g.map.nav;
    for (const b of this.brains.values()) {
      const p = b.p;
      if (!p.alive || p === src || !isEnemy(p, src) || p.blind > 0) continue;
      const d = Math.hypot(pos.x - p.pos.x, pos.z - p.pos.z, (pos.y - p.pos.y) * 1.5);
      const R = range * b.prof.hear;
      if (d > R) continue;
      let occ = false;
      if (d > R * 0.5 && nav) { eyePos(p, EYE); LP.x = pos.x; LP.y = pos.y + 1.2; LP.z = pos.z; occ = !nav.losClear(EYE, LP); if (occ) continue; }
      else if (nav && d > 4) { eyePos(p, EYE); LP.x = pos.x; LP.y = pos.y + 1.2; LP.z = pos.z; occ = !nav.losClear(EYE, LP); }
      b.hear(src, pos, kind, d, occ);
    }
  }
  onNade(e) {
    const g = this.g, n = e.nade, thrower = e.p; if (!thrower) return;
    const nd = getNade(e.gid); if (!nd) return;
    // flashes: bots that see the throw (or the grenade flying at them) turn away, by skill
    if (nd.kind === 'flash' || nd.kind === 'ninebang') {
      for (const b of this.brains.values()) {
        const p = b.p; if (!p.alive || !isEnemy(p, thrower)) continue;
        if (!b.vis.has(thrower.id) && !(n && n.pos && dist2D(n.pos, p.pos) < 12)) continue;
        if (this.rng() < 0.25 + 0.6 * b.prof.skill) b.lookAway = g.time + 0.35 + this.rng() * 0.25;
      }
    }
    void n;
  }
  onKill(e) {
    const g = this.g, v = e.victim, k = e.killer;
    if (!v) return;
    for (const b of this.brains.values()) {
      b.mem.forget(v.id);
      if (b.target === v) { b.target = null; b.aim.lose(); }
      // a team-mate died near me: trade (go where the shots came from)
      if (k && b.p.alive && b.p !== v && !isEnemy(b.p, v) && isEnemy(b.p, k) && b.p.team > 0 && dist2D(b.p.pos, v.pos) < 22) {
        b.trade = { x: k.pos.x + (this.rng() - 0.5) * 3, y: k.pos.y, z: k.pos.z + (this.rng() - 0.5) * 3, t: g.time };
        b.mem.hear(k.id, k.pos, g.time, 2.5, this.rng);
      }
    }
    if (v.bot && v.team > 0 && k && k !== v) {
      const b = this.brains.get(v.id);
      // last words: where the killer was (callout from the dead, like 'one B site, low')
      if (b) { const T = this.team(v.team); T.say(b, 'Died ' + areaName(g, k.pos.x, k.pos.y, k.pos.z, v.team) + (k.hp < 50 ? ', he\'s low' : ''), 'dead' + v.id, 6); for (const o of this.brains.values()) if (o.p.team === v.team && o !== b && o.p.alive) o.mem.team(k.id, k.pos, g.time, 0.8); }
    }
  }
  /** Per site: attacker / defender routes (lobby -> site), entries, staging points, hold spots. Built asynchronously through
      the path service the first time a bot asks; returns what is known so far. kind 'post' = spots around the planted charge. */
  siteInfo(name, kind) {
    const g = this.g, S = g.map && g.map.sites && g.map.sites[name]; if (!S) return null;
    const key = name + (kind === 'post' ? ':post' : '');
    let I = this.sites.get(key);
    if (I) return I;
    I = { name, route: {}, spots: {}, pending: 0 };
    this.sites.set(key, I);
    const L = g.map.lobbies || {}, centre = { x: S.x, y: S.y || 0, z: S.z };
    if (kind === 'post') {
      const b = g.objectives && g.objectives.s.bomb; const c = b && b.state === 'planted' ? { x: b.x, y: b.y, z: b.z } : centre;
      const base = this.siteInfo(name);
      const ents = base && base.route[2] ? [base.route[2].entry] : [];
      I.spots[1] = holdSpots(g, c, ents.length ? ents : [c], { rng: this.rng, minR: 3, maxR: 14, prefer: 6 });
      return I;
    }
    for (const t of [1, 2]) {
      const lb = L[t]; if (!lb) continue;
      I.pending++;
      this.paths.request({ site: key, t }, { x: lb.x, y: (lb.y || 0) + 0.2, z: lb.z }, centre, path => {
        I.pending--;
        const r = routeInfo(path, centre); if (r) I.route[t] = r;
        // attackers: a second route that avoids the first one (split executes, a second entry for the defenders to watch)
        const nav = g.map.nav;
        if (r && t === 1 && nav && path.length > 20) {
          const mark = new Uint8Array(nav.nodeCount), tmp = [];
          for (let i = Math.floor(path.length * 0.25); i < path.length; i += 4) {
            if (Math.hypot(path[i].x - centre.x, path[i].z - centre.z) < 9) continue;
            nav.nodesNear(path[i].x, path[i].y, path[i].z, 3, tmp, { stride: 1, dy: 1.5 }); for (const n of tmp) mark[n] = 1;
          }
          I.pending++;
          this.paths.request({ site: key, t: 'alt' }, { x: lb.x, y: (lb.y || 0) + 0.2, z: lb.z }, centre, p2 => {
            I.pending--;
            const r2 = routeInfo(p2, centre);
            if (r2 && dist2D(r2.entry, r.entry) > 7 && r2.len < r.len * 1.8) I.route.alt = r2;
            if (I.pending === 0) this.siteSpots(I, centre);
          }, { prio: 1, gatesOpen: true, smooth: false, cost: u => (mark[u] ? 1.2 : 0) });
        }
        if (I.pending === 0) this.siteSpots(I, centre);
      }, { prio: 1, gatesOpen: true, smooth: false });
    }
    if (!I.pending) this.siteSpots(I, centre);
    return I;
  }
  siteSpots(I, centre) {
    const g = this.g;
    // defenders hold the attackers' entry; attackers (after taking the site) hold the defenders' entry
    const e1 = I.route[1] ? [I.route[1].entry] : [], e2 = I.route[2] ? [I.route[2].entry] : [];
    if (I.route.alt) e1.push(I.route.alt.entry);
    I.spots[2] = holdSpots(g, centre, e1.length ? e1 : [centre], { rng: this.rng });
    I.spots[1] = holdSpots(g, centre, e2.length ? e2 : [centre], { rng: this.rng, maxR: 12, prefer: 5 });
  }
  tick(dt) {
    const t0 = nowMs(), g = this.g, P = this.perf;
    // the previous tick's total bot cost (system + every brain) -> ring buffer (percentiles in stats())
    P.ring[P.ri] = P.cur + (this._sysLast || 0); P.ringB[P.ri] = P.cur; P.ri = (P.ri + 1) & 4095; P.rn = Math.min(4096, P.rn + 1); P.cur = 0;
    this.nadesOk = !!(g.getSystem && g.getSystem('nades'));
    this.paths.tick();
    for (const T of this.teams.values()) T.tick();
    // the team buy (economy modes): once per team per round, as soon as everybody can buy
    const E = g.economy, m = g.match;
    if (E && E.on && m && (m.phase === 'freeze' || m.phase === 'live') && E.buyLeft() > 0) {
      for (const t of [1, 2]) { const T = this.team(t); if (T.buyRound !== m.round) { try { T.buy(); } catch (e) { T.buyRound = m.round; console.error('[bots] buy', e); } } }
    }
    // memory upkeep every ~2 s
    if ((g.tick & 127) === 0) for (const b of this.brains.values()) b.mem.prune(g.time, id => { const q = g.players.get(id); return !!(q && q.alive); });
    const ms = nowMs() - t0; this.st.ticks++; this.st.tickMs += ms; if (ms > this.st.tickMax) this.st.tickMax = ms; this._sysLast = ms;
  }
  /** Perf + behaviour counters (tests). */
  stats() {
    const P = this.perf, S = this.st;
    const r = Array.from(P.ring.subarray(0, P.rn)).sort((a, b) => a - b), pc = k => (r.length ? +r[Math.min(r.length - 1, Math.floor(r.length * k))].toFixed(3) : 0);
    const rb = Array.from(P.ringB.subarray(0, P.rn)).sort((a, b) => a - b);
    return { brainsP99: rb.length ? +rb[Math.floor(rb.length * 0.99)].toFixed(3) : 0, tickAvg: r.length ? +(r.reduce((a, b) => a + b, 0) / r.length).toFixed(3) : 0, tickP50: pc(0.5), tickP99: pc(0.99), tickMax: pc(1), bots: this.brains.size, thinkAvg: P.n ? +(P.ms / P.n).toFixed(4) : 0, thinkMax: +P.max.toFixed(3), thinkWhat: P.what, slow: P.slow | 0, sysAvg: S.ticks ? +(S.tickMs / S.ticks).toFixed(4) : 0,
      sysMax: +S.tickMax.toFixed(3), paths: { ...this.paths.stats, queue: this.paths.q.length }, nades: S.nades, thrown: S.thrown, repaths: S.repaths,
      buys: [...this.teams.values()].map(T => T.lastBuy).filter(Boolean), err: this.err ? String(this.err.stack || this.err) : null };
  }
  statsReset() { this.perf = { n: 0, ms: 0, max: 0, cur: 0, ring: new Float32Array(4096), ringB: new Float32Array(4096), ri: 0, rn: 0 }; this.st.ticks = 0; this.st.tickMs = 0; this.st.tickMax = 0; this.paths.stats.msMax = 0; }
  dispose() { for (const f of this.offs) f(); this.offs.length = 0; this.brains.clear(); this.teams.clear(); this.paths.clear(); this.sites.clear(); }
}
