-- Idempotent agreement escrow cache. One row per Stripe invoice.
-- agreements.vault_balance_cents stays aligned with the 14.3% vault share
-- already stored on vault_ledgers. A replay of the same invoice does not add twice.

create table if not exists public.agreement_vault_invoice_credits (
  invoice_id text primary key,
  agreement_id text not null references public.agreements (id) on delete restrict,
  vault_cents bigint not null check (vault_cents >= 0),
  credited_at timestamptz not null default now()
);

alter table public.agreement_vault_invoice_credits enable row level security;

revoke all on table public.agreement_vault_invoice_credits from public, anon, authenticated;
grant select, insert on table public.agreement_vault_invoice_credits to service_role;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'agreement_vault_invoice_credits'
      and policyname = 'Allow service role full access'
  ) then
    create policy "Allow service role full access"
      on public.agreement_vault_invoice_credits
      for all
      to service_role
      using (true)
      with check (true);
  end if;
end $$;

create or replace function public.credit_agreement_vault(
  p_agreement_id text,
  p_invoice_id text,
  p_vault_cents bigint
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance bigint;
  v_inserted integer;
begin
  if p_agreement_id is null or length(trim(p_agreement_id)) = 0 then
    raise exception 'agreement_id is required';
  end if;
  if p_invoice_id is null or length(trim(p_invoice_id)) = 0 then
    raise exception 'invoice_id is required';
  end if;
  if p_vault_cents is null or p_vault_cents < 0 then
    raise exception 'vault cents must be a non-negative integer';
  end if;

  select vault_balance_cents
    into v_balance
  from public.agreements
  where id = p_agreement_id
  for update;

  if not found then
    raise exception 'agreement not found';
  end if;

  insert into public.agreement_vault_invoice_credits (invoice_id, agreement_id, vault_cents)
  values (p_invoice_id, p_agreement_id, p_vault_cents)
  on conflict (invoice_id) do nothing;

  get diagnostics v_inserted = row_count;

  if v_inserted = 0 then
    select coalesce(vault_balance_cents, 0)
      into v_balance
    from public.agreements
    where id = p_agreement_id;

    return jsonb_build_object(
      'already_credited', true,
      'vault_balance_cents', v_balance
    );
  end if;

  v_balance := public.increment_vault_balance(p_agreement_id, p_vault_cents);

  return jsonb_build_object(
    'already_credited', false,
    'vault_balance_cents', v_balance
  );
end;
$$;

revoke all on function public.credit_agreement_vault(text, text, bigint) from public, anon, authenticated;
grant execute on function public.credit_agreement_vault(text, text, bigint) to service_role;
