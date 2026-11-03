/* Single place to set your social/contact link defaults. These are baked
   into the public pages at build time (scripts/lib/social.mjs reads this
   file as text) — portfolio_site_settings in Supabase (editable from the
   admin panel's "Site" section) overrides any of these when set, same as
   the profile photo and hero text. Not loaded by any page at runtime. */

const SOCIAL_LINKS = {
  linkedin: "", // e.g. "https://www.linkedin.com/in/andrescultori"
  instagram: "", // e.g. "https://www.instagram.com/andrescultori"
  github: "https://github.com/andrescultori",
  email: "amscultori@gmail.com",
  resume: "", // deprecated by cv_en/cv_pt below, kept for backward compatibility
  booking: "", // e.g. "https://cal.com/andrescultori/30min" — https:// only
  cv_en: "", // e.g. "/cv/andre-scultori-en.pdf" or an https:// URL
  cv_pt: "", // e.g. "/cv/andre-scultori-pt.pdf" or an https:// URL
};
