import { isValidUrl } from "./validate.mjs";
import { escapeHtml } from "./html.mjs";

/* Only these i18n keys can ever be overridden from portfolio_site_settings —
   anything else in the stored JSON is ignored. Mirrored by hand in
   js/i18n.js (browser classic script, can't import this Node module). Keep
   the two lists in sync if a new overridable text is added. */
export const SITE_SETTINGS_TEXT_KEYS = [
  "hero_role",
  "hero_bio",
  "projects_title",
  "projects_subtitle",
  "contact_title",
  "contact_subtitle",
  "footer_tagline",
];

export const SITE_SETTINGS_LINK_KEYS = ["github", "linkedin", "instagram"];

/* Keeps only whitelisted keys with a non-empty string value. An empty
   string (or a missing key) means "no override" — that's how "Restaurar
   padrão" in the admin panel works: it just clears the field. */
export function filterI18nOverrides(rawOverrides) {
  const result = { pt: {}, en: {} };
  if (!rawOverrides || typeof rawOverrides !== "object") return result;

  for (const lang of ["pt", "en"]) {
    const langOverrides = rawOverrides[lang];
    if (!langOverrides || typeof langOverrides !== "object") continue;
    for (const key of SITE_SETTINGS_TEXT_KEYS) {
      const value = langOverrides[key];
      if (typeof value === "string" && value.trim()) {
        result[lang][key] = value.trim();
      }
    }
  }
  return result;
}

/* Keeps only github/linkedin/instagram values that are non-empty https(s)
   URLs — anything else (empty, javascript:, plain text) is dropped
   silently, same contract as isValidUrl() elsewhere in this build. */
export function filterLinks(rawLinks) {
  const result = {};
  if (!rawLinks || typeof rawLinks !== "object") return result;

  for (const key of SITE_SETTINGS_LINK_KEYS) {
    const value = rawLinks[key];
    if (typeof value === "string" && isValidUrl(value)) {
      result[key] = value.trim();
    }
  }
  return result;
}

/* Builds the public Storage URL for the profile photo, with a ?v=<updatedAt>
   cache-buster so a re-upload (same path, upsert) doesn't serve a stale
   cached image. Returns "" when there's no photo configured. */
export function resolvePhotoUrl({ supabaseUrl, bucket, photoPath, updatedAt }) {
  if (!photoPath || !supabaseUrl || !bucket) return "";

  const base = String(supabaseUrl).replace(/\/+$/, "");
  const cleanPath = String(photoPath).replace(/^\/+/, "");
  const url = `${base}/storage/v1/object/public/${bucket}/${cleanPath}`;

  if (!updatedAt) return url;
  const version = encodeURIComponent(new Date(updatedAt).getTime());
  return `${url}?v=${version}`;
}

/* Replaces the text content of the first element with a matching
   data-i18n="key" attribute in a prerendered HTML string — the same
   substitution the browser's applyStaticI18n() performs at runtime, but
   baked into the static build output. rawText is HTML-escaped internally,
   so callers must always pass the raw override/default string, never
   pre-escaped markup. A no-op (returns html unchanged) when the key isn't
   found, so calling it for an untouched default is always safe. */
export function substituteDataI18n(html, key, rawText) {
  const tagRe = new RegExp(`<([a-zA-Z0-9]+)([^>]*\\bdata-i18n="${key}"[^>]*)>([\\s\\S]*?)(</\\1>)`);
  if (!tagRe.test(html)) return html;
  const escaped = escapeHtml(rawText);
  return html.replace(tagRe, (_match, tag, attrs, _oldText, closeTag) => `<${tag}${attrs}>${escaped}${closeTag}`);
}

/* Replaces the href of the first <a id="..."> found in a prerendered HTML
   string. No-op when the id isn't found or newHref isn't a valid https(s)
   URL — leaves the existing (default) href untouched either way. */
export function replaceHrefById(html, id, newHref) {
  if (!newHref || !isValidUrl(newHref)) return html;
  const tagRe = new RegExp(`<a\\b[^>]*\\bid="${id}"[^>]*>`);
  const match = html.match(tagRe);
  if (!match) return html;
  const originalTag = match[0];
  const updatedTag = originalTag.replace(/href="[^"]*"/, `href="${escapeHtml(newHref)}"`);
  return html.replace(originalTag, updatedTag);
}

/* Replaces the src of the first <img id="..."> found in a prerendered HTML
   string. No-op when the id isn't found or newSrc is empty. */
export function replaceImgSrcById(html, id, newSrc) {
  if (!newSrc) return html;
  const tagRe = new RegExp(`<img\\b[^>]*\\bid="${id}"[^>]*>`);
  const match = html.match(tagRe);
  if (!match) return html;
  const originalTag = match[0];
  const updatedTag = originalTag.replace(/src="[^"]*"/, `src="${escapeHtml(newSrc)}"`);
  return html.replace(originalTag, updatedTag);
}

/* Replaces the text content of the first element with a matching id — used
   for the contact page's GitHub item, whose visible label *is* the URL
   itself (unlike the generic "LinkedIn"/"Instagram" labels, which never
   change). No-op when the id isn't found or newText is empty. */
export function replaceTextById(html, id, newText) {
  if (!newText) return html;
  const tagRe = new RegExp(`(<[a-zA-Z0-9]+\\b[^>]*\\bid="${id}"[^>]*>)([\\s\\S]*?)(</[a-zA-Z0-9]+>)`);
  if (!tagRe.test(html)) return html;
  const escaped = escapeHtml(newText);
  return html.replace(tagRe, (_match, open, _oldText, close) => `${open}${escaped}${close}`);
}

/**
 * Fetches the single portfolio_site_settings row, Supabase-first, falling
 * back to "use the code's own defaults" (source: "default") on any failure
 * — there is no JSON-file equivalent for site settings, unlike projects.
 */
export async function fetchSiteSettings({ supabaseUrl, supabaseKey, fetchImpl, timeoutMs = 10000, source }) {
  const fetchFn = fetchImpl || fetch;

  if (source === "json") {
    return {
      settings: null,
      source: "default",
      warnings: [],
    };
  }

  if (!supabaseUrl || !supabaseKey) {
    return {
      settings: null,
      source: "default",
      warnings: ["SUPABASE_URL/SUPABASE_ANON_KEY não configurados — settings do site usam os padrões do código."],
    };
  }

  const endpoint = `${supabaseUrl}/rest/v1/portfolio_site_settings?select=*&id=eq.1&limit=1`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetchFn(endpoint, { headers: { apikey: supabaseKey }, signal: controller.signal });
    if (!res.ok) {
      throw new Error(`Supabase respondeu HTTP ${res.status}`);
    }
    const rows = await res.json();
    if (!Array.isArray(rows) || rows.length === 0) {
      return {
        settings: null,
        source: "default",
        warnings: ["Supabase não retornou a linha de site settings — usando os padrões do código."],
      };
    }

    const row = rows[0];
    return {
      settings: {
        photoPath: row.photo_path || "",
        links: filterLinks(row.links),
        i18nOverrides: filterI18nOverrides(row.i18n_overrides),
        updatedAt: row.updated_at || null,
      },
      source: "supabase",
      warnings: [],
    };
  } catch (err) {
    const reason = err && err.name === "AbortError" ? "timeout" : err.message;
    return {
      settings: null,
      source: "default",
      warnings: [`Supabase inacessível para site settings (${reason}) — usando os padrões do código.`],
    };
  } finally {
    clearTimeout(timer);
  }
}
