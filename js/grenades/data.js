/* LIVE FIRE — grenades and throwables. DATA ONLY + small pure helpers (no BABYLON, no DOM; Node tests import it).
   Contract: docs/ARCHITECTURE.md §6. Tables and reasoning: docs/WEAPONS.md. Checked by tools/test/balance.mjs.
   Exports:
     KINDS                       the 25 kinds of docs §6 (every grenade has a unique kind; id === kind)
     GRENADES                    25 grenades (fields below)
     NADE_RULES                  carry / buy limits: { maxTotal: 4, groups: { name: { max, label, kinds } }, note }
     ALIASES                     old stub ids -> ids ('m67' -> 'frag')
     getNade(id)                 grenade by id or kind (aliases resolved) or null
     groupOf(idOrKind)           NADE_RULES group name
     canCarry(nades, gid)        nades = [{ gid, n }] (PlayerState.inv.nades) -> { ok, reason }   (buy menu, loadouts, pickups)
     blastDamage(nade, dist)     health damage at dist metres BEFORE armour (falloff curve below), 0 outside the radius
     flashBlind(nade, dist, angle)  seconds of blindness for a flash-type nade: angle = radians between the victim's view
                                 direction and the direction to the burst (0 = looking right at it); line of sight is the caller's job

   Fields (every grenade has all of them; null / 0 / false when they do not apply):
     id, name, kind, group, desc, price, max (carry), unlockLevel, killReward, team (0 = both teams)
     fuse        seconds from release (from pin pull when cooked) to the effect; 0 = no timer (impact / remote)
     cookable    fuse runs while you hold it with the pin out; holding past the fuse detonates in hand
     impact      detonates on the first contact faster than impactMin m/s, once armed (armTime s after release)
     sticky      sticks to the first world surface or player it touches (then `fuse` runs, or the deploy time)
     remote      detonated by the thrower (USE / alt fire) after armTime; see fx.remote
     popOnRest   the fuse only ends once the canister has stopped rolling (smoke, signal smoke, medic)
     airBurst    seconds after which an impact nade breaks in mid-air anyway (no ground effect), or 0
     throwSpeed, lobSpeed   release speed m/s for the overhand / underhand throw (inherits the thrower's velocity; g = 9.81)
     mass (kg), drag (1/s linear air drag), bounce (restitution of the normal speed), friction (share of the tangential speed lost
     per bounce), roll (rolling deceleration m/s^2)
     radius      effect radius (m): blast, flash reach, cloud, fire patch, sensor, jammer... (see fx for the details)
     danger      radius (m) bots and the HUD danger marker should treat as dangerous
     dmg         blast damage at the centre (before armour); falloff = { inner, exp }: full damage within `inner`, then
                 dmg * (1 - (d - inner) / (radius - inner)) ^ exp  (blastDamage()); fire / gas damage is fx.*.dps
     armorPen    share of blast damage that passes armour (fire, gas and shock ignore armour: 1)
     selfDmg     multiplier for the thrower's own damage (friendly fire stays OFF: teammates take nothing)
     losBlock    blast / flash are stopped by solid walls between the burst and the victim (raycast from the burst)
     duration    seconds the effect lasts (smoke, fire, gas, sensor, jammer, heal; flash = maximum blindness)
     model       { shape: egg|can|bottle|stick|puck|sphere|brick|bag|bundle, size: [diameter, height] or [w, h, d] metres,
                 colors: { part: [r, g, b] 0..1 }, details... } for the grenade model / viewmodel worker
     fx          kind-specific parameters for js/grenades/sim.js and js/grenades/fx.js (documented per entry)
*/

export const KINDS = ['frag', 'he', 'flash', 'smoke', 'molotov', 'incendiary', 'decoy', 'concussion', 'stun', 'gas', 'sticky', 'impact',
  'cluster', 'thermite', 'sensor', 'emp', 'smoke_color', 'breach', 'flare', 'chaff', 'ninebang', 'mini', 'satchel', 'dynamite', 'medic'];

