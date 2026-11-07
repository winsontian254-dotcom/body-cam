#!/usr/bin/env python3
"""LIVE FIRE - CC0 asset fetcher (graphics).

Downloads EXACTLY the curated list below (Poly Haven + ambientCG, all CC0), converts it to the repo layout and
records every file in assets/manifest.json (licence, source URL, author). Re-running it is reproducible: the same
inputs give the same files.

  python3 tools/fetch-assets.py                 # textures + HDRIs (bakes .env through node tools/bake-env.mjs)
  python3 tools/fetch-assets.py --only asphalt,brick --force
  python3 tools/fetch-assets.py --textures      # textures only
  python3 tools/fetch-assets.py --hdris         # HDRIs only
  python3 tools/fetch-assets.py --cache DIR     # where raw downloads live (default ~/.cache/livefire-assets, never the repo)

Texture set layout (assets/textures/<set>/):
  <set>_diff.jpg     albedo, sRGB, 1K (2K for the three hero sets), low frequencies flattened (see flatten()), q86 (hero q82)
  <set>_nor.jpg      tangent-space normal, OpenGL convention (+Y = up in the image), q88 4:4:4 (hero 2K q82)
  <set>_arm.jpg      R = ambient occlusion, G = roughness, B = metalness (linear), 1K q85
  <set>_disp.jpg     (some sets) height, used for parallax occlusion on ultra
  <set>_opacity.jpg  (cut-out sets) alpha mask
HDRIs: assets/hdri/<name>.env (Babylon prefiltered RGBD cube, 512 px faces, WebP; the sun is painted out: env.js adds it as
a DirectionalLight) + <name>_sky.jpg (the visible sky, 2K LDR equirect) + assets/hdri/hdri.json (sun direction, colour and
strength measured from the HDR, sky scale, average sky / horizon / ground colour).

Needs Python 3 + Pillow (+ numpy for nothing heavy), and for HDRIs Node + Playwright (pre-installed, tools/ only).
"""
import argparse, io, json, os, subprocess, sys, urllib.request, zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / 'assets'
UA = 'LiveFire-asset-fetcher/1.0 (+https://github.com/winsontian254-dotcom/body-cam)'

