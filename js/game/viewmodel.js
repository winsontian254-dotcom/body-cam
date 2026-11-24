/* LIVE FIRE — first-person viewmodel: the local player's gun (js/weapons/models.js buildGun, LOD 0), melee weapon or grenade,
   held by gloved hands with sleeves and IK arms (js/game/hands.js), rendered in renderingGroupId 1 with the depth buffer cleared
   first, so nothing clips into walls. Everything is procedural keyframed animation on the GunModel parts and the hand frames:
     draw / holster, idle breathing, look sway, walk bob, sprint (high ready for long guns, low ready for pistols), jump / land,
     fire (slide / bolt cycle, recoil springs), tactical vs empty magazine reloads (magazine out, new one from the pouch with the
     support hand, seat, charging handle / slide / bolt release), shell-by-shell loading with interrupt, revolver (crane out,
     ejector, speed loader), belt-fed (feed cover, box swap), break action, bolt-action / pump / lever cycling between shots,
     inspect, melee slash / stab / throw, grenade pin pull / cook / throw / underhand.
   The ADS pose is exact: GunModel.sight.eye (iron sight line or the fitted optic's eye point) lands on the camera origin whatever
   the gun's rotation, so the sight line is the bullet line.
   Animation timings follow the simulation (weapon.js): reload stages at the same shares of reload / reloadEmpty, shell per /
   start / end from data.js, manual actions from the 'cycle' events (pump .3 / .55, bolt .24 / .6 of the cycle), draw = data draw.
   Exports:
     Viewmodel   class (game system 'viewmodel'): new Viewmodel(scene, game, rig)
       root (TransformNode parented to the camera), holder (the gun pose node), hands (Hands), current { gm | knife | nade, w },
       visible, hold (freeze for screenshots), HIP (live pose table, for tuning)
       muzzleNode() / ejectNode() -> TransformNode | null    (effects.js: flash, casings)
       emitter('laser' | 'light') -> TransformNode | null    (effects.js: laser beam / flashlight from the side attachment)
       sightInfo() -> { kind, lens, reticle, zoom } | null   (scope view: what the eye looks through)
       prebuild(p), tick(dt) (thrown melee: weapon.js thrownTick), frame(dt), dispose()
   Also routes the weapon-handling sounds to js/audio (draw / holster / inspect / fire mode / ADS / device / manual action
   steps / melee swings and hits): Audio.reload(stage, family, ...), Audio.melee(kind, stage, ...), Audio.sfx('scope_in'...).
   Pose space = camera space (+Z forward, +X right, +Y up). */
import { buildGun } from '../weapons/models.js';
import { buildNade } from '../grenades/models.js';
import { getGun } from '../weapons/data.js';
import { getNade } from '../grenades/data.js';
import { clamp, damp, smoothstep } from '../core/util.js';
import { currentWeapon, statsOf, reloadProgress, scopedView, adsZoom, thrownTick } from './weapon.js';
import { vmKick } from '../weapons/recoil.js';
import { Hands, frameOf, blendFrames } from './hands.js';
import { Audio } from './game.js';
import { ScopeView } from './scopeview.js';

const PI = Math.PI;
// hip poses (gun origin = trigger) by family: [x, y, z, yaw, pitch, roll]
const HIP = {
  pistol: [0.07, -0.118, 0.33, -0.03, 0.02, -0.02],
  smg: [0.09, -0.118, 0.27, -0.045, 0.02, 0.02],
  rifle: [0.1, -0.122, 0.25, -0.05, 0.025, 0.03],
  bullpup: [0.1, -0.118, 0.33, -0.05, 0.025, 0.03],
  shotgun: [0.1, -0.124, 0.25, -0.05, 0.025, 0.03],
  sniper: [0.105, -0.128, 0.24, -0.045, 0.025, 0.03],
  lmg: [0.11, -0.135, 0.25, -0.05, 0.03, 0.04],
  melee: [0.13, -0.17, 0.3, -0.25, -0.2, 0.55],
  nade: [0.14, -0.16, 0.3, -0.2, 0.15, 0.2],
};
const FAM_OF_CAT = { pistol: 'pistol', smg: 'smg', rifle: 'rifle', carbine: 'rifle', br: 'rifle', dmr: 'rifle', sniper: 'sniper', shotgun: 'shotgun', lmg: 'lmg' };
const BULLPUP = /bullpup/;
const famOf = st => (st ? (BULLPUP.test(st.archetype || '') ? 'bullpup' : FAM_OF_CAT[st.cat] || 'rifle') : 'rifle');

class Spring3 {
  constructor(k, z) { this.k = k; this.d = 2 * Math.sqrt(k) * z; this.x = 0; this.y = 0; this.z = 0; this.vx = 0; this.vy = 0; this.vz = 0; }
  step(dt) {   // sub-stepped: explicit Euler explodes on slow frames otherwise
    const k = this.k, d = this.d;
    let n = Math.ceil(dt * 240); if (n > 64) n = 64; const h = dt / Math.max(1, n);
    for (let i = 0; i < n; i++) {
      this.vx += (-k * this.x - d * this.vx) * h; this.x += this.vx * h;
      this.vy += (-k * this.y - d * this.vy) * h; this.y += this.vy * h;
      this.vz += (-k * this.z - d * this.vz) * h; this.z += this.vz * h;
    }
    if (!Number.isFinite(this.x + this.y + this.z + this.vx + this.vy + this.vz)) this.reset();
  }
  reset() { this.x = this.y = this.z = this.vx = this.vy = this.vz = 0; }
}
const ease = u => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
const bump = (u, a, b) => (u <= a || u >= b ? 0 : Math.sin(PI * (u - a) / (b - a)));
const ramp = (u, a, b) => smoothstep(a, b, u);
/** 0 before a, 1 between b and c, 0 after d (smooth) */
const plateau = (u, a, b, c, d) => ramp(u, a, b) * (1 - ramp(u, c, d));

// camera-space support-hand "pouch" (below the screen, left) and grenade / melee frames
const POUCH = [-0.17, -0.42, 0.16, 0.5, 0.3, -0.4];          // x y z pitch yaw roll
const ROT = new Map();

export class Viewmodel {
  constructor(scene, game, rig) {
    const B = BABYLON;
    this.name = 'viewmodel'; this.scene = scene; this.g = game; this.rig = rig;
    this.root = new B.TransformNode('vmRoot', scene);
    this.root.parent = rig.camera;
    this.holder = new B.TransformNode('vmHolder', scene);
    this.holder.parent = this.root;
    this.hands = new Hands(scene, this.root, { group: 1 });
    try { this.scopeView = game.addSystem(new ScopeView(scene, game)); } catch (e) { console.warn('[viewmodel] scope view unavailable', e); }
    this.HIP = HIP;
    this.models = new Map();       // weapon uid | 'n:'gid -> model record
    this.current = null; this.visible = true; this.prev = null; this.holsterT = 9;
    this.pos = new Spring3(170, 0.72); this.rot = new Spring3(190, 0.7); this.landS = new Spring3(120, 0.55);
    this.shotT = 9; this.slideT = 9; this.lastYaw = null; this.lastPitch = 0;
    this.swayX = 0; this.swayY = 0; this.modeT = 9; this.adsLast = 0; this.runK = 0; this.airK = 0; this.vyS = 0;
    this.cyc = { t: 9, stage: null, kind: null };          // manual action from the 'cycle' events
    this.nadeThrowT = 9; this.nadeUnder = false; this.devT = 9;
    // scratch
    this.tmpQ = new B.Quaternion(); this.tmpV = new B.Vector3(); this.tmpM = new B.Matrix();
    this.rootInv = new B.Matrix(); this.mA = new B.Matrix(); this.mB = new B.Matrix(); this.mC = new B.Matrix(); this.mD = new B.Matrix(); this.mE = new B.Matrix();
    this.mR = new B.Matrix(); this.mL = new B.Matrix();
    const bus = game.bus, L = e => !!(e && e.p && e.p.local);
    this.offs = [
      bus.on('shot', e => { if (L(e)) this.kick(e); }),
      bus.on('firemode', e => { if (L(e)) { this.modeT = 0; this.snd('firemode', e.p); } }),
      bus.on('spawn', e => { if (L(e)) { this.pos.reset(); this.rot.reset(); this.prebuild(e.p); this.hands.setLook(e.p); } }),
      bus.on('switch', e => { if (L(e)) { this.prev = this.current; this.holsterT = 0; } this.onSwitch(e); }),
      bus.on('cycle', e => { if (L(e)) { this.cyc.t = 0; this.cyc.stage = e.stage; this.cyc.kind = e.gun && e.gun.cycle; } this.snd(e.stage, e.p, e.w); }),
      bus.on('land', e => { if (L(e)) this.landS.vy -= Math.min(1.4, (e.speed || 3) * 0.16); }),
      bus.on('jump', e => { if (L(e)) this.landS.vy += 0.35; }),
      bus.on('grenade:throw', e => { if (L(e)) { this.nadeThrowT = 0; this.nadeUnder = !!(e.under || (e.nade && e.nade.under)); } }),
      bus.on('inspect', e => this.snd('inspect', e.p)),
      bus.on('device', e => { if (L(e)) this.devT = 0; this.snd('laser', e.p, e.w); }),
      bus.on('melee', e => this.meleeSnd(e.p, e.gun, e.kind === 'stab' ? 'swing' : 'swing')),
      bus.on('melee:throw', e => this.meleeSnd(e.p, e.gun, 'swing')),
      bus.on('melee:hit', e => { if (e.res && e.res !== 'miss') this.meleeSnd(e.p, e.gun, e.kind === 'stab' || e.res === 'back' ? 'stab' : 'hit'); }),
      bus.on('impact', e => { if (e.melee && e.shooter) this.meleeSnd(e.shooter, e.gun, 'hit', e.surf || 'concrete', e.point); }),
      bus.on('round:reset', () => { if (game.thrown) game.thrown.length = 0; }),
    ];
  }

