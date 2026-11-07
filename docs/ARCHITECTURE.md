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
js/core/sandbox.js         dev sandbox (#dev&sandbox&map=<id>): walk a map with moveStep, debug overlay, LF.sandbox hooks
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
js/game/bodies.js          placeholder third-person bodies (hitbox capsules in team kit) + world weapon drops (chars worker replaces via setBodyFactory)
js/game/match.js           match state machine (warmup/freeze/live/roundEnd/halftime/over), teams, score
js/game/economy.js         money, kill rewards, round bonuses, loss streak
js/game/objectives.js      bomb, plant/defuse, hostages, flags, zones, dog tags, VIP, gates (lobby doors)
js/weapons/data.js         GUNS (50), MELEE, CATEGORIES, getGun(id)   — data only
js/weapons/attachments.js  ATTACHMENTS, SLOTS, fits(gun, att), effectiveStats(gun, mods) (= applyMods) — data + stat math
js/weapons/models.js       buildGun(scene, id, opts) -> GunModel (50 guns + 3 melee ids), buildAttachment(...) (all 46)  (procedural, high detail)
js/weapons/gunkit.js       procedural modelling kit used by models.js (pure JS: extrude/lathe/loft/sweep/rails/screws, textures)
js/weapons/scope.js        optics: reticle drawing (lens discs + full-screen overlay), reticle / lens / glint materials
js/weapons/recoil.js       spray patterns, view punch, recovery
js/grenades/data.js        GRENADES (25) — data only
js/grenades/models.js      buildNade(scene, gid, { lod }) -> grenade model (25, procedural, gun kit + gun materials)
js/grenades/sim.js         throw, trajectories (bounce/roll on world), fuses, detonation behaviours
js/grenades/fx.js          explosion, smoke volumes, fire, flash white-out, gas, etc.
js/maps/index.js           MAPS registry (25 ids, names, themes, sizes) + loadMapDef(id)
js/maps/builder.js         MapBuilder (geometry, merging, colliders, markers) -> MapInfo
js/maps/props.js           PROPS library (detailed props built with MapBuilder primitives)
js/maps/props/*.js         prop kit (kit.js), shared parts, decal atlas art, catalogue files (industrial vehicles street nature interior military scans)
js/maps/navgrid.js         walkable grid + A* for bots, line of sight helpers
js/maps/validate.js        map checks (spawns free + reachable, objectives present, lobbies closed)
js/maps/defs/<id>.js       one file per map (export default MapDef)
js/maps/defs/prop_gallery.js  dev map: every prop type laid out in labelled rows (tools/test/props.mjs)
js/modes/index.js          MODES registry (all 26 ids, `available` flag) + loadMode(id) / getMode(id)
js/modes/<id>.js           one file per game mode (export default ModeDef)
js/bots/bot.js             bot brain (states, objectives, hiding, grenades), produces commands
js/bots/aim.js             human-like aim (reaction, tracking error, recoil control) by difficulty
js/chars/human.js          third-person character (Neon Veins human kit + tactical gear, team colours)
js/chars/anim.js           procedural animation (idle/walk/run/crouch/jump/aim/reload/death)
js/net/peer.js             PeerJS wrapper (host/join, reliable + unreliable channels, ping)
js/net/browser.js          public server browser (well-known peer ids) + private join codes
js/net/netgame.js          host broadcast / client apply: snapshots, interpolation, events, hit claims
js/audio/audio.js          WebAudio engine (synthesised, no samples): buses, 3D, reverb, API below (§9)
js/audio/*.js              engine (graph, voices), play (gameplay logic), baker + bake-worker, music, ambience, dsp, bank
js/audio/sounds/*.js       DSP recipes: guns, foley, nades, ui (+ radio, objective sfx), amb (beds + events), ir (reverbs)
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
assets/models/             glb models (Neon Veins human kit + gloves), ph/*.glb CC0 Poly Haven props, tex/ foliage atlas + bark (tools/fetch-props.py)
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
export async function bootEngine(canvas) -> { engine }            // WebGL2 only (readable Error otherwise), stencil, no MSAA (postfx does AA)
export function getEngine() -> BABYLON.Engine
export function setRenderScale(s)                                  // 0.5..1 user scale; level = 1 / (min(dpr, maxDpr) * s * dynScale)
export function getRenderScale() -> { user, dyn, dpr, level, width, height }
export function frameStart(), queueResize()                        // loop.js applies resizes / scaling ONLY at the top of a frame
export const DynRes = { enabled, target, reset(), sample(dt), info(), set(scale) }  // coarse steps (.15/.3), 2 s cooldown, hitch
                                                                   // rejection, 3 s grace after setScene; a sharpening step that
                                                                   // costs frames is undone and sharpening stays off until reset()
export function engineInfo() -> { webgl, renderer, vendor, maxTexture, dpr, babylon }
// RULE: nothing else calls engine.setHardwareScalingLevel / engine.resize (quality presets use setRenderScale): a resize
// between render and present shows a blank frame. appBus: 'gpu:lost' 'gpu:restored' 'engine:resize'. #dev&nodyn = fixed res.
// loop.js
export const TICK_DT = 1/64, MAX_TICKS_PER_FRAME = 8
export function startLoop(engine), stopLoop()                      // drives ticks + frames + scene.render()
export function onTick(fn) -> off      // fn(dt) fixed 64 Hz (Input edges are valid inside ticks)
export function onFrame(fn) -> off     // fn(dt, alpha) per rendered frame BEFORE render, alpha = tick interpolation 0..1
export function onLateFrame(fn) -> off // fn(dt, alpha) after render (HUD / DOM)
export function setScene(scene|null), getScene()   // which scene the loop renders (menu scene, match scene)
export function setPaused(bool), isPaused(), setTimeScale(k), getTimeScale(), setFpsCap(fps)
export function runTicks(n)            // run n ticks synchronously (tests: drive the sim through window.LF instead of real time)
export const loopStats = { fps, frameMs, cpuMs, tick, ticksLastFrame, dropped, errors, lastError, alpha, time, frames }
// every callback runs in try/catch: errors are counted (loopStats.errors), logged once per message, appBus 'loop:error'
// input.js
export const Input = { attach(canvas), lock() -> Promise<bool> /*unadjustedMovement when supported*/, unlock(), locked,
                       down(action) /*held, or tapped since the last tick*/, pressed(action) /*edge, snapshot per tick*/,
                       released(action), consume(action) /*take a latched press outside ticks*/, held(action),
                       look() -> {dx, dy} /*REUSED object: radians since the last call = counts * sens * 0.022 deg * sensMul;
                                            dx > 0 turn right (yaw +), dy > 0 look down (pitch +); + gamepad right stick*/,
                       move() -> {mx, mz} /*REUSED: keys + left stick, -1..1*/, setSensMul(k) /*ADS / scope*/,
                       bind(action, code, slot), unbind(action, slot), binds(), resetBinds(), codeName(code), keyLabel(action),
                       capture() -> Promise<code|null> /*rebinding UI*/, ACTIONS, onText(bool) /*disable game keys while typing*/,
                       setGameActive(bool) /*in a match: preventDefault bound keys + beforeunload guard (Ctrl+W)*/,
                       fullscreen() /*+ keyboard lock*/, on(fn(type, action)) -> off, pad, inject(action, down),
                       injectLook(dx, dy), injectMove(mx, mz) /*tests*/ }
// actions (defaults): forward W, back S, left A, right D, jump Space, crouch L-Ctrl, walk L-Shift, leanL Q, leanR E,
//   fire Mouse1, ads Mouse2, reload R, firemode X, alt Mouse3 (laser/light), inspect V, use F, drop G, slot1..slot5 1..5
//   (slot4 = grenades; cycleGrenade is also on 4: pressing it again cycles), grenade C (quick grenade), next WheelDown,
//   prev WheelUp, buy B, scoreboard Tab, chat Y, teamchat U, voice T, menu Esc. Codes: KeyboardEvent.code, Mouse1..5,
//   WheelUp/WheelDown. Losing pointer lock without unlock() (Esc) latches pressed('menu'). Mouse only counts while locked.
//   Gamepad (standard mapping, fixed): A jump, B crouch, X reload, Y next, LB grenade, RB use, LT ads, RT fire, Back
//   scoreboard, Start menu, LS walk, RS knife, d-pad 1 / 4 / lean.
// settings.js
export const Settings = { get(key), set(key, v), all(), onChange(fn), reset(section), load() }   // dotted keys: 'crosshair.color'
// keys: sens, adsSens, invertY, rawInput, toggleCrouch, toggleADS, toggleWalk, padSens, padDeadzone, padInvertY, binds {action: [codes]},
//       fov (CS-style horizontal at 4:3, default 90; util.vfov43 gives Babylon's vertical fov), quality ('auto'|'low'|'medium'|'high'|'ultra'),
//       renderScale, dynRes, dynResTarget, maxDpr, lens ('full'|'subtle'|'off'), motionBlur, vsync, fpsCap, showFps, viewBob,
//       masterVol, sfxVol, musicVol, uiVol, voiceVol, crosshair {style,color,size,gap,thick,dot,outline,alpha,dynamic},
//       hudScale, colorblind, showDamage, bodycamHud
// events.js
export class Bus { on(name, fn) -> off; once(name, fn); off(name, fn); emit(name, payload); clear(name?); count(name) }
export const appBus = new Bus()        // app-wide: 'settings' 'account' 'profile' 'screen' 'gpu:lost' 'gpu:restored' 'engine:resize'
                                       //           'input:lock' 'input:lockfail' 'loop:error'
