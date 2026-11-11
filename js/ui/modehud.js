/* LIVE FIRE — mode / objective HUD layer (created by js/ui/hud.js inside the HUD element). Reads plain state only (game.match,
   game.objectives.s, game.economy, the ModeDef's hud(game)), so it works the same on the host and on clients.
   - objective strip under the score bar: alive pips (round modes), capture zones (letter, owner colour, capture ring), the flags,
     the charge, hostages, the VIP, round history is on the scoreboard
   - world markers projected to the screen (sites, the charge, zones, flags, hostages, extraction, dog tags, VIP, juggernaut, hide
     spots), clamped to the screen edge with an arrow when `edge`, distance in metres
   - the action progress bar (plant / defuse / hostage / capture / extraction), contextual prompts, a blindfold overlay (hide & seek)
   - money with per-event deltas (+$300 KILL WITH ...), the buy-zone / buy-time pill, objective notices, MATCH POINT / OVERTIME /
     LAST ROUND OF THE HALF, the round MVP card, the freeze countdown ticks, hardcore mode (hides crosshair, vitals, ammo, hit marker)
   Exports: ModeHud  class: new ModeHud(game, hud); late(dt); note(text, tone, secs); dispose() */
import { Input } from '../core/input.js';
import { TEAM_COLORS } from '../game/player.js';
import { Audio } from '../game/game.js';
import { fmtTime } from '../core/util.js';
import { getGun } from '../weapons/data.js';

const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const money = n => '$' + Math.round(n).toLocaleString('en-US');
const ICON = {
  site: '', bomb: '<svg viewBox="0 0 20 20"><rect x="3" y="7" width="14" height="9" rx="1"/><rect x="6" y="4" width="8" height="3"/><circle cx="14" cy="11.5" r="1.4" class="led"/></svg>',
  zone: '', flag: '<svg viewBox="0 0 20 20"><path d="M5 2v17M5 3h10l-3 3.5 3 3.5H5"/></svg>', hostage: '<svg viewBox="0 0 20 20"><circle cx="10" cy="5" r="3"/><path d="M4 18c0-5 2.5-8 6-8s6 3 6 8"/></svg>',
  extract: '<svg viewBox="0 0 20 20"><path d="M10 17V5M5 9l5-5 5 5"/></svg>', tag: '<svg viewBox="0 0 20 20"><rect x="6" y="3" width="8" height="12" rx="2"/><circle cx="10" cy="5.5" r="1"/></svg>',
  vip: '<svg viewBox="0 0 20 20"><path d="M3 15l2-9 5 5 5-5 2 9z"/></svg>', jugg: '<svg viewBox="0 0 20 20"><path d="M4 4h12v6c0 4-3 6-6 7-3-1-6-3-6-7z"/></svg>',
  hide: '<svg viewBox="0 0 20 20"><path d="M2 10s3-5 8-5 8 5 8 5-3 5-8 5-8-5-8-5z"/><path d="M3 17L17 3"/></svg>', carrier: '<svg viewBox="0 0 20 20"><rect x="3" y="7" width="14" height="9" rx="1"/></svg>',
};

