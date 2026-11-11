/* LIVE FIRE — Game session (docs §4): its own BABYLON.Scene (disposed on end), the map, environment and post pipeline, players,
   systems, the match, authority ('local' | 'host' | 'client').
   Exports:
     createGame(cfg) -> Promise<Game>
       cfg = { mapId, modeId, authority = 'local', seed, bots = 0, botSkill = .45, maxPlayers, quality (tier override),
               local: { name, team? (1|2; 0/undefined = auto), loadout?, profileLevel }, net?, options: { friendlyFire: false (always
               off), infiniteAmmo, infiniteMag, armor = 100, helmet = true, hp = 100, warmupTime, freezeTime, timeLimit, scoreLimit,
               god, botMode: 'normal' | 'passive' (never shoot) | 'static' (stand still: practice targets) },
               onProgress(stage, k) }
     class Game (window.LF.game during a match)
       scene, camera, world, map (MapInfo), def (MapDef), mode (ModeDef), match (Match), bus (per-game Bus), players (Map id ->
       PlayerState), local (the local PlayerState), localId, authority, time, tick, rng, options, drops, env, fx, view { yaw, pitch },
       ready, ended, paused
       addSystem(sys) / getSystem(name) / removeSystem(sys)   sys = { name, tick?(dt), frame?(dt, alpha), late?(dt), dispose?() }
       addCommandFilter(fn(p, cmd, dt)) -> off   runs on every simulated player's command after it was built (objectives: p.ibtn,
         plant / defuse locks, held seekers); movement uses moveSpeed(p) * p.speedMul; p.noPickup blocks weapon pickups
       addPlayer({ name, team, bot, id, skill, loadout, remote }) -> PlayerState,  removePlayer(id)
       spawn(p, spot?, { lobby, round }) (picks a spawn: lobby spawns at round start, field spawns far from and out of sight of
         enemies on respawn, team 0 spawns in FFA),  pickSpawn(p, opts) -> spot
       damage(victim, info) -> dealt   THE only way to hurt anyone (combat.applyDamage: friendly fire OFF, armour, credit)
       kill(victim, info), giveWeapon(p, gunId, slot?, mods?) -> weapon, giveLoadout(p, loadout), setTeam(p, team)
       throwNade(p, gid, opts) -> bool   (delegates to a registered 'nades' system; false when there is none)
       setLocalCommand(partialCmd | null)   test / automation override of the local player's command (yaw / pitch default to view)
       setView(yaw, pitch), aimAt(point | player, part = 'chest')    point the local view (tests)
       setMenu(open)       an in-game menu is open: no local input; a local game pauses the simulation
       debugStep(seconds)  advance the simulation synchronously (64 Hz ticks, no rendering) — headless tests
       stats() -> summary   end(reason)   dispose()
     setBodyFactory(fn)    third-person characters: fn(scene, game) -> system (default: js/game/bodies.js placeholder bodies);
                           js/chars/human.js registers itself here when it exists (charsReady); a system with a `ready`
                           promise is awaited before the match starts
     Audio, audioReady     a proxy of js/audio/audio.js Audio (loaded lazily; calls are no-ops until it has loaded or if it fails)
   Authority: 'local' and 'host' simulate everything here (host: game.net.tick(game, dt) broadcasts); 'client' only predicts the
   local player's movement and weapon (remote players have p.remote = true and are written by the net layer), detects its own hits
   and sends them as claims (combat.applyDamage -> game.net.claimHit), and mirrors the host's match (match.apply(snapshot)).
   Tick order: storePrev -> commands (local controls | override | bot brain) -> movement (moveStep, players block each other)
   -> footsteps / landing / fall damage -> drop / use / pickups -> weapon state machine (fires through combat.js) -> drops ->
   match (+ mode) -> net. Frame order: local look -> systems.frame (camera, viewmodel, bodies, effects...) -> map.update ->
   render -> systems.late (HUD). */
