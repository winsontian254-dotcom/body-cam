/* LIVE FIRE — buy menu (economy modes; the FREE ARMORY in practice). Opened with the buy key (B) inside a buy zone during buy time.
   Fast keyboard buying like competitive shooters: a digit picks the category (1 pistols, 2 SMGs, 3 heavy, 4 rifles, 5 marksman,
   6 gear, 7 grenades), a second digit buys item 1-9 of it; Backspace goes back, B / Esc close, R asks a team-mate for a drop of the
   highlighted gun. Mouse: click buys, right-click sells back what you bought this round, shift-click requests a drop. Every card shows
   the price, the kill reward, owned / equipped / locked state and four stat bars. Guns arrive with the attachments of your Profile
   loadout for that gun. While open, the pointer is free and game keys are paused (Input.onText); the menu closes itself when you
   leave the buy zone or the buy time ends.
   Exports: BuyMenu  class: new BuyMenu(game, hud); open(), close(), toggle(), isOpen, late(dt), dispose() */
import { Input } from '../core/input.js';
import { BUY_CATS, itemInfo } from '../game/economy.js';
import { effectiveStats } from '../weapons/attachments.js';
import { getGun } from '../weapons/data.js';
import { Audio } from '../game/game.js';
import { fmtTime } from '../core/util.js';

const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const money = n => '$' + Math.round(n).toLocaleString('en-US');
const MAKER = /^(KR|IB(-\d+)?|ZR-[\w-]+|Type\s+\d+|Gallo|Calder|Pembroke|Morandi|Basalt|Norrhavn|Aokiri|Ironbark|Fratelli\s+Morandi|Kessler\s*&\s*Rauch)\s+/i;
export function shortGun(name) { let n = name; for (let i = 0; i < 2 && MAKER.test(n); i++) n = n.replace(MAKER, ''); return n; }
const CAT_TAG = { pistol: 'PISTOL', smg: 'SMG', rifle: 'RIFLE', carbine: 'CARBINE', br: 'BATTLE RIFLE', shotgun: 'SHOTGUN', dmr: 'MARKSMAN', sniper: 'SNIPER', lmg: 'MACHINE GUN', gear: 'GEAR', nade: 'GRENADE' };
const DIGIT = c => (/^Digit[0-9]$/.test(c) ? +c.slice(5) : /^Numpad[0-9]$/.test(c) ? +c.slice(6) : -1);
const barsCache = new Map();
function bars(id) {
  if (barsCache.has(id)) return barsCache.get(id);
  let b = null;
  try { const g = getGun(id); const st = g && g.cat !== 'melee' ? effectiveStats(g, {}) : null; b = st && st.derived ? st.derived.bars : null; } catch (e) { b = null; }
  barsCache.set(id, b); return b;
}

export class BuyMenu {
  constructor(game, hud) {
    this.g = game; this.hud = hud; this.isOpen = false; this.cat = null; this.sel = -1; this.t = 0; this.wasLocked = false;
    const el = this.el = h('div', 'by');
    el.innerHTML = `<div class="by-panel"><div class="by-head"><div class="by-title"><i></i>ARMORY <span class="by-sub"></span></div>
      <div class="by-money"></div><div class="by-time"></div></div>
      <div class="by-body"><div class="by-cats"></div><div class="by-items"></div><div class="by-side"><div class="by-sh">TEAM FUNDS</div><div class="by-team"></div>
      <div class="by-inv"></div></div></div>
      <div class="by-foot">1–7 CATEGORY · 1–9 BUY · BACKSPACE BACK · RIGHT-CLICK SELL · R / SHIFT-CLICK REQUEST DROP · <kbd class="by-k"></kbd> / ESC CLOSE</div>
      <div class="by-msg"></div></div>`;
    hud.el.appendChild(el);
    const q = s => el.querySelector(s);
    this.$ = { cats: q('.by-cats'), items: q('.by-items'), money: q('.by-money'), time: q('.by-time'), sub: q('.by-sub'), team: q('.by-team'), inv: q('.by-inv'), msg: q('.by-msg'), key: q('.by-k') };
    this.onKey = e => this.key(e);
    el.addEventListener('contextmenu', e => e.preventDefault());
    el.addEventListener('mousedown', e => { if (e.target === el) { e.preventDefault(); this.close(); } });
    this.offs = [
      Input.on((type, a) => { if (type === 'down' && a === 'buy') this.toggle(); }),
      game.bus.on('round:end', () => this.close()),
      game.bus.on('spawn', e => { if (e.p === game.local && this.isOpen) this.render(); }),
    ];
  }

