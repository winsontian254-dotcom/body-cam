/* LIVE FIRE — PROPS library: realistic, detailed props built with MapBuilder primitives (and a few CC0 Poly Haven scans).
   Exports:
     PROPS                         { type: { size: [w, h, d], cat, desc, variants, opts, build(B, x, y, z, o) } }  (one entry per type)
     placeProp(B, type, x, y, z, opts)    what B.prop() calls; returns the first collider id (or -1)
     propList() -> [{ type, cat, size, desc, variants, opts, scan }]   (the gallery and docs use it)
     propSize(type, opts) -> [w, h, d]    footprint / height of a placement (options such as len change it)
     propKit(type, opts) -> Kit | null    the built geometry of a code-built prop (tests, bounds; not placed)
     RAIL_TOP = .39                       height of the rail head above a 'track' prop's origin (railcars stand on it)
   Conventions (every prop): (x, z) = centre of the footprint, y = the surface it stands on (BOTTOM of the prop), w along x,
   h up, d along z; the FRONT (doors, screens, seat fronts, car noses) faces +z; long wall-like props (fences, barriers,
   sandbags, hesco, racking, counters, lockers) run along x. opts common to all: ry (yaw), s (uniform scale), variant
   (name, or 'random' = seeded by position), seed (geometry variation; organic props vary by position by default),
   collide (false = no colliders), hide (true = also register the prop's hide-spot hint with B.hide), inst (true = thin
   instances, false = always merge; default auto: identical copies (same type / variant / options / seed) of a prop with
   >= 400 triangles become thin instances after the first 6 merged ones), cast (false = no shadows).
   Geometry is merged into the map's chunk meshes by material (library materials + the prop materials registered by
   js/maps/props/kit.js), so props add almost no draw calls. Colliders are simplified boxes / cylinders matching the visible
   shape; small clutter has none. Foliage (bushes, hedges, tall grass, corn) gets a non-solid sight-blocking collider tagged
   'foliage' (surf fabric) so bots cannot see through it; pass skipTag 'foliage' to rays that should ignore it (grenades).
   Catalogue: js/maps/props/{industrial,vehicles,street,nature,interior,military}.js; parts.js = shared parts; kit.js = kit;
   decals.js = decal atlas art. The full list with sizes and options: docs/PROPS.md (node tools/test/props.mjs --doc). */
import { Kit, emitKit, hashStr } from './props/kit.js';
import './props/decals.js';
import INDUSTRIAL from './props/industrial.js';
import VEHICLES from './props/vehicles.js';
import STREET from './props/street.js';
import NATURE from './props/nature.js';
import INTERIOR from './props/interior.js';
import MILITARY from './props/military.js';
import SCANS from './props/scans.js';

export const RAIL_TOP = .39;
export const PROPS = {};
const DEFS = {};
const ALIAS = {};
const CACHE = new Map();     // kit cache: type|variant|options|seed -> Kit (scene independent); emptied after each map build
const CACHE_MAX = 400;
const AUTO_INST_AFTER = 6, AUTO_INST_TRIS = 400;   // inst: undefined = auto (merge the first 6 identical copies, instance the rest)
let clearQueued = false;
function useCache() {          // a map build is synchronous: the cache lives until the next macrotask, then its memory is freed
  if (clearQueued) return;
  clearQueued = true;
  setTimeout(() => { CACHE.clear(); clearQueued = false; }, 0);
}

function register(list) {
  for (const d of list) {
    if (DEFS[d.type]) console.warn('[props] duplicate type ' + d.type);
    DEFS[d.type] = d;
    for (const a of d.alias || []) ALIAS[a] = d.type;
    PROPS[d.type] = { size: d.size, cat: d.cat, desc: d.desc, variants: d.variants || null, opts: d.opts || {}, scan: !!d.glb,
      build: (B, x, y, z, o) => placeProp(B, d.type, x, y, z, o) };
  }
}
register(INDUSTRIAL); register(VEHICLES); register(STREET); register(NATURE); register(INTERIOR); register(MILITARY); register(SCANS);
for (const a in ALIAS) if (!PROPS[a]) PROPS[a] = PROPS[ALIAS[a]];

export function propList() {
  return Object.values(DEFS).map(d => ({ type: d.type, cat: d.cat, size: d.size, desc: d.desc, variants: d.variants || null, opts: d.opts || {}, scan: !!d.glb, alias: d.alias || [] }));
}
export function propSize(type, o = {}) {
  const d = DEFS[ALIAS[type] || type]; if (!d) return [1, 1, 1];
  const v = variantOf(d, o, 0, 0);
  if (d.glb || d.place) return d.sizeOf ? d.sizeOf(o, v) : d.size;
  const K = propKit(type, o);   // the real extents of the geometry (cached kits make this cheap)
  if (!K || !Number.isFinite(K.min[0])) return d.sizeOf ? d.sizeOf(o, v) : d.size;
  const y0 = K.min[1] < -.2 ? K.min[1] : Math.max(0, K.min[1]);    // ceiling fixtures hang below their origin
  return [K.max[0] - K.min[0], K.max[1] - y0, K.max[2] - K.min[2]].map(x => Math.round(x * 100) / 100);
}

