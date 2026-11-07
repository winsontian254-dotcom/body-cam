/* LIVE FIRE — character movement for a vertical cylinder (players AND bots use the same code). PURE JS (no BABYLON).
   Exports:
     MOVE                       tuning constants (docs §3 plus the extensions below)
     BTN                        command button bits (js/game/player.js re-exports this)
     moveStep(world, s, cmd, dt, maxSpeed = 5.2, opts?) -> events
         Mutates s.pos, s.vel, s.onGround, s.crouch, s.lean, s.mantle, s.yaw, s.pitch, s.tagged and s.mv (internal movement
         scratch: plain numbers, serialisable). cmd = { mx, mz, yaw, pitch, buttons } (BTN bits JUMP CROUCH WALK LEANL LEANR).
         opts = { bodies: [{ x, y, z, r, h }] (other players to collide with) }.
         Returns a REUSED events object (valid until the next moveStep call):
         { landed (fall speed m/s, 0 if none), footstep (surf|null), loud (0..1), jumped, mantled ('mantle'|'vault'|null),
           stepUp (metres stepped up this tick), surf (surface under the feet) }
     applySlow(s, tag, mul, secs)   tagged speed multiplier (e.g. 'molotov', 'carry', 'concussion'); the strongest per tag wins
     fallDamage(speed) -> hp        damage for a landing speed (0 below ~3 m of fall)
     bodyHeight(s), eyeHeight(s), eyePos(s, out?) -> {x,y,z}   eye position including crouch, lean and step smoothing
     leanOffset(s, out?) -> {x, y, z}   sideways head offset of the current lean (camera roll = lean * MOVE.leanRoll)
     newMoveState(), resetMove(s)   s.mv helpers (resetMove on spawn/teleport)
   Model (Source-like): ground accel/friction/stopSpeed, limited air control, gravity, jump (needs a fresh press), crouch
   (ceiling check before standing; crouching in the air tucks the legs), step-up <= MOVE.step with headroom check, ground
   snap down stairs and ramps, several slide iterations against walls, slopes steeper than ~46 deg are not walkable,
   mantle/vault of ledges up to MOVE.mantleMax when jumping into them, lean blocked by walls, landing slow-down (no bunny
   hopping), hit slow-down (s.tagged seconds), footsteps by distance (walking and crouching are silent). */

import { raycast } from './ray.js';

export const BTN = { FIRE: 1, ADS: 2, JUMP: 4, CROUCH: 8, WALK: 16, RELOAD: 32, USE: 64, INSPECT: 128, ALT: 256, DROP: 512, LEANL: 1024, LEANR: 2048 };

export const MOVE = {
  radius: .32, height: 1.80, crouchHeight: 1.25, eye: 1.64, crouchEye: 1.12, step: .45,
  gravity: 15, jumpV: 4.3, accel: 5.5, airAccel: 1.0, friction: 5.2, stopSpeed: 1.4,
  walkMul: .52, crouchMul: .34, mantleMax: 1.15,
  // extensions
  airCap: .6,            // m/s of wish speed that air acceleration may add (limited air control)
  airStep: .06,          // ledge tolerance while airborne (lands on a lip instead of snagging)
  duckTime: .2,          // seconds from standing to fully crouched
  snapDown: .55,         // ground snap distance going down stairs / ramps
  maxSlopeNY: .69,       // walkable if the surface normal's y >= this (~46 degrees)
  leanDist: .36, leanDrop: .05, leanRate: 6.5, leanMul: .8, leanRoll: .2, headR: .14,
  landSlowMul: .55, landSlowTime: .3, bhopCap: 1.08,
  tagMul: .45, tagTime: .6,
  stride: 1.55, silentFrac: .6,
  mantleTime: .3, mantleTimeK: .3, vaultMax: 1.05, mantleReach: .32,
  maxFall: 55, stepSmooth: 14,
};

const EV = { landed: 0, footstep: null, loud: 0, jumped: false, mantled: null, stepUp: 0, surf: null };
const G = { y: 0, id: -1, field: -1, surf: null, nx: 0, ny: 1, nz: 0 };
const G2 = { y: 0, id: -1, field: -1, surf: null, nx: 0, ny: 1, nz: 0 };
const S = { lx: 0, lz: 0, qx: 0, qz: 0, wx: 0, wz: 0, d2: 0, inside: false };
const Q = [];
const P = { x: 0, z: 0 };
const RO = { x: 0, y: 0, z: 0 }, RD = { x: 0, y: 0, z: 0 };
const ROPT = { out: { hit: false, dist: 0, point: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 0, z: 0 }, surf: null, id: -1 } };
const RAMP = 1;

