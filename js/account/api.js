/* LIVE FIRE — Neon Veins account client: the SAME accounts, login, friends and server as Neon Veins (docs/ARCHITECTURE.md §11).
   Exports:
     DEFAULT_API                 'https://neon-veins-api.winsontian254.workers.dev' (the owner's Cloudflare Worker, NEON_VIENS/server/worker.js)
     NV_KEY, LF_KEY, CLOUD_SLOT  'nv_account_v1' (shared with Neon Veins), 'lf_account_v1' (LIVE FIRE only), 'livefire'
     Account = {
       init()                    starts presence (when signed in), cross-tab login sync (storage event), hide / show handling. Idempotent.
       member() -> bool, user() -> { id, username, color, email, ... } | null
       server() -> base URL, setServer(url | '') (LIVE FIRE-only override, '' = follow Neon Veins), sharedLogin() -> bool, configured()
       signup(email, username, password) -> user, login(login, password) -> user, logout(), refresh() -> { user, sessions }
       friends({ force }) -> { friends: [{ id, username, color, online, activity, join_code, last_seen, liveFire, joinable }], incoming, outgoing }
       friendsCached() -> the last friends() result | null
       search(q) -> { users }, request(username), respond(id, accept), unfriend(id)
       presence(activity, code)  sets the status shown to friends and sends a heartbeat now (code only while hosting)
       setStatus({ activity, code } | null), status() -> { activity, code } (what the next heartbeat sends), beat() -> Promise
       pending() -> { invites: [{ id, code, username, color, created, liveFire }], requests }
       invite(friendId, code), join(code, from?) -> bool (appBus 'net:join' { code, from }; false when nothing handles it)
       loadCloud() -> { profile, summary, updated } | null (404),  saveCloud(profile, { summary, keepalive }) -> { ok, updated }
       cloudInfo() -> { slot, summary, updated, size } | null,  deleteCloud()
       submitScore(board, score, detail) -> { ok, score, rank, total } | { error }      (never throws)
       getBoard(board) -> { board, total, top: [{ rank, name, color, score, me, detail }], me } | { error }   (never throws)
       boardsAvailable() -> null (unknown) | true | false,  NO_BOARDS (the message shown while the server has no LIVE FIRE boards)
       on(fn(evt)) -> off        evt = { type: 'auth' | 'presence' | 'invite' | 'requests' | 'friends' | 'server', ... }
       lastError                 the last request error message (or '')
     }
   Rules: the token in nv_account_v1 is shared with Neon Veins (same origin on GitHub Pages): read-modify-write that object and only touch
   `token` and `user` (read `api`); everything LIVE FIRE keeps goes into lf_account_v1. Every change is also announced on appBus 'account'.
   Activity strings always start with 'LIVE FIRE'; join_code is sent only while hosting. Requests time out after 15 s; a 401 on an
   authenticated call signs out (only if the stored token is still the one that failed); 429 keeps the server's "try again" message.
   Dev: #dev&api=http://127.0.0.1:8787 points the client at a local server (tools/fake-nv-api.mjs). */
import { appBus } from '../core/events.js';
import { DEV } from '../core/dev.js';

export const DEFAULT_API = 'https://neon-veins-api.winsontian254.workers.dev';
export const NV_KEY = 'nv_account_v1', LF_KEY = 'lf_account_v1', CLOUD_SLOT = 'livefire';
const TIMEOUT = 15000, BEAT_MS = 30000, FRIENDS_TTL = 10000;
const CODE_RE = /^[A-Z0-9]{6}$/;
const NO_BOARDS = 'Leaderboards are not available yet.';

