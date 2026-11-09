#!/usr/bin/env python3
"""Build the layers mocks/yoro.html stacks, from Hokusai's Yoro waterfall print.

    python3 -m venv .venv && .venv/bin/pip install pillow numpy opencv-python-headless
    .venv/bin/python tools/yoro-layers.py

Reads   assets/img/art/yoro/source/hokusai-yoro.webp   (the print, 758 x 1108)
Writes  assets/img/art/yoro/                            (the layers)
        and the list of foliage pieces into mocks/yoro.html

The print is upright and a web page is wide, so the first job is to make the
picture wider without inventing anything: the sheet is continued to the left
and right out of its own pieces (see `quilt_right`), with cloud and mist drawn
the way the print draws them. Then the wide picture is cut up:

    01-scene.png            the whole wide picture
    foliage/NN.png          the trees and bushes again, piece by piece (sway)
    02-fall-paper.png       bare paper behind the moving water
    03-fall-sheets-a/b/c    the blue streams, in three sets            (run down)
    04-fall-threads-a/b     thin fast threads over and between them    (run down)
    05-fall-mask.png        where 02-04 may show                       (not drawn)
    06-mist.png             a soft bank of mist                        (drifts)
    07-spray.png            loose stipple                              (flies out)

Everything is measured in pixels of the FRAME, the 1924 x 1082 wide picture.
"""
import json, os, re
import numpy as np, cv2
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "assets/img/art/yoro")
SRC = os.path.join(OUT, "source/hokusai-yoro.webp")
PAGE = os.path.join(ROOT, "mocks/yoro.html")
DEBUG = os.environ.get("YORO_DEBUG")
rng = np.random.default_rng(1832)

FW, FH = 1924, 1082          # the frame
PX = 304                     # where the print's left edge sits in it


# ------------------------------------------------------------------ helpers
def ss(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)

def disc(r):
    return cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * r + 1, 2 * r + 1))

def lum(a):
    return a[..., 0] * 0.299 + a[..., 1] * 0.587 + a[..., 2] * 0.114

def HSV(a):
    return cv2.cvtColor(np.clip(a, 0, 255).astype(np.uint8), cv2.COLOR_RGB2HSV).astype(int)

def med(a):
    return np.median(a.reshape(-1, a.shape[-1]), axis=0)

def frac(mask, P):
    """for every PxP patch (by its top-left corner), the share of it inside mask"""
    return cv2.boxFilter(mask.astype(np.float32), -1, (P, P), anchor=(0, 0),
                         normalize=True, borderType=cv2.BORDER_CONSTANT)

def grain(shape, amp):
    """paper tooth: fine noise plus a slow mottle"""
    n = cv2.GaussianBlur(rng.normal(size=shape).astype(np.float32), (0, 0), 0.7); n /= n.std()
    lo = cv2.GaussianBlur(rng.normal(size=shape).astype(np.float32), (0, 0), 9); lo /= lo.std()
    return (n * amp + lo * amp * 0.45)[..., None] * np.array([1, 1, 0.9], np.float32)

def grain_like(patch, shape, sigma=2.0):
    """the texture of a real patch of the print, tiled with random flips"""
    hp = patch - cv2.GaussianBlur(patch, (0, 0), sigma)
    ph, pw = hp.shape[:2]
    out = np.zeros((shape[0] + 2 * ph, shape[1] + 2 * pw, 3), np.float32)
    for y in range(0, out.shape[0], ph):
        for x in range(0, out.shape[1], pw):
            t = hp[::rng.choice([-1, 1]), ::rng.choice([-1, 1])]
            out[y:y + ph, x:x + pw] = t[:out.shape[0] - y, :out.shape[1] - x]
    oy, ox = rng.integers(ph), rng.integers(pw)
    return out[oy:oy + shape[0], ox:ox + shape[1]]

def save(name, arr, colours=None):
    path = os.path.join(OUT, name)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    im = Image.fromarray(np.clip(arr + 0.5, 0, 255).astype(np.uint8))
    if colours and im.mode == "RGB":
        pal = im.quantize(colours, method=Image.Quantize.MEDIANCUT, kmeans=2)
        im = im.quantize(palette=pal, dither=Image.Dither.FLOYDSTEINBERG)
    elif colours:
        im = im.quantize(colours, method=Image.Quantize.FASTOCTREE)
    im.save(path, optimize=True)
    if not name.startswith("foliage/"):
        print(f"{name:26s} {im.size[0]:>5}x{im.size[1]:<5} {os.path.getsize(path) / 1024:7.0f} KB")
    return os.path.getsize(path)


