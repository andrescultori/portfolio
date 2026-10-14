import { readFileSync } from "node:fs";

/* Reads js/supabase-config.js as text and extracts the two const values with a
   regex (never eval/require it — it's a browser classic script, not a module).
   Both values are public (publishable key), but env vars still take priority
   so CI/CD can override without touching the file. Never logged. */
export function loadSupabaseConfig(filePath) {
  let text = "";
  try {
    text = readFileSync(filePath, "utf8");
  } catch {
    // fall through to env-only below
  }

  const urlMatch = text.match(/SUPABASE_URL\s*=\s*["'`]([^"'`]+)["'`]/);
  const keyMatch = text.match(/SUPABASE_PUBLISHABLE_KEY\s*=\s*["'`]([^"'`]+)["'`]/);

  const url = process.env.SUPABASE_URL || (urlMatch ? urlMatch[1] : "");
  const key = process.env.SUPABASE_ANON_KEY || (keyMatch ? keyMatch[1] : "");

  return { url, key };
}
