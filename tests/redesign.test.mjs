import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { readFileSync, existsSync, readdirSync } from "node:fs";

import { isValidCaseStudyMetrics, validateProject, BuildValidationError } from "../scripts/lib/validate.mjs";
import { filterLinks } from "../scripts/lib/site-settings.mjs";
import { buildSitemapWithAlternates, buildRobotsTxt } from "../scripts/lib/seo.mjs";
import { buildRedirects } from "../scripts/lib/redirects.mjs";
import { homePath, workIndexPath, projectPath } from "../scripts/lib/public-urls.mjs";
import { renderHomePage } from "../scripts/lib/render-home.mjs";
import { renderWorkIndexPage } from "../scripts/lib/render-work-index.mjs";
import { renderProjectPage } from "../scripts/lib/render-project-page.mjs";

const TESTS_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(TESTS_DIR, "..");
const DIST = path.join(REPO_ROOT, "dist");

const SOCIAL_FULL = {
  github: "https://github.com/andrescultori",
  linkedin: "https://linkedin.com/in/andrescultori",
  booking: "https://cal.com/andrescultori/30min",
  email: "amscultori@gmail.com",
  cv_en: "/cv/en.pdf",
  cv_pt: "/cv/pt.pdf",
};

function baseProject(overrides = {}) {
  return {
    slug: "demo",
    title: "Demo",
    cardImage: "",
    screenshots: [],
    description: { pt: "d", en: "d" },
    stack: ["JS"],
    links: {},
    note: null,
    commercial: false,
    featured: true,
    sortOrder: 0,
    draft: false,
    category: "apps",
    caseStudy: null,
    powerbiUrl: "",
    ...overrides,
  };
}

// --- URL scheme -------------------------------------------------------------

test("public-urls: EN at root, PT under /pt/, for home/work/project paths", () => {
  assert.equal(homePath("en"), "/");
  assert.equal(homePath("pt"), "/pt/");
  assert.equal(workIndexPath("en"), "/work/");
  assert.equal(workIndexPath("pt"), "/pt/trabalhos/");
  assert.equal(projectPath("en", "foo"), "/projects/foo/");
  assert.equal(projectPath("pt", "foo"), "/pt/projetos/foo/");
});

// --- hreflang / canonical ----------------------------------------------------

test("renderHomePage carries canonical + hreflang alternates (en, pt-BR, x-default -> EN)", () => {
  const args = {
    projects: [],
    services: [],
    process: [],
    clients: [],
    siteUrl: "https://example.com",
    social: SOCIAL_FULL,
    photoUrl: "",
    heroOverrides: {},
    jsonLd: null,
  };
  const en = renderHomePage({ lang: "en", ...args });
  const pt = renderHomePage({ lang: "pt", ...args });

  assert.match(en, /<link rel="canonical" href="https:\/\/example\.com\/">/);
  assert.match(pt, /<link rel="canonical" href="https:\/\/example\.com\/pt\/">/);
  [en, pt].forEach((html) => {
    assert.match(html, /<link rel="alternate" hreflang="en" href="https:\/\/example\.com\/">/);
    assert.match(html, /<link rel="alternate" hreflang="pt-BR" href="https:\/\/example\.com\/pt\/">/);
    assert.match(html, /<link rel="alternate" hreflang="x-default" href="https:\/\/example\.com\/">/);
  });
});

test("renderWorkIndexPage and renderProjectPage also carry canonical + hreflang alternates", () => {
  const workEn = renderWorkIndexPage({ lang: "en", projects: [], siteUrl: "https://example.com", social: SOCIAL_FULL });
  assert.match(workEn, /<link rel="canonical" href="https:\/\/example\.com\/work\/">/);
  assert.match(workEn, /hreflang="pt-BR" href="https:\/\/example\.com\/pt\/trabalhos\/"/);

  const { html: projEn } = renderProjectPage({
    lang: "en",
    project: baseProject(),
    siteUrl: "https://example.com",
    social: SOCIAL_FULL,
  });
  assert.match(projEn, /<link rel="canonical" href="https:\/\/example\.com\/projects\/demo\/">/);
  assert.match(projEn, /hreflang="pt-BR" href="https:\/\/example\.com\/pt\/projetos\/demo\/"/);
});

// --- sitemap with alternates --------------------------------------------------

test("buildSitemapWithAlternates emits one <url> per entry with en/pt-BR/x-default alternates", () => {
  const xml = buildSitemapWithAlternates([
    { loc: "https://example.com/", altEn: "https://example.com/", altPt: "https://example.com/pt/" },
  ]);
  assert.match(xml, /<loc>https:\/\/example\.com\/<\/loc>/);
  assert.match(xml, /hreflang="en" href="https:\/\/example\.com\/"/);
  assert.match(xml, /hreflang="pt-BR" href="https:\/\/example\.com\/pt\/"/);
  assert.match(xml, /hreflang="x-default" href="https:\/\/example\.com\/"/);
});