import { Settings } from '../core/settings.js';
import { Input } from '../core/input.js';
import { onTick, onFrame, onLateFrame, setScene, TICK_DT, setPaused, isPaused } from '../core/loop.js';
import { getEngine } from '../core/engine.js';
import { Bus } from '../core/events.js';
import { rand, hash, clamp } from '../core/util.js';
import { DEV } from '../core/dev.js';
import { buildMap } from '../maps/builder.js';
import { loadMapDef } from '../maps/index.js';
import { applyEnvironment } from '../gfx/env.js';
import { createPipeline } from '../gfx/postfx.js';
import { applyQuality, resolveTier } from '../gfx/quality.js';
import { freezeMaterials } from '../gfx/materials.js';
import { loadMode } from '../modes/index.js';
import { Match } from './match.js';
import { createPlayer, LocalControls, newCommand, storePrev, resetForSpawn, applyMovement, updateGait, isEnemy, BTN, clearCommand, copyCommand } from './player.js';
import { weaponTick, makeWeapon, moveSpeed, dropsTick, tryPickup, dropWeapon, selectSlot, newWeaponState, currentWeapon, statsOf } from './weapon.js';
import { applyDamage, killPlayer } from './combat.js';
import { aimPoint } from './hitbox.js';
import { fallDamage, eyePos } from '../phys/move.js';
import { BotManager, SKILLS } from '../bots/bot.js';
import { CameraRig } from './camera.js';
import { Viewmodel } from './viewmodel.js';
import { Effects } from './effects.js';
import { Bodies } from './bodies.js';
import { ObjectiveVisuals } from './objvis.js';
import { DEFAULT_LOADOUT, GUNS, getGun } from '../weapons/data.js';
import { initGunKit } from '../weapons/models.js';

/* Audio is loaded lazily behind a proxy: a missing or broken js/audio/audio.js (or one still loading) never stops a match; calls
   before it arrives are dropped. Bound methods are cached, so per-frame calls (listener) allocate nothing. */
let audioImpl = null;
const audioFns = new Map(), audioNoop = () => {};
export const Audio = new Proxy({}, { get(_, k) {
  let f = audioFns.get(k);
  if (!f) { f = (...a) => { const A = audioImpl, fn = A && A[k]; if (typeof fn === 'function') { try { return fn.apply(A, a); } catch (e) { /* audio never breaks the game */ } } }; audioFns.set(k, f); }
  return audioImpl ? f : audioNoop;
} });
export const audioReady = import('../audio/audio.js').then(m => { audioImpl = m.Audio || null; return audioImpl; })
  .catch(e => { console.warn('[game] audio unavailable: ' + ((e && e.message) || e)); return null; });

let bodyFactory = (scene, game) => new Bodies(scene, game);
export function setBodyFactory(fn) { if (typeof fn === 'function') bodyFactory = fn; }
/* the real characters (js/chars/human.js) replace the placeholder bodies; a broken or missing module keeps the placeholders */
export const charsReady = import('../chars/human.js').then(m => { if (m.createCharacters) setBodyFactory(m.createCharacters); })
  .catch(e => console.warn('[game] characters unavailable: ' + ((e && e.message) || e)));

const BOT_NAMES = ['Kowalski', 'Reyes', 'Haddad', 'Lindqvist', 'Okafor', 'Brandt', 'Moreau', 'Tanaka', 'Novak', 'Duarte', 'Sato', 'Ferris',
  'Quinn', 'Varga', 'Mbeki', 'Castellan', 'Ilves', 'Rourke', 'Achterberg', 'Petrov', 'Salo', 'Whitlock', 'Oyelaran', 'Kask'];
const BOT_PRIMARY = { rifle: 6, carbine: 3, smg: 4, shotgun: 1, br: 1, dmr: 1, lmg: 0.4, sniper: 0.5 };

export async function createGame(cfg = {}) {
  const engine = getEngine();
  if (!engine) throw new Error('createGame: the engine is not running');
  const game = new Game(cfg);
  try { await game.init(engine); }
  catch (e) { try { game.dispose(); } catch (e2) { /* partial init */ } throw e; }
  return game;
}

export class Game {
  constructor(cfg) {
    this.cfg = cfg;
    this.mapId = cfg.mapId || 'dev_range'; this.modeId = cfg.modeId || 'tdm';
    this.authority = cfg.authority === 'host' || cfg.authority === 'client' ? cfg.authority : 'local';
    this.seed = (cfg.seed != null ? +cfg.seed : (Date.now() & 0xffffff)) >>> 0;
    this.rng = rand(this.seed ^ 0x5bd1e995);
    this.bus = new Bus('game');
    this.players = new Map(); this.systems = []; this.cmds = new Map(); this.drops = [];
    this.time = 0; this.tick = 0; this.localId = null; this.local = null; this.ready = false; this.ended = false; this.paused = false;
    this.menuOpen = false; this.override = null; this.view = { yaw: 0, pitch: 0 }; this.net = cfg.net || null; this.spectate = null;
    this.offs = []; this.botN = 0; this._bodies = []; this._ent = []; this.cmdFilters = [];
  }

