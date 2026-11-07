/* LIVE FIRE — weapon attachments and the stat math (DATA + pure functions; no BABYLON, no DOM; runs in Node tests).
   Contract: docs/ARCHITECTURE.md §5. Tables and reasoning: docs/WEAPONS.md. Checked by tools/test/balance.mjs.
   Exports:
     SLOTS                      ['optic','muzzle','under','side','mag','stock','barrel']
     ATTACHMENTS                46 attachments { id, slot, name, desc, price, unlockLevel, fits: [cats], <filters>, mods, model }
     MOD_KEYS                   { key: description } for every key that may appear in `mods`
     HIT_MULT                   hit-group damage multipliers (mirror of docs §4, for previews)
     getAttachment(id)          attachment or null
     fits(gun, att)             true when gun has the mount and the attachment's filters accept it (ids or objects)
     compatible(gun, slot?)     attachments that fit the gun (optionally one slot)
     effectiveStats(gun, mods)  NEW object: gun stats with the attachments applied (never mutates the source) + .derived
     applyMods                  alias of effectiveStats (docs §1)
     damageAt(gun, dist, group?)              damage of one shot (all pellets, expected) before armour at `dist` m
     pelletHits(gun, dist)      expected fraction of a shotgun's pellets that land on a torso at `dist`
     hitsToKill(gun, dist, { group, armor, helmet, hp })   shots to kill (armour pool simulated per docs §4)
     timeToKill(gun, dist, opts)               seconds from the first shot to the killing shot (fire mode, bursts, reloads)
     derive(stats)              the derived numbers below for any (effective) stats object
   Filters on an attachment (all optional, ANDed with `fits` + gun.mounts[slot]): bores [gun.bore], cals [gun.caliber],
     stocks [gun.model.stock], reloadKinds [gun.reloadKind], scoped (gun must have a built-in scope), only [ids], exclude [ids].
     A `magSet` attachment only fits a gun whose magazine is smaller.
   derived = { zoom, zoomLevels, reticle, adsTime, draw, speed, adsSpeed, mag, reload, reloadEmpty, rpm (effective, bursts included),
     shotDmg10, dps, dpsArmor, ttk: { 10: { bare, armor }, 30: {...} } (chest, seconds), stk: { 10: {...}, 30: {...} },
     headKill: { bare, helmet } (max metres a head hit kills, capped 300), recoil: { v, h } (deg over the first 10 shots),
     hipCone, adsCone (rad), loud (audible-distance factor), bars: { damage, fireRate, range, accuracy, control, mobility, handling } 0..100 }
*/
import { getGun, spreadAt, fireInterval } from './data.js';

export const SLOTS = ['optic', 'muzzle', 'under', 'side', 'mag', 'stock', 'barrel'];

/* Every numeric mod is a SIGNED FRACTION of the gun's own value (-0.12 = 12 % less) unless noted; the fractions of all attached
   parts are summed per key, then applied once and the result is clamped. */
export const MOD_KEYS = {
  spread: 'fraction: standing cone, bloom per shot (and half of it on the bloom cap)',
  moveSpread: 'fraction: movement inaccuracy', hipSpread: 'fraction: hip-fire multiplier (lasers)',
  pellet: 'fraction: shotgun pattern half-angle (chokes)',
  recoil: 'fraction: whole spray pattern, random jitter, half on view kick', recoilV: 'fraction: vertical pattern',
  recoilH: 'fraction: horizontal pattern', kick: 'fraction: camera view punch', recover: 'fraction: recovery rate',
  bipod: 'fraction: recoil while the bipod is deployed (crouched or on a ledge)',
  adsTime: 'fraction: time to aim', draw: 'fraction: draw / swap time', speed: 'fraction: run speed', adsMove: 'fraction: speed while aiming',
  range: 'fraction: effective range; falloff becomes falloff^(1/(1+range))', velocity: 'fraction: muzzle velocity', dmg: 'fraction: damage',
  mag: 'fraction: magazine size (rounded)', magSet: 'ABSOLUTE magazine size (drums, belts)', reload: 'fraction: every reload time',
  sway: 'fraction: aiming sway (breath.sway)', loud: 'fraction: audible distance of shots (suppressors set the base to 0.32)',
  suppressed: 'bool', flashHide: 'bool: no muzzle flash for others', zoom: 'number: ADS magnification', zoom2: 'number: second magnification (LPVO toggle)',
  reticle: 'string: RETICLES id', laser: "'red'|'green'|'ir'", light: '{ lumens, cone (rad), range (m) }', thermal: '{ palette, palettes, range, refresh, noise, res }',
  canted: 'bool: 45-degree backup sight next to the built-in scope', cantedZoom: 'number', cantedAds: 'fraction: ADS time of the canted sight vs the scope',
};

export const HIT_MULT = { head: 4, neck: 2, chest: 1, stomach: 1.25, arm: 1, leg: .75 };

