/* Cloudflare Pages _redirects file for the old single-language URL
   scheme. One rule per old project page (old /projeto/<slug>/ -> new
   PT /pt/projetos/<slug>/, since the pre-redesign site was PT-primary),
   plus the two retired standalone pages. All 301s. */
export function buildRedirects(slugs) {
  const projectRules = slugs
    .map((slug) => `/projeto/${slug}/ /pt/projetos/${slug}/ 301`)
    .join("\n");
  return `/contato.html /#contact 301
/projeto.html /work/ 301
${projectRules}
`;
}
