/* LIVE FIRE — procedural character animation. PURE JS (no BABYLON): the pose of one character from its (interpolated)
   PlayerState plus a little per-character memory (gait phase, leg yaw, springs).
   The upper body is taken from js/game/hitbox.js poseShapes() (head, neck, chest, stomach, pelvis, shoulders, the rifle-carry
   hand points; crouch, lean and pitch included), so the visual body sits on the capsules that bullets hit. On top of it:
     legs      analytic gait: the stride length follows the speed and the stance foot moves backwards exactly as fast as the body
               moves forwards (no foot sliding at a steady speed); direction aware (strafe = hips turn toward the motion plus side
               steps, backpedal = reversed cycle), crouch-walk, turning in place (the legs lag the view and step round), airborne
               tuck, landing compression; two-bone IK to feet planted on the world floor (ground(x, z, yFrom) callback)
     arms      two-bone IK to the weapon's hand nodes (models.js hands.right / hands.left), elbows toward the hitbox elbows
     weapon    the gun is carried with its grip on the hitbox hand point and its bore along the aim (yaw, pitch), canted when
               leaning; ADS raises it; recoil spring (kick back + muzzle rise); draw, inspect, reload (magazine out with the
               support hand, to the pouch, back in, bolt / slide when empty), shell-by-shell loading, knife slash / stab,
               grenade cook + throw (over- and underhand), plant / defuse (kneel, hands to the floor)
     body      idle breathing, run lean, head pitch shared between neck and chest, hit flinch (spring), landing dip
   Exports:
     newFrame() -> { o, x, y, z, len }      a bone frame: origin + unit axes (x right, y up the limb / up, z forward)
     newAnim(seed) -> A                      per-character memory
     animate(A, I, dt, O) -> O               I = input (see below), O = newPose()
     newPose() -> O                          { bones: { pelvis chest neck head uarmR farmR handR uarmL farmL handL thighR shinR footR
                                               thighL shinL footL }, gun (frame of the gun root), item (frame of a knife / grenade in the
                                               right hand), gunOn, itemOn, mag { mode: 'in'|'hand'|'off', frame }, slung (the primary
                                               hangs on the sling during actions), eye [x, y, z] }
     kick(A, k), flinch(A, dx, dz, k, head), land(A, speed), jumped(A)     event impulses (game.bus events)
     RIG                                      skeleton constants (limb lengths, glove offsets)
     frameMul(out, F, x, y, z), frameDir(out, F, x, y, z)    local -> world helpers
   Input I (all world space, metres / radians): { pos, vel, yaw, pitch, crouch, lean, onGround, mantle, alive,
     hold: 'rifle'|'pistol'|'knife'|'nade'|'none', grip: { r: frame, l: frame, lk } (gun-local hand node frames of the weapon),
     ads 0..1, wstate ('idle'|'draw'|'reload'|'inspect'|'melee'), wu (0..1 progress of draw / inspect), reload: { u 0..1, kind
     'mag'|'shell', empty, n (shells loaded), per (s), t } | null, melee: { kind 'slash'|'stab', u 0..1, side } | null,
     nade: { cook >= 0 while the pin is pulled, under } | null, thrown (s since the last throw), action: 'plant'|'defuse'|null,
     ground(x, z, yFrom) -> y | null, t (time, s) } */
import { poseShapes, NSHAPE, STRIDE } from '../game/hitbox.js';

const TAU = Math.PI * 2;
export const RIG = {
  thigh: 0.405, shin: 0.40, ankle: 0.088,            // hip -> knee -> ankle, ankle height above the sole
  uarm: 0.29, farm: 0.268,                            // shoulder -> elbow -> wrist
  footSpread: 0.105,                                  // half the stance width at the ankles
  // glove frames relative to the weapon hand node: the glove mesh origin sits on the node; the wrist (forearm end) offset
  gripWrist: [0.057, -0.004, -0.132], holdWrist: [0.0585, 0.1105, -0.004], holdRoll: 1.1,   // glove-local wrist (cuff) points

};

// ------------------------------------------------------------------------------------------------ small vector helpers
const V = () => [0, 0, 0];
const set3 = (a, x, y, z) => { a[0] = x; a[1] = y; a[2] = z; return a; };
const cpy = (a, b) => { a[0] = b[0]; a[1] = b[1]; a[2] = b[2]; return a; };
const len3 = a => Math.hypot(a[0], a[1], a[2]);
const nrm = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; a[0] /= l; a[1] /= l; a[2] /= l; return a; };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (o, a, b) => { const x = a[1] * b[2] - a[2] * b[1], y = a[2] * b[0] - a[0] * b[2], z = a[0] * b[1] - a[1] * b[0]; o[0] = x; o[1] = y; o[2] = z; return o; };
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
const bump = (u, a, b, c, d) => smooth(a, b, u) * (1 - smooth(c, d, u));   // 0 -> 1 (a..b) -> 0 (c..d)

