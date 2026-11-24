/* LIVE FIRE — what a bot team shares: knowledge passed on with a delay (as if said on the radio), callouts in team chat (rate
   limited, only for new information), the round plan of a bomb mode (target site, gather -> execute, a lurker, rotations) and
   the team buy (eco / force / full buy / pistol round, team-mate drops). PURE JS (no BABYLON).
   Exports:
     class TeamBrain(mgr, team)
       report(bot, enemy|null, pos, kind)  bot saw / heard / was hit by an enemy at pos: team-mates learn it 0.7-1.6 s later
       know(id) -> { x, y, z, t, area } | null      what the team knows about an enemy
       known(now, maxAge) -> [entries]
       roundStart(round)                  new round: knowledge cleared, round plan reset
       plan(now)                          (bomb modes) updates the round plan: phase 'default' | 'gather' | 'exec' | 'post' and rotations
       buy()                              economy modes: one team decision, then every bot buys (economy.buy)
       say(bot, text, key, gap)           team chat with per-key cool-down
     BUY                                   buy thresholds (money) */
import { GUNS } from '../weapons/data.js';
import { areaName } from './tactics.js';
import { hash } from '../core/util.js';

export const BUY = { full: { 1: 3900, 2: 3600 }, force: 2200, ecoKeep: 1400, rifleMin: 2700, sniperExtra: 1400 };
const CALL_GAP = 4.5;

