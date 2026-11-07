/* LIVE FIRE — prop_gallery: a DEV map that lays out every prop type of js/maps/props.js (each variant side by side) in labelled
   rows on a concrete apron, with a 1.8 m reference figure at the start of every type. Not one of the 25 shipped maps.
   Open it with #dev&sandbox&map=prop_gallery (walk it) or node tools/test/props.mjs (headless shots of every type).
   Exports: default MapDef, GALLERY (the layout: [{ type, variant, x, z, w, h, d, seg }]), SEGMENTS ([{ type, x0, x1, z, h, d }]) */
import { propList, propSize } from '../props.js';

const GAP = 1.6, ROW_MAX = 96, MARGIN = 6;
const ORDER = ['industrial', 'construction', 'military', 'vehicle', 'rail', 'street', 'nature', 'interior', 'scan'];
const HUGE = new Set(['airliner', 'crane_portal', 'tank', 'tower_crane_base']);
const CEILING = new Set(['light_fixture']);
const WALLED = new Set(['poster', 'wall_clock', 'whiteboard', 'curtain']);

export const GALLERY = [];
export const SEGMENTS = [];
// options that show a prop at its most telling (the gallery shows the variants; these add one extra placement each)
const EXTRA = {
  container: [{ doors: 'open', variant: 'blue' }, { doors: 'ajar', variant: 'grey', len: 40 }],
  pallet: [{ stack: 8, variant: 'none' }],
  drum: [{ n: 4, variant: 'blue' }, { fallen: true, variant: 'rust' }],
  car: [{ variant: 'sedan', state: 'wreck' }, { variant: 'hatch', state: 'burnt' }, { variant: 'police', lights: true }],
  crate_plastic: [{ n: 5, variant: 'red' }],
  cardboard_box: [{ stack: 3, variant: 'medium' }],
  gas_cylinder: [{ rack: true, variant: 'oxygen' }, { n: 4, variant: 'argon' }],
  trash_bag: [{ n: 8, variant: 'black' }],
  site_cabin: [{ interior: true, variant: 'blue' }],
  railcar: [{ variant: 'flatcar', load: 'pipes' }],
  dumpster: [{ lid: 'open', variant: 'blue' }],
};

(function layout() {
  const list = propList().slice().sort((a, b) => ORDER.indexOf(a.scan ? 'scan' : a.cat) - ORDER.indexOf(b.scan ? 'scan' : b.cat));
  let x = -ROW_MAX / 2, z = 0, rowD = 0, rowCat = null;
  const big = [];
  const place = (p, items) => {
    const sizes = items.map(o => propSize(p.type, o));
    const gapOf = q => Math.max(.7, Math.min(GAP, q[0] * .6));
    const w = sizes.reduce((s, q) => s + Math.max(q[0], .6) + gapOf(q), 0) + 1.0;
    const d = Math.max(...sizes.map(q => q[2])), h = Math.max(...sizes.map(q => q[1]));
    if (x + w > ROW_MAX / 2 || (rowCat && rowCat !== (p.scan ? 'scan' : p.cat))) { z -= rowD + MARGIN; x = -ROW_MAX / 2; rowD = 0; }
    rowCat = p.scan ? 'scan' : p.cat;
    const seg = { type: p.type, x0: x, x1: x + w, z, h, d, n: items.length };
    let cx = x + 1.0;
    items.forEach((o, i) => { const s = sizes[i], ww = Math.max(s[0], .6); GALLERY.push({ type: p.type, opts: o, x: cx + ww / 2, z, w: s[0], h: s[1], d: s[2], seg: SEGMENTS.length }); cx += ww + gapOf(s); });
    SEGMENTS.push(seg);
    x += w + GAP; rowD = Math.max(rowD, d);
  };
  for (const p of list) {
    const items = (p.variants || [null]).map(v => v ? { variant: v } : {}).concat(EXTRA[p.type] || []);
    if (HUGE.has(p.type)) { big.push([p, items]); continue; }
    place(p, items);
  }
  // huge props: one per segment in their own rows at the far end
  z -= rowD + 14; x = -ROW_MAX / 2; rowD = 0; rowCat = 'huge';
  for (const [p, items] of big) for (const o of items) {
    const s = propSize(p.type, o);
    if (x + s[0] > ROW_MAX / 2) { z -= rowD + 10; x = -ROW_MAX / 2; rowD = 0; }
    GALLERY.push({ type: p.type, opts: o, x: x + s[0] / 2, z: z - s[2] / 2 + 2, w: s[0], h: s[1], d: s[2], seg: SEGMENTS.length });
    SEGMENTS.push({ type: p.type, x0: x, x1: x + s[0], z: z - s[2] / 2 + 2, h: s[1], d: s[2], n: 1 });
    x += s[0] + 8; rowD = Math.max(rowD, s[2]);
  }
})();

const minZ = Math.min(...GALLERY.map(g => g.z - g.d / 2)) - 20, maxZ = 30;

/** a plain 1.8 m mannequin for scale (feet at y) */
function figure(B, x, y, z, ry) {
  B.push(x, y, z, ry);
  const m = { mat: 'p_fab_navy', collide: false };
  for (const s of [-1, 1]) { B.box(s * .1, 0, 0, .14, .86, .16, m); B.box(s * .25, .9, 0, .1, .62, .12, m); }
  B.box(0, .86, 0, .44, .62, .24, m); B.box(0, 1.48, 0, .12, .08, .12, { mat: 'p_plastic_beige', collide: false });
  B.cyl(0, 1.56, 0, .1, .24, { mat: 'p_plastic_beige', collide: false, sides: 10 });
  B.pop();
}

