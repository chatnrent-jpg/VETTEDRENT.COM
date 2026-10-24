-- ---------------------------------------------------------------------------
-- Payroll Disconnect Webhook & GMF Backstop Routing Schema
-- Tables: active_licenses, gmf_float_balance, payroll_webhook_logs
-- Atomic RPC: process_payroll_disconnect_backstop
-- ---------------------------------------------------------------------------

create table if not exists public.active_licenses (
  license_id text primary key,
  agreement_id text,
  tenant_id text not null,
  host_id text not null,
  host_stripe_account_id text,
  payroll_item_id text not null,
  status text not null default 'Active' check (
    status in ('Active', 'Warning', 'License_Revoked')
  ),
  weekly_rate_cents bigint not null default 24500 check (weekly_rate_cents > 0),
  backstop_cap_cents bigint not null default 30000 check (backstop_cap_cents >= 0),
  seam_access_code_id text,
  revoked_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists active_licenses_payroll_item_id_idx
  on public.active_licenses (payroll_item_id);

create table if not exists public.gmf_float_balance (
  pool_id text primary key default 'primary_gmf_pool',
  available_balance_cents bigint not null default 1500000 check (available_balance_cents >= 0),
  reserved_backstop_cents bigint not null default 0 check (reserved_backstop_cents >= 0),
  total_routed_cents bigint not null default 0 check (total_routed_cents >= 0),
  updated_at timestamptz not null default now()
);

insert into public.gmf_float_balance (pool_id, available_balance_cents, reserved_backstop_cents, total_routed_cents)
values ('primary_gmf_pool', 1500000, 0, 0)
on conflict (pool_id) do nothing;

create table if not exists public.payroll_webhook_logs (
  webhook_event_id text primary key,
  payroll_item_id text not null,
  license_id text,
  signal_type text not null,
  status text not null check (status in ('processing', 'processed', 'failed')),
  backstop_routed_cents bigint not null default 0 check (backstop_routed_cents >= 0),
  payload jsonb not null default '{}'::jsonb,
  error_detail text,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

alter table public.active_licenses enable row level security;
alter table public.gmf_float_balance enable row level security;
alter table public.payroll_webhook_logs enable row level security;

revoke all on table public.active_licenses from public, anon, authenticated;
revoke all on table public.gmf_float_balance from public, anon, authenticated;
revoke all on table public.payroll_webhook_logs from public, anon, authenticated;

grant select, insert, update on table public.active_licenses to service_role;
grant select, insert, update on table public.gmf_float_balance to service_role;
grant select, insert, update on table public.payroll_webhook_logs to service_role;

create or replace function public.process_payroll_disconnect_backstop(
  p_webhook_event_id text,
  p_payroll_item_id text,
  p_license_id text,
  p_signal_type text,
  p_requested_backstop_cents bigint,
  p_payload jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing_log public.payroll_webhook_logs%rowtype;
  v_license public.active_licenses%rowtype;
  v_pool public.gmf_float_balance%rowtype;
  v_payout_cents bigint;
  v_Remaining_pool_cents bigint;
begin
  if p_webhook_event_id is null or length(trim(p_webhook_event_id)) = 0 then
    raise exception 'webhook_event_id is required';
  end if;
  if p_payroll_item_id is null or length(trim(p_payroll_item_id)) = 0 then
    raise exception 'payroll_item_id is required';
  end if;

  -- 1. Idempotency lock on payroll_webhook_logs
  select *
    into v_existing_log
  from public.payroll_webhook_logs
  where webhook_event_id = trim(p_webhook_event_id)
  for update;

  if found and v_existing_log.status = 'processed' then
    return jsonb_build_object(
      'already_processed', true,
      'webhook_event_id', v_existing_log.webhook_event_id,
      'license_id', v_existing_log.license_id,
      'status', 'License_Revoked',
      'backstop_routed_cents', v_existing_log.backstop_routed_cents
    );
  end if;

  insert into public.payroll_webhook_logs (
    webhook_event_id,
    payroll_item_id,
    license_id,
    signal_type,
    status,
    payload
  ) values (
    trim(p_webhook_event_id),
    trim(p_payroll_item_id),
    nullif(trim(coalesce(p_license_id, '')), ''),
    coalesce(nullif(trim(p_signal_type), ''), 'PAYROLL_DISCONNECTED'),
    'processing',
    coalesce(p_payload, '{}'::jsonb)
  )
  on conflict (webhook_event_id) do update
  set status = 'processing',
      error_detail = null;

  -- 2. Lock target row in active_licenses (by license_id or payroll_item_id)
  if p_license_id is not null and length(trim(p_license_id)) > 0 then
    select *
      into v_license
    from public.active_licenses
    where license_id = trim(p_license_id)
    for update;
  else
    select *
      into v_license
    from public.active_licenses
    where payroll_item_id = trim(p_payroll_item_id)
    order by updated_at desc
    limit 1
    for update;
  end if;

  if not found then
    update public.payroll_webhook_logs
    set status = 'failed',
        error_detail = 'license_not_found'
    where webhook_event_id = trim(p_webhook_event_id);
    raise exception 'active license not found for payroll disconnect signal';
  end if;

  -- 3. Lock the GMF float pool row
  select *
    into v_pool
  from public.gmf_float_balance
  where pool_id = 'primary_gmf_pool'
  for update;

  if not found then
    raise exception 'gmf_float_balance primary_gmf_pool not initialized';
  end if;

  -- 4. Temperance: bound backstop draw to [0, min(backstop_cap_cents, available_balance_cents)]
  if v_license.status = 'License_Revoked' then
    v_payout_cents := 0;
  else
    v_payout_cents := coalesce(p_requested_backstop_cents, v_license.weekly_rate_cents, 24500);
    if v_payout_cents < 0 then
      raise exception 'requested backstop cents cannot be negative';
    end if;
    if v_payout_cents > v_license.backstop_cap_cents then
      v_payout_cents := v_license.backstop_cap_cents;
    end if;
    if v_payout_cents > v_pool.available_balance_cents then
      raise exception 'insufficient gmf_float_balance to cover backstop draw';
    end if;
  end if;

  -- 5. Flip active_licenses state to License_Revoked
  update public.active_licenses
  set status = 'License_Revoked',
      revoked_at = coalesce(revoked_at, now()),
      updated_at = now()
  where license_id = v_license.license_id;

  -- Sync linked agreements row if present
  if v_license.agreement_id is not null then
    update public.agreements
    set status = 'terminated',
        payment_status = 'delinquent',
        risk_level = 'critical',
        last_failed_payment_at = now()
    where id = v_license.agreement_id;
  end if;

  -- 6. Debit gmf_float_balance and credit total_routed_cents
  update public.gmf_float_balance
  set available_balance_cents = available_balance_cents - v_payout_cents,
      total_routed_cents = total_routed_cents + v_payout_cents,
      updated_at = now()
  where pool_id = 'primary_gmf_pool'
  returning available_balance_cents into v_Remaining_pool_cents;

  -- 7. Mark payroll_webhook_logs as processed
  update public.payroll_webhook_logs
  set license_id = v_license.license_id,
      status = 'processed',
      backstop_routed_cents = v_payout_cents,
      processed_at = now()
  where webhook_event_id = trim(p_webhook_event_id);

  return jsonb_build_object(
    'already_processed', false,
    'webhook_event_id', trim(p_webhook_event_id),
    'license_id', v_license.license_id,
    'agreement_id', v_license.agreement_id,
    'host_id', v_license.host_id,
    'host_stripe_account_id', v_license.host_stripe_account_id,
    'seam_access_code_id', v_license.seam_access_code_id,
    'status', 'License_Revoked',
    'backstop_routed_cents', v_payout_cents,
    'gmf_available_balance_cents', v_Remaining_pool_cents
  );
end;
$$;

revoke all on function public.process_payroll_disconnect_backstop(text, text, text, text, bigint, jsonb)
  from public, anon, authenticated;
grant execute on function public.process_payroll_disconnect_backstop(text, text, text, text, bigint, jsonb)
  to service_role;

notify pgrst, 'reload schema';
