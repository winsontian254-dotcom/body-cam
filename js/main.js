/* LIVE FIRE — boot: settings -> engine -> input -> loop -> (sandbox | app); window.LF.
   Exports: (none; side effects only). Structure, so CORE B can drop the real Game / menu in:
     boot()        loads the core modules, starts the engine and the loop, sets window.LF, then calls startApp()
     startApp()    #dev&sandbox -> core/sandbox.js; otherwise js/ui/menu.js startApp (title / menu / matches; #dev&autostart)
     fatal(err)    shows the error on the #boot overlay (Babylon missing, WebGL 2 missing, a module failing to load)
   window.LF = { app, engine, settings, input, loop, bus, dev, game (null until a match), sandbox?, version, account, profile, rewards, audio } */

const VERSION = '0.2.0';
const bootEl = document.getElementById('boot');

function setBoot(text) { if (bootEl) { bootEl.classList.remove('err'); bootEl.textContent = text; } }
function fatal(err) {
  const msg = (err && err.message) || String(err);
  console.error('[boot] ' + msg, err);
  if (!bootEl) return;
  bootEl.classList.add('err');
  bootEl.style.display = '';
  bootEl.innerHTML = '<div class="boot-box"><b>LIVE FIRE could not start</b><p></p><small>Reload the page to try again. If it keeps happening, '
    + 'update your browser and make sure hardware acceleration (WebGL 2) is on.</small></div>';
  bootEl.querySelector('p').textContent = msg;
}
function hideBoot() { if (bootEl) bootEl.style.display = 'none'; }

let booted = false;
window.addEventListener('error', e => { if (!booted) fatal(e.error || e.message); });
window.addEventListener('unhandledrejection', e => { if (!booted) fatal(e.reason); });

async function boot() {
  setBoot('LOADING…');
  if (typeof BABYLON === 'undefined' || !BABYLON.Engine) throw new Error('Babylon.js did not load (cdn.jsdelivr.net unreachable?).');
  const [{ Settings }, { appBus }, eng, loop, { Input }, { DEV }] = await Promise.all([
    import('./core/settings.js'), import('./core/events.js'), import('./core/engine.js'), import('./core/loop.js'),
    import('./core/input.js'), import('./core/dev.js')]);
  const canvas = document.getElementById('c');
  const { engine } = await eng.bootEngine(canvas);
  Input.attach(canvas);
  loop.startLoop(engine);
  const LF = window.LF = { version: VERSION, app: { version: VERSION, startApp }, engine, settings: Settings, input: Input, loop, bus: appBus, dev: DEV, game: null };
  appBus.on('gpu:lost', () => setNote('Graphics context lost — restoring…'));
  appBus.on('gpu:restored', () => setNote(''));
  // audio: LF.audio; the AudioContext starts on the first user gesture (init() only arms the listeners before that)
  import('./audio/audio.js').then(({ Audio }) => { LF.audio = Audio; Audio.init(); }).catch(e => console.warn('[audio] unavailable', e));
  // accounts (shared Neon Veins login), progression + cloud sync, daily rewards: synchronous init, network in the background
  try {
    const [{ Account }, { Profile }, { Rewards }] = await Promise.all([import('./account/api.js'), import('./account/profile.js'), import('./account/rewards.js')]);
    LF.account = Account.init(); LF.profile = Profile.init(); LF.rewards = Rewards;
    Profile.autoTrack(LF);                                   // records the local player's match at 'match:end' (Profile.lastMatch)
  } catch (e) { console.warn('[account] unavailable', e); }
  await startApp(LF);
  import('./ui/account.js').then(m => m.installAccountUI()).catch(e => console.warn('[account] ui unavailable', e));
  booted = true;
  hideBoot();
}

function setNote(text) {
  let n = document.getElementById('note');
  if (!n) { n = document.createElement('div'); n.id = 'note'; document.body.appendChild(n); }
  n.textContent = text; n.style.display = text ? '' : 'none';
}

async function startApp(LF) {
  const DEV = LF.dev;
  if (DEV.dev && DEV.sandbox) {
    setBoot('BUILDING ' + String(DEV.map || 'dev_range').toUpperCase() + '…');
    const { startSandbox } = await import('./core/sandbox.js');
    LF.sandbox = await startSandbox({ engine: LF.engine, canvas: document.getElementById('c'), mapId: String(DEV.map || 'dev_range'), quality: DEV.q || 'low' });
    return;
  }
  // the real title / menu / match controller (js/ui/menu.js); #dev&autostart starts a match from the dev hash
  setBoot('LOADING MENU…');
  const menu = await import('./ui/menu.js');
  await menu.startApp(LF);
}

boot().catch(fatal);
