/* LIVE FIRE — first-person viewmodel: the local player's gun (js/weapons/models.js buildGun, LOD 0) or knife, rendered in
   renderingGroupId 1 with the depth buffer cleared first, so it never clips into walls. Hip pose, an ADS pose that puts
   GunModel.sight.eye exactly on the camera, look sway, movement bob, recoil kick (springs), moving parts (slide / bolt cycle,
   magazine out and in), procedural draw / reload / inspect / fire-mode motions, a procedural knife with slash and stab.
   Uses only the GunModel API (root, parts, sockets, muzzle, eject, sight.eye, hands). Hands come later (another worker).
   Exports:
     Viewmodel   class (game system 'viewmodel'): new Viewmodel(scene, game, rig)
       root (TransformNode parented to the camera), current { gm, w, knife }, visible
       muzzleNode() -> TransformNode | null    (effects.js puts the local muzzle flash on it)
       ejectNode() -> TransformNode | null
       prebuild(p)          builds the models of p's loadout (avoids a hitch on the first switch)
       frame(dt), dispose()
   Pose space = camera space (+Z forward, +X right, +Y up). The ADS pose is exact: root.position = -R * eye, so the sight line
   passes through the camera origin whatever the gun. */
import { buildGun, gunMaterial } from '../weapons/models.js';
import { getGun } from '../weapons/data.js';
import { clamp, damp, smoothstep } from '../core/util.js';
import { currentWeapon, statsOf, reloadProgress, adsZoom, scopedView } from './weapon.js';

const DEG = Math.PI / 180;
// hip poses (gun origin = trigger) per category: [x, y, z, yaw, pitch, roll]
const HIP = {
  pistol: [0.125, -0.15, 0.4, -0.04, 0.0, 0.02], smg: [0.15, -0.175, 0.34, -0.035, 0.01, 0.03], rifle: [0.155, -0.18, 0.33, -0.035, 0.01, 0.035],
  carbine: [0.155, -0.178, 0.335, -0.035, 0.01, 0.035], br: [0.158, -0.184, 0.325, -0.035, 0.01, 0.035], shotgun: [0.16, -0.184, 0.325, -0.035, 0.012, 0.04],
  dmr: [0.158, -0.184, 0.325, -0.032, 0.01, 0.03], sniper: [0.162, -0.19, 0.32, -0.03, 0.01, 0.03], lmg: [0.165, -0.195, 0.33, -0.035, 0.012, 0.04],
  melee: [0.17, -0.2, 0.46, -0.42, -0.28, 1.25],
};

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
const ease = u => u * u * (3 - 2 * u);
const bump = (u, a, b) => (u <= a || u >= b ? 0 : Math.sin(Math.PI * (u - a) / (b - a)));
const ramp = (u, a, b) => smoothstep(a, b, u);

export class Viewmodel {
  constructor(scene, game, rig) {
    this.name = 'viewmodel'; this.scene = scene; this.g = game; this.rig = rig;
    this.root = new BABYLON.TransformNode('vmRoot', scene);
    this.root.parent = rig.camera;
    this.holder = new BABYLON.TransformNode('vmHolder', scene);
    this.holder.parent = this.root;
    this.models = new Map();       // weapon uid -> { gm, w, parts0 }
    this.current = null; this.visible = true;
    this.pos = new Spring3(170, 0.72); this.rot = new Spring3(190, 0.7);
    this.shotT = 9; this.slideT = 9; this.lastSeq = -1; this.lastYaw = null; this.lastPitch = 0;
    this.swayX = 0; this.swayY = 0; this.lastSlot = null; this.modeT = 9; this.adsLast = 0;
    this.knife = null;
    this.tmpQ = new BABYLON.Quaternion(); this.tmpV = new BABYLON.Vector3(); this.tmpM = new BABYLON.Matrix();
    this.offs = [
      game.bus.on('shot', e => { if (e.p && e.p.local) this.kick(e); }),
      game.bus.on('firemode', e => { if (e.p && e.p.local) this.modeT = 0; }),
      game.bus.on('spawn', e => { if (e.p && e.p.local) { this.pos.reset(); this.rot.reset(); this.prebuild(e.p); } }),
    ];
  }

