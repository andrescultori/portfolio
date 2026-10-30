import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { readFileSync } from "node:fs";

import { renderProjectFigure } from "../scripts/lib/project-figures.mjs";
import { renderProjectPage } from "../scripts/lib/render-project-page.mjs";

/* Checks the motion layer's HTML output the same way the rest of this
   suite does (see build.test.mjs's own note on this): index.html and
   admin.html are copied byte-for-byte into dist/ by scripts/build.mjs, so
   reading the repo source IS reading the eventual dist/ output; and
   renderProjectPage()'s return value is written verbatim to
   dist/projeto/<slug>/index.html, so calling it directly is equivalent to
   reading that generated file. */

const TESTS_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(TESTS_DIR, "..");

const FIXTURE_PROJECT_BASE = {
  title: "Projeto Teste",
  description: { pt: "Descrição em português.", en: "English description." },
  stack: ["JavaScript"],
  links: { github: "https://github.com/andrescultori/teste" },
  screenshots: [],
  cardImage: "",
};

function fixtureProject(slug) {
  return { ...FIXTURE_PROJECT_BASE, slug };
}

test("index.html carries the full headline, final metric values, and loads js/motion.js (defer, not admin.html)", () => {
  const html = readFileSync(path.join(REPO_ROOT, "index.html"), "utf8");

  assert.ok(html.includes("Analista de BI &amp; Automação de Processos"), "full PT headline missing from source");
  assert.ok(html.includes('data-typewriter'), "typewriter element missing");

  // Final counted values, present in the static markup for SEO/no-JS.
  ["10+", "~80%", "15+"].forEach((finalValue) => {
    assert.ok(html.includes(finalValue), `metric final value "${finalValue}" missing from static HTML`);
  });
  assert.ok(html.includes('data-count-to="10"'));
  assert.ok(html.includes('data-count-to="80"'));
  assert.ok(html.includes('data-count-to="15"'));

  assert.ok(html.includes('<script src="js/motion.js" defer></script>'), "js/motion.js not loaded with defer");
});

test("admin.html does not load js/motion.js", () => {
  const html = readFileSync(path.join(REPO_ROOT, "admin.html"), "utf8");
  assert.ok(!html.includes("motion.js"), "admin.html should never load the public motion layer");
});

test("contato.html and projeto.html load js/motion.js with defer", () => {
  ["contato.html", "projeto.html"].forEach((file) => {
    const html = readFileSync(path.join(REPO_ROOT, file), "utf8");
    assert.ok(html.includes('<script src="js/motion.js" defer></script>'), `${file} should load js/motion.js deferred`);
  });
});

test("renderProjectPage embeds the processo-seletivo figure and loads js/motion.js", () => {
  const project = fixtureProject("processo-seletivo");
  const { html } = renderProjectPage({ project, siteUrl: "https://example.com", pageUrl: "https://example.com/projeto/processo-seletivo/", social: {} });

  assert.ok(html.includes('class="figure-svg figure-star"'), "star figure missing for processo-seletivo");
  assert.ok(html.includes("Make.com"));
  assert.ok(html.includes('<script src="../../js/motion.js" defer></script>'));
});

test("renderProjectPage embeds the dashboard-financeiro figure with its caption", () => {
  const project = fixtureProject("dashboard-financeiro");
  const { html } = renderProjectPage({ project, siteUrl: "https://example.com", pageUrl: "https://example.com/projeto/dashboard-financeiro/", social: {} });

  assert.ok(html.includes('class="figure-svg figure-bars"'), "bar figure missing for dashboard-financeiro");
  assert.ok(html.includes("Ilustração, dados fictícios."));
});

test("renderProjectPage renders no figure for an unrelated slug", () => {
  const project = fixtureProject("algum-outro-projeto");
  const { html } = renderProjectPage({ project, siteUrl: "https://example.com", pageUrl: "https://example.com/projeto/algum-outro-projeto/", social: {} });

  assert.ok(html.includes('<div id="project-figure"></div>'), "non-figure slug should render an empty #project-figure");
  assert.ok(!html.includes("figure-svg"));
});

test("renderProjectFigure returns '' for slugs without a figure", () => {
  assert.equal(renderProjectFigure("nonexistent-slug"), "");
});
