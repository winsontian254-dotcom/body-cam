/* LIVE FIRE — dev hash parameters.
   Exports: parseDev(hash) -> params, DEV (parsed once at load; DEV.dev true when the hash starts with #dev),
            devStr(name, def), devNum(name, def), devFlag(name)
   Format: #dev&map=dev_range&mode=tdm&bots=6&team=1&q=low&autostart&seed=4&nolens&peer=localhost:9000&sandbox&fps
   Bare words are flags (true); numeric values become numbers; everything else stays a string.
   Parameters are only honoured when the hash starts with "dev" (DEV.dev), so a player link can never carry them,
   except the harmless ones in PUBLIC (none yet). */

const NUM = /^-?\d+(\.\d+)?$/;
export function parseDev(hash = (typeof location !== 'undefined' ? location.hash : '')) {
  const out = { dev: false };
  const s = String(hash || '').replace(/^#/, '');
  if (!s) return out;
  const parts = s.split('&');
  out.dev = parts[0] === 'dev';
  if (!out.dev) return out;
  for (let i = 1; i < parts.length; i++) {
    const p = parts[i]; if (!p) continue;
    const eq = p.indexOf('=');
    const k = decodeURIComponent(eq < 0 ? p : p.slice(0, eq)).trim();
    if (!k || k === 'dev' || k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
    if (eq < 0) { out[k] = true; continue; }
    const v = decodeURIComponent(p.slice(eq + 1));
    out[k] = NUM.test(v) ? +v : v === 'true' ? true : v === 'false' ? false : v;
  }
  return out;
}

export const DEV = parseDev();
export const devStr = (name, def = null) => (DEV[name] == null || DEV[name] === true ? def : String(DEV[name]));
export const devNum = (name, def = 0) => (typeof DEV[name] === 'number' ? DEV[name] : def);
export const devFlag = name => !!DEV[name];
