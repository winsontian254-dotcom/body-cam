/* STUB (owner: account worker) — replace completely, keep this API (docs/ARCHITECTURE.md §11).
   Exports: Profile */
const KEY = 'lf_profile_v1';
const fresh = () => ({ v: 1, name: 'Operator', xp: 0, credits: 0, owned: { gun: {}, att: {}, skin: {} },
  loadouts: [{ name: 'Loadout 1', primary: 'vk47', secondary: 'p9', nades: ['m67', 'flash'], mods: {} }], stats: { kills: 0, deaths: 0, matches: 0, wins: 0 } });
let P = null; const subs = new Set();
export const Profile = {
  load() { try { P = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { P = null; } if (!P) P = fresh(); return P; },
  get: () => P || Profile.load(), save() { try { localStorage.setItem(KEY, JSON.stringify(P)); } catch (e) {} subs.forEach(f => f(P)); },
  onChange(fn) { subs.add(fn); return () => subs.delete(fn); }, level: () => 1 + Math.floor(Math.sqrt((Profile.get().xp || 0) / 250)),
  xpToNext() { const l = Profile.level(); return 250 * l * l - Profile.get().xp; }, addXP(n) { Profile.get().xp += n; Profile.save(); },
  addCredits(n) { Profile.get().credits += n; Profile.save(); }, spend(n) { const p = Profile.get(); if (p.credits < n) return false; p.credits -= n; Profile.save(); return true; },
  owns: () => true, unlock() {}, loadouts: () => Profile.get().loadouts, setLoadout(i, lo) { Profile.get().loadouts[i] = lo; Profile.save(); },
  recordMatch() {}, stats: () => Profile.get().stats,
};
