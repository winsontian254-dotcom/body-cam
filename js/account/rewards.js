/* LIVE FIRE — daily rewards (7-day cycle, streak, crates) and the first win of the day. State lives in the profile (`rewards`, `boost`,
   `crates`, `opened`), so it travels with the cloud save (js/account/profile.js merges it).
   Exports:
     CYCLE = 7, DAYS [{ day, title, big?, items: [{ type: 'credits'|'xp'|'boost'|'crate', n?, mult?, matches?, crate? }] }]
     CRATES { attachment, skin, elite }: { name, short, kind, desc, draws: [{ pool: 'att'|'skin', min? }] },  RARITY { id: { w, col, label } }
     Rewards = {
       status(now?) -> { ready, day (the cycle day the next / today's claim pays, 1..7), streak (current), nextStreak, best, claims,
                        claimedToday, broken (a missed day will reset the streak), clockBack (the clock is behind the last claim),
                        msToNext (0 when ready), nextAt (ms), cycle, weekBonus (0..0.5 credit bonus), reward (DAYS entry, credits scaled),
                        firstWin: { ready, xp, credits, msToReset } }
       claim(now?) -> { ok: true, day, streak, items: [resolved], credits, xp, boost, drops, gain } | { ok: false, reason: 'claimed'|'clock', status }
       crates() -> queued crates [{ id, kind, from, t }] (level-up crates), openCrate(id) -> { ok, crate, drops } | { ok: false, reason }
       firstWin(now?) -> { ready, xp, credits, msToReset },  rarityOf(kind, item) -> 'common'..'legendary',  fmt(ms) -> 'HH:MM:SS' ('2D HH:MM:SS' past a day)
       DAYS, CRATES, CYCLE, RARITY, FIRST_WIN
     }
   Rules: the day changes at LOCAL midnight; claiming on consecutive days grows the streak, a missed calendar day resets it to day 1;
   a clock set back before the last claim claims nothing until the date passes it again. Each finished week adds 10% to the credits of
   the next week (max +50%). Crates draw (weighted by rarity) only from items the player cannot use yet; when nothing is left the drop
   turns into credits. Draws are seeded by the profile seed + claim number / crate id, so reloading the page never rerolls a crate. */
import { rand, hash } from '../core/util.js';
import { appBus } from '../core/events.js';
import { ATTACHMENTS } from '../weapons/attachments.js';
import { SKINS } from '../weapons/models.js';
import { Profile, dayKey, dayNum, FIRST_WIN } from './profile.js';

export const CYCLE = 7;
export const DAYS = [
  { day: 1, title: 'SUPPLY RUN', items: [{ type: 'credits', n: 300 }] },
  { day: 2, title: 'FIELD BRIEFING', items: [{ type: 'boost', mult: 1.5, matches: 3 }, { type: 'credits', n: 150 }] },
  { day: 3, title: 'HAZARD PAY', items: [{ type: 'credits', n: 500 }] },
  { day: 4, title: 'FIELD KIT', items: [{ type: 'crate', crate: 'attachment' }, { type: 'credits', n: 100 }] },
  { day: 5, title: 'DOUBLE SHIFT', items: [{ type: 'credits', n: 750 }, { type: 'boost', mult: 2, matches: 2 }] },
  { day: 6, title: "ARMORER'S CASE", items: [{ type: 'crate', crate: 'skin' }, { type: 'credits', n: 200 }] },
  { day: 7, title: 'EVIDENCE LOCKER', big: true, items: [{ type: 'credits', n: 2000 }, { type: 'xp', n: 2500 }, { type: 'crate', crate: 'elite' }, { type: 'boost', mult: 2, matches: 3 }] },
];
export const CRATES = {
  attachment: { name: 'FIELD KIT CRATE', short: 'FIELD KIT', kind: 'ATTACHMENT CRATE', desc: 'One attachment you have not unlocked yet.', draws: [{ pool: 'att' }] },
  skin: { name: "ARMORER'S CASE", short: 'FINISH CASE', kind: 'WEAPON SKIN CRATE', desc: 'One weapon finish you do not own.', draws: [{ pool: 'skin' }] },
  elite: { name: 'EVIDENCE LOCKER', short: 'LOCKER', kind: 'ELITE CRATE', desc: 'A rare-or-better finish and an attachment.', draws: [{ pool: 'skin', min: 'rare' }, { pool: 'att' }] },
};
export const RARITY = {
  common: { w: 50, col: '#b9b6af', label: 'COMMON', refund: 150 },
  uncommon: { w: 28, col: '#6fcf7a', label: 'UNCOMMON', refund: 250 },
  rare: { w: 15, col: '#4ea8ff', label: 'RARE', refund: 400 },
  epic: { w: 6, col: '#b47cff', label: 'EPIC', refund: 650 },
  legendary: { w: 1.2, col: '#f0b429', label: 'LEGENDARY', refund: 1000 },
};
const ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

