import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { readFileSync, existsSync } from "node:fs";

const TESTS_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(TESTS_DIR, "..");
const DIST = path.join(REPO_ROOT, "dist");

// --- scripts/build.mjs: follow/ wired into the build ------------------------

test("scripts/build.mjs includes 'follow' in its copied INCLUDE list", () => {
  const build = readFileSync(path.join(REPO_ROOT, "scripts", "build.mjs"), "utf8");
  assert.match(build, /const INCLUDE = \[[^\]]*"follow"/);
});

test("scripts/build.mjs disallows /follow/ in robots.txt", () => {
  const build = readFileSync(path.join(REPO_ROOT, "scripts", "build.mjs"), "utf8");
  assert.match(build, /disallow:\s*\[[^\]]*"\/follow\/"/);
});

// --- follow/index.html: source-of-truth checks (always run) -----------------

function scriptSrcs(html) {
  return [...html.matchAll(/<script\s+src="([^"]+)"/g)].map((m) => m[1]);
}

test("follow/index.html has noindex/nofollow and no-referrer meta tags", () => {
  const html = readFileSync(path.join(REPO_ROOT, "follow", "index.html"), "utf8");
  assert.match(html, /<meta name="robots" content="noindex, nofollow">/);
  assert.match(html, /<meta name="referrer" content="no-referrer">/);
});

test("follow/index.html loads js/supabase-config.js before js/follow.js", () => {
  const html = readFileSync(path.join(REPO_ROOT, "follow", "index.html"), "utf8");
  const names = scriptSrcs(html);
  const configIndex = names.indexOf("/js/supabase-config.js");
  const followIndex = names.indexOf("/js/follow.js");
  assert.notEqual(configIndex, -1, "js/supabase-config.js not loaded");
  assert.notEqual(followIndex, -1, "js/follow.js not loaded");
  assert.ok(configIndex < followIndex, "js/supabase-config.js must load before js/follow.js");
});

test("follow/index.html has no analytics scripts and no inline secrets", () => {
  const html = readFileSync(path.join(REPO_ROOT, "follow", "index.html"), "utf8");
  assert.ok(!/gtag|analytics|google-analytics|plausible|posthog/i.test(html));
  assert.ok(!/service_role/i.test(html));
});

test("js/follow.js references only the pm_client_view rpc name, never a pm_* table directly, and carries no service_role/secret key", () => {
  const js = readFileSync(path.join(REPO_ROOT, "js", "follow.js"), "utf8");
  assert.match(js, /\.rpc\(\s*["']pm_client_view["']/);
  assert.ok(!/\.from\(\s*["']pm_/.test(js), "follow.js must never query a pm_* table directly");
  assert.ok(!/service_role/i.test(js));
  assert.ok(!/eyJ[a-zA-Z0-9_-]{20,}/.test(js), "no embedded JWT-shaped secret");
});

// --- dist/: only meaningful once a build has run -----------------------------

test("dist/follow/index.html exists and is a verbatim copy of the source", { skip: !existsSync(DIST) }, () => {
  const distPath = path.join(DIST, "follow", "index.html");
  assert.ok(existsSync(distPath), "dist/follow/index.html missing — is 'follow' in build.mjs's INCLUDE list?");
  const srcHtml = readFileSync(path.join(REPO_ROOT, "follow", "index.html"), "utf8");
  const distHtml = readFileSync(distPath, "utf8");
  assert.equal(distHtml, srcHtml);
});

test("dist/follow/index.html still has noindex/no-referrer after the build copy", { skip: !existsSync(DIST) }, () => {
  const html = readFileSync(path.join(DIST, "follow", "index.html"), "utf8");
  assert.match(html, /<meta name="robots" content="noindex, nofollow">/);
  assert.match(html, /<meta name="referrer" content="no-referrer">/);
});

test("dist/robots.txt disallows /follow/, and dist/sitemap.xml never mentions it", { skip: !existsSync(DIST) }, () => {
  const robots = readFileSync(path.join(DIST, "robots.txt"), "utf8");
  assert.match(robots, /Disallow: \/follow\//);
  const sitemap = readFileSync(path.join(DIST, "sitemap.xml"), "utf8");
  assert.ok(!sitemap.includes("/follow/"), "sitemap.xml must never list /follow/");
});

test("dist/css/follow.css and dist/js/follow.js exist", { skip: !existsSync(DIST) }, () => {
  assert.ok(existsSync(path.join(DIST, "css", "follow.css")));
  assert.ok(existsSync(path.join(DIST, "js", "follow.js")));
});

// --- data fix: processo-seletivo now says 14 scenarios, consistently --------

test("data/projects.json: processo-seletivo and js-utils-automation say 14 scenarios (PT and EN), matching the live DB", () => {
  const data = JSON.parse(readFileSync(path.join(REPO_ROOT, "data", "projects.json"), "utf8"));
  const bySlug = Object.fromEntries(data.map((p) => [p.slug, p]));

  const ps = bySlug["processo-seletivo"];
  assert.ok(ps, "processo-seletivo not found in data/projects.json");
  assert.match(ps.description.pt, /14 cenários/);
  assert.match(ps.description.en, /14 Make\.com scenarios/);
  assert.ok(!/\b12\b.*cen[aá]rio/i.test(ps.description.pt), "processo-seletivo PT description still says 12");
  assert.ok(!/\b12\b.*scenario/i.test(ps.description.en), "processo-seletivo EN description still says 12");

  const jsUtils = bySlug["js-utils-automation"];
  assert.ok(jsUtils, "js-utils-automation not found in data/projects.json");
  assert.match(jsUtils.description.pt, /14 cenários/);
  assert.match(jsUtils.description.en, /14-scenario/);
});
