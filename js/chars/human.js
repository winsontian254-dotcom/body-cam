/* LIVE FIRE — third-person characters (the 'bodies' system; replaces js/game/bodies.js through game.js setBodyFactory).
   Soldiers are built from the Neon Veins human kit (assets/models/human_kit.glb) plus tactical gear made in code (gear.js), in two
   original team kits with six variants each (looks.js, deterministic per player id), posed every frame by anim.js (the upper
   body sits on the hitbox.js capsules), holding their current weapon (models.js buildGun LOD 1 near / 2 far, attachments
   included), with the secondary in its holster and the primary slung while another item is in hand. Deaths become ragdolls
   (ragdoll.js) that collide with the world and stay for the round. Every body part and gear piece of every character is a thin
   instance of a per-scene host mesh with ONE shared material (kit.js), so 16 soldiers cost one draw call per part, not per
   soldier; LOD: near / far meshes chosen per character by camera distance.
   Exports:
     createCharacters(scene, game) -> Characters   (the body factory; game.js registers it)
     class Characters (game system 'bodies')
       ready                      Promise: the kit is loaded and the batches exist (game.js awaits it)
       add(p), remove(p)          players (the local player is drawn only for the shadow, or fully when game.thirdPerson is set)
       muzzleOf(p, out) -> out | null   world muzzle of p's third-person weapon (effects.js flashes / tracers)
       casters() -> meshes        shadow casters (the batch hosts)
       frame(dt, alpha), late(dt), dispose()
       stats() -> { chars, corpses, draws, tris, instances, ms }
       poseOf(p) -> pose          the last anim.js pose of p (tests, debug)
       debug { hitboxes, cam }    dev: hitbox overlay (#dev&hitboxes), a free camera { pos, target } overriding the game camera
   Local player: in first person its body only renders into the shadow map (layer mask), and the player being spectated is
   hidden from the camera the same way. game.thirdPerson = true draws the local player normally. */
import { loadKit, Batch, charMaterial, setPaletteRow, PAL_ROWS, orient } from './kit.js';
import { newAnim, newPose, animate, kick, flinch, land, jumped, frameMul, newFrame } from './anim.js';
import { lookFor, paletteOf } from './looks.js';
import { buildGearSet, KIT_PARTS } from './gear.js';
import { Ragdoll } from './ragdoll.js';
import { HitboxOverlay } from './debug.js';
import { NameTags } from './tags.js';
import { buildGun } from '../weapons/models.js';
import { buildNade } from '../grenades/models.js';
import { currentWeapon, statsOf, reloadProgress } from '../game/weapon.js';
import { getGun } from '../weapons/data.js';
import { Bodies } from '../game/bodies.js';
import { DEV } from '../core/dev.js';
import { clamp } from '../core/util.js';

const MAX_CORPSES = 16, CORPSE_LIFE = 25;
const LOD_FAR = 15, GUN_FAR = 20;               // metres: far body meshes / far gun model beyond
const CATS_RIFLE = new Set(['rifle', 'carbine', 'br', 'dmr', 'sniper', 'lmg', 'smg', 'shotgun']);

// ------------------------------------------------------------------------------------------------ matrix helpers
const M16 = new Float32Array(16);
/** instance matrix: mesh-local v -> world = O' + X*sx*vx + Y*sy*vy + Z*sz*vz, with O' = F.o - (X*ax*sx + Y*ay*sy + Z*az*sz) */
function partMatrix(M, F, a, sx, sy, sz) {
  const X = F.x, Y = F.y, Z = F.z;
  M[0] = X[0] * sx; M[1] = X[1] * sx; M[2] = X[2] * sx; M[3] = 0;
  M[4] = Y[0] * sy; M[5] = Y[1] * sy; M[6] = Y[2] * sy; M[7] = 0;
  M[8] = Z[0] * sz; M[9] = Z[1] * sz; M[10] = Z[2] * sz; M[11] = 0;
  M[12] = F.o[0] - (X[0] * a[0] * sx + Y[0] * a[1] * sy + Z[0] * a[2] * sz);
  M[13] = F.o[1] - (X[1] * a[0] * sx + Y[1] * a[1] * sy + Z[1] * a[2] * sz);
  M[14] = F.o[2] - (X[2] * a[0] * sx + Y[2] * a[1] * sy + Z[2] * a[2] * sz);
  M[15] = 1;
  return M;
}
/** quaternion (x, y, z, w) from an orthonormal frame (rows x, y, z = images of the local axes) into q */
function quatFromFrame(F, q) {
  // rotation matrix columns in Babylon's row-vector convention: m[r][c] with row r = image of axis r
  const m00 = F.x[0], m01 = F.x[1], m02 = F.x[2], m10 = F.y[0], m11 = F.y[1], m12 = F.y[2], m20 = F.z[0], m21 = F.z[1], m22 = F.z[2];
  const tr = m00 + m11 + m22;
  let x, y, z, w;
  if (tr > 0) { const s = 0.5 / Math.sqrt(tr + 1); w = 0.25 / s; x = (m12 - m21) * s; y = (m20 - m02) * s; z = (m01 - m10) * s; }
  else if (m00 > m11 && m00 > m22) { const s = 2 * Math.sqrt(1 + m00 - m11 - m22); w = (m12 - m21) / s; x = 0.25 * s; y = (m10 + m01) / s; z = (m20 + m02) / s; }
  else if (m11 > m22) { const s = 2 * Math.sqrt(1 + m11 - m00 - m22); w = (m20 - m02) / s; x = (m10 + m01) / s; y = 0.25 * s; z = (m21 + m12) / s; }
  else { const s = 2 * Math.sqrt(1 + m22 - m00 - m11); w = (m01 - m10) / s; x = (m20 + m02) / s; y = (m21 + m12) / s; z = 0.25 * s; }
  q.set(x, y, z, w);
  return q;
}
/** place a TransformNode on a frame */
function placeNode(node, F) {
  node.position.set(F.o[0], F.o[1], F.o[2]);
  if (!node.rotationQuaternion) node.rotationQuaternion = new BABYLON.Quaternion();
  quatFromFrame(F, node.rotationQuaternion);
}
/** local frame (relative to root) of a node of a gun model */
function localFrame(root, node) {
  if (!node) return null;
  root.computeWorldMatrix(true);
  const inv = root.getWorldMatrix().clone().invert();
  const w = node.computeWorldMatrix(true).multiply(inv).m;
  const ax = [w[0], w[1], w[2]], ay = [w[4], w[5], w[6]], az = [w[8], w[9], w[10]];
  const n = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
  return { o: [w[12], w[13], w[14]], x: n(ax), y: n(ay), z: n(az) };
}