const startOfNextDay = key => { const m = /^(\d{4})-(\d\d)-(\d\d)$/.exec(key); return m ? new Date(+m[1], +m[2] - 1, +m[3] + 1).getTime() : 0; };
export const fmt = ms => {
  ms = Math.max(0, Math.floor(Number(ms) || 0));
  const s = Math.ceil(ms / 1000), d = Math.floor(s / 86400), h = Math.floor(s / 3600) % 24, m = Math.floor(s / 60) % 60, x = s % 60;
  const p = n => (n < 10 ? '0' : '') + n;
  return (d ? d + 'D ' : '') + p(h) + ':' + p(m) + ':' + p(x);
};

function rarityOf(kind, it) {
  if (!it) return 'common';
  if (kind === 'skin') return RARITY[it.rarity] ? it.rarity : 'common';
  const L = it.unlockLevel || 1;
  return L <= 10 ? 'common' : L <= 20 ? 'uncommon' : L <= 30 ? 'rare' : L <= 40 ? 'epic' : 'legendary';
}
const weekBonus = streak => Math.min(.5, .1 * Math.floor(Math.max(0, streak - 1) / CYCLE));
const scaleCredits = (n, wb) => Math.round(n * (1 + wb) / 5) * 5;

function firstWin(now = Date.now()) {
  const r = Profile.get().rewards, tn = dayNum(dayKey(now)), fn = dayNum(r.firstWin);
  const ready = fn == null || tn > fn;
  return { ready, xp: FIRST_WIN.xp, credits: FIRST_WIN.credits, msToReset: ready ? 0 : Math.max(0, startOfNextDay(fn != null && fn > tn ? r.firstWin : dayKey(now)) - now) };
}

function status(now = Date.now()) {
  const r = Profile.get().rewards, today = dayKey(now), tn = dayNum(today), ln = dayNum(r.last);
  const clockBack = ln != null && tn < ln;
  const claimedToday = ln != null && tn === ln;
  const diff = ln == null ? null : tn - ln;
  const nextStreak = claimedToday || clockBack ? r.streak : diff === 1 ? r.streak + 1 : 1;
  const broken = !claimedToday && !clockBack && diff != null && diff > 1 && r.streak > 0;
  const ready = !claimedToday && !clockBack;
  const shown = Math.max(1, ready ? nextStreak : r.streak);
  const day = ((shown - 1) % CYCLE) + 1;
  const nextAt = ready ? now : startOfNextDay(r.last);
  const wb = weekBonus(shown);
  const base = DAYS[day - 1];
  const reward = { ...base, items: base.items.map(it => (it.type === 'credits' ? { ...it, n: scaleCredits(it.n, wb) } : { ...it })) };
  return { ready, day, streak: claimedToday ? r.streak : broken ? 0 : r.streak, nextStreak, best: r.best, claims: r.claims, claimedToday, broken, clockBack,
    msToNext: ready ? 0 : Math.max(0, nextAt - now), nextAt, cycle: CYCLE, weekBonus: wb, reward, today, firstWin: firstWin(now) };
}

