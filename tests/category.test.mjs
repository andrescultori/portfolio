import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { readFileSync } from "node:fs";

import {
  isValidCategory,
  isValidPowerBiUrl,
  validateProject,
  BuildValidationError,
} from "../scripts/lib/validate.mjs";
import { mapJsonProject } from "../scripts/lib/json-source.mjs";
import { mapSupabaseRow } from "../scripts/lib/supabase-source.mjs";
import { renderCardHtml, categoryLabelPt } from "../scripts/lib/render-card.mjs";
import { renderProjectPage } from "../scripts/lib/render-project-page.mjs";

const TESTS_DIR = path.dirname(fileURLToPath(import.meta.url));

function baseProject(overrides = {}) {
  return {
    slug: "demo",
    title: "Demo",
    cardImage: "",
    screenshots: [],
    description: { pt: "Descrição", en: "Description" },
    stack: ["Python"],
    links: {},
    note: null,
    commercial: false,
    featured: false,
    sortOrder: 0,
    draft: false,
    category: "apps",
    caseStudy: null,
    powerbiUrl: "",
    ...overrides,
  };
}

// --- validate.mjs: category ------------------------------------------------

test("isValidCategory accepts the three known categories, rejects anything else", () => {
  assert.equal(isValidCategory("data-bi"), true);
  assert.equal(isValidCategory("automation"), true);
  assert.equal(isValidCategory("apps"), true);
  assert.equal(isValidCategory("other"), false);
  assert.equal(isValidCategory(""), false);
  assert.equal(isValidCategory(null), false);
  assert.equal(isValidCategory(undefined), false);
});

test("validateProject rejects an invalid category", () => {
  assert.throws(
    () => validateProject(baseProject({ category: "bi" }), "test"),
    BuildValidationError
  );
});

test("validateProject accepts a project with no category set (defaulting happens in the source mappers, not here)", () => {
  assert.doesNotThrow(() => validateProject(baseProject({ category: undefined }), "test"));
});

// --- validate.mjs: powerbi_url ----------------------------------------------

test("isValidPowerBiUrl accepts only https:// on app.powerbi.com exactly", () => {
  assert.equal(isValidPowerBiUrl("https://app.powerbi.com/view?r=abc"), true);
  assert.equal(isValidPowerBiUrl("http://app.powerbi.com/view?r=abc"), false, "must be https");
  assert.equal(isValidPowerBiUrl("https://evil.com/app.powerbi.com"), false, "host must match exactly");
  assert.equal(isValidPowerBiUrl("https://app.powerbi.com.evil.com/x"), false, "no suffix tricks");
  assert.equal(isValidPowerBiUrl("not a url"), false);
  assert.equal(isValidPowerBiUrl(""), false);
  assert.equal(isValidPowerBiUrl(null), false);
});

test("validateProject rejects a powerbiUrl on the wrong host", () => {
  assert.throws(
    () => validateProject(baseProject({ powerbiUrl: "https://notpowerbi.com/x" }), "test"),
    BuildValidationError
  );
});

test("validateProject accepts an empty powerbiUrl (optional field)", () => {
  assert.doesNotThrow(() => validateProject(baseProject({ powerbiUrl: "" }), "test"));
});

// --- source mappers ----------------------------------------------------------

test("mapJsonProject defaults category to 'apps' and caseStudy/powerbiUrl to empty when absent", () => {
  const mapped = mapJsonProject({ slug: "x", title: "X" });
  assert.equal(mapped.category, "apps");
  assert.equal(mapped.caseStudy, null);
  assert.equal(mapped.powerbiUrl, "");
});

test("mapJsonProject passes through an explicit category, caseStudy and powerbiUrl", () => {
  const caseStudy = { problem: { pt: "P", en: "P" } };
  const mapped = mapJsonProject({
    slug: "x",
    title: "X",
    category: "data-bi",
    caseStudy,
    powerbiUrl: "https://app.powerbi.com/view?r=1",
  });
  assert.equal(mapped.category, "data-bi");
  assert.deepEqual(mapped.caseStudy, caseStudy);
  assert.equal(mapped.powerbiUrl, "https://app.powerbi.com/view?r=1");
});

test("mapSupabaseRow defaults category to 'apps' and caseStudy/powerbiUrl to empty when absent", () => {
  const mapped = mapSupabaseRow({ slug: "x", title: "X" });
  assert.equal(mapped.category, "apps");
  assert.equal(mapped.caseStudy, null);
  assert.equal(mapped.powerbiUrl, "");
});

