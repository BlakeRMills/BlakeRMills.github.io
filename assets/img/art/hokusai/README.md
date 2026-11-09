# Hokusai — the layer set

Thirteen PNGs. The page composites these; it draws nothing itself. Replace any
file with your own of the same size and the page picks it up on reload — no
code change, no build step.

`js/hokusai.js` holds the draw order and the motion.
`tools/hokusai-layers.html` regenerates this whole set (open it while the site
is served from a server that accepts PUT — see the comment at the top of it).

## The frame

Every **full-frame** layer is **2000 × 1250** and shares one coordinate system,
so you can open the whole set as a stack in one document and everything lines
up. Transparent except for the sky.

Landmarks inside that frame:

| what | where |
|---|---|
| centre of the fall | x **680** (0.34) |
| width at the lip | **350** |
| width at the base | **427** |
| top of the fall | y **25** |
| foot of the fall | y **925** |
| waterline | y **1000** (0.80) |

The frame is 1.6:1 and is cover-fitted, anchored on the fall. On a phone roughly
**x 440–965 only** is visible, so keep anything that must always be seen
inside the middle half. On a wide desktop almost the full width shows.

## The layers, back to front

| # | file | size | repeats | what it is |
|---|---|---|---|---|
| 01 | `01-sky.png` | 2000×1250 | — | The only opaque layer. Dark band across the top, open sky to the waterline, water below it. Everything else sits on this. |
| 02 | `02-cliff-left.png` | 2000×1250 | — | Left wall of the gorge. |
| 03 | `03-cliff-right.png` | 2000×1250 | — | Right wall, stepped. |
| 04 | `04-cliff-outcrop.png` | 2000×1250 | — | The dark shelf the fall breaks over. |
| 05 | `05-fall.png` | 384×768 | **tiles top-to-bottom** | The water. See below. |
| 06 | `06-fall-crest.png` | 2000×1250 | — | The lip, and the first loose strands. |
| 07 | `07-spray.png` | 768×384 | — | Burst where it lands. Anchored on the foot of the fall, which moves with scroll. |
| 08 | `08-pool-far.png` | 1024×256 | **tiles left-to-right** | Far water, sits on the waterline, drifts slowly. |
| 09 | `09-pool-near.png` | 1024×256 | **tiles left-to-right** | Near water, larger scallops, drifts faster. |
| 10 | `10-mist.png` | 2000×1250 | — | Whisper along the waterline. |
| 11 | `11-foliage-far.png` | 2000×1250 | — | Smaller, higher clusters. Moves least on scroll. |
| 12 | `12-foliage-near.png` | 2000×1250 | — | Big clusters nearer the edges. Moves most. |
| 13 | `13-grain.png` | 256×256 | **tiles both ways** | Paper tooth, laid over everything at 55%. |

## The three that have to tile

- **`05-fall.png`** — its **top edge must match its bottom edge**. The renderer
  repeats it down the column and slides the slice origin; that sliding is the
  flow. Draw it as a straight strip: the taper is applied by the code, which
  cuts the column into 56 bands and draws each at its own width. Anything with
  a vertical rhythm should have a period that divides 768 exactly.
- **`08`/`09-pool-*.png`** — **left edge must match right edge.**
- **`13-grain.png`** — must tile in both directions.

## Depth

How much each layer answers to the pointer and to the scroll. 0 is nailed to
the back wall, 1 is right in front of you. Change these in `SHEETS` in
`js/hokusai.js`.

```
sky 0.00 · cliff-left 0.26 · cliff-right 0.30 · outcrop 0.52
fall 0.44 · crest 0.46 · spray 0.50 · mist 0.40
foliage-far 0.58 · foliage-near 0.92
```

## If you redraw these

- Keep transparency. Only `01-sky.png` should be opaque.
- Keep the sizes, or change them in `SHEETS` as well.
- Leave margin at the frame's left and right edges — they get cropped.
- The colours are baked in now, so the palette bar is gone. If you want the
  print to re-ink from `palettes.json` again, draw the layers greyscale and
  the renderer can tint them instead.

## Weight

The set is about 860 KB. Layers load progressively and each paints as it
lands, so the sky and the gorge are up long before the last file arrives.
