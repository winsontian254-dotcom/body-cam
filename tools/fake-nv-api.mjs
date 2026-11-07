// A local stand-in for the Neon Veins account server: runs the REAL NEON_VIENS/server/worker.js in Node, with a fake Cloudflare D1
// database on node:sqlite (the real schema.sql), so LIVE FIRE can be tested without ever touching the production server.
//   node tools/fake-nv-api.mjs [--port=8787] [--db=file.sqlite] [--worker=path/to/worker.js]      (defaults: in-memory database)
//   import { startFakeApi } from './fake-nv-api.mjs';  const api = await startFakeApi({ port: 0 });  api.url, api.db, api.sql(q, ...args), api.stop()
// The worker is found at $NV_WORKER, --worker=, or ../NEON_VIENS/server/worker.js next to this repo (schema.sql beside it).
// Fake D1: prepare(sql).bind(...args).first(col?) / .all() / .run(), db.batch([stmts]) (one transaction), db.exec(sql);
// undefined binds as null, booleans as 0/1, run() returns meta.last_row_id / changes like D1. CF-Connecting-IP is the client address.
// Test-only extras (not part of the real server): GET /__fake/health, POST /__fake/sql { sql, args } -> { rows } (inspection).
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import url from 'node:url'; import os from 'node:os';
import { createRequire } from 'node:module';

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const require = createRequire(import.meta.url);

export function defaultWorkerPath() {
  return process.env.NV_WORKER || path.resolve(ROOT, '../NEON_VIENS/server/worker.js');
}

// ------------------------------------------------------------------------------------------------ fake D1
function bindable(v) {
  if (v === undefined || v === null) return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'number' || typeof v === 'string' || typeof v === 'bigint') return v;
  if (v instanceof Uint8Array) return v;
  return String(v);
}
const plain = r => (r == null ? null : Object.assign({}, r));
class Stmt {
  constructor(d1, sql, args = []) { this.d1 = d1; this.sql = sql; this.args = args; }
  bind(...args) { return new Stmt(this.d1, this.sql, args.map(bindable)); }
  _st() { return this.d1.db.prepare(this.sql); }
  async first(col) { const r = this._st().get(...this.args); if (r === undefined) return null; return col ? r[col] ?? null : plain(r); }
  async all() { const rows = this._st().all(...this.args).map(plain); return { results: rows, success: true, meta: { rows_read: rows.length } }; }
  async run() { const r = this._st().run(...this.args); return { success: true, results: [], meta: { last_row_id: Number(r.lastInsertRowid), changes: Number(r.changes) } }; }
  _runSync() { const r = this._st().run(...this.args); return { success: true, results: [], meta: { last_row_id: Number(r.lastInsertRowid), changes: Number(r.changes) } }; }
}
export class FakeD1 {
  constructor(file = ':memory:') {
    const { DatabaseSync } = require('node:sqlite');
    this.db = new DatabaseSync(file);
  }
  prepare(sql) { return new Stmt(this, sql); }
  async batch(stmts) {
    this.db.exec('BEGIN');
    try { const out = stmts.map(s => s._runSync()); this.db.exec('COMMIT'); return out; }
    catch (e) { this.db.exec('ROLLBACK'); throw e; }
  }
  async exec(sql) { this.db.exec(sql); return { count: 1, duration: 0 }; }
}

// ------------------------------------------------------------------------------------------------ server
async function loadWorker(file) {
  if (!fs.existsSync(file)) throw new Error('Neon Veins worker not found at ' + file + ' (set NV_WORKER or --worker=)');
  // copy to a .mjs so Node treats it as an ES module whatever package.json sits next to it
  const src = fs.readFileSync(file, 'utf8');
  const tmp = path.join(os.tmpdir(), 'nv-worker-' + process.pid + '-' + Date.now() + '.mjs');
  fs.writeFileSync(tmp, src);
  try { return (await import(url.pathToFileURL(tmp).href)).default; } finally { try { fs.unlinkSync(tmp); } catch (e) { /* ok */ } }
}

