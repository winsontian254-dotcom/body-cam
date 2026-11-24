/* LIVE FIRE — first-person hands and arms for the viewmodel: the owner's gloved hands (assets/models/hand_grip.glb = fist closed
   round a vertical grip, hand_hold.glb = fist round a horizontal handle; the left hand is the mirror image) with sleeves,
   forearms and upper arms solved by two-bone IK from fixed shoulder points in camera space to the glove's wrist (cuff) point.
   Only the 'glove' mesh of the two files is used (their cuff block, neon accent and sleeve stub belong to Neon Veins).
   Glove-local axes (as the files are authored, after the glTF handedness flip): origin = palm centre on the grip / handle axis,
   +Y up the grip (grip) or toward the back of the hand (hold), +Z forward (toward the muzzle). This is exactly the frame of
   GunModel.hands.right / .left, the melee hands.right and the grenade nodes.grip, so a glove sits on a frame with identity.
   Exports:
     loadHandGeo(scene) -> Promise<{ grip, hold, grip_L, hold_L }>   geometry ({ p, n, i } typed arrays), loaded once per page
     handGeoReady() -> bool
     WRIST = { grip: [x, y, z], hold: [x, y, z] }                    glove-local wrist points of the RIGHT hand (mirror x for left)
     class Hands  new Hands(scene, parent (TransformNode: the viewmodel root, camera space), { group })
       setLook(p)                      glove / sleeve colours + camo from js/chars/looks.js lookFor(p)
       pose(side 'R'|'L', kind 'grip'|'hold'|null, matrix (BABYLON.Matrix: glove frame in PARENT space) | null)
                                       null kind hides that hand and arm
       update()                        rebuild the arms from the current hand poses (call once per frame after pose())
       setEnabled(on), meshes(), dispose()
     frameOf(node, parentInv, out) -> out   world matrix of `node` expressed in the parent space (helper for the viewmodel)
     blendFrames(a, b, k, out) -> out       position lerp + rotation slerp of two frames (matrices without scale)
   Rendering: renderingGroupId = group (1: drawn after the world with a cleared depth buffer, like the gun). */
import { lookFor } from '../chars/looks.js';

const MODELS = 'assets/models/';
export const WRIST = { grip: [0.057, -0.004, -0.132], hold: [0.0585, 0.1105, -0.004] };
// camera-space shoulders, arm lengths (upper arm, forearm to the cuff) and the IK pole per side
const ARM = {
  R: { sh: [0.2, -0.27, -0.07], pole: [0.75, -1, -0.25], a: 0.31, b: 0.27 },
  L: { sh: [-0.16, -0.25, 0.0], pole: [-0.45, -1, -0.15], a: 0.31, b: 0.27 },
};

let GEO = null, GEO_P = null;
export const handGeoReady = () => !!GEO;

async function loadGlove(scene, file) {
  const BB = BABYLON;
  const c = await BB.SceneLoader.LoadAssetContainerAsync(MODELS, file, scene);
  let out = null;
  try {
    for (const m of c.meshes) {
      if (!m.getTotalVertices || !m.getTotalVertices()) continue;
      if (!/glove/i.test(m.name)) continue;
      const vd = BB.VertexData.ExtractFromMesh(m, true, true);
      const W = m.computeWorldMatrix(true);
      vd.transform(W);                                    // bakes the glTF root flip: game axes
      const p = Float32Array.from(vd.positions), i = Uint32Array.from(vd.indices);
      const n = new Float32Array(p.length);
      BB.VertexData.ComputeNormals(p, i, n);
      out = { p, n, i };
      break;
    }
  } finally { c.dispose(); }
  if (!out) throw new Error('no glove mesh in ' + file);
  return out;
}
/** the winding must make outward normals agree with ComputeNormals for Babylon's culling: check against a sphere */
function windingOK(g) {
  // average dot of the face normal with the direction from the centroid: positive = outward (CCW in Babylon's convention)
  let cx = 0, cy = 0, cz = 0; const p = g.p, nv = p.length / 3;
  for (let k = 0; k < p.length; k += 3) { cx += p[k]; cy += p[k + 1]; cz += p[k + 2]; }
  cx /= nv; cy /= nv; cz /= nv;
  let s = 0;
  for (let k = 0; k < g.i.length; k += 3) {
    const a = g.i[k] * 3, b = g.i[k + 1] * 3, c = g.i[k + 2] * 3;
    const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2], vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    s += nx * (p[a] - cx) + ny * (p[a + 1] - cy) + nz * (p[a + 2] - cz);
  }
  return s;
}
function flip(g) { for (let k = 0; k < g.i.length; k += 3) { const t = g.i[k + 1]; g.i[k + 1] = g.i[k + 2]; g.i[k + 2] = t; } }
function mirror(g) {
  const o = { p: Float32Array.from(g.p), n: Float32Array.from(g.n), i: Uint32Array.from(g.i) };
  for (let k = 0; k < o.p.length; k += 3) { o.p[k] = -o.p[k]; o.n[k] = -o.n[k]; }
  flip(o); return o;
}
export function loadHandGeo(scene) {
  if (GEO) return Promise.resolve(GEO);
  if (GEO_P) return GEO_P;
  GEO_P = (async () => {
    const [grip, hold] = await Promise.all([loadGlove(scene, 'hand_grip.glb'), loadGlove(scene, 'hand_hold.glb')]);
    // Babylon (left-handed) culls clockwise front faces: a closed outward mesh must give a NEGATIVE sum with this test
    // (the sign is checked against Babylon's own sphere below), so the gloves never render inside-out.
    const sph = BABYLON.VertexData.CreateSphere({ diameter: 1, segments: 6 });
    const ref = Math.sign(windingOK({ p: sph.positions, i: sph.indices }));
    for (const g of [grip, hold]) { if (Math.sign(windingOK(g)) !== ref) flip(g); BABYLON.VertexData.ComputeNormals(g.p, g.i, g.n); }
    GEO = { grip, hold, grip_L: mirror(grip), hold_L: mirror(hold) };
    for (const k of ['grip_L', 'hold_L']) { const g = GEO[k]; if (Math.sign(windingOK(g)) !== ref) flip(g); BABYLON.VertexData.ComputeNormals(g.p, g.i, g.n); }
    return GEO;
  })().catch(e => { GEO_P = null; throw e; });
  return GEO_P;
}

