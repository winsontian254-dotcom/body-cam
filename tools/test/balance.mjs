// LIVE FIRE — weapon / attachment / grenade data validation and balance report (Node, no browser needed).
//   node tools/test/balance.mjs              validate everything, print TTK tables and outlier flags (exit 1 on errors)
//   node tools/test/balance.mjs --md         also print the markdown tables used in docs/WEAPONS.md
//   node tools/test/balance.mjs --write-doc  rewrite the generated tables between the markers in docs/WEAPONS.md
//   node tools/test/balance.mjs --shots      write tools/test/out/weapons/report.html (spray patterns, bars) and screenshot it
//   --quiet                                  only errors, warnings and the summary
import path from 'node:path'; import url from 'node:url'; import fs from 'node:fs';
const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '../..');
const imp = p => import(url.pathToFileURL(path.join(ROOT, p)).href);
const D = await imp('js/weapons/data.js'), A = await imp('js/weapons/attachments.js'), N = await imp('js/grenades/data.js');
const args = new Set(process.argv.slice(2)), QUIET = args.has('--quiet');

const errors = [], warns = [], flags = [];
const err = (where, msg) => errors.push(where + ': ' + msg), warn = (where, msg) => warns.push(where + ': ' + msg);
const isNum = v => typeof v === 'number' && Number.isFinite(v);
const inR = (v, a, b) => isNum(v) && v >= a && v <= b;
const fmt = (v, d = 2) => (v === Infinity ? '∞' : isNum(v) ? (v > 10 ? '>10' : v.toFixed(d)) : String(v));
const median = a => { const s = [...a].filter(Number.isFinite).sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : NaN; };

// ------------------------------------------------------------------ guns ------------------------------------------------------------------
const GUN_FIELDS = { id: 'string', name: 'string', maker: 'string', makerId: 'string', cat: 'string', slot: 'string', archetype: 'string', role: 'string',
  desc: 'string', price: 'number', killReward: 'number', unlockLevel: 'number', team: 'number', dmg: 'number', armorPen: 'number', rpm: 'number',
  modes: 'array', burst: 'number', burstRpm: 'number', burstDelay: 'number', mag: 'number', reserve: 'number', pellets: 'number', reload: 'number',
  reloadEmpty: 'number', reloadKind: 'string', shell: 'object?', cycle: 'string?', draw: 'number', adsTime: 'number', adsFov: 'number', adsMove: 'number',
  range: 'number', falloff: 'number', pen: 'number', weight: 'number', speed: 'number', velocity: 'number', spread: 'object', recoil: 'object',
  breath: 'object', sound: 'string', caliber: 'string', bore: 'string', tracer: 'number', tracerColor: 'array', suppressed: 'boolean',
  suppressorFriendly: 'boolean', scope: 'object?', mounts: 'object', model: 'object' };
function typeOk(v, t) {
  const opt = t.endsWith('?'); if (opt && v === null) return true; const b = opt ? t.slice(0, -1) : t;
  return b === 'array' ? Array.isArray(v) : b === 'object' ? v !== null && typeof v === 'object' && !Array.isArray(v) : typeof v === b && (b !== 'number' || Number.isFinite(v));
}
// realistic windows per category: rpm, velocity m/s, dmg (per bullet or pellet), range m, falloff, adsTime, reload, mag
const WIN = {
  pistol:  { rpm: [120, 1000], vel: [250, 500], dmg: [18, 60], range: [14, 45], fo: [.75, .95], ads: [.12, .25], rl: [1.6, 3.4], mag: [5, 22] },
  smg:     { rpm: [600, 1200], vel: [270, 750], dmg: [20, 36], range: [14, 35], fo: [.75, .92], ads: [.15, .27], rl: [2.0, 3.8], mag: [20, 64] },
  rifle:   { rpm: [550, 1000], vel: [650, 1000], dmg: [28, 42], range: [45, 90], fo: [.95, .99], ads: [.22, .34], rl: [2.2, 3.8], mag: [20, 32] },
  carbine: { rpm: [600, 900], vel: [400, 900], dmg: [26, 36], range: [35, 60], fo: [.88, .975], ads: [.2, .3], rl: [2.1, 3.3], mag: [20, 32] },
  br:      { rpm: [500, 750], vel: [750, 900], dmg: [40, 48], range: [65, 100], fo: [.97, .995], ads: [.3, .38], rl: [2.5, 4.0], mag: [10, 20] },
  shotgun: { rpm: [60, 420], vel: [350, 450], dmg: [15, 32], range: [8, 16], fo: [.7, .8], ads: [.2, .32], rl: [2, 6], mag: [2, 25] },
  dmr:     { rpm: [240, 700], vel: [280, 1000], dmg: [38, 60], range: [55, 130], fo: [.92, .995], ads: [.26, .4], rl: [2.3, 3.6], mag: [10, 25] },
  sniper:  { rpm: [25, 200], vel: [780, 950], dmg: [75, 170], range: [140, 450], fo: [.985, .999], ads: [.28, .55], rl: [2.5, 5], mag: [5, 10] },
  lmg:     { rpm: [550, 900], vel: [700, 950], dmg: [30, 42], range: [60, 90], fo: [.96, .99], ads: [.38, .55], rl: [3.5, 7], mag: [60, 150] },
};
const BANNED = /\b(glock|colt|kalashnikov|heckler|koch|h&k|sig\s?sauer|fn\s?herstal|beretta|remington|winchester|desert eagle|barrett|benelli|mossberg|ruger|smith\s?&\s?wesson|walther|steyr|imi|izhmash|kriss|vector|famas|aug|scar|ak-?47|akm|ak-?74|ak-?12|m4a1|m16|mp5|mp7|ump|p90|g36|g3|m249|m240|pkm|negev|awp|awm|m14|m1911|uzi|mac-?10|tavor|galil|dragunov|svd|vss|aa-?12|saiga|spas|m870|m1014|xm1014|deagle|five-?seven|tec-?9|cz75|usp|p226|p250|m82|l96|ssg|sten|thompson|tommy|vandal|phantom|operator|outlaw|marshal|sheriff|spectre|stinger|bulldog|guardian|odin|ares|judge|bucky|frenzy|hemlok|kraber|wingman|peacekeeper|mastiff|flatline|spitfire|devotion|havoc|longbow|r-?301|r-?99|eva-?8|mozambique)\b/i;

