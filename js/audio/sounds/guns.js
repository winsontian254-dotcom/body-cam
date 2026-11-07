/* LIVE FIRE — gun sounds (pure DSP recipes registered in the bank).
   Exports: FAMILIES (the 15 gun families of docs §9 with their acoustic parameters), MECH_OF (gun archetype -> action noise),
            BRASS_OF (family -> casing), weightOf(family) -> 'l' | 'm' | 'h'
   Bank names:
     gun:<family>         close report (crack / blast / body / thump / near reflections), 4 variants
     sup:<family>         suppressed report (no ballistic crack: added at run time from 'crack' when the round is supersonic)
     far:<family>         the same shot heard from far away: low-passed, dispersed, rolling echoes (half rate)
     crack                ballistic N-wave of a supersonic bullet heard near its path (suppressed rifles)
     mech:<type>          the action cycling (slide, ar, ak, smg, roller, lmg, bullpup...) — heard by the shooter / close by
     brass:<case>:<surf>  ejected casing landing and bouncing (p p45 r rl b50 sh  x  hard metal wood soft water)
     rl:<stage>[:<w>]     reload / handling stages (see STAGES), w = weight class l | m | h
     dry, dry:h           dry fire (striker / hammer)
     ml:<act>:<kind>      melee (swing / hit / wall / draw) for knife, machete, axe
   Physics notes: a close gunshot is a Friedlander pressure pulse (instant rise, positive phase ~0.5-2.5 ms by calibre) plus
   turbulent blast noise, decaying resonances of the gun and near surroundings, the supersonic bullet's N-wave (rifles), a ground
   reflection a few ms later, and a short roar of the expanding gas. Real recordings saturate: a tanh stage adds that density. */
import { def } from '../bank.js';
import * as D from '../dsp.js';

const j = (R, k) => 1 + (R() * 2 - 1) * k;

// T: positive phase (s), A: Friedlander decay, col: blast colour (Hz), body: [[Hz, tau, amp]], low: thump [Hz, tau, amp],
// crack: N-wave amount (supersonic), drive: saturation, tail: near roar tau, farT: rolling tail length, vel: m/s
export const FAMILIES = {
  pistol_9:   { T: .00045, A: 1.6, col: 2300, colQ: .9, body: [[330, .02, .55], [980, .011, .5], [2500, .006, .35]], low: [150, .016, .55], crack: .25, drive: 2.2, tail: .035, farT: 1.3, vel: 360, brass: 'p', mech: 'slide' },
  pistol_45:  { T: .0006, A: 1.4, col: 1650, colQ: .8, body: [[260, .026, .7], [780, .014, .5], [1950, .007, .3]], low: [118, .022, .75], crack: 0, drive: 2.2, tail: .042, farT: 1.4, vel: 260, brass: 'p45', mech: 'slide_h' },
  pistol_mag: { T: .00075, A: 1.3, col: 1900, colQ: .8, body: [[230, .03, .8], [820, .016, .55], [2300, .008, .42]], low: [104, .028, .85], crack: .6, drive: 2.8, tail: .06, farT: 1.7, vel: 450, brass: 'p45', mech: 'slide_h' },
  smg_9:      { T: .00048, A: 1.6, col: 2450, colQ: .9, body: [[360, .017, .5], [1080, .01, .45], [2650, .005, .3]], low: [155, .014, .45], crack: .3, drive: 2.0, tail: .03, farT: 1.25, vel: 390, brass: 'p', mech: 'smg' },
  smg_45:     { T: .00062, A: 1.4, col: 1650, colQ: .8, body: [[270, .022, .65], [800, .012, .45], [1900, .006, .28]], low: [122, .02, .65], crack: 0, drive: 2.0, tail: .036, farT: 1.3, vel: 280, brass: 'p45', mech: 'smg_h' },
  rifle_556:  { T: .0009, A: 1.5, col: 1350, colQ: .7, body: [[175, .034, .8], [560, .02, .62], [1600, .01, .45], [3300, .005, .25]], low: [112, .03, .75], crack: 1, drive: 3.0, tail: .07, farT: 1.9, vel: 900, brass: 'r', mech: 'ar' },
  rifle_545:  { T: .00088, A: 1.5, col: 1500, colQ: .75, body: [[190, .032, .75], [610, .019, .6], [1750, .01, .45], [3500, .005, .25]], low: [116, .028, .7], crack: 1, drive: 3.0, tail: .07, farT: 1.9, vel: 880, brass: 'r', mech: 'ak' },
  rifle_762:  { T: .00112, A: 1.4, col: 1060, colQ: .7, body: [[150, .04, .9], [470, .024, .66], [1300, .012, .5], [2800, .006, .25]], low: [96, .036, .9], crack: .85, drive: 3.2, tail: .085, farT: 2.1, vel: 715, brass: 'r', mech: 'ak' },
  br_308:     { T: .00125, A: 1.4, col: 980, colQ: .7, body: [[140, .042, .95], [440, .026, .7], [1200, .013, .5], [2700, .006, .25]], low: [88, .04, 1], crack: 1, drive: 3.4, tail: .095, farT: 2.3, vel: 820, brass: 'rl', mech: 'roller' },
  dmr_762:    { T: .0013, A: 1.4, col: 940, colQ: .7, body: [[135, .045, .95], [420, .027, .7], [1150, .013, .5], [2600, .006, .25]], low: [84, .042, 1], crack: 1, drive: 3.4, tail: .1, farT: 2.4, vel: 830, brass: 'rl', mech: 'ar_h' },
  sniper_338: { T: .0016, A: 1.3, col: 860, colQ: .65, body: [[120, .05, 1], [380, .03, .75], [1050, .015, .5], [2400, .007, .25]], low: [74, .05, 1.15], crack: 1, drive: 3.6, tail: .13, farT: 2.8, vel: 900, brass: 'rl', mech: 'none' },
  sniper_50:  { T: .0025, A: 1.2, col: 680, colQ: .6, body: [[95, .065, 1.1], [300, .036, .8], [880, .018, .55], [2100, .008, .3]], low: [54, .07, 1.4], crack: 1, brake: 1, drive: 4, tail: .17, farT: 3.3, vel: 860, brass: 'b50', mech: 'none' },
  shotgun_12: { T: .0015, A: 1.25, col: 760, colQ: .6, body: [[125, .05, 1], [360, .032, .8], [980, .016, .55], [2300, .007, .25]], low: [78, .05, 1.2], crack: .12, drive: 3.4, tail: .12, farT: 2.0, vel: 400, brass: 'sh', mech: 'none' },
  lmg_556:    { T: .00095, A: 1.5, col: 1300, colQ: .7, body: [[170, .036, .82], [540, .021, .62], [1550, .01, .45], [3200, .005, .25]], low: [106, .032, .8], crack: 1, drive: 3.0, tail: .075, farT: 2.0, vel: 915, brass: 'r', mech: 'lmg' },
  lmg_762:    { T: .00118, A: 1.4, col: 1000, colQ: .7, body: [[145, .042, .92], [450, .025, .68], [1250, .012, .5], [2750, .006, .25]], low: [92, .038, .95], crack: .95, drive: 3.3, tail: .09, farT: 2.2, vel: 825, brass: 'rl', mech: 'lmg' },
};
// loudness of the close report (s50 dBFS at the reference distance; the shooter's own gun) and of the suppressed version
const LOUD = { pistol_9: -13, pistol_45: -12.5, pistol_mag: -10.5, smg_9: -13.5, smg_45: -13, rifle_556: -11, rifle_545: -11, rifle_762: -10.5,
  br_308: -10, dmr_762: -10, sniper_338: -9, sniper_50: -8, shotgun_12: -9.5, lmg_556: -11, lmg_762: -10.5 };
