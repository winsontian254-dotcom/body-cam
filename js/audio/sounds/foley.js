/* LIVE FIRE — foley: footsteps, landing, gear, bullet impacts, ricochets, bullet whiz / snap, hits, kill confirm, hurt, voice
   efforts and body falls (pure DSP recipes registered in the bank).
   Exports: SURF_CLASS (world surface -> footstep / impact recipe), STEP_SURFS, IMPACT_SURFS, surfClass(surf) -> hard|metal|wood|soft|water
   Bank names:
     st:<surf>:h | st:<surf>:t   heel strike / toe roll-off for STEP_SURFS (concrete asphalt tile wood metal sheetmetal carpet dirt
                                 grass gravel sand snow water mud glass rubber)
     gear, gear:heavy            clothing rustle + kit rattle on running steps / landings
     imp:<surf>                  bullet impact for IMPACT_SURFS; ric = ricochet whine; imp:flesh
     whiz:super | whiz:sub | whiz:pellet   bullet passing the ear
     hit:body hit:armor hit:helmet hit:head hit:tick   (positional or the shooter's confirmation)
     kill, kill:head             kill confirmation (restrained)
     hurt:s | hurt:m | hurt:l    the local player being hit (body impact + breath)
     vo:cough vo:pain vo:death vo:breath vo:exhale     unvoiced / lightly voiced efforts (formant-filtered breath)
     fall:<hard|metal|wood|soft|water>                  a body falling with its kit
     jump                        push-off scuff + gear */
import { def } from '../bank.js';
import * as D from '../dsp.js';

const j = (R, k) => 1 + (R() * 2 - 1) * k;
export const STEP_SURFS = ['concrete', 'asphalt', 'tile', 'wood', 'metal', 'sheetmetal', 'carpet', 'dirt', 'grass', 'gravel', 'sand', 'snow', 'water', 'mud', 'glass', 'rubber'];
export const IMPACT_SURFS = ['concrete', 'brick', 'plaster', 'asphalt', 'tile', 'wood', 'metal', 'sheetmetal', 'glass', 'carpet', 'dirt', 'grass', 'gravel', 'sand', 'snow', 'water', 'mud', 'rubber', 'flesh'];
// world surfaces (docs §3) and a few map extras -> recipe surfaces
export const SURF_CLASS = { concrete: 'concrete', brick: 'concrete', plaster: 'concrete', asphalt: 'asphalt', tile: 'tile', marble: 'tile', rock: 'concrete',
  wood: 'wood', metal: 'metal', sheetmetal: 'sheetmetal', glass: 'glass', carpet: 'carpet', fabric: 'carpet', dirt: 'dirt', grass: 'grass', gravel: 'gravel',
  sand: 'sand', snow: 'snow', water: 'water', mud: 'mud', rubber: 'rubber' };
const CLASS5 = { concrete: 'hard', brick: 'hard', plaster: 'hard', asphalt: 'hard', tile: 'hard', marble: 'hard', rock: 'hard', glass: 'hard', gravel: 'hard',
  wood: 'wood', metal: 'metal', sheetmetal: 'metal', carpet: 'soft', fabric: 'soft', dirt: 'soft', grass: 'soft', sand: 'soft', snow: 'soft', mud: 'soft', rubber: 'soft', water: 'water' };
export const surfClass = s => CLASS5[s] || 'hard';

// ------------------------------------------------------------------ shared bits
function thud(o, sr, at, f, tau, amp, glide = .6) { const s = D.tone(D.len(tau * 6, sr), sr, f, f * glide, { glide: tau * 2 }); D.env(s, sr, .0008, tau); D.add(o, s, at, sr, amp); }
function burst(o, sr, R, at, tau, type, f, q, amp, col = 'white', a = .0002) { const b = D.noise(col, D.len(tau * 7 + a, sr), R); D.env(b, sr, a, tau); D.filt(b, sr, type, f, q); D.add(o, b, at, sr, amp); return b; }
function swish(o, sr, R, at, dur, f, amp, q = .8) { const b = D.pink(D.len(dur, sr), R); D.filt(b, sr, 'bandpass', f, q); D.am(b, sr, 50, .6, R); D.bell(b, sr, 0, dur * .3, dur); D.add(o, b, at, sr, amp * 1.6); }
const crunch = (o, sr, R, t0, t1, rate, amp, fLo, fHi, kind = 'ping', tauLo = .001, tauHi = .004) => D.grains(o, sr, R, { t0, t1, rate, rate1: rate * .25, amp, amp1: amp * .4, kind, fLo, fHi, tauLo, tauHi });

