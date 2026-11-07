# LIVE FIRE — weapons, attachments and grenades

Data lives in three pure-JS modules (no BABYLON, no DOM; they run in Node):

| file | what |
|---|---|
| `js/weapons/data.js` | 50 guns, 3 melee weapons, makers, archetypes, helpers (`getGun`, `spreadAt`, `recoilStep`, `fireInterval`, `speedFromWeight`) |
| `js/weapons/attachments.js` | 46 attachments, `fits` / `compatible`, `effectiveStats` (stats with attachments + derived HUD numbers), TTK helpers |
| `js/grenades/data.js` | 25 grenades (one per kind), `NADE_RULES` + `canCarry`, `blastDamage`, `flashBlind` |
| `tools/test/balance.mjs` | validates every entry, prints TTK tables, flags outliers; `--write-doc` regenerates the tables below; `--shots` renders spray patterns |

Everything is original: fictional makers and model names, real-world archetypes, calibres and mechanics. The validator rejects
real brand / model names (and names from other games) in names and descriptions.

## Conventions

* Damage is per bullet (per **pellet** for shotguns) on a 100 hp player, before the hit-group multiplier
  (head 4, neck 2, chest 1, stomach 1.25, arm 1, leg 0.75 — docs/ARCHITECTURE.md §4).
* Range falloff: `dmg * falloff ^ (dist / 10)`.
* Armour (0..100) protects every hit group except the legs; the helmet protects the head. Health damage =
  `dmg * armorPen`, the armour pool loses half of what it absorbed (when the pool runs out the rest goes through).
  The balance numbers below assume a fresh 100 armour.
* Spread and sway are radians (cone half-angle). Recoil patterns, kick and jitter are **degrees** (x right, y up).
* `speed` is metres per second while holding the gun and is always `speedFromWeight(weight)`.

### Spread (`spreadAt(gun, { speedFrac, air, crouch, ads, bloom })`)
`cone = min(base + bloom, max) * lerp(1, crouch, c) * lerp(hip, ads, a) + move * moving * (1 - .25 a) + air * airborne`,
where `moving` ramps from 0 at `MOVE_FREE` (34 % of max speed: walk-peeking and counter-strafing stay accurate) to 1 at full
run. Each shot adds `spread.shot` to `bloom`, which decays with `recoil.recover` (1/s, exponential). Lasers lower `spread.hip`.
Shotguns add a pellet pattern of half-angle `spread.pellet` around the (spread) aim point.

### Recoil (`recoilStep(gun, i)`)
`recoil.pattern[i]` is the step (degrees) added to the aim offset after shot `i` of a spray. Bullets follow the offset, the
camera follows it by the recoil module's view factor, and `kick` is an extra visual punch that springs back quickly. When
you stop firing, the offset **and** the pattern index return at `recover` (1/s, exponential), so tapping resets the spray.
`random` is the half-width of the uniform jitter added to every step (half of it vertically). A spray longer than the pattern
repeats the last `loop` steps with x mirrored every other repetition, so belt-fed guns sway inside a band instead of drifting.

Patterns are authored per gun as segments `[shots, dx, dy, ease]` (spread over the shots with an `in` / `out` / `s` / linear
ease) plus a small deterministic per-gun wobble, then expanded into the shipped arrays. Every automatic gun has 20-40 steps
(at least the magazine size up to 40): first a climb, broken into two drifting segments so it is not a ruler line, then
sideways sweeps whose order, width and curvature are the gun's signature:

* ZR-61 Purga: climbs with a right lean, hooks hard left, then a long sweep right — the classic 7.62x39 "7".
* ZR-94 Taiga: a low, straight climb, then a tight left-right zig-zag (5.45 is the flattest rifle).
* Warden: climbs slightly left, sweeps right, then a long sweep left. KR Habicht: a smooth J-curve to the right.
* Lodjur: an S-curve. Kogarashi: leans right, then whips left. Halberd / Axion / battle rifles: twice the climb in half the shots.
* SMGs climb 4-6 degrees in their first 8 shots (rifles 7-12) and sweep less; the Torsion barely climbs at all.
* Tsubame (burst-only): steps grouped in threes — each burst lands as one group, the recovery between bursts does the rest.

Semi-automatic guns have short patterns (2-8 steps) that matter only when you fire faster than the recovery.

## Balance reasoning

### Kill thresholds
* **Rifles one-tap an unhelmeted head** (19 of 20 rifles/carbines/BRs/DMRs at 30 m+; the 9 mm Prairie carbine is the exception).
* **With a helmet** only full-power and 7.62x39 rounds one-tap: Purga (to 38 m, the reason to buy it), Halberd, Axion, battle
  rifles, DMRs, Kuznets, Mula; the compact Kroha only point-blank. 5.56 / 5.45 rifles need two.
* **Body shots**: assault rifles 3-4 unarmoured (average 3.6 at 15 m), 4-6 armoured. Battle rifles hit 36 through armour, so
  **3 armoured body shots** out to ~50 m — paid for with 20-round magazines, heavy recoil and the slowest rifle speeds.
* SMGs need 4-7 body shots (6-10 armoured) and lose damage fast (falloff .78-.90 per 10 m), but run faster and pay 600.
* Pistols: 9 mm one-taps an unarmoured head only inside ~9 m; .45 / .38 out to 22 / 45 m; the magnum revolver and the .50
  pistol one-tap through a helmet (57 / 48 m) — the eco-round answer to armour.
* Snipers: the heavy 8.6x70 bolt kills any armoured hit above the legs; the .50 kills on any hit including legs; the light
  7.62 bolt needs two body shots (one to the head, or to the stomach of an unarmoured target); the semi-auto 8.6 needs two but fires every 0.33 s.
* Shotguns one-shot an unarmoured body at 5 m (pumps to ~10 m), fall off to useless by 20 m.

### Calibre drives armour and wall penetration
| bore | calibres | armorPen | wall pen |
|---|---|---|---|
| rim | .22 LR | .36 | .35 |
| 9 | 9x19 (by velocity), 9x18, .38, .40, .45 | .45-.60 | .8-1.1 |
| pdw | 4.7x29, 5.6x29 | .72-.80 | 1.3-1.4 |
| mag | .357, .50 | .74-.86 | 1.4-1.8 |
| 556 | 5.56x45, 5.45x39 | .68-.74 | 1.8-2.0 |
| 762 | 7.62x39, 7.62x35, 9x39 AP, 7.62x51, 7.62x54R, 6.8x51 | .68-.86 | 1.6-2.6 |
| 338 | 8.6x70 | .90-.92 | 2.8-2.9 |
| 50 | 12.7x99 | .98 | 3.0 |
| 12g | buckshot | .50-.55 | .5-.6 |

Within a calibre, longer barrels (more velocity) get slightly more armour penetration (9 mm pistol .52, SMG .58, 16-inch
carbine .60). The validator checks that wall penetration grows with the bore and warns when one calibre spreads by > .1 AP.

### Movement by weight
`speedFromWeight(kg)` (loaded gun + standard sight): knife 6.0, pistols 5.66-5.88, SMGs 5.14-5.64, rifles 5.09-5.36, carbines
5.41-5.46, battle rifles 5.03-5.07, shotguns 4.96-5.39, DMRs 4.92-5.39, the light bolt rifle 5.29 (run-and-gun scout),
heavy snipers 4.62-4.67, LMGs 4.25-4.78 and the 13.2 kg .50 at 3.87 m/s. `adsMove` scales speed while aiming
(.8 pistols ... .45 snipers and LMGs, .4 for the .50). Attachments change weight-driven speed by a few percent.

