/* LIVE FIRE — hitbox debug overlay (dev hash &hitboxes): the 15 hitbox.js capsules of every live player, drawn as see-through
   coloured capsules over the characters (red head, orange neck, yellow chest / stomach, cyan arms, green legs), so you can check
   that the body sits in them in every pose. Thin instances of one capsule mesh (one draw call).
   Exports:
     class HitboxOverlay   new HitboxOverlay(scene); reset(); player(p, stamp); flush(); dispose(); enabled */
import { hitboxesOf, NSHAPE, STRIDE, SHAPES } from '../game/hitbox.js';

const COL = { head: [1, 0.15, 0.1], neck: [1, 0.55, 0.1], chest: [1, 0.9, 0.15], stomach: [0.95, 0.75, 0.2], arm: [0.2, 0.85, 1], leg: [0.3, 1, 0.35] };

export class HitboxOverlay {
  constructor(scene) {
    const BB = BABYLON;
    this.enabled = true;
    const m = this.mesh = BB.MeshBuilder.CreateCapsule('lfHitboxes', { radius: 0.5, height: 2, tessellation: 12, subdivisions: 1, capSubdivisions: 4 }, scene);
    const mt = new BB.StandardMaterial('lfHitboxesM', scene);
    mt.diffuseColor = BB.Color3.Black(); mt.specularColor = BB.Color3.Black(); mt.emissiveColor = new BB.Color3(1, 1, 1);
    mt.alpha = 0.32; mt.disableLighting = true; mt.backFaceCulling = false; mt.disableDepthWrite = true; mt.wireframe = false;
    m.material = mt; m.isPickable = false; m.alwaysSelectAsActiveMesh = true; m.renderingGroupId = 1;
    m.useVertexColors = false;
    this.cap = 64 * NSHAPE; this.n = 0;
    this.m4 = new Float32Array(this.cap * 16); this.col = new Float32Array(this.cap * 4);
    m.thinInstanceSetBuffer('matrix', this.m4, 16, false); m.thinInstanceSetBuffer('color', this.col, 4, false);
    m.thinInstanceCount = 0;
    // wire outline on top for crisp edges
    const w = this.wire = m.clone('lfHitboxesW'); w.makeGeometryUnique();
    const wm = mt.clone('lfHitboxesWM'); wm.wireframe = true; wm.alpha = 0.55; w.material = wm;
    w.thinInstanceSetBuffer('matrix', this.m4, 16, false); w.thinInstanceSetBuffer('color', this.col, 4, false); w.thinInstanceCount = 0;
  }
  reset() { this.n = 0; }
  player(p, stamp) {
    if (!p.alive) return;
    const S = hitboxesOf(p, stamp);
    for (let k = 0; k < NSHAPE; k++) {
      if (this.n >= this.cap) return;
      const o = k * STRIDE, c = COL[SHAPES[k].group] || [1, 1, 1];
      capsule(this.m4, this.n * 16, S[o], S[o + 1], S[o + 2], S[o + 3], S[o + 4], S[o + 5], S[o + 6]);
      const q = this.n * 4; this.col[q] = c[0]; this.col[q + 1] = c[1]; this.col[q + 2] = c[2]; this.col[q + 3] = 1;
      this.n++;
    }
  }
  flush() {
    for (const m of [this.mesh, this.wire]) {
      m.thinInstanceCount = this.enabled ? this.n : 0; m.isVisible = this.enabled && this.n > 0;
      if (this.n) { m.thinInstanceBufferUpdated('matrix'); m.thinInstanceBufferUpdated('color'); }
    }
  }
  dispose() { for (const m of [this.mesh, this.wire]) { m.material.dispose(); m.dispose(); } }
}
/** unit capsule (radius .5, height 2 along y) -> capsule a-b radius r (same maths as bodies.js) */
function capsule(M, m, ax, ay, az, bx, by, bz, r) {
  let dx = bx - ax, dy = by - ay, dz = bz - az; const L = Math.hypot(dx, dy, dz);
  if (L > 1e-5) { dx /= L; dy /= L; dz /= L; } else { dx = 0; dy = 1; dz = 0; }
  let ex = -dz, ey = 0, ez = dx; let el = Math.hypot(ex, ey, ez); if (el < 1e-4) { ex = 1; ey = 0; ez = 0; el = 1; } ex /= el; ey /= el; ez /= el;
  const fx = ey * dz - ez * dy, fy = ez * dx - ex * dz, fz = ex * dy - ey * dx;
  const s = 2 * r, hs = (L + 2 * r) / 2;
  M[m] = ex * s; M[m + 1] = ey * s; M[m + 2] = ez * s; M[m + 3] = 0;
  M[m + 4] = dx * hs; M[m + 5] = dy * hs; M[m + 6] = dz * hs; M[m + 7] = 0;
  M[m + 8] = fx * s; M[m + 9] = fy * s; M[m + 10] = fz * s; M[m + 11] = 0;
  M[m + 12] = (ax + bx) / 2; M[m + 13] = (ay + by) / 2; M[m + 14] = (az + bz) / 2; M[m + 15] = 1;
}
