/* LIVE FIRE — vehicles (catalogue for js/maps/props.js): cars (6 body styles + police-style / taxi-style generics, wrecked and
   burnt states), bus, box truck, tractor unit, semi trailer, railcars + track, small boat, twin-engine airliner.
   Exports: default [prop definitions]. Local space: origin = ground centre, nose / front = +z. */
import { wheel, panelLines, pickPaint, ladder, bolts, handle, railing } from './parts.js';
import { vnoise3 } from './kit.js';

const PI = Math.PI;
const PAINT = c => 'p_car_' + c;

// ------------------------------------------------------------------------------------------------ cars
// u = 0 at the nose, 1 at the tail. hood / deck = [u, top height] tables; cabin: uA windscreen base, uB roof front, uR roof rear,
// uC rear window base; roof height; wheels (u); r tyre radius; sill = bottom of the body between the wheels.
const CARS = {
  sedan:  { L: 4.75, W: 1.82, roof: 1.44, r: .33, sill: .3, wf: .19, wr: .785, uA: .3, uB: .46, uR: .66, uC: .8, bp: .55, glassEnd: 1,
            hood: [[0, .64], [.03, .76], [.12, .84], [.3, .91]], deck: [[.8, .99], [.96, .97], [1, .84]], belt: [.92, 1.0], nose: .34, tail: .4 },
  hatch:  { L: 4.1, W: 1.78, roof: 1.48, r: .31, sill: .3, wf: .17, wr: .8, uA: .29, uB: .44, uR: .86, uC: .97, bp: .56, glassEnd: 1,
            hood: [[0, .62], [.03, .74], [.12, .82], [.29, .9]], deck: [[.97, 1.0], [1, .82]], belt: [.93, 1.0], nose: .34, tail: .4 },
  suv:    { L: 4.75, W: 1.9, roof: 1.76, r: .37, sill: .44, wf: .18, wr: .8, uA: .29, uB: .42, uR: .9, uC: .985, bp: .55, glassEnd: 1,
            hood: [[0, .78], [.03, .92], [.12, 1.0], [.29, 1.07]], deck: [[.985, 1.12], [1, .95]], belt: [1.08, 1.15], nose: .45, tail: .5 },
  pickup: { L: 5.35, W: 1.95, roof: 1.86, r: .39, sill: .48, wf: .16, wr: .77, uA: .27, uB: .38, uR: .5, uC: .53, bp: .44, glassEnd: .53, cabEnd: .54,
            hood: [[0, .85], [.03, 1.0], [.12, 1.07], [.27, 1.12]], deck: [[.53, 1.15], [.54, 1.1]], belt: [1.13, 1.15], nose: .5, tail: .55 },
  van:    { L: 5.25, W: 2.0, roof: 2.35, r: .35, sill: .4, wf: .14, wr: .76, uA: .12, uB: .25, uR: .985, uC: .995, bp: .4, glassEnd: .36,
            hood: [[0, .7], [.03, .86], [.12, 1.08]], deck: [[.995, 2.3], [1, 2.25]], belt: [1.12, 1.12], nose: .42, tail: .45 },
};
CARS.police = Object.assign({}, CARS.sedan); CARS.taxi = Object.assign({}, CARS.sedan);
const interp = (tab, u) => { if (u <= tab[0][0]) return tab[0][1]; for (let i = 1; i < tab.length; i++) if (u <= tab[i][0]) { const [a, b] = [tab[i - 1], tab[i]]; return a[1] + (b[1] - a[1]) * (u - a[0]) / (b[0] - a[0]); } return tab[tab.length - 1][1]; };

