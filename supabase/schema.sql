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
  -- Admin portal access; also lifts all of the admin's events to Pro (see
  -- effective_plan). Set only from the SQL Editor — see "admin portal" below.
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "read own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "update own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- `plan` is billing state, so only the server (service role / SQL editor)
-- may change it — the policy above still lets a user edit their own
-- display name, but a column grant keeps them from self-upgrading with
-- `update profiles set plan = 'pro'` from the browser console.
revoke update on public.profiles from anon, authenticated;
grant update (name) on public.profiles to authenticated;

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
  -- The plan purchased for this event (billing is per event). Only the
  -- payment system may change it — see protect_event_plan below.
  plan text not null default 'free' check (plan in ('free', 'premium', 'pro', 'event_planner')),
  -- This event's *effective* plan: the higher of `plan` and the organizer's
  -- account plan (profiles.plan, e.g. an Event Planner account covers all
  -- its events). Kept up to date by triggers below. Denormalized because
  -- the public invitation page (anonymous guests) needs it for the Free
  -- watermark and guest-facing feature checks, while "read own profile" on
  -- `profiles` deliberately blocks strangers from the organizer's profile.
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

-- events.plan is billing state: a signed-in owner (who otherwise has full
-- access to their own event rows) can't set it — new events always start
-- Free, and changes from the API are ignored. Only the payment system
-- (service role, via mark_payment_paid) or the SQL editor can change it.
-- Named "events_0_..." so it fires before every other BEFORE trigger on
-- events (Postgres runs them in name order), which all read new.plan.
create or replace function public.protect_event_plan()
returns trigger
language plpgsql
as $$
begin
  if coalesce(auth.role(), '') in ('authenticated', 'anon') then
    new.plan := case when tg_op = 'INSERT' then 'free' else old.plan end;
  end if;
  return new;
end;
$$;

drop trigger if exists events_0_protect_plan on public.events;
create trigger events_0_protect_plan
  before insert or update on public.events
  for each row execute procedure public.protect_event_plan();

-- Keeps events.owner_plan (the effective plan — see column comment above)
-- up to date: recompute it on every insert *and* update, so an owner
-- writing their own events row can't set it to hide the Free watermark,
-- and cascade any account-level upgrade/downgrade to every event that
-- organizer owns.
create or replace function public.set_event_owner_plan()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  new.owner_plan := public.effective_plan(new.owner_id, new.plan);
  return new;
end;
$$;

create trigger events_set_owner_plan
  before insert or update on public.events
  for each row execute procedure public.set_event_owner_plan();

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

create trigger profiles_sync_events_owner_plan
  after update on public.profiles
  for each row execute procedure public.sync_events_owner_plan();

-- ─── plan rules ─────────────────────────────────────────────────────────
-- Server-side mirror of src/data/plan-limits.ts — keep the two in sync.
-- Every limit below is enforced here, not just in the UI, since an
-- organizer (or an anonymous guest, for RSVPs) can call the API directly.
create or replace function public.plan_at_least(p_plan text, p_min text)
returns boolean
language sql
immutable
as $$
  select array_position(array['free', 'premium', 'pro', 'event_planner'], coalesce(p_plan, 'free'))
      >= array_position(array['free', 'premium', 'pro', 'event_planner'], p_min);
$$;

-- The higher of two plans.
create or replace function public.plan_max(p_a text, p_b text)
returns text
language sql
immutable
as $$
  select case when public.plan_at_least(p_a, coalesce(p_b, 'free')) then coalesce(p_a, 'free') else p_b end;
$$;

-- An event's effective plan from its source-of-truth parts: what was
-- bought for the event, or the organizer's account plan, whichever is
-- higher — and at least Pro for admins, who get every feature. Used by every events trigger below, which run before
-- events.owner_plan is recomputed and so can't rely on it.
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

-- The effective plan of an existing event, for the guests triggers.
-- Internal to the triggers below, so not callable through the API.
create or replace function public.event_owner_plan(p_event_id uuid)
returns text
language sql
stable
security definer set search_path = public
as $$
  select public.effective_plan(e.owner_id, e.plan) from public.events e where e.id = p_event_id;
