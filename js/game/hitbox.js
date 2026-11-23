/* LIVE FIRE — hitboxes: capsules / spheres from a PlayerState (deterministic, no meshes). PURE JS.
   Exports:
     SHAPES            [{ name, group }] the 15 shapes in order (head, neck, chest, stomach, pelvis, arms x4, thighs, shins, feet)
     GROUP_MULT        { head 4, neck 2, chest 1, stomach 1.25, arm 1, leg .75 } (docs §4)
     NSHAPE, STRIDE    shape count and floats per shape in the pose array (ax ay az bx by bz r)
     poseShapes(s, out?, grip?) -> Float32Array   shapes for a state-like object { pos, yaw, pitch, crouch, lean, gait?, gaitK?,
                         ads? (else s.ws.ads), pistol? (else from s.inv[s.cur]) } (world space; a sphere is a capsule with a === b);
                         grip ([x, y, z], optional) receives the right-hand grip anchor (js/chars/anim.js holds the gun there).
                         The arms follow the drawn soldier: rifle or pistol hold, hip or aiming down the sights (ARMP).
     hitboxesOf(p, stamp) -> Float32Array   cached per player while `stamp` (the game tick) is unchanged
     raycastPlayer(p, ox, oy, oz, dx, dy, dz, maxDist, stamp, out?) -> out { t, shape, group, x, y, z } | null
                         nearest shape the ray enters within maxDist (dir normalised); broad phase first
     rayCapsule(ox, oy, oz, dx, dy, dz, ax, ay, az, bx, by, bz, r) -> t | -1
     gaitParams(speed, crouch, out?, side?) -> { step, st, sweep, lift }  (side = |sin| of the motion direction off the facing)   step geometry shared with player.js updateGait and chars/anim.js
     aimPoint(p, part, out)    world point of 'head' | 'chest' | 'stomach' | 'pelvis' (bots, LOS checks)
   Pose model (feet at pos, facing +Z at yaw 0, x = right): a rifle-carry pose; pitch turns the arms about the shoulder line and
   nods the head; crouch lowers the upper body .52 m (eye 1.64 -> 1.12, like phys/move.js), folds the thighs forward and keeps the
   feet; lean rolls everything above the pelvis about the pelvis so the eye lands on phys/move.js leanOffset (.36 m sideways);
   gait (phase, stride, direction: player.js updateGait from the horizontal speed) moves the ankles along the same stance / swing
   curve as the drawn legs (gaitParams), so legs are hit where they are drawn. */
import { getGun } from '../weapons/data.js';

export const SHAPES = [
  { name: 'head', group: 'head' }, { name: 'neck', group: 'neck' }, { name: 'chest', group: 'chest' }, { name: 'stomach', group: 'stomach' },
  { name: 'pelvis', group: 'stomach' },
  { name: 'uarmR', group: 'arm' }, { name: 'farmR', group: 'arm' }, { name: 'uarmL', group: 'arm' }, { name: 'farmL', group: 'arm' },
  { name: 'thighR', group: 'leg' }, { name: 'shinR', group: 'leg' }, { name: 'thighL', group: 'leg' }, { name: 'shinL', group: 'leg' },
  { name: 'footR', group: 'leg' }, { name: 'footL', group: 'leg' },
];
export const GROUP_MULT = { head: 4.0, neck: 2.0, chest: 1.0, stomach: 1.25, arm: 1.0, leg: 0.75 };
export const NSHAPE = SHAPES.length, STRIDE = 7;