const SUPL = { pistol_9: -27, pistol_45: -28, pistol_mag: -24, smg_9: -27, smg_45: -28, rifle_556: -21, rifle_545: -21, rifle_762: -20.5,
  br_308: -20, dmr_762: -20, sniper_338: -18, sniper_50: -15, shotgun_12: -19, lmg_556: -21, lmg_762: -20 };
export const weightOf = f => /^(pistol|smg)/.test(f) ? 'l' : /^(lmg|sniper_50)/.test(f) ? 'h' : 'm';
export const BRASS_OF = Object.fromEntries(Object.entries(FAMILIES).map(([k, v]) => [k, v.brass]));
// gun archetype (js/weapons/data.js) -> mech type; null = manual action (pump / bolt / lever / break) or no ejection
export const MECH_OF = {
  pistol_striker: 'slide', pistol_compact: 'slide', pistol_singlestack: 'slide_h', revolver: 'revolver', machine_pistol: 'slide',
  pistol_large: 'slide_h', pistol_integral: 'slide_l', smg_roller: 'roller_s', pdw: 'smg', smg_classic: 'smg_h', pdw_bullpup: 'bullpup_s',
  smg_offset: 'smg_h', smg_stamped: 'smg', smg_integral: 'smg', smg_micro: 'smg', ak: 'ak', ar15: 'ar', ar_piston: 'ar', ar10: 'ar_h',
  bullpup_classic: 'bullpup', bullpup: 'bullpup', rifle_modular: 'ar', rifle_polymer: 'ar', pcc: 'smg', br_roller: 'roller', br_classic: 'ar_h',
  pump: 'none', shotgun_semi: 'semi_sg', shotgun_drum: 'semi_sg', shotgun_break: 'none', shotgun_lever: 'none', dmr_classic: 'ak',
  dmr_integral: 'ar', bolt: 'none', bolt_am: 'none', sniper_semi: 'ar_h', belt_lmg: 'lmg', lmg_mag: 'lmg',
};