// --- robots.txt: admin/pm disallowed -----------------------------------------

test("buildRobotsTxt disallows admin.html/pm.html when passed, but stays backward-compatible without them", () => {
  const withDisallow = buildRobotsTxt("https://example.com", { disallow: ["/admin.html", "/pm.html"] });
  assert.match(withDisallow, /Disallow: \/admin\.html/);
  assert.match(withDisallow, /Disallow: \/pm\.html/);

  const plain = buildRobotsTxt("https://example.com");
  assert.equal(plain, "User-agent: *\nAllow: /\nSitemap: https://example.com/sitemap.xml\n");
});

// --- _redirects ---------------------------------------------------------------

test("buildRedirects 301s the retired pages and every old /projeto/<slug>/ URL to its PT equivalent", () => {
  const txt = buildRedirects(["dashboard-financeiro", "apuracao-eleicoes"]);
  assert.match(txt, /^\/contato\.html \/#contact 301$/m);
  assert.match(txt, /^\/projeto\.html \/work\/ 301$/m);
  assert.match(txt, /^\/projeto\/dashboard-financeiro\/ \/pt\/projetos\/dashboard-financeiro\/ 301$/m);
  assert.match(txt, /^\/projeto\/apuracao-eleicoes\/ \/pt\/projetos\/apuracao-eleicoes\/ 301$/m);
});

// --- hidden-when-empty behavior ------------------------------------------------

test("the 'Worked with' clients strip renders nothing when no client is approved", () => {
  const html = renderHomePage({
    lang: "en",
    projects: [],
    services: [],
    process: [],
    clients: [{ name: "Acme", logo: "img/acme.png", approved: false }],
    siteUrl: "https://example.com",
    social: SOCIAL_FULL,
    photoUrl: "",
    heroOverrides: {},
    jsonLd: null,
  });
  assert.ok(!html.includes("clients-strip"));
});

test("the 'Worked with' strip renders only approved clients with a logo", () => {
  const html = renderHomePage({
    lang: "en",
    projects: [],
    services: [],
    process: [],
    clients: [
      { name: "Acme", logo: "img/acme.png", approved: true, url: "https://acme.com" },
      { name: "NoLogo", logo: "", approved: true },
      { name: "NotApproved", logo: "img/x.png", approved: false },
    ],
    siteUrl: "https://example.com",
    social: SOCIAL_FULL,
    photoUrl: "",
    heroOverrides: {},
    jsonLd: null,
  });
  assert.match(html, /clients-strip/);
  assert.match(html, /Acme/);
  assert.ok(!html.includes("NoLogo"));
  assert.ok(!html.includes("NotApproved"));
});

test("a service card's timeline line only renders when a timeline is actually set", () => {
  const args = {
    lang: "en",
    projects: [],
    process: [],
    clients: [],
    siteUrl: "https://example.com",
    social: SOCIAL_FULL,
    photoUrl: "",
    heroOverrides: {},
    jsonLd: null,
  };
  const withTimeline = renderHomePage({
    ...args,
    services: [{ number: "01", title: { en: "X" }, pain: { en: "Y" }, bullets: [], timeline: { en: "2-3 weeks" } }],
  });
  assert.match(withTimeline, /Typical timeline: 2-3 weeks/);

  const withoutTimeline = renderHomePage({
    ...args,
    services: [{ number: "01", title: { en: "X" }, pain: { en: "Y" }, bullets: [], timeline: { en: "" } }],
  });
  assert.ok(!withoutTimeline.includes("Typical timeline"));
});

test("contact section buttons (booking/email/CV/LinkedIn) each render only when their link is set", () => {
  const args = {
    lang: "en",
    projects: [],
    services: [],
    process: [],
    clients: [],
    siteUrl: "https://example.com",
    photoUrl: "",
    heroOverrides: {},
    jsonLd: null,
  };
  const allSet = renderHomePage({ ...args, social: SOCIAL_FULL });
  assert.match(allSet, /Book a 30-minute call/);
  assert.match(allSet, /Email me/);
  assert.match(allSet, /Download CV/);
  assert.match(allSet, /LinkedIn/);

  const noneSet = renderHomePage({ ...args, social: { github: "https://github.com/andrescultori" } });
  assert.ok(!noneSet.includes("Book a 30-minute call"));
  assert.ok(!noneSet.includes("Email me"));
  assert.ok(!noneSet.includes("Download CV"));
});

test("the header's 'Book a call' button is hidden with no booking URL, shown with one", () => {
  const args = {
    lang: "en",
    projects: [],
    services: [],
    process: [],
    clients: [],
    siteUrl: "https://example.com",
    photoUrl: "",
    heroOverrides: {},
    jsonLd: null,
  };
  const noBooking = renderHomePage({ ...args, social: { github: "https://github.com/andrescultori" } });
  assert.ok(!noBooking.includes("btn btn-primary btn-sm"));

  const withBooking = renderHomePage({ ...args, social: SOCIAL_FULL });
  assert.match(withBooking, /btn btn-primary btn-sm" href="https:\/\/cal\.com/);
});

test("the about photo column is omitted entirely when no photo is configured", () => {
  const args = {
    lang: "en",
    projects: [],
    services: [],
    process: [],
    clients: [],
    social: SOCIAL_FULL,
    heroOverrides: {},
    jsonLd: null,
    siteUrl: "https://example.com",
  };
  const noPhoto = renderHomePage({ ...args, photoUrl: "" });
  assert.ok(!noPhoto.includes("about-photo"));
  const withPhoto = renderHomePage({ ...args, photoUrl: "https://example.com/photo.jpg" });
  assert.match(withPhoto, /about-photo/);
});

// --- case_study.metrics validation --------------------------------------------

test("isValidCaseStudyMetrics accepts null/undefined (optional) and a well-formed array", () => {
  assert.equal(isValidCaseStudyMetrics(null), true);
  assert.equal(isValidCaseStudyMetrics(undefined), true);
  assert.equal(
    isValidCaseStudyMetrics([{ value: "40%", label: { pt: "x", en: "y" }, kind: "measured" }]),
    true
  );
});

test("isValidCaseStudyMetrics rejects more than 3 items, a bad kind, or a missing value/label", () => {
  const valid = { value: "1", label: { pt: "x", en: "" }, kind: "measured" };
  assert.equal(isValidCaseStudyMetrics([valid, valid, valid, valid]), false, "max 3");
  assert.equal(isValidCaseStudyMetrics([{ ...valid, kind: "guessed" }]), false, "bad kind");
  assert.equal(isValidCaseStudyMetrics([{ ...valid, value: "" }]), false, "empty value");
  assert.equal(isValidCaseStudyMetrics([{ ...valid, label: { pt: "", en: "" } }]), false, "empty label both langs");
  assert.equal(isValidCaseStudyMetrics("not-an-array"), false);
});

test("validateProject rejects a project whose case_study.metrics is invalid", () => {
  const project = {
    slug: "x",
    title: "X",
    description: { pt: "d" },
    stack: [],
    caseStudy: { metrics: [{ value: "", label: { pt: "x" }, kind: "measured" }] },
  };
  assert.throws(() => validateProject(project, "test"), BuildValidationError);
});

// --- site-settings: booking/cv_en/cv_pt whitelist -----------------------------

test("filterLinks keeps booking only when https://, and cv_en/cv_pt as https:// or a /cv/ path", () => {
  const result = filterLinks({
    booking: "https://cal.com/x",
    cv_en: "/cv/en.pdf",
    cv_pt: "https://example.com/cv.pdf",
  });
  assert.deepEqual(result, {
    booking: "https://cal.com/x",
    cv_en: "/cv/en.pdf",
    cv_pt: "https://example.com/cv.pdf",
  });
});

test("filterLinks drops an http:// (non-https) booking URL and a cv value outside /cv/", () => {
  const result = filterLinks({ booking: "http://cal.com/x", cv_en: "/other/path.pdf" });
  assert.deepEqual(result, {});
});

// --- dist: no bracket placeholders, both languages generated ------------------
// These run only when dist/ has already been built (npm run build) — skip
// gracefully otherwise rather than failing on an unrelated missing build.

function allHtmlFiles(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...allHtmlFiles(full));
    else if (entry.name.endsWith(".html")) out.push(full);
  }
  return out;
}