  progress(stage, k) { if (this.cfg.onProgress) { try { this.cfg.onProgress(stage, k); } catch (e) { /* UI only */ } } }

  async init(engine) {
    const cfg = this.cfg;
    this.progress('mode', 0.02);
    this.mode = await loadMode(this.modeId);
    this.options = { ...(this.mode.defaults || {}), ...(cfg.options || {}), friendlyFire: false };
    this.progress('map', 0.05);
    this.def = await loadMapDef(this.mapId);
    if (!this.def) throw new Error('Map "' + this.mapId + '" could not be loaded');
    const scene = this.scene = new BABYLON.Scene(engine);
    scene.skipPointerMovePicking = true;
    scene.clearColor = new BABYLON.Color4(0.02, 0.022, 0.025, 1);
    scene.setRenderingAutoClearDepthStencil(1, true, true, true);
    this.rig = new CameraRig(scene, this);
    this.camera = this.rig.camera;
    scene.activeCamera = this.camera;
    this.tier = resolveTier(cfg.quality || Settings.get('quality'), engine);
    applyQuality(engine, scene, this.tier);
    this.progress('geometry', 0.1);
    this.map = await buildMap(scene, this.def, { quality: this.tier, onProgress: s => this.progress(s, 0.4) });
    this.world = this.map.world;
    this.progress('environment', 0.6);
    this.env = await applyEnvironment(scene, this.def.env || {}, { quality: this.tier, camera: this.camera, world: this.world });
    if (this.env) {
      if (this.env.addShadowCasters) this.env.addShadowCasters(this.map.casters);
      else if (this.env.shadow) for (const m of this.map.casters) { try { this.env.shadow.addShadowCaster(m, false); } catch (e) { /* not a mesh */ } }
    }
    this.progress('pipeline', 0.7);
    this.fx = createPipeline(scene, this.camera, { quality: this.tier, lens: DEV.nolens ? 'off' : Settings.get('lens'), motionBlur: Settings.get('motionBlur') });
    this.offs.push(Settings.onChange(({ key, value }) => {
      if (!this.fx) return;
      if (key === 'lens' && !DEV.nolens) this.fx.setLens(value);
      if (key === 'motionBlur') this.fx.setMotionBlur(!!value);
    }));
    this.progress('weapons', 0.75);
    await initGunKit(scene);
    // systems
    this.addSystem(this.rig);
    this.bots = this.addSystem(new BotManager(this));
    this.effects = this.addSystem(new Effects(scene, this));
    await charsReady;
    this.bodies = this.addSystem(bodyFactory(scene, this));
    if (this.bodies && this.bodies.ready) { this.progress('characters', 0.78); await this.bodies.ready; }
    this.viewmodel = this.addSystem(new Viewmodel(scene, this, this.rig));
    this.objvis = this.addSystem(new ObjectiveVisuals(scene, this));     // charge, hostages, flags, zones, tags (objectives.js state)
    this.addSystem(new SoundSystem(this));
    // players
    this.match = new Match(this, this.mode, this.options);
    this.controls = new LocalControls(Input, Settings);
    const L = cfg.local || {};
    const ffa = this.mode.teams === 0;
    const total = Math.max(0, Math.min(31, cfg.bots | 0));
    const lp = this.addPlayer({ id: 'p1', name: L.name || 'Operator', team: ffa ? 0 : (L.team === 1 || L.team === 2 ? L.team : 0), loadout: L.loadout, local: true });
    this.localId = lp.id; this.local = lp;
    const skill = cfg.botSkill != null ? +cfg.botSkill : SKILLS.normal;
    for (let i = 0; i < total; i++) this.addPlayer({ bot: true, skill: clamp(skill + (this.rng() - 0.5) * 0.16, 0.05, 1) });
    this.progress('warmup', 0.85);
    this.match.start();
    const sp = lp.alive ? lp : null;
    if (sp) { this.view.yaw = sp.yaw; this.view.pitch = 0; }
    // render setup
    if (this.env && this.env.shadow && this.bodies.casters) for (const m of this.bodies.casters()) { try { this.env.shadow.addShadowCaster(m, false); } catch (e) { /* ok */ } }
    try { freezeMaterials(scene); } catch (e) { /* optional */ }
    this.offs.push(onTick(dt => this._tick(dt)));
    this.offs.push(onFrame((dt, a) => this._frame(dt, a)));
    this.offs.push(onLateFrame(dt => this._late(dt)));
    if (Audio.setSpace) Audio.setSpace({ reverb: (this.def.env && this.def.env.reverb) || 'outdoor', surface: 'concrete' });
    if (Audio.ambience) Audio.ambience((this.def.env && this.def.env.ambience) || 'outdoor', { rain: this.def.env && this.def.env.weather === 'rain' });
    setScene(scene);
    Input.setGameActive(true);
    this.ready = true;
    this.progress('ready', 1);
    this.bus.emit('game:ready', {});
  }

