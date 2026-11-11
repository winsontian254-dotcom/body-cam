/* LIVE FIRE — ragdolls. PURE JS (no BABYLON): Verlet particles on the character's joints, distance constraints (bones rigid,
   torso braced, min / max ranges for the neck, spine and hips), hinge limits for knees and elbows, collision with the static
   world (js/phys: a swept ray per moving particle catches walls, steps and ceilings; groundAt keeps everything on the floor,
   stairs and ramps included), friction, and sleep once it has settled. The death pose is the starting state, its own motion
   is kept (a runner falls forward), the killing hit adds an impulse at the hit group, and for the first ~0.35 s a fading
   "muscle tone" pulls toward the pose at death so bodies crumple instead of dropping like a rope.
   Exports:
     class Ragdoll
       fromPose(pose, _, world)          start from an anim.js pose (joints + bones)
       addVelocity(vx, vy, vz)            whole-body velocity (m/s)
       impulse(group, dx, dy, dz, k)      a hit: 'head'|'neck'|'chest'|'stomach'|'arm'|'leg' along a direction, strength ~1..3
       slump(k)                           legs buckle: knees forward, hips down
       step(dt, world)                    simulate (sub-stepped, sleeps when still)
       toPose(pose)                       write the bone frames (anim.js layout; hands relaxed)
       asleep, t, P (Float32Array of positions, 3 per particle), N (particle count)
     JOINTS                               particle names in order */
import { raycast } from '../phys/ray.js';

export const JOINTS = ['pelvis', 'spine', 'chest', 'head', 'shR', 'elR', 'wrR', 'shL', 'elL', 'wrL', 'hipR', 'knR', 'anR', 'toR', 'hipL', 'knL', 'anL', 'toL'];
const I = Object.fromEntries(JOINTS.map((n, i) => [n, i]));
const N = JOINTS.length;
const RAD = [0.13, 0.12, 0.13, 0.11, 0.06, 0.05, 0.045, 0.06, 0.05, 0.045, 0.08, 0.065, 0.05, 0.04, 0.08, 0.065, 0.05, 0.04];
const GRAV = 11.5, SUB = 1 / 120, ITER = 6;
// rigid bones and braces: [a, b] (rest length from the start pose)
const RIGID = [
  ['pelvis', 'spine'], ['spine', 'chest'], ['chest', 'head'],
  ['chest', 'shR'], ['chest', 'shL'], ['shR', 'shL'], ['spine', 'shR'], ['spine', 'shL'],
  ['pelvis', 'hipR'], ['pelvis', 'hipL'], ['hipR', 'hipL'], ['spine', 'hipR'], ['spine', 'hipL'],
  ['shR', 'elR'], ['elR', 'wrR'], ['shL', 'elL'], ['elL', 'wrL'],
  ['hipR', 'knR'], ['knR', 'anR'], ['anR', 'toR'], ['hipL', 'knL'], ['knL', 'anL'], ['anL', 'toL'],
];
// ranges [a, b, minK, maxK] relative to the rest length: the neck / spine / hips may bend, not fold through themselves
const RANGE = [
  ['head', 'shR', 0.8, 1.15], ['head', 'shL', 0.8, 1.15], ['head', 'spine', 0.85, 1.02],
  ['chest', 'pelvis', 0.82, 1.03], ['shR', 'hipR', 0.85, 1.05], ['shL', 'hipL', 0.85, 1.05], ['shR', 'hipL', 0.86, 1.06], ['shL', 'hipR', 0.86, 1.06],
  ['hipR', 'anR', 0.42, 1.0], ['hipL', 'anL', 0.42, 1.0], ['shR', 'wrR', 0.3, 1.0], ['shL', 'wrL', 0.3, 1.0],
  ['knR', 'chest', 0.45, 2], ['knL', 'chest', 0.45, 2], ['knR', 'knL', 0.25, 3], ['anR', 'anL', 0.15, 4],
  ['wrR', 'spine', 0.2, 3], ['wrL', 'spine', 0.2, 3], ['head', 'pelvis', 0.75, 1.05],
];
const GROUP = { head: ['head'], neck: ['head', 'chest'], chest: ['chest', 'shR', 'shL', 'spine'], stomach: ['spine', 'pelvis'], arm: ['elR', 'wrR', 'elL', 'wrL'], leg: ['knR', 'anR', 'knL', 'anL'] };
const RAYO = { skipTag: 'foliage', out: { hit: false, dist: 0, point: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 0, z: 0 }, surf: null, id: -1 } };
const ORIG = { x: 0, y: 0, z: 0 }, DIR = { x: 0, y: 0, z: 0 }, GOUT = {};

