/* LIVE FIRE — 3D visuals and sounds of the objective state (js/game/objectives.js is the pure-JS logic; this only reads it):
   the charge (dropped / planted, blinking LED and accelerating beeps, explosion fireball + shake), kneeling hostages (hooded, hands
   tied; carried over the rescuer's shoulder; slumped when killed), CTF flags (waving cloth, home plinths, carried on the back),
   capture-zone rings (owner colour, capture progress disc, contested pulse), extraction / rescue zone outlines and spinning dog
   tags. Everything is original procedural geometry; one mesh (or one clone) per object, StandardMaterial/PBR, shadows cast.
   Exports:
     ObjectiveVisuals   game system 'objvis': new ObjectiveVisuals(scene, game); frame(dt) (reads game.objectives.s), dispose()
   Sounds (js/audio/audio.js through game.js Audio): Audio.sfx bomb_key / bomb_planted / bomb_beep / bomb_defuse / bomb_defused /
   pickup / zip, Audio.nade('satchel', 'boom') for the charge, Audio.ui notify / unlock for flags and zones, Audio.radio callouts. */
import { Audio } from './game.js';

const C3 = (r, g, b) => new BABYLON.Color3(r, g, b);
const TEAM = { 0: [0.85, 0.83, 0.78], 1: [0.88, 0.64, 0.23], 2: [0.31, 0.64, 0.88] };

function pbr(scene, name, col, rough = 0.7, metal = 0, emis = null) {
  const m = new BABYLON.PBRMaterial(name, scene);
  m.albedoColor = C3(...col); m.roughness = rough; m.metallic = metal; m.maxSimultaneousLights = 6;
  if (emis) m.emissiveColor = C3(...emis);
  return m;
}
function glow(scene, name, col, alpha = 1) {
  const m = new BABYLON.StandardMaterial(name, scene);
  m.disableLighting = true; m.emissiveColor = C3(...col); m.diffuseColor = C3(0, 0, 0); m.specularColor = C3(0, 0, 0);
  if (alpha < 1) { m.alpha = alpha; m.backFaceCulling = false; }
  m.fogEnabled = true;
  return m;
}
const merge = (list, name) => { const m = BABYLON.Mesh.MergeMeshes(list, true, true, undefined, false, true); if (m) m.name = name; return m; };

export class ObjectiveVisuals {
  constructor(scene, game) {
    this.name = 'objvis'; this.scene = scene; this.g = game;
    this.mats = {}; this.meshes = []; this.t = 0;
    this.bomb = null; this.hostages = []; this.flags = {}; this.zones = new Map(); this.tags = new Map(); this.rings = [];
    this.fire = null; this.nextBeep = Infinity; this.keyT = 0; this.ledT = 0; this.prevState = null;
    this.ready = false;
    this.offs = [game.bus.on('objective', e => this.onEvent(e)), game.bus.on('bomb:explode', e => this.explode(e))];
  }
  mat(k, fn) { return this.mats[k] || (this.mats[k] = fn()); }
  keep(m) { this.meshes.push(m); return m; }
  caster(m) { const sh = this.g.env && this.g.env.shadow; if (sh && m) { try { sh.addShadowCaster(m, true); } catch (e) { /* no shadows */ } } }

