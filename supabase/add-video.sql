-- Patch for an already-created project: the Video section is Pro-only.
-- Run once in the Supabase dashboard's SQL Editor, after
-- add-custom-links.sql. See supabase/schema.sql for the canonical copy.
--
-- The Video section embeds YouTube/Vimeo/Facebook links (src/lib/video-
-- embed.ts); nothing is uploaded or stored besides the links.

-- Whether an invitation shows videos: an enabled Video section with at
-- least one non-empty link. (Which links are valid is decided in the app,
-- which only ever embeds links it can parse.)
create or replace function public.invitation_uses_video(p_invitation jsonb)
returns boolean
language sql
immutable
as $$
  select exists (
    select 1
    from jsonb_array_elements(
      case when jsonb_typeof(p_invitation -> 'sections') = 'array' then p_invitation -> 'sections' else '[]'::jsonb end
    ) s
    where s ->> 'type' = 'video'
      and coalesce((s ->> 'enabled')::boolean, false)
      and exists (
        select 1
        from jsonb_array_elements(
          case when jsonb_typeof(s -> 'content' -> 'videos') = 'array' then s -> 'content' -> 'videos' else '[]'::jsonb end
        ) v
        where coalesce(trim(v ->> 'url'), '') <> ''
      )
  );
$$;

-- Only rejects *starting* to show videos below Pro, so an event that
-- already has them (e.g. its owner stopped being an admin) stays editable.
create or replace function public.enforce_video_plan()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.invitation_uses_video(new.invitation)
     or (tg_op = 'UPDATE' and public.invitation_uses_video(old.invitation)) then
    return new;
  end if;
  if not public.plan_at_least(public.effective_plan(new.owner_id, new.plan), 'pro') then
    raise exception 'Videos require the Pro plan.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists events_enforce_video_plan on public.events;
create trigger events_enforce_video_plan
  before insert or update of invitation on public.events
  for each row execute procedure public.enforce_video_plan();
