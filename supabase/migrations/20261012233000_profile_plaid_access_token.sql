-- Server-only Plaid access token for the signed-in profile.
-- underwriting_approved already exists; this script adds it again only if an
-- older database is missing that flag. The access token is not readable by
-- the browser role. A select * from an authenticated session must not include it.

alter table public.profiles
  add column if not exists underwriting_approved boolean,
  add column if not exists plaid_access_token text;

revoke select (plaid_access_token) on table public.profiles from public, anon, authenticated;
grant select (plaid_access_token), update (plaid_access_token) on table public.profiles to service_role;