export function createCharacters(scene, game) { return new Characters(scene, game); }

export class Characters {
  constructor(scene, game) {
    this.name = 'bodies'; this.scene = scene; this.g = game;
    this.list = new Map();                 // id -> char record
    this.corpses = [];
    this.drops = new Map();
    this.batches = new Map();              // key -> Batch
    this.rows = new Map(); this.nextRow = 0;
    this.debug = { hitboxes: !!(DEV.dev && DEV.hitboxes), cam: null };
    this.ok = false; this.fallback = null;
    this.ms = 0; this.lastStats = null;
    this.thirdPersonOverride = null;
    this.offs = [];
    this.ready = loadKit(scene).then(KD => { if (this.disposed) return; this.KD = KD; this.build(); this.ok = true; })
      .catch(e => {
        console.warn('[chars] human kit unavailable, using placeholder bodies: ' + ((e && e.message) || e));
        if (this.disposed) return;
        this.fallback = new Bodies(scene, game);
      });
    const on = (n, f) => this.offs.push(game.bus.on(n, e => { try { f(e); } catch (er) { console.error('[chars] ' + n, er); } }));
    on('shot', e => { const c = e.p && this.list.get(e.p.id); if (c) { kick(c.A, clamp((e.kick || 1) * (e.ads ? 0.7 : 1), 0.3, 3)); c.lastShot = this.g.time; this.flash(c, e); } });
    on('hit', e => {
      const c = e.victim && this.list.get(e.victim.id); if (!c || !e.dir) return;
      const p = e.victim, sy = Math.sin(p.yaw), cy = Math.cos(p.yaw);
      const lx = e.dir.x * cy - e.dir.z * sy, lz = e.dir.x * sy + e.dir.z * cy;
      flinch(c.A, lx, lz, clamp((e.dmg || 20) / 40, 0.3, 1.5), e.group === 'head');
      c.lastHit = e;
    });
    on('land', e => { const c = e.p && this.list.get(e.p.id); if (c) land(c.A, e.speed || 3); });
    on('jump', e => { const c = e.p && this.list.get(e.p.id); if (c) jumped(c.A); });
    on('reload', e => { const c = e.p && this.list.get(e.p.id); if (!c) return; if (e.stage === 'start') c.rlEv = { t0: this.g.time, gun: e.gun }; else if (e.stage === 'end' || e.stage === 'cancel') c.rlEv = null; });
    on('grenade:throw', e => { const c = e.p && this.list.get(e.p.id); if (c) c.thrownAt = this.g.time; });
    on('melee', e => { const c = e.p && this.list.get(e.p.id); if (c) c.meleeEv = { t0: this.g.time, kind: e.kind, side: e.side }; });
    on('kill', e => this.onKill(e));
    on('round:reset', () => { for (const k of this.corpses) this.freeCorpse(k); this.corpses.length = 0; });
    for (const p of game.players.values()) this.add(p);
  }

