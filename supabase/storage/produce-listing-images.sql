-- Review and run manually in the Supabase SQL editor.
-- This creates a public bucket so listing image paths can be rendered with
-- Supabase getPublicUrl(). It does not change application tables or auth.

insert into storage.buckets (id, name, public)
values ('produce-listing-images', 'produce-listing-images', true)
on conflict (id) do update set public = excluded.public;

create policy "Public can read produce listing images"
on storage.objects for select
to anon, authenticated
using (bucket_id = 'produce-listing-images');

create policy "Users can upload images in their own folder"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'produce-listing-images'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

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

create policy "Users can delete images in their own folder"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'produce-listing-images'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);
