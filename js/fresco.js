/* Baroque ceiling fresco — an animated WebGL scene for the homepage hero.
 *
 * Earlier versions cut fragments out of whole paintings and faked each cloud's
 * silhouette with a blurred irregular blob, because a rectangle of canvas has
 * no edge of its own. That blob was the single worst thing in the pipeline: it
 * decided the shape, it softened everything, and it put most of the paint
 * somewhere other than where the cloud appeared to be.
 *
 * These assets are individual formations with a real alpha channel, keyed off
 * the flat backdrop they were painted on. So there is no masking stage at all
 * now, and no palette remapping either — they already carry their own light and
 * their own colour. The shader's job shrank to what shaders are good at:
 * displacing each layer a little so it breathes, warming the side the sun is
 * on, and sinking the distant ones toward the sky.
 *
 * The scene owns the canvas and nothing else. Typography is ordinary HTML.
 */
(function (global) {
  "use strict";

  var SKY = {
    powder: [0.510, 0.584, 0.678],   // #8295AD
    slate:  [0.392, 0.482, 0.588],   // #647B96
    shadow: [0.467, 0.471, 0.529],   // #777887
    cream:  [0.910, 0.804, 0.627]    // #E8CDA0
  };

  /* Which formations to pull in. Only the ones the composition references, so
     the page does not pay for twenty requests to draw sixteen clouds. */
  var ASSETS = [
    "cloud-01","cloud-02","cloud-03","cloud-04","cloud-05","cloud-06","cloud-07",
    "cloud-08","cloud-09","cloud-10","cloud-11","cloud-12","cloud-13","cloud-14",
    "cloud-15","cloud-16","cloud-17","cloud-18","cloud-19","cloud-20","cloud-21"
  ];

  /* The arrangement. Positions are the centre of each formation in viewport
     fractions and may sit outside it; w is its width as a fraction of the
     viewport width.

     Widths are small and the count is high, and that is the point. These cut to
     between 384 and 869 pixels across — that is all the resolution the sheets
     hold — so a formation drawn at half the viewport width is being enlarged
     two or three times on a retina screen, and no amount of shader work makes
     that sharp again. Filling the frame with more, smaller clouds keeps each
     one near its own scale. The one exception is the first asset, which came
     off its own sheet at 1536 wide and can carry the big near mass.

       i  asset     d  depth, 0 far and 1 near
       a  opacity   b  how far the shader displaces it                      */
  var CLOUDS = [
    /* Denser than it looks like it needs to be on paper. The first arrangement
       left a wide flat field of blue through the upper left and middle, because
       a single ring of formations around an opening leaves everything between
       the ring and the opening empty. So there are three passes here: a thin
       scatter of high wisps across the whole frame including over the opening,
       which stops the sky reading as flat colour; a thickened middle distance;
       and a bank pulled in closer than before.

       The centre is kept to faint far wisps only — anything heavier there
       competes with the name. */

    // high scatter, faint, everywhere
    { i:19, x:.34, y:.26, w:.30, rot: .10, d:.05, a:.20, b:.010 },
    { i:16, x:.72, y:.44, w:.28, rot:-.14, d:.06, a:.20, b:.010 },
    { i:18, x:.22, y:.12, w:.28, rot: .22, d:.08, a:0.65, b:.010 },
    { i:15, x:.56, y:.07, w:.26, rot:-.08, d:.09, a:0.68, b:.009 },
    { i:17, x:.81, y:.31, w:.28, rot: .16, d:.10, a:0.68, b:.009 },
    { i:20, x:.12, y:.42, w:.22, rot:-.30, d:.11, a:0.65, b:.009 },
    { i:14, x:.30, y:.63, w:.28, rot: .06, d:.12, a:0.65, b:.009 },
    { i:13, x:.63, y:.80, w:.30, rot:-.18, d:.13, a:0.68, b:.009 },
    { i:12, x:.89, y:.62, w:.26, rot: .34, d:.14, a:0.68, b:.008 },
    { i:11, x:.08, y:.72, w:.28, rot:-.26, d:.15, a:0.68, b:.008 },
    { i:10, x:.46, y:.16, w:.28, rot: .44, d:.16, a:0.62, b:.008 },

    // a second scatter into the gaps the first pass left
    { i:12, x:.20, y:.55, w:.26, rot: .28, d:.17, a:.56, b:.008 },
    { i:18, x:.36, y:.80, w:.28, rot:-.34, d:.18, a:.56, b:.008 },
    { i:14, x:.76, y:.55, w:.26, rot: .50, d:.19, a:.54, b:.008 },
    { i:16, x:.50, y:.14, w:.26, rot:-.56, d:.20, a:.24, b:.008 },
    { i:20, x:.15, y:.29, w:.22, rot: .66, d:.21, a:.58, b:.008 },
    { i:13, x:.62, y:.74, w:.26, rot:-.22, d:.22, a:.24, b:.008 },

    // middle distance, thickened
    { i:10, x:.06, y:.18, w:.30, rot: .12, d:.24, a:.78, b:.008 },
    { i:11, x:.33, y:.03, w:.28, rot:-.10, d:.26, a:.80, b:.007 },
    { i:12, x:.63, y:.02, w:.28, rot: .18, d:.27, a:.80, b:.007 },
    { i:13, x:.90, y:.12, w:.30, rot:-.22, d:.29, a:.80, b:.007 },
    { i:14, x:1.00, y:.39, w:.28, rot: .30, d:.31, a:.80, b:.007 },
    { i:15, x:.96, y:.70, w:.30, rot:-.12, d:.33, a:.82, b:.007 },
    { i:16, x:.73, y:.95, w:.28, rot: .08, d:.35, a:.82, b:.006 },
    { i:17, x:.42, y:1.00, w:.30, rot:-.28, d:.36, a:.82, b:.006 },
    { i:18, x:.14, y:.92, w:.28, rot: .24, d:.37, a:.82, b:.006 },
    { i:19, x:-.02, y:.53, w:.28, rot:-.40, d:.38, a:.82, b:.006 },
    { i:20, x:.25, y:.26, w:.22, rot: .54, d:.28, a:.70, b:.007 },
    { i:11, x:.80, y:.19, w:.26, rot:-.62, d:.30, a:.72, b:.007 },

    // the bank, pulled in
    { i: 2, x:.10, y:.05, w:.30, rot: .08, d:.44, a:.90, b:.006 },
    { i: 5, x:.38, y:-.05, w:.28, rot:-.12, d:.46, a:.91, b:.006 },
    { i: 8, x:.67, y:-.03, w:.28, rot: .14, d:.48, a:.91, b:.006 },
    { i: 4, x:.98, y:.22, w:.28, rot: .20, d:.52, a:.92, b:.005 },
    { i: 3, x:1.02, y:.53, w:.30, rot:-.16, d:.55, a:.92, b:.005 },
    { i: 9, x:.90, y:.85, w:.30, rot: .11, d:.58, a:.93, b:.005 },
    { i: 7, x:.58, y:1.02, w:.28, rot:-.07, d:.60, a:.93, b:.005 },
    { i: 6, x:.27, y:1.00, w:.28, rot: .19, d:.62, a:.93, b:.005 },
    { i: 4, x:.02, y:.78, w:.30, rot:-.52, d:.64, a:.93, b:.005 },
    { i: 2, x:-.03, y:.34, w:.28, rot: .72, d:.56, a:.92, b:.005 },

    // near shoulders
    { i: 1, x:.81, y:.97, w:.32, rot: .15, d:.72, a:.95, b:.004 },
    { i: 3, x:.15, y:.95, w:.30, rot:-.11, d:.76, a:.95, b:.004 },
    { i: 9, x:.99, y:.04, w:.28, rot: .40, d:.70, a:.94, b:.004 },
    { i: 0, x:.46, y:1.05, w:.60, rot:-.02, d:.90, a:.97, b:.003 }
  ];

  /* ------------------------------------------------------------------ glsl */
  var NOISE = [
    "float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }",
    "float vnoise(vec2 p){",
    "  vec2 i = floor(p), f = fract(p);",
    "  vec2 u = f * f * (3.0 - 2.0 * f);",
    "  return mix(mix(hash(i), hash(i + vec2(1,0)), u.x),",
    "             mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), u.x), u.y);",
    "}",
    "float fbm(vec2 p){",
    "  float v = 0.0, a = 0.5;",
    "  for (int i = 0; i < 3; i++){ v += a * vnoise(p); p *= 2.03; a *= 0.5; }",
    "  return v;",
    "}"
  ].join("\n");

  var SKY_VS = "attribute vec2 aPos; void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }";

  /* The sky is painted rather than graded. A clean radial reads as a spotlight,
     so the opening's boundary is pushed around by a noise field and its centre
     sits off to one side. It is also the darkest part of the frame, which is
     both how the bank around it reads as lit and the only way ivory type
     survives in the middle of a pale sky. */
  var SKY_FS = [
    "precision mediump float;",
    "uniform vec2 uRes; uniform float uTime; uniform vec2 uLook; uniform vec2 uSun;",
    "uniform vec3 uPowder, uSlate, uShadow, uCream;",
    NOISE,
    "void main(){",
    "  vec2 uv = gl_FragCoord.xy / uRes;",
    "  uv.y = 1.0 - uv.y;",
    "  float ar = uRes.x / uRes.y;",
    "  vec2 p = vec2(uv.x * ar, uv.y);",
    "  vec2 c = vec2(0.47 * ar, 0.44) + uLook * 0.035;",
    "  float d = length((p - c) / vec2(1.25, 1.0));",
    "  d += (fbm(p * 1.7 + uTime * 0.010) - 0.5) * 0.30;",
    "  d += (fbm(p * 3.3 - uTime * 0.007) - 0.5) * 0.12;",
    "  float open = smoothstep(0.80, 0.12, d);",
    "  vec3 col = mix(uPowder, uSlate, open * 0.95);",
    "  col = mix(col, uShadow, fbm(p * 2.2 - uTime * 0.006) * 0.16);",
    "  float sun = smoothstep(1.15, 0.0, length(p - uSun));",
    "  col = mix(col, uCream, sun * 0.16 * (1.0 - open * 0.6));",
    "  gl_FragColor = vec4(col, 1.0);",
    "}"
  ].join("\n");

  var CLOUD_VS = [
    "attribute vec2 aPos;",
    "uniform vec2 uCenter, uSize, uRes; uniform float uRot;",
    "varying vec2 vUv;",
    "void main(){",
    "  vUv = aPos + 0.5;",
    "  vec2 p = aPos * uSize;",
    "  float c = cos(uRot), s = sin(uRot);",
    "  p = vec2(p.x * c - p.y * s, p.x * s + p.y * c) + uCenter;",
    "  vec2 ndc = (p / uRes) * 2.0 - 1.0;",
    "  gl_Position = vec4(ndc.x, -ndc.y, 0.0, 1.0);",
    "}"
  ].join("\n");

  /* Light-handed on purpose. These formations were painted with their own
     light in them; the shader only has to move them, warm the side the sun is
     on, and put distance between them. Anything stronger fights the paint —
     an earlier version remapped luminance through a palette ramp and drained
     every cloud to a pale ghost. */
  var CLOUD_FS = [
    "precision mediump float;",
    "uniform sampler2D uTex;",
    "uniform float uTime, uPhase, uBillow, uDepth, uAlpha;",
    "uniform vec2 uSunDir;",
    "uniform vec3 uSky;",
    "varying vec2 vUv;",
    NOISE,
    "void main(){",
    "  vec2 uv = vUv;",
    "  float n1 = fbm(uv * 2.1 + uPhase + uTime * 0.012);",
    "  float n2 = fbm(uv * 3.4 - uPhase * 0.7 - uTime * 0.009);",
    "  uv += (vec2(n1, n2) - 0.5) * uBillow;",
    "  vec4 t = texture2D(uTex, uv);",
    "  if (t.a < 0.004) discard;",
    "  float lit = dot(normalize(vUv - 0.5 + 0.0001), uSunDir) * 0.5 + 0.5;",
    "  vec3 col = t.rgb * mix(vec3(0.90, 0.90, 0.99), vec3(1.09, 1.05, 0.97), lit);",
    "  col = mix(uSky, col, 0.66 + uDepth * 0.34);",
    "  float a = t.a * uAlpha;",
    "  gl_FragColor = vec4(col * a, a);",   // premultiplied for the blend below
    "}"
  ].join("\n");

  /* ------------------------------------------------------------- gl helpers */
  function compile(gl, type, src) {
    var sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(sh) || "shader compile failed");
    }
    return sh;
  }
  function program(gl, vs, fs) {
    var p = gl.createProgram();
    gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
    gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
    gl.bindAttribLocation(p, 0, "aPos");
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(p) || "program link failed");
    }
    return p;
  }
  function locs(gl, p, names) {
    var o = {};
    names.forEach(function (n) { o[n] = gl.getUniformLocation(p, n); });
    return o;
  }

  /* -------------------------------------------------------------- the scene */
  function mount(host, opts) {
    opts = opts || {};
    var base = opts.base || "";
    var canvas = document.createElement("canvas");
    canvas.className = "fresco-canvas";
    canvas.setAttribute("aria-hidden", "true");
    host.insertBefore(canvas, host.firstChild);

    var reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    var small = matchMedia("(max-width: 720px)").matches;
    var gl = null, state = null, images = null;
    var W = 0, H = 0, dpr = 1;
    var look = { x: 0, y: 0, tx: 0, ty: 0 };
    var scroll = 0, t0 = performance.now(), raf = 0, running = false, paused = false;

    function size() {
      // a phone does not need two device pixels of cloud, and the fill cost of
      // sixteen overlapping layers is the whole frame budget on a mobile GPU
      dpr = Math.min(small ? 1.5 : 2, global.devicePixelRatio || 1);
      var r = host.getBoundingClientRect();
      W = Math.max(1, Math.floor((r.width || global.innerWidth) * dpr));
      H = Math.max(1, Math.floor((r.height || global.innerHeight) * dpr));
      canvas.width = W; canvas.height = H;
      canvas.style.width = "100%"; canvas.style.height = "100%";
      if (gl) gl.viewport(0, 0, W, H);
    }

    function loadAll() {
      return Promise.all(ASSETS.map(function (name) {
        return new Promise(function (res, rej) {
          var im = new Image();
          im.onload = function () { res(im); };
          im.onerror = rej;
          im.src = base + "assets/img/art/clouds/" + name + ".webp";
        });
      }));
    }

    function setupGL() {
      gl = canvas.getContext("webgl", { alpha: false, antialias: false, depth: false,
                                        premultipliedAlpha: true, powerPreference: "low-power" })
        || canvas.getContext("experimental-webgl");
      if (!gl) throw new Error("no webgl");

      var quad = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, quad);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
        -.5, -.5,  .5, -.5, -.5, .5,
        -.5,  .5,  .5, -.5,  .5, .5
      ]), gl.STATIC_DRAW);

      var full = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, full);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);

      var skyP = program(gl, SKY_VS, SKY_FS);
      var cloudP = program(gl, CLOUD_VS, CLOUD_FS);

      /* Straight, NOT premultiplied. These arrive with a real alpha channel and
         the shader premultiplies on output; doing it on upload as well scales
         every soft edge's colour by its own alpha twice and the wisps go black. */
      var textures = images.map(function (im) {
        var tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, im);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        return { tex: tex, w: im.naturalWidth, h: im.naturalHeight };
      });

      state = {
        quad: quad, full: full, skyP: skyP, cloudP: cloudP, textures: textures,
        skyU: locs(gl, skyP, ["uRes","uTime","uLook","uSun","uPowder","uSlate","uShadow","uCream"]),
        clU: locs(gl, cloudP, ["uTex","uTime","uPhase","uBillow","uDepth","uAlpha",
                               "uSunDir","uSky","uCenter","uSize","uRes","uRot"]),
        // far to near, so the near formations crop the far ones
        order: CLOUDS.map(function (c, i) { return i; })
                     .sort(function (a, b) { return CLOUDS[a].d - CLOUDS[b].d; })
      };

      gl.disable(gl.DEPTH_TEST);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.viewport(0, 0, W, H);
    }

    function render(now) {
      var time = reduce ? 40 : (now - t0) / 1000;
      var shorter = Math.min(W, H);
      var ar = W / H;

      // the sun wanders very slowly, so the light on the cloud tops shifts
      var sa = 0.6 + Math.sin(time * 0.012) * 0.22;
      var sunPt = [0.24 * ar + Math.cos(sa) * 0.10, 0.14 + Math.sin(sa) * 0.05];
      var sd = [Math.cos(sa + 1.9), -Math.abs(Math.sin(sa + 1.9)) - 0.3];
      var sl = Math.sqrt(sd[0] * sd[0] + sd[1] * sd[1]);
      sd = [sd[0] / sl, sd[1] / sl];

      gl.bindBuffer(gl.ARRAY_BUFFER, state.full);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.useProgram(state.skyP);
      gl.uniform2f(state.skyU.uRes, W, H);
      gl.uniform1f(state.skyU.uTime, time);
      gl.uniform2f(state.skyU.uLook, look.x, look.y);
      gl.uniform2f(state.skyU.uSun, sunPt[0], sunPt[1]);
      gl.uniform3fv(state.skyU.uPowder, SKY.powder);
      gl.uniform3fv(state.skyU.uSlate, SKY.slate);
      gl.uniform3fv(state.skyU.uShadow, SKY.shadow);
      gl.uniform3fv(state.skyU.uCream, SKY.cream);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      gl.bindBuffer(gl.ARRAY_BUFFER, state.quad);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.useProgram(state.cloudP);
      gl.uniform1i(state.clU.uTex, 0);
      gl.uniform1f(state.clU.uTime, time);
      gl.uniform2f(state.clU.uRes, W, H);
      gl.uniform2f(state.clU.uSunDir, sd[0], sd[1]);
      gl.uniform3fv(state.clU.uSky, SKY.powder);
      gl.activeTexture(gl.TEXTURE0);

      for (var k = 0; k < state.order.length; k++) {
        var n = state.order[k];
        var c = CLOUDS[n], tx = state.textures[c.i];
        if (!tx) continue;

        /* Parallax by depth: the near formations swing further than the far
           ones, which is what makes the ceiling read as a volume above you
           rather than a picture behind glass. Scroll lifts and spreads it. */
        var par = 0.03 + c.d * 0.17;
        var dx = reduce ? 0 : Math.sin(time * (0.019 + n * 0.0012) + n) * (0.010 + c.d * 0.014);
        var dy = reduce ? 0 : Math.cos(time * (0.015 + n * 0.0010) + n * 1.7) * (0.007 + c.d * 0.010);

        var px = (c.x + dx) * W + look.x * par * shorter
                 + (c.x - 0.5) * scroll * (0.08 + c.d * 0.20) * shorter;
        var py = (c.y + dy) * H + look.y * par * shorter
                 - scroll * (0.05 + c.d * 0.28) * shorter;

        var cw = c.w * W * (1 + scroll * (0.04 + c.d * 0.18));
        gl.bindTexture(gl.TEXTURE_2D, tx.tex);
        gl.uniform2f(state.clU.uCenter, px, py);
        gl.uniform2f(state.clU.uSize, cw, cw * tx.h / tx.w);
        gl.uniform1f(state.clU.uRot, c.rot + (reduce ? 0 : Math.sin(time * 0.008 + n) * 0.02));
        gl.uniform1f(state.clU.uPhase, n * 7.31);
        gl.uniform1f(state.clU.uBillow, reduce ? c.b * 0.3 : c.b);
        gl.uniform1f(state.clU.uDepth, c.d);
        gl.uniform1f(state.clU.uAlpha, c.a);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
      }
    }

    function frame(now) {
      look.x += (look.tx - look.x) * 0.045;
      look.y += (look.ty - look.y) * 0.045;
      render(now);
      raf = requestAnimationFrame(frame);
    }
    function start() {
      if (running || paused || !state) return;
      running = true;
      if (reduce) render(performance.now());
      else raf = requestAnimationFrame(frame);
    }
    function stop() { running = false; cancelAnimationFrame(raf); }

    /* A visitor asking for stillness outranks the observer, so the pause flag
       is separate from whether the hero happens to be on screen: scrolling
       past and back must not quietly start the sky moving again. One frame is
       still drawn on pause so the scene does not vanish, and the clouds hold
       wherever they had got to. */
    function pause() {
      paused = true;
      stop();
      if (state) render(performance.now());
    }
    function play() {
      paused = false;
      start();
    }

    /* ---- input ---- */
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
        scroll = Math.min(1.6, global.scrollY / Math.max(1, global.innerHeight));
        if (reduce && state) render(performance.now());
        queued = false;
      });
    }, { passive: true });
    global.addEventListener("resize", function () { size(); if (state) render(performance.now()); });

    // nothing to animate while the hero is off screen
    if (global.IntersectionObserver) {
      new IntersectionObserver(function (es) {
        es.forEach(function (e) { e.isIntersecting ? start() : stop(); });
      }, { threshold: 0 }).observe(host);
    }

    /* ---- the 2D fallback: same assets, same arrangement, no shader ---- */
    function fallback() {
      host.classList.add("is-flat");
      var g = canvas.getContext("2d");
      if (!g) return;
      var paint = function () {
        var sky = g.createRadialGradient(W * .47, H * .44, 0, W * .47, H * .44, Math.min(W, H) * .95);
        sky.addColorStop(0, "#647B96");
        sky.addColorStop(1, "#8295AD");
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.fillStyle = sky;
        g.fillRect(0, 0, W, H);
        CLOUDS.slice().sort(function (a, b) { return a.d - b.d; }).forEach(function (c) {
          var im = images[c.i];
          if (!im) return;
          var cw = c.w * W, ch = cw * im.naturalHeight / im.naturalWidth;
          g.save();
          g.globalAlpha = c.a;
          g.translate(c.x * W, c.y * H);
          g.rotate(c.rot);
          g.drawImage(im, -cw / 2, -ch / 2, cw, ch);
          g.restore();
        });
        g.globalAlpha = 1;
      };
      paint();
      global.addEventListener("resize", function () { size(); paint(); });
    }

    size();
    loadAll().then(function (ims) {
      images = ims;
      try { setupGL(); start(); }
      catch (err) {
        if (global.console && console.info) console.info("fresco: 2D fallback —", err.message);
        gl = null;
        fallback();
      }
      host.classList.add("is-ready");
    }).catch(function () {
      // no paint at all: the CSS sky underneath is the floor of the design
      host.classList.add("is-ready");
    });

    return { start: start, stop: stop, pause: pause, play: play };
  }

  global.BRMFresco = { mount: mount };
})(window);
