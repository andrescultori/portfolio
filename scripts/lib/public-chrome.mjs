import { escapeHtml, safeJsonLd } from "./html.mjs";
import { t } from "./public-strings.mjs";
import { HOME_SECTIONS } from "./home-sections.mjs";

const FONTS_LINK =
  '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Space+Grotesk:wght@500;600&display=swap">';

/* <head>: title/description, canonical + hreflang alternates (en, pt-BR,
   x-default -> en), OG/Twitter, optional JSON-LD. assetBase lets project
   pages (one directory deep) and the home/work pages (root) share this. */
export function renderHead({ lang, title, description, canonicalUrl, altUrls, ogImage, jsonLd, robots }) {
  const ogImageTag = ogImage ? `\n  <meta property="og:image" content="${escapeHtml(ogImage)}">` : "";
  const jsonLdTag = jsonLd ? `\n  <script type="application/ld+json">${safeJsonLd(jsonLd)}</script>` : "";
  const robotsTag = robots ? `\n  <meta name="robots" content="${escapeHtml(robots)}">` : "";
  return `<meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="theme-color" content="#0A0C10">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">${robotsTag}
  <link rel="canonical" href="${canonicalUrl}">
  <link rel="alternate" hreflang="en" href="${altUrls.en}">
  <link rel="alternate" hreflang="pt-BR" href="${altUrls.pt}">
  <link rel="alternate" hreflang="x-default" href="${altUrls.en}">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${canonicalUrl}">${ogImageTag}
  <meta name="twitter:card" content="${ogImage ? "summary_large_image" : "summary"}">
  <link rel="icon" href="/img/favicon.svg" type="image/svg+xml">
  ${FONTS_LINK}
  <link rel="stylesheet" href="/css/site.css">${jsonLdTag}`;
}

/* Inline bootstrap: adds "js" before motion.js runs any observer, and a
   1.5s safety net in case motion.js never finishes — see css/site.css's
   "Motion" block and README.md for why this exists. */
export const BOOTSTRAP_SCRIPT = `<script>
    (function () {
      document.documentElement.classList.add("js");
      setTimeout(function () {
        if (!document.documentElement.classList.contains("motion-ready")) {
          document.documentElement.classList.add("reveal-fallback");
        }
      }, 1500);
    })();
  </script>`;

/* EN-only, home-page-only inline redirect: if the visitor hasn't already
   picked a language (no "lang-pref" in localStorage) and their browser
   reports a Portuguese locale, send them to /pt/ before paint. Cloudflare
   Pages' _redirects can't read Accept-Language, so this is done client-side.
   Never added to PT pages (nothing to redirect to) or to work/project pages
   (only the home page should auto-redirect). Callers append this string to
   renderHead()'s own return value. */
export function homeLangRedirectScript(lang) {
  if (lang !== "en") return "";
  return `
  <script>
    (function () {
      try {
        if (localStorage.getItem("lang-pref")) return;
        if (navigator.language && navigator.language.toLowerCase().indexOf("pt") === 0) {
          location.replace("/pt/");
        }
      } catch (e) {}
    })();
  </script>`;
}

/* Stores the visitor's explicit choice so homeLangRedirectScript() above
   never overrides it again. Inline onclick (not a motion.js listener) so it
   fires synchronously before the browser follows the link's href — same
   reasoning as any plain <a>, no SPA router involved. */
function langPrefOnclick(lang) {
  return `try{localStorage.setItem('lang-pref','${lang}')}catch(e){}`;
}

export function renderHeader({ lang, homeHref, workHref, altHrefs, bookingUrl, activeNav }) {
  const s = (key) => t(lang, key);
  const bookBtn = bookingUrl
    ? `<a class="btn btn-primary btn-sm" href="${escapeHtml(bookingUrl)}" target="_blank" rel="noopener">${escapeHtml(s("nav_book_call"))}</a>`
    : "";
  const contactHref = `${homeHref}#contact`;
  const getInTouchBtn = `<a class="btn btn-outline btn-sm nav-get-in-touch" href="${contactHref}">${escapeHtml(s("nav_get_in_touch"))}</a>`;
  const navLinks = (forPanel) => `
      <a class="nav-link" href="${homeHref}#services">${escapeHtml(s("nav_services"))}</a>
      <a class="nav-link"${activeNav === "work" ? ' aria-current="page"' : ""} href="${workHref}">${escapeHtml(s("nav_work"))}</a>
      ${HOME_SECTIONS.process ? `<a class="nav-link" href="${homeHref}#process">${escapeHtml(s("nav_process"))}</a>` : ""}
      <a class="nav-link" href="${homeHref}#about">${escapeHtml(s("nav_about"))}</a>${
    forPanel ? `\n      <a class="nav-link" href="${contactHref}">${escapeHtml(s("nav_get_in_touch"))}</a>` : ""
  }`;

  return `<header class="site-header">
    <div class="wrap site-header-inner">
      <a class="brand" href="${homeHref}">André Scultori</a>
      <nav class="nav-links" aria-label="Primary">${navLinks(false)}
        <span class="lang-switch">
          <a href="${altHrefs.en}" lang="en" onclick="${langPrefOnclick("en")}"${lang === "en" ? ' aria-current="page"' : ""}>EN</a>
          <a href="${altHrefs.pt}" lang="pt-BR" onclick="${langPrefOnclick("pt")}"${lang === "pt" ? ' aria-current="page"' : ""}>PT</a>
        </span>
        ${getInTouchBtn}
        ${bookBtn}
        <button type="button" class="nav-toggle" aria-label="${escapeHtml(s("nav_menu"))}" aria-expanded="false" aria-controls="nav-panel">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>
        </button>
      </nav>
    </div>
    <div class="nav-panel" id="nav-panel">${navLinks(true)}</div>
  </header>`;
}

export function renderFooter({ lang, social }) {
  const s = (key) => t(lang, key);
  const githubLink = social.github
    ? `<a class="u" href="${escapeHtml(social.github)}" target="_blank" rel="noopener">${escapeHtml(s("footer_github"))}</a>`
    : "";
  const linkedinLink = social.linkedin
    ? `<a class="u" href="${escapeHtml(social.linkedin)}" target="_blank" rel="noopener">${escapeHtml(s("footer_linkedin"))}</a>`
    : "";
  return `<div class="wrap site-footer-bottom">
      <span>
        ${escapeHtml(s("footer_copyright"))}
        <span class="site-footer-credit">Desenvolvido por
          <a href="https://github.com/andrescultori" target="_blank" rel="noopener">André Scultori</a>
          &nbsp;·&nbsp;© 2026&nbsp;·&nbsp;
          <a href="https://github.com/andrescultori/portfolio" target="_blank" rel="noopener">GitHub</a>
        </span>
      </span>
      <span class="footer-links">
        ${githubLink}
        ${linkedinLink}
        <a class="u" href="/admin.html" style="opacity:.55;">${escapeHtml(s("footer_restricted"))}</a>
      </span>
    </div>`;
}

export function skipLink(lang) {
  return `<a class="skip-link" href="#main">${escapeHtml(t(lang, "skip_link"))}</a>`;
}

export function pageShell({ lang, head, bodyHtml }) {
  return `<!doctype html>
<html lang="${t(lang, "html_lang")}">
<head>
  ${head}
  ${BOOTSTRAP_SCRIPT}
</head>
<body>
  ${skipLink(lang)}
${bodyHtml}
  <script src="/js/motion.js" defer></script>
</body>
</html>
`;
}