// ------------------------------------------------------------------------------------------------ small math (plain arrays)
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len = a => Math.hypot(a[0], a[1], a[2]);
const nrm = a => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const madd = (a, b, k) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
/** two-bone IK: shoulder s, wrist w, lengths a, b, pole direction -> elbow */
function ik2(s, w, a, b, pole) {
  const d0 = sub(w, s); let d = len(d0); const dir = nrm(d0);
  d = Math.min(Math.max(d, Math.abs(a - b) + 1e-3), a + b - 1e-3);
  const x = (a * a - b * b + d * d) / (2 * d), h = Math.sqrt(Math.max(0, a * a - x * x));
  let pp = madd(pole, dir, -dot(pole, dir)); if (len(pp) < 1e-5) pp = [0, -1, 0];
  pp = nrm(pp);
  return [s[0] + dir[0] * x + pp[0] * h, s[1] + dir[1] * x + pp[1] * h, s[2] + dir[2] * x + pp[2] * h];
}

const TMPQ = () => new BABYLON.Quaternion();
/** node world matrix in the space whose world matrix inverse is `parentInv` */
export function frameOf(node, parentInv, out) {
  node.computeWorldMatrix(true);
  node.getWorldMatrix().multiplyToRef(parentInv, out);
  return out;
}
const _s = { a: null, b: null };
/** blend two rigid frames (no scale): out = lerp(pos) + slerp(rot) */
export function blendFrames(a, b, k, out) {
  const B = BABYLON;
  if (!_s.a) { _s.a = { s: new B.Vector3(), q: new B.Quaternion(), t: new B.Vector3() }; _s.b = { s: new B.Vector3(), q: new B.Quaternion(), t: new B.Vector3() }; _s.q = new B.Quaternion(); _s.t = new B.Vector3(); }
  if (k <= 0) { out.copyFrom(a); return out; } if (k >= 1) { out.copyFrom(b); return out; }
  a.decompose(_s.a.s, _s.a.q, _s.a.t); b.decompose(_s.b.s, _s.b.q, _s.b.t);
  B.Quaternion.SlerpToRef(_s.a.q, _s.b.q, k, _s.q);
  B.Vector3.LerpToRef(_s.a.t, _s.b.t, k, _s.t);
  B.Matrix.ComposeToRef(B.Vector3.OneReadOnly, _s.q, _s.t, out);
  return out;
}

