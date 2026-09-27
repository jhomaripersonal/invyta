-- Patch for an already-created project: background music on invitations
-- (Pro). Run once in the Supabase dashboard's SQL Editor, after
-- add-guest-tools.sql. See supabase/schema.sql for the canonical copy.
--
-- The organizer uploads one audio file; the invitation keeps its URL in
-- invitation.music.url. Guests' browsers only start it after a tap (no
-- autoplay with sound), and it can be paused any time.

-- Public, like invitation-images: guests play it anonymously. Same folder
-- rule for writes: "<uid>/<eventId>/<random>.<ext>".
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('invitation-audio', 'invitation-audio', true, 10485760, array['audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/ogg'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "anyone can play invitation audio" on storage.objects;
create policy "anyone can play invitation audio"
on storage.objects for select
using (bucket_id = 'invitation-audio');

drop policy if exists "owner can upload their own invitation audio" on storage.objects;
create policy "owner can upload their own invitation audio"
on storage.objects for insert
with check (
  bucket_id = 'invitation-audio'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "owner can update their own invitation audio" on storage.objects;
create policy "owner can update their own invitation audio"
on storage.objects for update
using (
  bucket_id = 'invitation-audio'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "owner can delete their own invitation audio" on storage.objects;
create policy "owner can delete their own invitation audio"
on storage.objects for delete
using (
  bucket_id = 'invitation-audio'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create or replace function public.invitation_uses_music(p_invitation jsonb)
returns boolean
language sql
immutable
as $$
  select jsonb_typeof(p_invitation -> 'music') = 'object'
    and coalesce(trim(p_invitation -> 'music' ->> 'url'), '') <> '';
$$;

-- Like the Video rule: only *starting* to use music needs Pro.
create or replace function public.enforce_music_plan()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.invitation_uses_music(new.invitation)
     or (tg_op = 'UPDATE' and public.invitation_uses_music(old.invitation)) then
    return new;
  end if;
  if not public.plan_at_least(public.effective_plan(new.owner_id, new.plan), 'pro') then
    raise exception 'Background music requires the Pro plan.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists events_enforce_music_plan on public.events;
create trigger events_enforce_music_plan
  before insert or update of invitation on public.events
  for each row execute procedure public.enforce_music_plan();
