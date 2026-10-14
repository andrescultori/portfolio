import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { escapeHtml } from "../scripts/lib/html.mjs";
import { isValidUrl, validateProject, BuildValidationError } from "../scripts/lib/validate.mjs";
import { slugify } from "../scripts/lib/slug.mjs";
import { getProjects } from "../scripts/lib/data.mjs";
import { mapJsonProject } from "../scripts/lib/json-source.mjs";
import { mapSupabaseRow } from "../scripts/lib/supabase-source.mjs";
import { renderProjectPage } from "../scripts/lib/render-project-page.mjs";
import { renderCardHtml, renderNoscriptList } from "../scripts/lib/render-card.mjs";
import { buildSitemap, buildRobotsTxt } from "../scripts/lib/seo.mjs";

const FIXTURE_JSON = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "projects.json");

// --- escapeHtml -------------------------------------------------------

test("escapeHtml escapes &, <, >, \" and '", () => {
  assert.equal(
    escapeHtml(`<script>alert("x")</script>&'`),
    "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;&amp;&#39;"
  );
});

test("escapeHtml handles null/undefined safely", () => {
  assert.equal(escapeHtml(null), "");
  assert.equal(escapeHtml(undefined), "");
});

// --- isValidUrl --------------------------------------------------------

test("isValidUrl accepts only http(s) URLs", () => {
  assert.equal(isValidUrl("https://example.com"), true);
  assert.equal(isValidUrl("http://example.com"), true);
  assert.equal(isValidUrl("javascript:alert(1)"), false);
  assert.equal(isValidUrl("ftp://example.com"), false);
  assert.equal(isValidUrl(""), false);
  assert.equal(isValidUrl(undefined), false);
});

// --- slugify -------------------------------------------------------------

test("slugify normalizes accents, spaces, case and repeated dashes", () => {
  assert.equal(slugify("Projeto Incrível  2026!"), "projeto-incrivel-2026");
  assert.equal(slugify("  --Já--Normal--  "), "ja-normal");
  assert.equal(slugify("already-fine"), "already-fine");
});

// --- validateProject -------------------------------------------------------

test("validateProject throws BuildValidationError on missing required fields", () => {
  assert.throws(
    () => validateProject({ slug: "", title: "", description: {} }, "test"),
    BuildValidationError
  );
});

test("validateProject passes for a well-formed project", () => {
  assert.doesNotThrow(() =>
    validateProject({ slug: "x", title: "X", description: { pt: "desc" }, stack: [] }, "test")
  );
});

// --- draft filtering (via mappers) ------------------------------------------

test("mapJsonProject defaults draft to false when absent", () => {
  const p = mapJsonProject({ slug: "a", title: "A", description: { pt: "d" } });
  assert.equal(p.draft, false);
});

test("mapSupabaseRow coerces draft/commercial/featured to booleans", () => {
  const p = mapSupabaseRow({ slug: "a", title: "A", description: { pt: "d" }, draft: 1, commercial: 0 });
  assert.equal(p.draft, true);
  assert.equal(p.commercial, false);
});

// --- getProjects (Supabase-first, JSON fallback) ----------------------------

test("getProjects falls back to json when the Supabase fetch throws", async () => {
  const fakeFetch = async () => {
    throw new Error("network down");
  };
  const result = await getProjects({
    supabaseUrl: "https://fake.supabase.co",
    supabaseKey: "key",
    jsonPath: FIXTURE_JSON,
    fetchImpl: fakeFetch,
    log: () => {},
  });
  assert.equal(result.source, "json");
  assert.ok(result.warnings.some((w) => w.includes("Supabase inacessível")));
});

test("getProjects falls back to json on a non-2xx response", async () => {
  const fakeFetch = async () => ({ ok: false, status: 500, json: async () => [] });
  const result = await getProjects({
    supabaseUrl: "https://fake.supabase.co",
    supabaseKey: "key",
    jsonPath: FIXTURE_JSON,
    fetchImpl: fakeFetch,
    log: () => {},
  });
  assert.equal(result.source, "json");
});

test("getProjects falls back to json on invalid JSON from Supabase", async () => {
  const fakeFetch = async () => ({
    ok: true,
    json: async () => {
      throw new SyntaxError("Unexpected token");
    },
  });
  const result = await getProjects({
    supabaseUrl: "https://fake.supabase.co",
    supabaseKey: "key",
    jsonPath: FIXTURE_JSON,
    fetchImpl: fakeFetch,
    log: () => {},
  });
  assert.equal(result.source, "json");
});

test("getProjects falls back to json on timeout (AbortError)", async () => {
  const fakeFetch = async (_url, { signal }) =>
    new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    });
  const result = await getProjects({
    supabaseUrl: "https://fake.supabase.co",
    supabaseKey: "key",
    jsonPath: FIXTURE_JSON,
    fetchImpl: fakeFetch,
    timeoutMs: 10,
    log: () => {},
  });
  assert.equal(result.source, "json");
  assert.ok(result.warnings.some((w) => w.includes("timeout")));
});

