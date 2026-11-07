/* STUB (owner: props worker) — replace completely, keep this API.
   Exports: PROPS ({ type: { size: [w,h,d], build(B, x, y, z, o) } }), placeProp(B, type, x, y, z, opts) */
export const PROPS = {};
export function placeProp(B, type, x, y, z, o = {}) {
  const p = PROPS[type]; if (p) return p.build(B, x, y, z, o);
  return B.box(x, y, z, 1, 1, 1, { mat: 'cardboard', ry: o.ry || 0 });   // unknown prop: a placeholder crate
}