// sleeve camo (a small tileable canvas per look)
function camoCanvas(top, size = 128) {
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  const g = cv.getContext('2d'), c = top.c; let s = 0x9e3779b9;
  const r = () => { s = (Math.imul(s ^ (s >>> 15), 2246822519) + 0x6d2b79f5) >>> 0; return s / 4294967296; };
  g.fillStyle = c[0]; g.fillRect(0, 0, size, size);
  if (top.kind === 1) {
    for (let k = 1; k < 4; k++) for (let i = 0; i < 9; i++) {
      g.fillStyle = c[k]; const x = r() * size, y = r() * size, rx = size * (0.05 + r() * 0.1), ry = size * (0.03 + r() * 0.07);
      for (const ox of [-size, 0, size]) for (const oy of [-size, 0, size]) { g.beginPath(); g.ellipse(x + ox, y + oy, rx, ry, r() * 3, 0, 6.283); g.fill(); }
    }
  } else if (top.kind === 2) {
    const q = size / 32;
    for (let k = 1; k < 4; k++) for (let i = 0; i < 70; i++) { g.fillStyle = c[k]; const x = Math.floor(r() * 32) * q, y = Math.floor(r() * 32) * q; g.fillRect(x, y, q * (1 + Math.floor(r() * 3)), q * (1 + Math.floor(r() * 2))); }
  }
  // weave: fine noise so a flat colour still reads as cloth
  const img = g.getImageData(0, 0, size, size), d = img.data;
  for (let k = 0; k < d.length; k += 4) { const n = ((k >> 2) % size + ((k >> 2) / size | 0)) & 1 ? 0.94 : 1.04, j = 0.92 + r() * 0.14; d[k] *= n * j; d[k + 1] *= n * j; d[k + 2] *= n * j; }
  g.putImageData(img, 0, 0);
  return cv;
}