test("getProjects falls back to json when Supabase returns an empty array", async () => {
  const fakeFetch = async () => ({ ok: true, json: async () => [] });
  const result = await getProjects({
    supabaseUrl: "https://fake.supabase.co",
    supabaseKey: "key",
    jsonPath: FIXTURE_JSON,
    fetchImpl: fakeFetch,
    log: () => {},
  });
  assert.equal(result.source, "json");
});

test("getProjects uses supabase when it returns data", async () => {
  const fakeFetch = async () => ({
    ok: true,
    json: async () => [{ slug: "a", title: "A", description: { pt: "d" }, sort_order: 0 }],
  });
  const result = await getProjects({
    supabaseUrl: "https://fake.supabase.co",
    supabaseKey: "key",
    jsonPath: FIXTURE_JSON,
    fetchImpl: fakeFetch,
    log: () => {},
  });
  assert.equal(result.source, "supabase");
  assert.equal(result.projects.length, 1);
});

test("getProjects honors PRERENDER_SOURCE=json override without calling fetch", async () => {
  const fakeFetch = async () => {
    throw new Error("should not be called");
  };
  const result = await getProjects({
    supabaseUrl: "https://fake.supabase.co",
    supabaseKey: "key",
    jsonPath: FIXTURE_JSON,
    source: "json",
    fetchImpl: fakeFetch,
    log: () => {},
  });
  assert.equal(result.source, "json");
});

test("getProjects falls back to json when Supabase credentials are missing", async () => {
  const result = await getProjects({
    supabaseUrl: "",
    supabaseKey: "",
    jsonPath: FIXTURE_JSON,
    log: () => {},
  });
  assert.equal(result.source, "json");
  assert.ok(result.warnings.some((w) => w.includes("não configurados")));
});

// --- render-card -------------------------------------------------------------

test("renderCardHtml escapes project fields and keeps the same href as main.js", () => {
  const html = renderCardHtml({
    slug: "demo",
    title: '<b>Demo</b>',
    cardImage: "",
    description: { pt: "desc" },
    stack: ["JS"],
    links: {},
    commercial: false,
  });
  assert.match(html, /projeto\.html\?slug=demo/);
  assert.ok(!html.includes("<b>Demo</b>"));
  assert.match(html, /&lt;b&gt;Demo&lt;\/b&gt;/);
});

test("renderNoscriptList links to the static per-project pages", () => {
  const html = renderNoscriptList([{ slug: "demo", title: "Demo" }]);
  assert.match(html, /<noscript>/);
  assert.match(html, /href="projeto\/demo\/"/);
});

// --- render-project-page -------------------------------------------------------

test("renderProjectPage includes title, meta description, canonical, OG and JSON-LD", () => {
  const project = {
    slug: "demo",
    title: "Demo Project",
    cardImage: "img/projects/demo/cover.png",
    screenshots: [],
    description: { pt: "Descrição em português.", en: "English description." },
    stack: ["JavaScript"],
    links: { live: "https://demo.example.com", github: "https://github.com/andrescultori/demo" },
    note: null,
    commercial: false,
    featured: false,
    sortOrder: 0,
  };
  const { html, hasImage } = renderProjectPage({
    project,
    siteUrl: "https://andrescultori.vercel.app",
    pageUrl: "https://andrescultori.vercel.app/projeto/demo/",
    social: { github: "https://github.com/andrescultori" },
  });

  assert.ok(hasImage);
  assert.match(html, /<title>Demo Project — André Scultori<\/title>/);
  assert.match(html, /<meta name="description" content="Descri[^"]*ortugu[^"]*s\.">/);
  assert.match(html, /<link rel="canonical" href="https:\/\/andrescultori\.vercel\.app\/projeto\/demo\/">/);
  assert.match(html, /<meta property="og:image" content="https:\/\/andrescultori\.vercel\.app\/img\/projects\/demo\/cover\.png">/);
  assert.match(html, /"@type":"CreativeWork"/);
  assert.match(html, /lang="en"/);
  assert.match(html, /English description\./);
});

test("renderProjectPage omits og:image when no image is available", () => {
  const project = {
    slug: "no-image",
    title: "No Image",
    cardImage: "",
    screenshots: [],
    description: { pt: "Sem imagem.", en: "" },
    stack: [],
    links: {},
    note: null,
  };
  const { html, hasImage } = renderProjectPage({
    project,
    siteUrl: "https://andrescultori.vercel.app",
    pageUrl: "https://andrescultori.vercel.app/projeto/no-image/",
    social: {},
  });
  assert.equal(hasImage, false);
  assert.ok(!html.includes('property="og:image"'));
});

// --- seo -------------------------------------------------------------------

test("buildSitemap wraps URLs in a valid urlset", () => {
  const xml = buildSitemap(["https://example.com/", "https://example.com/a/"]);
  assert.match(xml, /<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
  assert.match(xml, /<loc>https:\/\/example\.com\/<\/loc>/);
});

test("buildRobotsTxt points to the sitemap", () => {
  const txt = buildRobotsTxt("https://example.com");
  assert.match(txt, /Sitemap: https:\/\/example\.com\/sitemap\.xml/);
});
