/* STUB (owner: graphics worker) — replace completely, keep this API.
   Exports: MATERIALS, initMaterials(scene, opts), getMaterial(scene, name), surfaceOf(name) */
const C = (r, g, b) => [r, g, b];
export const MATERIALS = {
  concrete: { surf: 'concrete', col: C(.55, .55, .53) }, concrete_dark: { surf: 'concrete', col: C(.33, .33, .32) },
  concrete_floor: { surf: 'concrete', col: C(.5, .49, .47) }, asphalt: { surf: 'asphalt', col: C(.18, .18, .19) },
  asphalt_wet: { surf: 'asphalt', col: C(.12, .12, .13) }, brick: { surf: 'brick', col: C(.55, .4, .32) },
  brick_red: { surf: 'brick', col: C(.5, .22, .17) }, plaster: { surf: 'plaster', col: C(.75, .72, .66) },
  plaster_white: { surf: 'plaster', col: C(.88, .87, .84) }, tile_white: { surf: 'tile', col: C(.85, .86, .86) },
  tile_floor: { surf: 'tile', col: C(.6, .58, .55) }, wood_planks: { surf: 'wood', col: C(.5, .36, .22) },
  wood_floor: { surf: 'wood', col: C(.55, .38, .22) }, wood_dark: { surf: 'wood', col: C(.3, .2, .12) },
  plywood: { surf: 'wood', col: C(.7, .58, .4) }, metal_plate: { surf: 'metal', col: C(.5, .51, .52) },
  metal_painted: { surf: 'metal', col: C(.3, .4, .45) }, metal_rust: { surf: 'metal', col: C(.45, .28, .17) },
  corrugated: { surf: 'sheetmetal', col: C(.55, .57, .58) }, corrugated_rust: { surf: 'sheetmetal', col: C(.5, .3, .2) },
  steel_dark: { surf: 'metal', col: C(.2, .21, .22) }, glass: { surf: 'glass', col: C(.6, .7, .75), alpha: .35 },
  gravel: { surf: 'gravel', col: C(.45, .43, .4) }, dirt: { surf: 'dirt', col: C(.4, .32, .24) },
  grass: { surf: 'grass', col: C(.3, .42, .2) }, sand: { surf: 'sand', col: C(.78, .68, .5) },
  snow: { surf: 'snow', col: C(.92, .94, .97) }, rock: { surf: 'concrete', col: C(.45, .44, .42) },
  marble: { surf: 'tile', col: C(.85, .84, .8) }, carpet: { surf: 'carpet', col: C(.3, .28, .32) },
  fabric: { surf: 'fabric', col: C(.35, .3, .28) }, rubber: { surf: 'rubber', col: C(.1, .1, .1) },
  cardboard: { surf: 'wood', col: C(.62, .48, .32) }, paint_yellow: { surf: 'metal', col: C(.85, .65, .1) },
  paint_red: { surf: 'metal', col: C(.6, .1, .08) }, paint_blue: { surf: 'metal', col: C(.12, .25, .55) },
  water: { surf: 'water', col: C(.1, .2, .25), alpha: .7 }, mud: { surf: 'mud', col: C(.3, .24, .18) },
  hazard: { surf: 'metal', col: C(.9, .7, .1) }, emissive_white: { surf: 'glass', col: C(1, 1, 1), emissive: 1 },
  emissive_warm: { surf: 'glass', col: C(1, .8, .55), emissive: 1 },
};
const cache = new WeakMap();
export async function initMaterials(scene, opts = {}) { if (!cache.has(scene)) cache.set(scene, new Map()); }
export function getMaterial(scene, name) {
  if (!cache.has(scene)) cache.set(scene, new Map());
  const m = cache.get(scene); if (m.has(name)) return m.get(name);
  const d = MATERIALS[name] || MATERIALS.concrete;
  const mat = new BABYLON.PBRMaterial('m_' + name, scene);
  mat.albedoColor = new BABYLON.Color3(...d.col); mat.metallic = d.surf === 'metal' ? .6 : 0; mat.roughness = .8;
  if (d.alpha) { mat.alpha = d.alpha; mat.transparencyMode = 2; }
  if (d.emissive) mat.emissiveColor = new BABYLON.Color3(...d.col);
  m.set(name, mat); return mat;
}
export const surfaceOf = name => (MATERIALS[name] || MATERIALS.concrete).surf;
