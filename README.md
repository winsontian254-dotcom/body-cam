# LIVE FIRE

A realistic, body-cam-styled tactical team shooter that runs in the browser. Round-based and respawn modes, teams, bots and
peer-to-peer multiplayer, built on [Babylon.js](https://www.babylonjs.com/) (WebGL2).

**Play:** https://winsontian254-dotcom.github.io/body-cam/

Sign in with your **Neon Veins** account: LIVE FIRE is served from the same address as Neon Veins, so the login is shared.

> Work in progress. Maps, modes and systems are still being added; the menus only offer maps that pass their checks.

## Features

- **Weapons:** 50 fictional guns (pistols, SMGs, rifles, shotguns, marksman and sniper rifles, LMGs), 46 attachments (optics with
  real scopes, muzzles, grips, lasers, lights, magazines) and 25 grenades.
- **Modes:** 26, from Team Deathmatch and Demolition to Hide and Seek (see below).
- **Teams:** friendly fire is **off** in every mode.
- **Maps:** real places at real scale, each with a lobby and spawn points for both teams, hiding spots, and objectives for every mode.
- **Bots:** fill empty slots and play against you.
- **Multiplayer (in development):** peer-to-peer (PeerJS) with a server browser, private games by code, lobbies and chat.
- **Rewards:** daily rewards and leaderboards on the Neon Veins account server.
- **Sound:** all synthesised (no samples), positional, with room reverb.

## Maps

Ready now: Harbor Nine, Meridian Tower, Starlite Motel, Black Creek Refinery, St. Aldric General, Switchback Yard, Terminal West,
Velvet Underground. More are being built (25 planned).

## Modes

Team Deathmatch, Free For All, Demolition, Hostage Rescue, Wingman, Retake, Search and Destroy, Elimination, Domination, Hardpoint,
King of the Hill, Capture the Flag, Kill Confirmed, Gun Game, Gun Rush, Infection, Hide and Seek, VIP Escort, Juggernaut,
One in the Chamber, Sharpshooter, Headquarters, Snipers Only, Blades Only, Hardcore, Practice.

## Controls (rebindable in Settings)

| Action | Key | Action | Key |
|---|---|---|---|
| Move | W A S D | Fire / aim down sights | Left / right mouse |
| Jump / mantle | Space | Reload | R |
| Crouch | Left Ctrl | Fire mode | X |
| Walk (quiet) | Left Shift | Laser / light | Middle mouse |
| Lean left / right | Q / E | Inspect weapon | V |
| Use / interact | F | Drop weapon | G |
| Primary / sidearm / knife | 1 / 2 / 3 | Grenades / next grenade | 4 |
| Objective item | 5 | Quick grenade | C |
| Buy menu | B | Scoreboard (hold) | Tab |
| Chat all / team | Y / U | Push to talk | T |
| Menu | Esc | Switch weapon | Mouse wheel |

## Run it locally

There is no build step and nothing to install for the game itself: it is plain ES modules.

```sh
node tools/serve.mjs 8080        # then open http://localhost:8080/
```

Developer shortcuts go in the address hash, for example
`http://localhost:8080/#dev&map=harbor&mode=tdm&bots=8&autostart`.

## Tests

The tests use Node and the pre-installed Playwright (headless Chromium):

```sh
node tools/test/smoke.mjs              # boots the game, walks a map, fails on any console error
node tools/test/match.mjs              # plays real matches with bots
node tools/test/mapcheck.mjs harbor    # builds and validates one map (add --shots for screenshots)
node tools/test/phys.mjs               # physics and navigation unit tests
```

## Project layout

- `index.html` is the page; the code is in `js/`, grouped as `core`, `phys`, `game`, `weapons`, `grenades`, `maps`, `modes`, `bots`, `net`,
  `chars`, `gfx`, `audio`, `account` and `ui`.
- The styles are in `css/`.
- `assets/` holds CC0 textures, HDRIs and models; `assets/manifest.json` lists each file's licence and source.
- `docs/ARCHITECTURE.md` is the module contract.

## Credits and licences

- **Code and content:** original. All weapon names and makers are fictional, and the maps are original places.
- **Third-party assets:** textures and HDRIs are CC0 from [Poly Haven](https://polyhaven.com/) and [ambientCG](https://ambientcg.com/).
  The human kit and gloves come from the owner's Neon Veins project.
- **Libraries:** Babylon.js and PeerJS, loaded from jsDelivr.
