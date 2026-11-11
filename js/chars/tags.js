/* LIVE FIRE — team-mate markers (DOM in #hud): there is no friendly fire, so team-mates must read at a glance. Every live
   team-mate gets a small chevron in the team colour over the head (shown through walls, faded with distance), with the name
   when close (< 22 m) or when you look near them. Enemies never get a tag; free-for-all shows none. The 3D side of it is the
   team-coloured rim light on friendly characters (kit.js) and the ID patches on shoulders, helmet and plate carrier.
   Exports:
     class NameTags   new NameTags(game); update(characters Map, dt) (late frame); remove(id); dispose() */
import { TEAM_COLORS } from '../game/player.js';

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export class NameTags {
  constructor(game) {
    this.g = game; this.els = new Map();
    const host = document.getElementById('hud');
    this.root = document.createElement('div');
    this.root.className = 'lf-tags';
    this.root.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:2';
    if (host) host.appendChild(this.root);
    this.v = new BABYLON.Vector3(); this.out = new BABYLON.Vector3();
  }
  el(id) {
    let e = this.els.get(id);
    if (!e) {
      e = document.createElement('div');
      e.style.cssText = 'position:absolute;left:0;top:0;transform:translate(-50%,-100%);text-align:center;white-space:nowrap;font:600 11px/1.1 "Rajdhani","Barlow Condensed",system-ui,sans-serif;letter-spacing:.06em;text-transform:uppercase;text-shadow:0 1px 2px rgba(0,0,0,.9),0 0 3px rgba(0,0,0,.7);will-change:transform,opacity';
      e.innerHTML = '<div class="tg-n"></div><div class="tg-c" style="width:0;height:0;margin:2px auto 0;border-left:6px solid transparent;border-right:6px solid transparent;border-top:7px solid currentColor;filter:drop-shadow(0 0 2px rgba(0,0,0,.8))"></div>';
      e._n = e.firstChild; e._c = e.lastChild; e._name = null; e._show = null;
      this.root.appendChild(e); this.els.set(id, e);
    }
    return e;
  }
  remove(id) { const e = this.els.get(id); if (e) { e.remove(); this.els.delete(id); } }
  update(list, dt) {
    const g = this.g, me = g.local, cam = g.camera, scene = g.scene;
    const engine = scene && scene.getEngine();
    if (!me || !cam || !engine) return;
    const viewer = !me.alive && g.spectate ? g.players.get(g.spectate) || me : me;
    const team = me.team;
    const W = engine.getRenderWidth(), H = engine.getRenderHeight();
    const cv = engine.getRenderingCanvas(), cw = cv ? cv.clientWidth || W : W, ch = cv ? cv.clientHeight || H : H;
    const vp = cam.viewport.toGlobal(W, H);
    const tm = scene.getTransformMatrix();
    const fw = cam.getDirection(BABYLON.Axis.Z);
    const seen = new Set();
    if (team > 0 && !g.ended) for (const c of list.values()) {
      const p = c.p;
      if (p === me || p === viewer || !p.alive || p.team !== team) continue;
      const O = c.O, hd = O && O.bones && O.bones.head && O.bones.head.o;
      const x = hd ? hd[0] : p.pos.x, y = (hd ? hd[1] : p.pos.y + 1.6) + 0.32, z = hd ? hd[2] : p.pos.z;
      const dx = x - cam.position.x, dy = y - cam.position.y, dz = z - cam.position.z, d = Math.hypot(dx, dy, dz) || 1;
      if ((dx * fw.x + dy * fw.y + dz * fw.z) / d < 0.05) continue;          // behind the camera
      this.v.set(x, y, z);
      BABYLON.Vector3.ProjectToRef(this.v, BABYLON.Matrix.IdentityReadOnly, tm, vp, this.out);
      if (!(this.out.z > 0 && this.out.z < 1)) continue;
      seen.add(p.id);
      const e = this.el(p.id);
      const sx = this.out.x * cw / W, sy = this.out.y * ch / H;
      const look = (dx * fw.x + dy * fw.y + dz * fw.z) / d;                    // cos of the angle off the crosshair
      const showName = d < 22 || look > 0.992;
      const op = Math.max(0.35, Math.min(1, 1.15 - d / 70));
      e.style.transform = 'translate(' + sx.toFixed(1) + 'px,' + sy.toFixed(1) + 'px) translate(-50%,-100%)';
      e.style.opacity = op.toFixed(2);
      const col = TEAM_COLORS[p.team] || '#ddd';
      if (e._col !== col) { e.style.color = col; e._col = col; }
      if (e._name !== p.name) { e._n.innerHTML = esc(p.name); e._name = p.name; }
      if (e._show !== showName) { e._n.style.display = showName ? '' : 'none'; e._show = showName; }
      e.style.display = '';
    }
    for (const [id, e] of this.els) if (!seen.has(id)) e.style.display = 'none';
  }
  dispose() { this.root.remove(); this.els.clear(); }
}