const D_ALL = [...D.GUNS, ...D.MELEE];
const ids = new Set(), names = new Set();
for (const g of D_ALL) {
  if (ids.has(g.id)) err(g.id, 'duplicate id'); ids.add(g.id);
  if (names.has(g.name)) err(g.id, 'duplicate name'); names.add(g.name);
  if (BANNED.test(g.name) || BANNED.test(g.desc) || BANNED.test(g.maker)) err(g.id, 'real-world / other-game brand or model name in name/desc/maker: ' + (g.name + ' ' + g.desc).match(BANNED)[0]);
  if (!/^[a-z][a-z0-9_]*$/.test(g.id)) err(g.id, 'id must be lowercase [a-z0-9_]');
}
if (D.GUNS.length !== 50) err('GUNS', 'expected 50 guns, got ' + D.GUNS.length);
const WANT = { pistol: 9, smg: 8, rifle: 9, carbine: 4, br: 3, shotgun: 6, dmr: 4, sniper: 4, lmg: 3 };
for (const [c, n] of Object.entries(WANT)) { const k = D.gunsBy(c).length; if (k !== n) err('GUNS', `category ${c}: ${k} guns, brief wants ${n}`); }
const makersUsed = new Set(D.GUNS.map(g => g.makerId));
if (makersUsed.size < 8 || makersUsed.size > 10) err('MAKERS', `${makersUsed.size} makers used (want 8-10)`);

