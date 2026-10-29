-- FairHarvest consolidated marketplace and messaging permissions.
-- Additive, idempotent, and safe to rerun. Apply in Supabase SQL Editor only.

create extension if not exists pgcrypto;

-- Requirement offers were added by the earlier marketplace migration. Keep this
-- consolidation safe when that migration has not yet been applied.
alter table public.offers
  add column if not exists requirement_id uuid references public.buyer_requirements(id) on delete cascade;
alter table public.offers alter column listing_id drop not null;

alter table public.offers drop constraint if exists offers_target_check;
alter table public.offers add constraint offers_target_check check (
  (listing_id is not null and requirement_id is null)
  or
  (listing_id is null and requirement_id is not null)
);

-- Supabase API access is granted explicitly to authenticated users only.
grant usage on schema public to authenticated;
grant select on table public.profiles to authenticated;
grant select, insert, update on table public.produce_listings to authenticated;
grant select, insert, update, delete on table public.buyer_requirements to authenticated;
grant select, insert on table public.conversations to authenticated;
grant select, insert on table public.conversation_members to authenticated;
grant select, insert on table public.messages to authenticated;
grant select, insert, update on table public.offers to authenticated;

alter table public.profiles enable row level security;
alter table public.produce_listings enable row level security;
alter table public.buyer_requirements enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;
alter table public.offers enable row level security;

-- Buyer demand privacy: owners can see every state; authenticated marketplace
-- users can see only active demands. An empty application cannot grant anon access.
drop policy if exists "Owners read requirements" on public.buyer_requirements;
create policy "Owners read requirements"
  on public.buyer_requirements for select to authenticated
  using (owner_id = auth.uid());

drop policy if exists "Owners create requirements" on public.buyer_requirements;
create policy "Owners create requirements"
  on public.buyer_requirements for insert to authenticated
  with check (owner_id = auth.uid());

drop policy if exists "Owners update requirements" on public.buyer_requirements;
create policy "Owners update requirements"
  on public.buyer_requirements for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists "Owners delete requirements" on public.buyer_requirements;
create policy "Owners delete requirements"
  on public.buyer_requirements for delete to authenticated
  using (owner_id = auth.uid());

drop policy if exists "Authenticated users read active requirements" on public.buyer_requirements;
drop policy if exists "Active requirements readable by authenticated users" on public.buyer_requirements;
create policy "Authenticated users read active requirements"
  on public.buyer_requirements for select to authenticated
  using (status = 'active');

-- Conversations are visible only to membership rows. Keep this member function
-- SECURITY DEFINER so the two membership policies cannot recurse into each other.
create or replace function public.is_conversation_member(target uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.conversation_members
    where conversation_id = target and user_id = auth.uid()
  )
$$;

-- Conversation creation. Buyers may start conversations for active listings;
-- farmers may start conversations for active requirements not owned by them.
drop policy if exists "Members read conversations" on public.conversations;
drop policy if exists "Users create relevant conversations" on public.conversations;
drop policy if exists "Users create listing conversations" on public.conversations;
drop policy if exists "Users create demand conversations" on public.conversations;
create policy "Members read conversations"
  on public.conversations for select to authenticated
  using (public.is_conversation_member(id));

create policy "Users create relevant conversations"
  on public.conversations for insert to authenticated
  with check (
    created_by = auth.uid()
    and (
      exists (
        select 1 from public.produce_listings l
        where l.id = listing_id and l.status = 'active' and l.owner_id <> auth.uid()
      )
      or exists (
        select 1 from public.buyer_requirements r
        where r.id = requirement_id and r.status = 'active' and r.owner_id <> auth.uid()
      )
    )
  );

