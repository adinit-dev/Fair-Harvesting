-- FairHarvest fresh public-schema setup.
-- Run this script only against a disposable/fresh FairHarvest database.
-- It does not drop or recreate auth.users.
--
-- Objects dropped/recreated:
--   public.offers
--   public.messages
--   public.conversation_members
--   public.conversations
--   public.buyer_requirements
--   public.produce_listings
--   public.profiles
--   public.is_conversation_member(uuid)
--   public.validate_offer()
--   public.set_updated_at()
--   public.handle_new_user()
--   public.sync_profile_email()
--   public.add_conversation_creator()
--   public.user_role, public.listing_status, public.requirement_status,
--   public.offer_status
--   public.on_auth_user_created and public.on_auth_user_updated triggers
--
-- Existing auth.users rows are preserved. Recreating public.profiles may cause
-- profile data to be rebuilt from auth.users metadata; use only for a
-- disposable presentation database as requested.

begin;

-- Remove application triggers from auth.users without touching auth.users.
drop trigger if exists on_auth_user_created on auth.users;
drop trigger if exists on_auth_user_updated on auth.users;

-- Drop dependent application objects in dependency order.
drop table if exists public.offers cascade;
drop table if exists public.messages cascade;
drop table if exists public.conversation_members cascade;
drop table if exists public.conversations cascade;
drop table if exists public.buyer_requirements cascade;
drop table if exists public.produce_listings cascade;
drop table if exists public.profiles cascade;

drop function if exists public.is_conversation_member(uuid);
drop function if exists public.validate_offer();
drop function if exists public.add_conversation_creator();
drop function if exists public.handle_new_user();
drop function if exists public.sync_profile_email();
drop function if exists public.set_updated_at();

drop type if exists public.offer_status cascade;
drop type if exists public.requirement_status cascade;
drop type if exists public.listing_status cascade;
drop type if exists public.user_role cascade;

create type public.user_role as enum ('farmer', 'buyer');
create type public.listing_status as enum ('draft', 'active', 'paused', 'fulfilled', 'withdrawn', 'expired');
create type public.requirement_status as enum ('draft', 'active', 'paused', 'fulfilled', 'withdrawn', 'expired');
create type public.offer_status as enum ('pending', 'accepted', 'rejected', 'withdrawn', 'countered');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 120),
  full_name text not null default '',
  email text,
  account_type text not null default 'both' check (account_type in ('farmer', 'buyer', 'both')),
  location text,
  avatar_url text,
  role public.user_role not null default 'farmer',
  preferred_workspace public.user_role,
  state text,
  district text,
  village text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Preserve existing authenticated accounts when rebuilding public data.
insert into public.profiles (
  id, display_name, full_name, email, account_type, location, role, preferred_workspace
)
select
  u.id,
  coalesce(
    nullif(u.raw_user_meta_data ->> 'full_name', ''),
    nullif(u.raw_user_meta_data ->> 'display_name', ''),
    split_part(coalesce(u.email, ''), '@', 1),
    'FairHarvest user'
  ),
  coalesce(
    nullif(u.raw_user_meta_data ->> 'full_name', ''),
    nullif(u.raw_user_meta_data ->> 'display_name', ''),
    split_part(coalesce(u.email, ''), '@', 1),
    'FairHarvest user'
  ),
  u.email,
  case
    when u.raw_user_meta_data ->> 'account_type' in ('farmer', 'buyer', 'both')
      then u.raw_user_meta_data ->> 'account_type'
    else 'both'
  end,
  nullif(u.raw_user_meta_data ->> 'location', ''),
  case
    when u.raw_user_meta_data ->> 'account_type' = 'buyer'
      then 'buyer'::public.user_role
    else 'farmer'::public.user_role
  end,
  case
    when u.raw_user_meta_data ->> 'preferred_workspace' = 'buyer'
      then 'buyer'::public.user_role
    else 'farmer'::public.user_role
  end
from auth.users u;

