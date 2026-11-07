/* LIVE FIRE — optics: reticle drawing (2D canvas: the same code serves the reticle discs on optic lenses and the full-screen
   scope overlay), reticle / lens / glint materials. The gameplay scope view (magnified render, overlay on screen, sway) is wired
   by the weapons-integration code; this module only draws and makes materials. Contract: docs/ARCHITECTURE.md §5 (scope.js).
   Exports:
     RETICLES                 ids drawn here: iron dot holo chevron circle_dot bdc duplex mildot mildot_fine ring lpvo thermal
     RETICLE_INFO             { id: { lit, color, mils (angular span of the drawing in mils edge to edge, magnified optics), desc } }
     drawReticle(ctx, id, size, opts)  draw reticle `id` centred in a size x size square of a CanvasRenderingContext2D (origin at
                              the square's top-left; opts.x / opts.y move it). opts: { color, lit (glow), alpha, line (px scale),
                              zoom (lpvo / thermal HUD), thermal: { palette, zoom, battery }, outline (white halo for dark reticles) }
     reticleCanvas(id, size, opts) -> canvas (cached by id + size + opts)
     reticleTexture(scene, id, opts) -> BABYLON.DynamicTexture (cached per scene)
     reticleMaterial(scene, id, opts) -> StandardMaterial for a reticle disc on a lens: unlit, alpha from the drawing, emissive when
                              lit, back faces culled (seen only from the eye side), no depth write
     lensMaterial(scene, { texture, tint, kind, glint }) -> PBRMaterial: 'objective' | 'ocular' | 'window' | 'thermal' glass; with
                              `texture` (a render target) the lens shows it (emissive) for the magnified view
     glintMaterial(scene) -> additive flare material for the objective glint (models.js puts a hidden 'glint' plane on every
                              magnified optic: GunModel.sight.glint / attachment.glint, enable it to show the reflection)
     drawScopeOverlay(ctx, w, h, opts) full-screen scope frame: black surround outside a circular eyebox, soft edge, chromatic rim,
                              vignette, the reticle scaled to the eyebox, parallax offset. opts: { reticle, r (eyebox radius px,
                              default .46 * min(w, h)), ox, oy (eyebox centre offset px, e.g. sway), rox, roy (reticle offset px:
                              parallax), color, lit, thermal, alpha, ring (0..1 darkness of the edge) }
   Coordinates: reticles are drawn for a disc that fills the square (radius size / 2). */

export const RETICLES = ['iron', 'dot', 'holo', 'chevron', 'circle_dot', 'bdc', 'duplex', 'mildot', 'mildot_fine', 'ring', 'lpvo', 'thermal'];
export const RETICLE_INFO = {
  iron:        { lit: false, color: '#000000', mils: 0, desc: 'no reticle (iron sights)' },
  dot:         { lit: true, color: '#ff2a14', mils: 40, desc: '2 MOA red dot' },
  holo:        { lit: true, color: '#ff3a1e', mils: 40, desc: '65 MOA ring with a 1 MOA centre dot' },
  chevron:     { lit: true, color: '#ff3018', mils: 60, desc: 'illuminated chevron with bullet-drop stadia' },
  circle_dot:  { lit: true, color: '#ff3a1e', mils: 50, desc: 'circle and dot' },
  bdc:         { lit: false, color: '#060606', mils: 40, desc: 'crosshair with bullet-drop hash marks' },
  duplex:      { lit: false, color: '#050505', mils: 36, desc: 'heavy outer posts, fine centre crosshair' },
  mildot:      { lit: false, color: '#050505', mils: 30, desc: 'fine crosshair with mil dots' },
  mildot_fine: { lit: false, color: '#050505', mils: 24, desc: 'fine crosshair, mil hash marks, red centre dot' },
  ring:        { lit: false, color: '#080808', mils: 60, desc: 'thick ring with a fine centre point (bullpup optic)' },
  lpvo:        { lit: true, color: '#ff3a1e', mils: 40, desc: 'segmented circle, dot and fine crosshair (variable power)' },
  thermal:     { lit: true, color: '#f2f2ec', mils: 60, desc: 'thermal display: crosshair, range stadia, status HUD' },
};
const B = () => (typeof BABYLON !== 'undefined' ? BABYLON : null);

