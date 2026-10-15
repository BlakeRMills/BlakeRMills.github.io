/* Arcade mode — a small top-down world where the buildings are the site's
   pages. Everything (sprites, tiles, the map) is drawn in code; there are no
   image assets. Entering a door navigates to that page. */

(function () {
  "use strict";

  var TILE = 16, MAP_W = 40, MAP_H = 28;

  /* ---- colour ---------------------------------------------------------- */

  var PAL = {
    H: "#8a3a16", h: "#c2591f", s: "#f0c9a8", e: "#2b1a12",
    C: "#6e2520", c: "#8d3431", t: "#d9752f", p: "#2f3a4a", b: "#1b2430",
  };

  var DAY = {
    grass:"#9bbf7a", grassAlt:"#8fb56f", path:"#d8cdb8", pathAlt:"#cfc3ac",
    wall:"#e6ded2", wallAlt:"#dcd2c4", roof:"#8d3431", roofAlt:"#7a2c2a",
    door:"#4a2f1e", win:"#8fc4de", winLit:"#8fc4de",
    tree:"#3f7d4a", treeDark:"#2f6139", trunk:"#5b3a22",
    water:"#5a9ec9", waterLit:"#8fc4de", stone:"#b9b2a4",
    sky:"#14303f", shade:"rgba(0,0,0,0)",
  };
  var NIGHT = {
    grass:"#2f4a3a", grassAlt:"#2a4435", path:"#4a4a3f", pathAlt:"#444034",
    wall:"#3c4350", wallAlt:"#353c48", roof:"#4a2220", roofAlt:"#3d1d1c",
    door:"#2a1a10", win:"#1e2a36", winLit:"#ffd36e",
    tree:"#234a30", treeDark:"#1a3826", trunk:"#332314",
    water:"#2b5d80", waterLit:"#4d8db5", stone:"#555e60",
    sky:"#0a171f", shade:"rgba(10,20,30,.35)",
  };

  /* ---- sprites --------------------------------------------------------- */

  var SPR = {
    down: [
      "................","................",".....HHHHHH.....","....HhhhhhhH....",
      "....hssssssh....","....hssssssh....","....hsessesh....",".....ssssss.....",
      "......ssss......","...CCttttttCC...","..CCCttttttCCC..","..CCcccccccCCC..",
      "..CCcccccccCCC..","....ppp..ppp....","....ppp..ppp....","....bb....bb....",
    ],
    up: [
      "................","................",".....HHHHHH.....","....HHHHHHHH....",
      "....HHHHHHHH....","....HHHHHHHH....","....HHHHHHHH....",".....HHHHHH.....",
      "......ssss......","...CCttttttCC...","..CCCttttttCCC..","..CCcccccccCCC..",
      "..CCcccccccCCC..","....ppp..ppp....","....ppp..ppp....","....bb....bb....",
    ],
    side: [
      "................","................",".....HHHHHH.....","....HhhhhhhH....",
      "....Hhssssss....","....Hhssssss....","....Hhsseess....",".....hsssss.....",
      "......ssss......","....CCtttttC....","...CCCtttttCC...","...CCccccccCC...",
      "...CCccccccCC...",".....pppppp.....",".....ppp.pp.....",".....bb..bb.....",
    ],
  };

  /* Pre-render each sprite, direction and walk frame to its own canvas. */
  var sheets = {};
  function bake() {
    ["down", "up", "side"].forEach(function (name) {
      [0, 1, 2].forEach(function (frame) {
        ["", "flip"].forEach(function (flip) {
          if (name !== "side" && flip) return;
          var cv = document.createElement("canvas");
          cv.width = TILE; cv.height = TILE;
          var g = cv.getContext("2d");
          var rows = SPR[name];
          for (var y = 0; y < 16; y++) {
            for (var x = 0; x < 16; x++) {
              var ch = rows[y][x];
              if (ch === ".") continue;
              // walk cycle: shift one boot/leg per frame
              var yy = y;
              if (frame !== 0 && y >= 13) {
                var leftLeg = x < 8;
                if ((frame === 1 && leftLeg) || (frame === 2 && !leftLeg)) yy = y - 1;
              }
              g.fillStyle = PAL[ch] || "#000";
              g.fillRect(flip ? 15 - x : x, yy, 1, 1);
            }
          }
          sheets[name + frame + flip] = cv;
        });
      });
    });
  }

  /* ---- the world ------------------------------------------------------- */

  var PLACES = [
    { id:"met",   name:"The Met",        sub:"{MetBrewer}",    href:"metbrewer.html",
      x:3,  y:2,  w:10, h:6, accent:"#c2591f" },
    { id:"moma",  name:"MoMA",           sub:"{MoMAColors}",   href:"momacolors.html",
      x:27, y:2,  w:10, h:6, accent:"#2f78a8" },
    { id:"gal",   name:"The Gallery",    sub:"Visualizations", href:"visualizations.html",
      x:2,  y:12, w:8,  h:5, accent:"#43b284" },
    { id:"stu",   name:"The Studio",     sub:"Designs",        href:"designs.html",
      x:30, y:12, w:8,  h:5, accent:"#df9ed4" },
    { id:"news",  name:"The Newsstand",  sub:"Writings",       href:"writings.html",
      x:5,  y:21, w:7,  h:4, accent:"#f6c200" },
    { id:"off",   name:"The Office",     sub:"Resume",         href:"resume.html",
      x:28, y:21, w:7,  h:4, accent:"#898e9f" },
    { id:"home",  name:"Blake's Place",  sub:"About Me",       href:"about.html",
      x:17, y:21, w:7,  h:4, accent:"#e07c37" },
  ];

  var SWATCHES = [
    [14,6,"#e76254"], [25,6,"#ef8a47"], [12,10,"#f7aa58"], [27,10,"#ffd06f"],
    [15,17,"#aadce0"], [24,17,"#72bcd5"], [13,24,"#376795"], [26,24,"#1e466e"],
  ];

  var GRASS = 0, PATH = 1, WALL = 2, ROOF = 3, DOOR = 4, TREE = 5, WATER = 6, STONE = 7;
  var SOLID = { 2:1, 3:1, 5:1, 6:1 };

  var SPAWN_X = 20, SPAWN_Y = 17;
  var map, doorAt;

  function buildMap() {
    map = new Uint8Array(MAP_W * MAP_H);
    doorAt = {};

    function set(x, y, v) {
      if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) return;
      map[y * MAP_W + x] = v;
    }
    function hLine(y, x0, x1) { for (var x = x0; x <= x1; x++) set(x, y, PATH); }
    function vLine(x, y0, y1) { for (var y = y0; y <= y1; y++) set(x, y, PATH); }

    // paths: a ring with spurs out to each door
    hLine(9, 6, 34); hLine(10, 6, 34);
    hLine(19, 6, 34); hLine(20, 6, 34);
    vLine(12, 9, 20); vLine(13, 9, 20);
    vLine(27, 9, 20); vLine(28, 9, 20);

    // buildings
    PLACES.forEach(function (p) {
      for (var y = p.y; y < p.y + p.h; y++) {
        for (var x = p.x; x < p.x + p.w; x++) {
          set(x, y, y < p.y + 2 ? ROOF : WALL);
        }
      }
      var dx = p.x + (p.w >> 1), dy = p.y + p.h - 1;
      set(dx, dy, DOOR);
      doorAt[dx + "," + dy] = p;
      p.doorX = dx; p.doorY = dy;

      // spur from the door to the nearest path row
      var toY = dy < 14 ? 9 : (dy > 20 ? 20 : dy);
      if (dy < 14) { for (var y2 = dy + 1; y2 <= toY; y2++) { set(dx, y2, PATH); set(dx + 1, y2, PATH); } }
      else { for (var y3 = dy - 1; y3 >= 20; y3--) { set(dx, y3, PATH); set(dx + 1, y3, PATH); } }
    });

    // fountain in the middle of the park
    for (var fy = 13; fy <= 15; fy++) {
      for (var fx = 19; fx <= 22; fx++) {
        set(fx, fy, (fx >= 20 && fx <= 21 && fy === 14) ? WATER : STONE);
      }
    }

    // trees, deterministic so the map is the same every visit
    var seed = 1337;
    function rnd() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }
    for (var i = 0; i < 150; i++) {
      var tx = (rnd() * MAP_W) | 0, ty = (rnd() * MAP_H) | 0;
      if (map[ty * MAP_W + tx] !== GRASS) continue;
      var nearPath = false;
      for (var oy = -1; oy <= 1 && !nearPath; oy++)
        for (var ox = -1; ox <= 1; ox++) {
          var v = map[(ty + oy) * MAP_W + (tx + ox)];
          if (v === PATH || v === DOOR) { nearPath = true; break; }
        }
      if (!nearPath) set(tx, ty, TREE);
    }
    // make sure nothing ever spawns on top of a collectible
    SWATCHES.forEach(function (s) {
      if (map[s[1] * MAP_W + s[0]] !== PATH) set(s[0], s[1], GRASS);
    });

    // keep the border solid
    for (var x4 = 0; x4 < MAP_W; x4++) { set(x4, 0, TREE); set(x4, MAP_H - 1, TREE); }
    for (var y4 = 0; y4 < MAP_H; y4++) { set(0, y4, TREE); set(MAP_W - 1, y4, TREE); }

    // Scenery is placed at random, so it can box something in. Flood-fill from
    // the spawn and carve a way through to anything that ended up cut off.
    function reachable() {
      var seen = new Uint8Array(MAP_W * MAP_H);
      var q = [SPAWN_X + SPAWN_Y * MAP_W];
      seen[q[0]] = 1;
      while (q.length) {
        var i = q.pop(), cx = i % MAP_W, cy = (i / MAP_W) | 0;
        var nb = [[cx-1,cy],[cx+1,cy],[cx,cy-1],[cx,cy+1]];
        for (var n = 0; n < 4; n++) {
          var ax = nb[n][0], ay = nb[n][1];
          if (ax < 0 || ay < 0 || ax >= MAP_W || ay >= MAP_H) continue;
          var j = ay * MAP_W + ax;
          if (seen[j] || SOLID[map[j]]) continue;
          seen[j] = 1; q.push(j);
        }
      }
      return seen;
    }

    var targets = SWATCHES.map(function (s) { return [s[0], s[1]]; })
      .concat(PLACES.map(function (pl) { return [pl.doorX, pl.doorY + 1]; }));

    var seen = reachable();
    targets.forEach(function (t) {
      if (seen[t[1] * MAP_W + t[0]]) return;
      // step toward the spawn, clearing scenery, until we rejoin the network
      var cx = t[0], cy = t[1], guard = 0;
      while (guard++ < 80 && !seen[cy * MAP_W + cx]) {
        if (SOLID[map[cy * MAP_W + cx]] && map[cy * MAP_W + cx] === TREE) set(cx, cy, GRASS);
        if (cx !== SPAWN_X) cx += cx < SPAWN_X ? 1 : -1;
        else if (cy !== SPAWN_Y) cy += cy < SPAWN_Y ? 1 : -1;
        else break;
      }
      seen = reachable();
    });
  }

  function tileAt(x, y) {
    if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) return TREE;
    return map[y * MAP_W + x];
  }
  function solidAt(px, py) {
    return !!SOLID[tileAt(Math.floor(px / TILE), Math.floor(py / TILE))];
  }

  /* ---- state ----------------------------------------------------------- */

  var cv, ctx, raf, running = false;
  var player, pigeon, found, t0, tick = 0, fading = 0, fadeTo = null;
  var keys = {};
  var hudEl, signEl, countEl;

  function loadFound() {
    try { return JSON.parse(localStorage.getItem("brm-arcade-found") || "[]"); }
    catch (e) { return []; }
  }
  function saveFound() {
    try { localStorage.setItem("brm-arcade-found", JSON.stringify(found)); } catch (e) {}
  }

  /* ---- drawing --------------------------------------------------------- */

  function theme() {
    var dark = document.documentElement.getAttribute("data-theme") === "dark" ||
      (!document.documentElement.hasAttribute("data-theme") &&
        window.matchMedia("(prefers-color-scheme: dark)").matches);
    return dark ? NIGHT : DAY;
  }

  function drawTile(g, x, y, v, T, night) {
    var px = x * TILE, py = y * TILE, odd = (x + y) % 2;
    switch (v) {
      case PATH:
        g.fillStyle = odd ? T.path : T.pathAlt; g.fillRect(px, py, TILE, TILE); break;
      case WALL:
        g.fillStyle = odd ? T.wall : T.wallAlt; g.fillRect(px, py, TILE, TILE);
        // windows on alternating tiles
        if ((x + y) % 3 === 0) {
          var lit = night && ((x * 7 + y * 13) % 4 !== 0);
          g.fillStyle = lit ? T.winLit : T.win;
          g.fillRect(px + 4, py + 4, 8, 7);
          g.fillStyle = T.wallAlt;
          g.fillRect(px + 7, py + 4, 2, 7);
        }
        break;
      case ROOF:
        g.fillStyle = odd ? T.roof : T.roofAlt; g.fillRect(px, py, TILE, TILE); break;
      case DOOR:
        g.fillStyle = T.wall; g.fillRect(px, py, TILE, TILE);
        g.fillStyle = T.door; g.fillRect(px + 3, py + 2, 10, 14);
        g.fillStyle = "#f6c200"; g.fillRect(px + 10, py + 9, 2, 2);
        break;
      case TREE:
        g.fillStyle = odd ? T.grass : T.grassAlt; g.fillRect(px, py, TILE, TILE);
        g.fillStyle = T.trunk; g.fillRect(px + 7, py + 10, 2, 5);
        g.fillStyle = T.tree; g.fillRect(px + 2, py + 2, 12, 10);
        g.fillStyle = T.treeDark; g.fillRect(px + 2, py + 8, 12, 4);
        g.fillStyle = T.tree; g.fillRect(px + 4, py, 8, 4);
        break;
      case WATER:
        g.fillStyle = T.water; g.fillRect(px, py, TILE, TILE);
        var w = Math.sin(tick / 14 + x) * 2;
        g.fillStyle = T.waterLit; g.fillRect(px + 3 + w, py + 5, 5, 2);
        break;
      case STONE:
        g.fillStyle = T.stone; g.fillRect(px, py, TILE, TILE); break;
      default:
        g.fillStyle = odd ? T.grass : T.grassAlt; g.fillRect(px, py, TILE, TILE);
        if ((x * 5 + y * 3) % 11 === 0) {
          g.fillStyle = T.treeDark; g.fillRect(px + 5, py + 8, 2, 1); g.fillRect(px + 9, py + 11, 2, 1);
        }
    }
  }

  function nearDoor() {
    var cx = (player.x + TILE / 2) / TILE, cy = (player.y + TILE) / TILE;
    for (var i = 0; i < PLACES.length; i++) {
      var p = PLACES[i];
      if (Math.abs(cx - (p.doorX + 0.5)) < 1.2 && Math.abs(cy - (p.doorY + 1.4)) < 1.4) return p;
    }
    return null;
  }

  function render() {
    var T = theme(), night = T === NIGHT;
    var vw = cv.width, vh = cv.height;
    // the scale must be big enough that the world always covers the viewport,
    // otherwise a tall screen shows empty space past the edge of the map
    var cover = Math.max(vw / (MAP_W * TILE), vh / (MAP_H * TILE));
    var scale = Math.min(8, Math.max(2, Math.ceil(cover)));
    var viewW = vw / scale, viewH = vh / scale;

    var camX = player.x + TILE / 2 - viewW / 2;
    var camY = player.y + TILE / 2 - viewH / 2;
    camX = Math.max(0, Math.min(MAP_W * TILE - viewW, camX));
    camY = Math.max(0, Math.min(MAP_H * TILE - viewH, camY));

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = T.sky;
    ctx.fillRect(0, 0, vw, vh);
    ctx.setTransform(scale, 0, 0, scale, Math.round(-camX * scale), Math.round(-camY * scale));

    var x0 = Math.max(0, Math.floor(camX / TILE)), x1 = Math.min(MAP_W - 1, Math.ceil((camX + viewW) / TILE));
    var y0 = Math.max(0, Math.floor(camY / TILE)), y1 = Math.min(MAP_H - 1, Math.ceil((camY + viewH) / TILE));

    for (var y = y0; y <= y1; y++)
      for (var x = x0; x <= x1; x++)
        drawTile(ctx, x, y, tileAt(x, y), T, night);

    // building signs
    PLACES.forEach(function (p) {
      var sx = p.x * TILE + 2, sy = (p.y + 1) * TILE + 3;
      ctx.fillStyle = "rgba(0,0,0,.25)";
      ctx.fillRect(sx, sy, p.w * TILE - 4, 9);
      ctx.fillStyle = p.accent;
      ctx.fillRect(sx, sy, 3, 9);
      ctx.font = "7px monospace";
      ctx.fillStyle = "#fff";
      ctx.fillText(p.name, sx + 5, sy + 7);
    });

    // collectibles
    SWATCHES.forEach(function (s, i) {
      if (found.indexOf(i) !== -1) return;
      var bob = Math.sin(tick / 18 + i) * 1.5;
      ctx.fillStyle = "rgba(0,0,0,.2)";
      ctx.fillRect(s[0] * TILE + 4, s[1] * TILE + 12, 8, 3);
      ctx.fillStyle = s[2];
      ctx.fillRect(s[0] * TILE + 4, s[1] * TILE + 3 + bob, 8, 8);
      ctx.fillStyle = "rgba(255,255,255,.55)";
      ctx.fillRect(s[0] * TILE + 4, s[1] * TILE + 3 + bob, 8, 2);
    });

    // pigeon
    ctx.fillStyle = "rgba(0,0,0,.2)";
    ctx.fillRect(pigeon.x + 4, pigeon.y + 12, 7, 2);
    ctx.fillStyle = night ? "#7c8696" : "#9aa4b2";
    ctx.fillRect(pigeon.x + 4, pigeon.y + 6, 7, 5);
    ctx.fillRect(pigeon.x + (pigeon.dir > 0 ? 10 : 3), pigeon.y + 4, 3, 3);
    ctx.fillStyle = "#f6c200";
    ctx.fillRect(pigeon.x + (pigeon.dir > 0 ? 13 : 2), pigeon.y + 5, 1, 1);

    // player shadow + sprite
    ctx.fillStyle = "rgba(0,0,0,.22)";
    ctx.fillRect(player.x + 4, player.y + 14, 8, 3);
    var frame = player.moving ? (1 + (Math.floor(tick / 7) % 2)) : 0;
    var key = player.face === "left" ? "side" + frame + "flip"
            : player.face === "right" ? "side" + frame + ""
            : player.face + frame + "";
    ctx.drawImage(sheets[key] || sheets["down0"], Math.round(player.x), Math.round(player.y));

    if (night) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = T.shade;
      ctx.fillRect(0, 0, vw, vh);
    }

    if (fading > 0) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = "rgba(10,20,30," + Math.min(1, fading) + ")";
      ctx.fillRect(0, 0, vw, vh);
    }
  }

  /* ---- update ---------------------------------------------------------- */

  function update(dt) {
    tick += dt * 60;

    if (fading > 0) {
      fading += dt * 2.2;
      if (fading >= 1.15 && fadeTo) { window.location.href = fadeTo; fadeTo = null; }
      return;
    }

    var sp = 62 * dt, dx = 0, dy = 0;
    if (keys.left) dx -= 1;
    if (keys.right) dx += 1;
    if (keys.up) dy -= 1;
    if (keys.down) dy += 1;
    if (dx && dy) { dx *= 0.7071; dy *= 0.7071; }

    player.moving = !!(dx || dy);
    if (dx < 0) player.face = "left";
    else if (dx > 0) player.face = "right";
    else if (dy < 0) player.face = "up";
    else if (dy > 0) player.face = "down";

    // axis-separated collision against the sprite's feet
    var nx = player.x + dx * sp;
    if (!solidAt(nx + 3, player.y + 10) && !solidAt(nx + 12, player.y + 10) &&
        !solidAt(nx + 3, player.y + 15) && !solidAt(nx + 12, player.y + 15)) player.x = nx;
    var ny = player.y + dy * sp;
    if (!solidAt(player.x + 3, ny + 10) && !solidAt(player.x + 12, ny + 10) &&
        !solidAt(player.x + 3, ny + 15) && !solidAt(player.x + 12, ny + 15)) player.y = ny;

    player.x = Math.max(0, Math.min(MAP_W * TILE - TILE, player.x));
    player.y = Math.max(0, Math.min(MAP_H * TILE - TILE, player.y));

    // pick up swatches
    SWATCHES.forEach(function (s, i) {
      if (found.indexOf(i) !== -1) return;
      if (Math.abs(player.x - s[0] * TILE) < 13 && Math.abs(player.y - s[1] * TILE) < 13) {
        found.push(i); saveFound(); updateCount();
        if (found.length === SWATCHES.length && window.brmToast) {
          window.brmToast("Full palette! You found all 8 swatches.");
        }
      }
    });

    // pigeon wanders, and startles if you get close
    var pdx = pigeon.x - player.x, pdy = pigeon.y - player.y;
    var dist = Math.hypot(pdx, pdy);
    if (dist < 34) {
      pigeon.vx = (pdx / (dist || 1)) * 46;
      pigeon.vy = (pdy / (dist || 1)) * 46;
      pigeon.startled = 0.9;
    } else {
      pigeon.startled = Math.max(0, pigeon.startled - dt);
      if (Math.random() < 0.012) {
        pigeon.vx = (Math.random() - 0.5) * 24;
        pigeon.vy = (Math.random() - 0.5) * 24;
      }
    }
    var px2 = pigeon.x + pigeon.vx * dt, py2 = pigeon.y + pigeon.vy * dt;
    if (!solidAt(px2 + 8, py2 + 10)) { pigeon.x = px2; pigeon.y = py2; }
    else { pigeon.vx *= -1; pigeon.vy *= -1; }
    pigeon.x = Math.max(TILE, Math.min((MAP_W - 2) * TILE, pigeon.x));
    pigeon.y = Math.max(TILE, Math.min((MAP_H - 2) * TILE, pigeon.y));
    if (pigeon.vx) pigeon.dir = pigeon.vx > 0 ? 1 : -1;

    // door prompt
    var p = nearDoor();
    if (p) {
      signEl.innerHTML = '<strong>' + p.name + '</strong><span>' + p.sub + '</span>' +
        '<em>Press E to go in</em>';
      signEl.hidden = false;
      signEl.style.setProperty("--accent-place", p.accent);
    } else {
      signEl.hidden = true;
    }
  }

  function enterDoor() {
    var p = nearDoor();
    if (!p || fading > 0) return;
    fading = 0.001;
    fadeTo = p.href;
    try { sessionStorage.setItem("brm-arcade", "1"); } catch (e) {}
  }

  function updateCount() {
    if (countEl) countEl.textContent = found.length + " / " + SWATCHES.length;
  }

  function loop(ts) {
    if (!running) return;
    var dt = Math.min(0.05, (ts - t0) / 1000) || 0;
    t0 = ts;
    update(dt);
    render();
    raf = requestAnimationFrame(loop);
  }

  /* ---- input ----------------------------------------------------------- */

  var KEYMAP = {
    ArrowLeft:"left", a:"left", A:"left",
    ArrowRight:"right", d:"right", D:"right",
    ArrowUp:"up", w:"up", W:"up",
    ArrowDown:"down", s:"down", S:"down",
  };

  function onKey(e) {
    if (!running) return;
    if (e.key === "Escape") { close(); return; }
    if (e.key === "e" || e.key === "E" || e.key === "Enter" || e.key === " ") {
      e.preventDefault(); enterDoor(); return;
    }
    var k = KEYMAP[e.key];
    if (k) { e.preventDefault(); keys[k] = e.type === "keydown"; }
  }

  function buildTouch(root) {
    var pad = document.createElement("div");
    pad.className = "arcade__pad";
    [["up","↑"],["left","←"],["right","→"],["down","↓"]].forEach(function (d) {
      var b = document.createElement("button");
      b.className = "arcade__dir arcade__dir--" + d[0];
      b.type = "button"; b.textContent = d[1];
      b.setAttribute("aria-label", "Walk " + d[0]);
      var on = function (e) { e.preventDefault(); keys[d[0]] = true; };
      var off = function (e) { e.preventDefault(); keys[d[0]] = false; };
      b.addEventListener("touchstart", on, { passive:false });
      b.addEventListener("touchend", off);
      b.addEventListener("touchcancel", off);
      b.addEventListener("mousedown", on);
      b.addEventListener("mouseup", off);
      b.addEventListener("mouseleave", off);
      pad.appendChild(b);
    });
    root.appendChild(pad);

    var act = document.createElement("button");
    act.className = "arcade__action";
    act.type = "button"; act.textContent = "E";
    act.setAttribute("aria-label", "Enter building");
    act.addEventListener("click", function (e) { e.preventDefault(); enterDoor(); });
    root.appendChild(act);
  }

  /* ---- open / close ---------------------------------------------------- */

  var rootEl;

  function open() {
    if (running) return;
    if (!map) { bake(); buildMap(); }
    found = loadFound();

    rootEl = document.createElement("div");
    rootEl.className = "arcade";
    rootEl.setAttribute("role", "dialog");
    rootEl.setAttribute("aria-label", "Arcade mode");

    cv = document.createElement("canvas");
    cv.className = "arcade__canvas";
    rootEl.appendChild(cv);

    hudEl = document.createElement("div");
    hudEl.className = "arcade__hud";
    hudEl.innerHTML =
      '<div class="arcade__keys"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd>' +
      '<span>or arrows to walk</span><kbd>E</kbd><span>to go in</span></div>' +
      '<div class="arcade__score">Swatches <b data-count>0 / 8</b></div>';
    rootEl.appendChild(hudEl);

    var exit = document.createElement("button");
    exit.className = "arcade__exit";
    exit.type = "button";
    exit.textContent = "Exit";
    exit.setAttribute("aria-label", "Leave arcade mode");
    exit.addEventListener("click", close);
    rootEl.appendChild(exit);

    signEl = document.createElement("div");
    signEl.className = "arcade__sign";
    signEl.hidden = true;
    rootEl.appendChild(signEl);

    buildTouch(rootEl);
    document.body.appendChild(rootEl);
    document.body.classList.add("arcade-on");

    countEl = rootEl.querySelector("[data-count]");
    updateCount();

    ctx = cv.getContext("2d");
    resize();
    window.addEventListener("resize", resize);

    // start just below the fountain, in the middle of the park
    player = { x: SPAWN_X * TILE, y: SPAWN_Y * TILE, face: "down", moving: false };
    pigeon = { x: 24 * TILE, y: 16 * TILE, vx: 8, vy: 0, dir: 1, startled: 0 };
    keys = {}; fading = 0; fadeTo = null;

    running = true;
    t0 = performance.now();
    raf = requestAnimationFrame(loop);

    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
  }

  function close() {
    if (!running) return;
    running = false;
    cancelAnimationFrame(raf);
    window.removeEventListener("keydown", onKey);
    window.removeEventListener("keyup", onKey);
    window.removeEventListener("resize", resize);
    if (rootEl && rootEl.parentNode) rootEl.parentNode.removeChild(rootEl);
    document.body.classList.remove("arcade-on");
  }

  function resize() {
    if (!cv) return;
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.floor(window.innerWidth * dpr);
    cv.height = Math.floor(window.innerHeight * dpr);
    cv.style.width = window.innerWidth + "px";
    cv.style.height = window.innerHeight + "px";
    if (ctx) ctx.imageSmoothingEnabled = false;
  }

  /* ---- wire up --------------------------------------------------------- */

  window.brmArcade = {
    open: open,
    close: close,
    // small introspection hook, handy when tweaking the map
    state: function () {
      if (!running) return null;
      return {
        x: player.x, y: player.y,
        tile: [Math.round(player.x / TILE), Math.round(player.y / TILE)],
        found: found.slice(),
      };
    },
  };

  document.addEventListener("click", function (e) {
    var btn = e.target.closest ? e.target.closest("[data-arcade]") : null;
    if (btn) { e.preventDefault(); open(); }
  });

  // walking through a door carries arcade mode to the next page
  try {
    if (sessionStorage.getItem("brm-arcade") === "1") {
      sessionStorage.removeItem("brm-arcade");
      if (window.brmToast) window.brmToast("You walked in from the map.");
    }
  } catch (e) {}
})();