create table public.produce_listings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  produce_name text not null check (char_length(produce_name) between 1 and 120),
  variety text,
  quantity numeric(14,3) not null check (quantity > 0),
  unit text not null check (char_length(unit) between 1 and 30),
  min_price_per_unit numeric(14,2) not null check (min_price_per_unit >= 0),
  asking_price_per_unit numeric(14,2)
    check (asking_price_per_unit is null or asking_price_per_unit >= min_price_per_unit),
  state text,
  district text,
  village text,
  harvest_date date not null,
  available_from date not null default current_date,
  available_until date,
  quality_grade text,
  storage_conditions text,
  image_paths text[] not null default '{}',
  delivery_preference text,
  status public.listing_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (available_until is null or available_until >= available_from)
);

create table public.buyer_requirements (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  produce_name text not null check (char_length(produce_name) between 1 and 120),
  variety text,
  quantity numeric(14,3) not null check (quantity > 0),
  unit text not null check (char_length(unit) between 1 and 30),
  budget_per_unit numeric(14,2) not null check (budget_per_unit >= 0),
  quality_requirements text,
  destination text not null,
  required_by date,
  delivery_preference text,
  status public.requirement_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  listing_id uuid references public.produce_listings(id) on delete set null,
  requirement_id uuid references public.buyer_requirements(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (listing_id is not null or requirement_id is not null),
  check (not (listing_id is not null and requirement_id is not null))
);

create table public.conversation_members (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 5000),
  created_at timestamptz not null default now(),
  check (sender_id = auth.uid())
);

create table public.offers (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  listing_id uuid references public.produce_listings(id) on delete cascade,
  requirement_id uuid references public.buyer_requirements(id) on delete cascade,
  buyer_id uuid not null references public.profiles(id) on delete cascade,
  seller_id uuid not null references public.profiles(id) on delete cascade,
  quantity numeric(14,3) not null check (quantity > 0),
  price_per_unit numeric(14,2) not null check (price_per_unit >= 0),
  unit text not null check (char_length(unit) between 1 and 30),
  status public.offer_status not null default 'pending',
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (buyer_id <> seller_id),
  check (
    (listing_id is not null and requirement_id is null)
    or (listing_id is null and requirement_id is not null)
  )
);

create view public.public_profiles
with (security_invoker = true)
as select id, display_name from public.profiles;

create index produce_listings_active_idx
  on public.produce_listings (status, produce_name, harvest_date);
create index produce_listings_owner_idx
  on public.produce_listings (owner_id);
create index buyer_requirements_owner_idx
  on public.buyer_requirements (owner_id);
create index buyer_requirements_active_idx
  on public.buyer_requirements (status, produce_name, required_by);
create index conversation_members_user_idx
  on public.conversation_members (user_id);
create index messages_conversation_created_idx
  on public.messages (conversation_id, created_at);
create index offers_listing_idx
  on public.offers (listing_id, status);
create index offers_requirement_idx
  on public.offers (requirement_id, status);
create index conversations_updated_idx
  on public.conversations (updated_at desc);
create unique index conversations_listing_participant_uidx
  on public.conversations (listing_id, created_by)
  where listing_id is not null;
create unique index conversations_requirement_participant_uidx
  on public.conversations (requirement_id, created_by)
  where requirement_id is not null;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger produce_listings_updated_at
before update on public.produce_listings
for each row execute function public.set_updated_at();

create trigger buyer_requirements_updated_at
before update on public.buyer_requirements
for each row execute function public.set_updated_at();

create trigger conversations_updated_at
before update on public.conversations
for each row execute function public.set_updated_at();

create trigger offers_updated_at
before update on public.offers
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  requested_account text := coalesce(nullif(new.raw_user_meta_data ->> 'account_type', ''), 'both');
  display_name_value text := coalesce(
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(new.raw_user_meta_data ->> 'display_name', ''),
    split_part(coalesce(new.email, ''), '@', 1),
    'FairHarvest user'
  );