  setGroup(node) {
    for (const m of node.getChildMeshes(false)) {
      m.renderingGroupId = 1; m.isPickable = false; m.alwaysSelectAsActiveMesh = true; m.receiveShadows = false;
      if (m.material && m.material.needDepthPrePass) m.material.needDepthPrePass = false;
    }
  }
  modelFor(w) {
    if (!w) return null;
    let m = this.models.get(w.uid);
    if (m && m.w === w && m.mods === w.mods && m.skin === w.skin) return m;   // same instance, same mods object: no allocation per frame
    const key = w.gunId + '|' + JSON.stringify(w.mods || {}) + '|' + (w.skin || '');
    if (m && m.key !== key) { this.drop(w.uid); m = null; }
    if (m) { m.w = w; m.mods = w.mods; m.skin = w.skin; return m; }
    if (w.melee) m = { knife: this.buildKnife(w), w, key };
    else {
      let gm = null;
      try { gm = buildGun(this.scene, w.gunId, { lod: 0, skin: w.skin, mods: w.mods }); } catch (e) { console.error('[viewmodel] buildGun failed', e); return null; }
      gm.root.parent = this.holder; gm.root.setEnabled(false);
      this.setGroup(gm.root);
      const base = {};
      for (const [k, n] of Object.entries(gm.parts || {})) base[k] = { p: n.position.clone(), r: n.rotation.clone() };
      const cycKey = ['slide', 'bolt', 'charging'].find(k => gm.parts[k]) || null;
      m = { gm, w, key, base, cycKey, cyc: cycKey ? gm.parts[cycKey] : null, magP: gm.parts.mag || null };
    }
    m.mods = w.mods; m.skin = w.skin;
    this.models.set(w.uid, m);
    if (this.models.size > 4) { for (const uid of this.models.keys()) { if (uid !== w.uid && !this.inUse(uid)) { this.drop(uid); break; } } }
    return m;
  }
  inUse(uid) { const p = this.g.local; if (!p) return false; const i = p.inv; return [i.primary, i.secondary, i.melee].some(w => w && w.uid === uid); }
  drop(uid) {
    const m = this.models.get(uid); if (!m) return;
    if (this.current === m) this.current = null;
    if (m.gm) m.gm.dispose(); if (m.knife) m.knife.root.dispose(false, false);
    this.models.delete(uid);
  }
  prebuild(p) { for (const w of [p.inv.primary, p.inv.secondary, p.inv.melee]) if (w) this.modelFor(w); }

  buildKnife(w) {
    const S = this.scene, BB = BABYLON, root = new BB.TransformNode('vmKnife', S);
    root.parent = this.holder; root.setEnabled(false);
    const spec = getGun(w.gunId), L = (spec.model && spec.model.blade) || 0.165;
    const bladeMat = gunMaterial(S, spec.model && spec.model.finish === 'steel' ? 'stainless' : 'park');
    const edgeMat = gunMaterial(S, 'steel'), gripMat = gunMaterial(S, 'rubber'), guardMat = gunMaterial(S, 'dksteel');
    // blade: a convex drop-point profile in the y-z plane, extruded +-t along x, with a thin bright edge bevel
    const prof = [[0, 0.004], [L * 0.55, 0.0], [L * 0.86, 0.004], [L, 0.019], [L * 0.86, 0.028], [L * 0.45, 0.031], [0, 0.031]];
    const mk = (pts, t, mat, name) => {
      const pos = [], idx = [], n = pts.length;
      for (const s of [-1, 1]) for (const [z, y] of pts) pos.push(s * t, y, z);
      for (let i = 1; i < n - 1; i++) { idx.push(0, i + 1, i); idx.push(n, n + i, n + i + 1); }
      for (let i = 0; i < n; i++) { const j = (i + 1) % n; idx.push(i, j, n + j); idx.push(i, n + j, n + i); }
      const vd = new BB.VertexData(); vd.positions = pos; vd.indices = idx; const nor = []; BB.VertexData.ComputeNormals(pos, idx, nor); vd.normals = nor;
      const m = new BB.Mesh(name, S); vd.applyToMesh(m); m.material = mat; m.parent = root; m.convertToFlatShadedMesh(); return m;
    };
    mk(prof, 0.0021, bladeMat, 'kBlade');
    mk([[L * 0.08, 0.0005], [L * 0.55, -0.0035], [L * 0.86, 0.0005], [L * 0.97, 0.0145], [L * 0.86, 0.006], [L * 0.55, 0.0025], [L * 0.08, 0.005]], 0.0009, edgeMat, 'kEdge');
    const grip = BB.MeshBuilder.CreateCylinder('kGrip', { height: 0.115, diameterTop: 0.026, diameterBottom: 0.03, tessellation: 12 }, S);
    grip.rotation.x = Math.PI / 2; grip.position.set(0, 0.016, -0.064); grip.scaling.x = 0.82; grip.material = gripMat; grip.parent = root;
    const guard = BB.MeshBuilder.CreateBox('kGuard', { width: 0.012, height: 0.05, depth: 0.008 }, S);
    guard.position.set(0, 0.014, -0.004); guard.material = guardMat; guard.parent = root;
    const pom = BB.MeshBuilder.CreateBox('kPommel', { width: 0.02, height: 0.026, depth: 0.012 }, S);
    pom.position.set(0, 0.015, -0.124); pom.material = guardMat; pom.parent = root;
    this.setGroup(root);
    return { root, len: L };
  }

