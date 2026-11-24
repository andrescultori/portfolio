import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { readFileSync } from "node:fs";

import { renderHomePage } from "../scripts/lib/render-home.mjs";
import { renderUnderConstructionPage } from "../scripts/lib/render-under-construction.mjs";
import { renderHeader } from "../scripts/lib/public-chrome.mjs";
import { getProjectVisualHtml, biMockVisualHtml } from "../scripts/lib/project-visuals.mjs";
import { HOME_SECTIONS } from "../scripts/lib/home-sections.mjs";

const TESTS_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(TESTS_DIR, "..");

const SOCIAL = {
  github: "https://github.com/andrescultori",
  linkedin: "https://linkedin.com/in/andrescultori",
  booking: "https://cal.com/andrescultori/30min",
  email: "amscultori@gmail.com",
};

function homeArgs(overrides = {}) {
  return {
    projects: [],
    services: [],
    process: [],
    clients: [],
    siteUrl: "https://example.com",
    social: SOCIAL,
    photoUrl: "",
    heroOverrides: {},
    jsonLd: null,
    ...overrides,
  };
}

// --- Language: EN-root redirect + lang-switch stores the choice -------------

test("renderHomePage: the EN home contains the lang redirect script, the PT home does not", () => {
  const en = renderHomePage({ lang: "en", ...homeArgs() });
  const pt = renderHomePage({ lang: "pt", ...homeArgs() });
  assert.match(en, /navigator\.language/);
  assert.match(en, /location\.replace\("\/pt\/"\)/);
  assert.ok(!pt.includes("navigator.language"), "PT home must never carry the EN->PT redirect script");
});

test("renderUnderConstructionPage: same redirect rule applies to the live placeholder home", () => {
  const en = renderUnderConstructionPage({ lang: "en", siteUrl: "https://example.com", social: SOCIAL });
  const pt = renderUnderConstructionPage({ lang: "pt", siteUrl: "https://example.com", social: SOCIAL });
  assert.match(en, /navigator\.language/);
  assert.match(en, /location\.replace\("\/pt\/"\)/);
  assert.ok(!pt.includes("navigator.language"));
});

test("the redirect only fires when no lang-pref is stored yet", () => {
  const en = renderHomePage({ lang: "en", ...homeArgs() });
  assert.match(en, /localStorage\.getItem\("lang-pref"\)/);
});

test("renderHeader's EN/PT switch stores the visitor's explicit choice in localStorage", () => {
  const html = renderHeader({
    lang: "en",
    homeHref: "/",
    workHref: "/work/",
    altHrefs: { en: "https://example.com/", pt: "https://example.com/pt/" },
    bookingUrl: "",
    activeNav: null,
  });
  assert.match(html, /onclick="try\{localStorage\.setItem\('lang-pref','en'\)\}catch\(e\)\{\}"/);
  assert.match(html, /onclick="try\{localStorage\.setItem\('lang-pref','pt'\)\}catch\(e\)\{\}"/);
});

test("renderUnderConstructionPage's lang switch also stores the choice", () => {
  const html = renderUnderConstructionPage({ lang: "en", siteUrl: "https://example.com", social: SOCIAL });
  assert.match(html, /onclick="try\{localStorage\.setItem\('lang-pref','pt'\)\}catch\(e\)\{\}"/);
});

// --- Header: "Get in touch" button, hidden under 520px ----------------------

test("the header always shows a 'Get in touch' button pointing at #contact, independent of booking", () => {
  const html = renderHeader({
    lang: "en",
    homeHref: "/",
    workHref: "/work/",
    altHrefs: { en: "https://example.com/", pt: "https://example.com/pt/" },
    bookingUrl: "",
    activeNav: null,
  });
  assert.match(html, /class="btn btn-outline btn-sm nav-get-in-touch" href="\/#contact">Get in touch</);
});