export class ModeHud {
  constructor(game, hud) {
    this.g = game; this.hud = hud;
    const el = this.el = h('div', 'mh');
    el.innerHTML = `<div class="mh-strip"></div><div class="mh-notes"></div><div class="mh-marks"></div>
      <div class="mh-bar"><div class="mh-bar-l"></div><div class="mh-bar-t"><i></i></div></div><div class="mh-prompt"></div>
      <div class="mh-econ"><div class="mh-money"></div><div class="mh-buyz"></div><div class="mh-cash"></div></div>
      <div class="mh-blind"><div class="mh-blind-a"></div><div class="mh-blind-b"></div></div>
      <div class="mh-mvp"><b>MVP</b><span class="mh-mvp-n"></span><span class="mh-mvp-w"></span></div>
      <div class="mh-alert"></div>`;
    hud.el.appendChild(el);
    const q = s => el.querySelector(s);
    this.$ = { strip: q('.mh-strip'), notes: q('.mh-notes'), marks: q('.mh-marks'), bar: q('.mh-bar'), barL: q('.mh-bar-l'), barI: q('.mh-bar-t i'),
      prompt: q('.mh-prompt'), econ: q('.mh-econ'), money: q('.mh-money'), buyz: q('.mh-buyz'), cash: q('.mh-cash'), blind: q('.mh-blind'),
      blindA: q('.mh-blind-a'), blindB: q('.mh-blind-b'), mvp: q('.mh-mvp'), mvpN: q('.mh-mvp-n'), mvpW: q('.mh-mvp-w'), alert: q('.mh-alert') };
    this.cache = Object.create(null); this.pool = []; this.slowT = 0; this.notesL = []; this.cashL = []; this.mvpT = 0; this.alertT = 0; this.lastCount = -1;
    if (game.mode.hardcore) hud.el.classList.add('hc');
    this.V = typeof BABYLON !== 'undefined' ? { v: new BABYLON.Vector3(), o: new BABYLON.Vector3() } : null;
    const bus = game.bus, me = () => game.local;
    this.offs = [
      bus.on('objective', e => this.onObjective(e)),
      bus.on('money', e => { if (e.p && e.p === me() && e.delta) this.cash(e.delta, e.why); }),
      bus.on('buy', e => { if (e.p && e.p === me()) { try { Audio.ui(e.refund ? 'back' : 'buy'); } catch (er) { /* ok */ } } }),
      bus.on('round:end', e => this.roundEnd(e)),
      bus.on('match:point', e => { const m = me(); this.alert(e.team === 3 ? 'MATCH POINT · BOTH TEAMS' : 'MATCH POINT · ' + game.match.teamName(e.team), m && (e.team === m.team || e.team === 3) ? 'win' : 'lose', 4); }),
      bus.on('overtime', e => this.alert('OVERTIME ' + e.n, '', 5)),
      bus.on('halftime', e => { if (e.kind === 'ot') this.note('OVERTIME · $' + (game.match.limit.ot ? game.match.limit.ot.money : 10000) + ' FOR EVERYONE', 'obj', 5); }),
      bus.on('round:start', () => { const m = game.match, md = game.mode; if (m.rounds && md.teams === 2 && md.halftime !== false && !md.swapEveryRound && !m.ot && m.half === 1 && m.roundsPlayed === Math.floor(m.limit.rounds / 2) - 1) this.note('LAST ROUND OF THE FIRST HALF', '', 3.5); }),
      bus.on('team:balance', e => { if (e.p === me()) this.alert('MOVED TO ' + game.match.teamName(e.to), '', 4); }),
    ];
  }

