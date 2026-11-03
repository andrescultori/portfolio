-- Applied 2026-11-03 via Supabase MCP (migration "pm_project_manager").
-- Private project manager backing pm.html. Admin-only RLS on every pm_* table.

-- ---------------------------------------------------------------------------
-- Clients (who a project is for)
-- ---------------------------------------------------------------------------
create table public.pm_clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null default 'client'
    check (kind in ('client', 'employer', 'personal')),
  contact jsonb not null default '{}'::jsonb,   -- {name, email, phone, whatsapp}
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Projects
-- ---------------------------------------------------------------------------
create table public.pm_projects (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  client_id uuid references public.pm_clients(id) on delete set null,
  ownership text not null default 'personal'
    check (ownership in ('personal', 'client', 'employer')),
  status text not null default 'planned'
    check (status in ('idea', 'planned', 'active', 'paused', 'done', 'archived')),
  priority smallint not null default 3 check (priority between 1 and 5),  -- 1 = highest
  summary text,
  stack text[] not null default '{}',
  links jsonb not null default '{}'::jsonb,
    -- {repo, live, admin, claude_project, supabase, docs, drive}
  portfolio_slug text references public.portfolio_projects(slug)
    on update cascade on delete set null,     -- link to the public portfolio entry
  start_date date,
  due_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index pm_projects_client_idx on public.pm_projects (client_id);
create index pm_projects_status_idx on public.pm_projects (status);

-- ---------------------------------------------------------------------------
-- Roadmap: milestones per project
-- ---------------------------------------------------------------------------
create table public.pm_milestones (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.pm_projects(id) on delete cascade,
  title text not null,
  description text,
  status text not null default 'planned'
    check (status in ('planned', 'active', 'done', 'dropped')),
  target_date date,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index pm_milestones_project_idx on public.pm_milestones (project_id, sort_order);

-- ---------------------------------------------------------------------------
-- Checklist: tasks, optionally grouped under a milestone
-- ---------------------------------------------------------------------------
create table public.pm_tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.pm_projects(id) on delete cascade,
  milestone_id uuid references public.pm_milestones(id) on delete set null,
  title text not null,
  done boolean not null default false,
  done_at timestamptz,
  due_date date,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index pm_tasks_project_idx on public.pm_tasks (project_id, done, sort_order);
create index pm_tasks_milestone_idx on public.pm_tasks (milestone_id);

-- ---------------------------------------------------------------------------
-- Key info + decision log
-- ---------------------------------------------------------------------------
create table public.pm_notes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.pm_projects(id) on delete cascade,
  kind text not null default 'log'
    check (kind in ('info', 'decision', 'log')),
  body text not null,
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index pm_notes_project_idx on public.pm_notes (project_id, created_at desc);

-- ---------------------------------------------------------------------------
-- updated_at + done_at triggers
-- ---------------------------------------------------------------------------
create or replace function public.pm_set_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.pm_set_done_at()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.done and (tg_op = 'INSERT' or not old.done) then
    new.done_at = now();
  elsif not new.done then
    new.done_at = null;
  end if;
  return new;
end;
$$;

create trigger pm_clients_updated    before update on public.pm_clients    for each row execute function public.pm_set_updated_at();
create trigger pm_projects_updated   before update on public.pm_projects   for each row execute function public.pm_set_updated_at();
create trigger pm_milestones_updated before update on public.pm_milestones for each row execute function public.pm_set_updated_at();
create trigger pm_tasks_updated      before update on public.pm_tasks      for each row execute function public.pm_set_updated_at();
create trigger pm_notes_updated      before update on public.pm_notes      for each row execute function public.pm_set_updated_at();
create trigger pm_tasks_done_at      before insert or update on public.pm_tasks for each row execute function public.pm_set_done_at();

-- ---------------------------------------------------------------------------
-- Row Level Security — admin only, every operation
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['pm_clients','pm_projects','pm_milestones','pm_tasks','pm_notes'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy %I on public.%I for all to authenticated
         using (public.is_portfolio_admin()) with check (public.is_portfolio_admin())',
      t || '_admin_all', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Convenience view for the dashboard (progress per project)
-- security_invoker = true so the view respects the RLS above
-- ---------------------------------------------------------------------------
create view public.pm_project_overview with (security_invoker = true) as
select
  p.id, p.slug, p.name, p.ownership, p.status, p.priority, p.due_date,
  c.name as client_name,
  count(t.id)                       as tasks_total,
  count(t.id) filter (where t.done) as tasks_done,
  (select m.title from public.pm_milestones m
    where m.project_id = p.id and m.status in ('planned','active')
    order by m.sort_order limit 1)  as next_milestone,
  p.updated_at
from public.pm_projects p
left join public.pm_clients c on c.id = p.client_id
left join public.pm_tasks t on t.project_id = p.id
group by p.id, c.name;
