create extension if not exists pgcrypto;

create type public.user_role as enum ('farmer', 'buyer');
create type public.listing_status as enum ('draft', 'active', 'paused', 'fulfilled', 'withdrawn', 'expired');
create type public.requirement_status as enum ('draft', 'active', 'paused', 'fulfilled', 'withdrawn', 'expired');
create type public.offer_status as enum ('pending', 'accepted', 'rejected', 'withdrawn', 'countered');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 120),
  role public.user_role not null default 'buyer',
  preferred_workspace public.user_role,
  state text,
  district text,
  village text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.produce_listings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  produce_name text not null check (char_length(produce_name) between 1 and 120),
  variety text,
  quantity numeric(14,3) not null check (quantity > 0),
  unit text not null check (char_length(unit) between 1 and 30),
  min_price_per_unit numeric(14,2) not null check (min_price_per_unit >= 0),
  asking_price_per_unit numeric(14,2) check (asking_price_per_unit is null or asking_price_per_unit >= min_price_per_unit),
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
  check (listing_id is not null or requirement_id is not null)
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
  listing_id uuid not null references public.produce_listings(id) on delete cascade,
  buyer_id uuid not null references public.profiles(id) on delete cascade,
  seller_id uuid not null references public.profiles(id) on delete cascade,
  quantity numeric(14,3) not null check (quantity > 0),
  price_per_unit numeric(14,2) not null check (price_per_unit >= 0),
  unit text not null check (char_length(unit) between 1 and 30),
  status public.offer_status not null default 'pending',
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (buyer_id <> seller_id)
);

create index produce_listings_active_idx on public.produce_listings (status, produce_name, harvest_date);
create index produce_listings_owner_idx on public.produce_listings (owner_id);
create index buyer_requirements_owner_idx on public.buyer_requirements (owner_id);
create index buyer_requirements_active_idx on public.buyer_requirements (status, produce_name, required_by);
create index conversation_members_user_idx on public.conversation_members (user_id);
create index messages_conversation_created_idx on public.messages (conversation_id, created_at);
create index offers_listing_idx on public.offers (listing_id, status);

create or replace function public.set_updated_at()
returns trigger language plpgsql security invoker set search_path = public
as $$ begin new.updated_at = now(); return new; end $$;

create trigger profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger produce_listings_updated_at before update on public.produce_listings for each row execute function public.set_updated_at();
create trigger buyer_requirements_updated_at before update on public.buyer_requirements for each row execute function public.set_updated_at();
create trigger conversations_updated_at before update on public.conversations for each row execute function public.set_updated_at();
create trigger offers_updated_at before update on public.offers for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, role, preferred_workspace)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), split_part(new.email, '@', 1), 'FairHarvest user'),
    case when new.raw_user_meta_data ->> 'role' = 'farmer' then 'farmer'::public.user_role else 'buyer'::public.user_role end,
    case when new.raw_user_meta_data ->> 'preferred_workspace' = 'farmer' then 'farmer'::public.user_role
         when new.raw_user_meta_data ->> 'preferred_workspace' = 'buyer' then 'buyer'::public.user_role else null end
  );
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create or replace function public.is_conversation_member(target uuid)
returns boolean language sql security definer stable set search_path = public
as $$ select exists (select 1 from public.conversation_members where conversation_id = target and user_id = auth.uid()) $$;

create or replace function public.validate_offer()
returns trigger language plpgsql security invoker set search_path = public
as $$
declare listing_owner uuid;
begin
  select owner_id into listing_owner from public.produce_listings where id = new.listing_id;
  if listing_owner is null or listing_owner <> new.seller_id or new.buyer_id = new.seller_id then
    raise exception 'Offer parties do not match the listing';
  end if;
  if exists (select 1 from public.conversations c where c.id = new.conversation_id and c.listing_id is distinct from new.listing_id) then
    raise exception 'Offer conversation does not match the listing';
  end if;
  if tg_op = 'UPDATE' and (new.listing_id <> old.listing_id or new.buyer_id <> old.buyer_id or new.seller_id <> old.seller_id or new.conversation_id <> old.conversation_id) then
    raise exception 'Offer ownership fields cannot change';
  end if;
  return new;
end $$;

create trigger validate_offer before insert or update on public.offers for each row execute function public.validate_offer();

create or replace function public.add_conversation_creator()
returns trigger language plpgsql security definer set search_path = public
as $$ begin insert into public.conversation_members (conversation_id, user_id) values (new.id, new.created_by); return new; end $$;

create trigger conversation_creator after insert on public.conversations for each row execute function public.add_conversation_creator();

alter table public.profiles enable row level security;
alter table public.produce_listings enable row level security;
alter table public.buyer_requirements enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;
alter table public.offers enable row level security;

create policy "Profiles are readable by authenticated users" on public.profiles for select to authenticated using (true);
create policy "Users manage their own profile" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy "Active listings are public" on public.produce_listings for select to anon, authenticated using (status = 'active' or owner_id = auth.uid());
create policy "Owners create listings" on public.produce_listings for insert to authenticated with check (owner_id = auth.uid());
create policy "Owners update listings" on public.produce_listings for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "Owners delete listings" on public.produce_listings for delete to authenticated using (owner_id = auth.uid());

create policy "Owners read requirements" on public.buyer_requirements for select to authenticated using (owner_id = auth.uid());
create policy "Owners create requirements" on public.buyer_requirements for insert to authenticated with check (owner_id = auth.uid());
create policy "Owners update requirements" on public.buyer_requirements for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "Owners delete requirements" on public.buyer_requirements for delete to authenticated using (owner_id = auth.uid());

create policy "Members read conversations" on public.conversations for select to authenticated using (public.is_conversation_member(id));
create policy "Users create relevant conversations" on public.conversations for insert to authenticated with check (
  created_by = auth.uid() and (
    exists (select 1 from public.produce_listings l where l.id = listing_id and l.status = 'active')
    or exists (select 1 from public.buyer_requirements r where r.id = requirement_id and r.owner_id = auth.uid())
  )
);
create policy "Members read memberships" on public.conversation_members for select to authenticated using (public.is_conversation_member(conversation_id) or user_id = auth.uid());
create policy "Relevant users join conversations" on public.conversation_members for insert to authenticated with check (
  user_id = auth.uid() and exists (
    select 1 from public.conversations c
    left join public.produce_listings l on l.id = c.listing_id
    left join public.buyer_requirements r on r.id = c.requirement_id
    where c.id = conversation_id and (c.created_by = auth.uid() or l.owner_id = auth.uid() or r.owner_id = auth.uid())
  )
);
create policy "Members read messages" on public.messages for select to authenticated using (public.is_conversation_member(conversation_id));
create policy "Members send messages" on public.messages for insert to authenticated with check (public.is_conversation_member(conversation_id) and sender_id = auth.uid());

create policy "Participants read offers" on public.offers for select to authenticated using (public.is_conversation_member(conversation_id));
create policy "Buyers create offers" on public.offers for insert to authenticated with check (
  buyer_id = auth.uid() and public.is_conversation_member(conversation_id)
  and exists (select 1 from public.produce_listings l where l.id = listing_id and l.owner_id = seller_id)
);
create policy "Participants update offers" on public.offers for update to authenticated using (public.is_conversation_member(conversation_id)) with check (public.is_conversation_member(conversation_id));
