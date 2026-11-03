#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileSync, readFileSync, mkdirSync } from "node:fs";

import { getProjects } from "./lib/data.mjs";
import { loadSupabaseConfig } from "./lib/config.mjs";
import { loadSocialLinks } from "./lib/social.mjs";
import { validateProject, isValidUrl, BuildValidationError } from "./lib/validate.mjs";
import { slugify } from "./lib/slug.mjs";
import { resetDist, copySiteFiles } from "./lib/copy.mjs";
import { renderHomePage } from "./lib/render-home.mjs";
import { renderWorkIndexPage } from "./lib/render-work-index.mjs";
import { renderProjectPage } from "./lib/render-project-page.mjs";
import { buildSitemapWithAlternates, buildRobotsTxt, buildPersonJsonLd } from "./lib/seo.mjs";
import { buildRedirects } from "./lib/redirects.mjs";
import { resolveSiteUrl } from "./lib/site-url.mjs";
import { homePath, workIndexPath, projectPath, absoluteUrl } from "./lib/public-urls.mjs";
import { fetchSiteSettings, resolvePhotoUrl } from "./lib/site-settings.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const DIST = path.join(ROOT, "dist");
const SITE_SETTINGS_STORAGE_BUCKET = "portfolio-images";
const LANGS = ["en", "pt"];

/* Only admin.html/pm.html are copied as static templates now — every
   public page (home, /work/, project pages, both languages) is fully
   rendered from scripts/lib/render-*.mjs below, no HTML template file. */
const INCLUDE = ["admin.html", "pm.html", "css", "js", "img", "data"];

function log(msg) {
  console.log(`[build] ${msg}`);
}

function trimSlashes(p) {
  return p.replace(/^\/+|\/+$/g, "");
}

function writePage(relUrlPath, html) {
  const outPath = path.join(DIST, trimSlashes(relUrlPath), "index.html");
  mkdirSync(path.dirname(outPath), { recursive: true });
  writeFileSync(outPath, html, "utf8");
}

function readJson(relPath, fallback) {
  try {
    return JSON.parse(readFileSync(path.join(ROOT, relPath), "utf8"));
  } catch (e) {
    return fallback;
  }
}

const JOB_TITLE = { en: "BI & Automation Consultant", pt: "Consultor de BI & Automação" };