test("mapSupabaseRow reads category, case_study and powerbi_url from their snake_case columns", () => {
  const caseStudy = { problem: { pt: "P", en: "P" } };
  const mapped = mapSupabaseRow({
    slug: "x",
    title: "X",
    category: "automation",
    case_study: caseStudy,
    powerbi_url: "https://app.powerbi.com/view?r=1",
  });
  assert.equal(mapped.category, "automation");
  assert.deepEqual(mapped.caseStudy, caseStudy);
  assert.equal(mapped.powerbiUrl, "https://app.powerbi.com/view?r=1");
});

// --- render-card.mjs ---------------------------------------------------------

test("categoryLabelPt maps the three categories to their PT labels, falling back to 'apps'", () => {
  assert.equal(categoryLabelPt("data-bi"), "Dados & BI");
  assert.equal(categoryLabelPt("automation"), "Automação");
  assert.equal(categoryLabelPt("apps"), "Apps");
  assert.equal(categoryLabelPt("unknown"), "Apps");
  assert.equal(categoryLabelPt(undefined), "Apps");
});

test("renderCardHtml always includes a category badge with the right class and label", () => {
  const html = renderCardHtml(baseProject({ category: "data-bi" }));
  assert.match(html, /badge-category badge-category--data-bi/);
  assert.match(html, /Dados &amp; BI/);
});

test("renderCardHtml defaults to the 'apps' badge when category is missing", () => {
  const html = renderCardHtml(baseProject({ category: undefined }));
  assert.match(html, /badge-category badge-category--apps/);
});

// --- render-project-page.mjs: case study + Power BI embed --------------------

const SOCIAL = { github: "https://github.com/andrescultori" };

function renderPage(overrides) {
  return renderProjectPage({
    project: baseProject(overrides),
    siteUrl: "https://example.com",
    pageUrl: "https://example.com/projeto.html?slug=demo",
    social: SOCIAL,
  }).html;
}

test("renderProjectPage omits the case-study section entirely when caseStudy is null", () => {
  const html = renderPage({ caseStudy: null });
  assert.doesNotMatch(html, /class="case-study"/);
  assert.doesNotMatch(html, /Case study/);
});

test("renderProjectPage omits the case-study section when caseStudy has only empty blocks", () => {
  const html = renderPage({
    caseStudy: { problem: { pt: "", en: "" }, data: { pt: "  ", en: "" } },
  });
  assert.doesNotMatch(html, /class="case-study"/);
});

test("renderProjectPage renders only the non-empty case-study blocks, each with its PT label", () => {
  const html = renderPage({
    caseStudy: {
      problem: { pt: "Problema real", en: "Real problem" },
      data: { pt: "", en: "" },
      impact: { pt: "Impacto real", en: "" },
    },
  });
  assert.match(html, /class="case-study"/);
  assert.match(html, /Problema<\/h4><p class="prose">Problema real/);
  assert.match(html, /Impacto<\/h4><p class="prose">Impacto real/);
  // "Dados" (the "data" field) block must not render — both pt and en are empty.
  assert.doesNotMatch(html, /<h4>Dados<\/h4>/);
});

test("renderProjectPage's English block includes only the EN case-study blocks that have content", () => {
  const html = renderPage({
    caseStudy: { problem: { pt: "Problema", en: "The problem" } },
  });
  assert.match(html, /<h4>Problem<\/h4><p class="prose">The problem/);
});

test("renderProjectPage omits the Power BI embed when powerbiUrl is empty", () => {
  const html = renderPage({ powerbiUrl: "" });
  assert.doesNotMatch(html, /powerbi-embed/);
  assert.doesNotMatch(html, /<iframe/);
});

test("renderProjectPage renders a lazy-loaded, referrer-stripped Power BI iframe when powerbiUrl is set", () => {
  const html = renderPage({ powerbiUrl: "https://app.powerbi.com/view?r=abc" });
  assert.match(html, /class="powerbi-embed"/);
  assert.match(html, /<iframe src="https:\/\/app\.powerbi\.com\/view\?r=abc"[^>]*loading="lazy"/);
  assert.match(html, /referrerpolicy="no-referrer"/);
  assert.match(html, /title="Demo — Power BI"/);
});

