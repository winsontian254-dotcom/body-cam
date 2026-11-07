/* LIVE FIRE — guns and melee weapons. DATA ONLY: pure JS, no BABYLON, no DOM (the game, armory, bots and Node tests import it).
   Contract: docs/ARCHITECTURE.md §5. Balance reasoning and tables: docs/WEAPONS.md. Checked by tools/test/balance.mjs.
   Exports:
     CATEGORIES               ['pistol','smg','rifle','carbine','br','shotgun','dmr','sniper','lmg']  (MELEE uses cat 'melee')
     CATEGORY_INFO            { cat: { name, slot, killReward, price: [lo, hi], adsMove } }
     MAKERS                   { id: { name, origin, identity, naming } }            (all fictional)
     ARCHETYPES               { id: { desc, cats: [..], guns: [ids] } }             model families for js/weapons/models.js
     SOUND_FAMILIES           the audio gun families of docs §9 (every gun.sound is one of them)
     RETICLES                 reticle ids used by built-in scopes and optics (js/weapons/scope.js draws them)
     GUNS                     50 guns
     MELEE                    3 melee weapons (knife, machete, tomahawk)
     ALIASES                  old stub ids -> current ids ('p9' -> 'vogt9', 'vk47' -> 'purga')
     DEFAULT_LOADOUT          { primary, secondary, melee, nades }
     MOVE_FREE                fraction of max speed under which moving adds no spread (walk-peek / counter-strafe)
     getGun(id)               gun OR melee weapon by id (aliases resolved) or null;  getMelee(id);  gunsBy(cat)
     speedFromWeight(kg)      carried run speed (m/s); every gun's `speed` is speedFromWeight(gun.weight)
     fireInterval(gun, mode?) seconds between shots (inside the burst for 'burst')
     spreadAt(gun, state)     cone half-angle (radians) for { speedFrac, air, crouch, ads, bloom }
     recoilStep(gun, i)       deterministic [dx, dy] (DEGREES) added to the aim offset after shot i (0-based); loops past the end

   Units: metres, seconds, kg, m/s. Spread and sway in RADIANS (cone half-angle). Recoil pattern / kick / random in DEGREES
   (x = right +, y = up +). Damage is per bullet (per PELLET for shotguns) on a 100 hp player before hit-group multipliers.

   Field notes (beyond the §5 list; all fields are present on every gun, null/0 when they do not apply):
     modes[0] is the default fire mode. burst = rounds per burst (0 = no burst mode), burstRpm = cyclic rate inside the burst,
       burstDelay = forced pause (s) after a burst before the next one may start. For semi guns rpm is the trigger-reset limit.
     cycle: null | 'pump' | 'bolt' | 'lever' — a manual action that runs between shots (viewmodel animation; already in rpm).
     reloadKind: 'mag' | 'shell' | 'cylinder' | 'belt' | 'break'. shell = { start, per, end } for shell-by-shell loading
       (interruptible); then reload = start + per*mag + end and reloadEmpty = reload + the pump/lever to chamber.
     reload = tactical reload (round still chambered), reloadEmpty = from empty (incl. releasing the bolt / slide).
     adsMove = speed multiplier while aiming. weight = carried weight (gun + loaded mag + standard sight).
     velocity = muzzle velocity (m/s; for tracers, bullet-crack audio and the armory).
     spread = { base, move, air, crouch, ads, max, shot, hip, pellet }:
       base  standing-still cone (rad) in hip fire;  shot = bloom added per shot (decays with recoil.recover);
       max   cap for base + bloom;  crouch, ads, hip = multipliers (hip = hip-fire only, lasers lower it);
       move  added at full run speed (scaled from MOVE_FREE to 1);  air = added while airborne;
       pellet = shotgun pattern half-angle (rad) around the aim point (0 for single projectiles).  Use spreadAt().
     recoil = { pattern, kick, recover, random, loop }:
       pattern[i] = [dx, dy] degrees added to the aim offset after shot i (bullets follow the offset; the camera follows it by
       the recoil.js view factor). recover = exponential return rate (1/s) of the offset AND the pattern index once you stop
       firing. random = half-width (deg) of the uniform per-shot jitter added to each step (y gets half of it).
       kick = camera view punch per shot (deg, visual, springs back fast). loop = how many last steps repeat (x mirrored
       every other loop) when a spray outlasts the pattern. Use recoilStep().
     breath = { sway, hold }: sway = aim drift amplitude (rad) while aiming, hold = seconds the breath can be held (0 = no).
     bore = suppressor / ammo family: 'rim' '9' 'pdw' 'mag' '556' '762' '338' '50' '12g'.  suppressed = integral suppressor.
     suppressorFriendly = a muzzle suppressor costs (almost) no range/velocity.  tracer = every Nth round is a tracer (0 none).
     scope = built-in optic { zoom, reticle, levels } (levels = zoom steps cycled by the ADS key; the optic slot can replace it).
     role = buy hint for bots/armory: eco allround cqb stealth precision heavy entry support long.
*/

export const CATEGORIES = ['pistol', 'smg', 'rifle', 'carbine', 'br', 'shotgun', 'dmr', 'sniper', 'lmg'];

export const CATEGORY_INFO = {
  pistol:  { name: 'Pistols',         slot: 'secondary', killReward: 300, price: [200, 700],   adsMove: .80, tracer: 3, sway: .0012, wob: .08 },
  smg:     { name: 'SMGs',            slot: 'primary',   killReward: 600, price: [1050, 1500], adsMove: .75, tracer: 3, sway: .0010, wob: .10 },
  rifle:   { name: 'Assault Rifles',  slot: 'primary',   killReward: 300, price: [1800, 3300], adsMove: .60, tracer: 3, sway: .0009, wob: .09 },
  carbine: { name: 'Carbines',        slot: 'primary',   killReward: 300, price: [1250, 2800], adsMove: .65, tracer: 3, sway: .0009, wob: .09 },
  br:      { name: 'Battle Rifles',   slot: 'primary',   killReward: 300, price: [3000, 3700], adsMove: .55, tracer: 3, sway: .0011, wob: .10 },
  shotgun: { name: 'Shotguns',        slot: 'primary',   killReward: 900, price: [1050, 2000], adsMove: .70, tracer: 0, sway: .0012, wob: .10 },
  dmr:     { name: 'Marksman Rifles', slot: 'primary',   killReward: 300, price: [2700, 4200], adsMove: .50, tracer: 2, sway: .0016, wob: .06 },
  sniper:  { name: 'Sniper Rifles',   slot: 'primary',   killReward: 300, price: [1700, 5600], adsMove: .45, tracer: 1, sway: .0030, wob: .05 },
  lmg:     { name: 'Machine Guns',    slot: 'primary',   killReward: 300, price: [3200, 5400], adsMove: .45, tracer: 2, sway: .0014, wob: .10 },
};

export const MAKERS = {
  kr:       { name: 'Kessler & Rauch',      origin: 'German-style precision works',   identity: 'Roller-delayed actions, cold-hammered barrels, clinical engineering, black polymer.', naming: '"KR" + a German noun (Vogt, Spatz, Habicht...).' },
  zavod:    { name: 'Zavod Radomir',        origin: 'Eastern-bloc state arsenal',      identity: 'Long-stroke pistons, stamped steel, laminated wood, rugged and loose-tolerance.', naming: '"ZR-" + model year + a Slavic word (Purga, Taiga, Krechet...).' },
  ironbark: { name: 'Ironbark Defense',     origin: 'US tactical contractor',          identity: 'Modular AR-pattern rifles, M-LOK rails, everything ambidextrous and coated black or tan.', naming: '"IB" / "Ironbark" + a guard or frontier noun (Warden, Halberd, Switchback...).' },
  pembroke: { name: 'Pembroke & Vane',      origin: 'British heritage gunmakers',      identity: 'Revolvers, bolt rifles and quiet special-service guns; blued steel and green chassis.', naming: '"Pembroke" + a title or bird + Mark number (Constable Mk II, Rook Mk 4...).' },
  aokiri:   { name: 'Aokiri Precision',     origin: 'Japanese high-tech maker',        identity: 'Compact, light, clever mechanisms, tight tolerances, matte graphite polymer.', naming: '"Type" + year number + a Japanese nature word (Shizuka, Hachi, Kogarashi...).' },
  morandi:  { name: 'Fratelli Morandi',     origin: 'Italian family shotgun house',    identity: 'Walnut, engraved receivers and fast gas-operated shotguns.', naming: '"Morandi" + an Italian word (Cacciatore, Tempesta, Gemelli).' },
  basalt:   { name: 'Basalt Dynamics',      origin: 'Next-generation systems start-up', identity: 'Unconventional operating systems, new cartridges, sharp angular shells.', naming: '"Basalt" + one abstract word + calibre digits (Monolith 50, Axion 68...).' },
  norrhavn: { name: 'Norrhavn Vapen',       origin: 'Scandinavian arms works',         identity: 'Cold-weather-proof bullpups, heavy rifles and machine guns; olive and grey.', naming: '"Norrhavn" + a Nordic animal or word + calibre (Varg 556, Björn 50...).' },
  gallo:    { name: 'Gallo Industrial',     origin: 'Latin-American budget factory',   identity: 'Stamped, cheap, loud and plentiful; it works more often than it should.', naming: '"Gallo" + a Spanish animal or word (Avispa, Pulga, Mula...).' },
  calder:   { name: 'Calder Frontier Arms', origin: 'American classic-arms company',   identity: 'Walnut and blued steel, lever actions, .45s and old-school wood-stocked carbines.', naming: '"Calder" + a frontier noun (Lawman, Prairie, Longhorn...).' },
};

export const SOUND_FAMILIES = ['pistol_9', 'pistol_45', 'pistol_mag', 'smg_9', 'smg_45', 'rifle_556', 'rifle_762', 'rifle_545', 'br_308',
  'dmr_762', 'sniper_338', 'sniper_50', 'shotgun_12', 'lmg_556', 'lmg_762'];

export const RETICLES = ['iron', 'dot', 'holo', 'chevron', 'circle_dot', 'bdc', 'duplex', 'mildot', 'mildot_fine', 'ring', 'lpvo', 'thermal'];

