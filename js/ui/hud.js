/* LIVE FIRE — in-match HUD (DOM in #hud): an "evidence footage" overlay. Health / armour / helmet, ammo (magazine + reserve,
   fire mode, grenades), crosshair from settings with a dynamic spread gap, hit markers (body / head / kill), damage direction
   indicators, killfeed, round timer + team scores + phase banners, interaction prompts, death panel (killer, respawn timer,
   spectating), a REC body-cam timestamp block, a fallback magnified-scope overlay (until js/weapons/scope.js exists), a Tab
   scoreboard fallback (until js/ui/scoreboard.js exists) and an optional FPS line.
   Exports:
     Hud   class (game system 'hud'): new Hud(game); game.addSystem(hud). late(dt) updates the DOM (writes only what changed).
           hud.el, hud.message(text, sub, secs), hud.showScoreboard(bool), dispose()
   Settings read: crosshair { style color size gap thick dot outline alpha dynamic }, hudScale, bodycamHud, showFps. */
import { Settings } from '../core/settings.js';
import { Input } from '../core/input.js';
import { loopStats } from '../core/loop.js';
import { fmtTime, clamp } from '../core/util.js';
import { getGun } from '../weapons/data.js';
import { getNade } from '../grenades/data.js';
import { currentWeapon, statsOf, currentCone, nearestDrop, reloadProgress, scopedView } from '../game/weapon.js';
import { TEAM_NAMES, TEAM_COLORS, isEnemy } from '../game/player.js';
import { getMapMeta } from '../maps/index.js';

const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const pad2 = n => (n < 10 ? '0' : '') + n;
/** killfeed weapon name without the maker prefix ('ZR-61K Kroha' -> 'KROHA', 'Ironbark Warden 556' -> 'WARDEN 556') */
export function shortName(gun) {
  if (gun.cat === 'melee') return gun.name.replace(/^(Ironbark|Gallo|Calder)\s+/i, '').toUpperCase();
  const re = /^(KR|IB(-\d+)?|ZR-[\w-]+|Type\s+\d+|Gallo|Calder|Pembroke|Morandi|Basalt|Norrhavn|Aokiri|Ironbark|Fratelli\s+Morandi|Kessler\s*&\s*Rauch)\s+/i;
  let n = gun.name; for (let i = 0; i < 2 && re.test(n); i++) n = n.replace(re, '');
  return n.toUpperCase();
}
const SHORT = { pistol: 'PST', smg: 'SMG', rifle: 'AR', carbine: 'CBN', br: 'BR', shotgun: 'SG', dmr: 'DMR', sniper: 'SR', lmg: 'MG', melee: 'KNF' };