// util.js: DEG, RAD, TAU, clamp, lerp, invLerp, smoothstep, damp(a,b,lambda,dt), wrapAngle, angleDiff, lerpAngle, dampAngle,
//          rand(seed) -> () => [0,1), randRange, randInt, pick, shuffle, hash(str), uid(), lookDir(yaw, pitch), forward2, right2,
//          vfov43(hfovDeg), dist2, dist3, el(tag, cls, html), fmtTime(s), fmtNum(n)
// dev.js: DEV (parsed #dev&... hash; only honoured when the hash starts with "dev"), parseDev, devStr, devNum, devFlag
// sandbox.js: startSandbox({ engine, canvas, mapId, quality }) — #dev&sandbox&map=<id>: walk a map with moveStep, debug overlay,
//             window.LF.sandbox = { scene, camera, info, player, step(n, cmd), teleport, look, setNoclip, gates, cam, stats }
```

---------------------------------------------------------------------------------------------------
## 3. Physics (js/phys)

Pure JS (no BABYLON): runs in Node tests (`node tools/test/phys.mjs`), on the host and on clients.
```js
// world.js
export class World {
  addBox({ cx, cy, cz, hx, hy, hz, ry = 0, surf = 'concrete', solid = true, ray = solid, walk = true, tag = null, data }) -> id
                                                                  // centre + half extents; ry turns the footprint about Y
  addRamp({ cx, cz, hx, hz, y0, y1, axis: 'x'|'z', ry = 0, base = min(y0,y1), surf }) -> id  // solid wedge, slope from y0 at the
                                                                  // -axis end to y1 at the +axis end (local axes)
  addCyl({ cx, cy, cz, r, hy, surf, ... }) -> id                  // vertical cylinder (pillars, poles, tanks, trees)
  setGround({ minX, maxX, minZ, maxZ, res, heights: Float32Array, surf }) / addGround(same) // heightfields (row-major x fastest)
  remove(id); setSolid(id, bool) /*movement AND rays*/; setRay(id, bool); get(id)   // lobby gates use setSolid
  groundAt(x, z, yFrom, radius, out?) -> { y, surf, id, nx, ny, nz } | null   // highest walkable top at or below yFrom
  ceilingAt(x, z, yFrom, radius) -> y | Infinity; heightAt(x, z) -> terrain y
  overlapCylinder(x, y, z, r, h, out?) -> [ids] /*heightfields: -1 - index*/; blocked(x, y, z, r, h, ignoreTag?) -> bool
  query(minX, minY, minZ, maxX, maxY, maxZ, out, mask) -> count  // raw BVH query
  build()                                                         // (re)build the BVH; later adds still work (scanned linearly)
  stats() -> { colliders, boxes, ramps, cyls, fields, nodes }; version /*bumps on every change*/
}
// ray.js
export function raycast(world, origin, dir, maxDist, opts?) -> { hit, dist, point, normal, surf, id } // dir normalised
//   opts: { ignore: id | Set | fn, skipGlass, tag, skipTag, out /*reuse the result object: no allocation*/ }; starts inside -> dist 0
export function raycastAll(world, origin, dir, maxDist, opts?) -> [{ dist, point, normal, surf, id, exitDist }] sorted (penetration:
//   thickness = exitDist - dist; heightfield exitDist = Infinity)
export function segmentClear(world, ax, ay, az, bx, by, bz, opts?) -> bool
// move.js — movement for any PlayerState-like object (players AND bots use the same code)
export const BTN = { FIRE:1, ADS:2, JUMP:4, CROUCH:8, WALK:16, RELOAD:32, USE:64, INSPECT:128, ALT:256, DROP:512, LEANL:1024, LEANR:2048 }
                                                         // (defined here; js/game/player.js re-exports it)
export const MOVE = { radius: .32, height: 1.80, crouchHeight: 1.25, eye: 1.64, crouchEye: 1.12, step: .45,
                      gravity: 15, jumpV: 4.3, accel: 5.5, airAccel: 1.0, friction: 5.2, stopSpeed: 1.4,
                      walkMul: .52, crouchMul: .34, mantleMax: 1.15, airCap: .6, airStep: .06, duckTime: .2, snapDown: .55,
                      maxSlopeNY: .69, leanDist: .36, leanRoll: .2, landSlowMul: .55, landSlowTime: .3, bhopCap: 1.08,
                      tagMul: .45, tagTime: .6, stride: 1.55, silentFrac: .6, vaultMax: 1.05, ... }
export function moveStep(world, s, cmd, dt, maxSpeed, opts?)   // mutates s.pos/vel/onGround/crouch/lean/mantle/yaw/pitch/tagged and
       // s.mv (movement scratch: numbers only); opts.bodies = [{x, y, z, r, h}] other players to collide with.
       // returns a REUSED events object: { landed /*fall speed*/, footstep /*surf|null*/, loud, jumped, mantled /*'mantle'|'vault'*/,
       //                                   stepUp, surf }
export function applySlow(s, tag, mul, secs), fallDamage(speed) -> hp, bodyHeight(s), eyeHeight(s), eyePos(s, out?), leanOffset(s, out?),
       newMoveState(), resetMove(s) /*call on spawn / teleport*/
```
Movement: Source-style accel/friction (stopSpeed 1.4 so crouch-walking reaches its speed), limited air control, a jump needs a
fresh press, landing slows you (no bunny hopping), crouch shrinks from the top on the ground and tucks the legs in the air
(crouch-jump ~1 m), standing up checks the ceiling, step-up <= .45 m with a headroom check, ground snap down stairs/ramps,
slopes steeper than ~46 degrees are not walkable, mantle (onto) / vault (over thin walls <= 1.05 m) when jumping into a ledge up
to 1.15 m (`s.mantle` = a short timed climb), lean blocked by walls, `s.tagged` seconds of hit slow-down, footsteps every
1.55 m above 60% of the weapon speed (walking and crouching are silent). `s.mv.stepOff` smooths the eye after a step (eyeHeight).
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
// Payloads carry PlayerState objects (plus ids where noted). More events (CORE B): 'kill' also has { assister, backstab, kind, suicide,
// killerId, victimId, assisterId }; 'hit' { attacker, victim, dmg, group, headshot, armor, kill, kind, weapon, point, dir, predicted };
// 'damage' { victim, dmg, from, dir, kind, point }; 'shot' { p, gun (effective stats), w, origin, dir, traces: [{ end, hit, dist }], tracer,
// suppressed, pellets, seq, kick, ads }; 'impact' { point, normal, surf, gun, exit, shooter, dir, id (collider), melee, pellets };
// 'whiz' { p, point, from, dist }; 'bullet:body' { point, dir, victim, group, dmg, melee, friendly }; 'melee' { p, kind, gun, side };
// 'dry' { p, gun }; 'firemode' { p, mode }; 'inspect' { p }; 'drop' / 'pickup' { p, drop }; 'use' { p }; 'mantle' { p, kind };
// 'phase' { phase, prev }; 'halftime'; 'round:reset' (new round: clear decals, drops...); 'player:join' / 'player:leave' { p };
// 'game:ready'; 'game:end' { reason }.
```
Game extras (CORE B): `createGame` cfg also takes `quality` (tier override), `onProgress(stage, k)` and options `{ infiniteAmmo,
infiniteMag, armor = 100, helmet = true, hp = 100, warmupTime, freezeTime, timeLimit, scoreLimit, rounds, god, botMode: 'normal' |
'passive' | 'static' }` (match options override the ModeDef; friendlyFire is forced false). Game also has `camera`, `rig`
(CameraRig), `viewmodel`, `effects`, `bodies`, `env`, `fx`, `def` (MapDef), `drops` (world weapons), `view { yaw, pitch }` (local look,
applied per frame), `options`, `rng` (seeded), `paused`, `menuOpen`, `local`, `net`, `removeSystem(sys)`, `giveLoadout(p, lo)`,
`pickSpawn(p, { lobby })`, `throwNade(p, gid, { under, cook }) -> bool` (delegates to a system named 'nades' with `throw(p, gid, opts)`;
the weapon code removes the grenade from the inventory only when it returns true), `setLocalCommand(partial | null)`, `setView(yaw,
pitch)`, `aimAt(point | player, part)`, `setMenu(open)` (a local game pauses), `debugStep(seconds)` (synchronous 64 Hz ticks, no
rendering: headless tests), `stats()`. Systems may also have `late(dt)` (after render: HUD). `setBodyFactory(fn(scene, game) ->
system)` (exported by game.js) swaps the third-person bodies; the system needs `add(p)`, `remove(p)`, `muzzleOf(p, out)`, `casters()`.
Spawns: round starts use lobby spawns (random free one); respawns score every field spawn by distance to live enemies (and -45 if an
enemy sees it, navgrid LOS); FFA uses team 0 spawns. Spawn protection (ModeDef.spawnProtect, respawns only) ends early on firing.
Lobby gates: closed in warmup / freeze (round modes: every round; respawn modes: round 1), opened when the round goes live.

### PlayerState (plain, serialisable) — js/game/player.js createPlayer()
```js
{ id, name, team /*0 none (FFA), 1 VANGUARD (attack), 2 SENTINEL (defend)*/, bot, alive,
  hp, armor, helmet, pos: {x,y,z} /*feet*/, vel: {x,y,z}, yaw, pitch, crouch /*0..1*/, lean /*-1..1*/,
  onGround, mantle /*null|{...}*/, inv: { primary, secondary, melee, nades: [{ gid, n }], bomb: false, kit: false },
  cur /*'primary'|'secondary'|'melee'|'nade'|'bomb'*/, curNade /*gid*/,
  money, kills, deaths, assists, score, damageDone, headshots, mvps, ping,
  flash /*seconds of blindness left*/, tagged /*slow-down timer*/, lastCmdSeq, spawnProtect }
// weapon instance: { uid, gunId, mag, reserve, mods: { optic, muzzle, under, side, mag, stock, barrel }, skin, fireMode, melee }
// runtime extensions: local, remote, skill, loadout, mv (move scratch), ws (weapon state, weapon.js newWeaponState), prev { x, y, z, eye,
// lean, crouch, yaw, pitch } (previous tick, for render interpolation), deadT, respawnT, dmgBy { id: { d, t } }, lastAttacker,
// lastHurtT, life { kills, dmg }, frozen, stun, stat { shots, hits }, lastSpawn, lastSlot, connected
// ws = { state 'idle'|'draw'|'reload'|'inspect'|'melee', t, dur, cool (fractional fire accumulator), btn (previous buttons), burst,
// ads 0..1, shots (spray index), ax / ay (aim offset, DEGREES right / up), bloom (rad), since, cyc (bolt / pump), rl, ml, seq, zoomIdx }
```
### Command (one per tick per player; bots produce the same)
```js
{ seq, mx /*-1..1 strafe*/, mz /*-1..1 forward*/, yaw, pitch, buttons /*bitmask BTN*/, slot /*null|...*/, nade /*gid|null*/ }
export const BTN = { FIRE:1, ADS:2, JUMP:4, CROUCH:8, WALK:16, RELOAD:32, USE:64, INSPECT:128, ALT:256, DROP:512, LEANL:1024, LEANR:2048,
                     MODE:4096 /* fire-mode switch (player.js) */ }
// buttons are HELD state; edges (semi-auto trigger, reload / drop / use presses) come from comparing with the previous command
// (p.ws.btn), so a command stream stays valid over the network. slot: 'primary'|'secondary'|'melee'|'nade'|'bomb'|'next'|'prev'|'last'.
// Knife: FIRE = slash, ADS = heavy stab (backstab when more than 110 degrees behind the victim's facing). ALT cycles scope zoom levels.
```
Weapons (weapon.js): exact RPM at 64 Hz (a fractional cooldown accumulator; no banking while the trigger is up), semi-auto with a
70 ms press buffer, bursts complete on their own (burstDelay after each), manual actions (`cycle`) drop a bolt gun out of ADS while
cycling. Reloads: magazine counts at 70% (tactical) / 62% (empty); switching before that loses nothing, a tactical reload may be cut
short by firing once the magazine is in; shell reloads go one shell at a time and stop after the current shell on fire / switch.
Recoil: each shot adds `recoilStep` to the aim offset (bullets follow all of it, the camera `RECOIL_VIEW` = .5 of it, plus the `kick`
spring); offset, spray index and bloom recover at `recoil.recover`. Drops: dead players drop their primary (else secondary); walking
over a drop fills an empty slot, USE swaps.
Combat (combat.js): `SURF_RES` pen points per metre (glass .6, wood 2.2, plaster 3, brick 6.5, concrete 9, metal 22, ...), a player
costs .6, at most 2 victims / 4 walls per bullet; shotguns: one cone offset per trigger pull, pellets spread by `spread.pellet`.
Hitboxes (hitbox.js): 15 capsules (head sphere, neck, chest, stomach, pelvis = stomach group, upper / fore arms, thighs, shins, feet)
in a rifle-carry pose; crouch lowers the upper body .52 m, lean shears the upper body so the eye lands on move.js leanOffset.
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
// Extensions (every gun has every field; null/0 when not applicable). Full semantics: header of data.js + docs/WEAPONS.md.
//   makerId, role ('eco'|'allround'|'cqb'|'stealth'|'precision'|'heavy'|'entry'|'support'|'long'), burst (0 = none),
//   burstRpm, burstDelay (s after a burst), cycle (null|'pump'|'bolt'|'lever'), reloadKind ('mag'|'shell'|'cylinder'|'belt'|'break'),
//   shell ({ start, per, end } for shell-by-shell loading), adsMove (speed factor while aiming), weight (kg; speed = speedFromWeight),
//   velocity (m/s), bore (suppressor family), suppressed (integral), suppressorFriendly, tracer (every Nth round, 0 none),
//   tracerColor [r,g,b], breath { sway (rad), hold (s; 0 = cannot hold) }, scope { zoom, reticle, levels } for built-in optics.
//   spread adds shot (bloom per shot), hip (hip-fire multiplier), pellet (shotgun half-angle); crouch/ads/hip are multipliers.
//   recoil.pattern[i] = [dx, dy] DEGREES (x right, y up) added to the aim offset after shot i; recover = 1/s exponential return of
//   the offset AND the pattern index; random = per-step jitter half-width (deg); kick = visual camera punch (deg); loop = last
//   steps repeated (x mirrored) past the end. dmg is per pellet for shotguns.
//   MELEE: slash { dmg, back, rate, range, arc }, stab { dmg, back, rate, windup, range }, throw (null | { dmg, speed, ... }).
// Helpers: getMelee(id), gunsBy(cat), speedFromWeight(kg), fireInterval(gun, mode), spreadAt(gun, { speedFrac, air, crouch, ads,
//   bloom }) -> rad, recoilStep(gun, i) -> [dx, dy] deg, MOVE_FREE; tables MAKERS, ARCHETYPES (model families -> gun ids),
//   SOUND_FAMILIES, RETICLES, CATEGORY_INFO, ALIASES (old stub ids 'p9', 'vk47'), DEFAULT_LOADOUT.
```
### attachments.js
```js
export const SLOTS = ['optic','muzzle','under','side','mag','stock','barrel']
export const ATTACHMENTS = [ { id, slot, name, desc, price, unlockLevel, fits: [cats],
   mods: { spread, recoil, adsTime, speed, range, mag, reload, draw, suppressed, flashHide, zoom, reticle, laser, light } } ]
export function fits(gun, att) ; export function effectiveStats(gun, mods /*{slot: attId}*/) -> stats copy
// Extensions: mods are SIGNED FRACTIONS summed per key then applied once and clamped (MOD_KEYS documents every key; magSet,
//   zoom, zoom2, cantedZoom are absolute). Optional filters on an attachment: bores, cals, stocks, reloadKinds, scoped, only, exclude.
//   getAttachment(id), compatible(gun, slot?) -> attachments that fit, applyMods = effectiveStats (alias),
//   damageAt(gun, dist, group), pelletHits(gun, dist), hitsToKill(gun, dist, { group, armor, helmet }), timeToKill(...), derive(stats).
//   effectiveStats never mutates GUNS; it adds attachments [ids], zoom, zoom2, zoomLevels, reticle, opticKind, thermal, canted,
//   cantedZoom, cantedAdsTime, laser, light, bipod (recoil factor when deployed), loud (audible-distance factor), flashHide and
//   derived { ttk/stk at 10/30 m bare+armour, dps, headKill ranges, recoil, cones, adsSpeed, bars 0..100 } for the HUD/armory.
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
export function buildAttachment(scene, attId, opts) -> { root, meshes, lens? , eye? }   // + kind, nodes, reticle, glint, length, hand,
//   canted, bipod, emitters { laser, light }, laserColor, boxes (per-primitive clip boxes); opts { lod, gun, slot, skin, iface, span }
export const SKINS = [ { id, name, price, ... } ]
```
LOD 0 is the first-person model (high detail: bevelled profiles, rails with teeth, screws, cuts).
LOD 1/2 are for third-person/world drops. Build once per scene per id+mods, then clone/instance.

**GunModel details (models.js, implemented).** `buildGun(scene, id, { lod, skin, mods, instance })` clones a cached template
(key: scene + id + lod + skin + magazine/barrel mods; `instance: true` = InstancedMesh copies for crowds, no per-copy changes).
Extra fields: `id, gun, lod, skin, mods, attachments {slot: {id, root, eye, length, hand, dispose}}, info {tris, buildMs, cloneMs, cached}`,
`sockets.barrel`, `sight = { eye, front, rear, line, iron (false while an optic sets the eye), kind }`.
* Sockets (TransformNodes): origin on the mounting surface, local +Y points AWAY from it, +Z toward the muzzle. `under` faces down
  (rotation.z = PI), `side` is the right-side rail facing +X (rotation.z = -PI/2); on pistols `side` is the dust-cover rail (faces
  down). A pistol's `optic` socket sits in the slide cut and is parented to `parts.slide`; `muzzle` sits on the thread / crown
  (on pistols parented to `parts.barrel`). `mag` = magazine catch point, rotated by the grip rake.
* `muzzle`: flash origin, +Z out; setMods moves it to the end of a muzzle device. `eject`: port centre, local +Z = casing
  direction; `eject.metadata.meta.dir` = 'right' | 'left' | 'down' | 'none' (revolvers) | 'break'.
* `hands.right`: on the grip axis at mid-palm, local +Y up the grip (rotation.x = grip rake), +Z forward. `hands.left`: support hand,
  `metadata.meta.kind` = 'hold' (handguard / forend, +Z along the bore) | 'grip' (vertical foregrip) | 'pump' (parented to
  `parts.pump`, moves with it) | 'support' (pistols: beside the grip). An under-barrel grip re-parents it to the attachment.
* `parts` (TransformNodes at their pivots; animate position/rotation, rest pose in `metadata.rest`): slide, barrel, trigger, hammer,
  mag, bolt, charging, pump, cylinder (child of crane), crane (`meta.swing`), selector, safety, gsafety (grip safety), cover (feed
  cover / dust cover, `meta.openR`), lever (`meta.cycleR`), barrels (break action, `meta.breakR`), bipod (`meta.deployR`), handle,
  stock (`meta.fold` = { r?, p? } pose for the folded / collapsed stock), foregrip (`meta.fold`), sightRear / sightFront (flip-ups,
  `meta.iron: 'fold'`, `foldR`), optplate (`meta.coverPlate`, hidden under a slide optic). Families only have what they use.
* `setMods(mods)`: magazine and barrel attachments rebuild the geometry (same `root`; re-read `parts` / `meshes` / `sockets`);
  optic / muzzle / under / side are attachment models on the sockets; an optic folds flip-up irons, hides the pistol cover plate and
  moves `sight.eye` to the optic's eye point; a muzzle device hides the gun's own device (`meta.replace: 'muzzle'`) and moves `muzzle`;
  `k_folded` applies `parts.stock.metadata.meta.fold`. `setMods({})` restores everything. `dispose()` frees the copy (templates stay;
  `clearGunCache(scene)` drops them).
* Materials: `MATS` (PBR ids: nitride park blued steel stainless alu_* cer_* poly_* rubber walnut beech laminate brass ... +
  procedural normal / roughness maps from gunkit `TEX`), mapped per gun from material ROLES (`rcv frame slide furn grip metal barrel
  dark bright bore wood wood2 rubber brass copper spring alu fibre_r fibre_g trit white trans fabric mag stamp`) by `PALETTES` +
  `spec.mats`. Edge wear: per-vertex attribute `gwear` (0..1) read by the GunWear PBR plugin (chips of a noise texture reveal the
  material's `wear` colour / metal / roughness); vertex colour RGB = baked cavity AO. `SKINS` (factory + 16) recolour the skinnable
  roles (tint, two-tone, procedural camo patterns, worn = more wear, full = also barrel / small parts) without new geometry.

**gunkit.js (pure JS, no BABYLON) — the modelling kit.** `new Kit({ lod, wear, seed })`; geometry goes into the current part
(`K.part(name, { pivot, parent, hide, meta })`, `K.use(name)`) and material role (`K.mat(role)`), under nested transforms
(`K.at({ p, r, s }, fn)`, Babylon rotation order). Primitives (options `p r s mat ao wear` + their own): `extrude(outline, depth,
{ plane 'zy'|'xy'|'xz', off, b, bs, bf, bb, holes, recess:[{pts, d, side}], crease })` (bevel auto-shrinks on thin walls),
`lathe([[r, z, wear]...], { segs, a0, a1, rmod(theta, z), flat, axis })`, `loft(sections)`, `loft3(rows, { holesA, holesB })`,
`sweep(path, { rad, rads, sx, sy, closed })`, `box cyl tube disc sphere`, `rail(len)` (Picatinny with real teeth), `screw pin rivet
spring`; `K.node(name, p, r, { meta })` for locators. Outline helpers: `shape([[u, v, filletR, wear]...])` (r > 0 fillet, r < 0
chamfer), `rr`, `circle`, `ellipse`, `arc`, `mlokSlots`, `rowSlots`, `earcut`. LOD: `K.lod`, `K.seg(n)`, `K.detail(level)`, `K.bev`,
and parts smaller than 8 mm (LOD 1) / 30 mm (LOD 2) are dropped automatically. `K.build()` -> `{ parts: [{ name, pivot, local,
parent, meta, roles: { role: { p, n, uv (metres), c (RGBA AO), w (wear), i } } }], nodes, meta, stats }`. `TEX.normal / rough /
albedo / noise` generate the tileable textures (cast, brush, poly, stipple, knurl, checker, wood, rubber, fabric; walnut, beech,
laminate; camo `PATTERNS`).

**MODEL_SPECS format (models.js).** `MODEL_SPECS[gunId] = { b: builderName, pal: 'polymer'|'black'|'steel'|'wood'|'park', mats:
{ role: matId }, wear: factor, ...builder parameters in MILLIMETRES }` (e.g. striker pistols: `slide { z0, len, h, w, ch, serrR,
serrF, port, optic, topPorts, frontDot, rearDots }`, `frame { wd, railSlots, guard, ang, gh, gw, grooves, beaver, cal }`, `trigger`).
`BUILDERS[name](K, spec, gun, ctx)` builds the gun into the kit; ctx = `{ lod, mods, gun, skin, intr: { mag, barrel } }` (the
attachment objects for magazine / barrel variants). Every builder MUST set `K.meta.sight = { front, rear, eye, kind }` (front/rear on
the same height; helper `sightMeta`) and the nodes `muzzle, eject, hand_r, hand_l, s_<slot>` for every mount the gun has in data.js
(helpers `sockets`, `muzzleNode`, `ejectNode`, `handNodes`). Built: all pistols, SMGs, shotguns and LMGs (26 guns, builders
striker singlestack revolver machinePistol largePistol integralPistol smgRoller pdw smgClassic pdwBullpup smgOffset smgStamped
smgIntegral smgMicro shotgunTube shotgunDrum shotgunBreak shotgunLever beltLmg lmgMag) and, in the PART B block, all rifle-class guns
(ar: warden switchback morker weitblick habicht longreach richter; ak: purga taiga kroha; bolt: rook arbiter; boltAM: bjorn;
bullpup: lodjur kogarashi jarv; modular: halberd axion; polyRifle: tsubame; pcc: prairie; brRoller: eisenhut; brClassic: longhorn;
dmrAK: krechet penumbra) — every gun of data.js has a spec; the plain `generic` builder is only a fallback. Extension (part B): `registerGunBuilder(name, fn)`, `registerModelSpec(id, spec)`, `runBuilder(K, spec, gun, ctx)` from a
module that imports models.js (models.js never imports it back); reusable helpers in models.js: `akReceiver`, `boxMag`, `flipSight`,
`bufferStock`, `longGrip`, `gripLoft`, `bipodPart`, `fieldStock`, `cartridge`, `CAL`.

**Part B additions (rifles, attachments, melee).**
* GunModel also has: `sockets.canted` (canted iron sights on scoped rifles), `sight.kind` ('iron' | 'scope' (built-in) | optic kind),
  `sight.lens` = { node, mesh (the ocular glass / thermal screen: render the magnified view onto it), r (m), obj (objective centre),
  objR } or null, `sight.reticle` (scope.js reticle id), `sight.glint` (hidden flare plane at the objective: enable it to show a scope
  glint), `sight.canted` = { eye, front, rear, up (sight 'up' in gun space), roll (rad: roll the gun by -roll to bring them on top) }
  while o_canted is fitted, `emitters` = { laser, light } (TransformNodes, +Z = beam) from the side attachment, `bipod` (the deployable
  legs node: built-in part or the u_bipod attachment's legs, `metadata.meta.deployR`), `meta.stock` (stock interface for stock
  attachments). Built-in scopes (rook arbiter richter bjorn lodjur) are part `scope` (`meta.replace: 'optic'`), ocular part `scopeLens`.
* Part meta handled by setMods: `replace: 'muzzle' | 'optic' | 'under' | 'bipod' | 'stock'` (hidden while such an attachment is fitted;
  'bipod' only by an under-barrel bipod), `optOnly` (shown only with an optic: AK / M14-type side mounts, claw mounts), `iron: 'fold'`
  (`foldR`) | `'hide'` (removable ghost ring). Stock attachments k_heavy / k_light mount on `s_stock` and hide `parts.stock`; k_folded
  is a pose. Magazines / barrels rebuild the gun: builders model them (boxMag / rmag / MAGS variants: extmag drum twindrum coupler;
  barrelMod: long / short / heavy) or the generic post-process does (`postIntrinsic`: extend / couple the 'mag' part, `spec.warp` =
  { z0, z1, yMin } z-stretch of the front of the gun via `Kit.warpZ`).
* Melee: `buildGun(scene, 'knife' | 'zafra' | 'ridgehawk', { lod, instance })` -> { id, gun, melee: true, root, meshes, hands.right
  (+Y toward the tip, +Z toward the edge), tip, edge [node, node], pommel, setMods() (no-op), dispose() }. Melee-local axes: +Z along
  the blade / handle toward the tip or head, -Y = cutting edge, origin at the hand.
* Kit additions: `K.boxes = []` records a box per emitted primitive (lathes: one per profile band) for clip tests; `K.warpZ(o)`;
  `loft3(rows, { uvSwap })` (wood grain along the rows); `extrude(.., { fall: false })`. `cloneTemplate(root, instance)` is exported.

**Attachments (part B).** `ATTACH_SPECS[attId]` (extra model params merged over attachments.js `model`) and
`registerAttachmentBuilder(attId | 'kind:' + model.kind, fn)` with `fn(K, att, ctx) -> { eye?, length?, lens?, hand?, palette? }`:
geometry in attachment-local axes (mounting surface at y = 0, +Y away from the rail, +Z toward the muzzle; muzzle devices start at
z = 0 on the thread and extend along +Z, `length` = how far the muzzle node moves; `eye` = optic eye point in local space;
`hand` = { p, r, kind } left-hand pose for grips). ctx = `{ lod, gun, slot, spec }`. Lookup order: id, then kind, then the simple
built-in placeholder. `buildAttachment` caches per scene + id + lod + bore.

Preview: `tools/preview/guns.html?gun=<id>&skin=&mods=o_reflex,m_supp_9&lod=&view=34|side|left|rear34|close|top|front|fp&sheet=pistol|
smg|shotgun|lmg|modelled|all&nade=<gid>&grid=melee|nades` (`window.GV`, `GV.grid(entries, opts)` = labelled grid of guns / grenades with
mods). Test: `node tools/test/guns.mjs [--only=ids] [--noshots] [--noatt] [--sheets-only]` (all 50 guns + melee x LOD: budgets, timings,
sockets, sight line, NaN, parts; every attachment on every compatible gun: socket on the surface (raycast), clip estimate, slot effects,
reset; 25 grenades; skins, dispose; screenshots + contact sheets per category / slot in tools/test/out/guns/).

### scope.js
Optics: 1x reflex/holo (reticle on lens), 1.5-4x prisms/low-power scopes (FOV zoom + reticle on lens +
lens vignette), 6-12x sniper scopes (full-screen scope overlay with reticle, parallax with sway, black ring).
```js
export const RETICLES, RETICLE_INFO          // ids: iron dot holo chevron circle_dot bdc duplex mildot mildot_fine ring lpvo thermal
export function drawReticle(ctx2d, id, size, { x, y, color, lit, alpha, line, zoom, thermal, outline })   // centred in a size square
export function reticleCanvas(id, size, opts) -> canvas; reticleTexture(scene, id, opts) -> DynamicTexture
export function reticleMaterial(scene, id, opts) -> StandardMaterial   // unlit, alpha, front face toward the eye (-Z), no depth write
export function lensMaterial(scene, { texture, tint, kind: 'objective'|'ocular'|'window'|'thermal', glint }) -> PBRMaterial
export function glintMaterial(scene) -> additive flare material
export function drawScopeOverlay(ctx2d, w, h, { reticle, r, ox, oy, rox, roy, color, lit, thermal, ring })   // black ring + reticle
```
models.js puts a reticle disc (reticleMaterial) on every optic's eye-side glass (red dots, holo, prisms, scopes, thermal screen) and on
built-in scopes; `sight.lens.mesh` is where a magnified render target goes (lensMaterial({ texture })).

---------------------------------------------------------------------------------------------------
## 6. Grenades (js/grenades)

```js
// data.js
export const GRENADES = [ { id, name, kind, desc, price, max /*carry*/, fuse, cookable, impact, sticky,
  throwSpeed, lobSpeed, bounce, friction, radius, dmg, armorPen, duration, team: 0, model: {...}, fx: {...} } ]
// kinds: frag, he, flash, smoke, molotov, incendiary, decoy, concussion, stun, gas, sticky, impact, cluster,
//        thermite, sensor, emp, smoke_color, breach, flare, chaff, ninebang, mini, satchel, dynamite, medic
// Extensions (data.js header documents all): id === kind; group, unlockLevel, killReward, impactMin, armTime, remote, popOnRest,
//   airBurst, mass, drag, roll, danger (radius bots avoid), falloff { inner, exp }, selfDmg, losBlock; fx per kind (smoke, fire,
//   blind, deafen, gas, pulse, jam, emp, bomblets, remote, heal, ...). getNade(id), KINDS, ALIASES ('m67' -> 'frag'),
//   NADE_RULES { maxTotal: 4, groups: { flash 2, frag (lethal) 1, smoke 1, fire 1, tactical 2, support 1 } },
//   canCarry(inv.nades, gid) -> { ok, reason }, groupOf(id), blastDamage(nade, dist), flashBlind(nade, dist, angle).
// models.js — procedural grenade models (gun kit + gun materials; colours from nade.model.colors)
export function buildNade(scene, gid, { lod: 0|1|2, instance }) -> { id, nade, lod, root, meshes, parts: { pin?, ring? (child of pin),
//   spoon?, cap?, clacker? }, nodes: { grip, top, flame?, led?, fuse? }, info, dispose() }   // nade-local: origin at the body centre,
//   +Y up (fuze end), +X = spoon side; pin pulls along -X, the spoon flies off about +Z. NADE_SHAPES, nadeTris(nm), clearNadeCache(scene)
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
// geometry: merged per (32 m chunk, material, shadow flags) with world-scale UVs (a tile = MATERIALS[mat].scale m, default 2;
// uv multiplies the tile size), world matrices frozen; sparse materials are merged across chunks; MapDef.chunk may enlarge chunks.
// Colliders are added to the World unless collide:false; surf defaults to surfaceOf(mat). "frame" = the current B.push transform.
B.box(x, y, z, w, h, d, { mat, ry = 0, collide = true, surf, uv = 1, cast = true, receive = true,
                          mats: { n, s, e, w, t, b } /*per face: n = +z, s = -z, e = +x, w = -x*/, skip: 'tb' /*faces to omit*/,
                          visible = true, tag, walk, ray, solid }) -> collider id | -1
                         // (x, z) = centre in plan, y = BOTTOM, w along x, h up, d along z
B.boxc(x0, y0, z0, x1, y1, z1, opts)                       // box by two corners
B.floor(x0, z0, x1, z1, y, { mat, t = .2, mats })           // slab whose TOP is at y (mats: { b: 'plaster_white' } = ceiling below)
B.wall(x0, z0, x1, z1, { y = 0, h = 3, t = .2, mat /*left side walking from start to end*/, mat2 /*right side*/, matEnd /*ends+top*/,
         openings: [{ at /*centre, m from start*/, w = 1.2, h = 2.2, y = 0, frame /*true|material: trim*/, glass /*pane*/ }] }) -> [ids]
B.room({ x, z, w, d /*OUTER size, centred; walls inside it*/, y = 0, h = 3, t = .2, wall /*inside*/, outer, floor, ceil, roof,
         doors: { n: [at | {at, w, h, frame}], s, e, w }, windows: { n: [{ at, w = 1.2, h = 1.2, y = .9, glass }], ... },
         doorW = 1.2, doorH = 2.2, frames = 'wood_dark'|false }) -> { x0, z0, x1, z1, y, h }
         // n/s openings measured from the WEST end, e/w openings from the SOUTH end. Interior walls of a storey under a slab:
         // stop them inside the slab (h - .1) so their tops never z-fight with the floor above.
B.stairs({ x, z /*footprint centre*/, w, len, y0, y1, dir: '+x'|'-x'|'+z'|'-z', mat, tread, rail: true|'left'|'right'|false, railMat })
                         // a SOLID flight (steps + wedge, ~.18 m risers) with a ramp collider; railed sides get side colliders
B.ramp({ x, z, w, len, y0, y1, dir, mat, collide })        // visual wedge + ramp collider (climbs from y0 to y1 along dir)
B.ground({ minX, maxX, minZ, maxZ, mat, res = 2, height /*(x,z)=>y, optional*/, y = 0, collide = true })  // heightfield or flat
B.cyl(x, y, z, r, h, { mat, sides = 16, collide = true, ry, caps = true })   // y = bottom; a real cylinder collider (World.addCyl)
B.mesh(mesh, { mat, collide: 'box'|'none'|[{ cx,cy,cz,hx,hy,hz,ry }], surf, merge = true, cast, receive })
                         // mesh coordinates are in the current frame; merged meshes are baked into the chunk geometry and disposed
B.instance(key, buildFn /*(B) => Mesh|Mesh[]*/, x, y, z, { ry, s, collide = true|false|[specs] })   // thin instances per key and chunk
B.collider({ cx, cy, cz, hx, hy, hz, ry, surf, tag, ray, walk, solid }) -> id   // invisible (cy = centre)
B.light({ type: 'point'|'spot', x, y /*fixture height (a ceiling)*/, z, color, intensity = 8 /*physical: illuminance ~ I / d^2*/,
          range /*auto*/, dir, angle, fixture: true|'panel'|'tube'|'can'|'bulb'|false, flicker: 0..1 })
                         // ClusteredLightContainer when supported (it is in 9.31, also on SwiftShader), else each light only lights
                         // the chunk meshes in its range (<= 6 map lights per mesh). Point lights with a panel / tube
                         // fixture become wide DOWNWARD spots (a ceiling 5 cm from a point light blows out).
B.model(file /*assets/models/...glb*/, x, y, z, { ry, s, collide = 'box'|'none'|[specs] })   // loaded once per scene, instanced
B.prop(type, x, y, z, { ry, s, variant, collide })        // -> props.js placeProp(B, type, x, y, z, opts) (no automatic frame)
B.mat(name) -> BABYLON.Material                            // from gfx/materials.js
// frames, for props and prefabs: B.push(x, y, z, ry = 0, s = 1) ... B.pop()   or   B.frame(x, y, z, ry, B => { ... })
//   everything inside is placed relative to (x, y, z), turned by ry, scaled by s (markers too; B.ground uses the translation only)
// helpers: B.toWorld(x, y, z) -> {x,y,z}, B.rand() (seeded by the map id), B.heightAt(x, z) (ground height fns so far), B.scene,
//          B.world, B.def, B.warn(msg) (collected in MapInfo.warnings, shown by mapcheck)
// markers (gameplay); y may be null = snapped to the ground at the end of the build (from the top: use explicit y indoors)
B.spawn(team /*0 FFA, 1, 2*/, x, y, z, yaw, { field = false })
   // round starts use the team's lobby spawns (>= 10 per team, inside its lobby); respawn modes use field spawns
   // (field: true, >= 8 per team across that team's half, chosen away from enemies); FFA uses team 0 spawns (>= 16, whole map)
B.lobby(team, { x0, z0, x1, z1, y }, gates: [{ x, z, w = 2.4, h = 2.6, ry, y }])  // staging room; each gate = a solid collider
   // (tag 'gate') + a roller shutter mesh + a housing; it blocks the lobby until MapInfo.openGates() (round goes live)
B.buyzone(team, { x0, z0, x1, z1 })                                 // defaults to the team's lobby rect
B.hide(x, y, z, { r = .8, kind: 'bush'|'closet'|'vent'|'dark'|'crates'|'grass'|'car'|'under'|'roof' })  // >= 10 per map
B.site('A'|'B', { x0, z0, x1, z1, y })                              // bomb sites (every map has A and B; give y when it is not ground)
B.hostage(x, y, z) ; B.rescue({ x0, z0, x1, z1, y })                 // >= 4 hostages + a rescue zone (several allowed)
B.point(name, x, y, z, r)   // 'dom1'..'dom3', 'hp1'..'hp5', 'hill', 'flag1', 'flag2', 'extract1'.., 'hq1'..
```
### MapInfo (returned by `await buildMap(scene, def, opts)` in builder.js — async because of B.model loads)
```js
// opts = { quality, nav = true, lights = 'auto'|'chunks', mergeSparse = true, chunk }
{ id, def, world, spawns: { 0: [], 1: [], 2: [] } /*{x,y,z,yaw,field,team}*/, casters /*meshes for the sun shadow*/,
  lobbies: { 1, 2 } /*{x0,z0,x1,z1,y,x,z,gates}*/, gates: [collider ids], gateList: [{ id, team, x, y, z, w, h, ry, open, mesh }],
  buyzones: { 1: [rects], 2: [rects] }, hides: [{x,y,z,r,kind}], sites: { A, B } /*rect + centre x,z,y*/, hostages, rescue, rescues,
  points: { name: {x,y,z,r} }, bounds, lights: [{ light, spec, base, flicker }], lightMode, meshes, nav /*navgrid*/, warnings,
  stats: { msTotal, msDef, msModels, msMeshes, msWorld, msLights, msNav, meshes, tris, colliders, lights, navNodes },
  openGates(team?) /*colliders off, shutters roll up, nav gates open*/, closeGates(), update(dt) /*call every frame or tick:
  shutter animation + light flicker*/, dispose() }
```
Invisible walls are added just outside `bounds` (movement only: bullets pass, `tag: 'bounds'`).
### navgrid.js — bots and line of sight (pure JS)
```js
buildNav(world, bounds, { cell = .5, agentR = .25, standH = 1.8, crouchH = 1.25, step = .45, maxDrop = 3.5, mantle = 1.1, gates }) -> Nav
// layered grid (several floor levels per cell), standing / crouch-only nodes, walk links (step <= .45, no corner cutting),
// one-way drop links (<= 3.5 m) and mantle links (<= 1.1 m); lobby gates mark their nodes (closed gate = not walkable)
nav.nearest(x, y, z, maxR = 3) -> node | -1        nav.nodePos(i, out?) -> {x,y,z}      nav.nodeAt(x, y, z)
nav.findPath(from, to, { smooth = true, maxExpand, cost(i), crouchCost, gatesOpen }) -> [{ x, y, z, link: 'walk'|'drop'|'mantle', crouch }] | null
nav.walkLine(a, b) -> bool     nav.reachable(a, b, gatesOpen)     nav.flood(nodes, gatesOpen) -> Uint8Array     nav.randomNode(rand, filter)
nav.setGate(colliderId, open)  nav.gatesOpen(bool)  nav.isCrouchOnly(i)  nav.isGate(i)  nav.linksOf(i)  nav.component(i)  nav.stats
nav.losClear(a, b) / nav.losBlocked(a, b)          // world ray (glass is see-through) + blockers
nav.addBlocker({ x, y, z, r } | { test(ax, ay, az, bx, by, bz) -> bool, active }) -> remove()   // smoke volumes (grenades)
```
Measured (headless Chromium): dev_range builds in ~0.4-0.65 s (nav ~0.13-0.3 s, 25k nodes); a synthetic 160 x 160 m map with
40 two-storey buildings and 3000 colliders builds in 0.65 s (nav 0.32 s, 143k nodes); a cross-map A* takes ~8 ms, a LOS check ~5 us.

Every map must satisfy `validate.js` (`validateMap(info) -> { ok, errors, warnings, stats }`): spawns not inside colliders
(checked from 20 cm up) and on the ground, spaced apart, lobby spawns inside their lobby; lobbies sealed by their gates while
closed (no navgrid path out); every spawn, hostage, point and hide reachable from BOTH lobbies with the gates open; sites and
rescue zones need reachable floor inside their rect; hides >= 10, sites A/B, >= 4 hostages + rescue, dom1-3, hp1-4, hill,
flag1/flag2, extract1; spawn counts (>= 10 lobby + >= 8 field per team, >= 16 FFA).
`node tools/test/mapcheck.mjs <mapId> [--shots]` (or `all`) builds a map headless, runs validate.js, prints timings, sizes and draw
calls, and with --shots writes top.png (orthographic, markers drawn on), nav.png (reachability), lobby1/2, siteA/B and spawn-*
views to tools/test/out/maps/<id>/. `js/maps/defs/dev_range.js` is the test map that uses every builder feature (not shipped).

### Props (js/maps/props.js + js/maps/props/*.js) — the full list with sizes and options: docs/PROPS.md
```js
B.prop(type, x, y, z, { ry, s, variant /*name | 'random' (seeded by position)*/, seed, collide = true, hide = false, inst = false, cast = true, ...type opts })
// -> props.js placeProp(): returns the first collider id (or -1). Exports: PROPS { type: { size, cat, desc, variants, opts, scan, build } },
//    placeProp, propList() -> [{ type, cat, size, desc, variants, opts, scan, alias }], propSize(type, opts) -> [w, h, d] (real extents),
//    propKit(type, opts) -> Kit (geometry, no placement; tests), RAIL_TOP = .39 (rail head above a 'track' prop's origin)
```
* Every prop: (x, z) = centre of its footprint, y = the surface it stands on (BOTTOM), w along x, h up, d along z; the FRONT (doors,
  screens, seat fronts, car noses, forks) faces +z; wall-like props (fences, barriers, sandbags, hesco, racking, counters, lockers, stalls)
  run along x. Wall-mounted props (poster, wall_clock, whiteboard, wall atm, ac_unit 'wall') have their back at z = 0. `light_fixture`
  takes y = the CEILING height and hangs below it. Railcars stand on a `track` placed at the same y. ~133 types (115 code-built + 18 scans).
* Geometry is built once per (type, variant, shape options, seed) by a Kit (js/maps/props/kit.js) and MERGED into the map's chunk meshes
  per material (B.mesh), so props add almost no draw calls; identical heavy copies (>= 400 tris, same type / variant / options / seed)
  switch to thin instances (B.instance) after the first 6 (`inst: true | false` forces either). Organic props (`vary`: trees, bushes, rocks, crates, bags, cars...) get a different seed per position unless `seed` is given.
* Colliders are simplified boxes / cylinders matching the visible shape (solid, surf set: metal, wood, fabric, concrete...). Small clutter
  (cones, cans, chairs from scans, lamps, posters) has none. Walk-in props have hollow colliders: container doors 'open'/'ajar', site_cabin
  interior, tent, wardrobe 'large', toilet stalls, vent 'duct' (crouch-only inside), bunk beds (crouch under), airliner (crouch under).
  Chain-link fences / gates / railings use `ray: false` colliders (bullets and sight pass, movement blocked). Foliage (bush, hedge,
  grass_tall >= .85 m, corn) gets a NON-SOLID sight-blocking collider `tag: 'foliage'`, `surf: 'fabric'` (hedges are solid too): bots
  cannot see through it, bullets pass cheaply; systems that should ignore foliage (grenade bounces) pass `skipTag: 'foliage'` to rays.
* Hide-spot hints: props that make natural hiding places carry a hint (kind car / crates / bush / grass / closet / vent / dark / under /
  roof) that is registered with B.hide only when the placement passes `hide: true` (validate.js checks every hide is reachable).
* Materials: library materials + extra `p_*` library entries registered by kit.js at import (car paints with clear coat, plastics,
  fabrics, flat paints, chrome / alu / galvanised / stainless, glass tints, emissive amber / blue / cyan, woods, precast concrete,
  ballast, rock, sandbag, hay...; they get the LF surface shader: wetness, sky occlusion). Custom per-scene materials: `p_foliage`
  (alpha-cut card atlas assets/models/tex/foliage.jpg + foliage_a.jpg, composed from CC0 ambientCG atlases by tools/fetch-props.py),
  `p_bark` (ambientCG Bark001), `p_decal` / `p_glow` (a 2048 px canvas atlas drawn at run time by js/maps/props/decals.js: container
  codes and fictional line logos, stencils, hazard diamonds, plates, road signs, posters, screens, vending fronts, book spines...; all
  original art and fictional names). Lit parts (screens, lamps, signals) use emissive materials; `light: true` on street_light,
  light_fixture and tent adds a real B.light.
* Scans: `scan_*` types are CC0 Poly Haven models packed into assets/models/ph/*.glb by tools/fetch-props.py and placed with B.model
  (explicit rotated box colliders). They use plain glTF PBR materials (no wetness / sky occlusion), so under roofs on OUTDOOR maps they
  read a little brighter than code-built props: prefer them outdoors or on indoor maps.
* Dev map `prop_gallery` (js/maps/defs/prop_gallery.js, not one of the 25) lays out every type and variant with a 1.8 m figure; walk it with
  `#dev&sandbox&map=prop_gallery`. `node tools/test/props.mjs` builds it headless, checks every kit (no NaN, nothing under the floor, no
  builder / material warnings, colliders present, a bush does not block movement, zero console errors) and writes a shot per type to
  tools/test/out/props/. Adding a prop: a `{ type, cat, size, desc, variants, opts, keys, vary, build(K, o, v, rnd) }` entry in the
  category file; the Kit API is documented at the top of js/maps/props/kit.js, shared parts in js/maps/props/parts.js.

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
ModeDef extras read by js/game/match.js: warmupTime, roundEndTime (5), halftimeTime (6), spawnProtect, elimination (round modes,
default true), teamScoreOnKill (timed team modes, default true), spawnLobbyEveryRound, checkWin(game) -> winner|null, onRoundTime(game)
-> winner (default: team 2), defaults { option: value } (game options, e.g. practice { infiniteAmmo: true }). Match (game.match):
phase, t, round, roundsPlayed, score { 1, 2 }, winner, roundWinner, reason, half, swapped, timeLeft, limit, elapsed;
start(), tick(dt), endRound(winner, reason), endMatch(winner, reason), addScore(team, n), respawnIn(p, s), alive(team),
teamPlayers(team), leader(), isFrozen(), snapshot() / apply(snap) (net). Default scoring: kill +2, assist +1, suicide -1; timed team
modes add a team point per kill; FFA ends at scoreLimit kills; halftime after half the rounds swaps teams 1 <-> 2 and the scores.
Mode ids: tdm ffa demolition hostage wingman retake snd elimination domination hardpoint koth ctf
killconfirmed gungame gunrush infection hideseek vip juggernaut oitc sharpshooter headquarters snipers
blades hardcore practice.

---------------------------------------------------------------------------------------------------
## 9. Audio (js/audio/audio.js) — synthesised (no samples), positional

```js
export const Audio = {
  init({ force }) /*arms gesture listeners; the AudioContext starts on the first user gesture (main.js calls it, LF.audio)*/,
  resume(), ready() -> Promise /*warm set baked*/, prepare({ families, nades }) -> Promise /*bake what a match needs*/,
  setVolumes({ master, sfx, music, ui, voice, ambience }) /*also follows Settings masterVol..voiceVol by itself*/,
  setStyle({ bodycam: 0..1 }) /*AGC "pump" after loud sounds, default .35*/, setEnabled(bool),
  listener(pos, yaw, pitch) /*every frame, eye position, Babylon axes*/, setSpace({ reverb: 'outdoor'|'room'|'hall'|'tunnel'|'none', surface }),
  gun(family, { pos?, suppressed, local, distant, id /*shooter id*/, gun /*GUNS record or stats: velocity, cycle, archetype, rpm*/, occ, surf }),
  dry(family?), reload(stage, family, { pos, local, id, gun, empty }),
  step(surf, { pos?, local, speed /*0..1 loud fraction; 0 = silent for others, quiet for the local player*/, crouch, id, occ }),
  land(surf, speed /*m/s*/, { pos, local }), jump({ pos, local, surf }),
  impact(surf, { pos, ricochet, occ }), whiz({ pos, miss /*m*/, speed /*bullet m/s: >345 = supersonic snap*/, pellet }),
  hit({ head, armor, local, pos }), kill({ head }), hurt(dmg, { hp }), heartbeat(),
  nade(kind, stage, { pos, id, surf, speed, family, duration, local, occ }), tinnitus(seconds, { k }), muffle(seconds, k),
  ui(name /*hover click back buy deny tick round win lose unlock reward notify open close type countdown equip mvp*/),
  ambience(kind, { rain, wind } /*0..1*/), music(mood /*'menu'|'lobby'|'tension'|'none'*/), radio(name, { pos }),
  melee(kind /*knife|machete|axe*/, stage /*draw|swing|hit|stab*/, { pos, local, surf }), sfx(name, { pos }) /*bomb_beep bomb_key
  bomb_planted bomb_defuse bomb_defused gate_open gate_close door_open door_close pickup drop armor glass heartbeat scope_in
  scope_out light zip*/, vo(name /*cough pain death exhale breath*/, { pos }), bodyfall(surf, { pos }),
  move(id, pos), stopLoop(id), stopAll() /*voices, loops, ambience; music keeps its mood*/, stats(),
  render(fn(A, at), secs, opts) -> Promise<{ buffer, jsMs, renderMs, stats }> /*tests: the full chain on an OfflineAudioContext*/
}
// gun families: pistol_9 pistol_45 pistol_mag smg_9 smg_45 rifle_556 rifle_762 rifle_545 br_308 dmr_762
//               sniper_338 sniper_50 shotgun_12 lmg_556 lmg_762 (+ suppressed variants via the flag)
```
* Every call is a no-op before init and never throws. Pass `pos` (world, metres) for anything not made by the local player;
  `local: true` = the listener's own sound (non-positional). `id` = the emitter (player id / grenade id): it groups voices.
* reload stages (weapon.js): `start magout magin shell chamber end cancel`, plus `draw holster inspect firemode ads adsout laser`
  and any bank `rl:*` name (`pump bolt lever slide charge boltrel magdrop ...`). With `gun` the stage follows reloadKind
  (cylinder / belt / break / shell / mag) and cycle; manual actions (pump / bolt / lever) also play their cycle after each shot.
* nade stages: `pin` (or strike / arm by kind) `spoon` `throw` (adds the spoon if none was sent) `bounce` (surf, speed m/s)
  `stick` `beep` `ping` (sensor pulse) `arm` `detonate` `boom` (explosion / pop / glass+fire / zap / emp by kind; starts the
  kind's loop when `id` is given) `bomblet` (cluster sub-blast) `loop` (start or move: smoke hiss, gas, mist, fire, sizzle, fuse,
  buzz, rustle; decoy = bursts of opts.family) `move` `end` (fades the loop). One `boom` per Ninefold bang. The grenade system
  calls `tinnitus(secs)` itself for flash / deafen / concussion (fx.deafen, BLAST_FX tinnitus): audio does not guess distances.
* ambience kinds: harbor office desert city snow hospital mall metro refinery farm ship village prison lab construction estate
  factory bazaar dam suburb club hangar railyard interchange outpost storm outdoor indoor menu none (map ids work as aliases).
* Design: every sound is pure-JS DSP (`js/audio/dsp.js`, recipes in `js/audio/sounds/*.js` registered in `js/audio/bank.js`),
  baked into AudioBuffers by a module Worker (`bake-worker.js`, main-thread fallback) and normalised to level targets. Runtime
  (`engine.js`): buses sfx / amb / voice -> world -> deafen LP -> body-cam AGC duck -> master -> soft-clip limiter (zero
  latency); HRTF PannerNodes (20 nearest, equalpower beyond / on mobile), distance gain, air absorption, arrival delay d/343,
  occlusion (`occ` 0..1), A/B crossfaded convolution reverb per space, voice cap 96 (40 mobile) with priority stealing.
* `node tools/test/audio.mjs` renders every sound (Node) and the whole runtime chain (Chromium): levels, NaN / clipping, distance,
  HRTF, reverb, mix balance, CPU per shot; spectrogram PNGs + WAVs in tools/test/out/audio/.

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
* API base: `#dev&api=<url>` (dev only) > `lf_account_v1.api` (Account → Server, LIVE FIRE only) > `nv_account_v1.api` (Neon Veins'
  own server setting) > `DEFAULT_API`. The session is SHARED (nv_account_v1) only while LIVE FIRE talks to the same server as Neon
  Veins; on a different server it lives in `lf_account_v1` so a foreign 401 can never sign Neon Veins out. Other tabs and Neon Veins
  signing in / out are picked up through the `storage` event.
```js
// api.js (full header in the file)
export const Account = { init(), member(), user(), server(), setServer(url|''), sharedLogin(), configured(),
  signup(email, username, pw) -> user, login(login, pw) -> user, logout(), refresh(),
  friends({ force }) -> { friends: [{ ...publicUser, online, activity, join_code, last_seen, liveFire, joinable }], incoming, outgoing },
  search(q), request(username), respond(id, accept), unfriend(id),
  presence(activity, code) /*set status + heartbeat now*/, setStatus({ activity, code } | null), status(), beat(), pending(),
  invite(friendId, code), join(code, from?) -> bool /*emits appBus 'net:join' { code, from }; false when nobody listens*/,
  loadCloud() -> { profile, summary, updated } | null, saveCloud(profile, { summary, keepalive }), cloudInfo(), deleteCloud(),
  submitScore(board, score, detail) -> result | { error }, getBoard(board) -> board | { error } /*never throw*/,
  boardsAvailable() -> null|true|false, NO_BOARDS, on(fn(evt)) -> off /*auth presence invite requests friends server*/, lastError }
// Heartbeat every 30 s while visible (`LIVE FIRE · In the menus`, or derived from LF.game: `LIVE FIRE · Practice TDM · <map>`);
// the multiplayer layer calls setStatus({ activity: 'Hosting TDM · <map>', code }) while hosting (join_code only then) and
// setStatus(null) afterwards, and handles appBus 'net:join' { code, from } (JOIN in the friends list / on an invite card).
// An invite counts as LIVE FIRE when the sender's presence is LIVE FIRE with that join code; others show as Neon Veins co-op.
// Leaderboards: lf:<mode>:<YYYY-MM UTC> and lf:<mode>:all = best match score (profile.js boardScore, cap 100000);
// lf:xp:<YYYY-MM> / lf:xp:all = XP (cap 50M). The deployed server rejects them (400 'Unknown board.') until the NEON_VIENS worker
// change is deployed: getBoard / submitScore then return { error: NO_BOARDS } ('Leaderboards are not available yet.').
// profile.js (full header in the file)
export const Profile = { init(), load(), get(), save(why), onChange(fn(p, why)) -> off, level(), levelInfo(xp?), xpToNext(),
  xpForLevel(L), levelOf(xp), addXP(n, why) -> gain, addCredits(n, why), credits(), spend(n) -> bool,
  owns(kind, id) /*usable now: 'gun' (incl. melee) | 'att' | 'skin' | 'nade'; level >= unlockLevel or owned*/, isOwned, unlock(kind, id),
  lockInfo(kind, id) -> null | { level, price }, price(kind, id), buy(kind, id) -> { ok, reason, price }, unlocksAt(L), nextUnlocks(n),
  loadouts() /*5*/, loadout(i?) -> { name, primary, secondary, melee, nades, mods: { gunId: mods }, skins: { gunId: skin } },
  setLoadout(i, lo) -> sanitized, select(i), selected(), sanitizeLoadout(lo), gunStats(id), gunLevel(id), stats(), modeStats(mode),
  recordMatch(summary) -> result, summarize(game, endEvent, tracker), track(game) -> off, autoTrack(LF), lastMatch,
  sync(), flush(keepalive?), syncState(), callsign(), boost(), merge(a, b), sanitize(p), fresh(), reset(), markSeen(level) }
// summary = { mode, map, result 'win'|'loss'|'draw', quit, kills, deaths, assists, headshots, damage, shots, hits, mvps, score,
//   objectives, bestStreak, time (s), guns: { gunId: { kills, hs, shots, hits, dmg } }, botMode, god, ... } (summarize builds it).
// result = { xp, credits, matchCredits, levelCredits, masteryCredits, base, mult, boost, firstWin, breakdown: [{ label, xp, credits }],
//   levelUps: [L], unlocks: [{ kind, id, name, level }], crates, gunLevels: [{ id, name, from, to }], level, prevLevel, score, info }.
// main.js calls Profile.autoTrack(LF): every new LF.game is tracked and recorded at 'match:end' (a quit after 60 s with kills
// records a partial match). Results screens read Profile.lastMatch (or listen to appBus 'profile:match' { summary, result }).
// Matches start with the selected loadout: pass `local: { loadout: Profile.loadout(), name: Profile.callsign(), profileLevel:
// Profile.level() }` to createGame. Practice mode = x0.5 XP / credits, static / passive bots x0.2, god mode nothing; only full-reward
// completed matches go on the leaderboards. XP: level 2 after ~1 match, ~700 average matches to level 100 (all guns by level 60).
// rewards.js (full header in the file)
export const Rewards = { status(now?) -> { ready, day, streak, nextStreak, best, claims, claimedToday, broken, clockBack, msToNext,
  nextAt, cycle, weekBonus, reward, firstWin }, claim(now?) -> { ok, day, items, credits, xp, boost, drops, gain } | { ok: false, reason },
  crates(), openCrate(id) -> { ok, crate, drops }, firstWin(now?), rarityOf(kind, item), fmt(ms), DAYS, CRATES, CYCLE, RARITY }
// UI: js/ui/account.js openAccount(tab?), mountAccountChip(el), installAccountUI(); js/ui/rewards.js openRewards(),
// decorateRewardsItem(titleEl), revealDrops({ title, sub, items, drops, crate }) (crate / reward reveal overlay). css/rewards.css.
```
* Tests: `node tools/fake-nv-api.mjs [--port=8787]` runs the REAL `NEON_VIENS/server/worker.js` on a node:sqlite D1 (never use the
  production server in tests); `node tools/test/account.mjs` = progression unit checks + the whole account flow in Chromium
  (point the game at a local server with `#dev&api=http://127.0.0.1:8787`, or set `nv_account_v1.api` like Neon Veins does).

---------------------------------------------------------------------------------------------------
## 12. Graphics (js/gfx)

```js
// materials.js
export function initMaterials(scene, { quality, names?, wet? }) -> Promise   // quality tier; preloads `names` (else lazy)
export function getMaterial(scene, name) -> BABYLON.PBRMaterial  // cached per scene; unknown name -> concrete (warns once)
export function surfaceOf(name) -> surf                         // for footsteps / penetration / impacts
export const MATERIALS = { name: { surf, set, tex /*assets/textures/<set>*/, scale /*metres per texture tile*/, color?, desat?, ... } }
export function setWetness(scene, wet, { puddles, rain }), setSkyOcclusion(scene, occ|null)   // env.js drives these
export function freezeMaterials(scene), unfreezeMaterials(scene), whenMaterialsReady(scene), textureStats(scene), disposeMaterials(scene)
// env.js
export async function applyEnvironment(scene, env, { quality, camera?, world?, groundAt?, groundY? })
   -> { sun, shadow /*CascadedShadowGenerator|ShadowGenerator|null*/, sky, hdri, exposure, fogColor, onLightning,
        addShadowCasters(meshes), setWeather(kind, intensity), setRotation(rad), setWorld(world), dispose }
export const HDRIS   // clear partly_cloudy noon golden dusk overcast storm fog snow night night_city warehouse
// postfx.js
export function createPipeline(scene, camera, { quality, lens, motionBlur }) -> { setLens(mode), setFlash(k), setDamage(k),
     setADS(k), setScope(on), setExposure(mul), setMotionBlur(on), setQuality(tier), setCamera(cam), info(), dispose() }
// quality.js
export const QUALITY = { low, medium, high, ultra }; export function applyQuality(engine, scene, tier)
export function detectTier(engine), resolveTier(setting, engine), currentTier(scene), autoResolution(engine, { target, min })
```
How the game uses it (order matters):
1. `applyQuality(engine, scene, resolveTier(Settings.get('quality'), engine))` when the match scene is created.
2. `await initMaterials(scene, { quality })`, then build the map (`B.mat(name)` = `getMaterial`).
3. `env = await applyEnvironment(scene, def.env, { quality, camera, world: game.world })` — pass the collision World: it
   stops rain under roofs, keeps roofed surfaces dry and dims the sky light indoors (sky-occlusion height map); when the
   environment is applied before the map exists, call `env.setWorld(mapInfo.world)` after building it.
   Then `env.addShadowCasters(mapInfo.casters)` and `env.shadow?.addShadowCaster(playerMesh)` for characters / props.
4. `fx = createPipeline(scene, camera, { quality, lens: Settings.get('lens'), motionBlur: Settings.get('motionBlur') })`;
   each frame: `fx.setFlash(p.flash)`, `fx.setDamage(k)`, `fx.setADS(adsProgress)`; `fx.setScope(true)` while a magnified
   scope overlay is up. Settings changes: `fx.setLens`, `fx.setMotionBlur`, `fx.setQuality`.
5. Optional: `freezeMaterials(scene)` once the map, env and all lights exist (re-done automatically when a light is added or
   removed; toggling `light.setEnabled` on a frozen material needs `unfreezeMaterials` first).
6. On match end: `fx.dispose(); env.dispose();` (materials die with the scene).
UV convention: map geometry carries WORLD-ANCHORED UVs in TEXTURE TILES = world metres / MATERIALS[name].scale (walls:
u = horizontal world axis along the face, v = world y; floors: u = x, v = z), emitted by builder.js, so touching boxes
continue the texture without seams; materials use uScale 1. Props with their own UVs (B.mesh) follow the same unit.
Radiance scale (for B.light intensities): env.js normalises every HDRI so an up-facing white surface gets ~1.5 in full day
(shade ~.3) and ~.09 at night; a point light of intensity ~18 at 4 m gives a street-lamp pool. Lights are absolute (not
scaled by the HDRI). Viewmodel = renderingGroupId 1, nothing special needed: every post pass works on the composited frame.
Material names used by maps (all must exist, with a procedural fallback when a texture is missing):
concrete concrete_dark concrete_floor asphalt brick brick_red plaster plaster_white tile_white tile_floor
wood_planks wood_floor wood_dark plywood metal_plate metal_painted metal_rust corrugated corrugated_rust
steel_dark glass gravel dirt grass sand snow rock marble carpet fabric rubber cardboard paint_yellow
paint_red paint_blue water mud asphalt_wet hazard emissive_white emissive_warm.
Extra names available: concrete_panels pavement cobblestone roof_tiles ceiling_tile parquet wood_siding barn_red container
container_red container_blue container_orange container_grey steel grate chainlink (cut-outs) burlap leather plastic_white
plastic_black paint_green paint_white paint_black glass_frosted emissive_red emissive_green.
Assets: `python3 tools/fetch-assets.py` (curated CC0 list, Poly Haven + ambientCG; HDRIs baked by `tools/bake-env.mjs`);
preview every material / HDRI / the street-corner scene at `tools/preview/materials.html`; `node tools/test/gfx.mjs` checks
that everything loads and estimates GPU memory per tier.

---------------------------------------------------------------------------------------------------
## 13. Testing

* `node tools/serve.mjs 8080` then Playwright (`require('playwright')`, pre-installed Chromium) with
  `tools/test/lib.mjs` helpers (`launch()`, `openGame(page, hash)`, `waitFor(page, expr)`, `shot(page, file)`, console capture).
* Dev hash params: `#dev&map=<id>&mode=<id>&bots=<n>&team=1|2&q=low|medium|high&autostart&seed=<n>&nolens&peer=host:port` (+ `&sandbox`, `&nodyn`).
* Headless Chromium uses SwiftShader (software GL): frames are slow, so drive the sim with `LF.game` hooks instead of
  waiting real time, keep viewports small (960x540), and use quality low for functional tests.
* A change is not done until it boots with ZERO console errors (`node tools/test/smoke.mjs`).
* `node tools/test/props.mjs [--only=a,b] [--q=low] [--noshots] [--doc]`: builds the prop_gallery dev map, checks every prop kit and writes a
  screenshot per type to tools/test/out/props/; `--doc` regenerates docs/PROPS.md.
* `node tools/test/phys.mjs` (Node, no browser): World / ray / move / navgrid unit tests + timings.
* `node tools/test/smoke.mjs`: title boot + the dev sandbox on dev_range (gates, stairs, mantle, hill) + screenshots. Its
  `openPage(browser, base, hash)` export serves the pinned Babylon scripts from tools/test/out/cache (fetched once).
* Sandbox: `#dev&sandbox&map=<id>&q=low&nolens&nodyn` walks a map with the real movement code; `LF.sandbox.step(n, cmd)`.
* `node tools/test/match.mjs [--map=dev_range] [--bots=8] [--secs=90]`: round flow in Node (stub game), then real matches through
  `LF.game` (`debugStep`, `setLocalCommand`, `aimAt`): TDM kills / scores / no NaN / no fall-through / bots move / safe respawns /
  gates, combat rules (friendly fire, armour, penetration, exact RPM, semi limit, reload time, backstab), FFA, match end -> results ->
  menu, menu flow (title -> practice setup -> deploy -> pause -> quit -> second match). Screenshots `match-*.png`.
* Match dev hash: `#dev&map=<id>&mode=<id>&bots=<n>&team=1|2&q=low&autostart&seed=<n>&nolens&nodyn` + `&skill=0..1 &warmup=s &freeze=s
  &time=s &score=n &infammo=true|false &god &botmode=static|passive`. `game.effects.hold = game.viewmodel.hold = true` freezes the
  effects / viewmodel pose for screenshots (SwiftShader frames are slow).
* UI (js/ui/menu.js `App`, also `LF.app`): `play(cfg) -> Promise<Game>`, `toMenu()`, `pause(open)`, `openSettings()`. Maps are offered
  in the menu when their js/maps/index.js entry has `ready: true` (dev_range always).