  // ---------------------------------------------------------------------------------------------- sounds
  sndOpts(p, extra) { const o = { local: !!p.local, id: p.id, ...extra }; if (!p.local) o.pos = { x: p.pos.x, y: p.pos.y + 1.3, z: p.pos.z }; return o; }
  snd(stage, p, w) {
    if (!p) return;
    try {
      const ww = w || currentWeapon(p); if (!ww || ww.melee) return;
      const st = statsOf(ww); if (!st) return;
      if (!p.local) { const c = this.g.camera.position; if (Math.hypot(p.pos.x - c.x, p.pos.z - c.z) > 30) return; }
      Audio.reload(stage, st.sound || 'rifle_556', this.sndOpts(p, { gun: st }));
    } catch (e) { /* audio is optional */ }
  }
  meleeSnd(p, gunId, stage, surf, at) {
    if (!p) return;
    try {
      const spec = getGun(gunId) || {}, kind = spec.sound || 'knife';
      const o = this.sndOpts(p, {}); if (surf) o.surf = surf; if (at && !p.local) o.pos = at;
      Audio.melee(kind, stage, o);
    } catch (e) { /* ok */ }
  }
  onSwitch(e) {
    const p = e.p; if (!p) return;
    const w = currentWeapon(p);
    if (w && w.melee) this.meleeSnd(p, w.gunId, 'draw');
    else if (w) this.snd('draw', p, w);
  }

  // ---------------------------------------------------------------------------------------------- models
  setGroup(node) {
    const fx = this.g.effects; if (fx && fx.litMeshes) fx.litMeshes(node.getChildMeshes(false));
    for (const m of node.getChildMeshes(false)) {
      m.renderingGroupId = 1; m.isPickable = false; m.alwaysSelectAsActiveMesh = true; m.receiveShadows = false;
      if (m.material && m.material.needDepthPrePass) m.material.needDepthPrePass = false;
    }
  }
  modelFor(w) {
    if (!w) return null;
    let m = this.models.get(w.uid);
    if (m && m.w === w && m.mods === w.mods && m.skin === w.skin) return m;
    const key = w.gunId + '|' + JSON.stringify(w.mods || {}) + '|' + (w.skin || '');
    if (m && m.key !== key) { this.drop(w.uid); m = null; }
    if (m) { m.w = w; m.mods = w.mods; m.skin = w.skin; return m; }
    let gm = null;
    try { gm = buildGun(this.scene, w.gunId, { lod: 0, skin: w.skin, mods: w.mods }); } catch (e) { console.error('[viewmodel] buildGun failed', e); return null; }
    gm.root.parent = this.holder; gm.root.setEnabled(false);
    this.setGroup(gm.root);
    m = this.record(gm, w, key);
    this.models.set(w.uid, m);
    if (this.models.size > 5) { for (const uid of this.models.keys()) { if (uid !== w.uid && !this.inUse(uid) && this.models.get(uid) !== this.prev) { this.drop(uid); break; } } }
    return m;
  }
  nadeModel(gid) {
    const k = 'n:' + gid; let m = this.models.get(k);
    if (m) return m;
    let nm = null;
    try { nm = buildNade(this.scene, gid, { lod: 0 }); } catch (e) { console.error('[viewmodel] buildNade failed', e); return null; }
    nm.root.parent = this.holder; nm.root.setEnabled(false); this.setGroup(nm.root);
    const base = {};
    for (const [n, node] of Object.entries(nm.parts || {})) base[n] = { p: node.position.clone(), r: node.rotation.clone() };
    m = { nade: nm, gid, base, key: k, w: null };
    this.models.set(k, m);
    return m;
  }
  record(gm, w, key) {
    const base = {};
    for (const [k, n] of Object.entries(gm.parts || {})) base[k] = { p: n.position.clone(), r: n.rotation.clone(), q: n.rotationQuaternion ? n.rotationQuaternion.clone() : null };
    const m = { gm, w, key, base, mods: w.mods, skin: w.skin, melee: !!gm.melee };
    if (gm.melee) return m;
    m.cycKey = ['slide', 'bolt', 'charging'].find(k => gm.parts[k]) || null;
    m.chargeKey = ['charging', 'handle', 'bolt', 'slide'].find(k => gm.parts[k]) || null;
    m.magP = gm.parts.mag || null;
    m.magB = m.magP ? this.localBounds(m.magP) : null;
    m.boltB = gm.parts.bolt ? this.localBounds(gm.parts.bolt) : null;
    m.chB = m.chargeKey ? this.localBounds(gm.parts[m.chargeKey]) : null;
    return m;
  }
  /** axis-aligned bounds of a node's meshes in the node's own space (rest pose) */
  localBounds(node) {
    const B = BABYLON;
    node.computeWorldMatrix(true);
    const inv = node.getWorldMatrix().clone().invert(), mn = new B.Vector3(1e9, 1e9, 1e9), mx = new B.Vector3(-1e9, -1e9, -1e9), v = new B.Vector3();
    for (const m of node.getChildMeshes(false)) {
      m.computeWorldMatrix(true);
      const bb = m.getBoundingInfo().boundingBox;
      for (const c of bb.vectorsWorld) { B.Vector3.TransformCoordinatesToRef(c, inv, v); mn.minimizeInPlace(v); mx.maximizeInPlace(v); }
    }
    if (mn.x > mx.x) { mn.set(-0.01, -0.1, -0.02); mx.set(0.01, 0, 0.02); }
    return { mn, mx, c: mn.add(mx).scale(0.5) };
  }
  inUse(uid) { const p = this.g.local; if (!p) return false; const i = p.inv; return [i.primary, i.secondary, i.melee].some(w => w && w.uid === uid); }
  drop(uid) {
    const m = this.models.get(uid); if (!m) return;
    if (this.current === m) this.current = null;
    if (this.prev === m) this.prev = null;
    if (m.gm) m.gm.dispose(); if (m.nade) m.nade.dispose();
    this.models.delete(uid);
  }
  prebuild(p) { for (const w of [p.inv.primary, p.inv.secondary, p.inv.melee]) if (w) this.modelFor(w); }

  muzzleNode() { const m = this.current; return m && m.gm && !m.melee && this.visible ? m.gm.muzzle || null : null; }
  ejectNode() { const m = this.current; return m && m.gm && !m.melee && this.visible ? m.gm.eject || null : null; }
  emitter(kind) { const m = this.current; return m && m.gm && m.gm.emitters && this.visible ? m.gm.emitters[kind] || null : null; }
  sightInfo() {
    const m = this.current; if (!m || !m.gm || m.melee) return null;
    const s = m.gm.sight; return { kind: s.kind, lens: s.lens, reticle: s.reticle, iron: s.iron, glint: s.glint };
  }

  kick(e) {
    const k = vmKick(e.gun, e.ads || 0, this.g.rng);
    this.pos.vz += k.z; this.pos.vy += k.y; this.pos.vx += k.x;
    this.rot.vx += k.rx; this.rot.vy += k.ry; this.rot.vz += k.rz;
    this.shotT = 0; this.slideT = 0;
  }

  tick(dt) { thrownTick(this.g, dt); }

