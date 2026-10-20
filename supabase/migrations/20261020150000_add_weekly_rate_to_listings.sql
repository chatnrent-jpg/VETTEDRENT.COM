-- Property-specific weekly rate, in integer cents.
-- Adds missing columns only. Does not drop existing columns.
-- 24500 cents is $245.00, the previous host dashboard baseline.

alter table public.listings
  add column if not exists weekly_rate_cents integer not null default 24500;

alter table public.listings
  drop constraint if exists listings_weekly_rate_cents_check;

alter table public.listings
  add constraint listings_weekly_rate_cents_check
  check (weekly_rate_cents > 0);
