-- Restore API access for marketplace buyer demands and related trading data.
-- This migration is additive and does not execute automatically.

grant usage on schema public to authenticated;

-- Buyer demand CRUD used by the dashboard and marketplace.
grant select, insert, update on table public.buyer_requirements to authenticated;

-- Marketplace participation also reads or writes these existing trading tables.
grant select, insert, update on table public.produce_listings to authenticated;
grant select, insert on table public.conversations to authenticated;
grant select, insert on table public.conversation_members to authenticated;
grant select, insert on table public.messages to authenticated;
grant select, insert, update on table public.offers to authenticated;

-- Authenticated users may read active demands. Owners retain access to all of
-- their own demands, including drafts and closed records.
drop policy if exists "Authenticated users read active requirements" on public.buyer_requirements;
create policy "Authenticated users read active requirements"
  on public.buyer_requirements for select to authenticated
  using (status = 'active');

-- Allow an authenticated farmer to open a conversation for an active buyer demand.
drop policy if exists "Users create demand conversations" on public.conversations;
create policy "Users create demand conversations"
  on public.conversations for insert to authenticated
  with check (
    created_by = auth.uid()
    and exists (
      select 1
      from public.buyer_requirements r
      where r.id = requirement_id
        and r.status = 'active'
        and r.owner_id <> auth.uid()
    )
  );