function variantOf(d, o, wx, wz) {
  const vs = d.variants;
  if (!vs || !vs.length) return null;
  let v = o.variant;
  if (v === 'random') v = vs[hashStr(d.type + ':' + Math.round(wx * 10) + ':' + Math.round(wz * 10)) % vs.length];
  if (v == null) v = d.dflt || vs[0];
  return v;
}

/** Place a prop: B.prop(type, x, y, z, opts) ends here. */
export function placeProp(B, type, x, y, z, o = {}) {
  const d = DEFS[ALIAS[type] || type];
  if (!d) {
    B.warn('unknown prop "' + type + '" (placeholder crate)');
    return B.box(x, y, z, 1, 1, 1, { mat: 'cardboard', ry: o.ry || 0 });
  }
  const wp = B.toWorld(x, y, z);
  const v = variantOf(d, o, wp.x, wp.z);
  if (d.variants && !d.variants.includes(v)) B.warn('prop "' + d.type + '": unknown variant "' + v + '" (have ' + d.variants.join(', ') + ')');
  if (d.place) return d.place(B, x, y, z, o, v);           // composite props (fields, sets) place other props / instances
  if (d.glb) return placeScan(B, d, x, y, z, o);
  // geometry key: the options that change the shape + the seed (organic props vary by position unless o.seed is given)
  const opt = {};
  for (const k of d.keys || []) if (o[k] !== undefined) opt[k] = o[k];
  const seed = o.seed != null ? o.seed : d.vary ? (hashStr(Math.round(wp.x * 20) + ',' + Math.round(wp.z * 20) + ',' + Math.round(wp.y * 20)) % 9973) : 0;
  const key = d.type + '|' + (v || '') + '|' + JSON.stringify(opt) + '|' + seed;
  useCache();
  let K = CACHE.get(key);
  if (!K) {
    K = new Kit(hashStr(key) || 1);
    d.build(K, Object.assign({}, o, { seed }), v, K.rand);
    K.compact();
    if (CACHE.size >= CACHE_MAX) CACHE.delete(CACHE.keys().next().value);
    CACHE.set(key, K);
  }
  // repeated identical heavy geometry switches to thin instances after the first few merged copies (memory; same look)
  K.uses = (K.uses || 0) + 1;
  const inst = o.inst !== undefined ? !!o.inst : K.uses > AUTO_INST_AFTER && (K._tris || (K._tris = K.tris())) >= AUTO_INST_TRIS;
  return emitKit(B, K, x, y, z, inst !== !!o.inst ? Object.assign({}, o, { inst }) : o, key.replace(/[^a-z0-9_|]/gi, '_'));
}

/** Build (or fetch from the cache) the kit of a code-built prop without placing it: tools / tests / bounds. */
export function propKit(type, o = {}) {
  const d = DEFS[ALIAS[type] || type];
  if (!d || d.glb || d.place) return null;
  const v = variantOf(d, o, 0, 0), seed = o.seed || 0;
  const opt = {}; for (const k of d.keys || []) if (o[k] !== undefined) opt[k] = o[k];
  const key = d.type + '|' + (v || '') + '|' + JSON.stringify(opt) + '|' + seed;
  useCache();
  let K = CACHE.get(key);
  if (!K) { K = new Kit(hashStr(key) || 1); d.build(K, Object.assign({}, o, { seed }), v, K.rand); K.compact(); if (CACHE.size >= CACHE_MAX) CACHE.delete(CACHE.keys().next().value); CACHE.set(key, K); }
  return K;
}

/** Poly Haven scans: one glb, placed through B.model (loaded once per scene, instanced), explicit box colliders. */
function placeScan(B, d, x, y, z, o) {
  const s = (o.s || 1) * (d.scale || 1), k = o.s || 1;
  // colliders are given in metres at scale 1 of the PROP (not of the raw glb): scale them back for B.model's model space
  const cols = d.cols && d.scale ? d.cols.map(c => ({ cx: c.cx / d.scale, cy: c.cy / d.scale, cz: c.cz / d.scale, hx: c.hx / d.scale, hy: c.hy / d.scale, hz: c.hz / d.scale })) : d.cols;
  B.model('assets/models/ph/' + d.glb + '.glb', x, y + (d.yoff || 0) * k, z, { ry: o.ry || 0, s, collide: o.collide === false ? 'none' : (cols || 'none'), surf: d.surf || 'metal' });
  if (o.hide && d.hide) { B.push(x, y, z, o.ry || 0, s); B.hide(d.hide[0], d.hide[1], d.hide[2], { kind: d.hide[3] || 'crates' }); B.pop(); }
  return -1;
}