export function newFrame() { return { o: V(), x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1], len: 0 }; }
/** frame with y along `y` (unit), z as close as possible to the hint */
function frameY(F, o, y, zh) {
  cpy(F.o, o); cpy(F.y, y);
  cross(F.x, F.y, zh); let l = len3(F.x);
  if (l < 1e-4) { cross(F.x, F.y, [0, 0, 1]); l = len3(F.x); if (l < 1e-4) { cross(F.x, F.y, [1, 0, 0]); l = len3(F.x); } }
  F.x[0] /= l; F.x[1] /= l; F.x[2] /= l;
  cross(F.z, F.x, F.y);
  return F;
}
/** frame with z along `z` (unit), y as close as possible to the hint */
function frameZ(F, o, z, yh) {
  cpy(F.o, o); cpy(F.z, z);
  cross(F.x, yh, F.z); let l = len3(F.x);
  if (l < 1e-4) { cross(F.x, [0, 0, 1], F.z); l = len3(F.x) || 1; }
  F.x[0] /= l; F.x[1] /= l; F.x[2] /= l;
  cross(F.y, F.z, F.x);
  return F;
}
/** world point of the local point (x, y, z) in frame F */
export function frameMul(out, F, x, y, z) {
  out[0] = F.o[0] + F.x[0] * x + F.y[0] * y + F.z[0] * z;
  out[1] = F.o[1] + F.x[1] * x + F.y[1] * y + F.z[1] * z;
  out[2] = F.o[2] + F.x[2] * x + F.y[2] * y + F.z[2] * z;
  return out;
}
export function frameDir(out, F, x, y, z) {
  out[0] = F.x[0] * x + F.y[0] * y + F.z[0] * z; out[1] = F.x[1] * x + F.y[1] * y + F.z[1] * z; out[2] = F.x[2] * x + F.y[2] * y + F.z[2] * z;
  return out;
}
/** rotate the axes of F about its own local axis (0 x, 1 y, 2 z) by angle a */
function rotLocal(F, axis, a) {
  if (!a) return F;
  const c = Math.cos(a), s = Math.sin(a);
  const A = axis === 0 ? F.y : axis === 1 ? F.z : F.x, Bv = axis === 0 ? F.z : axis === 1 ? F.x : F.y;
  // rotating about x: y -> y c + z s, z -> -y s + z c (and cyclic)
  for (let k = 0; k < 3; k++) { const a0 = A[k], b0 = Bv[k]; A[k] = a0 * c + b0 * s; Bv[k] = -a0 * s + b0 * c; }
  return F;
}
/** compose: out = P * L where L is given in P's local coordinates (o, x, y, z as local vectors) */
export function frameCompose(out, P, L) {
  const o = [0, 0, 0], x = [0, 0, 0], y = [0, 0, 0], z = [0, 0, 0];
  frameMul(o, P, L.o[0], L.o[1], L.o[2]); frameDir(x, P, L.x[0], L.x[1], L.x[2]); frameDir(y, P, L.y[0], L.y[1], L.y[2]); frameDir(z, P, L.z[0], L.z[1], L.z[2]);
  cpy(out.o, o); cpy(out.x, x); cpy(out.y, y); cpy(out.z, z);
  return out;
}
function copyFrame(d, s) { cpy(d.o, s.o); cpy(d.x, s.x); cpy(d.y, s.y); cpy(d.z, s.z); d.len = s.len; return d; }

/** two-bone IK: root a, target t, lengths l1 l2, pole direction (any vector; the bend goes toward it). Writes the middle joint to m and
    the (possibly pulled-in) end to e. */
function ik2(m, e, a, t, l1, l2, pole) {
  let dx = t[0] - a[0], dy = t[1] - a[1], dz = t[2] - a[2];
  let d = Math.hypot(dx, dy, dz);
  const dmax = (l1 + l2) * 0.9995, dmin = Math.abs(l1 - l2) + 0.02;
  if (d < 1e-5) { dx = 0; dy = -1; dz = 0; d = 1e-5; }
  const ux = dx / d, uy = dy / d, uz = dz / d;
  const dc = clamp(d, dmin, dmax);
  e[0] = a[0] + ux * dc; e[1] = a[1] + uy * dc; e[2] = a[2] + uz * dc;
  const ca = (l1 * l1 - l2 * l2 + dc * dc) / (2 * dc), h = Math.sqrt(Math.max(0, l1 * l1 - ca * ca));
  // pole perpendicular to the a->e line
  const pd = pole[0] * ux + pole[1] * uy + pole[2] * uz;
  let px = pole[0] - ux * pd, py = pole[1] - uy * pd, pz = pole[2] - uz * pd;
  let pl = Math.hypot(px, py, pz);
  if (pl < 1e-5) { px = -uz; py = 0; pz = ux; pl = Math.hypot(px, py, pz) || 1; }
  px /= pl; py /= pl; pz /= pl;
  m[0] = a[0] + ux * ca + px * h; m[1] = a[1] + uy * ca + py * h; m[2] = a[2] + uz * ca + pz * h;
}

