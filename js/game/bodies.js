/* LIVE FIRE — third-person placeholder bodies + world weapon drops (the characters worker replaces the bodies with
   js/chars/human.js through game.js setBodyFactory; keep this API). What you see is exactly what you hit: every body part is
   drawn from the same capsules hitbox.js uses for hit detection (interpolated between ticks), in team uniforms with a plate
   carrier and a helmet, holding its current gun (models.js buildGun, LOD 2). A death leaves a corpse record (falls away from the
   killer) that stays after the player respawns, until the round resets (respawn modes: 20 s, max 12). All bodies share four
   thin-instanced meshes (one draw call each).
   Exports:
     Bodies   class (game system 'bodies'): new Bodies(scene, game)
       add(p), remove(p)                players (the local player is drawn only when game.thirdPerson is set)
       muzzleOf(p, out) -> out | null   world position of p's third-person muzzle (effects.js flashes and tracers)
       casters() -> meshes              for the sun shadow generator
       frame(dt, alpha), dispose() */
import { poseShapes, NSHAPE, STRIDE } from './hitbox.js';
import { buildGun } from '../weapons/models.js';
import { currentWeapon } from './weapon.js';
import { hash, clamp } from '../core/util.js';

const TEAM_LOOK = {
  0: { uni: [0.3, 0.29, 0.28], vest: [0.22, 0.2, 0.19], helm: [0.2, 0.2, 0.2] },
  1: { uni: [0.37, 0.35, 0.27], vest: [0.5, 0.42, 0.29], helm: [0.43, 0.37, 0.27] },
  2: { uni: [0.2, 0.235, 0.29], vest: [0.13, 0.17, 0.25], helm: [0.17, 0.2, 0.25] },
};
const DARK = [0.08, 0.08, 0.085], SKINS = [[0.72, 0.53, 0.42], [0.55, 0.38, 0.28], [0.36, 0.25, 0.18], [0.8, 0.62, 0.5], [0.62, 0.45, 0.33]];
const MAXP = 40, MAX_CORPSES = 12, CORPSE_LIFE = 20;

function unitCapsule(scene) {
  const m = BABYLON.MeshBuilder.CreateCapsule('bodyCap', { radius: 0.5, height: 2, tessellation: 10, subdivisions: 1, capSubdivisions: 4 }, scene);
  return m;
}
function bodyMat(scene, name, rough = 0.85) {
  const mt = new BABYLON.StandardMaterial(name, scene);
  mt.diffuseColor = new BABYLON.Color3(1, 1, 1); mt.specularColor = new BABYLON.Color3(0.06, 0.06, 0.06); mt.specularPower = 12 / rough; mt.maxSimultaneousLights = 6;
  return mt;
}

