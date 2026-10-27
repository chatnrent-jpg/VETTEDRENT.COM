-- DRAFT FOR REVIEW. Not applied to any database.
--
-- Public listing catalog: lets real properties replace the sample stays on the
-- home page. It only ADDS columns, one table, one trigger, and one storage bucket.
-- It does not drop, rewrite, or delete anything, and it inserts no listings.
-- Existing rows (for example vr-weekly-room) stay as they are and stay unpublished.
--
-- Design rules, matching the existing migrations:
--   * listings stays private: RLS on, no access for anon or authenticated.
--     The public site reads it through the server (service role) and must send
--     only a safe projection: title, tier, city, county, ZIP, price, photos,
--     features. Never host_id, seam_device_id, or Stripe ids.
--   * Nothing is public until is_published = true, and the database refuses to
--     publish a listing that is incomplete (see the trigger below).
--   * Photos live in a separate public-read bucket. Guest ID and face photos stay
--     in the private stay-photos bucket. Never mix them.
--   * No street address is stored here. Exact addresses are shared after booking.

-- ---------------------------------------------------------------------------
-- 1. Listing details
-- ---------------------------------------------------------------------------

alter table public.listings
  add column if not exists tier text,
  add column if not exists city text,
  add column if not exists county_slug text,
  add column if not exists zip_code text,
  add column if not exists description text,
  add column if not exists features text[] not null default '{}',
  add column if not exists ideal_for text,
  add column if not exists is_published boolean not null default false,
  add column if not exists published_at timestamptz;

alter table public.listings
  drop constraint if exists listings_tier_check;
alter table public.listings
  add constraint listings_tier_check
  check (tier is null or tier in ('RoomSanctuary', 'PrivateSuite', 'ExecutiveTownhome'));

-- County slug must match the keys in lib/seo-registry.ts (23 counties + Baltimore City).
alter table public.listings
  drop constraint if exists listings_county_slug_check;
alter table public.listings
  add constraint listings_county_slug_check
  check (
    county_slug is null or county_slug in (
      'prince-georges', 'montgomery', 'baltimore-city', 'baltimore-county',
      'anne-arundel', 'howard', 'frederick', 'harford', 'charles', 'st-marys',
      'calvert', 'carroll', 'washington', 'wicomico', 'cecil', 'worcester',
      'allegany', 'talbot', 'queen-annes', 'dorchester', 'caroline', 'kent',
      'somerset', 'garrett'
    )
  );

-- Maryland ZIP codes run 20601 to 21930.
alter table public.listings
  drop constraint if exists listings_zip_code_check;
alter table public.listings
  add constraint listings_zip_code_check
  check (
    zip_code is null or
    case when zip_code ~ '^\d{5}$' then zip_code::int between 20601 and 21930 else false end
  );

alter table public.listings
  drop constraint if exists listings_description_length_check;
alter table public.listings
  add constraint listings_description_length_check
  check (description is null or char_length(description) <= 2000);

create index if not exists listings_published_tier_idx
  on public.listings (tier)
  where is_published;

create index if not exists listings_published_county_idx
  on public.listings (county_slug)
  where is_published;

-- ---------------------------------------------------------------------------
-- 2. Listing photos (ordered; sort_order 0 is the cover photo, max 12 per listing)
-- ---------------------------------------------------------------------------

create table if not exists public.listing_photos (
  id uuid primary key default gen_random_uuid(),
  listing_id text not null references public.listings (id) on delete cascade,
  storage_path text not null,
  caption text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint listing_photos_sort_order_check check (sort_order >= 0 and sort_order < 12),
  constraint listing_photos_caption_check check (caption is null or char_length(caption) <= 160),
  constraint listing_photos_path_check check (storage_path ~ '^[A-Za-z0-9_./-]{1,200}$'),
  constraint listing_photos_listing_path_key unique (listing_id, storage_path),
  -- Deferred so a reorder can swap positions inside one transaction.
  constraint listing_photos_listing_sort_key unique (listing_id, sort_order)
    deferrable initially deferred
);

create index if not exists listing_photos_listing_idx
  on public.listing_photos (listing_id, sort_order);

alter table public.listing_photos enable row level security;
revoke all on table public.listing_photos from public, anon, authenticated;
grant select, insert, update, delete on table public.listing_photos to service_role;

-- ---------------------------------------------------------------------------
-- 3. Publish guard: the database refuses to publish an incomplete listing.
--    Price limits mirror lib/daily-rate-comparison.ts (weekly cents):
--      RoomSanctuary 31500-63000, PrivateSuite 52500-84000,
--      ExecutiveTownhome 74500-126000.
-- ---------------------------------------------------------------------------

create or replace function public.enforce_listing_publishable()
returns trigger
language plpgsql
as $$
declare
  min_cents integer;
  max_cents integer;