export function newMoveState() {
  return { jumpHeld: false, jumpY: 0, airT: 0, stepD: 0, stepOff: 0, landT: 0, surf: 'concrete', ground: -1, hit: false,
    hitNx: 0, hitNz: 0, sl: {} };
}
export function resetMove(s) { s.mv = newMoveState(); s.mantle = null; if (s.vel) { s.vel.x = s.vel.y = s.vel.z = 0; } }

export function bodyHeight(s) { return MOVE.height - (MOVE.height - MOVE.crouchHeight) * (s.crouch || 0); }
export function eyeHeight(s) { return MOVE.eye - (MOVE.eye - MOVE.crouchEye) * (s.crouch || 0) + (s.mv ? s.mv.stepOff : 0); }
export function leanOffset(s, out = { x: 0, y: 0, z: 0 }) {
  const l = s.lean || 0, k = Math.sin(l * Math.PI / 2) * MOVE.leanDist;   // smooth start/stop of the head arc
  out.x = Math.cos(s.yaw || 0) * k; out.z = -Math.sin(s.yaw || 0) * k; out.y = -Math.abs(l) * MOVE.leanDrop;
  return out;
}
const LO = { x: 0, y: 0, z: 0 };
export function eyePos(s, out = { x: 0, y: 0, z: 0 }) {
  leanOffset(s, LO);
  out.x = s.pos.x + LO.x; out.y = s.pos.y + eyeHeight(s) + LO.y; out.z = s.pos.z + LO.z;
  return out;
}
export function applySlow(s, tag, mul, secs) {
  const m = s.mv || (s.mv = newMoveState());
  const cur = m.sl[tag];
  if (!cur || mul < cur.m || secs > cur.t) m.sl[tag] = { m: cur ? Math.min(cur.m, mul) : mul, t: Math.max(cur ? cur.t : 0, secs) };
}
/** HP lost on landing: free up to ~9.5 m/s (a 3 m drop), then steep (a 10 m drop kills). */
export function fallDamage(speed) { return speed <= 9.5 ? 0 : Math.round((speed - 9.5) * 13); }

// ------------------------------------------------------------------------------------------------ helpers
function clampN(v, a, b) { return v < a ? a : v > b ? b : v; }

/** Push the circle (P.x, P.z, r) out of blocking colliders/bodies. Clips s.vel. Returns true if anything blocked. */
function resolve(world, s, m, r, feet, h, allow, bodies) {
  const cols = world.cols, head = feet + h;
  let blockedAny = false;
  for (let it = 0; it < 5; it++) {
    let x = P.x, z = P.z;
    const n = world.query(x - r, feet + allow, z - r, x + r, head, z + r, Q, 1);
    let best = 0, bnx = 0, bnz = 0;
    for (let i = 0; i < n; i++) {
      const c = cols[Q[i]];
      if (c.bot >= head - 1e-3) continue;
      world.footClosest(c, x, z, S);
      if (S.d2 >= r * r) continue;
      const top = c.k === RAMP ? world.topLocal(c, S.qx, S.qz) : c.top;
      if (top <= feet + allow) {
        // a step: only blocks if there is no headroom on top of it
        if (top <= feet + 5e-3) continue;
        if (world.ceilingAt(x, z, top + 5e-3, r * 0.95) - top >= h - 0.02) continue;
      }
      let nx, nz, depth;
      if (!S.inside) {
        const d = Math.sqrt(S.d2); nx = (x - S.wx) / d; nz = (z - S.wz) / d; depth = r - d;
      } else if (c.k === 2) {
        const dx = x - c.cx, dz = z - c.cz, d = Math.hypot(dx, dz) || 1e-6;
        nx = d > 1e-6 ? dx / d : 1; nz = d > 1e-6 ? dz / d : 0; depth = c.r - d + r;
      } else {
        const px = c.hx - Math.abs(S.lx), pz = c.hz - Math.abs(S.lz);
        let nlx = 0, nlz = 0;
        if (px < pz) { nlx = S.lx >= 0 ? 1 : -1; depth = px + r; } else { nlz = S.lz >= 0 ? 1 : -1; depth = pz + r; }
        nx = nlx * c.c + nlz * c.s; nz = -nlx * c.s + nlz * c.c;
      }
      if (depth > best) { best = depth; bnx = nx; bnz = nz; }
    }
    if (bodies) {
      for (let i = 0; i < bodies.length; i++) {
        const b = bodies[i];
        if (b.y >= head || b.y + b.h <= feet + allow) continue;
        const dx = x - b.x, dz = z - b.z, rr = r + b.r, d2 = dx * dx + dz * dz;
        if (d2 >= rr * rr) continue;
        const d = Math.sqrt(d2);
        const nx = d > 1e-6 ? dx / d : 1, nz = d > 1e-6 ? dz / d : 0, depth = rr - d;
        if (depth > best) { best = depth; bnx = nx; bnz = nz; }
      }
    }
    if (best <= 1e-7) break;
    P.x = x + bnx * (best + 1e-4); P.z = z + bnz * (best + 1e-4);
    const vn = s.vel.x * bnx + s.vel.z * bnz;
    if (vn < 0) { s.vel.x -= vn * bnx; s.vel.z -= vn * bnz; }
    m.hit = true; m.hitNx = bnx; m.hitNz = bnz; blockedAny = true;
  }
  return blockedAny;
}

