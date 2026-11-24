/* LIVE FIRE — recoil: spray patterns (data.js recoil.pattern, learnable: the same gun climbs the same way every spray), the
   random jitter on top, recovery of the aim offset and spray index, first-shot accuracy, weapon sway with breath hold, the
   bipod factor and the camera view-punch / viewmodel kick impulses. PURE JS (no BABYLON): weapon.js (simulation, every
   authority), camera.js and viewmodel.js (presentation) all read it, so bullets and what you see agree.
   Conventions: aim offsets ax / ay in DEGREES (x right, y up), added to the view yaw / subtracted from the pitch; sway in radians.
   Exports:
     RECOIL_VIEW                share of the aim offset the camera follows (bullets follow all of it): the rest you pull down
     FIRST_SHOT                 cone multiplier of a rested first shot ({ hip, ads })
     sprayStep(st, ws, rng, k = 1)   applies one shot of the pattern + jitter to ws.ax / ws.ay (k = bipod / stance factor),
                                advances ws.shots; returns [dx, dy] (degrees) that was added
     recoverAim(ws, st, dt)     exponential return of ax / ay / shots / bloom at recoil.recover once the gun has stopped firing
     firstShotK(ws, st, moving) cone multiplier for the next shot (first-shot accuracy after a pause, only when not moving fast)
     swayAt(st, ws, p, out)     weapon sway right now (rad: { x right, y up }) from st.breath, ADS, stance, movement, breath hold
     breathTick(ws, st, hold, ads, dt)   breath-hold state: ws.brH (seconds held), ws.brOut (recovery left), ws.brK (sway factor)
     viewPunch(st, ads, rng)    { p, y, r } camera punch impulse (DEGREES / s of the punch spring velocity)
     vmKick(st, ads, rng)       { z, y, x, rx, ry, rz } viewmodel spring impulses
     patternPreview(st, n)      [[x, y]...] cumulative aim offsets of n shots with no jitter (armory / tests)
   The pattern data: recoil.pattern[i] = [dx, dy] (deg) added after shot i; recoil.loop = how many last steps repeat (mirrored x)
   past the end (data.js recoilStep), recoil.random = jitter half-width (deg), recoil.recover = 1/s, recoil.kick = camera punch. */
import { recoilStep, fireInterval } from './data.js';

export const RECOIL_VIEW = 0.5;
export const FIRST_SHOT = { hip: 0.7, ads: 0.45 };

export function sprayStep(st, ws, rng, k = 1) {
  const step = recoilStep(st, Math.floor(ws.shots));
  const rnd = (st.recoil && st.recoil.random) || 0;
  const dx = (step[0] + (rng() * 2 - 1) * rnd) * k, dy = (step[1] + (rng() * 2 - 1) * rnd * 0.5) * k;
  ws.ax += dx; ws.ay += dy; ws.shots += 1;
  ws.bloom = Math.min(ws.bloom + ((st.spread && st.spread.shot) || 0), (st.spread && st.spread.max) || 0.1);
  return [dx, dy];
}

export function recoverAim(ws, st, dt) {
  const rec = st && st.recoil ? st.recoil.recover || 6 : 6;
  const iv = st ? fireInterval(st) : 0.1;
  ws.bloom *= Math.exp(-rec * dt);
  if (ws.since > iv + 0.02) {
    const k = Math.exp(-rec * dt);
    ws.ax *= k; ws.ay *= k; ws.shots *= k;
    if (ws.shots < 0.05) ws.shots = 0;
    if (Math.abs(ws.ax) < 1e-4) ws.ax = 0;
    if (Math.abs(ws.ay) < 1e-4) ws.ay = 0;
  }
}

/** a rested first shot is more accurate: after 1.5 x the fire interval (min .22 s) with the spray index back to 0 */
export function firstShotK(ws, st, moving) {
  if (moving || ws.shots > 0.35) return 1;
  const iv = st ? fireInterval(st) : 0.1;
  if (ws.since < Math.max(0.22, iv * 1.5)) return 1;
  return FIRST_SHOT.hip + (FIRST_SHOT.ads - FIRST_SHOT.hip) * (ws.ads || 0);
}

const BREATH = { hold: 0.1, tired: 2.2, recover: 2.5 };
/** hold = the breath key is down; returns ws.brK (sway factor: .1 holding, 2.2 when it runs out, 1 normal) */
export function breathTick(ws, st, hold, ads, dt) {
  const max = st && st.breath ? st.breath.hold || 0 : 0;
  if (ws.brH == null) { ws.brH = 0; ws.brOut = 0; ws.brK = 1; }
  if (ws.brOut > 0) { ws.brOut = Math.max(0, ws.brOut - dt); hold = false; }
  if (hold && max > 0 && ads > 0.8) {
    ws.brH += dt;
    if (ws.brH >= max) { ws.brOut = BREATH.recover; ws.brH = 0; }
  } else ws.brH = Math.max(0, ws.brH - dt * 2);
  const target = ws.brOut > 0 ? BREATH.tired : (hold && max > 0 && ads > 0.8 && ws.brH > 0 ? BREATH.hold : 1);
  ws.brK += (target - ws.brK) * Math.min(1, dt * (target < ws.brK ? 6 : 2.5));
  return ws.brK;
}

/** sway (rad) on two incommensurate figure-eights: larger when moving, smaller crouched, scaled by the breath factor */
export function swayAt(st, ws, p, out = { x: 0, y: 0 }) {
  const sw = st && st.breath ? st.breath.sway || 0 : 0, t = ws.swT || 0;
  if (!sw) { out.x = 0; out.y = 0; return out; }
  const spd = p ? Math.hypot(p.vel.x, p.vel.z) : 0;
  const stance = p ? 1 - 0.45 * (p.crouch || 0) : 1;
  const moveK = 1 + Math.min(2.5, spd * 0.5);
  const bip = ws.bip ? 0.15 : 1;
  const A = sw * (0.35 + 0.65 * (ws.ads || 0)) * stance * moveK * (ws.brK ?? 1) * bip;
  out.x = A * (Math.sin(t * 0.83) * 0.8 + Math.sin(t * 2.07 + 1.1) * 0.25);
  out.y = A * (Math.sin(t * 1.66 + 0.4) * 0.55 + Math.cos(t * 0.51) * 0.45);
  return out;
}

export function viewPunch(st, ads, rng) {
  const k = (st && st.recoil && st.recoil.kick) || 1, a = 1 - 0.35 * (ads || 0);
  return { p: k * (13 + 6 * rng()) * a, y: k * (rng() * 2 - 1) * 5 * a, r: k * (rng() * 2 - 1) * 3 };
}

export function vmKick(st, ads, rng) {
  const k = (st && st.recoil && st.recoil.kick) || 1, heavy = Math.min(1.6, Math.max(0.4, ((st && st.weight) || 3) / 4));
  const s = 1 - 0.45 * (ads || 0), h = 1 / Math.sqrt(heavy);
  return { z: -(0.55 + 0.25 * k) * s * h, y: 0.05 * k * s, x: (rng() - 0.5) * 0.08 * s, rx: -(1.8 + 1.1 * k) * s * h, ry: (rng() - 0.5) * 0.6 * k * s, rz: (rng() - 0.5) * 1.2 * k * s };
}

export function patternPreview(st, n) {
  const out = []; let x = 0, y = 0;
  for (let i = 0; i < n; i++) { out.push([x, y]); const s = recoilStep(st, i); x += s[0]; y += s[1]; }
  return out;
}