$$;

revoke execute on function public.event_owner_plan(uuid) from public, anon, authenticated;

-- Mirrors the `premium: true` entries in src/data/templates.ts.
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

-- Only rejects *choosing* a premium template, so an organizer who
-- downgrades can keep editing an event that already uses one.
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
  v_plan := public.effective_plan(new.owner_id, new.plan);
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

-- Per-plan cap on Gallery photos (Free 10, Premium 30, Pro/Event Planner
-- unlimited), mirrored client-side by src/data/plan-limits.ts. Enforced
-- here, not just in the builder UI, since an organizer can write their own
-- events row directly. Reads the event's effective plan from its source
-- parts (effective_plan) rather than owner_plan, which is recomputed later.
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
  v_plan := public.effective_plan(new.owner_id, new.plan);
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

-- Premium gallery styles: every layout except Masonry/Grid, and any photo
-- filter. Mirrors the `premium: true` entries in
-- src/data/gallery-styles.ts. A missing layout/filter means the free
-- defaults (masonry, no filter), so older invitations always pass.
create or replace function public.gallery_style_is_premium(p_invitation jsonb)
returns boolean
language sql
immutable
as $$
  select exists (
    select 1
    from jsonb_array_elements(
      case when jsonb_typeof(p_invitation -> 'sections') = 'array' then p_invitation -> 'sections' else '[]'::jsonb end
    ) s
    where s ->> 'type' = 'gallery'
      and (coalesce(s -> 'content' ->> 'layout', 'masonry') not in ('masonry', 'grid')
           or coalesce(s -> 'content' ->> 'filter', 'none') <> 'none')
  );
$$;

-- Only rejects *switching to* a Premium style, so an organizer who
-- downgrades can keep editing an invitation that already uses one.
create or replace function public.enforce_gallery_style()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_plan text;
begin
  if not public.gallery_style_is_premium(new.invitation)
     or (tg_op = 'UPDATE' and public.gallery_style_is_premium(old.invitation)) then
    return new;
  end if;
  v_plan := public.effective_plan(new.owner_id, new.plan);
  if not public.plan_at_least(v_plan, 'premium') then
    raise exception 'Premium gallery styles require the Premium plan.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists events_enforce_gallery_style on public.events;
create trigger events_enforce_gallery_style
  before insert or update of invitation on public.events
  for each row execute procedure public.enforce_gallery_style();

-- ─── premium page layouts, cover & section styles ──────────────────────
-- Mirrors the `premium: true` entries in src/data/page-layouts.ts
-- (layouts, cover styles) and src/data/section-styles.ts (section
-- styles). A missing layout/style means that section's free default, so
-- older invitations always pass.
create or replace function public.design_style_is_premium(p_invitation jsonb)
returns boolean
language sql
immutable
as $$
  select coalesce(p_invitation -> 'theme' ->> 'layout', 'classic') not in ('classic', 'stationery')
    or exists (
      select 1
      from jsonb_array_elements(
        case when jsonb_typeof(p_invitation -> 'sections') = 'array' then p_invitation -> 'sections' else '[]'::jsonb end
      ) s
      where (s ->> 'type') || ':' || coalesce(s -> 'content' ->> 'style', '') = any (array[
        'cover:split', 'cover:monogram',
        'schedule:cards',
        'venue:photo', 'venue:map',
        'story:photo'
      ])
    );
$$;

-- Only rejects *switching to* a Premium design, so an organizer who
-- downgrades can keep editing an invitation that already uses one.
create or replace function public.enforce_design_style()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_plan text;
begin
  if not public.design_style_is_premium(new.invitation)
     or (tg_op = 'UPDATE' and public.design_style_is_premium(old.invitation)) then
    return new;
  end if;
  v_plan := public.effective_plan(new.owner_id, new.plan);
  if not public.plan_at_least(v_plan, 'premium') then
    raise exception 'Premium layouts and styles require the Premium plan.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists events_enforce_design_style on public.events;
