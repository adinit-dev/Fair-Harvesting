-- Review and run manually in the Supabase SQL editor.
-- This creates a public bucket so listing image paths can be rendered with
-- Supabase getPublicUrl(). It does not change application tables or auth.

insert into storage.buckets (id, name, public)
values ('produce-listing-images', 'produce-listing-images', true)
on conflict (id) do update set public = excluded.public,
  file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];
update storage.buckets
set file_size_limit = 5242880,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
where id = 'produce-listing-images';

drop policy if exists "Public can read produce listing images" on storage.objects;
create policy "Public can read produce listing images"
on storage.objects for select
to anon, authenticated
using (bucket_id = 'produce-listing-images');

drop policy if exists "Users can upload images in their own folder" on storage.objects;
create policy "Users can upload images in their own folder"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'produce-listing-images'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

drop policy if exists "Users can replace images in their own folder" on storage.objects;
create policy "Users can replace images in their own folder"
on storage.objects for update
to authenticated
using (
  bucket_id = 'produce-listing-images'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
)
with check (
  bucket_id = 'produce-listing-images'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

drop policy if exists "Users can delete images in their own folder" on storage.objects;
create policy "Users can delete images in their own folder"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'produce-listing-images'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);
