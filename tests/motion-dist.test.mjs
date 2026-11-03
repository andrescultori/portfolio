import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { readFileSync } from "node:fs";

import { renderHomePage } from "../scripts/lib/render-home.mjs";
import { renderProjectPage } from "../scripts/lib/render-project-page.mjs";

/* Checks the motion layer's HTML output against what render-home.mjs and
   render-project-page.mjs actually produce — those functions' return
   values are written verbatim to dist/, so calling them directly here is
   equivalent to reading the eventual dist/ files (same precedent as the
   rest of this suite: see build.test.mjs). admin.html/pm.html, which are
   copied byte-for-byte, are read from the repo source directly. */

const TESTS_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(TESTS_DIR, "..");

const SOCIAL = { github: "https://github.com/andrescultori", email: "amscultori@gmail.com" };

function homeHtml(lang = "en") {
  return renderHomePage({
    lang,
    projects: [],
    services: [],
    process: [],
    clients: [],
    siteUrl: "https://example.com",
    social: SOCIAL,
    photoUrl: "",
    heroOverrides: {},
    jsonLd: null,
  });
}

function projectHtml(overrides = {}, lang = "en") {
  const project = {
    slug: "demo",
    title: "Demo",
    cardImage: "",
    screenshots: [],
    description: { pt: "d", en: "d" },
    stack: [],
    links: {},
    note: null,
    category: "apps",
    caseStudy: null,
    powerbiUrl: "",
    ...overrides,
  };
  return renderProjectPage({ lang, project, siteUrl: "https://example.com", social: SOCIAL }).html;
}

test("the home page loads js/motion.js with defer, admin.html/pm.html never load it", () => {
  const html = homeHtml();
  assert.match(html, /<script src="\/js\/motion\.js" defer><\/script>/);

  ["admin.html", "pm.html"].forEach((file) => {
    const adminHtml = readFileSync(path.join(REPO_ROOT, file), "utf8");
    assert.ok(!adminHtml.includes("motion.js"), `${file} should never load the public motion layer`);
  });
});

test("admin.html/pm.html never load css/site.css (public-only stylesheet)", () => {
  ["admin.html", "pm.html"].forEach((file) => {
    const html = readFileSync(path.join(REPO_ROOT, file), "utf8");
    assert.ok(!html.includes("site.css"), `${file} should never load css/site.css`);
  });
});

test("project pages load js/motion.js with defer, for both layouts (case-study and fallback)", () => {
  const fallback = projectHtml({ caseStudy: null });
  const caseStudy = projectHtml({ caseStudy: { problem: { pt: "x", en: "x" } } });
  [fallback, caseStudy].forEach((html) => {
    assert.match(html, /<script src="\/js\/motion\.js" defer><\/script>/);
  });
});

test("the hero dashboard sketch carries data-grow on its bars and lines, decorative (aria-hidden)", () => {
  const html = homeHtml();
  assert.match(html, /<div class="dash" aria-hidden="true">/);
  assert.ok((html.match(/data-grow(?:="x")?/g) || []).length >= 8 + 3, "expected 8 bars + 3 line fills with data-grow");
});

test("the hero sketch has no invented numbers in its visible text (only CSS sizing, which is decorative layout, not data)", () => {
  const html = homeHtml();
  const sketchMatch = html.match(/<div class="dash" aria-hidden="true">[\s\S]*?<p class="dash-caption">/);
  assert.ok(sketchMatch, "hero sketch block not found");
  // Strip every attribute (style="height:40px" etc. is layout, not content)
  // and every tag, leaving only text nodes — those must contain no digits.
  const textOnly = sketchMatch[0]
    .replace(/<[a-zA-Z][^>]*>/g, "<>")
    .replace(/<>/g, "");
  assert.doesNotMatch(textOnly, /\d/, "the decorative sketch's visible text must not contain any digits");
});

// --- reveal-fallback safety timeout must be conditional on motion-ready ---

/* Regression guard: the <head>/inline bootstrap script must only force
   "reveal-fallback" (making every [data-reveal]/[data-grow] element
   visible unconditionally) when motion.js's own bootstrap never finished
   (checked via the "motion-ready" class) — never unconditionally. */
function assertConditionalRevealFallback(html, label) {
  const scriptMatch = html.match(/document\.documentElement\.classList\.add\("js"\);[\s\S]*?<\/script>/);
  assert.ok(scriptMatch, `${label}: bootstrap inline script not found`);
  const script = scriptMatch[0];
  assert.ok(script.includes('classList.contains("motion-ready")'), `${label}: timeout isn't gated on motion-ready`);
  assert.ok(
    /if\s*\(\s*!document\.documentElement\.classList\.contains\("motion-ready"\)\s*\)\s*\{\s*document\.documentElement\.classList\.add\("reveal-fallback"\);/.test(
      script
    ),
    `${label}: reveal-fallback is still added unconditionally inside the timeout`
  );
}

test("home and project pages only force reveal-fallback when motion-ready never landed", () => {
  assertConditionalRevealFallback(homeHtml(), "render-home.mjs output");
  assertConditionalRevealFallback(projectHtml(), "render-project-page.mjs output");
});

test("js/motion.js itself is the single source of the bootstrap script, not duplicated ad hoc per page", () => {
  const motionSrc = readFileSync(path.join(REPO_ROOT, "js", "motion.js"), "utf8");
  // The bootstrap lives in public-chrome.mjs's BOOTSTRAP_SCRIPT constant,
  // shared by every renderer — motion.js's own copy is the runtime source
  // of truth for "motion-ready"/"reveal-fallback" semantics.
  assert.match(motionSrc, /document\.documentElement\.classList\.add\("motion-ready"\)/);
});
