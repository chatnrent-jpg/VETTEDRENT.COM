-- Corporate agency placements queued for the Stripe and Seam intake.
-- A placement has no agreement or Stripe event yet, so it does not use host_alerts.

create table if not exists public.corporate_placements (
  id text primary key,
  tenant_id text not null,
  agency_name text not null,
  worker_email text not null,
  worker_full_name text not null,
  contract_start_date date not null,
  contract_end_date date not null,
  weekly_stipend_cents bigint not null check (weekly_stipend_cents >= 0),
  underwriting_status text not null,
  created_at timestamptz not null default now(),
  constraint corporate_placements_dates_check check (contract_end_date >= contract_start_date),
  constraint corporate_placements_worker_contract_key unique (worker_email, contract_start_date, contract_end_date)
);

alter table public.corporate_placements enable row level security;

revoke all on table public.corporate_placements from public, anon, authenticated;
grant select, insert, update on table public.corporate_placements to service_role;