// ------------------------------------------------------------------ the report
function report(o, sr, R, F, sup) {
  const n = o.length, T = F.T * j(R, .1) * (sup ? 2.4 : 1);
  // 1. pressure pulse: the punch
  const p = D.friedlander(Math.min(n, D.len(T * 10, sr)), sr, T, F.A);
  D.lp1(p, sr, sup ? 1300 : 7500); D.addAt(o, p, 0, sup ? .6 : 1);
  // 2. turbulent blast: broadband noise with a very fast decay, coloured by the calibre / barrel
  const nTau = (sup ? 3.2 : 1) * (.0018 + F.T * 2.6) * j(R, .15), w = D.white(D.len(nTau * 8, sr), R);
  D.env(w, sr, .00008, nTau); D.filt(w, sr, 'highpass', 160, .7); D.filt(w, sr, 'peaking', F.col * j(R, .07), F.colQ, 10);
  D.filt(w, sr, 'lowpass', sup ? 2400 : 12000, .6); D.addAt(o, w, 0, sup ? .22 : .85);
  // 3. body: decaying resonant bands of the gun and the near surroundings (the "bang")
  for (const [f, tau, a] of F.body) {
    const t = Math.min(tau, f < 260 ? .02 : 1) * j(R, .14) * (sup ? 1.25 : 1), b = D.white(D.len(t * 7, sr), R);
    D.env(b, sr, .0004 + R() * .0004, t); D.filt(b, sr, 'bandpass', f * j(R, .06), 2.6);
    D.addAt(o, b, Math.round(R() * .0006 * sr), a * (sup ? .4 : 1) * 4.2);
  }
  // 4. low thump with a slight downward glide
  const [lf, lt, la] = F.low, lT = Math.min(lt, .8 / lf) * j(R, .1), s = D.tone(D.len(lT * 6, sr), sr, lf * j(R, .06), lf * .6, { glide: lT * 3 });
  D.env(s, sr, .0006, lT); D.addAt(o, s, 0, la * (sup ? .6 : .45));
  // 5. ballistic crack of a supersonic bullet (part of the report for the shooter / close by)
  if (!sup && F.crack) {
    const c = D.nwave(D.len(.002, sr), sr, .00028 * j(R, .2)); D.filt(c, sr, 'highpass', 900, .7);
    D.addAt(o, c, Math.round(.0002 * sr), F.crack * .9);
    const h = D.white(D.len(.008, sr), R); D.env(h, sr, .00005, .0009); D.filt(h, sr, 'highpass', 3500, .7); D.addAt(o, h, 0, F.crack * .55);
  }
  if (F.brake && !sup) {   // muzzle brake: harsh side-vented blast a moment later
    const b = D.white(D.len(.05, sr), R); D.env(b, sr, .0001, .006); D.filt(b, sr, 'peaking', 3200, .8, 8); D.filt(b, sr, 'highpass', 400);
    D.addAt(o, b, Math.round(.0004 * sr), .75);
  }
  if (sup) {   // suppressor: the "pfft" of gas leaving the baffles and a faint ring of the can
    const pf = D.white(D.len(.09, sr), R); D.env(pf, sr, .0006, .014 * j(R, .2)); D.filt(pf, sr, 'bandpass', 1100 * j(R, .1), .9);
    D.addAt(o, pf, Math.round(.0008 * sr), 1.3);
    D.ring(o, sr, .0005, [[2900, .012, .3], [4300, .009, .25], [6150, .006, .2]], .25, R, .04);
  }
  // 6. ground reflection, 3-6 ms later, low-passed by the ground
  D.delayAdd(o, sr, .0035 + R() * .0025, sup ? .3 : .4, 3200);
  // 7. saturation (mic and ear overload give real close gunshots their density)
  const pk = D.peakOf(o); if (pk > 0) D.scale(o, 1 / pk);
  D.shape(o, sup ? 1.3 : F.drive, .05);
  // 8. the roar of expanding gas and the nearest reflections
  const tl = D.pink(D.len(F.tail * 7, sr), R); D.env(tl, sr, .002, F.tail * j(R, .15) * (sup ? .6 : 1));
  D.filt(tl, sr, 'lowpass', sup ? 1600 : 2600, .6); D.filt(tl, sr, 'highpass', 120, .6);
  D.addAt(o, tl, Math.round(.0015 * sr), sup ? .07 : .13);
  D.dcblock(o, sr);
}
// the shot from 100+ m: the pulse is dispersed and dull, then echoes roll back from terrain and buildings
function far(o, sr, R, F) {
  const T = F.T * 3.4 * j(R, .15), p = D.friedlander(D.len(T * 10, sr), sr, T, 1.2); D.lp1(p, sr, 1400); D.addAt(o, p, 0, 1);
  const b = D.white(D.len(.15, sr), R); D.env(b, sr, .0015, .018 + F.T * 6); D.filt(b, sr, 'bandpass', F.col * .55, 1.1); D.addAt(o, b, 0, 3);
  const pop = D.white(D.len(.08, sr), R); D.env(pop, sr, .0008, .008 + F.T * 3); D.filt(pop, sr, 'bandpass', 1000 * j(R, .15), .8); D.addAt(o, pop, 0, 2);
  const [lf, lt] = F.low, s = D.tone(D.len(lt * 9, sr), sr, lf * .85, lf * .6, { glide: lt * 4 }); D.env(s, sr, .002, lt * 1.6); D.addAt(o, s, 0, .55);
  D.delayAdd(o, sr, .012 + R() * .01, .5, 900);
  const L = F.farT * j(R, .1), K = 7 + Math.floor(R() * 6);
  for (let k = 0; k < K; k++) {
    const t = .07 + L * .7 * Math.pow(R(), 1.5), a = (.18 + .5 * R()) * Math.exp(-t / (L * .32)), e = D.pink(D.len(.5, sr), R);
    D.env(e, sr, .004 + .03 * R(), .04 + .14 * R()); D.filt(e, sr, 'lowpass', 500 + 1500 * Math.exp(-t / 1.1), .7); D.filt(e, sr, 'highpass', 120);
    D.add(o, e, t, sr, a * 1.4);
  }
  const rb = D.brown(o.length, R); D.env(rb, sr, .03, L * .28); D.filt(rb, sr, 'lowpass', 260, .7); D.addAt(o, rb, 0, .15);
  D.lp1(o, sr, 3200); D.filt(o, sr, 'highpass', 45, .7); D.dcblock(o, sr);
}
// supersonic bullet passing: N-wave + tearing turbulence; long = farther from the path (wider, duller N-wave)
function crackSnd(o, sr, R, k = 1) {
  const c = D.nwave(D.len(.003, sr), sr, (.00022 + .0002 * R()) * k); D.addAt(o, c, 0, 1);
  const h = D.white(D.len(.03, sr), R); D.env(h, sr, .00005, .0016 * k); D.filt(h, sr, 'highpass', 2600, .7); D.addAt(o, h, 0, .45);
  D.delayAdd(o, sr, .002 + R() * .003, .45, 5000);
  const z = D.white(D.len(.06, sr), R); D.env(z, sr, .001, .012); D.sweep(z, sr, 'bandpass', 4500, 1800, 2, .05); D.addAt(o, z, Math.round(.001 * sr), .3);
  D.filt(o, sr, 'highpass', 350, .7); D.filt(o, sr, 'lowpass', 15000, .7);
  D.scale(o, 1 / Math.max(1e-6, D.peakOf(o))); D.shape(o, 3.5);   // recorded cracks always clip: denser, louder
}

