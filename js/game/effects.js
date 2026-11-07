/* LIVE FIRE — combat effects: muzzle flash (sprite + one shared point light), tracers, impact particles by surface (sparks,
   dust, chips, splinters, glass, dirt, water), bullet-hole decals (pooled thin instances, per surface family), blood (mist,
   droplets, wall and floor splats), shell casings. Everything is pooled: thin-instance meshes updated in place every frame, no
   per-frame allocation, one draw call per effect kind.
   Exports:
     Effects   class (game system 'effects'): new Effects(scene, game)
       burst(kind, point, normal, opts)    spawn an impact effect ('concrete'... surf names, 'flesh', 'spark')
       decal(kind, point, normal, size, opts) place a decal ('hole' | 'hole_metal' | 'hole_wood' | 'hole_glass' | 'blood')
       tracer(from, to, color, speed)      a tracer streak
       flash(node | point, local, dir)     muzzle flash + light
       frame(dt), dispose()
     PARTICLE_KINDS, DECAL_KINDS
   Listens to game.bus: 'shot' (flash, tracer, casing), 'impact' (burst + hole), 'bullet:body' (blood + splats), 'kill'. */
import { clamp } from '../core/util.js';
import { raycast } from '../phys/ray.js';

const BB = () => BABYLON;
export const PARTICLE_KINDS = ['spark', 'dust', 'chip', 'mist'];
export const DECAL_KINDS = ['hole', 'hole_metal', 'hole_wood', 'hole_glass', 'blood'];
const SURF_FX = {
  concrete: { dust: [0.62, 0.6, 0.56], chip: [0.42, 0.41, 0.39], hole: 'hole', n: 1 }, brick: { dust: [0.62, 0.45, 0.36], chip: [0.5, 0.28, 0.2], hole: 'hole', n: 1 },
  plaster: { dust: [0.86, 0.85, 0.82], chip: [0.8, 0.79, 0.76], hole: 'hole', n: 1.2 }, tile: { dust: [0.8, 0.8, 0.78], chip: [0.86, 0.86, 0.84], hole: 'hole', n: 0.8, spark: 0.2 },
  asphalt: { dust: [0.36, 0.35, 0.34], chip: [0.2, 0.2, 0.2], hole: 'hole', n: 0.9 }, gravel: { dust: [0.55, 0.52, 0.47], chip: [0.4, 0.38, 0.35], hole: null, n: 1 },
  metal: { dust: [0.45, 0.45, 0.46], chip: [0.3, 0.3, 0.3], hole: 'hole_metal', n: 0.4, spark: 1 }, sheetmetal: { dust: [0.5, 0.5, 0.5], chip: [0.35, 0.35, 0.35], hole: 'hole_metal', n: 0.35, spark: 0.8 },
  wood: { dust: [0.6, 0.48, 0.34], chip: [0.62, 0.47, 0.3], hole: 'hole_wood', n: 1, splinter: true }, fabric: { dust: [0.5, 0.5, 0.48], chip: [0.4, 0.4, 0.4], hole: 'hole_wood', n: 0.7 },
  carpet: { dust: [0.45, 0.42, 0.4], chip: [0.4, 0.38, 0.36], hole: 'hole_wood', n: 0.6 }, rubber: { dust: [0.2, 0.2, 0.2], chip: [0.12, 0.12, 0.12], hole: 'hole', n: 0.5 },
  glass: { dust: [0.85, 0.9, 0.95], chip: [0.75, 0.85, 0.9], hole: 'hole_glass', n: 0.5, glass: true }, dirt: { dust: [0.48, 0.4, 0.3], chip: [0.35, 0.28, 0.2], hole: null, n: 1.5 },
  mud: { dust: [0.35, 0.28, 0.2], chip: [0.28, 0.22, 0.15], hole: null, n: 0.9 }, sand: { dust: [0.78, 0.7, 0.55], chip: [0.7, 0.62, 0.48], hole: null, n: 1.6 },
  grass: { dust: [0.42, 0.42, 0.3], chip: [0.3, 0.38, 0.2], hole: null, n: 1.2 }, snow: { dust: [0.95, 0.96, 1], chip: [0.95, 0.96, 1], hole: null, n: 1.6 },
  water: { dust: [0.8, 0.85, 0.9], chip: [0.7, 0.78, 0.85], hole: null, n: 1.6, water: true },
};
const AMB = { day: 1, overcast: 0.85, dusk: 0.62, night: 0.3, indoor: 0.55 };

function canvasTex(scene, name, size, draw) {
  const t = new (BB().DynamicTexture)(name, { width: size, height: size }, scene, true);
  const c = t.getContext(); c.clearRect(0, 0, size, size); draw(c, size); t.update(true); t.hasAlpha = true;
  t.wrapU = t.wrapV = BB().Texture.CLAMP_ADDRESSMODE;
  return t;
}
function quadMesh(scene, name, cy = 0) {
  const m = new (BB().Mesh)(name, scene), vd = new (BB().VertexData)();
  vd.positions = [-0.5, -0.5 + cy, 0, 0.5, -0.5 + cy, 0, 0.5, 0.5 + cy, 0, -0.5, 0.5 + cy, 0];
  vd.uvs = [0, 0, 1, 0, 1, 1, 0, 1]; vd.normals = [0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1]; vd.indices = [0, 2, 1, 0, 3, 2];
  vd.applyToMesh(m); m.isPickable = false; m.doNotSyncBoundingInfo = true; m.alwaysSelectAsActiveMesh = true;
  return m;
}
function fxMat(scene, name, tex, add, lit = false) {
  const B = BB(), mt = new B.StandardMaterial(name, scene);
  mt.diffuseTexture = tex; mt.useAlphaFromDiffuseTexture = true; mt.disableLighting = !lit; mt.backFaceCulling = false;
  // unlit: Babylon's standard shader gives (emissive + ambient) * baseColor when lighting is off, and baseColor = texture * instance colour
  mt.specularColor = new B.Color3(0, 0, 0); mt.emissiveColor = new B.Color3(1, 1, 1); mt.diffuseColor = new B.Color3(1, 1, 1);
  mt.alphaMode = add ? B.Constants.ALPHA_ADD : B.Constants.ALPHA_COMBINE; mt.disableDepthWrite = true;
  mt.needAlphaBlending = () => true;
  return mt;
}

