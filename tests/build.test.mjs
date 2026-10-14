import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { escapeHtml, safeJsonLd } from "../scripts/lib/html.mjs";
import { isValidUrl, validateProject, BuildValidationError } from "../scripts/lib/validate.mjs";
import { slugify } from "../scripts/lib/slug.mjs";
import { getProjects } from "../scripts/lib/data.mjs";
import { mapJsonProject } from "../scripts/lib/json-source.mjs";
import { mapSupabaseRow } from "../scripts/lib/supabase-source.mjs";
import { renderProjectPage } from "../scripts/lib/render-project-page.mjs";
import { renderCardHtml, renderNoscriptList } from "../scripts/lib/render-card.mjs";
import { buildSitemap, buildRobotsTxt, buildPersonJsonLd } from "../scripts/lib/seo.mjs";
import { resolveSiteUrl } from "../scripts/lib/site-url.mjs";
import { shouldRerouteOnAuthEvent } from "../scripts/lib/admin-auth.mjs";
import {
  SITE_SETTINGS_TEXT_KEYS,
  filterI18nOverrides,
  filterLinks,
  resolvePhotoUrl,
  fetchSiteSettings,
  substituteDataI18n,
  replaceHrefById,
  replaceImgSrcById,
  replaceTextById,
} from "../scripts/lib/site-settings.mjs";

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

// --- safeJsonLd --------------------------------------------------------------

test("safeJsonLd escapes <, U+2028 and U+2029 while staying valid JSON", () => {
  const value = { text: "a</script>b c d" };
  const out = safeJsonLd(value);
  assert.ok(!out.includes("</script>"));
  assert.ok(!out.includes(" "));
  assert.ok(!out.includes(" "));
  const parsed = JSON.parse(out);
  assert.equal(parsed.text, "a</script>b c d");
});

test("renderProjectPage neutralizes a script-breakout title in both HTML and JSON-LD", () => {
  const malicious = "Demo</script><img src=x onerror=alert(1)>";
  const project = {
    slug: "xss-demo",
    title: malicious,
    cardImage: "",
    screenshots: [],
    description: { pt: "Descrição.", en: "Description." },
    stack: [],
    links: {},
    note: null,
  };
  const { html } = renderProjectPage({
    project,
    siteUrl: "https://andrescultori.vercel.app",
    pageUrl: "https://andrescultori.vercel.app/projeto/xss-demo/",
    social: {},
  });

  assert.ok(!html.includes(malicious), "o título malicioso não deve aparecer cru em lugar nenhum do HTML");

  const match = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  assert.ok(match, "deve haver um bloco JSON-LD");
  const parsed = JSON.parse(match[1]);
  assert.equal(parsed.name, malicious, "o JSON-LD deve continuar válido e preservar o valor original ao ser lido de volta");
});

// --- resolveSiteUrl ------------------------------------------------------------

test("resolveSiteUrl prioritizes SITE_URL, then CF_PAGES_URL, then the default", () => {
  assert.deepEqual(resolveSiteUrl({ SITE_URL: "https://a.example", CF_PAGES_URL: "https://b.pages.dev" }), {
    url: "https://a.example",
    source: "SITE_URL",
  });
  assert.deepEqual(resolveSiteUrl({ CF_PAGES_URL: "https://b.pages.dev" }), {
    url: "https://b.pages.dev",
    source: "CF_PAGES_URL",
  });
  assert.deepEqual(resolveSiteUrl({}), {
    url: "https://andrescultori.vercel.app",
    source: "default",
  });
});

// --- site-settings: filterI18nOverrides / filterLinks -------------------------

test("filterI18nOverrides keeps only whitelisted keys with a non-empty value", () => {
  const result = filterI18nOverrides({
    pt: { hero_role: "Novo cargo", nao_existe: "ignorado", hero_bio: "   " },
    en: { hero_role: "New role" },
    es: { hero_role: "Ignorado — idioma não suportado" },
  });
  assert.deepEqual(result, {
    pt: { hero_role: "Novo cargo" },
    en: { hero_role: "New role" },
  });
});

test("filterI18nOverrides treats an empty string as 'no override' (restaurar padrão)", () => {
  const result = filterI18nOverrides({ pt: { hero_role: "" } });
  assert.deepEqual(result, { pt: {}, en: {} });
});

