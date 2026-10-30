-- Adds an editable "metrics" (KPI strip) column to portfolio_site_settings,
-- for the home page's metrics-strip section. Follows the same pattern as
-- every other column on this table: a single jsonb value, public select,
-- admin-only update via the table's existing RLS policies (no new policy
-- needed — RLS is per-row, not per-column).
--
-- NOT APPLIED AUTOMATICALLY. Review this file, then run it yourself (SQL
-- editor or `supabase db push` against the project), the same way every
-- other migration in supabase/schema.sql was applied.

alter table public.portfolio_site_settings
  add column metrics jsonb not null default '[]'::jsonb;

comment on column public.portfolio_site_settings.metrics is
  'Optional override for the home page''s metrics strip (up to 6 items): [{"value": integer, "prefix": text, "suffix": text, "label": {"pt": text, "en": text}, "visible": boolean}]. An empty array (the default) or missing/invalid data means "no override" — every reader (js/motion.js, scripts/build.mjs) falls back to the 4 built-in defaults.';