  // ------------------------------------------------------------------------------------------------ systems
  addSystem(sys) { if (sys && !this.systems.includes(sys)) this.systems.push(sys); return sys; }
  getSystem(name) { return this.systems.find(s => s && s.name === name) || null; }
  removeSystem(sys) { const i = this.systems.indexOf(sys); if (i >= 0) this.systems.splice(i, 1); try { sys.dispose && sys.dispose(); } catch (e) { console.error(e); } }
  addCommandFilter(fn) { this.cmdFilters.push(fn); return () => { const i = this.cmdFilters.indexOf(fn); if (i >= 0) this.cmdFilters.splice(i, 1); }; }

  // ------------------------------------------------------------------------------------------------ players
  addPlayer(o = {}) {
    const ffa = this.mode.teams === 0;
    let team = ffa ? 0 : o.team;
    if (!ffa && team !== 1 && team !== 2) {
      let n1 = 0, n2 = 0; for (const q of this.players.values()) { if (q.team === 1) n1++; else if (q.team === 2) n2++; }
      team = n1 <= n2 ? 1 : 2;
    }
    let id = o.id;
    if (!id) { id = o.bot ? 'b' + (++this.botN) : 'n' + (++this.botN); }
    let name = o.name;
    if (!name && o.bot) {   // a free name from the roster (seeded order), numbered when the roster runs out
      const used = new Set([...this.players.values()].map(q => q.name)), k0 = hash(this.seed + ':names') % BOT_NAMES.length;
      for (let i = 0; i < BOT_NAMES.length && !name; i++) { const n = BOT_NAMES[(k0 + i * 7) % BOT_NAMES.length]; if (!used.has(n)) name = n; }
      if (!name) name = 'Bot ' + this.botN;
    }
    name = name || 'Operator';
    const p = createPlayer({ id, name, team, bot: !!o.bot, local: !!o.local, skill: o.skill ?? 0.5 });
    p.remote = !!o.remote;
    p.loadout = o.loadout || (o.bot ? this.botLoadout() : null);
    this.players.set(id, p);
    this.cmds.set(id, newCommand());
    if (p.bot) this.bots.brain(p);
    this.giveLoadout(p, p.loadout);
    if (this.bodies && this.bodies.add) this.bodies.add(p);
    this.bus.emit('player:join', { p });
    if (this.match && this.match.phase !== 'warmup' && this.match.round > 0 && this.mode.respawn && this.match.phase !== 'over') this.spawn(p, null, { lobby: this.match.phase !== 'live' });
    return p;
  }
  removePlayer(id) {
    const p = this.players.get(id); if (!p) return;
    if (p.alive) { p.alive = false; }
    this.players.delete(id); this.cmds.delete(id);
    if (this.bots) this.bots.remove(id);
    if (this.bodies && this.bodies.remove) this.bodies.remove(p);
    this.bus.emit('player:leave', { p });
  }
  botLoadout() {
    const r = this.rng, tot = Object.values(BOT_PRIMARY).reduce((a, b) => a + b, 0);
    let x = r() * tot, cat = 'rifle';
    for (const [k, v] of Object.entries(BOT_PRIMARY)) { x -= v; if (x <= 0) { cat = k; break; } }
    const list = GUNS.filter(g => g.cat === cat && g.slot === 'primary');
    const prim = list.length ? list[Math.floor(r() * list.length)].id : DEFAULT_LOADOUT.primary;
    const pistols = GUNS.filter(g => g.cat === 'pistol');
    const sec = r() < 0.6 ? DEFAULT_LOADOUT.secondary : pistols[Math.floor(r() * pistols.length)].id;
    return { primary: prim, secondary: sec, melee: 'knife', nades: DEFAULT_LOADOUT.nades.slice() };
  }
  giveLoadout(p, lo) {
    lo = lo || DEFAULT_LOADOUT;
    p.inv.primary = lo.primary && getGun(lo.primary) ? makeWeapon(lo.primary, { mods: lo.mods && lo.mods[lo.primary] }) : null;
    p.inv.secondary = lo.secondary && getGun(lo.secondary) ? makeWeapon(lo.secondary, { mods: lo.mods && lo.mods[lo.secondary] }) : null;
    p.inv.melee = makeWeapon(lo.melee && getGun(lo.melee) ? lo.melee : 'knife');
    const nades = [];
    for (const gid of lo.nades || []) { const e = nades.find(n => n.gid === gid); if (e) e.n++; else nades.push({ gid, n: 1 }); }
    p.inv.nades = nades; p.curNade = nades.length ? nades[0].gid : null;
    p.cur = p.inv.primary ? 'primary' : p.inv.secondary ? 'secondary' : 'melee';
    p.ws = newWeaponState(); p.ws.state = 'draw'; p.ws.dur = 0.3;
  }
  giveWeapon(p, gunId, slot, mods) {
    const g = getGun(gunId); if (!g) return null;
    const w = makeWeapon(gunId, { mods }); slot = slot || g.slot;
    p.inv[slot] = w;
    selectSlot(this, p, slot);
    return w;
  }
  setTeam(p, team) {
    if (p.team === team) return;
    if (p.alive) { p.alive = false; this.bus.emit('player:team', { p, team }); }
    p.team = team;
    if (this.mode.respawn && this.match.phase === 'live') this.match.respawnIn(p, 1);
  }

