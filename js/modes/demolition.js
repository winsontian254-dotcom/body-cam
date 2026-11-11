/* LIVE FIRE — Demolition (ModeDef, docs §8): competitive bomb defusal. Attackers (team 1) carry the charge to site A or B, plant it
   (3.2 s) and defend it for the 40 s fuse; defenders (team 2) stop the plant or defuse (10 s, 5 s with a kit). One life per round,
   12 s freeze + 20 s buy time, the full economy (start $800, max $16000, loss ladder, plant / defuse bonuses). 24 rounds (MR12, first
   to 13), sides swap at halftime with a money reset; 12-12 goes to MR3 overtime halves with $10000.
   Exports: default ModeDef */
import { bombMode } from './common.js';

export default bombMode({
  id: 'demolition', name: 'Demolition', rounds: 24, winRounds: 13, roundTime: 115, freezeTime: 12, buyTime: 20, economy: true, loadouts: false,
  timeLimit: 0, scoreLimit: 0, maxPlayers: 10, minPlayers: 2, sizes: ['M', 'L'], overtime: { rounds: 6, money: 10000 },
});