  // ----------------------------------------------------------------------------------------------- builders
  buildBomb() {
    const sc = this.scene, parts = [];
    const drab = this.mat('bomb_drab', () => pbr(sc, 'obj_bomb_drab', [0.34, 0.33, 0.24], 0.85));
    const tape = this.mat('bomb_tape', () => pbr(sc, 'obj_bomb_tape', [0.05, 0.05, 0.055], 0.45));
    const box = this.mat('bomb_box', () => pbr(sc, 'obj_bomb_box', [0.13, 0.135, 0.14], 0.5, 0.3));
    const key = this.mat('bomb_key', () => pbr(sc, 'obj_bomb_key', [0.55, 0.55, 0.52], 0.6));
    const red = this.mat('bomb_wr', () => pbr(sc, 'obj_bomb_wr', [0.6, 0.06, 0.05], 0.5));
    const blu = this.mat('bomb_wb', () => pbr(sc, 'obj_bomb_wb', [0.06, 0.16, 0.55], 0.5));
    const yel = this.mat('bomb_wy', () => pbr(sc, 'obj_bomb_wy', [0.7, 0.58, 0.08], 0.5));
    const lcd = this.mat('bomb_lcd', () => glow(sc, 'obj_bomb_lcd', [0.32, 0.55, 0.22]));
    const add = (m, mat) => { m.material = mat; parts.push(m); return m; };
    const B = (w, h, d, x, y, z, mat, ry = 0) => { const m = BABYLON.MeshBuilder.CreateBox('bp', { width: w, height: h, depth: d }, sc); m.position.set(x, y, z); m.rotation.y = ry; return add(m, mat); };
    // two explosive bricks, taped together
    B(0.135, 0.075, 0.21, -0.07, 0.0375, 0, drab); B(0.135, 0.075, 0.21, 0.07, 0.0375, 0, drab);
    for (const z of [-0.07, 0.07]) B(0.285, 0.079, 0.026, 0, 0.0375, z, tape);
    // control unit + keypad + display
    B(0.13, 0.034, 0.095, 0, 0.092, 0.01, box);
    B(0.07, 0.003, 0.026, -0.02, 0.1105, 0.04, lcd);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) B(0.012, 0.004, 0.011, -0.04 + c * 0.017, 0.111, -0.002 - r * 0.016, key);
    const ant = BABYLON.MeshBuilder.CreateCylinder('bp', { height: 0.11, diameter: 0.006, tessellation: 6 }, sc); ant.position.set(0.05, 0.16, 0.045); add(ant, tape);
    // wires from the unit into the bricks
    const wire = (pts, mat) => { const m = BABYLON.MeshBuilder.CreateTube('bp', { path: pts.map(p => new BABYLON.Vector3(...p)), radius: 0.0032, tessellation: 5 }, sc); add(m, mat); };
    wire([[-0.06, 0.09, 0.05], [-0.09, 0.1, 0.07], [-0.11, 0.075, 0.09]], red);
    wire([[-0.06, 0.09, 0.0], [-0.1, 0.095, -0.02], [-0.12, 0.075, -0.05]], blu);
    wire([[0.06, 0.09, -0.02], [0.1, 0.1, -0.04], [0.11, 0.075, -0.08]], yel);
    wire([[0.06, 0.09, 0.03], [0.09, 0.095, 0.06], [0.1, 0.075, 0.095]], red);
    const root = merge(parts, 'obj_charge');
    const led = BABYLON.MeshBuilder.CreateSphere('obj_charge_led', { diameter: 0.012, segments: 6 }, sc);
    led.material = this.mat('bomb_led', () => glow(sc, 'obj_bomb_led', [1, 0.08, 0.05]));
    led.parent = root; led.position.set(0.035, 0.112, 0.04);
    root.isPickable = false; led.isPickable = false; root.setEnabled(false);
    this.caster(root);
    this.keep(root); this.keep(led);
    return { root, led, ledMat: led.material };
  }

  hostageTemplate() {
    if (this._hostT) return this._hostT;
    const sc = this.scene, parts = [];
    const suit = this.mat('h_suit', () => pbr(sc, 'obj_h_suit', [0.62, 0.3, 0.1], 0.9));
    const hood = this.mat('h_hood', () => pbr(sc, 'obj_h_hood', [0.08, 0.08, 0.075], 0.95));
    const skin = this.mat('h_skin', () => pbr(sc, 'obj_h_skin', [0.62, 0.45, 0.35], 0.75));
    const shoe = this.mat('h_shoe', () => pbr(sc, 'obj_h_shoe', [0.07, 0.065, 0.06], 0.6));
    const cap = (r, h, x, y, z, rx, rz, mat) => { const m = BABYLON.MeshBuilder.CreateCapsule('hp', { radius: r, height: h, tessellation: 10, subdivisions: 1, capSubdivisions: 3 }, sc); m.position.set(x, y, z); m.rotation.x = rx; m.rotation.z = rz; m.material = mat; parts.push(m); return m; };
    // kneeling on both knees, sitting back a little, hands tied behind the back, a hood over the head
    cap(0.075, 0.42, -0.1, 0.12, -0.12, Math.PI / 2 - 0.15, 0, suit); cap(0.075, 0.42, 0.1, 0.12, -0.12, Math.PI / 2 - 0.15, 0, suit);    // shins on the floor
    cap(0.085, 0.42, -0.1, 0.33, -0.02, -0.55, 0, suit); cap(0.085, 0.42, 0.1, 0.33, -0.02, -0.55, 0, suit);                            // thighs
    cap(0.16, 0.5, 0, 0.72, -0.06, -0.08, 0, suit);                                                                                       // torso
    cap(0.17, 0.36, 0, 0.92, -0.07, 0, Math.PI / 2, suit);                                                                                // shoulders
    cap(0.05, 0.36, -0.2, 0.78, -0.16, 0.25, 0.18, suit); cap(0.05, 0.36, 0.2, 0.78, -0.16, 0.25, -0.18, suit);                         // upper arms back
    cap(0.045, 0.3, -0.1, 0.62, -0.27, 1.2, 0.5, suit); cap(0.045, 0.3, 0.1, 0.62, -0.27, 1.2, -0.5, suit);                              // forearms to the back
    const hand = BABYLON.MeshBuilder.CreateSphere('hp', { diameter: 0.11, segments: 6 }, sc); hand.position.set(0, 0.56, -0.33); hand.material = skin; parts.push(hand);
    const neck = BABYLON.MeshBuilder.CreateCylinder('hp', { height: 0.1, diameter: 0.1, tessellation: 8 }, sc); neck.position.set(0, 1.03, -0.05); neck.material = skin; parts.push(neck);
    const head = BABYLON.MeshBuilder.CreateSphere('hp', { diameter: 0.25, segments: 10 }, sc); head.scaling.set(0.88, 1.05, 0.98); head.position.set(0, 1.17, -0.03); head.material = hood; parts.push(head);
    for (const x of [-0.1, 0.1]) { const f = BABYLON.MeshBuilder.CreateBox('hp', { width: 0.09, height: 0.07, depth: 0.2 }, sc); f.position.set(x, 0.05, -0.36); f.rotation.x = -0.6; f.material = shoe; parts.push(f); }
    const m = merge(parts, 'obj_hostage_t');
    m.isPickable = false; m.setEnabled(false);
    this.keep(m);
    return (this._hostT = m);
  }

  buildFlag(team) {
    const sc = this.scene, col = TEAM[team];
    const pole = BABYLON.MeshBuilder.CreateCylinder('obj_fpole', { height: 2.3, diameter: 0.035, tessellation: 8 }, sc);
    pole.material = this.mat('f_pole', () => pbr(sc, 'obj_f_pole', [0.55, 0.56, 0.57], 0.35, 0.9));
    pole.position.y = 1.15;
    const root = new BABYLON.TransformNode('obj_flag' + team, sc); pole.parent = root;
    const cloth = BABYLON.MeshBuilder.CreateGround('obj_fcloth' + team, { width: 0.95, height: 0.6, subdivisionsX: 10, subdivisionsY: 5, updatable: true }, sc);
    cloth.rotation.x = -Math.PI / 2; cloth.parent = root; cloth.position.set(0.49, 1.95, 0);
    const cm = pbr(sc, 'obj_f_cloth' + team, col, 0.95, 0, col.map(v => v * 0.18)); cm.backFaceCulling = false; cm.twoSidedLighting = true; cloth.material = cm;
    const base = BABYLON.MeshBuilder.CreateCylinder('obj_fbase' + team, { height: 0.08, diameterTop: 0.7, diameterBottom: 0.85, tessellation: 24 }, sc);
    base.material = this.mat('f_base', () => pbr(sc, 'obj_f_base', [0.2, 0.21, 0.22], 0.6, 0.5));
    const ring = BABYLON.MeshBuilder.CreateTorus('obj_fring' + team, { diameter: 3.4, thickness: 0.06, tessellation: 48 }, sc);
    ring.material = glow(sc, 'obj_f_ring' + team, col, 0.85); ring.scaling.y = 0.25;
    for (const m of [pole, cloth, base, ring]) m.isPickable = false;
    this.caster(pole); this.caster(cloth);
    this.keep(pole); this.keep(cloth); this.keep(base); this.keep(ring);
    const pos = cloth.getVerticesData(BABYLON.VertexBuffer.PositionKind).slice();
    return { root, pole, cloth, base, ring, rest: pos, buf: new Float32Array(pos.length), mat: cm };
  }

  zoneVis(z) {
    const sc = this.scene;
    const ring = BABYLON.MeshBuilder.CreateTorus('obj_zring_' + z.id, { diameter: z.r * 2, thickness: 0.07, tessellation: 64 }, sc);
    ring.scaling.y = 0.2;
    const rm = glow(sc, 'obj_zr_' + z.id, TEAM[0], 0.9); ring.material = rm;
    const disc = BABYLON.MeshBuilder.CreateDisc('obj_zdisc_' + z.id, { radius: z.r, tessellation: 48 }, sc);
    disc.rotation.x = Math.PI / 2;
    const dm = glow(sc, 'obj_zd_' + z.id, TEAM[0], 0.12); dm.disableDepthWrite = true; disc.material = dm;
    const pillar = BABYLON.MeshBuilder.CreateCylinder('obj_zp_' + z.id, { height: 6, diameter: 0.05, tessellation: 6 }, sc);
    const pm = glow(sc, 'obj_zpm_' + z.id, TEAM[0], 0.35); pillar.material = pm;
    for (const m of [ring, disc, pillar]) { m.isPickable = false; this.keep(m); }
    const gy = z.y + 0.04;
    ring.position.set(z.x, gy, z.z); disc.position.set(z.x, gy + 0.005, z.z); pillar.position.set(z.x, z.y + 3, z.z);
    return { ring, disc, pillar, rm, dm, pm };
  }

  tagTemplate() {
    if (this._tagT) return this._tagT;
    const sc = this.scene, parts = [];
    const steel = this.mat('t_steel', () => pbr(sc, 'obj_t_steel', [0.75, 0.75, 0.74], 0.3, 1));
    for (const [x, r] of [[-0.012, 0.25], [0.012, -0.2]]) {
      const t = BABYLON.MeshBuilder.CreateBox('tp', { width: 0.03, height: 0.05, depth: 0.003 }, sc); t.position.set(x, 0, 0.001 * Math.sign(x)); t.rotation.z = r; t.material = steel; parts.push(t);
    }
    const chain = BABYLON.MeshBuilder.CreateTorus('tp', { diameter: 0.07, thickness: 0.003, tessellation: 16 }, sc); chain.position.y = 0.045; chain.rotation.x = Math.PI / 2; chain.material = steel; parts.push(chain);
    const m = merge(parts, 'obj_tag_t'); m.setEnabled(false); m.isPickable = false; this.keep(m);
    return (this._tagT = m);
  }

  init() {
    const O = this.g.objectives; if (!O) return false;
    const s = O.s, sc = this.scene;
    if (s.bomb) this.bomb = this.buildBomb();
    if (s.flags) for (const t of [1, 2]) this.flags[t] = this.buildFlag(t);
    // rescue zones (hostage mode) and extraction points (VIP): flat green outlines
    const green = [0.35, 0.9, 0.45];
    const outline = (r, name) => {
      const y = (r.y || 0) + 0.04, w = r.x1 - r.x0, d = r.z1 - r.z0, gm = this.mat('g_out', () => glow(sc, 'obj_g_out', green, 0.75));
      for (const [x, z, ww, dd] of [[r.x, r.z0, w, 0.08], [r.x, r.z1, w, 0.08], [r.x0, r.z, 0.08, d], [r.x1, r.z, 0.08, d]]) {
        const m = BABYLON.MeshBuilder.CreateBox(name, { width: ww, height: 0.015, depth: dd }, sc); m.position.set(x, y, z); m.material = gm; m.isPickable = false; this.keep(m);
      }
    };
    if (s.hostages) { const map = this.g.map || {}; for (const r of (map.rescues && map.rescues.length ? map.rescues : map.rescue ? [map.rescue] : [])) outline(r, 'obj_rescue'); }
    if (s.extracts) for (const e of s.extracts) {
      const ring = BABYLON.MeshBuilder.CreateTorus('obj_ex_' + e.id, { diameter: e.r * 2, thickness: 0.07, tessellation: 64 }, sc);
      ring.scaling.y = 0.2; ring.position.set(e.x, e.y + 0.04, e.z); ring.material = this.mat('g_ring', () => glow(sc, 'obj_g_ring', green, 0.85)); ring.isPickable = false;
      this.keep(ring); this.rings.push(ring);
    }
    this.ready = true;
    return true;
  }

  // ----------------------------------------------------------------------------------------------- per frame
  frame(dt) {
    if (!this.ready && !this.init()) return;
    const O = this.g.objectives, s = O.s, me = this.g.local;
    this.t += dt;
    if (this.bomb) this.frameBomb(dt, s.bomb, O);
    if (s.hostages) this.frameHostages(s.hostages, me);
    if (s.flags) this.frameFlags(dt, s.flags, me);
    if (s.zones) this.frameZones(s.zones);
    if (s.tags) this.frameTags(s.tags);
    for (const r of this.rings) r.rotation.y += dt * 0.3;
    if (this.fire) this.frameFire(dt);
  }

  frameBomb(dt, b, O) {
    const V = this.bomb, show = !!b && (b.state === 'dropped' || b.state === 'planted' || b.state === 'defused');
    V.root.setEnabled(show);
    if (!b) return;
    if (show) {
      V.root.position.set(b.x, b.y + 0.005, b.z);
      V.root.rotation.set(0, ((b.x * 7 + b.z * 3) % 6.28), b.state === 'dropped' ? 0.06 : 0);
    }
    // planting: keypad presses
    const pos = { x: b.x, y: b.y + 0.3, z: b.z };
    if (b.state === 'carried' && b.plantT > 0) { this.keyT -= dt; if (this.keyT <= 0) { this.keyT = 0.42; try { Audio.sfx('bomb_key', { pos }); } catch (e) { /* audio optional */ } } }
    else this.keyT = 0;
    // planted: accelerating beeps, LED flash
    if (b.state === 'planted') {
      if (this.prevState !== 'planted') this.nextBeep = b.fuse - 0.6;
      const k = b.fuseMax > 0 ? b.fuse / b.fuseMax : 0;
      const iv = b.fuse < 1.6 ? 0.075 : Math.max(0.11, 0.12 + 0.88 * Math.pow(k, 1.35));
      if (b.fuse <= this.nextBeep) {
        this.nextBeep = b.fuse - iv; this.ledT = 0.07;
        try { Audio.sfx('bomb_beep', { pos }); } catch (e) { /* ok */ }
      }
    }
    this.ledT = Math.max(0, this.ledT - dt);
    V.led.setEnabled(b.state === 'planted' ? this.ledT > 0 || b.defuser != null && Math.sin(this.t * 30) > 0 : b.state === 'dropped' ? Math.sin(this.t * 3) > 0.9 : false);
    this.prevState = b.state;
  }

  frameHostages(list, me) {
    const T = this.hostageTemplate(), g = this.g;
    while (this.hostages.length < list.length) { const c = T.clone('obj_hostage'); c.setEnabled(true); c.isPickable = false; this.caster(c); this.keep(c); this.hostages.push(c); }
    for (let i = 0; i < this.hostages.length; i++) {
      const m = this.hostages[i], h = list[i];
      if (!h || h.state === 'rescued') { m.setEnabled(false); continue; }
      if (h.state === 'carried') {
        const c = g.players.get(h.by);
        if (!c || (c === me && !g.thirdPerson)) { m.setEnabled(false); continue; }
        // over the rescuer's right shoulder, lying across it
        const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw), rx = Math.cos(c.yaw), rz = -Math.sin(c.yaw);
        const up = c.prev ? c.prev.eye : 1.6;
        m.setEnabled(true);
        m.position.set(c.pos.x + rx * 0.08 - fx * 0.05, c.pos.y + up - 0.15, c.pos.z + rz * 0.08 - fz * 0.05);
        m.rotation.set(Math.PI / 2, c.yaw + Math.PI / 2, 0);
        continue;
      }
      m.setEnabled(true);
      m.position.set(h.x, h.y, h.z);
      if (h.state === 'dead') m.rotation.set(0, h.yaw, Math.PI / 2 * 0.92); else m.rotation.set(0, h.yaw, 0);
    }
  }

  frameFlags(dt, F, me) {
    const g = this.g;
    for (const t of [1, 2]) {
      const f = F[t], V = this.flags[t]; if (!f || !V) continue;
      V.base.position.set(f.hx, f.hy + 0.04, f.hz); V.ring.position.set(f.hx, f.hy + 0.05, f.hz);
      V.ring.setEnabled(f.state === 'home'); V.ring.rotation.y += dt * 0.25;
      if (f.state === 'carried') {
        const c = g.players.get(f.carrier);
        if (!c || (c === me && !g.thirdPerson)) { V.root.setEnabled(false); continue; }
        V.root.setEnabled(true);
        V.root.position.set(c.pos.x - Math.sin(c.yaw) * 0.22, c.pos.y + 0.2, c.pos.z - Math.cos(c.yaw) * 0.22);
        V.root.rotation.set(-0.25, c.yaw + Math.PI, 0);
        V.root.scaling.set(0.7, 0.7, 0.7);
      } else {
        V.root.setEnabled(true); V.root.scaling.set(1, 1, 1);
        V.root.position.set(f.x, f.y + (f.state === 'home' ? 0.08 : 0), f.z);
        V.root.rotation.set(f.state === 'dropped' ? 1.25 : 0, f.state === 'dropped' ? (f.x * 3) % 6.28 : 0.6, 0);
      }
      // waving cloth: a travelling sine along the fly end, pinned at the hoist
      const r = V.rest, b = V.buf, ph = this.t * 6 + t;
      for (let i = 0; i < r.length; i += 3) {
        const x = r[i], z = r[i + 2], k = (x + 0.475) / 0.95;
        b[i] = x - k * k * 0.04; b[i + 1] = Math.sin(ph - x * 7 + z * 2) * 0.07 * k + Math.sin(ph * 1.7 - x * 11) * 0.02 * k; b[i + 2] = z;
      }
      V.cloth.updateVerticesData(BABYLON.VertexBuffer.PositionKind, b);
    }
  }

  frameZones(list) {
    for (const z of list) {
      let V = this.zones.get(z.id);
      if (!V) { V = this.zoneVis(z); this.zones.set(z.id, V); }
      const on = !!z.active;
      V.ring.setEnabled(on); V.disc.setEnabled(on); V.pillar.setEnabled(on);
      if (!on) continue;
      const col = z.owner ? TEAM[z.owner] : TEAM[0];
      const pulse = z.contested ? 0.55 + 0.45 * Math.sin(this.t * 9) : 1;
      V.rm.emissiveColor.set(col[0] * pulse, col[1] * pulse, col[2] * pulse);
      V.pm.emissiveColor.set(col[0], col[1], col[2]);
      // progress disc: the capturing side's colour, opacity by progress
      const lead = z.c > 0.02 ? 1 : z.c < -0.02 ? 2 : 0, cc = TEAM[lead];
      V.dm.emissiveColor.set(cc[0], cc[1], cc[2]); V.dm.alpha = 0.05 + 0.16 * Math.abs(z.c);
      V.ring.rotation.y = this.t * 0.2;
    }
  }

  frameTags(list) {
    const T = this.tagTemplate(), seen = new Set();
    for (const t of list) {
      seen.add(t.id);
      let m = this.tags.get(t.id);
      if (!m) { m = T.clone('obj_tag'); m.setEnabled(true); this.tags.set(t.id, m); this.keep(m); }
      m.position.set(t.x, t.y + 0.55 + Math.sin(this.t * 2.2 + t.x) * 0.06, t.z); m.rotation.y = this.t * 2.4 + t.z;
    }
    for (const [id, m] of this.tags) if (!seen.has(id)) { m.dispose(); this.tags.delete(id); const i = this.meshes.indexOf(m); if (i >= 0) this.meshes.splice(i, 1); }
  }

  // ----------------------------------------------------------------------------------------------- the explosion
  explode(e) {
    const sc = this.scene;
    const pos = { x: e.x, y: e.y + 0.5, z: e.z };
    try { Audio.nade('satchel', 'boom', { pos }); } catch (er) { /* ok */ }
    if (!this.fire) {
      const ball = BABYLON.MeshBuilder.CreateSphere('obj_fireball', { diameter: 1, segments: 12 }, sc);
      const fm = glow(sc, 'obj_fire', [1, 0.62, 0.25], 0.9); fm.disableDepthWrite = true; ball.material = fm; ball.isPickable = false;
      const smoke = BABYLON.MeshBuilder.CreateSphere('obj_smoke', { diameter: 1, segments: 10 }, sc);
      const sm = pbr(sc, 'obj_smoke_m', [0.16, 0.15, 0.14], 1); sm.alpha = 0.6; smoke.material = sm; smoke.isPickable = false;
      this.keep(ball); this.keep(smoke);
      this.fire = { ball, fm, smoke, sm, t: 9 };
    }
    const F = this.fire; F.t = 0; F.x = e.x; F.y = e.y; F.z = e.z;
    const me = this.g.local, cam = this.g.camera;
    if (cam && this.g.rig) {
      const d = Math.hypot(cam.position.x - e.x, cam.position.y - e.y, cam.position.z - e.z);
      const k = Math.max(0, 1 - d / 60);
      if (k > 0) { this.g.rig.shake(0.4 + 1.6 * k); this.g.rig.punch(3 * k, (Math.random() - 0.5) * 2 * k); }
      if (d < 22 && me) { try { Audio.tinnitus(2.5 * (1 - d / 22) + 0.5, { k: 1 - d / 22 }); } catch (er) { /* ok */ } }
    }
  }
  frameFire(dt) {
    const F = this.fire; F.t += dt;
    const on = F.t < 4;
    F.ball.setEnabled(F.t < 0.9); F.smoke.setEnabled(on);
    if (F.t < 0.9) {
      const k = F.t / 0.9, s = 2 + 13 * Math.sqrt(k);
      F.ball.position.set(F.x, F.y + 1 + 3 * k, F.z); F.ball.scaling.set(s, s * 0.8, s);
      F.fm.alpha = 0.95 * (1 - k); F.fm.emissiveColor.set(1, 0.75 - 0.4 * k, 0.35 - 0.3 * k);
    }
    if (on) {
      const k = F.t / 4, s = 4 + 12 * Math.sqrt(k);
      F.smoke.position.set(F.x, F.y + 2 + 6 * k, F.z); F.smoke.scaling.set(s, s * 0.7, s); F.sm.alpha = 0.55 * (1 - k) * Math.min(1, F.t * 3);
    }
  }

  // ----------------------------------------------------------------------------------------------- sounds for events
  onEvent(e) {
    const A = Audio, me = this.g.local;
    const at = e.actor && e.actor.pos ? { x: e.actor.pos.x, y: e.actor.pos.y + 1, z: e.actor.pos.z } : null;
    const mine = me && e.team === me.team;
    try {
      switch (e.kind + ':' + e.action) {
        case 'bomb:planted': A.sfx('bomb_planted', { pos: at || undefined }); if (!e.pre) A.radio(mine ? 'charge_planted' : 'charge_planted_enemy'); break;
        case 'bomb:defuse_start': A.sfx('bomb_defuse', { pos: at || undefined }); break;
        case 'bomb:defused': A.sfx('bomb_defused', { pos: at || undefined }); A.radio('charge_defused'); break;
        case 'bomb:picked': if (e.actor && e.actor.local) A.sfx('pickup'); break;
        case 'bomb:dropped': if (at) A.sfx('drop', { pos: at }); break;
        case 'hostage:picked': if (at) A.sfx('zip', { pos: at }); break;
        case 'hostage:rescued': A.ui('notify'); break;
        case 'flag:taken': case 'flag:returned': A.ui('notify'); break;
        case 'flag:captured': A.ui(mine ? 'unlock' : 'notify'); break;
        case 'zone:captured': if (!e.quiet) A.ui(mine ? 'unlock' : 'notify'); break;
        case 'zone:moved': A.ui('notify'); break;
        case 'tag:confirmed': case 'tag:denied': if (e.actor && e.actor.local) A.sfx('pickup'); break;
        case 'vip:escaped': case 'vip:killed': A.ui('notify'); break;
        case 'jugg:new': A.ui('notify'); break;
        default: break;
      }
    } catch (er) { /* audio never breaks the game */ }
  }

  dispose() {
    for (const f of this.offs) f(); this.offs.length = 0;
    for (const m of this.meshes) { try { m.dispose(); } catch (e) { /* gone */ } }
    for (const k in this.flags) { try { this.flags[k].root.dispose(); } catch (e) { /* gone */ } }
    for (const k in this.mats) { try { this.mats[k].dispose(); } catch (e) { /* gone */ } }
    this.meshes.length = 0; this.tags.clear(); this.zones.clear();
  }
}
