# Drawing the arcade art

All of arcade mode's artwork is PNGs under `assets/img/arcade/`.
`assets/data/arcade-art.json` says which images exist and how to read them.

**Anything the manifest doesn't list falls back to the version drawn in code**
inside `js/arcade.js`. So you can redraw one building, or just the character,
and leave the rest alone — nothing breaks part-way through.

The PNGs currently in the repo were exported from that code-drawn art, so they
are a starting point to paint over rather than blank canvases.

## Density, and what the sizes mean

The world is measured in **units**, not pixels. A tile is 16 units; the map is
40 x 28 tiles. How many image pixels you draw per unit is up to you, and it's
set by `density` in the manifest.

Everything is currently at **density 2** — 2 image pixels per world unit — so a
16-unit tile is a 32 x 32 drawing. Raise it to 3 or 4 and everything gets
correspondingly finer. The game scales whatever you give it to the same world
size, so **changing density changes detail, not how big things look.**

`density` at the top of the manifest is the default; any asset can override it
with its own `density`, so you can redraw the buildings at 4 while the tiles are
still at 2.

### How big can I draw before pixels get thrown away?

Short answer: **you can't lose pixels any more**, up to density 16.

On screen one world unit covers `scale` device pixels, where `scale` comes from
the viewport — roughly 2 in a small non-retina window, 4 on a phone, 6 on a
retina laptop, 8 on a 1440p display. Detail is lost only if `density` is bigger
than `scale`.

The renderer now rounds `scale` up to a whole multiple of `density`, which has
two useful effects:

- `scale` is never less than `density`, so your art is never downscaled.
- The ratio between them is always a whole number, so one drawn pixel is always
  the same whole number of screen pixels. Before this, density-2 art on a 13in
  retina screen landed on a 2.5x upscale and the pixels came out unevenly sized
  — some two screen pixels across, some three.

### So what stops you going higher?

Zoom, not fidelity. A higher density forces a higher minimum `scale`, which
means a more zoomed-in camera and less of the map on screen at once:

| density | tile is | met.png is | smallest window shows |
|---------|---------|------------|------------------------|
| 2 *(now)* | 32 x 32 | 364 x 200 | ~28 tiles across |
| 3 | 48 x 48 | 546 x 300 | ~19 tiles across |
| 4 | 64 x 64 | 728 x 400 | ~14 tiles across |
| 6 | 96 x 96 | 1092 x 600 | ~9 tiles across |
| 8 | 128 x 128 | 1456 x 800 | ~7 tiles across |

Below about 12 tiles across the world starts feeling cramped — you can't see a
whole building and its surroundings at once. **3 or 4 is the sensible ceiling**;
past that you're drawing detail nobody can see without a big monitor, and the
files grow with the square of the density.

### What's in units and what's in pixels

This is the bit that catches people:

- **In image pixels** (so they scale with density): `cell`, and the nine-slice
  `slice` on the box.
