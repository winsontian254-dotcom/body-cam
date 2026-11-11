// Accounts / progression / daily rewards test. Never touches the production server: the REAL Neon Veins worker
// (../NEON_VIENS/server/worker.js) runs locally on a fake D1 (tools/fake-nv-api.mjs) and the game is pointed at it.
//   node tools/test/account.mjs [--only=unit|browser] [--keep]          screenshots -> tools/test/out/account-*.png
// Part 1 (Node): XP curve, match recording, first win, boosts, loadout rules, purchases, cloud merge, 7-day rewards, crates.
// Part 2 (Chromium): shared nv_account_v1 login with "Neon Veins" (same-origin key, other keys preserved), sign up / sign in /
// sign out through the UI, cross-tab sync, account switching (profile stash), cloud save round trip + merge with a second device,
// a fresh device never overwriting cloud progress, daily reward claims across simulated days (Date offset), countdown, crate
// reveal, clock set back, first win of the day, presence + join codes, friends + JOIN, invites (LIVE FIRE vs Neon Veins co-op),
// leaderboards (patched worker) and the graceful "not available yet" on the unpatched worker, 401 -> signed out, 429 message,
// unreachable server. Zero unexpected console errors.
// LF_STUB_MISSING=1 serves `export default []` for js/maps/props/*.js files that another worker has not written yet (dev only).
import { launch, startServer, waitFor, shot, errors, OUT } from './lib.mjs';
import { cdnCache } from './smoke.mjs';
import { startFakeApi, defaultWorkerPath } from '../fake-nv-api.mjs';
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os'; import net from 'node:net';

process.removeAllListeners('warning'); process.on('warning', w => { if (w.name !== 'ExperimentalWarning') console.warn(w); });
const arg = k => { const a = process.argv.find(s => s.startsWith('--' + k + '=')); return a ? a.split('=')[1] : null; };
const ONLY = arg('only');
const fails = [];
let passes = 0;
const check = (cond, msg) => { if (!cond) { fails.push(msg); console.log('  FAIL ' + msg); } else { passes++; console.log('  ok   ' + msg); } };
const DAY = 86400000;
const warns = [];
/** screenshots are evidence, not assertions: a compositor starved by other test runs on the same machine must not crash the suite */
async function snap(page, name) {
  try { return await shot(page, name, { timeout: 120000 }); }
  catch (e) { warns.push('screenshot ' + name + ' skipped: ' + e.message.split('\n')[0]); console.log('  warn screenshot ' + name + ' skipped (' + e.message.split('\n')[0] + ')'); return null; }
}

