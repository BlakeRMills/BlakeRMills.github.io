/* Homepage palette engine.

   Reads the real {MetBrewer} / {MoMAColors} data and rewrites the custom
   properties site.css already uses, so the whole page — including the shared
   header and footer — takes its colours from one of Blake's own palettes.
   Scrolling hands off to a different palette per section.

   The page ships fully styled from css/home.css, so if this never runs,
   nothing is missing: you just don't get the recolour. */

(function () {
  "use strict";

  var root = document.documentElement;
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var strip    = document.querySelector("[data-swatches]");
  var nameEl   = document.querySelector("[data-pal-name]");
  var countEl  = document.querySelector("[data-pal-count]");
  var badgeEl  = document.querySelector("[data-pal-badge]");
  var shuffleEl= document.querySelector("[data-shuffle]");
  var sections = [].slice.call(document.querySelectorAll("[data-pal-slot]"));
  var cards    = [].slice.call(document.querySelectorAll("[data-chips]"));

  var DATA = null, pool = [], slots = [];

  /* ---- colour maths ---------------------------------------------------- */

  function lum(hex) {
    var n = parseInt(hex.slice(1), 16);
    var c = [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255].map(function (v) {
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  function ratio(a, b) {
    var x = lum(a), y = lum(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  }
  function mix(hex, alpha) {
    var n = parseInt(hex.slice(1), 16);
    return "rgba(" + (n >> 16 & 255) + "," + (n >> 8 & 255) + "," + (n & 255) + "," + alpha + ")";
  }
  function rgbOf(hex) {
    var n = parseInt(hex.slice(1), 16);
    return [n >> 16 & 255, n >> 8 & 255, n & 255];
  }
  function toHex(r, g, b) {
    return "#" + [r, g, b].map(function (v) {
      return ("0" + Math.round(Math.max(0, Math.min(255, v))).toString(16)).slice(-2);
    }).join("");
  }
  function blend(a, b, t) {
    var x = rgbOf(a), y = rgbOf(b);
    return toHex(x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t);
  }

  /* Some palettes are all mid-tones, and a mid-tone ground can't carry text at
     4.5:1 in either direction. Nudge the ground toward white or black — keeping
     its hue — until near-black or near-white can sit on it legibly. */
  function groundFor(paper, light) {
    var target = light ? "#14181c" : "#fff8ef";
    var p = paper;
    for (var i = 0; i < 24 && ratio(p, target) < 4.6; i++) {
      p = blend(p, light ? "#ffffff" : "#000000", 0.06);
    }
    return p;
  }

  /* --text-soft is the text colour at reduced alpha, which quietly drops it
     below 4.5:1 on most palettes. Solve for the strongest alpha that still
     reads as "soft" while clearing the threshold. */
  function softAlpha(paper, text, minRatio) {
    var Lp = lum(paper), Lt = lum(text);
    if (Lt === Lp) return 1;
    var need = Lt < Lp
      ? (Lp + 0.05) / minRatio - 0.05       // dark text on a light ground
      : minRatio * (Lp + 0.05) - 0.05;      // light text on a dark ground
    var a = (need - Lp) / (Lt - Lp);
    if (!isFinite(a)) return 1;
    return Math.max(0.62, Math.min(1, a));
  }

  /* Build a scheme from a palette. `light` flips which end is the ground.
     Body text must clear 4.5:1 and the accent 3:1; if the palette can't
     manage it we fall back to near-black or near-white rather than ship
     something unreadable. */
  function scheme(colors, light) {
    var sorted = colors.slice().sort(function (a, b) { return lum(a) - lum(b); });
    var paper = groundFor(light ? sorted[sorted.length - 1] : sorted[0], light);

    var text = light ? sorted[0] : sorted[sorted.length - 1];
    if (ratio(paper, text) < 4.5) text = light ? "#14181c" : "#fff8ef";

    var accent = null, best = 0;
    for (var i = 0; i < sorted.length; i++) {
      var c = sorted[i];
      if (c === paper || c === text) continue;
      var k = ratio(paper, c);
      if (k >= 3 && k > best) { best = k; accent = c; }
    }
    if (!accent) accent = text;

    // two steps off the ground, for cards and wells
    var surface = light ? sorted[sorted.length - 2] || paper : sorted[1] || paper;
    var surfaceAlt = light ? sorted[sorted.length - 3] || surface : sorted[2] || surface;

    return { paper: paper, text: text, accent: accent, surface: surface,
             surfaceAlt: surfaceAlt, light: !!light,
             soft: softAlpha(paper, text, 4.5) };
  }

  function apply(p, light) {
    var s = scheme(p.colors, light);
    var st = root.style;
    st.setProperty("--paper", s.paper);
    st.setProperty("--surface", s.surface);
    st.setProperty("--surface-alt", s.surfaceAlt);
    st.setProperty("--text", s.text);
    st.setProperty("--text-soft", mix(s.text, s.soft));
    st.setProperty("--line", mix(s.text, 0.24));
    st.setProperty("--accent", s.accent);
    st.setProperty("--accent-text", s.accent);
    st.setProperty("--footer-bg", s.light ? mix(s.text, 0.08) : s.surface);
    st.setProperty("--footer-text", s.text);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", s.paper);
    paintStrip(p, s);
  }

  function paintStrip(p, s) {
    if (!strip) return;
    strip.innerHTML = "";
    p.colors.forEach(function (c) {
      var b = document.createElement("button");
      b.type = "button";
      b.style.background = c;
      b.title = "Copy " + c;
      b.setAttribute("aria-label", "Copy " + c);
      var tag = document.createElement("b");
      tag.textContent = c.toUpperCase();
      tag.style.color = lum(c) > 0.45 ? "#14181c" : "#fff";
      b.appendChild(tag);
      b.addEventListener("click", function () {
        if (window.brmCopy) window.brmCopy(c);
      });
      strip.appendChild(b);
    });
    if (nameEl)  nameEl.textContent  = p.pkg + " · " + p.name;
    if (countEl) countEl.textContent = p.colors.length + " colours" + (p.colorblind ? " · colourblind friendly" : "");
    if (badgeEl) badgeEl.textContent = p.pkg + " · " + p.name;
  }

  /* ---- data ------------------------------------------------------------ */

  function paletteColors(pkg, name) {
    var p = DATA && DATA[pkg] && DATA[pkg][name];
    return p ? p.colors : null;
  }

  function paintChips() {
    cards.forEach(function (el) {
      var ref = el.getAttribute("data-chips").split("/");
      var colors = paletteColors(ref[0], ref[1]);
      if (!colors) return;
      el.innerHTML = colors.map(function (c) {
        return '<i style="background:' + c + '"></i>';
      }).join("");
    });
  }

  /* The theme toggle decides whether the page starts on a dark or a pale
     ground; sections alternate from there. */
  function startsLight() {
    var t = root.getAttribute("data-theme");
    if (t === "light") return true;
    if (t === "dark") return false;
    return !window.matchMedia("(prefers-color-scheme: dark)").matches;
  }

  function pickSlots() {
    var safe = pool.filter(function (p) { return p.colorblind; });
    var from = safe.length >= 4 ? safe : pool;
    var shuffled = from.slice().sort(function () { return Math.random() - 0.5; });
    return shuffled.slice(0, Math.max(4, sections.length));
  }

  fetch("assets/data/palettes.json")
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (d) {
      if (!d) return;
      DATA = d;
      Object.keys(d).forEach(function (pkg) {
        Object.keys(d[pkg]).forEach(function (name) {
          var p = d[pkg][name];
          if (p.colors.length >= 6) {
            pool.push({ pkg: pkg, name: name, colors: p.colors, colorblind: p.colorblind });
          }
        });
      });
      if (!pool.length) return;

      // keep the same set when coming back from a subpage
      var saved = null;
      try { saved = JSON.parse(sessionStorage.getItem("brm-home-pal") || "null"); } catch (e) {}
      if (saved && saved.length) {
        slots = saved.map(function (k) {
          var hit = pool.filter(function (p) { return p.pkg === k[0] && p.name === k[1]; })[0];
          return hit || pool[0];
        });
      } else {
        slots = pickSlots();
        save();
      }

      paintChips();
      apply(slots[0], startsLight());
      // only now allow the crossfade, so the first palette lands instantly
      // instead of fading out of the defaults
      requestAnimationFrame(function () {
        requestAnimationFrame(function () { document.body.classList.add("is-ready"); });
      });
      observe();
    })
    .catch(function () {
      /* the baked-in palette stands; still enable transitions so the theme
         toggle and hover states animate normally */
      document.body.classList.add("is-ready");
    });

  function save() {
    try {
      sessionStorage.setItem("brm-home-pal",
        JSON.stringify(slots.map(function (p) { return [p.pkg, p.name]; })));
    } catch (e) {}
  }

  function polarityFor(i) { return startsLight() ? i % 2 === 0 : i % 2 === 1; }

  function observe() {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting) return;
        var i = +e.target.getAttribute("data-pal-slot");
        apply(slots[i] || slots[0], polarityFor(i));
      });
    }, { threshold: 0.4 });
    sections.forEach(function (s) { io.observe(s); });
  }

  /* Reveal-on-scroll, with a sweep for anything already on screen —
     IntersectionObserver can miss elements while webfonts are still loading
     and then never fire again. */
  (function reveals() {
    var els = [].slice.call(document.querySelectorAll(".home-reveal"));
    if (!els.length) return;
    var show = function (el) { el.classList.add("is-in"); };
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { show(e.target); io.unobserve(e.target); } });
    }, { threshold: 0.15 });
    els.forEach(function (el) { io.observe(el); });
    var sweep = function () {
      els.forEach(function (el) {
        var r = el.getBoundingClientRect();
        if (r.top < window.innerHeight * 0.95 && r.bottom > 0) show(el);
      });
    };
    sweep();
    window.addEventListener("load", sweep, { once: true });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(sweep);
  })();

  if (shuffleEl) {
    shuffleEl.addEventListener("click", function () {
      if (!pool.length) return;
      // reroll whichever section is currently filling the view
      var i = 0;
      for (var k = 0; k < sections.length; k++) {
        var r = sections[k].getBoundingClientRect();
        if (r.top < window.innerHeight * 0.55 && r.bottom > window.innerHeight * 0.45) { i = k; break; }
      }
      var safe = pool.filter(function (p) { return p.colorblind; });
      var from = safe.length ? safe : pool;
      slots[i] = from[Math.floor(Math.random() * from.length)];
      save();
      apply(slots[i], polarityFor(i));
    });
  }

  // the theme toggle flips which end of each palette is the ground
  new MutationObserver(function () {
    if (slots.length) {
      var i = 0;
      for (var k = 0; k < sections.length; k++) {
        var r = sections[k].getBoundingClientRect();
        if (r.top < window.innerHeight * 0.55 && r.bottom > window.innerHeight * 0.45) { i = k; break; }
      }
      apply(slots[i] || slots[0], polarityFor(i));
    }
  }).observe(root, { attributes: true, attributeFilter: ["data-theme"] });
})();