# ------------------------------------------------------------------------------------------------------------
# Curated texture sets. set = folder name under assets/textures; src = 'ph:<polyhaven id>' or 'acg:<ambientCG id>'.
# res: '1k' or '2k' (hero). disp: also keep the height map (parallax on ultra). opacity: keep the cut-out mask.
# flat: strength of the low-frequency flattening of the albedo (default .8; 0 where the large-scale pattern is the point).
# Materials in js/gfx/materials.js point at these sets (several materials share one set with other tint/scale).
TEXTURES = [
    dict(set='asphalt',        src='ph:asphalt_02',               res='2k'),
    dict(set='concrete_wall',  src='ph:concrete_wall_006',        res='2k'),
    dict(set='concrete_floor', src='ph:concrete_floor_worn_001',  res='2k'),
    dict(set='concrete_panels', src='ph:concrete_wall_004',       res='1k'),
    dict(set='pavement',       src='ph:concrete_pavement',        res='1k', disp=True),
    dict(set='brick',          src='ph:factory_brick',            res='1k', disp=True),
    dict(set='brick_red',      src='ph:large_red_bricks',         res='1k', disp=True),
    dict(set='plaster',        src='ph:grey_plaster',             res='1k'),
    dict(set='plaster_white',  src='ph:painted_plaster_wall',     res='1k'),
    dict(set='tile_white',     src='ph:long_white_tiles',         res='1k', disp=True, flat=0.6),
    dict(set='tile_floor',     src='ph:large_floor_tiles_02',     res='1k', disp=True),
    dict(set='wood_planks',    src='ph:weathered_planks',         res='1k', disp=True),
    dict(set='wood_floor',     src='ph:wood_floor',               res='1k'),
    dict(set='wood_dark',      src='ph:dark_wooden_planks',       res='1k'),
    dict(set='plywood',        src='ph:plywood',                  res='1k'),
    dict(set='parquet',        src='ph:herringbone_parquet',      res='1k', flat=0.5),
    dict(set='metal_plate',    src='ph:metal_plate',              res='1k', disp=True),
    dict(set='metal_rust',     src='ph:rust_coarse_01',           res='1k'),
    dict(set='corrugated',     src='ph:corrugated_iron',          res='1k'),
    dict(set='corrugated_rust', src='ph:rusty_corrugated_iron',   res='1k'),
    dict(set='container',      src='ph:container_side',           res='1k', flat=0),
    dict(set='gravel',         src='ph:gravel_floor',             res='1k'),
    dict(set='dirt',           src='ph:dry_ground_rocks',         res='1k'),
    dict(set='grass',          src='ph:leafy_grass',              res='1k'),
    dict(set='sand',           src='ph:coast_sand_01',            res='1k'),
    dict(set='snow',           src='ph:snow_02',                  res='1k'),
    dict(set='rock',           src='ph:rock_wall_02',             res='1k', disp=True),
    dict(set='mud',            src='ph:brown_mud_02',             res='1k'),
    dict(set='cobblestone',    src='ph:cobblestone_floor_08',     res='1k', disp=True),
    dict(set='marble',         src='ph:marble_01',                res='1k'),
    dict(set='carpet',         src='ph:dirty_carpet',             res='1k'),
    dict(set='fabric',         src='ph:rough_linen',              res='1k'),
    dict(set='burlap',         src='ph:hessian_230',              res='1k'),
    dict(set='roof_tiles',     src='ph:clay_roof_tiles_02',       res='1k', disp=True, flat=0.6),
    dict(set='wood_siding',    src='ph:weathered_plank_siding',   res='1k', flat=0.6),
    dict(set='painted_metal',  src='acg:PaintedMetal004',         res='1k', flat=0.5),
    dict(set='steel',          src='acg:Metal009',                res='1k'),
    dict(set='hazard',         src='acg:PaintedMetal016',         res='1k', flat=0),
    dict(set='rubber',         src='acg:Rubber004',               res='1k'),
    dict(set='cardboard',      src='acg:Cardboard004',            res='1k', flat=0.5),
    dict(set='ceiling_tile',   src='acg:OfficeCeiling001',        res='1k', flat=0),
    dict(set='grate',          src='acg:MetalWalkway010',         res='1k', opacity=True, flat=0),
    dict(set='chainlink',      src='acg:Fence003',                res='1k', opacity=True, flat=0),
    dict(set='leather',        src='acg:Leather011',              res='1k', flat=0.5),
]

# Curated HDRIs (Poly Haven, CC0). name -> source id. 2K .hdr in, prefiltered 512 px .env out.
HDRIS = [
    dict(name='clear',         src='kloofendal_43d_clear_puresky',          note='clear day, sun 43 deg'),
    dict(name='partly_cloudy', src='kloofendal_48d_partly_cloudy_puresky',  note='day, cumulus, sun 48 deg'),
    dict(name='overcast',      src='kloofendal_overcast_puresky',           note='bright overcast'),
    dict(name='storm',         src='overcast_soil_puresky',                 note='dark rain overcast'),
    dict(name='golden',        src='qwantani_sunset_puresky',               note='golden hour, low warm sun'),
    dict(name='dusk',          src='kloppenheim_06_puresky',                note='sunset clouds, dusk'),
    dict(name='noon',          src='qwantani_noon_puresky',                 note='clear noon, high sun (desert, dust)'),
    dict(name='fog',           src='kloofendal_misty_morning_puresky',      note='misty morning'),
    dict(name='snow',          src='snow_field_2_puresky',                  note='snowy overcast'),
    dict(name='night',         src='qwantani_night_puresky',                note='clear night, stars'),
    dict(name='night_city',    src='hansaplatz',                            note='urban night, sodium street lights'),
    dict(name='warehouse',     src='empty_warehouse_01',                    note='interior: industrial hall, skylights'),
]

# ------------------------------------------------------------------------------------------------------------
def http(url, timeout=120):
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

_info = {}
def ph_info(cache, pid):
    if pid not in _info:
        _info[pid] = json.loads(cached(cache, f'ph/{pid}.info.json', f'https://api.polyhaven.com/info/{pid}'))
    return _info[pid]

