/* LIVE FIRE — static collision world. PURE JS (no BABYLON): runs in Node tests, on the host and on clients.
   Exports:
     World            class (below)
     SURFACES         the surface names (footsteps, penetration, impacts)
     KIND             { BOX: 0, RAMP: 1, CYL: 2 }  collider kinds
   World API (all coordinates in metres, Y up, yaw = rotation about +Y like Babylon's rotation.y):
     addBox({ cx, cy, cz, hx, hy, hz, ry = 0, surf = 'concrete', solid = true, ray = true, walk = true, tag = null, data }) -> id
                         centre + half extents; ry rotates the footprint about Y (multiples of 90 degrees become plain AABBs)
     addRamp({ cx, cz, hx, hz, y0, y1, axis: 'x'|'z', ry = 0, base = min(y0, y1), surf, ... }) -> id
                         solid wedge: walkable slope from y0 at the -axis end to y1 at the +axis end (local axes), flat bottom at base
     addCyl({ cx, cy, cz, r, hy, surf, ... }) -> id        vertical cylinder (pillars, poles, tanks, trees)
     setGround({ minX, maxX, minZ, maxZ, res, heights: Float32Array, surf }) replaces every heightfield with this one
     addGround(sameArgs) -> field index           adds another heightfield (row-major, x fastest, nx = round((maxX-minX)/res)+1)
     remove(id); setSolid(id, bool) (movement AND rays); setRay(id, bool); get(id) -> collider record (read-only please)
     build()             (re)build the BVH; colliders added after build() still work (scanned linearly until the next build)
     groundAt(x, z, yFrom, radius = 0, out?) -> { y, surf, id, nx, ny, nz } | null   highest walkable top at or below yFrom
                         touching the circle (ramps: slope height at the point of the ramp closest to the centre)
     ceilingAt(x, z, yFrom, radius = 0) -> lowest solid bottom at or above yFrom over the circle (Infinity if none)
     overlapCylinder(x, y, z, r, h, out?) -> [ids]  solid colliders intersecting the vertical cylinder [y, y + h] (heightfields: -1 - index)
     blocked(x, y, z, r, h, ignoreTag?) -> bool      same test, early out
     heightAt(x, z) -> terrain height (-Infinity outside every heightfield)
     query(minX, minY, minZ, maxX, maxY, maxZ, out, mask = Q_SOLID) -> count    raw AABB query (ids pushed into out, out.length reset)
     footClosest(col, x, z, S) / topAt(col, x, z)    shape helpers used by move.js and the navgrid
   Collider records are plain objects: { id, k, cx, cy, cz, hx, hy, hz, ry, c, s, r, y0, y1, ax, bot, top, minX..maxZ,
     surf, solid, ray, walk, tag, alive, data }.  `version` increases on every change (caches can compare it). */

export const SURFACES = ['concrete', 'brick', 'plaster', 'wood', 'metal', 'sheetmetal', 'glass', 'tile', 'carpet', 'dirt', 'grass',
  'gravel', 'sand', 'snow', 'water', 'mud', 'asphalt', 'fabric', 'rubber'];
export const KIND = { BOX: 0, RAMP: 1, CYL: 2 };
export const Q_SOLID = 1, Q_RAY = 2, Q_ANY = 4;

const BOX = 0, RAMP = 1, CYL = 2;
const EPS = 1e-4;
const HALF_PI = Math.PI / 2;
const LEAF = 4;

function normRot(ry) {
  ry = +ry || 0;
  const q = ry / HALF_PI, k = Math.round(q);
  if (Math.abs(q - k) < 1e-6) return { ry: 0, swap: (((k % 2) + 2) % 2) === 1 };
  return { ry, swap: false };
}

export class World {
  constructor() {
    this.cols = [];
    this.fields = [];
    this.extra = [];
    this.version = 0;
    this.built = false;
    // BVH (typed arrays, filled by build())
    this.nMin = null; this.nMax = null; this.nLeft = null; this.nRight = null; this.nStart = null; this.nCount = null;
    this.items = null; this.nodeCount = 0;
    this._stack = new Int32Array(256);
    this._q = [];
    this._S = { lx: 0, lz: 0, qx: 0, qz: 0, wx: 0, wz: 0, d2: 0, inside: false };
  }