-- Membership rows are readable by their members. Conversation creators and the
-- two listing/requirement owners may add a participant. The creator trigger
-- adds the creator itself, so normal conversation creation does not depend on
-- self-inserting through an additional policy.
drop policy if exists "Members read memberships" on public.conversation_members;
drop policy if exists "Relevant users join conversations" on public.conversation_members;
drop policy if exists "Conversation owners add participants" on public.conversation_members;
create policy "Members read memberships"
  on public.conversation_members for select to authenticated
  using (user_id = auth.uid() or public.is_conversation_member(conversation_id));

create policy "Conversation owners add participants"
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
    )
  );

-- Message privacy, sender identity and updates/deletes deliberately denied.
drop policy if exists "Members read messages" on public.messages;
drop policy if exists "Members send messages" on public.messages;
create policy "Members read messages"
  on public.messages for select to authenticated
  using (public.is_conversation_member(conversation_id));

create policy "Members send messages"
  on public.messages for insert to authenticated
  with check (
    sender_id = auth.uid()
    and public.is_conversation_member(conversation_id)
  );

-- Offers remain participant-readable. Listing offers are created by the buyer;
-- demand offers are created by the farmer. Recipients alone may accept/reject.
drop policy if exists "Participants read offers" on public.offers;
drop policy if exists "Buyers create offers" on public.offers;
drop policy if exists "Farmers create demand offers" on public.offers;
drop policy if exists "Participants update offers" on public.offers;
drop policy if exists "Recipients update offers" on public.offers;
drop policy if exists "Senders withdraw offers" on public.offers;
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
      select 1 from public.produce_listings l
      where l.id = listing_id and l.owner_id = seller_id and l.status = 'active'
    )
    and exists (
      select 1 from public.conversations c
      where c.id = conversation_id and c.listing_id = listing_id and c.created_by = auth.uid()
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
      select 1 from public.buyer_requirements r
      where r.id = requirement_id and r.owner_id = buyer_id and r.status = 'active'
    )
    and exists (
      select 1 from public.conversations c
      where c.id = conversation_id and c.requirement_id = requirement_id and c.created_by = auth.uid()
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
    and status in ('accepted', 'rejected', 'countered')
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
    and (
      (listing_id is not null and buyer_id = auth.uid())
      or (requirement_id is not null and seller_id = auth.uid())
    )
  );

-- Server-side validation for either listing offers or demand offers.
create or replace function public.validate_offer()
returns trigger language plpgsql security invoker set search_path = public
as $$
declare
  listing_owner uuid;
  requirement_owner uuid;
begin
  if new.listing_id is not null and new.requirement_id is null then
    select owner_id into listing_owner from public.produce_listings where id = new.listing_id;
    if listing_owner is null or listing_owner <> new.seller_id or new.buyer_id = new.seller_id then
      raise exception 'Offer parties do not match the listing';
    end if;
    if exists (
      select 1 from public.conversations c
      where c.id = new.conversation_id and c.listing_id is distinct from new.listing_id
    ) then
      raise exception 'Offer conversation does not match the listing';
    end if;
  elsif new.listing_id is null and new.requirement_id is not null then
    select owner_id into requirement_owner from public.buyer_requirements where id = new.requirement_id;
    if requirement_owner is null or requirement_owner <> new.buyer_id or new.buyer_id = new.seller_id then
      raise exception 'Offer parties do not match the buyer demand';
    end if;
    if exists (
      select 1 from public.conversations c
      where c.id = new.conversation_id and c.requirement_id is distinct from new.requirement_id
    ) then
      raise exception 'Offer conversation does not match the buyer demand';
    end if;
  else
    raise exception 'An offer must reference exactly one listing or buyer demand';
  end if;

  if tg_op = 'UPDATE' and (
    new.listing_id is distinct from old.listing_id
    or new.requirement_id is distinct from old.requirement_id
    or new.buyer_id <> old.buyer_id
    or new.seller_id <> old.seller_id
    or new.conversation_id <> old.conversation_id
  ) then
    raise exception 'Offer ownership fields cannot change';
  end if;
  return new;
end $$;

