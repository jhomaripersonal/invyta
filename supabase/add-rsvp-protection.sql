-- Patch for an already-created project: spam protection for public RSVPs.
-- Run once in the Supabase dashboard's SQL Editor, after add-video.sql.
-- See supabase/schema.sql for the canonical, fresh-install copy.
--
-- Anyone with an invitation's link can RSVP (that's the point), so the
-- public insert path needs limits a bot can't skip by calling the API
-- directly. The host's own additions and CSV imports are never limited.

-- Where a guest row came from: 'host' (added by the organizer) or 'rsvp'
-- (a public RSVP). Set by the trigger below — never trusted from the client.
alter table public.guests add column if not exists source text not null default 'host'
  check (source in ('host', 'rsvp'));

create index if not exists guests_event_source_time_idx on public.guests (event_id, source, submitted_at desc);

-- Size limits, so the public form can't be used to store huge blobs of
-- text. NOT VALID: enforced for new and edited rows, without failing on
-- anything already stored.
alter table public.guests drop constraint if exists guests_field_sizes;
alter table public.guests add constraint guests_field_sizes check (
  char_length(name) between 1 and 120
  and (email is null or char_length(email) <= 254)
  and (phone is null or char_length(phone) <= 40)
  and (meal_preference is null or char_length(meal_preference) <= 200)
  and (message is null or char_length(message) <= 1000)
  and (notes is null or char_length(notes) <= 2000)
  and number_of_guests between 0 and 50
) not valid;

-- Public RSVP limits, per invitation:
--   • 30 per minute and 500 per hour — far above a real link being shared
--     in group chats, far below a flood;
--   • 2,000 public RSVPs in total;
--   • the same name twice within 10 minutes (a double tap, or a script);
--   • at most 20 people in one RSVP.
-- Applies to API callers (anon, or a signed-in user who isn't the event's
-- owner); the owner, the service role and the SQL editor are unaffected.
create or replace function public.protect_public_rsvp()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_owner uuid;
  v_minute int;
  v_hour int;
  v_total int;
begin
  if coalesce(auth.role(), '') not in ('anon', 'authenticated') then
    return new;
  end if;
  select owner_id into v_owner from public.events where id = new.event_id;
  if auth.uid() is not null and auth.uid() = v_owner then
    new.source := 'host';
    return new;
  end if;

  new.source := 'rsvp';
  new.submitted_at := now();
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

drop trigger if exists guests_protect_public_rsvp on public.guests;
create trigger guests_protect_public_rsvp
  before insert on public.guests
  for each row execute procedure public.protect_public_rsvp();
