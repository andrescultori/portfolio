/* Single place to set your social links. Fill these in and every page updates. */

const SOCIAL_LINKS = {
  linkedin: "", // e.g. "https://www.linkedin.com/in/andrescultori"
  instagram: "", // e.g. "https://www.instagram.com/andrescultori"
  github: "https://github.com/andrescultori",
  email: "amscultori@gmail.com",
  resume: "", // e.g. "assets/curriculo-andre-scultori.pdf"
};

function applySocialLinks() {
  const map = {
    "linkedin-link": SOCIAL_LINKS.linkedin,
    "linkedin-link-footer": SOCIAL_LINKS.linkedin,
    "linkedin-contact": SOCIAL_LINKS.linkedin,
    "instagram-contact": SOCIAL_LINKS.instagram,
  };
  Object.entries(map).forEach(([id, url]) => {
    const el = document.getElementById(id);
    if (el && url) el.href = url;
  });
}

document.addEventListener("DOMContentLoaded", applySocialLinks);
