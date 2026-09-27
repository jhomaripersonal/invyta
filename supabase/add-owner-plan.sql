-- Patch for an already-created project: adds the Free-plan watermark support.
-- Denormalizes profiles.plan onto events.owner_plan so the public invitation
-- page (anonymous guests) can tell whether to show the watermark without
-- needing to read the organizer's profile row directly (RLS on `profiles`
-- deliberately only allows "read own profile"). Run once in the Supabase
-- dashboard's SQL Editor. See supabase/schema.sql for the canonical,
-- fresh-install copy of this same block.

alter table public.events
  add column if not exists owner_plan text not null default 'free'
    check (owner_plan in ('free', 'premium', 'pro', 'event_planner'));

update public.events e set owner_plan = p.plan
from public.profiles p
where p.id = e.owner_id and e.owner_plan is distinct from p.plan;

create or replace function public.set_event_owner_plan()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  select plan into new.owner_plan from public.profiles where id = new.owner_id;
  return new;
end;
$$;

drop trigger if exists events_set_owner_plan on public.events;
create trigger events_set_owner_plan
  before insert on public.events
  for each row execute procedure public.set_event_owner_plan();

create or replace function public.sync_events_owner_plan()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.plan is distinct from old.plan then
    update public.events set owner_plan = new.plan where owner_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_sync_events_owner_plan on public.profiles;
create trigger profiles_sync_events_owner_plan
  after update on public.profiles
  for each row execute procedure public.sync_events_owner_plan();
