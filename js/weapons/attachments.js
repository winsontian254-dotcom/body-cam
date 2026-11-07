/* STUB (owner: weapons-data worker) — replace completely, keep this API.
   Exports: SLOTS, ATTACHMENTS, getAttachment(id), fits(gun, att), effectiveStats(gun, mods) */
export const SLOTS = ['optic', 'muzzle', 'under', 'side', 'mag', 'stock', 'barrel'];
export const ATTACHMENTS = [
  { id: 'reddot', slot: 'optic', name: 'Reflex Sight', desc: '1x red dot.', price: 400, unlockLevel: 1, fits: ['pistol', 'smg', 'rifle', 'carbine', 'br', 'shotgun', 'lmg'], mods: { zoom: 1.1, reticle: 'dot' } },
  { id: 'supp', slot: 'muzzle', name: 'Suppressor', desc: 'Quiet, no flash.', price: 600, unlockLevel: 1, fits: ['pistol', 'smg', 'rifle', 'carbine', 'br', 'dmr', 'sniper'], mods: { suppressed: true, flashHide: true, range: -.1 } },
];
export const getAttachment = id => ATTACHMENTS.find(a => a.id === id) || null;
export const fits = (gun, att) => !!(gun && att && gun.mounts && gun.mounts[att.slot] && att.fits.includes(gun.cat));
export function effectiveStats(gun, mods = {}) {
  const s = JSON.parse(JSON.stringify(gun));
  for (const id of Object.values(mods)) { const a = getAttachment(id); if (!a || !fits(gun, a)) continue; const m = a.mods;
    if (m.spread) for (const k of ['base', 'move']) s.spread[k] *= 1 + m.spread; if (m.recoil) s.recoil.kick *= 1 + m.recoil;
    if (m.adsTime) s.adsTime *= 1 + m.adsTime; if (m.speed) s.speed *= 1 + m.speed; if (m.range) s.range *= 1 + m.range;
    if (m.mag) s.mag += m.mag; if (m.reload) { s.reload *= 1 + m.reload; s.reloadEmpty *= 1 + m.reload; }
    if (m.suppressed) s.suppressed = true; if (m.zoom) s.zoom = m.zoom; if (m.reticle) s.reticle = m.reticle; }
  return s;
}