  // ---------------------------------------------------------------------------------------------- per frame
  frame(dt) {
    dt = this.hold ? 0 : Math.min(dt, 0.1);     // hold = freeze the pose (screenshots)
    const g = this.g, p = g.local, rig = this.rig;
    const alive = p && p.alive;
    const w = alive ? currentWeapon(p) : null;
    const nade = alive && p.cur === 'nade' && p.curNade ? p.curNade : null;
    const scoped = w && scopedView(p);
    const show = alive && (!!w || !!nade) && !scoped && !g.ended && (g.spectate == null || p.alive) && this.holder.isEnabled(false);
    if (p && p.alive) this.hands.setLook(p);
    if (this.hands.ok && !this.handsLit) { this.handsLit = true; const fx = g.effects; if (fx && fx.litMeshes) fx.litMeshes(this.hands.meshes()); }
    if (!show) {
      if (this.current) this.setEnabled(this.current, false);
      if (this.prev) this.setEnabled(this.prev, false);
      this.hands.setEnabled(false);
      this.visible = false;
      return;
    }
    let m = w ? this.modelFor(w) : this.nadeModel(nade);
    if (!m) return;
    if (this.current !== m) { if (this.current) this.setEnabled(this.current, false); this.current = m; this.setEnabled(m, true); this.pos.reset(); this.rot.reset(); }
    else if (!this.visible) this.setEnabled(m, true);
    this.visible = true; this.hands.setEnabled(true);
    const ws = p.ws, st = w && !w.melee ? statsOf(w) : null;
    const fam = m.nade ? 'nade' : m.melee ? 'melee' : famOf(st);
    // holster of the previous item for the first part of the draw
    this.holsterT += dt;
    const drawing = ws.state === 'draw', drawU = drawing ? clamp(ws.t / Math.max(0.05, ws.dur), 0, 1) : 1;
    const holsterK = this.prev && this.prev !== m && drawing && drawU < 0.3 ? 1 - drawU / 0.3 : 0;
    if (this.prev && this.prev !== m && !holsterK) { this.setEnabled(this.prev, false); this.prev = null; }
    const showing = holsterK > 0 ? this.prev : m;
    if (holsterK > 0) { this.setEnabled(m, false); this.setEnabled(this.prev, true); } else this.setEnabled(m, true);
    const hip = HIP[holsterK > 0 ? this.prevFam || fam : fam] || HIP.rifle;
    if (!holsterK) this.prevFam = fam;
    this.shotT += dt; this.slideT += dt; this.modeT += dt; this.cyc.t += dt; this.nadeThrowT += dt; this.devT += dt;
    this.pos.step(dt); this.rot.step(dt); this.landS.step(dt);
    // look sway: the gun lags behind the turn (weight) and swings back
    const view = g.view;
    if (this.lastYaw == null) { this.lastYaw = view.yaw; this.lastPitch = view.pitch; }
    const dyw = clamp(view.yaw - this.lastYaw, -0.25, 0.25), dpt = clamp(view.pitch - this.lastPitch, -0.25, 0.25);
    this.lastYaw = view.yaw; this.lastPitch = view.pitch;
    const ads = st ? ws.ads : 0, adsE = ease(ads);
    const wt = st ? clamp((st.weight || 3) / 4, 0.35, 1.8) : 0.5;
    const swayK = (1 - 0.8 * adsE) * (0.65 + 0.35 * wt);
    this.swayX = damp(this.swayX - dyw * 0.55 * swayK, 0, 10, dt);
    this.swayY = damp(this.swayY - dpt * 0.55 * swayK, 0, 10, dt);
    // bob (figure eight from the rig's step phase), idle breathing
    const bob = rig.bob, ph = bob.phase, A = bob.amp * (1 - 0.88 * adsE);
    const bx = Math.sin(ph) * 0.0085 * A, by = -Math.abs(Math.cos(ph)) * 0.0075 * A + 0.004 * A;
    const t = rig.t, idle = (1 - 0.85 * adsE);
    const brX = Math.sin(t * 0.9) * 0.0012 * idle, brY = Math.sin(t * 1.35) * 0.0016 * idle;
    const spd = Math.hypot(p.vel.x, p.vel.z);
    const sprint = p.onGround && !(ws.btn & 16) && ws.state !== 'reload' && !ws.ml && ws.nadeT < 0 ? smoothstep(4.2, 5.1, spd) * (1 - adsE) : 0;
    this.runK = damp(this.runK, sprint, 7, dt);
    this.airK = damp(this.airK, p.onGround ? 0 : 1, 8, dt);
    this.vyS = damp(this.vyS, clamp(p.vel.y, -6, 6), 10, dt);
    const run = this.runK;
    // ---- base pose: hip -> ADS
    let px = hip[0], py = hip[1], pz = hip[2], ryw = hip[3], rpt = hip[4], rrl = hip[5];
    let adsX = 0, adsY = 0, adsZ = 0;
    if (m.gm && !m.melee) { const e = m.gm.sight.eye; adsX = -e.x; adsY = -e.y; adsZ = -e.z; }
    px += (adsX - px) * adsE; py += (adsY - py) * adsE; pz += (adsZ - pz) * adsE;
    ryw *= 1 - adsE; rpt *= 1 - adsE; rrl *= 1 - adsE;
    // crouch, sprint, lean, air
    const cr = p.crouch || 0, na = 1 - adsE;
    py += 0.006 * cr * na; rrl += 0.04 * cr * na;
    if (fam === 'pistol') { py -= 0.05 * run; pz -= 0.03 * run; rpt += 0.55 * run; ryw -= 0.15 * run; rrl += 0.1 * run; px -= 0.01 * run; }
    else if (fam === 'melee' || fam === 'nade') { py -= 0.03 * run; rpt += 0.25 * run; }
    else { px -= 0.025 * run; py -= 0.02 * run; pz -= 0.04 * run; rpt += 0.12 * run; ryw += 0.55 * run; rrl += 0.62 * run; }
    const runBob = Math.sin(ph * 2) * 0.012 * run, runRoll = Math.sin(ph) * 0.05 * run;
    rrl += -(p.lean || 0) * 0.08 * na;
    py += -this.vyS * 0.004 * this.airK * na + this.landS.y * 0.05; rpt += this.landS.y * 0.25 - this.vyS * 0.01 * this.airK * na;
    // ---- state motions
    const O = this.O || (this.O = [0, 0, 0, 0, 0, 0]); O.fill(0);
    const add = (a, b, c, d, e2, f) => { O[0] += a; O[1] += b; O[2] += c; O[3] += d; O[4] += e2; O[5] += f; };
    if (holsterK > 0) { const e = ease(holsterK); add(0.02 * (1 - e), -0.2 * (1 - e), -0.05 * (1 - e), 0.75 * (1 - e), -0.2 * (1 - e), 0.25 * (1 - e)); }
    else if (drawing) {
      const u = this.prev ? clamp((drawU - 0.3) / 0.7, 0, 1) : drawU, e = 1 - ease(u);
      add(0.01 * e, -0.2 * e, -0.06 * e, 0.8 * e, -0.15 * e, 0.3 * e);
      if (st && u > 0.55 && st.cat !== 'pistol') { const b = bump(u, 0.55, 0.95); add(0, 0.004 * b, -0.008 * b, -0.04 * b, 0, -0.05 * b); }
    }
    const R = this.anim || (this.anim = {});
    R.left = null; R.right = null; R.leftKind = null; R.hideL = false; R.hideR = false; R.magHand = 0; R.shell = 0;
    if (holsterK <= 0) {
      if (m.nade) this.nadeMotions(m, ws, dt, add, R);
      else if (m.melee) this.meleeMotions(m, ws, add, R);
      else this.gunMotions(m, ws, st, w, dt, add, R);
    }
    if (this.modeT < 0.35) { const u = this.modeT / 0.35; O[5] += bump(u, 0, 1) * 0.1; O[1] -= bump(u, 0, 1) * 0.006; }
    if (this.devT < 0.3) { const u = this.devT / 0.3; O[1] -= bump(u, 0, 1) * 0.004; O[5] -= bump(u, 0, 1) * 0.04; }
    // ---- compose
    const H = this.holder, ox = O[0], oy = O[1], oz = O[2], orx = O[3], ory = O[4], orz = O[5];
    H.position.set(px + ox + bx + brX + this.swayX * 0.06 + this.pos.x, py + oy + by + brY + runBob + this.swayY * 0.05 + this.pos.y, pz + oz + this.pos.z);
    H.rotation.set(rpt + orx + this.swayY * 0.9 + this.rot.x * 0.06, ryw + ory + this.swayX * 0.9 + this.rot.y * 0.06, rrl + orz + runRoll + this.swayX * 0.6 + this.rot.z * 0.06);
    // ADS exactness: with a rotated holder the eye point moves; re-solve the translation so R * eye + T = 0 when fully aimed
    if (m.gm && !m.melee && adsE > 0.001 && holsterK <= 0) {
      const e = m.gm.sight.eye;
      BABYLON.Quaternion.RotationYawPitchRollToRef(H.rotation.y, H.rotation.x, H.rotation.z, this.tmpQ);
      BABYLON.Matrix.FromQuaternionToRef(this.tmpQ, this.tmpM);
      BABYLON.Vector3.TransformCoordinatesFromFloatsToRef(e.x, e.y, e.z, this.tmpM, this.tmpV);
      const k = adsE * adsE;                       // T = -R * eye  =>  add (eye - R * eye)
      H.position.x += (e.x - this.tmpV.x) * k; H.position.y += (e.y - this.tmpV.y) * k; H.position.z += (e.z - this.tmpV.z) * k;
    }
    this.placeHands(holsterK > 0 ? this.prev : m, R, holsterK > 0);
  }

