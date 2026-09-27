-- Patch for an already-created project: adds a public Storage bucket for
-- Invitation Builder image uploads (Cover photo, Gallery), replacing the
-- "paste a URL" placeholder with real file upload. Run once in the
-- Supabase dashboard's SQL Editor. See supabase/schema.sql for the
-- canonical, fresh-install copy of this same block.
--
-- Path convention: every object lives at "<uploader's auth.uid()>/<eventId>/
-- <random>.<ext>" — the policies below key off that first path segment, not
-- a lookup against the events table, so they stay simple and fast. The
-- bucket is public because guests view these images anonymously on the
-- published invitation page; only insert/update/delete are access-controlled.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('invitation-images', 'invitation-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "anyone can view invitation images"
on storage.objects for select
using (bucket_id = 'invitation-images');

create policy "owner can upload their own invitation images"
on storage.objects for insert
with check (
  bucket_id = 'invitation-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "owner can update their own invitation images"
on storage.objects for update
using (
  bucket_id = 'invitation-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "owner can delete their own invitation images"
on storage.objects for delete
using (
  bucket_id = 'invitation-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);
