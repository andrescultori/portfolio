/* Single place to set your social links. Fill these in and every page updates.
   These are just the fallback defaults — portfolio_site_settings in Supabase
   (editable from the admin panel's "Site" section) overrides github/linkedin/
   instagram and the profile photo when set, falling back to these otherwise. */

const SOCIAL_LINKS = {
  linkedin: "", // e.g. "https://www.linkedin.com/in/andrescultori"
  instagram: "", // e.g. "https://www.instagram.com/andrescultori"
  github: "https://github.com/andrescultori",
  email: "amscultori@gmail.com",
  resume: "", // e.g. "assets/curriculo-andre-scultori.pdf"
};

const SITE_SETTINGS_STORAGE_BUCKET = "portfolio-images";

function isHttpsUrl(value) {
  return typeof value === "string" && /^https:\/\//i.test(value.trim());
}

function applySocialLinks(links) {
  const effective = links || SOCIAL_LINKS;
  const map = {
    "github-link": effective.github,
    "github-link-footer": effective.github,
    "linkedin-link": effective.linkedin,
    "linkedin-link-footer": effective.linkedin,
    "linkedin-contact": effective.linkedin,
    "instagram-contact": effective.instagram,
  };
  Object.entries(map).forEach(([id, url]) => {
    const el = document.getElementById(id);
    if (el && isHttpsUrl(url)) el.href = url;
  });

  // The contact page's GitHub item shows the URL itself as its label, so it
  // needs updating too when overridden — unlike the generic "LinkedIn"/
  // "Instagram" labels elsewhere, which never change.
  const githubContact = document.getElementById("github-contact");
  const githubContactLabel = document.getElementById("github-contact-label");
  if (githubContact && isHttpsUrl(effective.github)) {
    githubContact.href = effective.github;
    if (githubContactLabel) {
      githubContactLabel.textContent = effective.github.replace(/^https:\/\//i, "");
    }
  }
}

function applyHeroPhoto(photoUrl) {
  const img = document.getElementById("hero-photo");
  if (img && isHttpsUrl(photoUrl)) {
    img.src = photoUrl;
  }
}

async function applySiteSettingsSocial() {
  const row = await getSiteSettings();
  if (!row) return;

  const rawLinks = row.links && typeof row.links === "object" ? row.links : {};
  applySocialLinks({
    github: isHttpsUrl(rawLinks.github) ? rawLinks.github : SOCIAL_LINKS.github,
    linkedin: isHttpsUrl(rawLinks.linkedin) ? rawLinks.linkedin : SOCIAL_LINKS.linkedin,
    instagram: isHttpsUrl(rawLinks.instagram) ? rawLinks.instagram : SOCIAL_LINKS.instagram,
  });

  if (row.photo_path) {
    const base = SUPABASE_URL.replace(/\/+$/, "");
    const cleanPath = String(row.photo_path).replace(/^\/+/, "");
    const version = row.updated_at ? encodeURIComponent(new Date(row.updated_at).getTime()) : "";
    const url = `${base}/storage/v1/object/public/${SITE_SETTINGS_STORAGE_BUCKET}/${cleanPath}${
      version ? `?v=${version}` : ""
    }`;
    applyHeroPhoto(url);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  applySocialLinks(); // instant paint with SOCIAL_LINKS defaults — never block
  applySiteSettingsSocial(); // then layer admin overrides (links + photo) on top
});
