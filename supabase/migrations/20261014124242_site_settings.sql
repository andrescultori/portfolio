-- Adds a single-row settings table for text/photo/social-link overrides
-- editable from the admin panel's new "Site" section. Follows exactly the
-- same RLS pattern already in place for portfolio_projects: public select,
-- admin-only insert/update/delete via public.is_portfolio_admin().
--
-- NOT APPLIED AUTOMATICALLY. Review this file, then run it yourself (SQL
-- editor or `supabase db push` against the project), the same way every
-- other migration in supabase/schema.sql was applied.

create table public.portfolio_site_settings (
  id integer primary key default 1,
  photo_path text,
  links jsonb not null default '{}'::jsonb,
  i18n_overrides jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint portfolio_site_settings_single_row check (id = 1)
);

comment on table public.portfolio_site_settings is
  'Single-row (id=1) overrides for the public site: profile photo, social links, and whitelisted i18n text overrides. Editable via the admin panel''s "Site" section.';

comment on column public.portfolio_site_settings.photo_path is
  'Object path inside the portfolio-images bucket, e.g. "site/profile.jpg". Empty/null means no custom photo — the site falls back to its default behavior.';

comment on column public.portfolio_site_settings.links is
  'Optional overrides for {github, linkedin, instagram}. Only non-empty https:// URLs are honored by readers; anything else is treated as "not set" and falls back to js/social.js''s SOCIAL_LINKS.';

comment on column public.portfolio_site_settings.i18n_overrides is
  'Optional overrides shaped as {"pt": {key: text}, "en": {key: text}}. Only keys in the code-side whitelist (hero_role, hero_bio, projects_title, projects_subtitle, contact_title, contact_subtitle, footer_tagline) are ever read — any other key is ignored by every consumer (js/i18n.js, scripts/build.mjs).';

-- Seed the single row so every UPDATE from the admin panel (which never
-- INSERTs) has something to target.
insert into public.portfolio_site_settings (id) values (1)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Row Level Security — same shape as portfolio_projects
-- ---------------------------------------------------------------------------

alter table public.portfolio_site_settings enable row level security;

create policy "portfolio_site_settings_select_public"
  on public.portfolio_site_settings for select
  using (true);

create policy "portfolio_site_settings_insert_admins"
  on public.portfolio_site_settings for insert
  to authenticated
  with check (public.is_portfolio_admin());

create policy "portfolio_site_settings_update_admins"
  on public.portfolio_site_settings for update
  to authenticated
  using (public.is_portfolio_admin())
  with check (public.is_portfolio_admin());

create policy "portfolio_site_settings_delete_admins"
  on public.portfolio_site_settings for delete
  to authenticated
  using (public.is_portfolio_admin());

-- Reuses the existing generic trigger function (already created for
-- portfolio_projects) — no new function needed.
create trigger portfolio_site_settings_set_updated_at
before update on public.portfolio_site_settings
for each row execute function public.portfolio_set_updated_at();

-- No new Storage policies: the profile photo is uploaded to
-- "site/profile.<ext>" inside the existing "portfolio-images" bucket, which
-- already allows admin insert/update/delete and public select on the whole
-- bucket (see supabase/schema.sql's Storage section) — no path-prefix
-- scoping exists today, so nothing new is needed here.
