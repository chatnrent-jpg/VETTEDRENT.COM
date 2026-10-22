-- Lodger phone for transactional warning SMS. E.164, for example +12025550123.
-- Adds missing columns only. Does not drop existing columns.

alter table public.profiles
  add column if not exists phone text;
