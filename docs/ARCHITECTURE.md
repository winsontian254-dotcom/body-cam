# LIVE FIRE — architecture and module contracts

LIVE FIRE is a realistic, body-cam-styled tactical team shooter for the browser (Babylon.js, WebGL2).
It is an ORIGINAL game in the tactical-shooter genre: original title, maps, weapon names, UI and sounds.
Do not copy any existing game's maps, names, art, logos or UI. Real firearm *archetypes* are fine;
names and manufacturers are fictional (no Glock, Colt, Kalashnikov, H&K, Desert Eagle, etc.).

This file is the contract between modules. If you change a contract, update this file in the same change.

---------------------------------------------------------------------------------------------------
## 0. Ground rules

* No bundler, no npm runtime dependencies. Plain ES modules under `js/`, loaded by `index.html`.
* Babylon is a global (`BABYLON`) loaded by `index.html` from jsdelivr, pinned:
  `babylonjs@9.31.0/babylon.js` and `babylonjs-loaders@9.31.0/babylonjs.loaders.min.js`.
  Never import Babylon as a module; never vendor it into the repo.
* PeerJS is lazy-loaded only when multiplayer opens: `https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js`.
* WebGL2 engine only (WebGPU drew black scenes in the sibling project Neon Veins; do not enable it by default).
* Units: metres, seconds, radians. 1 Babylon unit = 1 m. Y is up. Babylon is left-handed.
* Angles: `yaw` = Babylon `rotation.y`; forward on the ground = `(sin yaw, 0, cos yaw)`.
  `pitch` = Babylon `rotation.x`; POSITIVE = looking DOWN. Look direction =
  `(sin(yaw)cos(pitch), -sin(pitch), cos(yaw)cos(pitch))`.
* Simulation is a fixed tick of 64 Hz (`TICK_DT = 1/64`). Rendering runs at display rate and interpolates.
* Every module starts with a header comment listing what it exports.
* Global debug handle: `window.LF` (set by `js/main.js`): `{ app, engine, game, settings, profile, account, audio, ... }`.
* Strings shown to players are English; keep them in code (no i18n system yet).
* Persistent keys in localStorage are prefixed `lf_` (`lf_settings_v1`, `lf_profile_v1`, ...), except the
  shared Neon Veins account key `nv_account_v1` (see §11).

---------------------------------------------------------------------------------------------------
## 1. Files and ownership

