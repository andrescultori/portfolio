import { readFileSync } from "node:fs";

/* Pass-through normalizer: data/projects.json already uses these exact field
   names (it's the shape main.js/project.js consume directly in the browser
   fallback path). Kept separate from mapSupabaseRow so each source's shape
   stays explicit and independently testable. */
export function mapJsonProject(entry) {
  return {
    slug: entry.slug,
    title: entry.title,
    cardImage: entry.cardImage || "",
    screenshots: entry.screenshots || [],
    description: entry.description || {},
    stack: entry.stack || [],
    links: entry.links || {},
    note: entry.note || null,
    commercial: !!entry.commercial,
    featured: !!entry.featured,
    sortOrder: entry.sortOrder || 0,
    draft: !!entry.draft,
  };
}

export function loadFromJson(filePath) {
  const text = readFileSync(filePath, "utf8");

  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new Error(`data/projects.json inválido: ${e.message}`);
  }
  if (!Array.isArray(data)) {
    throw new Error("data/projects.json deve conter um array de projetos");
  }

  return data.map(mapJsonProject);
}