// ------------------------------------------------------------------ mechanics
// a steel part hitting steel: modes at base x ratios
function steel(o, sr, R, at, base, amp, tauK = 1, bright = 1) {
  const r = [1, 1.59, 2.38, 3.43, 4.66], t = [.022, .016, .011, .008, .005];
  D.strike(o, sr, at, R, { modes: r.map((x, i) => [base * x * j(R, .025), t[i] * tauK * j(R, .15), (i ? .85 / (1 + i * .55) : 1) * (.55 + .45 * R())]),
    amp, click: .55 * bright, noise: .45, nTau: .0011, nf: base * 2.3, nq: .9 });
}
function spring(o, sr, R, at, f, amp, tau = .08) {   // coil spring "sproing": dispersive chirp + coil modes
  const ch = D.tone(D.len(.04, sr), sr, f * 3.2, f * .9, { glide: .025 }); D.env(ch, sr, .0004, .012); D.add(o, ch, at, sr, amp * .35);
  D.ring(o, sr, at, [[f, tau, .55], [f * 2.02, tau * .75, .45], [f * 3.05, tau * .55, .3], [f * 4.1, tau * .4, .18]], amp * .5, R, .02);
  const rub = D.white(D.len(tau * 3, sr), R); D.env(rub, sr, .002, tau * .5); D.filt(rub, sr, 'bandpass', f * 2.5, 2); D.add(o, rub, at, sr, amp * .3);
}
function thud(o, sr, R, at, f, tau, amp) { const s = D.tone(D.len(tau * 6, sr), sr, f, f * .6, { glide: tau * 2 }); D.env(s, sr, .0008, tau); D.add(o, s, at, sr, amp); }
function rattle(o, sr, R, t0, t1, rate, amp, fLo = 2200, fHi = 6500) { D.grains(o, sr, R, { t0, t1, rate, rate1: rate * .2, amp, amp1: amp * .3, kind: 'ping', fLo, fHi, tauLo: .002, tauHi: .008 }); }
const MECH = {
  slide(o, sr, R) { steel(o, sr, R, .004 + R() * .002, 2100, .7); steel(o, sr, R, .019 + R() * .005, 1750, 1); thud(o, sr, R, .019, 380, .006, .25); },
  slide_l(o, sr, R) { steel(o, sr, R, .003, 2600, .5, .8); steel(o, sr, R, .014 + R() * .004, 2300, .8, .8); },
  slide_h(o, sr, R) { steel(o, sr, R, .005 + R() * .002, 1800, .8, 1.2); steel(o, sr, R, .026 + R() * .006, 1500, 1, 1.25); thud(o, sr, R, .026, 300, .008, .35); },
  revolver(o, sr, R) { steel(o, sr, R, .03 + R() * .01, 2600, .25, .7, .6); },
  smg(o, sr, R) { steel(o, sr, R, .006, 1250, .7, 1.1); steel(o, sr, R, .034 + R() * .008, 1050, 1, 1.2); thud(o, sr, R, .034, 260, .01, .35); rattle(o, sr, R, .036, .07, 300, .08); },
  smg_h(o, sr, R) { steel(o, sr, R, .007, 1050, .8, 1.2); steel(o, sr, R, .045 + R() * .008, 900, 1, 1.3); thud(o, sr, R, .045, 220, .012, .45); rattle(o, sr, R, .047, .085, 260, .09); },
  roller_s(o, sr, R) { steel(o, sr, R, .005, 1500, .9, 1.1); steel(o, sr, R, .028 + R() * .006, 1300, 1, 1.1); spring(o, sr, R, .008, 1250, .25, .05); },
  bullpup_s(o, sr, R) { MECH.smg(o, sr, R); },
  ar(o, sr, R) { steel(o, sr, R, .006, 1500, .7); spring(o, sr, R, .009, 1300 * j(R, .05), .55, .085 * j(R, .2)); steel(o, sr, R, .046 + R() * .01, 1450, 1); thud(o, sr, R, .046, 320, .008, .3); },
  ar_h(o, sr, R) { steel(o, sr, R, .007, 1300, .8, 1.15); spring(o, sr, R, .01, 1100 * j(R, .05), .5, .1); steel(o, sr, R, .056 + R() * .01, 1200, 1, 1.2); thud(o, sr, R, .056, 260, .01, .4); },
  bullpup(o, sr, R) { steel(o, sr, R, .006, 1600, .8); spring(o, sr, R, .009, 1450, .35, .06); steel(o, sr, R, .042 + R() * .01, 1500, 1); thud(o, sr, R, .042, 300, .008, .35); },
  ak(o, sr, R) { steel(o, sr, R, .008, 820, .9, 1.35); rattle(o, sr, R, .01, .05, 220, .1, 1500, 4500); steel(o, sr, R, .06 + R() * .012, 760, 1, 1.4); thud(o, sr, R, .06, 210, .012, .5); rattle(o, sr, R, .062, .1, 180, .07, 1500, 4000); },
  roller(o, sr, R) { steel(o, sr, R, .005, 1250, 1, 1.2); steel(o, sr, R, .036 + R() * .008, 1080, 1, 1.3); thud(o, sr, R, .036, 240, .012, .5); spring(o, sr, R, .01, 980, .25, .06); },
  lmg(o, sr, R) { steel(o, sr, R, .007, 900, .9, 1.3); steel(o, sr, R, .05 + R() * .01, 820, 1, 1.4); thud(o, sr, R, .05, 190, .014, .55); rattle(o, sr, R, .01, .12, 420, .14, 2400, 6800); },
  semi_sg(o, sr, R) { steel(o, sr, R, .008, 950, .8, 1.3); steel(o, sr, R, .07 + R() * .012, 850, 1, 1.4); thud(o, sr, R, .07, 200, .014, .5); },
  none(o, sr, R) { steel(o, sr, R, .002, 3200, .2, .5, .5); },
};