```
index.html                 boot page (canvas, #hud, #ui, CSS links, Babylon + loaders, js/main.js)
css/*.css                  one file per UI area (base, menu, hud, lobby, armory, buy, scoreboard, rewards, settings)
js/main.js                 boot: settings -> engine -> account/profile -> menu; window.LF
js/core/engine.js          Babylon engine, resize, hardware scaling, dynamic resolution, quality tier
js/core/loop.js            fixed 64 Hz tick + per-frame callbacks, pause, time scale
js/core/input.js           keyboard / mouse / pointer lock / gamepad, rebindable actions, raw look deltas
js/core/settings.js        settings store (lf_settings_v1), defaults, onChange
js/core/events.js          tiny event bus class (Bus) + the app-wide bus `appBus`
js/core/util.js            math helpers, clamp/lerp, seeded RNG (mulberry32), ids, formatters, DOM helper el()
js/core/dev.js             parses location.hash dev params (#dev&map=..&mode=..&bots=..&q=low&autostart)
js/phys/world.js           (pure JS, no BABYLON: runs in Node tests and on the host) static collision world: boxes (AABB or Y-rotated), ramps, heightfield ground; BVH
js/phys/ray.js             raycast / raycastAll against the world (with surface types)
js/phys/move.js            character movement (Source-like accel/friction, step-up, crouch, jump, mantle, lean)
js/game/game.js            Game session: scene, map, players, systems, authority (local|host|client)
js/game/player.js          PlayerState factory, local input -> command, applyCommand
js/game/camera.js          first-person camera rig, body-cam head motion, recoil view punch, FOV, lean
js/game/hitbox.js          hitbox capsules/spheres from a PlayerState (deterministic, no meshes)
js/game/combat.js          hitscan fire, penetration, damage model, falloff, armor, FF rule, kill credit
js/game/weapon.js          weapon state machine (fire, burst, reload, ADS, switch, inspect), ammo
js/game/viewmodel.js       first-person gun + hands rendering, sway, bob, ADS alignment, animations
js/game/effects.js         muzzle flash, tracers, shell ejection, impacts/decals by surface, blood
js/game/match.js           match state machine (warmup/freeze/live/roundEnd/halftime/over), teams, score
js/game/economy.js         money, kill rewards, round bonuses, loss streak
js/game/objectives.js      bomb, plant/defuse, hostages, flags, zones, dog tags, VIP, gates (lobby doors)
js/weapons/data.js         GUNS (50), MELEE, CATEGORIES, getGun(id)   — data only
js/weapons/attachments.js  ATTACHMENTS, SLOTS, fits(gun, att), applyMods(gun, mods) — data + stat math
js/weapons/models.js       buildGun(scene, id, opts) -> GunModel, buildAttachment(...)  (procedural, high detail)
js/weapons/gunkit.js       procedural part builders used by models.js (profiles, rails, barrels, screws...)
js/weapons/scope.js        optic rendering: reticles, magnified zoom, full-screen sniper scope overlay
js/weapons/recoil.js       spray patterns, view punch, recovery
js/grenades/data.js        GRENADES (25) — data only
js/grenades/sim.js         throw, trajectories (bounce/roll on world), fuses, detonation behaviours
js/grenades/fx.js          explosion, smoke volumes, fire, flash white-out, gas, etc.
js/maps/index.js           MAPS registry (25 ids, names, themes, sizes) + loadMapDef(id)
js/maps/builder.js         MapBuilder (geometry, merging, colliders, markers) -> MapInfo
js/maps/props.js           PROPS library (detailed props built with MapBuilder primitives)
js/maps/navgrid.js         walkable grid + A* for bots, line of sight helpers
js/maps/validate.js        map checks (spawns free + reachable, objectives present, lobbies closed)
js/maps/defs/<id>.js       one file per map (export default MapDef)
js/modes/index.js          MODES registry + getMode(id)
js/modes/<id>.js           one file per game mode (export default ModeDef)
js/bots/bot.js             bot brain (states, objectives, hiding, grenades), produces commands
js/bots/aim.js             human-like aim (reaction, tracking error, recoil control) by difficulty
js/chars/human.js          third-person character (Neon Veins human kit + tactical gear, team colours)
js/chars/anim.js           procedural animation (idle/walk/run/crouch/jump/aim/reload/death)
js/net/peer.js             PeerJS wrapper (host/join, reliable + unreliable channels, ping)
js/net/browser.js          public server browser (well-known peer ids) + private join codes
js/net/netgame.js          host broadcast / client apply: snapshots, interpolation, events, hit claims
js/audio/audio.js          WebAudio engine (synthesised, no samples): buses, 3D, reverb, API below
js/account/api.js          Neon Veins account client (shared token), friends, presence, invites, saves, scores
js/account/profile.js      progression (XP/levels/credits/unlocks/loadouts/stats) + cloud sync
js/account/rewards.js      daily rewards (7-day cycle, streak) and crates
js/gfx/materials.js        PBR material library (CC0 photo textures + procedural fallbacks), surfaces
js/gfx/env.js              sky/HDRI environment, sun, fog, weather particles per map
js/gfx/postfx.js           rendering pipeline: body-cam lens shader, bloom, SSAO, tonemap, FXAA/TAA, grain
js/gfx/quality.js          quality presets (low/medium/high/ultra/auto) applied to engine + scene
js/ui/ui.js                UI helpers: screens stack, modal, toast, confirm, tabs
js/ui/menu.js              title + main menu (Play, Armory, Rewards, Profile, Settings, Account)
js/ui/play.js              play hub: quick match, server browser, host, join code, practice vs bots
js/ui/lobby.js             match lobby (teams, map/mode, bots, chat, ready, start)
js/ui/hud.js               in-match HUD (health/armor/ammo/crosshair/killfeed/radar/timer/objectives)
js/ui/buy.js               buy menu (economy modes)
js/ui/scoreboard.js        Tab scoreboard
js/ui/armory.js            loadouts, 3D gun inspect, attachments, skins
js/ui/rewards.js           daily rewards screen
js/ui/settings.js          settings screens (graphics, audio, controls/keybinds, crosshair, gameplay)
js/ui/account.js           sign in / sign up with a Neon Veins account, friends, invites
js/ui/results.js           end-of-match summary (XP, credits, stats)
assets/textures/<set>/     CC0 PBR textures (see assets/manifest.json for source + licence of every file)
assets/hdri/               CC0 HDR skies
assets/models/             glb models (Neon Veins human kit + gloves, CC0 props)
assets/manifest.json       every asset: file, licence, source URL, author
tools/serve.mjs            static dev server (node tools/serve.mjs [port], default 8080)
tools/test/lib.mjs         Playwright helpers shared by all tests
tools/test/*.mjs           tests (smoke, maps, weapons, net, bots, perf ...)
```

