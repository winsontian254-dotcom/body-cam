// Shared Playwright helpers for LIVE FIRE tests.
//   import { launch, startServer, openGame, waitFor, shot, errors } from './lib.mjs'
// Chromium is pre-installed; headless WebGL runs on SwiftShader (slow): keep viewports small, quality low.
import { createRequire } from 'node:module'; import { spawn } from 'node:child_process'; import path from 'node:path'; import url from 'node:url'; import fs from 'node:fs';
const require = createRequire(import.meta.url); const { chromium } = require('playwright');
export const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '../..');
export const OUT = process.env.LF_OUT || path.join(ROOT, 'tools/test/out');
fs.mkdirSync(OUT, { recursive: true });
export async function startServer(port = 8000 + Math.floor(Math.random() * 900)) {
  const p = spawn(process.execPath, [path.join(ROOT, 'tools/serve.mjs'), String(port)], { stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 400)); return { port, url: 'http://localhost:' + port, stop: () => p.kill() };
}
export async function launch(opts = {}) {
  return chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required',
    '--disable-features=WebRtcHideLocalIpsWithMdns', ...(opts.args || [])], headless: opts.headless !== false });
}
// errors(page) -> array that fills with console errors / page errors / failed requests
export function errors(page) {
  const list = [];
  page.on('console', m => { if (m.type() === 'error') list.push('console: ' + m.text()); });
  page.on('pageerror', e => list.push('pageerror: ' + (e.stack || e.message)));
  page.on('requestfailed', r => list.push('requestfailed: ' + r.url() + ' ' + (r.failure() && r.failure().errorText)));
  return list;
}
export async function openGame(browser, base, hash = '', { width = 960, height = 540 } = {}) {
  const page = await browser.newPage({ viewport: { width, height } }); const errs = errors(page);
  await page.goto(base + '/index.html' + (hash ? '#' + hash.replace(/^#/, '') : ''), { waitUntil: 'load' });
  return { page, errs };
}
export const waitFor = (page, expr, timeout = 60000) => page.waitForFunction(expr, null, { timeout, polling: 250 });
export async function shot(page, name, opts = {}) { const f = path.join(OUT, name.endsWith('.png') ? name : name + '.png'); await page.screenshot({ path: f, ...opts }); return f; }