// joints (standing, local): index -> [x, y, z]
const J = {
  head: [0, 1.665, 0.035], neck0: [0, 1.46, 0.0], neck1: [0, 1.56, 0.02], chest: [0, 1.30, 0.01], stom: [0, 1.06, 0.01], pelv: [0, 0.885, 0],
  shR: [0.195, 1.425, 0], shL: [-0.195, 1.425, 0], elR: [0.245, 1.185, 0.10], elL: [-0.205, 1.215, 0.21],
  haR: [0.11, 1.385, 0.13], haL: [0.006, 1.36, 0.56], grR: [0.10, 1.30, 0.22],
  hipR: [0.10, 0.90, 0], hipL: [-0.10, 0.90, 0], knR: [0.11, 0.50, 0.03], knL: [-0.11, 0.50, 0.03],
  anR: [0.11, 0.10, -0.01], anL: [-0.11, 0.10, -0.01], toR: [0.115, 0.05, 0.13], toL: [-0.115, 0.05, 0.13],
};
// shape definitions: [jointA, dxA, jointB, dxB, r] (dx = sideways offset along local x for the torso capsules)
const DEF = [
  ['head', 0, 'head', 0, 0.112], ['neck0', 0, 'neck1', 0, 0.062], ['chest', -0.1, 'chest', 0.1, 0.155], ['stom', -0.08, 'stom', 0.08, 0.135],
  ['pelv', -0.09, 'pelv', 0.09, 0.125],
  ['shR', 0, 'elR', 0, 0.054], ['elR', 0, 'haR', 0, 0.046], ['shL', 0, 'elL', 0, 0.054], ['elL', 0, 'haL', 0, 0.046],
  ['hipR', 0, 'knR', 0, 0.083], ['knR', 0, 'anR', 0, 0.06], ['hipL', 0, 'knL', 0, 0.083], ['knL', 0, 'anL', 0, 0.06],
  ['anR', 0, 'toR', 0, 0.048], ['anL', 0, 'toL', 0, 0.048],
];
const NAMES = Object.keys(J);
const IDX = Object.fromEntries(NAMES.map((n, i) => [n, i]));
const BASE = new Float32Array(NAMES.length * 3);
NAMES.forEach((n, i) => { BASE[i * 3] = J[n][0]; BASE[i * 3 + 1] = J[n][1]; BASE[i * 3 + 2] = J[n][2]; });
const UPPER = new Uint8Array(NAMES.length), ARM = new Uint8Array(NAMES.length), KNEE = new Uint8Array(NAMES.length), HIP = new Uint8Array(NAMES.length);
for (const n of ['head', 'neck0', 'neck1', 'chest', 'stom', 'shR', 'shL', 'elR', 'elL', 'haR', 'haL', 'grR']) UPPER[IDX[n]] = 1;
for (const n of ['elR', 'elL', 'haR', 'haL', 'grR']) ARM[IDX[n]] = 1;
const RIGHT = new Uint8Array(NAMES.length); for (const n of ['elR', 'haR', 'grR']) RIGHT[IDX[n]] = 1;
// arm poses (standing, pitch 0) measured on the drawn soldier (js/chars/anim.js IK to the weapon's hand nodes, an average rifle):
// elbows, hand ends of the forearm capsules and the grip anchor grR (where the right hand holds the gun; anim.js reads it through
// poseShapes(s, out, grip)) for a rifle / a pistol, at the hip and aiming down the sights (blended by ads 0..1)
const ARMJ = ['elR', 'haR', 'elL', 'haL', 'grR'].map(n => IDX[n]);
const ARMP = {
  rifle: [[[0.33, 1.18, -0.03], [0.11, 1.385, 0.13], [-0.134, 1.315, 0.256], [0.006, 1.36, 0.56], [0.10, 1.30, 0.22]],
          [[0.20, 1.20, 0.177], [0.147, 1.519, 0.075], [-0.13, 1.355, 0.272], [0.0, 1.489, 0.554], [0.10, 1.41, 0.22]]],
  pistol: [[[0.283, 1.154, 0.037], [0.099, 1.419, 0.137], [-0.205, 1.201, 0.181], [0.056, 1.401, 0.103], [0.08, 1.32, 0.24]],
           [[0.179, 1.213, 0.184], [0.064, 1.53, 0.212], [-0.179, 1.227, 0.199], [-0.014, 1.521, 0.212], [0.03, 1.42, 0.33]]],
};
const CAT = new Map();
/** 'pistol' | 'rifle' (any long gun, knife and grenades use the rifle arms) from s.pistol, or the current weapon of a PlayerState */
function armKind(s) {
  if (s.pistol != null) return s.pistol ? 'pistol' : 'rifle';
  const w = s.inv && s.cur && s.cur !== 'nade' && s.cur !== 'bomb' ? s.inv[s.cur] : null;
  if (!w || w.melee || !w.gunId) return 'rifle';
  let c = CAT.get(w.gunId);
  if (c === undefined) { const g = getGun(w.gunId); c = g && g.cat === 'pistol' ? 'pistol' : 'rifle'; CAT.set(w.gunId, c); }
  return c;
}
for (const n of ['knR', 'knL']) KNEE[IDX[n]] = 1;
for (const n of ['pelv', 'hipR', 'hipL']) HIP[IDX[n]] = 1;
const DEFI = DEF.map(([a, dxa, b, dxb, r]) => [IDX[a], dxa, IDX[b], dxb, r]);
const LEGS = [[IDX.hipR * 3, IDX.knR * 3, IDX.anR * 3, IDX.toR * 3, 0], [IDX.hipL * 3, IDX.knL * 3, IDX.anL * 3, IDX.toL * 3, Math.PI]];