function carBody(K, P, paint, o, rnd) {
  const { L, W, r } = P, hl = L / 2, uz = u => hl - u * L, zu = z => (hl - z) / L;
  const wreck = o.state === 'wreck', burnt = o.state === 'burnt';
  const zf = uz(P.wf), zr = uz(P.wr), ra = r + .06, yw = r;
  // stations: key u values + dense samples round the wheel arches (never inside the glass transitions)
  const us = new Set([0, .015, .04, .08, .14, P.uA, P.uB, (P.uB + P.uR) / 2, P.bp - .012, P.bp + .012, P.uR, P.uC, .985, 1]);
  for (const t of [.24, .5, .7, .9]) us.add(t);
  for (const wu of [P.wf, P.wr]) for (let k = -4; k <= 4; k++) us.add(wu + k * (ra / L) / 4.2);
  if (P.cabEnd) for (const t of Array.from(us)) if (t > P.cabEnd + 1e-6) us.delete(t);
  if (P.cabEnd) us.add(P.cabEnd);
  let list = Array.from(us).filter(u => u >= 0 && u <= (P.cabEnd || 1)).sort((a, b) => a - b);
  list = list.filter(u => !((u > P.uA + 1e-6 && u < P.uB - 1e-6) || (u > P.uR + 1e-6 && u < P.uC - 1e-6)));
  const isCab = u => u >= P.uB - 1e-6 && u <= P.uR + 1e-6;
  const secs = [];
  for (const u of list) {
    const z = uz(u);
    // plan-view rounding at the ends
    const e = Math.min(u, (P.cabEnd || 1) - u), hw = W / 2 * (P.cabEnd && u > P.cabEnd - .03 ? 1 : (.84 + .16 * Math.min(1, e / .07)) ** .5);
    let yb = P.sill;
    for (const zw of [zf, zr]) { const d = Math.abs(z - zw); if (d < ra) yb = Math.max(yb, yw + Math.sqrt(ra * ra - d * d) * .97); }
    if (u < .03) yb = Math.max(yb, P.nose); if (u > .97 && !P.cabEnd) yb = Math.max(yb, P.tail);
    const cab = isCab(u);
    const belt = cab ? interp([[P.uB, P.belt[0]], [P.uR, P.belt[1]]], u) : u <= P.uA ? interp(P.hood, u) : interp(P.deck, u);
    const top = cab ? P.roof : belt;
    const pts = [];
    const sb = Math.min(yb + .2, belt - .12);
    const half = [[0, yb], [hw - .13, yb], [hw - .03, yb + .06], [hw, sb], [hw, belt - .1], [hw - .03, belt]];
    if (cab) { const t = (P.van ? .07 : .2); half.push([hw - .07, belt + .02], [hw - t, top - .07], [hw - t - .12, top - .005], [0, top + .02]); }
    else half.push([hw - .1, top + .005], [hw - .26, top + .015], [hw * .45, top + .025], [0, top + .03]);
    for (const p of half) pts.push(p);
    for (let i = half.length - 2; i >= 1; i--) pts.push([-half[i][0], half[i][1]]);
    if (wreck) for (const p of pts) { const n = vnoise3(p[0] * 3 + 7, p[1] * 3, z * 3) - .5; p[0] -= Math.sign(p[0]) * Math.max(0, n) * .07; p[1] -= Math.max(0, n) * .04 * (p[1] > 1 ? 1 : 0); }
    secs.push({ z, pts, u, cab });
  }
  secs.reverse();   // loft wants increasing z: tail first
  const N = secs[0].pts.length, half = 9;     // quads 0..8 = right side from the bottom centre over the top
  const glass = burnt ? null : wreck ? 'p_glass_dark' : 'p_glass_tint';
  const body = burnt ? 'p_burnt' : paint, rust = burnt ? 'p_burnt' : 'metal_rust';
  const qOf = j => j < half ? j : N - 1 - j;
  const quadMat = (i, j) => {
    const a = secs[i], b = secs[i + 1], q = qOf(j), um = (a.u + b.u) / 2;
    const windscreen = (Math.abs(a.u - P.uA) < 1e-6 && Math.abs(b.u - P.uB) < 1e-6) || (Math.abs(b.u - P.uA) < 1e-6 && Math.abs(a.u - P.uB) < 1e-6);
    const rearwin = (Math.abs(a.u - P.uR) < 1e-6 && Math.abs(b.u - P.uC) < 1e-6) || (Math.abs(b.u - P.uR) < 1e-6 && Math.abs(a.u - P.uC) < 1e-6);
    let m = body;
    if (q <= 1) m = 'steel_dark';                                              // underbody
    else if (q === 2) m = P.trim || body;
    if (windscreen && q >= 7) m = glass;
    if (rearwin && q >= 7 && P.uC <= (P.glassEnd || 1) + 1e-6 && !P.van) m = glass;
    if (a.cab && b.cab && q === 6 && um < (P.glassEnd || 1) && Math.abs(um - P.bp) > .02) m = glass;
    if (P.livery && q >= 3 && q <= 5 && um > P.uA && um < P.uC) m = P.livery;
    if (wreck && m === body && vnoise3(i * .7, j * .9, 3) > .62) m = rust;
    if (m === null) return burnt && q >= 6 ? null : body;
    return m;
  };
  K.loft(body, secs, { mat: quadMat, caps: true, capMat: body });
  return { secs, zf, zr, hl };
}
function car(K, o, v, rnd) {
  const kind = CARS[v] ? v : 'sedan', P = Object.assign({}, CARS[kind]);
  const burnt = o.state === 'burnt', wreck = o.state === 'wreck';
  let col = o.color || (v === 'police' ? 'navy' : v === 'taxi' ? 'yellow' : pickPaint(rnd));
  const paint = PAINT(col);
  if (v === 'police') P.livery = 'paint_white';
  if (v === 'van') P.van = true;
  const { L, W, r } = P, hl = L / 2, uz = u => hl - u * L;
  const tilt = burnt ? .025 : wreck ? (rnd() - .5) * .06 : 0, drop = burnt ? .12 : 0;
  K.push(0, -drop, 0, 0, tilt * .5, tilt);
  const { zf, zr } = carBody(K, P, paint, o, rnd);
  const tr = W / 2 - .02 - r * .3, cabEnd = P.cabEnd ? uz(P.cabEnd) : -hl;
  // interior (seen through the glass): seats, dash, steering wheel; burnt / wrecked shells are dark inside
  const yIn = P.sill + .1, zA = uz(P.uA), zC = uz(Math.min(P.uC, P.glassEnd || 1));
  const inner = burnt ? 'p_burnt' : 'p_fab_charcoal';
  K.box(burnt ? 'p_burnt' : 'p_plastic_dark', 0, yIn, (zA + zC) / 2, W - .2, .25, Math.abs(zA - zC) - .1);
  K.box(burnt ? 'p_burnt' : 'p_plastic_dark', 0, P.belt[0] - .2, zA - .25, W - .2, .2, .35, { bev: .04 });
  for (const s of [-1, 1]) { K.box(inner, s * .4, yIn + .25, zA - .95, .5, .15, .5, { bev: .04 }); K.box(inner, s * .4, yIn + .3, zA - 1.2, .48, .62, .14, { bev: .04, rx: -.2 }); }
  if (P.uR - P.uB > .15 && !P.van) K.box(inner, 0, yIn + .25, zA - 1.95, W - .4, .55, .5, { bev: .05 });
  if (!burnt) K.ring('p_plastic_dark', -.36, P.belt[0] + .05, zA - .55, .18, .015, { rx: PI / 2 - .4, seg: 12 });
  if (burnt) K.box('steel_dark', 0, P.belt[0] - .05, (zA + zC) / 2, W - .55, P.roof - P.belt[0] - .12, Math.abs(zA - zC) - .1);
  // bumpers, grille, lights, plates, mirrors, handles, seams
  const yFront = P.nose, front = hl, rear = P.cabEnd ? cabEnd : -hl, trim = burnt ? 'p_burnt' : (kind === 'suv' || kind === 'pickup' || kind === 'van') ? 'p_plastic_dark' : paint;
  K.box(trim, 0, yFront - .04, front - .09, W - .14, .2, .16, { bev: .05 });
  if (!P.cabEnd) K.box(trim, 0, P.tail - .06, rear + .09, W - .14, .2, .16, { bev: .05 });
  const lit = o.lights && !burnt && !wreck;
  const hy = interp(P.hood, .02) - .09, hx = W / 2 - .3;
  for (const s of [-1, 1]) {
    K.box(burnt ? 'p_burnt' : lit ? 'p_em_head' : 'p_lens_clear', s * hx, hy, front - .07, .32, .1, .08, { bev: .02 });
    if (!burnt) K.box('p_lens_amber', s * (hx + .19), hy + .01, front - .1, .06, .06, .06, { bev: .01 });
    if (!P.cabEnd) K.box(burnt ? 'p_burnt' : lit ? 'emissive_red' : 'p_lens_red', s * (W / 2 - .2), interp(P.deck, .985) - .14, rear + .03, .34, .12, .07, { bev: .02 });
  }
  if (!burnt) {
    K.decal('car_grille', 0, hy - .02, front + .005, kind === 'suv' || kind === 'pickup' ? .9 : .62, .16);
    K.decal('plate_' + Math.floor(rnd() * 4), 0, yFront + .06, front + .015, .5, .12);
    if (!P.cabEnd) K.decal('plate_' + Math.floor(rnd() * 4), 0, P.tail + .1, rear - .005, .5, .12, { face: 's' });
  }
  const yb = P.belt[0];
  for (const s of [-1, 1]) {
    K.box(trim === paint ? paint : 'p_plastic_dark', s * (W / 2 + .07), yb + .02, zA - .12, .13, .1, .17, { bev: .03 });
    K.box('p_plastic_dark', s * (W / 2 + .01), yb + .05, zA - .14, .05, .03, .06);
    for (const du of [P.uA + .1, P.bp + .1]) if (du < (P.glassEnd || 1)) K.box(burnt ? 'p_burnt' : 'p_chrome', s * (W / 2 + .004), yb - .12, uz(du), .02, .03, .13, { bev: .006 });
    K.push(s * (W / 2 + .0015), 0, 0, s * PI / 2);
    panelLines(K, [[-uz(P.uA - .015), P.sill + .15, -uz(P.uA - .015), yb - .02], [-uz(P.bp), P.sill + .12, -uz(P.bp), yb - .02]].concat(P.uR - P.uB > .15 && !P.van ? [[-uz(P.uC - .02), P.sill + .15, -uz(P.uC - .02), yb - .02]] : []).map(q => [s * q[0], q[1], s * q[2], q[3]]), 0, { t: .005 });
    K.pop();
  }
  // wheels (a wreck loses one, a burnt car keeps bare rims)
  const ws = [[1, zf], [-1, zf], [1, zr], [-1, zr]];
  ws.forEach(([s, z], i) => {
    if (wreck && i === 2) { K.box('steel_dark', s * tr, .0, z, .25, .2, .25); return; }
    wheel(K, s * tr, r - (burnt ? .04 : 0), z, r, { side: s, w: r * .65, none: burnt, flat: wreck && i === 1 ? 1 : 0, rimMat: burnt ? 'p_burnt' : kind === 'van' || kind === 'pickup' ? 'p_paint_grey' : 'p_alu', spokes: kind === 'van' ? 0 : 5 });
  });
  // style-specific parts
  if (kind === 'pickup') {
    const z0 = cabEnd - .04, z1 = -hl + .02, bed = burnt ? 'p_burnt' : paint, yB = .86, yT = 1.15, ra = r + .08;
    for (const [a, b] of [[z0, zr + ra], [zr - ra, z1]]) K.box(bed, 0, P.sill, (a + b) / 2, W - .02, yB - P.sill, a - b, { bev: .03 });
    K.box(burnt ? 'p_burnt' : 'p_plastic_dark', 0, yB, (z0 + z1) / 2, W - .2, .02, z0 - z1 - .1);
    for (const s of [-1, 1]) { K.box(bed, s * (W / 2 - .05), yB, (z0 + z1) / 2, .1, yT - yB, z0 - z1, { bev: .03 }); }
    K.box(bed, 0, yB, z0 - .05, W - .1, yT - yB, .1, { bev: .02 }); K.box(bed, 0, yB - .02, z1 + .05, W - .1, yT - yB + .02, .1, { bev: .02 });
    for (const s of [-1, 1]) K.box(burnt ? 'p_burnt' : lit ? 'emissive_red' : 'p_lens_red', s * (W / 2 - .06), yT - .3, z1 - .005, .1, .25, .04);
    K.box('p_plastic_dark', 0, P.tail - .05, z1 - .06, W - .1, .15, .12, { bev: .03 });
    if (!burnt) K.decal('plate_' + Math.floor(rnd() * 4), 0, yB + .08, z1 - .005, .5, .12, { face: 's' });
    K.col(0, .2, (z0 + z1) / 2, W, yB - .2, z0 - z1, { surf: 'sheetmetal', walk: true });
    for (const s of [-1, 1]) K.col(s * (W / 2 - .05), yB, (z0 + z1) / 2, .1, yT - yB, z0 - z1, { surf: 'sheetmetal' });
    K.col(0, yB, z1 + .05, W, yT - yB, .1, { surf: 'sheetmetal' });
  }
  if (kind === 'suv' && !burnt) for (const s of [-1, 1]) { K.box('p_plastic_dark', s * (W / 2 - .2), P.roof, (uz(P.uB) + uz(P.uR)) / 2, .04, .04, uz(P.uB) - uz(P.uR) - .2); }
  if (kind === 'van') {
    if (!burnt) { K.decal(rnd() < .5 ? 'truck_logo' : 'graffiti_1', W / 2 + .004, 1.45, uz(.65), 1.6, .6, { face: 'e' }); K.decal('truck_logo', -W / 2 - .004, 1.45, uz(.65), 1.6, .6, { face: 'w' }); }
    K.push(0, 0, -hl - .002, PI); panelLines(K, [[0, .55, 0, 2.15]], 0); K.pop();
    for (const s of [-1, 1]) K.box(burnt ? 'p_burnt' : lit ? 'emissive_red' : 'p_lens_red', s * (W / 2 - .08), 1.0, -hl + .02, .1, .35, .04);
    K.box('p_plastic_dark', 0, .32, -hl + .05, W - .1, .16, .14, { bev: .03 });
    K.push(-W / 2 - .0015, 0, 0, -PI / 2); panelLines(K, [[uz(.48) * -1, .55, uz(.48) * -1, 2.0], [uz(.85) * -1, .55, uz(.85) * -1, 2.0]], 0); K.pop();
  }
  if (v === 'police' && !burnt) {
    K.box('p_plastic_dark', 0, P.roof + .01, uz(.53), 1.2, .05, .3, { bev: .01 });
    K.box(lit ? 'p_em_blue' : 'p_lens_clear', -.3, P.roof + .06, uz(.53), .58, .1, .26, { bev: .03 }); K.box(lit ? 'emissive_red' : 'p_lens_red', .3, P.roof + .06, uz(.53), .58, .1, .26, { bev: .03 });
    for (const s of [-1, 1]) K.decal('patrol', s * (W / 2 + .004), P.belt[0] - .32, uz(.5), 1.4, .26, { face: s > 0 ? 'e' : 'w' });
    K.tube('p_plastic_dark', [[-.55, .3, hl + .02], [-.5, .75, hl + .14], [.5, .75, hl + .14], [.55, .3, hl + .02]], .03, { seg: 6 });
    K.box('p_plastic_dark', 0, .42, hl + .1, 1.0, .25, .05);
    K.cyl('p_chrome', -W / 2 - .05, yb + .02, zA - .05, .07, .05, { seg: 8 });
  }
  if (v === 'taxi' && !burnt) {
    K.box('paint_white', 0, P.roof + .02, uz(.55), .7, .2, .2, { bev: .04 });
    K.decal('taxi_sign', 0, P.roof + .12, uz(.55) + .102, .6, .16, { glow: !!o.lights }); K.decal('taxi_sign', 0, P.roof + .12, uz(.55) - .102, .6, .16, { face: 's', glow: !!o.lights });
    for (const s of [-1, 1]) K.decal('taxi_sign', s * (W / 2 + .004), P.belt[0] - .3, uz(.45), .5, .14, { face: s > 0 ? 'e' : 'w' });
  }
  K.pop();
  // colliders: lower body + cabin
  const zT = P.cabEnd ? cabEnd : -hl;
  K.col(0, .12, (hl + zT) / 2, W, P.belt[0] - .12 - drop, hl - zT, { surf: 'sheetmetal' });
  K.col(0, P.belt[0] - drop, (uz(P.uA) + uz(Math.min(P.uC, P.cabEnd || 1))) / 2, W - .25, P.roof - P.belt[0], uz(P.uA) - uz(Math.min(P.uC, P.cabEnd || 1)), { surf: 'sheetmetal' });
  K.hide(W / 2 + .7, 0, -hl * .3, 'car', .7);
}