def ph_files(cache, pid):
    return json.loads(cached(cache, f'ph/{pid}.files.json', f'https://api.polyhaven.com/files/{pid}'))

def img_open(data):
    from PIL import Image
    im = Image.open(io.BytesIO(data))
    im.load()
    return im

def save_jpg(im, path, q, sub444=False, mode=None):
    from PIL import Image
    if mode:
        im = im.convert(mode)
    elif im.mode not in ('RGB', 'L'):
        im = im.convert('RGB')
    path.parent.mkdir(parents=True, exist_ok=True)
    kw = dict(quality=q, optimize=True)
    if im.mode == 'RGB':
        kw['subsampling'] = 0 if sub444 else 2
    im.save(path, 'JPEG', **kw)

def flatten(im, strength, sigma_frac=1 / 10):
    """Remove the low-frequency light / colour drift of a tileable albedo (periodic Gaussian blur through the FFT, so the
    result still tiles): out = in * (mean / blur(in)) ** strength. Large-scale variation then comes from the world-space
    macro variation in materials.js, which does not repeat, instead of repeating as visible bands every tile."""
    import numpy as np
    from PIL import Image
    a = np.asarray(im.convert('RGB'), dtype=np.float64) / 255.0
    lin = np.where(a <= .04045, a / 12.92, ((a + .055) / 1.055) ** 2.4)
    h, w, _ = lin.shape
    fy = np.fft.fftfreq(h)[:, None]; fx = np.fft.fftfreq(w)[None, :]
    sig = sigma_frac * max(h, w)
    g = np.exp(-2 * (np.pi ** 2) * (sig ** 2) * (fx ** 2 + fy ** 2))
    out = np.empty_like(lin)
    for c in range(3):
        blur = np.real(np.fft.ifft2(np.fft.fft2(lin[:, :, c]) * g))
        ratio = (lin[:, :, c].mean() / np.maximum(blur, 1e-4)) ** strength
        out[:, :, c] = np.clip(lin[:, :, c] * np.clip(ratio, .5, 2.0), 0, 1)
    srgb = np.where(out <= .0031308, out * 12.92, 1.055 * out ** (1 / 2.4) - .055)
    return Image.fromarray(np.clip(srgb * 255 + .5, 0, 255).astype(np.uint8), 'RGB')

def fit(im, res):
    px = 2048 if res == '2k' else 1024
    if im.size != (px, px) and max(im.size) > px:
        from PIL import Image
        r = px / max(im.size)
        im = im.resize((max(1, round(im.size[0] * r)), max(1, round(im.size[1] * r))), Image.LANCZOS)
    return im