const ARCH_DESC = {
  pistol_striker: 'Polymer-frame striker pistol, double-stack magazine, accessory rail, optic cut.',
  pistol_compact: 'Subcompact striker pistol, short grip and slide.',
  pistol_singlestack: 'All-steel single-action pistol, slim single-stack grip, exposed hammer, grip safety.',
  revolver: 'Double-action revolver: swing-out cylinder, ejector rod, hammer; model.barrel/rail tell the snub from the magnum (full underlug + top rail).',
  machine_pistol: 'Steel select-fire pistol with a long slide, fire selector and a detachable holster stock.',
  pistol_large: 'Large-frame gas-operated pistol: long fixed barrel with top rail, triangular muzzle, big slide.',
  pistol_integral: 'Rimfire target pistol whose barrel IS a long cylindrical suppressor; tubular receiver, top rail.',
  smg_roller: 'Roller-delayed SMG: tubular receiver, curved 9 mm magazine, drum rear sight, cocking tube, slim handguard.',
  pdw: 'Compact PDW: magazine in the pistol grip, short receiver, telescoping stock, folding foregrip.',
  smg_classic: 'Classic wood-stocked SMG: finned barrel, top cocking knob, wooden front grip and buttstock.',
  pdw_bullpup: 'Bullpup PDW: magazine lying flat on top, thumbhole grip, ambidextrous ejection down.',
  smg_offset: 'Offset-bolt SMG: tall angular receiver, bore sits low over the hand, magazine well forward, folding stock.',
  smg_stamped: 'Stamped sheet-metal open-bolt SMG: tube receiver, side magazine or under-well, wire stock, perforated shroud.',
  smg_integral: 'SMG with a full-length integral suppressor over the barrel, collapsible stock.',
  smg_micro: 'Micro SMG: boxy receiver, magazine in the grip, short folding stock, high-cycling.',
  ak: 'Long-stroke-piston rifle: dust cover, long side charging handle, gas tube above the barrel, curved magazine.',
  ar15: 'AR-pattern rifle: upper/lower receiver, buffer tube, charging handle, free-float M-LOK rail, flip-up sights.',
  ar_piston: 'AR-pattern rifle with a short-stroke piston gas block, heavier barrel and quad rail.',
  bullpup_classic: 'Classic bullpup: one-piece polymer shell, carry handle with integrated 1.5x optic, folding foregrip.',
  bullpup: 'Modern bullpup: angular polymer shell, full-length top rail, magazine behind the grip.',
  rifle_modular: 'Modular rifle: monolithic aluminium upper with long top rail, side-folding adjustable stock, ambi controls.',
  rifle_polymer: 'Polymer-shell rifle: skeleton stock, see-through magazine, carry-handle rail.',
  pcc: 'Pistol-calibre carbine: wood stock, long slim barrel, straight magazine in the grip area.',
  br_roller: 'Roller-delayed battle rifle: long stamped receiver, cocking tube, paddle mag release, drum sight.',
  br_classic: 'Classic battle rifle: full walnut stock, rotating bolt with op-rod, 20-round box magazine.',
  shotgun_semi: 'Gas-operated semi-auto shotgun: receiver with rail, tube magazine, pistol-grip stock.',
  shotgun_drum: 'Magazine-fed automatic shotgun: AK-like receiver, big drum magazine, folding stock.',
  shotgun_break: 'Side-by-side break-action double shotgun with exposed hammers and a wooden stock.',
  shotgun_lever: 'Lever-action shotgun: big loop lever, tube magazine, straight-grip walnut stock.',
  pump: 'Pump-action shotgun: tube magazine, sliding forend, bead or ghost-ring sight.',
  ar10: 'Large-frame AR-pattern marksman rifle: long free-float rail, adjustable stock, straight 20-round magazine.',
  dmr_classic: 'Classic marksman rifle: skeleton thumbhole stock, long barrel with slotted flash hider, side rail.',
  dmr_integral: 'Integrally suppressed marksman rifle: thick can over the whole barrel, skeleton stock.',
  bolt: 'Bolt-action sniper rifle: long bolt handle, box magazine, built-in scope; chassis or synthetic stock.',
  bolt_am: 'Anti-materiel bolt rifle: huge receiver, fist-sized muzzle brake, bipod, top handle.',
  sniper_semi: 'Semi-automatic sniper rifle: AR-pattern large frame with long scope rail and collapsible stock.',
  belt_lmg: 'Belt-fed machine gun: feed tray cover, ammo box or pouch, carry handle, bipod, quick-change barrel.',
  lmg_mag: 'Magazine-fed squad automatic: heavy barrel, drum magazine, folding bipod.',
  knife: 'Fixed-blade combat knife.', machete: 'Long machete with a hooked tip.', tomahawk: 'Tactical tomahawk with a spike.',
};

const TRACER_WARM = [1, .78, .45], TRACER_RED = [1, .42, .25], TRACER_GREEN = [.55, 1, .45];

