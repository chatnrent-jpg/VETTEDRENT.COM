-- Per-listing availability. Replaces the shared per-room-type calendar for real listings.
--
-- Each listing keeps two lists of ISO dates ('YYYY-MM-DD'):
--   blocked_dates  days the host closed (owner-editable)
--   booked_dates   days taken by guest bookings (written only by reserve_listing_dates)
-- Guests see the union of both. Hosts can only edit blocked_dates, so a host can never
-- accidentally reopen a day a guest already booked.
--
-- Additive only. Safe to run more than once.

alter table public.listings
  add column if not exists blocked_dates text[] not null default '{}',
  add column if not exists booked_dates text[] not null default '{}';

alter table public.listings
  drop constraint if exists listings_availability_size_check;
alter table public.listings
  add constraint listings_availability_size_check
  check (cardinality(blocked_dates) <= 1000 and cardinality(booked_dates) <= 1000);

-- Atomically reserve days for a guest on a published listing.
-- Locks the listing row, refuses when any requested day is already blocked or booked,
-- and drops past days so the lists stay small. Returns 'reserved', 'conflict', or 'not_found'.
create or replace function public.reserve_listing_dates(p_listing_id text, p_dates text[])
returns text
language plpgsql
as $$
declare
  v_blocked text[];
  v_booked text[];
  v_today text := to_char((now() at time zone 'utc')::date, 'YYYY-MM-DD');
begin
  if p_dates is null or cardinality(p_dates) = 0 or cardinality(p_dates) > 90 then
    return 'conflict';
  end if;

  select blocked_dates, booked_dates
    into v_blocked, v_booked
    from public.listings
   where id = p_listing_id and is_published
   for update;

  if not found then
    return 'not_found';
  end if;

  if exists (
    select 1 from unnest(p_dates) d
     where d = any (v_blocked) or d = any (v_booked)
  ) then
    return 'conflict';
  end if;

  update public.listings
     set booked_dates = array(
           select distinct d
             from unnest(v_booked || p_dates) d
            where d >= v_today
            order by d
         )
   where id = p_listing_id;

  return 'reserved';
end;
$$;

revoke all on function public.reserve_listing_dates(text, text[]) from public, anon, authenticated;
grant execute on function public.reserve_listing_dates(text, text[]) to service_role;

-- Rollback (run manually if this must be undone):
--
-- drop function if exists public.reserve_listing_dates(text, text[]);
-- alter table public.listings drop constraint if exists listings_availability_size_check;
-- alter table public.listings drop column if exists blocked_dates, drop column if exists booked_dates;
