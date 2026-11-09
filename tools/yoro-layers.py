#!/usr/bin/env python3
"""Cut the Yoro reference picture into the layers mocks/yoro.html stacks.

    python3 -m venv .venv && .venv/bin/pip install pillow numpy opencv-python-headless
    .venv/bin/python tools/yoro-layers.py

The reference is one flat picture with the site's name painted into it. This
turns it into six PNGs, back to front:

    01-scene.png         the whole picture, lettering removed     (static)
    02-fall-paper.png    the bare paper behind the water          (static)
    03-fall-sheets.png   the broad blue sheets of water           (tiles down)
    04-fall-threads.png  thin fast threads over and between them  (tiles down)
    05-fall-mask.png     where 02-04 are allowed to show          (not drawn)
    06-spray.png         loose cream stipple                      (drifts)

The scene is complete on its own: it still has the print's still water in it.
The moving water is laid over that, through the mask, so if anything fails to
load the page falls back to the picture rather than to a hole.

Nothing here runs in the browser. It exists so the layers can be rebuilt, and
so the numbers the stylesheet relies on (where the window is) have one source.
"""
import os
import numpy as np
import cv2
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "assets", "img", "art", "yoro")
SRC = os.path.join(OUT, "source", "reference.webp")
DEBUG = os.environ.get("YORO_DEBUG")          # a directory for mask previews
rng = np.random.default_rng(1830)

ref = np.asarray(Image.open(SRC).convert("RGB")).astype(np.float32)
FH, FW = ref.shape[:2]                        # 941 x 1672: the frame
yy, xx = np.mgrid[0:FH, 0:FW].astype(np.float32)

# The box the water lives in, in frame pixels. The stylesheet repeats these.
X0, X1, Y0, Y1 = 356, 788, 140, 596


def ss(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def disc(r):
    return cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * r + 1, 2 * r + 1))


def lum(a):
    return a @ np.array([0.299, 0.587, 0.114], np.float32)


