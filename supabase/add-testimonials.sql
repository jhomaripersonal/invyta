-- Patch for an already-created project: user-submitted testimonials with
-- admin approval. Run once in the Supabase dashboard's SQL Editor, after
-- add-admin.sql (uses is_admin). See supabase/schema.sql for the
-- canonical, fresh-install copy.

-- One testimonial per organizer. Shown on the landing page only after an
-- admin approves it, and only with the display name and event line the
-- organizer chose — with their explicit consent recorded. Editing it sends
-- it back for review; deleting it (or the account) withdraws it.
create table if not exists public.testimonials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 60),
  event_label text check (event_label is null or char_length(event_label) <= 80),
  quote text not null check (char_length(quote) between 10 and 400),
  rating smallint check (rating is null or rating between 1 and 5),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  consented_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  approved_at timestamptz
);

create index if not exists testimonials_status_idx on public.testimonials (status, approved_at desc);

alter table public.testimonials enable row level security;

drop policy if exists "owner or admin can read testimonial" on public.testimonials;
create policy "owner or admin can read testimonial"
  on public.testimonials for select
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists "signed-in users can submit a testimonial" on public.testimonials;
create policy "signed-in users can submit a testimonial"
  on public.testimonials for insert
  with check (auth.uid() is not null);

drop policy if exists "owner or admin can update testimonial" on public.testimonials;
create policy "owner or admin can update testimonial"
  on public.testimonials for update
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists "owner or admin can delete testimonial" on public.testimonials;
create policy "owner or admin can delete testimonial"
  on public.testimonials for delete
  using (user_id = auth.uid() or public.is_admin());

-- Submitting: always as yourself, only once you've created an event (so
-- testimonials come from people who've actually used Invyta), always
-- starting in review, with consent stamped now.
-- Editing: an owner's edit to the words, name or rating sends it back to
-- review; only an admin can change the status (approve/reject/unpublish).
create or replace function public.prepare_testimonial()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is null then
      raise exception 'Please sign in to share a testimonial.';
    end if;
    new.user_id := auth.uid();
    if not exists (select 1 from public.events where owner_id = new.user_id) then
      raise exception 'Create an event before sharing a testimonial.' using errcode = 'check_violation';
    end if;
    new.status := 'pending';
    new.consented_at := now();
    new.created_at := now();
    new.approved_at := null;
  else
    new.user_id := old.user_id;
    new.created_at := old.created_at;
    if public.is_admin() then
      if new.status = 'approved' and old.status is distinct from 'approved' then
        new.approved_at := now();
      elsif new.status <> 'approved' then
        new.approved_at := null;
      end if;
    else
      new.status := old.status;
      new.approved_at := old.approved_at;
      if (new.quote, new.display_name, new.event_label, new.rating) is distinct from (old.quote, old.display_name, old.event_label, old.rating) then
        new.status := 'pending';
        new.approved_at := null;
        new.consented_at := now();
      end if;
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists testimonials_prepare on public.testimonials;
create trigger testimonials_prepare
  before insert or update on public.testimonials
  for each row execute procedure public.prepare_testimonial();

-- What the public landing page may see: approved testimonials, and only
-- the fields the organizer chose to show — never user ids or emails.
create or replace function public.approved_testimonials(p_limit int default 6)
returns table (
  id uuid,
  display_name text,
  event_label text,
  quote text,
  rating smallint,
  approved_at timestamptz
)
language sql
stable
security definer set search_path = public
as $$
  select t.id, t.display_name, t.event_label, t.quote, t.rating, t.approved_at
  from public.testimonials t
  where t.status = 'approved'
  order by t.approved_at desc
  limit least(greatest(p_limit, 1), 12);
$$;

grant execute on function public.approved_testimonials(int) to anon, authenticated;
