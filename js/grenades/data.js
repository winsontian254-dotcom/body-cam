/* STUB (owner: weapons-data worker) — replace completely with the 25 grenades, keep this API (docs/ARCHITECTURE.md §6).
   Exports: GRENADES, getNade(id) */
export const GRENADES = [
  { id: 'm67', name: 'M-Frag', kind: 'frag', desc: 'Fragmentation grenade.', price: 300, max: 1, fuse: 3.5, cookable: true, impact: false, sticky: false,
    throwSpeed: 18, lobSpeed: 9, bounce: .45, friction: .6, radius: 9, dmg: 100, armorPen: .6, duration: 0, team: 0, model: {}, fx: {} },
  { id: 'flash', name: 'Flash-Bang', kind: 'flash', desc: 'Blinds and deafens.', price: 200, max: 2, fuse: 1.6, cookable: false, impact: false, sticky: false,
    throwSpeed: 18, lobSpeed: 9, bounce: .45, friction: .6, radius: 20, dmg: 0, armorPen: 0, duration: 5, team: 0, model: {}, fx: {} },
  { id: 'smoke', name: 'Smoke Screen', kind: 'smoke', desc: 'Blocks vision for 18 s.', price: 300, max: 1, fuse: 1.5, cookable: false, impact: false, sticky: false,
    throwSpeed: 18, lobSpeed: 9, bounce: .4, friction: .6, radius: 4.5, dmg: 0, armorPen: 0, duration: 18, team: 0, model: {}, fx: {} },
];
export const getNade = id => GRENADES.find(g => g.id === id) || null;