# ----------------------------------------------------------------- quilting
# Image quilting (Efros & Freeman, 2001). To continue the print past its edge,
# square patches are copied out of the print itself, each chosen because it
# agrees with what is already there along the overlap, and stitched to its
# neighbours along the path through the overlap where they differ least. The
# result is made of nothing but the print, so it has the print's line, its
# colours and its paper.
def _cut(e):
    h, w = e.shape
    c = e.copy()
    for y in range(1, h):
        l = np.roll(c[y - 1], 1); l[0] = np.inf
        r = np.roll(c[y - 1], -1); r[-1] = np.inf
        c[y] += np.minimum(c[y - 1], np.minimum(l, r))
    p = np.zeros(h, int); p[-1] = int(np.argmin(c[-1]))
    for y in range(h - 2, -1, -1):
        x = p[y + 1]; lo, hi = max(0, x - 1), min(w, x + 2)
        p[y] = lo + int(np.argmin(c[y, lo:hi]))
    return p

def quilt_right(known, src, ok, out_w, P, ov, tol, seed):
    """Grow `out_w` columns to the right of `known` (h, >=ov, 3) out of `src`.
    `ok` says which patches may be used: a bool map of top-left corners, or a
    function of the column's x returning that map, or (map, penalty)."""
    r = np.random.default_rng(seed)
    h = known.shape[0]
    step = P - ov
    ny, nx = int(np.ceil((h - ov) / step)), int(np.ceil(out_w / step))
    Hc, Wc = ny * step + ov, nx * step + ov
    can = np.zeros((Hc, Wc, 3), np.float32); fil = np.zeros((Hc, Wc), bool)
    can[:h, :ov] = known[:, -ov:]; fil[:h, :ov] = True
    if Hc > h:
        can[h:, :ov] = can[h - 1:2 * h - Hc - 1:-1, :ov]; fil[h:, :ov] = True
    sh, sw = src.shape[0] - P + 1, src.shape[1] - P + 1
    for ix in range(nx):
        o = ok(ix * step) if callable(ok) else ok
        pen = 0.0
        if isinstance(o, tuple):
            o, pen = o; pen = pen[:sh, :sw]
        o = o[:sh, :sw]
        for iy in range(ny):
            x, y = ix * step, iy * step
            t = can[y:y + P, x:x + P]; m = fil[y:y + P, x:x + P]
            res = cv2.matchTemplate(src, t, cv2.TM_SQDIFF, mask=np.repeat(m[..., None], 3, 2).astype(np.float32))
            res = np.where(o & np.isfinite(res), np.maximum(res, 0) + pen, np.inf)
            lo = res.min()
            ys, xs = np.nonzero(o) if not np.isfinite(lo) else np.nonzero(res <= lo * (1 + tol) + 1.0)
            k = r.integers(len(ys))
            p = src[ys[k]:ys[k] + P, xs[k]:xs[k] + P]
            e = ((p - t) ** 2).sum(2)
            take = np.ones((P, P), bool)
            if m[:, :ov].all():
                c = _cut(e[:, :ov]); take[:, :ov] &= np.arange(ov)[None, :] >= c[:, None]
            if iy > 0 and m[:ov, :].all():
                c = _cut(e[:ov, :].T); take[:ov, :] &= np.arange(ov)[:, None] >= c[None, :]
            take |= ~m
            can[y:y + P, x:x + P] = np.where(take[..., None], p, t)
            fil[y:y + P, x:x + P] = True
    return can[:h, ov:ov + out_w]


# ---------------------------------------------------------------- the print
src = np.asarray(Image.open(SRC).convert("RGB")).astype(np.float32)
pr = src[12:1094, 0:752].copy()                 # the printed image, margins off
PH, PW = pr.shape[:2]
assert PH == FH
LW, RW = PX, FW - PX - PW

# The sheet has darkened along its right edge. Measured on the bare cloud,
# where the paper should be one colour, and taken out, so the join is not a
# stripe.
rows = np.r_[232:330, 440:505]
colc = cv2.GaussianBlur(np.median(pr[rows], axis=0)[None], (0, 0), sigmaX=4, sigmaY=0.1)[0]
gain = np.ones((PW, 3), np.float32)
gain[672:] = np.median(colc[648:672], axis=0) / colc[672:]
pr = np.clip(pr * np.clip(gain, 1.0, 1.25)[None], 0, 255)
hsv = HSV(pr)

yy = np.arange(FH, dtype=np.float32)[:, None]
SSA = 3                                           # supersampling for drawn shapes
MARK = np.array([226, 206, 128], np.float32)      # the little yellow curls in the cloud