const L = new Float32Array(NAMES.length * 3);   // local joints scratch
const LS = new Float32Array(4);                   // shoulders before the lean
const TAU = Math.PI * 2;
/** gait cycle position 0..1 of a leg: the phase is offset so u = 0 is the foot planting at the front (phase - PI/2) */
const gaitU = ph => { const u = ((ph - Math.PI / 2) / TAU) % 1; return u < 0 ? u + 1 : u; };
const GF = [0, 0], GT = new Float32Array(8);
/** hip twist (rad, about +y like yaw) toward a diagonal motion direction dir (relative to the facing) */
export function gaitTwist(dir, crouch, k) { return 0.42 * Math.sin(2 * dir) * (1 - 0.4 * (crouch || 0)) * (k || 0); }
/** foot offset of one leg at gait phase ph: out[0] = along the motion (m, + = ahead of the hip), out[1] = lift (m).
    Stance (u < st): the planted foot travels from +.45 sweep to -.55 sweep; swing: back to the front, lifted. */
export function gaitFoot(ph, sweep, st, lift, out = [0, 0]) {
  const u = gaitU(ph);
  if (u < st) { const h = Math.min(1, Math.max(0, (u / st - 0.6) / 0.4)); out[0] = sweep * (0.45 - u / st); out[1] = Math.min(0.06, sweep * 0.09) * h * h * (3 - 2 * h); }   // heel rise before toe-off
  else { const q = (u - st) / (1 - st), e = q * q * (3 - 2 * q), r = Math.min(1, q / 0.35); out[0] = sweep * (-0.55 + e); out[1] = Math.max(lift * Math.pow(Math.sin(Math.PI * q), 0.85), Math.min(0.06, sweep * 0.09) * (1 - r * r * (3 - 2 * r))); }
  return out;
}
/** Step geometry for a horizontal speed and crouch amount, shared by the simulation (player.js updateGait), the hitbox legs and
    the drawn legs (js/chars/anim.js) so they agree. out = { step (m per step = half a cycle), st (stance fraction of the cycle),
    sweep (m the planted foot travels backwards = 2 * step * st: no sliding), lift (swing height, m) } */
export function gaitParams(speed, crouch, out = { step: 1, st: 0.55, sweep: 0.8, lift: 0.1 }, side = 0) {
  const sp = Math.max(0, speed || 0), c = Math.min(1, Math.max(0, crouch || 0)), sd = Math.min(1, Math.abs(side || 0));
  const run = Math.min(1, Math.max(0, (sp - 2.4) / 2.0)), rs = run * run * (3 - 2 * run);
  const st = (0.56 - 0.28 * rs) * (1 - c) + 0.58 * c;                      // stance share: walk .56 -> run .28 (flight phase)
  const nat = (0.42 + 0.19 * sp) * (1 - c) + (0.3 + 0.16 * sp) * c;         // natural step length for the speed
  const cap = (0.72 * (1 - c) + 0.7 * c) * (1 - 0.3 * sd);                     // longest planted sweep the legs reach (shorter side steps)
  out.sweep = Math.min(cap, 2 * nat * st); out.st = st; out.step = Math.max(0.25, out.sweep / (2 * st));
  out.lift = (0.07 + 0.12 * rs) * (1 - c) + 0.06 * c;
  return out;
}
const EYE_STAND = 1.64, EYE_CROUCH = 1.12, LEAN_DIST = 0.36, LEAN_DROP = 0.05;

