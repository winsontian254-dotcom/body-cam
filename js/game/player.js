/* LIVE FIRE — PlayerState factory, local input -> Command, movement application. PURE JS (no BABYLON, no DOM): the host,
   clients, bots and Node tests all use it.
   Exports:
     BTN                         move.js BTN + MODE (4096: fire-mode switch) — commands carry HELD buttons; edges are derived
                                 by comparing with the previous command (p.ws.btn), so commands stay valid over the network
     TEAM = { NONE: 0, VANGUARD: 1, SENTINEL: 2 }, TEAM_NAMES, TEAM_COLORS, teamName(t), isEnemy(a, b)
     SLOT_ORDER                  ['primary', 'secondary', 'melee', 'nade', 'bomb'] (next / prev weapon order)
     createPlayer({ id, name, team, bot, local, skill }) -> PlayerState (docs §4 + the runtime fields below)
     newCommand() -> Command     { seq, mx, mz, yaw, pitch, buttons, slot, nade }
     clearCommand(cmd, yaw, pitch) -> cmd (no movement, no buttons)
     copyCommand(dst, src) -> dst
     storePrev(p)                remember the state of the previous tick (render interpolation)
     resetForSpawn(p, spot, hp?) teleport + reset health / movement / timers (inventory untouched)
     LocalControls               class: new LocalControls(Input, Settings).build(cmd, view, { frozen, menu }) -> cmd
                                 (toggle crouch / ADS / walk settings, slot keys, wheel, fire mode)
     applyMovement(world, p, cmd, dt, speed, bodies) -> move events (moveStep wrapper; NaN guard)
     updateGait(p, dt)           advance the walk phase / amplitude (legs of hitboxes and bodies)
   PlayerState runtime extensions (all plain data): local, remote, skill, mv (move scratch), ws (weapon state, weapon.js),
     prev { x, y, z, eye, lean, crouch, yaw, pitch }, deadT (seconds dead), respawnT, dmgBy { id: { d, t } }, lastAttacker,
     lastHurtT, life { kills, dmg }, frozen, stat { shots, hits }, lastSpawn, connected, gait (walk phase, rad) / gaitK (0..1)
     (updateGait after each movement step; hitbox.js swings the legs with them). */
import { BTN as MOVE_BTN, moveStep, resetMove, eyeHeight, newMoveState } from '../phys/move.js';
import { newWeaponState } from './weapon.js';

export const BTN = Object.freeze({ ...MOVE_BTN, MODE: 4096 });
export const TEAM = Object.freeze({ NONE: 0, VANGUARD: 1, SENTINEL: 2 });
export const TEAM_NAMES = { 0: 'FREE', 1: 'VANGUARD', 2: 'SENTINEL' };
export const TEAM_COLORS = { 0: '#d8d4c8', 1: '#e0a33a', 2: '#4fa3e0' };
export const teamName = t => TEAM_NAMES[t] || 'FREE';
/** Two players are enemies when they are different players and not on the same team (team 0 = everyone is an enemy). */
export const isEnemy = (a, b) => !!a && !!b && a !== b && (a.team === 0 || b.team === 0 || a.team !== b.team);
export const SLOT_ORDER = ['primary', 'secondary', 'melee', 'nade', 'bomb'];

export function createPlayer({ id, name = 'Operator', team = 0, bot = false, local = false, skill = 0.5 } = {}) {
  return {
    id, name: String(name).slice(0, 24), team, bot: !!bot, local: !!local, remote: false, alive: false, connected: true,
    hp: 100, armor: 0, helmet: false,
    pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0, crouch: 0, lean: 0, onGround: true, mantle: null,
    inv: { primary: null, secondary: null, melee: null, nades: [], bomb: false, kit: false },
    cur: 'secondary', curNade: null, lastSlot: 'melee',
    money: 0, kills: 0, deaths: 0, assists: 0, score: 0, damageDone: 0, headshots: 0, mvps: 0, ping: 0,
    flash: 0, tagged: 0, lastCmdSeq: 0, spawnProtect: 0,
    // runtime
    skill, mv: newMoveState(), ws: newWeaponState(), frozen: false,
    prev: { x: 0, y: 0, z: 0, eye: 1.64, lean: 0, crouch: 0, yaw: 0, pitch: 0 },
    deadT: 0, respawnT: 0, dmgBy: {}, lastAttacker: null, lastHurtT: -99, life: { kills: 0, dmg: 0 },
    stat: { shots: 0, hits: 0 }, lastSpawn: null, gait: 0, gaitK: 0,
  };
}

export function newCommand() { return { seq: 0, mx: 0, mz: 0, yaw: 0, pitch: 0, buttons: 0, slot: null, nade: null }; }
export function clearCommand(cmd, yaw, pitch) {
  cmd.mx = 0; cmd.mz = 0; cmd.buttons = 0; cmd.slot = null; cmd.nade = null;
  if (yaw != null) cmd.yaw = yaw; if (pitch != null) cmd.pitch = pitch;
  return cmd;
}
export function copyCommand(d, s) {
  d.seq = s.seq | 0; d.mx = +s.mx || 0; d.mz = +s.mz || 0; d.yaw = +s.yaw || 0; d.pitch = +s.pitch || 0; d.buttons = s.buttons | 0;
  d.slot = s.slot || null; d.nade = s.nade || null; return d;
}