def fetch_texture(t, cache, force, manifest):
    sid = t['set']; prov, src = t['src'].split(':', 1); res = t.get('res', '1k')
    out = ASSETS / 'textures' / sid
    names = {'diff': f'{sid}_diff.jpg', 'nor': f'{sid}_nor.jpg', 'arm': f'{sid}_arm.jpg'}
    if t.get('disp'): names['disp'] = f'{sid}_disp.jpg'
    if t.get('opacity'): names['opacity'] = f'{sid}_opacity.jpg'
    if not force and all((out / n).exists() for n in names.values()):
        print(f'[tex] {sid}: up to date')
    else:
        print(f'[tex] {sid} <- {t["src"]} ({res})')
        from PIL import Image
        if prov == 'ph':
            files = ph_files(cache, src)
            def get(key):
                f = files[key][res]['jpg']
                return img_open(cached(cache, f'ph/{src}/{os.path.basename(f["url"])}', f['url']))
            diff = get('Diffuse'); nor = get('nor_gl'); arm = get('arm')
            disp = get('Displacement') if t.get('disp') else None
            opac = None
        else:
            r = res.upper() + '-JPG'
            z = zipfile.ZipFile(io.BytesIO(cached(cache, f'acg/{src}_{r}.zip', f'https://ambientcg.com/get?file={src}_{r}.zip')))
            def member(suffix, required=True):
                for n in z.namelist():
                    if n.endswith('_' + suffix + '.jpg') or n.endswith('_' + suffix + '.png'):
                        return img_open(z.read(n))
                if required: raise RuntimeError(f'{src}: no {suffix} map in zip ({z.namelist()})')
                return None
            diff = member('Color'); nor = member('NormalGL'); rough = member('Roughness').convert('L')
            metal = member('Metalness', False); ao = member('AmbientOcclusion', False)
            size = rough.size
            ao = ao.convert('L').resize(size) if ao else Image.new('L', size, 255)
            metal = metal.convert('L').resize(size) if metal else Image.new('L', size, 0)
            arm = Image.merge('RGB', (ao, rough, metal))
            disp = member('Displacement', False) if t.get('disp') else None
            opac = member('Opacity') if t.get('opacity') else None
        # hero sets keep albedo + normal at 2K (what you see up close); data maps stay 1K everywhere.
        hero = res == '2k'
        fl = t.get('flat', .8)
        if fl > 0:
            diff = flatten(fit(diff, res), fl)
        save_jpg(fit(diff, res), out / names['diff'], 82 if hero else 86)
        save_jpg(fit(nor, res), out / names['nor'], 82 if hero else 88, sub444=True)
        save_jpg(fit(arm, '1k'), out / names['arm'], 85)
        if disp is not None: save_jpg(fit(disp, '1k'), out / names['disp'], 86, mode='L')
        if opac is not None: save_jpg(fit(opac, '1k'), out / names['opacity'], 92, mode='L')
    # manifest
    if prov == 'ph':
        info = ph_info(cache, src)
        author = ', '.join(info.get('authors', {}).keys()) or 'Poly Haven'
        source = f'https://polyhaven.com/a/{src}'
    else:
        author = 'Lennart Demes (ambientCG)'
        source = f'https://ambientcg.com/view?id={src}'
    for kind, n in names.items():
        rel = f'textures/{sid}/{n}'
        manifest[rel] = {'license': 'CC0 1.0', 'source': source, 'author': author,
                         'note': f'{kind} map, {(res if kind in ("diff", "nor") else "1k").upper()} JPG re-encoded by tools/fetch-assets.py'
                                 + (' (ARM packed: R AO, G roughness, B metalness)' if kind == 'arm' else '')
                                 + (' (OpenGL normal)' if kind == 'nor' else '')}

def fetch_hdris(sel, cache, force, manifest, bake=True):
    todo = []
    for h in sel:
        out = ASSETS / 'hdri' / f'{h["name"]}.env'
        files = ph_files(cache, h['src'])
        f = files['hdri']['2k']['hdr']
        local = cache / 'ph' / h['src'] / os.path.basename(f['url'])
        cached(cache, f'ph/{h["src"]}/{os.path.basename(f["url"])}', f['url'])
        info = ph_info(cache, h['src'])
        author = ', '.join(info.get('authors', {}).keys()) or 'Poly Haven'
        manifest[f'hdri/{h["name"]}.env'] = {'license': 'CC0 1.0', 'source': f'https://polyhaven.com/a/{h["src"]}', 'author': author,
                                            'note': f'{h["note"]}; 2K HDR, sun painted out, baked to a prefiltered 512 px RGBD .env (WebP) by tools/bake-env.mjs'}
        manifest[f'hdri/{h["name"]}_sky.jpg'] = {'license': 'CC0 1.0', 'source': f'https://polyhaven.com/a/{h["src"]}', 'author': author,
                                                'note': 'visible sky: 2K LDR equirect of the same HDR (scaled by skyScale in hdri.json), by tools/bake-env.mjs'}
        if force or not out.exists() or not (ASSETS / 'hdri' / f'{h["name"]}_sky.jpg').exists() or not (ASSETS / 'hdri' / 'hdri.json').exists():
            todo.append((h['name'], str(local)))
        else:
            print(f'[hdri] {h["name"]}: up to date')
    manifest['hdri/hdri.json'] = {'license': 'CC0 1.0', 'source': 'measured from the HDRIs above by tools/bake-env.mjs',
                                  'author': 'generated', 'note': 'sun direction / colour / strength and average sky colour per HDRI'}
    if todo and bake:
        (ASSETS / 'hdri').mkdir(parents=True, exist_ok=True)
        spec = cache / 'bake.json'
        spec.write_text(json.dumps({'out': str(ASSETS / 'hdri'), 'items': [{'name': n, 'file': f} for n, f in todo]}))
        print(f'[hdri] baking {len(todo)} HDRIs (headless Babylon, slow on SwiftShader)...')
        subprocess.check_call(['node', str(ROOT / 'tools' / 'bake-env.mjs'), str(spec)])

