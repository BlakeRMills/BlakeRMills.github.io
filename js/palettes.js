/* Interactive palette browser for the {MetBrewer} and {MoMAColors} pages.
   Reads assets/data/palettes.json, which is generated from the R package
   sources, so the site never drifts from the packages themselves. */

(function () {
  "use strict";

  var mount = document.querySelector("[data-palettes]");
  if (!mount) return;

  var pkg = mount.getAttribute("data-palettes");          // "MetBrewer" | "MoMAColors"
  var fn = mount.getAttribute("data-fn") || "met.brewer"; // R constructor name
  var list = mount.querySelector(".palette-list");
  var search = mount.querySelector("[data-search]");
  var cbOnly = mount.querySelector("[data-cb-only]");
  var count = mount.querySelector("[data-count]");

  var palettes = [];

  fetch("assets/data/palettes.json")
    .then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    })
    .then(function (data) {
      var set = data[pkg] || {};
      palettes = Object.keys(set).map(function (name) {
        return {
          name: name,
          colors: set[name].colors,
          colorblind: set[name].colorblind
        };
      });
      palettes.sort(function (a, b) {
        return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
      });
      render();
    })
    .catch(function (err) {
      list.innerHTML = '<p class="empty">Could not load the palettes (' + err.message +
        "). If you are opening this file directly, run it through a local server instead.</p>";
    });

  function textColor(hex) {
    var r = parseInt(hex.slice(1, 3), 16),
        g = parseInt(hex.slice(3, 5), 16),
        b = parseInt(hex.slice(5, 7), 16);
    // relative luminance, sRGB
    var f = function (c) {
      c /= 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    };
    var L = 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    return L > 0.45 ? "#1b2a33" : "#ffffff";
  }

  function render() {
    var q = (search.value || "").trim().toLowerCase();
    var onlyCb = cbOnly.checked;

    var shown = palettes.filter(function (p) {
      if (onlyCb && !p.colorblind) return false;
      if (!q) return true;
      return p.name.toLowerCase().indexOf(q) !== -1 ||
        p.colors.some(function (c) { return c.indexOf(q) !== -1; });
    });

    count.textContent = shown.length + " of " + palettes.length;
    list.innerHTML = "";

    if (!shown.length) {
      list.innerHTML = '<p class="empty">No palettes match that search.</p>';
      return;
    }

    var frag = document.createDocumentFragment();

    shown.forEach(function (p) {
      var card = document.createElement("article");
      card.className = "palette";

      var head = document.createElement("div");
      head.className = "palette__head";

      var h = document.createElement("h3");
      h.className = "palette__name";
      h.textContent = p.name;
      head.appendChild(h);

      if (p.colorblind) {
        var tag = document.createElement("span");
        tag.className = "tag";
        tag.textContent = "Colorblind friendly";
        head.appendChild(tag);
      }

      var n = document.createElement("span");
      n.className = "palette__n";
      n.textContent = p.colors.length + " colors";
      head.appendChild(n);
      card.appendChild(head);

      var row = document.createElement("div");
      row.className = "swatches";
      p.colors.forEach(function (hex) {
        var b = document.createElement("button");
        b.className = "swatch";
        b.type = "button";
        b.style.background = hex;
        b.style.color = textColor(hex);
        b.title = "Copy " + hex;
        b.setAttribute("aria-label", "Copy " + hex);
        var label = document.createElement("span");
        label.textContent = hex;
        b.appendChild(label);
        b.addEventListener("click", function () { window.brmCopy(hex); });
        row.appendChild(b);
      });
      card.appendChild(row);

      var codeRow = document.createElement("div");
      codeRow.className = "palette__code";
      var snippet = fn + '("' + p.name + '")';
      var code = document.createElement("code");
      code.textContent = snippet;
      codeRow.appendChild(code);

      var copyR = document.createElement("button");
      copyR.className = "copy-btn";
      copyR.type = "button";
      copyR.textContent = "Copy R";
      copyR.addEventListener("click", function () {
        window.brmCopy(snippet, "Copied R snippet");
      });
      codeRow.appendChild(copyR);

      var copyHex = document.createElement("button");
      copyHex.className = "copy-btn";
      copyHex.type = "button";
      copyHex.textContent = "Copy hex";
      copyHex.addEventListener("click", function () {
        window.brmCopy('c("' + p.colors.join('", "') + '")', "Copied all hex codes");
      });
      codeRow.appendChild(copyHex);

      card.appendChild(codeRow);
      frag.appendChild(card);
    });

    list.appendChild(frag);
  }

  search.addEventListener("input", render);
  cbOnly.addEventListener("change", render);
})();
