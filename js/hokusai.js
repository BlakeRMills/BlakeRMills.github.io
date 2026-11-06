/* Hokusai — a woodblock waterfall for the homepage hero.
 *
 * Drawn rather than photographed. A ukiyo-e print is flat colour, line and
 * stipple with no modelling anywhere in it, which is exactly what a canvas is
 * good at — the opposite of the Baroque cloud problem, where the whole subject
 * was light and volume and nothing procedural could touch it.
 *
 * Everything is keyed to the palette, so Hokusai3 gives the olive, teal and
 * indigo of the reference while any other palette repaints the whole print.
 * The one colour that is not an ink is the paper: in a woodblock the sheet
 * shows through wherever no block was cut, so it sits outside the palette.
 *
 * The scene owns the canvas and nothing else. Typography is ordinary HTML.
 */
(function (global) {
  "use strict";

  var PAPER = "#efe4ca";          // the unprinted sheet
  var PAPER_DEEP = "#e3d4b2";     // where it is shadowed or doubly printed

  /* Everything that shapes the print. Positions are viewport fractions. */
  var SCENE = {
    fallX:      .34,   // centre of the waterfall
    fallTop:    .02,
    fallW:      .175,  // width at the lip
    fallSpread: 1.22,  // how much wider it is at the base
    fallBottom: .74,   // where it meets the pool at rest
    streaks:    54,
    horizon:    .80,
    descend:    .34,   // how far the camera falls over one screen of scroll
    flow:       1.0    // base speed of the water
  };

  function rgb(h){
    h = h.replace("#","");
    if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
    return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
  }
  function rgba(h, a){ var c = rgb(h); return "rgba("+c[0]+","+c[1]+","+c[2]+","+a.toFixed(3)+")"; }
  function lum(h){
    return rgb(h).map(function(v){ v/=255; return v<=.03928 ? v/12.92 : Math.pow((v+.055)/1.055,2.4); })
                 .reduce(function(a,v,i){ return a + v*[.2126,.7152,.0722][i]; }, 0);
  }
  function mix(a, b, t){
    var x = rgb(a), y = rgb(b);
    return "#" + [0,1,2].map(function(i){
      var v = Math.round(x[i] + (y[i]-x[i])*t).toString(16);
      return v.length<2 ? "0"+v : v;
    }).join("");
  }
  function rng(seed){
    var x = seed>>>0 || 1;
    return function(){ x^=x<<13; x>>>=0; x^=x>>17; x^=x<<5; x>>>=0; return x/4294967296; };
  }

  function mount(host, opts){
    opts = opts || {};
    var canvas = document.createElement("canvas");
    canvas.className = "hok-canvas";
    canvas.setAttribute("aria-hidden","true");
    host.insertBefore(canvas, host.firstChild);

    var ctx = canvas.getContext("2d");
    var reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    var W=0, H=0, dpr=1, flow=0, scroll=0, raf=0, running=false, paused=false;
    var look = { x:0, y:0, tx:0, ty:0 };

    /* ink: the palette, darkest to lightest, plus the paper */
    var ink = ["#0a2e57","#295384","#5a97c1","#74c8c3","#95c36e","#d8d97a"];
    function setPalette(colors){
      ink = colors.slice().sort(function(a,b){ return lum(a)-lum(b); });
      if (ink.length < 4) ink = ink.concat(ink);
      if (!running) draw();
    }
    function I(i){ return ink[Math.max(0, Math.min(ink.length-1, i))]; }
    function deepest(){ return I(0); }
    function water(){ return I(Math.min(2, ink.length-1)); }
    function leaf(){ return I(ink.length-2); }
    function leafLight(){ return I(ink.length-1); }

    function size(){
      dpr = Math.min(2, global.devicePixelRatio || 1);
      var r = host.getBoundingClientRect();
      W = Math.max(1, Math.floor((r.width||global.innerWidth)*dpr));
      H = Math.max(1, Math.floor((r.height||global.innerHeight)*dpr));
      canvas.width = W; canvas.height = H;
      canvas.style.width="100%"; canvas.style.height="100%";
    }

    /* ---- woodblock primitives ---- */

    /* bokashi: the printer wipes the block so the ink fades across it. Flat
       colour with one soft gradient is most of what reads as a print. */
    function bokashi(x0,y0,x1,y1, from, to, a0, a1){
      var g = ctx.createLinearGradient(x0,y0,x1,y1);
      g.addColorStop(0, rgba(from, a0));
      g.addColorStop(1, rgba(to, a1));
      return g;
    }

    /* stipple: foliage, spray and texture are all dots in this idiom */
    function stipple(cx, cy, rx, ry, n, r0, r1, col, alpha, R){
      ctx.fillStyle = col;
      ctx.globalAlpha = alpha;
      for (var i=0;i<n;i++){
        var a = R()*6.283, d = Math.sqrt(R());
        var x = cx + Math.cos(a)*rx*d, y = cy + Math.sin(a)*ry*d;
        var r = r0 + R()*(r1-r0);
        ctx.beginPath(); ctx.arc(x,y,r,0,6.283); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    /* a flat scalloped cloud, the way a block cuts one: no gradient, no edge */
    function cloudForm(cx, cy, rx, ry, lobes, phase, col, alpha){
      ctx.fillStyle = col; ctx.globalAlpha = alpha;
      ctx.beginPath();
      var N = Math.max(96, lobes*14);
      for (var i=0;i<=N;i++){
        var t = i/N*6.283185;
        var b = Math.pow(Math.abs(Math.cos(lobes*t/2 + phase)), .55);
        var k = .86 + .20*b;
        var x = cx + Math.cos(t)*rx*k, y = cy + Math.sin(t)*ry*k;
        if (i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
      }
      ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;
    }

    /* ---- the print ---- */
    function draw(){
      ctx.setTransform(1,0,0,1,0,0);
      ctx.globalAlpha = 1;
      ctx.lineCap = "round";
      var t = scroll;                               // 0 at the lip, 1 at the pool
      var drop = t * SCENE.descend * H;             // the camera falls with the water
      var px = look.x * 0.012 * W, py = look.y * 0.010 * H;

      // paper
      ctx.fillStyle = PAPER;
      ctx.fillRect(0,0,W,H);

      // sky, wiped from deep at the top to lighter at the horizon
      var horizon = SCENE.horizon*H - drop*.5 + py;
      ctx.fillStyle = bokashi(0,0,0,horizon, deepest(), I(2), 1, .86);
      ctx.fillRect(0,0,W,horizon);

      drawCliff(drop, px, py);
      drawFall(t, drop, px, py);
      drawPool(t, drop, px, py, horizon);
      drawFoliage(drop, px, py);
      grain();
    }

    /* the rock the water comes off, and the walls that frame it */
    function drawCliff(drop, px, py){
      var R = rng(31);
      var fx = SCENE.fallX*W + px;
      var fw = SCENE.fallW*W;
      var dark = deepest(), mid = I(1);

      /* The rock is wiped dark at the base and lighter at the lip, which is
         how a printer pulls a cliff: one block, one wipe. Flat mid-blue walls
         sat at the same value as the sky and the gorge disappeared. */
      var wall = bokashi(0, -H*.1, 0, H*.75, mid, dark, 1, 1);

      // left wall
      ctx.fillStyle = wall;
      ctx.beginPath();
      ctx.moveTo(-1, -1);
      ctx.lineTo(fx - fw*.62, -1);
      ctx.lineTo(fx - fw*.70, H*.22 - drop);
      ctx.lineTo(fx - fw*1.25, H*.46 - drop);
      ctx.lineTo(-1, H*.60 - drop);
      ctx.closePath(); ctx.fill();

      // right wall, stepped the way a block cuts rock
      ctx.fillStyle = wall;
      ctx.beginPath();
      ctx.moveTo(W+1, -1);
      ctx.lineTo(fx + fw*.60, -1);
      ctx.lineTo(fx + fw*.74, H*.17 - drop);
      ctx.lineTo(fx + fw*1.5, H*.30 - drop);
      ctx.lineTo(fx + fw*1.2, H*.52 - drop);
      ctx.lineTo(W+1, H*.42 - drop);
      ctx.closePath(); ctx.fill();

      // the outcrop the fall breaks over, lower down
      ctx.fillStyle = dark;
      ctx.beginPath();
      ctx.moveTo(fx - fw*.30, H*.60 - drop);
      ctx.lineTo(fx + fw*.10, H*.54 - drop);
      ctx.lineTo(fx + fw*.52, H*.68 - drop);
      ctx.lineTo(fx + fw*.16, H*.80 - drop);
      ctx.lineTo(fx - fw*.52, H*.74 - drop);
      ctx.closePath(); ctx.fill();

      /* The keyblock. Every colour in a print sits inside a black outline
         pulled from a separate block, and without it the flats just abut and
         the whole thing reads as vector art rather than print. */
      ctx.strokeStyle = rgba(dark, .85);
      ctx.lineWidth = Math.max(1.2, 1.8*dpr);
      ctx.beginPath();
      ctx.moveTo(fx - fw*.62, -1);
      ctx.lineTo(fx - fw*.70, H*.22 - drop);
      ctx.lineTo(fx - fw*1.25, H*.46 - drop);
      ctx.lineTo(-1, H*.60 - drop);
      ctx.moveTo(fx + fw*.60, -1);
      ctx.lineTo(fx + fw*.74, H*.17 - drop);
      ctx.lineTo(fx + fw*1.5, H*.30 - drop);
      ctx.lineTo(fx + fw*1.2, H*.52 - drop);
      ctx.lineTo(W+1, H*.42 - drop);
      ctx.stroke();

      /* A rim of paper down the inside edge of each wall. The water throws
         light onto the rock beside it, and without it the fall and the gorge
         share an edge with nothing happening on it. */
      ctx.strokeStyle = rgba(PAPER, .30);
      ctx.lineWidth = Math.max(1.5, 3.2*dpr);
      ctx.beginPath();
      ctx.moveTo(fx - fw*.62, -1);
      ctx.lineTo(fx - fw*.70, H*.22 - drop);
      ctx.lineTo(fx - fw*1.25, H*.46 - drop);
      ctx.moveTo(fx + fw*.60, -1);
      ctx.lineTo(fx + fw*.74, H*.17 - drop);
      ctx.lineTo(fx + fw*1.5, H*.30 - drop);
      ctx.stroke();

      // hatching: the only shading a block gets
      ctx.strokeStyle = rgba(dark, .5);
      ctx.lineWidth = Math.max(1, 1.1*dpr);
      for (var i=0;i<26;i++){
        var y = H*(.05 + R()*.55) - drop;
        var x0 = R()<.5 ? fx - fw*(.75 + R()*1.4) : fx + fw*(.7 + R()*1.5);
        ctx.beginPath();
        ctx.moveTo(x0, y);
        ctx.lineTo(x0 + fw*(.10 + R()*.22), y + H*.03);
        ctx.stroke();
      }
    }

    /* The waterfall. Each streak is a dashed vertical line and the dash offset
       is what moves — which is how the water flows without anything being
       redrawn or simulated. Streaks run at slightly different speeds, so the
       column has depth rather than sliding as one sheet. */
    function drawFall(t, drop, px, py){
      var R = rng(7);
      var fx = SCENE.fallX*W + px;
      var top = SCENE.fallTop*H - drop;
      var bottom = (SCENE.fallBottom + t*.10)*H - drop;
      var wTop = SCENE.fallW*W, wBot = wTop*SCENE.fallSpread;
      var n = SCENE.streaks;
      var speed = SCENE.flow * (1 + t*1.6);

      /* A soft wash behind the streaks, with an edge that wanders. The first
         version filled a plain trapezoid and the fall read as a cardboard
         cut-out: in the print the water has no straight side anywhere, and
         what gives it a shape is the streaks themselves. */
      var E = rng(3);
      ctx.fillStyle = rgba(PAPER, .93);
      ctx.beginPath();
      var seg = 14, k;
      for (k=0;k<=seg;k++){
        var v = k/seg, yy = top + (bottom-top)*v;
        var hw = (wTop + (wBot-wTop)*v)/2;
        ctx.lineTo(fx - hw*(.86 + E()*.2), yy);
      }
      for (k=seg;k>=0;k--){
        v = k/seg; yy = top + (bottom-top)*v;
        hw = (wTop + (wBot-wTop)*v)/2;
        ctx.lineTo(fx + hw*(.86 + E()*.2), yy);
      }
      ctx.closePath(); ctx.fill();

      /* a brighter core down the middle, so the column has a near and a far
         side rather than one even sheet of cream */
      ctx.fillStyle = bokashi(fx - wBot*.5, 0, fx + wBot*.5, 0,
                              water(), water(), .11, .11);
      ctx.beginPath();
      ctx.moveTo(fx - wTop*.5, top);
      ctx.lineTo(fx - wTop*.30, top);
      ctx.lineTo(fx - wBot*.34, bottom);
      ctx.lineTo(fx - wBot*.52, bottom);
      ctx.closePath(); ctx.fill();

      ctx.lineCap = "round";
      for (var i=0;i<n;i++){
        var u = i/(n-1);
        var jitter = (R()-.5)*.012;
        var xT = fx + (u - .5 + jitter)*wTop;
        var xB = fx + (u - .5 + jitter)*wBot;
        var wobble = (R()-.5)*wTop*.05;

        var long = H*(.10 + R()*.22), gap = H*(.03 + R()*.05);
        var sp = speed * (0.55 + R()*0.9);
        ctx.setLineDash([long, gap]);
        ctx.lineDashOffset = -(flow*sp) % (long+gap);
        ctx.lineWidth = Math.max(1, (0.8 + R()*2.2)*dpr);
        ctx.strokeStyle = R() < .20 ? rgba(water(), .50) : rgba(PAPER, .82 + R()*.18);
        ctx.beginPath();
        ctx.moveTo(xT, top);
        ctx.quadraticCurveTo((xT+xB)/2 + wobble, (top+bottom)/2, xB, bottom);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.lineDashOffset = 0;

      // spray where it lands, heavier the further you have fallen
      var sprayR = rng(99);
      stipple(fx, bottom, wBot*.62, H*(.035 + t*.03),
              Math.round(140 + t*220), .8*dpr, 2.6*dpr, PAPER, .55, sprayR);
      stipple(fx, bottom + H*.02, wBot*.5, H*.03,
              Math.round(60 + t*90), .8*dpr, 2.0*dpr, water(), .35, sprayR);
    }

    /* the pool and the stylised crests it breaks into */
    function drawPool(t, drop, px, py, horizon){
      var R = rng(1234);
      var base = horizon;
      ctx.fillStyle = bokashi(0, base, 0, H, I(1), deepest(), 1, 1);
      ctx.fillRect(0, base, W, H-base);

      // mist along the far edge of the pool
      cloudForm(W*.18 + px, base - H*.02, W*.30, H*.045, 11, 1.2, rgba(PAPER,.55), 1);
      cloudForm(W*.74 + px, base - H*.01, W*.26, H*.040, 13, .4, rgba(PAPER,.42), 1);

      /* Seigaiha — the concentric-arc wave the block actually cuts. Open arcs
         alone, however carefully nested, read as a row of croquet hoops: what
         makes the pattern water is that each row is a *filled band* whose top
         edge is scalloped, stacked front over back, with the nested arcs only
         ruling its surface. */
      var rows = 8;
      for (var r = 0; r < rows; r++){
        var v = (r + .5) / rows;
        var y = base + v * (H - base) * 1.06 + Math.sin(flow*.003 + r*1.3) * H * .004;
        var span = W / (15 - r*1.15);               // nearer rows are larger
        var rad = span * .5;
        var off = ((r % 2) ? span/2 : 0) + Math.sin(flow*.0016 + r*1.7) * span * .06;

        // the band: a scalloped top edge, filled down past the next row
        ctx.fillStyle = mix(I(1), deepest(), v*.85);
        ctx.beginPath();
        ctx.moveTo(-span, H + 1);
        ctx.lineTo(-span, y);
        for (var x = -span; x < W + span*1.5; x += span){
          ctx.arc(x + off + rad, y, rad, Math.PI, 0);
        }
        ctx.lineTo(W + span*1.5, H + 1);
        ctx.closePath();
        ctx.fill();

        // the rules across its surface
        for (x = -span; x < W + span*1.5; x += span){
          for (var k = 0; k < 4; k++){
            var kr = rad * (1 - k*.22);
            if (kr <= 1) continue;
            ctx.strokeStyle = k === 0 ? rgba(PAPER, .88 - v*.26)
                                      : rgba(PAPER, .46 - v*.16 - k*.05);
            ctx.lineWidth = Math.max(1, (2.6 - k*.45 - v*.6) * dpr);
            ctx.beginPath();
            ctx.arc(x + off + rad, y, kr, Math.PI, 0);
            ctx.stroke();
          }
        }
      }
    }

    /* foliage: clusters of dots, which is all a block gives you for a tree */
    function drawFoliage(drop, px, py){
      var R = rng(555);
      var clusters = [
        [.06,-.02,.20,.10],[.28,-.04,.17,.08],[.50,-.03,.13,.07],
        [.72,-.04,.16,.08],[.93,-.01,.18,.09],
        [-.02,.20,.13,.07],[1.01,.18,.14,.08],
        [-.03,.50,.12,.07],[1.03,.46,.13,.07]
      ];
      /* A filled lobed mass first, then dots on top. Dots alone scatter into
         confetti — in the print the foliage is a solid shape and the stipple
         only breaks its surface. */
      clusters.forEach(function(c, i){
        var cx = c[0]*W + px, cy = c[1]*H - drop*(0.6 + (i%3)*0.2) + py;
        if (cy < -H*.35 || cy > H*1.25) return;
        var rx = c[2]*W, ry = c[3]*H;
        cloudForm(cx, cy, rx, ry, 9 + (i%4)*2, i*1.3, leaf(), .95);
        cloudForm(cx - rx*.12, cy - ry*.18, rx*.6, ry*.52, 11, i*2.1, leafLight(), .8);
        stipple(cx, cy, rx*.94, ry*.9, 70, 1.4*dpr, 3.4*dpr, deepest(), .30, R);
        stipple(cx - rx*.1, cy - ry*.2, rx*.5, ry*.45, 34, 1.2*dpr, 2.6*dpr, leafLight(), .5, R);
      });
    }

    /* the sheet itself: a little tooth over everything, which is the single
       cheapest thing that stops a flat fill looking like a flat fill */
    function grain(){
      var R = rng(4242);
      ctx.globalAlpha = .05;
      ctx.fillStyle = PAPER_DEEP;
      for (var i=0;i<900;i++){
        ctx.fillRect(R()*W, R()*H, 1.4*dpr, 1.4*dpr);
      }
      ctx.globalAlpha = .04;
      ctx.fillStyle = "#3a2d18";
      for (i=0;i<500;i++){
        ctx.fillRect(R()*W, R()*H, 1.2*dpr, 1.2*dpr);
      }
      ctx.globalAlpha = 1;
    }

    function frame(){
      flow += reduce ? 0 : 1;
      look.x += (look.tx-look.x)*.05;
      look.y += (look.ty-look.y)*.05;
      draw();
      raf = requestAnimationFrame(frame);
    }
    function start(){ if (running||paused) return; running=true; if (reduce) draw(); else raf=requestAnimationFrame(frame); }
    function stop(){ running=false; cancelAnimationFrame(raf); }
    function pause(){ paused=true; stop(); draw(); }
    function play(){ paused=false; start(); }

    if (!reduce){
      global.addEventListener("pointermove", function(e){
        var r = host.getBoundingClientRect();
        look.tx = ((e.clientX-r.left)/r.width - .5)*2;
        look.ty = ((e.clientY-r.top)/r.height - .5)*2;
      }, {passive:true});
      global.addEventListener("pointerleave", function(){ look.tx=0; look.ty=0; });
    }
    var queued=false;
    global.addEventListener("scroll", function(){
      if (queued) return;
      queued=true;
      requestAnimationFrame(function(){
        scroll = Math.min(1, global.scrollY/Math.max(1, global.innerHeight));
        if (!running) draw();
        queued=false;
      });
    }, {passive:true});
    global.addEventListener("resize", function(){ size(); draw(); });
    if (global.IntersectionObserver){
      new IntersectionObserver(function(es){
        es.forEach(function(e){ e.isIntersecting ? start() : stop(); });
      }, {threshold:0}).observe(host);
    }

    size(); draw(); start();
    host.classList.add("is-ready");
    return { start:start, stop:stop, pause:pause, play:play, setPalette:setPalette };
  }

  global.BRMHokusai = { mount: mount };
})(window);