export function storePrev(p) {
  const q = p.prev; q.x = p.pos.x; q.y = p.pos.y; q.z = p.pos.z; q.eye = eyeHeight(p); q.lean = p.lean; q.crouch = p.crouch;
  q.yaw = p.yaw; q.pitch = p.pitch;
}

export function resetForSpawn(p, spot, hp = 100) {
  p.pos.x = spot.x; p.pos.y = spot.y; p.pos.z = spot.z;
  p.yaw = spot.yaw || 0; p.pitch = 0; p.crouch = 0; p.lean = 0; p.onGround = false;
  resetMove(p);
  p.hp = hp; p.alive = true; p.flash = 0; p.tagged = 0; p.deadT = 0; p.respawnT = 0; p.dmgBy = {}; p.lastAttacker = null;
  p.life.kills = 0; p.life.dmg = 0; p.lastSpawn = { x: spot.x, y: spot.y, z: spot.z };
  storePrev(p);
}

/** Local keyboard / mouse -> Command, once per tick. Handles the toggle settings, slot keys, the wheel and the fire mode key. */
export class LocalControls {
  constructor(input, settings) {
    this.I = input; this.S = settings; this.tog = { crouch: false, ads: false, walk: false }; this.seq = 0;
    this.off = settings.onChange(({ key }) => { if (key === 'toggleCrouch' || key === 'toggleADS' || key === 'toggleWalk') this.reset(); });
  }
  reset() { this.tog.crouch = this.tog.ads = this.tog.walk = false; }
  dispose() { if (this.off) this.off(); }
  _hold(action, setting, tkey) {
    const I = this.I;
    if (!this.S.get(setting)) return I.down(action);
    if (I.pressed(action)) this.tog[tkey] = !this.tog[tkey];
    return this.tog[tkey];
  }
  /** opts: { frozen (freeze time: look + switch only), menu (UI open: nothing), dead } */
  build(cmd, view, opts = {}) {
    const I = this.I;
    clearCommand(cmd, view.yaw, view.pitch);
    cmd.seq = ++this.seq;
    if (opts.menu) { this.reset(); return cmd; }
    let b = 0;
    if (I.down('fire')) b |= BTN.FIRE;
    if (this._hold('ads', 'toggleADS', 'ads')) b |= BTN.ADS;
    if (I.down('reload')) b |= BTN.RELOAD;
    if (I.down('use')) b |= BTN.USE;
    if (I.down('inspect')) b |= BTN.INSPECT;
    if (I.down('alt')) b |= BTN.ALT;
    if (I.down('drop')) b |= BTN.DROP;
    if (I.down('firemode')) b |= BTN.MODE;
    if (!opts.frozen) {
      const m = I.move(); cmd.mx = m.mx; cmd.mz = m.mz;
      if (I.down('jump')) b |= BTN.JUMP;
      if (this._hold('crouch', 'toggleCrouch', 'crouch')) b |= BTN.CROUCH;
      if (this._hold('walk', 'toggleWalk', 'walk')) b |= BTN.WALK;
      if (I.down('leanL')) b |= BTN.LEANL;
      if (I.down('leanR')) b |= BTN.LEANR;
    } else {
      b &= ~(BTN.FIRE | BTN.ADS);
      if (this._hold('crouch', 'toggleCrouch', 'crouch')) b |= BTN.CROUCH;
    }
    cmd.buttons = b;
    if (I.pressed('slot1')) cmd.slot = 'primary';
    else if (I.pressed('slot2')) cmd.slot = 'secondary';
    else if (I.pressed('slot3')) cmd.slot = 'melee';
    else if (I.pressed('slot4')) cmd.slot = 'nade';
    else if (I.pressed('slot5')) cmd.slot = 'bomb';
    else if (I.pressed('grenade')) cmd.slot = 'nade';
    else if (I.pressed('next')) cmd.slot = 'next';
    else if (I.pressed('prev')) cmd.slot = 'prev';
    return cmd;
  }
}

/** Walk gait for the leg swing: phase advances with the horizontal speed (half a cycle per 1.1 m stride), amplitude eases with speed. */
export function updateGait(p, dt) {
  const sp = p.onGround && !p.mantle ? Math.hypot(p.vel.x, p.vel.z) : 0;
  const want = sp < 0.25 ? 0 : Math.min(1, sp / 4.5) * (1 - 0.45 * (p.crouch || 0));
  p.gaitK += (want - p.gaitK) * Math.min(1, dt * 8);
  if (p.gaitK < 0.005) p.gaitK = 0;
  p.gait = (p.gait + sp * dt * Math.PI / 1.1) % (Math.PI * 2);
}

/** moveStep with a NaN guard (a corrupt state must never poison the world or the network). */
export function applyMovement(world, p, cmd, dt, speed, bodies) {
  const ev = moveStep(world, p, cmd, dt, speed, bodies ? { bodies } : undefined);
  if (!Number.isFinite(p.pos.x) || !Number.isFinite(p.pos.y) || !Number.isFinite(p.pos.z)) {
    const s = p.lastSpawn || p.prev;
    p.pos.x = s.x; p.pos.y = s.y; p.pos.z = s.z; resetMove(p);
  }
  if (!Number.isFinite(p.vel.x) || !Number.isFinite(p.vel.y) || !Number.isFinite(p.vel.z)) { p.vel.x = p.vel.y = p.vel.z = 0; }
  return ev;
}