// ------------------------------------------------------------------------------------------------ bus, trucks, trailers
function bus(K, o, v, rnd) {
  const L = 12, W = 2.55, H = 3.05, paint = o.color ? PAINT(o.color) : v === 'school' ? 'p_car_yellow' : 'p_car_white', burnt = o.state === 'burnt', body = burnt ? 'p_burnt' : paint;
  const hl = L / 2, zf = hl - 2.6, zr = -hl + 3.3, r = .5, y0 = .32;
  // lower body (skirts with wheel arches), window band, roof, front + rear faces
  const segs = [[-hl, zr - .65], [zr + .65, zf - .65], [zf + .65, hl]];
  for (const s of [-1, 1]) {
    for (const [a, b] of segs) K.box(body, s * (W / 2 - .04), y0, (a + b) / 2, .08, 1.1 - y0, b - a);
    for (const zc of [zf, zr]) { K.box(body, s * (W / 2 - .04), 1.05, zc, .08, .1, 1.3); K.box('p_plastic_dark', s * (W / 2 - .3), r + .35, zc, .5, .05, 1.25); }
  }
  K.box(body, 0, y0 + .02, 0, W - .1, .9, L - .2);
  K.box(body, 0, 1.1, 0, W, .14, L, { bev: .02 });
  K.box(body, 0, 2.45, 0, W, H - 2.45, L, { bev: .12 });
  // windows + pillars (doors on the right = +x side)
  const glass = burnt ? 'p_burnt' : 'p_glass_tint';
  for (const s of [-1, 1]) {
    K.box(glass, s * (W / 2 - .02), 1.24, 0, .03, 1.2, L - .5);
    for (let z = -hl + .4; z <= hl - .3; z += 1.32) K.box(body, s * (W / 2 - .005), 1.24, z, .05, 1.2, .1);
    if (!burnt && s < 0) K.decal('bus_ad', -W / 2 - .03, 1.75, -.8, 3.2, 1.0, { face: 'w' });
  }
  for (const dz of [hl - .9, -.6]) { K.box(burnt ? 'p_burnt' : 'p_glass_tint', W / 2 + .01, .4, dz, .04, 2.0, 1.15); K.box('p_alu', W / 2 + .03, .4, dz, .02, 2.0, .04); for (const e of [-.58, .58]) K.box('p_plastic_dark', W / 2 + .02, .4, dz + e, .03, 2.05, .05); }
  K.box(glass, 0, 1.0, hl - .02, W - .2, 1.55, .04);
  K.box(body, 0, 2.55, hl - .05, W - .1, .45, .1);
  if (!burnt) K.decal('bus_dest', 0, 2.75, hl + .006, 1.8, .25, { glow: true });
  K.box(glass, 0, 1.6, -hl + .02, W - .4, .8, .04);
  K.box('p_plastic_dark', 0, .3, hl - .05, W - .05, .35, .14, { bev: .04 }); K.box('p_plastic_dark', 0, .3, -hl + .05, W - .05, .35, .14, { bev: .04 });
  for (const s of [-1, 1]) {
    K.box(burnt ? 'p_burnt' : o.lights ? 'p_em_head' : 'p_lens_clear', s * (W / 2 - .3), .72, hl + .005, .32, .14, .04, { bev: .02 });
    K.box(burnt ? 'p_burnt' : 'p_lens_red', s * (W / 2 - .2), .9, -hl - .005, .16, .4, .04, { bev: .02 });
    K.tube('p_plastic_dark', [[s * (W / 2 - .1), 2.4, hl - .2], [s * (W / 2 + .2), 2.5, hl - .1], [s * (W / 2 + .3), 2.0, hl - .05]], .02, { seg: 5 });
    K.box('p_plastic_dark', s * (W / 2 + .3), 1.8, hl - .05, .08, .35, .25, { bev: .02 });
  }
  K.box(burnt ? 'p_burnt' : 'p_paint_grey', 0, H, -1.5, 1.6, .25, 3.2, { bev: .06 });
  for (const zc of [zf, zr]) for (const s of [-1, 1]) wheel(K, s * (W / 2 - .3), r, zc, r, { side: s, w: .3, none: burnt, rimMat: burnt ? 'p_burnt' : 'p_alu', spokes: 0 });
  K.col(0, .15, 0, W, H - .15, L, { surf: 'sheetmetal' });
  K.hide(W / 2 + .7, 0, 0, 'car', .8);
}
function cab(K, paint, W, zFront, zBack, H, o) {
  // a cab-over truck cab: body box with a bevelled front, windscreen, doors, mirrors, grille
  const burnt = o.state === 'burnt', body = burnt ? 'p_burnt' : paint, D = zFront - zBack, zc = (zFront + zBack) / 2;
  K.box(body, 0, .55, zc, W, H - .55, D, { bev: .12 });
  K.box(burnt ? 'p_burnt' : 'p_glass_tint', 0, 1.65, zFront + .005, W - .3, .95, .04);
  for (const s of [-1, 1]) {
    K.box(burnt ? 'p_burnt' : 'p_glass_tint', s * (W / 2 + .005), 1.65, zFront - .55, .04, .8, .8);
    K.push(s * (W / 2 + .002), 0, 0, s * PI / 2); panelLines(K, [[s * -(zFront - .1), .7, s * -(zFront - .1), 2.5], [s * -(zFront - 1.05), .7, s * -(zFront - 1.05), 2.5]], 0); K.pop();
    handle(K, 'p_chrome', s * (W / 2 + .01), 1.45, zFront - .95, .2, { off: .02 });
    K.tube('steel_dark', [[s * W / 2, 2.3, zFront - .2], [s * (W / 2 + .25), 2.3, zFront - .1], [s * (W / 2 + .3), 1.7, zFront - .05]], .02, { seg: 5 });
    K.box('p_plastic_dark', s * (W / 2 + .3), 1.6, zFront - .05, .1, .45, .22, { bev: .02 });
    K.box('steel_dark', s * (W / 2 - .3), .35, zFront - .5, .5, .06, .3);
    K.box(burnt ? 'p_burnt' : o.lights ? 'p_em_head' : 'p_lens_clear', s * (W / 2 - .3), .75, zFront + .02, .3, .16, .05, { bev: .02 });
  }
  if (!burnt) K.decal('car_grille', 0, 1.0, zFront + .01, 1.4, .45);
  K.box('p_plastic_dark', 0, .4, zFront + .02, W, .3, .12, { bev: .03 });
}
function boxTruck(K, o, v, rnd) {
  const mil = v === 'military', paint = mil ? 'p_paint_olive' : o.color ? PAINT(o.color) : 'p_car_white', W = 2.45, L = 7.4, hl = L / 2, burnt = o.state === 'burnt';
  cab(K, paint, W, hl, hl - 1.7, 2.75, o);
  for (const s of [-1, 1]) K.box('steel_dark', s * .45, .55, -.3, .16, .25, L - 1.4);
  K.cyl('p_galv', -W / 2 + .25, .5, .2, .28, .1, { seg: 12 }); K.cylX('p_alu', -W / 2 + .05, -W / 2 + .55, .6, -.5, .25, { seg: 12 });
  // cargo body: ribbed box with a roll-up door, or (military) a canvas-covered bed on bows
  const z0 = hl - 1.85, z1 = -hl;
  if (mil) {
    K.box(paint, 0, .85, (z0 + z1) / 2, W, .5, z0 - z1, { bev: .03 });
    const n = 5; for (let i = 0; i < n; i++) { const z = z1 + .2 + i * (z0 - z1 - .4) / (n - 1); K.tube('steel_dark', [[-W / 2 + .05, 1.35, z], [-W / 2 + .05, 2.4, z], [-.7, 2.85, z], [.7, 2.85, z], [W / 2 - .05, 2.4, z], [W / 2 - .05, 1.35, z]], .02, { seg: 5 }); }
    K.loft('p_fab_olive', [-1, 1].map(s => ({ z: s < 0 ? z1 : z0, pts: [[-W / 2, 1.3], [W / 2, 1.3], [W / 2 + .02, 2.42], [.72, 2.9], [-.72, 2.9], [-W / 2 - .02, 2.42]] })), { caps: false, mat: (i, j) => j === 0 ? null : 'p_fab_olive' });
    K.loft('p_fab_olive', [-1, 1].map(s => ({ z: s < 0 ? z1 : z0, pts: [[-W / 2 + .03, 1.3], [W / 2 - .03, 1.3], [W / 2 - .01, 2.4], [.7, 2.87], [-.7, 2.87], [-W / 2 + .01, 2.4]] })), { caps: false, inward: true, mat: (i, j) => j === 0 ? null : 'p_fab_olive' });
    K.box('p_fab_olive', 0, 1.3, z0 - .01, W, 1.6, .02);
    K.decal('stencil_mil', W / 2 + .005, 1.05, -1.5, .9, .35, { face: 'e' });
  } else {
    const body = burnt ? 'p_burnt' : 'p_paint_cream';
    K.box(body, 0, .85, (z0 + z1) / 2, W + .05, 2.75, z0 - z1, { bev: .04 });
    for (const s of [-1, 1]) for (let z = z1 + .3; z < z0; z += .6) K.box(body, s * (W / 2 + .03), .95, z, .02, 2.55, .05);
    K.box(burnt ? 'p_burnt' : 'p_paint_grey', 0, .95, z1 - .01, W - .2, 2.45, .03);
    for (let y = 1.1; y < 3.4; y += .2) K.box('p_plastic_dark', 0, y, z1 - .03, W - .25, .01, .01);
    handle(K, 'p_chrome', 0, 1.15, z1 - .03, .3, { off: -.03 });
    if (!burnt) for (const s of [-1, 1]) K.decal(v === 'plain' ? 'graffiti_0' : 'truck_logo', s * (W / 2 + .055), 2.2, (z0 + z1) / 2, 3.0, 1.1, { face: s > 0 ? 'e' : 'w' });
    for (const s of [-1, 1]) K.box(burnt ? 'p_burnt' : 'p_lens_red', s * (W / 2 - .1), .7, z1 - .02, .2, .12, .05);
  }
  K.box('p_plastic_dark', 0, .45, z1 + .05, W - .2, .1, .1);
  for (const s of [-1, 1]) { wheel(K, s * (W / 2 - .3), .48, hl - .9, .48, { side: s, w: .3, none: burnt, rimMat: 'p_paint_grey', spokes: 0 }); wheel(K, s * (W / 2 - .3), .48, z1 + 1.6, .48, { side: s, w: .5, none: burnt, rimMat: 'p_paint_grey', spokes: 0 }); }
  for (const s of [-1, 1]) K.box('p_plastic_dark', s * (W / 2 - .3), .2, z1 + .9, .5, .55, .02);
  K.col(0, .15, hl - .85, W, 2.6, 1.7, { surf: 'sheetmetal' });
  K.col(0, .4, (z0 + z1) / 2, W, mil ? 2.5 : 3.2, z0 - z1, { surf: mil ? 'fabric' : 'sheetmetal' });
  K.hide(W / 2 + .7, 0, -1.5, 'car', .8);
}
function tractor(K, o, v, rnd) {
  const paint = o.color ? PAINT(o.color) : v === 'red' ? 'p_car_red' : v === 'blue' ? 'p_car_blue' : 'p_car_white', W = 2.5, L = 6.2, hl = L / 2;
  cab(K, paint, W, hl, hl - 2.2, 3.4, o);
  K.box(o.state === 'burnt' ? 'p_burnt' : paint, 0, 2.6, hl - 1.7, W - .1, .6, 1.4, { bev: .15 });
  for (const s of [-1, 1]) { K.box('steel_dark', s * .45, .7, -.4, .18, .3, L - 1.2); K.cyl('p_chrome', s * (W / 2 - .15), .9, hl - 2.35, .08, 2.9, { seg: 10 }); K.cylX('p_alu', s * (W / 2 - .65), s * (W / 2 - .05), .75, .5, .3, { seg: 14 }); }
  K.cyl('steel_dark', 0, 1.0, -1.3, .9, .1, { seg: 16 }); K.box('steel_dark', 0, 1.05, -1.9, .3, .06, 1.0);
  for (const s of [-1, 1]) { wheel(K, s * (W / 2 - .3), .52, hl - .95, .52, { side: s, w: .32, rimMat: 'p_alu', spokes: 0 }); for (const z of [-1.1, -2.45]) wheel(K, s * (W / 2 - .3), .52, z, .52, { side: s, w: .55, rimMat: 'p_alu', spokes: 0 }); }
  K.col(0, .15, hl - 1.1, W, 3.25, 2.2, { surf: 'sheetmetal' });
  K.col(0, .3, -1.3, W, .9, 3.4, { surf: 'metal' });
}
function trailer(K, o, v, rnd) {
  const L = 13.6, W = 2.55, hl = L / 2, deck = 1.3, flat = v === 'flat';
  for (const s of [-1, 1]) K.box('steel_dark', s * .45, deck - .45, 0, .2, .45, L - .3);
  K.box('steel_dark', 0, deck - .12, 0, W, .12, L);
  if (flat) {
    K.box('p_wood_sleeper', 0, deck, 0, W - .05, .05, L - .05);
    for (let z = -hl + .6; z < hl; z += 1.2) for (const s of [-1, 1]) K.box('steel_dark', s * (W / 2 - .02), deck - .1, z, .06, .14, .12);
    K.col(0, deck - .45, 0, W, .5, L, { surf: 'metal', walk: true });
    if (o.load === 'container') { K.push(0, deck + .05, 0); /* a 40 ft box is placed by the map: this only reserves the deck */ K.pop(); }
  } else {
    const body = o.color ? PAINT(o.color) : 'p_paint_cream';
    K.box(body, 0, deck, 0, W, 2.7, L, { bev: .04 });
    for (const s of [-1, 1]) { for (let z = -hl + .3; z < hl; z += .55) K.box('p_alu', s * (W / 2 + .01), deck + .1, z, .02, 2.5, .05); K.box('p_alu', s * (W / 2 + .01), deck, 0, .03, .12, L); K.box('p_alu', s * (W / 2 + .01), deck + 2.6, 0, .03, .1, L); }
    K.box('p_paint_grey', 0, deck + .05, -hl - .01, W - .1, 2.6, .03);
    for (const s of [-1, 1]) { K.cyl('p_chrome', s * .35, deck + .1, -hl - .05, .02, 2.4, { seg: 6 }); K.box('p_lens_red', s * (W / 2 - .15), deck - .3, -hl - .02, .2, .1, .05); }
    K.push(0, 0, -hl - .03, PI); panelLines(K, [[0, deck + .1, 0, deck + 2.6]], 0); K.pop();
    if (rnd() < .6) K.decal('graffiti_' + Math.floor(rnd() * 3), W / 2 + .03, deck + 1.0, rnd() * 4 - 2, 3.2, 1.4, { face: 'e' });
    else K.decal('truck_logo', W / 2 + .03, deck + 1.5, 0, 3.5, 1.3, { face: 'e' });
    K.decal('truck_logo', -W / 2 - .03, deck + 1.5, 0, 3.5, 1.3, { face: 'w' });
    K.col(0, deck - .45, 0, W, 3.15, L, { surf: 'sheetmetal' });
  }
  for (const z of [-hl + 1.1, -hl + 2.4, -hl + 3.7]) for (const s of [-1, 1]) wheel(K, s * (W / 2 - .3), .5, z, .5, { side: s, w: .5, rimMat: 'p_alu', spokes: 0 });
  for (const s of [-1, 1]) { K.box('steel_dark', s * .6, 0, hl - 3.5, .12, deck - .3, .12); K.box('steel_dark', s * .6, 0, hl - 3.5, .3, .04, .3); }
  K.box('steel_dark', 0, .55, -hl + .2, W - .3, .1, .1); for (const s of [-1, 1]) K.box('steel_dark', s * .9, .55, -hl + .25, .1, deck - .55, .1);
  K.cylX('steel_dark', -W / 2 + .2, W / 2 - .2, .3, hl - 3.5, .03, { seg: 6 });
}