def cloud(shape, xs, ys, big=0, r=(6.5, 10.5)):
    """A bank of cloud the way the print cuts one: solid below a line, the line
    itself a row of scallops, and a few curls scattered just inside it."""
    h, w = shape
    X = np.arange(-20, w + 20); Y = np.interp(X, xs, ys)
    if big:
        lam = rng.uniform(70, 120); ph0 = rng.uniform(0, 3)
        Y = Y - big * np.abs(np.sin(np.pi * X / lam + ph0)) ** 0.7 \
              - big * 0.5 * np.abs(np.sin(np.pi * X / (lam * 0.43) + 1.7)) ** 0.8
        xs, ys = X, Y
    m = np.zeros((h * SSA, w * SSA), np.uint8)
    poly = np.array([[x * SSA, y * SSA] for x, y in zip(X, Y)]
                    + [[(w + 20) * SSA, h * SSA], [-20 * SSA, h * SSA]], np.int32)
    cv2.fillPoly(m, [poly], 255)
    marks = np.zeros_like(m)
    x = -20.0
    while x < w + 20:
        rr = rng.uniform(*r); y = np.interp(x, xs, ys)
        cv2.circle(m, (int(x * SSA), int((y + rr * 0.25) * SSA)), int(rr * SSA), 255, -1)
        for k, d in enumerate((rr * 1.5, rr * 2.9, rr * 4.2)):
            if rng.random() < (0.62, 0.42, 0.2)[k]:
                cx = x + (rr * 0.9 if k % 2 == 0 else 0) + rng.normal(0, 1.2)
                cy = np.interp(cx, xs, ys) + d + rng.normal(0, 1.5)
                cv2.ellipse(marks, (int(cx * SSA), int(cy * SSA)),
                            (int(rr * 0.95 * SSA), int(rr * 0.62 * SSA)), 0, 195, 345, 255, SSA + 1)
        x += rr * rng.uniform(1.25, 1.6)
    dn = lambda a: cv2.resize(a, (w, h), interpolation=cv2.INTER_AREA).astype(np.float32)[..., None] / 255
    return dn(m), dn(marks)

def lay_cloud(under, colour, xs, ys, big=0):
    ca, cm = cloud(under.shape[:2], xs, ys, big)
    return under * (1 - ca) + (colour * (1 - 0.7 * cm) + MARK * 0.7 * cm) * ca


# ------------------------------------------------------- the scene: leftwards
# Below the cliff the print's left edge is cloud, then mist, then the river.
# Cloud and mist are flat colour, so they are simply carried out sideways; the
# cliff above and the waves below are quilted.
prof = cv2.GaussianBlur(np.median(pr[:, 2:14], axis=1)[:, None, :], (0, 0), sigmaX=0.1, sigmaY=9)[:, 0]
gl = ss(540, 640, yy)[..., None]
L = np.repeat(prof[:, None, :], LW, 1) + grain((FH, LW), 1.2) * (1 - gl) \
    + grain_like(pr[648:808, 4:120], (FH, LW)) * gl
CREAM_L = med(pr[490:530, 4:60])

P, ov = 46, 16
usrc = pr[0:520, 0:292]
bad = np.zeros(usrc.shape[:2], bool); bad[14:196, 40:98] = True        # not the title cartouche
up = quilt_right(pr[0:520, 0:ov][:, ::-1], usrc[:, ::-1].copy(),
                 frac(~bad[:, ::-1], P) > 0.999, LW, P, ov, 0.07, int(os.environ.get("SEED_L", 7)))[:, ::-1]
kq = (1 - ss(478, 516, yy[:520]))[..., None]
L[0:520] = up * kq + L[0:520] * (1 - kq)

P, ov = 44, 16
WY = 818
wsrc = pr[WY:PH, 0:210]; h2 = hsv[WY:PH, 0:210]
notwater = ((h2[..., 0] >= 14) & (h2[..., 0] <= 34) & (h2[..., 1] > 90)) | \
           ((h2[..., 0] >= 36) & (h2[..., 0] <= 85) & (h2[..., 1] > 70) & (h2[..., 2] < 205))
notwater = cv2.dilate(cv2.morphologyEx(notwater.astype(np.uint8), cv2.MORPH_OPEN, disc(2)), np.ones((3, 3), np.uint8))
L[WY:PH] = quilt_right(pr[WY:PH, 0:ov][:, ::-1], wsrc[:, ::-1].copy(),
                       frac((notwater == 0)[:, ::-1], P) > 0.99, LW, P, ov, 0.10, int(os.environ.get("SEED_W", 5)))[:, ::-1]

# a bank of cloud climbing over the cliff as it runs off the left side
cl = lay_cloud(L, CREAM_L + grain((FH, LW), 1.2),
               np.array([-20, 40, 110, 180, 250, LW + 20]), np.array([318, 330, 372, 425, 458, 474]), big=9)
k = (1 - ss(505, 545, yy))[..., None]
L = L * (1 - k) + cl * k


# ------------------------------------------------------ the scene: rightwards
# Most of the new width is here, and it is what the name sits on: open cloud,
# with the band of grey mist carried on out through it.
xx = np.arange(RW, dtype=np.float32)[None, :]
CREAM_R, CREAM_FAR = med(pr[260:330, 715:745]), np.array([253, 232, 196], np.float32)
GREY_R, GREY_FAR = med(pr[745:810, 692:745]), np.array([221, 198, 164], np.float32)
BLUE = med(pr[10:90, 4:40])
tx = ss(0, 380, xx)[..., None]
cream = CREAM_R * (1 - tx) + CREAM_FAR * tx
grey = GREY_R * (1 - tx) + GREY_FAR * tx
wob = 14 * np.sin(xx / 150 + 0.6) + 8 * np.sin(xx / 61 + 2.0)
gband = (ss(512 + wob, 610 + wob, yy) * (1 - ss(985, 1040, yy)) * (1 - 0.42 * ss(250, 868, xx)))[..., None]
R = cream * (1 - gband) + grey * gband + grain((FH, RW), 1.2) * (1 - gband) + grain((FH, RW), 3.4) * gband