const ALL = ['pistol', 'smg', 'rifle', 'carbine', 'br', 'shotgun', 'dmr', 'sniper', 'lmg'];
const LONG = ['smg', 'rifle', 'carbine', 'br', 'dmr', 'lmg'];
const GRIPS = ['smg', 'rifle', 'carbine', 'br', 'dmr', 'lmg', 'shotgun'];
const SIDE = ['pistol', 'smg', 'rifle', 'carbine', 'br', 'shotgun', 'dmr', 'lmg'];
const A = (id, slot, name, price, unlockLevel, fits, mods, desc, model, filters = {}) => ({ id, slot, name, desc, price, unlockLevel, fits, ...filters, mods, model });

export const ATTACHMENTS = [
  // ---------------------------------------------- OPTIC ----------------------------------------------
  A('o_micro', 'optic', 'Pinprick Micro Reflex', 250, 4, ['pistol', 'smg', 'shotgun'], { zoom: 1.05, reticle: 'dot', adsTime: .02 },
    'Slide-mounted micro red dot: a 3 MOA dot that is faster to find than the front sight.', { kind: 'micro', length: .045, height: .03, lens: .02 }),
  A('o_reflex', 'optic', 'Halo Reflex Sight', 400, 1, [...LONG, 'shotgun'], { zoom: 1.1, reticle: 'dot', adsTime: .02 },
    'Open reflex sight with a 2 MOA dot; unmagnified, wide field of view.', { kind: 'reflex', length: .06, height: .05, lens: .026 }),
  A('o_holo', 'optic', 'Lantern Holographic', 500, 7, [...LONG, 'shotgun'], { zoom: 1.1, reticle: 'holo', adsTime: .04 },
    'Holographic sight: 65 MOA ring around a 1 MOA dot, a big window and no parallax.', { kind: 'holo', length: .095, height: .06, lens: .03 }),
  A('o_prism15', 'optic', 'Facet 1.5x Prism', 550, 10, [...LONG, 'shotgun'], { zoom: 1.5, reticle: 'chevron', adsTime: .06 },
    'Compact 1.5x prism sight with an etched chevron: works without power, a little magnification.', { kind: 'prism', length: .085, height: .06, lens: .022 }),
  A('o_2x', 'optic', 'Vigil 2x Compact', 600, 13, [...LONG, 'shotgun'], { zoom: 2, reticle: 'circle_dot', adsTime: .08 },
    'Short 2x tube sight with a circle-dot reticle for mid-range work.', { kind: 'scope', length: .12, height: .06, tube: .03, lens: .028 }),
  A('o_pistol2x', 'optic', 'Longeye 2x Pistol Scope', 450, 33, ['pistol'], { zoom: 2, reticle: 'duplex', adsTime: .12, draw: .15 },
    'Long eye-relief 2x handgun scope for magnum revolvers and big-bore pistols.', { kind: 'scope', length: .2, height: .05, tube: .025, lens: .028 }, { bores: ['mag'] }),
  A('o_3x', 'optic', 'Tern 3x Prism', 650, 16, ['rifle', 'carbine', 'br', 'dmr', 'lmg'], { zoom: 3, reticle: 'bdc', adsTime: .1, speed: -.005 },
    'Ruggedised 3x prism with a bullet-drop chevron.', { kind: 'prism', length: .11, height: .065, lens: .03 }),
  A('o_4x', 'optic', 'Keystone 4x Combat Prism', 750, 19, ['rifle', 'carbine', 'br', 'dmr', 'lmg', 'sniper'], { zoom: 4, reticle: 'bdc', adsTime: .14, speed: -.01, sway: .05 },
    'Fixed 4x combat prism with a fibre-lit chevron and ranging marks out to 600 m.', { kind: 'prism', length: .15, height: .07, lens: .032 }),
  A('o_lpvo', 'optic', 'Gradient 1-6x Variable', 950, 27, ['rifle', 'carbine', 'br', 'dmr', 'lmg', 'sniper'],
    { zoom: 1, zoom2: 6, reticle: 'lpvo', adsTime: .16, speed: -.01, sway: .05 },
    'Low-power variable optic: true 1x for rooms, flip to 6x for the street (the zoom key toggles).', { kind: 'lpvo', length: .27, height: .075, tube: .03, lens: .034, flipLever: true }),
  A('o_6x', 'optic', 'Steadfast 6x Scope', 800, 23, ['rifle', 'br', 'dmr', 'sniper'], { zoom: 6, reticle: 'duplex', adsTime: .2, speed: -.015, sway: .08 },
    'Fixed 6x hunting-pattern scope with a duplex reticle.', { kind: 'scope', length: .3, height: .08, tube: .03, lens: .042 }),
  A('o_8x', 'optic', 'Farlight 8x Scope', 900, 31, ['br', 'dmr', 'sniper'], { zoom: 8, reticle: 'mildot', adsTime: .24, speed: -.02, sway: .1 },
    'Fixed 8x tactical scope with a mil-dot reticle and turrets.', { kind: 'scope', length: .34, height: .085, tube: .034, lens: .05 }),
  A('o_12x', 'optic', 'Horizon 12x Sniper Scope', 1000, 41, ['dmr', 'sniper'], { zoom: 12, reticle: 'mildot_fine', adsTime: .3, speed: -.02, sway: .15 },
    'High-magnification 12x scope with a fine mil reticle: every tremor of your breath shows.', { kind: 'scope', length: .4, height: .09, tube: .034, lens: .056 }),
  A('o_thermal', 'optic', 'Emberline 2x Thermal', 1400, 46, ['smg', 'rifle', 'carbine', 'br', 'dmr', 'lmg', 'sniper', 'shotgun'],
    { zoom: 2, reticle: 'thermal', adsTime: .14, speed: -.015, thermal: { palette: 'whitehot', palettes: ['whitehot', 'blackhot', 'ironbow'], range: 120, refresh: 30, noise: .12, res: 320 } },
    '2x thermal sight: bodies glow through smoke and darkness, at 30 Hz and 320-line resolution.', { kind: 'thermal', length: .17, height: .08, lens: .04, screen: true }),
  A('o_canted', 'optic', 'Offset Canted Irons', 200, 21, ['sniper'], { canted: true, cantedZoom: 1.1, cantedAds: -.45 },
    'Backup iron sights at 45 degrees beside the built-in scope: roll the gun for close targets.', { kind: 'canted', length: .05, height: .035 }, { scoped: true }),

  // ---------------------------------------------- MUZZLE ----------------------------------------------
  A('m_supp_pistol', 'muzzle', 'Wisp Pistol Suppressor', 400, 9, ['pistol'],
    { suppressed: true, flashHide: true, range: -.06, velocity: -.04, recoil: -.05, adsTime: .03, draw: .1 },
    'Threaded 9 mm to .45 pistol can: subsonic hiss instead of a crack, no flash.', { kind: 'can', length: .17, dia: .034 }, { bores: ['9', 'rim'] }),
  A('m_supp_9', 'muzzle', 'Wisp-K SMG Suppressor', 500, 11, ['smg', 'carbine'],
    { suppressed: true, flashHide: true, range: -.08, velocity: -.05, recoil: -.06, adsTime: .04, draw: .06 },
    'Quick-detach suppressor for pistol-calibre and PDW guns.', { kind: 'can', length: .19, dia: .038 }, { bores: ['9', 'pdw'] }),
  A('m_supp_556', 'muzzle', 'Muffle 5.56 Suppressor', 600, 14, ['rifle', 'carbine', 'dmr', 'lmg'],
    { suppressed: true, flashHide: true, range: -.06, velocity: -.03, recoil: -.07, adsTime: .05, speed: -.01, draw: .06 },
    'Rifle suppressor for 5.56 / 5.45: takes the crack down to a slap and hides the muzzle.', { kind: 'can', length: .16, dia: .04 }, { bores: ['556'] }),
  A('m_supp_762', 'muzzle', 'Muffle 7.62 Suppressor', 700, 24, ['rifle', 'carbine', 'br', 'dmr', 'sniper', 'lmg'],
    { suppressed: true, flashHide: true, range: -.05, velocity: -.03, recoil: -.08, adsTime: .06, speed: -.015, draw: .08 },
    'Full-power rifle suppressor rated up to 8.6 mm magnum.', { kind: 'can', length: .2, dia: .046 }, { bores: ['762', '338'] }),
  A('m_comp', 'muzzle', 'Ratchet Compensator', 300, 5, ['pistol', 'smg', 'rifle', 'carbine'], { recoilV: -.15, recoilH: .05, kick: .1, loud: .1 },
    'Ported compensator: gas thrown upward pins the muzzle down, at the cost of side blast.', { kind: 'comp', length: .055, dia: .026 }),
  A('m_flash', 'muzzle', 'Starfall Flash Hider', 200, 2, LONG, { flashHide: true, recoilH: -.06 },
    'Pronged flash hider: kills the fireball that gives your position away.', { kind: 'flash', length: .06, dia: .022 }),
  A('m_brake', 'muzzle', 'Anvil Muzzle Brake', 450, 18, ['rifle', 'carbine', 'br', 'dmr', 'sniper', 'lmg'], { recoil: -.1, recoilH: -.08, kick: -.12, loud: .25, adsTime: .02 },
    'Side-vented muzzle brake: noticeably softer recoil and a deafening blast for everyone nearby.', { kind: 'brake', length: .07, dia: .03 }),
  A('m_choke', 'muzzle', 'Tightline Choke', 250, 6, ['shotgun'], { pellet: -.28, range: .15 },
    'Full-choke tube: keeps the buckshot pattern together for longer.', { kind: 'choke', length: .05, dia: .024 }),

  // ---------------------------------------------- UNDERBARREL ----------------------------------------------
  A('u_vgrip', 'under', 'Upright Vertical Grip', 300, 3, GRIPS, { recoilV: -.12, adsTime: .03 },
    'Vertical foregrip: leverage against muzzle climb.', { kind: 'vgrip', length: .1 }),
  A('u_agrip', 'under', 'Wedge Angled Grip', 300, 8, GRIPS, { adsTime: -.08, recoilV: -.04 },
    'Angled foregrip: a natural wrist angle that brings the gun up faster.', { kind: 'agrip', length: .07 }),
  A('u_stubby', 'under', 'Nub Stubby Grip', 250, 12, GRIPS, { recoilH: -.14, moveSpread: -.05 },
    'Short stubby grip: a C-clamp hold that fights side-to-side shake.', { kind: 'stubby', length: .05 }),
  A('u_handstop', 'under', 'Stopline Hand-Stop', 200, 20, GRIPS, { kick: -.12, recover: .12, adsTime: -.03 },
    'Hand-stop at the end of the rail: push-pull tension for fast recovery between shots.', { kind: 'handstop', length: .035 }),
  A('u_bipod', 'under', 'Outrigger Bipod', 400, 15, ['rifle', 'br', 'dmr', 'sniper', 'lmg'], { bipod: -.6, recoil: -.03, adsTime: .06, speed: -.015 },
    'Folding bipod: deploy it on a ledge or while crouched and the recoil mostly disappears.', { kind: 'bipod', length: .18 }),

  // ---------------------------------------------- SIDE RAIL ----------------------------------------------
  A('s_laser', 'side', 'Redline Laser', 300, 6, SIDE, { laser: 'red', hipSpread: -.25 },
    'Visible red laser: tighter hip fire, but everyone can see where it comes from.', { kind: 'laser', length: .07, color: [1, .1, .08] }),
  A('s_light', 'side', 'Daybreak Weapon Light', 200, 1, SIDE, { light: { lumens: 1000, cone: .35, range: 30 } },
    '1000-lumen weapon light: lights a dark room and dazzles whoever is in it.', { kind: 'light', length: .12, dia: .028 }),
  A('s_combo', 'side', 'Twinbeam Laser-Light', 550, 25, SIDE, { laser: 'green', light: { lumens: 600, cone: .3, range: 22 }, hipSpread: -.2, adsTime: .02 },
    'Combined green laser and 600-lumen light in one housing.', { kind: 'combo', length: .1, color: [.15, 1, .2] }),
  A('s_ir', 'side', 'Nightglass IR Laser', 450, 35, SIDE, { laser: 'ir', hipSpread: -.22 },
    'Infrared aiming laser: invisible to the naked eye, visible only through thermal and to your own team.', { kind: 'laser', length: .09, color: [.6, .1, .1], ir: true }),

  // ---------------------------------------------- MAGAZINE ----------------------------------------------
  A('g_ext_pistol', 'mag', 'Extended Pistol Magazine', 200, 7, ['pistol'], { mag: .5, reload: .08, draw: .05 },
    'Extended pistol magazine sticking out of the grip.', { kind: 'extmag', ext: .05 }, { reloadKinds: ['mag'] }),
  A('g_ext_smg', 'mag', 'Extended SMG Magazine', 300, 10, ['smg', 'carbine'], { mag: .33, reload: .08, adsTime: .02 },
    'Longer stick magazine for pistol-calibre and PDW guns.', { kind: 'extmag', ext: .06 }, { bores: ['9', 'pdw'], reloadKinds: ['mag'] }),
  A('g_ext_rifle', 'mag', 'Extended Rifle Magazine', 350, 13, ['rifle', 'carbine', 'br', 'dmr'], { mag: .33, reload: .08, adsTime: .02, speed: -.005 },
    'A third more rounds in a longer box magazine.', { kind: 'extmag', ext: .07 }, { bores: ['556', '762'], reloadKinds: ['mag'] }),
  A('g_ext_tube', 'mag', 'Extended Shell Tube', 250, 11, ['shotgun'], { mag: .3, adsTime: .02, speed: -.005 },
    'Magazine-tube extension: two more shells under the barrel.', { kind: 'tube', ext: .12 }, { reloadKinds: ['shell'] }),
  A('g_ext_sniper', 'mag', 'Extended Sniper Magazine', 350, 28, ['sniper'], { mag: .5, reload: .06, adsTime: .02 },
    'Extended detachable box for bolt and semi-auto rifles.', { kind: 'extmag', ext: .04 }, { reloadKinds: ['mag'] }),
  A('g_fast', 'mag', 'Coupled Fast-Mag', 300, 17, ALL, { reload: -.22 },
    'Two magazines clamped side by side and a pull tab: the next one is already in your hand.', { kind: 'coupler' }, { reloadKinds: ['mag'] }),
  A('g_drum', 'mag', 'Barrel-Drum 50', 600, 30, ['smg', 'rifle', 'carbine'], { magSet: 50, reload: .35, adsTime: .06, speed: -.025 },
    '50-round drum: heavy and slow to change, but the fight usually ends first.', { kind: 'drum', dia: .14 },
    { cals: ['9x19', '9x19 +P', '9x19 Subsonic', '.45 Auto', '4.7x29 PDW', '5.6x29 PDW', '5.56x45', '5.45x39', '7.62x39', '7.62x35'], reloadKinds: ['mag'] }),
  A('g_100', 'mag', 'Century 100-Round Drum', 900, 39, ['rifle', 'carbine', 'lmg'], { magSet: 100, reload: .55, adsTime: .1, speed: -.045 },
    'Twin-drum 100-round magazine: turns a rifle into a light support weapon.', { kind: 'twindrum', dia: .12 },
    { cals: ['5.56x45', '5.45x39', '7.62x39'], reloadKinds: ['mag'] }),
  A('g_belt', 'mag', 'Long Belt 150', 700, 33, ['lmg'], { magSet: 150, reload: .15, adsTime: .04, speed: -.03 },
    '150-round belt in a hard box: half again as long between reloads.', { kind: 'beltbox', size: [.14, .12, .09] }, { reloadKinds: ['belt'] }),

  // ---------------------------------------------- STOCK ----------------------------------------------
  A('k_heavy', 'stock', 'Anchor Heavy Stock', 350, 14, ['smg', 'rifle', 'carbine', 'br', 'dmr', 'sniper', 'lmg'],
    { recoil: -.08, recover: .1, sway: -.15, adsTime: .05, speed: -.015 },
    'Weighted precision stock with an adjustable cheek riser: steadier, slower.', { kind: 'heavy' }),
  A('k_light', 'stock', 'Featherweight Stock', 300, 9, ['smg', 'rifle', 'carbine', 'br', 'dmr', 'sniper', 'lmg', 'shotgun'],
    { adsTime: -.07, speed: .015, moveSpread: -.05, recoil: .06, sway: .05 },
    'Skeletonised minimalist stock: quicker to the shoulder, less mass to soak the recoil.', { kind: 'light' }),
  A('k_folded', 'stock', 'Folded Stock', 100, 5, ['pistol', 'smg', 'rifle', 'carbine', 'shotgun'],
    { adsTime: -.16, draw: -.2, speed: .025, moveSpread: -.1, recoil: .25, spread: .25, sway: .3 },
    'Stock folded or collapsed all the way: fastest handling, worst control.', { kind: 'folded' }, { stocks: ['folding', 'collapsible'] }),

  // ---------------------------------------------- BARREL ----------------------------------------------
  A('b_long', 'barrel', 'Longline Barrel', 450, 16, ['smg', 'rifle', 'carbine', 'br', 'dmr', 'sniper', 'lmg'],
    { range: .25, velocity: .08, spread: -.1, adsTime: .05, speed: -.015, draw: .05 },
    'Longer barrel: more velocity, more reach, more weight out front.', { kind: 'long', ext: .1 }),
  A('b_short', 'barrel', 'Shortline Barrel', 300, 12, ['smg', 'rifle', 'carbine', 'br', 'dmr', 'lmg'],
    { range: -.2, velocity: -.08, adsTime: -.07, speed: .015, draw: -.1, spread: .08, recoil: .05, loud: .1 },
    'Cut-down barrel: handles like a pistol, loses velocity and reach.', { kind: 'short', ext: -.08 }),
  A('b_heavy', 'barrel', 'Bull Heavy Barrel', 500, 29, ['rifle', 'carbine', 'br', 'dmr', 'sniper', 'lmg'],
    { recoil: -.08, spread: -.15, range: .1, recover: .06, adsTime: .08, speed: -.025 },
    'Thick bull barrel: holds its zero hot, damps vibration, weighs a lot.', { kind: 'heavy', dia: .024 }),
];

