import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { readFileSync } from "node:fs";

/* js/motion.js is a browser classic script (no import/export — same as every
   other js/*.js file here), so it's loaded into a minimal node:vm sandbox
   with just enough window/document stubbing for its top-level code (config
   classes, @view-transition injection, the "motion:grid-rendered" listener
   registration) to run without throwing. The pure functions this file
   exposes on `globalThis` are then called directly, with no DOM involved. */

const TESTS_DIR = path.dirname(fileURLToPath(import.meta.url));
const MOTION_SRC = readFileSync(path.join(TESTS_DIR, "..", "js", "motion.js"), "utf8");

function makeFakeElement() {
  const classListSet = new Set();
  return {
    style: {},
    classList: {
      add: (...names) => names.forEach((n) => classListSet.add(n)),
      toggle: () => {},
      contains: (n) => classListSet.has(n),
    },
    setAttribute: () => {},
    getAttribute: () => null,
    appendChild: () => {},
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: () => {},
  };
}

function loadMotionSandbox() {
  const listeners = {};
  const documentElement = makeFakeElement();
  const head = makeFakeElement();
  const fakeDocument = {
    documentElement,
    head,
    createElement: () => makeFakeElement(),
    querySelector: () => null,
    querySelectorAll: () => [],
    getElementById: () => null,
    addEventListener: (type, fn) => {
      (listeners[type] = listeners[type] || []).push(fn);
    },
    visibilityState: "visible",
  };
  const sandbox = {
    document: fakeDocument,
    window: {
      matchMedia: () => ({ matches: false }),
    },
    navigator: {},
    IntersectionObserver: undefined,
    MutationObserver: undefined,
    requestAnimationFrame: () => 0,
    setTimeout,
    clearTimeout,
    console,
  };
  sandbox.window.document = fakeDocument;
  vm.createContext(sandbox);
  vm.runInContext(MOTION_SRC, sandbox, { filename: "js/motion.js" });
  return sandbox;
}

const sandbox = loadMotionSandbox();

// --- typeSpeedMs ---------------------------------------------------------

test("typeSpeedMs caps a long phrase at ~1.4s total and never exceeds 40ms/char", () => {
  assert.equal(sandbox.typeSpeedMs(""), 40);
  assert.equal(sandbox.typeSpeedMs("a"), 40);
  assert.equal(sandbox.typeSpeedMs("x".repeat(35)), 40);
  assert.equal(sandbox.typeSpeedMs("x".repeat(70)), 20);
  assert.ok(sandbox.typeSpeedMs("x".repeat(140)) <= 40);
});

// --- buildTypewriterPlan --------------------------------------------------

test("buildTypewriterPlan types main -> rotates -> main with no trailing erase", () => {
  const plan = sandbox.buildTypewriterPlan("Main", ["R1", "R2", "R3"], { pauseMs: 2500, eraseMsPerChar: 20 });
  // plan is built inside the vm sandbox's own realm, so its array compares
  // unequal to a same-content literal array via deepStrictEqual (different
  // Array.prototype) — comparing the JSON serialization sidesteps that.
  const kinds = Array.from(plan, (s) => s.kind);
  assert.equal(
    JSON.stringify(kinds),
    JSON.stringify([
      "type", "pause", "erase",
      "type", "pause", "erase",
      "type", "pause", "erase",
      "type", "pause", "erase",
      "type",
    ])
  );
  assert.equal(plan[0].text, "Main");
  assert.equal(plan.at(-1).text, "Main");
  assert.equal(plan.at(-1).kind, "type");
});

test("buildTypewriterPlan works with zero rotate phrases (just main twice, once typed)", () => {
  const plan = sandbox.buildTypewriterPlan("Solo", [], { pauseMs: 100, eraseMsPerChar: 10 });
  assert.equal(JSON.stringify(Array.from(plan, (s) => s.kind)), JSON.stringify(["type", "pause", "erase", "type"]));
});

test("buildTypewriterPlan step durations follow typeSpeedMs / fixed erase rate", () => {
  const plan = sandbox.buildTypewriterPlan("abcd", [], { pauseMs: 999, eraseMsPerChar: 20 });
  const typeStep = plan[0];
  const pauseStep = plan[1];
  const eraseStep = plan[2];
  assert.equal(typeStep.durationMs, Math.round(sandbox.typeSpeedMs("abcd") * 4));
  assert.equal(pauseStep.durationMs, 999);
  assert.equal(eraseStep.durationMs, 80);
});

// --- computeCountFrame / easing ------------------------------------------

test("computeCountFrame starts at 0 and reaches target exactly at duration", () => {
  assert.equal(sandbox.computeCountFrame(10, 0, 1200), 0);
  assert.equal(sandbox.computeCountFrame(10, 1200, 1200), 10);
  assert.equal(sandbox.computeCountFrame(80, 5000, 1200), 80); // clamps past duration
});

test("computeCountFrame is monotonically non-decreasing over time", () => {
  const samples = [0, 100, 300, 600, 900, 1200].map((ms) => sandbox.computeCountFrame(80, ms, 1200));
  for (let i = 1; i < samples.length; i++) {
    assert.ok(samples[i] >= samples[i - 1], `${samples[i]} should be >= ${samples[i - 1]}`);
  }
});

test("computeCountFrame handles a zero/negative duration by returning the target", () => {
  assert.equal(sandbox.computeCountFrame(10, 0, 0), 10);
});

// --- formatCount / formatMetricDisplay ------------------------------------

