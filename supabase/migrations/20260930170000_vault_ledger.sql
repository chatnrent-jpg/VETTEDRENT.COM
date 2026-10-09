-- Vault ledger. vault_balance_cents is integer cents, the 14.3% share of each
-- captured invoice. It is not a dollar amount and not a flat credit.
-- Writes go through credit_vault_invoice, granted to the service role only.

create table public.vault_ledgers (
  payer_key text primary key,
  vault_balance_cents bigint not null default 0 check (vault_balance_cents >= 0)
);

create table public.vault_invoice_credits (
  invoice_id text primary key,
  payer_key text not null references public.vault_ledgers (payer_key),
  vault_cents bigint not null check (vault_cents >= 0)
);

alter table public.vault_ledgers enable row level security;
alter table public.vault_invoice_credits enable row level security;

revoke all on table public.vault_ledgers from public, anon, authenticated;
revoke all on table public.vault_invoice_credits from public, anon, authenticated;
grant select, insert, update on table public.vault_ledgers to service_role;
grant select, insert on table public.vault_invoice_credits to service_role;

create or replace function public.credit_vault_invoice(
  p_payer_key text,
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
  if p_payer_key is null or length(trim(p_payer_key)) = 0 then
    raise exception 'payer_key is required';
  end if;
  if p_invoice_id is null or length(trim(p_invoice_id)) = 0 then
    raise exception 'invoice_id is required';
  end if;
  if p_vault_cents is null or p_vault_cents < 0 then
    raise exception 'vault cents must be a non-negative integer';
  end if;

  insert into public.vault_ledgers (payer_key)
  values (p_payer_key)
  on conflict (payer_key) do nothing;

  insert into public.vault_invoice_credits (invoice_id, payer_key, vault_cents)
  values (p_invoice_id, p_payer_key, p_vault_cents)
  on conflict (invoice_id) do nothing;

  get diagnostics v_inserted = row_count;

  if v_inserted = 0 then
    select ledger.vault_balance_cents
      into v_balance
    from public.vault_invoice_credits as credit
    join public.vault_ledgers as ledger
      on ledger.payer_key = credit.payer_key
    where credit.invoice_id = p_invoice_id;

    return jsonb_build_object(
      'already_credited', true,
      'vault_balance_cents', v_balance
    );
  end if;

  update public.vault_ledgers
  set vault_balance_cents = vault_balance_cents + p_vault_cents
  where payer_key = p_payer_key
  returning vault_balance_cents into v_balance;

  return jsonb_build_object(
    'already_credited', false,
    'vault_balance_cents', v_balance
  );
end;
$$;

revoke all on function public.credit_vault_invoice(text, text, bigint) from public, anon, authenticated;
grant execute on function public.credit_vault_invoice(text, text, bigint) to service_role;