export class Bodies {
  constructor(scene, game) {
    this.name = 'bodies'; this.scene = scene; this.g = game;
    this.list = new Map();       // id -> { p, gm (third-person gun), gunKey, skin }
    this.S = new Float32Array(NSHAPE * STRIDE);
    this.st = { pos: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0, crouch: 0, lean: 0, gait: 0, gaitK: 0 };
    const mk = (name, mesh, cap) => {
      mesh.material = bodyMat(scene, name + 'M'); mesh.isPickable = false; mesh.alwaysSelectAsActiveMesh = true; mesh.receiveShadows = true;
      const r = { mesh, cap, n: 0, mat4: new Float32Array(cap * 16), col: new Float32Array(cap * 4) };
      mesh.thinInstanceSetBuffer('matrix', r.mat4, 16, false); mesh.thinInstanceSetBuffer('color', r.col, 4, false);
      mesh.thinInstanceCount = 0; mesh.isVisible = false;
      return r;
    };
    const N = MAXP + MAX_CORPSES;
    this.caps = mk('bodyCaps', unitCapsule(scene), N * 16);
    this.heads = mk('bodyHeads', BABYLON.MeshBuilder.CreateSphere('bodyHead', { diameter: 1, segments: 10 }, scene), N);
    this.helms = mk('bodyHelms', BABYLON.MeshBuilder.CreateSphere('bodyHelm', { diameter: 1, segments: 10, slice: 0.55 }, scene), N);
    this.vests = mk('bodyVests', BABYLON.MeshBuilder.CreateBox('bodyVest', { size: 1 }, scene), N * 2);
    this.drops = new Map();
    this.corpses = [];            // { pose, fall, t, look, skin } — stay where the player died, even after they respawn
    this.offs = [
      game.bus.on('kill', e => { const b = this.list.get(e.victim.id); if (b && (!e.victim.local || game.thirdPerson)) this.die(b, e); }),
      game.bus.on('round:reset', () => { this.corpses.length = 0; }),
    ];
    for (const p of game.players.values()) this.add(p);
  }
  add(p) { if (!this.list.has(p.id)) this.list.set(p.id, { p, gm: null, gunKey: '', skin: SKINS[hash(p.name + p.id) % SKINS.length] }); }
  remove(p) { const b = this.list.get(p.id); if (!b) return; if (b.gm) b.gm.dispose(); this.list.delete(p.id); }
  casters() { return [this.caps.mesh, this.heads.mesh, this.helms.mesh, this.vests.mesh]; }

  die(b, e) {
    const p = b.p;
    // fall away from the shot (or backwards)
    let fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
    if (e && e.killer && e.killer !== p) { const dx = p.pos.x - e.killer.pos.x, dz = p.pos.z - e.killer.pos.z, l = Math.hypot(dx, dz) || 1; fx = dx / l; fz = dz / l; }
    let c = this.corpses.length >= MAX_CORPSES ? this.corpses.shift() : null;
    if (!c) c = { pose: new Float32Array(NSHAPE * STRIDE), fall: {} };
    const P = c.pose; P.set(this.poseOf(p, 1)); c.t = 0; c.look = TEAM_LOOK[p.team] || TEAM_LOOK[0]; c.skin = b.skin;
    // the arms let go of the gun and hang along the body before the fall
    const ch = 2 * STRIDE; let rx = P[ch + 3] - P[ch], rz = P[ch + 5] - P[ch + 2]; const rl = Math.hypot(rx, rz) || 1; rx /= rl; rz /= rl;
    for (const [up, fo, side] of [[5, 6, 1], [7, 8, -1]]) {
      const u = up * STRIDE, f2 = fo * STRIDE;
      const sx = P[u], sy = P[u + 1], sz = P[u + 2];
      const ex = sx + rx * side * 0.035, ey = sy - 0.29, ez = sz + rz * side * 0.035;
      P[u + 3] = ex; P[u + 4] = ey; P[u + 5] = ez;
      P[f2] = ex; P[f2 + 1] = ey; P[f2 + 2] = ez; P[f2 + 3] = ex + rx * side * 0.02; P[f2 + 4] = ey - 0.26; P[f2 + 5] = ez + rz * side * 0.02;
    }
    Object.assign(c.fall, { x: p.pos.x, y: p.pos.y, z: p.pos.z, fx, fz });
    this.corpses.push(c);
  }
  poseOf(p, alpha) {
    const st = this.st, pv = p.prev, a = clamp(alpha, 0, 1);
    st.pos.x = pv.x + (p.pos.x - pv.x) * a; st.pos.y = pv.y + (p.pos.y - pv.y) * a; st.pos.z = pv.z + (p.pos.z - pv.z) * a;
    const dy = p.yaw - pv.yaw; st.yaw = pv.yaw + Math.atan2(Math.sin(dy), Math.cos(dy)) * a;
    st.pitch = pv.pitch + (p.pitch - pv.pitch) * a; st.crouch = pv.crouch + (p.crouch - pv.crouch) * a; st.lean = pv.lean + (p.lean - pv.lean) * a;
    st.gait = p.gait || 0; st.gaitK = p.gaitK || 0;
    return poseShapes(st, this.S);
  }
  muzzleOf(p, out) {
    const b = this.list.get(p.id); if (!b || !b.gm || !b.gm.muzzle || !b.gm.root.isEnabled()) return null;
    const v = b.gm.muzzle.getAbsolutePosition(); out.x = v.x; out.y = v.y; out.z = v.z; return out;
  }