  // ---------------------------------------------------------------------------------------- adding
  _push(c) {
    c.id = this.cols.length; c.alive = true; this.cols.push(c);
    if (this.built) this.extra.push(c.id);
    this.version++;
    return c.id;
  }
  _common(o, c) {
    c.surf = o.surf || 'concrete';
    c.solid = o.solid !== false; c.ray = o.ray !== undefined ? !!o.ray : c.solid; c.walk = o.walk !== false;
    c.tag = o.tag == null ? null : o.tag; c.data = o.data == null ? null : o.data;
    return c;
  }
  addBox(o) {
    let hx = Math.abs(+o.hx || 0), hz = Math.abs(+o.hz || 0);
    const hy = Math.abs(+o.hy || 0);
    const R = normRot(o.ry);
    if (R.swap) { const t = hx; hx = hz; hz = t; }
    const c = this._common(o, { k: BOX, cx: +o.cx || 0, cy: +o.cy || 0, cz: +o.cz || 0, hx, hy, hz, ry: R.ry, c: Math.cos(R.ry), s: Math.sin(R.ry), r: 0 });
    c.bot = c.cy - hy; c.top = c.cy + hy;
    this._aabbRect(c);
    if (!(hx > 0 && hz > 0 && hy >= 0) || !Number.isFinite(c.cx + c.cy + c.cz)) throw new Error('World.addBox: bad box ' + JSON.stringify(o));
    return this._push(c);
  }
  addRamp(o) {
    let hx = Math.abs(+o.hx || 0), hz = Math.abs(+o.hz || 0);
    let ax = o.axis === 'z' ? 1 : 0;
    let y0 = +o.y0 || 0, y1 = +o.y1 || 0;
    const R = normRot(o.ry);
    let ry = R.ry;
    if (R.swap) {
      // a 90/270 degree turn: swap extents and the slope axis, and flip the direction where needed
      const t = hx; hx = hz; hz = t;
      const k = ((Math.round((+o.ry || 0) / HALF_PI) % 4) + 4) % 4;   // 1 or 3
      // local +x at ry=90 maps to world -z; local +z maps to world +x
      if (ax === 0) { ax = 1; if (k === 1) { const s = y0; y0 = y1; y1 = s; } }
      else { ax = 0; if (k === 3) { const s = y0; y0 = y1; y1 = s; } }
    } else if (ry === 0) {
      const k = ((Math.round((+o.ry || 0) / HALF_PI) % 4) + 4) % 4;   // 0 or 2
      if (k === 2) { const s = y0; y0 = y1; y1 = s; }
    }
    const base = o.base != null ? +o.base : Math.min(y0, y1);
    const top = Math.max(y0, y1);
    const c = this._common(o, { k: RAMP, cx: +o.cx || 0, cz: +o.cz || 0, hx, hz, ry, c: Math.cos(ry), s: Math.sin(ry), r: 0, y0, y1, ax, base });
    c.bot = base; c.top = top; c.cy = (base + top) / 2; c.hy = (top - base) / 2;
    c.slope = (y1 - y0) / (2 * (ax === 0 ? hx : hz));
    // walkable surface normal (world): local gradient along the axis
    const gl = c.slope, inv = 1 / Math.hypot(gl, 1);
    const glx = ax === 0 ? -gl : 0, glz = ax === 1 ? -gl : 0;
    c.nx = (glx * c.c + glz * c.s) * inv; c.nz = (-glx * c.s + glz * c.c) * inv; c.ny = inv;
    this._aabbRect(c);
    if (!(hx > 0 && hz > 0) || !(top >= base)) throw new Error('World.addRamp: bad ramp ' + JSON.stringify(o));
    return this._push(c);
  }
  addCyl(o) {
    const r = Math.abs(+o.r || 0), hy = Math.abs(+o.hy || 0);
    const c = this._common(o, { k: CYL, cx: +o.cx || 0, cy: +o.cy || 0, cz: +o.cz || 0, hx: r, hy, hz: r, ry: 0, c: 1, s: 0, r });
    c.bot = c.cy - hy; c.top = c.cy + hy;
    c.minX = c.cx - r; c.maxX = c.cx + r; c.minZ = c.cz - r; c.maxZ = c.cz + r; c.minY = c.bot; c.maxY = c.top;
    if (!(r > 0)) throw new Error('World.addCyl: bad radius');
    return this._push(c);
  }
  _aabbRect(c) {
    const ac = Math.abs(c.c), as = Math.abs(c.s);
    const ex = c.hx * ac + c.hz * as, ez = c.hx * as + c.hz * ac;
    c.minX = c.cx - ex; c.maxX = c.cx + ex; c.minZ = c.cz - ez; c.maxZ = c.cz + ez; c.minY = c.bot; c.maxY = c.top;
  }
  setGround(o) { this.fields.length = 0; return this.addGround(o); }
  addGround(o) {
    const res = +o.res || 1;
    const nx = Math.round((o.maxX - o.minX) / res) + 1, nz = Math.round((o.maxZ - o.minZ) / res) + 1;
    const h = o.heights instanceof Float32Array ? o.heights : Float32Array.from(o.heights || []);
    if (h.length < nx * nz) throw new Error('World.addGround: heights has ' + h.length + ' values, needs ' + nx * nz);
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < nx * nz; i++) { const v = h[i]; if (v < lo) lo = v; if (v > hi) hi = v; }
    const f = { minX: +o.minX, maxX: +o.minX + (nx - 1) * res, minZ: +o.minZ, maxZ: +o.minZ + (nz - 1) * res, res, nx, nz, h,
      lo, hi, surf: o.surf || 'dirt', walk: o.walk !== false, ray: o.ray !== false };
    this.fields.push(f); this.version++;
    return this.fields.length - 1;
  }

  remove(id) { const c = this.cols[id]; if (c && c.alive) { c.alive = false; this.version++; } }
  setSolid(id, on) { const c = this.cols[id]; if (c) { c.solid = !!on; c.ray = !!on; this.version++; } }
  setRay(id, on) { const c = this.cols[id]; if (c) { c.ray = !!on; this.version++; } }
  get(id) { return this.cols[id] || null; }
  get count() { return this.cols.length; }

  // ---------------------------------------------------------------------------------------- BVH
  build() {
    const ids = [];
    for (const c of this.cols) if (c.alive) ids.push(c.id);
    const n = ids.length;
    const maxNodes = 2 * n + 2;
    this.nMin = new Float32Array(maxNodes * 3); this.nMax = new Float32Array(maxNodes * 3);
    this.nLeft = new Int32Array(maxNodes); this.nRight = new Int32Array(maxNodes);
    this.nStart = new Int32Array(maxNodes); this.nCount = new Int32Array(maxNodes);
    this.items = Int32Array.from(ids);
    const cen = new Float32Array(this.cols.length * 3);
    for (const id of ids) { const c = this.cols[id]; cen[id * 3] = (c.minX + c.maxX) / 2; cen[id * 3 + 1] = (c.minY + c.maxY) / 2; cen[id * 3 + 2] = (c.minZ + c.maxZ) / 2; }
    this.nodeCount = 0;
    if (n === 0) { this._leaf(0, 0); }
    else this._buildNode(0, n, cen);
    this.extra.length = 0; this.built = true; this.version++;
    return this;
  }
  _leaf(start, count) {
    const i = this.nodeCount++;
    this.nLeft[i] = -1; this.nRight[i] = -1; this.nStart[i] = start; this.nCount[i] = count;
    this._bounds(i, start, count);
    return i;
  }
  _bounds(i, start, count) {
    let a = Infinity, b = Infinity, c = Infinity, d = -Infinity, e = -Infinity, f = -Infinity;
    for (let k = start; k < start + count; k++) {
      const col = this.cols[this.items[k]];
      if (col.minX < a) a = col.minX; if (col.minY < b) b = col.minY; if (col.minZ < c) c = col.minZ;
      if (col.maxX > d) d = col.maxX; if (col.maxY > e) e = col.maxY; if (col.maxZ > f) f = col.maxZ;
    }
    if (count === 0) { a = b = c = 0; d = e = f = 0; }
    this.nMin[i * 3] = a; this.nMin[i * 3 + 1] = b; this.nMin[i * 3 + 2] = c;
    this.nMax[i * 3] = d; this.nMax[i * 3 + 1] = e; this.nMax[i * 3 + 2] = f;
  }
  _buildNode(start, count, cen) {
    if (count <= LEAF) return this._leaf(start, count);
    const i = this.nodeCount++;
    this._bounds(i, start, count);
    // split on the longest axis of the centroid bounds, at the median (quickselect)
    let lo0 = Infinity, lo1 = Infinity, lo2 = Infinity, hi0 = -Infinity, hi1 = -Infinity, hi2 = -Infinity;
    const it = this.items;
    for (let k = start; k < start + count; k++) {
      const id = it[k], x = cen[id * 3], y = cen[id * 3 + 1], z = cen[id * 3 + 2];
      if (x < lo0) lo0 = x; if (x > hi0) hi0 = x; if (y < lo1) lo1 = y; if (y > hi1) hi1 = y; if (z < lo2) lo2 = z; if (z > hi2) hi2 = z;
    }
    const ex = hi0 - lo0, ey = hi1 - lo1, ez = hi2 - lo2;
    const axis = ex >= ey && ex >= ez ? 0 : ey >= ez ? 1 : 2;
    const mid = start + (count >> 1);
    select(it, start, start + count - 1, mid, cen, axis);
    this.nStart[i] = start; this.nCount[i] = 0;
    this.nLeft[i] = this._buildNode(start, mid - start, cen);
    this.nRight[i] = this._buildNode(mid, start + count - mid, cen);
    return i;
  }

  /** Raw AABB query: pushes the ids of live colliders whose AABB overlaps the box into out (out.length is reset). */
  query(minX, minY, minZ, maxX, maxY, maxZ, out, mask = Q_SOLID) {
    out.length = 0;
    const cols = this.cols;
    if (this.built && this.nodeCount) {
      const st = this._stack; let sp = 0; st[sp++] = 0;
      const mn = this.nMin, mx = this.nMax;
      while (sp > 0) {
        const n = st[--sp], b = n * 3;
        if (mn[b] > maxX || mx[b] < minX || mn[b + 1] > maxY || mx[b + 1] < minY || mn[b + 2] > maxZ || mx[b + 2] < minZ) continue;
        const l = this.nLeft[n];
        if (l < 0) {
          const s0 = this.nStart[n], e0 = s0 + this.nCount[n];
          for (let k = s0; k < e0; k++) {
            const c = cols[this.items[k]];
            if (!c.alive || (mask === Q_SOLID && !c.solid) || (mask === Q_RAY && !c.ray)) continue;
            if (c.minX > maxX || c.maxX < minX || c.minY > maxY || c.maxY < minY || c.minZ > maxZ || c.maxZ < minZ) continue;
            out.push(c.id);
          }
        } else { st[sp++] = l; st[sp++] = this.nRight[n]; }
      }
    }
    const ex = this.built ? this.extra : null;
    const list = ex || cols;
    for (let k = 0; k < list.length; k++) {
      const c = ex ? cols[list[k]] : list[k];
      if (!c.alive || (mask === Q_SOLID && !c.solid) || (mask === Q_RAY && !c.ray)) continue;
      if (c.minX > maxX || c.maxX < minX || c.minY > maxY || c.maxY < minY || c.minZ > maxZ || c.maxZ < minZ) continue;
      out.push(c.id);
    }
    return out.length;
  }

  // ---------------------------------------------------------------------------------------- shape helpers
  /** Closest point of the collider footprint to (x, z). Writes S.{lx,lz (local centre), qx,qz (local closest), wx,wz (world closest), d2, inside}. */
  footClosest(c, x, z, S) {
    const dx = x - c.cx, dz = z - c.cz;
    if (c.k === CYL) {
      const d = Math.hypot(dx, dz);
      S.lx = dx; S.lz = dz;
      if (d <= c.r) { S.qx = dx; S.qz = dz; S.wx = x; S.wz = z; S.d2 = 0; S.inside = true; }
      else { const k = c.r / d; S.qx = dx * k; S.qz = dz * k; S.wx = c.cx + S.qx; S.wz = c.cz + S.qz; S.d2 = (d - c.r) * (d - c.r); S.inside = false; }
      return S;
    }
    const lx = dx * c.c - dz * c.s, lz = dx * c.s + dz * c.c;
    const qx = lx < -c.hx ? -c.hx : lx > c.hx ? c.hx : lx;
    const qz = lz < -c.hz ? -c.hz : lz > c.hz ? c.hz : lz;
    S.lx = lx; S.lz = lz; S.qx = qx; S.qz = qz;
    S.wx = c.cx + qx * c.c + qz * c.s; S.wz = c.cz - qx * c.s + qz * c.c;
    const ex = lx - qx, ez = lz - qz; S.d2 = ex * ex + ez * ez; S.inside = S.d2 === 0;
    return S;
  }
  /** Top height of the collider at local point (qx, qz) (ramps vary along their axis). */
  topLocal(c, qx, qz) {
    if (c.k !== RAMP) return c.top;
    const t = c.ax === 0 ? (qx + c.hx) / (2 * c.hx) : (qz + c.hz) / (2 * c.hz);
    return c.y0 + (c.y1 - c.y0) * (t < 0 ? 0 : t > 1 ? 1 : t);
  }
  /** Top height of the collider at the world point (x, z) clamped into its footprint. */
  topAt(c, x, z) { if (c.k !== RAMP) return c.top; const S = this.footClosest(c, x, z, this._S); return this.topLocal(c, S.qx, S.qz); }
  /** Highest top of the collider inside the circle (ramps: the uphill side of the circle). */
  topInCircle(c, x, z, r) {
    if (c.k !== RAMP) return c.top;
    const S = this.footClosest(c, x, z, this._S);
    const sg = c.y1 >= c.y0 ? 1 : -1;
    if (c.ax === 0) return this.topLocal(c, Math.max(-c.hx, Math.min(c.hx, S.lx + r * sg)), 0);
    return this.topLocal(c, 0, Math.max(-c.hz, Math.min(c.hz, S.lz + r * sg)));
  }

  heightAt(x, z) {
    let best = -Infinity;
    for (let i = 0; i < this.fields.length; i++) { const h = fieldH(this.fields[i], x, z); if (h > best) best = h; }
    return best;
  }
  /** Terrain normal at (x, z) of field f (central differences). */
  fieldNormal(f, x, z, out) {
    // central differences, with the samples clamped into the field (outside it fieldH is -Infinity)
    const e = f.res * 0.5;
    const x0 = Math.max(f.minX, x - e), x1 = Math.min(f.maxX, x + e), z0 = Math.max(f.minZ, z - e), z1 = Math.min(f.maxZ, z + e);
    const zc = Math.min(f.maxZ, Math.max(f.minZ, z)), xc = Math.min(f.maxX, Math.max(f.minX, x));
    const nx = x1 > x0 ? -(fieldH(f, x1, zc) - fieldH(f, x0, zc)) / (x1 - x0) : 0;
    const nz = z1 > z0 ? -(fieldH(f, xc, z1) - fieldH(f, xc, z0)) / (z1 - z0) : 0;
    const inv = 1 / Math.hypot(nx, 1, nz);
    out.nx = nx * inv; out.ny = inv; out.nz = nz * inv; return out;
  }

  // ---------------------------------------------------------------------------------------- queries
  groundAt(x, z, yFrom, radius = 0, out) {
    const r = radius > 0 ? radius : 0, r2 = r * r + 1e-9;
    const q = this._q, S = this._S;
    const n = this.query(x - r, -1e9, z - r, x + r, yFrom + EPS, z + r, q, Q_SOLID);
    let best = -Infinity, bid = -1;
    for (let i = 0; i < n; i++) {
      const c = this.cols[q[i]];
      if (!c.walk) continue;
      this.footClosest(c, x, z, S);
      if (S.d2 > r2) continue;
      const top = c.k === RAMP ? this.topLocal(c, S.qx, S.qz) : c.top;
      if (top <= yFrom + EPS && top > best) { best = top; bid = c.id; }
    }
    let fi = -1;
    for (let i = 0; i < this.fields.length; i++) {
      const f = this.fields[i]; if (!f.walk) continue;
      const h = fieldH(f, x, z);
      if (h > -Infinity && h <= yFrom + EPS && h > best) { best = h; bid = -1; fi = i; }
    }
    if (best === -Infinity) return null;
    const o = out || {};
    o.y = best; o.id = bid; o.field = fi;
    if (bid >= 0) {
      const c = this.cols[bid]; o.surf = c.surf;
      if (c.k === RAMP) { o.nx = c.nx; o.ny = c.ny; o.nz = c.nz; } else { o.nx = 0; o.ny = 1; o.nz = 0; }
    } else { const f = this.fields[fi]; o.surf = f.surf; this.fieldNormal(f, x, z, o); }
    return o;
  }
  ceilingAt(x, z, yFrom, radius = 0) {
    const r = radius > 0 ? radius : 0, r2 = r * r + 1e-9;
    const q = this._q, S = this._S;
    const n = this.query(x - r, yFrom - EPS, z - r, x + r, 1e9, z + r, q, Q_SOLID);
    let best = Infinity;
    for (let i = 0; i < n; i++) {
      const c = this.cols[q[i]];
      if (c.bot < yFrom - EPS || c.bot >= best) continue;
      this.footClosest(c, x, z, S);
      if (S.d2 > r2) continue;
      best = c.bot;
    }
    return best;
  }
  overlapCylinder(x, y, z, r, h, out = []) {
    const q = this._q, S = this._S;
    const n = this.query(x - r, y, z - r, x + r, y + h, z + r, q, Q_SOLID);
    out.length = 0;
    const rr = Math.max(0, r - 1e-3), r2 = rr * rr;
    for (let i = 0; i < n; i++) {
      const c = this.cols[q[i]];
      if (c.bot >= y + h - EPS) continue;
      this.footClosest(c, x, z, S);
      if (S.d2 >= r2 && !(r2 === 0 && S.inside)) continue;
      const top = c.k === RAMP ? this.topInCircle(c, x, z, rr) : c.top;
      if (top <= y + EPS) continue;
      out.push(c.id);
    }
    for (let i = 0; i < this.fields.length; i++) {
      const f = this.fields[i];
      if (x + r < f.minX || x - r > f.maxX || z + r < f.minZ || z - r > f.maxZ || f.hi <= y + 0.01) continue;
      if (fieldMaxInCircle(f, x, z, r) > y + 0.01) out.push(-1 - i);
    }
    return out;
  }
  blocked(x, y, z, r, h, ignoreTag) {
    const q = this._q, S = this._S;
    const n = this.query(x - r, y, z - r, x + r, y + h, z + r, q, Q_SOLID);
    const rr = Math.max(0, r - 1e-3), r2 = rr * rr;
    for (let i = 0; i < n; i++) {
      const c = this.cols[q[i]];
      if (c.bot >= y + h - EPS) continue;
      if (ignoreTag && c.tag === ignoreTag) continue;
      this.footClosest(c, x, z, S);
      if (S.d2 >= r2 && !(r2 === 0 && S.inside)) continue;
      const top = c.k === RAMP ? this.topInCircle(c, x, z, rr) : c.top;
      if (top <= y + EPS) continue;
      return true;
    }
    for (let i = 0; i < this.fields.length; i++) {
      const f = this.fields[i];
      if (x + r < f.minX || x - r > f.maxX || z + r < f.minZ || z - r > f.maxZ || f.hi <= y + 0.01) continue;
      if (fieldMaxInCircle(f, x, z, r) > y + 0.01) return true;
    }
    return false;
  }
  /** Summary for debug overlays and tests. */
  stats() {
    let alive = 0, k = [0, 0, 0];
    for (const c of this.cols) if (c.alive) { alive++; k[c.k]++; }
    return { colliders: alive, boxes: k[0], ramps: k[1], cyls: k[2], fields: this.fields.length, nodes: this.nodeCount, extra: this.extra.length };
  }
}

