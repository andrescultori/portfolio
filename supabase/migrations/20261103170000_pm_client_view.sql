-- Reference snapshot — already applied directly to the live Supabase project
-- (rbtcgurgjoounqwokygj) via MCP on 2026-11-03. This file documents what's
-- live; it is not run automatically and must not be re-applied.
--
-- Adds a read-only "client view" to the private project manager (pm.html):
-- a project can be shared via a random token (/follow/?t=<token>), which
-- the public.pm_client_view() function resolves into a filtered JSON
-- snapshot — only rows explicitly marked visible_to_client are exposed,
-- and only through this one SECURITY DEFINER function. Every pm_* table
-- keeps its existing admin-only RLS (see pm_project_manager migration) —
-- this migration adds columns and one function, it does not touch RLS.

-- ---------------------------------------------------------------------------
-- pm_projects: client-view toggle, language, share token
-- ---------------------------------------------------------------------------
alter table public.pm_projects
  add column share_token text unique,
  add column client_view_enabled boolean not null default false,
  add column client_lang text not null default 'pt'
    check (client_lang in ('pt', 'en'));

comment on column public.pm_projects.share_token is
  'Random 64-char hex token for the public, unauthenticated /follow/?t=<token> client view. Generated automatically (see pm_ensure_share_token below) the first time client_view_enabled is turned on; kept across disable/re-enable so the link stays stable. Set to null (while enabled) to rotate it.';
comment on column public.pm_projects.client_view_enabled is
  'Whether /follow/?t=<share_token> currently resolves for this project. Disabling does not clear share_token, so re-enabling restores the same link.';
comment on column public.pm_projects.client_lang is
  'Language the client-view page renders in for this project (pt or en).';

-- Auto-generates share_token the first time client_view_enabled flips to
-- true with no token yet — the admin UI never writes share_token directly
-- except to null it out (rotate).
create or replace function public.pm_ensure_share_token()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.client_view_enabled and new.share_token is null then
    new.share_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  end if;
  return new;
end;
$$;

create trigger pm_projects_share_token
before insert or update on public.pm_projects
for each row execute function public.pm_ensure_share_token();

-- ---------------------------------------------------------------------------
-- Per-row visibility + task ownership
-- ---------------------------------------------------------------------------
alter table public.pm_milestones add column visible_to_client boolean not null default false;
alter table public.pm_tasks add column visible_to_client boolean not null default false;
alter table public.pm_notes add column visible_to_client boolean not null default false;

alter table public.pm_tasks add column owner text not null default 'me'
  check (owner in ('me', 'client'));
comment on column public.pm_tasks.owner is
  'Who the next action is on: "me" (André) or "client". Drives the client view''s "Waiting on you" section (open tasks with owner = client).';

alter table public.pm_notes drop constraint pm_notes_kind_check;
alter table public.pm_notes add constraint pm_notes_kind_check
  check (kind in ('info', 'decision', 'log', 'update'));
comment on constraint pm_notes_kind_check on public.pm_notes is
  '"update" is the new client-facing progress-update kind, shown in the client view''s Updates section when visible_to_client is also true.';

-- ---------------------------------------------------------------------------
-- public.pm_client_view(p_token): the ONLY way anon can read pm_* data
-- ---------------------------------------------------------------------------
-- Returns null for a missing/short/wrong/disabled token (never reveals
-- whether a project exists). Otherwise a filtered JSON snapshot: visible
-- tasks/milestones/notes only, grouped the way follow/js/follow.js expects.
create or replace function public.pm_client_view(p_token text)
returns jsonb
language plpgsql
stable security definer
set search_path = public
as $$
declare
  p public.pm_projects%rowtype;
  result jsonb;
begin
  if p_token is null or length(p_token) < 32 then
    return null;
  end if;

  select * into p from public.pm_projects
   where share_token = p_token and client_view_enabled;
  if not found then
    return null;
  end if;

  select jsonb_build_object(
    'project', jsonb_build_object(
      'name', p.name, 'status', p.status, 'summary', p.summary, 'lang', p.client_lang),
    'progress', (
      select jsonb_build_object('done', count(*) filter (where t.done), 'total', count(*))
      from public.pm_tasks t
      where t.project_id = p.id and t.visible_to_client),
    'milestones', coalesce((
      select jsonb_agg(jsonb_build_object(
        'title', m.title, 'description', m.description, 'status', m.status,
        'target_date', m.target_date,
        'tasks', coalesce((
          select jsonb_agg(jsonb_build_object(
            'title', t.title, 'done', t.done, 'due_date', t.due_date, 'owner', t.owner)
            order by t.sort_order, t.created_at)
          from public.pm_tasks t
          where t.milestone_id = m.id and t.visible_to_client), '[]'::jsonb))
        order by m.sort_order, m.created_at)
      from public.pm_milestones m
      where m.project_id = p.id and m.visible_to_client), '[]'::jsonb),
    'other_tasks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'title', t.title, 'done', t.done, 'due_date', t.due_date, 'owner', t.owner)
        order by t.sort_order, t.created_at)
      from public.pm_tasks t
      where t.project_id = p.id and t.visible_to_client
        and (t.milestone_id is null
             or not exists (select 1 from public.pm_milestones m2
                            where m2.id = t.milestone_id and m2.visible_to_client))), '[]'::jsonb),
    'updates', coalesce((
      select jsonb_agg(jsonb_build_object(
        'kind', n.kind, 'body', n.body, 'created_at', n.created_at)
        order by n.created_at desc)
      from public.pm_notes n
      where n.project_id = p.id and n.visible_to_client), '[]'::jsonb),
    'updated_at', (
      select max(ts) from (
        select max(t.updated_at) as ts from public.pm_tasks t
          where t.project_id = p.id and t.visible_to_client
        union all select max(m.updated_at) from public.pm_milestones m
          where m.project_id = p.id and m.visible_to_client
        union all select max(n.updated_at) from public.pm_notes n
          where n.project_id = p.id and n.visible_to_client
        union all select p.updated_at) x)
  ) into result;

  return result;
end;
$$;

-- anon (the public, unauthenticated /follow/ page) may call this function
-- and nothing else on any pm_* table — every pm_* table's RLS (see
-- pm_project_manager migration) still restricts every other access path to
-- authenticated admins. service_role is never used from client code.
grant execute on function public.pm_client_view(text) to anon, authenticated;
