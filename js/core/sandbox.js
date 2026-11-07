/* LIVE FIRE — dev sandbox (#dev&sandbox&map=dev_range): build a map with the environment / material / postfx modules, walk it
   with the real movement code (moveStep) and pointer-lock look, and show a debug overlay. CORE B's Game session replaces this
   for real play; it stays as a map / physics test bench.
   Exports: startSandbox({ engine, canvas, mapId, quality }) -> Promise<sandbox>
   window.LF.sandbox = { scene, camera, info (MapInfo), player (PlayerState-like), step(n, cmd?) (run n ticks with a command,
     synchronously), teleport(x, y, z, yaw?, pitch?), look(yaw, pitch), setNoclip(bool), gates(open), stats(),
     cam({ x, y, z, yaw, pitch, fov?, ortho? } | null) (scripted camera for overview shots) }
   Keys (sandbox only): click = lock the mouse, G = open/close the lobby gates, V = noclip fly, F3 = debug overlay. */
import { Settings } from './settings.js';
import { Input } from './input.js';
import { onTick, onFrame, onLateFrame, setScene, loopStats, runTicks, TICK_DT } from './loop.js';
import { getRenderScale, DynRes } from './engine.js';
import { vfov43, clamp, el } from './util.js';
import { DEV } from './dev.js';
import { moveStep, MOVE, BTN, eyeHeight, leanOffset, resetMove } from '../phys/move.js';
import { buildMap } from '../maps/builder.js';
import { loadMapDef } from '../maps/index.js';
import { applyEnvironment } from '../gfx/env.js';
import { createPipeline } from '../gfx/postfx.js';