export class Ragdoll {
  constructor() {
    this.P = new Float32Array(N * 3); this.Q = new Float32Array(N * 3);     // current, previous
    this.S = new Float32Array(N * 3);                                       // start of the sub-step (swept collision)
    this.R0 = new Float32Array(N * 3);                                      // death pose relative to the pelvis (muscle tone)
    this.rigid = []; this.range = []; this.t = 0; this.acc = 0; this.asleep = false; this.still = 0; this.N = N; this.fric = new Float32Array(N);
  }
  fromPose(O) {
    const J = O.joints, B = O.bones, P = this.P;
    const put = (n, v) => { const k = I[n] * 3; P[k] = v[0]; P[k + 1] = v[1]; P[k + 2] = v[2]; };
    put('pelvis', B.pelvis.o); put('chest', B.chest.o); put('head', B.head.o);
    put('spine', [B.pelvis.o[0] * 0.5 + B.chest.o[0] * 0.5, B.pelvis.o[1] * 0.5 + B.chest.o[1] * 0.5, B.pelvis.o[2] * 0.5 + B.chest.o[2] * 0.5]);
    put('shR', J.shR); put('elR', J.elR); put('wrR', J.wrR); put('shL', J.shL); put('elL', J.elL); put('wrL', J.wrL);
    put('hipR', J.hipR); put('knR', J.knR); put('anR', J.anR); put('hipL', J.hipL); put('knL', J.knL); put('anL', J.anL);
    const toe = (F) => [F.o[0] + F.z[0] * 0.15 - F.y[0] * 0.05, F.o[1] + F.z[1] * 0.15 - F.y[1] * 0.05, F.o[2] + F.z[2] * 0.15 - F.y[2] * 0.05];
    put('toR', toe(B.footR)); put('toL', toe(B.footL));
    for (let k = 0; k < N * 3; k++) if (!Number.isFinite(P[k])) P[k] = 0;
    this.Q.set(P); this.S.set(P);
    const len = (a, b) => { const i = I[a] * 3, j = I[b] * 3; return Math.max(0.02, Math.hypot(P[i] - P[j], P[i + 1] - P[j + 1], P[i + 2] - P[j + 2])); };
    this.rigid = RIGID.map(([a, b]) => [I[a] * 3, I[b] * 3, len(a, b)]);
    this.range = RANGE.map(([a, b, lo, hi]) => { const L = len(a, b); return [I[a] * 3, I[b] * 3, L * lo, L * hi]; });
    const p0 = I.pelvis * 3;
    for (let k = 0; k < N; k++) for (let j = 0; j < 3; j++) this.R0[k * 3 + j] = P[k * 3 + j] - P[p0 + j];
    this.t = 0; this.asleep = false; this.still = 0;
    return this;
  }
  /** velocity in m/s added to every particle (Verlet: move the previous positions) */
  addVelocity(vx, vy, vz) { const Q = this.Q; for (let k = 0; k < N; k++) { Q[k * 3] -= vx * SUB; Q[k * 3 + 1] -= vy * SUB; Q[k * 3 + 2] -= vz * SUB; } }
  impulse(group, dx, dy, dz, k = 1) {
    const l = Math.hypot(dx, dy, dz) || 1; dx /= l; dy /= l; dz /= l;
    const list = GROUP[group] || GROUP.chest, v = 2.2 * k, Q = this.Q;
    for (const n of list) { const i = I[n] * 3; Q[i] -= dx * v * SUB; Q[i + 1] -= (dy * v + 0.3) * SUB; Q[i + 2] -= dz * v * SUB; }
    // the rest of the upper body follows a little
    for (const n of ['chest', 'head', 'spine']) if (!list.includes(n)) { const i = I[n] * 3; Q[i] -= dx * v * 0.35 * SUB; Q[i + 2] -= dz * v * 0.35 * SUB; }
  }
  slump(k = 1) {
    const P = this.P, Q = this.Q, pl = I.pelvis * 3, ch = I.chest * 3;
    // forward = shoulders' right x up
    const rx = P[I.shR * 3] - P[I.shL * 3], rz = P[I.shR * 3 + 2] - P[I.shL * 3 + 2], rl = Math.hypot(rx, rz) || 1;
    const fx = -rz / rl, fz = rx / rl;          // left-handed: forward = (-rz, rx) for right (rx, rz)
    for (const n of ['knR', 'knL']) { const i = I[n] * 3; Q[i] -= fx * 1.2 * k * SUB; Q[i + 2] -= fz * 1.2 * k * SUB; }
    Q[pl + 1] += 1.0 * k * SUB; Q[ch + 1] += 0.4 * k * SUB;
  }