  // ---------------------------------------------------------------------------------------------- hands
  /** world matrix of a node in root (camera) space */
  F(node, out) { return frameOf(node, this.rootInv, out); }
  placeHands(m, R, holster) {
    const B = BABYLON, hands = this.hands;
    this.root.computeWorldMatrix(true);
    this.root.getWorldMatrix().invertToRef(this.rootInv);
    this.holder.computeWorldMatrix(true);
    if (!m) { hands.pose('R', null); hands.pose('L', null); hands.update(); return; }
    // magazine carried by the left hand (reloads): its pose follows the hand
    // right hand
    let rk = null;
    if (m.nade) { const n = m.nade.nodes.grip; if (n) { this.F(n, this.mR); rk = 'grip'; } }
    else if (m.gm && m.gm.hands && m.gm.hands.right) { this.F(m.gm.hands.right, this.mR); rk = 'grip'; }
    if (rk && R.right) { blendFrames(this.mR, R.right.M, R.right.k, this.mR); }
    hands.pose('R', R.hideR ? null : rk, this.mR);
    // left hand
    let lk = null;
    const gl = m.gm && !m.melee && m.gm.hands ? m.gm.hands.left : null;
    if (gl && !holster) {
      this.F(gl, this.mL);
      const kind = (gl.metadata && gl.metadata.meta && gl.metadata.meta.kind) || 'hold';
      lk = kind === 'grip' || kind === 'support' ? 'grip' : 'hold';
    } else if (gl && holster) { this.F(gl, this.mL); lk = 'hold'; }
    if (R.left) {
      if (lk) blendFrames(this.mL, R.left.M, R.left.k, this.mL); else { this.mL.copyFrom(R.left.M); }
      if (R.leftKind && (R.left.k > 0.5 || !lk)) lk = R.leftKind; else if (!lk) lk = R.leftKind || 'hold';
    }
    hands.pose('L', R.hideL ? null : lk, this.mL);
    hands.update();
    // things carried by the left hand
    if (R.magHand && m.magP) this.magFollow(m, R);
    if (this.shellProp) {
      const on = R.shell > 0 && lk;
      this.shellProp.setEnabled(!!on);
      if (on) { this.mA.copyFrom(this.mL); const o = this.shellOff || (this.shellOff = B.Matrix.Compose(new B.Vector3(1, 1, 1), B.Quaternion.FromEulerAngles(0, 0, PI / 2), new B.Vector3(0.0, 0.03, 0.02))); o.multiplyToRef(this.mA, this.mB); this.mB.decompose(this.tmpV, this.shellProp.rotationQuaternion, this.shellProp.position); }
    }
  }
  /** the magazine sits in the left hand (offset R.magOff in hand space): set the mag part so its root-space frame follows */
  magFollow(m, R) {
    const B = BABYLON, mag = m.magP;
    // desired mag frame in root space = inv(handOff) * handFrame, blended with the in-gun pose by R.magHand
    R.magOffInv.multiplyToRef(this.mL, this.mA);
    mag.parent.computeWorldMatrix(true);
    this.F(mag.parent, this.mB); this.mB.invertToRef(this.mC);
    this.mA.multiplyToRef(this.mC, this.mD);                       // mag local (in its parent) from the hand
    // in-gun local pose (already set by gunMotions) as the other end of the blend
    const q0 = this.tmpQ; B.Quaternion.FromEulerAnglesToRef(mag.rotation.x, mag.rotation.y, mag.rotation.z, q0);
    B.Matrix.ComposeToRef(B.Vector3.OneReadOnly, q0, mag.position, this.mE);
    blendFrames(this.mE, this.mD, R.magHand, this.mA);
    const q = new B.Quaternion(); this.mA.decompose(this.tmpV, q, mag.position);
    q.toEulerAnglesToRef(mag.rotation);
  }
  /** hand frame (root space) at an offset of a node: M = Compose(rot, pos) * F(node) */
  nodeHand(node, pos, rot, out) {
    const B = BABYLON;
    this.F(node, this.mC);
    const key = rot.join(',');
    let q = ROT.get(key); if (!q) { q = B.Quaternion.FromEulerAngles(rot[0], rot[1], rot[2]); ROT.set(key, q); }
    B.Matrix.ComposeToRef(B.Vector3.OneReadOnly, q, this.tmpV.set(pos[0], pos[1], pos[2]), this.mD);
    this.mD.multiplyToRef(this.mC, out);
    return out;
  }
  camFrame(f, out) {
    const B = BABYLON;
    B.Quaternion.FromEulerAnglesToRef(f[3], f[4], f[5], this.tmpQ);
    return B.Matrix.ComposeToRef(B.Vector3.OneReadOnly, this.tmpQ, this.tmpV.set(f[0], f[1], f[2]), out);
  }
  hand(R, side, M, k, kind) {
    const slot = side === 'L' ? (R._l || (R._l = { M: new BABYLON.Matrix(), k: 0 })) : (R._r || (R._r = { M: new BABYLON.Matrix(), k: 0 }));
    slot.M.copyFrom(M); slot.k = clamp(k, 0, 1);
    if (side === 'L') { R.left = slot; if (kind) R.leftKind = kind; } else R.right = slot;
  }

  // ---------------------------------------------------------------------------------------------- guns
  resetParts(m) {
    const gm = m.gm, B = m.base;
    for (const k in B) {
      const n = gm.parts[k]; if (!n) continue;
      n.position.copyFrom(B[k].p);
      if (B[k].q) { if (!n.rotationQuaternion) n.rotationQuaternion = B[k].q.clone(); else n.rotationQuaternion.copyFrom(B[k].q); }
      else { if (n.rotationQuaternion) n.rotationQuaternion = null; n.rotation.copyFrom(B[k].r); }
    }
  }
  partMove(m, key, k) {   // slide a part along its meta.slide travel (or -Z 25 mm), rotate by meta.cycleR
    const n = m.gm.parts[key]; if (!n || !k) return;
    const meta = (n.metadata && n.metadata.meta) || {}, b = m.base[key];
    const s = meta.slide || [0, 0, key === 'slide' ? -0.026 : key === 'charging' ? -0.06 : -0.03];
    n.position.set(b.p.x + s[0] * k, b.p.y + s[1] * k, b.p.z + s[2] * k);
  }
  partRot(m, key, r, k) { const n = m.gm.parts[key]; if (!n || !k || !r) return; const b = m.base[key]; n.rotation.set(b.r.x + r[0] * k, b.r.y + r[1] * k, b.r.z + r[2] * k); }

