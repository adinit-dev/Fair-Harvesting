alter table public.profiles
  add column if not exists email text,
  add column if not exists full_name text,
  add column if not exists account_type text not null default 'farmer'
    check (account_type in ('farmer', 'buyer', 'both')),
  add column if not exists location text,
  add column if not exists avatar_url text;

update public.profiles p
set email = u.email,
    full_name = coalesce(p.full_name, nullif(p.display_name, ''), split_part(coalesce(u.email, ''), '@', 1), 'FairHarvest user')
from auth.users u
where p.id = u.id;

alter table public.profiles alter column full_name set default '';

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  requested_account text := coalesce(nullif(new.raw_user_meta_data ->> 'account_type', ''), 'farmer');
  display_name text := coalesce(
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(new.raw_user_meta_data ->> 'display_name', ''),
    split_part(coalesce(new.email, ''), '@', 1),
    'FairHarvest user'
  );
begin
  if requested_account not in ('farmer', 'buyer', 'both') then
    requested_account := 'farmer';
  end if;

  insert into public.profiles (
    id, display_name, full_name, email, account_type, location, role, preferred_workspace
  ) values (
    new.id,
    display_name,
    display_name,
    new.email,
    requested_account,
    nullif(new.raw_user_meta_data ->> 'location', ''),
    case
      when requested_account = 'buyer' then 'buyer'::public.user_role
      else 'farmer'::public.user_role
    end,
    case
      when requested_account in ('farmer', 'both') then 'farmer'::public.user_role
      when requested_account = 'buyer' then 'buyer'::public.user_role
      else null
    end
  )
  on conflict (id) do update set
    display_name = coalesce(public.profiles.display_name, excluded.display_name),
    full_name = coalesce(public.profiles.full_name, excluded.full_name),
    email = excluded.email,
    account_type = coalesce(public.profiles.account_type, excluded.account_type),
    location = coalesce(public.profiles.location, excluded.location);
  return new;
end $$;

drop policy if exists "Profiles are readable by authenticated users" on public.profiles;
drop policy if exists "Users read their own profile" on public.profiles;
create policy "Users read their own profile" on public.profiles
  for select to authenticated using (id = auth.uid());

grant select on table public.profiles to authenticated;
revoke update on table public.profiles from authenticated;
grant update (display_name, full_name, location, avatar_url, preferred_workspace) on table public.profiles to authenticated;

create or replace function public.sync_profile_email()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
end $$;

drop trigger if exists on_auth_user_updated on auth.users;
create trigger on_auth_user_updated after update of email on auth.users
  for each row execute function public.sync_profile_email();