// ------------------------------------------------------------------------------------------------ rail
export const RAIL_TOP = .39;
function track(K, o, v, rnd) {
  const L = o.len || 12, gauge = 1.435, hr = gauge / 2 + .036;
  K.ext('p_ballast', [[-2.1, 0], [2.1, 0], [1.5, .2], [-1.5, .2]], -L / 2, L / 2);
  const wood = v === 'wood', sl = wood ? 'p_wood_sleeper' : 'p_concrete_precast';
  for (let z = -L / 2 + .3; z < L / 2; z += .6) K.box(sl, 0, .15, z + (rnd() - .5) * .02, wood ? 2.6 : 2.5, .07, wood ? .22 : .26, { bev: .01 });
  const rail = [[-.075, 0], [.075, 0], [.075, .012], [.012, .03], [.009, .13], [.036, .14], [.036, .172], [-.036, .172], [-.036, .14], [-.009, .13], [-.012, .03], [-.075, .012]];
  for (const s of [-1, 1]) {
    K.push(s * hr, .218, 0); K.ext('p_rail', rail, -L / 2, L / 2, { caps: true }); K.pop();
    K.box('p_chrome', s * hr, .218 + .165, 0, .05, .008, L);
  }
  K.col(0, 0, 0, 3.0, .21, L, { surf: 'gravel', walk: true });
}
function bogie(K, x0, z) {
  for (const s of [-1, 1]) K.box('steel_dark', s * .82, RAIL_TOP + .2, z, .16, .45, 2.4, { bev: .03 });
  for (const dz of [-.86, .86]) { K.cylX('steel_dark', -.9, .9, RAIL_TOP + .46, z + dz, .07, { seg: 8 }); for (const s of [-1, 1]) { K.lathe('p_rail', [[.46, -.07], [.48, -.05], [.46, -.03], [.42, .07], [.2, .07], [.12, .1]], { rz: -s * PI / 2, x: s * .7535, y: RAIL_TOP + .46, z: z + dz, seg: 16 }); } }
  K.box('steel_dark', 0, RAIL_TOP + .45, z, 2.0, .3, .5, { bev: .03 });
  for (const s of [-1, 1]) for (const dz of [-.3, .3]) K.lathe('p_galv', [[.08, 0], [.08, .3]], { x: s * .82, y: RAIL_TOP + .62, z: z + dz, seg: 8 });
}
function railcar(K, o, v, rnd) {
  const L = v === 'tanker' ? 15.0 : v === 'flatcar' ? 15.5 : 15.5, W = v === 'tanker' ? 3.0 : 3.2, hl = L / 2, deck = RAIL_TOP + 1.1;
  // underframe, couplers, end platforms
  K.box('steel_dark', 0, deck - .35, 0, .6, .35, L - .5);
  K.box(v === 'boxcar' ? 'p_paint_maroon' : 'steel_dark', 0, deck - .1, 0, W, .12, L - .2);
  for (const s of [-1, 1]) {
    K.box('steel_dark', 0, deck - .45, s * (hl - .1), W - .2, .4, .25);
    K.box('steel_dark', 0, deck - .4, s * (hl + .25), .25, .25, .55, { bev: .03 }); K.box('steel_dark', 0, deck - .42, s * (hl + .5), .32, .32, .15, { bev: .04 });
    bogie(K, 0, s * (hl - 2.4));
  }
  if (v === 'tanker') {
    const R = 1.4, yc = deck + R + .1, mat = o.color === 'white' ? 'paint_white' : 'paint_black';
    K.push(0, yc, 0); K.cylZ(mat, -hl + 1.0, hl - 1.0, 0, 0, R, { seg: 28, caps: false });
    for (const s of [-1, 1]) K.lathe(mat, [[R, 0], [R * .9, R * .25], [R * .55, R * .4], [0, R * .45]], { rx: s * PI / 2, z: s * (hl - 1.0), seg: 28 });
    K.pop();
    K.cyl(mat, 0, yc + R - .1, 0, .45, .35, { seg: 14 }); K.cyl(mat, 0, yc + R + .25, 0, .5, .06, { seg: 14 });
    for (const s of [-1, 1]) K.box('steel_dark', s * .8, deck, s * (hl - 2.2), .2, R * .6, 1.0);
    K.box('grate', 0, yc + R + .05, 0, 1.2, .03, 2.0); railing(K, 'steel_dark', -.6, -1, .6, -1, yc + R + .05, { h: .9, toe: false }); railing(K, 'steel_dark', -.6, 1, .6, 1, yc + R + .05, { h: .9, toe: false });
    for (const s of [-1, 1]) { K.decal('un_plate', s * (R + .005), yc, -2, .45, .32, { face: s > 0 ? 'e' : 'w' }); K.decal('rail_mark', s * (R + .005), yc - .6, 3, 2.2, .62, { face: s > 0 ? 'e' : 'w' }); K.decal('haz_flame', s * (R + .005), yc + .1, -3.5, .5, .5, { face: s > 0 ? 'e' : 'w' }); }
    K.col(0, RAIL_TOP + .2, 0, W, yc + R - RAIL_TOP - .2, L - .6, { surf: 'metal' });
  } else if (v === 'flatcar') {
    K.box('p_wood_sleeper', 0, deck + .02, 0, W - .1, .06, L - .3);
    for (let z = -hl + .8; z < hl; z += 1.6) for (const s of [-1, 1]) K.box('steel_dark', s * (W / 2 - .03), deck - .15, z, .08, .15, .14);
    if (o.load === 'pipes') for (let j = 0; j < 3; j++) for (let i = 0; i < 6 - j; i++) K.cylZ('p_galv', -hl + .8, hl - .8, -1.0 + (i + j * .5) * .4, deck + .28 + j * .34, .19, { seg: 12 });
    if (o.load === 'logs') for (let j = 0; j < 3; j++) for (let i = 0; i < 6 - j; i++) K.cylZ('p_bark', -hl + .6, hl - .6, -1.1 + (i + j * .5) * .44, deck + .3 + j * .38, .2, { seg: 10 });
    for (const s of [-1, 1]) for (const z of [-hl + 1, 0, hl - 1]) if (o.load) K.box('steel_dark', s * (W / 2 - .05), deck + .08, z, .1, 1.1, .1);
    K.decal('rail_mark', W / 2 + .005, deck - .1, 0, 1.6, .45, { face: 'e' });
    K.col(0, RAIL_TOP + .2, 0, W, deck + .08 - RAIL_TOP - .2, L - .3, { surf: 'metal', walk: true });
    if (o.load === 'pipes' || o.load === 'logs') K.col(0, deck + .08, 0, W - .2, 1.15, L - 1.4, { surf: o.load === 'logs' ? 'wood' : 'metal' });
  } else {
    // boxcar: ribbed steel body, plug-style sliding door, roof, ladders
    const body = o.color ? (o.color === 'rust' ? 'metal_rust' : 'p_paint_' + o.color) : 'p_paint_maroon', H = 3.3, top = deck + H;
    K.box(body, 0, deck, 0, W, H, L - .4, { bev: .03 });
    for (const s of [-1, 1]) {
      for (let z = -hl + .5; z < hl - .2; z += .62) if (Math.abs(z) > 1.6) K.box(body, s * (W / 2 + .02), deck + .05, z, .04, H - .1, .08);
      K.box(body, s * (W / 2 + .06), deck, 0, .06, H - .1, 3.0, { bev: .01 });
      for (let i = 0; i < 4; i++) K.box(body, s * (W / 2 + .1), deck + .3 + i * .8, 0, .03, .05, 2.9);
      K.box('steel_dark', s * (W / 2 + .1), deck - .08, 0, .08, .08, 6.0); K.box('steel_dark', s * (W / 2 + .1), top - .1, 0, .06, .06, 6.0);
      handle(K, 'steel_dark', s * (W / 2 + .14), deck + 1.4, -1.2, .4, { vert: true, off: .04 });
      K.decal('rail_mark', s * (W / 2 + .025), deck + .7, s * -4.5, 2.4, .68, { face: s > 0 ? 'e' : 'w' });
      if (rnd() < .7) K.decal('graffiti_' + Math.floor(rnd() * 3), s * (W / 2 + .025), deck + .9, s * 4.2, 3.6, 1.6, { face: s > 0 ? 'e' : 'w' });
      for (const sz of [-1, 1]) { K.push(s * (W / 2 - .2), deck - .1, sz * (hl - .21), sz > 0 ? 0 : PI); ladder(K, 'steel_dark', 0, 0, 0, H, { w: .4 }); K.pop(); }
    }
    K.box(body, 0, top, 0, W + .05, .1, L - .3, { bev: .02 });
    for (let z = -hl + .6; z < hl; z += 1.2) K.box(body, 0, top + .08, z, W, .04, .1);
    K.ring('steel_dark', 0, deck + 2.6, hl - .17, .22, .015, { rx: PI / 2, seg: 12 });
    K.col(0, RAIL_TOP + .2, 0, W + .15, top + .1 - RAIL_TOP - .2, L - .3, { surf: 'sheetmetal' });
  }
  K.col(0, RAIL_TOP, 0, 2.0, .9, L, { surf: 'metal' });
}

