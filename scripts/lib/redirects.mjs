/* Cloudflare Pages _redirects file for the old single-language URL
   scheme. One rule per old project page (old /projeto/<slug>/ -> new
   PT /pt/projetos/<slug>/, since the pre-redesign site was PT-primary),
   plus the two retired standalone pages (all 301s), and /hub, a 302 to
   the private project hub, which lives in its own Pages project (302 so
   browsers don't cache it before the hub moves to a custom subdomain). */
export const HUB_URL = "https://amshub.pages.dev";

export function buildRedirects(slugs) {
  const projectRules = slugs
    .map((slug) => `/projeto/${slug}/ /pt/projetos/${slug}/ 301`)
    .join("\n");
  return `/contato.html /#contact 301
/projeto.html /work/ 301
/hub ${HUB_URL}/ 302
/hub/* ${HUB_URL}/:splat 302
${projectRules}
`;
}