  muzzleNode() { const m = this.current; return m && m.gm && this.visible ? m.gm.muzzle || null : null; }
  ejectNode() { const m = this.current; return m && m.gm && this.visible ? m.gm.eject || null : null; }

  kick(e) {
    const st = e.gun, k = (st.recoil && st.recoil.kick) || 1, r = this.g.rng;
    const ads = e.ads || 0, heavy = clamp((st.weight || 3) / 4, 0.4, 1.6);
    const s = 1 - 0.45 * ads;
    this.pos.vz -= (0.55 + 0.25 * k) * s / Math.sqrt(heavy);
    this.pos.vy += 0.05 * k * s;
    this.pos.vx += (r() - 0.5) * 0.08 * s;
    this.rot.vx -= (1.8 + 1.1 * k) * s / Math.sqrt(heavy);
    this.rot.vy += (r() - 0.5) * 0.6 * k * s;
    this.rot.vz += (r() - 0.5) * 1.2 * k * s;
    this.shotT = 0; this.slideT = 0;
  }

  frame(dt) {
    dt = this.hold ? 0 : Math.min(dt, 0.1);     // hold = freeze the pose (screenshots)
    const g = this.g, p = g.local, rig = this.rig;
    const w = p && p.alive ? currentWeapon(p) : null;
    const scoped = w && scopedView(p);
    const show = !!w && !scoped && !g.ended && (g.spectate == null || p.alive);
    if (!show) {
      if (this.current) { this.setEnabled(this.current, false); }
      this.visible = false;
      return;
    }
    const m = this.modelFor(w);
    if (!m) return;
    if (this.current !== m) { if (this.current) this.setEnabled(this.current, false); this.current = m; this.setEnabled(m, true); this.pos.reset(); this.rot.reset(); }
    else if (!this.visible) this.setEnabled(m, true);
    this.visible = true;
    const ws = p.ws, st = statsOf(w), cat = w.melee ? 'melee' : (st && st.cat) || 'rifle';
    const hip = HIP[cat] || HIP.rifle;
    this.shotT += dt; this.slideT += dt; this.modeT += dt;
    this.pos.step(dt); this.rot.step(dt);
    // look sway: the gun lags behind the turn (weight) and swings back
    const view = g.view;
    if (this.lastYaw == null) { this.lastYaw = view.yaw; this.lastPitch = view.pitch; }
    const dyw = clamp(view.yaw - this.lastYaw, -0.25, 0.25), dpt = clamp(view.pitch - this.lastPitch, -0.25, 0.25);
    this.lastYaw = view.yaw; this.lastPitch = view.pitch;
    const ads = ws.ads, adsE = ease(ads);
    const wt = st ? clamp((st.weight || 3) / 4, 0.35, 1.8) : 0.5;
    const swayK = (1 - 0.75 * adsE) * (0.65 + 0.35 * wt);
    this.swayX = damp(this.swayX - dyw * 0.55 * swayK, 0, 10, dt);
    this.swayY = damp(this.swayY - dpt * 0.55 * swayK, 0, 10, dt);
    // bob (figure eight from the rig's step phase), idle breathing
    const bob = rig.bob, ph = bob.phase, A = bob.amp * (1 - 0.85 * adsE);
    const bx = Math.sin(ph) * 0.0085 * A, by = -Math.abs(Math.cos(ph)) * 0.0075 * A + 0.004 * A;
    const t = rig.t, idle = (1 - 0.8 * adsE);
    const brX = Math.sin(t * 0.9) * 0.0012 * idle, brY = Math.sin(t * 1.35) * 0.0016 * idle;
    const spd = Math.hypot(p.vel.x, p.vel.z), run = p.onGround ? smoothstep(3.2, 5.2, spd) * (1 - adsE) : 0;
    // ---- base pose: hip -> ADS
    let px = hip[0], py = hip[1], pz = hip[2], ryw = hip[3], rpt = hip[4], rrl = hip[5];
    let adsX = 0, adsY = 0, adsZ = 0;
    if (m.gm) { const e = m.gm.sight.eye; adsX = -e.x; adsY = -e.y; adsZ = -e.z; }
    px += (adsX - px) * adsE; py += (adsY - py) * adsE; pz += (adsZ - pz) * adsE;
    ryw *= 1 - adsE; rpt *= 1 - adsE; rrl *= 1 - adsE;
    // crouch, running dip, lean
    const cr = p.crouch || 0;
    py += 0.008 * cr * (1 - adsE); rrl += 0.05 * cr * (1 - adsE);
    py -= 0.018 * run; px += 0.01 * run; rrl += 0.12 * run; rpt += 0.08 * run; ryw -= 0.05 * run;
    rrl += -(p.lean || 0) * 0.08 * (1 - adsE);
    // ---- state motions
    let ox = 0, oy = 0, oz = 0, orx = 0, ory = 0, orz = 0;
    if (ws.state === 'draw') {
      const u = clamp(ws.t / Math.max(0.05, ws.dur), 0, 1), e = 1 - ease(u);
      oy -= 0.2 * e; oz -= 0.06 * e; orx += 0.85 * e; orz += 0.35 * e;
    }
    if (m.gm) this.gunMotions(m, ws, st, w, dt, (a, b, c, d, e2, f) => { ox += a; oy += b; oz += c; orx += d; ory += e2; orz += f; });
    else this.knifeMotions(m, ws, (a, b, c, d, e2, f) => { ox += a; oy += b; oz += c; orx += d; ory += e2; orz += f; });
    if (this.modeT < 0.35) { const u = this.modeT / 0.35; orz += bump(u, 0, 1) * 0.12; oy -= bump(u, 0, 1) * 0.008; }
    // ---- compose
    const H = this.holder;
    H.position.set(px + ox + bx + brX + this.swayX * 0.06 + this.pos.x, py + oy + by + brY + this.swayY * 0.05 + this.pos.y, pz + oz + this.pos.z);
    H.rotation.set(rpt + orx + this.swayY * 0.9 + this.rot.x * 0.06, ryw + ory + this.swayX * 0.9 + this.rot.y * 0.06, rrl + orz + this.swayX * 0.6 + this.rot.z * 0.06);
    // ADS exactness: with a rotated holder the eye point moves; re-solve the translation so R * eye + T = 0 when fully aimed
    if (m.gm && adsE > 0.001) {
      const e = m.gm.sight.eye;
      BABYLON.Quaternion.RotationYawPitchRollToRef(H.rotation.y, H.rotation.x, H.rotation.z, this.tmpQ);
      BABYLON.Matrix.FromQuaternionToRef(this.tmpQ, this.tmpM);
      BABYLON.Vector3.TransformCoordinatesFromFloatsToRef(e.x, e.y, e.z, this.tmpM, this.tmpV);
      const k = adsE * adsE;                       // T = -R * eye  =>  add (eye - R * eye)
      H.position.x += (e.x - this.tmpV.x) * k; H.position.y += (e.y - this.tmpV.y) * k; H.position.z += (e.z - this.tmpV.z) * k;
    }
  }