  pickSpawn(p, opts = {}) {
    const S = this.map.spawns, ffa = this.mode.teams === 0 || p.team === 0;
    let list;
    if (ffa) list = S[0] && S[0].length ? S[0] : null;
    else if (opts.lobby) list = (S[p.team] || []).filter(s => !s.field);
    else list = (S[p.team] || []).filter(s => s.field);
    if (!list || !list.length) list = (S[p.team] || []).length ? S[p.team] : (S[0] || []).length ? S[0] : [...(S[1] || []), ...(S[2] || [])];
    if (!list.length) return { x: 0, y: 1, z: 0, yaw: 0 };
    const alive = [...this.players.values()].filter(q => q.alive && q !== p);
    const occupied = s => alive.some(q => Math.hypot(q.pos.x - s.x, q.pos.z - s.z) < 0.9 && Math.abs(q.pos.y - s.y) < 1.5);
    if (opts.lobby) {
      const free = list.filter(s => !occupied(s));
      const pool = free.length ? free : list;
      return pool[Math.floor(this.rng() * pool.length)];
    }
    // respawn: far from enemies and out of their sight
    const foes = alive.filter(q => isEnemy(p, q));
    const nav = this.map.nav, E = { x: 0, y: 0, z: 0 }, T = { x: 0, y: 0, z: 0 };
    let best = null, bs = -Infinity;
    for (const s of list) {
      let dmin = 80, seen = false;
      for (const q of foes) {
        const d = Math.hypot(q.pos.x - s.x, q.pos.z - s.z, (q.pos.y - s.y) * 2);
        if (d < dmin) dmin = d;
        if (!seen && d < 70 && nav) { eyePos(q, E); T.x = s.x; T.y = s.y + 1.5; T.z = s.z; if (nav.losClear(E, T)) seen = true; }
      }
      const sc = dmin - (seen ? 45 : 0) - (occupied(s) ? 200 : 0) + this.rng() * 6;
      if (sc > bs) { bs = sc; best = s; }
    }
    return best || list[0];
  }

  spawn(p, spot, opts = {}) {
    if (this.authority === 'client' && !opts.force) return p;
    if (!spot) spot = this.pickSpawn(p, opts);
    resetForSpawn(p, spot, this.options.hp || 100);
    p.armor = this.options.armor ?? 100; p.helmet = this.options.helmet ?? true;
    if (opts.round || this.mode.respawn || !p.inv.primary && !p.inv.secondary) this.giveLoadout(p, p.loadout || (p.bot ? this.botLoadout() : null));
    p.spawnProtect = opts.lobby ? 0 : this.match.limit.spawnProtect;
    p.mantle = null;
    if (p.local) { this.view.yaw = p.yaw; this.view.pitch = 0; this.spectate = null; }
    this.bus.emit('spawn', { p, spot, lobby: !!opts.lobby });
    if (this.mode.onSpawn) this.mode.onSpawn(this, p);
    return p;
  }
  resetRound() { this.drops.length = 0; this.bus.emit('round:reset', {}); }