const BY_ID = new Map(ATTACHMENTS.map(a => [a.id, a]));
export const getAttachment = id => BY_ID.get(id) || null;

const asGun = g => (typeof g === 'string' ? getGun(g) : g);
const asAtt = a => (typeof a === 'string' ? getAttachment(a) : a);

export function fits(gun, att) {
  gun = asGun(gun); att = asAtt(att);
  if (!gun || !att || !gun.mounts || !gun.mounts[att.slot] || !att.fits.includes(gun.cat)) return false;
  if (att.bores && !att.bores.includes(gun.bore)) return false;
  if (att.cals && !att.cals.includes(gun.caliber)) return false;
  if (att.stocks && !att.stocks.includes(gun.model && gun.model.stock)) return false;
  if (att.reloadKinds && !att.reloadKinds.includes(gun.reloadKind)) return false;
  if (att.scoped && !gun.scope) return false;
  if (att.only && !att.only.includes(gun.id)) return false;
  if (att.exclude && att.exclude.includes(gun.id)) return false;
  if (att.mods.magSet && att.mods.magSet <= gun.mag) return false;
  return true;
}

export function compatible(gun, slot) {
  gun = asGun(gun); if (!gun) return [];
  return ATTACHMENTS.filter(a => (!slot || a.slot === slot) && fits(gun, a));
}