test("filterI18nOverrides covers every whitelisted key", () => {
  const raw = { pt: {}, en: {} };
  SITE_SETTINGS_TEXT_KEYS.forEach((key) => {
    raw.pt[key] = `valor-${key}`;
  });
  const result = filterI18nOverrides(raw);
  assert.deepEqual(Object.keys(result.pt).sort(), [...SITE_SETTINGS_TEXT_KEYS].sort());
});

test("filterLinks discards any value that isn't a non-empty https(s) URL", () => {
  const result = filterLinks({
    github: "https://github.com/andrescultori",
    linkedin: "javascript:alert(1)",
    instagram: "",
    extra: "https://example.com",
  });
  assert.deepEqual(result, { github: "https://github.com/andrescultori" });
});

// --- site-settings: resolvePhotoUrl ---------------------------------------------

test("resolvePhotoUrl builds the public Storage URL with a cache-busting ?v=", () => {
  const url = resolvePhotoUrl({
    supabaseUrl: "https://example.supabase.co/",
    bucket: "portfolio-images",
    photoPath: "site/profile.jpg",
    updatedAt: "2026-01-01T00:00:00.000Z",
  });
  assert.equal(
    url,
    `https://example.supabase.co/storage/v1/object/public/portfolio-images/site/profile.jpg?v=${new Date(
      "2026-01-01T00:00:00.000Z"
    ).getTime()}`
  );
});

test("resolvePhotoUrl returns an empty string when there's no photo", () => {
  assert.equal(resolvePhotoUrl({ supabaseUrl: "https://example.supabase.co", bucket: "b", photoPath: "" }), "");
});

// --- site-settings: fetchSiteSettings (Supabase-first, default fallback) ------

test("fetchSiteSettings honors source=json and never calls fetch", async () => {
  const fakeFetch = async () => {
    throw new Error("should not be called");
  };
  const result = await fetchSiteSettings({
    supabaseUrl: "https://fake.supabase.co",
    supabaseKey: "key",
    source: "json",
    fetchImpl: fakeFetch,
  });
  assert.equal(result.source, "default");
  assert.equal(result.settings, null);
  assert.deepEqual(result.warnings, []);
});

test("fetchSiteSettings falls back to defaults when credentials are missing", async () => {
  const result = await fetchSiteSettings({ supabaseUrl: "", supabaseKey: "" });
  assert.equal(result.source, "default");
  assert.equal(result.settings, null);
});

test("fetchSiteSettings falls back to defaults when the Supabase fetch fails", async () => {
  const fakeFetch = async () => {
    throw new Error("network down");
  };
  const result = await fetchSiteSettings({
    supabaseUrl: "https://fake.supabase.co",
    supabaseKey: "key",
    fetchImpl: fakeFetch,
  });
  assert.equal(result.source, "default");
});

test("fetchSiteSettings falls back to defaults when Supabase returns no row", () => {
  return (async () => {
    const fakeFetch = async () => ({ ok: true, json: async () => [] });
    const result = await fetchSiteSettings({
      supabaseUrl: "https://fake.supabase.co",
      supabaseKey: "key",
      fetchImpl: fakeFetch,
    });
    assert.equal(result.source, "default");
  })();
});

test("fetchSiteSettings normalizes a real row (filters links/overrides, keeps photo_path)", async () => {
  const fakeFetch = async () => ({
    ok: true,
    json: async () => [
      {
        photo_path: "site/profile.jpg",
        links: { github: "https://github.com/andrescultori", linkedin: "not-a-url" },
        i18n_overrides: { pt: { hero_role: "Novo cargo" }, en: {} },
        updated_at: "2026-01-01T00:00:00.000Z",
      },
    ],
  });
  const result = await fetchSiteSettings({
    supabaseUrl: "https://fake.supabase.co",
    supabaseKey: "key",
    fetchImpl: fakeFetch,
  });
  assert.equal(result.source, "supabase");
  assert.deepEqual(result.settings, {
    photoPath: "site/profile.jpg",
    links: { github: "https://github.com/andrescultori" },
    i18nOverrides: { pt: { hero_role: "Novo cargo" }, en: {} },
    updatedAt: "2026-01-01T00:00:00.000Z",
  });
});

// --- site-settings: HTML substitution helpers (build-time) ---------------------

