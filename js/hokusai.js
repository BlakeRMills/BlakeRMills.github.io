/* Hokusai — a woodblock waterfall, composited from drawn layers.
 *
 * This used to draw the whole print with canvas primitives. It now loads
 * thirteen PNGs out of assets/img/art/hokusai/ and composites them, which is
 * the swap that lets the artwork be *drawn* rather than described in code:
 * replace a PNG with your own and nothing in here has to change.
 *
 * What stays code is only the motion — reading scroll and pointer, moving the
 * layers against each other, and running the water. The water is one tile
 * repeated down a tapering column, so it loops forever off a single 29 KB image.
 *
 * Every full-frame layer is 2000x1250 and shares one coordinate system, so the
 * set opens as a single stacked document. tools/hokusai-layers.html regenerates
 * them; assets/img/art/hokusai/README.md documents each one.
 *
 * The scene owns the canvas and nothing else. Typography is ordinary HTML.
 */
(function (global) {
  "use strict";

  /* The canonical frame every full-frame layer is drawn in. Anything measured
     in frame units below refers to this, not to the viewport. */
  var FW = 2000, FH = 1250;
  var S = {
    fallX:  0.34 * FW,          // 680   centre of the fall
    fallW:  0.175 * FW,         // 350   width at the lip
    fallB:  0.175 * 1.22 * FW,  // 427   width at the base
    top:    0.02 * FH,          // 25
    bottom: 0.74 * FH,          // 925
    horiz:  0.80 * FH           // 1000
  };

  /* Draw order, back to front. `depth` is how much a layer answers to the
     pointer and to the scroll: 0 is nailed to the back wall, 1 is right in
     front of you. The fall, pool, spray and grain are placed by their own
     rules rather than by a depth. */
  var SHEETS = [
    { key: "sky",      file: "01-sky.png",           fit: "cover", depth: 0.00 },
    { key: "cliffL",   file: "02-cliff-left.png",    fit: "cover", depth: 0.26 },
    { key: "cliffR",   file: "03-cliff-right.png",   fit: "cover", depth: 0.30 },
    { key: "outcrop",  file: "04-cliff-outcrop.png", fit: "cover", depth: 0.52 },
    { key: "fall",     file: "05-fall.png",          fit: "column" },
    { key: "crest",    file: "06-fall-crest.png",    fit: "cover", depth: 0.46 },
    { key: "spray",    file: "07-spray.png",         fit: "spray" },
    { key: "mist",     file: "10-mist.png",          fit: "cover", depth: 0.40 },
    { key: "poolFar",  file: "08-pool-far.png",      fit: "band",
      top: 0.798, bottom: 0.905, drift: 0.9 },
    { key: "poolNear", file: "09-pool-near.png",     fit: "band",
      top: 0.878, bottom: 1.080, drift: 2.2 },
    { key: "foliageF", file: "11-foliage-far.png",   fit: "cover", depth: 0.58 },
    { key: "foliageN", file: "12-foliage-near.png",  fit: "cover", depth: 0.92 },
    { key: "grain",    file: "13-grain.png",         fit: "grain" }
  ];

  var OVERSCAN = 1.10;   // headroom so parallax never exposes a layer's edge
  var DESCEND  = 0.34;   // how far the camera falls over one screen of scroll

  function mount(host, opts) {
    opts = opts || {};
    var base = (opts.base || "") + "assets/img/art/hokusai/";

    var canvas = document.createElement("canvas");
    canvas.className = "hok-canvas";
    canvas.setAttribute("aria-hidden", "true");
    host.insertBefore(canvas, host.firstChild);

    var ctx = canvas.getContext("2d");
    var reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    var W = 0, H = 0, dpr = 1;
    var flow = 0, scroll = 0, raf = 0, running = false, paused = false;
    var look = { x: 0, y: 0, tx: 0, ty: 0 };
    var img = {};          // key -> HTMLImageElement, as each one lands
    var grainPat = null;

    function size() {
      dpr = Math.min(2, global.devicePixelRatio || 1);
      var r = host.getBoundingClientRect();
      W = Math.max(1, Math.floor((r.width || global.innerWidth) * dpr));
      H = Math.max(1, Math.floor((r.height || global.innerHeight) * dpr));
      canvas.width = W; canvas.height = H;
      canvas.style.width = "100%"; canvas.style.height = "100%";
      grainPat = null;
    }

    /* The frame mapped onto the viewport, cover-style with overscan. Every
       frame-space coordinate goes through this, so the layers stay registered
       with one another at any aspect ratio.

       It anchors on the waterfall rather than on the frame's own centre. The
       frame is 1.6:1; a phone is nearer 0.46:1, so cover crops about 74% of
       the width away and a centred frame puts the fall off the left edge
       entirely. Anchoring keeps the subject in the window at any shape, and
       the clamp stops the crop ever running past the artwork. */
    function frameBox() {
      var s = Math.max(W / FW, H / FH) * OVERSCAN;
      var anchor = W / H < 0.95 ? 0.46 : 0.34;      // where the fall should sit
      var x = W * anchor - S.fallX * s;
      x = Math.max(Math.min(W - FW * s, 0), Math.min(0, x));
      return { s: s, x: x, y: (H - FH * s) / 2 };
    }
    function FX(f, v) { return f.x + v * f.s; }
    function FY(f, v) { return f.y + v * f.s; }

    /* ---- the layers ---- */

    function drawCover(sheet, f, drop, px, py) {
      var im = img[sheet.key]; if (!im) return;
      var d = sheet.depth;
      ctx.drawImage(im, f.x + px * d, f.y + py * d - drop * d, FW * f.s, FH * f.s);
    }

    /* The waterfall. One tile, repeated down a column that widens as it falls.
       The column is cut into bands: each band takes its slice of the tile and
       is drawn at its own width, which is what gives the taper without the
       tile itself having to taper. Moving the slice origin is the flow — the
       water runs without anything being simulated. */
    function drawColumn(f, t, drop, px, py) {
      var im = img.fall; if (!im) return;
      var d = 0.44;
      var cx     = FX(f, S.fallX) + px * d;
      var top    = FY(f, S.top) - drop * d + py * d;
      var bottom = FY(f, S.bottom + t * 0.10 * FH) - drop * d + py * d;
      var wTop   = S.fallW * f.s, wBot = S.fallB * f.s;
      var colH   = bottom - top; if (colH <= 0) return;

      var scale   = wTop / im.width;         // the tile's natural screen scale
      var tileH   = im.height * scale;
      var bands   = 56;
      var step    = colH / bands;
      var srcStep = step / tileH * im.height;

      for (var i = 0; i < bands; i++) {
        var y0 = top + step * i;
        var hw = (wTop + (wBot - wTop) * (i / bands)) / 2;
        var sy = (step * i / tileH * im.height + flow) % im.height;
        if (sy < 0) sy += im.height;

        var left = srcStep, dy = y0;
        while (left > 0.5) {
          var take = Math.min(left, im.height - sy);
          var dh = take / srcStep * step;
          ctx.drawImage(im, 0, sy, im.width, take, cx - hw, dy, hw * 2, dh + 0.6);
          dy += dh; left -= take; sy = 0;
        }
      }
    }

    /* the burst where it lands, heavier the further you have fallen */
    function drawSpray(f, t, drop, px, py) {
      var im = img.spray; if (!im) return;
      var d = 0.5;
      var cx = FX(f, S.fallX) + px * d;
      var cy = FY(f, S.bottom + t * 0.10 * FH) - drop * d + py * d;
      var w  = S.fallB * f.s * (1.9 + t * 0.6);
      var h  = w * (im.height / im.width);
      ctx.globalAlpha = 0.7 + t * 0.3;
      ctx.drawImage(im, cx - w / 2, cy - h * 0.40, w, h);
      ctx.globalAlpha = 1;
    }

    /* the pool: a sheet that tiles sideways and drifts */
    function drawBand(sheet, f, drop, px, py) {
      var im = img[sheet.key]; if (!im) return;
      var y0 = FY(f, sheet.top * FH) - drop * 0.8 + py * 0.6;
      var y1 = FY(f, sheet.bottom * FH) - drop * 0.8 + py * 0.6;
      var h = y1 - y0; if (h <= 0 || y0 > H) return;
      var w = h * (im.width / im.height);
      var off = (flow * sheet.drift * 0.3 + px * 0.5) % w;
      if (off > 0) off -= w;
      for (var x = off; x < W + w; x += w) ctx.drawImage(im, x, y0, w, h);
    }

    /* the sheet itself: a little tooth over everything, which is the single
       cheapest thing that stops a flat fill looking like a flat fill */
    function drawGrain() {
      var im = img.grain; if (!im) return;
      if (!grainPat) grainPat = ctx.createPattern(im, "repeat");
      if (!grainPat) return;
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = grainPat;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }

    function draw() {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;

      var f = frameBox();
      var t = scroll;
      var drop = t * DESCEND * H;
      var px = look.x * 0.016 * W, py = look.y * 0.012 * H;

      // until the sky lands there is nothing to composite onto
      ctx.fillStyle = "#0a2e57";
      ctx.fillRect(0, 0, W, H);

      for (var i = 0; i < SHEETS.length; i++) {
        var s = SHEETS[i];
        if (s.fit === "cover")       drawCover(s, f, drop, px, py);
        else if (s.fit === "column") drawColumn(f, t, drop, px, py);
        else if (s.fit === "spray")  drawSpray(f, t, drop, px, py);
        else if (s.fit === "band")   drawBand(s, f, drop, px, py);
        else if (s.fit === "grain")  drawGrain();
      }
    }

    /* ---- loading ----
       Progressively, and each image paints the moment it lands. Promise.all is
       the wrong shape here: nothing would draw until the last byte, and one
       failed request would take the whole sky down with it. */
    function load(onFirst) {
      var first = true;
      SHEETS.forEach(function (s) {
        var im = new Image();
        im.decoding = "async";
        im.onload = function () {
          img[s.key] = im;
          if (s.key === "grain") grainPat = null;
          draw();
          if (first) { first = false; if (onFirst) onFirst(); }
        };
        im.onerror = function () { /* one missing layer costs that layer only */ };
        im.src = base + s.file;
      });
    }

    function tick() {
      flow += reduce ? 0 : (0.9 + scroll * 1.7);
      look.x += (look.tx - look.x) * 0.05;
      look.y += (look.ty - look.y) * 0.05;
      draw();
      raf = requestAnimationFrame(tick);
    }
    function start() {
      if (running || paused) return;
      running = true;
      if (reduce) draw(); else raf = requestAnimationFrame(tick);
    }
    function stop() { running = false; cancelAnimationFrame(raf); }
    function pause() { paused = true; stop(); draw(); }
    function play() { paused = false; start(); }

    if (!reduce) {
      global.addEventListener("pointermove", function (e) {
        var r = host.getBoundingClientRect();
        look.tx = ((e.clientX - r.left) / r.width - 0.5) * 2;
        look.ty = ((e.clientY - r.top) / r.height - 0.5) * 2;
      }, { passive: true });
      global.addEventListener("pointerleave", function () { look.tx = 0; look.ty = 0; });
    }
    var queued = false;
    global.addEventListener("scroll", function () {
      if (queued) return;
      queued = true;
      requestAnimationFrame(function () {
        scroll = Math.min(1, global.scrollY / Math.max(1, global.innerHeight));
        if (!running) draw();
        queued = false;
      });
    }, { passive: true });
    global.addEventListener("resize", function () { size(); draw(); });
    if (global.IntersectionObserver) {
      new IntersectionObserver(function (es) {
        es.forEach(function (e) { e.isIntersecting ? start() : stop(); });
      }, { threshold: 0 }).observe(host);
    }

    size();
    draw();
    load(function () { host.classList.add("is-ready"); });
    start();

    return { start: start, stop: stop, pause: pause, play: play };
  }

  global.BRMHokusai = { mount: mount };
})(window);