  damage(victim, info) { return applyDamage(this, victim, info); }
  kill(victim, info = {}) { return killPlayer(this, victim, info); }
  onKill(ev) {
    const v = ev.victim;
    if (this.authority !== 'client') {
      if (v.inv.primary) dropWeapon(this, v, 'primary', { speed: 1.2 }); else if (v.inv.secondary) dropWeapon(this, v, 'secondary', { speed: 1.2 });
      this.match.onKill(ev);
    }
  }
  throwNade(p, gid, opts) { const s = this.getSystem('nades'); return !!(s && s.throw && s.throw(p, gid, opts)); }

  // ------------------------------------------------------------------------------------------------ local control
  setLocalCommand(c) { this.override = c ? { ...c } : null; }
  setView(yaw, pitch) { this.view.yaw = yaw; this.view.pitch = clamp(pitch, -1.55, 1.55); }
  aimAt(t, part = 'chest') {
    const p = this.local; if (!p) return;
    const E = eyePos(p, { x: 0, y: 0, z: 0 });
    const T = t && t.pos ? aimPoint(t, part, { x: 0, y: 0, z: 0 }, this.tick) : t;
    const dx = T.x - E.x, dy = T.y - E.y, dz = T.z - E.z;
    this.setView(Math.atan2(dx, dz), -Math.atan2(dy, Math.hypot(dx, dz)));
  }
  setMenu(open) {
    this.menuOpen = !!open;
    if (this.authority === 'local') { this.paused = this.menuOpen; setPaused(this.paused); }
    if (open) Input.clear && Input.clear();
  }
  lookActive() { return !this.menuOpen && !this.ended && (Input.locked || Input.mouseUnlocked || !!this.override); }

  localCommand(p, cmd) {
    const frozen = this.match.isFrozen();
    if (this.override) {
      clearCommand(cmd, this.view.yaw, this.view.pitch);
      const o = this.override;
      if (o.mx != null) cmd.mx = o.mx; if (o.mz != null) cmd.mz = o.mz; if (o.buttons != null) cmd.buttons = o.buttons | 0;
      if (o.yaw != null) cmd.yaw = o.yaw; if (o.pitch != null) cmd.pitch = o.pitch;
      if (o.slot) { cmd.slot = o.slot; this.override.slot = null; }
      cmd.seq++;
      return cmd;
    }
    return this.controls.build(cmd, this.view, { frozen, menu: this.menuOpen || !(Input.locked || Input.mouseUnlocked) });
  }

