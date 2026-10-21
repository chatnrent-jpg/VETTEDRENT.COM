-- Subscription warning counts. One row per Stripe subscription.
-- agreement_id matches public.agreements.id, which is text.

create table if not exists public.subscription_warnings (
  subscription_id text primary key,
  warning_count integer not null default 0 check (warning_count >= 0),
  last_event_id text not null,
  agreement_id text references public.agreements (id) on delete set null,
  customer text,
  amount_due bigint,
  updated_at timestamptz not null default now()
);

alter table public.subscription_warnings enable row level security;

revoke all on table public.subscription_warnings from public, anon, authenticated;
grant select, insert, update on table public.subscription_warnings to service_role;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'subscription_warnings'
      and policyname = 'Allow service role full access'
  ) then
    create policy "Allow service role full access"
      on public.subscription_warnings
      for all
      to service_role
      using (true)
      with check (true);
  end if;
end $$;

-- Atomic add to agreements.vault_balance_cents.
-- agreements.id is text, and the balance column is bigint cents.
-- One UPDATE locks that row, so concurrent callers add in sequence.
-- This function is not idempotent per invoice. invoice.paid uses
-- credit_agreement_vault, which calls this once per invoice id.
create or replace function public.increment_vault_balance(
  target_agreement_id text,
  amount_cents bigint
) returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance bigint;
begin
  if target_agreement_id is null or length(trim(target_agreement_id)) = 0 then
    raise exception 'agreement_id is required';
  end if;
  if amount_cents is null or amount_cents < 0 then
    raise exception 'amount cents must be a non-negative integer';
  end if;

  update public.agreements
  set vault_balance_cents = coalesce(vault_balance_cents, 0) + amount_cents
  where id = target_agreement_id
  returning vault_balance_cents into v_balance;

  if not found then
    raise exception 'agreement not found';
  end if;

  return v_balance;
end;
$$;

revoke all on function public.increment_vault_balance(text, bigint) from public, anon, authenticated;
grant execute on function public.increment_vault_balance(text, bigint) to service_role;