// particle record layout
const F = 20, PX = 0, PY = 1, PZ = 2, VX = 3, VY = 4, VZ = 5, AGE = 6, LIFE = 7, S0 = 8, S1 = 9, ROT = 10, ROTV = 11, CR = 12, CG = 13, CB = 14, CA = 15, DRAG = 16, GRAV = 17, STR = 18, BNC = 19;

class Pool {
  constructor(scene, name, tex, { max = 256, add = false, stretch = 0, group = 0 } = {}) {
    this.max = max; this.n = 0; this.stretch = stretch;
    this.d = new Float32Array(max * F);
    this.mat4 = new Float32Array(max * 16); this.col = new Float32Array(max * 4);
    const m = this.mesh = quadMesh(scene, 'fx_' + name);
    m.material = fxMat(scene, 'fxm_' + name, tex, add);
    m.renderingGroupId = group;
    m.thinInstanceSetBuffer('matrix', this.mat4, 16, false);
    m.thinInstanceSetBuffer('color', this.col, 4, false);
    m.thinInstanceCount = 0; m.isVisible = false;
  }
  emit(x, y, z, vx, vy, vz, life, s0, s1, r, g, b, a, drag = 1, grav = 0, rotv = 0, str = 0, bounce = 0) {
    let i = this.n;
    if (i >= this.max) i = Math.floor(Math.random() * this.max); else this.n++;
    const d = this.d, o = i * F;
    d[o + PX] = x; d[o + PY] = y; d[o + PZ] = z; d[o + VX] = vx; d[o + VY] = vy; d[o + VZ] = vz; d[o + AGE] = 0; d[o + LIFE] = life;
    d[o + S0] = s0; d[o + S1] = s1; d[o + ROT] = Math.random() * 6.283; d[o + ROTV] = rotv; d[o + CR] = r; d[o + CG] = g; d[o + CB] = b; d[o + CA] = a;
    d[o + DRAG] = drag; d[o + GRAV] = grav; d[o + STR] = str; d[o + BNC] = bounce;
  }
  update(dt, cam, world) {
    const d = this.d, M = this.mat4, C = this.col;
    const cm = cam.getWorldMatrix().m;
    const rx = cm[0], ry = cm[1], rz = cm[2], ux = cm[4], uy = cm[5], uz = cm[6], fx = cm[8], fy = cm[9], fz = cm[10];
    const cpx = cam.globalPosition.x, cpy = cam.globalPosition.y, cpz = cam.globalPosition.z;
    let n = this.n;
    for (let i = 0; i < n; i++) {
      let o = i * F;
      d[o + AGE] += dt;
      if (d[o + AGE] >= d[o + LIFE]) { n--; if (i !== n) d.copyWithin(o, n * F, n * F + F); i--; continue; }
      const k = Math.exp(-d[o + DRAG] * dt);
      d[o + VX] *= k; d[o + VY] = d[o + VY] * k - d[o + GRAV] * dt; d[o + VZ] *= k;
      const nx = d[o + PX] + d[o + VX] * dt, ny = d[o + PY] + d[o + VY] * dt, nz = d[o + PZ] + d[o + VZ] * dt;
      if (d[o + BNC] > 0 && d[o + VY] < 0 && world) {
        const g = world.groundAt(nx, nz, d[o + PY] + 0.02, 0);
        if (g && ny <= g.y + 0.01) { d[o + PY] = g.y + 0.012; d[o + VY] *= -d[o + BNC]; d[o + VX] *= 0.45; d[o + VZ] *= 0.45; d[o + ROTV] *= 0.5; d[o + PX] = nx; d[o + PZ] = nz; }
        else { d[o + PX] = nx; d[o + PY] = ny; d[o + PZ] = nz; }
      } else { d[o + PX] = nx; d[o + PY] = ny; d[o + PZ] = nz; }
      d[o + ROT] += d[o + ROTV] * dt;
    }
    this.n = n;
    for (let i = 0; i < n; i++) {
      const o = i * F, u = d[o + AGE] / d[o + LIFE];
      const s = d[o + S0] + (d[o + S1] - d[o + S0]) * Math.sqrt(u);
      const fade = u < 0.08 ? u / 0.08 : 1 - (u - 0.08) / 0.92;
      const px = d[o + PX], py = d[o + PY], pz = d[o + PZ], m = i * 16;
      if (d[o + STR] > 0) {
        // velocity-stretched streak facing the camera (cylindrical billboard)
        let ax = d[o + VX], ay = d[o + VY], az = d[o + VZ]; const sp = Math.hypot(ax, ay, az) || 1; ax /= sp; ay /= sp; az /= sp;
        let tx = cpx - px, ty = cpy - py, tz = cpz - pz;
        let sx = ay * tz - az * ty, sy = az * tx - ax * tz, sz = ax * ty - ay * tx; const sl = Math.hypot(sx, sy, sz) || 1; sx /= sl; sy /= sl; sz /= sl;
        const L = s + sp * d[o + STR];
        M[m] = sx * s; M[m + 1] = sy * s; M[m + 2] = sz * s; M[m + 3] = 0;
        M[m + 4] = ax * L; M[m + 5] = ay * L; M[m + 6] = az * L; M[m + 7] = 0;
        M[m + 8] = fx; M[m + 9] = fy; M[m + 10] = fz; M[m + 11] = 0;
      } else {
        const c = Math.cos(d[o + ROT]) * s, sn = Math.sin(d[o + ROT]) * s;
        M[m] = rx * c + ux * sn; M[m + 1] = ry * c + uy * sn; M[m + 2] = rz * c + uz * sn; M[m + 3] = 0;
        M[m + 4] = -rx * sn + ux * c; M[m + 5] = -ry * sn + uy * c; M[m + 6] = -rz * sn + uz * c; M[m + 7] = 0;
        M[m + 8] = fx; M[m + 9] = fy; M[m + 10] = fz; M[m + 11] = 0;
      }
      M[m + 12] = px; M[m + 13] = py; M[m + 14] = pz; M[m + 15] = 1;
      const c4 = i * 4; C[c4] = d[o + CR]; C[c4 + 1] = d[o + CG]; C[c4 + 2] = d[o + CB]; C[c4 + 3] = d[o + CA] * Math.max(0, fade);
    }
    const mesh = this.mesh;
    mesh.thinInstanceCount = n; mesh.isVisible = n > 0;
    if (n > 0) { mesh.thinInstanceBufferUpdated('matrix'); mesh.thinInstanceBufferUpdated('color'); }
  }
  dispose() { this.mesh.material.dispose(); this.mesh.dispose(); }
}