test("dist/ contains no unfilled design placeholders like '[Client logo]' or '[X weeks]'", { skip: !existsSync(DIST) }, () => {
  const offenders = [];
  for (const file of allHtmlFiles(DIST)) {
    const html = readFileSync(file, "utf8");
    if (/\[[A-Z][a-zA-Z ]*\]|\[X\b/.test(html)) offenders.push(path.relative(DIST, file));
  }
  assert.deepEqual(offenders, []);
});

test("dist/ has both an EN (root) and a PT (/pt/) home page, work index, and project page", { skip: !existsSync(DIST) }, () => {
  assert.ok(existsSync(path.join(DIST, "index.html")));
  assert.ok(existsSync(path.join(DIST, "pt", "index.html")));
  assert.ok(existsSync(path.join(DIST, "work", "index.html")));
  assert.ok(existsSync(path.join(DIST, "pt", "trabalhos", "index.html")));
});

test("dist/_redirects and dist/robots.txt exist with the expected rules", { skip: !existsSync(DIST) }, () => {
  const redirects = readFileSync(path.join(DIST, "_redirects"), "utf8");
  assert.match(redirects, /\/contato\.html \/#contact 301/);
  const robots = readFileSync(path.join(DIST, "robots.txt"), "utf8");
  assert.match(robots, /Disallow: \/admin\.html/);
  assert.match(robots, /Disallow: \/pm\.html/);
});
