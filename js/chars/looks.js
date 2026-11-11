/* LIVE FIRE — team looks: two original kits (VANGUARD: tan / coyote / an organic multi-tone camo, orange ID patches; SENTINEL:
   navy / black / urban grey with a digital camo, blue ID patches) plus a neutral contractor kit for free-for-all, six variants
   each, picked deterministically from the player id. PURE JS.
   Exports:
     TEAM_KIT { 0, 1, 2 } -> [variant]     variant = { id, name, top, bottom (camo: { kind: 0 solid | 1 organic | 2 digital, c: [4 hex] }),
                                           gear, web, glove, boot, shell, mask (hex), vest 'plate'|'rig'|'light', pack null|'assault'|
                                           'radio'|'hydro', helmet 'highcut'|'cover'|'cap', nvg bool, face 'bala'|'gaiter', eyes 'goggles'|
                                           'glasses'|'none', knee bool, holster 'leg'|'belt' }
     ACCENT { 0, 1, 2 }                    ID patch colours
     SKIN                                  six skin tones
     lookFor(p) -> look                    { team, variant, skin, accent }  (deterministic per player id and team)
     paletteOf(look) -> { slot: [r, g, b, a] }   the palette row for kit.js setPaletteRow
     hashStr(s) -> uint32 */
import { SLOT } from './kit.js';