  // ------------------------------------------------------------------------------------------------ setup
  build() {
    const scene = this.scene, KD = this.KD;
    charMaterial(scene);
    const mk = (key, geo, roles, cap = 24, opts) => { if (!geo) return null; const b = new Batch(scene, 'ch_' + key, geo, roles, cap, opts); this.batches.set(key, b); return b; };
    for (const P of KIT_PARTS) {
      if (!this.batches.has('k:' + P.hi)) mk('k:' + P.hi, KD[P.hi], P.role);
      if (!this.batches.has('k:' + P.lo)) mk('k:' + P.lo, KD[P.lo], P.role);
    }
    // gear (and the head variants / gloves), built in code against the kit's shapes
    this.gear = buildGearSet(KD);
    for (const [key, g] of Object.entries(this.gear.geos)) { if (!g) continue; orient(g, KD._ref); mk('g:' + key, g, null, 24); }
    // shadow-only copies (local player in first person): far meshes, own geometry, layer-masked away from the camera
    this.shadowKeys = [];
    for (const [key, b] of [...this.batches]) {
      if (!/_lo|:lo:|lo2/.test(key)) continue;
      const geo = key.startsWith('k:') ? KD[key.slice(2)] : this.gear.geos[key.slice(2)];
      const s = new Batch(scene, 'chs_' + key, geo, key.startsWith('k:') ? null : null, 4, { shadowOnly: true });
      if (key.startsWith('k:')) { const P = KIT_PARTS.find(q => q.lo === key.slice(2)); if (P) s.mesh.setVerticesData('lfRole', new Float32Array(geo.p.length / 3).fill(P.role), false, 1); }
      this.batches.set('s' + key, s); this.shadowKeys.push('s' + key);
    }
    // shadow casters: game.js registers casters() once init is done (it awaits this.ready); later batches add themselves
    this.overlay = this.debug.hitboxes ? new HitboxOverlay(scene) : null;
    this.tags = new NameTags(this.g);
    for (const c of this.list.values()) this.setupChar(c);
  }

  rowFor(look) {
    let r = this.rows.get(look.key);
    if (r == null) {
      r = this.nextRow++ % PAL_ROWS; this.rows.set(look.key, r);
      setPaletteRow(this.scene, r, paletteOf(look));
    }
    return r;
  }

  add(p) {
    if (this.fallback) return this.fallback.add(p);
    if (this.list.has(p.id)) return;
    const c = { p, A: newAnim(hashId(p.id)), O: newPose(), look: null, row: 0, team: -1, gm: null, gmKey: '', sec: null, secKey: '', prim: null, primKey: '', item: null, itemKey: '',
      vis: false, dist: 0, lod: 0, lastShot: -9, rlEv: null, meleeEv: null, thrownAt: -9, gripCache: null, flashT: 0, helmet: true };
    this.list.set(p.id, c);
    if (this.ok) this.setupChar(c);
  }
  setupChar(c) { c.look = lookFor(c.p); c.team = c.p.team; c.row = this.rowFor(c.look); c.gearList = this.gear.listFor(c.look.variant, true); c.gearNoHelm = this.gear.listFor(c.look.variant, false); }
  remove(p) {
    if (this.fallback) return this.fallback.remove(p);
    const c = this.list.get(p.id); if (!c) return;
    for (const k of ['gm', 'sec', 'prim', 'item']) if (c[k]) { c[k].dispose(); c[k] = null; }
    if (this.tags) this.tags.remove(p.id);
    this.list.delete(p.id);
  }
  casters() { if (this.fallback) return this.fallback.casters(); return [...this.batches.values()].map(b => b.mesh); }
  muzzleOf(p, out) {
    if (this.fallback) return this.fallback.muzzleOf(p, out);
    const c = this.list.get(p.id); if (!c || !c.gm || !c.gm.muzzle || !c.vis) return null;
    const v = c.gm.muzzle.getAbsolutePosition(); out.x = v.x; out.y = v.y; out.z = v.z; return out;
  }
  poseOf(p) { const c = this.list.get(p.id); return c ? c.O : null; }

  // ------------------------------------------------------------------------------------------------ per frame
  frame(dt, alpha) {
    if (this.fallback) return this.fallback.frame(dt, alpha);
    if (!this.ok) return;
    const t0 = performance.now();
    dt = Math.min(dt || 0, 0.1);
    const g = this.g, cam = g.camera;
    if (this.debug.cam && cam) { const d = this.debug.cam; cam.position.set(d.pos[0], d.pos[1], d.pos[2]); cam.setTarget(new BABYLON.Vector3(d.target[0], d.target[1], d.target[2])); if (d.fov) cam.fov = d.fov; }
    const cx = cam ? cam.position.x : 0, cy = cam ? cam.position.y : 0, cz = cam ? cam.position.z : 0;
    for (const b of this.batches.values()) b.reset();
    if (this.overlay) this.overlay.reset();
    const third = !!(this.thirdPersonOverride != null ? this.thirdPersonOverride : g.thirdPerson);
    const spec = g.spectate && g.local && !g.local.alive ? g.spectate : null;
    for (const c of this.list.values()) {
      const p = c.p;
      if (c.team !== p.team || (c.helmet !== !!p.helmet)) { c.helmet = !!p.helmet; this.setupChar(c); }
      if (!p.alive) { c.vis = false; this.hideItems(c); continue; }
      const shadowOnly = (p.local && !third) || (spec && p.id === spec);
      const st = this.interp(c, alpha);
      c.dist = Math.hypot(st.pos.x - cx, st.pos.y + 1 - cy, st.pos.z - cz);
      c.lod = c.dist > LOD_FAR ? 1 : 0;
      this.pose(c, st, dt);
      c.vis = !shadowOnly;
      this.emit(c, shadowOnly);
      this.items(c, shadowOnly, dt);
      if (this.overlay) this.overlay.player(p, g.tick);
    }
    // corpses
    const life = g.mode && g.mode.respawn ? CORPSE_LIFE : 1e9;
    for (let i = this.corpses.length - 1; i >= 0; i--) {
      const k = this.corpses[i]; k.t += dt;
      if (k.t > life) { this.freeCorpse(k); this.corpses.splice(i, 1); continue; }
      k.rag.step(dt, g.world);
      k.rag.toPose(k.O);
      if (k.t > life - 2) { const s = (k.t - (life - 2)) * 0.12; for (const F of Object.values(k.O.bones)) F.o[1] -= s; }
      this.emitCorpse(k);
    }
    for (const b of this.batches.values()) b.flush();
    this.updateDrops();
    if (this.overlay) this.overlay.flush();
    this.ms = this.ms * 0.9 + (performance.now() - t0) * 0.1;
  }
  late(dt) { if (this.ok && this.tags) this.tags.update(this.list, dt); }