create trigger events_enforce_design_style
  before insert or update of invitation on public.events
  for each row execute procedure public.enforce_design_style();

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
  submitted_at timestamptz not null default now(),
  -- Replies to the invitation's custom RSVP questions (Pro):
  -- { "<question id>": "<answer>" }.
  answers jsonb not null default '{}'::jsonb
    constraint guests_answers_size check (jsonb_typeof(answers) = 'object' and octet_length(answers::text) <= 5000),
  -- How many people this guest may RSVP for, set by the host and enforced
  -- on their personalized link (Pro). Null = the usual limit of 20.
  max_party_size int check (max_party_size between 1 and 20),
  -- When the host last nudged this guest to reply.
  reminded_at timestamptz
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

-- ─── guest-list plan limits ────────────────────────────────────────────
-- Free events cap the guest list at 50 rows — organizer-added guests and
-- public RSVPs alike — mirrored client-side by src/data/plan-limits.ts.
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
  -- Lock the event row so two RSVPs landing at once can't both slip in
  -- under the cap.
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

-- QR check-in is a Premium feature. Undoing a check-in stays allowed so a
-- downgraded organizer can still correct a mistake.
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

-- ─── personalized invitation links (spec §21) ──────────────────────────
-- A guest's own row id doubles as their personal link token — already
-- effectively unguessable (a v4 UUID) and already trusted the same way
-- for QR check-in payloads. These two functions are the anonymous-safe
-- surface for that link: a narrow, id-scoped read (never a broad table
-- grant, which would let anyone list every guest) and an update-in-place
-- so submitting via a personal link maps onto the guest's existing row
-- instead of inserting a duplicate — the same fix pattern as
-- event_is_published above, for the same multi-table RLS reason.
-- Personalized links are a Pro feature: on a lower plan both functions
-- find no guest, and the invitation falls back to its generic RSVP form.
create or replace function public.get_guest_public(p_guest_id uuid)
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

