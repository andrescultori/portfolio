import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { readFileSync } from "node:fs";

import { filterMetrics, renderMetricsHtml, substituteMetrics, fetchSiteSettings } from "../scripts/lib/site-settings.mjs";

const TESTS_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(TESTS_DIR, "..");

function validMetric(overrides) {
  return {
    value: 10,
    prefix: "",
    suffix: "+",
    label: { pt: "Rótulo", en: "Label" },
    visible: true,
    ...overrides,
  };
}

// --- filterMetrics ---------------------------------------------------------

test("filterMetrics returns null for empty, missing, or non-array input", () => {
  assert.equal(filterMetrics([]), null);
  assert.equal(filterMetrics(undefined), null);
  assert.equal(filterMetrics(null), null);
  assert.equal(filterMetrics("not an array"), null);
  assert.equal(filterMetrics({}), null);
});

test("filterMetrics keeps a valid item and normalizes its shape", () => {
  const result = filterMetrics([validMetric()]);
  assert.deepEqual(result, [{ value: 10, prefix: "", suffix: "+", label: { pt: "Rótulo", en: "Label" }, visible: true }]);
});

test("filterMetrics caps the result at 6 items", () => {
  const items = Array.from({ length: 8 }, (_, i) => validMetric({ value: i }));
  const result = filterMetrics(items);
  assert.equal(result.length, 6);
  assert.equal(result[0].value, 0);
  assert.equal(result[5].value, 5);
});

test("filterMetrics rejects a non-integer, negative, or too-large value", () => {
  const result = filterMetrics([
    validMetric({ value: 1.5 }),
    validMetric({ value: -1 }),
    validMetric({ value: 1000000 }),
    validMetric({ value: 999999 }), // the one valid item
  ]);
  assert.equal(result.length, 1);
  assert.equal(result[0].value, 999999);
});

test("filterMetrics rejects prefix/suffix outside the allowed charset or too long", () => {
  const result = filterMetrics([
    validMetric({ prefix: "$" }), // not in the allowed set
    validMetric({ suffix: "abcd" }), // too long (4 chars)
    validMetric({ prefix: "~+%" }), // valid: 3 chars, all allowed
  ]);
  assert.equal(result.length, 1);
  assert.equal(result[0].prefix, "~+%");
});

test("filterMetrics accepts every character in the allowed affix set", () => {
  const result = filterMetrics([validMetric({ prefix: "~+%", suffix: "xkM" })]);
  assert.equal(result.length, 1);
});

test("filterMetrics rejects a label over 40 characters in either language", () => {
  const tooLong = "x".repeat(41);
  const result = filterMetrics([
    validMetric({ label: { pt: tooLong, en: "ok" } }),
    validMetric({ label: { pt: "ok", en: tooLong } }),
    validMetric({ label: { pt: "x".repeat(40), en: "x".repeat(40) } }), // exactly at the limit
  ]);
  assert.equal(result.length, 1);
  assert.equal(result[0].label.pt.length, 40);
});

test("filterMetrics defaults visible to true, but respects an explicit false", () => {
  const result = filterMetrics([validMetric({ visible: undefined }), validMetric({ visible: false })]);
  assert.equal(result[0].visible, true);
  assert.equal(result[1].visible, false);
});

test("filterMetrics returns null when every item is invalid", () => {
  assert.equal(filterMetrics([validMetric({ value: -5 }), validMetric({ prefix: "$$$$" })]), null);
});

test("filterMetrics drops a visible item with no PT label (would render as a bare number)", () => {
  const result = filterMetrics([
    validMetric({ value: 1, label: { pt: "", en: "has en only" } }),
    validMetric({ value: 2, label: { pt: "   ", en: "" } }), // whitespace-only PT
    validMetric({ value: 3 }), // the one valid item
  ]);
  assert.equal(result.length, 1);
  assert.equal(result[0].value, 3);
});

test("filterMetrics keeps a hidden item even without a PT label — it never renders anyway", () => {
  const result = filterMetrics([validMetric({ value: 1, visible: false, label: { pt: "", en: "" } })]);
  assert.equal(result.length, 1);
  assert.equal(result[0].value, 1);
});

// --- renderMetricsHtml ------------------------------------------------------

