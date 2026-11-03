import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { readFileSync } from "node:fs";

/* js/admin.js is a browser classic script (no import/export), loaded here
   via node:vm the same way tests/motion.test.mjs loads js/motion.js — its
   top level only declares functions/consts and registers two listeners
   (window "beforeunload", document "DOMContentLoaded" -> init()), neither
   of which this harness ever fires, so init() (real Supabase calls, full
   DOM) never runs. Only the pure/near-pure metrics helpers are exercised. */

const TESTS_DIR = path.dirname(fileURLToPath(import.meta.url));
const ADMIN_SRC = readFileSync(path.join(TESTS_DIR, "..", "js", "admin.js"), "utf8");

function makeFakeElement() {
  const classListSet = new Set();
  return {
    style: {},
    className: "",
    textContent: "",
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

function loadAdminSandbox() {
  const elementsById = new Map();
  const fakeDocument = {
    documentElement: makeFakeElement(),
    createElement: () => makeFakeElement(),
    querySelector: () => null,
    querySelectorAll: () => [],
    getElementById: (id) => {
      if (!elementsById.has(id)) elementsById.set(id, makeFakeElement());
      return elementsById.get(id);
    },
    addEventListener: () => {},
  };
  const sandbox = {
    document: fakeDocument,
    window: { addEventListener: () => {}, supabase: undefined },
    SUPABASE_URL: "https://fake.supabase.co",
    SUPABASE_PUBLISHABLE_KEY: "fake-key",
    console,
  };
  vm.createContext(sandbox);
  vm.runInContext(ADMIN_SRC, sandbox, { filename: "js/admin.js" });
  return sandbox;
}

const sandbox = loadAdminSandbox();

test("DEFAULT_METRICS has the 4 real defaults, one per metrics-strip item", () => {
  assert.equal(sandbox.DEFAULT_METRICS.length, 4);
  sandbox.DEFAULT_METRICS.forEach((m) => {
    assert.equal(typeof m.value, "number");
    assert.ok(m.label.pt.length > 0);
    assert.equal(m.visible, true);
  });
});

test("metricsToSave saves [] when the draft is identical to DEFAULT_METRICS (still means 'use the defaults')", () => {
  const sameAsDefault = JSON.parse(JSON.stringify(sandbox.DEFAULT_METRICS));
  // sandbox.metricsToSave's [] is built inside the vm realm, so compare by
  // serialized value rather than assert.deepEqual (which also checks
  // prototype identity, and the vm's Array.prototype is a different object).
  assert.equal(JSON.stringify(Array.from(sandbox.metricsToSave(sameAsDefault))), "[]");
});

test("metricsToSave saves the draft as-is when it actually differs from DEFAULT_METRICS", () => {
  const edited = JSON.parse(JSON.stringify(sandbox.DEFAULT_METRICS));
  edited[0].value = 999;
  const saved = sandbox.metricsToSave(edited);
  assert.equal(saved, edited);
  assert.equal(saved[0].value, 999);
});

test("validateMetricsDraft requires a PT label on a visible item, with a clear message", () => {
  sandbox.METRICS_DRAFT = [{ value: 5, prefix: "", suffix: "+", label: { pt: "", en: "" }, visible: true }];
  const statusEl = sandbox.document.getElementById("s-metrics-status");
  const result = sandbox.validateMetricsDraft();
  assert.equal(result, null);
  assert.match(statusEl.textContent, /Indicador 1: preencha o rótulo em português\./);
});

test("validateMetricsDraft allows a hidden item with no PT label", () => {
  sandbox.METRICS_DRAFT = [{ value: 5, prefix: "", suffix: "+", label: { pt: "", en: "" }, visible: false }];
  const result = sandbox.validateMetricsDraft();
  assert.notEqual(result, null);
  assert.equal(result.length, 1);
  assert.equal(result[0].visible, false);
});

test("validateMetricsDraft returns a clean, trimmed array for a valid draft", () => {
  sandbox.METRICS_DRAFT = [{ value: 42, prefix: "~", suffix: "%", label: { pt: " Rótulo ", en: " Label " }, visible: true }];
  const result = sandbox.validateMetricsDraft();
  assert.equal(
    JSON.stringify(Array.from(result)),
    JSON.stringify([{ value: 42, prefix: "~", suffix: "%", label: { pt: "Rótulo", en: "Label" }, visible: true }])
  );
});

test("cloneMetrics returns a deep copy — mutating the clone never touches the original", () => {
  const original = [{ value: 1, prefix: "", suffix: "", label: { pt: "x", en: "y" }, visible: true }];
  const clone = sandbox.cloneMetrics(original);
  clone[0].value = 99;
  clone[0].label.pt = "changed";
  assert.equal(original[0].value, 1);
  assert.equal(original[0].label.pt, "x");
});
