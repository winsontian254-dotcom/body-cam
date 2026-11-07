/* STUB (owner: gun-model workers) — replace completely, keep this API (docs/ARCHITECTURE.md §5).
   Exports: initGunKit(scene), buildGun(scene, gunId, opts) -> GunModel, buildAttachment(scene, attId, opts), SKINS */
import { getGun } from './data.js';
export const SKINS = [{ id: 'factory', name: 'Factory', price: 0 }];
export async function initGunKit(scene) {}
export function buildGun(scene, gunId, opts = {}) {
  const g = getGun(gunId) || {}; const long = g.slot === 'primary';
  const root = new BABYLON.TransformNode('gun_' + gunId, scene);
  const mat = new BABYLON.PBRMaterial('gunstub', scene); mat.albedoColor = new BABYLON.Color3(.12, .12, .13); mat.metallic = .7; mat.roughness = .45;
  const body = BABYLON.MeshBuilder.CreateBox('gbody', { width: .05, height: .09, depth: long ? .55 : .19 }, scene); body.material = mat; body.parent = root; body.position.set(0, .03, long ? .1 : .02);
  const grip = BABYLON.MeshBuilder.CreateBox('ggrip', { width: .035, height: .11, depth: .04 }, scene); grip.material = mat; grip.parent = root; grip.position.set(0, -.05, -.03); grip.rotation.x = -.25;
  const mk = (n, x, y, z) => { const t = new BABYLON.TransformNode(n, scene); t.parent = root; t.position.set(x, y, z); return t; };
  const muzzle = mk('muzzle', 0, .04, long ? .38 : .12), eject = mk('eject', .03, .06, .02);
  const sockets = { optic: mk('s_optic', 0, .078, .05), muzzle: muzzle, under: mk('s_under', 0, -.02, .2), side: mk('s_side', .03, .03, .2), mag: mk('s_mag', 0, -.03, .05), stock: mk('s_stock', 0, .03, -.1) };
  return { root, meshes: [body, grip], parts: {}, sockets, muzzle, eject, sight: { eye: new BABYLON.Vector3(0, .08, -.2) },
    hands: { right: mk('h_r', 0, -.04, -.03), left: mk('h_l', 0, 0, long ? .22 : .0) }, setMods() {}, dispose() { root.dispose(); } };
}
export function buildAttachment(scene, attId, opts = {}) { const root = new BABYLON.TransformNode('att_' + attId, scene); return { root, meshes: [] }; }
