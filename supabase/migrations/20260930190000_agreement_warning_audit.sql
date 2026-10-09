-- Warning tiers and Seam deactivation audit.
-- Adds missing columns only. Does not drop existing columns.
-- Existing agreement statuses active, warning, and terminated stay valid.

alter table public.agreements
  add column if not exists warning_count integer not null default 0,
  add column if not exists listing_id text;

do $$
declare
  status_check name;
begin
  for status_check in
    select con.conname
    from pg_constraint as con
    join pg_class as rel on rel.oid = con.conrelid
    join pg_namespace as nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'agreements'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%status%'
  loop
    execute format('alter table public.agreements drop constraint %I', status_check);
  end loop;
end $$;

alter table public.agreements
  add constraint agreements_status_check
  check (status in ('active', 'warning', 'warning_1', 'warning_2', 'terminated'));

alter table public.agreements
  drop constraint if exists agreements_warning_count_check;

alter table public.agreements
  add constraint agreements_warning_count_check
  check (warning_count >= 0);

create table if not exists public.listings (
  id text primary key
);

alter table public.listings
  add column if not exists seam_device_id text;

create table if not exists public.agreement_deactivation_audits (
  agreement_id text not null,
  seam_device_id text,
  action text not null,
  created_at timestamptz not null default now()
);

alter table public.listings enable row level security;
alter table public.agreement_deactivation_audits enable row level security;

revoke all on table public.listings from public, anon, authenticated;
revoke all on table public.agreement_deactivation_audits from public, anon, authenticated;

grant select on table public.listings to service_role;
grant insert on table public.agreement_deactivation_audits to service_role;
grant update on table public.agreements to service_role;
