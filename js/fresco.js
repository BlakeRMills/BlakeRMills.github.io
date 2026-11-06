/* Baroque ceiling fresco — an animated WebGL scene for the homepage hero.
 *
 * On the choice of technique: pure procedural noise does not produce painterly
 * cloud. Noise gives you weather — smooth, statistically uniform, no brush
 * anywhere in it — and no amount of octaves adds the hand of a painter. What
 * carries a Tiepolo is the brushwork, which is a record of a physical gesture,
 * so the paint itself has to come from paint. These are fragments cut out of
 * three Met Open Access canvases, each uploaded as its own texture and drawn as
 * its own layer, never flattened.
 *
 * Everything else is the shader's job: a noise field displaces each layer's UVs
 * so the cloud billows and breathes, luminance is remapped through the brief's
 * palette so the brushwork survives while the colour changes, a moving sun lights
 * the tops and sinks the undersides, and distance mixes each layer toward the sky.
 *
 * The scene owns the canvas and nothing else. Typography is ordinary HTML.
 */
(function (global) {
  "use strict";

  /* ---------------------------------------------------------------- palette */
  var PAL = {
    powder: [0.510, 0.584, 0.678],   // #8295AD
    slate:  [0.392, 0.482, 0.588],   // #647B96
    ivory:  [0.914, 0.851, 0.741],   // #E9D9BD
    cream:  [0.910, 0.804, 0.627],   // #E8CDA0
    peach:  [0.851, 0.678, 0.569],   // #D9AD91
    rose:   [0.788, 0.604, 0.569],   // #C99A91
    warm:   [0.663, 0.612, 0.569],   // #A99C91
    shadow: [0.467, 0.471, 0.529]    // #777887
  };

  /* Fragments worth lifting, as [image, x0, y0, x1, y1] in normalised source
     coordinates. Denis painted nothing but sky, so there is no figure anywhere
     to cut around; the Tiepolo is held to open sky for the same reason. */
  var SOURCES = [
    "assets/img/art/denis-clouds.webp",
    "assets/img/art/denis-clouds-2.webp",
    "assets/img/art/tiepolo-sky.webp"
  ];
  /* Tight on purpose. Wider regions were tried and came out washed: a cut that
     spans half the canvas averages its own contrast away once it is masked and
     scaled, while a tighter one keeps the painter's light-to-dark inside a
     single sprite, where the shader can use it. */
  var CUTS = [
    [0, .20, .33, .60, .70],   // 0  the big lit cumulus
    [0, .38, .12, .62, .38],   // 1  bright cloud, high
    [0, .62, .02, .98, .60],   // 2  grey cumulus flank
    [0, .00, .48, .34, .86],   // 3  lower bank
    [0, .02, .00, .26, .20],   // 4  small puffs
    [1, .33, .38, .70, .64],   // 5  lit cumulus tops
    [1, .00, .46, .40, .82],   // 6  bank, left
    [1, .54, .46, .96, .80],   // 7  bank, right
    [1, .40, .00, .86, .16],   // 8  wisps, high
    [2, .26, .02, .54, .24]    // 9  open sky, warm
  ];

  /* The arrangement. Placed by hand in viewport fractions rather than generated
     on a ring, because a ring is the one thing the brief rules out: formations
     come in off different edges, at different sizes, overlapping, and the
     opening they leave is off-centre and irregular.
       c  which cut        p  position, viewport fractions (may sit outside)
       s  size as a fraction of the shorter edge
       r  rotation         d  depth, 0 far and 1 near
       a  opacity          b  how much the shader billows it           */
  var CLOUDS = [
    /* Placed in terms of the VISIBLE cloud, not the quad. The mask leaves paint
       across roughly the middle 70% of each sprite, so a centre at 1.15 puts
       almost the whole formation off the frame — which is how the first pass
       came out nearly empty. Centres therefore stay within about -0.1 to 1.1,
       and the bank is built as an irregular wreath around an opening that sits
       off-centre, with formations entering from every edge at different sizes. */

    // far: a few large, faint masses for depth, well back
    { c:9, p:[ .30, .26], s:1.15, r:-0.30, d:.05, a:.34, b:.022 },
    { c:7, p:[ .72, .64], s:1.20, r: 1.05, d:.08, a:.32, b:.021 },

    // the wreath — top
    { c:5, p:[ .12,-.02], s:.78, r:-0.24, d:.42, a:.90, b:.014 },
    { c:1, p:[ .42,-.07], s:.66, r: 0.18, d:.30, a:.84, b:.016 },
    { c:2, p:[ .74,-.03], s:.84, r:-0.40, d:.48, a:.92, b:.013 },

    // right
    { c:7, p:[1.02, .20], s:.80, r: 0.26, d:.36, a:.90, b:.014 },
    { c:4, p:[1.06, .56], s:.62, r: 0.92, d:.70, a:.88, b:.011 },
    { c:6, p:[ .97, .86], s:.86, r:-0.48, d:.52, a:.92, b:.013 },

    // bottom
    { c:3, p:[ .70,1.03], s:.90, r: 0.12, d:.62, a:.94, b:.011 },
    { c:8, p:[ .38,1.06], s:.72, r:-0.80, d:.44, a:.80, b:.013 },
    { c:0, p:[ .09, .98], s:.84, r: 0.56, d:.76, a:.95, b:.009 },

    // left
    { c:6, p:[-.04, .70], s:.82, r:-0.52, d:.34, a:.88, b:.014 },
    { c:1, p:[-.05, .34], s:.64, r: 1.12, d:.66, a:.86, b:.011 },
    { c:0, p:[ .04, .06], s:.80, r:-0.20, d:.58, a:.93, b:.012 },

    // a second, inner rank so the bank has thickness rather than a single ring
    { c:5, p:[ .24, .13], s:.60, r: 0.62, d:.26, a:.78, b:.016 },
    { c:2, p:[ .80, .15], s:.64, r:-0.18, d:.24, a:.76, b:.016 },
    { c:7, p:[ .88, .74], s:.62, r: 0.44, d:.28, a:.78, b:.015 },
    { c:3, p:[ .17, .82], s:.66, r:-0.34, d:.30, a:.80, b:.015 },
    { c:8, p:[ .58,-.01], s:.56, r: 0.22, d:.20, a:.68, b:.017 },
    { c:4, p:[ .46,1.00], s:.54, r:-0.64, d:.22, a:.70, b:.017 }
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
    "  for (int i = 0; i < 4; i++){ v += a * vnoise(p); p *= 2.03; a *= 0.5; }",
    "  return v;",
    "}"
  ].join("\n");

  var SKY_VS = [
    "attribute vec2 aPos;",
    "void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }"
  ].join("\n");

  /* The sky is painted, not graded. A clean radial would read as a spotlight,
     so the opening's boundary is pushed around by a noise field and its centre
     sits off to one side; what actually reads as an opening is the cloud. It is
     also the darkest part of the frame rather than the brightest, which is both
     how the bank around it reads as lit and the only way ivory type survives in
     the middle of a pale sky. */
  var SKY_FS = [
    "precision highp float;",
    "uniform vec2 uRes; uniform float uTime; uniform vec2 uLook; uniform vec2 uSun;",
    "uniform vec3 uPowder, uSlate, uShadow, uCream;",
    NOISE,
    "void main(){",
    "  vec2 uv = gl_FragCoord.xy / uRes;",
    "  uv.y = 1.0 - uv.y;",
    "  float ar = uRes.x / uRes.y;",
    "  vec2 p = vec2(uv.x * ar, uv.y);",
    "  vec2 c = vec2(0.47 * ar, 0.44) + uLook * 0.035;",
    "  vec2 q = (p - c) / vec2(1.22, 1.0);",
    "  float d = length(q);",
    "  d += (fbm(p * 1.7 + uTime * 0.010) - 0.5) * 0.30;",
    "  d += (fbm(p * 3.3 - uTime * 0.007) - 0.5) * 0.12;",
    "  float open = smoothstep(0.74, 0.10, d);",
    "  vec3 col = mix(uPowder, uSlate, open * 0.92);",
    "  col = mix(col, uShadow, (fbm(p * 2.2 - uTime * 0.006)) * 0.20);",
    "  float sun = smoothstep(1.15, 0.0, length(p - uSun));",
    "  col = mix(col, uCream, sun * 0.20 * (1.0 - open * 0.55));",
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

  var CLOUD_FS = [
    "precision highp float;",
    "uniform sampler2D uTex;",
    "uniform float uTime, uPhase, uBillow, uDepth, uAlpha;",
    "uniform vec2 uSunDir;",
    "uniform vec3 uShadow, uWarm, uRose, uPeach, uCream, uIvory, uSky;",
    "varying vec2 vUv;",
    NOISE,
    /* Luminance is the brushwork. Remapping it through the palette rather than
       tinting the pixels keeps every stroke the painter made and changes only
       what colour it is. */
    "vec3 ramp(float t){",
    "  if (t < 0.20) return mix(uShadow, uWarm,  t / 0.20);",
    "  if (t < 0.40) return mix(uWarm,   uRose,  (t - 0.20) / 0.20);",
    "  if (t < 0.58) return mix(uRose,   uPeach, (t - 0.40) / 0.18);",
    "  if (t < 0.78) return mix(uPeach,  uCream, (t - 0.58) / 0.20);",
    "  return mix(uCream, uIvory, (t - 0.78) / 0.22);",
    "}",
    "void main(){",
    "  vec2 uv = vUv;",
    /* two slow noise fields, slightly out of step, so the form never repeats */
    "  float n1 = fbm(uv * 2.3 + uPhase + uTime * 0.013);",
    "  float n2 = fbm(uv * 3.9 - uPhase * 0.7 - uTime * 0.0095);",
    "  uv += (vec2(n1, n2) - 0.5) * uBillow;",
    "  vec4 t = texture2D(uTex, uv);",
    "  if (t.a < 0.004) discard;",
    "  float lum = dot(t.rgb, vec3(0.299, 0.587, 0.114));",
    /* The sun moves the paint along the palette ramp rather than multiplying
       it down. Multiplying darkens toward black and, stacked with the aerial
       mix below, sank every cloud into the sky; walking the ramp keeps the
       lit tops in ivory and drops the undersides into rose and lavender-grey,
       which is where the volume actually comes from. */
    "  float lit = dot(normalize(vUv - 0.5 + 0.0001), uSunDir) * 0.5 + 0.5;",
    /* Fitted by eye against the render, not from the histogram. The measured
       distribution argued for a steeper expansion, and on screen that pushed
       most of every cloud down into the rose end of the ramp and drained the
       bank. A gentler curve keeps the mass in cream and ivory where a lit
       cumulus belongs, and lets the sun do the modelling. */
    "  float v = clamp(lum * 1.14 - 0.03 + (lit - 0.5) * 0.28, 0.0, 1.0);",
"  vec3 col = ramp(v);",
    "  col *= mix(vec3(0.92, 0.92, 1.03), vec3(1.06, 1.02, 0.94), lit);",
    /* aerial perspective: the far formations soften toward the sky behind them */
    "  col = mix(uSky, col, 0.74 + uDepth * 0.26);",
    "  float a = t.a * uAlpha;",
    "  gl_FragColor = vec4(col * a, a);",   // premultiplied
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

  /* ---------------------------------------------------------- cutting paint */
  function rng(seed) {
    var x = seed >>> 0 || 1;
    return function () {
      x ^= x << 13; x >>>= 0; x ^= x >> 17; x ^= x << 5; x >>>= 0;
      return x / 4294967296;
    };
  }

  /* An irregular closed blob, smoothed through the midpoints of noisy radii.
     The harmonics stay modest because the mask and its blur both have to die
     out before the canvas edge: overrun it and the blur clips, which lays a
     dead straight line across the wisp and gives the whole thing away. */
  function blob(g, cx, cy, rx, ry, R) {
    var N = 18, pts = [], i;
    var p1 = R() * 6.283, p2 = R() * 6.283, p3 = R() * 6.283;
    for (i = 0; i < N; i++) {
      var t = i / N * 6.283;
      var k = 1 + .18 * Math.sin(3 * t + p1) + .11 * Math.sin(5 * t + p2) + .07 * Math.sin(8 * t + p3);
      pts.push([cx + Math.cos(t) * rx * k, cy + Math.sin(t) * ry * k]);
    }
    g.beginPath();
    var last = pts[N - 1], first = pts[0];
    g.moveTo((last[0] + first[0]) / 2, (last[1] + first[1]) / 2);
    for (i = 0; i < N; i++) {
      var a = pts[i], b = pts[(i + 1) % N];
      g.quadraticCurveTo(a[0], a[1], (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
    }
    g.closePath();
  }

  /* Cut once into its own canvas, masked there. Capped rather than cut at full
     size: twenty textures at source resolution is tens of megabytes of VRAM for
     detail nobody can see at this scale. */
  function cutPatch(img, cut, cap, seed) {
    var iw = img.naturalWidth, ih = img.naturalHeight;
    var sw = (cut[3] - cut[1]) * iw, sh = (cut[4] - cut[2]) * ih;
    var w = Math.round(Math.min(sw, cap));
    var h = Math.round(w * sh / sw);
    var c = document.createElement("canvas");
    c.width = w; c.height = h;
    var g = c.getContext("2d");
    g.drawImage(img, cut[1] * iw, cut[2] * ih, sw, sh, 0, 0, w, h);
    g.globalCompositeOperation = "destination-in";
    g.filter = "blur(" + Math.round(Math.min(w, h) * .042) + "px)";
    /* Radius and blur together have to stay inside half the canvas, or the
       blur clips and lays a straight edge across the wisp. BLOB_MAX is the
       worst case of the harmonics, so the ceiling on radius is
       (0.5 - 2*blur) / BLOB_MAX — .30 with this blur, and not a point more. */
    blob(g, w / 2, h / 2, w * .30, h * .30, rng(seed));
    g.fillStyle = "#000";
    g.fill();
    return c;
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
    var gl = null, state = null;
    var W = 0, H = 0, dpr = 1;
    var look = { x: 0, y: 0, tx: 0, ty: 0 };
    var scroll = 0, t0 = performance.now(), raf = 0, running = false;

    function size() {
      // a phone does not need two device pixels of cloud, and the fill cost of
      // twenty overlapping layers is the whole frame budget on mobile GPUs
      dpr = Math.min(small ? 1.5 : 2, global.devicePixelRatio || 1);
      var r = host.getBoundingClientRect();
      W = Math.max(1, Math.floor(r.width * dpr));
      H = Math.max(1, Math.floor((r.height || global.innerHeight) * dpr));
      canvas.width = W; canvas.height = H;
      canvas.style.width = "100%"; canvas.style.height = "100%";
      if (gl) gl.viewport(0, 0, W, H);
    }

    function loadAll(urls) {
      return Promise.all(urls.map(function (u) {
        return new Promise(function (res, rej) {
          var im = new Image();
          im.onload = function () { res(im); };
          im.onerror = rej;
          im.src = base + u;
        });
      }));
    }

    function setupGL(images) {
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

      var cap = small ? 700 : 1200;
      var textures = CUTS.map(function (cut, i) {
        var patch = cutPatch(images[cut[0]], cut, cap, i * 2654435761 + 17);
        var tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        /* Upload straight, NOT premultiplied. The shader reads t.rgb to get the
           paint's luminance and remaps it through the palette; if the texture
           arrives premultiplied then every soft edge has its colour already
           scaled by its own alpha, luminance reads near zero across most of the
           sprite, and the ramp turns the entire cloud into shadow. The shader
           premultiplies on output instead, which is what the blend expects. */
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, patch);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        return { tex: tex, w: patch.width, h: patch.height };
      });

      state = {
        quad: quad, full: full, skyP: skyP, cloudP: cloudP, textures: textures,
        skyU: locs(gl, skyP, ["uRes","uTime","uLook","uSun","uPowder","uSlate","uShadow","uCream"]),
        clU: locs(gl, cloudP, ["uTex","uTime","uPhase","uBillow","uDepth","uAlpha","uSunDir",
                               "uShadow","uWarm","uRose","uPeach","uCream","uIvory","uSky",
                               "uCenter","uSize","uRes","uRot"]),
        // drawn far to near, so the near formations crop the far ones
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
      var sa = 0.6 + Math.sin(time * 0.013) * 0.22;
      var sunPt = [0.22 * ar + Math.cos(sa) * 0.10, 0.12 + Math.sin(sa) * 0.05];
      var sunDir = [Math.cos(sa + 1.9), -Math.abs(Math.sin(sa + 1.9)) - 0.3];
      var sl = Math.sqrt(sunDir[0] * sunDir[0] + sunDir[1] * sunDir[1]);
      sunDir = [sunDir[0] / sl, sunDir[1] / sl];

      gl.bindBuffer(gl.ARRAY_BUFFER, state.full);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.useProgram(state.skyP);
      gl.uniform2f(state.skyU.uRes, W, H);
      gl.uniform1f(state.skyU.uTime, time);
      gl.uniform2f(state.skyU.uLook, look.x, look.y);
      gl.uniform2f(state.skyU.uSun, sunPt[0], sunPt[1]);
      gl.uniform3fv(state.skyU.uPowder, PAL.powder);
      gl.uniform3fv(state.skyU.uSlate, PAL.slate);
      gl.uniform3fv(state.skyU.uShadow, PAL.shadow);
      gl.uniform3fv(state.skyU.uCream, PAL.cream);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      gl.bindBuffer(gl.ARRAY_BUFFER, state.quad);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.useProgram(state.cloudP);
      gl.uniform1i(state.clU.uTex, 0);
      gl.uniform1f(state.clU.uTime, time);
      gl.uniform2f(state.clU.uRes, W, H);
      gl.uniform2f(state.clU.uSunDir, sunDir[0], sunDir[1]);
      gl.uniform3fv(state.clU.uShadow, PAL.shadow);
      gl.uniform3fv(state.clU.uWarm, PAL.warm);
      gl.uniform3fv(state.clU.uRose, PAL.rose);
      gl.uniform3fv(state.clU.uPeach, PAL.peach);
      gl.uniform3fv(state.clU.uCream, PAL.cream);
      gl.uniform3fv(state.clU.uIvory, PAL.ivory);
      gl.uniform3fv(state.clU.uSky, PAL.powder);
      gl.activeTexture(gl.TEXTURE0);

      for (var k = 0; k < state.order.length; k++) {
        var c = CLOUDS[state.order[k]], tx = state.textures[c.c];
        var i = state.order[k];

        /* Parallax by depth: the near formations swing further than the far
           ones, which is what makes the ceiling read as a volume above you
           rather than a picture behind glass. Scroll lifts and spreads it. */
        var par = 0.04 + c.d * 0.16;
        var drift = reduce ? 0 : [
          Math.sin(time * (0.021 + i * 0.0013) + i) * (0.012 + c.d * 0.016),
          Math.cos(time * (0.017 + i * 0.0011) + i * 1.7) * (0.009 + c.d * 0.012)
        ];
        var px = (c.p[0] + (drift ? drift[0] : 0)) * W + look.x * par * shorter
                 + (c.p[0] - 0.5) * scroll * (0.10 + c.d * 0.22) * shorter;
        var py = (c.p[1] + (drift ? drift[1] : 0)) * H + look.y * par * shorter
                 - scroll * (0.05 + c.d * 0.30) * shorter;

        var sz = c.s * shorter * (1 + scroll * (0.05 + c.d * 0.22));
        gl.bindTexture(gl.TEXTURE_2D, tx.tex);
        gl.uniform2f(state.clU.uCenter, px, py);
        gl.uniform2f(state.clU.uSize, sz, sz * tx.h / tx.w);
        gl.uniform1f(state.clU.uRot, c.r + (reduce ? 0 : Math.sin(time * 0.009 + i) * 0.03));
        gl.uniform1f(state.clU.uPhase, i * 7.31);
        gl.uniform1f(state.clU.uBillow, reduce ? c.b * 0.4 : c.b);
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
      if (running) return;
      running = true;
      if (reduce) { render(performance.now()); }
      else { raf = requestAnimationFrame(frame); }
    }
    function stop() { running = false; cancelAnimationFrame(raf); }

    /* ---- input ---- */
    function onPointer(e) {
      var r = host.getBoundingClientRect();
      look.tx = ((e.clientX - r.left) / r.width - 0.5) * 2;
      look.ty = ((e.clientY - r.top) / r.height - 0.5) * 2;
    }
    if (!reduce) {
      global.addEventListener("pointermove", onPointer, { passive: true });
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

    /* ---- the 2D fallback ---- */
    function fallback(images) {
      host.classList.add("is-flat");
      var g = canvas.getContext("2d");
      if (!g) return;
      var patches = CUTS.map(function (cut, i) {
        return cutPatch(images[cut[0]], cut, 640, i * 2654435761 + 17);
      });
      var paint = function () {
        var shorter = Math.min(W, H);
        var sky = g.createRadialGradient(W * .47, H * .44, 0, W * .47, H * .44, shorter * .95);
        sky.addColorStop(0, "#647B96");
        sky.addColorStop(1, "#8295AD");
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.fillStyle = sky;
        g.fillRect(0, 0, W, H);
        state = true;
        CLOUDS.slice().sort(function (a, b) { return a.d - b.d; }).forEach(function (c) {
          var p = patches[c.c];
          var sz = c.s * shorter, h = sz * p.height / p.width;
          g.save();
          g.globalAlpha = c.a * (0.5 + c.d * 0.5);
          g.translate(c.p[0] * W, c.p[1] * H);
          g.rotate(c.r);
          g.drawImage(p, -sz / 2, -h / 2, sz, h);
          g.restore();
        });
        g.globalAlpha = 1;
      };
      paint();
      global.addEventListener("resize", function () { size(); paint(); });
    }

    size();
    loadAll(SOURCES).then(function (images) {
      try {
        setupGL(images);
        start();
      } catch (err) {
        if (global.console && console.info) console.info("fresco: falling back to 2D —", err.message);
        gl = null;
        fallback(images);
      }
      host.classList.add("is-ready");
    }).catch(function () {
      // no paint at all: the CSS sky underneath is the floor of the design
      host.classList.add("is-ready");
    });

    return { start: start, stop: stop };
  }

  global.BRMFresco = { mount: mount };
})(window);
