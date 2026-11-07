/* LIVE FIRE — MapBuilder: turns a MapDef into merged, frozen geometry + a collision World + gameplay markers.
   Exports:
     buildMap(scene, def, opts?) -> Promise<MapInfo>       opts = { quality, nav = true, lights = 'auto'|'clustered'|'chunks',
                                                             onProgress(stage), shadows = true }
     CHUNK = 32 (metres)                                   geometry is merged per (chunk, material, shadow flags); MapDef.chunk overrides;
                                                           materials with little geometry are merged across chunks (opts.mergeSparse)
     MapBuilder (class)                                    what def.build(B) receives (API below; docs/ARCHITECTURE.md §7)
   MapBuilder (all lengths in metres; x/z plan, y up; "frame" = the current B.push transform, identity by default):
     geometry (collide = true adds colliders to the World; surf defaults to the material's surface):
       box(x, y, z, w, h, d, { mat, ry, collide, surf, uv, cast, receive, mats: { n s e w t b }, skip: 'tb', tag, walk, ray }) -> collider id|-1
           (x, z) = centre in plan, y = BOTTOM, w along x, h up, d along z. mats per face (n = +z, s = -z, e = +x, w = -x, t, b).
       boxc(x0, y0, z0, x1, y1, z1, opts)                  box by two corners (unrotated in the frame)
       floor(x0, z0, x1, z1, y, { mat, t = .2 })           slab whose TOP is at y
       wall(x0, z0, x1, z1, { y, h = 3, t = .2, mat, mat2, matEnd, openings: [{ at, w, h, y = 0, frame, glass }] })
           mat = left side walking from (x0,z0) to (x1,z1), mat2 = right side, matEnd = ends/top (default mat);
           at = opening centre measured from (x0,z0)
       room({ x, z, w, d, y, h, t, wall, outer, floor, ceil, doors: { n: [at|{at,w,h}], s, e, w }, windows: { n: [{ at, w, h, y, glass }] },
              doorW = 1.2, doorH = 2.2, frames = 'wood_dark' })   (x, z) = centre, w x d = OUTER size, walls inside it;
           n/s openings measured from the west end, e/w openings from the south end; returns { x0, z0, x1, z1, y, h }
       stairs({ x, z, w, len, y0, y1, dir: '+x'|'-x'|'+z'|'-z', mat, rail: true|'left'|'right'|false, railMat })
           (x, z) = centre of the footprint; rises from y0 at the start end to y1 along dir; visual steps + ramp collider
       ramp({ x, z, w, len, y0, y1, dir, mat })            visual wedge + ramp collider
       ground({ minX, maxX, minZ, maxZ, mat, res = 2, height ((x,z)=>y), y = 0, collide = true })   (frame translation only)
       cyl(x, y, z, r, h, { mat, sides = 16, collide, ry, caps = true }) -> collider id   y = bottom; real cylinder collider
       mesh(mesh, { mat, collide: 'box'|'none'|[{ cx,cy,cz,hx,hy,hz,ry,surf }], surf, merge = true, cast, receive })
           mesh coordinates are in the current frame; merged meshes are baked into the chunk geometry and disposed
       instance(key, buildFn (() => Mesh|Mesh[]), x, y, z, { ry, s, collide = true|false|[specs] }) -> collider id|-1
           thin instances per key and 32 m chunk; buildFn runs once per scene and key
       collider({ cx, cy, cz, hx, hy, hz, ry, surf, tag, ray, walk, solid }) -> id      invisible (cy = centre, like World.addBox)
       light({ type: 'point'|'spot', x, y, z, color, intensity, range, dir, angle, fixture = true|'bulb'|'panel'|'tube'|'can'|false, flicker })
       model(file, x, y, z, { ry, s, collide = 'box'|'none' })   glb, loaded once per scene, instanced
       prop(type, x, y, z, opts)                           -> props.js placeProp(B, type, x, y, z, opts)
       mat(name) -> BABYLON.Material                       (gfx/materials.js)
     frames (for props and prefabs): push(x, y, z, ry = 0, s = 1) / pop(), frame(x, y, z, ry, fn), toWorld(x, y, z) -> {x,y,z}
     helpers: rand() (seeded by the map id), heightAt(x, z) (the ground height functions registered so far), scene, world, def
     markers: spawn(team, x, y, z, yaw, { field }), lobby(team, { x0, z0, x1, z1, y }, gates: [{ x, z, w, h, ry }]),
       buyzone(team, rect), hide(x, y, z, { r = .8, kind }), site('A'|'B', { x0, z0, x1, z1, y }), hostage(x, y, z),
       rescue(rect), point(name, x, y, z, r)       (y may be null: snapped to the ground at the end of the build)
   MapInfo = { id, def, world, spawns: { 0: [], 1: [], 2: [] }, casters, lobbies, gates (collider ids), gateList, buyzones,
     hides, sites, hostages, rescue, rescues, points, bounds, lights, meshes, nav, stats, warnings,
     openGates(team?), closeGates(), update(dt) (light flicker, gate shutters), dispose() } */
import { World } from '../phys/world.js';
import { MATERIALS, getMaterial, surfaceOf, initMaterials } from '../gfx/materials.js';
import { placeProp } from './props.js';
import { buildNav } from './navgrid.js';

export const CHUNK = 32;
const TAU = Math.PI * 2;

// ------------------------------------------------------------------------------------------------ geometry accumulator
class Acc {
  constructor(key, matName, mat, cast, receive, chunk) {
    this.key = key; this.matName = matName; this.mat = mat; this.cast = cast; this.receive = receive; this.chunk = chunk;
    this.P = new Float32Array(3 * 256); this.N = new Float32Array(3 * 256); this.U = new Float32Array(2 * 256); this.C = null;
    this.I = new Uint32Array(384); this.nv = 0; this.ni = 0;
  }
  reserve(nv, ni) {
    if ((this.nv + nv) * 3 > this.P.length) {
      const n = Math.max(this.P.length * 2, (this.nv + nv) * 3);
      const P = new Float32Array(n); P.set(this.P.subarray(0, this.nv * 3)); this.P = P;
      const N = new Float32Array(n); N.set(this.N.subarray(0, this.nv * 3)); this.N = N;
      const U = new Float32Array(n / 3 * 2); U.set(this.U.subarray(0, this.nv * 2)); this.U = U;
      if (this.C) { const C = new Float32Array(n / 3 * 4); C.set(this.C.subarray(0, this.nv * 4)); this.C = C; }
    }
    if (this.ni + ni > this.I.length) { const I = new Uint32Array(Math.max(this.I.length * 2, this.ni + ni)); I.set(this.I.subarray(0, this.ni)); this.I = I; }
  }
  enableColors() {
    if (this.C) return;
    this.C = new Float32Array(this.P.length / 3 * 4); this.C.fill(1);
  }
  v(x, y, z, nx, ny, nz, u, w) {
    const i = this.nv++, a = i * 3, b = i * 2;
    this.P[a] = x; this.P[a + 1] = y; this.P[a + 2] = z; this.N[a] = nx; this.N[a + 1] = ny; this.N[a + 2] = nz;
    this.U[b] = u; this.U[b + 1] = w;
    if (this.C) { const c = i * 4; this.C[c] = this.C[c + 1] = this.C[c + 2] = this.C[c + 3] = 1; }
    return i;
  }
  tri(a, b, c) { const I = this.I; I[this.ni++] = a; I[this.ni++] = b; I[this.ni++] = c; }
  get tris() { return this.ni / 3; }
}

// Babylon front faces: cross(b - a, c - a) . n < 0 (checked against VertexData.CreateBox).
function quad(acc, q, nx, ny, nz, uv) {
  acc.reserve(4, 6);
  const i0 = acc.v(q[0], q[1], q[2], nx, ny, nz, uv[0], uv[1]);
  const i1 = acc.v(q[3], q[4], q[5], nx, ny, nz, uv[2], uv[3]);
  const i2 = acc.v(q[6], q[7], q[8], nx, ny, nz, uv[4], uv[5]);
  const i3 = acc.v(q[9], q[10], q[11], nx, ny, nz, uv[6], uv[7]);
  const ux = q[3] - q[0], uy = q[4] - q[1], uz = q[5] - q[2], vx = q[6] - q[0], vy = q[7] - q[1], vz = q[8] - q[2];
  const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
  if (cx * nx + cy * ny + cz * nz < 0) { acc.tri(i0, i1, i2); acc.tri(i0, i2, i3); }
  else { acc.tri(i0, i2, i1); acc.tri(i0, i3, i2); }
}
const QB = new Float64Array(12), UB = new Float64Array(8);
// unit box faces (corners as -1/0/1 multipliers of half width, height, half depth): e w n s t b
const FACE_KEYS = ['e', 'w', 'n', 's', 't', 'b'];
const FACE_N = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0], [0, -1, 0]];
const FACE_MODE = [0, 0, 1, 1, 2, 2];
const FACE_CORNERS = [
  [1, 0, -1, 1, 0, 1, 1, 1, 1, 1, 1, -1], [-1, 0, 1, -1, 0, -1, -1, 1, -1, -1, 1, 1],
  [1, 0, 1, -1, 0, 1, -1, 1, 1, 1, 1, 1], [-1, 0, -1, 1, 0, -1, 1, 1, -1, -1, 1, -1],
  [-1, 1, -1, 1, 1, -1, 1, 1, 1, -1, 1, 1], [-1, 0, 1, 1, 0, 1, 1, 0, -1, -1, 0, -1]];