/** label atlas: every segment name on one canvas texture (white on dark plates lying on the ground in front of each type) */
function labels(B) {
  const n = SEGMENTS.length, cols = 4, rowsN = Math.ceil(n / cols), W = 2048, rh = 64, H = Math.min(4096, Math.pow(2, Math.ceil(Math.log2(rowsN * rh))));
  const dt = new BABYLON.DynamicTexture('gallery_labels', { width: W, height: H }, B.scene, true);
  const g = dt.getContext(); g.fillStyle = '#16181b'; g.fillRect(0, 0, W, H);
  g.font = 'bold 40px Arial, sans-serif'; g.textBaseline = 'middle'; g.fillStyle = '#f0ece0';
  SEGMENTS.forEach((s, i) => { const cx = (i % cols) * (W / cols), cy = Math.floor(i / cols) * rh; g.fillText(s.type + (s.n > 1 ? '  (' + s.n + ')' : ''), cx + 14, cy + rh / 2, W / cols - 24); });
  dt.update(true);
  const mat = new BABYLON.StandardMaterial('gallery_label_mat', B.scene);
  mat.diffuseTexture = dt; mat.emissiveTexture = dt; mat.disableLighting = true; mat.backFaceCulling = true;
  SEGMENTS.forEach((s, i) => {
    const u0 = (i % cols) / cols, u1 = u0 + 1 / cols, v1 = 1 - Math.floor(i / cols) * rh / H, v0 = v1 - rh / H;
    const w = Math.min(6, Math.max(2.4, s.x1 - s.x0 - .4)), h = w / (W / cols / rh), x = s.x0 + w / 2 + .2, z = s.z + s.d / 2 + 1.2 + h / 2;
    const m = new BABYLON.Mesh('lbl' + i, B.scene), vd = new BABYLON.VertexData();
    vd.positions = [x - w / 2, .02, z + h / 2, x + w / 2, .02, z + h / 2, x + w / 2, .02, z - h / 2, x - w / 2, .02, z - h / 2];
    vd.normals = [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0]; vd.uvs = [u0, v0, u1, v0, u1, v1, u0, v1]; vd.indices = [0, 1, 2, 0, 2, 3];
    vd.applyToMesh(m); m.material = mat;
    B.mesh(m, { collide: 'none', cast: false });
  });
}

export default {
  id: 'prop_gallery', name: 'Prop Gallery', desc: 'Every prop of the library in labelled rows (dev map).', size: 'L',
  env: { hdri: 'partly_cloudy', time: 'day', exposure: 1, sun: { dir: [-0.5, -1, -0.65] }, weather: 'clear', ambience: 'industrial', reverb: 'outdoor' },
  bounds: { minX: -ROW_MAX / 2 - 30, maxX: ROW_MAX / 2 + 30, minZ, maxZ, minY: -2, maxY: 40 },
  chunk: 16,
  build(B) {
    B.ground({ minX: -ROW_MAX / 2 - 30, maxX: ROW_MAX / 2 + 30, minZ, maxZ, mat: 'concrete_floor', res: 4 });
    for (const t of [0, 1, 2]) B.spawn(t, 0, 0, 20, Math.PI);
    for (const g of GALLERY) {
      const wallW = Math.max(g.w + .8, 1.6), v = g.opts.variant;
      if (CEILING.has(g.type)) {               // ceiling fixtures hang from a slab at 2.8 m
        B.box(g.x, 2.8, g.z, Math.max(g.w + .6, 1.4), .1, 1.4, { mat: 'ceiling_tile', collide: false });
        B.prop(g.type, g.x, 2.8, g.z, g.opts);
        continue;
      }
      if (WALLED.has(g.type) || (g.type === 'fire_extinguisher' && v === 'wall') || (g.type === 'atm' && v === 'wall') || (g.type === 'ac_unit' && v === 'wall')) {
        B.box(g.x, 0, g.z - .1, wallW, 2.6, .2, { mat: 'plaster', collide: false });    // a wall behind (its face at z = 0)
        const y = g.type === 'wall_clock' ? 1.9 : g.type === 'poster' || g.type === 'whiteboard' ? 1.0 : g.type === 'tv' ? 1.1 : g.type === 'ac_unit' ? 1.4 : 0;
        if (g.type === 'curtain') B.box(g.x, 1.0, g.z - .01, Math.min(g.w, 1.4), 1.2, .02, { mat: 'glass', collide: false });
        B.prop(g.type, g.x, y, g.z, g.type === 'tv' ? Object.assign({ wall: true }, g.opts) : g.opts);
        continue;
      }
      if (g.type === 'door' || g.type === 'window') {   // in a wall opening, as maps use them
        const W = g.type === 'door' ? (v === 'double' ? 1.72 : 1.02) : 1.2, H = g.type === 'door' ? 2.16 : 1.2, y0 = g.type === 'door' ? 0 : .9;
        B.wall(g.x - wallW / 2 - .4, g.z, g.x + wallW / 2 + .4, g.z, { h: 2.8, t: .2, mat: 'plaster', collide: false, openings: [{ at: wallW / 2 + .4, w: W, h: H, y: y0 }] });
        B.prop(g.type, g.x, y0, g.z, g.opts);
        continue;
      }
      B.prop(g.type, g.x, 0, g.z, g.opts);
      if (g.type === 'railcar') B.prop('track', g.x, -.0, g.z, { len: 18 });
    }
    for (const s of SEGMENTS) figure(B, s.x0 + .3, 0, s.z - Math.min(s.d / 2, 1.5), Math.PI);
    labels(B);
  },
};
