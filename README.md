# blakerobertmills.com

Static site, no build step. Plain HTML, one stylesheet, two small scripts.
Replaces the Squarespace build.

## Running it locally

Some pages fetch JSON, so open it over HTTP rather than double-clicking the files:

```bash
python3 -m http.server 4173
```

Then visit <http://localhost:4173>.

## Layout

```
index.html              home
work.html               portfolio hub
metbrewer.html          {MetBrewer}  — interactive palette browser
momacolors.html         {MoMAColors} — interactive palette browser
visualizations.html     75 plots and maps, grouped, with lightbox
designs.html            illustration work
writings.html           published articles and interviews
about.html              about
resume.html             summary + embedded PDF
404.html                not found

css/site.css            the whole design system
css/home.css            homepage only — the "Recolour" layout
js/site.js              theme toggle, mobile nav, lightbox, clipboard
js/palettes.js          palette browser
js/arcade.js            arcade mode
js/palette-home.js      homepage palette engine
assets/img/             all images, pulled off Squarespace's CDN
assets/data/            palettes.json, visualizations.json
tools/parse_palettes.py regenerates palettes.json from the R sources
assets/img/arcade/      arcade artwork (see ART.md)
CNAME                   custom domain for GitHub Pages
```

## The homepage

The homepage takes its colour scheme from one of the 91 palettes, read live
from `palettes.json`, and hands off to a different palette per section as you
scroll. `js/palette-home.js` rewrites the same custom properties `site.css`
already uses, so the shared header, footer and buttons recolour with the page
rather than being restyled.

Two things worth knowing if you change it:

- **Contrast is computed, not chosen.** Body text has to clear 4.5:1 against
  whatever ground a palette produces and the accent 3:1. Where a palette can't
  manage it, the ground is nudged toward white or black — keeping its hue —
  until it can, and `--text-soft`'s alpha is solved for rather than fixed. All
  140 palette/polarity combinations pass; a fixed alpha failed 88 of them.
- **The page ships fully styled.** `home.css` carries a real palette
  ({MetBrewer} Hiroshige) as its defaults, so the homepage is designed before
  any JavaScript runs and stays that way if none does. Transitions only switch
  on after the first palette lands, so there's no crossfade out of the defaults.

Earlier explorations of other directions are in `mocks/`.

## Arcade mode

The gamepad button in the header swaps the site for a small top-down world
(`js/arcade.js`), drawn in the visual language of a GBA-era overworld RPG. You
walk a sprite around a town; each building is one of the real pages.

- **Controls:** WASD or arrow keys, **Esc** to leave. Movement is grid-based —
  one tile per step, with a turn-in-place beat if you're facing the wrong way.
- **Doors:** stand in front of one and a dialogue box names the building; walk
  onto it and you go to that page. **E** works too, and on touch devices there's
  a d-pad and an **A** button.
- **Buildings:** The Met → {MetBrewer}, MoMA → {MoMAColors}, The Gallery →
  Visualizations, The Studio → Designs, The Newsstand → Writings, The Office →
  Resume, Blake's Place → About.
- **Swatches:** eight colour pickups scattered around, counted in the HUD and
  remembered in `localStorage`.
- **Night:** the world follows the site's light/dark setting, and the windows
  light up.

There are no image assets. The character, tiles, trees, flowers, fences,
fountain, buildings, pigeon and the dialogue box are all drawn pixel by pixel in
code. Text in the world is rendered at 8px into an offscreen buffer and blitted
scaled up, so it stays chunky instead of going smooth.

The map is generated rather than hand-drawn: buildings are stamped at fixed
positions, paths are run out from each door, then scenery is scattered with a
seeded RNG (so the map is identical every visit). Because random scenery can box
something in, a flood fill from the spawn point checks that every door and every
swatch is reachable, and carves a way through if not.

All of it can be replaced with PNGs you draw yourself — the artwork in
`assets/img/arcade/` is loaded through `assets/data/arcade-art.json`, and
anything that file doesn't list falls back to the code-drawn version, so the
art can be swapped one piece at a time. **See [ART.md](ART.md)** for the sheet
layouts and sizes.

`window.brmArcade` exposes `open()`, `close()` and `state()` if you want to poke
at it from the console.

## Deploying to GitHub Pages

1. Create a repo and push this directory.
2. Settings → Pages → Build from branch → `main`, folder `/ (root)`.
3. `CNAME` already contains `www.blakerobertmills.com`. Point the DNS at GitHub:
   a `CNAME` record for `www` → `<username>.github.io`. Leave Squarespace up
   until the DNS has moved and the site is confirmed live.

## Keeping the palettes current

`assets/data/palettes.json` is generated from the two packages' R sources, so
the site can't drift from the packages. After adding palettes upstream:

```bash
curl -sL -o /tmp/met.R  https://raw.githubusercontent.com/BlakeRMills/MetBrewer/main/R/PaletteCode.R
curl -sL -o /tmp/moma.R https://raw.githubusercontent.com/BlakeRMills/MoMAColors/main/R/Colors.R
python3 tools/parse_palettes.py /tmp/met.R /tmp/moma.R assets/data/palettes.json
```

Palette counts on the pages are computed from that file, so they update themselves.

## Notes on the content

- The copy is carried over from the Squarespace site, lightly rewritten. Worth
  a read-through — especially the home and about pages.
- The old site said {MetBrewer} had 50 palettes, 18 colorblind friendly. The
  package is now at **56 palettes, 24 colorblind friendly**, which is what the
  site shows.
- Visualization titles came from the old page's alt text. A few were filenames
  (`DogPlot.png`, `LemurPlot.png`) and have been given real titles — check
  `assets/data/visualizations.json` if you want to rename any.
- The resume page embeds the PDF pulled from Squarespace. Replace
  `assets/Blake-Robert-Mills-Resume.pdf` when it's next updated.
- The old site had a cart / store. Nothing here, since nothing was listed.
