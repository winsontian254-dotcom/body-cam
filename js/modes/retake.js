/* LIVE FIRE — Retake (ModeDef, docs §8): the charge is already planted on a random site when the round starts. Attackers (team 1)
   spawn on the site and hold it; defenders (team 2) spawn 22-45 m away and must retake the site and defuse before the 40 s fuse runs
   out (killing every attacker is not enough: the charge still has to be defused). Fixed loadouts by side (rifle + pistol + armour +
   one utility grenade; half of the defenders carry a kit), no economy, 3 s freeze, 16 rounds (first to 9), halftime swap.
   Exports: default ModeDef */
import { bombMode, spotNear, info } from './common.js';
import { makeWeapon, newWeaponState } from '../game/weapon.js';

const ATT = ['purga', 'warden', 'taiga', 'kroha'], DEF = ['warden', 'habicht', 'switchback', 'spatz'], NADE = ['flash', 'smoke', 'molotov', 'frag', 'flash'];

export default bombMode({
  id: 'retake', name: 'Retake', rounds: 16, winRounds: 9, roundTime: 60, freezeTime: 3, buyTime: 0, economy: false, loadouts: false,
  timeLimit: 0, scoreLimit: 0, maxPlayers: 10, minPlayers: 2, sizes: ['M', 'L'], overtime: { rounds: 2 }, spawnLobbyEveryRound: false,
  bomb(game) { return { preplant: true, pickTarget: () => info(game).site }; },
  beforeRound(game) {
    // choose the site now (spawns depend on it); objectives.bombReset plants on the same target
    const S = (game.map && game.map.sites) || {}, names = Object.keys(S);
    const I = info(game); I.site = names.length ? names[Math.floor(game.rng() * names.length)] : null; I.used = [];
  },
  spawnSpot(game, p) {
    const I = info(game), S = (game.map && game.map.sites) || {}, site = S[I.site];
    if (!site) return null;
    const c = { x: site.x, y: site.y, z: site.z };
    return p.team === 1 ? spotNear(game, c, 0.5, 9, { used: I.used, dy: 2.5 }) || spotNear(game, c, 0, 14, { used: I.used })
      : spotNear(game, c, 24, 46, { used: I.used, face: c }) || spotNear(game, c, 16, 60, { used: I.used, face: c });
  },
  onSpawn(game, p) {
    const r = game.rng, list = p.team === 1 ? ATT : DEF;
    p.inv.primary = makeWeapon(list[Math.floor(r() * list.length)]);
    p.inv.secondary = makeWeapon(p.team === 1 ? 'vogt9' : 'shizuka');
    p.inv.melee = makeWeapon('knife');
    const n = NADE[Math.floor(r() * NADE.length)]; p.inv.nades = [{ gid: n, n: 1 }]; p.curNade = n;
    p.inv.kit = p.team === 2 && r() < 0.5; p.armor = 100; p.helmet = true; p.inv.bomb = false;
    p.cur = 'primary'; p.ws = newWeaponState(); p.ws.state = 'draw'; p.ws.dur = 0.4;
  },
});