// ------------------------------------------------------------------ footsteps: heel (strike) and toe (roll-off)
const STEP = {
  concrete(o, sr, R, h) {
    const k = h ? 1 : .55; burst(o, sr, R, 0, .0012, 'highpass', 1500, .7, .8 * k); burst(o, sr, R, 0, .006, 'bandpass', 950 * j(R, .15), 1.2, 1.1 * k);
    burst(o, sr, R, .0005, .004, 'bandpass', 2300 * j(R, .15), 1, .5 * k); thud(o, sr, 0, 120 * j(R, .1), .008, .18 * k); crunch(o, sr, R, .001, .05, 160, .05 * k, 3000, 8000, 'click'); burst(o, sr, R, .006, .02, 'bandpass', 2600, 1, .12 * (h ? .7 : 1.3), 'pink', .004);
  },
  asphalt(o, sr, R, h) { const k = h ? 1 : .55; burst(o, sr, R, 0, .0012, 'highpass', 1000, .7, .6 * k); burst(o, sr, R, 0, .007, 'bandpass', 800 * j(R, .15), 1.1, 1 * k); thud(o, sr, 0, 110, .009, .2 * k); crunch(o, sr, R, .001, .07, 260, .06 * k, 2500, 7000, 'click'); },
  tile(o, sr, R, h) { const k = h ? 1 : .5; burst(o, sr, R, 0, .0009, 'highpass', 2600, .7, .8 * k); D.ring(o, sr, 0, [[1850, .006, 1], [3150, .004, .6], [4700, .003, .4]], .3 * k, R, .08); burst(o, sr, R, 0, .014, 'bandpass', 460, 1.4, .35 * k); thud(o, sr, 0, 130, .008, .15 * k); },
  wood(o, sr, R, h, vi) {
    const k = h ? 1 : .6; D.ring(o, sr, 0, [[145 * j(R, .1), .03, .6], [235 * j(R, .1), .025, .7], [420 * j(R, .1), .02, .7], [760, .012, .5]], .6 * k, R);
    burst(o, sr, R, 0, .0015, 'highpass', 1200, .7, .8 * k); burst(o, sr, R, 0, .008, 'bandpass', 700, 1.2, .9 * k); burst(o, sr, R, 0, .004, 'bandpass', 1800, 1, .4 * k);
    if (h && vi % 3 === 1) { const c = D.tone(D.len(.16, sr), sr, 260 * j(R, .1), 330, { shape: 'saw', vib: .04, vibHz: 23 }); D.filt(c, sr, 'bandpass', 900, 2); D.bell(c, sr, 0, .06, .16); D.add(o, c, .03, sr, .12); }
  },
  metal(o, sr, R, h) { const k = h ? 1 : .6; burst(o, sr, R, 0, .001, 'highpass', 2000, .7, .6 * k); D.ring(o, sr, 0, [[420 * j(R, .08), .08, .8], [980 * j(R, .08), .05, 1], [1630, .035, .7], [2480, .02, .5], [3750, .012, .3]], .55 * k, R, .03);
    thud(o, sr, 0, 130, .008, .2 * k); crunch(o, sr, R, .002, .07, 150, .12 * k, 1800, 4200); },
  sheetmetal(o, sr, R, h) { const k = h ? 1 : .6; D.ring(o, sr, 0, [[92 * j(R, .1), .15, 1], [176 * j(R, .1), .12, .9], [305, .09, .7], [520, .06, .5], [880, .04, .35]], .9 * k, R, .05);
    burst(o, sr, R, 0, .0015, 'highpass', 1500, .7, .45 * k); crunch(o, sr, R, .005, .09, 220, .08 * k, 900, 2600, 'click'); },
  carpet(o, sr, R, h) { const k = h ? 1 : .6; burst(o, sr, R, 0, .015, 'lowpass', 900, .7, .9 * k, 'pink', .001); thud(o, sr, 0, 100, .01, .25 * k); swish(o, sr, R, .002, .06, 1800, .3 * k); },
  rubber(o, sr, R, h, vi) { const k = h ? 1 : .6; burst(o, sr, R, 0, .012, 'lowpass', 1200, .7, .8 * k, 'pink', .0008); thud(o, sr, 0, 110, .009, .25 * k);
    if (!h && vi % 2) { const q = D.tone(D.len(.07, sr), sr, 1900 * j(R, .1), 2300, { vib: .03, vibHz: 31 }); D.bell(q, sr, 0, .02, .07); D.add(o, q, .01, sr, .06); } },
  dirt(o, sr, R, h) { const k = h ? 1 : .6; thud(o, sr, 0, 100 * j(R, .1), .01, .3 * k); burst(o, sr, R, 0, .025, 'lowpass', 1600, .7, .7 * k, 'pink', .001);
    crunch(o, sr, R, .002, .08, 500, .2 * k, 700, 3000, 'noise', .002, .005); },
  grass(o, sr, R, h) { const k = h ? 1 : .7; thud(o, sr, 0, 95, .01, .25 * k); swish(o, sr, R, 0, .12, 3400 * j(R, .15), .35 * k, .7); crunch(o, sr, R, .005, .11, 380, .05 * k, 3000, 7500, 'click'); },
  gravel(o, sr, R, h) { const k = h ? 1 : .65; thud(o, sr, 0, 105, .009, .22 * k); crunch(o, sr, R, 0, .13, 900, .32 * k, 1400, 6500, 'ping', .0015, .006);
    burst(o, sr, R, .003, .045, 'bandpass', 2500, 1, .2 * k, 'pink', .006); },
  sand(o, sr, R, h) { const k = h ? 1 : .7; thud(o, sr, 0, 90, .01, .25 * k); burst(o, sr, R, 0, .06, 'highpass', 2600, .7, .35 * k, 'white', .008);
    crunch(o, sr, R, 0, .1, 1400, .05 * k, 4000, 10000, 'click'); },
  snow(o, sr, R, h) {
    const k = h ? 1 : .7; thud(o, sr, 0, 90, .01, .2 * k); burst(o, sr, R, 0, .03, 'lowpass', 1200, .7, .3 * k, 'pink', .004);
    D.grains(o, sr, R, { t0: 0, t1: .16, rate: 500, rate1: 1400, rateCurve: .5, amp: .25 * k, amp1: .1 * k, kind: 'ping', fLo: 900, fHi: 4200, tauLo: .0008, tauHi: .003 });
    const q = D.tone(D.len(.06, sr), sr, 950 * j(R, .15), 1250, { fm: 160, fmHz: 70 }); D.bell(q, sr, 0, .02, .06); D.add(o, q, .03, sr, .07 * k);
  },
  water(o, sr, R, h) {
    const k = h ? 1 : .7; burst(o, sr, R, 0, .06, 'bandpass', 1500 * j(R, .2), .8, .7 * k, 'white', .002); burst(o, sr, R, 0, .1, 'lowpass', 600, .7, .5 * k, 'pink', .01);
    for (let i = 0; i < 3 + R() * 4; i++) D.bubble(o, sr, R() * .05, 380 + R() * 1100, .008 + R() * .02, 1.5 + R() * 2, .12 * k);
    crunch(o, sr, R, .05, .3, 60, .05 * k, 900, 3000, 'noise', .002, .006);
  },
  mud(o, sr, R, h) { const k = h ? 1 : .8; thud(o, sr, 0, 95, .012, .3 * k); const s = D.white(D.len(.15, sr), R); D.env(s, sr, .004, .045); D.sweep(s, sr, 'bandpass', 750, 300, 2, .1); D.add(o, s, 0, sr, .9 * k);
    for (let i = 0; i < 2 + R() * 3; i++) D.bubble(o, sr, .02 + R() * .08, 160 + R() * 260, .012 + R() * .02, 1.2, .15 * k); },
  glass(o, sr, R, h) { const k = h ? 1 : .6; thud(o, sr, 0, 110, .009, .2 * k); D.grains(o, sr, R, { t0: 0, t1: .1, rate: 500, rate1: 80, amp: .35 * k, amp1: .08 * k, kind: 'ping', fLo: 2800, fHi: 10500, tauLo: .003, tauHi: .015 });
    burst(o, sr, R, .002, .03, 'bandpass', 3000, 1, .2 * k, 'white', .004); },
};
for (const s of STEP_SURFS) for (const h of [1, 0]) {
  const base = { soft: -18, hard: -16, metal: -15, wood: -16, water: -16 }[surfClass(s)];
  def('st:' + s + ':' + (h ? 'h' : 't'), { dur: s === 'water' || s === 'mud' ? .38 : s === 'sheetmetal' || s === 'metal' ? .4 : .24, vars: h ? 5 : 4, sr: 32000,
    lvl: { s50: base - (h ? 0 : 4), max: -1 }, tags: ['step'], crit: true, gen: (o, sr, R, vi) => {
      STEP[s](o, sr, R, h, vi); D.filt(o, sr, 'highpass', 45, .7); D.scale(o, 1 / Math.max(1e-6, D.peakOf(o))); D.shape(o, 2.4); } });   // a close mic saturates the heel transient a little
}
// clothing rustle + kit rattle (sling swivels, mag pouches, plates)
def('gear', { dur: .3, vars: 5, sr: 32000, lvl: { s50: -25, max: -8 }, tags: ['step'], gen: (o, sr, R) => {
  swish(o, sr, R, 0, .16 + R() * .08, 2400 * j(R, .2), .5, .8);
  for (let i = 0; i < 1 + R() * 2.5; i++) D.strike(o, sr, .01 + R() * .08, R, { modes: [[3200 * j(R, .2), .012, 1], [5100 * j(R, .2), .008, .6]], amp: .15 + R() * .15, click: .2, noise: .3, nf: 4000 });
  if (R() < .6) D.strike(o, sr, .02 + R() * .05, R, { modes: [[620 * j(R, .15), .008, 1], [1150, .006, .5]], amp: .35, click: .3, noise: .6, nf: 1400 });
} });
def('gear:heavy', { dur: .45, vars: 3, sr: 32000, lvl: { s50: -20, max: -5 }, tags: ['step'], gen: (o, sr, R) => {
  swish(o, sr, R, 0, .25, 2000, .7, .7); thud(o, sr, .005, 120, .03, .5);
  for (let i = 0; i < 4 + R() * 3; i++) D.strike(o, sr, .005 + R() * .12, R, { modes: [[2600 * j(R, .3), .015, 1], [4300 * j(R, .3), .01, .6]], amp: .2 + R() * .3, click: .3, noise: .4, nf: 3500 });
  for (let i = 0; i < 2; i++) D.strike(o, sr, .01 + R() * .06, R, { modes: [[540 * j(R, .2), .01, 1], [980, .007, .5]], amp: .5, click: .3, noise: .6, nf: 1200 });
} });
def('jump', { dur: .3, vars: 3, sr: 32000, lvl: { s50: -30, max: -10 }, tags: ['step'], gen: (o, sr, R) => {
  swish(o, sr, R, 0, .18, 2200, .6); burst(o, sr, R, 0, .02, 'bandpass', 1500, 1, .4, 'pink', .004);
  const br = D.pink(D.len(.2, sr), R); D.filt(br, sr, 'bandpass', 1300, 1.5); D.filt(br, sr, 'bandpass', 2500, 1.2); D.bell(br, sr, .02, .06, .2); D.add(o, br, 0, sr, .5);
} });