### Economy (credits; CS-style buy rounds)
| category | price band | kill reward | notes |
|---|---|---|---|
| pistols | 200-700 | 300 | two free-tier 200 pistols, the big-bore guns at 600-700 |
| SMGs | 1050-1500 | **600** | the 50-round Corvid pays 300 (it is the strongest) |
| assault rifles | 2050-3300 | 300 | burst Tsubame 2050 is the cheap rifle; heavy 7.62/6.8 at 3200-3300 |
| carbines | 1300-2800 | 300 (PCC 600) | 7.62x39 Kroha at 1800 is the cheapest real rifle |
| battle rifles | 3200-3500 | 300 | |
| shotguns | 1050-2000 | **900** | |
| marksman | 2900-4000 | 300 | |
| snipers | 1900-5250 | 300 / 200 / **100** | heavy 8.6x70 bolt **4750 with a 100 kill reward**; .50 5250 / 100 |
| machine guns | 3500-5200 | 300 | |

The validator flags any gun that costs more than the cheapest of its category but never beats it (TTK at 5/10/15/30 m bare or
armoured, magazine, control, suppression, head-kill range), any gun dominated by another (cheaper, earlier and at least as
good in every listed stat incl. wall penetration and leg kills), and armoured TTK outliers (> 1.7x or < 0.5x the category
median). Accepted outliers are listed with their reason (`FLAG_OK` in the validator): the .22 stealth pistol, the .50 pistol,
the light bolt rifle and the coach gun.

### Progression (unlock levels 1-60)
Level 1 starter kit in every important category: Vogt 9 pistol, Avispa SMG, Purga and Warden rifles, Cacciatore pump, Rook
light sniper; by level 8 every category has a gun (Prairie carbine 2, Longhorn BR 5, Weitblick DMR 6, Mula LMG 8). Exotic
and heavy guns sit at 30-60 (Axion 52, Björn 60). Attachments unlock from 1 (reflex, light) to 46 (thermal).

### Hold breath and sway
`breath.sway` is the aim drift amplitude while aiming (rad); `breath.hold` the seconds you can hold your breath (the walk key
while aiming): the sway drops to ~15 %, then doubles for 2 s once the breath runs out. Snipers hold 4-5.5 s, DMRs 2.5-3 s;
other guns cannot hold (hold 0) and sway very little. Stocks and scopes change `sway` (12x +15 %, heavy stock -15 %).