/** World-space shapes for a state-like object. */
export function poseShapes(s, out = new Float32Array(NSHAPE * STRIDE), grip = null) {
  const c = Math.min(1, Math.max(0, s.crouch || 0)), lean = Math.max(-1, Math.min(1, s.lean || 0));
  const pitch = Math.max(-1.55, Math.min(1.55, s.pitch || 0)), yaw = s.yaw || 0;
  L.set(BASE);
  // arms: rifle / pistol, hip -> aim down the sights
  {
    const T = ARMP[armKind(s)], a = Math.min(1, Math.max(0, s.ads != null ? s.ads : s.ws ? s.ws.ads || 0 : 0)), H = T[0], D = T[1];
    for (let k = 0; k < 5; k++) { const i = ARMJ[k] * 3; for (let j = 0; j < 3; j++) L[i + j] = H[k][j] + (D[k][j] - H[k][j]) * a; }
  }
  // pitch: arms about the shoulder line, head nod
  const sp = Math.sin(pitch), cp = Math.cos(pitch), sy0 = 1.425, sz0 = 0;
  for (let i = 0; i < NAMES.length; i++) {
    if (!ARM[i]) continue;
    const y = L[i * 3 + 1] - sy0, z = L[i * 3 + 2] - sz0;
    L[i * 3 + 1] = sy0 + y * cp - z * sp; L[i * 3 + 2] = sz0 + y * sp + z * cp;
  }
  const hi = IDX.head * 3; L[hi + 2] += 0.04 * sp; L[hi + 1] -= 0.015 * Math.abs(sp);
  // crouch
  if (c > 0) {
    const drop = (EYE_STAND - EYE_CROUCH) * c;
    for (let i = 0; i < NAMES.length; i++) {
      if (UPPER[i]) { L[i * 3 + 1] -= drop; L[i * 3 + 2] += 0.06 * c; }
      else if (HIP[i]) { L[i * 3 + 1] -= 0.42 * c; L[i * 3 + 2] -= 0.05 * c; }
      else if (KNEE[i]) { L[i * 3 + 1] -= 0.17 * c; L[i * 3 + 2] += 0.29 * c; }   // where a .40 / .40 leg bends (shin keeps its length)
    }
  }
  // walk gait (s.gait = phase rad, s.gaitK = 0..1 amplitude, s.gaitS = stance sweep m, s.gaitSt = stance fraction, s.gaitH = lift m,
  // s.gaitDir = motion direction relative to the facing): the ankles follow the same stance / swing curve as the drawn legs
  // (js/chars/anim.js), knees by two-bone IK toward their crouch / rest bend, so legs are hit where they are drawn
  const gk = s.gaitK || 0;
  if (gk > 0.01) {
    const ph = s.gait || 0, sw = (s.gaitS != null ? s.gaitS : 0.8) * gk, st = s.gaitSt || 0.55, lift = (s.gaitH != null ? s.gaitH : 0.1) * gk;
    // hips turn toward a diagonal motion (twist), the feet still travel along the motion direction
    const dir = s.gaitDir || 0, tw = gaitTwist(dir, c, gk), mdx = Math.sin(dir - tw), mdz = Math.cos(dir - tw);
    // ankle targets of both legs, then the pelvis drop that lets the longer reach land without overstretching
    let drop = 0;
    for (let k = 0; k < 2; k++) {
      const [hip, knee, ank, , off] = LEGS[k];
      gaitFoot(ph + off, sw, st, lift, GF);
      const tx = L[ank] + mdx * GF[0] + (L[hip] > 0 ? 1 : -1) * 0.05 * Math.abs(mdx) * gk, ty = L[ank + 1] + GF[1], tz = L[ank + 2] + mdz * GF[0];
      const LM = (Math.hypot(L[knee] - L[hip], L[knee + 1] - L[hip + 1], L[knee + 2] - L[hip + 2]) + Math.hypot(L[ank] - L[knee], L[ank + 1] - L[knee + 1], L[ank + 2] - L[knee + 2])) * 0.985;
      const h2 = (tx - L[hip]) ** 2 + (tz - L[hip + 2]) ** 2;
      drop = Math.max(drop, (L[hip + 1] - ty) - Math.sqrt(Math.max(0, LM * LM - h2)));
      GT[k * 3] = tx; GT[k * 3 + 1] = ty; GT[k * 3 + 2] = tz; GT[6 + k] = LM;
    }
    drop = Math.min(0.1, Math.max(0, drop));
    // the hips take the whole drop, the spine absorbs most of it (head / chest bob at most 4 cm: stable head hitbox)
    if (drop > 0) { const du = Math.min(drop, 0.04); for (let i = 0; i < NAMES.length; i++) if (HIP[i]) L[i * 3 + 1] -= drop; else if (UPPER[i]) L[i * 3 + 1] -= du; }
    for (let k = 0; k < 2; k++) {
      const [hip, knee, ank, toe] = LEGS[k];
      const hx = L[hip], hy = L[hip + 1], hz = L[hip + 2];
      const l1 = Math.hypot(L[knee] - hx, L[knee + 1] - (hy + drop), L[knee + 2] - hz), l2 = Math.hypot(L[ank] - L[knee], L[ank + 1] - L[knee + 1], L[ank + 2] - L[knee + 2]);
      const ox = L[toe] - L[ank], oy = L[toe + 1] - L[ank + 1], oz = L[toe + 2] - L[ank + 2];
      let dx = GT[k * 3] - hx, dy = GT[k * 3 + 1] - hy, dz = GT[k * 3 + 2] - hz; let d = Math.hypot(dx, dy, dz) || 1e-6;
      dx /= d; dy /= d; dz /= d; d = Math.min(d, (l1 + l2) * 0.999);
      const ca = (l1 * l1 - l2 * l2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, l1 * l1 - ca * ca));
      // knee pole: forward (+z) and a little outward, perpendicular to the hip -> ankle line
      let px = 0.08 * (hx > 0 ? 1 : -1), py = 0, pz = 1; const pd = px * dx + py * dy + pz * dz; px -= dx * pd; py -= dy * pd; pz -= dz * pd;
      const pl = Math.hypot(px, py, pz) || 1; px /= pl; py /= pl; pz /= pl;
      L[knee] = hx + dx * ca + px * h; L[knee + 1] = hy + dy * ca + py * h; L[knee + 2] = hz + dz * ca + pz * h;
      L[ank] = hx + dx * d; L[ank + 1] = hy + dy * d; L[ank + 2] = hz + dz * d;
      L[toe] = L[ank] + ox; L[toe + 1] = L[ank + 1] + oy; L[toe + 2] = L[ank + 2] + oz;
    }
    if (tw) {
      const ct = Math.cos(tw), st2 = Math.sin(tw);
      for (const [hip, knee, ank, toe] of LEGS) for (const j of [hip, knee, ank, toe]) { const x = L[j], z = L[j + 2]; L[j] = x * ct + z * st2; L[j + 2] = -x * st2 + z * ct; }
    }
  }
  // lean: roll the upper body about the pelvis
  if (lean !== 0) {
    const py = L[IDX.pelv * 3 + 1], eyeY = EYE_STAND - (EYE_STAND - EYE_CROUCH) * c, re = Math.max(0.3, eyeY - py);
    const k = Math.sin(lean * Math.PI / 2) * LEAN_DIST, th = Math.asin(Math.max(-0.95, Math.min(0.95, k / re)));
    const st = Math.sin(th), ct = Math.cos(th);
    // the arms turn rigidly about their (sheared) shoulders so their lengths stay those of the drawn arms
    const shr = IDX.shR * 3, shl = IDX.shL * 3, S0 = LS;
    S0[0] = L[shr]; S0[1] = L[shr + 1]; S0[2] = L[shl]; S0[3] = L[shl + 1];
    for (let i = 0; i < NAMES.length; i++) {
      if (ARM[i] || !UPPER[i]) continue;
      // a shear + tilt: the eye height lands exactly on move.js leanOffset (sideways k, down LEAN_DROP)
      const x = L[i * 3], y = L[i * 3 + 1] - py;
      L[i * 3] = x * ct + y * (k / re); L[i * 3 + 1] = py + y - x * st * 0.5 - Math.abs(lean) * LEAN_DROP * (y / re);
    }
    for (let i = 0; i < NAMES.length; i++) {
      if (!ARM[i]) continue;
      const r = RIGHT[i], ox = r ? S0[0] : S0[2], oy = r ? S0[1] : S0[3], sh = r ? shr : shl;
      const x = L[i * 3] - ox, y = L[i * 3 + 1] - oy;
      L[i * 3] = L[sh] + x * ct + y * st; L[i * 3 + 1] = L[sh + 1] - x * st + y * ct;
    }
  }
  // to world
  const sy = Math.sin(yaw), cy = Math.cos(yaw), px = s.pos.x, py = s.pos.y, pz = s.pos.z;
  if (grip) { const g = IDX.grR * 3; grip[0] = px + L[g] * cy + L[g + 2] * sy; grip[1] = py + L[g + 1]; grip[2] = pz - L[g] * sy + L[g + 2] * cy; }
  for (let k = 0; k < NSHAPE; k++) {
    const d = DEFI[k], o = k * STRIDE;
    const a = d[0] * 3, b = d[2] * 3;
    const ax = L[a] + d[1], ay = L[a + 1], az = L[a + 2], bx = L[b] + d[3], by = L[b + 1], bz = L[b + 2];
    out[o] = px + ax * cy + az * sy; out[o + 1] = py + ay; out[o + 2] = pz - ax * sy + az * cy;
    out[o + 3] = px + bx * cy + bz * sy; out[o + 4] = py + by; out[o + 5] = pz - bx * sy + bz * cy;
    out[o + 6] = d[4];
  }
  return out;
}

