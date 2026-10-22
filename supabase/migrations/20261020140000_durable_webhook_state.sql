-- Move Stripe webhook dedupe and subscription warning counts out of process memory.
-- A restart or a second server must see the same event once and the same warning count.
-- Adds missing columns only. Does not drop existing columns.

alter table public.agreements
  add column if not exists last_warning_event_id text;

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

-- Returns claimed, duplicate, or in_progress.
-- A failed row, or a processing row older than 2 minutes, can be claimed again.
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

-- Stores the warning row for one subscription. The same Stripe event does not change the count again.
-- p_expected_count must match the stored count, or the call raises so the webhook can retry.
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
