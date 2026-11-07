/* LIVE FIRE — dev_range: a compact TEST map that exercises every MapBuilder feature (it is not one of the 25 shipped maps).
   Two-storey building (stairs, stairwell, rooms with doors and windows), a loading dock with a ramp and a shed, a terrain hill
   (heightfield), crates to mantle, a low wall to vault, an open-ended container, a rotated wall, pillars, thin-instanced
   barrels, both team lobbies with roller-shutter gates, lobby / field / FFA spawns, sites A and B, hostages + rescue,
   dom1-3, hp1-5, hill, flag1/flag2, extract1, hides and a few lights (one flickering).
   Exports: default MapDef */

const FLOOR = 0.12;            // interior floors sit 12 cm above the yard (door thresholds)
const UP = FLOOR + 3.2;        // second storey
const hill = (x, z) => { const d = Math.hypot(x - 30, z - 22); return d < 11 ? 3.2 * 0.5 * (1 + Math.cos(Math.PI * d / 11)) : 0; };

export default {
  id: 'dev_range', name: 'Dev Range', desc: 'Test range for engine, physics, navigation and map tools.', size: 'S',
  env: { sky: 'overcast', time: 'day', exposure: 1, sun: { dir: [-0.45, -1, -0.3], color: [1, 0.96, 0.9], intensity: 2.6 },
    ambient: [0.55, 0.58, 0.62], fog: { color: [0.68, 0.71, 0.75], density: 0.004 }, weather: 'clear', ambience: 'industrial', reverb: 'outdoor' },
  bounds: { minX: -44, maxX: 44, minZ: -32, maxZ: 32, minY: -2, maxY: 16 },

  build(B) {
    // ------------------------------------------------------------------ ground + perimeter
    B.ground({ minX: -44, maxX: 44, minZ: -32, maxZ: 32, res: 2, mat: 'gravel', height: hill });
    B.floor(-30, -28, 30, -26, 0.02, { mat: 'asphalt', t: 0.1, collide: false });          // a road strip (decal-like slab)
    const per = { h: 3.5, t: 0.4, mat: 'concrete', mat2: 'concrete' };
    B.wall(-44, -31.8, 44, -31.8, per); B.wall(-44, 31.8, 44, 31.8, per);
    B.wall(-43.8, -31.6, -43.8, 31.6, per); B.wall(43.8, -31.6, 43.8, 31.6, per);

    // ------------------------------------------------------------------ team lobbies (sealed rooms, a gate each)
    for (const t of [1, 2]) {
      const s = t === 1 ? -1 : 1, cx = 37 * s;
      B.room({ x: cx, z: 0, w: 10, d: 12, y: FLOOR, h: 3.2, wall: 'concrete', outer: 'concrete_dark', floor: 'concrete_floor', ceil: 'concrete',
        doors: t === 1 ? { e: [{ at: 6, w: 2.6, h: 2.6, frame: false }] } : { w: [{ at: 6, w: 2.6, h: 2.6, frame: false }] } });
      B.lobby(t, { x0: cx - 5, z0: -6, x1: cx + 5, z1: 6, y: FLOOR }, [{ x: cx - 4.9 * s, z: 0, w: 2.6, h: 2.6, ry: Math.PI / 2 }]);
      for (let i = 0; i < 5; i++) for (let j = 0; j < 3; j++) B.spawn(t, cx + s * (3 - i * 1.5), FLOOR, (j - 1) * 3, s < 0 ? Math.PI / 2 : -Math.PI / 2);
      B.light({ x: cx, y: FLOOR + 3.2, z: -2.6, intensity: 9, fixture: 'tube' });
      B.light({ x: cx, y: FLOOR + 3.2, z: 2.6, intensity: 9, fixture: 'tube' });
      B.box(cx + s * 4.2, FLOOR, 5.2, 1.2, 0.9, 0.8, { mat: 'metal_painted' });            // a locker bench
    }
    B.hide(-30.5, null, 7.5, { kind: 'dark' });

    // ------------------------------------------------------------------ central two-storey building
    // (outer walls reach the upper slab's top and sit under the upper walls; interior walls stop inside the slab: no z-fighting)
    B.room({ x: 0, z: 0, w: 20, d: 16, y: FLOOR, h: 3.2, wall: 'plaster', outer: 'brick', floor: 'tile_floor',
      doors: { w: [4, 12], e: [4, 12], n: [17], s: [5] },
      windows: { n: [{ at: 13, w: 1.6 }], s: [{ at: 15, w: 1.6, glass: true }], e: [{ at: 8, w: 1.4 }] } });
    // interior walls: an east-west wall with two doors, a north-south wall splitting the south half
    B.wall(-9.8, 1, 9.8, 1, { y: FLOOR, h: 3.1, mat: 'plaster', openings: [{ at: 3.8, w: 1.1, h: 2.2, frame: 'wood_dark' }, { at: 13.8, w: 1.1, h: 2.2, frame: 'wood_dark' }] });
    B.wall(0, -7.8, 0, 0.9, { y: FLOOR, h: 3.1, mat: 'plaster_white', mat2: 'plaster', openings: [{ at: 4, w: 1.1, h: 2.2, frame: 'wood_dark' }] });
    // stairs along the north wall, climbing east, and the second floor slab around the stairwell
    B.stairs({ x: -5.2, z: 6.6, w: 1.4, len: 5.6, y0: FLOOR, y1: UP, dir: '+x', mat: 'concrete', tread: 'concrete_dark', rail: 'right' });
    const slab = { mat: 'wood_floor', mats: { b: 'plaster_white' } };
    B.floor(-9.9, -7.9, 9.9, 5.8, UP, slab);
    B.floor(-9.9, 5.8, -6.2, 7.9, UP, slab);
    B.floor(-2.4, 5.8, 9.9, 7.9, UP, slab);
    B.box(-4.3, UP, 5.83, 3.8, 1.0, 0.06, { mat: 'steel_dark' });                          // stairwell railing
    B.box(-6.23, UP, 6.85, 0.06, 1.0, 2.0, { mat: 'steel_dark' });
    B.room({ x: 0, z: 0, w: 20, d: 16, y: UP, h: 3, wall: 'plaster_white', outer: 'brick', ceil: 'plaster_white', roof: 'concrete_dark',
      windows: { n: [{ at: 12 }, { at: 17 }], s: [{ at: 4 }, { at: 10 }, { at: 16 }], w: [{ at: 4 }, { at: 11.5 }], e: [{ at: 4 }, { at: 12 }] } });
    B.wall(2, -7.8, 2, 3.2, { y: UP, h: 3, mat: 'plaster_white', openings: [{ at: 7, w: 1.1, h: 2.2, frame: 'wood_dark' }] });
    B.box(-8.5, UP, -6.4, 2.2, 0.75, 1.0, { mat: 'wood_dark' });                            // a desk upstairs
    B.box(7.6, FLOOR, -6.7, 3.0, 0.95, 0.7, { mat: 'wood_dark' });                          // counter downstairs
    for (const [x, y, z] of [[-5, UP - 0.2, -4], [5, UP - 0.2, -4], [-1, UP - 0.2, 4.4], [6, UP - 0.2, 4.4], [-5, UP + 3, -1], [6, UP + 3, -1]])   // y = ceiling
      B.light({ x, y, z, intensity: 7, color: [1, 0.86, 0.68], fixture: 'panel' });
    B.hostage(-5, FLOOR, -4); B.hostage(5.5, FLOOR, -5); B.hostage(5, FLOOR, 4.5); B.hostage(6, UP, -3);
    B.hide(-9.1, FLOOR, -7.1, { kind: 'dark' }); B.hide(9.1, FLOOR, -5.4, { kind: 'dark' }); B.hide(-9.1, FLOOR, 2, { kind: 'dark' });
    B.hide(-9, UP, -2.5, { kind: 'dark' });

    // ------------------------------------------------------------------ loading dock (ramp, platform, shed) = site A
    B.box(19, 0, -22, 10, 1.2, 8, { mat: 'concrete', mats: { t: 'concrete_floor' } });
    B.ramp({ x: 19, z: -16, w: 3, len: 4, y0: 0, y1: 1.2, dir: '-z', mat: 'concrete_dark' });
    B.box(16.3, 1.2, -18.1, 0.06, 1.0, 0.06, { mat: 'hazard' }); B.box(21.7, 1.2, -18.1, 0.06, 1.0, 0.06, { mat: 'hazard' });
    B.room({ x: 21, z: -23, w: 5, d: 5, y: 1.2, h: 2.8, wall: 'corrugated', outer: 'corrugated', ceil: 'corrugated', doors: { n: [2.5] }, frames: 'steel_dark' });
    B.cyl(15.4, 1.2, -21.6, 0.06, 3.5, { mat: 'steel_dark', sides: 8 });                     // lamp post + arm
    B.box(15.75, 4.6, -21.6, 0.8, 0.06, 0.06, { mat: 'steel_dark', collide: false });
    B.light({ type: 'spot', x: 16.1, y: 4.65, z: -21.6, dir: [0.2, -1, 0.1], angle: 1.2, intensity: 30, color: [1, 0.95, 0.85] });
    B.light({ x: 21, y: 4.0, z: -23.5, intensity: 5, flicker: 0.5, fixture: 'tube', color: [0.85, 0.95, 1] });
    for (let i = 0; i < 3; i++) B.box(14.8 + i * 1.3, 1.2, -25.3, 1.2, 1.0, 1.2, { mat: 'plywood' });
    B.site('A', { x0: 13, z0: -27, x1: 25, z1: -14, y: 1.2 });
    B.hide(22.6, 1.2, -24.6, { kind: 'closet' });
    B.hide(14.6, 1.2, -24.2, { kind: 'crates' });

    // ------------------------------------------------------------------ north-west yard = site B (crates to mantle)
    const crate = (x, y, z, s = 1.2, h = 1.0, ry = 0) => B.box(x, y, z, s, h, s, { mat: 'plywood', ry });
    crate(-20, 0, 16); crate(-18.7, 0, 16); crate(-20, 1.0, 16, 1.2, 1.0);   // a 2-high stack
    crate(-22.5, 0, 20.5, 1.4, 1.1); crate(-16, 0, 21, 1.2, 1.0, 0.5);       // a 1.1 m crate and a turned one
    B.box(-25, 0, 13, 2.2, 0.55, 1.1, { mat: 'metal_rust' });                // low step-up cart
    B.site('B', { x0: -26, z0: 12, x1: -14, z1: 24 });
    B.hide(-20, 0, 17.4, { kind: 'crates' }); B.hide(-23.6, 0, 21.9, { kind: 'crates' });

    // ------------------------------------------------------------------ mid: vault wall, rotated wall, container, pillars, barrels
    B.box(-3, 0, -12, 6, 0.9, 0.2, { mat: 'concrete' });                      // .9 m wall to vault
    B.hide(-3, 0, -12.8, { kind: 'crates' });
    B.wall(10, 14, 16, 18, { h: 2.6, t: 0.25, mat: 'brick_red' });            // a wall at an angle (rotated boxes)
    // open-ended container (2.4 x 2.6 x 6 m)
    B.box(0, 0, 20, 2.4, 0.1, 6, { mat: 'steel_dark' });
    B.box(-1.175, 0.1, 20, 0.05, 2.5, 6, { mat: 'corrugated_rust' }); B.box(1.175, 0.1, 20, 0.05, 2.5, 6, { mat: 'corrugated_rust' });
    B.box(0, 0.1, 22.975, 2.3, 2.5, 0.05, { mat: 'corrugated_rust' }); B.box(0, 2.6, 20, 2.4, 0.06, 6, { mat: 'corrugated_rust' });
    B.hide(0, 0.1, 21.8, { kind: 'crates' });
    B.cyl(-14, 0, -4, 0.35, 4, { mat: 'concrete' }); B.cyl(-14, 0, 4, 0.35, 4, { mat: 'concrete' });
    const barrel = () => {
      const m = BABYLON.MeshBuilder.CreateCylinder('barrel', { diameter: 0.58, height: 0.88, tessellation: 14 }, B.scene);
      m.position.y = 0.44; m.material = B.mat('paint_blue'); return m;
    };
    for (const [x, z] of [[12, -8], [12.7, -8.2], [12.3, -7.4], [-12, 10], [-12.6, 10.4], [26, 8]]) B.instance('barrel', barrel, x, 0, z, { ry: x * 0.7 });
    B.prop('crate', 24, 0, 9, { ry: 0.4 });

    // ------------------------------------------------------------------ terrain hill (NE)
    B.point('hill', 30, null, 22, 4);
    B.hide(34, null, 27, { kind: 'grass' });

    // ------------------------------------------------------------------ objectives
    B.rescue({ x0: -30, z0: 8, x1: -25, z1: 13 });
    B.point('dom1', -20, null, 0, 3); B.point('dom2', 0, null, 14, 3); B.point('dom3', 20, null, -4, 3);
    B.point('hp1', -14, null, -20, 4); B.point('hp2', 14, null, 14, 4); B.point('hp3', 0, null, -20, 4); B.point('hp4', -8, null, 23, 4); B.point('hp5', 24, null, 4, 4);
    B.point('flag1', -28, null, 0, 1.5); B.point('flag2', 28, null, 0, 1.5);
    B.point('extract1', 0, null, -27, 3);
    B.point('hq1', 0, UP, 3.5, 3);

    // ------------------------------------------------------------------ field (respawn) spawns: each team's half
    for (const [x, z, yaw] of [[-28, -12, 1.2], [-24, -24, 0.8], [-16, -26, 0.4], [-28, 16, 2], [-16, 6, 1.6], [-14, -9, 1.6], [-24, 27, 2.4], [-12, 27, 2.6], [-21, -3, 1.6]])
      B.spawn(1, x, null, z, yaw, { field: true });
    for (const [x, z, yaw] of [[28, -12, -1.2], [28, -27, -0.8], [13, -12, -1.6], [28, 12, -2], [16, 6, -1.6], [14, -2, -1.6], [24, 27, -2.4], [12, 26, -2.6], [20, -1, -1.6]])
      B.spawn(2, x, null, z, yaw, { field: true });
    // FFA spawns over the whole map
    for (const [x, y, z] of [[-36, null, -24], [-36, null, 24], [36, null, -24], [37, null, 26], [-20, null, -14], [20, null, 14], [0, null, -16], [0, null, 27],
      [-5, FLOOR, 5], [7, FLOOR, -5.5], [-7, FLOOR, -5], [-6, UP, 0], [14, null, -6], [-14, null, 1], [-26, null, -28], [26, null, -29], [-30, null, 28], [30, null, -8]])
      B.spawn(0, x, y, z, Math.atan2(-x, -z));
  },
};