async function main() {
  const warnings = [];

  const { url: rawSiteUrl, source: siteUrlSource } = resolveSiteUrl(process.env);
  const SITE_URL = rawSiteUrl.replace(/\/+$/, "");
  log(`SITE_URL: ${SITE_URL} (fonte: ${siteUrlSource})`);
  if (siteUrlSource === "default") {
    warnings.push(
      `SITE_URL/CF_PAGES_URL não configurados — usando o padrão fixo ${SITE_URL}. Configure SITE_URL para o domínio real de produção.`
    );
  }

  const supabaseConfigPath = path.join(ROOT, "js", "supabase-config.js");
  const socialPath = path.join(ROOT, "js", "social.js");
  const jsonPath = path.join(ROOT, "data", "projects.json");

  const { url: supabaseUrl, key: supabaseKey } = loadSupabaseConfig(supabaseConfigPath);
  log(`Supabase configurado: ${supabaseUrl && supabaseKey ? "sim" : "não"}`);

  const forcedSource = process.env.PRERENDER_SOURCE === "json" ? "json" : null;

  const {
    projects: rawProjects,
    source,
    warnings: sourceWarnings,
  } = await getProjects({
    supabaseUrl,
    supabaseKey,
    jsonPath,
    source: forcedSource,
    timeoutMs: 10000,
    log,
  });
  warnings.push(...sourceWarnings);

  // Defensive draft filter — independent of the Supabase query's own filter
  // or RLS/view policy, per spec: never rely only on the backend for this.
  const beforeDraftFilter = rawProjects.length;
  const projects = rawProjects.filter((p) => !p.draft);
  const draftDiscarded = beforeDraftFilter - projects.length;

  // Required-field validation (now includes case_study.metrics) — fatal on
  // the first invalid project.
  projects.forEach((p, i) => validateProject(p, `índice ${i}`));

  // Slug normalization + collision detection.
  const seenSlugs = new Set();
  projects.forEach((p) => {
    const normalized = slugify(p.slug);
    if (normalized !== p.slug) {
      warnings.push(`Slug "${p.slug}" normalizado para "${normalized}".`);
    }
    p.slug = normalized;
    if (seenSlugs.has(p.slug)) {
      throw new BuildValidationError(`Slug duplicado após normalização: "${p.slug}"`);
    }
    seenSlugs.add(p.slug);
  });

  // Link validation — discard, never fail the build.
  let discardedLinks = 0;
  projects.forEach((p) => {
    for (const field of ["live", "github"]) {
      const value = p.links && p.links[field];
      if (value && !isValidUrl(value)) {
        warnings.push(`Projeto "${p.slug}": links.${field}="${value}" não começa com http(s):// — descartado.`);
        delete p.links[field];
        discardedLinks++;
      }
    }
  });

  // EN coverage — informational only; renderProjectPage falls back to PT
  // (with the correct lang attribute) wherever EN text is missing.
  const missingEn = [];
  projects.forEach((p) => {
    const descEnMissing = !p.description.en || !p.description.en.trim();
    const noteEnMissing = p.note && p.note.pt && (!p.note.en || !p.note.en.trim());
    if (descEnMissing || noteEnMissing) missingEn.push(p.slug);
  });
  if (missingEn.length) {
    warnings.push(`Projetos sem versão EN completa (description.en e/ou note.en): ${missingEn.join(", ")}`);
  }

  // Default listing order; render-home.mjs/render-work-index.mjs re-sort
  // by category/sortOrder as needed for their own sections.
  projects.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));

  // --- Write dist/ ---
  resetDist(DIST);
  copySiteFiles(ROOT, DIST, INCLUDE);

  const services = readJson("data/services.json", []);
  const processSteps = readJson("data/process.json", []);
  const clients = readJson("data/clients.json", []);

  let social;
  try {
    social = loadSocialLinks(socialPath);
  } catch (e) {
    warnings.push(`Não consegui ler js/social.js (${e.message}).`);
    social = {
      linkedin: "",
      instagram: "",
      github: "https://github.com/andrescultori",
      email: "",
      resume: "",
      booking: "",
      cv_en: "",
      cv_pt: "",
    };
  }

  // Site settings (admin-editable text/photo/links) — Supabase-first, same
  // pattern as projects, falling back to "use the code's own defaults"
  // (no JSON-file equivalent exists for this one).
  const {
    settings: siteSettings,
    source: siteSettingsSource,
    warnings: siteSettingsWarnings,
  } = await fetchSiteSettings({ supabaseUrl, supabaseKey, source: forcedSource, timeoutMs: 10000 });
  warnings.push(...siteSettingsWarnings);
  log(`Site settings: ${siteSettingsSource}`);

  const effectiveLinks = {
    github: (siteSettings && siteSettings.links.github) || social.github,
    linkedin: (siteSettings && siteSettings.links.linkedin) || social.linkedin,
    instagram: (siteSettings && siteSettings.links.instagram) || social.instagram,
    booking: (siteSettings && siteSettings.links.booking) || social.booking,
    cv_en: (siteSettings && siteSettings.links.cv_en) || social.cv_en,
    cv_pt: (siteSettings && siteSettings.links.cv_pt) || social.cv_pt,
    email: social.email,
  };

  const photoUrl = siteSettings
    ? resolvePhotoUrl({
        supabaseUrl,
        bucket: SITE_SETTINGS_STORAGE_BUCKET,
        photoPath: siteSettings.photoPath,
        updatedAt: siteSettings.updatedAt,
      })
    : "";
  if (!photoUrl) {
    warnings.push("Home: og:image/foto do About omitidos — nenhuma foto configurada em portfolio_site_settings.");
  }

  const heroOverrides = { en: {}, pt: {} };
  for (const lang of LANGS) {
    const langOverrides = (siteSettings && siteSettings.i18nOverrides[lang]) || {};
    heroOverrides[lang] = { role: langOverrides.hero_role, bio: langOverrides.hero_bio };
  }

  const sitemapEntries = [];
  function addSitemapPair(pathFn) {
    sitemapEntries.push({
      loc: absoluteUrl(SITE_URL, pathFn("en")),
      altEn: absoluteUrl(SITE_URL, pathFn("en")),
      altPt: absoluteUrl(SITE_URL, pathFn("pt")),
    });
    sitemapEntries.push({
      loc: absoluteUrl(SITE_URL, pathFn("pt")),
      altEn: absoluteUrl(SITE_URL, pathFn("en")),
      altPt: absoluteUrl(SITE_URL, pathFn("pt")),
    });
  }

  // Home page (both languages).
  for (const lang of LANGS) {
    const jsonLd = buildPersonJsonLd({
      siteUrl: SITE_URL,
      social: effectiveLinks,
      image: photoUrl || undefined,
      jobTitle: JOB_TITLE[lang],
      knowsAbout: services.map((svc) => (svc.title && (svc.title[lang] || svc.title.en)) || "").filter(Boolean),
    });
    const html = renderHomePage({
      lang,
      projects,
      services,
      process: processSteps,
      clients,
      siteUrl: SITE_URL,
      social: effectiveLinks,
      photoUrl,
      heroOverrides: heroOverrides[lang],
      jsonLd,
    });
    writePage(homePath(lang), html);
  }
  addSitemapPair(homePath);

  // /work/ index (both languages).
  for (const lang of LANGS) {
    const html = renderWorkIndexPage({ lang, projects, siteUrl: SITE_URL, social: effectiveLinks });
    writePage(workIndexPath(lang), html);
  }
  addSitemapPair(workIndexPath);

  // Project pages (both languages each).
  const imagesMissing = [];
  projects.forEach((project, i) => {
    const next = projects.length > 1 ? projects[(i + 1) % projects.length] : null;
    LANGS.forEach((lang) => {
      const { html, hasImage } = renderProjectPage({
        lang,
        project,
        siteUrl: SITE_URL,
        social: effectiveLinks,
        nextProject: next,
      });
      if (!hasImage && lang === "en") imagesMissing.push(project.slug);
      writePage(projectPath(lang, project.slug), html);
    });
    addSitemapPair((lang) => projectPath(lang, project.slug));
  });
  if (imagesMissing.length) {
    warnings.push(`Sem imagem para og:image (cardImage/screenshots vazios): ${imagesMissing.join(", ")}`);
  }

  // sitemap.xml + robots.txt + _redirects
  writeFileSync(path.join(DIST, "sitemap.xml"), buildSitemapWithAlternates(sitemapEntries), "utf8");
  writeFileSync(
    path.join(DIST, "robots.txt"),
    buildRobotsTxt(SITE_URL, { disallow: ["/admin.html", "/pm.html"] }),
    "utf8"
  );
  writeFileSync(path.join(DIST, "_redirects"), buildRedirects(projects.map((p) => p.slug)), "utf8");

  // --- Summary ---
  log(`Fonte de dados usada: ${source}`);
  log(`Projetos gerados: ${projects.length} (x2 idiomas = ${projects.length * 2} páginas de projeto)`);
  log(`Rascunhos descartados (draft=true): ${draftDiscarded}`);
  log(`Links inválidos descartados: ${discardedLinks}`);
  warnings.forEach((w) => console.warn(`[build] AVISO: ${w}`));
  log("Build concluído em dist/.");
}

main().catch((err) => {
  console.error(`[build] ERRO FATAL: ${err.message}`);
  process.exit(1);
});