// ---- small deterministic helpers (no import from core so Node tests need nothing else) ----
function hashStr(s) { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function prng(seed) { let a = seed >>> 0 || 0x9e3779b9; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const r3 = v => Math.round(v * 1000) / 1000, r2 = v => Math.round(v * 100) / 100;

/* Spray patterns are authored per gun as segments [shots, totalDx, totalDy, ease]: the segment's displacement (degrees) is spread
   over its shots with an ease ('lin' even, 'in' accelerating, 'out' decelerating, 's' sine bell for smooth sweeps), plus a small
   deterministic per-gun wobble so the pattern has the uneven, hand-made feel of a real gun. The expanded arrays are what ships. */
function spray(id, segs, wob) {
  const r = prng(hashStr('spray:' + id)), out = [];
  for (const [n, dx, dy, ease = 'lin'] of segs) {
    const w = [];
    for (let k = 0; k < n; k++) { const t = n > 1 ? k / (n - 1) : .5;
      w.push(ease === 'in' ? .5 + t : ease === 'out' ? 1.5 - t : ease === 's' ? Math.sin(Math.PI * (k + .5) / n) : 1); }
    const ws = w.reduce((a, b) => a + b, 0);
    for (let k = 0; k < n; k++) { const f = w[k] / ws;
      out.push([r3(dx * f + (r() - .5) * 2 * wob), r3(Math.max(-.12, dy * f + (r() - .5) * wob))]); }
  }
  return out;
}

// carried weight (kg) -> run speed (m/s). Knife-only is 6.0. Calibrated so pistols ~5.8, SMGs ~5.45, rifles ~5.3, BRs ~5.05,
// heavy bolt snipers ~4.6, belt-fed LMGs ~4.3 and the .50 anti-materiel rifle ~3.9 (ratios of a classic tactical shooter).
const SPEED_CURVE = [[0, 6.0], [.5, 5.9], [1, 5.82], [2, 5.66], [2.5, 5.56], [3, 5.44], [3.5, 5.31], [4, 5.19], [4.5, 5.07], [5, 4.96],
  [6, 4.78], [7, 4.6], [9, 4.3], [11, 4.05], [14, 3.8], [20, 3.5]];
export function speedFromWeight(kg) {
  const c = SPEED_CURVE; if (!(kg > 0)) return c[0][1];
  for (let i = 1; i < c.length; i++) if (kg <= c[i][0]) { const [x0, y0] = c[i - 1], [x1, y1] = c[i]; return r2(y0 + (y1 - y0) * (kg - x0) / (x1 - x0)); }
  return c[c.length - 1][1];
}

const MOUNT_KEYS = { o: 'optic', m: 'muzzle', u: 'under', s: 'side', g: 'mag', k: 'stock', b: 'barrel' };
function mountsOf(str) { const m = {}; for (const [ch, k] of Object.entries(MOUNT_KEYS)) m[k] = str.includes(ch); return m; }

/* G(spec) expands the compact authoring spec into the full documented gun object:
   ap armorPen, kr killReward, lvl unlockLevel, res reserve, pel pellets, rl [reload, reloadEmpty], shell [start, per, end],
   ads [adsTime, adsFov], am adsMove, fo falloff, w weight, vel velocity, sp [base, move, air, crouch, ads, max, shot],
   pellet pellet half-angle, rc [kick, recover, random], br [breath sway, hold], mt mounts letters (o m u s g k b),
   mdl [barrel, length, mag, stock, rail, finish, extra?], tr tracer every N, tc tracer colour. */
function G(o) {
  const ci = CATEGORY_INFO[o.cat], modes = o.modes || ['semi'];
  const burst = modes.includes('burst') ? (o.burst || 3) : 0;
  const shell = o.shell ? { start: o.shell[0], per: o.shell[1], end: o.shell[2] } : null;
  const reload = shell ? r2(shell.start + shell.per * o.mag + shell.end) : o.rl[0];
  const reloadEmpty = shell ? r2(reload + (o.chamber || .45)) : o.rl[1];
  const [base, move, air, crouch, ads, max, shot] = o.sp, [kick, recover, random] = o.rc;
  const pattern = spray(o.id, o.spray, o.wob ?? ci.wob);
  const [barrel, length, mag, stock, rail, finish, extra] = o.mdl;
  return {
    id: o.id, name: o.name, maker: MAKERS[o.maker].name, makerId: o.maker, cat: o.cat, slot: ci.slot, archetype: o.arch, role: o.role,
    desc: o.desc, price: o.price, killReward: o.kr ?? ci.killReward, unlockLevel: o.lvl, team: 0,
    dmg: o.dmg, armorPen: o.ap, rpm: o.rpm, modes, burst, burstRpm: burst ? (o.brpm || o.rpm) : 0, burstDelay: burst ? (o.bdel ?? .25) : 0,
    mag: o.mag, reserve: o.res, pellets: o.pel || 1,
    reload, reloadEmpty, reloadKind: o.rk || (shell ? 'shell' : 'mag'), shell, cycle: o.cycle || null,
    draw: o.draw, adsTime: o.ads[0], adsFov: o.ads[1], adsMove: o.am ?? ci.adsMove,
    range: o.range, falloff: o.fo, pen: o.pen, weight: o.w, speed: speedFromWeight(o.w), velocity: o.vel,
    spread: { base, move, air, crouch, ads, max, shot, hip: 1, pellet: o.pellet || 0 },
    recoil: { pattern, kick, recover, random, loop: o.loop || Math.min(12, Math.max(1, Math.floor(pattern.length / 2))) },
    breath: { sway: o.br ? o.br[0] : ci.sway, hold: o.br ? o.br[1] : 0 },
    sound: o.sound, caliber: o.cal, bore: o.bore, tracer: o.tr ?? ci.tracer, tracerColor: o.tc || TRACER_WARM,
    suppressed: !!o.supp, suppressorFriendly: !!o.sf, scope: o.scope || null,
    mounts: mountsOf(o.mt),
    model: { barrel, length, mag, stock, rail, finish, ...(extra || {}) },
  };
}

export const GUNS = [
  // ============================================ PISTOLS (secondary) ============================================
  G({ id: 'vogt9', name: 'KR Vogt 9', maker: 'kr', cat: 'pistol', arch: 'pistol_striker', role: 'eco',
    desc: 'Polymer striker-fired 9 mm service pistol; 18 rounds, a clean trigger break and a slide cut for a micro optic.',
    price: 200, lvl: 1, dmg: 28, ap: .52, rpm: 400, modes: ['semi'], mag: 18, res: 90, rl: [2.15, 2.35], draw: .55, ads: [.16, 1.1],
    range: 26, fo: .88, pen: 1.0, w: .82, vel: 365, cal: '9x19', bore: '9', sound: 'pistol_9',
    sp: [.0038, .032, .16, .85, .62, .045, .012], rc: [1.1, 8.5, .22], spray: [[8, .5, 11.5]],
    mt: 'omsg', mdl: [.114, .195, 'straight', 'none', true, 'polymer', { sights: 'iron', muzzle: 'crown' }] }),
  G({ id: 'chispa', name: 'Gallo Chispa', maker: 'gallo', cat: 'pistol', arch: 'pistol_compact', role: 'eco',
    desc: 'Subcompact 9 mm loaded with hot +P rounds; snappy, short-ranged, quick from the holster and better against vests than it looks.',
    price: 300, lvl: 2, dmg: 29, ap: .56, rpm: 420, modes: ['semi'], mag: 13, res: 78, rl: [1.95, 2.15], draw: .45, ads: [.13, 1.08],
    range: 18, fo: .84, pen: 1.0, w: .62, vel: 340, cal: '9x19 +P', bore: '9', sound: 'pistol_9',
    sp: [.0048, .028, .15, .85, .65, .05, .016], rc: [1.35, 8, .3], spray: [[8, .9, 13]],
    mt: 'osg', mdl: [.089, .165, 'straight', 'none', true, 'polymer', { sights: 'iron', muzzle: 'crown' }] }),
  G({ id: 'lawman', name: 'Calder Lawman .45', maker: 'calder', cat: 'pistol', arch: 'pistol_singlestack', role: 'eco',
    desc: 'All-steel single-action .45 with an 8-round single-stack magazine; a slow, fat bullet that drops unprotected targets.',
    price: 400, lvl: 14, dmg: 35, ap: .5, rpm: 340, modes: ['semi'], mag: 8, res: 48, rl: [2.0, 2.3], draw: .62, ads: [.17, 1.1],
    range: 22, fo: .86, pen: .8, w: 1.1, vel: 255, cal: '.45 Auto', bore: '9', sound: 'pistol_45',
    sp: [.0035, .034, .16, .85, .6, .045, .015], rc: [1.6, 8, .25], spray: [[6, .3, 12.6]],
    mt: 'omsg', mdl: [.127, .216, 'straight', 'none', false, 'steel', { sights: 'iron', muzzle: 'crown', grips: 'wood' }] }),
  G({ id: 'constable', name: 'Pembroke Constable Mk II', maker: 'pembroke', cat: 'pistol', arch: 'revolver', role: 'precision',
    desc: 'Six-shot double-action .38 revolver with a long, heavy trigger; accurate and dependable, slow to reload, no optic rail.',
    price: 450, lvl: 18, dmg: 40, ap: .5, rpm: 210, modes: ['semi'], mag: 6, res: 36, rl: [2.9, 2.9], rk: 'cylinder', draw: .6, ads: [.17, 1.12],
    range: 28, fo: .9, pen: .9, w: .85, vel: 300, cal: '.38 Spl +P', bore: '9', sound: 'pistol_9',
    sp: [.003, .03, .16, .85, .6, .04, .018], rc: [1.8, 7, .3], spray: [[6, .4, 13.2]],
    mt: 's', mdl: [.102, .24, 'cylinder', 'none', false, 'steel', { sights: 'iron', grips: 'wood', cylinder: 6 }] }),
  G({ id: 'sovereign', name: 'Pembroke Sovereign Mk VI', maker: 'pembroke', cat: 'pistol', arch: 'revolver', role: 'precision',
    desc: 'Six-inch .357 Magnum revolver with a full underlug and a top rail; brutal recoil, and a helmet does not save the head it hits.',
    price: 600, lvl: 32, dmg: 58, ap: .74, rpm: 150, modes: ['semi'], mag: 6, res: 36, rl: [3.1, 3.1], rk: 'cylinder', draw: .7, ads: [.2, 1.15],
    range: 40, fo: .91, pen: 1.4, w: 1.3, vel: 440, cal: '.357 Mag', bore: 'mag', sound: 'pistol_mag',
    sp: [.0028, .036, .18, .82, .5, .04, .03], rc: [3.4, 6, .45], spray: [[6, .8, 24]],
    mt: 'os', mdl: [.152, .29, 'cylinder', 'none', true, 'steel', { sights: 'iron', underlug: true, grips: 'rubber', cylinder: 6 }] }),
  G({ id: 'ovod', name: 'ZR-18 Ovod', maker: 'zavod', cat: 'pistol', arch: 'machine_pistol', role: 'cqb',
    desc: 'Select-fire 9x18 machine pistol with a holster stock; 850 rounds a minute that climbs hard and walks left.',
    price: 500, lvl: 24, dmg: 22, ap: .45, rpm: 850, modes: ['auto', 'semi'], mag: 20, res: 100, rl: [2.3, 2.6], draw: .6, ads: [.17, 1.1],
    range: 16, fo: .82, pen: .8, w: 1.22, vel: 320, cal: '9x18', bore: '9', sound: 'pistol_9',
    sp: [.0055, .03, .16, .85, .6, .06, .006], rc: [.9, 7, .45], spray: [[3, .1, 2.0, 'in'], [3, -.7, 4.2], [5, -2.8, 2.0, 's'], [5, 3.2, 1.2, 's'], [4, -1.6, .5]],
    mt: 'msgk', mdl: [.14, .225, 'straight', 'folding', false, 'steel', { sights: 'iron', muzzle: 'crown', selector: true }] }),
  G({ id: 'monolith', name: 'Basalt Monolith 50', maker: 'basalt', cat: 'pistol', arch: 'pistol_large', role: 'precision',
    desc: 'Gas-operated large-frame .50 semi-automatic; seven rounds, a muzzle that wants the sky and a hit that ignores most armour.',
    price: 700, lvl: 40, dmg: 54, ap: .86, rpm: 240, modes: ['semi'], mag: 7, res: 35, rl: [2.2, 2.5], draw: .75, ads: [.21, 1.15],
    range: 36, fo: .88, pen: 1.8, w: 2.0, vel: 470, cal: '.50 Mag Auto', bore: 'mag', sound: 'pistol_mag',
    sp: [.0045, .045, .2, .8, .45, .05, .035], rc: [3.8, 5.5, .6], spray: [[6, -.6, 26]],
    mt: 'osg', mdl: [.152, .27, 'straight', 'none', true, 'steel', { sights: 'iron', muzzle: 'crown' }] }),
  G({ id: 'ridgeback', name: 'IB-40 Ridgeback', maker: 'ironbark', cat: 'pistol', arch: 'pistol_striker', role: 'allround',
    desc: 'Full-size .40 striker pistol with a ported slide and 15 rounds: the middle ground between 9 mm capacity and .45 punch.',
    price: 400, lvl: 10, dmg: 31, ap: .56, rpm: 380, modes: ['semi'], mag: 15, res: 75, rl: [2.2, 2.4], draw: .58, ads: [.17, 1.1],
    range: 26, fo: .86, pen: 1.1, w: .92, vel: 330, cal: '.40 Auto', bore: '9', sound: 'pistol_45',
    sp: [.0036, .032, .16, .85, .6, .045, .014], rc: [1.35, 8, .26], spray: [[8, -.4, 14]],
    mt: 'omsg', mdl: [.114, .205, 'straight', 'none', true, 'black', { sights: 'iron', muzzle: 'crown', ported: true }] }),
  G({ id: 'shizuka', name: 'Aokiri Type 14 Shizuka', maker: 'aokiri', cat: 'pistol', arch: 'pistol_integral', role: 'stealth',
    desc: 'Integrally suppressed .22 target pistol: barely louder than a dropped book, dead accurate, and weak against anything harder than cloth.',
    price: 200, lvl: 6, dmg: 20, ap: .36, rpm: 450, modes: ['semi'], mag: 14, res: 98, rl: [1.9, 2.1], draw: .55, ads: [.15, 1.12],
    range: 30, fo: .80, pen: .35, w: 1.05, vel: 315, cal: '.22 LR Subsonic', bore: 'rim', sound: 'pistol_9', supp: true, tr: 0,
    sp: [.0022, .026, .15, .85, .55, .03, .007], rc: [.55, 9, .12], spray: [[8, .2, 5.6]],
    mt: 'osg', mdl: [.14, .30, 'straight', 'none', true, 'black', { sights: 'iron', muzzle: 'integral' }] }),

  // ============================================ SMGs ============================================
  G({ id: 'spatz', name: 'KR Spatz 9', maker: 'kr', cat: 'smg', arch: 'smg_roller', role: 'allround',
    desc: 'Roller-delayed 9 mm SMG firing from a closed bolt: soft, predictable and accurate well past pistol range.',
    price: 1500, lvl: 4, dmg: 27, ap: .58, rpm: 800, modes: ['auto', 'burst', 'semi'], burst: 3, bdel: .2, mag: 30, res: 120, rl: [2.6, 3.2],
    draw: .65, ads: [.2, 1.15], range: 30, fo: .86, pen: 1.0, w: 2.9, vel: 400, cal: '9x19', bore: '9', sound: 'smg_9',
    sp: [.0035, .045, .2, .85, .55, .04, .0028], rc: [.55, 7, .22],
    spray: [[4, .1, 1.6, 'in'], [4, .5, 2.6], [6, -1.6, 1.4, 's'], [8, 2.4, 1.0, 's'], [8, -1.8, .5, 's']],
    mt: 'omusgkb', mdl: [.225, .70, 'curved', 'collapsible', true, 'black', { sights: 'drum', muzzle: 'crown', handguard: 'polymer' }] }),
  G({ id: 'hachi', name: 'Aokiri Type 27 Hachi', maker: 'aokiri', cat: 'smg', arch: 'pdw', role: 'allround',
    desc: 'Compact PDW in a needle-nosed 4.7 mm round that keeps an armour-piercing bite; 40 rounds in the grip.',
    price: 1450, lvl: 20, dmg: 24, ap: .80, rpm: 950, modes: ['auto', 'semi'], mag: 40, res: 160, rl: [2.4, 2.9],
    draw: .6, ads: [.19, 1.15], range: 30, fo: .90, pen: 1.4, w: 2.1, vel: 720, cal: '4.7x29 PDW', bore: 'pdw', sound: 'smg_9',
    sp: [.004, .04, .18, .85, .55, .045, .0026], rc: [.5, 7.5, .22],
    spray: [[4, -.2, 1.5, 'in'], [4, -.5, 2.1], [8, 1.8, 1.2, 's'], [8, -2.4, .8, 's'], [8, 2.0, .5, 's'], [8, -1.6, .3, 's']],
    mt: 'omusgkb', mdl: [.18, .64, 'straight', 'collapsible', true, 'black', { sights: 'flip', muzzle: 'flash', foregrip: 'folding' }] }),
  G({ id: 'roughneck', name: 'Calder Roughneck .45', maker: 'calder', cat: 'smg', arch: 'smg_classic', role: 'cqb',
    desc: 'Wood-stocked .45 SMG with a finned barrel; slow cyclic rate, heavy slugs and a climb you feel in your teeth.',
    price: 1200, lvl: 12, dmg: 35, ap: .5, rpm: 650, modes: ['auto', 'semi'], mag: 30, res: 120, rl: [2.9, 3.5],
    draw: .75, ads: [.24, 1.15], range: 24, fo: .82, pen: .9, w: 4.2, vel: 280, cal: '.45 Auto', bore: '9', sound: 'smg_45',
    sp: [.0045, .045, .2, .85, .55, .05, .0035], rc: [.75, 6.5, .28],
    spray: [[4, .2, 2.0, 'in'], [4, .9, 4.0], [7, 2.2, 1.6, 's'], [8, -3.2, 1.0, 's'], [7, 2.0, .4, 's']],
    mt: 'musg', mdl: [.267, .81, 'straight', 'fixed', false, 'wood', { sights: 'iron', muzzle: 'comp', finned: true, foregrip: 'wood' }] }),
  G({ id: 'corvid', name: 'Basalt Corvid 57', maker: 'basalt', cat: 'smg', arch: 'pdw_bullpup', role: 'allround', kr: 300,
    desc: 'Bullpup PDW with a 50-round translucent magazine lying flat on top; low recoil, huge capacity, built to win a hallway.',
    price: 1500, lvl: 48, dmg: 25, ap: .72, rpm: 900, modes: ['auto', 'semi'], mag: 50, res: 150, rl: [3.1, 3.6],
    draw: .7, ads: [.22, 1.15], range: 30, fo: .88, pen: 1.3, w: 3.0, vel: 715, cal: '5.6x29 PDW', bore: 'pdw', sound: 'smg_9',
    sp: [.0042, .04, .18, .85, .55, .045, .0024], rc: [.48, 7, .2],
    spray: [[5, .1, 1.4, 'in'], [5, -.4, 2.0], [10, -2.0, 1.0, 's'], [10, 2.6, .6, 's'], [10, -2.0, .3, 's']],
    mt: 'omsb', mdl: [.264, .50, 'box', 'bullpup', true, 'polymer', { sights: 'none', muzzle: 'flash', magTop: true }] }),
  G({ id: 'torsion', name: 'Basalt Torsion 45', maker: 'basalt', cat: 'smg', arch: 'smg_offset', role: 'cqb',
    desc: 'Recoil-mitigating .45: an offset bolt drives the impulse down into the hand for 1100 rounds a minute with almost no muzzle rise.',
    price: 1450, lvl: 34, dmg: 31, ap: .52, rpm: 1100, modes: ['auto', 'burst', 'semi'], burst: 2, bdel: .15, mag: 25, res: 100, rl: [2.5, 3.0],
    draw: .65, ads: [.2, 1.15], range: 20, fo: .80, pen: .9, w: 2.9, vel: 290, cal: '.45 Auto', bore: '9', sound: 'smg_45',
    sp: [.0048, .042, .2, .85, .55, .05, .0035], rc: [.4, 8, .3],
    spray: [[3, .2, 1.1, 'out'], [3, -.3, .9], [6, 1.4, .6, 's'], [7, -2.4, .5, 's'], [6, 1.6, .3, 's']],
    mt: 'omusgkb', mdl: [.14, .62, 'straight', 'folding', true, 'black', { sights: 'flip', muzzle: 'crown' }] }),
  G({ id: 'avispa', name: 'Gallo Avispa', maker: 'gallo', cat: 'smg', arch: 'smg_stamped', role: 'eco',
    desc: 'Stamped-steel open-bolt 9 mm with a wire stock: cheap enough to lose, loose enough to rattle, and it still puts rounds out.',
    price: 1050, lvl: 1, dmg: 26, ap: .55, rpm: 750, modes: ['auto'], mag: 32, res: 128, rl: [2.6, 3.0],
    draw: .6, ads: [.22, 1.12], range: 22, fo: .84, pen: 1.0, w: 3.0, vel: 390, cal: '9x19', bore: '9', sound: 'smg_9',
    sp: [.0058, .045, .2, .85, .6, .055, .004], rc: [.65, 6.5, .42],
    spray: [[4, .3, 1.8, 'in'], [4, 1.1, 3.2], [8, 2.8, 1.2, 's'], [8, -2.2, .8, 's'], [8, 2.0, .4, 's']],
    mt: 'musgk', mdl: [.20, .75, 'straight', 'folding', false, 'steel', { sights: 'iron', muzzle: 'crown', shroud: 'perforated' }] }),
  G({ id: 'nightjar', name: 'Pembroke Nightjar Mk 3', maker: 'pembroke', cat: 'smg', arch: 'smg_integral', role: 'stealth',
    desc: 'Integrally suppressed 9 mm around a ported barrel and a long wipe-less can: subsonic, flashless and quieter than its own bolt.',
    price: 1350, lvl: 26, dmg: 25, ap: .5, rpm: 760, modes: ['auto', 'semi'], mag: 30, res: 120, rl: [2.7, 3.3],
    draw: .7, ads: [.22, 1.15], range: 24, fo: .85, pen: .9, w: 3.4, vel: 300, cal: '9x19 Subsonic', bore: '9', sound: 'smg_9', supp: true, tr: 0,
    sp: [.004, .042, .2, .85, .55, .045, .003], rc: [.45, 7, .2],
    spray: [[4, -.1, 1.6, 'in'], [4, -.4, 2.2], [7, -1.8, 1.0, 's'], [8, 2.6, .8, 's'], [7, -1.6, .4, 's']],
    mt: 'ousgk', mdl: [.20, .78, 'straight', 'collapsible', true, 'black', { sights: 'flip', muzzle: 'integral' }] }),
  G({ id: 'pulga', name: 'Gallo Pulga', maker: 'gallo', cat: 'smg', arch: 'smg_micro', role: 'cqb',
    desc: 'Pistol-sized 9 mm SMG with a blistering 1150 round-a-minute cycle: hose it at arm\'s length, never past it.',
    price: 1100, lvl: 8, dmg: 23, ap: .54, rpm: 1150, modes: ['auto'], mag: 32, res: 128, rl: [2.3, 2.7],
    draw: .5, ads: [.17, 1.1], range: 16, fo: .78, pen: .9, w: 2.2, vel: 380, cal: '9x19', bore: '9', sound: 'smg_9',
    sp: [.0062, .035, .16, .85, .6, .06, .0045], rc: [.6, 6.5, .5],
    spray: [[3, .3, 1.8, 'in'], [3, -.6, 3.6], [6, -3.0, 1.6, 's'], [6, 3.6, 1.0, 's'], [7, -3.0, .6, 's'], [7, 2.6, .3, 's']],
    mt: 'omsgk', mdl: [.13, .46, 'straight', 'folding', true, 'black', { sights: 'iron', muzzle: 'crown' }] }),

  // ============================================ ASSAULT RIFLES ============================================
  G({ id: 'purga', name: 'ZR-61 Purga', maker: 'zavod', cat: 'rifle', arch: 'ak', role: 'allround',
    desc: 'Long-stroke 7.62x39 rifle in laminated wood and stamped steel: it climbs, it kicks, and one round to a helmet ends the argument.',
    price: 2700, lvl: 1, dmg: 36, ap: .78, rpm: 600, modes: ['auto', 'semi'], mag: 30, res: 90, rl: [2.5, 3.2],
    draw: 1.0, ads: [.3, 1.2], range: 60, fo: .97, pen: 2.0, w: 3.9, vel: 715, cal: '7.62x39', bore: '762', sound: 'rifle_762',
    sp: [.0024, .1, .32, .8, .45, .045, .0038], rc: [1.2, 6, .3],
    spray: [[4, .1, 2.6, 'in'], [5, .9, 6.4], [6, -4.6, 1.4, 'out'], [8, 6.4, .8, 's'], [7, -4.0, .3, 's']],
    mt: 'omusgk', mdl: [.415, .88, 'curved', 'fixed', false, 'wood', { sights: 'iron', muzzle: 'brake', handguard: 'wood' }] }),
  G({ id: 'taiga', name: 'ZR-94 Taiga', maker: 'zavod', cat: 'rifle', arch: 'ak', role: 'allround',
    desc: 'Modernised 5.45 mm rifle with a side-folding stock and full-length rails; the small, fast round keeps the muzzle flat.',
    price: 2500, lvl: 11, dmg: 31, ap: .74, rpm: 650, modes: ['auto', 'semi'], mag: 30, res: 90, rl: [2.4, 3.0],
    draw: .95, ads: [.28, 1.2], range: 60, fo: .975, pen: 1.8, w: 3.6, vel: 880, cal: '5.45x39', bore: '556', sound: 'rifle_545',
    sp: [.0021, .095, .3, .8, .45, .045, .003], rc: [.9, 6.5, .22],
    spray: [[5, -.2, 2.6, 'in'], [4, -.5, 3.6], [5, -1.8, .7, 's'], [5, 2.4, .5, 's'], [5, -2.0, .4, 's'], [6, 1.6, .3, 's']],
    mt: 'omusgkb', mdl: [.415, .94, 'curved', 'folding', true, 'polymer', { sights: 'iron', muzzle: 'brake', handguard: 'quad' }] }),
  G({ id: 'warden', name: 'Ironbark Warden 556', maker: 'ironbark', cat: 'rifle', arch: 'ar15', role: 'allround',
    desc: 'Direct-impingement 5.56 carbine-length rifle: light, quick to the shoulder and endlessly modular.',
    price: 2900, lvl: 1, dmg: 32, ap: .70, rpm: 750, modes: ['auto', 'semi'], mag: 30, res: 90, rl: [2.4, 2.9],
    draw: .9, ads: [.26, 1.2], range: 60, fo: .97, pen: 2.0, w: 3.4, vel: 900, cal: '5.56x45', bore: '556', sound: 'rifle_556',
    sp: [.0022, .09, .3, .8, .45, .045, .003], rc: [.9, 6.5, .24],
    spray: [[4, -.1, 2.2, 'in'], [5, -.5, 4.8], [7, 3.2, 1.2, 's'], [7, -4.6, .7, 's'], [7, 3.0, .3, 's']],
    mt: 'omusgkb', mdl: [.368, .84, 'curved', 'collapsible', true, 'black', { sights: 'flip', muzzle: 'flash', handguard: 'mlok' }] }),
  G({ id: 'habicht', name: 'KR Habicht 556', maker: 'kr', cat: 'rifle', arch: 'ar_piston', role: 'allround',
    desc: 'Short-stroke piston 5.56 rifle with a heavy free-float barrel: runs cleaner and softer than a DI gun, at the cost of weight.',
    price: 3100, lvl: 22, dmg: 33, ap: .71, rpm: 780, modes: ['auto', 'semi'], mag: 30, res: 90, rl: [2.5, 3.0],
    draw: .95, ads: [.29, 1.2], range: 65, fo: .972, pen: 2.0, w: 3.8, vel: 890, cal: '5.56x45', bore: '556', sound: 'rifle_556',
    sp: [.002, .095, .3, .8, .45, .045, .0028], rc: [.85, 6.8, .2],
    spray: [[5, 0, 2.6, 'in'], [4, .8, 3.4, 'out'], [7, 2.2, .8, 's'], [7, -3.8, .5, 's'], [7, 2.2, .2, 's']],
    mt: 'omusgkb', mdl: [.368, .90, 'curved', 'collapsible', true, 'black', { sights: 'flip', muzzle: 'flash', handguard: 'quad', gas: 'piston' }] }),
  G({ id: 'lodjur', name: 'Norrhavn Lodjur 556', maker: 'norrhavn', cat: 'rifle', arch: 'bullpup_classic', role: 'precision',
    desc: 'Classic bullpup with a 1.5x optic built into the carry handle and a translucent magazine: long barrel, compact body.',
    price: 3300, lvl: 28, dmg: 31, ap: .72, rpm: 680, modes: ['auto', 'semi'], mag: 30, res: 90, rl: [3.0, 3.6],
    draw: 1.0, ads: [.3, 1.2], range: 70, fo: .975, pen: 2.0, w: 3.7, vel: 950, cal: '5.56x45', bore: '556', sound: 'rifle_556',
    sp: [.0019, .095, .3, .8, .42, .042, .0028], rc: [.85, 6.5, .22], scope: { zoom: 1.5, reticle: 'ring', levels: [1.5] },
    spray: [[5, .3, 3.0, 'in'], [4, -.6, 3.4], [7, -2.6, 1.0, 's'], [7, 3.4, .6, 's'], [7, -2.0, .4, 's']],
    mt: 'musgb', mdl: [.508, .79, 'curved', 'bullpup', false, 'od', { sights: 'scope', muzzle: 'flash', foregrip: 'folding' }] }),
  G({ id: 'kogarashi', name: 'Aokiri Type 30 Kogarashi', maker: 'aokiri', cat: 'rifle', arch: 'bullpup', role: 'cqb',
    desc: 'Modern ambidextrous 5.56 bullpup: short, fast-handling, a high cyclic rate and a full-length top rail.',
    price: 2850, lvl: 16, dmg: 30, ap: .70, rpm: 820, modes: ['auto', 'semi'], mag: 30, res: 90, rl: [2.9, 3.4],
    draw: .85, ads: [.24, 1.2], range: 55, fo: .965, pen: 1.9, w: 3.3, vel: 880, cal: '5.56x45', bore: '556', sound: 'rifle_556',
    sp: [.0024, .085, .3, .8, .45, .045, .0032], rc: [.95, 6.5, .26],
    spray: [[4, .3, 2.2, 'in'], [4, .9, 3.6], [6, 2.4, 1.0, 's'], [8, -4.4, .8, 's'], [8, 2.6, .4, 's']],
    mt: 'omusgb', mdl: [.46, .72, 'curved', 'bullpup', true, 'black', { sights: 'flip', muzzle: 'flash' }] }),
  G({ id: 'halberd', name: 'Ironbark Halberd 762', maker: 'ironbark', cat: 'rifle', arch: 'rifle_modular', role: 'heavy',
    desc: 'Modular 7.62x51 rifle on a monolithic upper: 20 heavy rounds that go through cover, armour and whatever is behind them.',
    price: 3200, lvl: 38, dmg: 40, ap: .82, rpm: 600, modes: ['auto', 'semi'], mag: 20, res: 80, rl: [2.6, 3.2],
    draw: 1.05, ads: [.31, 1.2], range: 75, fo: .982, pen: 2.5, w: 4.1, vel: 790, cal: '7.62x51', bore: '762', sound: 'br_308',
    sp: [.0021, .105, .33, .78, .42, .048, .0045], rc: [1.4, 5.8, .32],
    spray: [[4, .2, 3.6, 'in'], [4, -.6, 6.8], [6, -3.8, 1.8, 's'], [6, 4.6, 1.0, 's']],
    mt: 'omusgkb', mdl: [.406, .99, 'straight', 'folding', true, 'tan', { sights: 'flip', muzzle: 'flash', handguard: 'mlok' }] }),
  G({ id: 'tsubame', name: 'Aokiri Type 25 Tsubame', maker: 'aokiri', cat: 'rifle', arch: 'rifle_polymer', role: 'precision',
    desc: 'Burst-only 5.56: a hyper-burst action fires three rounds at 1000 rpm before the recoil reaches your shoulder, so the burst lands as one.',
    price: 2050, lvl: 5, dmg: 35, ap: .70, rpm: 1000, modes: ['burst'], burst: 3, brpm: 1000, bdel: .26, mag: 30, res: 90, rl: [2.7, 3.2],
    draw: .9, ads: [.27, 1.2], range: 60, fo: .98, pen: 2.0, w: 3.6, vel: 880, cal: '5.56x45', bore: '556', sound: 'rifle_556',
    sp: [.0019, .09, .3, .8, .42, .04, .002], rc: [.7, 6.5, .15], loop: 9,
    spray: [[3, .1, 1.5], [3, .3, 1.7], [3, -.5, 1.7], [3, .7, 1.5], [3, -.9, 1.3], [3, 1.0, 1.1], [3, -1.0, .9], [3, .8, .7], [3, -.6, .5], [3, .4, .4]],
    mt: 'omusgkb', mdl: [.45, .92, 'curved', 'fixed', true, 'polymer', { sights: 'carry', muzzle: 'flash', magClear: true }] }),
  G({ id: 'axion', name: 'Basalt Axion 68', maker: 'basalt', cat: 'rifle', arch: 'rifle_modular', role: 'heavy',
    desc: 'Next-generation 6.8 mm rifle with a high-pressure hybrid-case round: battle-rifle reach and penetration, 25 rounds, can-ready.',
    price: 3300, lvl: 52, dmg: 38, ap: .86, rpm: 640, modes: ['auto', 'semi'], mag: 25, res: 75, rl: [2.6, 3.2],
    draw: 1.05, ads: [.31, 1.2], range: 80, fo: .985, pen: 2.6, w: 4.4, vel: 910, cal: '6.8x51', bore: '762', sound: 'br_308', sf: true,
    sp: [.002, .1, .32, .78, .42, .046, .004], rc: [1.25, 5.8, .28],
    spray: [[4, .3, 3.4, 'in'], [4, .5, 5.8], [6, 3.4, 1.4, 's'], [6, -4.4, .9, 's'], [5, 2.6, .4, 's']],
    mt: 'omusgkb', mdl: [.33, .92, 'straight', 'collapsible', true, 'od', { sights: 'flip', muzzle: 'brake', handguard: 'mlok' }] }),

  // ============================================ CARBINES ============================================
  G({ id: 'switchback', name: 'Ironbark Switchback', maker: 'ironbark', cat: 'carbine', arch: 'ar15', role: 'cqb',
    desc: '10.5-inch 5.56 short-barrel rifle for room work: fast handling and a high cyclic rate, with a fireball for a muzzle flash.',
    price: 2600, lvl: 15, dmg: 30, ap: .68, rpm: 850, modes: ['auto', 'semi'], mag: 30, res: 90, rl: [2.3, 2.8],
    draw: .8, ads: [.23, 1.18], range: 45, fo: .955, pen: 1.8, w: 2.9, vel: 770, cal: '5.56x45', bore: '556', sound: 'rifle_556',
    sp: [.0026, .075, .28, .8, .48, .045, .0032], rc: [.85, 7, .25],
    spray: [[4, .2, 2.4, 'in'], [4, .5, 4.2], [7, 3.0, 1.2, 's'], [8, -4.0, .8, 's'], [7, 2.6, .3, 's']],
    mt: 'omusgkb', mdl: [.267, .72, 'curved', 'collapsible', true, 'black', { sights: 'flip', muzzle: 'flash', handguard: 'mlok' }] }),
  G({ id: 'morker', name: 'Norrhavn Mörker 300', maker: 'norrhavn', cat: 'carbine', arch: 'ar15', role: 'stealth',
    desc: 'Suppressor-optimised 7.62x35 carbine: a short barrel with rifle-class terminal effect that gives up almost nothing to a can.',
    price: 2800, lvl: 30, dmg: 34, ap: .68, rpm: 760, modes: ['auto', 'semi'], mag: 30, res: 90, rl: [2.4, 2.9],
    draw: .85, ads: [.25, 1.18], range: 45, fo: .94, pen: 1.6, w: 3.1, vel: 670, cal: '7.62x35', bore: '762', sound: 'rifle_762', sf: true,
    sp: [.0026, .078, .28, .8, .48, .045, .0034], rc: [.95, 6.8, .26],
    spray: [[4, -.2, 2.4, 'in'], [4, -.5, 4.4], [7, -2.6, 1.2, 's'], [8, 3.8, .7, 's'], [7, -2.4, .3, 's']],
    mt: 'omusgkb', mdl: [.229, .70, 'curved', 'collapsible', true, 'od', { sights: 'flip', muzzle: 'flash', handguard: 'mlok' }] }),
  G({ id: 'kroha', name: 'ZR-61K Kroha', maker: 'zavod', cat: 'carbine', arch: 'ak', role: 'cqb',
    desc: 'Compact 7.62x39 with an 8-inch barrel and a booster muzzle: a full-power punch that fits under a coat, if you can hold it down.',
    price: 1800, lvl: 7, dmg: 34, ap: .76, rpm: 700, modes: ['auto', 'semi'], mag: 30, res: 90, rl: [2.4, 3.0],
    draw: .85, ads: [.25, 1.18], range: 40, fo: .94, pen: 1.8, w: 3.0, vel: 610, cal: '7.62x39', bore: '762', sound: 'rifle_762',
    sp: [.0032, .08, .28, .8, .5, .05, .0045], rc: [1.15, 6.2, .38],
    spray: [[4, .2, 3.0, 'in'], [4, 1.0, 5.4], [7, -4.6, 1.6, 's'], [8, 5.4, .9, 's'], [7, -3.6, .4, 's']],
    mt: 'omusgk', mdl: [.21, .73, 'curved', 'folding', false, 'steel', { sights: 'iron', muzzle: 'booster', handguard: 'wood' }] }),
  G({ id: 'prairie', name: 'Calder Prairie 9', maker: 'calder', cat: 'carbine', arch: 'pcc', role: 'eco', kr: 600,
    desc: 'Wood-stocked 9 mm pistol-calibre carbine with a 16-inch barrel: the long tube gives pistol rounds real reach, and it barely kicks.',
    price: 1300, lvl: 2, dmg: 29, ap: .6, rpm: 700, modes: ['semi', 'auto'], mag: 30, res: 120, rl: [2.4, 2.9],
    draw: .8, ads: [.24, 1.18], range: 40, fo: .91, pen: 1.1, w: 3.0, vel: 430, cal: '9x19', bore: '9', sound: 'smg_9',
    sp: [.0024, .06, .25, .85, .5, .04, .0026], rc: [.5, 7.5, .2],
    spray: [[4, 0, 1.4, 'in'], [4, .3, 2.0], [8, 1.6, .8, 's'], [8, -2.0, .5, 's'], [8, 1.4, .3, 's']],
    mt: 'omusgb', mdl: [.406, .86, 'straight', 'fixed', true, 'wood', { sights: 'iron', muzzle: 'crown' }] }),

  // ============================================ BATTLE RIFLES ============================================
  G({ id: 'eisenhut', name: 'KR Eisenhut', maker: 'kr', cat: 'br', arch: 'br_roller', role: 'heavy',
    desc: 'Roller-delayed 7.62x51 battle rifle with a fluted chamber: it throws brass into the next room and kills through the wall of this one.',
    price: 3400, lvl: 19, dmg: 44, ap: .82, rpm: 550, modes: ['auto', 'semi'], mag: 20, res: 80, rl: [2.8, 3.5],
    draw: 1.1, ads: [.33, 1.22], range: 80, fo: .985, pen: 2.5, w: 4.6, vel: 800, cal: '7.62x51', bore: '762', sound: 'br_308',
    sp: [.0019, .11, .35, .76, .4, .05, .0055], rc: [1.55, 5.6, .32],
    spray: [[4, .1, 3.8, 'in'], [4, .9, 7.2], [6, 4.0, 1.6, 's'], [6, -4.8, 1.0, 's']],
    mt: 'omusgk', mdl: [.45, 1.02, 'straight', 'fixed', true, 'black', { sights: 'drum', muzzle: 'flash', handguard: 'polymer' }] }),
  G({ id: 'longhorn', name: 'Calder Longhorn', maker: 'calder', cat: 'br', arch: 'br_classic', role: 'precision',
    desc: 'Walnut-stocked 7.62x51 rifle with a rotating bolt and a 22-inch barrel: magnificent on semi, a wild animal on auto.',
    price: 3200, lvl: 5, dmg: 45, ap: .82, rpm: 700, modes: ['semi', 'auto'], mag: 20, res: 80, rl: [2.7, 3.4],
    draw: 1.15, ads: [.34, 1.25], range: 90, fo: .988, pen: 2.6, w: 4.7, vel: 850, cal: '7.62x51', bore: '762', sound: 'br_308',
    sp: [.0015, .115, .36, .76, .38, .05, .0065], rc: [1.7, 5.4, .4],
    spray: [[4, -.3, 4.2, 'in'], [4, -1.2, 7.8], [6, -4.4, 2.0, 's'], [6, 5.6, 1.2, 's']],
    mt: 'omusg', mdl: [.56, 1.12, 'straight', 'fixed', false, 'wood', { sights: 'aperture', muzzle: 'flash' }] }),
  G({ id: 'jarv', name: 'Norrhavn Järv 762', maker: 'norrhavn', cat: 'br', arch: 'bullpup', role: 'heavy',
    desc: 'Forward-ejecting 7.62x51 bullpup: battle-rifle power at carbine length, so it goes through doorways and still reaches across the map.',
    price: 3500, lvl: 36, dmg: 43, ap: .82, rpm: 650, modes: ['auto', 'semi'], mag: 20, res: 80, rl: [3.2, 3.8],
    draw: 1.1, ads: [.32, 1.22], range: 75, fo: .982, pen: 2.4, w: 4.5, vel: 820, cal: '7.62x51', bore: '762', sound: 'br_308',
    sp: [.0019, .1, .34, .76, .4, .05, .005], rc: [1.45, 5.6, .3],
    spray: [[4, .1, 3.4, 'in'], [4, .5, 6.6], [6, 3.6, 1.4, 's'], [6, -4.2, .8, 's']],
    mt: 'omusgb', mdl: [.46, .80, 'straight', 'bullpup', true, 'tan', { sights: 'flip', muzzle: 'flash', ejection: 'forward' }] }),

  // ============================================ SHOTGUNS (dmg is PER PELLET) ============================================
  G({ id: 'cacciatore', name: 'Morandi Cacciatore', maker: 'morandi', cat: 'shotgun', arch: 'pump', role: 'eco',
    desc: 'Walnut pump-action 12 gauge with an 8-shell tube: the classic room-clearer, one pump at a time.',
    price: 1050, lvl: 1, pel: 9, dmg: 26, ap: .5, rpm: 68, cycle: 'pump', mag: 8, res: 32, shell: [.45, .5, .4], draw: .85, ads: [.26, 1.1],
    range: 12, fo: .75, pen: .6, w: 3.6, vel: 400, cal: '12 ga 00 Buck', bore: '12g', sound: 'shotgun_12',
    sp: [.006, .04, .2, .9, .8, .04, 0], pellet: .036, rc: [4.2, 4.5, .5], spray: [[3, .5, 13.5]],
    mt: 'msg', mdl: [.51, 1.02, 'tube', 'fixed', false, 'wood', { sights: 'bead', muzzle: 'crown' }] }),
  G({ id: 'breachpoint', name: 'Ironbark Breachpoint 12', maker: 'ironbark', cat: 'shotgun', arch: 'pump', role: 'entry',
    desc: 'Tactical pump 12 gauge with a ghost-ring sight, side saddle and collapsible stock: tighter pattern, faster pump, fewer shells.',
    price: 1300, lvl: 17, pel: 8, dmg: 27, ap: .52, rpm: 80, cycle: 'pump', mag: 7, res: 32, shell: [.4, .45, .35], draw: .8, ads: [.24, 1.12],
    range: 14, fo: .77, pen: .6, w: 3.5, vel: 410, cal: '12 ga 00 Buck', bore: '12g', sound: 'shotgun_12',
    sp: [.005, .038, .2, .9, .78, .04, 0], pellet: .03, rc: [4.0, 4.6, .45], spray: [[3, .4, 12.6]],
    mt: 'omsgk', mdl: [.47, .96, 'tube', 'collapsible', true, 'black', { sights: 'ghost', muzzle: 'crown', saddle: true }] }),
  G({ id: 'tempesta', name: 'Morandi Tempesta', maker: 'morandi', cat: 'shotgun', arch: 'shotgun_semi', role: 'cqb',
    desc: 'Gas-operated semi-automatic 12 gauge: as fast as you can pull the trigger, as long as the seven shells last.',
    price: 1850, lvl: 27, pel: 6, dmg: 24, ap: .55, rpm: 240, mag: 7, res: 32, shell: [.4, .42, .35], chamber: .4, draw: .9, ads: [.27, 1.12],
    range: 13, fo: .75, pen: .6, w: 3.8, vel: 400, cal: '12 ga 00 Buck', bore: '12g', sound: 'shotgun_12',
    sp: [.0065, .04, .2, .9, .8, .045, .002], pellet: .034, rc: [3.0, 5, .5], spray: [[5, .6, 16]],
    mt: 'omusgk', mdl: [.47, 1.0, 'tube', 'collapsible', true, 'black', { sights: 'ghost', muzzle: 'crown' }] }),
  G({ id: 'raskat', name: 'ZR-12 Raskat', maker: 'zavod', cat: 'shotgun', arch: 'shotgun_drum', role: 'cqb',
    desc: 'Magazine-fed automatic 12 gauge on a long-stroke action with a 20-shell drum: the room is yours for four seconds.',
    price: 2000, lvl: 42, pel: 6, dmg: 19, ap: .55, rpm: 300, modes: ['auto', 'semi'], mag: 20, res: 40, rl: [3.3, 3.9],
    draw: 1.0, ads: [.3, 1.1], range: 10, fo: .75, pen: .5, w: 5.0, vel: 390, cal: '12 ga 00 Buck', bore: '12g', sound: 'shotgun_12',
    sp: [.0075, .045, .2, .9, .82, .055, .004], pellet: .042, rc: [2.6, 4.8, .6],
    spray: [[3, .1, 3.2, 'in'], [3, .8, 5.8], [7, 3.0, 2.0, 's'], [7, -3.6, 1.0, 's']],
    mt: 'omusk', mdl: [.48, .99, 'drum', 'folding', true, 'polymer', { sights: 'iron', muzzle: 'brake' }] }),
  G({ id: 'gemelli', name: 'Morandi Gemelli', maker: 'morandi', cat: 'shotgun', arch: 'shotgun_break', role: 'cqb',
    desc: 'Side-by-side coach gun with heavy 12-pellet magnum shells: one barrel at a time, or both at once in burst mode, then break it open.',
    price: 1100, lvl: 13, pel: 12, dmg: 26, ap: .5, rpm: 400, modes: ['semi', 'burst'], burst: 2, brpm: 1800, bdel: 0, mag: 2, res: 30,
    rl: [2.2, 2.6], rk: 'break', draw: .7, ads: [.24, 1.08],
    range: 9, fo: .75, pen: .6, w: 3.2, vel: 390, cal: '12 ga Magnum Buck', bore: '12g', sound: 'shotgun_12',
    sp: [.008, .036, .18, .9, .82, .04, 0], pellet: .05, rc: [5, 4, .6], spray: [[2, .6, 12]],
    mt: 'ms', mdl: [.46, .95, 'none', 'fixed', false, 'wood', { sights: 'bead', muzzle: 'crown', hammers: true, barrels: 2 }] }),
  G({ id: 'drover', name: 'Calder Drover', maker: 'calder', cat: 'shotgun', arch: 'shotgun_lever', role: 'entry',
    desc: 'Lever-action 12 gauge with a five-shell tube and a big loop lever; tight choke, quick cycle, and yes, you can flip-cock it.',
    price: 1250, lvl: 9, pel: 8, dmg: 27, ap: .5, rpm: 80, cycle: 'lever', mag: 5, res: 30, shell: [.45, .5, .35], chamber: .4,
    draw: .8, ads: [.25, 1.1], range: 12, fo: .76, pen: .6, w: 3.9, vel: 400, cal: '12 ga 00 Buck', bore: '12g', sound: 'shotgun_12',
    sp: [.006, .038, .2, .9, .8, .04, 0], pellet: .033, rc: [4.4, 4.4, .55], spray: [[3, -.4, 13.8]],
    mt: 'msg', mdl: [.51, .99, 'tube', 'fixed', false, 'wood', { sights: 'bead', muzzle: 'crown', lever: 'loop' }] }),

  // ============================================ MARKSMAN RIFLES ============================================
  G({ id: 'weitblick', name: 'KR Weitblick', maker: 'kr', cat: 'dmr', arch: 'ar15', role: 'precision',
    desc: 'Lightweight 5.56 marksman rifle with an 18-inch match barrel: quick follow-ups and quick handling, built for the mid-range.',
    price: 2900, lvl: 6, dmg: 40, ap: .72, rpm: 380, mag: 20, res: 80, rl: [2.5, 3.0],
    draw: .95, ads: [.3, 1.22], range: 95, fo: .985, pen: 2.0, w: 3.9, vel: 930, cal: '5.56x45 Match', bore: '556', sound: 'rifle_556',
    sp: [.008, .1, .32, .78, .15, .045, .008], rc: [1.3, 6, .25], br: [.0015, 2.5], spray: [[8, .3, 12]],
    mt: 'omusgkb', mdl: [.457, .98, 'straight', 'collapsible', true, 'tan', { sights: 'flip', muzzle: 'flash', handguard: 'mlok' }] }),
  G({ id: 'longreach', name: 'Ironbark Longreach 308', maker: 'ironbark', cat: 'dmr', arch: 'ar10', role: 'long',
    desc: 'Precision semi-automatic 7.62x51 on a large-frame AR action with a 20-inch free-float barrel: two to the body or one to the head.',
    price: 4000, lvl: 21, dmg: 52, ap: .82, rpm: 300, mag: 20, res: 60, rl: [2.8, 3.4],
    draw: 1.1, ads: [.34, 1.25], range: 110, fo: .99, pen: 2.5, w: 5.2, vel: 830, cal: '7.62x51', bore: '762', sound: 'dmr_762',
    sp: [.009, .12, .35, .75, .14, .05, .01], rc: [2.0, 5.5, .3], br: [.0016, 3.0], spray: [[8, .3, 16]],
    mt: 'omusgkb', mdl: [.508, 1.04, 'straight', 'collapsible', true, 'black', { sights: 'flip', muzzle: 'brake', handguard: 'mlok' }] }),
  G({ id: 'krechet', name: 'ZR-63 Krechet', maker: 'zavod', cat: 'dmr', arch: 'dmr_classic', role: 'long',
    desc: 'Skeleton-stocked 7.62x54R marksman rifle with a 24-inch barrel: ten rimmed full-power rounds that cross the whole map.',
    price: 3700, lvl: 29, dmg: 56, ap: .84, rpm: 260, mag: 10, res: 50, rl: [2.7, 3.3],
    draw: 1.15, ads: [.36, 1.25], range: 120, fo: .99, pen: 2.5, w: 4.6, vel: 830, cal: '7.62x54R', bore: '762', sound: 'dmr_762',
    sp: [.01, .13, .36, .75, .13, .05, .012], rc: [2.4, 5.2, .35], br: [.0018, 3.0], spray: [[6, -.4, 14.4]],
    mt: 'omusg', mdl: [.62, 1.22, 'straight', 'thumbhole', false, 'wood', { sights: 'iron', muzzle: 'flash' }] }),
  G({ id: 'penumbra', name: 'Basalt Penumbra', maker: 'basalt', cat: 'dmr', arch: 'dmr_integral', role: 'stealth',
    desc: 'Integrally suppressed 9x39 marksman rifle: a heavy subsonic bullet that arrives quietly and still goes through plate.',
    price: 3300, lvl: 37, dmg: 42, ap: .8, rpm: 600, modes: ['semi', 'auto'], mag: 20, res: 80, rl: [2.6, 3.1],
    draw: 1.0, ads: [.3, 1.22], range: 60, fo: .93, pen: 1.8, w: 3.2, vel: 295, cal: '9x39 Subsonic AP', bore: '762', sound: 'dmr_762', supp: true, tr: 0,
    sp: [.0035, .09, .3, .78, .3, .05, .0055], rc: [1.2, 6, .32], br: [.0014, 2.5],
    spray: [[4, .1, 2.4, 'in'], [4, .4, 4.0], [6, -2.4, 1.2, 's'], [6, 2.8, .6, 's']],
    mt: 'ousgk', mdl: [.20, .89, 'straight', 'thumbhole', true, 'wood', { sights: 'iron', muzzle: 'integral' }] }),

  // ============================================ SNIPER RIFLES (built-in scopes) ============================================
  G({ id: 'rook', name: 'Pembroke Rook Mk 4', maker: 'pembroke', cat: 'sniper', arch: 'bolt', role: 'long',
    desc: 'Lightweight 7.62x51 bolt-action with a short barrel and a 6x scope: light enough to run with, accurate enough to bet on.',
    price: 1900, lvl: 1, dmg: 82, ap: .85, rpm: 48, cycle: 'bolt', mag: 10, res: 30, rl: [2.7, 3.4],
    draw: 1.1, ads: [.3, 1.2], range: 150, fo: .99, pen: 2.6, w: 3.6, vel: 820, cal: '7.62x51', bore: '762', sound: 'br_308',
    sp: [.035, .12, .35, .7, .007, .05, 0], rc: [4.5, 4, .4], br: [.0028, 5.0], spray: [[2, .3, 7]],
    scope: { zoom: 6, reticle: 'duplex', levels: [2.5, 6] },
    mt: 'omug', mdl: [.51, 1.0, 'box', 'fixed', true, 'od', { sights: 'scope', muzzle: 'crown' }] }),
  G({ id: 'arbiter', name: 'Pembroke Arbiter Mk 2', maker: 'pembroke', cat: 'sniper', arch: 'bolt', role: 'long', kr: 100,
    desc: 'Long-action 8.6x70 bolt rifle on a folding chassis with an 8x scope: one hit anywhere above the belt is one kill, armour or not.',
    price: 4750, lvl: 25, dmg: 118, ap: .92, rpm: 41, cycle: 'bolt', mag: 5, res: 30, rl: [3.3, 3.8],
    draw: 1.4, ads: [.36, 1.2], range: 250, fo: .995, pen: 2.9, w: 6.9, vel: 900, cal: '8.6x70', bore: '338', sound: 'sniper_338',
    sp: [.05, .16, .4, .7, .005, .06, 0], rc: [6, 3.5, .5], br: [.0032, 5.5], spray: [[2, .4, 9]],
    scope: { zoom: 8, reticle: 'mildot', levels: [4, 8] },
    mt: 'omug', mdl: [.69, 1.2, 'box', 'folding', true, 'od', { sights: 'scope', muzzle: 'brake', chassis: true }] }),
  G({ id: 'richter', name: 'KR Richter 338', maker: 'kr', cat: 'sniper', arch: 'sniper_semi', role: 'long', kr: 200,
    desc: 'Semi-automatic 8.6x70 precision rifle: two hits kill through any vest, and the second one arrives before they can move.',
    price: 5000, lvl: 45, dmg: 86, ap: .9, rpm: 180, mag: 10, res: 40, rl: [3.1, 3.7],
    draw: 1.4, ads: [.38, 1.2], range: 200, fo: .993, pen: 2.8, w: 6.6, vel: 880, cal: '8.6x70', bore: '338', sound: 'sniper_338',
    sp: [.045, .15, .4, .7, .006, .06, .006], rc: [4.4, 4.2, .5], br: [.003, 4.5], spray: [[6, .6, 24]],
    scope: { zoom: 6, reticle: 'bdc', levels: [3, 6] },
    mt: 'omugk', mdl: [.61, 1.15, 'box', 'collapsible', true, 'tan', { sights: 'scope', muzzle: 'brake' }] }),
  G({ id: 'bjorn', name: 'Norrhavn Björn 50', maker: 'norrhavn', cat: 'sniper', arch: 'bolt_am', role: 'heavy', kr: 100,
    desc: 'Anti-materiel 12.7x99 bolt-action with a fist-sized muzzle brake: it kills through walls, through armour, through anything — slowly.',
    price: 5250, lvl: 60, dmg: 165, ap: .98, rpm: 30, cycle: 'bolt', mag: 5, res: 20, rl: [4.2, 4.8],
    draw: 1.8, ads: [.48, 1.2], range: 400, fo: .997, pen: 3.0, w: 13.2, vel: 860, cal: '12.7x99', bore: '50', sound: 'sniper_50',
    sp: [.06, .2, .5, .65, .005, .07, 0], rc: [9, 2.8, .7], br: [.0038, 4.0], spray: [[2, .5, 12]], am: .4,
    scope: { zoom: 10, reticle: 'mildot_fine', levels: [5, 10] },
    mt: 'oug', mdl: [.737, 1.45, 'box', 'fixed', true, 'black', { sights: 'scope', muzzle: 'brake', bipod: true }] }),

  // ============================================ MACHINE GUNS ============================================
  G({ id: 'varg', name: 'Norrhavn Varg 556', maker: 'norrhavn', cat: 'lmg', arch: 'belt_lmg', role: 'support',
    desc: 'Belt-fed 5.56 light machine gun with a 100-round soft pouch: a long, heavy gun that turns any corner into a no-go zone.',
    price: 4200, lvl: 23, dmg: 32, ap: .72, rpm: 800, modes: ['auto'], mag: 100, res: 200, rl: [5.6, 6.2], rk: 'belt',
    draw: 1.4, ads: [.45, 1.18], range: 70, fo: .97, pen: 2.0, w: 8.0, vel: 915, cal: '5.56x45', bore: '556', sound: 'lmg_556',
    sp: [.004, .12, .38, .72, .5, .06, .0032], rc: [1.0, 5.5, .32], loop: 15,
    spray: [[5, .2, 2.6, 'in'], [5, .6, 4.8], [8, 3.4, 1.4, 's'], [8, -4.6, 1.0, 's'], [7, 3.6, .5, 's'], [7, -2.8, .3, 's']],
    mt: 'omusgkb', mdl: [.465, 1.04, 'belt', 'collapsible', true, 'black', { sights: 'iron', muzzle: 'flash', bipod: true, ammo: 'pouch' }] }),
  G({ id: 'kuznets', name: 'ZR-70 Kuznets', maker: 'zavod', cat: 'lmg', arch: 'belt_lmg', role: 'support',
    desc: 'General-purpose 7.62x54R machine gun fed from a 100-round box: slow, ruinously heavy, impossible to stand in front of.',
    price: 5200, lvl: 35, dmg: 40, ap: .84, rpm: 650, modes: ['auto'], mag: 100, res: 200, rl: [6.0, 6.6], rk: 'belt',
    draw: 1.6, ads: [.5, 1.18], range: 80, fo: .98, pen: 2.5, w: 9.4, vel: 825, cal: '7.62x54R', bore: '762', sound: 'lmg_762', tc: TRACER_RED,
    sp: [.0045, .13, .4, .7, .5, .065, .004], rc: [1.3, 5.2, .38], loop: 15,
    spray: [[5, -.2, 3.4, 'in'], [5, -.8, 6.2], [8, -4.2, 1.8, 's'], [8, 5.4, 1.0, 's'], [7, -4.0, .6, 's'], [7, 3.0, .3, 's']],
    mt: 'omusgb', mdl: [.605, 1.19, 'box', 'fixed', true, 'steel', { sights: 'iron', muzzle: 'flash', bipod: true, ammo: 'box', stockWood: true }] }),
  G({ id: 'mula', name: 'Gallo Mula', maker: 'gallo', cat: 'lmg', arch: 'lmg_mag', role: 'support',
    desc: 'Heavy-barrel 7.62x39 squad rifle with a 75-round drum and a bipod: an assault rifle that forgot to stop.',
    price: 3500, lvl: 8, dmg: 35, ap: .77, rpm: 600, modes: ['auto', 'semi'], mag: 75, res: 150, rl: [3.8, 4.5],
    draw: 1.3, ads: [.4, 1.2], range: 65, fo: .972, pen: 2.0, w: 6.0, vel: 745, cal: '7.62x39', bore: '762', sound: 'lmg_762', tc: TRACER_GREEN,
    sp: [.0032, .11, .36, .74, .48, .055, .0035], rc: [1.1, 5.6, .32], loop: 15,
    spray: [[5, .2, 3.0, 'in'], [5, .5, 5.6], [8, -3.8, 1.4, 's'], [8, 4.8, .8, 's'], [7, -3.4, .4, 's'], [7, 2.6, .2, 's']],
    mt: 'omusgk', mdl: [.59, 1.05, 'drum', 'fixed', false, 'wood', { sights: 'iron', muzzle: 'brake', bipod: true }] }),
];

/* MELEE. slash = quick primary attack, stab = heavy alt attack (wind-up). backstab = damage from behind (|angle| > 110 deg from the
   victim's facing): slashBack / stabBack. dmg / backstab / rpm / range mirror slash.dmg / stab.back / slash rate / slash range for code
   that only reads the stub fields. arc = horizontal hit sweep (rad). throw = null or a thrown attack (the tomahawk). */
function M(o) {
  return { id: o.id, name: o.name, maker: MAKERS[o.maker].name, makerId: o.maker, cat: 'melee', slot: 'melee', archetype: o.arch, role: 'melee',
    desc: o.desc, price: o.price, killReward: 1500, unlockLevel: o.lvl, team: 0,
    dmg: o.slash.dmg, backstab: o.stab.back, rpm: Math.round(60 / o.slash.rate), range: o.slash.range, armorPen: o.ap,
    speed: o.speed, weight: o.w, draw: o.draw, slash: o.slash, stab: o.stab, throw: o.throw || null, sound: o.sound,
    modes: [], mag: 0, reserve: 0, model: o.model };
}
export const MELEE = [
  M({ id: 'knife', name: 'Ironbark Fieldline', maker: 'ironbark', arch: 'knife', price: 0, lvl: 1, ap: .85, speed: 6.0, w: .3, draw: .4,
    desc: 'Drop-point fixed-blade combat knife: three quick slashes or two stabs from the front, one stab from behind.',
    slash: { dmg: 34, back: 90, rate: .42, range: 1.55, arc: .9 }, stab: { dmg: 62, back: 180, rate: 1.0, windup: .22, range: 1.4 },
    sound: 'knife', model: { length: .29, blade: .165, finish: 'black', handle: 'polymer' } }),
  M({ id: 'zafra', name: 'Gallo Zafra', maker: 'gallo', arch: 'machete', price: 300, lvl: 12, ap: .7, speed: 5.9, w: .7, draw: .55,
    desc: 'Cane-cutter machete with a hooked tip: long reach and wide arcs, slow to recover after the heavy chop.',
    slash: { dmg: 45, back: 110, rate: .6, range: 1.95, arc: 1.15 }, stab: { dmg: 80, back: 180, rate: 1.25, windup: .35, range: 1.85 },
    sound: 'machete', model: { length: .6, blade: .46, finish: 'steel', handle: 'wood' } }),
  M({ id: 'ridgehawk', name: 'Calder Ridgehawk', maker: 'calder', arch: 'tomahawk', price: 500, lvl: 30, ap: .9, speed: 5.9, w: .65, draw: .5,
    desc: 'Tactical tomahawk with a breaching spike: a heavy overhead blow, and it can be thrown (pick it back up where it lands).',
    slash: { dmg: 50, back: 120, rate: .65, range: 1.7, arc: .8 }, stab: { dmg: 95, back: 180, rate: 1.3, windup: .38, range: 1.6 },
    throw: { dmg: 120, back: 180, speed: 24, gravity: 1, spin: 14, retrieve: true, windup: .45 },
    sound: 'axe', model: { length: .4, blade: .09, finish: 'black', handle: 'g10' } }),
];

export const ALIASES = { p9: 'vogt9', vk47: 'purga' };
export const DEFAULT_LOADOUT = { primary: 'warden', secondary: 'vogt9', melee: 'knife', nades: ['frag', 'flash'] };
export const MOVE_FREE = .34;

const BY_ID = new Map();
for (const g of GUNS) BY_ID.set(g.id, g);
for (const m of MELEE) BY_ID.set(m.id, m);
export const getGun = id => BY_ID.get(ALIASES[id] || id) || null;
export const getMelee = id => { const g = getGun(id); return g && g.cat === 'melee' ? g : null; };
export const gunsBy = cat => GUNS.filter(g => g.cat === cat);

export const ARCHETYPES = {};
for (const [id, desc] of Object.entries(ARCH_DESC)) ARCHETYPES[id] = { desc, cats: [], guns: [] };
for (const g of [...GUNS, ...MELEE]) { const a = ARCHETYPES[g.archetype]; if (!a) continue; a.guns.push(g.id); if (!a.cats.includes(g.cat)) a.cats.push(g.cat); }

/** Seconds between two shots in `mode` (default: the gun's default mode). Burst = interval inside the burst. */
export function fireInterval(gun, mode = gun.modes && gun.modes[0]) {
  if (!gun.rpm) return 1;
  return 60 / (mode === 'burst' && gun.burstRpm ? gun.burstRpm : gun.rpm);
}

/** Cone half-angle (radians). state: speedFrac = horizontal speed / gun.speed, air = airborne, crouch 0..1, ads 0..1, bloom = rad. */
export function spreadAt(gun, { speedFrac = 0, air = false, crouch = 0, ads = 0, bloom = 0 } = {}) {
  const s = gun.spread; if (!s) return 0;
  let c = Math.min(s.base + bloom, s.max);
  c *= 1 + (s.crouch - 1) * crouch;
  c *= s.hip + (s.ads - s.hip) * ads;
  const mv = Math.max(0, (Math.min(speedFrac, 1.25) - MOVE_FREE) / (1 - MOVE_FREE));
  c += s.move * mv * (1 - .25 * ads);
  if (air) c += s.air;
  return c;
}

/** Deterministic recoil step (degrees, [right, up]) applied after shot i (0-based) of a continuous spray. Past the end of the pattern
    the last `loop` steps repeat with x mirrored on every other repetition (so long belts sway left/right instead of drifting). */
export function recoilStep(gun, i) {
  const p = gun.recoil && gun.recoil.pattern; if (!p || !p.length) return [0, 0];
  if (i < p.length) return p[i];
  const L = Math.max(1, Math.min(gun.recoil.loop || 1, p.length)), k = i - p.length;
  const s = p[p.length - L + (k % L)], flip = Math.floor(k / L) % 2 === 0;
  return [flip ? -s[0] : s[0], s[1]];
}