test("formatMetricDisplay composes prefix + formatted value + suffix", () => {
  assert.equal(sandbox.formatMetricDisplay(10, { suffix: "+" }, "pt"), "10+");
  assert.equal(sandbox.formatMetricDisplay(80, { prefix: "~", suffix: "%" }, "en"), "~80%");
  assert.equal(sandbox.formatMetricDisplay(15, {}, "pt"), "15");
});

test("formatCount never throws for pt/en and falls back to String on bad input", () => {
  assert.equal(sandbox.formatCount(10, "pt"), "10");
  assert.equal(sandbox.formatCount(10, "en"), "10");
});

// --- prefersReducedMotion (injectable matchMedia) -------------------------

test("prefersReducedMotion reflects the injected matchMedia result", () => {
  assert.equal(sandbox.prefersReducedMotion(() => ({ matches: true })), true);
  assert.equal(sandbox.prefersReducedMotion(() => ({ matches: false })), false);
});

test("prefersReducedMotion fails safe (false) if matchMedia throws or is missing", () => {
  assert.equal(sandbox.prefersReducedMotion(() => { throw new Error("no matchMedia"); }), false);
  assert.equal(sandbox.prefersReducedMotion(undefined), false);
});

// --- shouldRetypeOnLangChange ---------------------------------------------

test("shouldRetypeOnLangChange only true when the text actually changed", () => {
  assert.equal(sandbox.shouldRetypeOnLangChange("BI Analyst", "Analista de BI"), true);
  assert.equal(sandbox.shouldRetypeOnLangChange("Analista de BI", "Analista de BI"), false);
});

// --- motionConfigClassNames / kebabCase -----------------------------------

test("motionConfigClassNames emits motion-<kebab> only for true flags", () => {
  const names = Array.from(
    sandbox.motionConfigClassNames({ rotateHeadline: true, heroParallax: false, toolsMarquee: true })
  ).sort();
  assert.equal(JSON.stringify(names), JSON.stringify(["motion-rotate-headline", "motion-tools-marquee"]));
});

// --- shouldForceRevealFallback --------------------------------------------

test("shouldForceRevealFallback is true only when motion-ready never landed", () => {
  assert.equal(sandbox.shouldForceRevealFallback(false), true);
  assert.equal(sandbox.shouldForceRevealFallback(true), false);
});

// --- getRevealObserver (on-demand creation) -------------------------------

test("getRevealObserver forces reveal-fallback immediately when IntersectionObserver is unsupported", () => {
  // This sandbox has no IntersectionObserver (see loadMotionSandbox), so
  // calling it should add the fallback class right away rather than make
  // the <head> script's 1.5s timer the only way content ever becomes visible.
  assert.equal(sandbox.document.documentElement.classList.contains("reveal-fallback"), false);
  const observer = sandbox.getRevealObserver();
  assert.equal(observer, null);
  assert.equal(sandbox.document.documentElement.classList.contains("reveal-fallback"), true);
});

test("getRevealObserver caches its result instead of recomputing on every call", () => {
  const first = sandbox.getRevealObserver();
  const second = sandbox.getRevealObserver();
  assert.equal(first, second);
});

// --- metrics (KPI strip) validation — mirrors scripts/lib/site-settings.mjs ---

function validMetric(overrides) {
  return { value: 10, prefix: "", suffix: "+", label: { pt: "Rótulo", en: "Label" }, visible: true, ...overrides };
}

test("motion.js's filterMetrics matches the Node-side contract: null on empty/invalid, caps at 6", () => {
  assert.equal(sandbox.filterMetrics([]), null);
  assert.equal(sandbox.filterMetrics(null), null);
  const capped = sandbox.filterMetrics(Array.from({ length: 8 }, (_, i) => validMetric({ value: i })));
  assert.equal(capped.length, 6);
});

test("motion.js's filterMetrics rejects bad values/affixes/labels the same way as the Node version", () => {
  const result = sandbox.filterMetrics([
    validMetric({ value: -1 }),
    validMetric({ prefix: "$" }),
    validMetric({ label: { pt: "x".repeat(41), en: "ok" } }),
    validMetric({ value: 42 }),
  ]);
  assert.equal(JSON.stringify(Array.from(result, (m) => m.value)), JSON.stringify([42]));
});

test("desiredMetricsSignature drops hidden items and keeps only the comparable fields", () => {
  const sig = sandbox.desiredMetricsSignature([
    validMetric({ value: 1 }),
    validMetric({ value: 2, visible: false }),
  ]);
  assert.equal(JSON.stringify(Array.from(sig)), JSON.stringify([{ value: 1, prefix: "", suffix: "+", labelPt: "Rótulo" }]));
});

test("metricsSignaturesEqual compares by value, not by reference", () => {
  const a = [{ value: 1, prefix: "", suffix: "+", labelPt: "x" }];
  const b = [{ value: 1, prefix: "", suffix: "+", labelPt: "x" }];
  assert.equal(sandbox.metricsSignaturesEqual(a, b), true);
  assert.equal(sandbox.metricsSignaturesEqual(a, [{ value: 2, prefix: "", suffix: "+", labelPt: "x" }]), false);
});

test("the real MOTION_CONFIG only has boolean flags, one per effect", () => {
  const config = sandbox.MOTION_CONFIG;
  assert.ok(config && Object.keys(config).length >= 10);
  Object.values(config).forEach((v) => assert.equal(typeof v, "boolean"));
});