export class Hud {
  constructor(game) {
    this.name = 'hud'; this.g = game;
    const host = document.getElementById('hud');
    const el = this.el = h('div', 'lf-hud');
    el.innerHTML = `
      <div class="hud-scope"><div class="sc-ret"></div></div>
      <div class="hud-rec"><div class="rec-l1"><i class="rec-dot"></i><b>REC</b><span class="rec-clock">00:00:00</span></div>
        <div class="rec-l2"><span class="rec-date"></span></div><div class="rec-l3"><span class="rec-unit"></span></div></div>
      <div class="hud-top"><div class="ht-team t1"><span class="ht-name"></span><b class="ht-s">0</b></div>
        <div class="ht-mid"><div class="ht-time">0:00</div><div class="ht-phase"></div></div>
        <div class="ht-team t2"><b class="ht-s">0</b><span class="ht-name"></span></div><div class="ht-sub"></div></div>
      <div class="hud-feed"></div>
      <div class="hud-xh"><i class="xh-t"></i><i class="xh-b"></i><i class="xh-l"></i><i class="xh-r"></i><i class="xh-d"></i><i class="xh-c"></i></div>
      <div class="hud-hit"><i></i><i></i><i></i><i></i></div>
      <div class="hud-dmg"></div>
      <div class="hud-msg"><div class="msg-a"></div><div class="msg-b"></div></div>
      <div class="hud-prompt"></div>
      <div class="hud-dead"><div class="dead-a"></div><div class="dead-b"></div><div class="dead-c"></div></div>
      <div class="hud-vitals"><div class="vt-row hp"><span class="vt-k">HP</span><b class="vt-v">100</b><div class="vt-bar"><i></i></div></div>
        <div class="vt-row ar"><span class="vt-k">AR</span><b class="vt-v">0</b><div class="vt-bar"><i></i></div><span class="vt-helm">HLM</span></div>
        <div class="vt-status"></div></div>
      <div class="hud-ammo"><div class="am-name"></div><div class="am-row"><b class="am-mag">0</b><span class="am-res">/ 0</span></div>
        <div class="am-sub"><span class="am-mode"></span><span class="am-nades"></span></div><div class="am-rl"><i></i></div></div>
      <div class="hud-board"></div>
      <div class="hud-fps"></div>
      <div class="hud-grain"></div>`;
    host.appendChild(el);
    const q = s => el.querySelector(s);
    this.$ = {
      rec: q('.hud-rec'), clock: q('.rec-clock'), date: q('.rec-date'), unit: q('.rec-unit'),
      t1: q('.ht-team.t1'), t2: q('.ht-team.t2'), s1: q('.t1 .ht-s'), s2: q('.t2 .ht-s'), n1: q('.t1 .ht-name'), n2: q('.t2 .ht-name'),
      time: q('.ht-time'), phase: q('.ht-phase'), sub: q('.ht-sub'), feed: q('.hud-feed'), xh: q('.hud-xh'), hit: q('.hud-hit'), dmg: q('.hud-dmg'),
      msg: q('.hud-msg'), msgA: q('.msg-a'), msgB: q('.msg-b'), prompt: q('.hud-prompt'), dead: q('.hud-dead'), deadA: q('.dead-a'), deadB: q('.dead-b'), deadC: q('.dead-c'),
      hp: q('.vt-row.hp'), hpV: q('.hp .vt-v'), hpBar: q('.hp .vt-bar i'), ar: q('.vt-row.ar'), arV: q('.ar .vt-v'), arBar: q('.ar .vt-bar i'), helm: q('.vt-helm'), status: q('.vt-status'),
      amName: q('.am-name'), amMag: q('.am-mag'), amRes: q('.am-res'), amMode: q('.am-mode'), amNades: q('.am-nades'), amRl: q('.am-rl'), amRlBar: q('.am-rl i'), ammo: q('.hud-ammo'),
      scope: q('.hud-scope'), board: q('.hud-board'), fps: q('.hud-fps'),
    };
    this.cache = Object.create(null);
    this.hitT = 9; this.hitKind = ''; this.msgT = 0; this.board = false; this.recT = 0; this.boardT = 0;
    this.dmgPool = []; for (let i = 0; i < 6; i++) { const d = h('i', 'dmg-arc'); this.$.dmg.appendChild(d); this.dmgPool.push({ el: d, t: 9, ang: 0, from: null }); }
    this.feed = [];
    const meta = getMapMeta(game.mapId);
    this.unitId = 'LF-BWC 7  SN ' + String(4000 + (game.seed % 6000)).padStart(4, '0') + '-' + pad2(game.seed % 97);
    this.mapName = (meta ? meta.name : (game.def && game.def.name) || game.mapId).toUpperCase();
    this.$.unit.textContent = this.unitId + '  ·  ' + this.mapName;
    this.applySettings();
    const bus = game.bus;
    this.offs = [
      Settings.onChange(({ key }) => { if (key === 'crosshair' || key === 'hudScale' || key === 'bodycamHud' || key === 'showFps') this.applySettings(); }),
      bus.on('hit', e => { if (e.attacker && e.attacker.local && e.victim !== e.attacker) { this.hitT = 0; this.hitKind = e.kill ? 'kill' : e.headshot ? 'head' : e.armor ? 'armor' : 'body'; } }),
      bus.on('damage', e => { if (e.victim && e.victim.local && e.from && e.from !== e.victim) this.damageFrom(e.from, e.dmg); }),
      bus.on('kill', e => this.addFeed(e)),
      bus.on('round:end', e => this.roundEnd(e)),
      bus.on('round:start', () => { if (this.g.match.rounds) this.message('ROUND ' + this.g.match.round, 'GO', 1.6); else this.message('GO', '', 1.2); }),
      bus.on('halftime', () => this.message('HALF TIME', 'SWITCHING SIDES', 5)),
      bus.on('match:end', e => this.matchEnd(e)),
      Input.on((type, a) => { if (a === 'scoreboard') this.showScoreboard(type === 'down'); }),
    ];
  }

