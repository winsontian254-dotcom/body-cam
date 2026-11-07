// Node unit tests of js/phys (world, ray, move): node tools/test/phys.mjs [filter]
// Pure JS, no browser. Exits non-zero on any failure.
import { World } from '../../js/phys/world.js';
import { raycast, raycastAll, segmentClear } from '../../js/phys/ray.js';
import { moveStep, MOVE, BTN, eyePos, fallDamage, applySlow } from '../../js/phys/move.js';
import { buildNav } from '../../js/maps/navgrid.js';

const filter = process.argv[2] || '';
let pass = 0, fail = 0; const fails = [];
function test(name, fn) {
  if (filter && !name.includes(filter)) return;
  try { fn(); pass++; console.log('  ok   ' + name); }
  catch (e) { fail++; fails.push(name); console.log('  FAIL ' + name + '\n       ' + (e && e.message)); }
}
function eq(a, b, tol, msg) { if (!(Math.abs(a - b) <= tol)) throw new Error((msg || 'value') + ': got ' + a + ', expected ' + b + ' +- ' + tol); }
function ok(v, msg) { if (!v) throw new Error(msg || 'expected true'); }

const DT = 1 / 64;
function player(x = 0, y = 0, z = 0, yaw = 0) {
  return { pos: { x, y, z }, vel: { x: 0, y: 0, z: 0 }, yaw, pitch: 0, crouch: 0, lean: 0, onGround: true, mantle: null, tagged: 0 };
}
function run(w, s, cmd, ticks, speed = 5.2, each) {
  const evs = [];
  for (let i = 0; i < ticks; i++) {
    const c = typeof cmd === 'function' ? cmd(i) : cmd;
    const ev = moveStep(w, s, { yaw: s.yaw, pitch: 0, mx: 0, mz: 0, buttons: 0, ...c }, DT, speed);
    evs.push({ ...ev });
    if (each) each(i, ev);
  }
  return evs;
}
function floorWorld(size = 60) {
  const w = new World();
  w.addBox({ cx: 0, cy: -0.1, cz: 0, hx: size, hy: 0.1, hz: size, surf: 'concrete' });
  return w;
}
const R = MOVE.radius;

console.log('world');
test('groundAt on a flat floor and on a box', () => {
  const w = floorWorld(); w.addBox({ cx: 5, cy: 0.5, cz: 0, hx: 1, hy: 0.5, hz: 1, surf: 'wood' }); w.build();
  const g = w.groundAt(0, 0, 1, 0.3); eq(g.y, 0, 1e-6, 'floor'); ok(g.surf === 'concrete');
  const g2 = w.groundAt(5, 0, 2, 0.3); eq(g2.y, 1, 1e-6, 'box top'); ok(g2.surf === 'wood');
  const g3 = w.groundAt(5, 0, 0.5, 0.3); eq(g3.y, 0, 1e-6, 'below the box top -> floor');
  ok(w.groundAt(500, 0, 5, 0.3) === null, 'off the map');
  // the circle touches the box edge
  eq(w.groundAt(3.8, 0, 2, 0.32).y, 1, 1e-6, 'edge overlap');
  eq(w.groundAt(3.6, 0, 2, 0.32).y, 0, 1e-6, 'just off the edge');
});
test('overlapCylinder / blocked / ceilingAt', () => {
  const w = floorWorld(); const id = w.addBox({ cx: 0, cy: 1.5, cz: 3, hx: 2, hy: 1.5, hz: 0.1 }); w.build();
  ok(w.overlapCylinder(0, 0, 0, 0.3, 1.8).length === 0, 'free spot');
  ok(w.overlapCylinder(0, 0, 2.75, 0.3, 1.8).includes(id), 'touching the wall');
  ok(!w.blocked(0, 0.001, 0, 0.3, 1.8), 'not blocked');
  ok(w.blocked(0, 0.001, 2.8, 0.3, 1.8), 'blocked');
  const w2 = floorWorld(); w2.addBox({ cx: 0, cy: 2.2, cz: 0, hx: 2, hy: 0.1, hz: 2 }); w2.build();
  eq(w2.ceilingAt(0, 0, 1, 0.3), 2.1, 1e-6, 'ceiling bottom');
  ok(w2.ceilingAt(5, 0, 1, 0.3) === Infinity, 'no ceiling');
});
test('rotated box footprint and AABB', () => {
  const w = floorWorld(); const id = w.addBox({ cx: 0, cy: 1, cz: 0, hx: 2, hy: 1, hz: 0.1, ry: Math.PI / 4 }); w.build();
  const c = w.get(id);
  eq(c.maxX, 2 * Math.SQRT1_2 + 0.1 * Math.SQRT1_2, 1e-6, 'aabb');
  // local +x maps to (cos, -sin): the wall runs from (-1.41, 1.41) to (1.41, -1.41)
  ok(w.blocked(1.2, 0.01, -1.2, 0.1, 1), 'on the wall line');
  ok(!w.blocked(1.2, 0.01, 1.2, 0.1, 1), 'off the wall line');
  const w2 = new World(); const i90 = w2.addBox({ cx: 0, cy: 0, cz: 0, hx: 3, hy: 1, hz: 1, ry: Math.PI / 2 });
  ok(w2.get(i90).ry === 0 && w2.get(i90).hx === 1 && w2.get(i90).hz === 3, '90 degrees becomes an AABB with swapped extents');
});
test('remove and setSolid (lobby gates)', () => {
  const w = floorWorld(); const g = w.addBox({ cx: 0, cy: 1, cz: 2, hx: 1, hy: 1, hz: 0.15, tag: 'gate' }); w.build();
  ok(w.blocked(0, 0.01, 1.9, 0.3, 1.8), 'gate blocks');
  w.setSolid(g, false); ok(!w.blocked(0, 0.01, 1.9, 0.3, 1.8), 'opened');
  ok(!raycast(w, { x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 }, 5).hit, 'rays pass an open gate');
  w.setSolid(g, true); ok(w.blocked(0, 0.01, 1.9, 0.3, 1.8), 'closed again');
  w.remove(g); ok(!w.blocked(0, 0.01, 1.9, 0.3, 1.8), 'removed');
});
test('colliders added after build() are found', () => {
  const w = floorWorld(); w.build();
  w.addBox({ cx: 3, cy: 1, cz: 0, hx: 0.5, hy: 1, hz: 0.5 });
  ok(w.blocked(3, 0.01, 0, 0.3, 1), 'extra collider');
  w.build(); ok(w.blocked(3, 0.01, 0, 0.3, 1), 'after rebuild');
});