# The right-hand cliff runs off the top right corner. The left-hand cliff in
# the print does end, against the sky; so the right one is finished with
# pieces of the left, steered from all cliff to all sky across 200 pixels.
P, ov = 44, 20
QW, QH = 300, 236
asrc = pr[0:QH, 0:300].copy()
bad = np.zeros(asrc.shape[:2], bool); bad[10:200, 38:100] = True
ah = hsv[0:QH, 0:300]
okb = frac(~bad, P) > 0.999
bf = frac((ah[..., 0] > 92) & (ah[..., 0] < 112) & (ah[..., 2] < 170), P)
gf = frac((ah[..., 0] >= 36) & (ah[..., 0] <= 88) & (ah[..., 1] > 45), P)
def ok_a(x):
    want = float(ss(30, 215, x))
    pen = (bf - want) ** 2 * P * P * 9000
    if x < 20:
        pen = pen + gf ** 2 * P * P * 9000        # no tree sliced in half at the join
    return okb, pen.astype(np.float32)
aq = quilt_right(pr[0:QH, PW - ov:PW], asrc, ok_a, QW, P, ov, 0.05, int(os.environ.get("SEED_A", 1)))
sky = BLUE + grain_like(pr[4:112, 2:46], (FH, RW))
skyfull = sky.copy(); skyfull[:QH, :QW] = aq
e = ss(QW - 40, QW, xx)[..., None] * np.ones((QH, 1, 1), np.float32)
skyfull[:QH] = skyfull[:QH] * (1 - e) + sky[:QH] * e
ca, cm = cloud((FH, RW), np.array([-20, 0, 90, 220, 380, 560, 720, RW + 20]),
               np.array([207, 207, 210, 190, 172, 186, 166, 176]), big=12)
R = skyfull * (1 - ca) + (R * (1 - 0.7 * cm) + MARK * 0.7 * cm) * ca
# and a bank of cloud along the foot
R = lay_cloud(R, cream + grain((FH, RW), 1.2), np.array([-20, 60, 200, 380, 560, 700, RW + 20]),
              np.array([1010, 1000, 962, 988, 950, 975, 965]), big=11)

# The tree and the hut are cut off by the print's right edge. The tree is
# grown on out of its own foliage until it gives out; the hut's cut edge is
# covered by more of the same. Only the leaves are kept from the quilt, so
# they sit on the new mist and cloud, not on a slab of the old.
P, ov = 40, 14
BW_, BY, HY = 220, 512, 790
bsrc = pr[BY:800, 548:752].copy(); bh = hsv[BY:800, 548:752]
gfrac = frac((bh[..., 0] >= 36) & (bh[..., 0] <= 88) & (bh[..., 1] > 45), P)
def ok_b(x):
    most = float(1 - ss(30, 150, x))
    return gfrac <= max(most, 0.01) + 0.05, (np.maximum(gfrac - most, 0) ** 2 * P * P * 6000).astype(np.float32)
def ok_h(x):
    want = float(0.8 * (1 - ss(60, 170, x)))
    return gfrac <= 2, ((gfrac - want) ** 2 * P * P * 9000).astype(np.float32)
def leaves(q):
    qh = HSV(q)
    fg = ~((qh[..., 0] < 33) & (qh[..., 1] < 100) & (qh[..., 2] > 135))
    n, lab, st, _ = cv2.connectedComponentsWithStats(cv2.dilate(fg.astype(np.uint8), np.ones((5, 5), np.uint8)), connectivity=8)
    keep = np.array([False] + [st[i, cv2.CC_STAT_AREA] > 900 or st[i, cv2.CC_STAT_LEFT] == 0 for i in range(1, n)])
    return cv2.GaussianBlur((fg & keep[lab]).astype(np.float32), (0, 0), 0.7)[..., None]
bq = quilt_right(pr[BY:PH, PW - ov:PW], bsrc, ok_b, BW_, P, ov, 0.05, int(os.environ.get("SEED_B", 4)))
hq = quilt_right(pr[HY:PH, PW - ov:PW], bsrc, ok_h, BW_, P, ov, 0.05, int(os.environ.get("SEED_H", 4)))
fa = leaves(bq)
R[BY:PH, :BW_] = R[BY:PH, :BW_] * (1 - fa) + bq * fa
fa = leaves(hq) * ss(0, 26, np.arange(PH - HY, dtype=np.float32))[:, None, None]
R[HY:PH, :BW_] = R[HY:PH, :BW_] * (1 - fa) + hq * fa