// ------------------------------------------------------------------------------------------------ storage
const readJSON = k => { try { const v = JSON.parse(localStorage.getItem(k) || '{}'); return v && typeof v === 'object' ? v : {}; } catch (e) { return {}; } };
const writeJSON = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };
const norm = u => String(u || '').trim().replace(/\/+$/, '');
const nvBase = () => norm(readJSON(NV_KEY).api || DEFAULT_API);
const devApi = () => (DEV && DEV.dev && typeof DEV.api === 'string' ? norm(DEV.api) : '');
const base = () => devApi() || norm(readJSON(LF_KEY).api) || nvBase();
const shared = () => base() === nvBase();
const sessKey = () => (shared() ? NV_KEY : LF_KEY);
/** the session { token, user } of the server LIVE FIRE talks to (shared with Neon Veins when both use the same server) */
function session() { const s = readJSON(sessKey()); return { token: typeof s.token === 'string' && s.token ? s.token : null, user: s.user && typeof s.user === 'object' ? s.user : null }; }
function setSession(token, user) {
  const k = sessKey(), o = readJSON(k);          // read-modify-write: Neon Veins keeps api, autosync, had, lastSync, cloudAt ... in the same object
  o.token = token || null; o.user = user || null;
  writeJSON(k, o);
}
const lfConf = () => readJSON(LF_KEY);
const setLf = (patch) => { const o = lfConf(); Object.assign(o, patch); writeJSON(LF_KEY, o); };

// ------------------------------------------------------------------------------------------------ events
const subs = new Set();
function emit(type, extra) {
  const evt = Object.assign({ type }, extra || {});
  for (const f of subs) { try { f(evt); } catch (e) { console.error('[account] listener failed', e); } }
  appBus.emit('account', evt);
}

// ------------------------------------------------------------------------------------------------ requests
const configured = () => /^https?:\/\/[^\s/]+[^\s]*$/.test(base());
function device() {
  const u = (typeof navigator !== 'undefined' && navigator.userAgent) || '';
  const os = /Android/i.test(u) ? 'Android' : /iPhone|iPad/i.test(u) ? 'iPhone / iPad' : /Windows/i.test(u) ? 'Windows' : /Mac/i.test(u) ? 'Mac' : /Linux/i.test(u) ? 'Linux' : 'Browser';
  const br = /Edg\//.test(u) ? 'Edge' : /Firefox\//.test(u) ? 'Firefox' : /Chrome\//.test(u) ? 'Chrome' : /Safari\//.test(u) ? 'Safari' : 'Browser';
  return 'LIVE FIRE · ' + os + ' · ' + br;
}
function fail(message, status, extra) { return Object.assign(new Error(message), { status }, extra || {}); }
function statusMessage(s) {
  if (s === 429) return 'Too many attempts. Try again in a few minutes.';
  if (s >= 500) return 'The account server had a problem. Try again soon.';
  if (s === 404) return 'Not found on the account server.';
  return 'Request failed (' + s + ').';
}
const A = { lastError: '' };

async function call(method, path, data, o = {}) {
  if (!configured()) throw fail('The account server address is not valid (Account → Server).', 0, { offline: true });
  const tok = o.auth === false ? null : session().token;
  const headers = { 'Content-Type': 'application/json' };
  if (tok) headers.Authorization = 'Bearer ' + tok;
  const body = data ? JSON.stringify(data) : undefined;
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const t = ctl ? setTimeout(() => ctl.abort(), o.timeout || TIMEOUT) : 0;
  let r;
  try {
    const init = { method, headers, body, signal: ctl ? ctl.signal : undefined, cache: 'no-store' };
    if (o.keepalive && body && body.length < 60000) init.keepalive = true;   // page hide: the request outlives the page (64 KB limit)
    r = await fetch(base() + '/api' + path, init);
  } catch (e) {
    const off = typeof navigator !== 'undefined' && navigator.onLine === false, timedOut = !!(ctl && ctl.signal.aborted);
    A.lastError = off ? 'You are offline.' : timedOut ? 'The account server did not answer in time.' : 'Could not reach the account server.';
    throw fail(A.lastError, 0, { offline: true, timeout: timedOut });
  } finally { if (t) clearTimeout(t); }
  let j = {}; try { j = await r.json(); } catch (e) { j = {}; }
  if (r.status === 401 && tok && path !== '/login' && path !== '/signup' && session().token === tok) signedOut('expired', j.error);
  if (!r.ok) { A.lastError = (j && j.error) || statusMessage(r.status); throw fail(A.lastError, r.status, { field: j && j.field, rate: r.status === 429 }); }
  A.lastError = '';
  return j || {};
}

