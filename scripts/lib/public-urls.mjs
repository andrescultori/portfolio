/* Localized path helpers for the public site. EN lives at the root, PT
   under /pt/ — same data, two fully prerendered trees, no runtime
   language switching. Keep these in sync with the _redirects rules in
   scripts/lib/redirects.mjs and the routes scripts/build.mjs writes. */

export function homePath(lang) {
  return lang === "pt" ? "/pt/" : "/";
}

export function workIndexPath(lang) {
  return lang === "pt" ? "/pt/trabalhos/" : "/work/";
}

export function projectPath(lang, slug) {
  return lang === "pt" ? `/pt/projetos/${slug}/` : `/projects/${slug}/`;
}

export function absoluteUrl(siteUrl, pathname) {
  return `${String(siteUrl).replace(/\/+$/, "")}${pathname}`;
}

export const OTHER_LANG = { en: "pt", pt: "en" };

/* Project images (cardImage/screenshots) are stored as repo-relative paths
   like "img/projects/x/cover.jpg". Every public page now lives at a
   different URL depth (/, /pt/, /work/, /projects/<slug>/, …), so a plain
   relative src would resolve wrong on anything but the site root — always
   root-absolute it instead. Already-absolute http(s) URLs pass through. */
export function assetSrc(src) {
  if (!src) return "";
  if (/^https?:\/\//i.test(src)) return src;
  return `/${String(src).replace(/^\/+/, "")}`;
}