- **In world units** (so they don't): the building `offset`, the swatch `fill`,
  and the box `height`.

Double your density and you double `cell` and `slice`, and leave the rest alone.

### Can I change an individual size?

| Asset        | Freedom                                                     |
|--------------|-------------------------------------------------------------|
| Buildings    | **Any size.** Set `offset` to place it.                      |
| Pigeon       | **Any size.**                                                |
| Swatches     | **Any size**; `fill` is in units, so it doesn't move.        |
| Character    | **Any height.** Width over one tile is centred, but the      |
|              | collision box stays one tile, so very wide art clips walls.  |
| Dialogue box | **Any size**; set `height` (units) and `slice` (pixels).     |
| Tiles        | **Any size**, as long as it's square and `cell` matches.     |

The character is anchored by its feet to the bottom of its tile, so a taller
sprite just leans further over whatever is behind it.

## General rules

- **One pixel in the file is one pixel in the world.** Don't draw at 4x and
  scale down — draw at actual size and zoom in your editor instead.
- **Export with nearest-neighbour / no interpolation.** Any antialiasing or
  soft edges will look like mud once the game scales it up 4x.
- **Transparency is respected.** Leave the background transparent, not white.
- **Indexed or RGBA both work.** Any normal PNG is fine.
- A tile is **16 world units**, drawn at 32 x 32 pixels at the current density.

## The character

`assets/img/arcade/player.png` — currently **128 x 144**.

A grid of cells, each **32 wide x 48 tall** (16 x 24 world units at density 2). The sprite is taller than a tile
on purpose: it stands 8px above its tile so it overlaps whatever is behind it.
Feet should sit at the **bottom** of the cell.

- **Columns are walk frames**, left to right: `0` standing, `1` left leg leads,
  `2` standing, `3` right leg leads. The game plays 1 and 3 on alternating steps
  and shows 0 when you stop.
- **Rows are facings**, top to bottom: `down`, `up`, `right`.

Facing left is the right-hand row mirrored automatically. If you'd rather draw
it yourself, add a fourth row and list it in the manifest:

```json
"rows": ["down", "up", "right", "left"]
```

Make the image taller to add rows, wider to add frames, and update `cell`,
`frames` and `rows` to match.

## Tiles

`assets/img/arcade/tiles.png` — currently **128 x 256**, cells of **32 x 32**.

- **Rows are tile types**, in the order given by `rows` in the manifest:
  `grass, path, tall, flower, tree, water, stone, fence`
- **Columns are variants.** The game picks one per map position using a hash of
  its coordinates, so a few different grass tiles stop the ground looking
  stamped. One column is fine if you don't want variety.
- **Water is the exception:** its columns are animation frames, cycled over time.

Tiles should be square and match `cell`. Two other things to know:

**Solidity is not in the art.** Whether you can walk through something is set by
`SOLID` in `js/arcade.js`, not by what the tile looks like. Draw a boulder over
the `flower` row and you'll walk straight through it.

**Path edges.** The darker lip where a path meets grass is drawn in code, by
looking at a tile's neighbours — a single path tile can't know which side needs
an edge. `"pathEdges": true` in the manifest keeps that lip drawn on top of your
path art. Turn it off once your path tiles handle their own edges.

## Buildings

One PNG each, in `assets/img/arcade/buildings/`. A building is `w x h` tiles,
set in `PLACES` in `js/arcade.js`:

| file       | building       | tiles  | image     |
|------------|----------------|--------|-----------|
| `met.png`  | The Met        | 11 x 6 | 364 x 200 |
| `moma.png` | MoMA           | 11 x 6 | 364 x 200 |
| `gal.png`  | The Gallery    | 8 x 5  | 268 x 168 |
| `stu.png`  | The Studio     | 8 x 5  | 268 x 168 |
| `news.png` | The Newsstand  | 7 x 4  | 236 x 136 |
| `off.png`  | The Office     | 7 x 4  | 236 x 136 |
| `home.png` | Blake's Place  | 7 x 4  | 236 x 136 |

The images are bigger than `w*16 x h*16` units because the roof overhangs by 3
units each side and the shadow falls 3 below — at density 2 that's 6 pixels of
extra width and 8 of height. `offset` says where the image's top-left corner
goes relative to the building's top-left tile, in **units**: `[-3, 0]` for all
of these, whatever the density.

**The door matters.** It sits on the bottom row, in the middle column
(`x + floor(w/2)`), and that's the tile you walk onto to enter the page. Draw
the door there or the building will read wrong, even though the collision will
still work.

Note that an **even** tile width has no middle column, so the door lands one
column right of centre and a symmetrical facade can't be centred on it. The two
museums are 11 wide for exactly this reason. If you're drawing something
symmetrical, give it an odd width.

By default the name board is assumed to be part of your drawing. To keep the
code-drawn board on top of your art, set `"label": true` for that building.

## The manifest

```json
{
  "version": "3",
  "density": 2,
  "player": { "src": "...", "cell": [32, 48], "frames": 4,
              "rows": ["down", "up", "right"] },
  "tiles":  { "src": "...", "cell": [32, 32], "variants": 4, "pathEdges": true,
              "rows": ["grass", "path", "tall", "flower", "tree", "water",
                       "stone", "fence"] },
  "pigeon": { "src": "...", "cell": [32, 32], "frames": 1 },
  "swatch": { "src": "...", "cell": [32, 32], "frames": 1, "fill": [4, 3, 8, 8] },
  "box":    { "src": "...", "slice": [16, 16, 16, 16], "height": 38,
              "text": "#1c3a5e", "subtext": "#4a6a8a" },
  "buildings": {
    "met": { "src": "...", "offset": [-3, 0], "label": false }
  }
}
```

Any asset can carry its own `"density"` to override the top-level one.

Delete an entry and that thing goes back to being drawn in code. Point `src` at
a file that doesn't exist and it does the same, silently — handy while you work,
but worth knowing if something you drew isn't showing up.

## Adding a new building

1. Add it to `PLACES` in `js/arcade.js` with its tile position, size, `href`
   and `name`. The map generator stamps it, puts a door on the bottom row and
   runs a path out to the street.
2. Draw the PNG at `w*16 x h*16` units — times your density, plus any overhang
   — and add it to the manifest.

A flood fill checks every door is still reachable after scenery is scattered and
carves a way through if not, so you can't accidentally wall one off.

## The pigeon

`assets/img/arcade/pigeon.png` — **32 x 32**, one row.

Columns are animation frames, cycled over time; set `frames` to how many you
drew. The sheet faces **right** and is mirrored automatically when the bird
walks the other way.

## Swatches

`assets/img/arcade/swatch.png` — **32 x 32**, one row. Columns are frames.

All eight swatches share this one image, because each one has its own colour.
What you draw is the **holder** — think of the clear plastic around a paint
chip. The swatch's colour is painted in as a flat rectangle *behind* your
drawing, so leave that area transparent and it shows through.

`fill` says where that rectangle goes inside the cell, as `[x, y, w, h]`.
The default `[4, 3, 8, 8]` is an 8x8 block, 4px in and 3px down. Shrink it to
nothing if you'd rather the colour didn't show at all.

## The dialogue box

`assets/img/arcade/box.png` — currently **128 x 76**, drawn `height` units tall.

The box stretches to the width of the screen, so it's drawn as a nine-slice:
the four corners are left alone, the four edges stretch along one axis, and the
middle fills whatever is left.

`slice` is how far in the corners reach, as `[left, top, right, bottom]` — the
default `[8, 8, 8, 8]` means the corner 8x8 of each corner stays fixed. Keep
your border detail inside that inset, or it'll stretch.

`text` and `subtext` set the colour of the building name and the line beneath
it. The blinking arrow uses `text` too.

## A note on caching

The manifest is always revalidated, so adding or removing an entry takes effect
on a normal reload. **Images are not** — a browser that already has `player.png`
will happily keep showing you the old one after you redraw it.

Bump `version` at the top of the manifest when that happens:

```json
{ "version": "2", ... }
```

It's appended to every image URL, so everything reloads. A hard refresh works
too, but the version field is what makes it reliable for other people's
browsers once the site is live.

## Still drawn in code

The fade when you enter a door, the drop shadows under the sprite and swatches,
and the name boards over each building (unless you set `"label": true`). Say the
word if you want any of those opened up too.