// ------------------------------------------------------------------ bullet impacts
function debris(o, sr, R, t0, t1, rate, amp, fLo = 1500, fHi = 6000) { D.grains(o, sr, R, { t0, t1, rate, rate1: rate * .1, amp, amp1: amp * .2, kind: 'ping', fLo, fHi, tauLo: .0015, tauHi: .006 }); }
function dust(o, sr, R, at, tau, amp, f = 2500) { burst(o, sr, R, at, tau, 'bandpass', f, .7, amp, 'pink', tau * .3); }
const IMP = {
  concrete(o, sr, R) { burst(o, sr, R, 0, .0016, 'bandpass', 2600 * j(R, .2), .8, 1.1); D.ring(o, sr, 0, [[3400 * j(R, .2), .006, 1], [5200 * j(R, .2), .004, .7]], .25, R); thud(o, sr, 0, 210, .008, .4);
    debris(o, sr, R, .01, .35, 140, .12); dust(o, sr, R, .004, .09, .12); },
  asphalt(o, sr, R) { burst(o, sr, R, 0, .0018, 'bandpass', 1900 * j(R, .2), .8, 1); thud(o, sr, 0, 180, .009, .45); debris(o, sr, R, .01, .3, 160, .1, 1200, 5000); dust(o, sr, R, .004, .08, .14, 1800); },
  tile(o, sr, R) { burst(o, sr, R, 0, .0012, 'highpass', 2400, .7, 1.1); D.ring(o, sr, 0, [[2100 * j(R, .1), .01, 1], [3600 * j(R, .1), .007, .7], [5600, .005, .5]], .5, R); debris(o, sr, R, .01, .4, 120, .16, 2500, 8000); },
  wood(o, sr, R) { D.ring(o, sr, 0, [[380 * j(R, .15), .025, 1], [720 * j(R, .1), .018, .8], [1150, .012, .6], [1900, .008, .4]], 1.1, R); burst(o, sr, R, 0, .002, 'bandpass', 1800, .8, .8);
    crunch(o, sr, R, .002, .09, 300, .12, 2000, 5000, 'click'); },
  metal(o, sr, R) { burst(o, sr, R, 0, .001, 'highpass', 2500, .7, 1); D.ring(o, sr, 0, [[920 * j(R, .15), .12, .7], [1720 * j(R, .12), .08, 1], [2650 * j(R, .1), .06, .8], [3900 * j(R, .1), .04, .6], [5600, .025, .4]], .8, R, .03);
    crunch(o, sr, R, .003, .12, 260, .1, 4000, 9000, 'click'); },
  sheetmetal(o, sr, R) { burst(o, sr, R, 0, .0015, 'highpass', 1800, .7, .9); D.ring(o, sr, 0, [[280 * j(R, .15), .15, 1], [520 * j(R, .12), .1, .8], [860, .08, .6], [1300, .05, .45], [2100, .03, .3]], 1, R, .04);
    crunch(o, sr, R, .006, .14, 200, .1, 900, 2600, 'click'); },
  glass(o, sr, R) { burst(o, sr, R, 0, .0009, 'highpass', 3000, .7, 1.1); D.ring(o, sr, 0, [[2400 * j(R, .1), .03, 1], [4100, .02, .7], [6300, .012, .5]], .4, R);
    D.grains(o, sr, R, { t0: .01, t1: .6, rate: 90, rate1: 8, amp: .3, amp1: .06, kind: 'ping', fLo: 2500, fHi: 9500, tauLo: .01, tauHi: .04 }); },
  carpet(o, sr, R) { burst(o, sr, R, 0, .01, 'lowpass', 900, .7, 1, 'pink', .0005); thud(o, sr, 0, 150, .01, .5); dust(o, sr, R, .003, .05, .1, 1200); },
  rubber(o, sr, R) { burst(o, sr, R, 0, .012, 'lowpass', 800, .7, 1, 'pink', .0005); thud(o, sr, 0, 130, .02, .7); },
  dirt(o, sr, R) { thud(o, sr, 0, 160, .008, .4); burst(o, sr, R, 0, .03, 'bandpass', 1600 * j(R, .2), .7, 1.1, 'pink', .001); burst(o, sr, R, .002, .05, 'bandpass', 3000, .8, .3, 'white', .004); crunch(o, sr, R, .03, .3, 120, .07, 600, 2200, 'noise', .002, .005); },
  grass(o, sr, R) { thud(o, sr, 0, 150, .012, .7); burst(o, sr, R, 0, .03, 'bandpass', 1500, .7, .6, 'pink', .001); swish(o, sr, R, 0, .08, 3600, .25); },
  sand(o, sr, R) { thud(o, sr, 0, 140, .012, .7); burst(o, sr, R, 0, .07, 'highpass', 2200, .7, .55, 'white', .002); crunch(o, sr, R, .02, .25, 300, .03, 3000, 9000, 'click'); },
  snow(o, sr, R) { thud(o, sr, 0, 130, .014, .65); burst(o, sr, R, 0, .04, 'bandpass', 1300, .8, .5, 'pink', .002); },
  mud(o, sr, R) { thud(o, sr, 0, 120, .016, .8); const s = D.white(D.len(.12, sr), R); D.env(s, sr, .002, .03); D.sweep(s, sr, 'bandpass', 900, 350, 2, .08); D.add(o, s, 0, sr, .9); D.bubble(o, sr, .02, 300, .02, 1.2, .2); },
  water(o, sr, R) { D.bubble(o, sr, 0, 900 + R() * 500, .015, 3, .5); burst(o, sr, R, 0, .07, 'bandpass', 2200, .8, .8, 'white', .001);
    for (let i = 0; i < 8; i++) D.bubble(o, sr, .05 + R() * .35, 900 + R() * 2500, .004 + R() * .01, 2.5, .08 + R() * .1); },
  flesh(o, sr, R) { fleshHit(o, sr, R, 0, 1, 1); },
};
IMP.brick = (o, sr, R) => { burst(o, sr, R, 0, .002, 'bandpass', 1900 * j(R, .2), .8, 1.1); thud(o, sr, 0, 190, .01, .45); debris(o, sr, R, .01, .45, 180, .14, 1100, 4500); dust(o, sr, R, .004, .12, .16, 1600); };
IMP.plaster = (o, sr, R) => { burst(o, sr, R, 0, .0025, 'bandpass', 1500, .8, 1); thud(o, sr, 0, 170, .012, .4); crunch(o, sr, R, .005, .25, 600, .05, 3000, 8000, 'click'); dust(o, sr, R, .003, .15, .2, 3000); };
IMP.gravel = (o, sr, R) => { burst(o, sr, R, 0, .0016, 'bandpass', 2400, .8, .9); thud(o, sr, 0, 170, .01, .5); debris(o, sr, R, .005, .3, 300, .2, 1500, 6000); };
for (const s of IMPACT_SURFS) def('imp:' + s, { dur: s === 'glass' ? .7 : s === 'water' ? .5 : s === 'metal' || s === 'sheetmetal' ? .55 : .42, vars: 4, sr: 32000,
  lvl: { s50: s === 'flesh' ? -20 : -21, max: -3 }, tags: ['impact'], crit: true, gen: (o, sr, R) => { IMP[s](o, sr, R); D.filt(o, sr, 'highpass', 60, .7); } });