// ------------------------------------------------------------------------------------------------------------------
// drawing
/** draw reticle id into ctx centred in a size x size square at (opts.x, opts.y) */
export function drawReticle(ctx, id, size, opts = {}) {
  const info = RETICLE_INFO[id] || RETICLE_INFO.dot, s = size / 2, x0 = opts.x || 0, y0 = opts.y || 0;
  const col = opts.color || info.color, lit = opts.lit ?? info.lit, lw = Math.max(1, size / 512) * (opts.line || 1);
  ctx.save(); ctx.translate(x0 + s, y0 + s); ctx.globalAlpha = opts.alpha ?? 1;
  ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineCap = 'butt'; ctx.lineJoin = 'miter';
  if (lit) { ctx.shadowColor = col; ctx.shadowBlur = size * .012; }
  const line = (x1, y1, x2, y2, w) => { ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); };
  const dot = (x, y, r) => { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); };
  const circ = (r, w, a0 = 0, a1 = Math.PI * 2) => { ctx.lineWidth = w; ctx.beginPath(); ctx.arc(0, 0, r, a0, a1); ctx.stroke(); };
  const halo = !lit && opts.outline;
  const cross = (gap, len, w) => { line(-len, 0, -gap, 0, w); line(gap, 0, len, 0, w); line(0, -len, 0, -gap, w); line(0, gap, 0, len, w); };
  if (halo) { ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.fillStyle = 'rgba(255,255,255,.35)'; }
  for (let pass = halo ? 0 : 1; pass < 2; pass++) {
    const w = (k) => (pass === 0 ? k * lw + 2 * lw : k * lw);
    if (pass === 1 && halo) ctx.restore();
    switch (id) {
      case 'iron': break;
      case 'dot': dot(0, 0, s * .045); break;
      case 'holo': circ(s * .62, w(3.2)); dot(0, 0, s * .028); for (const a of [0, 1, 2, 3]) { const an = a * Math.PI / 2; line(Math.cos(an) * s * .62, Math.sin(an) * s * .62, Math.cos(an) * s * .7, Math.sin(an) * s * .7, w(3.2)); } break;
      case 'circle_dot': circ(s * .5, w(3)); dot(0, 0, s * .035); break;
      case 'chevron': {
        ctx.lineWidth = w(3.4); ctx.beginPath(); ctx.moveTo(-s * .16, s * .14); ctx.lineTo(0, 0); ctx.lineTo(s * .16, s * .14); ctx.stroke();
        ctx.save(); ctx.shadowBlur = 0; ctx.strokeStyle = pass === 0 ? ctx.strokeStyle : (opts.etch || '#101010'); ctx.fillStyle = ctx.strokeStyle;
        line(0, s * .02, 0, s * .82, w(1.6)); for (let k = 1; k <= 5; k++) { const y = s * (.18 + k * .11), hw2 = s * (.12 - k * .016); line(-hw2, y, hw2, y, w(1.4)); }
        line(-s * .9, 0, -s * .3, 0, w(2)); line(s * .3, 0, s * .9, 0, w(2)); ctx.restore(); break;
      }
      case 'bdc': cross(0, s * .95, w(1.4)); line(-s * .95, 0, -s * .55, 0, w(4)); line(s * .55, 0, s * .95, 0, w(4)); line(0, s * .55, 0, s * .95, w(4));
        for (let k = 1; k <= 6; k++) { const y = s * k * .075, hw2 = s * (.09 - k * .009); line(-hw2, y, hw2, y, w(1.4)); } break;
      case 'duplex': cross(0, s * .4, w(1.2)); for (const [ax, ay] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) line(ax * s * .4, ay * s * .4, ax * s, ay * s, w(6)); break;
      case 'mildot': cross(0, s, w(1.2)); for (let k = 1; k <= 5; k++) { const d = s * k * .14; for (const [ax, ay] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { ctx.beginPath(); ctx.ellipse(ax * d, ay * d, ay ? s * .016 : s * .011, ay ? s * .011 : s * .016, 0, 0, Math.PI * 2); ctx.fill(); } } break;
      case 'mildot_fine': cross(s * .012, s, w(.8)); for (let k = 1; k <= 10; k++) { const d = s * k * .085, L = k % 5 === 0 ? s * .05 : s * .025; line(d, -L, d, L, w(.8)); line(-d, -L, -d, L, w(.8)); line(-L, d, L, d, w(.8)); if (k <= 4) line(-L, -d, L, -d, w(.8)); }
        if (pass === 1) { ctx.save(); ctx.fillStyle = '#ff2a14'; ctx.shadowColor = '#ff2a14'; ctx.shadowBlur = size * .01; dot(0, 0, s * .012); ctx.restore(); } break;
      case 'ring': circ(s * .34, w(10)); dot(0, 0, s * .02); break;
      case 'lpvo': for (let k = 0; k < 4; k++) circ(s * .36, w(3), k * Math.PI / 2 + .18, (k + 1) * Math.PI / 2 - .18); dot(0, 0, s * .022);
        ctx.save(); ctx.shadowBlur = 0; ctx.strokeStyle = pass === 0 ? ctx.strokeStyle : (opts.etch || '#0a0a0a'); cross(s * .4, s, w(1.4)); line(-s, 0, -s * .7, 0, w(5)); line(s * .7, 0, s, 0, w(5)); line(0, s * .7, 0, s, w(5)); ctx.restore(); break;
      case 'thermal': {
        cross(s * .05, s * .3, w(2)); dot(0, 0, s * .012);
        for (let k = 1; k <= 3; k++) { const y = s * k * .1; line(-s * .03, y, s * .03, y, w(1.4)); }
        if (pass === 1 && opts.hud !== false) {
          const T = opts.thermal || {}; ctx.save(); ctx.shadowBlur = 0; ctx.font = `600 ${Math.round(s * .085)}px ui-monospace, monospace`; ctx.textBaseline = 'middle';
          ctx.textAlign = 'left'; ctx.fillText((T.zoom || opts.zoom || 2).toFixed(1) + 'x', -s * .62, -s * .56);
          ctx.textAlign = 'right'; ctx.fillText(({ whitehot: 'WH', blackhot: 'BH', ironbow: 'IR' })[T.palette || 'whitehot'] || 'WH', s * .62, -s * .56);
          const bw = s * .16, bh = s * .07, bx = s * .46, by = s * .56; ctx.lineWidth = w(1.6); ctx.strokeRect(bx, by - bh / 2, bw, bh); ctx.fillRect(bx + bw, by - bh * .22, bw * .08, bh * .44);
          ctx.fillRect(bx + 2 * lw, by - bh / 2 + 2 * lw, (bw - 4 * lw) * (T.battery ?? .8), bh - 4 * lw);
          ctx.textAlign = 'left'; ctx.fillText('NUC', -s * .62, s * .56); ctx.restore();
        }
        break;
      }
      default: dot(0, 0, s * .04);
    }
  }
  ctx.restore();
}
const CANVAS = new Map();
const keyOf = (id, size, o) => id + '|' + size + '|' + JSON.stringify(o || {});
function newCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined' && typeof document === 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
}
/** reticle drawn on a transparent square canvas (cached) */
export function reticleCanvas(id, size = 512, opts = {}) {
  const k = keyOf(id, size, opts); let c = CANVAS.get(k); if (c) return c;
  c = newCanvas(size, size); const g = c.getContext('2d');
  if (opts.bg === 'thermal') { const gr = g.createRadialGradient(size / 2, size / 2, size * .05, size / 2, size / 2, size * .5); gr.addColorStop(0, '#2c302c'); gr.addColorStop(1, '#141614'); g.fillStyle = gr; g.fillRect(0, 0, size, size); }
  drawReticle(g, id, size, opts); CANVAS.set(k, c); return c;
}

