export function buildSitemap(urls) {
  const entries = urls.map((u) => `  <url><loc>${u}</loc></url>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>\n`;
}

/* Bilingual sitemap: one <url> per page, each carrying <xhtml:link
   hreflang> alternates to its sibling in the other language plus
   x-default -> the EN URL. entries: [{ loc, altEn, altPt }]. */
export function buildSitemapWithAlternates(entries) {
  const body = entries
    .map((e) => {
      const alts = [
        `    <xhtml:link rel="alternate" hreflang="en" href="${e.altEn}"/>`,
        `    <xhtml:link rel="alternate" hreflang="pt-BR" href="${e.altPt}"/>`,
        `    <xhtml:link rel="alternate" hreflang="x-default" href="${e.altEn}"/>`,
      ].join("\n");
      return `  <url>\n    <loc>${e.loc}</loc>\n${alts}\n  </url>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${body}\n</urlset>\n`;
}

export function buildRobotsTxt(siteUrl, options = {}) {
  const disallow = options.disallow || [];
  const disallowLines = disallow.map((p) => `Disallow: ${p}`).join("\n");
  return `User-agent: *\nAllow: /\n${disallowLines ? disallowLines + "\n" : ""}Sitemap: ${siteUrl}/sitemap.xml\n`;
}

export function buildPersonJsonLd({ siteUrl, social, image, jobTitle, knowsAbout }) {
  const sameAs = [social.github, social.linkedin].filter(Boolean);
  const json = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: "André Scultori",
    jobTitle: jobTitle || "BI & Automation Consultant",
    url: `${siteUrl}/`,
    sameAs,
  };
  if (image) json.image = image;
  if (Array.isArray(knowsAbout) && knowsAbout.length) json.knowsAbout = knowsAbout;
  return json;
}