// ricochet: the deformed bullet tumbles away, a whining Doppler glide with flutter
def('ric', { dur: .55, vars: 6, lvl: { s50: -22, max: -4 }, tags: ['impact'], gen: (o, sr, R) => {
  const d = .22 + R() * .28, f0 = 2400 + R() * 2600, f1 = f0 * (.35 + R() * .3), wh = D.tone(D.len(d, sr), sr, f0, f1, { glide: d, vib: .015 + R() * .02, vibHz: 35 + R() * 50 });
  D.am(wh, sr, 60 + R() * 50, .5, R); D.envPts(wh, sr, [[0, 0], [.006, 1], [d * .5, .55], [d, 0]]); D.add(o, wh, 0, sr, .45);
  const nb = D.white(D.len(d, sr), R); D.sweep(nb, sr, 'bandpass', f0 * 1.1, f1 * 1.1, 6, d); D.envPts(nb, sr, [[0, 0], [.005, 1], [d * .6, .4], [d, 0]]); D.add(o, nb, 0, sr, .9);
  burst(o, sr, R, 0, .0012, 'highpass', 2500, .7, .5);
} });
// bullets passing the ear
def('whiz:super', { dur: .14, vars: 5, lvl: { s50: -17, max: -.5 }, tags: ['whiz'], crit: true, gen: (o, sr, R) => {
  const c = D.nwave(D.len(.003, sr), sr, .00026 + R() * .00018); D.addAt(o, c, 0, 1);
  const h = D.white(D.len(.03, sr), R); D.env(h, sr, .00005, .0014); D.filt(h, sr, 'highpass', 2600, .7); D.addAt(o, h, 0, .5);
  D.delayAdd(o, sr, .0025 + R() * .004, .4, 5000);
  const z = D.white(D.len(.09, sr), R); D.env(z, sr, .002, .02); D.sweep(z, sr, 'bandpass', 4200, 1700, 2.2, .08); D.add(o, z, .001, sr, .5);
  D.filt(o, sr, 'highpass', 300, .7); D.scale(o, 1 / Math.max(1e-6, D.peakOf(o))); D.shape(o, 3);
} });
def('whiz:sub', { dur: .32, vars: 5, lvl: { s50: -22, max: -3 }, tags: ['whiz'], crit: true, gen: (o, sr, R) => {
  const d = .26, n = D.white(D.len(d, sr), R); D.sweep(n, sr, 'bandpass', 3400 * j(R, .15), 1100, 4.5, d); D.bell(n, sr, 0, .07 + R() * .02, d); D.add(o, n, 0, sr, 1.6);
  const t = D.tone(D.len(d, sr), sr, 1900 * j(R, .1), 650, { glide: d, vib: .02, vibHz: 55 }); D.bell(t, sr, 0, .075, d); D.add(o, t, 0, sr, .18);
} });
def('whiz:pellet', { dur: .3, vars: 4, lvl: { s50: -22, max: -3 }, tags: ['whiz'], gen: (o, sr, R) => {
  for (let i = 0; i < 4 + R() * 3; i++) { const d = .12 + R() * .1, at = R() * .05, n = D.white(D.len(d, sr), R); D.sweep(n, sr, 'bandpass', (2800 + R() * 2400), 900 + R() * 600, 5, d); D.bell(n, sr, 0, d * .35, d); D.add(o, n, at, sr, .7); }
} });

