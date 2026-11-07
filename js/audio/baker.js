/* LIVE FIRE — turns bank definitions into AudioBuffers: a module Worker renders them off the main thread (main-thread fallback
   in idle slices when workers are unavailable); 'crit' sounds needed before their bake can be rendered synchronously (one
   variant, a few ms). Keeps a byte budget with LRU eviction of sounds that are not pinned.
   Exports: class Baker
     new Baker(ctx, { mobile, budgetMB })   ctx: the live AudioContext (only used to create buffers when the AudioBuffer
                                           constructor is missing)
     request(names, urgent = false) -> Promise   resolves when every name is baked (or failed / unknown)
     pin(names)                             never evicted (the warm set)
     get(name) -> AudioBuffer[] | null      all variants
     pick(name, sync = false) -> AudioBuffer | null   a random variant (never the same twice in a row); requests the bake when
                                           missing, and with sync renders one variant right now on the main thread
     has(name), onReady(name, fn), stats() -> { baked, mb, bakeMs, pending, worker, errors } */
import * as bankMod from './bank.js';
import './sounds/index.js';
const ACtor = typeof AudioBuffer !== 'undefined' ? AudioBuffer : null;
const loadBank = () => Promise.resolve(bankMod);

export class Baker {
  constructor(ctx, opts = {}) {
    this.ctx = ctx; this.sr = ctx.sampleRate; this.mobile = !!opts.mobile; this.budget = (opts.budgetMB || (this.mobile ? 48 : 96)) * 1048576;
    this.bufs = new Map(); this.bytes = 0; this.pinned = new Set(); this.used = new Map(); this.last = new Map();
    this.waiters = new Map(); this.inflight = new Set(); this.partial = new Set(); this.bakeMs = 0; this.errors = 0; this.workerOk = false; this.fallbackQ = []; this.fbBusy = false;
    this.vars = this.mobile ? 2 : 99;
    try {
      this.worker = new Worker(new URL('./bake-worker.js', import.meta.url), { type: 'module' });
      this.worker.onmessage = e => this._recv(e.data);
      this.worker.onerror = e => { if (e && e.preventDefault) e.preventDefault(); this._toFallback('worker error: ' + (e && e.message)); };
      this.workerOk = true;
    } catch (e) { this.worker = null; }
    loadBank();
  }
  _toFallback(why) {
    if (!this.worker) return;
    console.warn('[audio] bake worker unavailable, baking on the main thread (' + why + ')');
    try { this.worker.terminate(); } catch (e) { /* gone */ }
    this.worker = null; this.workerOk = false;
    for (const n of this.inflight) if (!this.fallbackQ.includes(n)) this.fallbackQ.push(n);
    this._fbRun();
  }
  _fbRun() {
    if (this.fbBusy) return; this.fbBusy = true;
    const step = async () => {
      await loadBank();
      const n = this.fallbackQ.shift();
      if (!n) { this.fbBusy = false; return; }
      if (!this.bufs.has(n) || this.partial.has(n)) { try { const r = bankMod.render(n, this.sr, { vars: this.vars }); if (r) this._store(n, r); else this._fail(n); } catch (e) { this.errors++; this._fail(n); } }
      else this._fail(n);   // already baked: just release the waiters
      setTimeout(step, 4);
    };
    setTimeout(step, 0);
  }
  request(names, urgent = false) {
    if (typeof names === 'string') names = [names];
    const want = names.filter(n => n && (!this.bufs.has(n) || this.partial.has(n)));
    const ps = want.map(n => new Promise(res => { const w = this.waiters.get(n) || []; w.push(res); this.waiters.set(n, w); }));
    const fresh = want.filter(n => !this.inflight.has(n) || urgent);
    for (const n of fresh) this.inflight.add(n);
    if (fresh.length) {
      if (this.worker) this.worker.postMessage({ type: 'bake', names: fresh, sr: this.sr, vars: this.vars, urgent });
      else { for (const n of fresh) { const i = this.fallbackQ.indexOf(n); if (i >= 0) this.fallbackQ.splice(i, 1); urgent ? this.fallbackQ.unshift(n) : this.fallbackQ.push(n); } this._fbRun(); }
    }
    return Promise.all(ps);
  }
  pin(names) { for (const n of names) this.pinned.add(n); }
  has(name) { return this.bufs.has(name); }
  get(name) { const v = this.bufs.get(name); if (v) this.used.set(name, ++Baker.clock); return v || null; }
  onReady(name, fn) { if (this.bufs.has(name)) { fn(); return; } this.request([name], true).then(fn); }
  pick(name, sync = false) {
    let v = this.get(name);
    if (!v) {
      if (sync) { const d = bankMod.getDef(name); if (d && d.crit) { try { const r = bankMod.render(name, this.sr, { vars: 1 }); if (r) { this._store(name, r, true); v = this.bufs.get(name); } } catch (e) { this.errors++; } } }
      if (!this.inflight.has(name)) this.request([name], true);
      if (!v) return null;
    }
    if (v.length === 1) return v[0];
    const last = this.last.get(name); let i = Math.floor(Math.random() * v.length); if (i === last) i = (i + 1) % v.length;
    this.last.set(name, i); return v[i];
  }
  _recv(m) {
    if (!m) return;
    if (m.type === 'done') { this.bakeMs += m.ms || 0; this._store(m.name, m); }
    else { if (m.type === 'error') { this.errors++; console.warn('[audio] bake failed: ' + m.name + ' — ' + m.msg); } this._fail(m.name); }
  }
  _fail(n) { this.inflight.delete(n); const w = this.waiters.get(n); this.waiters.delete(n); if (w) w.forEach(f => f()); }
  _store(name, r, partial = false) {
    const out = [];
    for (const v of r.vars) {
      const chans = Array.isArray(v) ? v : [v], len = chans[0].length;
      let b;
      try { b = ACtor ? new ACtor({ length: len, numberOfChannels: chans.length, sampleRate: r.sr }) : this.ctx.createBuffer(chans.length, len, r.sr); }
      catch (e) { b = this.ctx.createBuffer(chans.length, len, r.sr); }
      chans.forEach((c, i) => { if (b.copyToChannel) b.copyToChannel(c, i); else b.getChannelData(i).set(c); });
      out.push(b); this.bytes += len * chans.length * 4;
    }
    const old = this.bufs.get(name); if (old) for (const b of old) this.bytes -= b.length * b.numberOfChannels * 4;
    this.bufs.set(name, out); this.used.set(name, ++Baker.clock);
    if (partial) this.partial.add(name); else this.partial.delete(name);
    if (!partial) { this.inflight.delete(name); const w = this.waiters.get(name); this.waiters.delete(name); if (w) w.forEach(f => f()); }
    if (this.bytes > this.budget) this._evict();
  }
  _evict() {
    const cand = [...this.bufs.keys()].filter(n => !this.pinned.has(n)).sort((a, b) => (this.used.get(a) || 0) - (this.used.get(b) || 0));
    for (const n of cand) { if (this.bytes <= this.budget * .85) break; for (const b of this.bufs.get(n)) this.bytes -= b.length * b.numberOfChannels * 4; this.bufs.delete(n); }
  }
  stats() { return { baked: this.bufs.size, mb: +(this.bytes / 1048576).toFixed(1), bakeMs: Math.round(this.bakeMs), pending: this.inflight.size, worker: !!this.worker, errors: this.errors }; }
}
Baker.clock = 0;
export { loadBank };
