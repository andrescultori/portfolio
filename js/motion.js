/* Motion — a small, reusable, attribute-based animation layer.
   Public pages only (index/work/project); never loaded by admin.html or
   pm.html. Full documentation lives in README.md's "Motion" section —
   this file is written so that doc and this code never drift: every
   public behavior is driven by a data-* attribute, nothing by class name
   or page structure, so it can be copied into another static site as-is.

   Rules this file follows throughout (see README for the long version):
   - Animates only transform and opacity. No layout shift.
   - Content is correct and fully visible without JS (progressive
     enhancement: JS adds a class before observing; CSS never hides
     [data-reveal]/[data-grow] by default — only ".js [data-reveal]" etc.
     in site.css does, so no-JS visitors see everything immediately).
   - Honors prefers-reduced-motion by skipping every animation below and
     jumping straight to the end state.
   - No animation longer than 600ms; nothing loops on its own.

   Top-level `var`/`function` (not wrapped in an IIFE) on purpose: this is
   a browser classic script, and tests/motion.test.mjs loads it with
   node:vm, exercising the pure helpers directly as sandbox globals. */

/* The "js" class and the 1.5s reveal-fallback safety timer are added by an
   inline <head> script on every page (see public-chrome.mjs's
   BOOTSTRAP_SCRIPT) rather than here — that way both still run even if
   this file 404s, is blocked, or throws while parsing, since it's loaded
   with "defer" and runs late. This file only has to add "motion-ready"
   once it's actually finished wiring everything up (see initMotion
   below), which is what the safety timer is watching for. */

var REDUCED_MOTION = Boolean(
  window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches
);

/* -------------------------------------------------------------------------
   data-reveal (+ data-reveal-delay, data-reveal-stagger on a parent)
   Fade + 12px translate on first entry into the viewport, once.
   ------------------------------------------------------------------------- */

function revealDelayMs(el) {
  var own = el.getAttribute("data-reveal-delay");
  if (own !== null && own !== "") return Math.max(0, parseInt(own, 10) || 0);

  var parent = el.parentElement;
  var stagger = parent && parent.getAttribute("data-reveal-stagger");
  if (!stagger) return 0;
  var siblings = Array.prototype.filter.call(parent.children, function (c) {
    return c.hasAttribute("data-reveal");
  });
  var index = siblings.indexOf(el);
  return Math.max(0, index) * (parseInt(stagger, 10) || 0);
}

function initReveal() {
  var els = document.querySelectorAll("[data-reveal]");
  if (!els.length) return;

  if (REDUCED_MOTION || typeof IntersectionObserver !== "function") {
    els.forEach(function (el) {
      el.classList.add("is-visible");
    });
    return;
  }

  var observer = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var el = entry.target;
        var delay = revealDelayMs(el);
        if (delay) el.style.transitionDelay = delay + "ms";
        el.classList.add("is-visible");
        observer.unobserve(el);
      });
    },
    { threshold: 0.15, rootMargin: "0px 0px -40px 0px" }
  );
  els.forEach(function (el) {
    observer.observe(el);
  });
}

/* -------------------------------------------------------------------------
   data-grow (+ data-grow="x" for horizontal, data-grow-stagger on a
   parent) — bars/lines scale from 0 on first entry into the viewport.
   ------------------------------------------------------------------------- */

function growDelayMs(el) {
  var parent = el.parentElement;
  var stagger = parent && parent.getAttribute("data-grow-stagger");
  if (!stagger) return 0;
  var siblings = Array.prototype.filter.call(parent.children, function (c) {
    return c.hasAttribute("data-grow");
  });
  var index = siblings.indexOf(el);
  return Math.max(0, index) * (parseInt(stagger, 10) || 0);
}

