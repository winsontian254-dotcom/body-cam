/* STUB (owner: weapons-data worker) — replace completely with the 50 guns, keep this API (docs/ARCHITECTURE.md §5).
   Exports: CATEGORIES, GUNS, MELEE, getGun(id) */
export const CATEGORIES = ['pistol', 'smg', 'rifle', 'carbine', 'br', 'shotgun', 'dmr', 'sniper', 'lmg'];
const base = { team: 0, killReward: 300, unlockLevel: 1, modes: ['auto'], pellets: 1, burst: 3, tracer: true, scope: null,
  mounts: { optic: true, muzzle: true, under: true, side: true, mag: true, stock: true, barrel: true }, model: {} };
export const GUNS = [
  { ...base, id: 'p9', name: 'Ward P9', maker: 'Ward Arms', cat: 'pistol', slot: 'secondary', archetype: 'pistol', desc: 'Striker 9 mm service pistol.',
    price: 200, killReward: 300, dmg: 30, armorPen: .5, rpm: 400, modes: ['semi'], mag: 17, reserve: 85, reload: 2.2, reloadEmpty: 2.4, draw: .5,
    adsTime: .15, adsFov: 1.1, range: 25, falloff: .85, pen: .9, speed: 5.6, sound: 'pistol_9', caliber: '9x19',
    spread: { base: .004, move: .03, air: .12, crouch: .8, ads: .5, max: .06 }, recoil: { pattern: [[0, 1]], kick: .9, recover: 8, random: .3 },
    mounts: { optic: true, muzzle: true, under: false, side: true, mag: true, stock: false, barrel: false } },
  { ...base, id: 'vk47', name: 'VK-47', maker: 'Volkov', cat: 'rifle', slot: 'primary', archetype: 'ak', desc: '7.62 mm assault rifle.',
    price: 2700, dmg: 36, armorPen: .77, rpm: 600, mag: 30, reserve: 90, reload: 2.5, reloadEmpty: 3.1, draw: 1,
    adsTime: .28, adsFov: 1.2, range: 60, falloff: .98, pen: 2, speed: 5.0, sound: 'rifle_762', caliber: '7.62x39',
    spread: { base: .002, move: .09, air: .3, crouch: .8, ads: .4, max: .1 }, recoil: { pattern: [[0, 1], [0, 1.2], [.1, 1.3], [-.2, 1.2], [.3, 1], [-.4, .8]], kick: 1.2, recover: 6, random: .3 } },
];
export const MELEE = [{ id: 'knife', name: 'Field Knife', cat: 'melee', slot: 'melee', dmg: 40, backstab: 180, rpm: 120, speed: 5.9, range: 1.6 }];
export const getGun = id => GUNS.find(g => g.id === id) || MELEE.find(g => g.id === id) || null;
