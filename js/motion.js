/* Decorative motion layer for public pages (not admin.html). Pure, DOM-free
   logic first — tests/motion.test.mjs loads this via node:vm and calls it
   directly. DOM wiring below, each gated by its MOTION_CONFIG flag; fails
   safe (content visible) if IO is missing or this script errors. */

var MOTION_CONFIG = {
  typewriterHeadline: true,
  rotateHeadline: true,
  scrollReveal: true,
  countUpMetrics: true,
  projectFigures: true,
  cardSpotlight: true,
  viewTransitions: true,
  heroParallax: true,
  toolsMarquee: true,
  scrollProgressBar: true,
  headerShrink: true,
  skeletonLoading: true,
};

// --- Pure logic (no DOM) ---

/** ms/char typing `text`; capped so a long phrase stays under ~1.4s total. */
function typeSpeedMs(text) {
  const len = (text || "").length;
  if (!len) return 40;
  return Math.min(40, 1400 / len);
}

/** Full headline cycle (main -> rotates -> main, no trailing erase) as timed steps. */
function buildTypewriterPlan(mainText, rotatePhrases, opts) {
  const pauseMs = (opts && opts.pauseMs) != null ? opts.pauseMs : 2500;
  const eraseMsPerChar = (opts && opts.eraseMsPerChar) != null ? opts.eraseMsPerChar : 20;
  const phrases = [mainText, ...(rotatePhrases || []), mainText];
  const steps = [];
  phrases.forEach((text, i) => {
    steps.push({ kind: "type", text, durationMs: Math.round(typeSpeedMs(text) * text.length) });
    const isLast = i === phrases.length - 1;
    if (!isLast) {
      steps.push({ kind: "pause", text, durationMs: pauseMs });
      steps.push({ kind: "erase", text, durationMs: Math.round(eraseMsPerChar * text.length) });
    }
  });
  return steps;
}

function easeOutCubic(p) {
  return 1 - Math.pow(1 - p, 3);
}

/** Value shown at `elapsedMs` into a `durationMs` eased count-up to `target`. */
function computeCountFrame(target, elapsedMs, durationMs) {
  if (durationMs <= 0) return target;
  const p = Math.min(1, Math.max(0, elapsedMs / durationMs));
  return Math.round(easeOutCubic(p) * target);
}

function formatCount(value, lang) {
  try {
    return new Intl.NumberFormat(lang === "en" ? "en-US" : "pt-BR").format(value);
  } catch (e) {
    return String(value);
  }
}

function formatMetricDisplay(value, opts, lang) {
  const prefix = (opts && opts.prefix) || "";
  const suffix = (opts && opts.suffix) || "";
  return `${prefix}${formatCount(value, lang)}${suffix}`;
}

/** `matchMediaFn` is injectable so this is testable headlessly. */
function prefersReducedMotion(matchMediaFn) {
  try {
    const mq = matchMediaFn("(prefers-reduced-motion: reduce)");
    return !!(mq && mq.matches);
  } catch (e) {
    return false;
  }
}

function shouldRetypeOnLangChange(prevText, nextText) {
  return typeof nextText === "string" && nextText !== prevText;
}

/** Whether the <head> inline script's 1.5s safety timeout should force
   reveal-fallback — only when motion.js's bootstrap never finished (i.e.
   "motion-ready" never got added to <html>). The inline script duplicates
   this exact check by hand (it must run before motion.js has loaded). */
function shouldForceRevealFallback(hasMotionReadyClass) {
  return !hasMotionReadyClass;
}

function kebabCase(str) {
  return str.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}

/** `motion-<kebab-flag>` class per true flag in a MOTION_CONFIG-shaped object. */
function motionConfigClassNames(config) {
  return Object.keys(config || {})
    .filter((key) => config[key])
    .map((key) => `motion-${kebabCase(key)}`);
}

// --- DOM wiring ---

function getMatchMedia() {
  return typeof window !== "undefined" && window.matchMedia ? window.matchMedia.bind(window) : () => ({ matches: false });
}

function supportsFinePointer() {
  try {
    return window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  } catch (e) {
    return false;
  }
}

const isReducedMotion = prefersReducedMotion(getMatchMedia());

// motion-<flag> classes let pure-CSS effects (e.g. the marquee) key off config.
motionConfigClassNames(MOTION_CONFIG).forEach((name) => document.documentElement.classList.add(name));

// @view-transition can't be scoped by a class, so the flag gates injecting it.
if (MOTION_CONFIG.viewTransitions && !isReducedMotion) {
  const style = document.createElement("style");
  style.textContent = "@view-transition { navigation: auto; }";
  document.head.appendChild(style);
}