  applySettings() {
    const c = Settings.get('crosshair') || {}, s = this.el.style;
    s.setProperty('--hud-k', Settings.get('hudScale') || 1);
    s.setProperty('--xh-col', c.color || '#4cff6a'); s.setProperty('--xh-a', c.alpha ?? 0.95);
    s.setProperty('--xh-len', (c.size ?? 5) + 'px'); s.setProperty('--xh-th', (c.thick ?? 1.5) + 'px');
    s.setProperty('--xh-ol', c.outline ? '0 0 0 1px rgba(0,0,0,.65)' : 'none');
    this.xh = c; this.xhGap = c.gap ?? 3;
    this.$.xh.dataset.style = c.style || 'cross';
    this.$.xh.classList.toggle('dot', !!c.dot);
    this.$.rec.style.display = Settings.get('bodycamHud') === false ? 'none' : '';
    this.$.fps.style.display = Settings.get('showFps') ? '' : 'none';
  }

  set(k, el, v, prop = 'textContent') { if (this.cache[k] === v) return; this.cache[k] = v; el[prop] = v; }
  cls(k, el, c, on) { const key = k + c; if (this.cache[key] === on) return; this.cache[key] = on; el.classList.toggle(c, on); }

  message(a, b = '', secs = 2.5) { this.$.msgA.textContent = a; this.$.msgB.textContent = b; this.msgT = secs; this.$.msg.classList.add('on'); }
  roundEnd(e) {
    const me = this.g.local, w = e.winner;
    const name = w > 0 ? TEAM_NAMES[w] : 'DRAW';
    const why = { elimination: 'ELIMINATED', time: 'TIME EXPIRED', objective: 'OBJECTIVE', bomb: 'TARGET DESTROYED', defuse: 'CHARGE DEFUSED' }[e.reason] || '';
    this.message(w > 0 ? name + ' WINS THE ROUND' : 'ROUND DRAW', why, 4);
    this.$.msg.dataset.tone = me && w === me.team ? 'win' : w > 0 ? 'lose' : '';
  }
  matchEnd(e) {
    const me = this.g.local, w = e.winner;
    let a = 'MATCH OVER', tone = '';
    if (this.g.mode.teams === 0) { const p = this.g.players.get(w); a = p ? (p === me ? 'YOU WIN' : p.name.toUpperCase() + ' WINS') : 'DRAW'; tone = p === me ? 'win' : 'lose'; }
    else if (w > 0) { a = TEAM_NAMES[w] + ' WINS'; tone = me && me.team === w ? 'win' : 'lose'; }
    else a = 'DRAW';
    const sc = this.g.mode.teams === 0 ? '' : e.score[1] + ' — ' + e.score[2];
    this.message(a, sc, 30); this.$.msg.dataset.tone = tone;
  }

  damageFrom(from, dmg) {
    let slot = this.dmgPool.find(d => d.from === from && d.t < 1.5) || this.dmgPool.reduce((a, b) => (a.t > b.t ? a : b));
    slot.from = from; slot.t = 0; slot.k = clamp(dmg / 40, 0.35, 1);
  }

  addFeed(e) {
    const g = this.g, me = g.local;
    const row = h('div', 'kf-row');
    const nm = p => p ? '<span class="kf-n" style="color:' + (TEAM_COLORS[p.team] || '#ddd') + '">' + esc(p.name) + '</span>' : '';
    const gun = getGun(e.weapon);
    const wname = gun ? shortName(gun)
      : ({ fall: 'FALL', world: 'WORLD', blast: 'BLAST', fire: 'FIRE', gas: 'GAS' }[e.kind] || String(e.weapon || '').toUpperCase());
    const tags = (e.headshot ? '<i class="kf-t hs">HS</i>' : '') + (e.wallbang ? '<i class="kf-t wb">WB</i>' : '') + (e.noscope ? '<i class="kf-t ns">NS</i>' : '')
      + (e.smoke ? '<i class="kf-t sm">SMK</i>' : '') + (e.backstab ? '<i class="kf-t bs">BACK</i>' : '');
    row.innerHTML = (e.killer ? nm(e.killer) + (e.assister ? '<span class="kf-plus">+</span>' + nm(e.assister) : '') : '')
      + '<span class="kf-w">' + esc(wname) + '</span>' + tags + nm(e.victim);
    if (me && (e.killer === me || e.victim === me || e.assister === me)) row.classList.add(e.victim === me ? 'me-dead' : 'me');
    this.$.feed.prepend(row);
    this.feed.unshift({ el: row, t: 0 });
    while (this.feed.length > 6) { const f = this.feed.pop(); f.el.remove(); }
    if (e.victim === me) {
      this.killedBy = e;
    }
  }

