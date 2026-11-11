/* LIVE FIRE — match state machine running a ModeDef (docs §8). PURE JS (no BABYLON, no DOM).
   Exports:
     PHASES = ['warmup', 'freeze', 'live', 'roundEnd', 'halftime', 'over']
     REASONS        round-end reason -> banner sub line ('elimination' 'time' 'bomb' 'defuse' 'hostage' 'hostages_lost' 'vip_escaped'
                    'vip_killed' 'infected' 'survived' 'found' 'hidden' 'objective' 'draw')
     class Match   (game.match)
       constructor(game, mode, options)        also creates game.economy (economy.js) and game.objectives (objectives.js)
       fields (plain, serialisable for snapshots): phase, t (seconds left in the phase; Infinity = untimed), round (1-based),
         roundsPlayed, score { 1, 2 } (team rounds or team points), winner (team | player id | 0 draw | null), roundWinner,
         reason, half (1|2), swapped, timeLeft (timed matches), limit { rounds, winRounds, roundTime, freeze, warmup, time, score,
         respawnDelay, roundEnd, halftime, spawnProtect, buyTime, ot: { rounds, money } | null }, elapsed, live, liveFor (s live this
         round), ot (overtime number, 0 = regulation), inter ('half' | 'ot' while in the 'halftime' phase), planted (this round),
         history [{ round, winner, reason, mvp }], mvp (last round MVP id), lastMvpReason
       start()                   begin (warmup -> freeze -> live); the economy resets money
       tick(dt)                  timers, respawns, objectives, mode.tick, default win checks
       endRound(winner, reason)  (round modes) -> roundEnd (economy bonuses, round MVP), then next round / halftime / overtime / over
       endMatch(winner, reason)  -> over ('match:end' with MVP and team stats)
       addScore(team, n)         team points (respawn modes); checks the score limit
       onKill(ev)                default scoring (kill +2 score, assist +1, suicide -1; timed team modes +1 team point per kill unless
                                 mode.teamScoreOnKill === false), economy kill reward, objectives, respawn timer, auto-balance
       respawnIn(p, secs)        schedule a respawn (respawn modes)
       alive(team) -> count,  teamPlayers(team) -> [PlayerState],  leader() -> team | player id (FFA) | 0
       isFrozen() -> bool        freeze / intermission / over: no movement or firing
       winTarget() -> rounds needed to win now (regulation or overtime),  matchPoint() -> team | 0
       teamName(t)               mode.teamNames[t] || TEAM_NAMES[t]
       banner(winner, reason) -> { title, sub }
       scoreboard(viewer) -> { mode, map, round, rounds, phase, ot, teams: [{ team, name, color, score, alive, money, players: [row] }],
                                columns: [{ key, label }], history }   row = { id, name, team, bot, local, alive, kills, deaths, assists,
                                hs, hsp, dmg, adr, score, mvps, money (null = hidden from the viewer), ping, icons: [], extra: {} }
       teamStats() -> { 1: { kills, deaths, assists, damage, headshots, score, objectives, spent }, 2: {...} }
       snapshot() -> plain object, apply(snap)   (net: clients mirror the host's match incl. objectives + economy state)
   Mode hooks (all optional): setup(game), tick(game, dt), onSpawn(game, p), onKill(game, ev), onRoundStart(game), onRoundEnd(game, r),
     beforeRound(game) (before the round's spawns: team assignment), onLive(game), openGates(game) (replaces map.openGates() at go-live),
     spawnSpot(game, p, 'round'|'respawn') -> spot | null, respawnTime(game, p) -> seconds | null (null = no respawn), canRespawn(game, p)
     -> bool (false holds a scheduled respawn; p.respawnWait = text for the HUD), onRoundTime(game) -> winner team (time ran out; default
     defenders = team 2), checkWin(game) -> winner | null (replaces the default checks; round modes end the round, timed modes the match),
     matchWinner(game) -> winner (timed / FFA end on time), canBuy(game, p) -> { ok, reason }, hud(game) -> { top, bottom, clock, markers },
     score(game) -> rows, botGoal(game, bot) -> goal (docs §8), columns [{ key, label, get(p, game) }].
   ModeDef extras read here: warmupTime, roundEndTime (5), halftimeTime (6), spawnProtect (s), elimination (round modes, default true),
     teamScoreOnKill (timed team modes, default true), spawnLobbyEveryRound (default: rounds > 0), overtime { rounds, money } (round modes:
     tie at full time -> overtime halves, MR3 by default), halftime (false = no side swap), swapEveryRound (hide & seek), autoBalance
     (false = never move players), teamNames { 1, 2, plural }, economy, freeBuy, buyTime, startMoney, maxMoney, noPickup.
   Events: 'match:start' {}  'round:freeze' { round }  'round:start' { round }  'round:end' { winner, reason, round, title, sub, mvp, mvpName,
     mvpReason, score }  'halftime' { kind 'half'|'ot', ot }  'overtime' { n }  'match:point' { team, round }  'match:end' { winner, reason,
     score, mvp, mvpName, teamStats, rounds }  'phase' { phase, prev }  'team:balance' { p, from, to }  'chat' { system: true, text } */