  step(dt, world) {
    if (this.asleep) return;
    this.t += dt; this.acc = Math.min(this.acc + dt, 0.1);
    let moved = 0;
    while (this.acc >= SUB) { this.acc -= SUB; moved = Math.max(moved, this.sub(world)); }
    // sleep once nothing has moved for a while
    if (moved < 0.0006 && this.t > 0.6) { this.still += dt; if (this.still > 0.6) this.asleep = true; } else this.still = 0;
    if (this.t > 12) this.asleep = true;
  }
  sub(world) {
    const P = this.P, Q = this.Q, S = this.S, h2 = SUB * SUB;
    S.set(P);
    // integrate (Verlet with a little air damping)
    for (let k = 0; k < N; k++) {
      const i = k * 3, f = this.fric[k];
      const damp = 0.998 - f * 0.25;
      const vx = (P[i] - Q[i]) * damp, vy = (P[i + 1] - Q[i + 1]) * (0.999), vz = (P[i + 2] - Q[i + 2]) * damp;
      Q[i] = P[i]; Q[i + 1] = P[i + 1]; Q[i + 2] = P[i + 2];
      P[i] += vx; P[i + 1] += vy - GRAV * h2; P[i + 2] += vz;
      this.fric[k] = 0;
    }
    // fading muscle tone toward the pose at death (relative to the pelvis)
    const tone = this.t < 0.35 ? (1 - this.t / 0.35) * 0.18 : 0;
    if (tone > 0) {
      const p0 = I.pelvis * 3;
      for (let k = 0; k < N; k++) { if (k === I.pelvis) continue; const i = k * 3; for (let j = 0; j < 3; j++) P[i + j] += ((P[p0 + j] + this.R0[i + j]) - P[i + j]) * tone; }
    }
    for (let it = 0; it < ITER; it++) {
      for (const [a, b, L] of this.rigid) solve(P, a, b, L, L);
      for (const [a, b, lo, hi] of this.range) solve(P, a, b, lo, hi);
      this.hinges();
    }
    // world collision
    let moved = 0;
    if (world) for (let k = 0; k < N; k++) {
      const i = k * 3, r = RAD[k];
      // swept test from the start of the sub-step
      let dx = P[i] - S[i], dy = P[i + 1] - S[i + 1], dz = P[i + 2] - S[i + 2];
      const d = Math.hypot(dx, dy, dz);
      if (d > 1e-5) {
        moved = Math.max(moved, d);
        ORIG.x = S[i]; ORIG.y = S[i + 1]; ORIG.z = S[i + 2]; DIR.x = dx / d; DIR.y = dy / d; DIR.z = dz / d;
        const hit = raycast(world, ORIG, DIR, d + r, RAYO);
        if (hit && hit.hit && hit.dist > 0) {
          const n = hit.normal, back = Math.max(0, hit.dist - r);
          P[i] = S[i] + DIR.x * back + n.x * 0.002; P[i + 1] = S[i + 1] + DIR.y * back + n.y * 0.002; P[i + 2] = S[i + 2] + DIR.z * back + n.z * 0.002;
          // friction: lose the tangential motion (previous position pulled along)
          this.fric[k] = 1;
          Q[i] = P[i] - (P[i] - Q[i]) * 0.3; Q[i + 1] = P[i + 1] - (P[i + 1] - Q[i + 1]) * 0.3; Q[i + 2] = P[i + 2] - (P[i + 2] - Q[i + 2]) * 0.3;
        }
      }
      // floor (stairs / ramps / terrain): never below the walkable top under the particle
      const gr = world.groundAt(P[i], P[i + 2], P[i + 1] + r + 0.25, 0, GOUT);
      if (gr && P[i + 1] - r < gr.y) {
        P[i + 1] = gr.y + r; this.fric[k] = 1;
        Q[i] = P[i] - (P[i] - Q[i]) * 0.45; Q[i + 2] = P[i + 2] - (P[i + 2] - Q[i + 2]) * 0.45;
        if (Q[i + 1] < P[i + 1] - 0.0) Q[i + 1] = P[i + 1] - (P[i + 1] - Q[i + 1]) * 0.2;
      }
    }
    // NaN guard
    for (let k = 0; k < N * 3; k++) if (!Number.isFinite(P[k])) { P.set(S); Q.set(S); break; }
    return moved;
  }
  /** knees bend forward, elbows backward: push the middle joint across the limb line when it is on the wrong side */
  hinges() {
    const P = this.P;
    // body frame: right = shR - shL (and hips), up = chest - pelvis
    const rx = (P[I.shR * 3] - P[I.shL * 3]) + (P[I.hipR * 3] - P[I.hipL * 3]), ry = (P[I.shR * 3 + 1] - P[I.shL * 3 + 1]) + (P[I.hipR * 3 + 1] - P[I.hipL * 3 + 1]), rz = (P[I.shR * 3 + 2] - P[I.shL * 3 + 2]) + (P[I.hipR * 3 + 2] - P[I.hipL * 3 + 2]);
    const ux = P[I.chest * 3] - P[I.pelvis * 3], uy = P[I.chest * 3 + 1] - P[I.pelvis * 3 + 1], uz = P[I.chest * 3 + 2] - P[I.pelvis * 3 + 2];
    // forward = right x up (left-handed game axes: x right, y up, z forward -> (1,0,0) x (0,1,0) = (0,0,1))
    let fx = ry * uz - rz * uy, fy = rz * ux - rx * uz, fz = rx * uy - ry * ux; const fl = Math.hypot(fx, fy, fz) || 1; fx /= fl; fy /= fl; fz /= fl;
    const limb = (a, m, b, sgn) => {
      const A = I[a] * 3, M = I[m] * 3, Bb = I[b] * 3;
      const cx = (P[A] + P[Bb]) / 2, cy = (P[A + 1] + P[Bb + 1]) / 2, cz = (P[A + 2] + P[Bb + 2]) / 2;
      const d = ((P[M] - cx) * fx + (P[M + 1] - cy) * fy + (P[M + 2] - cz) * fz) * sgn;
      if (d < 0.015) { const k = (0.015 - d) * sgn; P[M] += fx * k; P[M + 1] += fy * k; P[M + 2] += fz * k; }
    };
    limb('hipR', 'knR', 'anR', 1); limb('hipL', 'knL', 'anL', 1);
    limb('shR', 'elR', 'wrR', -1); limb('shL', 'elL', 'wrL', -1);
  }

