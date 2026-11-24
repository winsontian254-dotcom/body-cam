// Characters test (js/chars/*): boots a TDM on dev_range with 15 bots, pauses the simulation and poses the soldiers by hand through
// window.LF (the 'bodies' system: setLook, timeScale, debug.cam, showHitboxes), then checks and photographs:
//   lineup     all six variants of both teams (front + back), close-up of the head gear
//   strips     walk / run / crouch-walk / strafe / backpedal cycles (8 phases side by side), turning in place
//   poses      crouch, lean L/R, aim up / down, reload, grenade cook, plant, knife, pistol, jump
//   hitboxes   the hitbox.js overlay on every pose + a numeric fit (visual joints inside their capsules)
//   gait       foot sliding: a planted foot must not move while the body walks / runs at a steady speed
//   ragdoll    deaths on the stairs and against a wall: settles, stays above the floor, no NaN
//   perf       16 characters in view: draw calls, instances, CPU time of the bodies system
//   view       the local view of team-mates (name tags, rim) and enemies, third-person muzzle flash
//   maps       real maps (--maps=harbor,tower): 20 s of bot play, joints finite, feet on the floors, a screenshot
// FAILS on any console error.   node tools/test/chars.mjs [--only=lineup,strips,...]     screenshots -> tools/test/out/chars-*.png
import { launch, startServer, shot as shot0 } from './lib.mjs';
import { openPage } from './smoke.mjs';
import { newAnim, newPose, animate } from '../../js/chars/anim.js';
import { updateGait } from '../../js/game/player.js';
import { poseShapes } from '../../js/game/hitbox.js';

const arg = (k, d) => { const a = process.argv.find(s => s.startsWith('--' + k + '=')); return a ? a.split('=')[1] : d; };
const ONLY = arg('only', '') ? new Set(arg('only', '').split(',')) : null;
const want = k => !ONLY || ONLY.has(k);
const fails = [];
const shot = (page, name) => shot0(page, name, { timeout: 240000 });   // the shared machine can be very slow
const check = (cond, msg) => { if (!cond) { fails.push(msg); console.log('  FAIL ' + msg); } else console.log('  ok   ' + msg); };
const frames = async (page, n = 3) => { const f0 = await page.evaluate(() => LF.loop.loopStats.frames); await page.waitForFunction(k => LF.loop.loopStats.frames >= k, f0 + n, { timeout: 240000, polling: 50 }); };

// ------------------------------------------------------------------------------------------------ in-page helpers
const HELPERS = () => {
  const TAU = Math.PI * 2;
  window.C = {
    get g() { return LF.game; }, get B() { return LF.game.bodies; },
    setup() {
      const g = LF.game; LF.loop.setPaused(true);
      document.getElementById('hud').style.visibility = 'hidden';
      if (g.viewmodel && g.viewmodel.holder) g.viewmodel.holder.setEnabled(false);
      this.B.thirdPersonOverride = true;
      this.P = [...g.players.values()];
      for (const p of this.P) { p.alive = false; }
      this.B.timeScale = 1;
    },
    hideAll() { for (const p of this.P) p.alive = false; },
    ground(x, z) { const r = LF.game.world.groundAt(x, z, 30, 0.3); return r ? r.y : 0; },
    place(p, x, z, yaw, o = {}) {
      const y = o.y != null ? o.y : this.ground(x, z);
      p.alive = true; p.hp = 100; p.pos.x = x; p.pos.y = y; p.pos.z = z; p.yaw = yaw; p.pitch = o.pitch || 0; p.crouch = o.crouch || 0; p.lean = o.lean || 0;
      p.vel.x = o.vx || 0; p.vel.y = o.vy || 0; p.vel.z = o.vz || 0; p.onGround = o.air ? false : true; p.mantle = null; p.busy = o.action || null;
      p.helmet = o.helmet !== false;
      Object.assign(p.prev, { x, y, z, yaw, pitch: p.pitch, crouch: p.crouch, lean: p.lean });
      if (o.gun) LF.game.giveWeapon(p, o.gun);
      if (o.cur) p.cur = o.cur;
      if (p.ws) { p.ws.state = 'idle'; p.ws.ads = o.ads || 0; p.ws.rl = null; p.ws.ml = null; p.ws.t = 0; p.ws.dur = 0; }
      return p;
    },
    cam(pos, target, fov) { this.B.debug.cam = { pos, target, fov }; },
    // n animation frames; players with velocity advance their gait like the simulation does (updateGait), _move ones also move
    run(n, dt = 1 / 60) { this.B.timeScale = 1; for (let i = 0; i < n; i++) { for (const p of this.P) if (p.alive) { if (p._move) { p.pos.x += p.vel.x * dt; p.pos.z += p.vel.z * dt; p.pos.y = this.ground(p.pos.x, p.pos.z); Object.assign(p.prev, { x: p.pos.x, y: p.pos.y, z: p.pos.z }); } window.__gait(p, dt); } this.B.frame(dt, 1); } },
    freeze() { this.B.timeScale = 0; },
    char(p) { return this.B.list.get(p.id); },
    setPhase(p, ph) { p.gait = ((ph % TAU) + TAU) % TAU; },
  };
};

