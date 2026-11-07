/* LIVE FIRE — title + main menu, practice setup, settings placeholder, in-match pause menu, results, and the App controller
   that moves between the menus and a match.
   Exports:
     startApp(LF) -> Promise    shows the title (or, with #dev&autostart, starts a match straight from the dev hash)
     App = {
       play(cfg) -> Promise<Game>   loading screen -> createGame(cfg) -> HUD -> in-match controls (Esc pause menu, click to lock)
       toMenu()                     ends + disposes the match, back to the main menu
       game                         the running Game | null
       openSettings()               settings placeholder (js/ui/settings.js replaces it)
       pause(open?)                 open / close the pause menu
     }
   Dev hash (docs §13): #dev&map=<id>&mode=<id>&bots=<n>&team=1|2&q=low&autostart&seed=<n>&nolens  (+ &skill=0..1, &warmup=s,
   &freeze=s, &time=s, &score=n, &infammo, &god, &botmode=static|passive)
   Maps: js/maps/index.js MAPS entries are playable when `ready: true` (dev_range always); others show as IN DEVELOPMENT. */
import { Settings } from '../core/settings.js';
import { Input } from '../core/input.js';
import { appBus } from '../core/events.js';
import { setScene } from '../core/loop.js';
import { UI } from './ui.js';
import { Hud } from './hud.js';
import { MAPS } from '../maps/index.js';
import { MODES } from '../modes/index.js';
import { SKILLS } from '../bots/bot.js';
import { createGame, Audio, audioReady } from '../game/game.js';
import { TEAM_NAMES } from '../game/player.js';
import { openAccount, mountAccountChip } from './account.js';
import { openRewards, decorateRewardsItem } from './rewards.js';

const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const DEV_MAP = { id: 'dev_range', name: 'Dev Range', size: 'S', time: 'day', setting: 'Engine test range: two-storey building, loading dock, terrain hill, both team lobbies.', ready: true, dev: true };
const mapList = () => [DEV_MAP, ...MAPS];
const mapReady = m => m.id === 'dev_range' || m.ready === true;
const PREF_KEY = 'lf_practice_v1';
const loadPrefs = () => { try { return JSON.parse(localStorage.getItem(PREF_KEY) || 'null') || {}; } catch (e) { return {}; } };
const savePrefs = p => { try { localStorage.setItem(PREF_KEY, JSON.stringify(p)); } catch (e) { /* private mode */ } };

let LFref = null, audioUnlocked = false;
function unlockAudio() {
  if (audioUnlocked) return; audioUnlocked = true;
  audioReady.then(A => { if (A) { try { A.init(); A.resume(); A.setVolumes && A.setVolumes({ master: Settings.get('masterVol'), sfx: Settings.get('sfxVol'), music: Settings.get('musicVol'),
    ui: Settings.get('uiVol'), voice: Settings.get('voiceVol') }); } catch (e) { /* audio is optional */ } } });
}

// ---------------------------------------------------------------------------------------------- screens
function stamp() {
  const d = new Date(), p = n => (n < 10 ? '0' : '') + n;
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + '  ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
}

