/* LIVE FIRE — UI helpers: a screen stack in #ui, modals, confirm, toasts, tabs, small form widgets.
   Exports:
     UI = {
       root                       the #ui element
       push(screen) -> screen     show a screen on top (the one below is hidden but kept); screen = { id, el, onShow?, onHide?, onBack? }
       pop() -> screen|null       remove the top screen (onHide) and show the one below
       replace(screen)            pop + push;  clear() removes every screen;  top() -> screen|null;  find(id)
       screen(id, html?, cls?) -> { id, el }      make a screen element (data-screen=id, class 'lf-screen ' + cls)
       modal({ title, body (html | Node), buttons: [{ label, value, primary, danger }], dismiss = true }) -> Promise<value|null>
       confirm(text, { title, ok = 'CONFIRM', cancel = 'CANCEL', danger }) -> Promise<bool>
       toast(text, { kind: 'info'|'ok'|'warn'|'error', ms = 2600 })
       tabs(items [{ id, label }], onSelect(id), active?) -> Node
       seg(items [{ id, label, disabled }], value, onChange) -> Node     segmented control
       slider({ min, max, step, value, fmt, onInput }) -> Node
       toggle(value, onChange, labels?) -> Node
       button(label, onClick, cls?) -> HTMLButtonElement
       loading(title) -> { set(stage, k), close() }     full-screen loading panel
     }
   Every screen element gets the class 'lf-screen'; styles live in css/menu.css. appBus 'screen' { id } on every change. */
import { appBus } from '../core/events.js';

const root = () => document.getElementById('ui');
const stack = [];
let toastBox = null;

function emitScreen() { const t = stack[stack.length - 1]; appBus.emit('screen', { id: t ? t.id : null }); }
function h(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }

