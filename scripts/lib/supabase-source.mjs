/* Mirrors the mapping logic in js/projects-data.js (mapSupabaseProject) and
   the query in fetchProjects(). Replicated here — not imported — because that
   file is a browser classic script (not an ES module) and the task's scope
   explicitly keeps it untouched. Keep the two in sync by hand if the
   portfolio_projects schema changes. */
export function mapSupabaseRow(row) {
  return {
    slug: row.slug,
    title: row.title,
    cardImage: row.card_image || "",
    screenshots: row.screenshots || [],
    description: row.description || {},
    stack: row.stack || [],
    links: row.links || {},
    note: row.note || null,
    commercial: !!row.commercial,
    featured: !!row.featured,
    sortOrder: row.sort_order || 0,
    draft: !!row.draft,
  };
}

export async function fetchFromSupabase({ url, key, fetchImpl, timeoutMs = 10000 }) {
  const fetchFn = fetchImpl || fetch;
  const endpoint = `${url}/rest/v1/portfolio_projects?select=*&draft=eq.false&order=sort_order.asc`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetchFn(endpoint, {
      headers: { apikey: key },
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`Supabase respondeu HTTP ${res.status}`);
    }
    const rows = await res.json();
    if (!Array.isArray(rows)) {
      throw new Error("Resposta do Supabase não é um array");
    }
    return rows.map(mapSupabaseRow);
  } finally {
    clearTimeout(timer);
  }
}