function titleScreen() {
  const s = UI.screen('title', `
    <div class="mn-bg"><div class="mn-scan"></div><div class="mn-vig"></div></div>
    <div class="mn-rec"><i></i><b>REC</b><span class="mn-stamp"></span></div>
    <div class="mn-corner tl"></div><div class="mn-corner tr"></div><div class="mn-corner bl"></div><div class="mn-corner br"></div>
    <div class="mn-col"><div class="mn-title"><div class="mn-logo"><span class="mn-l1">LIVE</span><span class="mn-l2">FIRE</span></div>
      <div class="mn-tag">BODY CAMERA FOOTAGE &nbsp;//&nbsp; TACTICAL OPERATIONS</div></div>
    <nav class="menu mn-menu"></nav></div>
    <div class="mn-last"><div class="ml-h"><i></i>LAST OPERATION</div><div class="ml-map"></div><div class="ml-sub"></div>
      <button class="lf-btn primary ml-go">REDEPLOY</button></div>
    <div class="mn-foot"><span>EVIDENCE ITEM LF-0001</span><span class="mn-dev">LF-BWC 7 · BATTERY 87% · STORAGE 412 GB FREE · GPS LOCK</span><span class="mn-ver"></span></div>`, 'mn-title-screen');
  const nav = s.el.querySelector('.mn-menu');
  // one-click redeploy with the last practice setup
  const pr = Object.assign({ map: 'dev_range', mode: 'tdm', bots: 7, skill: 'normal', team: 0, infAmmo: true }, loadPrefs());
  const lm = mapList().find(m => m.id === pr.map && mapReady(m)) || DEV_MAP, lmd = MODES.find(m => m.id === pr.mode) || MODES[0];
  s.el.querySelector('.ml-map').textContent = lm.name.toUpperCase();
  s.el.querySelector('.ml-sub').textContent = (lmd.name + ' · ' + pr.bots + ' BOTS · ' + String(pr.skill).toUpperCase()).toUpperCase();
  s.el.querySelector('.ml-go').onclick = () => { unlockAudio(); App.play({ mapId: lm.id, modeId: lmd.id, bots: pr.bots, botSkill: SKILLS[pr.skill] ?? SKILLS.normal,
    local: { team: pr.team || 0, name: 'Operator' }, options: { infiniteAmmo: !!pr.infAmmo } }); };
  const items = [
    { id: 'play', n: '01', label: 'PLAY', sub: 'Practice against bots', fn: () => UI.push(practiceScreen()) },
    { id: 'multi', n: '02', label: 'MULTIPLAYER', sub: 'Server browser and private games', disabled: true },
    { id: 'armory', n: '03', label: 'ARMORY', sub: 'Loadouts and attachments', disabled: true },
    { id: 'rewards', n: '04', label: 'REWARDS', sub: 'Daily supply drop', fn: () => openRewards() },
    { id: 'settings', n: '05', label: 'SETTINGS', sub: 'Controls, video, audio', fn: () => App.openSettings() },
    { id: 'account', n: '06', label: 'ACCOUNT', sub: 'Neon Veins account, friends, leaderboards', fn: () => openAccount() },
  ];
  for (const it of items) {
    const b = h('button', 'mn-item' + (it.disabled ? ' off' : ''), '<i>' + it.n + '</i><b>' + it.label + '</b><span>' + (it.disabled ? 'IN DEVELOPMENT' : it.sub) + '</span>');
    b.dataset.id = it.id;
    b.onclick = () => { unlockAudio(); if (it.disabled) { UI.toast(it.label + ' IS IN DEVELOPMENT', { kind: 'warn' }); return; } try { Audio.ui('click'); } catch (e) { /* ok */ } it.fn(); };
    b.onmouseenter = () => { try { Audio.ui('hover'); } catch (e) { /* ok */ } };
    nav.appendChild(b);
  }
  mountAccountChip(s.el); decorateRewardsItem(s.el);     // signed-in chip (top right) + live READY / countdown on REWARDS
  s.el.querySelector('.mn-ver').textContent = 'BUILD ' + ((LFref && LFref.version) || '') ;
  const st = s.el.querySelector('.mn-stamp');
  let iv = 0;
  s.onShow = () => { st.textContent = stamp(); clearInterval(iv); iv = setInterval(() => { st.textContent = stamp(); }, 1000); };
  s.onHide = () => clearInterval(iv);
  return s;
}

