/* LIVE FIRE — layered walkability grid + A* for bots, line-of-sight helpers. PURE JS (no BABYLON): runs in Node tests too.
   Exports:
     buildNav(world, bounds, opts?) -> Nav
         opts = { cell = .5, agentR = .25, standH = 1.8, crouchH = 1.25, step = .45, maxDrop = 3.5, mantle = 1.1, gates: gateList }
     NAV_LINK = { WALK: 0, DROP: 1, MANTLE: 2 }
   Nav:
     nodeCount, cell, stats { ms, msSpans, msNodes, msLinks, nodes, cells, levels }
     nearest(x, y, z, maxR = 3) -> node index | -1        (prefers the level at or just below y)
     nodePos(i, out?) -> { x, y, z }, nodeAt(x, y, z) -> index | -1 (same cell, within a step)
     findPath(from, to, opts?) -> [{ x, y, z, link, crouch }] | null     from/to = {x,y,z} or node indices
         opts = { smooth = true, maxExpand = 80000, cost(i) -> extra cost, crouchCost = 1.6 }; links: 'walk'|'drop'|'mantle'
     walkLine(a, b) -> bool        straight walk between two points stays on connected nodes (used for string pulling)
     reachable(a, b, gatesOpen = true) -> bool,  flood(fromNodes, gatesOpen) -> Uint8Array visited
     component(i) -> label (gates open), randomNode(rand, filter?) -> index
     setGate(gateColliderId, open), gatesOpen(bool)        lobby gates: nodes inside a closed gate are not walkable
     losClear(a, b) -> bool, losBlocked(a, b) -> bool       world raycast (glass is see-through) + extra blockers
     addBlocker(b) -> remove()     b = { x, y, z, r } sphere (smoke) or { test(ax, ay, az, bx, by, bz) -> bool }; b.active === false skips
     isCrouchOnly(i), isGate(i), linksOf(i) -> [{ to, link }]
   Building: every collider footprint is rasterised into per-cell vertical spans (Recast-like); each span top with room above
   becomes a node if a cylinder of agentR fits there (standing, or crouching only); neighbours connect when the height step
   is <= step; one-way drop links (up to maxDrop) and mantle links (up to mantle) join levels at ledges. */
import { segmentClear } from '../phys/ray.js';
import { fieldH } from '../phys/world.js';

export const NAV_LINK = { WALK: 0, DROP: 1, MANTLE: 2 };
const LINK_NAMES = ['walk', 'drop', 'mantle'];
const F_STAND = 1, F_CROUCH = 2, F_GATE = 4, F_TINY = 8;
const DX = [1, -1, 0, 0, 1, 1, -1, -1], DZ = [0, 0, 1, -1, 1, -1, 1, -1];
const MAXL = 8;   // levels kept per cell

class Heap {
  constructor(n) { this.a = new Int32Array(Math.max(16, n)); this.f = null; this.n = 0; }
  clear(f) { this.n = 0; this.f = f; }
  push(i) {
    if (this.n >= this.a.length) { const b = new Int32Array(this.a.length * 2); b.set(this.a); this.a = b; }
    const a = this.a, f = this.f; let k = this.n++; a[k] = i;
    while (k > 0) { const p = (k - 1) >> 1; if (f[a[p]] <= f[a[k]]) break; const t = a[p]; a[p] = a[k]; a[k] = t; k = p; }
  }
  pop() {
    const a = this.a, f = this.f, top = a[0], last = a[--this.n];
    if (this.n > 0) {
      a[0] = last; let k = 0;
      for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < this.n && f[a[l]] < f[a[m]]) m = l; if (r < this.n && f[a[r]] < f[a[m]]) m = r; if (m === k) break; const t = a[m]; a[m] = a[k]; a[k] = t; k = m; }
    }
    return top;
  }
}