export function hashStr(s) { let h = 0x811c9dc5; s = String(s); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

// camo colour sets (sRGB hex): base, layer 1, layer 2, layer 3
const CAMO = {
  // VANGUARD: an original soft multi-tone pattern (tan base, khaki, brown and olive blobs)
  vgMulti: { kind: 1, c: ['#a08a64', '#c4b28a', '#6b5236', '#6f6b44'] },
  vgArid: { kind: 1, c: ['#b6a17c', '#cdbd99', '#93795a', '#a3976c'] },
  coyote: { kind: 0, c: ['#7c6a4d', '#7c6a4d', '#7c6a4d', '#7c6a4d'] },
  tan: { kind: 0, c: ['#a8946f', '#a8946f', '#a8946f', '#a8946f'] },
  ranger: { kind: 0, c: ['#4f5543', '#4f5543', '#4f5543', '#4f5543'] },
  // SENTINEL: navy / black / urban greys, an original digital urban pattern
  navy: { kind: 0, c: ['#252b3b', '#252b3b', '#252b3b', '#252b3b'] },
  black: { kind: 0, c: ['#1d1e21', '#1d1e21', '#1d1e21', '#1d1e21'] },
  slate: { kind: 0, c: ['#3d4658', '#3d4658', '#3d4658', '#3d4658'] },
  urbanGrey: { kind: 0, c: ['#62666b', '#62666b', '#62666b', '#62666b'] },
  snDigital: { kind: 2, c: ['#555b64', '#3a3f48', '#80858c', '#262a32'] },
  snDark: { kind: 2, c: ['#2e3442', '#22262f', '#4a5160', '#171a20'] },
  // free-for-all contractors
  olive: { kind: 0, c: ['#565a40', '#565a40', '#565a40', '#565a40'] },
  khaki: { kind: 0, c: ['#8c7f60', '#8c7f60', '#8c7f60', '#8c7f60'] },
  charcoal: { kind: 0, c: ['#38393c', '#38393c', '#38393c', '#38393c'] },
  woodland: { kind: 1, c: ['#5b5a3e', '#7c7650', '#3d3427', '#2c3424'] },
};
export const ACCENT = { 0: '#c9c4b8', 1: '#f27b1f', 2: '#2f8dff' };
export const SKIN = ['#e3b8a0', '#cf9f80', '#ae7b5a', '#8e5d40', '#6c4532', '#4b2f22'];

const V = (id, name, o) => ({ id, name, ...o });
export const TEAM_KIT = {
  1: [
    V('v1', 'Assaulter', { top: CAMO.vgMulti, bottom: CAMO.vgMulti, gear: '#7a6849', web: '#5d4f39', glove: '#2a2724', boot: '#6b583f', shell: '#8a7656', mask: '#7f6d50', vest: 'plate', pack: null, helmet: 'highcut', nvg: true, face: 'bala', eyes: 'glasses', knee: true, holster: 'leg' }),
    V('v2', 'Breacher', { top: CAMO.coyote, bottom: CAMO.vgMulti, gear: '#4f5543', web: '#3f4436', glove: '#6a5a43', boot: '#5a4a36', shell: '#4f5543', mask: '#3f4436', vest: 'rig', pack: 'assault', helmet: 'cover', nvg: false, face: 'gaiter', eyes: 'goggles', knee: true, holster: 'belt' }),
    V('v3', 'Marksman', { top: CAMO.vgArid, bottom: CAMO.vgArid, gear: '#8d7a58', web: '#6c5d43', glove: '#6a5a43', boot: '#6b583f', shell: '#8a7656', mask: '#8d7a58', vest: 'light', pack: 'radio', helmet: 'cap', nvg: false, face: 'gaiter', eyes: 'glasses', knee: false, holster: 'leg' }),
    V('v4', 'Pointman', { top: CAMO.tan, bottom: CAMO.vgMulti, gear: '#7a6849', web: '#5d4f39', glove: '#2a2724', boot: '#4b3b2a', shell: '#4f5543', mask: '#a08a64', vest: 'plate', pack: null, helmet: 'highcut', nvg: true, face: 'bala', eyes: 'goggles', knee: true, holster: 'belt' }),
    V('v5', 'Rifleman', { top: CAMO.vgMulti, bottom: CAMO.coyote, gear: '#7a6849', web: '#5d4f39', glove: '#6a5a43', boot: '#6b583f', shell: '#8a7656', mask: '#7f6d50', vest: 'plate', pack: 'hydro', helmet: 'cover', nvg: true, face: 'bala', eyes: 'glasses', knee: false, holster: 'leg' }),
    V('v6', 'Signaller', { top: CAMO.ranger, bottom: CAMO.vgMulti, gear: '#7a6849', web: '#4f5543', glove: '#2a2724', boot: '#5a4a36', shell: '#7a6849', mask: '#4f5543', vest: 'rig', pack: 'radio', helmet: 'highcut', nvg: false, face: 'gaiter', eyes: 'goggles', knee: true, holster: 'leg' }),
  ],
  2: [
    V('s1', 'Entry', { top: CAMO.navy, bottom: CAMO.black, gear: '#202124', web: '#16171a', glove: '#151517', boot: '#18181a', shell: '#1f2023', mask: '#18191c', vest: 'plate', pack: null, helmet: 'highcut', nvg: true, face: 'bala', eyes: 'goggles', knee: true, holster: 'leg' }),
    V('s2', 'Urban', { top: CAMO.snDigital, bottom: CAMO.snDigital, gear: '#4d5157', web: '#2c2f34', glove: '#1b1c1e', boot: '#1c1c1e', shell: '#45494f', mask: '#3a3e45', vest: 'rig', pack: 'assault', helmet: 'cover', nvg: false, face: 'gaiter', eyes: 'glasses', knee: true, holster: 'belt' }),
    V('s3', 'Overwatch', { top: CAMO.black, bottom: CAMO.urbanGrey, gear: '#262c3a', web: '#1b1f29', glove: '#151517', boot: '#18181a', shell: '#262c3a', mask: '#1d1e21', vest: 'light', pack: 'radio', helmet: 'cap', nvg: false, face: 'gaiter', eyes: 'glasses', knee: false, holster: 'leg' }),
    V('s4', 'Shield', { top: CAMO.slate, bottom: CAMO.navy, gear: '#1d1e21', web: '#16171a', glove: '#151517', boot: '#18181a', shell: '#1f2023', mask: '#22262f', vest: 'plate', pack: null, helmet: 'highcut', nvg: true, face: 'bala', eyes: 'glasses', knee: true, holster: 'belt' }),
    V('s5', 'Operator', { top: CAMO.urbanGrey, bottom: CAMO.snDark, gear: '#202124', web: '#16171a', glove: '#3a3c40', boot: '#1c1c1e', shell: '#3a3e45', mask: '#2c3039', vest: 'plate', pack: 'hydro', helmet: 'cover', nvg: true, face: 'bala', eyes: 'goggles', knee: true, holster: 'leg' }),
    V('s6', 'Liaison', { top: CAMO.navy, bottom: CAMO.snDark, gear: '#262c3a', web: '#1b1f29', glove: '#151517', boot: '#18181a', shell: '#262c3a', mask: '#252b3b', vest: 'rig', pack: 'radio', helmet: 'highcut', nvg: false, face: 'gaiter', eyes: 'goggles', knee: true, holster: 'belt' }),
  ],
  0: [
    V('c1', 'Contractor', { top: CAMO.olive, bottom: CAMO.khaki, gear: '#4f4a3a', web: '#38352a', glove: '#1d1d1f', boot: '#3c3226', shell: '#4f4a3a', mask: '#38393c', vest: 'plate', pack: null, helmet: 'highcut', nvg: false, face: 'gaiter', eyes: 'glasses', knee: true, holster: 'leg' }),
    V('c2', 'Ranger', { top: CAMO.woodland, bottom: CAMO.woodland, gear: '#4f5543', web: '#3f4436', glove: '#2a2724', boot: '#3c3226', shell: '#4f5543', mask: '#4f5543', vest: 'rig', pack: 'assault', helmet: 'cover', nvg: false, face: 'bala', eyes: 'goggles', knee: false, holster: 'belt' }),
    V('c3', 'Freelancer', { top: CAMO.charcoal, bottom: CAMO.khaki, gear: '#38393c', web: '#28292b', glove: '#1d1d1f', boot: '#2a2420', shell: '#38393c', mask: '#38393c', vest: 'light', pack: null, helmet: 'cap', nvg: false, face: 'gaiter', eyes: 'glasses', knee: false, holster: 'leg' }),
    V('c4', 'Veteran', { top: CAMO.khaki, bottom: CAMO.olive, gear: '#6a6044', web: '#4f4a3a', glove: '#6a5a43', boot: '#4b3b2a', shell: '#6a6044', mask: '#6a6044', vest: 'plate', pack: 'hydro', helmet: 'highcut', nvg: true, face: 'bala', eyes: 'glasses', knee: true, holster: 'belt' }),
    V('c5', 'Scout', { top: CAMO.olive, bottom: CAMO.woodland, gear: '#4f5543', web: '#3f4436', glove: '#2a2724', boot: '#3c3226', shell: '#565a40', mask: '#565a40', vest: 'light', pack: 'radio', helmet: 'cover', nvg: false, face: 'gaiter', eyes: 'goggles', knee: true, holster: 'leg' }),
    V('c6', 'Gunner', { top: CAMO.charcoal, bottom: CAMO.charcoal, gear: '#2a2b2d', web: '#1d1e21', glove: '#151517', boot: '#18181a', shell: '#2a2b2d', mask: '#2a2b2d', vest: 'plate', pack: 'assault', helmet: 'highcut', nvg: false, face: 'bala', eyes: 'goggles', knee: true, holster: 'belt' }),
  ],
};

export function lookFor(p) {
  const team = p && (p.team === 1 || p.team === 2) ? p.team : 0;
  const list = TEAM_KIT[team], h = hashStr((p && p.id) || 'x');
  return { team, variant: list[h % list.length], skin: SKIN[(h >>> 8) % SKIN.length], accent: ACCENT[team], key: team + ':' + (h % list.length) + ':' + ((h >>> 8) % SKIN.length) };
}

const hex = (h, a = 1) => { const n = parseInt(String(h).slice(1), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, a]; };
const KIND_A = [0, 0.5, 1];
export function paletteOf(look) {
  const v = look.variant, out = {};
  const camo = (s0, c) => { for (let k = 0; k < 4; k++) out[s0 + k] = hex(c.c[k], k === 0 ? KIND_A[c.kind] : 1); };
  camo(SLOT.TOP, v.top); camo(SLOT.BOTTOM, v.bottom);
  out[SLOT.GEAR] = hex(v.gear); out[SLOT.WEB] = hex(v.web); out[SLOT.SKIN] = hex(look.skin); out[SLOT.GLOVE] = hex(v.glove);
  out[SLOT.BOOT] = hex(v.boot); out[SLOT.ACCENT] = hex(look.accent); out[SLOT.SHELL] = hex(v.shell); out[SLOT.MASK] = hex(v.mask);
  return out;
}
