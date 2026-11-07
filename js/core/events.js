/* LIVE FIRE — tiny event bus.
   Exports: class Bus { on(name, fn) -> off, once(name, fn) -> off, off(name, fn), emit(name, payload), clear(name?), count(name) },
            appBus (the app-wide bus: 'settings' 'account' 'profile' 'screen' 'gpu:lost' 'gpu:restored' 'input:lock' 'loop:error' ...)
   Handlers are stored in copy-on-write arrays, so emit() never allocates and a handler may safely add or remove
   handlers while an event is being delivered. A handler that throws is reported (console.error, once per message)
   and does not stop the other handlers. */

export class Bus {
  constructor(name = 'bus') { this.name = name; this._h = new Map(); this._seen = new Set(); }
  on(name, fn) {
    if (typeof fn !== 'function') throw new TypeError('Bus.on(' + name + '): handler is not a function');
    const cur = this._h.get(name); this._h.set(name, cur ? cur.concat(fn) : [fn]);
    return () => this.off(name, fn);
  }
  once(name, fn) {
    const off = this.on(name, p => { off(); fn(p); });
    return off;
  }
  off(name, fn) {
    const cur = this._h.get(name); if (!cur) return;
    const i = cur.indexOf(fn); if (i < 0) return;
    if (cur.length === 1) this._h.delete(name); else this._h.set(name, cur.slice(0, i).concat(cur.slice(i + 1)));
  }
  emit(name, payload) {
    const list = this._h.get(name); if (!list) return;
    for (let i = 0; i < list.length; i++) {
      try { list[i](payload); } catch (e) {
        const key = name + ':' + (e && e.message);
        if (!this._seen.has(key)) { this._seen.add(key); console.error('[' + this.name + '] handler for "' + name + '" failed:', e); }
      }
    }
  }
  count(name) { const l = this._h.get(name); return l ? l.length : 0; }
  clear(name) { if (name === undefined) this._h.clear(); else this._h.delete(name); }
}

export const appBus = new Bus('appBus');