Stub files exist for modules owned by other workers. A stub implements the FINAL interface with simple
placeholder behaviour. When you own a module, replace the stub completely but keep its exported API
(you may ADD exports). When you depend on a module you do not own, use only its documented API.

---------------------------------------------------------------------------------------------------
## 2. Core (js/core)

```js
// engine.js
export async function bootEngine(canvas) -> { engine }            // WebGL2, stencil, no MSAA (postfx does AA)
export function getEngine() -> BABYLON.Engine
export function setRenderScale(s)                                  // 0.5..1 (hardware scaling = 1/s)
// loop.js
export const TICK_DT = 1/64
export function startLoop(engine)                                  // drives ticks + frames + scene.render()
export function onTick(fn) -> off      // fn(dt) fixed 64 Hz
export function onFrame(fn) -> off     // fn(dt, alpha) per rendered frame, alpha = tick interpolation 0..1
export function setScene(scene|null)   // which scene the loop renders (menu scene, match scene)
export function setPaused(bool), isPaused()
// input.js
export const Input = { lock(), unlock(), locked, down(action), pressed(action) /*edge, consumed per tick*/,
                       look() -> {dx, dy} /*accumulated raw mouse since last call, already scaled by sensitivity, radians*/,
                       bind(action, code), binds(), ACTIONS, onText(bool) /*disable game keys while typing*/ }
// actions: forward back left right jump crouch walk fire ads reload use inspect drop
//          slot1..slot5 next prev grenade cycleGrenade leanL leanR scoreboard buy chat teamchat menu firemode voice
// settings.js
export const Settings = { get(key), set(key, v), all(), onChange(fn), reset(section) }
// keys: sens, adsSens, invertY, fov (default 90 horizontal-ish, Babylon vertical fov derived), quality ('auto'|'low'|'medium'|'high'|'ultra'),
//       renderScale, lens ('full'|'subtle'|'off'), motionBlur, vsync, fpsCap, showFps, masterVol, sfxVol, musicVol, uiVol,
//       voiceVol, crosshair {style,color,size,gap,thick,dot,outline,alpha}, binds {}, viewBob, hudScale, colorblind
// events.js
export class Bus { on(name, fn) -> off; once(name, fn); off(name, fn); emit(name, payload); clear() }
export const appBus = new Bus()        // app-wide: 'settings', 'account', 'profile', 'screen'
// util.js: clamp, lerp, damp(a,b,lambda,dt), rand(seed) -> () => [0,1), hash(str), uid(), el(tag, cls, html), fmtTime(s)
```

---------------------------------------------------------------------------------------------------
## 3. Physics (js/phys)

```js
// world.js
export class World {
  addBox({ cx, cy, cz, hx, hy, hz, ry = 0, surf = 'concrete', solid = true, tag = null }) -> id  // centre + half extents
  addRamp({ cx, cz, hx, hz, y0, y1, axis: 'x'|'z', surf }) -> id   // walkable slope rising from y0 to y1 along +axis
  setGround({ minX, maxX, minZ, maxZ, res, heights: Float32Array, surf }) // optional heightfield (row-major x fastest)
  remove(id); setSolid(id, bool)                                  // gates of team lobbies are removed when the round goes live
  groundAt(x, z, yFrom, radius) -> { y, surf } | null             // highest walkable surface at or below yFrom
  overlapCylinder(x, y, z, r, h) -> [ids]
  build()                                                         // (re)build the BVH after static adds
}
// ray.js
export function raycast(world, origin, dir, maxDist, opts?) -> { hit, dist, point, normal, surf, id } // dir normalised
export function raycastAll(world, origin, dir, maxDist) -> [{ dist, point, normal, surf, id, exitDist }] sorted (for penetration)
// move.js — movement for any PlayerState-like object (players AND bots use the same code)
export const MOVE = { radius: .32, height: 1.80, crouchHeight: 1.25, eye: 1.64, crouchEye: 1.12, step: .45,
                      gravity: 15, jumpV: 4.3, accel: 5.5, airAccel: 1.0, friction: 5.2, stopSpeed: 2.0,
                      walkMul: .52, crouchMul: .34, mantleMax: 1.15 }
export function moveStep(world, s, cmd, dt, maxSpeed)   // mutates s.pos/s.vel/s.onGround/s.crouch/s.lean/s.mantle; returns events
                                                         // {landed: fallSpeed, footstep: surf, jumped, mantled}
```
Map collision is mostly boxes. Stairs are a ramp collider + visual steps. Glass is `surf: 'glass'`.
Surfaces (`surf`): concrete brick plaster wood metal sheetmetal glass tile carpet dirt grass gravel sand snow water mud asphalt fabric rubber.