  /** bone frames for the renderer (anim.js pose layout) */
  toPose(O) {
    const P = this.P, B = O.bones, J = O.joints;
    const v = n => { const i = I[n] * 3; return [P[i], P[i + 1], P[i + 2]]; };
    const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
    const shR = v('shR'), shL = v('shL'), hipR = v('hipR'), hipL = v('hipL'), pel = v('pelvis'), sp = v('spine'), ch = v('chest'), hd = v('head');
    const right = nz(add(sub(shR, shL), sub(hipR, hipL)));
    // pelvis: up toward the spine, right from the hips
    frameYZ(B.pelvis, pel, nz(sub(sp, pel)), crossN(nz(sub(hipR, hipL)), nz(sub(sp, pel))));
    frameYZ(B.chest, ch, nz(sub(ch, sp)), crossN(nz(sub(shR, shL)), nz(sub(ch, sp))));
    B.chest.len = 0;
    frameYZ(B.neck, ch, B.chest.y, B.chest.z);
    frameYZ(B.head, hd, nz(sub(hd, ch)), crossN(right, nz(sub(hd, ch))));
    for (const [k, a, b, c] of [['R', 'shR', 'elR', 'wrR'], ['L', 'shL', 'elL', 'wrL']]) {
      const s = v(a), e = v(b), w = v(c);
      const ua = B['uarm' + k], fa = B['farm' + k], hd2 = B['hand' + k];
      const yU = nz(sub(s, e)), yF = nz(sub(e, w));
      frameYZ(ua, s, yU, orth(nz(sub(w, e)), yU, B.chest.z)); ua.len = dist(s, e);
      frameYZ(fa, e, yF, orth(B.chest.z, yF, B.chest.x)); fa.len = dist(e, w);
      frameYZ(hd2, w, yF, fa.z);
      cp(J['sh' + k], s); cp(J['el' + k], e); cp(J['wr' + k], w);
    }
    for (const [k, a, b, c, d] of [['R', 'hipR', 'knR', 'anR', 'toR'], ['L', 'hipL', 'knL', 'anL', 'toL']]) {
      const hp = v(a), kn = v(b), an = v(c), to = v(d);
      const fwd = nz(sub(to, an));
      const th = B['thigh' + k], sn = B['shin' + k], ft = B['foot' + k];
      const y1 = nz(sub(hp, kn)), y2 = nz(sub(kn, an));
      frameYZ(th, hp, y1, orth(fwd, y1, B.pelvis.z)); th.len = dist(hp, kn);
      frameYZ(sn, kn, y2, orth(fwd, y2, B.pelvis.z)); sn.len = dist(kn, an);
      // foot: z toward the toe, y as close to the shin as possible
      frameZY(ft, an, fwd, y2);
      cp(J['hip' + k], hp); cp(J['kn' + k], kn); cp(J['an' + k], an);
    }
    O.gunOn = false; O.itemOn = false; O.handGrip = 'hang'; O.handHold = 'hang';
    return O;
  }
}