for (const g of D.GUNS) {
  const w = g.id, win = WIN[g.cat];
  for (const [k, t] of Object.entries(GUN_FIELDS)) if (!(k in g)) err(w, 'missing field ' + k); else if (!typeOk(g[k], t)) err(w, `field ${k} should be ${t}, got ${JSON.stringify(g[k])}`);
  if (!D.CATEGORIES.includes(g.cat)) err(w, 'bad cat ' + g.cat);
  if (g.slot !== (g.cat === 'pistol' ? 'secondary' : 'primary')) err(w, 'slot ' + g.slot);
  if (!D.MAKERS[g.makerId]) err(w, 'unknown maker'); if (!D.ARCHETYPES[g.archetype]) err(w, 'archetype not in ARCHETYPES: ' + g.archetype);
  if (!D.SOUND_FAMILIES.includes(g.sound)) err(w, 'sound family not in docs §9: ' + g.sound);
  if (g.team !== 0) warn(w, 'team-restricted (team ' + g.team + ')');
  if (!inR(g.unlockLevel, 1, 60) || !Number.isInteger(g.unlockLevel)) err(w, 'unlockLevel ' + g.unlockLevel);
  if (!g.desc || g.desc.length < 30 || g.desc.length > 170) err(w, 'desc length ' + (g.desc || '').length);
  if (!inR(g.armorPen, .25, 1)) err(w, 'armorPen ' + g.armorPen); if (!inR(g.pen, .2, 3)) err(w, 'pen ' + g.pen);
  if (!inR(g.falloff, .7, .999)) err(w, 'falloff ' + g.falloff);
  if (!inR(g.rpm, win.rpm[0], win.rpm[1])) err(w, `rpm ${g.rpm} outside ${win.rpm}`);
  if (!inR(g.velocity, win.vel[0], win.vel[1])) err(w, `velocity ${g.velocity} outside ${win.vel}`);
  if (!inR(g.dmg, win.dmg[0], win.dmg[1])) err(w, `dmg ${g.dmg} outside ${win.dmg}`);
  if (!inR(g.range, win.range[0], win.range[1])) err(w, `range ${g.range} outside ${win.range}`);
  if (!inR(g.falloff, win.fo[0], win.fo[1])) err(w, `falloff ${g.falloff} outside ${win.fo}`);
  if (!inR(g.adsTime, win.ads[0], win.ads[1])) err(w, `adsTime ${g.adsTime} outside ${win.ads}`);
  if (!inR(g.reload, win.rl[0], win.rl[1])) err(w, `reload ${g.reload} outside ${win.rl}`);
  if (!inR(g.mag, win.mag[0], win.mag[1])) err(w, `mag ${g.mag} outside ${win.mag}`);
  if (g.reloadEmpty < g.reload) err(w, 'reloadEmpty < reload');
  if (!inR(g.draw, .35, 2)) err(w, 'draw ' + g.draw); if (!inR(g.adsFov, 1, 1.6)) err(w, 'adsFov ' + g.adsFov);
  if (!inR(g.adsMove, .3, .9)) err(w, 'adsMove ' + g.adsMove);
  if (!inR(g.reserve, g.mag, Math.max(g.mag * 8, 40))) err(w, 'reserve ' + g.reserve);
  if (Math.abs(g.speed - D.speedFromWeight(g.weight)) > .001) err(w, `speed ${g.speed} != speedFromWeight(${g.weight})`);
  if (!inR(g.weight, .4, 15)) err(w, 'weight ' + g.weight);
  // fire modes
  for (const m of g.modes) if (!['auto', 'semi', 'burst'].includes(m)) err(w, 'mode ' + m);
  if (!g.modes.length) err(w, 'no fire mode');
  if (g.modes.includes('burst')) { if (!(g.burst >= 2) || !(g.burstRpm > 0) || !(g.burstDelay >= 0)) err(w, 'burst fields'); }
  else if (g.burst || g.burstRpm || g.burstDelay) err(w, 'burst fields set without a burst mode');
  if (g.cycle && !['pump', 'bolt', 'lever'].includes(g.cycle)) err(w, 'cycle ' + g.cycle);
  if (g.cycle && g.modes.includes('auto')) err(w, 'manual action with auto mode');
  if (!['mag', 'shell', 'cylinder', 'belt', 'break'].includes(g.reloadKind)) err(w, 'reloadKind ' + g.reloadKind);
  if ((g.reloadKind === 'shell') !== !!g.shell) err(w, 'shell data must exist exactly for reloadKind shell');
  if (g.shell && Math.abs(g.reload - (g.shell.start + g.shell.per * g.mag + g.shell.end)) > .011) err(w, 'shell reload sum');
  // shotguns
  if (g.cat === 'shotgun') { if (!(g.pellets >= 6 && g.pellets <= 12) || !(g.spread.pellet > .02 && g.spread.pellet < .07)) err(w, 'shotgun pellets/pellet spread'); }
  else if (g.pellets !== 1 || g.spread.pellet !== 0) err(w, 'non-shotgun with pellets');
  // spread
  const sp = g.spread;
  for (const k of ['base', 'move', 'air', 'crouch', 'ads', 'max', 'shot', 'hip', 'pellet']) if (!isNum(sp[k]) || sp[k] < 0) err(w, 'spread.' + k);
  if (!(sp.base > 0 && sp.base < .07) || !(sp.max >= sp.base) || !(sp.crouch > .5 && sp.crouch <= 1) || !(sp.ads > 0 && sp.ads <= 1) || sp.hip !== 1) err(w, 'spread values ' + JSON.stringify(sp));
  if (!(sp.move > sp.base) || !(sp.air > sp.move)) err(w, 'spread: move should exceed base and air should exceed move');
  // recoil
  const rc = g.recoil, P = rc.pattern;
  if (!Array.isArray(P) || P.some(s => !Array.isArray(s) || s.length !== 2 || !isNum(s[0]) || !isNum(s[1]))) err(w, 'recoil.pattern malformed');
  const auto = g.modes.includes('auto') || g.modes[0] === 'burst';
  if (auto) { if (P.length < 20 || P.length > 40) err(w, 'automatic pattern must have 20-40 steps, has ' + P.length);
    if (P.length < Math.min(g.mag, 40)) err(w, `pattern ${P.length} shorter than min(mag ${g.mag}, 40)`);
    const v = P.slice(0, 8).reduce((a, s) => a + s[1], 0), late = P.slice(-10), lv = late.reduce((a, s) => a + s[1], 0), lh = late.reduce((a, s) => a + Math.abs(s[0]), 0);
    if (!(v > 2)) err(w, 'no vertical climb in the first 8 shots');
    if (!(lh > lv * .6)) warn(w, `late pattern is not sideways (|dx| ${lh.toFixed(2)} vs dy ${lv.toFixed(2)})`);
  } else if (P.length < 2 || P.length > 12) err(w, 'semi pattern 2-12 steps, has ' + P.length);
  if (!inR(rc.kick, .2, 12) || !inR(rc.recover, 2, 12) || !inR(rc.random, .05, 1) || !inR(rc.loop, 1, P.length)) err(w, 'recoil kick/recover/random/loop');
  for (let i = 0; i < 260; i++) { const s = D.recoilStep(g, i); if (!isNum(s[0]) || !isNum(s[1])) { err(w, 'recoilStep NaN at ' + i); break; } }
  // breath / scope / mounts
  if (!inR(g.breath.sway, 0, .006) || !inR(g.breath.hold, 0, 8)) err(w, 'breath');
  if (g.cat === 'sniper') { if (!g.scope || !(g.scope.zoom >= 4) || !D.RETICLES.includes(g.scope.reticle) || !(g.breath.hold >= 3)) err(w, 'sniper needs a built-in scope >= 4x and hold-breath'); }
  if (g.scope && (!Array.isArray(g.scope.levels) || !g.scope.levels.includes(g.scope.zoom))) err(w, 'scope.levels must include zoom');
  if (g.cat === 'dmr' && !(g.breath.hold > 0)) err(w, 'DMR without hold-breath');
  if (g.archetype === 'revolver') { const magnum = g.bore === 'mag'; if (g.mounts.optic !== magnum) err(w, 'revolver optic mount: only the magnum has a rail'); if (g.mounts.mag) err(w, 'revolver with mag mount'); }
  if (g.suppressed && g.mounts.muzzle) err(w, 'integrally suppressed gun with a muzzle mount');
  if (g.model.stock === 'bullpup' && g.mounts.stock) err(w, 'bullpup with a stock mount');
  if (g.model.stock === 'none' && g.mounts.stock) err(w, 'no stock but stock mount');
  if (g.mounts.optic && !g.model.rail && !['ak', 'smg_classic', 'shotgun_lever', 'dmr_classic', 'pistol_singlestack', 'br_classic', 'lmg_mag', 'smg_stamped', 'pump'].includes(g.archetype)) warn(w, 'optic mount without a rail hint (side mount assumed)');
  const m = g.model;
  if (!inR(m.barrel, .05, .8) || !inR(m.length, .14, 1.6) || !(m.length > m.barrel) || !['straight', 'curved', 'drum', 'box', 'tube', 'belt', 'cylinder', 'none'].includes(m.mag)
    || !['fixed', 'folding', 'collapsible', 'none', 'bullpup', 'thumbhole'].includes(m.stock) || typeof m.rail !== 'boolean' || !['black', 'tan', 'od', 'wood', 'polymer', 'steel'].includes(m.finish)) err(w, 'model hints ' + JSON.stringify(m));
  if (!inR(g.tracer, 0, 5) || g.tracerColor.length !== 3) err(w, 'tracer');
  // economy
  const [plo, phi] = D.CATEGORY_INFO[g.cat].price;
  if (!inR(g.price, plo, phi)) err(w, `price ${g.price} outside ${g.cat} band ${plo}-${phi}`);
  if (g.price % 50) err(w, 'price not a multiple of 50');
  if (!inR(g.killReward, 50, 1500)) err(w, 'killReward');
}
// category-level economy rules from the brief
const byCat = Object.fromEntries(D.CATEGORIES.map(c => [c, D.gunsBy(c)]));
if (byCat.smg.filter(g => g.killReward >= 600).length < 6) err('economy', 'most SMGs should pay a high kill reward (600)');
if (byCat.shotgun.some(g => g.killReward < 900)) err('economy', 'shotguns pay the bonus kill reward (900)');
{ const heavy = byCat.sniper.filter(g => g.cycle === 'bolt').sort((a, b) => b.price - a.price);
  const awp = byCat.sniper.find(g => g.bore === '338' && g.cycle === 'bolt');
  if (!awp || Math.abs(awp.price - 4750) > 250 || awp.killReward > 150) err('economy', 'heavy .338 bolt sniper should cost ~4750 with a low kill reward');
  if (!heavy.length) err('economy', 'no bolt snipers'); }