---------------------------------------------------------------------------------------------------
## 4. Game session (js/game)

```js
// game.js
export async function createGame(cfg) -> Game
// cfg = { mapId, modeId, authority: 'local'|'host'|'client', seed, bots: n, botSkill: 0..1, maxPlayers,
//         local: { name, team?: 0|1|2, loadout, profileLevel }, net?: NetGame, options: { friendlyFire: false, ... } }
class Game {
  scene, world, map /*MapInfo*/, mode /*ModeDef*/, match /*MatchState*/, bus /*Bus, per game*/,
  players /*Map<id, PlayerState>*/, localId, authority, time /*sim seconds*/, tick /*int*/,
  addSystem(sys) /* sys = { name, tick?(dt), frame?(dt, alpha), dispose?() } */, getSystem(name),
  addPlayer({ name, team, bot, id? }) -> PlayerState, removePlayer(id),
  spawn(p, spot?), damage(victim, info) /* the ONLY way to hurt anyone; enforces friendly-fire OFF */,
  kill(victim, info), giveWeapon(p, gunId, slot?, mods?), setTeam(p, team),
  end(reason) , dispose()
}
// Events on game.bus (payloads are plain objects):
// 'spawn' {p}  'shot' {p, gun, origin, dir, hits}  'impact' {point, normal, surf, gun}  'hit' {attacker, victim, dmg, group}
// 'kill' {killer, victim, assister, weapon, headshot, wallbang, noscope, smoke, flash}  'damage' {victim, dmg, from}
// 'footstep' {p, surf, loud}  'land' {p, speed}  'jump' {p}  'reload' {p, gun, stage}  'switch' {p, slot}
// 'grenade:throw' {p, gid, nade}  'grenade:boom' {nade, pos}  'round:freeze' 'round:start' 'round:end' {winner, reason}
// 'match:start' 'match:end' {winner}  'objective' {kind, ...}  'chat' {from, text, team}  'money' {p, delta, why}
```

### PlayerState (plain, serialisable)
```js
{ id, name, team /*0 none (FFA), 1 VANGUARD (attack), 2 SENTINEL (defend)*/, bot, alive,
  hp, armor, helmet, pos: {x,y,z} /*feet*/, vel: {x,y,z}, yaw, pitch, crouch /*0..1*/, lean /*-1..1*/,
  onGround, mantle /*null|{...}*/, inv: { primary, secondary, melee, nades: [{ gid, n }], bomb: false, kit: false },
  cur /*'primary'|'secondary'|'melee'|'nade'|'bomb'*/, curNade /*gid*/,
  money, kills, deaths, assists, score, damageDone, headshots, mvps, ping,
  flash /*seconds of blindness left*/, tagged /*slow-down timer*/, lastCmdSeq, spawnProtect }
// weapon instance: { uid, gunId, mag, reserve, mods: { optic, muzzle, under, side, mag, stock, barrel }, skin, fireMode }
```
### Command (one per tick per player; bots produce the same)
```js
{ seq, mx /*-1..1 strafe*/, mz /*-1..1 forward*/, yaw, pitch, buttons /*bitmask BTN*/, slot /*null|...*/, nade /*gid|null*/ }
export const BTN = { FIRE:1, ADS:2, JUMP:4, CROUCH:8, WALK:16, RELOAD:32, USE:64, INSPECT:128, ALT:256, DROP:512, LEANL:1024, LEANR:2048 }
```
Authority: `local` (practice/offline, everything simulated here), `host` (same, plus net broadcast), `client`
(own movement predicted locally and sent to the host; hits detected locally and sent as claims; host validates).

### Teams and friendly fire
Friendly fire is DISABLED in every mode: `game.damage()` ignores any damage, flash, stun, fire or gas whose
attacker is on the victim's team (team > 0). Self-damage from your own explosives/fire is allowed.
FFA modes put everyone on team 0 (everyone is an enemy).