  // ------------------------------------------------------------------------------------------------ simulation
  _tick(dt) {
    if (!this.ready || this.ended) return;
    this.tick++; this.time += dt;
    for (const s of this.systems) if (s.tick) s.tick(dt);
    const frozen = this.match.isFrozen();
    const world = this.world, minY = (this.def.bounds && this.def.bounds.minY != null ? this.def.bounds.minY : -50) - 12;
    const ent = this._ent; ent.length = 0;
    for (const q of this.players.values()) if (q.alive) ent.push(q);
    for (const p of this.players.values()) {
      storePrev(p);
      if (!p.alive) { p.deadT += dt; continue; }
      if (p.remote) continue;
      if (this.authority === 'client' && !p.local) continue;
      const cmd = this.cmds.get(p.id);
      if (p.local) this.localCommand(p, cmd);
      else if (p.bot) {
        const b = this.bots.brain(p); b.think(dt, cmd);
        const bm = this.options.botMode;                 // practice targets: 'static' (stand still) | 'passive' (move, never shoot)
        if (bm === 'static') { cmd.mx = 0; cmd.mz = 0; cmd.buttons = 0; cmd.slot = null; cmd.yaw = p.yaw; cmd.pitch = p.pitch; }
        else if (bm === 'passive') cmd.buttons &= ~(BTN.FIRE | BTN.ADS);
      }
      else clearCommand(cmd, p.yaw, p.pitch);
      p.frozen = frozen;
      if (frozen) { cmd.mx = 0; cmd.mz = 0; cmd.buttons &= ~(BTN.FIRE | BTN.JUMP | BTN.ADS | BTN.LEANL | BTN.LEANR); }
      for (let i = 0; i < this.cmdFilters.length; i++) this.cmdFilters[i](p, cmd, dt);     // objectives (match.js / objectives.js)
      p.lastCmdSeq = cmd.seq;
      if (p.spawnProtect > 0) { p.spawnProtect = Math.max(0, p.spawnProtect - dt); if (cmd.mx || cmd.mz) p.spawnProtect = Math.max(0, p.spawnProtect - dt * 2); }
      if (p.flash > 0) p.flash = Math.max(0, p.flash - dt);
      if (p.stun > 0) p.stun = Math.max(0, p.stun - dt);
      // movement (other live players block)
      const bodies = this._bodies; let nb = 0;
      for (let i = 0; i < ent.length; i++) {
        const q = ent[i]; if (q === p) continue;
        let b = bodies[nb]; if (!b) b = bodies[nb] = { x: 0, y: 0, z: 0, r: 0.32, h: 1.8 };
        b.x = q.pos.x; b.y = q.pos.y; b.z = q.pos.z; b.h = 1.8 - 0.55 * (q.crouch || 0); nb++;
      }
      bodies.length = nb;
      const ev = applyMovement(world, p, cmd, dt, moveSpeed(p) * (p.speedMul || 1), nb ? bodies : null);
      updateGait(p, dt);
      if (ev.footstep) this.bus.emit('footstep', { p, surf: ev.footstep, loud: ev.loud });
      if (ev.jumped) this.bus.emit('jump', { p });
      if (ev.mantled) this.bus.emit('mantle', { p, kind: ev.mantled });
      if (ev.landed) {
        this.bus.emit('land', { p, speed: ev.landed, surf: ev.surf });
        const fd = fallDamage(ev.landed);
        if (fd > 0) this.damage(p, { attacker: null, dmg: fd, kind: 'fall', group: 'leg' });
        if (!p.alive) continue;
      }
      // drop / use (edges against the previous buttons), then the weapon
      const prevB = p.ws.btn, pressed = cmd.buttons & ~prevB;
      if ((pressed & BTN.DROP) && !frozen) dropWeapon(this, p, p.cur);
      if (this.drops.length && !p.noPickup) tryPickup(this, p, !!(pressed & BTN.USE));
      if (pressed & BTN.USE) this.bus.emit('use', { p });
      weaponTick(this, p, cmd, dt);
      if (p.alive && p.pos.y < minY) this.damage(p, { attacker: null, dmg: 1000, kind: 'world', group: 'chest' });
    }
    if (this.drops.length) dropsTick(this, dt);
    if (this.authority !== 'client') this.match.tick(dt);
    if (this.net && this.net.tick) this.net.tick(this, dt);
  }

  debugStep(seconds = 1) {
    const n = Math.max(0, Math.round(seconds / TICK_DT));
    for (let i = 0; i < n && !this.ended; i++) this._tick(TICK_DT);
    return this.stats();
  }

  _frame(dt, alpha) {
    if (!this.ready) return;
    const lk = Input.look();
    const p = this.local;
    if (p && p.alive && this.lookActive() && !this.paused) {
      this.view.yaw += lk.dx;
      this.view.pitch = clamp(this.view.pitch + lk.dy, -1.55, 1.55);
    }
    if (this.paused || isPaused()) alpha = 1;
    for (const s of this.systems) if (s.frame) s.frame(dt, alpha);
    if (this.map && this.map.update) this.map.update(dt);
  }
  _late(dt) { if (!this.ready) return; for (const s of this.systems) if (s.late) s.late(dt); }

  stats() {
    const ps = [...this.players.values()];
    return { time: +this.time.toFixed(3), tick: this.tick, phase: this.match.phase, round: this.match.round, score: { ...this.match.score },
      kills: ps.reduce((a, p) => a + p.kills, 0), deaths: ps.reduce((a, p) => a + p.deaths, 0), alive: ps.filter(p => p.alive).length,
      players: ps.map(p => ({ id: p.id, name: p.name, team: p.team, alive: p.alive, hp: p.hp, k: p.kills, d: p.deaths, x: +p.pos.x.toFixed(2), y: +p.pos.y.toFixed(2), z: +p.pos.z.toFixed(2) })) };
  }

