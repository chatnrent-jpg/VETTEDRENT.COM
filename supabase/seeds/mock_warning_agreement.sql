-- Mock listing and agreement for later local warning-tier tests.
-- Run after migrations. ON CONFLICT (id) DO NOTHING.

insert into public.listings (
  id,
  title,
  seam_device_id,
  host_id
)
values (
  'l1l1l1l1-l1l1-l1l1-l1l1-l1l1l1l1l1l1',
  'VettedRent Test Unit 101',
  'device_mock_lock_123',
  'h1h1h1h1-h1h1-h1h1-h1h1-h1h1h1h1h1h1'
)
on conflict (id) do nothing;

insert into public.agreements (
  id,
  tenant_id,
  host_id,
  listing_id,
  status,
  warning_count,
  vault_balance_cents
)
values (
  'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1',
  't1t1t1t1-t1t1-t1t1-t1t1-t1t1t1t1t1t1',
  'h1h1h1h1-h1h1-h1h1-h1h1-h1h1h1h1h1h1',
  'l1l1l1l1-l1l1-l1l1-l1l1-l1l1l1l1l1l1',
  'active',
  0,
  150000
)
on conflict (id) do nothing;
