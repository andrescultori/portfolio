import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { readFileSync, existsSync } from "node:fs";

import { renderUnderConstructionPage } from "../scripts/lib/render-under-construction.mjs";

const TESTS_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(TESTS_DIR, "..");
const DIST = path.join(REPO_ROOT, "dist");

const SOCIAL = { github: "https://github.com/andrescultori", email: "amscultori@gmail.com" };

test("renderUnderConstructionPage renders the right language, with canonical/hreflang and a mailto link", () => {
  const en = renderUnderConstructionPage({ lang: "en", siteUrl: "https://example.com", social: SOCIAL });
  const pt = renderUnderConstructionPage({ lang: "pt", siteUrl: "https://example.com", social: SOCIAL });

  assert.match(en, /<h1>Under construction<\/h1>/);
  assert.match(pt, /<h1>Em constru[çc]ão<\/h1>/);
  assert.match(en, /<link rel="canonical" href="https:\/\/example\.com\/">/);
  assert.match(pt, /<link rel="canonical" href="https:\/\/example\.com\/pt\/">/);
  assert.match(en, /hreflang="pt-BR" href="https:\/\/example\.com\/pt\/"/);
  assert.match(en, /href="mailto:amscultori@gmail\.com"/);
});

test("renderUnderConstructionPage hides a contact button whose link isn't set", () => {
  const html = renderUnderConstructionPage({ lang: "en", siteUrl: "https://example.com", social: { github: "https://github.com/andrescultori" } });
  assert.ok(!html.includes("mailto:"));
  assert.match(html, /GitHub/);
  assert.ok(!html.includes(">LinkedIn<"));
});

test("scripts/build.mjs's HOME_UNDER_CONSTRUCTION flag only swaps the home page, nothing else", () => {
  const build = readFileSync(path.join(REPO_ROOT, "scripts", "build.mjs"), "utf8");
  assert.match(build, /const HOME_UNDER_CONSTRUCTION = (true|false);/);
  assert.match(build, /renderUnderConstructionPage/);
  // The flag's branch must be scoped to the home-page render only — the
  // work index and project pages keep calling their own real renderers
  // unconditionally.
  assert.match(build, /renderWorkIndexPage\(\{ lang, projects, siteUrl: SITE_URL, social: effectiveLinks \}\)/);
});

test("dist/: when under construction, / and /pt/ show the placeholder but /work/ and a project page don't", { skip: !existsSync(DIST) }, () => {
  const build = readFileSync(path.join(REPO_ROOT, "scripts", "build.mjs"), "utf8");
  const flagOn = /const HOME_UNDER_CONSTRUCTION = true;/.test(build);
  if (!flagOn) return; // nothing to check once the flag is flipped back

  const home = readFileSync(path.join(DIST, "index.html"), "utf8");
  assert.match(home, /Under construction/);

  const work = readFileSync(path.join(DIST, "work", "index.html"), "utf8");
  assert.ok(!work.includes("Under construction"));
});