// ------------------------------------------------------------------------------------------------ boat, airliner
function boat(K, o, v, rnd) {
  const L = 4.4, B = 1.7, D = .75, hull = v === 'green' ? 'paint_green' : v === 'blue' ? 'p_car_blue' : v === 'wood' ? 'p_wood_walnut' : 'paint_white', inn = v === 'wood' ? 'p_wood_light' : 'p_paint_lightblue';
  // V-ish hull sections (open on top): keel -> chine -> topside -> gunwale on each side
  const sec = (hb, keel, sheer) => {
    const d = sheer - keel, half = [[0, keel], [hb * .35, keel + d * .05], [hb * .72, keel + d * .2], [hb * .93, keel + d * .45], [hb, sheer]];
    return half.concat(half.slice(1).reverse().map(([x, y]) => [-x, y]));
  };
  // stations from the transom (-z) to the bow (+z): [z, half beam, keel height, sheer height]
  const st = [[-L / 2, .74, .12, .78], [-L / 4, .82, .06, .8], [0, .84, .04, .82], [L / 4, .74, .07, .87], [L / 2 - .55, .48, .14, .94], [L / 2 - .15, .14, .3, 1.0], [L / 2, .02, .48, 1.02]];
  const top = 4;    // the quad between the two gunwales stays open
  K.loft(hull, st.map(([z, hb, keel, sheer]) => ({ z, pts: sec(hb, keel, sheer) })), { caps: true, mat: (i, j) => j === top ? null : hull });
  K.loft(inn, st.slice(0, -1).map(([z, hb, keel, sheer]) => ({ z: z + (z === -L / 2 ? .03 : 0), pts: sec(Math.max(.02, hb - .035), keel + .035, sheer - .01) })), { caps: false, inward: true, mat: (i, j) => j === top ? null : inn });
  // gunwale cap, transom, thwarts, outboard
  for (let i = 0; i < st.length - 1; i++) {
    const [z0, h0, , s0] = st[i], [z1, h1, , s1] = st[i + 1];
    for (const s of [-1, 1]) K.tube('p_wood_walnut', [[s * h0, s0 + .01, z0], [s * h1, s1 + .01, z1]], .025, { seg: 5 });
  }
  K.extX('p_wood_walnut', [[-L / 2 - .02, .12], [-L / 2 + .02, .12], [-L / 2 + .02, .78], [-L / 2 - .02, .78]], -.74, .74);
  for (const z of [-1.3, 0, 1.0]) K.box('p_wood_light', 0, .45, z, 1.55 - Math.abs(z) * .25, .04, .25);
  if (v !== 'wood') {
    K.push(0, .5, -L / 2 - .1);
    K.box('p_plastic_dark', 0, .35, -.05, .3, .38, .42, { bev: .06 }); K.box('p_plastic_dark', 0, .1, 0, .12, .3, .16);
    K.box('p_plastic_dark', 0, -.55, .02, .08, .7, .12); K.cyl('steel_dark', 0, -.62, -.08, .05, .1, { seg: 8 });
    K.tube('p_plastic_dark', [[0, .5, .2], [0, .52, .7]], .02, { seg: 5 });
    K.pop();
  }
  K.col(0, 0, 0, B, .82, L, { surf: 'wood' });
}
function airliner(K, o, v, rnd) {
  const Lf = 34, R = 1.95, yc0 = 3.45, hl = Lf / 2;
  // fuselage: circles; nose ellipse, tail cone rising
  const stz = [], N = 20;
  const prof = z => {
    const f = (z + hl) / Lf;   // 0 tail .. 1 nose
    if (f > .9) { const t = (f - .9) / .1; return [R * Math.sqrt(Math.max(.0004, 1 - t * t)) * (1 - t * .08), yc0 - t * .45]; }
    if (f < .22) { const t = (.22 - f) / .22; return [R * (1 - t * .78), yc0 + t * 1.15]; }
    return [R, yc0];
  };
  for (let i = 0; i <= 40; i++) { const f = i / 40, z = -hl + f * Lf; if (f > .88 || f < .25 || i % 3 === 0) stz.push(z); }
  const secs = stz.map(z => { const [r, yc] = prof(z); const pts = []; for (let j = 0; j < N; j++) { const a = -PI / 2 + j * 2 * PI / N; pts.push([Math.cos(a) * r, yc + Math.sin(a) * r * 1.02]); } return { z, pts }; });
  K.loft('paint_white', secs, { caps: true, mat: (i, j) => (j < 3 || j >= 17) ? 'p_paint_grey' : (j === 3 || j === 16) ? 'p_car_navy' : 'paint_white' });
  // cockpit windows, cabin windows, doors
  K.push(0, 0, 0);
  for (const s of [-1, 1]) {
    K.push(s * .55, yc0 + .55, hl - 1.9, 0, -.5, 0); K.box('p_glass_dark', 0, 0, 0, .7, .25, .08, { ry: s * .35 }); K.pop();
    for (let z = -hl + 8.5; z < hl - 5; z += 2.12) K.decal('air_windows', s * (R + .012), yc0 + .35, z, 2.12, .3, { face: s > 0 ? 'e' : 'w' });
    K.push(s * (R + .006), 0, 0, s * PI / 2); panelLines(K, [[s * -(hl - 4.2), yc0 - .9, s * -(hl - 4.2), yc0 + .9], [s * -(hl - 5.1), yc0 - .9, s * -(hl - 5.1), yc0 + .9], [s * -(hl - 4.2), yc0 + .9, s * -(hl - 5.1), yc0 + .9], [s * (hl - 9), yc0 - .9, s * (hl - 9), yc0 + .9]], 0); K.pop();
    K.decal('airline', s * (R + .012), yc0 + 1.0, 3, 9, 1.27, { face: s > 0 ? 'e' : 'w' });
  }
  K.pop();
  // wings (low, swept, dihedral): airfoil sections lofted along the span (frame: loft z = span)
  const foil = (c, t) => { const p = []; for (let i = 0; i <= 8; i++) { const x = i / 8; p.push([c * (x - .3), t * c * .12 * Math.sin(PI * Math.pow(x, .6))]); } for (let i = 7; i >= 1; i--) { const x = i / 8; p.push([c * (x - .3), -t * c * .05 * Math.sin(PI * Math.pow(x, .6))]); } return p; };
  for (const s of [-1, 1]) {
    K.push(s * .8, yc0 - 1.25, 1.0, 0, 0, 0);
    // build the wing directly in plan: chord along z (front = +z), span along x
    const wsec = [[0, 6.5, 0, 0], [5.5, 4.4, 2.6, .45], [16.2, 1.6, 7.6, 1.35]].map(([span, c, sweep, dih]) => ({ z: span, pts: foil(c, 1).map(p => [p[0] + sweep, p[1] + dih]) }));
    K.push(0, 0, 0, s * PI / 2); K.loft('paint_white', wsec.map(q => ({ z: q.z, pts: q.pts.map(p => [p[0] * s, p[1]]) })), { caps: true }); K.pop();
    K.pop();
    // engine nacelle under the wing at 5.5 m span
    const ex = s * 5.8, ey = yc0 - 2.4, ez = 3.6;
    K.push(ex, ey, ez, 0, PI / 2, 0);
    K.lathe('paint_white', [[.0, -2.4], [.55, -2.2], [.78, -1.4], [.9, -.2], [.98, .7], [.92, 1.25], [.86, 1.32]], { seg: 20, capT: false, sharp: 35 });
    K.lathe('p_alu', [[.86, 1.32], [.82, 1.2]], { seg: 20, caps: false });
    K.cyl('steel_dark', 0, .9, 0, .82, .1, { seg: 20 });
    K.lathe('p_chrome', [[.22, 1.0], [.12, 1.25], [0, 1.35]], { seg: 12 });
    for (let b = 0; b < 16; b++) { K.push(0, 1.0, 0, b * PI / 8); K.box('steel_dark', .45, 0, 0, .7, .015, .12, { rx: .5 }); K.pop(); }
    K.pop();
    K.box('paint_white', ex, ey + .7, ez - .6, .3, .9, 2.8, { bev: .08 });
    // main gear
    const gx = s * 2.9, gz = -.2;
    K.cyl('p_chrome', gx, .6, gz, .09, yc0 - 1.6 - .6, { seg: 8 }); K.cyl('steel_dark', gx, 1.1, gz, .12, yc0 - 2.6, { seg: 8 });
    K.box('steel_dark', gx, .5, gz, .25, .15, 1.4);
    for (const dz of [-.55, .55]) for (const dx of [-.28, .28]) wheel(K, gx + dx, .58, gz + dz, .58, { side: dx > 0 ? 1 : -1, w: .4, rimMat: 'p_alu', spokes: 0 });
  }
  // nose gear
  const nz = hl - 4.5;
  K.cyl('p_chrome', 0, .4, nz, .07, yc0 - 1.9 - .4, { seg: 8 });
  for (const s of [-1, 1]) wheel(K, s * .2, .4, nz, .4, { side: s, w: .25, rimMat: 'p_alu', spokes: 0 });
  // tail: fin + stabilisers
  K.push(0, yc0 + 1.2, -hl + 2.0, 0, 0, 0);
  K.extX('paint_white', [[-3.2, 0], [1.6, 0], [-1.6, 5.6], [-3.4, 5.6]], -.16, .16);
  K.decal('airline', .17, 3.0, -1.2, 3.6, .51, { face: 'e' }); K.decal('airline', -.17, 3.0, -1.2, 3.6, .51, { face: 'w' });
  K.pop();
  for (const s of [-1, 1]) {
    K.push(s * .5, yc0 + 1.0, -hl + 2.8, s * PI / 2);
    K.loft('paint_white', [[0, 3.6, 0, 0], [6.4, 1.4, 2.6, .5]].map(([span, c, sw, dih]) => ({ z: span, pts: foil(c, .8).map(p => [(p[0] + sw) * s, p[1] + dih]) })), { caps: true });
    K.pop();
  }
  for (const s of [-1, 1]) K.decal('air_reg', s * (R * .93 + .012), yc0 - .5, -hl + 7.2, 1.2, .3, { face: s > 0 ? 'e' : 'w' });
  // colliders: fuselage segments, wings, engines, gear legs, fin
  for (let z = -hl + 3; z < hl - 1; z += 4) K.col(0, yc0 - R * .9, z + 2, R * 2, R * 1.9, 4, { surf: 'sheetmetal' });
  for (const s of [-1, 1]) {
    for (const [x0, x1, zc, c] of [[1, 6, 0, 5.2], [6, 11, -1.7, 3.6], [11, 16.5, -3.6, 2.4]]) K.col(s * (x0 + x1) / 2 + s * .8, yc0 - 1.5, zc + 1.0 - (c - 4) * .1, x1 - x0, .6, c, { surf: 'sheetmetal' });
    K.col(s * 5.8, yc0 - 3.4, 3.6, 2.0, 2.0, 4.0, { surf: 'metal' });
    K.col(s * 2.9, 0, -.2, 1.0, 1.2, 1.9, { surf: 'rubber' });
  }
  K.col(0, 0, nz, .7, .85, .5, { surf: 'rubber' });
  K.col(0, yc0 + 1.2, -hl + 1.4, .35, 5.6, 4, { surf: 'sheetmetal' });
  K.hide(0, 0, 4, 'under', 1.0);
}