### Fire modes
`modes[0]` is the default. Burst: `burst` rounds at `burstRpm`, then at least `burstDelay` before the next burst
(Tsubame 3 @ 1000 rpm + .26 s; Spatz 3; Torsion 2; the coach gun's "burst" fires both barrels at once). Semi `rpm` is the
trigger-reset limit. Bolt / pump / lever actions (`cycle`) are already in `rpm`. Shell-fed guns load one shell at a time
(`shell = { start, per, end }`, interruptible).

### Melee
| weapon | quick (front/back) | heavy (front/back) | notes |
|---|---|---|---|
| Fieldline knife | 34 / 90 every .42 s | 62 / **180** | 3 slashes or 2 stabs from the front, 1 stab from behind |
| Zafra machete | 45 / 110 every .6 s | 80 / 180 | 1.95 m reach, wide arc |
| Ridgehawk tomahawk | 50 / 120 every .65 s | 95 / 180 | throwable: 120 damage, pick it back up |
Melee kills pay 1500.

## Attachments

Seven slots (`optic muzzle under side mag stock barrel`); a gun accepts a slot only when `gun.mounts[slot]` is true (revolvers
have no optic rail except the magnum, integrally suppressed guns no muzzle, bullpups and fixed stocks no stock slot, snipers keep
their built-in scope unless an optic replaces it). Filters narrow the rest: `bores` (suppressors by calibre), `cals` (drums),
`stocks` (folding/collapsible for the folded stock), `reloadKinds` (box magazines, shell tubes, belts), `scoped` (canted irons
need a built-in scope).

**Mods are signed fractions** of the gun's own value (`-0.12` = 12 % less): summed per key over all parts, applied once, then
clamped (speed 3.4-6.1 m/s, ADS .08-1.2 s, falloff ≤ .997, bipod factor .25-1, ...). `range` also flattens falloff
(`falloff ^ (1 / (1 + range))`). `magSet` is absolute (drums, belts) and only fits a gun with a smaller magazine. A gun
with `suppressorFriendly` (Mörker 300, Axion 68) loses only a quarter of a suppressor's range / velocity / handling penalty.
`effectiveStats(gun, mods)` returns a **new** object (the source is never touched) with the optic fields (`zoom`, `zoom2`,
`zoomLevels`, `reticle`, `opticKind`, `thermal`, `canted`), `laser`, `light`, `bipod`, `loud`, `flashHide` and `derived`:
TTK at 10/30 m bare/armoured, shots to kill, DPS, head-kill ranges, recoil over the first 10 shots, cones, ADS speed and
seven 0-100 armory bars (damage, fire rate, range, accuracy, control, mobility, handling).

## Grenades

25 grenades, one per kind in docs/ARCHITECTURE.md §6 (`id === kind`). Physics uses real gravity: a 18 m/s overhand throw
carries ~28 m, an 8.5 m/s lob ~7 m; restitution .3-.45 for metal canisters, ~0 for sticky / satchel / frame charges.
Explosives use `blastDamage`: full damage inside `falloff.inner`, then `(1 - x) ^ exp` to zero at `radius`
(frag: 120 / 74 / 37 at 1 / 3 / 5 m, 62 % through armour). Fire, gas and shock ignore armour. Flashes use
`flashBlind(nade, dist, angle)`: up to 4.8 s looking straight at it, ~50 % side-on, ~12 % facing away, falling with distance.

**Carry and buy limits (`NADE_RULES`)**: at most **4 grenades**; at most **2 flashes** (flash, ninefold), **1 lethal**
(frag, HE, impact, sticky, cluster, mini, dynamite, satchel), **1 smoke** (smoke, signal smoke), **1 fire** (molotov,
incendiary, thermite), 2 tactical (decoy, concussion, stun, gas, sensor, EMP, breach, flare, chaff) and 1 medic; never more
of one grenade than its own `max`. `canCarry(inv.nades, gid)` returns `{ ok, reason }` for the buy menu and loadouts.
`fx` holds everything the simulation and effects need per kind (smoke radius/growth/lifetime, fire radius/spread/dps,
flash angle and distance curves, gas dps/slow, sensor pulse period/radius, jammer radius, bomblet count/scatter, satchel
remote detonation, medic heal per second...); `model` holds shape, size and colours.

## Changing the numbers

1. Edit the data file. 2. `node tools/test/balance.mjs` (must print `OK`; read the flags).
3. `node tools/test/balance.mjs --write-doc` to refresh the tables below. 4. `node tools/test/balance.mjs --shots` and look
at `tools/test/out/weapons/report.png` after touching recoil patterns.

<!-- generated:begin (node tools/test/balance.mjs --write-doc) -->

Mounts: o optic, m muzzle, u underbarrel, s side rail, g magazine, k stock, b barrel. dmg is per pellet for shotguns.

### Pistols

| id | name | maker | calibre | $ | kill $ | lvl | dmg | AP | rpm | modes | mag/res | reload | ADS s | speed | range | head 1-tap (bare/helm) | TTK 15 m bare/arm | mounts |
|---|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---:|---:|---:|---|---|---|
| vogt9 | KR Vogt 9 | Kessler & Rauch | 9x19 | 200 | 300 | 1 | 28 | 0.52 | 400 | semi | 18/90 | 2.15/2.35 | 0.16 | 5.85 | 26 | 8.9/- m | 0.60/1.20 s (5/9) | omsg |
| chispa | Gallo Chispa | Gallo Industrial | 9x19 +P | 300 | 300 | 2 | 29 | 0.56 | 420 | semi | 13/78 | 1.95/2.15 | 0.13 | 5.88 | 18 | 8.5/- m | 0.57/1.00 s (5/8) | osg |
| lawman | Calder Lawman .45 | Calder Frontier Arms | .45 Auto | 400 | 300 | 14 | 35 | 0.5 | 340 | semi | 8/48 | 2/2.3 | 0.17 | 5.8 | 22 | 22.3/- m | 0.53/1.24 s (4/8) | omsg |
| constable | Pembroke Constable Mk II | Pembroke & Vane | .38 Spl +P | 450 | 300 | 18 | 40 | 0.5 | 210 | semi | 6/36 | 2.9/2.9 | 0.17 | 5.84 | 28 | 44.6/- m | 0.57/1.43 s (3/6) | s |
| sovereign | Pembroke Sovereign Mk VI | Pembroke & Vane | .357 Mag | 600 | 300 | 32 | 58 | 0.74 | 150 | semi | 6/36 | 3.1/3.1 | 0.2 | 5.77 | 40 | 89.2/57.3 m | 0.40/0.80 s (2/3) | os |
| ovod | ZR-18 Ovod | Zavod Radomir | 9x18 | 500 | 300 | 24 | 22 | 0.45 | 850 | auto/semi | 20/100 | 2.3/2.6 | 0.17 | 5.78 | 16 | -/- m | 0.42/0.92 s (7/14) | msgk |
| monolith | Basalt Monolith 50 | Basalt Dynamics | .50 Mag Auto | 700 | 300 | 40 | 54 | 0.86 | 240 | semi | 7/35 | 2.2/2.5 | 0.21 | 5.66 | 36 | 60.2/48.4 m | 0.50/0.50 s (3/3) | osg |
| ridgeback | IB-40 Ridgeback | Ironbark Defense | .40 Auto | 400 | 300 | 10 | 31 | 0.56 | 380 | semi | 15/75 | 2.2/2.4 | 0.17 | 5.83 | 26 | 14.3/- m | 0.63/1.11 s (5/8) | omsg |
| shizuka | Aokiri Type 14 Shizuka | Aokiri Precision | .22 LR Subsonic | 200 | 300 | 6 | 20 | 0.36 | 450 | semi | 14/98 | 1.9/2.1 | 0.15 | 5.81 | 30 | -/- m | 0.80/4.50 s (7/20) | osg |

### SMGs

| id | name | maker | calibre | $ | kill $ | lvl | dmg | AP | rpm | modes | mag/res | reload | ADS s | speed | range | head 1-tap (bare/helm) | TTK 15 m bare/arm | mounts |
|---|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---:|---:|---:|---|---|---|
| spatz | KR Spatz 9 | Kessler & Rauch | 9x19 | 1500 | 600 | 4 | 27 | 0.58 | 800 | auto/burst/semi 3 | 30/120 | 2.6/3.2 | 0.2 | 5.46 | 30 | 5.1/- m | 0.30/0.60 s (5/9) | omusgkb |
| hachi | Aokiri Type 27 Hachi | Aokiri Precision | 4.7x29 PDW | 1450 | 600 | 20 | 24 | 0.8 | 950 | auto/semi | 40/160 | 2.4/2.9 | 0.19 | 5.64 | 30 | -/- m | 0.25/0.38 s (5/7) | omusgkb |
| roughneck | Calder Roughneck .45 | Calder Frontier Arms | .45 Auto | 1200 | 600 | 12 | 35 | 0.5 | 650 | auto/semi | 30/120 | 2.9/3.5 | 0.24 | 5.14 | 24 | 17/- m | 0.28/0.65 s (4/8) | musg |
| corvid | Basalt Corvid 57 | Basalt Dynamics | 5.6x29 PDW | 1500 | 300 | 48 | 25 | 0.72 | 900 | auto/semi | 50/150 | 3.1/3.6 | 0.22 | 5.44 | 30 | -/- m | 0.27/0.40 s (5/7) | omsb |
| torsion | Basalt Torsion 45 | Basalt Dynamics | .45 Auto | 1450 | 600 | 34 | 31 | 0.52 | 1100 | auto/burst/semi 2 | 25/100 | 2.5/3 | 0.2 | 5.46 | 20 | 9.6/- m | 0.22/0.44 s (5/9) | omusgkb |
| avispa | Gallo Avispa | Gallo Industrial | 9x19 | 1050 | 600 | 1 | 26 | 0.55 | 750 | auto | 32/128 | 2.6/3 | 0.22 | 5.44 | 22 | 2.2/- m | 0.32/0.72 s (5/10) | musgk |
| nightjar | Pembroke Nightjar Mk 3 | Pembroke & Vane | 9x19 Subsonic | 1350 | 600 | 26 | 25 | 0.5 | 760 | auto/semi | 30/120 | 2.7/3.3 | 0.22 | 5.34 | 24 | -/- m | 0.39/0.79 s (6/11) | ousgk |
| pulga | Gallo Pulga | Gallo Industrial | 9x19 | 1100 | 600 | 8 | 23 | 0.54 | 1150 | auto | 32/128 | 2.3/2.7 | 0.17 | 5.62 | 16 | -/- m | 0.31/0.57 s (7/12) | omsgk |

### Assault Rifles

| id | name | maker | calibre | $ | kill $ | lvl | dmg | AP | rpm | modes | mag/res | reload | ADS s | speed | range | head 1-tap (bare/helm) | TTK 15 m bare/arm | mounts |
|---|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---:|---:|---:|---|---|---|
| purga | ZR-61 Purga | Zavod Radomir | 7.62x39 | 2700 | 300 | 1 | 36 | 0.78 | 600 | auto/semi | 30/90 | 2.5/3.2 | 0.3 | 5.21 | 60 | 119.7/38.1 m | 0.20/0.30 s (3/4) | omusgk |
| taiga | ZR-94 Taiga | Zavod Radomir | 5.45x39 | 2500 | 300 | 11 | 31 | 0.74 | 650 | auto/semi | 30/90 | 2.4/3 | 0.28 | 5.29 | 60 | 85/- m | 0.28/0.37 s (4/5) | omusgkb |
| warden | Ironbark Warden 556 | Ironbark Defense | 5.56x45 | 2900 | 300 | 1 | 32 | 0.7 | 750 | auto/semi | 30/90 | 2.4/2.9 | 0.26 | 5.34 | 60 | 81/- m | 0.24/0.32 s (4/5) | omusgkb |
| habicht | KR Habicht 556 | Kessler & Rauch | 5.56x45 | 3100 | 300 | 22 | 33 | 0.71 | 780 | auto/semi | 30/90 | 2.5/3 | 0.29 | 5.24 | 65 | 97.8/- m | 0.23/0.31 s (4/5) | omusgkb |
| lodjur | Norrhavn Lodjur 556 | Norrhavn Vapen | 5.56x45 | 3300 | 300 | 28 | 31 | 0.72 | 680 | auto/semi | 30/90 | 3/3.6 | 0.3 | 5.26 | 70 | 85/- m | 0.26/0.35 s (4/5) | musgb |
| kogarashi | Aokiri Type 30 Kogarashi | Aokiri Precision | 5.56x45 | 2850 | 300 | 16 | 30 | 0.7 | 820 | auto/semi | 30/90 | 2.9/3.4 | 0.24 | 5.36 | 55 | 51.2/- m | 0.22/0.37 s (4/6) | omusgb |
| halberd | Ironbark Halberd 762 | Ironbark Defense | 7.62x51 | 3200 | 300 | 38 | 40 | 0.82 | 600 | auto/semi | 20/80 | 2.6/3.2 | 0.31 | 5.17 | 75 | 258.8/149.5 m | 0.20/0.30 s (3/4) | omusgkb |
| tsubame | Aokiri Type 25 Tsubame | Aokiri Precision | 5.56x45 | 2050 | 300 | 5 | 35 | 0.7 | 1000 | burst 3 | 30/90 | 2.7/3.2 | 0.27 | 5.29 | 60 | 166.5/- m | 0.12/0.44 s (3/5) | omusgkb |
| axion | Basalt Axion 68 | Basalt Dynamics | 6.8x51 | 3300 | 300 | 52 | 38 | 0.86 | 640 | auto/semi | 25/75 | 2.6/3.2 | 0.31 | 5.09 | 80 | 277/177.2 m | 0.19/0.28 s (3/4) | omusgkb |

### Carbines

| id | name | maker | calibre | $ | kill $ | lvl | dmg | AP | rpm | modes | mag/res | reload | ADS s | speed | range | head 1-tap (bare/helm) | TTK 15 m bare/arm | mounts |
|---|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---:|---:|---:|---|---|---|
| switchback | Ironbark Switchback | Ironbark Defense | 5.56x45 | 2600 | 300 | 15 | 30 | 0.68 | 850 | auto/semi | 30/90 | 2.3/2.8 | 0.23 | 5.46 | 45 | 39.6/- m | 0.21/0.35 s (4/6) | omusgkb |
| morker | Norrhavn Mörker 300 | Norrhavn Vapen | 7.62x35 | 2800 | 300 | 30 | 34 | 0.68 | 760 | auto/semi | 30/90 | 2.4/2.9 | 0.25 | 5.41 | 45 | 49.7/- m | 0.24/0.32 s (4/5) | omusgkb |
| kroha | ZR-61K Kroha | Zavod Radomir | 7.62x39 | 1800 | 300 | 7 | 34 | 0.76 | 700 | auto/semi | 30/90 | 2.4/3 | 0.25 | 5.44 | 40 | 49.7/5.3 m | 0.26/0.34 s (4/5) | omusgk |
| prairie | Calder Prairie 9 | Calder Frontier Arms | 9x19 | 1300 | 600 | 2 | 29 | 0.6 | 700 | semi/auto | 30/120 | 2.4/2.9 | 0.24 | 5.44 | 40 | 15.7/- m | 0.26/0.51 s (4/7) | omusgb |

### Battle Rifles

| id | name | maker | calibre | $ | kill $ | lvl | dmg | AP | rpm | modes | mag/res | reload | ADS s | speed | range | head 1-tap (bare/helm) | TTK 15 m bare/arm | mounts |
|---|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---:|---:|---:|---|---|---|
| eisenhut | KR Eisenhut | Kessler & Rauch | 7.62x51 | 3400 | 300 | 19 | 44 | 0.82 | 550 | auto/semi | 20/80 | 2.8/3.5 | 0.33 | 5.05 | 80 | 300/242.7 m | 0.22/0.22 s (3/3) | omusgk |
| longhorn | Calder Longhorn | Calder Frontier Arms | 7.62x51 | 3200 | 300 | 5 | 45 | 0.82 | 700 | semi/auto | 20/80 | 2.7/3.4 | 0.34 | 5.03 | 90 | 300/300 m | 0.17/0.17 s (3/3) | omusg |
| jarv | Norrhavn Järv 762 | Norrhavn Vapen | 7.62x51 | 3500 | 300 | 36 | 43 | 0.82 | 650 | auto/semi | 20/80 | 3.2/3.8 | 0.32 | 5.07 | 75 | 298.6/189.3 m | 0.18/0.18 s (3/3) | omusgb |

### Shotguns

| id | name | maker | calibre | $ | kill $ | lvl | dmg | AP | rpm | modes | mag/res | reload | ADS s | speed | range | head 1-tap (bare/helm) | TTK 15 m bare/arm | mounts |
|---|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---:|---:|---:|---|---|---|
| cacciatore | Morandi Cacciatore | Fratelli Morandi | 12 ga 00 Buck | 1050 | 900 | 1 | 9x26 | 0.5 | 68 | semi (pump) | 8/32 | 4.85/5.3 | 0.26 | 5.29 | 12 | 17.8/13.4 m | 1.76/4.41 s (3/6) | msg |
| breachpoint | Ironbark Breachpoint 12 | Ironbark Defense | 12 ga 00 Buck | 1300 | 900 | 17 | 8x27 | 0.52 | 80 | semi (pump) | 7/32 | 3.9/4.35 | 0.24 | 5.31 | 14 | 20.3/15.6 m | 0.75/2.25 s (2/4) | omsgk |
| tempesta | Morandi Tempesta | Fratelli Morandi | 12 ga 00 Buck | 1850 | 900 | 27 | 6x24 | 0.55 | 240 | semi | 7/32 | 3.69/4.09 | 0.27 | 5.24 | 13 | 15.3/11.9 m | 0.75/1.50 s (4/7) | omusgk |
| raskat | ZR-12 Raskat | Zavod Radomir | 12 ga 00 Buck | 2000 | 900 | 42 | 6x19 | 0.55 | 300 | auto/semi | 20/40 | 3.3/3.9 | 0.3 | 4.96 | 10 | 11.6/8.9 m | 1.40/2.60 s (8/14) | omusk |
| gemelli | Morandi Gemelli | Fratelli Morandi | 12 ga Magnum Buck | 1100 | 900 | 13 | 12x26 | 0.5 | 400 | semi/burst 2 | 2/30 | 2.2/2.6 | 0.24 | 5.39 | 9 | 15.3/11.4 m | 2.90/8.40 s (4/8) | ms |
| drover | Calder Drover | Calder Frontier Arms | 12 ga 00 Buck | 1250 | 900 | 9 | 8x27 | 0.5 | 80 | semi (lever) | 5/30 | 3.3/3.7 | 0.25 | 5.21 | 12 | 18.6/14 m | 1.50/3.00 s (3/5) | msg |

### Marksman Rifles

| id | name | maker | calibre | $ | kill $ | lvl | dmg | AP | rpm | modes | mag/res | reload | ADS s | speed | range | head 1-tap (bare/helm) | TTK 15 m bare/arm | mounts |
|---|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---:|---:|---:|---|---|---|
| weitblick | KR Weitblick | Kessler & Rauch | 5.56x45 Match | 2900 | 300 | 6 | 40 | 0.72 | 380 | semi | 20/80 | 2.5/3 | 0.3 | 5.21 | 95 | 300/93.6 m | 0.32/0.47 s (3/4) | omusgkb |
| longreach | Ironbark Longreach 308 | Ironbark Defense | 7.62x51 | 4000 | 300 | 21 | 52 | 0.82 | 300 | semi | 20/60 | 2.8/3.4 | 0.34 | 4.92 | 110 | 300/300 m | 0.20/0.40 s (2/3) | omusgkb |
| krechet | ZR-63 Krechet | Zavod Radomir | 7.62x54R | 3700 | 300 | 29 | 56 | 0.84 | 260 | semi | 10/50 | 2.7/3.3 | 0.36 | 5.05 | 120 | 300/300 m | 0.23/0.46 s (2/3) | omusg |
| penumbra | Basalt Penumbra | Basalt Dynamics | 9x39 Subsonic AP | 3300 | 300 | 37 | 42 | 0.8 | 600 | semi/auto | 20/80 | 2.6/3.1 | 0.3 | 5.39 | 60 | 71.5/40.7 m | 0.20/0.30 s (3/4) | ousgk |

### Sniper Rifles

| id | name | maker | calibre | $ | kill $ | lvl | dmg | AP | rpm | modes | mag/res | reload | ADS s | speed | range | head 1-tap (bare/helm) | TTK 15 m bare/arm | mounts |
|---|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---:|---:|---:|---|---|---|
| rook | Pembroke Rook Mk 4 | Pembroke & Vane | 7.62x51 | 1900 | 300 | 1 | 82 | 0.85 | 48 | semi (bolt) | 10/30 | 2.7/3.4 | 0.3 | 5.29 | 150 | 300/300 m | 1.25/1.25 s (2/2) | omug |
| arbiter | Pembroke Arbiter Mk 2 | Pembroke & Vane | 8.6x70 | 4750 | 100 | 25 | 118 | 0.92 | 41 | semi (bolt) | 5/30 | 3.3/3.8 | 0.36 | 4.62 | 250 | 300/300 m | 0.00/0.00 s (1/1) | omug |
| richter | KR Richter 338 | Kessler & Rauch | 8.6x70 | 5000 | 200 | 45 | 86 | 0.9 | 180 | semi | 10/40 | 3.1/3.7 | 0.38 | 4.67 | 200 | 300/300 m | 0.33/0.33 s (2/2) | omugk |
| bjorn | Norrhavn Björn 50 | Norrhavn Vapen | 12.7x99 | 5250 | 100 | 60 | 165 | 0.98 | 30 | semi (bolt) | 5/20 | 4.2/4.8 | 0.48 | 3.87 | 400 | 300/300 m | 0.00/0.00 s (1/1) | oug |

### Machine Guns

| id | name | maker | calibre | $ | kill $ | lvl | dmg | AP | rpm | modes | mag/res | reload | ADS s | speed | range | head 1-tap (bare/helm) | TTK 15 m bare/arm | mounts |
|---|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---:|---:|---:|---|---|---|
| varg | Norrhavn Varg 556 | Norrhavn Vapen | 5.56x45 | 4200 | 300 | 23 | 32 | 0.72 | 800 | auto | 100/200 | 5.6/6.2 | 0.45 | 4.45 | 70 | 81/- m | 0.22/0.30 s (4/5) | omusgkb |
| kuznets | ZR-70 Kuznets | Zavod Radomir | 7.62x54R | 5200 | 300 | 35 | 40 | 0.84 | 650 | auto | 100/200 | 6/6.6 | 0.5 | 4.25 | 80 | 232.6/146.3 m | 0.18/0.28 s (3/4) | omusgb |
| mula | Gallo Mula | Gallo Industrial | 7.62x39 | 3500 | 300 | 8 | 35 | 0.77 | 600 | auto/semi | 75/150 | 3.8/4.5 | 0.4 | 4.78 | 65 | 118.5/26.4 m | 0.20/0.30 s (3/4) | omusgk |

### Melee

| id | name | maker | slash (front/back) | heavy (front/back) | slash rate s | reach m | speed | throw |
|---|---|---|---|---|---:|---:|---:|---|
| knife | Ironbark Fieldline | Ironbark Defense | 34/90 | 62/180 | 0.42 | 1.55 | 6 | - |
| zafra | Gallo Zafra | Gallo Industrial | 45/110 | 80/180 | 0.6 | 1.95 | 5.9 | - |
| ridgehawk | Calder Ridgehawk | Calder Frontier Arms | 50/120 | 95/180 | 0.65 | 1.7 | 5.9 | 120 dmg at 24 m/s |

### Time to kill at 5 / 15 / 30 / 60 m (chest, seconds / shots; bare = no armour, arm = 100 armour)

| gun | 5 m bare | 5 m arm | 15 m bare | 15 m arm | 30 m bare | 30 m arm | 60 m bare | 60 m arm |
|---|---|---|---|---|---|---|---|---|
| vogt9 | 0.45 / 4 | 1.05 / 8 | 0.60 / 5 | 1.20 / 9 | 0.75 / 6 | 1.50 / 11 | 1.05 / 8 | 2.10 / 15 |
| chispa | 0.43 / 4 | 0.86 / 7 | 0.57 / 5 | 1.00 / 8 | 0.71 / 6 | 1.43 / 11 | 1.29 / 10 | 4.44 / 18 |
| lawman | 0.53 / 4 | 1.06 / 7 | 0.53 / 4 | 1.24 / 8 | 0.71 / 5 | 3.54 / 9 | 1.24 / 8 | 4.59 / 15 |
| constable | 0.57 / 3 | 1.43 / 6 | 0.57 / 3 | 1.43 / 6 | 0.86 / 4 | 4.33 / 7 | 1.14 / 5 | 5.19 / 10 |
| sovereign | 0.40 / 2 | 0.80 / 3 | 0.40 / 2 | 0.80 / 3 | 0.80 / 3 | 1.20 / 4 | 1.20 / 4 | 1.60 / 5 |
| ovod | 0.35 / 6 | 0.78 / 12 | 0.42 / 7 | 0.92 / 14 | 0.56 / 9 | 1.27 / 19 | 0.99 / 15 | 4.86 / 34 |
| monolith | 0.25 / 2 | 0.50 / 3 | 0.50 / 3 | 0.50 / 3 | 0.50 / 3 | 0.75 / 4 | 0.75 / 4 | 1.00 / 5 |
| ridgeback | 0.47 / 4 | 0.95 / 7 | 0.63 / 5 | 1.11 / 8 | 0.79 / 6 | 1.42 / 10 | 1.11 / 8 | 2.21 / 15 |
| shizuka | 0.67 / 6 | 3.97 / 16 | 0.80 / 7 | 4.50 / 20 | 1.20 / 10 | 5.57 / 28 | 4.50 / 20 | >10 / 53 |
| spatz | 0.22 / 4 | 0.45 / 7 | 0.30 / 5 | 0.60 / 9 | 0.38 / 6 | 0.75 / 11 | 0.67 / 10 | 1.13 / 16 |
| hachi | 0.25 / 5 | 0.32 / 6 | 0.25 / 5 | 0.38 / 7 | 0.32 / 6 | 0.44 / 8 | 0.44 / 8 | 0.57 / 10 |
| roughneck | 0.28 / 4 | 0.55 / 7 | 0.28 / 4 | 0.65 / 8 | 0.46 / 6 | 0.92 / 11 | 0.83 / 10 | 1.66 / 19 |
| corvid | 0.27 / 5 | 0.33 / 6 | 0.27 / 5 | 0.40 / 7 | 0.33 / 6 | 0.53 / 9 | 0.53 / 9 | 0.73 / 12 |
| torsion | 0.16 / 4 | 0.33 / 7 | 0.22 / 5 | 0.44 / 9 | 0.33 / 7 | 0.65 / 13 | 0.65 / 13 | 1.25 / 24 |
| avispa | 0.32 / 5 | 0.56 / 8 | 0.32 / 5 | 0.72 / 10 | 0.48 / 7 | 0.88 / 12 | 0.80 / 11 | 1.52 / 20 |
| nightjar | 0.32 / 5 | 0.63 / 9 | 0.39 / 6 | 0.79 / 11 | 0.47 / 7 | 1.03 / 14 | 0.79 / 11 | 1.66 / 22 |
| pulga | 0.21 / 5 | 0.47 / 10 | 0.31 / 7 | 0.57 / 12 | 0.47 / 10 | 0.83 / 17 | 0.99 / 20 | 4.47 / 36 |
| purga | 0.20 / 3 | 0.30 / 4 | 0.20 / 3 | 0.30 / 4 | 0.30 / 4 | 0.30 / 4 | 0.30 / 4 | 0.40 / 5 |
| taiga | 0.28 / 4 | 0.37 / 5 | 0.28 / 4 | 0.37 / 5 | 0.28 / 4 | 0.37 / 5 | 0.28 / 4 | 0.46 / 6 |
| warden | 0.24 / 4 | 0.32 / 5 | 0.24 / 4 | 0.32 / 5 | 0.24 / 4 | 0.32 / 5 | 0.24 / 4 | 0.40 / 6 |
| habicht | 0.23 / 4 | 0.31 / 5 | 0.23 / 4 | 0.31 / 5 | 0.23 / 4 | 0.31 / 5 | 0.23 / 4 | 0.38 / 6 |
| lodjur | 0.26 / 4 | 0.35 / 5 | 0.26 / 4 | 0.35 / 5 | 0.26 / 4 | 0.35 / 5 | 0.26 / 4 | 0.44 / 6 |
| kogarashi | 0.22 / 4 | 0.29 / 5 | 0.22 / 4 | 0.37 / 6 | 0.22 / 4 | 0.37 / 6 | 0.29 / 5 | 0.37 / 6 |
| halberd | 0.20 / 3 | 0.30 / 4 | 0.20 / 3 | 0.30 / 4 | 0.20 / 3 | 0.30 / 4 | 0.20 / 3 | 0.30 / 4 |
| tsubame | 0.12 / 3 | 0.44 / 5 | 0.12 / 3 | 0.44 / 5 | 0.38 / 4 | 0.44 / 5 | 0.38 / 4 | 0.44 / 5 |
| axion | 0.19 / 3 | 0.28 / 4 | 0.19 / 3 | 0.28 / 4 | 0.19 / 3 | 0.28 / 4 | 0.19 / 3 | 0.28 / 4 |
| switchback | 0.21 / 4 | 0.35 / 6 | 0.21 / 4 | 0.35 / 6 | 0.21 / 4 | 0.35 / 6 | 0.28 / 5 | 0.42 / 7 |
| morker | 0.24 / 4 | 0.32 / 5 | 0.24 / 4 | 0.32 / 5 | 0.24 / 4 | 0.39 / 6 | 0.32 / 5 | 0.47 / 7 |
| kroha | 0.26 / 4 | 0.26 / 4 | 0.26 / 4 | 0.34 / 5 | 0.26 / 4 | 0.34 / 5 | 0.34 / 5 | 0.43 / 6 |
| prairie | 0.26 / 4 | 0.51 / 7 | 0.26 / 4 | 0.51 / 7 | 0.34 / 5 | 0.60 / 8 | 0.51 / 7 | 0.86 / 11 |
| eisenhut | 0.22 / 3 | 0.22 / 3 | 0.22 / 3 | 0.22 / 3 | 0.22 / 3 | 0.22 / 3 | 0.22 / 3 | 0.33 / 4 |
| longhorn | 0.17 / 3 | 0.17 / 3 | 0.17 / 3 | 0.17 / 3 | 0.17 / 3 | 0.17 / 3 | 0.17 / 3 | 0.17 / 3 |
| jarv | 0.18 / 3 | 0.18 / 3 | 0.18 / 3 | 0.18 / 3 | 0.18 / 3 | 0.18 / 3 | 0.18 / 3 | 0.28 / 4 |
| cacciatore | 0.00 / 1 | 0.00 / 1 | 1.76 / 3 | 4.41 / 6 | >10 / 17 | >10 / 33 | >10 / 154 | >10 / 308 |
| breachpoint | 0.00 / 1 | 0.75 / 2 | 0.75 / 2 | 2.25 / 4 | >10 / 12 | >10 / 22 | >10 / 99 | >10 / 190 |
| tempesta | 0.00 / 1 | 0.25 / 2 | 0.75 / 4 | 1.50 / 7 | >10 / 24 | >10 / 43 | >10 / 223 | ∞ / Infinity |
| raskat | 0.20 / 2 | 0.20 / 2 | 1.40 / 8 | 2.60 / 14 | >10 / 46 | >10 / 83 | ∞ / Infinity | ∞ / Infinity |
| gemelli | 0.00 / 1 | 0.00 / 1 | 2.90 / 4 | 8.40 / 8 | >10 / 24 | >10 / 47 | >10 / 223 | ∞ / Infinity |
| drover | 0.00 / 1 | 0.75 / 2 | 1.50 / 3 | 3.00 / 5 | >10 / 15 | >10 / 29 | >10 / 130 | >10 / 259 |
| weitblick | 0.32 / 3 | 0.47 / 4 | 0.32 / 3 | 0.47 / 4 | 0.32 / 3 | 0.47 / 4 | 0.32 / 3 | 0.47 / 4 |
| longreach | 0.20 / 2 | 0.40 / 3 | 0.20 / 2 | 0.40 / 3 | 0.20 / 2 | 0.40 / 3 | 0.40 / 3 | 0.40 / 3 |
| krechet | 0.23 / 2 | 0.46 / 3 | 0.23 / 2 | 0.46 / 3 | 0.23 / 2 | 0.46 / 3 | 0.23 / 2 | 0.46 / 3 |
| penumbra | 0.20 / 3 | 0.30 / 4 | 0.20 / 3 | 0.30 / 4 | 0.20 / 3 | 0.30 / 4 | 0.30 / 4 | 0.40 / 5 |
| rook | 1.25 / 2 | 1.25 / 2 | 1.25 / 2 | 1.25 / 2 | 1.25 / 2 | 1.25 / 2 | 1.25 / 2 | 1.25 / 2 |
| arbiter | 0.00 / 1 | 0.00 / 1 | 0.00 / 1 | 0.00 / 1 | 0.00 / 1 | 0.00 / 1 | 0.00 / 1 | 0.00 / 1 |
| richter | 0.33 / 2 | 0.33 / 2 | 0.33 / 2 | 0.33 / 2 | 0.33 / 2 | 0.33 / 2 | 0.33 / 2 | 0.33 / 2 |
| bjorn | 0.00 / 1 | 0.00 / 1 | 0.00 / 1 | 0.00 / 1 | 0.00 / 1 | 0.00 / 1 | 0.00 / 1 | 0.00 / 1 |
| varg | 0.22 / 4 | 0.30 / 5 | 0.22 / 4 | 0.30 / 5 | 0.22 / 4 | 0.30 / 5 | 0.22 / 4 | 0.38 / 6 |
| kuznets | 0.18 / 3 | 0.28 / 4 | 0.18 / 3 | 0.28 / 4 | 0.18 / 3 | 0.28 / 4 | 0.18 / 3 | 0.28 / 4 |
| mula | 0.20 / 3 | 0.30 / 4 | 0.20 / 3 | 0.30 / 4 | 0.30 / 4 | 0.40 / 5 | 0.30 / 4 | 0.40 / 5 |

### Attachments

| id | slot | name | $ | lvl | fits | mods |
|---|---|---|---:|---:|---|---|
| o_micro | optic | Pinprick Micro Reflex | 250 | 4 | pistol, smg, shotgun | zoom 1.05, reticle dot, adsTime +2% |
| o_reflex | optic | Halo Reflex Sight | 400 | 1 | smg, rifle, carbine, br, dmr, lmg, shotgun | zoom 1.1, reticle dot, adsTime +2% |
| o_holo | optic | Lantern Holographic | 500 | 7 | smg, rifle, carbine, br, dmr, lmg, shotgun | zoom 1.1, reticle holo, adsTime +4% |
| o_prism15 | optic | Facet 1.5x Prism | 550 | 10 | smg, rifle, carbine, br, dmr, lmg, shotgun | zoom 1.5, reticle chevron, adsTime +6% |
| o_2x | optic | Vigil 2x Compact | 600 | 13 | smg, rifle, carbine, br, dmr, lmg, shotgun | zoom 2, reticle circle_dot, adsTime +8% |
| o_pistol2x | optic | Longeye 2x Pistol Scope | 450 | 33 | pistol (bores mag) | zoom 2, reticle duplex, adsTime +12%, draw +15% |
| o_3x | optic | Tern 3x Prism | 650 | 16 | rifle, carbine, br, dmr, lmg | zoom 3, reticle bdc, adsTime +10%, speed 0% |
| o_4x | optic | Keystone 4x Combat Prism | 750 | 19 | rifle, carbine, br, dmr, lmg, sniper | zoom 4, reticle bdc, adsTime +14%, speed -1%, sway +5% |
| o_lpvo | optic | Gradient 1-6x Variable | 950 | 27 | rifle, carbine, br, dmr, lmg, sniper | zoom 1, zoom2 6, reticle lpvo, adsTime +16%, speed -1%, sway +5% |
| o_6x | optic | Steadfast 6x Scope | 800 | 23 | rifle, br, dmr, sniper | zoom 6, reticle duplex, adsTime +20%, speed -1%, sway +8% |
| o_8x | optic | Farlight 8x Scope | 900 | 31 | br, dmr, sniper | zoom 8, reticle mildot, adsTime +24%, speed -2%, sway +10% |
| o_12x | optic | Horizon 12x Sniper Scope | 1000 | 41 | dmr, sniper | zoom 12, reticle mildot_fine, adsTime +30%, speed -2%, sway +15% |
| o_thermal | optic | Emberline 2x Thermal | 1400 | 46 | smg, rifle, carbine, br, dmr, lmg, sniper, shotgun | zoom 2, reticle thermal, adsTime +14%, speed -1%, thermal |
| o_canted | optic | Offset Canted Irons | 200 | 21 | sniper (built-in scope) | canted true, cantedZoom 1.1, cantedAds -45% |
| m_supp_pistol | muzzle | Wisp Pistol Suppressor | 400 | 9 | pistol (bores 9/rim) | suppressed true, flashHide true, range -6%, velocity -4%, recoil -5%, adsTime +3%, draw +10% |
| m_supp_9 | muzzle | Wisp-K SMG Suppressor | 500 | 11 | smg, carbine (bores 9/pdw) | suppressed true, flashHide true, range -8%, velocity -5%, recoil -6%, adsTime +4%, draw +6% |
| m_supp_556 | muzzle | Muffle 5.56 Suppressor | 600 | 14 | rifle, carbine, dmr, lmg (bores 556) | suppressed true, flashHide true, range -6%, velocity -3%, recoil -7%, adsTime +5%, speed -1%, draw +6% |
| m_supp_762 | muzzle | Muffle 7.62 Suppressor | 700 | 24 | rifle, carbine, br, dmr, sniper, lmg (bores 762/338) | suppressed true, flashHide true, range -5%, velocity -3%, recoil -8%, adsTime +6%, speed -1%, draw +8% |
| m_comp | muzzle | Ratchet Compensator | 300 | 5 | pistol, smg, rifle, carbine | recoilV -15%, recoilH +5%, kick +10%, loud +10% |
| m_flash | muzzle | Starfall Flash Hider | 200 | 2 | smg, rifle, carbine, br, dmr, lmg | flashHide true, recoilH -6% |
| m_brake | muzzle | Anvil Muzzle Brake | 450 | 18 | rifle, carbine, br, dmr, sniper, lmg | recoil -10%, recoilH -8%, kick -12%, loud +25%, adsTime +2% |
| m_choke | muzzle | Tightline Choke | 250 | 6 | shotgun | pellet -28%, range +15% |
| u_vgrip | under | Upright Vertical Grip | 300 | 3 | smg, rifle, carbine, br, dmr, lmg, shotgun | recoilV -12%, adsTime +3% |
| u_agrip | under | Wedge Angled Grip | 300 | 8 | smg, rifle, carbine, br, dmr, lmg, shotgun | adsTime -8%, recoilV -4% |
| u_stubby | under | Nub Stubby Grip | 250 | 12 | smg, rifle, carbine, br, dmr, lmg, shotgun | recoilH -14%, moveSpread -5% |
| u_handstop | under | Stopline Hand-Stop | 200 | 20 | smg, rifle, carbine, br, dmr, lmg, shotgun | kick -12%, recover +12%, adsTime -3% |
| u_bipod | under | Outrigger Bipod | 400 | 15 | rifle, br, dmr, sniper, lmg | bipod -60%, recoil -3%, adsTime +6%, speed -1% |
| s_laser | side | Redline Laser | 300 | 6 | pistol, smg, rifle, carbine, br, shotgun, dmr, lmg | laser red, hipSpread -25% |
| s_light | side | Daybreak Weapon Light | 200 | 1 | pistol, smg, rifle, carbine, br, shotgun, dmr, lmg | light |
| s_combo | side | Twinbeam Laser-Light | 550 | 25 | pistol, smg, rifle, carbine, br, shotgun, dmr, lmg | laser green, light, hipSpread -20%, adsTime +2% |
| s_ir | side | Nightglass IR Laser | 450 | 35 | pistol, smg, rifle, carbine, br, shotgun, dmr, lmg | laser ir, hipSpread -22% |
| g_ext_pistol | mag | Extended Pistol Magazine | 200 | 7 | pistol (mag feed) | mag +50%, reload +8%, draw +5% |
| g_ext_smg | mag | Extended SMG Magazine | 300 | 10 | smg, carbine (bores 9/pdw; mag feed) | mag +33%, reload +8%, adsTime +2% |
| g_ext_rifle | mag | Extended Rifle Magazine | 350 | 13 | rifle, carbine, br, dmr (bores 556/762; mag feed) | mag +33%, reload +8%, adsTime +2%, speed 0% |
| g_ext_tube | mag | Extended Shell Tube | 250 | 11 | shotgun (shell feed) | mag +30%, adsTime +2%, speed 0% |
| g_ext_sniper | mag | Extended Sniper Magazine | 350 | 28 | sniper (mag feed) | mag +50%, reload +6%, adsTime +2% |
| g_fast | mag | Coupled Fast-Mag | 300 | 17 | pistol, smg, rifle, carbine, br, shotgun, dmr, sniper, lmg (mag feed) | reload -22% |
| g_drum | mag | Barrel-Drum 50 | 600 | 30 | smg, rifle, carbine (calibres 10; mag feed) | magSet 50, reload +35%, adsTime +6%, speed -2% |
| g_100 | mag | Century 100-Round Drum | 900 | 39 | rifle, carbine, lmg (calibres 3; mag feed) | magSet 100, reload +55%, adsTime +10%, speed -4% |
| g_belt | mag | Long Belt 150 | 700 | 33 | lmg (belt feed) | magSet 150, reload +15%, adsTime +4%, speed -3% |
| k_heavy | stock | Anchor Heavy Stock | 350 | 14 | smg, rifle, carbine, br, dmr, sniper, lmg | recoil -8%, recover +10%, sway -15%, adsTime +5%, speed -1% |
| k_light | stock | Featherweight Stock | 300 | 9 | smg, rifle, carbine, br, dmr, sniper, lmg, shotgun | adsTime -7%, speed +2%, moveSpread -5%, recoil +6%, sway +5% |
| k_folded | stock | Folded Stock | 100 | 5 | pistol, smg, rifle, carbine, shotgun (stocks folding/collapsible) | adsTime -16%, draw -20%, speed +3%, moveSpread -10%, recoil +25%, spread +25%, sway +30% |
| b_long | barrel | Longline Barrel | 450 | 16 | smg, rifle, carbine, br, dmr, sniper, lmg | range +25%, velocity +8%, spread -10%, adsTime +5%, speed -1%, draw +5% |
| b_short | barrel | Shortline Barrel | 300 | 12 | smg, rifle, carbine, br, dmr, lmg | range -20%, velocity -8%, adsTime -7%, speed +2%, draw -10%, spread +8%, recoil +5%, loud +10% |
| b_heavy | barrel | Bull Heavy Barrel | 500 | 29 | rifle, carbine, br, dmr, sniper, lmg | recoil -8%, spread -15%, range +10%, recover +6%, adsTime +8%, speed -2% |

### Grenades

| id | name | group | $ | max | lvl | fuse | trigger | throw/lob m/s | radius | dmg (1/3/5 m) | AP | duration | effect |
|---|---|---|---:|---:|---:|---:|---|---|---:|---|---:|---:|---|
| frag | Thorn Frag | frag | 300 | 1 | 1 | 3.2 | cook | 18/8.5 | 9 | 120/74/37 | 0.62 | - | blast, fragments, shake, tinnitus, destroys |
| he | Hammerhead HE | frag | 350 | 1 | 10 | 2.6 | cook | 18/8.5 | 6.5 | 150/91/28 | 0.7 | - | blast, shake, tinnitus, destroys |
| flash | Daystar Flashbang | flash | 200 | 2 | 1 | 1.6 | timed | 18/8.5 | 24 | - | - | 4.8 | blind, deafen, light, smoke |
| smoke | Veil Smoke | smoke | 300 | 1 | 1 | 1.4 | on rest | 18/8.5 | 4.6 | - | - | 18 | smoke |
| molotov | Rag Cocktail | fire | 400 | 1 | 1 | - | impact | 16.5/8 | 3.2 | - | - | 7 | fire, glass |
| incendiary | Sunstrike Incendiary | fire | 500 | 1 | 14 | - | impact | 18/8.5 | 3.6 | - | - | 7.5 | fire |
| decoy | Mimic Decoy | tactical | 50 | 1 | 3 | 2 | timed | 18/8.5 | 1.2 | - | - | 15 | mimic, endPop |
| concussion | Thunderclap Concussion | tactical | 250 | 1 | 18 | 2 | cook | 18/8.5 | 8 | 8/6/3 | 0.5 | 4 | concuss, shake, blast |
| stun | Tether Shock Grenade | tactical | 250 | 1 | 22 | 1.8 | timed | 18/8.5 | 4.5 | 10/10/0 | 1 | 2.4 | stun, arcs, light |
| gas | Choke Gas | tactical | 350 | 1 | 26 | 1.2 | timed | 18/8.5 | 5.5 | - | - | 14 | gas |
| sticky | Limpet Sticky Bomb | frag | 400 | 1 | 20 | 2.5 | sticky | 16/8 | 6 | 140/69/13 | 0.65 | - | blast, fragments, shake, tinnitus, destroys, stick |
| impact | Snapback Impact Grenade | frag | 350 | 1 | 24 | - | impact | 20/9 | 5.5 | 103/40/3 | 0.6 | - | blast, fragments, shake, tinnitus, destroys |
| cluster | Hydra Cluster | frag | 500 | 1 | 34 | 2.4 | cook | 18/8.5 | 3 | 29/0/0 | 0.6 | - | blast, shake, tinnitus, destroys, bomblets |
| thermite | Furnace Thermite | fire | 450 | 1 | 30 | 1 | sticky | 14/7 | 1.6 | - | - | 6 | burn |
| sensor | Watchman Sensor | tactical | 300 | 1 | 16 | 0.8 | sticky | 15/7 | 12 | - | - | 14 | pulse |
| emp | Blackout EMP | tactical | 400 | 1 | 38 | 1.8 | timed | 18/8.5 | 10 | - | - | 8 | emp, shake |
| smoke_color | Signal Smoke | smoke | 150 | 1 | 12 | 1.2 | on rest | 18/8.5 | 3.2 | - | - | 12 | smoke, marker |
| breach | Doorbuster Frame Charge | tactical | 400 | 1 | 28 | 2.5 | sticky | 9/5 | 4.5 | 96/32/0 | 0.7 | - | blast, shake, tinnitus, destroys, breach |
| flare | Lumen Road Flare | tactical | 100 | 1 | 5 | 0.3 | timed | 15/7 | 6 | - | - | 30 | light, smoke, reveal, burn, nvBloom |
| chaff | Static Chaff | tactical | 250 | 1 | 32 | 1.6 | timed | 18/8.5 | 15 | - | - | 12 | jam, cloud |
| ninebang | Ninefold Flash | flash | 400 | 1 | 36 | 1.5 | timed | 18/8.5 | 18 | - | - | 4.2 | bangs, blind, deafen, light |
| mini | Pebble Mini-Frag | frag | 200 | 1 | 8 | 2 | cook | 22/10 | 5.5 | 79/31/2 | 0.55 | - | blast, fragments, shake, tinnitus, destroys |
| satchel | Strongbox Satchel | frag | 700 | 1 | 44 | - | remote | 10/6 | 7.5 | 200/134/59 | 0.75 | - | blast, shake, tinnitus, destroys, remote |
| dynamite | Quarry Dynamite | frag | 450 | 1 | 40 | 4.2 | cook | 16/8 | 8.5 | 160/111/57 | 0.65 | - | blast, shake, tinnitus, destroys, litFuse |
| medic | Lifeline Medic Canister | support | 400 | 1 | 15 | 1 | on rest | 18/8.5 | 4.5 | - | - | 8 | heal, mist |

<!-- generated:end -->