console.log('ray');
test('raycast hits a box face with the right normal and distance', () => {
  const w = floorWorld(); w.addBox({ cx: 0, cy: 1.5, cz: 10, hx: 3, hy: 1.5, hz: 0.25, surf: 'brick' }); w.build();
  const h = raycast(w, { x: 0, y: 1.5, z: 0 }, { x: 0, y: 0, z: 1 }, 100);
  ok(h.hit); eq(h.dist, 9.75, 1e-6); eq(h.normal.z, -1, 1e-9, 'normal'); ok(h.surf === 'brick');
  const miss = raycast(w, { x: 0, y: 1.5, z: 0 }, { x: 0, y: 0, z: -1 }, 100);
  ok(!miss.hit); eq(miss.dist, 100, 0);
  const down = raycast(w, { x: 0, y: 5, z: 0 }, { x: 0, y: -1, z: 0 }, 100);
  eq(down.dist, 5, 1e-6, 'floor'); eq(down.normal.y, 1, 1e-9);
});
test('raycastAll gives entry and exit distances (wall thickness)', () => {
  const w = new World();
  w.addBox({ cx: 0, cy: 1, cz: 5, hx: 2, hy: 1, hz: 0.1, surf: 'plaster' });
  w.addBox({ cx: 0, cy: 1, cz: 9, hx: 2, hy: 1, hz: 0.3, surf: 'concrete' }); w.build();
  const all = raycastAll(w, { x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 }, 50);
  ok(all.length === 2, 'two walls');
  eq(all[0].dist, 4.9, 1e-6); eq(all[0].exitDist - all[0].dist, 0.2, 1e-6, 'thin wall');
  eq(all[1].dist, 8.7, 1e-6); eq(all[1].exitDist - all[1].dist, 0.6, 1e-6, 'thick wall');
  ok(all[0].surf === 'plaster' && all[1].surf === 'concrete');
});
test('rotated box ray and exit thickness', () => {
  const w = new World(); w.addBox({ cx: 0, cy: 0, cz: 0, hx: 1, hy: 1, hz: 0.5, ry: Math.PI / 4 }); w.build();
  const all = raycastAll(w, { x: -5, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, 20);
  ok(all.length === 1);
  // crossing a 2 x 1 rectangle rotated 45 degrees along x: chord = 1 / sin(45) = 1.414
  eq(all[0].exitDist - all[0].dist, Math.SQRT2, 1e-6, 'chord');
  const n = all[0].normal; eq(Math.hypot(n.x, n.y, n.z), 1, 1e-9, 'unit normal'); ok(n.x < 0, 'faces the ray');
});
test('ray starting inside a box hits at 0', () => {
  const w = new World(); w.addBox({ cx: 0, cy: 0, cz: 0, hx: 1, hy: 1, hz: 1 }); w.build();
  const h = raycast(w, { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, 10); ok(h.hit); eq(h.dist, 0, 0);
});
test('ramp and cylinder rays', () => {
  const w = new World();
  w.addRamp({ cx: 0, cz: 5, hx: 1, hz: 2, y0: 0, y1: 2, axis: 'z' });   // rises from z=3 (y 0) to z=7 (y 2)
  w.addCyl({ cx: 10, cy: 1, cz: 0, r: 0.5, hy: 1 }); w.build();
  const h = raycast(w, { x: 0, y: 5, z: 5 }, { x: 0, y: -1, z: 0 }, 20);
  ok(h.hit); eq(h.point.y, 1, 1e-6, 'slope height at the middle'); ok(h.normal.y > 0.8 && h.normal.z < 0, 'slope normal');
  const side = raycast(w, { x: 0, y: 0.5, z: 0 }, { x: 0, y: 0, z: 1 }, 20);
  ok(side.hit); eq(side.point.z, 4, 1e-6, 'slope 2 over 4 m: y .5 at z 4');
  const c = raycastAll(w, { x: 5, y: 1, z: 0 }, { x: 1, y: 0, z: 0 }, 20);
  ok(c.length === 1); eq(c[0].dist, 4.5, 1e-6); eq(c[0].exitDist, 5.5, 1e-6); eq(c[0].normal.x, -1, 1e-9);
});
test('heightfield ray and ground', () => {
  const w = new World();
  const res = 1, nx = 41, nz = 41, h = new Float32Array(nx * nz);
  const fn = (x, z) => 0.1 * x + 0.5 * Math.sin(z * 0.3);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) h[j * nx + i] = fn(-20 + i * res, -20 + j * res);
  w.setGround({ minX: -20, maxX: 20, minZ: -20, maxZ: 20, res, heights: h, surf: 'grass' }); w.build();
  const g = w.groundAt(3.5, 2.5, 50, 0); eq(g.y, fn(3.5, 2.5), 0.05, 'bilinear height'); ok(g.surf === 'grass');
  const r = raycast(w, { x: 3.5, y: 20, z: 2.5 }, { x: 0, y: -1, z: 0 }, 100);
  ok(r.hit && r.id === -1); eq(r.point.y, fn(3.5, 2.5), 0.05, 'ray height');
  const d = { x: 0.8, y: -0.6, z: 0 };
  const r2 = raycast(w, { x: -15, y: 10, z: 0 }, d, 100);
  ok(r2.hit); eq(r2.point.y, w.heightAt(r2.point.x, r2.point.z), 0.02, 'slanted ray lands on the surface');
});
test('heightfield normals stay valid at the field edge', () => {
  const w = new World(); const h = new Float32Array(11 * 11); for (let i = 0; i < h.length; i++) h[i] = (i % 11) * 0.1;
  w.setGround({ minX: 0, maxX: 10, minZ: 0, maxZ: 10, res: 1, heights: h }); w.build();
  for (const [x, z] of [[0, 0], [10, 10], [9.9, 5], [5, 9.95], [0.01, 0.01]]) {
    const g = w.groundAt(x, z, 10, 0.3); ok(g && Number.isFinite(g.nx + g.ny + g.nz) && g.ny > 0.9, 'normal at ' + x + ',' + z + ': ' + JSON.stringify(g));
  }
});
test('segmentClear and skipGlass', () => {
  const w = new World(); w.addBox({ cx: 0, cy: 1, cz: 5, hx: 2, hy: 1, hz: 0.02, surf: 'glass' }); w.build();
  ok(!segmentClear(w, 0, 1, 0, 0, 1, 10), 'glass blocks rays');
  ok(segmentClear(w, 0, 1, 0, 0, 1, 10, { skipGlass: true }), 'sight sees through glass');
});

console.log('move');
test('accelerates to max speed and stops with friction', () => {
  const w = floorWorld(); w.build(); const s = player();
  run(w, s, { mz: 1 }, 64);
  eq(s.vel.z, 5.2, 0.05, 'top speed'); ok(s.onGround);
  let t = 0; run(w, s, {}, 64, 5.2, () => { if (Math.hypot(s.vel.x, s.vel.z) > 0.01) t++; });
  ok(t / 64 < 0.45, 'stops in under .45 s (' + (t / 64).toFixed(2) + ')');
  const s2 = player(); run(w, s2, { mz: 1, buttons: BTN.WALK }, 64); eq(s2.vel.z, 5.2 * MOVE.walkMul, 0.05, 'walk speed');
  const s3 = player(); run(w, s3, { mz: 1, buttons: BTN.CROUCH }, 90); eq(s3.vel.z, 5.2 * MOVE.crouchMul, 0.05, 'crouch speed');
  const s4 = player(); run(w, s4, { mz: 1, mx: 1 }, 64); eq(Math.hypot(s4.vel.x, s4.vel.z), 5.2, 0.05, 'diagonal is not faster');
});
test('walls block and the player slides along them', () => {
  const w = floorWorld(); w.addBox({ cx: 0, cy: 1.5, cz: 3, hx: 10, hy: 1.5, hz: 0.1 }); w.build();
  const s = player(); run(w, s, { mz: 1 }, 120);
  eq(s.pos.z, 2.9 - R, 1e-3, 'stops at the wall face'); eq(s.pos.x, 0, 1e-6, 'no drift');
  const s2 = player(0, 0, 0, Math.PI / 4); run(w, s2, { mz: 1 }, 128);
  eq(s2.pos.z, 2.9 - R, 1e-3, 'still at the wall'); ok(s2.pos.x > 3, 'slid along the wall (x ' + s2.pos.x.toFixed(2) + ')');
});
test('inside corners hold', () => {
  const w = floorWorld();
  w.addBox({ cx: 0, cy: 1.5, cz: 3, hx: 5, hy: 1.5, hz: 0.1 });
  w.addBox({ cx: 3, cy: 1.5, cz: 0, hx: 0.1, hy: 1.5, hz: 5 }); w.build();
  const s = player(0, 0, 0, Math.PI / 4); run(w, s, { mz: 1 }, 200);
  eq(s.pos.z, 2.9 - R, 2e-3, 'z'); eq(s.pos.x, 2.9 - R, 2e-3, 'x');
});
test('45 degree wall slides and never tunnels', () => {
  const w = floorWorld(); w.addBox({ cx: 0, cy: 1.5, cz: 4, hx: 50, hy: 1.5, hz: 0.05, ry: Math.PI / 4 }); w.build();
  const s = player(); run(w, s, { mz: 1 }, 200, 9);
  // signed distance to the wall line (normal of local z rotated by 45 degrees = (sin, cos))
  const d = (s.pos.x - 0) * Math.SQRT1_2 + (s.pos.z - 4) * Math.SQRT1_2;
  ok(d < -0.05 - R + 1e-3, 'stays on its side (d ' + d.toFixed(3) + ')');
});
test('step up onto low things, blocked by high ones', () => {
  const w = floorWorld(); w.addBox({ cx: 0, cy: 0.15, cz: 8, hx: 2, hy: 0.15, hz: 6 }); w.addBox({ cx: 6, cy: 0.3, cz: 8, hx: 2, hy: 0.3, hz: 6 }); w.build();
  const s = player(); run(w, s, { mz: 1 }, 80); eq(s.pos.y, 0.3, 1e-6, 'stepped onto .3'); ok(s.onGround);
  const s2 = player(6, 0, 0); run(w, s2, { mz: 1 }, 80); eq(s2.pos.y, 0, 1e-6, 'not onto .6'); eq(s2.pos.z, 2 - R, 1e-3, 'blocked');
  let ups = 0; const s3 = player(0, 0, 0); run(w, s3, { mz: 1 }, 40, 5.2, (i, e) => { if (e.stepUp > 0) ups++; }); ok(ups === 1, 'one step-up event');
});
test('stairs (ramp collider) up and down without leaving the ground', () => {
  const w = floorWorld();
  w.addRamp({ cx: 0, cz: 5, hx: 1, hz: 2.5, y0: 0, y1: 3, axis: 'z' });     // 31 degrees, like stairs
  w.addBox({ cx: 0, cy: 2.9, cz: 20, hx: 3, hy: 0.1, hz: 12.5 }); w.build();     // landing at y 3
  const s = player(0, 0, 0); run(w, s, { mz: 1 }, 220);
  eq(s.pos.y, 3, 1e-3, 'reached the landing'); ok(s.pos.z > 8);
  s.pos.z = 9;
  s.yaw = Math.PI; let air = 0;
  run(w, s, { mz: 1 }, 220, 5.2, () => { if (!s.onGround) air++; });
  eq(s.pos.y, 0, 1e-3, 'back down'); ok(air === 0, 'ground snap kept the feet on the stairs (' + air + ' airborne ticks)');
});
test('steep slopes are not walkable', () => {
  const w = floorWorld(); w.addRamp({ cx: 0, cz: 5, hx: 1, hz: 1, y0: 0, y1: 3, axis: 'z' }); w.build();   // 56 degrees
  const s = player(); run(w, s, { mz: 1 }, 200); ok(s.pos.y < 0.6, 'did not climb (y ' + s.pos.y.toFixed(2) + ')');
});
test('jump height, landing and fall damage', () => {
  const w = floorWorld(); w.build(); const s = player();
  let top = 0; const ev = run(w, s, i => ({ buttons: i === 0 ? BTN.JUMP : 0 }), 80, 5.2, () => { top = Math.max(top, s.pos.y); });
  ok(ev[0].jumped, 'jumped'); eq(top, MOVE.jumpV * MOVE.jumpV / (2 * MOVE.gravity), 0.04, 'apex');
  ok(ev.some(e => e.landed > 3), 'landed event'); ok(s.onGround);
  const s2 = player(); run(w, s2, { buttons: BTN.JUMP }, 120); const jumps = 1;
  ok(jumps === 1 && s2.onGround, 'holding jump does not bunny hop');
  eq(fallDamage(5), 0, 0); ok(fallDamage(Math.sqrt(2 * 15 * 6)) > 30 && fallDamage(Math.sqrt(2 * 15 * 10)) >= 100, 'fall damage curve');
});
test('drop off a ledge onto the floor', () => {
  const w = floorWorld(); w.addBox({ cx: 0, cy: 1.5, cz: 0, hx: 2, hy: 1.5, hz: 2 }); w.build();
  const s = player(0, 3, 0); let landed = 0;
  run(w, s, { mz: 1 }, 120, 5.2, (i, e) => { if (e.landed) landed = e.landed; });
  eq(s.pos.y, 0, 1e-6, 'on the floor'); ok(landed > 7, 'landing speed ' + landed.toFixed(1));
});
test('ceilings: crouch under, cannot stand, jump bonks', () => {
  const w = floorWorld(); w.addBox({ cx: 0, cy: 1.5, cz: 5, hx: 3, hy: 0.1, hz: 2 }); w.build();   // underside at 1.4
  const s = player(); run(w, s, { mz: 1 }, 80);
  ok(s.pos.z < 3 - R + 1e-3, 'standing: blocked by the low ceiling edge');
  run(w, s, { mz: 1, buttons: BTN.CROUCH }, 90); ok(s.pos.z > 4, 'crouched: walks under (z ' + s.pos.z.toFixed(2) + ')');
  run(w, s, {}, 40); const hh = MOVE.height - (MOVE.height - MOVE.crouchHeight) * s.crouch;
  ok(s.crouch > 0.5 && hh <= 1.4 + 1e-3, 'cannot stand up under it (height ' + hh.toFixed(3) + ')'); eq(s.pos.y, 0, 1e-6);
  const w2 = floorWorld(); w2.addBox({ cx: 0, cy: 2.3, cz: 0, hx: 3, hy: 0.1, hz: 3 }); w2.build();   // underside 2.2
  const s2 = player(); let top = 0; run(w2, s2, i => ({ buttons: i === 0 ? BTN.JUMP : 0 }), 60, 5.2, () => { top = Math.max(top, s2.pos.y); });
  ok(top <= 2.2 - MOVE.height + 1e-3, 'bonked (top ' + top.toFixed(3) + ')');
});
test('mantle onto a 1 m crate', () => {
  const w = floorWorld(); w.addBox({ cx: 0, cy: 0.5, cz: 2, hx: 0.6, hy: 0.5, hz: 0.6 }); w.build();
  const s = player(); let mantled = null;
  run(w, s, i => ({ mz: mantled ? 0 : 1, buttons: i > 20 && i < 60 ? BTN.JUMP : 0 }), 120, 5.2, (i, e) => { if (e.mantled) mantled = e.mantled; });
  ok(mantled === 'mantle', 'mantled'); eq(s.pos.y, 1, 1e-3, 'on top'); ok(s.onGround);
});
test('mantle from standing next to a 1.1 m ledge', () => {
  const w = floorWorld(); w.addBox({ cx: 0, cy: 0.55, cz: 5, hx: 3, hy: 0.55, hz: 3 }); w.build();
  const s = player(0, 0, 2 - R - 0.02);
  run(w, s, i => ({ buttons: i === 2 ? BTN.JUMP : 0 }), 60);
  eq(s.pos.y, 1.1, 1e-3, 'on the ledge'); ok(s.pos.z > 2.1, 'moved onto it');
});
test('vault a thin .9 m wall', () => {
  const w = floorWorld(); w.addBox({ cx: 0, cy: 0.45, cz: 2, hx: 2, hy: 0.45, hz: 0.1 }); w.build();
  const s = player(); let kind = null;
  run(w, s, i => ({ mz: 1, buttons: i > 10 && i < 40 ? BTN.JUMP : 0 }), 160, 5.2, (i, e) => { if (e.mantled) kind = e.mantled; });
  ok(kind === 'vault', 'vaulted (' + kind + ')'); ok(s.pos.z > 2.1 + R, 'on the far side (z ' + s.pos.z.toFixed(2) + ')'); eq(s.pos.y, 0, 1e-3);
});
test('no mantle onto a 1.5 m wall', () => {
  const w = floorWorld(); w.addBox({ cx: 0, cy: 0.75, cz: 2, hx: 2, hy: 0.75, hz: 1 }); w.build();
  const s = player(); run(w, s, i => ({ mz: 1, buttons: i % 30 === 5 && i < 150 ? BTN.JUMP : 0 }), 220);
  eq(s.pos.y, 0, 1e-3, 'still on the floor'); ok(s.pos.z < 1 - R + 1e-3);
});
test('crouch-jump reaches higher than a standing jump', () => {
  const w = floorWorld(); w.build();
  const s = player(); let top = 0;
  run(w, s, i => ({ buttons: (i === 0 ? BTN.JUMP : 0) | (i > 2 ? BTN.CROUCH : 0) }), 50, 5.2, () => { top = Math.max(top, s.pos.y); });
  ok(top > 0.9, 'feet tucked to ' + top.toFixed(2));
});
test('lean is blocked by a wall', () => {
  const w = floorWorld(); w.addBox({ cx: 0.55, cy: 1.5, cz: 0, hx: 0.1, hy: 1.5, hz: 3 }); w.build();   // wall .45 to the right
  const s = player(); run(w, s, { buttons: BTN.LEANR }, 40);
  ok(s.lean > 0.1 && s.lean < 0.9, 'partial lean (' + s.lean.toFixed(2) + ')');
  const e = eyePos(s); ok(e.x + MOVE.headR <= 0.45 + 1e-3, 'head stays out of the wall (' + e.x.toFixed(3) + ')');
  run(w, s, { buttons: BTN.LEANL }, 40); eq(s.lean, -1, 1e-6, 'free lean left');
});
test('footsteps: running is loud, walking and crouching are silent', () => {
  const w = floorWorld(); w.build();
  const cnt = (btn) => { const s = player(); return run(w, s, { mz: 1, buttons: btn }, 192).filter(e => e.footstep).length; };
  const runN = cnt(0), walkN = cnt(BTN.WALK), crouchN = cnt(BTN.CROUCH);
  ok(runN >= 8 && runN <= 12, 'running steps in 3 s: ' + runN); ok(walkN === 0, 'walk ' + walkN); ok(crouchN === 0, 'crouch ' + crouchN);
});
test('tagged and applySlow slow the player down', () => {
  const w = floorWorld(); w.build(); const s = player(); run(w, s, { mz: 1 }, 64);
  s.tagged = MOVE.tagTime; run(w, s, { mz: 1 }, 6); ok(s.vel.z < 4.2, 'tagged slow ' + s.vel.z.toFixed(2));
  const s2 = player(); applySlow(s2, 'molotov', 0.5, 1.5); run(w, s2, { mz: 1 }, 80); eq(s2.vel.z, 2.6, 0.08, 'slow');
  run(w, s2, { mz: 1 }, 64); eq(s2.vel.z, 5.2, 0.08, 'slow expired');
});
test('heightfield: walk up a gentle hill, stopped by a cliff', () => {
  const w = new World(); const nx = 61, nz = 61, h = new Float32Array(nx * nz);
  const fn = (x, z) => (z > 10 ? Math.min(12, (z - 10) * 3) : Math.max(0, z) * 0.25);   // 14 degrees, then 72 degrees
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) h[j * nx + i] = fn(-30 + i, -30 + j);
  w.setGround({ minX: -30, maxX: 30, minZ: -30, maxZ: 30, res: 1, heights: h, surf: 'grass' }); w.build();
  const s = player(0, 0, -2); run(w, s, { mz: 1 }, 300);
  ok(s.pos.z > 9 && s.pos.z < 11.2, 'stopped at the cliff (z ' + s.pos.z.toFixed(2) + ')'); ok(Math.abs(s.pos.y - w.heightAt(s.pos.x, s.pos.z)) < 0.35, 'on the ground');
});
test('players block each other (bodies)', () => {
  const w = floorWorld(); w.build(); const s = player();
  for (let i = 0; i < 100; i++) moveStep(w, s, { yaw: 0, mz: 1, buttons: 0 }, DT, 5.2, { bodies: [{ x: 0, y: 0, z: 2, r: R, h: 1.8 }] });
  eq(s.pos.z, 2 - 2 * R, 2e-3, 'stops at the other player');
});
test('a player spawned overlapping a wall is pushed out', () => {
  const w = floorWorld(); w.addBox({ cx: 0, cy: 1.5, cz: 0.4, hx: 3, hy: 1.5, hz: 0.1 }); w.build();
  const s = player(); run(w, s, {}, 4); ok(s.pos.z <= 0.3 - R + 1e-3, 'pushed out (z ' + s.pos.z.toFixed(3) + ')');
});