export function buildNav(world, bounds, opts = {}) {
  const t0 = now();
  const cell = opts.cell || 0.5, R = opts.agentR || 0.25, standH = opts.standH || 1.8, crouchH = opts.crouchH || 1.25;
  const step = opts.step || 0.45, maxDrop = opts.maxDrop || 3.5, mantle = opts.mantle || 1.1;
  const clearFrom = step - 0.05;   // obstacles lower than this do not block a node (they are stepped over)
  const minX = bounds.minX, minZ = bounds.minZ;
  const nx = Math.max(1, Math.ceil((bounds.maxX - bounds.minX) / cell)), nz = Math.max(1, Math.ceil((bounds.maxZ - bounds.minZ) / cell));
  const ncell = nx * nz;
  const yLo = bounds.minY == null ? -50 : bounds.minY - 5, yHi = bounds.maxY == null ? 200 : bounds.maxY + 5;

  // ---------------------------------------------------------------- 1. rasterise spans
  let cap = ncell * 2;
  let sBot = new Float32Array(cap), sTop = new Float32Array(cap), sWalk = new Uint8Array(cap), sNext = new Int32Array(cap);
  const head = new Int32Array(ncell).fill(-1);
  let ns = 0;
  const addSpan = (ci, b, t, walk) => {
    if (ns >= cap) {
      cap *= 2;
      const B = new Float32Array(cap); B.set(sBot); sBot = B; const T = new Float32Array(cap); T.set(sTop); sTop = T;
      const W = new Uint8Array(cap); W.set(sWalk); sWalk = W; const N = new Int32Array(cap); N.set(sNext); sNext = N;
    }
    sBot[ns] = b; sTop[ns] = t; sWalk[ns] = walk; sNext[ns] = head[ci]; head[ci] = ns; ns++;
  };
  const S = { lx: 0, lz: 0, qx: 0, qz: 0, wx: 0, wz: 0, d2: 0, inside: false };
  for (const c of world.cols) {
    if (!c.alive || !c.solid || c.tag === 'gate' || c.tag === 'bounds') continue;
    if (c.maxY < yLo || c.minY > yHi) continue;
    const i0 = Math.max(0, Math.floor((c.minX - minX) / cell - 0.5)), i1 = Math.min(nx - 1, Math.ceil((c.maxX - minX) / cell - 0.5));
    const j0 = Math.max(0, Math.floor((c.minZ - minZ) / cell - 0.5)), j1 = Math.min(nz - 1, Math.ceil((c.maxZ - minZ) / cell - 0.5));
    for (let j = j0; j <= j1; j++) {
      const z = minZ + (j + 0.5) * cell;
      for (let i = i0; i <= i1; i++) {
        const x = minX + (i + 0.5) * cell;
        world.footClosest(c, x, z, S);
        if (S.d2 > 1e-10) continue;
        const top = c.k === 1 ? world.topLocal(c, S.qx, S.qz) : c.top;
        addSpan(j * nx + i, c.bot, top, c.walk ? 1 : 0);
      }
    }
  }
  for (const f of world.fields) {
    if (!f.walk) continue;
    const i0 = Math.max(0, Math.floor((f.minX - minX) / cell)), i1 = Math.min(nx - 1, Math.ceil((f.maxX - minX) / cell));
    const j0 = Math.max(0, Math.floor((f.minZ - minZ) / cell)), j1 = Math.min(nz - 1, Math.ceil((f.maxZ - minZ) / cell));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const h = fieldH(f, minX + (i + 0.5) * cell, minZ + (j + 0.5) * cell);
      if (h > -Infinity) addSpan(j * nx + i, -1e6, h, 1);
    }
  }
  const t1 = now();

  // ---------------------------------------------------------------- 2. nodes from span tops with room above
  let ncap = Math.max(1024, ncell);
  let nCell = new Int32Array(ncap), nY = new Float32Array(ncap), nFlag = new Uint8Array(ncap);
  const cStart = new Int32Array(ncell).fill(-1), cCount = new Uint8Array(ncell);
  let nn = 0;
  const tb = new Float32Array(256), tt = new Float32Array(256), tw = new Uint8Array(256);
  let maxLevels = 0;
  for (let ci = 0; ci < ncell; ci++) {
    let k = 0;
    for (let s = head[ci]; s >= 0 && k < 256; s = sNext[s]) { tb[k] = sBot[s]; tt[k] = sTop[s]; tw[k] = sWalk[s]; k++; }
    if (!k) continue;
    // insertion sort by bottom
    for (let a = 1; a < k; a++) {
      const b = tb[a], t = tt[a], w = tw[a]; let c = a - 1;
      while (c >= 0 && tb[c] > b) { tb[c + 1] = tb[c]; tt[c + 1] = tt[c]; tw[c + 1] = tw[c]; c--; }
      tb[c + 1] = b; tt[c + 1] = t; tw[c + 1] = w;
    }
    // merge overlapping / touching spans
    let m = 0;
    for (let a = 1; a < k; a++) {
      if (tb[a] <= tt[m] + 0.02) { if (tt[a] >= tt[m]) { tt[m] = tt[a]; tw[m] = tw[a]; } }
      else { m++; tb[m] = tb[a]; tt[m] = tt[a]; tw[m] = tw[a]; }
    }
    k = m + 1;
    const x = minX + (ci % nx + 0.5) * cell, z = minZ + (Math.floor(ci / nx) + 0.5) * cell;
    let added = 0;
    for (let a = 0; a < k && added < MAXL; a++) {
      if (!tw[a]) continue;
      const y = tt[a];
      if (y < yLo || y > yHi) continue;
      const ceil = a + 1 < k ? tb[a + 1] : Infinity;
      if (ceil - y < crouchH + 0.02) continue;
      let flag = 0;
      if (!world.blocked(x, y + clearFrom, z, R, standH - clearFrom, 'gate')) flag = F_STAND;
      else if (!world.blocked(x, y + clearFrom, z, R, crouchH - clearFrom, 'gate')) flag = F_CROUCH;
      if (!flag) continue;
      if (nn >= ncap) {
        ncap *= 2;
        const A = new Int32Array(ncap); A.set(nCell); nCell = A; const Y = new Float32Array(ncap); Y.set(nY); nY = Y; const F = new Uint8Array(ncap); F.set(nFlag); nFlag = F;
      }
      if (added === 0) cStart[ci] = nn;
      nCell[nn] = ci; nY[nn] = y; nFlag[nn] = flag; nn++; added++;
    }
    cCount[ci] = added;
    if (added > maxLevels) maxLevels = added;
  }
  nCell = nCell.slice(0, nn); nY = nY.slice(0, nn); nFlag = nFlag.slice(0, nn);
  const t2 = now();

  // ---------------------------------------------------------------- 3. gates
  const nGate = new Int16Array(nn).fill(-1);
  const gates = (opts.gates || []).map((g, gi) => ({ id: g.id, gi, open: !!g.open }));
  (opts.gates || []).forEach((g, gi) => {
    const c = world.get(g.id); if (!c) return;
    const ex = R + 0.05;
    const i0 = Math.max(0, Math.floor((c.minX - ex - minX) / cell)), i1 = Math.min(nx - 1, Math.ceil((c.maxX + ex - minX) / cell));
    const j0 = Math.max(0, Math.floor((c.minZ - ex - minZ) / cell)), j1 = Math.min(nz - 1, Math.ceil((c.maxZ + ex - minZ) / cell));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const ci = j * nx + i, st = cStart[ci]; if (st < 0) continue;
      const x = minX + (i + 0.5) * cell, z = minZ + (j + 0.5) * cell;
      world.footClosest(c, x, z, S);
      if (S.d2 > ex * ex) continue;
      for (let n = st; n < st + cCount[ci]; n++) if (nY[n] < c.top && nY[n] + standH > c.bot) { nGate[n] = gi; nFlag[n] |= F_GATE; }
    }
  });

  // ---------------------------------------------------------------- 4. links
  const nb = new Int32Array(nn * 8).fill(-1);
  const levelIn = (ci, y, tol) => {
    const st = cStart[ci]; if (st < 0) return -1;
    let best = -1, bd = tol;
    for (let n = st; n < st + cCount[ci]; n++) { const d = Math.abs(nY[n] - y); if (d <= bd) { bd = d; best = n; } }
    return best;
  };
  for (let n = 0; n < nn; n++) {
    const ci = nCell[n], i = ci % nx, j = (ci - i) / nx, y = nY[n];
    for (let d = 0; d < 4; d++) {
      const ii = i + DX[d], jj = j + DZ[d];
      if (ii < 0 || jj < 0 || ii >= nx || jj >= nz) continue;
      nb[n * 8 + d] = levelIn(jj * nx + ii, y, step);
    }
  }
  for (let n = 0; n < nn; n++) {
    const ci = nCell[n], i = ci % nx, j = (ci - i) / nx, y = nY[n];
    for (let d = 4; d < 8; d++) {
      // diagonal only when both orthogonal neighbours connect (no corner cutting)
      const ox = DX[d] > 0 ? 0 : 1, oz = DZ[d] > 0 ? 2 : 3;
      const a = nb[n * 8 + ox], b = nb[n * 8 + oz];
      if (a < 0 || b < 0) continue;
      const ii = i + DX[d], jj = j + DZ[d];
      const t = levelIn(jj * nx + ii, y, step);
      if (t < 0) continue;
      // the target must be the z-neighbour of a and the x-neighbour of b (both corners are open at this level)
      if (nb[a * 8 + oz] !== t || nb[b * 8 + ox] !== t) continue;
      nb[n * 8 + d] = t;
    }
  }
  // drops and mantles across ledges: look 1..3 cells out in the 4 directions from nodes with a missing neighbour
  const spFrom = [], spTo = [], spType = [];
  for (let n = 0; n < nn; n++) {
    const ci = nCell[n], i = ci % nx, j = (ci - i) / nx, y = nY[n];
    for (let d = 0; d < 4; d++) {
      if (nb[n * 8 + d] >= 0) continue;
      for (let s = 1; s <= 3; s++) {
        const ii = i + DX[d] * s, jj = j + DZ[d] * s;
        if (ii < 0 || jj < 0 || ii >= nx || jj >= nz) break;
        const cj = jj * nx + ii, st = cStart[cj];
        if (st < 0) continue;
        let low = -1, ld = Infinity;
        for (let m = st; m < st + cCount[cj]; m++) { const dy = y - nY[m]; if (dy > step && dy <= maxDrop && dy < ld) { ld = dy; low = m; } }
        if (low < 0) { if (levelIn(cj, y, step) >= 0) break; continue; }
        // the drop is clear: nothing solid between the ledge and the landing at body height
        const x0 = minX + (i + 0.5) * cell, z0 = minZ + (j + 0.5) * cell, x1 = minX + (ii + 0.5) * cell, z1 = minZ + (jj + 0.5) * cell;
        if (!segmentClear(world, x0, y + 0.9, z0, x1, y + 0.9, z1)) break;
        spFrom.push(n); spTo.push(low); spType.push(NAV_LINK.DROP);
        if (ld <= mantle && !segmentClear(world, x1, nY[low] + 0.2, z1, x0, nY[low] + 0.2, z0) && segmentClear(world, x1, y + 0.9, z1, x0, y + 0.9, z0)) {
          spFrom.push(low); spTo.push(n); spType.push(NAV_LINK.MANTLE);
        }
        break;
      }
    }
  }
  const spStart = new Int32Array(nn + 1), spCount = new Int32Array(nn);
  for (const f of spFrom) spCount[f]++;
  for (let n = 0; n < nn; n++) spStart[n + 1] = spStart[n] + spCount[n];
  const spT = new Int32Array(spFrom.length), spK = new Uint8Array(spFrom.length), fill = spStart.slice(0, nn);
  for (let k = 0; k < spFrom.length; k++) { const p = fill[spFrom[k]]++; spT[p] = spTo[k]; spK[p] = spType[k]; }
  const t3 = now();

  const nav = new Nav({ world, cell, R, standH, crouchH, step, minX, minZ, nx, nz, nCell, nY, nFlag, nGate, cStart, cCount, nb, spStart, spT, spK, gates });
  nav._label();
  // prune tiny islands (wall tops, crate lids reachable by nothing): they only confuse nearest()
  const size = new Int32Array(nav._ncomp);
  for (let n = 0; n < nn; n++) size[nav.comp[n]]++;
  for (let n = 0; n < nn; n++) if (size[nav.comp[n]] < 6) nFlag[n] |= F_TINY;
  nav.stats = { ms: Math.round(now() - t0), msSpans: Math.round(t1 - t0), msNodes: Math.round(t2 - t1), msLinks: Math.round(t3 - t2),
    nodes: nn, cells: ncell, levels: maxLevels, spans: ns, specialLinks: spFrom.length, components: nav._ncomp };
  return nav;
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