function slideMove(world, s, m, dt, h, bodies) {
  const r = MOVE.radius;
  const allow = s.onGround ? MOVE.step : MOVE.airStep;
  const dx = s.vel.x * dt, dz = s.vel.z * dt;
  const n = Math.min(8, Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dz)) / (r * 0.45))));
  P.x = s.pos.x; P.z = s.pos.z;
  m.hit = false;
  for (let i = 0; i < n; i++) {
    // re-read the velocity each sub step: a wall hit clips it and the rest of the move slides
    P.x += s.vel.x * dt / n; P.z += s.vel.z * dt / n;
    resolve(world, s, m, r, s.pos.y, h, allow, bodies);
  }
}

function friction(s, dt) {
  const vx = s.vel.x, vz = s.vel.z, sp = Math.hypot(vx, vz);
  if (sp < 1e-3) { s.vel.x = 0; s.vel.z = 0; return; }
  const control = sp < MOVE.stopSpeed ? MOVE.stopSpeed : sp;
  let ns = sp - control * MOVE.friction * dt; if (ns < 0) ns = 0;
  const k = ns / sp; s.vel.x = vx * k; s.vel.z = vz * k;
}
function accelerate(s, wx, wz, wishSpeed, accel, dt) {
  const cur = s.vel.x * wx + s.vel.z * wz, add = wishSpeed - cur;
  if (add <= 0) return;
  let a = accel * dt * wishSpeed; if (a > add) a = add;
  s.vel.x += a * wx; s.vel.z += a * wz;
}
function airAccelerate(s, wx, wz, wishSpeed, dt) {
  const ws = wishSpeed > MOVE.airCap ? MOVE.airCap : wishSpeed;
  const cur = s.vel.x * wx + s.vel.z * wz, add = ws - cur;
  if (add <= 0) return;
  let a = MOVE.airAccel * wishSpeed * dt; if (a > add) a = add;
  s.vel.x += a * wx; s.vel.z += a * wz;
}

function crouchUpdate(world, s, want, dt) {
  const H = MOVE.height, Hc = MOVE.crouchHeight, span = H - Hc;
  const c0 = s.crouch || 0;
  let c = want ? Math.min(1, c0 + dt / MOVE.duckTime) : Math.max(0, c0 - dt / MOVE.duckTime);
  if (c === c0) return;
  const h0 = H - span * c0;
  let h1 = H - span * c;
  if (h1 > h0) {
    if (s.onGround) {
      const ceil = world.ceilingAt(s.pos.x, s.pos.z, s.pos.y + h0 - 0.01, MOVE.radius * 0.98);
      if (s.pos.y + h1 > ceil - 0.005) { h1 = Math.max(h0, ceil - 0.005 - s.pos.y); c = (H - h1) / span; }
    } else {
      // standing up in the air lowers the feet (the head stays)
      const g = world.groundAt(s.pos.x, s.pos.z, s.pos.y + 0.001, MOVE.radius, G2);
      const room = g ? s.pos.y - g.y - 0.002 : Infinity;
      const dh = Math.min(h1 - h0, Math.max(0, room));
      s.pos.y -= dh; h1 = h0 + dh; c = (H - h1) / span;
    }
  } else if (!s.onGround) s.pos.y += h0 - h1;   // crouching in the air tucks the legs up
  s.crouch = c < 1e-4 ? 0 : c > 1 - 1e-4 ? 1 : c;
}