  gunMotions(m, ws, st, w, dt, add, R) {
    const gm = m.gm, parts = gm.parts;
    this.resetParts(m);
    if (m.magP) m.magP.setEnabled(true);
    const fam = famOf(st), pistol = st.cat === 'pistol';
    // slide / bolt cycle after a shot (self-loading guns)
    if (m.cyc !== false && m.cycKey && !st.cycle) {
      const u = this.slideT / Math.min(0.075, 60 / (st.rpm || 600) * 0.8);
      const back = u < 1 ? Math.sin(PI * Math.min(1, u)) : 0;
      const locked = w.mag === 0 && m.cycKey === 'slide' && ws.state !== 'reload';
      this.partMove(m, m.cycKey === 'charging' ? (parts.bolt ? 'bolt' : 'charging') : m.cycKey, locked ? 0.9 : back);
    }
    const rl = ws.rl;
    if (ws.state === 'reload' && rl) {
      const rk = st.reloadKind || 'mag';
      if (rl.kind === 'shell') this.shellReload(m, ws, st, rl, add, R);
      else if (rk === 'cylinder') this.revolverReload(m, ws, st, rl, add, R);
      else if (rk === 'belt') this.beltReload(m, ws, st, rl, add, R);
      else if (rk === 'break') this.breakReload(m, ws, st, rl, add, R);
      else this.magReload(m, ws, st, w, rl, add, R, pistol);
    }
    if (ws.state === 'inspect') {
      const u = clamp(ws.t / Math.max(0.1, ws.dur), 0, 1);
      const a = plateau(u, 0, 0.16, 0.42, 0.56), b = plateau(u, 0.44, 0.6, 0.8, 0.98);
      if (pistol) add(-0.06 * a - 0.03 * b, 0.03 * a + 0.02 * b, 0.02 * a, -0.2 * a + 0.1 * b, 0.7 * a - 0.5 * b, 0.6 * a - 0.9 * b);
      else add(-0.07 * a - 0.04 * b, 0.025 * a + 0.03 * b, 0.03 * a + 0.02 * b, -0.22 * a + 0.12 * b, 0.55 * a - 0.32 * b, 0.65 * a - 0.95 * b);
      // check the chamber in the middle of the inspect
      const cc = plateau(u, 0.6, 0.66, 0.72, 0.78);
      if (m.chargeKey && cc) {
        this.partMove(m, m.chargeKey, cc * 0.35);
        if (!pistol && m.chargeKey !== 'slide') this.hand(R, 'L', this.chargeHand(m), cc, 'hold');
      }
    }
    // manual actions between shots (the 'cycle' events start this.cyc)
    if (st.cycle && ws.cyc > 0) {
      const I = Math.max(0.15, 60 / (st.rpm || 60));
      const u = clamp(1 - ws.cyc / (I * 0.92), 0, 1);       // 0..1 over the cycle
      if (st.cycle === 'pump') {
        const back = ramp(u, 0.08, 0.3) * (1 - ramp(u, 0.36, 0.55));
        const n = parts.pump; if (n) { const meta = (n.metadata && n.metadata.meta) || {}; const s = meta.slide || [0, 0, -0.075]; const b = m.base.pump; n.position.set(b.p.x + s[0] * back, b.p.y + s[1] * back, b.p.z + s[2] * back); }
        if (parts.bolt) this.partMove(m, 'bolt', back);
        add(0, -0.006 * back, -0.012 * back, 0.05 * back, 0, 0.04 * back);
      } else if (st.cycle === 'bolt') {
        // hand to the handle, lift, pull, push, lower, back to the grip
        const reach = plateau(u, 0.0, 0.12, 0.74, 0.9), lift = plateau(u, 0.1, 0.2, 0.62, 0.72), pull = plateau(u, 0.2, 0.3, 0.42, 0.56);
        const meta = parts.bolt && parts.bolt.metadata && parts.bolt.metadata.meta || {};
        if (parts.bolt) {
          const b = m.base.bolt, cr = meta.cycleR || [0, 0, 1.0], s = meta.slide || [0, 0, -0.08];
          parts.bolt.rotation.set(b.r.x + cr[0] * lift, b.r.y + cr[1] * lift, b.r.z + cr[2] * lift);
          parts.bolt.position.set(b.p.x + s[0] * pull, b.p.y + s[1] * pull, b.p.z + s[2] * pull);
        }
        add(-0.012 * reach, -0.01 * reach, -0.01 * reach, 0.06 * reach, 0.08 * reach, 0.28 * reach);
        if (parts.bolt) this.hand(R, 'R', this.boltHand(m), reach, null);
      } else if (st.cycle === 'lever') {
        const c = plateau(u, 0.06, 0.28, 0.3, 0.5);
        const n = parts.lever; if (n) { const meta = (n.metadata && n.metadata.meta) || {}; const r = meta.cycleR || [0.95, 0, 0]; const b = m.base.lever; n.rotation.set(b.r.x + r[0] * c, b.r.y + r[1] * c, b.r.z + r[2] * c); }
        if (parts.bolt) this.partMove(m, 'bolt', c);
        add(0, -0.01 * c, -0.01 * c, -0.08 * c, 0, 0.05 * c);
        if (n) { // the trigger hand stays in the lever loop
          this.F(gm.hands.right, this.mA); this.hand(R, 'R', this.leverHand(m, n), 0.85 * c, null);
        }
      }
    }
    if (ws.dry > 0) { const b = bump(1 - ws.dry / 0.25, 0, 1); add(0, 0, -0.004 * b, -0.02 * b, 0, 0); }
  }
  /** support hand on the charging handle / bolt / slide (root space) */
  chargeHand(m) {
    const key = m.chargeKey, n = m.gm.parts[key], b = m.chB;
    if (key === 'slide') return this.nodeHand(n, [0, b.mx.y - 0.005, b.mn.z + 0.025], [0, 0, PI * 0.5], this.mE);
    const side = b.c.x >= 0 ? 1 : -1;
    return this.nodeHand(n, [b.c.x + side * 0.012, b.c.y + 0.01, b.c.z - 0.02], [0, 0, side > 0 ? -1.3 : 1.3], this.mE);
  }
  boltHand(m) {
    const n = m.gm.parts.bolt, b = m.boltB;
    return this.nodeHand(n, [b.mx.x + 0.012, b.c.y - 0.01, b.mn.z + 0.03], [0.3, 0, -1.2], this.mE);
  }
  leverHand(m, lever) {
    // rest relation between the grip frame and the lever, re-applied with the lever's current pose
    if (!m.leverRel) {
      const B = BABYLON, q = new B.Quaternion(), M = new B.Matrix(), L = new B.Matrix();
      // lever at rest = base rotation; compute once from the current frame with the lever at rest
      const r0 = lever.rotation.clone(); lever.rotation.copyFrom(m.base.lever.r);
      this.F(m.gm.hands.right, M); this.F(lever, L); L.invert(); m.leverRel = M.multiply(L); lever.rotation.copyFrom(r0); void q;
    }
    this.F(lever, this.mC); m.leverRel.multiplyToRef(this.mC, this.mE); return this.mE;
  }
  /** hand pose that holds the magazine: palm on the mag's side, fingers round its front (mag-local) */
  magHandOff(m) {
    if (m.magOff) return m.magOff;
    const B = BABYLON, b = m.magB, y = b.mn.y * 0.55 + b.mx.y * 0.45;
    m.magOff = B.Matrix.Compose(B.Vector3.One(), B.Quaternion.FromEulerAngles(0.15, PI / 2, 0.1), new B.Vector3(b.mn.x - 0.004, Math.min(y, b.mx.y - 0.04), b.c.z));
    m.magOffInv = m.magOff.clone().invert();
    return m.magOff;
  }
  /** magazine reloads: tactical (pull it, stow it, new one) and empty (drop it, new one, release / charge) */
  magReload(m, ws, st, w, rl, add, R, pistol) {
    const u = reloadProgress(this.g.local), E = rl.empty, B = BABYLON, gm = m.gm;
    // gun: turned toward the support hand, magazine well up
    const T = ramp(u, 0, 0.12) * (1 - ramp(u, 0.86, 1));
    if (pistol) add(-0.03 * T, -0.01 * T, -0.03 * T, -0.28 * T, 0.2 * T, 0.32 * T);
    else add(-0.035 * T, -0.012 * T, -0.02 * T, -0.14 * T, 0.22 * T, 0.5 * T);
    if (!m.magP) { const s = bump(u, 0.6, 0.75); add(0, 0.006 * s, 0, -0.05 * s, 0, 0); return; }
    const mag = m.magP, mb = m.base.mag;
    const down = new B.Vector3(0, -1, 0);                // out of the well: the mag part's own -Y
    const out = (k) => { mag.position.set(mb.p.x + down.x * k, mb.p.y + down.y * k, mb.p.z + down.z * k); };
    const off = this.magHandOff(m); R.magOffInv = m.magOffInv;
    const pouch = this.camFrame(POUCH, this.mD).clone();
    // timeline (shares of the reload; weapon.js: magout .16, magin .70 tactical / .62 empty, chamber .86 empty)
    const kIn = E ? 0.62 : 0.70;
    const grabA = E ? 0.1 : 0.08, grabB = E ? 0.15 : 0.16;      // hand reaches the mag (tactical) / the pouch starts (empty)
    const pouchA = E ? 0.3 : 0.36, pouchB = E ? 0.34 : 0.42;     // at the pouch
    const wellA = kIn - 0.1, seatA = kIn - 0.04;
    // where the magazine is (0 = seated, + = metres out of the well)
    let k = 0, handOnMag = 0;
    // pose of the hand: in gun-hand (hold), at the mag, at the pouch
    this.F(mag.parent, this.mA);
    // the mag-in-well frame (root space), used to build "hand at mag" frames at any extraction
    const magAt = (ext, out2) => { const q = this.tmpQ; B.Quaternion.FromEulerAnglesToRef(mb.r.x, mb.r.y, mb.r.z, q); B.Matrix.ComposeToRef(B.Vector3.OneReadOnly, q, this.tmpV.set(mb.p.x, mb.p.y - ext, mb.p.z), this.mB); this.mB.multiplyToRef(this.mA, this.mC); off.multiplyToRef(this.mC, out2); return out2; };
    const hm = new B.Matrix(), hm2 = new B.Matrix();
    if (!E) {
      // tactical: grab -> pull out .16-.22 -> to pouch (with it) -> new one -> up -> seat
      const toMag = ramp(u, grabA, grabB) * (1 - ramp(u, 0.2, 0.36));
      if (u < 0.2) { magAt(0, hm); this.hand(R, 'L', hm, ramp(u, grabA, grabB), 'grip'); }
      else if (u < pouchA) { magAt(0.09, hm); blendFrames(hm, pouch, ramp(u, 0.22, pouchA), hm2); this.hand(R, 'L', hm2, 1, 'grip'); }
      else if (u < pouchB) this.hand(R, 'L', pouch, 1, 'grip');
      else if (u < kIn) { magAt(0.09 * (1 - ramp(u, seatA, kIn)), hm); blendFrames(pouch, hm, ramp(u, pouchB, wellA), hm2); this.hand(R, 'L', hm2, 1, 'grip'); }
      else { magAt(0, hm); this.hand(R, 'L', hm, 1 - ramp(u, kIn + 0.04, 0.9), 'grip'); }
      k = u < 0.16 ? 0 : u < 0.22 ? 0.09 * ramp(u, 0.16, 0.22) : 0.09;
      handOnMag = u >= 0.16 && u < kIn ? 1 : 0;
      if (u >= kIn) k = 0;
      void toMag;
    } else {
      // empty: the mag drops free at .16, the hand goes straight to the pouch, new mag up, seat, then charge / release
      if (u < grabB) { this.hand(R, 'L', pouch, ramp(u, 0.12, grabB) * 0.4, 'grip'); }
      else if (u < pouchA) { this.F(gm.hands.left || mag, this.mB); blendFrames(this.mB, pouch, ramp(u, grabB, pouchA - 0.02), hm2); this.hand(R, 'L', hm2, 1, 'grip'); }
      else if (u < pouchB) this.hand(R, 'L', pouch, 1, 'grip');
      else if (u < kIn) { magAt(0.09 * (1 - ramp(u, seatA, kIn)), hm); blendFrames(pouch, hm, ramp(u, pouchB, wellA), hm2); this.hand(R, 'L', hm2, 1, 'grip'); }
      else {
        // release / charge: .70-.86 to the handle, pull at .80-.86, back
        const reach = plateau(u, kIn + 0.04, 0.76, 0.88, 0.97);
        if (m.chargeKey) { this.hand(R, 'L', this.chargeHand(m), reach, m.chargeKey === 'slide' ? 'hold' : 'hold'); }
        const pull = plateau(u, 0.78, 0.83, 0.84, 0.87);
        if (m.chargeKey) this.partMove(m, m.chargeKey, pull);
        if (m.chargeKey !== 'slide' && gm.parts.bolt && m.chargeKey !== 'bolt') this.partMove(m, 'bolt', pull);
        if (pistol && gm.parts.slide) { const lock = 1 - ramp(u, 0.84, 0.87); this.partMove(m, 'slide', Math.max(lock * 0.9, pull)); }
        magAt(0, hm);
      }
      if (u < 0.16) k = 0;
      else if (u < pouchB) {         // falling: gravity along the well, gone after .25 s
        const tt = (u - 0.16) * (rl.dur || 2.5); k = 0.05 + 4.9 * tt * tt * 1.5;
        if (k > 0.45) mag.setEnabled(false);
      } else k = u < kIn ? 0.09 * (1 - ramp(u, seatA, kIn)) : 0;
      handOnMag = u >= pouchB && u < kIn ? 1 : 0;
      if (pistol && gm.parts.slide && u < kIn) this.partMove(m, 'slide', 0.9);   // slide locked back on empty
    }
    out(k);
    if (handOnMag) R.magHand = 1;
    // pouch: hide the magazine while the hand is out of sight there
    if (u > pouchA - 0.02 && u < pouchB + 0.02 && !E) mag.setEnabled(false);
    // seat bump at the insert point
    const seat = bump(u, kIn - 0.015, kIn + 0.05); add(0, 0.007 * seat, 0.003 * seat, -0.05 * seat, 0, 0.02 * seat);
    if (E && !pistol) { const ch = bump(u, 0.83, 0.9); add(0, -0.004 * ch, -0.006 * ch, 0.04 * ch, 0, -0.03 * ch); }
  }
  /** shells one by one: the support hand fetches each shell from the pouch to the loading port and thumbs it in */
  shellReload(m, ws, st, rl, add, R) {
    const B = BABYLON, gm = m.gm;
    if (!this.shellProp) this.makeShellProp();
    const v = clamp(rl.t / Math.max(0.01, rl.dur), 0, 1);
    // gun rolled left to show the loading port
    let T = 1;
    if (rl.phase === 'start') T = ramp(v, 0, 0.6); else if (rl.phase === 'end') T = 1 - ramp(v, 0.3, 1);
    add(-0.03 * T, 0.01 * T, -0.02 * T, -0.12 * T, 0.12 * T, -0.55 * T);
    // the loading port: under the receiver, just ahead of the trigger guard
    const port = gm.sockets && gm.sockets.mag ? gm.sockets.mag : (gm.hands.right || gm.root);
    const portM = this.nodeHand(port, [0.0, -0.035, 0.03], [0, PI / 2, 0.4], new B.Matrix());
    const pouch = this.camFrame(POUCH, new B.Matrix());
    const hm = new B.Matrix();
    if (rl.phase === 'start') { blendFrames(pouch, portM, ramp(v, 0.3, 1), hm); this.hand(R, 'L', hm, ramp(v, 0, 0.35), 'grip'); R.shell = v > 0.6 ? 1 : 0; }
    else if (rl.phase === 'load') {
      // 0-.3 down to the pouch, .3-.62 up with a shell, .62-.9 push it in
      if (v < 0.3) blendFrames(portM, pouch, ramp(v, 0, 0.3), hm);
      else blendFrames(pouch, portM, ramp(v, 0.3, 0.62), hm);
      const push = bump(v, 0.62, 0.95);
      const P = this.nodeHand(port, [0.0, -0.035 + 0.02 * push, 0.03 + 0.03 * push], [0, PI / 2, 0.4], new B.Matrix());
      this.hand(R, 'L', v >= 0.62 ? P : hm, 1, 'grip');
      R.shell = v > 0.32 && v < 0.88 ? 1 : 0;
      add(0, 0.004 * push, 0, -0.02 * push, 0, 0);
    } else {
      // end: back to the forend; an empty gun is racked (pump) / closed (lever) / released (semi)
      this.hand(R, 'L', portM, 1 - ramp(v, 0.05, 0.6), 'grip');
      if (rl.empty) {
        const c = plateau(v, 0.45, 0.62, 0.68, 0.88);
        if (st.cycle === 'pump' && gm.parts.pump) { const b = m.base.pump, n = gm.parts.pump, s = (n.metadata && n.metadata.meta && n.metadata.meta.slide) || [0, 0, -0.075]; n.position.set(b.p.x + s[0] * c, b.p.y + s[1] * c, b.p.z + s[2] * c); }
        else if (st.cycle === 'lever' && gm.parts.lever) { const n = gm.parts.lever, r = (n.metadata && n.metadata.meta && n.metadata.meta.cycleR) || [0.95, 0, 0], b = m.base.lever; n.rotation.set(b.r.x + r[0] * c, b.r.y + r[1] * c, b.r.z + r[2] * c); }
        else if (m.chargeKey) { this.partMove(m, m.chargeKey, c); }
        add(0, -0.008 * c, -0.012 * c, 0.05 * c, 0, 0.03 * c);
      }
    }
  }
  makeShellProp() {
    const B = BABYLON, S = this.scene;
    const root = new B.TransformNode('vmShell', S); root.parent = this.root; root.rotationQuaternion = new B.Quaternion();
    const hull = B.MeshBuilder.CreateCylinder('vmShellHull', { height: 0.058, diameter: 0.0205, tessellation: 12 }, S);
    const head = B.MeshBuilder.CreateCylinder('vmShellHead', { height: 0.012, diameter: 0.0225, tessellation: 12 }, S);
    const hm = new B.PBRMaterial('vmShellHullM', S); hm.albedoColor = new B.Color3(0.42, 0.05, 0.04); hm.metallic = 0; hm.roughness = 0.55;
    const bm = new B.PBRMaterial('vmShellHeadM', S); bm.albedoColor = new B.Color3(0.75, 0.55, 0.25); bm.metallic = 1; bm.roughness = 0.3;
    hull.material = hm; head.material = bm; hull.parent = root; head.parent = root; head.position.y = -0.03;
    for (const mm of [hull, head]) { mm.renderingGroupId = 1; mm.isPickable = false; mm.alwaysSelectAsActiveMesh = true; }
    root.setEnabled(false);
    this.shellProp = root; this.shellMats = [hm, bm];
  }
  revolverReload(m, ws, st, rl, add, R) {
    const u = reloadProgress(this.g.local), gm = m.gm, P = gm.parts, B = BABYLON;
    const T = ramp(u, 0, 0.1) * (1 - ramp(u, 0.86, 1));
    add(-0.05 * T, 0.0, -0.03 * T, -0.15 * T, 0.35 * T, 0.75 * T);
    const open = ramp(u, 0.06, 0.16) * (1 - ramp(u, 0.8, 0.88));
    const crane = P.crane; if (crane) { const sw = (crane.metadata && crane.metadata.meta && crane.metadata.meta.swing) || [0, 0, 1.25]; const b = m.base.crane; crane.rotation.set(b.r.x + sw[0] * open, b.r.y + sw[1] * open, b.r.z + sw[2] * open); }
    // ejector stroke (muzzle up) at .16-.26
    const ej = bump(u, 0.16, 0.28); add(0, 0.02 * ej, 0, -0.5 * ej, 0, 0);
    if (P.cylinder) { const spin = ramp(u, 0.3, 0.7) * 2.1; const b = m.base.cylinder; P.cylinder.rotation.z = b.r.z + spin; }
    // support hand: thumbs the crane open, speed loader from the pouch .3-.62, pushes the cylinder closed .78
    const pouch = this.camFrame(POUCH, new B.Matrix()), hm = new B.Matrix();
    const cyl = P.cylinder || crane;
    const atCyl = cyl ? this.nodeHand(cyl, [0, -0.0, -0.06], [0, 0, 0], new B.Matrix()) : pouch;
    if (u < 0.3) { this.F(gm.hands.left || gm.root, hm); blendFrames(hm, pouch, ramp(u, 0.2, 0.3), hm); this.hand(R, 'L', hm, 1, 'grip'); }
    else if (u < 0.62) { blendFrames(pouch, atCyl, ramp(u, 0.36, 0.6), hm); this.hand(R, 'L', hm, 1, 'grip'); }
    else { this.F(gm.hands.left || gm.root, hm); blendFrames(atCyl, hm, ramp(u, 0.7, 0.9), hm); this.hand(R, 'L', hm, 1, 'grip'); }
    if (!this.loaderProp) this.makeLoader();
    const on = u > 0.34 && u < 0.7;
    this.loaderProp.setEnabled(on);
    if (on) { this.mE.copyFrom(this.mL); this.F(cyl || gm.root, this.mC); this.mC.decompose(this.tmpV, this.loaderProp.rotationQuaternion, this.loaderProp.position);
      const k = 1 - ramp(u, 0.52, 0.62); this.loaderProp.position.addInPlace(this.tmpV.set(0, -0.03 - 0.25 * (1 - ramp(u, 0.34, 0.6)), -0.06 - 0.06 * k)); }
  }
  makeLoader() {
    const B = BABYLON, S = this.scene, root = new B.TransformNode('vmLoader', S); root.parent = this.root; root.rotationQuaternion = new B.Quaternion();
    const mat = new B.PBRMaterial('vmLoaderM', S); mat.albedoColor = new B.Color3(0.05, 0.05, 0.05); mat.roughness = 0.6; mat.metallic = 0;
    const brass = new B.PBRMaterial('vmLoaderB', S); brass.albedoColor = new B.Color3(0.78, 0.6, 0.3); brass.metallic = 1; brass.roughness = 0.3;
    const body = B.MeshBuilder.CreateCylinder('vmLoaderBody', { height: 0.018, diameter: 0.036, tessellation: 16 }, S);
    body.rotation.x = PI / 2; body.position.z = -0.012; body.material = mat; body.parent = root;
    for (let i = 0; i < 6; i++) { const a = i / 6 * PI * 2, c = B.MeshBuilder.CreateCylinder('vmLoaderC' + i, { height: 0.03, diameter: 0.0095, tessellation: 8 }, S); c.rotation.x = PI / 2; c.position.set(Math.cos(a) * 0.0125, Math.sin(a) * 0.0125, 0.012); c.material = brass; c.parent = root; }
    for (const mm of root.getChildMeshes()) { mm.renderingGroupId = 1; mm.isPickable = false; mm.alwaysSelectAsActiveMesh = true; }
    root.setEnabled(false); this.loaderProp = root; this.loaderMats = [mat, brass];
  }
  beltReload(m, ws, st, rl, add, R) {
    const u = reloadProgress(this.g.local), gm = m.gm, P = gm.parts, B = BABYLON, E = rl.empty;
    const T = ramp(u, 0, 0.1) * (1 - ramp(u, 0.88, 1));
    add(-0.03 * T, 0.01 * T, -0.03 * T, -0.1 * T, 0.2 * T, 0.35 * T);
    const open = ramp(u, 0.04, 0.14) * (1 - ramp(u, 0.74, 0.82));
    if (P.cover) { const r = (P.cover.metadata && P.cover.metadata.meta && P.cover.metadata.meta.openR) || [-1.1, 0, 0]; const b = m.base.cover; P.cover.rotation.set(b.r.x + r[0] * open, b.r.y + r[1] * open, b.r.z + r[2] * open); }
    const pouch = this.camFrame(POUCH, new B.Matrix()), hm = new B.Matrix();
    const coverH = P.cover ? this.nodeHand(P.cover, [0, 0.02, 0.0], [0, 0, PI], new B.Matrix()) : pouch;
    if (m.magP) {
      const off = this.magHandOff(m); R.magOffInv = m.magOffInv;
      const mb = m.base.mag, mag = m.magP; this.F(mag.parent, this.mA);
      const magAt = (ext, out2) => { B.Quaternion.FromEulerAnglesToRef(mb.r.x, mb.r.y, mb.r.z, this.tmpQ); B.Matrix.ComposeToRef(B.Vector3.OneReadOnly, this.tmpQ, this.tmpV.set(mb.p.x, mb.p.y - ext, mb.p.z), this.mB); this.mB.multiplyToRef(this.mA, this.mC); off.multiplyToRef(this.mC, out2); return out2; };
      let k = 0;
      if (u < 0.14) { blendFrames(this.F(gm.hands.left || gm.root, hm), coverH, ramp(u, 0.02, 0.1), hm); this.hand(R, 'L', hm, 1, 'hold'); }
      else if (u < 0.22) { magAt(0, hm); blendFrames(coverH, hm, ramp(u, 0.14, 0.2), hm); this.hand(R, 'L', hm, 1, 'grip'); }
      else if (u < 0.4) { magAt(0.1, hm); blendFrames(hm, pouch, ramp(u, 0.24, 0.38), hm); this.hand(R, 'L', hm, 1, 'grip'); k = 0.1 * ramp(u, 0.2, 0.26); R.magHand = 1; }
      else if (u < 0.6) { magAt(0.1 * (1 - ramp(u, 0.54, 0.6)), hm); blendFrames(pouch, hm, ramp(u, 0.44, 0.56), hm); this.hand(R, 'L', hm, 1, 'grip'); k = 0.1 * (1 - ramp(u, 0.54, 0.6)); R.magHand = 1; }
      else if (u < 0.8) { blendFrames(magAt(0, hm), coverH, ramp(u, 0.62, 0.72), hm); this.hand(R, 'L', hm, 1, 'hold'); }
      else { this.F(gm.hands.left || gm.root, this.mB); blendFrames(coverH, this.mB, ramp(u, 0.8, 0.92), hm); this.hand(R, 'L', hm, 1, 'hold'); }
      if (u > 0.36 && u < 0.46) mag.setEnabled(false);
      mag.position.set(mb.p.x, mb.p.y - k, mb.p.z);
    }
    const slam = bump(u, 0.74, 0.82); add(0, 0.008 * slam, 0, -0.04 * slam, 0, 0);
    if (E && m.chargeKey) { const c = plateau(u, 0.84, 0.88, 0.9, 0.95); this.partMove(m, m.chargeKey, c); }
  }
  breakReload(m, ws, st, rl, add, R) {
    const u = reloadProgress(this.g.local), gm = m.gm, P = gm.parts, B = BABYLON;
    if (!this.shellProp) this.makeShellProp();
    const T = ramp(u, 0, 0.12) * (1 - ramp(u, 0.85, 1));
    add(-0.02 * T, -0.01 * T, -0.02 * T, 0.18 * T, 0.18 * T, 0.25 * T);
    const open = ramp(u, 0.04, 0.16) * (1 - ramp(u, 0.78, 0.86));
    if (P.barrels) { const r = (P.barrels.metadata && P.barrels.metadata.meta && P.barrels.metadata.meta.breakR) || [0.62, 0, 0]; const b = m.base.barrels; P.barrels.rotation.set(b.r.x + r[0] * open, b.r.y + r[1] * open, b.r.z + r[2] * open); }
    const pouch = this.camFrame(POUCH, new B.Matrix()), hm = new B.Matrix();
    const breech = P.barrels ? this.nodeHand(P.barrels, [0, -0.01, -0.02], [0, PI / 2, 0.3], new B.Matrix()) : pouch;
    this.F(gm.hands.left || gm.root, this.mB);
    if (u < 0.3) { blendFrames(this.mB, pouch, ramp(u, 0.14, 0.3), hm); this.hand(R, 'L', hm, 1, 'grip'); }
    else if (u < 0.7) { const v = (u - 0.3) / 0.4, f = v < 0.5 ? ramp(v, 0.05, 0.4) : 1 - ramp(v, 0.5, 0.6) + ramp(v, 0.6, 0.9); blendFrames(pouch, breech, clamp(f, 0, 1), hm); this.hand(R, 'L', hm, 1, 'grip'); R.shell = 1; }
    else { blendFrames(breech, this.mB, ramp(u, 0.72, 0.84), hm); this.hand(R, 'L', hm, 1, 'grip'); }
    const shut = bump(u, 0.8, 0.88); add(0, 0.006 * shut, 0, -0.08 * shut, 0, 0);
  }

