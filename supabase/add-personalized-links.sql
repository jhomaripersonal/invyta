-- Patch for an already-created project: adds the two RPC functions behind
-- personalized invitation links (spec §21). Run once in the Supabase
-- dashboard's SQL Editor. See supabase/schema.sql for the canonical,
-- fresh-install copy of this same block plus the reasoning comment.

create function public.get_guest_public(p_guest_id uuid)
returns table (
  id uuid,
  event_id uuid,
  name text,
  rsvp_status text,
  number_of_guests int,
  meal_preference text,
  message text,
  checked_in boolean
)
language sql
security definer set search_path = public
stable
as $$
  select g.id, g.event_id, g.name, g.rsvp_status, g.number_of_guests, g.meal_preference, g.message, g.checked_in
  from public.guests g
  join public.events e on e.id = g.event_id
  where g.id = p_guest_id and e.status = 'published';
$$;

create function public.update_guest_rsvp(
  p_guest_id uuid,
  p_name text,
  p_attending boolean,
  p_number_of_guests int,
  p_meal_preference text,
  p_message text
)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  update public.guests g set
    name = p_name,
    rsvp_status = case when p_attending then 'confirmed' else 'declined' end,
    number_of_guests = case when p_attending then greatest(1, p_number_of_guests) else 0 end,
    meal_preference = p_meal_preference,
    message = p_message,
    submitted_at = now()
  from public.events e
  where g.id = p_guest_id and e.id = g.event_id and e.status = 'published';
end;
$$;