export const NADE_RULES = {
  maxTotal: 4,
  groups: {
    flash:    { max: 2, label: 'flash', kinds: ['flash', 'ninebang'] },
    frag:     { max: 1, label: 'lethal', kinds: ['frag', 'he', 'impact', 'sticky', 'cluster', 'mini', 'dynamite', 'satchel'] },
    smoke:    { max: 1, label: 'smoke', kinds: ['smoke', 'smoke_color'] },
    fire:     { max: 1, label: 'fire', kinds: ['molotov', 'incendiary', 'thermite'] },
    tactical: { max: 2, label: 'tactical', kinds: ['decoy', 'concussion', 'stun', 'gas', 'sensor', 'emp', 'breach', 'flare', 'chaff'] },
    support:  { max: 1, label: 'medic', kinds: ['medic'] },
  },
  note: 'At most 4 grenades in total; per group at most 2 flashes, 1 lethal explosive, 1 smoke, 1 fire, 2 tactical, 1 medic; and never more of one grenade than its own `max`.',
};

const BLAST_FX = (o = {}) => ({
  blast: { fireball: o.fireball ?? .9, light: o.light || [1, .72, .4], intensity: o.intensity ?? 8, lightRange: o.lightRange ?? 12, lightTime: .12,
    smoke: { color: [.2, .19, .18], puffs: o.puffs ?? 14, rise: .8, life: 4 }, debris: o.debris ?? 24, sparks: o.sparks ?? 40,
    decal: { kind: 'scorch', r: o.decal ?? 1.4 } },
  fragments: o.fragments ? { count: o.fragments, range: o.fragRange || 14 } : null,
  shake: { radius: o.shakeR ?? 22, amp: o.shake ?? 1, time: .7 },
  tinnitus: { radius: o.tinR ?? 7, secs: o.tin ?? 2.6 },
  destroys: { glass: o.glass ?? 6, props: o.props ?? 2.5 },
});

function N(o) {
  return {
    id: o.kind, name: o.name, kind: o.kind, group: null, desc: o.desc, price: o.price, max: o.max || 1, unlockLevel: o.lvl, killReward: 300, team: 0,
    fuse: o.fuse ?? 0, cookable: !!o.cook, impact: !!o.impact, impactMin: o.impactMin ?? (o.impact ? 2.5 : 0), armTime: o.arm ?? 0,
    sticky: !!o.sticky, remote: !!o.remote, popOnRest: !!o.rest, airBurst: o.airBurst || 0,
    throwSpeed: o.ts ?? 18, lobSpeed: o.ls ?? 8.5, mass: o.mass ?? .4, drag: o.drag ?? .05, bounce: o.bounce ?? .38, friction: o.friction ?? .45, roll: o.roll ?? 3,
    radius: o.radius, danger: o.danger ?? (o.dmg ? o.radius : 0), dmg: o.dmg || 0, falloff: o.falloff || { inner: 0, exp: 1 },
    armorPen: o.ap ?? 1, selfDmg: o.self ?? 1, losBlock: o.los ?? true, duration: o.duration || 0,
    model: o.model, fx: o.fx || {},
  };
}