flat = np.zeros((FH, FW, 3), np.float32)
flat[:, :LW], flat[:, PX:PX + PW], flat[:, PX + PW:] = L, pr, R
flat = np.clip(flat, 0, 255)
fh_ = HSV(flat)


# ------------------------------------------------------------------ foliage
# Every tree and bush is copied off the picture as its own piece, so the page
# can move each one a little. The scene keeps its foliage as well: a piece
# that leans away uncovers the same leaves standing still, never a hole.
# What counts as foliage: leaf green, in a mass (the cliff's stipple is green
# too, but in specks), and not the ground, the river or anybody's coat.
leaf = (fh_[..., 0] >= 38) & (fh_[..., 0] <= 74) & (fh_[..., 1] > 45) & (fh_[..., 2] > 85) & (fh_[..., 2] < 235)
keepout = np.zeros((FH, FW), bool)
for x0, y0, x1, y1 in [(235, 705, 470, FH), (470, 800, PW, FH), (100, 760, 235, 882), (0, 840, 50, FH)]:
    keepout[y0:y1, PX + x0:PX + x1] = True      # the mound, the travellers, the hut, the bank
keepout[WY - 10:, :PX] = True                    # the river
leaf &= ~keepout
g = cv2.morphologyEx(leaf.astype(np.uint8), cv2.MORPH_CLOSE, disc(2))
n, lab, st, _ = cv2.connectedComponentsWithStats(g, connectivity=8)
big = np.isin(lab, [i for i in range(1, n) if st[i, cv2.CC_STAT_AREA] >= 220]).astype(np.uint8)
fmask = cv2.dilate(cv2.morphologyEx(big, cv2.MORPH_CLOSE, disc(3)), disc(2))   # takes in dots and outline
fmask[keepout] = 0

# cut the masses into pieces of a size worth moving on their own
n, lab, st, _ = cv2.connectedComponentsWithStats(fmask, connectivity=8)
parts = []
for i in range(1, n):
    x0, y0, w, h, area = st[i]
    if area < 420:
        continue
    ys_, xs_ = np.nonzero(lab == i)
    kk = int(np.clip(round(max(w, h) / 130 * max(1.0, min(w, h) / 130)), 1, 12))
    if kk == 1:
        parts.append((ys_, xs_)); continue
    pts = np.stack([xs_, ys_], 1).astype(np.float32)
    cv2.setRNGSeed(1832 + i)
    _, lb, _ = cv2.kmeans(pts, kk, None, (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 30, 0.5), 3, cv2.KMEANS_PP_CENTERS)
    for c in range(kk):
        sel = lb[:, 0] == c
        if sel.sum() > 150:
            parts.append((ys_[sel], xs_[sel]))
