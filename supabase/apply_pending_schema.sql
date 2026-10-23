-- Pending VettedRent schema. Safe to run again in the Supabase SQL Editor.
-- The editor runs the whole file in one transaction. A later error rolls
-- every earlier change back, so each risky statement is inside a DO block
-- that reports a notice and continues. Nothing is dropped. Existing rows stay.
-- profiles.phone already exists and is left in place.
-- subscription_warnings is created only when the table is absent.
-- credit_agreement_vault also creates its invoice table and increment_vault_balance.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS plaid_access_token text;

do $$
begin
  execute 'revoke select (plaid_access_token) on table public.profiles from public, anon, authenticated';
  execute 'grant select (plaid_access_token), update (plaid_access_token) on table public.profiles to service_role';
exception when others then
  raise notice 'plaid_access_token privileges skipped: %', sqlerrm;
end $$;

-- ---------------------------------------------------------------------------
-- Listing rates. Integer cents. 24500 is $245.00.
-- ---------------------------------------------------------------------------

alter table public.listings
  add column if not exists title text,
  add column if not exists host_id text,
  add column if not exists seam_device_id text;

alter table public.listings
  add column if not exists weekly_price_cents integer;

alter table public.listings
  add column if not exists weekly_rate_cents integer not null default 24500;

alter table public.listings
  add column if not exists stripe_host_account_id text;

alter table public.agreements
  add column if not exists listing_id text;

do $$
begin
  update public.listings
  set weekly_price_cents = null
  where weekly_price_cents is not null
    and weekly_price_cents <= 0;

  alter table public.listings
    drop constraint if exists listings_weekly_price_cents_check;

  alter table public.listings
    add constraint listings_weekly_price_cents_check
    check (weekly_price_cents is null or weekly_price_cents > 0);
exception when others then
  raise notice 'listings weekly_price_cents check skipped: %', sqlerrm;
end $$;

do $$
begin
  update public.listings
  set weekly_rate_cents = 24500
  where weekly_rate_cents is null
    or weekly_rate_cents <= 0;

  alter table public.listings
    alter column weekly_rate_cents set default 24500;

  alter table public.listings
    alter column weekly_rate_cents set not null;

  alter table public.listings
    drop constraint if exists listings_weekly_rate_cents_check;

  alter table public.listings
    add constraint listings_weekly_rate_cents_check
    check (weekly_rate_cents > 0);
exception when others then
  raise notice 'listings weekly_rate_cents check skipped: %', sqlerrm;
end $$;

do $$
declare
  host_text text;
  host_type text;
begin
  select users.id::text
    into host_text
  from auth.users as users
  where lower(users.email) = 'chatnrent@gmail.com'
  order by users.id
  limit 1;

  if host_text is null then
    raise notice 'chatnrent@gmail.com was not found. Listing upsert skipped.';
    return;
  end if;

  select columns.data_type
    into host_type
  from information_schema.columns as columns
  where columns.table_schema = 'public'
    and columns.table_name = 'listings'
    and columns.column_name = 'host_id';

  if host_type = 'uuid' then
    insert into public.listings (id, title, host_id, seam_device_id, weekly_price_cents, weekly_rate_cents)
    values ('vr-weekly-room', 'VettedRent Weekly Room', host_text::uuid, null, 24500, 24500)
    on conflict (id) do update
    set title = excluded.title,
        host_id = excluded.host_id,
        weekly_price_cents = excluded.weekly_price_cents,
        weekly_rate_cents = excluded.weekly_rate_cents;
  else
    insert into public.listings (id, title, host_id, seam_device_id, weekly_price_cents, weekly_rate_cents)
    values ('vr-weekly-room', 'VettedRent Weekly Room', host_text, null, 24500, 24500)
    on conflict (id) do update
    set title = excluded.title,
        host_id = excluded.host_id,
        weekly_price_cents = excluded.weekly_price_cents,
        weekly_rate_cents = excluded.weekly_rate_cents;
  end if;
exception when others then
  raise notice 'listing upsert skipped: %', sqlerrm;
end $$;