export const GRENADES = [
  N({ kind: 'frag', name: 'Thorn Frag', price: 300, lvl: 1, fuse: 3.2, cook: true, radius: 9, dmg: 120, falloff: { inner: 1, exp: 1.7 }, ap: .62,
    desc: 'Serrated-coil fragmentation grenade: 3.2 s fuse you can cook; lethal close, wounding out to nine metres.',
    model: { shape: 'egg', size: [.064, .09], colors: { body: [.23, .27, .18], band: [.75, .62, .16], fuze: [.45, .45, .42] }, spoon: true, pin: true },
    fx: BLAST_FX({ fragments: 60, fragRange: 14 }) }),
  N({ kind: 'he', name: 'Hammerhead HE', price: 350, lvl: 10, fuse: 2.6, cook: true, radius: 6.5, danger: 8, dmg: 150, falloff: { inner: 1.5, exp: 1.4 }, ap: .7,
    desc: 'Blast-only high-explosive charge: no fragments, a harder and shorter shockwave that also smashes glass and light cover.',
    model: { shape: 'can', size: [.06, .11], colors: { body: [.3, .33, .24], band: [.85, .7, .15], fuze: [.45, .45, .42] }, spoon: true, pin: true },
    fx: BLAST_FX({ fireball: 1.3, intensity: 10, shake: 1.4, shakeR: 26, glass: 9, props: 4.5, debris: 36, tin: 3.2 }) }),
  N({ kind: 'flash', name: 'Daystar Flashbang', max: 2, price: 200, lvl: 1, fuse: 1.6, radius: 24, duration: 4.8, mass: .35, bounce: .42,
    desc: 'Magnesium flash and a 170 dB bang: up to 4.8 s of white-out if you look at it, a fraction of that if you turn away.',
    model: { shape: 'can', size: [.044, .12], colors: { body: [.15, .15, .16], band: [.88, .88, .86] }, perforated: true, spoon: true, pin: true },
    fx: { blind: { max: 4.8, min: .25, hold: .5, angle: { cone: .9, front: 1, side: .45, back: .12 }, dist: [[0, 1], [.25, .95], [.5, .7], [.75, .35], [1, 0]], selfBlind: true },
      deafen: { radius: 16, secs: 3.2, muffle: .85 }, light: { intensity: 40, range: 20, time: .08 }, smoke: { puffs: 4, color: [.75, .75, .75] } } }),
  N({ kind: 'smoke', name: 'Veil Smoke', price: 300, lvl: 1, fuse: 1.4, rest: true, radius: 4.6, duration: 18, mass: .45, bounce: .3, friction: .55,
    desc: 'Burning-mix smoke canister: pops once it stops rolling and fills a 4.6 m bubble for 18 s that nobody can see through.',
    model: { shape: 'can', size: [.064, .15], colors: { body: [.42, .44, .4], band: [.85, .85, .82] }, topHoles: true, spoon: true, pin: true },
    fx: { smoke: { radius: 4.6, height: 3.4, growth: 1.6, lifetime: 18, fade: 3, color: [.78, .79, .8], density: .97, particles: 180, emit: 1.2,
      settle: 'floor', drift: .15, blocksLOS: true, extinguish: true, hiss: true } } }),
  N({ kind: 'molotov', name: 'Rag Cocktail', price: 400, lvl: 1, impact: true, impactMin: 3, airBurst: 2.0, radius: 3.2, danger: 3.6, duration: 7, ts: 16.5, ls: 8,
    mass: .7, bounce: .1, friction: .7,
    desc: 'Bottle of fuel with a burning rag: shatters on the ground into a 3.2 m fire patch that burns for 7 s and flows downhill.',
    model: { shape: 'bottle', size: [.075, .26], colors: { glass: [.35, .45, .25], liquid: [.8, .55, .2], rag: [.75, .68, .55] }, burningRag: true },
    fx: { fire: { radius: 3.2, spreadTime: 1.0, dps: 40, tick: .25, lifetime: 7, fade: 1.2, height: 1.1, color: [1, .55, .18], smoke: [.15, .12, .1],
      maxSlope: .6, flowDown: true, blockedBySmoke: true, light: { color: [1, .6, .25], intensity: 6, range: 9, flicker: .4 } }, glass: { shards: 30 } } }),
  N({ kind: 'incendiary', name: 'Sunstrike Incendiary', price: 500, lvl: 14, impact: true, impactMin: 2.5, airBurst: 2.2, radius: 3.6, danger: 4, duration: 7.5,
    mass: .55, bounce: .25,
    desc: 'Magnesium-thermate canister: bursts on impact into a wider, white-hot fire that burns longer and blinds thermal sights.',
    model: { shape: 'can', size: [.06, .14], colors: { body: [.55, .2, .15], band: [.95, .8, .2] }, spoon: true, pin: true },
    fx: { fire: { radius: 3.6, spreadTime: .8, dps: 34, tick: .25, lifetime: 7.5, fade: 1.2, height: .9, color: [1, .85, .6], smoke: [.85, .85, .82],
      maxSlope: .6, flowDown: false, blockedBySmoke: true, sparks: 120, thermalGlare: true, light: { color: [1, .9, .7], intensity: 9, range: 10, flicker: .3 } } } }),
  N({ kind: 'decoy', name: 'Mimic Decoy', price: 50, lvl: 3, fuse: 2.0, radius: 1.2, duration: 15, mass: .3,
    desc: 'Plays recorded bursts of your own primary weapon for 15 s and shows up as a contact on enemy radar, then pops.',
    model: { shape: 'can', size: [.05, .11], colors: { body: [.25, .3, .45], band: [.85, .75, .2] }, speaker: true },
    fx: { mimic: { gun: 'primary', bursts: [2, 6], gap: [.35, 1.6], lifetime: 15, radar: true, volume: .9 }, endPop: { dmg: 5, radius: 1.2 } } }),
  N({ kind: 'concussion', name: 'Thunderclap Concussion', price: 250, lvl: 18, fuse: 2.0, cook: true, radius: 8, danger: 8, dmg: 8, falloff: { inner: 1, exp: 1 },
    ap: .5, duration: 4,
    desc: 'Overpressure grenade: barely scratches, but leaves everyone within eight metres slowed, swaying and half-deaf for seconds.',
    model: { shape: 'can', size: [.06, .11], colors: { body: [.3, .3, .32], band: [.25, .5, .9] }, spoon: true, pin: true },
    fx: { concuss: { slow: .55, slowSecs: 3.5, sway: .04, blur: .65, tilt: .12, deafen: 2.5, dist: [[0, 1], [.6, .6], [1, .15]] },
      shake: { radius: 14, amp: 1.5, time: 1.2 }, blast: { fireball: .4, light: [1, .9, .8], intensity: 3, lightRange: 6, lightTime: .06 } } }),
  N({ kind: 'stun', name: 'Tether Shock Grenade', price: 250, lvl: 22, fuse: 1.8, radius: 4.5, danger: 4.5, dmg: 10, falloff: { inner: 4.5, exp: 1 }, ap: 1, duration: 2.4,
    mass: .3, bounce: .3,
    desc: 'Electroshock grenade: arcs jump to everyone within 4.5 m, who cannot shoot or aim for 2.4 s and barely walk.',
    model: { shape: 'puck', size: [.08, .04], colors: { body: [.12, .13, .15], band: [.3, .6, 1] }, prongs: true },
    fx: { stun: { secs: 2.4, noFire: true, noAds: true, slow: .3, aimJitter: .05 }, arcs: { count: 14, color: [.55, .75, 1], life: .6 },
      light: { color: [.5, .7, 1], intensity: 7, range: 7, time: .4, flicker: .8 } } }),
  N({ kind: 'gas', name: 'Choke Gas', price: 350, lvl: 26, fuse: 1.2, radius: 5.5, danger: 5.5, duration: 14, los: false,
    desc: 'Irritant gas canister: a creeping 5.5 m cloud that burns, slows, blurs and makes people cough where you can hear them.',
    model: { shape: 'can', size: [.064, .15], colors: { body: [.62, .6, .25], band: [.15, .15, .15] }, topHoles: true, spoon: true, pin: true },
    fx: { gas: { radius: 5.5, growth: 3.5, lifetime: 14, fade: 2.5, dps: 6, tick: .5, slow: .78, blur: .55, cough: { radius: 18, every: 1.6 },
      color: [.78, .82, .45], density: .45, blocksLOS: false } } }),
  N({ kind: 'sticky', name: 'Limpet Sticky Bomb', price: 400, lvl: 20, fuse: 2.5, sticky: true, radius: 6, dmg: 140, falloff: { inner: 1.2, exp: 1.5 }, ap: .65,
    ts: 16, ls: 8, bounce: 0, friction: 1,
    desc: 'Adhesive charge that sticks to walls, floors and people, blinks and blows 2.5 s after it lands.',
    model: { shape: 'puck', size: [.08, .05], colors: { body: [.3, .32, .26], pad: [.65, .6, .2], led: [1, .15, .1] } },
    fx: { ...BLAST_FX({ fragments: 20, fragRange: 8 }), stick: { to: ['world', 'player'], beep: .35, led: [1, .15, .1] } } }),
  N({ kind: 'impact', name: 'Snapback Impact Grenade', price: 350, lvl: 24, impact: true, impactMin: 2, arm: .25, radius: 5.5, dmg: 110, falloff: { inner: .8, exp: 1.6 },
    ap: .6, ts: 20, ls: 9, mass: .3,
    desc: 'Nose-fuzed grenade that detonates on whatever it hits first: no cooking, no bouncing, no warning.',
    model: { shape: 'sphere', size: [.06, .06], colors: { body: [.5, .12, .1], band: [.15, .15, .15] }, noseFuze: true },
    fx: BLAST_FX({ fireball: .7, debris: 16, fragments: 24, fragRange: 8 }) }),
  N({ kind: 'cluster', name: 'Hydra Cluster', price: 500, lvl: 34, fuse: 2.4, cook: true, radius: 3, danger: 9, dmg: 40, falloff: { inner: .5, exp: 1.4 }, ap: .6,
    desc: 'Splits into six bomblets that scatter across five metres and go off a moment later: a whole room becomes the blast.',
    model: { shape: 'can', size: [.07, .13], colors: { body: [.35, .33, .22], band: [.85, .25, .15] }, segmented: true, spoon: true, pin: true },
    fx: { ...BLAST_FX({ fireball: .6, debris: 10 }), bomblets: { count: 6, scatter: 5.5, speed: [4, 7], fuse: [.45, 1.1], dmg: 55, radius: 3.6, inner: .5, exp: 1.4, bounce: .3 } } }),
  N({ kind: 'thermite', name: 'Furnace Thermite', price: 450, lvl: 30, fuse: 1.0, sticky: true, radius: 1.6, danger: 2, duration: 6, ts: 14, ls: 7, mass: .5,
    desc: 'Sticks and burns at 2500 degrees for 6 s: cooks anyone beside it and burns through doors, boards and thin walls.',
    model: { shape: 'can', size: [.06, .14], colors: { body: [.55, .5, .45], band: [.9, .4, .1] }, magnet: true },
    fx: { burn: { secs: 6, dps: 60, tick: .25, radius: 1.6, through: .6, breach: true, sparks: 260, smoke: [.85, .85, .8], thermalGlare: true,
      light: { color: [1, .9, .7], intensity: 14, range: 10, flicker: .5 } } } }),
  N({ kind: 'sensor', name: 'Watchman Sensor', price: 300, lvl: 16, fuse: .8, sticky: true, radius: 12, duration: 14, ts: 15, ls: 7, mass: .25,
    desc: 'Sticky motion sensor: every 2 s it pings through walls and marks enemies within 12 m for your team; one shot kills it.',
    model: { shape: 'puck', size: [.07, .035], colors: { body: [.15, .16, .17], ring: [.2, .9, .7] }, antenna: true },
    fx: { pulse: { period: 2.0, radius: 12, reveal: 1.4, throughWalls: true, ping: { radius: 10 }, hp: 1, team: true, color: [.2, .9, .7] } } }),
  N({ kind: 'emp', name: 'Blackout EMP', price: 400, lvl: 38, fuse: 1.8, radius: 10, duration: 8, los: false,
    desc: 'Electromagnetic pulse: optics, thermals, lasers, lights, sensors and radar inside ten metres die for 8 s.',
    model: { shape: 'can', size: [.065, .13], colors: { body: [.2, .22, .26], band: [.4, .75, 1] }, coils: true, spoon: true, pin: true },
    fx: { emp: { secs: 8, disables: ['optic', 'thermal', 'laser', 'light', 'sensor', 'radar', 'decoy', 'hudMarkers'], dist: [[0, 1], [.7, 1], [1, .5]],
      flicker: true, sparks: 40, ring: { color: [.5, .8, 1], speed: 25 } }, shake: { radius: 10, amp: .3, time: .4 } } }),
  N({ kind: 'smoke_color', name: 'Signal Smoke', price: 150, lvl: 12, fuse: 1.2, rest: true, radius: 3.2, duration: 12, mass: .45, bounce: .3, friction: .55,
    desc: 'Coloured signal smoke: a smaller, shorter cloud in your team colour that also drops a marker on your team\'s radar.',
    model: { shape: 'can', size: [.064, .15], colors: { body: [.42, .44, .4], band: [.85, .3, .2] }, topHoles: true, bandFromSmoke: true, spoon: true, pin: true },
    fx: { smoke: { radius: 3.2, height: 2.6, growth: 2.2, lifetime: 12, fade: 2, color: 'team', density: .75, particles: 110, emit: 1.6, settle: 'rise', drift: .2,
      colors: { red: [.85, .18, .15], green: [.25, .75, .3], violet: [.55, .3, .85], amber: [.95, .6, .15] }, team: { 1: 'amber', 2: 'violet', 0: 'red' },
      blocksLOS: true, extinguish: false, hiss: true }, marker: { team: true, secs: 12 } } }),
  N({ kind: 'breach', name: 'Doorbuster Frame Charge', price: 400, lvl: 28, fuse: 2.5, sticky: true, radius: 4.5, dmg: 110, falloff: { inner: .6, exp: 1.3 }, ap: .7,
    ts: 9, ls: 5, mass: .9, bounce: 0, friction: 1, los: false,
    desc: 'Shaped frame charge: slap it on a door or a thin wall, step aside, and it blows a hole and everyone behind it inward.',
    model: { shape: 'brick', size: [.3, .04, .22], colors: { body: [.25, .25, .22], tape: [.85, .75, .2], det: [.15, .15, .15] }, frame: true },
    fx: { ...BLAST_FX({ fireball: .7, debris: 50, glass: 5 }), breach: { breakRadius: 1.3, directional: true, cone: .9, behind: .35, wallPen: .5, dust: true } } }),
  N({ kind: 'flare', name: 'Lumen Road Flare', price: 100, lvl: 5, fuse: .3, radius: 6, duration: 30, ts: 15, ls: 7, mass: .2, bounce: .2, friction: .6, los: false,
    desc: 'Burning red road flare: lights up 16 m for 30 s, outlines anyone who stands in its glow and washes out night-vision.',
    model: { shape: 'stick', size: [.032, .23], colors: { body: [.85, .12, .1], cap: [.95, .95, .9] }, struck: true },
    fx: { light: { color: [1, .25, .12], intensity: 14, range: 16, flicker: .3 }, smoke: { color: [1, .5, .4], trail: true }, reveal: { radius: 6, outline: true },
      burn: { dps: 5, radius: .6 }, nvBloom: true } }),
  N({ kind: 'chaff', name: 'Static Chaff', price: 250, lvl: 32, fuse: 1.6, radius: 15, duration: 12, los: false,
    desc: 'Air-bursts into a glittering cloud of foil and noise: enemy radar, markers and sensors inside 15 m go to static for 12 s.',
    model: { shape: 'can', size: [.06, .13], colors: { body: [.6, .6, .62], band: [.2, .2, .2] }, spoon: true, pin: true },
    fx: { jam: { radius: 15, secs: 12, targets: ['radar', 'hudMarkers', 'sensor', 'decoy', 'pings'], radarNoise: .8 }, cloud: { particles: 600, color: [.85, .85, .9], fall: .4 } } }),
  N({ kind: 'ninebang', name: 'Ninefold Flash', price: 400, lvl: 36, fuse: 1.5, radius: 18, duration: 4.2, mass: .45,
    desc: 'Multi-charge stun: nine flashes and bangs over a second and a half, so turning away halfway does not save you.',
    model: { shape: 'can', size: [.046, .13], colors: { body: [.15, .15, .16], band: [.9, .75, .15] }, ports: 9, spoon: true, pin: true },
    fx: { bangs: { count: 9, interval: .16, hop: .4 }, blind: { perBang: 1.3, max: 4.2, min: .2, hold: .35, angle: { cone: .9, front: 1, side: .5, back: .15 },
      dist: [[0, 1], [.3, .9], [.6, .55], [1, 0]], selfBlind: true }, deafen: { radius: 16, secs: 4, muffle: .9 }, light: { intensity: 25, range: 16, time: .05 } } }),
  N({ kind: 'mini', name: 'Pebble Mini-Frag', price: 200, lvl: 8, fuse: 2.0, cook: true, radius: 5.5, dmg: 90, falloff: { inner: .6, exp: 1.6 }, ap: .55,
    ts: 22, ls: 10, mass: .18, bounce: .45, friction: .35,
    desc: 'Golf-ball-sized fragmentation grenade: thrown further and faster on a short fuse, with a small, sharp blast.',
    model: { shape: 'sphere', size: [.045, .045], colors: { body: [.25, .27, .2], band: [.7, .6, .2] }, pin: true },
    fx: BLAST_FX({ fireball: .5, intensity: 5, lightRange: 8, debris: 10, fragments: 30, fragRange: 8, shake: .6, shakeR: 14, tinR: 4, tin: 1.6, decal: .9 }) }),
  N({ kind: 'satchel', name: 'Strongbox Satchel', price: 700, lvl: 44, remote: true, arm: 1, radius: 7.5, dmg: 200, falloff: { inner: 1.5, exp: 1.4 }, ap: .75,
    ts: 10, ls: 6, mass: 1.2, bounce: .05, friction: .9, roll: 6,
    desc: 'Canvas satchel of plastic explosive with a radio detonator: drop it, walk away, and press the clacker when they arrive.',
    model: { shape: 'bag', size: [.25, .18, .08], colors: { body: [.32, .3, .22], strap: [.15, .15, .12], box: [.2, .2, .2], led: [1, .1, .1] } },
    fx: { ...BLAST_FX({ fireball: 1.6, intensity: 12, lightRange: 16, shake: 1.8, shakeR: 30, debris: 50, glass: 10, props: 5, tinR: 9, tin: 3.5, decal: 2.2 }),
      remote: { armTime: 1, maxRange: 80, lifetime: 90, blink: .8, detonate: 'use', ownerDead: 'inert' } } }),
  N({ kind: 'dynamite', name: 'Quarry Dynamite', price: 450, lvl: 40, fuse: 4.2, cook: true, radius: 8.5, dmg: 160, falloff: { inner: 1.5, exp: 1.5 }, ap: .65,
    ts: 16, ls: 8, mass: .55, bounce: .25, friction: .6,
    desc: 'Three sticks taped together with a sizzling 4.2 s fuse everyone can see and hear: the biggest bang a pocket can carry.',
    model: { shape: 'bundle', size: [.09, .2], colors: { body: [.75, .15, .1], tape: [.15, .12, .1], fuse: [.85, .8, .6] }, sticks: 3 },
    fx: { ...BLAST_FX({ fireball: 1.5, intensity: 11, lightRange: 15, shake: 1.6, shakeR: 28, debris: 40, glass: 9, props: 4, tin: 3.2 }),
      litFuse: { sparks: true, sizzle: true, length: .12 } } }),
  N({ kind: 'medic', name: 'Lifeline Medic Canister', price: 400, lvl: 15, fuse: 1.0, rest: true, radius: 4.5, duration: 8, mass: .45, bounce: .3, friction: .55, los: false,
    desc: 'Pops a healing mist: you and your teammates inside 4.5 m regain 8 health a second for 8 s (up to 50 each).',
    model: { shape: 'can', size: [.064, .15], colors: { body: [.92, .92, .9], band: [.15, .75, .35] }, cross: true, spoon: true, pin: true },
    fx: { heal: { hps: 8, tick: .5, maxPerPlayer: 50, radius: 4.5, lifetime: 8, teamOnly: true, armor: false }, mist: { color: [.45, 1, .6], particles: 90, height: 1.6 } } }),
];

