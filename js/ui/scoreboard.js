/* LIVE FIRE — Tab scoreboard (hold the scoreboard key; also shown at match end). Data from game.match.scoreboard(viewer): team panels
   (name, round / point score, players alive, team funds for your own side), rows with K / D / A, +/-, HS %, ADR or damage, score,
   MVP stars (round modes), money (own team only), mode columns (captures, confirms, ladder level, lives, ...), ping or BOT, icons
   (charge, kit, VIP, juggernaut, flag, hostage: own team only), dead rows dimmed, the local player highlighted, disconnected hidden;
   a round-history strip (round modes: winner + reason glyph per round, halftime marker) and the match clock.
   Exports: Scoreboard  class: new Scoreboard(game, hud); show(on), late(dt) (re-renders at 4 Hz while visible), dispose() */
import { TEAM_COLORS } from '../game/player.js';

const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const money = n => '$' + Math.round(n).toLocaleString('en-US');
const pad = n => (n < 10 ? '0' : '') + n;
const clock = s => (Number.isFinite(s) ? Math.floor(Math.max(0, s) / 60) + ':' + pad(Math.floor(Math.max(0, s) % 60)) : '--:--');
const GLYPH = { elimination: '✕', time: '◷', bomb: '✹', defuse: '✂', hostage: '♙', hostages_lost: '♙', vip_escaped: '⇧', vip_killed: '✕', infected: '☣', survived: '◷', found: '◉', hidden: '◌', draw: '–', objective: '◆' };
const ICONS = { bomb: '<i class="sb-ic bomb" title="Charge">C</i>', kit: '<i class="sb-ic kit" title="Defuse kit">K</i>', vip: '<i class="sb-ic vip" title="VIP">VIP</i>',
  jugg: '<i class="sb-ic jugg" title="Juggernaut">J</i>', flag: '<i class="sb-ic flag" title="Flag">F</i>', hostage: '<i class="sb-ic host" title="Hostage">H</i>' };

export class Scoreboard {
  constructor(game, hud) {
    this.g = game; this.hud = hud; this.on = false; this.t = 0; this.forced = false;
    this.el = h('div', 'sb2');
    hud.el.appendChild(this.el);
    this.offs = [game.bus.on('match:end', () => { this.forced = true; this.t = 0; setTimeout(() => { if (this.g && !this.g.ended) this.show(true); }, 2500); })];
  }
  show(on) {
    this.on = !!on || this.forced && this.g.match.phase === 'over';
    this.el.classList.toggle('on', this.on);
    if (this.on) this.render();
  }

  render() {
    const g = this.g, me = g.local, D = g.match.scoreboard(me), round = D.roundModes;
    const cols = D.columns || [];
    const heads = ['', 'K', 'D', 'A', '±', 'HS%', round ? 'ADR' : 'DMG', ...cols.map(c => c.label), round ? '★' : '', D.economy ? '$' : '', 'SCORE', 'PING'];
    const tmpl = 'minmax(170px,1fr) repeat(' + (heads.length - 1) + ', auto)';
    let html = '<div class="sb2-head"><div><b>' + esc(D.mode.toUpperCase()) + '</b><span>' + esc(D.map.toUpperCase()) + '</span></div>'
      + '<div class="sb2-clk">' + (round ? 'ROUND ' + D.round + (D.rounds ? ' / ' + D.rounds : '') + (D.ot ? ' · OT ' + D.ot : '') + ' · ' : '') + clock(D.time) + '</div></div>';
    for (const T of D.teams) {
      const col = T.color || TEAM_COLORS[T.team] || '#ddd';
      html += '<div class="sb2-team" style="--tc:' + col + '"><div class="sb2-th"><b>' + esc(T.name) + '</b>'
        + (T.team ? '<span class="sb2-sc">' + T.score + '</span>' : '') + '<span class="sb2-al">' + T.alive + ' ALIVE</span>'
        + (T.money != null ? '<span class="sb2-mo">TEAM ' + money(T.money) + '</span>' : '') + '</div>';
      html += '<div class="sb2-grid" style="grid-template-columns:' + tmpl + '">' + heads.map(x => '<span class="hd">' + x + '</span>').join('');
      for (const r of T.players) {
        const diff = r.kills - r.deaths, cls = (r.local ? ' me' : '') + (r.alive ? '' : ' dead');
        const cells = [
          '<span class="nm' + cls + '">' + (r.icons.length ? r.icons.map(k => ICONS[k] || '').join('') : '') + esc(r.name) + (r.bot ? ' <i class="bt">BOT</i>' : '') + (!r.alive ? ' <i class="dd">DEAD</i>' : '') + '</span>',
          r.kills, r.deaths, r.assists, '<em class="' + (diff > 0 ? 'p' : diff < 0 ? 'n' : '') + '">' + (diff > 0 ? '+' : '') + diff + '</em>', r.hsp + '%', round ? r.adr : r.dmg,
          ...cols.map(c => esc(r.extra[c.key] != null ? r.extra[c.key] : '')),
          round ? (r.mvps ? '★' + (r.mvps > 1 ? r.mvps : '') : '') : '', D.economy ? (r.money != null ? money(r.money) : '—') : '', r.score | 0, r.bot ? 'BOT' : r.ping,
        ];
        html += cells.map((c, i) => (i === 0 ? c : '<span class="c' + cls + '">' + c + '</span>')).join('');
      }
      html += '</div></div>';
    }
    if (round && D.history.length) {
      const half = Math.floor((D.rounds || 0) / 2);
      html += '<div class="sb2-hist"><span class="lb">ROUNDS</span>' + D.history.map((x, i) => {
        const c = x.winner === 1 || x.winner === 2 ? TEAM_COLORS[x.winner] : 'rgba(236,235,230,.35)';
        return (i === half && half ? '<span class="hf">|</span>' : '') + '<span class="rd" title="Round ' + x.round + '" style="--rc:' + c + '">' + (GLYPH[x.reason] || '◆') + '</span>';
      }).join('') + '</div>';
    }
    this.el.innerHTML = html;
  }

  late(dt) {
    if (!this.on) return;
    this.t -= dt;
    if (this.t <= 0) { this.t = 0.25; this.render(); }
  }
  dispose() { for (const f of this.offs) f(); this.offs.length = 0; this.el.remove(); }
}
