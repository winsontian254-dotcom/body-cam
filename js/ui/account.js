/* LIVE FIRE — account screens: sign in / create account with a Neon Veins account, friends (online state, JOIN for friends hosting
   LIVE FIRE, requests, invites), leaderboards, service record (stats), cloud save + server settings, sign out. Styles: css/rewards.css.
   Exports:
     openAccount(tab?)           pushes the account screen ('friends' | 'boards' | 'record' | 'account'; signed out: the sign-in form)
     accountScreen(tab?) -> screen
     mountAccountChip(el) -> el   the signed-in chip (name, colour, level, XP bar) for the title screen's top-right corner; click = openAccount
     installAccountUI()          once at boot: invite cards with JOIN, friend-request / session / level-up toasts (main.js calls it)
   Copy rule: say plainly that this IS the Neon Veins account (same username, password, friends; signing in here signs in there too). */
import { UI } from './ui.js';
import { appBus } from '../core/events.js';
import { Account } from '../account/api.js';
import { Profile, LEVEL_MAX, monthKey } from '../account/profile.js';
import { MODES } from '../modes/index.js';
import { getGun } from '../weapons/data.js';

const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sfx = n => { try { const A = window.LF && window.LF.audio; if (A) A.ui(n); } catch (e) { /* audio is optional */ } };
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const col = c => (COLOR_RE.test(c || '') ? c : '#19f0ff');
const fmtN = n => Math.round(n || 0).toLocaleString('en-US');
const pct = v => (v * 100).toFixed(1) + '%';
function ago(ms) {
  if (!ms) return 'NEVER';
  const s = Math.max(0, (Date.now() - ms) / 1000);
  if (s < 90) return 'JUST NOW';
  if (s < 3600) return Math.round(s / 60) + ' MIN AGO';
  if (s < 86400 * 2) return Math.round(s / 3600) + ' H AGO';
  return Math.round(s / 86400) + ' DAYS AGO';
}
const hours = s => (s >= 3600 ? (s / 3600).toFixed(1) + ' H' : Math.round(s / 60) + ' MIN');
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/, USER_RE = /^[A-Za-z0-9_-]{3,20}$/;

// ------------------------------------------------------------------------------------------------ chip (title screen)
export function mountAccountChip(container) {
  const chip = h('button', 'ac-chip');
  chip.type = 'button';
  const render = () => {
    const u = Account.member() ? Account.user() : null, info = Profile.levelInfo();
    const bar = '<span class="ac-chip-bar"><b style="width:' + Math.round(info.frac * 100) + '%"></b></span>';
    chip.classList.toggle('guest', !u);
    chip.innerHTML = u
      ? '<i class="ac-dot" style="--c:' + col(u.color) + '"></i><span class="ac-chip-t"><b>' + esc(u.username) + '</b><small>LVL ' + info.level + ' · ' + fmtN(Profile.credits()) + ' CR</small>' + bar + '</span>'
      : '<i class="ac-dot off"></i><span class="ac-chip-t"><b>GUEST</b><small>LVL ' + info.level + ' · SIGN IN WITH NEON VEINS</small>' + bar + '</span>';
    chip.title = u ? 'Signed in with your Neon Veins account' : 'Sign in with your Neon Veins account';
  };
  chip.onclick = () => { sfx('click'); openAccount(); };
  render();
  const offs = [];
  let seen = false;      // built before the title is attached: unsubscribe only after it was in the page and left it
  const live = () => { if (chip.isConnected) { seen = true; return true; } if (seen) { offs.forEach(f => f()); offs.length = 0; return false; } return true; };
  offs.push(Account.on(() => { if (live()) render(); }), Profile.onChange(() => { if (live()) render(); }));
  container.appendChild(chip);
  return chip;
}