function practiceScreen() {
  const prefs = Object.assign({ map: 'dev_range', mode: 'tdm', bots: 7, skill: 'normal', team: 0, infAmmo: true }, loadPrefs());
  if (!mapReady(mapList().find(m => m.id === prefs.map) || {})) prefs.map = 'dev_range';
  const s = UI.screen('practice', `
    <div class="mn-bg"><div class="mn-scan"></div><div class="mn-vig"></div></div>
    <div class="pr-head"><button class="lf-btn ghost pr-back">&larr; BACK</button><h2>PRACTICE <i>//</i> SETUP</h2><span class="pr-case">CASE FILE · OFFLINE</span></div>
    <div class="pr-body"><div class="pr-maps"><div class="pr-lbl">LOCATION</div><div class="pr-maplist"></div></div>
      <div class="pr-opts"><div class="pr-lbl">OPERATION</div><div class="pr-modes"></div>
        <div class="pr-row"><span>BOTS</span><div class="pr-bots"></div></div>
        <div class="pr-row"><span>DIFFICULTY</span><div class="pr-skill"></div></div>
        <div class="pr-row"><span>TEAM</span><div class="pr-team"></div></div>
        <div class="pr-row"><span>INFINITE AMMO</span><div class="pr-inf"></div></div>
        <div class="pr-brief"></div></div></div>
    <button class="lf-btn primary big pr-start">DEPLOY</button>`, 'pr-screen');
  const $ = q => s.el.querySelector(q);
  $('.pr-back').onclick = () => UI.pop();
  const list = $('.pr-maplist');
  const brief = () => {
    const m = mapList().find(x => x.id === prefs.map) || DEV_MAP, md = MODES.find(x => x.id === prefs.mode);
    $('.pr-brief').innerHTML = '<b>' + esc(m.name.toUpperCase()) + '</b> · ' + esc(m.size || '') + ' · ' + esc((m.time || '').toUpperCase()) + '<p>' + esc(m.setting || '') + '</p>'
      + (md ? '<b>' + esc(md.name.toUpperCase()) + '</b><p>' + esc(md.desc) + '</p>' : '');
  };
  for (const m of mapList()) {
    const ok = mapReady(m);
    const c = h('button', 'pr-map' + (ok ? '' : ' off') + (m.id === prefs.map ? ' on' : ''), '<b>' + esc(m.name) + '</b><span>' + (ok ? esc((m.size || '') + ' · ' + (m.time || '').toUpperCase()) : 'IN DEVELOPMENT') + '</span>');
    c.onclick = () => { if (!ok) { UI.toast(m.name.toUpperCase() + ' IS NOT BUILT YET', { kind: 'warn' }); return; } prefs.map = m.id; for (const e of list.children) e.classList.toggle('on', e === c); brief(); };
    list.appendChild(c);
  }
  $('.pr-modes').appendChild(UI.seg(MODES.filter(m => ['tdm', 'ffa', 'practice'].includes(m.id) || m.available).map(m => ({ id: m.id, label: m.short || m.name })), prefs.mode, v => { prefs.mode = v; brief(); }));
  $('.pr-bots').appendChild(UI.slider({ min: 0, max: 15, step: 1, value: prefs.bots, fmt: v => v, onInput: v => { prefs.bots = v; } }));
  $('.pr-skill').appendChild(UI.seg(Object.keys(SKILLS).map(k => ({ id: k, label: k.toUpperCase() })), prefs.skill, v => { prefs.skill = v; }));
  $('.pr-team').appendChild(UI.seg([{ id: 0, label: 'AUTO' }, { id: 1, label: TEAM_NAMES[1] }, { id: 2, label: TEAM_NAMES[2] }], prefs.team, v => { prefs.team = +v; }));
  $('.pr-inf').appendChild(UI.toggle(prefs.infAmmo, v => { prefs.infAmmo = v; }));
  brief();
  $('.pr-start').onclick = () => {
    unlockAudio(); savePrefs(prefs);
    App.play({ mapId: prefs.map, modeId: prefs.mode, bots: prefs.bots, botSkill: SKILLS[prefs.skill] ?? SKILLS.normal,
      local: { team: prefs.team || 0, name: 'Operator' }, options: { infiniteAmmo: !!prefs.infAmmo } });
  };
  return s;
}