import { Economy } from './economy.js';
import { Objectives } from './objectives.js';
import { TEAM_NAMES, TEAM_COLORS } from './player.js';

export const PHASES = ['warmup', 'freeze', 'live', 'roundEnd', 'halftime', 'over'];
export const REASONS = {
  elimination: 'ALL HOSTILES NEUTRALISED', time: 'TIME EXPIRED', bomb: 'TARGET DESTROYED', defuse: 'CHARGE DEFUSED', hostage: 'HOSTAGES RESCUED',
  hostages_lost: 'HOSTAGES LOST', vip_escaped: 'VIP EXTRACTED', vip_killed: 'VIP ELIMINATED', infected: 'EVERYONE IS INFECTED', survived: 'SURVIVORS HELD OUT',
  found: 'ALL HIDERS FOUND', hidden: 'HIDERS STAYED HIDDEN', objective: 'OBJECTIVE COMPLETE', draw: 'NOBODY WINS', score: 'SCORE LIMIT', rounds: '',
};
const MVP_WHY = { bomb: 'PLANTED THE CHARGE', defuse: 'DEFUSED THE CHARGE', hostage: 'RESCUED HOSTAGES', vip_escaped: 'EXTRACTED THE VIP', kills: 'MOST ELIMINATIONS', dmg: 'MOST DAMAGE' };

export class Match {
  constructor(game, mode, options = {}) {
    this.game = game; this.mode = mode; this.opt = options;
    const num = (k, d) => (options[k] != null && Number.isFinite(+options[k]) ? +options[k] : mode[k] != null ? mode[k] : d);
    const ot = options.overtime === false ? null : mode.overtime ? { rounds: 6, money: 10000, ...(mode.overtime === true ? {} : mode.overtime) } : null;
    this.limit = {
      rounds: num('rounds', 0), winRounds: num('winRounds', 0), roundTime: num('roundTime', 115), freeze: num('freezeTime', 0),
      warmup: num('warmupTime', 0), time: num('timeLimit', 0), score: num('scoreLimit', 0), respawnDelay: num('respawnDelay', 3),
      roundEnd: num('roundEndTime', 5), halftime: num('halftimeTime', 6), spawnProtect: num('spawnProtect', mode.respawn ? 2 : 0),
      buyTime: num('buyTime', 0), ot,
    };
    if (this.limit.rounds > 0 && !this.limit.winRounds) this.limit.winRounds = Math.floor(this.limit.rounds / 2) + 1;
    this.phase = 'warmup'; this.t = 0; this.round = 0; this.roundsPlayed = 0; this.score = { 1: 0, 2: 0 };
    this.winner = null; this.roundWinner = null; this.reason = ''; this.half = 1; this.swapped = false;
    this.timeLeft = this.limit.time > 0 ? this.limit.time : Infinity; this.elapsed = 0; this.live = false; this.history = [];
    this.ot = 0; this.inter = null; this.liveFor = 0; this.planted = false; this.mvp = null; this.lastMvpReason = '';
    this.rk = Object.create(null); this.rd = Object.create(null);
    this.econ = new Economy(game, mode, this); this.obj = new Objectives(game, mode, this);
    if (game) { game.economy = this.econ; game.objectives = this.obj; }
    const bus = game && game.bus;
    this.offs = [];
    if (bus) this.offs.push(
      bus.on('player:join', e => this.onJoin(e.p)),
      bus.on('spawn', e => { if (e && e.p) this.obj.onSpawn(e.p); }),
      bus.on('damage', e => { if (e && e.from && e.victim && e.from !== e.victim && e.from.team !== e.victim.team) this.rd[e.from.id] = (this.rd[e.from.id] || 0) + (e.dmg || 0); }),
    );
    if (game && game.addCommandFilter) this.offs.push(game.addCommandFilter((p, cmd) => this.obj.filter(p, cmd)));
  }
  dispose() { for (const f of this.offs) { try { f(); } catch (e) { /* gone */ } } this.offs.length = 0; this.obj.dispose(); }
  get rounds() { return this.limit.rounds > 0; }
  emit(n, p) { if (this.game.bus) this.game.bus.emit(n, p || {}); }
  setPhase(ph, t) { const prev = this.phase; this.phase = ph; this.t = t; this.live = ph === 'live'; this.emit('phase', { phase: ph, prev }); }
  teamName(t) { const n = this.mode.teamNames; return (n && n[t]) || TEAM_NAMES[t] || 'FREE'; }