  get E() { return this.g.economy; }
  me() { return this.g.local; }
  toggle() { if (this.isOpen) this.close(); else this.open(); }
  open() {
    const g = this.g, me = this.me(), E = this.E;
    if (!me || !E || this.isOpen || g.menuOpen || g.ended) return false;
    const can = E.canBuy(me);
    if (!can.ok) { this.flash(can.reason); try { Audio.ui('deny'); } catch (e) { /* ok */ } if (this.hud.modeHud) this.hud.modeHud.note(can.reason, 'warn', 1.6); return false; }
    this.isOpen = true; this.cat = this.cat || 'rifle'; this.sel = -1; this.catPending = true;     // the first digit picks a category
    this.wasLocked = Input.locked;
    Input.onText(true); Input.unlock();
    window.addEventListener('keydown', this.onKey, true);
    this.el.classList.add('on');
    this.$.key.textContent = Input.keyLabel('buy');
    this.render();
    try { Audio.ui('open'); } catch (e) { /* ok */ }
    return true;
  }
  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    window.removeEventListener('keydown', this.onKey, true);
    Input.onText(false);
    this.el.classList.remove('on');
    try { Audio.ui('close'); } catch (e) { /* ok */ }
    if (this.wasLocked && !this.g.menuOpen && !this.g.ended) Input.lock();
  }
  flash(text, good) { this.$.msg.textContent = text; this.$.msg.className = 'by-msg on' + (good ? ' ok' : ''); this.msgT = 1.6; }

  key(e) {
    if (!this.isOpen) return;
    const code = e.code, d = DIGIT(code), buyCodes = (Input.binds().buy || []);
    if (code === 'Escape' || buyCodes.includes(code)) { e.preventDefault(); e.stopPropagation(); this.close(); return; }
    if (code === 'Backspace') { e.preventDefault(); this.catPending = true; this.sel = -1; this.render(); return; }
    if (code === 'KeyR' && this.cat && this.sel >= 0) { e.preventDefault(); this.request(this.items()[this.sel]); return; }
    if (d < 0) return;
    e.preventDefault(); e.stopPropagation();
    if (!this.cat || this.catPending) {
      const c = BUY_CATS.find(x => x.key === d); if (!c) return;
      this.cat = c.id; this.catPending = false; this.sel = -1; this.render(); try { Audio.ui('tick'); } catch (er) { /* ok */ }
      return;
    }
    const list = this.items();
    if (d >= 1 && d <= list.length) { this.sel = d - 1; this.buy(list[d - 1]); this.catPending = true; }
    else { const c = BUY_CATS.find(x => x.key === d); if (c) { this.cat = c.id; this.sel = -1; this.render(); } }
  }
  items() { const c = BUY_CATS.find(x => x.id === this.cat); return c ? c.items.slice(0, 9) : []; }

  locked(id) {
    const me = this.me(), E = this.E;
    if (!me || me.bot || E.free) return null;
    const P = typeof window !== 'undefined' && window.LF && window.LF.profile;
    const it = itemInfo(id); if (!P || !it || it.kind === 'gear') return null;
    try { if (P.owns(it.kind === 'nade' ? 'nade' : 'gun', id)) return null; const li = P.lockInfo && P.lockInfo(it.kind === 'nade' ? 'nade' : 'gun', id); return li ? 'LEVEL ' + li.level : 'LOCKED'; }
    catch (e) { return null; }
  }
  buy(id) {
    const me = this.me(); if (!me || !id) return;
    const lk = this.locked(id);
    if (lk) { this.flash('UNLOCKS AT ' + lk); try { Audio.ui('deny'); } catch (e) { /* ok */ } return; }
    const r = this.E.buy(me, id);
    if (!r.ok) { this.flash(r.reason || 'CANNOT BUY'); try { Audio.ui('deny'); } catch (e) { /* ok */ } }
    else this.flash((r.pending ? 'ORDERED ' : 'BOUGHT ') + itemInfo(id).short + (r.price ? ' · ' + money(r.price) : ''), true);
    this.render();
  }
  sell(id) {
    const me = this.me(); const r = this.E.refund(me, id);
    this.flash(r.ok ? 'SOLD · +' + money(r.price || 0) : r.reason || 'CANNOT SELL', r.ok);
    if (!r.ok) { try { Audio.ui('deny'); } catch (e) { /* ok */ } }
    this.render();
  }
  request(id) {
    const me = this.me(); if (!id) return;
    const r = this.E.requestDrop(me, id);
    this.flash(r.ok ? 'A TEAM-MATE DROPPED IT AT YOUR FEET' : r.reason || 'NO DROP', r.ok);
    this.render();
  }

  render() {
    const me = this.me(), E = this.E, $ = this.$; if (!me || !E) return;
    // categories
    $.cats.innerHTML = '';
    for (const c of BUY_CATS) {
      const b = h('button', 'by-cat' + (c.id === this.cat ? ' on' : ''), '<i>' + c.key + '</i>' + c.label);
      b.onclick = () => { this.cat = c.id; this.sel = -1; this.catPending = false; this.render(); };
      $.cats.appendChild(b);
    }
    // items
    $.items.innerHTML = '';
    const list = this.items();
    list.forEach((id, i) => {
      const it = itemInfo(id), st = E.itemState(me, id), lk = this.locked(id);
      const g = it.kind === 'gun' ? getGun(id) : null;
      const name = g ? shortGun(g.name) : it.name;
      const state = lk ? 'LOCKED · ' + lk : st.locked ? st.reason : st.equipped ? 'EQUIPPED' : st.owned ? (it.kind === 'nade' ? '× ' + (st.count || 0) : 'OWNED') : !st.afford ? 'NEED ' + money(st.price - (me.money | 0)) : '';
      const card = h('button', 'by-item' + (st.owned ? ' owned' : '') + (st.equipped ? ' eq' : '') + (!st.afford && !st.owned ? ' poor' : '') + (st.locked || lk ? ' lock' : '') + (i === this.sel ? ' sel' : '') + (st.refund ? ' sell' : ''));
      const b = g ? bars(id) : null;
      card.innerHTML = '<i class="by-n">' + (i + 1) + '</i><div class="by-nm"><b>' + esc(name.toUpperCase()) + '</b><span>' + esc(g ? (g.maker ? '' : '') + CAT_TAG[g.cat] : CAT_TAG[it.cat] || '') + '</span></div>'
        + '<div class="by-pr">' + (st.price ? money(st.price) : 'FREE') + '</div>'
        + (it.reward && E.on ? '<div class="by-kr">+' + money(it.reward) + ' / KILL</div>' : '<div class="by-kr">' + esc(it.kind === 'gear' ? (GEARDESC[id] || '') : '') + '</div>')
        + (b ? '<div class="by-bars">' + [['DMG', b.damage], ['RATE', b.fireRate], ['RANGE', b.range], ['CTRL', b.control]].map(([k, v]) => '<span><em>' + k + '</em><u style="--v:' + (v | 0) + '%"></u></span>').join('') + '</div>' : '')
        + '<div class="by-st">' + esc(state) + (st.refund ? ' · RIGHT-CLICK TO SELL' : '') + '</div>';
      card.onmouseenter = () => { this.sel = i; for (const c of $.items.children) c.classList.toggle('sel', c === card); };
      card.onmousedown = ev => {
        ev.preventDefault();
        if (ev.button === 2) this.sell(id); else if (ev.shiftKey) this.request(id); else this.buy(id);
      };
      $.items.appendChild(card);
    });
    if (!list.length) $.items.innerHTML = '<div class="by-empty">PICK A CATEGORY</div>';
    // money, time, team, inventory
    $.money.textContent = E.free ? 'FREE' : money(me.money | 0);
    const left = E.buyLeft();
    $.time.textContent = Number.isFinite(left) ? 'BUY TIME ' + fmtTime(left) : E.free ? 'PRACTICE · EVERYTHING IS FREE' : 'WARMUP';
    $.sub.textContent = E.free ? '· FREE' : '· ' + (this.g.mode.name || '').toUpperCase();
    if (E.on) $.team.innerHTML = E.teamMoney(me.team).map(r => '<div class="by-tm' + (r.id === me.id ? ' me' : '') + '"><span>' + esc(r.name) + (r.bot ? ' <i>BOT</i>' : '') + '</span><b>' + money(r.money) + '</b></div>').join('');
    else $.team.innerHTML = '<div class="by-tm"><span>NO ECONOMY</span></div>';
    const inv = me.inv, wn = w => (w ? esc(shortGun((getGun(w.gunId) || { name: w.gunId }).name).toUpperCase()) : '—');
    $.inv.innerHTML = '<div class="by-sh">CARRYING</div><div class="by-iv"><span>PRIMARY</span><b>' + wn(inv.primary) + '</b></div><div class="by-iv"><span>SIDEARM</span><b>' + wn(inv.secondary) + '</b></div>'
      + '<div class="by-iv"><span>ARMOUR</span><b>' + (me.armor >= 1 ? Math.round(me.armor) + (me.helmet ? ' + HELMET' : '') : '—') + '</b></div>'
      + '<div class="by-iv"><span>GRENADES</span><b>' + (inv.nades.length ? inv.nades.map(n => esc((itemInfo(n.gid) || { short: n.gid }).short) + (n.n > 1 ? ' ×' + n.n : '')).join(', ') : '—') + '</b></div>'
      + (inv.kit ? '<div class="by-iv"><span>KIT</span><b>DEFUSE KIT</b></div>' : '');
  }

  late(dt) {
    if (this.msgT > 0) { this.msgT -= dt; if (this.msgT <= 0) this.$.msg.classList.remove('on'); }
    if (!this.isOpen) return;
    const me = this.me();
    if (!me || !this.E || !this.E.canBuy(me).ok || this.g.menuOpen) { this.close(); return; }
    this.t -= dt;
    if (this.t <= 0) { this.t = 0.5; const left = this.E.buyLeft(); this.$.time.textContent = Number.isFinite(left) ? 'BUY TIME ' + fmtTime(left) : this.$.time.textContent; this.$.money.textContent = this.E.free ? 'FREE' : money(me.money | 0); }
  }

  dispose() { this.close(); for (const f of this.offs) f(); this.offs.length = 0; this.el.remove(); }
}
const GEARDESC = { kevlar: 'TORSO + ARMS', kevhelm: 'VEST + HELMET', kit: 'DEFUSE IN 5 S' };
