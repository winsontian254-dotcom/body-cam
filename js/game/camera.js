/* LIVE FIRE — first-person camera rig: the local eye interpolated between ticks, body-cam head motion (subtle bob, breathing,
   handheld drift, weapon-weight sway, landing dip, strafe tilt, lean roll), recoil view punch, aim punch when hit, FOV from
   settings with the ADS zoom, ADS sensitivity, death cam (the camera drops to the floor like a fallen body cam) and spectating.
   Exports:
     CameraRig    class (game system 'camera'): new CameraRig(scene, game)
       camera     BABYLON.UniversalCamera (inputs cleared; minZ .045, vertical-fixed FOV = vfov43(settings.fov))
       frame(dt, alpha)        positions the camera; also drives postfx ADS / scope / flash / damage and Input.setSensMul
       bob { phase, amp, x, y } the current head bob (the viewmodel reads it), sway { x, y } (look-lag, rad), adsK (eased ADS)
       punch(pitchDeg, yawDeg)  add a view punch impulse (recoil, explosions); shake(k) short camera shake
       baseFov, fov
   Rotation = view angles + RECOIL_VIEW x the weapon's aim offset (smoothed) + punch spring + breathing / handheld drift; roll =
   -lean * MOVE.leanRoll (+ bob / strafe tilt). Pitch POSITIVE = looking down, yaw = rotation.y. */
import { Settings } from '../core/settings.js';
import { Input } from '../core/input.js';
import { vfov43, clamp, damp, smoothstep } from '../core/util.js';
import { MOVE, eyeHeight, leanOffset } from '../phys/move.js';
import { RECOIL_VIEW, adsZoom, currentWeapon, statsOf, scopedView } from './weapon.js';

const DEG = Math.PI / 180;
const LO = { x: 0, y: 0, z: 0 }, LS = { lean: 0, yaw: 0 };
const SUB = 1 / 240;
/** Damped spring toward 0, sub-stepped (explicit Euler is unstable at these stiffnesses on slow frames). o = { x, v } */
export function springStep(o, k, d, dt) {
  let n = Math.ceil(dt / SUB); if (n > 64) n = 64; const h = dt / n;
  for (let i = 0; i < n; i++) { o.v += (-k * o.x - d * o.v) * h; o.x += o.v * h; }
  if (!Number.isFinite(o.x) || !Number.isFinite(o.v)) { o.x = 0; o.v = 0; }
}

export class CameraRig {
  constructor(scene, game) {
    this.name = 'camera'; this.g = game; this.scene = scene;
    const cam = this.camera = new BABYLON.UniversalCamera('lfCam', new BABYLON.Vector3(0, 2, 0), scene);
    cam.inputs.clear();
    cam.minZ = 0.045; cam.maxZ = 1200;
    cam.fovMode = BABYLON.Camera.FOVMODE_VERTICAL_FIXED;
    this.baseFov = vfov43(Settings.get('fov')); cam.fov = this.baseFov; this.fov = this.baseFov;
    cam.rotation.set(0, 0, 0);
    this.bob = { phase: 0, amp: 0, x: 0, y: 0, roll: 0 };
    this.sway = { x: 0, y: 0 };
    this.sp = { p: { x: 0, v: 0 }, y: { x: 0, v: 0 }, r: { x: 0, v: 0 } };   // punch springs (radians)
    this.land = { x: 0, v: 0 };
    this.shakeK = 0; this.t = 0; this.adsK = 0; this.ax = 0; this.ay = 0; this.lastYaw = null; this.lastPitch = 0; this.tilt = 0;
    this.dmgK = 0; this.dead = 0; this.deadFrom = null;
    this.offs = [
      Settings.onChange(({ key, value }) => { if (key === 'fov') this.baseFov = vfov43(value); }),
      game.bus.on('shot', e => {
        if (!e.p || !e.p.local) return;
        const k = e.kick || 1, r = game.rng;
        const adsF = 1 - 0.35 * (e.ads || 0);
        this.sp.p.v -= k * DEG * (13 + 6 * r()) * adsF;
        this.sp.y.v += k * DEG * (r() * 2 - 1) * 5 * adsF;
        this.sp.r.v += k * DEG * (r() * 2 - 1) * 3;
      }),
      game.bus.on('land', e => { if (e.p && e.p.local) { this.land.v -= Math.min(2.2, e.speed * 0.22); this.sp.p.v += Math.min(1.5, e.speed * 0.12) * DEG * 6; } }),
      game.bus.on('damage', e => {
        if (!e.victim || !e.victim.local) return;
        const k = Math.min(1, e.dmg / 35);
        this.sp.p.v -= (2.5 + 4 * game.rng()) * DEG * k * 8; this.sp.y.v += (game.rng() * 2 - 1) * DEG * k * 16; this.dmgK = Math.min(1, this.dmgK + 0.35 + k * 0.5);
      }),
      game.bus.on('spawn', e => { if (e.p && e.p.local) { this.dead = 0; this.deadFrom = null; for (const k in this.sp) { this.sp[k].x = 0; this.sp[k].v = 0; } } }),
    ];
  }
  punch(pd, yd) { this.sp.p.v -= pd * DEG * 14; this.sp.y.v += yd * DEG * 14; }
  shake(k) { this.shakeK = Math.max(this.shakeK, k); }