test("css/site.css hides .nav-get-in-touch under 520px", () => {
  const css = readFileSync(path.join(REPO_ROOT, "css", "site.css"), "utf8");
  assert.match(css, /@media \(max-width: 520px\) \{\s*\.nav-get-in-touch \{ display: none; \}/);
});

test("the mobile nav panel also carries a 'Get in touch' link", () => {
  const html = renderHeader({
    lang: "pt",
    homeHref: "/pt/",
    workHref: "/pt/trabalhos/",
    altHrefs: { en: "https://example.com/", pt: "https://example.com/pt/" },
    bookingUrl: "",
    activeNav: null,
  });
  const panelMatch = html.match(/<div class="nav-panel" id="nav-panel">([\s\S]*?)<\/div>/);
  assert.ok(panelMatch, "nav-panel not found");
  assert.match(panelMatch[1], /Fale comigo/);
});

// --- home-sections.mjs flags -------------------------------------------------

test("HOME_SECTIONS: process, sideProjects and aboutDetails all default to off", () => {
  assert.deepEqual(HOME_SECTIONS, { process: false, sideProjects: false, aboutDetails: false });
});

test("renderHomePage omits the Process section and its nav link while HOME_SECTIONS.process is false", () => {
  const html = renderHomePage({ lang: "en", ...homeArgs({ process: [{ number: "01", title: { en: "X" }, description: { en: "Y" } }] }) });
  assert.ok(!html.includes('id="process"'));
  assert.ok(!html.includes('href="/#process"'));
});

test("renderHomePage omits the side-projects (apps) list while HOME_SECTIONS.sideProjects is false, even with apps projects present", () => {
  const html = renderHomePage({
    lang: "en",
    ...homeArgs({
      projects: [{ slug: "a", title: "A", category: "apps", stack: [], featured: false, sortOrder: 0, description: {} }],
    }),
  });
  assert.ok(!html.includes("apps-list"));
});

test("renderHomePage omits the About details <dl> while HOME_SECTIONS.aboutDetails is false, but keeps LinkedIn/GitHub links", () => {
  const html = renderHomePage({ lang: "en", ...homeArgs() });
  assert.ok(!html.includes("about-dl"));
  assert.match(html, /about-copy[\s\S]*?LinkedIn/);
  assert.match(html, /about-copy[\s\S]*?GitHub/);
});

// --- Featured work: up to 4, any category -----------------------------------

function project(overrides) {
  return {
    slug: "p",
    title: "P",
    category: "apps",
    stack: ["A", "B", "C", "D", "E"],
    description: { en: "desc", pt: "desc" },
    featured: true,
    sortOrder: 0,
    ...overrides,
  };
}

test("renderHomePage shows at most 4 featured projects, from any category, as work-row rows", () => {
  const projects = [
    project({ slug: "a", sortOrder: 0 }),
    project({ slug: "b", sortOrder: 1 }),
    project({ slug: "c", sortOrder: 2, category: "data-bi" }),
    project({ slug: "d", sortOrder: 3, category: "automation" }),
    project({ slug: "e", sortOrder: 4 }), // 5th featured — must be excluded
  ];
  const html = renderHomePage({ lang: "en", ...homeArgs({ projects }) });
  const rowCount = (html.match(/class="work-row"/g) || []).length;
  assert.equal(rowCount, 4);
  assert.ok(!html.includes("/projects/e/"));
});

test("a featured project's work-row shows only its first 4 stack items", () => {
  const projects = [project({ slug: "a", stack: ["one", "two", "three", "four", "five"] })];
  const html = renderHomePage({ lang: "en", ...homeArgs({ projects }) });
  assert.match(html, /one · two · three · four/);
  assert.ok(!html.includes("five"));
});

// --- project-visuals.mjs: decorative, aria-hidden ---------------------------

test("every project visual is wrapped aria-hidden", () => {
  const cases = [
    { slug: "processo-seletivo" },
    { slug: "dashboard-financeiro" },
    { slug: "orcamentos-felipe-blaya" },
    { slug: "agape-multimidia" },
    { slug: "something-else" },
    { slug: "has-image", cardImage: "img/x.jpg" },
  ];
  for (const c of cases) {
    const html = getProjectVisualHtml("en", c);
    assert.match(html, /class="project-visual[^"]*" aria-hidden="true"/, `missing aria-hidden for ${c.slug}`);
  }
});

test("the BI mock visual (dashboard-financeiro/hero) carries data-grow on its bars and no digits in its text", () => {
  const html = biMockVisualHtml("en");
  assert.ok((html.match(/data-grow(?=[="\s>])/g) || []).length >= 1);
  const textOnly = html.replace(/<[a-zA-Z][^>]*>/g, "<>").replace(/<>/g, "");
  assert.doesNotMatch(textOnly, /\d/);
});

// --- Accessibility: contrast ratios of the Midnight/Electric tokens ---------

function hexToRgb(hex) {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}
function relLuminance([r, g, b]) {
  const [R, G, B] = [r, g, b].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}
function contrastRatio(hex1, hex2) {
  const l1 = relLuminance(hexToRgb(hex1));
  const l2 = relLuminance(hexToRgb(hex2));
  const [lighter, darker] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (lighter + 0.05) / (darker + 0.05);
}

function readTokens() {
  const css = readFileSync(path.join(REPO_ROOT, "css", "site.css"), "utf8");
  const root = css.match(/:root \{([\s\S]*?)\n\}/)[1];
  const tokens = {};
  for (const m of root.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6});/g)) {
    tokens[m[1]] = m[2];
  }
  return tokens;
}

test("body text (--ink, --ink-2, --muted) against --bg all meet WCAG AA (>= 4.5:1)", () => {
  const t = readTokens();
  for (const key of ["ink", "ink-2", "muted"]) {
    const ratio = contrastRatio(t[key], t.bg);
    assert.ok(ratio >= 4.5, `--${key} (${t[key]}) on --bg (${t.bg}) = ${ratio.toFixed(2)}, expected >= 4.5`);
  }
});

test("primary button text (--on-accent) against --accent meets WCAG AA (>= 4.5:1)", () => {
  const t = readTokens();
  const ratio = contrastRatio(t["on-accent"], t.accent);
  assert.ok(ratio >= 4.5, `--on-accent on --accent = ${ratio.toFixed(2)}, expected >= 4.5`);
});

test("eyebrow/link text (--accent, --accent-2) against --bg meets WCAG AA (>= 4.5:1)", () => {
  const t = readTokens();
  for (const key of ["accent", "accent-2"]) {
    const ratio = contrastRatio(t[key], t.bg);
    assert.ok(ratio >= 4.5, `--${key} (${t[key]}) on --bg (${t.bg}) = ${ratio.toFixed(2)}, expected >= 4.5`);
  }
});