  // ---------------------------------------------------------------------------------------------- melee
  meleeMotions(m, ws, add, R) {
    const ml = ws.ml, spec = m.gm.gun || {};
    R.hideL = true;
    if (ws.state === 'inspect') {
      const u = clamp(ws.t / Math.max(0.1, ws.dur), 0, 1), a = plateau(u, 0, 0.2, 0.45, 0.6), b = plateau(u, 0.45, 0.62, 0.85, 1);
      add(-0.05 * a - 0.02 * b, 0.03 * a + 0.02 * b, 0.04 * a, 0.35 * a - 0.1 * b, 0.9 * a - 0.4 * b, -0.9 * a + 1.4 * b);
    }
    if (!ml) return;
    const u = clamp(ml.t / Math.max(0.05, ml.dur), 0, 1), h = clamp(ml.hitAt / Math.max(0.05, ml.dur), 0.05, 0.9);
    const big = spec.archetype === 'machete' || spec.archetype === 'tomahawk' ? 1.25 : 1;
    if (ml.kind === 'slash') {
      const s = ml.side ? 1 : -1;
      const wind = ramp(u, 0, h * 0.6) * (1 - ramp(u, h * 0.6, h * 1.6));
      const sweep = ramp(u, h * 0.4, h * 1.9), back = 1 - ramp(u, h * 1.9, 1);
      const k = sweep * back * big;
      add(s * (0.08 * wind - 0.24 * k), 0.04 * wind - 0.03 * k, 0.06 * k, -0.3 * wind + 0.25 * k, s * (0.6 * wind - 1.4 * k), s * (-0.35 * wind + 1.0 * k));
    } else if (ml.kind === 'stab') {
      const pull = ramp(u, 0, h) * (1 - ramp(u, h, h + 0.08));
      const thrust = ramp(u, h * 0.95, h + 0.08) * (1 - ramp(u, h + 0.25, 1));
      add(-0.05 * thrust, 0.03 * thrust - 0.02 * pull, -0.1 * pull + 0.22 * thrust, 0.45 * pull - 0.3 * thrust, 0.3 * thrust, -0.6 * thrust);
    } else if (ml.kind === 'throw') {
      // wind up over the shoulder, release at hitAt (the model leaves the hand: weapon.js removes it from the inventory)
      const wind = ramp(u, 0, h);
      add(0.04 * wind, 0.12 * wind, -0.12 * wind, -1.1 * wind, 0.2 * wind, 0.3 * wind);
    }
  }

