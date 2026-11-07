/* LIVE FIRE — ambience runtime: looping beds (stereo pairs, non-positional) plus one-shot events placed in the world around
   the listener (positional, distance-filtered, delayed), per map type.
   Exports: AMB (kind -> { beds: [[layer, dB]], ev: [[event, mean seconds]], indoor }), AMB_ALIAS (map ids / synonyms -> kind),
            class Ambience: new Ambience(engine); set(kind, { rain: 0..1, wind: 0..1 }); stop(); tick(dt) (event scheduler step:
            its own 250 ms timer live; tests call it on an offline engine); kind */
export const AMB = {
  harbor:   { beds: [['harbor_water', -1], ['wind', -6], ['city', -14]], ev: [['gull', 7], ['crane', 18], ['horn', 55], ['buoy', 24], ['clank', 25]] },
  office:   { beds: [['hvac', 0], ['city', -18]], ev: [['ding', 40], ['creak', 30], ['door', 35]], indoor: true },
  desert:   { beds: [['wind_desert', 0]], ev: [['gust', 14], ['heli', 90], ['jet', 120]] },
  city:     { beds: [['city', 0], ['wind', -10]], ev: [['carpass', 9], ['siren', 35], ['honk', 20], ['heli', 120]] },
  snow:     { beds: [['wind_snow', 0], ['forest', -8]], ev: [['gust', 12], ['creak', 25]] },
  hospital: { beds: [['hum', 0], ['hvac', -6]], ev: [['monitor', 20], ['drip', 9], ['creak', 25], ['door', 40]], indoor: true },
  mall:     { beds: [['mall', 0]], ev: [['chime', 45], ['door', 30], ['clank', 50]], indoor: true },
  metro:    { beds: [['metro', 0], ['hum', -8]], ev: [['train', 50], ['drip', 7], ['chime', 70], ['clank', 30]], indoor: true },
  refinery: { beds: [['refinery', 0], ['wind', -8]], ev: [['steam', 12], ['clank', 15], ['buzzer', 80]] },
  farm:     { beds: [['crickets', 0], ['wind', -9]], ev: [['owl', 25], ['bird', 18], ['creak', 40]] },
  ship:     { beds: [['ship_engine', -2], ['waves', -2], ['storm_wind', -4]], ev: [['thunder', 20], ['clank', 12], ['creak', 10]] },
  village:  { beds: [['wind', -3], ['birds', -2]], ev: [['bell', 120], ['bird', 10], ['gust', 25]] },
  prison:   { beds: [['hum', 0], ['wind', -12]], ev: [['buzzer', 40], ['door', 18], ['clank', 25]] },
  lab:      { beds: [['server', 0], ['hvac', -4]], ev: [['ding', 50], ['monitor', 40]], indoor: true },
  construction: { beds: [['wind', -2], ['city', -8]], ev: [['hammer', 14], ['drill', 22], ['clank', 18], ['crane', 40]] },
  estate:   { beds: [['crickets', -3], ['wind', -6]], ev: [['owl', 30], ['creak', 25]] },
  factory:  { beds: [['wind', -4], ['room', 0]], ev: [['drip', 6], ['creak', 12], ['clank', 20], ['gust', 25]] },
  bazaar:   { beds: [['wind_desert', -6], ['crowd', -3], ['birds', -8]], ev: [['bell', 150], ['bird', 15], ['door', 30]] },
  dam:      { beds: [['dam_water', 0], ['wind', -6]], ev: [['clank', 20], ['buzzer', 90], ['steam', 40]] },
  suburb:   { beds: [['birds', -2], ['wind', -8], ['city', -14]], ev: [['carpass', 25], ['bird', 10], ['honk', 60]] },
  club:     { beds: [['club', 0], ['room', -4]], ev: [['door', 25], ['creak', 40]], indoor: true },
  hangar:   { beds: [['hangar', 0], ['wind', -8]], ev: [['jet', 50], ['clank', 30], ['ding', 90]] },
  railyard: { beds: [['wind', -3], ['city', -12]], ev: [['train', 70], ['clank', 15], ['horn', 90], ['creak', 20]] },
  interchange: { beds: [['wind', -2], ['city', -8]], ev: [['siren', 30], ['heli', 60], ['carpass', 40]] },
  outpost:  { beds: [['wind_desert', 0]], ev: [['heli', 50], ['jet', 80], ['gust', 15], ['clank', 30]] },
  storm:    { beds: [['storm_wind', 0]], ev: [['thunder', 15], ['gust', 10]] },
  outdoor:  { beds: [['wind', -2]], ev: [['bird', 25], ['gust', 30]] },
  indoor:   { beds: [['room', 0], ['hvac', -10]], ev: [['creak', 40]], indoor: true },
  menu:     { beds: [['wind', -12]], ev: [] },
  none:     { beds: [], ev: [] },
};
export const AMB_ALIAS = { tower: 'office', motel: 'desert', bank: 'city', downtown: 'city', traffic: 'city', street: 'city', lodge: 'snow', ski: 'snow', nightclub: 'club',
  freighter: 'ship', sea: 'ship', ocean: 'ship', port: 'harbor', docks: 'harbor', industrial: 'factory', warehouse: 'factory', airport: 'hangar', jungle: 'farm',
  countryside: 'farm', crickets: 'farm', dusk: 'farm', subway: 'metro', station: 'metro', underground: 'metro', clinic: 'hospital', shopping: 'mall', server: 'lab',
  dust: 'desert', rural: 'farm', highway: 'interchange', base: 'outpost', rain: 'outdoor', fog: 'outdoor', silent: 'none', off: 'none' };
