/* LIVE FIRE — gameplay sound logic: which bank sounds a game event plays, how loud, where and when.
   Exports: createPlayer(getEngine) -> P with the gameplay functions used by js/audio/audio.js:
     P.gun(family, o) P.dry(family, o) P.reload(stage, family, o) P.step(surf, o) P.land(surf, speed, o) P.jump(o) P.impact(surf, o)
     P.whiz(o) P.hit(o) P.kill(o) P.hurt(dmg, o) P.nade(kind, stage, o) P.melee(kind, stage, o) P.sfx(name, o) P.vo(name, o)
     P.bodyfall(surf, o) P.radio(name, o) P.ui(name) P.tinnitus(secs, o) P.prepare(o) -> names, P.decoyTick()
   Every function is cheap (a few nodes per voice, no allocation beyond them) and never throws on bad input. */
import { FAMILIES, MECH_OF, weightOf } from './sounds/guns.js';
import { surfClass, SURF_CLASS, IMPACT_SURFS } from './sounds/foley.js';
import { BOOM_OF, FAR_OF, BODY_OF } from './sounds/nades.js';
import { getDef } from './bank.js';

const FAM_ALIAS = { pistol: 'pistol_9', smg: 'smg_9', rifle: 'rifle_556', carbine: 'rifle_556', br: 'br_308', dmr: 'dmr_762', sniper: 'sniper_338', shotgun: 'shotgun_12', lmg: 'lmg_556' };
const famOf = f => FAMILIES[f] ? f : FAM_ALIAS[f] || (typeof f === 'string' && FAMILIES[f.replace(/_sup$/, '')] ? f.replace(/_sup$/, '') : 'rifle_556');
const rnd = (a, b) => a + Math.random() * (b - a);
const jg = (db = 1) => Math.pow(10, rnd(-db, db) / 20);       // gain jitter in dB
const jr = (k = .025) => 1 + rnd(-k, k);                       // pitch jitter
const ss = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const dist = (E, p) => { if (!p) return 0; const L = E.L, dx = p.x - L.x, dy = (p.y == null ? L.y : p.y) - L.y, dz = p.z - L.z; return Math.sqrt(dx * dx + dy * dy + dz * dz); };
const MANUAL = { pump: 1, bolt: 1, lever: 1 };
const HARD_RIC = new Set(['concrete', 'brick', 'asphalt', 'metal', 'sheetmetal', 'tile', 'rock', 'gravel', 'marble']);
export const LOOP_OF = { smoke: 'nd:hiss', smoke_color: 'nd:hiss', gas: 'nd:gas', medic: 'nd:mist', molotov: 'nd:fire', incendiary: 'nd:fire', thermite: 'nd:sizzle',
  flare: 'nd:sizzle', dynamite: 'nd:fuse', emp: 'nd:buzz', chaff: 'nd:rustle' };
const LOOP_GAIN = { flare: .45, smoke_color: .8, emp: .7, chaff: .8, medic: .9, dynamite: 1, thermite: 1.2 };
const PIN_OF = { molotov: 'nd:strike', flare: 'nd:strike', dynamite: 'nd:strike', satchel: 'nd:arm', sticky: 'nd:arm', sensor: 'nd:arm', breach: 'nd:arm', impact: 'nd:pin', decoy: 'nd:pin' };
const NO_SPOON = new Set(['molotov', 'flare', 'dynamite', 'satchel', 'sticky', 'sensor', 'breach', 'impact']);

