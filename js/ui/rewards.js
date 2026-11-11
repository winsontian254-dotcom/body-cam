/* LIVE FIRE — daily rewards screen: seven day tiles (evidence tags), streak / best, the claim button with a live countdown, the
   first-win-of-the-day bonus, the active XP boost, queued level-up crates, and the crate-opening reveal. Styles: css/rewards.css.
   Exports:
     openRewards() -> screen          pushes the rewards screen
     rewardsScreen() -> screen
     decorateRewardsItem(screenEl)    keeps the title menu's REWARDS entry live (READY tag / countdown); stops when the element goes
     revealDrops({ title, sub, items, drops }) -> Promise   the crate / claim reveal overlay (also usable by results screens)
     rewardIcon(type) -> svg markup  */
import { UI } from './ui.js';
import { Rewards, DAYS, CRATES, RARITY, fmt } from '../account/rewards.js';
import { Profile } from '../account/profile.js';
import { Account } from '../account/api.js';

const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sfx = n => { try { const A = window.LF && window.LF.audio; if (A) A.ui(n); } catch (e) { /* audio is optional */ } };
const fmtN = n => Math.round(n || 0).toLocaleString('en-US');
const SLOT_NAME = { optic: 'OPTIC', muzzle: 'MUZZLE', under: 'UNDERBARREL', side: 'SIDE RAIL', mag: 'MAGAZINE', stock: 'STOCK', barrel: 'BARREL' };

// ------------------------------------------------------------------------------------------------ icons (original line glyphs)
const SVG = (inner, vb = '0 0 48 48') => '<svg viewBox="' + vb + '" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="square" aria-hidden="true">' + inner + '</svg>';
const ICONS = {
  credits: SVG('<ellipse cx="24" cy="14" rx="13" ry="5"/><path d="M11 14v8c0 2.8 5.8 5 13 5s13-2.2 13-5v-8"/><path d="M11 22v8c0 2.8 5.8 5 13 5s13-2.2 13-5v-8"/><path d="M11 30v5c0 2.8 5.8 5 13 5s13-2.2 13-5v-5"/>'),
  xp: SVG('<path d="M12 30l12-10 12 10"/><path d="M12 39l12-10 12 10"/><path d="M12 21l12-10 12 10"/>'),
  boost: SVG('<path d="M27 5L13 27h10l-3 16 15-23H25z"/>'),
  crate: SVG('<path d="M6 16l18-8 18 8v18l-18 8-18-8z"/><path d="M6 16l18 8 18-8M24 24v18"/><path d="M15 12l18 8"/>'),
  skin: SVG('<path d="M8 30l22-22 10 10-22 22H8z"/><path d="M26 12l10 10M14 24l10 10"/>'),
  att: SVG('<circle cx="24" cy="24" r="10"/><path d="M24 6v8M24 34v8M6 24h8M34 24h8"/><circle cx="24" cy="24" r="2"/>'),
  trophy: SVG('<path d="M15 8h18v9c0 6-4 10-9 10s-9-4-9-10z"/><path d="M15 12H8c0 6 3 9 8 9M33 12h7c0 6-3 9-8 9M24 27v8M16 40h16"/>'),
};
export const rewardIcon = t => ICONS[t] || ICONS.crate;

function itemText(it) {
  if (it.type === 'credits') return { icon: 'credits', big: '+' + fmtN(it.n), small: 'CREDITS' };
  if (it.type === 'xp') return { icon: 'xp', big: '+' + fmtN(it.n), small: 'XP' };
  if (it.type === 'boost') return { icon: 'boost', big: '×' + it.mult, small: 'XP · ' + it.matches + ' MATCHES' };
  if (it.type === 'crate') return { icon: 'crate', big: (CRATES[it.crate] || {}).name || 'CRATE', small: (CRATES[it.crate] || {}).desc || '' };
  return { icon: 'crate', big: '', small: '' };
}

// ------------------------------------------------------------------------------------------------ title menu entry
export function decorateRewardsItem(root) {
  const item = root.querySelector('.mn-item[data-id="rewards"]'); if (!item) return;
  const sub = item.querySelector('span');
  let tag = item.querySelector('.rw-tag'); if (!tag) { tag = h('em', 'rw-tag', 'READY'); item.querySelector('b').appendChild(tag); }
  let seen = false;     // the title is built before it is attached: stop only once it was in the page and left it
  const upd = () => {
    if (item.isConnected) seen = true; else if (seen) { clearInterval(t); return; }
    const s = Rewards.status(), crates = Rewards.crates().length;
    tag.style.display = s.ready || crates ? '' : 'none';
    tag.textContent = s.ready ? 'READY' : crates + ' CRATE' + (crates > 1 ? 'S' : '');
    sub.textContent = s.ready ? 'DAY ' + s.day + ' SUPPLY DROP IS READY' : s.clockBack ? 'CHECK YOUR CLOCK' : 'NEXT DROP IN ' + fmt(s.msToNext) + ' · STREAK ' + s.streak;
  };
  const t = setInterval(upd, 1000); upd();
}