// -- Scroll reveal --

let revealObserver; // undefined = not created yet; null = no IO support

/** Lazily creates the shared reveal IntersectionObserver on first use,
   instead of requiring initScrollReveal() to have run first — the
   "motion:grid-rendered" listener can otherwise fire before DOMContentLoaded
   and find no observer, revealing cards outright instead of on scroll. */
function getRevealObserver() {
  if (revealObserver !== undefined) return revealObserver;
  if (typeof IntersectionObserver === "undefined") {
    // No way to reveal on scroll in this browser — show everything now
    // rather than waiting on the <head> script's 1.5s safety timeout.
    document.documentElement.classList.add("reveal-fallback");
    revealObserver = null;
    return null;
  }
  revealObserver = new IntersectionObserver(
    (entries, obs) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          obs.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12 }
  );
  return revealObserver;
}

function groupByParent(nodeList) {
  const groups = [];
  const map = new Map();
  Array.prototype.forEach.call(nodeList, (el) => {
    const parent = el.parentElement;
    if (!map.has(parent)) {
      const arr = [];
      map.set(parent, arr);
      groups.push(arr);
    }
    map.get(parent).push(el);
  });
  return groups;
}

function isAlreadyOnScreen(el) {
  try {
    return el.getBoundingClientRect().top < window.innerHeight;
  } catch (e) {
    return false;
  }
}

function revealElementsWithStagger(elements, observer) {
  elements.forEach((el, i) => {
    el.style.transitionDelay = `${Math.min(i * 70, 420)}ms`;
    if (isAlreadyOnScreen(el)) {
      // Already in (or scrolled past) the viewport: reveal now, with the
      // stagger, instead of waiting on an async IO round trip that would
      // otherwise cause a visible flash for content the user already sees.
      requestAnimationFrame(() => el.classList.add("is-visible"));
    } else if (observer) {
      observer.observe(el);
    } else {
      el.classList.add("is-visible");
    }
  });
}

function revealImmediately(elements) {
  elements.forEach((el) => el.classList.add("is-visible"));
}

function initScrollReveal() {
  // Includes #project-grid's own [data-reveal] cards: the prerendered
  // static cards sit there from first paint, before main.js's fetch even
  // resolves, and must reveal on scroll like everything else in that gap.
  const targets = document.querySelectorAll("[data-reveal]");
  if (!MOTION_CONFIG.scrollReveal) {
    revealImmediately(targets);
    return;
  }
  const observer = getRevealObserver();
  groupByParent(targets).forEach((group) => revealElementsWithStagger(group, observer));
}

function fadeGrid(grid) {
  grid.style.transition = "none";
  grid.style.opacity = "0";
  requestAnimationFrame(() => {
    grid.style.transition = "opacity .25s ease";
    grid.style.opacity = "1";
  });
}

// main.js dispatches this after every grid render (cards are recreated each time).
document.addEventListener("motion:grid-rendered", (e) => {
  const grid = document.getElementById("project-grid");
  if (!grid) return;
  const cards = grid.querySelectorAll("[data-reveal]");
  const initial = !!(e.detail && e.detail.initial);

  if (initial) {
    if (MOTION_CONFIG.scrollReveal) {
      const observer = getRevealObserver();
      groupByParent(cards).forEach((group) => revealElementsWithStagger(group, observer));
    } else {
      revealImmediately(cards);
    }
  } else {
    revealImmediately(cards);
    if (MOTION_CONFIG.scrollReveal && !isReducedMotion) fadeGrid(grid);
  }
});

// -- Count-up metrics --

function animateCount(el) {
  const target = parseInt(el.getAttribute("data-count-to"), 10) || 0;
  const prefix = el.getAttribute("data-count-prefix") || "";
  const suffix = el.getAttribute("data-count-suffix") || "";
  const lang = (typeof getLang === "function" && getLang()) || "pt";
  const duration = 1200;
  let start = null;
  function step(ts) {
    if (start === null) start = ts;
    const elapsed = ts - start;
    const value = computeCountFrame(target, elapsed, duration);
    el.textContent = formatMetricDisplay(value, { prefix, suffix }, lang);
    if (elapsed < duration) requestAnimationFrame(step);
    else el.textContent = formatMetricDisplay(target, { prefix, suffix }, lang);
  }
  requestAnimationFrame(step);
}