  frame(dt, alpha) {
    const g = this.g, cam = this.camera;
    dt = Math.min(dt, 0.1);
    this.t += dt;
    let p = g.local;
    if (!p) return;
    // spectating a teammate after death (rounds without respawn)
    if (!p.alive && p.deadT > 3 && !(g.mode && g.mode.respawn)) {
      const s = this.pickSpectate(); if (s) { this.follow(s, alpha); return; }
    }
    const ws = p.ws;
    const a = clamp(alpha, 0, 1), pv = p.prev;
    const x = pv.x + (p.pos.x - pv.x) * a, y = pv.y + (p.pos.y - pv.y) * a, z = pv.z + (p.pos.z - pv.z) * a;
    const eye = pv.eye + (eyeHeight(p) - pv.eye) * a, lean = pv.lean + (p.lean - pv.lean) * a;
    const view = g.view;
    // ---- springs: punch (recoil / hits), landing
    const S = this.sp, k = 240, d = 2 * Math.sqrt(k) * 0.82;
    springStep(S.p, k, d, dt); springStep(S.y, k, d, dt); springStep(S.r, k, d, dt);
    const Ld = this.land; springStep(Ld, 140, 2 * Math.sqrt(140) * 0.7, dt);
    // ---- ADS
    const w = currentWeapon(p), st = w && !w.melee ? statsOf(w) : null;
    const ads = p.alive ? ws.ads : 0;
    this.adsK = ads * ads * (3 - 2 * ads);
    const zoom = 1 + (adsZoom(p) - 1) * this.adsK;
    this.fov = 2 * Math.atan(Math.tan(this.baseFov / 2) / zoom);
    cam.fov = this.fov;
    const sensK = 1 + ((Settings.get('adsSens') || 1) * (Math.tan(this.fov / 2) / Math.tan(this.baseFov / 2)) - 1) * this.adsK;
    Input.setSensMul(sensK);
    // ---- head bob / body-cam motion
    const bobS = clamp(Settings.get('viewBob') ?? 1, 0, 1);
    const spd = Math.hypot(p.vel.x, p.vel.z);
    const onG = p.onGround && !p.mantle;
    const moveK = onG ? smoothstep(0.4, 4.6, spd) : 0;
    this.bob.phase += spd * dt * Math.PI / MOVE.stride;
    const ampT = moveK * (1 - 0.82 * this.adsK) * (1 - 0.45 * (p.crouch || 0));
    this.bob.amp = damp(this.bob.amp, ampT, 8, dt);
    const ph = this.bob.phase, A = this.bob.amp * bobS;
    this.bob.y = -Math.abs(Math.sin(ph)) * 0.024 * A + 0.012 * A;
    this.bob.x = Math.sin(ph) * 0.011 * A;
    this.bob.roll = Math.sin(ph) * 0.28 * DEG * A;
    // breathing + handheld drift (slow, two incommensurate sines), stronger after running, calmer in ADS
    const br = (0.35 + 0.65 * (1 - this.adsK)) * bobS;
    const breathP = Math.sin(this.t * 1.35) * 0.05 * DEG * br + Math.sin(this.t * 0.47 + 1.3) * 0.06 * DEG * br;
    const breathY = Math.sin(this.t * 0.61 + 0.4) * 0.07 * DEG * br + Math.sin(this.t * 1.13) * 0.03 * DEG * br;
    const breathH = Math.sin(this.t * 1.35) * 0.0025 * br;
    // weapon weight sway: the view lags a little when turning with a heavy gun
    const wt = st ? clamp((st.weight || 3) / 6, 0.15, 1.2) : 0.2;
    if (this.lastYaw == null) { this.lastYaw = view.yaw; this.lastPitch = view.pitch; }
    const dYaw = view.yaw - this.lastYaw, dPitch = view.pitch - this.lastPitch;
    this.lastYaw = view.yaw; this.lastPitch = view.pitch;
    this.sway.x = damp(this.sway.x + clamp(dYaw, -0.2, 0.2) * 0.12 * wt, 0, 9, dt);
    this.sway.y = damp(this.sway.y + clamp(dPitch, -0.2, 0.2) * 0.12 * wt, 0, 9, dt);
    // strafe tilt (body-cam on the chest rocks with the hips)
    const rx = Math.cos(view.yaw), rz = -Math.sin(view.yaw), side = (p.vel.x * rx + p.vel.z * rz) / 6;
    this.tilt = damp(this.tilt, onG ? clamp(side, -1, 1) * 0.6 * DEG * bobS * (1 - 0.6 * this.adsK) : 0, 6, dt);
    // recoil aim offset (smoothed tick values; bullets follow all of it, the view RECOIL_VIEW of it)
    this.ax = damp(this.ax, ws.ax, 35, dt); this.ay = damp(this.ay, ws.ay, 35, dt);
    // shake
    this.shakeK = Math.max(0, this.shakeK - dt * 2.5);
    const sh = this.shakeK * this.shakeK;
    const shP = sh ? (Math.sin(this.t * 61) + Math.sin(this.t * 37.3)) * 0.4 * DEG * sh : 0, shY = sh ? Math.sin(this.t * 53.1) * 0.5 * DEG * sh : 0;
    // ---- death cam
    let ey = eye + this.bob.y + breathH + Ld.x * 0.1, deadRoll = 0, deadPitch = 0, deadDrop = 0;
    if (!p.alive) {
      if (!this.deadFrom) this.deadFrom = { roll: (g.rng() < 0.5 ? -1 : 1) * (1.1 + g.rng() * 0.3), pitch: -0.25 - g.rng() * 0.25 };
      this.dead = Math.min(1, this.dead + dt / 0.75);
      const u = this.dead, e2 = u < 0.6 ? (u / 0.6) * (u / 0.6) : 1;    // falls, then rests
      deadDrop = (eye - 0.22) * e2; deadRoll = this.deadFrom.roll * smoothstep(0.1, 0.9, u); deadPitch = this.deadFrom.pitch * smoothstep(0.2, 1, u);
    }
    LS.lean = lean; LS.yaw = view.yaw;
    const lo = leanOffset(LS, LO);
    cam.position.set(x + lo.x + this.bob.x * rx, y + ey + lo.y - deadDrop, z + lo.z + this.bob.x * rz);
    cam.rotation.x = clamp(view.pitch - this.ay * DEG * RECOIL_VIEW + S.p.x + breathP + this.sway.y * 0.3 + shP + deadPitch, -1.56, 1.56);
    cam.rotation.y = view.yaw + this.ax * DEG * RECOIL_VIEW + S.y.x + breathY + shY;
    cam.rotation.z = -lean * MOVE.leanRoll + this.bob.roll + S.r.x - this.tilt + deadRoll;
    // ---- post fx
    const fx = g.fx;
    if (fx) {
      fx.setADS(this.adsK);
      const scoped = !!(p.alive && st && scopedView(p));     // the magnified scope overlay is up (hud / scope.js)
      if (scoped !== this.scoped) { this.scoped = scoped; fx.setScope(scoped); }
      fx.setFlash(p.flash > 0 ? Math.min(1.2, p.flash / 2) : 0);
      this.dmgK = Math.max(0, this.dmgK - dt * 1.3);
      fx.setDamage(Settings.get('showDamage') === false ? 0 : Math.max(this.dmgK, p.alive && p.hp < 30 ? 0.25 + 0.15 * Math.sin(this.t * 5) : 0));
    }
  }

  pickSpectate() {
    const g = this.g, me = g.local;
    let s = g.spectate ? g.players.get(g.spectate) : null;
    if (s && s.alive) return s;
    s = [...g.players.values()].find(q => q.alive && q !== me && (me.team === 0 || q.team === me.team)) || null;
    g.spectate = s ? s.id : null;
    return s;
  }
  follow(s, alpha) {
    const cam = this.camera, pv = s.prev, a = clamp(alpha, 0, 1);
    LS.lean = s.lean; LS.yaw = s.yaw;
    const lo = leanOffset(LS, LO);
    cam.position.set(pv.x + (s.pos.x - pv.x) * a + lo.x, pv.y + (s.pos.y - pv.y) * a + pv.eye + (eyeHeight(s) - pv.eye) * a + lo.y, pv.z + (s.pos.z - pv.z) * a + lo.z);
    const dy = s.yaw - pv.yaw, yaw = pv.yaw + Math.atan2(Math.sin(dy), Math.cos(dy)) * a;
    cam.rotation.set(pv.pitch + (s.pitch - pv.pitch) * a, yaw, -s.lean * MOVE.leanRoll);
    cam.fov = this.baseFov;
  }
  dispose() { for (const f of this.offs) f(); this.offs.length = 0; }
}