// ------------------------------------------------------------------------------------------------ reveal overlay
/** items: claim items (credits / xp / boost) shown as cards; drops: crate drops revealed one by one after the crate opens */
export function revealDrops({ title = 'SUPPLY DROP', sub = '', items = [], drops = [], crate = null } = {}) {
  return new Promise(resolve => {
    const ov = h('div', 'rw-reveal' + (crate ? ' has-crate' : ''));
    ov.innerHTML = '<div class="rw-rv-bg"></div><div class="rw-rv-in"><div class="rw-rv-h"><i></i>' + esc(title) + '</div><div class="rw-rv-sub">' + esc(sub) + '</div>'
      + (crate ? '<div class="rw-case"><div class="rw-case-lid"><span>' + esc(crate) + '</span></div><div class="rw-case-body"><div class="rw-case-tape">EVIDENCE · DO NOT OPEN · EVIDENCE · DO NOT OPEN</div><div class="rw-case-lbl">LF-' + String(Math.floor(Math.random() * 9000) + 1000) + '</div></div></div>' : '')
      + '<div class="rw-cards"></div><div class="rw-rv-b"></div></div>';
    const cards = ov.querySelector('.rw-cards'), btns = ov.querySelector('.rw-rv-b');
    const timers = [];
    const later = (ms, fn) => timers.push(setTimeout(fn, ms));
    const card = (html, cls, color, delay) => { const c = h('div', 'rw-card ' + (cls || ''), html); if (color) c.style.setProperty('--rc', color); cards.appendChild(c); later(delay, () => c.classList.add('in')); return c; };
    let t = crate ? 1500 : 150;
    if (crate) { later(80, () => ov.classList.add('shake')); later(1150, () => { ov.classList.add('open'); sfx('reward'); }); }
    for (const d of drops) {
      const r = RARITY[d.rarity] || RARITY.common;
      const type = d.kind === 'skin' ? 'WEAPON FINISH' : d.kind === 'att' ? 'ATTACHMENT · ' + (SLOT_NAME[d.slot] || '') : 'CREDITS';
      const swatch = d.kind === 'skin' && d.colors ? '<div class="rw-sw">' + d.colors.slice(0, 5).map(c => '<i style="background:' + esc(c) + '"></i>').join('') + '</div>' : '';
      const ic = d.kind === 'skin' ? 'skin' : d.kind === 'att' ? 'att' : 'credits';
      const note = d.kind === 'att' ? (Profile.level() < (d.level || 1) ? 'UNLOCKED EARLY · NORMALLY LEVEL ' + d.level : 'UNLOCKED') : d.kind === 'skin' ? 'ADDED TO YOUR ARMORY' : d.refund ? '+' + fmtN(d.n) + ' CREDITS INSTEAD' : '';
      card('<div class="rw-c-r">' + r.label + '</div><div class="rw-c-i">' + rewardIcon(ic) + '</div>' + swatch + '<div class="rw-c-n">' + esc(d.name) + '</div><div class="rw-c-t">' + esc(type) + '</div><div class="rw-c-s">' + esc(note) + '</div>',
        'drop r-' + d.rarity, r.col, t);
      later(t, () => sfx(d.rarity === 'legendary' || d.rarity === 'epic' ? 'unlock' : 'tick'));
      t += 520;
    }
    for (const it of items) {
      if (it.type === 'crate') continue;
      const x = itemText(it);
      card('<div class="rw-c-i">' + rewardIcon(x.icon) + '</div><div class="rw-c-n">' + esc(x.big) + '</div><div class="rw-c-t">' + esc(x.small) + '</div>', 'plain', null, t);
      t += 260;
    }
    const done = () => { timers.forEach(clearTimeout); window.removeEventListener('keydown', key, true); ov.classList.add('out'); setTimeout(() => { ov.remove(); resolve(); }, 220); };
    const skip = () => { timers.forEach(clearTimeout); ov.classList.add('open', 'skip'); for (const c of cards.children) c.classList.add('in'); };
    const go = UI.button('CONTINUE', done, 'primary big');
    btns.appendChild(go);
    later(t + 100, () => go.focus());
    const key = e => { if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); if (ov.classList.contains('skip') || !timers.length) done(); else { skip(); timers.length = 0; } } };
    window.addEventListener('keydown', key, true);
    ov.querySelector('.rw-rv-bg').addEventListener('click', () => { if (!ov.classList.contains('skip')) { skip(); timers.length = 0; } });
    document.getElementById('ui').appendChild(ov);
  });
}