begin
  if new.is_published is not true then
    new.published_at := null;
    return new;
  end if;

  if new.tier is null
     or new.county_slug is null
     or new.zip_code is null
     or new.city is null or btrim(new.city) = ''
     or new.title is null or btrim(new.title) = '' then
    raise exception 'listing % cannot be published: tier, title, city, county, and ZIP are required', new.id
      using errcode = '23514';
  end if;

  case new.tier
    when 'RoomSanctuary' then min_cents := 31500; max_cents := 63000;
    when 'PrivateSuite' then min_cents := 52500; max_cents := 84000;
    else min_cents := 74500; max_cents := 126000;
  end case;

  if new.weekly_rate_cents is null
     or new.weekly_rate_cents < min_cents
     or new.weekly_rate_cents > max_cents then
    raise exception 'listing % cannot be published: weekly rate must be between % and % cents for %',
      new.id, min_cents, max_cents, new.tier
      using errcode = '23514';
  end if;

  if not exists (select 1 from public.listing_photos where listing_id = new.id) then
    raise exception 'listing % cannot be published: at least one photo is required', new.id
      using errcode = '23514';
  end if;

  -- Unpublishing clears published_at above, so re-publishing stamps a fresh time.
  new.published_at := coalesce(new.published_at, now());
  return new;
end;
$$;

drop trigger if exists listings_enforce_publishable on public.listings;
create trigger listings_enforce_publishable
  before insert or update on public.listings
  for each row execute function public.enforce_listing_publishable();

-- A published listing can never lose its last photo. Deleting the listing itself
-- is still allowed (the listing row is already gone when the photos cascade).
create or replace function public.enforce_listing_keeps_photo()
returns trigger
language plpgsql
as $$
begin
  if exists (
       select 1 from public.listings where id = old.listing_id and is_published
     )
     and not exists (
       select 1 from public.listing_photos
       where listing_id = old.listing_id and id <> old.id
     ) then
    raise exception 'listing % is published and needs at least one photo; unpublish it first', old.listing_id
      using errcode = '23514';
  end if;
  return old;
end;
$$;

drop trigger if exists listing_photos_keep_one on public.listing_photos;
create trigger listing_photos_keep_one
  before delete on public.listing_photos
  for each row execute function public.enforce_listing_keeps_photo();

-- ---------------------------------------------------------------------------
-- 4. Server access to the new columns (service role only, as with other listing columns)
-- ---------------------------------------------------------------------------

do $$
begin
  execute 'grant select, insert, update on table public.listings to service_role';
exception when others then
  raise notice 'listings service_role grant skipped: %', sqlerrm;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Public-read bucket for listing photos. Writes happen only through the server.
--    JPEG or WebP, 5 MB max. Separate from the private stay-photos bucket.
-- ---------------------------------------------------------------------------

do $$
begin
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('listing-photos', 'listing-photos', true, 5242880, array['image/jpeg', 'image/webp'])
  on conflict (id) do nothing;
exception when others then
  raise notice 'listing-photos bucket skipped: %', sqlerrm;
end $$;

-- ---------------------------------------------------------------------------
-- Example for the first real listing (left commented on purpose; fill in real
-- details, upload photos, add listing_photos rows, THEN publish):
--
-- update public.listings
-- set tier = 'PrivateSuite',
--     city = 'Silver Spring',
--     county_slug = 'montgomery',
--     zip_code = '20910',
--     description = '...',
--     features = array['Keyless entry', 'Private bath', 'All utilities'],
--     ideal_for = 'Traveling professionals',
--     weekly_rate_cents = 52500
-- where id = '<listing id>';
--
-- insert into public.listing_photos (listing_id, storage_path, caption, sort_order)
-- values ('<listing id>', '<listing id>/cover.jpg', 'Living area', 0);
--
-- update public.listings set is_published = true where id = '<listing id>';
--
-- ---------------------------------------------------------------------------
-- Rollback (run manually if this draft is applied and must be undone):
--
-- drop trigger if exists listings_enforce_publishable on public.listings;
-- drop table if exists public.listing_photos;
-- drop function if exists public.enforce_listing_keeps_photo();
-- drop function if exists public.enforce_listing_publishable();
-- drop index if exists public.listings_published_tier_idx;
-- drop index if exists public.listings_published_county_idx;
-- alter table public.listings
--   drop column if exists tier, drop column if exists city,
--   drop column if exists county_slug, drop column if exists zip_code,
--   drop column if exists description, drop column if exists features,
--   drop column if exists ideal_for, drop column if exists is_published,
--   drop column if exists published_at;
-- (The listing-photos bucket is left in place; empty and delete it in the dashboard.)
-- ---------------------------------------------------------------------------
