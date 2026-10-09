-- The billing route inserts a new agreement after Stripe creates the subscription.
-- Earlier migrations granted select and update only.

grant insert on table public.agreements to service_role;
