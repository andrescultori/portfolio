import { escapeHtml } from "./html.mjs";

/* Mirrors projectCard() in js/main.js, in PT (the prerendered HTML's fixed
   language — see diagnosis). The href stays "projeto.html?slug=..." on
   purpose, identical to what main.js itself generates, so there is nothing
   for the client JS to reconcile once it re-renders the grid. Crawler/no-JS
   access to the real per-project content goes through the <noscript> list
   and sitemap.xml instead, which link to the static /projeto/<slug>/ pages. */

const ICON_GITHUB =
  '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 .5C5.73.5.98 5.24.98 11.5c0 4.98 3.23 9.2 7.71 10.69.56.1.77-.24.77-.54 0-.27-.01-1.16-.02-2.1-3.14.68-3.8-1.34-3.8-1.34-.51-1.31-1.25-1.66-1.25-1.66-1.02-.7.08-.69.08-.69 1.13.08 1.72 1.16 1.72 1.16 1 1.72 2.63 1.22 3.27.93.1-.73.39-1.22.71-1.5-2.51-.29-5.15-1.26-5.15-5.6 0-1.24.44-2.25 1.16-3.04-.12-.29-.5-1.45.11-3.02 0 0 .95-.3 3.12 1.16a10.8 10.8 0 0 1 5.68 0c2.16-1.46 3.11-1.16 3.11-1.16.62 1.57.23 2.73.11 3.02.73.79 1.16 1.8 1.16 3.04 0 4.35-2.65 5.31-5.17 5.59.4.35.76 1.03.76 2.08 0 1.5-.01 2.71-.01 3.08 0 .3.2.65.78.54A10.52 10.52 0 0 0 23.02 11.5C23.02 5.24 18.27.5 12 .5Z"/></svg>';
const ICON_EXTERNAL =
  '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6"/><path d="M10 14 21 3"/></svg>';

const PT = {
  badge_commercial: "Produto comercial",
  link_live: "Ver ao vivo",
  link_github: "Ver no GitHub",
  link_more: "Veja mais",
};

export function renderCardHtml(project) {
  const desc = (project.description && project.description.pt) || "";
  const detailHref = `projeto.html?slug=${encodeURIComponent(project.slug)}`;

  let media = "";
  if (project.cardImage) {
    media = `<a class="card-media-link" href="${detailHref}" aria-label="${escapeHtml(project.title)}">
      <div class="card-media">
        <img src="${escapeHtml(project.cardImage)}" alt="${escapeHtml(project.title)}" loading="lazy">
        ${project.commercial ? `<span class="badge-commercial">${PT.badge_commercial}</span>` : ""}
      </div>
    </a>`;
  }

  const inlineBadge =
    !project.cardImage && project.commercial
      ? `<span class="badge-commercial badge-commercial--inline">${PT.badge_commercial}</span>`
      : "";

  const tags = (project.stack || []).map((s) => `<span class="tag">${escapeHtml(s)}</span>`).join("");

  const liveLink = project.links && project.links.live
    ? `<a href="${escapeHtml(project.links.live)}" target="_blank" rel="noopener">${ICON_EXTERNAL} ${PT.link_live}</a>`
    : "";
  const githubLink = project.links && project.links.github
    ? `<a href="${escapeHtml(project.links.github)}" target="_blank" rel="noopener">${ICON_GITHUB} ${PT.link_github}</a>`
    : "";

  return `<article class="card">
    ${media}
    <div class="card-body">
      ${inlineBadge}
      <a class="card-title-link" href="${detailHref}"><h3>${escapeHtml(project.title)}</h3></a>
      <p>${escapeHtml(desc)}</p>
      <div class="tag-row">${tags}</div>
      <div class="card-links">
        ${liveLink}
        ${githubLink}
        <a class="card-more-link" href="${detailHref}">${PT.link_more} &rarr;</a>
      </div>
    </div>
  </article>`;
}

export function renderNoscriptList(projects) {
  const items = projects
    .map((p) => `<li><a href="projeto/${encodeURIComponent(p.slug)}/">${escapeHtml(p.title)}</a></li>`)
    .join("\n        ");
  return `<noscript>
      <div class="wrap" style="padding: 16px 0;">
        <p>Esta página usa JavaScript para filtros interativos. Lista completa de projetos:</p>
        <ul>
        ${items}
        </ul>
      </div>
    </noscript>`;
}
