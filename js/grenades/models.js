/* LIVE FIRE — procedural grenade / throwable models (all 25 of js/grenades/data.js), built with the gun kit (js/weapons/gunkit.js) and
   the gun materials (js/weapons/models.js). Contract: docs/ARCHITECTURE.md §6.
   Exports:
     buildNade(scene, gid, { lod: 0|1|2, instance }) -> NadeModel   (template cached per scene + id + lod, then cloned / instanced)
       NadeModel = { id, nade, lod, root, meshes, parts: { pin?, ring?, spoon?, cap?, clacker?, lid? }, nodes: { grip, top, fuse?, led?,
                     flame? }, info: { tris, buildMs, cached }, dispose() }
     NADE_SHAPES                  shape id -> builder (egg can bottle stick puck sphere brick bag bundle)
     nadeTris(nm) -> triangle count;  clearNadeCache(scene)
   Nade-local axes: origin at the body centre, +Y up (fuze / cap end), +X = the spoon side, metres, real sizes from nade.model.size.
   parts.pin pivots at the pin (pull along -X); parts.ring is a child of the pin; parts.spoon pivots at the top of the fuze (flies
   off by rotating about +Z, then falls away). nodes.grip = where the throwing hand holds it (palm centre, +Y up).
   Colours come from nade.model.colors (linear 0..1 RGB) as per-grenade materials (painted metal, plastic, glass, fabric, paper). */
import { Kit, circle, rr } from '../weapons/gunkit.js';
import { MATS, kitToMeshes, cloneTemplate } from '../weapons/models.js';
import { GRENADES, getNade } from './data.js';

