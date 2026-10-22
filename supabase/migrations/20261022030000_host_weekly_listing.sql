-- Weekly rate for a host listing, plus the first listing for the host account.
-- seam_device_id stays empty until a physical lock is paired.
-- 24500 cents is the $245 weekly rate.

alter table public.listings
  add column if not exists weekly_price_cents integer;

alter table public.listings
  drop constraint if exists listings_weekly_price_cents_check;

alter table public.listings
  add constraint listings_weekly_price_cents_check
  check (weekly_price_cents is null or weekly_price_cents > 0);

insert into public.listings (id, title, host_id, seam_device_id, weekly_price_cents)
select
  'vr-weekly-room',
  'VettedRent Weekly Room',
  users.id::text,
  null,
  24500
from auth.users
where lower(users.email) = 'chatnrent@gmail.com'
on conflict (id) do update
set
  title = excluded.title,
  host_id = excluded.host_id,
  weekly_price_cents = excluded.weekly_price_cents;

update public.agreements
set listing_id = 'vr-weekly-room'
where listing_id is null;