  // ---------------------------------------------------------------------------------------------- grenades
  nadeMotions(m, ws, dt, add, R) {
    const nm = m.nade, B = BABYLON;
    for (const [k, b] of Object.entries(m.base)) { const n = nm.parts[k]; if (n) { n.position.copyFrom(b.p); n.rotation.copyFrom(b.r); n.setEnabled(true); } }
    const cook = ws.nadeT >= 0 ? ws.nadeT : -1, under = (ws.btn & 2) && !(ws.btn & 1);
    if (this.nadeThrowT < 0.55) {
      // throw: overhand arc (or an underhand roll) and the hand empties
      const u = this.nadeThrowT / 0.55, s = bump(u, 0, 0.6), f = ramp(u, 0, 0.35);
      if (this.nadeUnder) add(0.02 * s, -0.08 * s, 0.15 * f * (1 - u), 0.6 * s, 0, 0); else add(-0.04 * s, 0.06 * s - 0.15 * ramp(u, 0.3, 1), 0.2 * f * (1 - u), 0.8 * f - 0.5 * ramp(u, 0.4, 1), -0.2 * s, -0.3 * s);
      if (u > 0.12) nm.root.setEnabled(false);
      R.hideL = true;
      return;
    }
    nm.root.setEnabled(true);
    if (cook < 0) {
      R.hideL = true;
      return;
    }
    // pin pulled with the left hand (.0-.25 s), then the grenade is held back ready to throw
    const pin = ramp(cook, 0, 0.12), away = ramp(cook, 0.12, 0.3);
    const ready = ramp(cook, 0.1, 0.35);
    if (under) add(0.02 * ready, -0.1 * ready, 0.05 * ready, 0.5 * ready, 0, 0.2 * ready);
    else add(0.03 * ready, 0.09 * ready, -0.1 * ready, -0.5 * ready, -0.15 * ready, -0.2 * ready);
    const pinN = nm.parts.pin;
    const hm = new B.Matrix();
    if (pinN) {
      const b = m.base.pin; pinN.position.set(b.p.x - 0.06 * away, b.p.y, b.p.z);
      if (away >= 1) pinN.setEnabled(false);
      this.nodeHand(pinN, [-0.02, 0.0, -0.01], [0, -PI / 2, PI / 2], hm);
      const gone = ramp(cook, 0.3, 0.55);
      if (gone > 0) { const pouch = this.camFrame([-0.2, -0.35, 0.25, 0.3, 0, -0.5], new B.Matrix()); blendFrames(hm, pouch, gone, hm); }
      this.hand(R, 'L', hm, 1 - ramp(cook, 0.5, 0.6) * 0, 'hold');
      if (cook > 0.62) R.hideL = true;
      void pin;
    } else R.hideL = true;
    if (nm.parts.spoon && cook > 0 && this.g.local && getNade(m.gid) && getNade(m.gid).cookable && cook > 0.6) { /* spoon stays clamped until the throw */ }
  }

  setEnabled(m, on) {
    if (!m) return;
    const r = m.gm ? m.gm.root : m.nade ? m.nade.root : null; if (r && r.isEnabled() !== on) r.setEnabled(on);
    if (!on) { if (this.shellProp) this.shellProp.setEnabled(false); if (this.loaderProp) this.loaderProp.setEnabled(false); }
  }
  dispose() {
    for (const f of this.offs) f(); this.offs.length = 0;
    for (const uid of [...this.models.keys()]) this.drop(uid);
    this.hands.dispose();
    for (const mt of [...(this.shellMats || []), ...(this.loaderMats || [])]) mt.dispose();
    if (this.shellProp) this.shellProp.dispose(false, false);
    if (this.loaderProp) this.loaderProp.dispose(false, false);
    this.holder.dispose(false, false); this.root.dispose(false, false);
  }
}