const CACHE = new WeakMap();
export function hitboxesOf(p, stamp) {
  let c = CACHE.get(p);
  if (!c) { c = { arr: new Float32Array(NSHAPE * STRIDE), stamp: NaN }; CACHE.set(p, c); }
  if (stamp == null || c.stamp !== stamp) { poseShapes(p, c.arr); c.stamp = stamp == null ? NaN : stamp; }
  return c.arr;
}

/** Ray (normalised dir) vs capsule segment a-b radius r: entry distance (0 if the origin is inside) or -1. */
export function rayCapsule(ox, oy, oz, dx, dy, dz, ax, ay, az, bx, by, bz, r) {
  const bax = bx - ax, bay = by - ay, baz = bz - az, oax = ox - ax, oay = oy - ay, oaz = oz - az;
  const baba = bax * bax + bay * bay + baz * baz, bard = bax * dx + bay * dy + baz * dz, baoa = bax * oax + bay * oay + baz * oaz;
  const rdoa = dx * oax + dy * oay + dz * oaz, oaoa = oax * oax + oay * oay + oaz * oaz;
  const a = baba - bard * bard;
  if (baba < 1e-10 || a < 1e-9) {   // a sphere, or a ray parallel to the axis: the nearer end cap decides
    const t0 = raySphere(oax, oay, oaz, dx, dy, dz, r), t1 = raySphere(oax - bax, oay - bay, oaz - baz, dx, dy, dz, r);
    return t0 < 0 ? t1 : t1 < 0 ? t0 : Math.min(t0, t1);
  }
  const b = baba * rdoa - baoa * bard, c = baba * oaoa - baoa * baoa - r * r * baba;
  const h = b * b - a * c;
  if (h < 0) return -1;
  const t = (-b - Math.sqrt(h)) / a, y = baoa + t * bard;
  if (y > 0 && y < baba) {
    if (t >= 0) return t;
    return c <= 0 && baoa > 0 && baoa < baba ? 0 : -1;    // origin inside the cylinder part
  }
  return y <= 0 ? raySphere(oax, oay, oaz, dx, dy, dz, r) : raySphere(oax - bax, oay - bay, oaz - baz, dx, dy, dz, r);
}
function raySphere(ox, oy, oz, dx, dy, dz, r) {   // origin relative to the centre
  const b = ox * dx + oy * dy + oz * dz, c = ox * ox + oy * oy + oz * oz - r * r;
  if (c <= 0) return 0;
  const h = b * b - c; if (h < 0) return -1;
  const t = -b - Math.sqrt(h); return t >= 0 ? t : -1;
}