test("renderProjectPage shows the category badge near the title", () => {
  const html = renderPage({ category: "automation" });
  assert.match(html, /id="project-category-badge">[^<]*<span class="badge-category badge-category--automation"/);
});

// --- js/admin.js whitelist/validation logic (vm sandbox, same pattern as
// tests/admin-metrics.test.mjs) ------------------------------------------------

function loadAdminSandbox() {
  const adminSrc = readFileSync(path.join(TESTS_DIR, "..", "js", "admin.js"), "utf8");
  const elementsById = new Map();
  function makeFakeElement() {
    return {
      style: {},
      className: "",
      textContent: "",
      value: "",
      classList: { add: () => {}, toggle: () => {}, contains: () => false },
      setAttribute: () => {},
      getAttribute: () => null,
      appendChild: () => {},
      querySelector: () => null,
      querySelectorAll: () => [],
      addEventListener: () => {},
    };
  }
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
    URL,
    console,
  };
  vm.createContext(sandbox);
  vm.runInContext(adminSrc, sandbox, { filename: "js/admin.js" });
  return sandbox;
}

const adminSandbox = loadAdminSandbox();
const ADMIN_SRC = readFileSync(path.join(TESTS_DIR, "..", "js", "admin.js"), "utf8");

test("admin.js CATEGORY_VALUES mirrors validate.mjs's CATEGORY_VALUES exactly", () => {
  // CATEGORY_VALUES is declared with `const`, which node:vm never exposes as
  // a property on the sandbox's global object (unlike `var`/function
  // declarations) — extract it from source instead of from the sandbox.
  const match = ADMIN_SRC.match(/const CATEGORY_VALUES = (\[[^\]]*\]);/);
  assert.ok(match, "CATEGORY_VALUES declaration not found in js/admin.js");
  assert.deepEqual(JSON.parse(match[1]), ["data-bi", "automation", "apps"]);
});

test("admin.js isValidPowerBiUrl mirrors validate.mjs's rule", () => {
  assert.equal(adminSandbox.isValidPowerBiUrl("https://app.powerbi.com/view?r=abc"), true);
  assert.equal(adminSandbox.isValidPowerBiUrl("https://evil.com/app.powerbi.com"), false);
  assert.equal(adminSandbox.isValidPowerBiUrl("http://app.powerbi.com/view"), false);
});

test("admin.js mapRowToProject reads category/case_study/powerbi_url, defaulting category to 'apps'", () => {
  const mapped = adminSandbox.mapRowToProject({ slug: "x", title: "X" });
  assert.equal(mapped.category, "apps");
  assert.equal(mapped.caseStudy, null);
  assert.equal(mapped.powerbiUrl, "");

  const withFields = adminSandbox.mapRowToProject({
    slug: "x",
    title: "X",
    category: "data-bi",
    case_study: { problem: { pt: "P", en: "" } },
    powerbi_url: "https://app.powerbi.com/view?r=1",
  });
  assert.equal(withFields.category, "data-bi");
  assert.deepEqual(withFields.caseStudy, { problem: { pt: "P", en: "" } });
  assert.equal(withFields.powerbiUrl, "https://app.powerbi.com/view?r=1");
});

test("admin.js projectToRow writes category/case_study/powerbi_url back to their snake_case columns", () => {
  const row = adminSandbox.projectToRow({
    slug: "x",
    title: "X",
    cardImage: "",
    screenshots: [],
    description: {},
    stack: [],
    links: {},
    note: null,
    commercial: false,
    featured: false,
    sortOrder: 0,
    draft: false,
    category: "automation",
    caseStudy: { problem: { pt: "P", en: "" } },
    powerbiUrl: "https://app.powerbi.com/view?r=1",
  });
  assert.equal(row.category, "automation");
  assert.deepEqual(row.case_study, { problem: { pt: "P", en: "" } });
  assert.equal(row.powerbi_url, "https://app.powerbi.com/view?r=1");
});

test("admin.js projectToRow writes powerbi_url as null (not an empty string) when unset", () => {
  const row = adminSandbox.projectToRow({
    slug: "x",
    title: "X",
    screenshots: [],
    description: {},
    stack: [],
    links: {},
    note: null,
    commercial: false,
    featured: false,
    sortOrder: 0,
    draft: false,
    category: "apps",
    caseStudy: null,
    powerbiUrl: "",
  });
  assert.equal(row.powerbi_url, null);
});
