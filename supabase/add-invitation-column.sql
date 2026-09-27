-- One-off patch for projects that already ran the original schema.sql.
-- Adds the Invitation Builder's content column. Run once in the SQL Editor.
-- (Already folded into schema.sql for fresh installs.)

alter table public.events
  add column if not exists invitation jsonb not null default '{}'::jsonb;