// where events happen: [min, max] metres from the listener
const EVD = { drip: [3, 15], creak: [5, 25], door: [8, 35], ding: [8, 30], monitor: [5, 20], chime: [15, 40], buzzer: [20, 60], hammer: [30, 90], drill: [30, 90],
  bird: [10, 50], owl: [30, 90], gull: [20, 80], clank: [25, 110], steam: [20, 80], crane: [40, 140], carpass: [40, 140], honk: [60, 200], siren: [150, 500],
  horn: [250, 700], buoy: [80, 250], train: [60, 200], thunder: [800, 3000], heli: [250, 900], jet: [800, 3000], bell: [200, 600], gust: [10, 40] };
const rnd = (a, b) => a + Math.random() * (b - a);

export class Ambience {
  constructor(E) { this.E = E; this.kind = null; this.key = ''; this.beds = new Set(); this.ev = []; this.timer = null; }
  set(kind, o = {}) {
    let k = String(kind || 'none').toLowerCase(); k = AMB[k] ? k : AMB_ALIAS[k] || 'outdoor';
    const K = AMB[k], rain = Math.max(0, Math.min(1, +o.rain || (o.rain === true ? 1 : 0))), wind = Math.max(0, Math.min(1, +o.wind || (o.wind === true ? 1 : 0)));
    const key = k + '|' + rain.toFixed(2) + '|' + wind.toFixed(2); if (key === this.key) return; this.key = key; this.kind = k;
    const want = new Map(K.beds.map(([n, dB]) => [n, dB]));
    if (rain > 0) want.set(K.indoor ? 'rain_roof' : 'rain', 20 * Math.log10(rain) + (K.indoor ? -2 : 0));
    if (wind > 0) want.set(k === 'snow' ? 'wind_snow' : k === 'desert' || k === 'outpost' ? 'wind_desert' : wind > .7 ? 'storm_wind' : 'wind', (want.get('wind') || -6) + 6 * wind);
    const E = this.E, B = E.B;
    for (const n of this.beds) if (!want.has(n)) { E.stopLoop('amb:' + n, 2.5); this.beds.delete(n); }
    for (const [n, dB] of want) {
      const id = 'amb:' + n, g = Math.pow(10, dB / 20);
      if (this.beds.has(n) && E.loops.has(id)) { const V = E.loops.get(id); V.base = g; if (E.offline) V.dg.gain.value = g; else V.dg.gain.setTargetAtTime(g, E.ctx.currentTime, .6); continue; }
      this.beds.add(n);
      const start = () => { if (!this.beds.has(n) || E.loops.has(id)) return; E.loop(id, B.get(id), { cls: 'amb', bus: 'amb', local: true, gain: g, fadeIn: 2.5, prio: 10, send: 0 }); };
      if (B.has(id)) start(); else B.request([id]).then(start);
    }
    E.ambIndoor = !!K.indoor; E.setSpace({});
    this.ev = K.ev.map(([n, mean]) => [n, mean, EVD[n] || [30, 120]]);
    if (k === 'storm' || rain > .7 && !K.indoor) this.ev.push(['thunder', 25, EVD.thunder]);
    if (this.ev.length) B.request(this.ev.map(e => 'ev:' + e[0]));
    if (!E.offline && !this.timer && this.ev.length) this.timer = setInterval(() => { try { this.tick(.25); } catch (e) { /* never break */ } }, 250);
    if (!this.ev.length && this.timer) { clearInterval(this.timer); this.timer = null; }
  }
  tick(dt) {
    for (const [n, mean, [d0, d1]] of this.ev) if (Math.random() < dt / mean) this.spawn(n, d0, d1);
  }
  spawn(n, d0 = 30, d1 = 120) {
    const E = this.E, L = E.L, a = Math.random() * Math.PI * 2, d = rnd(d0, d1);
    const pos = { x: L.x + Math.sin(a) * d, y: L.y + (d > 60 ? rnd(5, 40) : rnd(-1, 4)), z: L.z + Math.cos(a) * d };
    const v = E.voice({ cls: 'amb', bus: 'amb', pos, gain: Math.pow(10, rnd(-3, 2) / 20), key: 'ev:' + n, maxSame: 2, hrtf: d < 40, nodelay: d > 400 });
    if (v) v.add(E.B.pick('ev:' + n), { rate: rnd(.96, 1.04) });
  }
  stop() { for (const n of this.beds) this.E.stopLoop('amb:' + n, 2); this.beds.clear(); this.key = ''; this.kind = null; this.ev = []; if (this.timer) { clearInterval(this.timer); this.timer = null; } }
}
