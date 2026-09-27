-- Patch for an already-created project: extends the Premium design check
-- to per-section styles (Schedule "cards", Venue "photo"/"map", Story
-- "photo"). Run once in the Supabase dashboard's SQL Editor, after
-- add-page-layouts.sql (this replaces the function that patch created).
-- See supabase/schema.sql for the canonical, fresh-install copy.

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

-- Same trigger function as before, with a message that covers every kind
-- of Premium design option rather than only layouts and covers.
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
    raise exception 'Premium layouts and styles require the Premium plan.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
