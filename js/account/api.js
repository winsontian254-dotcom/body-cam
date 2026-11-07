/* STUB (owner: account worker) — replace completely, keep this API (docs/ARCHITECTURE.md §11).
   Exports: Account, DEFAULT_API */
export const DEFAULT_API = 'https://neon-veins-api.winsontian254.workers.dev';
const KEY = 'nv_account_v1';
const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { return {}; } };
const subs = new Set();
export const Account = {
  init() {}, member: () => !!(read().token && read().user), user: () => read().user || null,
  async login() { throw new Error('Accounts are not wired up yet.'); }, async signup() { throw new Error('Accounts are not wired up yet.'); },
  async logout() {}, async friends() { return { friends: [], incoming: [], outgoing: [] }; }, async presence() { return null; },
  async invite() { return null; }, async loadCloud() { return null; }, async saveCloud() { return null; },
  async submitScore() { return null; }, async getBoard() { return { error: 'offline' }; }, on(fn) { subs.add(fn); return () => subs.delete(fn); },
};
