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
js/site.js              theme toggle, mobile nav, lightbox, clipboard
js/palettes.js          palette browser
assets/img/             all images, pulled off Squarespace's CDN
assets/data/            palettes.json, visualizations.json
tools/parse_palettes.py regenerates palettes.json from the R sources
CNAME                   custom domain for GitHub Pages
```

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