// ------------------------------------------------------------------------------------------------ sign in / out
let wasMember = false, lastUserId = null;
function signedIn(j) { setSession(j.token, j.user); syncAuth(); }
function signedOut(why, msg) { setSession(null, null); friendsCache = null; pend = { invites: [], requests: 0 }; syncAuth(why, msg); }
/** compare the stored session with what we last announced (sign in / out here, in Neon Veins, or in another tab) */
function syncAuth(why, msg) {
  const s = session(), m = !!(s.token && s.user), id = m ? s.user.id : null;
  if (m === wasMember && id === lastUserId) return;
  wasMember = m; lastUserId = id;
  if (m) startPresence(); else stopPresence();
  emit('auth', { member: m, user: s.user, why: why || (m ? 'signin' : 'signout'), message: msg || '' });
}

// ------------------------------------------------------------------------------------------------ presence + invites
let status = { activity: '', code: '' }, beatT = null, inflight = null, queued = null, pend = { invites: [], requests: 0 }, lastReq = 0;
const seenInv = new Set(), invKind = new Map();     // invite id -> true (LIVE FIRE) | false (Neon Veins co-op), decided once
try { for (const id of JSON.parse(sessionStorage.getItem('lf_seen_inv') || '[]')) seenInv.add(id); } catch (e) { /* none */ }
const remember = () => { try { sessionStorage.setItem('lf_seen_inv', JSON.stringify([...seenInv].slice(-40))); } catch (e) { /* ok */ } };
const isLF = a => /^LIVE FIRE\b/i.test(String(a || ''));
const tagLF = a => { a = String(a || '').replace(/[\u0000-\u001f]/g, ' ').trim(); return (isLF(a) ? a : 'LIVE FIRE · ' + (a || 'In the menus')).slice(0, 60); };

function derived() {
  const g = typeof window !== 'undefined' && window.LF && window.LF.game;
  if (!g) return { activity: 'LIVE FIRE · In the menus', code: '' };
  const mode = (g.mode && (g.mode.short || g.mode.name)) || 'Match', map = (g.def && g.def.name) || g.mapId || '';
  const host = g.authority === 'host', code = host && g.net && CODE_RE.test(g.net.code || '') ? g.net.code : '';
  const what = g.authority === 'local' ? 'Practice' : host ? 'Hosting' : 'Playing';
  return { activity: tagLF(what + ' ' + mode + (map ? ' · ' + map : '')), code };
}
function currentStatus() {
  if (status.activity || status.code) return { activity: tagLF(status.activity || derived().activity), code: CODE_RE.test(status.code || '') ? status.code : '' };
  return derived();
}
/** one heartbeat at a time; a call made while one is in flight runs once more right after it (so a new status is always sent) */
function beat() {
  if (queued) return queued;
  if (inflight) { queued = inflight.then(() => { queued = null; return beatNow(); }); return queued; }
  return beatNow();
}
function beatNow() { inflight = doBeat().finally(() => { inflight = null; }); return inflight; }
async function doBeat() {
  const s = session();
  if (!s.token || !configured() || (typeof document !== 'undefined' && document.hidden)) return null;
  try {
    const st = currentStatus();
    const j = await call('POST', '/presence', { activity: st.activity, join_code: st.code }, { timeout: 10000 });
    const inv = Array.isArray(j.invites) ? j.invites : [];
    const fresh = inv.filter(i => !seenInv.has(i.id));
    let friends = friendsCache;
    if (inv.some(i => !invKind.has(i.id))) { try { friends = await A.friends({ force: true }); } catch (e) { friends = friendsCache; } }
    const byName = new Map(((friends && friends.friends) || []).map(f => [String(f.username).toLowerCase(), f]));
    for (const i of inv) {
      if (!invKind.has(i.id)) {     // a LIVE FIRE invite: the sender is in LIVE FIRE and hosting with that code (Neon Veins co-op uses the same table)
        const f = byName.get(String(i.username).toLowerCase());
        invKind.set(i.id, !!f && isLF(f.activity) && (!f.join_code || f.join_code === i.code));
      }
      i.liveFire = invKind.get(i.id);
    }
    pend = { invites: inv, requests: j.requests | 0 };
    for (const i of fresh) { seenInv.add(i.id); emit('invite', { invite: i }); }
    if (fresh.length) remember();
    if (pend.requests > lastReq) emit('requests', { count: pend.requests });
    lastReq = pend.requests;
    emit('presence', { pending: pend, status: st });
    return j;
  } catch (e) { return null; }
}
function startPresence() { if (beatT || !session().token) return; setTimeout(beat, 1500); beatT = setInterval(beat, BEAT_MS); }
function stopPresence() { clearInterval(beatT); beatT = null; }
let statusT = null;
function statusChanged() { clearTimeout(statusT); statusT = setTimeout(beat, 400); }

