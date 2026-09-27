-- One-off patch for projects that already ran the original schema.sql.
-- Adds manual guest management (spec §16/§20): a 'pending' RSVP status,
-- an organizer-assigned group, private notes, and the owner-side
-- insert/update/delete policies needed to manage a guest list directly
-- (previously guests could only be created by a guest's own public RSVP
-- submission). Run once in the SQL Editor. (Already folded into schema.sql
-- for fresh installs.)

alter table public.guests drop constraint if exists guests_rsvp_status_check;
alter table public.guests add constraint guests_rsvp_status_check
  check (rsvp_status in ('confirmed', 'declined', 'pending'));
alter table public.guests alter column rsvp_status set default 'pending';

alter table public.guests add column if not exists group_name text;
alter table public.guests add column if not exists notes text;

drop policy if exists "event owner can insert guests" on public.guests;
create policy "event owner can insert guests"
  on public.guests for insert
  with check (exists (
    select 1 from public.events e
    where e.id = guests.event_id and e.owner_id = auth.uid()
  ));

drop policy if exists "event owner can update guests" on public.guests;
create policy "event owner can update guests"
  on public.guests for update
  using (exists (
    select 1 from public.events e
    where e.id = guests.event_id and e.owner_id = auth.uid()
  ));

drop policy if exists "event owner can delete guests" on public.guests;
create policy "event owner can delete guests"
  on public.guests for delete
  using (exists (
    select 1 from public.events e
    where e.id = guests.event_id and e.owner_id = auth.uid()
  ));

create or replace function public.recalc_event_guest_stats()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  target_event_id uuid := coalesce(new.event_id, old.event_id);
begin
  update public.events e set
    guest_count = (select count(*) from public.guests g where g.event_id = target_event_id),
    confirmed_guest_count = (
      select coalesce(sum(number_of_guests), 0)
      from public.guests g
      where g.event_id = target_event_id and g.rsvp_status = 'confirmed'
    ),
    pending_guest_count = (
      select coalesce(sum(number_of_guests), 0)
      from public.guests g
      where g.event_id = target_event_id and g.rsvp_status = 'pending'
    ),
    updated_at = now()
  where e.id = target_event_id;
  return null;
end;
$$;