create or replace function public.update_guest_rsvp(
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

-- ─── account deletion ──────────────────────────────────────────────────
-- Lets a signed-in organizer delete their own account (Data Privacy Act
-- right to erasure — compliance addendum §1–2). Deleting the auth.users
-- row cascades to profiles, events, and through events every guest row.
-- Uploaded photos live in Storage, which can't be deleted from SQL, so the
-- app removes those first via the Storage API (deleteAllUserImages in
-- src/lib/storage.ts) before calling this.
--
-- When payments are added: payment records must survive this (5-year BIR
-- retention, addendum §2) — give that table `on delete set null` for the
-- user reference, not `on delete cascade`.
create or replace function public.delete_own_account()
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in.';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

revoke execute on function public.delete_own_account() from public, anon;
grant execute on function public.delete_own_account() to authenticated;

-- ─── payments (per-event upgrades via PayMongo) ─────────────────────────
-- One row per checkout attempt. Rows are created and updated only by the
-- Edge Functions (service role); organizers can read their own. The user
-- and event references are `on delete set null`, not cascade: payment
-- records must survive account/event deletion for the 5-year BIR
-- retention requirement (compliance addendum §2), so `description` keeps
-- a snapshot of what was bought.
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  event_id uuid references public.events (id) on delete set null,
  plan text not null check (plan in ('premium', 'pro')),
  amount_centavos int not null check (amount_centavos > 0),
  currency text not null default 'PHP' check (currency = 'PHP'),
  description text not null,
  status text not null default 'pending' check (status in ('pending', 'paid', 'expired', 'failed')),
  provider text not null default 'paymongo',
  checkout_session_id text unique,
  provider_payment_id text,
  payment_method text,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists payments_user_id_idx on public.payments (user_id);
create index if not exists payments_event_id_idx on public.payments (event_id);

alter table public.payments enable row level security;

drop policy if exists "read own payments" on public.payments;
create policy "read own payments"
  on public.payments for select
  using (auth.uid() = user_id);

-- Applies a confirmed payment exactly once: marks it paid and upgrades its
-- event, in one transaction. Called by the webhook and by the return-page
-- confirmation (both service role), so it must be idempotent — a second
-- call for an already-paid row is a no-op. The paid amount must match
-- what we charged, so a tampered or mismatched session can't upgrade.
create or replace function public.mark_payment_paid(
  p_payment_id uuid,
  p_amount_centavos int,
  p_provider_payment_id text,
  p_payment_method text
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v public.payments%rowtype;
begin
  select * into v from public.payments where id = p_payment_id for update;
  if not found then
    raise exception 'Unknown payment %', p_payment_id;
  end if;
  if v.status = 'paid' then
    return;
  end if;
  if p_amount_centavos is distinct from v.amount_centavos then
    raise exception 'Paid amount % does not match charged amount %', p_amount_centavos, v.amount_centavos;
  end if;

  update public.payments
    set status = 'paid', paid_at = now(), provider_payment_id = p_provider_payment_id, payment_method = p_payment_method
    where id = v.id;

  -- Never downgrade: a Premium payment arriving after a Pro one is ignored.
  if v.event_id is not null then
    update public.events set plan = v.plan
      where id = v.event_id and not public.plan_at_least(plan, v.plan);
  end if;
end;
$$;

revoke execute on function public.mark_payment_paid(uuid, int, text, text) from public, anon, authenticated;
grant execute on function public.mark_payment_paid(uuid, int, text, text) to service_role;

-- ─── admin portal & support inbox ──────────────────────────────────────
-- Make someone an admin (SQL Editor only — users can't set this on their
-- own profile; the column grant on profiles allows updating `name` only):
--   update public.profiles set is_admin = true
--   where id = (select id from auth.users where email = 'you@example.com');

-- ─── admins ─────────────────────────────────────────────────────────────
alter table public.profiles add column if not exists is_admin boolean not null default false;

-- Whether the signed-in caller is an admin. Every admin-only function and
-- policy below goes through this, so admin access is enforced server-side
-- rather than by the UI hiding a link.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

-- ─── support inbox ──────────────────────────────────────────────────────
-- Questions, billing issues, bug reports, reports of abusive invitations
-- (Terms §5) and Data Privacy Act requests (Privacy Policy §8), from
-- organizers and from guests without an account. Anyone can submit; the
-- submitter can read their own; only admins can read all and change status.
create table if not exists public.support_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  name text not null check (char_length(name) between 1 and 120),
  email text not null check (char_length(email) between 3 and 254 and position('@' in email) > 1),
  category text not null check (category in ('question', 'billing', 'bug', 'report', 'privacy')),
  subject text not null check (char_length(subject) between 1 and 200),
  message text not null check (char_length(message) between 1 and 5000),
  page_url text check (page_url is null or char_length(page_url) <= 500),
  status text not null default 'open' check (status in ('open', 'in_progress', 'resolved')),
  admin_note text check (admin_note is null or char_length(admin_note) <= 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  -- From an organizer with a Pro account or a Pro event (set on submit);
  -- the admin inbox lists these first.
  priority boolean not null default false
);

create index if not exists support_requests_status_idx on public.support_requests (status, created_at desc);

alter table public.support_requests enable row level security;

drop policy if exists "anyone can submit a support request" on public.support_requests;
create policy "anyone can submit a support request"
  on public.support_requests for insert
  with check (true);

drop policy if exists "submitter or admin can read" on public.support_requests;
create policy "submitter or admin can read"
  on public.support_requests for select
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists "admins can update" on public.support_requests;
create policy "admins can update"
  on public.support_requests for update
  using (public.is_admin())
  with check (public.is_admin());

-- On submit: stamp the submitter's own user id (never a spoofed one),
-- force a fresh "open" request, and limit each email address to 5
-- requests an hour so the public form can't be used to flood the inbox.
create or replace function public.prepare_support_request()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  new.user_id := auth.uid();
  new.status := 'open';
  new.admin_note := null;
  new.resolved_at := null;
  new.created_at := now();
  new.updated_at := now();
  new.email := lower(trim(new.email));
  new.priority := auth.uid() is not null and (
    public.plan_at_least((select plan from public.profiles where id = auth.uid()), 'pro')
    or exists (select 1 from public.events where owner_id = auth.uid() and public.plan_at_least(owner_plan, 'pro'))
  );
  if (select count(*) from public.support_requests
      where email = new.email and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'Too many requests from this email address. Please try again in an hour.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists support_requests_prepare on public.support_requests;
create trigger support_requests_prepare
  before insert on public.support_requests
  for each row execute procedure public.prepare_support_request();

create or replace function public.touch_support_request()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  if new.status = 'resolved' and old.status is distinct from 'resolved' then
    new.resolved_at := now();
  elsif new.status <> 'resolved' then
    new.resolved_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists support_requests_touch on public.support_requests;
create trigger support_requests_touch
  before update on public.support_requests
  for each row execute procedure public.touch_support_request();

-- ─── admin reporting ────────────────────────────────────────────────────
-- Read-only, admin-only aggregates for the admin portal. security definer
-- so they can count across every user's rows (RLS would otherwise scope
-- them to the caller), which is exactly why each one checks is_admin()
-- first. Days are bucketed in Philippine time.
create or replace function public.admin_overview()
returns jsonb
language plpgsql
stable
security definer set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Asia/Manila')::date;
  v jsonb;
begin
  if not public.is_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  with days as (
    select generate_series(v_today - 29, v_today, interval '1 day')::date as day
  )
  select jsonb_build_object(
    'users_total', (select count(*) from auth.users),
    'users_7d', (select count(*) from public.profiles where created_at > now() - interval '7 days'),
    'users_30d', (select count(*) from public.profiles where created_at > now() - interval '30 days'),
    'events_total', (select count(*) from public.events),
    'events_published', (select count(*) from public.events where status = 'published'),
    'events_paid', (select count(*) from public.events where plan <> 'free'),
    'guests_total', (select count(*) from public.guests),
    'revenue_total_centavos', (select coalesce(sum(amount_centavos), 0) from public.payments where status = 'paid'),
    'revenue_30d_centavos', (select coalesce(sum(amount_centavos), 0) from public.payments where status = 'paid' and paid_at > now() - interval '30 days'),
    'payments_paid', (select count(*) from public.payments where status = 'paid'),
    'payments_pending', (select count(*) from public.payments where status = 'pending'),
    'support_open', (select count(*) from public.support_requests where status <> 'resolved'),
    'signups_by_day', (
      select jsonb_agg(jsonb_build_object('day', d.day, 'value', (
        select count(*) from public.profiles p where (p.created_at at time zone 'Asia/Manila')::date = d.day
      )) order by d.day) from days d
    ),
    'revenue_by_day', (
      select jsonb_agg(jsonb_build_object('day', d.day, 'value', (
        select coalesce(sum(amount_centavos), 0) from public.payments p
        where p.status = 'paid' and (p.paid_at at time zone 'Asia/Manila')::date = d.day
      )) order by d.day) from days d
    ),
    'revenue_by_plan', (
      select coalesce(jsonb_agg(jsonb_build_object('plan', plan, 'count', n, 'centavos', total) order by plan), '[]'::jsonb)
      from (select plan, count(*) as n, sum(amount_centavos) as total from public.payments where status = 'paid' group by plan) t
    )
  ) into v;
  return v;
end;
$$;

create or replace function public.admin_payments(p_status text default null, p_limit int default 200)
returns table (
  id uuid,
  created_at timestamptz,
  paid_at timestamptz,
  status text,
  plan text,
  amount_centavos int,
  payment_method text,
  description text,
  user_email text
)
language plpgsql
stable
security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  return query
    select p.id, p.created_at, p.paid_at, p.status, p.plan, p.amount_centavos, p.payment_method, p.description, u.email::text
    from public.payments p
    left join auth.users u on u.id = p.user_id
    where p_status is null or p.status = p_status
    order by p.created_at desc
    limit least(greatest(p_limit, 1), 500);
end;
$$;

create or replace function public.admin_recent_users(p_limit int default 50)
returns table (
  id uuid,
  name text,
  email text,
  created_at timestamptz,
  events bigint,
  paid_centavos bigint
)
language plpgsql
stable
security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  return query
    select pr.id, pr.name, u.email::text, pr.created_at,
      (select count(*) from public.events e where e.owner_id = pr.id),
      (select coalesce(sum(pay.amount_centavos), 0)::bigint from public.payments pay where pay.user_id = pr.id and pay.status = 'paid')
    from public.profiles pr
    join auth.users u on u.id = pr.id
    order by pr.created_at desc
    limit least(greatest(p_limit, 1), 200);
end;
$$;

-- ─── testimonials ───────────────────────────────────────────────────────
-- One testimonial per organizer. Shown on the landing page only after an
-- admin approves it, and only with the display name and event line the
-- organizer chose — with their explicit consent recorded. Editing it sends
-- it back for review; deleting it (or the account) withdraws it.
create table if not exists public.testimonials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 60),
  event_label text check (event_label is null or char_length(event_label) <= 80),
  quote text not null check (char_length(quote) between 10 and 400),
  rating smallint check (rating is null or rating between 1 and 5),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  consented_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  approved_at timestamptz
);