  // write one capsule instance (shape segment a-b radius r, colour)
  cap(R, ax, ay, az, bx, by, bz, r, c, sr = 1) {
    if (R.n >= R.cap) return;
    let dx = bx - ax, dy = by - ay, dz = bz - az; const L = Math.hypot(dx, dy, dz);
    if (L > 1e-5) { dx /= L; dy /= L; dz /= L; } else { dx = 0; dy = 1; dz = 0; }
    // e1 perpendicular to the axis
    let ex = dy * 0 - dz * 1, ey = dz * 0 - dx * 0, ez = dx * 1 - dy * 0;
    let el = Math.hypot(ex, ey, ez); if (el < 1e-4) { ex = 1; ey = 0; ez = 0; el = 1; } ex /= el; ey /= el; ez /= el;
    const fx = ey * dz - ez * dy, fy = ez * dx - ex * dz, fz = ex * dy - ey * dx;   // f = e x d: a right-handed basis (det +1, no mirroring)
    const s = 2 * r * sr, hs = (L + 2 * r) / 2;
    const M = R.mat4, m = R.n * 16;
    M[m] = ex * s; M[m + 1] = ey * s; M[m + 2] = ez * s; M[m + 3] = 0;
    M[m + 4] = dx * hs; M[m + 5] = dy * hs; M[m + 6] = dz * hs; M[m + 7] = 0;
    M[m + 8] = fx * s; M[m + 9] = fy * s; M[m + 10] = fz * s; M[m + 11] = 0;
    M[m + 12] = (ax + bx) / 2; M[m + 13] = (ay + by) / 2; M[m + 14] = (az + bz) / 2; M[m + 15] = 1;
    const C = R.col, q = R.n * 4; C[q] = c[0]; C[q + 1] = c[1]; C[q + 2] = c[2]; C[q + 3] = 1;
    R.n++;
  }
  // oriented box / sphere instance: centre, axes (unit) and sizes
  box(R, cx, cy, cz, ux, uy, uz, vx, vy, vz, sx, sy, sz, c) {
    if (R.n >= R.cap) return;
    const wx = uy * vz - uz * vy, wy = uz * vx - ux * vz, wz = ux * vy - uy * vx;
    const M = R.mat4, m = R.n * 16;
    M[m] = ux * sx; M[m + 1] = uy * sx; M[m + 2] = uz * sx; M[m + 3] = 0;
    M[m + 4] = vx * sy; M[m + 5] = vy * sy; M[m + 6] = vz * sy; M[m + 7] = 0;
    M[m + 8] = wx * sz; M[m + 9] = wy * sz; M[m + 10] = wz * sz; M[m + 11] = 0;
    M[m + 12] = cx; M[m + 13] = cy; M[m + 14] = cz; M[m + 15] = 1;
    const C = R.col, q = R.n * 4; C[q] = c[0]; C[q + 1] = c[1]; C[q + 2] = c[2]; C[q + 3] = 1;
    R.n++;
  }