// ------------------------------------------------ damage model helpers (docs §4) ------------------------------------------------
const TORSO_R = .27;   // radius (m) of a disc with the area of a standing torso, for the pellet estimate

export function pelletHits(gun, dist) {
  const p = gun.spread && gun.spread.pellet; if (!p || (gun.pellets || 1) <= 1) return 1;
  const r = Math.max(dist, 0) * Math.tan(p); return r <= TORSO_R ? 1 : (TORSO_R / r) ** 2;
}

/** Damage of one trigger pull (all pellets, expected) at dist metres, hit group multiplier applied, BEFORE armour. */
export function damageAt(gun, dist, group = 'chest') {
  const n = gun.pellets || 1, f = n > 1 ? pelletHits(gun, dist) : 1;
  return gun.dmg * n * f * (gun.falloff ** (Math.max(dist, 0) / 10)) * (HIT_MULT[group] ?? 1);
}

/** Shots to kill a fresh player. armor 0..100 protects every group but legs; helmet protects the head (docs §4). */
export function hitsToKill(gun, dist, { group = 'chest', armor = 0, helmet = false, hp = 100 } = {}) {
  const d = damageAt(gun, dist, group); if (!(d > .01)) return Infinity;
  let ar = armor;
  for (let n = 1; n <= 400; n++) {
    let h = d;
    if (group === 'head' ? helmet : group !== 'leg' && ar > 0) {
      h = d * gun.armorPen;
      if (group !== 'head') { let loss = (d - h) / 2; if (loss > ar) { h += (loss - ar) * 2; loss = ar; } ar -= loss; }
    }
    hp -= h; if (hp <= 1e-6) return n;
  }
  return Infinity;
}

