import { readFileSync } from "node:fs";

/* Reads js/social.js as text and extracts SOCIAL_LINKS values with a regex
   (never eval/require it — it's a browser classic script, not a module). */
export function loadSocialLinks(filePath) {
  const text = readFileSync(filePath, "utf8");

  const get = (key) => {
    const m = text.match(new RegExp(`${key}\\s*:\\s*["'\`]([^"'\`]*)["'\`]`));
    return m ? m[1] : "";
  };

  return {
    linkedin: get("linkedin"),
    instagram: get("instagram"),
    github: get("github") || "https://github.com/andrescultori",
    email: get("email"),
    resume: get("resume"),
  };
}
