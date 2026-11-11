/* LIVE FIRE — competitive economy: money, kill rewards, round bonuses with a loss-streak ladder, objective bonuses, buy zones +
   buy time, gear (kevlar, helmet, defuse kit), grenade carry rules, round inventories (survivors keep their kit), bot auto-buy and
   team-mate drop requests. PURE JS (no BABYLON, no DOM): runs on the host, on clients (read-only) and in Node tests.
   Exports:
     ECON          numbers (start 800, max 16000, round win / loss ladder, plant / defuse / hostage bonuses, overtime money ...)
     BUY_CATS      buy menu categories [{ id, key, label, items: [ids] }] (pistols, smgs, heavy, rifles, marksman, gear, grenades)
     GEAR          { kevlar, kevhelm, kit } gear items
     itemInfo(id) -> { id, kind 'gun'|'nade'|'gear', name, short, price, reward, cat, slot, team, unlock } | null
     TEAM_PISTOL   { 1: 'vogt9', 2: 'shizuka' } free pistol of each side in economy modes
     class Economy  (game.economy; created by Match)
       on            economy mode (mode.economy);  free: mode.freeBuy (practice: everything free, anywhere, any time)
       lossStreak    { 1, 2 } consecutive losses (CS2 rule: a win takes one off)
       give(p, n, why) -> delta              clamped to [0, max]; emits 'money' { p, delta, why, money }
       onKill(ev)                            kill reward (weapon killReward; knife 1500; grenades 300; nothing for teamkills / the bomb)
       roundEnd({ winner, reason, planted, attackersAlive })   win bonus by reason, loss ladder, plant bonus, no bonus for
                                             attackers who survive a time-out loss (CS rule)
       halftime(), overtime()                money resets (start / ECON.otMoney), loss streaks reset
       resetMoney(v)                         everybody's money = v
       buyLeft() -> seconds                  buy window left (freeze + mode.buyTime of live; Infinity in warmup / free buy)
       inBuyZone(p) -> bool                  map.buyzones[team] rects (any rect in warmup / free buy)
       canBuy(p) -> { ok, reason }           alive, economy, phase, buy zone, buy time, VIP rule (mode.canBuy hook)
       itemState(p, id) -> { id, price, owned, equipped, afford, locked, reason, refund }
       buy(p, id, { mods }) -> { ok, reason, price, item }    (on a client: game.net.buy(id) when the net layer provides it)
       refund(p, id) -> { ok, price }        sell back what you bought this round (unused, still in the buy zone + buy time)
       roundKit(p, kept)                     round-start inventory: survivors keep weapons / nades / armour (refilled), the dead
                                             get the team pistol + melee; the halftime / overtime resets strip everyone
       keepOf(p) -> kit | null               what a survivor carries into the next round (match.js calls it before respawning)
       autoBuy(p) -> [ids]                   default bot buy (full / force / eco); bots worker may replace (bots.handlesBuy)
       requestDrop(p, gunId) -> { ok, from, reason }   a team-mate bot with spare money buys the gun and drops it at p's feet
       teamMoney(team) -> [{ id, name, money, bot }]   (the scoreboard shows only your own team)
       snapshot() / apply(s)                 loss streaks + round flags (player money travels on PlayerState.money)
   Per-player plain data: p.money, p.buys [{ id, price, uid }] (this round), p.ms.spent / p.ms.earned.
   Events: 'money' { p, delta, why, money }   'buy' { p, item, price, refund }   'chat' { from: null, text, team, system: true } */
import { GUNS, getGun, CATEGORIES } from '../weapons/data.js';
import { GRENADES, getNade, canCarry } from '../grenades/data.js';
import { makeWeapon, statsOf, selectSlot, dropWeapon, newWeaponState } from './weapon.js';