function initCountUpMetrics() {
  if (!MOTION_CONFIG.countUpMetrics || isReducedMotion) return;
  const metrics = document.querySelectorAll(".metric-value[data-count-to]");
  if (!metrics.length || typeof IntersectionObserver === "undefined") return;
  const observer = new IntersectionObserver(
    (entries, obs) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        animateCount(entry.target);
        obs.unobserve(entry.target);
      });
    },
    { threshold: 0.4 }
  );
  metrics.forEach((el) => observer.observe(el));
}

// -- Project figures --

function initProjectFigures() {
  if (!MOTION_CONFIG.projectFigures) return;
  const host = document.getElementById("project-figure");
  if (!host) return;

  const observer =
    typeof IntersectionObserver !== "undefined"
      ? new IntersectionObserver(
          (entries) => entries.forEach((entry) => entry.target.classList.toggle("in-view", entry.isIntersecting)),
          { threshold: 0.2 }
        )
      : null;

  function observeFigure() {
    const svg = host.querySelector(".figure-svg");
    if (!svg) return;
    if (observer) observer.observe(svg);
    else svg.classList.add("in-view");
  }

  observeFigure();
  // project.js may fill #project-figure later — MutationObserver catches that.
  if (typeof MutationObserver !== "undefined") {
    new MutationObserver(observeFigure).observe(host, { childList: true });
  }
}

// -- Card spotlight --

function initCardSpotlight() {
  if (!MOTION_CONFIG.cardSpotlight || !supportsFinePointer()) return;
  let pending = false;
  let last = null;
  document.addEventListener("pointermove", (e) => {
    const card = e.target.closest && e.target.closest(".card");
    if (!card) return;
    last = { card, x: e.clientX, y: e.clientY };
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      if (!last) return;
      const rect = last.card.getBoundingClientRect();
      last.card.style.setProperty("--mx", `${last.x - rect.left}px`);
      last.card.style.setProperty("--my", `${last.y - rect.top}px`);
    });
  });
}

// -- Hero parallax --

function initHeroParallax() {
  if (!MOTION_CONFIG.heroParallax) return;
  const hero = document.querySelector(".hero");
  if (!hero) return;

  let intersecting = true;
  const updateInView = () => hero.classList.toggle("in-view", intersecting && document.visibilityState !== "hidden");

  if (typeof IntersectionObserver !== "undefined") {
    new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        intersecting = entry.isIntersecting;
        updateInView();
      });
    }).observe(hero);
  } else {
    updateInView();
  }
  document.addEventListener("visibilitychange", updateInView);

  if (!isReducedMotion && supportsFinePointer()) {
    let pending = false;
    let last = null;
    hero.addEventListener("pointermove", (e) => {
      const rect = hero.getBoundingClientRect();
      const px = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
      const py = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
      last = { px: px * 8, py: py * 8 };
      if (pending) return;
      pending = true;
      requestAnimationFrame(() => {
        pending = false;
        if (!last) return;
        hero.style.setProperty("--hero-px", `${last.px}px`);
        hero.style.setProperty("--hero-py", `${last.py}px`);
      });
    });
  }
}

// -- Header shrink + progress bar --

function initHeaderShrink() {
  if (!MOTION_CONFIG.headerShrink) return;
  const header = document.querySelector(".site-header");
  if (!header) return;
  let ticking = false;
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      header.classList.toggle("is-scrolled", window.scrollY > 24);
      ticking = false;
    });
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
}

function initScrollProgressBar() {
  if (!MOTION_CONFIG.scrollProgressBar) return;
  const bar = document.getElementById("reading-progress-bar");
  if (!bar) return;
  let ticking = false;
  const update = () => {
    const doc = document.documentElement;
    const scrollable = doc.scrollHeight - doc.clientHeight;
    const ratio = scrollable > 0 ? window.scrollY / scrollable : 0;
    bar.style.transform = `scaleX(${Math.min(1, Math.max(0, ratio))})`;
    ticking = false;
  };
  window.addEventListener(
    "scroll",
    () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    },
    { passive: true }
  );
  update();
}

// -- Skeleton loading --

function skeletonCardsHtml(count) {
  const card =
    '<article class="card skeleton-card" aria-hidden="true"><div class="skeleton-block skeleton-shimmer card-media"></div>' +
    '<div class="card-body"><div class="skeleton-line skeleton-shimmer" style="width:70%"></div>' +
    '<div class="skeleton-line skeleton-shimmer" style="width:95%"></div>' +
    '<div class="skeleton-line skeleton-shimmer" style="width:60%"></div></div></article>';
  return new Array(count).fill(card).join("");
}

