#!/usr/bin/env python3
"""LIVE FIRE - CC0 prop asset fetcher (props worker).

Downloads EXACTLY the curated list below, converts it to the repo layout and records every file in
assets/manifest.json (licence, source URL, author). Re-running it gives the same files.

  python3 tools/fetch-props.py                # everything
  python3 tools/fetch-props.py --models       # Poly Haven glTF models -> assets/models/ph/<name>.glb
  python3 tools/fetch-props.py --foliage      # foliage atlas + bark   -> assets/models/tex/
  python3 tools/fetch-props.py --cache DIR    # raw downloads (default ~/.cache/livefire-assets/props, never the repo)

Models: the Poly Haven 1k glTF is packed into ONE .glb (geometry untouched; every texture re-encoded as JPG, colour maps at
`tex` px, data maps (normal / ARM) at `data` px), so a prop is a single small file that B.model() loads.
Foliage: assets/models/tex/foliage.jpg (+ foliage_a.jpg alpha mask) is a 2x2 atlas COMPOSED here from CC0 ambientCG leaf,
grass and needle atlases (seeded, reproducible): [0] broadleaf twig cluster, [1] dense dark leaf cluster (hedges, bushes),
[2] grass tuft with seed heads, [3] conifer branch. bark.jpg / bark_nor.jpg are ambientCG Bark001 at 1K.
Needs Pillow + numpy.
"""
import argparse, io, json, math, os, random, struct, sys, urllib.request, zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / 'assets'
UA = 'LiveFire-asset-fetch/1.0 (+https://github.com/winsontian254-dotcom/body-cam)'

# name -> (poly haven id, colour texture px, data texture px, note)
MODELS = {
    'barrel_red':      ('Barrel_01', 512, 512, 'red steel drum with a flammable warning label'),
    'drum_plastic':    ('Barrel_02', 512, 256, 'blue plastic chemical drum'),
    'drum_steel':      ('barrel_03', 512, 256, 'blue steel oil drum'),
    'trashbag':        ('trashbag', 512, 512, 'full black bin bag'),
    'cement_bag':      ('cement_bag', 512, 256, 'paper cement sack'),
    'tyre':            ('old_tyre', 512, 512, 'worn car tyre'),
    'wet_floor_sign':  ('WetFloorSign_01', 512, 256, 'yellow wet floor A-frame sign'),
    'utility_box':     ('utility_box_01', 512, 512, 'grey street electrical cabinet'),
    'utility_box_2':   ('utility_box_02', 512, 512, 'green double street electrical cabinet'),
    'plastic_crate':   ('plastic_crate_02', 512, 512, 'yellow plastic produce crate'),
    'sofa_leather':    ('sofa_02', 1024, 512, 'black leather chesterfield loveseat'),
    'armchair_classic': ('ArmChair_01', 1024, 512, 'upholstered classic armchair'),
    'covered_car':     ('covered_car', 1024, 512, 'car under a dusty cover'),
    'office_desk_metal': ('metal_office_desk', 1024, 512, 'grey steel office desk with drawers'),
    'monobloc_chair':  ('plastic_monobloc_chair_01', 512, 256, 'white plastic garden chair'),
    'wooden_chair':    ('painted_wooden_chair_01', 512, 256, 'white painted wooden chair'),
    'steel_shelves':   ('steel_frame_shelves_01', 1024, 512, 'steel frame shelves with wooden boards'),
    'trash_cans':      ('metal_trash_can', 512, 512, 'two galvanised trash cans with lids'),
}

FOLIAGE_SRC = ['LeafSet014', 'LeafSet016', 'LeafSet022', 'Foliage001', 'Foliage002', 'Foliage006', 'PineNeedles001', 'Bark001']


def http(url, timeout=180):
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def cached(cache, name, url):
    p = cache / name
    if p.exists() and p.stat().st_size > 0:
        return p.read_bytes()
    print('  download', url)
    data = http(url)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_bytes(data)
    return data


