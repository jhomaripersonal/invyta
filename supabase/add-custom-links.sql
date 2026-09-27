-- Patch for an already-created project: custom invitation links (Premium).
-- Run once in the Supabase dashboard's SQL Editor, after
-- add-admin-premium.sql (uses effective_plan). See supabase/schema.sql for
-- the canonical, fresh-install copy.
--
-- An event's link is /i/<slug>. Premium (and up) may choose their slug;
-- on lower plans the server generates it. Changing a slug never breaks a
-- link already shared: the old slug is kept as an alias that resolves to
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