for (const c of D.CATEGORIES) { const early = byCat[c].filter(g => g.unlockLevel <= 8); if (!early.length) err('unlocks', `no ${c} unlocked by level 8`); }
for (const c of ['pistol', 'smg', 'rifle', 'shotgun', 'sniper']) if (!byCat[c].some(g => g.unlockLevel === 1)) err('unlocks', `no level-1 ${c}`);
{ const lv = D.GUNS.map(g => g.unlockLevel); if (Math.max(...lv) < 50) err('unlocks', 'unlock levels should spread up to 60'); }
// calibre consistency (armour and wall penetration follow the cartridge)
{ const byBore = {}; for (const g of D.GUNS) (byBore[g.bore] ||= []).push(g);
  const ORDER = ['rim', '9', 'pdw', '556', '762', '338', '50'];
  const avg = b => byBore[b] ? byBore[b].reduce((a, g) => a + g.pen, 0) / byBore[b].length : NaN;
  for (let i = 1; i < ORDER.length; i++) if (avg(ORDER[i]) < avg(ORDER[i - 1]) - .05) err('calibre', `wall pen should grow with calibre: ${ORDER[i - 1]} ${avg(ORDER[i - 1]).toFixed(2)} > ${ORDER[i]} ${avg(ORDER[i]).toFixed(2)}`);
  const byCal = {}; for (const g of D.GUNS) (byCal[g.caliber.split(' ')[0]] ||= []).push(g);
  for (const [c, list] of Object.entries(byCal)) { const ap = list.map(g => g.armorPen); if (Math.max(...ap) - Math.min(...ap) > .1) warn('calibre', `${c}: armorPen spread ${Math.min(...ap)}-${Math.max(...ap)}`); } }
// melee
if (D.MELEE.length < 3) err('MELEE', 'want knife + 2 more');
for (const m of D.MELEE) {
  for (const k of ['id', 'name', 'maker', 'cat', 'slot', 'archetype', 'desc', 'price', 'killReward', 'unlockLevel', 'dmg', 'backstab', 'rpm', 'range', 'armorPen', 'speed', 'draw', 'slash', 'stab', 'sound', 'model'])
    if (m[k] === undefined) err(m.id, 'melee missing ' + k);
  if (!(m.stab.back >= 100) || !(m.slash.dmg < m.stab.dmg) || !(m.slash.back > m.slash.dmg)) err(m.id, 'melee damage ordering (slash < stab, back > front, backstab kills)');
  if (!D.ARCHETYPES[m.archetype]) err(m.id, 'archetype');
}
if (!D.getGun('knife')) err('MELEE', 'no knife');
for (const [a, b] of Object.entries(D.ALIASES)) if (!D.getGun(a) || D.getGun(a).id !== b) err('ALIASES', a);
for (const k of ['primary', 'secondary', 'melee']) if (!D.getGun(D.DEFAULT_LOADOUT[k])) err('DEFAULT_LOADOUT', k);
for (const k of D.DEFAULT_LOADOUT.nades) if (!N.getNade(k)) err('DEFAULT_LOADOUT', 'nade ' + k);

// ------------------------------------------------------------------ attachments ------------------------------------------------------------------
const aIds = new Set();
if (A.ATTACHMENTS.length < 40 || A.ATTACHMENTS.length > 52) err('ATTACHMENTS', 'expected ~45, got ' + A.ATTACHMENTS.length);
for (const a of A.ATTACHMENTS) {
  const w = a.id; if (aIds.has(w)) err(w, 'duplicate attachment id'); aIds.add(w);
  if (!A.SLOTS.includes(a.slot)) err(w, 'slot'); if (!a.name || !a.desc || !inR(a.price, 0, 2000) || !inR(a.unlockLevel, 1, 60)) err(w, 'name/desc/price/unlockLevel');
  if (BANNED.test(a.name) || BANNED.test(a.desc)) err(w, 'brand name');
  if (!a.fits.length || a.fits.some(c => !D.CATEGORIES.includes(c))) err(w, 'fits');
  for (const [k, v] of Object.entries(a.mods)) { if (!(k in A.MOD_KEYS)) err(w, 'unknown mod key ' + k);
    else if (typeof v === 'number' && k !== 'zoom' && k !== 'zoom2' && k !== 'magSet' && k !== 'cantedZoom' && !inR(v, -1, 3)) err(w, `mod ${k} = ${v} is not a fraction`); }
  if (a.slot === 'optic' && !a.mods.zoom && !a.mods.canted) err(w, 'optic without zoom');
  if (a.mods.reticle && !D.RETICLES.includes(a.mods.reticle)) err(w, 'reticle ' + a.mods.reticle);
  if (!a.model || !a.model.kind) err(w, 'model hint');
  const n = D.GUNS.filter(g => A.fits(g, a)).length; if (!n) err(w, 'fits no gun');
}
for (const s of A.SLOTS) if (!A.ATTACHMENTS.some(a => a.slot === s)) err('ATTACHMENTS', 'no attachment for slot ' + s);
// effectiveStats: never mutates, never NaN, clamps, honours fits
const snap = JSON.stringify(D.GUNS);
let combos = 0;
const NUMF = ['dmg', 'rpm', 'mag', 'reload', 'reloadEmpty', 'draw', 'adsTime', 'speed', 'range', 'falloff', 'velocity', 'adsMove'];
function checkStats(g, s, label) {
  for (const k of NUMF) if (!isNum(s[k]) || s[k] <= 0) err(label, `effective ${k} = ${s[k]}`);
  for (const k of ['base', 'move', 'max', 'shot', 'hip', 'pellet']) if (!isNum(s.spread[k]) || s.spread[k] < 0) err(label, 'effective spread.' + k);
  if (s.recoil.pattern.some(p => !isNum(p[0]) || !isNum(p[1]))) err(label, 'effective pattern NaN');
  if (!inR(s.speed, 3.4, 6.1) || !inR(s.adsTime, .08, 1.2) || !inR(s.falloff, .5, .997) || !inR(s.bipod, .25, 1)) err(label, 'clamp');
  const d = s.derived; if (!d || !isNum(d.dps) || !d.bars || Object.values(d.bars).some(v => !inR(v, 0, 100))) err(label, 'derived');
}
for (const g of D.GUNS) {
  const comp = A.compatible(g);
  if (g.archetype !== 'revolver' && comp.length < 5) warn(g.id, 'only ' + comp.length + ' compatible attachments');
  checkStats(g, A.effectiveStats(g, {}), g.id + ' bare');
  for (const a of comp) { checkStats(g, A.effectiveStats(g, { [a.slot]: a.id }), g.id + '+' + a.id); combos++; }
  const best = {}; for (const a of comp) if (!best[a.slot]) best[a.slot] = a.id;
  const full = A.effectiveStats(g, best); checkStats(g, full, g.id + ' full kit'); combos++;
  if (full.attachments.length !== Object.keys(best).length) err(g.id, 'full kit dropped an attachment');
  for (const a of A.ATTACHMENTS.filter(a => !A.fits(g, a))) { const s = A.effectiveStats(g, { [a.slot]: a.id }); if (s.attachments.length) { err(g.id, 'applied a non-fitting ' + a.id); break; } }
  const wrongSlot = A.effectiveStats(g, { optic: 'u_vgrip' }); if (wrongSlot.attachments.length) err(g.id, 'applied an attachment in the wrong slot');
}
if (JSON.stringify(D.GUNS) !== snap) err('effectiveStats', 'MUTATED the GUNS source data');
{ const s = A.effectiveStats('warden', { mag: 'g_drum' }); if (s.mag !== 50) err('g_drum', 'magSet not applied'); }
{ const s = A.effectiveStats('cacciatore', { mag: 'g_ext_tube' }); if (!(s.mag > 8) || !(s.reload > D.getGun('cacciatore').reload)) err('g_ext_tube', 'shell tube must add shells and reload time'); }
{ const s = A.effectiveStats('rook', { optic: 'o_canted' }); if (!s.canted || s.zoom !== 6) err('o_canted', 'canted irons must keep the built-in scope'); }
{ const s = A.effectiveStats('rook', { optic: 'o_12x' }); if (s.zoom !== 12) err('o_12x', 'optic must replace the built-in scope'); }
{ const s = A.effectiveStats('morker', { muzzle: 'm_supp_762' }), t = A.effectiveStats('switchback', { muzzle: 'm_supp_556' });
  if (!(s.range / D.getGun('morker').range > t.range / D.getGun('switchback').range)) err('suppressorFriendly', 'friendly gun should lose less range'); }