// ------------------------------------------------------------------ brass
const BRASS = { p: { f: 5300, k: .8, m: .6 }, p45: { f: 4500, k: .85, m: .7 }, r: { f: 3900, k: 1.1, m: .8 }, rl: { f: 3050, k: 1.25, m: 1 }, b50: { f: 1900, k: 1.5, m: 1.6 }, sh: { f: 1100, k: .15, m: .9, hull: 1 } };
function brassSnd(o, sr, R, c, surf) {
  const B = BRASS[c], ratios = [1, 2.756, 5.404, 8.933], taus = [.075, .045, .03, .02];
  const sk = surf === 'hard' ? 1 : surf === 'metal' ? 1.2 : surf === 'wood' ? .3 : surf === 'water' ? .05 : .07;
  let t = 0, a = 1;
  const hits = surf === 'soft' || surf === 'water' ? 1 : 3 + Math.floor(R() * 2);
  for (let h = 0; h < hits; h++) {
    if (surf === 'water') { D.bubble(o, sr, t, 900 + R() * 600, .012, 2, .5); const s = D.white(D.len(.05, sr), R); D.env(s, sr, .001, .01); D.filt(s, sr, 'bandpass', 2500, 1.5); D.add(o, s, t, sr, .3); break; }
    if (B.hull) { D.strike(o, sr, t, R, { modes: [[900 * j(R, .1), .012, 1], [1750 * j(R, .1), .008, .7], [2900, .005, .4]], amp: a, click: .4, noise: .5, nf: 1500 }); D.ring(o, sr, t, ratios.slice(0, 2).map((r, i) => [B.f * 3.4 * r, .01, .3]), a * .15, R, .05); }
    else {
      const modes = ratios.map((r, i) => [B.f * r * j(R, .02), taus[i] * B.k * sk * j(R, .2), (.3 + .7 * R()) / (1 + i * .3)]);
      D.strike(o, sr, t, R, { modes, amp: a * (surf === 'soft' ? .35 : 1), click: .3, noise: surf === 'soft' ? .5 : .25, nTau: .0006, nf: surf === 'soft' ? 1200 : 5000 });
    }
    if (surf === 'wood') D.ring(o, sr, t, [[620 * j(R, .1), .012, 1], [1150, .008, .6]], a * .25, R);
    if (surf === 'metal') D.ring(o, sr, t, [[480 * j(R, .1), .05, 1], [1270 * j(R, .1), .03, .6]], a * .12, R);
    if (surf === 'soft') { thud(o, sr, R, t, 420, .006, .25 * B.m); break; }
    t += (h === 0 ? .08 + .08 * R() : .04 + .06 * R()) * B.m; a *= .45 + .2 * R();
  }
  if (surf === 'hard' && !B.hull) D.grains(o, sr, R, { t0: t, t1: t + .1 + .15 * R(), rate: 70, rate1: 15, amp: .05, amp1: .01, kind: 'ping', fLo: B.f * .95, fHi: B.f * 1.05, tauLo: .004, tauHi: .012 });   // rolling
  D.filt(o, sr, 'highpass', 200, .7);
}