function leanLimit(world, s, side, eyeY) {
  const yaw = s.yaw || 0;
  RO.x = s.pos.x; RO.y = eyeY; RO.z = s.pos.z;
  RD.x = Math.cos(yaw) * side; RD.y = 0; RD.z = -Math.sin(yaw) * side;
  const reach = MOVE.leanDist + MOVE.headR;
  const hit = raycast(world, RO, RD, reach, ROPT);
  if (!hit.hit) return 1;
  // the head moves on sin(lean * pi / 2): invert it so the head stops headR short of the wall
  const k = clampN((hit.dist - MOVE.headR) / MOVE.leanDist, 0, 1);
  return Math.asin(k) * 2 / Math.PI;
}

// ------------------------------------------------------------------------------------------------ mantle / vault
function tryMantle(world, s, m, fromGround, ev) {
  const r = MOVE.radius, H = MOVE.height, Hc = MOVE.crouchHeight;
  const x = s.pos.x, y = s.pos.y, z = s.pos.z, yaw = s.yaw || 0;
  const fx = Math.sin(yaw), fz = Math.cos(yaw);
  const h = bodyHeight(s);
  const reachY = (fromGround ? y : Math.min(y, m.jumpY)) + MOVE.mantleMax + 0.02;
  const px = x + fx * (r + MOVE.mantleReach), pz = z + fz * (r + MOVE.mantleReach);
  const g = world.groundAt(px, pz, reachY, r * 0.45, G2);
  if (!g) return false;
  const top = g.y, rise = top - y;
  if (fromGround ? rise <= MOVE.step + 0.03 : rise <= MOVE.airStep) return false;
  if (rise > MOVE.mantleMax + 0.02 || g.ny < MOVE.maxSlopeNY) return false;
  // a real ledge: something solid in front of the body below the top
  if (!world.blocked(x + fx * (r * 0.6 + 0.06), Math.max(y + 0.05, top - 0.35), z + fz * (r * 0.6 + 0.06), r * 0.5, 0.3)) return false;
  // headroom to rise in place, then move forward
  const ceil = world.ceilingAt(x, z, y + h - 0.01, r * 0.9);
  if (ceil < top + Hc + 0.02) return false;
  const tx = x + fx * (r + 0.4), tz = z + fz * (r + 0.4);
  const g2 = world.groundAt(tx, tz, top + 0.06, r * 0.3, G);
  let kind = null, ex = tx, ey = top, ez = tz, crouch = 0;
  if (g2 && Math.abs(g2.y - top) < 0.12 && g2.ny >= MOVE.maxSlopeNY) {
    ey = g2.y;
    if (!world.blocked(tx, ey + 0.02, tz, r, H - 0.04)) kind = 'mantle';
    else if (!world.blocked(tx, ey + 0.02, tz, r, Hc - 0.04)) { kind = 'mantle'; crouch = 1; }
  }
  if (!kind && rise <= MOVE.vaultMax + 0.02) {
    // thin obstacle: vault over it to the far side
    let d = r + 0.15, edge = -1;
    for (; d <= r + 1.3; d += 0.08) {
      const gg = world.groundAt(x + fx * d, z + fz * d, top + 0.03, 0.04, G);
      if (!gg || gg.y < top - 0.25) { edge = d; break; }
    }
    if (edge > 0) {
      const lx = x + fx * (edge + r + 0.06), lz = z + fz * (edge + r + 0.06);
      const mx = x + fx * (edge * 0.5 + r * 0.5), mz = z + fz * (edge * 0.5 + r * 0.5);
      if (!world.blocked(lx, top + 0.03, lz, r, Hc - 0.05) && !world.blocked(mx, top + 0.03, mz, r * 0.8, Hc - 0.05)) {
        kind = 'vault'; ex = lx; ey = top + 0.03; ez = lz; crouch = 0;
      }
    }
  }
  if (!kind) return false;
  const dur = MOVE.mantleTime + MOVE.mantleTimeK * clampN(rise / MOVE.mantleMax, 0, 1) + (kind === 'vault' ? 0.08 : 0);
  s.mantle = { k: kind, t: 0, dur, x0: x, y0: y, z0: z, x1: ex, y1: ey, z1: ez, top, crouch, fx, fz };
  s.vel.x = 0; s.vel.y = 0; s.vel.z = 0; s.onGround = false;
  ev.mantled = kind;
  return true;
}
function ease(u) { return u * u * (3 - 2 * u); }
function mantleTick(world, s, m, dt, ev) {
  const mt = s.mantle;
  mt.t += dt;
  const k = Math.min(1, mt.t / mt.dur);
  const lift = mt.top + 0.04;
  if (mt.k === 'mantle') {
    if (k < 0.6) { const u = ease(k / 0.6); s.pos.y = mt.y0 + (lift - mt.y0) * u; s.pos.x = mt.x0 + (mt.x1 - mt.x0) * 0.1 * u; s.pos.z = mt.z0 + (mt.z1 - mt.z0) * 0.1 * u; }
    else { const u = ease((k - 0.6) / 0.4); s.pos.y = lift + (mt.y1 - lift) * u; s.pos.x = mt.x0 + (mt.x1 - mt.x0) * (0.1 + 0.9 * u); s.pos.z = mt.z0 + (mt.z1 - mt.z0) * (0.1 + 0.9 * u); }
  } else {
    if (k < 0.45) { const u = ease(k / 0.45); s.pos.y = mt.y0 + (lift - mt.y0) * u; s.pos.x = mt.x0 + (mt.x1 - mt.x0) * 0.15 * u; s.pos.z = mt.z0 + (mt.z1 - mt.z0) * 0.15 * u; }
    else { const u = (k - 0.45) / 0.55; s.pos.y = lift + (mt.y1 - lift) * u; s.pos.x = mt.x0 + (mt.x1 - mt.x0) * (0.15 + 0.85 * u); s.pos.z = mt.z0 + (mt.z1 - mt.z0) * (0.15 + 0.85 * u); }
  }
  // tuck while climbing (a crouched target keeps it)
  const wantC = mt.crouch ? 1 : (k < 0.85 ? 0.55 : 0);
  s.crouch = (s.crouch || 0) + (wantC - (s.crouch || 0)) * Math.min(1, dt * 12);
  if (k >= 1) {
    s.pos.x = mt.x1; s.pos.y = mt.y1; s.pos.z = mt.z1;
    if (mt.k === 'mantle') {
      s.onGround = true; s.vel.x = mt.fx * 1.2; s.vel.y = 0; s.vel.z = mt.fz * 1.2;
      if (mt.crouch) s.crouch = 1;
      const g = world.groundAt(s.pos.x, s.pos.z, s.pos.y + 0.05, MOVE.radius, G);
      if (g) { s.pos.y = g.y; m.surf = g.surf; m.ground = g.id; }
    } else { s.onGround = false; s.vel.x = mt.fx * 3.2; s.vel.y = 0; s.vel.z = mt.fz * 3.2; m.jumpY = s.pos.y; }
    s.mantle = null;
    m.airT = 0;
  }
  ev.surf = m.surf;
}