### Damage model (combat.js)
Hit groups and multipliers: head 4.0, neck 2.0, chest 1.0, stomach 1.25, arm 1.0, leg 0.75.
Range falloff: `dmg * gun.falloff ** (dist / 10)`. Armor (0..100) absorbs body hits: health damage =
`dmg * gun.armorPen`, armor loses `(dmg - healthDamage) / 2`. Helmet does the same for the head.
Penetration: each wall costs `thickness * SURF_RES[surf]` of `gun.pen`; damage scales by what is left.
Being hit slows the victim (`tagged`). Kill credit: last attacker; assist: >= 40 damage within 10 s.

---------------------------------------------------------------------------------------------------
## 5. Weapons

### data.js
```js
export const CATEGORIES = ['pistol','smg','rifle','carbine','br','shotgun','dmr','sniper','lmg']   // + 'melee'
export const GUNS = [ {
  id, name, maker /*fictional*/, cat, slot: 'primary'|'secondary', archetype /*model family, see models.js*/,
  desc, price, killReward, unlockLevel, team: 0 /*0 = both teams may buy*/,
  dmg, armorPen, rpm, modes: ['auto'|'semi'|'burst'], burst?: 3, mag, reserve, pellets: 1,
  reload, reloadEmpty, draw, adsTime, adsFov /*zoom factor of the iron sights, e.g. 1.15*/,
  range /*m, effective*/, falloff /*0.75..0.99 per 10 m*/, pen /*0..3*/, speed /*m/s when held*/,
  spread: { base, move, air, crouch, ads, max } /*radians*/, recoil: { pattern: [[x,y],...], kick, recover, random },
  sound /*audio family, see §9*/, caliber, tracer, scope: null | { zoom, reticle } /*built-in optic*/,
  mounts: { optic, muzzle, under, side, mag, stock, barrel } /*booleans*/, model: { ...params for models.js } } ]
export const MELEE = [{ id: 'knife', ... }]
export function getGun(id)
```
### attachments.js
```js
export const SLOTS = ['optic','muzzle','under','side','mag','stock','barrel']
export const ATTACHMENTS = [ { id, slot, name, desc, price, unlockLevel, fits: [cats],
   mods: { spread, recoil, adsTime, speed, range, mag, reload, draw, suppressed, flashHide, zoom, reticle, laser, light } } ]
export function fits(gun, att) ; export function effectiveStats(gun, mods /*{slot: attId}*/) -> stats copy
```
### models.js (procedural, high detail — see gunkit.js)
```js
export async function initGunKit(scene)           // shared PBR gun materials for this scene
export function buildGun(scene, gunId, opts = { lod: 0|1|2, skin: 'factory', mods: {} }) -> GunModel
// GunModel = { root /*TransformNode*/, meshes, parts: { mag, bolt, slide, trigger, hammer, charging, pump, cylinder, ... },
//   sockets: { optic, muzzle, under, side, mag, stock } /*TransformNodes*/, muzzle /*TransformNode: flash origin, +Z out*/,
//   eject /*TransformNode*/, sight: { eye: Vector3 /*gun-local point the eye sits on for iron/optic ADS*/ },
//   hands: { right: TransformNode, left: TransformNode } /*grip poses*/, setMods(mods), dispose() }
// Gun-local axes: +Z = muzzle direction, +Y up, +X right; origin at the trigger; metres; real-world sizes.
export function buildAttachment(scene, attId, opts) -> { root, meshes, lens? , eye? }
export const SKINS = [ { id, name, price, ... } ]
```
LOD 0 is the first-person model (high detail: bevelled profiles, rails with teeth, screws, cuts).
LOD 1/2 are for third-person/world drops. Build once per scene per id+mods, then clone/instance.

### scope.js
Optics: 1x reflex/holo (reticle on lens), 1.5-4x prisms/low-power scopes (FOV zoom + reticle on lens +
lens vignette), 6-12x sniper scopes (full-screen scope overlay with reticle, parallax with sway, black ring).

---------------------------------------------------------------------------------------------------
## 6. Grenades (js/grenades)

```js
// data.js
export const GRENADES = [ { id, name, kind, desc, price, max /*carry*/, fuse, cookable, impact, sticky,
  throwSpeed, lobSpeed, bounce, friction, radius, dmg, armorPen, duration, team: 0, model: {...}, fx: {...} } ]
// kinds: frag, he, flash, smoke, molotov, incendiary, decoy, concussion, stun, gas, sticky, impact, cluster,
//        thermite, sensor, emp, smoke_color, breach, flare, chaff, ninebang, mini, satchel, dynamite, medic
// sim.js
export function throwNade(game, p, gid, { cook, under }) ; export class NadeSystem /* game system */
```
Smoke blocks line of sight for players AND bots (`navgrid.losBlocked(a, b)` checks active smoke volumes).

