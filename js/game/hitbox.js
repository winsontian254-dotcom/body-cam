/* LIVE FIRE — hitboxes: capsules / spheres from a PlayerState (deterministic, no meshes). PURE JS.
   Exports:
     SHAPES            [{ name, group }] the 15 shapes in order (head, neck, chest, stomach, pelvis, arms x4, thighs, shins, feet)
     GROUP_MULT        { head 4, neck 2, chest 1, stomach 1.25, arm 1, leg .75 } (docs §4)
     NSHAPE, STRIDE    shape count and floats per shape in the pose array (ax ay az bx by bz r)
     poseShapes(s, out?) -> Float32Array   shapes for a state-like object { pos, yaw, pitch, crouch, lean, gait?, gaitK? }
                         (world space; a sphere is a capsule with a === b). Also used by the third-person placeholder bodies.
     hitboxesOf(p, stamp) -> Float32Array   cached per player while `stamp` (the game tick) is unchanged
     raycastPlayer(p, ox, oy, oz, dx, dy, dz, maxDist, stamp, out?) -> out { t, shape, group, x, y, z } | null
                         nearest shape the ray enters within maxDist (dir normalised); broad phase first
     rayCapsule(ox, oy, oz, dx, dy, dz, ax, ay, az, bx, by, bz, r) -> t | -1
     aimPoint(p, part, out)    world point of 'head' | 'chest' | 'stomach' | 'pelvis' (bots, LOS checks)
   Pose model (feet at pos, facing +Z at yaw 0, x = right): a rifle-carry pose; pitch turns the arms about the shoulder line and
   nods the head; crouch lowers the upper body .52 m (eye 1.64 -> 1.12, like phys/move.js), folds the thighs forward and keeps the
   feet; lean rolls everything above the pelvis about the pelvis so the eye lands on phys/move.js leanOffset (.36 m sideways);
   gait (phase, advanced by game.js from the horizontal speed) swings the legs, so legs are hit where they are drawn. */

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
  haR: [0.085, 1.245, 0.30], haL: [-0.035, 1.285, 0.47],
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
for (const n of ['head', 'neck0', 'neck1', 'chest', 'stom', 'shR', 'shL', 'elR', 'elL', 'haR', 'haL']) UPPER[IDX[n]] = 1;
for (const n of ['elR', 'elL', 'haR', 'haL']) ARM[IDX[n]] = 1;
for (const n of ['knR', 'knL']) KNEE[IDX[n]] = 1;
for (const n of ['pelv', 'hipR', 'hipL']) HIP[IDX[n]] = 1;
const DEFI = DEF.map(([a, dxa, b, dxb, r]) => [IDX[a], dxa, IDX[b], dxb, r]);
const LEGS = [[IDX.hipR * 3, IDX.knR * 3, IDX.anR * 3, IDX.toR * 3, 0], [IDX.hipL * 3, IDX.knL * 3, IDX.anL * 3, IDX.toL * 3, Math.PI]];

const L = new Float32Array(NAMES.length * 3);   // local joints scratch
const EYE_STAND = 1.64, EYE_CROUCH = 1.12, LEAN_DIST = 0.36, LEAN_DROP = 0.05;

/** World-space shapes for a state-like object. */
export function poseShapes(s, out = new Float32Array(NSHAPE * STRIDE)) {
  const c = Math.min(1, Math.max(0, s.crouch || 0)), lean = Math.max(-1, Math.min(1, s.lean || 0));
  const pitch = Math.max(-1.55, Math.min(1.55, s.pitch || 0)), yaw = s.yaw || 0;
  L.set(BASE);
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
      else if (KNEE[i]) { L[i * 3 + 1] -= 0.05 * c; L[i * 3 + 2] += 0.30 * c; }
    }
  }
  // walk gait (s.gait = phase rad, s.gaitK = 0..1 amplitude): thighs swing about the hips, knees flex on the forward swing
  const gk = s.gaitK || 0;
  if (gk > 0.01) {
    const ph = s.gait || 0;
    for (const [hip, knee, ank, toe, off] of LEGS) {
      // in this rotation a positive angle swings a limb BACKWARDS: thigh = -swing, shin = thigh + knee flex
      const fi = ph + off, a = -0.42 * gk * Math.sin(fi), b = -0.62 * gk * Math.max(0, Math.sin(fi + 0.9));
      const hy = L[hip + 1], hz = L[hip + 2];
      // thigh: hip -> knee rotated by a (forward = +z)
      let vy = L[knee + 1] - hy, vz = L[knee + 2] - hz;
      const ca = Math.cos(a), sa = Math.sin(a);
      const kny = hy + vy * ca - vz * sa, knz = hz + vy * sa + vz * ca;
      // shin: knee -> ankle rotated by a - b (the knee bends backwards)
      vy = L[ank + 1] - L[knee + 1]; vz = L[ank + 2] - L[knee + 2];
      const c2 = Math.cos(a - b), s2 = Math.sin(a - b);
      const any = kny + vy * c2 - vz * s2, anz = knz + vy * s2 + vz * c2;
      vy = L[toe + 1] - L[ank + 1]; vz = L[toe + 2] - L[ank + 2];
      const c3 = Math.cos((a - b) * 0.4), s3 = Math.sin((a - b) * 0.4);
      L[toe + 1] = any + vy * c3 - vz * s3; L[toe + 2] = anz + vy * s3 + vz * c3;
      L[knee + 1] = kny; L[knee + 2] = knz; L[ank + 1] = any; L[ank + 2] = anz;
    }
  }
  // lean: roll the upper body about the pelvis
  if (lean !== 0) {
    const py = L[IDX.pelv * 3 + 1], eyeY = EYE_STAND - (EYE_STAND - EYE_CROUCH) * c, re = Math.max(0.3, eyeY - py);
    const k = Math.sin(lean * Math.PI / 2) * LEAN_DIST, th = Math.asin(Math.max(-0.95, Math.min(0.95, k / re)));
    const st = Math.sin(th), ct = Math.cos(th);
    for (let i = 0; i < NAMES.length; i++) {
      if (!UPPER[i]) continue;
      // a shear + tilt: the eye height lands exactly on move.js leanOffset (sideways k, down LEAN_DROP)
      const x = L[i * 3], y = L[i * 3 + 1] - py;
      L[i * 3] = x * ct + y * (k / re); L[i * 3 + 1] = py + y - x * st * 0.5 - Math.abs(lean) * LEAN_DROP * (y / re);
    }
  }
  // to world
  const sy = Math.sin(yaw), cy = Math.cos(yaw), px = s.pos.x, py = s.pos.y, pz = s.pos.z;
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