begin
  if requested_account not in ('farmer', 'buyer', 'both') then
    requested_account := 'both';
  end if;

  insert into public.profiles (
    id, display_name, full_name, email, account_type, location, role, preferred_workspace
  )
  values (
    new.id,
    display_name_value,
    display_name_value,
    new.email,
    requested_account,
    nullif(new.raw_user_meta_data ->> 'location', ''),
    case when requested_account = 'buyer' then 'buyer'::public.user_role else 'farmer'::public.user_role end,
    case when requested_account = 'buyer' then 'buyer'::public.user_role else 'farmer'::public.user_role end
  )
  on conflict (id) do update set
    email = excluded.email,
    display_name = coalesce(nullif(public.profiles.display_name, ''), excluded.display_name),
    full_name = coalesce(nullif(public.profiles.full_name, ''), excluded.full_name),
    account_type = coalesce(public.profiles.account_type, excluded.account_type),
    location = coalesce(public.profiles.location, excluded.location);
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.sync_profile_email()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_updated
after update of email on auth.users
for each row execute function public.sync_profile_email();

create or replace function public.is_conversation_member(target uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.conversation_members
    where conversation_id = target
      and user_id = auth.uid()
  );
$$;

alter function public.is_conversation_member(uuid) owner to postgres;

create or replace function public.validate_offer()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  listing_owner uuid;
  listing_state public.listing_status;
  requirement_owner uuid;
  requirement_state public.requirement_status;
begin
  if tg_op = 'INSERT' and new.status is distinct from 'pending' then
    raise exception 'New offers must start in pending status';
  end if;

  if new.listing_id is not null and new.requirement_id is null then
    select owner_id, status into listing_owner, listing_state
    from public.produce_listings where id = new.listing_id;
    if listing_owner is null or listing_owner <> new.seller_id or new.buyer_id = new.seller_id then
      raise exception 'Offer parties do not match the listing';
    end if;
    if tg_op = 'INSERT' and listing_state <> 'active' then
      raise exception 'Offers can be created only for active listings';
    end if;
    if not exists (
      select 1 from public.conversations
      where id = new.conversation_id and listing_id = new.listing_id
    ) then
      raise exception 'Offer conversation does not match the listing';
    end if;
  elsif new.listing_id is null and new.requirement_id is not null then
    select owner_id, status into requirement_owner, requirement_state
    from public.buyer_requirements where id = new.requirement_id;
    if requirement_owner is null or requirement_owner <> new.buyer_id or new.buyer_id = new.seller_id then
      raise exception 'Offer parties do not match the buyer demand';
    end if;
    if tg_op = 'INSERT' and requirement_state <> 'active' then
      raise exception 'Offers can be created only for active buyer demands';
    end if;
    if not exists (
      select 1 from public.conversations
      where id = new.conversation_id and requirement_id = new.requirement_id
    ) then
      raise exception 'Offer conversation does not match the buyer demand';
    end if;
  else
    raise exception 'An offer must reference exactly one listing or buyer demand';
  end if;

  if tg_op = 'UPDATE' and (
    new.id is distinct from old.id
    or new.created_at is distinct from old.created_at
    or new.listing_id is distinct from old.listing_id
    or new.requirement_id is distinct from old.requirement_id
    or new.buyer_id is distinct from old.buyer_id
    or new.seller_id is distinct from old.seller_id
    or new.conversation_id is distinct from old.conversation_id
  ) then
    raise exception 'Offer ownership fields cannot change';
  end if;

  if tg_op = 'UPDATE' and (
    new.quantity is distinct from old.quantity
    or new.price_per_unit is distinct from old.price_per_unit
    or new.unit is distinct from old.unit
    or new.note is distinct from old.note
  ) and not (
    (
      (new.listing_id is not null and auth.uid() = new.seller_id)
      or (new.requirement_id is not null and auth.uid() = new.buyer_id)
    )
    and old.status in ('pending', 'countered')
    and new.status = 'countered'
  ) then
    raise exception 'Offer terms can change only through a recipient counteroffer';
  end if;

  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    if new.status = 'withdrawn' then
      if not (
        (new.listing_id is not null and auth.uid() = new.buyer_id)
        or (new.requirement_id is not null and auth.uid() = new.seller_id)
      )
      or old.status not in ('pending', 'countered') then
        raise exception 'Only the offer sender can withdraw it';
      end if;
    elsif not (
      (
        (new.listing_id is not null and auth.uid() = new.seller_id)
        or (new.requirement_id is not null and auth.uid() = new.buyer_id)
      )
      and old.status in ('pending', 'countered')
      and new.status in ('accepted', 'rejected', 'countered')
    ) then
      raise exception 'Invalid offer status transition';
    end if;
  end if;
  return new;
