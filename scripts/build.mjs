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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const DIST = path.join(ROOT, "dist");

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

  const personJsonLd = buildPersonJsonLd({ siteUrl: SITE_URL, social });
  const headExtra = `  <link rel="canonical" href="${SITE_URL}/">
  <meta property="og:url" content="${SITE_URL}/">
  <script type="application/ld+json">${safeJsonLd(personJsonLd)}</script>
</head>`;
  indexHtml = indexHtml.replace("</head>", headExtra);
  warnings.push("Home: og:image omitido — img/profile/andre.jpg ainda não existe (ver README > Configuração pendente).");

  writeFileSync(indexPath, indexHtml, "utf8");

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
