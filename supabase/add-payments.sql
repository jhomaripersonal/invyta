-- Patch for an already-created project: per-event billing with PayMongo.
-- Run once in the Supabase dashboard's SQL Editor, after every earlier
-- patch (add-free-plan-limits, add-gallery-styles, add-account-deletion,
-- add-page-layouts, add-section-styles). See supabase/schema.sql for the
-- canonical, fresh-install copy.
--
-- What changes: each event gets its own purchased `plan`; events.owner_plan
-- becomes the event's *effective* plan (the higher of that and the
-- account plan); every plan check reads the effective plan; and a
-- `payments` table + mark_payment_paid() record and apply upgrades.

alter table public.events
  add column if not exists plan text not null default 'free'
    check (plan in ('free', 'premium', 'pro', 'event_planner'));

-- ─── plan helpers ───────────────────────────────────────────────────────
create or replace function public.plan_max(p_a text, p_b text)
returns text
language sql
immutable
as $$
  select case when public.plan_at_least(p_a, coalesce(p_b, 'free')) then coalesce(p_a, 'free') else p_b end;
$$;

create or replace function public.effective_plan(p_owner_id uuid, p_event_plan text)
returns text
language sql
stable
security definer set search_path = public
as $$
  select public.plan_max(coalesce((select plan from public.profiles where id = p_owner_id), 'free'), coalesce(p_event_plan, 'free'));
$$;

revoke execute on function public.effective_plan(uuid, text) from public, anon, authenticated;

create or replace function public.event_owner_plan(p_event_id uuid)
returns text
language sql
stable
security definer set search_path = public
as $$
  select public.effective_plan(e.owner_id, e.plan) from public.events e where e.id = p_event_id;
$$;

revoke execute on function public.event_owner_plan(uuid) from public, anon, authenticated;

-- ─── protect events.plan ────────────────────────────────────────────────
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

-- ─── owner_plan = effective plan ────────────────────────────────────────
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

-- ─── plan checks read the event's effective plan ────────────────────────
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

-- Recompute every event's effective plan once.
update public.events set owner_plan = owner_plan;

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
