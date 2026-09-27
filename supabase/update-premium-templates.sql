-- Patch for a project that already ran add-free-plan-limits.sql: Wildflower
-- Vows is now a free template (the one free wedding design), so it's
-- removed from the Premium template list. Safe to run more than once.
-- Mirrors the `premium: true` entries in src/data/templates.ts; see
-- supabase/schema.sql for the canonical, fresh-install copy.
create or replace function public.template_is_premium(p_template_id text)
returns boolean
language sql
immutable
as $$
  select coalesce(p_template_id = any (array[
    'elegant-garden', 'golden-hour', 'minimalist-ivory',
    'royal-debut', 'chandelier-ball', 'boardroom-classic', 'grand-summit'
  ]), false);
$$;
