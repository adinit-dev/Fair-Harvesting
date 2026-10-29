-- Marketplace demand offers and participant-safe messaging extensions.
-- Run this migration manually in Supabase when ready; it is not executed by this app.

alter table public.offers
  add column if not exists requirement_id uuid references public.buyer_requirements(id) on delete cascade;

alter table public.offers alter column listing_id drop not null;

alter table public.offers
  drop constraint if exists offers_target_check,
  add constraint offers_target_check check (
    (listing_id is not null and requirement_id is null) or
    (listing_id is null and requirement_id is not null)
  );

create unique index if not exists conversations_listing_participants_uidx
  on public.conversations (listing_id, created_by)
  where listing_id is not null;
create unique index if not exists conversations_requirement_participants_uidx
  on public.conversations (requirement_id, created_by)
  where requirement_id is not null;
create index if not exists offers_requirement_idx on public.offers (requirement_id, status);
create index if not exists conversations_updated_idx on public.conversations (updated_at desc);

create or replace function public.validate_offer()
returns trigger language plpgsql security invoker set search_path = public
as $$
declare
  listing_owner uuid;
  requirement_owner uuid;
begin
  if new.listing_id is not null then
    select owner_id into listing_owner from public.produce_listings where id = new.listing_id;
    if listing_owner is null or listing_owner <> new.seller_id or new.buyer_id = new.seller_id then
      raise exception 'Offer parties do not match the listing';
    end if;
    if exists (select 1 from public.conversations c where c.id = new.conversation_id and c.listing_id is distinct from new.listing_id) then
      raise exception 'Offer conversation does not match the listing';
    end if;
  elsif new.requirement_id is not null then
    select owner_id into requirement_owner from public.buyer_requirements where id = new.requirement_id;
    if requirement_owner is null or requirement_owner <> new.buyer_id or new.buyer_id = new.seller_id then
      raise exception 'Offer parties do not match the buyer demand';
    end if;
    if exists (select 1 from public.conversations c where c.id = new.conversation_id and c.requirement_id is distinct from new.requirement_id) then
      raise exception 'Offer conversation does not match the buyer demand';
    end if;
  else
    raise exception 'An offer must reference a listing or buyer demand';
  end if;

  if tg_op = 'UPDATE' and (
    new.listing_id is distinct from old.listing_id or
    new.requirement_id is distinct from old.requirement_id or
    new.buyer_id <> old.buyer_id or new.seller_id <> old.seller_id or
    new.conversation_id <> old.conversation_id
  ) then
    raise exception 'Offer ownership fields cannot change';
  end if;
  return new;
end $$;

-- Active buyer demands are visible to authenticated farmers/procurement users.
-- Buyer-owned demands remain available through the owner's broader requirement policy.
drop policy if exists "Authenticated users read active requirements" on public.buyer_requirements;
create policy "Authenticated users read active requirements"
  on public.buyer_requirements for select to authenticated
  using (status = 'active');

-- Offer updates are restricted to the recipient: listing seller or demand buyer.
drop policy if exists "Participants update offers" on public.offers;
create policy "Participants update offers"
  on public.offers for update to authenticated
  using (
    public.is_conversation_member(conversation_id)
    and (
      (listing_id is not null and seller_id = auth.uid()) or
      (requirement_id is not null and buyer_id = auth.uid())
    )
  )
  with check (
    public.is_conversation_member(conversation_id)
    and (
      (listing_id is not null and seller_id = auth.uid()) or
      (requirement_id is not null and buyer_id = auth.uid())
    )
  );

drop policy if exists "Farmers create demand offers" on public.offers;
create policy "Farmers create demand offers"
  on public.offers for insert to authenticated
  with check (
    seller_id = auth.uid()
    and public.is_conversation_member(conversation_id)
    and requirement_id is not null
    and exists (
      select 1 from public.buyer_requirements r
      where r.id = requirement_id and r.owner_id = buyer_id and r.status = 'active'
    )
    and exists (
      select 1 from public.conversations c
      where c.id = conversation_id and c.created_by = auth.uid()
    )
  );

-- Existing offer-withdrawals can be made by the sender without changing parties.
drop policy if exists "Senders withdraw offers" on public.offers;
create policy "Senders withdraw offers"
  on public.offers for update to authenticated
  using (
    public.is_conversation_member(conversation_id)
    and (
      (listing_id is not null and buyer_id = auth.uid()) or
      (requirement_id is not null and seller_id = auth.uid())
    )
  )
  with check (
    public.is_conversation_member(conversation_id)
    and status = 'withdrawn'
  );
