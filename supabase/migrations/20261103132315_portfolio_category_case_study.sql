-- Adds a project category, an optional case study, and an optional Power
-- BI embed URL to portfolio_projects. Additive only — no existing column
-- or row data is touched beyond the category backfill below.
--
-- Uses "add column if not exists" and "drop + add constraint" instead of
-- the plain ALTER TABLE this repo's other migrations use, because this
-- exact schema change may already have been applied out-of-band to some
-- environment before this migration file existed (see the follow-up
-- 20261103132400_portfolio_category_fix_mapping.sql, written for exactly
-- that case). Both are safe to (re)run on a database that already has
-- these columns.
--
-- Review this file, then run it yourself (SQL editor or `supabase db
-- push`) against any environment that doesn't have these columns yet.

alter table public.portfolio_projects
  add column if not exists category text not null default 'apps';

alter table public.portfolio_projects
  drop constraint if exists portfolio_projects_category_check;
alter table public.portfolio_projects
  add constraint portfolio_projects_category_check
  check (category = any (array['data-bi', 'automation', 'apps']));

alter table public.portfolio_projects
  add column if not exists case_study jsonb;

alter table public.portfolio_projects
  drop constraint if exists portfolio_projects_case_study_check;
alter table public.portfolio_projects
  add constraint portfolio_projects_case_study_check
  check (case_study is null or jsonb_typeof(case_study) = 'object');

alter table public.portfolio_projects
  add column if not exists powerbi_url text;

alter table public.portfolio_projects
  drop constraint if exists portfolio_projects_powerbi_url_check;
alter table public.portfolio_projects
  add constraint portfolio_projects_powerbi_url_check
  check (powerbi_url is null or powerbi_url ~ '^https://app\.powerbi\.com(/|$)');

comment on column public.portfolio_projects.category is
  'Project category for the home page filter and the card/page badge: data-bi, automation, or apps. Defaults to apps.';

comment on column public.portfolio_projects.case_study is
  'Optional case-study content: {problem, data, approach, insights, impact}, each shaped {pt, en}. Null/absent means no case study — the project page section is skipped entirely. Never auto-generated; left empty until filled in from the admin panel.';

comment on column public.portfolio_projects.powerbi_url is
  'Optional Power BI report embed URL, rendered as a lazy-loaded iframe on the project page when set. Must be https:// on app.powerbi.com exactly (enforced here and in scripts/lib/validate.mjs / the admin form). Null means no embed.';

-- Backfill: category mapping decided by André (2026-11; see the PR that
-- introduced this migration for the full rationale). Any slug not listed
-- here keeps the 'apps' default set above, including apuracao-eleicoes and
-- brasileirao-tracker (personal practice projects — they stay in apps).
update public.portfolio_projects set category = 'data-bi'
  where slug in ('dashboard-financeiro', 'strava-dashboard', 'mapa-mundial-perseguicao');

update public.portfolio_projects set category = 'automation'
  where slug in ('processo-seletivo', 'js-utils-automation');
