-- Sovereign risk state for a bounced weekly charge.
-- Adds missing columns only. Does not drop existing columns.

alter table public.agreements
  add column if not exists payment_status text not null default 'current',
  add column if not exists risk_level text not null default 'clear',
  add column if not exists last_failed_payment_at timestamptz,
  add column if not exists stripe_subscription_id text,
  add column if not exists seam_access_code_id text;

create index if not exists agreements_stripe_subscription_id_idx
  on public.agreements (stripe_subscription_id);

create table if not exists public.platform_ledger (
  id bigint generated always as identity primary key,
  stripe_event_id text not null unique,
  agreement_id text not null,
  amount_cents bigint not null check (amount_cents >= 0),
  type text not null,
  description text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.host_alerts (
  id bigint generated always as identity primary key,
  stripe_event_id text not null unique,
  host_id text,
  agreement_id text not null,
  severity text not null,
  message text not null,
  created_at timestamptz not null default now()
);

alter table public.platform_ledger enable row level security;
alter table public.host_alerts enable row level security;

revoke all on table public.platform_ledger from public, anon, authenticated;
revoke all on table public.host_alerts from public, anon, authenticated;

grant select, insert on table public.platform_ledger to service_role;
grant select, insert on table public.host_alerts to service_role;
