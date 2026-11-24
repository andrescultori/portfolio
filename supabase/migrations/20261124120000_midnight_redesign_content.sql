-- Content updates for the Midnight/Electric public-site redesign, mirroring
-- the same changes made to data/projects.json (the build's offline
-- fallback) so production (which reads portfolio_projects first) ends up
-- with the same content once this is applied.
--
-- Not applied automatically — André reviews and runs this himself (SQL
-- editor or `supabase db push`). Idempotent: safe to run more than once.
--
-- Changes:
--   1. Featured flags: only dashboard-financeiro, processo-seletivo,
--      orcamentos-felipe-blaya and agape-multimidia are featured on the
--      new home page's "Selected projects" rows (up to 4). Every project
--      that was featured before and isn't in that list is un-featured —
--      nothing else about those rows changes.
--   2. processo-seletivo / js-utils-automation: scenario count corrected
--      from 14 to 16 (PT and EN), and processo-seletivo's "~80%" now
--      explicitly refers to Make.com operations, not "manual operations".
--   3. dashboard-financeiro: stack gains "Microsoft Auth"; description notes
--      that production authenticates via Microsoft sign-in while this
--      public version stays on fictional demo data.
--   4. Two new projects: orcamentos-felipe-blaya and agape-multimidia
--      (upserted — safe to re-run).

-- 1. Featured flags -----------------------------------------------------

update public.portfolio_projects set featured = false
  where slug in ('lgnd-checklist', 'strava-dashboard', 'timoteo-app', 'apuracao-eleicoes', 'portal-aluno');

update public.portfolio_projects set featured = true
  where slug in ('dashboard-financeiro', 'processo-seletivo');

-- 2. processo-seletivo / js-utils-automation: 14 -> 16 scenarios --------

update public.portfolio_projects set description = jsonb_build_object(
  'pt', 'Sistema com 16 cenários no Make.com automatizando 100% do processo seletivo institucional, do primeiro contato à matrícula. Redução de ~80% nas operações do Make.com após otimização.',
  'en', 'A system of 16 Make.com scenarios automating 100% of the institution''s admissions process, from first contact to enrollment. About 80% fewer Make.com operations after optimization.'
) where slug = 'processo-seletivo';

update public.portfolio_projects set description = jsonb_build_object(
  'pt', 'Biblioteca de funções JavaScript utilitárias, sem dependências, extraídas e generalizadas de uma automação real em produção no Make.com (processo institucional de 16 cenários, 10+ ferramentas integradas), cada uma com teste próprio.',
  'en', 'Dependency-free JavaScript utility library, extracted and generalized from a real production Make.com automation (a 16-scenario institutional process integrating 10+ tools), each function with its own test.'
) where slug = 'js-utils-automation';

-- 3. dashboard-financeiro: Microsoft Auth + updated description ---------

update public.portfolio_projects set
  description = jsonb_build_object(
    'pt', 'Dashboard financeiro interativo (HTML/JS puro, sem framework) com pipeline de automação ponta a ponta via n8n — do ERP até a publicação, sem intervenção manual. Em produção, o acesso é autenticado com login Microsoft; esta versão pública usa dados fictícios para demonstração.',
    'en', 'Interactive financial dashboard (vanilla HTML/JS, zero build step) with an end-to-end automation pipeline via n8n — from source ERP to auto-deploy, no manual steps. In production, access is authenticated with Microsoft sign-in; this public version uses fictional demo data.'
  ),
  stack = '["Excel", "n8n", "SharePoint", "Netlify", "JavaScript", "HTML", "Microsoft Auth"]'::jsonb
where slug = 'dashboard-financeiro';

-- 4. New projects (upsert) ----------------------------------------------

insert into public.portfolio_projects
  (slug, title, card_image, screenshots, description, stack, links, note, commercial, featured, sort_order, draft, category)
values
  (
    'orcamentos-felipe-blaya',
    'Orçamentos — Felipe Blaya',
    '',
    '[]'::jsonb,
    jsonb_build_object(
      'pt', 'Antes, os orçamentos eram enviados manualmente pelo WhatsApp, sem nenhum rastreamento. Agora são criados, enviados e rastreados dentro de uma aplicação web própria, com envio de e-mail e armazenamento de arquivos integrados.',
      'en', 'Before, quotes were sent by hand over WhatsApp, with no tracking at all. Now they''re created, sent and tracked inside a dedicated web app, with built-in email delivery and file storage.'
    ),
    '["Supabase", "Resend", "Google Drive API", "GitHub Pages"]'::jsonb,
    '{}'::jsonb,
    jsonb_build_object(
      'pt', 'Sistema real para um cliente — sem link de demonstração pública.',
      'en', 'Real system built for a client — no public demo link.'
    ),
    true, true, 12, false, 'apps'
  ),
  (
    'agape-multimidia',
    'Ágape Multimídia — Landing Pages',
    '',
    '[]'::jsonb,
    jsonb_build_object(
      'pt', 'O site antigo da Ágape Multimídia, em WordPress, estava desatualizado e difícil de editar. Os serviços agora têm landing pages novas e identidade visual redesenhada, com custos reduzidos ao sair do WordPress.',
      'en', 'Ágape Multimídia''s old WordPress site was outdated and slow to edit. Its services now have new landing pages and a redesigned visual identity, with lower running costs after moving off WordPress.'
    ),
    '[]'::jsonb,
    '{}'::jsonb,
    null,
    true, true, 13, false, 'apps'
  )
on conflict (slug) do update set
  title = excluded.title,
  description = excluded.description,
  stack = excluded.stack,
  links = excluded.links,
  note = excluded.note,
  commercial = excluded.commercial,
  featured = excluded.featured,
  sort_order = excluded.sort_order,
  category = excluded.category;