// ------------------------------------------------------------------------------------------------ global listeners (boot)
let installed = false, inviteBox = null;
function inviteCard(inv) {
  if (!inviteBox || !inviteBox.isConnected) { inviteBox = h('div', 'ac-invites'); document.getElementById('app').appendChild(inviteBox); }
  const lf = !!inv.liveFire;
  const c = h('div', 'ac-inv' + (lf ? '' : ' nv'), '<div class="ac-inv-h"><i></i>' + (lf ? 'INVITE · LIVE FIRE' : 'INVITE · NEON VEINS CO-OP') + '</div>'
    + '<div class="ac-inv-n"><i class="ac-dot" style="--c:' + col(inv.color) + '"></i><b>' + esc(inv.username) + '</b></div>'
    + '<div class="ac-inv-s">' + (lf ? 'invited you to their game · CODE <b>' + esc(inv.code) + '</b>' : 'invited you to Neon Veins co-op. Open Neon Veins to join.') + '</div>'
    + '<div class="ac-inv-b"></div>');
  const close = () => { c.classList.remove('in'); setTimeout(() => c.remove(), 250); };
  const b = c.querySelector('.ac-inv-b');
  if (lf) b.appendChild(UI.button('JOIN', () => { close(); joinCode(inv.code, inv.username); }, 'primary'));
  b.appendChild(UI.button('DISMISS', close, 'ghost'));
  inviteBox.appendChild(c);
  requestAnimationFrame(() => c.classList.add('in'));
  setTimeout(close, 14000);
}
function joinCode(code, from) {
  const g = window.LF && window.LF.game;
  if (g) { UI.toast('LEAVE YOUR MATCH FIRST TO JOIN ' + code, { kind: 'warn', ms: 3600 }); return false; }
  const ok = Account.join(code, from);
  if (!ok) UI.toast('MULTIPLAYER IS NOT AVAILABLE IN THIS BUILD YET · CODE ' + code, { kind: 'warn', ms: 4200 });
  else sfx('click');
  return ok;
}
export function installAccountUI() {
  if (installed) return; installed = true;
  Account.on(e => {
    if (e.type === 'invite' && e.invite) { inviteCard(e.invite); sfx('notify'); }
    else if (e.type === 'requests') UI.toast('FRIEND REQUEST · ' + e.count + ' PENDING · ACCOUNT → FRIENDS', { kind: 'info', ms: 4200 });
    else if (e.type === 'auth' && e.why === 'expired') UI.toast('SESSION EXPIRED — SIGN IN AGAIN (ACCOUNT)', { kind: 'warn', ms: 5000 });
    else if (e.type === 'auth' && e.why === 'external') UI.toast(e.member ? 'SIGNED IN AS ' + String(e.user && e.user.username || '').toUpperCase() + ' (NEON VEINS / ANOTHER TAB)' : 'SIGNED OUT IN ANOTHER TAB', { kind: 'info', ms: 3200 });
  });
  appBus.on('profile:level', g => {
    if (window.LF && window.LF.game) return;          // the results screen shows level-ups after a match
    if (g && g.levelUps && g.levelUps.length) { UI.toast('LEVEL ' + g.to + ' REACHED' + (g.unlocks.length ? ' · ' + g.unlocks.length + ' UNLOCK' + (g.unlocks.length > 1 ? 'S' : '') : ''), { kind: 'ok', ms: 3800 }); sfx('unlock'); }
  });
}

// ------------------------------------------------------------------------------------------------ screen
export function openAccount(tab) { const ex = UI.find('account'); if (ex && UI.top() === ex) { ex.render(tab); return ex; } return UI.push(accountScreen(tab)); }

