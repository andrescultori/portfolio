import { fetchFromSupabase } from "./supabase-source.mjs";
import { loadFromJson } from "./json-source.mjs";

/**
 * Resolves the project list, Supabase-first with a JSON fallback.
 * - source === "json" forces offline mode (PRERENDER_SOURCE=json).
 * - Otherwise: try Supabase; on network error, non-2xx, invalid JSON, empty
 *   result, timeout, or missing credentials, fall back to data/projects.json.
 * Never throws for a Supabase failure — only loadFromJson's own errors
 * (invalid/missing data/projects.json) propagate, since that's the last resort.
 */
export async function getProjects({
  supabaseUrl,
  supabaseKey,
  jsonPath,
  source,
  fetchImpl,
  timeoutMs,
  log = () => {},
}) {
  const warnings = [];

  if (source === "json") {
    const projects = loadFromJson(jsonPath);
    log("Fonte de dados: data/projects.json (PRERENDER_SOURCE=json forçou modo offline)");
    return { projects, source: "json", warnings };
  }

  if (supabaseUrl && supabaseKey) {
    try {
      const rows = await fetchFromSupabase({ url: supabaseUrl, key: supabaseKey, fetchImpl, timeoutMs });
      if (rows.length > 0) {
        log(`Fonte de dados: Supabase (${rows.length} projeto[s])`);
        return { projects: rows, source: "supabase", warnings };
      }
      warnings.push("Supabase retornou 0 projetos — usando data/projects.json como fallback.");
    } catch (err) {
      const reason = err && err.name === "AbortError" ? "timeout" : err.message;
      warnings.push(`Supabase inacessível (${reason}) — usando data/projects.json como fallback.`);
    }
  } else {
    warnings.push("SUPABASE_URL/SUPABASE_ANON_KEY não configurados — usando data/projects.json.");
  }

  const projects = loadFromJson(jsonPath);
  log("Fonte de dados: data/projects.json (fallback)");
  return { projects, source: "json", warnings };
}