---------------------------------------------------------------------------------------------------
## 7. Maps (js/maps)

### MapDef (js/maps/defs/<id>.js)
```js
export default {
  id, name, desc, size: 'S'|'M'|'L',
  env: { hdri: 'name', sky: 'hdri'|'night'|'overcast', exposure, sun: { dir: [x,y,z], color: [r,g,b], intensity },
         ambient: [r,g,b], fog: { color: [r,g,b], density }, weather: 'clear'|'rain'|'snow'|'fog'|'dust',
         time: 'day'|'dusk'|'night'|'indoor', ambience: 'harbor'|'office'|... /*audio bed*/, reverb: 'outdoor'|'room'|'hall'|'tunnel' },
  bounds: { minX, maxX, minZ, maxZ, minY, maxY },
  build(B) { /* calls MapBuilder methods */ }
}
```
### MapBuilder (builder.js) — what map files and props call
```js
// geometry (all merged per material per 32 m chunk, frozen; colliders added to the World unless collide:false)
B.box(x, y, z, w, h, d, { mat, ry = 0, collide = true, surf /*default from material*/, uv = 1 /*texture scale*/, cast = true, receive = true })
                         // (x, z) = centre in plan, y = BOTTOM, w along x, h up, d along z
B.floor(x0, z0, x1, z1, y, { mat, t = .2 })                 // slab whose TOP is at y
B.wall(x0, z0, x1, z1, { y = 0, h = 3, t = .2, mat, mat2 /*other side*/, openings: [{ at /*m from start*/, w, h, y = 0 }] })
B.room({ x, z, w, d, y = 0, h = 3, t = .2, wall, floor, ceil /*material names; ceil null = open*/,
         doors: { n: [at...], s: [...], e: [...], w: [...] }, windows: { n: [{ at, w, h, y }], ... }, doorW = 1.2, doorH = 2.2 })
B.stairs({ x, z, w, len, y0, y1, dir: '+x'|'-x'|'+z'|'-z', mat, rail: true })   // visual steps + ramp collider
B.ramp({ x, z, w, len, y0, y1, dir, mat })
B.ground({ minX, maxX, minZ, maxZ, mat, res = 2, height /*(x,z)=>y, optional*/ })
B.cyl(x, y, z, r, h, { mat, sides = 16, collide = true, ry })       // vertical cylinder (collider = box approx)
B.mesh(mesh, { mat, collide: 'box'|'none'|[{ cx,cy,cz,hx,hy,hz,ry }], surf, merge = true })  // add any custom mesh
B.instance(key, buildFn /*() => mesh*/, x, y, z, { ry, s, collide })  // thin-instanced repeated props
B.collider({ cx, cy, cz, hx, hy, hz, ry, surf })                      // invisible collider
B.light({ type: 'point'|'spot', x, y, z, color, intensity, range, dir, angle, fixture: true, flicker: 0 })
                         // many lights: use BABYLON.ClusteredLightContainer when available, else assign each light only to the
                         // chunks in its range (includedOnlyMeshes) and keep <= material.maxSimultaneousLights per chunk
B.model(file /*assets/models/...glb*/, x, y, z, { ry, s, collide })   // CC0 glb props; loaded once per scene, instanced
B.prop(type, x, y, z, { ry, s, variant, collide })                  // from PROPS (props.js)
B.mat(name) -> BABYLON.Material                                     // from gfx/materials.js
// markers (gameplay)
B.spawn(team /*0 FFA, 1, 2*/, x, y, z, yaw, { field = false })
   // round starts use the team's lobby spawns (>= 10 per team, inside its lobby); respawn modes use field spawns
   // (field: true, >= 8 per team across that team's half, chosen away from enemies); FFA uses team 0 spawns (>= 16, whole map)
B.lobby(team, { x0, z0, x1, z1, y }, gates: [{ x, z, w, h, ry }])  // staging room; gates block it until the round goes live
B.buyzone(team, { x0, z0, x1, z1 })                                 // defaults to the team's lobby + spawn area
B.hide(x, y, z, { r = .8, kind: 'bush'|'closet'|'vent'|'dark'|'crates'|'grass'|'car'|'under'|'roof' })  // >= 10 per map
B.site('A'|'B', { x0, z0, x1, z1, y })                              // bomb sites (every map has A and B)
B.hostage(x, y, z) ; B.rescue({ x0, z0, x1, z1 })                    // >= 4 hostages, rescue zone near team-2... see modes
B.point(name, x, y, z, r)   // 'dom1'..'dom3', 'hp1'..'hp5', 'hill', 'flag1', 'flag2', 'extract1'.., 'hq1'..
```
### MapInfo (returned by `await buildMap(scene, def, opts)` in builder.js — async because of B.model loads)
```js
{ id, def, world, spawns: { 0: [], 1: [], 2: [] } /*{x,y,z,yaw,field}*/, casters /*meshes for the sun shadow*/, lobbies: { 1, 2 }, gates: [ids], buyzones, hides,
  sites: { A, B }, hostages, rescue, points: { name: {x,y,z,r} }, bounds, lights, meshes, nav /*navgrid*/, dispose() }
```
Every map must satisfy `validate.js`: spawns not inside colliders and on ground, every spawn/objective reachable
on the navgrid from both teams' spawns, lobbies sealed by their gates, hides >= 10, sites A/B, >= 4 hostages + rescue,
dom1-3, hp1-4, hill, flag1/flag2, extract1.
`node tools/test/mapcheck.mjs <mapId> [--shots]` builds a map headless, runs validate.js and writes overview screenshots
(top-down, each lobby, each site) to tools/test/out/maps/<id>/.