update public.agreements
set listing_id = 'vr-weekly-room'
where listing_id is null
  and exists (
    select 1
    from public.listings
    where id = 'vr-weekly-room'
  );

-- ---------------------------------------------------------------------------
-- Stay photos. The agreement stores the object path. The file is private.
-- ---------------------------------------------------------------------------

alter table public.agreements
  add column if not exists face_photo_path text,
  add column if not exists id_photo_path text;

do $$
begin
  begin
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('stay-photos', 'stay-photos', false, 1500000, array['image/jpeg']::text[])
    on conflict (id) do nothing;
  exception
    when undefined_column or undefined_table then
      begin
        insert into storage.buckets (id, name, public)
        values ('stay-photos', 'stay-photos', false)
        on conflict (id) do nothing;
      exception when others then
        raise notice 'stay-photos bucket skipped: %', sqlerrm;
      end;
    when others then
      raise notice 'stay-photos bucket skipped: %', sqlerrm;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- Warning audit on the agreement, used by the payment-failed webhook.
-- ---------------------------------------------------------------------------

alter table public.agreements
  add column if not exists last_warning_event_id text;

-- ---------------------------------------------------------------------------
-- Vault ledger. vault_balance_cents is integer cents, the 14.3% share.
-- credit_vault_invoice is the only write path.
-- ---------------------------------------------------------------------------

create table if not exists public.vault_ledgers (
  payer_key text primary key,
  vault_balance_cents bigint not null default 0 check (vault_balance_cents >= 0)
);

