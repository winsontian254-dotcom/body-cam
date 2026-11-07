/* LIVE FIRE — match state machine running a ModeDef (docs §8). PURE JS (no BABYLON).
   Exports:
     PHASES = ['warmup', 'freeze', 'live', 'roundEnd', 'halftime', 'over']
     class Match   (game.match)
       constructor(game, mode, options)
       fields (plain, serialisable for snapshots): phase, t (seconds left in the phase; Infinity = untimed), round (1-based),
         roundsPlayed, score { 1, 2 } (team rounds or team points), winner (team | player id | 0 draw | null), roundWinner,
         reason, half (1|2), swapped, timeLeft (timed matches), limit { rounds, winRounds, time, score }, elapsed, live
       start()                   begin (warmup -> freeze -> live)
       tick(dt)                  advance timers, respawns, default win checks, mode.tick
       endRound(winner, reason)  (round modes) -> roundEnd, then the next round / halftime / over
       endMatch(winner, reason)  -> over ('match:end')
       addScore(team, n)         team points (tdm-like modes); checks the score limit
       onKill(ev)                default scoring (kill +2 score, assist +1, suicide -1; tdm-like team point) then mode.onKill
       respawnIn(p, secs)        schedule a respawn (respawn modes)
       alive(team) -> count,  teamPlayers(team) -> [PlayerState],  leader() -> team | player id (FFA) | 0
       isFrozen() -> bool        freeze time: no movement or firing
       snapshot() -> plain object, apply(snap)   (net: clients mirror the host's match)
   Mode hooks (all optional): setup(game), tick(game, dt), onSpawn(game, p), onKill(game, ev), onRoundStart(game),
     onRoundEnd(game, r), onRoundTime(game) -> winner team (time ran out; default: defenders = team 2), checkWin(game) -> winner|null
     (replaces the default checks), hud(game), score(game).
   ModeDef extras read here: warmupTime, roundEndTime (5), halftimeTime (6), spawnProtect (s), elimination (round modes,
     default true), teamScoreOnKill (timed team modes, default true), spawnLobbyEveryRound (default: rounds > 0).
   Events: 'match:start' {}  'round:freeze' { round }  'round:start' { round }  'round:end' { winner, reason, round }
     'halftime' {}  'match:end' { winner, reason, score }  'phase' { phase, prev } */

export const PHASES = ['warmup', 'freeze', 'live', 'roundEnd', 'halftime', 'over'];

export class Match {
  constructor(game, mode, options = {}) {
    this.game = game; this.mode = mode; this.opt = options;
    const num = (k, d) => (options[k] != null && Number.isFinite(+options[k]) ? +options[k] : mode[k] != null ? mode[k] : d);
    this.limit = {
      rounds: num('rounds', 0), winRounds: num('winRounds', 0), roundTime: num('roundTime', 115), freeze: num('freezeTime', 0),
      warmup: num('warmupTime', 0), time: num('timeLimit', 0), score: num('scoreLimit', 0), respawnDelay: num('respawnDelay', 3),
      roundEnd: num('roundEndTime', 5), halftime: num('halftimeTime', 6), spawnProtect: num('spawnProtect', mode.respawn ? 2 : 0),
    };
    if (this.limit.rounds > 0 && !this.limit.winRounds) this.limit.winRounds = Math.floor(this.limit.rounds / 2) + 1;
    this.phase = 'warmup'; this.t = 0; this.round = 0; this.roundsPlayed = 0; this.score = { 1: 0, 2: 0 };
    this.winner = null; this.roundWinner = null; this.reason = ''; this.half = 1; this.swapped = false;
    this.timeLeft = this.limit.time > 0 ? this.limit.time : Infinity; this.elapsed = 0; this.live = false; this.history = [];
  }
  get rounds() { return this.limit.rounds > 0; }
  emit(n, p) { if (this.game.bus) this.game.bus.emit(n, p || {}); }
  setPhase(ph, t) { const prev = this.phase; this.phase = ph; this.t = t; this.live = ph === 'live'; this.emit('phase', { phase: ph, prev }); }

  start() {
    const g = this.game;
    if (this.mode.setup) this.mode.setup(g);
    this.emit('match:start', {});
    if (this.limit.warmup > 0) {
      this.setPhase('warmup', this.limit.warmup);
      g.map && g.map.closeGates && g.map.closeGates();
      for (const p of g.players.values()) g.spawn(p, null, { lobby: true });
    } else this.beginRound();
  }

  beginRound() {
    const g = this.game;
    this.round++; this.roundWinner = null; this.reason = '';
    const lobby = this.rounds || this.round === 1 || this.mode.spawnLobbyEveryRound;
    if (lobby && g.map && g.map.closeGates) g.map.closeGates();
    g.resetRound && g.resetRound();
    for (const p of g.players.values()) if (p.team >= 0 && p.connected !== false) g.spawn(p, null, { lobby: !!lobby, round: true });
    if (this.mode.onRoundStart) this.mode.onRoundStart(g);
    if (this.limit.freeze > 0) { this.setPhase('freeze', this.limit.freeze); this.emit('round:freeze', { round: this.round }); }
    else this.goLive();
  }

  goLive() {
    const g = this.game;
    const t = this.rounds ? this.limit.roundTime : this.timeLeft;
    this.setPhase('live', t);
    if (g.map && g.map.openGates) g.map.openGates();
    this.emit('round:start', { round: this.round });
  }

  isFrozen() { return this.phase === 'freeze' || this.phase === 'halftime' || this.phase === 'over'; }

  teamPlayers(team) { const out = []; for (const p of this.game.players.values()) if (p.team === team && p.connected !== false) out.push(p); return out; }
  alive(team) { let n = 0; for (const p of this.game.players.values()) if (p.alive && p.team === team) n++; return n; }