// ================================================================================================ part 1: Node unit checks
async function unit() {
  console.log('\n[unit] progression + rewards (Node)');
  const { Profile, LEVEL_MAX, dayKey, boardScore } = await import('../../js/account/profile.js');
  const { Rewards, DAYS } = await import('../../js/account/rewards.js');
  const { GUNS, getGun } = await import('../../js/weapons/data.js');
  Profile.reset();
  // XP curve
  let mono = true, round = true;
  for (let L = 2; L <= LEVEL_MAX; L++) { if (Profile.xpForLevel(L) <= Profile.xpForLevel(L - 1)) mono = false; if (Profile.levelOf(Profile.xpForLevel(L)) !== L || Profile.levelOf(Profile.xpForLevel(L) - 1) !== L - 1) round = false; }
  check(mono && round, 'XP curve strictly increasing and levelOf(xpForLevel(L)) === L for 1..100');
  check(Profile.xpForLevel(2) <= 1200 && Profile.xpForLevel(100) > 1e6 && Profile.levelOf(1e12) === 100, 'level 2 after ~1 match, level 100 needs > 1M XP, capped at 100 (to 100: ' + Profile.xpForLevel(100) + ' XP)');
  check(Profile.xpForLevel(Math.max(...GUNS.map(g => g.unlockLevel || 1))) < Profile.xpForLevel(100), 'every gun unlocks before level 100');
  // a match
  const base = { mode: 'tdm', map: 'dev_range', result: 'win', kills: 14, deaths: 9, assists: 3, headshots: 5, damage: 2100, shots: 400, hits: 120, mvps: 1, time: 600, objectives: 0, bestStreak: 4,
    guns: { warden: { kills: 12, hs: 4, shots: 380, hits: 110, dmg: 1900 }, vogt9: { kills: 2, hs: 1, shots: 20, hits: 10 } } };
  const c0 = Profile.credits();
  const r1 = Profile.recordMatch(base);
  check(r1.firstWin && r1.xp === 2845 + 1500 && r1.matchCredits > 0, 'win: ' + r1.xp + ' XP (incl. first win), ' + r1.credits + ' credits, level ' + r1.prevLevel + ' -> ' + r1.level);
  check(r1.levelUps.length >= 2 && r1.unlocks.some(u => u.id === 'chispa') && Profile.owns('gun', 'chispa'), 'level-ups list their unlocks (Gallo Chispa at level 2) and unlock them');
  check(Profile.credits() === c0 + r1.credits, 'credits added (match + level-ups + gun mastery)');
  check(Profile.gunStats('warden').kills === 12 && Profile.gunStats('warden').level === 2, 'per-gun kills and mastery level (warden lvl ' + Profile.gunStats('warden').level + ')');
  const r2 = Profile.recordMatch(base);
  check(!r2.firstWin && r2.xp === 2845, 'second win the same day: no first-win bonus');
  const r3 = Profile.recordMatch({ ...base, mode: 'practice' });
  check(r3.xp === Math.round(2845 * .5), 'practice mode gives half XP (' + r3.xp + ')');
  const r4 = Profile.recordMatch({ ...base, god: true });
  check(r4.xp === 0 && r4.matchCredits === 0, 'god mode gives nothing');
  const r5 = Profile.recordMatch({ ...base, kills: 3, quit: true, time: 200 });
  check(r5.xp === Math.round(3 * 100 + 3 * 25 + 3 * 40 + 100 + 200 / 60 * 40) && Profile.stats().quits === 1, 'leaving early: no completion bonus, counted as quit (' + r5.xp + ' XP)');
  const st = Profile.stats();
  check(st.matches === 5 && st.kills === 14 * 4 + 3 && st.wins === 4 && Math.abs(st.accuracy - st.hits / st.shots) < 1e-9 && st.modes.practice.matches === 1, 'lifetime + per-mode stats');
  check(boardScore(base) === 14 * 100 + 3 * 40 + 5 * 25 + 50 + 500, 'leaderboard match score');
  // garbage in: no NaN
  const r6 = Profile.recordMatch({ kills: 'x', deaths: -5, time: NaN, guns: { nope: {}, warden: { kills: Infinity } }, result: 'bogus' });
  check(Number.isFinite(r6.xp) && Number.isFinite(Profile.get().xp) && Number.isFinite(Profile.credits()) && !JSON.stringify(Profile.get()).includes('null,null'), 'malformed summary: no NaN / Infinity in the profile');
  // loadouts
  const lo = Profile.setLoadout(1, { name: 'my <b>kit</b> with a very long name indeed', primary: 'bjorn', secondary: 'nope', nades: ['frag', 'frag', 'he', 'flash', 'flash', 'smoke'], mods: { avispa: { optic: 'o_12x', side: 's_light' } } });
  check(lo.primary !== 'bjorn' && getGun(lo.primary).slot === 'primary' && lo.secondary === 'vogt9', 'loadout: a locked gun and an unknown id are replaced (' + lo.primary + ' / ' + lo.secondary + ')');
  check(lo.nades.length === 3 && lo.nades.filter(n => n === 'frag' || n === 'he').length === 1, 'loadout: at most 3 grenades, one lethal (' + lo.nades.join(',') + ')');
  check(!(lo.mods.avispa && lo.mods.avispa.optic) && lo.name.length <= 20, 'loadout: locked attachment dropped, name trimmed to 20');
  Profile.get().cr.earned += 100000;
  const pr = Profile.price('gun', 'bjorn'); const b = Profile.buy('gun', 'bjorn');
  check(pr > 5000 && b.ok && Profile.owns('gun', 'bjorn') && Profile.setLoadout(1, { primary: 'bjorn' }).primary === 'bjorn', 'early unlock: buy a level-60 gun (' + pr + ' credits) and equip it');
  check(!Profile.buy('gun', 'bjorn').ok && Profile.buy('skin', 'nickel').ok && Profile.owns('skin', 'nickel'), 'buying twice is refused, skins are bought with credits');
  const loS = Profile.setLoadout(1, { skins: { bjorn: 'nickel', vogt9: 'cobalt' } });
  check(loS.skins.bjorn === 'nickel' && !loS.skins.vogt9, 'loadout skins: owned kept, unowned dropped');
  check(Profile.loadouts().length === 5 && Profile.loadout(1).primary === 'bjorn' && Profile.loadout(1).mods.bjorn, 'five loadouts; game loadout shape { primary, secondary, melee, nades, mods, skins }');
  // merge (two devices)
  const A = JSON.parse(JSON.stringify(Profile.get())), B = JSON.parse(JSON.stringify(Profile.get()));
  A.updated = 1000; A.xp += 500; A.cr.spent += 300; A.loadouts[0].name = 'DEVICE A'; A.stats.kills += 7; A.owned.skin.carbon = 1;
  B.updated = 2000; B.xp += 200; B.cr.earned += 900; B.loadouts[0].name = 'DEVICE B'; B.stats.deaths += 4; B.owned.att.o_12x = 1; B.rewards.last = '2030-01-02'; B.rewards.streak = 5;
  const M = Profile.merge(A, B);
  check(M.xp === A.xp && M.cr.spent === A.cr.spent && M.cr.earned === B.cr.earned && M.stats.kills === A.stats.kills && M.stats.deaths === B.stats.deaths, 'merge: counters take the larger value (xp, earned, spent, stats)');
  check(M.loadouts[0].name === 'DEVICE B' && M.owned.skin.carbon && M.owned.att.o_12x && M.rewards.streak === 5 && M.updated === 2000, 'merge: newest loadouts, owned items united, latest reward streak');
  // rewards: a full cycle with a missed day and a clock set back
  Profile.reset();
  const t0 = new Date(2026, 10, 7, 10, 0, 0).getTime();
  const days = [];
  for (let d = 0; d < 9; d++) { const c = Rewards.claim(t0 + d * DAY); days.push(c.ok ? c.day : 'x'); if (Rewards.claim(t0 + d * DAY + 3600e3).ok) days.push('DOUBLE'); }
  check(days.join(',') === '1,2,3,4,5,6,7,1,2', 'seven-day cycle, one claim per day (' + days.join(',') + ')');
  const s9 = Rewards.status(t0 + 8 * DAY + 2 * 3600e3);
  check(!s9.ready && s9.msToNext > 0 && s9.msToNext <= DAY && s9.streak === 9 && s9.best === 9 && s9.weekBonus === .1, 'claimed: countdown to local midnight, streak 9, week bonus +10%');
  check(Profile.get().owned.skin && Object.keys(Profile.get().owned.att).length >= 2 && Profile.boost().matches > 0, 'crates granted unlocks (atts: ' + Object.keys(Profile.get().owned.att).join(',') + '), boosts stacked (' + JSON.stringify(Profile.boost()) + ')');
  const gap = Rewards.status(t0 + 11 * DAY);
  check(gap.ready && gap.broken && gap.day === 1, 'a missed day resets the streak to day 1');
  const back = Rewards.status(t0 + 2 * DAY);
  check(!back.ready && back.clockBack && Rewards.claim(t0 + 2 * DAY).reason === 'clock', 'clock set back before the last claim: nothing to claim');
  check(DAYS[6].big && DAYS[6].items.some(i => i.type === 'crate' && i.crate === 'elite'), 'day 7 is the big one (Evidence Locker)');
  // crate draws are seeded (no reroll by reloading)
  const snap = JSON.stringify(Profile.get());
  Profile.get().crates.push({ id: 'lv10', kind: 'skin', from: 'LEVEL 10', t: 1 });
  const o1 = Rewards.openCrate('lv10');
  Profile.get().crates.push({ id: 'lv10', kind: 'skin', from: 'LEVEL 10', t: 1 }); for (const d of o1.drops) delete Profile.get().owned.skin[d.id]; Profile.get().opened.pop();
  const o2 = Rewards.openCrate('lv10');
  check(o1.ok && o2.ok && JSON.stringify(o1.drops) === JSON.stringify(o2.drops), 'crate draws are deterministic for the same crate (' + o1.drops.map(d => d.name).join(', ') + ')');
  check(!Rewards.openCrate('lv10').ok, 'an opened crate cannot be opened again');
  void snap; void dayKey;
  // first win of the day follows the local day
  Profile.reset();
  const fw = Rewards.firstWin();
  check(fw.ready && Profile.recordMatch(base).firstWin && !Rewards.firstWin().ready && Rewards.firstWin().msToReset > 0, 'first win of the day: ready, earned once, then counts down');
}