export const ECON = {
  start: 800, max: 16000, otMoney: 10000, warmupMoney: 16000,
  win: { elimination: 3250, time: 3250, bomb: 3500, defuse: 3500, hostage: 3500, hostages_lost: 3250, vip_escaped: 3500, vip_killed: 3250, objective: 3250 },
  loss: [1400, 1900, 2400, 2900, 3400],
  plant: 300, plantTeam: 800, defuse: 300, rescue: 1000, rescueTeam: 300, hostageHurt: 10, hostageKill: 1000,
  knife: 1500, nade: 300, buyTime: 20,
};

export const TEAM_PISTOL = { 1: 'vogt9', 2: 'shizuka', 0: 'vogt9' };

export const GEAR = {
  kevlar:  { id: 'kevlar', kind: 'gear', name: 'Kevlar Vest', short: 'KEVLAR', price: 650, desc: 'Soft armour plates: 100 armour on the torso and arms.' },
  kevhelm: { id: 'kevhelm', kind: 'gear', name: 'Kevlar + Helmet', short: 'KEV + HELM', price: 1000, desc: 'Vest and ballistic helmet. With a full vest only the helmet is paid (350).' },
  kit:     { id: 'kit', kind: 'gear', name: 'Defuse Kit', short: 'KIT', price: 400, team: 2, bombOnly: true, desc: 'Cuts the defuse time from 10 to 5 seconds. Defenders only.' },
};
const HELMET_ONLY = 350;

const byPrice = list => list.sort((a, b) => a.price - b.price || a.name.localeCompare(b.name)).map(g => g.id);
export const BUY_CATS = [
  { id: 'pistol', key: 1, label: 'PISTOLS', items: byPrice(GUNS.filter(g => g.cat === 'pistol')) },
  { id: 'smg', key: 2, label: 'SMGS', items: byPrice(GUNS.filter(g => g.cat === 'smg')) },
  { id: 'heavy', key: 3, label: 'HEAVY', items: byPrice(GUNS.filter(g => g.cat === 'shotgun' || g.cat === 'lmg')) },
  { id: 'rifle', key: 4, label: 'RIFLES', items: byPrice(GUNS.filter(g => g.cat === 'rifle' || g.cat === 'carbine' || g.cat === 'br')) },
  { id: 'marksman', key: 5, label: 'MARKSMAN', items: byPrice(GUNS.filter(g => g.cat === 'dmr' || g.cat === 'sniper')) },
  { id: 'gear', key: 6, label: 'GEAR', items: ['kevlar', 'kevhelm', 'kit'] },
  { id: 'nade', key: 7, label: 'GRENADES', items: byPrice(GRENADES.slice()) },
];

export function itemInfo(id) {
  if (GEAR[id]) return { ...GEAR[id], reward: 0, cat: 'gear', slot: null, team: GEAR[id].team || 0, unlock: 1 };
  const n = getNade(id);
  if (n && n.id === id) return { id, kind: 'nade', name: n.name, short: n.name.toUpperCase(), price: n.price || 0, reward: n.killReward || ECON.nade, cat: 'nade', slot: 'nade', team: n.team || 0, unlock: n.unlockLevel || 1, group: n.group };
  const g = getGun(id);
  if (g) return { id: g.id, kind: 'gun', name: g.name, short: g.name.toUpperCase(), price: g.price || 0, reward: g.killReward || (g.cat === 'melee' ? ECON.knife : 300), cat: g.cat,
    slot: g.cat === 'melee' ? 'melee' : g.slot, team: g.team || 0, unlock: g.unlockLevel || 1, role: g.role };
  return null;
}
const ms = p => p.ms || (p.ms = {});

export class Economy {
  constructor(game, mode, match) {
    this.g = game; this.mode = mode; this.match = match;
    const o = (game && game.options) || {};
    this.on = !!mode.economy;
    this.free = !!mode.freeBuy;
    this.start = Number.isFinite(+o.startMoney) ? +o.startMoney : (mode.startMoney ?? ECON.start);
    this.max = Number.isFinite(+o.maxMoney) ? +o.maxMoney : (mode.maxMoney ?? ECON.max);
    this.buyTime = Number.isFinite(+o.buyTime) ? +o.buyTime : (mode.buyTime ?? ECON.buyTime);
    this.lossStreak = { 1: 0, 2: 0 };
    this.resetInv = false;
  }