export const UI = {
  get root() { return root(); },
  screen(id, html, cls = '') {
    const el = h('div', 'lf-screen ' + cls, html); el.dataset.screen = id;
    return { id, el };
  },
  push(s) {
    const top = stack[stack.length - 1];
    if (top) { top.el.classList.add('lf-hidden'); }
    stack.push(s); root().appendChild(s.el); s.el.classList.remove('lf-hidden');
    if (s.onShow) { try { s.onShow(); } catch (e) { console.error(e); } }
    emitScreen(); return s;
  },
  pop() {
    const s = stack.pop(); if (!s) return null;
    if (s.onHide) { try { s.onHide(); } catch (e) { console.error(e); } }
    s.el.remove();
    const top = stack[stack.length - 1];
    if (top) { top.el.classList.remove('lf-hidden'); if (top.onShow) { try { top.onShow(); } catch (e) { console.error(e); } } }
    emitScreen(); return s;
  },
  replace(s) { this.pop(); return this.push(s); },
  clear() { while (stack.length) { const s = stack.pop(); if (s.onHide) { try { s.onHide(); } catch (e) { console.error(e); } } s.el.remove(); } emitScreen(); },
  top() { return stack[stack.length - 1] || null; },
  find(id) { return stack.find(s => s.id === id) || null; },

  modal({ title = '', body = '', buttons = [{ label: 'OK', value: true, primary: true }], dismiss = true, cls = '' } = {}) {
    return new Promise(resolve => {
      const wrap = h('div', 'lf-modal-wrap ' + cls);
      const box = h('div', 'lf-modal');
      if (title) box.appendChild(h('div', 'lf-modal-title', title));
      const b = h('div', 'lf-modal-body'); if (typeof body === 'string') b.innerHTML = body; else if (body) b.appendChild(body); box.appendChild(b);
      const row = h('div', 'lf-modal-btns');
      const done = v => { wrap.remove(); window.removeEventListener('keydown', key, true); resolve(v); };
      for (const bt of buttons) {
        const e = this.button(bt.label, () => done(bt.value), (bt.primary ? 'primary ' : '') + (bt.danger ? 'danger' : ''));
        row.appendChild(e);
      }
      box.appendChild(row); wrap.appendChild(box);
      const key = e => {
        if (e.key === 'Escape' && dismiss) { e.preventDefault(); e.stopPropagation(); done(null); }
        else if (e.key === 'Enter') { const p = buttons.find(x => x.primary); if (p) { e.preventDefault(); done(p.value); } }
      };
      window.addEventListener('keydown', key, true);
      if (dismiss) wrap.addEventListener('mousedown', e => { if (e.target === wrap) done(null); });
      root().appendChild(wrap);
      const first = row.querySelector('.primary') || row.querySelector('button'); if (first) first.focus();
    });
  },
  async confirm(text, o = {}) {
    const v = await this.modal({ title: o.title || 'CONFIRM', body: '<p>' + text + '</p>', buttons: [
      { label: o.cancel || 'CANCEL', value: false }, { label: o.ok || 'CONFIRM', value: true, primary: true, danger: !!o.danger }] });
    return v === true;
  },
  toast(text, { kind = 'info', ms = 2600 } = {}) {
    if (!toastBox || !toastBox.isConnected) { toastBox = h('div', 'lf-toasts'); document.getElementById('app').appendChild(toastBox); }
    const t = h('div', 'lf-toast ' + kind); t.textContent = text;
    toastBox.appendChild(t);
    requestAnimationFrame(() => t.classList.add('in'));
    setTimeout(() => { t.classList.remove('in'); setTimeout(() => t.remove(), 300); }, ms);
  },
  tabs(items, onSelect, active) {
    const row = h('div', 'lf-tabs');
    const set = id => { for (const b of row.children) b.classList.toggle('on', b.dataset.id === id); };
    for (const it of items) { const b = h('button', 'lf-tab', it.label); b.dataset.id = it.id; b.onclick = () => { set(it.id); onSelect(it.id); }; row.appendChild(b); }
    set(active || (items[0] && items[0].id));
    return row;
  },
  seg(items, value, onChange) {
    const row = h('div', 'lf-seg');
    const set = v => { for (const b of row.children) b.classList.toggle('on', b.dataset.id === String(v)); };
    for (const it of items) {
      const b = h('button', 'lf-seg-b' + (it.disabled ? ' off' : ''), it.label); b.dataset.id = String(it.id); b.disabled = !!it.disabled;
      if (it.title) b.title = it.title;
      b.onclick = () => { if (it.disabled) return; set(it.id); onChange(it.id); };
      row.appendChild(b);
    }
    set(value); row.set = set;
    return row;
  },
  slider({ min = 0, max = 1, step = 0.01, value = 0, fmt = v => v, onInput } = {}) {
    const wrap = h('div', 'lf-slider');
    const r = h('input'); r.type = 'range'; r.min = min; r.max = max; r.step = step; r.value = value;
    const out = h('span', 'lf-slider-v', String(fmt(+value)));
    r.oninput = () => { out.textContent = String(fmt(+r.value)); if (onInput) onInput(+r.value); };
    wrap.append(r, out); wrap.input = r;
    return wrap;
  },
  toggle(value, onChange, labels = ['OFF', 'ON']) {
    return this.seg([{ id: 'false', label: labels[0] }, { id: 'true', label: labels[1] }], String(!!value), v => onChange(v === 'true'));
  },
  button(label, onClick, cls = '') {
    const b = h('button', 'lf-btn ' + cls, label);
    b.onclick = e => { e.preventDefault(); onClick && onClick(e); };
    return b;
  },
  loading(title) {
    const s = this.screen('loading', '<div class="lf-load"><div class="lf-load-rec"><i></i>REC</div><div class="lf-load-title"></div>'
      + '<div class="lf-load-bar"><b></b></div><div class="lf-load-stage">INITIALISING</div></div>', 'lf-loading');
    s.el.querySelector('.lf-load-title').textContent = title;
    root().appendChild(s.el);
    const bar = s.el.querySelector('.lf-load-bar b'), st = s.el.querySelector('.lf-load-stage');
    return {
      el: s.el,
      set(stage, k) { if (stage) st.textContent = String(stage).toUpperCase(); if (k != null) bar.style.width = Math.round(Math.max(0, Math.min(1, k)) * 100) + '%'; },
      close() { s.el.remove(); },
    };
  },
};