export class Hands {
  constructor(scene, parent, o = {}) {
    const B = BABYLON;
    this.scene = scene; this.parent = parent; this.group = o.group ?? 1;
    this.ok = false; this.on = true; this.lookKey = '';
    this.root = new B.TransformNode('vmHands', scene); this.root.parent = parent;
    this.gloveMat = new B.PBRMaterial('vmGlove', scene);
    this.gloveMat.albedoColor = B.Color3.FromHexString('#2a2724').toLinearSpace(); this.gloveMat.metallic = 0; this.gloveMat.roughness = 0.82;
    this.gloveMat.maxSimultaneousLights = 6;
    this.sleeveMat = new B.PBRMaterial('vmSleeve', scene);
    this.sleeveMat.albedoColor = new B.Color3(1, 1, 1); this.sleeveMat.metallic = 0; this.sleeveMat.roughness = 0.93;
    this.sleeveMat.maxSimultaneousLights = 6;
    this.cuffMat = new B.PBRMaterial('vmCuff', scene);
    this.cuffMat.albedoColor = new B.Color3(0.05, 0.05, 0.055); this.cuffMat.metallic = 0; this.cuffMat.roughness = 0.7;
    this.side = { R: this.makeSide('R'), L: this.makeSide('L') };
    this.inv = new B.Matrix(); this.tmp = new B.Matrix(); this.q = TMPQ(); this.v = new B.Vector3();
    this.ready = loadHandGeo(scene).then(G => { if (this.disposed) return; this.build(G); }).catch(e => { console.warn('[hands] gloves not loaded:', e && e.message); });
  }
  makeSide(S) {
    const B = BABYLON, scene = this.scene;
    const tube = (name, d0, d1, mat) => {
      const m = B.MeshBuilder.CreateCylinder(name, { height: 1, diameterTop: d0, diameterBottom: d1, tessellation: 14, subdivisions: 1, cap: B.Mesh.CAP_ALL }, scene);
      m.material = mat; m.parent = this.root; m.isPickable = false; m.renderingGroupId = this.group; m.alwaysSelectAsActiveMesh = true; m.receiveShadows = false;
      m.rotationQuaternion = new B.Quaternion(); m.setEnabled(false);
      return m;
    };
    return {
      S, kind: null, M: new B.Matrix(), gloves: {},
      fore: tube('vmFore' + S, 0.074, 0.098, this.sleeveMat),      // top = wrist end (y +.5), bottom = elbow end
      cuff: tube('vmCuff' + S, 0.071, 0.077, this.cuffMat),
      upper: tube('vmUpper' + S, 0.1, 0.11, this.sleeveMat),
    };
  }
  build(G) {
    const B = BABYLON;
    for (const S of ['R', 'L']) for (const k of ['grip', 'hold']) {
      const g = G[S === 'L' ? k + '_L' : k];
      const m = new B.Mesh('vmGlove' + S + k, this.scene), vd = new B.VertexData();
      vd.positions = g.p; vd.normals = g.n; vd.indices = g.i; vd.applyToMesh(m);
      m.material = this.gloveMat; m.parent = this.root; m.isPickable = false; m.renderingGroupId = this.group; m.alwaysSelectAsActiveMesh = true;
      m.receiveShadows = false; m.rotationQuaternion = new B.Quaternion(); m.setEnabled(false);
      this.side[S].gloves[k] = m;
    }
    this.ok = true;
  }
  meshes() { const out = []; for (const S of ['R', 'L']) { const s = this.side[S]; out.push(s.fore, s.cuff, s.upper, ...Object.values(s.gloves)); } return out; }
  setLook(p) {
    if (!p) return;
    const look = lookFor(p), key = look.key;
    if (key === this.lookKey) return; this.lookKey = key;
    const B = BABYLON, v = look.variant;
    this.gloveMat.albedoColor = B.Color3.FromHexString(v.glove).toLinearSpace();
    if (this.sleeveTex) { this.sleeveTex.dispose(); this.sleeveTex = null; }
    try {
      const cv = camoCanvas(v.top), t = new B.DynamicTexture('vmSleeveTex', { width: cv.width, height: cv.height }, this.scene, true);
      t.getContext().drawImage(cv, 0, 0); t.update(true); t.uScale = 2; t.vScale = 3;
      this.sleeveTex = t; this.sleeveMat.albedoTexture = t; this.sleeveMat.albedoColor = new B.Color3(1, 1, 1);
    } catch (e) { this.sleeveMat.albedoColor = B.Color3.FromHexString(v.top.c[0]).toLinearSpace(); }
  }
  /** M = glove frame in parent (camera) space; kind null hides the hand */
  pose(S, kind, M) {
    const s = this.side[S];
    s.kind = kind && M ? kind : null;
    if (s.kind) s.M.copyFrom(M);
  }
  setEnabled(on) { this.on = on; this.root.setEnabled(on); }
  update() {
    const B = BABYLON;
    for (const S of ['R', 'L']) {
      const s = this.side[S], show = this.on && this.ok && !!s.kind;
      for (const k in s.gloves) s.gloves[k].setEnabled(show && k === s.kind);
      s.fore.setEnabled(show); s.cuff.setEnabled(show); s.upper.setEnabled(show);
      if (!show) continue;
      const g = s.gloves[s.kind];
      s.M.decompose(this.v, g.rotationQuaternion, g.position);
      // wrist (cuff) point in parent space
      const w0 = WRIST[s.kind], wl = B.Vector3.TransformCoordinatesFromFloatsToRef(S === 'L' ? -w0[0] : w0[0], w0[1], w0[2], s.M, this.wv || (this.wv = new B.Vector3()));
      const W = [wl.x, wl.y, wl.z], A = ARM[S];
      // the forearm leaves the cuff along the glove's own wrist axis first: aim the elbow solve at a point a little behind it
      const E = ik2(A.sh, W, A.a, A.b, A.pole);
      this.seg(s.fore, W, E, 1, 0.0);
      this.seg(s.upper, E, A.sh, 1, -0.02);
      // cuff: a short band from the wrist toward the elbow
      const d = nrm(sub(E, W));
      this.seg(s.cuff, madd(W, d, -0.012), madd(W, d, 0.045), 1, 0);
    }
  }
  /** place a unit cylinder (along +Y, centred) from a (its top) to b (its bottom) */
  seg(m, a, b, sc, ext) {
    const B = BABYLON, d = sub(a, b), L = len(d), u = nrm(d);
    m.position.set((a[0] + b[0]) / 2 + u[0] * ext * 0.5, (a[1] + b[1]) / 2 + u[1] * ext * 0.5, (a[2] + b[2]) / 2 + u[2] * ext * 0.5);
    m.scaling.set(sc, L + Math.abs(ext), sc);
    // rotation taking +Y to u
    const ax = [-u[2], 0, u[0]], c = u[1];          // cross(Y, u) = (u.z, 0, -u.x) with Y = (0,1,0): (1*u.z - 0, 0, 0 - 1*u.x)
    ax[0] = u[2]; ax[2] = -u[0];
    const sl = Math.hypot(ax[0], ax[2]);
    if (sl < 1e-6) { B.Quaternion.FromEulerAnglesToRef(c > 0 ? 0 : Math.PI, 0, 0, m.rotationQuaternion); return; }
    const ang = Math.atan2(sl, c);
    B.Quaternion.RotationAxisToRef(this.v.set(ax[0] / sl, 0, ax[2] / sl), ang, m.rotationQuaternion);
  }
  dispose() {
    this.disposed = true;
    for (const m of this.meshes()) m.dispose();
    this.root.dispose();
    this.gloveMat.dispose(); this.sleeveMat.dispose(); this.cuffMat.dispose();
    if (this.sleeveTex) this.sleeveTex.dispose();
  }
}
