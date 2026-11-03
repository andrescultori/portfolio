-- Task priority for the project manager (already applied to the shared project).
alter table public.pm_tasks
  add column if not exists priority text not null default 'normal'
  check (priority in ('normal', 'high', 'urgent'));