class Nav {
  constructor(d) {
    Object.assign(this, d);
    this.nodeCount = d.nY.length;
    this.blockers = [];
    this._stamp = new Int32Array(this.nodeCount); this._sid = 0;
    this._g = new Float32Array(this.nodeCount); this._f = new Float32Array(this.nodeCount);
    this._from = new Int32Array(this.nodeCount); this._fromK = new Uint8Array(this.nodeCount);
    this._heap = new Heap(1024);
    this.comp = new Int32Array(this.nodeCount); this._ncomp = 0;
    this._gateById = new Map(); for (const g of this.gates) this._gateById.set(g.id, g);
  }
  // -------------------------------------------------------------- basics
  nodePos(i, out = { x: 0, y: 0, z: 0 }) {
    const ci = this.nCell[i], ix = ci % this.nx, iz = (ci - ix) / this.nx;
    out.x = this.minX + (ix + 0.5) * this.cell; out.y = this.nY[i]; out.z = this.minZ + (iz + 0.5) * this.cell; return out;
  }
  isCrouchOnly(i) { return (this.nFlag[i] & F_CROUCH) !== 0; }
  isGate(i) { return (this.nFlag[i] & F_GATE) !== 0; }
  _open(i, gatesOpen) {
    if (!(this.nFlag[i] & F_GATE)) return true;
    if (gatesOpen === true) return true;
    if (gatesOpen === false) return false;
    return this.gates[this.nGate[i]].open;
  }
  setGate(id, open) { const g = this._gateById.get(id); if (g) g.open = !!open; }
  gatesOpen(open) { for (const g of this.gates) g.open = !!open; }
  cellOf(x, z) {
    const i = Math.floor((x - this.minX) / this.cell), j = Math.floor((z - this.minZ) / this.cell);
    if (i < 0 || j < 0 || i >= this.nx || j >= this.nz) return -1;
    return j * this.nx + i;
  }
  nodeAt(x, y, z, tol = this.step) {
    const ci = this.cellOf(x, z); if (ci < 0) return -1;
    const st = this.cStart[ci]; if (st < 0) return -1;
    let best = -1, bd = tol;
    for (let n = st; n < st + this.cCount[ci]; n++) { if (this.nFlag[n] & F_TINY) continue; const d = Math.abs(this.nY[n] - y); if (d <= bd) { bd = d; best = n; } }
    return best;
  }
  nearest(x, y, z, maxR = 3) {
    const ci0 = this.cellOf(x, z);
    const i0 = Math.floor((x - this.minX) / this.cell), j0 = Math.floor((z - this.minZ) / this.cell);
    const rings = Math.ceil(maxR / this.cell);
    let best = -1, bs = Infinity;
    for (let r = 0; r <= rings; r++) {
      for (let j = j0 - r; j <= j0 + r; j++) for (let i = i0 - r; i <= i0 + r; i++) {
        if (Math.max(Math.abs(i - i0), Math.abs(j - j0)) !== r) continue;
        if (i < 0 || j < 0 || i >= this.nx || j >= this.nz) continue;
        const ci = j * this.nx + i, st = this.cStart[ci]; if (st < 0) continue;
        const cx = this.minX + (i + 0.5) * this.cell, cz = this.minZ + (j + 0.5) * this.cell;
        const dh = Math.hypot(cx - x, cz - z);
        for (let n = st; n < st + this.cCount[ci]; n++) {
          if (this.nFlag[n] & F_TINY) continue;
          const dy = this.nY[n] - y;
          // a level above the feet costs more than one below (we stand on floors, not under them)
          const sc = dh + (dy > this.step ? dy * 3 : dy < -0.1 ? -dy * 1.2 : Math.abs(dy) * 0.5);
          if (sc < bs) { bs = sc; best = n; }
        }
      }
      if (best >= 0 && bs <= (r + 1) * this.cell) break;
    }
    void ci0;
    return best;
  }
  linksOf(i) {
    const out = [];
    for (let d = 0; d < 8; d++) { const t = this.nb[i * 8 + d]; if (t >= 0) out.push({ to: t, link: 'walk' }); }
    for (let k = this.spStart[i]; k < this.spStart[i + 1]; k++) out.push({ to: this.spT[k], link: LINK_NAMES[this.spK[k]] });
    return out;
  }
  // -------------------------------------------------------------- connectivity
  _label() {
    const n = this.nodeCount, comp = this.comp; comp.fill(-1);
    const stack = new Int32Array(n); let c = 0;
    for (let s = 0; s < n; s++) {
      if (comp[s] >= 0) continue;
      let sp = 0; stack[sp++] = s; comp[s] = c;
      while (sp) {
        const v = stack[--sp];
        for (let d = 0; d < 8; d++) { const t = this.nb[v * 8 + d]; if (t >= 0 && comp[t] < 0) { comp[t] = c; stack[sp++] = t; } }
        // special links count both ways for "same area" labels (drop down / mantle up rejoin)
        for (let k = this.spStart[v]; k < this.spStart[v + 1]; k++) { const t = this.spT[k]; if (comp[t] < 0) { comp[t] = c; stack[sp++] = t; } }
      }
      c++;
    }
    this._ncomp = c;
  }
  component(i) { return this.comp[i]; }
  /** Directed flood fill from nodes (array of indices); returns visited flags. */
  flood(from, gatesOpen = null) {
    const n = this.nodeCount, vis = new Uint8Array(n), q = new Int32Array(n);
    let h = 0, t = 0;
    for (const s of from) if (s >= 0 && !vis[s] && this._open(s, gatesOpen)) { vis[s] = 1; q[t++] = s; }
    while (h < t) {
      const v = q[h++];
      for (let d = 0; d < 8; d++) { const u = this.nb[v * 8 + d]; if (u >= 0 && !vis[u] && this._open(u, gatesOpen)) { vis[u] = 1; q[t++] = u; } }
      for (let k = this.spStart[v]; k < this.spStart[v + 1]; k++) { const u = this.spT[k]; if (!vis[u] && this._open(u, gatesOpen)) { vis[u] = 1; q[t++] = u; } }
    }
    return vis;
  }
  reachable(a, b, gatesOpen = true) {
    const s = typeof a === 'number' ? a : this.nearest(a.x, a.y, a.z), e = typeof b === 'number' ? b : this.nearest(b.x, b.y, b.z);
    if (s < 0 || e < 0) return false;
    return !!this.flood([s], gatesOpen)[e];
  }
  randomNode(rand = Math.random, filter) {
    for (let k = 0; k < 200; k++) {
      const i = Math.floor(rand() * this.nodeCount);
      if (this.nFlag[i] & F_TINY) continue;
      if (!filter || filter(i)) return i;
    }
    return -1;
  }
  // -------------------------------------------------------------- A*
  findPath(from, to, o = {}) {
    const s = typeof from === 'number' ? from : this.nearest(from.x, from.y, from.z);
    const e = typeof to === 'number' ? to : this.nearest(to.x, to.y, to.z);
    if (s < 0 || e < 0) return null;
    const P = this._astar(s, e, o);
    if (!P) return null;
    const pts = P.map(([n, k]) => { const p = this.nodePos(n); p.link = LINK_NAMES[k]; p.crouch = this.isCrouchOnly(n); p.node = n; return p; });
    if (typeof from !== 'number') { pts[0].x = from.x; pts[0].z = from.z; }
    if (typeof to !== 'number' && pts.length > 1) { const l = pts[pts.length - 1]; if (Math.hypot(l.x - to.x, l.z - to.z) < this.cell * 1.5) { l.x = to.x; l.z = to.z; } }
    return o.smooth === false ? pts : this._smooth(pts);
  }
  _astar(s, e, o) {
    const sid = ++this._sid, st = this._stamp, g = this._g, f = this._f, from = this._from, fk = this._fromK, H = this._heap;
    const ex = this.nodePos(e), tmp = { x: 0, y: 0, z: 0 };
    const maxExpand = o.maxExpand || 80000, crouchCost = o.crouchCost || 1.6, extra = o.cost || null, gatesOpen = o.gatesOpen == null ? null : o.gatesOpen;
    const h = n => { this.nodePos(n, tmp); const dx = Math.abs(tmp.x - ex.x), dz = Math.abs(tmp.z - ex.z); return Math.max(dx, dz) + 0.4142 * Math.min(dx, dz) + Math.abs(tmp.y - ex.y) * 0.5; };
    H.clear(f);
    st[s] = sid; g[s] = 0; f[s] = h(s); from[s] = -1; fk[s] = 0; H.push(s);
    const closed = this._closed || (this._closed = new Int32Array(this.nodeCount));
    let expanded = 0;
    while (H.n) {
      const v = H.pop();
      if (v === e) break;
      if (closed[v] === sid) continue;
      closed[v] = sid;
      if (++expanded > maxExpand) return null;
      const gv = g[v];
      for (let d = 0; d < 8; d++) {
        const u = this.nb[v * 8 + d]; if (u < 0 || closed[u] === sid || !this._open(u, gatesOpen)) continue;
        let c = (d < 4 ? 1 : 1.4142) * this.cell;
        if (this.nFlag[u] & F_CROUCH) c *= crouchCost;
        if (extra) c += extra(u);
        const ng = gv + c;
        if (st[u] !== sid || ng < g[u]) { st[u] = sid; g[u] = ng; f[u] = ng + h(u); from[u] = v; fk[u] = 0; H.push(u); }
      }
      for (let k = this.spStart[v]; k < this.spStart[v + 1]; k++) {
        const u = this.spT[k]; if (closed[u] === sid || !this._open(u, gatesOpen)) continue;
        const kind = this.spK[k];
        let c = kind === NAV_LINK.DROP ? 1.5 + (this.nY[v] - this.nY[u]) * 0.8 : 3.0;
        if (extra) c += extra(u);
        const ng = gv + c;
        if (st[u] !== sid || ng < g[u]) { st[u] = sid; g[u] = ng; f[u] = ng + h(u); from[u] = v; fk[u] = kind; H.push(u); }
      }
    }
    if (st[e] !== sid) return null;
    const path = [];
    for (let v = e; v >= 0; v = from[v]) path.push([v, fk[v]]);
    path.reverse();
    return path;
  }
  /** Straight walk between two points over connected nodes (no drops), sampled every quarter cell. */
  walkLine(a, b, gatesOpen = null) {
    const dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz);
    let cur = this.nodeAt(a.x, a.y, a.z, this.step + 0.05);
    if (cur < 0) return false;
    const n = Math.max(1, Math.ceil(L / (this.cell * 0.25)));
    let y = this.nY[cur], lastCell = this.nCell[cur];
    for (let i = 1; i <= n; i++) {
      const t = i / n, x = a.x + dx * t, z = a.z + dz * t;
      const ci = this.cellOf(x, z); if (ci < 0) return false;
      if (ci === lastCell) continue;
      // the new cell must be a walk-neighbour of the previous one
      let nxt = -1;
      for (let d = 0; d < 8; d++) { const u = this.nb[cur * 8 + d]; if (u >= 0 && this.nCell[u] === ci) { nxt = u; break; } }
      if (nxt < 0 || !this._open(nxt, gatesOpen) || (this.nFlag[nxt] & F_CROUCH) !== (this.nFlag[cur] & F_CROUCH)) return false;
      // corner cut through a diagonal: both orthogonal cells must be walkable too
      cur = nxt; y = this.nY[cur]; lastCell = ci;
    }
    void y;
    return true;
  }
  _smooth(pts) {
    if (pts.length <= 2) return pts;
    const out = [pts[0]];
    let i = 0;
    while (i < pts.length - 1) {
      let best = i + 1;
      const lim = Math.min(pts.length - 1, i + 80);
      for (let k = lim; k > i + 1; k--) {
        // never smooth across drop / mantle links: those waypoints stay
        let special = false;
        for (let q = i + 1; q <= k; q++) if (pts[q].link !== 'walk') { special = true; break; }
        if (special) continue;
        if (this.walkLine(pts[i], pts[k])) { best = k; break; }
      }
      out.push(pts[best]);
      i = best;
    }
    return out;
  }
  // -------------------------------------------------------------- line of sight
  addBlocker(b) { this.blockers.push(b); return () => { const i = this.blockers.indexOf(b); if (i >= 0) this.blockers.splice(i, 1); }; }
  losBlocked(a, b) {
    for (let i = 0; i < this.blockers.length; i++) {
      const k = this.blockers[i];
      if (k.active === false) continue;
      if (k.test) { if (k.test(a.x, a.y, a.z, b.x, b.y, b.z)) return true; continue; }
      if (segSphere(a.x, a.y, a.z, b.x, b.y, b.z, k.x, k.y, k.z, k.r)) return true;
    }
    return !segmentClear(this.world, a.x, a.y, a.z, b.x, b.y, b.z, { skipGlass: true });
  }
  losClear(a, b) { return !this.losBlocked(a, b); }
  dispose() { this.blockers.length = 0; }
}

function segSphere(ax, ay, az, bx, by, bz, cx, cy, cz, r) {
  const dx = bx - ax, dy = by - ay, dz = bz - az, L2 = dx * dx + dy * dy + dz * dz;
  let t = L2 > 0 ? ((cx - ax) * dx + (cy - ay) * dy + (cz - az) * dz) / L2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const px = ax + dx * t - cx, py = ay + dy * t - cy, pz = az + dz * t - cz;
  return px * px + py * py + pz * pz < r * r;
}
