/* STUB (owner: graphics worker) — replace completely, keep this API.
   Exports: applyEnvironment(scene, env, opts) -> { sun, shadow, dispose } */
export async function applyEnvironment(scene, env = {}, opts = {}) {
  scene.clearColor = new BABYLON.Color4(.55, .62, .7, 1);
  const hemi = new BABYLON.HemisphericLight('hemi', new BABYLON.Vector3(0, 1, 0), scene); hemi.intensity = .6;
  const d = (env.sun && env.sun.dir) || [-.4, -1, -.3];
  const sun = new BABYLON.DirectionalLight('sun', new BABYLON.Vector3(...d).normalize(), scene); sun.intensity = (env.sun && env.sun.intensity) || 2.5;
  return { sun, shadow: null, dispose() { hemi.dispose(); sun.dispose(); } };
}
