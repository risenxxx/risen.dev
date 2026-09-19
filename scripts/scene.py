"""
Draws the night landscape used inside the Frame Player and DeskVolt previews
and writes it into src/components/mocks/Scene.astro.

    node -v   # not needed
    python3 scripts/scene.py

Every number below is a seed or a proportion, so the terrain is reproducible:
the same run gives the same mountains. Change a seed to reroll one layer.
"""
import random

W, H = 1600, 760
f = lambda v: round(v, 1)

def ridge(seed, base, amp, peaks):
    """Angular silhouette: peaks joined by straight slopes through valleys."""
    r = random.Random(seed)
    pts, x = [], -120.0
    step = (W + 240) / peaks
    while x < W + 120:
        # a peak, then the valley after it
        ph = amp * r.uniform(0.34, 1.0)
        pts.append((f(x), f(base - ph)))
        vx = x + step * r.uniform(0.34, 0.66)
        pts.append((f(vx), f(base - ph * r.uniform(0.05, 0.42))))
        x = vx + step * r.uniform(0.34, 0.66)
    d = f'M{pts[0][0]} {pts[0][1]}' + ''.join(f'L{px} {py}' for px, py in pts[1:])
    return d + f'L{W+120} {H+40}L-120 {H+40}Z'

def pines(seed, count, baseline, hlo, hhi, jitter=14):
    r = random.Random(seed)
    out = []
    for _ in range(count):
        x = f(r.uniform(-20, W + 20))
        h = r.uniform(hlo, hhi)
        w = h * r.uniform(0.26, 0.38)
        y = f(baseline + r.uniform(-jitter, jitter * 0.6))
        p = [f'M{x} {f(y - h)}']
        for t in (1, 2, 3):
            ty = f(y - h * (1 - t / 3) - h * 0.05)
            tw = f(w * (t / 3))
            p.append(f'L{f(x + tw)} {ty}L{f(x + tw * 0.45)} {ty}')
        p.append(f'L{f(x + w * 0.1)} {y}L{f(x - w * 0.1)} {y}')
        for t in (3, 2, 1):
            ty = f(y - h * (1 - t / 3) - h * 0.05)
            tw = f(w * (t / 3))
            p.append(f'L{f(x - tw * 0.45)} {ty}L{f(x - tw)} {ty}')
        out.append(' '.join(p) + 'Z')
    return ''.join(out)

def stars(seed, n):
    r = random.Random(seed)
    out = []
    for _ in range(n):
        x, y = f(r.uniform(6, W - 6)), f(r.uniform(6, 340))
        op = round(r.uniform(0.3, 1.0) * (1 - y / 470), 2)
        if op > 0.07:
            out.append(f'<circle cx="{x}" cy="{y}" r="{r.choice([0.9,1.1,1.4,1.7])}" opacity="{op}"/>')
    return ''.join(out)

#      seed base amp  peaks fill        pines(seed,count,base,hlo,hhi)
LAYERS = [
    (11, 470, 150, 7,  '#9c9ea4', None),
    (23, 508, 128, 8,  '#82848c', None),
    (37, 548, 112, 9,  '#696b74', (7,  46, 548, 12, 22)),
    (51, 592,  96, 10, '#515259', (13, 54, 592, 18, 32)),
    (67, 640,  86, 11, '#3a3c42', (29, 60, 640, 26, 46)),
    (83, 694,  74, 12, '#25272c', (41, 58, 694, 36, 66)),
    (97, 756,  62, 11, '#15161a', (59, 52, 756, 50, 92)),
]

body = [f'<rect width="{W}" height="{H}" fill="url(#sky)"/>',
        f'<g fill="#fff">{stars(5, 150)}</g>',
        f'<rect y="330" width="{W}" height="190" fill="url(#glow)"/>']

r = random.Random(3)
body.append('<g fill="#e9eaec">' + ''.join(
    f'<ellipse cx="{f(r.uniform(100, W-100))}" cy="{f(r.uniform(386, 448))}" '
    f'rx="{f(r.uniform(60, 175))}" ry="{f(r.uniform(3, 6.5))}" opacity="{round(r.uniform(.16,.4),2)}"/>'
    for _ in range(8)) + '</g>')

for i, (seed, base, amp, n, fill, ps) in enumerate(LAYERS):
    g = f'<path d="{ridge(seed, base, amp, n)}"/>'
    if ps:
        g += f'<path d="{pines(*ps)}"/>'
    body.append(f'<g fill="{fill}">{g}</g>')
    if i >= 1:
        body.append(f'<rect y="{f(base - amp * 0.55)}" width="{W}" height="170" '
                    f'fill="url(#fog)" opacity="{round(0.46 - i * 0.05, 2)}"/>')

defs = ('<defs>'
 '<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">'
 '<stop offset="0" stop-color="#232429"/><stop offset=".32" stop-color="#3a3c42"/>'
 '<stop offset=".54" stop-color="#6d6f77"/><stop offset=".7" stop-color="#bdbfc4"/></linearGradient>'
 '<linearGradient id="glow" x1="0" y1="0" x2="0" y2="1">'
 '<stop offset="0" stop-color="#dcdde0" stop-opacity="0"/>'
 '<stop offset=".5" stop-color="#e6e7ea" stop-opacity=".5"/>'
 '<stop offset="1" stop-color="#e6e7ea" stop-opacity="0"/></linearGradient>'
 '<linearGradient id="fog" x1="0" y1="0" x2="0" y2="1">'
 '<stop offset="0" stop-color="#ccced3" stop-opacity="0"/>'
 '<stop offset=".3" stop-color="#ccced3" stop-opacity=".9"/>'
 '<stop offset="1" stop-color="#ccced3" stop-opacity="0"/></linearGradient>'
 '</defs>')

svg = defs + ''.join(body)

# Write straight into the component: the scene is markup, not an asset, and a
# file on disk beside it would only be a copy that could drift.
import pathlib, re
target = pathlib.Path(__file__).resolve().parent.parent / 'src/components/mocks/Scene.astro'
src = target.read_text()
new, n = re.subn(r'(<g id="scene-night">).*?(</g>\s*</svg>)', lambda m: m.group(1) + svg + m.group(2),
                 src, count=1, flags=re.S)
assert n == 1, 'could not find the scene in Scene.astro'
target.write_text(new)
print(f'{target}: {len(svg)} bytes of scene')
