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
import { renderCardHtml, renderNoscriptList } from "./lib/render-card.mjs";
import { renderProjectPage } from "./lib/render-project-page.mjs";
import { buildSitemap, buildRobotsTxt, buildPersonJsonLd } from "./lib/seo.mjs";
import { resolveSiteUrl } from "./lib/site-url.mjs";
import { safeJsonLd } from "./lib/html.mjs";
import {
  SITE_SETTINGS_TEXT_KEYS,
  fetchSiteSettings,
  resolvePhotoUrl,
  substituteDataI18n,
  replaceHrefById,
  replaceImgSrcById,
  replaceTextById,
  substituteMetrics,
} from "./lib/site-settings.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const DIST = path.join(ROOT, "dist");
const SITE_SETTINGS_STORAGE_BUCKET = "portfolio-images";

const INCLUDE = ["index.html", "projeto.html", "contato.html", "admin.html", "css", "js", "img", "data"];

const CARDS_MARKER = /<!-- PRERENDER:CARDS:START -->[\s\S]*?<!-- PRERENDER:CARDS:END -->/;
const NOSCRIPT_MARKER = "<!-- PRERENDER:NOSCRIPT -->";

function log(msg) {
  console.log(`[build] ${msg}`);
}

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

  // Required-field validation — fatal on the first invalid project.
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

  // EN coverage.
  const missingEn = [];
  projects.forEach((p) => {
    const descEnMissing = !p.description.en || !p.description.en.trim();
    const noteEnMissing = p.note && p.note.pt && (!p.note.en || !p.note.en.trim());
    if (descEnMissing || noteEnMissing) missingEn.push(p.slug);
  });
  if (missingEn.length) {
    warnings.push(`Projetos sem versão EN completa (description.en e/ou note.en): ${missingEn.join(", ")}`);
  }

  // Same listing order as main.js.
  projects.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));

  // --- Write dist/ ---
  resetDist(DIST);
  copySiteFiles(ROOT, DIST, INCLUDE);

  let social;
  try {
    social = loadSocialLinks(socialPath);
  } catch (e) {
    warnings.push(`Não consegui ler js/social.js (${e.message}).`);
    social = { linkedin: "", instagram: "", github: "https://github.com/andrescultori", email: "", resume: "" };
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
  };

  const photoUrl = siteSettings
    ? resolvePhotoUrl({
        supabaseUrl,
        bucket: SITE_SETTINGS_STORAGE_BUCKET,
        photoPath: siteSettings.photoPath,
        updatedAt: siteSettings.updatedAt,
      })
    : "";

  const ptOverrides = (siteSettings && siteSettings.i18nOverrides.pt) || {};

  // index.html
  const indexPath = path.join(DIST, "index.html");
  let indexHtml = readFileSync(indexPath, "utf8");

  if (!CARDS_MARKER.test(indexHtml)) {
    throw new Error(
      "Marcadores <!-- PRERENDER:CARDS:START/END --> não encontrados em index.html."
    );
  }
  const cardsHtml = projects.map(renderCardHtml).join("\n");
  indexHtml = indexHtml.replace(
    CARDS_MARKER,
    `<!-- PRERENDER:CARDS:START -->\n${cardsHtml}\n<!-- PRERENDER:CARDS:END -->`
  );

  if (!indexHtml.includes(NOSCRIPT_MARKER)) {
    throw new Error(`Marcador ${NOSCRIPT_MARKER} não encontrado em index.html.`);
  }
  indexHtml = indexHtml.replace(NOSCRIPT_MARKER, renderNoscriptList(projects));

  // Metrics strip (home KPIs): only replaces the 4 built-in defaults when
  // there's a valid override — a no-op (returns indexHtml unchanged)
  // otherwise, so this never risks blanking the strip.
  indexHtml = substituteMetrics(indexHtml, siteSettings ? siteSettings.metrics : null);

  // Site settings: text overrides (PT, no-op where a key doesn't appear on
  // this page), social hrefs, and the hero photo.
  for (const key of SITE_SETTINGS_TEXT_KEYS) {
    if (ptOverrides[key]) indexHtml = substituteDataI18n(indexHtml, key, ptOverrides[key]);
  }
  indexHtml = replaceHrefById(indexHtml, "github-link", effectiveLinks.github);
  indexHtml = replaceHrefById(indexHtml, "github-link-footer", effectiveLinks.github);
  indexHtml = replaceHrefById(indexHtml, "linkedin-link", effectiveLinks.linkedin);
  indexHtml = replaceHrefById(indexHtml, "linkedin-link-footer", effectiveLinks.linkedin);
  if (photoUrl) indexHtml = replaceImgSrcById(indexHtml, "hero-photo", photoUrl);

  const personJsonLd = buildPersonJsonLd({ siteUrl: SITE_URL, social: effectiveLinks, image: photoUrl || undefined });
  const ogImageTag = photoUrl ? `\n  <meta property="og:image" content="${photoUrl}">` : "";
  const headExtra = `  <link rel="canonical" href="${SITE_URL}/">
  <meta property="og:url" content="${SITE_URL}/">${ogImageTag}
  <script type="application/ld+json">${safeJsonLd(personJsonLd)}</script>
</head>`;
  indexHtml = indexHtml.replace("</head>", headExtra);
  if (!photoUrl) {
    warnings.push(
      "Home: og:image omitido — nenhuma foto configurada (nem em portfolio_site_settings, nem em img/profile/andre.jpg)."
    );
  }

  writeFileSync(indexPath, indexHtml, "utf8");

  // contato.html: same text/href substitutions, no SEO meta changes (out of
  // scope for this task — index.html already carries the site-wide tags).
  const contatoPath = path.join(DIST, "contato.html");
  let contatoHtml = readFileSync(contatoPath, "utf8");
  for (const key of SITE_SETTINGS_TEXT_KEYS) {
    if (ptOverrides[key]) contatoHtml = substituteDataI18n(contatoHtml, key, ptOverrides[key]);
  }
  contatoHtml = replaceHrefById(contatoHtml, "github-contact", effectiveLinks.github);
  contatoHtml = replaceHrefById(contatoHtml, "linkedin-contact", effectiveLinks.linkedin);
  contatoHtml = replaceHrefById(contatoHtml, "instagram-contact", effectiveLinks.instagram);
  if (siteSettings && siteSettings.links.github) {
    contatoHtml = replaceTextById(
      contatoHtml,
      "github-contact-label",
      effectiveLinks.github.replace(/^https:\/\//i, "")
    );
  }
  writeFileSync(contatoPath, contatoHtml, "utf8");

  // Per-project static pages.
  mkdirSync(path.join(DIST, "projeto"), { recursive: true });
  const imagesMissing = [];
  for (const project of projects) {
    const pageUrl = `${SITE_URL}/projeto/${project.slug}/`;
    const { html, hasImage } = renderProjectPage({ project, siteUrl: SITE_URL, pageUrl, social });
    if (!hasImage) imagesMissing.push(project.slug);
    const dir = path.join(DIST, "projeto", project.slug);
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, "index.html"), html, "utf8");
  }
  if (imagesMissing.length) {
    warnings.push(`Sem imagem para og:image (cardImage/screenshots vazios): ${imagesMissing.join(", ")}`);
  }

  // sitemap.xml + robots.txt
  const urls = [`${SITE_URL}/`, `${SITE_URL}/contato.html`, ...projects.map((p) => `${SITE_URL}/projeto/${p.slug}/`)];
  writeFileSync(path.join(DIST, "sitemap.xml"), buildSitemap(urls), "utf8");
  writeFileSync(path.join(DIST, "robots.txt"), buildRobotsTxt(SITE_URL), "utf8");

  // --- Summary ---
  log(`Fonte de dados usada: ${source}`);
  log(`Projetos gerados: ${projects.length}`);
  log(`Rascunhos descartados (draft=true): ${draftDiscarded}`);
  log(`Links inválidos descartados: ${discardedLinks}`);
  warnings.forEach((w) => console.warn(`[build] AVISO: ${w}`));
  log("Build concluído em dist/.");
}

main().catch((err) => {
  console.error(`[build] ERRO FATAL: ${err.message}`);
  process.exit(1);
});
