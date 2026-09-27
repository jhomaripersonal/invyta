-- Patch for an already-created project: admin portal + support inbox.
-- Run once in the Supabase dashboard's SQL Editor, after add-payments.sql.
-- See supabase/schema.sql for the canonical, fresh-install copy.
--
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
  resolved_at timestamptz
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