### The 25 maps (ids are fixed; js/maps/index.js lists them)
See js/maps/index.js for id, name, theme, size and setting.

---------------------------------------------------------------------------------------------------
## 8. Modes (js/modes)

```js
export default {  // ModeDef
  id, name, desc, teams: 2|0 /*0 = FFA*/, respawn: bool, respawnDelay, rounds /*0 = single timed match*/,
  winRounds, roundTime, freezeTime, buyTime, economy: bool, loadouts: bool, timeLimit, scoreLimit,
  maxPlayers, minPlayers, objectives: ['bomb'|'hostage'|'flags'|'zones'|'tags'|'vip'|...], sizes: ['S','M','L'],
  setup(game), tick(game, dt), onSpawn(game, p), onKill(game, info), onRoundStart(game), onRoundEnd(game, r),
  hud(game) -> { top, bottom, markers: [{ pos, label, color }] } /*extra HUD text/markers*/, score(game) -> sortable rows
}
```
Mode ids: tdm ffa demolition hostage wingman retake snd elimination domination hardpoint koth ctf
killconfirmed gungame gunrush infection hideseek vip juggernaut oitc sharpshooter headquarters snipers
blades hardcore practice.

---------------------------------------------------------------------------------------------------
## 9. Audio (js/audio/audio.js) — synthesised (no samples), positional

```js
export const Audio = {
  init() /*on first user gesture*/, resume(), setVolumes({ master, sfx, music, ui, voice }),
  listener(pos, yaw, pitch), setSpace({ reverb: 'outdoor'|'room'|'hall'|'tunnel', surface }),
  gun(family, { pos?, suppressed, local, distant }), dry(), reload(stage, family, { pos, local }),
  step(surf, { pos?, local, speed, crouch }), land(surf, speed, { pos, local }), jump({ pos, local }),
  impact(surf, { pos }), whiz({ pos }), hit({ head, armor, local }), kill({ head }), hurt(dmg),
  nade(kind, stage /*'pin'|'throw'|'bounce'|'boom'|'loop'|'end'*/, { pos, id }), tinnitus(seconds),
  ui(name /*'hover'|'click'|'back'|'buy'|'deny'|'tick'|'round'|'win'|'lose'|'unlock'|'reward'*/),
  ambience(kind, { rain, wind }), music(mood /*'menu'|'lobby'|'none'*/), radio(name), stopAll()
}
// gun families: pistol_9 pistol_45 pistol_mag smg_9 smg_45 rifle_556 rifle_762 rifle_545 br_308 dmr_762
//               sniper_338 sniper_50 shotgun_12 lmg_556 lmg_762 (+ suppressed variants via the flag)
```

---------------------------------------------------------------------------------------------------
## 10. Networking (js/net) — PeerJS star, host = listen server

* Peer ids: public servers `livefire-v1-pub-00` .. `-23` (the server browser probes all 24), private games
  `livefire-v1-` + 6-char code (A-Z, 2-9, no I/O/0/1). Optional `#peer=host:port` uses a local PeerJS server for tests.