def write_sets_index(cache, manifest):
    """assets/textures/sets.json: per set the maps present, the resolution, the real-world tile size (m, from the source)
    and the mean linear albedo (materials.js uses it to turn an authored target colour into an exact tint)."""
    from PIL import Image
    idx = {}
    for t in TEXTURES:
        sid = t['set']; d = ASSETS / 'textures' / sid
        f = d / f'{sid}_diff.jpg'
        if not f.exists():
            continue
        im = Image.open(f).convert('RGB').resize((64, 64), Image.BILINEAR)
        px = list(im.getdata())
        lin = lambda c: (c / 255) / 12.92 if c <= 10 else (((c / 255) + .055) / 1.055) ** 2.4
        mean = [sum(lin(p[k]) for p in px) / len(px) for k in range(3)]
        prov, src = t['src'].split(':', 1); size = None
        if prov == 'ph':
            dims = ph_info(cache, src).get('dimensions')
            if dims: size = round(dims[0] / 1000, 3)
        maps = sorted(p.name[len(sid) + 1:-4] for p in d.glob(f'{sid}_*.jpg'))
        idx[sid] = {'src': t['src'], 'res': t.get('res', '1k'), 'maps': maps, 'size': size, 'mean': [round(v, 4) for v in mean]}
    (ASSETS / 'textures' / 'sets.json').write_text(json.dumps(idx, indent=1) + '\n')
    manifest['textures/sets.json'] = {'license': 'CC0 1.0', 'source': 'generated by tools/fetch-assets.py from the sets above', 'author': 'generated',
                                      'note': 'index of texture sets: maps, resolution, source tile size, mean albedo'}

def write_manifest(manifest):
    keys = ['_note'] + sorted(k for k in manifest if k != '_note')
    lines = ['{']
    for i, k in enumerate(keys):
        lines.append(f'  {json.dumps(k)}: {json.dumps(manifest[k], ensure_ascii=False)}' + (',' if i < len(keys) - 1 else ''))
    lines.append('}')
    (ASSETS / 'manifest.json').write_text('\n'.join(lines) + '\n')

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--only', default='', help='comma list of texture set / hdri names')
    ap.add_argument('--force', action='store_true')
    ap.add_argument('--textures', action='store_true')
    ap.add_argument('--hdris', action='store_true')
    ap.add_argument('--no-bake', action='store_true')
    ap.add_argument('--cache', default=os.path.expanduser('~/.cache/livefire-assets'))
    a = ap.parse_args()
    cache = Path(a.cache); cache.mkdir(parents=True, exist_ok=True)
    only = set(x for x in a.only.split(',') if x)
    both = not a.textures and not a.hdris
    manifest = json.loads((ASSETS / 'manifest.json').read_text()) if (ASSETS / 'manifest.json').exists() else {}
    manifest.setdefault('_note', 'Every asset file in this repo, with licence and source. Only CC0 or the owner\'s own work.')
    try:
        if a.textures or both:
            for t in TEXTURES:
                if not only or t['set'] in only:
                    fetch_texture(t, cache, a.force, manifest)
            write_sets_index(cache, manifest)
        if a.hdris or both:
            sel = [h for h in HDRIS if not only or h['name'] in only]
            fetch_hdris(sel, cache, a.force, manifest, bake=not a.no_bake)
    finally:
        write_manifest(manifest)
    tot = sum(p.stat().st_size for p in (ASSETS / 'textures').rglob('*') if p.is_file()) if (ASSETS / 'textures').exists() else 0
    toth = sum(p.stat().st_size for p in (ASSETS / 'hdri').rglob('*') if p.is_file()) if (ASSETS / 'hdri').exists() else 0
    print(f'textures {tot / 1e6:.1f} MB, hdri {toth / 1e6:.1f} MB')

if __name__ == '__main__':
    main()
