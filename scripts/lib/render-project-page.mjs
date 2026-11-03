import { t, categoryLabel } from "./public-strings.mjs";
import { homePath, workIndexPath, projectPath, absoluteUrl, assetSrc, OTHER_LANG } from "./public-urls.mjs";
import { renderHead, renderHeader, renderFooter, pageShell } from "./public-chrome.mjs";
import { escapeHtml } from "./html.mjs";

const ICON_GITHUB =
  '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 .5C5.73.5.98 5.24.98 11.5c0 4.98 3.23 9.2 7.71 10.69.56.1.77-.24.77-.54 0-.27-.01-1.16-.02-2.1-3.14.68-3.8-1.34-3.8-1.34-.51-1.31-1.25-1.66-1.25-1.66-1.02-.7.08-.69.08-.69 1.13.08 1.72 1.16 1.72 1.16 1 1.72 2.63 1.22 3.27.93.1-.73.39-1.22.71-1.5-2.51-.29-5.15-1.26-5.15-5.6 0-1.24.44-2.25 1.16-3.04-.12-.29-.5-1.45.11-3.02 0 0 .95-.3 3.12 1.16a10.8 10.8 0 0 1 5.68 0c2.16-1.46 3.11-1.16 3.11-1.16.62 1.57.23 2.73.11 3.02.73.79 1.16 1.8 1.16 3.04 0 4.35-2.65 5.31-5.17 5.59.4.35.76 1.03.76 2.08 0 1.5-.01 2.71-.01 3.08 0 .3.2.65.78.54A10.52 10.52 0 0 0 23.02 11.5C23.02 5.24 18.27.5 12 .5Z"/></svg>';
const ICON_EXTERNAL =
  '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6"/><path d="M10 14 21 3"/></svg>';