test("renderMetricsHtml renders final values and escapes label HTML", () => {
  const html = renderMetricsHtml(filterMetrics([validMetric({ value: 42, label: { pt: '<script>x</script>', en: "safe" } })]));
  assert.ok(html.includes('data-count-to="42"'));
  assert.ok(html.includes("42+"));
  assert.ok(!html.includes("<script>x</script>"));
  assert.ok(html.includes("&lt;script&gt;"));
});

test("renderMetricsHtml does not render a hidden (visible: false) item", () => {
  const metrics = filterMetrics([validMetric({ value: 1 }), validMetric({ value: 2, visible: false })]);
  const html = renderMetricsHtml(metrics);
  assert.ok(html.includes('data-count-to="1"'));
  assert.ok(!html.includes('data-count-to="2"'));
});

test("renderMetricsHtml composes the aria-label from prefix+value+suffix+label", () => {
  const metrics = filterMetrics([validMetric({ value: 80, prefix: "~", suffix: "%", label: { pt: "menos custo", en: "less cost" } })]);
  const html = renderMetricsHtml(metrics);
  assert.ok(html.includes('aria-label="~80% menos custo"'));
});

test("renderMetricsHtml marks every item data-custom-metric (so the client re-derives language, not the fixed I18N table)", () => {
  const html = renderMetricsHtml(filterMetrics([validMetric()]));
  assert.ok(html.includes("data-custom-metric"));
});

// --- substituteMetrics (the build-time marker replace) ---------------------

test("substituteMetrics is a no-op (returns html unchanged) when there is no override", () => {
  const html = '<div class="metrics-grid"><!-- PRERENDER:METRICS:START --><div class="metric">default</div><!-- PRERENDER:METRICS:END --></div>';
  assert.equal(substituteMetrics(html, null), html);
});

test("substituteMetrics replaces the marker block with the override's rendered HTML", () => {
  const html = '<div class="metrics-grid"><!-- PRERENDER:METRICS:START --><div class="metric">default</div><!-- PRERENDER:METRICS:END --></div>';
  const out = substituteMetrics(html, filterMetrics([validMetric({ value: 7 })]));
  assert.ok(!out.includes(">default<"));
  assert.ok(out.includes('data-count-to="7"'));
  assert.ok(out.includes("<!-- PRERENDER:METRICS:START -->"));
  assert.ok(out.includes("<!-- PRERENDER:METRICS:END -->"));
});

test("substituteMetrics throws if an override needs applying but the markers are missing", () => {
  assert.throws(() => substituteMetrics("<div class=\"metrics-grid\"></div>", filterMetrics([validMetric()])));
});

// --- fetchSiteSettings: metrics fallback on empty/missing/404 --------------

test("fetchSiteSettings.settings.metrics falls back to null when the row's metrics is empty", async () => {
  const fakeFetch = async () => ({ ok: true, json: async () => [{ metrics: [] }] });
  const result = await fetchSiteSettings({ supabaseUrl: "https://fake.supabase.co", supabaseKey: "key", fetchImpl: fakeFetch });
  assert.equal(result.settings.metrics, null);
});

test("fetchSiteSettings falls back to code defaults (settings: null) on a 404 (column doesn't exist yet)", async () => {
  const fakeFetch = async () => ({ ok: false, status: 404 });
  const result = await fetchSiteSettings({ supabaseUrl: "https://fake.supabase.co", supabaseKey: "key", fetchImpl: fakeFetch });
  assert.equal(result.source, "default");
  assert.equal(result.settings, null);
});

// --- home page: metrics strip retired -----------------------------------
// The redesign removes the home page's metrics (KPI) strip entirely (see
// the PR description's "Needs André's decision" section) — index.html,
// the PRERENDER:METRICS markers, and js/site-data.js/i18n.js/social.js
// (client-side) no longer exist. filterMetrics/renderMetricsHtml/
// substituteMetrics above stay tested as pure functions: the admin KPI
// editor and its portfolio_site_settings.metrics column are intentionally
// left in place, just no longer rendered on the public site.

test("render-home.mjs never renders a metrics strip", () => {
  const html = readFileSync(path.join(REPO_ROOT, "scripts", "lib", "render-home.mjs"), "utf8");
  assert.ok(!html.includes("metrics-grid"), "render-home.mjs should not reference the retired metrics-grid markup");
});