  // ------------------------------------------------------------------------------------------------ flow
  start() {
    const g = this.game;
    if (this.mode.setup) this.mode.setup(g);
    this.econ.matchStart();
    this.emit('match:start', {});
    if (this.limit.warmup > 0) {
      this.setPhase('warmup', this.limit.warmup);
      this.econ.warmup();
      if (g.map && g.map.openGates) g.map.openGates();          // warmup: free roam with respawns (deathmatch rules)
      for (const p of g.players.values()) if (p.team >= 0 && p.connected !== false) g.spawn(p, null, { lobby: true });
    } else this.beginRound();
  }

  beginRound() {
    const g = this.game, m = this.mode;
    if (this.phase === 'warmup') { this.econ.matchStart(); for (const p of g.players.values()) { p.kills = p.deaths = p.assists = p.score = p.headshots = p.mvps = 0; p.damageDone = 0; p.ms = {}; } }
    this.round++; this.roundWinner = null; this.reason = ''; this.liveFor = 0; this.planted = false; this.mvp = null;
    this.rk = Object.create(null); this.rd = Object.create(null);
    if (m.swapEveryRound && this.round > 1) this.swapSides();
    if (this.rounds && m.teams === 2) this.balance();
    if (m.beforeRound) m.beforeRound(g);
    const lobby = this.rounds || this.round === 1 || m.spawnLobbyEveryRound;
    if (lobby && g.map && g.map.closeGates) g.map.closeGates();
    // economy rounds: survivors carry their kit into the next round (collected before anyone respawns)
    const keep = this.econ.on && this.rounds ? new Map([...g.players.values()].map(p => [p.id, this.econ.keepOf(p)])) : null;
    g.resetRound && g.resetRound();
    for (const p of g.players.values()) {
      if (!(p.team >= 0) || p.connected === false) continue;
      const spot = m.spawnSpot ? m.spawnSpot(g, p, 'round') : null;
      g.spawn(p, spot || null, { lobby: !spot && !!lobby, round: true });
      if (keep) this.econ.roundKit(p, keep.get(p.id));
    }
    this.econ.roundStart();
    this.obj.roundStart();
    if (m.onRoundStart) m.onRoundStart(g);
    if (this.econ.on) this.botBuys();
    if (this.rounds) {
      const mp = this.matchPoint();
      if (mp) this.emit('match:point', { team: mp, round: this.round });
    }
    if (this.limit.freeze > 0) { this.setPhase('freeze', this.limit.freeze); this.emit('round:freeze', { round: this.round }); }
    else this.goLive();
  }

  goLive() {
    const g = this.game, m = this.mode;
    const t = this.rounds ? this.limit.roundTime : this.timeLeft;
    this.liveFor = 0;
    this.setPhase('live', t);
    if (m.openGates) m.openGates(g); else if (g.map && g.map.openGates) g.map.openGates();
    if (m.onLive) m.onLive(g);
    this.emit('round:start', { round: this.round });
  }

