-- Patch for an already-created project: reserves the Premium gallery
-- layouts (Featured, Slideshow, Polaroid) and photo filters for Premium and
-- up. Run once in the Supabase dashboard's SQL Editor, after
-- add-free-plan-limits.sql (it uses plan_at_least from that patch). See
-- supabase/schema.sql for the canonical, fresh-install copy of this block.

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
  select plan into v_plan from public.profiles where id = new.owner_id;
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