def load_manifest():
    p = ASSETS / 'manifest.json'
    return json.loads(p.read_text()) if p.exists() else {}


def save_manifest(m):
    """Same layout as tools/fetch-assets.py writes: one entry per line, keys sorted, _note first. Re-reads the file first so
    entries other tools added meanwhile are kept."""
    p = ASSETS / 'manifest.json'
    cur = load_manifest()
    cur.update(m)
    keys = sorted(k for k in cur if k != '_note')
    items = ([('_note', cur['_note'])] if '_note' in cur else []) + [(k, cur[k]) for k in keys]
    p.write_text('{\n' + ',\n'.join('  ' + json.dumps(k) + ': ' + json.dumps(v, ensure_ascii=False) for k, v in items) + '\n}\n')


def jpg_bytes(im, q):
    b = io.BytesIO()
    kw = dict(quality=q, optimize=True)
    if im.mode == 'RGB': kw['subsampling'] = 0 if q >= 88 else 2
    from PIL import ImageFile
    ImageFile.MAXBLOCK = max(ImageFile.MAXBLOCK, im.size[0] * im.size[1] * 4)   # optimize=True needs the whole image in one block
    im.save(b, 'JPEG', **kw)
    return b.getvalue()


# ------------------------------------------------------------------------------------------------ Poly Haven -> GLB
def build_glb(cache, name, pid, tex_px, data_px):
    from PIL import Image
    files = json.loads(cached(cache, f'ph/{pid}.files.json', f'https://api.polyhaven.com/files/{pid}'))
    info = json.loads(cached(cache, f'ph/{pid}.info.json', f'https://api.polyhaven.com/info/{pid}'))
    g = files['gltf']['1k']['gltf']
    gltf = json.loads(cached(cache, f'ph/{pid}/{pid}.gltf', g['url']))
    inc = {k: cached(cache, f'ph/{pid}/' + k.split('/')[-1], v['url']) for k, v in g['include'].items()}
    by_uri = {k: v for k, v in inc.items()}
    # binary buffer(s) -> one
    blobs = []
    for buf in gltf.get('buffers', []):
        data = by_uri[buf['uri']]
        blobs.append(data)
    assert len(blobs) == 1, 'expected one buffer'
    bin_data = bytearray(blobs[0])
    gltf['buffers'] = [{'byteLength': 0}]
    # textures: which images are data (normal, metallicRoughness, occlusion)?
    data_imgs = set()
    for mat in gltf.get('materials', []):
        for key in ('normalTexture', 'occlusionTexture'):
            if key in mat:
                data_imgs.add(gltf['textures'][mat[key]['index']]['source'])
        pbr = mat.get('pbrMetallicRoughness', {})
        if 'metallicRoughnessTexture' in pbr:
            data_imgs.add(gltf['textures'][pbr['metallicRoughnessTexture']['index']]['source'])
    for i, img in enumerate(gltf.get('images', [])):
        im = Image.open(io.BytesIO(by_uri[img['uri']])); im.load()
        im = im.convert('RGB')
        px = data_px if i in data_imgs else tex_px
        if max(im.size) > px:
            im = im.resize((px, px), Image.LANCZOS)
        data = jpg_bytes(im, 90 if i in data_imgs else 84)
        while len(bin_data) % 4: bin_data.append(0)
        off = len(bin_data); bin_data += data
        gltf.setdefault('bufferViews', []).append({'buffer': 0, 'byteOffset': off, 'byteLength': len(data)})
        gltf['images'][i] = {'bufferView': len(gltf['bufferViews']) - 1, 'mimeType': 'image/jpeg', 'name': img.get('name', f'img{i}')}
    while len(bin_data) % 4: bin_data.append(0)
    gltf['buffers'][0]['byteLength'] = len(bin_data)
    gltf.setdefault('asset', {})['generator'] = 'LIVE FIRE tools/fetch-props.py (from Poly Haven ' + pid + ')'
    js = json.dumps(gltf, separators=(',', ':')).encode()
    while len(js) % 4: js += b' '
    out = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(bin_data))
    out += struct.pack('<II', len(js), 0x4E4F534A) + js
    out += struct.pack('<II', len(bin_data), 0x004E4942) + bytes(bin_data)
    dst = ASSETS / 'models' / 'ph' / (name + '.glb')
    dst.parent.mkdir(parents=True, exist_ok=True)
    dst.write_bytes(out)
    authors = ', '.join(info.get('authors', {}).keys()) or 'Poly Haven'
    dims = info.get('dimensions')
    return dst, authors, dims


