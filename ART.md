# Drawing the arcade art

All of arcade mode's artwork is PNGs under `assets/img/arcade/`.
`assets/data/arcade-art.json` says which images exist and how to read them.

**Anything the manifest doesn't list falls back to the version drawn in code**
inside `js/arcade.js`. So you can redraw one building, or just the character,
and leave the rest alone — nothing breaks part-way through.

The PNGs currently in the repo were exported from that code-drawn art, so they
are a starting point to paint over rather than blank canvases.

## General rules

- **One pixel in the file is one pixel in the world.** Don't draw at 4x and
  scale down — draw at actual size and zoom in your editor instead.
- **Export with nearest-neighbour / no interpolation.** Any antialiasing or
  soft edges will look like mud once the game scales it up 4x.
- **Transparency is respected.** Leave the background transparent, not white.
- **Indexed or RGBA both work.** Any normal PNG is fine.
- A tile is **16 x 16**. The world is 40 x 28 tiles.

## The character

`assets/img/arcade/player.png` — currently **64 x 72**.

A grid of cells, each **16 wide x 24 tall**. The sprite is taller than a tile
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

`assets/img/arcade/tiles.png` — currently **64 x 128**.

- **Rows are tile types**, in the order given by `rows` in the manifest:
  `grass, path, tall, flower, tree, water, stone, fence`
- **Columns are variants.** The game picks one per map position using a hash of
  its coordinates, so a few different grass tiles stop the ground looking
  stamped. One column is fine if you don't want variety.
- **Water is the exception:** its columns are animation frames, cycled over time.

Two things to know:

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
| `met.png`  | The Met        | 10 x 6 | 166 x 100 |
| `moma.png` | MoMA           | 10 x 6 | 166 x 100 |
| `gal.png`  | The Gallery    | 8 x 5  | 134 x 84  |
| `stu.png`  | The Studio     | 8 x 5  | 134 x 84  |
| `news.png` | The Newsstand  | 7 x 4  | 118 x 68  |
| `off.png`  | The Office     | 7 x 4  | 118 x 68  |
| `home.png` | Blake's Place  | 7 x 4  | 118 x 68  |

The images are slightly bigger than `w*16 x h*16` because the roof overhangs by
3px each side and the shadow falls 3px below. `offset` in the manifest says
where the image's top-left corner goes relative to the building's top-left tile
— `[-3, 0]` for all of these.

**The door matters.** It sits on the bottom row, in the middle column
(`x + floor(w/2)`), and that's the tile you walk onto to enter the page. Draw
the door there or the building will read wrong, even though the collision will
still work.

By default the name board is assumed to be part of your drawing. To keep the
code-drawn board on top of your art, set `"label": true` for that building.

## The manifest

```json
{
  "player": { "src": "...", "cell": [16, 24], "frames": 4,
              "rows": ["down", "up", "right"] },
  "tiles":  { "src": "...", "cell": [16, 16], "variants": 4, "pathEdges": true,
              "rows": ["grass", "path", "tall", "flower", "tree", "water",
                       "stone", "fence"] },
  "buildings": {
    "met": { "src": "...", "offset": [-3, 0], "label": false }
  }
}
```

Delete an entry and that thing goes back to being drawn in code. Point `src` at
a file that doesn't exist and it does the same, silently — handy while you work,
but worth knowing if something you drew isn't showing up.

## Adding a new building

1. Add it to `PLACES` in `js/arcade.js` with its tile position, size, `href`
   and `name`. The map generator stamps it, puts a door on the bottom row and
   runs a path out to the street.
2. Draw the PNG at `w*16 x h*16` (plus any overhang) and add it to the manifest.

A flood fill checks every door is still reachable after scenery is scattered and
carves a way through if not, so you can't accidentally wall one off.

## What isn't an image yet

The pigeon, the colour swatches, the dialogue box and the fade are still drawn
in code. If you want those as PNGs too, say so and I'll extend the manifest the
same way.
