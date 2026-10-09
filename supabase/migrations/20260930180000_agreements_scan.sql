-- Agreements a host can verify from a scanned code.
-- Reads go through the service role after the route confirms the caller is a host.

create table public.agreements (
  id text primary key,
  tenant_id text not null,
  status text not null check (status in ('active', 'warning', 'terminated')),
  tenant_name text
);

create index agreements_tenant_id_idx on public.agreements (tenant_id);

alter table public.agreements enable row level security;

revoke all on table public.agreements from public, anon, authenticated;
grant select on table public.agreements to service_role;