// ------------------------------------------------------------------------------------------------ friends
let friendsCache = null, friendsAt = 0;
function decorate(j) {
  const out = { friends: [], incoming: Array.isArray(j.incoming) ? j.incoming : [], outgoing: Array.isArray(j.outgoing) ? j.outgoing : [] };
  for (const f of Array.isArray(j.friends) ? j.friends : []) {
    const lf = !!f.online && isLF(f.activity);
    out.friends.push(Object.assign({}, f, { liveFire: lf, joinable: lf && CODE_RE.test(f.join_code || ''), game: !f.online ? '' : lf ? 'LIVE FIRE' : 'NEON VEINS' }));
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ leaderboards
let boards = null;    // null unknown, true seen working, false: the server has no LIVE FIRE boards yet
function boardError(e) {
  if (e && (e.status === 404 || e.status === 500 || (e.status === 400 && /unknown board/i.test(e.message)))) { boards = false; return NO_BOARDS; }
  return (e && e.message) || 'Leaderboards are unavailable right now.';
}

// ------------------------------------------------------------------------------------------------ public API
let inited = false;
Object.assign(A, {
  NO_BOARDS, DEFAULT_API, CLOUD_SLOT,
  init() {
    if (inited) return A; inited = true;
    const s = session(); wasMember = !!(s.token && s.user); lastUserId = wasMember ? s.user.id : null;
    if (wasMember) startPresence();
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', e => { if (e.key === NV_KEY || e.key === LF_KEY || e.key === null) syncAuth('external'); });
      document.addEventListener('visibilitychange', () => { if (!document.hidden) { syncAuth('external'); beat(); } });
    }
    return A;
  },
  member: () => { const s = session(); return !!(s.token && s.user); },
  user: () => session().user,
  server: base, configured, sharedLogin: shared, neonVeinsServer: nvBase,
  setServer(u) {
    u = norm(u);
    if (u && !/^https?:\/\/[^\s]+$/.test(u)) throw fail('Enter a full address, like https://example.workers.dev', 0, { field: 'server' });
    const was = base(); setLf({ api: u || undefined });
    if (base() !== was) { friendsCache = null; boards = null; stopPresence(); wasMember = null; syncAuth('server'); emit('server', { server: base() }); }
  },
  on(fn) { subs.add(fn); return () => subs.delete(fn); },

  async signup(email, username, password) {
    const j = await call('POST', '/signup', { email: String(email || '').trim(), username: String(username || '').trim(), password, device: device() }, { auth: false });
    signedIn(j); return j.user;
  },
  async login(login, password) {
    const j = await call('POST', '/login', { login: String(login || '').trim(), password, device: device() }, { auth: false });
    signedIn(j); return j.user;
  },
  async logout() { const s = session(); if (s.token) { try { await call('POST', '/logout', null, { timeout: 6000 }); } catch (e) { /* signed out locally anyway */ } } signedOut('signout'); },
  async refresh() { const j = await call('GET', '/me'); const s = session(); if (s.token) setSession(s.token, j.user); emit('auth', { member: true, user: j.user, why: 'refresh' }); return j; },

  async friends(o = {}) {
    if (!o.force && friendsCache && Date.now() - friendsAt < FRIENDS_TTL) return friendsCache;
    const j = decorate(await call('GET', '/friends'));
    friendsCache = j; friendsAt = Date.now(); emit('friends', { friends: j });
    return j;
  },
  friendsCached: () => friendsCache,
  search: q => call('GET', '/users/search?q=' + encodeURIComponent(String(q || '').trim())),
  async request(username) { const j = await call('POST', '/friends/request', { username: String(username || '').trim() }); friendsAt = 0; return j; },
  async respond(id, accept) { const j = await call('POST', '/friends/respond', { id, accept: !!accept }); friendsAt = 0; pend.requests = Math.max(0, pend.requests - 1); lastReq = pend.requests; return j; },
  async unfriend(id) { const j = await call('DELETE', '/friends/' + encodeURIComponent(id)); friendsAt = 0; return j; },

  presence(activity, code) { A.setStatus({ activity, code }); return beat(); },
  setStatus(s) { status = s ? { activity: String(s.activity || ''), code: CODE_RE.test(s.code || '') ? s.code : '' } : { activity: '', code: '' }; statusChanged(); },
  status: currentStatus, beat, isLiveFire: isLF,
  pending: () => pend,
  async invite(friendId, code) { if (!CODE_RE.test(code || '')) throw fail('Host a game first.', 400); return call('POST', '/invites', { to: friendId, code }); },
  join(code, from) {
    code = String(code || '').toUpperCase();
    if (!CODE_RE.test(code)) return false;
    pend.invites = pend.invites.filter(i => i.code !== code);
    if (!appBus.count('net:join')) return false;
    appBus.emit('net:join', { code, from: from || null });
    return true;
  },

  async loadCloud() {
    // the slot list first: asking for a slot that does not exist yet answers 404, which browsers log as a console error
    const list = await call('GET', '/saves');
    if (!(list.saves || []).some(x => x.slot === CLOUD_SLOT)) return null;
    try {
      const j = await call('GET', '/saves/' + CLOUD_SLOT);
      let d = null; try { d = JSON.parse(j.data); } catch (e) { d = null; }
      const profile = d && typeof d === 'object' ? (d.profile && typeof d.profile === 'object' ? d.profile : null) : null;
      return { profile, summary: j.summary || '', updated: Number(j.updated) || 0 };
    } catch (e) { if (e.status === 404) return null; throw e; }
  },
  async saveCloud(profile, o = {}) {
    const data = JSON.stringify({ v: 1, game: 'livefire', profile });
    const updated = Math.round(Number(profile && profile.updated) || Date.now());
    const j = await call('PUT', '/saves/' + CLOUD_SLOT, { data, summary: String(o.summary || 'LIVE FIRE').slice(0, 200), updated }, { keepalive: !!o.keepalive, timeout: o.keepalive ? 8000 : TIMEOUT });
    setLf({ lastSync: Date.now(), cloudAt: j.updated || updated });
    return j;
  },
  async cloudInfo() { const j = await call('GET', '/saves'); return (j.saves || []).find(s => s.slot === CLOUD_SLOT) || null; },
  deleteCloud: () => call('DELETE', '/saves/' + CLOUD_SLOT),
  lastSync: () => lfConf().lastSync || 0,

  async submitScore(board, score, detail) {
    if (!A.member()) return { error: 'Sign in to post scores.' };
    if (boards === false) return { error: NO_BOARDS };
    try { const j = await call('PUT', '/scores/' + encodeURIComponent(board), { score: Math.floor(score), detail: detail || {} }); boards = true; return j; }
    catch (e) { return { error: boardError(e), status: e.status }; }
  },
  async getBoard(board) {
    if (!A.member()) return { error: 'Sign in to see the leaderboards.', auth: true };
    try { const j = await call('GET', '/scores/' + encodeURIComponent(board)); boards = true; return j; }
    catch (e) { return { error: boardError(e), status: e.status }; }
  },
  boardsAvailable: () => boards,
});

export const Account = A;