  /** The default bot buy (bots/bot.js may set game.bots.handlesBuy to do its own). */
  botBuys() {
    const g = this.game;
    if (g.bots && g.bots.handlesBuy) return;
    for (const p of g.players.values()) if (p.bot && p.alive) { try { this.econ.autoBuy(p); } catch (e) { /* never break the round */ } }
  }

  isFrozen() { return this.phase === 'freeze' || this.phase === 'halftime' || this.phase === 'over'; }

  teamPlayers(team) { const out = []; for (const p of this.game.players.values()) if (p.team === team && p.connected !== false) out.push(p); return out; }
  alive(team) { let n = 0; for (const p of this.game.players.values()) if (p.alive && p.team === team && p.connected !== false) n++; return n; }

  leader() {
    const g = this.game;
    if (this.mode.matchWinner) { const w = this.mode.matchWinner(g); if (w != null) return w; }
    if (this.mode.teams === 0) {
      let best = null, bs = -Infinity, tie = false;
      for (const p of g.players.values()) { const s = p.kills * 1000 + p.score; if (s > bs) { bs = s; best = p; tie = false; } else if (s === bs) tie = true; }
      return best && !tie ? best.id : 0;
    }
    return this.score[1] > this.score[2] ? 1 : this.score[2] > this.score[1] ? 2 : 0;
  }

  addScore(team, n = 1) {
    if (this.phase === 'over' || !(team > 0)) return;
    this.score[team] = (this.score[team] || 0) + n;
    if (!this.rounds && this.limit.score > 0 && this.score[team] >= this.limit.score && this.phase === 'live') this.endMatch(team, 'score');
  }

  respawnIn(p, secs) { p.respawnT = Math.max(0.05, secs); }
  onPlant() { this.planted = true; if (this.rounds) this.t = Infinity; }

  onKill(ev) {
    const g = this.game, k = ev.killer, v = ev.victim, m = this.mode;
    if (ev.suicide) v.score -= 1;
    else if (k) {
      k.score += 2;
      if (m.teams !== 0 && !this.rounds && m.teamScoreOnKill !== false && this.phase === 'live' && k.team !== v.team) this.addScore(k.team, 1);
      if (k.team !== v.team || k.team === 0) this.rk[k.id] = (this.rk[k.id] || 0) + 1;
    }
    if (ev.assister) ev.assister.score += 1;
    if (this.phase !== 'warmup') this.econ.onKill(ev);
    this.obj.onKill(ev);
    if (m.onKill) m.onKill(g, ev);
    if (m.teams === 0 && !m.checkWin && k && !ev.suicide && this.limit.score > 0 && k.kills >= this.limit.score && this.phase === 'live') this.endMatch(k.id, 'score');
    if (m.respawn && this.phase !== 'over') {
      const t = m.respawnTime ? m.respawnTime(g, v) : this.limit.respawnDelay;
      if (t != null) this.respawnIn(v, t); else v.respawnT = 0;
      if (!this.rounds && m.teams === 2 && m.autoBalance !== false) this.balance(v);
    }
  }

  /** Auto-balance: while the team sizes differ by 2 or more, move a bot (else a human who allows it) from the bigger team.
      `only`: respawn modes balance with the player who just died. */
  balance(only) {
    const g = this.game, m = this.mode, o = this.opt;
    if (m.teams !== 2 || m.autoBalance === false || o.autoBalance === false) return;
    for (let guard = 0; guard < 32; guard++) {
      const a = this.teamPlayers(1), b = this.teamPlayers(2);
      if (Math.abs(a.length - b.length) < 2) return;
      const big = a.length > b.length ? a : b, from = a.length > b.length ? 1 : 2, to = 3 - from;
      let mv = null;
      if (only) { if (only.team === from && (only.bot || only.autoBalance !== false) && !only.local) mv = only; else return; }
      else mv = big.filter(p => p.bot).sort((x, y) => (x.alive === y.alive ? 0 : x.alive ? 1 : -1))[0] || big.find(p => !p.local && p.autoBalance !== false) || null;
      if (!mv) return;
      mv.team = to; mv.inv.bomb = false;
      if (this.econ.on) mv.money = Math.max(mv.money | 0, this.econ.start);
      this.emit('team:balance', { p: mv, from, to });
      this.emit('chat', { from: null, system: true, text: mv.name + ' was moved to ' + this.teamName(to) + ' (auto-balance)' });
      if (only) return;
    }
  }