def grain_like(region, shape, sigma=3.0):
    """The tooth of the paper: a patch's fine detail, tiled out to `shape`."""
    hp = region - cv2.GaussianBlur(region, (0, 0), sigma)
    h, w = hp.shape[:2]
    reps = (shape[0] // h + 2, shape[1] // w + 2, 1)
    rows = [np.concatenate([hp[:, ::rng.choice([1, -1])] for _ in range(reps[1])], 1)
            for _ in range(reps[0])]
    return np.concatenate(rows, 0)[:shape[0], :shape[1]]


def save(name, arr, colours=None):
    """Write a PNG. `colours` dithers an opaque layer down to a palette: the
    print is four inks and a paper, so 256 colours loses nothing you can see
    and the grain stops costing three bytes a pixel."""
    path = os.path.join(OUT, name)
    im = Image.fromarray(np.clip(arr + 0.5, 0, 255).astype(np.uint8))
    if colours:
        pal = im.quantize(colours, method=Image.Quantize.MEDIANCUT, kmeans=2)
        im = im.quantize(palette=pal, dither=Image.Dither.FLOYDSTEINBERG)
    im.save(path, optimize=True)
    print("%-22s %5dx%-5d %7.0f KB" % (name, arr.shape[1], arr.shape[0],
                                       os.path.getsize(path) / 1024))


# ---------------------------------------------------------------- lettering
# The name, the kicker and the nav are painted into the reference. They come
# out, because the page sets them as real text. All four sit on open sky, so
# the fill is a plain inpaint with the sky's own grain laid back over it.
TEXT = [(18, 8, 112, 58), (1350, 8, 1662, 58), (940, 140, 1382, 466), (893, 470, 1427, 520)]
tmask = np.zeros((FH, FW), np.uint8)
L = lum(ref)
for x0, y0, x1, y1 in TEXT:
    tmask[y0:y1, x0:x1] = (L[y0:y1, x0:x1] > 112) * 255
tmask = cv2.dilate(tmask, disc(6))
bgr = cv2.inpaint(ref[:, :, ::-1].astype(np.uint8), tmask, 7, cv2.INPAINT_TELEA)
clean = bgr[:, :, ::-1].astype(np.float32)
sky_grain = grain_like(ref[70:270, 1385:1660], (FH, FW))
soft = cv2.GaussianBlur(tmask.astype(np.float32) / 255, (0, 0), 1.5)[..., None]
clean = clean + sky_grain * soft

# ------------------------------------------------------------- what is water
# Inside the box, anything green or yellow is cliff or tree and stays in front
# of the water. Cream and blue are the water itself.
hsv = cv2.cvtColor(ref[:, :, ::-1].astype(np.uint8), cv2.COLOR_BGR2HSV)
Hh, Ss, Vv = hsv[..., 0], hsv[..., 1], hsv[..., 2]
land = (((Hh >= 20) & (Hh <= 88) & (Ss >= 132) & (Vv < 232)) |
        ((Hh >= 28) & (Hh <= 88) & (Ss >= 85))).astype(np.uint8) * 255
land = cv2.morphologyEx(land, cv2.MORPH_OPEN, disc(1))
land = cv2.morphologyEx(land, cv2.MORPH_CLOSE, disc(4))
land_wide = cv2.dilate(land, disc(4))
land_soft = cv2.GaussianBlur(land_wide.astype(np.float32) / 255, (0, 0), 1.6)

# The window: open through the body of the fall, feathered out at the top so
# the print's own needle-tipped starts stay put, and at the foot so the water
# dissolves into the stipple that is already there.
window = (ss(150, 240, yy) * (1 - ss(512, 588, yy)) *
          ss(358, 367, xx) * (1 - ss(773, 783, xx)) * (1 - land_soft))

# ------------------------------------------------------------------- paper
inked = (Hh > 88) & (Hh < 125) & (Ss > 55)
bare = (~inked & (land_wide == 0) & (Vv > 205)).astype(np.float32)
bare = cv2.erode(bare, disc(1))
# Bare paper only shows between the stripes, so the sheet behind the water is
# rebuilt from those slivers: an average of the nearest bare paper, falling
# back to a wider average where a cliff leaves none nearby.
paper = np.zeros_like(ref)
todo = np.ones((FH, FW), bool)
for sigma in (14, 45, 140):
    num = cv2.GaussianBlur(ref * bare[..., None], (0, 0), sigma)
    den = cv2.GaussianBlur(bare, (0, 0), sigma)
    use = todo & (den > 0.08)
    paper[use] = num[use] / den[use][:, None]
    todo &= ~use
paper[todo] = np.median(ref[bare > 0], 0)
paper = cv2.GaussianBlur(paper, (0, 0), 6)
# and its tooth, matched in strength to a clean patch of the lip of the fall
lip = ref[6:62, 602:668]
tooth = float((lip - cv2.GaussianBlur(lip, (0, 0), 3)).std())
fibre = cv2.GaussianBlur(rng.normal(0, 1, (FH, FW)).astype(np.float32), (0, 0), 0.8)
paper += (fibre / fibre.std() * tooth * 0.6)[..., None]
save("02-fall-paper.png", paper[Y0:Y1, X0:X1], colours=96)

# ------------------------------------------------- the stripes, read off it
# One colour per column, taken from the body of the fall. The print's stripes
# run dead vertical, so a column median is the stripe.
band = ref[300:512, X0:X1]
ok = land_wide[300:512, X0:X1] == 0
BW = X1 - X0
col = np.zeros((BW, 3), np.float32)
amt = np.zeros(BW, np.float32)
pap = np.median(paper[300:512, X0:X1], 0)
for i in range(BW):
    rows = band[ok[:, i], i]
    if len(rows) < 30:
        col[i] = pap[i]
        continue
    col[i] = np.median(rows, 0)
    amt[i] = np.clip((lum(pap[i]) - lum(col[i])) / (lum(pap[i]) - 62.0), 0, 1)
amt[:10] *= np.linspace(0, 1, 10)
amt[-12:] *= np.linspace(1, 0, 12)
col_a = ss(0.05, 0.30, amt)

runs, i = [], 0
while i < BW:
    if col_a[i] > 0.5:
        j = i
        while j < BW and col_a[j] > 0.5:
            j += 1
        runs.append((i, j))
        i = j
    else:
        i += 1

# Each run of ink is split into strands, and each strand breaks at its own
# height: a needle where it starts, a string of dots where it gives out. That
# is the only thing in the tile that changes down its length, so it is the
# only thing the eye can follow when the tile moves.
SCALE, SS = 2, 2                    # tiles are 2x the frame; drawn 2x that again
K = SCALE * SS
TH = 1200                           # tile height, in frame pixels
cov = np.zeros((TH * K, BW * K), np.uint8)


def needle(img, xa, xb, xt, y_top, y_bot, y_end, dots, end_at, end_len):
    """One strand segment, all in frame pixels, drawn at every wrap."""
    for wrap in (-TH, 0, TH):
        a, b, e = y_top + wrap, y_bot + wrap, y_end + wrap
        left, right = [], []
        for p in np.linspace(0, 1, 14):
            f = p ** 1.35
            y = a + (b - a) * p
            left.append((xt - (xt - xa) * f, y))
            right.append((xt + (xb - xt) * f, y))
        w = xb - xa
        xe, fall = xa + w * end_at, w * end_len
        poly = left + [(xa, e), (xe, e + fall), (xb, e)] + right[::-1]
        cv2.fillPoly(img, [np.round(np.array(poly) * K).astype(np.int32)], 255, cv2.LINE_AA)
        for dx, dy, r in dots:
            cv2.circle(img, (int(round(((xa + xb) / 2 + dx) * K)), int(round((e + dy) * K))),
                       max(1, int(round(r * K))), 255, -1, cv2.LINE_AA)


strands = []
for a, b in runs:
    x = a
    while x < b:
        w = int(rng.integers(4, 10))
        if b - (x + w) < 4:
            w = b - x
        strands.append((x, x + w))
        x += w

for xa, xb in strands:
    w = xb - xa
    n = int(rng.choice([1, 2], p=[0.4, 0.6]))
    gaps = sorted(((k + rng.uniform(0.05, 0.95)) / n * TH) for k in range(n))
    glen = [rng.uniform(46, 150) for _ in range(n)]
    for k in range(n):
        g0, g1 = gaps[k], gaps[(k + 1) % n] + (TH if k == n - 1 else 0)
        y_top = g0 + glen[k] / 2
        y_fin = g1 - glen[(k + 1) % n] / 2
        end_len = rng.uniform(2.0, 5.5)
        dots, dy, r = [], w * end_len, w * rng.uniform(0.2, 0.32)
        for _ in range(int(rng.integers(0, 4))):
            dy += r * 2.2 + rng.uniform(2, 9)
            dots.append((rng.uniform(-0.4, 0.4) * w, dy, max(0.7, r)))
            r *= rng.uniform(0.6, 0.85)
        y_end = y_fin - dy
        tip = rng.uniform(60, 150)
        if y_end - y_top < tip + 20:
            continue
        needle(cov, xa, xb, rng.uniform(xa + 0.2 * w, xb - 0.2 * w),
               y_top, y_top + tip, y_end, dots, rng.uniform(0.25, 0.75), end_len)

cov = cv2.resize(cov, (BW * SCALE, TH * SCALE), interpolation=cv2.INTER_AREA).astype(np.float32) / 255


TWp, THp = BW * SCALE, TH * SCALE
xs = (np.arange(TWp) + 0.5) / SCALE - 0.5
col_up = np.stack([np.interp(xs, np.arange(BW), col[:, c]) for c in range(3)], 1)
a_up = np.interp(xs, np.arange(BW), col_a)
sheets = np.zeros((THp, TWp, 4), np.float32)
# The page prints this layer over the paper with multiply, the way the block
# was printed over the sheet, so the paper's grain comes up through the ink.
# The colour stored here is therefore ink divided by paper.
pap_up = np.stack([np.interp(xs, np.arange(BW), pap[:, c]) for c in range(3)], 1)
sheets[..., :3] = np.clip(col_up / pap_up, 0, 1)[None] * 255
sheets[..., 3] = cov * a_up[None] * 255
save("03-fall-sheets.png", sheets)

# ----------------------------------------------------------------- threads
# Thin lines that run faster than the sheets: blue ones down the bare paper,
# cream ones scratched through the ink. Every thread repeats a whole number of
# times down the tile, so the tile closes on itself.
thr = np.zeros((TH * K, BW * K, 4), np.float32)
INK, CREAM = (22, 84, 120), (250, 219, 166)
bare_cols = np.where(col_a[14:-14] < 0.2)[0] + 14
ink_cols = np.where(col_a[14:-14] > 0.8)[0] + 14


def thread(x, w, colour, alpha):
    layer = np.zeros(thr.shape[:2], np.uint8)
    cycles = int(rng.choice([2, 3, 4]))
    period = TH / cycles
    frac = rng.uniform(0.28, 0.52)
    phase = rng.uniform(0, period)
    for c in range(-1, cycles + 1):
        a = phase + c * period
        b = a + period * frac
        tip = (b - a) * 0.45
        poly = [(x, a), (x + w / 2, a + tip), (x + w / 2, b), (x, b + w), (x - w / 2, b), (x - w / 2, a + tip)]
        cv2.fillPoly(layer, [np.round(np.array(poly) * K).astype(np.int32)], 255, cv2.LINE_AA)
    m = layer.astype(np.float32) / 255 * alpha
    for c in range(3):
        thr[..., c] = thr[..., c] * (1 - m) + colour[c] * m
    thr[..., 3] = np.maximum(thr[..., 3], m)


for _ in range(14):
    thread(float(rng.choice(bare_cols)) + rng.uniform(-.5, .5), rng.uniform(1.1, 2.0), INK, 0.7)
for _ in range(24):
    thread(float(rng.choice(ink_cols)) + rng.uniform(-.5, .5), rng.uniform(1.2, 2.2), CREAM, 0.85)
thr = cv2.resize(thr, (TWp, THp), interpolation=cv2.INTER_AREA)
thr[..., 3] *= 255
save("04-fall-threads.png", thr)

# ------------------------------------------------------------------- scene
save("01-scene.png", clean, colours=256)
box = window[Y0:Y1, X0:X1]
save("05-fall-mask.png", np.dstack([np.full_like(box, 255), box * 255]))

# ------------------------------------------------------------------- spray
# Loose stipple, thickest at one edge and thinning away from it. The page
# places it either side of the foot of the fall and lets it drift.
SW, SH = 300, 460
spray = np.zeros((SH * K, SW * K, 4), np.float32)
spray[..., :3] = (247, 226, 184)
dots = np.zeros((SH * K, SW * K), np.uint8)
for _ in range(330):
    x = abs(rng.normal(0, 0.33)) * SW
    y = SH * (0.06 + 0.88 * rng.beta(2.2, 1.6))
    if x > SW - 6:
        continue
    r = rng.uniform(1.0, 3.6) * (1 - 0.45 * x / SW)
    cv2.ellipse(dots, (int(x * K), int(y * K)),
                (max(1, int(r * K)), max(1, int(r * K * rng.uniform(0.7, 1.0)))),
                rng.uniform(0, 180), 0, 360, 255, -1, cv2.LINE_AA)
spray[..., 3] = dots
spray = cv2.resize(spray, (SW * SCALE, SH * SCALE), interpolation=cv2.INTER_AREA)
spray[..., 3] *= 0.94
save("06-spray.png", spray)

print("\nframe %dx%d   water box  left %.3f%%  top %.3f%%  width %.3f%%  height %.3f%%"
      % (FW, FH, X0 / FW * 100, Y0 / FH * 100, (X1 - X0) / FW * 100, (Y1 - Y0) / FH * 100))
print("tile aspect (w/h) %.4f   strands %d" % (BW / TH, len(strands)))

if DEBUG:
    os.makedirs(DEBUG, exist_ok=True)
    dbg = clean.copy()
    dbg[..., 0] = dbg[..., 0] * (1 - window) + 255 * window
    Image.fromarray(dbg.astype(np.uint8)).save(os.path.join(DEBUG, "window.png"))
    Image.fromarray(np.clip(clean, 0, 255).astype(np.uint8)).save(os.path.join(DEBUG, "clean.png"))
