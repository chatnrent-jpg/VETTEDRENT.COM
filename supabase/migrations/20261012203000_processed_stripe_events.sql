-- Processed Stripe event ids. The primary key is the Stripe event id.
-- A duplicate insert is the cross-restart dedupe.

create table if not exists public.processed_stripe_events (
  id text primary key,
  event_type text not null,
  processed_at timestamptz not null default now()
);

alter table public.processed_stripe_events enable row level security;

revoke all on table public.processed_stripe_events from public, anon, authenticated;
grant select, insert on table public.processed_stripe_events to service_role;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'processed_stripe_events'
      and policyname = 'Allow service role full access'
  ) then
    create policy "Allow service role full access"
      on public.processed_stripe_events
      for all
      to service_role
      using (true)
      with check (true);
  end if;
end $$;
