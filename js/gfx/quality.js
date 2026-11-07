/* STUB (owner: graphics worker) — replace completely, keep this API.
   Exports: QUALITY, detectTier(engine), applyQuality(engine, scene, tier) */
export const QUALITY = { low: { scale: .7, shadows: 0 }, medium: { scale: .85, shadows: 1024 }, high: { scale: 1, shadows: 2048 }, ultra: { scale: 1, shadows: 4096 } };
export const detectTier = () => 'medium';
export function applyQuality(engine, scene, tier) { engine.setHardwareScalingLevel(1 / (QUALITY[tier] || QUALITY.medium).scale); }
