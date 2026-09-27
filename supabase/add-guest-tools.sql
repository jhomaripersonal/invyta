-- Patch for an already-created project: RSVP deadline, custom RSVP
-- questions, per-guest party-size limits and reminder tracking. Run once in
-- the Supabase dashboard's SQL Editor, after add-rsvp-protection.sql. See
-- supabase/schema.sql for the canonical, fresh-install copy.

-- ─── guest columns ─────────────────────────────────────────────────────
-- answers: the guest's replies to the invitation's custom RSVP questions,
--   { "<question id>": "<answer>" } (Pro).
-- max_party_size: how many people this guest may RSVP for, set by the
--   host; enforced on their personalized link (Pro). Null = no limit
--   beyond the usual 20.
-- reminded_at: when the host last nudged this guest to reply.
alter table public.guests add column if not exists answers jsonb not null default '{}'::jsonb;
alter table public.guests add column if not exists max_party_size int check (max_party_size between 1 and 20);
alter table public.guests add column if not exists reminded_at timestamptz;

alter table public.guests drop constraint if exists guests_answers_size;
alter table public.guests add constraint guests_answers_size check (
  jsonb_typeof(answers) = 'object' and octet_length(answers::text) <= 5000
) not valid;

-- ─── RSVP deadline ─────────────────────────────────────────────────────
-- The RSVP section's optional `deadline` ("YYYY-MM-DD"). RSVPs close at the
-- end of that day, Philippine time. Anything that isn't a real date counts
-- as no deadline, so a bad value can never block every RSVP.
create or replace function public.rsvp_deadline(p_invitation jsonb)
returns date
language plpgsql
immutable
as $$
declare
  v_raw text;
begin
  select s -> 'content' ->> 'deadline' into v_raw
  from jsonb_array_elements(
    case when jsonb_typeof(p_invitation -> 'sections') = 'array' then p_invitation -> 'sections' else '[]'::jsonb end
  ) s
  where s ->> 'type' = 'rsvp'
  limit 1;
  if v_raw is null or v_raw !~ '^\d{4}-\d{2}-\d{2}$' then
    return null;
  end if;
  return v_raw::date;
exception when others then
  return null;
end;
$$;

create or replace function public.rsvp_closed(p_invitation jsonb)
returns boolean
language sql
stable
as $$
  select coalesce((now() at time zone 'Asia/Manila')::date > public.rsvp_deadline(p_invitation), false);
$$;

-- ─── custom RSVP questions (Pro) ───────────────────────────────────────
-- An enabled RSVP section with at least one question that has a label.
create or replace function public.invitation_uses_rsvp_questions(p_invitation jsonb)
returns boolean
language sql
immutable
as $$
  select exists (
    select 1
    from jsonb_array_elements(
      case when jsonb_typeof(p_invitation -> 'sections') = 'array' then p_invitation -> 'sections' else '[]'::jsonb end
    ) s
    where s ->> 'type' = 'rsvp'
      and coalesce((s ->> 'enabled')::boolean, false)
      and exists (
        select 1
        from jsonb_array_elements(
          case when jsonb_typeof(s -> 'content' -> 'questions') = 'array' then s -> 'content' -> 'questions' else '[]'::jsonb end
        ) q
        where coalesce(trim(q ->> 'label'), '') <> ''
      )
  );
$$;

-- Like the Video rule: only *starting* to use questions needs Pro, so an
-- event that already has them stays editable if its plan later drops.
create or replace function public.enforce_rsvp_questions_plan()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.invitation_uses_rsvp_questions(new.invitation)
     or (tg_op = 'UPDATE' and public.invitation_uses_rsvp_questions(old.invitation)) then
    return new;
  end if;
  if not public.plan_at_least(public.effective_plan(new.owner_id, new.plan), 'pro') then
    raise exception 'Custom RSVP questions require the Pro plan.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists events_enforce_rsvp_questions_plan on public.events;
create trigger events_enforce_rsvp_questions_plan
  before insert or update of invitation on public.events
  for each row execute procedure public.enforce_rsvp_questions_plan();

-- ─── public RSVPs ──────────────────────────────────────────────────────
-- Same limits as add-rsvp-protection.sql, plus: closed after the RSVP
-- deadline, answers kept only on Pro events, and host-only fields
-- (party-size limit, reminder time) never taken from a public RSVP.
create or replace function public.protect_public_rsvp()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_owner uuid;
  v_invitation jsonb;
  v_plan text;
  v_minute int;
  v_hour int;
  v_total int;