// ------------------------------------------------------------------------------------------------ the builder
export class MapBuilder {
  constructor(scene, def, opts = {}) {
    this.scene = scene; this.def = def; this.opts = opts;
    this.chunk = Math.max(8, +(def.chunk || opts.chunk) || CHUNK);   // MapDef.chunk may enlarge it for big open maps (fewer draw calls)
    this.world = new World();
    this.accs = new Map();
    this.inst = new Map();
    this.models = [];
    this.lightSpecs = [];
    this.stack = [{ c: 1, s: 0, th: 0, tx: 0, ty: 0, tz: 0, k: 1 }];
    this.groundFns = [];
    this.warnings = [];
    this._warned = new Set();
    this.extraMeshes = [];
    this.casters = [];
    this.info = {
      id: def.id, def, world: this.world, spawns: { 0: [], 1: [], 2: [] }, casters: this.casters, lobbies: {}, gates: [], gateList: [],
      buyzones: { 1: [], 2: [] }, hides: [], sites: {}, hostages: [], rescue: null, rescues: [], points: {}, bounds: def.bounds || null,
      lights: [], meshes: [], nav: null, stats: {}, warnings: this.warnings,
    };
    let seed = 0; const id = String(def.id || 'map'); for (let i = 0; i < id.length; i++) seed = (Math.imul(seed, 31) + id.charCodeAt(i)) | 0;
    this._rs = (seed >>> 0) || 1;
  }
  warn(msg) { if (this._warned.has(msg)) return; this._warned.add(msg); this.warnings.push(msg); console.warn('[map ' + this.def.id + '] ' + msg); }