/** Time (s) of the k-th shot after the first (k = 0 -> 0) in the gun's default mode, including bursts and reloads. */
function shotTime(gun, k) {
  const mode = gun.modes && gun.modes[0], mag = Math.max(1, gun.mag || 1);
  const reloads = Math.floor(k / mag), j = k % mag;
  let t;
  if (mode === 'burst' && gun.burst > 1) {
    const ib = fireInterval(gun, 'burst'), per = (gun.burst - 1) * ib + Math.max(gun.burstDelay || 0, ib);
    t = Math.floor(j / gun.burst) * per + (j % gun.burst) * ib;
    if (reloads) t += reloads * ((Math.ceil(mag / gun.burst) - 1) * per + ((mag - 1) % gun.burst) * ib + (gun.reloadEmpty || gun.reload));
  } else {
    const iv = fireInterval(gun);
    t = j * iv + reloads * ((mag - 1) * iv + (gun.reloadEmpty || gun.reload));
  }
  return t;
}

export function timeToKill(gun, dist, opts = {}) {
  const n = hitsToKill(gun, dist, opts); return Number.isFinite(n) ? shotTime(gun, n - 1) : Infinity;
}

function effectiveRpm(gun) {
  if (!gun.rpm) return 0;
  const mode = gun.modes && gun.modes[0];
  if (mode === 'burst' && gun.burst > 1) { const ib = fireInterval(gun, 'burst'); return 60 * gun.burst / ((gun.burst - 1) * ib + Math.max(gun.burstDelay || 0, ib)); }
  return gun.rpm;
}