export default [
  { type: 'car', alias: ['sedan'], cat: 'vehicle', size: [1.82, 1.45, 4.75], vary: true, keys: ['color', 'state', 'lights'],
    desc: 'passenger car (lofted body, flush glass, interior, lights, plates, wheels); nose = +z; hide beside it',
    variants: ['sedan', 'hatch', 'suv', 'pickup', 'van', 'police', 'taxi'],
    opts: { color: 'white | silver | grey | black | red | blue | green | beige | yellow | navy | orange | brown (default: seeded realistic mix)', state: "'ok' | 'wreck' (dented, rusty, a wheel off) | 'burnt' (charred shell on rims)", lights: 'headlights / tail lights / light bar lit' },
    sizeOf: (o, v) => { const P = CARS[v] || CARS.sedan; return [P.W + .3, (v === 'police' ? P.roof + .15 : P.roof), P.L]; }, build: car },
  { type: 'bus', cat: 'vehicle', size: [2.55, 3.3, 12], keys: ['color', 'state', 'lights'], desc: 'city bus: window band, doors on +x, destination display, roof pod', variants: ['city', 'school'], opts: { color: 'car paint name', state: "'ok' | 'burnt'" }, build: bus },
  { type: 'box_truck', cat: 'vehicle', size: [2.5, 3.6, 7.4], keys: ['color', 'state', 'lights'], desc: '7.5 t cab-over box truck with roll-up door (or a canvas-covered military truck)',
    variants: ['logo', 'plain', 'military'], opts: { color: 'cab paint', state: "'ok' | 'burnt'" }, build: boxTruck },
  { type: 'truck_tractor', cat: 'vehicle', size: [2.5, 3.4, 6.2], keys: ['color', 'state'], desc: 'semi tractor unit (cab-over with sleeper, fifth wheel, 3 axles)', variants: ['white', 'red', 'blue'], build: tractor },
  { type: 'semi_trailer', cat: 'vehicle', size: [2.55, 4.0, 13.6], vary: true, keys: ['color', 'load'], desc: 'semi trailer: box van (graffiti / logo, rear doors) or flatbed; deck 1.3 m',
    variants: ['box', 'flat'], opts: { color: 'box paint' }, build: trailer },
  { type: 'track', alias: ['rails'], cat: 'rail', size: [4.2, .39, 12], keys: ['len'], desc: 'standard gauge track on ballast with sleepers every .6 m (along z); rail top at RAIL_TOP (.39)',
    variants: ['concrete', 'wood'], opts: { len: 'length (12)' }, sizeOf: o => [4.2, .39, o.len || 12], build: track },
  { type: 'railcar', cat: 'rail', size: [3.2, 4.8, 15.5], vary: true, keys: ['color', 'load'], desc: 'railcar on two bogies, wheels on the rails of a track prop at the same y: boxcar (sliding door, ladders, marks, graffiti), tank car, flatcar',
    variants: ['boxcar', 'tanker', 'flatcar'], opts: { color: "boxcar: maroon | teal | grey | rust | olive; tanker: 'white' | black", load: "flatcar: 'pipes' | 'logs'" },
    sizeOf: (o, v) => v === 'flatcar' ? [3.2, 1.6, 15.5] : v === 'tanker' ? [3.0, 4.9, 15] : [3.4, 4.9, 15.5], build: railcar },
  { type: 'boat', cat: 'vehicle', size: [1.7, 1.0, 4.4], desc: 'small skiff with thwarts and an outboard (bow = +z); place its y at the waterline - .25', variants: ['white', 'green', 'blue', 'wood'], build: boat },
  { type: 'airliner', cat: 'vehicle', size: [34, 11.5, 34], desc: 'twin-engine narrow-body airliner (fictional livery): walk under the wings and fuselage (crouch), gear down; nose = +z',
    build: airliner },
];
