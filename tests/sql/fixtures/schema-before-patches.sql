-- Invyta database schema + Row Level Security policies.
-- Run this once in the Supabase dashboard: Project -> SQL Editor -> New query -> paste -> Run.
-- Safe to re-run only after dropping the objects below; this is a fresh-project init script, not a migration chain.

-- ─── profiles ────────────────────────────────────────────────────────────
-- auth.users is Supabase-managed; we mirror the display name + plan here
-- since spec §29 subscription tiers live outside auth.users.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text,
  plan text not null default 'free' check (plan in ('free', 'premium', 'pro', 'event_planner')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "read own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "update own profile"
  on public.profiles for update
  using (auth.uid() = id);

create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, name)
  values (new.id, new.raw_user_meta_data ->> 'name');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ─── events ──────────────────────────────────────────────────────────────
create table public.events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  category text not null,
  host text,
  date date,
  time time,
  venue_name text,
  venue_address text,
  description text,
  dress_code text,
  contact_details text,
  status text not null default 'draft'
    check (status in ('draft', 'published', 'unpublished', 'expired', 'archived')),
  template_id text,
  slug text not null unique,
  image_url text,
  guest_count int not null default 0,
  confirmed_guest_count int not null default 0,
  pending_guest_count int not null default 0,
  -- Invitation Builder content: { sections: [...], theme: {...} } — a single
  -- structured JSON blob per spec §35 ("store as configuration, not a large
  -- HTML blob"), not a separate table, since it's always read/written as
  -- one unit per event.
  invitation jsonb not null default '{}'::jsonb,
  -- Denormalized copy of profiles.plan at the time of insert, kept in sync
  -- by triggers below. Needed because the public invitation page (anonymous
  -- guests, via the "anyone can read published events" policy) has to know
  -- whether to show the Free-plan watermark, but "read own profile" on
  -- `profiles` deliberately blocks a stranger from reading the organizer's
  -- profile row directly — this column is the narrow, purpose-built
  -- exception, same denormalization approach as the guest-count aggregates.
  owner_plan text not null default 'free' check (owner_plan in ('free', 'premium', 'pro', 'event_planner')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index events_owner_id_idx on public.events (owner_id);

alter table public.events enable row level security;

create policy "owner has full access to own events"
  on public.events for all
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

create policy "anyone can read published events"
  on public.events for select
  using (status = 'published');

-- Keeps events.owner_plan in sync with profiles.plan (see column comment
-- above): stamp it on insert, and cascade any later upgrade/downgrade to
-- every event that organizer owns.
create function public.set_event_owner_plan()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  select plan into new.owner_plan from public.profiles where id = new.owner_id;
  return new;
end;
$$;

create trigger events_set_owner_plan
  before insert on public.events
  for each row execute procedure public.set_event_owner_plan();

create function public.sync_events_owner_plan()
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

create trigger profiles_sync_events_owner_plan
  after update on public.profiles
  for each row execute procedure public.sync_events_owner_plan();

-- Per-plan cap on Gallery photos (Free 10, Premium 30, Pro/Event Planner
-- unlimited), mirrored client-side by src/data/plan-limits.ts. Enforced
-- here, not just in the builder UI, since an organizer can write their own
-- events row directly. Reads the plan from profiles rather than
-- events.owner_plan, because owner_plan sits on a row the owner can update.
-- Only rejects a save that *adds* photos past the cap, so an organizer who
-- downgrades while over it can still edit or trim their invitation.
create or replace function public.gallery_photo_limit(p_plan text)
returns int
language sql
immutable
as $$
  select case p_plan when 'free' then 10 when 'premium' then 30 else null end;
$$;

create or replace function public.gallery_photo_count(p_invitation jsonb)
returns int
language sql
immutable
as $$
  select count(*)::int
  from jsonb_array_elements(
    case when jsonb_typeof(p_invitation -> 'sections') = 'array' then p_invitation -> 'sections' else '[]'::jsonb end
  ) s,
  jsonb_array_elements_text(
    case when jsonb_typeof(s -> 'content' -> 'imageUrls') = 'array' then s -> 'content' -> 'imageUrls' else '[]'::jsonb end
  ) u
  where s ->> 'type' = 'gallery' and u <> '';
$$;

create or replace function public.enforce_gallery_photo_limit()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_plan text;
  v_limit int;
  v_new int;
begin
  select plan into v_plan from public.profiles where id = new.owner_id;
  v_limit := public.gallery_photo_limit(coalesce(v_plan, 'free'));
  if v_limit is null then
    return new;
  end if;
  v_new := public.gallery_photo_count(new.invitation);
  if v_new > v_limit
     and (tg_op = 'INSERT' or v_new > public.gallery_photo_count(old.invitation)) then
    raise exception 'Your plan allows up to % gallery photos.', v_limit
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists events_enforce_gallery_photo_limit on public.events;
create trigger events_enforce_gallery_photo_limit
  before insert or update of invitation on public.events
  for each row execute procedure public.enforce_gallery_photo_limit();

-- ─── guests ─────────────────────────────────────────────────────────────
-- Rows come from two paths: a guest's own public RSVP submission (always
-- 'confirmed'/'declined', no group_name) or an organizer manually adding
-- someone to their guest list (spec §16/§20 — starts 'pending', can carry
-- a group like Family/VIP). Both share this table since they're the same
-- underlying "who's invited, and where do they stand" record.
create table public.guests (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  name text not null,
  email text,
  phone text,
  group_name text,
  rsvp_status text not null default 'pending' check (rsvp_status in ('confirmed', 'declined', 'pending')),
  number_of_guests int not null default 0,
  meal_preference text,
  message text,
  notes text,
  checked_in boolean not null default false,
  checked_in_at timestamptz,
  submitted_at timestamptz not null default now()
);

create index guests_event_id_idx on public.guests (event_id);

alter table public.guests enable row level security;

-- Only the owning event's organizer can read the guest list — this is the
-- guest-to-guest privacy boundary called out in the compliance addendum
-- (§38 of the base spec / §7 of the addendum), enforced server-side.
create policy "event owner can read their guests"
  on public.guests for select
  using (exists (
    select 1 from public.events e
    where e.id = guests.event_id and e.owner_id = auth.uid()
  ));

-- Anonymous guests can submit an RSVP only against a published event.
-- Wrapped in a security-definer function rather than a plain subquery:
-- a plain `exists (select ... from events ...)` inside this WITH CHECK
-- does not reliably see rows via the "anyone can read published events"
-- policy on `events` (a known multi-table RLS interaction gotcha) even
-- though the same anon role can read that row directly — the function
-- sidesteps it by deliberately running with elevated privileges for this
-- one narrow status check.
create function public.event_is_published(target_event_id uuid)
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

-- The event owner can manage their guest list directly (manual add, edit,
-- delete) regardless of the event's published status — separate from the
-- anonymous RSVP policy above; Postgres OR's multiple permissive policies
-- for the same command together, so both can coexist.
create policy "event owner can insert guests"
  on public.guests for insert
  with check (exists (
    select 1 from public.events e
    where e.id = guests.event_id and e.owner_id = auth.uid()
  ));

create policy "event owner can update guests"
  on public.guests for update
  using (exists (
    select 1 from public.events e
    where e.id = guests.event_id and e.owner_id = auth.uid()
  ));

create policy "event owner can delete guests"
  on public.guests for delete
  using (exists (
    select 1 from public.events e
    where e.id = guests.event_id and e.owner_id = auth.uid()
  ));

-- ─── guest-count aggregates, owned by the database ─────────────────────────
-- Replaces the client-side "compute aggregates then write them back" logic
-- that used to live in the app — avoids write races and keeps the event
-- row as the single source of truth for its own guest counts.
create function public.recalc_event_guest_stats()
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

create trigger guests_after_change
  after insert or update or delete on public.guests
  for each row execute procedure public.recalc_event_guest_stats();

-- ─── personalized invitation links (spec §21) ──────────────────────────
-- A guest's own row id doubles as their personal link token — already
-- effectively unguessable (a v4 UUID) and already trusted the same way
-- for QR check-in payloads. These two functions are the anonymous-safe
-- surface for that link: a narrow, id-scoped read (never a broad table
-- grant, which would let anyone list every guest) and an update-in-place
-- so submitting via a personal link maps onto the guest's existing row
-- instead of inserting a duplicate — the same fix pattern as
-- event_is_published above, for the same multi-table RLS reason.
create function public.get_guest_public(p_guest_id uuid)
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
  where g.id = p_guest_id and e.status = 'published';
$$;

create function public.update_guest_rsvp(
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
  where g.id = p_guest_id and e.id = g.event_id and e.status = 'published';
end;
$$;

-- ─── invitation image uploads ──────────────────────────────────────────
-- A public Storage bucket for the Invitation Builder's Cover photo and
-- Gallery, backing real file upload instead of paste-a-URL. Public because
-- guests view these images anonymously; access control lives on write
-- (insert/update/delete), keyed off the uploader's own auth.uid() as the
-- object path's first folder segment ("<uid>/<eventId>/<random>.<ext>") —
-- simple and fast, no events-table lookup needed.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('invitation-images', 'invitation-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "anyone can view invitation images"
on storage.objects for select
using (bucket_id = 'invitation-images');

create policy "owner can upload their own invitation images"
on storage.objects for insert
with check (
  bucket_id = 'invitation-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "owner can update their own invitation images"
on storage.objects for update
using (
  bucket_id = 'invitation-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "owner can delete their own invitation images"
on storage.objects for delete
using (
  bucket_id = 'invitation-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);
