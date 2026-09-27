-- Patch for an already-created project: lets a signed-in organizer delete
-- their own account (Data Privacy Act right to erasure — see the
-- compliance addendum §1–2). Run once in the Supabase dashboard's SQL
-- Editor. See supabase/schema.sql for the canonical, fresh-install copy.

-- Deleting the auth.users row cascades to everything keyed off it:
-- profiles, events (owner_id ... on delete cascade), and through events,
-- every guest row. Uploaded photos live in Storage, which can't be
-- deleted from SQL, so the app removes those first via the Storage API
-- (deleteAllUserImages in src/lib/storage.ts) before calling this.
--
-- When payments are added: payment records must survive this (5-year BIR
-- retention, addendum §2) — give that table `on delete set null` for the
-- user reference, not `on delete cascade`.
create or replace function public.delete_own_account()
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in.';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

revoke execute on function public.delete_own_account() from public, anon;
grant execute on function public.delete_own_account() to authenticated;
