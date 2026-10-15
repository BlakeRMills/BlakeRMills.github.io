/* Shared site behaviour: theme toggle, mobile nav, image lightbox, copy toast. */

(function () {
  "use strict";

  /* ---- theme ---------------------------------------------------------- */
  var root = document.documentElement;
  var stored = null;
  try { stored = localStorage.getItem("brm-theme"); } catch (e) { /* private mode */ }
  if (stored === "light" || stored === "dark") root.setAttribute("data-theme", stored);

  var themeBtn = document.querySelector("[data-theme-toggle]");
  if (themeBtn) {
    themeBtn.addEventListener("click", function () {
      var dark = root.getAttribute("data-theme") === "dark" ||
        (!root.hasAttribute("data-theme") &&
          window.matchMedia("(prefers-color-scheme: dark)").matches);
      var next = dark ? "light" : "dark";
      root.setAttribute("data-theme", next);
      themeBtn.setAttribute("aria-label", next === "dark" ? "Switch to light theme" : "Switch to dark theme");
      try { localStorage.setItem("brm-theme", next); } catch (e) { /* ignore */ }
    });
  }

  /* ---- mobile nav ----------------------------------------------------- */
  var navBtn = document.querySelector("[data-nav-toggle]");
  var nav = document.getElementById("site-nav");
  if (navBtn && nav) {
    var setNav = function (open) {
      nav.hidden = !open;
      navBtn.setAttribute("aria-expanded", String(open));
    };
    var mq = window.matchMedia("(max-width: 760px)");
    var sync = function () { setNav(!mq.matches); };
    sync();
    mq.addEventListener("change", sync);
    navBtn.addEventListener("click", function () { setNav(nav.hidden); });
  }

  /* ---- toast ---------------------------------------------------------- */
  var toast, toastTimer;
  window.brmToast = function (message) {
    if (!toast) {
      toast = document.createElement("div");
      toast.className = "toast";
      toast.setAttribute("role", "status");
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toast.classList.remove("is-visible"); }, 1800);
  };

  window.brmCopy = function (text, label) {
    var done = function () { window.brmToast(label || ("Copied " + text)); };
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(done, function () { fallback(); });
    } else { fallback(); }

    function fallback() {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); done(); } catch (e) { window.brmToast("Copy failed"); }
      document.body.removeChild(ta);
    }
  };

  /* ---- lightbox ------------------------------------------------------- */
  var figures = document.querySelectorAll("[data-lightbox]");
  if (figures.length) {
    var dlg = document.createElement("dialog");
    dlg.className = "lightbox";
    dlg.innerHTML =
      '<button class="lightbox__close" aria-label="Close">&times;</button>' +
      '<figure style="margin:0"><img alt=""><figcaption></figcaption></figure>';
    document.body.appendChild(dlg);

    var dlgImg = dlg.querySelector("img");
    var dlgCap = dlg.querySelector("figcaption");

    var open = function (fig) {
      var img = fig.querySelector("img");
      var cap = fig.querySelector("figcaption");
      if (!img) return;
      dlgImg.src = img.currentSrc || img.src;
      dlgImg.alt = img.alt || "";
      dlgCap.textContent = cap ? cap.textContent : img.alt || "";
      if (typeof dlg.showModal === "function") dlg.showModal();
    };

    figures.forEach(function (fig) {
      fig.addEventListener("click", function () { open(fig); });
      fig.setAttribute("tabindex", "0");
      fig.setAttribute("role", "button");
      fig.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(fig); }
      });
    });

    dlg.querySelector(".lightbox__close").addEventListener("click", function () { dlg.close(); });
    dlg.addEventListener("click", function (e) {
      if (e.target === dlg) dlg.close();
    });
    dlg.addEventListener("close", function () { dlgImg.removeAttribute("src"); });
  }
})();