// ------------------------------------------------------------------------------------------------------------------
// materials (per scene caches)
const SC = new WeakMap();
function cache(scene) { let c = SC.get(scene); if (!c) { c = { tex: new Map(), mat: new Map() }; SC.set(scene, c); scene.onDisposeObservable.addOnce(() => SC.delete(scene)); } return c; }
/** DynamicTexture with the reticle (alpha) — cached per scene + id + opts */
export function reticleTexture(scene, id, opts = {}) {
  const BB = B(), c = cache(scene), size = opts.size || 512, k = keyOf(id, size, opts);
  let t = c.tex.get(k); if (t) return t;
  t = new BB.DynamicTexture('reticle_' + id, { width: size, height: size }, scene, true);
  t.hasAlpha = true; t.wrapU = t.wrapV = BB.Texture.CLAMP_ADDRESSMODE;
  const g = t.getContext(); g.clearRect(0, 0, size, size);
  if (opts.bg === 'thermal') { const gr = g.createRadialGradient(size / 2, size / 2, size * .05, size / 2, size / 2, size * .5); gr.addColorStop(0, '#323632'); gr.addColorStop(1, '#121412'); g.fillStyle = gr; g.fillRect(0, 0, size, size); }
  drawReticle(g, id, size, opts); t.update(false);
  c.tex.set(k, t); return t;
}
/** unlit alpha material for a reticle disc (front face toward the eye) */
export function reticleMaterial(scene, id, opts = {}) {
  const BB = B(), c = cache(scene), k = 'ret|' + keyOf(id, opts.size || 512, opts);
  let m = c.mat.get(k); if (m) return m;
  const info = RETICLE_INFO[id] || RETICLE_INFO.dot, lit = opts.lit ?? info.lit, tex = reticleTexture(scene, id, opts);
  m = new BB.StandardMaterial('reticleMat_' + id, scene);
  m.disableLighting = true; m.emissiveTexture = tex; m.opacityTexture = tex; m.diffuseColor = new BB.Color3(0, 0, 0); m.specularColor = new BB.Color3(0, 0, 0);
  m.emissiveColor = lit ? new BB.Color3(1.6, 1.6, 1.6) : new BB.Color3(1, 1, 1);
  m.backFaceCulling = true; m.disableDepthWrite = true; m.alphaMode = BB.Engine.ALPHA_COMBINE;
  if (opts.bg === 'thermal') { m.opacityTexture = null; m.alpha = 1; m.disableDepthWrite = false; }
  m.metadata = { gunMat: 'reticle', reticle: id };
  c.mat.set(k, m); return m;
}
/** lens glass. kind: objective (coated, reflective) | ocular | window (reflex / holo) | thermal (germanium) */
export function lensMaterial(scene, { texture = null, tint = null, kind = 'objective', glint = false } = {}) {
  const BB = B(), c = cache(scene), k = 'lens|' + kind + '|' + (tint || '') + '|' + glint + '|' + (texture ? texture.uniqueId : '');
  let m = c.mat.get(k); if (m) return m;
  m = new BB.PBRMaterial('lens_' + kind, scene);
  const col = BB.Color3.FromHexString(tint || ({ objective: '#0e1c24', ocular: '#0b1418', window: '#24332c', thermal: '#141019' })[kind] || '#0e1c24').toLinearSpace();
  m.albedoColor = col; m.metallic = kind === 'thermal' ? .7 : .35; m.roughness = kind === 'thermal' ? .1 : .02;
  if (texture) { m.emissiveTexture = texture; m.emissiveColor = new BB.Color3(1, 1, 1); m.albedoColor = new BB.Color3(0, 0, 0); m.metallic = 0; m.roughness = .3; }
  else if (kind !== 'thermal') { m.alpha = kind === 'window' ? .25 : .6; m.transparencyMode = BB.PBRMaterial.PBRMATERIAL_ALPHABLEND; m.useRadianceOverAlpha = true; m.useSpecularOverAlpha = true; }
  if (glint) { m.emissiveColor = new BB.Color3(.9, .8, .55); m.emissiveIntensity = .4; }
  m.metadata = { gunMat: 'lens', kind };
  c.mat.set(k, m); return m;
}
/** additive flare for the objective glint (a hidden plane that faces +Z; the game enables it when a scope looks at the camera) */
export function glintMaterial(scene) {
  const BB = B(), c = cache(scene); let m = c.mat.get('glint'); if (m) return m;
  const size = 128, t = new BB.DynamicTexture('glintTex', { width: size, height: size }, scene, true), g = t.getContext();
  g.clearRect(0, 0, size, size);
  const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2); gr.addColorStop(0, 'rgba(255,250,235,1)'); gr.addColorStop(.12, 'rgba(255,236,190,.85)'); gr.addColorStop(.4, 'rgba(255,200,120,.18)'); gr.addColorStop(1, 'rgba(255,180,90,0)');
  g.fillStyle = gr; g.fillRect(0, 0, size, size);
  g.globalCompositeOperation = 'lighter'; g.strokeStyle = 'rgba(255,240,210,.55)'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(4, size / 2); g.lineTo(size - 4, size / 2); g.moveTo(size / 2, 10); g.lineTo(size / 2, size - 10); g.stroke();
  t.hasAlpha = true; t.update(false);
  m = new BB.StandardMaterial('glintMat', scene); m.disableLighting = true; m.emissiveTexture = t; m.opacityTexture = t; m.diffuseColor = new BB.Color3(0, 0, 0);
  m.emissiveColor = new BB.Color3(3, 2.8, 2.4); m.alphaMode = BB.Engine.ALPHA_ADD; m.disableDepthWrite = true; m.backFaceCulling = false; m.metadata = { gunMat: 'glint' };
  c.mat.set('glint', m); return m;
}

