export function buildSitemap(urls) {
  const entries = urls.map((u) => `  <url><loc>${u}</loc></url>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>\n`;
}

export function buildRobotsTxt(siteUrl) {
  return `User-agent: *\nAllow: /\nSitemap: ${siteUrl}/sitemap.xml\n`;
}

export function buildPersonJsonLd({ siteUrl, social }) {
  const sameAs = [social.github, social.linkedin].filter(Boolean);
  return {
    "@context": "https://schema.org",
    "@type": "Person",
    name: "André Scultori",
    jobTitle: "BI & Automation Analyst",
    url: `${siteUrl}/`,
    sameAs,
  };
}
