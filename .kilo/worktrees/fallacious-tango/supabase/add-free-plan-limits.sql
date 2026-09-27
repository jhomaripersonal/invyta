-- Patch for an already-created project: enforces the Free plan's limits
-- server-side and makes the plan tamper-proof. Run once in the Supabase
-- dashboard's SQL Editor. See supabase/schema.sql for the canonical,
-- fresh-install copy of these same blocks.

-- ─── plan is server-owned ──────────────────────────────────────────────
-- Users keep editing their own display name, but not `plan`.
revoke update on public.profiles from anon, authenticated;
grant update (name) on public.profiles to authenticated;

-- Recompute events.owner_plan on every update too, not just insert, so an
-- owner can't write their own owner_plan to hide the Free watermark.
drop trigger if exists events_set_owner_plan on public.events;
create trigger events_set_owner_plan
  before insert or update on public.events
  for each row execute procedure public.set_event_owner_plan();

-- Repair any owner_plan that was already changed by hand.
update public.events e set owner_plan = p.plan
from public.profiles p
where p.id = e.owner_id and e.owner_plan is distinct from p.plan;

-- ─── plan rules ─────────────────────────────────────────────────────────
create or replace function public.plan_at_least(p_plan text, p_min text)
returns boolean
language sql
immutable
as $$
  select array_position(array['free', 'premium', 'pro', 'event_planner'], coalesce(p_plan, 'free'))
      >= array_position(array['free', 'premium', 'pro', 'event_planner'], p_min);
$$;

create or replace function public.event_owner_plan(p_event_id uuid)
returns text
language sql
stable
security definer set search_path = public
as $$
  select coalesce(p.plan, 'free')
  from public.events e
  left join public.profiles p on p.id = e.owner_id
  where e.id = p_event_id;
$$;

revoke execute on function public.event_owner_plan(uuid) from public, anon, authenticated;

-- ─── premium templates ──────────────────────────────────────────────────
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

create or replace function public.enforce_premium_template()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_plan text;
begin
  if not public.template_is_premium(new.template_id)
     or (tg_op = 'UPDATE' and new.template_id is not distinct from old.template_id) then
    return new;
  end if;
  select plan into v_plan from public.profiles where id = new.owner_id;
  if not public.plan_at_least(v_plan, 'premium') then
    raise exception 'Premium templates require the Premium plan.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists events_enforce_premium_template on public.events;
create trigger events_enforce_premium_template
  before insert or update of template_id on public.events
  for each row execute procedure public.enforce_premium_template();

-- ─── guest-list cap ─────────────────────────────────────────────────────
create or replace function public.guest_limit(p_plan text)
returns int
language sql
immutable
as $$
  select case coalesce(p_plan, 'free') when 'free' then 50 else null end;
$$;

create or replace function public.enforce_guest_limit()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_limit int;
begin
  v_limit := public.guest_limit(public.event_owner_plan(new.event_id));
  if v_limit is null then
    return new;
  end if;
  perform 1 from public.events where id = new.event_id for update;
  if (select count(*) from public.guests where event_id = new.event_id) >= v_limit then
    raise exception 'This event has reached its guest limit of %.', v_limit
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists guests_enforce_guest_limit on public.guests;
create trigger guests_enforce_guest_limit
  before insert on public.guests
  for each row execute procedure public.enforce_guest_limit();

-- ─── QR check-in (Premium) ──────────────────────────────────────────────
create or replace function public.enforce_checkin_plan()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.checked_in
     and (tg_op = 'INSERT' or not old.checked_in)
     and not public.plan_at_least(public.event_owner_plan(new.event_id), 'premium') then
    raise exception 'QR check-in requires the Premium plan.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists guests_enforce_checkin_plan on public.guests;
create trigger guests_enforce_checkin_plan
  before insert or update of checked_in on public.guests
  for each row execute procedure public.enforce_checkin_plan();

-- ─── personalized links (Pro) ───────────────────────────────────────────
create or replace function public.get_guest_public(p_guest_id uuid)
returns table (
  id uuid,
  event_id uuid,
  name text,
  rsvp_status text,
  number_of_guests int,
  meal_preference text,
  message text,
  checked_in boolean
)
language sql
security definer set search_path = public
stable
as $$
  select g.id, g.event_id, g.name, g.rsvp_status, g.number_of_guests, g.meal_preference, g.message, g.checked_in
  from public.guests g
  join public.events e on e.id = g.event_id
  where g.id = p_guest_id and e.status = 'published'
    and public.plan_at_least(e.owner_plan, 'pro');
$$;

create or replace function public.update_guest_rsvp(
  p_guest_id uuid,
  p_name text,
  p_attending boolean,
  p_number_of_guests int,
  p_meal_preference text,
  p_message text
)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  update public.guests g set
    name = p_name,
    rsvp_status = case when p_attending then 'confirmed' else 'declined' end,
    number_of_guests = case when p_attending then greatest(1, p_number_of_guests) else 0 end,
    meal_preference = p_meal_preference,
    message = p_message,
    submitted_at = now()
  from public.events e
  where g.id = p_guest_id and e.id = g.event_id and e.status = 'published'
    and public.plan_at_least(e.owner_plan, 'pro');
end;
$$;
