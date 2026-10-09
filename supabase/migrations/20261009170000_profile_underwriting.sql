-- Lodger and host profiles. id matches auth.users.id.
-- Creates the table when this project has no profile table yet.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text,
  role text,
  payer_key text,
  stripe_customer_id text,
  customer_id text,
  underwriting_approved boolean,
  calculated_monthly_inflow_cents bigint,
  underwriting_checked_at timestamptz,
  constraint profiles_monthly_inflow_check check (
    calculated_monthly_inflow_cents is null or calculated_monthly_inflow_cents >= 0
  )
);

create unique index if not exists profiles_email_key on public.profiles (email);

alter table public.profiles
  add column if not exists email text,
  add column if not exists full_name text,
  add column if not exists role text,
  add column if not exists payer_key text,
  add column if not exists stripe_customer_id text,
  add column if not exists customer_id text,
  add column if not exists underwriting_approved boolean,
  add column if not exists calculated_monthly_inflow_cents bigint,
  add column if not exists underwriting_checked_at timestamptz;

alter table public.profiles enable row level security;

revoke all on table public.profiles from public, anon;
grant select on table public.profiles to authenticated;
grant select, insert, update on table public.profiles to service_role;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own
  on public.profiles
  for select
  to authenticated
  using (id = auth.uid());