// ------------------------------------------------------------------ grenades ------------------------------------------------------------------
const NADE_FIELDS = ['id', 'name', 'kind', 'group', 'desc', 'price', 'max', 'unlockLevel', 'killReward', 'team', 'fuse', 'cookable', 'impact', 'impactMin', 'armTime',
  'sticky', 'remote', 'popOnRest', 'airBurst', 'throwSpeed', 'lobSpeed', 'mass', 'drag', 'bounce', 'friction', 'roll', 'radius', 'danger', 'dmg', 'falloff',
  'armorPen', 'selfDmg', 'losBlock', 'duration', 'model', 'fx'];
if (N.GRENADES.length !== 25) err('GRENADES', 'expected 25, got ' + N.GRENADES.length);
{ const kinds = N.GRENADES.map(n => n.kind); for (const k of N.KINDS) if (kinds.filter(x => x === k).length !== 1) err('GRENADES', 'kind ' + k + ' must appear exactly once'); }
const nNames = new Set();
for (const n of N.GRENADES) {
  const w = 'nade ' + n.id;
  for (const k of NADE_FIELDS) if (n[k] === undefined) err(w, 'missing ' + k);
  if (nNames.has(n.name)) err(w, 'duplicate name'); nNames.add(n.name);
  if (BANNED.test(n.name)) err(w, 'brand'); if (!n.group || !N.NADE_RULES.groups[n.group]) err(w, 'no rule group');
  if (!inR(n.price, 25, 1000) || n.price % 25) err(w, 'price'); if (!inR(n.max, 1, N.NADE_RULES.groups[n.group]?.max || 1)) err(w, 'max beyond its group limit');
  if (!inR(n.throwSpeed, 8, 25) || !inR(n.lobSpeed, 4, 12) || !(n.lobSpeed < n.throwSpeed)) err(w, 'throw speeds');
  if (!inR(n.bounce, 0, .7) || !inR(n.friction, 0, 1) || !inR(n.mass, .1, 2) || !inR(n.drag, 0, .5) || !inR(n.roll, 0, 10)) err(w, 'physics');
  if (!inR(n.radius, .5, 30) || !inR(n.danger, 0, 30) || !inR(n.armorPen, 0, 1) || !inR(n.selfDmg, 0, 1)) err(w, 'radius/danger/armorPen/selfDmg');
  if (!(n.fuse > 0) && !n.impact && !n.remote) err(w, 'needs a fuse, impact or remote');
  if (n.cookable && !(n.fuse > 0)) err(w, 'cookable without fuse');
  if (n.dmg) { if (!(n.danger >= n.radius * .9)) err(w, 'danger radius'); let prev = Infinity;
    for (let d = 0; d <= n.radius + .5; d += .25) { const v = N.blastDamage(n, d); if (v > prev + 1e-9 || v < 0) { err(w, 'blast falloff not monotonic'); break; } prev = v; }
    if (N.blastDamage(n, n.radius + .01) !== 0) err(w, 'damage outside radius'); }
  if (['smoke', 'smoke_color', 'molotov', 'incendiary', 'gas', 'sensor', 'emp', 'chaff', 'flare', 'medic', 'thermite', 'decoy', 'stun', 'concussion'].includes(n.kind) && !(n.duration > 0)) err(w, 'needs a duration');
  if (!n.model || !n.model.shape || !n.model.size || !n.model.colors) err(w, 'model hints');
  if (!n.fx || !Object.keys(n.fx).length) err(w, 'fx parameters');
}
{ const need = { smoke: ['smoke'], molotov: ['fire'], incendiary: ['fire'], gas: ['gas'], flash: ['blind', 'deafen'], ninebang: ['blind', 'bangs'], sensor: ['pulse'], chaff: ['jam'],
    emp: ['emp'], cluster: ['bomblets'], satchel: ['remote'], medic: ['heal'], thermite: ['burn'], breach: ['breach'], stun: ['stun'], concussion: ['concuss'], decoy: ['mimic'], flare: ['light'] };
  for (const [k, keys] of Object.entries(need)) for (const f of keys) if (!N.getNade(k).fx[f]) err('nade ' + k, 'fx.' + f + ' missing'); }
