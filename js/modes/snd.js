/* LIVE FIRE — Search and Destroy (ModeDef, docs §8): the classic one-life bomb mode without an economy. Everyone spawns with their
   own Profile loadout every round; planting takes 4 s, the fuse is 45 s, defusing 7.5 s (no kits). 12 rounds (first to 7), halftime
   swap, a 6-6 tie goes to sudden-death rounds.
   Exports: default ModeDef */
import { bombMode } from './common.js';

export default bombMode({
  id: 'snd', name: 'Search and Destroy', rounds: 12, winRounds: 7, roundTime: 150, freezeTime: 6, buyTime: 0, economy: false, loadouts: true,
  timeLimit: 0, scoreLimit: 0, maxPlayers: 12, minPlayers: 2, sizes: ['M', 'L'], overtime: { rounds: 1 },
  bomb() { return { plant: 4, fuse: 45, defuse: 7.5, kit: 7.5 }; },
});