console.log('navgrid');
// a 40 x 40 m yard with a closed room (one door), a lobby with a gate, a platform with stairs, a 1 m box and a low ceiling
function navWorld() {
  const w = new World();
  w.addBox({ cx: 0, cy: -0.1, cz: 0, hx: 20, hy: 0.1, hz: 20 });
  const wall = (cx, cz, hx, hz, h = 3) => w.addBox({ cx, cy: h / 2, cz, hx, hy: h / 2, hz });
  // room x -10..-2, z -4..4 with a 1.2 m door in its east wall at z 0
  wall(-6, -4, 4, 0.1); wall(-6, 4, 4, 0.1); wall(-10, 0, 0.1, 4);
  wall(-2, -2.3, 0.1, 1.7); wall(-2, 2.3, 0.1, 1.7);
  // lobby x 10..18, z -4..4, gate (collider) in its west wall at z 0
  wall(14, -4, 4, 0.1); wall(14, 4, 4, 0.1); wall(18, 0, 0.1, 4);
  wall(10, -2.3, 0.1, 1.7); wall(10, 2.3, 0.1, 1.7);
  const gate = w.addBox({ cx: 10, cy: 1.4, cz: 0, hx: 0.12, hy: 1.45, hz: 0.65, tag: 'gate' });
  // platform at y 3 (x -10..-2, z 10..18) with stairs climbing +z from z 4.6 to 10
  w.addBox({ cx: -6, cy: 1.5, cz: 14, hx: 4, hy: 1.5, hz: 4 });
  w.addRamp({ cx: -3, cz: 7.3, hx: 0.7, hz: 2.7, y0: 0, y1: 3, axis: 'z' });
  // a 1 m box and a low roof (crouch only underneath)
  w.addBox({ cx: 6, cy: 0.5, cz: 12, hx: 1, hy: 0.5, hz: 1 });
  w.addBox({ cx: 5, cy: 1.45, cz: -12, hx: 2, hy: 0.05, hz: 2 });
  w.build();
  const nav = buildNav(w, { minX: -20, maxX: 20, minZ: -20, maxZ: 20, minY: -2, maxY: 10 }, { gates: [{ id: gate }] });
  return { w, nav, gate };
}
const NW = navWorld();
test('nodes, levels and timing', () => {
  const s = NW.nav.stats; ok(s.nodes > 5000, 'nodes ' + s.nodes); ok(s.levels >= 2, 'levels ' + s.levels);
  console.log('       ' + s.nodes + ' nodes, ' + s.ms + ' ms (spans ' + s.msSpans + ', nodes ' + s.msNodes + ', links ' + s.msLinks + '), ' + s.specialLinks + ' drop/mantle links');
});
test('path into a closed room goes through its door, and string pulling straightens it', () => {
  const p = NW.nav.findPath({ x: -6, y: 0, z: 0 }, { x: 4, y: 0, z: 0 });
  ok(p && p.length >= 2, 'found');
  ok(p.some(q => Math.abs(q.x + 2) < 1.2 && Math.abs(q.z) < 0.7) || NW.nav.walkLine(p[0], p[p.length - 1]), 'through the door');
  const raw = NW.nav.findPath({ x: -6, y: 0, z: -3 }, { x: 4, y: 0, z: 6 }, { smooth: false }), sm = NW.nav.findPath({ x: -6, y: 0, z: -3 }, { x: 4, y: 0, z: 6 });
  ok(sm.length < raw.length / 4, 'smoothed ' + raw.length + ' -> ' + sm.length);
  ok(!NW.nav.walkLine({ x: -6, y: 0, z: -3 }, { x: 4, y: 0, z: -3 }), 'cannot walk straight through the wall');
  for (let i = 1; i < sm.length; i++) ok(NW.nav.walkLine(sm[i - 1], sm[i]), 'every smoothed leg is walkable');
});
test('a lobby gate seals it until it opens', () => {
  const n = NW.nav, inside = n.nearest(14, 0, 0), out = n.nearest(0, 0, 0);
  ok(inside >= 0 && out >= 0);
  ok(!n.reachable(inside, out, false), 'sealed with the gate closed');
  ok(n.reachable(inside, out, true), 'open');
  n.setGate(NW.gate, false); ok(n.findPath(inside, out) === null, 'A* respects the closed gate');
  n.setGate(NW.gate, true); ok(n.findPath(inside, out) !== null, 'A* after opening');
});
test('stairs, drop and mantle links', () => {
  const n = NW.nav;
  const up = n.findPath({ x: 0, y: 0, z: 0 }, { x: -7, y: 3, z: 15 });
  ok(up && Math.abs(up[up.length - 1].y - 3) < 0.05, 'reaches the platform');
  const top = n.nearest(-3.5, 3, 11.5), below = n.nearest(-3.5, 0, 19.2);
  ok(top >= 0 && below >= 0);
  const down = n.findPath(n.nearest(-8, 3, 17), n.nearest(-8, 0, 19.3));
  ok(down && down.length < 12 && down.some(q => q.link === 'drop'), 'drops off the platform edge (' + (down && down.length) + ' points)');
  const onBox = n.nearest(6, 1, 12), floor = n.nearest(6, 0, 9);
  const m = n.findPath(floor, onBox);
  ok(m && m.some(q => q.link === 'mantle'), 'mantles onto the 1 m box');
});
test('crouch-only nodes under a low roof, nearest prefers the floor below', () => {
  const n = NW.nav, c = n.nearest(5, 0, -12);
  ok(c >= 0 && n.isCrouchOnly(c), 'crouch only');
  const p = n.nodePos(n.nearest(-6, 3.2, 14)); eq(p.y, 3, 1e-3, 'on the platform');
  const q = n.nodePos(n.nearest(-6, 0.1, 14, 3)); ok(Math.abs(q.y) < 1e-3 || q.y === 3, 'some node');
});
test('LOS: walls block, smoke volumes block', () => {
  const n = NW.nav;
  ok(n.losClear({ x: 0, y: 1.6, z: -8 }, { x: 0, y: 1.6, z: 8 }), 'open yard');
  ok(n.losBlocked({ x: -6, y: 1.6, z: 0 }, { x: -6, y: 1.6, z: 8 }), 'room wall');
  const off = n.addBlocker({ x: 0, y: 1.6, z: 0, r: 2 });
  ok(n.losBlocked({ x: 0, y: 1.6, z: -8 }, { x: 0, y: 1.6, z: 8 }), 'smoke');
  off(); ok(n.losClear({ x: 0, y: 1.6, z: -8 }, { x: 0, y: 1.6, z: 8 }), 'smoke gone');
});