function initGrow() {
  var els = document.querySelectorAll("[data-grow]");
  if (!els.length) return;

  if (REDUCED_MOTION || typeof IntersectionObserver !== "function") {
    els.forEach(function (el) {
      el.classList.add("is-visible");
    });
    return;
  }

  var observer = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var el = entry.target;
        var delay = growDelayMs(el);
        if (delay) el.style.transitionDelay = delay + "ms";
        el.classList.add("is-visible");
        observer.unobserve(el);
      });
    },
    { threshold: 0.2 }
  );
  els.forEach(function (el) {
    observer.observe(el);
  });
}

/* -------------------------------------------------------------------------
   data-count="<number>" (+ data-prefix, data-suffix, data-decimals)
   Count-up when first visible. The element's HTML text is always the
   final, correct value already (no-JS and reduced-motion both just keep
   it as-is — this only ever replaces text while counting up, then
   restores the exact final formatted value).
   ------------------------------------------------------------------------- */

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

function formatCount(value, decimals, prefix, suffix) {
  var fixed = decimals > 0 ? value.toFixed(decimals) : String(Math.round(value));
  return (prefix || "") + fixed + (suffix || "");
}

function animateCount(el) {
  var target = parseFloat(el.getAttribute("data-count"));
  if (!isFinite(target)) return;
  var decimals = parseInt(el.getAttribute("data-decimals") || "0", 10) || 0;
  var prefix = el.getAttribute("data-prefix") || "";
  var suffix = el.getAttribute("data-suffix") || "";
  var duration = 600;
  var start = null;

  function frame(ts) {
    if (start === null) start = ts;
    var progress = Math.min(1, (ts - start) / duration);
    var eased = easeOutCubic(progress);
    el.textContent = formatCount(target * eased, decimals, prefix, suffix);
    if (progress < 1) {
      window.requestAnimationFrame(frame);
    } else {
      el.textContent = formatCount(target, decimals, prefix, suffix);
    }
  }
  window.requestAnimationFrame(frame);
}

function initCount() {
  var els = document.querySelectorAll("[data-count]");
  if (!els.length || REDUCED_MOTION || typeof IntersectionObserver !== "function") return;

  var observer = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        animateCount(entry.target);
        observer.unobserve(entry.target);
      });
    },
    { threshold: 0.6 }
  );
  els.forEach(function (el) {
    observer.observe(el);
  });
}

/* -------------------------------------------------------------------------
   Header: slight height/shadow change after scroll.
   ------------------------------------------------------------------------- */

function initHeaderScroll() {
  var header = document.querySelector(".site-header");
  if (!header) return;
  var ticking = false;
  function update() {
    header.classList.toggle("is-scrolled", window.scrollY > 8);
    ticking = false;
  }
  window.addEventListener(
    "scroll",
    function () {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(update);
    },
    { passive: true }
  );
  update();
}

/* -------------------------------------------------------------------------
   Page chrome (not part of the reusable motion API): mobile nav toggle,
   and the /work/ index's category filter (progressive enhancement — every
   row is visible without JS; this only hides non-matching rows).
   ------------------------------------------------------------------------- */

function initNavToggle() {
  var toggle = document.querySelector(".nav-toggle");
  var panel = document.querySelector(".nav-panel");
  if (!toggle || !panel) return;
  toggle.addEventListener("click", function () {
    var isOpen = panel.classList.toggle("is-open");
    toggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
  });
}

function initCategoryFilter() {
  var chips = document.querySelectorAll("[data-filter]");
  var rows = document.querySelectorAll("[data-category]");
  if (!chips.length || !rows.length) return;

  chips.forEach(function (chip) {
    chip.addEventListener("click", function () {
      var filter = chip.getAttribute("data-filter");
      chips.forEach(function (c) {
        c.setAttribute("aria-pressed", c === chip ? "true" : "false");
      });
      rows.forEach(function (row) {
        row.hidden = filter !== "all" && row.getAttribute("data-category") !== filter;
      });
    });
  });
}

function initMotion() {
  initReveal();
  initGrow();
  initCount();
  initHeaderScroll();
  initNavToggle();
  initCategoryFilter();
  document.documentElement.classList.add("motion-ready");
}

document.addEventListener("DOMContentLoaded", initMotion);
