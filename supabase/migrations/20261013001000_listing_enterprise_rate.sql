-- Listing fields the enterprise placement route reads when the agency
-- does not send a weekly rate, a lock id, a host id, or a Connect account.
-- seam_device_id and host_id already exist. These two are new.

alter table public.listings
  add column if not exists weekly_price_cents bigint,
  add column if not exists stripe_host_account_id text;

alter table public.listings
  drop constraint if exists listings_weekly_price_cents_check;

alter table public.listings
  add constraint listings_weekly_price_cents_check
  check (weekly_price_cents is null or weekly_price_cents > 0);
