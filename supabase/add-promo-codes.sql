-- Patch for an already-created project: single-use promo codes that
-- upgrade one event for free (for the test launch). Run once in the
-- Supabase dashboard's SQL Editor, after add-priority-support.sql. See
-- supabase/schema.sql for the canonical, fresh-install copy.
--
-- Each code is good for ONE person and ONE event: the first redemption
-- uses it up. A code can also be locked to one email address, and each
-- account can redeem only one code. Redemptions are recorded as ₱0 paid
-- payments (provider 'promo'), so they show on the organizer's Billing
-- and in the admin payments list without counting as revenue.
--
-- Codes are created by hand in the SQL Editor, e.g.:
--   insert into public.promo_codes (code, plan, assigned_email, note, expires_at)
--   values ('BETA-ANNA-7K2Q', 'pro', 'anna@example.com', 'Beta tester: Anna', '2026-12-31');
-- See who used what:
--   select code, plan, assigned_email, redeemed_at, redeemed_by, redeemed_event_id from public.promo_codes order by created_at;

-- Promo redemptions are ₱0 payments.
alter table public.payments drop constraint if exists payments_amount_centavos_check;
alter table public.payments add constraint payments_amount_centavos_check
  check (amount_centavos > 0 or (amount_centavos = 0 and provider = 'promo'));

-- No RLS policies: only the service role (the redeem-promo Edge Function)
-- and the SQL Editor can read or write codes, so they can't be listed or
-- guessed from the browser.
create table if not exists public.promo_codes (
  code text primary key check (code = upper(code) and length(code) between 4 and 64),
  plan text not null check (plan in ('premium', 'pro')),
  -- Optional: only the account with this email can redeem the code.
  assigned_email text,
  note text,
  active boolean not null default true,
  expires_at timestamptz,
  redeemed_by uuid references auth.users (id) on delete set null,
  redeemed_event_id uuid references public.events (id) on delete set null,
  redeemed_at timestamptz,
  created_at timestamptz not null default now()
);

-- One code per account.
create unique index if not exists promo_codes_redeemed_by_idx on public.promo_codes (redeemed_by);

alter table public.promo_codes enable row level security;

-- Redeems a code for one of the user's events, in one transaction: checks
-- the code and the event, uses up the code, records a ₱0 payment and
-- upgrades the event. Returns { status, plan? } — status is 'ok' or why it
-- was refused ('invalid', 'used', 'expired', 'not_yours',
-- 'already_redeemed', 'event_not_found', 'already_has_plan'). Called only
-- by the redeem-promo Edge Function (service role), which has already
-- verified who the user is.
create or replace function public.redeem_promo_code(p_code text, p_user_id uuid, p_user_email text, p_event_id uuid)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v public.promo_codes%rowtype;
  v_event public.events%rowtype;
begin
  select * into v from public.promo_codes where code = upper(trim(p_code)) for update;
  if not found or not v.active then
    return jsonb_build_object('status', 'invalid');
  end if;
  if v.redeemed_at is not null then
    return jsonb_build_object('status', 'used');
  end if;
  if v.expires_at is not null and v.expires_at < now() then
    return jsonb_build_object('status', 'expired');
  end if;
  if v.assigned_email is not null and lower(trim(v.assigned_email)) is distinct from lower(trim(p_user_email)) then
    return jsonb_build_object('status', 'not_yours');
  end if;
  if exists (select 1 from public.promo_codes where redeemed_by = p_user_id) then
    return jsonb_build_object('status', 'already_redeemed');
  end if;

  select * into v_event from public.events where id = p_event_id and owner_id = p_user_id for update;
  if not found then
    return jsonb_build_object('status', 'event_not_found');
  end if;
  if public.plan_at_least(v_event.owner_plan, v.plan) then
    return jsonb_build_object('status', 'already_has_plan', 'plan', v.plan);
  end if;

  update public.promo_codes
    set redeemed_by = p_user_id, redeemed_event_id = v_event.id, redeemed_at = now()
    where code = v.code;

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

revoke execute on function public.redeem_promo_code(text, uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.redeem_promo_code(text, uuid, text, uuid) to service_role;