// rules
{ const seen = {}; for (const [g, def] of Object.entries(N.NADE_RULES.groups)) for (const k of def.kinds) { if (seen[k]) err('NADE_RULES', k + ' in two groups'); seen[k] = g; }
  for (const k of N.KINDS) if (!seen[k]) err('NADE_RULES', k + ' in no group');
  const G = N.NADE_RULES.groups; if (N.NADE_RULES.maxTotal !== 4 || G.flash.max !== 2 || G.frag.max !== 1 || G.smoke.max !== 1 || G.fire.max !== 1) err('NADE_RULES', 'brief: 4 total, 2 flash, 1 frag, 1 smoke, 1 fire');
  const add = (inv, id) => { const r = N.canCarry(inv, id); if (r.ok) { const e = inv.find(x => x.gid === id); if (e) e.n++; else inv.push({ gid: id, n: 1 }); } return r.ok; };
  let inv = []; const seq = ['flash', 'flash', 'frag', 'smoke']; for (const id of seq) if (!add(inv, id)) err('canCarry', 'refused a legal ' + id);
  if (add(inv, 'decoy')) err('canCarry', 'allowed a 5th grenade');
  inv = []; add(inv, 'flash'); add(inv, 'flash'); if (add(inv, 'ninebang') || add(inv, 'flash')) err('canCarry', 'allowed a 3rd flash');
  inv = []; add(inv, 'frag'); if (add(inv, 'he')) err('canCarry', 'allowed two lethal');
  inv = []; add(inv, 'molotov'); if (add(inv, 'incendiary')) err('canCarry', 'allowed two fire');
  if (N.canCarry([], 'nope').ok) err('canCarry', 'unknown id accepted'); }
{ const f = N.getNade('flash'); const a = N.flashBlind(f, 3, 0), b = N.flashBlind(f, 3, Math.PI), c = N.flashBlind(f, 15, 0);
  if (!(a > 3.5 && b < a * .3 && c < a && c > 0)) err('flashBlind', `front ${a} back ${b} far ${c}`); }

// ------------------------------------------------------------------ balance tables + outliers ------------------------------------------------------------------
const DISTS = [5, 15, 30, 60], EXTRA = [10];
const rowsOf = g => {
  const r = { g, stk: {}, ttk: {} };
  for (const d of [...DISTS, ...EXTRA]) { r.stk[d] = { bare: A.hitsToKill(g, d), armor: A.hitsToKill(g, d, { armor: 100 }) }; r.ttk[d] = { bare: A.timeToKill(g, d), armor: A.timeToKill(g, d, { armor: 100 }) }; }
  r.der = A.effectiveStats(g).derived; return r;
};
const ROWS = D.GUNS.map(rowsOf);
// brief checks
{ const rif = ROWS.filter(r => ['rifle', 'carbine', 'br', 'dmr'].includes(r.g.cat));
  const oneTap = rif.filter(r => r.der.headKill.bare >= 30).length;
  if (oneTap < rif.length * .75) err('balance', `only ${oneTap}/${rif.length} rifles one-tap an unhelmeted head at 30 m`);
  const ar = ROWS.filter(r => r.g.cat === 'rifle'), avgStk = ar.reduce((a, r) => a + r.stk[15].bare, 0) / ar.length;
  if (avgStk < 3 || avgStk > 4.6) err('balance', `assault rifles average ${avgStk.toFixed(2)} body shots at 15 m (want ~4)`);
  for (const r of ar) if (r.stk[15].bare < 3 || r.stk[15].bare > 5 || r.stk[15].armor > 6) err(r.g.id, `body shots at 15 m ${r.stk[15].bare}/${r.stk[15].armor} armoured`);
  const awp = ROWS.find(r => r.g.id === 'arbiter'); if (awp && awp.stk[30].armor !== 1) err('arbiter', 'heavy bolt should kill an armoured chest in one');
  for (const r of ROWS.filter(r => r.g.cat === 'shotgun')) if (!(r.stk[5].bare <= 1) && r.g.id !== 'raskat') warn(r.g.id, 'pump/break shotgun should one-shot an unarmoured body at 5 m'); }
// per-category outliers (armoured TTK at 15 m vs the category median), and dominated guns
const FLAG_OK = { shizuka: 'stealth .22: weak by design, quiet and accurate', bjorn: 'anti-materiel: 1 shot anywhere, slowest gun', raskat: 'auto shotgun: wide pattern, 2-3 shells per kill',
  monolith: 'the big-bore pistol: 700, 7 rounds, the eco-round answer to armour', rook: 'light bolt: cheap, 2 body shots or 1 head, fastest scoped gun',
  gemelli: 'coach gun: two shells, a 9 m weapon that one-shots armour up close', lawman: '.45: lethal to the unarmoured, poor against vests' };
for (const c of D.CATEGORIES) {
  const rs = ROWS.filter(r => r.g.cat === c); const med = median(rs.map(r => r.ttk[15].armor));
  for (const r of rs) { const t = r.ttk[15].armor; if (!Number.isFinite(t)) continue;
    const ratio = med > 0 ? t / med : 1;
    if ((c === 'sniper' || c === 'shotgun') && t === 0) continue;   // one-shot kills are the point of those categories
    if ((ratio > 1.7 || ratio < .5) && med > .05) flags.push(`${r.g.id} (${c}): armoured TTK at 15 m ${fmt(t)} s vs category median ${fmt(med)} s${FLAG_OK[r.g.id] ? '  [accepted: ' + FLAG_OK[r.g.id] + ']' : ''}`); }
  for (const a of rs) for (const b of rs) {
    if (a === b) continue;
    const better = a.g.price <= b.g.price && a.g.unlockLevel <= b.g.unlockLevel && a.ttk[15].armor <= b.ttk[15].armor && a.ttk[30].armor <= b.ttk[30].armor && a.ttk[5].bare <= b.ttk[5].bare
      && a.g.mag >= b.g.mag && a.g.speed >= b.g.speed && a.g.adsTime <= b.g.adsTime && a.g.reload <= b.g.reload && a.der.bars.control >= b.der.bars.control
      && a.der.bars.accuracy >= b.der.bars.accuracy && a.der.headKill.helmet >= b.der.headKill.helmet && a.der.headKill.bare >= b.der.headKill.bare && a.g.suppressed >= b.g.suppressed
      && a.g.pen >= b.g.pen && a.g.range >= b.g.range && A.hitsToKill(a.g, 30, { group: 'leg' }) <= A.hitsToKill(b.g, 30, { group: 'leg' });
    if (better) flags.push(`${b.g.id} is dominated by ${a.g.id} (cheaper or equal, unlocked earlier, better in every listed stat)`);
  }
}
// price vs power curve: a pricier gun in the same category should win somewhere
for (const c of D.CATEGORIES) {
  const rs = ROWS.filter(r => r.g.cat === c).sort((x, y) => x.g.price - y.g.price);
  const cheapest = rs[0]; for (const r of rs.slice(1)) {
    const wins = [5, 10, 15, 30].some(d => r.ttk[d].armor < cheapest.ttk[d].armor || r.ttk[d].bare < cheapest.ttk[d].bare) || r.g.mag > cheapest.g.mag
      || r.der.bars.control > cheapest.der.bars.control || r.g.suppressed > cheapest.g.suppressed || r.der.headKill.helmet > cheapest.der.headKill.helmet || r.der.headKill.bare > cheapest.der.headKill.bare * 1.2;
    if (!wins) flags.push(`${r.g.id} costs ${r.g.price} but never beats the cheapest ${c} (${cheapest.g.id}, ${cheapest.g.price})`);
  }
}