/** Bilinear terrain height (-Infinity outside the field). */
export function fieldH(f, x, z) {
  if (x < f.minX || x > f.maxX || z < f.minZ || z > f.maxZ) return -Infinity;
  const fx = (x - f.minX) / f.res, fz = (z - f.minZ) / f.res;
  let ix = Math.floor(fx), iz = Math.floor(fz);
  if (ix >= f.nx - 1) ix = f.nx - 2; if (iz >= f.nz - 1) iz = f.nz - 2;
  if (ix < 0) ix = 0; if (iz < 0) iz = 0;
  const tx = fx - ix, tz = fz - iz, nx = f.nx, h = f.h, i = iz * nx + ix;
  const a = h[i], b = h[i + 1], c = h[i + nx], d = h[i + nx + 1];
  return (a + (b - a) * tx) * (1 - tz) + (c + (d - c) * tx) * tz;
}
function fieldMaxInCircle(f, x, z, r) {
  let m = fieldH(f, x, z);
  if (r > 0) {
    const k = r * 0.7071;
    m = Math.max(m, fieldH(f, x + r, z), fieldH(f, x - r, z), fieldH(f, x, z + r), fieldH(f, x, z - r),
      fieldH(f, x + k, z + k), fieldH(f, x - k, z + k), fieldH(f, x + k, z - k), fieldH(f, x - k, z - k));
  }
  return m;
}

// quickselect on items[lo..hi] so that items[k] has the median centroid along axis
function select(it, lo, hi, k, cen, axis) {
  while (hi > lo) {
    const pv = cen[it[(lo + hi) >> 1] * 3 + axis];
    let i = lo, j = hi;
    while (i <= j) {
      while (cen[it[i] * 3 + axis] < pv) i++;
      while (cen[it[j] * 3 + axis] > pv) j--;
      if (i <= j) { const t = it[i]; it[i] = it[j]; it[j] = t; i++; j--; }
    }
    if (k <= j) hi = j; else if (k >= i) lo = i; else return;
  }
}
