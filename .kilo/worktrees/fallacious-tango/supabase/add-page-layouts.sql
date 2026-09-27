-- Patch for an already-created project: reserves the Premium page
-- layouts (Story, Editorial, Split) and cover styles (Side by side,
-- Monogram) for Premium and up. Run once in the Supabase dashboard's SQL
-- Editor, after add-free-plan-limits.sql (it uses plan_at_least from that
-- patch). See supabase/schema.sql for the canonical, fresh-install copy.

-- Mirrors the `premium: true` entries in src/data/page-layouts.ts. A
-- missing layout/style means the free defaults (classic, full photo), so
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
      where s ->> 'type' = 'cover'
        and coalesce(s -> 'content' ->> 'style', 'full') not in ('full', 'framed')
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
  select plan into v_plan from public.profiles where id = new.owner_id;
  if not public.plan_at_least(v_plan, 'premium') then
    raise exception 'Premium page layouts and cover styles require the Premium plan.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists events_enforce_design_style on public.events;
create trigger events_enforce_design_style
  before insert or update of invitation on public.events
  for each row execute procedure public.enforce_design_style();