const GROUP_OF = {};
for (const [g, def] of Object.entries(NADE_RULES.groups)) for (const k of def.kinds) GROUP_OF[k] = g;
for (const n of GRENADES) n.group = GROUP_OF[n.kind] || null;

export const ALIASES = { m67: 'frag', flashbang: 'flash', he_grenade: 'he' };
const BY_ID = new Map(GRENADES.map(n => [n.id, n]));
export const getNade = id => BY_ID.get(ALIASES[id] || id) || null;
export const groupOf = id => { const n = getNade(id); return n ? n.group : null; };

/** Can a player holding `nades` ([{ gid, n }]) take one more `gid`? -> { ok, reason } */
export function canCarry(nades, gid) {
  const g = getNade(gid); if (!g) return { ok: false, reason: 'Unknown grenade' };
  let total = 0, same = 0, inGroup = 0;
  for (const it of nades || []) {
    const o = getNade(it.gid); const k = it.n ?? 1; total += k;
    if (o && o.id === g.id) same += k;
    if (o && o.group === g.group) inGroup += k;
  }
  if (total >= NADE_RULES.maxTotal) return { ok: false, reason: 'Grenade pouches full (' + NADE_RULES.maxTotal + ')' };
  if (same >= g.max) return { ok: false, reason: 'Already carrying ' + g.max + ' ' + g.name };
  const lim = NADE_RULES.groups[g.group];
  if (lim && inGroup >= lim.max) return { ok: false, reason: 'Limit: ' + lim.max + ' ' + (lim.label || g.group) + ' grenade' + (lim.max > 1 ? 's' : '') };
  return { ok: true, reason: '' };
}