end;
$$;

create trigger validate_offer
before insert or update on public.offers
for each row execute function public.validate_offer();

create or replace function public.add_conversation_creator()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  insert into public.conversation_members (conversation_id, user_id)
  values (new.id, new.created_by)
  on conflict (conversation_id, user_id) do nothing;
  return new;
end;
$$;

alter function public.add_conversation_creator() owner to postgres;

create trigger conversation_creator
after insert on public.conversations
for each row execute function public.add_conversation_creator();

alter table public.profiles enable row level security;
alter table public.produce_listings enable row level security;
alter table public.buyer_requirements enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;
alter table public.offers enable row level security;

create policy "Users read own profile"
on public.profiles for select to authenticated using (
  id = auth.uid()
);

create policy "Users update own profiles"
on public.profiles for update to authenticated
using (id = auth.uid()) with check (id = auth.uid());

create policy "Active listings are public"
on public.produce_listings for select to anon, authenticated
using (status = 'active' or owner_id = auth.uid());

create policy "Owners create listings"
on public.produce_listings for insert to authenticated
with check (owner_id = auth.uid());

create policy "Owners update listings"
on public.produce_listings for update to authenticated
using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy "Owners delete listings"
on public.produce_listings for delete to authenticated
using (owner_id = auth.uid());

create policy "Owners read requirements"
on public.buyer_requirements for select to authenticated
using (owner_id = auth.uid());

create policy "Authenticated users read active requirements"
on public.buyer_requirements for select to authenticated
using (status = 'active');

create policy "Owners create requirements"
on public.buyer_requirements for insert to authenticated
with check (owner_id = auth.uid());

create policy "Owners update requirements"
on public.buyer_requirements for update to authenticated
using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy "Owners delete requirements"
on public.buyer_requirements for delete to authenticated
using (owner_id = auth.uid());

create policy "Members read conversations"
on public.conversations for select to authenticated
using (public.is_conversation_member(id));

create policy "Users create relevant conversations"
on public.conversations for insert to authenticated
with check (
  created_by = auth.uid()
  and (
    exists (
      select 1 from public.produce_listings
      where id = listing_id and status = 'active' and owner_id <> auth.uid()
    )
    or exists (
      select 1 from public.buyer_requirements
      where id = requirement_id and status = 'active' and owner_id <> auth.uid()
    )
  )
);

create policy "Members read memberships"
on public.conversation_members for select to authenticated
using (user_id = auth.uid() or public.is_conversation_member(conversation_id));

create policy "Relevant users join conversations"
on public.conversation_members for insert to authenticated
with check (
  exists (
    select 1
    from public.conversations c
    left join public.produce_listings l on l.id = c.listing_id
    left join public.buyer_requirements r on r.id = c.requirement_id
    where c.id = conversation_id
      and (
        c.created_by = auth.uid()
        or l.owner_id = auth.uid()
        or r.owner_id = auth.uid()
      )
      and (
        user_id = auth.uid()
        or user_id = l.owner_id
        or user_id = r.owner_id
      )
  )
);

create policy "Members read messages"
on public.messages for select to authenticated
using (public.is_conversation_member(conversation_id));

create policy "Members send messages"
on public.messages for insert to authenticated
with check (
  sender_id = auth.uid()
  and public.is_conversation_member(conversation_id)
);

create policy "Participants read offers"
on public.offers for select to authenticated
using (public.is_conversation_member(conversation_id));

create policy "Buyers create offers"
on public.offers for insert to authenticated
with check (
  listing_id is not null
  and requirement_id is null
  and buyer_id = auth.uid()
  and public.is_conversation_member(conversation_id)
  and exists (
    select 1 from public.produce_listings
    where id = listing_id and owner_id = seller_id and status = 'active'
  )
  and exists (
    select 1 from public.conversations
    where id = conversation_id and listing_id = offers.listing_id
      and created_by = auth.uid()
  )
);