/** Node (pure JS): the drawn legs (anim.js) driven by the simulation's gait (player.js updateGait) on flat ground: a planted foot must
    not slide, and the drawn hips / knees / ankles must sit on the hitbox.js leg capsules, for every gait. */
function gaitTest() {
  console.log('Gait (Node): foot sliding + legs on the hitboxes');
  for (const [name, sp, cr, dir] of [['walk', 2.6, 0, 0], ['run', 5.2, 0, 0], ['crouch-walk', 1.7, 1, 0], ['strafe', 3.4, 0, Math.PI / 2], ['backpedal', 2.6, 0, Math.PI], ['diagonal run', 4.5, 0, Math.PI / 4], ['back-diagonal', 3, 0, 2.4]]) {
    const p = { pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 }, yaw: 0.3, pitch: 0, crouch: cr, lean: 0, onGround: true, gait: 0, gaitK: 0, gaitS: 0.8, gaitSt: 0.55, gaitH: 0.1, gaitDir: 0 };
    p.vel.x = Math.sin(p.yaw + dir) * sp; p.vel.z = Math.cos(p.yaw + dir) * sp;
    const A = newAnim(7), O = newPose(), dt = 1 / 64;
    const I = { pos: p.pos, vel: p.vel, yaw: p.yaw, pitch: 0, crouch: cr, lean: 0, onGround: true, hold: 'rifle', ground: () => 0 };
    let slide = 0, steps = 0, fit = 0; const track = { R: null, L: null };
    for (let i = 0; i < 64 * 6; i++) {
      p.pos.x += p.vel.x * dt; p.pos.z += p.vel.z * dt; updateGait(p, dt);
      Object.assign(I, { gait: p.gait, gaitK: p.gaitK, gaitS: p.gaitS, gaitSt: p.gaitSt, gaitH: p.gaitH, gaitDir: p.gaitDir });
      animate(A, I, dt, O);
      if (i < 128) continue;
      for (const k of ['R', 'L']) {
        const a = O.joints['an' + k];
        if (a[1] < 0.104) { if (!track[k]) track[k] = [a[0], a[2]]; else slide = Math.max(slide, Math.hypot(a[0] - track[k][0], a[2] - track[k][1])); } else if (track[k]) { track[k] = null; steps++; }
      }
      const S = poseShapes(p), J = O.joints;
      const d = (k, q, end) => { const o = k * 7 + (end ? 3 : 0); return Math.hypot(S[o] - q[0], S[o + 1] - q[1], S[o + 2] - q[2]); };
      fit = Math.max(fit, d(9, J.hipR), d(11, J.hipL), d(9, J.knR, 1), d(11, J.knL, 1), d(10, J.anR, 1), d(12, J.anL, 1));
    }
    check(steps >= 6 && slide < 0.02, name + ' ' + sp + ' m/s: planted foot slides ' + (slide * 100).toFixed(1) + ' cm (' + steps + ' steps)');
    check(fit < 0.045, name + ': drawn hips / knees / ankles within ' + (fit * 100).toFixed(1) + ' cm of the hitbox legs');
  }
}