// ------------------------------------------------------------------ output ------------------------------------------------------------------
const pad = (s, n) => String(s).padEnd(n), lpad = (s, n) => String(s).padStart(n);
if (!QUIET) {
  console.log('\nTIME TO KILL (chest hits, fresh 100 hp; "bare" = no armour, "arm" = 100 armour; seconds / shots)');
  console.log(pad('gun', 13) + pad('cat', 8) + DISTS.map(d => lpad(d + 'm bare', 13) + lpad(d + 'm arm', 13)).join('') + lpad('head bare', 11) + lpad('head helm', 11) + lpad('dps', 6) + lpad('$', 6));
  for (const c of D.CATEGORIES) for (const r of ROWS.filter(r => r.g.cat === c)) {
    console.log(pad(r.g.id, 13) + pad(c, 8) + DISTS.map(d => lpad(fmt(r.ttk[d].bare) + '/' + r.stk[d].bare, 13) + lpad(fmt(r.ttk[d].armor) + '/' + r.stk[d].armor, 13)).join('')
      + lpad(r.der.headKill.bare ? r.der.headKill.bare + 'm' : '-', 11) + lpad(r.der.headKill.helmet ? r.der.headKill.helmet + 'm' : '-', 11) + lpad(r.der.dps, 6) + lpad(r.g.price, 6));
  }
  console.log('\nGRENADE BLAST (health damage before armour at 1 / 3 / 5 m)');
  for (const n of N.GRENADES.filter(n => n.dmg)) console.log(pad(n.id, 13) + [1, 3, 5].map(d => lpad(N.blastDamage(n, d).toFixed(0), 6)).join('') + '   r ' + n.radius + ' m, armorPen ' + n.armorPen);
}
console.log(`\n${D.GUNS.length} guns, ${D.MELEE.length} melee, ${A.ATTACHMENTS.length} attachments (${combos} gun/attachment combinations checked), ${N.GRENADES.length} grenades.`);
if (flags.length) { console.log(`\nOUTLIER FLAGS (${flags.length}):`); for (const f of flags) console.log('  ~ ' + f); }
if (warns.length) { console.log(`\nWARNINGS (${warns.length}):`); for (const w of warns) console.log('  ! ' + w); }
if (errors.length) { console.log(`\nERRORS (${errors.length}):`); for (const e of errors) console.log('  x ' + e); }
else console.log('\nOK: all entries valid.');

// ------------------------------------------------------------------ markdown tables (docs/WEAPONS.md) ------------------------------------------------------------------
function markdown() {
  const L = [];
  const yes = b => (b ? 'yes' : '-');
  const LETTER = { optic: 'o', muzzle: 'm', under: 'u', side: 's', mag: 'g', stock: 'k', barrel: 'b' };
  const mnt = g => Object.entries(g.mounts).filter(([, v]) => v).map(([k]) => LETTER[k]).join('') || '-';
  L.push('Mounts: o optic, m muzzle, u underbarrel, s side rail, g magazine, k stock, b barrel. dmg is per pellet for shotguns.\n');
  for (const c of D.CATEGORIES) {
    L.push(`### ${D.CATEGORY_INFO[c].name}\n`);
    L.push('| id | name | maker | calibre | $ | kill $ | lvl | dmg | AP | rpm | modes | mag/res | reload | ADS s | speed | range | head 1-tap (bare/helm) | TTK 15 m bare/arm | mounts |');
    L.push('|---|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---:|---:|---:|---|---|---|');
    for (const r of ROWS.filter(r => r.g.cat === c)) { const g = r.g;
      L.push(`| ${g.id} | ${g.name} | ${g.maker} | ${g.caliber} | ${g.price} | ${g.killReward} | ${g.unlockLevel} | ${g.pellets > 1 ? g.pellets + 'x' : ''}${g.dmg} | ${g.armorPen} | ${g.rpm} | ${g.modes.join('/')}${g.burst ? ' ' + g.burst : ''}${g.cycle ? ' (' + g.cycle + ')' : ''} | ${g.mag}/${g.reserve} | ${g.reload}/${g.reloadEmpty} | ${g.adsTime} | ${g.speed} | ${g.range} | ${r.der.headKill.bare || '-'}/${r.der.headKill.helmet || '-'} m | ${fmt(r.ttk[15].bare)}/${fmt(r.ttk[15].armor)} s (${r.stk[15].bare}/${r.stk[15].armor}) | ${mnt(g)} |`); }
    L.push('');
  }
  L.push('### Melee\n\n| id | name | maker | slash (front/back) | heavy (front/back) | slash rate s | reach m | speed | throw |\n|---|---|---|---|---|---:|---:|---:|---|');
  for (const m of D.MELEE) L.push(`| ${m.id} | ${m.name} | ${m.maker} | ${m.slash.dmg}/${m.slash.back} | ${m.stab.dmg}/${m.stab.back} | ${m.slash.rate} | ${m.slash.range} | ${m.speed} | ${m.throw ? m.throw.dmg + ' dmg at ' + m.throw.speed + ' m/s' : '-'} |`);
  L.push('\n### Time to kill at 5 / 15 / 30 / 60 m (chest, seconds / shots; bare = no armour, arm = 100 armour)\n');
  L.push('| gun | ' + DISTS.map(d => `${d} m bare | ${d} m arm`).join(' | ') + ' |'); L.push('|---|' + DISTS.map(() => '---|---').join('|') + '|');
  for (const r of ROWS) L.push(`| ${r.g.id} | ` + DISTS.map(d => `${fmt(r.ttk[d].bare)} / ${r.stk[d].bare} | ${fmt(r.ttk[d].armor)} / ${r.stk[d].armor}`).join(' | ') + ' |');
  L.push('\n### Attachments\n\n| id | slot | name | $ | lvl | fits | mods |\n|---|---|---|---:|---:|---|---|');
  for (const a of A.ATTACHMENTS) { const extra = [a.bores && 'bores ' + a.bores.join('/'), a.cals && 'calibres ' + a.cals.length, a.stocks && 'stocks ' + a.stocks.join('/'), a.reloadKinds && a.reloadKinds.join('/') + ' feed', a.scoped && 'built-in scope'].filter(Boolean).join('; ');
    const mods = Object.entries(a.mods).map(([k, v]) => typeof v === 'number' ? (k === 'zoom' || k === 'zoom2' || k === 'magSet' || k === 'cantedZoom' ? `${k} ${v}` : `${k} ${v > 0 ? '+' : ''}${Math.round(v * 100)}%`) : typeof v === 'object' ? k : `${k} ${v}`).join(', ');
    L.push(`| ${a.id} | ${a.slot} | ${a.name} | ${a.price} | ${a.unlockLevel} | ${a.fits.join(', ')}${extra ? ' (' + extra + ')' : ''} | ${mods} |`); }
  L.push('\n### Grenades\n\n| id | name | group | $ | max | lvl | fuse | trigger | throw/lob m/s | radius | dmg (1/3/5 m) | AP | duration | effect |\n|---|---|---|---:|---:|---:|---:|---|---|---:|---|---:|---:|---|');
  for (const n of N.GRENADES) { const trig = [n.cookable && 'cook', n.impact && 'impact', n.sticky && 'sticky', n.remote && 'remote', n.popOnRest && 'on rest'].filter(Boolean).join(', ') || 'timed';
    const eff = Object.keys(n.fx).filter(k => n.fx[k]).join(', ');
    L.push(`| ${n.id} | ${n.name} | ${n.group} | ${n.price} | ${n.max} | ${n.unlockLevel} | ${n.fuse || '-'} | ${trig} | ${n.throwSpeed}/${n.lobSpeed} | ${n.radius} | ${n.dmg ? [1, 3, 5].map(d => N.blastDamage(n, d).toFixed(0)).join('/') : '-'} | ${n.dmg ? n.armorPen : '-'} | ${n.duration || '-'} | ${eff} |`); }
  return L.join('\n');
}
if (args.has('--md')) console.log('\n' + markdown());
if (args.has('--write-doc')) {
  const f = path.join(ROOT, 'docs/WEAPONS.md'), B = '<!-- generated:begin (node tools/test/balance.mjs --write-doc) -->', E = '<!-- generated:end -->';
  const s = fs.readFileSync(f, 'utf8'), i = s.indexOf(B), j = s.indexOf(E);
  if (i < 0 || j < i) { console.log('docs/WEAPONS.md has no generated markers'); process.exitCode = 1; }
  else { fs.writeFileSync(f, s.slice(0, i + B.length) + '\n\n' + markdown() + '\n\n' + s.slice(j)); console.log('docs/WEAPONS.md tables rewritten'); }
}