const D = v => v / 1000, P3 = (x, y, z) => [D(x), D(y), D(z)], TAU = Math.PI * 2, HALF = Math.PI / 2;
const LP = pts => pts.map(p => [D(p[0]), D(p[1]), (p[2] || 0) * .3]);
const hex = c => '#' + c.map(v => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0')).join('');
const SHc = (K, pts, fall = .6) => K.sh(pts.map(p => [D(p[0]), D(p[1]), p[2] ? D(p[2]) : 0, p[3]]), D(fall));

/** per-grenade materials registered into the gun material table (MATS) once: nade:<id>:<role> */
function nadeMats(n) {
  const C = (n.model && n.model.colors) || {}, pal = {};
  const def = (role, col, o) => { const id = 'nade:' + n.id + ':' + role; if (!MATS[id]) MATS[id] = { a: hex(col), ...o }; pal[role] = id; };
  const painted = { m: .25, r: .58, n: 'cast', ns: .02, nl: .25, rm: 'smudge', wear: ['#8e9092', 1, .3] };
  const plastic = { m: 0, r: .55, n: 'poly', ns: .02, nl: .3, rm: 'smudge', wear: ['#9a9a96', 0, .5] };
  const kind = n.model.shape;
  def('body', C.body || [.3, .32, .26], kind === 'puck' || kind === 'stick' || kind === 'bag' ? (kind === 'bag' ? { m: 0, r: .95, n: 'fabric', ns: .008, nl: .9 } : plastic) : kind === 'bundle' ? { m: 0, r: .8, n: 'fabric', ns: .03, nl: .2 } : painted);
  def('band', C.band || C.ring || C.tape || C.cap || [.85, .75, .2], { m: 0, r: .5 });
  def('fuze', C.fuze || [.45, .45, .42], { m: .9, r: .38, n: 'brush', ns: .02, nl: .2, wear: ['#c8c8c4', 1, .2] });
  if (C.glass) def('glass', C.glass, { m: 0, r: .04, alpha: .38 });
  if (C.liquid) def('liquid', C.liquid, { m: 0, r: .1, alpha: .75 });
  if (C.rag) def('rag', C.rag, { m: 0, r: .96, n: 'fabric', ns: .006, nl: .9 });
  if (C.pad) def('pad', C.pad, { m: 0, r: .7, n: 'stipple', ns: .006, nl: .6 });
  if (C.led) def('led', C.led, { m: 0, r: .3, e: hex(C.led), ei: 3 });
  if (C.strap) def('strap', C.strap, { m: 0, r: .95, n: 'fabric', ns: .006, nl: .9 });
  if (C.box) def('box', C.box, { m: .2, r: .55, n: 'poly', ns: .02, nl: .3 });
  if (C.det) def('det', C.det, { m: 0, r: .5, n: 'poly', ns: .02, nl: .3 });
  if (C.tape) def('tape', C.tape, { m: 0, r: .55, n: 'poly', ns: .02, nl: .25 });
  if (C.fuse) def('cord', C.fuse, { m: 0, r: .9, n: 'fabric', ns: .004, nl: 1 });
  if (C.cap) def('cap', C.cap, { m: 0, r: .5 });
  if (C.ring) def('glow', C.ring, { m: 0, r: .3, e: hex(C.ring), ei: 2 });
  return { ...pal, metal: 'dksteel', bright: 'steel', spring: 'spring', brass: 'brass', copper: 'copper', bore: 'bore', white: 'white', rubber: 'rubber', label: 'kraft' };
}

// ---- shared pieces -------------------------------------------------------------------------------------------------------
/** fuze head (M-style): body + striker housing on top at y0 (mm), pin through it, ring, spoon down the +X side to ySpoon */
function fuzeAssembly(K, { y0, r = 9.5, h = 22, R, ySpoon, spoon = true, pin = true }) {
  K.mat('fuze').lathe(LP([[0, y0 - 2], [r, y0 - 2, 1], [r, y0 + 6, 1], [r - 1.4, y0 + 7], [r - 1.4, y0 + h - 5], [r - 3, y0 + h - 3, 1], [r - 4.4, y0 + h, 1], [0, y0 + h]]), { axis: 'y', segs: 26, crease: 40 });
  if (K.detail(0)) K.mat('fuze').lathe(LP([[r + .01, y0 + 1], [r + 1, y0 + 2], [r + 1, y0 + 4], [r + .01, y0 + 5]]), { axis: 'y', segs: 26, rmod: a => 1 + .02 * (Math.cos(a * 24) > 0 ? 1 : 0) });
  const lugX = r - 2, lugY = y0 + h - 8;
  K.mat('fuze').extrude(SHc(K, [[-5, 0], [5, 0], [5, 9, 2], [-5, 9, 2]]), D(5), { plane: 'zy', p: P3(lugX + 2, lugY - 4, 0), b: D(.6), bs: 1 });
  if (spoon) {
    K.part('spoon', { pivot: P3(lugX + 4, y0 + h - 2, 0), meta: { flyR: [0, 0, -1.2] } });
    const pts = [[r - 4, y0 + h + 1.2], [lugX + 4, y0 + h + .6], [r + 3, y0 + h - 6], [R + 2, y0 - 4], [R + 2.6, Math.max(ySpoon + 14, y0 - 22)], [R + 1.6, ySpoon]];
    K.mat('fuze').sweep(pts.map(([x, y]) => P3(x, y, 0)), { rad: D(2), sx: 2.8, sy: .4, segs: 10, up: [0, 0, 1] });
    K.use('body');
  }
  if (pin) {
    K.part('pin', { pivot: P3(lugX + 2, lugY, 0), meta: { pullDir: [-1, 0, 0] } });
    K.mat('bright').cyl(D(1), D(18), { p: P3(lugX - 9, lugY, 0), axis: 'x', segs: 8 });
    K.part('ring', { pivot: P3(lugX - 22, lugY, 0), parent: 'pin' });
    const ring = []; for (let k = 0; k < 20; k++) { const a = TAU * k / 20; ring.push(P3(lugX - 22 + Math.cos(a) * 11, lugY + Math.sin(a) * 11 * .2, Math.sin(a) * 11)); }
    K.mat('bright').sweep(ring, { rad: D(1.1), segs: 8, closed: true });
    K.use('body');
  }
}
const can = (K, { r, y0, y1, mat = 'body', ch = 2 }) => K.mat(mat).lathe(LP([[0, y0], [r - ch, y0, 1], [r, y0 + ch, 1], [r, y1 - ch, 1], [r - ch, y1, 1], [0, y1]]), { axis: 'y', segs: 32, crease: 40 });
const bandAt = (K, { r, y, h, mat = 'band' }) => K.mat(mat).lathe(LP([[r + .01, y], [r + .35, y + .3], [r + .35, y + h - .3], [r + .01, y + h]]), { axis: 'y', segs: 32 });

// ---- shape builders (mm, origin at the body centre) ------------------------------------------------------------------------
export const NADE_SHAPES = {
  egg(K, n, m) {   // frag: pineapple-segmented or smooth egg body + fuze, pin, spoon
    const R = m.size[0] * 500, Hb = m.size[1] * 1000 - 24, y0 = -Hb / 2, y1 = Hb / 2, prof = [];
    for (let k = 0; k <= 16; k++) { const t = k / 16, a = -HALF + Math.PI * t, y = y0 + (Math.sin(a) + 1) / 2 * Hb; prof.push([Math.max(0, Math.cos(a) * R * (1 - .1 * t)), y]); }
    prof[prof.length - 1][0] = 8;
    const serr = n.id === 'frag' && K.detail(0);
    K.mat('body').lathe(LP(prof), { axis: 'y', segs: 40, crease: 60, rmod: serr ? (a, z) => { const v = z * 1000; return 1 - .07 * ((Math.cos(a * 8) > .78 ? 1 : 0) || (Math.sin(v / Hb * Math.PI * 7) > .86 ? 1 : 0)); } : null });
    bandAt(K, { r: R * .62, y: y1 - 12, h: 3 });
    fuzeAssembly(K, { y0: y1 - 2, R: R * .9, ySpoon: 0 });
    return { top: y1 + 22 };
  },
  can(K, n, m) {
    const R = m.size[0] * 500, H = m.size[1] * 1000 - (m.spoon ? 22 : 0), y0 = -H / 2, y1 = H / 2;
    if (m.segmented) for (let k = 0; k < 4; k++) can(K, { r: R - (k % 2 ? 1.4 : 0), y0: y0 + k * H / 4, y1: y0 + (k + 1) * H / 4 - .6, ch: 1.4 });
    else can(K, { r: R, y0, y1 });
    bandAt(K, { r: R, y: y1 - 14, h: 6 }); if (n.kind !== 'flash' && n.kind !== 'ninebang') bandAt(K, { r: R, y: y0 + 8, h: 4 });
    if (m.perforated && K.detail(1)) for (let row = 0; row < 3; row++) for (let k = 0; k < 8; k++) { const a = k * TAU / 8 + row * .39, y = y0 + 16 + row * (H - 40) / 2; K.mat('bore').disc(D(4), D(1.4), { p: P3(Math.cos(a) * (R - .5), y, Math.sin(a) * (R - .5)), r: [0, -a + HALF, 0], segs: 14 }); }
    if (m.ports && K.detail(1)) for (let k = 0; k < m.ports; k++) { const a = k * TAU / m.ports, y = (k % 3 - 1) * H * .22; K.mat('bore').disc(D(3.4), D(1.4), { p: P3(Math.cos(a) * (R - .5), y, Math.sin(a) * (R - .5)), r: [0, -a + HALF, 0], segs: 12 }); }
    if (m.topHoles && K.detail(1)) for (let k = 0; k < 4; k++) { const a = k * HALF + .4; K.mat('bore').disc(D(2.6), D(1), { p: P3(Math.cos(a) * R * .55, y1 - .3, Math.sin(a) * R * .55), r: [HALF, 0, 0], segs: 12 }); K.mat('bore').disc(D(2.6), D(1), { p: P3(Math.cos(a) * R * .55, y0 + .3, Math.sin(a) * R * .55), r: [HALF, 0, 0], segs: 12 }); }
    if (m.speaker && K.detail(1)) for (let k = 0; k < 5; k++) K.mat('bore').box(D(R * 1.1), D(1.4), D(2), { p: P3(0, -10 + k * 5, R - .4), b: 0 });
    if (m.coils) for (let k = 0; k < 3; k++) K.mat('copper').lathe(LP([[R + .01, -12 + k * 10], [R + 1.4, -11 + k * 10, 1], [R + 1.4, -7 + k * 10, 1], [R + .01, -6 + k * 10]]), { axis: 'y', segs: 32 });
    if (m.magnet) K.mat('metal').lathe(LP([[0, y0 - 6], [R - 4, y0 - 6, 1], [R - 2, y0 - 2, 1], [R - 2, y0 + 1]]), { axis: 'y', segs: 28 });
    if (m.cross) { K.mat('band').extrude(SHc(K, [[-4, -12], [4, -12], [4, -4], [12, -4], [12, 4], [4, 4], [4, 12], [-4, 12], [-4, 4], [-12, 4], [-12, -4], [-4, -4]]), D(1.2), { plane: 'xy', p: P3(0, 0, R - .2), b: D(.3), bs: 1 }); }
    if (K.detail(0) && !m.cross) K.mat('label').lathe(LP([[R + .02, -H * .2], [R + .3, -H * .2 + .3], [R + .3, H * .12 - .3], [R + .02, H * .12]]), { axis: 'y', segs: 32, a0: 2.2, a1: 3.9 });
    if (m.spoon || m.pin) fuzeAssembly(K, { y0: y1, R, ySpoon: y0 + 14, spoon: !!m.spoon, pin: !!m.pin });
    else K.mat('fuze').lathe(LP([[0, y1], [R * .5, y1, 1], [R * .5, y1 + 6, 1], [0, y1 + 7]]), { axis: 'y', segs: 24 });
    return { top: y1 + 22 };
  },
  bottle(K, n, m) {   // molotov: glass bottle, fuel inside, rag in the neck (burning end = node flame)
    const R = m.size[0] * 500, H = m.size[1] * 1000, y0 = -H / 2, ys = y0 + H * .58, yn = y0 + H * .82;
    const prof = [[0, y0], [R - 4, y0, 1], [R, y0 + 4, 1], [R, ys, 1], [R * .5, ys + 26], [12, yn - 10], [12, yn], [13.6, yn + 2, 1], [13.6, yn + 8, 1], [11.6, yn + 9]];
    K.mat('glass').lathe(LP(prof), { axis: 'y', segs: 34, crease: 40 });
    K.mat('liquid').lathe(LP([[0, y0 + 2], [R - 3, y0 + 2], [R - 2, y0 + 6], [R - 2, ys - 18], [0, ys - 18]]), { axis: 'y', segs: 28 });
    const rag = []; for (let k = 0; k <= 6; k++) { const t = k / 6; rag.push(P3(Math.sin(t * 5) * 3, yn - 12 + t * 46, Math.cos(t * 4) * 3)); }
    K.mat('rag').sweep(rag, { rads: rag.map((_, k) => D(9 - k * .8)), segs: 9 });
    K.mat('rag').sweep([P3(10, yn + 2, 0), P3(16, yn - 10, 4), P3(14, yn - 40, 10), P3(10, yn - 60, 6)], { rad: D(3.4), sx: 1.8, sy: .5, segs: 8, up: [0, 0, 1] });
    if (K.detail(0)) K.mat('cord').lathe(LP([[13.7, yn + 2], [14.4, yn + 3], [14.4, yn + 7], [13.7, yn + 8]]), { axis: 'y', segs: 26 });
    K.node('flame', P3(0, yn + 34, 0), [0, 0, 0]);
    return { top: yn + 34, grip: [0, ys - 30, 0] };
  },
  puck(K, n, m) {   // stun / sticky / sensor disc
    const R = m.size[0] * 500, H = m.size[1] * 1000, y0 = -H / 2, y1 = H / 2;
    K.mat('body').lathe(LP([[0, y0], [R - 5, y0, 1], [R, y0 + 5, 1], [R, y1 - 6, 1], [R - 7, y1, 1], [0, y1]]), { axis: 'y', segs: 40, crease: 40 });
    bandAt(K, { r: R, y: -2, h: 4, mat: m.antenna ? 'glow' : 'band' });
    if (m.prongs) for (let k = 0; k < 6; k++) { const a = k * TAU / 6; K.mat('bright').cyl(D(1.4), D(9), { p: P3(Math.cos(a) * (R - 4), y1 - 1, Math.sin(a) * (R - 4)), axis: 'y', segs: 8 }); K.mat('band').sphere(D(2.4), { p: P3(Math.cos(a) * (R - 4), y1 + 8, Math.sin(a) * (R - 4)), segs: 10 }); }
    if (n.sticky || m.colors && m.colors.pad) K.mat('pad').lathe(LP([[0, y0 - 3], [R - 8, y0 - 3, 1], [R - 6, y0 - 1], [R - 6, y0 + .5]]), { axis: 'y', segs: 32 });
    if (m.colors && m.colors.led) { K.mat('led').sphere(D(2.6), { p: P3(0, y1 + .4, R * .4), segs: 12 }); K.node('led', P3(0, y1 + 2, R * .4), [0, 0, 0]); }
    if (m.antenna) { K.mat('metal').cyl(D(1.2), D(70), { p: P3(R * .45, y1, -R * .3), axis: 'y', segs: 8 }); K.mat('rubber').sphere(D(2.4), { p: P3(R * .45, y1 + 70, -R * .3), segs: 10 }); }
    if (K.detail(0)) for (let k = 0; k < 3; k++) K.screw({ p: P3(Math.cos(k * 2.1) * R * .6, y1, Math.sin(k * 2.1) * R * .6), axis: 'y', d: D(4), h: D(.8), type: 'cross', mat: 'metal' });
    if (!n.sticky && n.kind === 'stun') { K.part('pin', { pivot: P3(R, 0, 0), meta: { pullDir: [1, 0, 0] } }); const ring = []; for (let k = 0; k < 18; k++) { const a = TAU * k / 18; ring.push(P3(R + 13 + Math.cos(a) * 10, Math.sin(a) * 2, Math.sin(a) * 10)); } K.mat('bright').sweep(ring, { rad: D(1.1), segs: 8, closed: true }); K.part('ring', { pivot: P3(R + 13, 0, 0), parent: 'pin' }); K.use('body'); }
    return { top: y1 };
  },
  sphere(K, n, m) {   // impact (nose fuze) / mini frag (pin + ring)
    const R = m.size[0] * 500, prof = [];
    for (let k = 0; k <= 14; k++) { const a = -HALF + Math.PI * k / 14; prof.push([Math.cos(a) * R, Math.sin(a) * R]); }
    K.mat('body').lathe(LP(prof), { axis: 'y', segs: 36, crease: 60 });
    bandAt(K, { r: R - .05, y: -2, h: 4 });
    if (m.noseFuze) { K.mat('fuze').lathe(LP([[0, R - 4], [9, R - 4, 1], [9, R + 6, 1], [6, R + 12, 1], [2, R + 14], [0, R + 14]]), { axis: 'y', segs: 24 }); K.part('cap', { pivot: P3(0, R + 14, 0), meta: { safety: true } }); K.mat('band').lathe(LP([[0, R + 10], [7, R + 10, 1], [7, R + 18, 1], [0, R + 18]]), { axis: 'y', segs: 20 }); K.use('body'); }
    else fuzeAssembly(K, { y0: R - 3, r: 7, h: 14, R: R * .9, ySpoon: 0, spoon: false, pin: true });
    return { top: R + 14 };
  },
  stick(K, n, m) {   // road flare: tube + striker cap
    const R = m.size[0] * 500, H = m.size[1] * 1000;
    can(K, { r: R, y0: -H / 2, y1: H / 2 - 30, ch: 1 });
    K.part('cap', { pivot: P3(0, H / 2 - 30, 0), meta: { strike: true } });
    K.mat('cap').lathe(LP([[0, H / 2 - 34], [R + 1, H / 2 - 34, 1], [R + 1, H / 2, 1], [0, H / 2]]), { axis: 'y', segs: 26 });
    K.use('body');
    if (K.detail(0)) K.mat('label').lathe(LP([[R + .01, -30], [R + .3, -29.6], [R + .3, 20], [R + .01, 20.3]]), { axis: 'y', segs: 26, a0: .3, a1: 2.6 });
    K.mat('cord').lathe(LP([[0, H / 2 - 30], [R * .6, H / 2 - 30], [R * .6, H / 2 - 28], [0, H / 2 - 27]]), { axis: 'y', segs: 18 });
    K.node('flame', P3(0, H / 2 - 28, 0), [0, 0, 0]);
    return { top: H / 2 };
  },
  brick(K, n, m) {   // frame charge: hollow frame of explosive, tape bands, detonator box with a wire + LED
    const [w, h, d] = m.size.map(v => v * 1000);
    const out = rr(D(w), D(d), D(6), 0, 0, K.arcN), hole = rr(D(w - 70), D(d - 70), D(4), 0, 0, K.arcN);
    K.mat('body').extrude(out, D(h), { plane: 'xz', off: -D(h / 2), b: D(3), bs: 2, holes: m.frame ? [hole] : [] });
    if (K.detail(1)) for (const x of [-w * .32, w * .32]) K.mat('tape').extrude(rr(D(18), D(d + 2), D(2), D(x), 0, K.arcN), D(h + 1.6), { plane: 'xz', off: -D(h / 2 + .8), b: D(.6), bs: 1, holes: m.frame ? [rr(D(20), D(d - 68), D(1), D(x), 0, 1)] : [] });
    K.mat('det').box(D(44), D(18), D(30), { p: P3(0, h / 2 + 9, d / 2 - 22), b: D(3) });
    K.mat('pad').extrude(rr(D(w - 6), D(d - 6), D(5), 0, 0, K.arcN), D(2), { plane: 'xz', off: -D(h / 2 + 2), b: D(.6), bs: 1, holes: m.frame ? [rr(D(w - 64), D(d - 64), D(4), 0, 0, K.arcN)] : [] });
    K.mat('led').sphere(D(2.4), { p: P3(14, h / 2 + 18.4, d / 2 - 14), segs: 10 }); K.node('led', P3(14, h / 2 + 20, d / 2 - 14), [0, 0, 0]);
    K.mat('cord').sweep([P3(-18, h / 2 + 10, d / 2 - 8), P3(-40, h / 2 + 14, d / 2 + 10), P3(-70, h / 2 + 4, d / 2 + 4)], { rad: D(1.6), segs: 8 });
    return { top: h / 2 + 18, grip: [0, 0, 0] };
  },
  bag(K, n, m) {   // satchel: canvas bag with a flap, strap, radio box with LED, and the clacker (part)
    const [w, h, d] = m.size.map(v => v * 1000);
    K.mat('body').box(D(w), D(h), D(d), { p: [0, 0, 0], b: D(14), bs: 3 });
    K.mat('body').extrude(SHc(K, [[-d / 2 - 1, h / 2 - 2], [d / 2 + 1, h / 2 - 2], [d / 2 + 2, -h * .1, 6], [-d / 2 - 1, -h * .1, 6]], 1), D(w - 6), { plane: 'zy', b: D(4), bs: 2, p: P3(0, 2, 0), s: [1, 1, 1] });
    if (K.detail(0)) for (const x of [-w * .3, w * .3]) K.mat('strap').box(D(22), D(4), D(d + 4), { p: P3(x, -h * .1 - 2, 0), b: D(1) });
    const st = []; for (let k = 0; k <= 10; k++) { const a = Math.PI * k / 10; st.push(P3(-w / 2 + 6 + (w - 12) * k / 10, h / 2 + Math.sin(a) * 90, 0)); }
    K.mat('strap').sweep(st, { rad: D(4), sx: 3, sy: .5, segs: 8, up: [0, 0, 1] });
    K.mat('box').box(D(50), D(26), D(20), { p: P3(w * .2, h / 2 + 8, d * .1), b: D(3) }); K.mat('led').sphere(D(2.4), { p: P3(w * .2 + 14, h / 2 + 21.6, d * .1), segs: 10 }); K.node('led', P3(w * .2 + 14, h / 2 + 23, d * .1), [0, 0, 0]);
    if (K.detail(0)) K.mat('metal').cyl(D(1.4), D(60), { p: P3(w * .2 - 18, h / 2 + 20, d * .1), axis: 'y', segs: 8 });
    // firing wire from the radio box down the bag side to the clacker
    const wire = [[w * .2 - 25, h / 2 + 4, d * .1], [-w / 2 + 4, h / 2 + 2, d * .45], [-w / 2 - 4, h * .1, d * .62], [-w / 2 + 2, -h / 2 - 6, d * .8], [-w * .34, -h / 2 - 26, d * .98], [-w * .3, -h / 2 - 37, d]];
    K.mat('rubber').sweep(wire.map(q => P3(...q)), { rad: D(1.5), segs: 8 });
    K.part('clacker', { pivot: P3(-w * .3, -h / 2 - 50, d), meta: { detonator: true } });
    K.mat('det').extrude(SHc(K, [[-40, -12, 6], [40, -12, 6], [40, 12, 6], [-40, 12, 6]], .8), D(26), { plane: 'zy', p: P3(-w * .3, -h / 2 - 50, d), r: [0, HALF, 0], b: D(4), bs: 2 });
    K.mat('metal').extrude(SHc(K, [[-34, 0], [30, 0], [30, 8, 3], [-34, 6, 3]], .5), D(20), { plane: 'zy', p: P3(-w * .3, -h / 2 - 38, d), r: [0, HALF, -.15], b: D(1.4), bs: 2 });
    K.use('body');
    return { top: h / 2 + 90, grip: [0, h / 2 + 80, 0] };
  },
  bundle(K, n, m) {   // dynamite: sticks in paper, taped, fuse cord + blasting cap
    const R = m.size[0] * 500 * .5, H = m.size[1] * 1000, cnt = m.sticks || 3, pos = [];
    for (let k = 0; k < cnt; k++) { const a = k * TAU / cnt + .5; pos.push([Math.cos(a) * R * 1.12, Math.sin(a) * R * 1.12]); }
    for (const [x, z] of pos) { K.mat('body').lathe(LP([[0, -H / 2], [R - 2, -H / 2, 1], [R, -H / 2 + 2], [R, H / 2 - 2], [R - 2, H / 2, 1], [0, H / 2]]), { axis: 'y', p: P3(x, 0, z), segs: 24, crease: 40 }); if (K.detail(0)) K.mat('bore').lathe(LP([[0, H / 2 + .1], [R - 3.4, H / 2 + .1], [R - 3, H / 2 - .4]]), { axis: 'y', p: P3(x, 0, z), segs: 18 }); }
    for (const y of [-H * .28, H * .26]) K.mat('tape').lathe(LP([[R * 2.2, y - 9], [R * 2.25, y - 8, 1], [R * 2.25, y + 8, 1], [R * 2.2, y + 9]]), { axis: 'y', segs: 30, rmod: (a) => { let best = 0; for (const [x, z] of pos) best = Math.max(best, (Math.cos(a) * x + Math.sin(a) * z) / (R * 1.12)); return .62 + .38 * Math.max(0, best); } });
    const [fx, fz] = pos[0]; K.mat('copper').cyl(D(3.6), D(22), { p: P3(fx, H / 2 - 12, fz), axis: 'y', segs: 12 });
    const fuse = []; for (let k = 0; k <= 8; k++) { const t = k / 8; fuse.push(P3(fx + Math.sin(t * 3) * 14, H / 2 + 10 + t * 70, fz + Math.cos(t * 2) * 8 - 8)); }
    K.mat('cord').sweep(fuse, { rad: D(2.2), segs: 8 });
    K.node('fuse', fuse[fuse.length - 1].map(v => v), [0, 0, 0]);
    return { top: H / 2 + 80 };
  },
};

const CACHE = new WeakMap();
const cacheOf = scene => { let c = CACHE.get(scene); if (!c) { c = { tpl: new Map(), root: null }; CACHE.set(scene, c); scene.onDisposeObservable.addOnce(() => CACHE.delete(scene)); } return c; };
/** Build (or clone from the per-scene cache) grenade gid. opts: { lod 0|1|2, instance } */
export function buildNade(scene, gid, opts = {}) {
  const n = getNade(gid); if (!n) throw new Error('buildNade: unknown grenade ' + gid);
  const lod = Math.max(0, Math.min(2, opts.lod | 0)), c = cacheOf(scene), key = n.id + '|' + lod, t0 = performance.now();
  let tpl = c.tpl.get(key), hit = !!tpl;
  if (!tpl) {
    const K = new Kit({ lod, seed: 7 + n.id.length, wear: 1.2 }), m = n.model, fn = NADE_SHAPES[m.shape] || NADE_SHAPES.can;
    const r = fn(K, n, m) || {};
    K.node('grip', P3(...(r.grip || [0, 0, 0])), [0, 0, 0]); K.node('top', P3(0, r.top || 40, 0), [0, 0, 0]);
    const built = K.build(), pal = nadeMats(n);
    if (!c.root) { c.root = new BABYLON.TransformNode('nade_templates', scene); c.root.setEnabled(false); }
    const res = kitToMeshes(scene, built, pal, { name: 'nade_' + n.id, parent: c.root });
    tpl = { res, tris: built.stats.tris, ms: performance.now() - t0 }; c.tpl.set(key, tpl);
  }
  const root = cloneTemplate(tpl.res.root, !!opts.instance); root.name = 'nade_' + n.id; root.metadata = { gk: 'root', nade: n.id };
  const parts = {}, nodes = {}, meshes = [];
  for (const d of root.getDescendants(false)) { const g = d.metadata && d.metadata.gk; if (!g) continue; if (g === 'mesh') meshes.push(d); else if (g.startsWith('part:')) parts[g.slice(5)] = d; else if (g.startsWith('node:')) nodes[g.slice(5)] = d; }
  return { id: n.id, nade: n, lod, root, meshes, parts, nodes, info: { tris: tpl.tris, buildMs: hit ? 0 : tpl.ms, cached: hit }, dispose() { root.dispose(false, false); } };
}
export const nadeTris = nm => nm.meshes.reduce((t, m) => t + (m.getTotalIndices ? m.getTotalIndices() / 3 : 0), 0);
export function clearNadeCache(scene) { const c = CACHE.get(scene); if (!c) return; for (const t of c.tpl.values()) t.res.root.dispose(false, false); c.tpl.clear(); }
export const NADE_IDS = GRENADES.map(g => g.id);