export function createPlayer(getE) {
  const st = { brassT: new Map(), cycT: new Map(), decoys: new Map(), spoon: new Set(), bounceT: new Map(), hbT: 0 };
  const B = () => getE().B;
  const pick = (n, sync = false) => B().pick(n, sync);
  const E = () => getE();
  const surfOf = s => SURF_CLASS[s] ? s : E().space.surface || 'concrete';

  // ---------------------------------------------------------------- guns
  function gun(family, o = {}) {
    const e = E(), f = famOf(family), F = FAMILIES[f], g = o.gun || null;
    const vel = o.velocity || (g && g.velocity) || F.vel, sup = !!(o.suppressed || (g && g.suppressed)), supersonic = vel > 345;
    const cycle = o.cycle !== undefined ? o.cycle : g ? g.cycle : null, arch = o.archetype || (g && g.archetype) || null;
    let mech = (arch && MECH_OF[arch]) || F.mech; if (MANUAL[cycle]) mech = 'none';
    const rate = jr(.03), gain = jg(1) * (o.gain || 1), id = o.id != null ? o.id : null;
    const name = (sup ? 'sup:' : 'gun:') + f;
    if (o.local || !o.pos) {
      const v = e.voice({ cls: 'gun', local: true, prio: 10, key: 'gun:local', maxSame: 5, send: 1, gain });
      if (!v) return;
      e.pump(sup ? .35 : 1);
      v.add(pick(name, true), { rate });
      if (sup && supersonic) v.add(pick('crack'), { gain: .3, at: .001 });
      v.add(pick('mech:' + mech, true), { gain: (sup ? 1.5 : 1) * (mech === 'bullpup' || mech === 'bullpup_s' ? 1.5 : 1), rate: jr(.04) });
      if (!MANUAL[cycle] && cycle !== 'break' && mech !== 'revolver' && mech !== 'none') brass(o, f, true, 0);
      if (MANUAL[cycle] && o.cycleSound !== false) manualCycle(cycle, f, g, o, true);
      return;
    }
    const d = dist(e, o.pos), far = e.space.far;
    let wn = o.distant ? 0 : 1 - ss(30, 160, d), wf = o.distant ? 1 : ss(14, 80, d) * far;
    if (sup) wf *= .35;
    const v = e.voice({ cls: 'gun', pos: o.pos, occ: o.occ, gain, prio: d < 15 ? 9 : 8, key: 'gun:' + (id != null ? id : f + Math.round(o.pos.x) + ',' + Math.round(o.pos.z)), maxSame: o.maxSame || 4 });
    if (!v) return;
    e.pump(Math.min(1, v.dg.gain.value * 1.6) * (sup ? .4 : 1), v.t0 - e.now());
    if (wn > .02) v.add(pick(name, true), { gain: wn, rate });
    if (sup && supersonic && d < 60) v.add(pick('crack'), { gain: .25 * wn, at: .001 });
    if (wf > .02) v.add(pick('far:' + f), { gain: wf * .9, rate: rate * jr(.02) });
    if (d < 10) {
      const m = e.voice({ cls: 'mech', pos: o.pos, occ: o.occ, gain: sup ? 1.2 : .8, key: 'mech:' + id, maxSame: 2 });
      if (m) m.add(pick('mech:' + mech), { rate: jr(.04) });
      if (d < 7 && !MANUAL[cycle] && cycle !== 'break' && mech !== 'revolver' && mech !== 'none') brass(o, f, false, d);
    }
    if (MANUAL[cycle] && o.cycleSound !== false && d < 25) manualCycle(cycle, f, g, o, false);
  }
  function brass(o, f, local, d) {
    const e = E(), k = local ? 'L' : (o.id != null ? o.id : 'r'), now = e.now(), last = st.brassT.get(k) || -1;
    if (now - last < .085) return;     // full auto: one casing in two is plenty
    st.brassT.set(k, now);
    const sc = surfClass(o.surf || e.space.surface), name = 'brass:' + FAMILIES[f].brass + ':' + sc;
    const v = local ? e.voice({ cls: 'brass', local: true, pan: .35 + rnd(-.1, .1), gain: .9, delay: rnd(.32, .55), key: 'brass', maxSame: 5 })
      : e.voice({ cls: 'brass', pos: { x: o.pos.x + rnd(-.8, .8), y: (o.pos.y || 1.5) - 1.4, z: o.pos.z + rnd(-.8, .8) }, delay: rnd(.32, .55), key: 'brass' });
    if (v) v.add(pick(name), { rate: jr(.06) });
  }
  function manualCycle(cycle, f, g, o, local) {
    const e = E(), I = g && g.rpm ? 60 / g.rpm : cycle === 'bolt' ? 1.3 : .85, w = weightOf(f);
    const k = local ? 'L' : o.id, now = e.now(); if (now - (st.cycT.get(k) || -9) < I * .5) return; st.cycT.set(k, now);
    const parts = cycle === 'pump' ? [['rl:pumpback', .3 * I], ['rl:pumpfwd', .55 * I]] : cycle === 'bolt' ? [['rl:boltopen:' + w, .24 * I], ['rl:boltclose:' + w, .6 * I]] : [['rl:lever', .28 * I]];
    for (const [n, at] of parts) { const v = handling(o, local, at); if (v) v.add(pick(n)); }
    const bv = local ? e.voice({ cls: 'brass', local: true, pan: .4, delay: parts[0][1] + rnd(.3, .45), key: 'brass' })
      : (o.pos && e.voice({ cls: 'brass', pos: { x: o.pos.x + rnd(-.6, .6), y: (o.pos.y || 1.5) - 1.4, z: o.pos.z + rnd(-.6, .6) }, delay: parts[0][1] + rnd(.3, .45), key: 'brass' }));
    if (bv) bv.add(pick('brass:' + FAMILIES[f].brass + ':' + surfClass(o.surf || e.space.surface)));
  }
  const handling = (o, local, delay = 0, gain = 1) => local || !o.pos ? E().voice({ cls: 'reload', local: true, pan: .2, delay, gain, prio: 7, key: 'rl:L', maxSame: 6 })
    : E().voice({ cls: 'reload', pos: o.pos, occ: o.occ, delay, gain, key: 'rl:' + o.id });
  function dry(family, o = {}) {
    const f = famOf(family || 'pistol_9'), v = handling(o, o.local !== false && !o.pos, 0, .9);
    if (v) v.add(pick(weightOf(f) === 'l' ? 'dry' : 'dry:h', true), { rate: jr(.05) });
  }
  function reload(stage, family, o = {}) {
    const f = famOf(family), w = weightOf(f), g = o.gun || null, rk = o.reloadKind || (g && g.reloadKind) || (f === 'shotgun_12' ? 'shell' : 'mag');
    const arch = o.archetype || (g && g.archetype) || '', cyc = o.cycle !== undefined ? o.cycle : g ? g.cycle : null, local = !!o.local || !o.pos;
    const L = [];   // [name, at, gain]
    switch (stage) {
      case 'cancel': return;
      case 'start': L.push(rk === 'cylinder' ? ['rl:cylopen', 0] : rk === 'belt' ? ['rl:coveropen', 0] : rk === 'break' ? ['rl:breakopen', 0] : ['rl:start:' + w, 0, .8]); break;
      case 'magout':
        if (rk === 'cylinder') { L.push(['rl:speedload', 0, .5]); const e = E(); for (let i = 0; i < 5; i++) { const v = local ? e.voice({ cls: 'brass', local: true, pan: .2, delay: .12 + i * .025 + rnd(0, .03), key: 'brass', maxSame: 6 }) : e.voice({ cls: 'brass', pos: o.pos, delay: .12 + i * .03, key: 'brass' }); if (v) v.add(pick('brass:p45:' + surfClass(o.surf || e.space.surface))); } }
        else if (rk === 'belt') L.push(['rl:magout:h', 0]);
        else if (rk === 'break') { /* shells popped out on 'start' */ }
        else if (rk === 'mag') { L.push(['rl:magout:' + w, 0]); if (o.empty && w === 'l') L.push(['rl:magdrop:' + w, .42, .7]); }
        break;
      case 'magin':
        if (rk === 'cylinder') L.push(['rl:speedload', 0]);
        else if (rk === 'belt') { L.push(['rl:magin:h', 0]); L.push(['rl:belt', .25]); }
        else if (rk === 'break') { L.push(['rl:shell', 0]); L.push(['rl:shell', .22]); }
        else L.push(['rl:magin:' + w, 0]);
        break;
      case 'shell': L.push(['rl:shell', 0]); break;
      case 'chamber':
        if (cyc === 'pump') L.push(['rl:pump', 0]); else if (cyc === 'bolt') L.push(['rl:bolt:' + w, 0]); else if (cyc === 'lever') L.push(['rl:lever', 0]);
        else if (rk === 'cylinder' || rk === 'break') { /* nothing to chamber */ }
        else if (/^pistol/.test(f) || /^pistol|revolver|machine_pistol/.test(arch)) L.push(['rl:sliderel', 0]);
        else if (/^(ar15|ar_piston|ar10|rifle_modular|rifle_polymer|sniper_semi|dmr_integral|bullpup)/.test(arch) || (!arch && /^(rifle_556|dmr|br|sniper_338)/.test(f))) L.push(['rl:boltrel:' + w, 0]);
        else L.push(['rl:charge:' + w, 0]);
        break;
      case 'end': L.push(rk === 'cylinder' ? ['rl:cylclose', 0] : rk === 'belt' ? ['rl:coverclose', 0] : rk === 'break' ? ['rl:breakclose', 0] : ['rl:end:' + w, 0, .8]); break;
      case 'draw': case 'switch': L.push(['rl:draw:' + w, 0]); break;
      case 'holster': L.push(['rl:holster:' + w, 0]); break;
      case 'inspect': L.push(['rl:inspect:' + w, 0]); break;
      default: {
        const n = ['rl:' + stage + ':' + w, 'rl:' + stage].find(x => getDef(x)); if (n) L.push([n, 0]); else return;
      }
    }
    for (const [n, at, gn] of L) { const v = handling(o, local, at, gn || 1); if (v) v.add(pick(n, true), { rate: jr(.03) }); }
  }

  // ---------------------------------------------------------------- movement
  function step(surf, o = {}) {
    const s = SURF_CLASS[surf] || SURF_CLASS[surfOf(surf)] || 'concrete';
    const loud = typeof o.speed === 'number' ? o.speed : typeof o.loud === 'number' ? o.loud : (o.speed === false || o.loud === false ? 0 : 1);
    const local = !!o.local || !o.pos;
    if (!local && loud <= 0) return;                     // walking / crouching is silent for everyone else
    const run = loud >= .6, k = (o.crouch ? .5 : 1) * (local ? (run ? .18 : .07) : (.55 + .45 * Math.min(1, loud)));
    const e = E(), opt = local ? { cls: 'step', local: true, gain: k * jg(1.5), lp: run ? 22000 : 3200, key: 'st:L', maxSame: 4 }
      : { cls: 'step', pos: o.pos, occ: o.occ, gain: k * jg(1.5), key: 'st:' + (o.id != null ? o.id : 'r'), maxSame: 3 };
    const v = e.voice(opt); if (!v) return;
    v.add(pick('st:' + s + ':h', true), { rate: jr(.06) });
    v.add(pick('st:' + s + ':t', true), { at: run ? rnd(.05, .075) : rnd(.1, .14), gain: .85, rate: jr(.06) });
    if (run && !o.crouch) v.add(pick('gear'), { at: rnd(0, .02), gain: local ? .6 : .5, rate: jr(.05) });
  }
  function land(surf, speed, o = {}) {
    const s = SURF_CLASS[surf] || 'concrete', k = Math.max(0, Math.min(1, ((+speed || 3) - 2) / 6)), local = !!o.local || !o.pos;
    const v = E().voice(local ? { cls: 'step', local: true, gain: .3 + .3 * k, prio: 8 } : { cls: 'step', pos: o.pos, occ: o.occ, gain: .7 + .5 * k, prio: 8, key: 'land:' + o.id });
    if (!v) return;
    v.add(pick('st:' + s + ':h', true), { rate: jr(.05) * (1 - .06 * k) }); v.add(pick('st:' + s + ':h', true), { at: rnd(.012, .028), gain: .75, rate: jr(.05) });
    v.add(pick('gear:heavy'), { gain: .4 + .6 * k });
    if (local && k > .55) v.add(pick('vo:exhale'), { at: .05, gain: .5 * k });
  }
  function jump(o = {}) {
    const local = !!o.local || !o.pos, v = E().voice(local ? { cls: 'step', local: true, gain: .3 } : { cls: 'step', pos: o.pos, occ: o.occ, gain: .6, key: 'jump:' + o.id });
    if (v) { v.add(pick('jump')); if (o.surf) v.add(pick('st:' + (SURF_CLASS[o.surf] || 'concrete') + ':t', true), { gain: .6 }); }
  }

  // ---------------------------------------------------------------- bullets
  function impact(surf, o = {}) {
    if (!o.pos && !o.point) return;
    const pos = o.pos || o.point, s = surf === 'flesh' ? 'flesh' : (SURF_CLASS[surf] ? (IMPACT_SURFS.includes(surf) ? surf : SURF_CLASS[surf]) : 'concrete');
    const v = E().voice({ cls: 'impact', pos, occ: o.occ, gain: jg(1.5) * (o.gain || 1), key: 'imp', minGap: .004 });
    if (!v) return;
    v.add(pick('imp:' + s, true), { rate: jr(.06) });
    const ric = o.ricochet === true || (o.ricochet !== false && HARD_RIC.has(surf) && Math.random() < .18);
    if (ric) { const r = E().voice({ cls: 'ric', pos, occ: o.occ, gain: jg(2), key: 'ric', delay: .004 }); if (r) r.add(pick('ric'), { rate: jr(.08) }); }
  }
  function whiz(o = {}) {
    const e = E(), pos = o.pos || o.point || { x: e.L.x + 1, y: e.L.y, z: e.L.z }, miss = o.miss != null ? o.miss : o.dist != null ? o.dist : dist(e, pos);
    const speed = o.speed || (o.gun && o.gun.velocity) || 850, name = o.pellet ? 'whiz:pellet' : speed > 345 ? 'whiz:super' : 'whiz:sub';
    const v = e.voice({ cls: 'whiz', pos, nodelay: true, gain: Math.max(.3, Math.min(1, 1.35 - miss / 1.8)), key: 'whiz', minGap: .02, ref: 2, max: 30 });
    if (v) v.add(pick(name, true), { rate: jr(.08) });
  }
  function hit(o = {}) {
    const name = o.head ? (o.armor || o.helmet ? 'hit:helmet' : 'hit:head') : o.armor ? 'hit:armor' : 'hit:body';
    if (o.pos && !o.local) { const v = E().voice({ cls: 'hit', pos: o.pos, occ: o.occ, gain: jg(1), key: 'hit' }); if (v) v.add(pick(name, true), { rate: jr(.05) }); return; }
    const v = E().voice({ cls: 'hit', local: true, gain: .5, prio: 9, key: 'hitL', maxSame: 3, minGap: .03 });
    if (v) { v.add(pick(name, true), { rate: jr(.04) }); v.add(pick('hit:tick', true), { gain: o.head ? .8 : .55, at: .004 }); }
  }
  function kill(o = {}) { const v = E().voice({ cls: 'hit', bus: 'sfx', local: true, prio: 9, gain: 1, key: 'kill', minGap: .05 }); if (v) v.add(pick(o.head ? 'kill:head' : 'kill', true)); }
  function hurt(dmg, o = {}) {
    dmg = +dmg || 0; if (dmg <= 0) return;
    const lvl = dmg < 20 ? 's' : dmg < 50 ? 'm' : 'l', v = E().voice({ cls: 'hit', local: true, prio: 9, gain: 1, key: 'hurt', minGap: .06 });
    if (v) v.add(pick('hurt:' + lvl, true), { rate: jr(.04) });
    if (o.low || o.hp != null && o.hp < 30) heartbeat();
  }
  function heartbeat() { const e = E(), t = e.now(); if (t - st.hbT < 2) return; st.hbT = t; for (let i = 0; i < 3; i++) { const v = e.voice({ cls: 'hit', local: true, gain: .7 - i * .15, delay: i * .8, prio: 6 }); if (v) v.add(pick('sfx:heartbeat')); } }

  // ---------------------------------------------------------------- grenades
  function nade(kind, stage, o = {}) {
    const e = E(), k = String(kind || 'frag'), pos = o.pos || null, local = !!o.local && !pos, id = o.id != null ? 'nd:' + o.id : null;
    const at = local ? { cls: 'nade', local: true } : { cls: 'nade', pos, occ: o.occ };
    const one = (n, a = {}, cls) => { const v = e.voice({ ...at, ...(cls ? { cls } : {}), gain: (a.gain || 1) * jg(1), key: a.key, minGap: a.minGap }); if (v) v.add(pick(n, a.sync), { rate: a.rate || jr(.03) }); return v; };
    switch (stage) {
      case 'pin': prepareNade(k); one(PIN_OF[k] || 'nd:pin', { sync: true }); if (k === 'dynamite' && id) startLoop(id, 'nd:fuse', pos, 1, o); return;
      case 'spoon': if (!NO_SPOON.has(k)) { one('nd:spoon'); if (id) st.spoon.add(id); } return;
      case 'throw': prepareNade(k); one('nd:throw'); if (!NO_SPOON.has(k) && !(id && st.spoon.has(id))) { const v = e.voice({ ...at, gain: .8, delay: .06 }); if (v) v.add(pick('nd:spoon')); } return;
      case 'bounce': {
        const sp = o.speed != null ? +o.speed : 5, g = Math.max(.12, Math.min(1, sp / 8)), kk = id || 'b', t = e.now();
        if (t - (st.bounceT.get(kk) || -1) < .05 || sp < .4) return; st.bounceT.set(kk, t);
        one('nd:bounce:' + (BODY_OF[k] || 'can') + ':' + surfClass(o.surf || e.space.surface), { gain: g, rate: jr(.06) }); if (id && LOOP_OF[k] && e.loops.has(id)) e.moveLoop(id, pos); return;
      }
      case 'stick': one('nd:stick'); return;
      case 'beep': one('nd:beep', { rate: 1, key: 'beep' + id, minGap: .05 }); return;
      case 'ping': one('nd:ping', { rate: 1 }); return;
      case 'arm': one('nd:arm', { rate: 1 }); return;
      case 'detonate': case 'clacker': one('nd:clacker'); return;
      case 'bomblet': boom('bomblet', pos, o); return;
      case 'loop': if (k === 'decoy') return decoy(id || 'nd:decoy', pos, o); if (LOOP_OF[k] && id) startLoop(id, LOOP_OF[k], pos, LOOP_GAIN[k] || 1, o); else if (id && pos) e.moveLoop(id, pos); return;
      case 'move': if (id && pos) e.moveLoop(id, pos); return;
      case 'end': if (id) { e.stopLoop(id, k === 'dynamite' ? .05 : 1.2); stopDecoy(id); st.spoon.delete(id); st.bounceT.delete(id); } if (k === 'decoy' || k === 'sensor') one('nd:decoypop'); return;
      case 'boom': {
        if (id) { if (k === 'dynamite') e.stopLoop(id, .03); stopDecoy(id); st.spoon.delete(id); }
        if (BOOM_OF[k]) return boom(BOOM_OF[k], pos, o, k === 'cluster' ? 'nd:split' : null);
        if (k === 'flash') return blast('nd:flash', pos, o);
        if (k === 'ninebang') return blast('nd:flash:small', pos, o);
        const ONE = { smoke: 'nd:pop', smoke_color: 'nd:pop', gas: 'nd:pop', medic: 'nd:pop', molotov: 'nd:molotov', incendiary: 'nd:incend', thermite: 'nd:thermite',
          stun: 'nd:zap', emp: 'nd:emp', chaff: 'nd:chaff', sensor: 'nd:stick', flare: null, decoy: 'nd:pop' };
        const n = ONE[k]; if (n) one(n, { sync: false }, k === 'molotov' || k === 'emp' || k === 'stun' ? 'boom' : 'nade');
        if (LOOP_OF[k] && id) startLoop(id, LOOP_OF[k], pos, LOOP_GAIN[k] || 1, o);
        if (k === 'decoy') decoy(id || 'nd:decoy', pos, o);
        return;
      }
    }
  }
  function startLoop(id, name, pos, gain, o) {
    const e = E(); if (e.loops.has(id)) { e.moveLoop(id, pos); return; }
    const start = () => { if (!st.loopWanted || !st.loopWanted.has(id)) return; e.loop(id, B().get(name), { cls: 'loop', pos, local: !pos, gain, fadeIn: .25, life: Math.min(120, (o.duration || 60) + 5) }); };
    (st.loopWanted || (st.loopWanted = new Set())).add(id);
    if (B().has(name)) start(); else B().request([name], true).then(start);
  }
  function boom(size, pos, o, extra) {
    const e = E(), d = dist(e, pos), wn = 1 - ss(60, 300, d), wf = ss(25, 140, d) * Math.max(.5, e.space.far);
    const v = e.voice({ cls: 'boom', pos, occ: o.occ, gain: jg(.8) * (o.gain || 1), local: !pos, key: 'boom', prio: 9 });
    if (!v) return;
    e.pump(Math.min(1, v.dg.gain.value * 2), v.t0 - e.now());
    if (wn > .02) v.add(pick('nd:boom:' + size), { gain: wn, rate: jr(.04) });
    if (wf > .02) v.add(pick('nd:boomfar:' + FAR_OF[size]), { gain: wf, rate: jr(.04) });
    if (extra) v.add(pick(extra), { gain: .9 });
  }
  function blast(name, pos, o) { const v = E().voice({ cls: 'boom', pos, occ: o.occ, gain: jg(.8), local: !pos, key: 'flash', maxSame: 4 }); if (v) v.add(pick(name), { rate: jr(.04) }); }
  function prepareNade(k) {
    const n = []; if (BOOM_OF[k]) { n.push('nd:boom:' + BOOM_OF[k], 'nd:boomfar:' + FAR_OF[BOOM_OF[k]]); }
    if (k === 'flash') n.push('nd:flash'); if (k === 'ninebang') n.push('nd:flash:small'); if (LOOP_OF[k]) n.push(LOOP_OF[k]);
    const ONE = { molotov: 'nd:molotov', incendiary: 'nd:incend', thermite: 'nd:thermite', stun: 'nd:zap', emp: 'nd:emp', chaff: 'nd:chaff', cluster: 'nd:split' }; if (ONE[k]) n.push(ONE[k]);
    if (k === 'cluster') n.push('nd:boom:bomblet');
    n.push('nd:bounce:' + (BODY_OF[k] || 'can') + ':' + surfClass(E().space.surface));
    B().request(n, true);
  }
  // decoy: plays bursts of a gun family at the canister until 'end' (or its duration); scheduled in 1 s windows on the audio clock
  function decoy(id, pos, o) {
    const e = E(), fam = famOf(o.family || 'rifle_556'), dur = o.duration || 15, rpm = (o.gun && o.gun.rpm) || 650;
    stopDecoy(id); const D = { id, pos, fam, until: e.now() + dur, next: e.now() + .4, rpm, offline: e.offline };
    st.decoys.set(id, D); decoyTick(); if (!e.offline && !st.decoyTimer) st.decoyTimer = setInterval(decoyTick, 250);
  }
  function decoyTick() {
    const e = E(), now = e.now(), horizon = e.offline ? 1e9 : now + 1;
    for (const D of st.decoys.values()) {
      while (D.next < Math.min(horizon, D.until)) {
        const n = 2 + Math.floor(Math.random() * 5), iv = 60 / D.rpm;
        for (let i = 0; i < n; i++) { const save = e.tOff; e.tOff = D.next + i * iv - e.ctx.currentTime; gun(D.fam, { pos: D.pos, id: D.id, gain: .85, maxSame: 16 }); e.tOff = save; }
        D.next += n * iv + rnd(.35, 1.6);
      }
      if (now > D.until) st.decoys.delete(D.id);
    }
    if (!st.decoys.size && st.decoyTimer) { clearInterval(st.decoyTimer); st.decoyTimer = null; }
  }
  function stopDecoy(id) { if (st.decoys.has(id)) { st.decoys.delete(id); const e = E(); for (const v of e.voices.slice()) if (v.key === 'gun:' + id && v.t0 > e.now()) v.stop(.01); } }

  // ---------------------------------------------------------------- misc
  function melee(kind, stage, o = {}) {
    const kk = { knife: 'knife', machete: 'machete', axe: 'axe', tomahawk: 'axe' }[kind] || 'knife', name = stage === 'stab' ? 'ml:stab' : stage === 'hit' && o.surf && o.surf !== 'flesh' ? 'ml:wall:' + kk : 'ml:' + (stage || 'swing') + ':' + kk;
    const v = o.pos && !o.local ? E().voice({ cls: 'hit', pos: o.pos, occ: o.occ, key: 'ml:' + o.id }) : E().voice({ cls: 'hit', local: true, pan: .15, prio: 8, key: 'ml:L' });
    if (v) v.add(pick(name, true), { rate: jr(.05) });
  }
  function sfx(name, o = {}) {
    const n = name.includes(':') ? name : 'sfx:' + name;
    const v = o.pos && !o.local ? E().voice({ cls: o.cls || 'world', pos: o.pos, occ: o.occ, gain: o.gain || 1, key: n, minGap: o.minGap || .02 }) : E().voice({ cls: o.cls || 'world', local: true, gain: o.gain || 1, key: n, minGap: o.minGap || .02, prio: 8 });
    if (v) v.add(pick(n), { rate: o.rate || 1 });
    return !!v;
  }
  function vo(name, o = {}) { const v = o.pos && !o.local ? E().voice({ cls: 'vo', pos: o.pos, occ: o.occ, key: 'vo:' + o.id, maxSame: 1 }) : E().voice({ cls: 'vo', local: true, gain: .7 }); if (v) v.add(pick('vo:' + name), { rate: jr(.06) }); }
  function bodyfall(surf, o = {}) { const v = o.pos ? E().voice({ cls: 'world', pos: o.pos, occ: o.occ, key: 'fall' }) : E().voice({ cls: 'world', local: true }); if (v) v.add(pick('fall:' + surfClass(surf)), { rate: jr(.05) }); }
  function radio(name, o = {}) { const n = 'radio:' + String(name || 'chatter').toLowerCase().replace(/[^a-z0-9_]/g, '_'); const v = o.pos ? E().voice({ cls: 'vo', bus: 'voice', pos: o.pos, key: n, minGap: .8 }) : E().voice({ cls: 'vo', bus: 'voice', local: true, prio: 8, key: n, minGap: .8 }); if (v) v.add(pick(n)); }
  function ui(name) { const v = E().voice({ cls: 'world', bus: 'ui', local: true, prio: 10, send: 0, key: 'ui:' + name, minGap: name === 'hover' ? .03 : .012, maxSame: 3 }); if (v) v.add(pick('ui:' + name, true)); }
  function tinnitus(secs, o = {}) {
    const e = E(); secs = Math.max(.2, Math.min(12, +secs || 2)); const k = Math.max(.2, Math.min(1, o.k == null ? Math.min(1, .35 + secs / 5) : o.k));
    e.deafen(secs, k);
    const c = e.ctx, t = c.currentTime, g = c.createGain(); g.gain.value = 0; g.connect(e.ringBus);
    const lvl = .055 * k, f = 3800 + Math.random() * 500;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(lvl, t + .04); g.gain.setTargetAtTime(0, t + .04 + secs * .25, secs / 3.2);
    const end = t + secs * 1.6 + .5;
    for (const [fr, a] of [[f, 1], [f * 1.0016, .7], [f * 2.003, .08]]) { const s = c.createOscillator(), gg = c.createGain(); s.frequency.value = fr; gg.gain.value = a; s.connect(gg); gg.connect(g); s.start(t); s.stop(end); s.onended = () => { try { gg.disconnect(); } catch (er) { /* ok */ } }; }
    const tex = B().get('tin'); if (tex) { const s = c.createBufferSource(); s.buffer = tex[0]; s.loop = true; const gg = c.createGain(); gg.gain.value = 1.2; s.connect(gg); gg.connect(g); s.start(t); s.stop(end); }
    setTimeout(() => { try { g.disconnect(); } catch (er) { /* ok */ } }, (secs * 1.6 + 1) * 1000);
  }
  function prepare(o = {}) {
    const n = [];
    for (const f of o.families || o.guns || []) { const ff = famOf(f), w = weightOf(ff); n.push('gun:' + ff, 'sup:' + ff, 'far:' + ff, 'mech:' + FAMILIES[ff].mech, ...['magout', 'magin', 'start', 'end', 'charge', 'boltrel', 'draw'].map(s => 'rl:' + s + ':' + w), 'rl:sliderel', 'rl:pump', 'rl:shell', 'rl:pumpback', 'rl:pumpfwd');
      for (const s of ['hard', 'metal', 'wood', 'soft']) n.push('brass:' + FAMILIES[ff].brass + ':' + s); }
    for (const k of o.nades || []) prepareNade(k);
    return n.length ? B().request(n) : Promise.resolve();
  }
  return { gun, dry, reload, step, land, jump, impact, whiz, hit, kill, hurt, heartbeat, nade, melee, sfx, vo, bodyfall, radio, ui, tinnitus, prepare, decoyTick,
    _st: st };
}