// ------------------------------------------------------------------------------------------------ state
export function newAnim(seed = 1) {
  const r = ((seed * 2654435761) >>> 0) / 4294967296;
  return {
    init: false, legYaw: 0, phase: r * TAU, amp: 0, runK: 0, speed: 0, twist: 0, dirA: 0, turn: 0, turnAmp: 0,
    air: 0, vy: 0, landX: 0, landV: 0, kickX: 0, kickV: 0, kickR: 0, kickRV: 0, side: (r - 0.5) * 2,
    flP: 0, flPV: 0, flR: 0, flRV: 0, flH: 0, flHV: 0, breath: r * 10, t: 0, idle: r * 7, lastX: 0, lastZ: 0,
    S: new Float32Array(NSHAPE * STRIDE), lean: 0, crouchS: 0, adsS: 0, act: 0,
  };
}
export function newPose() {
  const b = {};
  for (const k of ['pelvis', 'chest', 'neck', 'head', 'uarmR', 'farmR', 'handR', 'uarmL', 'farmL', 'handL', 'thighR', 'shinR', 'footR', 'thighL', 'shinL', 'footL']) b[k] = newFrame();
  return { bones: b, gun: newFrame(), item: newFrame(), gunOn: false, itemOn: false, mag: { mode: 'in', frame: newFrame() }, slung: false,
    eye: V(), handGrip: 'grip', handHold: 'hold', joints: { shR: V(), shL: V(), elR: V(), elL: V(), wrR: V(), wrL: V(), hipR: V(), hipL: V(), knR: V(), knL: V(), anR: V(), anL: V() } };
}

// event impulses
export function kick(A, k = 1) { A.kickV -= 0.9 * k; A.kickRV += 9 * k; }
export function flinch(A, dx, dz, k = 1, head = false) {
  // dx, dz: bullet direction in the character's local frame (x right, z forward); the body turns away from the impact
  A.flPV += clamp(dz, -1, 1) * 7 * k; A.flRV += clamp(-dx, -1, 1) * 6 * k;
  if (head) A.flHV += 14 * k;
}
export function land(A, speed) { A.landV -= clamp(speed * 0.09, 0.1, 0.9); }
export function jumped(A) { A.landV += 0.25; }

function spring(A, x, v, k, d, dt) {
  // critically-ish damped spring toward 0 (substepped for stability)
  let n = Math.ceil(dt / 0.008); if (n > 20) n = 20; const h = dt / n;
  let X = A[x], Vv = A[v];
  for (let i = 0; i < n; i++) { Vv += (-k * X - d * Vv) * h; X += Vv * h; }
  if (!Number.isFinite(X) || !Number.isFinite(Vv)) { X = 0; Vv = 0; }
  A[x] = X; A[v] = Vv;
}

// scratch
const T = { a: V(), b: V(), c: V(), d: V(), e: V(), f: V(), g: V(), h: V(), p: V(), q: V(), r: V(), s: V(), u: V(), w: V(), up: [0, 1, 0] };
const F1 = newFrame(), F2 = newFrame(), GL = newFrame();
const HS = { pos: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0, crouch: 0, lean: 0, gait: 0, gaitK: 0 };
const sh = (S, k, end, out) => { const o = k * STRIDE + (end ? 3 : 0); out[0] = S[o]; out[1] = S[o + 1]; out[2] = S[o + 2]; return out; };
const mid = (S, k, out) => { const o = k * STRIDE; out[0] = (S[o] + S[o + 3]) / 2; out[1] = (S[o + 1] + S[o + 4]) / 2; out[2] = (S[o + 2] + S[o + 5]) / 2; return out; };