export function accountScreen(tab0) {
  const s = UI.screen('account', `
    <div class="mn-bg"><div class="mn-scan"></div><div class="mn-vig"></div></div>
    <div class="pr-head"><button class="lf-btn ghost pr-back">&larr; BACK</button><h2>ACCOUNT <i>//</i> PERSONNEL FILE</h2>
      <span class="pr-case ac-head-r"></span></div>
    <div class="ac-wrap"></div>`, 'ac-screen');
  const wrap = s.el.querySelector('.ac-wrap'), headR = s.el.querySelector('.ac-head-r');
  s.el.querySelector('.pr-back').onclick = () => { sfx('back'); UI.pop(); };
  let tab = tab0 || 'friends', timers = [], offs = [];
  const clearTimers = () => { timers.forEach(t => clearInterval(t)); timers = []; };
  const head = () => {
    const u = Account.member() ? Account.user() : null, st = Profile.syncState();
    const sync = !u ? 'GUEST · LOCAL SAVE' : st.state === 'syncing' ? 'SYNCING…' : st.state === 'error' ? 'CLOUD OFFLINE' : st.state === 'ok' ? 'CLOUD SYNCED' : 'CLOUD';
    headR.innerHTML = (u ? '<i class="ac-dot" style="--c:' + col(u.color) + '"></i><b>' + esc(u.username) + '</b> · ' : '') + esc(sync);
    headR.title = u ? (st.state === 'error' ? 'Not saved to the cloud: ' + st.error + ' (retrying)' : st.at ? 'Last cloud sync: ' + new Date(st.at).toLocaleString() : '') : 'Sign in to keep your progress in the cloud';
  };
  const render = (t) => {
    if (t) tab = t;
    clearTimers(); wrap.innerHTML = ''; head();
    if (!Account.member()) { wrap.appendChild(signInView()); return; }
    if (!['friends', 'boards', 'record', 'account'].includes(tab)) tab = 'friends';
    const top = h('div', 'ac-top');
    top.appendChild(UI.tabs([{ id: 'friends', label: 'FRIENDS' }, { id: 'boards', label: 'LEADERBOARDS' }, { id: 'record', label: 'SERVICE RECORD' }, { id: 'account', label: 'ACCOUNT' }],
      id => { sfx('click'); render(id); }, tab));
    const body = h('div', 'ac-body');
    wrap.append(top, body);
    if (tab === 'friends') friendsView(body);
    else if (tab === 'boards') boardsView(body);
    else if (tab === 'record') recordView(body);
    else accountView(body);
  };
  s.render = render;
  s.onShow = () => {
    offs.forEach(f => f()); offs = [
      Account.on(e => { if (e.type === 'auth' || e.type === 'server') render(); else if (e.type === 'presence' && tab === 'friends' && Account.member()) refreshPending(); }),
      Profile.onChange((p, why) => { if (why === 'sync') head(); }),
    ];
    render();
  };
  s.onHide = () => { clearTimers(); offs.forEach(f => f()); offs = []; };

  // ---------------------------------------------------------------------------------------------- signed out: sign in / create
  function signInView() {
    let mode = 'login';
    const v = h('div', 'ac-signin');
    v.innerHTML = `
      <div class="ac-card ac-form">
        <div class="ac-nv"><span class="ac-nv-k">NEON VEINS ACCOUNT</span><b>ONE ACCOUNT · TWO GAMES</b>
          <p>LIVE FIRE uses your <b>Neon Veins</b> account: the same username, password and friends list. Already play Neon Veins? Just sign in.
          New here? Create one below — it works in Neon Veins too.</p></div>
        <div class="ac-mode"></div>
        <form class="ac-fields" autocomplete="on" novalidate></form>
        <div class="ac-err" role="alert"></div>
        <div class="ac-go"></div>
        <div class="ac-fine"></div>
      </div>
      <div class="ac-side">
        <div class="ac-card ac-why"><div class="ac-k">WHAT IT GIVES YOU</div>
          <ul><li><b>Cloud save</b><span>Level, credits, unlocks, loadouts and stats follow you to any device.</span></li>
          <li><b>Friends</b><span>See who is online in LIVE FIRE or Neon Veins and join their games with one click.</span></li>
          <li><b>Leaderboards</b><span>Monthly and all-time boards for every mode.</span></li>
          <li><b>Daily rewards</b><span>Your streak is kept in the cloud, not just this browser.</span></li></ul>
          <div class="ac-guest">Playing as a guest: progress is saved on this device only. It joins your account the first time you sign in.</div></div>
        <div class="ac-card ac-srv"></div>
      </div>`;
    const modeRow = v.querySelector('.ac-mode'), form = v.querySelector('.ac-fields'), err = v.querySelector('.ac-err'), go = v.querySelector('.ac-go'), fine = v.querySelector('.ac-fine');
    const field = (name, label, type, ac, ph) => {
      const w = h('label', 'ac-f', '<span>' + label + '</span>'); const i = h('input'); i.name = name; i.type = type; i.autocomplete = ac; i.placeholder = ph || ''; i.spellcheck = false;
      i.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); submit(); } });
      i.addEventListener('input', () => { w.classList.remove('bad'); err.textContent = ''; });
      w.appendChild(i); form.appendChild(w); return i;
    };
    let F = {};
    const build = () => {
      form.innerHTML = ''; err.textContent = ''; go.innerHTML = '';
      if (mode === 'login') {
        F = { login: field('login', 'EMAIL OR USERNAME', 'text', 'username', 'operator@example.com'), password: field('password', 'PASSWORD', 'password', 'current-password') };
        fine.innerHTML = 'Signing in here also signs you in to Neon Veins in this browser, and the other way round.';
      } else {
        F = { email: field('email', 'EMAIL', 'email', 'email', 'you@example.com'), username: field('username', 'USERNAME', 'text', 'username', '3–20 letters, numbers, _ or -'),
          password: field('password', 'PASSWORD', 'password', 'new-password', '8+ characters, a letter and a number'), confirm: field('confirm', 'CONFIRM PASSWORD', 'password', 'new-password') };
        fine.innerHTML = 'This creates a Neon Veins account (the account server is shared by both games). Your username is public to friends and on leaderboards.';
      }
      go.appendChild(UI.button(mode === 'login' ? 'SIGN IN' : 'CREATE ACCOUNT', submit, 'primary big ac-submit'));
    };
    const bad = (k, msg) => { err.textContent = msg; if (F[k]) { F[k].parentNode.classList.add('bad'); F[k].focus(); } return false; };
    const check = () => {
      if (mode === 'login') {
        if (!F.login.value.trim()) return bad('login', 'Enter your email or username.');
        if (!F.password.value) return bad('password', 'Enter your password.');
        return true;
      }
      if (!EMAIL_RE.test(F.email.value.trim())) return bad('email', 'Enter a valid email address.');
      if (!USER_RE.test(F.username.value.trim())) return bad('username', 'Usernames are 3–20 letters, numbers, _ or -.');
      const p = F.password.value;
      if (p.length < 8) return bad('password', 'Password must be at least 8 characters.');
      if (!/[A-Za-z]/.test(p) || !/[0-9]/.test(p)) return bad('password', 'Password needs at least one letter and one number.');
      if (F.confirm.value !== p) return bad('confirm', 'The two passwords do not match.');
      return true;
    };
    let busy = false;
    async function submit() {
      if (busy || !check()) return;
      busy = true; const btn = go.querySelector('button'); btn.disabled = true; const label = btn.textContent; btn.textContent = mode === 'login' ? 'SIGNING IN…' : 'CREATING…';
      try {
        const u = mode === 'login' ? await Account.login(F.login.value, F.password.value) : await Account.signup(F.email.value, F.username.value, F.password.value);
        sfx('unlock'); UI.toast((mode === 'login' ? 'SIGNED IN AS ' : 'WELCOME, ') + String(u.username).toUpperCase(), { kind: 'ok' });
      } catch (e) {
        sfx('deny');
        const f = e.field === 'login' || e.field === 'email' || e.field === 'username' || e.field === 'password' ? e.field : (mode === 'login' && e.status === 401 ? 'password' : null);
        bad(f, e.message || 'Something went wrong.');
        if (e.status === 401 && F.password) F.password.value = '';
      } finally { busy = false; if (btn.isConnected) { btn.disabled = false; btn.textContent = label; } }
    }
    modeRow.appendChild(UI.seg([{ id: 'login', label: 'SIGN IN' }, { id: 'signup', label: 'CREATE ACCOUNT' }], mode, m => { mode = m; sfx('click'); build(); (F.login || F.email).focus(); }));
    build();
    serverBox(v.querySelector('.ac-srv'));
    setTimeout(() => { if (F.login && v.isConnected) F.login.focus(); }, 30);
    return v;
  }

  // ---------------------------------------------------------------------------------------------- server address (advanced)
  function serverBox(box) {
    const sh = Account.sharedLogin();
    box.innerHTML = '<div class="ac-k">SERVER</div><div class="ac-srv-url"></div><div class="ac-srv-note"></div><div class="ac-srv-edit"></div>';
    box.querySelector('.ac-srv-url').textContent = Account.server();
    box.querySelector('.ac-srv-note').textContent = sh ? 'Same server as Neon Veins in this browser: one sign-in for both games.'
      : 'LIVE FIRE only: this server differs from the one Neon Veins uses here, so the sign-in is kept separate.';
    const ed = box.querySelector('.ac-srv-edit');
    const inp = h('input', 'ac-srv-in'); inp.placeholder = Account.DEFAULT_API; inp.spellcheck = false; inp.value = '';
    inp.addEventListener('keydown', e => e.stopPropagation());
    const msg = h('div', 'ac-srv-msg');
    ed.append(inp, UI.button('USE', () => { try { Account.setServer(inp.value); UI.toast('SERVER SET', { kind: 'ok' }); render(); } catch (e) { msg.textContent = e.message; } }),
      UI.button('DEFAULT', () => { Account.setServer(''); UI.toast('FOLLOWING THE NEON VEINS SERVER', { kind: 'ok' }); render(); }, 'ghost'), msg);
  }

  // ---------------------------------------------------------------------------------------------- friends
  let pendBox = null;
  function refreshPending() {
    if (!pendBox || !pendBox.isConnected) return;
    const inv = Account.pending().invites || [];
    pendBox.innerHTML = inv.length ? '' : '<div class="ac-empty">No invites right now.</div>';
    for (const i of inv) {
      const r = h('div', 'ac-row', '<i class="ac-dot" style="--c:' + col(i.color) + '"></i><div class="ac-row-t"><b>' + esc(i.username) + '</b><small>' + (i.liveFire ? 'LIVE FIRE · CODE ' + esc(i.code) : 'NEON VEINS CO-OP · OPEN NEON VEINS TO JOIN') + '</small></div>');
      if (i.liveFire) r.appendChild(UI.button('JOIN', () => joinCode(i.code, i.username), 'primary sm'));
      pendBox.appendChild(r);
    }
  }
  function friendsView(body) {
    body.classList.add('ac-friends');
    body.innerHTML = `<div class="ac-card ac-flist"><div class="ac-k">FRIENDS <span class="ac-count"></span><button class="ac-refresh" title="Refresh">REFRESH</button></div><div class="ac-list"><div class="ac-empty">Loading…</div></div></div>
      <div class="ac-side"><div class="ac-card"><div class="ac-k">ADD A FRIEND</div><div class="ac-add"></div><div class="ac-add-msg"></div></div>
      <div class="ac-card"><div class="ac-k">REQUESTS</div><div class="ac-reqs"><div class="ac-empty">—</div></div></div>
      <div class="ac-card"><div class="ac-k">INVITES</div><div class="ac-pend"></div></div></div>`;
    const list = body.querySelector('.ac-list'), reqs = body.querySelector('.ac-reqs'), count = body.querySelector('.ac-count');
    pendBox = body.querySelector('.ac-pend'); refreshPending();
    const inp = h('input', 'ac-in'); inp.placeholder = 'Username'; inp.spellcheck = false; inp.maxLength = 20;
    const amsg = body.querySelector('.ac-add-msg');
    const send = async () => {
      const n = inp.value.trim(); if (!n) return;
      try { const j = await Account.request(n); amsg.className = 'ac-add-msg ok'; amsg.textContent = j.accepted ? 'You are now friends with ' + n + '.' : 'Request sent to ' + n + '.'; inp.value = ''; sfx('click'); load(); }
      catch (e) { amsg.className = 'ac-add-msg bad'; amsg.textContent = e.message; sfx('deny'); }
    };
    inp.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') send(); });
    body.querySelector('.ac-add').append(inp, UI.button('SEND', send, 'primary'));
    body.querySelector('.ac-refresh').onclick = () => { sfx('click'); load(); };
    const hostCode = () => Account.status().code;
    async function load() {
      let j;
      try { j = await Account.friends({ force: true }); }
      catch (e) { if (list.isConnected) list.innerHTML = '<div class="ac-empty bad">' + esc(e.message) + '</div>'; return; }
      if (!list.isConnected) return;
      const on = j.friends.filter(f => f.online).length;
      count.textContent = j.friends.length ? on + ' / ' + j.friends.length + ' ONLINE' : '';
      list.innerHTML = '';
      if (!j.friends.length) list.innerHTML = '<div class="ac-empty">No friends yet. Add one by username — Neon Veins friends show up here too.</div>';
      for (const f of j.friends) {
        const where = !f.online ? 'OFFLINE · LAST SEEN ' + ago(f.last_seen) : f.liveFire ? esc(f.activity) : 'NEON VEINS · ' + esc(f.activity || 'ONLINE');
        const r = h('div', 'ac-row' + (f.online ? ' on' : '') + (f.liveFire ? ' lf' : ''), '<i class="ac-dot' + (f.online ? '' : ' off') + '" style="--c:' + col(f.color) + '"></i>'
          + '<div class="ac-row-t"><b>' + esc(f.username) + '</b><small class="ac-act"><span>' + where + '</span>' + (f.joinable ? '<em> · CODE ' + esc(f.join_code) + '</em>' : '') + '</small></div>');
        const btns = h('div', 'ac-row-b');
        if (f.joinable) btns.appendChild(UI.button('JOIN', () => joinCode(f.join_code, f.username), 'primary sm'));
        if (hostCode() && f.online) btns.appendChild(UI.button('INVITE', async () => { try { await Account.invite(f.id, hostCode()); UI.toast('INVITE SENT TO ' + f.username.toUpperCase(), { kind: 'ok' }); } catch (e) { UI.toast(e.message.toUpperCase(), { kind: 'warn' }); } }, 'sm'));
        btns.appendChild(UI.button('×', async () => { if (await UI.confirm('Remove ' + esc(f.username) + ' from your friends? (This also removes them in Neon Veins.)', { ok: 'REMOVE', danger: true })) { try { await Account.unfriend(f.id); load(); } catch (e) { UI.toast(e.message, { kind: 'error' }); } } }, 'ghost sm ac-x'));
        r.appendChild(btns); list.appendChild(r);
      }
      reqs.innerHTML = '';
      if (!j.incoming.length && !j.outgoing.length) reqs.innerHTML = '<div class="ac-empty">No open requests.</div>';
      for (const f of j.incoming) {
        const r = h('div', 'ac-row', '<i class="ac-dot" style="--c:' + col(f.color) + '"></i><div class="ac-row-t"><b>' + esc(f.username) + '</b><small>WANTS TO BE FRIENDS</small></div>');
        const b = h('div', 'ac-row-b');
        b.append(UI.button('ACCEPT', async () => { try { await Account.respond(f.id, true); sfx('unlock'); load(); } catch (e) { UI.toast(e.message, { kind: 'error' }); } }, 'primary sm'),
          UI.button('DECLINE', async () => { try { await Account.respond(f.id, false); load(); } catch (e) { UI.toast(e.message, { kind: 'error' }); } }, 'ghost sm'));
        r.appendChild(b); reqs.appendChild(r);
      }
      for (const f of j.outgoing) reqs.appendChild(h('div', 'ac-row dim', '<i class="ac-dot off" style="--c:' + col(f.color) + '"></i><div class="ac-row-t"><b>' + esc(f.username) + '</b><small>REQUEST SENT · WAITING</small></div>'));
    }
    load();
    timers.push(setInterval(() => { if (!document.hidden && body.isConnected) load(); }, 20000));
  }

  // ---------------------------------------------------------------------------------------------- leaderboards
  let bMode = 'tdm', bPeriod = 'month';
  function boardsView(body) {
    body.classList.add('ac-boards');
    const modes = [{ id: 'xp', label: 'XP' }].concat(MODES.filter(m => m.available && m.id !== 'practice').map(m => ({ id: m.id, label: m.short || m.name })));
    if (!modes.some(m => m.id === bMode)) bMode = 'tdm';
    body.innerHTML = '<div class="ac-card ac-bcard"><div class="ac-bctl"></div><div class="ac-btitle"></div><div class="ac-btable"><div class="ac-empty">Loading…</div></div><div class="ac-bme"></div></div>';
    const ctl = body.querySelector('.ac-bctl'), table = body.querySelector('.ac-btable'), title = body.querySelector('.ac-btitle'), me = body.querySelector('.ac-bme');
    ctl.append(UI.seg(modes, bMode, v => { bMode = v; load(); }), UI.seg([{ id: 'month', label: 'THIS MONTH' }, { id: 'all', label: 'ALL TIME' }], bPeriod, v => { bPeriod = v; load(); }));
    async function load() {
      const board = 'lf:' + bMode + ':' + (bPeriod === 'month' ? monthKey() : 'all');
      const mName = bMode === 'xp' ? 'EXPERIENCE' : ((MODES.find(m => m.id === bMode) || {}).name || bMode).toUpperCase();
      title.innerHTML = '<b>' + esc(mName) + '</b><span>' + (bPeriod === 'month' ? 'THIS MONTH (UTC) · ' + monthKey() : 'ALL TIME') + ' · ' + (bMode === 'xp' ? 'XP EARNED' : 'BEST MATCH SCORE') + '</span>';
      table.innerHTML = '<div class="ac-empty">Loading…</div>'; me.textContent = '';
      const j = await Account.getBoard(board);
      if (!table.isConnected) return;
      if (j.error) { table.innerHTML = '<div class="ac-empty' + (j.error === Account.NO_BOARDS ? ' nb' : ' bad') + '">' + esc(j.error) + (j.error === Account.NO_BOARDS ? '<small>Your scores are kept on this device; the boards fill in once the server is updated.</small>' : '') + '</div>'; return; }
      if (!j.top || !j.top.length) { table.innerHTML = '<div class="ac-empty">No scores yet — finish a match to post the first one.</div>'; return; }
      table.innerHTML = '<div class="ac-br hd"><span>#</span><span>OPERATOR</span><span>' + (bMode === 'xp' ? 'LEVEL' : 'K / D / A') + '</span><span>SCORE</span></div>'
        + j.top.map(r => { const d = r.detail || {}; return '<div class="ac-br' + (r.me ? ' me' : '') + '"><span>' + r.rank + '</span><span><i class="ac-dot" style="--c:' + col(r.color) + '"></i>' + esc(r.name) + '</span><span>'
          + (bMode === 'xp' ? (d.lv ? 'LVL ' + (d.lv | 0) : '—') : (d.k != null ? (d.k | 0) + ' / ' + (d.d | 0) + ' / ' + (d.a | 0) : '—')) + '</span><span>' + fmtN(r.score) + '</span></div>'; }).join('');
      me.textContent = j.me ? 'YOUR RANK ' + j.me.rank + ' OF ' + j.total + ' · ' + fmtN(j.me.score) : j.total ? j.total + ' OPERATORS ON THIS BOARD · YOU ARE NOT ON IT YET' : '';
    }
    load();
  }

  // ---------------------------------------------------------------------------------------------- service record
  function recordView(body) {
    body.classList.add('ac-record');
    const st = Profile.stats(), info = Profile.levelInfo(), p = Profile.get();
    const tile = (k, v, sub) => '<div class="ac-stat"><span>' + k + '</span><b>' + v + '</b>' + (sub ? '<small>' + sub + '</small>' : '') + '</div>';
    const guns = Object.entries(p.guns).map(([id, g]) => ({ id, g, gun: getGun(id), lv: Profile.gunStats(id) })).filter(x => x.gun).sort((a, b) => b.g.kills - a.g.kills).slice(0, 6);
    const modes = Object.entries(p.stats.modes).map(([id, m]) => ({ id, m, name: ((MODES.find(x => x.id === id) || {}).name || id).toUpperCase() })).sort((a, b) => (b.m.matches || 0) - (a.m.matches || 0));
    body.innerHTML = `
      <div class="ac-card ac-lvl"><div class="ac-lvl-n"><span>LEVEL</span><b>${info.level}</b></div>
        <div class="ac-lvl-t"><div class="ac-lvl-h">${esc(String(Profile.callsign()).toUpperCase())}<span>${info.max ? 'MAX LEVEL' : fmtN(info.into) + ' / ' + fmtN(info.need) + ' XP'}</span></div>
          <div class="ac-xpbar"><b style="width:${Math.round(info.frac * 100)}%"></b></div>
          <div class="ac-lvl-s">${fmtN(p.xp)} XP TOTAL · ${fmtN(Profile.credits())} CREDITS · ${info.level >= LEVEL_MAX ? 'EVERY UNLOCK EARNED' : 'NEXT: ' + (Profile.nextUnlocks(2).map(u => esc(u.name) + ' (LVL ' + u.level + ')').join(', ') || '—')}</div></div></div>
      <div class="ac-stats">${tile('K / D', st.kd.toFixed(2), fmtN(st.kills) + ' K · ' + fmtN(st.deaths) + ' D')}${tile('ACCURACY', pct(st.accuracy), fmtN(st.hits) + ' / ' + fmtN(st.shots))}
        ${tile('HEADSHOTS', pct(st.hsRate), fmtN(st.headshots) + ' TOTAL')}${tile('WIN RATE', pct(st.winRate), st.wins + ' W · ' + st.losses + ' L · ' + st.draws + ' D')}
        ${tile('MATCHES', fmtN(st.matches), st.quits ? st.quits + ' LEFT EARLY' : 'COMPLETED')}${tile('TIME IN ACTION', hours(st.playtime), fmtN(st.damage) + ' DAMAGE')}
        ${tile('BEST MATCH', fmtN(st.bestKills) + ' K', 'SCORE ' + fmtN(st.bestScore))}${tile('BEST STREAK', fmtN(st.bestStreak), fmtN(st.assists) + ' ASSISTS · ' + fmtN(st.mvps) + ' MVP')}</div>
      <div class="ac-two"><div class="ac-card"><div class="ac-k">BY MODE</div>${modes.length ? '<div class="ac-mt"><div class="ac-mr hd"><span>MODE</span><span>MATCHES</span><span>WINS</span><span>K / D</span><span>BEST</span></div>'
        + modes.map(x => '<div class="ac-mr"><span>' + esc(x.name) + '</span><span>' + (x.m.matches | 0) + '</span><span>' + (x.m.wins | 0) + '</span><span>' + ((x.m.kills || 0) / Math.max(1, x.m.deaths || 0)).toFixed(2) + '</span><span>' + fmtN(x.m.bestScore) + '</span></div>').join('') + '</div>' : '<div class="ac-empty">Play a match to start your record.</div>'}</div>
        <div class="ac-card"><div class="ac-k">MOST USED WEAPONS</div>${guns.length ? guns.map(x => '<div class="ac-gun"><b>' + esc(x.gun.name) + '</b><span>MASTERY ' + x.lv.level + '</span><small>' + fmtN(x.g.kills) + ' KILLS · ' + (x.g.kills ? pct(x.g.hs / x.g.kills) : '0%') + ' HS</small><i><b style="width:' + Math.round(x.lv.frac * 100) + '%"></b></i></div>').join('') : '<div class="ac-empty">No weapon records yet.</div>'}</div></div>`;
  }

  // ---------------------------------------------------------------------------------------------- account
  function accountView(body) {
    body.classList.add('ac-acct');
    const u = Account.user() || {}, st = Profile.syncState(), sh = Account.sharedLogin();
    body.innerHTML = `<div class="ac-card ac-me"><div class="ac-k">NEON VEINS ACCOUNT</div>
        <div class="ac-me-n"><i class="ac-dot big" style="--c:${col(u.color)}"></i><div><b>${esc(u.username)}</b><small>${esc(u.email || '')}</small></div></div>
        <p class="ac-p">This is your Neon Veins account. Your name, colour and friends are shared by both games; change your colour or bio in Neon Veins.</p>
        <div class="ac-me-b"></div></div>
      <div class="ac-side"><div class="ac-card ac-cloud"><div class="ac-k">CLOUD SAVE · LIVE FIRE SLOT</div><div class="ac-cl"></div><div class="ac-cl-b"></div></div>
        <div class="ac-card ac-srv"></div></div>`;
    const cl = body.querySelector('.ac-cl');
    const showCloud = (info) => {
      const s = Profile.syncState();
      cl.innerHTML = '<div class="ac-kv"><span>STATUS</span><b>' + (s.state === 'ok' ? 'UP TO DATE' : s.state === 'syncing' ? 'SYNCING…' : s.state === 'error' ? 'NOT SAVED · ' + esc(s.error) : 'WAITING') + '</b></div>'
        + '<div class="ac-kv"><span>LAST SYNC</span><b>' + ago(s.at || Account.lastSync()) + '</b></div>'
        + '<div class="ac-kv"><span>IN THE CLOUD</span><b>' + (info === undefined ? '…' : info ? esc(info.summary) + ' · ' + new Date(info.updated).toLocaleString() : 'NOTHING YET') + '</b></div>'
        + '<p class="ac-p">Progress merges both ways: the newest loadouts win, and counters (XP, kills, unlocks) keep the higher value, so two devices never lose progress.</p>';
    };
    showCloud(undefined);
    Account.cloudInfo().then(i => { if (cl.isConnected) showCloud(i); }).catch(() => { if (cl.isConnected) showCloud(null); });
    body.querySelector('.ac-cl-b').appendChild(UI.button('SYNC NOW', async () => { sfx('click'); showCloud(undefined); const r = await Profile.sync(); UI.toast(r.ok ? 'CLOUD SAVE UP TO DATE' : 'SYNC FAILED · ' + String(r.reason || '').toUpperCase(), { kind: r.ok ? 'ok' : 'warn' }); let i = null; try { i = await Account.cloudInfo(); } catch (e) { i = null; } if (cl.isConnected) showCloud(i); head(); }));
    body.querySelector('.ac-me-b').appendChild(UI.button('SIGN OUT', async () => {
      const ok = await UI.confirm(sh ? 'Sign out of LIVE FIRE <b>and Neon Veins</b> in this browser? Your progress stays on this device and in the cloud.' : 'Sign out of LIVE FIRE on this browser?', { ok: 'SIGN OUT', danger: true });
      if (!ok) return;
      await Profile.flush(); await Account.logout(); UI.toast('SIGNED OUT', { kind: 'info' });
    }, 'danger'));
    serverBox(body.querySelector('.ac-srv'));
  }
  return s;
}
