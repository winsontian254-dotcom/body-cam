/* LIVE FIRE — audio bake worker (module worker). Renders bank sounds off the main thread and transfers the samples back.
   Messages in:  { type: 'bake', names: [..], sr, vars, urgent }   (urgent names jump the queue)
   Messages out: { type: 'done', name, sr, ch, vars: [Float32Array | [L, R]], ms } | { type: 'missing', name } | { type: 'error', name, msg }
   Exports: (none) */
import { render } from './bank.js';
import './sounds/index.js';

const queue = []; let busy = false, SR = 48000, VARS = 99;
self.onmessage = e => {
  const m = e.data || {};
  if (m.type !== 'bake') return;
  if (m.sr) SR = m.sr; if (m.vars) VARS = m.vars;
  for (const n of (m.urgent ? m.names.slice().reverse() : m.names)) {
    const i = queue.indexOf(n); if (i >= 0) queue.splice(i, 1);
    if (m.urgent) queue.unshift(n); else queue.push(n);
  }
  if (!busy) { busy = true; setTimeout(step, 0); }
};
function step() {
  const name = queue.shift();
  if (!name) { busy = false; return; }
  try {
    const r = render(name, SR, { vars: VARS });
    if (!r) self.postMessage({ type: 'missing', name });
    else {
      const transfer = []; for (const v of r.vars) { if (Array.isArray(v)) v.forEach(c => transfer.push(c.buffer)); else transfer.push(v.buffer); }
      self.postMessage({ type: 'done', name, sr: r.sr, ch: r.ch, vars: r.vars, ms: r.ms }, transfer);
    }
  } catch (err) { self.postMessage({ type: 'error', name, msg: String(err && err.message || err) }); }
  setTimeout(step, 0);
}