/** The whole pose for this frame. */
export function animate(A, I, dt, O) {
  dt = clamp(dt || 0, 0, 0.1);
  A.t += dt;
  const B = O.bones, J = O.joints;
  const yaw = I.yaw || 0, pitch = clamp(I.pitch || 0, -1.4, 1.4);
  const sy = Math.sin(yaw), cy = Math.cos(yaw);
  const px = I.pos.x, py = I.pos.y, pz = I.pos.z;
  const vx = I.vel ? I.vel.x : 0, vz = I.vel ? I.vel.z : 0;
  const onG = I.onGround !== false && !I.mantle;
  const act = I.action === 'plant' || I.action === 'defuse';
  A.act = damp(A.act, act ? 1 : 0, 6, dt);
  if (!A.init) { A.init = true; A.legYaw = yaw; A.lastX = px; A.lastZ = pz; A.crouchS = I.crouch || 0; }
  // ---------------------------------------------------------------- springs
  spring(A, 'landX', 'landV', 140, 15, dt);
  spring(A, 'kickX', 'kickV', 260, 24, dt); spring(A, 'kickR', 'kickRV', 220, 22, dt);
  spring(A, 'flP', 'flPV', 120, 13, dt); spring(A, 'flR', 'flRV', 120, 13, dt); spring(A, 'flH', 'flHV', 160, 15, dt);
  A.adsS = damp(A.adsS, I.ads || 0, 14, dt);
  const crouch = clamp(I.crouch || 0, 0, 1);
  // ---------------------------------------------------------------- locomotion state
  const spd = onG ? Math.hypot(vx, vz) : 0;
  A.speed = damp(A.speed, spd, 10, dt);
  const moving = A.speed > 0.3;
  const lx = vx * cy - vz * sy, lz = vx * sy + vz * cy;          // velocity in the view frame (x right, z forward)
  const alpha = Math.atan2(lx, lz);
  if (spd > 0.2) A.dirA = A.dirA + wrap(alpha - A.dirA) * (1 - Math.exp(-12 * dt));
  A.runK = damp(A.runK, smooth(2.6, 4.8, spd) * (1 - crouch), 6, dt);
  A.amp = damp(A.amp, moving ? clamp(A.speed / 1.1, 0, 1) : 0, moving ? 9 : 6, dt);
  // hips turn toward the motion when strafing (forward-diagonal) or away from it (backward-diagonal)
  const twistT = moving && !act ? 0.42 * Math.sin(2 * A.dirA) * (1 - 0.4 * crouch) : 0;
  A.twist = damp(A.twist, twistT, 8, dt);
  // legs lag the view when standing; step round once the twist passes ~32 degrees
  let legT = yaw + A.twist;
  if (!moving) {
    const d = wrap(yaw - A.legYaw);
    if (A.turn > 0 || Math.abs(d) > 0.56) { A.turn = 1; legT = yaw; if (Math.abs(d) < 0.06) A.turn = 0; }
    else legT = A.legYaw;
  } else A.turn = 0;
  const prevLeg = A.legYaw;
  A.legYaw = A.legYaw + wrap(legT - A.legYaw) * (1 - Math.exp(-(moving ? 10 : A.turn ? 7 : 0) * dt));
  const dLeg = Math.abs(wrap(A.legYaw - prevLeg));
  A.turnAmp = damp(A.turnAmp, A.turn ? 1 : 0, 10, dt);
  // gait phase: a half cycle per step; distance-driven so the planted foot keeps its place
  const stepLen = crouch > 0.5 ? clamp(0.32 + 0.16 * A.speed, 0.36, 0.7) : clamp(0.42 + 0.19 * A.speed, 0.5, 1.45);
  A.phase = (A.phase + Math.PI * spd * dt / stepLen + dLeg * 2.2) % TAU;
  // airborne / landing
  if (!onG) A.air += dt; else A.air = 0;
  A.vy = I.vel ? I.vel.y || 0 : 0;
  const airK = smooth(0.04, 0.2, A.air);
  // ---------------------------------------------------------------- the hitbox upper body
  HS.pos.x = px; HS.pos.y = py; HS.pos.z = pz; HS.yaw = yaw; HS.pitch = pitch; HS.crouch = crouch; HS.lean = I.lean || 0;
  const S = poseShapes(HS, A.S);
  const headC = sh(S, 0, 0, T.a), neck0 = sh(S, 1, 0, T.b), chA = sh(S, 2, 0, T.c), chB = sh(S, 2, 1, T.d), pelC = mid(S, 4, T.e);
  sh(S, 5, 0, J.shR); sh(S, 7, 0, J.shL); sh(S, 5, 1, J.elR); sh(S, 7, 1, J.elL);
  const haR = sh(S, 6, 1, T.f), haL = sh(S, 8, 1, T.g);
  sh(S, 9, 0, J.hipR); sh(S, 11, 0, J.hipL);
  // body offsets: run bob, landing dip, kneel
  const bob = onG ? -Math.abs(Math.cos(A.phase)) * (0.012 + 0.03 * A.runK) * A.amp + 0.012 * A.amp : 0;
  const breathe = Math.sin(A.t * 1.7 + A.breath) * (0.004 + 0.006 * (1 - A.amp));
  const dropY = bob + A.landX * 0.22 - A.act * 0.12 * (1 - crouch);
  // ---------------------------------------------------------------- pelvis
  const legYaw = A.legYaw, ly = Math.sin(legYaw), lc = Math.cos(legYaw);
  const pyaw = yaw + wrap(legYaw - yaw) * 0.7;
  const pel = B.pelvis;
  set3(T.h, Math.cos(pyaw), 0, -Math.sin(pyaw));              // pelvis right
  set3(T.p, 0, 1, 0);
  // hip roll with the gait, forward tilt when running / crouching
  frameY(pel, set3(T.q, pelC[0], pelC[1] + dropY, pelC[2]), T.p, set3(T.r, Math.sin(pyaw), 0, Math.cos(pyaw)));
  rotLocal(pel, 0, 0.1 * A.runK + 0.18 * crouch + 0.12 * A.act);
  rotLocal(pel, 2, Math.sin(A.phase) * 0.05 * A.amp);
  // hips follow the pelvis frame (hitbox hip spacing .10)
  frameMul(J.hipR, pel, 0.1, -0.015, 0); frameMul(J.hipL, pel, -0.1, -0.015, 0);
  // ---------------------------------------------------------------- legs
  const runK = A.runK;
  const st = crouch > 0.5 ? 0.64 : lerp(0.6, 0.36, runK);
  const sweepMax = crouch > 0.5 ? 0.62 : lerp(0.88, 1.12, runK);
  const sweep = Math.min(sweepMax, stepLen * 2 * st) * A.amp;
  const beta = A.dirA - A.twist;                                 // motion direction relative to the legs
  const mdx = Math.sin(beta), mdz = Math.cos(beta);
  const liftH = (crouch > 0.5 ? 0.06 : lerp(0.075, 0.2, runK)) * A.amp + 0.05 * A.turnAmp;
  const groundY = (x, z) => { const g = I.ground ? I.ground(x, z, py + 0.7) : null; return g == null || !Number.isFinite(g) || g < py - 0.6 ? py : g; };
  for (let k = 0; k < 2; k++) {
    const R = k === 0, side = R ? 1 : -1;
    const hip = R ? J.hipR : J.hipL, knee = R ? J.knR : J.knL, ank = R ? J.anR : J.anL;
    const u = ((A.phase / TAU) + (R ? 0 : 0.5)) % 1;
    let along, lift = 0, heel = 0;
    if (u < st) { const s = u / st; along = sweep * (0.45 - s); heel = smooth(0.7, 1, s) * 0.45 * A.amp; }
    else { const s = (u - st) / (1 - st), e = s * s * (3 - 2 * s); along = sweep * (-0.55 + e); lift = liftH * Math.pow(Math.sin(Math.PI * s), 0.85); heel = (1 - smooth(0, 0.35, s)) * 0.45 * A.amp - smooth(0.7, 1, s) * 0.2 * A.amp; }
    // foot in the leg frame (x right, z forward), spread when stepping sideways so the feet do not cross
    const spread = RIG.footSpread + 0.05 * Math.abs(mdx) * A.amp + 0.04 * crouch + 0.04 * A.act;
    let fx = side * spread + mdx * along, fz = mdz * along + 0.02 + (A.act ? (R ? -0.32 : 0.12) * A.act : 0);
    if (crouch > 0.5 && !moving) fz += R ? -0.06 : 0.04;      // a staggered crouch stance
    // world (legs frame: yaw = legYaw)
    let wx = px + fx * lc + fz * ly, wz = pz - fx * ly + fz * lc;
    let wy = groundY(wx, wz) + RIG.ankle + lift;
    if (!onG) {
      // airborne: tuck under the hips, then reach down for the landing
      const tuck = A.vy > 0 ? 0.32 : lerp(0.32, 0.12, smooth(-1, -5, A.vy));
      const hx = hip[0], hz = hip[2];
      const fx2 = hx + (Math.sin(legYaw) * 0.08 * (R ? 1 : -0.6)), fz2 = hz + (Math.cos(legYaw) * 0.08 * (R ? 1 : -0.6));
      const ay = hip[1] - (RIG.thigh + RIG.shin) + tuck * (R ? 1 : 0.8);
      wx = lerp(wx, fx2, airK); wz = lerp(wz, fz2, airK); wy = lerp(wy, ay, airK);
    }
    set3(ank, wx, wy, wz);
    // pole: knees over the toes (leg forward), slightly out
    const pfx = side * 0.12 * (1 + crouch), pfz = 1;
    set3(T.u, pfx * lc + pfz * ly, 0.0, -pfx * ly + pfz * lc);
    if (A.act && R) { T.u[1] = -0.6; }
    ik2(knee, ank, hip, ank, RIG.thigh, RIG.shin, T.u);
    // kneeling: the right knee goes to the floor
    // frames
    const th = R ? B.thighR : B.thighL, sn = R ? B.shinR : B.shinL, ft = R ? B.footR : B.footL;
    set3(T.w, hip[0] - knee[0], hip[1] - knee[1], hip[2] - knee[2]); th.len = len3(T.w); nrm(T.w);
    frameY(th, hip, T.w, T.u);
    set3(T.w, knee[0] - ank[0], knee[1] - ank[1], knee[2] - ank[2]); sn.len = len3(T.w); nrm(T.w);
    frameY(sn, knee, T.w, T.u);
    // foot: forward along the legs (toe out a little), pitched by the heel lift
    const toe = side * 0.1;
    set3(T.s, Math.sin(legYaw + toe), 0, Math.cos(legYaw + toe));
    frameZ(ft, ank, T.s, T.up);
    rotLocal(ft, 0, heel * (onG ? 1 : 0.4) + (!onG ? 0.35 * airK : 0));
    ft.len = 0.2;
  }
  // ---------------------------------------------------------------- torso
  const ch = B.chest;
  set3(T.h, chB[0] - chA[0], chB[1] - chA[1], chB[2] - chA[2]); nrm(T.h);                    // right
  set3(T.p, neck0[0] - pelC[0], neck0[1] - pelC[1], neck0[2] - pelC[2]); nrm(T.p);           // up
  cross(T.q, T.h, T.p); nrm(T.q);                                                             // forward = right x up
  const shM = set3(T.r, (J.shR[0] + J.shL[0]) / 2, (J.shR[1] + J.shL[1]) / 2 + dropY, (J.shR[2] + J.shL[2]) / 2);
  frameZ(ch, shM, T.q, T.p);
  // lean forward when running, flinch, breathing, kneel
  rotLocal(ch, 0, 0.1 * A.runK + 0.06 * A.amp * (1 - A.runK) + A.flP * 0.25 + 0.22 * A.act + clamp(pitch, 0, 1.2) * 0.12 - clamp(-pitch, 0, 1.2) * 0.08);
  rotLocal(ch, 2, A.flR * 0.2 + Math.sin(A.phase) * 0.03 * A.amp);
  ch.len = breathe;            // the renderer scales the chest by (1 + len)
  // shoulders move with the torso frame (rest positions relative to it from the hitbox)
  set3(J.shR, ch.o[0], ch.o[1], ch.o[2]); frameMul(J.shR, ch, 0.195, 0.01 + breathe * 0.8, 0);
  frameMul(J.shL, ch, -0.195, 0.01 + breathe * 0.8, 0);
  // neck + head
  const nk = B.neck;
  frameMul(T.s, ch, 0, 0.06, -0.005);
  frameY(nk, T.s, ch.y, ch.z);
  const hd = B.head;
  frameMul(T.w, ch, 0, 0, 0);
  // head centre: the hitbox head moved with the chest offsets
  set3(T.w, headC[0] + (ch.o[0] - shM[0]), headC[1] + dropY, headC[2] + (ch.o[2] - shM[2]));
  copyFrame(hd, ch); cpy(hd.o, T.w);
  const hp = pitch * 0.62 - (0.06 * A.runK) + A.adsS * 0.1 + A.flH * 0.3 + A.flP * 0.15 - 0.22 * A.act * 0;
  rotLocal(hd, 0, hp - (0.1 * A.runK + 0.22 * A.act + clamp(pitch, 0, 1.2) * 0.12 - clamp(-pitch, 0, 1.2) * 0.08));
  rotLocal(hd, 2, -A.flR * 0.15 + (I.lean || 0) * 0.12);
  frameMul(O.eye, hd, 0, -0.025, 0.08);
  // ---------------------------------------------------------------- weapon + arms
  const hold = act ? 'none' : (I.hold || 'none');
  O.slung = act;
  const ads = A.adsS;
  // aim frame: forward along (yaw, pitch), rolled with the lean
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  set3(T.s, sy * cp, -sp, cy * cp);
  set3(T.u, -Math.sin(I.lean || 0) * 0.3 * cy, 1, Math.sin(I.lean || 0) * 0.3 * sy);
  const aim = F1; frameZ(aim, [0, 0, 0], T.s, T.u);
  const gun = O.gun; O.gunOn = false; O.itemOn = false; O.mag.mode = 'in';
  let lhTarget = null;                                       // support hand world target (when it leaves the gun)
  let rhFree = null;                                         // right hand world target when not on a gun
  const wst = I.wstate || 'idle', wu = clamp(I.wu || 0, 0, 1);
  if (hold === 'rifle' || hold === 'pistol') {
    O.gunOn = true;
    const pist = hold === 'pistol';
    // grip position: the hitbox hand point (low ready) raised toward the eye line when aiming
    set3(T.p, haR[0], haR[1] + dropY, haR[2]);
    const raise = pist ? 0.05 + 0.1 * ads : 0.03 + 0.11 * ads, fwd = pist ? 0.02 + 0.09 * ads : 0.0;
    T.p[0] = haR[0] + T.s[0] * fwd; T.p[1] = haR[1] + dropY + raise + T.s[1] * fwd; T.p[2] = haR[2] + T.s[2] * fwd;
    if (pist) { T.p[0] += aim.x[0] * -0.05 * (0.4 + ads); T.p[2] += aim.x[2] * -0.05 * (0.4 + ads); }
    // gun frame
    copyFrame(gun, aim);
    // recoil: muzzle rise + push back; run sway; flinch
    rotLocal(gun, 0, -A.kickR * 0.05 + Math.sin(A.phase * 2) * 0.02 * A.amp * (1 - ads) + A.flP * 0.2);
    rotLocal(gun, 1, Math.sin(A.phase) * 0.03 * A.amp * (1 - ads) + Math.sin(A.t * 0.9 + A.breath) * 0.008);
    // draw: the muzzle comes up from low; inspect: turned to look at it
    if (wst === 'draw') { const k = 1 - smooth(0, 1, wu); rotLocal(gun, 0, 0.95 * k); T.p[1] -= 0.12 * k; }
    if (wst === 'inspect') { const k = bump(wu, 0, 0.15, 0.82, 1); rotLocal(gun, 2, -0.9 * k); rotLocal(gun, 1, -0.5 * k); rotLocal(gun, 0, -0.25 * k); }
    // reload: tilt the gun (magazine toward the support hand)
    const rl = I.reload;
    if (rl && rl.kind !== 'shell') { const k = bump(rl.u, 0, 0.12, 0.84, 1); rotLocal(gun, 2, -0.55 * k); rotLocal(gun, 0, -0.22 * k); rotLocal(gun, 1, 0.15 * k); T.p[1] += 0.03 * k; }
    if (rl && rl.kind === 'shell') { const k = bump(rl.u, 0, 0.1, 0.9, 1); rotLocal(gun, 2, 0.6 * k); rotLocal(gun, 0, -0.18 * k); }
    // the grip node (gun-local) must land on T.p:  root = T.p - R * grip.o
    const gr = I.grip && I.grip.r;
    const go = gr ? gr.o : [0, -0.04, -0.06];
    gun.o[0] = 0; gun.o[1] = 0; gun.o[2] = 0;
    frameDir(T.q, gun, go[0], go[1], go[2]);
    gun.o[0] = T.p[0] - T.q[0] - gun.z[0] * A.kickX * 0.05; gun.o[1] = T.p[1] - T.q[1] - gun.z[1] * A.kickX * 0.05; gun.o[2] = T.p[2] - T.q[2] - gun.z[2] * A.kickX * 0.05;
    // support hand during reloads
    if (rl && rl.kind !== 'shell') {
      const u = rl.u;
      // magazine well (gun-local): just ahead of the grip, below the receiver
      const wellL = I.grip && I.grip.mag ? I.grip.mag : [0, -0.06, pist ? -0.04 : 0.06];
      frameMul(T.r, gun, wellL[0], wellL[1] - 0.04, wellL[2]);
      frameMul(T.w, ch, -0.1, -0.2, 0.2);                   // the magazine pouch on the vest (left front)
      if (pist) frameMul(T.w, pel, -0.16, 0.06, 0.07);      // pistol magazine on the belt
      if (u < 0.14) { const k = smooth(0, 0.14, u); lhTarget = lerpV(T.h, null, T.r, k); O.mag.mode = 'in'; }
      else if (u < 0.3) { const k = smooth(0.14, 0.3, u); lhTarget = set3(T.h, T.r[0], T.r[1] - 0.12 * k, T.r[2]); O.mag.mode = k < 0.5 ? 'hand' : 'off'; }
      else if (u < 0.48) { const k = smooth(0.3, 0.48, u); lhTarget = mixV(T.h, set3(T.d, T.r[0], T.r[1] - 0.12, T.r[2]), T.w, k); O.mag.mode = 'off'; }
      else if (u < 0.66) { const k = smooth(0.48, 0.66, u); lhTarget = mixV(T.h, T.w, set3(T.d, T.r[0], T.r[1] - 0.06, T.r[2]), k); O.mag.mode = 'hand'; }
      else if (u < 0.72) { const k = smooth(0.66, 0.72, u); lhTarget = set3(T.h, T.r[0], T.r[1] - 0.06 + 0.06 * k, T.r[2]); O.mag.mode = 'hand'; }
      else if (rl.empty && u < 0.86) { const k = bump(u, 0.72, 0.77, 0.81, 0.86); frameMul(T.d, gun, -0.035, 0.03, pist ? 0.0 : -0.02); lhTarget = mixV(T.h, T.r, T.d, Math.min(1, k * 1.3)); O.mag.mode = 'in'; }
      else { lhTarget = null; O.mag.mode = 'in'; }
      if (lhTarget && u >= 0.84) lhTarget = null;
    } else if (rl && rl.kind === 'shell') {
      // shell by shell: from the belt / side saddle to the loading port under the receiver
      const per = Math.max(0.2, rl.per || 0.5), cyc = ((rl.t || 0) % per) / per;
      frameMul(T.r, gun, 0, -0.05, 0.02); frameMul(T.w, pel, -0.17, 0.05, 0.03);
      if (rl.u > 0.06 && rl.u < 0.94) { const k = cyc < 0.45 ? smooth(0, 0.45, cyc) : 1 - smooth(0.55, 1, cyc); lhTarget = mixV(T.h, T.r, T.w, k); }
    }
  } else if (hold === 'knife' || hold === 'nade') {
    O.itemOn = true;
    // right hand: knife at the ready / grenade at the chest; left hand guard
    frameMul(T.p, ch, 0.13, -0.18, 0.3);
    const ml = I.melee;
    if (hold === 'knife' && ml) {
      const u = clamp(ml.u, 0, 1), sd = ml.side ? 1 : -1;
      if (ml.kind === 'stab') { const back = bump(u, 0, 0.18, 0.2, 0.35), thr = bump(u, 0.22, 0.38, 0.55, 0.9); frameMul(T.p, ch, 0.12, -0.12 + 0.05 * thr, 0.28 - 0.14 * back + 0.32 * thr); }
      else { const s = smooth(0.05, 0.42, u), r = 1 - smooth(0.5, 1, u); frameMul(T.p, ch, (0.32 * (1 - s) - 0.22 * s) * (sd > 0 ? 1 : -0.6) * r + 0.12 * (1 - r), (0.05 - 0.2 * s) * r - 0.18 * (1 - r), 0.22 + 0.2 * Math.sin(Math.PI * s) * r + 0.08 * (1 - r)); }
    }
    const nd = I.nade;
    if (hold === 'nade') {
      if (nd && nd.cook >= 0) { const k = smooth(0, 0.25, nd.cook); frameMul(T.d, ch, nd.under ? 0.18 : 0.16, nd.under ? -0.42 : 0.2, nd.under ? -0.12 : -0.18); mixV(T.p, T.p, T.d, k); }
      const th = I.thrown != null ? I.thrown : 99;
      if (th < 0.45) { const k = 1 - smooth(0.05, 0.45, th), s = smooth(0, 0.12, th); frameMul(T.d, ch, 0.08, nd && nd.under ? -0.1 : 0.25, 0.5); mixV(T.p, T.p, T.d, s * k + (1 - k) * 0); }
    }
    if (wst === 'draw') { T.p[1] -= 0.15 * (1 - smooth(0, 1, wu)); }
    rhFree = T.p;
    // item frame: in the fist, blade / grenade forward-up
    copyFrame(O.item, aim); rotLocal(O.item, 0, hold === 'knife' ? -0.35 : 0);
    if (hold === 'knife' && I.melee) rotLocal(O.item, 1, (I.melee.side ? -0.6 : 0.6) * bump(I.melee.u, 0.05, 0.25, 0.6, 1));
    cpy(O.item.o, T.p);
    frameMul(T.h, ch, -0.16, -0.2, 0.3);                     // guard hand
    lhTarget = T.h;
  }
  // ---------------------------------------------------------------- arms (IK to the hand frames)
  const grip = I.grip;
  // right hand frame
  const hR = B.handR, hL = B.handL;
  if (O.gunOn) {
    frameCompose(hR, gun, grip && grip.r ? grip.r : DEF_R);
    O.handGrip = 'grip';
  } else if (rhFree) {
    copyFrame(hR, O.item); cpy(hR.o, rhFree);
    if (hold === 'knife') { rotLocal(hR, 0, -1.2); }
    O.handGrip = 'grip';
  } else {
    // relaxed: hands hang at the sides, swing with the gait
    const sw = Math.sin(A.phase) * 0.35 * A.amp;
    frameMul(T.p, ch, 0.24, -0.62 + (act ? 0.0 : 0), 0.04 + sw * 0.4);
    if (act) frameMul(T.p, pel, 0.12, -0.5, 0.45);
    frameZ(hR, T.p, ch.z, ch.y); rotLocal(hR, 0, act ? 0.9 : 0.15);
    O.handGrip = 'hang';
  }
  if (O.gunOn && !lhTarget) {
    frameCompose(hL, gun, grip && grip.l ? grip.l : DEF_L);
    if (!grip || grip.lk !== 'support') { rotLocal(hL, 2, RIG.holdRoll); }
    O.handHold = grip && grip.lk === 'support' ? 'support' : 'hold';
  } else if (lhTarget) {
    // free support hand: palm toward the target, fingers forward
    frameZ(hL, lhTarget, O.gunOn ? gun.z : ch.z, ch.y); rotLocal(hL, 2, 1.2);
    O.handHold = 'hold';
  } else {
    const sw = -Math.sin(A.phase) * 0.35 * A.amp;
    frameMul(T.p, ch, -0.24, -0.62, 0.04 + sw * 0.4);
    if (act) frameMul(T.p, pel, -0.12, -0.5, 0.5);
    frameZ(hL, T.p, ch.z, ch.y); rotLocal(hL, 0, act ? 0.9 : 0.15);
    O.handHold = 'hang';
  }
  // wrists from the glove frames, then IK from the shoulders
  wristOf(J.wrR, hR, O.handGrip, false);
  wristOf(J.wrL, hL, O.handHold, true);
  for (let k = 0; k < 2; k++) {
    const R = k === 0, s = R ? J.shR : J.shL, w = R ? J.wrR : J.wrL, e = R ? J.elR : J.elL;
    // pole: down and out (and a little back); with a gun, toward the hitbox elbow
    frameDir(T.u, ch, R ? 0.7 : -0.7, -1, -0.25);
    if (O.gunOn) { const he = R ? sh(S, 5, 1, T.d) : sh(S, 7, 1, T.d); set3(T.u, he[0] - (s[0] + w[0]) / 2, he[1] - (s[1] + w[1]) / 2 - 0.05, he[2] - (s[2] + w[2]) / 2); }
    ik2(e, T.q, s, w, RIG.uarm, RIG.farm, T.u);
    cpy(w, T.q);
    const ua = R ? B.uarmR : B.uarmL, fa = R ? B.farmR : B.farmL, hd2 = R ? hR : hL;
    set3(T.w, s[0] - e[0], s[1] - e[1], s[2] - e[2]); ua.len = len3(T.w); nrm(T.w);
    set3(T.h, w[0] - e[0], w[1] - e[1], w[2] - e[2]); nrm(T.h);       // forearm direction: the elbow opens toward it
    frameY(ua, s, T.w, T.h);
    set3(T.w, e[0] - w[0], e[1] - w[1], e[2] - w[2]); fa.len = len3(T.w); nrm(T.w);
    // forearm twist follows the hand
    set3(T.s, hd2.z[0] + hd2.y[0] * 0.3, hd2.z[1] + hd2.y[1] * 0.3, hd2.z[2] + hd2.y[2] * 0.3);
    frameY(fa, e, T.w, T.s);
    // a relaxed hand continues the forearm (the kit hand's origin is at the wrist)
    if ((R ? O.handGrip : O.handHold) === 'hang') { copyFrame(hd2, fa); cpy(hd2.o, w); }
  }
  return O;
}
const DEF_R = { o: [0, -0.04, -0.065], x: [1, 0, 0], y: [0, 0.91, 0.41], z: [0, -0.41, 0.91] };
const DEF_L = { o: [0, 0.015, 0.22], x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };
function wristOf(out, H, kind, left) {
  if (kind === 'grip' || kind === 'support') { const w = RIG.gripWrist; frameMul(out, H, left ? -w[0] : w[0], w[1], w[2]); return out; }
  if (kind === 'hold') { const w = RIG.holdWrist; frameMul(out, H, left ? -w[0] : w[0], w[1], w[2]); return out; }
  // hanging hand: the frame origin is the wrist
  frameMul(out, H, 0, 0, 0); return out;
}
function lerpV(out, a, b, k) { if (!a) { cpy(out, b); return out; } out[0] = a[0] + (b[0] - a[0]) * k; out[1] = a[1] + (b[1] - a[1]) * k; out[2] = a[2] + (b[2] - a[2]) * k; return out; }
function mixV(out, a, b, k) { const x = a[0] + (b[0] - a[0]) * k, y = a[1] + (b[1] - a[1]) * k, z = a[2] + (b[2] - a[2]) * k; out[0] = x; out[1] = y; out[2] = z; return out; }