export class TeamBrain {
  constructor(mgr, team) {
    this.mgr = mgr; this.g = mgr.g; this.team = team;
    this.k = new Map(); this.pending = []; this.saidT = new Map(); this.lastCall = -99;
    this.plan0 = null; this.round = -1; this.buyRound = -1;
  }
  bots() { const out = []; for (const b of this.mgr.brains.values()) if (b.p.team === this.team && b.p.alive) out.push(b); return out; }
  roundStart(round) {
    this.k.clear(); this.pending.length = 0; this.round = round; this.plan0 = null; this.saidT.clear();
  }
  report(bot, q, pos, kind) {
    const g = this.g, now = g.time, id = q ? q.id : null;
    if (!pos) return;
    const prev = id ? this.k.get(id) : null;
    // the team already has this (fresh, close): nothing to say
    if (prev && now - prev.t < 2.5 && Math.hypot(prev.x - pos.x, prev.z - pos.z) < 5) { prev.t = now; prev.x = pos.x; prev.y = pos.y; prev.z = pos.z; return; }
    const delay = 0.7 + this.mgr.rng() * 0.9;
    this.pending.push({ at: now + delay, id: id || ('n' + Math.round(pos.x / 6) + ',' + Math.round(pos.z / 6)), x: pos.x, y: pos.y, z: pos.z, t: now, kind, from: bot });
    if (id) this.k.set(id, { x: pos.x, y: pos.y, z: pos.z, t: now, area: null });
  }
  know(id) { return this.k.get(id) || null; }
  known(now, maxAge = 10) { const out = []; for (const [id, e] of this.k) if (now - e.t <= maxAge) out.push({ id, ...e }); return out; }
  tick() {
    const now = this.g.time;
    if (!this.pending.length) return;
    let calls = null;
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const e = this.pending[i];
      if (e.at > now) continue;
      this.pending.splice(i, 1);
      if (!e.from || !e.from.p.alive) continue;          // a dead bot says nothing
      for (const b of this.mgr.brains.values()) if (b !== e.from && b.p.team === this.team && b.p.alive) b.mem.team(e.id, e, now, now - e.t);
      (calls || (calls = [])).push(e);
    }
    if (calls) this.callout(calls);
  }
  callout(list) {
    const g = this.g, now = g.time;
    if (now - this.lastCall < CALL_GAP || !this.team) return;
    const by = new Map();
    for (const e of list) {
      const area = areaName(g, e.x, e.y, e.z, this.team);
      const a = by.get(area) || { n: 0, kind: e.kind, from: e.from, ids: new Set() };
      if (!a.ids.has(e.id)) { a.ids.add(e.id); a.n++; }
      if (e.kind === 'see') a.kind = 'see';
      by.set(area, a);
    }
    for (const [area, a] of by) {
      const key = area + ':' + a.kind;
      if (now - (this.saidT.get(key) ?? -99) < 14) continue;
      const many = a.n >= 3 ? 'Several enemies' : a.n === 2 ? 'Two enemies' : a.kind === 'see' ? 'Enemy' : 'Movement';
      const text = a.kind === 'hear' ? (a.n > 1 ? 'Heard a few ' : 'Heard one ') + at(area) : a.kind === 'hit' ? 'Taking fire ' + at(area) : many + ' ' + at(area);
      this.say(a.from, text, key, 0);
      break;
    }
  }
  say(bot, text, key = text, gap = 10) {
    const g = this.g, now = g.time;
    if (!bot || !bot.p.alive || !g.bus) return false;
    if (gap && now - (this.saidT.get(key) ?? -99) < gap) return false;
    if (now - this.lastCall < 2.5) return false;
    this.saidT.set(key, now); this.lastCall = now;
    g.bus.emit('chat', { from: bot.p, text, team: this.team, system: false, bot: true });
    return true;
  }

  // ---------------------------------------------------------------------------------------------- bomb round plan
  plan() {
    const g = this.g, O = g.objectives, b = O && O.s && O.s.bomb;
    if (!b) { this.plan0 = null; return null; }
    const cfg = O.cfg.bomb, att = this.team === cfg.attackers, now = g.time, m = g.match;
    let P = this.plan0;
    if (!P || P.round !== m.round) {
      const bots = this.bots().sort((a, c) => (a.p.id < c.p.id ? -1 : 1));
      P = this.plan0 = { round: m.round, site: b.target || cfg.sites[0], phase: att ? 'gather' : 'hold', execT: 0, lurker: null, rotate: null, rotT: 0, nadeDone: new Set(),
        fast: this.mgr.rng() < 0.2, split: this.mgr.rng() < 0.45, holdBy: new Map() };
      // a lurker on bigger teams: goes toward the other site, cuts rotations
      if (att && bots.length >= 4 && cfg.sites.length > 1 && this.mgr.rng() < 0.6) {
        const cand = bots.filter(x => !x.p.inv.bomb);
        if (cand.length) P.lurker = cand[hash(String(m.round) + this.team) % cand.length].p.id;
      }
      // defenders: who holds which site, spread evenly (seeded per round; the extra one goes to a random site)
      if (!att && cfg.sites.length > 1) {
        P.defSite = new Map();
        const order = bots.slice(), r = this.mgr.rng;
        for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = order[i]; order[i] = order[j]; order[j] = t; }
        const off = Math.floor(r() * cfg.sites.length);
        order.forEach((b, i) => P.defSite.set(b.p.id, cfg.sites[(i + off) % cfg.sites.length]));
      }
    }
    if (att) {
      if (b.state === 'planted') { P.phase = 'post'; P.site = b.site || P.site; }
      else if (P.phase === 'gather') {
        const mine = this.bots().filter(x => x.p.id !== P.lurker);
        const ready = mine.filter(x => x.atStage).length;
        const tl = m.phase === 'live' && Number.isFinite(m.t) ? m.t : 99;
        if (P.fast || (mine.length && ready >= Math.max(1, Math.ceil(mine.length * 0.6))) || tl < 48 || (m.liveFor || 0) > 55) {
          P.phase = 'exec'; P.execT = now;
          const lead = mine[0];
          if (lead) this.say(lead, P.fast ? 'Rush ' + P.site + '!' : 'Executing ' + P.site + ', go go', 'exec' + m.round, 0);
        }
      }
    } else {
      // rotation: two or more enemies called on a site this round pulls the far defenders there (or a plant)
      if (b.state === 'planted') { P.rotate = b.site; }
      else if (m.phase === 'live' && (!P.rotate || now - P.rotT > 25)) {
        const S = g.map.sites || {}, count = {};
        for (const e of this.known(now, 6)) for (const n of cfg.sites) {
          const s = S[n]; if (!s) continue;
          const r = Math.max(9, Math.hypot(s.x1 - s.x0, s.z1 - s.z0) / 2 + 4);
          if (Math.hypot(s.x - e.x, s.z - e.z) < r) count[n] = (count[n] || 0) + 1;
        }
        for (const n of cfg.sites) if ((count[n] || 0) >= 2 && P.rotate !== n) {
          P.rotate = n; P.rotT = now;
          const lead = this.bots()[0]; if (lead) this.say(lead, 'They\'re ' + (n.length < 3 ? n + ' site' : n) + ', rotate!', 'rot' + n, 12);
          break;
        }
      }
    }
    return P;
  }

  // ---------------------------------------------------------------------------------------------- economy
  buy() {
    const g = this.g, E = g.economy, m = g.match;
    if (!E || !E.on || this.buyRound === m.round) return;
    const bots = [...g.players.values()].filter(p => p.bot && p.alive && p.team === this.team);
    if (!bots.length) return;
    if (!bots.every(p => E.canBuy(p).ok)) return;                        // not yet (phase / zone): try again next tick
    this.buyRound = m.round;
    const team = [...g.players.values()].filter(p => p.team === this.team && p.connected !== false);
    const avg = team.reduce((a, p) => a + (p.money | 0), 0) / Math.max(1, team.length);
    const streak = (E.lossStreak && E.lossStreak[this.team]) || 0;
    const half = m.limit && m.limit.rounds ? Math.floor(m.limit.rounds / 2) : 0;
    const pistol = m.rounds && !m.ot && (m.round === 1 || (half && m.round === half + 1));
    const lastOfHalf = half && (m.round === half || (m.limit && m.round === m.limit.rounds));
    const full = avg >= BUY.full[this.team === 2 ? 2 : 1];
    const force = !full && (lastOfHalf || (streak >= 2 && avg >= BUY.force) || avg >= 3200);
    const kind = pistol ? 'pistol' : full ? 'full' : force ? 'force' : 'eco';
    const rng = this.mgr.rng, att = g.objectives && g.objectives.cfg && g.objectives.cfg.bomb ? this.team === g.objectives.cfg.bomb.attackers : this.team === 1;
    bots.sort((a, c) => (c.money | 0) - (a.money | 0));
    let sniper = team.some(p => p.inv.primary && (gunCat(p.inv.primary.gunId) === 'sniper'));
    const out = [];
    for (const p of bots) {
      const b = this.mgr.brains.get(p.id); if (b) b.buyKind = kind;
      const r = this.buyFor(p, kind, { att, sniper, rng });
      if (r.sniper) sniper = true;
      out.push(p.name + ':' + r.list.join('+'));
    }
    // a rich bot drops a rifle to a poor team-mate (bot) on a full buy
    if (kind === 'full' || kind === 'force') {
      for (const p of bots) {
        if (p.inv.primary || (p.money | 0) >= BUY.rifleMin) continue;
        const gun = pickGun(E, null, ['rifle', 'carbine'], 3300, rng, true);
        if (gun) { const res = E.requestDrop(p, gun); if (res && res.ok) out.push('drop->' + p.name); }
      }
    }
    if (b0(bots)) {
      const lead = this.mgr.brains.get(bots[0].id);
      if (lead && kind === 'eco') this.say(lead, 'Save this one, eco', 'eco' + m.round, 0);
      else if (lead && kind === 'force') this.say(lead, 'Force buy', 'force' + m.round, 0);
    }
    this.lastBuy = { round: m.round, kind, avg: Math.round(avg), list: out };
    return this.lastBuy;
  }
  buyFor(p, kind, { att, sniper, rng }) {
    const E = this.g.economy, list = [], tryBuy = id => { const r = E.buy(p, id); if (r && r.ok) list.push(id); return r && r.ok; };
    const money = () => p.money | 0;
    let gotSniper = false;
    if (kind === 'pistol') {
      const roll = rng();
      if (roll < 0.5 && money() >= 650) tryBuy('kevlar');
      else if (roll < 0.8) { const g = pickGun(E, p, ['pistol'], money() - 200, rng); if (g && g !== (p.inv.secondary && p.inv.secondary.gunId)) tryBuy(g); }
      if (money() >= 300 && rng() < 0.5) tryBuy(rng() < 0.5 ? 'flash' : 'smoke');
      if (!att && money() >= 400 && rng() < 0.3) tryBuy('kit');
      return { list };
    }
    if (kind === 'full' || kind === 'force') {
      const armour = kind === 'full' ? 'kevhelm' : 'kevlar';
      if (!p.inv.primary) {
        const reserve = kind === 'full' ? 1000 : 650;
        let g = null;
        if (kind === 'full' && !sniper && money() >= BUY.sniperExtra + 4700 && hash(p.id) % 4 === 0) { g = pickGun(E, p, ['sniper'], money() - reserve, rng); if (g) gotSniper = true; }
        if (!g) g = pickGun(E, p, kind === 'full' ? ['rifle', 'carbine', 'br'] : ['smg', 'carbine', 'shotgun', 'rifle'], money() - reserve, rng);
        if (!g) g = pickGun(E, p, ['smg', 'shotgun'], money() - 400, rng);
        if (g) tryBuy(g);
      }
      if (!(p.armor >= 100 && (p.helmet || kind !== 'full'))) tryBuy(money() >= 1000 ? armour : 'kevlar');
      if (!att && this.g.objectives && this.g.objectives.has && this.g.objectives.has('bomb') && !p.inv.kit && money() >= 400 && rng() < 0.65) tryBuy('kit');
      const nades = att ? ['smoke', 'flash', 'molotov', 'flash', 'frag'] : ['molotov', 'flash', 'smoke', 'frag', 'flash'];
      if (att) nades.splice(2, 1, rng() < 0.5 ? 'molotov' : 'frag');
      for (const n of nades) if (money() >= 300 && rng() < (kind === 'full' ? 0.8 : 0.4)) tryBuy(n);
      return { list, sniper: gotSniper };
    }
    // eco: save; a cheap pistol upgrade or a vest when that still leaves a full buy after a loss
    if (money() >= 2600 && p.armor < 100) tryBuy('kevlar');
    if (money() >= BUY.ecoKeep && rng() < 0.3) { const g = pickGun(E, p, ['pistol'], 600, rng); if (g && (!p.inv.secondary || p.inv.secondary.gunId !== g)) tryBuy(g); }
    if (money() >= 1800 && rng() < 0.4) tryBuy('flash');
    return { list };
  }
}

const b0 = list => list && list.length > 0;
const at = area => (/site$|^mid$|side$/.test(area) ? area : 'at ' + area);
function gunCat(id) { const g = GUNS.find(x => x.id === id); return g ? g.cat : null; }
/** The best affordable gun of the categories (randomly among the top three by price), honouring locks and team rules. */
function pickGun(E, p, cats, budget, rng, anyone = false) {
  const list = GUNS.filter(g => cats.includes(g.cat) && g.slot === 'primary' === (cats[0] !== 'pistol') && g.price <= budget);
  const ok = anyone ? list : list.filter(g => { const st = E.itemState(p, g.id); return st && !st.locked && st.afford !== false && !st.owned; });
  if (!ok.length) return null;
  ok.sort((a, b) => b.price - a.price);
  const top = ok.slice(0, Math.min(3, ok.length));
  return top[Math.floor(rng() * top.length)].id;
}