  /** Late join: money; in round modes a player who joins during freeze time spawns at once, later ones wait for the next round. */
  onJoin(p) {
    if (!p) return;
    p.ms = p.ms || {};
    if (this.econ.on) p.money = this.phase === 'warmup' ? this.econ.max : this.ot ? Math.min(this.econ.max, this.limit.ot ? this.limit.ot.money : 10000) : this.econ.start;
    if (this.round === 0 || !this.rounds) return;
    if (this.phase === 'freeze' && !p.alive) {
      const spot = this.mode.spawnSpot ? this.mode.spawnSpot(this.game, p, 'round') : null;
      this.game.spawn(p, spot, { lobby: !spot, round: true });
      if (this.econ.on) this.econ.roundKit(p, null);
    }
  }

  winTarget() {
    const L = this.limit;
    if (!this.rounds) return Infinity;
    if (!this.ot || !L.ot) return L.winRounds;
    return Math.floor(L.rounds / 2 + this.ot * L.ot.rounds / 2) + 1;
  }
  totalRounds() { return this.limit.rounds + (this.ot && this.limit.ot ? this.ot * this.limit.ot.rounds : 0); }
  matchPoint() {
    if (!this.rounds) return 0;
    const tgt = this.winTarget(), a = this.score[1] >= tgt - 1, b = this.score[2] >= tgt - 1;
    return a && b ? 3 : a ? 1 : b ? 2 : 0;
  }
  isHalfPoint() {
    const L = this.limit, m = this.mode;
    if (m.teams !== 2 || m.halftime === false || m.swapEveryRound) return false;
    if (!this.ot) return L.rounds >= 2 && this.half === 1 && this.roundsPlayed === Math.floor(L.rounds / 2);
    if (!L.ot || L.ot.rounds < 2) return false;
    return this.roundsPlayed === L.rounds + (this.ot - 1) * L.ot.rounds + Math.floor(L.ot.rounds / 2);
  }

  banner(winner, reason) {
    const n = this.mode.teamNames, plural = !!(n && n.plural);
    let title = winner > 0 ? this.teamName(winner) + (plural ? ' WIN' : ' WINS') : 'ROUND DRAW';
    if (typeof winner === 'string') { const p = this.game.players.get(winner); title = p ? p.name.toUpperCase() + ' WINS' : 'DRAW'; }
    return { title, sub: REASONS[reason] != null ? REASONS[reason] : String(reason || '').toUpperCase() };
  }

  roundMvp(winner, reason) {
    const g = this.game, b = this.obj.s.bomb;
    let id = null, why = '';
    if (reason === 'bomb' && b && b.planter) { id = b.planter; why = MVP_WHY.bomb; }
    else if (reason === 'defuse' && b && b.defuser) { id = b.defuser; why = MVP_WHY.defuse; }
    else if (reason === 'vip_escaped' && this.obj.s.vip) { id = this.obj.s.vip.id; why = MVP_WHY.vip_escaped; }
    else {
      let best = null, bk = 0, bd = 0;
      for (const p of g.players.values()) {
        if (winner > 0 && p.team !== winner) continue;
        const k = this.rk[p.id] || 0, d = this.rd[p.id] || 0;
        if (k > bk || (k === bk && k > 0 && d > bd)) { best = p; bk = k; bd = d; }
      }
      if (reason === 'hostage') {
        let hb = null, hr = 0;
        for (const p of g.players.values()) if (p.team === winner && (p.ms && p.ms.rescues || 0) > hr) { hr = p.ms.rescues; hb = p; }
        if (hb) { best = hb; why = MVP_WHY.hostage; }
      }
      if (best) { id = best.id; why = why || (bk > 0 ? MVP_WHY.kills : MVP_WHY.dmg); }
    }
    const p = id ? g.players.get(id) : null;
    if (!p || (winner > 0 && p.team !== winner)) return null;
    p.mvps = (p.mvps || 0) + 1;
    return { id: p.id, name: p.name, why };
  }