// ------------------------------------------------------------------------------------------------ main step
export function moveStep(world, s, cmd, dt, maxSpeed = 5.2, opts) {
  const ev = EV;
  ev.landed = 0; ev.footstep = null; ev.loud = 0; ev.jumped = false; ev.mantled = null; ev.stepUp = 0;
  if (!s.vel) s.vel = { x: 0, y: 0, z: 0 };
  const m = s.mv || (s.mv = newMoveState());
  if (!m.sl) m.sl = {};
  const b = cmd.buttons | 0;
  if (cmd.yaw != null && Number.isFinite(cmd.yaw)) s.yaw = cmd.yaw;
  if (cmd.pitch != null && Number.isFinite(cmd.pitch)) s.pitch = clampN(cmd.pitch, -1.55, 1.55);
  if (!(dt > 0)) { ev.surf = m.surf; return ev; }
  if (!(maxSpeed >= 0)) maxSpeed = 0;

  // timers
  if (s.tagged > 0) s.tagged = Math.max(0, s.tagged - dt);
  if (m.landT > 0) m.landT = Math.max(0, m.landT - dt);
  m.stepOff *= Math.exp(-MOVE.stepSmooth * dt); if (Math.abs(m.stepOff) < 1e-4) m.stepOff = 0;
  let slowMul = 1;
  for (const k in m.sl) { const v = m.sl[k]; v.t -= dt; if (v.t <= 0) delete m.sl[k]; else if (v.m < slowMul) slowMul = v.m; }

  const jumpDown = (b & BTN.JUMP) !== 0, jumpPressed = jumpDown && !m.jumpHeld;
  m.jumpHeld = jumpDown;

  if (s.mantle) { mantleTick(world, s, m, dt, ev); return ev; }

  crouchUpdate(world, s, (b & BTN.CROUCH) !== 0, dt);
  const h = bodyHeight(s);

  // wish direction from the command (mx strafe right, mz forward)
  const yaw = s.yaw || 0, sy = Math.sin(yaw), cy = Math.cos(yaw);
  const mx = clampN(+cmd.mx || 0, -1, 1), mz = clampN(+cmd.mz || 0, -1, 1);
  let wx = sy * mz + cy * mx, wz = cy * mz - sy * mx;
  let wl = Math.hypot(wx, wz);
  if (wl > 1e-6) { wx /= wl; wz /= wl; } else { wx = 0; wz = 0; }
  if (wl > 1) wl = 1;
  let mul = (b & BTN.WALK) ? MOVE.walkMul : 1;
  const cm = 1 - (1 - MOVE.crouchMul) * (s.crouch || 0);
  if (cm < mul) mul = cm;
  mul *= 1 - (1 - MOVE.leanMul) * Math.abs(s.lean || 0);
  if (s.tagged > 0) mul *= 1 - (1 - MOVE.tagMul) * Math.min(1, s.tagged / MOVE.tagTime);
  if (m.landT > 0) mul *= 1 - (1 - MOVE.landSlowMul) * Math.min(1, m.landT / MOVE.landSlowTime);
  mul *= slowMul;
  const wishSpeed = maxSpeed * mul * wl;

  // jump / mantle from the ground
  if (s.onGround && jumpPressed) {
    if (tryMantle(world, s, m, true, ev)) { ev.surf = m.surf; return ev; }
    const ceil = world.ceilingAt(s.pos.x, s.pos.z, s.pos.y + h - 0.01, MOVE.radius * 0.95);
    if (ceil - (s.pos.y + h) > 0.08) {
      s.vel.y = MOVE.jumpV; s.onGround = false; m.jumpY = s.pos.y; m.airT = 0; ev.jumped = true;
    }
  }

  if (s.onGround) {
    friction(s, dt);
    accelerate(s, wx, wz, wishSpeed, MOVE.accel, dt);
    s.vel.y = 0;
  } else {
    airAccelerate(s, wx, wz, wishSpeed, dt);
    s.vel.y -= MOVE.gravity * dt;
    if (s.vel.y < -MOVE.maxFall) s.vel.y = -MOVE.maxFall;
    m.airT += dt;
  }

  // horizontal move with sliding
  const ox = s.pos.x, oz = s.pos.z;
  slideMove(world, s, m, dt, h, opts && opts.bodies);
  s.pos.x = P.x; s.pos.z = P.z;

  if (s.onGround) {
    // follow the ground: step up onto low things, snap down stairs and ramps, walk off ledges
    const g = world.groundAt(s.pos.x, s.pos.z, s.pos.y + MOVE.step + 1e-3, MOVE.radius, G);
    if (g && g.y >= s.pos.y - MOVE.snapDown) {
      const rise = g.y - s.pos.y;
      if (g.ny < MOVE.maxSlopeNY && rise > 0.01) {
        // too steep to walk up: undo the move and slide along the slope
        s.pos.x = ox; s.pos.z = oz;
        const hl = Math.hypot(g.nx, g.nz) || 1, nx = g.nx / hl, nz = g.nz / hl;
        const vn = s.vel.x * nx + s.vel.z * nz; if (vn < 0) { s.vel.x -= vn * nx; s.vel.z -= vn * nz; }
      } else if (g.ny < MOVE.maxSlopeNY) {
        s.onGround = false; m.jumpY = s.pos.y; m.airT = 0;     // standing on something steep: slide off it
      } else {
        if (rise > 1e-3) { ev.stepUp = rise; if (rise > 0.06) m.stepOff -= rise; }
        else if (rise < -0.06) m.stepOff -= rise * 0.6;
        s.pos.y = g.y; m.surf = g.surf; m.ground = g.id;
      }
    } else { s.onGround = false; m.jumpY = s.pos.y; m.airT = 0; }
  }

  if (!s.onGround) {
    const vy = s.vel.y;
    let ny = s.pos.y + vy * dt;
    if (vy <= 0) {
      const g = world.groundAt(s.pos.x, s.pos.z, s.pos.y + MOVE.airStep, MOVE.radius, G);
      if (g && ny <= g.y) {
        if (g.ny >= MOVE.maxSlopeNY) {
          ny = g.y;
          const fall = -vy;
          s.onGround = true; s.vel.y = 0; m.surf = g.surf; m.ground = g.id;
          if (m.airT > 0.05 || fall > 2) {
            ev.landed = fall;
            if (fall > 3) m.landT = MOVE.landSlowTime * Math.min(1, (fall - 3) / 3);
            if (fall > 2.5) m.stepOff -= Math.min(0.12, fall * 0.012);   // landing dip
            const sp = Math.hypot(s.vel.x, s.vel.z), cap = Math.max(maxSpeed, 0.1) * MOVE.bhopCap;
            if (sp > cap) { s.vel.x *= cap / sp; s.vel.z *= cap / sp; }
          }
        } else {
          // steep surface: stay airborne and slide along it
          ny = g.y + 1e-3;
          const vn = s.vel.x * g.nx + s.vel.y * g.ny + s.vel.z * g.nz;
          if (vn < 0) { s.vel.x -= vn * g.nx; s.vel.y -= vn * g.ny; s.vel.z -= vn * g.nz; }
        }
      }
    } else {
      const ceil = world.ceilingAt(s.pos.x, s.pos.z, s.pos.y + h - 1e-3, MOVE.radius * 0.98);
      if (ny + h > ceil) { ny = Math.max(s.pos.y, ceil - h - 1e-3); s.vel.y = 0; }
    }
    s.pos.y = ny;
    // jumping into a ledge while holding jump: climb it
    if (!s.onGround && jumpDown && m.hit) {
      const fx = Math.sin(yaw), fz = Math.cos(yaw);
      if (m.hitNx * fx + m.hitNz * fz < -0.45 && tryMantle(world, s, m, false, ev)) { ev.surf = m.surf; return ev; }
    }
  }

  // lean (blocked by walls, only on the ground)
  let lt = ((b & BTN.LEANR) ? 1 : 0) - ((b & BTN.LEANL) ? 1 : 0);
  if (!s.onGround) lt = 0;
  let lean = s.lean || 0;
  const ls = MOVE.leanRate * dt;
  lean = lean < lt ? Math.min(lt, lean + ls) : Math.max(lt, lean - ls);
  if (lean !== 0) {
    const lim = leanLimit(world, s, lean > 0 ? 1 : -1, s.pos.y + eyeHeight(s));
    if (Math.abs(lean) > lim) lean = lean > 0 ? lim : -lim;
  }
  s.lean = Math.abs(lean) < 1e-4 ? 0 : lean;

  // footsteps (walking and crouching are silent)
  if (s.onGround) {
    const sp = Math.hypot(s.vel.x, s.vel.z);
    const loudSpeed = Math.max(maxSpeed, 0.5) * MOVE.silentFrac;
    if (sp > loudSpeed && (s.crouch || 0) < 0.5 && !(b & BTN.WALK)) {
      m.stepD += sp * dt;
      if (m.stepD >= MOVE.stride) { m.stepD -= MOVE.stride; ev.footstep = m.surf; ev.loud = clampN(sp / Math.max(maxSpeed, 0.5), 0, 1); }
    } else if (m.stepD > MOVE.stride * 0.6) m.stepD = MOVE.stride * 0.6;
  }
  ev.surf = m.surf;
  return ev;
}
