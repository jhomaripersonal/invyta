-- Patch for an already-created project: caps Gallery photos per plan.
-- Run once in the Supabase dashboard's SQL Editor. See supabase/schema.sql
-- for the canonical, fresh-install copy of this same block.

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