create index if not exists testimonials_status_idx on public.testimonials (status, approved_at desc);

alter table public.testimonials enable row level security;

drop policy if exists "owner or admin can read testimonial" on public.testimonials;
create policy "owner or admin can read testimonial"
  on public.testimonials for select
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists "signed-in users can submit a testimonial" on public.testimonials;
create policy "signed-in users can submit a testimonial"
  on public.testimonials for insert
  with check (auth.uid() is not null);

drop policy if exists "owner or admin can update testimonial" on public.testimonials;
create policy "owner or admin can update testimonial"
  on public.testimonials for update
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists "owner or admin can delete testimonial" on public.testimonials;
create policy "owner or admin can delete testimonial"
  on public.testimonials for delete
  using (user_id = auth.uid() or public.is_admin());

-- Submitting: always as yourself, only once you've created an event (so
-- testimonials come from people who've actually used Invyta), always
-- starting in review, with consent stamped now.
-- Editing: an owner's edit to the words, name or rating sends it back to
-- review; only an admin can change the status (approve/reject/unpublish).
create or replace function public.prepare_testimonial()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is null then
      raise exception 'Please sign in to share a testimonial.';
    end if;
    new.user_id := auth.uid();
    if not exists (select 1 from public.events where owner_id = new.user_id) then
      raise exception 'Create an event before sharing a testimonial.' using errcode = 'check_violation';
    end if;
    new.status := 'pending';
    new.consented_at := now();
    new.created_at := now();
    new.approved_at := null;
  else
    new.user_id := old.user_id;
    new.created_at := old.created_at;
    if public.is_admin() then
      if new.status = 'approved' and old.status is distinct from 'approved' then
        new.approved_at := now();
      elsif new.status <> 'approved' then
        new.approved_at := null;
      end if;
    else
      new.status := old.status;
      new.approved_at := old.approved_at;
      if (new.quote, new.display_name, new.event_label, new.rating) is distinct from (old.quote, old.display_name, old.event_label, old.rating) then
        new.status := 'pending';
        new.approved_at := null;
        new.consented_at := now();
      end if;
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists testimonials_prepare on public.testimonials;
create trigger testimonials_prepare
  before insert or update on public.testimonials
  for each row execute procedure public.prepare_testimonial();