function resolveAbsoluteImageUrl(src, siteUrl) {
  if (!src) return "";
  if (/^https?:\/\//i.test(src)) return src;
  return `${siteUrl}/${String(src).replace(/^\/+/, "")}`;
}

/* Picks the current language's text, falling back to the other language's
   when the current one is empty — returning which language was actually
   used, so the caller can set lang="pt"/"en" on that element when it
   differs from the page's own html lang. Returns null when both are
   empty, so the caller can skip the whole block/section. */
function pickText(field, lang) {
  if (!field || typeof field !== "object") return null;
  const other = OTHER_LANG[lang];
  const primary = typeof field[lang] === "string" ? field[lang].trim() : "";
  if (primary) return { text: primary, lang };
  const fallback = typeof field[other] === "string" ? field[other].trim() : "";
  if (fallback) return { text: fallback, lang: other };
  return null;
}

function langAttr(pageLang, textLang) {
  if (textLang === pageLang) return "";
  return ` lang="${textLang === "pt" ? "pt-BR" : "en"}"`;
}

function hasCaseStudyContent(caseStudy) {
  if (!caseStudy || typeof caseStudy !== "object") return false;
  const textFields = ["problem", "data", "approach", "insights", "impact"];
  const hasText = textFields.some((key) => {
    const f = caseStudy[key];
    return f && ((f.pt && f.pt.trim()) || (f.en && f.en.trim()));
  });
  const hasMetrics = Array.isArray(caseStudy.metrics) && caseStudy.metrics.length > 0;
  return hasText || hasMetrics;
}

function metaRowHtml(lang, project) {
  if (!project.stack || !project.stack.length) return "";
  return `<div class="cs-meta-row">
      <div class="cs-meta-item"><span class="k">${escapeHtml(t(lang, "cs_meta_tools"))}</span><span>${escapeHtml(project.stack.join(" · "))}</span></div>
    </div>`;
}

function resultStripHtml(lang, metrics) {
  if (!Array.isArray(metrics) || !metrics.length) return "";
  const items = metrics
    .slice(0, 3)
    .map((m) => {
      const label = pickText(m.label, lang);
      if (!label) return "";
      const kind = m.kind === "estimated" ? t(lang, "cs_metric_estimated") : t(lang, "cs_metric_measured");
      return `<div class="cs-result">
          <span class="val mono">${escapeHtml(m.value)}</span>
          <span class="label"${langAttr(lang, label.lang)}>${escapeHtml(label.text)}</span>
          <span class="kind">${escapeHtml(kind)}</span>
        </div>`;
    })
    .filter(Boolean)
    .join("");
  if (!items) return "";
  return `<section class="cs-results"><div class="wrap cs-results-row">${items}</div></section>`;
}

function visualHtml(lang, project) {
  if (project.powerbiUrl) {
    return `<section class="cs-visual"><div class="wrap">
        <div class="cs-visual-embed">
          <iframe src="${escapeHtml(project.powerbiUrl)}" title="${escapeHtml(project.title)} — Power BI" loading="lazy" referrerpolicy="no-referrer" allowfullscreen></iframe>
        </div>
        <p class="cs-visual-caption">${escapeHtml(t(lang, "cs_demo_caption"))}</p>
      </div></section>`;
  }
  const src = project.screenshots && project.screenshots[0] ? project.screenshots[0] : project.cardImage;
  if (!src) return "";
  return `<section class="cs-visual"><div class="wrap">
      <div class="cs-visual-frame"><img src="${escapeHtml(assetSrc(src))}" alt="${escapeHtml(project.title)}" loading="lazy"></div>
    </div></section>`;
}

function caseStudySectionsHtml(lang, caseStudy) {
  const sections = [];

  const problem = pickText(caseStudy.problem, lang);
  const data = pickText(caseStudy.data, lang);
  if (problem || data) {
    const paras = [problem, data]
      .filter(Boolean)
      .map((p) => `<p${langAttr(lang, p.lang)}>${escapeHtml(p.text)}</p>`)
      .join("\n          ");
    sections.push(`<div class="cs-section" data-reveal>
        <h2>${escapeHtml(t(lang, "cs_section_context"))}</h2>
        <div class="cs-section-body">${paras}</div>
      </div>`);
  }

  const approach = pickText(caseStudy.approach, lang);
  if (approach) {
    sections.push(`<div class="cs-section" data-reveal>
        <h2>${escapeHtml(t(lang, "cs_section_approach"))}</h2>
        <div class="cs-section-body"><p${langAttr(lang, approach.lang)}>${escapeHtml(approach.text)}</p></div>
      </div>`);
  }

  const insights = pickText(caseStudy.insights, lang);
  if (insights) {
    sections.push(`<div class="cs-section" data-reveal>
        <h2>${escapeHtml(t(lang, "cs_section_insights"))}</h2>
        <div class="cs-section-body"><p${langAttr(lang, insights.lang)}>${escapeHtml(insights.text)}</p></div>
      </div>`);
  }

  const impact = pickText(caseStudy.impact, lang);
  if (impact) {
    sections.push(`<div class="cs-section" data-reveal>
        <h2>${escapeHtml(t(lang, "cs_section_results"))}</h2>
        <div class="cs-section-body"><p${langAttr(lang, impact.lang)}>${escapeHtml(impact.text)}</p></div>
      </div>`);
  }

  return sections.join("\n      ");
}

function ctaHtml(lang, social, nextProject) {
  const buttons = [
    social.booking
      ? `<a class="btn btn-on-dark" href="${escapeHtml(social.booking)}" target="_blank" rel="noopener">${escapeHtml(t(lang, "contact_book"))}</a>`
      : "",
    social.email
      ? `<a class="btn btn-outline-on-dark" href="mailto:${escapeHtml(social.email)}">${escapeHtml(t(lang, "contact_email"))}</a>`
      : "",
    nextProject
      ? `<a class="btn btn-outline-on-dark" href="${projectPath(lang, nextProject.slug)}">${escapeHtml(t(lang, "cs_cta_next"))}</a>`
      : "",
  ]
    .filter(Boolean)
    .join("\n        ");
  return `<section class="cs-cta">
      <div class="wrap cs-cta-inner">
        <h2>${escapeHtml(t(lang, "cs_cta_h2"))}</h2>
        <div class="contact-actions">${buttons}</div>
        ${renderFooter({ lang, social })}
      </div>
    </section>`;
}

function noteHtml(lang, project) {
  const note = pickText(project.note, lang);
  if (!note) return "";
  return `<p class="note-box"${langAttr(lang, note.lang)}>${escapeHtml(note.text)}</p>`;
}

function fallbackLayoutHtml(lang, project) {
  const desc = pickText(project.description, lang);
  const descHtml = desc ? `<p${langAttr(lang, desc.lang)}>${escapeHtml(desc.text)}</p>` : "";
  const noteHtmlStr = noteHtml(lang, project);

  const shots = project.screenshots || [];
  const shotsHtml = shots.length
    ? `<div class="fallback-shots">
        ${shots.map((src) => `<img src="${escapeHtml(assetSrc(src))}" alt="${escapeHtml(project.title)}" loading="lazy">`).join("\n        ")}
      </div>`
    : "";

  const tags = (project.stack || []).map((s) => `<span class="tag">${escapeHtml(s)}</span>`).join("");
  const liveLink = project.links && project.links.live
    ? `<a class="btn btn-outline btn-sm" href="${escapeHtml(project.links.live)}" target="_blank" rel="noopener">${ICON_EXTERNAL} ${escapeHtml(t(lang, "link_live"))}</a>`
    : "";
  const githubLink = project.links && project.links.github
    ? `<a class="btn btn-outline btn-sm" href="${escapeHtml(project.links.github)}" target="_blank" rel="noopener">${ICON_GITHUB} ${escapeHtml(t(lang, "link_github"))}</a>`
    : "";
  const commercialBadge = project.commercial
    ? `<span class="tag" style="border-color:var(--accent);color:var(--accent)">${escapeHtml(t(lang, "badge_commercial"))}</span>`
    : "";

  return `<div class="fallback-body"><div class="wrap" style="display:flex;gap:56px;flex-wrap:wrap;width:100%">
      <div class="fallback-main">
        ${descHtml}
        ${noteHtmlStr}
        ${shotsHtml}
      </div>
      <aside class="fallback-side">
        ${commercialBadge}
        <div>
          <h4>${escapeHtml(t(lang, "fallback_stack"))}</h4>
          <div class="tag-row">${tags}</div>
        </div>
        <div>
          <h4>${escapeHtml(t(lang, "fallback_links"))}</h4>
          <div style="display:flex;flex-direction:column;gap:10px">${liveLink}${githubLink}</div>
        </div>
      </aside>
    </div></div>`;
}

/* Full case-study layout when the project has any case_study content
   (text fields and/or metrics), otherwise a clean fallback layout with
   just description/screenshots/stack/links. Both are fully prerendered,
   one language per build (lang: "en" | "pt") — no runtime toggle. */
export function renderProjectPage({ lang, project, siteUrl, social, nextProject }) {
  const homeHref = homePath(lang);
  const workHref = workIndexPath(lang);
  const pagePath = projectPath(lang, project.slug);
  const altHrefs = {
    en: absoluteUrl(siteUrl, projectPath("en", project.slug)),
    pt: absoluteUrl(siteUrl, projectPath("pt", project.slug)),
  };
  const canonicalUrl = absoluteUrl(siteUrl, pagePath);

  const descForMeta = pickText(project.description, lang);
  const imageCandidate = project.cardImage || (project.screenshots && project.screenshots[0]) || "";
  const imageUrl = resolveAbsoluteImageUrl(imageCandidate, siteUrl);
  const hasImage = Boolean(imageUrl);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CreativeWork",
    name: project.title,
    description: descForMeta ? descForMeta.text : "",
    url: canonicalUrl,
    author: { "@type": "Person", name: "André Scultori", url: social.github || "https://github.com/andrescultori" },
  };
  if (hasImage) jsonLd.image = imageUrl;
  if (project.links && project.links.github) jsonLd.codeRepository = project.links.github;
  const sameAs = [project.links && project.links.live, project.links && project.links.github].filter(Boolean);
  if (sameAs.length) jsonLd.sameAs = sameAs;

  const head = renderHead({
    lang,
    title: `${project.title} | André Scultori`,
    description: descForMeta ? descForMeta.text : project.title,
    canonicalUrl,
    altUrls: altHrefs,
    ogImage: imageUrl || undefined,
    jsonLd,
  });
  const header = renderHeader({ lang, homeHref, workHref, altHrefs, bookingUrl: social.booking, activeNav: "work" });

  const useCaseStudy = hasCaseStudyContent(project.caseStudy);
  const lede = pickText(project.description, lang);

  let body;
  if (useCaseStudy) {
    const cs = project.caseStudy || {};
    body = `<main id="main">
      <section class="cs-header">
        <div class="wrap" style="display:flex;flex-direction:column;gap:32px">
          <a class="u cs-back" href="${workHref}">${escapeHtml(t(lang, "cs_back"))}</a>
          <div class="cs-title-block">
            <p class="eyebrow">${escapeHtml(t(lang, "cs_eyebrow"))} · ${escapeHtml(categoryLabel(lang, project.category))}</p>
            <h1>${escapeHtml(project.title)}</h1>
            ${lede ? `<p class="cs-lede"${langAttr(lang, lede.lang)}>${escapeHtml(lede.text)}</p>` : ""}
            ${noteHtml(lang, project)}
          </div>
          ${metaRowHtml(lang, project)}
        </div>
      </section>
      ${resultStripHtml(lang, cs.metrics)}
      ${visualHtml(lang, project)}
      <section class="cs-body"><div class="wrap">
        ${caseStudySectionsHtml(lang, cs)}
      </div></section>
      ${ctaHtml(lang, social, nextProject)}
    </main>`;
  } else {
    body = `<main id="main">
      <section class="fallback-header"><div class="wrap">
        <a class="u cs-back" href="${workHref}">${escapeHtml(t(lang, "cs_back"))}</a>
        <p class="eyebrow">${escapeHtml(categoryLabel(lang, project.category))}</p>
        <h1>${escapeHtml(project.title)}</h1>
      </div></section>
      ${fallbackLayoutHtml(lang, project)}
      ${ctaHtml(lang, social, nextProject)}
    </main>`;
  }

  const html = pageShell({ lang, head, bodyHtml: `${header}\n${body}` });
  return { html, hasImage };
}
