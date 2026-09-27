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
  if new.plan is distinct from old.plan then
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
-- higher. Used by every events trigger below, which run before
-- events.owner_plan is recomputed and so can't rely on it.
create or replace function public.effective_plan(p_owner_id uuid, p_event_plan text)
returns text
language sql
stable
security definer set search_path = public
as $$
  select public.plan_max(coalesce((select plan from public.profiles where id = p_owner_id), 'free'), coalesce(p_event_plan, 'free'));
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
