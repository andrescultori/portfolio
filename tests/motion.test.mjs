import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { readFileSync } from "node:fs";

/* js/motion.js is a browser classic script (no import/export), loaded into
   a minimal node:vm sandbox with just enough window/document stubbing for
   its top-level code (the "js" class add, the 1.5s fallback timer) to run
   without throwing. The pure functions it exposes on the sandbox global
   are then called directly, with no real DOM/IntersectionObserver. */

const TESTS_DIR = path.dirname(fileURLToPath(import.meta.url));
const MOTION_SRC = readFileSync(path.join(TESTS_DIR, "..", "js", "motion.js"), "utf8");

function makeFakeElement(attrs = {}) {
  const classListSet = new Set();
  const attributes = { ...attrs };
  return {
    style: {},
    attributes,
    classList: {
      add: (...names) => names.forEach((n) => classListSet.add(n)),
      toggle: (n, force) => {
        const shouldAdd = force !== undefined ? force : !classListSet.has(n);
        if (shouldAdd) classListSet.add(n);
        else classListSet.delete(n);
        return shouldAdd;
      },
      contains: (n) => classListSet.has(n),
    },
    setAttribute: (k, v) => {
      attributes[k] = v;
    },
    getAttribute: (k) => (k in attributes ? attributes[k] : null),
    hasAttribute: (k) => k in attributes,
    appendChild: () => {},
    parentElement: null,
    children: [],
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: () => {},
  };
}

function loadMotionSandbox() {
  const listeners = {};
  const documentElement = makeFakeElement();
  const fakeDocument = {
    documentElement,
    querySelector: () => null,
    querySelectorAll: () => [],
    getElementById: () => null,
    addEventListener: (type, fn) => {
      (listeners[type] = listeners[type] || []).push(fn);
    },
  };
  const sandbox = {
    document: fakeDocument,
    window: {
      matchMedia: () => ({ matches: false }),
      addEventListener: () => {},
      requestAnimationFrame: () => 0,
      setTimeout,
      clearTimeout,
      scrollY: 0,
    },
    IntersectionObserver: undefined,
    setTimeout,
    clearTimeout,
    console,
  };
  vm.createContext(sandbox);
  vm.runInContext(MOTION_SRC, sandbox, { filename: "js/motion.js" });
  // DOMContentLoaded never fires in this sandbox (no real event loop wiring
  // for it), so initMotion()'s DOM-wiring functions are never called here —
  // only the pure helpers below are exercised directly.
  return sandbox;
}

const sandbox = loadMotionSandbox();

// --- easeOutCubic / formatCount --------------------------------------------

test("easeOutCubic starts at 0, ends at 1, and is monotonically increasing", () => {
  assert.equal(sandbox.easeOutCubic(0), 0);
  assert.equal(sandbox.easeOutCubic(1), 1);
  const samples = [0, 0.25, 0.5, 0.75, 1].map((t) => sandbox.easeOutCubic(t));
  for (let i = 1; i < samples.length; i++) {
    assert.ok(samples[i] >= samples[i - 1]);
  }
});

test("formatCount rounds to an integer by default and respects decimals/prefix/suffix", () => {
  assert.equal(sandbox.formatCount(9.6, 0, "", ""), "10");
  assert.equal(sandbox.formatCount(9.6, 1, "~", "%"), "~9.6%");
  assert.equal(sandbox.formatCount(0, 0, "", "+"), "0+");
});

// --- revealDelayMs: own data-reveal-delay wins over a parent's stagger -----

test("revealDelayMs uses the element's own data-reveal-delay when present", () => {
  const el = makeFakeElement({ "data-reveal-delay": "120" });
  assert.equal(sandbox.revealDelayMs(el), 120);
});

test("revealDelayMs computes index * data-reveal-stagger from the parent when no own delay is set", () => {
  const parent = makeFakeElement({ "data-reveal-stagger": "80" });
  const a = makeFakeElement();
  a.setAttribute("data-reveal", "");
  const b = makeFakeElement();
  b.setAttribute("data-reveal", "");
  parent.children = [a, b];
  a.parentElement = parent;
  b.parentElement = parent;
  assert.equal(sandbox.revealDelayMs(a), 0);
  assert.equal(sandbox.revealDelayMs(b), 80);
});

test("revealDelayMs is 0 with no own delay and no parent stagger", () => {
  const el = makeFakeElement();
  el.parentElement = makeFakeElement();
  assert.equal(sandbox.revealDelayMs(el), 0);
});

// --- growDelayMs: same staggering, for [data-grow] siblings -----------------

test("growDelayMs computes index * data-grow-stagger from the parent", () => {
  const parent = makeFakeElement({ "data-grow-stagger": "60" });
  const a = makeFakeElement();
  a.setAttribute("data-grow", "");
  const b = makeFakeElement();
  b.setAttribute("data-grow", "");
  const c = makeFakeElement();
  c.setAttribute("data-grow", "");
  parent.children = [a, b, c];
  [a, b, c].forEach((el) => {
    el.parentElement = parent;
  });
  assert.equal(sandbox.growDelayMs(a), 0);
  assert.equal(sandbox.growDelayMs(b), 60);
  assert.equal(sandbox.growDelayMs(c), 120);
});

test("growDelayMs is 0 when the parent has no data-grow-stagger", () => {
  const el = makeFakeElement();
  el.parentElement = makeFakeElement();
  assert.equal(sandbox.growDelayMs(el), 0);
});

// --- REDUCED_MOTION ---------------------------------------------------------
// The "js" class + reveal-fallback safety timer live in an inline <head>
// script on every page (public-chrome.mjs's BOOTSTRAP_SCRIPT), not in this
// file — see motion-dist.test.mjs for that. motion.js only has to add
// "motion-ready" once initMotion() finishes (exercised via real DOM in
// the browser; not re-tested here with this DOM-less sandbox).

test("REDUCED_MOTION reflects matchMedia(prefers-reduced-motion: reduce) at load time", () => {
  assert.equal(typeof sandbox.REDUCED_MOTION, "boolean");
  assert.equal(sandbox.REDUCED_MOTION, false); // this sandbox's matchMedia always returns matches: false
});
