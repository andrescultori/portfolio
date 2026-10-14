import { escapeHtml } from "./html.mjs";

/* Standalone static page for dist/projeto/<slug>/index.html. Mirrors the
   header/nav/footer chrome and the #project-title/#project-tags/etc. DOM
   structure that js/project.js's renderProject() fills in, so content is
   visible without JS and hydration (once project.js runs) replaces it with
   equivalent content instead of leaving stale/duplicate markup. Keep this in
   sync by hand if projeto.html's header/footer chrome changes.

   project.js reads the project slug from `?slug=` in the URL, but this page
   has none (it's served at a clean /projeto/<slug>/ path for crawlers and
   sitemap.xml). The inline script in <head> patches `window.location.search`
   via History.replaceState before project.js's DOMContentLoaded handler
   runs, so initProjectPage() finds the project normally. This requires no
   change to project.js itself. */

const ICON_GITHUB =
  '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 .5C5.73.5.98 5.24.98 11.5c0 4.98 3.23 9.2 7.71 10.69.56.1.77-.24.77-.54 0-.27-.01-1.16-.02-2.1-3.14.68-3.8-1.34-3.8-1.34-.51-1.31-1.25-1.66-1.25-1.66-1.02-.7.08-.69.08-.69 1.13.08 1.72 1.16 1.72 1.16 1 1.72 2.63 1.22 3.27.93.1-.73.39-1.22.71-1.5-2.51-.29-5.15-1.26-5.15-5.6 0-1.24.44-2.25 1.16-3.04-.12-.29-.5-1.45.11-3.02 0 0 .95-.3 3.12 1.16a10.8 10.8 0 0 1 5.68 0c2.16-1.46 3.11-1.16 3.11-1.16.62 1.57.23 2.73.11 3.02.73.79 1.16 1.8 1.16 3.04 0 4.35-2.65 5.31-5.17 5.59.4.35.76 1.03.76 2.08 0 1.5-.01 2.71-.01 3.08 0 .3.2.65.78.54A10.52 10.52 0 0 0 23.02 11.5C23.02 5.24 18.27.5 12 .5Z"/></svg>';
const ICON_EXTERNAL =
  '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6"/><path d="M10 14 21 3"/></svg>';