  // ----------------------------------------------------------------------------------------------- notices
  note(text, tone = '', secs = 3.5) {
    const n = h('div', 'mh-note' + (tone ? ' ' + tone : ''), esc(text));
    this.$.notes.prepend(n); this.notesL.unshift({ el: n, t: secs });
    while (this.notesL.length > 3) this.notesL.pop().el.remove();
  }
  alert(text, tone, secs = 3) { this.$.alert.textContent = text; this.$.alert.dataset.tone = tone || ''; this.$.alert.classList.add('on'); this.alertT = secs; }
  cash(delta, why) {
    const n = h('div', 'mh-delta ' + (delta > 0 ? 'up' : 'down'), (delta > 0 ? '+' : '−') + money(Math.abs(delta)) + (why ? ' <span>' + esc(why) + '</span>' : ''));
    this.$.cash.prepend(n); this.cashL.unshift({ el: n, t: 3.2 });
    while (this.cashL.length > 4) this.cashL.pop().el.remove();
  }
  roundEnd(e) {
    const g = this.g, me = g.local;
    if (e.mvp) {
      this.$.mvpN.textContent = e.mvpName.toUpperCase(); this.$.mvpW.textContent = e.mvpReason || '';
      this.$.mvp.classList.add('on'); this.mvpT = 5;
      if (me && e.mvp === me.id) { try { Audio.ui('mvp'); } catch (er) { /* ok */ } }
    }
  }
  onObjective(e) {
    const g = this.g, me = g.local; if (!me) return;
    const nm = p => (p && p.name ? p.name.toUpperCase() : '');
    const isMe = e.actor && e.actor === me, mine = e.team === me.team, TN = t => g.match.teamName(t);
    const k = e.kind + ':' + e.action;
    switch (k) {
      case 'bomb:given': if (isMe) this.note('YOU HAVE THE CHARGE · PLANT IT AT ' + g.objectives.cfg.bomb.sites.join(' OR '), 'obj', 4.5); break;
      case 'bomb:picked': if (me.team === e.team) this.note(isMe ? 'YOU PICKED UP THE CHARGE' : nm(e.actor) + ' PICKED UP THE CHARGE', 'obj'); break;
      case 'bomb:dropped': if (me.team === e.team) this.note(isMe ? 'YOU DROPPED THE CHARGE' : 'THE CHARGE WAS DROPPED', 'warn'); break;
      case 'bomb:planted': this.note('CHARGE PLANTED · SITE ' + e.site, 'bad', 5); break;
      case 'bomb:defused': this.note('CHARGE DEFUSED', 'good', 4); break;
      case 'hostage:picked': this.note(isMe ? 'HOSTAGE SECURED · GET TO THE RESCUE ZONE' : nm(e.actor) + ' HAS A HOSTAGE', mine ? 'obj' : 'warn'); break;
      case 'hostage:rescued': this.note('HOSTAGE RESCUED · ' + e.count + ' / ' + g.objectives.s.hostGoal, mine ? 'good' : 'bad', 4); break;
      case 'hostage:killed': this.note('A HOSTAGE WAS KILLED' + (isMe ? ' · −$1,000' : ''), 'bad', 4); break;
      case 'hostage:dropped': if (mine) this.note('HOSTAGE DOWN', 'warn'); break;
      case 'flag:taken': this.note(e.team === me.team ? 'YOUR FLAG WAS TAKEN' : (isMe ? 'YOU HAVE THE ENEMY FLAG' : nm(e.actor) + ' HAS THE ENEMY FLAG'), e.team === me.team ? 'bad' : 'good'); break;
      case 'flag:dropped': this.note(e.team === me.team ? 'YOUR FLAG WAS DROPPED · RETURN IT' : 'ENEMY FLAG DROPPED', 'warn'); break;
      case 'flag:returned': this.note(e.team === me.team ? 'YOUR FLAG IS HOME' : 'ENEMY FLAG RETURNED', e.team === me.team ? 'good' : ''); break;
      case 'flag:captured': this.note(TN(e.team) + ' CAPTURED THE FLAG', mine ? 'good' : 'bad', 4.5); break;
      case 'zone:captured': if (!e.quiet) this.note(TN(e.team) + ' CAPTURED ' + this.zoneLabel(e.zone), mine ? 'good' : 'bad'); break;
      case 'zone:neutralized': this.note(this.zoneLabel(e.zone) + ' NEUTRALISED', mine ? 'good' : 'bad'); break;
      case 'zone:moved': this.note(g.mode.id === 'headquarters' ? 'NEW HQ ONLINE' : 'THE ZONE HAS MOVED', 'obj', 4); break;
      case 'zone:destroyed': this.note(e.lost === me.team ? 'YOUR HQ WAS DESTROYED' : 'ENEMY HQ DESTROYED', e.lost === me.team ? 'bad' : 'good', 4); break;
      case 'tag:confirmed': if (isMe) this.note('KILL CONFIRMED', 'good', 2); break;
      case 'tag:denied': if (isMe) this.note('KILL DENIED', 'good', 2); break;
      case 'vip:chosen': this.note(isMe ? 'YOU ARE THE VIP · REACH AN EXTRACTION POINT' : me.team === e.team ? 'PROTECT THE VIP: ' + nm(e.actor) : 'FIND AND ELIMINATE THE VIP', 'obj', 5); break;
      case 'vip:escaped': this.note('THE VIP WAS EXTRACTED', mine ? 'good' : 'bad', 4); break;
      case 'vip:killed': this.note('THE VIP IS DOWN', e.team === me.team ? 'bad' : 'good', 4); break;
      case 'jugg:new': this.alert(isMe ? 'YOU ARE THE JUGGERNAUT' : nm(e.actor) + ' IS THE JUGGERNAUT', isMe ? 'win' : 'lose', 3); break;
      case 'ladder:level': if (isMe || (e.team && e.team === me.team)) this.note('LEVEL ' + (e.level + 1) + ' · ' + this.gun(e.gun), 'good', 2.5); break;
      case 'ladder:demoted': if (isMe) this.note('KNIFED · LEVEL DOWN', 'bad', 2.5); break;
      case 'sharp:rotate': this.alert('NEW WEAPON · ' + this.gun(e.gun), '', 2.5); break;
      case 'infect:infected': if (e.victim === me.id) this.alert('YOU HAVE BEEN INFECTED', 'lose', 3); break;
      case 'hide:head_start': this.note(me.team === e.team ? 'HIDE! ' + e.secs + ' SECONDS HEAD START' : 'WAIT · ' + e.secs + ' SECONDS', 'obj', 4); break;
      case 'hide:released': this.note(me.team === e.team ? 'GO! FIND THEM' : 'THE SEEKERS ARE OUT', me.team === e.team ? 'good' : 'bad', 3.5); break;
      default: break;
    }
  }
  zoneLabel(id) { const z = this.g.objectives.zone(id); return z ? z.label : id; }
  gun(id) { const g = getGun(id); return g ? g.name.toUpperCase() : String(id || '').toUpperCase(); }