/** Blast damage at dist metres before armour (0 outside the radius). */
export function blastDamage(nade, dist) {
  const n = typeof nade === 'string' ? getNade(nade) : nade; if (!n || !n.dmg || dist > n.radius) return 0;
  const inner = Math.min(n.falloff.inner, n.radius), span = Math.max(1e-6, n.radius - inner);
  if (dist <= inner) return n.dmg;
  return n.dmg * Math.max(0, 1 - (dist - inner) / span) ** n.falloff.exp;
}

const curve = (pts, x) => { if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) if (x <= pts[i][0]) { const [a, b] = pts[i - 1], [c, d] = pts[i]; return b + (d - b) * (x - a) / (c - a); }
  return pts[pts.length - 1][1]; };

/** Blindness in seconds from a flash-type grenade at dist m; angle = radians between view direction and the burst. */
export function flashBlind(nade, dist, angle = 0) {
  const n = typeof nade === 'string' ? getNade(nade) : nade; const b = n && n.fx && n.fx.blind; if (!b || dist > n.radius) return 0;
  const a = Math.abs(angle), A = b.angle;
  const af = a <= A.cone ? A.front : a <= Math.PI / 2 ? A.front + (A.side - A.front) * (a - A.cone) / (Math.PI / 2 - A.cone)
    : A.side + (A.back - A.side) * (a - Math.PI / 2) / (Math.PI / 2);
  const total = (b.perBang ? Math.min(b.max, b.perBang * n.fx.bangs.count) : b.max) * curve(b.dist, dist / n.radius) * af;
  return total < b.min ? 0 : Math.round(total * 100) / 100;
}