def do_models(cache, man):
    for name, (pid, tpx, dpx, note) in MODELS.items():
        print('model', name, '<-', pid)
        dst, authors, dims = build_glb(cache, name, pid, tpx, dpx)
        kb = dst.stat().st_size / 1024
        print(f'  {dst.relative_to(ROOT)}  {kb:.0f} KB  dims(mm) {dims}')
        man[f'models/ph/{name}.glb'] = {'license': 'CC0 1.0', 'source': f'https://polyhaven.com/a/{pid}', 'author': authors,
                                       'note': f'{note}; Poly Haven 1k glTF packed into one GLB by tools/fetch-props.py '
                                               f'(colour maps {tpx} px, data maps {dpx} px, JPG)'}


# ------------------------------------------------------------------------------------------------ ambientCG sources
def acg(cache, aid):
    z = zipfile.ZipFile(io.BytesIO(cached(cache, f'acg/{aid}_1K-JPG.zip', f'https://ambientcg.com/get?file={aid}_1K-JPG.zip')))
    out = {}
    for n in z.namelist():
        for k in ('Color', 'Opacity', 'NormalGL', 'Roughness', 'AmbientOcclusion'):
            if n.endswith('_' + k + '.jpg'):
                out[k] = z.read(n)
    return out


def components(alpha, min_px=400):
    """Connected components of an alpha mask (numpy bool array) -> list of (x0, y0, x1, y1) boxes. Pure numpy/python BFS
    on a 4x downsampled mask (the atlases keep their elements well apart)."""
    import numpy as np
    k = 4
    h, w = alpha.shape
    sm = alpha[:h - h % k, :w - w % k].reshape(h // k, k, w // k, k).max(axis=(1, 3))
    H, W = sm.shape
    seen = np.zeros_like(sm, dtype=bool)
    boxes = []
    for y in range(H):
        for x in range(W):
            if sm[y, x] and not seen[y, x]:
                st = [(y, x)]; seen[y, x] = True; n = 0
                y0 = y1 = y; x0 = x1 = x
                while st:
                    cy, cx = st.pop(); n += 1
                    y0 = min(y0, cy); y1 = max(y1, cy); x0 = min(x0, cx); x1 = max(x1, cx)
                    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (-1, -1), (1, -1), (-1, 1)):
                        ny, nx = cy + dy, cx + dx
                        if 0 <= ny < H and 0 <= nx < W and sm[ny, nx] and not seen[ny, nx]:
                            seen[ny, nx] = True; st.append((ny, nx))
                if n * k * k >= min_px:
                    boxes.append((x0 * k, y0 * k, (x1 + 1) * k, (y1 + 1) * k))
    return boxes


def sprites(src, min_px=400):
    """Cut the elements of an ambientCG atlas into RGBA sprites."""
    from PIL import Image
    import numpy as np
    col = Image.open(io.BytesIO(src['Color'])).convert('RGB')
    a = Image.open(io.BytesIO(src['Opacity'])).convert('L')
    an = np.asarray(a) > 100
    out = []
    for (x0, y0, x1, y1) in components(an, min_px):
        rgba = col.crop((x0, y0, x1, y1)).convert('RGBA')
        rgba.putalpha(a.crop((x0, y0, x1, y1)))
        out.append(rgba)
    return out