  // ----------------------------------------------------------------------------------------------- strip (4 Hz)
  strip() {
    const g = this.g, m = g.match, O = g.objectives, s = O.s, me = g.local;
    let html = '';
    if (m.rounds && g.mode.teams === 2) {
      const my = me && me.team === 2 ? 2 : 1, ot = 3 - my;
      const pips = t => { const all = m.teamPlayers(t), a = all.filter(p => p.alive).length; let x = ''; for (let i = 0; i < Math.min(all.length, 10); i++) x += '<i class="' + (i < a ? 'on' : '') + '"></i>'; return x; };
      html += '<div class="mh-pips"><span class="p" style="--tc:' + TEAM_COLORS[my] + '">' + pips(my) + '</span><span class="vs">' + m.alive(my) + ' · ' + m.alive(ot) + '</span><span class="p r" style="--tc:' + TEAM_COLORS[ot] + '">' + pips(ot) + '</span></div>';
    }
    if (s.zones) {
      html += '<div class="mh-zones">';
      for (const z of s.zones) {
        if (!z.active && s.zones.length > 3) continue;
        const col = z.owner ? TEAM_COLORS[z.owner] : 'rgba(236,235,230,.55)', lead = z.c > 0.02 ? 1 : z.c < -0.02 ? 2 : 0;
        const k = Math.abs(z.c), mine = me && z.owner === me.team;
        html += '<span class="mh-z' + (z.contested ? ' ct' : '') + (z.active ? '' : ' off') + (mine ? ' mine' : '') + '" style="--zc:' + col + ';--lc:' + (lead ? TEAM_COLORS[lead] : 'transparent') + ';--k:' + (k * 360).toFixed(0) + 'deg"><b>' + esc(z.label) + '</b></span>';
      }
      html += '</div>';
    }
    if (s.flags) {
      const st = f => f.state === 'home' ? 'HOME' : f.state === 'dropped' ? 'DROPPED' : 'TAKEN';
      html += '<div class="mh-flags">' + [1, 2].map(t => '<span class="mh-f ' + s.flags[t].state + '" style="--tc:' + TEAM_COLORS[t] + '">' + ICON.flag + '<b>' + st(s.flags[t]) + '</b></span>').join('') + '</div>';
    }
    if (s.hostages && s.hostages.length) {
      html += '<div class="mh-host">' + s.hostages.map(x => '<span class="mh-h ' + x.state + '">' + ICON.hostage + '</span>').join('') + '</div>';
    }
    if (s.bomb && me) {
      const b = s.bomb, att = me.team === O.cfg.bomb.attackers;
      if (b.state === 'planted') html += '<div class="mh-bomb planted">' + ICON.bomb + '<b>SITE ' + esc(b.site) + '</b></div>';
      else if (att && (b.state === 'carried' || b.state === 'dropped')) {
        const c = O.bombHolder();
        html += '<div class="mh-bomb ' + b.state + '">' + ICON.bomb + '<b>' + (b.state === 'dropped' ? 'DROPPED' : c === me ? 'YOU' : c ? esc(c.name.toUpperCase()) : '') + '</b></div>';
      }
    }
    this.set('strip', this.$.strip, html, 'innerHTML');
  }