async function main() {
  const t0 = Date.now();
  if (want('gait')) gaitTest();
  if (ONLY && [...ONLY].every(k => k === 'gait')) { console.log(fails.length ? 'FAILED ' + fails.length : 'PASSED'); process.exit(fails.length ? 1 : 0); }
  const srv = await startServer();
  const browser = await launch();
  try {
    const { ctx, page, errs } = await openPage(browser, srv.url, '#dev&map=dev_range&mode=tdm&bots=15&q=low&autostart&nolens&nodyn&seed=3&freeze=0&botmode=static');
    await page.waitForFunction(() => window.LF && LF.game && LF.game.ready, null, { timeout: 240000, polling: 250 });
    await page.evaluate(HELPERS);
    await page.evaluate(async () => { const h = await import('/js/game/hitbox.js'), pl = await import('/js/game/player.js'); window.__hb = p => h.poseShapes(p); window.__gait = pl.updateGait; });
    const st0 = await page.evaluate(() => { C.setup(); return LF.game.bodies.stats(); });
    check(st0.ok && !st0.fallback, 'characters system ready with the human kit (' + JSON.stringify(st0) + ')');
    // a flat open spot south of the building
    const X0 = -6, Z0 = -18;

    // ===================================================================== line-up
    if (want('lineup')) {
      console.log('Line-up');
      const guns = ['purga', 'warden', 'spatz', 'breachpoint', 'rook', 'varg', 'habicht', 'kroha', 'hachi', 'tempesta', 'longreach', 'jarv'];
      await page.evaluate(({ X0, Z0, guns }) => {
        C.hideAll();
        for (let i = 0; i < 12; i++) { const p = C.P[i + 1], team = i < 6 ? 1 : 2; C.place(p, X0 + (i % 6) * 1.15 - 2.9, Z0 + (i < 6 ? 0 : 2.4), Math.PI, { gun: guns[i] }); C.B.setLook(p, team, i % 6, i); }
        C.run(40); C.freeze();
      }, { X0, Z0, guns });
      await page.evaluate(({ X0, Z0 }) => C.cam([X0, 1.3, Z0 - 5.2], [X0, 1.05, Z0 + 0.8], 0.62), { X0, Z0 }); await frames(page, 3); await shot(page, 'chars-lineup-front');
      await page.evaluate(({ X0, Z0 }) => C.cam([X0 + 2, 1.4, Z0 + 8.5], [X0, 1.0, Z0 + 1], 0.62), { X0, Z0 }); await frames(page, 3); await shot(page, 'chars-lineup-back');
      // close-ups: heads (front 3/4), torso gear
      await page.evaluate(({ X0, Z0 }) => C.cam([X0 - 2.3, 1.72, Z0 - 1.35], [X0 - 2.9, 1.55, Z0], 0.5), { X0, Z0 }); await frames(page, 3); await shot(page, 'chars-closeup-vg');
      await page.evaluate(({ X0, Z0 }) => C.cam([X0 - 1.9, 1.62, Z0 + 1.05], [X0 - 1.75, 1.4, Z0 + 2.4], 0.6), { X0, Z0 }); await frames(page, 3); await shot(page, 'chars-closeup-sn');
      const side = await page.evaluate(({ X0, Z0 }) => C.cam([X0 + 4.5, 1.2, Z0 + 1.2], [X0, 1.0, Z0 + 1.2], 0.55), { X0, Z0 }); void side; await frames(page, 3); await shot(page, 'chars-lineup-side');
      const st = await page.evaluate(() => LF.game.bodies.stats());
      check(st.instances > 12 * 15, '12 soldiers drawn as thin instances (' + st.instances + ' instances, ' + st.draws + ' batches)');
    }

    // ===================================================================== gait strips
    if (want('strips')) {
      console.log('Animation strips');
      const strips = [
        ['walk', { sp: 2.5, crouch: 0, gun: 'purga' }], ['run', { sp: 5.6, crouch: 0, gun: 'spatz' }], ['crouch', { sp: 1.6, crouch: 1, gun: 'purga' }],
        ['strafe', { sp: 3.5, dir: Math.PI / 2, gun: 'warden' }], ['back', { sp: 2.4, dir: Math.PI, gun: 'warden' }], ['pistol', { sp: 3.2, gun: 'vogt9' }],
      ];
      for (const [name, o] of strips) {
        await page.evaluate(({ X0, Z0, o }) => {
          C.hideAll();
          // facing +x (yaw PI/2), side view from -z; movement direction o.dir relative to the facing
          const yaw = Math.PI / 2, md = yaw + (o.dir || 0);
          for (let i = 0; i < 8; i++) { const p = C.P[i + 1]; C.place(p, X0 - 4.9 + i * 1.4, Z0, yaw, { vx: Math.sin(md) * o.sp, vz: Math.cos(md) * o.sp, crouch: o.crouch || 0, gun: o.gun }); C.B.setLook(p, 1 + (i % 2), i % 6, i); }
          C.run(90);
          for (let i = 0; i < 8; i++) C.setPhase(C.P[i + 1], i / 8 * Math.PI * 2);
          C.B.frame(1e-4, 1); C.freeze();
          C.cam([X0, 0.95, Z0 - 7.2], [X0, 0.8, Z0], 0.6);
        }, { X0, Z0, o });
        await frames(page, 3); await shot(page, 'chars-strip-' + name);
      }
      // turning in place: the legs lag, then step round
      const turn = await page.evaluate(({ X0, Z0 }) => {
        C.hideAll(); const p = C.place(C.P[1], X0, Z0, 0, { gun: 'purga' }); C.run(30);
        const c = C.char(p), out = [];
        for (let i = 0; i < 90; i++) { p.yaw = Math.min(1.2, i * 0.04); p.prev.yaw = p.yaw; C.run(1); out.push(+(c.A.legYaw).toFixed(3)); }
        return { leg: out, final: c.A.legYaw };
      }, { X0, Z0 });
      check(turn.leg[8] < 0.25 && Math.abs(turn.final - 1.2) < 0.08, 'turning in place: legs lag (' + turn.leg[8] + ' at 0.32 rad) then step round (' + turn.final.toFixed(2) + ')');
    }

    // ===================================================================== poses + hitbox overlay
    if (want('poses')) {
      console.log('Poses + hitboxes');
      const poses = [
        ['stand', {}], ['crouch', { crouch: 1 }], ['leanL', { lean: -1 }], ['leanR', { lean: 1 }], ['aimUp', { pitch: -1.0 }], ['aimDown', { pitch: 0.9 }],
        ['ads', { ads: 1 }], ['pistol', { gun: 'vogt9' }],
      ];
      const fit = await page.evaluate(({ X0, Z0, poses }) => {
        C.hideAll(); C.B.showHitboxes(false);
        const res = [];
        poses.forEach(([name, o], i) => {
          const p = C.P[i + 1];
          C.place(p, X0 - 4.9 + i * 1.4, Z0, Math.PI * 0.82, { gun: o.gun || 'purga', crouch: o.crouch, lean: o.lean, pitch: o.pitch, ads: o.ads });
          C.B.setLook(p, 1 + (i % 2), i % 6, i);
        });
        C.run(60); C.freeze();
        // numeric fit: every visual joint vs its capsule (distance from the joint to the capsule axis segment minus the radius)
        const tick = LF.game.tick;
        poses.forEach(([name], i) => {
          const p = C.P[i + 1], O = C.B.poseOf(p), S = window.__hb(p, tick);
          const seg = (k, q) => { const o = k * 7, ax = S[o], ay = S[o + 1], az = S[o + 2], bx = S[o + 3] - ax, by = S[o + 4] - ay, bz = S[o + 5] - az;
            const l2 = bx * bx + by * by + bz * bz || 1e-9, t = Math.max(0, Math.min(1, ((q[0] - ax) * bx + (q[1] - ay) * by + (q[2] - az) * bz) / l2));
            return Math.hypot(q[0] - ax - bx * t, q[1] - ay - by * t, q[2] - az - bz * t) - S[o + 6]; };
          const J = O.joints, Bn = O.bones;
          const m = { head: seg(0, Bn.head.o), elR: Math.min(seg(5, J.elR), seg(6, J.elR)), elL: Math.min(seg(7, J.elL), seg(8, J.elL)), wrR: seg(6, J.wrR), wrL: seg(8, J.wrL),
            knR: Math.min(seg(9, J.knR), seg(10, J.knR)), knL: Math.min(seg(11, J.knL), seg(12, J.knL)), anR: Math.min(seg(10, J.anR), seg(13, J.anR)), anL: Math.min(seg(12, J.anL), seg(14, J.anL)),
            chest: seg(2, Bn.chest.o), pelvis: seg(4, Bn.pelvis.o) };
          res.push({ name, worst: Math.max(...Object.values(m)), m: Object.fromEntries(Object.entries(m).map(([k, v]) => [k, +v.toFixed(3)])) });
        });
        return res;
      }, { X0, Z0, poses });
      for (const f of fit) check(f.worst < 0.06, 'pose ' + f.name + ': visual joints within 6 cm of their hitbox capsules (worst ' + f.worst.toFixed(3) + ' ' + JSON.stringify(f.m) + ')');
      await page.evaluate(({ X0, Z0 }) => C.cam([X0 - 1, 1.2, Z0 - 7.4], [X0, 0.95, Z0], 0.62), { X0, Z0 }); await frames(page, 3); await shot(page, 'chars-poses');
      await page.evaluate(() => C.B.showHitboxes(true)); await frames(page, 3); await shot(page, 'chars-poses-hitboxes');
      await page.evaluate(({ X0, Z0 }) => C.cam([X0 + 6.5, 1.2, Z0 - 0.4], [X0, 0.95, Z0], 0.62), { X0, Z0 }); await frames(page, 3); await shot(page, 'chars-poses-hitboxes-side');
      await page.evaluate(() => C.B.showHitboxes(false));
      // actions: reload stages, grenade cook / throw, plant, knife, jump
      await page.evaluate(({ X0, Z0 }) => {
        C.hideAll();
        const mk = (i, o) => { const p = C.P[i + 1]; C.place(p, X0 - 4.9 + i * 1.4, Z0, Math.PI * 0.75, o); C.B.setLook(p, 1 + (i % 2), (i + 2) % 6, i); return p; };
        const r1 = mk(0, { gun: 'purga' }), r2 = mk(1, { gun: 'purga' }), r3 = mk(2, { gun: 'cacciatore' });
        const n1 = mk(3, { gun: 'purga' }), pl = mk(4, { gun: 'purga', action: 'plant' }), kn = mk(5, { gun: 'purga' }), jp = mk(6, { gun: 'spatz', air: true, vy: 2 }), pi = mk(7, { gun: 'vogt9' });
        r1.ws.state = 'reload'; r1.ws.rl = { kind: 'mag', t: 0.6, dur: 2.4, empty: false }; r2.ws.state = 'reload'; r2.ws.rl = { kind: 'mag', t: 1.35, dur: 2.4, empty: true };
        r3.ws.state = 'reload'; r3.ws.rl = { kind: 'shell', t: 0.2, dur: 3, phase: 'load', n: 1 };
        n1.inv.nades = [{ gid: n1.inv.nades && n1.inv.nades[0] ? n1.inv.nades[0].gid : 'frag', n: 1 }]; n1.cur = 'nade'; n1.curNade = n1.inv.nades[0].gid; n1.ws.nadeT = 0.4; n1.ws.btn = 1;
        kn.cur = 'melee'; if (!kn.inv.melee) LF.game.giveWeapon(kn, 'knife'); kn.cur = 'melee'; kn.ws.ml = { kind: 'slash', t: 0.12, dur: 0.5, side: 1 };
        pi.ws.state = 'reload'; pi.ws.rl = { kind: 'mag', t: 0.9, dur: 2.0, empty: true };
        C.run(45); C.freeze();
        C.cam([X0 - 0.5, 1.2, Z0 - 7.0], [X0, 0.95, Z0], 0.62);
      }, { X0, Z0 });
      await frames(page, 4); await shot(page, 'chars-actions');
    }

    // ===================================================================== ragdolls
    if (want('ragdoll')) {
      console.log('Ragdolls');
      const res = await page.evaluate(() => {
        const g = LF.game; C.hideAll();
        const killer = C.place(C.P[0], 0, -16, 0, { gun: 'purga' });
        // the stairs in the main building (x -6.5..-3 at z 6.5..7, climbing +x), a wall (the building's south face z = -8)
        const sy = g.world.groundAt(-4.5, 6.75, 2.8, 0.1), a = C.place(C.P[1], -4.5, 6.75, -Math.PI / 2, { gun: 'purga', y: sy ? sy.y : 0 }), b = C.place(C.P[2], 3, -9.0, Math.PI, { gun: 'warden' }), c = C.place(C.P[3], -14, -16, 0.3, { gun: 'spatz', vx: 0, vz: 5.5 });
        C.run(20);
        const kill = (v, dir, group) => { g.bus.emit('hit', { attacker: killer, victim: v, dmg: 60, group, dir, point: { ...v.pos } }); v.alive = false; g.bus.emit('kill', { killer, victim: v, weapon: 'purga', headshot: group === 'head' }); };
        kill(a, { x: 1, y: 0, z: 0 }, 'chest'); kill(b, { x: 0, y: 0, z: 1 }, 'head'); kill(c, { x: 0, y: 0, z: 1 }, 'chest');
        const B = C.B, track = [];
        for (let i = 0; i < 300; i++) { B.frame(1 / 60, 1); if (i % 30 === 0) track.push(B.corpses.map(k => +k.rag.P[1].toFixed(2))); }
        const out = B.corpses.map(k => {
          let nan = 0, below = 0, minY = 1e9;
          for (let j = 0; j < k.rag.N; j++) { const x = k.rag.P[j * 3], y = k.rag.P[j * 3 + 1], z = k.rag.P[j * 3 + 2]; if (!Number.isFinite(x + y + z)) nan++; const gr = g.world.groundAt(x, z, y + 0.4, 0); if (gr && y < gr.y - 0.02) below++; minY = Math.min(minY, y); }
          return { asleep: k.rag.asleep, nan, below, minY: +minY.toFixed(2), pelvis: [+k.rag.P[0].toFixed(2), +k.rag.P[1].toFixed(2), +k.rag.P[2].toFixed(2)] };
        });
        return { out, track, n: B.corpses.length };
      });
      console.log('  corpses: ' + JSON.stringify(res.out));
      check(res.n === 3, 'three corpses (' + res.n + ')');
      check(res.out.every(k => k.nan === 0), 'no NaN in the ragdolls');
      check(res.out.every(k => k.below === 0), 'ragdolls stay above the floor / stairs');
      check(res.out.every(k => k.asleep), 'ragdolls settle and sleep within 5 s');
      check(res.out[1] && res.out[1].pelvis[2] < -8.05, 'the body shot toward the wall stays outside it (pelvis z ' + (res.out[1] && res.out[1].pelvis[2]) + ')');
      await page.evaluate(() => C.cam([-8.2, 1.5, 6.3], [-4.2, 2.6, 6.75], 0.9)); await frames(page, 3); await shot(page, 'chars-ragdoll-stairs');
      await page.evaluate(() => C.cam([5.5, 1.6, -12.5], [3, 0.3, -8.8], 0.8)); await frames(page, 3); await shot(page, 'chars-ragdoll-wall');
      await page.evaluate(() => C.cam([-11.5, 1.6, -15], [-14, 0.2, -13.5], 0.8)); await frames(page, 3); await shot(page, 'chars-ragdoll-run');
      // round reset clears the corpses
      const after = await page.evaluate(() => { LF.game.bus.emit('round:reset', {}); C.B.frame(1 / 60, 1); return C.B.corpses.length; });
      check(after === 0, 'round:reset clears the corpses');
    }

    // ===================================================================== perf: 16 characters
    if (want('perf')) {
      console.log('Perf (16 characters)');
      const pf = await page.evaluate(({ X0, Z0 }) => {
        C.hideAll(); const guns = ['purga', 'warden', 'spatz', 'breachpoint', 'rook', 'varg', 'habicht', 'kroha'];
        C.P.forEach((p, i) => { C.place(p, X0 - 7 + (i % 8) * 2, Z0 + 2 + Math.floor(i / 8) * 4 + (i % 3), Math.PI + (i % 5) * 0.3, { gun: guns[i % 8], vx: (i % 4 ? 2.2 : 0), crouch: i % 7 === 3 ? 1 : 0 }); C.B.setLook(p, null); });
        C.run(10);
        const B = C.B, t = performance.now(); for (let i = 0; i < 60; i++) B.frame(1 / 60, 1); const ms = (performance.now() - t) / 60;
        C.freeze(); C.cam([X0, 2.2, Z0 - 6], [X0, 0.8, Z0 + 5], 0.75);
        return { ms, st: B.stats() };
      }, { X0, Z0 });
      await frames(page, 3);
      const sc = await page.evaluate(() => { const s = LF.game.scene, i = new BABYLON.SceneInstrumentation(s); i.captureFrameTime = true; return new Promise(r => { let n = 0; const o = s.onAfterRenderObservable.add(() => { if (++n >= 3) { s.onAfterRenderObservable.remove(o); r({ draws: i.drawCallsCounter.current, active: s.getActiveMeshes().length, tris: s.getActiveIndices() / 3 }); i.dispose(); } }); }); });
      console.log('  bodies.frame ' + pf.ms.toFixed(2) + ' ms / frame, ' + JSON.stringify(pf.st) + ', scene ' + JSON.stringify(sc));
      await shot(page, 'chars-perf16');
      check(pf.ms < 6, 'bodies system CPU for 16 characters (' + pf.ms.toFixed(2) + ' ms per frame, SwiftShader machine)');
      check(pf.st.draws < 90, 'character draw batches stay bounded (' + pf.st.draws + ')');
    }

    // ===================================================================== the local view: team-mates, enemies, muzzle flash
    if (want('view')) {
      console.log('Local view');
      const v = await page.evaluate(({ X0, Z0 }) => {
        const g = LF.game; C.hideAll(); C.B.debug.cam = null; C.B.thirdPersonOverride = null;
        document.getElementById('hud').style.visibility = '';
        if (g.viewmodel && g.viewmodel.holder) g.viewmodel.holder.setEnabled(true);
        const me = g.local; C.place(me, X0, Z0 - 6, 0, { gun: 'purga' }); g.setView(0, 0.05);
        const mates = C.P.filter(p => p !== me && p.team === me.team).slice(0, 2), foes = C.P.filter(p => p.team !== me.team).slice(0, 2);
        mates.forEach((p, i) => C.place(p, X0 - 1.8 + i * 3.4, Z0 + 2 + i * 3, Math.PI + 0.4 - i * 0.8, { gun: 'warden' }));
        foes.forEach((p, i) => C.place(p, X0 - 3 + i * 5, Z0 + 9 + i * 2, Math.PI - 0.3 + i * 0.6, { gun: 'purga' }));
        C.run(30); C.B.timeScale = 1;
        // a foe fires (third-person flash)
        const f = foes[0], gm = C.char(f).gm;
        g.bus.emit('shot', { p: f, gun: { cat: 'rifle' }, kick: 1, origin: f.pos, dir: { x: 0, y: 0, z: -1 }, traces: [] });
        return { mates: mates.length, flash: !!(gm && gm.muzzle), tags: document.querySelectorAll('.lf-tags > div').length };
      }, { X0, Z0 });
      await frames(page, 1); await shot(page, 'chars-view');
      await frames(page, 3);
      const tags = await page.evaluate(() => [...document.querySelectorAll('.lf-tags > div')].filter(e => e.style.display !== 'none').map(e => e.textContent));
      check(tags.length === v.mates, 'name tags over the team-mates only (' + JSON.stringify(tags) + ')');
      const mz = await page.evaluate(() => { const f = C.P.find(p => p.alive && p.team !== LF.game.local.team), o = {}; return LF.game.bodies.muzzleOf(f, o) ? o : null; });
      check(mz && Number.isFinite(mz.x) && mz.y > 0.8 && mz.y < 1.8, 'muzzleOf gives the third-person muzzle (' + JSON.stringify(mz) + ')');
      // local player's shadow-only body: not in the camera, in the shadow map
      const sh = await page.evaluate(() => { const B = LF.game.bodies; return [...B.batches.entries()].filter(([k, b]) => k[0] === 's' && b.n > 0).length; });
      check(sh > 0, 'the local first-person body renders into the shadow map (' + sh + ' shadow batches)');
    }

    console.log('console errors: ' + errs.length); for (const e of errs.slice(0, 10)) console.log('  ' + e);
    check(errs.length === 0, 'zero console errors');
    await ctx.close();
    // ===================================================================== real maps: bots playing, the soldiers on the map's floors
    if (want('maps')) for (const map of (arg('maps', 'harbor,tower')).split(',')) {
      console.log('Map ' + map);
      const { ctx: c2, page: pg, errs: e2 } = await openPage(browser, srv.url, '#dev&map=' + map + '&mode=tdm&bots=9&q=low&autostart&nolens&nodyn&seed=4&freeze=0');
      await pg.waitForFunction(() => window.LF && LF.game && LF.game.ready, null, { timeout: 300000, polling: 500 });
      const r = await pg.evaluate(() => {
        const g = LF.game, B = g.bodies; LF.loop.setPaused(true);
        let bad = 0, deaths = 0; const off = g.bus.on('kill', () => deaths++);
        for (let i = 0; i < 40; i++) { g.debugStep(0.5); B.frame(1 / 30, 1); for (const c of B.list.values()) { const O = B.poseOf(c.p); if (O && !Object.values(O.joints).every(v => v.every(Number.isFinite))) bad++; } }
        if (off) off();
        // camera: behind and above a live bot, looking at it and its nearest neighbour
        const ps = [...g.players.values()].filter(p => p.alive && p !== g.local);
        const p = ps[0]; B.thirdPersonOverride = true; document.getElementById('hud').style.visibility = 'hidden';
        if (g.viewmodel && g.viewmodel.holder) g.viewmodel.holder.setEnabled(false);
        const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
        B.debug.cam = { pos: [p.pos.x - fx * 3.2 + fz * 1.2, p.pos.y + 1.9, p.pos.z - fz * 3.2 - fx * 1.2], target: [p.pos.x, p.pos.y + 1.0, p.pos.z], fov: 0.8 };
        B.timeScale = 0;
        // feet on the floor: every live character's lowest ankle vs the ground under it
        let worst = 0;
        for (const c of B.list.values()) { if (!c.p.alive) continue; const O = B.poseOf(c.p); if (!O) continue; const a = O.joints.anR[1] < O.joints.anL[1] ? O.joints.anR : O.joints.anL;
          const gr = g.world.groundAt(a[0], a[2], a[1] + 0.6, 0.2); if (gr && c.p.onGround) worst = Math.max(worst, Math.abs(a[1] - 0.1 - gr.y)); }
        return { bad, deaths, corpses: B.corpses.length, st: B.stats(), worst, alive: ps.length };
      });
      await frames(pg, 3); await shot(pg, 'chars-map-' + map);
      console.log('  ' + JSON.stringify(r));
      check(r.st.ok && !r.st.fallback && r.bad === 0, map + ': characters drawn, no NaN joints over 20 s of bot play');
      check(r.worst < 0.12, map + ': planted feet on the floor (worst ' + r.worst.toFixed(3) + ' m)');
      check(e2.length === 0, map + ': zero console errors' + (e2.length ? ' ' + e2.slice(0, 3).join(' | ') : ''));
      await c2.close();
    }
  } finally { await browser.close(); srv.stop(); }
  console.log((fails.length ? 'FAILED ' + fails.length : 'PASSED') + ' in ' + ((Date.now() - t0) / 1000).toFixed(0) + ' s');
  process.exit(fails.length ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
