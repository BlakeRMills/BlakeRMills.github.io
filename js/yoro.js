/* Yoro — the motion for the layered waterfall.
 *
 * The picture is images; see css/yoro.css. The trees, the mist and the spray
 * move on CSS animations. This file does three things:
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
 *
 * Until every water layer has arrived, and for anyone who has asked for less
 * motion, the canvas stays empty and the print's own water shows through.
 */
(function (global) {
  "use strict";

  /* From tools/yoro-layers.py. Tile heights and speeds are in frame pixels
     (the picture is 1924 wide, the water box 308 x 476); speeds per second. */
  var BOX_W = 308, BOX_H = 476;
  var TILES = [
    { file: "03-fall-sheets-a.png",  h: 1180, v: 158 },
    { file: "03-fall-sheets-b.png",  h: 1420, v: 186 },
    { file: "03-fall-sheets-c.png",  h: 1660, v: 221 },
    { file: "04-fall-threads-a.png", h: 900,  v: 300 },
    { file: "04-fall-threads-b.png", h: 1120, v: 372 }
  ];

  function mount(hero, opts) {
    opts = opts || {};
    var base   = (opts.base || "") + "assets/img/art/yoro/";
    var frame  = hero.querySelector("[data-frame]");
    var canvas = hero.querySelector("[data-fall]");
    var type   = hero.querySelector("[data-type]");
    var reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || !canvas || !canvas.getContext) return { pause: noop, play: noop };

    var ctx = canvas.getContext("2d");
    var paper = new Image(), mask = new Image();
    var waiting = TILES.length + 2, ready = false;
    function landed() { if (--waiting === 0) { ready = true; canvas.classList.add("is-live"); kick(); } }
    paper.onload = mask.onload = landed;
    paper.src = base + "02-fall-paper.png";
    mask.src  = base + "05-fall-mask.png";
    TILES.forEach(function (t, i) {
      t.img = new Image(); t.img.onload = landed; t.img.src = base + t.file;
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
    var movers = hero.querySelectorAll(".yoro-leaf, .yoro-spray, .yoro-mist");
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
      if (Math.abs(r - rate) > 0.04 && movers[0] && movers[0].getAnimations) {
        rate = r;
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
    return { pause: pause, play: play };
  }
  function noop() {}

  global.BRMYoro = { mount: mount };
})(window);