// ------------------------------------------------------------------ handling / reload primitives
const W = { l: { f: 1.18, m: .6, d: .85 }, m: { f: 1, m: 1, d: 1 }, h: { f: .82, m: 1.4, d: 1.2 } };
function friction(o, sr, R, at, dur, f0, f1, amp, q = 1.6) {   // metal / polymer sliding
  const b = D.white(D.len(dur, sr), R); D.sweep(b, sr, 'bandpass', f0, f1, q, dur); D.am(b, sr, 90, .6, R); D.bell(b, sr, 0, dur * .35, dur);
  D.add(o, b, at, sr, amp * 2.2);
}
function cloth(o, sr, R, at, dur, amp, f = 2200) { const b = D.pink(D.len(dur, sr), R); D.filt(b, sr, 'bandpass', f * j(R, .2), .8); D.am(b, sr, 40, .7, R); D.bell(b, sr, 0, dur * .4, dur); D.add(o, b, at, sr, amp * 1.6); }
function polymer(o, sr, R, at, amp, f = 650) { D.strike(o, sr, at, R, { modes: [[f * j(R, .08), .009, 1], [f * 1.8, .006, .6], [f * 3.1, .004, .35]], amp, click: .35, noise: .6, nf: 1800, nTau: .002 }); }
function latch(o, sr, R, at, amp, w) { steel(o, sr, R, at, 2700 * W[w].f, amp, .55, 1.2); }
const STAGE = {
  start(o, sr, R, w) { cloth(o, sr, R, 0, .22 * W[w].d, .5); polymer(o, sr, R, .06 + R() * .04, .25 * W[w].m, 500); },
  magout(o, sr, R, w) { latch(o, sr, R, 0, .7, w); friction(o, sr, R, .012, .085 * W[w].d, 1500 * W[w].f, 900 * W[w].f, .45); steel(o, sr, R, .09 * W[w].d, 1900 * W[w].f, .25, .6); },
  magdrop(o, sr, R, w) { polymer(o, sr, R, 0, .8 * W[w].m, 520); polymer(o, sr, R, .11 + R() * .05, .35, 600); steel(o, sr, R, .005, 2200, .2, .6); },
  magin(o, sr, R, w) { friction(o, sr, R, 0, .05 * W[w].d, 900 * W[w].f, 1500 * W[w].f, .4); polymer(o, sr, R, .05 * W[w].d, .7 * W[w].m, 420 * W[w].f); latch(o, sr, R, .056 * W[w].d, 1, w); thud(o, sr, R, .058 * W[w].d, 140, .02, .45 * W[w].m); },
  slide(o, sr, R) { friction(o, sr, R, 0, .07, 1800, 1100, .35); steel(o, sr, R, .075, 1900, .5, .9); spring(o, sr, R, .08, 1500, .12, .03); steel(o, sr, R, .16 + R() * .02, 1750, 1, 1.1); thud(o, sr, R, .16, 330, .008, .4); },
  sliderel(o, sr, R) { latch(o, sr, R, 0, .5, 'l'); steel(o, sr, R, .012, 1750, 1, 1.1); thud(o, sr, R, .012, 330, .008, .4); },
  charge(o, sr, R, w) { const d = W[w].d, f = W[w].f; latch(o, sr, R, 0, .4, w); friction(o, sr, R, .01, .13 * d, 1100 * f, 1700 * f, .45, 1.2); spring(o, sr, R, .04, 1050 * f, .25, .07 * d); steel(o, sr, R, .145 * d, 1300 * f, .45, 1.1); steel(o, sr, R, .27 * d + R() * .02, 1150 * f, 1, 1.3); thud(o, sr, R, .27 * d, 230, .012, .5 * W[w].m); },
  boltrel(o, sr, R, w) { latch(o, sr, R, 0, .45, w); steel(o, sr, R, .01, 1250 * W[w].f, 1, 1.3); thud(o, sr, R, .01, 240, .012, .5 * W[w].m); spring(o, sr, R, .012, 1150 * W[w].f, .2, .05); },
  pump(o, sr, R) { STAGE.pumpback(o, sr, R); const p = D.buf(.4, sr); STAGE.pumpfwd(p, sr, R); D.add(o, p, .2 + R() * .03, sr, 1); },
  pumpback(o, sr, R) { friction(o, sr, R, 0, .09, 700, 1100, .45, 1.2); polymer(o, sr, R, 0, .4, 480); steel(o, sr, R, .09, 900, .9, 1.4); thud(o, sr, R, .09, 180, .015, .5); },
  pumpfwd(o, sr, R) { friction(o, sr, R, 0, .08, 1100, 750, .4, 1.2); steel(o, sr, R, .08, 1000, 1, 1.4); thud(o, sr, R, .08, 200, .014, .55); polymer(o, sr, R, .082, .35, 520); },
  bolt(o, sr, R, w) { STAGE.boltopen(o, sr, R, w); const p = D.buf(.4, sr); STAGE.boltclose(p, sr, R, w); D.add(o, p, .3 + R() * .04, sr, 1); },
  boltopen(o, sr, R, w) { steel(o, sr, R, 0, 1500 * W[w].f, .6, .9); friction(o, sr, R, .03, .015, 2000, 2400, .2); friction(o, sr, R, .07, .12 * W[w].d, 1300 * W[w].f, 900 * W[w].f, .5, 1.3); steel(o, sr, R, .19 * W[w].d, 1100 * W[w].f, .8, 1.3); },
  boltclose(o, sr, R, w) { friction(o, sr, R, 0, .1 * W[w].d, 900 * W[w].f, 1300 * W[w].f, .45, 1.3); steel(o, sr, R, .1 * W[w].d, 1200 * W[w].f, .9, 1.3); thud(o, sr, R, .1 * W[w].d, 220, .012, .4); steel(o, sr, R, .17 * W[w].d, 1600 * W[w].f, .7, .9); },
  lever(o, sr, R) { friction(o, sr, R, 0, .1, 900, 1300, .4); steel(o, sr, R, .1, 1100, .9, 1.3); friction(o, sr, R, .18, .1, 1300, 900, .4); steel(o, sr, R, .28, 1050, 1, 1.3); thud(o, sr, R, .28, 210, .014, .45); },
  shell(o, sr, R) { friction(o, sr, R, 0, .04, 1600, 1000, .25, 2); polymer(o, sr, R, .035, .5, 820); steel(o, sr, R, .045 + R() * .01, 1800, .6, .8); spring(o, sr, R, .05, 900, .12, .03); thud(o, sr, R, .048, 260, .01, .3); },
  cylopen(o, sr, R) { latch(o, sr, R, 0, .6, 'l'); friction(o, sr, R, .02, .06, 2200, 1700, .3, 2); steel(o, sr, R, .08, 1600, .5, .8); D.grains(o, sr, R, { t0: .1, t1: .2, rate: 60, amp: .05, kind: 'ping', fLo: 3000, fHi: 4200, tauLo: .002, tauHi: .006 }); },
  cylclose(o, sr, R) { friction(o, sr, R, 0, .03, 1700, 2300, .25, 2); steel(o, sr, R, .03, 1700, 1, 1); D.grains(o, sr, R, { t0: .045, t1: .12, rate: 80, rate1: 10, amp: .07, kind: 'ping', fLo: 2800, fHi: 4500, tauLo: .002, tauHi: .006 }); },
  speedload(o, sr, R) { for (let i = 0; i < 3; i++) steel(o, sr, R, .01 + i * .012 + R() * .004, 3000, .25, .5); friction(o, sr, R, .05, .04, 1500, 1200, .2); latch(o, sr, R, .1, .5, 'l'); polymer(o, sr, R, .1, .3, 700); },
  coveropen(o, sr, R) { latch(o, sr, R, 0, .7, 'h'); spring(o, sr, R, .01, 800, .3, .08); steel(o, sr, R, .09, 900, .7, 1.2); },
  coverclose(o, sr, R) { friction(o, sr, R, 0, .05, 900, 1300, .3); steel(o, sr, R, .05, 950, 1, 1.4); thud(o, sr, R, .05, 190, .016, .6); latch(o, sr, R, .06, .6, 'h'); },
  belt(o, sr, R) { D.grains(o, sr, R, { t0: 0, t1: .3, rate: 160, rate1: 40, amp: .2, amp1: .05, kind: 'ping', fLo: 2600, fHi: 5600, tauLo: .003, tauHi: .012 }); cloth(o, sr, R, 0, .25, .25, 1500); polymer(o, sr, R, .26, .5, 380); },
  breakopen(o, sr, R) { latch(o, sr, R, 0, .7, 'm'); friction(o, sr, R, .02, .08, 900, 650, .35); steel(o, sr, R, .1, 900, .8, 1.2); polymer(o, sr, R, .13, .35, 900); polymer(o, sr, R, .145, .3, 950); },
  breakclose(o, sr, R) { friction(o, sr, R, 0, .05, 650, 900, .3); steel(o, sr, R, .05, 950, 1, 1.4); thud(o, sr, R, .05, 190, .016, .6); latch(o, sr, R, .055, .6, 'm'); },
  end(o, sr, R, w) { cloth(o, sr, R, 0, .18 * W[w].d, .35); polymer(o, sr, R, .08, .18 * W[w].m, 480); },
  draw(o, sr, R, w) { cloth(o, sr, R, 0, .26 * W[w].d, .7, 1900); friction(o, sr, R, .05, .09, 1200, 1600, .15); steel(o, sr, R, .2 * W[w].d, 1400 * W[w].f, .55, 1.1); polymer(o, sr, R, .21 * W[w].d, .4 * W[w].m, 460); },
  holster(o, sr, R, w) { cloth(o, sr, R, 0, .22 * W[w].d, .6, 1700); polymer(o, sr, R, .16 * W[w].d, .3 * W[w].m, 420); },
  firemode(o, sr, R) { latch(o, sr, R, 0, .7, 'l'); steel(o, sr, R, .002, 3400, .35, .4); },
  ads(o, sr, R) { cloth(o, sr, R, 0, .16, .5, 2600); polymer(o, sr, R, .12, .12, 700); },
  adsout(o, sr, R) { cloth(o, sr, R, 0, .13, .4, 2000); },
  inspect(o, sr, R, w) { cloth(o, sr, R, 0, .35, .4); polymer(o, sr, R, .2, .25, 520); friction(o, sr, R, .45, .1, 1300, 1600, .12); steel(o, sr, R, .6, 1800 * W[w].f, .3, .7); cloth(o, sr, R, .7, .3, .35); },
  laser(o, sr, R) { latch(o, sr, R, 0, .4, 'l'); polymer(o, sr, R, .003, .25, 1600); },
};
export const STAGES = Object.keys(STAGE);