function headKillRange(gun, helmet) {
  if (hitsToKill(gun, 0, { group: 'head', armor: helmet ? 100 : 0, helmet }) > 1) return 0;
  let lo = 0, hi = 300;
  if (hitsToKill(gun, hi, { group: 'head', armor: helmet ? 100 : 0, helmet }) === 1) return hi;
  for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (hitsToKill(gun, m, { group: 'head', armor: helmet ? 100 : 0, helmet }) === 1) lo = m; else hi = m; }
  return Math.round(lo * 10) / 10;
}

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v), r3 = v => Math.round(v * 1000) / 1000, r2 = v => Math.round(v * 100) / 100;
const scale01 = (v, a, b) => clamp((v - a) / (b - a), 0, 1);

/** Derived numbers for the HUD / armory from any stats object (a raw gun or an effectiveStats result). */
export function derive(s) {
  if (s.cat === 'melee') {
    const sl = s.slash || { dmg: s.dmg, rate: 60 / (s.rpm || 60) };
    return { speed: s.speed, draw: s.draw, dps: r2(sl.dmg / sl.rate), ttk: { front: r2(sl.rate * (Math.ceil(100 / sl.dmg) - 1)), back: 0 },
      bars: { damage: Math.round(100 * clamp(sl.dmg / 100, 0, 1)), fireRate: Math.round(100 * clamp(1 / sl.rate / 2.5, 0, 1)), range: Math.round(100 * clamp(s.range / 2.2, 0, 1)),
        accuracy: 100, control: 100, mobility: Math.round(100 * scale01(s.speed, 3.8, 6.0)), handling: Math.round(100 * (1 - scale01(s.draw, .3, 1.2))) } };
  }
  const rpm = effectiveRpm(s);
  const ttk = {}, stk = {};
  for (const d of [10, 30]) {
    stk[d] = { bare: hitsToKill(s, d), armor: hitsToKill(s, d, { armor: 100 }) };
    ttk[d] = { bare: r3(timeToKill(s, d)), armor: r3(timeToKill(s, d, { armor: 100 })) };
  }
  const shot = damageAt(s, 10);
  const p = s.recoil.pattern; let v = 0, h = 0;
  for (let i = 0; i < Math.min(10, p.length); i++) { v += p[i][1]; h += Math.abs(p[i][0]); }
  // aim offset that builds up in sustained fire: average step over the first shots against the recovery between two shots
  const n10 = Math.max(1, Math.min(10, p.length)), step = Math.hypot(v, h) / n10, iv = rpm ? 60 / rpm : 1;
  const held = step / Math.max(.05, 1 - Math.exp(-s.recoil.recover * iv));
  const hip = spreadAt(s, {}), ads = spreadAt(s, { ads: 1 });
  const zoom = s.zoom || (s.scope ? s.scope.zoom : s.adsFov);
  const bars = {
    damage: Math.round(100 * Math.sqrt(clamp(shot / 165, 0, 1))),
    fireRate: Math.round(100 * clamp(rpm / 1150, 0, 1)),
    range: Math.round(100 * clamp(Math.log(s.range / 8) / Math.log(400 / 8), 0, 1)),
    accuracy: Math.round(100 * (1 - clamp(Math.log(ads ** .85 * hip ** .15 / .0004) / Math.log(.02 / .0004), 0, 1))),
    control: Math.max(5, Math.round(100 * (1 - clamp(.5 * Math.hypot(v, h) * (1 + s.recoil.random) / 12 + .5 * held / 5, 0, 1)))),
    mobility: Math.round(100 * scale01(s.speed, 3.8, 6.0)),
    handling: Math.round(100 * (1 - (scale01(s.adsTime, .12, .5) * .6 + scale01(s.draw, .4, 1.8) * .4))),
  };
  return {
    zoom, zoomLevels: s.zoomLevels || (s.scope ? s.scope.levels : [zoom]), reticle: s.reticle || (s.scope ? s.scope.reticle : 'iron'),
    adsTime: s.adsTime, draw: s.draw, speed: s.speed, adsSpeed: r2(s.speed * s.adsMove), mag: s.mag, reload: s.reload, reloadEmpty: s.reloadEmpty,
    rpm: Math.round(rpm), shotDmg10: r2(shot), dps: Math.round(shot * rpm / 60), dpsArmor: Math.round(shot * Math.min(1, s.armorPen) * rpm / 60),
    ttk, stk, headKill: { bare: headKillRange(s, false), helmet: headKillRange(s, true) },
    recoil: { v: r2(v), h: r2(h) }, hipCone: r3(hip * 1000) / 1000, adsCone: Math.round(ads * 1e5) / 1e5, loud: s.loud ?? (s.suppressed ? .32 : 1), bars,
  };
}

