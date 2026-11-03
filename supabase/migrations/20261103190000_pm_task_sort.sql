-- Phases/tasks ordering for the project manager and the client view.
-- task_sort = 'date' (default): tasks ordered by due date, oldest first, undated last.
-- task_sort = 'manual': tasks ordered by sort_order (arrows in pm.html).
alter table public.pm_projects
  add column if not exists task_sort text not null default 'date'
  check (task_sort in ('date', 'manual'));

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
            order by (case when p.task_sort = 'date' then t.due_date end) asc nulls last, t.sort_order, t.created_at)
          from public.pm_tasks t
          where t.milestone_id = m.id and t.visible_to_client), '[]'::jsonb))
        order by m.sort_order, m.created_at)
      from public.pm_milestones m
      where m.project_id = p.id and m.visible_to_client), '[]'::jsonb),
    'other_tasks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'title', t.title, 'done', t.done, 'due_date', t.due_date, 'owner', t.owner)
        order by (case when p.task_sort = 'date' then t.due_date end) asc nulls last, t.sort_order, t.created_at)
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

grant execute on function public.pm_client_view(text) to anon, authenticated;
