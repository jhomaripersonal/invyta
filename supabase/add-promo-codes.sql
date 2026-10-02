-- Patch for an already-created project: promo codes that give an account
-- one free upgraded invitation (for the test launch). Run once in the
-- Supabase dashboard's SQL Editor, after add-priority-support.sql. See
-- supabase/schema.sql for the canonical, fresh-install copy. Safe to run
-- again, including over the earlier single-use draft of this patch.
--
-- How it works: a code can be shared (e.g. one code for the first 20
-- testers — max_redemptions = 20). Entering it gives that account ONE
-- credit for the code's plan; each account can redeem only one code. The
-- organizer then spends the credit on the invitation of their choice.
-- Using it is recorded as a ₱0 paid payment (provider 'promo'), so it
-- shows on Billing and in the admin payments list without counting as
-- revenue.
--
-- Create a code (SQL Editor):
--   insert into public.promo_codes (code, plan, max_redemptions, note, expires_at)
--   values ('INVYTA-BETA', 'pro', 20, 'Test launch', '2026-12-31');
-- See who redeemed it and where they used it:
--   select r.redeemed_at, u.email, r.used_at, e.name as event
--   from public.promo_redemptions r
--   left join auth.users u on u.id = r.user_id
--   left join public.events e on e.id = r.event_id
--   where r.code = 'INVYTA-BETA' order by r.redeemed_at;

-- Promo upgrades are ₱0 payments.
alter table public.payments drop constraint if exists payments_amount_centavos_check;
alter table public.payments add constraint payments_amount_centavos_check
  check (amount_centavos > 0 or (amount_centavos = 0 and provider = 'promo'));

-- No RLS policies: only the service role (the redeem-promo Edge Function)
-- and the SQL Editor can read or write codes, so they can't be listed
-- from the browser.
create table if not exists public.promo_codes (
  code text primary key check (code = upper(code) and length(code) between 4 and 64),
  plan text not null check (plan in ('premium', 'pro')),
  -- How many accounts can redeem it (one credit each).
  max_redemptions int not null default 1 check (max_redemptions > 0),
  note text,
  active boolean not null default true,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

-- From the earlier single-use draft of this patch.
drop function if exists public.redeem_promo_code(text, uuid, text, uuid);
drop index if exists public.promo_codes_redeemed_by_idx;
alter table public.promo_codes
  drop column if exists assigned_email,
  drop column if exists redeemed_by,
  drop column if exists redeemed_event_id,
  drop column if exists redeemed_at;
alter table public.promo_codes
  add column if not exists max_redemptions int not null default 1 check (max_redemptions > 0);

alter table public.promo_codes enable row level security;

-- One row per account that redeemed a code: its credit. Unused while
-- used_at is null; event_id is the invitation it was spent on.
create table if not exists public.promo_redemptions (
  id uuid primary key default gen_random_uuid(),
  code text not null references public.promo_codes (code),
  user_id uuid references auth.users (id) on delete set null,
  plan text not null check (plan in ('premium', 'pro')),
  event_id uuid references public.events (id) on delete set null,
  redeemed_at timestamptz not null default now(),
  used_at timestamptz
);

-- One code per account.
create unique index if not exists promo_redemptions_user_id_idx on public.promo_redemptions (user_id);
create index if not exists promo_redemptions_code_idx on public.promo_redemptions (code);

alter table public.promo_redemptions enable row level security;

drop policy if exists "read own promo redemptions" on public.promo_redemptions;
create policy "read own promo redemptions"
  on public.promo_redemptions for select
  using (auth.uid() = user_id);

-- Redeems a code for an account: checks it and gives the account its
-- credit. Returns { status, plan? } — 'ok', or why it was refused
-- ('invalid', 'expired', 'full', 'already_redeemed'). Called only by the
-- redeem-promo Edge Function (service role), which has already verified
-- who the user is.
create or replace function public.redeem_promo_code(p_code text, p_user_id uuid)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v public.promo_codes%rowtype;
begin
  if exists (select 1 from public.promo_redemptions where user_id = p_user_id) then
    return jsonb_build_object('status', 'already_redeemed');
  end if;
  -- Locks the code, so two people can't take the last spot at once.
  select * into v from public.promo_codes where code = upper(trim(p_code)) for update;
  if not found or not v.active then
    return jsonb_build_object('status', 'invalid');
  end if;
  if v.expires_at is not null and v.expires_at < now() then
    return jsonb_build_object('status', 'expired');
  end if;
  if (select count(*) from public.promo_redemptions where code = v.code) >= v.max_redemptions then
    return jsonb_build_object('status', 'full');
  end if;

  begin
    insert into public.promo_redemptions (code, user_id, plan) values (v.code, p_user_id, v.plan);
  exception when unique_violation then
    return jsonb_build_object('status', 'already_redeemed');
  end;
  return jsonb_build_object('status', 'ok', 'plan', v.plan);
end;
$$;

revoke execute on function public.redeem_promo_code(text, uuid) from public, anon, authenticated;
grant execute on function public.redeem_promo_code(text, uuid) to service_role;

-- Spends an account's unused credit on one of its events, in one
-- transaction: marks the credit used, records a ₱0 payment and upgrades
-- the event. Returns { status, plan? } — 'ok', or 'no_credit',
-- 'event_not_found', 'already_has_plan'. Service role only, like above.
create or replace function public.use_promo_credit(p_user_id uuid, p_event_id uuid)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v public.promo_redemptions%rowtype;
  v_event public.events%rowtype;
begin
  select * into v from public.promo_redemptions where user_id = p_user_id and used_at is null for update;
  if not found then
    return jsonb_build_object('status', 'no_credit');
  end if;
  select * into v_event from public.events where id = p_event_id and owner_id = p_user_id for update;
  if not found then
    return jsonb_build_object('status', 'event_not_found');
  end if;
  if public.plan_at_least(v_event.owner_plan, v.plan) then
    return jsonb_build_object('status', 'already_has_plan', 'plan', v.plan);
  end if;

  update public.promo_redemptions set used_at = now(), event_id = v_event.id where id = v.id;

  insert into public.payments (user_id, event_id, plan, amount_centavos, description, status, provider, provider_payment_id, payment_method, paid_at)
  values (
    p_user_id, v_event.id, v.plan, 0,
    'Invyta ' || case v.plan when 'pro' then 'Pro' else 'Premium' end || ' — ' || v_event.name || ' (promo code)',
    'paid', 'promo', v.code, 'promo', now()
  );

  update public.events set plan = v.plan
    where id = v_event.id and not public.plan_at_least(plan, v.plan);

  return jsonb_build_object('status', 'ok', 'plan', v.plan);
end;
$$;

revoke execute on function public.use_promo_credit(uuid, uuid) from public, anon, authenticated;
grant execute on function public.use_promo_credit(uuid, uuid) to service_role;