begin
  if coalesce(auth.role(), '') not in ('anon', 'authenticated') then
    return new;
  end if;
  select owner_id, invitation, owner_plan into v_owner, v_invitation, v_plan from public.events where id = new.event_id;
  if auth.uid() is not null and auth.uid() = v_owner then
    new.source := 'host';
    return new;
  end if;

  new.source := 'rsvp';
  new.submitted_at := now();
  new.max_party_size := null;
  new.reminded_at := null;
  if not public.plan_at_least(v_plan, 'pro') then
    new.answers := '{}'::jsonb;
  end if;
  if public.rsvp_closed(v_invitation) then
    raise exception 'RSVPs for this invitation have closed. Please contact the host.' using errcode = 'check_violation';
  end if;
  if new.number_of_guests > 20 then
    raise exception 'A single RSVP can include at most 20 people.' using errcode = 'check_violation';
  end if;

  -- One RSVP at a time per invitation, so a burst can't slip past the counts.
  perform 1 from public.events where id = new.event_id for update;
  select
    count(*) filter (where submitted_at > now() - interval '1 minute'),
    count(*) filter (where submitted_at > now() - interval '1 hour'),
    count(*)
  into v_minute, v_hour, v_total
  from public.guests
  where event_id = new.event_id and source = 'rsvp';

  if v_total >= 2000 then
    raise exception 'This invitation isn''t accepting more RSVPs. Please contact the host.' using errcode = 'check_violation';
  end if;
  if v_minute >= 30 or v_hour >= 500 then
    raise exception 'Too many RSVPs are arriving for this invitation right now. Please try again in a few minutes.' using errcode = 'check_violation';
  end if;
  if exists (
    select 1 from public.guests
    where event_id = new.event_id and source = 'rsvp'
      and lower(trim(name)) = lower(trim(new.name))
      and submitted_at > now() - interval '10 minutes'
  ) then
    raise exception 'It looks like you''ve already RSVP''d. To change your answer, please contact the host.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

-- ─── personalized links ────────────────────────────────────────────────
-- Both functions change shape (new columns / a new parameter), so they're
-- dropped and recreated rather than replaced.
drop function if exists public.get_guest_public(uuid);
create function public.get_guest_public(p_guest_id uuid)
returns table (
  id uuid,
  event_id uuid,
  name text,
  rsvp_status text,
  number_of_guests int,
  meal_preference text,
  message text,
  checked_in boolean,
  max_party_size int,
  answers jsonb
)
language sql
security definer set search_path = public
stable
as $$
  select g.id, g.event_id, g.name, g.rsvp_status, g.number_of_guests, g.meal_preference, g.message, g.checked_in, g.max_party_size, g.answers
  from public.guests g
  join public.events e on e.id = g.event_id
  where g.id = p_guest_id and e.status = 'published'
    and public.plan_at_least(e.owner_plan, 'pro');
$$;

drop function if exists public.update_guest_rsvp(uuid, text, boolean, int, text, text);
create function public.update_guest_rsvp(
  p_guest_id uuid,
  p_name text,
  p_attending boolean,
  p_number_of_guests int,
  p_meal_preference text,
  p_message text,
  p_answers jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_invitation jsonb;
  v_max int;
begin
  select e.invitation, g.max_party_size into v_invitation, v_max
  from public.guests g
  join public.events e on e.id = g.event_id
  where g.id = p_guest_id and e.status = 'published'
    and public.plan_at_least(e.owner_plan, 'pro');
  if not found then
    return;
  end if;
  if public.rsvp_closed(v_invitation) then
    raise exception 'RSVPs for this invitation have closed. Please contact the host.' using errcode = 'check_violation';
  end if;
  if p_attending and p_number_of_guests > coalesce(v_max, 20) then
    raise exception 'This invitation is for up to % %.', coalesce(v_max, 20), case when coalesce(v_max, 20) = 1 then 'person' else 'people' end
      using errcode = 'check_violation';
  end if;

  update public.guests g set
    name = p_name,
    rsvp_status = case when p_attending then 'confirmed' else 'declined' end,
    number_of_guests = case when p_attending then greatest(1, p_number_of_guests) else 0 end,
    meal_preference = p_meal_preference,
    message = p_message,
    answers = coalesce(p_answers, '{}'::jsonb),
    submitted_at = now()
  where g.id = p_guest_id;
end;
$$;