  // ------------------------------------------------------------------------------------------------ money
  give(p, n, why = '') {
    if (!p || !(this.on || this.free) || !Number.isFinite(n) || n === 0) return 0;
    const before = p.money | 0, after = Math.max(0, Math.min(this.max, before + Math.round(n)));
    const delta = after - before;
    p.money = after;
    if (delta > 0) ms(p).earned = (ms(p).earned || 0) + delta;
    if (delta !== 0 && this.g.bus) this.g.bus.emit('money', { p, delta, why, money: after });
    return delta;
  }
  resetMoney(v) { for (const p of this.g.players.values()) { p.money = Math.min(this.max, v); p.buys = []; } }
  halftime() { this.resetMoney(this.start); this.lossStreak[1] = this.lossStreak[2] = 0; this.resetInv = true; }
  overtime() { this.resetMoney(Math.min(this.max, ECON.otMoney)); this.lossStreak[1] = this.lossStreak[2] = 0; this.resetInv = true; }
  matchStart() { if (this.on) this.resetMoney(this.start); this.lossStreak[1] = this.lossStreak[2] = 0; }
  warmup() { if (this.on) this.resetMoney(this.max); }

  onKill(ev) {
    if (!this.on || !ev || ev.suicide || !ev.killer) return;
    const k = ev.killer, v = ev.victim;
    if (k === v || (k.team > 0 && k.team === v.team)) return;
    if (this.match && this.match.phase === 'warmup') return;
    let reward = 0, label = '';
    const g = getGun(ev.weapon);
    if (g) { reward = g.cat === 'melee' ? (g.killReward || ECON.knife) : (g.killReward || 300); label = g.name; }
    else { const n = getNade(ev.weapon); if (n) { reward = n.killReward || ECON.nade; label = n.name; } }
    if (reward > 0) this.give(k, reward, 'KILL WITH ' + label.toUpperCase());
  }

  /** r = { winner, reason, planted, plantTeam } */
  roundEnd(r) {
    if (!this.on) return;
    const g = this.g, w = r.winner;
    for (const t of [1, 2]) {
      const won = w === t;
      if (won) this.lossStreak[t] = Math.max(0, this.lossStreak[t] - 1);
      else if (w > 0) this.lossStreak[t] = Math.min(ECON.loss.length, this.lossStreak[t] + 1);
    }
    for (const p of g.players.values()) {
      if (p.team !== 1 && p.team !== 2 || p.connected === false) continue;
      if (w === p.team) { this.give(p, ECON.win[r.reason] ?? ECON.win.objective, 'ROUND WIN'); continue; }
      // loss (or draw): ladder; attackers who are still alive when the clock runs out (bomb not planted) get nothing
      if (r.reason === 'time' && p.alive && p.team === (r.attackers || 1) && !r.planted && r.timeRule) continue;
      const n = Math.max(1, this.lossStreak[p.team]);
      this.give(p, ECON.loss[Math.min(ECON.loss.length, n) - 1], 'ROUND LOSS');
      if (r.planted && p.team === (r.plantTeam || 1)) this.give(p, ECON.plantTeam, 'CHARGE PLANTED');
    }
  }