class DecalPool {
  constructor(scene, name, tex, max = 96, lit = true) {
    const B = BB();
    this.max = max; this.i = 0; this.n = 0;
    this.mat4 = new Float32Array(max * 16); this.col = new Float32Array(max * 4).fill(1);
    const m = this.mesh = quadMesh(scene, 'decal_' + name);
    const mt = new B.StandardMaterial('decalm_' + name, scene);
    mt.diffuseTexture = tex; mt.useAlphaFromDiffuseTexture = true; mt.specularColor = new B.Color3(0.04, 0.04, 0.04); mt.zOffset = -3;
    mt.backFaceCulling = true; mt.disableDepthWrite = true; mt.disableLighting = !lit; mt.maxSimultaneousLights = 6;
    m.material = mt; m.receiveShadows = false;
    m.thinInstanceSetBuffer('matrix', this.mat4, 16, false); m.thinInstanceSetBuffer('color', this.col, 4, false);
    m.thinInstanceCount = 0; m.isVisible = false;
    this.dirty = false;
  }
  add(p, nrm, size, rot, r = 1, g = 1, b = 1, a = 1) {
    const i = this.i; this.i = (this.i + 1) % this.max; this.n = Math.min(this.max, this.n + 1);
    // basis: Z = -normal (the quad's front faces -Z), X / Y in the surface plane
    let nx = nrm.x, ny = nrm.y, nz = nrm.z; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    let tx = Math.abs(ny) < 0.9 ? 0 : 1, ty = Math.abs(ny) < 0.9 ? 1 : 0, tz = 0;
    let xx = ty * nz - tz * ny, xy = tz * nx - tx * nz, xz = tx * ny - ty * nx; const xl = Math.hypot(xx, xy, xz) || 1; xx /= xl; xy /= xl; xz /= xl;
    let yx = ny * xz - nz * xy, yy = nz * xx - nx * xz, yz = nx * xy - ny * xx;
    const c = Math.cos(rot), s = Math.sin(rot);
    const ax = (xx * c + yx * s) * size, ay = (xy * c + yy * s) * size, az = (xz * c + yz * s) * size;
    const bx = (-xx * s + yx * c) * size, by = (-xy * s + yy * c) * size, bz = (-xz * s + yz * c) * size;
    const M = this.mat4, m = i * 16;
    M[m] = ax; M[m + 1] = ay; M[m + 2] = az; M[m + 3] = 0; M[m + 4] = bx; M[m + 5] = by; M[m + 6] = bz; M[m + 7] = 0;
    M[m + 8] = -nx; M[m + 9] = -ny; M[m + 10] = -nz; M[m + 11] = 0;
    M[m + 12] = p.x + nx * 0.004; M[m + 13] = p.y + ny * 0.004; M[m + 14] = p.z + nz * 0.004; M[m + 15] = 1;
    const C = this.col, q = i * 4; C[q] = r; C[q + 1] = g; C[q + 2] = b; C[q + 3] = a;
    this.dirty = true;
  }
  flush() {
    if (!this.dirty) return; this.dirty = false;
    const m = this.mesh; m.thinInstanceCount = this.n; m.isVisible = this.n > 0;
    m.thinInstanceBufferUpdated('matrix'); m.thinInstanceBufferUpdated('color');
  }
  clear() { this.n = 0; this.i = 0; this.dirty = true; }
  dispose() { this.mesh.material.dispose(); this.mesh.dispose(); }
}

