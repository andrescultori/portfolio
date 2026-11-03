import { escapeHtml } from "./html.mjs";
import { t, categoryLabel } from "./public-strings.mjs";
import { homePath, workIndexPath, projectPath, absoluteUrl, assetSrc } from "./public-urls.mjs";
import { renderHead, renderHeader, renderFooter, pageShell } from "./public-chrome.mjs";

const CATEGORIES = ["data-bi", "automation", "apps"];

function filterChipsHtml(lang) {
  const all = `<button type="button" class="filter-chip" data-filter="all" aria-pressed="true">${escapeHtml(t(lang, "filter_all"))}</button>`;
  const rest = CATEGORIES.map(
    (cat) =>
      `<button type="button" class="filter-chip" data-filter="${cat}" aria-pressed="false">${escapeHtml(categoryLabel(lang, cat))}</button>`
  ).join("\n      ");
  return `<div class="filter-row" role="group" aria-label="${escapeHtml(t(lang, "filter_all"))}">
      ${all}
      ${rest}
    </div>`;
}

function rowHtml(lang, project) {
  const href = projectPath(lang, project.slug);
  const cover = project.cardImage || (project.screenshots && project.screenshots[0]) || "";
  const coverHtml = cover ? `<img src="${escapeHtml(assetSrc(cover))}" alt="" loading="lazy">` : "";
  return `<a class="work-index-row" href="${href}" data-category="${escapeHtml(project.category || "apps")}" data-reveal>
      <div class="work-index-cover">${coverHtml}</div>
      <div class="work-index-meta">
        <span class="eyebrow" style="margin:0">${escapeHtml(categoryLabel(lang, project.category))}</span>
        <h3 class="work-title" style="font-size:20px">${escapeHtml(project.title || "")}</h3>
        <p class="work-stack">${escapeHtml((project.stack || []).join(" · "))}</p>
      </div>
    </a>`;
}

export function renderWorkIndexPage({ lang, projects, siteUrl, social }) {
  const homeHref = homePath(lang);
  const workHref = workIndexPath(lang);
  const altHrefs = { en: absoluteUrl(siteUrl, workIndexPath("en")), pt: absoluteUrl(siteUrl, workIndexPath("pt")) };
  const canonicalUrl = absoluteUrl(siteUrl, workHref);

  const head = renderHead({
    lang,
    title: `${t(lang, "work_index_h1")} | André Scultori`,
    description: t(lang, "work_index_sub"),
    canonicalUrl,
    altUrls: altHrefs,
  });
  const header = renderHeader({ lang, homeHref, workHref, altHrefs, bookingUrl: social.booking, activeNav: "work" });

  const sorted = (projects || []).slice().sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));

  const body = `<main id="main">
    <div class="wrap">
      <div class="work-index-header" data-reveal>
        <p class="eyebrow">${escapeHtml(t(lang, "work_eyebrow"))}</p>
        <h1>${escapeHtml(t(lang, "work_index_h1"))}</h1>
        <p style="color:var(--muted);font-size:17px">${escapeHtml(t(lang, "work_index_sub"))}</p>
      </div>
      ${filterChipsHtml(lang)}
      <div class="work-index-grid">
        ${sorted.map((p) => rowHtml(lang, p)).join("\n        ")}
      </div>
    </div>
    <section id="contact" class="contact-band" style="margin-top:56px">
      <div class="wrap" style="padding:56px 0">
        ${renderFooter({ lang, social })}
      </div>
    </section>
  </main>`;

  return pageShell({ lang, head, bodyHtml: `${header}\n${body}` });
}
