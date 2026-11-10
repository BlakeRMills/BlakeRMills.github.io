/* Yoro — the motion and the colour for the layered waterfall.
 *
 * The picture is images; see css/yoro.css. The trees, the mist and the spray
 * move on CSS animations. This file does four things:
 *
 *   - runs the water. The fall is a small canvas that draws five PNG tiles
 *     sliding down behind a sixth, the mask. Three sets of streams and two of
 *     threads each have their own height and speed, so they never come round
 *     together: any one stream repeats, the fall as a whole does not. Offsets
 *     are kept as real numbers and advanced by the clock, so there is no loop
 *     point to jump at.
 *   - scroll: the camera pushes in on the foot of the fall, the water runs
 *     faster and the trees and spray pick up
 *   - pointer: the picture leans a few pixels, the lettering the other way
 *   - recolour: reprints the picture in another palette (see below)
 *
 * Until every water layer has arrived, and for anyone who has asked for less
 * motion, the canvas stays empty and the print's own water shows through.
 */
(function (global) {
  "use strict";

  /* From tools/yoro-layers.py. Tile heights and speeds are in frame pixels
     (the picture is 1924 wide, the water box 308 x 476); speeds per second. */
  var BOX_H = 476;
  var TILES = [
    { file: "03-fall-sheets-a.png",  h: 1180, v: 158 },
    { file: "03-fall-sheets-b.png",  h: 1420, v: 186 },
    { file: "03-fall-sheets-c.png",  h: 1660, v: 221 },
    { file: "04-fall-threads-a.png", h: 900,  v: 300 },
    { file: "04-fall-threads-b.png", h: 1120, v: 372 }
  ];

  /* ------------------------------------------------------------- recolour
     A woodblock print is a handful of flat inks on paper, so it can be
     reprinted in other inks. INKS are the print's own, measured off the scan
     and listed light to dark; the six `role`s are the six blocks, and they
     line up one for one with MetBrewer's Hokusai3. A palette is sorted light
     to dark and dealt across the roles, so pale inks stay pale and the
     keyline stays the darkest thing on the sheet. Paper, mist and the red
     seals have no role and are left alone.

     Each pixel moves by the shift of whichever inks it is near, weighted by
     how near, so the paper's grain, the soft edges and the half-tones
     between two inks all come through. The shifts are worked out once per
     palette into a small colour cube and then looked up per pixel. */
  var INKS = [
    { rgb: [226, 214, 131], role: 0 },   // cliff
    { rgb: [213, 195, 118], role: 0 },   //   its darker wash
    { rgb: [233, 195, 119], role: 0 },   //   the ochre ground, printed over it
    { rgb: [144, 178, 126], role: 1 },   // foliage
    { rgb: [141, 178, 173], role: 2 },   // pale water
    { rgb: [101, 140, 149], role: 3 },   // streams
    { rgb: [ 59, 110, 133], role: 4 },   // sky and deep water
    { rgb: [ 44,  88, 100], role: 5 },   // keyline
    { rgb: [254, 238, 205] }, { rgb: [251, 228, 189] },      // paper
    { rgb: [225, 210, 177] }, { rgb: [205, 186, 151] },      // mist
    { rgb: [215, 191, 156] }, { rgb: [183, 170, 142] }, { rgb: [238, 220, 186] },
    { rgb: [203,  96,  74] }                                 // red
  ];
  var ROLE_INK = [0, 3, 4, 5, 6, 7];      // the INKS entry that stands for each role
  var REACH = 19;                         // how far, in RGB, an ink's pull carries

  function hex(c) { c = c.replace("#", ""); return [0, 2, 4].map(function (i) { return parseInt(c.substr(i, 2), 16); }); }
  function toHex(c) { return "#" + c.map(function (v) { v = Math.max(0, Math.min(255, Math.round(v))); return (v < 16 ? "0" : "") + v.toString(16); }).join(""); }
  function lin(v) { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
  function unlin(v) { return 255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055); }
  function lab(c) {
    var r = lin(c[0]), g = lin(c[1]), b = lin(c[2]);
    var f = function (t) { return t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116; };
    var x = f((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047),
        y = f(0.2126 * r + 0.7152 * g + 0.0722 * b),
        z = f((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883);
    return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
  }
  function unlab(l) {
    var y = (l[0] + 16) / 116, x = l[1] / 500 + y, z = y - l[2] / 200;
    var f = function (t) { return t * t * t > 0.008856 ? t * t * t : (t - 16 / 116) / 7.787; };
    x = f(x) * 0.95047; y = f(y); z = f(z) * 1.08883;
    return [unlin(3.2406 * x - 1.5372 * y - 0.4986 * z),
            unlin(-0.9689 * x + 1.8758 * y + 0.0415 * z),
            unlin(0.0557 * x - 0.2040 * y + 1.0570 * z)].map(function (v) { return Math.max(0, Math.min(255, v || 0)); });
  }
  function relLum(c) { return 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]); }
  function contrast(a, b) { var x = relLum(a), y = relLum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
  function toward(c, d, t) { return c.map(function (v, i) { return v + (d[i] - v) * t; }); }

  /* The six inks a palette prints with. Dealing them out strictly by
     lightness wastes a palette: its palest colour lands on the cliff and
     vanishes into the paper, and its strongest colours can miss the big
     areas altogether. So every way of giving the palette's colours to the
     blocks is scored and the best one wins:
       - a block should get a colour about as dark as its own ink
       - strong colours are preferred to weak ones
       - nothing that would disappear against the paper
       - blocks that touch in the picture should not look alike
     The keyline always takes the palette's darkest colour. */
  var PAPER_LAB = lab([251, 230, 194]);
  var TOUCH = [[0, 1], [0, 4], [1, 4], [1, 2], [2, 3], [3, 4], [0, 2]];
  function dE(a, b) { return Math.sqrt((a[0] - b[0]) * (a[0] - b[0]) + (a[1] - b[1]) * (a[1] - b[1]) + (a[2] - b[2]) * (a[2] - b[2])); }
  function inksFor(colors) {
    var cs = colors.map(hex), L = cs.map(lab), n = cs.length;
    var want = ROLE_INK.map(function (k) { return lab(INKS[k].rgb)[0]; });
    var dark = 0;
    for (var i = 1; i < n; i++) if (L[i][0] < L[dark][0]) dark = i;
    var unary = [];
    for (var r = 0; r < 5; r++) {
      unary[r] = [];
      for (var c = 0; c < n; c++) {
        var chroma = Math.sqrt(L[c][1] * L[c][1] + L[c][2] * L[c][2]);
        unary[r][c] = 1.2 * Math.abs(L[c][0] - want[r]) / 100 - 0.5 * Math.min(chroma, 70) / 100
                    + 2.5 * Math.max(0, 1 - dE(L[c], PAPER_LAB) / 24);
      }
    }
    var apart = [];
    for (var a = 0; a < n; a++) { apart[a] = []; for (var b2 = 0; b2 < n; b2++) apart[a][b2] = a === b2 ? 1.2 : -0.5 * Math.min(dE(L[a], L[b2]), 55) / 55; }
    var pick = [0, 0, 0, 0, 0], best = null, bestCost = 1e9, total = Math.pow(n, 5);
    for (var code = 0; code < total; code++) {
      var v = code, cost = 0;
      for (var q = 0; q < 5; q++) { pick[q] = v % n; v = (v / n) | 0; cost += unary[q][pick[q]]; }
      if (cost >= bestCost + 3) continue;
      for (var t = 0; t < TOUCH.length; t++) cost += apart[pick[TOUCH[t][0]]][pick[TOUCH[t][1]]];
      cost += pick[4] === dark ? 0.25 : 0;          // sky and keyline apart if the palette allows
      if (cost < bestCost) { bestCost = cost; best = pick.slice(); }
    }
    best.push(dark);
    return best.map(function (c, r) {
      // the palette gives the hue; the print keeps part of the say over how dark each block is
      var keep = r === 5 ? 0.3 : 0.4;
      return unlab([want[r] * keep + L[c][0] * (1 - keep), L[c][1], L[c][2]]);
    });
  }
  function cubeFor(target) {
    var shift = INKS.map(function (k) {
      if (k.role == null) return [0, 0, 0];
      var from = INKS[ROLE_INK[k.role]].rgb, to = target[k.role];
      return [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
    });
    var cube = new Float32Array(32 * 32 * 32 * 3), s2 = 2 * REACH * REACH, n = 0;
    for (var r = 4; r < 256; r += 8) for (var g = 4; g < 256; g += 8) for (var b = 4; b < 256; b += 8) {
      var sw = 0, dr = 0, dg = 0, db = 0, best = 1e9, bi = 0;
      for (var k = 0; k < INKS.length; k++) {
        var c = INKS[k].rgb, d = (r - c[0]) * (r - c[0]) + (g - c[1]) * (g - c[1]) + (b - c[2]) * (b - c[2]);
        if (d < best) { best = d; bi = k; }
        var w = Math.exp(-d / s2);
        sw += w; dr += w * shift[k][0]; dg += w * shift[k][1]; db += w * shift[k][2];
      }
      if (sw < 1e-12) { dr = shift[bi][0]; dg = shift[bi][1]; db = shift[bi][2]; sw = 1; }
      cube[n++] = dr / sw; cube[n++] = dg / sw; cube[n++] = db / sw;
    }
    return cube;
  }
  /* an image's pixels, read once and kept */
  function pixels(image) {
    var c = document.createElement("canvas");
    c.width = image.naturalWidth || image.width; c.height = image.naturalHeight || image.height;
    var x = c.getContext("2d", { willReadFrequently: true });
    x.drawImage(image, 0, 0);
    return x.getImageData(0, 0, c.width, c.height);
  }
  /* The censor's and publisher's seals are a faded red very close to the
     ochre of the ground, so they are protected by where they are instead:
     red pixels inside this box of the scene keep their colour. */
  var SEALS = [965, 335, 1035, 445];
  function reprint(src, cube, seals) {
    var out = new ImageData(src.width, src.height), s = src.data, d = out.data, w = src.width;
    for (var i = 0; i < s.length; i += 4) {
      var a = s[i + 3];
      if (!a) continue;
      if (seals && s[i] - s[i + 2] > 50 && s[i] - s[i + 1] > 25) {
        var px = (i >> 2) % w, py = ((i >> 2) / w) | 0;
        if (px > seals[0] && px < seals[2] && py > seals[1] && py < seals[3]) {
          d[i] = s[i]; d[i + 1] = s[i + 1]; d[i + 2] = s[i + 2]; d[i + 3] = a; continue;
        }
      }
      var j = (((s[i] >> 3) << 10) | ((s[i + 1] >> 3) << 5) | (s[i + 2] >> 3)) * 3;
      d[i] = s[i] + cube[j]; d[i + 1] = s[i + 1] + cube[j + 1]; d[i + 2] = s[i + 2] + cube[j + 2]; d[i + 3] = a;
    }
    return out;
  }
  function loadImage(src) {
    return new Promise(function (ok) { var im = new Image(); im.onload = function () { ok(im); }; im.onerror = function () { ok(null); }; im.src = src; });
  }
  /* let the page draw a frame; a message, not a timer, because browsers slow timers down */
  function breathe() {
    return new Promise(function (ok) {
      if (!global.MessageChannel) return ok();
      var ch = new MessageChannel(); ch.port1.onmessage = function () { ok(); }; ch.port2.postMessage(0);
    });
  }

  function mount(hero, opts) {
    opts = opts || {};
    var base   = (opts.base || "") + "assets/img/art/yoro/";
    var frame  = hero.querySelector("[data-frame]");
    var canvas = hero.querySelector("[data-fall]");
    var type   = hero.querySelector("[data-type]");
    var reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    var live   = !reduce && canvas && canvas.getContext;

    /* ---- the printed layers, for recolouring ----
       Each <img> gets a <canvas> twin the first time a palette is asked for.
       The twin carries the reprinted pixels and takes the image's place; the
       print's own inks are just the images shown again. */
    var prints = Array.prototype.map.call(hero.querySelectorAll(".yoro-scene, .yoro-leaf"), function (el) {
      return { el: el, src: el.getAttribute("src") };
    });
    function show(p, twin) {
      if (p.cv) p.cv.style.display = twin ? "" : "none";
      p.el.style.display = twin ? "none" : "";
    }
    var job = 0;
    function recolour(colors) {
      var mine = ++job;
      if (!colors) {                              // back to the print's own inks
        prints.forEach(function (p) { show(p, false); });
        TILES.forEach(function (t) { if (t.orig) t.img = t.orig; });
        return Promise.resolve(null);
      }
      var target = inksFor(colors), cube = cubeFor(target), fresh = [], tiles = [];
      var chain = Promise.resolve();
      prints.forEach(function (p, i) {
        chain = chain.then(function () { return p.data || loadImage(p.src).then(function (im) { return im && (p.data = pixels(im)); }); })
          .then(function (data) { if (data && mine === job) fresh[i] = reprint(data, cube, i === 0 && data.width === 1924 ? SEALS : null); return i % 8 === 0 ? breathe() : null; });
      });
      TILES.forEach(function (t, i) {
        chain = chain.then(function () {
          if (mine === job && t.orig && t.orig.naturalWidth) tiles[i] = reprint(t.data || (t.data = pixels(t.orig)), cube);
          return breathe();
        });
      });
      // nothing is shown until every piece is printed, so the picture changes in one go
      return chain.then(function () {
        if (mine !== job) return null;
        prints.forEach(function (p, i) {
          if (!fresh[i]) return;
          if (!p.cv) {
            p.cv = document.createElement("canvas");
            p.cv.className = p.el.className; p.cv.style.cssText = p.el.style.cssText;
            p.cv.width = fresh[i].width; p.cv.height = fresh[i].height;
            p.el.parentNode.insertBefore(p.cv, p.el.nextSibling);
          }
          p.cv.getContext("2d").putImageData(fresh[i], 0, 0);
          show(p, true);
        });
        TILES.forEach(function (t, i) {
          if (!tiles[i]) return;
          if (!t.cv) { t.cv = document.createElement("canvas"); t.cv.width = tiles[i].width; t.cv.height = tiles[i].height; }
          t.cv.getContext("2d").putImageData(tiles[i], 0, 0);
          t.img = t.cv;
        });
        return target;
      });
    }
    /* the page's own two colours, taken from the same inks and pushed until they read */
    function pageInks(target, paper, cream) {
      var ink = target ? target[5] : hex("#173f5f"), sky = target ? target[4] : hex("#24506a");
      for (var a = 0; a < 24 && contrast(ink, paper) < 7; a++) ink = toward(ink, [8, 12, 18], 0.14);
      for (var b = 0; b < 24 && contrast(sky, cream) < 5; b++) sky = toward(sky, [8, 12, 18], 0.12);
      return { ink: toHex(ink), sky: toHex(sky) };
    }

    if (!live) return { pause: noop, play: noop, recolour: recolour, pageInks: pageInks, inksFor: inksFor };

    /* ---- the water ---- */
    var ctx = canvas.getContext("2d");
    var paper = new Image(), mask = new Image();
    var waiting = TILES.length + 2, ready = false;
    function landed() { if (--waiting === 0) { ready = true; canvas.classList.add("is-live"); kick(); } }
    paper.onload = mask.onload = landed;
    paper.src = base + "02-fall-paper.png";
    mask.src  = base + "05-fall-mask.png";
    TILES.forEach(function (t, i) {
      t.orig = new Image(); t.img = t.orig; t.orig.onload = landed; t.orig.src = base + t.file;
      t.off = (i * 377) % t.h;                       // start each set somewhere different
    });

    function size() {
      var dpr = Math.min(2, global.devicePixelRatio || 1) * 1.2;   // headroom for the push-in
      var w = Math.max(1, Math.round(canvas.clientWidth * dpr));
      var h = Math.max(1, Math.round(canvas.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    }

    function water(dt, speed) {
      var W = canvas.width, H = canvas.height, k = H / BOX_H;
      ctx.globalCompositeOperation = "source-over";
      ctx.clearRect(0, 0, W, H);
      ctx.drawImage(paper, 0, 0, W, H);
      for (var i = 0; i < TILES.length; i++) {
        var t = TILES[i];
        t.off = (t.off + t.v * speed * dt) % t.h;
        var th = t.h * k;
        for (var y = t.off * k - th; y < H; y += th) ctx.drawImage(t.img, 0, y, W, th + 0.5);
      }
      ctx.globalCompositeOperation = "destination-in";
      ctx.drawImage(mask, 0, 0, W, H);
    }

    var t = 0;                                  // 0 at rest, 1 one screen down
    var look = { x: 0, y: 0, tx: 0, ty: 0 };
    var raf = 0, last = 0, paused = false;
    var rate = 1;

    function camera() {
      var w = hero.clientWidth, h = hero.clientHeight;
      look.x += (look.tx - look.x) * 0.07;
      look.y += (look.ty - look.y) * 0.07;
      var px = -look.x * w * 0.006, py = -look.y * h * 0.006;
      frame.style.transform =
        "translate3d(" + px.toFixed(2) + "px," + (py - t * h * 0.035).toFixed(2) + "px,0) " +
        "scale(" + (1.02 + t * 0.17).toFixed(4) + ")";
      if (type) {
        type.style.transform = "translate3d(" + (-px * 1.4).toFixed(2) + "px," +
          (-py * 1.4 - t * h * 0.2).toFixed(2) + "px,0)";
        type.style.opacity = String(Math.max(0, 1 - t * 1.25));
      }
    }
    function tick(now) {
      raf = 0;
      var dt = Math.min(0.05, (now - (last || now)) / 1000);
      last = now;
      camera();
      if (ready) water(dt, 1 + t * 1.9);
      if (!paused) kick();
    }
    function kick() { if (!raf && !paused) raf = requestAnimationFrame(tick); }

    global.addEventListener("scroll", function () {
      t = Math.min(1, Math.max(0, global.scrollY / Math.max(1, global.innerHeight)));
      var r = 1 + t * 0.9;                       // the trees and the spray pick up too
      if (Math.abs(r - rate) > 0.04 && hero.getAnimations) {
        rate = r;
        var movers = hero.querySelectorAll(".yoro-leaf, .yoro-spray, .yoro-mist");
        for (var i = 0; i < movers.length; i++)
          movers[i].getAnimations().forEach(function (a) { a.playbackRate = r; });
      }
    }, { passive: true });
    global.addEventListener("resize", size);

    if (matchMedia("(pointer: fine)").matches) {
      hero.addEventListener("pointermove", function (e) {
        var r = hero.getBoundingClientRect();
        look.tx = ((e.clientX - r.left) / r.width - 0.5) * 2;
        look.ty = ((e.clientY - r.top) / r.height - 0.5) * 2;
      }, { passive: true });
      hero.addEventListener("pointerleave", function () { look.tx = 0; look.ty = 0; });
    }

    function pause() { paused = true; cancelAnimationFrame(raf); raf = 0; hero.classList.add("is-paused"); }
    function play()  { paused = false; last = 0; hero.classList.remove("is-paused"); kick(); }
    if (global.IntersectionObserver) {
      new IntersectionObserver(function (es) {
        es.forEach(function (e) { e.isIntersecting ? play() : pause(); });
      }, { threshold: 0 }).observe(hero);
    }
    document.addEventListener("visibilitychange", function () { last = 0; });

    t = Math.min(1, global.scrollY / Math.max(1, global.innerHeight));
    size();
    kick();
    return { pause: pause, play: play, recolour: recolour, pageInks: pageInks, inksFor: inksFor };
  }
  function noop() {}

  global.BRMYoro = { mount: mount };
})(window);
