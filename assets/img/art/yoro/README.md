# Yōrō waterfall — the layers

`mocks/yoro.html` is this folder stacked up. The picture is Katsushika
Hokusai's *Yōrō Waterfall in Mino Province* (c. 1832), widened to fit a
landscape page and cut into layers by `tools/yoro-layers.py`.

All measurements are in pixels of the **frame**, the 1924 × 1082 wide picture.
The print itself sits at x 304–1056, full height. Open `01-scene.png` in Krita
or Procreate and those are the coordinates you see.

| File | Pixels | Where it sits | What it does |
|------|--------|---------------|--------------|
| `01-scene.png` | 1924 × 1082 | the whole frame | The complete wide picture. Never moves. |
| `foliage/01…55.png` | various | listed in `layers.json` | Each tree and bush again, as its own piece. Sways. |
| `02-fall-paper.png` | 308 × 476 | x 482–790, y 240–716 | Bare paper behind the moving water. |
| `03-fall-sheets-a/b/c.png` | 616 wide | same box, tiled downwards | The blue streams, dealt into three sets. Run down. |
| `04-fall-threads-a/b.png` | 616 wide | same box, tiled downwards | Thin fast threads. Run down. |
| `05-fall-mask.png` | 308 × 476 | same box | Not shown. Its alpha says where the water may appear. |
| `06-mist.png` | 640 × 380 | four copies at the foot of the fall | Soft bank that swells and thins. |
| `07-spray.png` | 840 × 840 | three copies each side of the foot | Stipple thrown outwards. |

## How the pieces move

- **Water.** A small canvas draws the paper, slides the five tiles down over
  it, and cuts the result with the mask. Each tile has its own height and
  speed (`js/yoro.js`, top of file), so the five never line up again: one
  stream repeats, the fall as a whole does not. Scrolling raises the speed.
- **Foliage.** Each piece rocks a degree or so about its own base, on its own
  clock. The scene underneath still has every leaf, so a piece that leans
  only uncovers itself. Pivot, reach and timing are on each `<img>` in the
  page; the script writes that list.
- **Mist and spray.** CSS animations in `css/yoro.css`.

## Recolouring

The bar at the foot of the picture reprints it in any MetBrewer or MoMAColors
palette. The print's own colours are the default and are labelled Hokusai3,
the MetBrewer palette taken from it.

A woodblock print is a few flat inks on paper, so the page treats it that way.
`INKS` at the top of `js/yoro.js` lists the print's inks as measured off the
scan, in six blocks: cliff, foliage, pale water, streams, sky, keyline. A
palette's colours are dealt to the six blocks by scoring every possible
assignment (similar darkness to the block's own ink, strong colours first,
nothing that vanishes into the paper, neighbouring blocks kept apart). Every
pixel then shifts by the same amount as the ink it is closest to. Paper, mist
and the red seals are left alone.

If you redraw a layer in different colours, update `INKS` to match or the
recolour will not find them.

## What is Hokusai and what is not

The middle 752 pixels are the print. Everything left and right of it was made
to continue it:

- The cliff and trees to the left, the waves below them, the end of the
  right-hand mountain, and the tree and bushes past the right edge are
  *quilted* out of the print itself: small squares of the real print, chosen
  to agree with their neighbours and stitched along the least visible line.
- The open cloud, the band of grey mist and the cloud banks are drawn, in
  the print's own colours with its scalloped edge and little yellow curls.

## Drawing your own

Keep the same frame size and the same boxes and nothing else has to change.

- **Scene.** 1924 × 1082 or any multiple. Keep the area right of x 1250 quiet;
  the name is set over it.
- **Water tiles.** Transparent PNG, 308 px wide or a multiple, any height. The
  top edge must meet the bottom edge, and the streams need gaps and tapered
  ends or they will not appear to move. A new height or speed goes in the
  `TILES` table in `js/yoro.js`.
- **Mask.** Opaque where water may show, transparent where rock or cliff
  stays in front, soft at the top and foot.
- **Foliage.** Any transparent PNG, placed with `left`/`top`/`width` in
  percent of the frame. `--o` is the pivot, `--a` the reach, `--d` the period.

## Rebuilding

    python3 -m venv .venv && .venv/bin/pip install pillow numpy opencv-python-headless
    .venv/bin/python tools/yoro-layers.py

Reads `source/hokusai-yoro.webp`, writes every file above and the foliage
list in `mocks/yoro.html`.

## Weight

About 1.6 MB: the scene is 1.1 MB, the foliage 0.2 MB, the rest under 0.3 MB.
The source scan is only 758 px wide, so the picture is soft on a large or
high-density screen; a larger scan of the same print would fix that without
any other change.