create policy "Farmers create demand offers"
on public.offers for insert to authenticated
with check (
  listing_id is null
  and requirement_id is not null
  and seller_id = auth.uid()
  and public.is_conversation_member(conversation_id)
  and exists (
    select 1 from public.buyer_requirements
    where id = requirement_id and owner_id = buyer_id and status = 'active'
  )
  and exists (
    select 1 from public.conversations
    where id = conversation_id and requirement_id = offers.requirement_id
      and created_by = auth.uid()
  )
);

create policy "Recipients update offers"
on public.offers for update to authenticated
using (
  public.is_conversation_member(conversation_id)
  and (
    (listing_id is not null and seller_id = auth.uid())
    or (requirement_id is not null and buyer_id = auth.uid())
  )
)
with check (
  public.is_conversation_member(conversation_id)
  and (
    (listing_id is not null and seller_id = auth.uid())
    or (requirement_id is not null and buyer_id = auth.uid())
  )
);

create policy "Senders withdraw offers"
on public.offers for update to authenticated
using (
  public.is_conversation_member(conversation_id)
  and (
    (listing_id is not null and buyer_id = auth.uid())
    or (requirement_id is not null and seller_id = auth.uid())
  )
)
with check (
  public.is_conversation_member(conversation_id)
  and status = 'withdrawn'
);

-- Explicit grants are separate from RLS and are limited to used operations.
grant usage on schema public to anon, authenticated;
grant select on public.produce_listings to anon;
grant select on public.profiles to authenticated;
grant select on public.public_profiles to anon, authenticated;
grant select, insert, update, delete on public.produce_listings to authenticated;
grant select, insert, update, delete on public.buyer_requirements to authenticated;
grant select, insert on public.conversations to authenticated;
grant select, insert on public.conversation_members to authenticated;
grant select, insert on public.messages to authenticated;
grant select, insert, update on public.offers to authenticated;
revoke update on public.profiles from authenticated;
grant update (display_name, full_name, location, avatar_url, preferred_workspace)
on public.profiles to authenticated;
revoke insert, update, delete on public.profiles from authenticated;
grant update (display_name, full_name, location, avatar_url, preferred_workspace)
on public.profiles to authenticated;

-- Listing photos are used by src/lib/data.js.
insert into storage.buckets (id, name, public)
values ('produce-listing-images', 'produce-listing-images', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "Public listing images are readable" on storage.objects;
drop policy if exists "Authenticated users upload listing images" on storage.objects;
drop policy if exists "Owners update listing images" on storage.objects;
drop policy if exists "Owners delete listing images" on storage.objects;

create policy "Public listing images are readable"
on storage.objects for select to anon, authenticated
using (bucket_id = 'produce-listing-images');

create policy "Authenticated users upload listing images"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'produce-listing-images'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy "Owners update listing images"
on storage.objects for update to authenticated
using (
  bucket_id = 'produce-listing-images'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
)
with check (
  bucket_id = 'produce-listing-images'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy "Owners delete listing images"
on storage.objects for delete to authenticated
using (
  bucket_id = 'produce-listing-images'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

revoke execute on function public.is_conversation_member(uuid) from public;
grant execute on function public.is_conversation_member(uuid) to authenticated;

commit;

-- Verification queries. Run these after the transaction completes.
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'profiles', 'produce_listings', 'buyer_requirements',
    'conversations', 'conversation_members', 'messages', 'offers'
  )
order by table_name;

select relname, relrowsecurity
from pg_class
where relnamespace = 'public'::regnamespace
  and relname in (
    'profiles', 'produce_listings', 'buyer_requirements',
    'conversations', 'conversation_members', 'messages', 'offers'
  )
order by relname;

select schemaname, tablename, policyname, roles, cmd
from pg_policies
where schemaname = 'public'
  and tablename in (
    'profiles', 'produce_listings', 'buyer_requirements',
    'conversations', 'conversation_members', 'messages', 'offers'
  )
order by tablename, policyname;

select grantee, table_schema, table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon', 'authenticated')
  and table_name in (
    'profiles', 'produce_listings', 'buyer_requirements',
    'conversations', 'conversation_members', 'messages', 'offers'
  )
order by grantee, table_name, privilege_type;