  // ---------------------------------------------------------------------------------------- frames
  get T() { return this.stack[this.stack.length - 1]; }
  push(x = 0, y = 0, z = 0, ry = 0, s = 1) {
    const P = this.T, p = this.toWorld(x, y, z), th = P.th + (ry || 0);
    this.stack.push({ c: Math.cos(th), s: Math.sin(th), th, tx: p.x, ty: p.y, tz: p.z, k: P.k * (s || 1) });
    return this;
  }
  pop() { if (this.stack.length > 1) this.stack.pop(); else this.warn('B.pop() without push()'); return this; }
  frame(x, y, z, ry, fn) { this.push(x, y, z, ry); try { fn(this); } finally { this.pop(); } return this; }
  toWorld(x, y, z, out = {}) {
    const T = this.T;
    out.x = T.tx + T.k * (x * T.c + z * T.s); out.y = T.ty + T.k * y; out.z = T.tz + T.k * (-x * T.s + z * T.c);
    return out;
  }
  rand() { let a = (this._rs = (this._rs + 0x6d2b79f5) | 0); let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
  heightAt(x, z) { let h = -Infinity; for (const g of this.groundFns) if (x >= g.minX && x <= g.maxX && z >= g.minZ && z <= g.maxZ) h = Math.max(h, g.fn(x, z)); return h === -Infinity ? 0 : h; }

  // ---------------------------------------------------------------------------------------- materials
  mat(name) { return getMaterial(this.scene, name); }
  _tile(name) {
    const d = MATERIALS[name];
    if (!d) this.warn('unknown material "' + name + '" (falls back to concrete)');
    return (d && d.scale) || 2;
  }
  _surf(name) { return surfaceOf(name) || 'concrete'; }
  _acc(name, x, z, cast = true, receive = true) {
    const cx = Math.floor(x / this.chunk), cz = Math.floor(z / this.chunk);
    const key = name + '|' + cx + '|' + cz + '|' + (cast ? 1 : 0) + (receive ? 1 : 0);
    let a = this.accs.get(key);
    if (!a) { a = new Acc(key, name, null, cast, receive, cx + ',' + cz); this.accs.set(key, a); }
    return a;
  }
  _accMat(mat, x, z, cast, receive) {
    const cx = Math.floor(x / this.chunk), cz = Math.floor(z / this.chunk);
    const key = '#' + mat.uniqueId + '|' + cx + '|' + cz + '|' + (cast ? 1 : 0) + (receive ? 1 : 0);
    let a = this.accs.get(key);
    if (!a) { a = new Acc(key, mat.name, mat, cast, receive, cx + ',' + cz); this.accs.set(key, a); }
    return a;
  }

  // ---------------------------------------------------------------------------------------- primitives
  box(x, y, z, w, h, d, o = {}) {
    if (!(w > 0 && h > 0 && d > 0) || !Number.isFinite(x + y + z)) { this.warn('box with bad size/position at ' + [x, y, z, w, h, d].join(',')); return -1; }
    const T = this.T, th = T.th + (o.ry || 0), k = T.k;
    const p = this.toWorld(x, y, z, {});
    const hw = w * k / 2, hh = h * k, hd = d * k / 2;
    const mat = o.mat || 'concrete';
    if (o.visible !== false) {
      const cast = o.cast !== false, receive = o.receive !== false;
      this._emitBox(p, th, hw, hh, hd, mat, o.mats || null, o.skip || '', o.uv || 1, m => this._acc(m, p.x, p.z, cast, receive));
    }
    if (o.collide === false) return -1;
    return this.world.addBox({ cx: p.x, cy: p.y + hh / 2, cz: p.z, hx: hw, hy: hh / 2, hz: hd, ry: th,
      surf: o.surf || this._surf(mat), tag: o.tag, walk: o.walk, ray: o.ray, solid: o.solid });
  }
  /** Emit the 6 faces of a box (world bottom-centre p, yaw th, half sizes) with world-scale UVs; accFor(matName) -> Acc. */
  _emitBox(p, th, hw, hh, hd, mat, mats, skip, uvk, accFor) {
    const c = Math.cos(th), s = Math.sin(th);
    for (let f = 0; f < 6; f++) {
      const key = FACE_KEYS[f];
      if (skip && skip.includes(key)) continue;
      const m = (mats && mats[key]) || mat, tile = this._tile(m) * uvk;
      const acc = accFor(m);
      const cs = FACE_CORNERS[f], mode = FACE_MODE[f];
      for (let i = 0; i < 4; i++) {
        const lx = cs[i * 3] * hw, ly = cs[i * 3 + 1] * hh, lz = cs[i * 3 + 2] * hd;
        const X = p.x + lx * c + lz * s, Y = p.y + ly, Z = p.z - lx * s + lz * c;
        QB[i * 3] = X; QB[i * 3 + 1] = Y; QB[i * 3 + 2] = Z;
        const ax = X * c - Z * s, az = X * s + Z * c;     // the point projected on the box's local x and z axes
        if (mode === 0) { UB[i * 2] = az / tile; UB[i * 2 + 1] = Y / tile; }        // faces facing +-x: u along local z
        else if (mode === 1) { UB[i * 2] = ax / tile; UB[i * 2 + 1] = Y / tile; }   // faces facing +-z: u along local x
        else { UB[i * 2] = ax / tile; UB[i * 2 + 1] = az / tile; }                   // top / bottom
      }
      const n = FACE_N[f];
      quad(acc, QB, n[0] * c + n[2] * s, n[1], -n[0] * s + n[2] * c, UB);
    }
  }
  /** A box as its own (not merged) mesh, world-scale UVs, one material. */
  _soloBox(name, x, y, z, w, h, d, ry, mat) {
    const acc = new Acc(name, mat, null, true, true, '');
    this._emitBox({ x: 0, y: -h / 2, z: 0 }, 0, w / 2, h, d / 2, mat, null, '', 1, () => acc);
    const m = new BABYLON.Mesh(name, this.scene), vd = new BABYLON.VertexData();
    vd.positions = acc.P.subarray(0, acc.nv * 3); vd.normals = acc.N.subarray(0, acc.nv * 3); vd.uvs = acc.U.subarray(0, acc.nv * 2); vd.indices = acc.I.subarray(0, acc.ni);
    vd.applyToMesh(m, false);
    m.position.set(x, y + h / 2, z); m.rotation.y = ry; m.material = this.mat(mat);
    m.isPickable = false; m.receiveShadows = true;
    return m;
  }
  boxc(x0, y0, z0, x1, y1, z1, o = {}) {
    return this.box((x0 + x1) / 2, Math.min(y0, y1), (z0 + z1) / 2, Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0), o);
  }
  floor(x0, z0, x1, z1, y, o = {}) {
    const t = o.t || 0.2;
    return this.box((x0 + x1) / 2, y - t, (z0 + z1) / 2, Math.abs(x1 - x0), t, Math.abs(z1 - z0), Object.assign({ mat: 'concrete_floor' }, o));
  }
  wall(x0, z0, x1, z1, o = {}) {
    const dx = x1 - x0, dz = z1 - z0, L = Math.hypot(dx, dz);
    if (L < 1e-3) return [];
    const y = o.y || 0, h = o.h || 3, t = o.t || 0.2, mat = o.mat || 'plaster', mat2 = o.mat2 || mat;
    const th = Math.atan2(-dz, dx);       // local +x runs from the start to the end; local +z is the left side
    const ux = dx / L, uz = dz / L;
    const ops = (o.openings || []).map(op => ({ a: Math.max(0, (op.at || 0) - (op.w || 1.2) / 2), b: Math.min(L, (op.at || 0) + (op.w || 1.2) / 2),
      y0: op.y || 0, y1: Math.min(h, (op.y || 0) + (op.h || 2.2)), op })).filter(q => q.b > q.a + 1e-3).sort((p, q) => p.a - q.a);
    const ids = [];
    const piece = (a, b, v0, v1) => {
      if (b - a < 1e-3 || v1 - v0 < 1e-3) return;
      const m = (a + b) / 2;
      const me = o.matEnd || mat;
      ids.push(this.box(x0 + ux * m, y + v0, z0 + uz * m, b - a, v1 - v0, t, { mat: me, ry: th, mats: { n: mat, s: mat2 }, uv: o.uv, cast: o.cast,
        surf: o.surf || this._surf(mat), collide: o.collide }));
    };
    let u = 0;
    for (const q of ops) {
      if (q.a > u) piece(u, q.a, 0, h);
      piece(Math.max(u, q.a), q.b, 0, q.y0);
      piece(Math.max(u, q.a), q.b, q.y1, h);
      u = Math.max(u, q.b);
      const fm = q.op.frame === true ? 'wood_dark' : q.op.frame;
      const m = (q.a + q.b) / 2, ow = q.b - q.a, fw = 0.07, fd = t + 0.04;
      if (fm) {
        const at = (s, v0, v1, w) => this.box(x0 + ux * s, y + v0, z0 + uz * s, w, v1 - v0, fd, { mat: fm, ry: th, collide: false });
        at(q.a + fw / 2, q.y0, q.y1, fw); at(q.b - fw / 2, q.y0, q.y1, fw);
        if (q.y1 < h - 1e-3) at(m, q.y1 - fw, q.y1, ow);
        if (q.y0 > 1e-3) at(m, q.y0, q.y0 + fw, ow + 0.08);
      }
      if (q.op.glass) {
        ids.push(this.box(x0 + ux * m, y + q.y0, z0 + uz * m, ow, q.y1 - q.y0, 0.025, { mat: 'glass', ry: th, surf: 'glass', cast: false }));
      }
    }
    if (u < L) piece(u, L, 0, h);
    return ids;
  }
  room(o) {
    const x = o.x || 0, z = o.z || 0, w = o.w || 6, d = o.d || 6, y = o.y || 0, h = o.h || 3, t = o.t || 0.2;
    const inner = o.wall || 'plaster', outer = o.outer || inner;
    const dW = o.doorW || 1.2, dH = o.doorH || 2.2, frames = o.frames === undefined ? 'wood_dark' : o.frames;
    const x0 = x - w / 2, x1 = x + w / 2, z0 = z - d / 2, z1 = z + d / 2;
    const ops = (side, shift) => {
      const out = [];
      for (const v of (o.doors && o.doors[side]) || []) {
        const q = typeof v === 'number' ? { at: v } : v;
        out.push({ at: q.at - shift, w: q.w || dW, h: q.h || dH, y: 0, frame: q.frame === undefined ? frames : q.frame });
      }
      for (const v of (o.windows && o.windows[side]) || []) {
        const q = typeof v === 'number' ? { at: v } : v;
        out.push({ at: q.at - shift, w: q.w || 1.2, h: q.h || 1.2, y: q.y == null ? 0.9 : q.y, frame: q.frame === undefined ? frames : q.frame, glass: !!q.glass });
      }
      return out;
    };
    const base = { y, h, t, uv: o.uv, matEnd: outer };   // wall ends show at the outside corners: outer material
    // north / south run the full width, east / west fit between them (no overlapping coplanar faces at the corners)
    this.wall(x0, z0 + t / 2, x1, z0 + t / 2, { ...base, mat: inner, mat2: outer, openings: ops('s', 0) });
    this.wall(x0, z1 - t / 2, x1, z1 - t / 2, { ...base, mat: outer, mat2: inner, openings: ops('n', 0) });
    this.wall(x0 + t / 2, z0 + t, x0 + t / 2, z1 - t, { ...base, mat: outer, mat2: inner, openings: ops('w', t) });
    this.wall(x1 - t / 2, z0 + t, x1 - t / 2, z1 - t, { ...base, mat: inner, mat2: outer, openings: ops('e', t) });
    if (o.floor) this.floor(x0, z0, x1, z1, y, { mat: o.floor, t: o.floorT || 0.2 });
    if (o.ceil) this.box(x, y + h, z, w, o.ceilT || t, d, { mat: o.roof || o.ceil, mats: { b: o.ceil } });
    return { x0, z0, x1, z1, y, h };
  }
  _dirFrame(dir) {
    // local frame for stairs/ramps: returns ry so that local +z = the climb direction
    switch (dir) { case '-z': return Math.PI; case '+x': return Math.PI / 2; case '-x': return -Math.PI / 2; default: return 0; }
  }
  stairs(o) {
    let y0 = o.y0 || 0, y1 = o.y1 == null ? 3 : o.y1, dir = o.dir || '+z';
    if (y1 < y0) { const t = y0; y0 = y1; y1 = t; dir = { '+z': '-z', '-z': '+z', '+x': '-x', '-x': '+x' }[dir]; }
    const w = o.w || 1.2, len = o.len || Math.max(1, (y1 - y0) / 0.62), mat = o.mat || 'concrete';
    const n = Math.max(2, Math.round((y1 - y0) / 0.18)), rise = (y1 - y0) / n, run = len / n;
    this.push(o.x || 0, 0, o.z || 0, this._dirFrame(dir));
    for (let i = 0; i < n; i++) {
      const zc = -len / 2 + run * (i + 0.5);
      const top = y0 + rise * (i + 1), bot = i === 0 ? y0 : top - 2 * rise;   // each step overlaps the wedge below it
      this.box(0, bot, zc, w, top - bot, run, { mat, collide: false, mats: { t: o.tread || mat }, skip: i === 0 ? '' : 'b' });
    }
    // a solid flight: the wedge under the steps (1 cm narrower so its sides never z-fight with the steps)
    if (n > 1) this._wedge(0, -len / 2 + run, len / 2, w - 0.02, y0, y0, y1 - rise, mat);
    const T = this.T, cpos = this.toWorld(0, 0, 0, {});
    this.world.addRamp({ cx: cpos.x, cz: cpos.z, hx: w / 2 * T.k, hz: len / 2 * T.k, y0: T.ty + y0 * T.k, y1: T.ty + y1 * T.k, axis: 'z', ry: T.th, surf: o.surf || this._surf(o.tread || mat) });
    const rail = o.rail === undefined ? true : o.rail;
    if (rail) {
      const rm = o.railMat || 'steel_dark';
      for (const side of [-1, 1]) {
        if (rail === 'left' && side > 0) continue;
        if (rail === 'right' && side < 0) continue;
        const rx = side * (w / 2 - 0.04);
        // posts and the sloped handrail
        const posts = Math.max(2, Math.ceil(len / 1.4) + 1);
        for (let i = 0; i < posts; i++) {
          const f = i / (posts - 1), zc = -len / 2 + run * 0.5 + (len - run) * f, top = y0 + rise + (y1 - y0 - rise) * f;
          this.cyl(rx, top - 0.02, zc, 0.02, 0.92, { mat: rm, sides: 6, collide: false, caps: false });
        }
        this._bar(rx, -len / 2 + run * 0.5, y0 + rise + 0.9, len / 2 - run * 0.5, y1 + 0.9, 0.025, rm);
        // side collider in segments so nobody walks off the open side of a railed flight
        const seg = Math.max(1, Math.ceil(n / 4));
        for (let s = 0; s < seg; s++) {
          const i0 = Math.floor(s * n / seg), i1 = Math.floor((s + 1) * n / seg);
          const zc = -len / 2 + run * (i0 + i1) / 2, base = y0 + rise * i0;
          this.box(rx, base, zc, 0.06, (y0 + rise * i1) - base + 1.0, run * (i1 - i0), { collide: true, visible: false, surf: 'metal' });
        }
      }
    }
    this.pop();
  }
  ramp(o) {
    let y0 = o.y0 || 0, y1 = o.y1 == null ? 1 : o.y1, dir = o.dir || '+z';
    const w = o.w || 2, len = o.len || 4, mat = o.mat || 'concrete';
    this.push(o.x || 0, 0, o.z || 0, this._dirFrame(dir));
    const base = Math.min(y0, y1);
    this._wedge(0, -len / 2, len / 2, w, base, y0, y1, mat, o.uv);
    const T = this.T, cpos = this.toWorld(0, 0, 0, {});
    if (o.collide !== false) this.world.addRamp({ cx: cpos.x, cz: cpos.z, hx: w / 2 * T.k, hz: len / 2 * T.k, y0: T.ty + y0 * T.k, y1: T.ty + y1 * T.k,
      axis: 'z', ry: T.th, base: T.ty + base * T.k, surf: o.surf || this._surf(mat) });
    this.pop();
  }
  /** Visual wedge in the current frame: width w along x, from z = za (top ya) to z = zb (top yb), flat bottom at yb0. */
  _wedge(cx, za, zb, w, yBot, ya, yb, mat, uvk = 1) {
    const T = this.T, c = T.c, s = T.s, tile = this._tile(mat) * uvk;
    const P = (x, y, z, o) => this.toWorld(x, y, z, o);
    const pts = [[-w / 2, yBot, za], [w / 2, yBot, za], [w / 2, yBot, zb], [-w / 2, yBot, zb], [-w / 2, ya, za], [w / 2, ya, za], [w / 2, yb, zb], [-w / 2, yb, zb]]
      .map(([x, y, z]) => P(cx + x, y, z, {}));
    const ctr = P(cx, 0, (za + zb) / 2, {});
    const acc = this._acc(mat, ctr.x, ctr.z, true, true);
    const ax = (X, Z) => X * c - Z * s, az = (X, Z) => X * s + Z * c;
    const emit = (idx, nx, ny, nz, mode) => {
      for (let i = 0; i < 4; i++) { const q = pts[idx[i]]; QB[i * 3] = q.x; QB[i * 3 + 1] = q.y; QB[i * 3 + 2] = q.z;
        const u = mode === 0 ? az(q.x, q.z) : ax(q.x, q.z), v = mode === 2 ? az(q.x, q.z) : q.y; UB[i * 2] = u / tile; UB[i * 2 + 1] = v / tile; }
      const l = Math.hypot(nx, ny, nz) || 1; quad(acc, QB, nx / l, ny / l, nz / l, UB);
    };
    // slope normal in the frame: (0, dz, -dy) rotated
    const dy = yb - ya, dz = zb - za, ln = (lx, ly, lz) => [lx * c + lz * s, ly, -lx * s + lz * c];
    const sn = ln(0, dz, -dy); emit([4, 5, 6, 7], sn[0], sn[1], sn[2], 2);
    const ex = ln(1, 0, 0); emit([1, 2, 6, 5], ex[0], 0, ex[2], 0);
    emit([3, 0, 4, 7], -ex[0], 0, -ex[2], 0);
    const ez = ln(0, 0, 1);
    if (yb > yBot + 1e-3) emit([2, 3, 7, 6], ez[0], 0, ez[2], 1);
    if (ya > yBot + 1e-3) emit([0, 1, 5, 4], -ez[0], 0, -ez[2], 1);
    if (yBot > 0.01) emit([3, 2, 1, 0], 0, -1, 0, 2);
  }
  /** Visual sloped square bar between (x, za, ya) and (x, zb, yb) in the current frame. */
  _bar(x, za, ya, zb, yb, r, mat) {
    const T = this.T, c = T.c, s = T.s, tile = this._tile(mat);
    const dz = zb - za, dy = yb - ya, L = Math.hypot(dz, dy), uz = dz / L, uy = dy / L;
    // perpendicular in the frame's yz plane
    const py = uz, pz = -uy;
    const corner = (sx, sp, end) => this.toWorld(x + sx * r, (end ? yb : ya) + sp * r * py, (end ? zb : za) + sp * r * pz, {});
    const ctr = this.toWorld(x, 0, (za + zb) / 2, {});
    const acc = this._acc(mat, ctr.x, ctr.z, true, true);
    const faces = [[[-1, 1], [1, 1], 0, py, pz], [[1, -1], [-1, -1], 0, -py, -pz], [[1, 1], [1, -1], 1, 0, 0], [[-1, -1], [-1, 1], -1, 0, 0]];
    for (const [a, b, nx, ny, nz] of faces) {
      const q = [corner(a[0], a[1], false), corner(b[0], b[1], false), corner(b[0], b[1], true), corner(a[0], a[1], true)];
      for (let i = 0; i < 4; i++) { QB[i * 3] = q[i].x; QB[i * 3 + 1] = q[i].y; QB[i * 3 + 2] = q[i].z; UB[i * 2] = (i === 0 || i === 3 ? 0 : 0.05); UB[i * 2 + 1] = (i < 2 ? 0 : L) / tile; }
      quad(acc, QB, nx * c + nz * s, ny, -nx * s + nz * c, UB);
    }
  }
  cyl(x, y, z, r, h, o = {}) {
    const T = this.T, p = this.toWorld(x, y, z, {}), R = r * T.k, H = h * T.k;
    const mat = o.mat || 'concrete', sides = Math.max(3, o.sides || 16), tile = this._tile(mat) * (o.uv || 1);
    const th0 = T.th + (o.ry || 0);
    const acc = this._acc(mat, p.x, p.z, o.cast !== false, o.receive !== false);
    if (o.visible !== false) {
      acc.reserve((sides + 1) * 2 + (sides + 2) * 2, sides * 12);
      const ring = [];
      for (let i = 0; i <= sides; i++) {
        const a = th0 + i * TAU / sides, cx = Math.cos(a), sz = Math.sin(a), u = (i * TAU / sides) * R / tile;
        const b = acc.v(p.x + cx * R, p.y, p.z + sz * R, cx, 0, sz, u, p.y / tile);
        const t = acc.v(p.x + cx * R, p.y + H, p.z + sz * R, cx, 0, sz, u, (p.y + H) / tile);
        ring.push([b, t]);
      }
      for (let i = 0; i < sides; i++) {
        const [b0, t0] = ring[i], [b1, t1] = ring[i + 1];
        // outward normal; verify winding numerically once
        if (i === 0) {
          const P = acc.P, ia = b0 * 3, ib = b1 * 3, ic = t1 * 3;
          const ux = P[ib] - P[ia], uy = P[ib + 1] - P[ia + 1], uz = P[ib + 2] - P[ia + 2], vx = P[ic] - P[ia], vy = P[ic + 1] - P[ia + 1], vz = P[ic + 2] - P[ia + 2];
          const cx = uy * vz - uz * vy, cz = ux * vy - uy * vx, nx = acc.N[ia], nz = acc.N[ia + 2];
          this._cylFlip = cx * nx + cz * nz > 0;
        }
        if (this._cylFlip) { acc.tri(b0, t1, b1); acc.tri(b0, t0, t1); } else { acc.tri(b0, b1, t1); acc.tri(b0, t1, t0); }
      }
      if (o.caps !== false) {
        for (const top of [true, false]) {
          if (!top && o.bottom === false) continue;
          if (!top && p.y <= 0.001 && o.bottom !== true) continue;    // on the ground: nobody sees the bottom
          const yy = top ? p.y + H : p.y, ny = top ? 1 : -1;
          const cIdx = acc.v(p.x, yy, p.z, 0, ny, 0, p.x / tile, p.z / tile);
          const first = acc.nv;
          for (let i = 0; i < sides; i++) { const a = th0 + i * TAU / sides; const X = p.x + Math.cos(a) * R, Z = p.z + Math.sin(a) * R; acc.v(X, yy, Z, 0, ny, 0, X / tile, Z / tile); }
          for (let i = 0; i < sides; i++) {
            const a = first + i, b = first + (i + 1) % sides;
            // top: cross must point down (-y) for Babylon front faces
            const P = acc.P, ux = P[a * 3] - P[cIdx * 3], uz = P[a * 3 + 2] - P[cIdx * 3 + 2], vx = P[b * 3] - P[cIdx * 3], vz = P[b * 3 + 2] - P[cIdx * 3 + 2];
            const cy = uz * vx - ux * vz;
            if (cy * ny < 0) acc.tri(cIdx, a, b); else acc.tri(cIdx, b, a);
          }
        }
      }
    }
    if (o.collide === false) return -1;
    return this.world.addCyl({ cx: p.x, cy: p.y + H / 2, cz: p.z, r: R, hy: H / 2, surf: o.surf || this._surf(mat), tag: o.tag });
  }
  ground(o) {
    const T = this.T, ox = T.tx, oy = T.ty, oz = T.tz;
    const mat = o.mat || 'dirt', tile = this._tile(mat) * (o.uv || 1), res = o.res || 2;
    const minX = o.minX + ox, minZ = o.minZ + oz, nx = Math.max(1, Math.round((o.maxX - o.minX) / res)), nz = Math.max(1, Math.round((o.maxZ - o.minZ) / res));
    const maxX = minX + nx * res, maxZ = minZ + nz * res;
    const fy = o.y || 0;
    const fn = o.height ? (x, z) => oy + o.height(x - ox, z - oz) : () => oy + fy;
    this.groundFns.push({ minX, maxX, minZ, maxZ, fn });
    const surf = o.surf || this._surf(mat);
    if (o.height) {
      const W = nx + 1, Hh = nz + 1, hs = new Float32Array(W * Hh);
      for (let j = 0; j < Hh; j++) for (let i = 0; i < W; i++) hs[j * W + i] = fn(minX + i * res, minZ + j * res);
      if (o.collide !== false) this.world.addGround({ minX, maxX, minZ, maxZ, res, heights: hs, surf });
      const H = (i, j) => hs[Math.max(0, Math.min(Hh - 1, j)) * W + Math.max(0, Math.min(W - 1, i))];
      const step = Math.max(1, Math.round(this.chunk / res));
      for (let j0 = 0; j0 < nz; j0 += step) for (let i0 = 0; i0 < nx; i0 += step) {
        const i1 = Math.min(nx, i0 + step), j1 = Math.min(nz, j0 + step);
        const acc = this._acc(mat, minX + (i0 + i1) / 2 * res, minZ + (j0 + j1) / 2 * res, o.cast === true, true);
        const cw = i1 - i0 + 1, chh = j1 - j0 + 1;
        acc.reserve(cw * chh, (cw - 1) * (chh - 1) * 6);
        const base = acc.nv;
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
          const X = minX + i * res, Z = minZ + j * res, Y = H(i, j);
          let gx = (H(i + 1, j) - H(i - 1, j)) / (2 * res), gz = (H(i, j + 1) - H(i, j - 1)) / (2 * res);
          const l = Math.hypot(gx, 1, gz);
          acc.v(X, Y, Z, -gx / l, 1 / l, -gz / l, X / tile, Z / tile);
        }
        for (let j = 0; j < chh - 1; j++) for (let i = 0; i < cw - 1; i++) {
          const a = base + j * cw + i, b = a + 1, c = a + cw, d = c + 1;
          // up-facing: cross(b - a, c - a) . +y < 0 is a Babylon front face (b = +x neighbour, c = +z neighbour)
          acc.tri(a, b, c); acc.tri(b, d, c);
        }
      }
    } else {
      const y = oy + fy;
      for (let z0 = minZ; z0 < maxZ - 1e-6; z0 += this.chunk) for (let x0 = minX; x0 < maxX - 1e-6; x0 += this.chunk) {
        const x1 = Math.min(maxX, x0 + this.chunk), z1 = Math.min(maxZ, z0 + this.chunk);
        const acc = this._acc(mat, (x0 + x1) / 2, (z0 + z1) / 2, false, true);
        QB.set([x0, y, z0, x1, y, z0, x1, y, z1, x0, y, z1]); UB.set([x0 / tile, z0 / tile, x1 / tile, z0 / tile, x1 / tile, z1 / tile, x0 / tile, z1 / tile]);
        quad(acc, QB, 0, 1, 0, UB);
      }
      if (o.collide !== false) this.world.addBox({ cx: (minX + maxX) / 2, cy: y - 0.5, cz: (minZ + maxZ) / 2, hx: (maxX - minX) / 2, hy: 0.5, hz: (maxZ - minZ) / 2, surf });
    }
  }
  collider(o) {
    const T = this.T, p = this.toWorld(o.cx || 0, o.cy || 0, o.cz || 0, {});
    return this.world.addBox({ cx: p.x, cy: p.y, cz: p.z, hx: (o.hx || 0.5) * T.k, hy: (o.hy || 0.5) * T.k, hz: (o.hz || 0.5) * T.k, ry: T.th + (o.ry || 0),
      surf: o.surf || 'concrete', tag: o.tag, ray: o.ray, walk: o.walk, solid: o.solid });
  }

  // ---------------------------------------------------------------------------------------- custom meshes
  mesh(mesh, o = {}) {
    if (!mesh || !mesh.getVerticesData) { this.warn('B.mesh: not a mesh'); return -1; }
    const T = this.T;
    const isIdentity = T.tx === 0 && T.ty === 0 && T.tz === 0 && T.th === 0 && T.k === 1;
    const ry0 = mesh.rotationQuaternion ? null : mesh.rotation.y;
    const yawOnly = !mesh.rotationQuaternion && Math.abs(mesh.rotation.x) < 1e-6 && Math.abs(mesh.rotation.z) < 1e-6 && !mesh.parent;
    // colliders first (from the local bounding box when the mesh is only turned about Y)
    let cid = -1;
    const collide = o.collide === undefined ? 'box' : o.collide;
    const surf = o.surf || (o.mat ? this._surf(o.mat) : 'concrete');
    if (collide === 'box') {
      mesh.computeWorldMatrix(true);
      if (yawOnly) {
        const bi = mesh.getBoundingInfo().boundingBox, mn = bi.minimum, mx = bi.maximum, sc = mesh.scaling;
        const lc = { x: (mn.x + mx.x) / 2 * sc.x, y: (mn.y + mx.y) / 2 * sc.y, z: (mn.z + mx.z) / 2 * sc.z };
        const cy = Math.cos(ry0), sy = Math.sin(ry0);
        const fx = mesh.position.x + lc.x * cy + lc.z * sy, fz = mesh.position.z - lc.x * sy + lc.z * cy, fy = mesh.position.y + lc.y;
        const p = this.toWorld(fx, fy, fz, {});
        cid = this.world.addBox({ cx: p.x, cy: p.y, cz: p.z, hx: Math.abs((mx.x - mn.x) / 2 * sc.x) * T.k, hy: Math.abs((mx.y - mn.y) / 2 * sc.y) * T.k,
          hz: Math.abs((mx.z - mn.z) / 2 * sc.z) * T.k, ry: T.th + ry0, surf, tag: o.tag });
      } else {
        const bw = mesh.getBoundingInfo().boundingBox, mn = bw.minimumWorld, mx = bw.maximumWorld;
        const p = this.toWorld((mn.x + mx.x) / 2, (mn.y + mx.y) / 2, (mn.z + mx.z) / 2, {});
        cid = this.world.addBox({ cx: p.x, cy: p.y, cz: p.z, hx: (mx.x - mn.x) / 2 * T.k, hy: (mx.y - mn.y) / 2 * T.k, hz: (mx.z - mn.z) / 2 * T.k, ry: T.th, surf, tag: o.tag });
      }
    } else if (Array.isArray(collide)) {
      for (const c of collide) cid = this.collider({ ...c, surf: c.surf || surf });
    }
    const matObj = o.mat ? this.mat(o.mat) : mesh.material;
    if (o.merge === false) {
      if (!isIdentity) {
        const p = this.toWorld(mesh.position.x, mesh.position.y, mesh.position.z, {});
        mesh.position.set(p.x, p.y, p.z);
        if (mesh.rotationQuaternion) mesh.rotationQuaternion = BABYLON.Quaternion.RotationYawPitchRoll(T.th, 0, 0).multiply(mesh.rotationQuaternion);
        else mesh.rotation.y += T.th;
        mesh.scaling.scaleInPlace(T.k);
      }
      if (matObj) mesh.material = matObj;
      mesh.isPickable = false; mesh.receiveShadows = o.receive !== false;
      mesh.computeWorldMatrix(true); mesh.freezeWorldMatrix();
      if (o.cast !== false) this.casters.push(mesh);
      this.extraMeshes.push(mesh);
      return cid;
    }
    // merge: bake world matrix (+ frame) into an accumulator of its chunk
    mesh.computeWorldMatrix(true);
    const wm = mesh.getWorldMatrix().m;
    const pos = mesh.getVerticesData(BABYLON.VertexBuffer.PositionKind), nrm = mesh.getVerticesData(BABYLON.VertexBuffer.NormalKind);
    const uv = mesh.getVerticesData(BABYLON.VertexBuffer.UVKind), col = mesh.getVerticesData(BABYLON.VertexBuffer.ColorKind);
    const idx = mesh.getIndices();
    if (!pos || !idx) { mesh.dispose(); return cid; }
    const nvx = pos.length / 3;
    const bc = mesh.getBoundingInfo().boundingBox.centerWorld, ctr = this.toWorld(bc.x, bc.y, bc.z, {});
    const tileName = o.mat || (matObj && matObj.name && MATERIALS[matObj.name.replace(/^m_/, '')] ? matObj.name.replace(/^m_/, '') : null);
    const tile = tileName ? this._tile(tileName) : 2;
    const acc = o.mat ? this._acc(o.mat, ctr.x, ctr.z, o.cast !== false, o.receive !== false)
      : matObj ? this._accMat(matObj, ctr.x, ctr.z, o.cast !== false, o.receive !== false) : this._acc('concrete', ctr.x, ctr.z, o.cast !== false, o.receive !== false);
    if (col && col.length >= nvx * 4) acc.enableColors();
    acc.reserve(nvx, idx.length);
    const base = acc.nv;
    const tmp = {};
    for (let i = 0; i < nvx; i++) {
      const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
      const wx = x * wm[0] + y * wm[4] + z * wm[8] + wm[12], wy = x * wm[1] + y * wm[5] + z * wm[9] + wm[13], wz = x * wm[2] + y * wm[6] + z * wm[10] + wm[14];
      this.toWorld(wx, wy, wz, tmp);
      let nx = 0, ny = 1, nz = 0;
      if (nrm) {
        const a = nrm[i * 3], b = nrm[i * 3 + 1], c = nrm[i * 3 + 2];
        // normal matrix ~ world matrix rotation (uniform scale assumed for props), then the frame's yaw
        let tx = a * wm[0] + b * wm[4] + c * wm[8], ty = a * wm[1] + b * wm[5] + c * wm[9], tz = a * wm[2] + b * wm[6] + c * wm[10];
        const rx = tx * T.c + tz * T.s, rz = -tx * T.s + tz * T.c; const l = Math.hypot(rx, ty, rz) || 1;
        nx = rx / l; ny = ty / l; nz = rz / l;
      }
      let u, v;
      if (uv) { u = uv[i * 2]; v = uv[i * 2 + 1]; }
      else {    // box-projected world UVs by the dominant normal axis
        const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);
        if (ay >= ax && ay >= az) { u = tmp.x / tile; v = tmp.z / tile; } else if (ax >= az) { u = tmp.z / tile; v = tmp.y / tile; } else { u = tmp.x / tile; v = tmp.y / tile; }
      }
      const vi = acc.v(tmp.x, tmp.y, tmp.z, nx, ny, nz, u, v);
      if (acc.C && col && col.length >= nvx * 4) { acc.C[vi * 4] = col[i * 4]; acc.C[vi * 4 + 1] = col[i * 4 + 1]; acc.C[vi * 4 + 2] = col[i * 4 + 2]; acc.C[vi * 4 + 3] = col[i * 4 + 3]; }
    }
    // keep the mesh's own winding (Babylon meshes are already front-facing); a mirrored world matrix flips it
    const det = wm[0] * (wm[5] * wm[10] - wm[6] * wm[9]) - wm[4] * (wm[1] * wm[10] - wm[2] * wm[9]) + wm[8] * (wm[1] * wm[6] - wm[2] * wm[5]);
    for (let t = 0; t < idx.length; t += 3) {
      if (det >= 0) acc.tri(base + idx[t], base + idx[t + 1], base + idx[t + 2]);
      else acc.tri(base + idx[t], base + idx[t + 2], base + idx[t + 1]);
    }
    mesh.dispose(false, false);
    return cid;
  }
  instance(key, buildFn, x, y, z, o = {}) {
    let rec = this.inst.get(key);
    if (!rec) {
      let built = null;
      try { built = buildFn(this); } catch (e) { this.warn('instance "' + key + '" build failed: ' + e.message); }
      const meshes = (Array.isArray(built) ? built : [built]).filter(m => m && m.getVerticesData);
      if (!meshes.length) { this.warn('instance "' + key + '": buildFn returned no mesh'); rec = { meshes: [], bad: true }; this.inst.set(key, rec); return -1; }
      let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
      for (const m of meshes) {
        if (m.parent) m.setParent(null);
        m.bakeCurrentTransformIntoVertices();
        m.refreshBoundingInfo();
        const bb = m.getBoundingInfo().boundingBox;
        mn = [Math.min(mn[0], bb.minimum.x), Math.min(mn[1], bb.minimum.y), Math.min(mn[2], bb.minimum.z)];
        mx = [Math.max(mx[0], bb.maximum.x), Math.max(mx[1], bb.maximum.y), Math.max(mx[2], bb.maximum.z)];
        m.isPickable = false; m.setEnabled(false);
      }
      rec = { meshes, mn, mx, chunks: new Map(), count: 0 };
      this.inst.set(key, rec);
    }
    if (rec.bad) return -1;
    const T = this.T, p = this.toWorld(x, y, z, {}), th = T.th + (o.ry || 0), k = T.k * (o.s || 1);
    const ck = Math.floor(p.x / this.chunk) + ',' + Math.floor(p.z / this.chunk);
    let arr = rec.chunks.get(ck); if (!arr) { arr = []; rec.chunks.set(ck, arr); }
    // row-major Babylon matrix: scale * rotY * translation
    const c = Math.cos(th) * k, s = Math.sin(th) * k;
    arr.push(c, 0, -s, 0, 0, k, 0, 0, s, 0, c, 0, p.x, p.y, p.z, 1);
    rec.count++;
    const collide = o.collide === undefined ? true : o.collide;
    if (collide === true) {
      const lx = (rec.mn[0] + rec.mx[0]) / 2 * k, ly = rec.mn[1] * k, lz = (rec.mn[2] + rec.mx[2]) / 2 * k;
      const cs = Math.cos(th), sn = Math.sin(th);
      return this.world.addBox({ cx: p.x + lx * cs + lz * sn, cy: p.y + ly + (rec.mx[1] - rec.mn[1]) * k / 2, cz: p.z - lx * sn + lz * cs,
        hx: (rec.mx[0] - rec.mn[0]) / 2 * k, hy: (rec.mx[1] - rec.mn[1]) / 2 * k, hz: (rec.mx[2] - rec.mn[2]) / 2 * k, ry: th, surf: o.surf || 'concrete', tag: o.tag });
    }
    if (Array.isArray(collide)) {
      let id = -1;
      this.push(x, y, z, o.ry || 0, o.s || 1);
      for (const cc of collide) id = this.collider(cc);
      this.pop();
      return id;
    }
    return -1;
  }
  model(file, x, y, z, o = {}) {
    const T = this.T, p = this.toWorld(x, y, z, {});
    this.models.push({ file, p, th: T.th + (o.ry || 0), k: T.k * (o.s || 1), collide: o.collide === undefined ? 'box' : o.collide, surf: o.surf || 'concrete', cast: o.cast !== false });
  }
  prop(type, x, y, z, o = {}) {
    try { return placeProp(this, type, x, y, z, o); }
    catch (e) { this.warn('prop "' + type + '" failed: ' + (e && e.message)); return -1; }
  }
  light(o = {}) {
    const p = this.toWorld(o.x || 0, o.y == null ? 2.6 : o.y, o.z || 0, {});
    const spec = { type: o.type === 'spot' ? 'spot' : 'point', x: p.x, y: p.y, z: p.z, color: o.color || [1, 0.9, 0.75],
      intensity: o.intensity == null ? 8 : o.intensity, range: o.range || 0, dir: o.dir || [0, -1, 0], angle: o.angle || 1.1,
      fixture: o.fixture === undefined ? true : o.fixture, flicker: o.flicker || 0, th: this.T.th, shadow: !!o.shadow };
    if (!spec.range) spec.range = Math.max(4, Math.min(30, Math.sqrt(spec.intensity / 0.012)));
    // a ceiling panel / tube is drawn at y and lights DOWNWARD (a wide spot just under it): a bare point light 5 cm under a
    // ceiling blows it out (inverse square). Bulbs and fixture-less lights stay omni point lights.
    spec.fy = spec.y;
    if (spec.type === 'point' && (spec.fixture === true || spec.fixture === 'panel' || spec.fixture === 'tube')) { spec.down = true; spec.y -= 0.06; }
    if (spec.type === 'spot' && this.T.th) { const d = spec.dir, c = this.T.c, s = this.T.s; spec.dir = [d[0] * c + d[2] * s, d[1], -d[0] * s + d[2] * c]; }
    this.lightSpecs.push(spec);
    // emissive fixture
    if (spec.fixture && !spec.flicker) this._fixture(spec, spec.color[2] < 0.85 ? 'emissive_warm' : 'emissive_white');
    return spec;
  }
  _fixture(spec, mat) {
    const kind = spec.fixture === true ? (spec.type === 'spot' ? 'can' : 'panel') : spec.fixture;
    this.push(); this.stack[this.stack.length - 1] = { c: 1, s: 0, th: 0, tx: 0, ty: 0, tz: 0, k: 1 };   // fixtures are placed in world space
    const o = { mat, collide: false, cast: false, ry: spec.th }, y = spec.fy;
    if (kind === 'panel') this.box(spec.x, y - 0.04, spec.z, 0.6, 0.04, 0.6, o);
    else if (kind === 'tube') this.box(spec.x, y - 0.05, spec.z, 1.2, 0.05, 0.12, o);
    else if (kind === 'can') { this.cyl(spec.x, y - 0.1, spec.z, 0.09, 0.12, { mat: 'steel_dark', sides: 10, collide: false, cast: false }); this.cyl(spec.x, y - 0.12, spec.z, 0.07, 0.025, { mat, sides: 10, collide: false, cast: false }); }
    else if (kind === 'bulb') this.cyl(spec.x, y - 0.05, spec.z, 0.05, 0.1, { mat, sides: 8, collide: false, cast: false });
    this.pop();
  }

  // ---------------------------------------------------------------------------------------- markers
  spawn(team, x, y, z, yaw = 0, o = {}) {
    const p = this.toWorld(x, y == null ? 0 : y, z, {});
    const t = team === 1 || team === 2 ? team : 0;
    this.info.spawns[t].push({ x: p.x, y: y == null ? null : p.y, z: p.z, yaw: (yaw || 0) + this.T.th, field: !!o.field, team: t });
  }
  _rect(r) {
    const a = this.toWorld(r.x0, r.y || 0, r.z0, {}), b = this.toWorld(r.x1, r.y || 0, r.z1, {});
    const c = this.toWorld(r.x0, r.y || 0, r.z1, {}), d = this.toWorld(r.x1, r.y || 0, r.z0, {});
    const x0 = Math.min(a.x, b.x, c.x, d.x), x1 = Math.max(a.x, b.x, c.x, d.x), z0 = Math.min(a.z, b.z, c.z, d.z), z1 = Math.max(a.z, b.z, c.z, d.z);
    return { x0, z0, x1, z1, y: r.y == null ? null : a.y, x: (x0 + x1) / 2, z: (z0 + z1) / 2 };
  }
  lobby(team, rect, gates = []) {
    const L = this._rect(rect); L.team = team; L.gates = [];
    this.info.lobbies[team] = L;
    for (const g of gates) {
      const w = g.w || 2.4, h = g.h || 2.6, gy = g.y == null ? (rect.y || 0) : g.y;
      const p = this.toWorld(g.x, gy, g.z, {}), th = this.T.th + (g.ry || 0);
      const id = this.world.addBox({ cx: p.x, cy: p.y + h / 2, cz: p.z, hx: w / 2, hy: h / 2 + 0.05, hz: 0.12, ry: th, surf: 'sheetmetal', tag: 'gate' });
      const gate = { id, team, x: p.x, y: p.y, z: p.z, w, h, ry: th, open: false, t: 0, mesh: null };
      this.info.gates.push(id); this.info.gateList.push(gate); L.gates.push(id);
      // fixed housing above the opening (merged), the shutter itself is its own mesh so it can roll up
      this.push(); this.stack[this.stack.length - 1] = { c: 1, s: 0, th: 0, tx: 0, ty: 0, tz: 0, k: 1 };
      this.box(p.x, p.y + h, p.z, w + 0.2, 0.32, 0.36, { mat: 'metal_painted', ry: th, collide: false });
      this.pop();
    }
    if (!this.info.buyzones[team] || !this.info.buyzones[team].length) this.info.buyzones[team] = [{ ...L, auto: true }];
  }
  buyzone(team, rect) {
    const R = this._rect(rect);
    const list = this.info.buyzones[team] || (this.info.buyzones[team] = []);
    if (list.length === 1 && list[0].auto) list.length = 0;
    list.push(R);
  }
  hide(x, y, z, o = {}) { const p = this.toWorld(x, y == null ? 0 : y, z, {}); this.info.hides.push({ x: p.x, y: y == null ? null : p.y, z: p.z, r: o.r || 0.8, kind: o.kind || 'dark' }); }
  site(name, rect) { const R = this._rect(rect); R.name = name; this.info.sites[name] = R; }
  hostage(x, y, z) { const p = this.toWorld(x, y == null ? 0 : y, z, {}); this.info.hostages.push({ x: p.x, y: y == null ? null : p.y, z: p.z }); }
  rescue(rect) { const R = this._rect(rect); this.info.rescues.push(R); if (!this.info.rescue) this.info.rescue = R; }
  point(name, x, y, z, r = 3) { const p = this.toWorld(x, y == null ? 0 : y, z, {}); this.info.points[name] = { x: p.x, y: y == null ? null : p.y, z: p.z, r }; }

  // ---------------------------------------------------------------------------------------- finalize
  /** Materials with little geometry are merged across chunks (one draw call instead of one per chunk). */
  _mergeSparse(limit = 6000) {
    const groups = new Map();
    for (const a of this.accs.values()) {
      if (!a.ni) continue;
      const g = (a.mat ? '#' + a.mat.uniqueId : a.matName) + '|' + a.cast + a.receive;
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push(a);
    }
    for (const list of groups.values()) {
      if (list.length < 2) continue;
      let nv = 0, ni = 0, col = false;
      for (const a of list) { nv += a.nv; ni += a.ni; col = col || !!a.C; }
      if (nv > limit) continue;
      const m = new Acc(list[0].key + '|all', list[0].matName, list[0].mat, list[0].cast, list[0].receive, 'all');
      if (col) m.enableColors();
      m.reserve(nv, ni);
      for (const a of list) {
        const base = m.nv;
        m.P.set(a.P.subarray(0, a.nv * 3), base * 3); m.N.set(a.N.subarray(0, a.nv * 3), base * 3); m.U.set(a.U.subarray(0, a.nv * 2), base * 2);
        if (col) { if (a.C) m.C.set(a.C.subarray(0, a.nv * 4), base * 4); else m.C.fill(1, base * 4, (base + a.nv) * 4); }
        for (let i = 0; i < a.ni; i++) m.I[m.ni + i] = a.I[i] + base;
        m.nv += a.nv; m.ni += a.ni;
        this.accs.delete(a.key);
      }
      this.accs.set(m.key, m);
    }
  }
  _flush() {
    const scene = this.scene, meshes = this.info.meshes;
    let tris = 0;
    if (this.opts.mergeSparse !== false) this._mergeSparse();
    for (const a of this.accs.values()) {
      if (!a.ni) continue;
      const m = new BABYLON.Mesh('map_' + a.matName + '_' + a.chunk, scene);
      const vd = new BABYLON.VertexData();
      vd.positions = a.P.subarray(0, a.nv * 3); vd.normals = a.N.subarray(0, a.nv * 3); vd.uvs = a.U.subarray(0, a.nv * 2);
      if (a.C) vd.colors = a.C.subarray(0, a.nv * 4);
      vd.indices = a.I.subarray(0, a.ni);
      vd.applyToMesh(m, false);
      m.material = a.mat || this.mat(a.matName);
      if (a.C && m.material && m.material.useVertexColors === false) { /* material decides */ }
      m.isPickable = false; m.receiveShadows = a.receive;
      m.freezeWorldMatrix(); m.doNotSyncBoundingInfo = true;
      m.metadata = { map: true, chunk: a.chunk, mat: a.matName };
      meshes.push(m);
      if (a.cast) this.casters.push(m);
      tris += a.ni / 3;
    }
    // thin instances
    for (const [key, rec] of this.inst) {
      if (rec.bad || !rec.count) { if (rec.meshes) rec.meshes.forEach(m => m.dispose()); continue; }
      for (const src of rec.meshes) {
        let first = true;
        for (const [ck, arr] of rec.chunks) {
          let m = src;
          if (!first) { m = src.clone(src.name + '_' + ck, null, true); m.makeGeometryUnique(); }
          first = false;
          m.setEnabled(true);
          m.thinInstanceSetBuffer('matrix', new Float32Array(arr), 16, true);
          m.thinInstanceRefreshBoundingInfo(false);
          m.isPickable = false; m.receiveShadows = true;
          m.freezeWorldMatrix(); m.doNotSyncBoundingInfo = true;
          m.metadata = { map: true, instance: key, chunk: ck };
          meshes.push(m); this.casters.push(m);
          const ti = src.getTotalIndices ? src.getTotalIndices() : 0;
          tris += ti / 3 * arr.length / 16;
        }
      }
    }
    for (const m of this.extraMeshes) { meshes.push(m); const ti = m.getTotalIndices ? m.getTotalIndices() : 0; tris += ti / 3; }
    this.info.stats.tris = Math.round(tris);
  }
  async _loadModels() {
    if (!this.models.length) return;
    const scene = this.scene, byFile = new Map();
    for (const m of this.models) { if (!byFile.has(m.file)) byFile.set(m.file, []); byFile.get(m.file).push(m); }
    for (const [file, list] of byFile) {
      let cont = null;
      try {
        const slash = file.lastIndexOf('/');
        cont = await BABYLON.SceneLoader.LoadAssetContainerAsync(file.slice(0, slash + 1), file.slice(slash + 1), scene);
      } catch (e) { this.warn('model "' + file + '" failed to load: ' + (e && e.message)); continue; }
      this._containers = this._containers || []; this._containers.push(cont);
      for (const m of list) {
        const inst = cont.instantiateModelsToScene(n => n + '_i', false, { doNotInstantiate: false });
        const root = inst.rootNodes[0];
        if (!root) continue;
        const holder = new BABYLON.TransformNode('model_' + file, scene);
        for (const r of inst.rootNodes) r.parent = holder;
        holder.position.set(m.p.x, m.p.y, m.p.z); holder.rotation.y = m.th; holder.scaling.setAll(m.k);
        holder.computeWorldMatrix(true);
        const ms = holder.getChildMeshes(false);
        for (const mm of ms) { mm.isPickable = false; mm.receiveShadows = true; mm.computeWorldMatrix(true); mm.freezeWorldMatrix(); this.extraMeshes.push(mm); if (m.cast) this.casters.push(mm); }
        this._holders = this._holders || []; this._holders.push(holder);
        if (m.collide === 'box' && ms.length) {
          const { min, max } = holder.getHierarchyBoundingVectors(true);
          this.world.addBox({ cx: (min.x + max.x) / 2, cy: (min.y + max.y) / 2, cz: (min.z + max.z) / 2, hx: (max.x - min.x) / 2, hy: (max.y - min.y) / 2, hz: (max.z - min.z) / 2, surf: m.surf });
        } else if (Array.isArray(m.collide)) {
          const c = Math.cos(m.th), s = Math.sin(m.th);
          for (const cc of m.collide) this.world.addBox({ cx: m.p.x + (cc.cx * c + cc.cz * s) * m.k, cy: m.p.y + cc.cy * m.k, cz: m.p.z + (-cc.cx * s + cc.cz * c) * m.k,
            hx: cc.hx * m.k, hy: cc.hy * m.k, hz: cc.hz * m.k, ry: m.th + (cc.ry || 0), surf: cc.surf || m.surf });
        }
      }
    }
  }
  _gateMeshes() {
    for (const g of this.info.gateList) {
      const m = this._soloBox('gate_' + g.id, g.x, g.y, g.z, g.w, g.h, 0.06, g.ry, 'corrugated');
      m.metadata = { gate: g.id };
      g.mesh = m; this.info.meshes.push(m); this.casters.push(m);
    }
  }
  _boundsWalls() {
    const b = this.def.bounds; if (!b || b.walls === false) return;
    const y0 = (b.minY == null ? -20 : b.minY) - 5, y1 = (b.maxY == null ? 40 : b.maxY) + 30, hy = (y1 - y0) / 2, cy = (y0 + y1) / 2, t = 1;
    const add = (cx, cz, hx, hz) => this.world.addBox({ cx, cy, cz, hx, hy, hz, surf: 'concrete', ray: false, walk: false, tag: 'bounds' });
    add((b.minX + b.maxX) / 2, b.minZ - t, (b.maxX - b.minX) / 2 + 2 * t, t);
    add((b.minX + b.maxX) / 2, b.maxZ + t, (b.maxX - b.minX) / 2 + 2 * t, t);
    add(b.minX - t, (b.minZ + b.maxZ) / 2, t, (b.maxZ - b.minZ) / 2);
    add(b.maxX + t, (b.minZ + b.maxZ) / 2, t, (b.maxZ - b.minZ) / 2);
  }
  _snapMarkers() {
    const W = this.world, G = {};
    const snap = (p, keep) => {
      const from = p.y == null ? 1e4 : p.y + 0.6;
      const g = W.groundAt(p.x, p.z, from, 0.05, G);
      if (g && (p.y == null || Math.abs(g.y - p.y) < 0.6)) p.y = g.y;
      else if (p.y == null) { p.y = 0; if (!keep) this.warn('marker at ' + p.x.toFixed(1) + ',' + p.z.toFixed(1) + ' has no ground under it'); }
    };
    for (const t of [0, 1, 2]) for (const s of this.info.spawns[t]) snap(s);
    for (const h of this.info.hides) snap(h);
    for (const h of this.info.hostages) snap(h);
    for (const k in this.info.points) snap(this.info.points[k]);
    for (const k in this.info.sites) { const s = this.info.sites[k]; if (s.y == null) { const q = { x: s.x, y: null, z: s.z }; snap(q, true); s.y = q.y; } }
    for (const r of this.info.rescues) if (r.y == null) { const q = { x: r.x, y: null, z: r.z }; snap(q, true); r.y = q.y; }
    for (const t in this.info.lobbies) { const L = this.info.lobbies[t]; if (L.y == null) { const q = { x: L.x, y: null, z: L.z }; snap(q, true); L.y = q.y; } }
  }
  _lights() {
    const scene = this.scene, specs = this.lightSpecs, out = this.info.lights;
    if (!specs.length) return;
    const want = this.opts.lights || 'auto';
    let cont = null;
    if (want !== 'chunks' && BABYLON.ClusteredLightContainer) {
      try {
        cont = new BABYLON.ClusteredLightContainer('mapLights', [], scene);
        if (!cont.isSupported) { cont.dispose(); cont = null; }
      } catch (e) { cont = null; }
    }
    this.info.lightMode = cont ? 'clustered' : 'chunks';
    this._lightCont = cont;
    for (let i = 0; i < specs.length; i++) {
      const s = specs[i];
      let L;
      if (s.type === 'spot') {
        const d = new BABYLON.Vector3(s.dir[0], s.dir[1], s.dir[2]).normalize();
        L = new BABYLON.SpotLight('ml' + i, new BABYLON.Vector3(s.x, s.y, s.z), d, s.angle, 2, scene);
      } else if (s.down) L = new BABYLON.SpotLight('ml' + i, new BABYLON.Vector3(s.x, s.y, s.z), new BABYLON.Vector3(0, -1, 0), 2.6, 1.2, scene);
      else L = new BABYLON.PointLight('ml' + i, new BABYLON.Vector3(s.x, s.y, s.z), scene);
      L.diffuse = new BABYLON.Color3(s.color[0], s.color[1], s.color[2]);
      L.specular = L.diffuse.scale(0.5);
      L.intensity = s.intensity; L.range = s.range;
      const rec = { light: L, spec: s, base: s.intensity, flicker: s.flicker, ph: i * 1.7, fixture: null };
      if (s.fixture && s.flicker) {
        // a flickering fixture needs its own emissive material
        const kind = s.fixture === true ? (s.type === 'spot' ? 'can' : 'panel') : s.fixture;
        const fm = BABYLON.MeshBuilder.CreateBox('fixture' + i, kind === 'tube' ? { width: 1.2, height: 0.05, depth: 0.12 } : { width: 0.6, height: 0.04, depth: 0.6 }, scene);
        fm.position.set(s.x, (s.fy == null ? s.y : s.fy) - 0.03, s.z); fm.rotation.y = s.th;
        const em = new BABYLON.StandardMaterial('fixtureMat' + i, scene);
        em.disableLighting = true; em.emissiveColor = new BABYLON.Color3(s.color[0], s.color[1], s.color[2]);
        fm.material = em; fm.isPickable = false;
        rec.fixture = fm; rec.fixMat = em; this.info.meshes.push(fm);
      }
      if (cont) cont.addLight(L);
      out.push(rec);
    }
    if (!cont) {
      // fallback: every light only lights the chunk meshes it reaches; at most MAXL map lights per mesh
      const MAXL = 6;
      const meshes = this.info.meshes.filter(m => m.metadata && m.metadata.map);
      const per = new Map();
      for (const rec of out) {
        const L = rec.light, inc = [];
        for (const m of meshes) {
          const bb = m.getBoundingInfo().boundingBox, mn = bb.minimumWorld, mx = bb.maximumWorld, p = L.position, r = L.range;
          const dx = Math.max(mn.x - p.x, 0, p.x - mx.x), dy = Math.max(mn.y - p.y, 0, p.y - mx.y), dz = Math.max(mn.z - p.z, 0, p.z - mx.z);
          if (dx * dx + dy * dy + dz * dz <= r * r) { inc.push(m); const l = per.get(m) || []; l.push({ rec, d: Math.hypot(dx, dy, dz) / Math.max(1, Math.sqrt(rec.base)) }); per.set(m, l); }
        }
        rec._inc = inc;
      }
      for (const [m, list] of per) {
        if (list.length <= MAXL) continue;
        list.sort((a, b) => a.d - b.d);
        for (const it of list.slice(MAXL)) it.rec._inc = it.rec._inc.filter(x => x !== m);
      }
      for (const rec of out) { rec.light.includedOnlyMeshes = rec._inc; delete rec._inc; }
      const mats = new Set(meshes.map(m => m.material).filter(Boolean));
      for (const mt of mats) if (mt.maxSimultaneousLights < MAXL + 3) mt.maxSimultaneousLights = MAXL + 3;
    }
  }

  async finish() {
    const t0 = performance.now();
    await this._loadModels();
    const tModels = performance.now();
    this._gateMeshes();
    this._flush();
    const tMesh = performance.now();
    this._boundsWalls();
    this.world.build();
    this._snapMarkers();
    const tWorld = performance.now();
    this._lights();
    const tLights = performance.now();
    const info = this.info;
    if (this.opts.nav !== false) {
      try { info.nav = buildNav(this.world, this.def.bounds || this._autoBounds(), { gates: info.gateList }); }
      catch (e) { this.warn('navgrid build failed: ' + (e && e.message)); console.error(e); }
    }
    const tNav = performance.now();
    Object.assign(info.stats, {
      meshes: info.meshes.length, colliders: this.world.stats().colliders, lights: info.lights.length, lightMode: info.lightMode || 'none',
      msModels: Math.round(tModels - t0), msMeshes: Math.round(tMesh - tModels), msWorld: Math.round(tWorld - tMesh),
      msLights: Math.round(tLights - tWorld), msNav: Math.round(tNav - tLights),
      navNodes: info.nav ? info.nav.nodeCount : 0,
    });
    return info;
  }
  _autoBounds() {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const c of this.world.cols) { if (!c.alive || c.tag === 'bounds') continue; minX = Math.min(minX, c.minX); maxX = Math.max(maxX, c.maxX); minZ = Math.min(minZ, c.minZ); maxZ = Math.max(maxZ, c.maxZ); minY = Math.min(minY, c.minY); maxY = Math.max(maxY, c.maxY); }
    return { minX, maxX, minZ, maxZ, minY, maxY };
  }
}