export async function startFakeApi({ port = 8787, host = '127.0.0.1', db = ':memory:', worker = defaultWorkerPath(), quiet = true } = {}) {
  const W = await loadWorker(worker);
  const d1 = new FakeD1(db);
  const schema = path.join(path.dirname(worker), 'schema.sql');
  d1.db.exec(fs.readFileSync(schema, 'utf8'));
  const env = { DB: d1 };
  const log = [];
  const server = http.createServer(async (req, res) => {
    const chunks = []; for await (const c of req) chunks.push(c);
    const body = Buffer.concat(chunks);
    const u = new URL(req.url, 'http://' + (req.headers.host || host));
    const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' };
    if (u.pathname.startsWith('/__fake/')) {      // test helpers
      if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
      try {
        if (u.pathname === '/__fake/health') { res.writeHead(200, { 'Content-Type': 'application/json', ...cors }); return res.end(JSON.stringify({ ok: true, requests: log.length })); }
        if (u.pathname === '/__fake/sql') {
          const j = JSON.parse(body.toString() || '{}');
          const rows = d1.db.prepare(j.sql).all(...(j.args || []).map(bindable)).map(plain);
          res.writeHead(200, { 'Content-Type': 'application/json', ...cors }); return res.end(JSON.stringify({ rows }));
        }
        if (u.pathname === '/__fake/log') { res.writeHead(200, { 'Content-Type': 'application/json', ...cors }); return res.end(JSON.stringify(log.slice(-200))); }
      } catch (e) { res.writeHead(400, { 'Content-Type': 'application/json', ...cors }); return res.end(JSON.stringify({ error: e.message })); }
      res.writeHead(404, cors); return res.end();
    }
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) if (v != null) headers.set(k, Array.isArray(v) ? v.join(', ') : v);
    headers.set('CF-Connecting-IP', (req.socket.remoteAddress || 'x').replace(/^::ffff:/, ''));
    const init = { method: req.method, headers };
    if (!['GET', 'HEAD'].includes(req.method) && body.length) init.body = body;
    let resp;
    try { resp = await W.fetch(new Request(u.href, init), env); }
    catch (e) { console.error('[fake-nv-api] worker threw', e); resp = new Response(JSON.stringify({ error: 'worker crashed' }), { status: 500 }); }
    log.push({ t: Date.now(), m: req.method, p: u.pathname, s: resp.status });
    if (!quiet) console.log(req.method, u.pathname, resp.status);
    const out = Buffer.from(await resp.arrayBuffer());
    const h = {}; resp.headers.forEach((v, k) => { h[k] = v; });
    res.writeHead(resp.status, h); res.end(out);
  });
  await new Promise((ok, bad) => { server.once('error', bad); server.listen(port, host, ok); });
  const real = server.address().port;
  return {
    url: 'http://' + host + ':' + real, port: real, d1, env, log,
    sql: (q, ...args) => d1.db.prepare(q).all(...args.map(bindable)).map(plain),
    stop: () => new Promise(r => { server.closeAllConnections && server.closeAllConnections(); server.close(() => r()); }),
  };
}

// ------------------------------------------------------------------------------------------------ CLI
if (process.argv[1] && path.resolve(process.argv[1]) === url.fileURLToPath(import.meta.url)) {
  const arg = (k, d) => { const a = process.argv.find(s => s.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
  process.removeAllListeners('warning');
  process.on('warning', w => { if (w.name !== 'ExperimentalWarning') console.warn(w); });
  startFakeApi({ port: +arg('port', 8787), db: arg('db', ':memory:'), worker: arg('worker', defaultWorkerPath()), quiet: !process.argv.includes('--verbose') })
    .then(a => console.log('fake Neon Veins API (real worker.js, sqlite D1) on ' + a.url + '  — point LIVE FIRE at it with #dev&api=' + a.url))
    .catch(e => { console.error(e.message); process.exit(1); });
}