export class Effects {
  constructor(scene, game) {
    this.name = 'effects'; this.scene = scene; this.g = game;
    const B = BB();
    const env = (game.def && game.def.env) || {};
    this.amb = AMB[env.time] ?? 0.8;
    this.tex = {
      soft: canvasTex(scene, 'fxSoft', 64, (c, s) => { const g = c.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, s, s); }),
      puff: canvasTex(scene, 'fxPuff', 128, (c, s) => {
        for (let i = 0; i < 26; i++) { const a = Math.random() * 6.283, r = Math.random() * s * 0.22, x = s / 2 + Math.cos(a) * r, y = s / 2 + Math.sin(a) * r, rr = s * (0.12 + Math.random() * 0.16);
          const g = c.createRadialGradient(x, y, 0, x, y, rr); g.addColorStop(0, 'rgba(255,255,255,.22)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, s, s); }
      }),
      chip: canvasTex(scene, 'fxChip', 32, (c, s) => { c.fillStyle = '#fff'; c.beginPath(); c.moveTo(s * 0.2, s * 0.3); c.lineTo(s * 0.7, s * 0.15); c.lineTo(s * 0.85, s * 0.65); c.lineTo(s * 0.35, s * 0.85); c.closePath(); c.fill(); }),
      spark: canvasTex(scene, 'fxSpark', 32, (c, s) => { const g = c.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,240,200,.9)'); g.addColorStop(1, 'rgba(255,160,60,0)'); c.fillStyle = g; c.fillRect(0, 0, s, s); }),
      flash: canvasTex(scene, 'fxFlash', 128, (c, s) => {
        const h = s / 2; c.translate(h, h);
        for (let k = 0; k < 5; k++) { c.rotate(Math.PI * 2 / 5 + (Math.random() - 0.5) * 0.4); const L = h * (0.6 + Math.random() * 0.4); const g = c.createLinearGradient(0, 0, L, 0); g.addColorStop(0, 'rgba(255,240,200,1)'); g.addColorStop(1, 'rgba(255,140,40,0)'); c.fillStyle = g; c.beginPath(); c.moveTo(0, -h * 0.09); c.lineTo(L, 0); c.lineTo(0, h * 0.09); c.closePath(); c.fill(); }
        const g = c.createRadialGradient(0, 0, 0, 0, 0, h * 0.55); g.addColorStop(0, 'rgba(255,255,240,1)'); g.addColorStop(0.3, 'rgba(255,210,130,.9)'); g.addColorStop(1, 'rgba(255,120,30,0)'); c.fillStyle = g; c.beginPath(); c.arc(0, 0, h * 0.55, 0, 6.283); c.fill();
      }),
      tracer: canvasTex(scene, 'fxTracer', 64, (c, s) => { const g = c.createLinearGradient(0, 0, s, 0); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, s, s);
        const v = c.createLinearGradient(0, 0, 0, s); v.addColorStop(0, 'rgba(0,0,0,1)'); v.addColorStop(0.15, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0)'); c.globalCompositeOperation = 'destination-out'; c.fillStyle = v; c.fillRect(0, 0, s, s); }),
    };
    this.tex.hole = holeTex(scene, 'decHole', '#151413', '#3a3835', 0.5);
    this.tex.hole_metal = holeTex(scene, 'decHoleM', '#0d0d0e', '#9a9b9e', 0.25);
    this.tex.hole_wood = holeTex(scene, 'decHoleW', '#1b130c', '#7a5a3a', 0.7);
    this.tex.hole_glass = glassTex(scene);
    this.tex.blood = bloodTex(scene);
    this.pools = {
      spark: new Pool(scene, 'spark', this.tex.spark, { max: 240, add: true, stretch: 1 }),
      dust: new Pool(scene, 'dust', this.tex.puff, { max: 160 }),
      chip: new Pool(scene, 'chip', this.tex.chip, { max: 220 }),
      mist: new Pool(scene, 'mist', this.tex.soft, { max: 120 }),
      flare: new Pool(scene, 'flare', this.tex.flash, { max: 24, add: true }),
    };
    this.pools.spark.stretch = 1;
    this.decals = {};
    for (const k of DECAL_KINDS) this.decals[k] = new DecalPool(scene, k, this.tex[k], k === 'blood' ? 48 : 110);
    // tracers: thin instances too (stretched quads along the path)
    this.tr = { max: 48, n: 0, d: new Float32Array(48 * 12), mat4: new Float32Array(48 * 16), col: new Float32Array(48 * 4) };
    const tm = this.tr.mesh = quadMesh(scene, 'fx_tracers');
    tm.material = fxMat(scene, 'fxm_tracer', this.tex.tracer, true);
    tm.thinInstanceSetBuffer('matrix', this.tr.mat4, 16, false); tm.thinInstanceSetBuffer('color', this.tr.col, 4, false);
    tm.thinInstanceCount = 0; tm.isVisible = false;
    // casings
    this.cas = { max: 40, n: 0, d: new Float32Array(40 * 12), mat4: new Float32Array(40 * 16) };
    const cm = this.cas.mesh = B.MeshBuilder.CreateCylinder('fx_casing', { height: 1, diameter: 1, tessellation: 8 }, scene);
    const brass = new B.PBRMaterial('fxm_brass', scene); brass.albedoColor = new B.Color3(0.72, 0.52, 0.22); brass.metallic = 1; brass.roughness = 0.32;
    cm.material = brass; cm.isPickable = false; cm.alwaysSelectAsActiveMesh = true;
    cm.thinInstanceSetBuffer('matrix', this.cas.mat4, 16, false); cm.thinInstanceCount = 0; cm.isVisible = false;
    // local muzzle flash (on the viewmodel muzzle, group 1) + remote flashes (pool 'flare') + one light
    this.flashLocal = this.makeLocalFlash();
    this.light = new B.PointLight('muzzleLight', new B.Vector3(0, -100, 0), scene);
    this.light.diffuse = new B.Color3(1, 0.72, 0.42); this.light.specular = new B.Color3(0.6, 0.45, 0.3);
    this.light.intensity = 0; this.light.range = 9; this.lightT = 0; this.lightI = 0;
    this.localFlashT = 9;
    this.q = new B.Quaternion(); this.v = new B.Vector3(); this.v2 = new B.Vector3();
    this.ray = { out: { hit: false, dist: 0, point: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 0, z: 0 }, surf: null, id: -1 } };
    const bus = game.bus;
    this.offs = [
      bus.on('shot', e => this.onShot(e)),
      bus.on('impact', e => this.onImpact(e)),
      bus.on('bullet:body', e => this.onBody(e)),
      bus.on('round:reset', () => { for (const k in this.decals) this.decals[k].clear(); }),
    ];
  }

  makeLocalFlash() {
    const B = BB(), S = this.scene, root = new B.TransformNode('vmFlash', S);
    const mat = fxMat(S, 'fxm_vmflash', this.tex.flash, true);
    const front = quadMesh(S, 'vmFlashF'); front.material = mat; front.parent = root; front.scaling.set(0.11, 0.11, 1); front.position.z = 0.015;
    const side1 = quadMesh(S, 'vmFlashS1', 0.5); side1.material = mat; side1.parent = root; side1.rotation.set(Math.PI / 2, 0, 0); side1.scaling.set(0.07, 0.16, 1);
    const side2 = quadMesh(S, 'vmFlashS2', 0.5); side2.material = mat; side2.parent = root; side2.rotation.set(Math.PI / 2, 0, Math.PI / 2); side2.scaling.set(0.07, 0.16, 1);
    for (const m of [front, side1, side2]) { m.renderingGroupId = 1; m.alwaysSelectAsActiveMesh = true; }
    root.setEnabled(false);
    return { root, meshes: [front, side1, side2] };
  }

  // ---------------------------------------------------------------------------------------------- event handlers
  onShot(e) {
    const p = e.p, st = e.gun || {}, g = this.g;
    const vm = g.viewmodel, local = p && p.local && vm && vm.visible;
    const hide = st.flashHide || st.suppressed;
    let ox = e.origin.x, oy = e.origin.y, oz = e.origin.z;
    if (local) {
      const mz = vm.muzzleNode();
      if (mz) { mz.computeWorldMatrix(true); const wp = mz.getAbsolutePosition(); ox = wp.x; oy = wp.y; oz = wp.z;
        if (!hide) { const f = this.flashLocal; if (f.root.parent !== mz) f.root.parent = mz; f.root.position.set(0, 0, 0); f.root.rotation.set(0, 0, Math.random() * 6.28); const s = 0.75 + Math.random() * 0.5; f.root.scaling.set(s, s, s * (0.8 + Math.random() * 0.5)); f.root.setEnabled(true); this.localFlashT = 0; } }
      this.casing(vm.ejectNode(), p, st);
    } else if (p) {
      const b = g.bodies && g.bodies.muzzleOf ? g.bodies.muzzleOf(p, this.v) : null;
      if (b) { ox = b.x; oy = b.y; oz = b.z; }
      if (!hide) this.pools.flare.emit(ox + e.dir.x * 0.05, oy + e.dir.y * 0.05, oz + e.dir.z * 0.05, 0, 0, 0, 0.055, 0.22 + Math.random() * 0.15, 0.3, 1, 0.85, 0.6, 1, 0, 0, 0);
    }
    if (!hide) {
      const cam = g.camera.position, d = Math.hypot(ox - cam.x, oy - cam.y, oz - cam.z);
      if (local || d < 45) {
        const I = local ? 1.6 : 1.2 * clamp(1 - d / 45, 0, 1);
        if (I >= this.lightI * 0.6) { this.light.position.set(ox + e.dir.x * 0.3, oy + e.dir.y * 0.3, oz + e.dir.z * 0.3); this.lightI = I; this.lightT = 0; }
      }
    }
    // tracers (every Nth round per gun, and always a faint one for the local player's first pellet)
    const tc = st.tracerColor || [1, 0.78, 0.45];
    const tr = e.traces;
    if (tr && tr.length && (e.tracer || (local && Math.random() < 0.25))) {
      const t0 = tr[0], k = e.tracer ? 1 : 0.35;
      this.tracer(ox, oy, oz, t0.end.x, t0.end.y, t0.end.z, tc[0] * k, tc[1] * k, tc[2] * k, Math.min(700, (st.velocity || 700) * 0.8));
    }
  }

  onImpact(e) {
    const surf = e.surf || 'concrete', P = e.point, N = e.normal;
    if (!P || !N) return;
    const cam = this.g.camera.position, d = Math.hypot(P.x - cam.x, P.y - cam.y, P.z - cam.z);
    const k = e.pellets > 1 ? 0.45 : 1;
    if (d < 90) this.burst(surf, P, N, { scale: (e.exit ? 0.6 : 1) * k, dir: e.dir, melee: e.melee });
    if (e.melee) return;
    const fx = SURF_FX[surf] || SURF_FX.concrete;
    if (!fx.hole) return;
    if (e.id >= 0) { const c = this.g.world.get && this.g.world.get(e.id); if (c && c.tag === 'gate') return; }
    const sz = (e.pellets > 1 ? 0.03 : 0.045) * (e.exit ? 1.25 : 1) * (0.85 + Math.random() * 0.3);
    const dk = 0.8 + Math.random() * 0.2;
    this.decals[fx.hole].add(P, N, sz * 2, Math.random() * 6.283, dk, dk, dk, 1);
  }

  onBody(e) {
    const P = e.point, D = e.dir, k = clamp((e.dmg || 20) / 30, 0.4, 1.5);
    if (!P) return;
    if (e.friendly) return;
    const pm = this.pools.mist, pc = this.pools.chip, amb = this.amb;
    for (let i = 0; i < 4 + 3 * k; i++) {
      const s = 0.6 + Math.random() * 1.2;
      pm.emit(P.x, P.y, P.z, D.x * s + (Math.random() - 0.5) * 1.2, D.y * s + Math.random() * 0.8, D.z * s + (Math.random() - 0.5) * 1.2, 0.35 + Math.random() * 0.3, 0.05, 0.3 + 0.2 * k,
        0.42 * amb, 0.03 * amb, 0.03 * amb, 0.75, 3.5, 0.6);
    }
    for (let i = 0; i < 6 * k; i++) {
      const s = 2 + Math.random() * 3;
      pc.emit(P.x, P.y, P.z, D.x * s + (Math.random() - 0.5) * 2, D.y * s + Math.random() * 1.5, D.z * s + (Math.random() - 0.5) * 2, 0.5 + Math.random() * 0.4, 0.012, 0.008,
        0.35 * amb, 0.02, 0.02, 1, 0.4, 9.8, 0, 0, 0.1);
    }
    // splats on the wall / floor behind the victim
    if (Math.random() < 0.85 && !e.melee) {
      const r = raycast(this.g.world, P, D, 2.6, this.ray);
      if (r.hit && r.surf !== 'glass') { const s = (0.18 + Math.random() * 0.3) * k; this.decals.blood.add(r.point, r.normal, s, Math.random() * 6.283, 0.55 + Math.random() * 0.2, 0.55, 0.55, 0.95); }
    }
    if (Math.random() < 0.6) {
      const r = raycast(this.g.world, { x: P.x + D.x * 0.3, y: P.y, z: P.z + D.z * 0.3 }, { x: 0, y: -1, z: 0 }, 2.2, this.ray);
      if (r.hit) { const s = (0.2 + Math.random() * 0.25) * k; this.decals.blood.add(r.point, r.normal, s, Math.random() * 6.283, 0.5, 0.5, 0.5, 0.9); }
    }
  }

  // ---------------------------------------------------------------------------------------------- effects
  burst(surf, P, N, o = {}) {
    const fx = SURF_FX[surf] || SURF_FX.concrete, sc = o.scale ?? 1, amb = this.amb;
    const pd = this.pools.dust, pc = this.pools.chip, ps = this.pools.spark;
    const nx = N.x, ny = N.y, nz = N.z;
    const px = P.x + nx * 0.02, py = P.y + ny * 0.02, pz = P.z + nz * 0.02;
    // reflect a little of the incoming direction (the cone of debris leans away from the shooter)
    let rx = nx, ry = ny, rz = nz;
    if (o.dir) { const dn = o.dir.x * nx + o.dir.y * ny + o.dir.z * nz; rx = o.dir.x - 2 * dn * nx; ry = o.dir.y - 2 * dn * ny; rz = o.dir.z - 2 * dn * nz; rx = (rx + nx) * 0.5; ry = (ry + ny) * 0.5; rz = (rz + nz) * 0.5; }
    const dc = fx.dust, cc = fx.chip, n = fx.n * sc;
    const nd = Math.round((fx.water ? 6 : 3) * n + 1);
    for (let i = 0; i < nd; i++) {
      const s = 0.4 + Math.random() * (fx.water ? 2.5 : 1.3);
      pd.emit(px, py, pz, rx * s + (Math.random() - 0.5) * 0.6, ry * s + (Math.random() - 0.3) * 0.5 + (fx.water ? 1.5 : 0), rz * s + (Math.random() - 0.5) * 0.6,
        0.7 + Math.random() * 0.9, 0.05, (0.35 + Math.random() * 0.35) * (0.6 + 0.5 * sc), dc[0] * amb, dc[1] * amb, dc[2] * amb, fx.water ? 0.5 : 0.55, 3.2, fx.water ? 4 : -0.25, (Math.random() - 0.5) * 1.5);
    }
    const nc = Math.round((fx.splinter ? 7 : 5) * n);
    for (let i = 0; i < nc; i++) {
      const s = 1.5 + Math.random() * 3.5;
      const sz = fx.splinter ? 0.012 + Math.random() * 0.016 : 0.006 + Math.random() * 0.01;
      pc.emit(px, py, pz, rx * s + (Math.random() - 0.5) * 2.5, ry * s + Math.random() * 2, rz * s + (Math.random() - 0.5) * 2.5, 0.6 + Math.random() * 0.8, sz, sz,
        cc[0] * amb, cc[1] * amb, cc[2] * amb, 1, 0.5, 9.8, (Math.random() - 0.5) * 30, 0, 0.25);
    }
    const sk = (fx.spark || 0) * sc + (o.melee && fx.spark ? 0.4 : 0);
    if (sk > 0) {
      const ns = Math.round(6 + 10 * sk * Math.random());
      for (let i = 0; i < ns; i++) {
        const s = 3 + Math.random() * 7;
        ps.emit(px, py, pz, rx * s + (Math.random() - 0.5) * 5, ry * s + (Math.random() - 0.2) * 4, rz * s + (Math.random() - 0.5) * 5, 0.12 + Math.random() * 0.3, 0.006, 0.004,
          1, 0.72 + Math.random() * 0.2, 0.35, 1, 1.2, 9.8, 0, 0.012, 0.35);
      }
      this.pools.flare.emit(px, py, pz, 0, 0, 0, 0.04, 0.08, 0.14, 1, 0.8, 0.5, 0.8, 0, 0, 0);
    }
    if (fx.glass) {
      for (let i = 0; i < 8 * sc; i++) {
        const s = 1 + Math.random() * 3;
        ps.emit(px, py, pz, rx * s + (Math.random() - 0.5) * 2, ry * s + (Math.random() - 0.5) * 2, rz * s + (Math.random() - 0.5) * 2, 0.4 + Math.random() * 0.4, 0.008, 0.005, 0.7, 0.8, 0.9, 0.8, 0.5, 9.8, 0, 0.004, 0.2);
      }
    }
  }

  tracer(ax, ay, az, bx, by, bz, r, g, b, speed = 600) {
    const T = this.tr; let i = T.n; if (i >= T.max) i = Math.floor(Math.random() * T.max); else T.n++;
    const d = T.d, o = i * 12, L = Math.hypot(bx - ax, by - ay, bz - az);
    if (L < 1) { if (i === T.n - 1) T.n--; return; }
    d[o] = ax; d[o + 1] = ay; d[o + 2] = az; d[o + 3] = (bx - ax) / L; d[o + 4] = (by - ay) / L; d[o + 5] = (bz - az) / L;
    d[o + 6] = L; d[o + 7] = 0; d[o + 8] = speed; d[o + 9] = r; d[o + 10] = g; d[o + 11] = b;   // [7] = distance travelled by the head
  }
  updateTracers(dt) {
    const T = this.tr, d = T.d, M = T.mat4, C = T.col, cam = this.g.camera, cp = cam.globalPosition, cm = cam.getWorldMatrix().m;
    let n = T.n;
    for (let i = 0; i < n; i++) {
      const o = i * 12;
      d[o + 7] += d[o + 8] * dt;
      if (d[o + 7] - 7 > d[o + 6]) { n--; if (i !== n) d.copyWithin(o, n * 12, n * 12 + 12); i--; continue; }
    }
    T.n = n;
    for (let i = 0; i < n; i++) {
      const o = i * 12, head = Math.min(d[o + 6], d[o + 7]), tail = Math.max(0, d[o + 7] - 7);
      const len = Math.max(0.05, head - tail), mid = (head + tail) / 2;
      const ax = d[o + 3], ay = d[o + 4], az = d[o + 5];
      const px = d[o] + ax * mid, py = d[o + 1] + ay * mid, pz = d[o + 2] + az * mid;
      let tx = cp.x - px, ty = cp.y - py, tz = cp.z - pz;
      const dist = Math.hypot(tx, ty, tz) || 1;
      let sx = ay * tz - az * ty, sy = az * tx - ax * tz, sz = ax * ty - ay * tx; const sl = Math.hypot(sx, sy, sz) || 1; sx /= sl; sy /= sl; sz /= sl;
      const w = clamp(0.012 + dist * 0.0012, 0.012, 0.09);
      const m = i * 16;
      M[m] = sx * w; M[m + 1] = sy * w; M[m + 2] = sz * w; M[m + 3] = 0; M[m + 4] = ax * len; M[m + 5] = ay * len; M[m + 6] = az * len; M[m + 7] = 0;
      M[m + 8] = cm[8]; M[m + 9] = cm[9]; M[m + 10] = cm[10]; M[m + 11] = 0; M[m + 12] = px; M[m + 13] = py; M[m + 14] = pz; M[m + 15] = 1;
      const fade = d[o + 7] > d[o + 6] ? clamp(1 - (d[o + 7] - d[o + 6]) / 7, 0, 1) : 1;
      const c4 = i * 4; C[c4] = d[o + 9] * 2.2; C[c4 + 1] = d[o + 10] * 2.2; C[c4 + 2] = d[o + 11] * 2.2; C[c4 + 3] = fade;
    }
    const mesh = T.mesh; mesh.thinInstanceCount = n; mesh.isVisible = n > 0;
    if (n) { mesh.thinInstanceBufferUpdated('matrix'); mesh.thinInstanceBufferUpdated('color'); }
  }

  casing(node, p, st) {
    if (!node || !st || st.cat === 'shotgun' && st.cycle === 'pump' || st.reloadKind === 'cylinder' || st.reloadKind === 'break') return;
    node.computeWorldMatrix(true);
    const wp = node.getAbsolutePosition(), m = node.getWorldMatrix().m;
    const C = this.cas; let i = C.n; if (i >= C.max) i = Math.floor(Math.random() * C.max); else C.n++;
    const d = C.d, o = i * 12;
    const big = /762|308|338|50/.test(st.caliber || '') ? 1.35 : /9|45|38|357/.test(st.caliber || '') ? 0.75 : 1;
    // right + up of the gun, a little back
    const rs = 1.6 + Math.random() * 1.2, us = 1.2 + Math.random() * 0.9;
    d[o] = wp.x; d[o + 1] = wp.y; d[o + 2] = wp.z;
    d[o + 3] = m[0] * rs + m[4] * us - m[8] * 0.3 + p.vel.x; d[o + 4] = m[1] * rs + m[5] * us - m[9] * 0.3 + p.vel.y; d[o + 5] = m[2] * rs + m[6] * us - m[10] * 0.3 + p.vel.z;
    d[o + 6] = 0; d[o + 7] = Math.random() * 6.28; d[o + 8] = (Math.random() - 0.5) * 30; d[o + 9] = big; d[o + 10] = 0; d[o + 11] = 0;
  }
  updateCasings(dt) {
    const C = this.cas, d = C.d, M = C.mat4, world = this.g.world;
    let n = C.n;
    for (let i = 0; i < n; i++) {
      const o = i * 12;
      d[o + 6] += dt;
      if (d[o + 6] > 8) { n--; if (i !== n) d.copyWithin(o, n * 12, n * 12 + 12); i--; continue; }
      if (d[o + 11] > 2) continue;   // resting
      d[o + 4] -= 9.8 * dt;
      const nx = d[o] + d[o + 3] * dt, ny = d[o + 1] + d[o + 4] * dt, nz = d[o + 2] + d[o + 5] * dt;
      const g = d[o + 4] < 0 ? world.groundAt(nx, nz, d[o + 1] + 0.02, 0) : null;
      if (g && ny <= g.y + 0.006) {
        d[o + 1] = g.y + 0.006; d[o + 4] *= -0.32; d[o + 3] *= 0.4; d[o + 5] *= 0.4; d[o + 8] *= 0.4; d[o + 11]++; d[o] = nx; d[o + 2] = nz;
        if (d[o + 11] > 2) { d[o + 3] = d[o + 4] = d[o + 5] = 0; }
      } else { d[o] = nx; d[o + 1] = ny; d[o + 2] = nz; }
      d[o + 7] += d[o + 8] * dt;
    }
    C.n = n;
    const B = BB(), q = this.q;
    for (let i = 0; i < n; i++) {
      const o = i * 12, s = d[o + 9], m = i * 16;
      B.Quaternion.RotationYawPitchRollToRef(d[o + 7], d[o + 11] > 2 ? Math.PI / 2 : d[o + 7] * 1.7, d[o + 7] * 0.6, q);
      const x = q.x, y = q.y, z = q.z, w = q.w;
      const sx = 0.0105 * s, sy = 0.034 * s, sz = 0.0105 * s;
      M[m] = (1 - 2 * (y * y + z * z)) * sx; M[m + 1] = 2 * (x * y + z * w) * sx; M[m + 2] = 2 * (x * z - y * w) * sx; M[m + 3] = 0;
      M[m + 4] = 2 * (x * y - z * w) * sy; M[m + 5] = (1 - 2 * (x * x + z * z)) * sy; M[m + 6] = 2 * (y * z + x * w) * sy; M[m + 7] = 0;
      M[m + 8] = 2 * (x * z + y * w) * sz; M[m + 9] = 2 * (y * z - x * w) * sz; M[m + 10] = (1 - 2 * (x * x + y * y)) * sz; M[m + 11] = 0;
      M[m + 12] = d[o]; M[m + 13] = d[o + 1]; M[m + 14] = d[o + 2]; M[m + 15] = 1;
    }
    const mesh = C.mesh; mesh.thinInstanceCount = n; mesh.isVisible = n > 0;
    if (n) mesh.thinInstanceBufferUpdated('matrix');
  }

  frame(dt) {
    dt = this.hold ? 0 : Math.min(dt, 0.1);     // hold = freeze every effect where it is (screenshots)
    const cam = this.g.camera; if (!cam) return;
    cam.computeWorldMatrix();
    for (const k in this.pools) this.pools[k].update(dt, cam, this.g.world);
    for (const k in this.decals) this.decals[k].flush();
    this.updateTracers(dt);
    this.updateCasings(dt);
    this.localFlashT += dt;
    if (this.flashLocal.root.isEnabled() && this.localFlashT > 0.045) this.flashLocal.root.setEnabled(false);
    this.lightT += dt;
    this.light.intensity = this.lightT < 0.06 ? this.lightI * (1 - this.lightT / 0.06) : 0;
    if (this.lightT >= 0.06) this.lightI = 0;
  }

  dispose() {
    for (const f of this.offs) f(); this.offs.length = 0;
    for (const k in this.pools) this.pools[k].dispose();
    for (const k in this.decals) this.decals[k].dispose();
    this.tr.mesh.material.dispose(); this.tr.mesh.dispose();
    this.cas.mesh.material.dispose(); this.cas.mesh.dispose();
    for (const m of this.flashLocal.meshes) m.dispose(); this.flashLocal.root.dispose();
    this.light.dispose();
    for (const k in this.tex) this.tex[k].dispose();
  }
}

function holeTex(scene, name, core, rim, crack) {
  return canvasTex(scene, name, 128, (c, s) => {
    const h = s / 2;
    // soot / dust ring
    let g = c.createRadialGradient(h, h, s * 0.06, h, h, s * 0.5); g.addColorStop(0, 'rgba(30,28,26,.55)'); g.addColorStop(0.5, 'rgba(40,38,35,.18)'); g.addColorStop(1, 'rgba(40,38,35,0)');
    c.fillStyle = g; c.fillRect(0, 0, s, s);
    // crater chips
    c.fillStyle = rim;
    for (let i = 0; i < 9; i++) { const a = Math.random() * 6.283, r = s * (0.1 + Math.random() * 0.12); c.globalAlpha = 0.5 + Math.random() * 0.4; c.beginPath(); c.arc(h + Math.cos(a) * r * 0.6, h + Math.sin(a) * r * 0.6, s * (0.04 + Math.random() * 0.05), 0, 6.283); c.fill(); }
    c.globalAlpha = 1;
    // cracks
    c.strokeStyle = 'rgba(15,14,13,' + (0.35 + crack * 0.4) + ')'; c.lineWidth = 1.2;
    for (let i = 0; i < 4 + crack * 5; i++) { const a = Math.random() * 6.283, L = s * (0.16 + Math.random() * 0.22 * crack); c.beginPath(); c.moveTo(h, h); c.lineTo(h + Math.cos(a) * L * 0.5 + (Math.random() - 0.5) * 6, h + Math.sin(a) * L * 0.5 + (Math.random() - 0.5) * 6); c.lineTo(h + Math.cos(a) * L, h + Math.sin(a) * L); c.stroke(); }
    // the hole
    g = c.createRadialGradient(h, h, 0, h, h, s * 0.11); g.addColorStop(0, '#000'); g.addColorStop(0.65, core); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g; c.beginPath(); c.arc(h, h, s * 0.11, 0, 6.283); c.fill();
  });
}
function glassTex(scene) {
  return canvasTex(scene, 'decGlass', 128, (c, s) => {
    const h = s / 2; c.strokeStyle = 'rgba(235,240,245,.75)'; c.lineWidth = 1;
    for (let i = 0; i < 11; i++) { const a = i / 11 * 6.283 + Math.random() * 0.3, L = s * (0.25 + Math.random() * 0.24); c.beginPath(); c.moveTo(h, h); let x = h, y = h; for (let k = 1; k <= 4; k++) { x = h + Math.cos(a + (Math.random() - 0.5) * 0.2) * L * k / 4; y = h + Math.sin(a + (Math.random() - 0.5) * 0.2) * L * k / 4; c.lineTo(x, y); } c.stroke(); }
    for (let r = 1; r <= 3; r++) { c.beginPath(); for (let i = 0; i <= 12; i++) { const a = i / 12 * 6.283, rr = s * 0.07 * r * (0.85 + Math.random() * 0.3); c[i ? 'lineTo' : 'moveTo'](h + Math.cos(a) * rr, h + Math.sin(a) * rr); } c.stroke(); }
    c.fillStyle = 'rgba(255,255,255,.85)'; c.beginPath(); c.arc(h, h, s * 0.035, 0, 6.283); c.fill();
  });
}
function bloodTex(scene) {
  return canvasTex(scene, 'decBlood', 128, (c, s) => {
    const h = s / 2;
    for (let i = 0; i < 18; i++) {
      const a = Math.random() * 6.283, r = Math.random() * s * 0.3, x = h + Math.cos(a) * r, y = h + Math.sin(a) * r, rr = s * (0.03 + Math.random() * 0.12) * (1 - r / (s * 0.4));
      c.fillStyle = 'rgba(' + (70 + Math.random() * 30 | 0) + ',4,5,' + (0.55 + Math.random() * 0.4) + ')';
      c.beginPath(); c.arc(x, y, Math.max(1, rr), 0, 6.283); c.fill();
    }
    c.strokeStyle = 'rgba(80,6,6,.7)'; c.lineWidth = 2;
    for (let i = 0; i < 6; i++) { const a = Math.random() * 6.283, L = s * (0.2 + Math.random() * 0.25); c.beginPath(); c.moveTo(h, h); c.lineTo(h + Math.cos(a) * L, h + Math.sin(a) * L); c.stroke(); }
  });
}