-- What the public landing page may see: approved testimonials, and only
-- the fields the organizer chose to show — never user ids or emails.
create or replace function public.approved_testimonials(p_limit int default 6)
returns table (
  id uuid,
  display_name text,
  event_label text,
  quote text,
  rating smallint,
  approved_at timestamptz
)
language sql
stable
security definer set search_path = public
as $$
  select t.id, t.display_name, t.event_label, t.quote, t.rating, t.approved_at
  from public.testimonials t
  where t.status = 'approved'
  order by t.approved_at desc
  limit least(greatest(p_limit, 1), 12);
$$;

grant execute on function public.approved_testimonials(int) to anon, authenticated;

-- ─── custom invitation links ────────────────────────────────────────────
-- An event's link is /i/<slug>. Premium (and up) may choose their slug; on
-- lower plans the server generates it. Changing a slug never breaks a
-- link already shared: the old slug stays as an alias that resolves to
-- the event's current one, and no other event can ever take it.
-- Old slugs → the event they now point to.
create table if not exists public.event_slug_aliases (
  slug text primary key,
  event_id uuid not null references public.events (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists event_slug_aliases_event_idx on public.event_slug_aliases (event_id);

-- Only reachable through resolve_event_slug / slug_available below.
alter table public.event_slug_aliases enable row level security;

-- Custom slug rules: 3–60 chars of a–z, 0–9 and single hyphens, not
-- starting or ending with one. Mirrored by src/lib/custom-links.ts.
create or replace function public.slug_is_valid(p_slug text)
returns boolean
language sql
immutable
as $$
  select p_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(p_slug) between 3 and 60;
$$;

-- Whether a slug is free for an event to use: not another event's current
-- slug, and not an old slug of another event.
create or replace function public.slug_available(p_slug text, p_event_id uuid default null)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select public.slug_is_valid(p_slug)
    and not exists (select 1 from public.events where slug = p_slug and id is distinct from p_event_id)
    and not exists (select 1 from public.event_slug_aliases where slug = p_slug and event_id is distinct from p_event_id);
$$;

grant execute on function public.slug_available(text, uuid) to authenticated;

-- A server-generated slug from the event name plus a random suffix, used
-- for every event whose plan doesn't include custom links.
create or replace function public.generate_event_slug(p_name text)
returns text
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  v_base text := trim(both '-' from left(regexp_replace(lower(coalesce(p_name, '')), '[^a-z0-9]+', '-', 'g'), 40));
  v_slug text;
begin
  if v_base = '' then
    v_base := 'invite';
  end if;
  loop
    v_slug := v_base || '-' || substr(md5(random()::text || clock_timestamp()::text), 1, 4);
    exit when public.slug_available(v_slug, null);
  end loop;
  return v_slug;
end;
$$;

-- Slugs are decided here, not by the client:
--  • insert — a Premium-or-higher owner may pick a valid, available slug;
--    otherwise the server generates one (a Free event can't claim a
--    chosen link by calling the API directly);
--  • update — changing the slug needs Premium or higher and a valid,
--    available slug; the old one becomes an alias, and taking back one of
--    this event's own old slugs removes it from the aliases.
-- Named "events_1_..." so it runs right after events_0_protect_plan
-- (which settles new.plan) and before the other checks.
create or replace function public.manage_event_slug()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_can_customize boolean := public.plan_at_least(public.effective_plan(new.owner_id, new.plan), 'premium');
begin
  if tg_op = 'INSERT' then
    if not v_can_customize or new.slug is null or not public.slug_available(new.slug, null) then
      new.slug := public.generate_event_slug(new.name);
    end if;
    return new;
  end if;

  if new.slug is not distinct from old.slug then
    return new;
  end if;
  if not v_can_customize then
    raise exception 'Custom links require the Premium plan.' using errcode = 'check_violation';
  end if;
  if not public.slug_is_valid(new.slug) then
    raise exception 'Links can use lowercase letters, numbers and hyphens (3–60 characters).' using errcode = 'check_violation';
  end if;
  if not public.slug_available(new.slug, new.id) then
    raise exception 'That link is already taken.' using errcode = 'unique_violation';
  end if;

  delete from public.event_slug_aliases where slug = new.slug and event_id = new.id;
  insert into public.event_slug_aliases (slug, event_id) values (old.slug, new.id)
    on conflict (slug) do nothing;
  return new;
end;
$$;

drop trigger if exists events_1_manage_slug on public.events;
create trigger events_1_manage_slug
  before insert or update on public.events
  for each row execute procedure public.manage_event_slug();

-- For the public page and link previews: the *current* slug a link should
-- go to — the slug itself if it's live, or the new slug an old one moved
-- to. Published events only, like the page itself.
create or replace function public.resolve_event_slug(p_slug text)
returns text
language sql
stable
security definer set search_path = public
as $$
  select coalesce(
    (select e.slug from public.events e where e.slug = p_slug and e.status = 'published'),
    (select e.slug from public.event_slug_aliases a join public.events e on e.id = a.event_id
      where a.slug = p_slug and e.status = 'published')
  );
$$;

grant execute on function public.resolve_event_slug(text) to anon, authenticated;

-- ─── Video section (Pro) ────────────────────────────────────────────────
-- The Video section embeds YouTube/Vimeo/Facebook links (src/lib/video-
-- embed.ts); nothing is uploaded or stored besides the links.
-- Whether an invitation shows videos: an enabled Video section with at
-- least one non-empty link. (Which links are valid is decided in the app,
-- which only ever embeds links it can parse.)
create or replace function public.invitation_uses_video(p_invitation jsonb)
returns boolean
language sql
immutable
as $$
  select exists (
    select 1
    from jsonb_array_elements(
      case when jsonb_typeof(p_invitation -> 'sections') = 'array' then p_invitation -> 'sections' else '[]'::jsonb end
    ) s
    where s ->> 'type' = 'video'
      and coalesce((s ->> 'enabled')::boolean, false)
      and exists (
        select 1
        from jsonb_array_elements(
          case when jsonb_typeof(s -> 'content' -> 'videos') = 'array' then s -> 'content' -> 'videos' else '[]'::jsonb end
        ) v
        where coalesce(trim(v ->> 'url'), '') <> ''
      )
  );
$$;

-- Only rejects *starting* to show videos below Pro, so an event that
-- already has them (e.g. its owner stopped being an admin) stays editable.
create or replace function public.enforce_video_plan()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.invitation_uses_video(new.invitation)
     or (tg_op = 'UPDATE' and public.invitation_uses_video(old.invitation)) then
    return new;
  end if;
  if not public.plan_at_least(public.effective_plan(new.owner_id, new.plan), 'pro') then
    raise exception 'Videos require the Pro plan.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists events_enforce_video_plan on public.events;
create trigger events_enforce_video_plan
  before insert or update of invitation on public.events
  for each row execute procedure public.enforce_video_plan();

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

-- ─── public RSVP spam protection ────────────────────────────────────────
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

-- Public RSVP limits, per invitation (plus: closed after the RSVP
-- deadline, answers kept only on Pro events, and host-only fields never
-- taken from a public RSVP):
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

drop trigger if exists guests_protect_public_rsvp on public.guests;
create trigger guests_protect_public_rsvp
  before insert on public.guests
  for each row execute procedure public.protect_public_rsvp();

-- ─── background music (Pro) ─────────────────────────────────────────────
-- The organizer uploads one audio file; the invitation keeps its URL in
-- invitation.music.url. Guests' browsers only start it after a tap.
-- Public, like invitation-images: guests play it anonymously. Same folder
-- rule for writes: "<uid>/<eventId>/<random>.<ext>".
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('invitation-audio', 'invitation-audio', true, 10485760, array['audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/ogg'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "anyone can play invitation audio" on storage.objects;
create policy "anyone can play invitation audio"
on storage.objects for select
using (bucket_id = 'invitation-audio');

drop policy if exists "owner can upload their own invitation audio" on storage.objects;
create policy "owner can upload their own invitation audio"
on storage.objects for insert
with check (
  bucket_id = 'invitation-audio'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "owner can update their own invitation audio" on storage.objects;
create policy "owner can update their own invitation audio"
on storage.objects for update
using (
  bucket_id = 'invitation-audio'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "owner can delete their own invitation audio" on storage.objects;
create policy "owner can delete their own invitation audio"
on storage.objects for delete
using (
  bucket_id = 'invitation-audio'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create or replace function public.invitation_uses_music(p_invitation jsonb)
returns boolean
language sql
immutable
as $$
  select jsonb_typeof(p_invitation -> 'music') = 'object'
    and coalesce(trim(p_invitation -> 'music' ->> 'url'), '') <> '';
$$;

-- Like the Video rule: only *starting* to use music needs Pro.
create or replace function public.enforce_music_plan()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.invitation_uses_music(new.invitation)
     or (tg_op = 'UPDATE' and public.invitation_uses_music(old.invitation)) then
    return new;
  end if;
  if not public.plan_at_least(public.effective_plan(new.owner_id, new.plan), 'pro') then
    raise exception 'Background music requires the Pro plan.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists events_enforce_music_plan on public.events;
create trigger events_enforce_music_plan
  before insert or update of invitation on public.events
  for each row execute procedure public.enforce_music_plan();