  endRound(winner, reason = '') {
    if (this.phase !== 'live' && this.phase !== 'freeze') return;
    const g = this.game, m = this.mode;
    this.roundWinner = winner; this.reason = reason;
    if (winner > 0) this.score[winner] = (this.score[winner] || 0) + 1;
    this.roundsPlayed++;
    const mvp = this.roundMvp(winner, reason);
    this.mvp = mvp ? mvp.id : null; this.lastMvpReason = mvp ? mvp.why : '';
    this.history.push({ round: this.round, winner, reason, mvp: this.mvp });
    const bombMode = this.obj.has('bomb');
    this.econ.roundEnd({ winner, reason, planted: this.planted, plantTeam: 1, attackers: 1, timeRule: bombMode });
    this.setPhase('roundEnd', this.limit.roundEnd);
    const bn = this.banner(winner, reason);
    const r = { winner, reason, round: this.round, title: bn.title, sub: bn.sub, mvp: this.mvp, mvpName: mvp ? mvp.name : '', mvpReason: this.lastMvpReason,
      score: { 1: this.score[1], 2: this.score[2] } };
    this.emit('round:end', r);
    if (m.onRoundEnd) m.onRoundEnd(g, r);
  }

  teamStats() {
    const out = { 1: null, 2: null, 0: null };
    for (const t of [0, 1, 2]) out[t] = { kills: 0, deaths: 0, assists: 0, damage: 0, headshots: 0, score: 0, objectives: 0, spent: 0, mvps: 0, players: 0 };
    for (const p of this.game.players.values()) {
      const s = out[p.team === 1 || p.team === 2 ? p.team : 0], x = p.ms || {};
      s.kills += p.kills | 0; s.deaths += p.deaths | 0; s.assists += p.assists | 0; s.damage += Math.round(p.damageDone || 0); s.headshots += p.headshots | 0;
      s.score += p.score | 0; s.mvps += p.mvps | 0; s.spent += x.spent | 0; s.players++;
      s.objectives += (x.plants | 0) + (x.defuses | 0) + (x.rescues | 0) + (x.caps | 0) + (x.returns | 0) + (x.confirms | 0) + (x.extracts | 0);
    }
    return out;
  }
  matchMvp(winner) {
    let best = null, bs = -Infinity;
    for (const p of this.game.players.values()) {
      if (this.mode.teams !== 0 && winner > 0 && p.team !== winner) continue;
      const s = (p.mvps | 0) * 1000 + (p.score | 0) * 10 + (p.kills | 0);
      if (s > bs) { bs = s; best = p; }
    }
    return best;
  }

  endMatch(winner, reason = '') {
    if (this.phase === 'over') return;
    this.winner = winner; this.reason = reason || this.reason;
    const mvp = this.matchMvp(winner);
    this.setPhase('over', 12);
    this.emit('match:end', { winner, reason: this.reason, score: { 1: this.score[1], 2: this.score[2] }, mvp: mvp ? mvp.id : null, mvpName: mvp ? mvp.name : '',
      teamStats: this.teamStats(), rounds: this.history.slice(), ot: this.ot });
  }

  swapSides() {
    for (const p of this.game.players.values()) if (p.team === 1 || p.team === 2) { p.team = 3 - p.team; if (p.inv) { p.inv.bomb = false; p.inv.kit = false; } }
    const s1 = this.score[1]; this.score[1] = this.score[2]; this.score[2] = s1;
    const l1 = this.econ.lossStreak[1]; this.econ.lossStreak[1] = this.econ.lossStreak[2]; this.econ.lossStreak[2] = l1;
    this.swapped = !this.swapped; this.half = this.half === 1 ? 2 : 1;
  }

  checkDefault() {
    const g = this.game, m = this.mode;
    if (m.checkWin) {
      const w = m.checkWin(g);
      if (w != null && this.phase === 'live') {
        const win = typeof w === 'object' ? w.winner : w, why = typeof w === 'object' ? (w.reason || 'objective') : (m.winReason || 'objective');
        if (this.rounds) this.endRound(win, why); else this.endMatch(win, why);
      }
      return;
    }
    if (this.rounds && m.elimination !== false && m.teams !== 0 && !m.respawn) {
      const a1 = this.alive(1), a2 = this.alive(2), n1 = this.teamPlayers(1).length, n2 = this.teamPlayers(2).length;
      if (n1 && n2) {
        if (a1 === 0 && a2 === 0) this.endRound(2, 'elimination');
        else if (a1 === 0) this.endRound(2, 'elimination');
        else if (a2 === 0) this.endRound(1, 'elimination');
      }
    }
  }