  // ------------------------------------------------------------------------------------------------ buying
  buyLeft() {
    const m = this.match;
    if (this.free || m.phase === 'warmup') return Infinity;
    if (!this.on) return 0;
    if (m.phase === 'freeze') return this.buyTime + Math.max(0, m.t);
    if (m.phase === 'live' && m.rounds) return Math.max(0, this.buyTime - (m.liveFor || 0));
    if (m.phase === 'live') return Infinity;     // respawn economy modes: buy at spawn any time
    return 0;
  }
  inBuyZone(p) {
    if (this.free || this.match.phase === 'warmup') return true;
    const zones = this.g.map && this.g.map.buyzones && this.g.map.buyzones[p.team];
    if (!zones || !zones.length) return true;
    for (const z of zones) {
      if (p.pos.x >= z.x0 - 0.3 && p.pos.x <= z.x1 + 0.3 && p.pos.z >= z.z0 - 0.3 && p.pos.z <= z.z1 + 0.3 && (z.y == null || Math.abs(p.pos.y - z.y) < 3.2)) return true;
    }
    return false;
  }
  canBuy(p) {
    const m = this.match;
    if (!p || !p.alive) return { ok: false, reason: 'DEAD' };
    if (!this.on && !this.free) return { ok: false, reason: 'NO BUYING IN THIS MODE' };
    if (m.phase === 'over' || m.phase === 'roundEnd' || m.phase === 'halftime') return { ok: false, reason: 'ROUND IS OVER' };
    if (this.mode.canBuy) { const r = this.mode.canBuy(this.g, p); if (r && r.ok === false) return r; }
    if (this.buyLeft() <= 0) return { ok: false, reason: 'BUY TIME IS OVER' };
    if (!this.inBuyZone(p)) return { ok: false, reason: 'NOT IN A BUY ZONE' };
    return { ok: true, reason: '' };
  }
  priceOf(p, id) {
    const it = itemInfo(id); if (!it) return Infinity;
    if (this.free) return 0;
    if (id === 'kevhelm' && p.armor >= 100 && !p.helmet) return HELMET_ONLY;
    return it.price;
  }
  itemState(p, id) {
    const it = itemInfo(id);
    const st = { id, price: this.priceOf(p, id), owned: false, equipped: false, afford: true, locked: false, reason: '', refund: false };
    if (!it) { st.locked = true; st.reason = 'UNKNOWN'; return st; }
    const inv = p.inv;
    if (it.kind === 'gun') {
      const w = inv[it.slot];
      st.owned = !!(w && w.gunId === it.id); st.equipped = st.owned && p.cur === it.slot;
    } else if (it.kind === 'nade') {
      const e = inv.nades.find(n => n.gid === id);
      const c = canCarry(inv.nades, id);
      st.owned = !!e; st.count = e ? e.n : 0;
      if (!c.ok) { st.locked = true; st.reason = (c.reason || 'CARRY LIMIT').toUpperCase(); }
    } else if (id === 'kevlar') { st.owned = p.armor >= 100; }
    else if (id === 'kevhelm') { st.owned = p.armor >= 100 && !!p.helmet; }
    else if (id === 'kit') {
      st.owned = !!inv.kit;
      const bomb = this.g.objectives && this.g.objectives.has && this.g.objectives.has('bomb');
      if (p.team !== 2 || !bomb) { st.locked = true; st.reason = p.team !== 2 ? 'DEFENDERS ONLY' : 'NO CHARGE IN THIS MODE'; }
    }
    if (it.team && it.team !== p.team && !st.locked) { st.locked = true; st.reason = 'OTHER SIDE ONLY'; }
    st.afford = (p.money | 0) >= st.price || this.free;
    st.refund = !!(p.buys && p.buys.some(b => b.id === id)) && this.canBuy(p).ok;
    return st;
  }

