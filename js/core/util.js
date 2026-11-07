/* LIVE FIRE — small shared helpers (pure JS; el() is the only one that touches the DOM, and only when called).
   Exports:
     DEG, RAD, TAU                       degree/radian factors, 2*PI
     clamp(v, a, b), lerp(a, b, t), invLerp(a, b, v), smoothstep(a, b, v), damp(a, b, lambda, dt)
     wrapAngle(a) -> (-PI, PI], angleDiff(a, b) -> shortest b - a, lerpAngle(a, b, t), dampAngle(a, b, lambda, dt)
     rand(seed) -> () => [0,1)  (mulberry32), randRange(r, a, b), randInt(r, a, b), pick(r, arr), shuffle(r, arr)
     hash(str) -> uint32 (FNV-1a), uid(prefix?) -> short unique id
     lookDir(yaw, pitch, out?) -> {x,y,z}  (pitch POSITIVE = looking down, +Z forward at yaw 0)
     forward2(yaw, out?) -> {x,z}, right2(yaw, out?) -> {x,z}
     vfov43(hfovDeg) -> vertical fov (radians) for a CS-style horizontal fov measured at 4:3 (hor+ on wider screens)
     dist2(ax, az, bx, bz), dist3(a, b)
     el(tag, cls?, html?) -> HTMLElement, fmtTime(seconds) -> 'm:ss', fmtNum(n)
*/

export const DEG = Math.PI / 180, RAD = 180 / Math.PI, TAU = Math.PI * 2;

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => (b === a ? 0 : (v - a) / (b - a));
export function smoothstep(a, b, v) { const t = clamp(invLerp(a, b, v), 0, 1); return t * t * (3 - 2 * t); }
/** Frame-rate independent exponential approach of a towards b (lambda = 1/s). */
export const damp = (a, b, lambda, dt) => a + (b - a) * (1 - Math.exp(-lambda * dt));

export function wrapAngle(a) { a = (a + Math.PI) % TAU; if (a <= 0) a += TAU; return a - Math.PI; }
export const angleDiff = (a, b) => wrapAngle(b - a);
export const lerpAngle = (a, b, t) => a + angleDiff(a, b) * t;
export const dampAngle = (a, b, lambda, dt) => a + angleDiff(a, b) * (1 - Math.exp(-lambda * dt));

/** mulberry32: fast, good-quality seeded PRNG. */
export function rand(seed = 1) {
  let a = (seed >>> 0) || 0x9e3779b9;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const randRange = (r, a, b) => a + (b - a) * r();
export const randInt = (r, a, b) => a + Math.floor(r() * (b - a + 1));   // inclusive
export const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
export function shuffle(r, arr) { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = arr[i]; arr[i] = arr[j]; arr[j] = t; } return arr; }

export function hash(str) {
  let h = 0x811c9dc5; str = String(str);
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
let _uid = 0;
export const uid = (prefix = '') => prefix + (Date.now() % 1e8).toString(36) + (++_uid).toString(36) + Math.floor(Math.random() * 1296).toString(36);

export function lookDir(yaw, pitch, out = { x: 0, y: 0, z: 0 }) {
  const cp = Math.cos(pitch);
  out.x = Math.sin(yaw) * cp; out.y = -Math.sin(pitch); out.z = Math.cos(yaw) * cp; return out;
}
export function forward2(yaw, out = { x: 0, z: 0 }) { out.x = Math.sin(yaw); out.z = Math.cos(yaw); return out; }
export function right2(yaw, out = { x: 0, z: 0 }) { out.x = Math.cos(yaw); out.z = -Math.sin(yaw); return out; }

/** CS-style FOV: the setting is the horizontal FOV of a 4:3 screen; Babylon wants the vertical FOV (fixed), which
    gives hor+ widening on 16:9 and wider screens. 90 -> 73.7 degrees vertical. */
export const vfov43 = hfovDeg => 2 * Math.atan(Math.tan(clamp(hfovDeg, 40, 130) * DEG / 2) * 0.75);

export const dist2 = (ax, az, bx, bz) => Math.hypot(bx - ax, bz - az);
export const dist3 = (a, b) => Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);

export function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}
export function fmtTime(s) {
  s = Math.max(0, Math.ceil(+s || 0));
  const m = Math.floor(s / 60), r = s % 60; return m + ':' + (r < 10 ? '0' : '') + r;
}
export const fmtNum = n => (+n || 0).toLocaleString('en-US');
