-- Patch for an already-created project: priority support for Pro. Run once
-- in the Supabase dashboard's SQL Editor, after add-background-music.sql.
-- See supabase/schema.sql for the canonical copy.
--
-- A request from a signed-in organizer with a Pro account or at least one
-- Pro event is flagged `priority`; the admin inbox lists those first.

alter table public.support_requests add column if not exists priority boolean not null default false;

create or replace function public.prepare_support_request()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  new.user_id := auth.uid();
  new.status := 'open';
  new.admin_note := null;
  new.resolved_at := null;
  new.created_at := now();
  new.updated_at := now();
  new.email := lower(trim(new.email));
  new.priority := auth.uid() is not null and (
    public.plan_at_least((select plan from public.profiles where id = auth.uid()), 'pro')
    or exists (select 1 from public.events where owner_id = auth.uid() and public.plan_at_least(owner_plan, 'pro'))
  );
  if (select count(*) from public.support_requests
      where email = new.email and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'Too many requests from this email address. Please try again in an hour.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