parts.sort(key=lambda t: (int(t[0].mean()) // 140, int(t[1].mean())))

fdir = os.path.join(OUT, "foliage")
for f in (os.listdir(fdir) if os.path.isdir(fdir) else []):
    os.remove(os.path.join(fdir, f))
pieces, total = [], 0
for k, (ys_, xs_) in enumerate(parts, 1):
    x0, y0, x1, y1 = max(0, xs_.min() - 8), max(0, ys_.min() - 8), min(FW, xs_.max() + 9), min(FH, ys_.max() + 9)
    own = np.zeros((y1 - y0, x1 - x0), np.uint8); own[ys_ - y0, xs_ - x0] = 1
    # each piece reaches a few pixels into its neighbours, so no crack opens between two that lean apart
    a = cv2.GaussianBlur((cv2.dilate(own, disc(5)) & fmask[y0:y1, x0:x1]).astype(np.float32), (0, 0), 0.8)
    total += save(f"foliage/{k:02d}.png", np.dstack([flat[y0:y1, x0:x1], a * 255]), colours=128)
    low = ys_ > np.percentile(ys_, 80)
    pieces.append({"n": k, "x": int(x0), "y": int(y0), "w": int(x1 - x0), "h": int(y1 - y0),
                   "ox": round(float(xs_[low].mean() - x0) / (x1 - x0) * 100, 1),
                   "oy": round(float(ys_[low].mean() - y0) / (y1 - y0) * 100, 1)})
print(f"foliage: {len(pieces)} pieces, {total / 1024:.0f} KB")
bare = flat
hole = cv2.dilate(fmask, disc(3))
save("01-scene.png", flat, colours=256)


# ---------------------------------------------------------------- the water
# The box the moving water lives in, and where inside it water may show:
# through the body of the fall, feathered out at the top so the print's own
# needle-tipped starts stay put, and at the foot so it dissolves into the
# stipple that is already there. Cliff stays in front; under a tree nobody can
# say what is behind, so it takes whatever the nearest visible thing is.
X0, X1, Y0, Y1 = PX + 178, PX + 486, 240, 716
bh_ = HSV(bare)
known = hole == 0
land = (((bh_[..., 0] >= 18) & (bh_[..., 0] <= 40) & (bh_[..., 1] > 78) & (bh_[..., 2] > 110)) |
        ((bh_[..., 0] >= 36) & (bh_[..., 0] <= 84) & (bh_[..., 1] > 50) & (bh_[..., 2] < 200))) & known
_, idx = cv2.distanceTransformWithLabels(hole, cv2.DIST_L2, 5, labelType=cv2.DIST_LABEL_PIXEL)
lut = np.zeros(idx.max() + 1, np.uint8); lut[idx[known]] = land[known]
land = np.where(known, land, lut[idx] > 0)
land = cv2.morphologyEx(land.astype(np.uint8), cv2.MORPH_OPEN, disc(1))
land = cv2.morphologyEx(land, cv2.MORPH_CLOSE, disc(3))
land_soft = cv2.GaussianBlur(cv2.dilate(land, disc(2)).astype(np.float32), (0, 0), 1.6)
fy, fx = np.mgrid[0:FH, 0:FW].astype(np.float32)
window = ss(318, 400, fy) * (1 - ss(628, 700, fy)) * ss(X0 + 4, X0 + 14, fx) * (1 - ss(X1 - 14, X1 - 4, fx)) * (1 - land_soft)
box = window[Y0:Y1, X0:X1]
save("05-fall-mask.png", np.dstack([np.full_like(box, 255), box * 255]))

# bare paper: an average of the nearest paper showing between the streams
inked = (bh_[..., 0] > 80) & (bh_[..., 0] < 125) & (bh_[..., 1] > 55)
isbare = cv2.erode((~inked & (land == 0) & (bh_[..., 2] > 215) & (bh_[..., 1] < 80) & known).astype(np.uint8), disc(1)).astype(np.float32)
paper = np.zeros_like(bare); have = np.zeros((FH, FW), bool)
for s in (10, 30, 100):
    num = cv2.GaussianBlur(bare * isbare[..., None], (0, 0), s); den = cv2.GaussianBlur(isbare, (0, 0), s)
    okp = (den > 0.08) & ~have
    paper[okp] = (num / np.maximum(den, 1e-6)[..., None])[okp]; have |= okp
paper[~have] = np.median(bare[isbare > 0], axis=0)
paper = cv2.GaussianBlur(paper, (0, 0), 5) + grain((FH, FW), 1.6)
save("02-fall-paper.png", paper[Y0:Y1, X0:X1], colours=64)

# One colour per column, read off the body of the fall. The print's streams
# run dead vertical, so a column's median is the stream.
BW, BH = X1 - X0, Y1 - Y0
band = bare[400:630, X0:X1]; okc = (land[400:630, X0:X1] == 0) & known[400:630, X0:X1]
pap = np.median(paper[400:630, X0:X1], 0)
col = pap.copy(); amt = np.zeros(BW, np.float32)
for i in range(BW):
    rws = band[okc[:, i], i]
    if len(rws) >= 30:
        col[i] = np.median(rws, 0)
        amt[i] = np.clip((lum(pap[i]) - lum(col[i])) / (lum(pap[i]) - 70.0), 0, 1)
amt[:8] *= np.linspace(0, 1, 8); amt[-8:] *= np.linspace(1, 0, 8)
col_a = ss(0.06, 0.30, amt)
runs, i = [], 0
while i < BW:
    if col_a[i] > 0.5:
        j = i
        while j < BW and col_a[j] > 0.5:
            j += 1
        runs.append((i, j)); i = j
    else:
        i += 1
strands = []
for a, b in runs:
    x = a
    while x < b:
        w = int(rng.integers(4, 10))
        if b - (x + w) < 4:
            w = b - x
        strands.append((x, x + w)); x += w

# Each stream breaks at its own height: a needle where it starts, a short
# taper and a few drops where it gives out. That is the only thing in a tile
# that changes down its length, so it is what the eye follows when it moves.
# The streams are dealt into three sets. Each set is its own tile, with its
# own height and its own speed on the page, so the three never come round
# together and the fall as a whole does not visibly repeat.
SCALE, K = 2, 4                                  # tiles are 2x the frame; drawn 2x that again
xs2 = (np.arange(BW * SCALE) + 0.5) / SCALE - 0.5
col_up = np.stack([np.interp(xs2, np.arange(BW), col[:, c]) for c in range(3)], 1)
a_up = np.interp(xs2, np.arange(BW), col_a)

def needle(img, TH, xa, xb, xt, y_top, y_bot, y_end, dots, end_at, end_len):
    for wrap in (-TH, 0, TH):
        a, b, e = y_top + wrap, y_bot + wrap, y_end + wrap
        left, right = [], []
        for p in np.linspace(0, 1, 14):
            f = p ** 1.35; y = a + (b - a) * p
            left.append((xt - (xt - xa) * f, y)); right.append((xt + (xb - xt) * f, y))
        w = xb - xa
        poly = left + [(xa, e), (xa + w * end_at, e + w * end_len), (xb, e)] + right[::-1]
        cv2.fillPoly(img, [np.round(np.array(poly) * K).astype(np.int32)], 255, cv2.LINE_AA)
        for dx, dy, r in dots:
            cv2.circle(img, (int(round(((xa + xb) / 2 + dx) * K)), int(round((e + dy) * K))),
                       max(1, int(round(r * K))), 255, -1, cv2.LINE_AA)

SHEETS = [("a", 1180, 158), ("b", 1420, 186), ("c", 1660, 221)]      # name, tile height, frame px a second
order = rng.permutation(len(strands))
for gi, (name, TH, _) in enumerate(SHEETS):
    cov = np.zeros((TH * K, BW * K), np.uint8)
    for si in order[gi::3]:
        xa, xb = strands[si]; w = xb - xa
        n = int(rng.choice([1, 2], p=[0.45, 0.55]))
        gaps = sorted(((k + rng.uniform(0.05, 0.95)) / n * TH) for k in range(n))
        glen = [rng.uniform(46, 150) for _ in range(n)]
        for k in range(n):
            g0, g1 = gaps[k], gaps[(k + 1) % n] + (TH if k == n - 1 else 0)
            y_top, y_fin = g0 + glen[k] / 2, g1 - glen[(k + 1) % n] / 2
            end_len = rng.uniform(2.0, 5.5)
            dots, dy, r = [], w * end_len, w * rng.uniform(0.2, 0.32)
            for _ in range(int(rng.integers(0, 4))):
                dy += r * 2.2 + rng.uniform(2, 9)
                dots.append((rng.uniform(-0.4, 0.4) * w, dy, max(0.7, r))); r *= rng.uniform(0.6, 0.85)
            y_end = y_fin - dy
            tip = rng.uniform(60, 150)
            if y_end - y_top < tip + 20:
                continue
            # a hair wider than its slot, so neighbours in other sets leave no crack
            needle(cov, TH, xa - 0.35, xb + 0.35, rng.uniform(xa + 0.2 * w, xb - 0.2 * w),
                   y_top, y_top + tip, y_end, dots, rng.uniform(0.25, 0.75), end_len)
    cov = cv2.resize(cov, (BW * SCALE, TH * SCALE), interpolation=cv2.INTER_AREA).astype(np.float32) / 255
    tile = np.zeros((TH * SCALE, BW * SCALE, 4), np.float32)
    tile[..., :3] = col_up[None]; tile[..., 3] = cov * a_up[None] * 255
    save(f"03-fall-sheets-{name}.png", tile, colours=128)

# Threads: thin lines faster than the sheets. Blue ones down the bare paper,
# pale ones scratched through the ink. Each repeats a whole number of times
# down its tile, so the tile closes on itself.
INK = tuple(float(v) for v in np.median(col[col_a > 0.9], axis=0) * 0.82)
PALE = tuple(float(v) for v in np.median(pap, axis=0))
bare_cols = np.where(col_a[14:-14] < 0.2)[0] + 14
ink_cols = np.where(col_a[14:-14] > 0.8)[0] + 14
THREADS = [("a", 900, 300, bare_cols, 12, INK, 0.7, (1.0, 1.9)), ("b", 1120, 372, ink_cols, 22, PALE, 0.85, (1.1, 2.1))]
for name, TH, _, cols, count, colour, alpha, wr in THREADS:
    thr = np.zeros((TH * K, BW * K, 4), np.float32)
    for _ in range(count):
        x, w = float(rng.choice(cols)) + rng.uniform(-.5, .5), rng.uniform(*wr)
        layer = np.zeros(thr.shape[:2], np.uint8)
        cycles = int(rng.choice([1, 2, 3])); period = TH / cycles
        fr, phase = rng.uniform(0.28, 0.52), rng.uniform(0, period)
        for c in range(-1, cycles + 1):
            a = phase + c * period; b = a + period * fr; tip = (b - a) * 0.45
            poly = [(x, a), (x + w / 2, a + tip), (x + w / 2, b), (x, b + w), (x - w / 2, b), (x - w / 2, a + tip)]
            cv2.fillPoly(layer, [np.round(np.array(poly) * K).astype(np.int32)], 255, cv2.LINE_AA)
        thr[..., 3] = np.maximum(thr[..., 3], layer.astype(np.float32) / 255 * alpha)
    thr = cv2.resize(thr, (BW * SCALE, TH * SCALE), interpolation=cv2.INTER_AREA)
    thr[..., :3] = colour                       # one flat colour; only the alpha is drawn
    thr[..., 3] *= 255
    save(f"04-fall-threads-{name}.png", thr, colours=64)


# ------------------------------------------------------------ mist and spray
# Mist: one soft bank, pale as the paper. The page uses it several times at
# the foot of the fall, each copy swelling and thinning on its own clock.
MW, MH = 640, 380
my, mx = np.mgrid[0:MH, 0:MW].astype(np.float32)
m = np.zeros((MH, MW), np.float32)
for _ in range(26):
    cx, cy = rng.normal(MW / 2, MW * 0.17), rng.normal(MH * 0.56, MH * 0.13)
    rx, ry = rng.uniform(60, 150), rng.uniform(34, 80)
    m += rng.uniform(0.25, 0.6) * np.exp(-(((mx - cx) / rx) ** 2 + ((my - cy) / ry) ** 2))
wisp = cv2.GaussianBlur(rng.normal(size=(MH, MW)).astype(np.float32), (0, 0), 14); wisp /= np.abs(wisp).max()
m = np.clip(m * (0.8 + 0.5 * wisp), 0, 1) ** 1.15
m *= ss(0, 70, mx) * ss(0, 70, MW - mx) * ss(0, 60, my) * ss(0, 60, MH - my)
MIST = np.array([255, 243, 222], np.float32)
save("06-mist.png", np.dstack([np.broadcast_to(MIST, (MH, MW, 3)), m * 215]))

# Spray: loose stipple, thick at the left edge and thinning as it flies. The
# drops are the size of the print's own largest and a little over.
SW, SH = 420, 420
spray = np.zeros((SH * K, SW * K), np.uint8)
for _ in range(210):
    x = abs(rng.normal(0, 0.36)) * SW
    y = SH * (0.1 + 0.8 * rng.beta(2.2, 1.7))
    r = rng.uniform(1.6, 5.2) * (1 - 0.35 * min(1, x / SW))
    if x < SW - 8:
        cv2.ellipse(spray, (int(x * K), int(y * K)), (int(r * K), int(r * rng.uniform(0.75, 1.0) * K)),
                    rng.uniform(0, 180), 0, 360, 255, -1, cv2.LINE_AA)
spray = cv2.resize(spray, (SW * 2, SH * 2), interpolation=cv2.INTER_AREA).astype(np.float32)
save("07-spray.png", np.dstack([np.broadcast_to(np.array([255, 245, 226], np.float32), (SH * 2, SW * 2, 3)), spray * 0.96]))


# ------------------------------------------------------- numbers for the page
pc = lambda v, of: f"{v / of * 100:.3f}%"
print(f"\nframe {FW}x{FH}   print at x {PX}-{PX + PW}")
print(f"water box  left {pc(X0, FW)}  top {pc(Y0, FH)}  width {pc(BW, FW)}  height {pc(BH, FH)}   ({BW}x{BH} frame px)")
print("sheets  ", [(n, th, v) for n, th, v in SHEETS])
print("threads ", [(n, th, v) for n, th, v, *_ in THREADS])

# The foliage list is written straight into the page, between two markers.
lines = []
for p in pieces:
    amp = float(np.clip(np.degrees(np.arctan(2.6 / max(p["h"], p["w"]))) , 0.45, 2.2))
    lines.append(
        f'      <img class="yoro-leaf" src="../assets/img/art/yoro/foliage/{p["n"]:02d}.png" alt="" '
        f'width="{p["w"]}" height="{p["h"]}" loading="eager" decoding="async" '
        f'style="left:{pc(p["x"], FW)};top:{pc(p["y"], FH)};width:{pc(p["w"], FW)};'
        f'--o:{p["ox"]}% {p["oy"]}%;--a:{amp * rng.uniform(0.8, 1.25):.2f}deg;'
        f'--d:{rng.uniform(3.6, 6.4):.1f}s;--w:-{rng.uniform(0, 6):.1f}s">')
if os.path.exists(PAGE):
    html = open(PAGE).read()
    new, hits = re.subn(r"(<!-- foliage:start[^>]*-->\n).*?(\s*<!-- foliage:end -->)",
                        lambda mm: mm.group(1) + "\n".join(lines) + mm.group(2), html, flags=re.S)
    if hits:
        open(PAGE, "w").write(new); print(f"wrote {len(lines)} foliage pieces into mocks/yoro.html")
    else:
        print("no foliage markers in mocks/yoro.html; nothing written")
json.dump({"frame": [FW, FH], "print": [PX, 0, PW, PH], "water": [X0, Y0, BW, BH], "foliage": pieces},
          open(os.path.join(OUT, "layers.json"), "w"), indent=1)

if DEBUG:
    os.makedirs(DEBUG, exist_ok=True)
    S = lambda n, a: Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)).save(os.path.join(DEBUG, n))
    S("flat.png", flat); S("bare.png", bare)
    ov_ = flat.copy(); ov_[fmask > 0] = ov_[fmask > 0] * 0.35 + np.array([255, 0, 120]) * 0.65
    for p in pieces:
        cv2.rectangle(ov_, (p["x"], p["y"]), (p["x"] + p["w"], p["y"] + p["h"]), (0, 0, 0), 1)
    S("foliage.png", ov_)
    w_ = bare.copy(); w_[..., 0] = w_[..., 0] * (1 - window) + 255 * window
    S("window.png", w_[150:800, PX + 100:PX + 560])