  end(reason = 'quit') {
    if (this.ended) return;
    this.ended = true;
    this.bus.emit('game:end', { reason });
  }

  dispose() {
    this.ended = true;
    for (const f of this.offs) { try { f(); } catch (e) { /* gone */ } }
    this.offs.length = 0;
    try { Input.setGameActive(false); Input.setSensMul(1); } catch (e) { /* ok */ }
    if (this.controls) this.controls.dispose();
    for (const s of this.systems.slice().reverse()) { try { s.dispose && s.dispose(); } catch (e) { console.error('[game] system dispose failed', e); } }
    this.systems.length = 0;
    try { if (this.match && this.match.dispose) this.match.dispose(); } catch (e) { console.error(e); }
    try { if (this.fx) this.fx.dispose(); } catch (e) { console.error(e); }
    try { if (this.env && this.env.dispose) this.env.dispose(); } catch (e) { console.error(e); }
    try { if (this.map && this.map.dispose) this.map.dispose(); } catch (e) { console.error(e); }
    if (this.scene) { setScene(null); try { this.scene.dispose(); } catch (e) { console.error(e); } }
    if (this.paused) setPaused(false);
    this.bus.clear();
    this.players.clear();
    this.scene = null; this.ready = false;
    if (window.LF && window.LF.game === this) window.LF.game = null;
  }
}

/** Game events -> js/audio/audio.js (positional; the local player's own sounds are flagged local). */
class SoundSystem {
  constructor(game) {
    this.name = 'sound'; this.g = game;
    const L = p => !!(p && p.local), pos = p => ({ x: p.pos.x, y: p.pos.y + 1.4, z: p.pos.z });
    const A = Audio, on = (n, f) => game.bus.on(n, e => { try { f(e); } catch (er) { /* audio must never break the game */ } });
    this.offs = [
      on('shot', e => A.gun(e.gun.sound || 'rifle_556', { pos: e.origin, suppressed: e.suppressed, local: L(e.p), distant: false, gun: e.gun, id: e.p.id })),
      on('dry', e => { if (L(e.p)) A.dry(e.gun && statsOf(e.gun) ? statsOf(e.gun).sound : 'pistol_9'); }),
      on('reload', e => { const st = e.gun && statsOf(e.gun); A.reload(e.stage, st ? st.sound : 'rifle_556', { pos: pos(e.p), local: L(e.p), gun: st, id: e.p.id }); }),
      on('footstep', e => A.step(e.surf, { pos: { x: e.p.pos.x, y: e.p.pos.y, z: e.p.pos.z }, local: L(e.p), speed: e.loud, crouch: e.p.crouch > 0.5, id: e.p.id })),
      on('land', e => A.land(e.surf || 'concrete', e.speed, { pos: { x: e.p.pos.x, y: e.p.pos.y, z: e.p.pos.z }, local: L(e.p) })),
      on('jump', e => A.jump({ pos: pos(e.p), local: L(e.p) })),
      on('impact', e => A.impact(e.surf, { pos: e.point })),
      on('whiz', e => { if (!L(e.p)) return; const w = e.from && currentWeapon(e.from), st = w && statsOf(w); A.whiz({ pos: e.point, miss: e.dist, speed: st ? st.velocity : 850, pellet: !!(st && st.pellets > 1) }); }),
      on('hit', e => { if (e.attacker && L(e.attacker)) A.hit({ head: e.headshot, armor: e.armor, local: true }); else if (e.victim && !L(e.victim)) A.hit({ head: e.headshot, armor: e.armor, pos: pos(e.victim) }); }),
      on('kill', e => { if (e.killer && L(e.killer)) A.kill({ head: e.headshot }); }),
      on('damage', e => { if (L(e.victim)) A.hurt(e.dmg); }),
      on('round:start', () => A.ui('round')),
      on('match:end', e => { const me = game.local; if (!me) return; const won = e.winner === me.team || e.winner === me.id; A.ui(won ? 'win' : 'lose'); }),
    ];
  }
  frame() {
    const c = this.g.camera; if (!c) return;
    try { Audio.listener({ x: c.position.x, y: c.position.y, z: c.position.z }, c.rotation.y, c.rotation.x); } catch (e) { /* ok */ }
  }
  dispose() { for (const f of this.offs) f(); try { Audio.stopAll && Audio.stopAll(); } catch (e) { /* ok */ } }
}