// ================================================================================================ part 2: browser + fake API
const DATE_SHIM = () => {
  const RD = Date; let off = 0;
  try { off = Number(localStorage.getItem('__lf_date_off') || 0) || 0; } catch (e) { off = 0; }
  function FD(...a) { if (!new.target) return new RD(RD.now() + off).toString(); return a.length ? new RD(...a) : new RD(RD.now() + off); }
  FD.prototype = RD.prototype; FD.now = () => RD.now() + off; FD.UTC = RD.UTC; FD.parse = RD.parse;
  window.Date = FD;
  window.__setDateOffset = ms => { off = ms; try { localStorage.setItem('__lf_date_off', String(ms)); } catch (e) { /* ok */ } };
};

async function browserPart() {
  console.log('\n[browser] fake Neon Veins API (real worker) + LIVE FIRE');
  const api = await startFakeApi({ port: 0 });
  const srv = await startServer();
  const browser = await launch();
  const allErr = [];
  const EXPECTED = /Failed to load resource: the server responded with a status of (400|401|404|429)|requestfailed: http:\/\/127\.0\.0\.1:\d+\/api\/login net::ERR_CONNECTION_REFUSED|Failed to load resource: net::ERR_CONNECTION_REFUSED/;
  const node = async (method, p, body, tok, base = api.url) => {
    const r = await fetch(base + '/api' + p, { method, headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}) }, body: body ? JSON.stringify(body) : undefined });
    let j = {}; try { j = await r.json(); } catch (e) { j = {}; } return { status: r.status, ...j };
  };
  async function context(opts = {}) {
    const ctx = await browser.newContext({ viewport: { width: 960, height: 540 } });
    ctx.setDefaultNavigationTimeout(180000); ctx.setDefaultTimeout(60000);    // other workers' tests share this machine (SwiftShader)
    await cdnCache(ctx);
    await ctx.addInitScript(DATE_SHIM);
    if (process.env.LF_STUB_MISSING) await ctx.route(/\/js\/maps\/props\/[a-z]+\.js$/, async r => { const resp = await r.fetch(); if (resp.status() === 404) return r.fulfill({ status: 200, contentType: 'text/javascript', body: 'export default [];' }); return r.fulfill({ response: resp }); });
    void opts; return ctx;
  }
  async function open(ctx, hash = '', label = '') {
    const page = await ctx.newPage(); const errs = errors(page);
    page.on('dialog', d => d.dismiss());
    await page.goto(srv.url + '/index.html' + (hash ? '#' + hash : ''), { waitUntil: 'load' });
    await waitFor(page, () => document.querySelector('#ui .mn-menu') && window.LF && LF.profile && LF.account, 120000);
    await page.evaluate(() => { window.__joined = null; LF.bus.on('net:join', e => { window.__joined = e; }); });
    page.__errs = errs; page.__label = label;
    return page;
  }
  const harvest = page => { for (const e of page.__errs) allErr.push(page.__label + ': ' + e); page.__errs.length = 0; };
  const nv = page => page.evaluate(() => JSON.parse(localStorage.getItem('nv_account_v1') || 'null'));
  const lf = (page, fn, arg) => page.evaluate(fn, arg);
  try {
    // ------------------------------------------------------------------------------------------ "Neon Veins" set up on the same origin
    const ctx = await context();
    const pre = await ctx.newPage();
    await pre.goto(srv.url + '/css/base.css');
    await pre.evaluate(a => localStorage.setItem('nv_account_v1', JSON.stringify({ api: a, autosync: true, had: { main: 1 }, lastSync: 12345, cloudAt: 678, token: null, user: null })), api.url);
    await pre.close();
    const p1 = await open(ctx, '', 'p1');
    check(await lf(p1, () => LF.account.server() === JSON.parse(localStorage.getItem('nv_account_v1')).api && LF.account.sharedLogin()), 'LIVE FIRE follows the Neon Veins server setting (shared login)');
    check(await lf(p1, () => !LF.account.member() && document.querySelector('.ac-chip.guest') !== null), 'guest chip on the title');
    // guest progress before signing up
    await lf(p1, () => LF.profile.recordMatch({ mode: 'tdm', result: 'win', kills: 5, deaths: 2, time: 300 }));
    const guestXp = await lf(p1, () => LF.profile.get().xp);
    // ------------------------------------------------------------------------------------------ sign up through the UI
    await p1.click('.ac-chip');
    await p1.waitForSelector('.ac-form');
    await snap(p1, 'account-signin');
    await p1.click('.ac-mode .lf-seg-b[data-id=signup]');
    await p1.fill('input[name=email]', 'alpha@livefire.test');
    await p1.fill('input[name=username]', 'AlphaSix');
    await p1.fill('input[name=password]', 'short');
    await p1.fill('input[name=confirm]', 'short');
    await p1.click('.ac-submit');
    check(/at least 8/.test(await p1.textContent('.ac-err')), 'client-side password rule shown before any request');
    await p1.fill('input[name=password]', 'Trigger9pull'); await p1.fill('input[name=confirm]', 'Trigger9pull');
    await p1.click('.ac-submit');
    await p1.waitForSelector('.ac-top', { timeout: 20000 });
    const s1 = await nv(p1);
    check(/^[0-9a-f]{64}$/.test(s1.token || '') && s1.user && s1.user.username === 'AlphaSix', 'signup stores token + user in nv_account_v1 (Neon Veins shape)');
    check(s1.api === api.url && s1.autosync === true && s1.had && s1.had.main === 1 && s1.lastSync === 12345 && s1.cloudAt === 678, 'Neon Veins keys in nv_account_v1 preserved (api, autosync, had, lastSync, cloudAt)');
    check(await lf(p1, () => !JSON.parse(localStorage.getItem('lf_account_v1') || '{}').token), 'no LIVE FIRE-only token when the server is shared');
    await p1.waitForFunction(() => LF.profile.syncState().state === 'ok', null, { timeout: 20000 });
    let tokA = s1.token; const idA = s1.user.id;
    const cloud1 = await node('GET', '/saves/livefire', null, tokA);
    check(cloud1.status === 200 && /^LIVE FIRE · Level \d+ · 5 kills$/.test(cloud1.summary) && JSON.parse(cloud1.data).profile.xp === guestXp, 'guest progress joined the new account and went to the cloud slot "livefire" (' + cloud1.summary + ')');
    check(await lf(p1, id => LF.profile.get().owner === id, idA), 'profile owner = account id');
    let bf = null;
    for (let i = 0; i < 100; i++) { bf = await node('GET', '/scores/' + encodeURIComponent('lf:tdm:all'), null, tokA); if (bf.top && bf.top.length) break; await new Promise(r => setTimeout(r, 200)); }
    check(bf.top && bf.top[0].name === 'AlphaSix' && bf.top[0].score === 1000 && bf.top[0].detail.k === 5, 'best match played as a guest is posted to lf:tdm:all after signing up (backfill)');
    // presence: default activity
    await lf(p1, () => LF.account.beat());
    let u = api.sql('SELECT activity, join_code, last_seen FROM users WHERE id = ?', idA)[0];
    check(u.activity === 'LIVE FIRE · In the menus' && u.join_code === '' && Date.now() - u.last_seen < 10000, 'presence heartbeat: "' + u.activity + '", no join code');
    await lf(p1, () => { LF.account.setStatus({ activity: 'Hosting TDM · Dev Range', code: 'ABC234' }); return LF.account.beat(); });
    u = api.sql('SELECT activity, join_code FROM users WHERE id = ?', idA)[0];
    check(u.activity === 'LIVE FIRE · Hosting TDM · Dev Range' && u.join_code === 'ABC234', 'hosting: activity prefixed "LIVE FIRE", join code sent');
    await lf(p1, () => { LF.account.setStatus(null); return LF.account.beat(); });
    check(api.sql('SELECT join_code FROM users WHERE id = ?', idA)[0].join_code === '', 'join code cleared when not hosting');
    // ------------------------------------------------------------------------------------------ friends + JOIN + invites
    const B = await node('POST', '/signup', { email: 'bravo@livefire.test', username: 'Bravo_7', password: 'Bravo7bravo', device: 'test' });
    const C = await node('POST', '/signup', { email: 'cleo@livefire.test', username: 'CleoNV', password: 'Cleo7cleo', device: 'test' });
    await node('POST', '/friends/request', { username: 'AlphaSix' }, B.token);
    await node('POST', '/friends/request', { username: 'AlphaSix' }, C.token);
    await node('POST', '/presence', { activity: 'LIVE FIRE · Hosting TDM · Dev Range', join_code: 'K7WQ2M' }, B.token);
    await node('POST', '/presence', { activity: 'Exploring New Avalon', join_code: '' }, C.token);
    await p1.click('.lf-tab[data-id=friends]');
    await p1.waitForSelector('.ac-reqs .lf-btn.primary', { timeout: 15000 });
    const accepts = await p1.$$('.ac-reqs .lf-btn.primary');
    for (let i = 0; i < accepts.length; i++) { await p1.click('.ac-reqs .lf-btn.primary'); await p1.waitForTimeout(600); }
    await p1.waitForFunction(() => document.querySelectorAll('.ac-list .ac-row').length === 2, null, { timeout: 15000 });
    const rows = await p1.$$eval('.ac-list .ac-row', rs => rs.map(r => ({ t: r.textContent, join: !!r.querySelector('.lf-btn.primary') })));
    const rB = rows.find(r => r.t.includes('Bravo_7')), rC = rows.find(r => r.t.includes('CleoNV'));
    check(rB && rB.join && /CODE K7WQ2M/.test(rB.t) && rC && !rC.join && /NEON VEINS/.test(rC.t), 'friends list: LIVE FIRE host has JOIN, a Neon Veins player shows as NEON VEINS without JOIN');
    await snap(p1, 'account-friends');
    await p1.click('.ac-list .ac-row .lf-btn.primary');
    check(await lf(p1, () => window.__joined && window.__joined.code === 'K7WQ2M' && window.__joined.from === 'Bravo_7'), 'JOIN hands the code to the multiplayer layer (appBus net:join)');
    // invites: LIVE FIRE (joinable) and Neon Veins co-op (not)
    await node('POST', '/invites', { to: idA, code: 'K7WQ2M' }, B.token);
    await node('POST', '/presence', { activity: 'Hosting co-op', join_code: 'NV99AA' }, C.token);
    await node('POST', '/invites', { to: idA, code: 'NV99AA' }, C.token);
    await lf(p1, () => { window.__joined = null; return LF.account.beat(); });
    await p1.waitForFunction(() => document.querySelectorAll('.ac-inv').length === 2, null, { timeout: 15000 });
    await p1.waitForTimeout(400);
    const inv = await p1.$$eval('.ac-inv', cs => cs.map(c => ({ t: c.textContent, join: [...c.querySelectorAll('button')].some(b => b.textContent === 'JOIN') })));
    check(inv.some(i => /LIVE FIRE/.test(i.t) && i.join && /K7WQ2M/.test(i.t)) && inv.some(i => /NEON VEINS CO-OP/.test(i.t) && !i.join), 'invite cards: LIVE FIRE invite with JOIN, Neon Veins co-op invite without');
    await snap(p1, 'account-invites');
    await p1.click('.ac-inv:not(.nv) .lf-btn.primary');
    check(await lf(p1, () => window.__joined && window.__joined.code === 'K7WQ2M'), 'JOIN on an invite card');
    await lf(p1, () => LF.account.beat());
    check(await p1.$$eval('.ac-inv', cs => cs.length) <= 2, 'an invite toasts once (no repeat on the next heartbeat)');
    // ------------------------------------------------------------------------------------------ cloud save: second device + merge
    const local1 = await lf(p1, () => ({ xp: LF.profile.get().xp, kills: LF.profile.stats().kills }));
    const devB = JSON.parse(cloud1.data).profile;
    devB.xp = local1.xp + 5000; devB.stats.deaths = 99; devB.owned.skin.carbon = 1; devB.loadouts[2].name = 'FROM DEVICE B'; devB.cr.earned += 4000; devB.updated = Date.now() + 60000;
    await node('PUT', '/saves/livefire', { data: JSON.stringify({ v: 1, game: 'livefire', profile: devB }), summary: 'LIVE FIRE · device B', updated: devB.updated }, tokA);
    await lf(p1, () => LF.profile.sync());
    const m1 = await lf(p1, () => { const p = LF.profile.get(); return { xp: p.xp, deaths: p.stats.deaths, kills: p.stats.kills, carbon: !!p.owned.skin.carbon, name: p.loadouts[2].name, cr: LF.profile.credits() }; });
    check(m1.xp === local1.xp + 5000 && m1.deaths === 99 && m1.kills === local1.kills && m1.carbon && m1.name === 'FROM DEVICE B', 'sync merges the other device: max counters, union of skins, newest loadouts');
    await lf(p1, () => { LF.profile.recordMatch({ mode: 'tdm', result: 'loss', kills: 9, deaths: 11, assists: 2, time: 480, shots: 300, hits: 80 }); return LF.profile.flush(); });
    const cloud2 = JSON.parse((await node('GET', '/saves/livefire', null, tokA)).data).profile;
    check(cloud2.xp === (await lf(p1, () => LF.profile.get().xp)) && cloud2.stats.kills === local1.kills + 9, 'local progress pushed to the cloud (flush)');
    // fresh device: guest progress + sign in must not overwrite the cloud
    const ctx3 = await context();
    const pre3 = await ctx3.newPage(); await pre3.goto(srv.url + '/css/base.css');
    await pre3.evaluate(a => localStorage.setItem('nv_account_v1', JSON.stringify({ api: a })), api.url); await pre3.close();
    const p3 = await open(ctx3, '', 'p3');
    await lf(p3, () => LF.profile.recordMatch({ mode: 'tdm', result: 'loss', kills: 1, time: 120 }));
    await lf(p3, () => LF.account.login('alpha@livefire.test', 'Trigger9pull'));
    await p3.waitForFunction(() => LF.profile.syncState().state === 'ok', null, { timeout: 20000 });
    const d3 = await lf(p3, () => ({ xp: LF.profile.get().xp, kills: LF.profile.stats().kills, member: LF.account.member() }));
    const cloud3 = JSON.parse((await node('GET', '/saves/livefire', null, tokA)).data).profile;
    check(d3.member && d3.xp >= cloud2.xp && cloud3.xp >= cloud2.xp && cloud3.stats.kills >= cloud2.stats.kills, 'a fresh device signing in keeps the cloud progress (xp ' + cloud2.xp + ' -> ' + cloud3.xp + ')');
    harvest(p3); await ctx3.close();
    // ------------------------------------------------------------------------------------------ cross-tab + Neon Veins signing another user in
    const p2 = await open(ctx, '', 'p2');
    check(await lf(p2, () => LF.account.member() && LF.account.user().username === 'AlphaSix'), 'second tab is signed in through the shared key');
    await lf(p2, () => LF.account.logout());
    await p1.waitForFunction(() => !LF.account.member(), null, { timeout: 10000 });
    const s2 = await nv(p1);
    check(s2.token === null && s2.user === null && s2.api === api.url && s2.had && s2.had.main === 1 && s2.autosync === true, 'sign out in one tab signs out the other; Neon Veins keys kept');
    // "Neon Veins" signs Bravo in (writes the shared key the way NV.Account does)
    await p2.evaluate(([t, us]) => { const o = JSON.parse(localStorage.getItem('nv_account_v1')); o.token = t; o.user = us; localStorage.setItem('nv_account_v1', JSON.stringify(o)); }, [B.token, B.user]);
    await p1.waitForFunction(() => LF.account.member() && LF.account.user().username === 'Bravo_7', null, { timeout: 10000 });
    await p1.waitForFunction(() => LF.profile.syncState().state === 'ok', null, { timeout: 20000 });
    const swB = await lf(p1, idA => ({ owner: LF.profile.get().owner, xp: LF.profile.get().xp, stash: !!localStorage.getItem('lf_profile_v1_u' + idA) }), idA);
    check(swB.owner === B.user.id && swB.stash && swB.xp < local1.xp, 'another account signed in (via Neon Veins): AlphaSix profile parked, Bravo gets his own (xp ' + swB.xp + ')');
    await lf(p1, () => LF.account.logout());
    // sign back in as Alpha through the UI (username login)
    await p1.waitForSelector('.ac-form input[name=login]');
    await p1.waitForTimeout(150);
    await p1.fill('input[name=login]', 'AlphaSix'); await p1.fill('input[name=password]', 'wrong-pass1');
    await p1.click('.ac-submit');
    await p1.waitForFunction(() => { const e = document.querySelector('.ac-err'); return e && e.textContent && !document.querySelector('.ac-submit:disabled'); }, null, { timeout: 15000 }).catch(() => {});
    const wrong = await p1.evaluate(() => (document.querySelector('.ac-err') || {}).textContent || '');
    check(/Wrong/.test(wrong), 'wrong password: server message shown (' + wrong + ')');
    await p1.waitForSelector('.ac-form input[name=password]');
    await p1.fill('input[name=password]', 'Trigger9pull'); await p1.click('.ac-submit');
    await p1.waitForSelector('.ac-top', { timeout: 15000 });
    await p1.waitForFunction(() => LF.profile.syncState().state === 'ok', null, { timeout: 20000 });
    check(await lf(p1, x => LF.profile.get().owner === x.id && LF.profile.get().xp >= x.xp, { id: idA, xp: cloud3.xp }), 'signing back in restores AlphaSix progress');
    tokA = (await nv(p1)).token;      // the earlier session was signed out in tab 2
    await p1.click('.lf-tab[data-id=record]'); await p1.waitForTimeout(300);
    await snap(p1, 'account-record');
    // ------------------------------------------------------------------------------------------ leaderboards (patched worker)
    await lf(p1, () => LF.profile.recordMatch({ mode: 'tdm', map: 'dev_range', result: 'win', kills: 22, deaths: 6, assists: 4, headshots: 9, time: 600, mvps: 1 }));
    const month = await lf(p1, () => { const d = new Date(); return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0'); });
    let board = null;
    const want = 22 * 100 + 4 * 40 + 9 * 25 + 50 + 500;      // the board already holds the 9-kill loss (980): wait for the new best
    for (let i = 0; i < 100; i++) { board = await node('GET', '/scores/' + encodeURIComponent('lf:tdm:' + month), null, C.token); if (board.top && board.top.length && board.top[0].score === want) break; await new Promise(r => setTimeout(r, 200)); }
    check(board.top && board.top[0].name === 'AlphaSix' && board.top[0].score === want && board.top[0].detail.k === 22, 'match score posted to lf:tdm:' + month + ' (' + (board.top && board.top[0] && board.top[0].score) + ')');
    let xpb = null; const xpNow = await lf(p1, () => LF.profile.get().xp);
    for (let i = 0; i < 100; i++) { xpb = await node('GET', '/scores/lf:xp:all', null, C.token); if (xpb.top && xpb.top.length && xpb.top[0].score === xpNow) break; await new Promise(r => setTimeout(r, 200)); }
    check(xpb.top && xpb.top[0].score === xpNow && xpb.top[0].detail.lv > 1, 'total XP posted to lf:xp:all (' + xpNow + ', level ' + (xpb.top && xpb.top[0] && xpb.top[0].detail.lv) + ')');
    await p1.click('.lf-tab[data-id=boards]');
    await p1.waitForSelector('.ac-br.me', { timeout: 15000 });
    await snap(p1, 'account-boards');
    check(await p1.$eval('.ac-br.me', e => /AlphaSix/.test(e.textContent)), 'leaderboard UI shows your row');
    // ------------------------------------------------------------------------------------------ daily rewards across days (UI)
    await p1.click('.pr-back');
    await p1.click('.mn-item[data-id=rewards]');
    await p1.waitForSelector('.rw-claim-btn');
    await snap(p1, 'account-rewards-ready');
    await p1.click('.rw-claim-btn');
    await p1.waitForSelector('.rw-reveal .rw-card.in', { timeout: 10000 });
    await p1.keyboard.press('Enter'); await p1.keyboard.press('Enter');
    await p1.waitForSelector('.rw-cd', { timeout: 10000 });
    const cd1 = await p1.textContent('.rw-cd'); await p1.waitForTimeout(2100); const cd2 = await p1.textContent('.rw-cd');
    check(/^\d\d:\d\d:\d\d$/.test(cd1) && cd1 !== cd2, 'claimed: live countdown to the next drop (' + cd1 + ' -> ' + cd2 + ')');
    const tz = await lf(p1, () => { const s = LF.rewards.status(); const d = new Date(); const mid = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime(); return Math.abs(mid - Date.now() - s.msToNext) < 2000; });
    check(tz, 'countdown ends at local midnight');
    check(!(await p1.$('.rw-claim-btn')), 'claim button gone after claiming');
    // next days: shift the clock one day at a time
    const now0 = await lf(p1, () => Date.now());
    let dayLog = [];
    for (let d = 1; d <= 6; d++) {
      const base = new Date(now0); const target = new Date(base.getFullYear(), base.getMonth(), base.getDate() + d, 12, 0, 0).getTime();
      await p1.evaluate(t => window.__setDateOffset(t - (Date.now() - (Number(localStorage.getItem('__lf_date_off')) || 0))), target);
      await p1.waitForSelector('.rw-claim-btn', { timeout: 10000 });
      const label = await p1.textContent('.rw-claim-btn');
      dayLog.push(label.replace('CLAIM ', ''));
      await p1.click('.rw-claim-btn');
      await p1.waitForSelector('.rw-reveal .rw-card.in', { timeout: 15000 });
      if (d === 6) { await p1.waitForTimeout(2600); await snap(p1, 'account-rewards-day7'); }
      if (d === 3) { await p1.waitForTimeout(2200); await snap(p1, 'account-rewards-crate'); }
      await p1.keyboard.press('Enter'); await p1.waitForTimeout(100); await p1.keyboard.press('Enter');
      await p1.waitForSelector('.rw-cd', { timeout: 10000 });
    }
    check(dayLog.join(',') === 'DAY 2,DAY 3,DAY 4,DAY 5,DAY 6,DAY 7', 'consecutive days advance the cycle to day 7 (' + dayLog.join(',') + ')');
    const r7 = await lf(p1, () => ({ st: LF.rewards.status(), atts: Object.keys(LF.profile.get().owned.att).length, skins: Object.keys(LF.profile.get().owned.skin).length, boost: LF.profile.boost() }));
    check(r7.st.streak === 7 && r7.atts >= 2 && r7.skins >= 3 && r7.boost.matches > 0, 'week complete: streak 7, crates unlocked items, XP boost active');
    await snap(p1, 'account-rewards-week');
    // skip two days: streak resets
    await p1.evaluate(() => { const b = new Date(); const t = new Date(b.getFullYear(), b.getMonth(), b.getDate() + 3, 12).getTime(); window.__setDateOffset(t - (Date.now() - (Number(localStorage.getItem('__lf_date_off')) || 0))); });
    await p1.waitForSelector('.rw-claim-btn', { timeout: 10000 });
    check((await p1.textContent('.rw-claim-btn')) === 'CLAIM DAY 1' && /missed a day/.test(await p1.textContent('.rw-day')), 'missed days: back to DAY 1 with a message');
    // clock back before the last claim
    await p1.evaluate(() => window.__setDateOffset(-20 * 86400000));
    await p1.waitForSelector('.rw-cd', { timeout: 10000 });
    check(/CLOCK CHECK/.test(await p1.textContent('.rw-day')) && (await lf(p1, () => LF.rewards.claim().reason)) === 'clock', 'clock set back: nothing to claim, clock message');
    await snap(p1, 'account-rewards-clock');
    await p1.evaluate(() => window.__setDateOffset(0));
    // the streak followed the account to the cloud
    await lf(p1, () => LF.profile.flush());
    const cloudR = JSON.parse((await node('GET', '/saves/livefire', null, tokA)).data).profile.rewards;
    check(cloudR.claims >= 7 && cloudR.best >= 7, 'reward streak saved in the cloud profile (claims ' + cloudR.claims + ', best ' + cloudR.best + ')');
    // ------------------------------------------------------------------------------------------ 401: session revoked on the server
    await p1.click('.pr-back');
    await node('POST', '/logout-all', null, tokA);
    await lf(p1, () => LF.account.refresh().catch(e => e.status));
    await p1.waitForFunction(() => !LF.account.member(), null, { timeout: 10000 });
    const s3 = await nv(p1);
    check(s3.token === null && s3.api === api.url && s3.had.main === 1, '401 signs out (shared key cleared, Neon Veins keys kept)');
    await p1.waitForSelector('.lf-toast', { timeout: 5000 }).catch(() => {});
    check(await p1.evaluate(() => [...document.querySelectorAll('.lf-toast')].some(t => /SESSION EXPIRED/.test(t.textContent))), 'session-expired toast');
    // 429: too many wrong passwords
    const rl = await lf(p1, async () => { let m = ''; for (let i = 0; i < 10; i++) { try { await LF.account.login('Bravo_7', 'nope-nope1'); } catch (e) { m = e.status + ' ' + e.message; } } return m; });
    check(/^429 Too many attempts/.test(rl), 'rate limit: "' + rl + '"');
    harvest(p1); harvest(p2);
    // ------------------------------------------------------------------------------------------ unpatched server: graceful leaderboards
    // the server as deployed before LIVE FIRE: the same worker with the original board list (no lf: boards)
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nv-old-'));
    let old = null;
    try {
      const wsrc = fs.readFileSync(defaultWorkerPath(), 'utf8');
      const oldSrc = wsrc.replace(/^const BOARD_RE = .*$/m, 'const BOARD_RE = /^(d:\\d{4}-\\d\\d-\\d\\d|w:\\d{4}-W\\d\\d|drift)$/;');
      if (oldSrc === wsrc && /lf:/.test(wsrc)) throw new Error('BOARD_RE line not found');
      fs.writeFileSync(path.join(tmp, 'worker.js'), oldSrc);
      fs.copyFileSync(path.join(path.dirname(defaultWorkerPath()), 'schema.sql'), path.join(tmp, 'schema.sql'));
      old = await startFakeApi({ port: 0, worker: path.join(tmp, 'worker.js') });
    } catch (e) { fails.push('could not build the pre-LIVE FIRE worker: ' + e.message); }
    if (old) {
      const ctx4 = await context();
      const p4 = await open(ctx4, 'dev&api=' + old.url, 'p4');
      check(await lf(p4, () => !LF.account.sharedLogin()), '#dev&api= to a different server keeps the login LIVE FIRE-only');
      await lf(p4, () => LF.account.signup('d@livefire.test', 'DeltaOld', 'Delta9delta'));
      check(await lf(p4, () => !JSON.parse(localStorage.getItem('nv_account_v1') || '{}').token && !!JSON.parse(localStorage.getItem('lf_account_v1')).token), 'foreign server: session kept in lf_account_v1, Neon Veins untouched');
      const gb = await lf(p4, () => LF.account.getBoard('lf:tdm:all'));
      const sb = await lf(p4, () => LF.account.submitScore('lf:tdm:all', 1000, {}));
      check(gb.error === 'Leaderboards are not available yet.' && sb.error === gb.error, 'old server: getBoard / submitScore return { error: "' + gb.error + '" }');
      await lf(p4, () => LF.profile.recordMatch({ mode: 'tdm', result: 'win', kills: 3, time: 300 }));
      await p4.click('.mn-item[data-id=account]'); await p4.click('.lf-tab[data-id=boards]');
      await p4.waitForSelector('.ac-empty.nb', { timeout: 10000 });
      await snap(p4, 'account-boards-unavailable');
      check(true, 'leaderboard screen shows "not available yet"');
      harvest(p4); await ctx4.close(); await old.stop();
    }
    fs.rmSync(tmp, { recursive: true, force: true });
    // ------------------------------------------------------------------------------------------ unreachable server
    const ctx5 = await context();
    const dead = await new Promise(r => { const sv = net.createServer().listen(0, '127.0.0.1', () => { const pt = sv.address().port; sv.close(() => r(pt)); }); });
    const p5 = await open(ctx5, 'dev&api=http://127.0.0.1:' + dead, 'p5');
    const off = await lf(p5, async () => { try { await LF.account.login('x', 'y'); return 'no error'; } catch (e) { return e.status + ' ' + e.message; } });
    check(/^0 Could not reach the account server/.test(off), 'unreachable server: "' + off + '"');
    harvest(p5); await ctx5.close();
    // ------------------------------------------------------------------------------------------ a real match is recorded (Profile.autoTrack)
    {
      const ctx6 = await context();
      const page = await ctx6.newPage(); const errs = errors(page);
      await page.goto(srv.url + '/index.html#dev&map=dev_range&mode=tdm&bots=3&q=low&autostart&nolens&nodyn&seed=5&freeze=0&warmup=0&score=8', { waitUntil: 'load' });
      await waitFor(page, () => window.LF && LF.game && LF.game.match && LF.profile, 180000);
      await page.waitForTimeout(900);                          // autoTrack polls LF.game every 0.4 s
      const act = await page.evaluate(() => LF.account.status().activity);
      check(/^LIVE FIRE · Practice TDM/.test(act), 'presence activity follows the running match ("' + act + '")');
      const res = await page.evaluate(() => {
        const g = LF.game, me = g.local; let guard = 0, atEnd = -1;
        g.bus.on('match:end', () => { atEnd = me.stat.shots; });   // ticks after the end (same debugStep) may still fire
        const foes = () => [...g.players.values()].filter(p => p.alive && p.team !== me.team);
        while (g.match.phase !== 'over' && guard++ < 900) {
          const f = foes()[0];
          if (f && me.alive) { g.aimAt(f, 'chest'); g.setLocalCommand({ buttons: guard % 2 ? 1 : 0 }); } else g.setLocalCommand(null);
          g.debugStep(0.25);
        }
        g.setLocalCommand(null);
        return { phase: g.match.phase, shots: atEnd >= 0 ? atEnd : me.stat.shots, kills: me.kills };
      });
      await page.waitForFunction(() => LF.profile.lastMatch, null, { timeout: 10000 }).catch(() => {});
      const rec = await page.evaluate(() => { const m = LF.profile.lastMatch; return m && { s: m.summary, r: { xp: m.result.xp, credits: m.result.credits, lines: m.result.breakdown.length }, matches: LF.profile.stats().matches, guns: Object.keys(LF.profile.get().guns) }; });
      check(res.phase === 'over' && rec && rec.s.mode === 'tdm' && rec.s.map === 'dev_range' && rec.matches === 1 && rec.r.xp > 0 && rec.r.credits > 0,
        'match end recorded automatically: ' + (rec ? rec.s.result + ', ' + rec.s.kills + ' K / ' + rec.s.deaths + ' D, ' + rec.r.xp + ' XP, ' + rec.r.credits + ' CR' : 'nothing recorded') + ' (' + res.shots + ' shots)');
      check(rec && rec.s.shots === res.shots && (res.shots === 0 || rec.guns.length > 0), 'per-gun numbers tracked from the match events (' + (rec && rec.guns.join(',')) + ')');
      for (const e of errs) allErr.push('match: ' + e);
      await ctx6.close();
    }
    await snap(p1, 'account-title-after');
    harvest(p1); harvest(p2);
    await ctx.close();
  } finally {
    await browser.close(); srv.stop(); await api.stop();
  }
  const unexpected = allErr.filter(e => !EXPECTED.test(e));
  const expected = allErr.length - unexpected.length;
  check(unexpected.length === 0, 'zero unexpected console errors (' + expected + ' expected 4xx / unreachable logs from deliberate failures)' + (unexpected.length ? ' -> ' + unexpected.join(' | ') : ''));
}

const t0 = Date.now();
try {
  if (ONLY !== 'browser') await unit();
  if (ONLY !== 'unit') await browserPart();
} catch (e) { fails.push('crashed: ' + (e.stack || e.message)); console.log(e); }
if (warns.length) console.log('\nWARNINGS:\n  ' + warns.join('\n  '));
console.log('\n' + passes + ' passed, ' + fails.length + ' failed in ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s; screenshots in ' + OUT);
if (fails.length) { console.log('FAILURES:\n  ' + fails.join('\n  ')); process.exit(1); }
process.exit(0);