  gunMotions(m, ws, st, w, dt, add) {
    const gm = m.gm, B = m.base;
    // reset parts
    for (const k in B) { const n = gm.parts[k]; if (n) { n.position.copyFrom(B[k].p); n.rotation.copyFrom(B[k].r); } }
    // slide / bolt cycle after a shot
    if (m.cyc) {
      const key = m.cycKey;
      const u = this.slideT / 0.07;
      const back = u < 1 ? Math.sin(Math.PI * Math.min(1, u)) : 0;
      const locked = w.mag === 0 && key === 'slide';
      m.cyc.position.z = B[key].p.z - (locked ? 0.022 : back * 0.024);
    }
    const rl = ws.rl;
    if (ws.state === 'reload' && rl) {
      const u = reloadProgress(this.g.local);
      if (rl.kind === 'shell') {
        const inP = ramp(rl.phase === 'start' ? rl.t / Math.max(0.01, rl.dur) : 1, 0, 1) * (rl.phase === 'end' ? 1 - ramp(rl.t / Math.max(0.01, rl.dur), 0, 1) : 1);
        add(-0.02 * inP, -0.035 * inP, -0.02 * inP, -0.2 * inP, 0.25 * inP, 0.45 * inP);
        if (rl.phase === 'load') { const b = bump(rl.t / Math.max(0.01, rl.dur), 0.35, 0.8); add(0, -0.006 * b, 0.008 * b, 0.03 * b, 0, 0); }
      } else {
        const T = ramp(u, 0, 0.14) * (1 - ramp(u, 0.82, 1));
        add(-0.015 * T, -0.045 * T, -0.02 * T, -0.12 * T, 0.18 * T, 0.5 * T);
        if (m.magP) {
          const out = ramp(u, 0.15, 0.33) * (1 - ramp(u, 0.45, rl.empty ? 0.6 : 0.68));
          m.magP.position.y = B.mag.p.y - 0.28 * out; m.magP.position.z = B.mag.p.z - 0.05 * out;
          m.magP.setEnabled(!(u > 0.32 && u < 0.46));
        }
        const seat = bump(u, rl.empty ? 0.58 : 0.66, rl.empty ? 0.68 : 0.76); add(0, 0.008 * seat, 0, -0.06 * seat, 0, 0);
        if (rl.empty) { const rack = bump(u, 0.8, 0.93); add(0, 0.004 * rack, -0.01 * rack, -0.08 * rack, 0, -0.1 * rack); if (m.cyc) m.cyc.position.z -= 0.024 * rack; }
      }
    } else if (m.magP) m.magP.setEnabled(true);
    if (ws.state === 'inspect') {
      const u = clamp(ws.t / Math.max(0.1, ws.dur), 0, 1);
      const a = ramp(u, 0, 0.18) * (1 - ramp(u, 0.45, 0.6)), b = ramp(u, 0.45, 0.62) * (1 - ramp(u, 0.82, 1));
      add(-0.05 * a - 0.03 * b, 0.02 * a + 0.01 * b, 0.02 * a, -0.2 * a + 0.15 * b, 0.6 * a - 0.35 * b, 0.55 * a - 0.9 * b);
    }
    if (st && st.cycle && ws.cyc > 0) {
      const iv = Math.max(0.1, 60 / (st.rpm || 60)), u = 1 - ws.cyc / (iv * 0.92);
      const c = bump(u, 0.15, 0.85);
      if (st.cycle === 'bolt') add(0.01 * c, -0.02 * c, -0.015 * c, 0.05 * c, 0.05 * c, 0.3 * c);
      else add(0, -0.01 * c, -0.025 * c, 0.03 * c, 0, 0.05 * c);
      if (gm.parts.pump) gm.parts.pump.position.z = B.pump.p.z - 0.07 * c;
      if (gm.parts.bolt && st.cycle === 'bolt') gm.parts.bolt.position.z = B.bolt.p.z - 0.08 * c;
    }
    if (ws.dry > 0) { const b = bump(1 - ws.dry / 0.25, 0, 1); add(0, 0, -0.004 * b, -0.02 * b, 0, 0); }
  }