function settingsScreen(inGame) {
  const s = UI.screen('settings', `
    ${inGame ? '' : '<div class="mn-bg"><div class="mn-scan"></div><div class="mn-vig"></div></div>'}
    <div class="pr-head"><button class="lf-btn ghost pr-back">&larr; BACK</button><h2>SETTINGS</h2><span class="pr-case">QUICK SETUP · FULL SETTINGS COMING</span></div>
    <div class="st-body"></div>`, 'st-screen' + (inGame ? ' ingame' : ''));
  s.el.querySelector('.pr-back').onclick = () => UI.pop();
  const body = s.el.querySelector('.st-body');
  const row = (label, node) => { const r = h('div', 'pr-row', '<span>' + label + '</span>'); r.appendChild(node); body.appendChild(r); };
  row('MOUSE SENSITIVITY', UI.slider({ min: 0.1, max: 6, step: 0.05, value: Settings.get('sens'), fmt: v => v.toFixed(2), onInput: v => Settings.set('sens', v) }));
  row('ADS SENSITIVITY', UI.slider({ min: 0.3, max: 2, step: 0.05, value: Settings.get('adsSens'), fmt: v => v.toFixed(2), onInput: v => Settings.set('adsSens', v) }));
  row('FIELD OF VIEW', UI.slider({ min: 70, max: 110, step: 1, value: Settings.get('fov'), fmt: v => v, onInput: v => Settings.set('fov', v) }));
  row('QUALITY (NEXT MATCH)', UI.seg(['auto', 'low', 'medium', 'high', 'ultra'].map(k => ({ id: k, label: k.toUpperCase() })), Settings.get('quality'), v => Settings.set('quality', v)));
  row('BODY-CAM LENS', UI.seg(['full', 'subtle', 'off'].map(k => ({ id: k, label: k.toUpperCase() })), Settings.get('lens'), v => Settings.set('lens', v)));
  row('VIEW BOB', UI.slider({ min: 0, max: 1, step: 0.05, value: Settings.get('viewBob'), fmt: v => Math.round(v * 100) + '%', onInput: v => Settings.set('viewBob', v) }));
  row('MASTER VOLUME', UI.slider({ min: 0, max: 1, step: 0.01, value: Settings.get('masterVol'), fmt: v => Math.round(v * 100) + '%', onInput: v => { Settings.set('masterVol', v); try { Audio.setVolumes({ master: v }); } catch (e) { /* ok */ } } }));
  row('CROSSHAIR COLOUR', UI.seg([['#4cff6a', 'GREEN'], ['#ffffff', 'WHITE'], ['#ffe14c', 'YELLOW'], ['#4cf0ff', 'CYAN'], ['#ff4c8a', 'PINK']].map(([id, label]) => ({ id, label })), Settings.get('crosshair.color'), v => Settings.set('crosshair.color', v)));
  row('DYNAMIC CROSSHAIR', UI.toggle(Settings.get('crosshair.dynamic'), v => Settings.set('crosshair.dynamic', v)));
  row('TOGGLE AIM', UI.toggle(Settings.get('toggleADS'), v => Settings.set('toggleADS', v)));
  row('BODY-CAM HUD', UI.toggle(Settings.get('bodycamHud'), v => Settings.set('bodycamHud', v)));
  row('SHOW FPS', UI.toggle(Settings.get('showFps'), v => Settings.set('showFps', v)));
  return s;
}

function pauseScreen() {
  const g = App.game;
  const s = UI.screen('pause', `<div class="ps-box"><div class="ps-rec"><i></i>PAUSED</div><div class="ps-title"></div><div class="ps-btns"></div>
    <div class="ps-keys">WASD MOVE · SPACE JUMP / MANTLE · CTRL CROUCH · SHIFT WALK · Q / E LEAN · R RELOAD · X FIRE MODE · F USE · G DROP · TAB SCORES</div></div>`, 'ps-screen');
  s.el.querySelector('.ps-title').textContent = g ? ((g.def && g.def.name) || g.mapId).toUpperCase() + '  ·  ' + (g.mode.name || '').toUpperCase() : '';
  const btns = s.el.querySelector('.ps-btns');
  btns.append(
    UI.button('RESUME', () => App.pause(false), 'primary'),
    UI.button('SETTINGS', () => UI.push(settingsScreen(true))),
    UI.button('QUIT TO MENU', async () => { if (await UI.confirm('Leave the match and return to the main menu?', { ok: 'QUIT', danger: true })) App.toMenu(); }, 'danger'));
  return s;
}

function resultsScreen(game, e) {
  const me = game.local, ffa = game.mode.teams === 0;
  const win = ffa ? e.winner === me.id : e.winner === me.team;
  const rows = (game.mode.score ? game.mode.score(game) : []).slice(0, 16);
  const s = UI.screen('results', `<div class="rs-box"><div class="rs-rec"><i></i>END OF RECORDING</div>
    <div class="rs-title ${win ? 'win' : 'lose'}">${win ? 'VICTORY' : e.winner ? 'DEFEAT' : 'DRAW'}</div>
    <div class="rs-score">${ffa ? '' : e.score[1] + ' <i>—</i> ' + e.score[2]}</div>
    <div class="rs-me">K <b>${me.kills}</b> · D <b>${me.deaths}</b> · A <b>${me.assists}</b> · HS <b>${me.headshots}</b> · DMG <b>${Math.round(me.damageDone)}</b></div>
    <div class="rs-table">${rows.map(r => '<div class="rs-r' + (r.id === me.id ? ' me' : '') + '"><span>' + esc(r.name) + '</span><span>' + (ffa ? '' : TEAM_NAMES[r.team]) + '</span><span>' + r.kills + ' / ' + r.deaths + ' / ' + r.assists + '</span><span>' + r.score + '</span></div>').join('')}</div>
    <div class="rs-btns"></div></div>`, 'rs-screen');
  s.el.querySelector('.rs-btns').append(UI.button('CONTINUE', () => App.toMenu(), 'primary big'));
  return s;
}

