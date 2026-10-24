-- Marketing & Growth Engine leads table across all 4 Purpose-Verified Stay cohorts.
create table if not exists public.marketing_leads (
  id uuid primary key default gen_random_uuid(),
  role text not null check (role in ('host', 'lodger', 'enterprise')),
  cohort text not null default 'Contract-Assignment' check (
    cohort in (
      'Contract-Assignment',
      'Academic-Enrollment',
      'Seasonal-Remote',
      'Insurance-Relocation',
      'Host-Property',
      'Enterprise-Partner'
    )
  ),
  full_name text,
  email text not null,
  phone text,
  jurisdiction_code text not null default 'MD-PG',
  weekly_rate_cents integer,
  intended_stay_days integer,
  agency_name text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  notes text,
  sms_status text,
  webhook_status text,
  created_at timestamptz not null default now()
);

alter table public.marketing_leads
  add column if not exists cohort text not null default 'Contract-Assignment';

alter table public.marketing_leads enable row level security;

revoke all on table public.marketing_leads from public, anon, authenticated;
grant select, insert, update on table public.marketing_leads to service_role;

notify pgrst, 'reload schema';
