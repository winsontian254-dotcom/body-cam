# LIVE FIRE (repo: body-cam) — notes for Claude

LIVE FIRE is an original, realistic, body-cam-styled tactical team shooter (genre: CS-like round-based and
respawn modes) for the browser, built on Babylon.js. Multiplayer is peer-to-peer (PeerJS); accounts are the
owner's Neon Veins accounts (same server, shared login). The full module contract is `docs/ARCHITECTURE.md`:
read it before changing anything, and update it in the same change when a contract changes.

## Rules
- No build step and no npm runtime dependencies: ES modules under `js/`, Babylon 9.31.0 + loaders from jsdelivr
  (global `BABYLON`), PeerJS 1.5.4 lazy-loaded. `tools/` may use Node + the pre-installed Playwright for tests only.
- Original content only: fictional weapon names and makers, original maps, UI and sounds. Real firearm archetypes are fine.
- Friendly fire is OFF in every mode: all harm goes through `game.damage()`, which drops team damage/effects.
- WebGL2 only (no WebGPU by default).
- Assets: only CC0 (Poly Haven, ambientCG) or the owner's own (Neon Veins human kit, gloves). Every file is listed in
  `assets/manifest.json` with licence and source. Keep textures 1K (2K only for a few hero surfaces), JPG for colour,
  and keep the repo lean (no 4K, no raw downloads, no zips).
- A change is done only when `node tools/test/smoke.mjs` boots the game with zero console errors and you have looked
  at a screenshot of what you changed. Headless WebGL is SwiftShader (slow): small viewports, quality low, drive the
  sim through `window.LF` instead of waiting real time.
- Multiple workers edit this repo at the same time: only edit files you own (see the brief you were given); for shared
  files (`index.html`, `js/main.js`, `js/game/game.js`, `docs/ARCHITECTURE.md`, this file) use small targeted edits,
  never rewrite them whole. Do not commit unless your brief says so; the coordinator commits.

## Testing
- `node tools/serve.mjs 8080` serves the repo; `tools/test/lib.mjs` has `startServer`, `launch`, `openGame`, `waitFor`, `shot`, `errors`.
- Dev hash: `#dev&map=<id>&mode=<id>&bots=<n>&team=1|2&q=low&autostart&seed=<n>&nolens&peer=host:port` (`&sandbox` walks a map
  with the movement code, `&nodyn` fixes the resolution for screenshots). `node tools/test/phys.mjs` = physics/nav unit tests,
  `node tools/test/mapcheck.mjs <id> --shots` = build + validate + overview shots of a map.
- `node tools/test/match.mjs` plays real matches through `LF.game.debugStep` (TDM / FFA / combat rules / menu flow); `#dev&...&autostart`
  starts a match from the dev hash (`&botmode=static` for target practice, `&freeze=0`, `&score=n`).
- Screenshots go to `tools/test/out/` (git-ignored).

## Deploy
- GitHub Pages for this repo serves `https://winsontian254-dotcom.github.io/body-cam/` (same origin as Neon Veins, which is
  what makes the shared login work). The owner enables Pages for the branch in the repo settings.
