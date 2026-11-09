/* Yoro — the motion for the six-layer waterfall.
 *
 * The picture and the water are images and CSS; see css/yoro.css. The water
 * runs on its own from a CSS animation, so it moves while the page is still
 * and would keep moving if this file never loaded. What this adds:
 *
 *   - holds the moving water back until all of its layers have arrived, so
 *     the fall never shows as a half-built patch over the print
 *   - scroll: the camera pushes in on the foot of the fall and the water and
 *     spray run faster the further you go
 *   - pointer: the picture leans a few pixels, the lettering leans the other way
 *   - stops the animations when the hero is off screen
 */
(function (global) {
  "use strict";

  var LAYERS = ["02-fall-paper.png", "03-fall-sheets.png",
                "04-fall-threads.png", "05-fall-mask.png"];

  function mount(hero, opts) {
    opts = opts || {};
    var base  = (opts.base || "") + "assets/img/art/yoro/";
    var frame = hero.querySelector("[data-frame]");
    var fall  = hero.querySelector("[data-fall]");
    var type  = hero.querySelector("[data-type]");
    var water = hero.querySelectorAll(".yoro-run");
    var spray = hero.querySelectorAll(".yoro-spray");
    var reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

    /* the water goes live only when every piece of it is in */
    var waiting = LAYERS.length;
    LAYERS.forEach(function (file) {
      var im = new Image();
      im.onload = function () { if (--waiting === 0) fall.classList.add("is-live"); };
      im.src = base + file;
    });

    if (reduce) return { pause: noop, play: noop };

    function setRate(nodes, r) {
      for (var i = 0; i < nodes.length; i++) {
        if (!nodes[i].getAnimations) return;
        nodes[i].getAnimations().forEach(function (a) { a.playbackRate = r; });
      }
    }

    var t = 0;                                  // 0 at rest, 1 one screen down
    var look = { x: 0, y: 0, tx: 0, ty: 0 };
    var raf = 0;

    function paint() {
      var w = hero.clientWidth, h = hero.clientHeight;
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
    function tick() {
      raf = 0;
      look.x += (look.tx - look.x) * 0.07;
      look.y += (look.ty - look.y) * 0.07;
      paint();
      if (Math.abs(look.tx - look.x) + Math.abs(look.ty - look.y) > 0.002) kick();
    }
    function kick() { if (!raf) raf = requestAnimationFrame(tick); }

    global.addEventListener("scroll", function () {
      t = Math.min(1, Math.max(0, global.scrollY / Math.max(1, global.innerHeight)));
      setRate(water, 1 + t * 1.9);
      setRate(spray, 1 + t * 0.9);
      kick();
    }, { passive: true });

    if (matchMedia("(pointer: fine)").matches) {
      hero.addEventListener("pointermove", function (e) {
        var r = hero.getBoundingClientRect();
        look.tx = ((e.clientX - r.left) / r.width - 0.5) * 2;
        look.ty = ((e.clientY - r.top) / r.height - 0.5) * 2;
        kick();
      }, { passive: true });
      hero.addEventListener("pointerleave", function () { look.tx = 0; look.ty = 0; kick(); });
    }

    function pause() { hero.classList.add("is-paused"); }
    function play()  { hero.classList.remove("is-paused"); }
    if (global.IntersectionObserver) {
      new IntersectionObserver(function (es) {
        es.forEach(function (e) { e.isIntersecting ? play() : pause(); });
      }, { threshold: 0 }).observe(hero);
    }

    t = Math.min(1, global.scrollY / Math.max(1, global.innerHeight));
    paint();
    return { pause: pause, play: play };
  }
  function noop() {}

  global.BRMYoro = { mount: mount };
})(window);