export async function startSandbox({ engine, canvas, mapId = 'dev_range', quality = 'low' }) {
  const t0 = performance.now();
  const scene = new BABYLON.Scene(engine);
  scene.skipPointerMovePicking = true;
  scene.clearColor = new BABYLON.Color4(0.5, 0.56, 0.62, 1);
  const camera = new BABYLON.UniversalCamera('sandboxCam', new BABYLON.Vector3(0, 2, 0), scene);
  camera.inputs.clear();
  camera.minZ = 0.05; camera.maxZ = 800;
  camera.fovMode = BABYLON.Camera.FOVMODE_VERTICAL_FIXED;
  camera.fov = vfov43(Settings.get('fov'));
  camera.rotation.set(0, 0, 0);
  scene.activeCamera = camera;

  const def = await loadMapDef(mapId);
  const env = await applyEnvironment(scene, def.env || {}, { quality });
  const info = await buildMap(scene, def, { quality });
  if (env && env.shadow && info.casters) for (const m of info.casters) { try { env.shadow.addShadowCaster(m, false); } catch (e) { /* not a mesh */ } }
  const pipe = createPipeline(scene, camera, { quality, lens: DEV.nolens ? 'off' : Settings.get('lens') });
  const inst = new BABYLON.SceneInstrumentation(scene);
  inst.captureFrameTime = false;

  // ------------------------------------------------------------------ the local player
  const team = DEV.team === 2 ? 2 : 1;
  const sp = (info.spawns[team] && info.spawns[team][0]) || (info.spawns[0] && info.spawns[0][0]) || { x: 0, y: 2, z: 0, yaw: 0 };
  const P = { id: 'local', team, pos: { x: sp.x, y: sp.y, z: sp.z }, vel: { x: 0, y: 0, z: 0 }, yaw: sp.yaw || 0, pitch: 0, crouch: 0, lean: 0,
    onGround: true, mantle: null, tagged: 0 };
  const prev = { x: P.pos.x, y: P.pos.y, z: P.pos.z, eye: MOVE.eye, lean: 0 };
  let view = { yaw: P.yaw, pitch: 0 };
  let noclip = false, override = null, dbgOn = true, gatesOpen = false;
  const cmd = { seq: 0, mx: 0, mz: 0, yaw: 0, pitch: 0, buttons: 0 };
  const lastEv = { surf: '-', footsteps: 0, landed: 0, mantled: null };

  function buildCmd() {
    if (override) return Object.assign(cmd, { mx: 0, mz: 0, buttons: 0, yaw: view.yaw, pitch: view.pitch }, override);
    const m = Input.move();
    let b = 0;
    if (Input.down('jump')) b |= BTN.JUMP;
    if (Input.down('crouch')) b |= BTN.CROUCH;
    if (Input.down('walk')) b |= BTN.WALK;
    if (Input.down('leanL')) b |= BTN.LEANL;
    if (Input.down('leanR')) b |= BTN.LEANR;
    if (Input.down('fire')) b |= BTN.FIRE;
    if (Input.down('ads')) b |= BTN.ADS;
    cmd.mx = m.mx; cmd.mz = m.mz; cmd.buttons = b; cmd.yaw = view.yaw; cmd.pitch = view.pitch; cmd.seq++;
    return cmd;
  }
  const offs = [];
  offs.push(onTick(dt => {
    prev.x = P.pos.x; prev.y = P.pos.y; prev.z = P.pos.z; prev.eye = eyeHeight(P); prev.lean = P.lean;
    if (Input.pressed('drop')) setGates(!gatesOpen);
    if (Input.pressed('inspect')) noclip = !noclip;
    const c = buildCmd();
    if (noclip) {
      const sp2 = (c.buttons & BTN.WALK ? 4 : 14) * dt, sy = Math.sin(c.yaw), cy = Math.cos(c.yaw), cp = Math.cos(c.pitch), spt = Math.sin(c.pitch);
      P.pos.x += (sy * cp * c.mz + cy * c.mx) * sp2; P.pos.z += (cy * cp * c.mz - sy * c.mx) * sp2; P.pos.y += (-spt * c.mz) * sp2;
      if (c.buttons & BTN.JUMP) P.pos.y += sp2; if (c.buttons & BTN.CROUCH) P.pos.y -= sp2;
      P.vel.x = P.vel.y = P.vel.z = 0; P.onGround = false; P.yaw = c.yaw; P.pitch = c.pitch;
      return;
    }
    const ev = moveStep(info.world, P, c, dt, 5.2);
    lastEv.surf = ev.surf || lastEv.surf;
    if (ev.footstep) lastEv.footsteps++;
    if (ev.landed) lastEv.landed = ev.landed;
    if (ev.mantled) lastEv.mantled = ev.mantled;
    if (P.pos.y < (def.bounds ? def.bounds.minY - 10 : -50)) teleport(sp.x, sp.y, sp.z, sp.yaw);
    if (info.update) info.update(dt);
  }));
  let camOv = null;
  function setCam(o) {
    camOv = o || null;
    if (!camOv || !camOv.ortho) { camera.mode = BABYLON.Camera.PERSPECTIVE_CAMERA; }
    if (camOv && camOv.ortho) {
      const o2 = camOv.ortho; camera.mode = BABYLON.Camera.ORTHOGRAPHIC_CAMERA;
      camera.orthoLeft = o2.left; camera.orthoRight = o2.right; camera.orthoTop = o2.top; camera.orthoBottom = o2.bottom;
    }
    camera.fov = camOv && camOv.fov ? camOv.fov : vfov43(Settings.get('fov'));
  }
  offs.push(onFrame((dt, alpha) => {
    if (camOv) { camera.position.set(camOv.x, camOv.y, camOv.z); camera.rotation.set(camOv.pitch || 0, camOv.yaw || 0, 0); return; }
    // look is applied per frame (lowest latency); the tick reads the current view angles
    const lk = Input.look();
    view.yaw += lk.dx; view.pitch = clamp(view.pitch + lk.dy, -1.55, 1.55);
    const a = noclip ? 1 : alpha;
    const ex = prev.x + (P.pos.x - prev.x) * a, ey = prev.y + (P.pos.y - prev.y) * a, ez = prev.z + (P.pos.z - prev.z) * a;
    const eye = noclip ? 0 : prev.eye + (eyeHeight(P) - prev.eye) * a;
    const lean = prev.lean + (P.lean - prev.lean) * a;
    LS.lean = lean; LS.yaw = view.yaw;
    const lo = leanOffset(LS, LO);
    camera.position.set(ex + lo.x, ey + eye + lo.y, ez + lo.z);
    camera.rotation.set(view.pitch, view.yaw, -lean * MOVE.leanRoll);
    if (!noclip) { /* nothing else: CORE B adds view bob, recoil and the body-cam head motion */ }
  }));
  const LO = { x: 0, y: 0, z: 0 }, LS = { lean: 0, yaw: 0 };

  // ------------------------------------------------------------------ debug overlay + crosshair
  const hud = document.getElementById('hud');
  const dbg = el('div', 'dbg'); const xh = el('div', 'sbx-xh');
  const help = el('div', 'sbx-help', 'CLICK to look &middot; WASD move &middot; SPACE jump / mantle &middot; CTRL crouch &middot; SHIFT walk &middot; Q / E lean &middot; G gates &middot; V noclip &middot; F3 overlay');
  hud.append(dbg, xh, help);
  let dbgT = 0;
  offs.push(onLateFrame(dt => {
    dbgT -= dt; if (dbgT > 0 || !dbgOn) return; dbgT = 0.25;
    const rs = getRenderScale(), dr = DynRes.info();
    const dc = inst.drawCallsCounter ? inst.drawCallsCounter.current : 0;
    const g = info.world.groundAt(P.pos.x, P.pos.z, P.pos.y + 0.05, 0.2);
    const n = info.nav ? info.nav.nearest(P.pos.x, P.pos.y, P.pos.z, 1) : -1;
    dbg.innerHTML = [
      'FPS ' + loopStats.fps.toFixed(0) + ' &middot; CPU ' + loopStats.cpuMs.toFixed(1) + ' ms &middot; ticks ' + loopStats.ticksLastFrame + (loopStats.errors ? ' &middot; <b>ERR ' + loopStats.errors + '</b>' : ''),
      'draw calls ' + dc + ' &middot; tris ' + Math.round(scene.getActiveIndices() / 3).toLocaleString() + ' &middot; meshes ' + scene.getActiveMeshes().length + '/' + scene.meshes.length,
      'res ' + rs.width + 'x' + rs.height + ' &middot; scale ' + (rs.user * rs.dyn).toFixed(2) + (dr.enabled ? ' (dyn ' + dr.scale.toFixed(2) + ')' : ''),
      'pos ' + P.pos.x.toFixed(2) + ' ' + P.pos.y.toFixed(2) + ' ' + P.pos.z.toFixed(2) + ' &middot; yaw ' + (view.yaw * 57.3 % 360).toFixed(0) + ' pitch ' + (view.pitch * 57.3).toFixed(0),
      'speed ' + Math.hypot(P.vel.x, P.vel.z).toFixed(2) + ' m/s &middot; ' + (noclip ? 'NOCLIP' : P.mantle ? 'MANTLE' : P.onGround ? 'ground' : 'air') + ' &middot; crouch ' + P.crouch.toFixed(2) + ' &middot; lean ' + P.lean.toFixed(2),
      'surface ' + (g ? g.surf : '-') + ' &middot; nav ' + (n >= 0 ? '#' + n + (info.nav.isCrouchOnly(n) ? ' crouch' : '') + (info.nav.isGate(n) ? ' gate' : '') : 'none') + ' &middot; gates ' + (gatesOpen ? 'open' : 'closed'),
      'map ' + info.id + ' &middot; built ' + info.stats.msTotal + ' ms (nav ' + info.stats.msNav + ') &middot; lights ' + info.stats.lights + ' ' + info.stats.lightMode,
    ].join('<br>');
  }));
  const onKey = e => { if (e.code === 'F3') { e.preventDefault(); dbgOn = !dbgOn; dbg.style.display = dbgOn ? '' : 'none'; } };
  window.addEventListener('keydown', onKey);
  canvas.addEventListener('click', () => { if (!Input.locked) Input.lock(); });

  function teleport(x, y, z, yaw, pitch) {
    P.pos.x = x; P.pos.y = y; P.pos.z = z; resetMove(P); P.onGround = false;
    prev.x = x; prev.y = y; prev.z = z;
    if (yaw != null) view.yaw = yaw; if (pitch != null) view.pitch = pitch;
  }
  function setGates(open) { gatesOpen = !!open; if (open) info.openGates(); else info.closeGates(); }

  setScene(scene);
  Input.setGameActive(false);
  const api = {
    scene, camera, info, player: P, env, pipe, view,
    step(n = 1, c = {}) { override = c; try { runTicks(n); } finally { override = null; } return P; },
    teleport, look(yaw, pitch) { view.yaw = yaw; view.pitch = pitch; }, setNoclip(v) { noclip = !!v; }, gates: setGates,
    cam: setCam,   // cam({ x, y, z, yaw, pitch, fov?, ortho?: { left, right, top, bottom } }) takes the camera over; cam(null) gives it back
    stats() {
      return { drawCalls: inst.drawCallsCounter ? inst.drawCallsCounter.current : -1, activeMeshes: scene.getActiveMeshes().length, meshes: scene.meshes.length,
        tris: Math.round(scene.getActiveIndices() / 3), fps: loopStats.fps, errors: loopStats.errors, build: info.stats, lastEv: { ...lastEv } };
    },
    tickDt: TICK_DT,
    dispose() { for (const f of offs) f(); window.removeEventListener('keydown', onKey); dbg.remove(); xh.remove(); help.remove(); info.dispose(); pipe.dispose && pipe.dispose(); env.dispose && env.dispose(); scene.dispose(); },
  };
  api.bootMs = Math.round(performance.now() - t0);
  return api;
}