function solve(P, a, b, lo, hi) {
  const dx = P[b] - P[a], dy = P[b + 1] - P[a + 1], dz = P[b + 2] - P[a + 2];
  const d = Math.hypot(dx, dy, dz) || 1e-6;
  const L = d < lo ? lo : d > hi ? hi : d;
  if (L === d) return;
  const k = (d - L) / d * 0.5;
  P[a] += dx * k; P[a + 1] += dy * k; P[a + 2] += dz * k;
  P[b] -= dx * k; P[b + 1] -= dy * k; P[b + 2] -= dz * k;
}
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const cp = (d, s) => { d[0] = s[0]; d[1] = s[1]; d[2] = s[2]; };
function nz(a) { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
function crossN(a, b) { return nz([a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]); }
/** the component of v perpendicular to axis (fallback: of w) */
function orth(v, axis, w) {
  let d = v[0] * axis[0] + v[1] * axis[1] + v[2] * axis[2]; let o = [v[0] - axis[0] * d, v[1] - axis[1] * d, v[2] - axis[2] * d];
  if (Math.hypot(o[0], o[1], o[2]) < 1e-3) { d = w[0] * axis[0] + w[1] * axis[1] + w[2] * axis[2]; o = [w[0] - axis[0] * d, w[1] - axis[1] * d, w[2] - axis[2] * d]; }
  return nz(o);
}
/** frame with y = given, z = hint orthogonalised (x = y cross z) */
function frameYZ(F, o, y, zh) {
  F.o[0] = o[0]; F.o[1] = o[1]; F.o[2] = o[2];
  const x = crossN(y, zh); const z = crossN(x, y);
  F.x[0] = x[0]; F.x[1] = x[1]; F.x[2] = x[2]; F.y[0] = y[0]; F.y[1] = y[1]; F.y[2] = y[2]; F.z[0] = z[0]; F.z[1] = z[1]; F.z[2] = z[2];
  return F;
}
function frameZY(F, o, z, yh) {
  F.o[0] = o[0]; F.o[1] = o[1]; F.o[2] = o[2];
  const x = crossN(yh, z); const y = crossN(z, x);
  F.x[0] = x[0]; F.x[1] = x[1]; F.x[2] = x[2]; F.y[0] = y[0]; F.y[1] = y[1]; F.y[2] = y[2]; F.z[0] = z[0]; F.z[1] = z[1]; F.z[2] = z[2];
  return F;
}
