-- Corrects portfolio_projects.category for two slugs that an earlier,
-- out-of-band application of the category migration had mapped to
-- 'data-bi'. Per the final mapping decided by André: apuracao-eleicoes and
-- brasileirao-tracker are personal practice projects and stay in 'apps'.
--
-- Data-only, additive in spirit: it only ever moves these two rows toward
-- 'apps', and is a no-op on any database where they're already correct
-- (including a fresh database that applied the previous migration's
-- already-corrected backfill).

update public.portfolio_projects set category = 'apps'
  where slug in ('apuracao-eleicoes', 'brasileirao-tracker')
    and category <> 'apps';