* Channels per client: reliable (events, chat, lobby, hit claims) and unreliable (state at 30 Hz).
* Clients own their movement (host sanity-checks speed/teleports); hits are detected by the shooter and sent
  as claims; the host rewinds the target (1 s history) and validates distance + line of sight, then applies.
* Host simulates bots, match, objectives, grenades; broadcasts snapshots (players, match, objectives) at 30 Hz;
  clients interpolate remote players 100 ms behind.

---------------------------------------------------------------------------------------------------
## 11. Accounts (Neon Veins) — js/account

* Same server as Neon Veins: `https://neon-veins-api.winsontian254.workers.dev` (server source: the
  NEON_VIENS repo, `server/worker.js`). CORS is open. Endpoints: POST /api/signup {email, username, password, device},
  POST /api/login {login, password, device}, POST /api/logout, GET/PATCH /api/me, GET /api/friends,
  POST /api/presence {activity, join_code}, POST /api/invites {to, code}, GET/PUT/DELETE /api/saves/:slot
  ({data, summary, updated}), PUT/GET /api/scores/:board.
* Shared login: both games are served from `https://winsontian254-dotcom.github.io` (same origin), so the token in
  localStorage `nv_account_v1` (`{ token, user, api?, ... }`) is SHARED. Read-modify-write that object; only touch
  `token`, `user` (and read `api`). Never delete other keys Neon Veins keeps there.
* LIVE FIRE progress is one cloud save slot: `livefire`. Presence activity strings start with `LIVE FIRE`.
```js
// api.js
export const Account = { init(), member(), user(), login(login, pw), signup(email, username, pw), logout(),
  friends(), presence(activity, code), invite(friendId, code), loadCloud() -> profile|null, saveCloud(profile),
  submitScore(board, score, detail), getBoard(board), on(fn) }
// profile.js
export const Profile = { load(), get(), save(), onChange(fn), level(), xpToNext(), addXP(n, why), addCredits(n, why),
  spend(n) -> bool, owns(kind, id), unlock(kind, id), loadouts(), setLoadout(i, lo), recordMatch(summary), stats() }
// rewards.js
export const Rewards = { status() -> { ready, day, streak, msToNext, cycle }, claim() -> reward, DAYS }
```

---------------------------------------------------------------------------------------------------
## 12. Graphics (js/gfx)

```js
// materials.js
export function initMaterials(scene, { quality }) -> Promise   // preload what the map needs (lazy per name is fine)
export function getMaterial(scene, name) -> BABYLON.Material   // cached per scene
export function surfaceOf(name) -> surf                         // for footsteps / penetration / impacts
export const MATERIALS = { name: { surf, tex /*assets/textures/<set>*/, scale /*metres per texture tile*/, ... } }
// env.js
export async function applyEnvironment(scene, env, { quality }) -> { sun, shadow /*ShadowGenerator|null*/, dispose }
// postfx.js
export function createPipeline(scene, camera, { quality, lens }) -> { setLens(mode), setFlash(k), setDamage(k),
                                                                     setADS(k), setScope(on), dispose() }
// quality.js
export const QUALITY = { low, medium, high, ultra }; export function applyQuality(engine, scene, tier)
```
Material names used by maps (all must exist, with a procedural fallback when a texture is missing):
concrete concrete_dark concrete_floor asphalt brick brick_red plaster plaster_white tile_white tile_floor
wood_planks wood_floor wood_dark plywood metal_plate metal_painted metal_rust corrugated corrugated_rust
steel_dark glass gravel dirt grass sand snow rock marble carpet fabric rubber cardboard paint_yellow
paint_red paint_blue water mud asphalt_wet hazard emissive_white emissive_warm.

---------------------------------------------------------------------------------------------------
## 13. Testing

* `node tools/serve.mjs 8080` then Playwright (`require('playwright')`, pre-installed Chromium) with
  `tools/test/lib.mjs` helpers (`launch()`, `openGame(page, hash)`, `waitFor(page, expr)`, `shot(page, file)`, console capture).
* Dev hash params: `#dev&map=<id>&mode=<id>&bots=<n>&team=1|2&q=low|medium|high&autostart&seed=<n>&nolens&peer=host:port`.
* Headless Chromium uses SwiftShader (software GL): frames are slow, so drive the sim with `LF.game` hooks instead of
  waiting real time, keep viewports small (960x540), and use quality low for functional tests.
* A change is not done until it boots with ZERO console errors (`node tools/test/smoke.mjs`).