  /** interpolated state of a player between ticks */
  interp(c, alpha) {
    const p = c.p, pv = p.prev, a = clamp(alpha, 0, 1), s = c.st || (c.st = { pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 } });
    s.pos.x = pv.x + (p.pos.x - pv.x) * a; s.pos.y = pv.y + (p.pos.y - pv.y) * a; s.pos.z = pv.z + (p.pos.z - pv.z) * a;
    const dy = p.yaw - pv.yaw; s.yaw = pv.yaw + Math.atan2(Math.sin(dy), Math.cos(dy)) * a;
    s.pitch = pv.pitch + (p.pitch - pv.pitch) * a; s.crouch = pv.crouch + (p.crouch - pv.crouch) * a; s.lean = pv.lean + (p.lean - pv.lean) * a;
    // velocity: the simulated one (remote players: from the position deltas)
    if (p.remote) { const k = 64; s.vel.x = (p.pos.x - pv.x) * k; s.vel.y = (p.pos.y - pv.y) * k; s.vel.z = (p.pos.z - pv.z) * k; }
    else { s.vel.x = p.vel.x; s.vel.y = p.vel.y; s.vel.z = p.vel.z; }
    return s;
  }

  /** weapon-related input for anim.js */
  pose(c, st, dt) {
    const p = c.p, g = this.g, ws = p.ws || {}, w = currentWeapon(p);
    const I = c.I || (c.I = { pos: null, vel: null, grip: null, reload: null, melee: null, nade: null, ground: null });
    I.pos = st.pos; I.vel = st.vel; I.yaw = st.yaw; I.pitch = st.pitch; I.crouch = st.crouch; I.lean = st.lean;
    I.onGround = p.onGround; I.mantle = !!p.mantle; I.t = g.time;
    I.action = p.action || null;
    let hold = 'none';
    if (p.cur === 'nade') hold = 'nade';
    else if (w && w.melee) hold = 'knife';
    else if (w) { const gun = getGun(w.gunId); hold = gun && gun.cat === 'pistol' ? 'pistol' : gun ? 'rifle' : 'none'; }
    I.hold = hold;
    I.ads = ws.ads || 0;
    I.wstate = ws.state || 'idle'; I.wu = ws.dur ? clamp(ws.t / ws.dur, 0, 1) : 1;
    // reload: from the weapon state (simulated players) or from the events (remote)
    I.reload = null;
    if (ws.state === 'reload' && ws.rl) {
      const rl = ws.rl, R = I.rlObj || (I.rlObj = {});
      R.kind = rl.kind; R.empty = !!rl.empty; R.t = rl.t; R.n = rl.n || 0;
      if (rl.kind === 'shell') { const s = w && statsOf(w); R.per = s && s.shell ? s.shell.per : 0.5; R.u = clamp(rl.phase === 'start' ? 0.05 : rl.phase === 'end' ? 0.95 : 0.5, 0, 1); }
      else R.u = clamp(rl.t / rl.dur, 0, 1);
      I.reload = R;
    } else if (c.rlEv && p.remote && w) {
      const s = statsOf(w), dur = (s && s.reload) || 2.5, R = I.rlObj || (I.rlObj = {});
      R.kind = s && s.reloadKind === 'shell' ? 'shell' : 'mag'; R.empty = false; R.t = g.time - c.rlEv.t0; R.u = clamp(R.t / dur, 0, 1); R.per = s && s.shell ? s.shell.per : 0.5;
      if (R.u >= 1) c.rlEv = null; else I.reload = R;
    }
    // melee
    I.melee = null;
    if (ws.ml) { const m = I.mlObj || (I.mlObj = {}); m.kind = ws.ml.kind; m.u = clamp(ws.ml.t / (ws.ml.dur || 0.5), 0, 1); m.side = ws.ml.side; I.melee = m; }
    else if (c.meleeEv && g.time - c.meleeEv.t0 < 0.6) { const m = I.mlObj || (I.mlObj = {}); m.kind = c.meleeEv.kind; m.u = (g.time - c.meleeEv.t0) / 0.6; m.side = c.meleeEv.side; I.melee = m; }
    // grenade
    I.nade = hold === 'nade' ? (I.ndObj || (I.ndObj = {})) : null;
    if (I.nade) { I.nade.cook = ws.nadeT != null ? ws.nadeT : -1; I.nade.under = !!(ws.btn & 2) && !(ws.btn & 1); }
    I.thrown = g.time - c.thrownAt;
    // gun hand frames
    this.ensureGun(c, w, hold);
    I.grip = c.gm ? c.gripCache : null;
    if (!I.ground) { const world = g.world, out = {}; I.ground = (x, z, yFrom) => { const r = world && world.groundAt(x, z, yFrom, 0.05, out); return r ? r.y : null; }; }
    animate(c.A, I, dt, c.O);
  }

  /** the weapon model in the hands (LOD by distance), its grip frames */
  ensureGun(c, w, hold) {
    const want = (hold === 'rifle' || hold === 'pistol') && w ? w : null;
    const lod = c.dist > GUN_FAR ? 2 : 1;
    const key = want ? want.uid + ':' + lod : '';
    if (key !== c.gmKey) {
      if (c.gm) { c.gm.dispose(); c.gm = null; }
      c.gmKey = key; c.gripCache = null;
      if (want) {
        try {
          c.gm = buildGun(this.scene, want.gunId, { lod, skin: want.skin, mods: want.mods, instance: true });
          for (const m of c.gm.root.getChildMeshes(false)) { m.isPickable = false; }
          c.gm.root.position.set(0, 0, 0); c.gm.root.rotationQuaternion = BABYLON.Quaternion.Identity();
          const gr = localFrame(c.gm.root, c.gm.hands && c.gm.hands.right), gl = localFrame(c.gm.root, c.gm.hands && c.gm.hands.left);
          const mag = c.gm.parts && c.gm.parts.mag ? localFrame(c.gm.root, c.gm.parts.mag) : null;
          const lk = c.gm.hands && c.gm.hands.left && c.gm.hands.left.metadata && c.gm.hands.left.metadata.meta ? c.gm.hands.left.metadata.meta.kind : 'hold';
          c.gripCache = { r: gr, l: gl, lk, mag: mag ? mag.o : null };
          c.magRest = c.gm.parts && c.gm.parts.mag ? c.gm.parts.mag.position.clone() : null;
          const env = this.g.env;
          if (env && env.shadow) for (const m of c.gm.root.getChildMeshes(false)) { try { env.shadow.addShadowCaster(m, false); } catch (e) { /* ok */ } }
        } catch (e) { console.warn('[chars] gun model', want.gunId, e); c.gm = null; }
      }
    }
  }

  hideItems(c) { for (const k of ['gm', 'sec', 'prim', 'item']) if (c[k]) c[k].root.setEnabled(false); }

  /** write the instances of one character */
  emit(c, shadowOnly) {
    const B = c.O.bones, row = c.row, friendly = this.friendly(c.p);
    const lod = shadowOnly ? 1 : c.lod;
    const pre = shadowOnly ? 's' : '';
    const push = (key, F, anchor, sx, sy, sz) => { const b = this.batches.get(pre + key); if (b) b.push(partMatrix(M16, F, anchor, sx, sy, sz), row, friendly); };
    for (const P of KIT_PARTS) {
      const F = B[P.bone];
      const geo = lod ? P.lo : P.hi;
      let sy = P.s[1];
      if (P.len) sy = clamp(F.len / P.len, 0.75, 1.3) * P.s[1];
      let sx = P.s[0], sz = P.s[2];
      if (P.key === 'torso') { const br = 1 + (F.len || 0) * 2; sz *= br; sx *= 1 + (F.len || 0) * 0.5; }
      push('k:' + geo, F, P.anchor, sx, sy, sz);
    }
    // head, gloves, gear
    const list = c.p.helmet === false ? c.gearNoHelm : c.gearList;
    for (const it of list) {
      if (it.near && lod) continue; if (it.far && !lod) continue;
      if (it.hand) {
        const hk = it.hand === 'R' ? c.O.handGrip : c.O.handHold;
        if (it.handKind !== (hk === 'hang' ? 'hang' : hk === 'support' ? 'grip' : hk)) continue;
      }
      push('g:' + it.geo, B[it.bone], it.anchor || ZERO, it.s ? it.s[0] : 1, it.s ? it.s[1] : 1, it.s ? it.s[2] : 1);
    }
  }
  emitCorpse(k) {
    const B = k.O.bones, row = k.row;
    const push = (key, F, anchor, sx, sy, sz) => { const b = this.batches.get(key); if (b) b.push(partMatrix(M16, F, anchor, sx, sy, sz), row, false); };
    for (const P of KIT_PARTS) {
      const F = B[P.bone]; let sy = P.s[1];
      if (P.len) sy = clamp(F.len / P.len, 0.75, 1.3) * P.s[1];
      push('k:' + P.lo, F, P.anchor, P.s[0], sy, P.s[2]);
    }
    for (const it of k.gear) {
      if (it.near) continue;
      if (it.hand && it.handKind !== 'hang') continue;
      push('g:' + it.geo, B[it.bone], it.anchor || ZERO, it.s ? it.s[0] : 1, it.s ? it.s[1] : 1, it.s ? it.s[2] : 1);
    }
  }
  friendly(p) {
    const me = this.g.local;
    return !!(me && p !== me && me.team > 0 && p.team === me.team);
  }

  /** the gun in the hands, the holstered pistol, the slung primary, a knife / grenade in the hand */
  items(c, shadowOnly, dt) {
    const p = c.p, O = c.O, scene = this.scene;
    // in-hand gun
    if (c.gm) {
      const on = O.gunOn && !shadowOnly;
      c.gm.root.setEnabled(on || (shadowOnly && O.gunOn));
      if (O.gunOn) {
        placeNode(c.gm.root, O.gun);
        // magazine during reloads
        const mag = c.gm.parts && c.gm.parts.mag;
        if (mag && c.magRest) {
          if (O.mag.mode === 'off') mag.setEnabled(false);
          else { mag.setEnabled(true); mag.position.copyFrom(c.magRest); if (O.mag.mode === 'hand') { const h = O.joints.wrL; this.toLocal(O.gun, h, mag.position, c.magRest); } }
        }
        if (shadowOnly) for (const m of c.gm.root.getChildMeshes(false)) m.layerMask = 0x10000000;
      }
    }
    // holstered secondary / slung primary
    const cur = p.cur;
    const secW = p.inv.secondary, primW = p.inv.primary;
    const wantSec = secW && cur !== 'secondary' ? secW : null;
    const wantPrim = primW && (cur !== 'primary' || O.slung) ? primW : null;
    c.sec = this.carry(c, 'sec', wantSec, shadowOnly);
    c.prim = this.carry(c, 'prim', wantPrim, shadowOnly);
    if (c.sec) { const F = TMPF; this.holsterFrame(c, F); placeNode(c.sec.root, F); }
    if (c.prim) { const F = TMPF; this.slingFrame(c, F); placeNode(c.prim.root, F); }
    // knife / grenade in hand
    let ik = '';
    const w = currentWeapon(p);
    if (O.itemOn && p.cur === 'nade' && p.curNade) ik = 'n:' + p.curNade;
    else if (O.itemOn && w && w.melee) ik = 'm:' + w.gunId;
    if (ik !== c.itemKey) {
      if (c.item) { c.item.dispose(); c.item = null; }
      c.itemKey = ik;
      try {
        if (ik.startsWith('n:')) c.item = buildNade(scene, ik.slice(2), { lod: 1, instance: true });
        else if (ik.startsWith('m:')) c.item = buildGun(scene, ik.slice(2), { lod: 1, instance: true });
        if (c.item) { for (const m of c.item.root.getChildMeshes(false)) m.isPickable = false; c.item.root.rotationQuaternion = BABYLON.Quaternion.Identity(); c.itemGrip = c.item.hands && c.item.hands.right ? localFrame(c.item.root, c.item.hands.right) : null; }
      } catch (e) { c.item = null; }
    }
    if (c.item) {
      c.item.root.setEnabled(!shadowOnly && O.itemOn && !(p.cur === 'nade' && this.g.time - c.thrownAt < 0.5 && this.g.time - c.thrownAt > 0.12));
      // the item's grip node on the right hand frame
      const H = O.bones.handR, F = TMPF;
      if (c.itemGrip) invCompose(F, H, c.itemGrip); else { copyF(F, H); }
      placeNode(c.item.root, F);
    }
  }
  carry(c, slot, w, shadowOnly) {
    const keyName = slot + 'Key', gmName = slot;
    const key = w && !shadowOnly && c.lod === 0 ? w.uid : (w && !shadowOnly ? w.uid + ':far' : '');
    if (key !== c[keyName]) {
      if (c[gmName]) { c[gmName].dispose(); c[gmName] = null; }
      c[keyName] = key;
      if (w) { try { const gm = buildGun(this.scene, w.gunId, { lod: 2, skin: w.skin, mods: w.mods, instance: true }); for (const m of gm.root.getChildMeshes(false)) m.isPickable = false; gm.root.rotationQuaternion = BABYLON.Quaternion.Identity(); return gm; } catch (e) { return null; } }
      return null;
    }
    if (c[gmName]) c[gmName].root.setEnabled(!!w && !shadowOnly);
    return c[gmName];
  }
  holsterFrame(c, F) {
    // drop-leg holster on the right thigh (or on the belt): muzzle down, grip forward-up
    const v = c.look.variant, leg = v.holster === 'leg';
    const T = leg ? c.O.bones.thighR : c.O.bones.pelvis;
    const o = TMPV;
    if (leg) frameMul(o, T, 0.085, -0.14, 0.01); else frameMul(o, T, 0.2, -0.02, -0.02);
    // gun z (muzzle) along -thigh y (down the leg), gun y = toward the front
    F.o[0] = o[0]; F.o[1] = o[1]; F.o[2] = o[2];
    for (let k = 0; k < 3; k++) { F.z[k] = -T.y[k]; F.y[k] = -T.z[k]; F.x[k] = T.x[k]; }
    // re-orthonormalise x = y cross z
    cr(F.x, F.y, F.z);
    return F;
  }
  slingFrame(c, F) {
    // primary across the back: muzzle down to the right, stock up behind the left shoulder
    const ch = c.O.bones.chest, o = TMPV;
    frameMul(o, ch, 0.0, -0.18, -0.2);
    F.o[0] = o[0]; F.o[1] = o[1]; F.o[2] = o[2];
    const a = 2.35;                               // muzzle down-right in the back plane
    for (let k = 0; k < 3; k++) { F.z[k] = ch.x[k] * Math.sin(a) + ch.y[k] * Math.cos(a); F.x[k] = -ch.z[k]; }
    cr(F.y, F.z, F.x);
    return F;
  }
  toLocal(G, wp, outVec, rest) {
    // world point -> gun local (rest + delta clamp)
    const dx = wp[0] - G.o[0], dy = wp[1] - G.o[1], dz = wp[2] - G.o[2];
    outVec.set(dx * G.x[0] + dy * G.x[1] + dz * G.x[2], dx * G.y[0] + dy * G.y[1] + dz * G.y[2] + 0.05, dx * G.z[0] + dy * G.z[1] + dz * G.z[2]);
  }

  // ------------------------------------------------------------------------------------------------ muzzle flash (third person)
  flash(c, e) {
    if (!this.ok || !c.gm || !c.vis || !e.gun) return;
    if (e.gun.suppressed || e.gun.flashHide) return;
    if (!this.flashes) this.flashes = makeFlashPool(this.scene);
    const f = this.flashes.next();
    const m = c.gm.muzzle; if (!m) return;
    f.parent = m; f.position.set(0, 0, 0.01); f.rotation.set(0, 0, Math.random() * 6.28);
    const s = (e.gun.cat === 'pistol' ? 0.55 : e.gun.cat === 'shotgun' ? 1.15 : e.gun.cat === 'smg' ? 0.75 : 1) * (0.85 + Math.random() * 0.3);
    f.scaling.set(s, s, s * (0.9 + Math.random() * 0.4));
    f.setEnabled(true); f.metadata = { t: 0 };
  }

  // ------------------------------------------------------------------------------------------------ deaths
  onKill(e) {
    if (this.fallback || !this.ok) return;
    const p = e.victim, c = p && this.list.get(p.id); if (!c) return;
    if (!c.O || !c.A.init) return;
    let k = this.corpses.length >= MAX_CORPSES ? this.corpses.shift() : null;
    if (k) this.freeCorpse(k);
    const hit = c.lastHit && c.lastHit.victim === p ? c.lastHit : null;
    const rag = new Ragdoll();
    rag.fromPose(c.O, c.prevJ || null, this.g.world);
    // impulse: the killing bullet (or blast) at the hit group, plus the body's own velocity
    const st = c.st || { vel: { x: 0, y: 0, z: 0 } };
    rag.addVelocity(st.vel.x, Math.max(0, st.vel.y), st.vel.z);
    if (hit && hit.dir) rag.impulse(hit.group || 'chest', hit.dir.x, hit.dir.y, hit.dir.z, clamp((hit.dmg || 30) / 30, 0.6, 3.5) * (e.headshot ? 1.2 : 1));
    else if (e.killer && e.killer !== p) { const dx = p.pos.x - e.killer.pos.x, dz = p.pos.z - e.killer.pos.z, l = Math.hypot(dx, dz) || 1; rag.impulse('chest', dx / l, 0, dz / l, 1.2); }
    rag.slump(0.6);
    k = { rag, O: newPose(), t: 0, row: c.row, gear: c.p.helmet === false ? c.gearNoHelm : c.gearList, id: p.id };
    rag.toPose(k.O);
    this.corpses.push(k);
    c.vis = false; this.hideItems(c);
  }
  freeCorpse(k) { /* nothing allocated in the scene per corpse */ }

  // ------------------------------------------------------------------------------------------------ world weapon drops
  updateDrops() {
    const g = this.g, seen = new Set();
    for (const d of g.drops) {
      seen.add(d.id);
      let gm = this.drops.get(d.id);
      if (gm === undefined) { try { gm = buildGun(this.scene, d.w.gunId, { lod: 2, skin: d.w.skin, mods: d.w.mods, instance: true }); for (const m of gm.root.getChildMeshes(false)) m.isPickable = false; } catch (e) { gm = null; } this.drops.set(d.id, gm); }
      if (!gm) continue;
      gm.root.position.set(d.x, d.y + 0.03, d.z);
      gm.root.rotation.set(0, d.yaw, d.rest ? Math.PI / 2 : d.t * 6);
    }
    for (const [id, gm] of this.drops) if (!seen.has(id)) { if (gm) gm.dispose(); this.drops.delete(id); }
    if (this.flashes) this.flashes.tick();
  }

  stats() {
    let draws = 0, tris = 0, inst = 0;
    for (const b of this.batches.values()) if (b.n) { draws++; tris += b.tris * b.n; inst += b.n; }
    return { chars: this.list.size, corpses: this.corpses.length, draws, tris, instances: inst, ms: +this.ms.toFixed(3), ok: this.ok, fallback: !!this.fallback };
  }

  dispose() {
    this.disposed = true;
    for (const f of this.offs) f(); this.offs.length = 0;
    if (this.fallback) { this.fallback.dispose(); this.fallback = null; }
    for (const c of this.list.values()) for (const k of ['gm', 'sec', 'prim', 'item']) if (c[k]) { try { c[k].dispose(); } catch (e) { /* gone */ } }
    for (const gm of this.drops.values()) if (gm) gm.dispose();
    this.list.clear(); this.drops.clear(); this.corpses.length = 0;
    for (const b of this.batches.values()) b.dispose(); this.batches.clear();
    if (this.overlay) this.overlay.dispose();
    if (this.tags) this.tags.dispose();
    if (this.flashes) this.flashes.dispose();
  }
}