  tick(dt) {
    const g = this.game, m = this.mode;
    this.elapsed += dt;
    if (this.phase !== 'over' && Number.isFinite(this.t)) this.t -= dt;
    if (this.phase === 'live') { this.liveFor += dt; if (!this.rounds && Number.isFinite(this.timeLeft)) this.timeLeft = Math.max(0, this.timeLeft - dt); }
    // respawns: warmup (everybody), respawn modes while live (mode hooks may delay or forbid them)
    const warm = this.phase === 'warmup';
    if (m.respawn || warm) {
      for (const p of g.players.values()) {
        if (p.alive || p.connected === false || !(p.team >= 0)) continue;
        if (warm) { if (p.respawnT <= 0) p.respawnT = 1.5; }
        else if (this.phase !== 'live' || p.respawnT <= 0) continue;
        if (!warm && m.canRespawn && !m.canRespawn(g, p)) { p.respawnT = Math.max(p.respawnT, 0.05); continue; }
        p.respawnWait = null;
        p.respawnT -= dt;
        if (p.respawnT <= 0) {
          p.respawnT = 0;
          const spot = !warm && m.spawnSpot ? m.spawnSpot(g, p, 'respawn') : null;
          g.spawn(p, spot, { lobby: warm });
        }
      }
    }
    if (this.phase === 'live' || this.phase === 'roundEnd' || this.phase === 'freeze') this.obj.tick(dt);
    switch (this.phase) {
      case 'warmup': if (this.t <= 0) { this.round = 0; this.beginRound(); } break;
      case 'freeze': if (this.t <= 0) this.goLive(); break;
      case 'live':
        if (m.tick) m.tick(g, dt);
        if (this.phase !== 'live') break;
        this.checkDefault();
        if (this.phase !== 'live') break;
        if (this.rounds && this.t <= 0) {
          const r = m.onRoundTime ? m.onRoundTime(g) : 2;
          if (r && typeof r === 'object') this.endRound(r.winner, r.reason || 'time'); else this.endRound(r, 'time');
        }
        else if (!this.rounds && this.timeLeft <= 0) this.endMatch(this.leader(), 'time');
        break;
      case 'roundEnd':
        if (this.t <= 0) {
          const tgt = this.winTarget();
          if (this.score[1] >= tgt || this.score[2] >= tgt) this.endMatch(this.leader(), 'rounds');
          else if (this.roundsPlayed >= this.totalRounds()) {
            if (this.limit.ot && m.teams === 2 && this.score[1] === this.score[2]) this.intermission('ot');
            else this.endMatch(this.leader(), 'rounds');
          } else if (this.isHalfPoint()) this.intermission('half');
          else this.beginRound();
        }
        break;
      case 'halftime':
        if (this.t <= 0) {
          if (this.inter === 'half') { this.swapSides(); this.econ.halftime(); if (this.ot && this.limit.ot) this.econ.resetMoney(this.limit.ot.money); }
          else if (this.inter === 'ot') { this.econ.overtime(); if (this.limit.ot) this.econ.resetMoney(this.limit.ot.money); }
          this.inter = null;
          this.beginRound();
        }
        break;
      default: break;
    }
  }

  intermission(kind) {
    if (kind === 'ot') { this.ot++; this.emit('overtime', { n: this.ot }); }
    this.inter = kind;
    this.setPhase('halftime', this.limit.halftime);
    this.emit('halftime', { kind, ot: this.ot });
  }