// ------------------------------------------------------------------------------------------------ crates
function weighted(rng, list) {
  let tot = 0; for (const e of list) tot += e.w;
  let x = rng() * tot;
  for (const e of list) { x -= e.w; if (x <= 0) return e; }
  return list[list.length - 1];
}
function drawOne(rng, draw, taken) {
  if (draw.pool === 'skin') {
    const min = ORDER.indexOf(draw.min || 'common');
    const pool = SKINS.filter(s => s.id !== 'factory' && !Profile.owns('skin', s.id) && !taken.has('skin:' + s.id) && ORDER.indexOf(rarityOf('skin', s)) >= min)
      .map(s => ({ w: RARITY[rarityOf('skin', s)].w, s }));
    if (!pool.length) { const r = draw.min || 'rare'; return { kind: 'credits', n: RARITY[r].refund * 2, name: 'DUPLICATE FINISH', rarity: r, refund: true }; }
    const s = weighted(rng, pool).s; taken.add('skin:' + s.id);
    const colors = s.colors || (s.tint ? [s.tint.metal, s.tint.poly] : s.kind === 'worn' ? ['#3a3b3d', '#8d8f91'] : ['#2b2c2f', '#1b1c1e']);
    return { kind: 'skin', id: s.id, name: s.name, rarity: rarityOf('skin', s), desc: s.desc || '', colors };
  }
  const pool = ATTACHMENTS.filter(a => !Profile.owns('att', a.id) && !taken.has('att:' + a.id)).map(a => ({ w: RARITY[rarityOf('att', a)].w, a }));
  if (!pool.length) return { kind: 'credits', n: 500, name: 'ALL ATTACHMENTS UNLOCKED', rarity: 'rare', refund: true };
  const a = weighted(rng, pool).a; taken.add('att:' + a.id);
  return { kind: 'att', id: a.id, name: a.name, rarity: rarityOf('att', a), slot: a.slot, desc: a.desc || '', level: a.unlockLevel || 1 };
}
/** draws for a crate kind; grants them into the profile (no save) */
function resolveCrate(kind, seedKey) {
  const c = CRATES[kind]; if (!c) return [];
  const p = Profile.get(), rng = rand(hash(p.seed + ':' + seedKey)), taken = new Set(), drops = [];
  for (const d of c.draws) {
    const drop = drawOne(rng, d, taken);
    drop.color = RARITY[drop.rarity].col;
    if (drop.kind === 'credits') p.cr.earned += drop.n;
    else p.owned[drop.kind][drop.id] = 1;
    drops.push(drop);
  }
  return drops;
}

function applyBoost(p, b) {
  const cur = p.boost;
  if (!cur.matches) { cur.mult = b.mult; cur.matches = b.matches; } else { cur.mult = Math.max(cur.mult, b.mult); cur.matches = cur.matches + b.matches; }
  cur.matches = Math.min(10, cur.matches);
}

function claim(now = Date.now()) {
  const s = status(now);
  if (!s.ready) return { ok: false, reason: s.clockBack ? 'clock' : 'claimed', status: s };
  const p = Profile.get(), r = p.rewards;
  r.streak = s.nextStreak; r.best = Math.max(r.best, r.streak); r.last = s.today; r.lastAt = now; r.claims++;
  const out = { ok: true, day: s.day, streak: r.streak, title: s.reward.title, big: !!s.reward.big, items: [], credits: 0, xp: 0, boost: null, drops: [], gain: null };
  for (const it of s.reward.items) {
    if (it.type === 'credits') { p.cr.earned += it.n; out.credits += it.n; out.items.push({ ...it }); }
    else if (it.type === 'xp') { out.xp += it.n; out.items.push({ ...it }); }
    else if (it.type === 'boost') { applyBoost(p, it); out.boost = { ...p.boost }; out.items.push({ ...it }); }
    else if (it.type === 'crate') {
      const drops = resolveCrate(it.crate, 'day:' + r.claims + ':' + it.crate);
      out.drops.push(...drops); out.items.push({ ...it, name: CRATES[it.crate].name, drops });
      for (const d of drops) if (d.kind === 'credits') out.credits += d.n;
    }
  }
  if (out.xp) out.gain = Profile.addXP(out.xp, 'reward'); else Profile.save('reward');
  appBus.emit('rewards:claim', out);
  return out;
}

function openCrate(id) {
  const p = Profile.get(), i = p.crates.findIndex(c => c.id === id);
  if (i < 0) return { ok: false, reason: 'That crate is not here (opened on another device?).' };
  const crate = p.crates[i];
  const drops = resolveCrate(crate.kind, 'crate:' + crate.id);
  p.crates.splice(i, 1); p.opened.push(crate.id); if (p.opened.length > 80) p.opened.splice(0, p.opened.length - 80);
  Profile.save('crate');
  return { ok: true, crate: { ...crate, name: CRATES[crate.kind].name }, drops };
}

export const Rewards = {
  DAYS, CRATES, CYCLE, RARITY, FIRST_WIN, status, claim, openCrate, firstWin, rarityOf, fmt,
  crates: () => Profile.get().crates.map(c => ({ ...c, name: (CRATES[c.kind] || {}).name || 'CRATE' })),
};