// ------------------------------------------------------------------ visual report (--shots) ------------------------------------------------------------------
if (args.has('--shots')) {
  const out = path.join(ROOT, 'tools/test/out/weapons'); fs.mkdirSync(out, { recursive: true });
  const cards = D.GUNS.map(g => {
    let x = 0, y = 0; const pts = [[0, 0]];
    const n = Math.min(g.mag, g.modes.includes('auto') || g.modes[0] === 'burst' ? 60 : 8);
    for (let i = 0; i < n - 1; i++) { const s = D.recoilStep(g, i); x += s[0]; y += s[1]; pts.push([x, y]); }
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    const span = Math.max(4, Math.max(...ys) + 1, (Math.max(...xs.map(Math.abs)) + 1) * 2), sc = 150 / span;
    const P = pts.map(([px, py]) => [100 + px * sc, 170 - py * sc]);
    const poly = P.map(p => p.map(v => v.toFixed(1)).join(',')).join(' ');
    const dots = P.map((p, i) => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="${i < 10 ? 2.6 : 1.8}" fill="${i < 10 ? '#ffb347' : i < 30 ? '#ff6a4d' : '#a04de0'}"/>`).join('');
    const grid = [...Array(Math.ceil(span) + 1).keys()].map(k => `<line x1="10" x2="190" y1="${(170 - k * sc).toFixed(1)}" y2="${(170 - k * sc).toFixed(1)}" stroke="#2a2f36" stroke-width="${k % 5 ? .5 : 1}"/>`).join('');
    const b = A.effectiveStats(g).derived.bars;
    const bars = Object.entries(b).map(([k, v]) => `<div class=b><span>${k}</span><i style="width:${v}%"></i><em>${v}</em></div>`).join('');
    return `<div class=card><h3>${g.name}</h3><p>${g.cat} · ${g.caliber} · ${g.rpm} rpm · ${g.modes.join('/')} · $${g.price}</p><svg width=200 height=180 viewBox="0 0 200 180">${grid}<line x1="100" x2="100" y1="0" y2="180" stroke="#3a4049"/><polyline points="${poly}" fill="none" stroke="#5c6670" stroke-width="1"/>${dots}</svg><small>grid = 1°, ${n} shots</small>${bars}</div>`;
  }).join('');
  const html = `<!doctype html><meta charset=utf-8><style>body{background:#111418;color:#d8dde3;font:12px system-ui,sans-serif;margin:12px}h1{font-size:16px}.wrap{display:flex;flex-wrap:wrap;gap:8px}
.card{width:212px;background:#1a1e24;border:1px solid #2a2f36;border-radius:4px;padding:6px}.card h3{margin:0;font-size:12px}.card p{margin:2px 0 4px;color:#8b949e;font-size:10px}
small{color:#6e7681;font-size:9px}.b{display:flex;align-items:center;height:11px;font-size:9px}.b span{width:52px;color:#8b949e}.b i{display:block;height:5px;background:#e8a33a;margin-right:4px}.b em{font-style:normal;color:#6e7681}</style>
<h1>LIVE FIRE — spray patterns (aim offset, degrees, first 10 shots amber) and armory bars</h1><div class=wrap>${cards}</div>`;
  const f = path.join(out, 'report.html'); fs.writeFileSync(f, html);
  const { launch, shot } = await import('./lib.mjs');
  const br = await launch(); const page = await br.newPage({ viewport: { width: 1400, height: 900 } });
  await page.goto(url.pathToFileURL(f).href); await page.waitForTimeout(200);
  console.log('report: ' + f + '\nscreenshot: ' + await shot(page, 'weapons/report.png', { fullPage: true }));
  await br.close();
}
process.exitCode = errors.length ? 1 : process.exitCode || 0;