// ------------------------------------------------------------------ melee
const MEL = { knife: { f: 1.25, m: .6 }, machete: { f: .9, m: 1 }, axe: { f: .7, m: 1.4 } };
function swing(o, sr, R, k) {
  const M = MEL[k], d = .2 + .08 * M.m, b = D.pink(D.len(d, sr), R);
  D.sweep(b, sr, 'bandpass', 500 * M.f, 2200 * M.f, 1.4, d * .55); D.bell(b, sr, 0, d * .5, d); D.add(o, b, 0, sr, 1.5);
  const h = D.white(D.len(d, sr), R); D.sweep(h, sr, 'bandpass', 2500 * M.f, 5200 * M.f, 3, d * .5); D.bell(h, sr, d * .2, d * .5, d * .85); D.add(o, h, 0, sr, .35);
  cloth(o, sr, R, 0, .18, .3);
}
function flesh(o, sr, R, at, amp, bright = 1) {
  thud(o, sr, R, at, 170 * j(R, .15), .02, amp);
  const s = D.white(D.len(.06, sr), R); D.env(s, sr, .0004, .008); D.filt(s, sr, 'bandpass', 1300 * bright * j(R, .15), 1.1); D.add(o, s, at, sr, amp * 1.4);
  const wv = D.pink(D.len(.12, sr), R); D.env(wv, sr, .002, .025); D.sweep(wv, sr, 'bandpass', 900 * bright, 450, 1.6, .06); D.add(o, wv, at + .002, sr, amp * 1.1);
}

