/* LIVE FIRE — CC0 Poly Haven scans (catalogue for js/maps/props.js), packed by tools/fetch-props.py into assets/models/ph/*.glb
   and placed with B.model (loaded once per scene, instanced). Photo-textured, so they beat code-built versions up close; they
   use plain glTF PBR materials (no LF wetness / sky-occlusion shading), so under a roof on an OUTDOOR map they look a little
   brighter than the walls around them: prefer them outdoors, on indoor maps, or where the code-built prop exists too.
   Exports: default [prop definitions] ({ type, cat: 'scan', glb, size, yoff, cols (model-local box colliders), surf, hide }). */
// sizes / colliders from the glb bounds (Babylon axes: +z = the model's front)
const box = (x0, y0, z0, x1, y1, z1) => [{ cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, cz: (z0 + z1) / 2, hx: (x1 - x0) / 2, hy: (y1 - y0) / 2, hz: (z1 - z0) / 2 }];
const S = (type, glb, size, cols, desc, o = {}) => Object.assign({ type, cat: 'scan', glb, size, cols, desc }, o);
export default [
  S('scan_barrel_red', 'barrel_red', [.56, .88, .56], box(-.28, 0, -.28, .28, .87, .28), 'red steel drum with a flammable label (scan)', { surf: 'metal' }),
  S('scan_drum_plastic', 'drum_plastic', [.49, .89, .49], box(-.24, 0, -.24, .24, .88, .24), 'blue plastic chemical drum (scan)', { surf: 'rubber' }),
  S('scan_drum_steel', 'drum_steel', [.64, .93, .64], box(-.31, 0, -.31, .31, .93, .31), 'blue steel oil drum (scan)', { surf: 'metal' }),
  S('scan_trashbag', 'trashbag', [.53, .57, .46], null, 'full black bin bag (scan, no collider)', { surf: 'fabric' }),
  S('scan_cement_bag', 'cement_bag', [.46, .18, .7], null, 'paper cement sack lying flat (scan, no collider)', { surf: 'fabric' }),
  S('scan_tyre', 'tyre', [.6, .6, .17], box(-.3, -.3, -.08, .3, .3, .08), 'worn car tyre standing on its tread (scan)', { surf: 'rubber', yoff: .3 }),
  S('scan_wet_floor_sign', 'wet_floor_sign', [.3, .63, .36], null, 'yellow wet floor sign (scan, no collider)', { surf: 'rubber' }),
  S('scan_utility_box', 'utility_box', [.52, 1.12, .43], box(-.26, 0, -.21, .26, 1.12, .22), 'grey street electrical cabinet (scan)', { surf: 'metal', hide: [0, 0, -.7, 'crates'] }),
  S('scan_utility_box_2', 'utility_box_2', [.92, 1.12, .43], box(-.46, 0, -.21, .46, 1.12, .22), 'green double street electrical cabinet (scan)', { surf: 'metal', hide: [0, 0, -.7, 'crates'] }),
  S('scan_plastic_crate', 'plastic_crate', [.51, .25, .41], box(-.25, 0, -.2, .25, .25, .2), 'yellow plastic produce crate (scan)', { surf: 'rubber' }),
  S('scan_sofa', 'sofa_leather', [1.81, .71, .82], box(-.9, 0, -.48, .9, .45, .34).concat(box(-.9, .45, -.48, .9, .71, -.25)), 'black leather chesterfield loveseat (scan)', { surf: 'fabric' }),
  S('scan_armchair', 'armchair_classic', [.85, 1.07, .77], box(-.42, 0, -.42, .42, .5, .35).concat(box(-.42, .5, -.42, .42, 1.06, -.2)), 'classic upholstered armchair (scan)', { surf: 'fabric' }),
  S('scan_covered_car', 'covered_car', [1.79, 1.41, 4.38], box(-.9, 0, -2.17, .85, 1.0, 2.21).concat(box(-.75, 1.0, -1.2, .7, 1.41, 1.0)), 'car under a dusty cover (scan; hide beside it)', { surf: 'sheetmetal', hide: [1.6, 0, 0, 'car'] }),
  S('scan_office_desk', 'office_desk_metal', [2.0, .79, .95], box(-1, 0, -.47, 1, .79, .48), 'grey steel office desk with drawers (scan)', { surf: 'metal' }),
  S('scan_monobloc_chair', 'monobloc_chair', [.64, .88, .63], null, 'white plastic garden chair (scan, no collider)', { surf: 'rubber' }),
  S('scan_wooden_chair', 'wooden_chair', [.43, .96, .54], null, 'white painted wooden chair (scan, no collider)', { surf: 'wood' }),
  S('scan_steel_shelves', 'steel_shelves', [1.1, 2.14, .5], box(-.55, 0, -.25, .55, 2.14, .25), 'steel frame shelves with wooden boards (scan)', { surf: 'metal', scale: .1 }),
  S('scan_trash_cans', 'trash_cans', [1.85, .91, .56], box(-.83, 0, -.28, .2, .91, .28), 'two galvanised trash cans, one lid on the ground (scan)', { surf: 'metal' }),
];