  showScoreboard(on) { this.board = !!on; this.$.board.classList.toggle('on', this.board); if (on) this.renderBoard(); }
  renderBoard() {
    const g = this.g, rows = g.mode.score ? g.mode.score(g) : [...g.players.values()].map(p => ({ id: p.id, name: p.name, team: p.team, score: p.score, kills: p.kills, deaths: p.deaths, assists: p.assists }));
    const teams = g.mode.teams === 0 ? [0] : [1, 2];
    let html = '<div class="sb-head"><span>' + esc(this.mapName) + '</span><span>' + esc((g.mode.name || '').toUpperCase()) + '</span></div>';
    for (const t of teams) {
      html += '<div class="sb-team" style="--tc:' + TEAM_COLORS[t] + '"><div class="sb-th"><b>' + (t ? TEAM_NAMES[t] : 'OPERATORS') + '</b>' + (t ? '<span>' + g.match.score[t] + '</span>' : '') + '</div>'
        + '<div class="sb-r sb-hr"><span>NAME</span><span>K</span><span>D</span><span>A</span><span>SCORE</span><span>PING</span></div>';
      for (const r of rows.filter(r => t === 0 || r.team === t)) {
        const p = g.players.get(r.id);
        html += '<div class="sb-r' + (p && p.local ? ' me' : '') + (p && !p.alive ? ' dead' : '') + '"><span>' + esc(r.name) + (p && p.bot ? ' <i>BOT</i>' : '') + '</span><span>' + r.kills + '</span><span>' + r.deaths
          + '</span><span>' + r.assists + '</span><span>' + r.score + '</span><span>' + (p && p.bot ? 'BOT' : (p ? p.ping | 0 : 0)) + '</span></div>';
      }
      html += '</div>';
    }
    this.$.board.innerHTML = html;
  }