// ------------------------------------------------------------------ hits, kill confirm, hurt
function fleshHit(o, sr, R, at, amp, bright) {
  thud(o, sr, at, 175 * j(R, .15), .012, amp * .5);
  burst(o, sr, R, at, .004, 'bandpass', 1900 * bright * j(R, .15), 1, amp * .9);
  burst(o, sr, R, at, .007, 'bandpass', 1250 * bright * j(R, .15), 1.1, amp * 1.3);
  const wv = D.pink(D.len(.12, sr), R); D.env(wv, sr, .002, .028); D.sweep(wv, sr, 'bandpass', 950 * bright, 420, 1.6, .07); D.add(o, wv, at + .002, sr, amp * 1.1);
  burst(o, sr, R, at, .0008, 'highpass', 2500, .7, amp * .35);
}
def('hit:body', { dur: .25, vars: 4, lvl: { s50: -19, max: -3 }, tags: ['hit'], crit: true, gen: (o, sr, R) => fleshHit(o, sr, R, 0, 1, 1) });
def('hit:armor', { dur: .3, vars: 4, lvl: { s50: -19, max: -3 }, tags: ['hit'], crit: true, gen: (o, sr, R) => {
  thud(o, sr, 0, 140 * j(R, .1), .016, .9); burst(o, sr, R, 0, .002, 'bandpass', 3100 * j(R, .15), 1, .9);
  D.ring(o, sr, 0, [[1100 * j(R, .1), .025, 1], [2350 * j(R, .1), .018, .6], [3700, .01, .4]], .3, R); burst(o, sr, R, .002, .02, 'bandpass', 2000, .9, .25, 'pink', .003);
} });
def('hit:helmet', { dur: .45, vars: 4, lvl: { s50: -18, max: -2 }, tags: ['hit'], crit: true, gen: (o, sr, R) => {
  burst(o, sr, R, 0, .0009, 'highpass', 2500, .7, 1); D.ring(o, sr, 0, [[2250 * j(R, .06), .1, 1], [3650 * j(R, .06), .07, .8], [5150 * j(R, .05), .045, .6], [6900, .03, .4]], .9, R, .02);
  thud(o, sr, 0, 160, .012, .5);
} });
def('hit:head', { dur: .3, vars: 4, lvl: { s50: -18, max: -2 }, tags: ['hit'], crit: true, gen: (o, sr, R) => { burst(o, sr, R, 0, .0014, 'bandpass', 2600, .9, 1.2); fleshHit(o, sr, R, .001, .9, 1.35); } });
def('hit:tick', { dur: .08, vars: 2, lvl: { s50: -30, max: -12 }, tags: ['hit', 'ui'], crit: true, gen: (o, sr, R) => { D.ring(o, sr, 0, [[1850, .012, 1], [3700, .006, .4]], 1, R); burst(o, sr, R, 0, .0006, 'highpass', 3000, .7, .3); } });
def('kill', { dur: .4, vars: 2, lvl: { s50: -24, max: -8 }, tags: ['hit', 'ui'], crit: true, gen: (o, sr, R) => {
  thud(o, sr, 0, 92, .05, 1, .55); D.ring(o, sr, .03, [[2350, .02, 1], [4700, .01, .3]], .35, R); burst(o, sr, R, 0, .004, 'lowpass', 800, .7, .3, 'pink', .001);
} });
def('kill:head', { dur: .6, vars: 2, lvl: { s50: -23, max: -6 }, tags: ['hit', 'ui'], crit: true, gen: (o, sr, R) => {
  thud(o, sr, 0, 88, .06, 1, .5); D.ring(o, sr, .025, [[3150, .12, 1], [4920, .08, .6], [7300, .05, .3]], .5, R); burst(o, sr, R, .025, .0008, 'highpass', 3000, .7, .3);
} });
function breath(o, sr, R, at, dur, amp, vowel = 'uh', voiced = 0) {
  const F = { uh: [620, 1150, 2500], ah: [750, 1250, 2600], eh: [520, 1750, 2500], hh: [900, 1800, 2900] }[vowel];
  const src = D.pink(D.len(dur, sr), R);
  if (voiced) { const p = D.tone(D.len(dur, sr), sr, voiced * j(R, .08), voiced * .8, { shape: 'saw', vib: .02, vibHz: 6 }); for (let i = 0; i < src.length; i++) src[i] = src[i] * .6 + p[i] * .5; }
  const out = new Float32Array(src.length);
  for (const [k, f] of F.entries()) { const b = src.slice(); D.filt(b, sr, 'bandpass', f * j(R, .05), 5 - k); D.addAt(out, b, 0, [1, .6, .3][k] * 3); }
  D.filt(out, sr, 'highpass', 150, .7); D.envPts(out, sr, [[0, 0], [dur * .15, 1], [dur * .45, .6], [dur, 0]]); D.add(o, out, at, sr, amp);
}
const HURT = { s: [.5, .5, 0], m: [.8, .8, 0], l: [1, 1, 110] };
for (const [k, [im, br, v]] of Object.entries(HURT)) def('hurt:' + k, { dur: .6, vars: 3, lvl: { s50: k === 's' ? -22 : k === 'm' ? -19 : -16, max: -3 }, tags: ['hit'], crit: true, gen: (o, sr, R) => {
  thud(o, sr, 0, 72 * j(R, .1), .05, im, .55); burst(o, sr, R, 0, .03, 'lowpass', 350, .7, im * .6, 'pink', .001); fleshHit(o, sr, R, 0, im * .5, .8);
  breath(o, sr, R, .03 + R() * .03, .22 + R() * .1, br * .5, R() < .5 ? 'uh' : 'hh', v ? v * j(R, .1) : 0);
} });
// voice efforts (synthesised breath through vocal-tract formants; kept short and breathy so they never sound robotic)
def('vo:cough', { dur: 1.7, vars: 4, sr: 24000, lvl: { s50: -21, max: -4 }, tags: ['vo'], gen: (o, sr, R) => {
  let t = 0; for (let i = 0; i < 2 + R() * 2; i++) { const d = .13 + R() * .08; breath(o, sr, R, t, d, 1, R() < .5 ? 'ah' : 'uh', 105 + R() * 40); burst(o, sr, R, t, .02, 'bandpass', 1500, 1, .5, 'pink', .002); t += d + .08 + R() * .18; }
} });
def('vo:pain', { dur: .5, vars: 4, lvl: { s50: -22, max: -4 }, tags: ['vo'], gen: (o, sr, R) => { breath(o, sr, R, 0, .22 + R() * .12, 1, R() < .5 ? 'uh' : 'eh', 115 + R() * 35); } });
def('vo:death', { dur: .8, vars: 4, lvl: { s50: -23, max: -4 }, tags: ['vo'], gen: (o, sr, R) => { breath(o, sr, R, 0, .35 + R() * .2, 1, 'uh', 100 + R() * 25); breath(o, sr, R, .45, .25, .4, 'hh', 0); } });
def('vo:exhale', { dur: .45, vars: 3, lvl: { s50: -32, max: -12 }, tags: ['vo'], gen: (o, sr, R) => breath(o, sr, R, 0, .35, 1, 'hh', 0) });
def('vo:breath', { dur: 1.6, vars: 2, sr: 24000, lvl: { s50: -30, max: -10 }, tags: ['vo'], gen: (o, sr, R) => { breath(o, sr, R, 0, .55, .8, 'hh', 0); breath(o, sr, R, .7, .65, 1, 'uh', 0); } });
// a body falling with its kit
for (const c of ['hard', 'metal', 'wood', 'soft', 'water']) def('fall:' + c, { dur: .8, vars: 3, sr: 32000, lvl: { s50: -20, max: -4 }, tags: ['foley'], gen: (o, sr, R) => {
  thud(o, sr, 0, 95 * j(R, .1), .06, 1, .5); thud(o, sr, .08 + R() * .05, 120, .03, .6);
  burst(o, sr, R, 0, .04, 'lowpass', c === 'soft' ? 500 : 1400, .7, .8, 'pink', .003); swish(o, sr, R, 0, .3, 1800, .4);
  if (c !== 'soft' && c !== 'water') for (let i = 0; i < 3 + R() * 3; i++) D.strike(o, sr, .03 + R() * .25, R, { modes: [[c === 'metal' ? 700 : 1100 * j(R, .3), .03, 1], [2300 * j(R, .3), .02, .6]], amp: .25 + R() * .25, click: .3, noise: .5, nf: 2500 });
  if (c === 'metal') D.ring(o, sr, 0, [[150, .2, 1], [330, .12, .7], [610, .08, .5]], .5, R);
  if (c === 'wood') D.ring(o, sr, 0, [[140, .05, 1], [260, .03, .6]], .8, R);
  if (c === 'water') { burst(o, sr, R, 0, .15, 'bandpass', 1200, .7, 1, 'white', .005); for (let i = 0; i < 10; i++) D.bubble(o, sr, R() * .3, 300 + R() * 900, .01 + R() * .03, 2, .1); }
} });