function assetPath(src) {
  if (!src) return "";
  if (/^https?:\/\//i.test(src)) return src;
  return `../../${String(src).replace(/^\/+/, "")}`;
}

function resolveAbsoluteImageUrl(src, siteUrl) {
  if (!src) return "";
  if (/^https?:\/\//i.test(src)) return src;
  return `${siteUrl}/${String(src).replace(/^\/+/, "")}`;
}

function renderStackTags(stack) {
  return (stack || []).map((s) => `<span class="tag">${escapeHtml(s)}</span>`).join("");
}

function renderActions(project, variant) {
  const liveClass = variant === "hero" ? "btn btn-primary btn-sm" : "btn btn-ghost-light btn-sm";
  const githubClass = variant === "hero" ? "btn btn-ghost-dark btn-sm" : "btn btn-ghost-light btn-sm";
  let html = "";
  if (project.links && project.links.live) {
    html += `<a href="${escapeHtml(project.links.live)}" target="_blank" rel="noopener" class="${liveClass}">${ICON_EXTERNAL} Ver ao vivo</a>`;
  }
  if (project.links && project.links.github) {
    html += `<a href="${escapeHtml(project.links.github)}" target="_blank" rel="noopener" class="${githubClass}">${ICON_GITHUB} Ver no GitHub</a>`;
  }
  return html;
}

export function renderProjectPage({ project, siteUrl, pageUrl, social }) {
  const descPt = (project.description && project.description.pt) || "";
  const descEn = (project.description && project.description.en) || "";
  const notePt = (project.note && project.note.pt) || "";
  const noteEn = (project.note && project.note.en) || "";

  const imageCandidate = project.cardImage || (project.screenshots && project.screenshots[0]) || "";
  const imageUrl = resolveAbsoluteImageUrl(imageCandidate, siteUrl);
  const hasImage = Boolean(imageUrl);

  const metaDescriptionRaw = descPt.length > 300 ? `${descPt.slice(0, 297)}...` : descPt;
  const metaDescription = escapeHtml(metaDescriptionRaw);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CreativeWork",
    name: project.title,
    description: descPt,
    url: pageUrl,
    author: { "@type": "Person", name: "André Scultori", url: social.github || "https://github.com/andrescultori" },
  };
  if (hasImage) jsonLd.image = imageUrl;
  if (project.links && project.links.github) jsonLd.codeRepository = project.links.github;
  const sameAs = [project.links && project.links.live, project.links && project.links.github].filter(Boolean);
  if (sameAs.length) jsonLd.sameAs = sameAs;

  const coverHtml = project.cardImage
    ? `<div class="project-cover"><img src="${escapeHtml(assetPath(project.cardImage))}" alt="${escapeHtml(project.title)}"></div>`
    : "";

  const noteHtml = notePt
    ? `<span id="project-note" class="project-note" style="display:inline-block;">${escapeHtml(notePt)}</span>`
    : `<span id="project-note" class="project-note" style="display:none;"></span>`;

  const shots = project.screenshots || [];
  const shotsHtml = shots.length
    ? `<div id="screenshots-section" style="display:block;">
            <h3 style="margin-top:44px; font-size:18px; font-weight:600;">Capturas de tela</h3>
            <div class="shot-grid" id="shot-grid">
              ${shots
                .map(
                  (src) =>
                    `<img src="${escapeHtml(assetPath(src))}" alt="${escapeHtml(project.title)}" loading="lazy">`
                )
                .join("\n              ")}
            </div>
          </div>`
    : `<div id="screenshots-section" style="display:none;"><div class="shot-grid" id="shot-grid"></div></div>`;

  const enBlock = (descEn || noteEn)
    ? `
  <section class="wrap" lang="en" style="padding: 0 24px 48px; margin-top: 24px; border-top: 1px solid rgba(244,243,240,.1);">
    <h3 style="font-size:16px; font-weight:600; margin-bottom:8px;">English version</h3>
    ${descEn ? `<p class="prose">${escapeHtml(descEn)}</p>` : ""}
    ${noteEn ? `<p><em>${escapeHtml(noteEn)}</em></p>` : ""}
  </section>`
    : "";

  const slugShim = `<script>
    (function () {
      if (!window.location.search) {
        var slug = ${JSON.stringify(project.slug)};
        var url = window.location.pathname + "?slug=" + encodeURIComponent(slug) + window.location.hash;
        window.history.replaceState(null, "", url);
      }
    })();
  </script>`;

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(project.title)} — André Scultori</title>
  <meta name="description" content="${metaDescription}">
  <link rel="canonical" href="${pageUrl}">
  <meta property="og:title" content="${escapeHtml(project.title)} — André Scultori">
  <meta property="og:description" content="${metaDescription}">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${pageUrl}">
  ${hasImage ? `<meta property="og:image" content="${imageUrl}">` : ""}
  <meta name="twitter:card" content="${hasImage ? "summary_large_image" : "summary"}">
  <link rel="icon" href="../../img/favicon.svg" type="image/svg+xml">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="../../css/styles.css">
  <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
  ${slugShim}
</head>
<body>

  <header class="site-header">
    <div class="wrap">
      <a class="brand" href="../../index.html">
        <span class="brand-mark">AS</span>
        André Scultori
      </a>
      <nav class="nav-links">
        <a class="nav-link" href="../../index.html#projetos">Projetos</a>
        <a class="nav-link" href="../../contato.html">Contato</a>
        <a class="nav-link" href="../../admin.html">Área restrita</a>
        <div class="lang-toggle">
          <button type="button" data-lang="pt">PT</button>
          <button type="button" data-lang="en">EN</button>
        </div>
      </nav>
    </div>
  </header>

  <div id="project-app">
    <section class="project-hero">
      <div class="wrap">
        <a class="back-link" href="../../index.html#projetos">&larr; <span>Voltar aos projetos</span></a>
        <div class="project-hero-top">
          <div>
            <h1 id="project-title">${escapeHtml(project.title)}</h1>
            <div class="tag-row" id="project-tags">${renderStackTags(project.stack)}</div>
          </div>
          <div class="project-actions" id="project-actions">${renderActions(project, "hero")}</div>
        </div>
        <div class="project-cover" id="project-cover">${coverHtml}</div>
      </div>
    </section>

    <section class="project-body">
      <div class="wrap project-layout">
        <div>
          <p class="prose" id="project-description">${escapeHtml(descPt)}</p>
          ${noteHtml}

          ${shotsHtml}
        </div>

        <aside class="side-card">
          <h4>Stack utilizada</h4>
          <div class="tag-row" id="side-stack">${renderStackTags(project.stack)}</div>
          <div class="side-links" id="side-links">${renderActions(project, "side")}</div>
        </aside>
      </div>
    </section>
  </div>
${enBlock}
  <footer class="site-footer">
    <div class="wrap">
      <div class="footer-bottom" style="border-top:1px solid rgba(244,243,240,.1); padding-top:20px;">
        <span>Todos os direitos reservados.</span>
        <span>
          <span>Desenvolvido por</span>
          <a href="https://github.com/andrescultori" target="_blank" rel="noopener">André Scultori</a>
          &nbsp;·&nbsp;© 2026&nbsp;·&nbsp;
          <a href="https://github.com/andrescultori/portfolio" target="_blank" rel="noopener">GitHub</a>
          &nbsp;·&nbsp;
          <a href="../../admin.html" style="opacity:.55;">Área restrita</a>
        </span>
      </div>
    </div>
  </footer>

  <div class="lightbox" id="lightbox">
    <button class="lightbox-close" id="lightbox-close" aria-label="Close">&times;</button>
    <img id="lightbox-img" src="" alt="">
  </div>

  <script src="../../js/i18n.js"></script>
  <script src="../../js/social.js"></script>
  <script src="../../js/supabase-config.js"></script>
  <script src="../../js/projects-data.js"></script>
  <script src="../../js/project.js"></script>
</body>
</html>
`;

  return { html, hasImage };
}