  knifeMotions(m, ws, add) {
    const ml = ws.ml;
    if (ws.state === 'inspect') {
      const u = clamp(ws.t / Math.max(0.1, ws.dur), 0, 1), a = bump(u, 0, 1);
      add(-0.04 * a, 0.03 * a, 0.03 * a, 0.3 * a, 0.9 * a, -0.8 * a);
    }
    if (!ml) return;
    const u = clamp(ml.t / Math.max(0.05, ml.dur), 0, 1), h = clamp(ml.hitAt / Math.max(0.05, ml.dur), 0.05, 0.9);
    if (ml.kind === 'slash') {
      const s = ml.side ? 1 : -1;
      const wind = ramp(u, 0, h * 0.6) * (1 - ramp(u, h * 0.6, h * 1.6));
      const sweep = ramp(u, h * 0.4, h * 1.9), back = 1 - ramp(u, h * 1.9, 1);
      const k = sweep * back;
      add(s * (0.06 * wind - 0.2 * k), 0.03 * wind - 0.02 * k, 0.05 * k, -0.25 * wind + 0.2 * k, s * (0.55 * wind - 1.3 * k), s * (-0.3 * wind + 0.9 * k));
    } else {
      const pull = ramp(u, 0, h) * (1 - ramp(u, h, h + 0.08));
      const thrust = ramp(u, h * 0.95, h + 0.08) * (1 - ramp(u, h + 0.25, 1));
      add(-0.04 * thrust, 0.02 * thrust - 0.01 * pull, -0.08 * pull + 0.2 * thrust, 0.35 * pull - 0.25 * thrust, 0.25 * thrust, -0.5 * thrust);
    }
  }

  setEnabled(m, on) { const r = m.gm ? m.gm.root : m.knife.root; r.setEnabled(on); }
  dispose() {
    for (const f of this.offs) f(); this.offs.length = 0;
    for (const uid of [...this.models.keys()]) this.drop(uid);
    this.holder.dispose(false, false); this.root.dispose(false, false);
  }
}