  buy(p, id, opts = {}) {
    const g = this.g, it = itemInfo(id);
    if (!it) return { ok: false, reason: 'UNKNOWN ITEM' };
    if (g.authority === 'client' && p.local && g.net && g.net.buy) { g.net.buy(id, opts); return { ok: true, pending: true, price: this.priceOf(p, id), item: it }; }
    const cb = this.canBuy(p); if (!cb.ok) return cb;
    const st = this.itemState(p, id);
    if (st.locked) return { ok: false, reason: st.reason || 'LOCKED' };
    if (st.owned && it.kind !== 'nade') return { ok: false, reason: 'ALREADY OWNED' };
    if (!st.afford) return { ok: false, reason: 'NOT ENOUGH MONEY' };
    const price = st.price;
    if (it.kind === 'gun') {
      const slot = it.slot;
      if (p.inv[slot] && slot !== 'melee') dropWeapon(g, p, slot, { speed: 1.2 });
      const mods = opts.mods || (p.loadout && p.loadout.mods && p.loadout.mods[it.id]) || null;
      const w = makeWeapon(it.id, { mods: mods || undefined, skin: (p.loadout && p.loadout.skins && p.loadout.skins[it.id]) || undefined });
      if (!w) return { ok: false, reason: 'UNKNOWN ITEM' };
      p.inv[slot] = w;
      selectSlot(g, p, slot);
      (p.buys || (p.buys = [])).push({ id, price, uid: w.uid });
    } else if (it.kind === 'nade') {
      const e = p.inv.nades.find(n => n.gid === id);
      if (e) e.n++; else p.inv.nades.push({ gid: id, n: 1 });
      if (!p.curNade) p.curNade = id;
      (p.buys || (p.buys = [])).push({ id, price });
    } else if (id === 'kevlar') { p.armor = 100; (p.buys || (p.buys = [])).push({ id, price }); }
    else if (id === 'kevhelm') { p.armor = 100; p.helmet = true; (p.buys || (p.buys = [])).push({ id, price }); }
    else if (id === 'kit') { p.inv.kit = true; (p.buys || (p.buys = [])).push({ id, price }); }
    if (price > 0) { p.money = Math.max(0, (p.money | 0) - price); ms(p).spent = (ms(p).spent || 0) + price; if (g.bus) g.bus.emit('money', { p, delta: -price, why: 'BOUGHT ' + it.short, money: p.money }); }
    if (g.bus) g.bus.emit('buy', { p, item: id, price });
    return { ok: true, price, item: it };
  }

  refund(p, id) {
    const g = this.g;
    if (g.authority === 'client' && p.local && g.net && g.net.buy) { g.net.buy(id, { refund: true }); return { ok: true, pending: true }; }
    if (!this.canBuy(p).ok || !p.buys) return { ok: false, reason: 'CANNOT SELL NOW' };
    const i = p.buys.map(b => b.id).lastIndexOf(id); if (i < 0) return { ok: false, reason: 'NOT BOUGHT THIS ROUND' };
    const b = p.buys[i], it = itemInfo(id);
    if (it.kind === 'gun') {
      const w = p.inv[it.slot]; const st = w && statsOf(w);
      if (!w || w.uid !== b.uid || !st || w.mag < st.mag) return { ok: false, reason: 'ALREADY USED' };
      p.inv[it.slot] = null;
      if (p.cur === it.slot) selectSlot(g, p, 'next') || selectSlot(g, p, 'melee');
    } else if (it.kind === 'nade') {
      const e = p.inv.nades.find(n => n.gid === id); if (!e) return { ok: false, reason: 'ALREADY USED' };
      e.n--; p.inv.nades = p.inv.nades.filter(n => n.n > 0); if (p.curNade === id && !p.inv.nades.some(n => n.gid === id)) p.curNade = p.inv.nades[0] ? p.inv.nades[0].gid : null;
    } else if (id === 'kevlar' || id === 'kevhelm') {
      if (p.armor < 100) return { ok: false, reason: 'ALREADY USED' };
      if (id === 'kevhelm' && b.price === HELMET_ONLY) p.helmet = false; else { p.armor = 0; if (id === 'kevhelm') p.helmet = false; }
    } else if (id === 'kit') p.inv.kit = false;
    p.buys.splice(i, 1);
    this.give(p, b.price, 'SOLD ' + it.short);
    if (b.price > 0) ms(p).spent = Math.max(0, (ms(p).spent || 0) - b.price);
    if (g.bus) g.bus.emit('buy', { p, item: id, price: -b.price, refund: true });
    return { ok: true, price: b.price };
  }

