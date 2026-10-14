const DEFAULT_SITE_URL = "https://andrescultori.pages.dev";

/* Priority: SITE_URL (explicit override) -> CF_PAGES_URL (set automatically
   by Cloudflare Pages at build time, so in practice this is what runs in
   production) -> the hardcoded production URL, kept only as a last-resort
   default so a local/manual build never fails for lack of a site URL. */
export function resolveSiteUrl(env = {}) {
  if (env.SITE_URL) {
    return { url: env.SITE_URL, source: "SITE_URL" };
  }
  if (env.CF_PAGES_URL) {
    return { url: env.CF_PAGES_URL, source: "CF_PAGES_URL" };
  }
  return { url: DEFAULT_SITE_URL, source: "default" };
}
