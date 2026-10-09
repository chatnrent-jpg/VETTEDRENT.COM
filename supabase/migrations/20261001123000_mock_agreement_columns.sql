-- Columns named by the mock warning agreement seed.
-- Adds missing columns only. Does not drop existing columns.

alter table public.listings
  add column if not exists title text,
  add column if not exists host_id text;

alter table public.agreements
  add column if not exists host_id text,
  add column if not exists vault_balance_cents bigint;