  // ------------------------------------------------------------------------------------------------ round inventories
  keepOf(p) {
    if (!p.alive || this.resetInv) return null;
    return { primary: p.inv.primary, secondary: p.inv.secondary, melee: p.inv.melee, nades: p.inv.nades.map(n => ({ ...n })), kit: !!p.inv.kit,
      armor: p.armor, helmet: !!p.helmet };
  }
  roundKit(p, kept) {
    const refill = w => { if (w && !w.melee) { const st = statsOf(w); if (st) { w.mag = st.mag || 0; w.reserve = st.reserve || 0; } } return w; };
    const lo = p.loadout || {};
    if (kept) {
      p.inv.primary = refill(kept.primary); p.inv.secondary = refill(kept.secondary); p.inv.melee = kept.melee || makeWeapon('knife');
      p.inv.nades = kept.nades; p.inv.kit = kept.kit; p.armor = kept.armor; p.helmet = kept.helmet;
    } else {
      p.inv.primary = null;
      p.inv.secondary = makeWeapon(TEAM_PISTOL[p.team] || TEAM_PISTOL[1], { mods: lo.mods && lo.mods[TEAM_PISTOL[p.team]], skin: lo.skins && lo.skins[TEAM_PISTOL[p.team]] });
      p.inv.melee = makeWeapon(lo.melee && getGun(lo.melee) && getGun(lo.melee).cat === 'melee' ? lo.melee : 'knife');
      p.inv.nades = []; p.inv.kit = false; p.armor = 0; p.helmet = false;
    }
    p.inv.bomb = false;
    p.curNade = p.inv.nades.length ? p.inv.nades[0].gid : null;
    p.cur = p.inv.primary ? 'primary' : p.inv.secondary ? 'secondary' : 'melee';
    p.ws = newWeaponState(); p.ws.state = 'draw'; p.ws.dur = 0.3;
    p.buys = [];
  }
  roundStart() {
    for (const p of this.g.players.values()) p.buys = [];
    this.resetInv = false;
  }

  // ------------------------------------------------------------------------------------------------ bots + team play
  /** A plain competitive buy: full buy when the money allows a rifle + armour + utility, a force buy on a long loss streak or
      when the enemy just lost a lot, otherwise an eco (armour or a pistol upgrade, save the rest). Deterministic (game.rng). */
  autoBuy(p) {
    if (!this.canBuy(p).ok) return [];
    const r = this.g.rng || Math.random, out = [], have = () => p.money | 0;
    const tryBuy = id => { const res = this.buy(p, id); if (res.ok) out.push(id); return res.ok; };
    const pickGun = (cats, budget, pref) => {
      const list = GUNS.filter(g => cats.includes(g.cat) && g.price <= budget && (!pref || pref.includes(g.role)));
      if (!list.length) return null;
      list.sort((a, b) => b.price - a.price);
      const top = list.slice(0, Math.min(3, list.length));
      return top[Math.floor(r() * top.length)].id;
    };
    const streak = this.lossStreak[p.team] || 0, m = this.match;
    const pistolRound = m && m.rounds && (m.round === 1 || (m.limit && m.round === Math.floor(m.limit.rounds / 2) + 1)) && !m.ot;
    if (pistolRound) {
      if (have() >= 650 + 200 && r() < 0.55) tryBuy('kevlar');
      else if (r() < 0.5) { const g = pickGun(['pistol'], have() - 0, null); if (g && g !== (p.inv.secondary && p.inv.secondary.gunId)) tryBuy(g); }
      if (have() >= 200 && r() < 0.6) tryBuy('flash');
      return out;
    }
    const full = have() >= 3700, force = !full && have() >= 2100 && (streak >= 2 || r() < 0.25);
    if (full || force) {
      if (!(p.armor >= 100 && p.helmet)) tryBuy(have() >= 1000 + 2000 ? 'kevhelm' : 'kevlar');
      if (!p.inv.primary) {
        const budget = have() - (full ? 500 : 150);
        const roll = r();
        const cats = full ? (roll < 0.1 ? ['sniper', 'dmr'] : roll < 0.16 ? ['lmg'] : ['rifle', 'carbine', 'br']) : (roll < 0.55 ? ['smg'] : roll < 0.75 ? ['shotgun'] : ['carbine', 'rifle']);
        const g = pickGun(cats, budget) || pickGun(['smg', 'carbine', 'rifle', 'shotgun'], budget);
        if (g) tryBuy(g);
      }
      if (p.team === 2 && this.g.objectives && this.g.objectives.has('bomb') && !p.inv.kit && have() >= 400 && r() < 0.6) tryBuy('kit');
      for (const n of ['smoke', 'flash', 'frag', 'molotov', 'flash']) if (have() >= 400 && r() < 0.65) tryBuy(n);
    } else {
      // eco: keep money for the next full buy; a vest when rich enough to still full-buy after a loss
      if (have() >= 2600 && p.armor < 100) tryBuy('kevlar');
      if (have() >= 1400 && r() < 0.35) { const g = pickGun(['pistol'], 700); if (g && (!p.inv.secondary || p.inv.secondary.gunId !== g)) tryBuy(g); }
    }
    return out;
  }