function initSkeletonLoading() {
  if (!MOTION_CONFIG.skeletonLoading) return;
  const grid = document.getElementById("project-grid");
  if (grid && grid.children.length === 0) grid.innerHTML = skeletonCardsHtml(4);

  const cover = document.getElementById("project-cover");
  if (cover && !cover.innerHTML.trim()) {
    cover.innerHTML = '<div class="skeleton-block skeleton-shimmer" aria-hidden="true"></div>';
  }
  const desc = document.getElementById("project-description");
  if (desc && !desc.textContent.trim()) {
    desc.innerHTML =
      '<span class="skeleton-line skeleton-shimmer" aria-hidden="true" style="display:inline-block;width:100%;height:1em;"></span>';
  }
}

// -- Headline typewriter --

let typewriterTimers = [];
function clearTypewriterTimers() {
  typewriterTimers.forEach((id) => clearTimeout(id));
  typewriterTimers = [];
}

function typeOutText(el, text, charMs, onDone) {
  el.textContent = "";
  let i = 0;
  function step() {
    el.textContent = text.slice(0, i);
    i++;
    if (i <= text.length) typewriterTimers.push(setTimeout(step, charMs));
    else if (onDone) onDone();
  }
  step();
}

function eraseText(el, text, charMs, onDone) {
  let i = text.length;
  function step() {
    el.textContent = text.slice(0, i);
    i--;
    if (i >= 0) typewriterTimers.push(setTimeout(step, charMs));
    else if (onDone) onDone();
  }
  step();
}

function runHeadlineCycle(el, phrases, opts) {
  clearTypewriterTimers();
  function playPhrase(i) {
    if (i >= phrases.length) return;
    const text = phrases[i];
    const isLast = i === phrases.length - 1;
    typeOutText(el, text, typeSpeedMs(text), () => {
      if (isLast) return; // stop here; caret keeps blinking via CSS
      typewriterTimers.push(
        setTimeout(() => {
          eraseText(el, text, opts.eraseMsPerChar, () => playPhrase(i + 1));
        }, opts.pauseMs)
      );
    });
  }
  playPhrase(0);
}

function initHeadlineTypewriter() {
  if (!MOTION_CONFIG.typewriterHeadline || isReducedMotion) return;
  const el = document.getElementById("hero-role-type");
  if (!el) return;
  const caret = document.querySelector(".motion-caret");
  if (caret) caret.classList.add("is-active");

  let finalized = false;
  let currentLang = null;

  function phrasesFor() {
    const main = typeof t === "function" ? t("hero_role") : el.textContent;
    if (!MOTION_CONFIG.rotateHeadline) return [main];
    const rotates = [t("hero_rotate_1"), t("hero_rotate_2"), t("hero_rotate_3")].filter(Boolean);
    return [main, ...rotates, main];
  }

  function startCycle() {
    finalized = true;
    currentLang = typeof getLang === "function" ? getLang() : "pt";
    runHeadlineCycle(el, phrasesFor(), { pauseMs: 2500, eraseMsPerChar: 20 });
  }

  const settleTimer = setTimeout(startCycle, 800);

  document.addEventListener(
    "i18n:overrides-settled",
    () => {
      clearTimeout(settleTimer);
      if (!finalized) {
        startCycle();
        return;
      }
      // Arrived late: just swap the text in place, no retype, per spec.
      const mainText = typeof t === "function" ? t("hero_role") : "";
      if (shouldRetypeOnLangChange(el.textContent, mainText)) {
        clearTypewriterTimers();
        el.textContent = mainText;
      }
    },
    { once: true }
  );

  document.addEventListener("i18n:applied", () => {
    if (!finalized) return; // still waiting for the initial settle
    const lang = typeof getLang === "function" ? getLang() : "pt";
    if (lang === currentLang) return;
    currentLang = lang;
    const mainText = typeof t === "function" ? t("hero_role") : "";
    clearTypewriterTimers();
    typeOutText(el, mainText, typeSpeedMs(mainText));
  });

  const hero = document.querySelector(".hero");
  if (hero && typeof IntersectionObserver !== "undefined") {
    new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) clearTypewriterTimers();
      });
    }).observe(hero);
  }
}

// -- Bootstrap --

function initMotion() {
  initSkeletonLoading();
  initScrollReveal();
  initCountUpMetrics();
  initProjectFigures();
  initCardSpotlight();
  initHeroParallax();
  initHeaderShrink();
  initScrollProgressBar();
  initHeadlineTypewriter();
  // Tells the <head> inline script's safety timeout that bootstrap
  // finished — it only forces reveal-fallback if this never got added.
  document.documentElement.classList.add("motion-ready");
}

document.addEventListener("DOMContentLoaded", initMotion);
