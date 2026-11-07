/* STUB (owner: graphics worker) — replace completely, keep this API.
   Exports: createPipeline(scene, camera, opts) -> { setLens, setFlash, setDamage, setADS, setScope, dispose } */
export function createPipeline(scene, camera, opts = {}) {
  const p = new BABYLON.DefaultRenderingPipeline('pipe', true, scene, [camera]); p.fxaaEnabled = true;
  return { setLens() {}, setFlash() {}, setDamage() {}, setADS() {}, setScope() {}, dispose() { p.dispose(); } };
}
