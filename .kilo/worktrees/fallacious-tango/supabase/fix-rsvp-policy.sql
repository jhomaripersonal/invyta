-- One-off patch for projects that already ran the original schema.sql.
-- Fixes the anonymous RSVP insert failing with "new row violates
-- row-level security policy for table guests" even for published events.
-- Run once in the SQL Editor. (Already folded into schema.sql for fresh installs.)

drop policy if exists "anyone can rsvp to a published event" on public.guests;

create or replace function public.event_is_published(target_event_id uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.events e
    where e.id = target_event_id and e.status = 'published'
  );
$$;

create policy "anyone can rsvp to a published event"
  on public.guests for insert
  with check (public.event_is_published(event_id));
