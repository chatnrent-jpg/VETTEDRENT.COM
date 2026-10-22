-- Links a logged corporate placement to the stay it opened.
-- agreement_id matches public.agreements.id, which is text.
-- invoice_group_id is the agency Stripe customer. The travel professional is not the payer.

alter table public.corporate_placements
  add column if not exists agreement_id text references public.agreements (id) on delete set null,
  add column if not exists stripe_subscription_id text,
  add column if not exists seam_access_code_id text,
  add column if not exists invoice_group_id text;
