import { escapeHtml } from "./html.mjs";
import { t, categoryLabel } from "./public-strings.mjs";
import { homePath, workIndexPath, projectPath, absoluteUrl, assetSrc } from "./public-urls.mjs";
import { renderHead, renderHeader, renderFooter, pageShell, homeLangRedirectScript } from "./public-chrome.mjs";
import { biMockVisualHtml, getProjectVisualHtml } from "./project-visuals.mjs";
import { HOME_SECTIONS } from "./home-sections.mjs";

function clientsStripHtml(lang, clients) {
  const approved = (clients || []).filter((c) => c && c.approved === true && c.logo);
  if (!approved.length) return "";
  const logos = approved
    .map((c) => {
      const img = `<img src="${escapeHtml(assetSrc(c.logo))}" alt="${escapeHtml(c.name || "")}" loading="lazy">`;
      return c.url
        ? `<a href="${escapeHtml(c.url)}" target="_blank" rel="noopener">${img}</a>`
        : `<span>${img}</span>`;
    })
    .join("");
  return `<section class="clients-strip">
      <div class="wrap clients-row">
        <p class="eyebrow" style="margin:0;color:var(--muted)">${escapeHtml(t(lang, "worked_with"))}</p>
        <div class="clients-logos">${logos}</div>
      </div>
    </section>`;
}

function serviceCardHtml(lang, service, index) {
  const title = (service.title && service.title[lang]) || (service.title && service.title.en) || "";
  const pain = (service.pain && service.pain[lang]) || (service.pain && service.pain.en) || "";
  const bullets = (service.bullets || [])
    .map((b) => `<li>${escapeHtml((b && b[lang]) || (b && b.en) || "")}</li>`)
    .join("");
  const timeline = (service.timeline && service.timeline[lang]) || "";
  const timelineHtml = timeline
    ? `<p class="timeline">${escapeHtml(t(lang, "timeline_prefix"))}${escapeHtml(timeline)}</p>`
    : "";
  return `<div class="service-card" data-reveal data-reveal-delay="${index * 80}">
      <span class="num mono">${escapeHtml(service.number || "")}</span>
      <h3>${escapeHtml(title)}</h3>
      <p class="pain">${escapeHtml(pain)}</p>
      <ul>${bullets}</ul>
      ${timelineHtml}
    </div>`;
}

/* Up to 4 featured projects (featured: true in data/projects.json or the
   portfolio_projects table — any category), rendered as a horizontal row:
   a decorative visual (scripts/lib/project-visuals.mjs) on one side, copy
   and a "View project" link on the other. */
function workRowHtml(lang, project, index) {
  const title = project.title || "";
  const desc = (project.description && (project.description[lang] || project.description.en)) || "";
  const stackPreview = (project.stack || []).slice(0, 4).join(" · ");
  const href = projectPath(lang, project.slug);
  const visual = getProjectVisualHtml(lang, project);
  return `<div class="work-row" data-reveal data-reveal-delay="${index * 60}">
      <div class="work-row-visual">${visual}</div>
      <div class="work-row-body">
        <span class="eyebrow" style="margin:0">${escapeHtml(categoryLabel(lang, project.category))}</span>
        <h3 class="work-title">${escapeHtml(title)}</h3>
        <p class="work-row-desc">${escapeHtml(desc)}</p>
        <p class="work-stack">${escapeHtml(stackPreview)}</p>
        <a class="u link-arrow" href="${href}">${escapeHtml(t(lang, "view_project_link"))} <span class="arrow" aria-hidden="true">→</span></a>
      </div>
    </div>`;
}

function processStepHtml(lang, step, index) {
  const title = (step.title && step.title[lang]) || (step.title && step.title.en) || "";
  const desc = (step.description && step.description[lang]) || (step.description && step.description.en) || "";
  return `<div class="process-step" data-reveal data-reveal-delay="${index * 80}">
      <span class="num mono">${escapeHtml(step.number || "")}</span>
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(desc)}</p>
    </div>`;
}

function appsRowHtml(lang, project) {
  const href = projectPath(lang, project.slug);
  return `<a class="apps-row" href="${href}">
      <span class="title">${escapeHtml(project.title || "")}</span>
      <span class="stack">${escapeHtml((project.stack || []).join(" · "))}</span>
      <span class="arrow" aria-hidden="true">→</span>
    </a>`;
}