  // ----------------------------------------------------------------------------------------------- markers (every frame)
  markers() {
    const g = this.g, cam = g.camera, me = g.local, W = this.hud.el.clientWidth || window.innerWidth, H = this.hud.el.clientHeight || window.innerHeight;
    if (!cam || !this.V || !me || !g.scene) { for (const e of this.pool) { e.style.display = 'none'; e._c.disp = 'none'; } return; }
    const mh = this.hud.mh, list = g.objectives.markers(me);
    if (mh && mh.extraMarkers) list.push(...mh.extraMarkers);
    const view = cam.getViewMatrix(), vp = g.scene.getTransformMatrix(), V = this.V.v, Cs = this.V.o;
    const cx = cam.globalPosition ? cam.globalPosition : cam.position;
    let n = 0;
    for (const mk of list) {
      const dx = mk.x - cx.x, dy = mk.y - cx.y, dz = mk.z - cx.z, dist = Math.hypot(dx, dy, dz);
      if (mk.max && dist > mk.max) continue;
      V.set(mk.x, mk.y, mk.z);
      BABYLON.Vector3.TransformCoordinatesToRef(V, view, Cs);
      let sx, sy, edge = false, behind = Cs.z < 0.1;
      if (!behind) {
        BABYLON.Vector3.TransformCoordinatesToRef(V, vp, Cs);
        sx = (Cs.x + 1) * 0.5 * W; sy = (1 - Cs.y) * 0.5 * H;
      }
      const m = 28;
      if (behind || sx < m || sx > W - m || sy < m + 30 || sy > H - m) {
        if (!mk.edge) continue;
        // direction on screen from the centre (behind: mirrored), pushed to the border
        BABYLON.Vector3.TransformCoordinatesToRef(V, view, Cs);
        let ax = Cs.x, ay = -Cs.y; if (behind) { ax = -ax || 0.001; ay = Math.abs(ay) + 0.2; }
        if (!behind) { ax = sx - W / 2; ay = sy - H / 2; }
        const kx = (W / 2 - m) / Math.max(1e-3, Math.abs(ax)), ky = (H / 2 - m - 20) / Math.max(1e-3, Math.abs(ay)), k = Math.min(kx, ky);
        sx = W / 2 + ax * k; sy = H / 2 + ay * k; edge = true;
      }
      let el = this.pool[n];
      if (!el) { el = h('div', 'mh-mk', '<i class="ic"></i><b></b><s></s><u></u>'); this.$.marks.appendChild(el); this.pool[n] = el; el._c = {}; }
      n++;
      const c = el._c;
      if (c.disp !== 'block') { el.style.display = 'block'; c.disp = 'block'; }
      el.style.transform = 'translate(' + sx.toFixed(1) + 'px,' + sy.toFixed(1) + 'px)';
      if (c.icon !== mk.icon) { c.icon = mk.icon; el.firstChild.innerHTML = ICON[mk.icon] || ''; el.dataset.icon = mk.icon; }
      if (c.label !== mk.label) { c.label = mk.label; el.children[1].textContent = mk.label; }
      const d = mk.dist ? Math.round(dist) + ' M' : '';
      if (c.d !== d) { c.d = d; el.children[2].textContent = d; }
      if (c.col !== mk.color) { c.col = mk.color; el.style.setProperty('--mc', mk.color); }
      const cls = 'mh-mk' + (edge ? ' edge' : '') + (mk.pulse ? ' pulse' : '') + (dist < 4 ? ' near' : '');
      if (c.cls !== cls) { c.cls = cls; el.className = cls; }
      if (mk.icon === 'zone') { const ring = (Math.abs(mk.r || 0) * 360).toFixed(0) + 'deg'; if (c.ring !== ring) { c.ring = ring; el.style.setProperty('--k', ring); } }
    }
    for (let i = n; i < this.pool.length; i++) { const el = this.pool[i]; if (el._c.disp !== 'none') { el.style.display = 'none'; el._c.disp = 'none'; } }
  }