def bleed(rgba, passes=48):
    """Push colour into the transparent texels (mip / filter fringes take the leaf colour, not black): iterative dilation."""
    from PIL import Image
    import numpy as np
    arr = np.asarray(rgba).astype(np.float32)
    rgb = arr[..., :3].copy()
    filled = arr[..., 3] > 127
    mean = rgb[filled].mean(axis=0) if filled.any() else np.array([80, 90, 60], np.float32)
    for _ in range(passes):
        acc = np.zeros_like(rgb); n = np.zeros(filled.shape, np.float32)
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                if dx == 0 and dy == 0: continue
                f = np.roll(np.roll(filled, dy, 0), dx, 1)
                acc += np.roll(np.roll(rgb, dy, 0), dx, 1) * f[..., None]; n += f
        grow = (~filled) & (n > 0)
        if not grow.any(): break
        rgb[grow] = acc[grow] / n[grow][:, None]
        filled = filled | grow
    rgb[~filled] = mean
    return Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8), 'RGB')


def paste_rot(canvas, spr, x, y, ang, scale, tint=1.0):
    """Paste a sprite centred at (x, y), rotated by ang degrees, scaled, brightness tint."""
    from PIL import Image, ImageEnhance
    w, h = spr.size
    s = spr.resize((max(2, int(w * scale)), max(2, int(h * scale))), Image.LANCZOS)
    if tint != 1.0:
        rgb = ImageEnhance.Brightness(s.convert('RGB')).enhance(tint)
        rgb.putalpha(s.getchannel('A')); s = rgb
    s = s.rotate(ang, resample=Image.BICUBIC, expand=True)
    canvas.alpha_composite(s, (int(x - s.size[0] / 2), int(y - s.size[1] / 2)))


def twig(draw, pts, w0, w1, col):
    n = len(pts) - 1
    for i in range(n):
        w = w0 + (w1 - w0) * i / max(1, n - 1)
        draw.line([pts[i], pts[i + 1]], fill=col, width=max(1, int(w)))


def leaf_cluster(leaves, size, rnd, dark=False, density=1.0):
    """A dense leafy twig cluster seen from above: fills a rough ellipse of the cell (canopy / bush card)."""
    from PIL import Image, ImageDraw
    cv = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(cv)
    cx, cy, rx, ry = size * 0.5, size * 0.49, size * 0.40, size * 0.39
    base = (cx, size * 0.97)
    twigs = []
    for k in range(7):
        a = math.radians(-70 + 140 * k / 6 + rnd.uniform(-8, 8))
        tx, ty = cx + math.sin(a) * rx * rnd.uniform(0.75, 0.95), cy - math.cos(a) * ry * rnd.uniform(0.75, 0.95)
        pts = [(base[0] + (tx - base[0]) * t + math.sin(t * 5 + k) * size * 0.015, base[1] + (ty - base[1]) * t) for t in [i / 8 for i in range(9)]]
        twigs.append(pts)
    for t in twigs:
        twig(d, t, size * 0.02, size * 0.006, (56, 42, 30, 255))
    n = int(150 * density)
    pts = []
    for k in range(n):
        if k % 3:   # along a twig
            t = rnd.choice(twigs); p = t[rnd.randint(3, 8)]
            pts.append((p[0] + rnd.uniform(-size * .06, size * .06), p[1] + rnd.uniform(-size * .06, size * .06)))
        else:       # fill the ellipse
            r = math.sqrt(rnd.random()) * 0.92; a = rnd.uniform(0, math.tau)
            pts.append((cx + math.cos(a) * rx * r, cy + math.sin(a) * ry * r))
    # paint the inner (shadowed) leaves first, the outer (lit) ones last
    pts.sort(key=lambda p: -math.hypot((p[0] - cx) / rx, (p[1] - cy) / ry))
    pts.reverse()
    for (x, y) in pts:
        spr = rnd.choice(leaves)
        e = min(1.0, math.hypot((x - cx) / rx, (y - cy) / ry))
        sc = size * rnd.uniform(0.11, 0.16) / max(spr.size)
        tint = (0.55 + 0.45 * e) * rnd.uniform(0.85, 1.08) * (0.8 if dark else 1.0)
        paste_rot(cv, spr, x, y, rnd.uniform(0, 360), sc, tint)
    return cv