  requestDrop(p, gunId) {
    const g = this.g, it = itemInfo(gunId);
    if (!it || it.kind !== 'gun') return { ok: false, reason: 'ONLY WEAPONS CAN BE DROPPED' };
    if (!this.on || this.free) return { ok: false, reason: 'NO ECONOMY' };
    const okTime = this.buyLeft() > 0;
    if (!okTime) return { ok: false, reason: 'BUY TIME IS OVER' };
    let best = null;
    for (const q of g.players.values()) {
      if (q === p || q.team !== p.team || !q.alive || !q.bot) continue;
      if ((q.money | 0) < it.price + 1000 || !this.inBuyZone(q)) continue;
      if (!best || q.money > best.money) best = q;
    }
    if (!best) {
      if (g.bus) g.bus.emit('chat', { from: p, text: 'Need a drop: ' + it.name, team: p.team, system: false, request: gunId });
      return { ok: false, reason: 'NO TEAM-MATE CAN AFFORD IT' };
    }
    best.money -= it.price; ms(best).spent = (ms(best).spent || 0) + it.price;
    if (g.bus) g.bus.emit('money', { p: best, delta: -it.price, why: 'DROP FOR ' + p.name.toUpperCase(), money: best.money });
    const w = makeWeapon(gunId, { mods: (p.loadout && p.loadout.mods && p.loadout.mods[gunId]) || undefined });
    g.drops.push({ id: 'dr' + (g.tick | 0) + '_' + p.id, w, from: best.id, x: p.pos.x, y: p.pos.y + 0.4, z: p.pos.z, vx: 0, vy: 0, vz: 0, yaw: p.yaw + 1.4, spin: 0, t: 2, rest: false });
    if (g.bus) {
      g.bus.emit('drop', { p: best, drop: g.drops[g.drops.length - 1] });
      g.bus.emit('chat', { from: best, text: 'Dropped you a ' + it.name, team: p.team, system: false });
    }
    return { ok: true, from: best.id };
  }

  teamMoney(team) {
    const out = [];
    for (const p of this.g.players.values()) if (p.team === team && p.connected !== false) out.push({ id: p.id, name: p.name, money: p.money | 0, bot: !!p.bot });
    return out.sort((a, b) => b.money - a.money);
  }

  snapshot() { return { ls: { 1: this.lossStreak[1], 2: this.lossStreak[2] }, ri: this.resetInv }; }
  apply(s) { if (!s) return; this.lossStreak[1] = s.ls[1] | 0; this.lossStreak[2] = s.ls[2] | 0; this.resetInv = !!s.ri; }
}

export { CATEGORIES };
