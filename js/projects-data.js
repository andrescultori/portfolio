/* Shared read access to the project list for the public pages.
   Reads live from Supabase (portfolio_projects); falls back to the last
   static snapshot in data/projects.json if Supabase can't be reached. */

function mapSupabaseProject(row) {
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

async function fetchProjects() {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/portfolio_projects?select=*&draft=eq.false&order=sort_order.asc`,
      { headers: { apikey: SUPABASE_PUBLISHABLE_KEY }, cache: "no-store" }
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const rows = await res.json();
    return rows.map(mapSupabaseProject);
  } catch (err) {
    const res = await fetch("data/projects.json", { cache: "no-store" });
    const data = await res.json();
    return data.filter((p) => !p.draft);
  }
}