create table if not exists public.vault_invoice_credits (
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

-- ---------------------------------------------------------------------------
-- Durable Stripe webhook claim, plus the warning-count helpers.
-- ---------------------------------------------------------------------------

create table if not exists public.stripe_webhook_events (
  event_id text primary key,
  event_type text not null,
  status text not null check (status in ('processing', 'processed', 'failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.subscription_warnings (
  subscription_id text primary key,
  warning_count integer not null default 0 check (warning_count >= 0 and warning_count <= 3),
  last_event_id text,
  agreement_id text,
  customer text,
  amount_due bigint check (amount_due is null or amount_due >= 0),
  updated_at timestamptz not null default now()
);

alter table public.stripe_webhook_events enable row level security;
alter table public.subscription_warnings enable row level security;

revoke all on table public.stripe_webhook_events from public, anon, authenticated;
revoke all on table public.subscription_warnings from public, anon, authenticated;

grant select, insert, update on table public.stripe_webhook_events to service_role;
grant select, insert, update on table public.subscription_warnings to service_role;

create or replace function public.claim_stripe_webhook_event(
  p_event_id text,
  p_event_type text
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_updated timestamptz;
  v_inserted integer;
begin
  if p_event_id is null or length(trim(p_event_id)) = 0 then
    raise exception 'event_id is required';
  end if;
  if p_event_type is null or length(trim(p_event_type)) = 0 then
    raise exception 'event_type is required';
  end if;

  insert into public.stripe_webhook_events (event_id, event_type, status)
  values (trim(p_event_id), trim(p_event_type), 'processing')
  on conflict (event_id) do nothing;

  get diagnostics v_inserted = row_count;
  if v_inserted = 1 then
    return 'claimed';
  end if;

  select status, updated_at
    into v_status, v_updated
  from public.stripe_webhook_events
  where event_id = trim(p_event_id)
  for update;

  if v_status = 'processed' then
    return 'duplicate';
  end if;

  if v_status = 'failed'
     or (v_status = 'processing' and v_updated < now() - interval '2 minutes') then
    update public.stripe_webhook_events
    set status = 'processing',
        event_type = trim(p_event_type),
        updated_at = now()
    where event_id = trim(p_event_id);
    return 'claimed';
  end if;

  return 'in_progress';
end;
$$;

create or replace function public.complete_stripe_webhook_event(
  p_event_id text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_event_id is null or length(trim(p_event_id)) = 0 then
    raise exception 'event_id is required';
  end if;

  update public.stripe_webhook_events
  set status = 'processed',
      updated_at = now()
  where event_id = trim(p_event_id)
    and status = 'processing';
end;
$$;

create or replace function public.fail_stripe_webhook_event(
  p_event_id text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_event_id is null or length(trim(p_event_id)) = 0 then
    raise exception 'event_id is required';
  end if;

  update public.stripe_webhook_events
  set status = 'failed',
      updated_at = now()
  where event_id = trim(p_event_id)
    and status = 'processing';
end;
$$;

create or replace function public.save_subscription_warning(
  p_subscription_id text,
  p_event_id text,
  p_expected_count integer,
  p_warning_count integer,
  p_agreement_id text,
  p_customer text,
  p_amount_due bigint
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public.subscription_warnings%rowtype;
  v_count integer;
begin
  if p_subscription_id is null or length(trim(p_subscription_id)) = 0 then
    raise exception 'subscription_id is required';
  end if;
  if p_event_id is null or length(trim(p_event_id)) = 0 then
    raise exception 'event_id is required';
  end if;
  if p_expected_count is null or p_expected_count < 0 or p_expected_count > 3 then
    raise exception 'warning_count is out of range';
  end if;
  if p_warning_count is null or p_warning_count < 0 or p_warning_count > 3 then
    raise exception 'warning_count is out of range';
  end if;
  if p_amount_due is not null and p_amount_due < 0 then
    raise exception 'amount_due must be a non-negative integer';
  end if;

  select *
    into v_existing
  from public.subscription_warnings
  where subscription_id = trim(p_subscription_id)
  for update;

  if found and v_existing.last_event_id = trim(p_event_id) then
    return jsonb_build_object(
      'already_applied', true,
      'warning_count', v_existing.warning_count
    );
  end if;

  if found and v_existing.warning_count <> p_expected_count then
    raise exception 'warning count conflict';
  end if;

  insert into public.subscription_warnings (
    subscription_id,
    warning_count,
    last_event_id,
    agreement_id,
    customer,
    amount_due,
    updated_at
  ) values (
    trim(p_subscription_id),
    p_warning_count,
    trim(p_event_id),
    nullif(trim(coalesce(p_agreement_id, '')), ''),
    nullif(trim(coalesce(p_customer, '')), ''),
    p_amount_due,
    now()
  )
  on conflict (subscription_id) do update
  set warning_count = excluded.warning_count,
      last_event_id = excluded.last_event_id,
      agreement_id = coalesce(excluded.agreement_id, public.subscription_warnings.agreement_id),
      customer = coalesce(excluded.customer, public.subscription_warnings.customer),
      amount_due = coalesce(excluded.amount_due, public.subscription_warnings.amount_due),
      updated_at = now()
  returning warning_count into v_count;

  return jsonb_build_object(
    'already_applied', false,
    'warning_count', v_count
  );
end;
$$;

revoke all on function public.claim_stripe_webhook_event(text, text) from public, anon, authenticated;
revoke all on function public.complete_stripe_webhook_event(text) from public, anon, authenticated;
revoke all on function public.fail_stripe_webhook_event(text) from public, anon, authenticated;
revoke all on function public.save_subscription_warning(text, text, integer, integer, text, text, bigint) from public, anon, authenticated;

grant execute on function public.claim_stripe_webhook_event(text, text) to service_role;
grant execute on function public.complete_stripe_webhook_event(text) to service_role;
grant execute on function public.fail_stripe_webhook_event(text) to service_role;
grant execute on function public.save_subscription_warning(text, text, integer, integer, text, text, bigint) to service_role;

-- ---------------------------------------------------------------------------
-- Agreement escrow. One credit per Stripe invoice, then the agreement balance.
-- ---------------------------------------------------------------------------

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

revoke all on function public.increment_vault_balance(text, bigint) from public, anon, authenticated;
revoke all on function public.credit_agreement_vault(text, text, bigint) from public, anon, authenticated;
grant execute on function public.increment_vault_balance(text, bigint) to service_role;
grant execute on function public.credit_agreement_vault(text, text, bigint) to service_role;

notify pgrst, 'reload schema';