def grass_tuft(blades, heads, size, rnd):
    """A tuft of grass blades (and a few seed stalks) growing from the bottom edge of the cell."""
    from PIL import Image
    cv = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    def put(spr, hfrac, spread, ang):
        s = spr if spr.size[1] >= spr.size[0] else spr.rotate(90, expand=True)
        sc = size * hfrac / s.size[1]
        s = s.resize((max(2, int(s.size[0] * sc)), max(2, int(s.size[1] * sc))), Image.LANCZOS)
        s = s.rotate(ang, resample=Image.BICUBIC, expand=True)
        x = size * 0.5 + rnd.uniform(-spread, spread) * size - s.size[0] / 2
        cv.alpha_composite(s, (int(x), int(size - s.size[1])))
    tall = [b for b in blades if max(b.size) > 300] or blades
    for k in range(40):
        put(rnd.choice(tall), rnd.uniform(0.45, 0.97), 0.32, rnd.uniform(-20, 20))
    for k in range(5):
        h = max(heads, key=lambda s: max(s.size)) if k == 0 else rnd.choice(heads)
        if max(h.size) < 300: continue
        put(h, rnd.uniform(0.8, 0.98), 0.25, rnd.uniform(-10, 10))
    return cv


def conifer_branch(needles, size, rnd):
    """A branch seen from above, growing from the left edge (trunk side) to the right."""
    from PIL import Image, ImageDraw
    cv = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(cv)
    y0 = size * 0.5
    main = [(size * 0.02 + t * size * 0.94, y0 + math.sin(t * 3.0) * size * 0.03) for t in [i / 10 for i in range(11)]]
    twigs = [main]
    for i in range(1, 10):
        bx, by = main[i]
        for side in (-1, 1):
            L = size * (0.30 - 0.018 * i) * rnd.uniform(0.8, 1.1)
            a = math.radians(rnd.uniform(35, 55))
            twigs.append([(bx + math.cos(a) * L * t, by + side * math.sin(a) * L * t) for t in [k / 4 for k in range(5)]])
    for t in twigs:
        twig(d, t, size * 0.016, size * 0.005, (70, 48, 32, 255))
    for t in twigs:
        for (x, y) in t[1:]:
            for k in range(6):
                spr = rnd.choice(needles)
                sc = size / 1024 * rnd.uniform(0.55, 0.85) * (300 / max(spr.size))
                paste_rot(cv, spr, x + rnd.uniform(-10, 10), y + rnd.uniform(-10, 10), rnd.uniform(0, 360), sc, rnd.uniform(0.7, 1.05))
    return cv


def green(spr, rnd):
    """The ambientCG needles are dry (brown): keep their luminance, colour them like live spruce needles."""
    from PIL import Image
    import numpy as np
    a = np.asarray(spr).astype(np.float32)
    lum = (a[..., 0] * .3 + a[..., 1] * .59 + a[..., 2] * .11) / 255.0
    lum = np.clip(lum / max(lum[a[..., 3] > 127].mean() if (a[..., 3] > 127).any() else .5, 1e-3) * .5, 0, 1.4)
    tint = np.array([70, 104, 52], np.float32) * rnd.uniform(.9, 1.1)
    out = np.dstack([np.clip(lum[..., None] * tint, 0, 255), a[..., 3:4]]).astype(np.uint8)
    return Image.fromarray(out, 'RGBA')