console.log('performance');
test('BVH queries and raycasts are fast on a 3000-box world', () => {
  const w = floorWorld(200);
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 3000; i++) w.addBox({ cx: rnd() * 300 - 150, cy: rnd() * 6, cz: rnd() * 300 - 150, hx: 0.2 + rnd() * 3, hy: 0.2 + rnd() * 2, hz: 0.2 + rnd() * 3, ry: rnd() < 0.3 ? rnd() * 3 : 0 });
  let t = performance.now(); w.build(); const tb = performance.now() - t;
  t = performance.now(); let hits = 0;
  const o = { x: 0, y: 0, z: 0 }, d = { x: 0, y: 0, z: 0 }, out = { point: {}, normal: {} };
  for (let i = 0; i < 20000; i++) {
    o.x = rnd() * 300 - 150; o.y = 1.6; o.z = rnd() * 300 - 150; const a = rnd() * 6.28, p = (rnd() - 0.5) * 0.4;
    d.x = Math.sin(a) * Math.cos(p); d.y = -Math.sin(p); d.z = Math.cos(a) * Math.cos(p);
    if (raycast(w, o, d, 80, { out }).hit) hits++;
  }
  const tr = performance.now() - t;
  const s = player(0, 10, 0); t = performance.now();
  for (let i = 0; i < 5000; i++) { s.yaw = i * 0.01; moveStep(w, s, { yaw: s.yaw, mz: 1, buttons: 0 }, DT, 5.2); }
  const tm = performance.now() - t;
  console.log('       build ' + tb.toFixed(1) + ' ms, 20k rays ' + tr.toFixed(1) + ' ms (' + (tr / 20).toFixed(3) + ' us/ray, ' + hits + ' hits), 5k moveSteps ' + tm.toFixed(1) + ' ms');
  ok(tb < 100 && tr < 1500 && tm < 500, 'too slow');
});

console.log('\n' + pass + ' passed, ' + fail + ' failed' + (fail ? ': ' + fails.join(', ') : ''));
process.exit(fail ? 1 : 0);