  // ------------------------------------------------------------------------------------------------ scoreboard data
  scoreboard(viewer) {
    const g = this.game, m = this.mode, me = viewer || g.local;
    const cols = (m.columns || []).map(c => ({ key: c.key, label: c.label }));
    const rowOf = p => {
      const x = p.ms || {}, rounds = Math.max(1, this.roundsPlayed + (this.phase === 'live' ? 1 : 0));
      const icons = [];
      const own = !me || me.team === p.team && p.team > 0;
      if (own && p.inv && p.inv.bomb) icons.push('bomb');
      if (own && p.inv && p.inv.kit) icons.push('kit');
      if (p.vip && own) icons.push('vip');
      if (p.jugg) icons.push('jugg');
      if (p.flag) icons.push('flag');
      if (p.carry) icons.push('hostage');
      const extra = {};
      for (const c of m.columns || []) { try { extra[c.key] = c.get ? c.get(p, g) : x[c.key] | 0; } catch (e) { extra[c.key] = ''; } }
      return { id: p.id, name: p.name, team: p.team, bot: !!p.bot, local: !!p.local, alive: !!p.alive, kills: p.kills | 0, deaths: p.deaths | 0, assists: p.assists | 0,
        hs: p.headshots | 0, hsp: p.kills ? Math.round(100 * (p.headshots | 0) / p.kills) : 0, dmg: Math.round(p.damageDone || 0), adr: Math.round((p.damageDone || 0) / rounds),
        score: p.score | 0, mvps: p.mvps | 0, money: this.econ.on && (!me || me.team === p.team || this.phase === 'over') ? p.money | 0 : null, ping: p.bot ? 0 : p.ping | 0,
        icons, extra, connected: p.connected !== false };
    };
    const sort = (a, b) => b.score - a.score || b.kills - a.kills || a.deaths - b.deaths || (a.name < b.name ? -1 : 1);
    const teams = [];
    const list = [...g.players.values()].filter(p => p.connected !== false);
    for (const t of m.teams === 0 ? [0] : [1, 2]) {
      const ps = list.filter(p => (m.teams === 0 ? true : p.team === t)).map(rowOf).sort(m.teams === 0 ? (a, b) => (m.ffaSort ? m.ffaSort(a, b, g) : b.kills - a.kills || b.score - a.score) : sort);
      const own = !me || me.team === t;
      teams.push({ team: t, name: t ? this.teamName(t) : 'OPERATORS', color: TEAM_COLORS[t] || '#ddd', score: t ? this.score[t] : 0, alive: ps.filter(r => r.alive).length,
        money: this.econ.on && own && t ? ps.reduce((a, r) => a + (r.money || 0), 0) : null, players: ps });
    }
    return { mode: m.name || m.id, modeId: m.id, map: (g.def && g.def.name) || g.mapId || '', round: this.round, rounds: this.limit.rounds, phase: this.phase, ot: this.ot,
      teams, columns: cols, history: this.history.slice(-30), economy: this.econ.on, roundModes: this.rounds, time: this.phase === 'live' ? (this.rounds ? this.t : this.timeLeft) : this.t };
  }

  // ------------------------------------------------------------------------------------------------ net
  snapshot() {
    return { phase: this.phase, t: this.t, round: this.round, roundsPlayed: this.roundsPlayed, score: { 1: this.score[1], 2: this.score[2] },
      winner: this.winner, roundWinner: this.roundWinner, reason: this.reason, half: this.half, swapped: this.swapped, timeLeft: this.timeLeft,
      ot: this.ot, inter: this.inter, liveFor: this.liveFor, planted: this.planted, mvp: this.mvp, mvpWhy: this.lastMvpReason, history: this.history.slice(-30),
      obj: this.obj.snapshot(), econ: this.econ.snapshot() };
  }
  apply(s) {
    if (!s) return;
    const prev = this.phase;
    Object.assign(this, { phase: s.phase, t: s.t, round: s.round, roundsPlayed: s.roundsPlayed, winner: s.winner, roundWinner: s.roundWinner,
      reason: s.reason, half: s.half, swapped: s.swapped, timeLeft: s.timeLeft });
    if (s.ot != null) { this.ot = s.ot; this.inter = s.inter; this.liveFor = s.liveFor || 0; this.planted = !!s.planted; this.mvp = s.mvp || null; this.lastMvpReason = s.mvpWhy || ''; }
    if (s.history) this.history = s.history;
    this.score[1] = s.score[1]; this.score[2] = s.score[2]; this.live = this.phase === 'live';
    if (s.obj) this.obj.apply(s.obj);
    if (s.econ) this.econ.apply(s.econ);
    if (prev !== this.phase) this.emit('phase', { phase: this.phase, prev });
  }
}