def do_foliage(cache, man):
    from PIL import Image
    import numpy as np
    src = {a: acg(cache, a) for a in FOLIAGE_SRC}
    rnd = random.Random(1337)
    S = 512
    broad = sprites(src['LeafSet014'])
    oak = sprites(src['LeafSet016']) + sprites(src['LeafSet022'])
    blades = sprites(src['Foliage001'], 200) + sprites(src['Foliage006'], 200)
    heads = sprites(src['Foliage002'], 200)
    needles = [green(n, rnd) for n in sprites(src['PineNeedles001'], 200)]
    print(f'  sprites: broad {len(broad)} oak {len(oak)} blades {len(blades)} heads {len(heads)} needles {len(needles)}')
    atlas = Image.new('RGBA', (2 * S, 2 * S), (0, 0, 0, 0))
    atlas.alpha_composite(leaf_cluster(broad, S, rnd), (0, 0))
    atlas.alpha_composite(leaf_cluster(oak, S, rnd, dark=True, density=1.35), (S, 0))
    atlas.alpha_composite(grass_tuft(blades, heads, S, rnd), (0, S))
    atlas.alpha_composite(conifer_branch(needles, S, rnd), (S, S))
    rgb = bleed(atlas)
    tex = ASSETS / 'models' / 'tex'
    tex.mkdir(parents=True, exist_ok=True)
    (tex / 'foliage.jpg').write_bytes(jpg_bytes(rgb, 86))
    (tex / 'foliage_a.jpg').write_bytes(jpg_bytes(atlas.getchannel('A'), 90))
    srcs = ', '.join(f'https://ambientcg.com/view?id={a}' for a in FOLIAGE_SRC if a != 'Bark001')
    note = ('2x2 foliage card atlas composed by tools/fetch-props.py from CC0 ambientCG atlases: [0] broadleaf twig, '
            '[1] dense dark leaf cluster, [2] grass tuft, [3] conifer branch')
    man['models/tex/foliage.jpg'] = {'license': 'CC0 1.0', 'source': srcs, 'author': 'Lennart Demes (ambientCG); composed for LIVE FIRE', 'note': note + ' (colour)'}
    man['models/tex/foliage_a.jpg'] = {'license': 'CC0 1.0', 'source': srcs, 'author': 'Lennart Demes (ambientCG); composed for LIVE FIRE', 'note': note + ' (alpha mask)'}
    b = src['Bark001']
    col = Image.open(io.BytesIO(b['Color'])).convert('RGB')
    nor = Image.open(io.BytesIO(b['NormalGL'])).convert('RGB')
    (tex / 'bark.jpg').write_bytes(jpg_bytes(col, 84))
    (tex / 'bark_nor.jpg').write_bytes(jpg_bytes(nor, 88))
    for f, k in (('bark.jpg', 'colour'), ('bark_nor.jpg', 'OpenGL normal')):
        man['models/tex/' + f] = {'license': 'CC0 1.0', 'source': 'https://ambientcg.com/view?id=Bark001', 'author': 'Lennart Demes (ambientCG)',
                                  'note': f'tree bark {k}, 1K JPG re-encoded by tools/fetch-props.py'}
    for f in ('foliage.jpg', 'foliage_a.jpg', 'bark.jpg', 'bark_nor.jpg'):
        print(f'  assets/models/tex/{f}  {(tex / f).stat().st_size / 1024:.0f} KB')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--models', action='store_true')
    ap.add_argument('--foliage', action='store_true')
    ap.add_argument('--only', default='')
    ap.add_argument('--cache', default=os.path.expanduser('~/.cache/livefire-assets/props'))
    a = ap.parse_args()
    cache = Path(a.cache); cache.mkdir(parents=True, exist_ok=True)
    allp = not a.models and not a.foliage
    man = load_manifest()
    if a.only:
        keep = set(a.only.split(','))
        for k in list(MODELS):
            if k not in keep: del MODELS[k]
    if a.models or allp: do_models(cache, man)
    if a.foliage or allp: do_foliage(cache, man)
    save_manifest(man)
    print('manifest updated')


if __name__ == '__main__':
    main()