test("substituteDataI18n escapes HTML and replaces only the matching element", () => {
  const html = '<p data-i18n="hero_bio">Bio padrão</p><p data-i18n="other">Outro</p>';
  const out = substituteDataI18n(html, "hero_bio", '<script>alert(1)</script>');
  assert.match(out, /<p data-i18n="hero_bio">&lt;script&gt;alert\(1\)&lt;\/script&gt;<\/p>/);
  assert.match(out, /<p data-i18n="other">Outro<\/p>/);
});

test("substituteDataI18n is a no-op when the key isn't present", () => {
  const html = '<p data-i18n="hero_bio">Bio padrão</p>';
  assert.equal(substituteDataI18n(html, "contact_title", "Novo título"), html);
});

test("replaceHrefById only accepts a valid https(s) URL, otherwise leaves the href untouched", () => {
  const html = '<a id="github-link" href="https://github.com/andrescultori">GitHub</a>';
  assert.match(
    replaceHrefById(html, "github-link", "https://github.com/outraconta"),
    /href="https:\/\/github\.com\/outraconta"/
  );
  assert.equal(replaceHrefById(html, "github-link", "javascript:alert(1)"), html);
  assert.equal(replaceHrefById(html, "github-link", ""), html);
  assert.equal(replaceHrefById(html, "does-not-exist", "https://example.com"), html);
});

test("replaceImgSrcById swaps the src of the matching <img id>", () => {
  const html = '<img id="hero-photo" src="img/profile/andre.jpg" alt="André Scultori">';
  const out = replaceImgSrcById(html, "hero-photo", "https://example.supabase.co/storage/v1/object/public/portfolio-images/site/profile.jpg");
  assert.match(out, /src="https:\/\/example\.supabase\.co\/storage\/v1\/object\/public\/portfolio-images\/site\/profile\.jpg"/);
});

test("replaceTextById escapes HTML and only touches the matching id", () => {
  const html = '<span id="github-contact-label">github.com/andrescultori</span>';
  const out = replaceTextById(html, "github-contact-label", "github.com/<script>");
  assert.match(out, /<span id="github-contact-label">github\.com\/&lt;script&gt;<\/span>/);
});

// --- seo: buildPersonJsonLd with an image -------------------------------------

test("buildPersonJsonLd includes image only when provided", () => {
  const withImage = buildPersonJsonLd({
    siteUrl: "https://andrescultori.vercel.app",
    social: { github: "https://github.com/andrescultori", linkedin: "" },
    image: "https://andrescultori.vercel.app/img/profile.jpg",
  });
  assert.equal(withImage.image, "https://andrescultori.vercel.app/img/profile.jpg");

  const withoutImage = buildPersonJsonLd({
    siteUrl: "https://andrescultori.vercel.app",
    social: { github: "https://github.com/andrescultori", linkedin: "" },
  });
  assert.equal("image" in withoutImage, false);
});

// --- admin-auth: shouldRerouteOnAuthEvent ---------------------------------------

test("shouldRerouteOnAuthEvent never reroutes on TOKEN_REFRESHED, even for a different user id", () => {
  assert.equal(shouldRerouteOnAuthEvent("TOKEN_REFRESHED", "user-1", "user-1"), false);
  assert.equal(shouldRerouteOnAuthEvent("TOKEN_REFRESHED", "user-2", "user-1"), false);
  assert.equal(shouldRerouteOnAuthEvent("TOKEN_REFRESHED", null, "user-1"), false);
});

test("shouldRerouteOnAuthEvent always reroutes on SIGNED_OUT", () => {
  assert.equal(shouldRerouteOnAuthEvent("SIGNED_OUT", null, "user-1"), true);
  assert.equal(shouldRerouteOnAuthEvent("SIGNED_OUT", "user-1", "user-1"), true);
});

test("shouldRerouteOnAuthEvent skips a duplicate SIGNED_IN for the same already-authorized user", () => {
  assert.equal(shouldRerouteOnAuthEvent("SIGNED_IN", "user-1", "user-1"), false);
});

test("shouldRerouteOnAuthEvent reroutes for a new login (different user, or none authorized yet)", () => {
  assert.equal(shouldRerouteOnAuthEvent("SIGNED_IN", "user-2", "user-1"), true);
  assert.equal(shouldRerouteOnAuthEvent("SIGNED_IN", "user-1", null), true);
  assert.equal(shouldRerouteOnAuthEvent("SIGNED_IN", null, null), true);
});