const FRACTION_KEYS = ['spread', 'moveSpread', 'hipSpread', 'pellet', 'recoil', 'recoilV', 'recoilH', 'kick', 'recover', 'bipod', 'adsTime', 'draw',
  'speed', 'adsMove', 'range', 'velocity', 'dmg', 'mag', 'reload', 'sway', 'loud', 'cantedAds'];
const FRACTION = new Set(FRACTION_KEYS);
const clone = o => (typeof structuredClone === 'function' ? structuredClone(o) : JSON.parse(JSON.stringify(o)));

/** Gun stats with attachments applied. mods = { slot: attId } (or an array of ids). Unknown ids, wrong slots and attachments that do
    not fit are ignored. Returns a NEW object (the GUNS entry is never touched) with .attachments (applied ids), .mods, the optic
    fields (zoom, zoom2, zoomLevels, reticle, opticKind, thermal, canted, cantedZoom, cantedAdsTime), laser, light, bipod, loud,
    flashHide, and .derived (see derive()). */
export function effectiveStats(gun, mods = {}) {
  gun = asGun(gun); if (!gun) return null;
  const s = clone(gun);
  if (gun.cat === 'melee') { s.attachments = []; s.mods = {}; s.derived = derive(s); return s; }
  const want = Array.isArray(mods) ? Object.fromEntries(mods.map(id => { const a = getAttachment(id); return [a ? a.slot : id, id]; })) : (mods || {});
  const acc = {}, flags = {}, applied = {};
  let opticKind = null, magSet = 0;
  for (const slot of SLOTS) {
    const a = getAttachment(want[slot]); if (!a || a.slot !== slot || !fits(gun, a)) continue;
    applied[slot] = a.id;
    if (slot === 'optic') opticKind = a.model.kind;
    for (const [k, v] of Object.entries(a.mods)) {
      if (k === 'magSet') magSet = Math.max(magSet, v);
      else if (FRACTION.has(k)) {
        // a suppressor-optimised gun (gun.suppressorFriendly) loses only a quarter of a can's range / velocity / handling penalty
        const penalty = k === 'adsTime' || k === 'draw' ? v > 0 : k === 'range' || k === 'velocity' ? v < 0 : false;
        const soft = !!(a.mods.suppressed && gun.suppressorFriendly && penalty);
        acc[k] = (acc[k] || 0) + (soft ? v * .25 : v);
      } else flags[k] = v;
    }
  }
  const f = k => 1 + clamp(acc[k] || 0, -.9, 3);

  // accuracy
  s.spread.base = Math.max(.0002, gun.spread.base * f('spread'));
  s.spread.shot = Math.max(0, gun.spread.shot * f('spread'));
  s.spread.max = Math.max(s.spread.base, gun.spread.max * (1 + clamp(acc.spread || 0, -.9, 3) * .5));
  s.spread.move = Math.max(0, gun.spread.move * f('moveSpread'));
  s.spread.hip = clamp(gun.spread.hip * f('hipSpread'), .4, 2);
  s.spread.pellet = Math.max(0, gun.spread.pellet * f('pellet'));
  // recoil
  const all = f('recoil'), rv = all * f('recoilV'), rh = all * f('recoilH');
  s.recoil.pattern = gun.recoil.pattern.map(([x, y]) => [r3(x * rh), r3(y * rv)]);
  s.recoil.random = r3(gun.recoil.random * all);
  s.recoil.kick = r3(clamp(gun.recoil.kick * f('kick') * (1 + clamp(acc.recoil || 0, -.9, 3) * .5), .05, 20));
  s.recoil.recover = r3(clamp(gun.recoil.recover * f('recover'), .5, 30));
  s.bipod = r3(clamp(f('bipod'), .25, 1));
  s.breath.sway = Math.max(0, gun.breath.sway * f('sway'));
  // handling
  s.adsTime = r3(clamp(gun.adsTime * f('adsTime'), .08, 1.2));
  s.draw = r3(clamp(gun.draw * f('draw'), .2, 2.5));
  s.speed = r2(clamp(gun.speed * f('speed'), 3.4, 6.1));
  s.adsMove = r2(clamp(gun.adsMove * f('adsMove'), .25, 1));
  // ballistics
  const rg = clamp(acc.range || 0, -.9, 3);
  s.range = Math.round(gun.range * (1 + rg));
  s.falloff = r3(clamp(gun.falloff ** (1 / (1 + rg)), .5, .997));
  s.velocity = Math.round(gun.velocity * f('velocity'));
  s.dmg = r2(gun.dmg * f('dmg'));
  // magazine and reload
  s.mag = magSet || Math.max(1, Math.round(gun.mag * f('mag')));
  const rl = f('reload');
  if (gun.shell) {
    s.shell = { start: r2(gun.shell.start * rl), per: r2(gun.shell.per * rl), end: r2(gun.shell.end * rl) };
    s.reload = r2(s.shell.start + s.shell.per * s.mag + s.shell.end);
    s.reloadEmpty = r2(s.reload + (gun.reloadEmpty - gun.reload) * rl);
  } else { s.reload = r2(gun.reload * rl); s.reloadEmpty = r2(gun.reloadEmpty * rl); }
  // flags
  s.suppressed = !!(gun.suppressed || flags.suppressed);
  s.flashHide = !!(s.suppressed || flags.flashHide);
  s.loud = r2(clamp((s.suppressed ? .32 : 1) * f('loud'), .1, 2));
  s.laser = flags.laser || null;
  s.light = flags.light ? { ...flags.light } : null;
  s.thermal = flags.thermal ? clone(flags.thermal) : null;
  // optics: an optic attachment replaces the irons or the built-in scope (canted irons keep the scope and add a second sight)
  if (flags.zoom) {
    s.zoom = flags.zoom; s.zoom2 = flags.zoom2 || null; s.reticle = flags.reticle || 'dot'; s.opticKind = opticKind;
    s.zoomLevels = flags.zoom2 ? [flags.zoom, flags.zoom2] : [flags.zoom];
  } else if (gun.scope) {
    s.zoom = gun.scope.zoom; s.zoom2 = null; s.reticle = gun.scope.reticle; s.opticKind = 'scope'; s.zoomLevels = [...(gun.scope.levels || [gun.scope.zoom])];
  } else { s.zoom = gun.adsFov; s.zoom2 = null; s.reticle = 'iron'; s.opticKind = 'iron'; s.zoomLevels = [gun.adsFov]; }
  s.canted = !!flags.canted;
  s.cantedZoom = flags.canted ? flags.cantedZoom || 1.1 : null;
  s.cantedAdsTime = flags.canted ? r3(s.adsTime * f('cantedAds')) : null;
  s.attachments = Object.values(applied);
  s.mods = applied;
  s.derived = derive(s);
  return s;
}

/** Alias listed in docs/ARCHITECTURE.md §1 (same function). */
export const applyMods = effectiveStats;