// ------------------------------------------------------------------------------------------------ entry point
export async function buildMap(scene, def, opts = {}) {
  if (!def || typeof def.build !== 'function') throw new Error('buildMap: MapDef without build(B)');
  const t0 = performance.now();
  await initMaterials(scene, { quality: opts.quality });
  const B = new MapBuilder(scene, def, opts);
  if (opts.onProgress) opts.onProgress('geometry');
  const r = def.build(B);
  if (r && typeof r.then === 'function') await r;
  if (B.stack.length !== 1) { B.warn('B.push() without pop() (' + (B.stack.length - 1) + ' left open)'); B.stack.length = 1; }
  if (opts.onProgress) opts.onProgress('finalize');
  const tBuild = performance.now();
  const info = await B.finish();
  info.stats.msDef = Math.round(tBuild - t0);
  info.stats.msTotal = Math.round(performance.now() - t0);

  // ------------------------------------------------------------------ runtime helpers
  const gateAnim = [];
  info.openGates = (team) => {
    for (const g of info.gateList) {
      if (team && g.team !== team) continue;
      if (g.open) continue;
      g.open = true; info.world.setSolid(g.id, false);
      if (info.nav) info.nav.setGate(g.id, true);
      gateAnim.push(g);
    }
  };
  info.closeGates = () => {
    for (const g of info.gateList) {
      g.open = false; g.t = 0; info.world.setSolid(g.id, true);
      if (info.nav) info.nav.setGate(g.id, false);
      if (g.mesh) { g.mesh.setEnabled(true); g.mesh.position.y = g.y + g.h / 2; g.mesh.scaling.y = 1; }
    }
    gateAnim.length = 0;
  };
  let time = 0;
  info.update = (dt) => {
    time += dt;
    for (let i = gateAnim.length - 1; i >= 0; i--) {
      const g = gateAnim[i]; g.t = Math.min(1, g.t + dt / 1.2);
      if (g.mesh) {
        const k = 1 - g.t * g.t * (3 - 2 * g.t);                     // roll up into the housing
        g.mesh.scaling.y = Math.max(0.02, k); g.mesh.position.y = g.y + g.h - g.h * k / 2;
        if (g.t >= 1) g.mesh.setEnabled(false);
      }
      if (g.t >= 1) gateAnim.splice(i, 1);
    }
    for (const L of info.lights) {
      if (!L.flicker) continue;
      const n = Math.sin(time * 13.1 + L.ph) * 0.5 + Math.sin(time * 37.7 + L.ph * 2.3) * 0.3 + Math.sin(time * 3.3 + L.ph) * 0.2;
      const drop = Math.sin(time * 0.9 + L.ph * 5) > 0.93 ? 0.15 : 1;      // occasional dropouts
      const k = Math.max(0, (1 - L.flicker * (0.5 + 0.5 * n))) * drop;
      L.light.intensity = L.base * k;
      if (L.fixMat) L.fixMat.emissiveColor.set(L.spec.color[0] * (0.25 + 0.75 * k), L.spec.color[1] * (0.25 + 0.75 * k), L.spec.color[2] * (0.25 + 0.75 * k));
    }
  };
  info.dispose = () => {
    for (const m of info.meshes) { try { m.dispose(false, false); } catch (e) { /* already gone */ } }
    for (const L of info.lights) { try { L.light.dispose(); } catch (e) { /* gone */ } if (L.fixMat) L.fixMat.dispose(); }
    if (B._lightCont) { try { B._lightCont.dispose(); } catch (e) { /* gone */ } }
    for (const h of B._holders || []) h.dispose(false, false);
    for (const c of B._containers || []) c.dispose();
    if (info.nav && info.nav.dispose) info.nav.dispose();
    info.meshes.length = 0; info.lights.length = 0; info.casters.length = 0;
  };
  return info;
}