export function renderHomePage({ lang, projects, services, process, clients, siteUrl, social, photoUrl, heroOverrides, jsonLd }) {
  const s = (key) => t(lang, key);
  const homeHref = homePath(lang);
  const workHref = workIndexPath(lang);
  const altHrefs = { en: absoluteUrl(siteUrl, homePath("en")), pt: absoluteUrl(siteUrl, homePath("pt")) };
  const canonicalUrl = absoluteUrl(siteUrl, homeHref);

  const heroEyebrow = (heroOverrides && heroOverrides.role) || s("hero_eyebrow_default");
  const heroSub = (heroOverrides && heroOverrides.bio) || s("hero_sub_default");

  const head =
    renderHead({
      lang,
      title: lang === "pt" ? "André Scultori | Consultor de BI & Automação" : "André Scultori | BI & Automation Consultant",
      description: heroSub,
      canonicalUrl,
      altUrls: altHrefs,
      ogImage: photoUrl || undefined,
      jsonLd,
    }) + homeLangRedirectScript(lang);

  const header = renderHeader({ lang, homeHref, workHref, altHrefs, bookingUrl: social.booking, activeNav: null });

  const featuredWork = (projects || [])
    .filter((p) => p.featured)
    .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
    .slice(0, 4);

  const appsProjects = (projects || [])
    .filter((p) => p.category === "apps")
    .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));

  const aboutPhoto = photoUrl
    ? `<div class="about-photo"><img src="${escapeHtml(photoUrl)}" alt="André Scultori" loading="lazy"></div>`
    : "";

  const cvHref = lang === "pt" ? social.cv_pt : social.cv_en;
  const contactButtons = [
    social.booking
      ? `<a class="btn btn-on-dark" href="${escapeHtml(social.booking)}" target="_blank" rel="noopener">${escapeHtml(s("contact_book"))}</a>`
      : "",
    social.email
      ? `<a class="btn btn-outline-on-dark" href="mailto:${escapeHtml(social.email)}">${escapeHtml(s("contact_email"))}</a>`
      : "",
    cvHref
      ? `<a class="btn btn-outline-on-dark" href="${escapeHtml(cvHref)}" target="_blank" rel="noopener">${escapeHtml(s("contact_cv"))}</a>`
      : "",
    social.linkedin
      ? `<a class="btn btn-outline-on-dark" href="${escapeHtml(social.linkedin)}" target="_blank" rel="noopener">${escapeHtml(s("contact_linkedin"))}</a>`
      : "",
  ]
    .filter(Boolean)
    .join("\n        ");

  const aboutLinks = [
    social.linkedin ? `<a class="u" href="${escapeHtml(social.linkedin)}" target="_blank" rel="noopener">LinkedIn</a>` : "",
    social.github ? `<a class="u" href="${escapeHtml(social.github)}" target="_blank" rel="noopener">GitHub</a>` : "",
  ]
    .filter(Boolean)
    .join("\n          ");

  const aboutDetailsHtml = HOME_SECTIONS.aboutDetails
    ? `<dl class="about-dl">
            <div class="about-dl-row"><dt>${escapeHtml(s("about_analytics_label"))}</dt><dd>${escapeHtml(s("about_analytics_value"))}</dd></div>
            <div class="about-dl-row"><dt>${escapeHtml(s("about_automation_label"))}</dt><dd>${escapeHtml(s("about_automation_value"))}</dd></div>
            <div class="about-dl-row"><dt>${escapeHtml(s("about_data_apps_label"))}</dt><dd>${escapeHtml(s("about_data_apps_value"))}</dd></div>
            <div class="about-dl-row"><dt>${escapeHtml(s("about_education_label"))}</dt><dd>${escapeHtml(s("about_education_value"))}</dd></div>
            <div class="about-dl-row"><dt>${escapeHtml(s("about_languages_label"))}</dt><dd>${escapeHtml(s("about_languages_value"))}</dd></div>
          </dl>`
    : "";

  const processSection = HOME_SECTIONS.process
    ? `<section id="process" class="section">
      <div class="wrap">
        <div class="section-head" data-reveal>
          <p class="eyebrow">${escapeHtml(s("process_eyebrow"))}</p>
          <h2>${escapeHtml(s("process_h2"))}</h2>
        </div>
        <div class="process-row">
          ${(process || []).map((step, i) => processStepHtml(lang, step, i)).join("\n          ")}
        </div>
      </div>
    </section>`
    : "";

  const appsSection = HOME_SECTIONS.sideProjects && appsProjects.length
    ? `<section class="section">
      <div class="wrap">
        <div class="section-head" data-reveal>
          <p class="eyebrow">${escapeHtml(s("apps_eyebrow"))}</p>
          <h2 style="font-size:30px">${escapeHtml(s("apps_h2"))}</h2>
        </div>
        <div class="apps-list">
          ${appsProjects.map((p) => appsRowHtml(lang, p)).join("\n          ")}
        </div>
      </div>
    </section>`
    : "";

  const body = `<main id="main">
    <section>
      <div class="wrap hero-inner">
        <div class="hero-copy" data-reveal>
          <p class="eyebrow">${escapeHtml(heroEyebrow)}</p>
          <h1>${escapeHtml(s("hero_h1_plain"))}<br><span class="accent-text">${escapeHtml(s("hero_h1_accent"))}</span></h1>
          <p class="hero-sub">${escapeHtml(heroSub)}</p>
          <div class="hero-actions">
            <a class="btn btn-primary" href="${workHref}">${escapeHtml(s("hero_cta_primary"))}</a>
            <a class="btn btn-outline" href="#contact">${escapeHtml(s("hero_cta_secondary"))}</a>
          </div>
          <p class="hero-note">${escapeHtml(s("hero_note"))}</p>
        </div>
        <div class="hero-visual">${biMockVisualHtml(lang)}</div>
      </div>
    </section>

    ${clientsStripHtml(lang, clients)}

    <section id="services" class="section">
      <div class="wrap">
        <div class="section-head" data-reveal>
          <p class="eyebrow">${escapeHtml(s("services_eyebrow"))}</p>
          <h2>${escapeHtml(s("services_h2"))}</h2>
        </div>
        <div class="cards-row">
          ${(services || []).map((svc, i) => serviceCardHtml(lang, svc, i)).join("\n          ")}
        </div>
      </div>
    </section>

    <section id="work" class="section" style="background:var(--surface);border-top:1px solid var(--line);border-bottom:1px solid var(--line)">
      <div class="wrap">
        <div class="section-head-row">
          <div class="section-head" data-reveal>
            <p class="eyebrow">${escapeHtml(s("work_eyebrow"))}</p>
            <h2>${escapeHtml(s("work_h2"))}</h2>
          </div>
          <a class="u link-arrow" href="${workHref}">${escapeHtml(s("work_all_link"))} <span class="arrow" aria-hidden="true">→</span></a>
        </div>
        <div class="work-rows">
          ${featuredWork.map((p, i) => workRowHtml(lang, p, i)).join("\n          ")}
        </div>
      </div>
    </section>

    ${processSection}

    <section id="about" class="section" style="background:var(--surface);border-top:1px solid var(--line);border-bottom:1px solid var(--line)">
      <div class="wrap about-row">
        ${aboutPhoto}
        <div class="about-copy" data-reveal>
          <p class="eyebrow">${escapeHtml(s("about_eyebrow"))}</p>
          <h2>${escapeHtml(s("about_h2"))}</h2>
          <p>${escapeHtml(s("about_p"))}</p>
          ${aboutDetailsHtml}
          ${aboutLinks ? `<div style="display:flex;gap:20px">${aboutLinks}</div>` : ""}
        </div>
      </div>
    </section>

    ${appsSection}

    <section id="contact" class="contact-band">
      <div class="wrap contact-inner">
        <div class="contact-copy" data-reveal>
          <h2>${escapeHtml(s("contact_h2"))}</h2>
          <p>${escapeHtml(s("contact_p"))}</p>
        </div>
        <div class="contact-actions">
          ${contactButtons}
        </div>
        ${renderFooter({ lang, social })}
      </div>
    </section>
  </main>`;

  return pageShell({ lang, head, bodyHtml: `${header}\n${body}` });
}