// ------------------------------------------------------------------------------------------------ screen
export function openRewards() { return UI.push(rewardsScreen()); }

export function rewardsScreen() {
  const s = UI.screen('rewards', `
    <div class="mn-bg"><div class="mn-scan"></div><div class="mn-vig"></div></div>
    <div class="pr-head"><button class="lf-btn ghost pr-back">&larr; BACK</button><h2>REWARDS <i>//</i> DAILY SUPPLY</h2><span class="pr-case rw-head-r"></span></div>
    <div class="rw-wrap">
      <div class="rw-top"><div class="rw-day"></div><div class="rw-streak"></div></div>
      <div class="rw-tiles"></div>
      <div class="rw-claim"><div class="rw-claim-b"></div><div class="rw-claim-s"></div></div>
      <div class="rw-info"><div class="rw-box rw-fw"></div><div class="rw-box rw-boost"></div><div class="rw-box rw-crates"></div></div>
    </div>`, 'rw-screen');
  const $ = q => s.el.querySelector(q);
  $('.pr-back').onclick = () => { sfx('back'); UI.pop(); };
  let timer = 0, busy = false, offs = [];

  // days before the current one in this cycle were claimed (a broken streak restarts at day 1, so nothing is before it)
  const tileState = (st, d) => (d < st.day ? 'done' : d > st.day ? 'next' : st.ready ? 'today' : 'done now');
  const tileText = it => it.type === 'crate' ? { big: (CRATES[it.crate] || {}).short || 'CRATE', small: (CRATES[it.crate] || {}).kind || 'CRATE' }
    : it.type === 'boost' ? { big: '×' + it.mult + ' XP', small: it.matches + ' MATCHES' } : { big: '+' + fmtN(it.n), small: it.type === 'xp' ? 'XP' : 'CREDITS' };
  function render() {
    const st = Rewards.status();
    $('.rw-head-r').textContent = Account.member() ? 'STREAK SAVED TO YOUR ACCOUNT' : 'GUEST · STREAK ON THIS DEVICE';
    $('.rw-day').innerHTML = '<span>' + (st.clockBack ? 'CLOCK CHECK' : st.ready ? 'DAY ' + st.day + ' OF 7 · READY' : 'DAY ' + st.day + ' OF 7 · COLLECTED') + '</span><b>' + esc(st.reward.title) + '</b>'
      + '<p>' + (st.clockBack ? 'Your device clock is earlier than your last claim. Rewards resume once the date catches up.' : st.broken ? 'You missed a day: the streak starts again at day 1.' : 'Claim once a day. Seven days in a row opens the Evidence Locker; miss a day and the streak starts over.') + '</p>';
    $('.rw-streak').innerHTML = '<div><span>STREAK</span><b>' + st.streak + '</b></div><div><span>BEST</span><b>' + st.best + '</b></div><div><span>CLAIMED</span><b>' + st.claims + '</b></div>'
      + (st.weekBonus ? '<div class="wb"><span>WEEK BONUS</span><b>+' + Math.round(st.weekBonus * 100) + '%</b></div>' : '');
    const tiles = $('.rw-tiles'); tiles.innerHTML = '';
    for (const D of DAYS) {
      const state = tileState(st, D.day);
      const items = (D.day === st.day ? st.reward.items : D.items);
      const main = tileText(items[0]), icon = itemText(items[0]).icon;
      const lines = D.big ? items.map(it => { const x = tileText(it); return it.type === 'crate' ? x.small : x.big + ' ' + x.small; })
        : [main.small].concat(items.slice(1).map(it => { const x = tileText(it); return it.type === 'crate' ? x.big : x.big + ' ' + x.small; }));
      const t = h('div', 'rw-tile ' + state + (D.big ? ' big' : ''),
        '<div class="rw-t-w">' + String(D.day).padStart(2, '0') + '</div>'
        + '<div class="rw-t-h"><span>DAY ' + D.day + '</span>' + (state.includes('done') ? '<em>✓</em>' : '') + '</div>'
        + '<div class="rw-t-i">' + rewardIcon(D.big ? 'crate' : icon) + '</div><div class="rw-t-n">' + esc(D.big ? D.title : main.big) + '</div>'
        + '<div class="rw-t-s">' + lines.map(esc).join('<br>') + '</div>'
        + (state.includes('done') ? '<div class="rw-stamp">COLLECTED</div>' : '') + (state === 'today' ? '<div class="rw-t-now">TODAY</div>' : ''));
      tiles.appendChild(t);
    }
    const cb = $('.rw-claim-b'); cb.innerHTML = '';
    if (st.ready) {
      const b = UI.button('CLAIM DAY ' + st.day, claim, 'primary big rw-claim-btn');
      cb.appendChild(b);
    } else {
      cb.appendChild(h('div', 'rw-count', '<span>' + (st.clockBack ? 'AVAILABLE AGAIN IN' : 'NEXT SUPPLY DROP IN') + '</span><b class="rw-cd">' + fmt(st.msToNext) + '</b>'));
    }
    $('.rw-claim-s').textContent = st.clockBack ? 'Set your device to the right date and time.' : st.ready ? (st.weekBonus ? 'Week bonus: +' + Math.round(st.weekBonus * 100) + '% credits.' : 'Resets at midnight (your local time).')
      : 'Day ' + ((st.day % 7) + 1) + ' tomorrow' + (st.day === 6 ? ': the Evidence Locker.' : '.');
    // first win
    const fw = st.firstWin;
    $('.rw-fw').innerHTML = '<div class="rw-b-k">' + rewardIcon('trophy') + 'FIRST WIN OF THE DAY</div><b>+' + fmtN(fw.xp) + ' XP · +' + fmtN(fw.credits) + ' CR</b>'
      + '<small class="' + (fw.ready ? 'ok' : '') + '">' + (fw.ready ? 'READY · WIN ANY MATCH' : 'EARNED · RESETS IN <span class="rw-fwcd">' + fmt(fw.msToReset) + '</span>') + '</small>';
    const bo = Profile.boost();
    $('.rw-boost').innerHTML = '<div class="rw-b-k">' + rewardIcon('boost') + 'XP BOOST</div>' + (bo.matches ? '<b>×' + bo.mult + ' XP</b><small class="ok">' + bo.matches + ' MATCH' + (bo.matches > 1 ? 'ES' : '') + ' LEFT</small>' : '<b>NONE ACTIVE</b><small>Days 2, 5 and 7 give XP boosts.</small>');
    const cr = Rewards.crates(), box = $('.rw-crates');
    box.innerHTML = '<div class="rw-b-k">' + rewardIcon('crate') + 'UNOPENED CRATES</div>';
    if (!cr.length) box.appendChild(h('small', '', 'Level-ups every 5 levels add crates here.'));
    for (const c of cr.slice(0, 4)) {
      const row = h('div', 'rw-cr', '<span><b>' + esc(c.name) + '</b><small>' + esc(c.from) + '</small></span>');
      row.appendChild(UI.button('OPEN', () => openCrate(c.id), 'sm primary'));
      box.appendChild(row);
    }
    if (cr.length > 4) box.appendChild(h('small', '', '+' + (cr.length - 4) + ' more'));
  }
  async function claim() {
    if (busy) return; busy = true;
    try {
      // signed in: pull the cloud copy first so a claim made on another device today is respected
      if (Account.member()) { try { await Promise.race([Profile.sync(), new Promise(r => setTimeout(r, 4000))]); } catch (e) { /* offline: claim locally */ } }
      const r = Rewards.claim();
      if (!r.ok) { UI.toast(r.reason === 'clock' ? 'YOUR CLOCK IS BEHIND YOUR LAST CLAIM' : 'ALREADY CLAIMED TODAY', { kind: 'warn' }); render(); return; }
      sfx('reward');
      const crateName = (r.items.find(i => i.type === 'crate') || {}).name;
      render();
      await revealDrops({ title: 'DAY ' + r.day + ' · ' + r.title, sub: 'STREAK ' + r.streak + (r.gain && r.gain.levelUps.length ? ' · LEVEL ' + r.gain.to + ' REACHED' : ''), items: r.items, drops: r.drops, crate: crateName || null });
      if (Account.member()) Profile.flush();
    } finally { busy = false; if (s.el.isConnected) render(); }
  }
  async function openCrate(id) {
    if (busy) return; busy = true;
    try {
      const r = Rewards.openCrate(id);
      if (!r.ok) { UI.toast(r.reason.toUpperCase(), { kind: 'warn' }); return; }
      render();
      await revealDrops({ title: r.crate.name, sub: r.crate.from, drops: r.drops, crate: r.crate.name });
    } finally { busy = false; if (s.el.isConnected) render(); }
  }
  const tick = () => {
    if (!s.el.isConnected) { clearInterval(timer); return; }
    const st = Rewards.status(), cd = s.el.querySelector('.rw-cd'), fw = s.el.querySelector('.rw-fwcd');
    if ((st.ready && cd) || (!st.ready && !cd && !busy)) { render(); return; }
    if (cd) cd.textContent = fmt(st.msToNext);
    if (fw) fw.textContent = fmt(st.firstWin.msToReset);
    if (fw && st.firstWin.ready) render();
  };
  s.onShow = () => { render(); clearInterval(timer); timer = setInterval(tick, 1000); offs.forEach(f => f()); offs = [Profile.onChange((p, why) => { if (why === 'sync' || why === 'external' || why === 'load') render(); })]; };
  s.onHide = () => { clearInterval(timer); offs.forEach(f => f()); offs = []; };
  return s;
}
