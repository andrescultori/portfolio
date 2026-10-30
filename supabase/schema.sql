-- Schema for the portfolio's content/admin backend, deployed to the shared
-- Supabase project "andrescultori" (ref rbtcgurgjoounqwokygj), which also
-- hosts other apps (e.g. lgnd-checklist). Every object here is namespaced
-- with a "portfolio_"/"hook_restrict_portfolio_" prefix so it never collides
-- with another app's tables, functions or policies on the same project.
--
-- This file is a reference snapshot of what is deployed — it documents the
-- live schema, it is not run automatically. Applied via the Supabase MCP
-- tools (apply_migration / execute_sql) during setup.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.portfolio_admins (
  github_username text primary key
);

comment on table public.portfolio_admins is
  'Allowlist of GitHub usernames permitted to edit the portfolio content.';

insert into public.portfolio_admins (github_username) values ('andrescultori');

create table public.portfolio_projects (
  slug text primary key,
  title text not null,
  card_image text not null default '',
  screenshots jsonb not null default '[]'::jsonb,
  description jsonb not null default '{}'::jsonb,
  stack jsonb not null default '[]'::jsonb,
  links jsonb not null default '{}'::jsonb,
  note jsonb,
  commercial boolean not null default false,
  featured boolean not null default false,
  sort_order integer not null default 0,
  draft boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.portfolio_projects is
  'Project entries shown on andrescultori.github.io/portfolio, editable via the admin panel.';

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
-- Admin checks never read Supabase's user_metadata (it is editable by the
-- signed-in user themselves via the client API — unsafe for authorization).
-- is_portfolio_admin() instead reads auth.identities, which is populated
-- only by the OAuth provider at sign-in and cannot be altered by the client.

create or replace function public.is_portfolio_admin()
returns boolean
language sql
security definer
set search_path = public, auth
stable
as $$
  select exists (
    select 1
    from auth.identities i
    join public.portfolio_admins a
      on a.github_username = (i.identity_data ->> 'user_name')
    where i.user_id = auth.uid()
      and i.provider = 'github'
  );
$$;

revoke all on function public.is_portfolio_admin() from public;
revoke execute on function public.is_portfolio_admin() from anon;
grant execute on function public.is_portfolio_admin() to authenticated;

alter table public.portfolio_admins enable row level security;

create policy "portfolio_admins_select_authenticated"
  on public.portfolio_admins for select
  to authenticated
  using (true);

alter table public.portfolio_projects enable row level security;

create policy "portfolio_projects_select_public"
  on public.portfolio_projects for select
  using (true);

create policy "portfolio_projects_insert_admins"
  on public.portfolio_projects for insert
  to authenticated
  with check (public.is_portfolio_admin());

create policy "portfolio_projects_update_admins"
  on public.portfolio_projects for update
  to authenticated
  using (public.is_portfolio_admin())
  with check (public.is_portfolio_admin());

create policy "portfolio_projects_delete_admins"
  on public.portfolio_projects for delete
  to authenticated
  using (public.is_portfolio_admin());

-- updated_at trigger

create or replace function public.portfolio_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger portfolio_projects_set_updated_at
before update on public.portfolio_projects
for each row execute function public.portfolio_set_updated_at();

-- ---------------------------------------------------------------------------
-- Site settings: single-row overrides editable from the admin's "Site" tab
-- ---------------------------------------------------------------------------
-- Added by supabase/migrations/20261014124242_site_settings.sql — same RLS
-- shape as portfolio_projects above (public select, admin-only writes).

create table public.portfolio_site_settings (
  id integer primary key default 1,
  photo_path text,
  links jsonb not null default '{}'::jsonb,
  i18n_overrides jsonb not null default '{}'::jsonb,
  metrics jsonb not null default '[]'::jsonb,
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

comment on column public.portfolio_site_settings.metrics is
  'Optional override for the home page''s metrics strip (up to 6 items): [{"value": integer, "prefix": text, "suffix": text, "label": {"pt": text, "en": text}, "visible": boolean}]. An empty array (the default) or missing/invalid data means "no override" — every reader (js/motion.js, scripts/build.mjs) falls back to the 4 built-in defaults.';

insert into public.portfolio_site_settings (id) values (1)
on conflict (id) do nothing;

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

create trigger portfolio_site_settings_set_updated_at
before update on public.portfolio_site_settings
for each row execute function public.portfolio_set_updated_at();

-- No new Storage policies: the profile photo is uploaded to
-- "site/profile.<ext>" inside the existing "portfolio-images" bucket (see
-- Storage section below), which already allows admin insert/update/delete
-- and public select on the whole bucket — no path-prefix scoping exists
-- today, so nothing new is needed.

-- ---------------------------------------------------------------------------
-- Storage: image uploads from the admin panel (cardImage + screenshots)
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('portfolio-images', 'portfolio-images', true)
on conflict (id) do nothing;

create policy "portfolio_images_select_public"
  on storage.objects for select
  using (bucket_id = 'portfolio-images');

create policy "portfolio_images_insert_admins"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'portfolio-images' and public.is_portfolio_admin());

create policy "portfolio_images_update_admins"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'portfolio-images' and public.is_portfolio_admin());

create policy "portfolio_images_delete_admins"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'portfolio-images' and public.is_portfolio_admin());

-- ---------------------------------------------------------------------------
-- Auth Hook: block sign-in entirely for any non-admin GitHub account
-- ---------------------------------------------------------------------------
-- RLS above only stops a non-admin from WRITING. This hook stops a
-- non-admin from ever getting a session in the first place: Supabase Auth
-- calls it right before inserting a new auth.users row, and a returned
-- `error` rejects the sign-up/sign-in outright (GitHub OAuth App has no
-- built-in per-user allowlist, so this is the enforcement point).
--
-- Scoped to provider = 'github' only, so Google/email sign-ins used by
-- other apps on this same shared Supabase project are never touched.
--
-- IMPORTANT — this function existing is not enough on its own. It must
-- also be wired up as the "Before User Created" Auth Hook in the Supabase
-- dashboard (Authentication → Hooks → Before User Created → Postgres
-- function → hook_restrict_portfolio_admin_signup). That toggle lives in
-- project config, not in the database, so it cannot be scripted here.

create or replace function public.hook_restrict_portfolio_admin_signup(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  provider text;
  gh_username text;
  is_admin boolean;
begin
  provider := event->'user'->'app_metadata'->>'provider';

  if provider is distinct from 'github' then
    return '{}'::jsonb;
  end if;

  gh_username := event->'user'->'user_metadata'->>'user_name';

  select exists (
    select 1 from public.portfolio_admins where github_username = gh_username
  ) into is_admin;

  if not is_admin then
    return jsonb_build_object(
      'error', jsonb_build_object(
        'http_code', 403,
        'message', 'Esta conta GitHub não tem permissão de acesso a este painel.'
      )
    );
  end if;

  return '{}'::jsonb;
end;
$$;

grant execute on function public.hook_restrict_portfolio_admin_signup to supabase_auth_admin;
revoke execute on function public.hook_restrict_portfolio_admin_signup from authenticated, anon, public;