const ZERO = [0, 0, 0];
const TMPV = [0, 0, 0], TMPF = newFrame();
function cr(o, a, b) { const x = a[1] * b[2] - a[2] * b[1], y = a[2] * b[0] - a[0] * b[2], z = a[0] * b[1] - a[1] * b[0]; const l = Math.hypot(x, y, z) || 1; o[0] = x / l; o[1] = y / l; o[2] = z / l; }
function copyF(d, s) { for (const k of ['o', 'x', 'y', 'z']) { d[k][0] = s[k][0]; d[k][1] = s[k][1]; d[k][2] = s[k][2]; } }
/** out = H * inverse(L): the root frame that puts the local frame L of a model on the world frame H */
function invCompose(out, H, L) {
  // R_root * L.axes = H.axes  ->  R_root = H.axes * L.axes^T ; o_root = H.o - R_root * L.o
  for (let r = 0; r < 3; r++) {
    const ax = r === 0 ? out.x : r === 1 ? out.y : out.z;
    // image of root local axis r: sum_k L.axes[k][r] * H.axes[k]
    const lx = L.x[r], ly = L.y[r], lz = L.z[r];
    for (let k = 0; k < 3; k++) ax[k] = H.x[k] * lx + H.y[k] * ly + H.z[k] * lz;
  }
  const lo = L.o;
  for (let k = 0; k < 3; k++) out.o[k] = H.o[k] - (out.x[k] * lo[0] + out.y[k] * lo[1] + out.z[k] * lo[2]);
  return out;
}
function hashId(s) { let h = 0x811c9dc5; s = String(s); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

/** a pool of third-person muzzle flashes: three crossed additive quads (star) with a radial gradient, visible ~2 frames */
function makeFlashPool(scene) {
  const BB = BABYLON;
  const tex = new BB.DynamicTexture('lfFlash3p', { width: 128, height: 128 }, scene, true);
  const ctx = tex.getContext(); ctx.clearRect(0, 0, 128, 128);
  const gr = ctx.createRadialGradient(64, 64, 2, 64, 64, 62);
  gr.addColorStop(0, 'rgba(255,250,235,1)'); gr.addColorStop(0.25, 'rgba(255,214,140,0.9)'); gr.addColorStop(0.6, 'rgba(255,150,60,0.35)'); gr.addColorStop(1, 'rgba(255,120,40,0)');
  ctx.fillStyle = gr; ctx.beginPath();
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2, r = i % 2 ? 26 : 62; ctx.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r); }
  ctx.closePath(); ctx.fill(); tex.update(); tex.hasAlpha = true;
  const mat = new BB.StandardMaterial('lfFlash3pM', scene);
  mat.diffuseColor = BB.Color3.Black(); mat.specularColor = BB.Color3.Black(); mat.emissiveTexture = tex; mat.opacityTexture = tex;
  mat.emissiveColor = new BB.Color3(1.6, 1.3, 0.9); mat.disableLighting = true; mat.alphaMode = BB.Engine.ALPHA_ADD; mat.backFaceCulling = false; mat.disableDepthWrite = true;
  const proto = new BB.Mesh('lfFlash3p', scene);
  const parts = [];
  // a forward cone of light (two crossed quads along +z) and a front-facing star
  const q1 = BB.MeshBuilder.CreatePlane('f1', { width: 0.09, height: 0.2 }, scene); q1.rotation.x = Math.PI / 2; q1.position.z = 0.09; parts.push(q1);
  const q2 = BB.MeshBuilder.CreatePlane('f2', { width: 0.09, height: 0.2 }, scene); q2.rotation.set(Math.PI / 2, 0, Math.PI / 2); q2.position.z = 0.09; parts.push(q2);
  const q3 = BB.MeshBuilder.CreatePlane('f3', { size: 0.13 }, scene); q3.position.z = 0.015; parts.push(q3);
  for (const q of parts) { q.bakeCurrentTransformIntoVertices(); }
  const merged = BB.Mesh.MergeMeshes(parts, true, true);
  merged.name = 'lfFlash3p'; merged.material = mat; merged.isPickable = false; merged.setEnabled(false);
  proto.dispose();
  const pool = [];
  for (let i = 0; i < 10; i++) { const m = i === 0 ? merged : merged.clone('lfFlash3p' + i); m.metadata = { t: 9 }; m.setEnabled(false); m.isPickable = false; pool.push(m); }
  let k = 0;
  return {
    next() { const m = pool[k]; k = (k + 1) % pool.length; return m; },
    tick() { for (const m of pool) { if (!m.isEnabled()) continue; if (!m.metadata) m.metadata = { t: 0 }; m.metadata.t++; if (m.metadata.t > 2) { m.setEnabled(false); m.parent = null; } } },
    dispose() { for (const m of pool) m.dispose(); mat.dispose(); tex.dispose(); },
  };
}
