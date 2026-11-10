import { escapeHtml } from "./html.mjs";
import { homePath, absoluteUrl } from "./public-urls.mjs";
import { renderHead, renderFooter, skipLink, pageShell } from "./public-chrome.mjs";

/* Temporary stand-in for the real home page while André finalizes the
   redesign (see build.mjs's HOME_UNDER_CONSTRUCTION flag) — only the
   home page (/ and /pt/) is affected; /work/, project pages, admin.html
   and pm.html are untouched. Deliberately minimal and self-contained
   (no nav, since there's nothing to navigate to yet) so it's safe to
   flip back to the real renderHomePage() at any time. */

const STRINGS = {
  en: {
    html_lang: "en",
    title: "André Scultori — Under construction",
    description: "This site is being redesigned. Reach out directly in the meantime.",
    h1: "Under construction",
    body: "I'm reworking this site's design. In the meantime, feel free to reach out directly.",
    email_label: "Email me",
    lang_switch: "PT",
  },
  pt: {
    html_lang: "pt-BR",
    title: "André Scultori — Em construção",
    description: "Este site está sendo reformulado. Enquanto isso, entre em contato diretamente.",
    h1: "Em construção",
    body: "Estou refazendo o design deste site. Enquanto isso, fique à vontade para entrar em contato diretamente.",
    email_label: "Enviar e-mail",
    lang_switch: "EN",
  },
};

export function renderUnderConstructionPage({ lang, siteUrl, social }) {
  const s = STRINGS[lang] || STRINGS.en;
  const otherLang = lang === "pt" ? "en" : "pt";
  const homeHref = homePath(lang);
  const altHrefs = { en: absoluteUrl(siteUrl, homePath("en")), pt: absoluteUrl(siteUrl, homePath("pt")) };
  const canonicalUrl = absoluteUrl(siteUrl, homeHref);

  const head = renderHead({
    lang,
    title: s.title,
    description: s.description,
    canonicalUrl,
    altUrls: altHrefs,
  });

  const contactLinks = [
    social.email
      ? `<a class="btn btn-primary" href="mailto:${escapeHtml(social.email)}">${escapeHtml(s.email_label)}</a>`
      : "",
    social.linkedin
      ? `<a class="btn btn-outline" href="${escapeHtml(social.linkedin)}" target="_blank" rel="noopener">LinkedIn</a>`
      : "",
    social.github
      ? `<a class="btn btn-outline" href="${escapeHtml(social.github)}" target="_blank" rel="noopener">GitHub</a>`
      : "",
  ]
    .filter(Boolean)
    .join("\n        ");

  const body = `<header class="site-header">
    <div class="wrap site-header-inner">
      <a class="brand" href="${homeHref}">André Scultori</a>
      <span class="lang-switch">
        <a href="${altHrefs[otherLang]}" lang="${otherLang === "pt" ? "pt-BR" : "en"}">${escapeHtml(s.lang_switch)}</a>
      </span>
    </div>
  </header>
  <main id="main" class="uc-main">
    <div class="wrap uc-wrap">
      <h1>${escapeHtml(s.h1)}</h1>
      <p class="uc-body">${escapeHtml(s.body)}</p>
      <div class="uc-actions">${contactLinks}</div>
    </div>
  </main>
  <section class="contact-band">
    <div class="wrap" style="padding:32px 0">
      ${renderFooter({ lang, social })}
    </div>
  </section>`;

  return pageShell({ lang, head, bodyHtml: `${body}` });
}