  set(k, el, v, prop = 'textContent') { if (this.cache[k] === v) return; this.cache[k] = v; el[prop] = v; }
  cls(k, el, c, on) { const key = k + c; if (this.cache[key] === on) return; this.cache[key] = on; el.classList.toggle(c, on); }

  late(dt) {
    const g = this.g, me = g.local, m = g.match, O = g.objectives, E = g.economy, $ = this.$;
    if (!me || !O) return;
    dt = Math.min(dt, 0.1);
    this.slowT -= dt;
    if (this.slowT <= 0) { this.slowT = 0.25; this.strip(); }
    this.markers();
    // progress bar
    const pr = O.progress(me);
    this.cls('bar', $.bar, 'on', !!pr);
    if (pr) {
      this.set('barL', $.barL, pr.label);
      this.set('barW', $.barI.style, Math.round(Math.min(1, pr.k) * 1000) / 10 + '%', 'width');
      this.set('barC', $.bar.style, pr.color, 'color');
      this.cls('barw', $.bar, 'warn', !!pr.warn);
    }
    // prompt
    const key = a => esc(Input.keyLabel(a));
    let prompt = me.alive ? O.prompt(me, key) : '';
    const buy = E && (E.on || E.free) && me.alive && E.canBuy(me).ok;
    this.set('prompt', $.prompt, prompt, 'innerHTML');
    // economy
    const showEcon = E && E.on;
    this.cls('econ', $.econ, 'on', !!(showEcon || (E && E.free)));
    if (showEcon) this.set('money', $.money, money(me.money | 0));
    else if (E && E.free) this.set('money', $.money, 'FREE ARMORY');
    if (E && (E.on || E.free)) {
      const left = E.buyLeft();
      const txt = buy ? '<kbd>' + key('buy') + '</kbd> BUY' + (Number.isFinite(left) ? ' · ' + fmtTime(left) : '') : '';
      this.set('buyz', $.buyz, txt, 'innerHTML');
    }
    for (let i = this.cashL.length - 1; i >= 0; i--) { const c = this.cashL[i]; c.t -= dt; if (c.t <= 0) { c.el.remove(); this.cashL.splice(i, 1); } else if (c.t < 0.6) c.el.style.opacity = String(c.t / 0.6); }
    // blindfold (hide & seek seekers)
    const bl = me.alive && me.blind > 0;
    this.cls('blind', $.blind, 'on', bl);
    if (bl) { this.set('blA', $.blindA, 'BLINDFOLDED'); this.set('blB', $.blindB, 'RELEASED IN ' + Math.ceil(me.blind)); }
    // notices, MVP, alert
    for (let i = this.notesL.length - 1; i >= 0; i--) { const n = this.notesL[i]; n.t -= dt; if (n.t <= 0) { n.el.remove(); this.notesL.splice(i, 1); } else if (n.t < 0.5) n.el.style.opacity = String(n.t / 0.5); }
    if (this.mvpT > 0) { this.mvpT -= dt; if (this.mvpT <= 0) $.mvp.classList.remove('on'); }
    if (this.alertT > 0) { this.alertT -= dt; if (this.alertT <= 0) $.alert.classList.remove('on'); }
    // freeze countdown ticks (last 5 s)
    if (m.phase === 'freeze' || m.phase === 'warmup') {
      const c = Math.ceil(m.t);
      if (c !== this.lastCount && c <= 5 && c > 0) { try { Audio.ui('countdown'); } catch (e) { /* ok */ } }
      this.lastCount = c;
    } else this.lastCount = -1;
  }

  dispose() { for (const f of this.offs) f(); this.offs.length = 0; this.el.remove(); if (this.hud && this.hud.el) this.hud.el.classList.remove('hc'); }
}