  leader() {
    const g = this.game;
    if (this.mode.teams === 0) {
      let best = null, bs = -Infinity, tie = false;
      for (const p of g.players.values()) { const s = p.score; if (s > bs) { bs = s; best = p; tie = false; } else if (s === bs) tie = true; }
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

  onKill(ev) {
    const g = this.game, k = ev.killer, v = ev.victim;
    if (ev.suicide) v.score -= 1;
    else if (k) {
      k.score += 2;
      if (this.mode.teams !== 0 && !this.rounds && this.mode.teamScoreOnKill !== false && this.phase === 'live') this.addScore(k.team, 1);
    }
    if (ev.assister) ev.assister.score += 1;
    if (this.mode.onKill) this.mode.onKill(g, ev);
    if (this.mode.teams === 0 && k && !ev.suicide && this.limit.score > 0 && k.kills >= this.limit.score && this.phase === 'live') this.endMatch(k.id, 'score');
    if (this.mode.respawn && this.phase !== 'over') this.respawnIn(v, this.limit.respawnDelay);
  }

  endRound(winner, reason = '') {
    if (this.phase !== 'live' && this.phase !== 'freeze') return;
    this.roundWinner = winner; this.reason = reason;
    if (winner > 0) this.score[winner] = (this.score[winner] || 0) + 1;
    this.roundsPlayed++;
    this.history.push({ round: this.round, winner, reason });
    this.setPhase('roundEnd', this.limit.roundEnd);
    const r = { winner, reason, round: this.round };
    this.emit('round:end', r);
    if (this.mode.onRoundEnd) this.mode.onRoundEnd(this.game, r);
  }

  endMatch(winner, reason = '') {
    if (this.phase === 'over') return;
    this.winner = winner; this.reason = reason || this.reason;
    this.setPhase('over', 12);
    this.emit('match:end', { winner, reason: this.reason, score: { 1: this.score[1], 2: this.score[2] } });
  }

  swapSides() {
    for (const p of this.game.players.values()) if (p.team === 1 || p.team === 2) p.team = 3 - p.team;
    const s1 = this.score[1]; this.score[1] = this.score[2]; this.score[2] = s1;
    this.swapped = !this.swapped; this.half = this.half === 1 ? 2 : 1;
  }

  checkDefault() {
    const g = this.game, m = this.mode;
    if (m.checkWin) { const w = m.checkWin(g); if (w != null) { this.rounds ? this.endRound(w, 'objective') : this.endMatch(w, 'objective'); } return; }
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
    const g = this.game;
    this.elapsed += dt;
    if (this.phase !== 'over' && Number.isFinite(this.t)) this.t -= dt;
    if (this.phase === 'live' && !this.rounds && Number.isFinite(this.timeLeft)) this.timeLeft = Math.max(0, this.timeLeft - dt);
    // respawns
    if (this.mode.respawn || this.phase === 'warmup') {
      for (const p of g.players.values()) {
        if (p.alive || p.connected === false || p.team < 0) continue;
        if (p.respawnT <= 0) { if (this.phase === 'warmup') p.respawnT = 1.5; else continue; }
        p.respawnT -= dt;
        if (p.respawnT <= 0) { p.respawnT = 0; if (this.phase === 'live' || this.phase === 'warmup' || this.phase === 'freeze') g.spawn(p, null, { lobby: this.phase !== 'live' }); }
      }
    }
    switch (this.phase) {
      case 'warmup': if (this.t <= 0) { this.round = 0; this.beginRound(); } break;
      case 'freeze': if (this.t <= 0) this.goLive(); break;
      case 'live':
        if (this.mode.tick) this.mode.tick(g, dt);
        if (this.phase !== 'live') break;
        this.checkDefault();
        if (this.phase !== 'live') break;
        if (this.rounds && this.t <= 0) this.endRound(this.mode.onRoundTime ? this.mode.onRoundTime(g) : 2, 'time');
        else if (!this.rounds && this.timeLeft <= 0) this.endMatch(this.leader(), 'time');
        break;
      case 'roundEnd':
        if (this.t <= 0) {
          const win = this.limit.winRounds;
          const draw = this.limit.rounds > 0 && this.roundsPlayed >= this.limit.rounds;
          if (this.score[1] >= win || this.score[2] >= win || draw) this.endMatch(this.leader(), 'rounds');
          else if (this.limit.rounds >= 2 && this.half === 1 && this.roundsPlayed === Math.floor(this.limit.rounds / 2) && this.mode.teams !== 0) {
            this.setPhase('halftime', this.limit.halftime); this.emit('halftime', {});
          } else this.beginRound();
        }
        break;
      case 'halftime': if (this.t <= 0) { this.swapSides(); this.beginRound(); } break;
      default: break;
    }
  }

  snapshot() {
    return { phase: this.phase, t: this.t, round: this.round, roundsPlayed: this.roundsPlayed, score: { 1: this.score[1], 2: this.score[2] },
      winner: this.winner, roundWinner: this.roundWinner, reason: this.reason, half: this.half, swapped: this.swapped, timeLeft: this.timeLeft };
  }
  apply(s) {
    if (!s) return;
    const prev = this.phase;
    Object.assign(this, { phase: s.phase, t: s.t, round: s.round, roundsPlayed: s.roundsPlayed, winner: s.winner, roundWinner: s.roundWinner,
      reason: s.reason, half: s.half, swapped: s.swapped, timeLeft: s.timeLeft });
    this.score[1] = s.score[1]; this.score[2] = s.score[2]; this.live = this.phase === 'live';
    if (prev !== this.phase) this.emit('phase', { phase: this.phase, prev });
  }
}