  late(dt) {
    const g = this.g, p = g.local, $ = this.$, m = g.match;
    if (!p) return;
    dt = Math.min(dt, 0.1);
    // ---- REC block (real time + recording clock)
    this.recT += dt;
    if (this.recT > 0.25) {
      this.recT = 0;
      const d = new Date(), el = Math.floor(m.elapsed);
      this.set('clock', $.clock, pad2(Math.floor(el / 3600)) + ':' + pad2(Math.floor(el / 60) % 60) + ':' + pad2(el % 60));
      const tz = -d.getTimezoneOffset(), tzs = (tz >= 0 ? '+' : '-') + pad2(Math.floor(Math.abs(tz) / 60)) + pad2(Math.abs(tz) % 60);
      this.set('date', $.date, d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) + '  ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds()) + ' ' + tzs);
      if (Settings.get('showFps')) this.set('fps', $.fps, loopStats.fps.toFixed(0) + ' FPS  ' + loopStats.cpuMs.toFixed(1) + ' MS' + (loopStats.errors ? '  ERR ' + loopStats.errors : ''));
      if (this.board) this.renderBoard();
      // slow-changing text (allocates: 4 Hz is plenty)
      this.mh = g.mode.hud ? g.mode.hud(g) : null;
      if (g.mode.teams === 0) {
        const rk = [...g.players.values()].sort((a, b) => b.kills - a.kills);
        this.ffaLead = rk[0] && rk[0] !== p ? rk[0].kills : rk[1] ? rk[1].kills : 0; this.ffaLeadName = rk[0] && rk[0] !== p ? 'LEAD' : '2ND';
      }
    }
    // ---- top: scores, clock, phase
    const ffa = g.mode.teams === 0;
    if (ffa) {
      this.set('n1', $.n1, 'YOU'); this.set('s1', $.s1, String(p.kills));
      this.set('n2', $.n2, this.ffaLeadName || 'LEAD'); this.set('s2', $.s2, String(this.ffaLead || 0));
    } else {
      const my = p.team === 2 ? 2 : 1, ot = 3 - my;
      this.set('n1', $.n1, TEAM_NAMES[my]); this.set('s1', $.s1, String(m.score[my]));
      this.set('n2', $.n2, TEAM_NAMES[ot]); this.set('s2', $.s2, String(m.score[ot]));
      this.set('c1', $.t1.style, TEAM_COLORS[my], 'color'); this.set('c2', $.t2.style, TEAM_COLORS[ot], 'color');
    }
    let tleft = m.phase === 'live' ? (m.rounds ? m.t : m.timeLeft) : m.t;
    const timeStr = Number.isFinite(tleft) ? fmtTime(tleft) : '--:--';
    this.set('time', $.time, timeStr);
    const ph = { warmup: 'WARMUP', freeze: 'STAND BY', live: m.rounds ? 'ROUND ' + m.round : '', roundEnd: 'ROUND OVER', halftime: 'HALF TIME', over: 'MATCH OVER' }[m.phase] || '';
    this.set('phase', $.phase, ph);
    const mh = this.mh;
    this.set('sub', $.sub, mh && mh.top ? mh.top : '');
    this.cls('low', $.time, 'low', m.phase === 'live' && Number.isFinite(tleft) && tleft < 10);
    // freeze countdown
    if (m.phase === 'freeze' || m.phase === 'warmup') {
      this.set('msgA', $.msgA, m.phase === 'warmup' ? 'WARMUP' : (m.round <= 1 ? 'MATCH STARTS IN' : 'ROUND ' + m.round + ' STARTS IN'));
      this.set('msgB', $.msgB, String(Math.max(0, Math.ceil(m.t))));
      $.msg.classList.add('on'); this.msgT = 0.3; $.msg.dataset.tone = '';
    }
    if (this.msgT > 0) { this.msgT -= dt; if (this.msgT <= 0) $.msg.classList.remove('on'); }
    // ---- killfeed fade
    for (let i = this.feed.length - 1; i >= 0; i--) { const f = this.feed[i]; f.t += dt; if (f.t > 7) { f.el.remove(); this.feed.splice(i, 1); } else if (f.t > 6) f.el.style.opacity = String(7 - f.t); }
    // ---- vitals
    const hp = Math.max(0, Math.ceil(p.hp)), ar = Math.max(0, Math.ceil(p.armor));
    this.set('hp', $.hpV, String(hp)); this.set('hpw', $.hpBar.style, hp + '%', 'width');
    this.cls('hpl', $.hp, 'low', p.alive && hp <= 25);
    this.set('ar', $.arV, String(ar)); this.set('arw', $.arBar.style, ar + '%', 'width');
    this.cls('helm', $.helm, 'on', !!p.helmet);
    const status = !p.alive ? '' : p.spawnProtect > 0 ? 'SPAWN PROTECTION' : p.flash > 0.5 ? 'BLINDED' : p.frozen ? 'HOLD' : '';
    this.set('status', $.status, status);
    // ---- ammo
    const w = currentWeapon(p), st = w ? statsOf(w) : null;
    if (w && st) {
      const gun = getGun(w.gunId);
      this.set('amName', $.amName, gun ? gun.name.toUpperCase() : '');
      if (w.melee) { this.set('amMag', $.amMag, '—'); this.set('amRes', $.amRes, ''); this.set('amMode', $.amMode, 'MELEE'); }
      else {
        this.set('amMag', $.amMag, String(w.mag));
        this.set('amRes', $.amRes, g.options.infiniteAmmo ? '/ ∞' : '/ ' + w.reserve);
        const md = w.fireMode ? (w.fireMode === 'burst' ? 'BURST ' + st.burst : w.fireMode.toUpperCase()) : '';
        this.set('amMode', $.amMode, md + (st.cycle ? ' · ' + st.cycle.toUpperCase() : ''));
      }
      this.cls('amLow', $.ammo, 'low', !w.melee && w.mag <= Math.max(1, Math.floor(st.mag * 0.2)));
      this.cls('amEmpty', $.ammo, 'empty', !w.melee && w.mag === 0);
    } else if (p.cur === 'nade') {
      const n = getNade(p.curNade); this.set('amName', $.amName, n ? n.name.toUpperCase() : 'GRENADE');
      this.set('amMag', $.amMag, String((p.inv.nades.find(x => x.gid === p.curNade) || { n: 0 }).n)); this.set('amRes', $.amRes, ''); this.set('amMode', $.amMode, 'THROW');
    }
    const nades = p.inv.nades.reduce((a, n) => a + n.n, 0);
    this.set('amNades', $.amNades, nades ? '◆ ' + nades : '');
    const rp = reloadProgress(p);
    this.cls('rl', $.amRl, 'on', rp >= 0);
    if (rp >= 0) this.set('rlw', $.amRlBar.style, Math.round(rp * 100) + '%', 'width');
    // ---- crosshair
    const ads = p.ws.ads, scoped = p.alive && scopedView(p);
    const xhOn = p.alive && !scoped && ads < 0.55 && m.phase !== 'over' && !(w && w.melee && false);
    this.cls('xh', $.xh, 'off', !xhOn);
    if (xhOn) {
      let gap = this.xhGap;
      if (this.xh.dynamic !== false && w && !w.melee) {
        const cone = currentCone(p), fov = g.rig ? g.rig.fov : 1.2, H = window.innerHeight;
        gap += Math.min(120, Math.tan(cone) / Math.tan(fov / 2) * (H / 2));
      }
      const gr = Math.round(gap * 2) / 2;
      if (this.cache.gapv !== gr) { this.cache.gapv = gr; $.xh.style.setProperty('--xh-gap', gr + 'px'); }
    }
    // ---- scope overlay (fallback)
    this.cls('scope', $.scope, 'on', !!scoped);
    // ---- hit marker
    this.hitT += dt;
    const hitOn = this.hitT < (this.hitKind === 'kill' ? 0.45 : 0.22);
    this.cls('hit', $.hit, 'on', hitOn);
    if (hitOn) { $.hit.dataset.k = this.hitKind; $.hit.style.opacity = String(1 - this.hitT / (this.hitKind === 'kill' ? 0.45 : 0.22) * 0.6); }
    // ---- damage indicators
    for (const d of this.dmgPool) {
      d.t += dt;
      if (d.t > 1.6 || !d.from) { if (d.on) { d.el.style.opacity = '0'; d.on = false; } continue; }
      const dx = d.from.pos.x - p.pos.x, dz = d.from.pos.z - p.pos.z;
      const ang = Math.atan2(dx, dz) - g.view.yaw;
      d.el.style.transform = 'rotate(' + (ang * 180 / Math.PI).toFixed(1) + 'deg)';
      d.el.style.opacity = String(clamp((1.6 - d.t) / 0.8, 0, 1) * (0.5 + 0.5 * (d.k || 1)));
      d.on = true;
    }
    // ---- prompt
    let prompt = '';
    if (p.alive && g.drops.length) {
      const dr = nearestDrop(g, p);
      if (dr) { const gg = getGun(dr.w.gunId); const slot = gg ? gg.slot : 'primary'; prompt = (p.inv[slot] ? '<kbd>' + Input.keyLabel('use') + '</kbd> SWAP FOR ' : '<kbd>' + Input.keyLabel('use') + '</kbd> PICK UP ') + esc(gg ? gg.name.toUpperCase() : ''); }
    }
    if (!prompt && p.alive && w && !w.melee && w.mag === 0 && (w.reserve > 0 || g.options.infiniteAmmo) && p.ws.state !== 'reload') prompt = '<kbd>' + Input.keyLabel('reload') + '</kbd> RELOAD';
    if (!prompt && !Input.locked && !Input.mouseUnlocked && !g.menuOpen && !g.override) prompt = 'CLICK TO TAKE CONTROL';
    this.set('prompt', $.prompt, prompt, 'innerHTML');
    // ---- death panel
    const deadOn = !p.alive && m.phase !== 'over';
    this.cls('dead', $.dead, 'on', deadOn);
    if (deadOn) {
      const kb = this.killedBy;
      let a = 'YOU DIED', b = '', c = '';
      if (kb && kb.killer && kb.killer !== p) {
        const gun = getGun(kb.weapon);
        a = 'KILLED BY ' + kb.killer.name.toUpperCase();
        b = (gun ? gun.name.toUpperCase() : String(kb.weapon || '').toUpperCase()) + (kb.headshot ? '  ·  HEADSHOT' : '') + (kb.wallbang ? '  ·  THROUGH COVER' : '')
          + '  ·  ' + Math.round(Math.hypot(kb.killer.pos.x - p.pos.x, kb.killer.pos.z - p.pos.z)) + ' M  ·  ' + Math.max(0, Math.ceil(kb.killer.hp)) + ' HP LEFT';
      } else if (kb && kb.kind === 'fall') a = 'FATAL FALL';
      if (p.respawnT > 0) c = 'RESPAWN IN ' + p.respawnT.toFixed(1);
      else if (g.spectate) { const s = g.players.get(g.spectate); c = s ? 'SPECTATING ' + s.name.toUpperCase() : ''; }
      this.set('deadA', $.deadA, a); this.set('deadB', $.deadB, b); this.set('deadC', $.deadC, c);
    }
  }

  dispose() { for (const f of this.offs) f(); this.offs.length = 0; this.el.remove(); }
}