/** Nearest shape of player p hit by the ray. */
export function raycastPlayer(p, ox, oy, oz, dx, dy, dz, maxDist, stamp, out = { t: 0, shape: 0, group: 'chest', x: 0, y: 0, z: 0 }) {
  // broad phase: vertical capsule around the body (r .8 covers arms, lean and crouch)
  const bt = rayCapsule(ox, oy, oz, dx, dy, dz, p.pos.x, p.pos.y + 0.35, p.pos.z, p.pos.x, p.pos.y + 1.45, p.pos.z, 0.8);
  if (bt < 0 || bt > maxDist) return null;
  const S = hitboxesOf(p, stamp);
  let best = Infinity, bi = -1;
  for (let k = 0; k < NSHAPE; k++) {
    const o = k * STRIDE;
    const t = rayCapsule(ox, oy, oz, dx, dy, dz, S[o], S[o + 1], S[o + 2], S[o + 3], S[o + 4], S[o + 5], S[o + 6]);
    if (t >= 0 && t < best && t <= maxDist) { best = t; bi = k; }
  }
  if (bi < 0) return null;
  out.t = best; out.shape = bi; out.group = SHAPES[bi].group;
  out.x = ox + dx * best; out.y = oy + dy * best; out.z = oz + dz * best;
  return out;
}

const PART = { head: 0, neck: 1, chest: 2, stomach: 3, pelvis: 4 };
/** World point of a body part (centre of the shape) from the cached hitboxes. */
export function aimPoint(p, part = 'chest', out = { x: 0, y: 0, z: 0 }, stamp) {
  const S = hitboxesOf(p, stamp), o = (PART[part] ?? 2) * STRIDE;
  out.x = (S[o] + S[o + 3]) * 0.5; out.y = (S[o + 1] + S[o + 4]) * 0.5; out.z = (S[o + 2] + S[o + 5]) * 0.5;
  return out;
}
