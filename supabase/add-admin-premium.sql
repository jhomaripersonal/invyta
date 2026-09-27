-- Patch for an already-created project: admins get every Premium/Pro
-- feature on all of their events, without paying. Run once in the
-- Supabase dashboard's SQL Editor, after add-admin.sql (needs
-- profiles.is_admin). See supabase/schema.sql for the canonical copy.
--
-- How: an admin's account counts as Pro when working out each event's
-- effective plan — the same way an account-level Event Planner plan
-- covers all its events. Every existing check (guest cap, watermark,
-- templates, layouts, styles, check-in, analytics, personalized links)
-- already reads the effective plan, so nothing else changes. Removing
-- someone's admin flag drops their events back to what was paid for.

create or replace function public.effective_plan(p_owner_id uuid, p_event_plan text)
returns text
language sql
stable
security definer set search_path = public
as $$
  select public.plan_max(
    public.plan_max(coalesce(p.plan, 'free'), coalesce(p_event_plan, 'free')),
    case when coalesce(p.is_admin, false) then 'pro' else 'free' end
  )
  from (select 1) one
  left join public.profiles p on p.id = p_owner_id;
$$;

revoke execute on function public.effective_plan(uuid, text) from public, anon, authenticated;

-- Recompute a user's events when their account plan *or* admin flag changes.
create or replace function public.sync_events_owner_plan()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.plan is distinct from old.plan or new.is_admin is distinct from old.is_admin then
    -- A no-op write is enough: set_event_owner_plan recomputes each row.
    update public.events set owner_plan = owner_plan where owner_id = new.id;
  end if;
  return new;
end;
$$;

-- Apply to admins that already exist.
update public.events e set owner_plan = owner_plan
from public.profiles p
where p.id = e.owner_id and p.is_admin;
