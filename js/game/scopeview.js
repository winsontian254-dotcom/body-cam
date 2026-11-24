/* LIVE FIRE — the scope view (gameplay side of js/weapons/scope.js): a full-screen 2D canvas over the 3D view, under the HUD.
     - sniper-class sights (weapon.js scopedView: built-in scopes and optics of 5.5x and more, LPVO at 6x, thermal sights): black
       surround with the circular eyebox (scope.js drawScopeOverlay), the reticle of the sight at the screen centre (the bullet
       line), the eyebox drifting with the sway / turn / movement (parallax), a scope shadow when the eye is off-axis (moving,
       still coming up to the eye), the breath-hold meter; unscoped during a bolt cycle (weapon.js drops ADS while cycling)
     - lower-power magnified optics (1.4x-5.5x, the gun stays on screen): a soft lens vignette and the same scope shadow
     - thermal sights: the 3D canvas is filtered to the sight's palette (white-hot / black-hot / ironbow, ALT cycles) and every
       living player in the line of sight is drawn hot over it
     - the dazzle of an enemy flashlight (effects.js game.dazzle)
   Exports:
     ScopeView   class (game system 'scopeview'): new ScopeView(scene, game); frame(dt), late(dt), dispose()
       game.scopeView = the instance (the HUD hides its fallback overlay while it exists)
   Sounds: Audio.sfx('scope_in' | 'scope_out') when the overlay comes up / goes. */
import { drawScopeOverlay, drawReticle, RETICLE_INFO } from '../weapons/scope.js';
import { currentWeapon, statsOf, scopedView, adsZoom } from './weapon.js';
import { aimPoint } from './hitbox.js';
import { raycast } from '../phys/ray.js';
import { Audio } from './game.js';

const THERMAL_FILTER = {
  whitehot: 'grayscale(1) contrast(.55) brightness(.42)',
  blackhot: 'grayscale(1) contrast(.55) brightness(.5) invert(1)',
  ironbow: 'grayscale(1) contrast(.55) brightness(.32) sepia(1) saturate(4) hue-rotate(-40deg)',
};
const HOT = { whitehot: [255, 255, 250], blackhot: [12, 12, 12], ironbow: [255, 236, 170] };

