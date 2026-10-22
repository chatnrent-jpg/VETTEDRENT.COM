-- Stay photos belong to an agreement. The file lives in the private
-- stay-photos bucket. The agreement stores the object path only.

alter table public.agreements
  add column if not exists face_photo_path text,
  add column if not exists id_photo_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('stay-photos', 'stay-photos', false, 1500000, array['image/jpeg'])
on conflict (id) do nothing;