  frame(dt, alpha) {
    dt = Math.min(dt, 0.1);
    const g = this.g;
    this.caps.n = this.heads.n = this.helms.n = this.vests.n = 0;
    for (const b of this.list.values()) {
      const p = b.p;
      if (!p.alive || (p.local && !g.thirdPerson)) { if (b.gm) b.gm.root.setEnabled(false); continue; }
      const S = this.poseOf(p, alpha);
      this.drawBody(S, TEAM_LOOK[p.team] || TEAM_LOOK[0], b.skin, p);
      this.gunOf(b, S, p);
    }
    const life = g.mode && g.mode.respawn ? CORPSE_LIFE : 1e9;
    for (let i = this.corpses.length - 1; i >= 0; i--) {
      const c = this.corpses[i]; c.t += dt;
      if (c.t > life) { this.corpses.splice(i, 1); continue; }
      this.drawBody(this.deadPose(c), c.look, c.skin, null);
    }
    for (const R of [this.caps, this.heads, this.helms, this.vests]) {
      R.mesh.thinInstanceCount = R.n; R.mesh.isVisible = R.n > 0;
      if (R.n) { R.mesh.thinInstanceBufferUpdated('matrix'); R.mesh.thinInstanceBufferUpdated('color'); }
    }
    this.updateDrops();
  }

  deadPose(corpse) {
    const S = this.S, src = corpse.pose, f = corpse.fall;
    S.set(src);
    const u = clamp(corpse.t / 0.55, 0, 1), e = u * u, ang = e * 1.45;
    // sink into the ground over the last seconds of a corpse's life
    const fade = Math.max(0, corpse.t - (CORPSE_LIFE - 2)) * 0.25;
    // rotate every point about the horizontal axis through the feet, perpendicular to the fall direction
    const ax = f.fz, az = -f.fx, c = Math.cos(ang), s = Math.sin(ang);    // axis = up x fall: the top goes towards +fall
    const sink = e * 0.06;
    for (let k = 0; k < NSHAPE; k++) {
      const o = k * STRIDE;
      for (const j of [0, 3]) {
        const x = S[o + j] - f.x, y = S[o + j + 1] - f.y, z = S[o + j + 2] - f.z;
        // Rodrigues about (ax, 0, az)
        const dot = x * ax + z * az;
        const cx = -az * y, cy = az * x - ax * z, cz = ax * y;   // axis x v
        S[o + j] = f.x + x * c + cx * s + ax * dot * (1 - c);
        S[o + j + 1] = f.y + y * c + cy * s - sink + 0.12 * e - fade;
        S[o + j + 2] = f.z + z * c + cz * s + az * dot * (1 - c);
      }
    }
    return S;
  }

  drawBody(S, look, skin, p) {
    const C = this.caps;
    // torso / limbs (skip the head sphere: index 0)
    for (let k = 1; k < NSHAPE; k++) {
      const o = k * STRIDE;
      const col = k >= 13 ? DARK : (k === 6 || k === 8) ? look.uni : look.uni;
      this.cap(C, S[o], S[o + 1], S[o + 2], S[o + 3], S[o + 4], S[o + 5], S[o + 6] * (k === 1 ? 0.9 : 1), col, k <= 4 ? 0.98 : 1);
    }
    // gloves (small spheres at the hands) and boots
    const hR = 6 * STRIDE + 3, hL = 8 * STRIDE + 3;
    this.cap(C, S[hR], S[hR + 1], S[hR + 2], S[hR], S[hR + 1], S[hR + 2], 0.05, DARK);
    this.cap(C, S[hL], S[hL + 1], S[hL + 2], S[hL], S[hL + 1], S[hL + 2], 0.05, DARK);
    // head + helmet
    const h = 0, hx = S[h], hy = S[h + 1], hz = S[h + 2], hr = S[h + 6];
    // the body frame: chest capsule axis = right, neck -> chest = up
    const c = 2 * STRIDE, rxv = S[c + 3] - S[c], ryv = S[c + 4] - S[c + 1], rzv = S[c + 5] - S[c + 2];
    const rl = Math.hypot(rxv, ryv, rzv) || 1, ux0 = rxv / rl, uy0 = ryv / rl, uz0 = rzv / rl;
    const n1 = 1 * STRIDE, cxm = (S[c] + S[c + 3]) / 2, cym = (S[c + 1] + S[c + 4]) / 2, czm = (S[c + 2] + S[c + 5]) / 2;
    let vx = S[n1] - cxm, vy = S[n1 + 1] - cym, vz = S[n1 + 2] - czm; const vl = Math.hypot(vx, vy, vz) || 1; vx /= vl; vy /= vl; vz /= vl;
    const H = this.heads;
    this.box(H, hx, hy, hz, ux0, uy0, uz0, vx, vy, vz, hr * 2, hr * 2.15, hr * 2.05, skin);
    this.box(this.helms, hx, hy + hr * 0.12 * vy, hz, ux0, uy0, uz0, vx, vy, vz, hr * 2.35, hr * 2.25, hr * 2.4, look.helm);
    // plate carrier front + back: forward = right x up
    const wx = uy0 * vz - uz0 * vy, wy = uz0 * vx - ux0 * vz, wz = ux0 * vy - uy0 * vx;
    const st = 3 * STRIDE, sxm = (S[st] + S[st + 3]) / 2, sym = (S[st + 1] + S[st + 4]) / 2, szm = (S[st + 2] + S[st + 5]) / 2;
    const mx = (cxm * 0.62 + sxm * 0.38), my = (cym * 0.62 + sym * 0.38), mz = (czm * 0.62 + szm * 0.38);
    this.box(this.vests, mx + wx * 0.075, my + wy * 0.075, mz + wz * 0.075, ux0, uy0, uz0, vx, vy, vz, 0.36, 0.42, 0.12, look.vest);
    this.box(this.vests, mx - wx * 0.07, my - wy * 0.07, mz - wz * 0.07, ux0, uy0, uz0, vx, vy, vz, 0.35, 0.4, 0.1, look.vest);
  }