// ------------------------------------------------------------------ registration
const G = ['gun'];
for (const [fam, F] of Object.entries(FAMILIES)) {
  def('gun:' + fam, { dur: .32 + F.tail * 4, vars: 3, lvl: { s50: LOUD[fam], max: -.3 }, tags: G, crit: true, gen: (o, sr, R) => report(o, sr, R, F, false) });
  def('sup:' + fam, { dur: .2 + F.tail * 2, vars: 3, lvl: { s50: SUPL[fam], max: -3 }, tags: G, crit: true, gen: (o, sr, R) => report(o, sr, R, F, true) });
  def('far:' + fam, { dur: F.farT + .2, vars: 3, sr: 16000, lvl: { s50: LOUD[fam] - (fam === 'sniper_50' ? 5 : 2), max: -1 }, tags: G, gen: (o, sr, R) => far(o, sr, R, F) });
}
def('crack', { dur: .1, vars: 4, lvl: { s50: -19, max: -1 }, tags: G, gen: (o, sr, R) => crackSnd(o, sr, R, 1.4) });
for (const m of Object.keys(MECH)) def('mech:' + m, { dur: .22, vars: 3, lvl: { s50: -27, max: -6 }, tags: G, crit: true, gen: (o, sr, R) => MECH[m](o, sr, R) });
for (const c of Object.keys(BRASS)) for (const s of ['hard', 'metal', 'wood', 'soft', 'water'])
  def('brass:' + c + ':' + s, { dur: .55, vars: 3, sr: 32000, lvl: { s50: c === 'b50' ? -30 : -34, max: -10 }, tags: ['brass'], gen: (o, sr, R) => brassSnd(o, sr, R, c, s) });
def('dry', { dur: .08, vars: 3, lvl: { s50: -30, max: -10 }, tags: ['handling'], crit: true, gen: (o, sr, R) => { steel(o, sr, R, 0, 2900, .5, .5); steel(o, sr, R, .006 + R() * .002, 2400, 1, .7); } });
def('dry:h', { dur: .1, vars: 3, lvl: { s50: -29, max: -10 }, tags: ['handling'], gen: (o, sr, R) => { steel(o, sr, R, 0, 2500, .5, .6); steel(o, sr, R, .009, 1900, 1, .9); thud(o, sr, R, .009, 400, .005, .2); } });
const RLV = { start: -32, magout: -28, magdrop: -29, magin: -25, slide: -24, sliderel: -24, charge: -24, boltrel: -24, pump: -23, pumpback: -24, pumpfwd: -24,
  bolt: -24, boltopen: -25, boltclose: -25, lever: -24, shell: -27, cylopen: -27, cylclose: -25, speedload: -27, coveropen: -26, coverclose: -24, belt: -28,
  breakopen: -26, breakclose: -24, end: -33, draw: -28, holster: -31, firemode: -30, ads: -36, adsout: -38, inspect: -32, laser: -32 };
const WEIGHTED = new Set(['start', 'magout', 'magdrop', 'magin', 'charge', 'boltrel', 'bolt', 'boltopen', 'boltclose', 'end', 'draw', 'holster', 'inspect']);
for (const st of STAGES) {
  const ws = WEIGHTED.has(st) ? ['l', 'm', 'h'] : [null];
  for (const w of ws) def('rl:' + st + (w ? ':' + w : ''), { dur: st === 'inspect' ? 1.1 : st === 'pump' || st === 'bolt' ? .75 : .45, vars: 2, sr: 32000, lvl: { s50: RLV[st], max: -8 },
    tags: ['handling'], gen: (o, sr, R) => STAGE[st](o, sr, R, w || 'm') });
}
for (const k of Object.keys(MEL)) {
  def('ml:swing:' + k, { dur: .4, vars: 3, sr: 32000, lvl: { s50: -26, max: -8 }, tags: ['melee'], gen: (o, sr, R) => swing(o, sr, R, k) });
  def('ml:hit:' + k, { dur: .3, vars: 3, lvl: { s50: -17, max: -3 }, tags: ['melee'], gen: (o, sr, R) => { flesh(o, sr, R, 0, 1, k === 'knife' ? 1.2 : .9); if (k !== 'knife') thud(o, sr, R, .002, 110, .03, .6 * MEL[k].m); } });
  def('ml:wall:' + k, { dur: .35, vars: 3, lvl: { s50: -18, max: -3 }, tags: ['melee'], gen: (o, sr, R) => { steel(o, sr, R, 0, 2200 * MEL[k].f, 1, 1.6); D.grains(o, sr, R, { t0: 0, t1: .05, rate: 400, amp: .15, kind: 'click', fLo: 3000, fHi: 8000 }); thud(o, sr, R, 0, 200, .01, .4 * MEL[k].m); } });
  def('ml:draw:' + k, { dur: .4, vars: 2, lvl: { s50: -29, max: -8 }, tags: ['melee'], gen: (o, sr, R) => { friction(o, sr, R, 0, .22, 3000 * MEL[k].f, 5500 * MEL[k].f, .4, 4); D.ring(o, sr, .18, [[3300 * MEL[k].f, .15, 1], [5200 * MEL[k].f, .1, .6]], .12, R, .02); cloth(o, sr, R, .05, .2, .3); } });
}
def('ml:stab', { dur: .35, vars: 3, lvl: { s50: -17, max: -3 }, tags: ['melee'], gen: (o, sr, R) => { flesh(o, sr, R, 0, 1, 1.4); flesh(o, sr, R, .05 + R() * .03, .5, .8); } });