export class ScopeView {
  constructor(scene, game) {
    this.name = 'scopeview'; this.g = game; this.scene = scene;
    this.cv = document.createElement('canvas');
    this.cv.className = 'lf-scopeview';
    Object.assign(this.cv.style, { position: 'fixed', left: '0', top: '0', width: '100%', height: '100%', pointerEvents: 'none', zIndex: '4' });
    const host = document.getElementById('hud') || document.body;
    host.insertBefore(this.cv, host.firstChild);
    this.ctx = this.cv.getContext('2d');
    this.on = false; this.mode = 'none'; this.k = 0; this.ox = 0; this.oy = 0; this.vx = 0; this.vy = 0; this.filter = ''; this.lastYaw = null; this.lastPitch = 0;
    this.ray = { out: { hit: false, dist: 0, point: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 0, z: 0 }, surf: null, id: -1 } };
    this.pt = { x: 0, y: 0, z: 0 }; this.dirty = true;
    game.scopeView = this;
  }
  setFilter(f) {
    if (f === this.filter) return; this.filter = f;
    const c = this.g.scene && this.g.scene.getEngine().getRenderingCanvas(); if (c) c.style.filter = f;
  }
  frame(dt) {
    dt = Math.min(dt || 0, 0.1);
    const g = this.g, p = g.local, cv = this.cv;
    const W = window.innerWidth, H = window.innerHeight;
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; this.dirty = true; }
    const w = p && p.alive ? currentWeapon(p) : null, st = w && !w.melee ? statsOf(w) : null;
    const ads = st && p ? p.ws.ads : 0;
    const scoped = !!(st && scopedView(p, 0.82)), z = st ? adsZoom(p) : 1;
    const mode = scoped ? (st.thermal ? 'thermal' : 'overlay') : (st && z >= 1.4 && ads > 0.3 ? 'lens' : 'none');
    if (scoped !== this.on) { this.on = scoped; try { Audio.sfx(scoped ? 'scope_in' : 'scope_out', {}); } catch (e) { /* ok */ } }
    this.mode = mode;
    // eye offset (parallax / scope shadow): turning, sway velocity, moving, still coming up
    const view = g.view;
    if (this.lastYaw == null) { this.lastYaw = view.yaw; this.lastPitch = view.pitch; }
    const dyw = view.yaw - this.lastYaw, dpt = view.pitch - this.lastPitch; this.lastYaw = view.yaw; this.lastPitch = view.pitch;
    const R = Math.min(W, H) * 0.46;
    const spd = p ? Math.hypot(p.vel.x, p.vel.z) : 0, t = g.rig ? g.rig.t : 0;
    const bobX = Math.sin(t * 7.5) * spd * 0.012 * R, bobY = Math.abs(Math.cos(t * 7.5)) * spd * 0.01 * R;
    const swX = p ? (p.ws.swX || 0) : 0, swY = p ? (p.ws.swY || 0) : 0;
    const tx = -dyw * R * 2.5 + bobX + swX * R * 6 + (1 - Math.min(1, (ads - 0.82) / 0.18)) * R * 0.25, ty = dpt * R * 2.5 + bobY - swY * R * 6;
    const a = 1 - Math.exp(-dt * 14);
    this.ox += (Math.max(-R * 0.5, Math.min(R * 0.5, tx)) - this.ox) * a; this.oy += (Math.max(-R * 0.5, Math.min(R * 0.5, ty)) - this.oy) * a;
    // thermal palette on the 3D canvas
    if (mode === 'thermal') { const pal = (st.thermal.palettes || ['whitehot'])[p.ws.thermal | 0] || st.thermal.palette || 'whitehot'; this.pal = pal; this.setFilter(THERMAL_FILTER[pal] || THERMAL_FILTER.whitehot); }
    else this.setFilter('');
    this.draw(W, H, R, p, st, mode, ads);
  }
  draw(W, H, R, p, st, mode, ads) {
    const ctx = this.ctx, g = this.g, dz = g.dazzle || 0;
    if (mode === 'none' && dz < 0.01) { if (this.dirty || this.drawn) { ctx.clearRect(0, 0, W, H); this.drawn = false; this.dirty = false; } return; }
    ctx.clearRect(0, 0, W, H); this.drawn = true;
    const cx = W / 2, cy = H / 2;
    if (mode === 'overlay' || mode === 'thermal') {
      if (mode === 'thermal') this.hot(ctx, W, H, cx, cy, R);
      const ret = (g.viewmodel && g.viewmodel.current && g.viewmodel.current.gm && g.viewmodel.current.gm.sight && g.viewmodel.current.gm.sight.reticle) || st.reticle || 'mildot';
      const info = RETICLE_INFO[ret] || {};
      drawScopeOverlay(ctx, W, H, { reticle: ret, r: R, ox: this.ox, oy: this.oy, rox: -this.ox, roy: -this.oy, lit: info.lit, ring: 1,
        thermal: mode === 'thermal' ? { palette: this.pal, zoom: adsZoom(p), battery: 0.8 } : undefined, color: mode === 'thermal' ? (this.pal === 'blackhot' ? '#101010' : '#f2f2ec') : undefined });
      // scope shadow: the dark crescent when the eye is off the axis
      const off = Math.hypot(this.ox, this.oy);
      if (off > R * 0.04) {
        const gx = cx + this.ox * 1.6, gy = cy + this.oy * 1.6;
        const gr = ctx.createRadialGradient(gx, gy, R * 0.55, gx, gy, R * 1.05);
        gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, `rgba(0,0,0,${Math.min(0.95, off / R * 3)})`);
        ctx.save(); ctx.beginPath(); ctx.arc(cx + this.ox, cy + this.oy, R, 0, Math.PI * 2); ctx.clip(); ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H); ctx.restore();
      }
      this.breath(ctx, W, H, p, st, cx, cy, R);
    } else if (mode === 'lens') {
      // low-power optic: soft vignette round the eye relief + the shadow when off-axis
      const k = Math.min(1, (ads - 0.3) / 0.7), rr = R * 1.25, gx = cx + this.ox * 0.8, gy = cy + this.oy * 0.8;
      const gr = ctx.createRadialGradient(gx, gy, rr * 0.62, gx, gy, rr * 1.15);
      gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.7, `rgba(0,0,0,${0.35 * k})`); gr.addColorStop(1, `rgba(0,0,0,${0.85 * k})`);
      ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
    }
    if (dz > 0.01) {
      const gr = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(W, H) * 0.7);
      gr.addColorStop(0, `rgba(255,252,240,${Math.min(0.92, dz * 0.95)})`); gr.addColorStop(0.35, `rgba(255,250,235,${dz * 0.6})`); gr.addColorStop(1, `rgba(255,250,235,${dz * 0.15})`);
      ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
    }
  }
  breath(ctx, W, H, p, st, cx, cy, R) {
    const hold = st.breath && st.breath.hold;
    if (!hold) return;
    const ws = p.ws, held = ws.brH > 0 && ws.brOut <= 0, out = ws.brOut > 0;
    const k = out ? 1 - ws.brOut / 2.5 : 1 - ws.brH / hold;
    const x = cx - 60, y = cy + R + 18 > H - 30 ? H - 34 : cy + R + 18;
    ctx.save();
    ctx.font = '600 11px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = out ? 'rgba(255,120,90,.9)' : 'rgba(230,230,225,.75)';
    ctx.fillText(out ? 'CATCHING BREATH' : held ? 'HOLDING BREATH' : 'SHIFT  HOLD BREATH', cx, y - 6);
    ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.fillRect(x, y, 120, 3);
    ctx.fillStyle = out ? 'rgba(255,110,80,.9)' : 'rgba(235,235,230,.85)'; ctx.fillRect(x, y, 120 * Math.max(0, Math.min(1, k)), 3);
    ctx.restore();
  }
  /** thermal: living players in the line of sight glow over the filtered 3D view */
  hot(ctx, W, H, cx, cy, R) {
    const g = this.g, cam = g.camera, scene = this.scene; if (!cam) return;
    const me = g.local, B = BABYLON;
    const T = scene.getTransformMatrix(), vp = cam.viewport.toGlobal(W, H), col = HOT[this.pal] || HOT.whitehot;
    const cp = cam.globalPosition, v = this.v || (this.v = new B.Vector3()), out = this.vo || (this.vo = new B.Vector3());
    ctx.save(); ctx.beginPath(); ctx.arc(cx + this.ox, cy + this.oy, R, 0, Math.PI * 2); ctx.clip();
    for (const q of g.players.values()) {
      if (!q.alive || q === me) continue;
      for (const [part, rad] of [['chest', 0.3], ['head', 0.14], ['pelvis', 0.24]]) {
        const pt = aimPoint(q, part, this.pt, g.tick);
        const dx = pt.x - cp.x, dy = pt.y - cp.y, dz = pt.z - cp.z, d = Math.hypot(dx, dy, dz);
        if (d > 160 || d < 0.5) continue;
        if (part === 'chest' && raycast(g.world, cp, { x: dx / d, y: dy / d, z: dz / d }, d - 0.3, this.ray).hit) break;
        v.set(pt.x, pt.y, pt.z);
        B.Vector3.ProjectToRef(v, B.Matrix.IdentityReadOnly, T, vp, out);
        if (out.z < 0 || out.z > 1) continue;
        const pr = rad / (d * Math.tan(cam.fov / 2)) * (H / 2);
        const gr = ctx.createRadialGradient(out.x, out.y, 0, out.x, out.y, pr * 1.6);
        gr.addColorStop(0, `rgba(${col[0]},${col[1]},${col[2]},.95)`); gr.addColorStop(0.55, `rgba(${col[0]},${col[1]},${col[2]},.75)`); gr.addColorStop(1, `rgba(${col[0]},${col[1]},${col[2]},0)`);
        ctx.fillStyle = gr; ctx.beginPath(); ctx.ellipse(out.x, out.y, pr * 1.6, pr * (part === 'head' ? 1.7 : 2.2), 0, 0, Math.PI * 2); ctx.fill();
      }
    }
    // sensor noise
    ctx.globalAlpha = 0.07; ctx.fillStyle = this.pal === 'blackhot' ? '#000' : '#fff';
    for (let i = 0; i < 160; i++) ctx.fillRect(cx - R + Math.random() * R * 2, cy - R + Math.random() * R * 2, 1.5, 1.5);
    ctx.restore();
    void drawReticle;
  }
  dispose() {
    this.setFilter('');
    if (this.cv.parentNode) this.cv.parentNode.removeChild(this.cv);
    if (this.g.scopeView === this) this.g.scopeView = null;
  }
}