  gunOf(b, S, p) {
    const w = p.alive ? currentWeapon(p) : null;
    const key = w && !w.melee ? w.uid : '';          // a weapon instance keeps its mods for life: no per-frame key building
    if (key !== b.gunKey) {
      if (b.gm) { b.gm.dispose(); b.gm = null; }
      b.gunKey = key;
      // hardware instances of the per-scene template: every bot carrying the same gun shares its draw calls
      if (key) { try { b.gm = buildGun(this.scene, w.gunId, { lod: 2, skin: w.skin, mods: w.mods, instance: true }); for (const m of b.gm.root.getChildMeshes(false)) { m.isPickable = false; } } catch (e) { b.gm = null; } }
    }
    if (!b.gm) return;
    const gm = b.gm, R = gm.root;
    R.setEnabled(true);
    // trigger at the right hand, muzzle along the aim
    const hR = 6 * STRIDE + 3;
    R.position.set(S[hR], S[hR + 1], S[hR + 2]);
    const st = this.st;    // interpolated state of this player (poseOf ran just before)
    R.rotation.set(st.pitch, st.yaw, -(st.lean || 0) * 0.35);
  }

  updateDrops() {
    const g = this.g, seen = new Set();
    for (const d of g.drops) {
      seen.add(d.id);
      let gm = this.drops.get(d.id);
      if (!gm) { try { gm = buildGun(this.scene, d.w.gunId, { lod: 2, skin: d.w.skin, mods: d.w.mods, instance: true }); for (const m of gm.root.getChildMeshes(false)) m.isPickable = false; } catch (e) { gm = null; } this.drops.set(d.id, gm); }
      if (!gm) continue;
      gm.root.position.set(d.x, d.y + 0.03, d.z);
      gm.root.rotation.set(0, d.yaw, d.rest ? Math.PI / 2 : d.t * 6);
    }
    for (const [id, gm] of this.drops) if (!seen.has(id)) { if (gm) gm.dispose(); this.drops.delete(id); }
  }

  dispose() {
    for (const f of this.offs) f(); this.offs.length = 0;
    for (const b of this.list.values()) if (b.gm) b.gm.dispose();
    for (const gm of this.drops.values()) if (gm) gm.dispose();
    this.list.clear(); this.drops.clear();
    for (const R of [this.caps, this.heads, this.helms, this.vests]) { R.mesh.material.dispose(); R.mesh.dispose(); }
  }
}
