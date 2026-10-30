/* Single, cached fetch of the portfolio_site_settings row, shared by
   js/i18n.js, js/social.js, and js/motion.js — they used to each fetch
   this same row separately (three network round-trips for one row). Must
   load before all three. Returns null (never rejects) on any failure, so
   every caller's existing "keep the defaults" fallback keeps working
   unchanged. */

let siteSettingsPromise = null;

function getSiteSettings() {
  if (siteSettingsPromise) return siteSettingsPromise;
  siteSettingsPromise = fetch(`${SUPABASE_URL}/rest/v1/portfolio_site_settings?select=*&id=eq.1&limit=1`, {
    headers: { apikey: SUPABASE_PUBLISHABLE_KEY },
    cache: "no-store",
  })
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    })
    .then((rows) => (rows && rows[0]) || null)
    .catch(() => null);
  return siteSettingsPromise;
}
