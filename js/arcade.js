/* Arcade mode — a small top-down world where the buildings are the site's
   pages. Drawn in the visual language of a GBA-era overworld RPG: chunky
   16px tiles, gabled roofs, grid-step movement and a pixel dialogue box.

   All art here is original and drawn in code — there are no image assets and
   nothing is traced from any published game. */

(function () {
  "use strict";

  var TILE = 16, MAP_W = 40, MAP_H = 28;
  var STEP_TIME = 0.15;             // seconds to cross one tile
  var SPAWN_X = 20, SPAWN_Y = 17;

  /* ---- character colours ----------------------------------------------- */

  var PAL = {
    H: "#8a3a16",  // hair, shadow
    h: "#c2591f",  // hair, light
    s: "#f3cda8",  // skin
    e: "#30201a",  // eyes
    C: "#5f201c",  // coat, shadow
    c: "#8d3431",  // coat
    t: "#d9752f",  // turtleneck
    p: "#39445a",  // trousers
    b: "#20283a",  // boots
  };

  /* ---- world colours ---------------------------------------------------- */

  var DAY = {
    grass:"#78c06a", grass2:"#6cb45e", tuft:"#55a04a", blade:"#8ad07a",
    tall:"#4f9c44", tall2:"#3f8838", tallTip:"#68b45a",
    path:"#e8d7a6", path2:"#dfcc98", pathEdge:"#c2ac78", speck:"#d2bd88",
    wallA:"#f6ead2", wallB:"#e6d6b8", base:"#b89c78",
    win:"#7fd0ef", winFrame:"#ffffff", winLit:"#7fd0ef",
    door:"#7a4a24", doorDark:"#4e2e14", mat:"#c2763a",
    ridge:"#ffffff", shingleLight:"rgba(255,255,255,.16)", eave:"rgba(0,0,0,.26)",
    tree:"#3f9442", treeLight:"#5cb050", treeDark:"#2c6e34", trunk:"#7a5222",
    water:"#58a8e0", waterLit:"#9adcf6", stone:"#cfc6b4", stone2:"#bcb09c",
    fence:"#b4823e", fenceDark:"#8a5e28",
    flowerA:"#f05a5a", flowerB:"#f6d14a", flowerC:"#ffffff",
    sky:"#2a4a35", shade:"rgba(0,0,0,0)", shadow:"rgba(0,0,0,.20)",
  };

  var NIGHT = {
    grass:"#2d4a3c", grass2:"#284439", tuft:"#22402f", blade:"#365440",
    tall:"#24402f", tall2:"#1d3627", tallTip:"#2e4a36",
    path:"#5c5848", path2:"#565142", pathEdge:"#464233", speck:"#4e4a3c",
    wallA:"#454c5c", wallB:"#3b4250", base:"#2b3240",
    win:"#243040", winFrame:"#5a6472", winLit:"#ffd36e",
    door:"#3a2614", doorDark:"#241607", mat:"#5c3a1e",
    ridge:"#7f8a98", shingleLight:"rgba(255,255,255,.07)", eave:"rgba(0,0,0,.38)",
    tree:"#255038", treeLight:"#2f6442", treeDark:"#1a3a2a", trunk:"#3d2c14",
    water:"#2d5c80", waterLit:"#4f8cb4", stone:"#5a5a52", stone2:"#4c4c44",
    fence:"#6a4c26", fenceDark:"#4a3418",
    flowerA:"#8a3a3a", flowerB:"#8a7630", flowerC:"#9aa0a8",
    sky:"#101c18", shade:"rgba(8,16,30,.40)", shadow:"rgba(0,0,0,.30)",
  };

  /* ---- sprites (16 x 24) ------------------------------------------------ */

  var SPR = {
    down: [
      "................","................",".....HHHHHH.....","...HHHHHHHHHH...",
      "..HHHHHHHHHHHH..","..HHhhhhhhhhHH..","..HhssssssssHH..","..HhssssssssHH..",
      "..hsseesseessh..","..hssssssssssh..","...hssssssssh...","....hssssssh....",
      ".....ssssss.....","....tttttttt....","...CCtttttttCC..","..CCCtttttttCCC.",
      "..CCccccccccCCC.","..CCccccccccCCC.","..CCccccccccCCC.","...cccccccccc...",
      "....pppppppp....","....pppppppp....","....bbb..bbb....","....bbb..bbb....",
    ],
    up: [
      "................","................",".....HHHHHH.....","...HHHHHHHHHH...",
      "..HHHHHHHHHHHH..","..HHHHHHHHHHHH..","..HHHHHHHHHHHH..","..HHHHHHHHHHHH..",
      "..HHHHHHHHHHHH..","..HHHHHHHHHHHH..","...HHHHHHHHHH...","....HHHHHHHH....",
      ".....ssssss.....","....tttttttt....","...CCtttttttCC..","..CCCtttttttCCC.",
      "..CCccccccccCCC.","..CCccccccccCCC.","..CCccccccccCCC.","...cccccccccc...",
      "....pppppppp....","....pppppppp....","....bbb..bbb....","....bbb..bbb....",
    ],
    side: [
      "................","................",".....HHHHHH.....","...HHHHHHHHHH...",
      "..HHHHHHHHHHHH..","..HHhhhhhhhhhH..","..HHhsssssssss..","..HHhsssssssss..",
      "..HHhsseesssss..","..HHhsssssssss..","...Hhsssssssss..","....hsssssss....",
      ".....ssssss.....","....tttttttt....","...CCtttttttC...","..CCCtttttttCC..",
      "..CCccccccccCC..","..CCccccccccCC..","..CCccccccccCC..","...cccccccccc...",
      "....pppppppp....","....pppppppp....","....bbbbbb......","....bbbbbb......",
    ],
  };

  var SPR_W = 16, SPR_H = 24;
  var sheets = {};

  /* Four frames per direction: 0 stand, 1 left lead, 2 stand, 3 right lead. */
  function bake() {
    ["down", "up", "side"].forEach(function (name) {
      for (var frame = 0; frame < 4; frame++) {
        ["", "flip"].forEach(function (flip) {
          if (name !== "side" && flip) return;
          var cv = document.createElement("canvas");
          cv.width = SPR_W; cv.height = SPR_H;
          var g = cv.getContext("2d");
          var rows = SPR[name];
          var lead = frame === 1 ? -1 : (frame === 3 ? 1 : 0);
          var bob = lead ? 1 : 0;          // whole body rises slightly mid-step
          for (var y = 0; y < SPR_H; y++) {
            for (var x = 0; x < SPR_W; x++) {
              var ch = rows[y][x];
              if (ch === ".") continue;
              var yy = y, xx = x;
              if (y >= 20) {               // legs and boots
                var leftLeg = x < 8;
                if (lead === -1 && leftLeg) yy -= 1;
                if (lead === 1 && !leftLeg) yy -= 1;
                if (name === "side" && lead) xx += lead;
              } else if (bob) {
                yy -= 1;
              }
              g.fillStyle = PAL[ch] || "#000";
              g.fillRect(flip ? SPR_W - 1 - xx : xx, yy, 1, 1);
            }
          }
          sheets[name + frame + flip] = cv;
        });
      }
    });
  }

  /* ---- pixel text ------------------------------------------------------- */

  var txtCv = document.createElement("canvas"), txtCtx = txtCv.getContext("2d");
  var FONT = '8px "Courier New", ui-monospace, monospace';

  function textWidth(str) {
    txtCtx.font = FONT;
    return Math.ceil(txtCtx.measureText(str).width);
  }

  /* Draws 8px text into an offscreen buffer and blits it, so it scales up as
     chunky pixels with the rest of the world rather than being antialiased. */
  function pixText(g, str, x, y, color) {
    var w = textWidth(str) + 2;
    txtCv.width = w; txtCv.height = 10;
    txtCtx.font = FONT;
    txtCtx.textBaseline = "top";
    txtCtx.fillStyle = color;
    txtCtx.fillText(str, 1, 1);
    g.imageSmoothingEnabled = false;
    g.drawImage(txtCv, x, y);
    return w;
  }

  /* ---- the world -------------------------------------------------------- */

  var PLACES = [
    { id:"met",  name:"THE MET",       sub:"{MetBrewer}",    href:"metbrewer.html",
      x:3,  y:2,  w:10, h:6, roof:"#d8502f" },
    { id:"moma", name:"MoMA",          sub:"{MoMAColors}",   href:"momacolors.html",
      x:27, y:2,  w:10, h:6, roof:"#3f6fc0" },
    { id:"gal",  name:"THE GALLERY",   sub:"Visualizations", href:"visualizations.html",
      x:2,  y:12, w:8,  h:5, roof:"#2f9a7a" },
    { id:"stu",  name:"THE STUDIO",    sub:"Designs",        href:"designs.html",
      x:30, y:12, w:8,  h:5, roof:"#b05898" },
    { id:"news", name:"NEWSSTAND",     sub:"Writings",       href:"writings.html",
      x:5,  y:21, w:7,  h:4, roof:"#d8a030" },
    { id:"off",  name:"THE OFFICE",    sub:"Resume",         href:"resume.html",
      x:28, y:21, w:7,  h:4, roof:"#7a8290" },
    { id:"home", name:"BLAKE'S PLACE", sub:"About Me",       href:"about.html",
      x:17, y:21, w:7,  h:4, roof:"#e07c37" },
  ];

  var SWATCHES = [
    [14,6,"#e76254"], [25,6,"#ef8a47"], [12,10,"#f7aa58"], [27,10,"#ffd06f"],
    [15,17,"#aadce0"], [24,17,"#72bcd5"], [13,24,"#376795"], [26,24,"#1e466e"],
  ];

  var GRASS=0, PATH=1, WALL=2, ROOF=3, DOOR=4, TREE=5, WATER=6, STONE=7,
      TALL=8, FLOWER=9, FENCE=10, LEDGE=11;
  /* LEDGE is implemented (walk south onto one and you hop down two tiles) but
     nothing places it yet — a ledge only reads correctly with a change in
     ground height around it, which this map doesn't have. */
  var SOLID = {}; SOLID[WALL]=1; SOLID[ROOF]=1; SOLID[TREE]=1; SOLID[WATER]=1; SOLID[FENCE]=1;

  var map, doorAt;

  function tileAt(x, y) {
    if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) return TREE;
    return map[y * MAP_W + x];
  }
  function blocked(x, y) {
    var v = tileAt(x, y);
    return !!SOLID[v] || v === LEDGE;
  }

  function buildMap() {
    map = new Uint8Array(MAP_W * MAP_H);
    doorAt = {};

    function set(x, y, v) {
      if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) return;
      map[y * MAP_W + x] = v;
    }
    function hLine(y, x0, x1, v) { for (var x = x0; x <= x1; x++) set(x, y, v === undefined ? PATH : v); }
    function vLine(x, y0, y1, v) { for (var y = y0; y <= y1; y++) set(x, y, v === undefined ? PATH : v); }

    hLine(9, 6, 34); hLine(10, 6, 34);
    hLine(19, 6, 34); hLine(20, 6, 34);
    hLine(26, 6, 34);
    vLine(12, 9, 26); vLine(13, 9, 26);
    vLine(27, 9, 26); vLine(28, 9, 20);
    vLine(26, 20, 26);

    PLACES.forEach(function (p) {
      for (var y = p.y; y < p.y + p.h; y++)
        for (var x = p.x; x < p.x + p.w; x++)
          set(x, y, y < p.y + 2 ? ROOF : WALL);

      var dx = p.x + (p.w >> 1), dy = p.y + p.h - 1;
      set(dx, dy, DOOR);
      doorAt[dx + "," + dy] = p;
      p.doorX = dx; p.doorY = dy;

      var target = dy < 11 ? 9 : (dy < 19 ? 19 : 26);
      for (var yy = dy + 1; yy <= target; yy++) { set(dx, yy, PATH); set(dx + 1, yy, PATH); }
    });

    // fountain
    for (var fy = 13; fy <= 15; fy++)
      for (var fx = 19; fx <= 22; fx++)
        set(fx, fy, (fx >= 20 && fx <= 21 && fy === 14) ? WATER : STONE);

    var seed = 1337;
    function rnd() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }

    // patches of tall grass, the way route grass clusters
    [[15,5],[24,4],[9,15],[31,16],[16,25],[25,25],[6,11],[34,9]].forEach(function (c) {
      for (var i = 0; i < 14; i++) {
        var tx = c[0] + ((rnd() * 4) | 0) - 1, ty = c[1] + ((rnd() * 3) | 0) - 1;
        if (tileAt(tx, ty) === GRASS) set(tx, ty, TALL);
      }
    });

    for (var i = 0; i < 150; i++) {
      var tx = (rnd() * MAP_W) | 0, ty = (rnd() * MAP_H) | 0;
      if (map[ty * MAP_W + tx] !== GRASS) continue;
      var nearPath = false;
      for (var oy = -1; oy <= 1 && !nearPath; oy++)
        for (var ox = -1; ox <= 1; ox++) {
          var v = tileAt(tx + ox, ty + oy);
          if (v === PATH || v === DOOR) { nearPath = true; break; }
        }
      if (!nearPath) set(tx, ty, TREE);
    }

    for (var j = 0; j < 40; j++) {
      var fx2 = (rnd() * MAP_W) | 0, fy2 = (rnd() * MAP_H) | 0;
      if (tileAt(fx2, fy2) === GRASS) set(fx2, fy2, FLOWER);
    }

    // fence along the park's south edge
    for (var gx = 15; gx <= 25; gx++) if (tileAt(gx, 25) === GRASS) set(gx, 25, FENCE);

    SWATCHES.forEach(function (s) {
      if (tileAt(s[0], s[1]) !== PATH) set(s[0], s[1], GRASS);
    });

    for (var x4 = 0; x4 < MAP_W; x4++) { set(x4, 0, TREE); set(x4, MAP_H - 1, TREE); }
    for (var y4 = 0; y4 < MAP_H; y4++) { set(0, y4, TREE); set(MAP_W - 1, y4, TREE); }

    // Scenery is placed at random, so it can box something in. Flood-fill from
    // the spawn and carve a way through to anything that ended up cut off.
    function reachable() {
      var seen = new Uint8Array(MAP_W * MAP_H);
      var q = [SPAWN_X + SPAWN_Y * MAP_W];
      seen[q[0]] = 1;
      while (q.length) {
        var k = q.pop(), cx = k % MAP_W, cy = (k / MAP_W) | 0;
        var nb = [[cx-1,cy],[cx+1,cy],[cx,cy-1],[cx,cy+1]];
        for (var n = 0; n < 4; n++) {
          var ax = nb[n][0], ay = nb[n][1];
          if (ax < 0 || ay < 0 || ax >= MAP_W || ay >= MAP_H) continue;
          var jj = ay * MAP_W + ax;
          if (seen[jj] || blocked(ax, ay)) continue;
          seen[jj] = 1; q.push(jj);
        }
      }
      return seen;
    }

    var targets = SWATCHES.map(function (s) { return [s[0], s[1]]; })
      .concat(PLACES.map(function (pl) { return [pl.doorX, pl.doorY + 1]; }));

    var seen = reachable();
    targets.forEach(function (t) {
      if (seen[t[1] * MAP_W + t[0]]) return;
      var cx = t[0], cy = t[1], guard = 0;
      while (guard++ < 80 && !seen[cy * MAP_W + cx]) {
        var v2 = tileAt(cx, cy);
        if (v2 === TREE || v2 === FENCE || v2 === LEDGE) set(cx, cy, GRASS);
        if (cx !== SPAWN_X) cx += cx < SPAWN_X ? 1 : -1;
        else if (cy !== SPAWN_Y) cy += cy < SPAWN_Y ? 1 : -1;
        else break;
      }
      seen = reachable();
    });
  }

  /* ---- state ------------------------------------------------------------ */

  var cv, ctx, raf, running = false;
  var player, pigeon, found, t0, tick = 0, fading = 0, fadeTo = null;
  var keys = {}, rustle = 0;
  var rootEl, countEl;

  function loadFound() {
    try { return JSON.parse(localStorage.getItem("brm-arcade-found") || "[]"); }
    catch (e) { return []; }
  }
  function saveFound() {
    try { localStorage.setItem("brm-arcade-found", JSON.stringify(found)); } catch (e) {}
  }
  function theme() {
    var dark = document.documentElement.getAttribute("data-theme") === "dark" ||
      (!document.documentElement.hasAttribute("data-theme") &&
        window.matchMedia("(prefers-color-scheme: dark)").matches);
    return dark ? NIGHT : DAY;
  }
  function hash(x, y) { return ((x * 73856093) ^ (y * 19349663)) >>> 0; }

  /* ---- tiles ------------------------------------------------------------ */

  function drawTile(g, x, y, v, T) {
    var px = x * TILE, py = y * TILE, h = hash(x, y);

    function grassBase() {
      g.fillStyle = (h & 1) ? T.grass : T.grass2;
      g.fillRect(px, py, TILE, TILE);
      // scattered blades
      g.fillStyle = T.tuft;
      g.fillRect(px + (h % 11), py + 3 + (h >> 3) % 9, 2, 1);
      g.fillRect(px + 4 + (h >> 5) % 9, py + 9 + (h >> 7) % 5, 1, 2);
      g.fillStyle = T.blade;
      g.fillRect(px + 2 + (h >> 9) % 11, py + 6 + (h >> 11) % 7, 1, 1);
    }

    switch (v) {
      case PATH: {
        g.fillStyle = ((x + y) & 1) ? T.path : T.path2;
        g.fillRect(px, py, TILE, TILE);
        g.fillStyle = T.speck;
        g.fillRect(px + (h % 12), py + (h >> 4) % 13, 2, 1);
        g.fillRect(px + 3 + (h >> 8) % 10, py + 6 + (h >> 6) % 8, 1, 1);
        // darker lip wherever the path meets something that isn't path
        g.fillStyle = T.pathEdge;
        if (tileAt(x, y - 1) !== PATH && tileAt(x, y - 1) !== DOOR) g.fillRect(px, py, TILE, 2);
        if (tileAt(x, y + 1) !== PATH && tileAt(x, y + 1) !== DOOR) g.fillRect(px, py + TILE - 2, TILE, 2);
        if (tileAt(x - 1, y) !== PATH && tileAt(x - 1, y) !== DOOR) g.fillRect(px, py, 2, TILE);
        if (tileAt(x + 1, y) !== PATH && tileAt(x + 1, y) !== DOOR) g.fillRect(px + TILE - 2, py, 2, TILE);
        break;
      }
      case TALL: {
        grassBase();
        g.fillStyle = T.tall;
        g.fillRect(px, py + 5, TILE, 11);
        g.fillStyle = T.tall2;
        for (var b = 0; b < TILE; b += 4) g.fillRect(px + b, py + 9, 2, 7);
        g.fillStyle = T.tallTip;
        for (var t2 = 0; t2 < TILE; t2 += 4) {
          g.fillRect(px + t2 + 1, py + 3, 2, 4);
          g.fillRect(px + t2 + 3, py + 5, 1, 3);
        }
        break;
      }
      case FLOWER: {
        grassBase();
        var col = [T.flowerA, T.flowerB, T.flowerC][h % 3];
        var fx = px + 5 + (h % 3), fy = py + 6 + (h >> 2) % 3;
        g.fillStyle = col;
        g.fillRect(fx + 1, fy, 2, 1); g.fillRect(fx + 1, fy + 3, 2, 1);
        g.fillRect(fx, fy + 1, 1, 2);  g.fillRect(fx + 3, fy + 1, 1, 2);
        g.fillStyle = T.flowerB === col ? T.flowerA : T.flowerB;
        g.fillRect(fx + 1, fy + 1, 2, 2);
        break;
      }
      case LEDGE: {
        g.fillStyle = T.grass2; g.fillRect(px, py, TILE, 5);
        g.fillStyle = T.pathEdge; g.fillRect(px, py + 5, TILE, 7);
        g.fillStyle = T.base; g.fillRect(px, py + 12, TILE, 4);
        g.fillStyle = T.path; g.fillRect(px, py + 5, TILE, 2);
        break;
      }
      case FENCE: {
        grassBase();
        g.fillStyle = T.fenceDark;
        g.fillRect(px + 2, py + 4, 3, 12); g.fillRect(px + 11, py + 4, 3, 12);
        g.fillStyle = T.fence;
        g.fillRect(px, py + 6, TILE, 2); g.fillRect(px, py + 11, TILE, 2);
        g.fillRect(px + 2, py + 4, 2, 11); g.fillRect(px + 11, py + 4, 2, 11);
        break;
      }
      case TREE: {
        grassBase();
        g.fillStyle = T.shadow; g.fillRect(px + 3, py + 13, 11, 3);
        g.fillStyle = T.trunk;  g.fillRect(px + 7, py + 10, 3, 5);
        g.fillStyle = T.treeDark;
        g.fillRect(px + 2, py + 3, 13, 9); g.fillRect(px + 4, py + 1, 9, 13);
        g.fillStyle = T.tree;
        g.fillRect(px + 2, py + 3, 12, 7); g.fillRect(px + 4, py + 1, 8, 11);
        g.fillStyle = T.treeLight;
        g.fillRect(px + 4, py + 2, 6, 3); g.fillRect(px + 3, py + 4, 3, 3);
        break;
      }
      case WATER: {
        g.fillStyle = T.water; g.fillRect(px, py, TILE, TILE);
        var w = Math.floor(Math.sin(tick / 16 + x * 0.9) * 3);
        g.fillStyle = T.waterLit;
        g.fillRect(px + 2 + w, py + 4, 6, 2);
        g.fillRect(px + 7 - w, py + 10, 5, 1);
        break;
      }
      case STONE: {
        g.fillStyle = ((x + y) & 1) ? T.stone : T.stone2;
        g.fillRect(px, py, TILE, TILE);
        g.fillStyle = T.stone2;
        g.fillRect(px + 2 + (h % 6), py + 4 + (h >> 4) % 8, 3, 2);
        // raised rim wherever the basin meets something that isn't basin
        var isBasin = function (a, b) { var v2 = tileAt(a, b); return v2 === STONE || v2 === WATER; };
        g.fillStyle = T.base;
        if (!isBasin(x, y + 1)) g.fillRect(px, py + TILE - 3, TILE, 3);
        if (!isBasin(x - 1, y)) g.fillRect(px, py, 3, TILE);
        if (!isBasin(x + 1, y)) g.fillRect(px + TILE - 3, py, 3, TILE);
        g.fillStyle = T.wallA;
        if (!isBasin(x, y - 1)) g.fillRect(px, py, TILE, 3);
        break;
      }
      case DOOR:
      case WALL:
      case ROOF:
        // drawn by drawBuilding; lay grass underneath so edges never show gaps
        grassBase();
        break;
      default:
        grassBase();
    }
  }

  /* Tall grass is drawn a second time over the player so the sprite's feet
     sit down inside it, the way route grass works. */
  function drawTallFront(g, x, y, T) {
    var px = x * TILE, py = y * TILE;
    g.fillStyle = T.tall2;
    for (var b = 0; b < TILE; b += 4) g.fillRect(px + b, py + 9, 3, 7);
    g.fillStyle = T.tall;
    for (var c = 2; c < TILE; c += 4) g.fillRect(px + c, py + 11, 2, 5);
  }

  /* ---- buildings -------------------------------------------------------- */

  function shade(hex, amt) {
    var n = parseInt(hex.slice(1), 16);
    var r = Math.max(0, Math.min(255, ((n >> 16) & 255) + amt));
    var gg = Math.max(0, Math.min(255, ((n >> 8) & 255) + amt));
    var b = Math.max(0, Math.min(255, (n & 255) + amt));
    return "rgb(" + r + "," + gg + "," + b + ")";
  }

  function drawBuilding(g, p, T, night) {
    var px = p.x * TILE, py = p.y * TILE, pw = p.w * TILE, ph = p.h * TILE;
    var roofH = 2 * TILE, over = 3;

    // ground shadow
    g.fillStyle = T.shadow;
    g.fillRect(px - over, py + ph, pw + over * 2, 3);

    // walls
    g.fillStyle = T.wallA; g.fillRect(px, py + roofH, pw, ph - roofH);
    g.fillStyle = T.wallB;
    for (var sx = px; sx < px + pw; sx += 8) g.fillRect(sx, py + roofH, 4, ph - roofH);
    g.fillStyle = T.base; g.fillRect(px, py + ph - 4, pw, 4);

    // roof with shingle banding, light ridge and a dark eave
    var roofMain = night ? shade(p.roof, -70) : p.roof;
    g.fillStyle = roofMain;
    g.fillRect(px - over, py, pw + over * 2, roofH);
    g.fillStyle = T.shingleLight;
    for (var ry = py + 4; ry < py + roofH; ry += 5) g.fillRect(px - over, ry, pw + over * 2, 2);
    g.fillStyle = night ? shade(p.roof, -40) : shade(p.roof, 55);
    g.fillRect(px - over, py, pw + over * 2, 3);
    g.fillStyle = T.eave;
    g.fillRect(px - over, py + roofH - 4, pw + over * 2, 4);

    // windows either side of the door
    var dx = p.doorX * TILE;
    var winY = py + roofH + 5;
    [px + 8, px + pw - 24].forEach(function (wx) {
      if (Math.abs(wx - dx) < 20) return;
      g.fillStyle = T.winFrame; g.fillRect(wx - 1, winY - 1, 18, 14);
      g.fillStyle = night ? ((hash(wx, winY) % 3) ? T.winLit : T.win) : T.win;
      g.fillRect(wx, winY, 16, 12);
      g.fillStyle = T.winFrame;
      g.fillRect(wx + 7, winY, 2, 12); g.fillRect(wx, winY + 5, 16, 2);
    });

    // door, with a frame and a mat on the ground in front
    var dy = p.doorY * TILE;
    g.fillStyle = T.mat; g.fillRect(dx + 1, dy + TILE, TILE - 2, 3);
    g.fillStyle = T.doorDark; g.fillRect(dx + 1, dy - 2, TILE - 2, TILE + 2);
    g.fillStyle = T.door;     g.fillRect(dx + 2, dy - 1, TILE - 4, TILE + 1);
    g.fillStyle = T.doorDark; g.fillRect(dx + TILE / 2, dy - 1, 1, TILE + 1);
    g.fillStyle = "#f6d14a";  g.fillRect(dx + TILE - 5, dy + 7, 2, 2);

    // name board mounted above the door
    var label = p.name;
    var lw = textWidth(label) + 6;
    var lx = Math.round(dx + TILE / 2 - lw / 2), ly = py + roofH + 1;
    g.fillStyle = T.fenceDark; g.fillRect(lx - 1, ly - 1, lw + 2, 12);
    g.fillStyle = T.fence;     g.fillRect(lx, ly, lw, 10);
    pixText(g, label, lx + 3, ly + 1, night ? "#2a1a0e" : "#3a2412");
  }

  /* ---- dialogue box ------------------------------------------------------ */

  function drawBox(g, viewW, viewH, title, sub) {
    var m = 6, boxH = 38;
    var x = m, y = viewH - boxH - m, w = viewW - m * 2;

    g.fillStyle = "#1c3a5e"; g.fillRect(x, y, w, boxH);
    g.fillStyle = "#4a84c4"; g.fillRect(x + 2, y + 2, w - 4, boxH - 4);
    g.fillStyle = "#f8f8f8"; g.fillRect(x + 3, y + 3, w - 6, boxH - 6);
    g.fillStyle = "#dcecfa"; g.fillRect(x + 4, y + 4, w - 8, boxH - 8);
    // clipped corners, for the softened GBA look
    g.fillStyle = "#1c3a5e";
    [[x, y], [x + w - 2, y], [x, y + boxH - 2], [x + w - 2, y + boxH - 2]].forEach(function (c) {
      g.clearRect(c[0], c[1], 2, 2);
    });

    pixText(g, title, x + 9, y + 8, "#1c3a5e");
    if (sub) pixText(g, sub, x + 9, y + 20, "#4a6a8a");

    if (Math.floor(tick / 22) % 2 === 0) {
      g.fillStyle = "#1c3a5e";
      var ax = x + w - 12, ay = y + boxH - 11;
      g.fillRect(ax, ay, 6, 2); g.fillRect(ax + 1, ay + 2, 4, 2); g.fillRect(ax + 2, ay + 4, 2, 2);
    }
  }

  /* ---- what the player is looking at ------------------------------------ */

  function facingTile() {
    var d = { up:[0,-1], down:[0,1], left:[-1,0], right:[1,0] }[player.face];
    return [player.tx + d[0], player.ty + d[1]];
  }
  function facingDoor() {
    var f = facingTile();
    return doorAt[f[0] + "," + f[1]] || null;
  }

  /* ---- render ----------------------------------------------------------- */

  function render() {
    var T = theme(), night = T === NIGHT;
    var vw = cv.width, vh = cv.height;

    var cover = Math.max(vw / (MAP_W * TILE), vh / (MAP_H * TILE));
    var scale = Math.min(8, Math.max(2, Math.ceil(cover)));
    var viewW = vw / scale, viewH = vh / scale;

    var cx = player.px + TILE / 2 - viewW / 2;
    var cy = player.py + TILE / 2 - viewH / 2;
    cx = Math.max(0, Math.min(MAP_W * TILE - viewW, cx));
    cy = Math.max(0, Math.min(MAP_H * TILE - viewH, cy));

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = T.sky;
    ctx.fillRect(0, 0, vw, vh);
    ctx.setTransform(scale, 0, 0, scale, Math.round(-cx * scale), Math.round(-cy * scale));

    var x0 = Math.max(0, Math.floor(cx / TILE) - 1), x1 = Math.min(MAP_W - 1, Math.ceil((cx + viewW) / TILE));
    var y0 = Math.max(0, Math.floor(cy / TILE) - 1), y1 = Math.min(MAP_H - 1, Math.ceil((cy + viewH) / TILE) + 1);

    for (var y = y0; y <= y1; y++)
      for (var x = x0; x <= x1; x++)
        drawTile(ctx, x, y, tileAt(x, y), T);

    PLACES.forEach(function (p) {
      if (p.x * TILE > cx + viewW || (p.x + p.w) * TILE < cx) return;
      if (p.y * TILE > cy + viewH || (p.y + p.h) * TILE < cy) return;
      drawBuilding(ctx, p, T, night);
    });

    SWATCHES.forEach(function (s, i) {
      if (found.indexOf(i) !== -1) return;
      var bob = Math.sin(tick / 18 + i) * 1.5;
      ctx.fillStyle = T.shadow;
      ctx.fillRect(s[0] * TILE + 4, s[1] * TILE + 12, 8, 3);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(s[0] * TILE + 3, s[1] * TILE + 2 + bob, 10, 10);
      ctx.fillStyle = s[2];
      ctx.fillRect(s[0] * TILE + 4, s[1] * TILE + 3 + bob, 8, 8);
      ctx.fillStyle = "rgba(255,255,255,.5)";
      ctx.fillRect(s[0] * TILE + 4, s[1] * TILE + 3 + bob, 8, 2);
    });

    ctx.fillStyle = T.shadow;
    ctx.fillRect(pigeon.x + 4, pigeon.y + 12, 7, 2);
    ctx.fillStyle = night ? "#6d7686" : "#9aa4b2";
    ctx.fillRect(pigeon.x + 4, pigeon.y + 6, 7, 5);
    ctx.fillRect(pigeon.x + (pigeon.dir > 0 ? 10 : 3), pigeon.y + 4, 3, 3);
    ctx.fillStyle = "#f6c200";
    ctx.fillRect(pigeon.x + (pigeon.dir > 0 ? 13 : 2), pigeon.y + 5, 1, 1);

    // player — sprite is 24 tall, so it stands 8px above its tile
    var inTall = tileAt(player.tx, player.ty) === TALL;
    ctx.fillStyle = T.shadow;
    ctx.fillRect(player.px + 4, player.py + 13, 9, 3);
    var dirKey = player.face === "left" ? "side" : player.face === "right" ? "side" : player.face;
    var flip = player.face === "left" ? "flip" : "";
    var sheet = sheets[dirKey + player.frame + flip] || sheets["down0"];
    ctx.drawImage(sheet, Math.round(player.px), Math.round(player.py) + TILE - SPR_H);

    if (inTall) drawTallFront(ctx, player.tx, player.ty, T);
    if (rustle > 0) {
      ctx.fillStyle = T.tallTip;
      var r = Math.sin(rustle * 18) * 3;
      ctx.fillRect(player.px + 2 + r, player.py + 10, 2, 3);
      ctx.fillRect(player.px + 12 - r, player.py + 11, 2, 3);
    }

    if (night) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = T.shade;
      ctx.fillRect(0, 0, vw, vh);
    }

    // dialogue box, in screen space but still on the pixel grid
    var p2 = facingDoor();
    if (p2 && !fading) {
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      drawBox(ctx, viewW, viewH, p2.name, p2.sub);
    }

    if (fading > 0) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = "rgba(10,16,24," + Math.min(1, fading) + ")";
      ctx.fillRect(0, 0, vw, vh);
    }
  }

  /* ---- update ----------------------------------------------------------- */

  function passable(x, y) { return !blocked(x, y); }

  function arriveAt(tx, ty) {
    SWATCHES.forEach(function (s, i) {
      if (found.indexOf(i) !== -1) return;
      if (s[0] === tx && s[1] === ty) {
        found.push(i); saveFound(); updateCount();
        if (found.length === SWATCHES.length && window.brmToast)
          window.brmToast("Full palette! You found all 8 swatches.");
      }
    });
    if (tileAt(tx, ty) === TALL) rustle = 0.35;
    var p = doorAt[tx + "," + ty];
    if (p) { fading = 0.001; fadeTo = p.href; try { sessionStorage.setItem("brm-arcade", "1"); } catch (e) {} }
  }

  function startStep() {
    var dir = keys.up ? "up" : keys.down ? "down" : keys.left ? "left" : keys.right ? "right" : null;
    if (!dir) { player.frame = 0; return; }

    if (player.face !== dir) {          // turn on the spot first, as Gen3 does
      player.face = dir;
      player.turnDelay = 0.07;
      return;
    }
    if (player.turnDelay > 0) return;

    var d = { up:[0,-1], down:[0,1], left:[-1,0], right:[1,0] }[dir];
    var nx = player.tx + d[0], ny = player.ty + d[1];

    // hop down a ledge
    if (dir === "down" && tileAt(nx, ny) === LEDGE && passable(nx, ny + 1)) {
      player.stepping = true; player.hop = true;
      player.fromX = player.tx; player.fromY = player.ty;
      player.tx = nx; player.ty = ny + 1;
      player.prog = 0; player.parity = !player.parity;
      player.frame = player.parity ? 1 : 3;
      return;
    }
    if (!passable(nx, ny)) { player.frame = 0; return; }

    player.stepping = true; player.hop = false;
    player.fromX = player.tx; player.fromY = player.ty;
    player.tx = nx; player.ty = ny;
    player.prog = 0; player.parity = !player.parity;
    player.frame = player.parity ? 1 : 3;
  }

  function update(dt) {
    tick += dt * 60;
    if (rustle > 0) rustle = Math.max(0, rustle - dt);

    if (fading > 0) {
      fading += dt * 2.2;
      if (fading >= 1.15 && fadeTo) { window.location.href = fadeTo; fadeTo = null; }
      return;
    }

    if (player.turnDelay > 0) player.turnDelay = Math.max(0, player.turnDelay - dt);

    if (player.stepping) {
      var span = player.hop ? 2 : 1;
      player.prog += dt / (STEP_TIME * span);
      if (player.prog >= 1) {
        player.prog = 1; player.stepping = false;
        player.px = player.tx * TILE; player.py = player.ty * TILE;
        player.frame = 0;
        arriveAt(player.tx, player.ty);
      } else {
        var e = player.prog;
        player.px = (player.fromX + (player.tx - player.fromX) * e) * TILE;
        player.py = (player.fromY + (player.ty - player.fromY) * e) * TILE;
        if (player.hop) player.py -= Math.sin(e * Math.PI) * 10;
      }
    } else {
      startStep();
    }

    // pigeon keeps its loose wander
    var pdx = pigeon.x - player.px, pdy = pigeon.y - player.py;
    var dist = Math.sqrt(pdx * pdx + pdy * pdy);
    if (dist < 34) {
      pigeon.vx = (pdx / (dist || 1)) * 46;
      pigeon.vy = (pdy / (dist || 1)) * 46;
    } else if (Math.random() < 0.012) {
      pigeon.vx = (Math.random() - 0.5) * 24;
      pigeon.vy = (Math.random() - 0.5) * 24;
    }
    var nx2 = pigeon.x + pigeon.vx * dt, ny2 = pigeon.y + pigeon.vy * dt;
    if (!blocked(Math.floor((nx2 + 8) / TILE), Math.floor((ny2 + 10) / TILE))) { pigeon.x = nx2; pigeon.y = ny2; }
    else { pigeon.vx *= -1; pigeon.vy *= -1; }
    pigeon.x = Math.max(TILE, Math.min((MAP_W - 2) * TILE, pigeon.x));
    pigeon.y = Math.max(TILE, Math.min((MAP_H - 2) * TILE, pigeon.y));
    if (pigeon.vx) pigeon.dir = pigeon.vx > 0 ? 1 : -1;
  }

  function enterFacingDoor() {
    var p = facingDoor();
    if (!p || fading > 0) return;
    fading = 0.001; fadeTo = p.href;
    try { sessionStorage.setItem("brm-arcade", "1"); } catch (e) {}
  }

  function updateCount() {
    if (countEl) countEl.textContent = found.length + " / " + SWATCHES.length;
  }

  function loop(ts) {
    if (!running) return;
    var dt = (ts - t0) / 1000;
    if (!(dt > 0)) dt = 1 / 60;
    dt = Math.min(0.05, dt);
    t0 = ts;
    update(dt);
    render();
    raf = requestAnimationFrame(loop);
  }

  /* ---- input ------------------------------------------------------------ */

  var KEYMAP = {
    ArrowLeft:"left", a:"left", A:"left", ArrowRight:"right", d:"right", D:"right",
    ArrowUp:"up", w:"up", W:"up", ArrowDown:"down", s:"down", S:"down",
  };

  function onKey(e) {
    if (!running) return;
    if (e.key === "Escape") { close(); return; }
    if (e.key === "e" || e.key === "E" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (e.type === "keydown") enterFacingDoor();
      return;
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
    act.type = "button"; act.textContent = "A";
    act.setAttribute("aria-label", "Enter building");
    act.addEventListener("click", function (e) { e.preventDefault(); enterFacingDoor(); });
    root.appendChild(act);
  }

  /* ---- open / close ------------------------------------------------------ */

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

    var hud = document.createElement("div");
    hud.className = "arcade__hud";
    hud.innerHTML =
      '<div class="arcade__keys"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd>' +
      '<span>walk</span><kbd>E</kbd><span>enter</span><kbd>Esc</kbd><span>leave</span></div>' +
      '<div class="arcade__score">Swatches <b data-count>0 / 8</b></div>';
    rootEl.appendChild(hud);

    var exit = document.createElement("button");
    exit.className = "arcade__exit";
    exit.type = "button";
    exit.textContent = "Exit";
    exit.addEventListener("click", close);
    rootEl.appendChild(exit);

    buildTouch(rootEl);
    document.body.appendChild(rootEl);
    document.body.classList.add("arcade-on");

    countEl = rootEl.querySelector("[data-count]");
    updateCount();

    ctx = cv.getContext("2d");
    resize();
    window.addEventListener("resize", resize);

    player = {
      tx: SPAWN_X, ty: SPAWN_Y, px: SPAWN_X * TILE, py: SPAWN_Y * TILE,
      fromX: SPAWN_X, fromY: SPAWN_Y, face: "down", frame: 0,
      stepping: false, hop: false, prog: 0, parity: false, turnDelay: 0,
    };
    pigeon = { x: 24 * TILE, y: 16 * TILE, vx: 8, vy: 0, dir: 1 };
    keys = {}; fading = 0; fadeTo = null; rustle = 0;

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

  /* ---- wire up ----------------------------------------------------------- */

  window.brmArcade = {
    open: open,
    close: close,
    state: function () {
      if (!running) return null;
      return { tile: [player.tx, player.ty], px: player.px, py: player.py,
               face: player.face, found: found.slice() };
    },
  };

  document.addEventListener("click", function (e) {
    var btn = e.target.closest ? e.target.closest("[data-arcade]") : null;
    if (btn) { e.preventDefault(); open(); }
  });

  try {
    if (sessionStorage.getItem("brm-arcade") === "1") {
      sessionStorage.removeItem("brm-arcade");
      if (window.brmToast) window.brmToast("You walked in from the map.");
    }
  } catch (e) {}
})();