// ---------------------------------------------------------------------------------------------- controller
export const App = {
  game: null, hud: null, offs: [], loading: false,
  async play(cfg) {
    if (this.loading) return null;
    this.loading = true;
    if (this.game) this.endGame();
    UI.clear();
    const meta = mapList().find(m => m.id === cfg.mapId);
    const ld = UI.loading('DEPLOYING TO ' + ((meta && meta.name) || cfg.mapId).toUpperCase());
    let game = null;
    try {
      game = await createGame({ ...cfg, onProgress: (st, k) => ld.set(st, k) });
    } catch (e) {
      console.error('[app] match failed to start', e);
      ld.close(); this.loading = false;
      this.showMain();
      UI.modal({ title: 'COULD NOT START', body: '<p>' + esc((e && e.message) || String(e)) + '</p>' });
      return null;
    }
    ld.close();
    this.loading = false;
    this.game = game; if (LFref) LFref.game = game;
    this.hud = game.addSystem(new Hud(game));
    const canvas = document.getElementById('c');
    const onClick = () => { if (this.game && !this.game.menuOpen && !Input.locked) { unlockAudio(); Input.lock(); } };
    canvas.addEventListener('mousedown', onClick);
    this.offs = [
      () => canvas.removeEventListener('mousedown', onClick),
      Input.on((type, a) => { if (type === 'down' && a === 'menu' && this.game && !UI.find('results')) this.pause(!this.game.menuOpen); }),
      game.bus.on('match:end', e => { setTimeout(() => { if (this.game === game && !game.ended) { this.pause(false, true); Input.unlock(); game.setMenu(true); UI.push(resultsScreen(game, e)); } }, 6500); }),
      appBus.on('input:lockfail', () => UI.toast('MOUSE LOCK WAS REFUSED — CLICK THE GAME AGAIN', { kind: 'warn' })),
    ];
    return game;
  },
  pause(open = true, silent = false) {
    const g = this.game; if (!g) return;
    if (open) {
      if (g.menuOpen) return;
      g.setMenu(true); Input.unlock();
      UI.push(pauseScreen());
    } else {
      if (!silent && document.querySelector('#ui .lf-modal-wrap')) return;     // a confirm dialog is up: Esc closes it, not the menu
      while (UI.top() && ['pause', 'settings'].includes(UI.top().id)) UI.pop();
      g.setMenu(false);
      if (!silent) Input.lock();
    }
  },
  endGame() {
    for (const f of this.offs) { try { f(); } catch (e) { /* gone */ } } this.offs = [];
    const g = this.game; this.game = null; this.hud = null;
    if (g) { try { g.end('quit'); g.dispose(); } catch (e) { console.error('[app] dispose failed', e); } }
    if (LFref) LFref.game = null;
    Input.unlock(); Input.setSensMul(1);
  },
  toMenu() {
    this.endGame();
    UI.clear();
    this.showMain();
  },
  showMain() { setScene(null); UI.clear(); UI.push(titleScreen()); },
  openSettings() { UI.push(settingsScreen(false)); },
};

export async function startApp(LF) {
  LFref = LF; LF.app = Object.assign(LF.app || {}, { App, play: c => App.play(c), toMenu: () => App.toMenu(), pause: o => App.pause(o) });
  const boot = document.getElementById('boot'); if (boot) boot.style.display = 'none';
  window.addEventListener('pointerdown', unlockAudio, { once: true, capture: true });
  const D = LF.dev || {};
  if (D.dev && D.autostart) {
    const opts = {};
    if (D.infammo != null) opts.infiniteAmmo = !!D.infammo;
    if (D.warmup != null) opts.warmupTime = +D.warmup;
    if (D.freeze != null) opts.freezeTime = +D.freeze;
    if (D.time != null) opts.timeLimit = +D.time;
    if (D.score != null) opts.scoreLimit = +D.score;
    if (D.god) opts.god = true;
    if (D.botmode) opts.botMode = String(D.botmode);
    const game = await App.play({ mapId: String(D.map || 'dev_range'), modeId: String(D.mode || 'tdm'), bots: D.bots != null ? +D.bots : 6,
      botSkill: D.skill != null ? +D.skill : SKILLS.normal, seed: D.seed != null ? +D.seed : undefined, quality: D.q || undefined,
      local: { team: D.team === 1 || D.team === 2 ? D.team : 0, name: 'Operator' }, options: opts });
    if (game) return;
  }
  App.showMain();
}
