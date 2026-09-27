-- One-off patch for projects that already ran the original schema.sql.
-- Adds QR/name-search check-in (spec §20/§23). No new RLS policy needed —
-- "event owner can update guests" (from add-guest-management.sql) already
-- covers writing these columns. Run once in the SQL Editor. (Already
-- folded into schema.sql for fresh installs.)

alter table public.guests add column if not exists checked_in boolean not null default false;
alter table public.guests add column if not exists checked_in_at timestamptz;