// ------------------------------------------------------------------------------------------------------------------
/** full-screen scope frame + reticle on a 2D context (w x h px) */
export function drawScopeOverlay(ctx, w, h, opts = {}) {
  const r = opts.r || Math.min(w, h) * .46, cx = w / 2 + (opts.ox || 0), cy = h / 2 + (opts.oy || 0), ring = opts.ring ?? 1;
  ctx.save();
  // black surround with a circular hole (even-odd), soft inner edge, chromatic rim
  ctx.fillStyle = '#000'; ctx.beginPath(); ctx.rect(0, 0, w, h); ctx.arc(cx, cy, r, 0, Math.PI * 2, true); ctx.fill('evenodd');
  const edge = ctx.createRadialGradient(cx, cy, r * .78, cx, cy, r);
  edge.addColorStop(0, 'rgba(0,0,0,0)'); edge.addColorStop(.7, `rgba(0,0,0,${.25 * ring})`); edge.addColorStop(.94, `rgba(8,4,0,${.8 * ring})`); edge.addColorStop(1, 'rgba(0,0,0,1)');
  ctx.fillStyle = edge; ctx.beginPath(); ctx.arc(cx, cy, r + 1, 0, Math.PI * 2); ctx.fill();
  ctx.globalCompositeOperation = 'lighter'; ctx.lineWidth = Math.max(1, r * .006);
  ctx.strokeStyle = `rgba(90,30,0,${.35 * ring})`; ctx.beginPath(); ctx.arc(cx + r * .002, cy, r * .985, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = `rgba(0,30,80,${.3 * ring})`; ctx.beginPath(); ctx.arc(cx - r * .002, cy, r * .975, 0, Math.PI * 2); ctx.stroke();
  ctx.globalCompositeOperation = 'source-over';
  // reticle, clipped to the eyebox, with its own parallax offset
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
  const id = opts.reticle || 'mildot', size = r * 2;
  drawReticle(ctx, id, size, { x: cx - r + (opts.rox || 0), y: cy - r + (opts.roy || 0), color: opts.color, lit: opts.lit, thermal: opts.thermal, alpha: opts.alpha, line: opts.line || Math.max(1, r / 380), outline: false });
  ctx.restore();
}
