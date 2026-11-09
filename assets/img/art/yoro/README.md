# Yōrō waterfall — the layers

`mocks/yoro.html` is this folder stacked up. Nothing in the picture is drawn in
code: `css/yoro.css` places the layers and moves two of them, `js/yoro.js`
speeds them up on scroll.

All measurements are in pixels of the **frame**, which is the 1672 × 941
picture. Open `01-scene.png` in Krita or Procreate and those are the
coordinates you see.

| # | File | Pixels | Where it sits in the frame | What it does |
|---|------|--------|----------------------------|--------------|
| 1 | `01-scene.png` | 1672 × 941 | the whole frame | The picture, lettering removed. Static. Complete on its own. |
| 2 | `02-fall-paper.png` | 432 × 456 | x 356–788, y 140–596 | Bare paper behind the water. Static. |
| 3 | `03-fall-sheets.png` | 864 × 2400 | same box, tiled downwards | The broad blue sheets. Slides down, 8 s a loop. Printed with *multiply*. |
| 4 | `04-fall-threads.png` | 864 × 2400 | same box, tiled downwards | Thin fast threads. Slides down, 4.6 s a loop. |
| 5 | `05-fall-mask.png` | 432 × 456 | same box | Not shown. Its alpha says where 2–4 may appear. |
| 6 | `06-spray.png` | 600 × 920 | three copies at the foot of the fall | Cream stipple that lifts and fades. |

The water box is 432 × 456 frame pixels. The two tiles are drawn at double
size (864 wide) so they stay sharp when the camera pushes in.

## Drawing your own

**The scene.** Any 16:9 picture works; 1672 × 941 is the minimum, and 3344 × 1882
would look properly sharp on a laptop screen. Leave the sky right of the fall
empty — the name is real text set over it, centred on x 1160, y 148–520. Paint
the waterfall into the scene too: it is what shows before the water loads and
for anyone with reduced motion switched on.

**The water tiles (3 and 4).** Transparent PNGs, any height, 432 px wide (or a
multiple). Two rules:

- The top edge must match the bottom edge, because the tile repeats. The easy
  way: a stroke that runs off the bottom has to come back in at the top at the
  same x.
- Break the streams. A solid stripe from top to bottom looks identical wherever
  it is, so it never appears to move. Gaps, tapered ends and loose dots are
  what the eye follows.

`03` is laid down with multiply, so draw it as ink on white-ish, not as opaque
colour: what you paint darkens the paper under it. `04` is ordinary colour.

**The mask (5).** Same size as the paper. Opaque where water may show,
transparent where a cliff, branch or rock should stay in front. Soft at the top
and bottom so the moving water fades into the painted water. If you move a tree
in the scene, repaint this to match.

**If the box moves.** Change the four percentages on `.yoro-fall` in
`css/yoro.css` (left = x ÷ 1672, top = y ÷ 941, and the same for width and
height), and the three `.yoro-spray` rules beside it.

## Rebuilding these from the reference

    python3 -m venv .venv && .venv/bin/pip install pillow numpy opencv-python-headless
    .venv/bin/python tools/yoro-layers.py

It reads `source/reference.webp`, removes the painted lettering, and cuts the
six files. It prints the box percentages the stylesheet uses.

## Weight

About 1.6 MB, almost all of it the scene (1.2 MB — grainy pictures compress
badly as PNG). As WebP the scene would be roughly a fifth of that.
